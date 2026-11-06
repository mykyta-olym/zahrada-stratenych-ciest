/*
 * Príprava atlasu kresieb pre hru „Záhrada stratených ciest“.
 *
 * Vybrané dlaždice z balíka „city game tileset“ (podklady/city_game_tileset) sa
 * zmenšia na TILE_SCALE (filter Lanczos), zbalia do jedného atlasu
 * (free-tex-packer-core) a každej snímke sa zapíše pivot, aby Phaser nastavil
 * správny bod ukotvenia bez ďalšieho kódu. Z kresieb postáv sa odstránia
 * pomocné čiary mriežky, ktoré zostali v skenoch pôvodného výkresu.
 *
 * Spustenie: npm run atlas   (výstup: ../Olym_PG1_20262027/texture/mesto.png a .json)
 * Autor: Mykyta Olym, 2026
 */
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { packAsync } from 'free-tex-packer-core';
import { TILES, TILE_SCALE, TILE_ANCHOR, CENTERED_TILES, GRID_LINE_TILES } from '../Olym_PG1_20262027/js/config.js';

const SOURCE_DIR = 'podklady/city_game_tileset';
const OUTPUT = '../Olym_PG1_20262027/texture/mesto';
const CANVAS = { width: 382, height: 805 };  // rozmer každej pôvodnej dlaždice
const INK = { dark: 150, halo: 2, gap: 6 };  // jas atramentu obrysu (0–255), šírka ponechaného okraja okolo neho, najväčšia medzera v obryse (px)

/** Všetky názvy dlaždíc z vnorenej štruktúry TILES (reťazce na ľubovoľnej úrovni). */
const collectNames = value => typeof value === 'object' ? Object.values(value).flatMap(collectNames) : [value];
const names = [...new Set(collectNames(TILES).filter(name => typeof name === 'string'))];

/**
 * Odstráni pomocné čiary mriežky a vyplní postavu: od okraja obrázka sa vyplnia
 * (prehľadávanie do šírky) všetky pixely, ktoré nie sú atrament – to je okolie kresby.
 * Obrys je kreslený rukou a má medzery, preto sa najprv vyplní okolie, ktoré je od atramentu
 * ďalej než INK.gap (medzerou neprenikne), a potom sa rozšíri späť až k atramentu. Pixely
 * okolia, ktoré nie sú tesne pri atramente, sa zmenia na priehľadné; vnútro postavy sa vyplní
 * bielou ako papier, aby cez telo nebolo vidno terén.
 */
async function removeGridLines(source) {
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const count = width * height;
    const isInk = i => data[i * 4 + 3] > 60 && (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3 < INK.dark;
    const ink = Uint8Array.from({ length: count }, (_, i) => isInk(i));
    const nearInk = within(ink, width, height, INK.halo);
    const blocked = within(ink, width, height, INK.gap);
    // okolie ďaleko od atramentu, potom späť k atramentu najviac o INK.gap pixelov
    const distance = new Int16Array(count).fill(-1);
    let queue = [];
    for (let i = 0; i < count; i++) {
        const x = i % width;
        const y = (i - x) / width;
        if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && !blocked[i]) {
            queue.push(i);
            distance[i] = 0;
        }
    }
    for (let head = 0; head < queue.length; head++) {
        const pixel = queue[head];
        for (const next of neighbours(pixel, width, count)) {
            const step = blocked[next] ? distance[pixel] + 1 : 0;
            if (distance[next] === -1 && !ink[next] && step <= INK.gap) {
                distance[next] = step;
                queue.push(next);
            }
        }
    }
    for (let i = 0; i < count; i++) {
        if (distance[i] >= 0) {
            if (!nearInk[i]) {
                data[i * 4 + 3] = 0;
            }
        } else if (!ink[i]) {
            data.fill(255, i * 4, i * 4 + 4);   // vnútro postavy – biely papier
        }
    }
    return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Maska pixelov, ktoré sú od niektorého pixela masky najviac radius pixelov (štvorcové okolie). */
function within(mask, width, height, radius) {
    const result = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) {
            continue;
        }
        const x = i % width;
        const y = (i - x) / width;
        for (let ny = Math.max(0, y - radius); ny <= Math.min(height - 1, y + radius); ny++) {
            result.fill(1, ny * width + Math.max(0, x - radius), ny * width + Math.min(width - 1, x + radius) + 1);
        }
    }
    return result;
}

/** Štyria susedia pixela v obrázku danej šírky. */
function neighbours(pixel, width, count) {
    const x = pixel % width;
    return [x > 0 && pixel - 1, x < width - 1 && pixel + 1, pixel >= width && pixel - width, pixel < count - width && pixel + width]
        .filter(next => next !== false);
}

/** Zmenší jednu dlaždicu a vráti obrázok pre baliaci nástroj aj s pivotom. */
async function prepareTile(name) {
    const original = await readFile(`${SOURCE_DIR}/${name}.png`);
    const source = GRID_LINE_TILES.includes(name) ? await removeGridLines(original) : original;
    const contents = await sharp(source)
        .ensureAlpha()
        .resize(Math.round(CANVAS.width * TILE_SCALE), Math.round(CANVAS.height * TILE_SCALE), { kernel: 'lanczos3', fit: 'fill' })
        .png()
        .toBuffer();
    return { path: `${name}.png`, contents, pivot: await pivotOf(name, source) };
}

/** Pivot snímky: spoločný bod ukotvenia, alebo stred kresby pri lietajúcich objektoch. */
async function pivotOf(name, source) {
    if (!CENTERED_TILES.includes(name)) {
        return TILE_ANCHOR;
    }
    const { info } = await sharp(source).trim().toBuffer({ resolveWithObject: true });
    return {
        x: (-info.trimOffsetLeft + info.width / 2) / CANVAS.width,
        y: (-info.trimOffsetTop + info.height / 2) / CANVAS.height
    };
}

const tiles = await Promise.all(names.map(prepareTile));
const files = await packAsync(tiles, {
    textureName: 'mesto',
    width: 4096,
    height: 4096,
    powerOfTwo: true,
    padding: 2,
    allowRotation: false,
    allowTrim: true,
    detectIdentical: false,
    exporter: 'JsonHash',
    removeFileExtension: true,
    prependFolderName: false,
    packer: 'OptimalPacker'
});

for (const file of files) {
    if (file.name.endsWith('.json')) {
        const atlas = JSON.parse(file.buffer.toString());
        for (const tile of tiles) {
            atlas.frames[tile.path.replace('.png', '')].pivot = tile.pivot;
        }
        await writeFile(`${OUTPUT}.json`, JSON.stringify(atlas, null, 1));
    } else {
        await writeFile(`${OUTPUT}.png`, file.buffer);
    }
}
console.log(`Atlas: ${names.length} dlaždíc -> ${OUTPUT}.png / .json (${files.length} súbory)`);
