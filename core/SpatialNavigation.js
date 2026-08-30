/**
 * SpaceHub — Spatial Navigation (TV Remote & D-Pad Controller)
 * Version: 1.0.0
 *
 * Moteur de navigation spatiale 2D pour télécommandes TV, manettes et claviers D-Pad.
 * Gère le focus fluide, les halos lumineux Apple TV et le défilement automatique des carrousels.
 */

'use strict';

import Logger from './Logger.js';

export class SpatialNavigation {
    /**
     * @param {Object} [options]
     * @param {HTMLElement} [options.root=document.body]
     */
    constructor({ root = document.body } = {}) {
        this._log = new Logger('SpatialNavigation');
        this._root = root;
        this._focusedElement = null;
        this._isEnabled = true;
        this._injectStyles();
        this._bindEvents();
        this._log.info('Moteur SpatialNavigation TV prêt.');
    }

    _injectStyles() {
        if (document.getElementById('sh-spatial-nav-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-spatial-nav-styles';
        style.textContent = `
            /* Halo Luminescent Apple TV 4K Focus */
            .sh-tv-focused {
                outline: 3px solid #ff9f0a !important;
                outline-offset: 4px !important;
                box-shadow: 0 0 24px rgba(255, 159, 10, 0.45), 0 12px 32px rgba(0, 0, 0, 0.8) !important;
                transform: scale3d(1.05, 1.05, 1.05) !important;
                z-index: 100 !important;
                transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms ease, outline 140ms ease !important;
            }

            .sh-card.sh-tv-focused {
                transform: scale3d(1.06, 1.06, 1.06) translateY(-4px) !important;
            }
        `;
        document.head.appendChild(style);
    }

    _bindEvents() {
        window.addEventListener('keydown', (e) => {
            if (!this._isEnabled) return;

            // Ignorer si l'utilisateur saisit du texte dans un champ
            const activeEl = document.activeElement;
            const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
            if (isInput && e.key !== 'Escape') return;

            switch (e.key) {
                case 'ArrowUp':
                case 'ArrowDown':
                case 'ArrowLeft':
                case 'ArrowRight':
                    this._handleDirection(e.key.replace('Arrow', '').toLowerCase(), e);
                    break;
                case 'Enter':
                    if (this._focusedElement) {
                        e.preventDefault();
                        this._focusedElement.click();
                    }
                    break;
                case 'Escape':
                case 'Backspace':
                    if (document.querySelector('.sh-modal-overlay.open, .sh-modal.open, #spacehub-settings')) {
                        // Fermer les modales ouvertes
                    } else if (window.SpaceHub?.player?._el) {
                        e.preventDefault();
                        window.SpaceHub.player.close();
                    }
                    break;
            }
        });
    }

    _getFocusableElements() {
        const selector = [
            'button:not([disabled]):not([style*="display: none"])',
            'a[href]',
            'input:not([disabled])',
            'select:not([disabled])',
            '.sh-card:not(.sh-card--skeleton)',
            '.sh-nav-tab-btn',
            '.sh-genre-chip',
            '.sh-dock-pill-btn',
            '.sh-micro-btn',
            '[tabindex="0"]'
        ].join(', ');

        const all = Array.from(document.querySelectorAll(selector));
        return all.filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
        });
    }

    _handleDirection(direction, event) {
        const focusables = this._getFocusableElements();
        if (focusables.length === 0) return;

        if (!this._focusedElement || !document.body.contains(this._focusedElement)) {
            this._setFocus(focusables[0]);
            event.preventDefault();
            return;
        }

        const currentRect = this._focusedElement.getBoundingClientRect();
        let bestCandidate = null;
        let minDistance = Infinity;

        for (const candidate of focusables) {
            if (candidate === this._focusedElement) continue;
            const candRect = candidate.getBoundingClientRect();

            let isDirectionValid = false;
            let distance = 0;

            if (direction === 'up' && candRect.bottom <= currentRect.top + 20) {
                isDirectionValid = true;
                distance = Math.hypot(candRect.left - currentRect.left, (currentRect.top - candRect.bottom) * 1.5);
            } else if (direction === 'down' && candRect.top >= currentRect.bottom - 20) {
                isDirectionValid = true;
                distance = Math.hypot(candRect.left - currentRect.left, (candRect.top - currentRect.bottom) * 1.5);
            } else if (direction === 'left' && candRect.right <= currentRect.left + 20) {
                isDirectionValid = true;
                distance = Math.hypot(currentRect.left - candRect.right, candRect.top - currentRect.top);
            } else if (direction === 'right' && candRect.left >= currentRect.right - 20) {
                isDirectionValid = true;
                distance = Math.hypot(candRect.left - currentRect.right, candRect.top - currentRect.top);
            }

            if (isDirectionValid && distance < minDistance) {
                minDistance = distance;
                bestCandidate = candidate;
            }
        }

        if (bestCandidate) {
            event.preventDefault();
            this._setFocus(bestCandidate);
        }
    }

    _setFocus(element) {
        if (this._focusedElement) {
            this._focusedElement.classList.remove('sh-tv-focused');
        }
        this._focusedElement = element;
        if (element) {
            element.classList.add('sh-tv-focused');
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            if (typeof element.focus === 'function') {
                element.focus({ preventScroll: true });
            }
        }
    }

    destroy() {
        if (this._focusedElement) {
            this._focusedElement.classList.remove('sh-tv-focused');
            this._focusedElement = null;
        }
        this._isEnabled = false;
    }
}

export default SpatialNavigation;
