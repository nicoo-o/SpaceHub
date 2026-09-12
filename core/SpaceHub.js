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

// Socle de compatibilité — volontairement le PREMIER import du graphe : il
// corrige des API que le code d'amorçage de Vite lui-même utilise (Array.at).
import './compat.js';

import Logger          from './Logger.js';
import EventBus        from './EventBus.js';
import ModuleManager   from './ModuleManager.js';
import PluginManager    from './PluginManager.js';
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
import Router           from './Router.js';
import { chargerConsoleAdmin } from '../ui/views/chargerConsoleAdmin.js';
import { ouvrirReglages } from '../ui/components/chargerReglages.js';
import MinuteurSommeil  from './MinuteurSommeil.js';
import SocketJellyfin   from '../jellyfin/temps-reel/SocketJellyfin.js';
import CibleDistante    from '../jellyfin/temps-reel/CibleDistante.js';
import SyncPlay         from '../jellyfin/temps-reel/SyncPlay.js';
import Paroles          from '../jellyfin/musique/Paroles.js';
import RadioArtiste     from '../jellyfin/musique/RadioArtiste.js';
import EcranMusique     from '../ui/views/EcranMusique.js';
import SettingsManager from './SettingsManager.js';
import CacheManager    from './CacheManager.js';
import { ApiClient, JellyfinClient } from './ApiClient.js';
import SpaceHubSDK     from './SDK.js';
import PluginCatalog   from './PluginCatalog.js';
import PolicyService   from './PolicyService.js';
import TouchEngine     from './TouchEngine.js';
import AudioFeedback    from './AudioFeedback.js';
import SpatialNavigation from './SpatialNavigation.js';
import inputRouter from './InputRouter.js';
import RatingCacheService from './RatingCacheService.js';
import TvModeManager    from './TvModeManager.js';
import ProfilAppareil   from './ProfilAppareil.js';
import PontAndroid      from './PontAndroid.js';
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
import ModalSlideUpSheet from '../ui/components/ModalSlideUpSheet.js';
import AppLayout       from '../ui/layouts/AppLayout.js';
import Dashboard       from '../ui/layouts/Dashboard.js';
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






