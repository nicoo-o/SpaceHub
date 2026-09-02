/**
 * SpaceHub — Accès aux services
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'application accédait à ses services par 690 expressions de la forme
 * `window.SpaceHub?.ui?.components?.toaster?.success?.(…)`. Chaque `?.` masque
 * une dépendance non déclarée qui échoue en silence : si le service manque, il
 * ne se passe rien, et rien ne le dit.
 *
 * Ce module remplace ces chaînes par des fonctions nommées. Le gain n'est pas
 * cosmétique :
 *
 *   - **un seul endroit sait où vit chaque service.** Déplacer `toaster` de
 *     `ui.components` vers ailleurs devient une ligne à changer, pas 60 ;
 *   - **la liste des dépendances devient lisible.** Les imports en haut d'un
 *     fichier disent ce dont il a besoin ; une chaîne `window.…` ne dit rien ;
 *   - **le diagnostic devient possible.** `manquants()` dit, à tout moment,
 *     quels services attendus ne sont pas là.
 *
 * Deux principes de sûreté, qui expliquent la forme du code :
 *
 *   1. **Aucun changement de comportement.** Chaque accesseur renvoie `null`
 *      quand le service est absent, exactement comme le `?.` qu'il remplace.
 *      La migration ne pouvait pas se permettre de transformer un échec
 *      silencieux en exception : cela aurait changé le comportement de
 *      centaines d'endroits d'un coup, sans moyen de tout vérifier.
 *   2. **Aucune importation de SpaceHub.js.** La résolution se fait à l'appel,
 *      via le registre puis la façade globale. Importer l'entrée principale
 *      depuis un module qu'elle importe elle-même créerait un cycle.
 *
 * Pour un échec BRUYANT quand une dépendance manque — ce qui est souhaitable
 * dans du code neuf — utilisez directement le registre :
 *
 *     SpaceHub.services.resolve('jellyfin.api')   // lève avec la liste
 */

'use strict';

/** Racine globale, ou un objet vide hors navigateur (tests Node). */
function racine() {
    return (typeof window !== 'undefined' && window.SpaceHub) || {};
}

/**
 * Résout un service : le registre d'abord, la façade historique ensuite.
 *
 * Le repli n'est pas de la timidité. Certains objets ne sont pas encore
 * enregistrés (ils sont posés directement sur le namespace), et l'ordre
 * d'initialisation fait qu'un accesseur peut être appelé avant que le service
 * correspondant existe. Le repli garantit que la migration ne casse rien.
 *
 * @param {string} nomRegistre  clé dans le ServiceRegistry
 * @param {string[]} chemin     chemin dans window.SpaceHub, en repli
 */
function resoudre(nomRegistre, chemin) {
    const sh = racine();
    const registre = sh.services;
    if (registre?.has?.(nomRegistre)) {
        const v = registre.optional(nomRegistre);
        if (v != null) return v;
    }
    let courant = sh;
    for (const segment of chemin) {
        if (courant == null) return null;
        courant = courant[segment];
    }
    return courant ?? null;
}

const definir = (nomRegistre, ...chemin) => () => resoudre(nomRegistre, chemin);

// ─── Socle ───────────────────────────────────────────────────────────────────
export const settings      = definir('settings', 'core', 'settings');
export const eventBus      = definir('eventBus', 'core', 'eventBus');
export const cache         = definir('cache', 'core', 'cache');
export const api           = definir('api', 'core', 'api');
export const router        = definir('router', 'core', 'router');
export const logger        = definir('logger', 'core', 'log');
export const errors        = definir('errors', 'core', 'errors');
export const features      = definir('features', 'core', 'features');
export const parental      = definir('parental', 'core', 'parental');
export const ratingCache   = definir('cache.ratings', 'core', 'ratingCache');
export const tvMode        = definir('tvMode', 'core', 'tvMode');
export const notifications = definir('notifications', 'core', 'notifications');
export const moduleManager = definir('moduleManager', 'core', 'moduleManager');
export const pluginManager = definir('pluginManager', 'core', 'pluginManager');
export const pluginCatalog = definir('pluginCatalog', 'core', 'pluginCatalog');
export const policy        = definir('policy', 'core', 'policy');
export const sdk           = definir('sdk', 'sdk');
export const plugins       = definir('pluginManager', 'plugins');

// ─── Navigation & entrées ────────────────────────────────────────────────────
export const nav           = definir('nav.spatial', 'core', 'spatialNavigation');
export const inputRouter   = definir('input.router', 'core', 'inputRouter');
export const gamepad       = definir('input.gamepad', 'core', 'gamepad');
export const audioFeedback = definir('input.audioFeedback', 'core', 'audioFeedback');
export const touchEngine   = definir('input.touch', 'core', 'touchEngine');

