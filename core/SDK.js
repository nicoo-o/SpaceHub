/**
 * SpaceHub — Extension SDK v2
 * API publique contrôlée pour les extensions client.
 */
'use strict';

import Logger from './Logger.js';

import * as svc from './services.js';
class SpaceHubSDK {
    constructor() {
        this._log = new Logger('SDK');
    }

    _getPluginManager() {
        return svc.plugins() || svc.pluginManager() || null;
    }

    _getPluginId(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') throw new TypeError('pluginId requis.');
        return pluginId;
    }

    async registerPlugin(manifest) {
        const pm = this._getPluginManager();
        if (!pm) return false;
        return pm.registerPlugin(manifest);
    }

    getPlugins() { return this._getPluginManager()?.getPlugins() || []; }

    async enablePlugin(id) {
        const pm = this._getPluginManager();
        return pm ? pm.enablePlugin(id) : false;
    }

    async disablePlugin(id) {
        const pm = this._getPluginManager();
        return pm ? pm.disablePlugin(id) : false;
    }

    async unloadPlugin(id) {
        const pm = this._getPluginManager();
        return pm ? pm.unloadPlugin(id) : false;
    }

    async reloadPlugin(id) {
        const pm = this._getPluginManager();
        return pm ? pm.reloadPlugin(id) : false;
    }

    async checkPluginHealth(id) {
        const pm = this._getPluginManager();
        return pm ? pm.checkHealth(id) : { status: 'unknown', checkedAt: null, error: 'PluginManager indisponible' };
    }

    approvePluginPermissions(id, permissions) {
        const pm = this._getPluginManager();
        return pm?.approvePermissions(this._getPluginId(id), permissions) || [];
    }

    getPluginPermissionPolicy(id) {
        const pm = this._getPluginManager();
        return pm?.getPermissionPolicy(this._getPluginId(id)) || null;
    }

    registerContribution(pluginId, type, contribution) {
        const pm = this._getPluginManager();
        if (!pm) return () => {};
        return pm.registerContribution(this._getPluginId(pluginId), type, contribution);
    }

    getContributions(type = null) { return this._getPluginManager()?.getContributions(type) || []; }

    registerWidget(id, WidgetClass) {
        if (!svc.dashboard() || typeof WidgetClass !== 'function') {
            this._log.error('Dashboard ou classe de widget indisponible.');
            return false;
        }
        svc.dashboard().registerWidget(id, WidgetClass);
        return true;
    }

    registerTheme(theme) {
        const manager = svc.themes();
        if (!manager || typeof manager.register !== 'function') return false;
        return manager.register(theme);
    }

    applyTheme(themeId) {
        return svc.themes()?.apply?.(themeId) || false;
    }

    registerModule(moduleConfig) {
        const manager = svc.moduleManager();
        if (!manager || typeof manager.register !== 'function') return false;
        manager.register(moduleConfig);
        return true;
    }

    registerMetadataProvider(provider) {
        return svc.metadata()?.registerProvider?.(provider) || (() => {});
    }

    getMetadata(itemId, options = {}) { return svc.metadata()?.get?.(itemId, options); }
    getMetadataPolicy(libraryId) { return svc.metadata()?.getPolicy?.(libraryId); }
    setMetadataPolicy(libraryId, policy) { return svc.metadata()?.setPolicy?.(libraryId, policy); }

    getServerCapabilities() {
        return svc.jellyfinPlugins()?.detectCapabilities?.() || null;
    }

    on(event, callback) { return svc.eventBus()?.on(event, callback); }
    once(event, callback) { return svc.eventBus()?.once(event, callback); }
    emit(event, data) { return svc.eventBus()?.emit(event, data); }

    showToast(message, type = 'info', options = {}) {
        const toaster = svc.toaster();
        return toaster?.show?.(message, type, options) || toaster?.toast?.(message, type);
    }

    openModal(options) {
        const Modal = svc.modalClass();
        if (!Modal) return null;
        const modal = new Modal(options);
        modal.open();
        return modal;
    }

    getSetting(key, fallback = null) { return svc.settings()?.get?.(key, fallback); }
    setSetting(key, value) { return svc.settings()?.set?.(key, value); }

    getPluginStorage(pluginId) {
        return this._getPluginManager()?.getPluginStorage?.(this._getPluginId(pluginId)) || null;
    }

    getCatalog({ approvedOnly = false } = {}) {
        return svc.pluginCatalog()?.list?.({ approvedOnly }) || [];
    }

    approveCatalogPlugin(id, permissions) { return svc.pluginCatalog()?.approve?.(id, permissions) || false; }
    revokeCatalogPlugin(id, reason) { return svc.pluginCatalog()?.revoke?.(id, reason) || false; }
    async loadCatalog(url) {
        const catalog = svc.pluginCatalog();
        if (!catalog?.load) return [];
        return catalog.load(url);
    }

    async installCatalogPlugin(id, options = {}) {
        const catalog = svc.pluginCatalog();
        return catalog?.install?.(id, { ...options, pluginManager: this._getPluginManager() }) || false;
    }

    async updateCatalogPlugin(id, options = {}) {
        const catalog = svc.pluginCatalog();
        return catalog?.update?.(id, { ...options, pluginManager: this._getPluginManager() }) || false;
    }

    async rollbackCatalogPlugin(id, options = {}) {
        const catalog = svc.pluginCatalog();
        return catalog?.rollback?.(id, { ...options, pluginManager: this._getPluginManager() }) || false;
    }

    async uninstallCatalogPlugin(id) {
        const catalog = svc.pluginCatalog();
        return catalog?.uninstall?.(id, { pluginManager: this._getPluginManager() }) || false;
    }

    getCatalogStatus(id) { return svc.pluginCatalog()?.getStatus?.(id) || null; }
    getCatalogHistory(id) { return svc.pluginCatalog()?.getHistory?.(id) || []; }
    async downloadCatalogPlugin(id, options = {}) { return svc.pluginCatalog()?.fetchPackage?.(id, options); }
}

export default SpaceHubSDK;
