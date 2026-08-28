/**
 * SpaceHub — Core Entry Point
 * Version: 1.0.0
 *
 * Point d'entrée principal de SpaceHub — Media Center Unifié pour Jellyfin.
 * Initialise le Core, le Design System, les Thèmes, les Composants, le Dashboard,
 * les améliorations Jellyfin natives, l'Extension SDK, le panneau de configuration,
 * et l'ensemble des intégrations (Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr, qBittorrent).
 *
 * Basé sur KefinTweaks par @ranaldsgift — https://github.com/ranaldsgift/KefinTweaks
 */

'use strict';

import Logger          from './Logger.js';
import EventBus        from './EventBus.js';
import ModuleManager   from './ModuleManager.js';
import SettingsManager from './SettingsManager.js';
import CacheManager    from './CacheManager.js';
import { ApiClient, JellyfinClient } from './ApiClient.js';
import SpaceHubSDK     from './SDK.js';

import ThemeManager    from '../ui/themes/ThemeManager.js';
import Toaster         from '../ui/components/Toaster.js';
import Modal           from '../ui/components/Modal.js';
import CardBuilder     from '../ui/components/CardBuilder.js';
import SettingsPanel   from '../ui/components/SettingsPanel.js';
import ModalSlideUpSheet from '../ui/components/ModalSlideUpSheet.js';
import AppLayout       from '../ui/layouts/AppLayout.js';
import Dashboard       from '../ui/layouts/Dashboard.js';
import AdminDashboardView from '../ui/views/AdminDashboardView.js';
import JellyfinConsoleModal from '../ui/views/JellyfinConsoleModal.js';
import NotificationService from './NotificationService.js';

import QuickActionsWidget     from '../ui/widgets/QuickActionsWidget.js';
import LibrariesWidget        from '../ui/widgets/LibrariesWidget.js';
import ContinueWatchingWidget from '../ui/widgets/ContinueWatchingWidget.js';
import LatestAdditionsWidget  from '../ui/widgets/LatestAdditionsWidget.js';
import MoviesWidget           from '../ui/widgets/MoviesWidget.js';
import TvShowsWidget          from '../ui/widgets/TvShowsWidget.js';
import CollectionsWidget      from '../ui/widgets/CollectionsWidget.js';
import MusicWidget            from '../ui/widgets/MusicWidget.js';
import UnifiedCalendarWidget  from '../ui/widgets/UnifiedCalendarWidget.js';
import MediaAnalyticsWidget   from '../ui/widgets/MediaAnalyticsWidget.js';

import JellyfinAPI      from '../jellyfin/api/JellyfinAPI.js';
import UnifiedSearch    from '../jellyfin/search/UnifiedSearch.js';
import SmartCollections from '../jellyfin/collections/SmartCollections.js';
import VideoPlayer      from '../jellyfin/player/VideoPlayer.js';

import AuthManager      from '../jellyfin/auth/AuthManager.js';
import LoginView        from '../ui/views/LoginView.js';

import SonarrService from '../integrations/sonarr/SonarrService.js';
import { UpcomingEpisodesWidget, SonarrQueueWidget } from '../integrations/sonarr/SonarrWidgets.js';

import RadarrService from '../integrations/radarr/RadarrService.js';
import { UpcomingMoviesWidget, RadarrQueueWidget } from '../integrations/radarr/RadarrWidgets.js';

import ProwlarrService from '../integrations/prowlarr/ProwlarrService.js';
import { ProwlarrStatusWidget } from '../integrations/prowlarr/ProwlarrWidgets.js';

import BazarrService from '../integrations/bazarr/BazarrService.js';
import { BazarrWantedWidget } from '../integrations/bazarr/BazarrWidgets.js';

import JellyseerrService from '../integrations/jellyseerr/JellyseerrService.js';
import { JellyseerrRequestsWidget, JellyseerrTrendingWidget } from '../integrations/jellyseerr/JellyseerrWidgets.js';

