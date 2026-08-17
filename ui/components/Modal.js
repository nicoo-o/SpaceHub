/**
 * SpaceHub — Modal (composant)
 * Version: 0.3.0
 *
 * Système de modales modulaire avec animations, focus trap, et accessibilité.
 *
 * Usage:
 *   const modal = new Modal({
 *       id: 'sonarr-add',
 *       title: 'Ajouter une série',
 *       content: '<p>Contenu HTML...</p>',
 *       footer: '<button class="sh-btn sh-btn--primary">Ajouter</button>',
 *       size: 'md',   // 'sm' | 'md' | 'lg' | 'fullscreen'
 *       onClose: () => console.log('fermé'),
 *   });
 *   modal.open();
 *   modal.close();
 */

'use strict';

import Logger from '../../core/Logger.js';

/** @type {Set<Modal>} */
const activeModals = new Set();

class Modal {
    /**
     * @param {{
     *   id: string,
     *   title?: string,
     *   content?: string|HTMLElement,
     *   footer?: string|HTMLElement,
     *   size?: 'sm'|'md'|'lg'|'xl'|'fullscreen',
     *   closeOnBackdrop?: boolean,
     *   closeOnEscape?: boolean,
     *   showCloseButton?: boolean,
     *   onOpen?: Function,
     *   onClose?: Function,
     * }} options
     */
    constructor(options = {}) {
        if (!options.id) throw new Error('[Modal] L\'option "id" est obligatoire.');

        this.id                = options.id;
        this.title             = options.title             ?? '';
        this.content           = options.content           ?? '';
        this.footer            = options.footer            ?? '';
        this.size              = options.size              ?? 'md';
        this.closeOnBackdrop   = options.closeOnBackdrop   ?? true;
        this.closeOnEscape     = options.closeOnEscape     ?? true;
        this.showCloseButton   = options.showCloseButton   ?? true;
        this.onOpen            = options.onOpen            ?? null;
        this.onClose           = options.onClose           ?? null;

        this._log              = new Logger(`Modal:${this.id}`);
        this._el               = null;
        this._isOpen           = false;
        this._prevFocus        = null;
        this._handleKey        = this._onKeyDown.bind(this);

        this._injectStyles();
        this._build();
    }

    // ─── API Publique ────────────────────────────────────────────────────────────

    /** Ouvre la modale. */
    open() {
        if (this._isOpen) return;
        this._isOpen = true;

        if (!document.contains(this._el)) document.body.appendChild(this._el);

        // Ferme les autres modales si nécessaire (comportement de pile)
        activeModals.add(this);

        // Sauvegarde le focus actuel
        this._prevFocus = document.activeElement;

        // Empêche le scroll du body
        document.body.style.overflow = 'hidden';

        // Animation d'entrée
        requestAnimationFrame(() => {
            this._el.classList.add('sh-modal--open');
            this._focusFirstElement();
        });

        if (this.closeOnEscape) document.addEventListener('keydown', this._handleKey);
        if (this.onOpen) this.onOpen(this);
        this._log.debug('Ouverte.');
    }

    /** Ferme la modale. */
    close() {
        if (!this._isOpen) return;
        this._isOpen = false;

        this._el.classList.remove('sh-modal--open');
        this._el.classList.add('sh-modal--closing');

        document.removeEventListener('keydown', this._handleKey);
        activeModals.delete(this);

        // Restaure le scroll si plus aucune modale ouverte
        if (activeModals.size === 0) document.body.style.overflow = '';

        // Restaure le focus
        this._prevFocus?.focus?.();

        this._el.addEventListener('transitionend', () => {
            if (!this._isOpen) {
                this._el.classList.remove('sh-modal--closing');
                if (document.contains(this._el)) document.body.removeChild(this._el);
            }
        }, { once: true });

        if (this.onClose) this.onClose(this);
        this._log.debug('Fermée.');
    }

    /** Met à jour le contenu de la modale à la volée. */
    setContent(html) {
        const body = this._el?.querySelector('.sh-modal__body');
        if (body) {
            if (typeof html === 'string') body.innerHTML = html;
            else body.replaceChildren(html);
        }
    }

    /** Met à jour le titre. */
    setTitle(title) {
        const el = this._el?.querySelector('.sh-modal__title');
        if (el) el.textContent = title;
        this.title = title;
    }

