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

import './Modal.css';
import * as svc from '../../core/services.js';
import inputRouter, { PRIORITES } from '../../core/InputRouter.js';
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

        const spatialNav = svc.nav() || svc.nav();
        if (spatialNav?.registerFocusables) {
            spatialNav.registerFocusables('modal', () => {
                const openModal = document.querySelector('.sh-modal--open, .sh-slideup-sheet--open, .sh-modal-overlay.open, #sh-modal-spacehub-settings.sh-modal--open');
                if (!openModal) return [];
                return Array.from(openModal.querySelectorAll(
                    '.sh-modal__close, .sh-slideup-close-btn, .sh-settings-nav__item, .sh-input, .sh-settings-toggle, .sh-btn--primary, [data-nav-focusable="true"], button:not([disabled]), input:not([disabled]), select:not([disabled])'
                ));
            }, { force: true }); // re-registration volontaire — cf. plan A04
        }

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
            const spatialNav = svc.nav() || svc.nav();
            spatialNav?.onModalOpened?.(this._el, this._el.querySelector('.sh-modal__close, [data-nav-focusable="true"], button:not([disabled]), input:not([disabled]), select:not([disabled])'));
        });

        // Écouteur conservé pour le piégeage du focus (Tab) — Escape est géré par SpatialNavigation._handleBack().
        this._retirerClavier = inputRouter.inscrire(`modal:${this._id || this._el?.id || 'anonyme'}`,
            this._handleKey, { priorite: PRIORITES.modal });
        if (this.onOpen) this.onOpen(this);
        this._log.debug('Ouverte.');
    }

    /** Ferme la modale. */
    close() {
        if (!this._isOpen) return;
        this._isOpen = false;

        // Fermée par la croix, un clic dehors ou du code : la couche sort de la
        // pile, pour que le prochain « Retour » vise bien celle du dessus.
        svc.nav()?.onLayerClosed?.(this._el);

        this._el.classList.remove('sh-modal--open');
        this._el.classList.add('sh-modal--closing');

        this._retirerClavier?.();
        this._retirerClavier = null;
        activeModals.delete(this);

        // Restaure le scroll et aria-hidden si plus aucune modale ouverte
        if (activeModals.size === 0) {
            document.body.style.overflow = '';
            const mainApp = document.getElementById('app') || document.querySelector('.sh-app-shell');
            if (mainApp) mainApp.removeAttribute('aria-hidden');
        }

        // Restaure le focus et informe le moteur TV quel contexte reprendre.
        this._prevFocus?.focus?.();
        const spatialNav = svc.nav() || svc.nav();
        spatialNav?.onModalClosed?.();

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

    /** Met à jour le titre (échappé via textContent — anti-XSS). */
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

        // Insérer le titre échappé (textContent) — les badges SVG passent par des options dédiées
        const titleEl = this._el.querySelector('.sh-modal__title');
        if (titleEl && this.title) {
            titleEl.textContent = this.title;
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
        // Escape est désormais géré exclusivement par SpatialNavigation._handleBack()
        // (le sélecteur .sh-modal--open y est déjà reconnu — doublon supprimé, cf. plan A05).
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
        // Les styles de ce composant vivent désormais dans Modal.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
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
