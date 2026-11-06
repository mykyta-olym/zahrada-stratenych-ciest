/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   life.js – správanie živých tvorov a pohyb rastlín
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Každá funkcia dostane scénu a obrázok (kresbu z atlasu) a rozpohybuje ho
 *  pomocou animácií (tweens) a časovačov knižnice Phaser:
 *  - sway:          strom, trstina či vŕba sa kolíše vo vetre (poryv prechádza krajinou),
 *  - walkPath:      človek kráča po trase krokmi a občas sa zastaví a obzrie,
 *  - wander:        zviera prejde kúsok, zastaví sa, chvíľu odpočíva, pokračuje,
 *  - flutter:       motýľ poletuje okolo kvetov a občas si sadne,
 *  - shimmer:       predmet príbehu sa jemne vznáša a trbliece.
 * =============================================================================
 */
import { TILE } from './config.js';
import { toScreen, toGrid, depthAt, LAYER } from './iso.js';

const WIND = { angle: 1.6, period: 3200, speed: 0.6 };   // kolísanie (stupne), perióda (ms), rýchlosť poryvu (px/ms)
const REST = { min: 1500, max: 6500 };                     // ako dlho zviera odpočíva (ms)
const WANDER_RADIUS = 3;                                   // ako ďaleko zviera prejde naraz (bunky)
const HOP_HEIGHT = 16;                                     // výška skoku zajaca či žaby (px)
const FLIGHT = { low: 90, high: 210 };                     // výška letu motýľa nad kvetmi (px)
const CELL_LENGTH = Math.hypot(TILE.halfWidth, TILE.halfHeight);   // dĺžka kroku o bunku na obrazovke
const GAIT = { lift: 3, tilt: 2, lean: 1.5, squash: 0.03 }; // chôdza: nadvihnutie (px), kolísanie a náklon dopredu (stupne), stlačenie pri dopade
const TURN_TIME = 220;                                      // otočenie postavy (ms)

/**
 * Rastlina sa kolíše okolo päty. Fáza závisí od vodorovnej polohy, preto sa
 * poryv vetra šíri krajinou zľava doprava – stromy sa nekývu každý inak, ale spolu.
 * @param {number} [strength=1] - násobok výchylky (vysoké stromy 1, trstina viac)
 */
export function sway(scene, plant, strength = 1) {
    const angle = WIND.angle * strength;
    plant.setAngle(-angle);
    scene.tweens.add({
        targets: plant,
        angle,
        duration: WIND.period / 2,
        delay: ((plant.x / WIND.speed) % WIND.period + WIND.period) % WIND.period,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
    return plant;
}

/**
 * Zviera sa pohybuje ako živé: vyberie si blízke miesto, kam smie vstúpiť, prejde tam
 * (zajac a žaba skáču, ostatné kráčajú), otočí sa smerom chôdze, potom chvíľu odpočíva
 * v pokojovej polohe (mačka si sadne, zajac sa posadí) a znova sa vyberie ďalej.
 * @param {object} animal - údaje zvieraťa z TILES.animals (walk, rest, left, speed, hop)
 * @param {function} canStand - (x, y) => true, ak smie zviera stáť na bunke
 */
export function wander(scene, sprite, animal, canStand) {
    // zvieratá si nestúpajú do cesty: každé si drží svoju bunku a k bunke iného zvieraťa nejde
    const claims = scene.animalClaims;
    claims.set(sprite, toGrid(sprite.x, sprite.y));
    const free = (x, y) => canStand(x, y) && !nearAnimal(scene, x, y, sprite);
    const rest = () => {
        if (!sprite.active) {
            return;
        }
        sprite.setFrame(animal.rest).setAngle(0);
        // pomalé zvieratá (krava, kôň) sa pasú dlhšie, rýchle (zajac) odpočívajú krátko
        const calm = Math.max(1, 0.45 / animal.speed);
        scene.time.delayedCall(Phaser.Math.Between(REST.min, REST.max) * calm, walk);
    };
    const walk = () => {
        if (!sprite.active) {
            return;
        }
        const target = pickNearbyCell(toGrid(sprite.x, sprite.y), free);
        if (!target) {
            rest();
            return;
        }
        claims.set(sprite, target);
        const from = { x: sprite.x, y: sprite.y };
        const to = toScreen(target.x, target.y);
        const cells = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y) / CELL_LENGTH;
        const hops = Math.max(1, Math.round(cells * 2));
        sprite.setFrame(animal.walk);
        turnTo(scene, sprite, animal.left ? to.x > from.x : to.x < from.x);
        scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: cells / animal.speed * 1000,
            ease: animal.hop ? 'Linear' : 'Sine.easeInOut',
            onUpdate: tween => {
                const t = tween.getValue();
                const lift = animal.hop ? Math.abs(Math.sin(Math.PI * t * hops)) * HOP_HEIGHT : 0;
                const groundY = Phaser.Math.Linear(from.y, to.y, t);
                sprite.setPosition(Phaser.Math.Linear(from.x, to.x, t), groundY - lift).setData('groundY', groundY);
                sprite.scaleY = animal.hop ? 1 + 0.06 * lift / HOP_HEIGHT : 1;   // vo výskoku sa natiahne
                // chôdza: telo sa pri každom kroku nepatrne zhupne
                sprite.setAngle(animal.hop ? 0 : Math.sin(Math.PI * t * hops) * 1.5);
                sprite.setDepth(depthAt(groundY, LAYER.figure));
            },
            onComplete: rest
        });
    };
    scene.time.delayedCall(Phaser.Math.Between(0, REST.max), walk);
}

