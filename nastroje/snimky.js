/*
 * Snímky obrazovky a ukážkové video do dokumentácie hry „Záhrada stratených ciest“.
 *
 * Spustí jednoduchý lokálny webový server nad priečinkom hry, otvorí hru
 * v prehliadači Chrome (Playwright), prejde celý príbeh a uloží:
 *  - snímky 1920 × 1080 (JPEG) do ../dokumentacia/obrazky/,
 *  - ukážkové video so zvukom (1600 × 900, 60 snímok/s, H.264 + AAC) do
 *    ../Olym_PG1_20262027/dokumentacia/ukazka.mp4 – hrá sa ako skutočná hra
 *    (klávesy, kliknutia, koliesko); nahráva sa karta prehliadača v okne mimo obrazovky.
 * Na niektoré snímky (zväzok, dážď, babka) si nástroj sprístupní inštanciu hry
 * (window.__game) a postavu pošle priamo k cieľu.
 *
 * Spustenie: npm run snimky   (len video: node snimky.js video); video potrebuje ffmpeg (FFMPEG)
 * Autor: Mykyta Olym, 2026
 */
import { createServer } from 'node:http';
import { readFile, mkdir, rm, open } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const GAME_DIR = '../Olym_PG1_20262027';
const SHOTS_DIR = '../dokumentacia/obrazky';
const VIDEO_DIR = `${GAME_DIR}/dokumentacia`;
const PORT = 8790;
const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf'
};
/** Chrome s grafickou kartou (animácie bežia plynulo aj pri nahrávaní videa). */
const CHROME = { channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] };

/** Súbor, do ktorého server pripisuje kúsky videa z nahrávajúcej stránky (POST /zaznam). */
let videoFile = null;

/** Statický server: vráti súbor z priečinka hry; prijíma aj kúsky nahrávaného videa. */
const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (request.method === 'POST' && pathname === '/zaznam') {
        for await (const chunk of request) {
            await videoFile.write(chunk);
        }
        response.writeHead(204).end();
        return;
    }
    const path = pathname === '/' ? '/index.html' : pathname;
    try {
        const body = await readFile(join(GAME_DIR, path));
        response.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
        response.writeHead(404).end();
    }
}).listen(PORT);

const browser = await chromium.launch(CHROME);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Pred načítaním stránky: konštruktor Phaser.Game si zapamätá vytvorenú hru do window.__game. */
function exposeGame() {
    let phaser;
    Object.defineProperty(window, 'Phaser', {
        configurable: true,
        get: () => phaser,
        set: value => {
            const Game = value.Game;
            value.Game = class extends Game {
                constructor(config) {
                    super(config);
                    window.__game = this;
                }
            };
            phaser = value;
        }
    });
}

/**
 * Prejde celý príbeh od zatvorenej knihy po zatvorenie knihy.
 * @param {Page} page - stránka prehliadača
 * @param {function} shot - (názov) => uloží snímku alebo len počká (video)
 * @param {boolean} full - aj strany Ako hrať, Nastavenia, O knihe a potvrdenie (pre snímky)
 */
