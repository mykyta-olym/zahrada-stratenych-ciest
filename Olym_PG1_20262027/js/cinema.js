/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   cinema.js – filmová vrstva nad hrou
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Prostriedky filmovej reči: čierne pásy (širokouhlý záber počas scén, keď
 *  hráč neovláda postavu), titulok kapitoly, titulky (citáty zo spomienok)
 *  a zatmenie do čiernej. Všetky funkcie vracajú Promise, ktorý sa splní
 *  po skončení animácie (Web Animations API).
 * =============================================================================
 */

const $ = selector => document.querySelector(selector);
const BARS_TIME = 1100;                       // príchod a odchod pásov (ms), rovnaký ako v hra.css
const READING = { base: 2600, perChar: 55, afterVoice: 900 };  // ako dlho zostanú titulky (ms) podľa dĺžky textu a po dočítaní nahlas
let subtitleId = 0;                           // poradie titulkov – skryté titulky sa neskôr neskryjú druhý raz

/** Počká daný počet milisekúnd. */
export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Zapne alebo vypne širokouhlý záber (čierne pásy hore a dole).
 * @returns {Promise<void>}
 */
export function letterbox(on) {
    $('#kino').classList.toggle('film', on);
    return wait(BARS_TIME);
}

/**
 * Titulok kapitoly: nadpis sa jemne vynorí zdola, chvíľu zostane a rozplynie sa
 * (iba priehľadnosť a posun – animácia beží v skladaní vrstiev bez prekresľovania).
 * @param {string} over - menší riadok (napr. „Kapitola prvá“)
 * @param {string} main - názov kapitoly
 * @param {number} [hold=2600] - ako dlho titulok zostane (ms)
 */
export async function titleCard(over, main, hold = 2600) {
    const card = $('#titulok');
    card.querySelector('.nad').textContent = over;
    card.querySelector('.hlavny').textContent = main;
    await card.animate([
        { opacity: 0, transform: 'translateY(1.2rem) scale(0.985)' },
        { opacity: 1, transform: 'none' }
    ], { duration: 1500, easing: 'cubic-bezier(0.2, 0.6, 0.2, 1)', fill: 'forwards' }).finished;
    await wait(hold);
    await card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-0.5rem)' }],
        { duration: 1100, easing: 'ease-in', fill: 'forwards' }).finished;
}

/**
 * Titulky: citát (kurzívou) a jeho zdroj. Zostanú tak dlho, aby sa dali prečítať
 * a aby ich hlas stihol dočítať.
 * @param {string} text - citát
 * @param {string} [source=''] - odkiaľ citát je
 * @param {number} [spoken=0] - ako dlho citát číta hlas (ms)
 */
export async function subtitle(text, source = '', spoken = 0) {
    const box = $('#titulky');
    const id = ++subtitleId;
    box.querySelector('.citat').textContent = text;
    box.querySelector('.zdroj').textContent = source;
    box.classList.add('viditelne');   // svet podľa toho vyčistí spodný okraj listu pre titulky
    await wait(Math.max(READING.base + text.length * READING.perChar, spoken + READING.afterVoice));
    if (id === subtitleId) {
        box.classList.remove('viditelne');
    }
    await wait(600);
}

/** Titulky sa hneď skryjú (začína filmová scéna, v ktorej by prekážali). */
export function hideSubtitles() {
    subtitleId++;
    $('#titulky').classList.remove('viditelne');
}

/**
 * Zatmenie do čiernej (opacity 1) alebo zo tmy (opacity 0).
 * @param {number} opacity - cieľová nepriehľadnosť čiernej
 * @param {number} [duration=1400] - trvanie (ms)
 */
export function fade(opacity, duration = 1400) {
    return $('#zatmenie').animate([{ opacity }], { duration, easing: 'ease-in-out', fill: 'forwards' }).finished;
}