/**
 * Chôdza postavy po lomenej čiare (body vo svetových súradniciach). Kresba postavy je
 * jediná póza, preto chôdzu naznačí pohyb celej postavy: pri každom kroku (dva kroky
 * na bunku) sa nadvihne a nakloní striedavo na jednu a druhú stranu. Na rohoch trasy
 * sa postava občas zastaví a obzrie.
 * @param {{x, y}[]} points - body trasy (prvý je súčasná poloha)
 * @param {number} speed - rýchlosť v bunkách za sekundu
 * @param {boolean} facesLeft - kresba hľadí doľava (pri chôdzi doprava sa zrkadlí)
 * @param {number} [pauseChance=0] - pravdepodobnosť zastavenia na rohu trasy
 * @returns {Promise<void>} splní sa na konci trasy
 */
export async function walkPath(scene, figure, points, speed, facesLeft, pauseChance = 0) {
    for (let i = 1; i < points.length; i++) {
        await walkSegment(scene, figure, points[i - 1], points[i], speed, facesLeft);
        if (i < points.length - 1 && Math.random() < pauseChance) {
            await lookAround(scene, figure);
        }
    }
}

/** Jeden úsek chôdze s krokmi (pozri walkPath). */
function walkSegment(scene, figure, from, to, speed, facesLeft) {
    const cells = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y) / CELL_LENGTH;
    if (cells < 0.01 || !figure.active) {
        return Promise.resolve();
    }
    const lean = Math.sign(to.x - from.x) * GAIT.lean;   // telo sa mierne nakloní dopredu
    if (Math.abs(to.x - from.x) > 1) {
        turnTo(scene, figure, facesLeft ? to.x > from.x : to.x < from.x);
    }
    return new Promise(resolve => {
        scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: cells / speed * 1000,
            onUpdate: tween => {
                if (!figure.active) {   // postava medzitým zmizla (napr. pred záverečnou scénou)
                    tween.stop();
                    resolve();
                    return;
                }
                const t = tween.getValue();
                const phase = Math.sin(Math.PI * 2 * cells * t);   // dva kroky na bunku
                const ground = { x: Phaser.Math.Linear(from.x, to.x, t), y: Phaser.Math.Linear(from.y, to.y, t) };
                const deck = scene.surfaceHeight?.(ground.x, ground.y) ?? 0;   // na moste vyššie
                const surface = ground.y - deck;
                figure.setPosition(ground.x, surface - Math.abs(phase) * GAIT.lift).setData('groundY', surface);
                figure.setAngle(phase * GAIT.tilt + lean);
                // pri dopade nohy sa telo nepatrne stlačí, v polovici kroku vystrie
                figure.scaleY = 1 - GAIT.squash * (1 - Math.abs(phase));
                figure.setDepth(depthAt(ground.y, LAYER.figure, deck > 0));
            },
            onComplete: () => {
                if (figure.active) {
                    figure.setAngle(0);
                    figure.scaleY = 1;
                }
                resolve();
            }
        });
    });
}

/**
 * Postava sa otočí ako živá: kresba sa zúži (otáča sa k nám bokom), v polovici sa
 * zrkadlí a znova rozšíri – nie okamžité preklopenie.
 * @param {boolean} flip - požadované zrkadlenie kresby
 */
export function turnTo(scene, figure, flip) {
    if (figure.flipX === flip || figure.getData('turning')) {
        return;
    }
    figure.setData('turning', true);
    scene.tweens.add({
        targets: figure,
        scaleX: 0.12,
        duration: TURN_TIME / 2,
        ease: 'Sine.easeIn',
        yoyo: true,
        onYoyo: () => figure.setFlipX(flip),
        onComplete: () => figure.setScale(1, figure.scaleY).setData('turning', false)
    });
}

