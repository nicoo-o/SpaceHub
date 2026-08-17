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

const ICONS = {
    success: '✅',
    error:   '❌',
    warning: '⚠️',
    info:    'ℹ️',
    default: '💬',
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
            <button class="sh-toast__close" aria-label="Fermer">×</button>
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
        if (document.getElementById('sh-toaster-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-toaster-styles';
        style.textContent = `
#sh-toast-container {
    position: fixed;
    top: var(--sh-space-6, 24px);
    right: var(--sh-space-6, 24px);
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-2, 8px);
    z-index: var(--sh-z-toast, 500);
    max-width: 380px;
    width: calc(100vw - 48px);
    pointer-events: none;
}
.sh-toast {
    display: flex;
    align-items: center;
    gap: var(--sh-space-3, 12px);
    padding: var(--sh-space-3, 12px) var(--sh-space-4, 16px);
    background: var(--sh-bg-surface, #18181f);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-md, 12px);
    box-shadow: var(--sh-shadow-lg, 0 12px 40px rgba(0,0,0,0.6));
    backdrop-filter: blur(12px);
    color: var(--sh-text-primary, #f0f0f8);
    font-family: var(--sh-font-family, sans-serif);
    font-size: var(--sh-text-sm, 13px);
    pointer-events: all;
    opacity: 0;
    transform: translateX(110%);
    transition: opacity var(--sh-transition-base, 250ms ease),
                transform var(--sh-transition-spring, 350ms cubic-bezier(0.34,1.56,0.64,1));
    border-left: 3px solid transparent;
}
.sh-toast--visible  { opacity: 1; transform: translateX(0); }
.sh-toast--leaving  { opacity: 0; transform: translateX(110%); transition: opacity 300ms ease, transform 300ms ease; }
.sh-toast--success  { border-left-color: var(--sh-color-success, #3ddc84); }
.sh-toast--error    { border-left-color: var(--sh-color-danger,  #ff5c7a); }
.sh-toast--warning  { border-left-color: var(--sh-color-warning, #ffb830); }
.sh-toast--info     { border-left-color: var(--sh-color-info,    #4fc3f7); }
.sh-toast--default  { border-left-color: var(--sh-color-primary, #7c6aff); }
.sh-toast__icon     { font-size: 16px; flex-shrink: 0; }
.sh-toast__message  { flex: 1; line-height: var(--sh-leading-normal, 1.5); }
.sh-toast__action {
    flex-shrink: 0;
    padding: 4px 10px;
    border-radius: var(--sh-radius-sm, 8px);
    background: rgba(var(--sh-color-primary-rgb, 124,106,255), 0.18);
    color: var(--sh-color-primary, #7c6aff);
    border: none; cursor: pointer;
    font-size: var(--sh-text-xs, 11px);
    font-weight: var(--sh-font-semibold, 600);
    transition: background var(--sh-transition-fast, 150ms);
}
.sh-toast__action:hover { background: rgba(var(--sh-color-primary-rgb,124,106,255), 0.3); }
.sh-toast__close {
    flex-shrink: 0;
    background: none; border: none; cursor: pointer;
    color: var(--sh-text-muted, #5c5c7a);
    font-size: 18px; line-height: 1; padding: 0 2px;
    transition: color var(--sh-transition-fast, 150ms);
}
.sh-toast__close:hover { color: var(--sh-text-primary, #f0f0f8); }

@media (max-width: 480px) {
    #sh-toast-container { top: auto; bottom: 16px; right: 12px; left: 12px; width: auto; }
}
        `;
        document.head.appendChild(style);
    }
}

export default Toaster;
