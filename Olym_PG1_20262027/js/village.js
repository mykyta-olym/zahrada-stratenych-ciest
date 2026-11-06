/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   village.js – krajina okolo bludiska podľa plánu skutočnej usadlosti
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Rozloženie vychádza z toho, ako sú usporiadané skutočné záhrady s bludiskom
 *  pri dedine (napr. Glendurgan, Cornwall: bludisko nad osadou pri rieke):
 *    - za bludiskom (hore) zámok s nádvorím a fontánou, k nemu vedie aleja
 *      cyprusov; za zámkom les, vpravo od aleje park s jeleňmi,
 *    - vpravo hospodársky dvor (skleník, stodola, sýpka), za ním sad,
 *      nižšie pastvina ohradená živým plotom,
 *    - vľavo polia a kostol s cintorínom na konci ulice,
 *    - vpredu (dole) ulica pri rieke: rad domov dverami k ulici (a ku kamere),
 *      za domami záhradky, pri výstupnej ceste námestie so studňou, cez rieku
 *      most, za riekou polia; na okraji sveta les.
 *  Kamera sa pozerá zo strany ulice, preto vysoké stavby (zámok, veže) stoja
 *  vzadu, vpredu sú len nízke domy a nič nezakrýva bludisko.
 * =============================================================================
 */
import { TILES } from './config.js';
import { RINGS, ringOf, sideOf, alongOf, isRingCorner, isLane, isRiver, isBank, isBeyondRiver, riverAxis, storyPlaces } from './layout.js';
import { LAYER, toScreen, toGrid, depthOf } from './iso.js';
import { sway } from './life.js';

export const DECK_HEIGHT = 16;      // o koľko je paluba mosta a móla nad terénom (px)
const WATER_LIGHT = 0x3c3c3c;       // zosvetlenie kresby vody (SCREEN)
const JETTY_FROM_BRIDGE = 6;        // mólo s loďkou je 6 buniek proti prúdu od mosta
const YEW_SPACING = 3;              // strihané tisy za bludiskom každé 3 bunky, lavička medzi nimi
const HOUSE_SPACING = 3;            // domy v rade pri ulici každé 3 bunky
const FOREST_DEPTH = 5;             // šírka lesa na okraji sveta (bunky)
const FOUNTAIN_TOP = 58;            // výška hornej plochy podstavca obelisku (px)

