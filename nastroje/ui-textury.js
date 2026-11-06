/*
 * Príprava textúr knihy a rozhrania hry „Záhrada stratených ciest“.
 *
 *  - kniha a papier: EPIC-Collection book (Melissa Krautheim – MELLE, CC0),
 *    Paper-Textures seamless (Leschge, CC0) – papier kresby sveta,
 *  - stôl: Wood Table 001 (Poly Haven, CC0) – zmenšený a stmavený,
 *  - bublina, kvapka, kurzor, dvojsnímkový vták: hra „Everyone is Afraid to be
 *    Forgotten“ (Cosmo Myzrail Gorynych, CC BY 4.0),
 *  - ručne kreslené značky (políčko, krúžok, fajka, čiara):
 *    Hand Drawn Icon Pack (Limofeus, CC0) – skeny bielej kresby na čiernom sa
 *    prevedú na čierny atrament s priehľadnosťou (jas -> alfa),
 *  - stopa: Footprints (Paulo Moisés, CC0); ikony z city game tileset (CC BY 4.0),
 *  - papier strán: obrázok otvorenej knihy bez krúžkov väzby; tieň knihy na stole.
 *
 * Spustenie: npm run ui   (výstup: ../Olym_PG1_20262027/texture/)
 * Autor: Mykyta Olym, 2026
 */
import { mkdir, copyFile } from 'node:fs/promises';
import sharp from 'sharp';

/** Pás chrbta s krúžkami väzby v obrázku otvorenej knihy (1683 × 1026 px) a farba ich tieňa. */
const RING_AREA = { left: 805, top: 150, width: 100, height: 680 };
const RING_SHADOW = [38, 22, 10];
const SRC = 'podklady';
const TILES = 'podklady/city_game_tileset';
const OUT = '../Olym_PG1_20262027/texture';
const INK = { r: 0x26, g: 0x1d, b: 0x16 };   // farba atramentu ručne kreslených značiek

/**
 * Sken ručnej kresby (biela čiara na čiernom alebo biela čiara s priehľadnosťou)
 * prevedie na tmavý atrament: alfa = jas (príp. pôvodná alfa), farba = INK.
 * Výsledok sa oreže na kresbu a zmenší na danú najväčšiu stranu.
 */
async function inkFromScan(input, output, size) {
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = Buffer.alloc(info.width * info.height * 4);
    for (let i = 0; i < info.width * info.height; i++) {
        const luminance = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
        pixels.set([INK.r, INK.g, INK.b, Math.round(luminance * data[i * 4 + 3] / 255)], i * 4);
    }
    await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
        .trim({ threshold: 10 })
        .resize({ width: size, height: size, fit: 'inside', kernel: 'lanczos3' })
        .png()
        .toFile(output);
}

/**
 * Krúžky väzby oddelené od papiera strán. Z obrázka otvorenej knihy vzniknú dva obrázky:
 *  - strany.png – kniha bez krúžkov: pixely krúžku a jeho tieňa sa nahradia papierom
 *    z rovnakého stĺpca tesne nad nimi (zachová sa zrno papiera aj tieň v chrbte),
 *  - kruzky.png – len pás chrbta: kov krúžkov v pôvodnej farbe a ich tiene a otvory
 *    v papieri ako priesvitná tma (o koľko bol pôvodný pixel tmavší než papier).
 * Strany knihy ležia na strany.png a krúžky sa kreslia nad nimi, takže pokojná kniha
 * vyzerá presne ako pôvodný obrázok a pod krúžkami sa môže otáčať list.
 */
