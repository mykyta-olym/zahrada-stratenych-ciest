/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Trieda:  SkyScene – počasie nad celou obrazovkou (dážď, vietor)
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Samostatná scéna nad scénou sveta: má vlastnú kameru, preto kvapky a semienka
 *  nemenia veľkosť, keď sa kamera sveta priblíži alebo posunie.
 *  Počasie riadi príbeh (režisér volá setWeather): za slnka vietor občas prenesie
 *  semienko púpavy, v daždi padajú kvapky a svet sa zatiahne. Zmenu oznamuje
 *  udalosťou hry 'weather' (svet podľa nej mení mláky a motýle; zvuky dážď a vtáky).
 *  Kvapka: Cosmo Myzrail Gorynych (CC BY 4.0).
 * =============================================================================
 */
import { RAIN, WEATHER, TILES } from '../config.js';

const GLOOM = { color: 0x5e6a72, alpha: 0.16 };   // v daždi sa svet mierne zatiahne (šedomodrý závoj)
const GUST_SEEDS = 22;                              // semienka v poryve vetra pri oslave

export class SkyScene extends Phaser.Scene {
    constructor() {
        super('Sky');
    }

    /** Pripraví dážď, závoj dažďa a semienka; začína sa za slnka. */
    create() {
        this.weather = 'sun';
        this.gloom = this.add.rectangle(0, 0, 1, 1, GLOOM.color).setOrigin(0).setAlpha(0);
        this.createRain();
        this.createSeeds();
        this.scale.on('resize', this.fitToScreen, this);
        this.fitToScreen();
        this.applyWeather(0);
    }

    /**
     * Kvapky dažďa: vznikajú v páse nad obrazovkou a každá „dopadne“ v inej výške.
     * Kresba kvapky sa s papierom násobí (atrament na papieri).
     */
    createRain() {
        this.cloudBand = new Phaser.Geom.Rectangle(0, -RAIN.dropSize, 0, RAIN.dropSize);
        this.drops = this.add.particles(0, 0, 'kvapka', {
            emitZone: { type: 'random', source: this.cloudBand },
            angle: RAIN.angle,
            speed: { min: RAIN.speed * 0.85, max: RAIN.speed * 1.15 },
            lifespan: { onEmit: () => this.scale.height / RAIN.speed * 1000 * Phaser.Math.FloatBetween(0.35, 1.05) },
            scale: { min: 0.35, max: 0.6 },
            alpha: { start: RAIN.alpha, end: RAIN.alpha * 0.4 },
            frequency: RAIN.frequency,
            emitting: false,
            blendMode: Phaser.BlendModes.MULTIPLY
        });
    }

    /** Vietor: občas preletí cez obrazovku semienko púpavy, otáča sa a jemne klesá. */
    createSeeds() {
        this.seeds = this.add.particles(0, 0, 'mesto', {
            frame: TILES.seed,
            x: { min: -40, max: -10 },
            y: { onEmit: () => Phaser.Math.Between(0, this.scale.height * 0.8) },
            speedX: { min: 50, max: 110 },
            speedY: { min: -12, max: 20 },
            rotate: { start: 0, end: 360 },
            scale: { min: 0.22, max: 0.38 },
            alpha: { start: 0.7, end: 0.45 },
            lifespan: { onEmit: () => this.scale.width / 50 * 1000 },
            frequency: 2600,
            emitting: false,
            blendMode: Phaser.BlendModes.MULTIPLY
        });
        // poryv pri oslave: hŕstka semienok rýchlo preletí cez celú obrazovku
        this.gusts = this.add.particles(0, 0, 'mesto', {
            frame: TILES.seed,
            x: { min: -120, max: -10 },
            y: { onEmit: () => Phaser.Math.Between(this.scale.height * 0.1, this.scale.height * 0.9) },
            speedX: { min: 380, max: 620 },
            speedY: { min: -90, max: 30 },
            rotate: { start: 0, end: 540 },
            scale: { min: 0.25, max: 0.45 },
            alpha: { start: 0.8, end: 0.5 },
            lifespan: { onEmit: () => this.scale.width / 380 * 1000 },
            emitting: false,
            blendMode: Phaser.BlendModes.MULTIPLY
        });
    }

    /** Poryv vetra so semienkami púpavy (pri oslave cieľa). */
    gust() {
        this.gusts.explode(GUST_SEEDS);
    }

    /** Závoj, pás vzniku kvapiek a ich hustota podľa veľkosti obrazovky. */
    fitToScreen() {
        const { width, height } = this.scale;
        this.gloom.setSize(width, height);
        this.cloudBand.setTo(-0.05 * width, -RAIN.dropSize, 1.45 * width, RAIN.dropSize);
        this.drops.setQuantity(Math.max(1, Math.round(width / RAIN.pixelsPerDrop)));
    }

    /**
     * Zmení počasie s plynulým prechodom. Dážď po čase sám prestane (WEATHER.rain).
     * @param {'sun'|'rain'} weather - nové počasie
     */
    setWeather(weather) {
        this.changeTimer?.remove();
        if (weather !== this.weather) {
            this.weather = weather;
            this.applyWeather(WEATHER.change);
        }
        if (weather === 'rain') {
            this.changeTimer = this.time.delayedCall(WEATHER.rain, () => this.setWeather('sun'));
        }
    }

    /** Spustí alebo zastaví prvky počasia a oznámi zmenu ostatným častiam hry. */
    applyWeather(duration) {
        const rainy = this.weather === 'rain';
        if (rainy) {
            this.drops.start();
            this.seeds.stop();
        } else {
            this.drops.stop();
            if (this.outdoor) {
                this.seeds.start();
            }
        }
        this.tweens.add({ targets: this.gloom, alpha: rainy ? GLOOM.alpha : 0, duration });
        this.game.events.emit('weather', this.weather, duration);
    }

    /** Semienka vo vetre lietajú iba v záhrade (nie nad knihou na stole). */
    setOutdoor(outdoor) {
        this.outdoor = outdoor;
        if (outdoor && this.weather === 'sun') {
            this.seeds.start();
        } else {
            this.seeds.stop();
        }
    }
}
