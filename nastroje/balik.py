"""Balík na odovzdanie PG1: hra a tri príručky. Mykyta Olym, 2026."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / 'Olym_PG1_20262027'
OUTPUT = ROOT / f'{GAME.name}.zip'
FILES = ['index.html', 'spustit.cmd', 'licencie.txt']
DIRECTORIES = ['js', 'css', 'texture', 'font', 'audio']
MANUALS = ['Pouzivatelska_prirucka.pdf', 'Systemova_prirucka.pdf', 'Zdrojove_texty.pdf']


def main():
    """Overí povinné súbory a vytvorí nezaheslovaný ZIP so zachovanou štruktúrou."""
    files = [GAME / name for name in FILES]
    files += [GAME / 'dokumentacia' / name for name in MANUALS]
    for directory in DIRECTORIES:
        files.extend(path for path in (GAME / directory).rglob('*') if path.is_file())
    for path in files:
        if not path.is_file() or path.stat().st_size == 0:
            raise FileNotFoundError(f'Chýba súbor alebo je prázdny: {path}')
    with ZipFile(OUTPUT, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files):
            archive.write(path, path.relative_to(ROOT))
    with ZipFile(OUTPUT) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('Kontrola ZIP zlyhala.')
    print(f'{OUTPUT.name}: {len(files)} súborov, {OUTPUT.stat().st_size / 1024**2:.1f} MB')


if __name__ == '__main__':
    main()
