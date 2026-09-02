/**
 * SpaceHub — Registre de services (injection de dépendances)
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'application accède à ses services par la variable globale `window.SpaceHub`
 * (`window.SpaceHub?.ui?.themes`, `window.SpaceHub?.jellyfin?.api`, ...). Chaque
 * `?.` masque une dépendance non déclarée qui échoue silencieusement, rend
 * l'ordre d'initialisation critique, et empêche de tester un composant isolément.
 *
 * Stratégie retenue : **additive, sans rupture**.
 * Le registre devient la source de vérité, et `window.SpaceHub` reste exposé en
 * façade au-dessus de lui. Rien de ce qui existe ne casse ; les composants
 * peuvent migrer un par un vers `resolve()` / l'injection par constructeur.
 *
 * Trois usages :
 *
 *   // 1. Enregistrer (au démarrage)
 *   registry.register('jellyfin.api', apiInstance);
 *   registry.registerLazy('player', () => new VideoPlayer(registry));
 *
 *   // 2. Résoudre, avec échec explicite plutôt que silencieux
 *   const api = registry.resolve('jellyfin.api');       // lève si absent
 *   const api = registry.optional('jellyfin.api');      // null si absent
 *
 *   // 3. Attendre un service pas encore prêt (init asynchrone)
 *   const player = await registry.whenReady('player');
 */

'use strict';

import Logger from './Logger.js';

export class ServiceRegistry {
    constructor({ logger = null } = {}) {
        this._log = logger || new Logger('ServiceRegistry');
        this._services = new Map();
        this._factories = new Map();
        this._waiters = new Map();
    }

    /** Enregistre une instance déjà construite. */
    register(name, instance, { override = false } = {}) {
        if (this._services.has(name) && !override) {
            this._log.warn(`Service « ${name} » déjà enregistré — enregistrement ignoré (passez override: true si c'est voulu).`);
            return this._services.get(name);
        }
        this._services.set(name, instance);
        const waiters = this._waiters.get(name);
        if (waiters) {
            waiters.forEach(resolve => resolve(instance));
            this._waiters.delete(name);
        }
        return instance;
    }

    /** Enregistre une fabrique : le service n'est construit qu'au premier resolve(). */
    registerLazy(name, factory) {
        if (typeof factory !== 'function') throw new TypeError(`Fabrique invalide pour « ${name} »`);
        this._factories.set(name, factory);
    }

    has(name) {
        return this._services.has(name) || this._factories.has(name);
    }

    /**
     * Résout un service. Lève si absent — c'est volontaire : une dépendance
     * manquante doit être bruyante, pas silencieuse comme avec `?.`.
     */
    resolve(name) {
        if (this._services.has(name)) return this._services.get(name);
        if (this._factories.has(name)) {
            const instance = this._factories.get(name)(this);
            this._factories.delete(name);
            return this.register(name, instance);
        }
        throw new Error(
            `Service « ${name} » introuvable. Services disponibles : ${[...this._services.keys()].sort().join(', ') || 'aucun'}.`
        );
    }

    /** Comme resolve(), mais retourne null au lieu de lever. */
    optional(name) {
        try { return this.resolve(name); } catch { return null; }
    }

    /** Attend qu'un service soit enregistré (utile pendant l'initialisation). */
    whenReady(name, { timeout = 10000 } = {}) {
        if (this.has(name)) return Promise.resolve(this.resolve(name));
        return new Promise((resolve, reject) => {
            if (!this._waiters.has(name)) this._waiters.set(name, []);
            this._waiters.get(name).push(resolve);
            if (timeout > 0) {
                setTimeout(() => reject(new Error(`Service « ${name} » toujours absent après ${timeout} ms.`)), timeout);
            }
        });
    }

    /** Liste des services enregistrés — utile pour diagnostiquer un démarrage. */
    list() {
        return {
            prets: [...this._services.keys()].sort(),
            differes: [...this._factories.keys()].sort(),
            attendus: [...this._waiters.keys()].sort(),
        };
    }

    /**
     * Expose le registre derrière l'objet global historique, sans rien casser.
     * Les chemins existants (`window.SpaceHub.jellyfin.api`) continuent de
     * fonctionner ; les nouveaux composants peuvent utiliser le registre.
     */
    bindGlobalFacade(globalObject = window) {
        if (!globalObject) return;
        const sh = globalObject.SpaceHub || (globalObject.SpaceHub = {});
        sh.services = this;
        // Raccourci de diagnostic : SpaceHub.services.list() dans la console
        // dit immédiatement ce qui est prêt et ce qui manque au démarrage.
        return sh;
    }
}

export default ServiceRegistry;
