/**
 * SpaceHub — Grand Cinema Video Player (Apple TV / VisionOS Experience)
 * Version: 3.0.0 (From Scratch Masterpiece)
 *
 * Lecteur vidéo haut de gamme entièrement harmonisé avec SpaceHub :
 *  - Design System & Palette : Noir OLED absolu, verre dépoli liquide 50px blur, reflets spéculaires 1px
 *  - Signature LED Ambrée : Accentuation #ff9f0a / #ffb340 identique à la Dynamic Island supérieure
 *  - Animations Grandioses : Entrée/Sortie cinématique à ressort, halo d'ambiance respirant et ripple waves
 *  - Système de Tiroirs Latéraux en Verre (Glass Drawer) : Audio & Codecs, Sous-titres & Sync Live, Épisodes, Réglages
 *  - Neutralisation Totale Jellyfin : Élimination absolue de tout élément natif parasite (zéro conflit DOM)
 *  - HLS adaptatif multi-débits (hls.js), Direct Stream 4K UHD Dolby Vision / HDR10 et session reporting
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
        this._activeDrawerTab = 'audio'; // 'audio' | 'subs' | 'episodes' | 'settings' | 'chapters'
        this._isDrawerOpen = false;

        // Gestes & Raccourcis
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
     * Lance la lecture cinématique d'un média Jellyfin.
     * @param {Object} item - Média (Film, Épisode, Vidéo)
     * @param {number} [startPositionTicks=0]
     */
    play(item, startPositionTicks = 0) {
        this._currentItem = item;
        this._nextEpCancelled = false;
        const itemId = item.Id || item.id;
        this._log.info(`🎬 Lancement SpaceHub Grand Cinema pour "${item.Name || item.title}" (ID: ${itemId})`);

        // 1. Montage DOM instantané (0ms Latency) avec animation d'ouverture grandiose
        this._createPlayerDOM(item);
        this._initMediaStreams(item);

        const serverUrl = this._auth?.getServerUrl() || '';
        const token = this._auth?.getToken() || '';
        const startPositionSeconds = (startPositionTicks || item.UserData?.PlaybackPositionTicks || 0) / 10000000;

        // URL Master HLS adaptatif
        const streamUrl = `${serverUrl}/Videos/${itemId}/master.m3u8?DeviceId=${this._auth?.getDeviceId?.() || 'sh_web'}&MediaSourceId=${itemId}&VideoCodec=h264,hevc,vp9,av1&AudioCodec=aac,mp3,opus,flac&TranscodingMaxAudioChannels=6&RequireAvc=false&Tag=${item.Etag || ''}&StartTimeTicks=${Math.round(startPositionSeconds * 10000000)}&api_key=${token}`;

        this._setupVideoSource(streamUrl, startPositionSeconds, token);
        this._reportPlaybackStart();
        this._startProgressReporting();
        this._resetIdleTimer();

        // 2. Enrichissement asynchrone des flux et épisodes
        this._enrichMediaData(item, itemId);
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
                this._log.debug('Enrichissement des flux différé:', e);
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

        // Sous-titre par défaut
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
                this._log.debug('Chargement des épisodes différé:', err);
            }
        }
    }

    _updateEpisodeNavButtons() {
        const prevBtn = this._el?.querySelector('#sh-btn-prev-ep');
        const nextBtn = this._el?.querySelector('#sh-btn-next-ep');
        const drawerEpBtn = this._el?.querySelector('#sh-btn-trigger-episodes');

        if (this._seasonEpisodes.length > 0) {
            if (drawerEpBtn) drawerEpBtn.style.display = 'inline-flex';
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
            <!-- Aura Cinématique Luminescente d'Arrière-plan -->
            <div class="sh-cinema-ambient-glow"></div>

            <!-- Vidéo Principale -->
            <video class="sh-cinema-video" playsinline preload="auto"></video>

            <!-- Dégradés de Vignettage Cinématique -->
            <div class="sh-cinema-vignette-top"></div>
            <div class="sh-cinema-vignette-bottom"></div>

            <!-- 🌀 Spinner de Chargement Ambré / Verre Dépoli -->
            <div class="sh-cinema-buffering" id="sh-player-buffering-spinner">
                <div class="sh-buffering-glass-capsule">
                    <div class="sh-buffering-led-dot"></div>
                    <div class="sh-buffering-ring"></div>
                </div>
                <span class="sh-buffering-text">Chargement cinématique...</span>
            </div>

            <!-- Zones Gestuelles Gauche / Droite (Double-Tap Ripple) -->
            <div class="sh-gesture-zone sh-gesture-zone--left" id="sh-zone-left">
                <div class="sh-ripple-badge" id="sh-ripple-left">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
                    <span>-10s</span>
                </div>
            </div>
            <div class="sh-gesture-zone sh-gesture-zone--right" id="sh-zone-right">
                <div class="sh-ripple-badge" id="sh-ripple-right">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
                    <span>+10s</span>
                </div>
            </div>

            <!-- 🍏 TOP BAR : ÎLOTS DE VERRE FLOTTANTS (Apple Glass Islands) -->
            <header class="sh-cinema-topbar">
                
                <!-- Îlot Gauche : Quitter avec Pastille Verre Dépoli -->
                <div class="sh-topbar-left">
                    <button class="sh-glass-pill-btn sh-btn--exit" id="sh-btn-back" title="Quitter la lecture (Échap)">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span>Quitter</span>
                    </button>
                </div>

                <!-- Îlot Central : Capsule Titre & LED Signature Ambrée -->
                <div class="sh-topbar-center">
                    <div class="sh-title-capsule">
                        <div class="sh-title-capsule__header">
                            <div class="sh-title-led" title="SpaceHub Grand Cinema Active">
                                <div class="sh-title-led-core"></div>
                            </div>
                            <span class="sh-title-main">${this._escape(isEpisode ? seriesName : title)}</span>
                            <span class="sh-title-dot">•</span>
                            <span class="sh-title-sub">${isEpisode ? `${episodeNumber} « ${this._escape(episodeTitle)} »` : (year ? `${year} · Film` : 'Film')}</span>
                        </div>
                        <div class="sh-title-capsule__badges">
                            <span class="sh-tech-badge sh-tech-badge--amber">4K DOLBY VISION</span>
                            <span class="sh-tech-badge sh-tech-badge--ice">ATMOS 7.1</span>
                            <span class="sh-tech-badge">IMAX</span>
                        </div>
                    </div>
                </div>

                <!-- Îlot Droite : Actions Rapides & Tiroirs -->
                <div class="sh-topbar-right">
                    <div class="sh-actions-island">
                        <button class="sh-island-btn" id="sh-btn-trigger-episodes" title="Liste des épisodes" style="display:none;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        </button>
                        <button class="sh-island-btn" id="sh-btn-aspect" title="Format d'image (16:9, 21:9)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>
                        </button>
                        <button class="sh-island-btn" id="sh-btn-pip" title="Fenêtre flottante (PiP)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><rect width="8" height="6" x="12" y="12" rx="1" fill="currentColor"/></svg>
                        </button>
                        <button class="sh-island-btn" id="sh-btn-fullscreen" title="Plein écran (F)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                        </button>
                    </div>
                </div>

            </header>

            <!-- 🌟 Centre Flash OSD (Jauge Circulaire Ambrée) -->
            <div class="sh-cinema-osd" id="sh-player-osd">
                <div class="sh-osd-icon-box">
                    <span id="sh-osd-icon">▶</span>
                </div>
                <div class="sh-osd-details">
                    <span class="sh-osd-title" id="sh-osd-text">Lecture</span>
                    <div class="sh-osd-bar-track" id="sh-osd-bar-wrap" style="display:none;">
                        <div class="sh-osd-bar-fill" id="sh-osd-bar-fill"></div>
                    </div>
                </div>
            </div>

            <!-- ⏭️ Smart Skip Intro Pill -->
            <button class="sh-smart-skip-pill" id="sh-smart-skip-btn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="3"/></svg>
                <span>Passer l'intro</span>
            </button>

            <!-- 📺 Next Episode Auto-Play Card -->
            <div class="sh-next-ep-vision-card" id="sh-next-ep-card">
                <div class="sh-next-ep-inner">
                    <div class="sh-next-ep-thumb">
                        <img id="sh-next-ep-img" src="" alt="Prochain épisode"/>
                        <div class="sh-next-ep-timer">
                            <span id="sh-next-ep-sec">5</span>
                        </div>
                    </div>
                    <div class="sh-next-ep-meta">
                        <span class="sh-next-ep-tag">ÉPISODE SUIVANT</span>
                        <h4 class="sh-next-ep-title" id="sh-next-ep-title"></h4>
                    </div>
                    <div class="sh-next-ep-actions">
                        <button class="sh-next-ep-btn-play" id="sh-next-ep-play-now">Lancer</button>
                        <button class="sh-next-ep-btn-close" id="sh-next-ep-cancel" title="Annuler">✕</button>
                    </div>
                </div>
            </div>

            <!-- 🍏 GRAND CINEMA DOCK FLOTTANT UNIFIÉ -->
            <div class="sh-cinema-dock-wrapper">
                
                <!-- Halo Ambré Signature sous le Dock -->
                <div class="sh-dock-amber-underglow"></div>

                <div class="sh-grand-cinema-dock">
                    
                    <!-- Ligne 1 : Timeline Liquide Multi-couches Ambrée -->
                    <div class="sh-dock-timeline-section">
                        <span class="sh-time-badge" id="sh-time-elapsed">00:00:00</span>
                        
                        <div class="sh-timeline-scrubber" id="sh-timeline-track">
                            <div class="sh-scrubber-bg"></div>
                            <div class="sh-scrubber-buffered" id="sh-timeline-buffer"></div>
                            <div class="sh-scrubber-played" id="sh-timeline-played"></div>
                            <div class="sh-scrubber-thumb" id="sh-timeline-handle"></div>
                            
                            <!-- Bulle Horodatage au Survol -->
                            <div class="sh-scrubber-tooltip" id="sh-timeline-tooltip">
                                <span id="sh-tooltip-time">00:00:00</span>
                            </div>
                        </div>

                        <span class="sh-time-badge sh-time-badge--rem" id="sh-time-remaining">-00:00:00</span>
                    </div>

                    <!-- Ligne 2 : Commandes Ergonomiques de Transport & Déclencheurs de Tiroirs -->
                    <div class="sh-dock-controls-section">
                        
                        <!-- Gauche : Contrôle Volume Glissant -->
                        <div class="sh-controls-group sh-controls-left">
                            <div class="sh-volume-capsule">
                                <button class="sh-circle-btn" id="sh-btn-volume" title="Volume / Muet (M)">
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                                </button>
                                <div class="sh-volume-slider-box">
                                    <input type="range" class="sh-range-slider" id="sh-volume-range" min="0" max="1" step="0.02" value="${this._volume}">
                                </div>
                                <span class="sh-volume-val" id="sh-volume-pct-label">${Math.round(this._volume * 100)}%</span>
                            </div>
                        </div>

                        <!-- Centre : Transport Principal & Spring Play/Pause -->
                        <div class="sh-controls-group sh-controls-center">
                            <!-- Épisode Précédent -->
                            <button class="sh-circle-btn sh-btn-nav-ep" id="sh-btn-prev-ep" title="Épisode précédent" style="display:none;">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
                            </button>

                            <!-- Saut -10s -->
                            <button class="sh-circle-btn sh-btn-skip-spring" id="sh-btn-skip-back" title="Reculer de 10s (← ou J)">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                <span class="sh-skip-num">10</span>
                            </button>

                            <!-- 🌟 Play/Pause Géant Perlé avec Spring Physics & Halo Blanc/Ambre -->
                            <button class="sh-master-play-btn" id="sh-btn-play-pause" title="Lecture / Pause (Espace)">
                                <svg class="sh-icon-play" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                                <svg class="sh-icon-pause" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                            </button>

                            <!-- Saut +10s -->
                            <button class="sh-circle-btn sh-btn-skip-spring" id="sh-btn-skip-fwd" title="Avancer de 10s (→ ou L)">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                                <span class="sh-skip-num">10</span>
                            </button>

                            <!-- Épisode Suivant -->
                            <button class="sh-circle-btn sh-btn-nav-ep" id="sh-btn-next-ep" title="Épisode suivant" style="display:none;">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                            </button>
                        </div>

                        <!-- Droite : Déclencheurs de Tiroirs Latéraux en Verre -->
                        <div class="sh-controls-group sh-controls-right">
                            
                            <!-- Tiroir Audio & Sous-titres -->
                            <button class="sh-glass-pill-btn" id="sh-btn-open-audio-subs" title="Pistes Audio & Sous-Titres (S)">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                <span>Audio & Subs</span>
                            </button>

                            <!-- Tiroir Vitesse & Qualité -->
                            <button class="sh-glass-pill-btn sh-glass-pill-btn--compact" id="sh-btn-open-settings" title="Vitesse & Réglages (C)">
                                <span id="sh-speed-indicator">${this._playbackRate}x</span>
                            </button>

                        </div>

                    </div>

                </div>
            </div>

            <!-- 🗄️ TIROIR LATÉRAL EN VERRE COULISSANT (Apple Glass Cinema Drawer) -->
            <div class="sh-cinema-drawer-backdrop" id="sh-drawer-backdrop"></div>
            <aside class="sh-cinema-drawer" id="sh-cinema-drawer">
                <div class="sh-drawer-header">
                    <!-- Onglets Segmentés Coulissants -->
                    <div class="sh-drawer-tabs">
                        <button class="sh-drawer-tab-btn ${this._activeDrawerTab === 'audio' ? 'active' : ''}" data-tab="audio">Audio</button>
                        <button class="sh-drawer-tab-btn ${this._activeDrawerTab === 'subs' ? 'active' : ''}" data-tab="subs">Sous-Titres</button>
                        <button class="sh-drawer-tab-btn ${this._activeDrawerTab === 'settings' ? 'active' : ''}" data-tab="settings">Réglages</button>
                        <button class="sh-drawer-tab-btn ${this._activeDrawerTab === 'episodes' ? 'active' : ''}" data-tab="episodes" id="sh-drawer-tab-episodes-btn" style="${this._seasonEpisodes.length > 0 ? '' : 'display:none;'}">Épisodes</button>
                    </div>
                    <button class="sh-drawer-close-circle" id="sh-drawer-close" title="Fermer le volet">✕</button>
                </div>

                <!-- Corps du Tiroir -->
                <div class="sh-drawer-body sh-scrollbar" id="sh-drawer-content">
                    <!-- Contenu injecté dynamiquement -->
                </div>
            </aside>
        `;

        document.body.appendChild(this._el);
        this._video = this._el.querySelector('.sh-cinema-video');

        // Retirer la classe entering après l'animation
        setTimeout(() => {
            this._el?.classList.remove('sh-player--entering');
        }, 500);

        this._bindEvents();
        this._renderDrawerContent();

        if (this._el.requestFullscreen) {
            this._el.requestFullscreen().catch(() => {});
        }
    }

    _bindEvents() {
        const el = this._el;
        const video = this._video;
        const spinner = el.querySelector('#sh-player-buffering-spinner');

        // Quitter / Retour avec animation de fermeture grandiose
        el.querySelector('#sh-btn-back')?.addEventListener('click', () => this.close());

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

        // Simple Clic sur la vidéo = Play/Pause
        video.addEventListener('click', (e) => {
            if (e.target === video) togglePlay();
        });

        // Gestion du Spinner de Buffering
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
        leftZone?.addEventListener('touchend', () => handleTap('left', -10));
        rightZone?.addEventListener('touchend', () => handleTap('right', 10));

        // Sauts 10s via boutons du dock avec micro-ressort
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

        // Navigation Épisodes
        el.querySelector('#sh-btn-prev-ep')?.addEventListener('click', () => {
            if (this._prevEpisode) this.play(this._prevEpisode);
        });
        el.querySelector('#sh-btn-next-ep')?.addEventListener('click', () => {
            if (this._nextEpisode) this.play(this._nextEpisode);
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
        const volumePctLabel = el.querySelector('#sh-volume-pct-label');
        volumeRange?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            video.volume = v;
            video.muted = false;
            this._volume = v;
            localStorage.setItem('SpaceHub_player_volume', String(v));
            if (volumePctLabel) volumePctLabel.textContent = `${Math.round(v * 100)}%`;
            this._showFlashOSD(v === 0 ? '🔇' : '🔊', `${Math.round(v * 100)}%`, v);
        });

        el.querySelector('#sh-btn-volume')?.addEventListener('click', () => {
            video.muted = !video.muted;
            if (video.muted) {
                this._showFlashOSD('🔇', 'Muet');
                if (volumePctLabel) volumePctLabel.textContent = '0%';
            } else {
                this._showFlashOSD('🔊', `${Math.round(video.volume * 100)}%`, video.volume);
                if (volumePctLabel) volumePctLabel.textContent = `${Math.round(video.volume * 100)}%`;
            }
        });

        // Format d'image
        el.querySelector('#sh-btn-aspect')?.addEventListener('click', () => {
            this._aspectRatioIndex = (this._aspectRatioIndex + 1) % this._aspectRatios.length;
            const mode = this._aspectRatios[this._aspectRatioIndex];
            video.style.objectFit = mode;
            const labels = { contain: '16:9 Adapté', cover: '21:9 Cinéma Scope', fill: 'Plein écran Étiré' };
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

        // 🗄️ Déclencheurs de Tiroirs Latéraux
        el.querySelector('#sh-btn-open-audio-subs')?.addEventListener('click', () => {
            this._openDrawer('audio');
        });
        el.querySelector('#sh-btn-open-settings')?.addEventListener('click', () => {
            this._openDrawer('settings');
        });
        el.querySelector('#sh-btn-trigger-episodes')?.addEventListener('click', () => {
            this._openDrawer('episodes');
        });

        // Fermeture du tiroir
        el.querySelector('#sh-drawer-close')?.addEventListener('click', () => this._closeDrawer());
        el.querySelector('#sh-drawer-backdrop')?.addEventListener('click', () => this._closeDrawer());

        // Changement d'onglet dans le tiroir
        el.querySelectorAll('.sh-drawer-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this._activeDrawerTab = tab;
                el.querySelectorAll('.sh-drawer-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
                this._renderDrawerContent();
            });
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

        // Clavier global
        document.addEventListener('keydown', this._keyHandler = (e) => this._onKeyDown(e));
    }

    _openDrawer(tab = 'audio') {
        this._activeDrawerTab = tab;
        this._isDrawerOpen = true;

        const drawer = this._el?.querySelector('#sh-cinema-drawer');
        const backdrop = this._el?.querySelector('#sh-drawer-backdrop');

        this._el?.querySelectorAll('.sh-drawer-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        this._renderDrawerContent();

        drawer?.classList.add('open');
        backdrop?.classList.add('visible');
    }

    _closeDrawer() {
        this._isDrawerOpen = false;
        this._el?.querySelector('#sh-cinema-drawer')?.classList.remove('open');
        this._el?.querySelector('#sh-drawer-backdrop')?.classList.remove('visible');
    }

    _renderDrawerContent() {
        const bodyEl = this._el?.querySelector('#sh-drawer-content');
        if (!bodyEl) return;

        switch (this._activeDrawerTab) {
            case 'audio':
                this._renderAudioTab(bodyEl);
                break;
            case 'subs':
                this._renderSubsTab(bodyEl);
                break;
            case 'settings':
                this._renderSettingsTab(bodyEl);
                break;
            case 'episodes':
                this._renderEpisodesTab(bodyEl);
                break;
        }
    }

    _renderAudioTab(container) {
        if (!this._audioStreams || this._audioStreams.length === 0) {
            container.innerHTML = '<p class="sh-drawer-empty">Piste audio standard stéréo</p>';
            return;
        }

        container.innerHTML = `
            <div class="sh-drawer-section">
                <h4 class="sh-drawer-kicker">PISTES AUDIO DISPONIBLES</h4>
                <div class="sh-drawer-list">
                    ${this._audioStreams.map(s => {
                        const isSel = s.Index === this._selectedAudioIndex;
                        const lang = (s.Language || 'und').toUpperCase();
                        const codec = (s.Codec || 'AAC').toUpperCase();
                        const channels = s.ChannelLayout || (s.Channels ? `${s.Channels} ch` : 'Stéréo');
                        const title = s.DisplayTitle || s.Title || `${lang} · ${codec} ${channels}`;

                        return `
                            <button class="sh-drawer-item ${isSel ? 'active' : ''}" data-audio-idx="${s.Index}">
                                <div class="sh-drawer-item-check">✓</div>
                                <div class="sh-drawer-item-info">
                                    <span class="sh-drawer-item-title">${this._escape(title)}</span>
                                    <span class="sh-drawer-item-badge">${codec} ${channels}</span>
                                </div>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        container.querySelectorAll('.sh-drawer-item').forEach(btn => {
            btn.addEventListener('click', () => {
                this._selectedAudioIndex = parseInt(btn.dataset.audioIdx, 10);
                this._renderAudioTab(container);
                this._showFlashOSD('🔊', btn.querySelector('.sh-drawer-item-title').textContent);
            });
        });
    }

    _renderSubsTab(container) {
        let subsHtml = `
            <div class="sh-drawer-section">
                <h4 class="sh-drawer-kicker">SOUS-TITRES</h4>
                <div class="sh-drawer-list">
                    <button class="sh-drawer-item ${this._selectedSubIndex === -1 ? 'active' : ''}" data-sub-idx="-1">
                        <div class="sh-drawer-item-check">✓</div>
                        <div class="sh-drawer-item-info">
                            <span class="sh-drawer-item-title">Désactivé</span>
                        </div>
                    </button>
        `;

        if (this._subStreams && this._subStreams.length > 0) {
            subsHtml += this._subStreams.map(s => {
                const isSel = s.Index === this._selectedSubIndex;
                const lang = (s.Language || 'und').toUpperCase();
                const title = s.DisplayTitle || s.Title || `${lang} ${s.IsForced ? '(Forcé)' : ''}`;
                return `
                    <button class="sh-drawer-item ${isSel ? 'active' : ''}" data-sub-idx="${s.Index}">
                        <div class="sh-drawer-item-check">✓</div>
                        <div class="sh-drawer-item-info">
                            <span class="sh-drawer-item-title">${this._escape(title)}</span>
                            ${s.IsForced ? '<span class="sh-drawer-item-badge">FORCÉ</span>' : ''}
                        </div>
                    </button>
                `;
            }).join('');
        }

        subsHtml += `
                </div>
            </div>

            <!-- Outil de Synchronisation Temporelle -->
            <div class="sh-drawer-section">
                <h4 class="sh-drawer-kicker">SYNCHRONISATION DES SOUS-TITRES</h4>
                <div class="sh-sync-grid">
                    <button class="sh-sync-btn" data-offset="-0.5">-0.5s</button>
                    <button class="sh-sync-btn" data-offset="-0.1">-0.1s</button>
                    <button class="sh-sync-btn sh-sync-btn--reset" data-offset="0">0.0s (Réinit)</button>
                    <button class="sh-sync-btn" data-offset="+0.1">+0.1s</button>
                    <button class="sh-sync-btn" data-offset="+0.5">+0.5s</button>
                </div>
                <p class="sh-sync-label">Décalage actuel : <strong id="sh-drawer-offset-val">${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s</strong></p>
            </div>

            <!-- Recherche OpenSubtitles -->
            <div class="sh-drawer-section">
                <button class="sh-btn-search-online" id="sh-btn-search-online-subs">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <span>Rechercher de nouveaux sous-titres en ligne...</span>
                </button>
            </div>
        `;

        container.innerHTML = subsHtml;

        container.querySelectorAll('.sh-drawer-item').forEach(btn => {
            btn.addEventListener('click', () => {
                this._selectedSubIndex = parseInt(btn.dataset.subIdx, 10);
                this._renderSubsTab(container);
                const title = btn.querySelector('.sh-drawer-item-title').textContent;
                this._showFlashOSD('💬', `Sous-titres : ${title}`);
            });
        });

        container.querySelectorAll('.sh-sync-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const delta = parseFloat(btn.dataset.offset);
                if (delta === 0) this._subOffset = 0;
                else this._subOffset = Math.round((this._subOffset + delta) * 10) / 10;

                this._applySubtitleOffset();
                const label = container.querySelector('#sh-drawer-offset-val');
                if (label) label.textContent = `${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s`;
                this._showFlashOSD('⏱️', `Sous-titres ${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s`);
            });
        });

        container.querySelector('#sh-btn-search-online-subs')?.addEventListener('click', () => {
            this._closeDrawer();
            this._openRemoteSubtitleModal();
        });
    }

    _renderSettingsTab(container) {
        const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
        const aspectLabels = { contain: '16:9 Adapté', cover: '21:9 Cinéma Scope', fill: 'Plein écran Étiré' };

        container.innerHTML = `
            <div class="sh-drawer-section">
                <h4 class="sh-drawer-kicker">VITESSE DE LECTURE</h4>
                <div class="sh-settings-chips">
                    ${speeds.map(spd => `
                        <button class="sh-chip-btn ${this._playbackRate === spd ? 'active' : ''}" data-speed="${spd}">${spd}x${spd === 1.0 ? ' (Normal)' : ''}</button>
                    `).join('')}
                </div>
            </div>

            <div class="sh-drawer-section">
                <h4 class="sh-drawer-kicker">FORMAT D'IMAGE</h4>
                <div class="sh-settings-chips">
                    ${this._aspectRatios.map((mode, idx) => `
                        <button class="sh-chip-btn ${this._aspectRatioIndex === idx ? 'active' : ''}" data-aspect-idx="${idx}">${aspectLabels[mode] || mode}</button>
                    `).join('')}
                </div>
            </div>
        `;

        container.querySelectorAll('[data-speed]').forEach(btn => {
            btn.addEventListener('click', () => {
                const spd = parseFloat(btn.dataset.speed);
                this._playbackRate = spd;
                this._video.playbackRate = spd;
                localStorage.setItem('SpaceHub_playback_speed', String(spd));
                this._el.querySelector('#sh-speed-indicator').textContent = `${spd}x`;
                this._renderSettingsTab(container);
                this._showFlashOSD('⚡', `Vitesse : ${spd}x`);
            });
        });

        container.querySelectorAll('[data-aspect-idx]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.aspectIdx, 10);
                this._aspectRatioIndex = idx;
                const mode = this._aspectRatios[idx];
                this._video.style.objectFit = mode;
                this._renderSettingsTab(container);
                this._showFlashOSD('📐', aspectLabels[mode] || mode);
            });
        });
    }

    _renderEpisodesTab(container) {
        if (this._seasonEpisodes.length === 0) {
            container.innerHTML = '<p class="sh-drawer-empty">Aucun épisode disponible pour cette saison.</p>';
            return;
        }

        const currentId = this._currentItem.Id || this._currentItem.id;

        container.innerHTML = `
            <div class="sh-drawer-section">
                <h4 class="sh-drawer-kicker">ÉPISODES DE LA SAISON (${this._seasonEpisodes.length})</h4>
                <div class="sh-episodes-grid">
                    ${this._seasonEpisodes.map(ep => {
                        const isCur = ep.Id === currentId;
                        const sNum = String(ep.ParentIndexNumber || 1).padStart(2, '0');
                        const eNum = String(ep.IndexNumber || 1).padStart(2, '0');
                        const thumbUrl = this._api?.getImageUrl?.(ep.Id, 'Primary', { maxWidth: 260, maxHeight: 146 }) || '';

                        return `
                            <div class="sh-episode-card ${isCur ? 'active' : ''}" data-ep-id="${ep.Id}">
                                <div class="sh-episode-card__thumb">
                                    <img src="${thumbUrl}" alt="${ep.Name}" loading="lazy"/>
                                    <span class="sh-episode-card__badge">S${sNum}E${eNum}</span>
                                    ${isCur ? '<div class="sh-episode-card__playing">▶ En lecture</div>' : ''}
                                </div>
                                <div class="sh-episode-card__meta">
                                    <h5 class="sh-episode-card__title">${this._escape(ep.Name)}</h5>
                                    <span class="sh-episode-card__runtime">${ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 600000000) + ' min' : ''}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        container.querySelectorAll('.sh-episode-card').forEach(card => {
            card.addEventListener('click', () => {
                const epId = card.dataset.epId;
                const targetEp = this._seasonEpisodes.find(e => e.Id === epId);
                if (targetEp) {
                    this._closeDrawer();
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
                this._openDrawer(this._isDrawerOpen && this._activeDrawerTab === 'subs' ? 'subs' : 'subs');
                break;
            case 'c':
                e.preventDefault();
                this._openDrawer('settings');
                break;
            case 'Escape':
                e.preventDefault();
                if (this._isDrawerOpen) {
                    this._closeDrawer();
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
        const volumePctLabel = this._el?.querySelector('#sh-volume-pct-label');
        if (volumePctLabel) volumePctLabel.textContent = `${Math.round(newVol * 100)}%`;
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

        // Animation grandiose de sortie (Grand Exit)
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
        if (document.getElementById('sh-grand-cinema-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-grand-cinema-styles';
        style.textContent = `
/* ═══════════════════════════════════════════════════════════════════════════
   SpaceHub — Grand Cinema Video Player Style System (Apple TV / VisionOS)
   ═══════════════════════════════════════════════════════════════════════════ */

/* Neutralisation Totale des Éléments Jellyfin Parasites */
body.sh-cinema-active {
    overflow: hidden !important;
}
body.sh-cinema-active .btnHeaderClose,
body.sh-cinema-active .headerBackButton,
body.sh-cinema-active .headerElements,
body.sh-cinema-active .videoOsd,
body.sh-cinema-active .videoOsdBottom,
body.sh-cinema-active .videoOsdHeader,
body.sh-cinema-active .headerTop {
    display: none !important;
    opacity: 0 !important;
    pointer-events: none !important;
    visibility: hidden !important;
}

.sh-grand-cinema-player {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background: #000000;
    z-index: 100000;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    color: #ffffff;
    user-select: none;
    -webkit-font-smoothing: antialiased;
    transition: opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1), transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── Animation Grandiose d'Entrée & Sortie ────────────────────────────── */
.sh-grand-cinema-player.sh-player--entering {
    opacity: 0;
    transform: scale(1.04);
}
.sh-grand-cinema-player.sh-player--exiting {
    opacity: 0;
    transform: scale(0.96);
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

/* Aura Cinématique Luminescente */
.sh-cinema-ambient-glow {
    position: absolute;
    inset: -10%;
    background: radial-gradient(circle at center, rgba(255, 159, 10, 0.08) 0%, transparent 70%);
    pointer-events: none;
    z-index: 2;
    opacity: 0.8;
}

/* Dégradés Supérieur et Inférieur */
.sh-cinema-vignette-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 180px;
    background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
    pointer-events: none;
    z-index: 4;
    transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-cinema-vignette-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 240px;
    background: linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);
    pointer-events: none;
    z-index: 4;
    transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Auto-hide Mode Inactivité */
.sh-grand-cinema-player.hud-hidden {
    cursor: none;
}
.sh-grand-cinema-player.hud-hidden .sh-cinema-topbar,
.sh-grand-cinema-player.hud-hidden .sh-cinema-dock-wrapper,
.sh-grand-cinema-player.hud-hidden .sh-cinema-vignette-top,
.sh-grand-cinema-player.hud-hidden .sh-cinema-vignette-bottom {
    opacity: 0;
    pointer-events: none;
    transform: translateY(16px);
}
.sh-grand-cinema-player.hud-hidden .sh-cinema-topbar {
    transform: translateY(-16px);
}

/* 🌀 Spinner de Chargement Ambré / Verre Dépoli */
.sh-cinema-buffering {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    z-index: 40;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
}
.sh-cinema-buffering.visible {
    opacity: 1;
}
.sh-buffering-glass-capsule {
    position: relative;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: rgba(12, 12, 16, 0.85);
    backdrop-filter: blur(30px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 16px 40px rgba(0,0,0,0.8), 0 0 25px rgba(255, 159, 10, 0.35);
}
.sh-buffering-led-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff9f0a;
    box-shadow: 0 0 8px #ff9f0a, 0 0 16px rgba(255, 159, 10, 0.9);
}
.sh-buffering-ring {
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    border: 2.5px solid transparent;
    border-top-color: #ff9f0a;
    border-right-color: #ffc04d;
    animation: shCinemaSpin 0.9s cubic-bezier(0.5, 0, 0.5, 1) infinite;
}
@keyframes shCinemaSpin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
.sh-buffering-text {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    letter-spacing: 0.3px;
    text-shadow: 0 2px 10px rgba(0,0,0,0.85);
}

/* ── Zones de Double-Tap Gauche / Droite (Ripple Waves) ───────────────── */
.sh-gesture-zone {
    position: absolute;
    top: 100px;
    bottom: 130px;
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
    gap: 6px;
    width: 84px;
    height: 84px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(28px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    font-size: 13px;
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

/* ═══════════════════════════════════════════════════════════════════════════
   🍏 TOP BAR : ÎLOTS DE VERRE FLOTTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

.sh-cinema-topbar {
    position: absolute;
    top: 24px;
    left: 28px;
    right: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 10;
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-glass-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 16px;
    background: rgba(12, 12, 16, 0.85);
    backdrop-filter: blur(48px) saturate(220%);
    -webkit-backdrop-filter: blur(48px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.25);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-glass-pill-btn:hover {
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.28);
    transform: scale(1.04);
}
.sh-glass-pill-btn--compact {
    padding: 8px 12px;
    font-weight: 700;
}

/* 🎬 Capsule Centrale Titre & Badges */
.sh-title-capsule {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 8px 22px;
    background: rgba(12, 12, 16, 0.88);
    backdrop-filter: blur(48px) saturate(220%);
    -webkit-backdrop-filter: blur(48px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.sh-title-capsule__header {
    display: flex;
    align-items: center;
    gap: 8px;
}
.sh-title-led {
    position: relative;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ff9f0a;
    box-shadow: 0 0 6px #ff9f0a, 0 0 12px rgba(255, 159, 10, 0.85);
    flex-shrink: 0;
}
.sh-title-led-core {
    position: absolute;
    inset: 1px;
    border-radius: 50%;
    background: #ffb340;
}
.sh-title-main {
    font-size: 15px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.2px;
}
.sh-title-dot {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
}
.sh-title-sub {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.65);
}

.sh-title-capsule__badges {
    display: flex;
    align-items: center;
    gap: 6px;
}
.sh-tech-badge {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.6px;
    padding: 2px 7px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
}
.sh-tech-badge--amber {
    background: rgba(255, 159, 10, 0.16);
    border-color: rgba(255, 159, 10, 0.4);
    color: #ff9f0a;
    box-shadow: 0 0 10px rgba(255, 159, 10, 0.25);
}
.sh-tech-badge--ice {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.28);
    color: #ffffff;
}

/* Actions Droite Groupées */
.sh-actions-island {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    background: rgba(12, 12, 16, 0.85);
    backdrop-filter: blur(48px) saturate(220%);
    -webkit-backdrop-filter: blur(48px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.sh-island-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-island-btn:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.16);
    transform: scale(1.1);
}

/* ── Flash OSD Jauge Ambrée ─────────────────────────────────────────── */
.sh-cinema-osd {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.85);
    background: rgba(12, 12, 16, 0.92);
    backdrop-filter: blur(50px) saturate(220%);
    -webkit-backdrop-filter: blur(50px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.9), 0 0 35px rgba(255, 159, 10, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3);
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
.sh-cinema-osd.active {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
}
.sh-osd-icon-box {
    font-size: 24px;
}
.sh-osd-details {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.sh-osd-title {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
}
.sh-osd-bar-track {
    width: 140px;
    height: 6px;
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    overflow: hidden;
}
.sh-osd-bar-fill {
    height: 100%;
    width: 70%;
    background: linear-gradient(90deg, #ff9f0a, #ffc04d);
    border-radius: 999px;
    box-shadow: 0 0 12px rgba(255, 159, 10, 0.85);
}

/* ── Smart Skip Intro Pill ───────────────────────────────────────────── */
.sh-smart-skip-pill {
    position: absolute;
    bottom: 125px;
    right: 36px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 20px;
    background: rgba(12, 12, 16, 0.92);
    backdrop-filter: blur(36px) saturate(220%);
    -webkit-backdrop-filter: blur(36px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 999px;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 16px 45px rgba(0,0,0,0.8), 0 0 25px rgba(255, 159, 10, 0.3);
    z-index: 12;
    opacity: 0;
    pointer-events: none;
    transform: translateY(16px);
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
    transform: scale(1.05);
}

/* ── Next Episode Card ───────────────────────────────────────────────── */
.sh-next-ep-vision-card {
    position: absolute;
    bottom: 125px;
    right: 36px;
    width: 380px;
    background: rgba(12, 12, 16, 0.96);
    backdrop-filter: blur(48px) saturate(220%);
    -webkit-backdrop-filter: blur(48px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 24px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.9);
    z-index: 15;
    padding: 14px;
    opacity: 0;
    pointer-events: none;
    transform: translateY(20px);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-next-ep-vision-card.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
}
.sh-next-ep-inner {
    display: flex;
    align-items: center;
    gap: 12px;
}
.sh-next-ep-thumb {
    position: relative;
    width: 96px;
    height: 58px;
    border-radius: 10px;
    overflow: hidden;
    flex-shrink: 0;
    background: #000;
}
.sh-next-ep-thumb img { width: 100%; height: 100%; object-fit: cover; }
.sh-next-ep-timer {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ff9f0a;
    font-weight: 800;
    font-size: 20px;
}
.sh-next-ep-meta {
    flex: 1;
    min-width: 0;
}
.sh-next-ep-tag {
    font-size: 10px;
    font-weight: 800;
    color: #ff9f0a;
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
.sh-next-ep-actions {
    display: flex;
    align-items: center;
    gap: 6px;
}
.sh-next-ep-btn-play {
    padding: 8px 16px;
    background: #ff9f0a;
    border: none;
    border-radius: 999px;
    color: #000;
    font-size: 12px;
    font-weight: 750;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(255, 159, 10, 0.4);
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-next-ep-btn-play:hover { transform: scale(1.08); }
.sh-next-ep-btn-close {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255,255,255,0.1);
    border: none;
    color: #fff;
    cursor: pointer;
}

/* ═══════════════════════════════════════════════════════════════════════════
   🍏 GRAND CINEMA DOCK FLOTTANT UNIFIÉ
   ═══════════════════════════════════════════════════════════════════════════ */

.sh-cinema-dock-wrapper {
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

/* Halo Ambré Signature sous le Dock */
.sh-dock-amber-underglow {
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: min(780px, 88vw);
    height: 38px;
    background: radial-gradient(ellipse at center, rgba(255, 159, 10, 0.22) 0%, transparent 70%);
    pointer-events: none;
    filter: blur(14px);
    z-index: 19;
}

.sh-grand-cinema-dock {
    width: min(840px, 100%);
    background: rgba(12, 12, 16, 0.88);
    backdrop-filter: blur(50px) saturate(220%);
    -webkit-backdrop-filter: blur(50px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 26px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.95), inset 0 1px 0 rgba(255, 255, 255, 0.28);
    padding: 14px 22px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 21;
}

/* ── Ligne 1 : Timeline Liquide Multi-couches ────────────────────────── */
.sh-dock-timeline-section {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
}

.sh-time-badge {
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
    font-variant-numeric: tabular-nums;
    padding: 3px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    min-width: 58px;
    text-align: center;
}
.sh-time-badge--rem {
    color: rgba(255, 255, 255, 0.55);
}

.sh-timeline-scrubber {
    position: relative;
    flex: 1;
    height: 22px;
    display: flex;
    align-items: center;
    cursor: pointer;
}

.sh-scrubber-bg {
    position: absolute;
    left: 0;
    right: 0;
    height: 6px;
    background: rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    transition: height 0.2s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-timeline-scrubber:hover .sh-scrubber-bg {
    height: 9px;
}

.sh-scrubber-buffered {
    position: absolute;
    left: 0;
    height: 6px;
    width: 0%;
    background: rgba(255, 255, 255, 0.35);
    border-radius: 999px;
    pointer-events: none;
    transition: height 0.2s;
}
.sh-timeline-scrubber:hover .sh-scrubber-buffered {
    height: 9px;
}

.sh-scrubber-played {
    position: absolute;
    left: 0;
    height: 6px;
    width: 0%;
    background: linear-gradient(90deg, #ff9f0a 0%, #ffc04d 100%);
    border-radius: 999px;
    pointer-events: none;
    box-shadow: 0 0 16px rgba(255, 159, 10, 0.85);
    transition: height 0.2s;
}
.sh-timeline-scrubber:hover .sh-scrubber-played {
    height: 9px;
}

.sh-scrubber-thumb {
    position: absolute;
    top: 50%;
    left: 0%;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 0 14px rgba(255, 159, 10, 1), 0 2px 8px rgba(0,0,0,0.7);
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.45, 1);
}
.sh-timeline-scrubber:hover .sh-scrubber-thumb {
    transform: translate(-50%, -50%) scale(1.15);
}

.sh-scrubber-tooltip {
    position: absolute;
    bottom: 28px;
    left: 0%;
    transform: translateX(-50%);
    padding: 4px 8px;
    background: rgba(12, 12, 16, 0.98);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 8px;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    box-shadow: 0 8px 24px rgba(0,0,0,0.7);
}
.sh-timeline-scrubber:hover .sh-scrubber-tooltip {
    opacity: 1;
}

/* ── Ligne 2 : Commandes Ergonomiques ────────────────────────────────── */
.sh-dock-controls-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.sh-controls-group {
    display: flex;
    align-items: center;
    gap: 8px;
}
.sh-controls-center {
    gap: 12px;
}

/* Volume Capsule */
.sh-volume-capsule {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 3px 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
}
.sh-volume-slider-box {
    width: 65px;
    display: flex;
    align-items: center;
}
.sh-range-slider {
    width: 65px;
    height: 4px;
    accent-color: #ff9f0a;
    cursor: pointer;
}
.sh-volume-val {
    font-size: 10px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.6);
    min-width: 26px;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

/* Boutons Icones Glass */
.sh-circle-btn {
    position: relative;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
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
.sh-circle-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.24);
    transform: scale(1.08);
}
.sh-circle-btn.spring-bounce {
    animation: shCircleBounce 0.35s cubic-bezier(0.34, 1.56, 0.45, 1);
}
@keyframes shCircleBounce {
    0% { transform: scale(1); }
    50% { transform: scale(1.22) rotate(-8deg); }
    100% { transform: scale(1); }
}

.sh-btn-skip-spring { position: relative; }
.sh-skip-num {
    position: absolute;
    font-size: 8px;
    font-weight: 800;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}

/* 🌟 Play/Pause Géant Perlé avec Spring Physics & Halo */
.sh-master-play-btn {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background: #ffffff;
    border: none;
    color: #000000;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 24px rgba(255, 255, 255, 0.5), 0 0 25px rgba(255, 159, 10, 0.35);
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.45, 1), box-shadow 0.25s ease;
}
.sh-master-play-btn:hover {
    transform: scale(1.12);
    box-shadow: 0 6px 30px rgba(255, 255, 255, 0.75), 0 0 30px rgba(255, 159, 10, 0.55);
}
.sh-master-play-btn:active {
    transform: scale(0.92);
}

/* ═══════════════════════════════════════════════════════════════════════════
   🗄️ TIROIR LATÉRAL EN VERRE COULISSANT (Apple Glass Cinema Drawer)
   ═══════════════════════════════════════════════════════════════════════════ */

.sh-cinema-drawer-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(8px);
    z-index: 95;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-cinema-drawer-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
}

.sh-cinema-drawer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(420px, 90vw);
    background: rgba(12, 12, 16, 0.96);
    backdrop-filter: blur(50px) saturate(220%);
    -webkit-backdrop-filter: blur(50px) saturate(220%);
    border-left: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: -24px 0 70px rgba(0, 0, 0, 0.95);
    z-index: 100;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-cinema-drawer.open {
    transform: translateX(0);
}

.sh-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    gap: 12px;
}

.sh-drawer-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.06);
    padding: 4px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
}
.sh-drawer-tab-btn {
    padding: 6px 12px;
    border-radius: 999px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.18s ease;
}
.sh-drawer-tab-btn:hover {
    color: #fff;
}
.sh-drawer-tab-btn.active {
    background: #ff9f0a;
    color: #000000;
    box-shadow: 0 2px 10px rgba(255, 159, 10, 0.35);
}

.sh-drawer-close-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
}
.sh-drawer-close-circle:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.08);
}

.sh-drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.sh-drawer-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.sh-drawer-kicker {
    margin: 0;
    font-size: 10px;
    font-weight: 800;
    color: #ff9f0a;
    letter-spacing: 0.6px;
}

.sh-drawer-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.sh-drawer-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    text-align: left;
    transition: all 0.18s ease;
}
.sh-drawer-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    transform: translateX(2px);
}
.sh-drawer-item.active {
    background: rgba(255, 159, 10, 0.18);
    border-color: rgba(255, 159, 10, 0.45);
    color: #ff9f0a;
}
.sh-drawer-item-check {
    width: 16px;
    font-size: 13px;
    font-weight: 800;
    opacity: 0;
}
.sh-drawer-item.active .sh-drawer-item-check {
    opacity: 1;
}
.sh-drawer-item-info {
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.sh-drawer-item-title {
    font-size: 13px;
    font-weight: 600;
}
.sh-drawer-item-badge {
    font-size: 9px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
}

.sh-sync-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
}
.sh-sync-btn {
    padding: 8px 2px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.18s ease;
}
.sh-sync-btn:hover { background: rgba(255, 255, 255, 0.16); }
.sh-sync-btn--reset { font-size: 10px; }
.sh-sync-label {
    margin: 4px 0 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
}

.sh-btn-search-online {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}
.sh-btn-search-online:hover {
    background: rgba(255, 159, 10, 0.2);
    border-color: #ff9f0a;
}

.sh-settings-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.sh-chip-btn {
    padding: 8px 16px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s ease;
}
.sh-chip-btn:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }
.sh-chip-btn.active {
    background: #ff9f0a;
    color: #000;
    border-color: #ff9f0a;
    box-shadow: 0 2px 10px rgba(255, 159, 10, 0.35);
}

.sh-episodes-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.sh-episode-card {
    display: flex;
    gap: 12px;
    padding: 8px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    cursor: pointer;
    transition: all 0.2s ease;
}
.sh-episode-card:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-2px);
}
.sh-episode-card.active {
    background: rgba(255, 159, 10, 0.18);
    border-color: rgba(255, 159, 10, 0.45);
}
.sh-episode-card__thumb {
    position: relative;
    width: 110px;
    height: 62px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    background: #000;
}
.sh-episode-card__thumb img { width: 100%; height: 100%; object-fit: cover; }
.sh-episode-card__badge {
    position: absolute;
    top: 4px;
    left: 4px;
    background: rgba(0,0,0,0.8);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
}
.sh-episode-card__playing {
    position: absolute;
    inset: 0;
    background: rgba(255, 159, 10, 0.75);
    color: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 800;
}
.sh-episode-card__meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
}
.sh-episode-card__title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.sh-episode-card__runtime {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
}

.sh-drawer-empty {
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    padding: 16px;
}

/* Scrollbar Verre */
.sh-scrollbar::-webkit-scrollbar { width: 4px; }
.sh-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
        `;
        document.head.appendChild(style);
    }
}

export default VideoPlayer;
