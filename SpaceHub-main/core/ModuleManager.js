/**
 * SpaceHub — ModuleManager
 * Version: 1.0.0
 *
 * Gestion du cycle de vie des modules SpaceHub.
 * Chaque module est enregistré avec ses dépendances et chargé dans le bon ordre.
 * Détecte les dépendances circulaires et supporte les dépendances optionnelles.
 */

'use strict';

import Logger from './Logger.js';

/**
 * @typedef {Object} ModuleConfig
 * @property {string} id                        - Identifiant unique du module
 * @property {string} [name]                    - Nom lisible (pour les logs)
 * @property {string[]} [dependencies]          - IDs des modules dont ce module dépend strictement
 * @property {string[]} [optionalDependencies]  - IDs des modules optionnels
 * @property {boolean} [enabled=true]           - Si false, le module est ignoré
 * @property {Function} [init]                  - Fonction async d'initialisation → retourne l'instance
 * @property {Function} [destroy]               - Fonction async de destruction (reçoit l'instance)
 */

/**
 * @typedef {'registered'|'loading'|'loaded'|'error'|'unloaded'|'disabled'} ModuleStatus
 */

class ModuleManager {
    constructor(eventBus = null, settings = null) {
        /** @type {Map<string, { config: ModuleConfig, instance: *, status: ModuleStatus, error: Error|null }>} */
        this.modules = new Map();
        this._eventBus = eventBus;
        this._settings = settings;
        this._log = new Logger('ModuleManager');
    }

    // ─── Enregistrement ──────────────────────────────────────────────────────────

    /**
     * Enregistre un module. N'effectue pas encore l'initialisation.
     * @param {ModuleConfig} config
     */
    register(config) {
        if (!config.id) {
            this._log.error('Un module doit avoir un "id".');
            return;
        }
        if (this.modules.has(config.id)) {
            this._log.warn(`Module "${config.id}" déjà enregistré. Ignoré.`);
            return;
        }

        const status = config.enabled === false ? 'disabled' : 'registered';
        this.modules.set(config.id, { config, instance: null, status, error: null });
        this._log.debug(`Module enregistré : "${config.id}" (${status})`);
    }

    // ─── Chargement ──────────────────────────────────────────────────────────────

    /**
     * Charge un module et ses dépendances récursivement avec détection de cycles.
     * @param {string} moduleId
     * @param {Set<string>} [loadingStack=new Set()]
     * @returns {Promise<*>} L'instance du module
     */
    async load(moduleId, loadingStack = new Set()) {
        const entry = this.modules.get(moduleId);

        if (!entry) {
            throw new Error(`Module "${moduleId}" non trouvé. Enregistrez-le d'abord.`);
        }

        if (entry.status === 'disabled') {
            this._log.debug(`Module "${moduleId}" désactivé, chargement ignoré.`);
            return null;
        }

        if (entry.status === 'loaded') {
            return entry.instance;
        }

        if (loadingStack.has(moduleId)) {
            const chain = Array.from(loadingStack).concat(moduleId).join(' ➔ ');
            const err = new Error(`Dépendance circulaire détectée : ${chain}`);
            this._log.error(err.message);
            throw err;
        }

        if (entry.status === 'loading') {
            return this._waitForLoad(moduleId);
        }

        if (entry.status === 'error') {
            throw new Error(`Module "${moduleId}" en erreur : ${entry.error?.message}`);
        }

        loadingStack.add(moduleId);
        entry.status = 'loading';

        // 1. Dépendances strictes requises
        for (const depId of entry.config.dependencies || []) {
            if (!this.modules.has(depId)) {
                this._log.warn(`Dépendance requise "${depId}" de "${moduleId}" non trouvée. Échec.`);
                entry.status = 'error';
                entry.error = new Error(`Dépendance requise manquante : "${depId}"`);
                loadingStack.delete(moduleId);
                throw entry.error;
            }
            await this.load(depId, new Set(loadingStack));
        }

        // 2. Dépendances optionnelles
        for (const optDepId of entry.config.optionalDependencies || []) {
            if (this.modules.has(optDepId)) {
                try {
                    await this.load(optDepId, new Set(loadingStack));
                } catch (e) {
                    this._log.warn(`Dépendance optionnelle "${optDepId}" ignorée pour "${moduleId}".`);
                }
            }
        }

        // 3. Initialiser le module
        try {
            this._log.info(`Chargement de "${entry.config.name || moduleId}"...`);
            entry.instance = entry.config.init ? await entry.config.init() : {};
            entry.status   = 'loaded';
            loadingStack.delete(moduleId);
            this._log.info(`✅ Module "${entry.config.name || moduleId}" chargé.`);

            if (this._eventBus) {
                this._eventBus.emit(`module:loaded:${moduleId}`, entry.instance);
            }
        } catch (err) {
            entry.status = 'error';
            entry.error  = err;
            loadingStack.delete(moduleId);
            this._log.error(`❌ Échec du chargement de "${moduleId}":`, err);
            if (this._eventBus) {
                this._eventBus.emit(`module:error:${moduleId}`, err);
            }
            throw err;
        }

        return entry.instance;
    }

    /**
     * Charge tous les modules enregistrés.
     */
    async loadAll() {
        this._log.info(`Chargement de ${this.modules.size} modules...`);
        for (const [id] of this.modules) {
            try {
                await this.load(id);
            } catch {
                this._log.warn(`Module "${id}" ignoré suite à une erreur.`);
            }
        }
        this._log.info('Tous les modules ont été traités.');
    }

    // ─── Déchargement ────────────────────────────────────────────────────────────

    /**
     * Décharge un module et appelle sa fonction destroy si définie.
     * @param {string} moduleId
     */
    async unload(moduleId) {
        const entry = this.modules.get(moduleId);
        if (!entry || entry.status !== 'loaded') return;

        try {
            if (entry.config.destroy) {
                await entry.config.destroy(entry.instance);
            }
            entry.instance = null;
            entry.status   = 'unloaded';
            this._log.info(`Module "${moduleId}" déchargé.`);

            if (this._eventBus) {
                this._eventBus.emit(`module:unloaded:${moduleId}`);
            }
        } catch (err) {
            this._log.error(`Erreur lors du déchargement de "${moduleId}":`, err);
        }
    }

    // ─── Statut ──────────────────────────────────────────────────────────────────

    /**
     * Retourne l'instance d'un module chargé.
     * @param {string} moduleId
     * @returns {*}
     */
    get(moduleId) {
        return this.modules.get(moduleId)?.instance ?? null;
    }

    /**
     * @param {string} moduleId
     * @returns {ModuleStatus|null}
     */
    getStatus(moduleId) {
        return this.modules.get(moduleId)?.status ?? null;
    }

    /** Retourne un résumé de tous les modules. */
    getSummary() {
        return [...this.modules.entries()].map(([id, entry]) => ({
            id,
            name: entry.config.name || id,
            status: entry.status,
            dependencies: entry.config.dependencies || [],
            optionalDependencies: entry.config.optionalDependencies || []
        }));
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    _waitForLoad(moduleId, interval = 50, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                const entry = this.modules.get(moduleId);
                if (entry.status === 'loaded')  return resolve(entry.instance);
                if (entry.status === 'error')   return reject(entry.error);
                if (Date.now() - start > timeout) return reject(new Error(`Timeout attente module "${moduleId}"`));
                setTimeout(check, interval);
            };
            setTimeout(check, interval);
        });
    }
}

export default ModuleManager;
