/**
 * SpaceHub — PluginManager v2
 * Gestion contrôlée des extensions client SpaceHub.
 *
 * Important : un plugin SDK s'exécute dans le contexte de la page uniquement
 * lorsqu'il est explicitement approuvé. Les API exposées par le contexte passent
 * par des permissions et ne donnent jamais directement le token Jellyfin.
 */
'use strict';

import Logger from './Logger.js';
import PluginPermissions, { PluginPermissionError } from './PluginPermissions.js';

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const STATES = new Set(['registered', 'loaded', 'enabled', 'disabled', 'error', 'quarantined']);
const HOOKS = ['onLoad', 'onEnable', 'onDisable', 'onUnload'];
const CONTRIBUTIONS = new Set(['widget', 'theme', 'route', 'metadataProvider', 'action', 'adminPanel', 'module']);

function safeWindow() {
    return typeof window !== 'undefined' ? window : {};
}

export class PluginManager {
    constructor({ eventBus = null, settings = null, userProvider = null, timeoutMs = 10000, hostVersion = '1.0.0' } = {}) {
        this._log = new Logger('PluginManager');
        this._eventBus = eventBus;
        this._settings = settings;
        this._timeoutMs = timeoutMs;
        this._hostVersion = hostVersion;
        this._plugins = new Map();
        this._operations = new Map();
        this._contributions = new Map();
        this._permissions = new PluginPermissions({
            settings,
            eventBus,
            userProvider: userProvider || (() => safeWindow().SpaceHub?.auth?.getUser?.())
        });
    }

    async registerPlugin(manifest, { autoEnable = true } = {}) {
        const normalized = this._validateManifest(manifest);
        if (!normalized) return false;
        const id = normalized.id;
        const previous = this._plugins.get(id);
        if (previous?.state === 'enabled') {
            this._log.warn(`Refus de remplacer le plugin SDK actif "${id}".`);
            return false;
        }

        const entry = {
            id,
            manifest: normalized,
            state: 'registered',
            instance: null,
            lastError: null,
            health: { status: 'unknown', checkedAt: null, error: null },
            registeredAt: previous?.registeredAt || Date.now(),
            errorCount: previous?.errorCount || 0,
            cleanups: []
        };
        this._plugins.set(id, entry);
        this._eventBus?.emit('plugin:registered', { id, manifest: this._publicManifest(normalized) });

        const enabled = this._settings
            ? this._settings.get(`plugins.${id}.enabled`, normalized.isDefault === true) === true
            : normalized.isDefault === true;
        if (enabled && autoEnable) await this.enablePlugin(id);
        return true;
    }

    async enablePlugin(id) {
        return this._exclusive(id, () => this._enableEntry(this._get(id), new Set()));
    }

    async _enableEntry(plugin, stack) {
        if (plugin.state === 'enabled') return true;
        if (plugin.state === 'quarantined' || plugin.state === 'error') return false;
        if (stack.has(plugin.id)) {
            this._fail(plugin, new Error(`Dépendance circulaire détectée : ${[...stack, plugin.id].join(' → ')}`), 'dependency');
            return false;
        }
        stack.add(plugin.id);
        try {
            for (const dependencyId of plugin.manifest.dependencies) {
                const dependency = this._plugins.get(dependencyId);
                if (!dependency || !(await this._enableEntry(dependency, stack))) {
                    plugin.lastError = `Dépendance indisponible : ${dependencyId}`;
                    plugin.health = { status: 'blocked', checkedAt: Date.now(), error: plugin.lastError };
                    return false;
                }
            }
            for (const dependencyId of plugin.manifest.optionalDependencies) {
                const dependency = this._plugins.get(dependencyId);
                if (dependency) await this._enableEntry(dependency, stack);
            }
            const permissionPolicy = this._permissions.getPolicy(plugin.id, plugin.manifest.permissions);
            if (permissionPolicy.denied.length > 0) {
                this._log.warn(`Activation refusée pour "${plugin.id}" : permissions non approuvées.`);
                plugin.lastError = `Permissions non approuvées : ${permissionPolicy.denied.join(', ')}`;
                plugin.health = { status: 'blocked', checkedAt: Date.now(), error: plugin.lastError };
                return false;
            }
            const ctx = this._createPluginContext(plugin);
            if (plugin.state === 'registered' || plugin.state === 'disabled') {
                if (typeof plugin.manifest.onLoad === 'function' && plugin.state === 'registered') {
                    await this._runHook(plugin.manifest.onLoad, ctx, plugin.id, 'onLoad');
                    plugin.state = 'loaded';
                    this._eventBus?.emit('plugin:loaded', { id: plugin.id });
                }
                if (typeof plugin.manifest.onEnable === 'function') {
                    await this._runHook(plugin.manifest.onEnable, ctx, plugin.id, 'onEnable');
                }
            }
            plugin.state = 'enabled';
            plugin.lastError = null;
            plugin.health = { status: 'healthy', checkedAt: Date.now(), error: null };
            this._settings?.set(`plugins.${plugin.id}.enabled`, true);
            this._eventBus?.emit('plugin:enabled', { id: plugin.id, manifest: this._publicManifest(plugin.manifest) });
            return true;
        } catch (error) {
            this._fail(plugin, error, 'enable');
            return false;
        } finally {
            stack.delete(plugin.id);
        }
    }

