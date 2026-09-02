/**
 * SpaceHub — Unified Router
 * Version: 1.0.0
 *
 * Routeur centralisé pour la navigation entre les vues principales,
 * les panneaux modaux, la gestion de l'historique et les raccourcis clavier.
 */

'use strict';

import Logger from './Logger.js';

import * as svc from './services.js';
export class Router {
    /**
     * @param {Object} [options]
     * @param {import('./EventBus.js').default} [options.eventBus]
     */
    constructor({ eventBus = null } = {}) {
        this._log = new Logger('Router');
        this._eventBus = eventBus;
        this._routes = new Map();
        this._currentRoute = 'dashboard';
        this._history = [];
        this._keydownHandler = null;

        this._setupKeyboardNavigation();
        this._log.info('Router centralisé initialisé.');
    }

    /**
     * Enregistre une route de vue.
     * @param {string} name
     * @param {{ render?: Function, open?: Function, close?: Function }} handler
     */
    registerRoute(name, handler) {
        this._routes.set(name, handler);
        this._log.debug(`Route enregistrée : "${name}"`);
    }

    /**
     * Navigue vers une vue donnée.
     * @param {string} routeName
     * @param {Object} [params={}]
     */
    async navigate(routeName, params = {}) {
        const from = this._currentRoute;

        if (!this._routes.has(routeName) && routeName !== 'dashboard') {
            this._log.warn(`Route inconnue : "${routeName}". Redirection vers "dashboard".`);
            routeName = 'dashboard';
        }
        const target = this._routes.get(routeName);

        const prevHandler = this._routes.get(from);
        if (prevHandler && typeof prevHandler.close === 'function') {
            try { await prevHandler.close(); } catch (e) { /* ignore */ }
        }

        this._currentRoute = routeName;
        if (this._history.length >= 100) {
            this._history.shift(); // retire l'entrée la plus ancienne
        }
        this._history.push({ route: routeName, params, timestamp: Date.now() });

        if (target) {
            try {
                if (typeof target.render === 'function') await target.render(params);
                else if (typeof target.open === 'function') await target.open(params);
            } catch (err) {
                this._log.error(`Erreur lors du rendu de la route "${routeName}":`, err);
            }
        }

        this._eventBus?.emit('route:changed', { from, to: routeName, params });
        this._log.info(`Navigation : ${from} ➔ ${routeName}`);
    }

    /**
     * Retourne la route actuelle.
     * @returns {string}
     */
    getCurrentRoute() {
        return this._currentRoute;
    }

    _setupKeyboardNavigation() {
        if (typeof window === 'undefined') return;

        this._keydownHandler = (e) => {
            // Ignorer si l'utilisateur saisit dans un champ de formulaire
            const activeEl = document.activeElement;
            const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
            if (isInput && e.key !== 'Escape') return;

            // Ctrl + Alt + A : Panneau d'administration
            if (e.ctrlKey && e.altKey && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                svc.adminDashboard()?.open?.();
                return;
            }

            // Ctrl + K : Command Center / Recherche
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                const searchEnabled = svc.settings()?.get('jellyfin.search.enabled', true);
                if (searchEnabled) {
                    e.preventDefault();
                    svc.search()?.open?.();
                }
                return;
            }

            // Escape est désormais géré exclusivement par SpatialNavigation._handleBack()
            // (retrait de la ligne "navigation:back" — aucun abonné actif, doublon supprimé cf. plan A05).
        };
        window.addEventListener('keydown', this._keydownHandler);
    }

    destroy() {
        if (this._keydownHandler) {
            window.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
        this._routes.clear();
        this._history = [];
        this._log.info('Router détruit.');
    }
}

export default Router;
