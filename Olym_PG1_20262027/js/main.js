/*
 * =============================================================================
 *  Záhrada stratených ciest – izometrické bludisko v knihe
 *  Modul:   main.js – vstupný bod aplikácie (konfigurácia Phaser a spustenie)
 *  Autor:   Mykyta Olym, KPI FEI TU v Košiciach
 *  Predmet: Počítačová grafika, 2026/2027
 *  Verzia:  2.0 (október 2026)
 * =============================================================================
 */
import { LoadScene } from './scenes/LoadScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { SkyScene } from './scenes/SkyScene.js';
import { SoundDirector } from './sound.js';
import { Director } from './director.js';

/**
 * Veľkosť plátna v skutočných pixeloch displeja. Pri zväčšení vo Windows
 * (napr. 125 %) má plátno viac pixelov, než ukazuje CSS, a kresba zostane ostrá.
 */
function screenSize() {
    const ratio = window.devicePixelRatio || 1;
    return { width: Math.round(window.innerWidth * ratio), height: Math.round(window.innerHeight * ratio) };
}

/** Zistí, či prehliadač podporuje WebGL (Phaser 4 kreslí cez WebGL). */
function hasWebGL() {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
}

if (!hasWebGL()) {
    document.getElementById('nacitanie').hidden = true;
    const error = document.getElementById('chyba');
    error.textContent = 'Prehliadač nepodporuje WebGL. Použite aktuálny Chrome, Edge alebo Firefox so zapnutou hardvérovou akceleráciou.';
    error.hidden = false;
} else if (location.protocol !== 'file:') {
    const game = new Phaser.Game({
        type: Phaser.WEBGL,
        title: 'Záhrada stratených ciest',
        version: '2.0',
        parent: 'svet',
        transparent: true,          // pod plátnom je papier stránky (css/hra.css)
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, ...screenSize() },
        render: { antialias: true, mipmapFilter: 'LINEAR_MIPMAP_LINEAR', powerPreference: 'high-performance' },
        scene: [LoadScene, WorldScene, SkyScene]   // poradie = poradie kreslenia (obloha navrchu)
    });
    const sounds = new SoundDirector(game);
    game.registry.set('sounds', sounds);
    new Director(game, sounds);
    window.addEventListener('resize', () => {
        const size = screenSize();
        game.scale.setGameSize(size.width, size.height);
    });
}
