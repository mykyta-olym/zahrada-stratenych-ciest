/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   director.js – režisér: scenár celej aplikácie
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Režisér spája knihu (book.js), filmovú vrstvu (cinema.js), údaje počas hry
 *  (hud.js), svet (WorldScene), oblohu (SkyScene) a zvuky (sound.js) do jedného
 *  príbehu. Každá scéna je asynchrónna funkcia – jej kroky idú po sebe (await)
 *  ako v scenári filmu:
 *    úvodný záber -> otvorenie knihy -> prológ -> let do kresby (jeden nepretržitý
 *    záber od knihy na stole až k bráne, kde čaká záhradník) -> rozhovor -> hra ->
 *    stretnutie s babkou -> let zo sveta späť do kresby v knihe -> epilóg.
 *  Kým je na obrazovke kniha, hra (Phaser) spí – kniha má celý výkon počítača.
 *  Stav aplikácie (this.state): loading, cover, opening, book, transition,
 *  garden, paused, resuming, closed. Nevratné akcie sa potvrdzujú priamo na strane knihy.
 * =============================================================================
 */
import { STORY } from './story.js';
import { MAZE_SIZES, PAGE_COUNT } from './config.js';
import { Book, fillWords } from './book.js';
import { Hud, formatTime, stepsLabel } from './hud.js';
import { letterbox, titleCard, subtitle, hideSubtitles, fade, wait } from './cinema.js';

const SETTINGS_KEY = 'zahrada-stratenych-ciest';
const FILM_FRAME = 0.76;              // vo filme zaberajú čierne pásy hore a dole spolu 22 % výšky obrazovky
/**
 * Let medzi knihou a svetom: trvanie (ms) do sveta a späť. Kniha sa so svetom prelína
 * od chvíle, keď má kresba polovicu veľkosti, pri ktorej zakryje celú obrazovku;
 * svet sa prebudí o kúsok letu skôr (pod ešte nepriehľadnou knihou) a prvé snímky sa
 * kreslí celý. Titulok kapitoly sa vynorí v danej časti letu. Let knihy je zapísaný
 * ako animácia so 120 snímkami (medzi nimi lineárne).
 */
const FLIGHT = { into: 6400, out: 6000, crossfade: 0.5, wakeLead: 0.1, warmFrames: 4, titleAt: 0.62, frames: 120 };
const ABANDON_TIME = 750;             // stôl sa vráti pod knihu (rovnako ako prechod v hra.css)
const DEFAULT_SETTINGS = { music: true, sounds: true, voice: true, size: 'stredne' };
const $ = selector => document.querySelector(selector);
/** Počká na najbližšie vykreslenie prehliadača. */
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
/** Hodnota z objektu STORY podľa cesty „prologue.heading“. */
const storyText = path => path.split('.').reduce((value, part) => value?.[part], STORY);
/** Plynulý prechod 0 -> 1 medzi hodnotami a a b (smoothstep). */
const smoothstep = (a, b, x) => {
    const t = Phaser.Math.Clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};
/** Priebeh letu kamery: rozbeh aj dobeh bez trhnutia (na krajoch nulová rýchlosť aj zrýchlenie). */
const glide = t => t * t * t * (t * (6 * t - 15) + 10);

