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
import { fetchAvecDelai } from './utils/reseau.js';
import * as svc from './services.js';

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const STATES = new Set(['registered', 'loaded', 'enabled', 'disabled', 'error', 'quarantined']);
const HOOKS = ['onLoad', 'onEnable', 'onDisable', 'onUnload'];
/**
 * Types de contribution acceptés.
 *
 * A5 — `adminPanel` et `module` ONT ÉTÉ RETIRÉS. Ils étaient déclarés,
 * validés, stockés dans une `Map`… et jamais relus : rien dans l'application
 * n'appelait `getContributions()`. Un greffon qui enregistrait un panneau
 * d'administration recevait une fonction de désabonnement parfaitement valide,
 * et aucun panneau n'existait — sans erreur à chercher.
 *
 * Une déclaration sans consommateur est un piège pour l'auteur du greffon.
 * Les cinq restants ont chacun un point d'application réel, vérifié par un
 * test qui lie cette liste au code qui la consomme.
 */
const CONTRIBUTIONS = new Set(['widget', 'theme', 'route', 'metadataProvider', 'action']);

/**
 * Version de l'API de greffons fournie par ce SDK.
 *
 * La MAJEURE change quand un greffon existant peut casser ; la mineure quand
 * on ajoute sans retirer. `_validateManifest` s'en sert pour refuser un greffon
 * écrit contre une majeure différente.
 */
export const API_VERSION = '2.0.0';

