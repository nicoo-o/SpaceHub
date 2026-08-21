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
        window.SpaceHub?.ui?.appLayout?.navigate('library');
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
        // Connexion réussie : on remonte l'app complète
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

    // 2. Brancher l'AuthManager standalone (absent du namespace par défaut)
    const auth = new AuthManager();
    window.SpaceHub.auth = auth;

    // 2bis. Brancher le lecteur vidéo — jellyfin/player/VideoPlayer.js existait déjà
    // (HLS, reprise de lecture, rapport de progression complets) mais n'était
    // instancié nulle part. LibraryView.js appelle window.SpaceHub.player.play(item),
    // qui ne faisait donc jamais rien (échec silencieux via l'optional chaining).
    window.SpaceHub.player = new VideoPlayer();

    // 3. Vérifier la session existante (et resynchroniser le JellyfinClient si valide)
    const authenticated = await auth.init();

    hideSplash();

    // 4. Router simple : login ou app
    if (authenticated) {
        mountApp();
    } else {
        mountLogin();
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
