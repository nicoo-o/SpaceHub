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

    /**
     * Applique un thème.
     *
     * Le `|| false` rapportait un ÉCHEC quand `apply()` réussissait sans rien
     * renvoyer : toute valeur non vériteuse — `undefined`, `null`, `0` —
     * devenait `false`. C'est l'inverse d'un mensonge, mais c'est faux
     * pareil : un plugin qui teste ce retour affiche une erreur alors que le
     * thème est appliqué à l'écran. On distingue « le gestionnaire est
     * absent » de « le gestionnaire n'a rien dit ».
     *
     * @param {string} themeId
     * @returns {boolean} vrai si le thème a été appliqué.
     */
    applyTheme(themeId) {
        const manager = svc.themes();
        if (typeof manager?.apply !== 'function') return false;
        const resultat = manager.apply(themeId);
        // `apply()` renvoie `false` quand le thème est introuvable, et `true`
        // en cas de succès. Une version qui ne renverrait rien est traitée
        // comme un succès : elle n'a pas signalé d'échec.
        return resultat !== false;
    }

    /**
     * Enregistre un module auprès du ModuleManager.
     *
     * Cette fonction renvoyait `true` sans jamais consulter le retour de
     * `register()`. Or celui-ci refuse deux cas — identifiant manquant,
     * module déjà enregistré — en sortant silencieusement. Le plugin
     * recevait donc une confirmation pour un enregistrement qui n'avait pas
     * eu lieu, et découvrait le problème beaucoup plus tard, ailleurs.
     *
     * @param {Object} moduleConfig
     * @returns {boolean} le résultat réel de l'enregistrement.
     */
    registerModule(moduleConfig) {
        const manager = svc.moduleManager();
        if (!manager || typeof manager.register !== 'function') return false;
        return manager.register(moduleConfig) === true;
    }

    /**
     * Enregistre un fournisseur de métadonnées.
     *
     * Le `|| (() => {})` rendait une fonction de désabonnement vide quand le
     * service de métadonnées était absent. Du point de vue du plugin, tout
     * s'était bien passé : il avait « un désabonnement », donc son
     * enregistrement avait « réussi ». Il découvrait le contraire plus tard,
     * en constatant que ses métadonnées n'apparaissaient jamais — sans aucun
     * moyen de relier les deux.
     *
     * @param {Object} provider
     * @returns {(() => void)|null} Le désabonnement, ou `null` si
     *   l'enregistrement n'a PAS eu lieu.
     */
    registerMetadataProvider(provider) {
        const metadata = svc.metadata();
        if (typeof metadata?.registerProvider !== 'function') {
            this._log?.warn?.('Service de métadonnées indisponible : fournisseur NON enregistré.');
            return null;
        }
        const desabonner = metadata.registerProvider(provider);
        return typeof desabonner === 'function' ? desabonner : null;
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

    /**
     * Espace de configuration d'un plugin.
     *
     * `PluginManager.getPluginStorage` LÈVE quand le plugin n'est pas
     * enregistré (`_get` lance « Plugin introuvable »). Le chaînage optionnel
     * ne protège pas d'une exception levée À L'INTÉRIEUR de la fonction : il
     * ne couvre que son absence. Or cet accesseur est appelé depuis un
     * littéral de gabarit du panneau de réglages — une exception y interrompt
     * la construction de la chaîne HTML, et c'est tout l'écran des réglages
     * qui disparaît parce qu'un plugin n'est pas chargé.
     *
     * @param {string} [pluginId]
     * @returns {Object|null} L'espace de stockage, ou `null` s'il n'existe pas.
     */
    getPluginStorage(pluginId) {
        try {
            return this._getPluginManager()?.getPluginStorage?.(this._getPluginId(pluginId)) || null;
        } catch (err) {
            this._log?.debug?.(`Stockage indisponible pour « ${pluginId} » : ${err?.message || err}`);
            return null;
        }
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
