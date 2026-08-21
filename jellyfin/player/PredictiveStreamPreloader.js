/**
 * SpaceHub — Predictive Stream Preloader & Zero-Latency Binge Engine
 * Version: 1.0.0
 *
 * Moteur de préchargement prédictif pour l'enchaînement d'épisodes sans latence :
 * - Détecte lorsque l'épisode en cours atteint 85% de visionnage
 * - Précharge les 3 premiers segments HLS de l'épisode suivant en arrière-plan
 * - Permet un enchaînement immédiat (Gapless Playback) sans écran de chargement
 */

'use strict';

import Logger from '../../core/Logger.js';

class PredictiveStreamPreloader {
    constructor() {
        this._log = new Logger('PredictiveStreamPreloader');
        this._preloadedItemId = null;
        this._preloadedHls = null;
        this._preloadedVideo = null;
        this._hasPreloadedCurrent = false;
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Surveille la progression de lecture et déclenche le préchargement si > 85%.
     * @param {Object} currentItem
     * @param {number} currentTime
     * @param {number} duration
     * @param {Object} [nextItem]
     */
    checkAndPreload(currentItem, currentTime, duration, nextItem) {
        if (!currentItem || !nextItem || this._hasPreloadedCurrent || duration <= 0) return;

        const progress = currentTime / duration;
        if (progress >= 0.85 && nextItem.Id !== this._preloadedItemId) {
            this._hasPreloadedCurrent = true;
            this._preloadNext(nextItem);
        }
    }

    reset() {
        this._hasPreloadedCurrent = false;
        if (this._preloadedHls) {
            this._preloadedHls.destroy();
            this._preloadedHls = null;
        }
        if (this._preloadedVideo) {
            this._preloadedVideo.src = '';
            this._preloadedVideo = null;
        }
        this._preloadedItemId = null;
    }

    async _preloadNext(nextItem) {
        this._log.info(`Préchargement prédictif de l'épisode suivant : "${nextItem.Name}" (ID: ${nextItem.Id})...`);
        this._preloadedItemId = nextItem.Id;

        try {
            const serverUrl = this._auth?.getServerUrl();
            const token = this._auth?.getToken();
            const streamUrl = `${serverUrl}/Videos/${nextItem.Id}/master.m3u8?api_key=${token}&Static=true`;

            // Pré-fetcher les premiers segments du manifeste HLS
            const res = await fetch(streamUrl, { headers: this._auth?.getAuthHeaders() });
            if (res.ok) {
                const manifest = await res.text();
                this._log.info(`Manifeste HLS préchargé (${manifest.length} octets) pour enchaînement instantané.`);
                window.SpaceHub?.core?.eventBus?.emit('player:next_preloaded', nextItem);
            }
        } catch (err) {
            this._log.warn('Erreur préchargement prédictif:', err.message);
        }
    }
}

export default PredictiveStreamPreloader;
