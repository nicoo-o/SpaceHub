/**
 * SpaceHub — Extension SDK
 * Version: 1.0.0
 *
 * Kit de développement (SDK) officiel pour créer des modules, widgets,
 * plugins de cycle de vie et thèmes tiers pour SpaceHub.
 */

'use strict';

import Logger from './Logger.js';

class SpaceHubSDK {
    constructor() {
        this._log = new Logger('SDK');
    }

    _getPluginManager() {
        return window.SpaceHub?.plugins || window.SpaceHub?.core?.pluginManager || this._pm;
    }

    // ─── Plugins & Cycle de Vie ───────────────────────────────────────────────

    /**
     * Enregistre un plugin SDK avec cycle de vie (onLoad, onEnable, onDisable, onUnload).
     * @param {Object} pluginManifest
     */
    registerPlugin(pluginManifest) {
        const pm = this._getPluginManager();
        if (!pm) {
            this._log.error('PluginManager non initialisé.');
            return false;
        }
        return pm.registerPlugin(pluginManifest);
    }

    /**
     * Retourne tous les plugins SDK installés.
     * @returns {Array<Object>}
     */
    getPlugins() {
        const pm = this._getPluginManager();
        return pm?.getPlugins() || [];
    }

    /**
     * Active un plugin SDK par son identifiant.
     * @param {string} id
     */
    async enablePlugin(id) {
        const pm = this._getPluginManager();
        return await pm?.enablePlugin(id);
    }

    /**
     * Désactive un plugin SDK par son identifiant.
     * @param {string} id
     */
    async disablePlugin(id) {
        const pm = this._getPluginManager();
        return await pm?.disablePlugin(id);
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
     * Enregistre et applique un thème personnalisé.
     * @param {{ id: string, name: string, icon?: string, emoji?: string, variables: Record<string,string> }} theme
     */
    registerTheme(theme) {
        if (!theme || !theme.id || !theme.variables) {
            this._log.error('Un thème doit avoir un id et un objet variables.');
            return;
        }
        
        const tm = window.SpaceHub?.ui?.themes;
        if (tm && typeof tm.register === 'function') {
            tm.register(theme);
        }
        tm?.apply(theme.id);
        this._log.info(`Thème tiers enregistré et appliqué : "${theme.name || theme.id}"`);
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
}

export default SpaceHubSDK;
