/**
 * SpaceHub — Core Entry Point
 * Version: 1.0.0
 *
 * Point d'entrée principal de SpaceHub — Media Center Unifié pour Jellyfin.
 * Initialise le Core, le Design System, les Thèmes, les Composants, le Dashboard,
 * les améliorations Jellyfin natives, l'Extension SDK, le panneau de configuration,
 * et l'ensemble des intégrations (Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr, qBittorrent).
 *
 * Basé sur KefinTweaks par @ranaldsgift — https://github.com/nicoo-o/SpaceHub
 */

'use strict';

import Logger          from './Logger.js';
import EventBus        from './EventBus.js';
import ModuleManager   from './ModuleManager.js';
import PluginManager    from './PluginManager.js';
import Router           from './Router.js';
import SettingsManager from './SettingsManager.js';
import CacheManager    from './CacheManager.js';
import { ApiClient, JellyfinClient } from './ApiClient.js';
import SpaceHubSDK     from './SDK.js';
import PluginCatalog   from './PluginCatalog.js';
import PolicyService   from './PolicyService.js';
import TouchEngine     from './TouchEngine.js';
import AudioFeedback    from './AudioFeedback.js';
import SpatialNavigation from './SpatialNavigation.js';
import RatingCacheService from './RatingCacheService.js';
import TvModeManager    from './TvModeManager.js';
import TrailerService   from './TrailerService.js';
import ServiceRegistry  from './ServiceRegistry.js';
import ErrorBoundary    from './ErrorBoundary.js';
import ParentalControl  from './ParentalControl.js';
import FeatureFlags     from './FeatureFlags.js';
import OfflineStore     from './OfflineStore.js';
import { GELEES }       from './FeatureFlags.js';

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
import OnboardingWizard from '../ui/components/OnboardingWizard.js';

import QuickActionsWidget     from '../ui/widgets/QuickActionsWidget.js';
import LibrariesWidget        from '../ui/widgets/LibrariesWidget.js';
import ContinueWatchingWidget from '../ui/widgets/ContinueWatchingWidget.js';
import LatestAdditionsWidget  from '../ui/widgets/LatestAdditionsWidget.js';
import MoviesWidget           from '../ui/widgets/MoviesWidget.js';
import TvShowsWidget          from '../ui/widgets/TvShowsWidget.js';
import CollectionsWidget      from '../ui/widgets/CollectionsWidget.js';
import MusicWidget            from '../ui/widgets/MusicWidget.js';
import AnimeWidget            from '../ui/widgets/AnimeWidget.js';
import DynamicLibraryWidget   from '../ui/widgets/DynamicLibraryWidget.js';
import UnifiedCalendarWidget  from '../ui/widgets/UnifiedCalendarWidget.js';
import MediaAnalyticsWidget   from '../ui/widgets/MediaAnalyticsWidget.js';

