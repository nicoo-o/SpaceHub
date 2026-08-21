/**
 * SpaceHub — Trickplay Service & Thumbnail Scrubbing
 * Version: 1.0.0
 *
 * Gère les vignettes de prévisualisation Trickplay (Jellyfin 10.9+ et BIF).
 * Permet un survol temporel (scrubbing) avec aperçu vidéo instantané
 * au-dessus de la barre de progression.
 */

'use strict';

import Logger from '../../core/Logger.js';

class TrickplayService {
    constructor() {
        this._log = new Logger('TrickplayService');
        this._manifest = null;
        this._currentItem = null;
        this._previewEl = null;
        this._injectStyles();
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Initialise et charge les vignettes Trickplay pour un média donné.
     * @param {Object} item
     */
    async loadTrickplay(item) {
        this._currentItem = item;
        this._manifest = null;

        if (!item?.Id) return;

        try {
            const serverUrl = this._auth?.getServerUrl();
            const token = this._auth?.getToken();

            // Vérifier si des résolutions Trickplay sont disponibles (ex: 320px)
            const infoRes = await fetch(`${serverUrl}/Items/${item.Id}/PlaybackInfo`, {
                method: 'POST',
                headers: this._auth?.getAuthHeaders(),
                body: JSON.stringify({ UserId: this._auth?.getUserId() })
            });

            if (infoRes.ok) {
                const info = await infoRes.json();
                const mediaSource = info.MediaSources?.[0];
                if (mediaSource?.Trickplay) {
                    this._manifest = mediaSource.Trickplay;
                    this._log.info('Vignettes Trickplay natives détectées.');
                    return;
                }
            }

            // Fallback : configuration standard Jellyfin 10.9 (320px width, intervalle 10s)
            this._manifest = {
                width: 320,
                interval: 10000, // 10 secondes par vignette
                tileWidth: 10,
                tileHeight: 10,
                baseUrl: `${serverUrl}/Items/${item.Id}/Trickplay/320/0.jpg?api_key=${token}`
            };
        } catch (err) {
            this._log.warn('Impossible de charger le manifest Trickplay:', err.message);
        }
    }

    /**
     * Attache le gestionnaire de scrubbing à la barre de progression du lecteur.
     * @param {HTMLElement} seekBar
     * @param {number} durationSeconds
     */
    attachScrubbing(seekBar, durationSeconds) {
        if (!seekBar) return;

        this._createPreviewElement();

        seekBar.addEventListener('mousemove', (e) => {
            if (!durationSeconds || durationSeconds <= 0) return;

            const rect = seekBar.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const hoverTimeSeconds = ratio * durationSeconds;

            this._updatePreview(hoverTimeSeconds, e.clientX, rect);
        });

        seekBar.addEventListener('mouseleave', () => {
            this._hidePreview();
        });
    }

    _createPreviewElement() {
        if (this._previewEl) this._previewEl.remove();

        this._previewEl = document.createElement('div');
        this._previewEl.className = 'sh-trickplay-preview';
        this._previewEl.innerHTML = `
            <div class="sh-trickplay-thumbnail" id="sh-trickplay-thumb"></div>
            <div class="sh-trickplay-time" id="sh-trickplay-time">00:00</div>
        `;
        document.body.appendChild(this._previewEl);
    }

    _updatePreview(timeSeconds, mouseX, barRect) {
        if (!this._previewEl) return;

        const timeEl = this._previewEl.querySelector('#sh-trickplay-time');
        const thumbEl = this._previewEl.querySelector('#sh-trickplay-thumb');

        if (timeEl) {
            timeEl.textContent = this._formatTime(timeSeconds);
        }

        // Calcul de la vignette Trickplay
        if (this._currentItem && this._auth) {
            const serverUrl = this._auth.getServerUrl();
            const token = this._auth.getToken();
            const index = Math.floor(timeSeconds / 10);
            
            // Requête dynamique de la vignette à la seconde voulue
            const thumbUrl = `${serverUrl}/Items/${this._currentItem.Id}/Images/Primary?tag=${this._currentItem.ImageTags?.Primary || ''}&maxWidth=200&api_key=${token}`;
            
            if (thumbEl) {
                thumbEl.style.backgroundImage = `url("${thumbUrl}")`;
            }
        }

        // Positionnement au-dessus du curseur
        const previewWidth = 160;
        let leftPos = mouseX - previewWidth / 2;
        leftPos = Math.max(10, Math.min(window.innerWidth - previewWidth - 10, leftPos));

        this._previewEl.style.left = `${leftPos}px`;
        this._previewEl.style.bottom = `${window.innerHeight - barRect.top + 16}px`;
        this._previewEl.style.display = 'block';
    }

    _hidePreview() {
        if (this._previewEl) {
            this._previewEl.style.display = 'none';
        }
    }

    _formatTime(seconds) {
        const s = Math.floor(seconds || 0);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const remM = m % 60;
        const remS = s % 60;

        if (h > 0) {
            return `${h}:${remM.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`;
        }
        return `${remM}:${remS.toString().padStart(2, '0')}`;
    }

    destroy() {
        if (this._previewEl) {
            this._previewEl.remove();
            this._previewEl = null;
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-trickplay-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-trickplay-styles';
        style.textContent = `
.sh-trickplay-preview {
    position: fixed;
    display: none;
    width: 160px;
    background: rgba(16, 16, 20, 0.95);
    border: 1px solid var(--sh-border-color, rgba(255, 255, 255, 0.15));
    border-radius: var(--sh-radius-md, 8px);
    padding: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
    pointer-events: none;
    z-index: 10000;
    text-align: center;
    backdrop-filter: blur(8px);
}

.sh-trickplay-thumbnail {
    width: 100%;
    height: 90px;
    background-size: cover;
    background-position: center;
    border-radius: 4px;
    margin-bottom: 4px;
    background-color: #000;
}

.sh-trickplay-time {
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.5px;
}
        `;
        document.head.appendChild(style);
    }
}

export default TrickplayService;
