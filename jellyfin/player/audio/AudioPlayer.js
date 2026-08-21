/**
 * SpaceHub — Standalone Audio Player
 * Version: 2.0.0
 *
 * Service de lecture audio pour la musique Jellyfin.
 * Gère une file d'attente, les événements de lecture, les méta-données
 * et une interface visuelle avec tourne-disque animé.
 */

'use strict';

import Logger from '../../../core/Logger.js';
import LyricsService from './LyricsService.js';
import AudioDSPService from './AudioDSPService.js';

class AudioPlayer {
    constructor() {
        this._log = new Logger('AudioPlayer');
        this._audio = new Audio();
        this._queue = [];
        this._currentIndex = -1;
        this._uiElement = null;
        this._vinylElement = null;
        this._vinylRotation = 0;
        this._rotationInterval = null;
        this._lyrics = new LyricsService();
        this._dsp = new AudioDSPService();

        this._initListeners();
        this._injectStyles();
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    _initListeners() {
        this._audio.addEventListener('ended', () => this.next());
        this._audio.addEventListener('play', () => this._emit('audio:play'));
        this._audio.addEventListener('pause', () => this._emit('audio:pause'));
        this._audio.addEventListener('timeupdate', () => this._emit('audio:timeupdate'));
    }

    /**
     * Lance la lecture d'un titre Jellyfin.
     * @param {Object} item
     */
    play(item) {
        if (!item) return;
        this._queue = [item];
        this._currentIndex = 0;
        this._playCurrent();
    }

    async _playCurrent() {
        const item = this._queue[this._currentIndex];
        if (!item) return;

        const serverUrl = this._auth.getServerUrl();
        const token = this._auth.getToken();

        // Raccorder l'égaliseur Web Audio DSP
        this._dsp.attachAudio(this._audio);

        // Flux audio direct
        this._audio.src = `${serverUrl}/Audio/${item.Id}/stream?static=true&api_key=${token}`;
        this._audio.play().catch(e => this._log.warn('Lecture auto audio empêchée:', e));

        this._emit('audio:changed', item);
    }

    toggle() {
        if (this._audio.paused) this._audio.play();
        else this._audio.pause();
    }

    next() {
        if (this._currentIndex < this._queue.length - 1) {
            this._currentIndex++;
            this._playCurrent();
        }
    }

    previous() {
        if (this._currentIndex > 0) {
            this._currentIndex--;
            this._playCurrent();
        }
    }

    seek(pct) {
        if (!this._audio.duration) return;
        this._audio.currentTime = pct * this._audio.duration;
    }

    getState() {
        return {
            item: this._queue[this._currentIndex] || null,
            isPlaying: !this._audio.paused,
            currentTime: this._audio.currentTime,
            duration: this._audio.duration
        };
    }

    /**
     * Affiche le mini-lecteur persistant avec tourne-disque.
     * @param {HTMLElement} container
     */
    showMiniPlayer(container) {
        if (this._uiElement) {
            this._uiElement.remove();
        }

        this._uiElement = document.createElement('div');
        this._uiElement.className = 'sh-audio-mini-player';
        this._uiElement.innerHTML = `
            <div class="sh-audio-vinyl-container">
                <div class="sh-audio-vinyl" id="sh-audio-vinyl">
                    <div class="sh-audio-vinyl-label">
                        <div class="sh-audio-vinyl-center"></div>
                    </div>
                </div>
                <div class="sh-audio-tonearm"></div>
            </div>
            <div class="sh-audio-info">
                <div class="sh-audio-title" id="sh-audio-title">Aucun titre</div>
                <div class="sh-audio-artist" id="sh-audio-artist">-</div>
                <div class="sh-audio-progress">
                    <div class="sh-audio-progress-bar">
                        <div class="sh-audio-progress-fill" id="sh-audio-progress-fill"></div>
                    </div>
                    <div class="sh-audio-time">
                        <span id="sh-audio-current-time">0:00</span>
                        <span id="sh-audio-duration">0:00</span>
                    </div>
                </div>
            </div>
            <div class="sh-audio-controls">
                <button class="sh-audio-btn sh-audio-btn-lyrics" id="sh-audio-btn-lyrics" title="Paroles Synchronisées (Karaoké)">🎤</button>
                <button class="sh-audio-btn sh-audio-btn-eq" id="sh-audio-btn-eq" title="Égaliseur 10 Bandes (Hi-Fi)">🎛️</button>
                <button class="sh-audio-btn sh-audio-btn-prev" title="Précédent">⏮</button>
                <button class="sh-audio-btn sh-audio-btn-play" id="sh-audio-btn-play" title="Play/Pause">▶</button>
                <button class="sh-audio-btn sh-audio-btn-next" title="Suivant">⏭</button>
            </div>
        `;

        container.appendChild(this._uiElement);
        this._vinylElement = document.getElementById('sh-audio-vinyl');

        this._bindMiniPlayerEvents();
        this._startVinylAnimation();
        this._updateMiniPlayerUI();
    }

    /**
     * Lie les événements du mini-lecteur.
     * @private
     */
    _bindMiniPlayerEvents() {
        const playBtn = document.getElementById('sh-audio-btn-play');
        const prevBtn = this._uiElement.querySelector('.sh-audio-btn-prev');
        const nextBtn = this._uiElement.querySelector('.sh-audio-btn-next');
        const lyricsBtn = document.getElementById('sh-audio-btn-lyrics');
        const eqBtn = document.getElementById('sh-audio-btn-eq');

        playBtn?.addEventListener('click', () => this.toggle());
        prevBtn?.addEventListener('click', () => this.previous());
        nextBtn?.addEventListener('click', () => this.next());

        lyricsBtn?.addEventListener('click', () => {
            const currentItem = this._queue[this._currentIndex];
            if (currentItem) {
                this._lyrics.openLyricsModal(currentItem, this);
            }
        });

        eqBtn?.addEventListener('click', () => {
            this._dsp.openEqualizerModal();
        });

        // Progress bar click
        const progressBar = this._uiElement.querySelector('.sh-audio-progress-bar');
        progressBar.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            this.seek(pct);
        });