    async disablePlugin(id) {
        return this._exclusive(id, async () => this._disablePluginEntry(this._get(id)));
    }

    async _disablePluginEntry(plugin) {
        if (plugin.state === 'disabled' || plugin.state === 'registered') {
            this._settings?.set(`plugins.${plugin.id}.enabled`, false);
            plugin.state = 'disabled';
            return true;
        }
        try {
            if (typeof plugin.manifest.onDisable === 'function') {
                await this._runHook(plugin.manifest.onDisable, this._createPluginContext(plugin), plugin.id, 'onDisable');
            }
            this._runCleanups(plugin);
            this._removeContributions(plugin.id);
            plugin.state = 'disabled';
            this._settings?.set(`plugins.${plugin.id}.enabled`, false);
            this._eventBus?.emit('plugin:disabled', { id: plugin.id });
            return true;
        } catch (error) {
            this._fail(plugin, error, 'disable');
            return false;
        }
    }

    async unloadPlugin(id) {
        return this._exclusive(id, async () => {
            const plugin = this._plugins.get(this._normalizeId(id));
            if (!plugin) return false;
            if (plugin.state === 'enabled' || plugin.state === 'loaded') await this._disablePluginEntry(plugin);
            try {
                if (typeof plugin.manifest.onUnload === 'function') {
                    await this._runHook(plugin.manifest.onUnload, this._createPluginContext(plugin), plugin.id, 'onUnload');
                }
            } catch (error) {
                this._log.warn(`onUnload échoué pour "${plugin.id}"`, error);
            }
            this._runCleanups(plugin);
            this._removeContributions(plugin.id);
            this._plugins.delete(plugin.id);
            this._eventBus?.emit('plugin:unloaded', { id: plugin.id });
            return true;
        });
    }

    async reloadPlugin(id) {
        const plugin = this._get(id);
        const shouldEnable = plugin.state === 'enabled';
        const manifest = { ...plugin.manifest };
        await this.unloadPlugin(id);
        if (!shouldEnable) return true;
        const registered = await this.registerPlugin(manifest);
        if (!registered) return false;
        return this.enablePlugin(id);
    }

    async resetPlugin(id) {
        const plugin = this._get(id);
        if (plugin.state === 'enabled') await this.disablePlugin(id);
        plugin.state = 'disabled';
        plugin.errorCount = 0;
        plugin.lastError = null;
        plugin.health = { status: 'disabled', checkedAt: Date.now(), error: null };
        this._settings?.set(`plugins.${plugin.id}.enabled`, false);
        this._eventBus?.emit('plugin:reset', { id: plugin.id });
        return true;
    }

    async checkHealth(id) {
        const plugin = this._get(id);
        if (plugin.state !== 'enabled') {
            plugin.health = { status: 'disabled', checkedAt: Date.now(), error: null };
            return plugin.health;
        }
        try {
            if (typeof plugin.manifest.healthCheck === 'function') {
                await this._runHook(plugin.manifest.healthCheck, this._createPluginContext(plugin), id, 'healthCheck');
            }
            plugin.health = { status: 'healthy', checkedAt: Date.now(), error: null };
        } catch (error) {
            plugin.health = { status: 'unhealthy', checkedAt: Date.now(), error: error.message };
        }
        return plugin.health;
    }

    approvePermissions(id, permissions) {
        const plugin = this._get(id);
        const policy = this._permissions.setApproved(plugin.id, permissions);
        this._eventBus?.emit('plugin:approved', { id: plugin.id, permissions: policy });
        return policy;
    }

