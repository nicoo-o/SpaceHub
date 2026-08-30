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

        // Accessibilité : aria-hidden sur les conteneurs frères
        const mainApp = document.getElementById('app') || document.querySelector('.sh-app-shell');
        if (mainApp) mainApp.setAttribute('aria-hidden', 'true');

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

        // Restaure le scroll et aria-hidden si plus aucune modale ouverte
        if (activeModals.size === 0) {
            document.body.style.overflow = '';
            const mainApp = document.getElementById('app') || document.querySelector('.sh-app-shell');
            if (mainApp) mainApp.removeAttribute('aria-hidden');
        }

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
        if (el) el.innerHTML = title;
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
            <div class="sh-modal__container sh-no-scrollbar">
                ${this.title ? `
                <header class="sh-modal__header">
                    <h2 class="sh-modal__title" id="sh-modal-title-${this.id}"></h2>
                    ${this.showCloseButton ? `<button class="sh-modal__close" aria-label="Fermer la fenêtre">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>` : ''}
                </header>` : ''}
                <div class="sh-modal__body sh-no-scrollbar">
                    ${typeof this.content === 'string' ? this.content : ''}
                </div>
                ${this.footer ? `
                <footer class="sh-modal__footer">
                    ${typeof this.footer === 'string' ? this.footer : ''}
                </footer>` : ''}
            </div>
        `;

        // Injecter le titre en tant que HTML (pas escaped) pour permettre les badges SVG
        const titleEl = this._el.querySelector('.sh-modal__title');
        if (titleEl && this.title) {
            titleEl.innerHTML = this.title;
        }

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

    _getFocusableElements() {
        if (!this._el) return [];
        return Array.from(this._el.querySelectorAll(
            '[data-nav-focusable], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';
        });
    }

    _focusFirstElement() {
        const focusable = this._getFocusableElements();
        if (focusable.length > 0) focusable[0].focus();
    }

    _trapFocus(e) {
        const focusable = this._getFocusableElements();
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last  = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === first || !this._el.contains(document.activeElement)) { 
                last.focus(); 
                e.preventDefault(); 
            }
        } else {
            if (document.activeElement === last || !this._el.contains(document.activeElement)) { 
                first.focus(); 
                e.preventDefault(); 
            }
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
    transition: opacity 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-modal--open    { opacity: 1; pointer-events: all; }
.sh-modal--closing { opacity: 0; pointer-events: none; }

.sh-modal__backdrop {
    position: absolute; inset: 0;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transition: opacity 260ms ease;
}

.sh-modal__container {
    position: relative;
    background: rgba(12, 12, 16, 0.92);
    backdrop-filter: blur(50px) saturate(220%);
    -webkit-backdrop-filter: blur(50px) saturate(220%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 22px;
    box-shadow: 
        0 20px 50px rgba(0, 0, 0, 0.90),
        inset 0 1px 0 rgba(255, 255, 255, 0.25),
        inset 0 -1px 0 rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05);
    display: flex; flex-direction: column;
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    transform: scale(0.97) translateY(8px);
    opacity: 0;
    transition: 
        transform 280ms cubic-bezier(0.16, 1, 0.3, 1),
        opacity 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sh-modal--open .sh-modal__container {
    transform: scale(1) translateY(0);
    opacity: 1;
}
.sh-modal--closing .sh-modal__container {
    transform: scale(0.97) translateY(8px);
    opacity: 0;
    transition: transform 200ms ease, opacity 200ms ease;
}

/* Tailles */
.sh-modal--sm .sh-modal__container  { width: min(380px, 90vw); }
.sh-modal--md .sh-modal__container  { width: min(580px, 90vw); }
.sh-modal--lg .sh-modal__container  { width: min(800px, 92vw); }
.sh-modal--xl .sh-modal__container  { width: min(1100px, 96vw); }
.sh-modal--fullscreen .sh-modal__container { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }

.sh-modal__header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.015);
    flex-shrink: 0;
}
.sh-modal__title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
}
.sh-modal__close {
    background: rgba(255, 255, 255, 0.06);
    border: none;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.60);
    font-size: 16px;
    line-height: 1;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 140ms ease;
}
.sh-modal__close:hover { color: #ffffff; background: rgba(255, 255, 255, 0.15); }

.sh-modal__body {
    padding: 24px;
    color: rgba(255, 255, 255, 0.70);
    font-size: 14px;
    line-height: 1.5;
    flex: 1;
    overflow-y: auto;
}

.sh-modal__footer {
    display: flex; gap: 10px; justify-content: flex-end;
    padding: 14px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.015);
    flex-shrink: 0;
}

.sh-modal__loading {
    display: flex; flex-direction: column; align-items: center;
    gap: 12px; padding: 48px;
    color: rgba(255, 255, 255, 0.40);
}
.sh-spinner {
    width: 28px; height: 28px;
    border: 2px solid rgba(255, 255, 255, 0.10);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: sh-spin 0.8s linear infinite;
    display: block;
}

/* Boutons standard SpaceHub Smoked Glass */
.sh-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 16px;
    border-radius: 8px;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 600;
    border: none; cursor: pointer;
    transition: all 140ms ease;
}
.sh-btn--primary {
    background: #ffffff;
    color: #000000;
}
.sh-btn--primary:hover { background: #e8e8f0; }
.sh-btn--ghost {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.80);
}
.sh-btn--ghost:hover { background: rgba(255, 255, 255, 0.10); color: #ffffff; }
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
