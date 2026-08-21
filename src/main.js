/**
 * SpaceHub — Point d'entrée de l'app standalone (Vite)
 * Version: 1.0.0
 *
 * C'est ce fichier qui manquait : `index.html` le charge (`/src/main.js`)
 * mais rien ne l'implémentait encore, donc l'app ne démarrait pas.
 *
 * Rôle :
 *   1. Démarrer le Core (`core/SpaceHub.js`), qui s'auto-initialise à l'import
 *      (Logger, EventBus, ModuleManager, Settings, Cache, ApiClient, UI, Dashboard,
 *      Jellyfin Core, SDK, intégrations).
 *   2. Attacher l'AuthManager standalone à `window.SpaceHub.auth`
 *      (attendu par LoginView.js et AppLayout.js, mais jamais branché avant).
 *   3. Vérifier si une session Jellyfin valide existe déjà.
 *   4. Afficher l'écran de connexion (LoginView) si nécessaire, sinon monter
 *      la coquille applicative (AppLayout).
 */

'use strict';

// Démarre le Core (effet de bord : s'auto-initialise dès l'import et expose window.SpaceHub)
import '../core/SpaceHub.js';

import AuthManager from '../jellyfin/auth/AuthManager.js';
import LoginView    from '../ui/views/LoginView.js';
import AppLayout    from '../ui/layouts/AppLayout.js';
import VideoPlayer  from '../jellyfin/player/VideoPlayer.js';
import AudioPlayer  from '../jellyfin/player/audio/AudioPlayer.js';
import ServerManager from '../jellyfin/server/ServerManager.js';
import FederatedSearch from '../jellyfin/search/FederatedSearch.js';
import DataSyncService from '../core/sync/DataSyncService.js';
import TrailerService from '../jellyfin/trailers/TrailerService.js';
import NaturalSearchEngine from '../jellyfin/search/NaturalSearchEngine.js';
import SyncPlayManager from '../jellyfin/syncplay/SyncPlayManager.js';
import LiveStreamMonitor from '../jellyfin/admin/LiveStreamMonitor.js';
import ServerTaskController from '../jellyfin/admin/ServerTaskController.js';
import StorageInspector from '../jellyfin/admin/StorageInspector.js';
import OfflineDownloadManager from '../jellyfin/offline/OfflineDownloadManager.js';
import OfflineSyncReconnector from '../jellyfin/offline/OfflineSyncReconnector.js';
import LiveTvService from '../jellyfin/livetv/LiveTvService.js';
import HomeAssistantService from '../integrations/homeassistant/HomeAssistantService.js';
import AmbilightEngine from '../core/ambilight/AmbilightEngine.js';
import CinemaModeService from '../core/domotics/CinemaModeService.js';
import AccessibilityManager from '../core/accessibility/AccessibilityManager.js';
import RewindService from '../core/analytics/RewindService.js';
import CinematicIntroEngine from '../core/intro/CinematicIntroEngine.js';
import WorkerThreadPool from '../core/perf/WorkerThreadPool.js';
import MultiTierCache from '../core/perf/MultiTierCache.js';
import NetworkQualityGuardian from '../core/perf/NetworkQualityGuardian.js';
import ProCodeThemeEditor from '../ui/themes/ProCodeThemeEditor.js';

const APP_EL_ID    = 'app';
const SPLASH_EL_ID = 'sh-splash-loader';
const CORE_READY_TIMEOUT_MS = 4000;

/**
 * Attend que le Core (core/SpaceHub.js) ait fini son initialisation.
 * On sait que c'est prêt quand `window.SpaceHub.ui.dashboard` existe
 * (créé à l'étape 9 de core/SpaceHub.js#init), avec un timeout de sécurité
 * pour ne jamais bloquer l'affichage indéfiniment en cas d'erreur du Core.
 */
function waitForCore() {
    return new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
            const ready = !!(window.SpaceHub && window.SpaceHub.ui && window.SpaceHub.ui.dashboard);
            if (ready || Date.now() - start > CORE_READY_TIMEOUT_MS) {
                resolve();
            } else {
                setTimeout(check, 30);
            }
        };
        check();
    });
}

function hideSplash() {
    const splash = document.getElementById(SPLASH_EL_ID);
    if (!splash) return;
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 400);
}

