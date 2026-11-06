/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   maze.js – logická mriežka bludiska (bez grafiky)
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Generovanie aj hľadanie cesty zabezpečuje knižnica rot.js (globálny objekt ROT):
 *  - ROT.Map.IceyMaze – dokonalé bludisko (medzi každými dvoma bunkami je práve jedna cesta),
 *  - ROT.Path.AStar   – najkratšia cesta algoritmom A* so 4-okolím.
 *  Mriežka má nepárny rozmer: bunky s nepárnymi súradnicami sú miestnosti,
 *  bunky medzi nimi sú steny alebo prechody.
 * =============================================================================
 */

/** Štyri smery pohybu v mriežke (4-okolie). */
export const DIRECTIONS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

/**
 * Vytvorí nové bludisko s aspoň zadaným počtom slepých uličiek (pre zväzky kresieb
 * a zákutia). Malé bludisko ich niekedy má menej – vtedy sa skúsi ďalšie semienko.
 * @param {number} size - počet buniek v jednom smere (nepárne číslo)
 * @param {number} seed - prvé semienko generátora náhodných čísel (rovnaké semienko = rovnaké bludisko)
 * @param {number} deadEnds - najmenší počet slepých uličiek
 * @returns {{size, seed, walls: boolean[][], entrances, gates, start, exit}} brány a miestnosti {x, y}
 */
export function createMaze(size, seed, deadEnds) {
    for (let next = seed; ; next++) {
        const maze = carveMaze(size, next);
        if (findDeadEnds(maze).length >= deadEnds) {
            return maze;
        }
    }
}

/** Jedno bludisko z daného semienka: mriežka z rot.js, vstup a výstupná brána. */
function carveMaze(size, seed) {
    ROT.RNG.setSeed(seed);
    const walls = Array.from({ length: size }, () => []);

    // rot.js vyplní mriežku: hodnota 1 = stena, 0 = voľná bunka
    new ROT.Map.IceyMaze(size, size).create((x, y, value) => {
        walls[y][x] = value === 1;
    });

    // hráč vchádza do rohovej miestnosti pri hornom rohu jediným vstupom (oblúk);
    // cieľom je až samotná výstupná brána v obvodovom plote pri dolnom rohu – miestnosť
    // pred ňou môže byť križovatkou, cez ktorú vedie cesta k zväzku kresieb
    const last = size - 1;
    const start = { x: 1, y: 1 };
    const entrances = [{ x: 1, y: 0 }];
    const gates = [{ x: last - 1, y: last }];
    const exit = gates[0];
    for (const opening of [...entrances, ...gates]) {
        walls[opening.y][opening.x] = false;
    }
    return { size, seed, walls, entrances, gates, start, exit, blocked: new Set() };   // blocked: miestnosti s predmetom (studňa, stĺp, záhon)
}

/**
 * Zistí, či sa dá na bunku vstúpiť.
 * @returns {boolean} true pre voľnú bunku vnútri mriežky, na ktorej nestojí predmet
 */
export function isFloor(maze, x, y) {
    return x >= 0 && y >= 0 && x < maze.size && y < maze.size && !maze.walls[y][x] && !maze.blocked.has(`${x},${y}`);
}

/**
 * Nájde najkratšiu cestu algoritmom A* (knižnica rot.js).
 * @param {object} maze - bludisko z createMaze
 * @param {{x, y}} from - počiatočná bunka
 * @param {{x, y}} to - cieľová bunka
 * @returns {{x, y}[]} bunky cesty bez počiatočnej bunky; prázdne pole, ak cesta neexistuje
 */
export function findPath(maze, from, to) {
    const path = [];
    const astar = new ROT.Path.AStar(to.x, to.y, (x, y) => isFloor(maze, x, y), { topology: 4 });
    astar.compute(from.x, from.y, (x, y) => path.push({ x, y }));
    return path.slice(1);
}

/**
 * Vráti slepé uličky: miestnosti s jediným voľným susedom (okrem štartu a cieľa).
 * @returns {{x, y}[]}
 */
export function findDeadEnds(maze) {
    const deadEnds = [];
    for (let y = 1; y < maze.size - 1; y += 2) {
        for (let x = 1; x < maze.size - 1; x += 2) {
            const exits = DIRECTIONS.filter(d => isFloor(maze, x + d.x, y + d.y)).length;
            const isStartOrExit = (x === maze.start.x && y === maze.start.y) || (x === maze.exit.x && y === maze.exit.y);
            if (exits === 1 && !isStartOrExit) {
                deadEnds.push({ x, y });
            }
        }
    }
    return deadEnds;
}

/**
 * Vyberie miesta pre zväzky kresieb tak, aby ich hráč nachádzal postupne:
 * slepé uličky sa zoradia podľa dĺžky cesty od štartu a pre každý zväzok sa
 * vyberie tá, ktorej vzdialenosť je najbližšie k rovnomerne rozloženým podielom
 * najväčšej vzdialenosti (napr. 30 %, 55 %, 80 % pri troch zväzkoch).
 * @param {number} count - počet zväzkov
 * @returns {{x, y}[]} bunky zväzkov v poradí, v akom ich hráč pravdepodobne nájde
 */
export function placePages(maze, count) {
    const candidates = findDeadEnds(maze).map(cell => ({ cell, distance: findPath(maze, maze.start, cell).length }));
    const farthest = Math.max(...candidates.map(item => item.distance));
    const chosen = [];
    for (let i = 0; i < count && candidates.length > 0; i++) {
        const target = farthest * (0.3 + 0.5 * i / Math.max(1, count - 1));
        candidates.sort((a, b) => Math.abs(a.distance - target) - Math.abs(b.distance - target));
        chosen.push(candidates.shift().cell);
    }
    return chosen;
}
