/**
 * SpaceHub — Cinema Mode Automation Service
 * Version: 1.0.0
 *
 * Automatise l'éclairage et les scènes Home Assistant lors de la lecture vidéo :
 * - Lecture (Play) : Tamise les lumières à 10% ou active la scène "Cinéma"
 * - Pause : Remonte la luminosité à 40% (Mode Entracte)
 * - Fin/Fermeture (Stop) : Rétablit l'éclairage normal (100%) ou active la scène de sortie
 */

'use strict';

import Logger from '../Logger.js';

class CinemaModeService {
    constructor() {
        this._log = new Logger('CinemaModeService');
        this._enabled = true;
        this._haService = null;
        this._ambilight = null;

        this._playScene = 'scene.cinema';
        this._pauseScene = 'scene.entracte';
        this._stopScene = 'scene.salon_normal';
        this._autoAmbilight = true;

        this._initListeners();
    }

    /**
     * Attache les services requis.
     * @param {HomeAssistantService} haService
     * @param {AmbilightEngine} ambilightEngine
     */
    attach(haService, ambilightEngine) {
        this._haService = haService;
        this._ambilight = ambilightEngine;
    }

    _initListeners() {
        const bus = window.SpaceHub?.core?.eventBus;
        if (!bus) return;

        bus.on('player:played', (item) => this._onMediaStart(item));
        bus.on('player:play', () => this._onPlay());
        bus.on('player:paused', () => this._onPause());
        bus.on('player:closed', () => this._onStop());
    }

    async _onMediaStart(item) {
        if (!this._enabled || !this._haService?.isConfigured) return;
        this._log.info(`Lancement média "${item.Name}" : activation du Mode Cinéma...`);

        if (this._playScene) {
            await this._haService.activateScene(this._playScene);
        }

        if (this._autoAmbilight && this._ambilight) {
            const video = document.querySelector('.sh-player-video, video');
            if (video) this._ambilight.start(video);
        }

        window.SpaceHub?.ui?.components?.toaster?.info('🎬 Mode Cinéma activé (Lumières tamisées)');
    }

    async _onPlay() {
        if (!this._enabled || !this._haService?.isConfigured) return;
        if (this._playScene) {
            await this._haService.activateScene(this._playScene);
        }
    }

    async _onPause() {
        if (!this._enabled || !this._haService?.isConfigured) return;
        this._log.info('Pause détectée : activation du Mode Entracte...');

        if (this._pauseScene) {
            await this._haService.activateScene(this._pauseScene);
        }
    }

    async _onStop() {
        if (!this._enabled || !this._haService?.isConfigured) return;
        this._log.info('Arrêt de la lecture : rétablissement de l\'éclairage...');

        if (this._ambilight) {
            this._ambilight.stop();
        }

        if (this._stopScene) {
            await this._haService.activateScene(this._stopScene);
        }
    }

    setEnabled(val) {
        this._enabled = !!val;
    }

    configureScenes({ playScene, pauseScene, stopScene, autoAmbilight }) {
        if (playScene !== undefined) this._playScene = playScene;
        if (pauseScene !== undefined) this._pauseScene = pauseScene;
        if (stopScene !== undefined) this._stopScene = stopScene;
        if (autoAmbilight !== undefined) this._autoAmbilight = autoAmbilight;
    }
}

export default CinemaModeService;
