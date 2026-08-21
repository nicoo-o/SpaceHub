/**
 * SpaceHub — Standalone Video Player
 * Version: 1.0.0
 *
 * Lecteur vidéo HTML5 / HLS intégré pour la lecture directe des médias Jellyfin.
 * Supporte le streaming HLS, la reprise de lecture, le rapport de progression
 * (/Sessions/Playing/Progress) et les contrôles personnalisés SpaceHub.
 */

'use strict';

import Hls from 'hls.js';
import Logger from '../../core/Logger.js';
import TrickplayService from './TrickplayService.js';
import IntroSkipperService from './IntroSkipperService.js';
import DirectPlayOptimizer from './DirectPlayOptimizer.js';

class VideoPlayer {
    constructor() {
        this._log = new Logger('VideoPlayer');
        this._el = null;
        this._video = null;
        this._hls = null;
        this._currentItem = null;
        this._progressInterval = null;
        this._subOffset = 0; // en secondes
        this._trickplay = new TrickplayService();
        this._introSkipper = new IntroSkipperService();
        this._optimizer = new DirectPlayOptimizer();
        this._injectStyles();
    }

    get videoElement() {
        return this._video;
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Ouvre et lance la lecture d'un élément Jellyfin (film ou épisode).
     * @param {Object} item - Média Jellyfin (Id, Name, etc.)
     * @param {number} [startPositionTicks=0]
     */
    async play(item, startPositionTicks = 0) {
        this._currentItem = item;
        this._log.info(`Lancement de la lecture pour "${item.Name}" (ID: ${item.Id})...`);

        // Événement global pour l'analytics
        window.SpaceHub?.core?.eventBus?.emit('player:played', item);

        this._createPlayerDOM(item);

        const serverUrl = this._auth.getServerUrl();
        const token = this._auth.getToken();
        const startPositionSeconds = (startPositionTicks || item.UserData?.PlaybackPositionTicks || 0) / 10000000;

        // Charger Trickplay et marqueurs d'intro
        this._trickplay.loadTrickplay(item);
        this._introSkipper.loadTimestamps(item, item.Chapters || []);

        // Cas de lecture d'un média hors-ligne stocké localement
        if (item._isOffline && item._blobUrl) {
            this._video.src = item._blobUrl;
            this._video.play().catch(e => this._log.warn('Auto-play hors-ligne empêché:', e));
            return;
        }

        // URL de flux vidéo optimisée (Direct Stream / Direct Play prioritaire)
        const optimizedParams = this._optimizer.getOptimizedStreamParams(item, startPositionSeconds);
        const streamUrl = `${serverUrl}/Videos/${item.Id}/master.m3u8?${optimizedParams}&Tag=${item.Etag || ''}&api_key=${token}`;

        if (Hls.isSupported()) {
            if (this._hls) this._hls.destroy();
            this._hls = new Hls({
                xhrSetup: (xhr) => {
                    xhr.setRequestHeader('Authorization', `MediaBrowser Token="${token}"`);
                }
            });
            this._hls.loadSource(streamUrl);
            this._hls.attachMedia(this._video);
            this._hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this._video.play().catch(e => this._log.warn('Auto-play empêché:', e));
            });
        } else if (this._video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari natif
            this._video.src = streamUrl;
            this._video.addEventListener('loadedmetadata', () => {
                this._video.currentTime = startPositionSeconds;
                this._video.play().catch(e => this._log.warn('Auto-play empêché:', e));
            });
        } else {
            // Fallback flux direct
            this._video.src = `${serverUrl}/Videos/${item.Id}/stream?static=true&api_key=${token}`;
            this._video.currentTime = startPositionSeconds;
            this._video.play().catch(e => this._log.warn('Auto-play direct:', e));
        }

