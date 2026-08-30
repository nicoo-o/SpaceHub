/**
 * SpaceHub — Spatial Navigation (TV Remote & Mouse Seamless Transition)
 * Version: 3.5.0
 *
 * Moteur de navigation spatiale unifié.
 * Gère la transition invisible et immédiate entre la Souris et la Télécommande/Flèches.
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
        this._lastInteractedElement = null;
        this._isEnabled = true;
        this._isTvMode = false;
        this._lastMouseX = null;
        this._lastMouseY = null;
        this._injectStyles();
        this._bindEvents();
        this._log.info('Moteur SpatialNavigation TV v3.5 prêt.');
    }

    _injectStyles() {
        if (document.getElementById('sh-spatial-nav-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-spatial-nav-styles';
        style.textContent = `
            /* Halo Luminescent Apple TV 4K sur le Poster du Média */
            .sh-card.sh-tv-focused {
                outline: none !important;
                box-shadow: none !important;
                transform: translateY(-6px) scale(1.025) !important;
            }

            .sh-card.sh-tv-focused .sh-card__image-wrap {
                outline: 3px solid #ff9f0a !important;
                outline-offset: 3px !important;
                box-shadow: 0 0 28px rgba(255, 159, 10, 0.70), 0 16px 40px rgba(0, 0, 0, 0.95) !important;
            }

            .sh-card.sh-tv-focused .sh-card__action-pill {
                transform: translateX(-50%) translateY(0) !important;
                opacity: 1 !important;
            }

            .sh-card.sh-tv-focused .sh-card__image {
                transform: scale(1.04) !important;
            }

            .sh-card.sh-tv-focused .sh-card__codec-tag {
                opacity: 0 !important;
                transform: translateY(10px) !important;
            }

            /* Halo Luminescent sur Boutons et Onglets */
            .sh-tv-focused:not(.sh-card) {
                outline: 2.5px solid #ff9f0a !important;
                outline-offset: 3px !important;
                box-shadow: 0 0 22px rgba(255, 159, 10, 0.60), 0 8px 24px rgba(0, 0, 0, 0.8) !important;
                z-index: 999 !important;
            }

            .sh-genre-chip.sh-tv-focused,
            .sh-nav-tab-btn.sh-tv-focused {
                background: rgba(255, 159, 10, 0.25) !important;
                border-color: #ff9f0a !important;
            }
        `;
        document.head.appendChild(style);
    }

    _bindEvents() {
        // 1. Clavier / D-Pad
        window.addEventListener('keydown', (e) => {
            if (!this._isEnabled) return;

            const activeEl = document.activeElement;
            const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
            if (isInput && e.key !== 'Escape') return;

            const tvKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace'];
            if (!tvKeys.includes(e.key)) return;

            this._isTvMode = true;

            switch (e.key) {
                case 'ArrowUp':
                case 'ArrowDown':
                case 'ArrowLeft':
                case 'ArrowRight':
                    e.preventDefault();
                    this._handleDirection(e.key.replace('Arrow', '').toLowerCase());
                    break;
                case 'Enter':
                    if (this._focusedElement) {
                        e.preventDefault();
                        this._activateFocused();
                    }
                    break;
                case 'Escape':
                case 'Backspace':
                    this._handleBack(e);
                    break;
            }
        });

        // 2. Mouvement Souris : Désactivation instantanée du focus TV et suivi de la position souris
        window.addEventListener('mousemove', (e) => {
            if (this._lastMouseX === null || this._lastMouseY === null) {
                this._lastMouseX = e.clientX;
                this._lastMouseY = e.clientY;
                return;
            }

            const delta = Math.abs(e.clientX - this._lastMouseX) + Math.abs(e.clientY - this._lastMouseY);
            if (delta > 2) {
                this._lastMouseX = e.clientX;
                this._lastMouseY = e.clientY;

                if (this._focusedElement) {
                    this.clearFocus();
                }
                this._isTvMode = false;
            }
        }, { passive: true });

        // 3. Suivi du survol souris sur les éléments interactifs pour reprise de position immédiate
        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('.sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, .sh-hero-btn-play, .sh-hero-btn-glass, button, a');
            if (target) {
                this._lastInteractedElement = target;
            }
        }, { passive: true });

        // 4. Clic Souris : Nettoyage immédiat du mode TV et mémorisation
        document.addEventListener('pointerdown', (e) => {
            this.clearFocus();
            this._isTvMode = false;
            const target = e.target.closest('.sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, button, a');
            if (target) {
                this._lastInteractedElement = target;
            }
        }, { passive: true });
    }

    _handleBack(event) {
        const slideUpModal = document.querySelector('.sh-slideup-sheet--open');
        if (slideUpModal) {
            event?.preventDefault();
            window.SpaceHub?.ui?.modalSlideUpSheet?.close?.();
            return;
        }

        const openModal = document.querySelector('.sh-modal-overlay.open, .sh-modal.open, #spacehub-settings');
        if (openModal) {
            event?.preventDefault();
            document.querySelectorAll('.sh-modal-overlay.open, .sh-modal.open').forEach(m => m.remove());
            return;
        }

        if (window.SpaceHub?.player?._el) {
            event?.preventDefault();
            window.SpaceHub.player.close();
        }
    }

    _getActiveContainer() {
        const slideUp = document.querySelector('.sh-slideup-sheet--open');
        if (slideUp) return slideUp;

        const openModal = document.querySelector('.sh-modal.open, #spacehub-settings, .sh-console-modal-overlay.open');
        if (openModal) return openModal;

        return document.body;
    }

    _getFocusableElements() {
        const container = this._getActiveContainer();

        const selector = [
            '#sh-hero-btn-play',
            '#sh-hero-btn-trailer',
            '#sh-hero-btn-details',
            '#sh-hero-scroll-hint',
            '.sh-genre-chip',
            '.sh-card:not(.sh-card--skeleton)',
            '.sh-nav-tab-btn',
            '.sh-dock-pill-btn',
            '.sh-resume-dock__btn-play',
            '#sh-resume-dock-play',
            '.sh-slideup-btn-play',
            '.sh-slideup-btn-glass',
            '.sh-slideup-season-chip',
            '.sh-slideup-ep-card',
            '.sh-settings-nav__item',
            '.sh-btn:not([disabled])',
            'button:not([disabled]):not(.sh-hero-badge):not(.sh-score-rt):not(.sh-score-imdb):not([style*="display: none"])',
            'a[href]',
            'input:not([disabled])',
            '[tabindex="0"]:not(.sh-hero-badge):not(.sh-score-rt):not(.sh-score-imdb)'
        ].join(', ');

        const all = Array.from(container.querySelectorAll(selector));
        return all.filter(el => {
            if (el.classList.contains('sh-hero-badge') || el.classList.contains('sh-score-rt') || el.classList.contains('sh-score-imdb')) {
                return false;
            }
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden' && window.getComputedStyle(el).display !== 'none';
        });
    }

    _handleDirection(direction) {
        const focusables = this._getFocusableElements();
        if (focusables.length === 0) return;

        // Si aucun élément n'est sélectionné au clavier (ex: reprise après souris)
        if (!this._focusedElement || !document.body.contains(this._focusedElement)) {
            // 1. Reprendre depuis le dernier élément survolé par la souris s'il est encore visible
            if (this._lastInteractedElement && document.body.contains(this._lastInteractedElement)) {
                const rect = this._lastInteractedElement.getBoundingClientRect();
                if (rect.top >= 0 && rect.bottom <= window.innerHeight && rect.width > 0) {
                    this._setFocus(this._lastInteractedElement);
                    return;
                }
            }

            // 2. Sinon cibler la carte visible la plus proche du centre de l'écran
            const centerY = window.innerHeight / 2;
            let closestEl = focusables[0];
            let minCenterDelta = Infinity;

            focusables.forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.top >= 40 && r.bottom <= window.innerHeight - 40) {
                    const deltaY = Math.abs((r.top + r.height / 2) - centerY);
                    if (deltaY < minCenterDelta) {
                        minCenterDelta = deltaY;
                        closestEl = el;
                    }
                }
            });

            this._setFocus(closestEl);
            return;
        }

        const current = this._focusedElement;
        const currentRect = current.getBoundingClientRect();

        // 1. Déplacement horizontal intra-carrousel (Gauche / Droite)
        if ((direction === 'left' || direction === 'right')) {
            const listParent = current.closest('.sh-card-grid, .sh-carousel-track, .sh-slideup-episodes-scroller, .sh-slideup-seasons-track, .sh-genre-bar-track');
            if (listParent) {
                const siblings = Array.from(listParent.querySelectorAll('.sh-card:not(.sh-card--skeleton), .sh-slideup-ep-card, .sh-slideup-season-chip, .sh-genre-chip'));
                const currentIndex = siblings.indexOf(current);
                if (currentIndex !== -1) {
                    const targetIndex = direction === 'right' ? currentIndex + 1 : currentIndex - 1;
                    if (targetIndex >= 0 && targetIndex < siblings.length) {
                        this._setFocus(siblings[targetIndex]);
                        return;
                    }
                }
            }
        }

        // 2. Déplacement vertical inter-sections (Haut / Bas)
        if ((direction === 'up' || direction === 'down') && current.classList.contains('sh-card')) {
            const currentSection = current.closest('.sh-dashboard__item');
            if (currentSection) {
                const allSections = Array.from(document.querySelectorAll('.sh-dashboard__item'));
                const currentSecIdx = allSections.indexOf(currentSection);
                if (currentSecIdx !== -1) {
                    const targetSecIdx = direction === 'down' ? currentSecIdx + 1 : currentSecIdx - 1;
                    if (targetSecIdx >= 0 && targetSecIdx < allSections.length) {
                        const nextCards = allSections[targetSecIdx].querySelectorAll('.sh-card:not(.sh-card--skeleton)');
                        if (nextCards.length > 0) {
                            let bestCard = nextCards[0];
                            let minDeltaX = Infinity;
                            nextCards.forEach(c => {
                                const dx = Math.abs(c.getBoundingClientRect().left - currentRect.left);
                                if (dx < minDeltaX) {
                                    minDeltaX = dx;
                                    bestCard = c;
                                }
                            });
                            this._setFocus(bestCard);
                            return;
                        }
                    } else if (direction === 'up') {
                        const chips = document.querySelectorAll('.sh-genre-chip');
                        if (chips.length > 0) {
                            this._setFocus(chips[0]);
                            return;
                        }
                    }
                }
            }
        }

        // 3. Fallback géométrique 2D classique
        let bestCandidate = null;
        let minDistance = Infinity;

        for (const candidate of focusables) {
            if (candidate === current) continue;
            const candRect = candidate.getBoundingClientRect();

            let isValid = false;
            let dist = 0;

            if (direction === 'up' && candRect.bottom <= currentRect.top + 30) {
                isValid = true;
                dist = Math.hypot(candRect.left - currentRect.left, (currentRect.top - candRect.bottom) * 1.6);
            } else if (direction === 'down' && candRect.top >= currentRect.bottom - 30) {
                isValid = true;
                dist = Math.hypot(candRect.left - currentRect.left, (candRect.top - currentRect.bottom) * 1.6);
            } else if (direction === 'left' && candRect.right <= currentRect.left + 30) {
                isValid = true;
                dist = Math.hypot(currentRect.left - candRect.right, candRect.top - currentRect.top);
            } else if (direction === 'right' && candRect.left >= currentRect.right - 30) {
                isValid = true;
                dist = Math.hypot(candRect.left - currentRect.right, candRect.top - currentRect.top);
            }

            if (isValid && dist < minDistance) {
                minDistance = dist;
                bestCandidate = candidate;
            }
        }

        if (bestCandidate) {
            this._setFocus(bestCandidate);
        }
    }

    _setFocus(element) {
        if (!element) return;
        this.clearFocus();

        this._focusedElement = element;
        this._lastInteractedElement = element;
        element.classList.add('sh-tv-focused');

        const scroller = element.closest('.sh-card-grid, .sh-carousel-scroller, .sh-slideup-episodes-scroller, .sh-slideup-seasons-track');
        if (scroller) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }

        if (typeof element.focus === 'function') {
            element.focus({ preventScroll: true });
        }
    }

    _activateFocused() {
        if (!this._focusedElement) return;
        this._focusedElement.click();
    }

    clearFocus() {
        if (this._focusedElement) {
            this._focusedElement.classList.remove('sh-tv-focused');
            this._focusedElement = null;
        }
        document.querySelectorAll('.sh-tv-focused').forEach(el => el.classList.remove('sh-tv-focused'));
    }

    destroy() {
        this.clearFocus();
        this._isEnabled = false;
    }
}

export default SpatialNavigation;
