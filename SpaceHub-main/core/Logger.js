/**
 * SpaceHub — Logger
 * Version: 0.2.0
 *
 * Système de logs structurés avec niveaux, timestamps et préfixe SpaceHub.
 * Utilisé par tous les autres modules du Core.
 */

'use strict';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };

class Logger {
    /**
     * @param {string} namespace  - Préfixe affiché dans la console (ex: "ModuleManager")
     * @param {'debug'|'info'|'warn'|'error'|'none'} minLevel - Niveau minimum à afficher
     */
    constructor(namespace = 'SpaceHub', minLevel = 'info') {
        this.namespace = namespace;
        this.minLevel = minLevel;
        this._history = [];
    }

    _shouldLog(level) {
        return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
    }

    _format(level, message) {
        const ts = new Date().toISOString().substring(11, 23); // HH:MM:SS.mmm
        return `[SpaceHub:${this.namespace}] [${ts}] ${message}`;
    }

    _log(level, message, ...args) {
        if (!this._shouldLog(level)) return;
        const formatted = this._format(level, message);
        this._history.push({ level, message: formatted, args, time: Date.now() });
        // Garde seulement les 200 derniers logs
        if (this._history.length > 200) this._history.shift();
        console[level === 'debug' ? 'log' : level](formatted, ...args);
    }

    debug(message, ...args) { this._log('debug', message, ...args); }
    info(message, ...args)  { this._log('info',  message, ...args); }
    warn(message, ...args)  { this._log('warn',  message, ...args); }
    error(message, ...args) { this._log('error', message, ...args); }

    /** Retourne les N derniers logs (utile pour le debug panel) */
    getHistory(n = 50) { return this._history.slice(-n); }

    /** Crée un logger enfant avec un namespace étendu */
    child(subNamespace) {
        return new Logger(`${this.namespace}:${subNamespace}`, this.minLevel);
    }

    setLevel(level) {
        if (level in LOG_LEVELS) this.minLevel = level;
    }
}

export default Logger;
