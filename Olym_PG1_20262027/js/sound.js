/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   sound.js – zvuková réžia (hudba, prostredie, efekty, hlasy)
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Všetky slučky (hudba knihy a záhrady, vtáky, dážď, potok) sa spustia naraz
 *  potichu a potom sa už len plynulo mení ich hlasitosť – žiadna nahrávka sa
 *  pri prechode medzi scénami nereštartuje. Nálada (mood) určuje, čo znie:
 *    'book'   – klavír knihy,
 *    'garden' – hudba záhrady, vtáky, podľa počasia dážď, pri rieke potok,
 *    'pause'  – tichý klavír, záhrada v diaľke.
 *  Kým hovorí rozprávač alebo postava (nahrávky z nástroja hlasy.py), hudba
 *  a prostredie stíchnu, aby bolo reč dobre počuť.
 *  Prehrávanie zabezpečuje zvukový systém knižnice Phaser (Web Audio).
 * =============================================================================
 */
import { AUDIO } from './config.js';

/** Slučky: názov -> [kľúč nahrávky, druh (hudba/prostredie), základná hlasitosť]. */
const LOOPS = {
    book: [AUDIO.music.book, 'music', AUDIO.volume.music],
    garden: [AUDIO.music.garden, 'music', AUDIO.volume.music * 0.7],
    birds: [AUDIO.ambience.garden, 'sounds', AUDIO.volume.ambience],
    rain: [AUDIO.ambience.rain, 'sounds', AUDIO.volume.rain],
    stream: [AUDIO.ambience.stream, 'sounds', AUDIO.volume.stream]
};
const PIANO_SILENCE = 1.7;   // nahrávka klavíra začína 1,7 s ticha

/**
 * Kreslenie ceruzkou: v slučke sa opakuje len časť nahrávky, kde ceruzka škrabe (koniec
 * nahrávky je tichý – v slučke by bolo počuť výpadok); náhodný začiatok, časová konštanta
 * zmeny hlasitosti a doznenie (všetko v sekundách).
 */
const SCRIBBLE = { from: 0, length: 1.2, seek: 0.6, smooth: 0.04, fade: 0.22 };

/** Nahovorené vety: kľúč zoznamu v pamäti hry (audio/hlas/hlasy.json) a doznenie prerušenej vety (s). */
const VOICES = 'hlasy';
const VOICE_FADE = 0.15;

/** Kým znie reč: hlasitosť hudby a prostredia (podiel) a časová konštanta prechodu (ms). */
const DUCK = { music: 0.35, sounds: 0.6, time: 350 };

export class SoundDirector {
    /** @param {Phaser.Game} game - hra (jej zvukový systém vznikne až pri spustení hry) */
    constructor(game) {
        this.game = game;
        this.enabled = { music: true, sounds: true, voice: true };
        this.loops = {};
        this.mood = 'silent';
        this.weather = 'sun';
        this.stream = 0;
        this.lastStep = -1;
        this.scribbles = new Set();   // práve znejúce kreslenie ceruzkou
        this.speeches = new Set();    // práve znejúce vety
        this.duck = 0;                // 0 = nikto nehovorí, 1 = hudba a prostredie stíšené
        this.lastTick = 0;
        this.tick = this.tick.bind(this);
    }

    /** Zvukový systém knižnice Phaser. */
    get manager() {
        return this.game.sound;
    }

    /** Spustí všetky slučky naraz potichu (po prvom kliknutí, keď prehliadač zvuk povolí). */
    start() {
        if (this.started) {
            return;
        }
        this.started = true;
        for (const [name, [key, kind, base]] of Object.entries(LOOPS)) {
            const sound = this.manager.add(key, { loop: true, volume: 0 });
            sound.play({ seek: name === 'book' ? PIANO_SILENCE : 0 });
            this.loops[name] = { sound, kind, base, level: 0, from: 0, to: 0, start: 0, duration: 0 };
        }
        requestAnimationFrame(this.tick);
    }

