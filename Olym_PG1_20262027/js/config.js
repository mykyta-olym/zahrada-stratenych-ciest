/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   config.js – konštanty hry a výber kresieb
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Predmet: Počítačová grafika, 2026/2027
 *  Verzia:  2.0 (október 2026)
 *
 *  Všetky čísla a zoznamy, ktoré určujú vzhľad a správanie hry, sú na jednom
 *  mieste. Zoznam kresieb (TILES) používa aj nástroj nastroje/atlas.js pri
 *  zostavení atlasu textúr, takže hra aj atlas majú vždy rovnaký obsah.
 * =============================================================================
 */

/** Mierka, v ktorej sú kresby uložené v atlase (originál má 382 × 805 px). */
export const TILE_SCALE = 1;

/**
 * Izometrická mriežka: polovičná šírka a výška kosoštvorca hornej steny kocky
 * a výška bočnej steny kocky (všetko v pixeloch atlasu).
 */
export const TILE = { halfWidth: 80, halfHeight: 44, cubeHeight: 82 };

/**
 * Bod ukotvenia (pivot) spoločný pre všetky kresby balíka: stred hornej steny
 * kocky v pôvodnom plátne 382 × 805 px. Kresby nakreslené na rovnakej pozícii
 * tak ležia presne na sebe.
 */
export const TILE_ANCHOR = { x: 189 / 382, y: 688 / 805 };

/** Veľkosti bludiska: počet buniek mriežky v jednom smere (vždy nepárne číslo). */
export const MAZE_SIZES = {
    male: { cells: 11 },
    stredne: { cells: 17 },
    velke: { cells: 23 }
};

/** Svet má WORLD_CELLS × WORLD_CELLS buniek; bludisko leží v strede. */
export const WORLD_CELLS = 68;

/** Počet zväzkov kresieb, ktoré treba v bludisku nájsť. */
export const PAGE_COUNT = 3;

/** Časovanie (ms): krok postavy o jednu bunku, viditeľnosť nápovedy. */
export const TIMING = { step: 240, hintVisible: 4500 };

/**
 * Priblíženie kamery: najväčšie priblíženie hry a kolieskom myši (násobok
 * priblíženia, pri ktorom je celé bludisko na obrazovke) a priblíženie pri rozhovoroch.
 */
export const ZOOM = { max: 1.4, wheelMax: 2.4, talk: 1.15 };

/** Dedina za návsou je kreslená bledším atramentom – čím ďalej, tým bledšie (vzdušná perspektíva). */
export const FADE = { from: 7, near: 0.18, far: 0.6, rings: 24 };

/**
 * Papier, na ktorom je svet nakreslený, je súčasťou kresby: textúra papiera (800 × 575 px)
 * sa vo svete opakuje s mierkou scale, kresba atramentom sa s ňou násobí (MULTIPLY).
 */
export const PAPER = { key: 'papier', scale: 1.875 };

/** Postava hráča je vytieňovaná, aby bola medzi bielymi kockami výrazná. */
export const PLAYER_TINT = 0x7d7d7d;

/** Rieka pred bludiskom: os y = posledný riadok bludiska + offset, meandruje sínusom. */
export const RIVER = { offset: 14, amplitude: 1.2, wavelength: 9, halfWidth: 1 };   // ulica pri rieke (+11) zostane vždy suchá

/**
 * Kresby z balíka „city game tileset“ (withering systems, licencia CC BY 4.0)
 * rozdelené podľa úlohy vo svete. Názov = názov súboru bez prípony; každá kresba
 * bola overená podľa náhľadu celého balíka (napr. memorial1 je obelisk na podstavci,
 * traffic-circle1 okrúhly kvetinový záhon, house3 drevený domček so sedlovou strechou).
 * Pri postavách a zvieratách „left“ znamená, že kresba hľadí doľava.
 */
