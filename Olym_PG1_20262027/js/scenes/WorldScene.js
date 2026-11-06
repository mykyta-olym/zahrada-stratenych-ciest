/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Trieda:  WorldScene – svet v kresbe: bludisko, dedina, postavy, kamera
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Scénu ovláda režisér (director.js) cez verejné metódy, ktoré pri dlhších
 *  akciách vracajú Promise – scenár filmu sa tak dá zapísať pomocou await:
 *    build, drawIllustration, followShot, framePlay, frameMeeting, say, walkThrough,
 *    startPlay, showHint, walkToExit, celebrate.
 *  Režimy scény: 'idle' (svet je len ilustrácia v knihe), 'cutscene' (hrá sa
 *  filmová scéna, hráč neovláda postavu), 'play' (hra), 'done' (koniec cesty).
 *  Udalosti pre režiséra (this.game.events):
 *    'hud-update' {time, steps}, 'first-move', 'page-found' {index, x, y}, 'reached-exit'.
 * =============================================================================
 */
import { STORY } from '../story.js';
import {
    TILE, TILES, MAZE_SIZES, WORLD_CELLS, PAGE_COUNT, TIMING, ZOOM, FADE, PLAYER_TINT, PAPER
} from '../config.js';
import { createMaze, isFloor, findPath, findDeadEnds, placePages, DIRECTIONS } from '../maze.js';
import { toScreen, toGrid, depthOf, depthAt, LAYER } from '../iso.js';
import { RINGS, ringOf, riverAxis, storyPlaces } from '../layout.js';
import { Village, DECK_HEIGHT } from '../village.js';
import { wander, flutter, shimmer, walkPath, turnTo, nearAnimal } from '../life.js';

const GAIT = { lift: 3, sway: 2 };       // pri chôdzi sa hráč zdvihne (px) a zakolíše (stupne) – dva kroky na bunku
const FOOTPRINT = { scale: 0.34, life: 25000, max: 160, offset: 9 };   // stopy na zemi: mierka kresby, trvanie (ms), počet, odstup nôh (px)
/** Živé ploty pred postavou: bunky pred ňou (posun x, y), ktoré ju zakrývajú, ich priehľadnosť a čas prechodu (ms). */
const SEE_THROUGH = { cells: [[1, 0], [0, 1], [1, 1]], alpha: 0.38, time: 160 };
/**
 * Nápoveda: ceruzkou nakreslená trasa na najbližších krokoch k cieľu (nenájdený zväzok
 * alebo brána). Je to poznámka na papieri, preto leží nad kresbou: počet krokov, čas
 * kreslenia jedného kroku (ms), hrúbka čiary (px obrazovky), farba grafitu, chvenie ruky.
 */
const HINT = { steps: 12, perStep: 70, width: 4.5, color: 0x3b3631, alpha: 0.85, wobble: 0.08, arrow: 26, sound: 0.45 };
const HOVER = { scaleX: 0.8, scaleY: 0.44, alpha: 0.75 };   // krúžok ceruzkou na bunke pod kurzorom (sploštený do roviny terénu)
/**
 * Krúžky ceruzkou, ktoré ukazujú cieľ: na bunke kliknutia a pri bráne, keď sú zväzky pokope.
 * Veľkosť oproti krúžku pod kurzorom, nakreslenie, jemné dýchanie a rozplynutie (ms).
 */
const RING = { target: 1.15, gate: 1.9, alpha: 0.95, draw: 280, pulse: 0.06, pulseTime: 850, fade: 420 };
/**
 * Kamera počas hry: priblíženie aj poloha sa k cieľu blížia plynulo (exponenciálne,
 * časová konštanta v ms). Pri priblížení kolieskom kamera sleduje postavu, pri
 * celkovom pohľade stojí nad stredom bludiska – medzi tým sa ciele plynulo miešajú.
 * Jeden zárez kolieska zmení priblíženie o 15 %, touchpad po menších krokoch.
 */
const PLAY_CAMERA = { zoomTime: 160, moveTime: 260, follow: 0.5, wheelStep: 0.15, wheelPixels: 100, headroom: 40 };
/** Kresba sveta do knihy: kľúč textúry, koľko snímok počkať, kým ju grafická karta dokreslí, rozlíšenie (podiel obrazovky). */
const ILLUSTRATION = { key: 'kresba', settle: 2, scale: 0.5 };
/**
 * Pohľad z výšky (úroveň detailov): keď je kamera ďaleko, nekreslia sa tisícky kresieb
 * sveta, ale jediný obraz celého ostrova, nakreslený vopred mimo obrazovky (drawFarView).
 * Pod priblížením from (násobok pohľadu na celý ostrov) je vidno len obraz, nad to len živý
 * svet, medzi tým sa plynulo prelínajú.
 */
const FAR = { key: 'nadhlad', from: 1.3, to: 1.7, depth: 3 };
/**
 * Prejdená cesta červeným atramentom (po dôjdení k babke ju pero nakreslí do sveta a rovnaká
 * čiara je v kresbe epilógu): hrúbka v kresbe a vo svete (px obrazovky), farba, chvenie ruky
 * (časť bunky), rýchlosť pera (ms na bunku) a najkratšie a najdlhšie kreslenie (ms),
 * ako blízko k čiare sa pohnú živé ploty (px sveta).
 */
const ROUTE = { width: 3.5, screenWidth: 5, color: 0x7a2a22, wobble: 0.12, perCell: 38, min: 2400, max: 5200, reach: 130, sound: 0.55 };
const PLAY_TOP_MARGIN = 280;              // pri zábere bludiska miesto nad horným rohom pre postavy a stromy (px)
const SKY_DEPTH = 100000;                 // vtáky, motýle a bubliny rozhovoru sú nad celým svetom
const SPEECH = { fontShare: 0.026, charsPerSecond: 42, readPerChar: 55, hold: 900, pop: 0.3 };   // výška písma bubliny = podiel výšky obrazovky; písanie bez hlasu (znaky/s); čítanie (ms na znak) a chvíľa po dohovorení (ms); hlasitosť bublinky
const FILM_BAR = 0.11;                    // filmový pás zaberá 11 % výšky okna (hra.css, .pas)
/**
 * Myšlienky postavy: veľkosť písma (násobok písma rozhovoru), najkratší čas zobrazenia
 * a čas na písmeno (ms), odstup medzi myšlienkami (ms), za ako dlho a koľko nárazov do
 * plota vyvolá myšlienku, najkratší odstup myšlienok o slepej uličke a o plote (ms),
 * naklonenie postavy k predmetu (°).
 */
const THOUGHT = { font: 0.82, hold: 2200, perChar: 45, gap: 3500, bumpWindow: 5000, bumps: 3, deadEndGap: 20000, hedgeGap: 25000, lean: 7 };
/** Predmety v zákutiach bludiska podľa kresby (pre myšlienky postavy). */
const NOOK_KIND = { column1: 'column', 'traffic-circle1': 'planter', well1: 'well' };
const NOOK_CHANCE = 0.3;                  // podiel slepých uličiek so stĺpom, záhonom alebo studňou
const PUDDLE_CHANCE = 0.07;               // podiel buniek ciest, kde sa v daždi zjaví mláka
const VILLAGERS = { max: 3, every: [4000, 9000], speed: 0.7, pause: 0.3, children: 0.3, childScale: 0.78 };   // chodci: najviac naraz, ako často prichádzajú, bunky/s, zastavenie na rohu, podiel detí a ich veľkosť
const STROLLER = { speed: 0.32, rest: [2500, 6000] };   // obyvateľ, ktorý sa prechádza po promenáde okolo bludiska
const BIRDS = { every: [9000, 16000], frameRate: 7 };              // kŕdeľ vtákov preletí nad dedinou
const WIN = { hedgeAngle: 5, butterflies: 9, birds: 4, hop: 14, hold: 1300 };   // oslava pri bráne: kývnutie plotu (°), motýle, vtáky, poskočenie (px), dozvuk (ms)
const PAPER_DEPTH = 1000;                 // papier nad všetkými vrstvami sveta, pod bublinou rozhovoru
const PAPER_SPAN = 48000;                 // papier pod svetom siaha ďaleko za ostrov (px sveta) – pokryje každý záber
const ISLAND_MARGIN = 0.9;                // pri pohľade na celý svet zaberá ostrov 90 % obrazovky
/**
 * Orezanie: kreslia sa iba objekty v zábere kamery. Kotva objektu je jeho päta, preto
 * zospodu treba rezervu na vysoké kresby (stromy, veže siahajú až 760 px nad pätu).
 */
/**
 * Orezanie: rezerva okolo záberu (px sveta) podľa najväčšieho presahu kresby od jej päty
 * (atlas: terén najviac 65 px nad pätu a 124 px nabok, stromy a veže až 537 px nad pätu)
 * a na koľko snímok sa rozdelí prechod všetkými kresbami.
 */
const CULL = { ground: { side: 130, above: 130, below: 80 }, objects: { side: 180, above: 130, below: 600 }, slices: 3 };
/**
 * Okraj listu počas hry: k rohom obrazovky sa kresba stráca v čistom papieri a pod
 * poznámkami v rohoch je papier čistý (ako v skicári). Rozmery poznámok sú v rem
 * rozhrania (hra.css); roh x, y (0/1), polosi (rem), plný papier do (podiel polomeru).
 */
const MARGIN = {
    fade: 600,
    corners: { radius: 0.71, from: 0.74 },
    notes: [[0, 0, 36, 19, 0.55], [1, 0, 33, 9, 0.5], [0, 1, 36, 6, 0.45]],
    subtitle: [0.5, 1, 44, 9.5, 0.45]
};
const WAVES = { every: 90, drift: 0.7, life: [2400, 3600], alpha: 0.95 };   // vlnky na rieke: ako často vzniknú (ms), posun s prúdom (bunky), trvanie (ms)
const RIPPLES = { fountain: 260, rain: 45, life: 1300 };                     // kruhy na vode: ako často (ms) pri fontáne a v daždi, trvanie (ms)

/** Kľúč bunky do množiny. */
const key = (x, y) => `${x},${y}`;

export class WorldScene extends Phaser.Scene {
    constructor() {
        super('World');
    }

    // =========================================================================
    //  Vytvorenie scény
    // =========================================================================

    /** Pripraví vstupy a reakcie na udalosti; svet sa stavia až na pokyn režiséra (build). */
    create() {
        this.mode = 'idle';
        this.userZoom = 1;
        this.sky = this.scene.get('Sky');
        this.sounds = this.registry.get('sounds');
        this.directionKeys = this.createDirectionKeys();
        this.anims.create({ key: 'let', frames: this.anims.generateFrameNumbers('vtak', { start: 0, end: 1 }), frameRate: BIRDS.frameRate, repeat: -1 });

        this.input.keyboard.on('keydown-H', () => this.showHint());
        this.input.keyboard.on('keydown-U', () => this.walkToExit());
        this.input.on('gameover', () => { this.pointerInside = true; });
        this.input.on('gameout', () => { this.pointerInside = false; });
        this.input.on('pointerup', this.handlePointerUp, this);
        this.input.on('wheel', this.handleWheel, this);
        this.scale.on('resize', this.handleResize, this);
        this.events.on('resume', () => this.input.keyboard.resetKeys());
        this.game.events.on('weather', this.onWeather, this);
        this.margins = { page: this.createMargin('okraj-listu'), subtitle: this.createMargin('okraj-titulkov') };
        this.subtitles = document.getElementById('titulky');
        this.farView = this.add.image(0, 0, '__WHITE').setDepth(FAR.depth).setVisible(false);
        this.drawMargins();
        this.scale.on('resize', this.drawMargins, this);
        this.game.events.on('prerender', this.beforeRender, this);
        this.game.events.emit('world-created', this);
    }

    /** Šípky aj W A S D; poradie smerov zodpovedá poľu DIRECTIONS. Stlačenie zruší naplánovanú trasu. */
    createDirectionKeys() {
        const keyboard = this.input.keyboard;
        return [['UP', 'W'], ['RIGHT', 'D'], ['DOWN', 'S'], ['LEFT', 'A']].map((names, index) => ({
            keys: names.map(name => keyboard.addKey(name, false).on('down', () => {
                if (this.mode === 'play') {
                    this.route = [];
                }
            })),
            direction: DIRECTIONS[index]
        }));
    }

    // =========================================================================
    //  Stavba sveta
    // =========================================================================