/** Postava postojí a obzrie sa na jednu a druhú stranu. */
function lookAround(scene, figure) {
    return new Promise(resolve => {
        const turn = () => figure.active && turnTo(scene, figure, !figure.flipX);
        scene.time.delayedCall(Phaser.Math.Between(500, 900), turn);
        scene.time.delayedCall(Phaser.Math.Between(1300, 1900), turn);
        scene.time.delayedCall(Phaser.Math.Between(2100, 2800), resolve);
    });
}

/**
 * Stojí iné zviera na bunke alebo vedľa nej? (veľké zvieratá zaberajú v kresbe aj kus
 * susednej bunky, preto sa držia aspoň bunku od seba)
 * @param {object} [except] - zviera, ktoré sa nepočíta (to, ktoré sa práve rozhoduje)
 */
export function nearAnimal(scene, x, y, except = null) {
    for (const [owner, cell] of scene.animalClaims) {
        if (owner !== except && owner.active && Math.abs(cell.x - x) <= 1 && Math.abs(cell.y - y) <= 1) {
            return true;
        }
    }
    return false;
}

/** Náhodná bunka v okolí, na ktorú smie zviera vstúpiť (alebo null). */
function pickNearbyCell(here, canStand) {
    for (let attempt = 0; attempt < 12; attempt++) {
        const x = here.x + Phaser.Math.Between(-WANDER_RADIUS, WANDER_RADIUS);
        const y = here.y + Phaser.Math.Between(-WANDER_RADIUS, WANDER_RADIUS);
        if ((x !== here.x || y !== here.y) && canStand(x, y) && clearWay(here, { x, y }, canStand)) {
            return { x, y };
        }
    }
    return null;
}

/**
 * Celá priama cesta medzi bunkami vedie po bunkách, kde zviera smie stáť – nikdy
 * neprejde cez strom, ker, plot ani budovu (kontroluje sa každá štvrtina bunky).
 */
function clearWay(from, to, canStand) {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 4);
    for (let i = 1; i < steps; i++) {
        const x = Math.round(Phaser.Math.Linear(from.x, to.x, i / steps));
        const y = Math.round(Phaser.Math.Linear(from.y, to.y, i / steps));
        if ((x !== from.x || y !== from.y) && !canStand(x, y)) {
            return false;
        }
    }
    return true;
}

/**
 * Motýľ poletuje okolo svojho domova (kvetov): krídla mávajú (rýchla zmena šírky
 * kresby), let vedie po krátkych oblúkoch a občas si motýľ na chvíľu sadne.
 * @param {{x, y}} home - svetové súradnice miesta, okolo ktorého lieta
 */
export function flutter(scene, butterfly, home) {
    const size = butterfly.scaleX;
    const wings = scene.tweens.add({ targets: butterfly, scaleX: size * 0.3, duration: 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const fly = () => {
        if (!butterfly.active) {
            return;
        }
        const to = {
            x: home.x + Phaser.Math.Between(-TILE.halfWidth * 2, TILE.halfWidth * 2),
            y: home.y - Phaser.Math.Between(FLIGHT.low, FLIGHT.high)
        };
        butterfly.setFlipX(to.x < butterfly.x);
        wings.resume();
        scene.tweens.add({
            targets: butterfly,
            x: { value: to.x, ease: 'Sine.easeInOut' },
            y: { value: to.y, ease: 'Quad.easeOut' },        // rôzne priebehy = let po oblúku
            duration: Phaser.Math.Between(900, 1800),
            onComplete: () => {
                const perch = Math.random() < 0.3;
                if (perch) {
                    wings.pause();
                    butterfly.setScale(size);
                }
                scene.time.delayedCall(perch ? Phaser.Math.Between(1200, 3000) : 0, fly);
            }
        });
    };
    fly();
}

/**
 * Predmet príbehu (zväzok kresieb) sa pomaly vznáša a kolíše, okolo neho
 * stúpajú drobné semienka – hráč ho z diaľky spozoruje.
 * @returns {Phaser.GameObjects.Particles.ParticleEmitter} trblietky (zničia sa spolu s predmetom)
 */
export function shimmer(scene, item) {
    scene.tweens.add({ targets: item, y: item.y - 10, angle: 3, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return scene.add.particles(item.x, item.y - 30, 'mesto', {
        frame: 'seed1',
        x: { min: -40, max: 40 },
        speedY: { min: -40, max: -18 },
        speedX: { min: -8, max: 8 },
        rotate: { start: 0, end: 180 },
        scale: { start: 0.35, end: 0.15 },
        alpha: { start: 0.8, end: 0 },
        lifespan: 1800,
        frequency: 260
    });
}
