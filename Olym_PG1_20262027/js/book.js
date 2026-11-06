/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   book.js – kniha na stole (HTML a CSS nad plátnom hry)
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Kniha je menu aj rozprávač príbehu. Strany sa vytvoria zo šablón
 *  <template id="dvojstrana-…"> v index.html (každá šablóna = ľavá a pravá strana),
 *  doplní sa im živé záhlavie a číslo strany. Papier každej strany je presný výrez
 *  z obrázka otvorenej knihy, takže strany splývajú s knihou pod nimi.
 *  List sa otáča ako skutočný papier: je zložený z úzkych zvislých pásikov, ktoré
 *  sa v 3D (CSS transformácie) otáčajú okolo krúžkov väzby každý o trochu iný uhol –
 *  okraj listu sa zdvihne prvý a dopadne posledný, list sa pritom prehne.
 *  Ďalej kniha rieši dosku (3D otočenie v CSS), písanie textu, potvrdenie na strane
 *  a „kameru“ knihy – jej let do kresby na strane riadi režisér spolu s kamerou
 *  živého sveta (jeden plynulý záber).
 *  Metódy s animáciou vracajú Promise, režisér ich spája pomocou await.
 * =============================================================================
 */

/** Poradie dvojstrán v knihe; dvojstrana i má strany 2i (vľavo) a 2i + 1 (vpravo). */
const SPREADS = ['titul', 'prolog', 'navod', 'nastavenia', 'o-knihe', 'zalozka', 'epilog'];
const BOOK_TITLE = 'Záhrada stratených ciest';
/**
 * Otáčanie listu: trvanie (ms), počet pásikov, o koľko skôr sa zdvihne okraj listu ako
 * jeho časť pri krúžkoch (podiel trvania), ako veľmi sa pohyb v strede zrýchli (0 = rovnomerne,
 * 1 = začína aj končí v pokoji), počet kľúčových snímok animácie, stmavnutie
 * nakloneného papiera a tieň, ktorý list vrhá na stranu pod sebou. Zvuk listu má
 * plesknutie 0,55 s od začiatku nahrávky – zaznie, keď list dopadne. Po dopade sa list
 * rozplynie do skutočnej strany (settle, ms). Pri preskočení viacerých dvojstrán sa otočí
 * toľko listov, koľko dvojstrán sa preskočí (najviac maxLeaves), jeden za druhým
 * (stagger, ms), každý trvá leafDuration ms; listy uprostred majú menej pásikov.
 */
const TURN = {
    duration: 1050, strips: 10, lead: 0.22, swing: 0.6, keyframes: 40, shade: 0.3, cast: 0.5, soundSnap: 0.55, settle: 160,
    maxLeaves: 4, leafDuration: 780, stagger: 120, middleStrips: 6
};
/**
 * Doska: trvanie a priebeh otáčania (ruka dosku plynule otvorí a položí), posun zatvorenej
 * knihy do stredu, prelínanie dosky so skutočnou stranou (ms), kedy doska dosadne
 * (podiel trvania – vtedy znie zvuk), kedy prechádza zvislou polohou pri otváraní
 * a zatváraní a ako rýchlo sa pred dosadnutím roztiahne tieň knihy na stole (ms).
 */
const COVER = {
    duration: 1500, easing: 'cubic-bezier(0.6, 0, 0.3, 1)', shift: '-23.62%', handover: 240,
    landing: 0.8, upright: 0.45, closeUpright: 0.47, shadowGrow: 320
};
/**
 * Písanie: začiatok (ms), čas na slovo a na písmeno (bez hlasu rozprávača), prestávka medzi
 * odsekmi, vynorenie slova, hlasitosť ceruzky, časť času slova, keď ceruzka škrabe,
 * a hlasitosť zdvihnutej ceruzky.
 */
const WRITE = { start: 350, perWord: 70, perChar: 26, paragraphPause: 450, fade: 650, pencil: 0.26, stroke: 0.8, lifted: 0.08 };
const DUST_COUNT = 34;

const $ = selector => document.querySelector(selector);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Naplní odsek textom po slovách (span.slovo). Slová sú neviditeľné, kým ich Book.write
 * nenapíše – strana má však od začiatku konečné rozloženie.
 * @param {HTMLElement} paragraph - odsek
 * @param {string} text - text odseku
 */
