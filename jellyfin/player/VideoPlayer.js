/**
 * SpaceHub — Standalone Cinema Video Player (Apple TV Pro)
 * Version: 1.2.0
 *
 * Lecteur vidéo plein écran cinématique de niveau Apple TV+ 4K & QuickTime Pro.
 * Supporte :
 *  - Streaming adaptatif HLS (hls.js) et Direct Play 4K UHD / Dolby Vision
 *  - Floating Glass Island HUD avec autohide intelligent (3.5s)
 *  - Timeline liquide multi-couches avec scrubbing preview au survol
 *  - Popover Audio & Sous-titres Apple Ice Blue avec sélecteur de flux
 *  - Synchronisation et décalage temporel des sous-titres en direct (Sync Offset ±100ms / ±500ms)
 *  - Recherche et téléchargement distant de sous-titres via l'API Jellyfin
 *  - Bouton intelligent "Passer l'intro" (Smart Skip Intro)
 *  - Compte à rebours automatique pour l'épisode suivant (Next Episode Auto-Play)
 *  - Raccourcis clavier cinématiques et grands indicateurs OSD centrés à l'écran
 *  - Rapport de session Jellyfin (/Sessions/Playing, /Progress, /Stopped)
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
        this._idleTimer = null;
        this._isControlsVisible = true;
        this._isScrubbing = false;

        // Préférences & États
        this._volume = parseFloat(localStorage.getItem('SpaceHub_player_volume') ?? '1.0');
        this._playbackRate = parseFloat(localStorage.getItem('SpaceHub_playback_speed') ?? '1.0');
        this._subOffset = 0.0; // Décalage en secondes
        this._selectedAudioIndex = null;
        this._selectedSubIndex = -1;
        this._aspectRatioIndex = 0;
        this._aspectRatios = ['contain', 'cover', 'fill'];
        this._nextEpisode = null;
        this._nextEpCountdownInterval = null;
        this._nextEpRemaining = 5;

        // Popovers ouverts
        this._activePopover = null;

        this._injectStyles();
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    get _api() {
        return window.SpaceHub?.jellyfin?.api;
    }

    /**
     * Lance la lecture d'un média Jellyfin.
     * @param {Object} item - Média (Film, Épisode, Vidéo)
     * @param {number} [startPositionTicks=0]
     */
    async play(item, startPositionTicks = 0) {
        this._currentItem = item;
        this._log.info(`🎬 Lancement Apple TV Pro Player pour "${item.Name || item.title}" (ID: ${item.Id || item.id})...`);

        // Charger les métadonnées complètes et flux si nécessaire
        let fullItem = item;
        if ((!item.MediaStreams || !item.Chapters) && this._api && (item.Id || item.id)) {
            try {
                const fetched = await this._api.getItem(item.Id || item.id);
                if (fetched) fullItem = { ...item, ...fetched };
            } catch (e) {
                this._log.warn('Impossible de charger les flux détaillés:', e);
            }
        }
        this._currentItem = fullItem;

        this._createPlayerDOM(fullItem);
        this._initMediaStreams(fullItem);
        this._prepareNextEpisode(fullItem);

        const serverUrl = this._auth?.getServerUrl() || '';
        const token = this._auth?.getToken() || '';
        const itemId = fullItem.Id || fullItem.id;
        const startPositionSeconds = (startPositionTicks || fullItem.UserData?.PlaybackPositionTicks || 0) / 10000000;

        // URL de flux vidéo HLS Master Playlist
        const streamUrl = `${serverUrl}/Videos/${itemId}/master.m3u8?DeviceId=${this._auth?.getDeviceId?.() || 'sh_web'}&MediaSourceId=${itemId}&VideoCodec=h264,hevc,vp9,av1&AudioCodec=aac,mp3,opus,flac&TranscodingMaxAudioChannels=6&RequireAvc=false&Tag=${fullItem.Etag || ''}&StartTimeTicks=${Math.round(startPositionSeconds * 10000000)}&api_key=${token}`;

        this._setupVideoSource(streamUrl, startPositionSeconds, token);
        this._reportPlaybackStart();
        this._startProgressReporting();
        this._resetIdleTimer();
    }

    _setupVideoSource(streamUrl, startPositionSeconds, token) {
        if (Hls.isSupported()) {
            if (this._hls) this._hls.destroy();
            this._hls = new Hls({
                capLevelToPlayerSize: true,
                autoStartLoad: true,
                xhrSetup: (xhr) => {
                    if (token) xhr.setRequestHeader('Authorization', `MediaBrowser Token="${token}"`);
                }
            });

            this._hls.loadSource(streamUrl);
            this._hls.attachMedia(this._video);

            this._hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this._video.playbackRate = this._playbackRate;
                this._video.volume = this._volume;
                this._video.play().catch(e => this._log.warn('Auto-play empêché:', e));
            });

            this._hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    this._log.warn('Erreur fatale HLS, bascule sur flux direct:', data);
                    this._fallbackDirectStream(startPositionSeconds, token);
                }
            });
        } else if (this._video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari natif
            this._video.src = streamUrl;
            this._video.addEventListener('loadedmetadata', () => {
                this._video.currentTime = startPositionSeconds;
                this._video.playbackRate = this._playbackRate;
                this._video.volume = this._volume;
                this._video.play().catch(e => this._log.warn('Auto-play Safari:', e));
            });
        } else {
            this._fallbackDirectStream(startPositionSeconds, token);
        }
    }

    _fallbackDirectStream(startPositionSeconds, token) {
        const serverUrl = this._auth?.getServerUrl() || '';
        const itemId = this._currentItem.Id || this._currentItem.id;
        this._video.src = `${serverUrl}/Videos/${itemId}/stream?static=true&api_key=${token}`;
        this._video.currentTime = startPositionSeconds;
        this._video.playbackRate = this._playbackRate;
        this._video.volume = this._volume;
        this._video.play().catch(e => this._log.warn('Auto-play direct:', e));
    }

    _initMediaStreams(item) {
        const streams = item.MediaStreams || [];
        this._audioStreams = streams.filter(s => s.Type === 'Audio');
        this._subStreams = streams.filter(s => s.Type === 'Subtitle');

        // Piste audio par défaut
        const defaultAudio = this._audioStreams.find(s => s.IsDefault) || this._audioStreams[0];
        this._selectedAudioIndex = defaultAudio ? defaultAudio.Index : (this._audioStreams[0]?.Index ?? 0);

        // Sous-titre par défaut (forcé ou langue préférée)
        const defaultSub = this._subStreams.find(s => s.IsForced || s.IsDefault);
        this._selectedSubIndex = defaultSub ? defaultSub.Index : -1;
    }

    async _prepareNextEpisode(item) {
        this._nextEpisode = null;
        if (item.Type === 'Episode' && item.SeriesId && this._api) {
            try {
                const episodes = await this._api.getEpisodes(item.SeriesId, item.SeasonId);
                if (Array.isArray(episodes)) {
                    const currentIndex = episodes.findIndex(e => e.Id === item.Id || (e.IndexNumber === item.IndexNumber && e.ParentIndexNumber === item.ParentIndexNumber));
                    if (currentIndex !== -1 && currentIndex + 1 < episodes.length) {
                        this._nextEpisode = episodes[currentIndex + 1];
                    }
                }
            } catch (err) {
                this._log.debug('Pas de prochain épisode résolu:', err);
            }
        }
    }

    _createPlayerDOM(item) {
        this.close(false);

        const title = item.Name || item.title || 'Média';
        const isEpisode = item.Type === 'Episode' || item.SeriesName;
        const episodeSub = isEpisode 
            ? `${item.SeriesName || 'Série'} · S${String(item.ParentIndexNumber || 1).padStart(2, '0')}E${String(item.IndexNumber || 1).padStart(2, '0')} « ${title} »`
            : (item.ProductionYear ? `${item.ProductionYear} · ${item.OfficialRating || '4K Ultra HD'}` : 'Film');

        this._el = document.createElement('div');
        this._el.id = 'sh-cinema-player';
        this._el.className = 'sh-cinema-player';
        this._el.innerHTML = `
            <!-- Conteneur Vidéo Principal -->
            <video class="sh-cinema-video" playsinline preload="auto"></video>

            <!-- Dégradé Cinématique Supérieur -->
            <div class="sh-player-gradient-top"></div>
            <!-- Dégradé Cinématique Inférieur -->
            <div class="sh-player-gradient-bottom"></div>

            <!-- 🍏 Top Bar : Retour, Titres & Badges 4K -->
            <header class="sh-player-topbar">
                <button class="sh-player-back-btn" id="sh-player-back-btn" title="Fermer (Échap)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    <span>Retour</span>
                </button>

                <div class="sh-player-title-box">
                    <h2 class="sh-player-main-title">${this._escape(isEpisode ? (item.SeriesName || title) : title)}</h2>
                    <p class="sh-player-sub-title">${this._escape(episodeSub)}</p>
                </div>

                <div class="sh-player-badges-group">
                    <span class="sh-pbadge sh-pbadge--gold">4K DOLBY VISION</span>
                    <span class="sh-pbadge sh-pbadge--blue">ATMOS 7.1</span>
                    <span class="sh-pbadge">IMAX ENHANCED</span>
                </div>

                <div class="sh-player-top-actions">
                    <button class="sh-player-icon-btn" id="sh-btn-aspect" title="Format d'image (16:9, 21:9)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>
                    </button>
                    <button class="sh-player-icon-btn" id="sh-btn-pip" title="Picture-in-Picture">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><rect width="8" height="6" x="12" y="12" rx="1" fill="currentColor"/></svg>
                    </button>
                    <button class="sh-player-icon-btn" id="sh-btn-fullscreen" title="Plein écran (F)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                    </button>
                </div>
            </header>

            <!-- 🌟 Centre Flash OSD (Overlay éphémère lors des raccourcis) -->
            <div class="sh-player-flash-osd" id="sh-player-osd">
                <span class="sh-osd-icon" id="sh-osd-icon">🔊</span>
                <span class="sh-osd-text" id="sh-osd-text">75%</span>
                <div class="sh-osd-bar-wrap" id="sh-osd-bar-wrap">
                    <div class="sh-osd-bar-fill" id="sh-osd-bar-fill"></div>
                </div>
            </div>

            <!-- ⏭️ Smart Skip Intro Pill -->
            <button class="sh-smart-skip-btn" id="sh-smart-skip-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="3"/></svg>
                <span>Passer l'introduction</span>
            </button>

            <!-- 📺 Next Episode Auto-Play Card -->
            <div class="sh-next-ep-card" id="sh-next-ep-card">
                <div class="sh-next-ep-card__inner">
                    <div class="sh-next-ep-card__thumb">
                        <img id="sh-next-ep-img" src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=300" alt="Prochain épisode"/>
                        <div class="sh-next-ep-countdown-circle">
                            <span id="sh-next-ep-sec">5</span>
                        </div>
                    </div>
                    <div class="sh-next-ep-card__info">
                        <span class="sh-next-ep-tag">ÉPISODE SUIVANT</span>
                        <h4 class="sh-next-ep-title" id="sh-next-ep-title">S01E04 · « The Next Chapter »</h4>
                    </div>
                    <div class="sh-next-ep-card__actions">
                        <button class="sh-next-ep-play-btn" id="sh-next-ep-play-now">Lancer</button>
                        <button class="sh-next-ep-cancel-btn" id="sh-next-ep-cancel">✕</button>
                    </div>
                </div>
            </div>

            <!-- 🍏 Bottom Floating Island Controls -->
            <div class="sh-player-bottom-wrap">
                <!-- Timeline Liquide Multi-couches -->
                <div class="sh-timeline-container" id="sh-timeline-container">
                    <span class="sh-timeline-time" id="sh-time-elapsed">00:00:00</span>
                    
                    <div class="sh-timeline-track-wrap" id="sh-timeline-track">
                        <div class="sh-timeline-buffer" id="sh-timeline-buffer"></div>
                        <div class="sh-timeline-played" id="sh-timeline-played"></div>
                        <div class="sh-timeline-handle" id="sh-timeline-handle"></div>
                        
                        <!-- Tooltip Scrubbing au survol -->
                        <div class="sh-timeline-tooltip" id="sh-timeline-tooltip">
                            <span id="sh-tooltip-time">00:00:00</span>
                        </div>
                    </div>

                    <span class="sh-timeline-time sh-timeline-time--rem" id="sh-time-remaining">-00:00:00</span>
                </div>

                <!-- Capsule Flottante Glass HUD -->
                <div class="sh-floating-island-hud">
                    <!-- Contrôle Volume Coulissant -->
                    <div class="sh-hud-volume-group">
                        <button class="sh-hud-btn" id="sh-btn-volume" title="Volume / Muet (M)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                        </button>
                        <div class="sh-volume-slider-wrap">
                            <input type="range" class="sh-volume-range" id="sh-volume-range" min="0" max="1" step="0.02" value="${this._volume}">
                        </div>
                    </div>

                    <!-- Transport Central : Saut -10s, Play/Pause Géant, Saut +10s -->
                    <div class="sh-hud-transport-center">
                        <button class="sh-hud-btn sh-hud-btn--skip" id="sh-btn-skip-back" title="Reculer de 10s (← ou J)">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                            <span class="sh-skip-num">10</span>
                        </button>

                        <button class="sh-hud-play-btn" id="sh-btn-play-pause" title="Lecture / Pause (Espace)">
                            <svg class="sh-icon-play" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                            <svg class="sh-icon-pause" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        </button>

                        <button class="sh-hud-btn sh-hud-btn--skip" id="sh-btn-skip-fwd" title="Avancer de 10s (→ ou L)">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                            <span class="sh-skip-num">10</span>
                        </button>
                    </div>

                    <!-- Contrôles Droite : Audio/Subs, Vitesse, Qualité -->
                    <div class="sh-hud-right-actions">
                        <!-- Popover Audio & Sous-titres -->
                        <div class="sh-popover-anchor">
                            <button class="sh-hud-btn sh-hud-btn--pill" id="sh-btn-audio-sub-toggle" title="Pistes Audio & Sous-Titres (S)">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                <span>Audio & Subs</span>
                            </button>

                            <!-- Menu Popover Audio & Sous-titres Apple Ice Blue -->
                            <div class="sh-ice-popover" id="sh-popover-audio-sub">
                                <div class="sh-popover-header">
                                    <span class="sh-popover-title">Pistes & Sous-Titres</span>
                                </div>
                                <div class="sh-popover-sections sh-scrollbar">
                                    <!-- Section Audio -->
                                    <div class="sh-popover-sec">
                                        <label class="sh-popover-sec-label">PISTES AUDIO</label>
                                        <div class="sh-popover-list" id="sh-audio-stream-list">
                                            <p class="sh-popover-empty">Chargement des pistes...</p>
                                        </div>
                                    </div>

                                    <!-- Section Sous-Titres -->
                                    <div class="sh-popover-sec">
                                        <label class="sh-popover-sec-label">SOUS-TITRES</label>
                                        <div class="sh-popover-list" id="sh-sub-stream-list">
                                            <p class="sh-popover-empty">Chargement des sous-titres...</p>
                                        </div>
                                    </div>

                                    <!-- Ajustement Décalage Temporel (Sync Offset) -->
                                    <div class="sh-popover-sec sh-popover-sec--offset">
                                        <label class="sh-popover-sec-label">SYNCHRONISATION SOUS-TITRES</label>
                                        <div class="sh-offset-controls-grid">
                                            <button class="sh-offset-btn" data-offset="-0.5">-0.5s</button>
                                            <button class="sh-offset-btn" data-offset="-0.1">-0.1s</button>
                                            <button class="sh-offset-btn sh-offset-btn--reset" data-offset="0">0.0s (Réinit)</button>
                                            <button class="sh-offset-btn" data-offset="+0.1">+0.1s</button>
                                            <button class="sh-offset-btn" data-offset="+0.5">+0.5s</button>
                                        </div>
                                        <p class="sh-offset-current-label">Décalage actuel : <strong id="sh-offset-val-txt">0.0s</strong></p>
                                    </div>

                                    <!-- Recherche de sous-titres en ligne -->
                                    <div class="sh-popover-sec">
                                        <button class="sh-remote-sub-search-btn" id="sh-btn-search-online-subs">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                            <span>Rechercher de nouveaux sous-titres en ligne...</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Popover Vitesse de Lecture -->
                        <div class="sh-popover-anchor">
                            <button class="sh-hud-btn" id="sh-btn-speed-toggle" title="Vitesse de lecture (C)">
                                <span class="sh-speed-txt" id="sh-speed-badge">${this._playbackRate}x</span>
                            </button>
                            <div class="sh-ice-popover sh-ice-popover--compact" id="sh-popover-speed">
                                <div class="sh-popover-header"><span class="sh-popover-title">Vitesse</span></div>
                                <div class="sh-popover-list">
                                    <button class="sh-pop-opt ${this._playbackRate === 0.75 ? 'selected' : ''}" data-speed="0.75">0.75x</button>
                                    <button class="sh-pop-opt ${this._playbackRate === 1.0 ? 'selected' : ''}" data-speed="1.0">1.0x (Normal)</button>
                                    <button class="sh-pop-opt ${this._playbackRate === 1.25 ? 'selected' : ''}" data-speed="1.25">1.25x</button>
                                    <button class="sh-pop-opt ${this._playbackRate === 1.5 ? 'selected' : ''}" data-speed="1.5">1.5x</button>
                                    <button class="sh-pop-opt ${this._playbackRate === 2.0 ? 'selected' : ''}" data-speed="2.0">2.0x</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this._el);
        this._video = this._el.querySelector('.sh-cinema-video');

        this._bindEvents();
        this._populateAudioAndSubsLists();

        if (this._el.requestFullscreen) {
            this._el.requestFullscreen().catch(() => {});
        }
    }

    _bindEvents() {
        const el = this._el;
        const video = this._video;

        // Retour / Fermeture
        el.querySelector('#sh-player-back-btn')?.addEventListener('click', () => this.close());

        // Inactivité souris (HUD autohide)
        el.addEventListener('mousemove', () => this._onUserActivity());
        el.addEventListener('mousedown', () => this._onUserActivity());
        el.addEventListener('touchstart', () => this._onUserActivity(), { passive: true });

        // Play / Pause
        const playPauseBtn = el.querySelector('#sh-btn-play-pause');
        const togglePlay = () => {
            if (video.paused) {
                video.play();
                this._showFlashOSD('▶', 'Lecture');
            } else {
                video.pause();
                this._showFlashOSD('⏸', 'Pause');
            }
        };
        playPauseBtn?.addEventListener('click', togglePlay);
        video.addEventListener('click', (e) => {
            if (e.target === video) togglePlay();
        });
        video.addEventListener('dblclick', () => this._toggleFullscreen());

        video.addEventListener('play', () => {
            el.querySelector('.sh-icon-play').style.display = 'none';
            el.querySelector('.sh-icon-pause').style.display = 'block';
        });
        video.addEventListener('pause', () => {
            el.querySelector('.sh-icon-play').style.display = 'block';
            el.querySelector('.sh-icon-pause').style.display = 'none';
            this._showControls();
        });

        // Sauts -10s / +10s
        el.querySelector('#sh-btn-skip-back')?.addEventListener('click', () => {
            video.currentTime = Math.max(0, video.currentTime - 10);
            this._showFlashOSD('⏪', '-10s');
        });
        el.querySelector('#sh-btn-skip-fwd')?.addEventListener('click', () => {
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
            this._showFlashOSD('⏩', '+10s');
        });

        // Timeline & TimeUpdate
        video.addEventListener('timeupdate', () => this._onTimeUpdate());
        video.addEventListener('progress', () => this._onBufferProgress());

        // Scrubbing Timeline
        const trackWrap = el.querySelector('#sh-timeline-track');
        const tooltip = el.querySelector('#sh-timeline-tooltip');
        const tooltipTime = el.querySelector('#sh-tooltip-time');

        const onScrubMove = (e) => {
            const rect = trackWrap.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const targetTime = pos * (video.duration || 0);

            tooltip.style.left = `${pos * 100}%`;
            tooltipTime.textContent = this._formatTime(targetTime);

            if (this._isScrubbing) {
                video.currentTime = targetTime;
                el.querySelector('#sh-timeline-played').style.width = `${pos * 100}%`;
                el.querySelector('#sh-timeline-handle').style.left = `${pos * 100}%`;
            }
        };

        trackWrap.addEventListener('mousemove', onScrubMove);
        trackWrap.addEventListener('mousedown', (e) => {
            this._isScrubbing = true;
            onScrubMove(e);
            const onMouseUp = () => {
                this._isScrubbing = false;
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mouseup', onMouseUp);
        });

        // Volume
        const volumeRange = el.querySelector('#sh-volume-range');
        volumeRange?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            video.volume = v;
            video.muted = false;
            this._volume = v;
            localStorage.setItem('SpaceHub_player_volume', String(v));
            this._showFlashOSD(v === 0 ? '🔇' : '🔊', `${Math.round(v * 100)}%`, v);
        });

        // Aspect Ratio
        el.querySelector('#sh-btn-aspect')?.addEventListener('click', () => {
            this._aspectRatioIndex = (this._aspectRatioIndex + 1) % this._aspectRatios.length;
            const mode = this._aspectRatios[this._aspectRatioIndex];
            video.style.objectFit = mode;
            const labels = { contain: '16:9 / Adapté', cover: '21:9 / Cinéma Zoom', fill: 'Plein écran Étiré' };
            this._showFlashOSD('📐', labels[mode] || mode);
        });

        // Picture-in-Picture
        el.querySelector('#sh-btn-pip')?.addEventListener('click', async () => {
            try {
                if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture();
                } else if (document.pictureInPictureEnabled) {
                    await video.requestPictureInPicture();
                }
            } catch (err) {
                this._log.warn('Erreur PiP:', err);
            }
        });

        // Plein écran
        el.querySelector('#sh-btn-fullscreen')?.addEventListener('click', () => this._toggleFullscreen());

        // Popover Audio / Sous-titres Toggle
        const audioSubBtn = el.querySelector('#sh-btn-audio-sub-toggle');
        const audioSubPop = el.querySelector('#sh-popover-audio-sub');
        audioSubBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._togglePopover(audioSubPop, audioSubBtn);
        });

        // Popover Vitesse Toggle
        const speedBtn = el.querySelector('#sh-btn-speed-toggle');
        const speedPop = el.querySelector('#sh-popover-speed');
        speedBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._togglePopover(speedPop, speedBtn);
        });

        // Clic sur option de vitesse
        speedPop?.querySelectorAll('.sh-pop-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                const spd = parseFloat(opt.dataset.speed);
                video.playbackRate = spd;
                this._playbackRate = spd;
                localStorage.setItem('SpaceHub_playback_speed', String(spd));
                el.querySelector('#sh-speed-badge').textContent = `${spd}x`;
                speedPop.querySelectorAll('.sh-pop-opt').forEach(o => o.classList.toggle('selected', o === opt));
                this._closeAllPopovers();
                this._showFlashOSD('⚡', `${spd}x`);
            });
        });

        // Décalage des sous-titres (Offset Buttons)
        el.querySelectorAll('.sh-offset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const delta = parseFloat(btn.dataset.offset);
                if (delta === 0) this._subOffset = 0;
                else this._subOffset = Math.round((this._subOffset + delta) * 10) / 10;
                
                this._applySubtitleOffset();
                el.querySelector('#sh-offset-val-txt').textContent = `${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s`;
                this._showFlashOSD('⏱️', `Sous-titres ${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s`);
            });
        });

        // Recherche en ligne de sous-titres
        el.querySelector('#sh-btn-search-online-subs')?.addEventListener('click', () => {
            this._closeAllPopovers();
            this._openRemoteSubtitleModal();
        });

        // Smart Skip Intro Click
        el.querySelector('#sh-smart-skip-btn')?.addEventListener('click', () => {
            this._performSkipIntro();
        });

        // Next Episode Actions
        el.querySelector('#sh-next-ep-play-now')?.addEventListener('click', () => {
            if (this._nextEpisode) this.play(this._nextEpisode);
        });
        el.querySelector('#sh-next-ep-cancel')?.addEventListener('click', () => {
            this._cancelNextEpCountdown();
        });

        // Fermer popovers au clic ailleurs
        document.addEventListener('click', this._onDocClick = (e) => {
            if (!e.target.closest('.sh-ice-popover') && !e.target.closest('.sh-hud-btn')) {
                this._closeAllPopovers();
            }
        });

        // Clavier global
        document.addEventListener('keydown', this._keyHandler = (e) => this._onKeyDown(e));
    }

    _populateAudioAndSubsLists() {
        const audioList = this._el.querySelector('#sh-audio-stream-list');
        const subList = this._el.querySelector('#sh-sub-stream-list');

        // Audio
        if (this._audioStreams && this._audioStreams.length > 0) {
            audioList.innerHTML = this._audioStreams.map(s => {
                const isSel = s.Index === this._selectedAudioIndex;
                const lang = (s.Language || 'und').toUpperCase();
                const title = s.DisplayTitle || s.Title || `${lang} (${s.Codec || 'AAC'} ${s.ChannelLayout || 'Stéréo'})`;
                return `
                    <button class="sh-popover-item ${isSel ? 'selected' : ''}" data-audio-idx="${s.Index}">
                        <span class="sh-popover-check">✓</span>
                        <span class="sh-popover-item-name">${this._escape(title)}</span>
                    </button>
                `;
            }).join('');

            audioList.querySelectorAll('.sh-popover-item').forEach(item => {
                item.addEventListener('click', () => {
                    this._selectedAudioIndex = parseInt(item.dataset.audioIdx, 10);
                    audioList.querySelectorAll('.sh-popover-item').forEach(i => i.classList.toggle('selected', i === item));
                    this._showFlashOSD('🔊', item.querySelector('.sh-popover-item-name').textContent);
                    this._closeAllPopovers();
                });
            });
        } else {
            audioList.innerHTML = '<p class="sh-popover-empty">Piste audio standard</p>';
        }

        // Sous-titres
        let subsHtml = `
            <button class="sh-popover-item ${this._selectedSubIndex === -1 ? 'selected' : ''}" data-sub-idx="-1">
                <span class="sh-popover-check">✓</span>
                <span class="sh-popover-item-name">Désactivé</span>
            </button>
        `;

        if (this._subStreams && this._subStreams.length > 0) {
            subsHtml += this._subStreams.map(s => {
                const isSel = s.Index === this._selectedSubIndex;
                const lang = (s.Language || 'und').toUpperCase();
                const title = s.DisplayTitle || s.Title || `${lang} ${s.IsForced ? '(Forcé)' : ''}`;
                return `
                    <button class="sh-popover-item ${isSel ? 'selected' : ''}" data-sub-idx="${s.Index}">
                        <span class="sh-popover-check">✓</span>
                        <span class="sh-popover-item-name">${this._escape(title)}</span>
                    </button>
                `;
            }).join('');
        }

        subList.innerHTML = subsHtml;
        subList.querySelectorAll('.sh-popover-item').forEach(item => {
            item.addEventListener('click', () => {
                this._selectedSubIndex = parseInt(item.dataset.subIdx, 10);
                subList.querySelectorAll('.sh-popover-item').forEach(i => i.classList.toggle('selected', i === item));
                const name = item.querySelector('.sh-popover-item-name').textContent;
                this._showFlashOSD('💬', `Sous-titres : ${name}`);
                this._closeAllPopovers();
            });
        });
    }

    _applySubtitleOffset() {
        if (this._video?.textTracks) {
            for (let i = 0; i < this._video.textTracks.length; i++) {
                const track = this._video.textTracks[i];
                if (track.cues) {
                    for (let j = 0; j < track.cues.length; j++) {
                        const cue = track.cues[j];
                        cue.startTime += this._subOffset;
                        cue.endTime += this._subOffset;
                    }
                }
            }
        }
    }

    _openRemoteSubtitleModal() {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        const itemId = this._currentItem.Id || this._currentItem.id;

        if (!Modal || !this._api || !itemId) {
            window.SpaceHub?.ui?.components?.toaster?.info('Recherche de sous-titres non disponible.');
            return;
        }

        const modal = new Modal({
            id: 'sh-remote-sub-modal',
            title: 'Rechercher des Sous-Titres en Ligne',
            size: 'md',
            content: `
                <div style="padding:16px 0;">
                    <div style="display:flex; gap:8px; margin-bottom:16px;">
                        <input type="text" class="sh-input" id="sh-sub-lang-input" value="fre" placeholder="Code langue (ex: fre, eng)" style="width:120px;"/>
                        <button class="sh-btn sh-btn--primary" id="sh-btn-do-sub-search">Rechercher</button>
                    </div>
                    <div id="sh-sub-search-results" style="max-height:320px; overflow-y:auto;">
                        <p style="color:var(--sh-text-muted); font-size:13px;">Cliquez sur Rechercher pour interroger OpenSubtitles via Jellyfin.</p>
                    </div>
                </div>
            `
        });

        modal.open();

        const resultsEl = modal._el.querySelector('#sh-sub-search-results');
        modal._el.querySelector('#sh-btn-do-sub-search')?.addEventListener('click', async () => {
            const lang = modal._el.querySelector('#sh-sub-lang-input')?.value || 'fre';
            resultsEl.innerHTML = '<p style="color:var(--sh-text-muted); font-size:13px;">Recherche en cours...</p>';
            try {
                const serverUrl = this._auth?.getServerUrl();
                const res = await fetch(`${serverUrl}/Items/${itemId}/RemoteSearch/Subtitles/${lang}`, {
                    headers: this._auth?.getAuthHeaders()
                });
                const subs = await res.json();
                if (!subs || subs.length === 0) {
                    resultsEl.innerHTML = '<p style="color:var(--sh-text-muted); font-size:13px;">Aucun sous-titre trouvé pour cette langue.</p>';
                    return;
                }
                resultsEl.innerHTML = subs.map(s => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; margin-bottom:6px; background:rgba(255,255,255,0.05); border-radius:8px;">
                        <div style="font-size:13px; font-weight:500;">
                            <div>${this._escape(s.Name)}</div>
                            <small style="color:var(--sh-text-muted); font-size:11px;">Format: ${s.Format || 'SRT'} • Source: ${s.ProviderName || 'Web'}</small>
                        </div>
                        <button class="sh-btn sh-btn--sm sh-btn--primary sh-dl-sub-btn" data-sub-id="${s.Id}">Télécharger</button>
                    </div>
                `).join('');

                resultsEl.querySelectorAll('.sh-dl-sub-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        btn.disabled = true;
                        btn.textContent = 'Ajout...';
                        try {
                            await fetch(`${serverUrl}/Items/${itemId}/RemoteSearch/Subtitles/${btn.dataset.subId}`, {
                                method: 'POST',
                                headers: this._auth?.getAuthHeaders()
                            });
                            window.SpaceHub?.ui?.components?.toaster?.success('Sous-titre ajouté avec succès !');
                            modal.close();
                        } catch {
                            btn.textContent = 'Erreur';
                        }
                    });
                });
            } catch (err) {
                resultsEl.innerHTML = `<p style="color:var(--sh-color-danger); font-size:13px;">Erreur : ${err.message}</p>`;
            }
        });
    }

    _performSkipIntro() {
        const chapters = this._currentItem.Chapters || [];
        const introChapter = chapters.find(c => /intro|générique|opening/i.test(c.Name || ''));
        if (introChapter && introChapter.StartPositionTicks) {
            const nextTime = (introChapter.StartPositionTicks / 10000000) + 85;
            this._video.currentTime = nextTime;
        } else {
            this._video.currentTime += 85;
        }
        this._showFlashOSD('⏭️', 'Introduction passée');
        this._el.querySelector('#sh-smart-skip-btn')?.classList.remove('visible');
    }

    _onTimeUpdate() {
        if (!this._video || this._isScrubbing) return;
        const cur = this._video.currentTime || 0;
        const dur = this._video.duration || 0;

        // Horodatages
        this._el.querySelector('#sh-time-elapsed').textContent = this._formatTime(cur);
        this._el.querySelector('#sh-time-remaining').textContent = `-${this._formatTime(Math.max(0, dur - cur))}`;

        // Barres
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        this._el.querySelector('#sh-timeline-played').style.width = `${pct}%`;
        this._el.querySelector('#sh-timeline-handle').style.left = `${pct}%`;

        // Smart Skip Intro Detection (ex: entre 15s et 130s)
        const skipBtn = this._el.querySelector('#sh-smart-skip-btn');
        if (cur >= 15 && cur <= 130) {
            skipBtn?.classList.add('visible');
        } else {
            skipBtn?.classList.remove('visible');
        }

        // Next Episode Countdown (dernières 30 secondes)
        if (dur > 60 && dur - cur <= 30 && this._nextEpisode) {
            this._startNextEpCountdown();
        } else {
            this._hideNextEpCard();
        }
    }

    _onBufferProgress() {
        if (!this._video || !this._video.duration) return;
        const dur = this._video.duration;
        const buf = this._video.buffered;
        if (buf.length > 0) {
            const end = buf.end(buf.length - 1);
            this._el.querySelector('#sh-timeline-buffer').style.width = `${(end / dur) * 100}%`;
        }
    }

    _startNextEpCountdown() {
        const card = this._el.querySelector('#sh-next-ep-card');
        if (!card || card.classList.contains('visible') || this._nextEpCancelled) return;

        card.classList.add('visible');
        const img = card.querySelector('#sh-next-ep-img');
        const title = card.querySelector('#sh-next-ep-title');
        const secTxt = card.querySelector('#sh-next-ep-sec');

        if (this._nextEpisode) {
            title.textContent = `S${String(this._nextEpisode.ParentIndexNumber || 1).padStart(2, '0')}E${String(this._nextEpisode.IndexNumber || 1).padStart(2, '0')} · « ${this._nextEpisode.Name} »`;
            if (this._api) {
                img.src = this._api.getImageUrl(this._nextEpisode.Id, 'Primary', { maxWidth: 200, maxHeight: 120 });
            }
        }

        this._nextEpRemaining = 5;
        secTxt.textContent = '5';

        if (this._nextEpCountdownInterval) clearInterval(this._nextEpCountdownInterval);
        this._nextEpCountdownInterval = setInterval(() => {
            this._nextEpRemaining--;
            secTxt.textContent = String(this._nextEpRemaining);
            if (this._nextEpRemaining <= 0) {
                clearInterval(this._nextEpCountdownInterval);
                if (this._nextEpisode) this.play(this._nextEpisode);
            }
        }, 1000);
    }

    _cancelNextEpCountdown() {
        this._nextEpCancelled = true;
        if (this._nextEpCountdownInterval) clearInterval(this._nextEpCountdownInterval);
        this._hideNextEpCard();
    }

    _hideNextEpCard() {
        this._el?.querySelector('#sh-next-ep-card')?.classList.remove('visible');
    }

    _showFlashOSD(icon, text, progressPct = null) {
        const osd = this._el?.querySelector('#sh-player-osd');
        if (!osd) return;

        osd.querySelector('#sh-osd-icon').textContent = icon;
        osd.querySelector('#sh-osd-text').textContent = text;

        const barWrap = osd.querySelector('#sh-osd-bar-wrap');
        const barFill = osd.querySelector('#sh-osd-bar-fill');
        if (progressPct !== null) {
            barWrap.style.display = 'block';
            barFill.style.width = `${Math.min(100, Math.max(0, progressPct * 100))}%`;
        } else {
            barWrap.style.display = 'none';
        }

        osd.classList.add('visible');
        if (this._osdTimeout) clearTimeout(this._osdTimeout);
        this._osdTimeout = setTimeout(() => {
            osd.classList.remove('visible');
        }, 1200);
    }

    _togglePopover(popover, anchorBtn) {
        if (!popover) return;
        const isOpen = popover.classList.contains('open');
        this._closeAllPopovers();
        if (!isOpen) {
            popover.classList.add('open');
            anchorBtn?.classList.add('active');
            this._activePopover = popover;
        }
    }

    _closeAllPopovers() {
        this._el?.querySelectorAll('.sh-ice-popover').forEach(p => p.classList.remove('open'));
        this._el?.querySelectorAll('.sh-hud-btn').forEach(b => b.classList.remove('active'));
        this._activePopover = null;
    }

    _onUserActivity() {
        this._showControls();
        this._resetIdleTimer();
    }

    _showControls() {
        if (!this._el) return;
        this._el.classList.remove('sh-idle-hidden');
        this._isControlsVisible = true;
    }

    _hideControls() {
        if (!this._el || this._video?.paused || this._activePopover || this._isScrubbing) return;
        this._el.classList.add('sh-idle-hidden');
        this._isControlsVisible = false;
    }

    _resetIdleTimer() {
        if (this._idleTimer) clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => {
            this._hideControls();
        }, 3500);
    }

    _toggleFullscreen() {
        if (!document.fullscreenElement) {
            this._el?.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }

    _onKeyDown(e) {
        if (!this._el || e.target.tagName === 'INPUT') return;

        this._onUserActivity();

        switch (e.key) {
            case ' ':
            case 'k':
            case 'K':
                e.preventDefault();
                if (this._video.paused) this._video.play();
                else this._video.pause();
                break;
            case 'ArrowLeft':
            case 'j':
            case 'J':
                e.preventDefault();
                this._video.currentTime = Math.max(0, this._video.currentTime - (e.shiftKey ? 30 : 10));
                this._showFlashOSD('⏪', `-${e.shiftKey ? 30 : 10}s`);
                break;
            case 'ArrowRight':
            case 'l':
            case 'L':
                e.preventDefault();
                this._video.currentTime = Math.min(this._video.duration || 0, this._video.currentTime + (e.shiftKey ? 30 : 10));
                this._showFlashOSD('⏩', `+${e.shiftKey ? 30 : 10}s`);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this._volume = Math.min(1, this._video.volume + 0.05);
                this._video.volume = this._volume;
                this._showFlashOSD('🔊', `${Math.round(this._volume * 100)}%`, this._volume);
                break;
            case 'ArrowDown':
                e.preventDefault();
                this._volume = Math.max(0, this._video.volume - 0.05);
                this._video.volume = this._volume;
                this._showFlashOSD(this._volume === 0 ? '🔇' : '🔊', `${Math.round(this._volume * 100)}%`, this._volume);
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                this._toggleFullscreen();
                break;
            case 'm':
            case 'M':
                e.preventDefault();
                this._video.muted = !this._video.muted;
                this._showFlashOSD(this._video.muted ? '🔇' : '🔊', this._video.muted ? 'Muet' : `${Math.round(this._volume * 100)}%`);
                break;
            case '[':
                e.preventDefault();
                this._subOffset = Math.round((this._subOffset - 0.1) * 10) / 10;
                this._applySubtitleOffset();
                this._showFlashOSD('⏱️', `Sous-titres ${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s`);
                break;
            case ']':
                e.preventDefault();
                this._subOffset = Math.round((this._subOffset + 0.1) * 10) / 10;
                this._applySubtitleOffset();
                this._showFlashOSD('⏱️', `Sous-titres ${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s`);
                break;
            case 'Escape':
                e.preventDefault();
                this.close();
                break;
        }
    }

    _reportPlaybackStart() {
        if (!this._currentItem) return;
        const serverUrl = this._auth?.getServerUrl();
        const itemId = this._currentItem.Id || this._currentItem.id;
        fetch(`${serverUrl}/Sessions/Playing`, {
            method: 'POST',
            headers: this._auth?.getAuthHeaders(),
            body: JSON.stringify({
                ItemId: itemId,
                PlayMethod: 'Transcode'
            })
        }).catch(() => {});
    }

    _startProgressReporting() {
        this._stopProgressReporting();
        this._progressInterval = setInterval(() => {
            if (!this._video || !this._currentItem || this._video.paused) return;
            const serverUrl = this._auth?.getServerUrl();
            const itemId = this._currentItem.Id || this._currentItem.id;
            const positionTicks = Math.round(this._video.currentTime * 10000000);

            fetch(`${serverUrl}/Sessions/Playing/Progress`, {
                method: 'POST',
                headers: this._auth?.getAuthHeaders(),
                body: JSON.stringify({
                    ItemId: itemId,
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

    close(shouldRefreshDashboard = true) {
        this._stopProgressReporting();
        if (this._idleTimer) clearTimeout(this._idleTimer);
        if (this._nextEpCountdownInterval) clearInterval(this._nextEpCountdownInterval);

        if (this._currentItem && this._video) {
            const serverUrl = this._auth?.getServerUrl();
            const itemId = this._currentItem.Id || this._currentItem.id;
            const positionTicks = Math.round(this._video.currentTime * 10000000);
            fetch(`${serverUrl}/Sessions/Playing/Stopped`, {
                method: 'POST',
                headers: this._auth?.getAuthHeaders(),
                body: JSON.stringify({
                    ItemId: itemId,
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

        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
        if (this._onDocClick) document.removeEventListener('click', this._onDocClick);

        this._el?.remove();
        this._el = null;
        this._video = null;
        this._currentItem = null;

        if (shouldRefreshDashboard) {
            window.SpaceHub?.ui?.dashboard?.refreshAll?.();
        }
    }

    _formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '00:00:00';
        const s = Math.floor(seconds);
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    _escape(str) {
        const d = document.createElement('div');
        d.textContent = String(str || '');
        return d.innerHTML;
    }

    _injectStyles() {
        if (document.getElementById('sh-apple-player-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-apple-player-styles';
        style.textContent = `
/* ═══════════════════════════════════════════════════════════════════════
   🎬 SPACEHUB APPLE TV PRO PLAYER (CINÉMATIQUE 4K)
   ═══════════════════════════════════════════════════════════════════════ */

.sh-cinema-player {
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 100000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
}

.sh-cinema-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
    outline: none;
}

/* ── Dégradés Cinématiques ───────────────────────────────────────────── */
.sh-player-gradient-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 160px;
    background: linear-gradient(to bottom, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
    pointer-events: none;
    z-index: 2;
    transition: opacity 0.35s ease;
}

.sh-player-gradient-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 220px;
    background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);
    pointer-events: none;
    z-index: 2;
    transition: opacity 0.35s ease;
}

/* ── HUD Autohide State ──────────────────────────────────────────────── */
.sh-cinema-player.sh-idle-hidden {
    cursor: none;
}
.sh-cinema-player.sh-idle-hidden .sh-player-topbar,
.sh-cinema-player.sh-idle-hidden .sh-player-bottom-wrap,
.sh-cinema-player.sh-idle-hidden .sh-player-gradient-top,
.sh-cinema-player.sh-idle-hidden .sh-player-gradient-bottom,
.sh-cinema-player.sh-idle-hidden .sh-smart-skip-btn {
    opacity: 0;
    pointer-events: none;
    transform: translateY(12px);
}
.sh-cinema-player.sh-idle-hidden .sh-player-topbar {
    transform: translateY(-12px);
}

/* ── Top Bar ─────────────────────────────────────────────────────────── */
.sh-player-topbar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 24px 32px;
    display: flex;
    align-items: center;
    gap: 20px;
    z-index: 10;
    transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-player-back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 18px;
    background: rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    transition: all 0.2s ease;
}
.sh-player-back-btn:hover {
    background: rgba(255, 255, 255, 0.22);
    transform: scale(1.04);
}

.sh-player-title-box {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.sh-player-main-title {
    margin: 0;
    font-size: 19px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.3px;
    text-shadow: 0 2px 8px rgba(0,0,0,0.6);
}

.sh-player-sub-title {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.75);
}

.sh-player-badges-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 8px;
}

.sh-pbadge {
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.9);
}
.sh-pbadge--gold {
    background: rgba(245, 197, 24, 0.18);
    border-color: rgba(245, 197, 24, 0.35);
    color: #f5c518;
}
.sh-pbadge--blue {
    background: rgba(0, 168, 255, 0.18);
    border-color: rgba(0, 168, 255, 0.35);
    color: #00a8ff;
}

.sh-player-top-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
}

.sh-player-icon-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
}
.sh-player-icon-btn:hover {
    background: rgba(255, 255, 255, 0.24);
    transform: scale(1.08);
}

/* ── Flash OSD ───────────────────────────────────────────────────────── */
.sh-player-flash-osd {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.9);
    padding: 16px 28px;
    background: rgba(18, 18, 24, 0.88);
    backdrop-filter: blur(40px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 20px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    z-index: 100;
    opacity: 0;
    pointer-events: none;
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-player-flash-osd.visible {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
}

.sh-osd-icon { font-size: 32px; }
.sh-osd-text { font-size: 16px; font-weight: 700; color: #fff; text-align: center; }

.sh-osd-bar-wrap {
    width: 140px;
    height: 6px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    overflow: hidden;
}
.sh-osd-bar-fill {
    height: 100%;
    width: 75%;
    background: #00a8ff;
    border-radius: 999px;
    transition: width 0.15s ease;
}

/* ── Smart Skip Intro Button ─────────────────────────────────────────── */
.sh-smart-skip-btn {
    position: absolute;
    bottom: 110px;
    right: 32px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 22px;
    background: rgba(20, 20, 28, 0.92);
    backdrop-filter: blur(28px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 999px;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 12px 36px rgba(0,0,0,0.7), 0 0 20px rgba(0, 168, 255, 0.3);
    z-index: 12;
    opacity: 0;
    pointer-events: none;
    transform: translateY(16px);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-smart-skip-btn.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
}
.sh-smart-skip-btn:hover {
    background: rgba(0, 168, 255, 0.3);
    border-color: #00a8ff;
    transform: scale(1.05);
}

/* ── Next Episode Card ───────────────────────────────────────────────── */
.sh-next-ep-card {
    position: absolute;
    bottom: 110px;
    right: 32px;
    width: 380px;
    background: rgba(15, 15, 22, 0.94);
    backdrop-filter: blur(40px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 20px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.85);
    z-index: 15;
    padding: 14px;
    opacity: 0;
    pointer-events: none;
    transform: translateY(20px);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-next-ep-card.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
}
.sh-next-ep-card__inner {
    display: flex;
    align-items: center;
    gap: 12px;
}
.sh-next-ep-card__thumb {
    position: relative;
    width: 90px;
    height: 56px;
    border-radius: 10px;
    overflow: hidden;
    flex-shrink: 0;
}
.sh-next-ep-card__thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.sh-next-ep-countdown-circle {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 800;
    font-size: 18px;
}
.sh-next-ep-card__info {
    flex: 1;
    min-width: 0;
}
.sh-next-ep-tag {
    font-size: 10px;
    font-weight: 800;
    color: #00a8ff;
    letter-spacing: 0.5px;
}
.sh-next-ep-title {
    margin: 2px 0 0;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.sh-next-ep-card__actions {
    display: flex;
    align-items: center;
    gap: 6px;
}
.sh-next-ep-play-btn {
    padding: 8px 14px;
    background: #00a8ff;
    border: none;
    border-radius: 999px;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}
.sh-next-ep-cancel-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255,255,255,0.12);
    border: none;
    color: #fff;
    cursor: pointer;
}

/* ── Bottom Controls Wrap ────────────────────────────────────────────── */
.sh-player-bottom-wrap {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0 32px 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    z-index: 10;
    transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── Timeline Liquide ────────────────────────────────────────────────── */
.sh-timeline-container {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
}

.sh-timeline-time {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    font-variant-numeric: tabular-nums;
    width: 65px;
}
.sh-timeline-time--rem {
    text-align: right;
    color: rgba(255, 255, 255, 0.6);
}

.sh-timeline-track-wrap {
    position: relative;
    flex: 1;
    height: 24px;
    display: flex;
    align-items: center;
    cursor: pointer;
}
.sh-timeline-track-wrap::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    transition: height 0.2s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-timeline-track-wrap:hover::before {
    height: 8px;
}

.sh-timeline-buffer {
    position: absolute;
    left: 0;
    height: 4px;
    width: 0%;
    background: rgba(255, 255, 255, 0.38);
    border-radius: 999px;
    pointer-events: none;
    transition: height 0.2s;
}
.sh-timeline-track-wrap:hover .sh-timeline-buffer {
    height: 8px;
}

.sh-timeline-played {
    position: absolute;
    left: 0;
    height: 4px;
    width: 0%;
    background: linear-gradient(90deg, #0084ff 0%, #00d2ff 100%);
    border-radius: 999px;
    pointer-events: none;
    box-shadow: 0 0 12px rgba(0, 168, 255, 0.8);
    transition: height 0.2s;
}
.sh-timeline-track-wrap:hover .sh-timeline-played {
    height: 8px;
}

.sh-timeline-handle {
    position: absolute;
    top: 50%;
    left: 0%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 10px rgba(0, 168, 255, 0.9), 0 2px 6px rgba(0,0,0,0.5);
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-timeline-track-wrap:hover .sh-timeline-handle {
    transform: translate(-50%, -50%) scale(1.15);
}

.sh-timeline-tooltip {
    position: absolute;
    bottom: 30px;
    left: 0%;
    transform: translateX(-50%);
    padding: 5px 10px;
    background: rgba(18, 18, 24, 0.95);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
}
.sh-timeline-track-wrap:hover .sh-timeline-tooltip {
    opacity: 1;
}

/* ── Floating Island Glass HUD ───────────────────────────────────────── */
.sh-floating-island-hud {
    align-self: center;
    width: min(840px, 100%);
    height: 64px;
    padding: 0 20px;
    background: rgba(18, 18, 24, 0.88);
    backdrop-filter: blur(36px) saturate(200%);
    -webkit-backdrop-filter: blur(36px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.3);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

/* Volume Group */
.sh-hud-volume-group {
    display: flex;
    align-items: center;
    gap: 8px;
}
.sh-volume-slider-wrap {
    width: 0;
    overflow: hidden;
    transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-hud-volume-group:hover .sh-volume-slider-wrap {
    width: 80px;
}
.sh-volume-range {
    width: 75px;
    height: 4px;
    accent-color: #00a8ff;
    cursor: pointer;
}

/* Transport Center */
.sh-hud-transport-center {
    display: flex;
    align-items: center;
    gap: 16px;
}

.sh-hud-btn {
    position: relative;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-hud-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    transform: scale(1.1);
}
.sh-hud-btn.active {
    color: #00a8ff;
    background: rgba(0, 168, 255, 0.15);
}

.sh-hud-btn--skip {
    width: 44px;
    height: 44px;
}
.sh-skip-num {
    position: absolute;
    font-size: 9px;
    font-weight: 800;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}

.sh-hud-play-btn {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #fff;
    border: none;
    color: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 18px rgba(255, 255, 255, 0.4);
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-hud-play-btn:hover {
    transform: scale(1.12);
}
.sh-hud-play-btn:active {
    transform: scale(0.95);
}

.sh-hud-btn--pill {
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.08);
}
.sh-hud-btn--pill:hover {
    background: rgba(255, 255, 255, 0.18);
}

.sh-speed-txt {
    font-size: 13px;
    font-weight: 700;
}

/* ── Popovers Apple Ice Blue ─────────────────────────────────────────── */
.sh-popover-anchor {
    position: relative;
}

.sh-ice-popover {
    position: absolute;
    bottom: 58px;
    right: 0;
    width: 320px;
    background: rgba(14, 14, 20, 0.96);
    backdrop-filter: blur(40px) saturate(220%);
    -webkit-backdrop-filter: blur(40px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 20px;
    box-shadow: 0 24px 70px rgba(0,0,0,0.9);
    padding: 16px;
    z-index: 200;
    opacity: 0;
    pointer-events: none;
    transform: translateY(12px) scale(0.96);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-ice-popover.open {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0) scale(1);
}
.sh-ice-popover--compact {
    width: 140px;
    padding: 8px;
}

.sh-popover-header {
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: 12px;
}
.sh-popover-title {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
}

.sh-popover-sections {
    max-height: 380px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.sh-popover-sec-label {
    display: block;
    font-size: 10px;
    font-weight: 800;
    color: #00a8ff;
    letter-spacing: 0.6px;
    margin-bottom: 6px;
}

.sh-popover-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.sh-popover-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
}
.sh-popover-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}
.sh-popover-item.selected {
    background: rgba(0, 168, 255, 0.18);
    color: #00a8ff;
    font-weight: 700;
}
.sh-popover-check {
    opacity: 0;
    font-size: 13px;
}
.sh-popover-item.selected .sh-popover-check {
    opacity: 1;
}

.sh-popover-empty {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
    padding: 4px 8px;
}

.sh-pop-opt {
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
}
.sh-pop-opt:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}
.sh-pop-opt.selected {
    background: rgba(0, 168, 255, 0.2);
    color: #00a8ff;
}

/* Subtitle Sync Offset Controls */
.sh-offset-controls-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    margin-top: 4px;
}
.sh-offset-btn {
    padding: 6px 0;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
}
.sh-offset-btn:hover {
    background: rgba(0, 168, 255, 0.25);
    border-color: #00a8ff;
}
.sh-offset-btn--reset {
    grid-column: span 1;
    font-size: 10px;
}
.sh-offset-current-label {
    margin: 6px 0 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
}
.sh-offset-current-label strong {
    color: #00a8ff;
}

.sh-remote-sub-search-btn {
    width: 100%;
    padding: 9px 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.sh-remote-sub-search-btn:hover {
    background: rgba(0, 168, 255, 0.18);
    border-color: #00a8ff;
    color: #00a8ff;
}
        `;
        document.head.appendChild(style);
    }
}

export default VideoPlayer;

