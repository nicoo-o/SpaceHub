/**
 * SpaceHub — Spatial Navigation (TV Remote & D-Pad Controller)
 * Version: 2.0.0
 *
 * Moteur de navigation spatiale optimisé pour télécommandes TV, manettes et claviers.
 * Supporte le déplacement intra-carrousel (gauche/droite), inter-sections (haut/bas)
 * et le halo Apple TV 4K ultra-visible.
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
        this._log.info('Moteur SpatialNavigation TV v2.0 prêt.');
    }

    _injectStyles() {
        if (document.getElementById('sh-spatial-nav-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-spatial-nav-styles';
        style.textContent = `
            /* Halo Luminescent Apple TV 4K Focus Ultra-Visible */
            .sh-tv-focused {
                outline: 3.5px solid #ff9f0a !important;
                outline-offset: 4px !important;
                box-shadow: 0 0 28px rgba(255, 159, 10, 0.75), 0 14px 36px rgba(0, 0, 0, 0.9) !important;
                transform: scale3d(1.06, 1.06, 1.06) !important;
                z-index: 9999 !important;
                transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms ease, outline 140ms ease !important;
            }

            .sh-card.sh-tv-focused {
                transform: scale3d(1.07, 1.07, 1.07) translateY(-6px) !important;
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
        window.addEventListener('keydown', (e) => {
            if (!this._isEnabled) return;

            // Ignorer si l'utilisateur saisit du texte dans un champ
            const activeEl = document.activeElement;
            const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
            if (isInput && e.key !== 'Escape') return;

            const tvKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace'];
            if (!tvKeys.includes(e.key)) return;

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
                    const openModal = document.querySelector('.sh-modal-overlay.open, .sh-modal.open, .sh-slideup-sheet--open, #spacehub-settings');
                    if (openModal) {
                        e.preventDefault();
                        window.SpaceHub?.ui?.modalSlideUpSheet?.close?.();
                        document.querySelectorAll('.sh-modal-overlay.open, .sh-modal.open').forEach(m => m.remove());
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
            'button:not([disabled]):not(.sh-hero-badge):not(.sh-score-rt):not(.sh-score-imdb):not([style*="display: none"])',
            'a[href]',
            'input:not([disabled])',
            '[tabindex="0"]:not(.sh-hero-badge):not(.sh-score-rt):not(.sh-score-imdb)'
        ].join(', ');

        const all = Array.from(document.querySelectorAll(selector));
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

        // Si aucun élément n'est sélectionné, cibler le premier élément visible à l'écran
        if (!this._focusedElement || !document.body.contains(this._focusedElement)) {
            const visible = focusables.find(el => {
                const r = el.getBoundingClientRect();
                return r.top >= 50 && r.bottom <= window.innerHeight - 50 && r.left >= 0 && r.right <= window.innerWidth;
            }) || focusables[0];
            this._setFocus(visible);
            return;
        }

        const current = this._focusedElement;
        const currentRect = current.getBoundingClientRect();

        // 1. Déplacement horizontal intra-carrousel prioritaire pour les cartes
        if ((direction === 'left' || direction === 'right') && current.classList.contains('sh-card')) {
            const track = current.closest('.sh-carousel-track, .sh-gooey-track, .sh-dashboard__item');
            if (track) {
                const siblingCards = Array.from(track.querySelectorAll('.sh-card:not(.sh-card--skeleton)'));
                const currentIndex = siblingCards.indexOf(current);
                if (currentIndex !== -1) {
                    const targetIndex = direction === 'right' ? currentIndex + 1 : currentIndex - 1;
                    if (targetIndex >= 0 && targetIndex < siblingCards.length) {
                        this._setFocus(siblingCards[targetIndex]);
                        return;
                    }
                }
            }
        }

        // 2. Déplacement vertical entre sections
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
                            // Trouver la carte la plus alignée horizontalement
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
                        // Monter vers la barre de genres ou la Dynamic Island
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
        if (this._focusedElement) {
            this._focusedElement.classList.remove('sh-tv-focused');
        }
        this._focusedElement = element;
        element.classList.add('sh-tv-focused');

        // Défilement automatique du carrousel parent
        const scroller = element.closest('.sh-carousel-scroller, .sh-carousel-track-wrapper, .sh-carousel-track, .sh-gooey-scroller');
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

    destroy() {
        if (this._focusedElement) {
            this._focusedElement.classList.remove('sh-tv-focused');
            this._focusedElement = null;
        }
        this._isEnabled = false;
    }
}

export default SpatialNavigation;