    /** Affiche un état de chargement dans la modale. */
    setLoading(loading = true) {
        const body = this._el?.querySelector('.sh-modal__body');
        if (!body) return;
        if (loading) {
            body.innerHTML = `
                <div class="sh-modal__loading">
                    <span class="sh-spinner" aria-label="Chargement..."></span>
                    <p>Chargement…</p>
                </div>`;
        }
    }

    get isOpen() { return this._isOpen; }

    /** Supprime la modale du DOM et libère les ressources. */
    destroy() {
        this.close();
        this._el?.remove();
        this._el = null;
    }

    // ─── Construction DOM ────────────────────────────────────────────────────────

    _build() {
        this._el = document.createElement('div');
        this._el.id          = `sh-modal-${this.id}`;
        this._el.className   = `sh-modal sh-modal--${this.size}`;
        this._el.setAttribute('role', 'dialog');
        this._el.setAttribute('aria-modal', 'true');
        this._el.setAttribute('aria-labelledby', `sh-modal-title-${this.id}`);

        this._el.innerHTML = `
            <div class="sh-modal__backdrop"></div>
            <div class="sh-modal__container sh-scrollbar">
                ${this.title ? `
                <header class="sh-modal__header">
                    <h2 class="sh-modal__title" id="sh-modal-title-${this.id}">${this._escape(this.title)}</h2>
                    ${this.showCloseButton ? `<button class="sh-modal__close" aria-label="Fermer la fenêtre">×</button>` : ''}
                </header>` : ''}
                <div class="sh-modal__body">
                    ${typeof this.content === 'string' ? this.content : ''}
                </div>
                ${this.footer ? `
                <footer class="sh-modal__footer">
                    ${typeof this.footer === 'string' ? this.footer : ''}
                </footer>` : ''}
            </div>
        `;

        // Insérer les éléments HTMLElement (non-string)
        if (this.content instanceof HTMLElement) {
            this._el.querySelector('.sh-modal__body').replaceChildren(this.content);
        }
        if (this.footer instanceof HTMLElement) {
            this._el.querySelector('.sh-modal__footer')?.replaceChildren(this.footer);
        }

        // Événements
        this._el.querySelector('.sh-modal__close')?.addEventListener('click', () => this.close());
        if (this.closeOnBackdrop) {
            this._el.querySelector('.sh-modal__backdrop').addEventListener('click', () => this.close());
        }
    }

