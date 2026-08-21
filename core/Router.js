/**
 * SpaceHub — Router
 * Version: 1.0.0
 *
 * Routeur interne léger pour l'app standalone. Basé sur le hash (#/downloads,
 * #/management/sonarr, ...) plutôt que sur l'History API : ça fonctionne
 * partout sans configuration serveur particulière (contrairement à un routeur
 * "propre" qui exigerait un fallback vers index.html pour chaque route côté
 * serveur — pas encore en place pour SpaceHub en production).
 *
 * Supporte les routes imbriquées simples : une route enregistrée sur
 * '/management' recevra aussi les hash du type '#/management/sonarr', avec
 * 'sonarr' passé en paramètre au handler.
 */

'use strict';

class Router {
    constructor() {
        this._routes = new Map();   // path -> (subpath) => void
        this._notFoundHandler = null;
        this._current = null;

        window.addEventListener('hashchange', () => this._handleChange());
    }

    /**
     * Enregistre une route.
     * @param {string} path - ex: '/downloads', '/management'
     * @param {(subpath: string|null) => void} handler
     */
    register(path, handler) {
        this._routes.set(path, handler);
        return this;
    }

    setNotFound(handler) {
        this._notFoundHandler = handler;
        return this;
    }

    /**
     * Démarre le routeur. Si aucun hash n'est présent, redirige vers defaultPath.
     */
    start(defaultPath = '/') {
        if (!window.location.hash) {
            window.location.hash = `#${defaultPath}`;
        } else {
            this._handleChange();
        }
    }

    /**
     * Navigue vers un chemin donné.
     * @param {string} path - ex: '/management/radarr'
     */
    navigate(path) {
        const target = `#${path}`;
        if (window.location.hash === target) {
            // Même route : on force quand même le re-rendu (utile pour un
            // rafraîchissement manuel d'une vue déjà affichée).
            this._handleChange();
        } else {
            window.location.hash = target;
        }
    }

    get currentPath() {
        return this._current;
    }

    _handleChange() {
        const hash = (window.location.hash || '#/').replace(/^#/, '') || '/';
        this._current = hash;

        // Correspondance exacte d'abord
        if (this._routes.has(hash)) {
            this._routes.get(hash)(null);
            return;
        }

        // Puis correspondance par préfixe pour les routes imbriquées
        // (ex: '/management/sonarr' → route '/management' avec subpath 'sonarr')
        for (const routePath of this._routes.keys()) {
            if (routePath !== '/' && hash.startsWith(`${routePath}/`)) {
                const subpath = hash.slice(routePath.length + 1);
                this._routes.get(routePath)(subpath || null);
                return;
            }
        }

        if (this._notFoundHandler) {
            this._notFoundHandler(hash);
        }

        // Émettre un événement global pour l'analytics
        window.SpaceHub?.core?.eventBus?.emit('router:navigated', hash);
    }
}

export default Router;