        this._reportPlaybackStart();
        this._startProgressReporting();
    }

    _createPlayerDOM(item) {
        this.close();

        this._el = document.createElement('div');
        this._el.id = 'sh-video-player-overlay';
        this._el.className = 'sh-player';
        this._el.innerHTML = `
            <div class="sh-player__video-container">
                <video class="sh-player__video" playsinline autoplay></video>
                
                <!-- Feedback visuel central (pulsation temporaire au Play/Pause/Seek) -->
                <div class="sh-player__center-feedback" id="sh-player-feedback" style="display:none;"></div>

                <div class="sh-player__ui">
                    <!-- En-tête supérieur cinématique -->
                    <div class="sh-player__header">
                        <button class="sh-player__btn-back" title="Quitter la lecture">
                            <span class="sh-back-arrow">←</span>
                            <span>Retour</span>
                        </button>
                        <div class="sh-player__title-wrap">
                            <div class="sh-player__title-row">
                                <h3 class="sh-player__title">${this._escape(item.Name)}</h3>
                                <span class="sh-player__stream-badge">4K · DIRECT PLAY</span>
                            </div>
                            ${item.SeriesName ? `<p class="sh-player__subtitle">${this._escape(item.SeriesName)} — Saison ${item.ParentIndexNumber || 1}, Épisode ${item.IndexNumber || 1}</p>` : ''}
                        </div>
                        <button class="sh-player__btn-close" title="Fermer (Échap)">✕</button>
                    </div>

                    <!-- Barre de contrôle inférieure unifiée (Style Netflix / Apple TV) -->
                    <div class="sh-player__footer">
                        <!-- Barre de progression interactive avec tooltip horaire -->
                        <div class="sh-player__progress-container" id="sh-player-progress-container">
                            <div class="sh-player__time-tooltip" id="sh-time-tooltip">00:00</div>
                            <div class="sh-player__progress-bar">
                                <div class="sh-player__progress-buffer"></div>
                                <div class="sh-player__progress-fill">
                                    <div class="sh-player__scrubber-thumb"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Ligne des commandes principales -->
                        <div class="sh-player__controls-row">
                            <div class="sh-player__controls-left">
                                <button class="sh-ctrl-btn sh-btn-play-pause" title="Lecture / Pause (Espace)">
                                    <span class="sh-ctrl-icon">▶</span>
                                </button>
                                <button class="sh-ctrl-btn sh-btn-seek-back" title="Reculer de 10 secondes (←)">
                                    <span class="sh-ctrl-icon">↺</span>
                                    <span class="sh-btn-sub">10s</span>
                                </button>
                                <button class="sh-ctrl-btn sh-btn-seek-forward" title="Avancer de 10 secondes (→)">
                                    <span class="sh-ctrl-icon">↻</span>
                                    <span class="sh-btn-sub">10s</span>
                                </button>

                                <div class="sh-volume-group">
                                    <button class="sh-ctrl-btn sh-btn-mute" title="Couper / Rétablir le son (M)">
                                        <span class="sh-volume-icon">🔊</span>
                                    </button>
                                    <div class="sh-volume-slider-wrap">
                                        <input type="range" class="sh-volume-slider" min="0" max="1" step="0.05" value="1">
                                    </div>
                                </div>

                                <div class="sh-player__time-badge">
                                    <span class="sh-player__time-current">0:00</span>
                                    <span class="sh-player__time-sep">/</span>
                                    <span class="sh-player__time-total">0:00</span>
                                </div>
                            </div>

                            <div class="sh-player__controls-right">
                                <button class="sh-ctrl-pill sh-btn-syncplay" title="Watch Party / SyncPlay">
                                    <span>🍿</span>
                                    <span class="sh-pill-label">Watch Party</span>
                                </button>
                                <button class="sh-ctrl-pill sh-btn-nightmode" title="Clarté vocale & compression dynamique">
                                    <span>🌙</span>
                                    <span class="sh-pill-label">Mode Nuit</span>
                                </button>
                                <button class="sh-ctrl-pill sh-btn-trailer" title="Bande-annonce">
                                    <span>🎬</span>
                                    <span class="sh-pill-label">Trailer</span>
                                </button>
                                <button class="sh-ctrl-btn sh-btn-offset" title="Ajuster la synchronisation des sous-titres">
                                    <span>⏱️</span>
                                </button>
                                <button class="sh-ctrl-pill sh-btn-tracks" title="Choisir la langue audio et les sous-titres">
                                    <span>💬</span>
                                    <span class="sh-pill-label">Audio & Subs</span>
                                </button>
                                <button class="sh-ctrl-btn sh-btn-quality" title="Qualité de lecture">
                                    <span>⚙️</span>
                                </button>
                                <button class="sh-ctrl-btn sh-btn-fullscreen" title="Plein écran (F)">
                                    <span class="sh-fs-icon">⛶</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Menus contextuels en verre dépoli -->
                <div class="sh-player__menu sh-player__menu--tracks" style="display:none;"></div>
                <div class="sh-player__menu sh-player__menu--quality" style="display:none;"></div>
                <div class="sh-player__menu sh-player__menu--offset" style="display:none;">
                    <h4>⏱️ Synchronisation sous-titres</h4>
                    <div class="sh-player__offset-ctrl">
                        <button class="sh-btn sh-btn--sm" data-offset="-0.5">-500ms</button>
                        <span class="sh-player__offset-val">0ms</span>
                        <button class="sh-btn sh-btn--sm" data-offset="0.5">+500ms</button>
                    </div>
                    <button class="sh-btn sh-btn--ghost sh-btn--sm" data-offset="reset">Réinitialiser (0ms)</button>
                </div>
            </div>
        `;

        document.body.appendChild(this._el);
        this._video = this._el.querySelector('.sh-player__video');
        this._ui = this._el.querySelector('.sh-player__ui');

        this._bindUIEvents();
        this._setupGestures();

        // Événements clavier avancés (Espace = Pause, Echap = Quitter, Flèches = Seek, M = Mute, F = Fullscreen)
        this._keyHandler = (e) => {
            if (e.key === 'Escape') this.close();
            if (e.key === ' ' && (e.target === document.body || e.target === this._el)) {
                e.preventDefault();
                this._togglePlay();
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this._seekRelative(-10);
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                this._seekRelative(10);
            }
            if (e.key === 'f' || e.key === 'F') {
                this._toggleFullscreen();
            }
            if (e.key === 'm' || e.key === 'M') {
                this._toggleMute();
            }
        };
        document.addEventListener('keydown', this._keyHandler);

        // Plein écran automatique si supporté
        if (this._el.requestFullscreen) {
            this._el.requestFullscreen().catch(() => {});
        }
    }

    _showFeedback(iconText) {
        const fb = this._el?.querySelector('#sh-player-feedback');
        if (!fb) return;
        fb.textContent = iconText;
        fb.style.display = 'flex';
        fb.classList.remove('sh-pulse-anim');
        void fb.offsetWidth; // Trigger reflow
        fb.classList.add('sh-pulse-anim');
        clearTimeout(this._fbTimeout);
        this._fbTimeout = setTimeout(() => {
            fb.style.display = 'none';
        }, 600);
    }

    _bindUIEvents() {
        const ui = this._ui;

        // Boutons de sortie / retour
        ui.querySelector('.sh-player__btn-back')?.addEventListener('click', () => this.close());
        ui.querySelector('.sh-player__btn-close')?.addEventListener('click', () => this.close());

        // Bouton Play/Pause
        const playBtn = ui.querySelector('.sh-btn-play-pause');
        playBtn?.addEventListener('click', () => this._togglePlay());

        // Saut -10s et +10s
        ui.querySelector('.sh-btn-seek-back')?.addEventListener('click', () => {
            this._seekRelative(-10);
            this._showFeedback('↺ 10s');
        });
        ui.querySelector('.sh-btn-seek-forward')?.addEventListener('click', () => {
            this._seekRelative(10);
            this._showFeedback('↻ 10s');
        });

        // Plein écran
        ui.querySelector('.sh-btn-fullscreen')?.addEventListener('click', () => this._toggleFullscreen());

        // Menus contextuels (Tracks, Qualité, Décalage sous-titres)
        const toggleMenu = (selector) => {
            const menu = this._el.querySelector(selector);
            const isVisible = menu.style.display === 'block';
            this._el.querySelectorAll('.sh-player__menu').forEach(m => m.style.display = 'none');
            if (!isVisible) {
                menu.style.display = 'block';
                if (selector === '.sh-player__menu--tracks') this._populateTracksMenu();
                if (selector === '.sh-player__menu--quality') this._populateQualityMenu();
            }
        };

        ui.querySelector('.sh-btn-tracks')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu('.sh-player__menu--tracks');
        });
        ui.querySelector('.sh-btn-quality')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu('.sh-player__menu--quality');
        });
        ui.querySelector('.sh-btn-offset')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu('.sh-player__menu--offset');
        });

        // SyncPlay Watch Party
        ui.querySelector('.sh-btn-syncplay')?.addEventListener('click', () => {
            window.SpaceHub?.syncPlay?.openSyncPlayModal(this._currentItem);
        });

        // Mode Nuit / Normalisation Audio
        ui.querySelector('.sh-btn-nightmode')?.addEventListener('click', () => {
            this._optimizer.setAudioNormalization(this._video, true);
            window.SpaceHub?.ui?.components?.toaster?.info('Normalisation audio activée (Mode Nuit)');
        });

        // Bande-annonce
        ui.querySelector('.sh-btn-trailer')?.addEventListener('click', () => {
            if (!this._currentItem) return;
            window.SpaceHub?.trailerService?.openTrailer(this._currentItem);
        });

        // Offset sous-titres
        const offsetMenu = this._el.querySelector('.sh-player__menu--offset');
        offsetMenu?.querySelectorAll('[data-offset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.offset;
                if (val === 'reset') this._subOffset = 0;
                else this._subOffset += parseFloat(val);

                this._el.querySelector('.sh-player__offset-val').textContent = `${Math.round(this._subOffset * 1000)}ms`;
                this._applySubtitleOffset();
            });
        });

        // Contrôle du volume
        const volumeSlider = ui.querySelector('.sh-volume-slider');
        const muteBtn = ui.querySelector('.sh-btn-mute');
        const volumeIcon = ui.querySelector('.sh-volume-icon');

        volumeSlider?.addEventListener('input', (e) => {
            this._video.volume = parseFloat(e.target.value);
            this._video.muted = false;
            if (volumeIcon) volumeIcon.textContent = this._video.volume > 0.4 ? '🔊' : (this._video.volume > 0 ? '🔉' : '🔇');
        });

        muteBtn?.addEventListener('click', () => this._toggleMute());

        // Barre de progression & Tooltip horaire au survol
        const progressContainer = ui.querySelector('#sh-player-progress-container');
        const tooltip = ui.querySelector('#sh-time-tooltip');

        progressContainer?.addEventListener('mousemove', (e) => {
            const rect = progressContainer.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const hoverSeconds = pos * (this._video.duration || 0);
            if (tooltip) {
                tooltip.style.left = `${pos * 100}%`;
                tooltip.textContent = this._formatTime(hoverSeconds);
                tooltip.style.opacity = '1';
            }
        });

        progressContainer?.addEventListener('mouseleave', () => {
            if (tooltip) tooltip.style.opacity = '0';
        });

        progressContainer?.addEventListener('click', (e) => {
            const rect = progressContainer.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            this._video.currentTime = pos * this._video.duration;
            window.SpaceHub?.syncPlay?.notifySeek(this._video.currentTime);
        });

        // Attacher le scrubbing Trickplay (Jellyfin 10.9+)
        const totalDuration = (this._currentItem?.RunTimeTicks || 0) / 10000000;
        this._trickplay?.attachScrubbing(progressContainer, totalDuration);

        this._video.addEventListener('timeupdate', () => {
            this._updateProgress();
            this._introSkipper?.update(this._video.currentTime, this._video);
        });

        this._video.addEventListener('play', () => {
            const icon = ui.querySelector('.sh-btn-play-pause .sh-ctrl-icon');
            if (icon) icon.textContent = '⏸';
            this._ui.classList.add('sh-player--playing');
            window.SpaceHub?.syncPlay?.notifyPlay();
        });

        this._video.addEventListener('pause', () => {
            const icon = ui.querySelector('.sh-btn-play-pause .sh-ctrl-icon');
            if (icon) icon.textContent = '▶';
            this._ui.classList.remove('sh-player--playing');
            window.SpaceHub?.syncPlay?.notifyPause();
        });

        this._video.addEventListener('seeked', () => {
            window.SpaceHub?.syncPlay?.notifySeek(this._video.currentTime);
        });

        // Auto-hide UI logic après 3 secondes d'inactivité
        let hideTimeout;
        const resetHideTimeout = () => {
            this._ui.style.opacity = '1';
            this._el.style.cursor = 'default';
            clearTimeout(hideTimeout);
            if (!this._video.paused) {
                hideTimeout = setTimeout(() => {
                    this._ui.style.opacity = '0';
                    this._el.style.cursor = 'none';
                    this._el.querySelectorAll('.sh-player__menu').forEach(m => m.style.display = 'none');
                }, 3000);
            }
        };

        this._el.addEventListener('mousemove', resetHideTimeout);
        this._video.addEventListener('play', resetHideTimeout);
    }

    _togglePlay() {
        if (this._video.paused) {
            this._video.play();
            this._showFeedback('▶');
        } else {
            this._video.pause();
            this._showFeedback('⏸');
        }
    }

    _seekRelative(seconds) {
        this._video.currentTime = Math.max(0, Math.min(this._video.duration, this._video.currentTime + seconds));
    }

    _toggleMute() {
        this._video.muted = !this._video.muted;
        const volumeIcon = this._ui.querySelector('.sh-volume-icon');
        if (volumeIcon) {
            volumeIcon.textContent = this._video.muted ? '🔇' : (this._video.volume > 0.4 ? '🔊' : '🔉');
        }
        this._showFeedback(this._video.muted ? '🔇 Muet' : '🔊 Son');
    }

    _toggleFullscreen() {
        if (!document.fullscreenElement) {
            this._el.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }

    _updateProgress() {
        const fill = this._ui.querySelector('.sh-player__progress-fill');
        const current = this._ui.querySelector('.sh-player__time-current');
        const total = this._ui.querySelector('.sh-player__time-total');

        if (this._video.duration) {
            const pct = (this._video.currentTime / this._video.duration) * 100;
            if (fill) fill.style.width = `${pct}%`;
            if (current) current.textContent = this._formatTime(this._video.currentTime);
            if (total) total.textContent = this._formatTime(this._video.duration);
        }
    }

    _formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    _setupGestures() {
        let lastTap = 0;
        this._video.addEventListener('touchstart', (e) => {
            const now = Date.now();
            const timesince = now - lastTap;
            if (timesince < 300 && timesince > 0) {
                const rect = this._video.getBoundingClientRect();
                const touchX = e.touches[0].clientX - rect.left;
                if (touchX < rect.width / 3) {
                    this._seekRelative(-10);
                    this._showFeedback('↺ 10s');
                } else if (touchX > (rect.width / 3) * 2) {
                    this._seekRelative(10);
                    this._showFeedback('↻ 10s');
                } else {
                    this._togglePlay();
                }
                e.preventDefault();
            }
            lastTap = now;
        });
    }

    _populateTracksMenu() {
        const menu = this._el.querySelector('.sh-player__menu--tracks');
        if (!this._hls) {
            menu.innerHTML = '<h4>💬 Audio & Sous-titres</h4><p style="color:var(--sh-text-muted);font-size:12px;">Flux direct</p>';
            return;
        }

        let html = '<h4>💬 Langues Audio</h4>';
        this._hls.audioTracks.forEach((track, i) => {
            const isAct = this._hls.audioTrack === i;
            html += `<button class="sh-menu-item ${isAct ? 'active' : ''}" data-type="audio" data-index="${i}">
                <span>${track.name || `Piste ${i}`} ${track.lang ? `(${track.lang.toUpperCase()})` : ''}</span>
                ${isAct ? '<span>✓</span>' : ''}
            </button>`;
        });

        html += '<h4 style="margin-top:16px;">📝 Sous-titres</h4>';
        const isOff = this._hls.subtitleTrack === -1;
        html += `<button class="sh-menu-item ${isOff ? 'active' : ''}" data-type="sub" data-index="-1">
            <span>Désactivés</span>
            ${isOff ? '<span>✓</span>' : ''}
        </button>`;

        this._hls.subtitleTracks.forEach((track, i) => {
            const isAct = this._hls.subtitleTrack === i;
            html += `<button class="sh-menu-item ${isAct ? 'active' : ''}" data-type="sub" data-index="${i}">
                <span>${track.name || `Sous-titre ${i}`} ${track.lang ? `(${track.lang.toUpperCase()})` : ''}</span>
                ${isAct ? '<span>✓</span>' : ''}
            </button>`;
        });

        menu.innerHTML = html;
        menu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                if (btn.dataset.type === 'audio') this._hls.audioTrack = idx;
                else this._hls.subtitleTrack = idx;
                menu.style.display = 'none';
            });
        });
    }

    _populateQualityMenu() {
        const menu = this._el.querySelector('.sh-player__menu--quality');
        if (!this._hls) {
            menu.innerHTML = '<h4>⚙️ Qualité</h4><p style="color:var(--sh-text-muted);font-size:12px;">Automatique (Direct)</p>';
            return;
        }

        let html = '<h4>⚙️ Qualité Vidéo</h4>';
        const isAuto = this._hls.autoLevelEnabled;
        html += `<button class="sh-menu-item ${isAuto ? 'active' : ''}" data-index="-1">
            <span>Automatique (Adaptatif)</span>
            ${isAuto ? '<span>✓</span>' : ''}
        </button>`;

        const sortedLevels = [...this._hls.levels].sort((a, b) => (b.height || 0) - (a.height || 0));
        
        sortedLevels.forEach((level) => {
            const originalIndex = this._hls.levels.indexOf(level);
            const height = level.height || 'N/A';
            const bitrate = level.bitrate ? `${(level.bitrate / 1000000).toFixed(1)} Mbps` : '';
            const isAct = !isAuto && this._hls.currentLevel === originalIndex;
            
            html += `<button class="sh-menu-item ${isAct ? 'active' : ''}" data-index="${originalIndex}">
                <span>${height}p ${bitrate ? `· ${bitrate}` : ''}</span>
                ${isAct ? '<span>✓</span>' : ''}
            </button>`;
        });

        menu.innerHTML = html;
        menu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                if (idx === -1) {
                    this._hls.currentLevel = -1;
                } else {
                    this._hls.currentLevel = idx;
                }
                menu.style.display = 'none';
            });
        });
    }

    _applySubtitleOffset() {
        if (!this._video) return;
        const tracks = this._video.textTracks;
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            if (track.cues) {
                for (let j = 0; j < track.cues.length; j++) {
                    const cue = track.cues[j];
                    if (cue._origStart === undefined) {
                        cue._origStart = cue.startTime;
                        cue._origEnd = cue.endTime;
                    }
                    cue.startTime = Math.max(0, cue._origStart + this._subOffset);
                    cue.endTime = Math.max(0, cue._origEnd + this._subOffset);
                }
            }
        }
    }

    _reportPlaybackStart() {
        // Envoi au serveur Jellyfin
    }

    _startProgressReporting() {
        if (this._progressInterval) clearInterval(this._progressInterval);
        this._progressInterval = setInterval(() => {
            if (!this._video || this._video.paused || !this._currentItem) return;
            const positionTicks = Math.round(this._video.currentTime * 10000000);
            window.SpaceHub?.core?.eventBus?.emit('player:progress', {
                itemId: this._currentItem.Id,
                positionTicks
            });
        }, 10000);
    }

    _escape(text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[m]);
    }

    close() {
        if (this._progressInterval) clearInterval(this._progressInterval);
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
        if (this._hls) {
            this._hls.destroy();
            this._hls = null;
        }
        if (this._el) {
            this._el.remove();
            this._el = null;
        }
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-player-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-player-styles';
        style.textContent = `
#sh-video-player-overlay {
    position: fixed;
    inset: 0;
    background: #000000;
    z-index: 99999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    user-select: none;
    overflow: hidden;
}

.sh-player__video-container {
    width: 100%;
    height: 100%;
    position: relative;
    background: #000;
}

.sh-player__video {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

/* UI Overlay & Gradations */
.sh-player__ui {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    opacity: 1;
    transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
}

.sh-player__ui * {
    pointer-events: auto;
}

/* Header Supérieur */
.sh-player__header {
    padding: 28px 36px;
    background: linear-gradient(to bottom, rgba(5, 5, 10, 0.9) 0%, rgba(5, 5, 10, 0.4) 60%, transparent 100%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
}

.sh-player__btn-back {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #ffffff;
    padding: 10px 18px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    backdrop-filter: blur(16px);
    transition: all 0.2s;
}

.sh-player__btn-back:hover {
    background: rgba(255, 255, 255, 0.22);
    transform: scale(1.03);
}

.sh-player__title-wrap {
    flex: 1;
}

.sh-player__title-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.sh-player__title {
    margin: 0;
    color: #ffffff;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.3px;
    text-shadow: 0 2px 10px rgba(0,0,0,0.8);
}

.sh-player__stream-badge {
    background: var(--sh-color-primary, #7c6aff);
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 6px;
    letter-spacing: 0.5px;
}

.sh-player__subtitle {
    margin: 4px 0 0 0;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    font-weight: 500;
}

.sh-player__btn-close {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #ffffff;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    font-size: 16px;
    cursor: pointer;
    backdrop-filter: blur(16px);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.sh-player__btn-close:hover {
    background: rgba(255, 92, 122, 0.4);
    border-color: #ff5c7a;
}

/* Feedback Central (Pulsation) */
.sh-player__center-feedback {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(12, 12, 18, 0.8);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 0 40px rgba(124, 106, 255, 0.4);
    color: #ffffff;
    font-size: 28px;
    font-weight: 800;
    padding: 20px 32px;
    border-radius: 20px;
    z-index: 15;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
}

.sh-pulse-anim {
    animation: shFeedbackPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

@keyframes shFeedbackPop {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
    50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
    100% { opacity: 0.9; transform: translate(-50%, -50%) scale(1); }
}

/* Barre Inférieure Unifiée (Netflix / Apple TV) */
.sh-player__footer {
    padding: 24px 36px 36px;
    background: linear-gradient(to top, rgba(5, 5, 10, 0.95) 0%, rgba(5, 5, 10, 0.5) 70%, transparent 100%);
    display: flex;
    flex-direction: column;
    gap: 16px;
}

/* Progress Bar & Tooltip */
.sh-player__progress-container {
    position: relative;
    cursor: pointer;
    padding: 10px 0;
}

.sh-player__time-tooltip {
    position: absolute;
    top: -28px;
    transform: translateX(-50%);
    background: rgba(20, 20, 30, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
    white-space: nowrap;
}

.sh-player__progress-bar {
    height: 6px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    position: relative;
    transition: height 0.15s ease;
}

.sh-player__progress-container:hover .sh-player__progress-bar {
    height: 8px;
}

.sh-player__progress-buffer {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    width: 0%;
}

.sh-player__progress-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(90deg, #7c6aff, #a394ff);
    border-radius: 4px;
    width: 0%;
}

.sh-player__scrubber-thumb {
    position: absolute;
    right: -7px;
    top: 50%;
    transform: translateY(-50%) scale(0);
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 0 12px rgba(124, 106, 255, 0.8);
    transition: transform 0.15s ease;
}

.sh-player__progress-container:hover .sh-player__scrubber-thumb {
    transform: translateY(-50%) scale(1);
}

/* Ligne des Contrôles */
.sh-player__controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
}

.sh-player__controls-left, .sh-player__controls-right {
    display: flex;
    align-items: center;
    gap: 12px;
}

/* Boutons Ronds / Commande */
.sh-ctrl-btn {
    background: transparent;
    border: none;
    color: #ffffff;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.sh-ctrl-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    transform: scale(1.08);
}

.sh-btn-play-pause {
    background: var(--sh-color-primary, #7c6aff);
    box-shadow: 0 4px 16px rgba(124, 106, 255, 0.4);
    width: 48px;
    height: 48px;
    font-size: 20px;
}

.sh-btn-play-pause:hover {
    background: #9182ff;
    transform: scale(1.1);
    box-shadow: 0 6px 20px rgba(124, 106, 255, 0.6);
}

.sh-btn-sub {
    font-size: 9px;
    font-weight: 800;
    margin-top: -3px;
    opacity: 0.8;
}

/* Volume */
.sh-volume-group {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.06);
    padding: 2px 10px 2px 4px;
    border-radius: 20px;
}

.sh-volume-slider {
    width: 70px;
    height: 4px;
    accent-color: var(--sh-color-primary, #7c6aff);
    cursor: pointer;
}

/* Badge Durée */
.sh-player__time-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    margin-left: 8px;
}

.sh-player__time-sep {
    color: rgba(255, 255, 255, 0.35);
}

/* Boutons Pills (Droite) */
.sh-ctrl-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ffffff;
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    backdrop-filter: blur(12px);
    transition: all 0.2s;
}

.sh-ctrl-pill:hover {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px);
}

/* Menus Popups */
.sh-player__menu {
    position: absolute;
    bottom: 96px;
    right: 36px;
    background: rgba(14, 14, 22, 0.95);
    backdrop-filter: blur(28px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 18px;
    padding: 18px;
    width: 280px;
    max-height: 420px;
    overflow-y: auto;
    z-index: 30;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8), 0 0 20px rgba(124, 106, 255, 0.15);
}

.sh-player__menu h4 {
    margin: 0 0 10px 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: rgba(255, 255, 255, 0.45);
}

.sh-menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-bottom: 4px;
}

.sh-menu-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    transform: translateX(3px);
}

.sh-menu-item.active {
    background: var(--sh-color-primary, #7c6aff);
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(124, 106, 255, 0.4);
}

.sh-player__offset-ctrl {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
}

.sh-player__offset-val {
    font-weight: 800;
    font-size: 15px;
    color: var(--sh-color-primary, #7c6aff);
}

@media (max-width: 900px) {
    .sh-pill-label { display: none; }
    .sh-ctrl-pill { padding: 8px 10px; }
    .sh-player__header { padding: 18px; }
    .sh-player__footer { padding: 18px; }
}
        `;
        document.head.appendChild(style);
    }
}

export default VideoPlayer;