// `safeWindow()` vivait ici et servait à atteindre `window.SpaceHub`. Tous ses
// appels passent désormais par le registre de services (A8) : plus rien dans ce
// module ne touche à la façade globale, qui pourra donc disparaître sans le
// casser.

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
            userProvider: userProvider || (() => svc.auth()?.getUser?.())
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
        // A8 — Ce chemin s'adressait à `window.SpaceHub`. L'application est
        // passée au registre de services, avec un plafond d'accès globaux tenu
        // par `test:globals` ; celui-ci le contournait, et casserait le jour où
        // la façade globale disparaîtra.
        if (type === 'widget' && typeof contribution.WidgetClass === 'function') {
            svc.dashboard()?.registerWidget?.(key, contribution.WidgetClass);
        } else if (type === 'theme') {
            svc.themes()?.register?.(contribution);
        } else if (type === 'metadataProvider') {
            svc.metadata()?.registerProvider?.(contribution);
        } else if (type === 'route') {
            // Le nom est PRÉFIXÉ par l'identifiant du greffon. Sans cela, un
            // greffon pourrait enregistrer « accueil » et détourner la
            // navigation de l'application — le registre de routes est une
            // simple Map, le dernier inscrit gagne.
            svc.router()?.registerRoute?.(`x/${plugin.id}/${key}`, contribution);
        }
        // `action` n'a rien à faire ici : les menus contextuels lisent les
        // contributions au moment où ils s'ouvrent, plutôt que de recevoir un
        // enregistrement à l'avance. Voir CardBuilder.
        return () => {
            const current = this._contributions.get(contributionKey);
            if (current?.pluginId !== plugin.id) return;
            if (type === 'widget') svc.dashboard()?.unregisterWidget?.(key, contribution.WidgetClass);
            if (type === 'theme') svc.themes()?.unregister?.(key);
            if (type === 'metadataProvider') svc.metadata()?.unregisterProvider?.(key);
            if (type === 'route') svc.router()?.unregisterRoute?.(`x/${plugin.id}/${key}`);
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
                getItem: (...args) => { permission('jellyfin.items.read'); return svc.jellyfinApi()?.getItem?.(...args); },
                getItems: (...args) => { permission('jellyfin.items.read'); return svc.jellyfinApi()?.getItems?.(...args); },
                getMetadata: (...args) => { permission('jellyfin.metadata.read'); return svc.metadata()?.get?.(...args); },
                getServerPlugins: (...args) => { permission('server.plugins.read'); return svc.jellyfinPlugins()?.list?.(...args); },
                configureServerPlugin: (...args) => { permission('server.plugins.configure'); return svc.jellyfinPlugins()?.saveConfiguration?.(...args); },
                fetch: async (url, options = {}) => {
                    permission('network.external.read');
                    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) throw new TypeError('Seules les URLs HTTPS sont autorisées.');
                    // Plafond de temps imposé au plugin, non négociable : un
                    // greffon qui interroge un service lent ne doit pas pouvoir
                    // retenir indéfiniment une promesse de l'hôte.
                    return fetchAvecDelai(url, { ...options, credentials: 'omit' }, 20000);
                }
            },
            events: {
                on: (event, callback) => this._trackCleanup(plugin, this._eventBus?.on(`plugin:${id}:${event}`, callback)),
                once: (event, callback) => this._trackCleanup(plugin, this._eventBus?.once(`plugin:${id}:${event}`, callback)),
                emit: (event, data) => this._eventBus?.emit(`plugin:${id}:${event}`, data)
            },
            // D3 — Le greffon de notes allait chercher son service dans
            // `window.SpaceHub.core.ratingCache` : exactement le contournement
            // que le contrôle statique doit interdire. Il est désormais offert
            // ici, derrière la permission qui lui correspond — enregistrer un
            // fournisseur de notes, c'est lire des métadonnées.
            ratings: {
                setProvider: fn => { permission('jellyfin.metadata.read'); return svc.ratingCache()?.setProvider?.(fn); },
                setSearchProvider: fn => { permission('jellyfin.metadata.read'); return svc.ratingCache()?.setSearchProvider?.(fn); },
                setTextProvider: fn => { permission('jellyfin.metadata.read'); return svc.ratingCache()?.setTextProvider?.(fn); },
                clearProviders: () => svc.ratingCache()?.clearProviders?.(),
                signalerEtat: (etat) => svc.ratingCache()?.signalerEtat?.(etat),
            },
            settings: this.getPluginStorage(id),
            permissions: { has: name => this._permissions.can(id, name, { requested: plugin.manifest.permissions }) },
            ui: {
                toaster: svc.toaster(),
                dashboard: {
                    registerWidget: (widgetId, WidgetClass) => {
                        permission('ui.dashboard.write');
                        return svc.dashboard()?.registerWidget?.(widgetId, WidgetClass);
                    }
                },
                themes: {
                    register: theme => { permission('ui.theme.register'); return svc.themes()?.register?.(theme); },
                    apply: themeId => { permission('ui.theme.apply'); return svc.themes()?.apply?.(themeId); }
                },
                openModal: options => { permission('ui.modal.open'); return svc.sdk()?.openModal?.(options); }
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

        // A7 — `apiVersion` était déclarée dans chaque manifeste et confrontée
        // à RIEN. Un greffon écrit pour l'API 1 se chargeait sans un mot contre
        // l'API 2, puis échouait plus tard sur une méthode disparue, à un
        // endroit sans rapport avec la cause.
        //
        // Seule la MAJEURE compte : c'est la seule qui puisse casser un
        // greffon. Une mineure supérieure signifie « écrit pour une version
        // plus récente du SDK » — on l'accepte en le disant, parce que refuser
        // rendrait toute évolution du SDK bloquante pour l'écosystème.
        const apiDemandee = String(manifest.apiVersion || API_VERSION);
        const majeureDemandee = Number.parseInt(apiDemandee, 10);
        const majeureCourante = Number.parseInt(API_VERSION, 10);
        if (Number.isFinite(majeureDemandee) && majeureDemandee !== majeureCourante) {
            this._log.error(
                `Plugin "${id}" écrit pour l'API ${majeureDemandee}, le SDK est en ${majeureCourante}.`);
            return null;
        }
        if (this._comparerVersions(apiDemandee, API_VERSION) > 0) {
            this._log.warn(
                `Plugin "${id}" demande l'API ${apiDemandee}, le SDK fournit ${API_VERSION} : `
                + 'certaines fonctions peuvent manquer.');
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

    /**
     * Compare deux versions « x.y.z ».
     * @returns {number} négatif si a < b, 0 si égales, positif si a > b.
     */
    _comparerVersions(a, b) {
        const ga = String(a).split('.').map(n => Number.parseInt(n, 10) || 0);
        const gb = String(b).split('.').map(n => Number.parseInt(n, 10) || 0);
        for (let i = 0; i < 3; i += 1) {
            if ((ga[i] || 0) !== (gb[i] || 0)) return (ga[i] || 0) - (gb[i] || 0);
        }
        return 0;
    }

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