    /**
     * Nálada scény: určí cieľové hlasitosti všetkých slučiek a plynule k nim prejde.
     * @param {'book'|'garden'|'pause'|'silent'} mood
     * @param {number} [duration=1500] - trvanie prechodu (ms)
     */
    setMood(mood, duration = 1500) {
        this.mood = mood;
        this.apply(duration);
    }

    /** Počasie mení dážď a spev vtákov. */
    setWeather(weather, duration = 3000) {
        this.weather = weather;
        this.apply(duration);
    }

    /** Hlasitosť potoka 0 až 1 (podľa vzdialenosti kamery od rieky). */
    setStream(level) {
        if (Math.abs(level - this.stream) > 0.02) {
            this.stream = level;
            this.apply(400);
        }
    }

    /** Prepočíta cieľové hlasitosti podľa nálady, počasia a blízkosti rieky. */
    apply(duration) {
        const garden = this.mood === 'garden' ? 1 : this.mood === 'pause' ? 0.18 : 0;
        const rainy = this.weather === 'rain';
        const targets = {
            book: this.mood === 'book' ? 1 : this.mood === 'pause' ? 0.55 : 0,
            garden: garden * (rainy ? 0.6 : 1),
            birds: garden * (rainy ? 0.25 : 1),
            rain: garden * (rainy ? 1 : 0),
            stream: garden * this.stream
        };
        for (const [name, level] of Object.entries(targets)) {
            this.fade(name, level, duration);
        }
    }

    /** Začne plynulú zmenu hlasitosti jednej slučky. */
    fade(name, level, duration) {
        const loop = this.loops[name];
        if (!loop) {
            return;
        }
        Object.assign(loop, { from: loop.level, to: level, start: performance.now(), duration: Math.max(1, duration) });
    }

    /** Ukončí zvukovú réžiu (pred ukončením aplikácie). */
    stop() {
        this.stopped = true;
    }

    /**
     * Každý snímok obrazovky: priebežne mení hlasitosť slučiek (lineárne v čase);
     * kým niekto hovorí, hudba a prostredie plynulo stíchnu.
     */
    tick(now) {
        if (this.stopped) {
            return;
        }
        const delta = Math.min(100, now - (this.lastTick || now));
        this.lastTick = now;
        this.duck += ((this.speeches.size > 0 ? 1 : 0) - this.duck) * Math.min(1, delta / DUCK.time);
        for (const loop of Object.values(this.loops)) {
            const t = Math.min(1, (now - loop.start) / loop.duration);
            loop.level = loop.from + (loop.to - loop.from) * t;
            const duck = 1 - this.duck * (1 - DUCK[loop.kind]);
            loop.sound.setVolume(loop.level * loop.base * duck * (this.enabled[loop.kind] ? 1 : 0));
        }
        requestAnimationFrame(this.tick);
    }

    /**
     * Zvukový efekt (kniha, ceruzka, víťazná melódia).
     * @param {string} name - kľúč z AUDIO.effects
     * @param {number} [volume] - hlasitosť 0 až 1
     * @param {number} [delay=0] - o koľko sekúnd neskôr zaznie (zvuk zosúladený s animáciou)
     */
    effect(name, volume = AUDIO.volume.effect, delay = 0) {
        if (this.enabled.sounds && this.started) {
            this.manager.play(AUDIO.effects[name], { volume, delay: Math.max(0, delay) });   // oneskorenie na hodinách zvuku (s)
        }
    }