export const TILES = {
    ground: ['ground_tile_porous1', 'ground_tile_porous2'],
    lawn: ['ground_tile_foliage1', 'ground_tile_foliage2'],
    water: 'water1',

    // bludisko: živé ploty, štrkové chodníčky, jeden vstupný oblúk a jedna výstupná brána
    hedge: 'bush1',
    mazePath: 'sand1',
    nook: ['column1', 'traffic-circle1', 'well1'],
    entrance: 'arch1',
    exit: 'gate1',

    // záhrada okolo bludiska: štrková promenáda, strihané kužeľovité tisy, lavičky,
    // ruže, okrúhle záhony, kvety; ulica okolo záhrady; lampy pri bránach
    walk: 'sand2',
    road: 'sand3',
    puddle: 'puddle1',
    lamp: 'streetlight1',
    bench: 'bench1',
    yew: 'tree1',
    rose: 'rose1',
    planter: 'traffic-circle1',
    flowers: ['flower1', 'flower2', 'flower3', 'flower4', 'dandelion1'],

    // usadlosť: zámok s vežou a fontánou, dedinské domy, kostol s cintorínom, hospodársky dvor
    castle: 'castle1',
    keep: 'tower1',
    graves: ['grave1', 'grave2'],
    tomb: 'tomb1',
    hedgerow: 'bush3',                  // nízky živý plot okolo pastviny
    parkTrees: ['tree3', 'tree2', 'fruit-tree1'],
    house: 'house3',
    barn: 'pyramid1',
    silo: 'silo1',
    greenhouse: 'greenhouse1',
    church: 'turret1',
    obelisk: 'memorial1',
    well: 'well1',
    cypress: 'pine1',
    yardTrees: ['fruit-tree1', 'tree2', 'bush2'],
    orchard: 'fruit-tree1',
    crops: ['cabbage1', 'carrot1', 'pumpkin1', 'tomato1', 'sprouts1'],
    wheat: ['grass5', 'grass6'],
    pasture: ['grass1', 'grass2', 'grass3', 'grass4', 'grass7'],
    forest: ['tree3', 'tree1', 'pine2', 'tree2', 'bush4'],
    logs: ['logs1', 'stump1'],
    rocks: ['rock1', 'rock2', 'rock3'],
    groundBits: ['moss1', 'leaf1', 'twig1', 'pebble1', 'branch1', 'anthill1'],   // drobnosti na zemi (dá sa cez ne prejsť)
    pump: 'pump1',
    sacks: 'bag1',
    nest: 'nest1',
    yard: ['bicycle1', 'pump1', 'bag1', 'nest1'],       // pri domoch: bicykel, pumpa, vrecia, hniezdo s vajíčkami
    ladder: 'ladder1',

    // rieka: voda, mostík a mólo z hrubých dosiek (wood1 – polovičný blok, ktorého vrch je
    // v úrovni terénu, tenká kocka vody water1 leží nižšie), trstina, vŕba, loďka
    bridge: 'wood1',
    ripple: 'puddle2',                  // kruhy na vode (dopad kvapky, prameň fontány)
    reeds: ['reeds1', 'reed2'],
    willow: 'vine1',
    boat: 'canoe1',

    // postavy: hráč, záhradník Matej (ukazuje rukou), babka Elena (s paličkou),
    // ľudia z dediny (s dáždnikom v daždi)
    player: 'person6',
    gardener: 'person2',
    grandma: 'person3',
    villagers: { sun: ['person4', 'person5'], rain: ['person1'] },
    villagersLeft: ['person1'],

    // zvieratá: walk/rest = kresba pri chôdzi a v pokoji, speed = bunky za sekundu
    animals: {
        cat: { walk: 'cat1', rest: 'cat2', left: true, speed: 0.9 },
        rabbit: { walk: 'rabbit1', rest: 'rabbit2', left: true, speed: 1.6, hop: true },
        goose: { walk: 'goose1', rest: 'goose1', left: true, speed: 0.45 },
        duck: { walk: 'duck1', rest: 'duck1', left: false, speed: 0.3 },
        frog: { walk: 'frog1', rest: 'frog1', left: true, speed: 1.2, hop: true },
        cow: { walk: 'cow1', rest: 'cow1', left: true, speed: 0.18 },
        horse: { walk: 'horse1', rest: 'horse1', left: false, speed: 0.35 },
        donkey: { walk: 'donkey1', rest: 'donkey1', left: true, speed: 0.25 },
        goat: { walk: 'goat1', rest: 'goat1', left: true, speed: 0.45 },
        deer: { walk: 'deer1', rest: 'deer1', left: true, speed: 0.6 },
        hedgehog: { walk: 'hedgehog1', rest: 'hedgehog1', left: true, speed: 0.3 },
        fox: { walk: 'fox1', rest: 'fox1', left: false, speed: 0.8 },
        crow: { walk: 'crow1', rest: 'crow1', left: true, speed: 0.9, hop: true },
        sparrow: { walk: 'bird1', rest: 'bird1', left: true, speed: 1.5, hop: true }
    },
    dog: 'dog1',
    butterflies: ['butterfly1', 'butterfly2'],

    // predmety príbehu a efekty
    page: 'paper1',
    seed: 'seed1'
};

/**
 * Kresby s pomocnými čiarami mriežky okolo postavy (zo skenu pôvodného výkresu).
 * Nástroj atlas.js z nich ponechá iba obrys a jeho vnútro.
 */
export const GRID_LINE_TILES = ['person1', 'person2', 'person3', 'person4', 'person5', 'person6', 'dog1', 'cow1', 'goat1', 'horse1', 'donkey1', 'fox1', 'crow1'];

/** Kresby, ktoré sa otáčajú alebo lietajú – ich pivot je v ich vizuálnom strede. */
export const CENTERED_TILES = [...TILES.butterflies, TILES.seed];

/**
 * Počasie: dĺžka obdobia slnka a dažďa (ms), prechod (ms). Dážď: uhol a rýchlosť
 * pádu kvapiek (px/s), hustota (kvapka za snímok na pixelsPerDrop šírky obrazovky).
 */
export const WEATHER = { sun: 70000, rain: 32000, change: 4000 };
export const RAIN = { angle: 108, speed: 1500, frequency: 16, pixelsPerDrop: 360, dropSize: 48, alpha: 0.62 };

/**
 * Zvuky (kľúč = súbor v priečinku audio): hudba knihy a záhrady, prostredie,
 * efekty. Hlasitosti sú v rozsahu 0 až 1.
 */
export const AUDIO = {
    music: { book: 'piano', garden: 'catmint' },
    ambience: { garden: 'garden', rain: 'rain', stream: 'stream' },
    steps: ['step0', 'step1', 'step2', 'step3'],
    effects: { open: 'book-open', close: 'book-close', page: 'page-turn', pencil: 'pencil', win: 'jingles_PIZZI10', bubble: 'bubble' },
    volume: { music: 0.5, ambience: 0.45, stream: 0.55, rain: 0.35, step: 0.32, effect: 0.6, voice: 1 }
};
