/**
 * SpaceHub — Standalone Cinema Video Player (Apple VisionOS & Apple TV+ Pro)
 * Version: 2.0.0
 *
 * Lecteur vidéo plein écran cinématique de nouvelle génération :
 *  - Design System Apple VisionOS : Verre dépoli 48px blur, reflets spéculaires 1px, noir OLED profond
 *  - Unified Floating Glass Dock : Timeline liquide et commandes fusionnées dans un dock ergonomique
 *  - Micro-interactions & Spring Physics : Rebond élastique du bouton Play/Pause, rotation des sauts 10s
 *  - Double-clic / Double-tap Ripple Waves : Sauts temporels avec ondes visuelles fluides
 *  - Tiroir d'Épisodes Rapide (Episode Quick Picker) : Changement d'épisode instantané sans quitter la vidéo
 *  - Popover Audio & Sous-titres Apple Ice : Sélecteur de flux, codecs Atmos/5.1, sync offset et recherche en ligne
 *  - OSD Gestuel Centré VisionOS : Jauges circulaires luminescentes pour Volume, Luminosité, Vitesse
 *  - HLS adaptatif multi-débits (hls.js), Direct Play 4K UHD Dolby Vision / HDR10 et session reporting Jellyfin
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
        this._subOffset = 0.0;
        this._selectedAudioIndex = null;
        this._selectedSubIndex = -1;
        this._aspectRatioIndex = 0;
        this._aspectRatios = ['contain', 'cover', 'fill'];
        
        // Séries & Épisodes
        this._seasonEpisodes = [];
        this._nextEpisode = null;
        this._prevEpisode = null;
        this._nextEpCountdownInterval = null;
        this._nextEpRemaining = 5;
        this._nextEpCancelled = false;

        // Popovers & Tiroirs
        this._activePopover = null;
        this._isEpisodeDrawerOpen = false;

        // Détection double-clic / tap
        this._lastTapTime = 0;
        this._lastTapSide = null;

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
        this._nextEpCancelled = false;
        this._log.info(`🎬 Lancement Apple VisionOS Player pour "${item.Name || item.title}" (ID: ${item.Id || item.id})...`);

        // Charger les métadonnées complètes et flux si nécessaire
        let fullItem = item;
        const itemId = item.Id || item.id;
        if ((!item.MediaStreams || !item.Chapters) && this._api && itemId) {
            try {
                const fetched = await this._api.getItem(itemId);
                if (fetched) fullItem = { ...item, ...fetched };
            } catch (e) {
                this._log.warn('Impossible de charger les flux détaillés:', e);
            }
        }
        this._currentItem = fullItem;

        this._createPlayerDOM(fullItem);
        this._initMediaStreams(fullItem);
        this._prepareSeasonEpisodes(fullItem);

        const serverUrl = this._auth?.getServerUrl() || '';
        const token = this._auth?.getToken() || '';
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

    async _prepareSeasonEpisodes(item) {
        this._seasonEpisodes = [];
        this._nextEpisode = null;
        this._prevEpisode = null;

        const isEpisode = item.Type === 'Episode' || item.SeriesName;
        if (isEpisode && item.SeriesId && this._api) {
            try {
                const episodes = await this._api.getEpisodes(item.SeriesId, item.SeasonId);
                if (Array.isArray(episodes) && episodes.length > 0) {
                    this._seasonEpisodes = episodes;
                    const currentIndex = episodes.findIndex(e => e.Id === item.Id || (e.IndexNumber === item.IndexNumber && e.ParentIndexNumber === item.ParentIndexNumber));
                    if (currentIndex !== -1) {
                        if (currentIndex + 1 < episodes.length) this._nextEpisode = episodes[currentIndex + 1];
                        if (currentIndex - 1 >= 0) this._prevEpisode = episodes[currentIndex - 1];
                    }
                    this._updateEpisodeNavButtons();
                    this._renderEpisodeDrawerItems();
                }
            } catch (err) {
                this._log.debug('Impossible de charger les épisodes de la saison:', err);
            }
        }
    }

    _updateEpisodeNavButtons() {
        const prevBtn = this._el?.querySelector('#sh-btn-prev-ep');
        const nextBtn = this._el?.querySelector('#sh-btn-next-ep');
        const drawerBtn = this._el?.querySelector('#sh-btn-episodes-drawer');

        if (this._seasonEpisodes.length > 0) {
            if (drawerBtn) drawerBtn.style.display = 'flex';
            if (prevBtn) {
                prevBtn.style.display = 'flex';
                prevBtn.disabled = !this._prevEpisode;
                prevBtn.style.opacity = this._prevEpisode ? '1' : '0.35';
            }
            if (nextBtn) {
                nextBtn.style.display = 'flex';
                nextBtn.disabled = !this._nextEpisode;
                nextBtn.style.opacity = this._nextEpisode ? '1' : '0.35';
            }
        } else {
            if (drawerBtn) drawerBtn.style.display = 'none';
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
        }
    }

    _createPlayerDOM(item) {
        this.close(false);

        const title = item.Name || item.title || 'Média';
        const isEpisode = item.Type === 'Episode' || item.SeriesName;
        const seriesName = item.SeriesName || (isEpisode ? title : '');
        const episodeNumber = isEpisode ? `S${String(item.ParentIndexNumber || 1).padStart(2, '0')}E${String(item.IndexNumber || 1).padStart(2, '0')}` : '';
        const episodeTitle = isEpisode ? (item.Name || title) : '';
        const metaSubtitle = isEpisode 
            ? `${episodeNumber} · « ${episodeTitle} »` 
            : (item.ProductionYear ? `${item.ProductionYear} · ${item.OfficialRating || '4K Ultra HD'}` : 'Film');

        this._el = document.createElement('div');
        this._el.id = 'sh-cinema-player';
        this._el.className = 'sh-cinema-player';
        this._el.innerHTML = `
            <!-- Vidéo Principale -->
            <video class="sh-cinema-video" playsinline preload="auto"></video>

            <!-- Dégradés Cinématiques Supérieur & Inférieur -->
            <div class="sh-player-gradient-top"></div>
            <div class="sh-player-gradient-bottom"></div>

            <!-- Zones Interactives Gauche / Droite pour Double-Tap Ripple -->
            <div class="sh-gesture-tap-zone sh-gesture-left" id="sh-zone-left">
                <div class="sh-ripple-indicator" id="sh-ripple-left">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
                    <span>-10s</span>
                </div>
            </div>
            <div class="sh-gesture-tap-zone sh-gesture-right" id="sh-zone-right">
                <div class="sh-ripple-indicator" id="sh-ripple-right">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
                    <span>+10s</span>
                </div>
            </div>

            <!-- 🍏 Top Bar : Apple VisionOS Floating Pill -->
            <header class="sh-player-topbar">
                <button class="sh-player-back-pill" id="sh-player-back-btn" title="Quitter la lecture (Échap)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    <span>Quitter</span>
                </button>

                <div class="sh-player-title-block">
                    <div class="sh-player-primary-title">${this._escape(isEpisode ? seriesName : title)}</div>
                    <div class="sh-player-secondary-title">${this._escape(metaSubtitle)}</div>
                </div>

                <div class="sh-player-badges-strip">
                    <span class="sh-pbadge-vision sh-pbadge--gold">4K DOLBY VISION</span>
                    <span class="sh-pbadge-vision sh-pbadge--blue">ATMOS 7.1</span>
                    <span class="sh-pbadge-vision">IMAX ENHANCED</span>
                </div>

                <div class="sh-player-top-actions">
                    <button class="sh-top-glass-btn" id="sh-btn-episodes-drawer" title="Liste des épisodes" style="display:none;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        <span>Épisodes</span>
                    </button>
                    <button class="sh-top-glass-btn" id="sh-btn-aspect" title="Format d'image (16:9, 21:9)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>
                    </button>
                    <button class="sh-top-glass-btn" id="sh-btn-pip" title="Fenêtre flottante (PiP)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><rect width="8" height="6" x="12" y="12" rx="1" fill="currentColor"/></svg>
                    </button>
                    <button class="sh-top-glass-btn" id="sh-btn-fullscreen" title="Plein écran (F)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                    </button>
                </div>
            </header>

            <!-- 🌟 Centre Flash OSD (Overlay dynamique à jauge circulaire) -->
            <div class="sh-vision-flash-osd" id="sh-player-osd">
                <div class="sh-osd-glyph-wrap">
                    <span class="sh-osd-glyph" id="sh-osd-icon">▶</span>
                </div>
                <div class="sh-osd-data">
                    <span class="sh-osd-label" id="sh-osd-text">Lecture</span>
                    <div class="sh-osd-progress-track" id="sh-osd-bar-wrap" style="display:none;">
                        <div class="sh-osd-progress-fill" id="sh-osd-bar-fill"></div>
                    </div>
                </div>
            </div>

            <!-- ⏭️ Smart Skip Intro Pill -->
            <button class="sh-vision-skip-intro-btn" id="sh-smart-skip-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="3"/></svg>
                <span>Passer l'introduction</span>
            </button>

            <!-- 📺 Next Episode Auto-Play Card -->
            <div class="sh-next-ep-card-vision" id="sh-next-ep-card">
                <div class="sh-next-ep-card__inner">
                    <div class="sh-next-ep-thumb-wrap">
                        <img id="sh-next-ep-img" src="" alt="Prochain épisode"/>
                        <div class="sh-next-ep-countdown-badge">
                            <span id="sh-next-ep-sec">5</span>
                        </div>
                    </div>
                    <div class="sh-next-ep-details">
                        <span class="sh-next-ep-kicker">ÉPISODE SUIVANT</span>
                        <h4 class="sh-next-ep-name" id="sh-next-ep-title"></h4>
                    </div>
                    <div class="sh-next-ep-btns">
                        <button class="sh-next-ep-launch-btn" id="sh-next-ep-play-now">Lancer</button>
                        <button class="sh-next-ep-dismiss-btn" id="sh-next-ep-cancel" title="Annuler">✕</button>
                    </div>
                </div>
            </div>

            <!-- 🎬 Tiroir Latéral d'Épisodes (Quick Drawer) -->
            <aside class="sh-episodes-drawer-vision" id="sh-episodes-drawer">
                <div class="sh-episodes-drawer-header">
                    <h3>Épisodes de la saison</h3>
                    <button class="sh-drawer-close-btn" id="sh-btn-close-drawer">✕</button>
                </div>
                <div class="sh-episodes-drawer-list sh-scrollbar" id="sh-drawer-episodes-list">
                    <p style="padding:16px; color:rgba(255,255,255,0.5);">Chargement des épisodes...</p>
                </div>
            </aside>

            <!-- 🍏 Unified VisionOS Floating Glass Dock -->
            <div class="sh-player-dock-container">
                <div class="sh-vision-unified-dock">
                    
                    <!-- Ligne 1 : Timeline Liquide Multi-couches -->
                    <div class="sh-dock-timeline-row">
                        <span class="sh-dock-time" id="sh-time-elapsed">00:00:00</span>
                        
                        <div class="sh-dock-track-wrap" id="sh-timeline-track">
                            <div class="sh-dock-track-bg"></div>
                            <div class="sh-dock-track-buffer" id="sh-timeline-buffer"></div>
                            <div class="sh-dock-track-played" id="sh-timeline-played"></div>
                            <div class="sh-dock-track-handle" id="sh-timeline-handle"></div>
                            
                            <!-- Bulle de Scrubbing interactive -->
                            <div class="sh-dock-time-tooltip" id="sh-timeline-tooltip">
                                <span id="sh-tooltip-time">00:00:00</span>
                            </div>
                        </div>

                        <span class="sh-dock-time sh-dock-time--rem" id="sh-time-remaining">-00:00:00</span>
                    </div>

                    <!-- Ligne 2 : Commandes Ergonomiques & Transport -->
                    <div class="sh-dock-controls-row">
                        
                        <!-- Gauche : Contrôle Volume Coulissant -->
                        <div class="sh-dock-group sh-dock-group--left">
                            <div class="sh-volume-expand-pill">
                                <button class="sh-glass-icon-btn" id="sh-btn-volume" title="Volume / Muet (M)">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                                </button>
                                <div class="sh-volume-track-container">
                                    <input type="range" class="sh-vision-slider" id="sh-volume-range" min="0" max="1" step="0.02" value="${this._volume}">
                                </div>
                            </div>
                        </div>

                        <!-- Centre : Transport Principal & Spring Play/Pause -->
                        <div class="sh-dock-group sh-dock-group--center">
                            <!-- Épisode Précédent -->
                            <button class="sh-glass-icon-btn sh-btn-nav-ep" id="sh-btn-prev-ep" title="Épisode précédent" style="display:none;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
                            </button>

                            <!-- Saut -10s -->
                            <button class="sh-glass-icon-btn sh-btn-skip-spring" id="sh-btn-skip-back" title="Reculer de 10s (← ou J)">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                <span class="sh-skip-tag">10</span>
                            </button>

                            <!-- Play/Pause Géant avec Spring Physics & Halo -->
                            <button class="sh-vision-play-pause-btn" id="sh-btn-play-pause" title="Lecture / Pause (Espace)">
                                <svg class="sh-icon-play" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                                <svg class="sh-icon-pause" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                            </button>

                            <!-- Saut +10s -->
                            <button class="sh-glass-icon-btn sh-btn-skip-spring" id="sh-btn-skip-fwd" title="Avancer de 10s (→ ou L)">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                                <span class="sh-skip-tag">10</span>
                            </button>

                            <!-- Épisode Suivant -->
                            <button class="sh-glass-icon-btn sh-btn-nav-ep" id="sh-btn-next-ep" title="Épisode suivant" style="display:none;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                            </button>
                        </div>

                        <!-- Droite : Audio & Subs, Vitesse de Lecture -->
                        <div class="sh-dock-group sh-dock-group--right">
                            
                            <!-- Bouton & Popover Audio & Sous-titres -->
                            <div class="sh-popover-anchor">
                                <button class="sh-glass-pill-btn" id="sh-btn-audio-sub-toggle" title="Pistes Audio & Sous-Titres (S)">
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                    <span>Audio & Subs</span>
                                </button>

                                <div class="sh-vision-popover" id="sh-popover-audio-sub">
                                    <div class="sh-vision-popover-header">
                                        <h4>Pistes Audio & Sous-Titres</h4>
                                    </div>
                                    <div class="sh-vision-popover-body sh-scrollbar">
                                        <!-- Audio -->
                                        <div class="sh-popover-group">
                                            <label class="sh-popover-group-label">PISTES AUDIO</label>
                                            <div class="sh-popover-item-list" id="sh-audio-stream-list">
                                                <p class="sh-popover-empty">Chargement des pistes...</p>
                                            </div>
                                        </div>

                                        <!-- Sous-Titres -->
                                        <div class="sh-popover-group">
                                            <label class="sh-popover-group-label">SOUS-TITRES</label>
                                            <div class="sh-popover-item-list" id="sh-sub-stream-list">
                                                <p class="sh-popover-empty">Chargement des sous-titres...</p>
                                            </div>
                                        </div>

                                        <!-- Sync Offset -->
                                        <div class="sh-popover-group sh-popover-group--offset">
                                            <label class="sh-popover-group-label">SYNCHRONISATION DES SOUS-TITRES</label>
                                            <div class="sh-offset-pill-grid">
                                                <button class="sh-offset-pill" data-offset="-0.5">-0.5s</button>
                                                <button class="sh-offset-pill" data-offset="-0.1">-0.1s</button>
                                                <button class="sh-offset-pill sh-offset-pill--reset" data-offset="0">0.0s (Réinit)</button>
                                                <button class="sh-offset-pill" data-offset="+0.1">+0.1s</button>
                                                <button class="sh-offset-pill" data-offset="+0.5">+0.5s</button>
                                            </div>
                                            <p class="sh-offset-feedback">Décalage actuel : <strong id="sh-offset-val-txt">0.0s</strong></p>
                                        </div>

                                        <!-- Recherche OpenSubtitles -->
                                        <div class="sh-popover-group">
                                            <button class="sh-online-sub-search-btn" id="sh-btn-search-online-subs">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                                <span>Rechercher de nouveaux sous-titres en ligne...</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Vitesse de lecture -->
                            <div class="sh-popover-anchor">
                                <button class="sh-glass-pill-btn sh-glass-pill-btn--speed" id="sh-btn-speed-toggle" title="Vitesse de lecture (C)">
                                    <span id="sh-speed-badge">${this._playbackRate}x</span>
                                </button>
                                <div class="sh-vision-popover sh-vision-popover--speed" id="sh-popover-speed">
                                    <div class="sh-vision-popover-header"><h4>Vitesse</h4></div>
                                    <div class="sh-popover-item-list">
                                        <button class="sh-speed-opt ${this._playbackRate === 0.75 ? 'selected' : ''}" data-speed="0.75">0.75x</button>
                                        <button class="sh-speed-opt ${this._playbackRate === 1.0 ? 'selected' : ''}" data-speed="1.0">1.0x (Normal)</button>
                                        <button class="sh-speed-opt ${this._playbackRate === 1.25 ? 'selected' : ''}" data-speed="1.25">1.25x</button>
                                        <button class="sh-speed-opt ${this._playbackRate === 1.5 ? 'selected' : ''}" data-speed="1.5">1.5x</button>
                                        <button class="sh-speed-opt ${this._playbackRate === 2.0 ? 'selected' : ''}" data-speed="2.0">2.0x</button>
                                    </div>
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

        // Quitter / Retour
        el.querySelector('#sh-player-back-btn')?.addEventListener('click', () => this.close());

        // Inactivité souris (Auto-hide du HUD après 3.5s)
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

        // Simple Clic au centre = Play/Pause
        video.addEventListener('click', (e) => {
            if (e.target === video) togglePlay();
        });

        // Double Clic Gauche / Droite (Saut 10s avec Ripple Waves)
        const leftZone = el.querySelector('#sh-zone-left');
        const rightZone = el.querySelector('#sh-zone-right');

        leftZone?.addEventListener('dblclick', () => this._triggerRippleSkip(-10));
        rightZone?.addEventListener('dblclick', () => this._triggerRippleSkip(10));

        // Touch double-tap sur mobile/tablette
        const handleTap = (side, delta) => {
            const now = Date.now();
            if (now - this._lastTapTime < 300 && this._lastTapSide === side) {
                this._triggerRippleSkip(delta);
            }
            this._lastTapTime = now;
            this._lastTapSide = side;
        };
        leftZone?.addEventListener('touchend', () => handleTap('left', -10));
        rightZone?.addEventListener('touchend', () => handleTap('right', 10));

        video.addEventListener('play', () => {
            el.querySelector('.sh-icon-play').style.display = 'none';
            el.querySelector('.sh-icon-pause').style.display = 'block';
        });
        video.addEventListener('pause', () => {
            el.querySelector('.sh-icon-play').style.display = 'block';
            el.querySelector('.sh-icon-pause').style.display = 'none';
            this._showControls();
        });

        // Sauts 10s via boutons du dock avec micro-animation
        el.querySelector('#sh-btn-skip-back')?.addEventListener('click', (e) => {
            this._animateButtonSpring(e.currentTarget);
            video.currentTime = Math.max(0, video.currentTime - 10);
            this._showFlashOSD('⏪', '-10s');
        });
        el.querySelector('#sh-btn-skip-fwd')?.addEventListener('click', (e) => {
            this._animateButtonSpring(e.currentTarget);
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
            this._showFlashOSD('⏩', '+10s');
        });

        // Navigation Épisode Précédent / Suivant
        el.querySelector('#sh-btn-prev-ep')?.addEventListener('click', () => {
            if (this._prevEpisode) this.play(this._prevEpisode);
        });
        el.querySelector('#sh-btn-next-ep')?.addEventListener('click', () => {
            if (this._nextEpisode) this.play(this._nextEpisode);
        });

        // Tiroir d'Épisodes
        const drawerBtn = el.querySelector('#sh-btn-episodes-drawer');
        const drawer = el.querySelector('#sh-episodes-drawer');
        const closeDrawerBtn = el.querySelector('#sh-btn-close-drawer');

        drawerBtn?.addEventListener('click', () => {
            this._isEpisodeDrawerOpen = !this._isEpisodeDrawerOpen;
            drawer?.classList.toggle('open', this._isEpisodeDrawerOpen);
        });
        closeDrawerBtn?.addEventListener('click', () => {
            this._isEpisodeDrawerOpen = false;
            drawer?.classList.remove('open');
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

        el.querySelector('#sh-btn-volume')?.addEventListener('click', () => {
            video.muted = !video.muted;
            if (video.muted) {
                this._showFlashOSD('🔇', 'Muet');
            } else {
                this._showFlashOSD('🔊', `${Math.round(video.volume * 100)}%`, video.volume);
            }
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
        speedPop?.querySelectorAll('.sh-speed-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                const spd = parseFloat(opt.dataset.speed);
                video.playbackRate = spd;
                this._playbackRate = spd;
                localStorage.setItem('SpaceHub_playback_speed', String(spd));
                el.querySelector('#sh-speed-badge').textContent = `${spd}x`;
                speedPop.querySelectorAll('.sh-speed-opt').forEach(o => o.classList.toggle('selected', o === opt));
                this._closeAllPopovers();
                this._showFlashOSD('⚡', `${spd}x`);
            });
        });

        // Décalage des sous-titres (Offset Buttons)
        el.querySelectorAll('.sh-offset-pill').forEach(btn => {
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

        // Fermer popovers et drawer au clic en dehors
        document.addEventListener('click', this._onDocClick = (e) => {
            if (!e.target.closest('.sh-vision-popover') && !e.target.closest('.sh-glass-pill-btn') && !e.target.closest('.sh-episodes-drawer-vision') && !e.target.closest('#sh-btn-episodes-drawer')) {
                this._closeAllPopovers();
                if (this._isEpisodeDrawerOpen) {
                    this._isEpisodeDrawerOpen = false;
                    el.querySelector('#sh-episodes-drawer')?.classList.remove('open');
                }
            }
        });

        // Clavier global
        document.addEventListener('keydown', this._keyHandler = (e) => this._onKeyDown(e));
    }

    _triggerRippleSkip(deltaSeconds) {
        if (!this._video) return;
        this._video.currentTime = Math.max(0, Math.min(this._video.duration || 0, this._video.currentTime + deltaSeconds));
        
        const isFwd = deltaSeconds > 0;
        const rippleEl = this._el?.querySelector(isFwd ? '#sh-ripple-right' : '#sh-ripple-left');
        if (rippleEl) {
            rippleEl.classList.remove('active');
            void rippleEl.offsetWidth; // Force reflow
            rippleEl.classList.add('active');
        }
        this._showFlashOSD(isFwd ? '⏩' : '⏪', `${isFwd ? '+' : ''}${deltaSeconds}s`);
    }

    _animateButtonSpring(btn) {
        if (!btn) return;
        btn.classList.remove('spring-active');
        void btn.offsetWidth;
        btn.classList.add('spring-active');
    }

    _renderEpisodeDrawerItems() {
        const listEl = this._el?.querySelector('#sh-drawer-episodes-list');
        if (!listEl) return;

        if (this._seasonEpisodes.length === 0) {
            listEl.innerHTML = '<p style="padding:16px; color:rgba(255,255,255,0.5);">Aucun épisode disponible.</p>';
            return;
        }

        const currentId = this._currentItem.Id || this._currentItem.id;

        listEl.innerHTML = this._seasonEpisodes.map(ep => {
            const isCur = ep.Id === currentId;
            const sNum = String(ep.ParentIndexNumber || 1).padStart(2, '0');
            const eNum = String(ep.IndexNumber || 1).padStart(2, '0');
            const thumbUrl = this._api?.getImageUrl?.(ep.Id, 'Primary', { maxWidth: 240, maxHeight: 135 }) || '';

            return `
                <div class="sh-drawer-ep-card ${isCur ? 'active' : ''}" data-ep-id="${ep.Id}">
                    <div class="sh-drawer-ep-thumb">
                        <img src="${thumbUrl}" alt="${ep.Name}" loading="lazy"/>
                        <span class="sh-drawer-ep-pill">S${sNum}E${eNum}</span>
                        ${isCur ? '<div class="sh-drawer-ep-playing">▶ En cours</div>' : ''}
                    </div>
                    <div class="sh-drawer-ep-info">
                        <h4 class="sh-drawer-ep-title">${this._escape(ep.Name)}</h4>
                        <span class="sh-drawer-ep-time">${ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 600000000) + ' min' : ''}</span>
                    </div>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.sh-drawer-ep-card').forEach(card => {
            card.addEventListener('click', () => {
                const epId = card.dataset.epId;
                const targetEp = this._seasonEpisodes.find(e => e.Id === epId);
                if (targetEp) {
                    this._isEpisodeDrawerOpen = false;
                    this._el?.querySelector('#sh-episodes-drawer')?.classList.remove('open');
                    this.play(targetEp);
                }
            });
        });
    }

    _populateAudioAndSubsLists() {
        const audioList = this._el.querySelector('#sh-audio-stream-list');
        const subList = this._el.querySelector('#sh-sub-stream-list');

        // Audio
        if (this._audioStreams && this._audioStreams.length > 0) {
            audioList.innerHTML = this._audioStreams.map(s => {
                const isSel = s.Index === this._selectedAudioIndex;
                const lang = (s.Language || 'und').toUpperCase();
                const codec = (s.Codec || 'AAC').toUpperCase();
                const channels = s.ChannelLayout || (s.Channels ? `${s.Channels} ch` : 'Stéréo');
                const title = s.DisplayTitle || s.Title || `${lang} · ${codec} ${channels}`;
                return `
                    <button class="sh-vision-stream-item ${isSel ? 'selected' : ''}" data-audio-idx="${s.Index}">
                        <div class="sh-stream-check-icon">✓</div>
                        <div class="sh-stream-meta">
                            <span class="sh-stream-title">${this._escape(title)}</span>
                            <span class="sh-stream-badge">${codec} ${channels}</span>
                        </div>
                    </button>
                `;
            }).join('');

            audioList.querySelectorAll('.sh-vision-stream-item').forEach(item => {
                item.addEventListener('click', () => {
                    this._selectedAudioIndex = parseInt(item.dataset.audioIdx, 10);
                    audioList.querySelectorAll('.sh-vision-stream-item').forEach(i => i.classList.toggle('selected', i === item));
                    this._showFlashOSD('🔊', item.querySelector('.sh-stream-title').textContent);
                    this._closeAllPopovers();
                });
            });
        } else {
            audioList.innerHTML = '<p class="sh-popover-empty">Piste audio standard</p>';
        }

        // Sous-titres
        let subsHtml = `
            <button class="sh-vision-stream-item ${this._selectedSubIndex === -1 ? 'selected' : ''}" data-sub-idx="-1">
                <div class="sh-stream-check-icon">✓</div>
                <div class="sh-stream-meta">
                    <span class="sh-stream-title">Désactivé</span>
                </div>
            </button>
        `;

        if (this._subStreams && this._subStreams.length > 0) {
            subsHtml += this._subStreams.map(s => {
                const isSel = s.Index === this._selectedSubIndex;
                const lang = (s.Language || 'und').toUpperCase();
                const title = s.DisplayTitle || s.Title || `${lang} ${s.IsForced ? '(Forcé)' : ''}`;
                return `
                    <button class="sh-vision-stream-item ${isSel ? 'selected' : ''}" data-sub-idx="${s.Index}">
                        <div class="sh-stream-check-icon">✓</div>
                        <div class="sh-stream-meta">
                            <span class="sh-stream-title">${this._escape(title)}</span>
                            ${s.IsForced ? '<span class="sh-stream-badge">FORCÉ</span>' : ''}
                        </div>
                    </button>
                `;
            }).join('');
        }

        subList.innerHTML = subsHtml;
        subList.querySelectorAll('.sh-vision-stream-item').forEach(item => {
            item.addEventListener('click', () => {
                this._selectedSubIndex = parseInt(item.dataset.subIdx, 10);
                subList.querySelectorAll('.sh-vision-stream-item').forEach(i => i.classList.toggle('selected', i === item));
                const name = item.querySelector('.sh-stream-title').textContent;
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
        const elElapsed = this._el?.querySelector('#sh-time-elapsed');
        const elRemaining = this._el?.querySelector('#sh-time-remaining');
        if (elElapsed) elElapsed.textContent = this._formatTime(cur);
        if (elRemaining) elRemaining.textContent = `-${this._formatTime(Math.max(0, dur - cur))}`;

        // Progression de la timeline
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        const elPlayed = this._el?.querySelector('#sh-timeline-played');
        const elHandle = this._el?.querySelector('#sh-timeline-handle');
        if (elPlayed) elPlayed.style.width = `${pct}%`;
        if (elHandle) elHandle.style.left = `${pct}%`;

        // Smart Skip Intro
        const skipBtn = this._el?.querySelector('#sh-smart-skip-btn');
        if (cur >= 15 && cur <= 130) {
            skipBtn?.classList.add('visible');
        } else {
            skipBtn?.classList.remove('visible');
        }

        // Compte à rebours prochain épisode
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
            const elBuf = this._el?.querySelector('#sh-timeline-buffer');
            if (elBuf) elBuf.style.width = `${(end / dur) * 100}%`;
        }
    }

    _startNextEpCountdown() {
        const card = this._el?.querySelector('#sh-next-ep-card');
        if (!card || card.classList.contains('visible') || this._nextEpCancelled) return;

        card.classList.add('visible');
        const img = card.querySelector('#sh-next-ep-img');
        const title = card.querySelector('#sh-next-ep-title');
        const secTxt = card.querySelector('#sh-next-ep-sec');

        if (this._nextEpisode) {
            title.textContent = `S${String(this._nextEpisode.ParentIndexNumber || 1).padStart(2, '0')}E${String(this._nextEpisode.IndexNumber || 1).padStart(2, '0')} · « ${this._nextEpisode.Name} »`;
            if (this._api) {
                img.src = this._api.getImageUrl(this._nextEpisode.Id, 'Primary', { maxWidth: 240, maxHeight: 135 });
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
            barFill.style.width = `${Math.round(progressPct * 100)}%`;
        } else {
            barWrap.style.display = 'none';
        }

        osd.classList.remove('active');
        void osd.offsetWidth; // force reflow
        osd.classList.add('active');

        if (this._osdTimer) clearTimeout(this._osdTimer);
        this._osdTimer = setTimeout(() => {
            osd.classList.remove('active');
        }, 1400);
    }

    _onUserActivity() {
        this._showControls();
        this._resetIdleTimer();
    }

    _showControls() {
        if (!this._isControlsVisible) {
            this._isControlsVisible = true;
            this._el?.classList.remove('hud-hidden');
        }
    }

    _hideControls() {
        if (this._video && !this._video.paused && !this._activePopover && !this._isEpisodeDrawerOpen) {
            this._isControlsVisible = false;
            this._el?.classList.add('hud-hidden');
        }
    }

    _resetIdleTimer() {
        if (this._idleTimer) clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => this._hideControls(), 3500);
    }

    _togglePopover(popoverEl, anchorBtn) {
        if (!popoverEl) return;
        const isOpen = popoverEl.classList.contains('open');
        this._closeAllPopovers();
        if (!isOpen) {
            popoverEl.classList.add('open');
            anchorBtn?.classList.add('active');
            this._activePopover = popoverEl;
        }
    }

    _closeAllPopovers() {
        this._el?.querySelectorAll('.sh-vision-popover').forEach(p => p.classList.remove('open'));
        this._el?.querySelectorAll('.sh-glass-pill-btn').forEach(b => b.classList.remove('active'));
        this._activePopover = null;
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

        switch (e.key) {
            case ' ':
            case 'k':
                e.preventDefault();
                this._el.querySelector('#sh-btn-play-pause')?.click();
                break;
            case 'ArrowLeft':
            case 'j':
                e.preventDefault();
                this._el.querySelector('#sh-btn-skip-back')?.click();
                break;
            case 'ArrowRight':
            case 'l':
                e.preventDefault();
                this._el.querySelector('#sh-btn-skip-fwd')?.click();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this._setVolumeDelta(+0.05);
                break;
            case 'ArrowDown':
                e.preventDefault();
                this._setVolumeDelta(-0.05);
                break;
            case 'm':
                e.preventDefault();
                this._el.querySelector('#sh-btn-volume')?.click();
                break;
            case 'f':
                e.preventDefault();
                this._toggleFullscreen();
                break;
            case 's':
                e.preventDefault();
                this._el.querySelector('#sh-btn-audio-sub-toggle')?.click();
                break;
            case 'c':
                e.preventDefault();
                this._el.querySelector('#sh-btn-speed-toggle')?.click();
                break;
            case 'Escape':
                e.preventDefault();
                if (this._isEpisodeDrawerOpen) {
                    this._isEpisodeDrawerOpen = false;
                    this._el.querySelector('#sh-episodes-drawer')?.classList.remove('open');
                } else if (this._activePopover) {
                    this._closeAllPopovers();
                } else {
                    this.close();
                }
                break;
        }
    }

    _setVolumeDelta(delta) {
        if (!this._video) return;
        const newVol = Math.max(0, Math.min(1, this._video.volume + delta));
        this._video.volume = newVol;
        this._video.muted = false;
        this._volume = newVol;
        const slider = this._el?.querySelector('#sh-volume-range');
        if (slider) slider.value = String(newVol);
        this._showFlashOSD(newVol === 0 ? '🔇' : '🔊', `${Math.round(newVol * 100)}%`, newVol);
    }

    _reportPlaybackStart() {
        const itemId = this._currentItem.Id || this._currentItem.id;
        const serverUrl = this._auth?.getServerUrl();
        if (!serverUrl || !itemId) return;

        fetch(`${serverUrl}/Sessions/Playing`, {
            method: 'POST',
            headers: this._auth?.getAuthHeaders(),
            body: JSON.stringify({
                ItemId: itemId,
                PlayMethod: 'DirectStream',
                PositionTicks: 0
            })
        }).catch(e => this._log.debug('Report play start failed:', e));
    }

    _startProgressReporting() {
        if (this._progressInterval) clearInterval(this._progressInterval);
        this._progressInterval = setInterval(() => {
            if (!this._video || this._video.paused) return;
            const itemId = this._currentItem.Id || this._currentItem.id;
            const serverUrl = this._auth?.getServerUrl();
            if (!serverUrl || !itemId) return;

            const ticks = Math.round((this._video.currentTime || 0) * 10000000);
            fetch(`${serverUrl}/Sessions/Playing/Progress`, {
                method: 'POST',
                headers: this._auth?.getAuthHeaders(),
                body: JSON.stringify({
                    ItemId: itemId,
                    PositionTicks: ticks,
                    IsPaused: this._video.paused
                })
            }).catch(() => {});
        }, 10000);
    }

    _reportPlaybackStopped() {
        const itemId = this._currentItem?.Id || this._currentItem?.id;
        const serverUrl = this._auth?.getServerUrl();
        if (!serverUrl || !itemId || !this._video) return;

        const ticks = Math.round((this._video.currentTime || 0) * 10000000);
        fetch(`${serverUrl}/Sessions/Playing/Stopped`, {
            method: 'POST',
            headers: this._auth?.getAuthHeaders(),
            body: JSON.stringify({
                ItemId: itemId,
                PositionTicks: ticks
            })
        }).catch(() => {});
    }

    close(exitFullscreen = true) {
        if (!this._el) return;

        this._reportPlaybackStopped();

        if (this._progressInterval) clearInterval(this._progressInterval);
        if (this._idleTimer) clearTimeout(this._idleTimer);
        if (this._nextEpCountdownInterval) clearInterval(this._nextEpCountdownInterval);
        if (this._osdTimer) clearTimeout(this._osdTimer);

        if (this._onDocClick) document.removeEventListener('click', this._onDocClick);
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);

        if (this._hls) {
            this._hls.destroy();
            this._hls = null;
        }

        if (this._video) {
            this._video.pause();
            this._video.src = '';
            this._video.load();
        }

        if (exitFullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }

        this._el.remove();
        this._el = null;
        this._video = null;
        this._currentItem = null;
    }

    _formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '00:00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    _escape(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _injectStyles() {
        if (document.getElementById('sh-cinema-player-vision-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-cinema-player-vision-styles';
        style.textContent = `
/* ═══════════════════════════════════════════════════════════════════════════
   SpaceHub — Apple VisionOS & Apple TV+ Cinema Player Style System
   ═══════════════════════════════════════════════════════════════════════════ */

