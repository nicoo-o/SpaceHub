/**
 * SpaceHub — PolicyService
 *
 * Le bridge serveur est facultatif. Sans lui, le client conserve uniquement des
 * préférences locales et ne prétend pas synchroniser une politique globale.
 */
'use strict';

import Logger from './Logger.js';

class PolicyService {
    constructor({ settings = null, eventBus = null, client = null } = {}) {
        this._settings = settings || window.SpaceHub?.core?.settings;
        this._eventBus = eventBus || window.SpaceHub?.core?.eventBus;
        this._client = client || window.SpaceHub?.core?.api?.getClient?.('jellyfin');
        this._log = new Logger('PolicyService');
        this._mode = 'local';
        this._policy = null;
    }

    get mode() { return this._mode; }

    async load() {
        if (!this._client?.get) {
            this._mode = 'local';
            this._policy = this._localPolicy();
            return this._policy;
        }
        try {
            const policy = await this._client.get('/Plugins/SpaceHub/Configuration');
            if (!policy || typeof policy !== 'object') throw new Error('Réponse bridge invalide');
            this._mode = 'server-bridge';
            this._policy = policy;
            return policy;
        } catch (error) {
            this._mode = 'local';
            this._policy = this._localPolicy();
            this._log.info('Bridge SpaceHub indisponible : fonctionnement en mode local.');
            return this._policy;
        }
    }

    get(path, fallback = null) {
        const policy = this._policy || this._localPolicy();
        return path.split('.').reduce((value, key) => value?.[key], policy) ?? fallback;
    }

    async save(policy) {
        if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new TypeError('Politique invalide.');
        if (this._mode !== 'server-bridge' || !this._client?.post) {
            this._settings?.set('serverPolicy.local', policy);
            this._policy = policy;
            this._eventBus?.emit('policy:changed', { mode: 'local', policy });
            return { mode: 'local', persisted: true, policy };
        }
        const result = await this._client.post('/Plugins/SpaceHub/Configuration', policy);
        this._policy = policy;
        this._eventBus?.emit('policy:changed', { mode: this._mode, policy });
        return { mode: this._mode, persisted: true, result, policy };
    }

    _policyLists(pluginId, permission, userId = null) {
        const denied = this.get(`plugins.${pluginId}.deniedPermissions`, []);
        const allowed = this.get(`plugins.${pluginId}.permissions`, []);
        const userAllowed = userId ? this.get(`users.${userId}.plugins.${pluginId}.permissions`, []) : [];
        return { denied, allowed, userAllowed, permission };
    }

    denies(pluginId, permission, userId = null) {
        const { denied } = this._policyLists(pluginId, permission, userId);
        return Array.isArray(denied) && denied.includes(permission);
    }

    can(pluginId, permission, userId = null) {
        const { denied, allowed, userAllowed } = this._policyLists(pluginId, permission, userId);
        if (Array.isArray(denied) && denied.includes(permission)) return false;
        return [allowed, userAllowed].some(list => Array.isArray(list) && list.includes(permission));
    }

    _localPolicy() {
        return this._settings?.get('serverPolicy.local', {
            mode: 'local',
            plugins: {},
            groups: {},
            users: {}
        }) || { mode: 'local', plugins: {}, groups: {}, users: {} };
    }
}

export default PolicyService;