    /**
     * Vytvorí logické bludisko a nakreslí celý svet: bludisko, krajinu okolo,
     * zväzky kresieb, postavy príbehu, zvieratá a chodcov. Kamera sa nastaví
     * na pohľad na celý ostrov sveta (ako ilustrácia v knihe).
     * @param {string} sizeKey - kľúč z MAZE_SIZES ('male', 'stredne', 'velke')
     * @param {number} [seed] - semienko náhody (rovnaké semienko = rovnaký svet)
     */
    build(sizeKey, seed = Date.now()) {
        this.clearWorld();
        // dve vrstvy: najprv celý terén (dlaždice, chodníky, stopy, voda), potom predmety
        // a postavy zoradené maliarovým algoritmom – postava tak nikdy nie je pod dlažbou
        // kresba sa kreslí bežne (bližšie predmety zakrývajú vzdialenejšie) na bielu plochu
        // a na hotový obraz sa položí papier s násobením farieb – atrament na papieri
        this.cameras.main.setBackgroundColor('#ffffff');
        this.groundLayer = this.add.layer().setDepth(0);
        // povrch nad terénom: vlny, kruhy na vode, stopy – vznikajú a zanikajú stále, preto nie
        // vo vrstve terénu s tisíckami dlaždíc, ktorú by každé pridanie celú preradilo
        this.surfaceLayer = this.add.layer().setDepth(1);
        this.layer = this.add.layer().setDepth(2);
        // atrament na papieri (nápoveda, prejdená cesta) – nad kresbou, pod papierom; patrí k tomuto svetu
        this.inkLayer = this.add.layer().setDepth(PAPER_DEPTH - 2);
        this.paper = this.createPaper();
        this.maze = createMaze(MAZE_SIZES[sizeKey].cells, seed, PAGE_COUNT + 1);   // zväzky a aspoň jedno zákutie
        this.margin = Math.ceil((WORLD_CELLS - this.maze.size) / 2);
        this.places = storyPlaces(this.maze);
        this.pageCells = placePages(this.maze, PAGE_COUNT);
        Object.assign(this, {
            puddles: [], waterTiles: [], hedges: [], butterflies: [], villagers: [], footprints: [], pages: [],
            trail: [], route: [], found: 0, elapsed: 0, steps: 0, hints: 0, usedDemo: false, moving: false, staged: false,
            animalClaims: new Map(), nooks: new Map(), cullSlice: 0, noticed: new Set(), thought: null, hintActive: false, leanTween: null,
            thoughtAt: -Infinity, deadEndAt: -Infinity, hedgeAt: -Infinity, bumpTimes: [], thoughtOrder: {},
            hedgeCells: new Map(), seeThrough: new Set()
        });
        this.shortest = findPath(this.maze, this.maze.start, this.maze.exit).length;

        this.village = new Village(this);
        const last = this.maze.size - 1;
        for (let y = -this.margin; y <= last + this.margin; y++) {
            for (let x = -this.margin; x <= last + this.margin; x++) {
                if (ringOf(this.maze, x, y) === 0) {
                    this.buildMazeCell(x, y);
                } else {
                    this.village.buildCell(x, y);
                }
            }
        }
        this.village.buildDecks();
        this.village.addBoat();
        this.village.addFountain();
        this.placeNooks();
        this.placeGates();
        this.placePages();
        this.spawnCharacters();
        this.addResidents();
        this.addAnimals();
        this.addButterflies();
        // krúžky ceruzkou kreslí hráč akoby na papier knihy – v atramente nad kresbou, takže
        // ich nezakryje ani vysoký živý plot pred úzkou chodbou
        this.hoverMark = this.inkLayer.add(this.add.image(0, 0, 'kruzok')).setScale(HOVER.scaleX, HOVER.scaleY).setAlpha(HOVER.alpha).setVisible(false);
        [this.targetMark, this.gateMark] = [0, 1].map(() => this.inkLayer.add(this.add.image(0, 0, 'kruzok')).setVisible(false).setData({ x: null, y: null }));
        this.computeFrames();
        this.onWeather(this.sky.weather, 0);
        this.startVillagers();
        this.scheduleBirds();
        this.time.addEvent({ delay: WAVES.every, loop: true, callback: () => this.addWave() });
        this.time.addEvent({ delay: RIPPLES.rain, loop: true, callback: () => this.weather === 'rain' && this.addRipple(this.visibleWater) });
        this.time.addEvent({ delay: RIPPLES.fountain, loop: true, callback: () => this.addRipple(this.fountainWater, 0.25) });
        this.time.addEvent({ delay: 500, loop: true, callback: () => this.findVisibleWater() });
        this.mode = 'idle';
        this.frameOverview();
        this.drawFarView();
    }

    /** Odstráni starý svet vrátane jeho animácií a časovačov. */
    clearWorld() {
        if (!this.layer) {
            return;
        }
        this.tweens.killAll();
        this.time.removeAllEvents();
        this.sounds?.hush();   // kreslenie (nápoveda, cesta) aj reč sa zastavili uprostred
        this.paper.destroy();
        this.groundLayer.destroy();
        this.surfaceLayer.destroy();
        this.layer.destroy();
        this.inkLayer.destroy();
        this.bubble?.destroy();
        this.bubble = null;
        this.thought?.destroy();
        this.thought = null;
    }

    /** Bunka bludiska: steny sú živé ploty (aj obvodové), voľné bunky štrkové chodníčky. */
    buildMazeCell(x, y) {
        this.addTile(x, y, Phaser.Utils.Array.GetRandom(TILES.ground), LAYER.ground, { flip: true });
        if (this.maze.walls[y][x]) {
            const hedge = this.addTile(x, y, TILES.hedge, LAYER.object, { flip: true });
            this.hedges.push(hedge);
            this.hedgeCells.set(key(x, y), hedge);
            return;
        }
        this.addTile(x, y, TILES.mazePath, LAYER.detail, { flip: true });
        this.maybePuddle(x, y);
    }

    /** Stĺp, okrúhly záhon alebo studňa v niektorých slepých uličkách (nie tam, kde ležia zväzky kresieb). */
    placeNooks() {
        const pages = new Set(this.pageCells.map(cell => key(cell.x, cell.y)));
        for (const cell of findDeadEnds(this.maze)) {
            if (!pages.has(key(cell.x, cell.y)) && ROT.RNG.getUniform() < NOOK_CHANCE) {
                const frame = ROT.RNG.getItem(TILES.nook);
                this.addTile(cell.x, cell.y, frame, LAYER.object);
                this.maze.blocked.add(key(cell.x, cell.y));   // do studne ani do záhonu sa nevstupuje
                this.nooks.set(key(cell.x, cell.y), NOOK_KIND[frame]);
            }
        }
    }

    /**
     * Jediný vstupný oblúk a jediná výstupná brána. Cesta cez ne vedie pozdĺž osi y,
     * preto musí oblúk aj brána stáť v línii živého plota (pozdĺž osi x), aby sa cez ne
     * prechádzalo, nie popri nich. Overené podľa polohy ich nôh v kresbe: obe nohy brány
     * ležia na osi x bez zrkadlenia (681 a 716 px), oblúk sa do línie plota dostane
     * až zrkadlením.
     */
    placeGates() {
        for (const cell of this.maze.entrances) {
            this.addTile(cell.x, cell.y, TILES.entrance, LAYER.object, { flipX: true });
        }
        for (const cell of this.maze.gates) {
            this.addTile(cell.x, cell.y, TILES.exit, LAYER.object, { flipX: false });
        }
    }

    /** V daždi sa na niektorých bunkách ciest zjaví mláka (zatiaľ neviditeľná). */
    maybePuddle(x, y) {
        if (ROT.RNG.getUniform() < PUDDLE_CHANCE) {
            this.puddles.push(this.addTile(x, y, TILES.puddle, LAYER.detail, { flip: true }).setAlpha(0));
        }
    }

    /**
     * Pridá kresbu z atlasu na bunku (x, y). Pivot snímky (z atlasu) zarovná
     * všetky kresby na stred hornej steny kocky.
     * @param {object} [options] - flip: náhodné zrkadlenie (rozmanitosť terénu a rastlín),
     *     flipX: pevné zrkadlenie (kresby s orientáciou – dvere domu či lavička hľadia
     *     tam, kam majú), offsetY: zvislý posun nad bunku (px)
     * @returns {Phaser.GameObjects.Image}
     */
    addTile(x, y, frame, layer, { flip = false, flipX = null, offsetY = 0 } = {}) {
        const point = toScreen(x, y);
        const target = layer <= LAYER.footprint ? this.groundLayer : this.layer;
        const tile = target.add(this.add.image(point.x, point.y + offsetY, 'mesto', frame));
        tile.setDepth(depthOf(x + y, layer)).setFlipX(flipX ?? (flip && ROT.RNG.getUniform() < 0.5));
        this.fadeWithDistance(tile, x, y);
        return tile;
    }

    /**
     * Vzdušná perspektíva: čím je kresba ďalej od kamery, tým je bledšia. Kamera sa
     * pozerá z juhu (zdola), preto rozhoduje, ako ďaleko za bludiskom (hore na obrazovke)
     * bunka leží – diagonála x + y; vpredu (dedina pri rieke) sa nič nezosvetľuje.
     * Farebný odtieň v režime SCREEN zosvetľuje tmavé čiary, biely papier zostane biely.
     */
    fadeWithDistance(tile, x, y) {
        const behind = -(x + y) / 2 - FADE.from;
        if (behind <= 0) {
            return;
        }
        const strength = Phaser.Math.Linear(FADE.near, FADE.far, Math.min(behind / FADE.rings, 1));
        const level = Math.round(strength * 255);
        tile.setTint(Phaser.Display.Color.GetColor(level, level, level)).setTintMode(Phaser.TintModes.SCREEN);
    }

    // ---------------------------------------------------------------- príbeh

    /** Zväzky kresieb v slepých uličkách: vznášajú sa a trblietajú. */
    placePages() {
        this.pageCells.forEach(cell => {
            const point = toScreen(cell.x, cell.y);
            const page = this.layer.add(this.add.image(point.x, point.y - 6, 'mesto', TILES.page));
            page.setDepth(depthOf(cell.x + cell.y, LAYER.object)).setScale(1.25);
            const sparkle = this.layer.add(shimmer(this, page));
            sparkle.setDepth(page.depth + 0.5);
            this.pages.push({ cell, page, sparkle, found: false });
        });
    }

    /** Hráč a záhradník pred vstupnou bránou, babka pri výstupnej bráne pri lavičke. */
    spawnCharacters() {
        const { arrival, gardener, grandma, grandmaBench } = this.places;
        this.player = this.addFigure(arrival, TILES.player).setTint(PLAYER_TINT);
        this.cell = { ...arrival };
        this.gardener = this.addFigure(gardener, TILES.gardener).setFlipX(true);   // ukazuje rukou k bráne
        this.grandma = this.addFigure(grandma, TILES.grandma).setFlipX(true);
        // lavička za babkou (vstala z nej), rovnobežne s cestou od brány a sedadlom k nej (zrkadlená kresba)
        this.addTile(grandmaBench.x, grandmaBench.y, TILES.bench, LAYER.object, { flipX: true });
        // postavy príbehu pokojne dýchajú – nestoja ako socha
        for (const figure of [this.gardener, this.grandma]) {
            this.tweens.add({ targets: figure, scaleY: 1.015, duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 1000 });
        }
    }

    /** Postava na bunke (vrstva postáv, hĺbka podľa polohy päty). */
    addFigure(cell, frame) {
        const point = toScreen(cell.x, cell.y);
        const figure = this.layer.add(this.add.image(point.x, point.y, 'mesto', frame));
        figure.setDepth(depthAt(point.y, LAYER.figure));
        return figure;
    }

    // =========================================================================
    //  Život vo svete: počasie, zvieratá, motýle, ľudia, oblaky, vtáky
    // =========================================================================

    /**
     * Zmena počasia (udalosť zo scény SkyScene): v daždi sa zjavia mláky a motýle sa
     * schovajú, za slnka mláky pomaly vyschnú a motýle priletia. Chodci, ktorí prídu
     * neskôr, sa oblečú podľa počasia (v daždi s dáždnikom).
     */
    onWeather(weather, duration) {
        this.weather = weather;
        if (!this.layer) {
            return;
        }
        const rainy = weather === 'rain';
        this.tweens.add({ targets: this.puddles, alpha: rainy ? 0.75 : 0, duration: rainy ? duration : duration * 4 });
        this.tweens.add({ targets: this.butterflies, alpha: rainy ? 0 : 1, duration });
    }