/**
 * Gestionnaire de clic centralisé pour un média (poster, carte, etc.),
 * utilisé par les widgets du Dashboard (Continue Watching, Derniers Ajouts).
 *
 * Avant : ces widgets appelaient window.Emby.Page.showItem() (API interne
 * de Jellyfin Web, absente en standalone) puis retombaient sur
 * window.location.hash = '#/details?id=...', que rien n'écoutait — donc
 * cliquer sur un poster du dashboard ne faisait littéralement rien.
 */
function openMediaItem(item) {
    if (!item) return;
    const playableTypes = ['Movie', 'Episode', 'Video'];
    if (playableTypes.includes(item.Type)) {
        window.SpaceHub?.player?.play(item);
    } else {
        // Série, album, etc. : pas encore de vue détail dédiée depuis le
        // dashboard — on renvoie vers la Bibliothèque plutôt que de ne rien faire.
        window.SpaceHub?.router?.navigate('/library');
    }
}

function mountApp() {
    const appEl = document.getElementById(APP_EL_ID);
    if (!appEl) {
        console.error('[SpaceHub] Élément #app introuvable dans index.html.');
        return;
    }
    const layout = new AppLayout();

    // Exposés pour que les widgets (Dashboard) et vues puissent naviguer /
    // ouvrir un média sans dupliquer cette logique partout.
    window.SpaceHub.ui.appLayout = layout;
    window.SpaceHub.openItem = openMediaItem;

    layout.render(appEl);
}

function mountLogin() {
    const appEl = document.getElementById(APP_EL_ID);
    if (!appEl) {
        console.error('[SpaceHub] Élément #app introuvable dans index.html.');
        return;
    }
    const login = new LoginView(() => {
        // Connexion réussie : bascule les réglages sur l'utilisateur
        const userId = window.SpaceHub.auth.getUserId();
        window.SpaceHub.core.settings.setUserId(userId);

        // Enregistrer automatiquement le serveur dans ServerManager
        window.SpaceHub.serverManager?.addServer({
            name: new URL(window.SpaceHub.auth.getServerUrl()).hostname,
            url: window.SpaceHub.auth.getServerUrl(),
            username: window.SpaceHub.auth.getUser()?.Name,
            userId: userId,
            token: window.SpaceHub.auth.getToken()
        });

        // On remonte l'app complète
        mountApp();
    });
    login.render(appEl);
}

async function boot() {
    // 1. Laisser le Core finir son init (voir core/SpaceHub.js)
    await waitForCore();

    if (!window.SpaceHub) {
        console.error('[SpaceHub] Le Core ne s\'est pas initialisé — abandon du démarrage.');
        hideSplash();
        return;
    }

    // 2. Brancher l'AuthManager standalone
    const auth = new AuthManager();
    window.SpaceHub.auth = auth;

    // 2bis. Brancher Multi-Server, Sync, et Recherche Fédérée
    const serverManager = new ServerManager(window.SpaceHub.core?.eventBus, auth);
    window.SpaceHub.serverManager = serverManager;
    window.SpaceHub.federatedSearch = new FederatedSearch(serverManager);
    window.SpaceHub.core.sync = new DataSyncService(window.SpaceHub.core?.eventBus, window.SpaceHub.core?.settings);

    // 2bis+. Brancher Trailers & Recherche en Langage Naturel (Horizon 4)
    window.SpaceHub.trailerService = new TrailerService();
    window.SpaceHub.naturalSearch = new NaturalSearchEngine();

    // 2bis++. Brancher Jellyfin SyncPlay / Watch Party (Horizon 5)
    window.SpaceHub.syncPlay = new SyncPlayManager(window.SpaceHub.core?.eventBus);

    // 2bis+++. Brancher Cockpit Admin Suite (Horizon 7)
    window.SpaceHub.admin = {
        monitor: new LiveStreamMonitor(),
        tasks: new ServerTaskController(),
        storage: new StorageInspector()
    };

    // 2bis++++. Brancher Mode Hors-Ligne & Téléchargements (Horizon 9)
    window.SpaceHub.offline = new OfflineDownloadManager(window.SpaceHub.core?.eventBus);
    window.SpaceHub.offlineSync = new OfflineSyncReconnector(window.SpaceHub.core?.eventBus);

    // 2bis+++++. Brancher Live TV & DVR (Horizon 10)
    window.SpaceHub.livetv = new LiveTvService();

    // 2bis++++++. Brancher Domotique Cinéma & Ambilight (Horizon 14)
    const haService = new HomeAssistantService();
    const ambilight = new AmbilightEngine();
    ambilight.attachHomeAssistant(haService);
    const cinemaMode = new CinemaModeService();
    cinemaMode.attach(haService, ambilight);

    window.SpaceHub.domotics = {
        ha: haService,
        ambilight: ambilight,
        cinema: cinemaMode
    };

    // 2bis+++++++. Brancher Accessibilité Universelle (Horizon 15)
    window.SpaceHub.accessibility = new AccessibilityManager();

    // 2bis++++++++. Brancher SpaceHub Rewind (Horizon 16)
    window.SpaceHub.rewind = new RewindService();

    // 2bis+++++++++. Brancher Hyper-Performance Engines (Horizon 6++)
    window.SpaceHub.perf = {
        workers: new WorkerThreadPool(),
        cache: new MultiTierCache(),
        networkGuardian: new NetworkQualityGuardian()
    };

    // 2bis++++++++++. Brancher Pro Theme Studio & Custom CSS (Horizon 8++)
    window.SpaceHub.themePro = new ProCodeThemeEditor();
    const savedCustomCSS = localStorage.getItem('sh_custom_css');
    if (savedCustomCSS) {
        window.SpaceHub.themePro.applyCSS(savedCustomCSS);
    }

    // 2ter. Brancher les lecteurs
    window.SpaceHub.player = new VideoPlayer();
    window.SpaceHub.audio = new AudioPlayer();

    // 2quater. Initialiser le mode TV si présent
    if (window.SpaceHub?.tvMode && window.SpaceHub.core?.settings?.get('tv.autoActivate')) {
        window.SpaceHub.tvMode.enable();
    }

    // 2quinquies. Intégration Native Desktop (Electron Shortcuts & Discord RPC)
    setupElectronIntegration();

    // 3. Vérifier la session existante
    const authenticated = await auth.init();

    if (authenticated) {
        window.SpaceHub.core.settings.setUserId(auth.getUserId());
    }

    hideSplash();

    // Lancer l'Intro Cinématique Style Netflix (Horizon 17)
    const introEngine = new CinematicIntroEngine();
    await introEngine.play();

    // 4. Router simple : login ou app
    if (authenticated) {
        mountApp();
    } else {
        mountLogin();
    }
}

