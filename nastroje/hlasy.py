"""
Hlasy rozprávača a postáv hry „Záhrada stratených ciest“ (syntéza reči ElevenLabs).

Všetky vety, ktoré v hre zaznejú, sú v scenári ../Olym_PG1_20262027/js/story.js.
Nástroj každú nahovorí hlasom postavy (model eleven_v4 – prirodzená intonácia aj
v slovenčine) a uloží:
 - audio/hlas/<id>.ogg – nahrávku (Ogg Vorbis, zjednotená hlasitosť),
 - audio/hlas/hlasy.json – pre každú vetu súbor, dĺžku a čas začiatku každého slova (ms);
   hra podľa nich píše text v knihe a v bubline presne v rytme reči.
Slová sa delia medzerami ako v hre (book.js, fillWords); čas slova je čas jeho prvého
písmena, ktorý služba vráti spolu so zvukom.

Spustenie: python hlasy.py   (kľúč služby v premennej ELEVENLABS_API_KEY, ffmpeg v premennej FFMPEG)
Autor: Mykyta Olym, 2026
"""
import base64
import json
import os
import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path

GAME = Path(__file__).resolve().parent.parent / 'Olym_PG1_20262027'
OUT = GAME / 'audio' / 'hlas'
FFMPEG = os.environ.get('FFMPEG', str(Path(os.environ.get('LOCALAPPDATA', '')) / 'pg-tools' / 'ffmpeg' / 'bin' / 'ffmpeg.exe'))
API = 'https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128'
MODEL = 'eleven_v4'
LOUDNESS = 'loudnorm=I=-17:TP=-2:LRA=9'   # všetky vety rovnako hlasné (EBU R128)

# Postavy: hlas (štandardné hlasy služby) a tempo reči; stability 0,5 = prirodzený prejav.
ROLES = {
    'rozpravac': {'voice': 'JBFqnCBsd6RMkjVDRZzb', 'speed': 0.95},   # George – vrúcny rozprávač
    'babka': {'voice': 'pFZP5JQG7iQjIQuC4Bku', 'speed': 0.9},        # Lily – zamatový ženský hlas
    'zahradnik': {'voice': 'pqHfZKP75CvOlQylNhV4', 'speed': 1.0},    # Bill – múdry starší muž
    'vnuca': {'voice': 'cgSgspJ2msm6clMCkdW9', 'speed': 1.0},        # Jessica – mladý, živý hlas
}


def story():
    """Scenár hry (objekt STORY z js/story.js) – načíta ho Node.js."""
    script = f"import('{(GAME / 'js' / 'story.js').as_uri()}').then(m => process.stdout.write(JSON.stringify(m.STORY)))"
    output = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, check=True)
    return json.loads(output.stdout.decode('utf-8'))


def lines(s):
    """Všetky vety na nahovorenie: (id súboru, postava, text)."""
    found = [(f'prolog-{i}', 'rozpravac', text) for i, text in enumerate(s['prologue']['paragraphs'])]
    found.append(('titulok', 'rozpravac', f"{s['titleCard']['over']}. {s['titleCard']['main']}."))
    found += [(f'zahradnik-{i}', 'zahradnik', text) for i, text in enumerate(s['gardener']['lines'])]
    found += [(f'spomienka-{i}', 'babka', text) for i, text in enumerate(s['pages'])]
    found.append(('zvazky', 'rozpravac', s['allPages']))
    for kind, texts in s['thoughts'].items():
        found += [(f'myslienka-{kind}-{i}', 'vnuca', text) for i, text in enumerate(texts)]
    for ending in ('complete', 'partial'):
        found += [(f'babka-{ending}-{i}', 'babka', text) for i, text in enumerate(s['grandma'][ending])]
        found += [(f'epilog-{ending}-{i}', 'rozpravac', text) for i, text in enumerate(s['epilogue'][ending])]
    unique = {}
    for line in found:
        unique.setdefault(line[2], line)   # rovnaká veta (napr. rozlúčka babky) sa nahovorí raz
    return list(unique.values())


def synthesize(role, text, path):
    """Nahovorí text do súboru MP3; vráti časy začiatku jednotlivých znakov textu (s)."""
    voice = ROLES[role]
    body = {'text': text, 'model_id': MODEL, 'language_code': 'sk',
            'voice_settings': {'stability': 0.5, 'similarity_boost': 0.8, 'speed': voice['speed']}}
    request = urllib.request.Request(API.format(voice=voice['voice']), data=json.dumps(body).encode('utf-8'), method='POST',
                                     headers={'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request) as response:
        result = json.loads(response.read().decode('utf-8'))
    Path(path).write_bytes(base64.b64decode(result['audio_base64']))
    alignment = result['alignment']
    if ''.join(alignment['characters']) != text:
        raise RuntimeError(f'Časy znakov nesedia s textom: {text}')
    return alignment['character_start_times_seconds']


def word_starts(text, starts):
    """Čas začiatku každého slova (delenie medzerami) v ms – čas jeho prvého znaku."""
    times, position = [], 0
    for word in text.split(' '):
        times.append(round(starts[position] * 1000))
        position += len(word) + 1
    return times


def duration(path):
    """Dĺžka nahrávky v ms."""
    probe = subprocess.run([FFMPEG, '-hide_banner', '-i', str(path)], capture_output=True, text=True, encoding='utf-8').stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', probe).groups()
    return round((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.ogg'):
        old.unlink()
    voices = {}
    with tempfile.TemporaryDirectory() as temp:
        for name, role, text in lines(story()):
            raw = Path(temp) / f'{name}.mp3'
            words = word_starts(text, synthesize(role, text, raw))
            target = OUT / f'{name}.ogg'
            subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', str(raw), '-af', LOUDNESS, '-ar', '48000', '-ac', '1',
                            '-c:a', 'libvorbis', '-q:a', '5', str(target)], check=True)
            voices[text] = {'file': name, 'duration': duration(target), 'words': words}
            print(f'{name:28} {role:10} {voices[text]["duration"] / 1000:5.1f} s')
    (OUT / 'hlasy.json').write_text(json.dumps(voices, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(voices)} viet -> {OUT}')


main()