export function fillWords(paragraph, text) {
    paragraph.replaceChildren();
    for (const word of text.split(' ')) {
        const span = document.createElement('span');
        span.className = 'slovo';
        span.textContent = word;
        paragraph.append(span, ' ');
    }
}

export class Book {
    /** @param {SoundDirector} sounds - zvuky (otvorenie, list, ceruzka) */
    constructor(sounds) {
        this.sounds = sounds;
        this.desk = $('#stol');
        this.camera = $('#kamera');
        this.root = $('#kniha');
        this.cover = $('#doska');
        this.current = SPREADS[0];
        this.busy = false;
        this.decorate = () => {};
        this.pages = this.createPages();
        this.sheets = $('#listy');
        this.slots = { left: this.createSlot('vlavo'), right: this.createSlot('vpravo') };
        this.place(this.current);
        this.root.addEventListener('click', event => this.handleClick(event));
        this.root.addEventListener('change', event => this.onSetting?.(event.target));
        this.scatterDust();
    }

    // =========================================================================
    //  Strany knihy
    // =========================================================================

    /**
     * Strany zo šablón: každá dostane záhlavie (vľavo názov knihy, vpravo názov kapitoly)
     * a číslo strany; titulná strana je bez nich ako v skutočnej knihe. Položky obsahu
     * dostanú čísla strán, na ktorých kapitoly začínajú.
     * @returns {Object<string, {left: HTMLElement, right: HTMLElement}>}
     */
    createPages() {
        const pages = {};
        SPREADS.forEach((id, index) => {
            const template = $(`#dvojstrana-${id}`);
            const content = template.content;
            const side = (name, number) => {
                const part = content.querySelector(`[data-strana="${name === 'left' ? 'lava' : 'prava'}"]`);
                // strana je absolútne umiestnený papier, rozloženie textu nesie vnútorný obal
                const page = document.createElement('div');
                page.className = `strana ${name === 'left' ? 'lava' : 'prava'}`;
                page.dataset.dvojstrana = id;
                const inner = document.createElement('div');
                inner.className = 'vnutro-strany';
                page.append(inner);
                const text = document.createElement('div');
                text.className = `text ${part.className}`;
                text.append(...part.cloneNode(true).childNodes);
                if (number > 1) {
                    const head = document.createElement('header');
                    head.className = 'zahlavie';
                    head.textContent = name === 'left' ? BOOK_TITLE : template.dataset.nazov;
                    const folio = document.createElement('footer');
                    folio.className = 'folio';
                    folio.textContent = number;
                    inner.append(head, text, folio);
                } else {
                    inner.append(text);
                }
                return page;
            };
            pages[id] = { left: side('left', 2 * index + 1), right: side('right', 2 * index + 2) };
        });
        for (const page of Object.values(pages).flatMap(spread => [spread.left, spread.right])) {
            for (const number of page.querySelectorAll('[data-cislo]')) {
                number.textContent = 2 * SPREADS.indexOf(number.dataset.cislo) + 1;
            }
        }
        return pages;
    }

    /** Doplní obsah dvojstrany (texty príbehu, údaje) – režisér, decorate. */
    render(id) {
        const pages = this.pages[id];
        this.decorate(id, pages);
        return pages;
    }

    /**
     * Miesto pre stranu (ľavá alebo pravá polovica knihy) s tieňom, ktorý na stranu
     * vrhá otáčaný list.
     */
    createSlot(side) {
        const slot = document.createElement('div');
        slot.className = `miesto-strany ${side}`;
        const shadow = document.createElement('div');
        shadow.className = 'vrhnuty-tien';
        slot.append(shadow);
        slot.shadow = shadow;
        this.sheets.append(slot);
        return slot;
    }

    /**
     * Vloží strany dvojstrany na ich miesta v knihe (ostatné strany nie sú v dokumente).
     * Strana, ktorá už na svojom mieste je, sa nevkladá znova – prehliadač by jej
     * animácie (vpíjanie kresby, písanie) spustil odznova.
     */
    place(id, sides = ['left', 'right']) {
        for (const side of sides) {
            if (this.slots[side].firstChild !== this.pages[id][side]) {
                this.slots[side].replaceChildren(this.pages[id][side], this.slots[side].shadow);
            }
        }
    }

    /** Okamžite ukáže dvojstranu (bez otáčania listu). */
    show(id) {
        const pages = this.render(id);
        this.place(id);
        this.current = id;
        return pages;
    }