function setupElectronIntegration() {
    if (!window.electronAPI) return;

    window.electronAPI.onMediaCommand((cmd) => {
        if (cmd === 'toggle') {
            if (window.SpaceHub?.audio) window.SpaceHub.audio.toggle();
        } else if (cmd === 'next') {
            if (window.SpaceHub?.audio) window.SpaceHub.audio.next();
        } else if (cmd === 'prev') {
            if (window.SpaceHub?.audio) window.SpaceHub.audio.previous();
        } else if (cmd === 'stop') {
            window.SpaceHub?.audio?.stop?.();
            window.SpaceHub?.player?.close?.();
        }
    });

    const eb = window.SpaceHub?.core?.eventBus;
    if (eb) {
        eb.on('player:played', (item) => {
            window.electronAPI.updateDiscordPresence({
                details: item?.Name || 'Vidéo',
                state: item?.SeriesName ? `${item.SeriesName} - S${item.ParentIndexNumber || 1}E${item.IndexNumber || 1}` : 'Regarde un film',
                largeImageKey: 'spacehub_logo',
                largeImageText: 'SpaceHub'
            });
        });

        eb.on('player:stopped', () => {
            window.electronAPI.updateDiscordPresence({
                details: 'Parcourt sa médiathèque',
                state: 'SpaceHub Media Center',
                largeImageKey: 'spacehub_logo'
            });
        });

        eb.on('audio:changed', (state) => {
            window.electronAPI.updateDiscordPresence({
                details: state.item?.Name || 'Musique',
                state: `Écoute ${state.item?.Artists?.join(', ') || 'un album'}`,
                largeImageKey: 'spacehub_logo',
                largeImageText: 'SpaceHub Audio'
            });
        });
    }
}

boot().catch((err) => {
    console.error('[SpaceHub] Erreur fatale au démarrage :', err);
    hideSplash();
    const appEl = document.getElementById(APP_EL_ID);
    if (appEl) {
        appEl.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:#ff5c7a;font-family:sans-serif;text-align:center;padding:24px;">
                <div>
                    <h2>Erreur de démarrage de SpaceHub</h2>
                    <p>${(err && err.message) || 'Erreur inconnue'}</p>
                </div>
            </div>
        `;
    }
});