import QBittorrentService from '../integrations/qbittorrent/QBittorrentService.js';
import { QBittorrentSpeedWidget, QBittorrentActiveWidget } from '../integrations/qbittorrent/QBittorrentWidgets.js';

// ─── Namespace global ────────────────────────────────────────────────────────

const SpaceHub = {
    version: '1.0.0',

    /**
     * Core — Socle technique
     * @type {{
     *   log: Logger,
     *   eventBus: EventBus,
     *   moduleManager: ModuleManager,
     *   settings: SettingsManager,
     *   cache: CacheManager,
     *   api: ApiClient,
     * }}
     */
    core: {
        log: null,
        eventBus: null,
        moduleManager: null,
        settings: null,
        cache: null,
        api: null,
    },

    /**
     * SDK — Kit de développement pour modules tiers
     * @type {SpaceHubSDK}
     */
    sdk: null,

    /**
     * UI — Interface utilisateur, Design System & Dashboard
     * @type {{
     *   dashboard: Dashboard,
     *   themes: ThemeManager,
     *   settingsPanel: SettingsPanel,
     *   components: {
     *     toaster: Toaster,
     *     Modal: typeof Modal,
     *     cardBuilder: CardBuilder,
     *     SettingsPanel: typeof SettingsPanel,
     *   }
     * }}
     */
    ui: {
        dashboard: null,
        themes: null,
        settingsPanel: null,
        components: {
            toaster: null,
            Modal: Modal,
            cardBuilder: null,
            SettingsPanel: SettingsPanel,
        },
    },

    /**
     * Jellyfin — Améliorations natives (v0.5)
     * @type {{
     *   api: JellyfinAPI,
     *   search: UnifiedSearch,
     *   collections: SmartCollections,
     * }}
     */
    jellyfin: {
        api: null,
        search: null,
        collections: null,
    },

    /**
     * Integrations — Modules externes complets
     * @type {{
     *   sonarr: SonarrService,
     *   radarr: RadarrService,
     *   prowlarr: ProwlarrService,
     *   bazarr: BazarrService,
     *   jellyseerr: JellyseerrService,
     *   qbittorrent: QBittorrentService
     * }}
     */
    integrations: {
        sonarr: null,
        radarr: null,
        prowlarr: null,
        bazarr: null,
        jellyseerr: null,
        qbittorrent: null,
    },
};

// ─── Initialisation ──────────────────────────────────────────────────────────

