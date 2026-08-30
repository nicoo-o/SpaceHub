/**
 * SpaceHub — PluginManager
 * Version: 1.0.0
 *
 * Gestionnaire officiel du cycle de vie des extensions et plugins SDK pour SpaceHub.
 * Fournit l'enregistrement, l'initialisation, l'activation, la désactivation et le nettoyage (lifecycle).
 */

'use strict';

import Logger from './Logger.js';

export class PluginManager {
    /**
     * @param {Object} options
     * @param {import('./EventBus.js').default} [options.eventBus]
     * @param {import('./SettingsManager.js').default} [options.settings]
     */
    constructor({ eventBus = null, settings = null } = {}) {
        this._log = new Logger('PluginManager');
        this._eventBus = eventBus;
        this._settings = settings;

        /** @type {Map<string, { manifest: Object, state: 'registered'|'loaded'|'enabled'|'disabled'|'error', instance: any }>} */
        this._plugins = new Map();

        this._log.info('PluginManager initialisé.');
    }

    /**
     * Enregistre un plugin SDK dans le registre officiel.
     * @param {Object} manifest
     * @param {string} manifest.id - Identifiant unique
     * @param {string} manifest.name - Nom affiché
     * @param {string} [manifest.version='1.0.0'] - Version
     * @param {string} [manifest.author='Tiers'] - Auteur
     * @param {string} [manifest.description=''] - Description
     * @param {string} [manifest.icon='🧩'] - Emoji / Icône
     * @param {Function} [manifest.onLoad] - Hook de chargement
     * @param {Function} [manifest.onEnable] - Hook d'activation
     * @param {Function} [manifest.onDisable] - Hook de désactivation
     * @param {Function} [manifest.onUnload] - Hook de déchargement
     * @returns {boolean}
     */
    registerPlugin(manifest) {
        if (!manifest || !manifest.id || typeof manifest.id !== 'string') {
            this._log.error('Échec enregistrement : un plugin doit définir un "id" valide.');
            return false;
        }

        const id = manifest.id.toLowerCase().trim();
        if (this._plugins.has(id)) {
            this._log.warn(`Le plugin "${id}" est déjà enregistré. Mise à jour du manifest.`);
        }

        const pluginEntry = {
            id,
            manifest: {
                version: '1.0.0',
                author: 'SpaceHub Community',
                icon: '🧩',
                description: '',
                isDefault: false,
                ...manifest,
                id
            },
            state: 'registered',
            instance: null
        };

        this._plugins.set(id, pluginEntry);
        this._log.info(`Plugin enregistré : "${manifest.name || id}" (v${pluginEntry.manifest.version})`);

        this._eventBus?.emit('plugin:registered', { id, manifest: pluginEntry.manifest });

        // Vérifier si le plugin doit être activé au démarrage
        const shouldBeEnabled = this._settings ? this._settings.get(`plugins.${id}.enabled`, manifest.isDefault ?? true) : true;
        if (shouldBeEnabled) {
            this.enablePlugin(id).catch(err => {
                this._log.error(`Erreur lors de l'auto-activation du plugin "${id}":`, err);
            });
        }

        return true;
    }

    /**
     * Crée le contexte d'exécution transmis aux hooks du plugin.
     * @param {string} pluginId
     * @returns {Object}
     */
    _createPluginContext(pluginId) {
        return {
            pluginId,
            sdk: window.SpaceHub?.sdk,
            api: window.SpaceHub?.jellyfin?.api,
            events: this._eventBus,
            settings: {
                get: (k, fb) => this._settings?.get(`plugins.${pluginId}.${k}`, fb),
                set: (k, v) => this._settings?.set(`plugins.${pluginId}.${k}`, v)
            },
            ui: {
                dashboard: window.SpaceHub?.ui?.dashboard,
                themes: window.SpaceHub?.ui?.themes,
                toaster: window.SpaceHub?.ui?.components?.toaster
            },
            log: new Logger(`Plugin:${pluginId}`)
        };
    }

    /**
     * Active un plugin et exécute son hook onEnable.
     * @param {string} id
     */
    async enablePlugin(id) {
        const plugin = this._plugins.get(id);
        if (!plugin) {
            this._log.warn(`Impossible d'activer : plugin "${id}" introuvable.`);
            return false;
        }

        if (plugin.state === 'enabled') {
            return true;
        }

        const ctx = this._createPluginContext(id);

        try {
            // Exécuter onLoad si non encore fait
            if (plugin.state === 'registered' && typeof plugin.manifest.onLoad === 'function') {
                await plugin.manifest.onLoad(ctx);
                plugin.state = 'loaded';
                this._eventBus?.emit('plugin:loaded', { id });
            }

            // Exécuter onEnable
            if (typeof plugin.manifest.onEnable === 'function') {
                await plugin.manifest.onEnable(ctx);
            }

            plugin.state = 'enabled';
            this._settings?.set(`plugins.${id}.enabled`, true);
            this._log.info(`Plugin activé avec succès : "${plugin.manifest.name}"`);
            this._eventBus?.emit('plugin:enabled', { id, manifest: plugin.manifest });
            return true;
        } catch (err) {
            plugin.state = 'error';
            plugin.lastError = err.message;
            this._log.error(`Erreur lors de l'activation du plugin "${id}":`, err);
            this._eventBus?.emit('plugin:error', { id, error: err.message });
            return false;
        }
    }

    /**
     * Désactive un plugin et exécute son hook onDisable.
     * @param {string} id
     */
    async disablePlugin(id) {
        const plugin = this._plugins.get(id);
        if (!plugin) {
            this._log.warn(`Impossible de désactiver : plugin "${id}" introuvable.`);
            return false;
        }

        if (plugin.state === 'disabled') {
            return true;
        }

        const ctx = this._createPluginContext(id);

        try {
            if (typeof plugin.manifest.onDisable === 'function') {
                await plugin.manifest.onDisable(ctx);
            }

            plugin.state = 'disabled';
            this._settings?.set(`plugins.${id}.enabled`, false);
            this._log.info(`Plugin désactivé : "${plugin.manifest.name}"`);
            this._eventBus?.emit('plugin:disabled', { id, manifest: plugin.manifest });
            return true;
        } catch (err) {
            this._log.error(`Erreur lors de la désactivation du plugin "${id}":`, err);
            return false;
        }
    }

    /**
     * Décharge complètement un plugin de la mémoire.
     * @param {string} id
     */
    async unloadPlugin(id) {
        const plugin = this._plugins.get(id);
        if (!plugin) return;

        if (plugin.state === 'enabled') {
            await this.disablePlugin(id);
        }

        const ctx = this._createPluginContext(id);
        try {
            if (typeof plugin.manifest.onUnload === 'function') {
                await plugin.manifest.onUnload(ctx);
            }
        } catch (e) {
            this._log.warn(`Erreur onUnload plugin "${id}":`, e);
        }

        this._plugins.delete(id);
        this._log.info(`Plugin déchargé : "${id}"`);
        this._eventBus?.emit('plugin:unloaded', { id });
    }

    /**
     * Retourne la liste de tous les plugins enregistrés et leur état en direct.
     * @returns {Array<Object>}
     */
    getPlugins() {
        return Array.from(this._plugins.values()).map(p => ({
            id: p.id,
            name: p.manifest.name || p.id,
            version: p.manifest.version || '1.0.0',
            author: p.manifest.author || 'Tiers',
            description: p.manifest.description || '',
            icon: p.manifest.icon || '🧩',
            state: p.state,
            isEnabled: p.state === 'enabled',
            lastError: p.lastError || null
        }));
    }
}

export default PluginManager;
