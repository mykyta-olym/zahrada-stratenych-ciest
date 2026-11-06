/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   layout.js – geometria sveta okolo bludiska (bez grafiky)
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Svet je štvorcová mriežka s bludiskom v strede. Poloha každej bunky sa
 *  opisuje pásom (vzdialenosť od okraja bludiska) a stranou bludiska; pred
 *  bludiskom tečie rieka. Modul určuje aj miesta príbehu (záhradník, babka).
 *  Plán krajiny (zámok, dedina, polia) je v module village.js.
 * =============================================================================
 */
import { RIVER } from './config.js';

/**
 * Pásy okolo bludiska: 1 štrková promenáda, 2 lem záhrady (tisy, lavičky, ruže),
 * 3 trávnik, 4 ulica okolo záhrady; od 5. pásu dedina a krajina.
 */
export const RINGS = { walk: 1, border: 2, lawn: 3, road: 4 };

/** Koniec aleje k zámku (riadok y), za ním je nádvorie. */
export const AVENUE_END = -10;

/** Pás, v ktorom bunka leží: 0 = bludisko, 1 = hneď pri ňom, ... */
export function ringOf(maze, x, y) {
    const last = maze.size - 1;
    return Math.max(0, -x, -y, x - last, y - last);
}

/**
 * Strana okolo bludiska, na ktorej bunka leží: 'ne' (vpravo hore, y < 0), 'nw' (vľavo hore,
 * x < 0), 'se' (vpravo dole, x > last), 'sw' (vľavo dole, y > last), v rohoch null.
 */
export function sideOf(maze, x, y) {
    const last = maze.size - 1;
    if (x >= 0 && x <= last) {
        return y < 0 ? 'ne' : y > last ? 'sw' : null;
    }
    if (y >= 0 && y <= last) {
        return x < 0 ? 'nw' : 'se';
    }
    return null;
}

/** Poloha bunky pozdĺž jej strany (súradnica rovnobežná so stranou bludiska). */
export function alongOf(maze, x, y) {
    const side = sideOf(maze, x, y);
    return side === 'ne' || side === 'sw' ? x : y;
}

/** Roh pásu okolo bludiska (bunka, kde sa stretnú dve strany). */
export function isRingCorner(maze, x, y) {
    const last = maze.size - 1;
    const ring = ringOf(maze, x, y);
    return ring > 0 && (x === -ring || x === last + ring) && (y === -ring || y === last + ring);
}

/** Cesta od vstupu k zámku (aleja) a od výstupu cez most na juh až na okraj sveta. */
export function isLane(maze, x, y) {
    const last = maze.size - 1;
    return (x === 1 && y < 0 && y >= AVENUE_END) || (x === last - 1 && y > last);
}

/** Os rieky pre stĺpec x: y = posledný riadok bludiska + offset + A · sin(x / λ). */
export function riverAxis(maze, x) {
    return maze.size - 1 + RIVER.offset + RIVER.amplitude * Math.sin(x / RIVER.wavelength);
}

/** Bunka je voda (rieka tečie pred bludiskom cez celý svet). */
export function isRiver(maze, x, y) {
    return y > maze.size - 1 + RIVER.offset - 4 && Math.abs(y - riverAxis(maze, x)) <= RIVER.halfWidth;
}

/** Breh rieky: bunka mimo vody vedľa vody. */
export function isBank(maze, x, y) {
    return !isRiver(maze, x, y) && [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => isRiver(maze, x + dx, y + dy));
}

/** Za riekou (ďalej od bludiska než voda). */
export function isBeyondRiver(maze, x, y) {
    return y > riverAxis(maze, x) + RIVER.halfWidth;
}

/**
 * Miesta príbehu: kde stojí hráč a záhradník pred vstupom, kade hráč vojde,
 * kde čaká babka a kade k nej hráč pri výstupe dôjde. Postavy v rozhovore
 * stoja vedľa seba v rovnakej výške obrazovky (bunky (x, y) a (x + 1, y − 1)).
 */
export function storyPlaces(maze) {
    const last = maze.size - 1;
    return {
        arrival: { x: 1, y: -2 },
        gardener: { x: 2, y: -3 },
        entryWalk: [{ x: 1, y: -1 }, { x: 1, y: 0 }, maze.start],
        exitWalk: [{ x: last - 1, y: last }, { x: last - 1, y: last + 1 }, { x: last - 1, y: last + 2 }],
        grandma: { x: last - 2, y: last + 3 },
        grandmaBench: { x: last - 4, y: last + 3 },   // o bunku ďalej – babka stojí vedľa lavičky, nie pred ňou
        lamps: [{ x: 0, y: -5 }, { x: 2, y: -5 }]   // dve lampy pri vstupe; pri výstupe nič nesmie zakryť babku
    };
}