.sh-cinema-player {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background: #000;
    z-index: 100000;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    color: #fff;
    user-select: none;
}

.sh-cinema-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
}

/* ── Dégradés Cinématiques Supérieur & Inférieur ───────────────────────── */
.sh-player-gradient-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 180px;
    background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%);
    pointer-events: none;
    z-index: 5;
    transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-player-gradient-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 240px;
    background: linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 50%, transparent 100%);
    pointer-events: none;
    z-index: 5;
    transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── Auto-hide du HUD en mode inactivité ──────────────────────────────── */
.sh-cinema-player.hud-hidden {
    cursor: none;
}
.sh-cinema-player.hud-hidden .sh-player-topbar,
.sh-cinema-player.hud-hidden .sh-player-dock-container,
.sh-cinema-player.hud-hidden .sh-player-gradient-top,
.sh-cinema-player.hud-hidden .sh-player-gradient-bottom {
    opacity: 0;
    pointer-events: none;
    transform: translateY(16px);
}
.sh-cinema-player.hud-hidden .sh-player-topbar {
    transform: translateY(-16px);
}

/* ── Zones de Double-Tap Gauche / Droite (Ripple Waves) ───────────────── */
.sh-gesture-tap-zone {
    position: absolute;
    top: 100px;
    bottom: 120px;
    width: 35%;
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
}
.sh-gesture-left { left: 0; }
.sh-gesture-right { right: 0; }

