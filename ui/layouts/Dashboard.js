/**
 * SpaceHub — Dashboard Layout Manager
 * Version: 1.0.0
 *
 * Gestionnaire de tableau de bord modulaire.
 * Gère une grille responsive de widgets, le réordonnancement, l'ajout/suppression,
 * et la persistance de l'agencement via SettingsManager.
 *
 * Usage:
 *   const dashboard = new Dashboard({
 *       containerId: 'spacehub-dashboard',
 *       settings: SpaceHub.core.settings,
 *       eventBus: SpaceHub.core.eventBus
 *   });
 *   dashboard.registerWidget('continue-watching', ContinueWatchingWidget);
 *   dashboard.registerWidget('latest-additions', LatestAdditionsWidget);
 *   await dashboard.render();
 */

'use strict';

import Logger from '../../core/Logger.js';
import HeroSpotlightComponent from '../components/HeroSpotlightComponent.js';
import AppSidebarDrawer from '../components/AppSidebarDrawer.js';
import ModalSlideUpSheet from '../components/ModalSlideUpSheet.js';
import GooeyCarouselScroller from '../components/GooeyCarouselScroller.js';

import LibrariesWidget from '../widgets/LibrariesWidget.js';
import ContinueWatchingWidget from '../widgets/ContinueWatchingWidget.js';
import LatestAdditionsWidget from '../widgets/LatestAdditionsWidget.js';
import MoviesWidget from '../widgets/MoviesWidget.js';
import TvShowsWidget from '../widgets/TvShowsWidget.js';
import CollectionsWidget from '../widgets/CollectionsWidget.js';
import MusicWidget from '../widgets/MusicWidget.js';
import AnimeWidget from '../widgets/AnimeWidget.js';
import DynamicLibraryWidget from '../widgets/DynamicLibraryWidget.js';

import { 
    JellyseerrRequestsWidget, 
    JellyseerrTrendingWidget, 
    JellyseerrPopularMoviesWidget, 
    JellyseerrPopularSeriesWidget, 
    JellyseerrUpcomingWidget 
} from '../../integrations/jellyseerr/JellyseerrWidgets.js';
import { QBittorrentSpeedWidget, QBittorrentActiveWidget } from '../../integrations/qbittorrent/QBittorrentWidgets.js';
import { UpcomingEpisodesWidget, SonarrQueueWidget } from '../../integrations/sonarr/SonarrWidgets.js';
import { UpcomingMoviesWidget, RadarrQueueWidget } from '../../integrations/radarr/RadarrWidgets.js';
import { BazarrWantedWidget } from '../../integrations/bazarr/BazarrWidgets.js';
import { ProwlarrStatusWidget } from '../../integrations/prowlarr/ProwlarrWidgets.js';
import UnifiedCalendarWidget from '../widgets/UnifiedCalendarWidget.js';
import MediaAnalyticsWidget from '../widgets/MediaAnalyticsWidget.js';

class Dashboard {
    /**
     * @param {{
     *   containerId?: string,
     *   settings?: import('../../core/SettingsManager.js').default,
     *   eventBus?: import('../../core/EventBus.js').default,
     * }} [options]
     */
    constructor(options = {}) {
        this.containerId = options.containerId || 'sh-dashboard';
        this._settings   = options.settings || window.SpaceHub?.core?.settings || null;
        this._eventBus   = options.eventBus || window.SpaceHub?.core?.eventBus || null;
        this._log        = new Logger('Dashboard');

        /** @type {Map<string, typeof Object>} Widget Class Registry */
        this._registeredWidgets = new Map();

        /** @type {Map<string, Object>} Active widget instances (instanceId -> instance) */
        this._activeWidgets = new Map();

        /** @type {HTMLElement|null} */
        this._container = null;

        this._heroComponent = new HeroSpotlightComponent();
        this._sidebarDrawer = new AppSidebarDrawer();
        this._modalSlideUpSheet = new ModalSlideUpSheet();
        this._gooeyScroller = new GooeyCarouselScroller();

        this.registerWidget('user-libraries', LibrariesWidget);
        this.registerWidget('continue-watching', ContinueWatchingWidget);
        this.registerWidget('latest-additions', LatestAdditionsWidget);
        this.registerWidget('movies', MoviesWidget);
        this.registerWidget('tv-shows', TvShowsWidget);
        this.registerWidget('anime', AnimeWidget);
        this.registerWidget('collections-sagas', CollectionsWidget);
        this.registerWidget('music-soundtracks', MusicWidget);

        // Intégrations Servarr, Jellyseerr & Téléchargements
        this.registerWidget('jellyseerr-trending', JellyseerrTrendingWidget);
        this.registerWidget('jellyseerr-popular-movies', JellyseerrPopularMoviesWidget);
        this.registerWidget('jellyseerr-popular-series', JellyseerrPopularSeriesWidget);
        this.registerWidget('jellyseerr-upcoming', JellyseerrUpcomingWidget);
        this.registerWidget('jellyseerr-requests', JellyseerrRequestsWidget);
        this.registerWidget('qbittorrent-speed', QBittorrentSpeedWidget);
        this.registerWidget('qbittorrent-active', QBittorrentActiveWidget);
        this.registerWidget('sonarr-upcoming', UpcomingEpisodesWidget);
        this.registerWidget('sonarr-queue', SonarrQueueWidget);
        this.registerWidget('radarr-upcoming', UpcomingMoviesWidget);
        this.registerWidget('radarr-queue', RadarrQueueWidget);
        this.registerWidget('bazarr-wanted', BazarrWantedWidget);
        this.registerWidget('prowlarr-status', ProwlarrStatusWidget);
        this.registerWidget('unified-calendar', UnifiedCalendarWidget);
        this.registerWidget('media-analytics', MediaAnalyticsWidget);

        if (!window.SpaceHub) window.SpaceHub = {};
        if (!window.SpaceHub.ui) window.SpaceHub.ui = {};
        window.SpaceHub.ui.modalSlideUpSheet = this._modalSlideUpSheet;
        window.SpaceHub.ui.gooeyScroller = this._gooeyScroller;

        this._injectStyles();
        this._log.info('Initialisé.');
    }