    /**
     * Ceruzka alebo pero, ktoré kreslí dlhšie (písanie textu, nápoveda, cesta v cieli):
     * nahrávka ceruzky sa opakuje v slučke a jej hlasitosť nastavuje volajúci podľa toho,
     * ako rýchlo sa hrot práve pohybuje – zvuk tak presne sleduje kreslenie.
     * Slučku hrá priamo Web Audio (zdroj s opakovaním a zosilňovač), lebo herná slučka
     * knižnice Phaser počas scén v knihe spí a jej zvuky by sa po prvom opakovaní zastavili.
     * @param {number} volume - najväčšia hlasitosť 0 až 1
     * @returns {{setLevel: function(number), stop: function()}} ovládač (úroveň 0 až 1, koniec s doznením)
     */
    scribble(volume) {
        if (!this.enabled.sounds || !this.started) {
            return { setLevel() {}, stop() {} };
        }
        const { context, destination } = this.manager;
        const gain = context.createGain();
        gain.gain.value = 0;
        gain.connect(destination);
        const source = context.createBufferSource();
        source.buffer = this.game.cache.audio.get(AUDIO.effects.pencil);
        Object.assign(source, { loop: true, loopStart: SCRIBBLE.from, loopEnd: SCRIBBLE.from + SCRIBBLE.length });
        source.connect(gain);
        source.onended = () => gain.disconnect();
        source.start(0, SCRIBBLE.from + Math.random() * SCRIBBLE.seek);
        let stopped = false;
        const pen = {
            setLevel: level => {
                if (!stopped) {
                    gain.gain.setTargetAtTime(volume * level, context.currentTime, SCRIBBLE.smooth);
                }
            },
            stop: () => {
                if (stopped) {
                    return;
                }
                stopped = true;
                this.scribbles.delete(pen);
                const now = context.currentTime;
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(gain.gain.value, now);
                gain.gain.linearRampToValueAtTime(0, now + SCRIBBLE.fade);
                source.stop(now + SCRIBBLE.fade);
            }
        };
        this.scribbles.add(pen);
        return pen;
    }

    /**
     * Nahrávka vety zo scenára: súbor, dĺžka a čas začiatku každého slova (ms) – podľa nich
     * sa text píše v rytme reči. Bez nahrávky (alebo s vypnutými hlasmi) null.
     * @param {string} text - veta presne ako v scenári (story.js)
     * @returns {{file: string, duration: number, words: number[]}|null}
     */
    voiceOf(text) {
        return (this.enabled.voice && this.started && this.game.cache.json.get(VOICES)?.[text]) || null;
    }

    /**
     * Rozprávač alebo postava povie vetu. Hrá priamo Web Audio (ako ceruzka), takže
     * hlas znie aj v knihe, kde herná slučka spí.
     * @param {string} text - veta zo scenára
     * @returns {{duration: number, words: number[], ended: Promise<void>, stop: function()}|null} null, ak veta nemá nahrávku
     */
    speak(text) {
        const line = this.voiceOf(text);
        if (!line) {
            return null;
        }
        const { context, destination } = this.manager;
        const gain = context.createGain();
        gain.gain.value = AUDIO.volume.voice;
        gain.connect(destination);
        const source = context.createBufferSource();
        source.buffer = this.game.cache.audio.get(`hlas-${line.file}`);
        source.connect(gain);
        source.start();
        const speech = {
            duration: line.duration,
            words: line.words,
            ended: new Promise(resolve => {
                source.onended = () => {
                    gain.disconnect();
                    this.speeches.delete(speech);
                    resolve();
                };
            }),
            stop: () => {
                const now = context.currentTime;
                gain.gain.setTargetAtTime(0, now, VOICE_FADE / 3);
                source.stop(now + VOICE_FADE);
            }
        };
        this.speeches.add(speech);
        return speech;
    }

    /** Doznie kreslenie aj reč, ktoré práve znejú (svet sa zmazal, zastavil alebo začína iná scéna). */
    hush() {
        for (const sound of [...this.scribbles, ...this.speeches]) {
            sound.stop();
        }
    }

    /** Krok po štrku – vždy iná zo štyroch nahrávok ako predchádzajúca. */
    step() {
        if (!this.enabled.sounds || !this.started) {
            return;
        }
        let index = Math.floor(Math.random() * AUDIO.steps.length);
        if (index === this.lastStep) {
            index = (index + 1) % AUDIO.steps.length;
        }
        this.lastStep = index;
        this.manager.play(AUDIO.steps[index], { volume: AUDIO.volume.step * (0.85 + Math.random() * 0.3) });
    }

    /** Zapne alebo vypne hudbu či zvuky (nastavenie v knihe). */
    setEnabled(kind, enabled) {
        this.enabled[kind] = enabled;
    }
}