import { enregistrerTouches } from './TelecommandeTv.js';

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
     *   settingsPanel: Object|null,   // chargé à la demande
     *   components: {
     *     toaster: Toaster,
     *     Modal: typeof Modal,
     *     cardBuilder: CardBuilder,
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
            // La CLASSE n'est plus exposée : elle n'est chargée qu'à
            // l'ouverture des réglages. Exposer un constructeur qui peut ne pas
            // exister encore ferait plus de mal que de bien — quiconque en a
            // besoin passe par `ouvrirReglages()`.
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

    // Touches média de la télécommande. Doit se faire TÔT : sur Samsung,
    // `registerKeyBatch` est ce qui décide si l'application recevra un jour ces
    // événements. Sans cet appel, ⏯ ⏪ ⏩ n'atteignent jamais le code, quoi
    // qu'on écoute ensuite.
    const tv = enregistrerTouches();
    if (tv.plateforme !== 'navigateur') {
        log.info(`Plateforme détectée : ${tv.plateforme}.`);
    }

    // Profil d'appareil — AVANT toute interface : le marqueur html.sh-gsm
    // doit être posé avant le premier render pour que le CSS GSM s'applique
    // sans flash d'interface PC. La détection TV réutilise TelecommandeTv.
    const profilAppareil = new ProfilAppareil({ settings: null });
    profilAppareil.init();
    SpaceHub.core.profilAppareil = profilAppareil;
    services.register('profil.appareil', profilAppareil);

    // Pont Android — SILENCIEUX hors APK : sans `window.cordova` (web,
    // Electron, TV) il ne branche rien. En APK, il attend `deviceready` puis
    // route le bouton retour système vers le même pipeline que la touche
    // Retour TV (couche du dessus fermée, sinon confirmation de sortie).
    // Injecté TÔT : le geste retour peut arriver pendant le démarrage.
    const pontAndroid = new PontAndroid({ logger: new Logger('PontAndroid') });
    pontAndroid.init();
    SpaceHub.core.pontAndroid = pontAndroid;
    services.register('pont.android', pontAndroid);

    const touchEngine = new TouchEngine();
    const audioFeedback = new AudioFeedback();
    const spatialNav = new SpatialNavigation();

    SpaceHub.spatialNav = spatialNav;
    // Appel public uniquement. La ligne portait `: spatialNav._gamepad` en repli :
    // une méthode publique DOUBLÉE d'une atteinte d'état privé, donc deux façons
    // de lire la même chose dont une que rien ne protège. `getGamepad()` est au
    // contrat de façade (core/ContratSpatialNavigation.js) et testé — c'est elle
    // qui répond, ou rien.
    SpaceHub.gamepad = spatialNav.getGamepad ? spatialNav.getGamepad() : null;
    SpaceHub.core.spatialNavigation = spatialNav;
    services.register('nav.spatial', spatialNav);
    // Le pont a besoin du moteur pour son pipeline Retour — branché ici,
    // après sa création (le pont lui-même est créé avant, le geste pouvant
    // arriver tôt ; sans moteur attaché il répondra `false` = confirmation
    // de sortie, jamais un blocage).
    pontAndroid.brancherMoteur?.(spatialNav);
    // Le routeur d'entrée est exposé pour pouvoir INSPECTER l'ordre de
    // distribution du clavier — c'est tout l'intérêt de l'avoir rendu
    // explicite : un ordre qu'on ne peut pas lire n'est pas vérifiable.
    SpaceHub.core.inputRouter = inputRouter;
    services.register('input.router', inputRouter);
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
        // Forçage du profil d'appareil ('' | 'gsm' | 'bureau') — même esprit
        // que ui.tvMode : le réglage prime sur la détection. Vide = détecter.
        //
        // Voir core/ProfilAppareil.js : `brancherReglage()` écoute
        // `settings:changed` et rappelle `_appliquer()` dès que cette clé
        // bouge, ce qui repose le marqueur `html.sh-gsm` sans rechargement.
        //
        // (Ce commentaire renvoyait à `profilAppareil.appliquerForcage()`,
        // une méthode qui n'a jamais existé. Le comportement décrit était
        // juste, le nom ne l'était pas — et un lecteur qui cherche une API
        // inexistante finit par douter du reste du commentaire.)
        'ui.forceProfil': '',
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
    // Le forçage par réglage n'était pas branchable à la création du profil :
    // SettingsManager n'existait pas encore. C'est branché maintenant.
    profilAppareil.brancherReglage(eventBus);
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
        // L'écran des réglages est chargé À LA DEMANDE : 17 ko compressés
        // qui ne servent qu'au moment où quelqu'un ouvre les réglages, et
        // jamais au premier écran. Le chargeur `ui/components/chargerReglages`
        // le construit et l'enregistre alors.
        //
        // Le chaînage `svc.settingsPanel()?.open()` des points d'entrée a été
        // remplacé par `ouvrirReglages()` : sans cela, un clic avant chargement
        // n'aurait RIEN fait — pas d'erreur, un bouton mort.
        //
        // La façade globale expose l'OUVERTURE, pas l'instance : un scénario
        // e2e ou une console qui écrivait `SpaceHub.ui.settingsPanel.open()`
        // écrit maintenant `await SpaceHub.ui.ouvrirReglages()`.
        SpaceHub.ui.ouvrirReglages = ouvrirReglages;
        SpaceHub.ui.onboarding = new OnboardingWizard({ settings, auth, eventBus });
        
        const modalSlideUp = new ModalSlideUpSheet();
        SpaceHub.ui.modalSlideUpSheet = modalSlideUp;
        services.register('ui.themes', themeManager);
        services.register('ui.toaster', SpaceHub.ui.components.toaster);
        services.register('ui.cardBuilder', SpaceHub.ui.components.cardBuilder);
        services.register('ui.settingsPanel', SpaceHub.ui.settingsPanel);
        services.register('ui.slideUpSheet', modalSlideUp);
        SpaceHub.ui.components.modalSlideUpSheet = modalSlideUp;

        log.info('UI & Design System (ThemeManager, Toaster, Modal, CardBuilder, ModalSlideUpSheet) prêts. Réglages : à la demande.');
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
        // POURQUOI CES WIDGETS RESTENT IMPORTÉS STATIQUEMENT.
        //
        // Le paquet `integrations` pèse 17 ko compressés et est chargé au
        // démarrage pour des tableaux de bord Servarr que beaucoup
        // d'installations n'ont pas. Les rendre dynamiques a été TENTÉ et
        // ANNULÉ, parce que le tableau de bord ne le supporte pas : à la
        // lecture de l'agencement, un type de widget non encore enregistré est
        // ignoré avec un simple avertissement (`Type de widget inconnu`), et
        // il n'apparaît PAS au chargement suivant — le tableau ne se rerend
        // pas de lui-même.
        //
        // Différer l'import ferait donc disparaître les widgets Servarr au
        // premier affichage, en silence, pour ceux qui s'en servent. Le faire
        // proprement demande que `registerWidget` sache monter un widget
        // arrivé en retard dans l'emplacement qui l'attendait — un chantier à
        // part, pas une retouche d'import.
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
        // CE QUE LE GEL NE FAISAIT PAS. `FeatureFlags.js` le disait lui-même :
        // « Ce que le gel NE fait pas : alléger le bundle. Le code est toujours
        // importé. […] Un vrai retrait passerait par un import dynamique —
        // c'est la suite logique si le gel se confirme dans la durée. »
        //
        // Le gel a tenu. Ces deux vues pèsent 18,5 ko compressés et étaient
        // téléchargées puis compilées à CHAQUE démarrage pour une
        // fonctionnalité éteinte par défaut. L'import devient donc dynamique.
        //
        // Volontairement non attendu : rien au démarrage n'en dépend, les
        // appelants les cherchent au moment du clic.
        // Le drapeau est levé : on précharge, sans attendre. Le chargeur
        // mémorise sa promesse, donc un clic pendant le chargement ne construit
        // pas une seconde vue — il rejoint celle qui arrive.
        if (features.isEnabled('features.adminConsole')) {
            chargerConsoleAdmin().catch(err => log.warn("Console d'administration indisponible :", err));
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
        // L'affectation passe par le setter public `queue` de VideoPlayer :
        // plus besoin du miroir `_queue` — l'API, c'est l'accesseur.
        SpaceHub.player.queue = new PlayQueue({ eventBus });
        services.register('player.queue', SpaceHub.player.queue);
        // Lecture à distance : envoie un ordre à un autre client Jellyfin.
        // Aucun flux ne passe par ce navigateur, c'est le serveur qui relaie.
        SpaceHub.jellyfin.remote = new RemoteControlService({ api, auth, eventBus });
        services.register('jellyfin.remote', SpaceHub.jellyfin.remote);

        // Mode musique. C'est le plus gros angle mort de l'écosystème : les
        // autres clients de téléviseur annoncent explicitement ne pas gérer la
        // musique. Trois pièces, du plus au moins rentable : la radio d'artiste
        // (le serveur compose, on lit), l'écran plein cadre, et les paroles
        // synchronisées au mot quand le fichier en porte.
        SpaceHub.musique = {
            // Le repli est posé par le greffon `spacehub.paroles` s'il est
            // activé ; sans lui, seules les paroles portées par le fichier
            // s'affichent — c'est-à-dire presque aucune.
            paroles: new Paroles({ api }),
            radio: new RadioArtiste({ api, auth }),
        };
        SpaceHub.musique.ecran = new EcranMusique({
            paroles: SpaceHub.musique.paroles,
            api,
            // Le lecteur peut ne pas être ouvert : la fonction renvoie alors
            // null, et la boucle d'animation ne fait rien plutôt que de jeter.
            media: () => SpaceHub.player?.videoElement || null,
        });
        services.register('musique.paroles', SpaceHub.musique.paroles);
        services.register('musique.radio', SpaceHub.musique.radio);
        services.register('musique.ecran', SpaceHub.musique.ecran);

        // Minuteur de sommeil : attendu de tout appareil de salon, absent ici.
        SpaceHub.core.sommeil = new MinuteurSommeil({
            lecteur: () => SpaceHub.player,
            toaster: SpaceHub.ui?.components?.toaster,
            eventBus,
        });
        services.register('core.sommeil', SpaceHub.core.sommeil);

        // Canal temps réel + réception d'ordres (« cast »).
        //
        // C'est le pendant de RemoteControlService : celui-ci ENVOIE des ordres
        // à d'autres appareils, celui-là en REÇOIT. Les deux conditions pour
        // apparaître dans la liste des cibles d'un téléphone sont réunies ici et
        // seulement ici : la déclaration de capacités, et un WebSocket ouvert.
        //
        // Rien de tout cela ne démarre sans session : un socket ouvert avec un
        // jeton vide serait refusé huit fois puis abandonné, pour rien.
        if (auth.isAuthenticated()) {
            const socket = new SocketJellyfin({
                serveur: () => auth.getServerUrl(),
                jeton: () => auth.getToken(),
                deviceId: () => auth.getDeviceId(),
                eventBus,
            });
            SpaceHub.jellyfin.socket = socket;
            services.register('jellyfin.socket', socket);
            socket.connecter();

            const cible = new CibleDistante({
                socket,
                api,
                // Accès PARESSEUX au lecteur : il est remplacé lors d'un
                // rechargement de source, et une référence figée pointerait
                // alors sur l'instance précédente — les ordres partiraient dans
                // le vide sans la moindre erreur.
                lecteur: () => SpaceHub.player,
                file: () => SpaceHub.player?.queue,
                routeur: SpaceHub.router,
                toaster: SpaceHub.ui?.components?.toaster,
                // Le téléphone comme clavier : la recherche est construite plus
                // tard dans l'initialisation, d'où l'accès paresseux.
                recherche: () => SpaceHub.jellyfin?.search,
            });
            SpaceHub.jellyfin.cibleDistante = cible;
            services.register('jellyfin.cible-distante', cible);
            // La déclaration part en arrière-plan : un serveur qui la refuse ne
            // doit pas retarder l'affichage de la page d'accueil.
            cible.activer().catch(err => log.warn('Cible de lecture à distance :', err));

            // SyncPlay — regarder ensemble. Le canal, le lecteur et la file
            // existaient déjà ; il ne manquait qu'une horloge commune.
            //
            // Rien ne démarre tant qu'un groupe n'est pas rejoint : l'horloge
            // ne se cale pas, aucun abonnement n'est posé, aucune minuterie ne
            // tourne. Le service est prêt, il n'est pas actif.
            const syncPlay = new SyncPlay({
                api, socket,
                lecteur: () => SpaceHub.player,
                toaster: SpaceHub.ui?.components?.toaster,
                eventBus,
            });
            SpaceHub.jellyfin.syncPlay = syncPlay;
            services.register('jellyfin.syncplay', syncPlay);
        }

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
            // L'approbation était conditionnée au rôle administrateur. Or ce
            // plugin ne demande que des permissions LOCALES
            // (`network.external.read`, `jellyfin.metadata.read`) : aucune
            // n'agit sur le serveur. Le résultat était qu'aucun compte
            // ordinaire ne voyait jamais de note externe — alors que l'écran
            // de réglages lui demandait pourtant sa clé API OMDb.
            // `approvePermissions` refuse désormais de lui-même, et lui seul,
            // ce qui touche au serveur.
            try {
                pluginManager.approvePermissions(manifest.id, manifest.permissions || []);
            } catch (err) {
                log.info(`Permissions du plugin de notes non approuvées : ${err?.message || err}`);
            }
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
        const renderApp = (avis = '') => {
            appTarget.innerHTML = '';
            if (auth.isAuthenticated()) {
                const appLayout = new AppLayout();
                SpaceHub.ui.appLayout = appLayout;
                services.register('ui.appLayout', appLayout, { override: true });
                appLayout.render(appTarget);
                log.info('AppLayout monté dans #app (Session active).');
                // La coquille connaît les vues : c'est elle qui sait défaire la
                // dernière navigation d'onglet quand le bouton retour système
                // n'a plus de couche à fermer. Branchée APRÈS son render — le
                // pont, lui, existe depuis le début.
                pontAndroid.brancherVues?.(appLayout);
                // `getGamepad()` publique, sur le singleton : la ligne lisait
                // `appLayout?._spatialNav?._gamepad`, soit DEUX champs privés
                // traversés (ceux de la coquille puis ceux du moteur) pour une
                // valeur que le contrat expose et que les tests couvrent.
                window.SpaceHub.gamepad = spatialNav.getGamepad ? spatialNav.getGamepad() : null;
                if (!window.SpaceHub.core) window.SpaceHub.core = {};
                window.SpaceHub.core.gamepad = window.SpaceHub.gamepad;
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
                }, { avis });
                SpaceHub.ui.loginView = loginView;
                loginView.render(appTarget);
                log.info('LoginView affiché dans #app (Non connecté).');
            }
        };
        renderApp();

        // 13.2 Session révoquée côté serveur.
        //
        // Jusqu'ici, la validité du jeton n'était vérifiée qu'AU DÉMARRAGE
        // (`AuthManager.init`). Si l'administrateur fermait la session pendant
        // l'utilisation, chaque widget affichait indépendamment « n'a pas pu
        // s'afficher », l'état local restait « authentifié », et rien ne
        // ramenait à l'écran de connexion ni ne disait pourquoi.
        //
        // `ApiClient` émet désormais `auth:expired` UNE SEULE FOIS par
        // chargement de page, sur le premier 401/403. On y répond ici : c'est
        // le seul endroit qui sait remonter l'écran de connexion.
        let sessionExpireeTraitee = false;
        eventBus.on('auth:expired', ({ status } = {}) => {
            if (sessionExpireeTraitee) return;
            sessionExpireeTraitee = true;
            log.warn(`Session Jellyfin refusée par le serveur (HTTP ${status}) — retour à la connexion.`);
            // `rechargement: false` : un reload effacerait le message ci-dessous.
            auth.logout({ rechargement: false });
            renderApp('Votre session a expiré ou a été fermée par l\'administrateur du serveur. Reconnectez-vous pour continuer.');
        });
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

    // 13.6 HUD de diagnostic de navigation.
    //
    // Contrairement au harnais ci-dessus, il n'est PAS réservé au
    // développement : son intérêt est justement d'exister sur l'appareil de
    // recette. Sur un téléviseur il n'y a pas de console — quand le focus part
    // au mauvais endroit, on ne dispose que de ce qu'on a appuyé et de ce qui
    // est sélectionné après. Le HUD dit pourquoi.
    //
    // Il reste inerte tant que `?debug=1` n'est pas dans l'URL : le module est
    // chargé (quelques kilo-octets) mais ne construit rien, ne mesure rien, et
    // la consignation côté moteur est gardée par un drapeau à `null`.
    try {
        const { installerHud } = await import('./dev/DebugHud.js');
        installerHud(SpaceHub);
    } catch (err) {
        log.debug('HUD de diagnostic non chargé :', err?.message || err);
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
    //     (également appelé par le `finally` de `demarrer()` : voir plus bas —
    //      un écran de chargement qui ne part jamais est le pire mode de panne.)
    retirerSplash();

    // 14.5 Perte et retour de connexion.
    //
    // AUDIT B7 — l'application ne s'intéressait pas du tout à l'état du
    // réseau. Coupure Wi-Fi : chaque widget partait en erreur l'un après
    // l'autre, chacun affichant « n'a pas pu s'afficher » sans jamais nommer
    // la vraie cause, et rien ne se rétablissait au retour du réseau — il
    // fallait recharger la page.
    //
    // `navigator.onLine === false` est une information FIABLE (aucune
    // interface réseau) ; `true` ne prouve rien. On s'en sert donc pour
    // expliquer une panne, jamais pour promettre que tout fonctionne.
    if (typeof window !== 'undefined') {
        const racine = document.documentElement;
        let etaitHorsLigne = navigator.onLine === false;
        racine.classList.toggle('sh-hors-ligne', etaitHorsLigne);

        window.addEventListener('offline', () => {
            etaitHorsLigne = true;
            racine.classList.add('sh-hors-ligne');
            log.warn('Connexion réseau perdue.');
            eventBus.emit('reseau:hors-ligne');
            SpaceHub.ui?.components?.toaster?.show?.(
                'Connexion perdue. Les contenus déjà téléchargés restent disponibles.', 'error');
        });

        window.addEventListener('online', () => {
            racine.classList.remove('sh-hors-ligne');
            log.info('Connexion réseau rétablie.');
            eventBus.emit('reseau:en-ligne');
            // On ne recharge pas la page de force : l'utilisateur perdrait sa
            // position. On annonce le retour et on invite les vues à se
            // rafraîchir — celles qui écoutent le font, les autres attendent
            // une navigation.
            if (etaitHorsLigne) {
                etaitHorsLigne = false;
                SpaceHub.ui?.components?.toaster?.show?.('Connexion rétablie.', 'success');
                eventBus.emit('donnees:rafraichir', { cause: 'retour-reseau' });
            }
        });
    }

    // 15. Émettre l'événement de démarrage global
    eventBus.emit('spacehub:ready', { version: SpaceHub.version });
    log.info(`🎉 SpaceHub v${SpaceHub.version} Stable initialisé avec succès.`);
}