    /**
     * Otočí listy na dvojstranu id – dopredu (listy sprava doľava) alebo dozadu. Medzi
     * susednými dvojstranami je jeden list; pri preskočení viacerých dvojstrán sa otočí
     * viac listov rýchlo po sebe, každý so svojimi stranami (ako pri listovaní knihou).
     * Pod listami je už nová strana; strana, na ktorú listy dopadnú, sa vymení po dopade.
     * @returns {Promise<{left, right}>} strany novej dvojstrany
     */
    async turnTo(id) {
        const pages = this.render(id);
        if (id === this.current) {
            return pages;
        }
        const from = SPREADS.indexOf(this.current);
        const to = SPREADS.indexOf(id);
        const forward = to > from;
        // zastávky listovania: všetky dvojstrany medzi, pri dlhom skoku rovnomerný výber
        const count = Math.min(Math.abs(to - from), TURN.maxLeaves);
        const stops = Array.from({ length: count + 1 }, (_, i) => Math.round(from + (to - from) * i / count));
        for (const index of stops.slice(1, -1)) {
            this.render(SPREADS[index]);   // aj prelistované strany majú svoj obsah
        }
        this.place(id, [forward ? 'right' : 'left']);
        const single = count === 1;
        const leaves = [];
        for (let k = 0; k < count; k++) {
            const a = this.pages[SPREADS[stops[k]]];
            const b = this.pages[SPREADS[stops[k + 1]]];
            const edge = k === 0 || k === count - 1;
            leaves.push(this.buildLeaf(forward ? a.right : a.left, forward ? b.left : b.right, forward,
                edge ? TURN.strips : TURN.middleStrips, k < count - 1));
        }
        const duration = single ? TURN.duration : TURN.leafDuration;
        const done = leaves.map((leaf, k) => this.playLeaf(leaf, {
            delay: k * TURN.stagger,
            duration,
            order: k,
            lift: k === count - 1,   // pod posledným listom sa odkrýva nová strana
            land: k === 0,           // prvý list dopadá na pôvodnú stranu
            volume: k === count - 1 || single ? 0.45 : 0.22
        }));
        await Promise.all(done);
        this.place(id);
        await this.dropSheets(leaves.map(leaf => leaf.sheet));
        this.current = id;
        return pages;
    }

    /**
     * Kópia strany pre otáčaný list a pre rub dosky: bez mien a identifikátorov (prepínače
     * kópie nesmú prepnúť skutočné nastavenia). Kópia ukazuje stranu v konečnom stave –
     * animácie v nej neprebiehajú (hra.css), aby sa pri otáčaní listu nič neopakovalo.
     */
    copyPage(page) {
        const copy = page.cloneNode(true);
        copy.removeAttribute('style');
        for (const element of copy.querySelectorAll('[id], [name]')) {
            element.removeAttribute('id');
            element.removeAttribute('name');
        }
        return copy;
    }