    _onKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
        }
        if (e.key === 'Tab') {
            this._trapFocus(e);
        }
    }

    _focusFirstElement() {
        const focusable = this._el.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length) focusable[0].focus();
    }

    _trapFocus(e) {
        const focusable = [...this._el.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )];
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === first) { last.focus(); e.preventDefault(); }
        } else {
            if (document.activeElement === last)  { first.focus(); e.preventDefault(); }
        }
    }

    _escape(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // ─── Styles ──────────────────────────────────────────────────────────────────

    _injectStyles() {
        if (document.getElementById('sh-modal-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-modal-styles';
        style.textContent = `
.sh-modal {
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
    z-index: var(--sh-z-modal, 400);
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--sh-transition-base, 250ms ease);
}
.sh-modal--open    { opacity: 1; pointer-events: all; }
.sh-modal--closing { opacity: 0; pointer-events: none; }

.sh-modal__backdrop {
    position: absolute; inset: 0;
    background: var(--sh-bg-overlay, rgba(0,0,0,0.72));
    backdrop-filter: blur(4px);
}

.sh-modal__container {
    position: relative;
    background: var(--sh-bg-surface, #18181f);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-lg, 16px);
    box-shadow: var(--sh-shadow-xl, 0 24px 64px rgba(0,0,0,0.7));
    display: flex; flex-direction: column;
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    transform: scale(0.94) translateY(8px);
    transition: transform var(--sh-transition-spring, 350ms cubic-bezier(0.34,1.56,0.64,1));
}
.sh-modal--open .sh-modal__container { transform: scale(1) translateY(0); }
.sh-modal--closing .sh-modal__container { transform: scale(0.94) translateY(8px); }

/* Tailles */
.sh-modal--sm .sh-modal__container  { width: min(380px, 90vw); }
.sh-modal--md .sh-modal__container  { width: min(580px, 90vw); }
.sh-modal--lg .sh-modal__container  { width: min(800px, 92vw); }
.sh-modal--xl .sh-modal__container  { width: min(1100px, 96vw); }
.sh-modal--fullscreen .sh-modal__container { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }

.sh-modal__header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--sh-space-5, 20px) var(--sh-space-6, 24px) var(--sh-space-4, 16px);
    border-bottom: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    flex-shrink: 0;
}
.sh-modal__title {
    margin: 0;
    font-size: var(--sh-text-lg, 20px);
    font-weight: var(--sh-font-semibold, 600);
    color: var(--sh-text-primary, #f0f0f8);
}
.sh-modal__close {
    background: none; border: none; cursor: pointer;
    color: var(--sh-text-muted, #5c5c7a);
    font-size: 24px; line-height: 1; padding: 4px;
    border-radius: var(--sh-radius-sm, 8px);
    transition: color var(--sh-transition-fast, 150ms), background var(--sh-transition-fast, 150ms);
}
.sh-modal__close:hover { color: var(--sh-text-primary, #f0f0f8); background: var(--sh-bg-surface-3, #2e2e3d); }

.sh-modal__body {
    padding: var(--sh-space-6, 24px);
    color: var(--sh-text-secondary, #9898b8);
    font-size: var(--sh-text-base, 15px);
    line-height: var(--sh-leading-normal, 1.5);
    flex: 1;
    overflow-y: auto;
}

.sh-modal__footer {
    display: flex; gap: var(--sh-space-3, 12px); justify-content: flex-end;
    padding: var(--sh-space-4, 16px) var(--sh-space-6, 24px);
    border-top: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    flex-shrink: 0;
}

.sh-modal__loading {
    display: flex; flex-direction: column; align-items: center;
    gap: var(--sh-space-4, 16px); padding: var(--sh-space-12, 48px);
    color: var(--sh-text-muted, #5c5c7a);
}
.sh-spinner {
    width: 32px; height: 32px;
    border: 3px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-top-color: var(--sh-color-primary, #7c6aff);
    border-radius: 50%;
    animation: sh-spin 0.8s linear infinite;
    display: block;
}

/* Boutons standard SpaceHub */
.sh-btn {
    display: inline-flex; align-items: center; gap: var(--sh-space-2, 8px);
    padding: var(--sh-space-2, 8px) var(--sh-space-4, 16px);
    border-radius: var(--sh-radius-sm, 8px);
    font-family: var(--sh-font-family, sans-serif);
    font-size: var(--sh-text-sm, 13px);
    font-weight: var(--sh-font-medium, 500);
    border: 1px solid transparent; cursor: pointer;
    transition: all var(--sh-transition-fast, 150ms);
}
.sh-btn--primary {
    background: var(--sh-color-primary, #7c6aff);
    color: var(--sh-text-on-primary, #fff);
}
.sh-btn--primary:hover { background: var(--sh-color-primary-hover, #9a8bff); }
.sh-btn--ghost {
    background: transparent;
    border-color: var(--sh-border-color, rgba(255,255,255,0.08));
    color: var(--sh-text-secondary, #9898b8);
}
.sh-btn--ghost:hover { background: var(--sh-bg-surface-3, #2e2e3d); color: var(--sh-text-primary, #f0f0f8); }
.sh-btn--danger { background: var(--sh-color-danger, #ff5c7a); color: #fff; }
.sh-btn--danger:hover { filter: brightness(1.1); }
        `;
        document.head.appendChild(style);
    }
}

// ─── Factory helper ───────────────────────────────────────────────────────────

/**
 * Crée et ouvre immédiatement une modale de confirmation.
 * @param {{ title: string, message: string, confirmLabel?: string, cancelLabel?: string, onConfirm: Function }} opts
 * @returns {Modal}
 */
Modal.confirm = function(opts) {
    const modal = new Modal({
        id:      `confirm-${Date.now()}`,
        title:   opts.title,
        size:    'sm',
        content: `<p style="margin:0">${opts.message}</p>`,
        footer:  `
            <button class="sh-btn sh-btn--ghost" data-action="cancel">${opts.cancelLabel ?? 'Annuler'}</button>
            <button class="sh-btn sh-btn--primary" data-action="confirm">${opts.confirmLabel ?? 'Confirmer'}</button>
        `,
        onOpen: (m) => {
            m._el.querySelector('[data-action="confirm"]').addEventListener('click', () => {
                opts.onConfirm?.();
                m.close();
            });
            m._el.querySelector('[data-action="cancel"]').addEventListener('click', () => m.close());
        },
    });
    modal.open();
    return modal;
};

export default Modal;
