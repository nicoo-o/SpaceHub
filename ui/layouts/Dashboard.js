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

import './Dashboard.css';
import * as svc from '../../core/services.js';
class Dashboard {
    /**
     * @param {{
     *   containerId?: string,
     *   settings?: import('../../core/SettingsManager.js').default,
     *   eventBus?: import('../../core/EventBus.js').default,
     * }} [options]
     */
    constructor(options = {}) {
        // Confirmation du scope dashboard dans le Focus Registry
        const spatialNav = svc.nav() || svc.nav();
        if (spatialNav?.registerFocusables) {
            spatialNav.registerFocusables('dashboard', (container) => {
                const root = container || document.querySelector('.sh-dashboard') || document;
                // NB : ne JAMAIS lister le conteneur .sh-dashboard lui-même — un élément
                // de la taille de la page entière fausse l'algorithme géométrique
                // (il est "le plus proche" dans toutes les directions et capture le focus).
                // Les boutons du hero sont couverts par [data-nav-focusable="true"] ;
                // les identifiants réels sont sh-hero-btn-play / -trailer / -details.
                return Array.from(root.querySelectorAll('.sh-hero-edge-btn, #sh-hero-btn-play, #sh-hero-btn-trailer, #sh-hero-btn-details, .sh-dynamic-island .sh-nav-tab-btn, .sh-dynamic-island .sh-nav-action-btn, .sh-card, .sh-jellyseerr-bento-card, .sh-jellyseerr-req-action-btn, [data-nav-focusable="true"]'));
            }, { force: true }); // re-registration volontaire — cf. plan A04
        }
        this.containerId = options.containerId || 'sh-dashboard';
        this._settings   = options.settings || svc.settings() || null;
        this._eventBus   = options.eventBus || svc.eventBus() || null;
        this._log        = new Logger('Dashboard');

        /** @type {Map<string, typeof Object>} Widget Class Registry */
        this._registeredWidgets = new Map();

        /** @type {Map<string, Object>} Active widget instances (instanceId -> instance) */
        this._activeWidgets = new Map();

        /** @type {HTMLElement|null} */
        this._container = null;
        this._renderToken = 0;
        this._renderCleanup = [];
        this._resumeDockCleanup = null;
        this._attachTimer = null;
        this._resizeHandler = null;

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
     * Retire un widget tiers du registre si sa classe correspond.
     */
    unregisterWidget(id, WidgetClass = null) {
        if (!this._registeredWidgets.has(id)) return false;
        if (WidgetClass && this._registeredWidgets.get(id) !== WidgetClass) return false;
        this._registeredWidgets.delete(id);
        return true;
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
        this._cleanupRender();
        const renderToken = ++this._renderToken;
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
                <div class="sh-genre-chips-container" tabindex="0" data-nav-focusable="true">
                    <div class="sh-genre-bar-track">
                        <div class="sh-genre-sliding-pill" id="sh-genre-sliding-pill"></div>
                        <button class="sh-genre-chip active" tabindex="0" data-nav-focusable="true" data-genre="all">
                            <svg class="sh-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg>
                            <span>Tous les Titres</span>
                        </button>
                        <button class="sh-genre-chip" tabindex="0" data-nav-focusable="true" data-genre="scifi">
                            <svg class="sh-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"></circle><path d="M12 9v6M9 12h6"></path><path d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M19.07 4.93l-4.24 4.24M9.17 14.83l-4.24 4.24"></path></svg>
                            <span>Science-Fiction</span>
                        </button>
                        <button class="sh-genre-chip" tabindex="0" data-nav-focusable="true" data-genre="action">
                            <svg class="sh-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                            <span>Action & Aventure</span>
                        </button>
                        <button class="sh-genre-chip" tabindex="0" data-nav-focusable="true" data-genre="4k">
                            <svg class="sh-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m7 8 2 4-2 4"></path><path d="M13 8v8"></path><path d="m17 8-3 4 3 4"></path></svg>
                            <span>Master 4K UHD</span>
                        </button>
                        <button class="sh-genre-chip" tabindex="0" data-nav-focusable="true" data-genre="series">
                            <svg class="sh-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>
                            <span>Séries Événement</span>
                        </button>
                        <button class="sh-genre-chip" tabindex="0" data-nav-focusable="true" data-genre="oscars">
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
                        else if (genre === 'scifi') show = this._cardMatchesGenre(card, ['science fiction', 'science-fiction', 'sci-fi', 'sf']);
                        else if (genre === '4k') show = codec.includes('4k') || codec.includes('uhd') || codec.includes('imax');
                        else if (genre === 'action') show = this._cardMatchesGenre(card, ['action', 'aventure']);
                        else if (genre === 'oscars') show = this._cardMatchesGenre(card, ['oscar', 'academy award']);
                    }
                    card.style.transition = `opacity 280ms ease ${Math.min(i * 20, 200)}ms, transform 320ms cubic-bezier(0.175, 0.885, 0.32, 1.275) ${Math.min(i * 20, 200)}ms`;
                    if (show) {
                        card.style.opacity = '1';
                        card.style.transform = 'scale(1) translateY(0)';
                        card.style.pointerEvents = '';
                    } else {
                        card.style.opacity = '0';
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
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = () => {
            const activeChip = this._container?.querySelector('.sh-genre-chip.active');
            if (activeChip) updatePill(activeChip, false);
        };
        window.addEventListener('resize', this._resizeHandler, { passive: true });

        // ── Quick-Resume Floating Mini-Dock (Uniquement si une vraie lecture est en cours) ──
        this._initResumeDock(renderToken);

        const hiddenSections = new Set(this._settings?.get('dashboard.hiddenSections', []));

        // Monter le Hero Spotlight si activé
        const heroEl = this._container.querySelector(`#${this.containerId}-hero`);
        if (heroEl) {
            if (!hiddenSections.has('hero-spotlight')) {
                heroEl.style.display = '';
                // Le Hero dépend d'une requête serveur et ne doit pas bloquer
                // l'affichage des contrôles TV ni des premiers skeletons.
                this._heroRenderPromise = this._heroComponent.render(heroEl).catch(err => {
                    if (renderToken === this._renderToken) {
                        this._log.warn('Rendu Hero indisponible :', err);
                    }
                });
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

        // Charger et monter les étagères et widgets du Dashboard sans bloquer le
        // premier affichage : les wrappers et leurs skeletons apparaissent tout de
        // suite, tandis que chaque widget termine son appel Jellyfin en arrière-plan.
        // Le token de rendu empêche une navigation rapide de repeupler une ancienne vue.
        this._layoutLoadPromise = this._loadLayout(renderToken).catch(err => {
            if (renderToken === this._renderToken) {
                this._log.warn('Chargement de la grille interrompu :', err);
            }
        });

        // Attacher le défilement tactile Gooey Carousel sur toutes les étagères horizontales uniquement
        this._attachTimer = setTimeout(() => {
            if (renderToken !== this._renderToken) return;
            this._gooeyScroller.attach('.sh-genre-chips-container, .sh-card-grid, .sh-shelf-row, .sh-cards-row');
        }, 500);
    }

    _cardMatchesGenre(card, genres = []) {
        const rawGenres = card.dataset.genres || card.getAttribute('data-genres') || '';
        const normalized = String(rawGenres).toLowerCase();
        return genres.some(genre => normalized.includes(String(genre).toLowerCase()));
    }

    /**
     * Échappe une valeur avant insertion dans un fragment HTML.
     * Les données Jellyfin sont externes : ne jamais appeler replace directement
     * sur une valeur dont le type n'est pas garanti par le serveur.
     */
    _escape(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>\"']/g, (match) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '\"': '&quot;',
            "'": '&#39;'
        })[match]);
    }