    /**
     * Otáčaný list: reťaz pásikov, každý je vnorený v predchádzajúcom a otáča sa okolo
     * jeho okraja (prvý okolo krúžkov). Uhol pásika závisí od času a od vzdialenosti
     * od chrbta: okraj listu sa začne dvíhať skôr a dopadne neskôr než časť pri krúžkoch,
     * preto sa list prehne. Každý pásik má líce (výrez otáčanej strany) a rub (výrez
     * strany na druhej strane listu). Pohyb sa vopred vypočíta do kľúčových snímok
     * (playLeaf) – iba transformácie a priehľadnosť, ktoré skladá grafická karta.
     * @param {HTMLElement} front - strana, ktorá sa otáča (líce listu)
     * @param {HTMLElement} back - strana na rube listu
     * @param {boolean} forward - dopredu (list sprava doľava) alebo dozadu
     * @param {number} count - počet pásikov
     * @param {boolean} passing - prelistovaný list (jeho strany sa ukážu celé, bez písania)
     * @returns {{sheet, strips, shades, forward}} list pripravený na otočenie
     */
    buildLeaf(front, back, forward, count, passing) {
        // presné (neceločíselné) rozmery listov – zaokrúhlené by list dopadol o pixel vedľa strany
        const size = getComputedStyle(this.sheets);
        const width = parseFloat(size.width) / 2;
        const height = parseFloat(size.height);
        // pásiky majú celočíselnú šírku a zvyšok pripadne pásiku, ktorého poloha sa nesčítava
        // (vnorené pásiky by inak každý zaokrúhlil o zlomok pixela a list by bol o pár pixelov kratší)
        const base = Math.floor(width / count);
        const rest = width - base * (count - 1);
        const widths = Array.from({ length: count }, (_, i) => ((forward ? i === count - 1 : i === 0) ? rest : base));
        const sheet = document.createElement('div');
        sheet.className = passing ? 'otacany-list prelistovany' : 'otacany-list';
        const strips = [];
        const shades = [];
        let parent = sheet;
        let fromSpine = 0;   // vzdialenosť pásika od chrbta (px)
        for (let i = 0; i < count; i++) {
            const element = document.createElement('div');
            element.className = 'pasik';
            const left = i === 0 ? (forward ? width : width - widths[0]) : (forward ? widths[i - 1] : -widths[i]);
            Object.assign(element.style, {
                width: `${widths[i]}px`,
                height: `${height}px`,
                left: `${left}px`,
                transformOrigin: forward ? 'left center' : 'right center'
            });
            // posun výrezu strany v pásiku: líce od chrbta (dopredu) alebo od okraja; rub naopak
            const nearSpine = -fromSpine;
            const nearEdge = -(width - fromSpine - widths[i]);
            fromSpine += widths[i];
            const faces = [[front, forward ? nearSpine : nearEdge + 1, ''], [back, forward ? nearEdge + 1 : nearSpine, 'rub']];
            for (const [page, offset, side] of faces) {
                const face = document.createElement('div');
                face.className = `plocha-pasika ${side}`;
                face.style.left = forward ? '0' : '-1px';
                const copy = this.copyPage(page);
                Object.assign(copy.style, { left: `${offset}px`, width: `${width}px`, height: `${height}px` });
                const shade = document.createElement('div');
                shade.className = 'tien-pasika';
                face.append(copy, shade);
                element.append(face);
                shades.push({ shade, index: i });
            }
            parent.append(element);
            strips.push(element);
            parent = element;
        }
        return { sheet, strips, shades, forward };
    }

    /**
     * Otočenie pripraveného listu: kľúčové snímky uhla každého pásika (voči
     * predchádzajúcemu), stmavnutia nakloneného papiera, vrhnutých tieňov a poradia listov
     * (list na pravej strane leží pod skôr otočenými listami, po prechode chrbtom nad nimi).
     * @param {object} leaf - list z buildLeaf
     * @param {{delay, duration, order, lift, land, volume}} options - oneskorenie a trvanie (ms),
     *     poradie listu, či vrhá tieň pri dvíhaní a pri dopade, hlasitosť šuchotu
     * @returns {Promise<void>} splní sa po dopade listu
     */
    async playLeaf(leaf, { delay, duration, order, lift, land, volume }) {
        const { sheet, strips, shades, forward } = leaf;
        const count = strips.length;
        const d = forward ? 1 : -1;
        // list sa pohne hneď po kliknutí a dopadne s malou rýchlosťou (nie od nuly k nule ako kosínus)
        const ease = t => {
            const x = Math.min(1, Math.max(0, t));
            return x - TURN.swing * Math.sin(2 * Math.PI * x) / (2 * Math.PI);
        };
        const angleOf = (i, t) => {
            const s = (i + 0.5) / count;   // 0 pri krúžkoch, 1 na okraji listu
            const start = TURN.lead * (1 - s);
            return Math.PI * ease((t - start) / (1 - 2 * start));
        };
        const turnFrames = strips.map(() => []);
        const shadeFrames = strips.map(() => []);
        const liftFrames = [];
        const landFrames = [];
        for (let k = 0; k <= TURN.keyframes; k++) {
            const offset = k / TURN.keyframes;
            const angles = strips.map((element, i) => angleOf(i, offset));
            angles.forEach((angle, i) => {
                turnFrames[i].push({ offset, transform: `rotateY(${-d * (angle - (i > 0 ? angles[i - 1] : 0))}rad)` });
                shadeFrames[i].push({ offset, opacity: TURN.shade * Math.sin(angle) });   // naklonený papier je tmavší
            });
            const mean = angles.reduce((sum, angle) => sum + angle, 0) / count;
            liftFrames.push({ offset, opacity: mean < Math.PI / 2 ? TURN.cast * Math.sin(mean) : 0 });
            landFrames.push({ offset, opacity: mean >= Math.PI / 2 ? TURN.cast * Math.sin(mean) : 0 });
        }
        const timing = { duration, delay, easing: 'linear', fill: 'both' };
        // poradie listov: na pravej strane skorší list navrchu, po prechode chrbtom neskorší
        const zIndex = [{ offset: 0, zIndex: 100 - order }, { offset: 0.5, zIndex: 100 - order }, { offset: 0.5, zIndex: 200 + order }, { offset: 1, zIndex: 200 + order }];
        this.sheets.append(sheet);
        const shadows = [];
        if (lift) {
            shadows.push((forward ? this.slots.right : this.slots.left).shadow.animate(liftFrames, timing));
        }
        if (land) {
            shadows.push((forward ? this.slots.left : this.slots.right).shadow.animate(landFrames, timing));
        }
        const animations = [
            ...strips.map((element, i) => element.animate(turnFrames[i], timing)),
            ...shades.map(({ shade, index }) => shade.animate(shadeFrames[index], timing)),
            sheet.animate(zIndex, timing),
            ...shadows
        ];
        this.sounds.effect('page', volume, (delay + duration) / 1000 - TURN.soundSnap);   // plesknutie zaznie pri dopade listu
        await animations[0].finished;
        for (const shadow of shadows) {
            shadow.cancel();
        }
    }

