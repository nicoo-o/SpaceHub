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
import NotificationService from './notifications/NotificationService.js';
import MediaHealth from './health/MediaHealth.js';
import UsageAnalytics from './analytics/UsageAnalytics.js';
import SecureStorage from './security/SecureStorage.js';
import UserPermissions from './permissions/UserPermissions.js';
import ParentalControl from './parental/ParentalControl.js';
import ExtensionMarketplace from './extensions/ExtensionMarketplace.js';
import { ApiClient, JellyfinClient } from './ApiClient.js';
import SpaceHubSDK     from './SDK.js';

import ThemeManager    from '../ui/themes/ThemeManager.js';
import Toaster         from '../ui/components/Toaster.js';
import Modal           from '../ui/components/Modal.js';
import CardBuilder     from '../ui/components/CardBuilder.js';
import SettingsPanel   from '../ui/components/SettingsPanel.js';
import Dashboard       from '../ui/layouts/Dashboard.js';

import QuickActionsWidget     from '../ui/widgets/QuickActionsWidget.js';
import ContinueWatchingWidget from '../ui/widgets/ContinueWatchingWidget.js';
import LatestAdditionsWidget  from '../ui/widgets/LatestAdditionsWidget.js';
import { UsageAnalyticsWidget, MediaHealthWidget } from '../ui/widgets/AnalyticsAndHealthWidgets.js';

import JellyfinAPI      from '../jellyfin/api/JellyfinAPI.js';
import UnifiedSearch    from '../jellyfin/search/UnifiedSearch.js';
import SmartCollections from '../jellyfin/collections/SmartCollections.js';

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

import ImmichService from '../integrations/immich/ImmichService.js';
import { ImmichSouvenirsWidget } from '../integrations/immich/ImmichWidgets.js';

import LidarrService from '../integrations/lidarr/LidarrService.js';
import { LidarrUpcomingWidget, LidarrQueueWidget } from '../integrations/lidarr/LidarrWidgets.js';
import { ActiveSessionsWidget, ServerHealthWidget } from '../ui/widgets/ServerStatsWidget.js';
import { RecommendedWidget, TrendsWidget } from '../ui/widgets/DiscoveryWidgets.js';

import RecommendationService from './Discovery/RecommendationService.js';
import FamilyService from './Family/FamilyService.js';

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
        notifications: null,
        health: null,
        analytics: null,
        discovery: null,
        family: null,
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
        immich: null,
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
        'immich.enabled': true,
        'immich.url': '',
        'immich.apiKey': '',
        'lidarr.enabled': true,
        'lidarr.url': 'http://localhost:8686',
        'lidarr.apiKey': '',
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

    // 6bis. NotificationService
    const notifications = new NotificationService(eventBus, settings);
    SpaceHub.core.notifications = notifications;

    // 6ter. MediaHealth
    SpaceHub.core.health = new MediaHealth();

    // 6quater. UsageAnalytics
    SpaceHub.core.analytics = new UsageAnalytics(eventBus);

    // 6quinquies. Discovery & Family
    SpaceHub.core.discovery = new RecommendationService(eventBus);
    SpaceHub.core.family = new FamilyService(settings);

    // 6sexies. Security, Permissions, Parental Control & Extensions
    const security = new SecureStorage();
    SpaceHub.core.security = security;

    const permissions = new UserPermissions(eventBus, settings);
    SpaceHub.core.permissions = permissions;

    const parental = new ParentalControl(eventBus, settings, permissions);
    SpaceHub.core.parental = parental;

    const marketplace = new ExtensionMarketplace(SpaceHub.sdk);
    SpaceHub.core.marketplace = marketplace;

    // 7. ApiClient + JellyfinClient
    const api = new ApiClient();
    SpaceHub.core.api = api;

    try {
        api.addClient('jellyfin', new JellyfinClient());
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

        log.info('UI & Design System (ThemeManager, Toaster, Modal, CardBuilder, SettingsPanel) prêts.');
    } catch (err) {
        log.error('Erreur initialisation UI:', err);
    }

    // 9. UI — Dashboard & Tous les Widgets
    try {
        const dashboard = new Dashboard({ settings, eventBus });
        dashboard.registerWidget('quick-actions', QuickActionsWidget);
        dashboard.registerWidget('continue-watching', ContinueWatchingWidget);
        dashboard.registerWidget('latest-additions', LatestAdditionsWidget);
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
        dashboard.registerWidget('immich-souvenirs', ImmichSouvenirsWidget);
        dashboard.registerWidget('lidarr-upcoming', LidarrUpcomingWidget);
        dashboard.registerWidget('lidarr-queue', LidarrQueueWidget);
        dashboard.registerWidget('active-sessions', ActiveSessionsWidget);
        dashboard.registerWidget('server-health', ServerHealthWidget);
        dashboard.registerWidget('recommended', RecommendedWidget);
        dashboard.registerWidget('trends', TrendsWidget);
        dashboard.registerWidget('usage-analytics', UsageAnalyticsWidget);
        dashboard.registerWidget('media-health', MediaHealthWidget);

        SpaceHub.ui.dashboard = dashboard;
        log.info('Dashboard & Tous les Widgets enregistrés.');
    } catch (err) {
        log.error('Erreur initialisation Dashboard:', err);
    }

    // 10. Jellyfin Core Amélioré
    try {
        SpaceHub.jellyfin.api = new JellyfinAPI();
        SpaceHub.jellyfin.search = new UnifiedSearch();
        SpaceHub.jellyfin.collections = new SmartCollections();
        log.info('Jellyfin Core Amélioré (API, UnifiedSearch, SmartCollections) prêt.');
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
    await registerIntegration('immich', 'Immich Integration', ImmichService);
    await registerIntegration('lidarr', 'Lidarr Integration', LidarrService);

    // 13. Émettre l'événement de démarrage global
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