async function init() {
    // 1. Logger
    const log = new Logger('SpaceHub');
    SpaceHub.core.log = log;
    log.info(`🚀 Initialisation de SpaceHub v${SpaceHub.version}...`);

    // 2. EventBus
    const eventBus = new EventBus();
    SpaceHub.core.eventBus = eventBus;
    log.info('EventBus prêt.');

    // 3. ModuleManager
    const moduleManager = new ModuleManager(eventBus);
    SpaceHub.core.moduleManager = moduleManager;
    log.info('ModuleManager prêt.');

    // 4. SettingsManager
    const settings = new SettingsManager(eventBus);
    SpaceHub.core.settings = settings;

    // Valeurs par défaut complètes v1.0
    settings.registerDefaults({
        'core.logLevel': 'info',
        'core.version':  SpaceHub.version,
        'ui.theme':      'spacehub-dark',
        'dashboard.enabled': true,
        'jellyfin.search.enabled': true,
        'sonarr.enabled': true,
        'sonarr.url': 'http://localhost:8989',
        'sonarr.apiKey': '',
        'radarr.enabled': true,
        'radarr.url': 'http://localhost:7878',
        'radarr.apiKey': '',
        'prowlarr.enabled': true,
        'prowlarr.url': 'http://localhost:9696',
        'prowlarr.apiKey': '',
        'bazarr.enabled': true,
        'bazarr.url': 'http://localhost:6767',
        'bazarr.apiKey': '',
        'jellyseerr.enabled': true,
        'jellyseerr.url': 'http://localhost:5055',
        'jellyseerr.apiKey': '',
        'qbittorrent.enabled': true,
        'qbittorrent.url': 'http://localhost:8080',
        'qbittorrent.username': 'admin',
        'qbittorrent.password': '',
    });
    log.info('SettingsManager prêt.');

    // 5. Appliquer le niveau de log
    const logLevel = settings.get('core.logLevel', 'info');
    log.setLevel(logLevel);

    // 6. CacheManager
    const cache = new CacheManager();
    SpaceHub.core.cache = cache;
    log.info('CacheManager prêt.');

    // 6.5. AuthManager (Jellyfin Authentification)
    const auth = new AuthManager();
    SpaceHub.auth = auth;
    await auth.init();
    log.info(auth.isAuthenticated() ? `Session Jellyfin active pour ${auth.getUser()?.Name} (${auth.getServerUrl()})` : 'Aucune session Jellyfin active (mode non connecté).');

    // 7. ApiClient + JellyfinClient
    const api = new ApiClient();
    SpaceHub.core.api = api;

    try {
        const jfClient = new JellyfinClient();
        if (auth.isAuthenticated()) {
            jfClient.setBaseUrl(auth.getServerUrl());
            jfClient.setApiKey(auth.getToken());
        }
        api.addClient('jellyfin', jfClient);
        log.info('JellyfinClient enregistré.');
    } catch (err) {
        log.warn('JellyfinClient non disponible (Jellyfin ApiClient absent).', err);
    }

    // 8. UI — Design System, Thèmes & Composants
    try {
        const themeManager = new ThemeManager(settings, eventBus);
        await themeManager.init();
        SpaceHub.ui.themes = themeManager;

        SpaceHub.ui.components.toaster = new Toaster();
        SpaceHub.ui.components.Modal = Modal;
        SpaceHub.ui.components.cardBuilder = new CardBuilder();
        SpaceHub.ui.settingsPanel = new SettingsPanel();
        
        const modalSlideUp = new ModalSlideUpSheet();
        SpaceHub.ui.modalSlideUpSheet = modalSlideUp;
        SpaceHub.ui.components.modalSlideUpSheet = modalSlideUp;

        log.info('UI & Design System (ThemeManager, Toaster, Modal, CardBuilder, SettingsPanel, ModalSlideUpSheet) prêts.');
    } catch (err) {
        log.error('Erreur initialisation UI:', err);
    }

    // 9. UI — Dashboard & Tous les Widgets
    try {
        const dashboard = new Dashboard({ settings, eventBus });
        dashboard.registerWidget('user-libraries', LibrariesWidget);
        dashboard.registerWidget('quick-actions', QuickActionsWidget);
        dashboard.registerWidget('continue-watching', ContinueWatchingWidget);
        dashboard.registerWidget('latest-additions', LatestAdditionsWidget);
        dashboard.registerWidget('movies', MoviesWidget);
        dashboard.registerWidget('tv-shows', TvShowsWidget);
        dashboard.registerWidget('collections-sagas', CollectionsWidget);
        dashboard.registerWidget('music-soundtracks', MusicWidget);
        dashboard.registerWidget('sonarr-upcoming', UpcomingEpisodesWidget);
        dashboard.registerWidget('sonarr-queue', SonarrQueueWidget);
        dashboard.registerWidget('radarr-upcoming', UpcomingMoviesWidget);
        dashboard.registerWidget('radarr-queue', RadarrQueueWidget);
        dashboard.registerWidget('prowlarr-status', ProwlarrStatusWidget);
        dashboard.registerWidget('bazarr-wanted', BazarrWantedWidget);
        dashboard.registerWidget('jellyseerr-requests', JellyseerrRequestsWidget);
        dashboard.registerWidget('jellyseerr-trending', JellyseerrTrendingWidget);
        dashboard.registerWidget('qbittorrent-speed', QBittorrentSpeedWidget);
        dashboard.registerWidget('qbittorrent-active', QBittorrentActiveWidget);
        dashboard.registerWidget('unified-calendar', UnifiedCalendarWidget);
        dashboard.registerWidget('media-analytics', MediaAnalyticsWidget);

        SpaceHub.ui.dashboard = dashboard;
        SpaceHub.ui.adminDashboard = new AdminDashboardView();
        SpaceHub.ui.jellyfinConsole = new JellyfinConsoleModal();
        log.info('Dashboard & Tous les Widgets enregistrés.');
    } catch (err) {
        log.error('Erreur initialisation Dashboard:', err);
    }

    // 9.5. Notifications & Webhooks (Discord, Telegram, Web Push)
    try {
        SpaceHub.core.notifications = new NotificationService(eventBus, settings);
        log.info('NotificationService (Discord, Telegram, Web Push) prêt.');
    } catch (err) {
        log.warn('NotificationService non initialisé:', err);
    }

    // 10. Jellyfin Core Amélioré & Lecteur Vidéo
    try {
        SpaceHub.jellyfin.api = new JellyfinAPI();
        SpaceHub.jellyfin.search = new UnifiedSearch();
        SpaceHub.jellyfin.collections = new SmartCollections();
        SpaceHub.player = new VideoPlayer();
        log.info('Jellyfin Core Amélioré (API, UnifiedSearch, SmartCollections, VideoPlayer) prêt.');
    } catch (err) {
        log.error('Erreur initialisation Jellyfin Core:', err);
    }

    // 11. Extension SDK
    SpaceHub.sdk = new SpaceHubSDK();
    log.info('Extension SDK disponible via SpaceHub.sdk.');

    // 12. Enregistrement des intégrations
    const registerIntegration = async (id, name, ServiceClass) => {
        moduleManager.register({
            id,
            name,
            enabled: settings.get(`${id}.enabled`, true),
            init: async () => {
                const service = new ServiceClass();
                SpaceHub.integrations[id] = service;
                return service;
            }
        });
        try {
            await moduleManager.load(id);
            log.info(`Module "${name}" initialisé.`);
        } catch (err) {
            log.warn(`Module "${name}" non chargé:`, err);
        }
    };

    await registerIntegration('sonarr', 'Sonarr Integration', SonarrService);
    await registerIntegration('radarr', 'Radarr Integration', RadarrService);
    await registerIntegration('prowlarr', 'Prowlarr Integration', ProwlarrService);
    await registerIntegration('bazarr', 'Bazarr Integration', BazarrService);
    await registerIntegration('jellyseerr', 'Jellyseerr Integration', JellyseerrService);
    await registerIntegration('qbittorrent', 'qBittorrent Integration', QBittorrentService);

    // 13. Monter l'application cliente dans #app (si présent)
    const appTarget = document.getElementById('app');
    if (appTarget) {
        const renderApp = () => {
            appTarget.innerHTML = '';
            if (auth.isAuthenticated()) {
                const appLayout = new AppLayout();
                SpaceHub.ui.appLayout = appLayout;
                appLayout.render(appTarget);
                log.info('AppLayout monté dans #app (Session active).');
            } else {
                const loginView = new LoginView(() => {
                    log.info('Connexion réussie ! Montage du AppLayout...');
                    const jfClient = SpaceHub.core.api?.getClient('jellyfin');
                    if (jfClient) {
                        jfClient.setBaseUrl(auth.getServerUrl());
                        jfClient.setApiKey(auth.getToken());
                    }
                    renderApp();
                });
                SpaceHub.ui.loginView = loginView;
                loginView.render(appTarget);
                log.info('LoginView affiché dans #app (Non connecté).');
            }
        };
        renderApp();
    }

    // 14. Masquer le Splash Loader
    const splash = document.getElementById('sh-splash-loader');
    if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 400);
    }

    // 15. Émettre l'événement de démarrage global
    eventBus.emit('spacehub:ready', { version: SpaceHub.version });
    log.info(`🎉 SpaceHub v${SpaceHub.version} Stable initialisé avec succès.`);
}

// ─── Exposition & Bootstrap ──────────────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.SpaceHub = SpaceHub;

    // Démarre dès que le DOM est prêt
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM déjà chargé (injection tardive)
        init().catch(err => console.error('[SpaceHub] Erreur d\'initialisation:', err));
    }
}

export default SpaceHub;
