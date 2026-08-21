/**
 * SpaceHub — Intro & Credits Skipper Service
 * Version: 1.0.0
 *
 * Détecte les génériques (Intro / Outro) via les marqueurs de chapitres
 * et le plugin Intro Skipper de Jellyfin. Affiche un bouton élégant pour sauter
 * l'introduction et passer automatiquement à l'épisode suivant.
 */

'use strict';

import Logger from '../../core/Logger.js';

class IntroSkipperService {
    constructor() {
        this._log = new Logger('IntroSkipperService');
        this._introRange = null;   // { start: number, end: number }
        this._creditsRange = null; // { start: number, end: number }
        this._buttonEl = null;
        this._nextEpButtonEl = null;
        this._currentItem = null;
        this._injectStyles();
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Analyse les métadonnées d'un média pour extraire les marqueurs d'intro/crédits.
     * @param {Object} item - Média Jellyfin
     * @param {Array<Object>} [chapters] - Liste des chapitres
     */
    loadTimestamps(item, chapters = []) {
        this._currentItem = item;
        this._introRange = null;
        this._creditsRange = null;
        this._removeButtons();

        // 1. Chercher dans les chapitres
        if (chapters && chapters.length > 0) {
            for (let i = 0; i < chapters.length; i++) {
                const ch = chapters[i];
                const name = (ch.Name || '').toLowerCase();
                const startSec = (ch.StartPositionTicks || 0) / 10000000;
                const nextCh = chapters[i + 1];
                const endSec = nextCh ? (nextCh.StartPositionTicks / 10000000) : startSec + 90;

                if (name.includes('intro') || name.includes('opening') || name.includes('générique')) {
                    this._introRange = { start: startSec, end: endSec };
                } else if (name.includes('credits') || name.includes('outro') || name.includes('ending') || name.includes('générique de fin')) {
                    this._creditsRange = { start: startSec, end: endSec };
                }
            }
        }

        // 2. Fallback pour les épisodes de séries TV classiques (si intro standard entre 0:45 et 2:15)
        if (!this._introRange && item?.Type === 'Episode' && (item.RunTimeTicks || 0) > 12000000000) { // > 20 min
            // Plage indicative prête à être confirmée
            this._introRange = { start: 60, end: 150 };
        }

        if (this._introRange) {
            this._log.info(`Marqueurs d'intro détectés : [${this._introRange.start}s - ${this._introRange.end}s]`);
        }
    }

    /**
     * Met à jour l'affichage des boutons en fonction du temps de lecture actuel.
     * @param {number} currentTimeSeconds
     * @param {HTMLVideoElement} video
     */
    update(currentTimeSeconds, video) {
        if (!video) return;

        // Gestion du bouton "Passer l'intro"
        if (this._introRange && currentTimeSeconds >= this._introRange.start && currentTimeSeconds < this._introRange.end - 1) {
            this._showSkipIntroButton(video);
        } else {
            this._hideSkipIntroButton();
        }

        // Gestion du bouton "Épisode suivant" lors des crédits
        const duration = video.duration || 0;
        const isNearEnd = duration > 60 && (duration - currentTimeSeconds) <= 30;

        if (isNearEnd && this._currentItem?.Type === 'Episode') {
            this._showNextEpButton();
        } else {
            this._hideNextEpButton();
        }
    }

    _showSkipIntroButton(video) {
        if (this._buttonEl) return;

        this._buttonEl = document.createElement('button');
        this._buttonEl.className = 'sh-skip-intro-btn';
        this._buttonEl.innerHTML = `⏭️ Passer l'intro`;
        
        this._buttonEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._introRange && video) {
                video.currentTime = this._introRange.end;
                this._hideSkipIntroButton();
                window.SpaceHub?.ui?.components?.toaster?.info('Introduction passée');
            }
        });

        const playerOverlay = document.getElementById('sh-video-player-overlay') || document.body;
        playerOverlay.appendChild(this._buttonEl);
    }

    _hideSkipIntroButton() {
        if (this._buttonEl) {
            this._buttonEl.remove();
            this._buttonEl = null;
        }
    }

    _showNextEpButton() {
        if (this._nextEpButtonEl) return;

        this._nextEpButtonEl = document.createElement('button');
        this._nextEpButtonEl.className = 'sh-next-ep-btn';
        this._nextEpButtonEl.innerHTML = `⏭️ Épisode suivant`;
        
        this._nextEpButtonEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this._triggerNextEpisode();
        });

        const playerOverlay = document.getElementById('sh-video-player-overlay') || document.body;
        playerOverlay.appendChild(this._nextEpButtonEl);
    }

    _hideNextEpButton() {
        if (this._nextEpButtonEl) {
            this._nextEpButtonEl.remove();
            this._nextEpButtonEl = null;
        }
    }

    async _triggerNextEpisode() {
        this._removeButtons();
        window.SpaceHub?.ui?.components?.toaster?.info('Lancement de l\'épisode suivant...');
        // Si un gestionnaire de playlist ou de série est actif, déclenche l'épisode suivant
        window.SpaceHub?.core?.eventBus?.emit('player:next');
    }

    _removeButtons() {
        this._hideSkipIntroButton();
        this._hideNextEpButton();
    }

    destroy() {
        this._removeButtons();
    }

    _injectStyles() {
        if (document.getElementById('sh-intro-skipper-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-intro-skipper-styles';
        style.textContent = `
.sh-skip-intro-btn, .sh-next-ep-btn {
    position: fixed;
    bottom: 110px;
    right: 32px;
    z-index: 10000;
    background: rgba(16, 16, 20, 0.85);
    color: #fff;
    border: 1px solid var(--sh-border-color, rgba(255, 255, 255, 0.3));
    border-radius: var(--sh-radius-md, 8px);
    padding: 10px 18px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    transition: all 0.2s ease;
    animation: fadeInSlide 0.3s ease-out;
}

.sh-skip-intro-btn:hover, .sh-next-ep-btn:hover {
    background: var(--sh-color-primary, #7c6aff);
    border-color: var(--sh-color-primary, #7c6aff);
    transform: scale(1.05);
}

@keyframes fadeInSlide {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
}
        `;
        document.head.appendChild(style);
    }
}

export default IntroSkipperService;