async function playthrough(page, shot, full) {
    const click = selector => page.locator(`${selector}:visible`).first().click();
    const world = body => page.evaluate(new Function(`const w = window.__game.scene.getScene('World'); ${body}`));
    const mode = () => world('return w.mode;');
    const talk = async until => {
        for (let i = 0; i < 30 && !(await until()); i++) {
            await page.keyboard.press('Space');
            await wait(900);
        }
    };

    await page.addInitScript(exposeGame);
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => document.getElementById('vyzva').classList.contains('viditelna'), null, { timeout: 60000 });
    await shot('stol');
    await page.keyboard.press('Enter'); await wait(2600); await shot('titul');
    if (full) {
        await click('[data-akcia="navod"]'); await wait(1900); await shot('navod');
        await click('[data-akcia="obsah"]'); await wait(1900);
        await click('[data-akcia="nastavenia"]'); await wait(1900);
        await page.locator('label:has(input[value="male"]):visible').click(); await wait(300);
        await shot('nastavenia');
        await click('[data-akcia="obsah"]'); await wait(1900);
        await click('[data-akcia="o-knihe"]'); await wait(1900); await shot('o-knihe');
        await click('[data-akcia="obsah"]'); await wait(1900);
        await click('[data-akcia="zavriet"]'); await wait(900); await shot('potvrdenie');
        await click('[data-volba="nie"]'); await wait(700);
    }
    await click('[data-akcia="zacat"]'); await wait(4200); await shot('prolog-pisanie');
    await page.waitForSelector('[data-akcia="vstupit"]:visible:not(.caka)', { timeout: 60000 });
    await wait(1200); await shot('prolog');
    await click('[data-akcia="vstupit"]'); await wait(2700); await shot('let');
    await page.waitForFunction(() => window.__game.scene.getScene('World').bubble, null, { timeout: 30000 });
    await wait(2200); await shot('zahradnik');
    await talk(async () => (await mode()) === 'play');
    await wait(1800); await shot('hra');

    // prvý zväzok kresieb: spomienka v titulkoch
    await world('w.walkTo(w.pageCells[0]);');
    await page.waitForFunction(() => window.__game.scene.getScene('World').found >= 1, null, { timeout: 90000 });
    await wait(2600); await shot('zvazok');
    await page.keyboard.press('h'); await wait(1600); await shot('napoveda');
    if (full) {
        await page.mouse.move(960, 540);
        await page.mouse.wheel(0, -500); await wait(1400); await shot('priblizenie');
        await page.mouse.wheel(0, 900); await wait(1400);
        await page.evaluate(() => window.__game.scene.getScene('Sky').setWeather('rain'));
        await wait(6000); await shot('dazd');
        await page.evaluate(() => window.__game.scene.getScene('Sky').setWeather('sun'));
        await wait(3000);
    }
    await page.keyboard.press('Escape'); await wait(1700); await shot('zalozka');

    // ukážka riešenia: postava sama dôjde k bráne, kde čaká babka
    await click('[data-akcia="ukazka"]');
    await page.waitForFunction(() => window.__game.scene.getScene('World').bubble, null, { timeout: 120000 });
    await wait(2400); await shot('babka');
    await talk(() => page.evaluate(() => !window.__game.scene.getScene('World').bubble
        && window.__game.scene.getScene('World').mode !== 'cutscene'));
    await page.waitForFunction(() => !document.getElementById('svet').classList.contains('zivy'), null, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('.miesto-strany.vlavo .rozpravanie p.dopisane'), null, { timeout: 60000 });
    await wait(1500); await shot('epilog');
    await click('[data-akcia="obsah"]'); await wait(2200);
    await click('[data-akcia="zavriet"]'); await wait(700);
    await click('[data-volba="ano"]'); await wait(5500); await shot('koniec');
}

// ============================================================================
//  2) Ukážkové video so zvukom
// ============================================================================

/**
 * Video: rozmer stránky 16 : 9 – okno mimo obrazovky systém nezväčší nad výšku obrazovky
 * (vnútro okna má asi 957 px), preto 1600 × 900, aby sa nahrávalo bez zmenšovania.
 * Počas hry sa nahráva kodekom H.264, ktorý prehliadač kóduje grafickou kartou (softvérový
 * VP8 pri pohybe celého záberu zaťaží procesor tak, že vynecháva snímky a brzdí aj hru);
 * výsledné video potom bez časového tlaku zakóduje ffmpeg: H.264 (CRF), zvuk AAC so
 * zjednotenou hlasitosťou.
 */
const VIDEO = { width: 1600, height: 900, fps: 60, mime: 'video/x-matroska;codecs=avc1,opus', videoBits: 16e6, audioBits: 192000, crf: 26 };
/** ffmpeg s kodekmi x264 a AAC (napr. zostava gyan.dev „essentials“); cestu možno zadať premennou FFMPEG. */
const FFMPEG = process.env.FFMPEG ?? join(process.env.LOCALAPPDATA ?? '', 'pg-tools', 'ffmpeg', 'bin', 'ffmpeg.exe');
/**
 * Okno prehliadača mimo obrazovky: nahrávanie karty (getDisplayMedia) funguje len
 * v zobrazenom okne. Prehliadač nesmie skryté okno spomaľovať.
 */
