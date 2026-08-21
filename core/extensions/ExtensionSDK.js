/**
 * SpaceHub — Extension SDK (Public)
 * Version: 1.0.0
 *
 * API publique pour les extensions tierces.
 * Permet aux développeurs de créer des plugins qui s'intègrent à SpaceHub.
 *
 * Types d'extensions supportées :
 * - Widgets (dashboard)
 * - Pages (navigation)
 * - Intégrations API (services externes)
 * - Thèmes
 */

'use strict';

import Logger from '../Logger.js';

class ExtensionSDK {
    constructor() {
        this._log = new Logger('ExtensionSDK');
        this._extensions = new Map();
        this._hooks = new Map();
        this._log.info('Extension SDK initialisé.');
    }

    /**
     * Enregistre une nouvelle extension.
     * @param {Object} manifest - Manifeste de l'extension
     * @returns {ExtensionContext}
     */
    register(manifest) {
        this._validateManifest(manifest);

        const id = manifest.id;
        if (this._extensions.has(id)) {
            throw new Error(`Extension ${id} déjà enregistrée.`);
        }

        const context = new ExtensionContext(id, manifest, this);
        this._extensions.set(id, {
            manifest,
            context,
           enabled: true
        });

        this._log.info(`Extension enregistrée: ${id} v${manifest.version}`);
        return context;
    }

    /**
     * Désactive une extension.
     * @param {string} id
     */
    unregister(id) {
        const ext = this._extensions.get(id);
        if (!ext) return;

        ext.enabled = false;
        this._log.info(`Extension désactivée: ${id}`);
    }

    /**
     * Active une extension.
     * @param {string} id
     */
    enable(id) {
        const ext = this._extensions.get(id);
        if (!ext) return;

        ext.enabled = true;
        this._log.info(`Extension activée: ${id}`);
    }

    /**
     * Récupère une extension par ID.
     * @param {string} id
     * @returns {ExtensionContext|null}
     */
    getExtension(id) {
        const ext = this._extensions.get(id);
        return ext?.enabled ? ext.context : null;
    }

    /**
     * Liste toutes les extensions actives.
     * @returns {Array<Object>}
     */
    listExtensions() {
        return Array.from(this._extensions.values())
            .filter(ext => ext.enabled)
            .map(ext => ({
                id: ext.manifest.id,
                name: ext.manifest.name,
                version: ext.manifest.version,
                author: ext.manifest.author,
                description: ext.manifest.description
            }));
    }

    /**
     * Enregistre un hook système.
     * @param {string} event - Nom de l'événement
     * @param {Function} callback - Callback à exécuter
     */
    on(event, callback) {
        if (!this._hooks.has(event)) {
            this._hooks.set(event, []);
        }
        this._hooks.get(event).push(callback);
    }

    /**
     * Déclenche un hook.
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
        const callbacks = this._hooks.get(event) || [];
        callbacks.forEach(cb => {
            try {
                cb(data);
            } catch (err) {
                this._log.error(`Erreur hook ${event}:`, err);
            }
        });
    }

    /**
     * Valide le manifeste d'une extension.
     * @private
     */
    _validateManifest(manifest) {
        const required = ['id', 'name', 'version', 'author'];
        for (const field of required) {
            if (!manifest[field]) {
                throw new Error(`Manifest invalide: champ ${field} manquant.`);
            }
        }

        if (!/^[a-z0-9-]+$/.test(manifest.id)) {
            throw new Error('ID invalide: doit être en minuscules, chiffres et tirets uniquement.');
        }
    }
}

/**
 * Contexte d'exécution d'une extension.
 * Fournit l'API disponible pour l'extension.
 */
class ExtensionContext {
    constructor(id, manifest, sdk) {
        this.id = id;
        this.manifest = manifest;
        this._sdk = sdk;

        // API publique
        this.logger = new Logger(`Extension:${id}`);
        this.settings = this._createSettingsAPI();
        this.ui = this._createUIAPI();
        this.api = this._createAPI();
        this.hooks = this._createHooksAPI();
    }

    _createSettingsAPI() {
        return {
            get: (key, fallback) => {
                const fullKey = `extensions.${this.id}.${key}`;
                return window.SpaceHub?.core?.settings?.get(fullKey, fallback);
            },
            set: (key, value) => {
                const fullKey = `extensions.${this.id}.${key}`;
                window.SpaceHub?.core?.settings?.set(fullKey, value);
            },
            registerDefaults: (defaults) => {
                const prefixed = {};
                for (const [k, v] of Object.entries(defaults)) {
                    prefixed[`extensions.${this.id}.${k}`] = v;
                }
                window.SpaceHub?.core?.settings?.registerDefaults(prefixed);
            }
        };
    }

    _createUIAPI() {
        return {
            registerWidget: (widget) => {
                this._sdk.emit('widget:register', { extensionId: this.id, widget });
            },
            registerPage: (page) => {
                this._sdk.emit('page:register', { extensionId: this.id, page });
            },
            showToast: (message, type = 'info') => {
                window.SpaceHub?.ui?.components?.toaster?.[type]?.(message);
            }
        };
    }

    _createAPI() {
        return {
            jellyfin: window.SpaceHub?.core?.api?.getClient('jellyfin'),
            http: {
                get: (url, options) => fetch(url, { ...options, method: 'GET' }),
                post: (url, options) => fetch(url, { ...options, method: 'POST' }),
                put: (url, options) => fetch(url, { ...options, method: 'PUT' }),
                delete: (url, options) => fetch(url, { ...options, method: 'DELETE' })
            }
        };
    }

    _createHooksAPI() {
        return {
            on: (event, callback) => this._sdk.on(event, callback),
            emit: (event, data) => this._sdk.emit(event, data)
        };
    }
}

export default ExtensionSDK;
