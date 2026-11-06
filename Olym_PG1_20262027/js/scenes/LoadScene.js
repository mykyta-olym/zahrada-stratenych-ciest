/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Trieda:  LoadScene – načítanie textúr a zvukov
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Verzia:  2.0 (október 2026)
 *
 *  Priebeh a chyby načítania oznamuje udalosťami hry ('load-progress',
 *  'load-error'); po načítaní spustí oblohu a svet.
 * =============================================================================
 */
import { AUDIO, PAPER } from '../config.js';

/** Zvukové súbory a ich prípony (časť nahrávok je vo formáte MP3, ostatné Ogg). */
const AUDIO_FILES = { piano: 'mp3', stream: 'mp3' };

export class LoadScene extends Phaser.Scene {
    constructor() {
        super('Load');
    }

    /** Zaradí všetky súbory do frontu načítania. */
    preload() {
        this.failedFiles = [];
        this.load.on('progress', value => this.game.events.emit('load-progress', value));
        this.load.on('loaderror', file => this.failedFiles.push(file.src));

        this.load.atlas('mesto', 'texture/mesto.png', 'texture/mesto.json');
        this.load.image('bublina', 'texture/ui/bublina.png');
        this.load.image('kvapka', 'texture/ui/kvapka.png');
        this.load.image('stopa', 'texture/ui/stopa.png');
        this.load.image('vlna', 'texture/ui/vlna.png');
        this.load.image('kruzok', 'texture/ui/kruzok.png');
        this.load.image(PAPER.key, 'texture/kniha/papier.jpg');
        this.load.spritesheet('vtak', 'texture/ui/vtak.png', { frameWidth: 129, frameHeight: 99 });

        const sounds = [
            ...Object.values(AUDIO.music), ...Object.values(AUDIO.ambience), ...AUDIO.steps, ...Object.values(AUDIO.effects)
        ];
        for (const name of sounds) {
            this.load.audio(name, `audio/${name}.${AUDIO_FILES[name] ?? 'ogg'}`);
        }
        // hlasy rozprávača a postáv: zoznam viet a potom ich nahrávky
        this.load.json('hlasy', 'audio/hlas/hlasy.json');
        this.load.once('filecomplete-json-hlasy', (key, type, voices) => {
            for (const { file } of Object.values(voices)) {
                this.load.audio(`hlas-${file}`, `audio/hlas/${file}.ogg`);
            }
        });
    }

    /** Po načítaní spustí oblohu a svet, alebo oznámi chýbajúce súbory. */
    create() {
        if (this.failedFiles.length > 0) {
            this.game.events.emit('load-error', this.failedFiles);
            return;
        }
        this.scene.launch('Sky');
        this.scene.start('World');
    }
}