const RECORDER = {
    channel: 'chrome',
    headless: false,
    args: [...CHROME.args, '--window-position=-4000,0', '--auto-accept-this-tab-capture',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling']
};

/**
 * Vnútro okna presne VIDEO.width × VIDEO.height: okno sa zväčší o rozdiel, lebo rámy
 * okna a lišta „karta sa zdieľa“ zaberajú rôzne veľa miesta (inak by sa nahral aj biely okraj).
 */
async function fitWindow(page) {
    const devtools = await page.context().newCDPSession(page);
    const { windowId } = await devtools.send('Browser.getWindowForTarget');
    for (let attempt = 0; attempt < 5; attempt++) {
        const [width, height] = await page.evaluate(() => [innerWidth, innerHeight]);
        if (width === VIDEO.width && height === VIDEO.height) {
            return;
        }
        const { bounds } = await devtools.send('Browser.getWindowBounds', { windowId });
        await devtools.send('Browser.setWindowBounds', {
            windowId, bounds: { width: bounds.width + VIDEO.width - width, height: bounds.height + VIDEO.height - height }
        });
        await wait(300);
    }
    throw new Error(`Okno sa nedá nastaviť na ${VIDEO.width} × ${VIDEO.height}.`);
}

/**
 * Nahrávanie karty so zvukom priamo v stránke (MediaRecorder, H.264 + Opus). Kúsky videa
 * posiela stránka každú sekundu po poradí na server (POST /zaznam) – bez prevodu v stránke,
 * aby nahrávanie hru nebrzdilo. Nahrávať sa začne, až keď má karta presne veľkosť videa;
 * tú má aj každá snímka (prehliadač ju pri záťaži nesmie zmenšiť).
 */
async function startRecording(page, file) {
    videoFile = await open(file, 'w');
    await page.mouse.click(2, 2);   // nahrávanie karty sa smie spustiť len po akcii používateľa
    await page.evaluate(async settings => {
        window.__stream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: settings.fps, width: settings.width, height: settings.height },
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
            preferCurrentTab: true
        });
    }, VIDEO);
    // nad stránkou pribudne (s oneskorením) lišta zdieľania karty a zmenší ju
    await page.waitForFunction(height => innerHeight < height, VIDEO.height, { timeout: 5000 }).catch(() => {});
    await fitWindow(page);
    await page.evaluate(async settings => {
        await window.__stream.getVideoTracks()[0].applyConstraints({
            width: { exact: settings.width }, height: { exact: settings.height }, frameRate: settings.fps
        });
        const recorder = new MediaRecorder(window.__stream, {
            mimeType: settings.mime, videoBitsPerSecond: settings.videoBits, audioBitsPerSecond: settings.audioBits
        });
        window.__sent = Promise.resolve();
        recorder.ondataavailable = event => {
            window.__sent = window.__sent.then(() => fetch('/zaznam', { method: 'POST', body: event.data }));
        };
        recorder.start(1000);
        window.__recorder = recorder;
    }, VIDEO);
    return async () => {
        await page.evaluate(() => new Promise(resolve => {
            window.__recorder.onstop = () => window.__sent.then(resolve);   // posledný kúsok ešte dobehne
            window.__recorder.stop();
        }));
        await videoFile.close();
    };
}

/**
 * Výsledné video: H.264 s konštantnou kvalitou (CRF) a 60 snímkami za sekundu, zvuk AAC
 * so zjednotenou hlasitosťou (EBU R128, −16 LUFS), index na začiatku súboru (prehráva sa
 * hneď aj z webu). Surový záznam sa potom zmaže.
 */
