/**
 * SpaceHub — SettingsManager
 * Version: 1.0.0
 *
 * Gestion centralisée de la configuration utilisateur.
 * Stockage dans localStorage avec support des valeurs par défaut,
 * de l'import/export JSON et de la notification de changements via EventBus.
 *
 * Usage:
 *   SpaceHub.core.settings.set('dashboard.layout', [...]);
 *   const layout = SpaceHub.core.settings.get('dashboard.layout', []);
 *   SpaceHub.core.settings.export(); // → JSON string
 */

'use strict';

import Logger from './Logger.js';

const STORAGE_KEY = 'SpaceHubSettings';

class SettingsManager {
    /**
     * @param {import('./EventBus.js').default} [eventBus]
     */
    constructor(eventBus = null) {
        this._log = new Logger('SettingsManager');
        this._eventBus = eventBus;
        /** @type {Record<string, *>} Valeurs par défaut enregistrées par les modules */
        this._defaults = {};
        /** @type {Record<string, *>} Valeurs actuelles (surchargent les defaults) */
        this._settings = {};
        this._load();
        this._log.info('Initialisé.');
    }

    // ─── Persistance ────────────────────────────────────────────────────────────

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) this._settings = JSON.parse(raw);
        } catch (err) {
            this._log.warn('Impossible de charger les settings, réinitialisation.', err);
            this._settings = {};
        }
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
        } catch (err) {
            this._log.error('Impossible de sauvegarder les settings.', err);
        }
    }

    // ─── API Publique ────────────────────────────────────────────────────────────

    /**
     * Enregistre des valeurs par défaut pour un module.
     * Appelé par chaque module lors de son initialisation.
     * @param {Record<string, *>} defaults
     */
    registerDefaults(defaults) {
        this._defaults = { ...this._defaults, ...defaults };
    }

    /**
     * Lit une valeur. Priorité : setting utilisateur > défaut > fallback.
     * Supporte la notation pointée : get('sonarr.url')
     * @param {string} key
     * @param {*} [fallback]
     * @returns {*}
     */
    get(key, fallback = null) {
        const userVal = this._getDeep(this._settings, key);
        if (userVal !== undefined) return userVal;
        const defVal = this._getDeep(this._defaults, key);
        if (defVal !== undefined) return defVal;
        return fallback;
    }

    /**
     * Définit une valeur et la persiste.
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
        this._setDeep(this._settings, key, value);
        this._save();
        if (this._eventBus) {
            this._eventBus.emit('settings:changed', { key, value });
        }
    }

    /**
     * Vérifie si une clé est définie par l'utilisateur (pas seulement un défaut).
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        return this._getDeep(this._settings, key) !== undefined;
    }

    /**
     * Supprime une valeur utilisateur (le défaut reprend le dessus).
     * @param {string} key
     */
    delete(key) {
        this._deleteDeep(this._settings, key);
        this._save();
        if (this._eventBus) {
            this._eventBus.emit('settings:changed', { key, value: undefined });
        }
    }

    /** Remet tous les settings à zéro (garde les defaults). */
    reset() {
        this._settings = {};
        this._save();
        this._log.warn('Settings réinitialisés.');
        if (this._eventBus) this._eventBus.emit('settings:reset');
    }

    /**
     * Exporte les settings utilisateur en JSON.
     * @returns {string}
     */
    export() {
        return JSON.stringify(this._settings, null, 2);
    }

    /**
     * Exporte les settings utilisateur en JSON en masquant les clés et mots de passe sensibles.
     * @returns {string}
     */
    exportSanitized() {
        const sanitized = JSON.parse(JSON.stringify(this._settings));
        const maskSecrets = (obj) => {
            for (const key of Object.keys(obj)) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    maskSecrets(obj[key]);
                } else if (typeof obj[key] === 'string') {
                    const lk = key.toLowerCase();
                    if (lk.includes('key') || lk.includes('password') || lk.includes('token') || lk.includes('secret')) {
                        obj[key] = obj[key].length > 6 ? `${obj[key].slice(0, 3)}****${obj[key].slice(-2)}` : '******';
                    }
                }
            }
        };
        maskSecrets(sanitized);
        return JSON.stringify(sanitized, null, 2);
    }

    /**
     * Importe des settings depuis un JSON (merge avec l'existant).
     * @param {string|Record<string,*>} data
     */
    import(data) {
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            this._settings = this._deepMerge(this._settings, parsed);
            this._save();
            this._log.info('Settings importés avec succès.');
            if (this._eventBus) this._eventBus.emit('settings:imported');
        } catch (err) {
            this._log.error('Erreur lors de l\'import des settings.', err);
        }
    }

    // ─── Helpers notation pointée ────────────────────────────────────────────────

    _getDeep(obj, key) {
        return key.split('.').reduce((cur, part) => cur?.[part], obj);
    }

    _setDeep(obj, key, value) {
        const parts = key.split('.');
        const last = parts.pop();
        const target = parts.reduce((cur, part) => {
            if (cur[part] === undefined || typeof cur[part] !== 'object') cur[part] = {};
            return cur[part];
        }, obj);
        target[last] = value;
    }

    _deleteDeep(obj, key) {
        const parts = key.split('.');
        const last = parts.pop();
        const target = parts.reduce((cur, part) => cur?.[part], obj);
        if (target) delete target[last];
    }

    _deepMerge(target, source) {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this._deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }
}

export default SettingsManager;
