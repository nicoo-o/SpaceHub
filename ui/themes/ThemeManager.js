/**
 * SpaceHub — ThemeManager
 * Version: 1.0.0
 *
 * Gestion dynamique des thèmes CSS.
 * Charge les tokens de base, applique les presets, et réagit aux changements
 * de settings via l'EventBus.
 *
 * Usage:
 *   await SpaceHub.ui.themes.apply('tokyo-night');
 *   SpaceHub.ui.themes.getAvailable();  // → liste des thèmes
 *   SpaceHub.ui.themes.getCurrent();    // → ID du thème actif
 */

'use strict';

import Logger        from '../../core/Logger.js';
import PRESETS, { getPreset } from './presets/index.js';

import * as svc from '../../core/services.js';
const SETTINGS_KEY    = 'ui.theme';
const STYLE_ELEMENT_ID = 'sh-theme-vars';

class ThemeManager {
    /**
     * @param {import('../../core/SettingsManager.js').default} settings
     * @param {import('../../core/EventBus.js').default} eventBus
     */
    constructor(settings = null, eventBus = null) {
        this._log      = new Logger('ThemeManager');
        this._settings = settings;
        this._eventBus = eventBus;
                this._current  = null;
        this._styleEl  = null;
        this._customThemes = [];

        // Écouter les changements de thème via settings.
        // Garde essentielle : apply() lui-même appelle settings.set(), qui réémet
        // "settings:changed" — sans ce filtre sur la valeur déjà active, on boucle
        // indéfiniment (apply → settings:changed → apply → ...) jusqu'à RangeError
        // "Maximum call stack size exceeded" dès qu'on choisit un thème dans Réglages.
        if (this._eventBus) {
            this._eventBus.on('settings:changed', ({ key, value }) => {
                if (key === SETTINGS_KEY && value !== this._current) this.apply(value);
            });
        }
    }

    // ─── API Publique ────────────────────────────────────────────────────────────

    /**
     * Initialise le ThemeManager et applique le thème sauvegardé.
     */
    async init() {
        await this._injectTokensCSS();
        const savedTheme = this._settings?.get(SETTINGS_KEY, 'spacehub-dark') ?? 'spacehub-dark';
        this.apply(savedTheme);
        this._log.info(`ThemeManager prêt. Thème actif : "${this._current}".`);
    }

    /**
     * Applique un thème par son ID.
     * @param {string} themeId
     * @returns {boolean} true si le thème a été trouvé et appliqué
     */
        /**
     * Enregistre un thème personnalisé dans le catalogue.
     * @param {{ id: string, name: string, icon?: string, emoji?: string, variables: Record<string, string> }} theme
     * @returns {boolean}
     */
    register(theme) {
        if (!theme || !theme.id || !theme.variables) {
            this._log.error('Un thème valide requiert un id et des variables CSS.');
            return false;
        }

        const idx = this._customThemes.findIndex(t => t.id === theme.id);
        const entry = {
            id: theme.id,
            name: theme.name || theme.id,
            icon: theme.icon || theme.emoji || '🌟',
            variables: theme.variables
        };

        if (idx >= 0) {
            this._customThemes[idx] = entry;
        } else {
            this._customThemes.push(entry);
        }

        this._log.info(`Thème personnalisé enregistré : "${entry.name}"`);
        this._eventBus?.emit('theme:registered', entry);
        return true;
    }

    /**
     * Retire un thème personnalisé sans toucher aux presets.
     */
    unregister(themeId) {
        const index = this._customThemes.findIndex(theme => theme.id === themeId);
        if (index < 0) return false;
        if (this._current === themeId) this.apply('spacehub-dark');
        this._customThemes.splice(index, 1);
        this._eventBus?.emit('theme:unregistered', { id: themeId });
        return true;
    }

