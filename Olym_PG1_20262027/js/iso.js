/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   iso.js – izometrická projekcia mriežky na obrazovku
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Súradnicový reťazec: bunka mriežky (x, y) -> svetové súradnice scény (px)
 *  -> kamera (posun a priblíženie, rieši Phaser) -> pixely obrazovky.
 *  Os x mriežky smeruje na obrazovke vpravo dole, os y vľavo dole.
 * =============================================================================
 */
import { TILE } from './config.js';

/** Vrstvy v rámci jednej diagonály (poradie kreslenia odspodu nahor). */
export const LAYER = { ground: 0, detail: 1, footprint: 2, object: 3, figure: 4 };

/**
 * Prevod bunky mriežky (aj neceločíselnej) na svetové súradnice stredu hornej steny kocky.
 * @returns {{x: number, y: number}}
 */
export function toScreen(x, y) {
    return {
        x: (x - y) * TILE.halfWidth,
        y: (x + y) * TILE.halfHeight
    };
}

/**
 * Inverzná transformácia: svetové súradnice -> najbližšia bunka mriežky.
 * @returns {{x: number, y: number}}
 */
export function toGrid(worldX, worldY) {
    const u = worldX / TILE.halfWidth;
    const v = worldY / TILE.halfHeight;
    return { x: Math.round((v + u) / 2), y: Math.round((v - u) / 2) };
}

/**
 * Hĺbka kreslenia (maliarov algoritmus): vzdialenejšie diagonály skôr, bližšie neskôr.
 * @param {number} diagonal - súčet x + y bunky
 * @param {number} layer - vrstva z LAYER
 */
export function depthOf(diagonal, layer) {
    return diagonal * 10 + layer;
}

/**
 * Hĺbka objektu, ktorý sa pohybuje medzi bunkami (postava, chodec, zviera). Diagonála je
 * neceločíselná: kým postava prechádza z diagonály d na d + 1, kocka diagonály d + 1 vedľa
 * nej (napr. živý plot) ju ešte zakrýva a postava ju predbehne až tesne pred cieľom –
 * vtedy sa už neprekrývajú. Postava tak nikdy „nevylezie“ na plot pred sebou.
 * Na zdvihnutej palube (most, mólo) sa diagonála zaokrúhli nahor, aby dosky paluby,
 * po ktorých postava práve kráča, nezakryli jej nohy.
 * @param {number} worldY - svetová súradnica y päty objektu
 * @param {number} layer - vrstva z LAYER
 * @param {boolean} [onDeck=false] - postava kráča po palube
 */
export function depthAt(worldY, layer, onDeck = false) {
    const diagonal = worldY / TILE.halfHeight;
    return depthOf(onDeck ? Math.ceil(diagonal - 0.001) : diagonal, layer);
}
