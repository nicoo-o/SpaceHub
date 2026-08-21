/**
 * SpaceHub — Extension SDK
 * Version: 1.0.0
 *
 * Kit de développement (SDK) officiel pour créer des modules, widgets,
 * intégrations et thèmes tiers pour SpaceHub.
 *
 * Usage:
 *   SpaceHub.sdk.registerWidget('my-widget', MyCustomWidgetClass);
 *   SpaceHub.sdk.registerTheme({ id: 'my-theme', name: 'Mon Thème', emoji: '🌟', variables: { ... } });
 *   SpaceHub.sdk.on('sonarr:seriesAdded', (data) => { ... });
 */

'use strict';

import Logger from './Logger.js';

class SpaceHubSDK {
    constructor() {
        this._log = new Logger('SDK');
    }

    // ─── Widgets ─────────────────────────────────────────────────────────────

    /**
     * Enregistre un widget personnalisé pour le tableau de bord SpaceHub.
     * @param {string} id
     * @param {typeof Object} WidgetClass
     */
    registerWidget(id, WidgetClass) {
        if (!window.SpaceHub?.ui?.dashboard) {
            this._log.error('Dashboard non disponible.');
            return;
        }
        window.SpaceHub.ui.dashboard.registerWidget(id, WidgetClass);
        this._log.info(`Widget tiers enregistré : "${id}"`);
    }

    // ─── Thèmes ───────────────────────────────────────────────────────────────

    /**
     * Enregistre un thème personnalisé.
     * @param {{ id: string, name: string, emoji?: string, variables: Record<string,string> }} theme
     */
    registerTheme(theme) {
        if (!theme.id || !theme.variables) {
            this._log.error('Un thème doit avoir un id et un objet variables.');
            return;
        }
        window.SpaceHub?.ui?.themes?.apply(theme.id);
        this._log.info(`Thème tiers enregistré : "${theme.name || theme.id}"`);
    }

    // ─── Modules & Intégrations ───────────────────────────────────────────────

    /**
     * Enregistre un module d'intégration externe.
     * @param {Object} moduleConfig
     */
    registerModule(moduleConfig) {
        window.SpaceHub?.core?.moduleManager?.register(moduleConfig);
    }

    // ─── Événements (Pub/Sub) ─────────────────────────────────────────────────

    on(event, callback) {
        return window.SpaceHub?.core?.eventBus?.on(event, callback);
    }

    once(event, callback) {
        return window.SpaceHub?.core?.eventBus?.once(event, callback);
    }

    emit(event, data) {
        window.SpaceHub?.core?.eventBus?.emit(event, data);
    }

    // ─── UI & Composants ──────────────────────────────────────────────────────

    showToast(message, type = 'info', options = {}) {
        return window.SpaceHub?.ui?.components?.toaster?.show(message, type, options);
    }

    openModal(options) {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return null;
        const modal = new Modal(options);
        modal.open();
        return modal;
    }

    // ─── Paramètres & Données ─────────────────────────────────────────────────

    getSetting(key, fallback = null) {
        return window.SpaceHub?.core?.settings?.get(key, fallback);
    }

    setSetting(key, value) {
        window.SpaceHub?.core?.settings?.set(key, value);
    }

    get cache() {
        return window.SpaceHub?.core?.cache;
    }

    get api() {
        return window.SpaceHub?.core?.api;
    }
}

export default SpaceHubSDK;