async function splitRings(input, pagesOutput, ringsOutput) {
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const area = RING_AREA;
    const PAD = { x: 3, up: 4, down: 12 };   // okolie krúžku; tieň krúžku padá na papier pod ním
    const at = (x, y) => (y * width + x) * 4;
    const isMetal = (x, y) => {
        const i = at(x, y);
        const max = Math.max(data[i], data[i + 1], data[i + 2]);
        return (max - Math.min(data[i], data[i + 1], data[i + 2])) / Math.max(max, 1) < 0.22;
    };
    const metal = new Uint8Array(width * height);
    const mask = new Uint8Array(width * height);
    for (let y = area.top; y < area.top + area.height; y++) {
        for (let x = area.left; x < area.left + area.width; x++) {
            if (isMetal(x, y)) {
                metal[y * width + x] = 1;
                for (let dy = -PAD.up; dy <= PAD.down; dy++) {
                    for (let dx = -PAD.x; dx <= PAD.x; dx++) {
                        mask[(y + dy) * width + x + dx] = 1;
                    }
                }
            }
        }
    }
    // papier bez krúžkov: každý zvislý úsek masky sa vyplní papierom tesne nad ním
    const pages = Buffer.from(data);
    for (let x = area.left - PAD.x; x < area.left + area.width + PAD.x; x++) {
        let y = area.top - PAD.up;
        while (y < area.top + area.height + PAD.down) {
            if (!mask[y * width + x]) {
                y++;
                continue;
            }
            const start = y;
            while (mask[y * width + x]) {
                y++;
            }
            for (let row = start; row < y; row++) {
                pages.copy(pages, at(x, row), at(x, row - (y - start) - 2), at(x, row - (y - start) - 2) + 4);
            }
        }
    }
    await sharp(pages, { raw: { width, height, channels: 4 } }).png().toFile(pagesOutput);

    // krúžky: kov v pôvodnej farbe, tiene a otvory ako priesvitná tma nad papierom
    const rings = Buffer.alloc(area.width * area.height * 4);
    const luma = (buffer, i) => 0.299 * buffer[i] + 0.587 * buffer[i + 1] + 0.114 * buffer[i + 2];
    for (let y = 0; y < area.height; y++) {
        for (let x = 0; x < area.width; x++) {
            const gx = area.left + x;
            const gy = area.top + y;
            const o = (y * area.width + x) * 4;
            if (!mask[gy * width + gx]) {
                continue;
            }
            const i = at(gx, gy);
            if (metal[gy * width + gx]) {
                data.copy(rings, o, i, i + 3);
                rings[o + 3] = 255;
                continue;
            }
            const darkness = 1 - luma(data, i) / Math.max(1, luma(pages, i));
            if (darkness > 0.02) {
                [rings[o], rings[o + 1], rings[o + 2]] = RING_SHADOW;
                rings[o + 3] = Math.round(Math.min(1, darkness) * 255);
            }
        }
    }
    await sharp(rings, { raw: { width: area.width, height: area.height, channels: 4 } }).png().toFile(ringsOutput);
}

/** Ikona z city game tileset: orezaná kresba zmenšená na danú výšku. */
async function iconFromTile(tile, output, height) {
    await sharp(`${TILES}/${tile}.png`).trim().resize({ height, kernel: 'lanczos3' }).png().toFile(output);
}

await mkdir(`${OUT}/ui`, { recursive: true });
await mkdir(`${OUT}/kniha`, { recursive: true });

// kniha: dvojstrana a predná doska bez zmeny, papier kresby a stôl ako JPEG
await copyFile(`${SRC}/kniha/book-spread.png`, `${OUT}/kniha/dvojstrana.png`);
await copyFile(`${SRC}/kniha/book-cover.png`, `${OUT}/kniha/doska.png`);
await splitRings(`${SRC}/kniha/book-spread.png`, `${OUT}/kniha/strany.png`, `${OUT}/kniha/kruzky.png`);
await sharp(`${SRC}/kniha/paper-grain.png`).flatten({ background: '#fff' }).jpeg({ quality: 88 }).toFile(`${OUT}/kniha/papier.jpg`);
await sharp(`${SRC}/stol/wood_table_001_diff_2k.jpg`).resize(1024).modulate({ brightness: 0.62, saturation: 0.85 })
    .jpeg({ quality: 82 }).toFile(`${OUT}/kniha/stol.jpg`);

// tieň knihy na stole: vopred rozostrený obdĺžnik, v CSS rozrezaný na 9 dielov (border-image) –
// prehliadač ho len natiahne, nemusí rozostrovať filter v každom snímku
const SHADOW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="17"/></filter>
    <rect x="64" y="64" width="128" height="128" rx="12" fill="#000" fill-opacity="0.62" filter="url(#f)"/></svg>`;
await sharp(Buffer.from(SHADOW_SVG)).png().toFile(`${OUT}/kniha/tien.png`);

// prevzaté z hry Comigo bez zmeny
await copyFile(`${SRC}/comigo/Bubble.png`, `${OUT}/ui/bublina.png`);
await copyFile(`${SRC}/ikony/rain-drop.png`, `${OUT}/ui/kvapka.png`);
await copyFile(`${SRC}/ikony/Cursor.png`, `${OUT}/ui/kurzor.png`);
await copyFile(`${SRC}/ikony/bird-flight.png`, `${OUT}/ui/vtak.png`);
await copyFile(`${SRC}/ikony/wave.png`, `${OUT}/ui/vlna.png`);
await copyFile(`${SRC}/ikony/bookmark.svg`, `${OUT}/ui/zalozka.svg`);

// ručne kreslené značky (Limofeus)
for (const [file, name, size] of [
    ['square.png', 'policko', 160], ['circle.png', 'kruzok', 160], ['check.png', 'fajka', 160], ['DoubleLine1.png', 'ciara', 512]
]) {
    await inkFromScan(`${SRC}/ikony/${file}`, `${OUT}/ui/${name}.png`, size);
}

// stopa chodidla: orezaná a zmenšená (vo svete sa kreslí v rovine terénu)
await sharp(`${SRC}/ikony/footprint.png`).trim().resize({ height: 96, kernel: 'lanczos3' }).png().toFile(`${OUT}/ui/stopa.png`);

// ikony z city game tileset
await iconFromTile('eye1', `${OUT}/ui/ikona-napoveda.png`, 96);
await iconFromTile('paper1', `${OUT}/ui/ikona-list.png`, 96);

console.log(`Textúry knihy a rozhrania -> ${OUT}`);