/** Náhodná hodnota z generátora rot.js (rovnaké semienko = rovnaký svet). */
const chance = probability => ROT.RNG.getUniform() < probability;
const pick = list => ROT.RNG.getItem(list);
/** Zvyšok po delení aj pre záporné čísla. */
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
/** Kľúč bunky do množiny. */
const key = (x, y) => `${x},${y}`;
/** Bunka leží v obdĺžniku [x0, x1] × [y0, y1]. */
const inside = (x, y, [x0, x1], [y0, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

export class Village {
    /**
     * @param {WorldScene} world - scéna sveta (poskytuje addTile a údaje o bludisku)
     */
    constructor(world) {
        this.world = world;
        this.maze = world.maze;
        this.last = world.maze.size - 1;
        this.margin = world.margin;
        this.forest = this.margin - FOREST_DEPTH;
        this.places = storyPlaces(this.maze);
        this.occupied = new Set();      // bunky, na ktorých stojí predmet (zvieratá a ľudia ich obchádzajú)
        this.houseDoors = [];
        this.zones = this.planZones();
        this.items = new Map();
        this.planItems();
        for (const cell of this.chatSpot()) {
            this.occupied.add(key(cell.x, cell.y));   // chodci obídu ľudí, ktorí sa na námestí rozprávajú
        }
        this.reserved = new Set();
        for (const cell of [this.places.arrival, this.places.gardener, this.places.grandma, this.places.grandmaBench,
            ...this.places.entryWalk, ...this.places.exitWalk]) {
            this.reserved.add(key(cell.x, cell.y));
        }
        this.lamps = new Set(this.places.lamps.map(cell => key(cell.x, cell.y)));
        this.deckCells = this.planDecks();
    }

    // =========================================================================
    //  Plán: oblasti a stavby
    // =========================================================================

    /** Obdĺžnikové oblasti plánu (súradnice mriežky, vrátane hraníc). */
    planZones() {
        const L = this.last;
        const m = this.margin;
        return {
            street: L + 11,                                     // ulica pri rieke (rovnobežná s osou x)
            houseRow: L + 10,                                   // domy pri ulici
            gardens: [L + 6, L + 8],                            // záhradky za domami
            square: [[L - 4, L + 2], [L + 9, L + 10]],          // námestie pri výstupnej ceste
            church: { x: -8, y: L + 10 },                       // kostol na západnom konci ulice
            avenue: [-10, -5],                                  // aleja: x = 1, y v tomto rozsahu
            forecourt: [[-3, 5], [-17, -11]],                   // nádvorie zámku (trávnikové záhony)
            gravel: [[-1, 3], [-17, -11]],                      // štrk nádvoria: okolo bazéna a pred zámkom (nadväzuje na aleju)
            pool: [[0, 2], [-15, -13]],                         // bazén fontány na nádvorí
            castle: { x: 1, y: -18 },
            farmyard: [[L + 8, L + 13], [-6, -2]],
            farmLane: -2,                                       // poľná cesta z okruhu na dvor (y = -2)
            orchard: [[L + 6, L + 16], [-16, -10]],
            pasture: [[L + 6, L + 16], [1, L - 1]],
            park: [[7, L + 3], [-16, -6]],                      // nie tesne pri nádvorí (stromy by zakryli zámok)
            fields: [[-m + 1, -6], [-1, L + 4]],
            woods: [[-m, -5], [-m, -5]]
        };
    }

    /**
     * Stavby a predmety s pevným miestom: zámok, veža, aleja, nádvorie, domy so
     * záhradkami, kostol s cintorínom, námestie, hospodársky dvor, ohrada pastviny, sad.
     */
    planItems() {
        const L = this.last;
        const z = this.zones;
        const put = (x, y, frame, options = {}) => this.items.set(key(x, y), { frame, ...options });

        // zámok s vežou, za ním les; nádvorie s fontánou, po stranách strihané stromy a záhony
        put(z.castle.x, z.castle.y, TILES.castle);
        put(z.castle.x - 2, z.castle.y - 1, TILES.keep);
        put(-3, -17, TILES.yew);
        put(5, -17, TILES.yew);
        put(-3, -11, TILES.planter);
        put(5, -11, TILES.planter);
        put(-1, -14, TILES.bench, { flipX: true });                 // sedadlom k fontáne
        for (const [x, y] of [[-2, -12], [-2, -16], [4, -12], [4, -16]]) {
            put(x, y, TILES.rose);                                      // ruže v záhonoch nádvoria
        }
        for (let y = z.avenue[0]; y <= z.avenue[1] - 1; y += 2) {     // aleja cyprusov po oboch stranách cesty
            put(0, y, TILES.cypress, { sway: 0.6 });
            put(2, y, TILES.cypress, { sway: 0.6 });
        }

        // rad domov pri ulici: kresba má dvere na ľavej prednej stene – k ulici aj ku kamere
        const houseXs = [];
        for (let x = -2; x <= L + 13; x += HOUSE_SPACING) {
            if (Math.abs(x - (L - 1)) > 4) {
                houseXs.push(x);
            }
        }
        houseXs.forEach((x, index) => {
            put(x, z.houseRow, TILES.house);
            this.houseDoors.push({ x, y: z.houseRow });
            put(x, z.gardens[1], pick(TILES.yardTrees), { sway: 0.8 });          // strom za domom
            put(x - 1, z.gardens[1], TILES.yard[index % TILES.yard.length]);     // na dvore bicykel, pumpa, vrecia či hniezdo
            const crop = TILES.crops[index % TILES.crops.length];
            for (let dx = -1; dx <= 1; dx++) {
                put(x + dx, z.gardens[0], crop);            // riadok zeleniny
            }
            if (index % 2 === 1) {
                put(x + 1, z.houseRow, TILES.lamp);                             // lampa pri ulici
            }
        });

        // námestie: studňa, lavička sedadlom k ulici, lampa
        put(L + 2, L + 9, TILES.well);
        put(L - 4, L + 9, TILES.bench);
        put(L + 2, L + 10, TILES.lamp);

        // kostol na konci ulice a cintorín za ním: hroby v radoch, hrobka, cyprusy v rohoch
        put(z.church.x, z.church.y, TILES.church);
        for (const x of [-11, -10, -6, -5]) {
            for (const y of [L + 7, L + 9]) {
                put(x, y, pick(TILES.graves));
            }
        }
        put(-8, L + 7, TILES.tomb);
        put(-12, L + 6, TILES.cypress, { sway: 0.5 });
        put(-5, L + 6, TILES.cypress, { sway: 0.5 });

        // hospodársky dvor: skleník, stodola, sýpka (vchody k dvoru), polená, pumpa, vrecia, hniezdo
        put(L + 8, -7, TILES.greenhouse);
        put(L + 10, -7, TILES.barn);
        put(L + 12, -7, TILES.silo);
        put(L + 13, -3, pick(TILES.logs));
        put(L + 9, -3, TILES.pump);
        put(L + 11, -5, TILES.sacks);
        put(L + 12, -5, TILES.sacks);
        put(L + 9, -5, TILES.nest);

        // pastvina ohradená živým plotom, brána oproti okruhu
        const [[px0, px1], [py0, py1]] = z.pasture;
        const gate = Math.floor((py0 + py1) / 2);
        for (let x = px0; x <= px1; x++) {
            for (let y = py0; y <= py1; y++) {
                const border = x === px0 || x === px1 || y === py0 || y === py1;
                if (border && !(x === px0 && y === gate)) {
                    put(x, y, TILES.hedgerow);
                }
            }
        }

        // sad: ovocné stromy v pravidelných radoch
        const [[ox0, ox1], [oy0, oy1]] = z.orchard;
        for (let x = ox0; x <= ox1; x++) {
            for (let y = oy0; y <= oy1; y++) {
                if (mod(x, 3) === 0 && mod(y, 3) === 0) {
                    put(x, y, TILES.orchard, { sway: 0.7 });
                    if (chance(0.15)) {
                        put(x + 1, y, TILES.ladder);   // rebrík pri strome, z ktorého sa trhá
                    }
                }
            }
        }
    }

    // =========================================================================
    //  Cesty
    // =========================================================================

    /**
     * Druh povrchu bunky: 'walk' (štrková promenáda a chodníky záhrady), 'road' (cesty
     * a ulica), 'plaza' (námestie, nádvorie, dvor) alebo null (tráva).
     */
    surfaceOf(x, y) {
        const L = this.last;
        const z = this.zones;
        const ring = ringOf(this.maze, x, y);
        if (ring === 0) {
            return null;
        }
        if (ring === RINGS.walk || (ring < RINGS.road && isLane(this.maze, x, y))) {
            return 'walk';
        }
        if (inside(x, y, ...z.gravel) || inside(x, y, ...z.square) || inside(x, y, ...z.farmyard)) {
            return 'plaza';
        }
        const avenue = x === 1 && y >= z.avenue[0] && y <= z.avenue[1];
        const exitRoad = x === L - 1 && y > L;
        const farmLane = y === z.farmLane && x > L + RINGS.road && x < z.farmyard[0][0];
        if (ring === RINGS.road || y === z.street || avenue || exitRoad || farmLane) {
            return 'road';
        }
        return null;
    }

    /** Smie tu chodiť človek: dláždená bunka bez predmetu vnútri sveta, paluba mosta, nie voda. */
    isWalkable(x, y) {
        const m = this.margin;
        if (x < -m || y < -m || x > this.last + m || y > this.last + m) {
            return false;   // ulica a cesty končia na okraji sveta (inak by ich A* prehľadával donekonečna)
        }
        if (this.deckCells.has(key(x, y))) {
            return true;
        }
        if (isRiver(this.maze, x, y) || this.isPool(x, y) || this.occupied.has(key(x, y)) || this.lamps.has(key(x, y))) {
            return false;
        }
        return this.surfaceOf(x, y) !== null;
    }

    /** Bunka bazéna fontány na nádvorí zámku. */
    isPool(x, y) {
        return inside(x, y, ...this.zones.pool);
    }

    // =========================================================================
    //  Bunka krajiny
    // =========================================================================

    /** Nakreslí terén a ozdobu jednej bunky mimo bludiska. */
    buildCell(x, y) {
        const k = key(x, y);
        if (isRiver(this.maze, x, y) || this.isPool(x, y)) {
            this.buildWater(x, y);
            return;
        }
        const surface = this.surfaceOf(x, y);
        this.world.addTile(x, y, pick(surface ? TILES.ground : TILES.lawn), LAYER.ground, { flip: true });
        if (surface) {
            this.world.addTile(x, y, surface === 'road' ? TILES.road : TILES.walk, LAYER.detail, { flip: true });
            this.world.maybePuddle(x, y);
        }
        if (this.lamps.has(k)) {
            this.place(x, y, TILES.lamp);
        }
        const item = this.items.get(k);
        if (item) {
            const tile = this.place(x, y, item.frame, item);
            if (item.sway) {
                sway(this.world, tile, item.sway);
            }
            return;
        }
        if (surface || this.reserved.has(k) || this.deckCells.has(k)) {
            return;
        }
        this.decorate(x, y);
    }

    /**
     * Postaví predmet a zapamätá si, že bunka je obsadená.
     * @returns {Phaser.GameObjects.Image}
     */
    place(x, y, frame, { flipX = null, flip = false } = {}) {
        this.occupied.add(key(x, y));
        return this.world.addTile(x, y, frame, LAYER.object, { flipX, flip });
    }

    /**
     * Vysoká rastlina (trs trávy, kvety): kreslí sa v rade predmetov, takže zakryje nohy
     * zvieraťa za sebou, a zviera na jej bunku nevstúpi (obíde ju ako ker).
     */
    plant(x, y, frames) {
        this.occupied.add(key(x, y));
        return this.world.addTile(x, y, pick(frames), LAYER.object, { flip: true });
    }

    /** Voľná príroda podľa oblasti plánu. */
    decorate(x, y) {
        const L = this.last;
        const z = this.zones;
        const ring = ringOf(this.maze, x, y);
        if (ring >= this.forest || inside(x, y, ...z.woods)) {
            this.decorateForest(x, y, ring);
        } else if (ring <= RINGS.road) {
            this.decorateGarden(x, y, ring);
        } else if (isBank(this.maze, x, y)) {
            this.decorateBank(x, y);
        } else if (isBeyondRiver(this.maze, x, y)) {
            this.decorateFields(x, y);
        } else if (inside(x, y, ...z.forecourt)) {
            if (chance(0.45)) {
                this.plant(x, y, TILES.flowers);   // záhony nádvoria
            }
        } else if (inside(x, y, ...z.pasture)) {
            if (chance(0.16)) {
                this.plant(x, y, TILES.pasture);
            }
        } else if (inside(x, y, ...z.park)) {
            if (chance(0.09)) {
                sway(this.world, this.place(x, y, pick(TILES.parkTrees), { flip: true }), 0.6);   // staré stromy v parku
            } else if (chance(0.1)) {
                this.groundBit(x, y);
            }
        } else if (inside(x, y, ...z.fields)) {
            if (mod(x, 3) !== 0) {
                this.world.addTile(x, y, pick(TILES.wheat), LAYER.detail, { flip: true });   // pásy obilia, medzi nimi medza
            }
        } else if (y > L + 4 && x < -4) {
            if (chance(0.12)) {
                this.plant(x, y, TILES.flowers);   // lúka pri kostole
            } else if (chance(0.08)) {
                this.groundBit(x, y);
            }
        } else if (chance(0.05)) {
            this.plant(x, y, TILES.pasture);
        } else if (chance(0.06)) {
            this.groundBit(x, y);
        }
    }

    /** Drobnosť na zemi (mach, lístie, haluzky, kamienky, mravenisko) – nízka, dá sa cez ňu prejsť. */
    groundBit(x, y) {
        this.world.addTile(x, y, pick(TILES.groundBits), LAYER.detail, { flip: true });
    }

    /**
     * Záhrada okolo bludiska: za bludiskom strihané tisy a medzi nimi lavičky
     * sedadlom k bludisku, pred ním ruže (nízke – nezakryjú bludisko); v rohoch
     * lemu okrúhle záhony, na trávniku kvety.
     */
    decorateGarden(x, y, ring) {
        const side = sideOf(this.maze, x, y);
        const along = alongOf(this.maze, x, y);
        if (ring === RINGS.border && isRingCorner(this.maze, x, y)) {
            this.place(x, y, TILES.planter);
        } else if (ring === RINGS.border && (side === 'ne' || side === 'nw')) {
            const step = mod(along, 2 * YEW_SPACING);
            if (step === 0 || step === YEW_SPACING) {
                this.place(x, y, TILES.yew, { flip: true });
            } else if (step === Math.floor(YEW_SPACING * 1.5)) {
                // kresba lavičky má sedadlo vľavo dole; na ľavej strane sa zrkadlí (sedadlo vpravo dole)
                this.place(x, y, TILES.bench, { flipX: side === 'nw' });
            }
        } else if (ring === RINGS.border && (side === 'se' || side === 'sw') && mod(along, YEW_SPACING) === 1) {
            this.place(x, y, TILES.rose, { flip: true });
        } else if (ring === RINGS.lawn && mod(along, 5) === 2) {
            this.plant(x, y, TILES.flowers);
        }
    }

    /** Les – stromy rôznych druhov, sem-tam polená a kamene, na zemi mach, lístie a haluzky. */
    decorateForest(x, y, ring) {
        if (chance(0.45 + Math.min(0.3, Math.max(0, ring - this.forest) * 0.08))) {
            sway(this.world, this.place(x, y, pick(TILES.forest), { flip: true }), 0.6);
        } else if (chance(0.08)) {
            this.place(x, y, pick([...TILES.logs, ...TILES.rocks]), { flip: true });
        } else if (chance(0.3)) {
            this.groundBit(x, y);
        }
    }

    /** Breh rieky: trstina, sem-tam smútočná vŕba; pri moste a móle zostane voľno. */
    decorateBank(x, y) {
        if (Math.abs(x - this.jetty.x) <= 2 || Math.abs(x - this.bridge.x) <= 1) {
            return;
        }
        if (chance(0.05)) {
            sway(this.world, this.place(x, y, TILES.willow, { flip: true }), 0.9);
        } else if (chance(0.04)) {
            this.place(x, y, pick(TILES.rocks), { flip: true });
        } else if (chance(0.35)) {
            sway(this.world, this.place(x, y, pick(TILES.reeds), { flip: true }), 1.3);
        }
    }

    /** Polia za riekou: pásy obilia (dva riadky obilia, riadok medza) a stromy pri medzi. */
    decorateFields(x, y) {
        if (mod(y, 3) !== 0) {
            this.world.addTile(x, y, pick(TILES.wheat), LAYER.detail, { flip: true });
        } else if (chance(0.05)) {
            sway(this.world, this.place(x, y, pick(TILES.forest), { flip: true }), 0.6);
        }
    }

    // =========================================================================
    //  Voda, most, mólo, fontána
    // =========================================================================

    /**
     * Voda: tenká kocka vody leží nižšie ako terén, susedné kocky brehu tak tvoria
     * nábrežie. Kresba vody zostane tmavá (na nej vidno biele hrebene vĺn).
     */
    buildWater(x, y) {
        const water = this.world.addTile(x, y, TILES.water, LAYER.ground).setTint(WATER_LIGHT).setTintMode(Phaser.TintModes.SCREEN);
        this.world.waterTiles.push(water);
        if (this.deckCells.has(key(x, y))) {
            this.world.addTile(x, y, TILES.bridge, LAYER.detail, { offsetY: 10 }).setTint(0x000000).setAlpha(0.22);   // tieň paluby
        }
        return water;
    }

    /**
     * Bunky paluby: most na výstupnej ceste (bunky vody a po jednej bunke brehu
     * na oboch stranách – most na nich leží) a mólo z ulice do vody.
     */
    planDecks() {
        const decks = new Set();
        const lane = this.last - 1;
        const water = [];
        for (let y = this.last + 1; y < this.last + 40; y++) {
            if (isRiver(this.maze, lane, y)) {
                water.push(y);
            }
        }
        for (let y = water[0] - 1; y <= water.at(-1) + 1; y++) {
            decks.add(key(lane, y));
        }
        this.bridge = { x: lane, from: water[0] - 1, to: water.at(-1) + 1 };
        const x = lane - JETTY_FROM_BRIDGE;
        let y = this.last + 1;
        while (!isRiver(this.maze, x, y)) {
            y++;
        }
        decks.add(key(x, y));
        this.jetty = { x, water: y };
        return decks;
    }

    /** Paluby mosta a móla z hrubých dosiek (zdvihnuté nad terén, aby ležali nad vodou). */
    buildDecks() {
        for (const cell of this.deckCells) {
            const [x, y] = cell.split(',').map(Number);
            this.world.addTile(x, y, TILES.bridge, LAYER.object, { offsetY: -DECK_HEIGHT });
        }
    }

    /** Loďka priviazaná vedľa móla po prúde; na vlnách sa jemne nadvihuje a nakláňa. */
    addBoat() {
        const { x, water } = this.jetty;
        if (!isRiver(this.maze, x + 1, water)) {
            return;
        }
        const boat = this.world.addTile(x + 1, water, TILES.boat, LAYER.object, { offsetY: -2 });
        this.world.tweens.add({ targets: boat, y: boat.y + 3, angle: 1, duration: 2300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    /**
     * Fontána na nádvorí zámku: obelisk uprostred bazéna, z jeho podstavca strieka
     * na dve strany voda (systém častíc s gravitáciou).
     */
    addFountain() {
        const [[x0, x1], [y0, y1]] = this.zones.pool;
        const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
        this.world.addTile(c.x, c.y, TILES.obelisk, LAYER.object);
        const base = toScreen(c.x, c.y);
        for (const side of [-1, 1]) {
            const jet = this.world.layer.add(this.world.add.particles(base.x + side * 24, base.y - FOUNTAIN_TOP, 'kvapka', {
                angle: side < 0 ? { min: 205, max: 240 } : { min: 300, max: 335 },
                speed: { min: 190, max: 240 },
                gravityY: 560,
                lifespan: 820,
                rotate: { onEmit: () => side * 25 },
                scale: { start: 0.55, end: 0.3 },
                alpha: { start: 1, end: 0.3 },
                frequency: 22,
                quantity: 3
            }));
            jet.setDepth(depthOf(c.x + c.y, LAYER.object) + 0.5);
        }
        this.world.fountainWater = this.world.waterTiles.filter(tile => {
            const cell = toGrid(tile.x, tile.y);
            return this.isPool(cell.x, cell.y);
        });
    }

    // =========================================================================
    //  Miesta pre ľudí a zvieratá
    // =========================================================================

    /**
     * Ciele chodcov: dvere domov, kostola, zámku a stodoly a konce ciest na okraji
     * sveta (odchod z dediny). Na bunke dverí sa chodec objaví alebo zmizne.
     */
    destinations() {
        const L = this.last;
        const m = this.margin;
        const z = this.zones;
        return [
            ...this.houseDoors,
            { x: z.church.x, y: z.church.y },
            { x: z.castle.x, y: z.castle.y },
            { x: L + 10, y: -7 },
            { x: -m + 1, y: z.street },
            { x: L + m - 1, y: z.street },
            { x: L - 1, y: L + m - 1 }
        ];
    }

    /** Dvaja susedia sa rozprávajú na námestí (vedľa seba v rovnakej výške obrazovky). */
    chatSpot() {
        const L = this.last;
        return [{ x: L, y: L + 10 }, { x: L, y: L + 9 }];   // stred námestia, ďalej od lavičky aj od studne
    }

    /**
     * Ohradená pastvina: vnútro s odstupom jednej bunky od plota – veľké zviera pri plote
     * by naň v kresbe zasahovalo, akoby stálo v kroví.
     */
    inPasture(x, y) {
        const [[x0, x1], [y0, y1]] = this.zones.pasture;
        return x > x0 + 1 && x < x1 - 1 && y > y0 + 1 && y < y1 - 1 && !this.occupied.has(key(x, y));
    }

    /** Polia pri kostole (vrany). */
    inFields(x, y) {
        return inside(x, y, ...this.zones.fields) && !this.occupied.has(key(x, y));
    }

    /** Dláždené námestie, nádvorie a dvor (vrabce). */
    onPlaza(x, y) {
        return this.surfaceOf(x, y) === 'plaza' && !this.occupied.has(key(x, y));
    }

    /** Les na okraji sveta (líška). */
    inWoods(x, y) {
        return ringOf(this.maze, x, y) >= this.forest && !this.occupied.has(key(x, y));
    }

    /** Zámocký park s jeleňmi. */
    inPark(x, y) {
        return inside(x, y, ...this.zones.park) && !this.occupied.has(key(x, y)) && x !== 1;
    }

    /** Záhradky za domami (pre mačku). */
    inGardens(x, y) {
        const z = this.zones;
        return y >= z.gardens[0] - 1 && y <= z.gardens[1] && x > -4 && x < this.last + 14 && !this.occupied.has(key(x, y))
            && this.surfaceOf(x, y) === null;
    }

    /** Lúka pri kostole (pre zajace). */
    inMeadow(x, y) {
        const L = this.last;
        return y > L + 4 && y < this.zones.street && x < -12 && x > -this.forest && !this.occupied.has(key(x, y));
    }

    /** Trávnik záhrady okolo bludiska (pre ježka). */
    onLawn(x, y) {
        return ringOf(this.maze, x, y) === RINGS.lawn && !this.occupied.has(key(x, y)) && !isLane(this.maze, x, y)
            && !this.reserved.has(key(x, y));
    }

    /** Breh rieky bez predmetov a ciest (husi, žaby). */
    onBank(x, y) {
        return isBank(this.maze, x, y) && !this.occupied.has(key(x, y)) && !this.deckCells.has(key(x, y)) && this.surfaceOf(x, y) === null;
    }

    /** Voda rieky mimo mosta (kačky). */
    inRiver(x, y) {
        return isRiver(this.maze, x, y) && !this.deckCells.has(key(x, y)) && Math.abs(x - this.bridge.x) > 1;
    }

    /** Os rieky (kde hľadať vodné zvieratá). */
    riverY(x) {
        return Math.round(riverAxis(this.maze, x));
    }
}
