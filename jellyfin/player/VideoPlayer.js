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

class VideoPlayer {
    constructor() {
        this._log = new Logger('VideoPlayer');
        this._el = null;
        this._video = null;
        this._hls = null;
        this._currentItem = null;
        this._progressInterval = null;
        this._subOffset = 0; // en secondes
        this._injectStyles();
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

        // URL de flux vidéo Jellyfin (HLS Master Playlist)
        const streamUrl = `${serverUrl}/Videos/${item.Id}/master.m3u8?DeviceId=spacehub-web&MediaSourceId=${item.Id}&VideoCodec=h264,hevc,vp9&AudioCodec=aac,mp3,opus&TranscodingMaxAudioChannels=2&RequireAvc=false&Tag=${item.Etag || ''}&StartTimeTicks=${Math.round(startPositionSeconds * 10000000)}&api_key=${token}`;

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
                <div class="sh-player__ui">
                    <div class="sh-player__header">
                        <button class="sh-player__btn sh-player__btn-back" title="Retour">← Retour</button>
                        <div class="sh-player__title-wrap">
                            <h3 class="sh-player__title">${this._escape(item.Name)}</h3>
                            ${item.SeriesName ? `<p class="sh-player__subtitle">${this._escape(item.SeriesName)} - S${item.ParentIndexNumber || 1}E${item.IndexNumber || 1}</p>` : ''}
                        </div>
                    </div>

                    <div class="sh-player__center-controls">
                        <button class="sh-player__center-btn sh-player__seek-back" title="Reculer de 10s">↺</button>
                        <button class="sh-player__center-btn sh-player__toggle-play" title="Play/Pause">▶</button>
                        <button class="sh-player__center-btn sh-player__seek-forward" title="Avancer de 10s">↻</button>
                    </div>

                    <div class="sh-player__footer">
                        <div class="sh-player__progress-container">
                            <div class="sh-player__progress-bar">
                                <div class="sh-player__progress-fill"></div>
                            </div>
                            <div class="sh-player__time-display">
                                <span class="sh-player__time-current">0:00</span>
                                <span class="sh-player__time-total">0:00</span>
                            </div>
                        </div>

                        <div class="sh-player__bottom-actions">
                            <div class="sh-player__actions-left">
                                <button class="sh-player__btn sh-player__btn-mute" title="Mute/Unmute">🔊</button>
                                <input type="range" class="sh-player__volume-slider" min="0" max="1" step="0.1" value="1">
                            </div>
                            <div class="sh-player__actions-right">
                                <button class="sh-player__btn sh-player__btn-trailer" title="Bande-annonce">🎬</button>
                                <button class="sh-player__btn sh-player__btn-cast" title="Chromecast" style="display:none;">📺</button>
                                <button class="sh-player__btn sh-player__btn-offset" title="Décalage sous-titres">⏱️</button>
                                <button class="sh-player__btn sh-player__btn-quality" title="Qualité">⚙️</button>
                                <button class="sh-player__btn sh-player__btn-tracks" title="Pistes Audio/Sous-titres">💬</button>
                                <button class="sh-player__btn sh-player__btn-fullscreen" title="Plein écran">⛶</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Menus contextuels -->
                <div class="sh-player__menu sh-player__menu--tracks" style="display:none;"></div>
                <div class="sh-player__menu sh-player__menu--quality" style="display:none;"></div>
                <div class="sh-player__menu sh-player__menu--offset" style="display:none;">
                    <h4>Décalage sous-titres</h4>
                    <div class="sh-player__offset-ctrl">
                        <button class="sh-btn sh-btn--sm" data-offset="-0.5">-500ms</button>
                        <span class="sh-player__offset-val">0ms</span>
                        <button class="sh-btn sh-btn--sm" data-offset="0.5">+500ms</button>
                    </div>
                    <button class="sh-btn sh-btn--ghost sh-btn--sm" data-offset="reset">Réinitialiser</button>
                </div>
            </div>
        `;

        document.body.appendChild(this._el);
        this._video = this._el.querySelector('.sh-player__video');
        this._ui = this._el.querySelector('.sh-player__ui');

        this._bindUIEvents();
        this._setupGestures();

        // Événements clavier (Espace = Pause, Echap = Quitter, Flèches = Seek)
        this._keyHandler = (e) => {
            if (e.key === 'Escape') this.close();
            if (e.key === ' ' && e.target === document.body) {
                e.preventDefault();
                this._togglePlay();
            }
            if (e.key === 'ArrowLeft') this._seekRelative(-10);
            if (e.key === 'ArrowRight') this._seekRelative(10);
        };
        document.addEventListener('keydown', this._keyHandler);

        // Plein écran automatique si supporté
        if (this._el.requestFullscreen) {
            this._el.requestFullscreen().catch(() => {});
        }
    }

    _bindUIEvents() {
        const ui = this._ui;

        ui.querySelector('.sh-player__btn-back').addEventListener('click', () => this.close());

        ui.querySelector('.sh-player__toggle-play').addEventListener('click', () => this._togglePlay());

        ui.querySelector('.sh-player__seek-back').addEventListener('click', () => this._seekRelative(-10));
        ui.querySelector('.sh-player__seek-forward').addEventListener('click', () => this._seekRelative(10));

        ui.querySelector('.sh-player__btn-fullscreen').addEventListener('click', () => {
            if (!document.fullscreenElement) {
                this._el.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });

        // Chromecast
        this._initChromecast();
        if (this._castAvailable) {
            ui.querySelector('.sh-player__btn-cast').style.display = 'block';
            ui.querySelector('.sh-player__btn-cast').addEventListener('click', () => this._toggleCast());
        }

        // Gestion des menus
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

        ui.querySelector('.sh-player__btn-tracks').addEventListener('click', () => toggleMenu('.sh-player__menu--tracks'));
        ui.querySelector('.sh-player__btn-quality').addEventListener('click', () => toggleMenu('.sh-player__menu--quality'));
        ui.querySelector('.sh-player__btn-offset').addEventListener('click', () => toggleMenu('.sh-player__menu--offset'));

        // Bande-annonce
        ui.querySelector('.sh-player__btn-trailer').addEventListener('click', () => {
            if (!this._currentItem) return;
            const term = encodeURIComponent(`${this._currentItem.Name} ${this._currentItem.ProductionYear || ''} trailer`);
            window.open(`https://www.youtube.com/results?search_query=${term}`, '_blank');
        });

        // Offset UI
        const offsetMenu = this._el.querySelector('.sh-player__menu--offset');
        offsetMenu.querySelectorAll('[data-offset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.offset;
                if (val === 'reset') this._subOffset = 0;
                else this._subOffset += parseFloat(val);

                this._el.querySelector('.sh-player__offset-val').textContent = `${Math.round(this._subOffset * 1000)}ms`;
                this._applySubtitleOffset();
            });
        });

        const volumeSlider = ui.querySelector('.sh-player__volume-slider');
        volumeSlider.addEventListener('input', (e) => {
            this._video.volume = e.target.value;
            ui.querySelector('.sh-player__btn-mute').textContent = e.target.value > 0 ? '🔊' : '🔇';
        });

        ui.querySelector('.sh-player__btn-mute').addEventListener('click', (e) => {
            this._video.muted = !this._video.muted;
            e.target.textContent = this._video.muted ? '🔇' : '🔊';
        });

        const progressContainer = ui.querySelector('.sh-player__progress-container');
        progressContainer.addEventListener('click', (e) => {
            const rect = progressContainer.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            this._video.currentTime = pos * this._video.duration;
        });

        this._video.addEventListener('timeupdate', () => this._updateProgress());
        this._video.addEventListener('play', () => {
            ui.querySelector('.sh-player__toggle-play').textContent = '⏸';
            this._ui.classList.add('sh-player--playing');
        });
        this._video.addEventListener('pause', () => {
            ui.querySelector('.sh-player__toggle-play').textContent = '▶';
            this._ui.classList.remove('sh-player--playing');
        });

        // Auto-hide UI logic
        let hideTimeout;
        const resetHideTimeout = () => {
            this._ui.style.opacity = '1';
            this._el.style.cursor = 'default';
            clearTimeout(hideTimeout);
            if (!this._video.paused) {
                hideTimeout = setTimeout(() => {
                    this._ui.style.opacity = '0';
                    this._el.style.cursor = 'none';
                }, 3000);
            }
        };

        this._el.addEventListener('mousemove', resetHideTimeout);
        this._video.addEventListener('play', resetHideTimeout);
    }

    _togglePlay() {
        if (this._video.paused) this._video.play();
        else this._video.pause();
    }

    _seekRelative(seconds) {
        this._video.currentTime = Math.max(0, Math.min(this._video.duration, this._video.currentTime + seconds));
    }

    _updateProgress() {
        const fill = this._ui.querySelector('.sh-player__progress-fill');
        const current = this._ui.querySelector('.sh-player__time-current');
        const total = this._ui.querySelector('.sh-player__time-total');

        const pct = (this._video.currentTime / this._video.duration) * 100;
        fill.style.width = `${pct}%`;

        current.textContent = this._formatTime(this._video.currentTime);
        total.textContent = this._formatTime(this._video.duration);
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
                if (touchX < rect.width / 3) this._seekRelative(-10);
                else if (touchX > (rect.width / 3) * 2) this._seekRelative(10);
                else this._togglePlay();
                e.preventDefault();
            }
            lastTap = now;
        });
    }

    _populateTracksMenu() {
        const menu = this._el.querySelector('.sh-player__menu--tracks');
        if (!this._hls) {
            menu.innerHTML = '<p>Non disponible en mode direct</p>';
            return;
        }

        let html = '<h4>Audio</h4>';
        this._hls.audioTracks.forEach((track, i) => {
            html += `<button class="sh-menu-item ${this._hls.audioTrack === i ? 'active' : ''}" data-type="audio" data-index="${i}">${track.name || `Piste ${i}`} ${track.lang ? `(${track.lang})` : ''}</button>`;
        });

        html += '<h4>Sous-titres</h4>';
        html += `<button class="sh-menu-item ${this._hls.subtitleTrack === -1 ? 'active' : ''}" data-type="sub" data-index="-1">Désactivés</button>`;
        this._hls.subtitleTracks.forEach((track, i) => {
            html += `<button class="sh-menu-item ${this._hls.subtitleTrack === i ? 'active' : ''}" data-type="sub" data-index="${i}">${track.name || `Piste ${i}`} ${track.lang ? `(${track.lang})` : ''}</button>`;
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
            menu.innerHTML = '<p>Auto (Direct)</p>';
            return;
        }

        let html = '<h4>Qualité</h4>';
        html += `<button class="sh-menu-item ${this._hls.autoLevelEnabled ? 'active' : ''}" data-index="-1">Automatique</button>`;

        // Trier les niveaux par résolution (du plus bas au plus haut)
        const sortedLevels = [...this._hls.levels].sort((a, b) => (a.height || 0) - (b.height || 0));
        
        sortedLevels.forEach((level, i) => {
            const originalIndex = this._hls.levels.indexOf(level);
            const height = level.height || 'N/A';
            const bitrate = level.bitrate ? Math.round(level.bitrate / 1000) : 'N/A';
            const codec = level.codecSet || 'H.264';
            const label = `${height}p (${bitrate} kbps) - ${codec}`;
            const isActive = !this._hls.autoLevelEnabled && this._hls.currentLevel === originalIndex;
            
            html += `<button class="sh-menu-item ${isActive ? 'active' : ''}" data-index="${originalIndex}">${label}</button>`;
        });

        // Ajouter info sur la qualité actuelle
        const currentLevel = this._hls.levels[this._hls.currentLevel];
        if (currentLevel) {
            html += `<div class="sh-quality-info">
                <span>Actuel: ${currentLevel.height || 'N/A'}p</span>
                <span>Bitrate: ${currentLevel.bitrate ? Math.round(currentLevel.bitrate / 1000) : 'N/A'} kbps</span>
            </div>`;
        }

        menu.innerHTML = html;
        menu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                if (idx === -1) {
                    this._hls.currentLevel = -1; // Auto
                    this._hls.autoLevelSwitching = true;
                } else {
                    this._hls.currentLevel = idx;
                    this._hls.autoLevelSwitching = false;
                }
                menu.style.display = 'none';
            });
        });
    }

    _applySubtitleOffset() {
        // Implémentation réelle du décalage des sous-titres
        if (!this._hls) {
            this._log.warn('Décalage sous-titres non disponible sans HLS');
            return;
        }

        // Utiliser le middleware HLS.js pour le décalage
        if (!this._subtitleOffsetMiddleware) {
            this._subtitleOffsetMiddleware = {
                onFragParsed: (event, data) => {
                    if (this._subOffset !== 0) {
                        // Modifier les timestamps des segments de sous-titres
                        const samples = data.frag.samples;
                        if (samples) {
                            samples.forEach(sample => {
                                if (sample.pts !== undefined) {
                                    sample.pts += this._subOffset;
                                }
                            });
                        }
                    }
                }
            };
            this._hls.on(Hls.Events.FRAG_PARSED, this._subtitleOffsetMiddleware.onFragParsed);
        }

        // Pour les pistes natives du navigateur (fallback)
        for (let i = 0; i < this._video.textTracks.length; i++) {
            const track = this._video.textTracks[i];
            if (track.mode === 'showing') {
                const cues = track.cues;
                if (cues) {
                    for (let j = 0; j < cues.length; j++) {
                        const cue = cues[j];
                        cue.startTime = Math.max(0, cue.startTime + this._subOffset);
                        cue.endTime = Math.max(0, cue.endTime + this._subOffset);
                    }
                }
            }
        }

        this._log.info(`Décalage sous-titres appliqué: ${this._subOffset}s`);
    }

    _reportPlaybackStart() {
        if (!this._currentItem) return;
        const serverUrl = this._auth.getServerUrl();
        fetch(`${serverUrl}/Sessions/Playing`, {
            method: 'POST',
            headers: this._auth.getAuthHeaders(),
            body: JSON.stringify({
                ItemId: this._currentItem.Id,
                PlayMethod: 'Transcode'
            })
        }).catch(() => {});
    }

    _startProgressReporting() {
        this._stopProgressReporting();
        this._progressInterval = setInterval(() => {
            if (!this._video || !this._currentItem || this._video.paused) return;
            const serverUrl = this._auth.getServerUrl();
            const positionTicks = Math.round(this._video.currentTime * 10000000);

            fetch(`${serverUrl}/Sessions/Playing/Progress`, {
                method: 'POST',
                headers: this._auth.getAuthHeaders(),
                body: JSON.stringify({
                    ItemId: this._currentItem.Id,
                    PositionTicks: positionTicks,
                    IsPaused: this._video.paused,
                    PlayMethod: 'Transcode'
                })
            }).catch(() => {});
        }, 5000);
    }

    _stopProgressReporting() {
        if (this._progressInterval) {
            clearInterval(this._progressInterval);
            this._progressInterval = null;
        }
    }

    /**
     * Ferme le lecteur et signale la fin de lecture à Jellyfin.
     */
    close() {
        this._stopProgressReporting();

        if (this._currentItem && this._video) {
            const serverUrl = this._auth.getServerUrl();
            const positionTicks = Math.round(this._video.currentTime * 10000000);
            fetch(`${serverUrl}/Sessions/Playing/Stopped`, {
                method: 'POST',
                headers: this._auth.getAuthHeaders(),
                body: JSON.stringify({
                    ItemId: this._currentItem.Id,
                    PositionTicks: positionTicks
                })
            }).catch(() => {});
        }

        if (this._hls) {
            this._hls.destroy();
            this._hls = null;
        }

        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }

        document.removeEventListener('keydown', this._keyHandler);

        this._el?.remove();
        this._el = null;
        this._video = null;
        this._currentItem = null;

        // Actualiser le dashboard pour mettre à jour "Reprendre la lecture"
        window.SpaceHub?.ui?.dashboard?.refreshAll();
    }

    _escape(str) {
        const d = document.createElement('div');
        d.textContent = String(str || '');
        return d.innerHTML;
    }

    /**
     * Initialise le support Chromecast.
     * @private
     */
    _initChromecast() {
        this._castAvailable = false;
        this._castSession = null;
        this._castContext = null;

        // Vérifier si l'API Cast est disponible
        if (!window.chrome || !window.chrome.cast || !window.chrome.cast.framework) {
            this._log.info('Chromecast non disponible');
            return;
        }

        try {
            const castContext = cast.framework.CastContext.getInstance();
            const options = new cast.framework.CastOptions.Builder()
                .setReceiverApplicationId(cast.framework.CastContext.DEFAULT_MEDIA_RECEIVER_APP_ID)
                .setAutoJoinPolicy(cast.framework.AutoJoinPolicy.ORIGIN_SCOPED)
                .build();

            castContext.setOptions(options);
            castContext.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (e) => {
                this._onCastSessionChanged(e);
            });

            this._castContext = castContext;
            this._castAvailable = true;
            this._log.info('Chromecast initialisé');

        } catch (err) {
            this._log.warn('Erreur initialisation Chromecast:', err);
        }
    }

    /**
     * Appelé lorsque l'état de session Cast change.
     * @private
     */
    _onCastSessionChanged(e) {
        this._castSession = this._castContext.getCurrentSession();
        
        if (this._castSession) {
            this._log.info('Session Cast active');
            this._el.querySelector('.sh-player__btn-cast').textContent = '📺 (Actif)';
        } else {
            this._log.info('Session Cast terminée');
            this._el.querySelector('.sh-player__btn-cast').textContent = '📺';
        }
    }

    /**
     * Bascule le casting sur Chromecast.
     * @private
     */
    _toggleCast() {
        if (!this._castContext) return;

        if (this._castSession) {
            // Arrêter le casting
            this._castSession.endSession(true);
            return;
        }

        // Démarrer le casting
        if (!this._currentItem) return;

        const serverUrl = this._auth.getServerUrl();
        const token = this._auth.getToken();
        const mediaUrl = `${serverUrl}/Videos/${this._currentItem.Id}/master.m3u8?api_key=${token}`;

        const mediaInfo = new chrome.cast.media.MediaInfo(mediaUrl, 'application/x-mpegurl');
        mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
        mediaInfo.metadata.title = this._currentItem.Name;
        mediaInfo.metadata.subtitle = this._currentItem.SeriesName ? 
            `${this._currentItem.SeriesName} - S${this._currentItem.ParentIndexNumber || 1}E${this._currentItem.IndexNumber || 1}` : '';

        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        request.autoplay = true;

        this._castContext.getCurrentSession()?.loadMedia(request).catch(err => {
            this._log.error('Erreur casting:', err);
            window.SpaceHub?.ui?.components?.toaster?.error('Erreur lors du casting');
        });
    }

    _injectStyles() {
        if (document.getElementById('sh-player-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-player-styles';
        style.textContent = `
#sh-video-player-overlay {
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 10000;
    font-family: var(--sh-font-family, sans-serif);
}

.sh-player__video-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}

.sh-player__video {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.sh-player__ui {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: radial-gradient(circle, transparent 20%, rgba(0,0,0,0.4) 100%);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    opacity: 1;
    transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.sh-player__header {
    padding: var(--sh-space-4, 20px) var(--sh-space-6, 32px);
    background: linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%);
    display: flex;
    align-items: center;
    gap: 20px;
}

.sh-player__title {
    margin: 0;
    color: #fff;
    font-size: 20px;
    font-weight: 700;
}

.sh-player__subtitle {
    margin: 4px 0 0;
    color: rgba(255,255,255,0.7);
    font-size: 13px;
}

.sh-player__center-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 40px;
}

.sh-player__center-btn {
    background: rgba(255,255,255,0.1);
    border: none;
    color: #fff;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    font-size: 24px;
    cursor: pointer;
    backdrop-filter: blur(10px);
    transition: all 0.2s ease;
}

.sh-player__center-btn:hover {
    background: rgba(255,255,255,0.25);
    transform: scale(1.1);
}

.sh-player__toggle-play {
    width: 80px;
    height: 80px;
    font-size: 32px;
    background: var(--sh-color-primary, #7c6aff);
}

.sh-player__footer {
    padding: 20px 32px 32px;
    background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%);
}

.sh-player__progress-container {
    cursor: pointer;
    padding: 10px 0;
    margin-bottom: 12px;
}

.sh-player__progress-bar {
    height: 4px;
    background: rgba(255,255,255,0.2);
    border-radius: 2px;
    position: relative;
    transition: height 0.2s;
}

.sh-player__progress-container:hover .sh-player__progress-bar {
    height: 6px;
}

.sh-player__progress-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--sh-color-primary, #7c6aff);
    border-radius: 2px;
    width: 0%;
}

.sh-player__time-display {
    display: flex;
    justify-content: space-between;
    color: rgba(255,255,255,0.6);
    font-size: 12px;
    margin-top: 8px;
}

.sh-player__bottom-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.sh-player__actions-left, .sh-player__actions-right {
    display: flex;
    align-items: center;
    gap: 16px;
}

.sh-player__btn {
    background: transparent;
    border: none;
    color: #fff;
    font-size: 20px;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.2s;
}

.sh-player__btn:hover {
    opacity: 1;
}

.sh-player__volume-slider {
    width: 100px;
    cursor: pointer;
}

/* Menus */
.sh-player__menu {
    position: absolute;
    bottom: 100px;
    right: 32px;
    background: var(--sh-bg-glass, rgba(20, 20, 25, 0.95));
    backdrop-filter: blur(25px);
    border: 1px solid var(--sh-border-color);
    border-radius: 16px;
    padding: 16px;
    width: 240px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 10;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
}

.sh-player__menu h4 {
    margin: 0 0 12px 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--sh-text-muted);
}

.sh-menu-item {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: #fff;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    margin-bottom: 4px;
}

.sh-menu-item:hover {
    background: rgba(255,255,255,0.1);
}

.sh-menu-item.active {
    background: var(--sh-color-primary);
}

.sh-player__offset-ctrl {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}

.sh-player__offset-val {
    font-weight: 600;
    font-size: 16px;
    color: var(--sh-color-primary);
}
        `;
        document.head.appendChild(style);
    }
}

export default VideoPlayer;