/** Načíta uložené nastavenia (v súkromnom režime prehliadača nemusí byť úložisko dostupné). */
function loadSettings() {
    try {
        const saved = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
        return MAZE_SIZES[saved.size] ? saved : DEFAULT_SETTINGS;
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export class Director {
    /**
     * @param {Phaser.Game} game - hra (scény sveta a oblohy)
     * @param {SoundDirector} sounds - zvuková réžia
     */
    constructor(game, sounds) {
        this.game = game;
        this.sounds = sounds;
        this.state = 'loading';
        this.settings = loadSettings();
        for (const kind of ['music', 'sounds', 'voice']) {
            sounds.setEnabled(kind, this.settings[kind]);
        }
        this.book = new Book(sounds);
        this.book.decorate = (id, pages) => this.decorate(id, pages);
        this.book.onAction = action => this.act(action);
        this.book.onSetting = input => this.changeSetting(input);
        this.hud = new Hud();
        this.subtitles = Promise.resolve();
        this.awake = true;            // hra po načítaní beží; režisér ju uspí, kým je na obrazovke kniha

        game.events.on('load-progress', value => {
            $('#nacitanie').textContent = `Načítava sa… ${Math.round(value * 100)} %`;
        });
        game.events.on('load-error', files => this.showError(
            `Nepodarilo sa načítať: ${files.join(', ')}. Rozbaľte celý balík znova a spustite hru cez spustit.cmd.`));
        game.events.once('world-created', world => this.ready(world));
        game.events.on('hud-update', ({ time, steps }) => this.hud.setStatus(time, steps));
        game.events.on('first-move', () => this.hud.hideAdvice());
        game.events.on('page-found', found => this.onPageFound(found));
        game.events.on('reached-exit', () => this.finale());
        game.events.on('weather', weather => this.sounds.setWeather(weather));
        game.events.on('blur', () => this.pause());

        $('#doska').addEventListener('click', () => this.openBook());
        // prehliadač povolí zvuk až po akcii používateľa – hudba knihy začne pri prvom kliknutí
        // či stlačení klávesu kdekoľvek na stole (nielen pri otvorení knihy)
        const firstGesture = () => {
            if (this.state === 'cover') {
                this.sounds.start();
                this.sounds.setMood('book', 3000);
            }
        };
        window.addEventListener('pointerdown', firstGesture);
        window.addEventListener('keydown', firstGesture);
        $('#napoveda').addEventListener('click', event => {
            event.currentTarget.blur();
            this.world.showHint();
        });
        $('#zalozka').addEventListener('click', event => {
            event.currentTarget.blur();
            this.pause();
        });
        $('#znova-otvorit').addEventListener('click', () => location.reload());
        document.addEventListener('keydown', event => this.handleKey(event));
        window.addEventListener('beforeunload', event => {
            if (this.state === 'garden' || this.state === 'paused') {
                event.preventDefault();
            }
        });
    }

    /** Chybové hlásenie (zoznam hlásení je v Používateľskej príručke). */
    showError(message) {
        $('#nacitanie').hidden = true;
        $('#chyba').textContent = message;
        $('#chyba').hidden = false;
    }

    // =========================================================================
    //  Svet v pozadí: prebudenie, uspanie, príprava
    // =========================================================================

    /** Prebudí hru: beží herná slučka a kreslia sa scény sveta a oblohy. */
    wakeWorld() {
        if (this.awake) {
            return;
        }
        this.awake = true;
        this.game.scene.wake('World');
        this.game.scene.wake('Sky');
        this.game.loop.wake();
        this.game.loop.resetDelta();   // čas spánku sa nezapočíta do animácií
        this.world.input.keyboard.resetKeys();
        $('#svet').classList.add('zivy');
    }

    /** Uspí hru celú – nekreslí sa nič a kniha má celý výkon počítača. */
    sleepWorld() {
        if (!this.awake) {
            return;
        }
        this.awake = false;
        this.world.followShot(null);
        $('#svet').classList.remove('zivy', 'zastaveny');
        $('#kino').classList.remove('pauza');
        this.game.scene.sleep('World');
        this.game.scene.sleep('Sky');
        this.game.loop.sleep();
    }

    /**
     * Postaví nový svet a nakreslí ho do knihy (kresba vznikne mimo obrazovky, hra pritom
     * spí). Robí sa vopred – pod čiernou obrazovkou pri spustení alebo kým hráč číta
     * epilóg –, aby sa príbeh začal bez čakania.
     * @returns {Promise<void>}
     */
    prepareWorld() {
        this.preparing = (async () => {
            this.world.build(this.settings.size);
            this.illustration = await this.world.drawIllustration();
            this.preparedSize = this.settings.size;
            this.played = false;
        })();
        return this.preparing;
    }

    // =========================================================================
    //  Úvodný záber a kniha
    // =========================================================================

    /**
     * Všetko je načítané: pod čiernou obrazovkou sa pripraví svet, potom sa zo tmy
     * vynorí stôl so zatvorenou knihou a kamera sa k nej pomaly prisunie.
     */
    async ready(world) {
        this.world = world;
        this.sky = this.game.scene.getScene('Sky');
        // písma knihy sa načítajú vopred – inak by sa text pri prvom zobrazení preskladal
        await Promise.all(['600 40px Caveat', '20px Cormorant', 'italic 20px Cormorant', '600 20px Cormorant'].map(font => document.fonts.load(font)));
        await this.prepareWorld();
        // prvé vykreslenie celého sveta trvá dlhšie (grafická karta si pripravuje zdroje) –
        // urobí sa teraz pod čiernou obrazovkou, nie až uprostred letu do kresby
        world.forceLive = true;
        for (let i = 0; i < 3; i++) {
            await nextFrame();
        }
        world.forceLive = false;
        this.sleepWorld();
        this.book.show('titul');
        $('#nacitanie').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' });
        this.state = 'cover';
        await nextFrame();
        await Promise.all([fade(0, 2600), this.book.approach()]);
        if (this.state === 'cover') {
            $('#vyzva').classList.add('viditelna');
        }
    }

    /** Otvorenie knihy (prvé kliknutie zároveň povolí zvuk v prehliadači). */
    async openBook() {
        if (this.state !== 'cover') {
            return;
        }
        this.state = 'opening';
        this.sounds.start();
        this.sounds.setMood('book', 3000);
        $('#vyzva').classList.remove('viditelna');
        await this.book.open();
        this.state = 'book';
    }

    /** Akcie tlačidiel v knihe (data-akcia). */
    act(action) {
        switch (action) {
            case 'zacat':
                this.startStory();
                break;
            case 'vstupit':
                this.enterGarden();
                break;
            case 'navod':
            case 'nastavenia':
            case 'o-knihe':
                this.book.whileBusy(() => this.book.turnTo(action));
                break;
            case 'obsah':
                this.toContents();
                break;
            case 'zavriet':
                this.closeBook();
                break;
            case 'pokracovat':
                this.resume();
                break;
            case 'ukazka':
                this.resume().then(() => this.world.walkToExit());
                break;
            case 'nove':
                this.abandonGame().then(() => this.startStory());
                break;
        }
    }

    /**
     * Doplní obsah dvojstrany: texty príbehu (data-text, data-odseky), údaje o ceste
     * (data-udaj) a stav nastavení. Odseky rozprávania majú slová na mieste, ale
     * neviditeľné – napíše ich book.write.
     */
    decorate(id, pages) {
        const all = selector => [...pages.left.querySelectorAll(selector), ...pages.right.querySelectorAll(selector)];
        for (const element of all('[data-text]')) {
            element.textContent = storyText(element.dataset.text);
        }
        const result = this.result ?? (this.played ? this.world.result() : null);
        for (const element of all('[data-odseky]')) {
            const source = element.dataset.odseky === 'epilogue'
                ? STORY.epilogue[result?.found === PAGE_COUNT ? 'complete' : 'partial']
                : storyText(element.dataset.odseky);
            element.replaceChildren(...source.map(text => {
                const paragraph = document.createElement('p');
                fillWords(paragraph, text);
                return paragraph;
            }));
        }
        if (result) {
            const values = {
                cas: formatTime(result.time),
                kroky: String(result.steps),
                najkratsia: stepsLabel(result.shortest),
                zvazky: `${result.found} z ${PAGE_COUNT}`
            };
            for (const element of all('[data-udaj]')) {
                element.textContent = values[element.dataset.udaj];
            }
        }
        for (const input of all('[data-nastavenie]')) {
            input.checked = this.settings[input.dataset.nastavenie];
        }
        for (const input of all('input[name="velkost"]')) {
            input.checked = input.value === this.settings.size;
        }
    }

    /** Zmena nastavenia v knihe; nastavenia sa uložia do úložiska prehliadača. */
    changeSetting(input) {
        if (input.dataset.nastavenie) {
            this.settings[input.dataset.nastavenie] = input.checked;
            this.sounds.setEnabled(input.dataset.nastavenie, input.checked);
        } else if (input.name === 'velkost') {
            this.settings.size = input.value;
        }
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
        } catch {
            // nastavenia sa jednoducho nezapamätajú
        }
    }

    /** Návrat na obsah knihy (zo záložky sa rozohraná cesta zahodí – po potvrdení). */
    toContents() {
        if (this.state === 'paused') {
            this.abandonGame();
        }
        this.book.whileBusy(() => this.book.turnTo('titul'));
    }

    // =========================================================================
    //  Spoločný let kamery knihy a kamery sveta
    // =========================================================================

    /**
     * Plán letu medzi pokojnou knihou (u = 0) a záberom sveta (u = 1). Kresba na strane
     * je snímka sveta pri pohľade na celý ostrov, preto kniha aj svet tvoria jednu „mapu“:
     * pri priebehu u sa všetko zväčší (z1 / z0)^u-krát (geometricky – rovnaký úsek letu
     * priblíži vždy rovnakým pomerom) a cieľový bod sa po obrazovke presúva rovnomerne
     * z miesta na kresbe do stredu obrazovky. Kamera knihy aj kamera sveta počítajú svoj
     * záber z toho istého u, takže kresba a svet sa v každom snímku presne kryjú.
     * @param {DOMRect} card - kresba na strane pri pokojnej kamere knihy (px CSS)
     * @param {{x, y}} point - bod sveta, ku ktorému sa letí (v cieli je v strede obrazovky)
     * @param {number} zoom - priblíženie sveta v cieli
     */
    planFlight(card, point, zoom) {
        const world = this.world;
        const ratio = world.scale.width / innerWidth;
        const cardZoom = world.islandZoom * card.width / innerWidth;   // priblíženie sveta, ktoré zodpovedá kresbe na strane
        const focus = {
            x: card.x + card.width / 2 + (point.x - world.island.centerX) * cardZoom / ratio,
            y: card.y + card.height / 2 + (point.y - world.island.centerY) * cardZoom / ratio
        };
        const range = Math.log(zoom / cardZoom);
        const at = u => {
            const scale = Math.exp(range * u);
            return {
                scale,
                zoom: cardZoom * scale,
                screen: { x: focus.x + (innerWidth / 2 - focus.x) * u, y: focus.y + (innerHeight / 2 - focus.y) * u }
            };
        };
        // od akého u kresba zakryje celú obrazovku (potom už knihu nevidno)
        const covers = u => {
            const { scale, screen } = at(u);
            const left = screen.x + (card.x - focus.x) * scale;
            const top = screen.y + (card.y - focus.y) * scale;
            return left <= 0 && top <= 0 && left + card.width * scale >= innerWidth && top + card.height * scale >= innerHeight;
        };
        let solid = 1;
        for (let i = 0; i <= 500; i++) {
            if (covers(i / 500)) {
                solid = i / 500;
                break;
            }
        }
        const clear = Math.max(0, solid - Math.log(1 / FLIGHT.crossfade) / range);
        return { point, focus, at, clear, solid };
    }

    /**
     * Let podľa plánu: do sveta (into = true, u: 0 -> 1) alebo zo sveta do knihy (u: 1 -> 0).
     * Kamera knihy letí ako animácia na grafickej karte (book.flyCamera), kamera sveta sa
     * nastavuje v hre tesne pred vykreslením každého snímku – obe z času snímku meraného
     * od začiatku tej istej animácie, takže sa kresba a svet kryjú. Kniha sa so svetom
     * prelína medzi plan.clear a plan.solid; svet beží, len keď ho môže byť vidno.
     * Po prebudení sa svet niekoľko snímok kreslí celý (forceLive), kým ho ešte zakrýva
     * kniha – prvé vykreslenie po dlhom spánku je pomalšie a nesmie sa trafiť do záberu.
     * @param {function} [onProgress] - (t) => … každý snímok, t je čas letu 0 až 1
     * @returns {Promise<void>}
     */
    async fly(plan, duration, into, onProgress) {
        const ease = t => (into ? glide(t) : 1 - glide(t));
        const frames = [];
        for (let i = 0; i <= FLIGHT.frames; i++) {
            const t = i / FLIGHT.frames;
            const u = ease(t);
            const view = plan.at(Math.min(u, plan.solid));   // keď kresba zakryje obrazovku, knihu už nevidno – ďalej sa nezväčšuje
            frames.push({ offset: t, x: view.screen.x, y: view.screen.y, scale: view.scale, opacity: 1 - smoothstep(plan.clear, plan.solid, u) });
        }
        this.book.desk.style.visibility = '';
        const flight = this.book.flyCamera(plan.focus, frames, duration);
        let begin = null;   // začiatok animácie na časovej osi dokumentu (známy od prvého snímku animácie)
        const progress = time => {
            begin ??= flight.startTime;
            const t = begin === null ? 0 : Phaser.Math.Clamp((time - begin) / duration, 0, 1);
            return { t, u: ease(t) };
        };
        const worldShot = time => {
            const { t, u } = progress(time);
            const view = plan.at(u);
            return { point: plan.point, screen: view.screen, zoom: view.zoom, done: t >= 1 };
        };
        const live = u => u > plan.clear - FLIGHT.wakeLead;
        if (this.awake) {
            this.world.followShot(worldShot);
        }
        let flying = true;
        let warming = 0;
        const tick = time => {
            if (!flying) {
                return;
            }
            const { t, u } = progress(time);
            if (live(u) && !this.awake) {
                this.wakeWorld();
                this.world.forceLive = true;
                warming = FLIGHT.warmFrames;
                this.world.followShot(worldShot);
            } else if (!live(u) && this.awake) {
                this.sleepWorld();
            } else if (warming > 0 && --warming === 0) {
                this.world.forceLive = false;
            }
            onProgress?.(t);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        await flight.finished;
        flying = false;
        this.world.forceLive = false;
        if (this.awake) {   // svet zostane presne v cieľovom zábere
            const view = plan.at(ease(1));
            this.world.followShot(null);
            this.world.lookAt(plan.point, view.screen, view.zoom);
        }
        onProgress?.(1);
    }

    // =========================================================================
    //  Prológ a vstup do kresby
    // =========================================================================

    /**
     * Nový príbeh: list sa otočí na prológ, kresba pripraveného sveta sa vpije do papiera
     * a rozprávanie sa napíše slovo po slove. Ak pripravený svet chýba alebo má inú
     * veľkosť bludiska, postaví sa nový (ešte pred otočením listu).
     */
    async startStory() {
        await this.book.whileBusy(async () => {
            await this.preparing;
            if (this.preparedSize !== this.settings.size || this.played) {
                await this.prepareWorld();
            }
            this.result = null;
            // tlačidlo „Vstúpiť do kresby“ a kresba sú skryté už na otáčanom liste;
            // kresba sa vpije do papiera po dopade listu, tlačidlo sa ukáže po dopísaní textu
            this.book.pages.prolog.right.querySelector('[data-akcia="vstupit"]').classList.add('caka');
            await this.book.loadIllustration('prolog', this.illustration);
            await this.book.turnTo('prolog');
            this.book.showIllustration('prolog', true);
        });
        const pages = this.book.pages.prolog;
        await this.book.write([...pages.left.querySelectorAll('.rozpravanie p')]);
        pages.right.querySelector('[data-akcia="vstupit"]').classList.remove('caka');
    }

    /**
     * Vstup do kresby – jeden nepretržitý filmový záber: kamera knihy sa približuje ku
     * kresbe na strane, kresba sa uprostred letu zmení na živý svet (kniha sa rozplynie)
     * a kamera bez zastavenia pokračuje až k bráne, kde čaká záhradník. Po rozhovore hráč
     * vojde do bludiska a kamera sa zároveň vznesie nad celé bludisko.
     */
    async enterGarden() {
        if (this.state !== 'book' || this.book.current !== 'prolog') {
            return;
        }
        this.state = 'transition';
        this.played = true;
        const world = this.world;
        await this.book.whileBusy(async () => {
            letterbox(true);
            this.sounds.setMood('garden', 4500);
            world.mode = 'cutscene';
            this.sky.setOutdoor(true);
            const plan = this.planFlight(this.book.cardRect(), world.twoShot(world.player, world.gardener), world.talkZoom);
            let title = null;
            await this.fly(plan, FLIGHT.into, true, t => {
                if (!title && t >= FLIGHT.titleAt) {
                    title = titleCard(STORY.titleCard.over, STORY.titleCard.main);
                    this.sounds.speak(`${STORY.titleCard.over}. ${STORY.titleCard.main}.`);
                }
            });
            this.book.desk.hidden = true;
            this.book.resetCamera();
            await title;
        });
        await world.dialogue(world.gardener, STORY.gardener, STORY.gardener.lines);
        // hráč vojde oblúkom do bludiska, kamera sa pritom vznesie nad celé bludisko
        // a filmové pásy odídu – jeden plynulý pohyb
        letterbox(false);
        await Promise.all([world.walkThrough(world.places.entryWalk), world.framePlay(2400)]);
        this.hud.reset(STORY.objective.search);
        this.hud.show(true);
        world.startPlay();
        this.state = 'garden';
    }

    // =========================================================================
    //  Počas hry
    // =========================================================================

    /**
     * Nájdený zväzok kresieb: priletí na lístok a potom sa ukáže spomienka z neho.
     * Pri druhom zväzku sa spustí dážď (spomienka na tanec v daždi).
     */
    onPageFound({ index, x, y }) {
        const all = this.world.found === PAGE_COUNT;
        this.subtitles = this.subtitles.then(async () => {
            await this.hud.collect(index, x, y);
            if (index === 1) {
                this.sky.setWeather('rain');
            }
            if (all) {
                this.hud.setObjective(STORY.objective.gate);
            }
            // spomienky sa ukazujú len počas hry – keď sa začne záverečná scéna, už nie
            const playing = () => this.state === 'garden' || this.state === 'paused';
            // spomienku číta babkin hlas, poslednú vetu rozprávač (nie nad knihou so záložkou)
            const read = text => (this.state === 'garden' ? this.sounds.speak(text)?.duration : 0);
            if (playing()) {
                await subtitle(STORY.pages[index], STORY.pageSource, read(STORY.pages[index]));
            }
            if (all && playing()) {
                await subtitle(STORY.allPages, '', read(STORY.allPages));
            }
        });
    }

    /**
     * Záverečná scéna: hráč vyjde bránou k babke, od radosti poskočí a porozprávajú sa.
     * Kamera ukáže celé bludisko a pero červeným atramentom nakreslí prejdenú cestu;
     * na jej konci vyletia motýle a vtáky a prefúkne vietor. Potom jeden nepretržitý záber
     * späť: kamera sa vzdiali nad celý ostrov a ďalej až ku knihe na stole – svet sa vráti
     * do kresby na strane (s rovnakou červenou cestou), kde ceruzka napíše epilóg.
     */
    async finale() {
        this.state = 'transition';
        this.hud.show(false);
        hideSubtitles();
        this.sounds.hush();   // spomienka či myšlienka nedohovorí cez rozhovor s babkou
        const world = this.world;
        world.clearStage();
        this.sky.setWeather('sun');
        // hráč prejde bránou k babke a kamera ich zároveň vezme do záberu
        letterbox(true);
        await Promise.all([world.walkThrough(world.places.exitWalk), world.frameMeeting(2000)]);

        // kamera stojí – neviditeľne pod svetom sa pripraví epilóg: obraz ostrova z výšky
        // (už s postavou pri babke) a kresba s dnešnou cestou na poslednú stranu knihy
        this.result = world.result();
        world.drawFarView();
        await nextFrame();
        const image = await world.drawIllustration(true);
        const pages = this.book.show('epilog');
        await this.book.setIllustration(image, false);
        const desk = this.book.desk;
        desk.classList.remove('nad-svetom');
        desk.style.visibility = 'hidden';
        desk.hidden = false;

        await world.greet();
        const lines = world.found === PAGE_COUNT ? STORY.grandma.complete : STORY.grandma.partial;
        await world.dialogue(world.grandma, STORY.grandma, lines);
        await world.framePlay(2200, FILM_FRAME);
        await world.celebrate();

        const camera = world.cameras.main;
        const plan = this.planFlight(this.book.cardRect(),
            { x: camera.scrollX + camera.width / 2, y: camera.scrollY + camera.height / 2 }, camera.zoom);
        this.sounds.setMood('book', 5000);
        this.sky.setOutdoor(false);
        this.state = 'book';
        await this.book.whileBusy(() => this.fly(plan, FLIGHT.out, false, () => {
            if (!this.awake && world.mode !== 'done') {   // svet zaspal pod knihou – film skončil
                world.mode = 'done';
                letterbox(false);
            }
        }));
        this.book.resetCamera();
        await this.book.write([...pages.left.querySelectorAll('.rozpravanie p')]);
        // ďalší svet sa postaví, kým hráč číta – nový príbeh potom začne bez čakania
        await wait(1200);
        if (this.state === 'book' && !this.book.busy) {
            this.prepareWorld();
        }
    }

    // =========================================================================
    //  Záložka (pauza)
    // =========================================================================

    /**
     * Záložka: čas v záhrade sa zastaví – hra zaspí a posledný záber zošedne ako
     * zastavený film – a zdola sa vysunie kniha otvorená na dvojstrane so záložkou.
     */
    async pause() {
        if (this.state !== 'garden' || this.world.mode !== 'play') {
            return;
        }
        this.state = 'paused';
        this.game.loop.sleep();
        this.sounds.hush();   // nápoveda sa kreslí ďalej až po návrate, už potichu; myšlienka stíchne
        $('#svet').classList.add('zastaveny');
        $('#kino').classList.add('pauza');
        this.hud.show(false);
        this.sounds.setMood('pause', 900);
        this.sounds.effect('page', 0.4);
        this.book.show('zalozka');
        this.book.desk.classList.add('nad-svetom');
        // kniha sa najprv rozloží mimo obrazovky (prvé vykreslenie skrytej knihy trvá dlhšie)
        // a až potom sa vysunie – posun potom beží plynule
        this.book.camera.style.transform = 'translateY(105vh)';
        this.book.desk.hidden = false;
        await nextFrame();
        await nextFrame();
        this.book.camera.style.transform = '';
        if (this.state !== 'paused') {
            return;   // hráč sa medzitým vrátil do hry
        }
        // návrat do hry počas vysúvania knihy túto animáciu zruší – nie je to chyba
        await this.book.camera.animate([
            { transform: 'translateY(105vh) rotate(5deg)' },
            { transform: 'none' }
        ], { duration: 900, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }).finished.catch(() => {});
    }

    /** Kniha sa zasunie späť a čas v záhrade sa znova rozbehne. */
    async resume() {
        if (this.state !== 'paused') {
            return;
        }
        this.state = 'resuming';
        // farby sa do zastaveného záberu vracajú, kým sa kniha zasúva (svet ešte spí);
        // ak sa kniha ešte vysúvala, zasúva sa odtiaľ, kde práve je
        $('#svet').classList.remove('zastaveny');
        const camera = this.book.camera;
        const from = getComputedStyle(camera).transform;
        camera.getAnimations().forEach(animation => animation.cancel());
        await camera.animate([{ transform: from }, { transform: 'translateY(105vh) rotate(-4deg)' }],
            { duration: 650, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)', fill: 'forwards' }).finished;
        this.book.desk.hidden = true;
        this.book.desk.classList.remove('nad-svetom');
        this.book.resetCamera();
        $('#kino').classList.remove('pauza');
        this.game.loop.wake();
        this.game.loop.resetDelta();
        this.world.input.keyboard.resetKeys();
        this.sounds.setMood('garden', 900);
        this.hud.show(true);
        this.state = 'garden';
    }

    /**
     * Rozohraná cesta sa zahodí: pod knihu sa plynulo vráti stôl (zastavený svet za ním
     * ešte chvíľu presvitá), potom svet zaspí.
     * @returns {Promise<void>}
     */
    async abandonGame() {
        hideSubtitles();
        this.world.mode = 'done';
        this.played = true;
        this.result = null;
        this.state = 'book';
        this.book.desk.classList.remove('nad-svetom');
        this.sky.setOutdoor(false);
        this.sounds.setMood('book', 1200);
        await wait(ABANDON_TIME);
        this.sleepWorld();
    }

    // =========================================================================
    //  Zatvorenie knihy (ukončenie aplikácie)
    // =========================================================================

    /** Kniha sa zatvorí, svetlo zhasne a aplikácia sa ukončí. */
    async closeBook() {
        if (this.state !== 'book') {
            return;
        }
        this.state = 'closed';
        await this.book.whileBusy(() => this.book.close());
        this.sounds.setMood('silent', 2200);
        await fade(1, 2200);
        this.sounds.stop();
        this.game.destroy(true);
        $('#koniec').hidden = false;
        $('#koniec').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1200 });
    }

    // =========================================================================
    //  Klávesnica
    // =========================================================================

    /** Esc: záložka v hre / návrat do hry; Enter a medzerník otvoria knihu; F: celá obrazovka. */
    handleKey(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (this.state === 'garden') {
                this.pause();
            } else if (this.state === 'paused') {
                this.resume();
            }
        } else if ((event.key === 'Enter' || event.key === ' ') && this.state === 'cover') {
            event.preventDefault();
            this.openBook();
        } else if (event.key.toLowerCase() === 'f' && !event.repeat && !event.target.closest('input')) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.documentElement.requestFullscreen().catch(() => {});
            }
        }
    }
}
