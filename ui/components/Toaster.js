/**
 * SpaceHub — Toaster (composant)
 * Version: 0.3.0
 *
 * Système de notifications toast modulaire.
 * Wraps le système Jellyfin natif et ajoute les types SpaceHub.
 *
 * Usage:
 *   SpaceHub.ui.components.toaster.show('Série ajoutée !', 'success');
 *   SpaceHub.ui.components.toaster.show('Erreur API', 'error', { duration: 6000 });
 *   SpaceHub.ui.components.toaster.show('Info', 'info', { action: { label: 'Voir', fn: () => {} } });
 */

'use strict';

import Logger from '../../core/Logger.js';

import './Toaster.css';
const ICONS = {
    success: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    warning: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    info:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    default: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
};

const DEFAULT_DURATION = {
    success: 3000,
    error:   6000,
    warning: 4500,
    info:    3500,
    default: 3000,
};

class Toaster {
    constructor() {
        this._log       = new Logger('Toaster');
        this._container = null;
        this._queue     = [];
        this._active    = new Map(); // id → { el, timer }
        this._maxToasts = 5;
        this._idCounter = 0;
        this._injectStyles();
        this._log.info('Initialisé.');
    }

    // ─── API Publique ────────────────────────────────────────────────────────────

    /**
     * Affiche une notification toast.
     * @param {string} message
     * @param {'success'|'error'|'warning'|'info'|'default'} [type]
     * @param {{ duration?: number, action?: { label: string, fn: Function }, persistent?: boolean }} [options]
     * @returns {string} ID du toast (pour le fermer manuellement)
     */
    show(message, type = 'default', options = {}) {
        const id       = `sh-toast-${++this._idCounter}`;
        const duration = options.persistent ? 0 : (options.duration ?? DEFAULT_DURATION[type] ?? 3000);
        this._render(id, message, type, duration, options.action);
        return id;
    }

    success(message, options)  { return this.show(message, 'success', options); }
    error(message, options)    { return this.show(message, 'error',   options); }
    warning(message, options)  { return this.show(message, 'warning', options); }
    info(message, options)     { return this.show(message, 'info',    options); }

    /**
     * Ferme un toast par son ID.
     * @param {string} id
     */
    dismiss(id) {
        this._dismiss(id);
    }

    /** Ferme tous les toasts actifs. */
    dismissAll() {
        [...this._active.keys()].forEach(id => this._dismiss(id));
    }

    // ─── Rendu ───────────────────────────────────────────────────────────────────

    _ensureContainer() {
        if (this._container && document.contains(this._container)) return;

        this._container = document.createElement('div');
        this._container.id = 'sh-toast-container';
        this._container.setAttribute('role', 'region');
        this._container.setAttribute('aria-label', 'Notifications');
        document.body.appendChild(this._container);
    }

    _render(id, message, type, duration, action) {
        this._ensureContainer();

        // Limite du nombre de toasts simultanés
        if (this._active.size >= this._maxToasts) {
            const oldest = this._active.keys().next().value;
            this._dismiss(oldest, true);
        }

        const toast = document.createElement('div');
        toast.id        = id;
        toast.className = `sh-toast sh-toast--${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.innerHTML = `
            <span class="sh-toast__icon" aria-hidden="true">${ICONS[type] ?? ICONS.default}</span>
            <span class="sh-toast__message">${this._escape(message)}</span>
            ${action ? `<button class="sh-toast__action">${this._escape(action.label)}</button>` : ''}
            <button class="sh-toast__close" aria-label="Fermer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            ${duration > 0 ? `<div class="sh-toast__progress" style="animation-duration:${duration}ms"></div>` : ''}
        `;

        // Événements
        toast.querySelector('.sh-toast__close').addEventListener('click', () => this._dismiss(id));
        if (action) {
            toast.querySelector('.sh-toast__action').addEventListener('click', () => {
                try { action.fn(); } catch (e) { this._log.error('Erreur action toast:', e); }
                this._dismiss(id);
            });
        }

        this._container.prepend(toast);

        // Animation d'entrée
        requestAnimationFrame(() => toast.classList.add('sh-toast--visible'));

        // Timer auto-dismiss
        let timer = null;
        if (duration > 0) {
            timer = setTimeout(() => this._dismiss(id), duration);
        }

        this._active.set(id, { el: toast, timer });
    }

    _dismiss(id, immediate = false) {
        const entry = this._active.get(id);
        if (!entry) return;

        clearTimeout(entry.timer);
        this._active.delete(id);

        if (immediate) {
            entry.el.remove();
            return;
        }

        entry.el.classList.remove('sh-toast--visible');
        entry.el.classList.add('sh-toast--leaving');
        entry.el.addEventListener('animationend', () => entry.el.remove(), { once: true });
        // Fallback si animationend ne se déclenche pas
        setTimeout(() => entry.el.remove(), 400);
    }

    _escape(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ─── Styles ──────────────────────────────────────────────────────────────────

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans Toaster.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default Toaster;