    /**
     * Applique un thème par son ID (recherche dans les presets et thèmes personnalisés).
     * @param {string} themeId
     * @returns {boolean}
     */
    apply(themeId) {
        let preset = getPreset(themeId);
        if (!preset) {
            preset = this._customThemes.find(t => t.id === themeId);
        }

        if (!preset) {
            this._log.warn(`Thème "${themeId}" introuvable.`);
            return false;
        }

        this._applyVariables(preset.variables);
        this._current = themeId;

        document.documentElement.setAttribute('data-sh-theme', themeId);
        this._settings?.set(SETTINGS_KEY, themeId);

        if (this._eventBus) {
            this._eventBus.emit('theme:changed', { id: themeId, name: preset.name });
        }

        this._log.info(`Thème appliqué : "${preset.name}"`);
        return true;
    }

    /**
     * Retourne l'ID du thème actuellement actif.
     * @returns {string|null}
     */
    getCurrent() { return this._current; }

    /**
     * Retourne la liste de tous les thèmes disponibles.
     * @returns {Array<{ id: string, name: string, icon: string }>}
     */
    getAvailable() {
        const presetThemes = PRESETS.map(({ id, name, icon }) => ({ id, name, icon }));
        const customThemes = this._customThemes.map(({ id, name, icon }) => ({ id, name, icon }));
        return [...presetThemes, ...customThemes];
    }

    /**
     * Bascule vers le thème suivant dans la liste (utile pour un bouton de cycle).
     */
    next() {
        const ids   = this.getAvailable().map(p => p.id);
        const index = ids.indexOf(this._current ?? 'spacehub-dark');
        this.apply(ids[(index + 1) % ids.length]);
    }

    /**
     * Injecte une variable CSS personnalisée directement (override ponctuel).
     * @param {string} varName  - ex: '--sh-color-primary'
     * @param {string} value
     */
    setVar(varName, value) {
        document.documentElement.style.setProperty(varName, value);
    }

    /**
     * Remet une variable CSS à sa valeur du thème courant.
     * @param {string} varName
     */
    resetVar(varName) {
        const preset = getPreset(this._current);
        const val    = preset?.variables?.[varName];
        if (val) {
            document.documentElement.style.setProperty(varName, val);
        } else {
            document.documentElement.style.removeProperty(varName);
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    _applyVariables(variables = {}) {
        // Retire les surcharges précédentes
        if (this._styleEl) this._styleEl.remove();

        if (Object.keys(variables).length === 0) {
            // Thème par défaut : pas de surcharges
            this._styleEl = null;
            return;
        }

        const css = `:root {\n${Object.entries(variables)
            .map(([k, v]) => `    ${k}: ${v};`)
            .join('\n')}\n}`;

        this._styleEl = document.createElement('style');
        this._styleEl.id          = STYLE_ELEMENT_ID;
        this._styleEl.textContent = css;
        document.head.appendChild(this._styleEl);
    }

    /**
     * Injecte le fichier tokens.css dans <head> si ce n'est pas déjà fait.
     * En production, ce fichier est servi via le CDN SpaceHub.
     */
    async _injectTokensCSS() {
        if (document.getElementById('sh-tokens-css')) return;

        // Tentative via le CDN / chemin relatif
        const root = svc.config()?.root || '';

        return new Promise((resolve) => {
            if (!root) {
                // Injection inline des tokens essentiels (fallback)
                this._log.warn('Aucune racine CDN configurée. Tokens injectés inline (mode dev).');
                const style = document.createElement('style');
                style.id = 'sh-tokens-css';
                style.textContent = `/* SpaceHub tokens — mode dev — rechargez avec une URL CDN */`;
                document.head.appendChild(style);
                return resolve();
            }

            const link = document.createElement('link');
            link.id   = 'sh-tokens-css';
            link.rel  = 'stylesheet';
            link.href = `${root}design-system/tokens.css`;
            link.onload  = resolve;
            link.onerror = () => {
                this._log.error(`Impossible de charger tokens.css depuis : ${link.href}`);
                resolve();
            };
            document.head.appendChild(link);
        });
    }
}

export default ThemeManager;
