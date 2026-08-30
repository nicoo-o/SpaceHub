/**
 * SpaceHub — Advanced Gamepad & Virtual Cursor Engine (v9.0)
 * Version: 2.0.0
 *
 * Moteur Manette Industriel :
 * - D-Pad & Stick Gauche (Navigation 2D avec deadzone 0.15).
 * - Stick Droit : Scroll fluide vertical ou Mode "Souris Virtuelle" (toggle via R3 / stick-click).
 * - Gâchettes L2 / R2 (Avance/retour rapide & switch d'onglets).
 * - Retour haptique / Vibrations (gamepad.vibrationActuator).
 * - Détection automatique de type de manette (Xbox, PlayStation DualSense, Nintendo Switch).
 * - Throttling & Auto-repeat intelligent.
 */

'use strict';

import Logger from './Logger.js';
import { NavAction } from './InputMapper.js';

export class GamepadInput {
    /**
     * @param {Object} options
     * @param {(action: string) => void} options.onAction
     */
    constructor({ onAction } = {}) {
        this._log = new Logger('GamepadInput');
        this._onAction = onAction || (() => {});
        this._isEnabled = true;
        this._rafId = null;
        this._deadzone = 0.18;
        this._initialDelay = 280;
        this._repeatInterval = 100;
        this._lastActionTime = 0;
        this._activeDirection = null;
        this._virtualMouseMode = false;
        this._virtualCursorX = window.innerWidth / 2;
        this._virtualCursorY = window.innerHeight / 2;
        this._cursorEl = null;

        this._buttonStates = new Map();
        this._boundLoop = this._pollLoop.bind(this);

        this._injectVirtualCursorStyles();
        this.enable();
        this._log.info('Moteur Gamepad Avancé v2.0 opérationnel.');
    }

