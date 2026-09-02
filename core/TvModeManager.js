/**
 * SpaceHub — TV Mode Manager
 * Version: 1.0.0
 *
 * Mode TV (télécommande / manette) :
 * - Réglage `ui.tvMode` : 'auto' (défaut) | 'on' | 'off'
 *   - 'auto' : activé dès qu'une manette/télécommande (gamepad) se connecte,
 *     désactivé quand toutes se déconnectent.
 *   - 'on'   : toujours actif.
 *   - 'off'  : jamais actif.
 * - En mode actif : classe `sh-tv-mode` sur <html> → curseur souris masqué
 *   partout. Le curseur réapparaît brièvement lors d'un mouvement de souris
 *   (2,5 s) puis se re-cache automatiquement (comportement TV standard).
 */

'use strict';

import Logger from './Logger.js';

import './TvModeManager.css';
const CURSOR_REVEAL_DELAY = 2500;

class TvModeManager {
    /**
     * @param {Object} options
     * @param {import('./SettingsManager.js').default} [options.settings]
     * @param {import('./EventBus.js').default} [options.eventBus]
     */
    constructor({ settings, eventBus } = {}) {
        this._log = new Logger('TvMode');
        this._settings = settings || null;
        this._eventBus = eventBus || null;
        this._active = false;
        this._gamepadCount = 0;
        this._cursorRevealTimer = null;
        this._offSettingsChanged = null;

        this._onGamepadConnected = this._onGamepadConnected.bind(this);
        this._onGamepadDisconnected = this._onGamepadDisconnected.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
    }

    init() {
        this._injectStyles();

        window.addEventListener('gamepadconnected', this._onGamepadConnected);
        window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);
        document.addEventListener('pointermove', this._onPointerMove, { passive: true });

        // Manettes déjà connectées avant l'initialisation (aucun event ne sera émis pour elles)
        try {
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            this._gamepadCount = Array.from(pads).filter(p => p && p.connected).length;
        } catch (_) { /* API non supportée */ }

        this._offSettingsChanged = this._eventBus?.on('settings:changed', ({ key } = {}) => {
            if (key === 'ui.tvMode') this._applyMode();
            if (key === 'ui.tvScale' || key === 'ui.tvSafeArea') this._applyTvVariables();
        });

        this._applyMode();
        this._applyTvVariables();
        this._log.info(`TvMode initialisé (réglage: ${this._getMode()}, actif: ${this._active}).`);
    }

    destroy() {
        window.removeEventListener('gamepadconnected', this._onGamepadConnected);
        window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
        document.removeEventListener('pointermove', this._onPointerMove);
        this._offSettingsChanged?.();
        if (this._cursorRevealTimer) {
            clearTimeout(this._cursorRevealTimer);
            this._cursorRevealTimer = null;
        }
        this._setActive(false);
    }

    /** Mode demandé : 'auto' | 'on' | 'off' */
    _getMode() {
        return this._settings?.get('ui.tvMode', 'auto') || 'auto';
    }

    /** Change le mode ('auto' | 'on' | 'off') via les réglages — réaction en direct via l'event bus. */
    setMode(mode) {
        if (!['auto', 'on', 'off'].includes(mode)) return;
        this._settings?.set('ui.tvMode', mode);
    }

    _applyMode() {
        const mode = this._getMode();
        const shouldBeActive = mode === 'on' || (mode === 'auto' && this._gamepadCount > 0);
        this._setActive(shouldBeActive);
    }

    /**
     * Applique l'échelle et la zone de sûreté choisies par l'utilisateur.
     *
     * Ces deux valeurs sont réglables parce qu'elles dépendent du matériel :
     * la distance de vision varie d'un salon à l'autre, et le rognage des bords
     * varie d'un téléviseur à l'autre. Une valeur unique en dur ne peut pas
     * convenir partout — mais elle n'a aucun effet hors mode TV.
     */
    _applyTvVariables() {
        const root = document.documentElement;
        if (!this._active) {
            root.style.removeProperty('--sh-tv-scale');
            root.style.removeProperty('--sh-safe-top');
            root.style.removeProperty('--sh-safe-right');
            root.style.removeProperty('--sh-safe-bottom');
            root.style.removeProperty('--sh-safe-left');
            return;
        }
        const echelle = Number(this._settings?.get('ui.tvScale', 1.15)) || 1.15;
        const marge   = Number(this._settings?.get('ui.tvSafeArea', 3.5));
        const sur     = Number.isFinite(marge) ? Math.min(Math.max(marge, 0), 10) : 3.5;
        root.style.setProperty('--sh-tv-scale', String(Math.min(Math.max(echelle, 1), 1.6)));
        root.style.setProperty('--sh-safe-top', `${sur}vh`);
        root.style.setProperty('--sh-safe-bottom', `${sur}vh`);
        root.style.setProperty('--sh-safe-right', `${sur}vw`);
        root.style.setProperty('--sh-safe-left', `${sur}vw`);
    }

    _setActive(active) {
        if (this._active === active) return;
        this._active = active;
        document.documentElement.classList.toggle('sh-tv-mode', active);
        this._applyTvVariables();
        if (!active && this._cursorRevealTimer) {
            clearTimeout(this._cursorRevealTimer);
            this._cursorRevealTimer = null;
            document.documentElement.classList.remove('sh-tv-cursor-reveal');
        }
        this._log.info(active ? 'Mode TV activé — curseur souris masqué.' : 'Mode TV désactivé.');
        this._eventBus?.emit('tvmode:changed', { active });
    }

    _onGamepadConnected(event) {
        this._gamepadCount += 1;
        this._log.info(`Manette/télécommande connectée : ${event?.gamepad?.id || 'inconnue'} (${this._gamepadCount}).`);
        if (this._getMode() === 'auto') this._applyMode();
    }

    _onGamepadDisconnected(event) {
        this._gamepadCount = Math.max(0, this._gamepadCount - 1);
        if (this._getMode() === 'auto') this._applyMode();
    }

    _onPointerMove() {
        if (!this._active) return;
        // Le curseur réapparaît brièvement au mouvement de la souris, puis se re-cache.
        document.documentElement.classList.add('sh-tv-cursor-reveal');
        if (this._cursorRevealTimer) clearTimeout(this._cursorRevealTimer);
        this._cursorRevealTimer = setTimeout(() => {
            document.documentElement.classList.remove('sh-tv-cursor-reveal');
            this._cursorRevealTimer = null;
        }, CURSOR_REVEAL_DELAY);
    }

    /** Le mode TV est-il actif ? (utile pour les composants et les tests) */
    isActive() { return this._active; }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans TvModeManager.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default TvModeManager;