    getPermissionPolicy(id) {
        const plugin = this._get(id);
        return this._permissions.getPolicy(plugin.id, plugin.manifest.permissions);
    }

    setPolicyProvider(policyProvider) {
        this._permissions._policyProvider = policyProvider;
    }

    registerContribution(pluginId, type, contribution) {
        const plugin = this._get(pluginId);
        if (plugin.state !== 'enabled') throw new Error(`Le plugin "${pluginId}" doit être actif pour publier une contribution.`);
        return this._registerContribution(plugin, type, contribution);
    }

    _registerContribution(plugin, type, contribution) {
        if (!CONTRIBUTIONS.has(type) || !contribution || typeof contribution !== 'object') {
            throw new TypeError(`Contribution "${type}" invalide.`);
        }
        const requiredPermission = {
            widget: 'ui.dashboard.write',
            theme: 'ui.theme.register',
            route: 'ui.dashboard.write',
            metadataProvider: 'jellyfin.metadata.read',
            action: 'ui.dashboard.write',
            adminPanel: 'server.system.read',
            module: 'settings.plugin.write'
        }[type];
        if (requiredPermission) this._permissions.assert(plugin.id, requiredPermission, { requested: plugin.manifest.permissions });
        const key = contribution.id || contribution.name;
        if (!key || typeof key !== 'string') throw new TypeError('Une contribution doit avoir un id.');
        const contributionKey = `${type}:${key}`;
        const existing = this._contributions.get(contributionKey);
        if (existing && existing.pluginId !== plugin.id) {
            throw new Error(`Contribution déjà utilisée : ${contributionKey}`);
        }
        this._contributions.set(contributionKey, { pluginId: plugin.id, type, contribution });
        const host = safeWindow().SpaceHub || {};
        if (type === 'widget' && typeof contribution.WidgetClass === 'function') {
            host.ui?.dashboard?.registerWidget?.(key, contribution.WidgetClass);
        } else if (type === 'theme') {
            host.ui?.themes?.register?.(contribution);
        } else if (type === 'metadataProvider') {
            host.metadata?.registerProvider?.(contribution);
        }
        return () => {
            const current = this._contributions.get(contributionKey);
            if (current?.pluginId !== plugin.id) return;
            if (type === 'widget') host.ui?.dashboard?.unregisterWidget?.(key, contribution.WidgetClass);
            if (type === 'theme') host.ui?.themes?.unregister?.(key);
            if (type === 'metadataProvider') host.metadata?.unregisterProvider?.(key);
            this._contributions.delete(contributionKey);
        };
    }

    getContributions(type = null) {
        return [...this._contributions.values()]
            .filter(item => !type || item.type === type)
            .map(item => ({ ...item, contribution: { ...item.contribution } }));
    }

    getPluginStorage(id) {
        const plugin = this._get(id);
        const prefix = `plugins.${plugin.id}.storage`;
        return {
            get: (key, fallback = null) => this._settings?.get(`${prefix}.${key}`, fallback) ?? fallback,
            set: (key, value) => this._settings?.set(`${prefix}.${key}`, value),
            delete: key => this._settings?.delete(`${prefix}.${key}`),
            export: () => this._settings?.get(prefix, {}) || {}
        };
    }

    getPluginManifest(id) {
        const plugin = this._plugins.get(this._normalizeId(id));
        return plugin ? { ...plugin.manifest } : null;
    }

    getPlugins() {
        return [...this._plugins.values()].map(plugin => ({
            id: plugin.id,
            ...this._publicManifest(plugin.manifest),
            state: plugin.state,
            isEnabled: plugin.state === 'enabled',
            lastError: plugin.lastError,
            health: { ...plugin.health },
            permissionPolicy: this._permissions.getPolicy(plugin.id, plugin.manifest.permissions)
        }));
    }

