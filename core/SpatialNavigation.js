/**
 * SpaceHub — Spatial Navigation (TV Remote & Multi-Menu Controller)
 * Version: 4.5.0
 *
 * Moteur de navigation spatiale unifié pour télécommandes TV, manettes et claviers.
 * Navigation 100% opérationnelle dans la Fiche Média (.sh-episode-card, .sh-season-pill-btn),
 * les Réglages, la Recherche et tous les menus SpaceHub.
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
        this._invokingElementStack = [];
        this._isEnabled = true;
        this._isTvMode = false;
        this._lastMouseX = null;
        this._lastMouseY = null;
        this._injectStyles();
        this._bindEvents();
        this._log.info('Moteur SpatialNavigation TV v4.5 (Fiches & Menus) actif.');
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

            /* Halo Luminescent sur Boutons, Épisodes, Saisons et Onglets */
            .sh-tv-focused:not(.sh-card) {
                outline: 2.5px solid #ff9f0a !important;
                outline-offset: 3px !important;
                box-shadow: 0 0 22px rgba(255, 159, 10, 0.65), 0 8px 24px rgba(0, 0, 0, 0.85) !important;
                z-index: 9999 !important;
            }

            .sh-episode-card.sh-tv-focused,
            .sh-ep-card.sh-tv-focused,
            .sh-slideup-ep-card.sh-tv-focused {
                outline: 2.5px solid #ff9f0a !important;
                outline-offset: 2px !important;
                background: rgba(255, 159, 10, 0.12) !important;
                transform: scale(1.015) translateY(-2px) !important;
            }

            .sh-genre-chip.sh-tv-focused,
            .sh-nav-tab-btn.sh-tv-focused,
            .sh-season-pill-btn.sh-tv-focused,
            .sh-tab-btn.sh-tv-focused {
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
            if (isInput && e.key !== 'Escape' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

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

        // 2. Bascule Souris
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

        // 3. Mémorisation du survol souris
        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('.sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, .sh-cinema-btn-play, .sh-cinema-btn-glass, .sh-episode-card, .sh-season-pill-btn, button, a');
            if (target) {
                this._lastInteractedElement = target;
            }
        }, { passive: true });

        // 4. Clic Souris
        document.addEventListener('pointerdown', (e) => {
            this.clearFocus();
            this._isTvMode = false;
            const target = e.target.closest('.sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, .sh-cinema-btn-play, .sh-cinema-btn-glass, button, a');
            if (target) {
                this._lastInteractedElement = target;
            }
        }, { passive: true });
    }

    /**
     * Notifie l'ouverture d'une modale pour restreindre et initialiser le focus TV.
     * @param {HTMLElement} container
     * @param {HTMLElement} [defaultFocusEl]
     */
    onModalOpened(container, defaultFocusEl = null) {
        if (this._focusedElement) {
            this._invokingElementStack.push(this._focusedElement);
        }
        this.clearFocus();

        setTimeout(() => {
            const target = defaultFocusEl || container?.querySelector(
                '#sh-slideup-play-btn, .sh-cinema-btn-play, #sh-search-input, .sh-settings-nav__item.active, .sh-console-tab-btn.active, .sh-btn--primary, button:not([disabled])'
            );
            if (target) {
                this._setFocus(target);
            }
        }, 100);
    }

    /**
     * Notifie la fermeture d'une modale pour restituer le focus à l'appelant.
     */
    onModalClosed() {
        this.clearFocus();
        const invokingEl = this._invokingElementStack.pop();
        if (invokingEl && document.body.contains(invokingEl)) {
            setTimeout(() => this._setFocus(invokingEl), 50);
        }
    }

    _handleBack(event) {
        const slideUpModal = document.querySelector('.sh-slideup-sheet--open');
        if (slideUpModal) {
            event?.preventDefault();
            window.SpaceHub?.ui?.modalSlideUpSheet?.close?.();
            this.onModalClosed();
            return;
        }

        const openSettings = document.querySelector('#spacehub-settings');
        if (openSettings) {
            event?.preventDefault();
            openSettings.querySelector('[data-action="close"]')?.click?.();
            this.onModalClosed();
            return;
        }

        const openModal = document.querySelector('.sh-modal-overlay.open, .sh-modal.open, .sh-console-modal-overlay.open');
        if (openModal) {
            event?.preventDefault();
            openModal.remove();
            this.onModalClosed();
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
            '#sh-slideup-play-btn',
            '#sh-slideup-trailer-btn',
            '#sh-btn-audio-popover',
            '.sh-cinema-btn-play',
            '.sh-cinema-btn-glass',
            '.sh-tab-btn',
            '.sh-season-pill-btn',
            '.sh-episode-card',
            '.sh-ep-card',
            '.sh-slideup-ep-card',
            '.sh-cast-card',
            '#sh-search-input',
            '.sh-settings-nav__item',
            '.sh-console-tab-btn',
            '.sh-sidebar-item',
            '.sh-btn:not([disabled])',
            'button:not([disabled]):not(.sh-hero-badge):not(.sh-score-rt):not(.sh-score-imdb):not([style*="display: none"])',
            'a[href]',
            'input:not([disabled])',
            'select:not([disabled])',
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

        if (!this._focusedElement || !document.body.contains(this._focusedElement)) {
            if (this._lastInteractedElement && document.body.contains(this._lastInteractedElement)) {
                const rect = this._lastInteractedElement.getBoundingClientRect();
                if (rect.top >= 0 && rect.bottom <= window.innerHeight && rect.width > 0) {
                    this._setFocus(this._lastInteractedElement);
                    return;
                }
            }

            const centerY = window.innerHeight / 2;
            let closestEl = focusables[0];
            let minCenterDelta = Infinity;

            focusables.forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.top >= 20 && r.bottom <= window.innerHeight - 20) {
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

        // ── 1. LOGIQUE SPÉCIALE DEDANS LA FICHE MÉDIA (ModalSlideUpSheet) ──
        const slideUp = document.querySelector('.sh-slideup-sheet--open');
        if (slideUp && slideUp.contains(current)) {
            // A. Navigation dans les épisodes (Haut/Bas entre épisodes)
            if (current.classList.contains('sh-episode-card')) {
                const episodeCards = Array.from(slideUp.querySelectorAll('.sh-episode-card'));
                const curEpIdx = episodeCards.indexOf(current);
                if (curEpIdx !== -1) {
                    if (direction === 'down' && curEpIdx + 1 < episodeCards.length) {
                        this._setFocus(episodeCards[curEpIdx + 1]);
                        return;
                    } else if (direction === 'up') {
                        if (curEpIdx > 0) {
                            this._setFocus(episodeCards[curEpIdx - 1]);
                            return;
                        } else {
                            // Remonter aux pilules de saison
                            const seasonPill = slideUp.querySelector('.sh-season-pill-btn.active') || slideUp.querySelector('.sh-season-pill-btn');
                            if (seasonPill) { this._setFocus(seasonPill); return; }
                        }
                    }
                }
            }

            // B. Navigation dans les pilules de saisons (Gauche/Droite entre saisons)
            if (current.classList.contains('sh-season-pill-btn')) {
                const seasons = Array.from(slideUp.querySelectorAll('.sh-season-pill-btn'));
                const curSIdx = seasons.indexOf(current);
                if (curSIdx !== -1) {
                    if (direction === 'right' && curSIdx + 1 < seasons.length) {
                        this._setFocus(seasons[curSIdx + 1]);
                        return;
                    } else if (direction === 'left' && curSIdx > 0) {
                        this._setFocus(seasons[curSIdx - 1]);
                        return;
                    } else if (direction === 'down') {
                        const firstEp = slideUp.querySelector('.sh-episode-card');
                        if (firstEp) { this._setFocus(firstEp); return; }
                    } else if (direction === 'up') {
                        const tabBtn = slideUp.querySelector('.sh-tab-btn.active') || slideUp.querySelector('.sh-tab-btn');
                        if (tabBtn) { this._setFocus(tabBtn); return; }
                    }
                }
            }

            // C. Navigation dans les onglets (Gauche/Droite entre onglets)
            if (current.classList.contains('sh-tab-btn')) {
                const tabs = Array.from(slideUp.querySelectorAll('.sh-tab-btn'));
                const curTIdx = tabs.indexOf(current);
                if (curTIdx !== -1) {
                    if (direction === 'right' && curTIdx + 1 < tabs.length) {
                        this._setFocus(tabs[curTIdx + 1]);
                        return;
                    } else if (direction === 'left' && curTIdx > 0) {
                        this._setFocus(tabs[curTIdx - 1]);
                        return;
                    } else if (direction === 'down') {
                        const seasonPill = slideUp.querySelector('.sh-season-pill-btn.active') || slideUp.querySelector('.sh-season-pill-btn');
                        const firstEp = slideUp.querySelector('.sh-episode-card');
                        if (seasonPill) { this._setFocus(seasonPill); return; }
                        if (firstEp) { this._setFocus(firstEp); return; }
                    } else if (direction === 'up') {
                        const playBtn = slideUp.querySelector('#sh-slideup-play-btn, .sh-cinema-btn-play');
                        if (playBtn) { this._setFocus(playBtn); return; }
                    }
                }
            }

            // D. Navigation dans les boutons d'action d'en-tête (Gauche/Droite)
            if (current.closest('.sh-cinema-actions')) {
                const actionBtns = Array.from(slideUp.querySelectorAll('.sh-cinema-btn-play, .sh-cinema-btn-glass'));
                const curBIdx = actionBtns.indexOf(current);
                if (curBIdx !== -1) {
                    if (direction === 'right' && curBIdx + 1 < actionBtns.length) {
                        this._setFocus(actionBtns[curBIdx + 1]);
                        return;
                    } else if (direction === 'left' && curBIdx > 0) {
                        this._setFocus(actionBtns[curBIdx - 1]);
                        return;
                    } else if (direction === 'down') {
                        const tabBtn = slideUp.querySelector('.sh-tab-btn.active') || slideUp.querySelector('.sh-tab-btn');
                        if (tabBtn) { this._setFocus(tabBtn); return; }
                    }
                }
            }
        }

        // ── 2. LOGIQUE DANS LE DASHBOARD & CARROUSELS ──
        if (current.classList.contains('sh-card')) {
            if (direction === 'left' || direction === 'right') {
                const track = current.closest('.sh-card-grid, .sh-carousel-track');
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
            } else if (direction === 'up' || direction === 'down') {
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
        }

        // ── 3. FALLBACK GÉOMÉTRIQUE 2D ──
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

        const scroller = element.closest(
            '.sh-card-grid, .sh-carousel-scroller, .sh-cinema-body, .sh-series-episodes-container, .sh-season-pills-row'
        );
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
