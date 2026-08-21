/**
 * SpaceHub — Secure Plugin Sandbox & Permission Guard (Horizon 8++)
 * Version: 1.0.0
 *
 * Exécution sécurisée et isolée des scripts tiers :
 * - Empêche l'accès direct aux variables sensibles (tokens d'authentification)
 * - Expose une API restreinte basée sur les permissions déclarées par le plugin
 */

'use strict';

import Logger from '../Logger.js';

class PluginSandbox {
    constructor() {
        this._log = new Logger('PluginSandbox');
    }

    /**
     * Crée un contexte d'exécution restreint pour un plugin.
     * @param {Object} manifest - Métadonnées du plugin (id, name, permissions)
     * @returns {Object} API sécurisée accessible par le plugin
     */
    createSandboxAPI(manifest) {
        const perms = new Set(manifest.permissions || []);

        return {
            id: manifest.id,
            name: manifest.name,

            // Accès aux composants UI
            ui: perms.has('ui') ? {
                showToast: (msg, type = 'info') => window.SpaceHub?.ui?.components?.toaster?.[type]?.(msg),
                registerHook: (point, handler) => window.SpaceHub?.hooks?.register(point, manifest.id, handler)
            } : null,

            // Accès aux événements
            events: perms.has('events') ? {
                on: (event, cb) => window.SpaceHub?.core?.eventBus?.on(event, cb),
                emit: (event, data) => window.SpaceHub?.core?.eventBus?.emit(event, data)
            } : null,

            // Accès au stockage local isolé
            storage: perms.has('storage') ? {
                get: (k) => localStorage.getItem(`sh_ext_${manifest.id}_${k}`),
                set: (k, v) => localStorage.setItem(`sh_ext_${manifest.id}_${k}`, v)
            } : null
        };
    }
}

export default PluginSandbox;