.sh-ripple-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 90px;
    height: 90px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
    opacity: 0;
    transform: scale(0.6);
    pointer-events: none;
    transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-ripple-indicator.active {
    opacity: 1;
    transform: scale(1.15);
    animation: shRippleFlash 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes shRippleFlash {
    0% { opacity: 0; transform: scale(0.6); }
    50% { opacity: 1; transform: scale(1.15); }
    100% { opacity: 0; transform: scale(1.3); }
}

/* ── 🍏 Top Bar : Apple VisionOS Floating Style ───────────────────────── */
.sh-player-topbar {
    position: absolute;
    top: 24px;
    left: 28px;
    right: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 10;
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-player-back-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    background: rgba(25, 25, 35, 0.72);
    backdrop-filter: blur(32px) saturate(200%);
    -webkit-backdrop-filter: blur(32px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-player-back-pill:hover {
    background: rgba(255, 255, 255, 0.18);
    transform: scale(1.04);
    border-color: rgba(255, 255, 255, 0.3);
}

.sh-player-title-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 3px;
}
.sh-player-primary-title {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.2px;
    color: #ffffff;
    text-shadow: 0 2px 10px rgba(0,0,0,0.8);
}
.sh-player-secondary-title {
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.65);
    text-shadow: 0 1px 6px rgba(0,0,0,0.8);
}

/* Badges 4K VisionOS */
.sh-player-badges-strip {
    display: flex;
    align-items: center;
    gap: 8px;
}
.sh-pbadge-vision {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.6px;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(16px);
}
.sh-pbadge-vision.sh-pbadge--gold {
    background: rgba(255, 184, 0, 0.15);
    border-color: rgba(255, 184, 0, 0.35);
    color: #ffb800;
}
.sh-pbadge-vision.sh-pbadge--blue {
    background: rgba(0, 168, 255, 0.15);
    border-color: rgba(0, 168, 255, 0.35);
    color: #00d2ff;
}

.sh-player-top-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}
.sh-top-glass-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(25, 25, 35, 0.72);
    backdrop-filter: blur(32px) saturate(200%);
    -webkit-backdrop-filter: blur(32px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-top-glass-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.18);
    transform: scale(1.05);
}