// ─── Exposition & Bootstrap ──────────────────────────────────────────────────

/** Retire l'écran de chargement. Idempotent : sûr à appeler deux fois. */
function retirerSplash() {
    const splash = document.getElementById('sh-splash-loader');
    if (!splash || splash.dataset.shRetire === '1') return;
    splash.dataset.shRetire = '1';
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 400);
}

/**
 * Écran de dernier recours : `init()` a échoué avant d'avoir monté quoi que
 * ce soit. Sans lui, retirer le splash ne ferait que révéler une page noire —
 * l'utilisateur n'aurait aucun moyen de savoir si l'application charge encore,
 * si son serveur est éteint, ou si le navigateur est trop ancien. On donne le
 * message d'origine et un bouton pour réessayer.
 */
function afficherEchecDemarrage(err) {
    const cible = document.getElementById('app');
    if (!cible || cible.querySelector('.sh-boot-error')) return;
    const carte = document.createElement('div');
    carte.className = 'sh-boot-error';
    carte.setAttribute('role', 'alert');
    carte.style.cssText = 'max-width:560px;margin:18vh auto;padding:28px 30px;'
        + 'border-radius:16px;border:1px solid rgba(255,69,58,0.32);'
        + 'background:rgba(255,69,58,0.10);color:#fff;'
        + 'font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;';

    const titre = document.createElement('h2');
    titre.textContent = 'SpaceHub n\'a pas pu démarrer.';
    titre.style.cssText = 'margin:0 0 10px;font-size:19px;font-weight:600;';

    const detail = document.createElement('p');
    // textContent, jamais innerHTML : le message peut venir du serveur.
    detail.textContent = err?.message || String(err || 'Erreur inconnue.');
    detail.style.cssText = 'margin:0 0 20px;opacity:0.82;font-size:13.5px;word-break:break-word;';

    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.textContent = 'Recharger';
    bouton.style.cssText = 'padding:11px 26px;border-radius:10px;border:0;cursor:pointer;'
        + 'background:#fff;color:#111;font-size:14px;font-weight:600;';
    bouton.addEventListener('click', () => window.location.reload());

    carte.append(titre, detail, bouton);
    cible.appendChild(carte);
}

/**
 * Enveloppe de démarrage.
 *
 * Deux défauts corrigés ici :
 *   1. `init` était passé tel quel à `addEventListener` : la promesse qu'il
 *      renvoie n'était rattachée à rien, donc un échec de démarrage partait en
 *      rejet non traité — sans message, sans écran de repli.
 *   2. Le retrait du splash était la DERNIÈRE instruction de `init` : toute
 *      exception avant elle laissait l'écran de chargement en place pour
 *      toujours. Il est désormais dans un `finally`.
 */
function demarrer() {
    return init()
        .catch(err => {
            console.error('[SpaceHub] Erreur d\'initialisation:', err);
            afficherEchecDemarrage(err);
        })
        .finally(retirerSplash);
}

if (typeof window !== 'undefined') {
    window.SpaceHub = SpaceHub;

    // Démarre dès que le DOM est prêt
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { demarrer(); });
    } else {
        // DOM déjà chargé (injection tardive)
        demarrer();
    }
}

export default SpaceHub;