    /**
     * Zvieratá na miestach, kde by naozaj boli: kravy, kôň, somár a koza na ohradenej
     * pastvine, jelene v zámockom parku, mačka v záhradkách za domami, ježko na trávniku
     * záhrady, zajace na lúke pri kostole, husi a žaby na brehu, kačky na rieke, pes pri dome.
     */
    addAnimals() {
        const v = this.village;
        const L = this.maze.size - 1;
        const animals = TILES.animals;
        const [[px0, px1], [py0, py1]] = v.zones.pasture;
        const pasture = (x, y) => v.inPasture(x, y);
        for (const [animal, fx, fy] of [['cow', 0.3, 0.3], ['cow', 0.6, 0.6], ['horse', 0.4, 0.75], ['donkey', 0.75, 0.3], ['goat', 0.55, 0.45], ['goat', 0.3, 0.6]]) {
            this.spawnAnimal(animals[animal], { x: Math.round(px0 + (px1 - px0) * fx), y: Math.round(py0 + (py1 - py0) * fy) }, pasture);
        }
        const [[kx0, kx1], [ky0, ky1]] = v.zones.park;
        for (const f of [0.3, 0.7]) {
            this.spawnAnimal(animals.deer, { x: Math.round(kx0 + (kx1 - kx0) * f), y: Math.round(ky0 + (ky1 - ky0) * (1 - f)) }, (x, y) => v.inPark(x, y));
        }
        this.spawnAnimal(animals.cat, { x: 4, y: L + 7 }, (x, y) => v.inGardens(x, y));
        this.spawnAnimal(animals.hedgehog, { x: L + 3, y: Math.floor(L / 2) }, (x, y) => v.onLawn(x, y));
        this.spawnAnimal(animals.rabbit, { x: -14, y: L + 7 }, (x, y) => v.inMeadow(x, y));
        this.spawnAnimal(animals.rabbit, { x: -16, y: L + 9 }, (x, y) => v.inMeadow(x, y));
        for (const x of [L - 10, L + 6, -4]) {
            this.spawnAnimal(animals.goose, { x, y: v.riverY(x) + 2 }, (cx, cy) => v.onBank(cx, cy));
            this.spawnAnimal(animals.duck, { x: x + 2, y: v.riverY(x + 2) }, (cx, cy) => v.inRiver(cx, cy));
        }
        this.spawnAnimal(animals.frog, { x: L + 2, y: v.riverY(L + 2) + 2 }, (cx, cy) => v.onBank(cx, cy));
        // vrany na poliach, vrabce na námestí a na dvore, líška v lese za dvorom
        const [[fx0, fx1], [fy0, fy1]] = v.zones.fields;
        for (const f of [0.35, 0.7]) {
            this.spawnAnimal(animals.crow, { x: Math.round(fx0 + (fx1 - fx0) * f), y: Math.round(fy0 + (fy1 - fy0) * f) }, (x, y) => v.inFields(x, y));
        }
        for (const [[x0, x1], [y0, y1]] of [v.zones.square, v.zones.square, v.zones.farmyard]) {
            this.spawnAnimal(animals.sparrow, { x: Phaser.Math.Between(x0, x1), y: Phaser.Math.Between(y0, y1) }, (x, y) => v.onPlaza(x, y));
        }
        this.spawnAnimal(animals.fox, { x: v.zones.farmyard[0][1] + 4, y: -v.margin + 3 }, (x, y) => v.inWoods(x, y));
        // pes sedí pri dverách domu a občas sa obzrie
        const door = v.houseDoors[Math.floor(v.houseDoors.length / 3)];
        if (door) {
            const dog = this.addFigure({ x: door.x - 1, y: door.y }, TILES.dog);
            this.time.addEvent({ delay: 4200, loop: true, callback: () => turnTo(this, dog, !dog.flipX) });
        }
    }

