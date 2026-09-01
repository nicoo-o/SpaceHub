/**
 * SpaceHub — Jellyfin server plugin service
 *
 * Cette couche distingue les opérations réellement exposées par Jellyfin des
 * capacités supposées. Elle ne transforme jamais un plugin listé en plugin actif.
 */
'use strict';

import Logger from '../../core/Logger.js';

const PLUGIN_FIELDS = 'Name,Version,Description,Id,AssemblyVersion,Status,ConfigurationFileName';
const SENSITIVE_KEY = /(?:token|password|secret|apikey|api_key|privatekey|clientsecret)/i;
const REDACTED_VALUE = '••••••';

class JellyfinPluginService {
    constructor({ api = null, eventBus = null, cache = null } = {}) {
        this._api = api || window.SpaceHub?.jellyfin?.api;
        this._eventBus = eventBus || window.SpaceHub?.core?.eventBus;
        this._cache = cache || window.SpaceHub?.core?.cache;
        this._log = new Logger('JellyfinPluginService');
        this._plugins = null;
        this._capabilities = null;
    }

    get client() {
        return this._api?._client || window.SpaceHub?.core?.api?.getClient?.('jellyfin');
    }

    async list({ force = false } = {}) {
        if (!force && this._plugins) return this._plugins;
        if (!this.client?.get) throw new Error('Client Jellyfin indisponible.');
        const raw = await this.client.get('/Plugins');
        const plugins = Array.isArray(raw) ? raw : (raw?.Items || []);
        this._plugins = plugins.map(plugin => this.normalize(plugin));
        this._eventBus?.emit('server:plugins-updated', { plugins: this._plugins });
        return this._plugins;
    }

    normalize(plugin = {}) {
        const hasId = Boolean(plugin.Id || plugin.id);
        const hasConfiguration = Boolean(plugin.ConfigurationFileName || plugin.configurationFileName);
        return {
            id: plugin.Id || plugin.id || '',
            name: plugin.Name || plugin.name || 'Plugin sans nom',
            version: plugin.Version || plugin.version || null,
            description: plugin.Description || plugin.description || '',
            assemblyVersion: plugin.AssemblyVersion || plugin.assemblyVersion || null,
            status: plugin.Status || plugin.status || 'unknown',
            statusVerified: Boolean(plugin.Status || plugin.status),
            canConfigure: hasId && hasConfiguration,
            canInstall: false,
            canUpdate: false,
            canUninstall: false,
            capabilities: {
                list: true,
                configuration: hasId && hasConfiguration,
                install: false,
                update: false,
                uninstall: false
            },
            raw: plugin,
            // Alias de compatibilité avec l'ancien rendu de la console.
            Id: plugin.Id || plugin.id || '',
            Name: plugin.Name || plugin.name || 'Plugin sans nom',
            Version: plugin.Version || plugin.version || null,
            Description: plugin.Description || plugin.description || '',
            Status: plugin.Status || plugin.status || 'unknown'
        };
    }

    async detectCapabilities({ force = false } = {}) {
        if (!force && this._capabilities) return this._capabilities;
        const plugins = await this.list({ force });
        const client = this.client;
        const hasClient = Boolean(client && typeof client.get === 'function');
        const administrator = window.SpaceHub?.auth?.getUser?.()?.Policy?.IsAdministrator === true;
        this._capabilities = {
            list: hasClient,
            configuration: administrator && plugins.some(plugin => plugin.canConfigure),
            install: false,
            update: false,
            uninstall: false,
            reason: 'Jellyfin expose la liste et la configuration des plugins via les endpoints utilisés par le client; les opérations de package ne sont pas garanties par une API publique compatible.'
        };
        return this._capabilities;
    }

    async getConfiguration(pluginId) {
        this._assertId(pluginId);
        this._assertAdmin();
        const plugin = (await this.list()).find(item => item.id === pluginId);
        if (!plugin?.canConfigure) {
            throw new Error('La configuration de ce plugin n’est pas exposée par Jellyfin.');
        }
        return this.client.get(`/Plugins/${encodeURIComponent(pluginId)}/Configuration`);
    }

    redactConfiguration(configuration) {
        if (Array.isArray(configuration)) return configuration.map(value => this.redactConfiguration(value));
        if (!configuration || typeof configuration !== 'object') return configuration;
        return Object.fromEntries(Object.entries(configuration).map(([key, value]) => [
            key,
            SENSITIVE_KEY.test(key) && value !== null && value !== undefined && value !== ''
                ? REDACTED_VALUE
                : this.redactConfiguration(value)
        ]));
    }

    mergeRedactedConfiguration(original, edited) {
        if (Array.isArray(edited)) return edited.map((value, index) => this.mergeRedactedConfiguration(original?.[index], value));
        if (!edited || typeof edited !== 'object') return edited === REDACTED_VALUE ? original : edited;
        return Object.fromEntries(Object.entries(edited).map(([key, value]) => [
            key,
            SENSITIVE_KEY.test(key) && value === REDACTED_VALUE
                ? original?.[key]
                : this.mergeRedactedConfiguration(original?.[key], value)
        ]));
    }

    async saveConfiguration(pluginId, configuration) {
        this._assertId(pluginId);
        this._assertAdmin();
        if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
            throw new TypeError('La configuration du plugin doit être un objet JSON.');
        }
        const plugin = (await this.list()).find(item => item.id === pluginId);
        if (!plugin?.canConfigure) {
            throw new Error('La configuration de ce plugin n’est pas exposée par Jellyfin.');
        }
        const result = await this.client.post(`/Plugins/${encodeURIComponent(pluginId)}/Configuration`, configuration);
        this._plugins = null;
        this._capabilities = null;
        this._eventBus?.emit('server:plugin-configuration-saved', { pluginId });
        return result;
    }

    async getProviderHealth(pluginId) {
        this._assertId(pluginId);
        try {
            const configuration = await this.getConfiguration(pluginId);            return {
                pluginId,
                status: 'reachable',
                configurationAvailable: true,
                configuration: this.redactConfiguration(configuration)
            };

        } catch (error) {
            return {
                pluginId,
                status: error?.status === 401 || error?.status === 403 ? 'forbidden' : 'unknown',
                configurationAvailable: false,
                error: error?.message || 'État inconnu'
            };
        }
    }

    _assertId(pluginId) {
        if (!pluginId || typeof pluginId !== 'string') throw new TypeError('Identifiant plugin Jellyfin requis.');
    }

    _assertAdmin() {
        if (window.SpaceHub?.auth?.getUser?.()?.Policy?.IsAdministrator !== true) {
            throw new Error('Cette opération exige un compte administrateur Jellyfin.');
        }
    }
}

export default JellyfinPluginService;