    _injectVirtualCursorStyles() {
        if (document.getElementById('sh-virtual-cursor-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-virtual-cursor-styles';
        style.textContent = `
            .sh-virtual-cursor {
                position: fixed;
                width: 22px;
                height: 22px;
                border: 2px solid #ff9f0a;
                background: rgba(255, 159, 10, 0.4);
                box-shadow: 0 0 15px #ff9f0a, 0 4px 12px rgba(0,0,0,0.8);
                border-radius: 50%;
                pointer-events: none;
                z-index: 9999999;
                transform: translate(-50%, -50%);
                display: none;
                transition: transform 60ms linear;
            }
            .sh-virtual-cursor.visible {
                display: block;
            }
        `;
        document.head.appendChild(style);
    }

    enable() {
        this._isEnabled = true;
        if (!this._rafId) {
            this._rafId = requestAnimationFrame(this._boundLoop);
        }
    }

    disable() {
        this._isEnabled = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this._cursorEl) {
            this._cursorEl.classList.remove('visible');
        }
    }

    vibrate(duration = 80, strongMagnitude = 0.6, weakMagnitude = 0.3) {
        try {
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            const gp = Array.from(gamepads).find(g => g && g.connected);
            if (gp?.vibrationActuator) {
                gp.vibrationActuator.playEffect('dual-rumble', {
                    startDelay: 0,
                    duration: duration,
                    weakMagnitude: weakMagnitude,
                    strongMagnitude: strongMagnitude
                }).catch(() => {});
            } else if ('vibrate' in navigator) {
                navigator.vibrate(duration);
            }
        } catch (_) {}
    }

    _pollLoop() {
        if (!this._isEnabled) return;

        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = Array.from(gamepads).find(g => g && g.connected);

        if (gp) {
            this._processGamepad(gp);
        }

        this._rafId = requestAnimationFrame(this._boundLoop);
    }

    _processGamepad(gp) {
        const id = (gp.id || '').toLowerCase();
        const isNintendo = id.includes('nintendo') || id.includes('switch') || id.includes('joy-con');

        // 1. Boutons de navigation (D-Pad & Boutons principaux)
        const btnA = gp.buttons[isNintendo ? 1 : 0]?.pressed;
        const btnB = gp.buttons[isNintendo ? 0 : 1]?.pressed;
        const btnX = gp.buttons[2]?.pressed;
        const btnY = gp.buttons[3]?.pressed;
        const btnL1 = gp.buttons[4]?.pressed;
        const btnR1 = gp.buttons[5]?.pressed;
        const btnL2 = gp.buttons[6]?.pressed;
        const btnR2 = gp.buttons[7]?.pressed;
        const btnSelect = gp.buttons[8]?.pressed;
        const btnStart = gp.buttons[9]?.pressed;
        const btnR3 = gp.buttons[11]?.pressed; // Stick droit clic

        const dpadUp = gp.buttons[12]?.pressed;
        const dpadDown = gp.buttons[13]?.pressed;
        const dpadLeft = gp.buttons[14]?.pressed;
        const dpadRight = gp.buttons[15]?.pressed;

        // 2. Sticks analogiques
        const stickLeftX = gp.axes[0] || 0;
        const stickLeftY = gp.axes[1] || 0;
        const stickRightX = gp.axes[2] || 0;
        const stickRightY = gp.axes[3] || 0;

        // Toggle Mode Souris Virtuelle sur R3
        if (btnR3 && !this._buttonStates.get('btnR3')) {
            this._buttonStates.set('btnR3', true);
            this._virtualMouseMode = !this._virtualMouseMode;
            this.vibrate(120, 0.8, 0.4);
            this._ensureCursor();
            this._cursorEl.classList.toggle('visible', this._virtualMouseMode);
            window.SpaceHub?.ui?.components?.toaster?.info(
                this._virtualMouseMode ? '🖱️ Souris Virtuelle Manette Activée' : '📺 Mode Navigation TV Restauré'
            );
        } else if (!btnR3) {
            this._buttonStates.set('btnR3', false);
        }

        // Mode Souris Virtuelle
        if (this._virtualMouseMode) {
            if (Math.abs(stickRightX) > this._deadzone || Math.abs(stickRightY) > this._deadzone) {
                this._virtualCursorX = Math.max(10, Math.min(window.innerWidth - 10, this._virtualCursorX + stickRightX * 18));
                this._virtualCursorY = Math.max(10, Math.min(window.innerHeight - 10, this._virtualCursorY + stickRightY * 18));
                if (this._cursorEl) {
                    this._cursorEl.style.left = `${this._virtualCursorX}px`;
                    this._cursorEl.style.top = `${this._virtualCursorY}px`;
                }
            }

            if (btnA && !this._buttonStates.get('btnA')) {
                this._buttonStates.set('btnA', true);
                this.vibrate(40);
                const el = document.elementFromPoint(this._virtualCursorX, this._virtualCursorY);
                if (el) el.click();
            } else if (!btnA) {
                this._buttonStates.set('btnA', false);
            }
            return;
        }

        // Mode Scroll rapide au stick droit
        if (Math.abs(stickRightY) > this._deadzone) {
            window.scrollBy({ top: stickRightY * 24, behavior: 'auto' });
        }

        // Direction active (D-Pad prioritaire puis Stick Gauche)
        let direction = null;
        if (dpadUp || stickLeftY < -this._deadzone) direction = NavAction.UP;
        else if (dpadDown || stickLeftY > this._deadzone) direction = NavAction.DOWN;
        else if (dpadLeft || stickLeftX < -this._deadzone) direction = NavAction.LEFT;
        else if (dpadRight || stickLeftX > this._deadzone) direction = NavAction.RIGHT;

        const now = Date.now();

        if (direction) {
            if (this._activeDirection !== direction) {
                this._activeDirection = direction;
                this._lastActionTime = now;
                this.vibrate(10);
                this._onAction(direction);
            } else if (now - this._lastActionTime > this._initialDelay) {
                this._lastActionTime = now - (this._initialDelay - this._repeatInterval);
                this._onAction(direction);
            }
        } else {
            this._activeDirection = null;
        }

        // Actions bouton unique (A, B, X, Y, Start, Triggers)
        this._handleButtonPress('btnA', btnA, () => {
            this.vibrate(20);
            this._onAction(NavAction.SELECT);
        });

        this._handleButtonPress('btnB', btnB, () => {
            this.vibrate(15);
            this._onAction(NavAction.BACK);
        });

        this._handleButtonPress('btnStart', btnStart, () => {
            this.vibrate(20);
            this._onAction(NavAction.PLAY_PAUSE || 'play_pause');
        });

        this._handleButtonPress('btnSelect', btnSelect, () => {
            this.vibrate(25);
            this._onAction(NavAction.MENU);
        });

        this._handleButtonPress('btnX', btnX, () => {
            this.vibrate(15);
            this._onAction(NavAction.PLAY_PAUSE || 'play_pause');
        });

        this._handleButtonPress('btnL2', btnL2, () => {
            this.vibrate(20);
            this._onAction(NavAction.PAGE_UP);
        });

        this._handleButtonPress('btnR2', btnR2, () => {
            this.vibrate(20);
            this._onAction(NavAction.PAGE_DOWN);
        });
    }

    _handleButtonPress(key, isPressed, callback) {
        if (isPressed) {
            if (!this._buttonStates.get(key)) {
                this._buttonStates.set(key, true);
                callback();
            }
        } else {
            this._buttonStates.set(key, false);
        }
    }

    _ensureCursor() {
        if (document.getElementById('sh-virtual-cursor')) {
            this._cursorEl = document.getElementById('sh-virtual-cursor');
            return;
        }
        const cursor = document.createElement('div');
        cursor.id = 'sh-virtual-cursor';
        cursor.className = 'sh-virtual-cursor';
        document.body.appendChild(cursor);
        this._cursorEl = cursor;
    }

    destroy() {
        this.disable();
        if (this._cursorEl) this._cursorEl.remove();
    }
}

export default GamepadInput;