async function encode(from, to) {
    await new Promise((resolve, reject) => execFile(FFMPEG, [
        '-y', '-i', from,
        '-c:v', 'libx264', '-preset', 'slow', '-tune', 'film', '-crf', String(VIDEO.crf), '-pix_fmt', 'yuv420p',
        '-vf', `scale=${VIDEO.width}:${VIDEO.height}:flags=lanczos,setsar=1`, '-fps_mode', 'cfr', '-r', String(VIDEO.fps),
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
        '-movflags', '+faststart', to
    ], { maxBuffer: 1 << 26 }, error => (error ? reject(error) : resolve())));
    await rm(from);
}

/**
 * Len pri nahrávaní (hra to nemá): kurzor ceruzky – nahrávanie karty systémový kurzor
 * nezachytí – a takmer priehľadná vrstva cez celú stránku, ktorá sa mení každý snímok.
 * Bez nej prehliadač pri zmene pohybu v obraze (koniec letu, odchod filmových pásov)
 * na štvrť sekundy prestane posielať snímky do záznamu, hoci hra beží plynulo.
 */
function recordingOverlay() {
    document.addEventListener('DOMContentLoaded', () => {
        const cursor = document.createElement('img');
        cursor.src = 'texture/ui/kurzor.png';
        cursor.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;'
            + 'transform-origin:5px 5px;will-change:transform;transform:translate(-100px,-100px);opacity:0;transition:opacity 200ms';
        const veil = document.createElement('div');
        veil.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;background:#000;will-change:opacity';
        document.body.append(veil, cursor);
        const hand = { x: -100, y: -100, pressed: false };
        // kurzor sa ukáže, až keď sa ruka pohne (klik, ktorý povolí nahrávanie, nie je súčasť ukážky)
        const place = () => {
            cursor.style.transform = `translate(${hand.x - 5}px, ${hand.y - 5}px) scale(${hand.pressed ? 0.86 : 1})`;
            cursor.style.opacity = window.__hand ? '1' : '0';
        };
        const follow = (pressed = hand.pressed) => event => {
            Object.assign(hand, { x: event.clientX, y: event.clientY, pressed });
            place();
        };
        addEventListener('pointermove', event => follow()(event), true);
        addEventListener('pointerdown', follow(true), true);
        addEventListener('pointerup', follow(false), true);
        let odd = false;
        const flicker = () => {
            odd = !odd;
            veil.style.opacity = odd ? '0.0005' : '0.001';   // obe hodnoty dajú rovnaké farby – vidno nič
            requestAnimationFrame(flicker);
        };
        requestAnimationFrame(flicker);
    });
}

/**
 * Pohyb ruky s myšou: trvanie podľa vzdialenosti (ms), zakrivenie dráhy (podiel dĺžky),
 * zastavenie nad cieľom pred kliknutím a dĺžka stlačenia tlačidla (ms).
 */
const HAND = { base: 380, perPixel: 0.45, bend: 0.18, hover: [220, 420], press: 90 };

/**
 * Ukážka hry ako pri skutočnom hraní: kniha, prológ, let do kresby, rozhovor, chôdza
 * klávesmi aj kliknutím, nápoveda, priblíženie, dážď, záložka, všetky tri zväzky,
 * stretnutie s babkou, návrat do knihy, epilóg a zatvorenie knihy. Rozhovory sa
 * neodklikávajú – postavy dohovoria a bubliny sa zavrú samy.
 */