// ─── Interface ───────────────────────────────────────────────────────────────
export const toaster       = definir('ui.toaster', 'ui', 'components', 'toaster');
export const cardBuilder   = definir('ui.cardBuilder', 'ui', 'components', 'cardBuilder');
export const themes        = definir('ui.themes', 'ui', 'themes');
export const settingsPanel = definir('ui.settingsPanel', 'ui', 'settingsPanel');
export const slideUpSheet  = definir('ui.slideUpSheet', 'ui', 'modalSlideUpSheet');
export const appLayout     = definir('ui.appLayout', 'ui', 'appLayout');
export const dashboard     = definir('ui.dashboard', 'ui', 'dashboard');
export const sidebar       = definir('ui.sidebar', 'ui', 'sidebarDrawer');
export const gooeyScroller = definir('ui.gooeyScroller', 'ui', 'gooeyScroller');
export const onboarding    = definir('ui.onboarding', 'ui', 'onboarding');
export const adminDashboard = definir('ui.adminDashboard', 'ui', 'adminDashboard');
export const jellyfinConsole = definir('ui.jellyfinConsole', 'ui', 'jellyfinConsole');
export const trailers      = definir('ui.trailers', 'trailers');
export const userDropdown  = definir('ui.userDropdown', 'ui', 'userDropdown');

/** Le registre lui-même — pour enregistrer un service depuis un composant. */
export function registry() {
    return racine().services ?? null;
}

/** La CLASSE Modal, pas une instance : les composants l'instancient eux-mêmes. */
export function modalClass() {
    return racine()?.ui?.components?.Modal ?? null;
}

/** Racine de configuration injectée par l'hôte (window.SpaceHubConfig ou .config). */
export function config() {
    const sh = racine();
    return (typeof window !== 'undefined' && window.SpaceHubConfig) || sh.config || {};
}

// ─── Jellyfin ────────────────────────────────────────────────────────────────
export const auth          = definir('auth', 'auth');
export const jellyfinApi   = definir('jellyfin.api', 'jellyfin', 'api');
export const jellyfinPlugins = definir('jellyfin.plugins', 'jellyfin', 'plugins');
export const metadata      = definir('jellyfin.metadata', 'metadata');
export const search        = definir('jellyfin.search', 'jellyfin', 'search');
export const collections   = definir('jellyfin.collections', 'jellyfin', 'collections');
export const remote        = definir('jellyfin.remote', 'jellyfin', 'remote');
export const player        = definir('player', 'player');
export const queue         = definir('player.queue', 'player', 'queue');

// ─── Hors-ligne ──────────────────────────────────────────────────────────────
export const offlineStore  = definir('offline.store', 'offline', 'store');
export const downloads     = definir('offline.downloads', 'offline', 'downloads');

// ─── Intégrations ────────────────────────────────────────────────────────────
/** @param {'sonarr'|'radarr'|'prowlarr'|'bazarr'|'jellyseerr'|'qbittorrent'} nom */
export function integration(nom) {
    return resoudre(`integrations.${nom}`, ['integrations', nom]);
}

/** Client d'un service donné, via ApiClient. */
export function client(nom) {
    return api()?.getClient?.(nom) ?? null;
}

/**
 * Services attendus mais absents, à un instant donné.
 * Utile en console pour diagnostiquer un démarrage incomplet, plutôt que de
 * chercher lequel des `?.` d'une chaîne a court-circuité.
 */
export function manquants() {
    const attendus = {
        settings, eventBus, cache, api, router, nav, toaster, cardBuilder,
        themes, auth, jellyfinApi, metadata, player, sdk,
    };
    return Object.entries(attendus).filter(([, f]) => f() == null).map(([n]) => n);
}

export default {
    settings, eventBus, cache, api, router, logger, errors, features, parental,
    ratingCache, tvMode, notifications, moduleManager, pluginManager,
    pluginCatalog, policy, sdk, nav, gamepad, audioFeedback, touchEngine,
    toaster, cardBuilder, themes, settingsPanel, slideUpSheet, appLayout,
    dashboard, sidebar, gooeyScroller, onboarding, adminDashboard,
    jellyfinConsole, trailers, auth, jellyfinApi, jellyfinPlugins, metadata,
    search, collections, remote, player, queue, integration, client, manquants,
    modalClass, config, plugins, userDropdown, registry, offlineStore, downloads,
};