    // ─── Enregistrement des Widgets ───────────────────────────────────────────

    /**
     * Enregistre une classe de widget disponible pour le dashboard.
     * @param {string} id - Identifiant du type de widget (ex: 'continue-watching')
     * @param {typeof Object} WidgetClass
     */
    registerWidget(id, WidgetClass) {
        if (this._registeredWidgets.get(id) === WidgetClass) { return; }
        this._registeredWidgets.set(id, WidgetClass);
        this._log.debug(`Widget type enregistré : "${id}"`);
    }

    /**
     * Retourne tous les types de widgets enregistrés.
     * @returns {string[]}
     */
    getRegisteredWidgetTypes() {
        return [...this._registeredWidgets.keys()];
    }

    // ─── Rendu & Cycle de vie ──────────────────────────────────────────────────

    /**
     * Monte et rend le Dashboard dans le DOM.
     * @param {HTMLElement|string} [target] - Élément ou sélecteur cible
     */
    async render(target = null) {
        if (target) {
            this._container = typeof target === 'string' ? document.querySelector(target) : target;
        }

        if (!this._container) {
            this._container = document.getElementById(this.containerId);
            if (!this._container) {
                this._container = document.createElement('div');
                this._container.id = this.containerId;
                const mainContent = document.querySelector('.mainAnimatedPages') || document.querySelector('.page') || document.body;
                mainContent.prepend(this._container);
            }
        }

        // Monter la Sidebar Drawer Fantôme globale
        this._sidebarDrawer.render(document.body);

        this._container.className = 'sh-dashboard sh-scrollbar';
        this._container.innerHTML = `
            <!-- Ambilight Dynamic Aura (Fond Réactif Flouté) -->
            <div class="sh-ambient-aura" id="sh-ambient-aura"></div>

            <!-- Hero Spotlight Cinématique Apple TV (100vh) -->
            <div id="${this.containerId}-hero"></div>

            <div class="sh-dashboard-body">
                <!-- Étagère Univers & Collections (Liquid Spring Morphing Track) -->
                <div class="sh-genre-chips-container">
                    <div class="sh-genre-bar-track">
                        <div class="sh-genre-sliding-pill" id="sh-genre-sliding-pill"></div>
                        <button class="sh-genre-chip active" data-genre="all">
                            <svg class="sh-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg>
                            <span>Tous les Titres</span>
                        </button>
                        <button class="sh-genre-chip" data-genre="scifi">
                            <svg class="sh-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"></circle><path d="M12 9v6M9 12h6"></path><path d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M19.07 4.93l-4.24 4.24M9.17 14.83l-4.24 4.24"></path></svg>
                            <span>Science-Fiction</span>
                        </button>
                        <button class="sh-genre-chip" data-genre="action">
                            <svg class="sh-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                            <span>Action & Aventure</span>
                        </button>
                        <button class="sh-genre-chip" data-genre="4k">
                            <svg class="sh-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m7 8 2 4-2 4"></path><path d="M13 8v8"></path><path d="m17 8-3 4 3 4"></path></svg>
                            <span>Master 4K UHD</span>
                        </button>
                        <button class="sh-genre-chip" data-genre="series">
                            <svg class="sh-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>
                            <span>Séries Événement</span>
                        </button>
                        <button class="sh-genre-chip" data-genre="oscars">
                            <svg class="sh-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.45 1-1 1H7c-.55 0-1 .45-1 1v1h12v-1c0-.55-.45-1-1-1h-2c-.55 0-1-.45-1-1v-2.34"></path><path d="M6 4h12v7a6 6 0 0 1-12 0V4z"></path></svg>
                            <span>Primés aux Oscars</span>
                        </button>
                    </div>
                </div>

                <!-- Grille des Carrousels & Widgets -->
                <div class="sh-dashboard__grid" id="${this.containerId}-grid"></div>
            </div>
        `;


        // ── Moteur "Elastic Liquid Spring Pill" avec Squash & Stretch ──
        const updatePill = (activeBtn, animate = true) => {
            const track = this._container.querySelector('.sh-genre-bar-track');
            const pill  = this._container.querySelector('#sh-genre-sliding-pill');
            if (!track || !pill || !activeBtn) return;

            const trackRect = track.getBoundingClientRect();
            const btnRect   = activeBtn.getBoundingClientRect();
            const targetX   = btnRect.left - trackRect.left;
            const targetW   = btnRect.width;

            if (!animate) {
                pill.style.transition = 'none';
                pill.style.transform  = `translateX(${targetX}px) scaleX(1)`;
                pill.style.width      = `${targetW}px`;
                // Force reflow then re-enable transition
                pill.getBoundingClientRect();
                pill.style.transition = '';
                return;
            }

            // Phase 1 : étirement élastique (Squash & Stretch)
            pill.style.transition = `transform 160ms cubic-bezier(0.5, 0, 1, 0.5), width 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275)`;
            pill.style.transform  = `translateX(${targetX}px) scaleX(1.10)`;
            pill.style.width      = `${targetW}px`;

            // Phase 2 : amorti avec rebond naturel
            requestAnimationFrame(() => requestAnimationFrame(() => {
                pill.style.transition = `transform 380ms cubic-bezier(0.175, 0.885, 0.32, 1.275), width 380ms cubic-bezier(0.175, 0.885, 0.32, 1.275)`;
                pill.style.transform  = `translateX(${targetX}px) scaleX(1)`;
            }));
        };

        const chips = this._container.querySelectorAll('.sh-genre-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                chips.forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');
                // Emoji Pulse
                const emoji = e.currentTarget.querySelector('.sh-chip-emoji');
                if (emoji) {
                    emoji.classList.remove('sh-chip-emoji--pulse');
                    void emoji.offsetWidth; // reflow
                    emoji.classList.add('sh-chip-emoji--pulse');
                }
                updatePill(e.currentTarget, true);

                // ── Filtrage visuel réel par genre/type ──
                const genre = e.currentTarget.dataset.genre;
                const cards = this._container.querySelectorAll('.sh-card:not(.sh-card--skeleton)');
                cards.forEach((card, i) => {
                    let show = true;
                    if (genre !== 'all') {
                        const type = (card.closest('[data-widget-type]')?.dataset.widgetType || '').toLowerCase();
                        const codec = card.querySelector('.sh-card__codec-tag')?.textContent?.toLowerCase() || '';
                        if (genre === 'series') show = type.includes('tv') || codec.includes('saison') || codec.includes('série');
                        else if (genre === 'scifi') show = codec.includes('4k') || codec.includes('imax') || true; // all shown for demo
                        else if (genre === '4k') show = codec.includes('4k') || codec.includes('uhd') || codec.includes('imax');
                        else if (genre === 'action') show = true; // à brancher sur les genres réels Jellyfin
                        else if (genre === 'oscars') show = true;
                    }
                    card.style.transition = `opacity 280ms ease ${Math.min(i * 20, 200)}ms, transform 320ms cubic-bezier(0.175, 0.885, 0.32, 1.275) ${Math.min(i * 20, 200)}ms`;
                    if (show) {
                        card.style.opacity = '1';
                        card.style.transform = 'scale(1) translateY(0)';
                        card.style.pointerEvents = '';
                    } else {
                        card.style.opacity = '0.18';
                        card.style.transform = 'scale(0.95) translateY(4px)';
                        card.style.pointerEvents = 'none';
                    }
                });
            });
        });

        // Positionnement initial sans animation + au resize
        requestAnimationFrame(() => {
            const activeChip = this._container.querySelector('.sh-genre-chip.active');
            if (activeChip) updatePill(activeChip, false);
        });
        window.addEventListener('resize', () => {
            const activeChip = this._container.querySelector('.sh-genre-chip.active');
            if (activeChip) updatePill(activeChip, false);
        });

        // ── Quick-Resume Floating Mini-Dock (Uniquement si une vraie lecture est en cours) ──
        this._initResumeDock();

        const hiddenSections = new Set(this._settings?.get('dashboard.hiddenSections', []));

        // Monter le Hero Spotlight si activé
        const heroEl = this._container.querySelector(`#${this.containerId}-hero`);
        if (heroEl) {
            if (!hiddenSections.has('hero-spotlight')) {
                heroEl.style.display = '';
                await this._heroComponent.render(heroEl);
            } else {
                heroEl.style.display = 'none';
                heroEl.innerHTML = '';
            }
        }

        // Masquer la barre de genres si désactivée
        const genreTrack = this._container.querySelector('.sh-genre-chips-container');
        if (genreTrack) {
            genreTrack.style.display = hiddenSections.has('user-genres') ? 'none' : '';
        }

        // Charger et monter les étagères et widgets du Dashboard
        await this._loadLayout();

        // Attacher le défilement tactile Gooey Carousel sur toutes les étagères horizontales uniquement
        setTimeout(() => {
            this._gooeyScroller.attach('.sh-genre-chips-container, .sh-card-grid, .sh-shelf-row, .sh-cards-row');
        }, 500);
    }

    /**
     * Initialise le mini-dock flottant de reprise uniquement si une vraie lecture existe.
     */
    async _initResumeDock() {
        try {
            const api = window.SpaceHub?.jellyfin?.api;
            if (!api?.getResumeItems) return;
            const items = await api.getResumeItems(1);
            if (!items || items.length === 0) return;

            const resumeItem = items[0];
            const percent = Math.round(resumeItem.UserData?.PlayedPercentage || 0);
            const remainingMin = resumeItem.RunTimeTicks && resumeItem.UserData?.PlaybackPositionTicks
                ? Math.max(1, Math.round((resumeItem.RunTimeTicks - resumeItem.UserData.PlaybackPositionTicks) / 600000000))
                : 20;

            const imageType = (resumeItem.BackdropImageTags && resumeItem.BackdropImageTags.length > 0)
                ? 'Backdrop'
                : (resumeItem.ImageTags?.Primary ? 'Primary' : (resumeItem.ImageTags?.Thumb ? 'Thumb' : 'Primary'));
            const thumbUrl = api.getImageUrl(resumeItem.Id, imageType, { maxWidth: 300, maxHeight: 180 });

            // Nettoyage ancien dock s'il existe
            document.getElementById('sh-resume-dock')?.remove();

            const resumeDock = document.createElement('div');
            resumeDock.id = 'sh-resume-dock';
            resumeDock.className = 'sh-resume-dock';
            resumeDock.innerHTML = `
                <div class="sh-resume-dock__thumb-wrap">
                    <img class="sh-resume-dock__thumb" src="${thumbUrl}" alt="${resumeItem.Name}" onerror="this.style.display='none'" />
                    <div class="sh-resume-dock__play-icon">▶</div>
                </div>
                <div class="sh-resume-dock__info">
                    <span class="sh-resume-dock__title">${resumeItem.Name}</span>
                    <span class="sh-resume-dock__meta">Reprendre • ${remainingMin}m restantes (${percent}%)</span>
                    <div class="sh-resume-dock__progress-bar">
                        <div class="sh-resume-dock__progress-fill" style="width: ${percent}%;"></div>
                    </div>
                </div>
                <button class="sh-resume-dock__btn-play" id="sh-resume-dock-play" title="Reprendre la lecture">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    <span>Reprendre</span>
                </button>
                <button class="sh-resume-dock__btn-dismiss" id="sh-resume-dock-dismiss" title="Masquer le dock" aria-label="Masquer">✕</button>
            `;
            document.body.appendChild(resumeDock);

            resumeDock.addEventListener('click', (e) => {
                if (e.target.closest('#sh-resume-dock-dismiss')) {
                    e.stopPropagation();
                    resumeDock.classList.remove('sh-resume-dock--visible');
                    resumeDock.dataset.dismissed = 'true';
                    return;
                }
                if (window.SpaceHub?.ui?.modalSlideUpSheet) {
                    window.SpaceHub.ui.modalSlideUpSheet.open(resumeItem);
                }
            });

            const updateResumeDock = () => {
                if (resumeDock.dataset.dismissed === 'true') return;
                const scrollY = window.scrollY || this._container?.scrollTop || 0;
                const heroHeight = window.innerHeight * 0.45;
                if (scrollY > heroHeight) {
                    resumeDock.classList.add('sh-resume-dock--visible');
                } else {
                    resumeDock.classList.remove('sh-resume-dock--visible');
                }
            };

            window.addEventListener('scroll', updateResumeDock, { passive: true });
            this._container?.addEventListener('scroll', updateResumeDock, { passive: true });
        } catch (err) {
            console.warn('[Dashboard] Erreur initialisation resume dock:', err);
        }
    }

    /**
     * Charge l'agencement sauvegardé ou applique l'agencement par défaut.
     */
    async _loadLayout() {
        const gridEl = this._container.querySelector(`#${this.containerId}-grid`);
        if (!gridEl) return;

        gridEl.innerHTML = '';
        this._activeWidgets.clear();

        // ── 1. Récupération des bibliothèques utilisateur Jellyfin ──
        let userViews = [];
        try {
            const api = window.SpaceHub?.jellyfin?.api;
            if (api?.getUserViews) {
                userViews = await api.getUserViews();
            }
            if ((!userViews || userViews.length === 0) && window.ApiClient?.getUserViews) {
                const rawViews = await window.ApiClient.getUserViews(api?.getUserId?.());
                userViews = rawViews?.Items || (Array.isArray(rawViews) ? rawViews : []);
            }
        } catch (e) {
            console.warn('[Dashboard] Erreur récupération getUserViews:', e);
        }

        // Identifier les bibliothèques déjà couvertes par des widgets dédiés (Films, Séries, Animés, Musique, Collections)
        const coveredLibraryIds = new Set();
        if (Array.isArray(userViews)) {
            for (const v of userViews) {
                const name = (v.Name || '').toLowerCase();
                const colType = (v.CollectionType || '').toLowerCase();

                // Est-ce la bibliothèque Anime ?
                if (name.includes('anime') || name.includes('animé') || name.includes('animation') || name.includes('manga') || colType.includes('anime')) {
                    coveredLibraryIds.add(v.Id);
                }
                // Est-ce la bibliothèque principale Films ?
                else if (name === 'films' || name === 'movies' || name === 'cinéma' || name === 'cinema' || colType === 'movies') {
                    coveredLibraryIds.add(v.Id);
                }
                // Est-ce la bibliothèque principale Séries ?
                else if (name === 'séries' || name === 'series' || name === 'séries tv' || name === 'tv shows' || name === 'tv' || colType === 'tvshows') {
                    coveredLibraryIds.add(v.Id);
                }
                // Est-ce la bibliothèque Musique ?
                else if (colType === 'music' || name === 'musique' || name === 'music') {
                    coveredLibraryIds.add(v.Id);
                }
                // Est-ce la bibliothèque Collections / Sagas ?
                else if (colType === 'boxsets' || name === 'collections' || name === 'sagas') {
                    coveredLibraryIds.add(v.Id);
                }
            }
        }

        // ── 2. Enregistrement des bibliothèques personnalisées (Documentaires, 4K, etc.) ──
        const customLibraryWidgetConfigs = [];
        if (Array.isArray(userViews)) {
            for (const v of userViews) {
                if (coveredLibraryIds.has(v.Id)) continue; // Ne pas doubler les sections dédiées

                const dynamicId = `library-${v.Id}`;
                if (!this._registeredWidgets.has(dynamicId)) {
                    const libView = v;
                    class CustomLibraryShelfWidget extends DynamicLibraryWidget {
                        constructor() {
                            super(libView);
                        }
                    }
                    this._registeredWidgets.set(dynamicId, CustomLibraryShelfWidget);
                }
                customLibraryWidgetConfigs.push({ widgetType: dynamicId, colSpan: 12 });
            }
        }

        // ── 3. Définition de l'Agencement Hiérarchique Parfait ──
        const defaultLayout = [
            // 1. En-tête & Navigation
            { widgetType: 'user-libraries', colSpan: 12 },
            // 2. Reprise & Nouveautés Serveur
            { widgetType: 'continue-watching', colSpan: 12 },
            { widgetType: 'latest-additions', colSpan: 12 },
            // 3. Rayons Multimédias Jellyfin (Dédoublonnés)
            { widgetType: 'movies', colSpan: 12 },
            { widgetType: 'tv-shows', colSpan: 12 },
            { widgetType: 'anime', colSpan: 12 },
            { widgetType: 'collections-sagas', colSpan: 12 },
            { widgetType: 'music-soundtracks', colSpan: 12 },
            // 4. Bibliothèques personnalisées du serveur (Documentaires, etc.)
            ...customLibraryWidgetConfigs,
            // 5. Découverte Streaming Mondial (Jellyseerr / TMDB)
            { widgetType: 'jellyseerr-trending', colSpan: 12 },
            { widgetType: 'jellyseerr-popular-movies', colSpan: 12 },
            { widgetType: 'jellyseerr-popular-series', colSpan: 12 },
            { widgetType: 'jellyseerr-upcoming', colSpan: 12 },
            { widgetType: 'jellyseerr-requests', colSpan: 12 },
            // 6. Calendrier & Statistiques
            { widgetType: 'unified-calendar', colSpan: 12 },
            { widgetType: 'media-analytics', colSpan: 12 },
            // 7. Flux Techniques & Téléchargements (Bas de page)
            { widgetType: 'qbittorrent-speed', colSpan: 6 },
            { widgetType: 'qbittorrent-active', colSpan: 6 },
            { widgetType: 'sonarr-upcoming', colSpan: 12 },
            { widgetType: 'radarr-upcoming', colSpan: 12 },
            { widgetType: 'bazarr-wanted', colSpan: 12 },
        ];

        let layout = this._settings?.get('dashboard.layout', defaultLayout) || defaultLayout;
        if (!Array.isArray(layout)) {
            layout = [...defaultLayout];
        }

        // Filtrer quick-actions et les anciens doublons dynamic-library
        layout = layout.filter(i => i && i.widgetType !== 'quick-actions' && !i.widgetType.startsWith('dynamic-library-'));

        // Retirer les rayons dynamiques qui feraient doublon avec anime, films, séries
        layout = layout.filter(i => {
            if (i.widgetType.startsWith('library-')) {
                const libId = i.widgetType.replace('library-', '');
                if (coveredLibraryIds.has(libId)) return false;
            }
            return true;
        });

                const hasUserCustomOrder = Boolean(localStorage.getItem('sh_dashboard_sections_order') || this._settings?.has('dashboard.sectionsOrder'));

        if (!hasUserCustomOrder) {
            // Layout par défaut épuré et percutant (6 sections clés)
            const DEFAULT_CLEAN_LAYOUT = [
                { widgetType: 'continue-watching', colSpan: 12 },
                { widgetType: 'latest-additions', colSpan: 12 },
                { widgetType: 'movies', colSpan: 12 },
                { widgetType: 'tv-shows', colSpan: 12 },
                { widgetType: 'jellyseerr-trending', colSpan: 12 },
                { widgetType: 'unified-calendar', colSpan: 12 }
            ];

            for (const item of DEFAULT_CLEAN_LAYOUT) {
                if (!layout.some(i => i.widgetType === item.widgetType)) {
                    layout.push(item);
                }
            }
        }

        // Hiérarchie de tri stricte pour l'affichage
        const sectionRankMap = new Map([
            ['hero-spotlight', 0],
            ['user-genres', 5],
            ['user-libraries', 10],
            ['continue-watching', 20],
            ['latest-additions', 25],
            ['movies', 30],
            ['tv-shows', 35],
            ['anime', 40],
            ['collections-sagas', 50],
            ['music-soundtracks', 60],
            ['jellyseerr-trending', 100],
            ['jellyseerr-popular-movies', 110],
            ['jellyseerr-popular-series', 120],
            ['jellyseerr-upcoming', 130],
            ['jellyseerr-requests', 140],
            ['unified-calendar', 150],
            ['media-analytics', 160],
            ['qbittorrent-speed', 170],
            ['qbittorrent-active', 180],
            ['sonarr-upcoming', 190],
            ['radarr-upcoming', 200],
            ['bazarr-wanted', 210],
        ]);

        const hiddenSections = new Set(this._settings?.get('dashboard.hiddenSections', []));
        const sectionOrderArr = JSON.parse(localStorage.getItem('sh_dashboard_sections_order') || 'null') || this._settings?.get('dashboard.sectionsOrder', []);

        // Tri hiérarchique garanti : les sections cœur (Films, Séries, Animés, Reprise) sont toujours au sommet
        layout.sort((a, b) => {
            const rankA = a.widgetType.startsWith('library-') ? 70 : (sectionRankMap.get(a.widgetType) ?? 999);
            const rankB = b.widgetType.startsWith('library-') ? 70 : (sectionRankMap.get(b.widgetType) ?? 999);
            return rankA - rankB;
        });

        let mountedIndex = 0;

        for (const item of layout) {
            if (hiddenSections.has(item.widgetType)) {
                continue;
            }

            const WidgetClass = this._registeredWidgets.get(item.widgetType);
            if (!WidgetClass) {
                this._log.warn(`Type de widget inconnu dans l'agencement : "${item.widgetType}"`);
                continue;
            }

            await this._mountWidget(WidgetClass, item, gridEl, mountedIndex);
            mountedIndex++;
        }
    }

    /**
     * Instancie et monte un widget dans la grille.
     */
    async _mountWidget(WidgetClass, itemConfig, gridEl, index = 0) {
        const widget = new WidgetClass();
        const instanceId = `sh-widget-${widget.id || itemConfig.widgetType}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

        const colSpan = itemConfig.colSpan || widget.defaultColSpan || 12;
        const widgetWrapper = document.createElement('div');
        widgetWrapper.className = `sh-dashboard__item sh-dashboard__item--col-${colSpan}`;
        widgetWrapper.style.animation = `shSectionFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(index * 50, 400)}ms backwards`;
        widgetWrapper.dataset.widgetType = itemConfig.widgetType;
        widgetWrapper.dataset.instanceId = instanceId;

        gridEl.appendChild(widgetWrapper);

        try {
            if (typeof widget.render === 'function') {
                await widget.render(widgetWrapper);
            }
            this._activeWidgets.set(instanceId, { widget, element: widgetWrapper, config: itemConfig });
        } catch (err) {
            this._log.error(`Erreur lors du rendu du widget "${itemConfig.widgetType}":`, err);
            widgetWrapper.innerHTML = `
                <div class="sh-widget-error">
                    <p>Erreur lors du chargement du widget : <strong>${itemConfig.widgetType}</strong></p>
                </div>
            `;
        }
    }

    /**
     * Actualise toutes les données des widgets actifs.
     */
    async refreshAll() {
        this._log.info('Actualisation de tous les widgets...');
        const promises = [];
        for (const { widget, element } of this._activeWidgets.values()) {
            if (typeof widget.refresh === 'function') {
                promises.push(widget.refresh(element));
            } else if (typeof widget.render === 'function') {
                promises.push(widget.render(element));
            }
        }
        await Promise.allSettled(promises);
        window.SpaceHub?.ui?.components?.toaster?.success('Dashboard actualisé !');
    }

    // ─── Modal de personnalisation ────────────────────────────────────────────

    _openCustomizeModal() {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        const available = this.getRegisteredWidgetTypes();
        const currentLayout = this._settings?.get('dashboard.layout', []) || [];

        const modal = new Modal({
            id: 'customize-dashboard',
            title: 'Personnaliser le Dashboard',
            size: 'md',
            content: `
                <div class="sh-dashboard-config">
                    <p style="margin-top:0; color:var(--sh-text-secondary);">Activez ou réordonnez les blocs affichés sur votre page d'accueil SpaceHub.</p>
                    <div class="sh-dashboard-config__list">
                        ${available.map(type => {
                            const isEnabled = currentLayout.some(i => i.widgetType === type);
                            return `
                                <label class="sh-dashboard-config__item">
                                    <input type="checkbox" data-widget-type="${type}" ${isEnabled ? 'checked' : ''} />
                                    <span>${type.replace(/-/g, ' ').toUpperCase()}</span>
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>
            `,
            footer: `
                <button class="sh-btn sh-btn--ghost" data-action="cancel">Annuler</button>
                <button class="sh-btn sh-btn--primary" data-action="save">Enregistrer</button>
            `,
            onOpen: (m) => {
                m._el.querySelector('[data-action="cancel"]').addEventListener('click', () => m.close());
                m._el.querySelector('[data-action="save"]').addEventListener('click', () => {
                    const checkboxes = m._el.querySelectorAll('input[data-widget-type]');
                    const newLayout = [];
                    checkboxes.forEach(cb => {
                        if (cb.checked) {
                            newLayout.push({ widgetType: cb.dataset.widgetType, colSpan: 12 });
                        }
                    });
                    this._settings?.set('dashboard.layout', newLayout);
                    this._loadLayout();
                    window.SpaceHub?.ui?.components?.toaster?.success('Agencement enregistré !');
                    m.close();
                });
            }
        });
        modal.open();
    }

    // ─── Styles ───────────────────────────────────────────────────────────────

    _injectStyles() {
        if (document.getElementById('sh-dashboard-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-dashboard-styles';
        style.textContent = `
.sh-dashboard {
    width: 100%;
    margin: 0;
    padding: 0 0 64px 0;
    box-sizing: border-box;
    font-family: var(--sh-font-family, sans-serif);
    color: #ffffff;
    background-color: #000000;
}

.sh-dashboard__grid {
    max-width: 1560px;
    margin: 0 auto;
    padding: 0 48px 60px;
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 36px;
    position: relative;
}

/* Ambient Blur Floor Reflection (Sol en verre fumé) */
.sh-dashboard__grid::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 48px;
    right: 48px;
    height: 30px;
    background: radial-gradient(ellipse at 50% 100%, rgba(124, 106, 255, 0.05) 0%, transparent 70%);
    filter: blur(14px);
    pointer-events: none;
}

.sh-dashboard__item {
    display: flex;
    flex-direction: column;
    grid-column: span 12;
}

@keyframes shSectionFadeIn {
    from {
        opacity: 0;
        transform: translateY(16px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.sh-dashboard__item--col-12 { grid-column: span 12; }
.sh-dashboard__item--col-6  { grid-column: span 6; }
.sh-dashboard__item--col-4  { grid-column: span 4; }

@media (max-width: 900px) {
    .sh-dashboard__item--col-6,
    .sh-dashboard__item--col-4 {
        grid-column: span 12;
    }
}

/* ── Responsive Mobile ───────────────────────────────────────── */
@media (max-width: 768px) {
    .sh-dashboard__grid {
        padding: 0 16px 60px;
        gap: 24px;
    }
    .sh-dashboard__grid::after {
        left: 16px;
        right: 16px;
    }
    .sh-genre-chips-container {
        padding: 0 16px;
        margin: 24px auto 20px;
    }
    .sh-widget__title {
        font-size: 18px;
    }
}

@media (max-width: 480px) {
    .sh-dashboard__grid {
        padding: 0 10px 48px;
        gap: 20px;
    }
    .sh-genre-chips-container {
        padding: 0 10px;
    }
}

/* Base Widget Container */
/* Zero-Container Apple TV Shelves */
.sh-widget {
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: relative;
    overflow: visible;
}

.sh-widget__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.sh-widget__refresh-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 50% !important;
    background: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    color: rgba(255, 255, 255, 0.65) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    cursor: pointer !important;
    outline: none !important;
    padding: 0 !important;
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
}

.sh-widget__refresh-btn:hover {
    background: rgba(255, 255, 255, 0.14) !important;
    border-color: rgba(255, 255, 255, 0.28) !important;
    color: #ffffff !important;
    transform: rotate(45deg) scale(1.08) !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
}

.sh-widget__refresh-btn:active {
    transform: rotate(180deg) scale(0.92) !important;
    background: rgba(255, 255, 255, 0.20) !important;
}

.sh-widget__refresh-btn svg {
    width: 14px !important;
    height: 14px !important;
    stroke: currentColor !important;
    stroke-width: 2.3 !important;
    fill: none !important;
    pointer-events: none !important;
}

.sh-widget__sync-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 5px 12px !important;
    border-radius: 9999px !important;
    background: rgba(255, 255, 255, 0.06) !important;
    border: 1px solid rgba(255, 255, 255, 0.14) !important;
    color: rgba(255, 255, 255, 0.85) !important;
    font-size: 11.5px !important;
    font-weight: 650 !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    cursor: pointer !important;
    outline: none !important;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.sh-widget__sync-btn:hover {
    background: rgba(255, 255, 255, 0.15) !important;
    border-color: rgba(255, 255, 255, 0.30) !important;
    color: #ffffff !important;
    transform: translateY(-1px) !important;
}

.sh-widget__sync-btn svg {
    width: 13px !important;
    height: 13px !important;
    stroke: currentColor !important;
    stroke-width: 2.3 !important;
    fill: none !important;
}

.sh-widget__title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.4px;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 10px;
}

.sh-shelf-title-icon {
    flex-shrink: 0;
    stroke: rgba(255, 255, 255, 0.85);
    stroke-width: 2.1;
    transition: transform 180ms ease, stroke 180ms ease;
}

.sh-widget:hover .sh-shelf-title-icon {
    stroke: #ffffff;
    transform: scale(1.08);
}

.sh-widget__content {
    flex: 1;
}

.sh-widget-error {
    background: rgba(255, 92, 122, 0.1);
    border: 1px solid var(--sh-color-danger, #ff5c7a);
    border-radius: var(--sh-radius-md, 12px);
    padding: var(--sh-space-4, 16px);
    color: var(--sh-color-danger, #ff5c7a);
}

.sh-dashboard-config__list {
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-3, 12px);
    margin-top: var(--sh-space-4, 16px);
}

.sh-dashboard-config__item {
    display: flex;
    align-items: center;
    gap: var(--sh-space-3, 12px);
    padding: var(--sh-space-3, 12px);
    background: var(--sh-bg-surface-2, #22222e);
    border-radius: var(--sh-radius-sm, 8px);
    cursor: pointer;
}

/* ── Ambilight Dynamic Aura Full-Bleed (Sans boîte ni coupure) ─ */
.sh-ambient-aura {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    background: radial-gradient(circle 800px at 50% 30%, rgba(124, 106, 255, 0.08) 0%, rgba(255, 107, 107, 0.03) 45%, transparent 70%);
    filter: blur(160px);
    pointer-events: none;
    z-index: 0;
    transition: background 1.2s ease, opacity 0.8s ease;
}

/* ── Segmented Control "Elastic Liquid Spring Pill" ────────── */
.sh-genre-chips-container {
    max-width: 1560px;
    margin: 36px auto 28px;
    padding: 0 48px;
    display: flex;
    align-items: center;
    overflow-x: auto;
    scrollbar-width: none;
}
.sh-genre-chips-container::-webkit-scrollbar { display: none; }

/* Rail entièrement invisible — se fond dans le fond OLED */
.sh-genre-bar-track {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: transparent;
    border: none;
    border-radius: 9999px;
    padding: 4px;
}

/* Pilule glissante "Mercury Glass" — très subtile, zéro contraste brutal */
.sh-genre-sliding-pill {
    position: absolute;
    top: 4px;
    left: 0;
    height: calc(100% - 8px);
    background: rgba(255, 255, 255, 0.10);
    backdrop-filter: blur(20px) saturate(200%);
    -webkit-backdrop-filter: blur(20px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 9999px;
    box-shadow:
        0 2px 12px rgba(0, 0, 0, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.18),
        inset 0 -1px 0 rgba(0, 0, 0, 0.12);
    pointer-events: none;
    z-index: 1;
    will-change: transform, width;
    transform-origin: center center;
}

.sh-genre-chip {
    position: relative;
    z-index: 2;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.50);
    padding: 8px 16px;
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: color 220ms ease;
    display: flex;
    align-items: center;
    gap: 5px;
}
.sh-genre-chip:hover {
    color: rgba(255, 255, 255, 0.85);
}
.sh-genre-chip.active {
    color: #ffffff;
    font-weight: 650;
}

/* Emoji Pulse au clic */
.sh-chip-emoji {
    display: inline-block;
    transition: transform 200ms ease;
}
.sh-chip-emoji--pulse {
    animation: sh-emoji-pulse 420ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
@keyframes sh-emoji-pulse {
    0%   { transform: scale(1); }
    45%  { transform: scale(1.30); }
    100% { transform: scale(1); }
}

/* ── Card Display & Animations ──────────────────────────── */
.sh-card {
    opacity: 1;
    transform: translateY(0);
    transition: opacity 280ms ease, transform 300ms cubic-bezier(0.34, 1.20, 0.64, 1);
}
.sh-card--skeleton {
    opacity: 1 !important;
    transform: none !important;
}

/* ── Tactile Spring Press Physics (tout le monde) ───────────── */
.sh-card:active,
.sh-genre-chip:active,
.sh-ctx-item:active,
.sh-card__bookmark-btn:active {
    transform: scale(0.97) !important;
    transition: transform 80ms ease !important;
}

/* ── Ambient Chromatic Light Leak au survol ─────────────────── */
.sh-card__image-wrap::after {
    content: '';
    position: absolute;
    top: -30%;
    right: -20%;
    width: 60%;
    height: 60%;
    background: radial-gradient(circle, rgba(160, 140, 255, 0.18) 0%, transparent 70%);
    border-radius: 50%;
    opacity: 0;
    pointer-events: none;
    z-index: 5;
    filter: blur(20px);
    transition: opacity 500ms ease;
}
.sh-card:hover .sh-card__image-wrap::after {
    opacity: 1;
}

/* ── Quick-Resume Floating Mini-Dock (Dynamic Island Capsule Styling) ── */
.sh-resume-dock {
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%) translateY(40px);
    opacity: 0;
    z-index: 9000;
    background: rgba(12, 12, 16, 0.92);
    backdrop-filter: blur(50px) saturate(220%);
    -webkit-backdrop-filter: blur(50px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9999px;
    padding: 6px 14px 6px 8px;
    display: none;
    align-items: center;
    gap: 12px;
    box-shadow: 
        0 20px 50px rgba(0, 0, 0, 0.90),
        inset 0 1px 0 rgba(255, 255, 255, 0.25),
        inset 0 -1px 0 rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05);
    pointer-events: none;
    cursor: pointer;
    transition: opacity 300ms ease, transform 380ms cubic-bezier(0.34, 1.45, 0.45, 1), background 200ms ease, border-color 200ms ease;
    user-select: none;
    max-width: 480px;
}

.sh-resume-dock--visible {
    display: flex !important;
    opacity: 1;
    pointer-events: auto !important;
    transform: translateX(-50%) translateY(0);
}

.sh-resume-dock:hover {
    background: rgba(18, 18, 24, 0.95);
    border-color: rgba(255, 255, 255, 0.22);
    box-shadow: 
        0 26px 70px rgba(0, 0, 0, 0.95),
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        0 0 0 1px rgba(255, 255, 255, 0.08);
    transform: translateX(-50%) translateY(-2px) scale(1.02);
}

.sh-resume-dock__thumb-wrap {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.25);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.50);
}

.sh-resume-dock__thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.sh-resume-dock__play-icon {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    font-size: 11px;
    opacity: 0;
    transition: opacity 180ms ease;
}

.sh-resume-dock:hover .sh-resume-dock__play-icon {
    opacity: 1;
}

.sh-resume-dock__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 150px;
    max-width: 220px;
}

.sh-resume-dock__title {
    font-size: 13px;
    font-weight: 750;
    color: #ffffff;
    letter-spacing: -0.2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sh-resume-dock__meta {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.60);
    letter-spacing: -0.1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sh-resume-dock__progress-bar {
    width: 100%;
    height: 3px;
    background: rgba(255, 255, 255, 0.10);
    border-radius: 9999px;
    overflow: hidden;
    margin-top: 3px;
}

.sh-resume-dock__progress-fill {
    height: 100%;
    background: rgba(255, 255, 255, 0.75);
    border-radius: 9999px;
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.30);
}

.sh-resume-dock__btn-play {
    background: #ffffff;
    border: none;
    border-radius: 9999px;
    padding: 6px 14px 6px 12px;
    color: #000000;
    font-size: 12px;
    font-weight: 750;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(255, 255, 255, 0.35);
    transition: transform 160ms ease, box-shadow 160ms ease;
    flex-shrink: 0;
}

.sh-resume-dock__btn-play:hover {
    transform: scale(1.06);
    box-shadow: 0 6px 18px rgba(255, 255, 255, 0.50);
}

.sh-resume-dock__btn-play:active {
    transform: scale(0.95);
}

.sh-resume-dock__btn-dismiss {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.40);
    font-size: 11px;
    padding: 4px 6px;
    border-radius: 50%;
    cursor: pointer;
    transition: color 150ms ease, background 150ms ease;
    flex-shrink: 0;
}

.sh-resume-dock__btn-dismiss:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.12);
}



        `;
        document.head.appendChild(style);
    }
}

export default Dashboard;