        // Update UI on timeupdate
        this._audio.addEventListener('timeupdate', () => this._updateMiniPlayerUI());
        this._audio.addEventListener('play', () => this._updatePlayButton(true));
        this._audio.addEventListener('pause', () => this._updatePlayButton(false));
    }

    /**
     * Met à jour l'UI du mini-lecteur.
     * @private
     */
    _updateMiniPlayerUI() {
        const item = this._queue[this._currentIndex];
        if (!item) return;

        document.getElementById('sh-audio-title').textContent = item.Name || 'Titre inconnu';
        document.getElementById('sh-audio-artist').textContent = item.Artists?.[0] || item.AlbumArtist || 'Artiste inconnu';

        const currentTime = this._audio.currentTime || 0;
        const duration = this._audio.duration || 0;

        document.getElementById('sh-audio-current-time').textContent = this._formatTime(currentTime);
        document.getElementById('sh-audio-duration').textContent = this._formatTime(duration);

        const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
        document.getElementById('sh-audio-progress-fill').style.width = `${pct}%`;
    }

    /**
     * Met à jour le bouton play/pause.
     * @private
     */
    _updatePlayButton(isPlaying) {
        const btn = document.getElementById('sh-audio-btn-play');
        if (btn) {
            btn.textContent = isPlaying ? '⏸' : '▶';
        }
    }

    /**
     * Démarre l'animation du tourne-disque.
     * @private
     */
    _startVinylAnimation() {
        if (this._rotationInterval) {
            clearInterval(this._rotationInterval);
        }

        this._rotationInterval = setInterval(() => {
            if (!this._audio.paused && this._vinylElement) {
                this._vinylRotation += 0.5;
                this._vinylElement.style.transform = `rotate(${this._vinylRotation}deg)`;
            }
        }, 16); // ~60fps
    }

    /**
     * Formate le temps en mm:ss.
     * @private
     */
    _formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * Cache le mini-lecteur.
     */
    hideMiniPlayer() {
        if (this._uiElement) {
            this._uiElement.remove();
            this._uiElement = null;
        }
        if (this._rotationInterval) {
            clearInterval(this._rotationInterval);
            this._rotationInterval = null;
        }
    }

    _emit(event, data = null) {
        window.SpaceHub?.core?.eventBus?.emit(event, data || this.getState());
    }

    /**
     * Injecte les styles CSS pour le tourne-disque.
     * @private
     */
    _injectStyles() {
        if (document.getElementById('sh-audio-player-styles')) return;

        const style = document.createElement('style');
        style.id = 'sh-audio-player-styles';
        style.textContent = `
.sh-audio-mini-player {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.95), rgba(20,20,25,0.95));
    backdrop-filter: blur(20px);
    border-top: 1px solid var(--sh-border-color);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 24px;
    z-index: 5000;
    font-family: var(--sh-font-family, sans-serif);
    box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
}

.sh-audio-vinyl-container {
    position: relative;
    width: 80px;
    height: 80px;
    flex-shrink: 0;
}

.sh-audio-vinyl {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: 
        repeating-radial-gradient(
            circle at center,
            #111 0px,
            #111 2px,
            #222 2px,
            #222 4px
        );
    box-shadow: 
        0 4px 12px rgba(0,0,0,0.5),
        inset 0 0 0 8px #1a1a1a,
        inset 0 0 0 12px #0a0a0a;
    position: relative;
    transition: transform 0.1s linear;
}

.sh-audio-vinyl-label {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e74c3c, #c0392b);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.sh-audio-vinyl-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #333;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.5);
}

.sh-audio-tonearm {
    position: absolute;
    top: -10px;
    right: -15px;
    width: 4px;
    height: 60px;
    background: linear-gradient(to bottom, #666, #444);
    border-radius: 2px;
    transform-origin: top center;
    transform: rotate(-30deg);
    transition: transform 0.3s ease;
}

.sh-audio-mini-player:hover .sh-audio-tonearm {
    transform: rotate(-15deg);
}

.sh-audio-info {
    flex: 1;
    min-width: 0;
}

.sh-audio-title {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    margin: 0 0 4px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sh-audio-artist {
    font-size: 14px;
    color: rgba(255,255,255,0.6);
    margin: 0 0 12px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sh-audio-progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.sh-audio-progress-bar {
    height: 4px;
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
    cursor: pointer;
    overflow: hidden;
}

.sh-audio-progress-fill {
    height: 100%;
    background: var(--sh-color-primary, #7c6aff);
    width: 0%;
    transition: width 0.1s linear;
}

.sh-audio-time {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: rgba(255,255,255,0.5);
}

.sh-audio-controls {
    display: flex;
    align-items: center;
    gap: 16px;
}

.sh-audio-btn {
    background: rgba(255,255,255,0.1);
    border: none;
    color: #fff;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
}

.sh-audio-btn:hover {
    background: rgba(255,255,255,0.2);
    transform: scale(1.1);
}

.sh-audio-btn-play {
    width: 48px;
    height: 48px;
    font-size: 20px;
    background: var(--sh-color-primary, #7c6aff);
}

.sh-audio-btn-play:hover {
    background: var(--sh-color-primary-hover, #6a5ae6);
}
        `;
        document.head.appendChild(style);
    }
}

export default AudioPlayer;