async function demo(page) {
    const world = body => page.evaluate(new Function(`const w = window.__game.scene.getScene('World'); ${body}`));
    const until = (body, timeout = 120000) =>
        page.waitForFunction(new Function(`const w = window.__game.scene.getScene('World'); ${body}`), null, { timeout, polling: 50 });

    /** Myš ide k bodu ako ruka: po mierne zakrivenej dráhe, rozbehne sa a pred cieľom spomalí. */
    let hand = { x: VIDEO.width * 0.62, y: VIDEO.height - 4 };   // ruka vojde do obrazu zdola
    const moveHand = async to => {
        const from = hand;
        const distance = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        const bend = (Math.random() - 0.5) * 2 * distance * HAND.bend;
        const control = { x: (from.x + to.x) / 2 - (to.y - from.y) / distance * bend, y: (from.y + to.y) / 2 + (to.x - from.x) / distance * bend };
        const steps = Math.max(8, Math.round((HAND.base + distance * HAND.perPixel) / 16));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const u = t * t * (3 - 2 * t);
            await page.mouse.move((1 - u) ** 2 * from.x + 2 * (1 - u) * u * control.x + u * u * to.x,
                (1 - u) ** 2 * from.y + 2 * (1 - u) * u * control.y + u * u * to.y);
            await wait(16);
        }
        hand = to;
    };
    /** Klik ako človek: ruka prejde k bodu, chvíľu nad ním zastane a klikne. */
    const clickAt = async point => {
        await moveHand(point);
        await wait(HAND.hover[0] + Math.random() * (HAND.hover[1] - HAND.hover[0]));
        await page.mouse.down();
        await wait(HAND.press);
        await page.mouse.up();
    };
    const click = async selector => {
        const box = await page.locator(`${selector}:visible`).first().boundingBox();
        await clickAt({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    };

    /** Rozhovor: bubliny sa zavrú samy, keď postava dohovorí. Skončil, keď sa ďalšia neobjaví. */
    const talk = async () => {
        while (await until('return !!w.bubble;', 2500).then(() => true, () => false)) {
            await until('return !w.bubble;');
        }
    };

    /** Bod bunky na obrazovke (px stránky). */
    const cellOnScreen = cell => world(`const c = w.cameras.main; const r = innerWidth / w.scale.width;
        const x = (${cell.x} - ${cell.y}) * 80, y = (${cell.x} + ${cell.y}) * 44;
        return { x: (x - c.worldView.x) * c.zoom * r, y: (y - c.worldView.y) * c.zoom * r };`);

    /** Klik na bunku: ruka s krúžkom ceruzky prejde k bunke a klikne – na bunke zostane krúžok cieľa. */
    const clickCell = async cell => clickAt(await cellOnScreen(cell));

    /**
     * Chôdza klávesmi po najkratšej ceste: rovné úseky so stlačeným klávesom; ďalší kláves sa
     * stlačí ešte počas posledného kroku úseku, takže postava zahne bez zastavenia.
     */
    const walkKeys = async (cell, steps) => {
        const path = await world(`const path = []; const to = ${JSON.stringify(cell)};
            new ROT.Path.AStar(to.x, to.y, (x, y) => x >= 0 && y >= 0 && x < w.maze.size && y < w.maze.size && !w.maze.walls[y][x] && !w.maze.blocked.has(x + ',' + y), { topology: 4 })
                .compute(w.cell.x, w.cell.y, (x, y) => path.push({ x, y }));
            return path;`);
        const keys = { '0,-1': 'ArrowUp', '1,0': 'ArrowRight', '0,1': 'ArrowDown', '-1,0': 'ArrowLeft' };
        const moves = path.slice(1, steps + 1).map((cell, i) => keys[`${cell.x - path[i].x},${cell.y - path[i].y}`]);
        let total = await world('return w.steps;');
        for (let i = 0; i < moves.length;) {
            let run = 1;
            while (moves[i + run] === moves[i]) {
                run++;
            }
            total += run;
            await page.keyboard.down(moves[i]);
            // kláves sa pustí počas posledného kroku úseku, aby postava nespravila krok navyše
            await until(`return w.steps >= ${total} || (w.steps === ${total - 1} && w.moving);`, 30000);
            await page.keyboard.up(moves[i]);
            i += run;
        }
        await until(`return w.steps >= ${total} && !w.moving;`, 30000);
    };

    await page.addInitScript(exposeGame);
    await page.addInitScript(recordingOverlay);
    // malé bludisko, aby ukážka nebola dlhá
    await page.addInitScript(() => localStorage.setItem('zahrada-stratenych-ciest', JSON.stringify({ music: true, sounds: true, voice: true, size: 'male' })));
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
    const stop = await startRecording(page, `${VIDEO_DIR}/ukazka-surove.mkv`);

    // ---------------------------------------------------------------- kniha
    // úvodný záber dobehne, potom ruka klikne na dosku knihy – kniha sa otvorí a začne hudba
    await page.waitForFunction(() => document.getElementById('vyzva').classList.contains('viditelna'), null, { timeout: 60000 });
    await wait(1200);
    await page.evaluate(() => { window.__hand = true; });
    await click('#doska'); await wait(3000);
    await click('[data-akcia="navod"]'); await wait(3500);
    await click('[data-akcia="obsah"]'); await wait(2200);
    await click('[data-akcia="zacat"]');
    await page.waitForSelector('[data-akcia="vstupit"]:visible:not(.caka)', { timeout: 60000 });
    await wait(1800);

    // ---------------------------------------------------------------- vstup do kresby a rozhovor
    await click('[data-akcia="vstupit"]');
    await until('return !!w.bubble;');
    await talk();
    await until("return w.mode === 'play';");
    await wait(1500);

    // ---------------------------------------------------------------- hra
    const info = await world('return { pages: w.pageCells, exit: w.maze.exit };');
    await walkKeys(info.pages[0], 5);
    await wait(500);
    await page.keyboard.press('h'); await wait(2600);
    await clickCell(info.pages[0]);
    await until('return w.found >= 1;');
    await wait(2500);
    // priblíženie kolieskom: kamera sleduje postavu, potom späť na celé bludisko
    await moveHand({ x: VIDEO.width / 2 + 40, y: VIDEO.height / 2 - 30 });
    for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, -100); await wait(160);
    }
    await walkKeys(info.pages[1], 6);
    await wait(800);
    for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, 100); await wait(160);
    }
    await wait(1600);
    await clickCell(info.pages[1]);
    await until('return w.found >= 2 && !w.moving;');
    await wait(4500);   // spustí sa dážď
    await page.keyboard.press('Escape'); await wait(3200);
    await click('[data-akcia="pokracovat"]'); await wait(1500);
    await clickCell(info.pages[2]);
    await until('return w.found >= 3 && !w.moving;');
    await wait(3000);
    await clickCell(info.exit);

    // ---------------------------------------------------------------- koniec cesty
    await until('return !!w.bubble;');
    await talk();
    await page.waitForFunction(() => !document.getElementById('svet').classList.contains('zivy'), null, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('.miesto-strany.vlavo .rozpravanie p.dopisane'), null, { timeout: 60000 });
    await wait(3000);
    await click('[data-akcia="obsah"]'); await wait(2400);
    await click('[data-akcia="zavriet"]'); await wait(1400);
    await click('[data-volba="ano"]'); await wait(6500);
    await stop();
}

