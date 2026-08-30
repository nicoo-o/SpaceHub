/**
 * SpaceHub — Grand Cinema Video Player (Apple TV 4K & VisionOS Ultra-Sleek)
 * Version: 4.0.0 (Liquid Ribbon Masterpiece)
 *
 * Conception Ultra-Aérodynamique & Épurée :
 *  - Dock Ultra-Fin 52px : Capsule liquide unique fusionnant timeline ambrée, transport perlé et tiroirs
 *  - Top Bar Apple TV 4K : En-tête tout-en-un à gauche (Retour + LED ambrée + Titre + Badges 4K/Atmos)
 *  - Tiroirs Latéraux en Verre (Glass Drawers) : Audio/Atmos, Sous-titres + Sync Live, Réglages, Épisodes
 *  - Icônes SF Pro Haute Définition : Dessin vectoriel sur-mesure pour chaque fonction
 *  - Z-Index Absolu (2147483647) : Élimination absolue de tout élément parasite Jellyfin
 *  - Moteur HLS adaptatif et playback reporting Jellyfin
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
        this._sourceMediaItem = null;
        this._progressInterval = null;
        this._idleTimer = null;
        this._isControlsVisible = true;
        this._isScrubbing = false;

        // Préférences utilisateur
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

        // Tiroir Latéral
        this._activeDrawerTab = 'audio';
        this._isDrawerOpen = false;
        this._seekHoldStart = 0;
        this._seekHoldCount = 0;
        this._focusedHudEl = null;

        // Détection gestuelle
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

        play(item, startPositionTicks = 0) {
        setTimeout(() => {
            const playPause = this._el?.querySelector('#sh-btn-play-pause');
            if (playPause) playPause.focus();
        }, 150);
        if (!item) return;

        // Si une Série entière est envoyée directement au player, résolution automatique de l'épisode
        if (item.Type === 'Series') {
            this._resolveAndPlaySeries(item);
            return;
        }

        this._currentItem = item;
        this._nextEpCancelled = false;
        clearInterval(this._nextEpCountdownInterval);
        this._nextEpCountdownInterval = null;
        this._nextEpRemaining = 8;
        const itemId = item.Id || item.id;
        this._log.info(`🎬 Lancement Grand Cinema Ultra-Sleek pour "${item.Name || item.title}" (ID: ${itemId})`);

        const isAlreadyOpen = Boolean(this._el && document.body.contains(this._el) && this._video);

        if (isAlreadyOpen) {
            // Transition in-place fluide sans écran noir ni destruction du DOM
            this._updatePlayerMetadataInPlace(item);
            this._initMediaStreams(item);
        } else {
            // Premier montage DOM
            this._createPlayerDOM(item);
            this._initMediaStreams(item);
        }

        const serverUrl = this._auth?.getServerUrl() || '';
        const token = this._auth?.getToken() || '';
        const startPositionSeconds = (startPositionTicks || item.UserData?.PlaybackPositionTicks || 0) / 10000000;

        const streamUrl = `${serverUrl}/Videos/${itemId}/master.m3u8?DeviceId=${this._auth?.getDeviceId?.() || 'sh_web'}&MediaSourceId=${itemId}&VideoCodec=h264,hevc,vp9,av1&AudioCodec=aac,mp3,opus,flac&TranscodingMaxAudioChannels=6&RequireAvc=false&Tag=${item.Etag || ''}&StartTimeTicks=${Math.round(startPositionSeconds * 10000000)}&api_key=${token}`;

        this._setupVideoSource(streamUrl, startPositionSeconds, token);
        this._reportPlaybackStart();
        this._startProgressReporting();
        this._resetIdleTimer();

        // Enrichissement asynchrone
        this._enrichMediaData(item, itemId);
    }

    _updatePlayerMetadataInPlace(item) {
        const title = item.Name || item.title || 'Média';
        const isEpisode = item.Type === 'Episode' || Boolean(item.SeriesName);
        const seriesName = item.SeriesName || (isEpisode ? title : '');
        const episodeNumber = isEpisode ? `S${String(item.ParentIndexNumber || 1).padStart(2, '0')}E${String(item.IndexNumber || 1).padStart(2, '0')}` : '';
        const episodeTitle = isEpisode ? (item.Name || title) : '';
        const year = item.ProductionYear || '';

        const mainTitleEl = this._el?.querySelector('#sh-player-main-title');
        const subTitleEl = this._el?.querySelector('#sh-player-sub-title');
        const yearTagEl = this._el?.querySelector('#sh-player-year-tag');

        if (mainTitleEl) mainTitleEl.textContent = seriesName || title;
        if (subTitleEl) subTitleEl.textContent = isEpisode && episodeNumber ? `${episodeNumber} · ${episodeTitle}` : episodeTitle;
        if (yearTagEl) yearTagEl.textContent = year ? String(year) : '';

        // Masquer la carte de fin d'épisode
        this._hideNextEpCard();
        this._closeAllPopovers();

        // Réinitialiser la barre de progression
        const elPlayed = this._el?.querySelector('#sh-timeline-played');
        const elHandle = this._el?.querySelector('#sh-timeline-handle');
        if (elPlayed) elPlayed.style.width = '0%';
        if (elHandle) elHandle.style.left = '0%';
    }

    async _enrichMediaData(item, itemId) {
        if (this._api && itemId) {
            try {
                const fetched = await this._api.getItem(itemId);
                if (fetched && this._currentItem && (this._currentItem.Id === itemId || this._currentItem.id === itemId)) {
                    this._currentItem = { ...item, ...fetched };
                    this._initMediaStreams(this._currentItem);
                    this._renderDrawerContent();
                }
            } catch (e) {
                this._log.debug('Enrichissement différé:', e);
            }
        }
        this._prepareSeasonEpisodes(this._currentItem || item);
    }

    _setupVideoSource(streamUrl, startPositionSeconds, token) {
        const spinner = this._el?.querySelector('#sh-player-buffering-spinner');
        if (spinner) spinner.classList.add('visible');

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
                    this._log.warn('Bascule sur flux direct:', data);
                    this._fallbackDirectStream(startPositionSeconds, token);
                }
            });
        } else if (this._video.canPlayType('application/vnd.apple.mpegurl')) {
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

        const defaultAudio = this._audioStreams.find(s => s.IsDefault) || this._audioStreams[0];
        this._selectedAudioIndex = defaultAudio ? defaultAudio.Index : (this._audioStreams[0]?.Index ?? 0);

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
                    this._renderDrawerContent();
                }
            } catch (err) {
                this._log.debug('Chargement épisodes différé:', err);
            }
        }
    }

    _updateEpisodeNavButtons() {
        const prevBtn = this._el?.querySelector('#sh-btn-prev-ep');
        const nextBtn = this._el?.querySelector('#sh-btn-next-ep');
        const drawerEpBtn = this._el?.querySelector('#sh-btn-open-episodes');
        const tabEpBtn = this._el?.querySelector('#sh-drawer-tab-episodes-btn');

        if (this._seasonEpisodes.length > 0) {
            if (drawerEpBtn) drawerEpBtn.style.display = 'inline-flex';
            if (tabEpBtn) tabEpBtn.style.display = 'inline-flex';
            if (prevBtn) {
                prevBtn.style.display = 'inline-flex';
                prevBtn.disabled = !this._prevEpisode;
                prevBtn.style.opacity = this._prevEpisode ? '1' : '0.35';
            }
            if (nextBtn) {
                nextBtn.style.display = 'inline-flex';
                nextBtn.disabled = !this._nextEpisode;
                nextBtn.style.opacity = this._nextEpisode ? '1' : '0.35';
            }
        } else {
            if (drawerEpBtn) drawerEpBtn.style.display = 'none';
            if (tabEpBtn) tabEpBtn.style.display = 'none';
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
        }
    }

    _createPlayerDOM(item) {
        this.close(false);
        document.body.classList.add('sh-cinema-active');

        const title = item.Name || item.title || 'Média';
        const isEpisode = item.Type === 'Episode' || item.SeriesName;
        const seriesName = item.SeriesName || (isEpisode ? title : '');
        const episodeNumber = isEpisode ? `S${String(item.ParentIndexNumber || 1).padStart(2, '0')}E${String(item.IndexNumber || 1).padStart(2, '0')}` : '';
        const episodeTitle = isEpisode ? (item.Name || title) : '';
        const year = item.ProductionYear || '';

        this._el = document.createElement('div');
        this._el.id = 'sh-grand-cinema-player';
        this._el.className = 'sh-grand-cinema-player sh-player--entering';

        this._el.innerHTML = `
            <!-- Aura Cinématique Luminescente -->
            <div class="sh-ambient-halo"></div>

            <!-- Vidéo Principale -->
            <video class="sh-cinema-video" playsinline preload="auto"></video>

            <!-- Dégradés de Vignettage Haut et Bas -->
            <div class="sh-vignette-top"></div>
            <div class="sh-vignette-bottom"></div>

            <!-- 🌀 Spinner de Chargement Ambré Minimaliste -->
            <div class="sh-cinema-buffering" id="sh-player-buffering-spinner">
                <div class="sh-buffering-glass">
                    <div class="sh-buffering-dot"></div>
                    <div class="sh-buffering-ring"></div>
                </div>
                <span class="sh-buffering-label">Chargement...</span>
            </div>

            <!-- Zones Gestuelles Gauche / Droite (Double-Tap Ripple) -->
            <div class="sh-gesture-zone sh-gesture-zone--left" id="sh-zone-left">
                <div class="sh-ripple-badge" id="sh-ripple-left">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
                    <span>-10s</span>
                </div>
            </div>
            <div class="sh-gesture-zone sh-gesture-zone--right" id="sh-zone-right">
                <div class="sh-ripple-badge" id="sh-ripple-right">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
                    <span>+10s</span>
                </div>
            </div>

            <!-- 🍏 TOP BAR : EN-TÊTE CINÉMA TRANSLUCIDE ÉPURÉ (Sans badges techniques) -->
            <header class="sh-cinema-topbar">
                
                <!-- Bloc Gauche : Capsule Titre Tout-en-un -->
                <div class="sh-topbar-brand-capsule">
                    <button class="sh-back-btn" id="sh-btn-back" tabindex="0" data-nav-focusable="true" title="Quitter la lecture (Échap)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span>Quitter</span>
                    </button>

                    <div class="sh-capsule-divider"></div>

                    <div class="sh-media-meta-group">
                        <div class="sh-brand-led" title="SpaceHub Live Hub Active">
                            <div class="sh-brand-led-core"></div>
                        </div>
                        <span class="sh-media-title">${this._escape(isEpisode ? seriesName : title)}</span>
                        <span class="sh-media-dot">•</span>
                        <span class="sh-media-sub">${isEpisode ? `${episodeNumber} « ${this._escape(episodeTitle)} »` : (year ? `${year} · Film` : 'Cinéma')}</span>
                    </div>
                </div>

                <!-- Bloc Droite : Actions Secondaires Flottantes -->
                <div class="sh-topbar-actions-pill">
                    <button tabindex="0" data-nav-focusable="true" class="sh-top-icon-btn" id="sh-btn-aspect" title="Format d'image (16:9, 21:9, Plein écran)">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>
                    </button>
                    <button tabindex="0" data-nav-focusable="true" class="sh-top-icon-btn" id="sh-btn-pip" title="Fenêtre flottante (PiP)">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><rect width="8" height="6" x="12" y="12" rx="1" fill="currentColor"/></svg>
                    </button>
                    <button tabindex="0" data-nav-focusable="true" class="sh-top-icon-btn" id="sh-btn-fullscreen" title="Plein écran (F)">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                    </button>
                </div>

            </header>

            <!-- 🌟 Centre Flash OSD (Jauge Ambrée) -->
            <div class="sh-cinema-osd" id="sh-player-osd">
                <div class="sh-osd-icon-wrap"><span id="sh-osd-icon">▶</span></div>
                <div class="sh-osd-info">
                    <span class="sh-osd-text" id="sh-osd-text">Lecture</span>
                    <div class="sh-osd-gauge" id="sh-osd-bar-wrap" style="display:none;">
                        <div class="sh-osd-gauge-fill" id="sh-osd-bar-fill"></div>
                    </div>
                </div>
            </div>

            <!-- ⏭️ Smart Skip Intro Pill -->
            <button class="sh-smart-skip-pill" id="sh-smart-skip-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="3"/></svg>
                <span>Passer l'intro</span>
            </button>

            <!-- 📺 Next Episode Card -->
            <div class="sh-next-ep-card" id="sh-next-ep-card">
                <div class="sh-next-ep-inner">
                    <div class="sh-next-ep-thumb">
                        <img id="sh-next-ep-img" src="" alt="Prochain épisode"/>
                        <div class="sh-next-ep-countdown"><span id="sh-next-ep-sec">5</span></div>
                    </div>
                    <div class="sh-next-ep-meta">
                        <span class="sh-next-ep-kicker">ÉPISODE SUIVANT</span>
                        <h4 class="sh-next-ep-name" id="sh-next-ep-title"></h4>
                    </div>
                    <div class="sh-next-ep-btns">
                        <button class="sh-next-ep-play-btn" id="sh-next-ep-play-now">Lancer</button>
                        <button class="sh-next-ep-close-btn" id="sh-next-ep-cancel" title="Annuler">✕</button>
                    </div>
                </div>
            </div>

            <!-- 🍏 GRAND CINEMA LIQUID DOCK (Disposition Studio Apple TV+ Rééquilibrée) -->
            <div class="sh-cinema-dock-anchor">
                <div class="sh-dock-amber-glow"></div>

                <!-- Dock Principal -->
                <div class="sh-liquid-ribbon-dock">
                    
                    <!-- Section Gauche : Commandes Transport Proportionnées & Temps Écoulé -->
                    <div class="sh-ribbon-group sh-ribbon-group--left">
                        <!-- Play / Pause Master Pearl (32px Calibré) -->
                        <button class="sh-pearl-play-btn" id="sh-btn-play-pause" tabindex="0" data-nav-focusable="true" title="Lecture / Pause (Espace)">
                            <svg class="sh-icon-play" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                            <svg class="sh-icon-pause" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        </button>

                        <!-- Sauts ±10s (30px) -->
                        <button class="sh-micro-btn" id="sh-btn-skip-back" tabindex="0" data-nav-focusable="true" title="Reculer de 10s (←)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                            <span class="sh-micro-num">10</span>
                        </button>
                        <button class="sh-micro-btn" id="sh-btn-skip-fwd" tabindex="0" data-nav-focusable="true" title="Avancer de 10s (→)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                            <span class="sh-micro-num">10</span>
                        </button>

                        <!-- Horodatage Écoulé -->
                        <span class="sh-time-elapsed-label" id="sh-time-elapsed">00:00:00</span>
                    </div>

                    <!-- Section Centrale : Timeline Scrubber Étendu (Zéro Vide) -->
                    <div class="sh-ribbon-timeline-wrapper">
                        <div class="sh-ribbon-timeline" id="sh-player-timeline-focus" tabindex="0" data-nav-focusable="true" role="slider" aria-label="Position de lecture" aria-valuemin="0" aria-valuemax="100">
                            <div class="sh-ribbon-timeline-bg"></div>
                            <div class="sh-ribbon-timeline-buffered" id="sh-timeline-buffer"></div>
                            <div class="sh-ribbon-timeline-played" id="sh-timeline-played"></div>
                            <div class="sh-ribbon-timeline-thumb" id="sh-timeline-handle"></div>
                            
                            <div class="sh-timeline-tooltip" id="sh-timeline-tooltip">
                                <span id="sh-tooltip-time">00:00:00</span>
                            </div>
                        </div>
                        <!-- Horodatage Restant -->
                        <span class="sh-time-remaining-label" id="sh-time-remaining">-00:00:00</span>
                    </div>

                    <!-- Section Droite : Volume Compact & Boutons Dépliants Ancrés -->
                    <div class="sh-ribbon-group sh-ribbon-group--right">
                        
                        <!-- Volume Coulissant Compact -->
                        <div class="sh-volume-flow-box">
                            <button class="sh-micro-btn" id="sh-btn-volume" tabindex="0" data-nav-focusable="true" title="Volume / Muet (M)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                            </button>
                            <div class="sh-volume-track">
                                <input type="range" class="sh-volume-range" id="sh-volume-range" min="0" max="1" step="0.02" value="${this._volume}">
                            </div>
                        </div>

                        <!-- Épisode Précédent / Suivant (Séries) -->
                        <button class="sh-micro-btn" id="sh-btn-prev-ep" tabindex="0" data-nav-focusable="true" title="Épisode précédent" style="display:none;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
                        </button>
                        <button class="sh-micro-btn" id="sh-btn-next-ep" tabindex="0" data-nav-focusable="true" title="Épisode suivant" style="display:none;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                        </button>

                        <!-- Ancre Dépliante 1 : Épisodes (Séries) -->
                        <div class="sh-dock-popover-anchor" id="sh-anchor-episodes" style="display:none;">
                            <button tabindex="0" data-nav-focusable="true" class="sh-dock-pill-btn" id="sh-btn-open-episodes" title="Liste des épisodes">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>
                                <span>Épisodes</span>
                                <span class="sh-popover-chevron">▴</span>
                            </button>

                            <div class="sh-player-popover" id="sh-popover-episodes">
                                <div class="sh-popover-inner sh-popover-inner--episodes">
                                    <div class="sh-popover-section-title">Épisodes de la Saison</div>
                                    <div class="sh-episodes-popover-list sh-scrollbar" id="sh-player-episodes-list">
                                        <!-- Injecté dynamiquement -->
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Ancre Dépliante 2 : Audio & Sous-titres -->
                        <div class="sh-dock-popover-anchor" id="sh-anchor-audio-subs">
                            <button tabindex="0" data-nav-focusable="true" class="sh-dock-pill-btn" id="sh-btn-open-audio-subs" title="Pistes Audio & Sous-Titres (S)">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
                                <span>Audio & Subs</span>
                                <span class="sh-popover-chevron">▴</span>
                            </button>

                            <div class="sh-player-popover" id="sh-popover-audio-subs">
                                <div class="sh-popover-inner sh-popover-inner--audio-subs">
                                    <div class="sh-popover-cols">
                                        <!-- Colonne 1 : Pistes Audio -->
                                        <div class="sh-popover-col">
                                            <div class="sh-popover-col-header">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                                                <span>Pistes Audio</span>
                                            </div>
                                            <div class="sh-popover-list" id="sh-player-audio-list">
                                                <!-- Injecté dynamiquement -->
                                            </div>
                                        </div>

                                        <div class="sh-popover-divider"></div>

                                        <!-- Colonne 2 : Sous-titres & Décalage -->
                                        <div class="sh-popover-col">
                                            <div class="sh-popover-col-header">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
                                                <span>Sous-titres</span>
                                            </div>
                                            <div class="sh-popover-list" id="sh-player-subs-list">
                                                <!-- Injecté dynamiquement -->
                                            </div>

                                            <!-- Stepper de Synchronisation Direct -->
                                            <div class="sh-popover-sub-sync">
                                                <div class="sh-popover-sub-sync-title">Synchronisation Live</div>
                                                <div class="sh-sync-grid">
                                                    <button class="sh-sync-btn" data-offset="-0.5">-0.5s</button>
                                                    <button class="sh-sync-btn" data-offset="-0.1">-0.1s</button>
                                                    <button class="sh-sync-btn sh-sync-btn--reset" data-offset="0">0.0s</button>
                                                    <button class="sh-sync-btn" data-offset="+0.1">+0.1s</button>
                                                    <button class="sh-sync-btn" data-offset="+0.5">+0.5s</button>
                                                </div>
                                                <div class="sh-sync-label">Décalage : <strong id="sh-popover-offset-val">${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s</strong></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Ancre Dépliante 3 : Vitesse & Réglages -->
                        <div class="sh-dock-popover-anchor" id="sh-anchor-settings">
                            <button tabindex="0" data-nav-focusable="true" class="sh-dock-pill-btn" id="sh-btn-open-settings" title="Vitesse & Réglages (C)">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                                <span id="sh-speed-indicator">${this._playbackRate}x</span>
                                <span class="sh-popover-chevron">▴</span>
                            </button>

                            <div class="sh-player-popover" id="sh-popover-settings">
                                <div class="sh-popover-inner sh-popover-inner--settings">
                                    <div class="sh-popover-section">
                                        <div class="sh-popover-section-title">Vitesse de Lecture</div>
                                        <div class="sh-settings-chips" id="sh-player-speed-chips">
                                            <button class="sh-chip-btn ${this._playbackRate === 0.5 ? 'active' : ''}" data-speed="0.5">0.5x</button>
                                            <button class="sh-chip-btn ${this._playbackRate === 0.75 ? 'active' : ''}" data-speed="0.75">0.75x</button>
                                            <button class="sh-chip-btn ${this._playbackRate === 1.0 ? 'active' : ''}" data-speed="1.0">1.0x (Normal)</button>
                                            <button class="sh-chip-btn ${this._playbackRate === 1.25 ? 'active' : ''}" data-speed="1.25">1.25x</button>
                                            <button class="sh-chip-btn ${this._playbackRate === 1.5 ? 'active' : ''}" data-speed="1.5">1.5x</button>
                                            <button class="sh-chip-btn ${this._playbackRate === 2.0 ? 'active' : ''}" data-speed="2.0">2.0x</button>
                                        </div>
                                    </div>

                                    <div class="sh-popover-section" style="margin-top: 12px;">
                                        <div class="sh-popover-section-title">Format d'Image</div>
                                        <div class="sh-settings-chips" id="sh-player-aspect-chips">
                                            <button class="sh-chip-btn ${this._aspectRatioIndex === 0 ? 'active' : ''}" data-aspect-idx="0">16:9 Adapté</button>
                                            <button class="sh-chip-btn ${this._aspectRatioIndex === 1 ? 'active' : ''}" data-aspect-idx="1">21:9 Cinéma Scope</button>
                                            <button class="sh-chip-btn ${this._aspectRatioIndex === 2 ? 'active' : ''}" data-aspect-idx="2">Plein écran Étiré</button>
                                        </div>
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

        setTimeout(() => {
            this._el?.classList.remove('sh-player--entering');
        }, 400);

        this._bindEvents();

        // Enregistrement officiel dans le Focus Registry
        const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
        if (spatialNav?.registerFocusables) {
            spatialNav.registerFocusables('player', (container) => {
                const root = this._el || container;
                return Array.from(root.querySelectorAll(
                    '#sh-btn-back, #sh-player-timeline-focus, #sh-btn-prev-ep, #sh-btn-skip-back, #sh-btn-play-pause, #sh-btn-skip-fwd, #sh-btn-next-ep, #sh-btn-volume, #sh-btn-open-audio-subs, #sh-btn-open-settings, #sh-btn-open-episodes, #sh-btn-fullscreen, .sh-popover-item'
                ));
            });
        }

        this._renderDrawerContent();

        if (this._el.requestFullscreen) {
            this._el.requestFullscreen().catch(() => {});
        }
    }

    _bindEvents() {
        const el = this._el;
        const video = this._video;
        const spinner = el.querySelector('#sh-player-buffering-spinner');

        el.querySelector('#sh-btn-back')?.addEventListener('click', () => this.close());

        el.addEventListener('mousemove', () => this._onUserActivity());
        el.addEventListener('mousedown', () => this._onUserActivity());
        el.addEventListener('touchstart', () => this._onUserActivity(), { passive: true });

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

        video.addEventListener('waiting', () => spinner?.classList.add('visible'));
        video.addEventListener('playing', () => spinner?.classList.remove('visible'));
        video.addEventListener('canplay', () => spinner?.classList.remove('visible'));
        video.addEventListener('playing', () => {
            el.querySelector('.sh-icon-play').style.display = 'none';
            el.querySelector('.sh-icon-pause').style.display = 'block';
        });
        video.addEventListener('pause', () => {
            el.querySelector('.sh-icon-play').style.display = 'block';
            el.querySelector('.sh-icon-pause').style.display = 'none';
            this._showControls();
        });

        // Double Clic / Double Tap Gauche / Droite (Sauts ±10s avec Ripple Waves)
        const leftZone = el.querySelector('#sh-zone-left');
        const rightZone = el.querySelector('#sh-zone-right');

        leftZone?.addEventListener('dblclick', () => this._triggerRippleSkip(-10));
        rightZone?.addEventListener('dblclick', () => this._triggerRippleSkip(10));

        const handleTap = (side, delta) => {
            const now = Date.now();
            if (now - this._lastTapTime < 300 && this._lastTapSide === side) {
                this._triggerRippleSkip(delta);
            }
            this._lastTapTime = now;
            this._lastTapSide = side;
        };
                // Écouteur de fin de média natif
        video.addEventListener('ended', () => {
            this._log.info('Lecture terminée (event ended). Passage automatique à l\'épisode suivant.');
            this._reportPlaybackStopped();
            if (this._nextEpisode && !this._nextEpCancelled) {
                this.play(this._nextEpisode);
            }
        });

        // Protection tactile multi-touch contre les conflits avec le scroll
        let touchStartX = 0;
        let touchStartY = 0;
        el.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
            this._onUserActivity();
        }, { passive: true });

        const handleTouchTapSafe = (side, delta, e) => {
            if (e.changedTouches && e.changedTouches.length === 1) {
                const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartX);
                const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY);
                if (deltaX > 15 || deltaY > 15) {
                    return; // Geste de défilement ou glissement ignoré
                }
            }
            handleTap(side, delta);
        };

        leftZone?.addEventListener('touchend', (e) => handleTouchTapSafe('left', -10, e));
        rightZone?.addEventListener('touchend', (e) => handleTouchTapSafe('right', 10, e));

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

        el.querySelector('#sh-btn-prev-ep')?.addEventListener('click', () => {
            if (this._prevEpisode) this.play(this._prevEpisode);
        });
        el.querySelector('#sh-btn-next-ep')?.addEventListener('click', () => {
            if (this._nextEpisode) this.play(this._nextEpisode);
        });

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

        // Volume & Ligne Jaune/Ambrée Dynamique
        const volumeRange = el.querySelector('#sh-volume-range');
        const updateVolumeTrack = (v) => {
            if (!volumeRange) return;
            const percent = Math.round(Math.max(0, Math.min(1, v)) * 100);
            volumeRange.style.background = `linear-gradient(to right, #ff9f0a 0%, #ff9f0a ${percent}%, rgba(255, 255, 255, 0.22) ${percent}%, rgba(255, 255, 255, 0.22) 100%)`;
        };

        if (volumeRange) {
            updateVolumeTrack(this._volume);
            volumeRange.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                video.volume = v;
                video.muted = false;
                this._volume = v;
                updateVolumeTrack(v);
                localStorage.setItem('SpaceHub_player_volume', String(v));
                this._showFlashOSD(v === 0 ? '🔇' : '🔊', `${Math.round(v * 100)}%`, v);
            });
        }

        el.querySelector('#sh-btn-volume')?.addEventListener('click', () => {
            video.muted = !video.muted;
            if (video.muted) {
                updateVolumeTrack(0);
                if (volumeRange) volumeRange.value = '0';
                this._showFlashOSD('🔇', 'Muet');
            } else {
                updateVolumeTrack(video.volume);
                if (volumeRange) volumeRange.value = String(video.volume);
                this._showFlashOSD('🔊', `${Math.round(video.volume * 100)}%`, video.volume);
            }
        });

        // Aspect Ratio
        el.querySelector('#sh-btn-aspect')?.addEventListener('click', () => {
            this._aspectRatioIndex = (this._aspectRatioIndex + 1) % this._aspectRatios.length;
            const mode = this._aspectRatios[this._aspectRatioIndex];
            video.style.objectFit = mode;
            const labels = { contain: '16:9 Adapté', cover: '21:9 Scope', fill: 'Plein écran' };
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

        el.querySelector('#sh-btn-fullscreen')?.addEventListener('click', () => this._toggleFullscreen());

        // 🗄️ Déclencheurs de Tiroirs
        el.querySelector('#sh-btn-open-audio-subs')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._togglePopover('sh-popover-audio-subs', e.currentTarget);
        });
        el.querySelector('#sh-btn-open-settings')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._togglePopover('sh-popover-settings', e.currentTarget);
        });
        el.querySelector('#sh-btn-open-episodes')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._togglePopover('sh-popover-episodes', e.currentTarget);
        });

        // Fermeture des popovers en cliquant ailleurs
        el.addEventListener('click', (e) => {
            if (!e.target.closest('.sh-player-popover') && !e.target.closest('.sh-dock-pill-btn')) {
                this._closeAllPopovers();
            }
        });

        el.querySelector('#sh-smart-skip-btn')?.addEventListener('click', () => {
            this._performSkipIntro();
        });

        el.querySelector('#sh-next-ep-play-now')?.addEventListener('click', () => {
            if (this._nextEpisode) this.play(this._nextEpisode);
        });
        el.querySelector('#sh-next-ep-cancel')?.addEventListener('click', () => {
            this._cancelNextEpCountdown();
        });

        document.addEventListener('keydown', this._keyHandler = (e) => this._onKeyDown(e));
    }

    _togglePopover(popoverId, triggerBtn) {
        const popover = this._el?.querySelector(`#${popoverId}`);
        if (!popover) return;

        const isOpen = popover.classList.contains('open');

        // Fermer tous les popovers ouverts
        this._closeAllPopovers();

        if (!isOpen) {
            this._renderPopoversContent();
            popover.classList.add('open');
            triggerBtn?.classList.add('active');
        }
    }

    _closeAllPopovers() {
        this._el?.querySelectorAll('.sh-player-popover').forEach(p => p.classList.remove('open'));
        this._el?.querySelectorAll('.sh-dock-pill-btn').forEach(b => b.classList.remove('active'));
    }

    _renderPopoversContent() {
        this._renderAudioSubsPopover();
        this._renderSettingsPopover();
        this._renderEpisodesPopover();
    }

    _renderAudioSubsPopover() {
        const audioList = this._el?.querySelector('#sh-player-audio-list');
        const subsList = this._el?.querySelector('#sh-player-subs-list');

        // 1. Pistes Audio
        if (audioList) {
            if (!this._audioStreams || this._audioStreams.length === 0) {
                audioList.innerHTML = '<div class="sh-popover-empty">Stéréo Standard</div>';
            } else {
                audioList.innerHTML = this._audioStreams.map(s => {
                    const isSel = s.Index === this._selectedAudioIndex;
                    const lang = (s.Language || 'und').toUpperCase();
                    const codec = (s.Codec || 'AAC').toUpperCase();
                    const channels = s.ChannelLayout || (s.Channels ? `${s.Channels} ch` : 'Stéréo');
                    const title = s.DisplayTitle || s.Title || `${lang} · ${codec} ${channels}`;

                    return `
                        <div class="sh-popover-item ${isSel ? 'selected' : ''}" data-audio-idx="${s.Index}">
                            <div class="sh-popover-item-name">${this._escape(title)}</div>
                            <div class="sh-popover-item-badge">${codec} ${channels}</div>
                        </div>
                    `;
                }).join('');

                audioList.querySelectorAll('.sh-popover-item').forEach(el => {
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._selectedAudioIndex = parseInt(el.dataset.audioIdx, 10);
                        this._renderAudioSubsPopover();
                        const title = el.querySelector('.sh-popover-item-name')?.textContent || 'Audio';
                        this._showFlashOSD('🔊', title);
                    });
                });
            }
        }

        // 2. Sous-titres
        if (subsList) {
            let subsHtml = `
                <div class="sh-popover-item ${this._selectedSubIndex === -1 ? 'selected' : ''}" data-sub-idx="-1">
                    <div class="sh-popover-item-name">Désactivé</div>
                </div>
            `;

            if (this._subStreams && this._subStreams.length > 0) {
                subsHtml += this._subStreams.map(s => {
                    const isSel = s.Index === this._selectedSubIndex;
                    const lang = (s.Language || 'und').toUpperCase();
                    const title = s.DisplayTitle || s.Title || `${lang} ${s.IsForced ? '(Forcé)' : ''}`;

                    return `
                        <div class="sh-popover-item ${isSel ? 'selected' : ''}" data-sub-idx="${s.Index}">
                            <div class="sh-popover-item-name">${this._escape(title)}</div>
                            ${s.IsForced ? '<span class="sh-popover-item-badge">FORCÉ</span>' : ''}
                        </div>
                    `;
                }).join('');
            }

            subsList.innerHTML = subsHtml;

            subsList.querySelectorAll('.sh-popover-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._selectedSubIndex = parseInt(el.dataset.subIdx, 10);
                    this._renderAudioSubsPopover();
                    const title = el.querySelector('.sh-popover-item-name')?.textContent || 'Sous-titre';
                    this._showFlashOSD('💬', `Sous-titres : ${title}`);
                });
            });
        }

        // 3. Stepper de Synchronisation
        const syncGrid = this._el?.querySelector('#sh-popover-audio-subs .sh-sync-grid');
        syncGrid?.querySelectorAll('.sh-sync-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const delta = parseFloat(btn.dataset.offset);
                if (delta === 0) this._subOffset = 0;
                else this._subOffset = Math.round((this._subOffset + delta) * 10) / 10;

                this._applySubtitleOffset();
                const label = this._el?.querySelector('#sh-popover-offset-val');
                if (label) label.textContent = `${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s`;
                this._showFlashOSD('⏱️', `Sous-titres ${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s`);
            };
        });
    }

    _renderSettingsPopover() {
        const speedChips = this._el?.querySelector('#sh-player-speed-chips');
        const aspectChips = this._el?.querySelector('#sh-player-aspect-chips');
        const aspectLabels = { contain: '16:9 Adapté', cover: '21:9 Cinéma Scope', fill: 'Plein écran Étiré' };

        if (speedChips) {
            speedChips.querySelectorAll('[data-speed]').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const spd = parseFloat(btn.dataset.speed);
                    this._playbackRate = spd;
                    this._video.playbackRate = spd;
                    localStorage.setItem('SpaceHub_playback_speed', String(spd));
                    const speedInd = this._el?.querySelector('#sh-speed-indicator');
                    if (speedInd) speedInd.textContent = `${spd}x`;
                    speedChips.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', parseFloat(b.dataset.speed) === spd));
                    this._showFlashOSD('⚡', `Vitesse : ${spd}x`);
                };
            });
        }

        if (aspectChips) {
            aspectChips.querySelectorAll('[data-aspect-idx]').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.aspectIdx, 10);
                    this._aspectRatioIndex = idx;
                    const mode = this._aspectRatios[idx];
                    this._video.style.objectFit = mode;
                    aspectChips.querySelectorAll('[data-aspect-idx]').forEach(b => b.classList.toggle('active', parseInt(b.dataset.aspectIdx, 10) === idx));
                    this._showFlashOSD('📐', aspectLabels[mode] || mode);
                };
            });
        }
    }

    _renderEpisodesPopover() {
        const epList = this._el?.querySelector('#sh-player-episodes-list');
        if (!epList) return;

        if (this._seasonEpisodes.length === 0) {
            epList.innerHTML = '<div class="sh-popover-empty">Aucun épisode disponible.</div>';
            return;
        }

        const currentId = this._currentItem.Id || this._currentItem.id;
        epList.innerHTML = this._seasonEpisodes.map(ep => {
            const isCur = ep.Id === currentId;
            const sNum = String(ep.ParentIndexNumber || 1).padStart(2, '0');
            const eNum = String(ep.IndexNumber || 1).padStart(2, '0');
            const imgUrl = this._api?.getImageUrl(ep.Id, 'Primary', { maxWidth: 200, maxHeight: 112 }) || '';

            return `
                <div class="sh-popover-episode-row ${isCur ? 'selected' : ''}" data-ep-id="${ep.Id}">
                    <div class="sh-popover-ep-thumb">
                        <img src="${imgUrl}" alt="${this._escape(ep.Name)}" onerror="this.style.display='none';"/>
                        <span class="sh-popover-ep-tag">S${sNum}E${eNum}</span>
                    </div>
                    <div class="sh-popover-ep-meta">
                        <div class="sh-popover-ep-name">${this._escape(ep.Name)}</div>
                        <div class="sh-popover-ep-dur">${ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 600000000) + ' min' : ''}</div>
                    </div>
                </div>
            `;
        }).join('');

        epList.querySelectorAll('.sh-popover-episode-row').forEach(row => {
            row.addEventListener('click', () => {
                const epId = row.dataset.epId;
                const targetEp = this._seasonEpisodes.find(e => e.Id === epId);
                if (targetEp) {
                    this._closeAllPopovers();
                    this.play(targetEp);
                }
            });
        });
    }

    _triggerRippleSkip(deltaSeconds) {
        if (!this._video) return;
        this._video.currentTime = Math.max(0, Math.min(this._video.duration || 0, this._video.currentTime + deltaSeconds));
        
        const isFwd = deltaSeconds > 0;
        const rippleEl = this._el?.querySelector(isFwd ? '#sh-ripple-right' : '#sh-ripple-left');
        if (rippleEl) {
            rippleEl.classList.remove('active');
            void rippleEl.offsetWidth;
            rippleEl.classList.add('active');
        }
        this._showFlashOSD(isFwd ? '⏩' : '⏪', `${isFwd ? '+' : ''}${deltaSeconds}s`);
    }

    _animateButtonSpring(btn) {
        if (!btn) return;
        btn.classList.remove('spring-bounce');
        void btn.offsetWidth;
        btn.classList.add('spring-bounce');
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
                    resultsEl.innerHTML = '<p style="color:var(--sh-text-muted); font-size:13px;">Aucun sous-titre trouvé.</p>';
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

        /**
     * Détecte l'intervalle réel de l'introduction via les chapitres Jellyfin.
     * @param {Object} item
     * @returns {{ start: number, end: number } | null}
     */
    _getIntroInterval(item) {
        const chapters = item?.Chapters || [];
        for (let i = 0; i < chapters.length; i++) {
            const ch = chapters[i];
            const name = (ch.Name || '').toLowerCase();
            const isIntro = ch.ChapterType === 'Intro' || name.includes('intro') || name.includes('opening') || name.includes('générique');
            if (isIntro) {
                const startSec = (ch.StartPositionTicks || 0) / 10000000;
                let endSec = ch.EndPositionTicks ? (ch.EndPositionTicks / 10000000) : null;
                if (!endSec && i + 1 < chapters.length) {
                    endSec = (chapters[i + 1].StartPositionTicks || 0) / 10000000;
                }
                if (!endSec || endSec <= startSec) {
                    endSec = startSec + 85;
                }
                return { start: startSec, end: endSec };
            }
        }
        // Fallback pour les séries sans chapitres explicites : fenêtre d'intro standard
        if (item?.Type === 'Episode' || item?.SeriesName) {
            return { start: 15, end: 100 };
        }
        return null;
    }

    _performSkipIntro() {
        const interval = this._getIntroInterval(this._currentItem);
        if (interval && this._video) {
            this._video.currentTime = interval.end;
        } else if (this._video) {
            this._video.currentTime += 85;
        }
        this._showFlashOSD('⏭️', 'Introduction passée');
        this._el?.querySelector('#sh-smart-skip-btn')?.classList.remove('visible');
    }

        _onTimeUpdate() {
        if (!this._video || this._isScrubbing) return;
        const cur = this._video.currentTime || 0;
        const dur = this._video.duration || 0;
        const rem = Math.max(0, dur - cur);

        const elElapsed = this._el?.querySelector('#sh-time-elapsed');
        const elTotal = this._el?.querySelector('#sh-time-total');
        const elRemaining = this._el?.querySelector('#sh-time-remaining');
        if (elElapsed) elElapsed.textContent = this._formatTime(cur);
        if (elTotal) elTotal.textContent = this._formatTime(dur);
        if (elRemaining) elRemaining.textContent = `-${this._formatTime(rem)}`;

        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        const elPlayed = this._el?.querySelector('#sh-timeline-played');
        const elHandle = this._el?.querySelector('#sh-timeline-handle');
        if (elPlayed) elPlayed.style.width = `${pct}%`;
        if (elHandle) elHandle.style.left = `${pct}%`;

        // 1. Bouton Passer l'introduction basé sur les chapitres réels
        const introInterval = this._getIntroInterval(this._currentItem);
        const skipBtn = this._el?.querySelector('#sh-smart-skip-btn');
        if (introInterval && cur >= introInterval.start && cur < introInterval.end) {
            skipBtn?.classList.add('visible');
        } else {
            skipBtn?.classList.remove('visible');
        }

        // 2. Carte & Countdown du prochain épisode
        if (dur > 45 && rem <= 30 && this._nextEpisode) {
            this._showNextEpCard();
            if (rem <= 8 && !this._nextEpCancelled && !this._nextEpCountdownInterval) {
                this._startNextEpCountdown();
            }
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
        void osd.offsetWidth;
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
        if (this._video && !this._video.paused && !this._isDrawerOpen) {
            this._isControlsVisible = false;
            this._el?.classList.add('hud-hidden');
        }
    }

    _resetIdleTimer() {
        if (this._idleTimer) clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => this._hideControls(), 3500);
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

        // Si les contrôles sont masqués, la première pression réveille le HUD
        if (!this._isControlsVisible) {
            e.preventDefault();
            this._showControls();
            this._resetIdleTimer();
            // Focus initial sur Play/Pause au réveil
            const playBtn = this._el.querySelector('#sh-btn-play-pause');
            if (playBtn) playBtn.focus();
            return;
        }

        this._resetIdleTimer();

        // A. GESTION DES POPOVERS OUVERTS (Audio, Subs, Réglages, Épisodes)
        const openPopover = this._el.querySelector('.sh-player-popover.open');
        if (openPopover) {
            const items = Array.from(openPopover.querySelectorAll('.sh-popover-item, .sh-chip-btn, .sh-sync-btn, .sh-popover-ep-card, button:not([disabled])'));
            const focused = document.activeElement;
            const curIdx = items.indexOf(focused);

            if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack' || e.key === 'GoBack') {
                e.preventDefault();
                this._closeAllPopovers();
                const triggerBtn = openPopover.closest('.sh-dock-popover-anchor')?.querySelector('.sh-dock-pill-btn');
                if (triggerBtn) triggerBtn.focus();
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                let next = null;
                if (curIdx === -1 || curIdx + 1 >= items.length) {
                    next = items[0];
                } else {
                    next = items[curIdx + 1];
                }
                if (next) {
                    next.focus();
                    next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                let prev = null;
                if (curIdx <= 0) {
                    prev = items[items.length - 1];
                } else {
                    prev = items[curIdx - 1];
                }
                if (prev) {
                    prev.focus();
                    prev.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                return;
            }

            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const audioCol = openPopover.querySelector('#sh-player-audio-list')?.closest('.sh-popover-col');
                const subsCol = openPopover.querySelector('#sh-player-subs-list')?.closest('.sh-popover-col');
                if (audioCol && subsCol) {
                    e.preventDefault();
                    if (e.key === 'ArrowRight' && audioCol.contains(focused)) {
                        const target = subsCol.querySelector('.sh-popover-item.selected, .sh-popover-item, .sh-sync-btn');
                        if (target) {
                            target.focus();
                            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    } else if (e.key === 'ArrowLeft' && subsCol.contains(focused)) {
                        const target = audioCol.querySelector('.sh-popover-item.selected, .sh-popover-item');
                        if (target) {
                            target.focus();
                            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }
                    return;
                }
            }

            if (e.key === 'Enter' || e.key === ' ') {
                if (focused && openPopover.contains(focused)) {
                    e.preventDefault();
                    focused.click();
                    return;
                }
            }
            return;
        }

        // B. GESTION DE LA TIMELINE FOCUSÉE
        const timeline = this._el.querySelector('#sh-player-timeline-focus');
        if (document.activeElement === timeline) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                if (!e.repeat) {
                    this._seekHoldStart = Date.now();
                    this._seekHoldCount = 0;
                }
                this._seekHoldCount++;
                const holdTime = Date.now() - this._seekHoldStart;
                let step = 5;
                if (holdTime > 5000) step = 300;
                else if (holdTime > 3000) step = 60;
                else if (holdTime > 1000) step = 30;

                const delta = e.key === 'ArrowRight' ? step : -step;
                this._seekRelative(delta);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const playBtn = this._el.querySelector('#sh-btn-play-pause');
                if (playBtn) playBtn.focus();
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const backBtn = this._el.querySelector('#sh-btn-back, #sh-player-btn-back');
                if (backBtn) backBtn.focus();
                return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._togglePlayPause();
                return;
            }
        }

        // C. GESTION DE LA TOPBAR (Bouton Retour)
        const topBackBtn = this._el.querySelector('#sh-btn-back, #sh-player-btn-back');
        if (document.activeElement === topBackBtn) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (timeline) timeline.focus();
                else this._el.querySelector('#sh-btn-play-pause')?.focus();
                return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.close();
                return;
            }
        }

        // D. GESTION DES BOUTONS DU DOCK (Navigation 2D Clavier / TV)
        const dockButtons = Array.from(this._el.querySelectorAll(
            '#sh-btn-prev-ep, #sh-btn-skip-back, #sh-btn-play-pause, #sh-btn-skip-fwd, #sh-btn-next-ep, #sh-btn-volume, #sh-btn-open-audio-subs, #sh-btn-open-settings, #sh-btn-open-episodes, #sh-btn-fullscreen'
        )).filter(el => el.offsetParent !== null && window.getComputedStyle(el).display !== 'none');

        const curDockIdx = dockButtons.indexOf(document.activeElement);

        if (curDockIdx !== -1) {
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (curDockIdx + 1 < dockButtons.length) {
                    dockButtons[curDockIdx + 1].focus();
                }
                return;
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (curDockIdx > 0) {
                    dockButtons[curDockIdx - 1].focus();
                }
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (timeline) timeline.focus();
                else if (topBackBtn) topBackBtn.focus();
                return;
            }

            if (e.key === 'ArrowDown') {
                const focusedBtn = document.activeElement;
                if (focusedBtn.classList.contains('sh-dock-pill-btn')) {
                    e.preventDefault();
                    focusedBtn.click(); // Ouvre le popover
                    return;
                }
            }

            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                document.activeElement.click();
                return;
            }
        }

        // E. TOUCHES DE RACCOURCI DIRECTES
        switch (e.key) {
            case ' ':
            case 'k':
                e.preventDefault();
                this._togglePlayPause();
                break;
            case 'ArrowLeft':
            case 'j':
                e.preventDefault();
                this._seekRelative(-10);
                break;
            case 'ArrowRight':
            case 'l':
                e.preventDefault();
                this._seekRelative(+10);
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
                this._el.querySelector('#sh-btn-open-audio-subs')?.click();
                break;
            case 'c':
                e.preventDefault();
                this._el.querySelector('#sh-btn-open-settings')?.click();
                break;
            case 'e':
                e.preventDefault();
                this._el.querySelector('#sh-btn-open-episodes')?.click();
                break;
            case 'Escape':
            case 'Backspace':
            case 'BrowserBack':
            case 'GoBack':
                e.preventDefault();
                this.close();
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

        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);

        const elToClose = this._el;
        elToClose.classList.add('sh-player--exiting');

        setTimeout(() => {
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

            document.body.classList.remove('sh-cinema-active');
            elToClose.remove();

            // Retour en cascade : réouverture automatique de la fiche média (menu flottant)
            const sourceItem = this._sourceMediaItem || this._currentItem;
            if (sourceItem && window.SpaceHub?.ui?.modalSlideUpSheet) {
                window.SpaceHub.ui.modalSlideUpSheet.open(sourceItem);
            } else {
                const nav = window.SpaceHub?.spatialNav || window.SpaceHub?.ui?.appLayout?._spatialNav;
                nav?.onModalClosed?.();
            }
        }, 320);

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
        if (document.getElementById('sh-grand-cinema-styles-v3')) return;
        const style = document.createElement('style');
        style.id = 'sh-grand-cinema-styles-v3';
        style.textContent = `
/* ═══════════════════════════════════════════════════════════════════════════
   SpaceHub — Grand Cinema Video Player v3.3.0 (VisionOS Floating Popovers)
   ═══════════════════════════════════════════════════════════════════════════ */

/* Neutralisation Absolue des Éléments Parasites */
body.sh-cinema-active {
    overflow: hidden !important;
}
body.sh-cinema-active .btnHeaderClose,
body.sh-cinema-active .headerBackButton,
body.sh-cinema-active .headerElements,
body.sh-cinema-active .videoOsd,
body.sh-cinema-active .videoOsdBottom,
body.sh-cinema-active .videoOsdHeader,
body.sh-cinema-active .headerTop,
body.sh-cinema-active .dialogContainer,
body.sh-cinema-active .dialogBackdrop {
    display: none !important;
    opacity: 0 !important;
    pointer-events: none !important;
    visibility: hidden !important;
    z-index: -1 !important;
}

.sh-grand-cinema-player {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background: #000000;
    z-index: 2147483647 !important;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    color: #ffffff;
    user-select: none;
    -webkit-font-smoothing: antialiased;
    transition: opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1), transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-grand-cinema-player.sh-player--entering {
    opacity: 0;
    transform: scale(1.03);
}
.sh-grand-cinema-player.sh-player--exiting {
    opacity: 0;
    transform: scale(0.97);
    pointer-events: none;
}

.sh-cinema-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
}

.sh-ambient-halo {
    position: absolute;
    inset: -10%;
    background: radial-gradient(circle at center, rgba(255, 159, 10, 0.06) 0%, transparent 70%);
    pointer-events: none;
    z-index: 2;
}

.sh-vignette-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 140px;
    background: linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 65%, transparent 100%);
    pointer-events: none;
    z-index: 4;
    transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-vignette-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 180px;
    background: linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 65%, transparent 100%);
    pointer-events: none;
    z-index: 4;
    transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-grand-cinema-player.hud-hidden {
    cursor: none;
}
.sh-grand-cinema-player.hud-hidden .sh-cinema-topbar,
.sh-grand-cinema-player.hud-hidden .sh-cinema-dock-anchor,
.sh-grand-cinema-player.hud-hidden .sh-vignette-top,
.sh-grand-cinema-player.hud-hidden .sh-vignette-bottom {
    opacity: 0;
    pointer-events: none;
    transform: translateY(14px);
}
.sh-grand-cinema-player.hud-hidden .sh-cinema-topbar {
    transform: translateY(-14px);
}

/* 🌀 Buffering Spinner Ambré */
.sh-cinema-buffering {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    z-index: 40;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
}
.sh-cinema-buffering.visible { opacity: 1; }
.sh-buffering-glass {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(14, 14, 20, 0.65);
    backdrop-filter: blur(30px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 16px 40px rgba(0,0,0,0.8), 0 0 20px rgba(255, 159, 10, 0.35);
}
.sh-buffering-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ff9f0a;
    box-shadow: 0 0 8px #ff9f0a, 0 0 12px rgba(255, 159, 10, 0.9);
}
.sh-buffering-ring {
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: #ff9f0a;
    border-right-color: #ffc04d;
    animation: shSpinRibbon 0.85s cubic-bezier(0.5, 0, 0.5, 1) infinite;
}
@keyframes shSpinRibbon {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
.sh-buffering-label {
    font-size: 11.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.75);
    letter-spacing: 0.3px;
}

/* ── Zones Double-Tap Ripple ─────────────────────────────────────────── */
.sh-gesture-zone {
    position: absolute;
    top: 90px;
    bottom: 100px;
    width: 35%;
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: center;
}
.sh-gesture-zone--left { left: 0; }
.sh-gesture-zone--right { right: 0; }

.sh-ripple-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: rgba(14, 14, 20, 0.65);
    backdrop-filter: blur(28px);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #fff;
    font-size: 11.5px;
    font-weight: 700;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 159, 10, 0.4);
    opacity: 0;
    transform: scale(0.6);
    pointer-events: none;
    transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-ripple-badge.active {
    opacity: 1;
    transform: scale(1.15);
    animation: shRippleFlash 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes shRippleFlash {
    0% { opacity: 0; transform: scale(0.6); }
    50% { opacity: 1; transform: scale(1.15); }
    100% { opacity: 0; transform: scale(1.3); }
}

/* ═══════════════════════════════════════════════════════════════════════════
   🍏 TOP BAR : EN-TÊTE CINÉMA TRANSLUCIDE ÉPURÉ
   ═══════════════════════════════════════════════════════════════════════════ */

.sh-cinema-topbar {
    position: absolute;
    top: 22px;
    left: 28px;
    right: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 10;
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-topbar-brand-capsule {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 16px 5px 6px;
    background: rgba(14, 14, 20, 0.48);
    backdrop-filter: blur(36px) saturate(190%);
    -webkit-backdrop-filter: blur(36px) saturate(190%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.sh-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-back-btn:hover {
    background: rgba(255, 255, 255, 0.18);
    transform: scale(1.03);
}

.sh-capsule-divider {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.12);
}

.sh-media-meta-group {
    display: flex;
    align-items: center;
    gap: 8px;
}
.sh-brand-led {
    position: relative;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ff9f0a;
    box-shadow: 0 0 6px #ff9f0a, 0 0 12px rgba(255, 159, 10, 0.85);
    flex-shrink: 0;
}
.sh-brand-led-core {
    position: absolute;
    inset: 1px;
    border-radius: 50%;
    background: #ffb340;
}
.sh-media-title {
    font-size: 13.5px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: -0.2px;
}
.sh-media-dot {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.35);
}
.sh-media-sub {
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
}

/* Actions Droite */
.sh-topbar-actions-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    background: rgba(14, 14, 20, 0.48);
    backdrop-filter: blur(36px) saturate(190%);
    -webkit-backdrop-filter: blur(36px) saturate(190%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.16);
}
.sh-top-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-top-icon-btn:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.16);
    transform: scale(1.08);
}

/* ── Flash OSD Jauge ─────────────────────────────────────────────────── */
.sh-cinema-osd {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.85);
    background: rgba(14, 14, 20, 0.85);
    backdrop-filter: blur(40px) saturate(200%);
    -webkit-backdrop-filter: blur(40px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.9), 0 0 30px rgba(255, 159, 10, 0.2);
    border-radius: 20px;
    padding: 12px 22px;
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 50;
    opacity: 0;
    pointer-events: none;
    transition: all 0.28s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-cinema-osd.active {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
}
.sh-osd-icon-wrap { font-size: 20px; }
.sh-osd-info { display: flex; flex-direction: column; gap: 4px; }
.sh-osd-text { font-size: 13.5px; font-weight: 700; color: #fff; }
.sh-osd-gauge {
    width: 120px;
    height: 4px;
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    overflow: hidden;
}
.sh-osd-gauge-fill {
    height: 100%;
    width: 70%;
    background: linear-gradient(90deg, #ff9f0a, #ffc04d);
    border-radius: 999px;
    box-shadow: 0 0 10px rgba(255, 159, 10, 0.85);
}

/* ── Smart Skip Intro & Next Ep ──────────────────────────────────────── */
.sh-smart-skip-pill {
    position: absolute;
    bottom: 95px;
    right: 32px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    background: rgba(14, 14, 20, 0.82);
    backdrop-filter: blur(36px) saturate(200%);
    -webkit-backdrop-filter: blur(36px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 16px 45px rgba(0,0,0,0.8), 0 0 25px rgba(255, 159, 10, 0.3);
    z-index: 12;
    opacity: 0;
    pointer-events: none;
    transform: translateY(14px);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-smart-skip-pill.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
}
.sh-smart-skip-pill:hover {
    background: rgba(255, 159, 10, 0.25);
    border-color: #ff9f0a;
    transform: scale(1.04);
}

.sh-next-ep-card {
    position: absolute;
    bottom: 95px;
    right: 32px;
    width: 360px;
    background: rgba(14, 14, 20, 0.90);
    backdrop-filter: blur(48px) saturate(200%);
    -webkit-backdrop-filter: blur(48px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 18px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.9);
    z-index: 15;
    padding: 12px;
    opacity: 0;
    pointer-events: none;
    transform: translateY(18px);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-next-ep-card.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
}
.sh-next-ep-inner { display: flex; align-items: center; gap: 10px; }
.sh-next-ep-thumb {
    position: relative;
    width: 86px;
    height: 52px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    background: #000;
}
.sh-next-ep-thumb img { width: 100%; height: 100%; object-fit: cover; }
.sh-next-ep-countdown {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ff9f0a;
    font-weight: 800;
    font-size: 18px;
}
.sh-next-ep-meta { flex: 1; min-width: 0; }
.sh-next-ep-kicker { font-size: 9px; font-weight: 800; color: #ff9f0a; letter-spacing: 0.5px; }
.sh-next-ep-name { margin: 2px 0 0; font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sh-next-ep-btns { display: flex; align-items: center; gap: 6px; }
.sh-next-ep-play-btn {
    padding: 6px 13px;
    background: #ff9f0a;
    border: none;
    border-radius: 999px;
    color: #000;
    font-size: 11px;
    font-weight: 750;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(255, 159, 10, 0.4);
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-next-ep-play-btn:hover { transform: scale(1.06); }
.sh-next-ep-close-btn {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: rgba(255,255,255,0.1);
    border: none;
    color: #fff;
    cursor: pointer;
}

/* ═══════════════════════════════════════════════════════════════════════════
   🍏 GRAND CINEMA LIQUID DOCK (Disposition Studio Apple TV+ Rééquilibrée)
   ═══════════════════════════════════════════════════════════════════════════ */

.sh-cinema-dock-anchor {
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

.sh-dock-amber-glow {
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: min(860px, 90vw);
    height: 30px;
    background: radial-gradient(ellipse at center, rgba(255, 159, 10, 0.20) 0%, transparent 70%);
    pointer-events: none;
    filter: blur(14px);
    z-index: 19;
}

.sh-liquid-ribbon-dock {
    position: relative;
    width: min(1040px, 100%);
    height: 50px;
    background: rgba(14, 14, 20, 0.48);
    backdrop-filter: blur(36px) saturate(190%);
    -webkit-backdrop-filter: blur(36px) saturate(190%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.18);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px 0 8px;
    z-index: 21;
    gap: 10px;
}

/* ── Section Gauche : Commandes Transport Proportionnées ──────────────── */
.sh-ribbon-group {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
}

/* Master Play/Pause Button (32px Calibré Harmonieux) */
.sh-pearl-play-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #ffffff;
    border: none;
    color: #000000;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(255, 255, 255, 0.40), 0 0 16px rgba(255, 159, 10, 0.30);
    transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.45, 1), box-shadow 0.22s ease;
    flex-shrink: 0;
}
.sh-pearl-play-btn:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 20px rgba(255, 255, 255, 0.65), 0 0 20px rgba(255, 159, 10, 0.45);
}
.sh-pearl-play-btn:active { transform: scale(0.94); }

/* Micro Boutons Transport (30px) */
.sh-micro-btn {
    position: relative;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    flex-shrink: 0;
}
.sh-micro-btn:hover {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
    transform: scale(1.06);
}
.sh-micro-num {
    position: absolute;
    font-size: 7px;
    font-weight: 800;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}

.sh-time-elapsed-label {
    font-size: 11.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.90);
    font-variant-numeric: tabular-nums;
    margin: 0 4px 0 6px;
}

/* ── Section Centrale : Timeline Scrubber Étendu ─────────────────────── */
.sh-ribbon-timeline-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 160px;
}

.sh-ribbon-timeline {
    position: relative;
    flex: 1;
    height: 18px;
    display: flex;
    align-items: center;
    cursor: pointer;
}

.sh-ribbon-timeline-bg {
    position: absolute;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    transition: height 0.18s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-ribbon-timeline:hover .sh-ribbon-timeline-bg { height: 6px; }

.sh-ribbon-timeline-buffered {
    position: absolute;
    left: 0;
    height: 4px;
    width: 0%;
    background: rgba(255, 255, 255, 0.30);
    border-radius: 999px;
    pointer-events: none;
    transition: height 0.18s;
}
.sh-ribbon-timeline:hover .sh-ribbon-timeline-buffered { height: 6px; }

.sh-ribbon-timeline-played {
    position: absolute;
    left: 0;
    height: 4px;
    width: 0%;
    background: linear-gradient(90deg, #ff9f0a 0%, #ffc04d 100%);
    border-radius: 999px;
    pointer-events: none;
    box-shadow: 0 0 10px rgba(255, 159, 10, 0.85);
    transition: height 0.18s;
}
.sh-ribbon-timeline:hover .sh-ribbon-timeline-played { height: 6px; }

.sh-ribbon-timeline-thumb {
    position: absolute;
    top: 50%;
    left: 0%;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 0 10px rgba(255, 159, 10, 1), 0 2px 6px rgba(0,0,0,0.6);
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-ribbon-timeline:hover .sh-ribbon-timeline-thumb { transform: translate(-50%, -50%) scale(1.1); }

.sh-timeline-tooltip {
    position: absolute;
    bottom: 22px;
    left: 0%;
    transform: translateX(-50%);
    padding: 3px 7px;
    background: rgba(14, 14, 20, 0.95);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.20);
    border-radius: 6px;
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    box-shadow: 0 6px 18px rgba(0,0,0,0.7);
}
.sh-ribbon-timeline:hover .sh-timeline-tooltip { opacity: 1; }

.sh-time-remaining-label {
    font-size: 11.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.65);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

/* ── Section Droite : Volume Compact (Micro-perle 7px) & Menus Dépliants ── */
.sh-volume-flow-box {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-right: 2px;
}
.sh-volume-track {
    width: 48px;
    display: flex;
    align-items: center;
}

/* 🔘 Curseur de Volume Personnalisé Ultra-Fin (Suppression du gros rond orange) */
.sh-volume-range {
    -webkit-appearance: none;
    appearance: none;
    width: 48px;
    height: 3px;
    background: rgba(255, 255, 255, 0.20);
    border-radius: 999px;
    outline: none;
    cursor: pointer;
}
.sh-volume-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ff9f0a;
    box-shadow: 0 0 6px #ff9f0a, 0 1px 3px rgba(0,0,0,0.5);
    cursor: pointer;
    border: none;
    transition: transform 0.15s ease;
}
.sh-volume-range:hover::-webkit-slider-thumb {
    transform: scale(1.25);
}
.sh-volume-range::-moz-range-thumb {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ff9f0a;
    box-shadow: 0 0 6px #ff9f0a;
    cursor: pointer;
    border: none;
}

/* Boutons Pilules Dépliants du Dock */
.sh-dock-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 4px 11px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.90);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    white-space: nowrap;
}
.sh-dock-pill-btn:hover,
.sh-dock-pill-btn.active {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.28);
    color: #fff;
    transform: scale(1.03);
}
.sh-popover-chevron {
    font-size: 9px;
    opacity: 0.65;
    margin-left: 1px;
    transition: transform 0.2s ease;
}
.sh-dock-pill-btn.active .sh-popover-chevron {
    transform: rotate(180deg);
}

/* ═══════════════════════════════════════════════════════════════════════════
   🗄️ MENUS DÉPLIANTS FLOTTANTS (Glass Popovers au-dessus du Dock)
   ═══════════════════════════════════════════════════════════════════════════ */

.sh-dock-popover-anchor {
    position: relative;
    display: inline-flex;
    align-items: center;
}

.sh-player-popover {
    position: absolute;
    bottom: calc(100% + 14px);
    right: 0;
    z-index: 9999;
    opacity: 0;
    transform: translateY(10px) scale(0.95);
    transform-origin: bottom right;
    pointer-events: none;
    transition: all 0.24s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-player-popover.open {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
}

#sh-popover-audio-subs {
    width: 440px;
}
#sh-popover-settings {
    width: 300px;
}
#sh-popover-episodes {
    width: 350px;
}

/* Texture de Verre Liquide Identique au Dock */
.sh-popover-inner {
    background: rgba(14, 14, 20, 0.52);
    backdrop-filter: blur(40px) saturate(190%);
    -webkit-backdrop-filter: blur(40px) saturate(190%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 20px;
    padding: 14px 16px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

/* Double Colonne Audio & Subs */
.sh-popover-cols {
    display: grid;
    grid-template-columns: 1fr 1px 1fr;
    gap: 12px;
    width: 100%;
    box-sizing: border-box;
    overflow-x: hidden;
}
.sh-popover-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
}
.sh-popover-divider {
    background: rgba(255, 255, 255, 0.10);
    width: 1px;
    height: 100%;
}

.sh-popover-col-header,
.sh-popover-section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: rgba(255, 255, 255, 0.70);
    padding: 2px 4px 8px;
}

.sh-popover-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 180px;
    overflow-y: auto;
    overflow-x: hidden !important;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.20) transparent;
}
.sh-popover-list::-webkit-scrollbar {
    width: 4px;
    height: 0px;
}
.sh-popover-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.20);
    border-radius: 4px;
}

.sh-popover-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.10);
    cursor: pointer;
    color: rgba(255, 255, 255, 0.85);
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-popover-item:hover {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.22);
    color: #ffffff;
    transform: scale(1.02);
}
.sh-popover-item.selected {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.35);
    color: #ffffff;
    font-weight: 700;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.sh-popover-item-name {
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
}
.sh-popover-item-badge {
    font-size: 8px;
    font-weight: 800;
    padding: 2px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.10);
    margin-left: 6px;
    flex-shrink: 0;
}

/* Stepper Synchronisation Direct */
.sh-popover-sub-sync {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.sh-popover-sub-sync-title {
    font-size: 9.5px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.60);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
}
.sh-sync-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 3px;
}
.sh-sync-btn {
    padding: 6px 2px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.90);
    font-size: 9.5px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.16s ease;
}
.sh-sync-btn:hover {
    background: rgba(255, 255, 255, 0.20);
    border-color: rgba(255, 255, 255, 0.30);
    color: #ffffff;
    transform: scale(1.04);
}
.sh-sync-btn--reset { font-size: 9px; }
.sh-sync-label {
    margin-top: 5px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.65);
}

/* Popover Settings Sections */
.sh-settings-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}
.sh-chip-btn {
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.16s ease;
}
.sh-chip-btn:hover {
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.25);
    color: #fff;
    transform: scale(1.03);
}
.sh-chip-btn.active {
    background: rgba(255, 255, 255, 0.22);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.40);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25);
    font-weight: 700;
}

/* Popover Épisodes */
.sh-episodes-popover-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 280px;
    overflow-y: auto;
}
.sh-popover-episode-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.10);
    cursor: pointer;
    transition: all 0.18s ease;
}
.sh-popover-episode-row:hover {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.22);
    transform: scale(1.02);
}
.sh-popover-episode-row.selected {
    background: rgba(255, 255, 255, 0.20);
    border-color: rgba(255, 255, 255, 0.35);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.sh-popover-ep-thumb {
    position: relative;
    width: 64px;
    height: 38px;
    border-radius: 6px;
    overflow: hidden;
    background: #000;
    flex-shrink: 0;
}
.sh-popover-ep-thumb img { width: 100%; height: 100%; object-fit: cover; }
.sh-popover-ep-tag {
    position: absolute;
    bottom: 2px;
    left: 2px;
    font-size: 7.5px;
    font-weight: 800;
    padding: 1px 3px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.75);
    color: #ff9f0a;
}
.sh-popover-ep-meta { flex: 1; min-width: 0; }
.sh-popover-ep-name { font-size: 11px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sh-popover-ep-dur { font-size: 9.5px; color: rgba(255,255,255,0.50); }
.sh-popover-empty { font-size: 11px; color: rgba(255,255,255,0.45); padding: 10px; text-align: center; }
`;
        document.head.appendChild(style);
    }
}

export default VideoPlayer;