    /**
     * Dopadnuté listy sa nahradia skutočnou stranou: strana sa vloží pod listy. Listy pod
     * posledným (navrchu) sa hneď odstránia – ten ich celé zakrýva – a až potom sa posledný
     * list krátko prelínaním rozplynie do strany. Keby sa rozplývali všetky naraz, cez
     * horný list by na chvíľu presvitali strany prelistovaných listov.
     * @param {HTMLElement[]} sheets - listy v poradí otáčania (posledný leží navrchu)
     */
    async dropSheets(sheets) {
        const top = sheets.at(-1);
        sheets.slice(0, -1).forEach(sheet => sheet.remove());
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await top.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TURN.settle, easing: 'linear', fill: 'forwards' }).finished;
        top.remove();
    }

    // =========================================================================
    //  Úvodný záber, otvorenie a zatvorenie knihy
    // =========================================================================

    /** Prach vo svetle lampy: zrnká s náhodnou polohou, smerom a rýchlosťou. */
    scatterDust() {
        const dust = $('#prach');
        for (let i = 0; i < DUST_COUNT; i++) {
            const mote = document.createElement('span');
            mote.style.left = `${15 + Math.random() * 60}%`;
            mote.style.top = `${10 + Math.random() * 70}%`;
            mote.style.setProperty('--dx', `${(Math.random() - 0.3) * 18}vw`);
            mote.style.setProperty('--dy', `${(Math.random() - 0.6) * 14}vh`);
            mote.style.animationDuration = `${14 + Math.random() * 16}s`;
            mote.style.animationDelay = `${-Math.random() * 20}s`;
            dust.append(mote);
        }
    }

    /**
     * Úvodný záber: kamera sa zo šikmého pohľadu pomaly prisunie ku knihe na stole.
     * @returns {Promise<void>}
     */
    approach() {
        return this.camera.animate([
            { transform: 'translateY(6vh) scale(0.78) rotateX(24deg) rotateZ(-5deg)' },
            { transform: 'none' }
        ], { duration: 3800, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' }).finished;
    }

    /**
     * Otvorenie knihy: ruka plynule otvorí prednú dosku okolo chrbta a položí ju na stôl,
     * kniha sa zároveň posunie do stredu. Rub dosky je ľavá strana otvorenej knihy
     * (kópia titulnej strany na rovnakom mieste), takže keď doska dosadne, pod ňou sa
     * ukáže skutočná strana s krúžkami väzby a doska sa do nej nenápadne rozplynie.
     * Zvuk otvorenia zaznie v chvíli, keď doska dosadne.
     */
    async open() {
        const timing = { duration: COVER.duration, easing: COVER.easing };
        this.sounds.effect('open', 0.6, COVER.duration * COVER.landing / 1000);
        this.dressCoverInside();
        this.root.classList.add('otvara-sa');
        // tieň sa roztiahne pod celú knihu, až keď doska klesá k stolu (krátko pred dosadnutím)
        this.root.style.setProperty('--tien', 'scaleX(1)');
        this.root.style.setProperty('--tien-cas', `${COVER.shadowGrow}ms`);
        this.root.style.setProperty('--tien-oneskorenie', `${COVER.duration * COVER.landing - COVER.shadowGrow}ms`);
        this.cover.hidden = false;
        const slide = this.root.animate([{ transform: `translateX(${COVER.shift})` }, { transform: 'translateX(0)' }], timing);
        const turn = this.cover.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], { ...timing, fill: 'forwards' });
        await wait(COVER.duration * COVER.upright);
        this.root.classList.add('odkryva-sa');   // doska už nezakrýva chrbát – pravá strana je celá
        await turn.finished;
        this.root.classList.remove('zatvorena');
        // rozplynie sa len rub dosky – priehľadnosť celej dosky by zrušila skrývanie jej líca (3D)
        const handover = this.cover.querySelector('.vnutro').animate([{ opacity: 1 }, { opacity: 0 }], { duration: COVER.handover, fill: 'forwards' });
        await Promise.all([slide.finished, handover.finished]);
        this.root.classList.remove('otvara-sa', 'odkryva-sa');
        this.cover.hidden = true;
        turn.cancel();
        handover.cancel();
    }

    /**
     * Rub dosky je ľavá strana otvorenej knihy: vloží sa naň kópia aktuálnej ľavej strany,
     * takže jej text je vidieť počas celého otáčania dosky (a po dopade na ňu nadviaže
     * skutočná strana knihy). Kópia sa umiestni presne tam, kde leží ľavá strana.
     */
    dressCoverInside() {
        const copy = this.copyPage(this.pages[this.current].left);
        copy.classList.add('na-doske');
        this.cover.querySelector('.vnutro').replaceChildren(copy);
    }

    /**
     * Zatvorenie knihy: nad ľavou stranou sa nenápadne vynorí rub dosky (kópia strany),
     * potom ruka dosku plynule zdvihne a priklopí na pravú stranu a kniha sa posunie späť.
     * Zvuk zatvorenia zaznie v chvíli, keď doska dosadne.
     */
    async close() {
        const timing = { duration: COVER.duration, easing: COVER.easing };
        this.dressCoverInside();
        this.root.classList.add('otvara-sa');
        this.cover.hidden = false;
        const turn = this.cover.animate([{ transform: 'rotateY(-180deg)' }, { transform: 'rotateY(0deg)' }], timing);
        turn.pause();   // doska zatiaľ leží otvorená na ľavej strane
        await this.cover.querySelector('.vnutro').animate([{ opacity: 0 }, { opacity: 1 }], { duration: COVER.handover }).finished;
        this.sounds.effect('close', 0.6, COVER.duration * COVER.landing / 1000);
        this.root.classList.add('zatvorena', 'odkryva-sa');
        this.root.style.setProperty('--tien', 'scaleX(0.48)');
        this.root.style.setProperty('--tien-cas', `${COVER.duration * COVER.closeUpright}ms`);   // tieň sa zmenší, kým sa doska dvíha
        this.root.style.setProperty('--tien-oneskorenie', '0ms');
        const slide = this.root.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${COVER.shift})` }], timing);
        turn.play();
        await wait(COVER.duration * COVER.closeUpright);
        this.root.classList.remove('odkryva-sa');   // doska sa sklápa nad pravú stranu a chrbát zakryje
        await Promise.all([slide.finished, turn.finished]);
        this.root.classList.remove('otvara-sa');
    }

    // =========================================================================
    //  Písanie a kresba na strane
    // =========================================================================

    /**
     * Rozprávanie sa píše slovo po slove a rozprávač ho číta. Slová sú na strane od začiatku
     * na svojom mieste, len neviditeľné (fillWords) – nič sa pri písaní neposúva. Každé slovo
     * sa vynorí z atramentu (CSS animácia priehľadnosti s oneskorením) v okamihu, keď ho
     * rozprávač vysloví (časy slov z nahrávky); bez nahrávky sa dlhšie slovo píše dlhšie.
     * Ceruzka pritom škrípe. Kliknutie na knihu dopíše všetko naraz a rozprávač stíchne.
     * @param {HTMLElement[]} paragraphs - odseky so slovami (span.slovo)
     * @returns {Promise<void>} splní sa, keď je všetko napísané
     */
    write(paragraphs) {
        const token = {};          // novšie písanie (napr. príbeh spustený znova) staršie ukončí
        this.writing = token;
        let delay = WRITE.start;
        const strokes = [];        // kedy ceruzka píše slovo (od – do, ms); medzi slovami sa zdvihne
        const narration = [];      // kedy rozprávač začne čítať ktorý odsek (ms, text)
        for (const paragraph of paragraphs) {
            paragraph.classList.remove('pise', 'dopisane');
            const text = paragraph.textContent.trim();
            const voice = this.sounds.voiceOf(text);
            const words = [...paragraph.querySelectorAll('.slovo')];
            let time = 0;
            const starts = voice?.words ?? words.map(word => {
                const start = time;
                time += WRITE.perWord + word.textContent.length * WRITE.perChar;
                return start;
            });
            const length = voice?.duration ?? time;
            if (voice) {
                narration.push([delay, text]);
            }
            words.forEach((word, i) => {
                const start = delay + starts[i];
                word.style.animationDelay = `${start}ms`;
                strokes.push([start, start + ((starts[i + 1] ?? length) - starts[i]) * WRITE.stroke]);
            });
            delay += length + WRITE.paragraphPause;
        }
        void this.root.offsetWidth;   // animácie sa spustia odznova aj pri opakovanom písaní
        paragraphs.forEach(paragraph => paragraph.classList.add('pise'));
        // zvuk ceruzky v rytme písania: pri slove škrabe, medzi slovami takmer stíchne
        const pencil = this.sounds.scribble(WRITE.pencil);
        const speeches = [];
        const readers = narration.map(([at, text]) => setTimeout(() => speeches.push(this.sounds.speak(text)), at));
        const begin = performance.now();
        let writing = true;
        const listen = now => {
            if (!writing) {
                return;
            }
            const t = now - begin;
            pencil.setLevel(strokes.some(([from, to]) => t >= from && t < to) ? 1 : WRITE.lifted);
            requestAnimationFrame(listen);
        };
        requestAnimationFrame(listen);
        return new Promise(resolve => {
            const done = () => {
                writing = false;
                pencil.stop();
                readers.forEach(clearTimeout);
                speeches.forEach(speech => speech?.stop());
                clearTimeout(timer);
                this.root.removeEventListener('pointerdown', skip);
                paragraphs.forEach(paragraph => paragraph.classList.add('dopisane'));
                resolve();
            };
            const skip = () => this.writing === token && done();
            const timer = setTimeout(done, delay + WRITE.fade);
            this.root.addEventListener('pointerdown', skip, { once: true });
        });
    }

    /** Kresba na pravej strane dvojstrany (predvolene aktuálnej). */
    figure(id = this.current) {
        return this.pages[id].right.querySelector('[data-ilustracia]');
    }

    /**
     * Pripraví kresbu sveta na stranu, zatiaľ neviditeľnú (aj na strane, ktorá ešte nie je
     * otvorená – otáčaný list ju potom ukáže prázdnu, bez starej kresby). Kresba je atrament
     * s priehľadnosťou, takže leží priamo na papieri strany; rámik má pomer strán obrázka.
     * @param {string} id - dvojstrana
     * @param {string} url - adresa obrázka kresby (blob:)
     * @returns {Promise<void>} splní sa, keď je obrázok pripravený na zobrazenie
     */
    async loadIllustration(id, url) {
        const figure = this.figure(id);
        const img = figure.querySelector('img');
        img.classList.remove('vpija-sa', 'vpita');
        if (img.src !== url) {
            if (img.src.startsWith('blob:')) {
                URL.revokeObjectURL(img.src);   // predchádzajúca kresba sa už nepoužije
            }
            img.src = url;
            await img.decode().catch(() => {});
        }
        figure.style.setProperty('--pomer', `${img.naturalWidth} / ${img.naturalHeight}`);
    }

    /**
     * Ukáže pripravenú kresbu.
     * @param {boolean} [draw=true] - kresba sa pomaly vpije do papiera (inak je hneď celá)
     */
    showIllustration(id, draw = true) {
        const img = this.figure(id).querySelector('img');
        void img.offsetWidth;   // animácia vpíjania sa spustí znova aj pri rovnakej kresbe
        img.classList.add(draw ? 'vpija-sa' : 'vpita');
    }

    /** Vytlačí kresbu sveta na aktuálnu stranu (loadIllustration a showIllustration naraz). */
    async setIllustration(url, draw = true) {
        await this.loadIllustration(this.current, url);
        this.showIllustration(this.current, draw);
    }

    // =========================================================================
    //  Kamera knihy: let do kresby a z nej
    // =========================================================================

    /**
     * Kresba na strane pri pokojnej kamere knihy (px CSS) – odtiaľ začína let do sveta
     * a tam sa let zo sveta končí. Zároveň si zapamätá polohu vrstvy stola v pokoji.
     * @returns {DOMRect}
     */
    cardRect() {
        this.resetCamera();
        this.rest = this.camera.getBoundingClientRect();
        return this.figure().getBoundingClientRect();
    }

    /**
     * Let kamery knihy: bod focus (px CSS pri pokojnej kamere) sa po obrazovke presúva
     * a všetko okolo neho sa zväčšuje, stôl sa pritom rozplýva alebo vynára. Je to animácia
     * Web Animations iba s transformáciou a priehľadnosťou – beží v skladaní vrstiev na
     * grafickej karte, takže zostane plynulá, aj keď má procesor práve veľa práce so svetom.
     * @param {{x, y}} focus - bod, okolo ktorého sa kamera približuje
     * @param {{offset, x, y, scale, opacity}[]} frames - snímky letu: kde je focus, zväčšenie, priehľadnosť stola
     * @param {number} duration - trvanie (ms)
     * @returns {Animation} animácia kamery – jej startTime je začiatok letu na časovej osi dokumentu
     */
    flyCamera(focus, frames, duration) {
        const timing = { duration, easing: 'linear', fill: 'both' };
        this.camera.style.transformOrigin = `${focus.x - this.rest.left}px ${focus.y - this.rest.top}px`;
        this.desk.animate(frames.map(frame => ({ offset: frame.offset, opacity: frame.opacity })), timing);
        return this.camera.animate(frames.map(frame => ({
            offset: frame.offset,
            transform: `translate(${frame.x - focus.x}px, ${frame.y - focus.y}px) scale(${frame.scale})`
        })), timing);
    }

    /** Vráti kameru knihy a stôl do pokojnej polohy. */
    resetCamera() {
        this.camera.getAnimations().forEach(animation => animation.cancel());
        this.desk.getAnimations().forEach(animation => animation.cancel());
        this.camera.style.transform = '';
        this.camera.style.transformOrigin = '';
    }

    // =========================================================================
    //  Ovládanie a potvrdenie na strane
    // =========================================================================

    /**
     * Kliknutie na tlačidlo s akciou. Nevratná akcia (data-potvrdit) sa najprv
     * na strane prečiarkne a pod ňou sa rukou dopíše otázka; vykoná sa až po „áno“.
     */
    handleClick(event) {
        const button = event.target.closest('button[data-akcia], button[data-volba]');
        if (!button || this.busy) {
            return;
        }
        if (button.dataset.volba) {
            this.answerConfirmation(button);
            return;
        }
        if (button.dataset.potvrdit) {
            this.askConfirmation(button);
            return;
        }
        this.onAction?.(button.dataset.akcia);
    }

    /** Položka sa prečiarkne ceruzkou a pod ňou sa dopíše „Naozaj? … áno · nie“. */
    askConfirmation(button) {
        if (button.classList.contains('preciarknuta')) {
            return;
        }
        button.classList.add('preciarknuta');
        const note = document.createElement('div');
        note.className = 'otazka';
        note.dataset.akcia = button.dataset.akcia;
        note.innerHTML = `<span class="naozaj"></span><button data-volba="ano">áno</button><span class="bodka">·</span><button data-volba="nie">nie</button>`;
        note.querySelector('.naozaj').textContent = `Naozaj? ${button.dataset.potvrdit}`;
        button.after(note);
        this.sounds.effect('pencil', 0.3);
    }

    /** Odpoveď na otázku: „áno“ vykoná akciu, „nie“ otázku zotrie a prečiarknutie zmizne. */
    answerConfirmation(choice) {
        const note = choice.closest('.otazka');
        const item = note.previousElementSibling;
        if (choice.dataset.volba === 'ano') {
            this.onAction?.(note.dataset.akcia);
        }
        note.animate([{ opacity: 1 }, { opacity: 0, filter: 'blur(2px)' }], { duration: 300 }).finished.then(() => note.remove());
        item.classList.remove('preciarknuta');
    }

    /** Kniha nereaguje na kliknutia, kým trvá animácia. */
    async whileBusy(task) {
        this.busy = true;
        try {
            return await task();
        } finally {
            this.busy = false;
        }
    }
}