    /** Najbližšia bunka k danej, ktorá spĺňa podmienku (hľadá v štvorcoch s rastúcim polomerom). */
    nearestCell(cell, test) {
        for (let radius = 0; radius <= 7; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (test(cell.x + dx, cell.y + dy)) {
                        return { x: cell.x + dx, y: cell.y + dy };
                    }
                }
            }
        }
        return null;
    }

    /** Zviera na najbližšej vhodnej bunke; potom sa samo prechádza (life.js: wander). */
    spawnAnimal(animal, near, canStand) {
        const cell = this.nearestCell(near, (x, y) => canStand(x, y) && !nearAnimal(this, x, y));
        if (!cell) {
            return;
        }
        const sprite = this.addFigure(cell, animal.rest);
        this.fadeWithDistance(sprite, cell.x, cell.y);
        wander(this, sprite, animal, canStand);
    }

    /** Motýle poletujú nad ružami v rohoch a nad lúkou pred bludiskom (life.js: flutter). */
    addButterflies() {
        const last = this.maze.size - 1;
        const middle = Math.floor(last / 2);
        const homes = [{ x: -4, y: last + 4 }, { x: last + 4, y: -4 }, { x: last + 4, y: last + 4 },
            { x: middle, y: last + 5 }, { x: last + 5, y: middle }, { x: middle - 3, y: last + 9 }];
        homes.forEach((cell, index) => {
            const home = toScreen(cell.x, cell.y);
            const butterfly = this.layer.add(this.add.image(home.x, home.y - 120, 'mesto', TILES.butterflies[index % 2]));
            butterfly.setDepth(depthAt(home.y, LAYER.figure) + 0.5).setScale(1.3);
            this.butterflies.push(butterfly);
            flutter(this, butterfly, home);
        });
    }

    /** Náhodný bod na hornej ploche dlaždice (posun v rámci bunky v súradniciach mriežky). */
    pointOnTile(tile, spread = 0.4) {
        const offset = { x: Phaser.Math.FloatBetween(-spread, spread), y: Phaser.Math.FloatBetween(-spread, spread) };
        return { x: tile.x + (offset.x - offset.y) * TILE.halfWidth, y: tile.y + (offset.x + offset.y) * TILE.halfHeight };
    }

    /**
     * Rieka tečie: na náhodnom mieste hladiny v zábere kamery vznikne vlnka (kresba
     * vlny z hry Comigo), nechá sa unášať prúdom pozdĺž osi x mriežky, pritom sa zjaví
     * a zmizne. Dlaždice vody sa nehýbu – pohyb vody nesú iba vlnky.
     */
    addWave() {
        const water = Phaser.Utils.Array.GetRandom(this.visibleWater ?? []);
        if (!water || this.fountainWater?.includes(water)) {
            return;
        }
        const from = this.pointOnTile(water);
        const wave = this.surfaceLayer.add(this.add.image(from.x, from.y, 'vlna'));
        wave.setDepth(water.depth + 1.5).setAlpha(0).setScale(Phaser.Math.FloatBetween(1.1, 1.8));
        this.tweens.add({
            targets: wave,
            x: from.x + WAVES.drift * TILE.halfWidth,
            y: from.y + WAVES.drift * TILE.halfHeight,
            alpha: { from: 0, to: WAVES.alpha, ease: t => Math.sin(Math.PI * t) },
            duration: Phaser.Math.Between(...WAVES.life),
            onComplete: () => wave.destroy()
        });
    }

    /**
     * Kruh na vode: kresba kruhov na hladine (puddle2) sa zjaví malá, rozšíri sa
     * a zmizne – dopad kvapky v daždi alebo prúdu vody vo fontáne.
     * @param {Phaser.GameObjects.Image[]} tiles - dlaždice vody, z ktorých sa vyberá
     * @param {number} [spread=0.4] - ako ďaleko od stredu bunky môže kruh vzniknúť
     */
    addRipple(tiles, spread = 0.4) {
        const water = Phaser.Utils.Array.GetRandom(tiles ?? []);
        if (!water || !water.active) {
            return;
        }
        const at = this.pointOnTile(water, spread);
        const ring = this.surfaceLayer.add(this.add.image(at.x, at.y, 'mesto', TILES.ripple));
        ring.setDepth(water.depth + 1.4).setScale(0.12).setAlpha(0.7);
        this.tweens.add({ targets: ring, scale: 0.45, alpha: 0, duration: RIPPLES.life, ease: 'Sine.easeOut', onComplete: () => ring.destroy() });
    }

    /**
     * Výška povrchu pod bodom sveta: na palube mosta a móla je postava o DECK_HEIGHT
     * vyššie, na krajoch paluby plynulo vystúpi (rampa dlhá pol bunky).
     */
    surfaceHeight(worldX, worldY) {
        const u = worldX / TILE.halfWidth;
        const v = worldY / TILE.halfHeight;
        const grid = { x: (v + u) / 2, y: (v - u) / 2 };
        const bridge = this.village.bridge;
        if (Math.abs(grid.x - bridge.x) > 0.5) {
            return 0;
        }
        const inside = Math.min(grid.y - (bridge.from - 0.5), bridge.to + 0.5 - grid.y);
        return DECK_HEIGHT * Phaser.Math.Clamp(inside / 0.5, 0, 1);
    }

    /**
     * Vrstva okraja listu: biely obraz s priehľadnosťou, ktorý leží nad kresbou a pod
     * papierom. Kde je nepriehľadný, kresba zmizne a po násobení s papierom tam ostane
     * čistý papier – presne ten istý papier, aký je pod kresbou.
     */
    createMargin(key) {
        const image = this.add.image(0, 0, '__WHITE').setDepth(PAPER_DEPTH - 1).setAlpha(0);
        image.setData('key', key);
        return image;
    }

    /** Nakreslí priehľadnosť okrajov (radiálne prechody) podľa veľkosti obrazovky. */
    drawMargins() {
        const { width, height } = this.scale;
        const rem = Phaser.Math.Clamp(innerWidth * 0.0078, 11, 24) * (width / innerWidth);
        const draw = (image, ellipses, corners) => {
            const key = image.getData('key');
            if (this.textures.exists(key)) {
                image.setTexture('__WHITE');
                this.textures.remove(key);
            }
            const texture = this.textures.createCanvas(key, width, height);
            const context = texture.getContext();
            const ellipse = (cx, cy, rx, ry, from, to, fromAlpha, toAlpha) => {
                context.save();
                context.translate(cx, cy);
                context.scale(rx, ry);
                const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
                gradient.addColorStop(from, `rgba(255,255,255,${fromAlpha})`);
                gradient.addColorStop(to, `rgba(255,255,255,${toAlpha})`);
                context.fillStyle = gradient;
                context.fillRect(-4, -4, 8, 8);
                context.restore();
            };
            if (corners) {
                ellipse(width / 2, height / 2, width * MARGIN.corners.radius, height * MARGIN.corners.radius, MARGIN.corners.from, 1, 0, 1);
            }
            for (const [ax, ay, rx, ry, solid] of ellipses) {
                ellipse(ax * width, ay * height, rx * rem, ry * rem, solid, 1, 1, 0);
            }
            texture.refresh();
            image.setTexture(key);
        };
        draw(this.margins.page, MARGIN.notes, true);
        draw(this.margins.subtitle, [MARGIN.subtitle], false);
    }

    /**
     * Každý snímok: okraj listu leží presne na obrazovke (stred kamery, mierka 1/priblíženie)
     * a plynule sa zjaví počas hry; okraj pre titulky, kým sú titulky na obrazovke.
     */
    updateMargins(delta) {
        const camera = this.cameras.main;
        const targets = {
            page: this.mode === 'play' ? 1 : 0,
            subtitle: this.mode === 'play' && this.subtitles.classList.contains('viditelne') ? 1 : 0
        };
        const step = Math.min(1, delta / MARGIN.fade);
        for (const [name, image] of Object.entries(this.margins)) {
            image.alpha += (targets[name] - image.alpha) * step;
            // pri zahrievaní sa okraje nakreslia takmer neviditeľne – ich textúra sa nahrá do grafickej karty vopred
            image.visible = image.alpha > 0.01 || this.forceLive;
            if (this.forceLive) {
                image.alpha = Math.max(image.alpha, 0.004);
            }
            if (image.visible) {
                image.setPosition(camera.scrollX + camera.width / 2, camera.scrollY + camera.height / 2).setScale(1 / camera.zoom);
            }
        }
    }

    /**
     * Orezanie: objekty mimo záberu sa nekreslia (svet má tisíce kresieb, v zábere hry
     * je len zlomok z nich). Prejsť všetky kresby trvá vyše 3 ms, preto sa prechod rozdelí
     * na CULL.slices snímok – každá kresba sa preverí každý tretí snímok (aj postavy, ktoré
     * do záberu práve vchádzajú); rezerva okolo záberu je dosť široká, aby to nebolo vidno.
     * Keď sa svet práve ukázal, preveria sa všetky kresby naraz.
     * @param {boolean} [all=false] - preveriť všetky kresby v tomto snímku
     */
    cull(all = false) {
        const camera = this.cameras.main;
        const half = { x: camera.width / 2 / camera.zoom * 1.05, y: camera.height / 2 / camera.zoom * 1.05 };
        const mid = { x: camera.scrollX + camera.width / 2, y: camera.scrollY + camera.height / 2 };
        this.cullSlice = (this.cullSlice + 1) % CULL.slices;
        for (const [{ list }, margin] of [[this.groundLayer, CULL.ground], [this.layer, CULL.objects]]) {
            const left = mid.x - half.x - margin.side;
            const right = mid.x + half.x + margin.side;
            const top = mid.y - half.y - margin.above;
            const bottom = mid.y + half.y + margin.below;
            for (let i = all ? 0 : this.cullSlice; i < list.length; i += all ? 1 : CULL.slices) {
                const object = list[i];
                object.visible = object.x > left && object.x < right && object.y > top && object.y < bottom;
            }
        }
    }

    /** Dlaždice vody v zábere kamery (obnovuje sa dvakrát za sekundu). */
    findVisibleWater() {
        const view = this.cameras.main.worldView;
        this.visibleWater = this.waterTiles.filter(water => Phaser.Geom.Rectangle.Contains(view, water.x, water.y));
    }

    /** Za slnka občas preletí nad dedinou kŕdeľ vtákov (pôvodná dvojsnímková animácia letu). */
    scheduleBirds() {
        const next = () => {
            if (this.weather !== 'rain' && this.mode !== 'idle') {
                this.launchFlock();
            }
            this.time.delayedCall(Phaser.Math.Between(...BIRDS.every), next);
        };
        this.time.delayedCall(Phaser.Math.Between(...BIRDS.every), next);
    }

    /** Dva až štyri vtáky preletia cez to, čo práve vidí kamera, v miernom oblúku. */
    launchFlock() {
        const view = this.cameras.main.worldView;
        const toRight = Math.random() < 0.5;
        const startY = view.y + view.height * Phaser.Math.FloatBetween(0.15, 0.55);
        const count = Phaser.Math.Between(2, 4);
        for (let i = 0; i < count; i++) {
            const from = { x: toRight ? view.x - 200 - i * 90 : view.right + 200 + i * 90, y: startY + Phaser.Math.Between(-60, 60) };
            this.flyBird(from, { x: toRight ? view.right + 300 : view.x - 300, y: from.y - view.height * 0.2 }, Phaser.Math.Between(7000, 9500), i * 160);
        }
    }

    /**
     * Jeden vták letí z bodu do bodu a mává krídlami (kresba hľadí doprava – pri lete
     * doľava sa zrkadlí). Pri prílete aj odlete sa zjaví a zmizne.
     */
    flyBird(from, to, duration, delay = 0) {
        const bird = this.layer.add(this.add.sprite(from.x, from.y, 'vtak').play('let'));
        bird.setDepth(SKY_DEPTH + 1).setScale(0.8).setAlpha(0).setFlipX(to.x < from.x);
        this.tweens.add({
            targets: bird,
            x: { value: to.x, ease: 'Linear' },
            y: { value: to.y, ease: 'Sine.easeInOut' },
            alpha: { from: 0, to: 1, duration: 600, ease: 'Linear' },
            duration,
            delay,
            onComplete: () => bird.destroy()
        });
    }

    // ---------------------------------------------------------------- ľudia

    /**
     * Obyvatelia, ktorí sú v dedine stále: dvaja susedia sa rozprávajú pri studni na
     * námestí (občas sa jeden obzrie či pohne) a jeden sa pomaly prechádza po promenáde
     * okolo bludiska, na rohoch postojí.
     */
    addResidents() {
        const [left, right] = this.village.chatSpot();
        const first = this.addFigure(left, TILES.villagers.sun[1]);
        const second = this.addFigure(right, TILES.villagers.sun[0]).setFlipX(true);
        for (const [figure, cell] of [[first, left], [second, right]]) {
            this.fadeWithDistance(figure, cell.x, cell.y);
            this.time.addEvent({
                delay: Phaser.Math.Between(2500, 4000),
                loop: true,
                callback: () => this.tweens.add({ targets: figure, y: figure.y - 4, duration: 160, yoyo: true, ease: 'Sine.easeOut' })
            });
        }
        this.time.addEvent({ delay: 7000, loop: true, callback: () => first.toggleFlipX() });
        this.stroll(this.addFigure({ x: -RINGS.walk, y: Math.floor(this.maze.size / 2) }, TILES.villagers.sun[0]));
    }

    /**
     * Prechádzka po promenáde (pás 1) na ľavej strane bludiska – tam, kde nie je brána
     * a nerozpráva sa príbeh: tam a späť, na konci postojí a obzrie sa.
     */
    async stroll(figure) {
        const last = this.maze.size - 1;
        const ends = [toScreen(-RINGS.walk, 2), toScreen(-RINGS.walk, last - 2)];
        let index = 0;
        while (figure.active) {
            await walkPath(this, figure, [{ x: figure.x, y: figure.getData('groundY') ?? figure.y }, ends[index]], STROLLER.speed, false, 0);
            index = 1 - index;
            await new Promise(resolve => this.time.delayedCall(Phaser.Math.Between(...STROLLER.rest), resolve));
        }
    }

    /** Ľudia prichádzajú a odchádzajú; nový chodec príde každých niekoľko sekúnd, kým ich nie je VILLAGERS.max. */
    startVillagers() {
        for (let i = 0; i < 2; i++) {
            this.sendVillager(true);
        }
        const next = () => {
            if (this.villagers.length < VILLAGERS.max) {
                this.sendVillager(false);
            }
            this.time.delayedCall(Phaser.Math.Between(...VILLAGERS.every), next);
        };
        this.time.delayedCall(Phaser.Math.Between(...VILLAGERS.every), next);
    }

    /**
     * Jeden chodec: vyjde z dverí (domu, kostola, zámku, stodoly) alebo príde z kraja
     * dediny a po cestách prejde k inému cieľu, kde vojde dnu alebo odíde. Trasu po
     * cestách nájde algoritmus A* (rovnaký ako pri chôdzi hráča); na zákrutách sa
     * chodec občas zastaví a obzrie.
     * @param {boolean} midway - chodec je už na ceste (pri postavení sveta)
     */
    async sendVillager(midway) {
        if (this.staged) {
            return;
        }
        const targets = this.village.destinations();
        const from = Phaser.Utils.Array.GetRandom(targets);
        const to = Phaser.Utils.Array.GetRandom(targets.filter(cell => cell !== from));
        const route = this.roadRoute(from, to);
        if (route.length < 3) {
            return;
        }
        const cells = midway ? route.slice(Phaser.Math.Between(1, Math.floor(route.length / 2))) : route;
        const points = this.corners(cells).map(cell => toScreen(cell.x, cell.y));
        const frame = Phaser.Utils.Array.GetRandom(TILES.villagers[this.weather] ?? TILES.villagers.sun);
        // každý chodí inak: deti sú menšie a ponáhľajú sa, dospelí idú rôzne rýchlo
        const child = Math.random() < VILLAGERS.children;
        const speed = VILLAGERS.speed * (child ? 1.3 : Phaser.Math.FloatBetween(0.8, 1.15));
        const walker = this.layer.add(this.add.image(points[0].x, points[0].y, 'mesto', frame));
        walker.setDepth(depthAt(points[0].y, LAYER.figure)).setAlpha(0).setScale(child ? VILLAGERS.childScale : 1);
        this.villagers.push(walker);
        this.tweens.add({ targets: walker, alpha: 1, duration: 500 });
        await walkPath(this, walker, points, speed, TILES.villagersLeft.includes(frame), VILLAGERS.pause);
        if (!walker.active) {
            return;
        }
        this.tweens.add({ targets: walker, alpha: 0, duration: 500, onComplete: () => this.removeVillager(walker) });
    }

    /** Najkratšia trasa po cestách dediny (A* zo knižnice rot.js) vrátane počiatočnej a cieľovej bunky. */
    roadRoute(from, to) {
        const route = [];
        const passable = (x, y) => (x === from.x && y === from.y) || (x === to.x && y === to.y) || this.village.isWalkable(x, y);
        new ROT.Path.AStar(to.x, to.y, passable, { topology: 4 }).compute(from.x, from.y, (x, y) => route.push({ x, y }));
        return route;
    }

    /** Z trasy po bunkách ponechá len začiatok, zákruty a koniec (chôdza po rovných úsekoch). */
    corners(cells) {
        return cells.filter((cell, i) => {
            if (i === 0 || i === cells.length - 1) {
                return true;
            }
            const before = cells[i - 1];
            const after = cells[i + 1];
            return (cell.x - before.x) !== (after.x - cell.x) || (cell.y - before.y) !== (after.y - cell.y);
        });
    }

    /**
     * Záverečná scéna potrebuje voľný záber: chodci, ktorí sú práve na ceste, zmiznú
     * a noví už neprídu (ako uzavretá ulica počas natáčania).
     */
    clearStage() {
        this.staged = true;
        for (const walker of this.villagers) {
            this.tweens.killTweensOf(walker);
            this.tweens.add({ targets: walker, alpha: 0, duration: 700, onComplete: () => this.removeVillager(walker) });
        }
    }

    /** Chodec odišiel (vošiel do domu alebo z dediny). */
    removeVillager(walker) {
        this.villagers = this.villagers.filter(item => item !== walker);
        walker.destroy();
    }

    // =========================================================================
    //  Kamera
    // =========================================================================

    /**
     * Výrezy kamery: celý ostrov sveta (ilustrácia v knihe), obdĺžnik vpísaný do
     * kosoštvorca sveta (hranice počas hry – okraj sveta nikdy nevidno) a obdĺžnik
     * bludiska s jedným pásom okolia (záber počas hry).
     */
    computeFrames() {
        const camera = this.cameras.main;
        const last = this.maze.size - 1;
        const first = -this.margin;
        const end = last + this.margin;
        const middle = toScreen(last / 2, last / 2);
        this.center = middle;
        this.island = new Phaser.Geom.Rectangle(
            toScreen(first, end).x - TILE.halfWidth, toScreen(first, first).y - 400,
            toScreen(end, first).x - toScreen(first, end).x + 2 * TILE.halfWidth, toScreen(end, end).y - toScreen(first, first).y + 500);
        this.mazeRect = this.areaRect(1, PLAY_TOP_MARGIN);

        // najväčší obdĺžnik s pomerom strán obrazovky vpísaný do kosoštvorca |x|/A + |y|/B ≤ 1
        const aspect = camera.width / camera.height;
        const cells = this.maze.size + 2 * this.margin - 4;
        const halfA = cells * TILE.halfWidth;
        const halfB = cells * TILE.halfHeight;
        const halfHeight = 1 / (aspect / halfA + 1 / halfB);
        this.cover = new Phaser.Geom.Rectangle(middle.x - aspect * halfHeight, middle.y - halfHeight, 2 * aspect * halfHeight, 2 * halfHeight);
        this.islandZoom = ISLAND_MARGIN * Math.min(camera.width / this.island.width, camera.height / this.island.height);
        const fit = Math.min(camera.width / this.mazeRect.width, camera.height / this.mazeRect.height);
        this.playZoom = Phaser.Math.Clamp(fit, camera.width / this.cover.width, ZOOM.max);
        this.talkZoom = Phaser.Math.Clamp(camera.height / 1100, this.playZoom, ZOOM.max) * ZOOM.talk;
    }

    /** Obdĺžnik bludiska a daného počtu pásov okolo neho vo svetových súradniciach (s okrajom nad ním). */
    areaRect(rings, topMargin) {
        const first = -rings;
        const last = this.maze.size - 1 + rings;
        const left = toScreen(first, last).x - TILE.halfWidth;
        const right = toScreen(last, first).x + TILE.halfWidth;
        const top = toScreen(first, first).y - TILE.halfHeight - topMargin;
        const bottom = toScreen(last, last).y + TILE.halfHeight + TILE.cubeHeight;
        return new Phaser.Geom.Rectangle(left, top, right - left, bottom - top);
    }

    /** Kamera ukáže celý ostrov sveta – presne tak, ako ho ukazuje ilustrácia v knihe. */
    frameOverview() {
        const camera = this.cameras.main;
        camera.stopFollow().removeBounds().setZoom(this.islandZoom).centerOn(this.island.centerX, this.island.centerY);
    }

    /**
     * Nakreslí celý ostrov mimo obrazovky do textúry (DynamicTexture) s vlastnou kamerou
     * pri pohľade na celý ostrov – bez papiera, len atrament na bielom. Hráč pritom nič
     * nevidí: kreslí sa aj vtedy, keď hra spí, a kamera sveta zostane tam, kde je.
     * @param {string} key - kľúč textúry
     * @param {Phaser.GameObjects.GameObject[]} objects - čo sa nakreslí
     * @param {number} [scale=1] - rozlíšenie textúry ako podiel plátna
     * @returns {Phaser.Textures.DynamicTexture}
     */
    renderIsland(key, objects, scale = 1) {
        const width = Math.round(this.scale.width * scale);
        const height = Math.round(this.scale.height * scale);
        const texture = this.textures.exists(key) ? this.textures.get(key) : this.textures.addDynamicTexture(key, width, height);
        if (texture.width !== width || texture.height !== height) {
            texture.setSize(width, height);
        }
        texture.camera.setZoom(this.islandZoom * scale).centerOn(this.island.centerX, this.island.centerY);
        texture.fill(0xffffff).draw(objects).render();
        return texture;
    }

    /**
     * Obraz celého ostrova pre pohľad z výšky. Kreslí sa po stavbe sveta a pred letom
     * zo sveta do knihy, aby zodpovedal tomu, čo je vo svete práve vidno.
     */
    drawFarView() {
        const layers = [this.groundLayer, this.surfaceLayer, this.layer];
        for (const layer of layers) {
            layer.setVisible(true);
        }
        for (const layer of [this.groundLayer, this.layer]) {
            for (const object of layer.list) {
                object.visible = true;   // orezanie platí pre kameru sveta, nie pre obraz z výšky
            }
        }
        this.renderIsland(FAR.key, layers);
        this.farView.setTexture(FAR.key).setPosition(this.island.centerX, this.island.centerY)
            .setDisplaySize(this.scale.width / this.islandZoom, this.scale.height / this.islandZoom);
        this.farReady = true;
        this.applyDetail();
    }

    /**
     * Kresba celého ostrova do knihy (obraz z výšky, v epilógu s prejdenou cestou
     * červeným atramentom). Grafická karta ju nakreslí do textúry v polovičnom rozlíšení
     * (na strane knihy je kresba malá) a až o dva snímky neskôr, keď je hotová, sa pixely
     * prečítajú – čítanie potom nemusí čakať na grafickú kartu.
     * @param {boolean} [withRoute=false] - do kresby sa zakreslí prejdená cesta
     * @returns {Promise<string>} adresa obrázka PNG (blob:) pre stranu knihy
     */
    async drawIllustration(withRoute = false) {
        const route = withRoute ? this.drawRoute(ROUTE.width / (this.islandZoom * ILLUSTRATION.scale)) : null;
        const { visible, alpha } = this.farView;
        this.farView.setVisible(true).setAlpha(1);
        const texture = this.renderIsland(ILLUSTRATION.key, route ? [this.farView, route] : [this.farView], ILLUSTRATION.scale);
        this.farView.setVisible(visible).setAlpha(alpha);
        route?.destroy();
        this.game.renderer.gl.flush();
        for (let i = 0; i < ILLUSTRATION.settle; i++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        return this.readTexture(texture);
    }

    /**
     * Pixely textúry (WebGL readPixels z jej framebuffera) ako obrázok PNG pre stránku.
     * Biela sa zmení na priehľadnosť („farba na alfu“): z každého pixela zostane len
     * atrament s priehľadnosťou podľa sýtosti – na papieri strany potom vyzerá rovnako
     * ako násobenie farieb, ale prehliadač nemusí miešať vrstvy v každom snímku.
     * WebGL číta riadky zdola nahor, preto sa pri prevode riadky obrátia.
     * @returns {Promise<string>} adresa obrázka (blob:)
     */
    async readTexture(texture) {
        const gl = this.game.renderer.gl;
        const { width, height } = texture;
        const pixels = new Uint8ClampedArray(width * height * 4);
        const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        gl.bindFramebuffer(gl.FRAMEBUFFER, texture.drawingContext.framebuffer.webGLFramebuffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
        const image = new ImageData(width, height);
        const out = image.data;
        for (let y = 0; y < height; y++) {
            let from = (height - 1 - y) * width * 4;
            let to = y * width * 4;
            for (let x = 0; x < width; x++, from += 4, to += 4) {
                const white = Math.min(pixels[from], pixels[from + 1], pixels[from + 2]);   // koľko bielej v pixeli je
                const ink = 255 - white;
                if (ink > 0) {
                    out[to] = (pixels[from] - white) * 255 / ink;
                    out[to + 1] = (pixels[from + 1] - white) * 255 / ink;
                    out[to + 2] = (pixels[from + 2] - white) * 255 / ink;
                }
                out[to + 3] = ink;
            }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').putImageData(image, 0, 0);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        return URL.createObjectURL(blob);
    }

    /**
     * Úroveň detailov podľa priblíženia kamery: z výšky obraz ostrova, zblízka živý svet
     * (orezaný na záber kamery), medzi tým prelínanie. Pri zahrievaní (forceLive) sa
     * kreslí živý svet vždy.
     */
    applyDetail() {
        const ratio = this.cameras.main.zoom / this.islandZoom;
        const far = this.farReady && !this.forceLive ? 1 - Phaser.Math.SmoothStep(ratio, FAR.from, FAR.to) : 0;
        const live = far < 1;
        this.groundLayer.setVisible(live);
        this.surfaceLayer.setVisible(live);
        this.layer.setVisible(live);
        this.farView.setVisible(far > 0).setAlpha(far);
        if (live) {
            this.cull(this.forceLive || !this.wasLive);   // svet sa práve ukázal (alebo prebúdza) – všetko naraz
        }
        this.wasLive = live;
    }

    /**
     * Body prejdenej cesty: od záhradníka cez vstup, všetky bunky, ktorými hráč prešiel
     * (aj slepé uličky), až k babke. Body sú mierne rozochvené ako pri kreslení rukou;
     * náhoda má pevné semienko, preto je čiara vo svete aj v kresbe knihy rovnaká.
     * @returns {{x, y}[]} body vo svetových súradniciach
     */
    routePoints() {
        const cells = [...this.places.entryWalk.slice(0, -1), ...this.trail, ...this.places.exitWalk]
            .filter((cell, i, all) => i === 0 || cell.x !== all[i - 1].x || cell.y !== all[i - 1].y);
        const random = new Phaser.Math.RandomDataGenerator([String(this.maze.seed)]);
        return cells.map(cell => toScreen(cell.x + random.realInRange(-1, 1) * ROUTE.wobble, cell.y + random.realInRange(-1, 1) * ROUTE.wobble));
    }

    /**
     * Čiara cesty (alebo jej začiatok po dĺžku length) do grafiky. Spoje sú okrúhle
     * (kruh v každom zlome), čiara je nepriehľadná – kde sa cesta vracia, nestmavne.
     * @param {Phaser.GameObjects.Graphics} line - grafika, do ktorej sa kreslí
     * @param {{x, y}[]} points - body cesty
     * @param {number} width - hrúbka čiary (px sveta)
     * @param {number} [length=Infinity] - po akú dĺžku (px sveta) sa kreslí
     * @returns {{x, y}} koniec nakreslenej časti (hrot pera)
     */
    strokeRoute(line, points, width, length = Infinity) {
        line.lineStyle(width, ROUTE.color, 1).fillStyle(ROUTE.color, 1);
        let left = length;
        let tip = points[0];
        line.fillCircle(tip.x, tip.y, width / 2);
        for (let i = 1; i < points.length && left > 0; i++) {
            const from = points[i - 1];
            const segment = Phaser.Math.Distance.Between(from.x, from.y, points[i].x, points[i].y);
            const t = Math.min(1, left / Math.max(segment, 0.001));
            tip = { x: Phaser.Math.Linear(from.x, points[i].x, t), y: Phaser.Math.Linear(from.y, points[i].y, t) };
            line.lineBetween(from.x, from.y, tip.x, tip.y);
            line.fillCircle(tip.x, tip.y, width / 2);
            left -= segment;
        }
        return tip;
    }

    /**
     * Celá prejdená cesta ako samostatná grafika (do kresby v knihe).
     * @param {number} width - hrúbka čiary (px sveta)
     */
    drawRoute(width) {
        const line = this.make.graphics({}, false);
        this.strokeRoute(line, this.routePoints(), width);
        return line;
    }

    /**
     * Papier sveta: jedna opakovaná textúra (TileSprite) nad celou kresbou, ktorá sa s ňou
     * násobí (MULTIPLY) – biela plocha prevezme farbu a zrno papiera, atrament zostane tmavý.
     * Je taká veľká, aby pokryla každý záber kamery; ľavý horný roh leží na celom násobku
     * periódy textúry, takže papier je ukotvený k začiatku súradníc sveta (rovnako ho počíta
     * okraj listu v SkyScene). Bublina s textom sa kreslí až nad papierom.
     */
    createPaper() {
        const source = this.textures.get(PAPER.key).getSourceImage();
        const period = { x: source.width * PAPER.scale, y: source.height * PAPER.scale };
        const count = { x: 2 * Math.ceil(PAPER_SPAN / period.x / 2), y: 2 * Math.ceil(PAPER_SPAN / period.y / 2) };
        const left = -count.x / 2 * period.x;
        const top = -count.y / 2 * period.y;
        return this.add.tileSprite(left, top, count.x * period.x, count.y * period.y, PAPER.key)
            .setOrigin(0, 0).setTileScale(PAPER.scale).setDepth(PAPER_DEPTH).setBlendMode(Phaser.BlendModes.MULTIPLY);
    }

    /**
     * Plynulý let kamery ako pri približovaní mapy: priblíženie sa mení geometricky
     * (z = z0^(1−t) · z1^t – každý rovnaký úsek času zväčší obraz rovnakým pomerom)
     * a cieľ letu sa po obrazovke presúva rovnomerne do stredu záberu. Stred kamery
     * sa z toho dopočíta: c(t) = cieľ − s(t) / z(t), kde s(t) je poloha cieľa na obrazovke.
     * Kamera tak nikdy „neuhýba“ do strany ani nepreletí ponad cieľ.
     * @returns {Promise<void>} splní sa po prílete
     */
    flyCamera(center, zoom, duration, ease = 'Sine.easeInOut') {
        const camera = this.cameras.main;
        camera.stopFollow().removeBounds();
        // stred záberu zo súčasnej polohy (midPoint sa obnovuje až pri vykreslení)
        const from = { x: camera.scrollX + camera.width / 2, y: camera.scrollY + camera.height / 2, zoom: camera.zoom };
        const offset = { x: (center.x - from.x) * from.zoom, y: (center.y - from.y) * from.zoom };   // cieľ na obrazovke (px)
        return new Promise(resolve => {
            this.tweens.addCounter({
                from: 0,
                to: 1,
                duration,
                ease,
                onUpdate: tween => {
                    const t = tween.getValue();
                    const z = Math.exp(Phaser.Math.Linear(Math.log(from.zoom), Math.log(zoom), t));
                    camera.setZoom(z);
                    camera.centerOn(center.x - offset.x * (1 - t) / z, center.y - offset.y * (1 - t) / z);
                },
                onComplete: () => resolve()
            });
        });
    }

    /**
     * Kamera ukáže bod sveta na danom mieste obrazovky pri danom priblížení.
     * @param {{x, y}} point - bod sveta
     * @param {{x, y}} screen - kde má bod na obrazovke byť (px CSS)
     * @param {number} zoom - priblíženie kamery
     */
    lookAt(point, screen, zoom) {
        const ratio = this.scale.width / innerWidth;   // pixely plátna na jeden pixel CSS
        this.cameras.main.stopFollow().removeBounds().setZoom(zoom)
            .centerOn(point.x - (screen.x - innerWidth / 2) * ratio / zoom, point.y - (screen.y - innerHeight / 2) * ratio / zoom);
    }

    /**
     * Spoločný záber s kamerou knihy: kameru sveta riadi funkcia času, ktorú pripravil
     * režisér. Volá sa tesne pred vykreslením každého snímku s časom toho snímku – rovnaký
     * čas dostáva aj kamera knihy, preto sú kniha a svet v každom snímku presne zosúladené.
     * @param {function|null} shot - time => {point, screen, zoom, done}; null záber ukončí
     * @returns {Promise<void>} splní sa, keď funkcia oznámi koniec záberu
     */
    followShot(shot) {
        this.shotDone?.();
        this.shot = shot;
        this.shotDone = null;
        return shot ? new Promise(resolve => {
            this.shotDone = resolve;
        }) : Promise.resolve();
    }

    /** Stred medzi dvoma postavami (záber na rozhovor), trochu nad ich hlavami. */
    twoShot(a, b) {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 120 };
    }

    /**
     * Záber na celé bludisko (počas hry).
     * @param {number} [heightShare=1] - časť výšky obrazovky, ktorú záber smie zabrať (vo filme sú čierne pásy)
     */
    framePlay(duration = 1600, heightShare = 1) {
        const camera = this.cameras.main;
        const zoom = heightShare < 1
            ? Math.min(camera.width / this.mazeRect.width, camera.height * heightShare / this.mazeRect.height)
            : this.playZoom * this.userZoom;
        return this.flyCamera({ x: this.mazeRect.centerX, y: this.mazeRect.centerY }, zoom, duration);
    }

    /**
     * Pri zmene veľkosti okna sa prepočítajú výrezy; počas hry sa kamera hneď
     * nastaví na celé bludisko, ilustrácia v knihe sa obnoví pri ďalšom pohľade.
     */
    handleResize() {
        if (!this.layer) {
            return;
        }
        this.computeFrames();
        if (this.mode === 'idle') {
            this.frameOverview();
        } else if (this.mode === 'play') {
            this.cameras.main.setZoom(this.playZoom * this.userZoom);
        }
    }

    /**
     * Kamera počas hry (každý snímok): priblíženie sa plynulo blíži k cieľu kolieska
     * (v logaritmickej mierke – rovnaký zárez je vždy rovnako veľký krok), stred záberu
     * k cieľu, ktorý sa mieša medzi stredom bludiska a postavou podľa priblíženia.
     * Záber nikdy nevyjde za okraj sveta (obdĺžnik cover).
     */
    updatePlayCamera(delta) {
        const camera = this.cameras.main;
        const target = this.playZoom * this.userZoom;
        const zoom = Math.exp(Phaser.Math.Linear(Math.log(camera.zoom), Math.log(target), 1 - Math.exp(-delta / PLAY_CAMERA.zoomTime)));
        const close = Phaser.Math.Clamp((zoom / this.playZoom - 1) / PLAY_CAMERA.follow, 0, 1);
        const goal = {
            x: Phaser.Math.Linear(this.mazeRect.centerX, this.player.x, close),
            y: Phaser.Math.Linear(this.mazeRect.centerY, this.player.y - PLAY_CAMERA.headroom, close)
        };
        const move = 1 - Math.exp(-delta / PLAY_CAMERA.moveTime);
        const half = { x: camera.width / 2 / zoom, y: camera.height / 2 / zoom };
        const keepInside = (value, from, size, halfView) =>
            (size <= 2 * halfView ? from + size / 2 : Phaser.Math.Clamp(value, from + halfView, from + size - halfView));
        this.view.x = keepInside(Phaser.Math.Linear(this.view.x, goal.x, move), this.cover.x, this.cover.width, half.x);
        this.view.y = keepInside(Phaser.Math.Linear(this.view.y, goal.y, move), this.cover.y, this.cover.height, half.y);
        camera.setZoom(zoom).centerOn(this.view.x, this.view.y);
    }

    // =========================================================================
    //  Rozhovory
    // =========================================================================

    /**
     * Bublina s textom nad postavou. Postava vetu povie (nahrávka hlasu) a text sa píše
     * po slovách v rytme reči; keď dohovorí a veta sa dá dočítať, bublina sa sama zavrie.
     * Kliknutie (medzerník, Enter) vetu hneď dopíše, ďalšie bublinu zavrie.
     * Písmo má vo svete takú veľkosť, aby bolo na obrazovke rovnako veľké pri každom priblížení.
     * @param {Phaser.GameObjects.Image} speaker - postava, ktorá hovorí
     * @param {{name: string}} person - postava zo scenára (meno malým písmom nad textom)
     * @param {string} text - čo postava povie
     * @returns {Promise<void>} splní sa, keď sa bublina zavrie
     */
    say(speaker, person, text) {
        const camera = this.cameras.main;
        const size = camera.height * SPEECH.fontShare / camera.zoom;
        const width = size * 15;
        const style = { fontFamily: 'Caveat', color: '#1f1e1c', wordWrap: { width } };
        const label = this.add.text(0, 0, person.name, { ...style, fontSize: `${Math.round(size * 0.62)}px`, color: '#6b5b4b' }).setOrigin(0, 0);
        const body = this.add.text(0, 0, text, { ...style, fontSize: `${Math.round(size)}px`, lineSpacing: -size * 0.15 }).setOrigin(0, 0);
        const padding = size * 1.1;
        const frameWidth = Math.max(body.width, label.width) + 2 * padding;
        const frameHeight = label.height + body.height + 1.6 * padding;
        const frame = this.add.nineslice(0, 0, 'bublina', undefined, frameWidth, frameHeight, 40, 40, 40, 40).setOrigin(0, 1);
        label.setPosition(padding, -frameHeight + padding * 0.75);
        body.setPosition(padding, label.y + label.height * 0.85);
        const more = this.add.text(frameWidth - padding * 0.6, -padding * 0.55, '›', { ...style, fontSize: `${Math.round(size)}px` }).setOrigin(1, 1).setAlpha(0);
        this.tweens.add({ targets: more, x: more.x + size * 0.12, duration: 500, yoyo: true, repeat: -1 });

        // bublina je biely papierik s textom – kreslí sa nad svetom bez násobenia; polohu
        // nad hovoriacim jej každý snímok nastaví placeBubble (vždy celá v zábere)
        this.bubble?.destroy();
        const bubble = this.add.container(0, 0, [frame, label, body, more]).setDepth(SKY_DEPTH + 2).setAlpha(0);
        bubble.setData({ speaker, width: frameWidth, height: frameHeight, size, rise: 10 });
        this.bubble = bubble;
        this.placeBubble();
        this.tweens.add({ targets: bubble, alpha: 1, duration: 260, ease: 'Sine.easeOut' });
        this.tweens.addCounter({ from: 10, to: 0, duration: 260, ease: 'Sine.easeOut', onUpdate: tween => bubble.setData('rise', tween.getValue()) });

        const line = this.writeLine(body, text, () => more.setAlpha(1));
        return new Promise(resolve => {
            const close = () => {
                this.input.off('pointerdown', advance);
                this.input.keyboard.off('keydown-SPACE', advance);
                this.input.keyboard.off('keydown-ENTER', advance);
                closing.remove();
                line.stop();
                this.sounds?.effect('bubble', SPEECH.pop);
                this.tweens.add({ targets: bubble, alpha: 0, duration: 180, onComplete: () => bubble.destroy() });
                this.bubble = null;
                resolve();
            };
            const closing = this.time.delayedCall(Math.max(line.spoken, text.length * SPEECH.readPerChar) + SPEECH.hold, close);
            const advance = () => (line.done ? close() : line.complete());
            // posledné kliknutie, ktoré bublinu otvorilo, sa nesmie započítať
            this.time.delayedCall(120, () => {
                this.input.on('pointerdown', advance);
                this.input.keyboard.on('keydown-SPACE', advance);
                this.input.keyboard.on('keydown-ENTER', advance);
            });
        });
    }

    /**
     * Bublina rozhovoru vpravo hore od hlavy hovoriaceho (pri pravom okraji záberu vľavo).
     * Bublina sa vždy celá zmestí do záberu – pod horný filmový pás nikdy nezájde.
     */
    placeBubble() {
        const bubble = this.bubble;
        if (!bubble) {
            return;
        }
        const { speaker, width, height, size, rise } = bubble.data.values;
        const camera = this.cameras.main;
        const half = { x: camera.width / 2 / camera.zoom, y: camera.height / 2 / camera.zoom };
        const center = { x: camera.scrollX + camera.width / 2, y: camera.scrollY + camera.height / 2 };
        // výška filmového pásu vo svete (pás je 11 % výšky okna) a okraj
        const film = document.getElementById('kino').classList.contains('film');
        const bar = film ? camera.height * FILM_BAR / camera.zoom : 0;
        const pad = size * 0.6;
        const toLeft = speaker.x + width > center.x + half.x - pad;
        let x = toLeft ? speaker.x - width + size : speaker.x - size;
        let y = speaker.y - 190 + rise;   // spodok bubliny
        x = Phaser.Math.Clamp(x, center.x - half.x + pad, center.x + half.x - pad - width);
        y = Phaser.Math.Clamp(y, center.y - half.y + bar + pad + height, center.y + half.y - bar - pad);
        bubble.setPosition(x, y);
    }

    /**
     * Veta sa píše po slovách: s nahrávkou hlasu v čase, keď slovo zaznie, bez nej
     * rovnomerne podľa počtu písmen.
     * @param {Phaser.GameObjects.Text} body - text bubliny
     * @param {string} text - veta zo scenára
     * @param {function} [onDone] - keď je veta celá napísaná
     * @returns {{spoken: number, done: boolean, complete: function(), stop: function()}} trvanie reči (ms);
     *     complete – hneď dopísať (a stíšiť hlas), stop – zastaviť písanie aj hlas
     */
    writeLine(body, text, onDone) {
        const voice = this.sounds?.speak(text);
        // riadky sa zlomia raz podľa celej vety – písaný text sa potom už nezalamuje inak a z bubliny nevyjde
        const wrapped = body.getWrappedText(text).join('\n');
        body.setWordWrapWidth(null);
        const ends = [...wrapped.matchAll(/\S+/g)].map(word => word.index + word[0].length);
        const words = text.split(' ');
        let written = 0;
        const starts = voice?.words ?? words.map(word => (written += word.length + 1) - word.length - 1).map(chars => chars * 1000 / SPEECH.charsPerSecond);
        const line = { spoken: voice?.duration ?? text.length * 1000 / SPEECH.charsPerSecond, done: false };
        const timers = starts.map((start, i) => this.time.delayedCall(start, () => body.setText(wrapped.slice(0, ends[i]))));
        line.stop = () => {
            timers.forEach(timer => timer.remove());
            voice?.stop();
        };
        line.complete = () => {
            line.stop();
            line.done = true;
            body.setText(wrapped);
            onDone?.();
        };
        timers.push(this.time.delayedCall(line.spoken, line.complete));
        body.setText('');
        return line;
    }

    /** Rozhovor: postupne všetky vety jednej postavy. */
    async dialogue(speaker, person, lines) {
        for (const line of lines) {
            await this.say(speaker, person, line);
        }
    }

    // =========================================================================
    //  Postava a jej pohyb
    // =========================================================================

    /** Začne hra: hráč ovláda postavu, plynie čas; kamera plynulo nadviaže na posledný záber. */
    startPlay() {
        const camera = this.cameras.main;
        camera.stopFollow().removeBounds();
        this.view = { x: camera.scrollX + camera.width / 2, y: camera.scrollY + camera.height / 2 };
        this.mode = 'play';
        this.trail = [{ ...this.cell }];
        this.emitHud();
    }

    /** Každý snímok: hlasitosť potoka, kamera, čas hry a pohyb podľa držaných klávesov. */
    update(time, delta) {
        if (!this.layer) {
            return;
        }
        this.updateStream();
        this.seeThroughHedges(delta);
        if (this.mode !== 'play') {
            return;
        }
        this.updatePlayCamera(delta);
        this.followThought();
        this.elapsed += delta;
        if (Math.floor(this.elapsed / 1000) !== Math.floor((this.elapsed - delta) / 1000)) {
            this.emitHud();
        }
        if (this.moving) {
            return;
        }
        for (const { keys, direction } of this.directionKeys) {
            if (keys.some(item => item.isDown || Phaser.Input.Keyboard.JustDown(item))) {
                this.tryStep(direction);
                return;
            }
        }
    }

    /**
     * Živé ploty tesne pred postavou (bližšie ku kamere), ktoré by ju zakryli, počas hry
     * plynulo priesvitnú – postavu aj chodník je vidno celé; keď postava odíde, ploty sa vrátia.
     */
    seeThroughHedges(delta) {
        const cell = toGrid(this.player.x, this.player.y);
        const front = new Set(this.mode !== 'play' ? [] : SEE_THROUGH.cells
            .map(([dx, dy]) => this.hedgeCells.get(key(cell.x + dx, cell.y + dy))).filter(Boolean));
        const step = Math.min(1, delta / SEE_THROUGH.time);
        for (const hedge of new Set([...front, ...this.seeThrough])) {
            const target = front.has(hedge) ? SEE_THROUGH.alpha : 1;
            hedge.alpha += (target - hedge.alpha) * step;
            if (target === 1 && hedge.alpha > 0.99) {
                hedge.alpha = 1;
                this.seeThrough.delete(hedge);
            } else {
                this.seeThrough.add(hedge);
            }
        }
    }

    /**
     * Tesne pred vykreslením snímku (po všetkých pohyboch): spoločný záber s knihou,
     * okraj listu a orezanie podľa konečnej polohy kamery v tomto snímku.
     */
    beforeRender(renderer, time, delta) {
        if (!this.layer || !this.sys.isActive()) {
            return;
        }
        if (this.shot) {
            const frame = this.shot(time);
            this.lookAt(frame.point, frame.screen, frame.zoom);
            if (frame.done) {
                const done = this.shotDone;
                this.shot = null;
                this.shotDone = null;
                done?.();
            }
        }
        this.placeBubble();
        this.updateHover();
        this.updateMargins(delta);
        this.applyDetail();
    }

    /** Hlasitosť šumu potoka podľa vzdialenosti stredu záberu od rieky (v bunkách). */
    updateStream() {
        const center = toGrid(this.cameras.main.midPoint.x, this.cameras.main.midPoint.y);
        const distance = Math.abs(center.y - riverAxis(this.maze, center.x));
        this.sounds?.setStream(Phaser.Math.Clamp(1 - distance / 14, 0, 1) * (this.cameras.main.zoom > this.islandZoom * 1.5 ? 1 : 0.3));
    }

    /**
     * Krok o jednu bunku daným smerom; pri stene postava len „narazí“.
     * @param {{x, y}} direction - smer z DIRECTIONS
     */
    tryStep(direction) {
        const target = { x: this.cell.x + direction.x, y: this.cell.y + direction.y };
        if (isFloor(this.maze, target.x, target.y)) {
            this.eraseRing(this.targetMark);   // hráč ide klávesmi – cieľ kliknutia už neplatí
            this.route = [target];
            this.stepNext();
        } else if (!this.bumping) {
            this.bump(direction);
        }
    }

    /**
     * Postava prejde po zadaných bunkách (aj mimo bludiska – filmová scéna).
     * @returns {Promise<void>} splní sa po dôjdení na poslednú bunku
     */
    walkThrough(cells) {
        return new Promise(resolve => {
            this.route = cells.filter((cell, i) => i > 0 || cell.x !== this.cell.x || cell.y !== this.cell.y);   // bez bunky, na ktorej už stojí
            if (this.route.length === 0) {
                resolve();
                return;
            }
            this.onRouteEnd = resolve;
            if (!this.moving) {
                this.stepNext();
            }
        });
    }

    /**
     * Krok na ďalšiu bunku trasy. Poloha sa mení rovnomerne (nadväzujúce kroky na seba
     * plynule naväzujú), postava sa pri každom z dvoch krokov na bunku zdvihne
     * (|sin 2πt|) a zakolíše; v polovici a na konci kroku dopadne noha – zvuk a stopa.
     */
    stepNext() {
        const target = this.route.shift();
        const from = toScreen(this.cell.x, this.cell.y);
        const to = toScreen(target.x, target.y);
        const direction = { x: target.x - this.cell.x, y: target.y - this.cell.y };
        if (to.x !== from.x) {
            this.player.setFlipX(to.x < from.x);   // hráč reaguje na kláves hneď, bez otáčania
        }
        this.leanTween?.stop();   // naklonenie k predmetu sa preruší, postava ide ďalej
        this.leanTween = null;
        this.moving = true;
        let halfway = false;
        this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: TIMING.step,
            onUpdate: tween => {
                const t = tween.getValue();
                this.player.x = Phaser.Math.Linear(from.x, to.x, t);
                const groundY = Phaser.Math.Linear(from.y, to.y, t);
                const phase = Math.sin(Math.PI * 2 * t);   // dva kroky na bunku
                this.player.y = groundY - Math.abs(phase) * GAIT.lift;
                this.player.setDepth(depthAt(groundY, LAYER.figure));   // plot pred postavou ju zakryje, kým ho neobíde
                this.player.angle = GAIT.sway * phase;
                if (!halfway && t >= 0.5) {
                    halfway = true;
                    this.footfall(direction, -1);
                }
            },
            onComplete: () => {
                this.footfall(direction, 1);
                this.arrive(target);
            }
        });
    }

    /**
     * Dopad nohy: zvuk kroku a stopa na zemi. Stopa leží v rovine terénu – kresba
     * chodidla sa otočí v smere chôdze a celá skupina sa zvisle stlačí v pomere
     * izometrie (b/a = 0,55), takže leží „na zemi“, nie kolmo na obrazovku.
     * @param {number} side - -1 ľavá noha, 1 pravá
     */
    footfall(direction, side) {
        if (side > 0) {
            this.sounds?.step();   // zvuk raz na bunku – dva kroky za štvrť sekundy by splývali
        }
        const angle = Math.atan2(direction.y, direction.x) + Math.PI / 4;   // smer v rovine terénu (mriežka je otočená o 45°)
        const sideways = { x: -Math.sin(angle) * FOOTPRINT.offset * side, y: Math.cos(angle) * FOOTPRINT.offset * side };
        const print = this.add.image(0, 0, 'stopa').setScale(FOOTPRINT.scale).setRotation(angle + Math.PI / 2).setFlipX(side < 0);
        const ground = this.add.container(this.player.x + sideways.x, this.player.y + sideways.y * TILE.halfHeight / TILE.halfWidth, [print]);
        // stopa leží na povrchu nad chodníkom, pod postavami
        const diagonal = Math.round(this.player.y / TILE.halfHeight);
        ground.setScale(1, TILE.halfHeight / TILE.halfWidth).setDepth(depthOf(diagonal, LAYER.footprint)).setAlpha(0.55);
        this.surfaceLayer.add(ground);
        this.footprints.push(ground);
        this.tweens.add({ targets: ground, alpha: 0, delay: FOOTPRINT.life, duration: 3000, onComplete: () => this.removeFootprint(ground) });
        if (this.footprints.length > FOOTPRINT.max) {
            this.removeFootprint(this.footprints[0]);
        }
    }

    /** Odstráni stopu zo sveta aj zo zoznamu. */
    removeFootprint(print) {
        this.footprints = this.footprints.filter(item => item !== print);
        print.destroy();
    }

    /** Postava stojí na novej bunke: počítadlo, zväzok kresieb, cieľ, ďalší krok trasy. */
    arrive(cell) {
        this.cell = { ...cell };
        this.player.setDepth(depthOf(cell.x + cell.y, LAYER.figure));
        this.moving = false;
        if (this.mode === 'play') {
            this.steps++;
            this.trail.push({ ...cell });
            this.emitHud();
            if (this.steps === 1) {
                this.game.events.emit('first-move');
            }
            const page = this.checkPage(cell);
            if (cell.x === this.maze.exit.x && cell.y === this.maze.exit.y) {
                this.reachExit();
                return;
            }
            if (!page) {
                this.noticeSurroundings(cell);
            }
        }
        if (this.route.length > 0) {
            this.stepNext();
            return;
        }
        this.eraseRing(this.targetMark);
        this.player.angle = 0;
        const done = this.onRouteEnd;
        this.onRouteEnd = null;
        done?.();
    }

    /** Krátky náraz do živého plota. */
    bump(direction) {
        this.noticeObstacle({ x: this.cell.x + direction.x, y: this.cell.y + direction.y });
        const nudge = toScreen(this.cell.x + direction.x * 0.12, this.cell.y + direction.y * 0.12);
        this.bumping = true;
        this.moving = true;
        this.tweens.add({
            targets: this.player,
            x: nudge.x,
            y: nudge.y,
            duration: 80,
            yoyo: true,
            ease: 'Sine.easeOut',
            onComplete: () => {
                this.moving = false;
                this.time.delayedCall(220, () => {
                    this.bumping = false;
                });
            }
        });
    }

    /** Naplánuje cestu algoritmom A* a postava po nej prejde. */
    walkTo(goal) {
        this.route = findPath(this.maze, this.cell, goal);
        if (!this.moving && this.route.length > 0) {
            this.stepNext();
        }
    }

    /** Ukážka riešenia: postava prejde k výstupnej bráne sama po najkratšej ceste. */
    walkToExit() {
        if (this.mode !== 'play') {
            return;
        }
        this.usedDemo = true;
        this.walkTo(this.maze.exit);
        this.drawRing(this.targetMark, this.maze.exit, RING.target);
    }

    /** Oznámi režisérovi aktuálny čas a počet krokov. */
    emitHud() {
        this.game.events.emit('hud-update', { time: this.elapsed, steps: this.steps });
    }

    // ---------------------------------------------------------------- zväzky a cieľ

    /** Ak na bunke leží zväzok kresieb, hráč ho zdvihne: zväzok vyletí nahor a zmizne. */
    checkPage(cell) {
        const item = this.pages.find(entry => !entry.found && entry.cell.x === cell.x && entry.cell.y === cell.y);
        if (!item) {
            return false;
        }
        item.found = true;
        const index = this.found++;
        if (this.found === PAGE_COUNT) {
            this.drawRing(this.gateMark, this.maze.exit, RING.gate);   // zväzky sú pokope – cieľom je brána
        }
        item.sparkle.stop();
        this.sounds?.effect('pencil', 0.7);
        const camera = this.cameras.main;
        const screen = { x: (item.page.x - camera.worldView.x) * camera.zoom, y: (item.page.y - camera.worldView.y) * camera.zoom };
        this.tweens.add({
            targets: item.page,
            y: item.page.y - 140,
            angle: 25,
            scale: 1.6,
            alpha: 0,
            duration: 700,
            ease: 'Cubic.easeIn',
            onComplete: () => item.page.destroy()
        });
        this.game.events.emit('page-found', { index, x: screen.x / camera.width, y: screen.y / camera.height });
        return true;
    }

    // ---------------------------------------------------------------- myšlienky postavy

    /**
     * Postava si všíma okolie: keď príde k studni, stĺpu či záhonu v zákutí, otočí sa
     * k nemu, nakloní sa a pomyslí si niečo o ňom (pri každom predmete raz). V slepej
     * uličke a pred výstupnou bránou má vlastné myšlienky.
     */
    noticeSurroundings(cell) {
        if (this.usedDemo) {
            return;   // pri ukážke riešenia postava len kráča
        }
        for (const direction of DIRECTIONS) {
            const near = { x: cell.x + direction.x, y: cell.y + direction.y };
            const kind = this.nooks.get(key(near.x, near.y));
            if (kind && !this.noticed.has(key(near.x, near.y)) && this.think(this.nextThought(kind))) {
                this.noticed.add(key(near.x, near.y));
                this.leanTowards(near);
                return;
            }
        }
        // v miestnosti pred bránou si postava spomenie na chýbajúce zväzky (so všetkými ide rovno k babke)
        const room = { x: this.maze.exit.x, y: this.maze.exit.y - 1 };
        if (cell.x === room.x && cell.y === room.y && this.route.length === 0 && this.found < PAGE_COUNT && !this.noticed.has('brana')) {
            if (this.think(this.nextThought('gate'))) {
                this.noticed.add('brana');
            }
            return;
        }
        const exits = DIRECTIONS.filter(d => isFloor(this.maze, cell.x + d.x, cell.y + d.y)).length;
        if (exits === 1 && !this.noticed.has(key(cell.x, cell.y)) && this.time.now - this.deadEndAt > THOUGHT.deadEndGap
            && this.think(this.nextThought('deadEnd'))) {
            this.noticed.add(key(cell.x, cell.y));
            this.deadEndAt = this.time.now;
        }
    }

    /**
     * Náraz do prekážky: do predmetu v zákutí (myšlienka o ňom, ak ešte nebola), inak do
     * živého plota – po niekoľkých nárazoch za sebou si postava povzdychne.
     */
    noticeObstacle(cell) {
        if (this.mode !== 'play' || this.usedDemo) {
            return;
        }
        const kind = this.nooks.get(key(cell.x, cell.y));
        if (kind) {
            if (!this.noticed.has(key(cell.x, cell.y)) && this.think(this.nextThought(kind))) {
                this.noticed.add(key(cell.x, cell.y));
            }
            return;
        }
        const now = this.time.now;
        this.bumpTimes = [...this.bumpTimes.filter(t => now - t < THOUGHT.bumpWindow), now];
        if (this.bumpTimes.length >= THOUGHT.bumps && now - this.hedgeAt > THOUGHT.hedgeGap && this.think(this.nextThought('hedge'))) {
            this.hedgeAt = now;
            this.bumpTimes = [];
        }
    }

    /** Ďalšia veta myšlienky daného druhu – vety sa striedajú v náhodnom poradí bez opakovania. */
    nextThought(kind) {
        const order = this.thoughtOrder[kind] ??= { list: [], at: 0 };
        if (order.at >= order.list.length) {
            order.list = Phaser.Utils.Array.Shuffle([...STORY.thoughts[kind]]);
            order.at = 0;
        }
        return order.list[order.at++];
    }

    /** Postava sa otočí k predmetu a na chvíľu sa k nemu nakloní (pozerá sa naň). */
    leanTowards(cell) {
        if (this.route.length > 0) {
            return;   // postava ide ďalej – predmet si len všimne
        }
        const point = toScreen(cell.x, cell.y);
        const right = point.x > this.player.x;
        this.player.setFlipX(!right);
        this.leanTween = this.tweens.add({ targets: this.player, angle: (right ? 1 : -1) * THOUGHT.lean, duration: 420, yoyo: true, hold: 900, ease: 'Sine.easeInOut' });
    }

    /**
     * Myšlienka v bubline nad hlavou postavy: kresba bubliny s textom, pod ňou dve
     * bodky smerom k hlave (ako v komikse). Text sa vypíše, chvíľu zostane a bublina
     * vybledne; hra pritom beží a bublina ide s postavou.
     * @param {string} text - myšlienka
     * @returns {boolean} či sa myšlienka ukázala (nie počas rozhovoru a hneď po inej)
     */
    think(text) {
        if (this.mode !== 'play' || this.bubble || this.thought || this.time.now - this.thoughtAt < THOUGHT.gap) {
            return false;
        }
        const camera = this.cameras.main;
        const size = camera.height * SPEECH.fontShare * THOUGHT.font / camera.zoom;
        const style = { fontFamily: 'Caveat', color: '#2f2b27', wordWrap: { width: size * 13 } };
        const body = this.add.text(0, 0, text, { ...style, fontSize: `${Math.round(size)}px`, lineSpacing: -size * 0.15 }).setOrigin(0, 0);
        const padding = size * 0.9;
        const frameWidth = body.width + 2 * padding;
        const frameHeight = body.height + 1.5 * padding;
        const frame = this.add.nineslice(0, 0, 'bublina', undefined, frameWidth, frameHeight, 40, 40, 40, 40).setOrigin(0, 1);
        body.setPosition(padding, -frameHeight + padding * 0.7);
        const dots = this.add.graphics().fillStyle(0xfbf6ea, 1).lineStyle(size * 0.07, 0x2f2b27, 1);
        for (const [x, y, r] of [[size * 1.15, size * 0.6, size * 0.3], [size * 0.6, size * 1.3, size * 0.19]]) {
            dots.fillCircle(x, y, r).strokeCircle(x, y, r);
        }
        const thought = this.add.container(0, 0, [dots, frame, body]).setDepth(SKY_DEPTH + 1).setAlpha(0);
        thought.setData({ size, rise: 10 });
        this.thought = thought;
        this.followThought();
        this.sounds?.effect('bubble', SPEECH.pop * 0.6);
        this.tweens.add({ targets: thought, alpha: 1, duration: 260, ease: 'Sine.easeOut' });
        this.tweens.addCounter({ from: 10, to: 0, duration: 260, ease: 'Sine.easeOut', onUpdate: tween => thought.setData('rise', tween.getValue()) });
        // myšlienka znie hlasom postavy a píše sa v rytme reči
        const line = this.writeLine(body, text);
        thought.setData('line', line);
        const reading = text.length * (1000 / SPEECH.charsPerSecond + THOUGHT.perChar);
        this.time.delayedCall(Math.max(line.spoken, reading) + THOUGHT.hold, () => this.dismissThought(thought));
        return true;
    }

    /** Bublina myšlienky ide s postavou (vpravo hore nad hlavou, pri pravom okraji vľavo); vždy je celá v zábere. */
    followThought() {
        const thought = this.thought;
        if (!thought) {
            return;
        }
        const size = thought.getData('size');
        const view = this.cameras.main.worldView;
        const { width, height } = thought.list[1];
        const toLeft = this.player.x + width > view.right - size;
        thought.list[0].setScale(toLeft ? -1 : 1, 1).setX(toLeft ? width : 0);
        const x = toLeft ? this.player.x - width + size * 0.6 : this.player.x - size * 0.6;
        const y = this.player.y - 160 - size * 1.7 + thought.getData('rise');
        thought.setPosition(Phaser.Math.Clamp(x, view.x + size * 0.3, view.right - width - size * 0.3),
            Phaser.Math.Clamp(y, view.y + height + size * 0.3, view.bottom - size * 1.6));   // celá v zábere
    }

    /** Bublina myšlienky vybledne a zmizne. */
    dismissThought(thought = this.thought) {
        if (!thought || !thought.active) {
            return;
        }
        if (this.thought === thought) {
            this.thought = null;
            this.thoughtAt = this.time.now;
        }
        thought.getData('line').stop();
        this.tweens.add({ targets: thought, alpha: 0, duration: 400, onComplete: () => thought.destroy() });
    }

    /** Hráč došiel do cieľovej miestnosti: hra sa zastaví a režisér spustí záverečnú scénu. */
    reachExit() {
        this.mode = 'cutscene';
        this.route = [];
        this.dismissThought();
        this.hoverMark.setVisible(false);
        this.eraseRing(this.targetMark);
        this.eraseRing(this.gateMark);
        this.game.events.emit('reached-exit');
    }

    /** Výsledok cesty pre epilóg. */
    result() {
        return { time: this.elapsed, steps: this.steps, shortest: this.shortest, found: this.found, hints: this.hints, usedDemo: this.usedDemo };
    }

    /**
     * Nápoveda: ceruzka nakreslí na papier trasu niekoľkých ďalších krokov k najbližšiemu
     * cieľu (nenájdený zväzok kresieb, inak výstupná brána) a zakončí ju šípkou. Čiara je
     * poznámka na papieri – leží nad kresbou (aj nad živými plotmi) a papier sa s ňou
     * násobí ako s ostatným atramentom; po chvíli vybledne.
     */
    showHint() {
        if (this.mode !== 'play' || this.hintActive) {
            return;
        }
        const targets = [...this.pages.filter(item => !item.found).map(item => item.cell), this.maze.exit];
        const paths = targets.map(cell => findPath(this.maze, this.cell, cell)).filter(path => path.length > 0);
        const path = paths.sort((a, b) => a.length - b.length)[0]?.slice(0, HINT.steps) ?? [];
        if (path.length === 0) {
            return;
        }
        this.hints++;
        this.hintActive = true;
        const pencil = this.sounds?.scribble(HINT.sound);
        const wobble = () => Phaser.Math.FloatBetween(-HINT.wobble, HINT.wobble);
        const points = [toScreen(this.cell.x, this.cell.y), ...path.map(cell => toScreen(cell.x + wobble(), cell.y + wobble()))];
        const width = HINT.width / this.cameras.main.zoom;
        const line = this.inkLayer.add(this.add.graphics().setAlpha(HINT.alpha));
        const draw = progress => {
            const reach = progress * (points.length - 1);
            const whole = Math.floor(reach);
            const drawn = points.slice(0, whole + 1);
            if (whole < points.length - 1) {
                drawn.push(Phaser.Math.LinearXY(new Phaser.Math.Vector2(points[whole]), new Phaser.Math.Vector2(points[whole + 1]), reach - whole));
            }
            line.clear().lineStyle(width, HINT.color, 1).fillStyle(HINT.color, 1).strokePoints(drawn);
            for (const point of drawn) {
                line.fillCircle(point.x, point.y, width / 2);   // okrúhle spoje ako pri ceruzke
            }
            if (progress >= 1) {
                const end = points.at(-1);
                const from = points.at(-2);
                const angle = Math.atan2(end.y - from.y, end.x - from.x);
                const size = HINT.arrow * width / HINT.width;
                for (const side of [-1, 1]) {
                    const a = angle + Math.PI + side * 0.5;
                    line.lineBetween(end.x, end.y, end.x + Math.cos(a) * size, end.y + Math.sin(a) * size);
                }
            }
        };
        this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: path.length * HINT.perStep,
            ease: 'Sine.easeInOut',
            onUpdate: tween => {
                pencil?.setLevel(Math.sin(Math.PI * tween.progress) ** 0.5);
                draw(tween.getValue());
            },
            onComplete: () => {
                pencil?.stop();
                draw(1);
                this.tweens.add({
                    targets: line,
                    alpha: 0,
                    delay: TIMING.hintVisible,
                    duration: 800,
                    onComplete: () => {
                        line.destroy();
                        this.hintActive = false;
                    }
                });
            }
        });
    }

    // ---------------------------------------------------------------- záverečná scéna

    /**
     * Postava pri babke od radosti dvakrát poskočí a babka sa k nej otočí.
     * @returns {Promise<void>}
     */
    greet() {
        turnTo(this, this.grandma, this.player.x > this.grandma.x);
        return new Promise(resolve => this.tweens.add({
            targets: this.player,
            y: this.player.y - WIN.hop,
            duration: 170,
            yoyo: true,
            repeat: 1,
            ease: 'Quad.easeOut',
            onComplete: () => resolve()
        }));
    }

    /**
     * Oslava cieľa: pero červeným atramentom nakreslí po papieri celú prejdenú cestu –
     * od vstupu cez všetky zákutia až k bráne. Živé ploty, popri ktorých hrot pera
     * prechádza, sa pohnú ako vo vetre. Keď pero dôjde k babke, zaznie melódia, z brány
     * vyletia motýle a vtáky a obrazovkou prefúkne vietor so semienkami púpavy.
     * Rovnaká čiara je potom v kresbe epilógu.
     * @returns {Promise<void>} splní sa po dozvuku oslavy
     */
    celebrate() {
        const points = this.routePoints();
        const lengths = [0];
        for (let i = 1; i < points.length; i++) {
            lengths.push(lengths[i - 1] + Phaser.Math.Distance.Between(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y));
        }
        const total = lengths.at(-1);
        const duration = Phaser.Math.Clamp(points.length * ROUTE.perCell, ROUTE.min, ROUTE.max);
        const width = ROUTE.screenWidth / this.cameras.main.zoom;
        const line = this.inkLayer.add(this.add.graphics());   // atrament na papieri, nad kresbou
        this.route = [];
        this.hintActive = true;   // počas oslavy už nápoveda nemá zmysel

        // živé ploty sa pohnú, keď okolo nich prejde hrot pera (každý len raz)
        for (const hedge of this.hedges) {
            let best = Infinity;
            let at = 0;
            points.forEach((point, i) => {
                const d = Phaser.Math.Distance.Between(hedge.x, hedge.y, point.x, point.y);
                if (d < best) {
                    best = d;
                    at = lengths[i];
                }
            });
            if (best < ROUTE.reach) {
                this.tweens.add({
                    targets: hedge,
                    angle: { from: 0, to: WIN.hedgeAngle * (hedge.x < points[0].x ? -1 : 1) },
                    scaleY: 1.04,
                    duration: 240,
                    delay: (0.5 - Math.cos(Math.PI * at / total) / 2) * duration,   // rovnaký priebeh ako pohyb pera (Sine.easeInOut)
                    yoyo: true,
                    ease: 'Sine.easeOut'
                });
            }
        }

        const pen = this.sounds?.scribble(ROUTE.sound);
        return new Promise(resolve => this.tweens.addCounter({
            from: 0,
            to: 1,
            duration,
            ease: 'Sine.easeInOut',
            onUpdate: tween => {
                pen?.setLevel(Math.sin(Math.PI * tween.progress) ** 0.5);   // zvuk pera podľa rýchlosti hrotu
                line.clear();
                const tip = this.strokeRoute(line, points, width, tween.getValue() * total);
                line.fillStyle(ROUTE.color, 1).fillCircle(tip.x, tip.y, width * 0.9);   // hrot pera nechá kvapku atramentu
            },
            onComplete: () => {
                pen?.stop();
                line.clear();
                this.strokeRoute(line, points, width);
                this.burst(points.at(-1));
                this.time.delayedCall(WIN.hold, resolve);
            }
        }));
    }

    /** Záber na stretnutie: hráč (už na konci cesty od brány) a babka. */
    frameMeeting(duration) {
        const end = this.places.exitWalk.at(-1);
        return this.flyCamera(this.twoShot(toScreen(end.x, end.y), this.grandma), this.talkZoom, duration);
    }

    /** Koniec cesty: melódia, motýle a vtáky z brány, poryv vetra so semienkami. */
    burst(end) {
        const gate = toScreen(this.maze.exit.x, this.maze.exit.y);
        this.sounds?.effect('win');
        this.releaseButterflies(gate);
        for (let i = 0; i < WIN.birds; i++) {
            const toRight = i % 2 === 0;
            this.flyBird({ x: gate.x + (toRight ? 40 : -40), y: gate.y - 140 }, { x: gate.x + (toRight ? 1 : -1) * (1100 + i * 120), y: gate.y - 1000 - i * 80 }, 3800 + i * 300, 200 + i * 220);
        }
        this.sky.gust();
        // na konci cesty sa atrament ešte rozpije do malej kvapky
        const blot = this.inkLayer.add(this.add.circle(end.x, end.y, ROUTE.screenWidth / this.cameras.main.zoom, ROUTE.color));
        this.tweens.add({ targets: blot, scale: 1.8, duration: 500, ease: 'Quad.easeOut' });
    }

    /** Z výstupnej brány vyletia motýle a po oblúkoch sa rozletia nad bludisko. */
    releaseButterflies(gate) {
        for (let i = 0; i < WIN.butterflies; i++) {
            const butterfly = this.layer.add(this.add.image(gate.x, gate.y - 60, 'mesto', TILES.butterflies[i % 2]));
            butterfly.setDepth(SKY_DEPTH + 1).setScale(1.4);
            this.tweens.add({ targets: butterfly, scaleX: 0.4, duration: 90, yoyo: true, repeat: -1 });   // mávanie krídel
            const angle = Phaser.Math.DegToRad(Phaser.Math.Between(-160, -20));                            // hore a do strán
            const distance = Phaser.Math.Between(400, 800);
            this.tweens.add({
                targets: butterfly,
                x: { value: gate.x + Math.cos(angle) * distance, ease: 'Sine.easeInOut' },
                y: { value: gate.y - 60 + Math.sin(angle) * distance, ease: 'Quad.easeOut' },   // rôzne priebehy = let po oblúku
                alpha: { from: 1, to: 0, ease: t => (t < 0.7 ? 0 : (t - 0.7) / 0.3) },        // zmizne až na konci letu
                duration: Phaser.Math.Between(2600, 3600),
                delay: i * 120,
                onComplete: () => butterfly.destroy()
            });
        }
    }


    // =========================================================================
    //  Myš
    // =========================================================================

    /** Bunka pod kurzorom (inverzná izometrická transformácia). */
    cellUnderPointer(pointer) {
        const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        return toGrid(world.x, world.y);
    }

    /**
     * Každý snímok: na voľnú bunku pod kurzorom sa ceruzkou nakreslí krúžok (sem sa dá
     * prejsť) – krúžok je pod kurzorom, aj keď sa pod ním pohne kamera. Na cieli
     * kliknutia už jeden krúžok je.
     */
    updateHover() {
        const pointer = this.input.activePointer;
        const cell = this.cellUnderPointer(pointer);
        const target = this.targetMark.data.values;
        const free = this.mode === 'play' && this.pointerInside && isFloor(this.maze, cell.x, cell.y)
            && (cell.x !== target.x || cell.y !== target.y);
        this.hoverMark.setVisible(free);
        if (free && (this.hoverMark.getData('x') !== cell.x || this.hoverMark.getData('y') !== cell.y)) {
            const point = toScreen(cell.x, cell.y);
            this.hoverMark.setPosition(point.x, point.y)
                .setData({ x: cell.x, y: cell.y }).setAngle(Phaser.Math.Between(-12, 12));
        }
    }

    /** Klik na voľnú bunku: postava tam dôjde najkratšou cestou. */
    handlePointerUp(pointer) {
        if (this.mode !== 'play' || pointer.button !== 0) {
            return;
        }
        const cell = this.cellUnderPointer(pointer);
        if (isFloor(this.maze, cell.x, cell.y) && (cell.x !== this.cell.x || cell.y !== this.cell.y)) {
            this.walkTo(cell);
            this.drawRing(this.targetMark, cell, RING.target);
        }
    }

    /**
     * Ceruzka na bunku nakreslí krúžok cieľa, ktorý jemne dýcha, kým tam postava nedôjde
     * (cieľ kliknutia, brána po nájdení všetkých zväzkov).
     * @param {Phaser.GameObjects.Image} mark - krúžok
     * @param {{x, y}} cell - bunka
     * @param {number} size - veľkosť oproti krúžku pod kurzorom
     */
    drawRing(mark, cell, size) {
        const point = toScreen(cell.x, cell.y);
        const scale = { x: HOVER.scaleX * size, y: HOVER.scaleY * size };
        this.tweens.killTweensOf(mark);
        mark.setPosition(point.x, point.y)
            .setData({ x: cell.x, y: cell.y }).setAngle(Phaser.Math.Between(-12, 12))
            .setVisible(true).setAlpha(0).setScale(scale.x * 0.6, scale.y * 0.6);
        this.tweens.chain({
            targets: mark,
            tweens: [
                { alpha: RING.alpha, scaleX: scale.x, scaleY: scale.y, duration: RING.draw, ease: 'Back.easeOut' },
                { scaleX: scale.x * (1 + RING.pulse), scaleY: scale.y * (1 + RING.pulse), duration: RING.pulseTime, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 }
            ]
        });
    }

    /** Krúžok cieľa sa rozplynie (postava došla alebo ide inam). */
    eraseRing(mark) {
        if (mark.getData('x') === null) {
            return;
        }
        mark.setData({ x: null, y: null });
        this.tweens.killTweensOf(mark);
        this.tweens.add({
            targets: mark, alpha: 0, scaleX: mark.scaleX * 1.3, scaleY: mark.scaleY * 1.3, duration: RING.fade, ease: 'Sine.easeOut',
            onComplete: () => mark.setVisible(false)
        });
    }

    /**
     * Koliesko myši počas hry: zmení cieľové priblíženie (kamera sa k nemu plynulo
     * priblíži v updatePlayCamera). Pri priblížení kamera sleduje postavu, pri úplnom
     * oddialení sa sama vráti nad celé bludisko.
     */
    handleWheel(pointer, over, deltaX, deltaY) {
        if (this.mode !== 'play') {
            return;
        }
        const notches = Phaser.Math.Clamp(deltaY / PLAY_CAMERA.wheelPixels, -3, 3);
        this.userZoom = Phaser.Math.Clamp(this.userZoom * Math.exp(-notches * PLAY_CAMERA.wheelStep), 1, ZOOM.wheelMax);
    }
}
