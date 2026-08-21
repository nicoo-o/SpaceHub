/**
 * SpaceHub — UI Hook Live Debugger & Extension Profiler (Horizon 8++)
 * Version: 1.0.0
 *
 * Inspecteur visuel et profileur de performance pour le Plugin SDK :
 * - Met en surbrillance fluo toutes les zones injectables de l'interface
 * - Mesure le temps d'exécution (en millisecondes) de chaque extension pour détecter les goulots d'étranglement
 */

'use strict';

import Logger from '../Logger.js';

class UIHookDebugger {
    constructor(hookManager) {
        this._log = new Logger('UIHookDebugger');
        this._hookManager = hookManager;
        this._isInspecting = false;
        this._profileLogs = [];
    }

    /**
     * Active/Désactive la surbrillance visuelle des points d'injection UI.
     */
    toggleVisualInspection() {
        this._isInspecting = !this._isInspecting;
        document.body.classList.toggle('sh-hook-debug-active', this._isInspecting);

        if (this._isInspecting) {
            this._injectDebugStyles();
            window.SpaceHub?.ui?.components?.toaster?.info('🔍 Mode Inspection des Hooks UI activé !');
        } else {
            window.SpaceHub?.ui?.components?.toaster?.info('Mode Inspection désactivé.');
        }
    }

    /**
     * Enregistre une métrique de temps d'exécution pour une extension.
     * @param {string} hookName
     * @param {string} extensionId
     * @param {number} durationMs
     */
    recordExecution(hookName, extensionId, durationMs) {
        this._profileLogs.push({
            timestamp: Date.now(),
            hookName,
            extensionId,
            durationMs: parseFloat(durationMs.toFixed(2))
        });
        if (this._profileLogs.length > 200) this._profileLogs.shift();
    }

    getProfilingStats() {
        return [...this._profileLogs];
    }

    _injectDebugStyles() {
        if (document.getElementById('sh-hook-debugger-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-hook-debugger-styles';
        style.textContent = `
.sh-hook-debug-active [data-hook-point] {
    outline: 2px dashed #00f2fe !important;
    position: relative !important;
}

.sh-hook-debug-active [data-hook-point]::before {
    content: "🪝 " attr(data-hook-point);
    position: absolute;
    top: -18px;
    left: 4px;
    background: #00f2fe;
    color: #000;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
    z-index: 10000;
    pointer-events: none;
}
        `;
        document.head.appendChild(style);
    }
}

export default UIHookDebugger;
