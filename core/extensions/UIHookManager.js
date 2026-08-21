/**
 * SpaceHub — UI Hook Manager (Plugin SDK 2.0)
 * Version: 2.0.0
 *
 * Gestionnaire de points d'injection UI déclaratifs.
 * Permet aux plugins d'injecter des boutons, onglets, contrôles et widgets
 * à des emplacements précis de l'interface sans modifier le code source de base.
 */

'use strict';

import Logger from '../Logger.js';

class UIHookManager {
    constructor() {
        this._log = new Logger('UIHookManager');
        this._hooks = new Map();
    }

    /**
     * Enregistre un hook UI pour un point d'injection précis.
     * @param {string} hookPoint - 'media:card:actions', 'media:modal:actions', 'player:controls', 'nav:item', 'dashboard:widget'
     * @param {Object} hookDefinition - { id, extensionId, render: (context) => HTMLElement|string, order?: number }
     */
    registerHook(hookPoint, hookDefinition) {
        if (!this._hooks.has(hookPoint)) {
            this._hooks.set(hookPoint, []);
        }

        const list = this._hooks.get(hookPoint);
        list.push({
            id: hookDefinition.id || `hook_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            extensionId: hookDefinition.extensionId || 'unknown',
            render: hookDefinition.render,
            order: hookDefinition.order || 10
        });

        // Trier par ordre de priorité
        list.sort((a, b) => a.order - b.order);
        this._log.info(`Hook enregistré sur "${hookPoint}" par extension "${hookDefinition.extensionId}"`);
    }

    /**
     * Supprime tous les hooks d'une extension spécifique (ex: lors de la désactivation).
     * @param {string} extensionId
     */
    unregisterExtensionHooks(extensionId) {
        for (const [point, list] of this._hooks.entries()) {
            this._hooks.set(point, list.filter(h => h.extensionId !== extensionId));
        }
        this._log.info(`Hooks supprimés pour l'extension: ${extensionId}`);
    }

    /**
     * Exécute et retourne le rendu de tous les hooks pour un point d'injection donné.
     * @param {string} hookPoint
     * @param {Object} context - Contexte transmis aux hooks (ex: item, player, user)
     * @param {HTMLElement} [container] - Conteneur DOM optionnel où injecter directement
     * @returns {Array<HTMLElement|string>}
     */
    renderHooks(hookPoint, context, container = null) {
        const hooks = this._hooks.get(hookPoint) || [];
        const results = [];

        for (const hook of hooks) {
            try {
                const rendered = hook.render(context);
                if (rendered) {
                    results.push(rendered);
                    if (container) {
                        if (typeof rendered === 'string') {
                            container.insertAdjacentHTML('beforeend', rendered);
                        } else if (rendered instanceof HTMLElement) {
                            container.appendChild(rendered);
                        }
                    }
                }
            } catch (err) {
                this._log.error(`Erreur exécution hook ${hook.id} sur ${hookPoint}:`, err);
            }
        }

        return results;
    }

    /**
     * Retourne la liste de tous les hooks actifs par point d'injection.
     * @returns {Object}
     */
    getActiveHooks() {
        const out = {};
        for (const [k, v] of this._hooks.entries()) {
            out[k] = v.map(h => ({ id: h.id, extensionId: h.extensionId, order: h.order }));
        }
        return out;
    }
}

export default UIHookManager;
