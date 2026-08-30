/**
 * SpaceHub — GamepadInput (Grand Cinema Edition v8.0)
 * Module de gestion des manettes de jeu et contrôleurs avec polling optimisé et throttling intelligent.
 */

'use strict';

import { NavAction } from './InputMapper.js';

export class GamepadInput {
    /**
     * @param {Object} [options]
     * @param {Function} [options.onAction] Callback invoqué lors d'une action gamepad
     */
    constructor({ onAction = null } = {}) {
        this._onAction = onAction;
        this._isEnabled = true;
        this._rafId = null;
        this._connectedGamepads = new Set();
        
        // État des boutons pour le système de répétition intelligente (Repeat / Throttling)
        this._buttonTimestamps = new Map();
        this._initialDelay = 300; // ms avant première répétition
        this._repeatInterval = 110; // ms entre chaque répétition

        this._boundConnect = this._handleConnect.bind(this);
        this._boundDisconnect = this._handleDisconnect.bind(this);
        this._boundPoll = this._pollLoop.bind(this);

        this._bindEvents();
    }

    _bindEvents() {
        window.addEventListener('gamepadconnected', this._boundConnect);
        window.addEventListener('gamepaddisconnected', this._boundDisconnect);
    }

    _unbindEvents() {
        window.removeEventListener('gamepadconnected', this._boundConnect);
        window.removeEventListener('gamepaddisconnected', this._boundDisconnect);
    }

    _handleConnect(e) {
        if (!e.gamepad) return;
        this._connectedGamepads.add(e.gamepad.index);
        console.log(`[GamepadInput] Manette connectée (${e.gamepad.index}): ${e.gamepad.id}`);
        this._startPolling();
    }

    _handleDisconnect(e) {
        if (!e.gamepad) return;
        this._connectedGamepads.delete(e.gamepad.index);
        console.log(`[GamepadInput] Manette déconnectée (${e.gamepad.index})`);
        if (this._connectedGamepads.size === 0) {
            this._stopPolling();
        }
    }

    _startPolling() {
        if (this._rafId !== null) return;
        this._rafId = requestAnimationFrame(this._boundPoll);
    }

    _stopPolling() {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._buttonTimestamps.clear();
    }

    _pollLoop() {
        if (!this._isEnabled || this._connectedGamepads.size === 0) {
            this._rafId = null;
            return;
        }

        const gamepads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
        const now = performance.now();

        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (!gp || !gp.connected) continue;

            // 1. Boutons standard (D-Pad & Actions)
            // Bouton 12: D-Pad Haut / Bouton 13: D-Pad Bas / Bouton 14: D-Pad Gauche / Bouton 15: D-Pad Droite
            // Bouton 0: A (Select) / Bouton 1: B (Back) / Bouton 9: Start / Bouton 8: Select
            const buttons = gp.buttons;
            const axes = gp.axes;

            let currentAction = null;

            // D-Pad ou Stick Gauche Haut
            if ((buttons[12] && buttons[12].pressed) || (axes[1] && axes[1] < -0.55)) {
                currentAction = NavAction.UP;
            }
            // D-Pad ou Stick Gauche Bas
            else if ((buttons[13] && buttons[13].pressed) || (axes[1] && axes[1] > 0.55)) {
                currentAction = NavAction.DOWN;
            }
            // D-Pad ou Stick Gauche Gauche
            else if ((buttons[14] && buttons[14].pressed) || (axes[0] && axes[0] < -0.55)) {
                currentAction = NavAction.LEFT;
            }
            // D-Pad ou Stick Gauche Droite
            else if ((buttons[15] && buttons[15].pressed) || (axes[0] && axes[0] > 0.55)) {
                currentAction = NavAction.RIGHT;
            }
            // Bouton A / Croix (Sélection)
            else if (buttons[0] && buttons[0].pressed) {
                currentAction = NavAction.SELECT;
            }
            // Bouton B / Cercle ou Bouton Retour (Back)
            else if ((buttons[1] && buttons[1].pressed) || (buttons[8] && buttons[8].pressed)) {
                currentAction = NavAction.BACK;
            }

            if (currentAction) {
                this._processActionWithThrottle(currentAction, now);
            } else {
                this._buttonTimestamps.clear();
            }
        }

        this._rafId = requestAnimationFrame(this._boundPoll);
    }

    _processActionWithThrottle(action, now) {
        const lastPress = this._buttonTimestamps.get(action);

        if (!lastPress) {
            // Premier appui immédiat
            this._buttonTimestamps.set(action, { firstTime: now, lastTime: now });
            this._dispatchAction(action);
        } else {
            const timeSinceFirst = now - lastPress.firstTime;
            const timeSinceLast = now - lastPress.lastTime;

            // Si le bouton est maintenu au-delà du délai initial (300ms), répéter à intervalle régulier (110ms)
            if (timeSinceFirst >= this._initialDelay && timeSinceLast >= this._repeatInterval) {
                lastPress.lastTime = now;
                this._dispatchAction(action);
            }
        }
    }

    _dispatchAction(action) {
        if (typeof this._onAction === 'function') {
            this._onAction(action);
        } else {
            window.dispatchEvent(new CustomEvent('spacehub:gamepad-action', { detail: { action } }));
        }
    }

    enable() {
        this._isEnabled = true;
        if (this._connectedGamepads.size > 0) this._startPolling();
    }

    disable() {
        this._isEnabled = false;
        this._stopPolling();
    }

    destroy() {
        this.disable();
        this._unbindEvents();
        this._connectedGamepads.clear();
    }
}

export default GamepadInput;