/* ── Centre Vision Flash OSD ─────────────────────────────────────────── */
.sh-vision-flash-osd {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.85);
    background: rgba(18, 18, 26, 0.88);
    backdrop-filter: blur(48px) saturate(200%);
    -webkit-backdrop-filter: blur(48px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.3);
    border-radius: 28px;
    padding: 16px 28px;
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 50;
    opacity: 0;
    pointer-events: none;
    transition: all 0.28s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-vision-flash-osd.active {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
}
.sh-osd-glyph-wrap {
    font-size: 26px;
}
.sh-osd-data {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.sh-osd-label {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
}
.sh-osd-progress-track {
    width: 140px;
    height: 6px;
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    overflow: hidden;
}
.sh-osd-progress-fill {
    height: 100%;
    width: 70%;
    background: linear-gradient(90deg, #0084ff, #00d2ff);
    border-radius: 999px;
    box-shadow: 0 0 10px rgba(0, 168, 255, 0.8);
}

/* ── Smart Skip Intro Pill ───────────────────────────────────────────── */
.sh-vision-skip-intro-btn {
    position: absolute;
    bottom: 125px;
    right: 36px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 22px;
    background: rgba(20, 20, 30, 0.9);
    backdrop-filter: blur(36px) saturate(200%);
    -webkit-backdrop-filter: blur(36px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 999px;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 16px 40px rgba(0,0,0,0.7), 0 0 20px rgba(0, 168, 255, 0.3);
    z-index: 12;
    opacity: 0;
    pointer-events: none;
    transform: translateY(16px);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-vision-skip-intro-btn.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
}
.sh-vision-skip-intro-btn:hover {
    background: rgba(0, 168, 255, 0.25);
    border-color: #00a8ff;
    transform: scale(1.05);
}

/* ── Next Episode Card VisionOS ──────────────────────────────────────── */
.sh-next-ep-card-vision {
    position: absolute;
    bottom: 125px;
    right: 36px;
    width: 390px;
    background: rgba(18, 18, 26, 0.94);
    backdrop-filter: blur(48px) saturate(200%);
    -webkit-backdrop-filter: blur(48px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 24px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.85);
    z-index: 15;
    padding: 14px;
    opacity: 0;
    pointer-events: none;
    transform: translateY(20px);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-next-ep-card-vision.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
}
.sh-next-ep-card__inner {
    display: flex;
    align-items: center;
    gap: 12px;
}
.sh-next-ep-thumb-wrap {
    position: relative;
    width: 96px;
    height: 60px;
    border-radius: 12px;
    overflow: hidden;
    flex-shrink: 0;
    background: #000;
}
.sh-next-ep-thumb-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.sh-next-ep-countdown-badge {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 800;
    font-size: 19px;
}
.sh-next-ep-details {
    flex: 1;
    min-width: 0;
}
.sh-next-ep-kicker {
    font-size: 10px;
    font-weight: 800;
    color: #00d2ff;
    letter-spacing: 0.5px;
}
.sh-next-ep-name {
    margin: 2px 0 0;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.sh-next-ep-btns {
    display: flex;
    align-items: center;
    gap: 6px;
}
.sh-next-ep-launch-btn {
    padding: 8px 16px;
    background: #00a8ff;
    border: none;
    border-radius: 999px;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-next-ep-launch-btn:hover { transform: scale(1.08); }
.sh-next-ep-dismiss-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255,255,255,0.12);
    border: none;
    color: #fff;
    cursor: pointer;
}

/* ── 🎬 Tiroir Latéral d'Épisodes ─────────────────────────────────────── */
.sh-episodes-drawer-vision {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    background: rgba(14, 14, 20, 0.96);
    backdrop-filter: blur(48px) saturate(220%);
    -webkit-backdrop-filter: blur(48px) saturate(220%);
    border-left: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: -20px 0 60px rgba(0,0,0,0.85);
    z-index: 100;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-episodes-drawer-vision.open {
    transform: translateX(0);
}
.sh-episodes-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.sh-episodes-drawer-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #fff;
}
.sh-drawer-close-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
}
.sh-episodes-drawer-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.sh-drawer-ep-card {
    display: flex;
    gap: 12px;
    padding: 10px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-drawer-ep-card:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.2);
}
.sh-drawer-ep-card.active {
    background: rgba(0, 168, 255, 0.18);
    border-color: rgba(0, 168, 255, 0.45);
}
.sh-drawer-ep-thumb {
    position: relative;
    width: 100px;
    height: 58px;
    border-radius: 10px;
    overflow: hidden;
    flex-shrink: 0;
    background: #000;
}
.sh-drawer-ep-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.sh-drawer-ep-pill {
    position: absolute;
    top: 4px;
    left: 4px;
    background: rgba(0,0,0,0.75);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
}
.sh-drawer-ep-playing {
    position: absolute;
    inset: 0;
    background: rgba(0, 168, 255, 0.7);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 800;
}
.sh-drawer-ep-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
}
.sh-drawer-ep-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.sh-drawer-ep-time {
    font-size: 11px;
    color: rgba(255,255,255,0.5);
}