    _createPluginContext(plugin) {
        const id = plugin.id;
        const permission = (name, options = {}) => this._permissions.assert(id, name, {
            requested: plugin.manifest.permissions,
            ...options
        });
        const host = safeWindow().SpaceHub || {};
        return {
            pluginId: id,
            manifest: this._publicManifest(plugin.manifest),
            sdk: {
                on: (event, callback) => this._trackCleanup(plugin, this._eventBus?.on(event, callback)),
                once: (event, callback) => this._trackCleanup(plugin, this._eventBus?.once(event, callback)),
                emit: (event, data) => this._eventBus?.emit(`plugin:${id}:${event}`, data),
                registerContribution: (type, value) => this._trackCleanup(plugin, this._registerContribution(plugin, type, value)),
                registerWidget: (widgetId, WidgetClass) => {
                    permission('ui.dashboard.write');
                    return this._trackCleanup(plugin, this._registerContribution(plugin, 'widget', { id: widgetId, WidgetClass }));
                },
                registerTheme: theme => {
                    permission('ui.theme.register');
                    return this._trackCleanup(plugin, this._registerContribution(plugin, 'theme', theme));
                },
                registerMetadataProvider: provider => {
                    permission('jellyfin.metadata.read');
                    return this._trackCleanup(plugin, this._registerContribution(plugin, 'metadataProvider', provider));
                }
            },
            api: {
                getItem: (...args) => { permission('jellyfin.items.read'); return host.jellyfin?.api?.getItem?.(...args); },
                getItems: (...args) => { permission('jellyfin.items.read'); return host.jellyfin?.api?.getItems?.(...args); },
                getMetadata: (...args) => { permission('jellyfin.metadata.read'); return host.metadata?.get?.(...args); },
                getServerPlugins: (...args) => { permission('server.plugins.read'); return host.jellyfin?.plugins?.list?.(...args); },
                configureServerPlugin: (...args) => { permission('server.plugins.configure'); return host.jellyfin?.plugins?.saveConfiguration?.(...args); },
                fetch: async (url, options = {}) => {
                    permission('network.external.read');
                    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) throw new TypeError('Seules les URLs HTTPS sont autorisées.');
                    return fetch(url, { ...options, credentials: 'omit' });
                }
            },
            events: {
                on: (event, callback) => this._trackCleanup(plugin, this._eventBus?.on(`plugin:${id}:${event}`, callback)),
                once: (event, callback) => this._trackCleanup(plugin, this._eventBus?.once(`plugin:${id}:${event}`, callback)),
                emit: (event, data) => this._eventBus?.emit(`plugin:${id}:${event}`, data)
            },
            settings: this.getPluginStorage(id),
            permissions: { has: name => this._permissions.can(id, name, { requested: plugin.manifest.permissions }) },
            ui: {
                toaster: host.ui?.components?.toaster,
                dashboard: {
                    registerWidget: (widgetId, WidgetClass) => {
                        permission('ui.dashboard.write');
                        return host.ui?.dashboard?.registerWidget?.(widgetId, WidgetClass);
                    }
                },
                themes: {
                    register: theme => { permission('ui.theme.register'); return host.ui?.themes?.register?.(theme); },
                    apply: themeId => { permission('ui.theme.apply'); return host.ui?.themes?.apply?.(themeId); }
                },
                openModal: options => { permission('ui.modal.open'); return host.sdk?.openModal?.(options); }
            },
            log: new Logger(`Plugin:${id}`)
        };
    }

    _validateManifest(manifest) {
        if (!manifest || typeof manifest !== 'object' || typeof manifest.id !== 'string') {
            this._log.error('Un plugin doit définir un id.');
            return null;
        }
        const id = this._normalizeId(manifest.id);
        if (!ID_PATTERN.test(id)) {
            this._log.error(`Identifiant plugin invalide : "${manifest.id}"`);
            return null;
        }
        if (manifest.name !== undefined && typeof manifest.name !== 'string') return null;
        for (const hook of [...HOOKS, 'healthCheck']) {
            if (manifest[hook] !== undefined && typeof manifest[hook] !== 'function') {
                this._log.error(`${hook} doit être une fonction.`);
                return null;
            }
        }
        const rawDependencies = manifest.dependencies ?? [];
        const rawOptionalDependencies = manifest.optionalDependencies ?? [];
        if (!Array.isArray(rawDependencies) || !Array.isArray(rawOptionalDependencies)) {
            this._log.error(`Dépendances invalides pour "${id}".`);
            return null;
        }
        const dependencies = [...new Set(rawDependencies.map(dependency => String(dependency).trim().toLowerCase()))];
        const optionalDependencies = [...new Set(rawOptionalDependencies.map(dependency => String(dependency).trim().toLowerCase()))];
        if (![...rawDependencies, ...rawOptionalDependencies].every(dependency => typeof dependency === 'string') || [...dependencies, ...optionalDependencies].some(dependency => !ID_PATTERN.test(dependency))) {
            this._log.error(`Dépendance invalide pour "${id}".`);
            return null;
        }
        const permissionResult = this._permissions.validate(manifest.permissions || []);
        if (!permissionResult.valid) {
            this._log.error(`Permissions inconnues pour "${id}" : ${permissionResult.unknown.join(', ')}`);
            return null;
        }
        const contributions = manifest.contributions ?? [];
        if (!Array.isArray(contributions) || contributions.some(type => typeof type !== 'string' || !CONTRIBUTIONS.has(type))) {
            this._log.error(`Contributions invalides pour "${id}".`);
            return null;
        }
        if (manifest.compatibility?.minSpaceHub && !this._isCompatible(manifest.compatibility.minSpaceHub)) {
            this._log.error(`Plugin "${id}" incompatible avec SpaceHub ${this._hostVersion}.`);
            return null;
        }
        return {
            id,
            name: manifest.name || id,
            version: manifest.version || '1.0.0',
            apiVersion: manifest.apiVersion || '2.0.0',
            author: manifest.author || 'Tiers',
            description: manifest.description || '',
            icon: manifest.icon || '🧩',
            isDefault: manifest.isDefault === true,
            permissions: permissionResult.permissions,
            contributions,
            dependencies,
            optionalDependencies,
            compatibility: manifest.compatibility || {},
            integrity: manifest.integrity || null,
            signature: manifest.signature || null,
            license: manifest.license || null,
            documentationUrl: manifest.documentationUrl || null,
            settingsSchema: manifest.settingsSchema || null,
            onLoad: manifest.onLoad,
            onEnable: manifest.onEnable,
            onDisable: manifest.onDisable,
            onUnload: manifest.onUnload,
            healthCheck: manifest.healthCheck
        };
    }

    _publicManifest(manifest) {
        const { onLoad, onEnable, onDisable, onUnload, healthCheck, ...publicManifest } = manifest;
        return { ...publicManifest, permissions: [...(manifest.permissions || [])], contributions: [...(manifest.contributions || [])] };
    }

    _get(id) {
        const plugin = this._plugins.get(this._normalizeId(id));
        if (!plugin) throw new Error(`Plugin "${id}" introuvable.`);
        return plugin;
    }

    _normalizeId(id) { return String(id || '').trim().toLowerCase(); }

    _isCompatible(minVersion) {
        const current = String(this._hostVersion).split('.').map(Number);
        const required = String(minVersion).split('.').map(Number);
        for (let index = 0; index < 3; index++) {
            if ((current[index] || 0) !== (required[index] || 0)) return (current[index] || 0) > (required[index] || 0);
        }
        return true;
    }

    async _runHook(hook, context, id, name) {
        return this._withTimeout(Promise.resolve().then(() => hook(context)), `${name}(${id})`);
    }

    _withTimeout(promise, label) {
        if (!this._timeoutMs) return promise;
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Timeout du hook ${label}`)), this._timeoutMs);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    _exclusive(id, operation) {
        const normalized = this._normalizeId(id);
        const previous = this._operations.get(normalized) || Promise.resolve();
        const next = previous.catch(() => {}).then(operation);
        const tracked = next.finally(() => {
            if (this._operations.get(normalized) === tracked) this._operations.delete(normalized);
        });
        this._operations.set(normalized, tracked);
        return next;
    }

    _fail(plugin, error, operation) {
        plugin.state = plugin.errorCount >= 2 ? 'quarantined' : 'error';
        plugin.errorCount += 1;
        plugin.lastError = error?.message || String(error);
        plugin.health = { status: 'unhealthy', checkedAt: Date.now(), error: plugin.lastError };
        this._runCleanups(plugin);
        this._removeContributions(plugin.id);
        this._settings?.set(`plugins.${plugin.id}.enabled`, false);
        this._log.error(`Erreur ${operation} plugin "${plugin.id}"`, error);
        this._eventBus?.emit('plugin:error', { id: plugin.id, operation, error: plugin.lastError, state: plugin.state });
    }

    _trackCleanup(plugin, cleanup) {
        if (typeof cleanup !== 'function') return cleanup;
        plugin.cleanups.push(cleanup);
        return cleanup;
    }

    _runCleanups(plugin) {
        for (const cleanup of plugin.cleanups.splice(0)) {
            try { cleanup(); } catch (error) { this._log.warn(`Nettoyage plugin "${plugin.id}" échoué`, error); }
        }
    }

    _removeContributions(pluginId) {
        for (const [key, value] of this._contributions) {
            if (value.pluginId === pluginId) this._contributions.delete(key);
        }
    }
}

export default PluginManager;
export { STATES, CONTRIBUTIONS, PluginPermissionError };