import JellyfinAPI      from '../jellyfin/api/JellyfinAPI.js';
import JellyfinPluginService from '../jellyfin/api/JellyfinPluginService.js';
import MetadataService from '../jellyfin/metadata/MetadataService.js';
import UnifiedSearch    from '../jellyfin/search/UnifiedSearch.js';
import SmartCollections from '../jellyfin/collections/SmartCollections.js';
import VideoPlayer      from '../jellyfin/player/VideoPlayer.js';
import PlayQueue        from '../jellyfin/player/PlayQueue.js';
import RemoteControlService from '../jellyfin/remote/RemoteControlService.js';
import DownloadManager  from '../jellyfin/offline/DownloadManager.js';

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
    /**
     * Registre de services (injection de dépendances).
     * `window.SpaceHub` reste la façade historique : rien ne casse, mais toute
     * dépendance peut désormais être résolue explicitement via
     * `SpaceHub.services.resolve('jellyfin.api')` au lieu d'un `?.` silencieux.
     * `SpaceHub.services.list()` dit, en console, ce qui est prêt au démarrage.
     */
    services: null,
    plugins: null,
    pluginCatalog: null,
    policy: null,
    metadata: null,
    onboarding: null,
    core: {

        log: null,
        eventBus: null,
        moduleManager: null,
        pluginManager: null,
        router: null,
        settings: null,
        cache: null,
        api: null,
        pluginCatalog: null,
        policy: null,
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
            OnboardingWizard: OnboardingWizard,
        },
        onboarding: null,
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
        plugins: null,
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
        // 1. Logger & Moteurs Fondamentaux
    const log = new Logger('SpaceHub');

    // 1.0 Registre de services — créé en tout premier pour que chaque service
    // construit ensuite puisse s'y enregistrer au fil de l'initialisation.
    const services = new ServiceRegistry({ logger: new Logger('ServiceRegistry') });
    SpaceHub.services = services;
    services.register('logger', log);
    if (typeof window !== 'undefined') services.bindGlobalFacade(window);

    const touchEngine = new TouchEngine();
    const audioFeedback = new AudioFeedback();
    const spatialNav = new SpatialNavigation();

    SpaceHub.spatialNav = spatialNav;
    SpaceHub.gamepad = spatialNav.getGamepad ? spatialNav.getGamepad() : spatialNav._gamepad;
    SpaceHub.core.spatialNavigation = spatialNav;
    services.register('nav.spatial', spatialNav);
    SpaceHub.core.gamepad = SpaceHub.gamepad;
    SpaceHub.core.audioFeedback = audioFeedback;
    services.register('input.audioFeedback', audioFeedback);
    SpaceHub.core.touchEngine = touchEngine;
    services.register('input.touch', touchEngine);
    SpaceHub.core.log = log;
    log.info(`🚀 Initialisation de SpaceHub v${SpaceHub.version}...`);

    // 2. EventBus
    const eventBus = new EventBus();
    SpaceHub.core.eventBus = eventBus;
    services.register('eventBus', eventBus);

    // 2.5 Frontière d'erreur — installée juste après l'EventBus, avant tout le
    // reste : c'est précisément pendant l'initialisation qu'une exception non
    // rattrapée laissait l'écran à moitié rendu, sans message.
    const errors = new ErrorBoundary({ eventBus });
    errors.install();
    SpaceHub.core.errors = errors;
    services.register('errors', errors);
    log.info('EventBus prêt.');

    // 3. SettingsManager
    const settings = new SettingsManager(eventBus);
    SpaceHub.core.settings = settings;

    services.register('settings', settings);

    // Valeurs par défaut complètes v1.0
    settings.registerDefaults({
        'core.logLevel': 'info',
        'core.version':  SpaceHub.version,
        'ui.theme':      'spacehub-dark',
        'dashboard.enabled': true,
        'jellyfin.search.enabled': true,
        // Les intégrations optionnelles restent silencieuses tant que l'administrateur
        // n'a pas fourni une URL/clé réelle dans les réglages.
        'sonarr.enabled': false,
        'sonarr.url': 'http://localhost:8989',
        'sonarr.apiKey': '',
        'radarr.enabled': false,
        'radarr.url': 'http://localhost:7878',
        'radarr.apiKey': '',
        'prowlarr.enabled': false,
        'prowlarr.url': 'http://localhost:9696',
        'prowlarr.apiKey': '',
        'bazarr.enabled': false,
        'bazarr.url': 'http://localhost:6767',
        'bazarr.apiKey': '',
        'jellyseerr.enabled': false,
        'jellyseerr.url': 'http://localhost:5055',
        'jellyseerr.apiKey': '',
        'qbittorrent.enabled': false,
        'qbittorrent.url': 'http://localhost:8080',
        'qbittorrent.username': 'admin',
        'qbittorrent.password': '',
        'metadata.policies.default': { defaultOrder: ['jellyfin'], fields: {} },
        'plugins.catalogUrl': '',
        // Lecteur — plafond de débit envoyé au serveur dans le DeviceProfile.
        // 0 = aucun plafond (le serveur choisit, DirectPlay si possible).
        // Ce réglage vit dans localStorage, donc il est déjà PAR APPAREIL :
        // une TV en Wi-Fi faible et un PC en Ethernet peuvent différer sans
        // se marcher dessus.
        'player.maxBitrate': 0,
        'player.maxBitrateAuto': true,
        // Contrôle parental d'interface. La vraie séparation reste un compte
        // Jellyfin dédié à l'enfant : voir core/ParentalControl.js.
        // Fonctionnalités gelées (audit §7.15) — masquées, pas supprimées.
        // Voir core/FeatureFlags.js pour le raisonnement.
        ...Object.fromEntries(Object.entries(GELEES).map(([k, v]) => [k, v.defaut])),
        // Hors-ligne
        'offline.enabled': true,
        'offline.validityDays': 30,
        'parental.enabled': false,
        'parental.maxRank': 1,
        'parental.allowUnrated': false,
        'ui.tvMode': 'auto',
        // Mode TV : l'échelle et la marge de sûreté dépendent du salon et du
        // téléviseur (distance de vision, rognage des bords). Sans effet hors
        // mode TV. Voir core/TvModeManager.js.
        'ui.tvScale': 1.15,
        'ui.tvSafeArea': 3.5,
    });
    log.info('SettingsManager prêt.');

    // 4. ModuleManager
    const moduleManager = new ModuleManager(eventBus, settings);
    SpaceHub.core.moduleManager = moduleManager;
    services.register('moduleManager', moduleManager);
    log.info('ModuleManager prêt.');

    // 5. PluginManager
    const pluginManager = new PluginManager({
        eventBus,
        settings,
        userProvider: () => SpaceHub.auth?.getUser?.()
    });
    SpaceHub.plugins = pluginManager;
    SpaceHub.core.pluginManager = pluginManager;
    services.register('pluginManager', pluginManager);
    log.info('PluginManager prêt.');

    // 5.1. RatingCacheService (notes externes)
    const ratingCache = new RatingCacheService({ settings });
    SpaceHub.core.ratingCache = ratingCache;
    services.register('cache.ratings', ratingCache);
    log.info('RatingCacheService prêt.');

    // 5.2. TvModeManager (mode TV télécommande/manette + masquage du curseur)
    const tvMode = new TvModeManager({ settings, eventBus });
    SpaceHub.core.tvMode = tvMode;
    services.register('tvMode', tvMode);
    // Drapeaux de fonctionnalité — créés tôt : plusieurs services consultent
    // leur état au moment de s'initialiser.
    const features = new FeatureFlags({ settings });
    SpaceHub.core.features = features;
    services.register('features', features);

    const parental = new ParentalControl({ settings, eventBus });
    SpaceHub.core.parental = parental;
    services.register('parental', parental);
    tvMode.init();
    log.info('TvModeManager prêt.');

    // 5.3. TrailerService (bandes-annonces : serveur Jellyfin + YouTube dans fenêtre SpaceHub)
    const trailers = new TrailerService();
    SpaceHub.trailers = trailers;
    SpaceHub.ui.trailers = trailers;
    services.register('ui.trailers', trailers);
    log.info('TrailerService prêt.');

    // 5.5. Router Centralisé
    const router = new Router({ eventBus });
    SpaceHub.router = router;
    SpaceHub.core.router = router;
    services.register('router', router);
    log.info('Router centralisé prêt.');

    // 6. Appliquer le niveau de log
    const logLevel = settings.get('core.logLevel', 'info');
    log.setLevel(logLevel);

    // 6. CacheManager
    const cache = new CacheManager();
    SpaceHub.core.cache = cache;
    services.register('cache', cache);
    log.info('CacheManager prêt.');

    // 6.5. AuthManager (Jellyfin Authentification)
    const auth = new AuthManager();
    SpaceHub.auth = auth;
    await auth.init();
    log.info(auth.isAuthenticated() ? `Session Jellyfin active pour ${auth.getUser()?.Name} (${auth.getServerUrl()})` : 'Aucune session Jellyfin active (mode non connecté).');

    // 7. ApiClient + JellyfinClient
    const api = new ApiClient();
    SpaceHub.core.api = api;
    services.register('api', api);

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
        SpaceHub.ui.onboarding = new OnboardingWizard({ settings, auth, eventBus });
        
        const modalSlideUp = new ModalSlideUpSheet();
        SpaceHub.ui.modalSlideUpSheet = modalSlideUp;
        services.register('ui.themes', themeManager);
        services.register('ui.toaster', SpaceHub.ui.components.toaster);
        services.register('ui.cardBuilder', SpaceHub.ui.components.cardBuilder);
        services.register('ui.settingsPanel', SpaceHub.ui.settingsPanel);
        services.register('ui.slideUpSheet', modalSlideUp);
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
        dashboard.registerWidget('anime', AnimeWidget);
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
        // Console d'administration : instanciée seulement si le drapeau est levé.
        // Les appelants testent déjà l'existence de l'objet (`?.open?.()`), donc
        // laisser ces champs à null suffit à neutraliser tous les points d'entrée.
        if (features.isEnabled('features.adminConsole')) {
            SpaceHub.ui.adminDashboard = new AdminDashboardView();
            SpaceHub.ui.jellyfinConsole = new JellyfinConsoleModal();
        }
        log.info('Dashboard & Tous les Widgets enregistrés.');
    } catch (err) {
        log.error('Erreur initialisation Dashboard:', err);
    }

    // 9.5. Notifications & Webhooks (Discord, Telegram, Web Push)
    // Gelées par défaut : un service non initialisé n'est pas une erreur, on ne
    // le signale donc pas comme telle. `SpaceHub.core.notifications` reste null,
    // ce que tous les appelants testent déjà.
    if (!features.isEnabled('features.notifications')) {
        log.info('Notifications gelées (Réglages → Fonctionnalités pour les rallumer).');
    } else {
        try {
            SpaceHub.core.notifications = new NotificationService(eventBus, settings);
            log.info('NotificationService (Discord, Telegram, Web Push) prêt.');
        } catch (err) {
            log.warn('NotificationService non initialisé:', err);
        }
    }

    // 10. Jellyfin Core Amélioré & Lecteur Vidéo
    try {
        SpaceHub.jellyfin.api = new JellyfinAPI();
        SpaceHub.jellyfin.plugins = new JellyfinPluginService({ api: SpaceHub.jellyfin.api, eventBus, cache });
        SpaceHub.metadata = new MetadataService({ jellyfinApi: SpaceHub.jellyfin.api, settings, eventBus, cache });
        SpaceHub.jellyfin.search = new UnifiedSearch();
        SpaceHub.jellyfin.collections = new SmartCollections();
        SpaceHub.player = new VideoPlayer();
        // File d'attente : vide au démarrage, donc sans effet tant que personne
        // n'y met rien. Le lecteur retombe alors sur l'enchaînement d'épisodes.
        SpaceHub.player.queue = new PlayQueue({ eventBus });
        SpaceHub.player._queue = SpaceHub.player.queue;
        services.register('player.queue', SpaceHub.player.queue);
        // Lecture à distance : envoie un ordre à un autre client Jellyfin.
        // Aucun flux ne passe par ce navigateur, c'est le serveur qui relaie.
        SpaceHub.jellyfin.remote = new RemoteControlService({ api, auth, eventBus });
        services.register('jellyfin.remote', SpaceHub.jellyfin.remote);

        // Hors-ligne : le stockage et le gestionnaire de téléchargement.
        // Le navigateur peut ne pas savoir faire (navigation privée, IndexedDB
        // désactivé) : dans ce cas les deux restent null et l'interface masque
        // simplement les entrées correspondantes, sans erreur.
        if (OfflineStore.estDisponible()) {
            const offlineStore = new OfflineStore({ eventBus });
            SpaceHub.offline = {
                store: offlineStore,
                downloads: new DownloadManager({ store: offlineStore, auth, eventBus, settings }),
            };
            services.register('offline.store', SpaceHub.offline.store);
            services.register('offline.downloads', SpaceHub.offline.downloads);
            // Purge des téléchargements expirés au démarrage, sans bloquer le
            // rendu : c'est de l'entretien, pas une étape d'initialisation.
            offlineStore.purger().catch(err => log.warn('Purge hors-ligne :', err));
        } else {
            log.info('Stockage hors-ligne indisponible sur ce navigateur.');
        }
        services.register('jellyfin.api', SpaceHub.jellyfin.api);
        services.register('jellyfin.plugins', SpaceHub.jellyfin.plugins);
        services.register('jellyfin.metadata', SpaceHub.metadata);
        services.register('jellyfin.search', SpaceHub.jellyfin.search);
        services.register('jellyfin.collections', SpaceHub.jellyfin.collections);
        services.register('player', SpaceHub.player);
        log.info('Jellyfin Core Amélioré (API, plugins, métadonnées, UnifiedSearch, SmartCollections, VideoPlayer) prêt.');
    } catch (err) {
        log.error('Erreur initialisation Jellyfin Core:', err);
    }

    // 11. Extension SDK et catalogue approuvé
    SpaceHub.pluginCatalog = new PluginCatalog({
        settings,
        eventBus,
        userProvider: () => SpaceHub.auth?.getUser?.(),
        cache
    });
    SpaceHub.core.pluginCatalog = SpaceHub.pluginCatalog;
    const catalogUrl = settings.get('plugins.catalogUrl', '');
    if (catalogUrl) {
        try {
            await SpaceHub.pluginCatalog.load(catalogUrl);
            log.info('Catalogue SDK signé chargé.');
        } catch (error) {
            log.warn('Catalogue SDK non chargé :', error);
        }
    }
    SpaceHub.policy = new PolicyService({ settings, eventBus, client: api.getClient('jellyfin') });
    SpaceHub.core.policy = SpaceHub.policy;
    pluginManager.setPolicyProvider(() => SpaceHub.policy);
    // Le bridge est optionnel : les extensions restent en mode local si Jellyfin
    // ne fournit pas la configuration du plugin compagnon SpaceHub.
    await SpaceHub.policy.load();
    SpaceHub.sdk = new SpaceHubSDK();
    services.register('pluginCatalog', SpaceHub.pluginCatalog);
    services.register('policy', SpaceHub.policy);
    services.register('sdk', SpaceHub.sdk);
    log.info('Extension SDK disponible via SpaceHub.sdk avec catalogue et permissions.');

    // 11.5. Plugin SDK intégré : notes externes (spacehub.ratings)
    // L'approbation des permissions est réservée aux administrateurs : le plugin
    // n'est donc activé qu'après authentification (ensureRatingsPlugin).
    let ratingsPluginManifest = null;
    try {
        const ratingsModule = await import('../plugins/ratings/spacehub-ratings-plugin.js');
        ratingsPluginManifest = ratingsModule.default || ratingsModule;
        await pluginManager.registerPlugin(ratingsPluginManifest, { autoEnable: false });
        log.info(`Plugin SDK intégré "${ratingsPluginManifest.id}" enregistré (activation après authentification).`);
    } catch (err) {
        log.warn('Plugin de notes non enregistré :', err);
    }

    const ensureRatingsPlugin = async () => {
        const manifest = ratingsPluginManifest;
        if (!manifest) return;
        try {
            if (settings.get(`plugins.${manifest.id}.enabled`, null) === false) return; // désactivé volontairement
            const isAdmin = SpaceHub.auth?.getUser?.()?.Policy?.IsAdministrator === true;
            if (isAdmin) pluginManager.approvePermissions(manifest.id, manifest.permissions || []);
            const policy = pluginManager.getPermissionPolicy?.(manifest.id);
            if ((policy?.denied || []).length > 0) {
                log.info('Plugin de notes inactif : permissions non approuvées sur ce compte.');
                return;
            }
            const state = pluginManager.getPlugins?.().find(p => p.id === manifest.id)?.state;
            if (state !== 'enabled') await pluginManager.enablePlugin(manifest.id);
        } catch (err) {
            log.warn(`Activation du plugin de notes impossible : ${err?.message || err}`);
        }
    };

    // 12. Enregistrement des intégrations
    const registerIntegration = async (id, name, ServiceClass) => {
        moduleManager.register({
            id,
            name,
            enabled: settings.get(`${id}.enabled`, true),
            init: async () => {
                const service = new ServiceClass({ cache, eventBus, settings });
                SpaceHub.integrations[id] = service;
                services.register(`integrations.${id}`, service);
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

    // A09 (option sûre) : ne plus bloquer le premier rendu sur l'initialisation des intégrations
    // Servarr. Les widgets qui les consomment (Dashboard) affichent déjà un état "non configuré"
    // tant que l'intégration n'est pas prête (cf. audit A09), donc on peut les initialiser après
    // le montage de l'app plutôt que d'attendre les 6 appels réseau/disque avant le premier rendu.
    const registerDeferredIntegrations = async () => {
        await registerIntegration('sonarr', 'Sonarr Integration', SonarrService);
        await registerIntegration('radarr', 'Radarr Integration', RadarrService);
        await registerIntegration('prowlarr', 'Prowlarr Integration', ProwlarrService);
        await registerIntegration('bazarr', 'Bazarr Integration', BazarrService);
        await registerIntegration('jellyseerr', 'Jellyseerr Integration', JellyseerrService);
        await registerIntegration('qbittorrent', 'qBittorrent Integration', QBittorrentService);
    };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => { registerDeferredIntegrations(); }, { timeout: 2000 });
    } else {
        setTimeout(() => { registerDeferredIntegrations(); }, 0);
    }

    // 13. Monter l'application cliente dans #app (si présent)
    const appTarget = document.getElementById('app');
    if (appTarget) {
        const renderApp = () => {
            appTarget.innerHTML = '';
            if (auth.isAuthenticated()) {
                const appLayout = new AppLayout();
                SpaceHub.ui.appLayout = appLayout;
                services.register('ui.appLayout', appLayout, { override: true });
                appLayout.render(appTarget);
                log.info('AppLayout monté dans #app (Session active).');
                window.SpaceHub.gamepad = appLayout?._spatialNav?._gamepad;
                if (!window.SpaceHub.core) window.SpaceHub.core = {};
                window.SpaceHub.core.gamepad = appLayout?._spatialNav?._gamepad;
                ensureRatingsPlugin();
                setTimeout(() => OnboardingWizard.startForCurrentUser(SpaceHub.ui.onboarding), 350);
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

    // 13.5 Outils de développement — chargés uniquement en dev.
    // `import.meta.env.DEV` est remplacé statiquement par Vite au build, donc
    // ce bloc (et le harnais qu'il importe) disparaît complètement du bundle
    // de production : aucun coût pour l'utilisateur final.
    if (import.meta.env?.DEV) {
        try {
            const { default: NavTestHarness } = await import('./dev/NavTestHarness.js');
            SpaceHub.dev = SpaceHub.dev || {};
            SpaceHub.dev.navTest = new NavTestHarness(spatialNav);
            services.register('dev.navTest', SpaceHub.dev.navTest);
            log.info('Outils de développement prêts — lancez : await SpaceHub.dev.navTest.runAll()');
        } catch (err) {
            log.warn('Harnais de navigation non chargé :', err);
        }
    }

    // 13.8 Coque applicative hors-ligne.
    // Uniquement sur l'application construite : en développement, un service
    // worker qui met en cache des modules servirait des versions périmées à
    // chaque rechargement et donnerait l'impression que les modifications ne
    // prennent pas effet — le pire mode de panne pour du travail en cours.
    if (!import.meta.env?.DEV && 'serviceWorker' in navigator && settings.get('offline.enabled', true)) {
        navigator.serviceWorker.register('/sh-offline-sw.js')
            .then(() => log.info('Coque hors-ligne active — l\'application s\'ouvre sans réseau.'))
            .catch(err => log.warn('Coque hors-ligne non enregistrée :', err));
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