/* ═══════════════════════════════════════════════════════════════════════════
   🍏 UNIFIED VISIONOS FLOATING GLASS DOCK
   ═══════════════════════════════════════════════════════════════════════════ */

.sh-player-dock-container {
    position: absolute;
    bottom: 24px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    padding: 0 28px;
    z-index: 20;
    transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-vision-unified-dock {
    width: min(880px, 100%);
    background: rgba(16, 16, 24, 0.78);
    backdrop-filter: blur(48px) saturate(220%);
    -webkit-backdrop-filter: blur(48px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 28px;
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.25);
    padding: 14px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

/* ── Ligne 1 : Timeline Liquide Multi-couches ────────────────────────── */
.sh-dock-timeline-row {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
}

.sh-dock-time {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    font-variant-numeric: tabular-nums;
    width: 60px;
}
.sh-dock-time--rem {
    text-align: right;
    color: rgba(255, 255, 255, 0.6);
}

.sh-dock-track-wrap {
    position: relative;
    flex: 1;
    height: 20px;
    display: flex;
    align-items: center;
    cursor: pointer;
}

.sh-dock-track-bg {
    position: absolute;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    transition: height 0.2s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-dock-track-wrap:hover .sh-dock-track-bg {
    height: 7px;
}

.sh-dock-track-buffer {
    position: absolute;
    left: 0;
    height: 4px;
    width: 0%;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 999px;
    pointer-events: none;
    transition: height 0.2s;
}
.sh-dock-track-wrap:hover .sh-dock-track-buffer {
    height: 7px;
}

.sh-dock-track-played {
    position: absolute;
    left: 0;
    height: 4px;
    width: 0%;
    background: linear-gradient(90deg, #0084ff 0%, #00d2ff 100%);
    border-radius: 999px;
    pointer-events: none;
    box-shadow: 0 0 14px rgba(0, 168, 255, 0.9);
    transition: height 0.2s;
}
.sh-dock-track-wrap:hover .sh-dock-track-played {
    height: 7px;
}

.sh-dock-track-handle {
    position: absolute;
    top: 50%;
    left: 0%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 12px rgba(0, 168, 255, 1), 0 2px 8px rgba(0,0,0,0.6);
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-dock-track-wrap:hover .sh-dock-track-handle {
    transform: translate(-50%, -50%) scale(1.15);
}

.sh-dock-time-tooltip {
    position: absolute;
    bottom: 26px;
    left: 0%;
    transform: translateX(-50%);
    padding: 4px 8px;
    background: rgba(18, 18, 26, 0.96);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
}
.sh-dock-track-wrap:hover .sh-dock-time-tooltip {
    opacity: 1;
}

/* ── Ligne 2 : Commandes & Groupes Ergonomiques ──────────────────────── */
.sh-dock-controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.sh-dock-group {
    display: flex;
    align-items: center;
    gap: 10px;
}
.sh-dock-group--center {
    gap: 14px;
}

/* Volume Pill */
.sh-volume-expand-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
}
.sh-volume-track-container {
    width: 0;
    overflow: hidden;
    transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-volume-expand-pill:hover .sh-volume-track-container {
    width: 75px;
}
.sh-vision-slider {
    width: 70px;
    height: 4px;
    accent-color: #00d2ff;
    cursor: pointer;
}

/* Boutons Icones Glass */
.sh-glass-icon-btn {
    position: relative;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-glass-icon-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
    transform: scale(1.1);
}
.sh-glass-icon-btn.spring-active {
    animation: shButtonSpring 0.35s cubic-bezier(0.34, 1.56, 0.45, 1);
}
@keyframes shButtonSpring {
    0% { transform: scale(1); }
    50% { transform: scale(1.22) rotate(-8deg); }
    100% { transform: scale(1); }
}

.sh-btn-skip-spring {
    position: relative;
}
.sh-skip-tag {
    position: absolute;
    font-size: 8px;
    font-weight: 800;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}

/* 🌟 Play/Pause Géant avec Spring Physics & Halo */
.sh-vision-play-pause-btn {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #ffffff;
    border: none;
    color: #000000;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 22px rgba(255, 255, 255, 0.45), 0 0 20px rgba(0, 168, 255, 0.3);
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.45, 1), box-shadow 0.25s ease;
}
.sh-vision-play-pause-btn:hover {
    transform: scale(1.14);
    box-shadow: 0 6px 28px rgba(255, 255, 255, 0.65), 0 0 25px rgba(0, 168, 255, 0.5);
}
.sh-vision-play-pause-btn:active {
    transform: scale(0.92);
}

/* Boutons Pills Droite */
.sh-glass-pill-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-glass-pill-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.25);
}
.sh-glass-pill-btn.active {
    background: rgba(0, 168, 255, 0.22);
    border-color: rgba(0, 168, 255, 0.5);
    color: #00d2ff;
}
.sh-glass-pill-btn--speed {
    padding: 6px 10px;
    font-weight: 700;
}

/* ── Popovers Apple VisionOS ─────────────────────────────────────────── */
.sh-popover-anchor {
    position: relative;
}

.sh-vision-popover {
    position: absolute;
    bottom: 54px;
    right: 0;
    width: 320px;
    background: rgba(16, 16, 24, 0.96);
    backdrop-filter: blur(48px) saturate(220%);
    -webkit-backdrop-filter: blur(48px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 22px;
    box-shadow: 0 24px 70px rgba(0,0,0,0.9);
    padding: 16px;
    z-index: 200;
    opacity: 0;
    pointer-events: none;
    transform: translateY(12px) scale(0.96);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-vision-popover.open {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0) scale(1);
}
.sh-vision-popover--speed {
    width: 140px;
    padding: 10px;
}

.sh-vision-popover-header {
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: 12px;
}
.sh-vision-popover-header h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
}

.sh-vision-popover-body {
    max-height: 360px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.sh-popover-group-label {
    display: block;
    font-size: 10px;
    font-weight: 800;
    color: #00d2ff;
    letter-spacing: 0.6px;
    margin-bottom: 6px;
}

.sh-popover-item-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.sh-vision-stream-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 12px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
}
.sh-vision-stream-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}
.sh-vision-stream-item.selected {
    background: rgba(0, 168, 255, 0.18);
    color: #00d2ff;
    font-weight: 700;
}
.sh-stream-check-icon {
    width: 14px;
    font-size: 12px;
    opacity: 0;
}
.sh-vision-stream-item.selected .sh-stream-check-icon {
    opacity: 1;
}
.sh-stream-meta {
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.sh-stream-badge {
    font-size: 9px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
}

.sh-offset-pill-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
}
.sh-offset-pill {
    padding: 6px 2px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
}
.sh-offset-pill:hover {
    background: rgba(255, 255, 255, 0.18);
}
.sh-offset-pill--reset {
    grid-column: span 1;
    font-size: 10px;
}
.sh-offset-feedback {
    margin: 6px 0 0;
    font-size: 11px;
    color: rgba(255,255,255,0.6);
}

.sh-online-sub-search-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
}
.sh-online-sub-search-btn:hover {
    background: rgba(255, 255, 255, 0.14);
}

.sh-speed-opt {
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
}
.sh-speed-opt:hover { background: rgba(255,255,255,0.1); color:#fff; }
.sh-speed-opt.selected { background: rgba(0, 168, 255, 0.2); color: #00d2ff; }

/* ── Scrollbar Glass ─────────────────────────────────────────────────── */
.sh-scrollbar::-webkit-scrollbar { width: 4px; }
.sh-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
        `;
        document.head.appendChild(style);
    }
}

export default VideoPlayer;