const onlyVideo = process.argv.includes('video');   // node snimky.js video – len nové video

// 1) snímky obrazovky
await mkdir(SHOTS_DIR, { recursive: true });
if (!onlyVideo) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await playthrough(page, name => page.screenshot({ path: `${SHOTS_DIR}/snimka-${name}.jpg`, quality: 85 }), true);
    await page.close();

    // chybové hlásenie pri otvorení súboru index.html priamo z disku (bez servera)
    const filePage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await filePage.goto(new URL(`${GAME_DIR}/index.html`, import.meta.url).href);
    await wait(1500);
    await filePage.screenshot({ path: `${SHOTS_DIR}/snimka-chyba-subor.jpg`, quality: 85 });
    await filePage.close();
}

// 2) ukážkové video so zvukom (okno prehliadača mimo obrazovky, stránka bez emulovanej
//    veľkosti – nahráva sa skutočné vnútro okna)
const recorder = await chromium.launch(RECORDER);
const videoContext = await recorder.newContext({ viewport: null });
const videoPage = await videoContext.newPage();
await fitWindow(videoPage);
await mkdir(VIDEO_DIR, { recursive: true });
await demo(videoPage);
await recorder.close();
await encode(`${VIDEO_DIR}/ukazka-surove.mkv`, `${VIDEO_DIR}/ukazka.mp4`);
await rm(`${VIDEO_DIR}/ukazka.webm`, { force: true });   // staršia verzia videa

await browser.close();
server.close();
console.log(`Snímky -> ${SHOTS_DIR}, video -> ${VIDEO_DIR}/ukazka.mp4`);
