/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   hud.js – údaje počas hry (lístok s úlohou, zväzky, tlačidlá)
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 * =============================================================================
 */
import { PAGE_COUNT } from './config.js';

const $ = selector => document.querySelector(selector);

/** Čas hry v tvare m:ss. */
export function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Slovenský tvar slova „krok“ podľa počtu (1 krok, 2 – 4 kroky, 5 krokov). */
export function stepsLabel(count) {
    if (count === 1) {
        return '1 krok';
    }
    return `${count} ${count >= 2 && count <= 4 ? 'kroky' : 'krokov'}`;
}

export class Hud {
    constructor() {
        this.root = $('#hud');
        this.slots = Array.from({ length: PAGE_COUNT }, () => document.createElement('span'));
        $('#zvazky').replaceChildren(...this.slots);
    }

    /** Pripraví lístok na novú cestu. */
    reset(objective) {
        this.setObjective(objective);
        this.slots.forEach(slot => slot.classList.remove('najdeny'));
        this.setStatus(0, 0);
        $('#rada').classList.remove('skryta');
    }

    /** Lístok a tlačidlá sa plynulo zjavia alebo skryjú. */
    show(visible) {
        if (visible) {
            this.root.hidden = false;
            requestAnimationFrame(() => this.root.classList.remove('skryty'));
        } else {
            this.root.classList.add('skryty');
        }
    }

    setObjective(text) {
        $('#uloha').textContent = text;
    }

    setStatus(time, steps) {
        $('#stav').textContent = `${formatTime(time)} · ${stepsLabel(steps)}`;
    }

    /** Po prvom kroku zmizne rada o ovládaní. */
    hideAdvice() {
        $('#rada').classList.add('skryta');
    }

    /**
     * Nájdený zväzok priletí z miesta vo svete do svojho okienka na lístku.
     * @param {number} index - poradie zväzku
     * @param {number} x - poloha na obrazovke (podiel šírky)
     * @param {number} y - poloha na obrazovke (podiel výšky)
     */
    async collect(index, x, y) {
        const slot = this.slots[index];
        const target = slot.getBoundingClientRect();
        const page = document.createElement('div');
        page.className = 'letiaci-zvazok';
        document.body.append(page);
        const from = { x: x * innerWidth - page.offsetWidth / 2, y: y * innerHeight - page.offsetHeight };
        const to = { x: target.left + target.width / 2 - page.offsetWidth / 2, y: target.top + target.height / 2 - page.offsetHeight / 2 };
        await page.animate([
            { transform: `translate(${from.x}px, ${from.y}px) scale(1.4) rotate(-12deg)`, opacity: 0 },
            { transform: `translate(${from.x}px, ${from.y - 80}px) scale(1.6) rotate(8deg)`, opacity: 1, offset: 0.25 },
            { transform: `translate(${to.x}px, ${to.y}px) scale(0.65) rotate(0deg)`, opacity: 1 }
        ], { duration: 1300, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' }).finished;
        page.remove();
        slot.classList.add('najdeny');
        slot.animate([{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 450, easing: 'ease-out' });
    }
}