    /**
     * Initialise le mini-dock flottant de reprise uniquement si une vraie lecture existe.
     */
    async _initResumeDock(renderToken = this._renderToken) {
        try {
            const api = svc.jellyfinApi();
            if (!api?.getResumeItems) return;
            const items = await api.getResumeItems(1);
            if (renderToken !== this._renderToken || !this._container || !items || items.length === 0) return;

            const resumeItem = items[0];
            const percent = Math.round(resumeItem.UserData?.PlayedPercentage || 0);
            const remainingMin = resumeItem.RunTimeTicks && resumeItem.UserData?.PlaybackPositionTicks
                ? Math.max(1, Math.round((resumeItem.RunTimeTicks - resumeItem.UserData.PlaybackPositionTicks) / 600000000))
                : null;

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
                    <img decoding="async" class="sh-resume-dock__thumb" src="${this._escape(thumbUrl)}" alt="${this._escape(resumeItem.Name)}" loading="lazy" onerror="this.style.display='none'" />
                    <div class="sh-resume-dock__play-icon">▶</div>
                </div>
                <div class="sh-resume-dock__info">
                    <span class="sh-resume-dock__title">${this._escape(resumeItem.Name)}</span>
                    <span class="sh-resume-dock__meta">Reprendre${remainingMin !== null ? ` • ${remainingMin}m restantes` : ''} (${percent}%)</span>
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
                if (svc.slideUpSheet()) {
                    svc.slideUpSheet().open(resumeItem);
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

            const dockContainer = this._container;
            window.addEventListener('scroll', updateResumeDock, { passive: true });
            dockContainer?.addEventListener('scroll', updateResumeDock, { passive: true });
            this._resumeDockCleanup = () => {
                window.removeEventListener('scroll', updateResumeDock);
                dockContainer?.removeEventListener('scroll', updateResumeDock);
                resumeDock.remove();
            };
        } catch (err) {
            console.warn('[Dashboard] Erreur initialisation resume dock:', err);
        }
    }

    _cleanupRender() {
        this._renderToken += 1;
        if (this._attachTimer) {
            clearTimeout(this._attachTimer);
            this._attachTimer = null;
        }
        this._resumeDockCleanup?.();
        this._resumeDockCleanup = null;
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        for (const { widget } of this._activeWidgets.values()) {
            try { widget?.destroy?.(); } catch (err) { this._log.warn('Nettoyage widget échoué:', err); }
        }
        this._activeWidgets.clear();
        this._gooeyScroller?.destroy?.();
        document.getElementById('sh-resume-dock')?.remove();
    }

    destroy() {
        this._lazyObservers?.forEach(io => io.disconnect());
        this._lazyObservers?.clear();
        this._cleanupRender();
        this._heroComponent?.destroy?.();
        this._sidebarDrawer?.destroy?.();
        this._container = null;
    }

    /**
     * Charge l'agencement sauvegardé ou applique l'agencement par défaut.
     */
    async _loadLayout(renderToken = this._renderToken) {
        if (renderToken !== this._renderToken || !this._container) return;
        const gridEl = this._container.querySelector(`#${this.containerId}-grid`);
        if (!gridEl) return;

        gridEl.innerHTML = '';
        this._activeWidgets.clear();

        // ── 1. Récupération des bibliothèques utilisateur Jellyfin ──
        let userViews = [];
        try {
            const api = svc.jellyfinApi();
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
        if (renderToken !== this._renderToken) return;

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
        const mountTasks = [];

        for (const item of layout) {
            if (renderToken !== this._renderToken || !this._container) return;
            if (hiddenSections.has(item.widgetType)) {
                continue;
            }

            const WidgetClass = this._registeredWidgets.get(item.widgetType);
            if (!WidgetClass) {
                this._log.warn(`Type de widget inconnu dans l'agencement : "${item.widgetType}"`);
                continue;
            }

            // Monter les wrappers et lancer les requêtes en parallèle : un service
            // externe lent ne doit plus bloquer les rayons Jellyfin déjà disponibles.
            const task = this._mountWidget(WidgetClass, item, gridEl, mountedIndex, renderToken);
            // Les widgets differes n'aboutissent qu'au defilement : les attendre
            // bloquerait indefiniment la fin du rendu. On ne synchronise donc que
            // ceux montes d'emblee.
            if (mountedIndex < 3) mountTasks.push(task);
            else task.catch(err => this._log.debug('Widget differe :', err));
            mountedIndex++;
        }

        await Promise.allSettled(mountTasks);
    }

    /**
     * Instancie et monte un widget dans la grille.
     */
    /**
     * Monte un widget seulement quand il approche du viewport.
     *
     * Avant : TOUTES les rangees etaient construites et montees des le premier
     * rendu, y compris celles situees plusieurs ecrans plus bas. Sur une
     * bibliotheque fournie, cela representait des centaines de cartes creees
     * pour rien, avec leurs images et leurs ecouteurs — c'est le poste de cout
     * le plus lourd du premier rendu apres le flou d'arriere-plan.
     *
     * Les widgets situes au-dessus de la ligne de flottaison (index < EAGER)
     * restent montes immediatement : differer ce qui est visible d'emblee
     * ferait clignoter la page.
     */
    async _mountWidget(WidgetClass, itemConfig, gridEl, index = 0, renderToken = this._renderToken) {
        if (renderToken !== this._renderToken) return;

        const EAGER_COUNT = 3;
        const supportsObserver = typeof IntersectionObserver === 'function';

        if (supportsObserver && index >= EAGER_COUNT) {
            const colSpanLazy = itemConfig.colSpan || 12;
            const placeholder = document.createElement('div');
            placeholder.className = `sh-dashboard__item sh-dashboard__item--col-${colSpanLazy} sh-dashboard__item--pending`;
            placeholder.dataset.widgetType = itemConfig.widgetType;
            // Hauteur reservee : evite que la page ne saute quand le widget arrive.
            placeholder.style.minHeight = '260px';
            gridEl.appendChild(placeholder);

            await new Promise((resolve) => {
                const io = new IntersectionObserver((entries) => {
                    if (!entries.some(en => en.isIntersecting)) return;
                    io.disconnect();
                    this._lazyObservers?.delete(io);
                    resolve();
                }, { root: null, rootMargin: '600px 0px', threshold: 0 });
                if (!this._lazyObservers) this._lazyObservers = new Set();
                this._lazyObservers.add(io);
                io.observe(placeholder);
            });

            if (renderToken !== this._renderToken) { placeholder.remove(); return; }
            placeholder.remove();
        }

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
            if (renderToken !== this._renderToken) {
                widget.destroy?.();
                widgetWrapper.remove();
                return;
            }
            this._activeWidgets.set(instanceId, { widget, element: widgetWrapper, config: itemConfig });
        } catch (err) {
            // Frontière locale : la panne reste dans le widget. L'ancien repli
            // annonçait l'échec sans dire pourquoi ni offrir de reprise —
            // l'utilisateur n'avait plus que le rechargement de la page.
            this._log.error(`Erreur lors du rendu du widget "${itemConfig.widgetType}":`, err);
            const frontiere = svc.errors();
            if (frontiere) {
                frontiere.mount(widgetWrapper, async () => {
                    if (typeof widget.render === 'function') await widget.render(widgetWrapper);
                    this._activeWidgets.set(instanceId, { widget, element: widgetWrapper, config: itemConfig });
                }, { nom: widget.title || itemConfig.widgetType });
                // mount() vient de rejouer le travail : s'il a réussi, rien à faire ;
                // s'il a échoué, la carte de repli est déjà en place.
            } else {
                widgetWrapper.textContent = `Le widget « ${itemConfig.widgetType} » n'a pas pu s'afficher.`;
            }
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
        svc.toaster()?.success('Dashboard actualisé !');
    }

    // ─── Modal de personnalisation ────────────────────────────────────────────

    _openCustomizeModal() {
        const Modal = svc.modalClass();
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
                    svc.toaster()?.success('Agencement enregistré !');
                    m.close();
                });
            }
        });
        modal.open();
    }

    // ─── Styles ───────────────────────────────────────────────────────────────

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans Dashboard.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default Dashboard;
