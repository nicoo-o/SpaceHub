/**
 * SpaceHub — Industrial Spatial Navigation Engine (FocusTree Architecture)
 * Version: 6.0.0
 *
 * Moteur de navigation spatiale déterministe pour Smart TV (Apple TV, Android TV, Tizen, WebOS).
 * Basé sur le standard d'arbre virtuel FocusTree, scopes isolés et mémoires de rangées.
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
        this._lastFocusedId = null;
        this._lastInteractedElement = null;
        this._invokingElementStack = [];
        this._rowMemory = new Map(); // Mémorisation de l'index actif par rangée
        this._isEnabled = true;
        this._isTvMode = false;
        this._isNavigating = false;
        this._rafId = null;
        this._lastMouseX = null;
        this._lastMouseY = null;

        this._injectStyles();
        this._bindEvents();
        this._log.info('Moteur SpatialNavigation Industriel v6.0 (FocusTree) prêt.');
    }

    _injectStyles() {
        if (document.getElementById('sh-spatial-nav-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-spatial-nav-styles';
        style.textContent = `
            /* ── Apple TV 4K Pure Luminescent Aura & Hardware Composite ── */
            .sh-card {
                will-change: transform;
                backface-visibility: hidden;
                transform: translate3d(0, 0, 0);
            }

            .sh-card.sh-tv-focused {
                outline: none !important;
                box-shadow: none !important;
                transform: translate3d(0, -7px, 0) scale3d(1.03, 1.03, 1) !important;
                z-index: 100 !important;
            }

            .sh-card.sh-tv-focused .sh-card__image-wrap {
                outline: 2.5px solid #ff9f0a !important;
                outline-offset: 2.5px !important;
                box-shadow: 
                    0 0 0 1px rgba(255, 255, 255, 0.40),
                    0 0 32px rgba(255, 159, 10, 0.65),
                    0 18px 44px rgba(0, 0, 0, 0.95),
                    inset 0 1px 1px rgba(255, 255, 255, 0.70) !important;
            }

            .sh-card.sh-tv-focused .sh-card__action-pill {
                transform: translateX(-50%) translateY(0) scale(1) !important;
                opacity: 1 !important;
            }

            .sh-card.sh-tv-focused .sh-card__image {
                transform: scale(1.045) !important;
            }

            .sh-card.sh-tv-focused .sh-card__codec-tag {
                opacity: 0 !important;
                transform: translateY(12px) !important;
            }

            /* ── Halo Luminescent sur Boutons d'Action & Onglets ── */
            .sh-tv-focused:not(.sh-card) {
                outline: 2.5px solid #ff9f0a !important;
                outline-offset: 2.5px !important;
                box-shadow: 
                    0 0 0 1px rgba(255, 255, 255, 0.35),
                    0 0 24px rgba(255, 159, 10, 0.60),
                    0 10px 28px rgba(0, 0, 0, 0.85) !important;
                z-index: 9999 !important;
            }

            /* ── Carte Épisode Haute Visibilité ── */
            .sh-episode-card.sh-tv-focused,
            .sh-ep-card.sh-tv-focused,
            .sh-slideup-ep-card.sh-tv-focused {
                outline: 2.5px solid #ff9f0a !important;
                outline-offset: 2px !important;
                background: linear-gradient(135deg, rgba(255, 159, 10, 0.20) 0%, rgba(255, 255, 255, 0.08) 100%) !important;
                border-color: #ff9f0a !important;
                transform: scale(1.02) translateY(-2px) !important;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.60), 0 0 20px rgba(255, 159, 10, 0.35) !important;
            }

            .sh-episode-card.sh-tv-focused .sh-episode-overlay-play {
                opacity: 1 !important;
                transform: scale(1.1) !important;
            }

            /* ── Pilules et Badges Actifs ── */
            .sh-genre-chip.sh-tv-focused,
            .sh-nav-tab-btn.sh-tv-focused,
            .sh-season-pill-btn.sh-tv-focused,
            .sh-tab-btn.sh-tv-focused {
                background: rgba(255, 159, 10, 0.30) !important;
                border-color: #ff9f0a !important;
                transform: translateY(-2px) !important;
            }
        `;
        document.head.appendChild(style);
    }

    _bindEvents() {
        // 1. Événements Clavier / D-Pad
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
                    this._queueDirection(e.key.replace('Arrow', '').toLowerCase());
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

        // 2. Bascule Souris Fluide
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
            const target = e.target.closest('.sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, .sh-cinema-btn-play, .sh-cinema-btn-glass, .sh-hero-btn-play, .sh-hero-btn-glass, .sh-episode-card, .sh-season-pill-btn, button, a');
            if (target) {
                this._lastInteractedElement = target;
                this._recordElementId(target);
            }
        }, { passive: true });

        // 4. Clic Souris
        document.addEventListener('pointerdown', (e) => {
            this.clearFocus();
            this._isTvMode = false;
            const target = e.target.closest('.sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, .sh-cinema-btn-play, .sh-cinema-btn-glass, .sh-hero-btn-play, .sh-hero-btn-glass, button, a');
            if (target) {
                this._lastInteractedElement = target;
                this._recordElementId(target);
            }
        }, { passive: true });
    }

    _queueDirection(direction) {
        if (this._isNavigating) return;
        this._isNavigating = true;

        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = requestAnimationFrame(() => {
            this._navigateDirectional(direction);
            this._isNavigating = false;
        });
    }

    _recordElementId(el) {
        if (!el) return;
        this._lastFocusedId = el.dataset?.id || el.dataset?.itemId || el.dataset?.epId || el.id || null;
    }

    /**
     * Détermine le scope actif exclusif (Dashboard, Fiche Média, Réglages, etc.).
     * @returns {'modal-sheet' | 'settings' | 'search' | 'sidebar' | 'dashboard'}
     */
    _detectCurrentScope() {
        if (document.querySelector('.sh-slideup-sheet--open')) return 'modal-sheet';
        if (document.querySelector('#spacehub-settings, .sh-settings-overlay.open')) return 'settings';
        if (document.querySelector('.sh-unified-search-modal.open, #sh-search-input:focus')) return 'search';
        if (document.querySelector('.sh-sidebar--open, .sh-sidebar-drawer.open')) return 'sidebar';
        return 'dashboard';
    }

    /**
     * Cœur du Moteur Déterministe FocusTree (Routage selon le Scope).
     */
    _navigateDirectional(direction) {
        const scope = this._detectCurrentScope();
        
        switch (scope) {
            case 'modal-sheet':
                this._navigateModalSheet(direction);
                break;
            case 'settings':
                this._navigateSettings(direction);
                break;
            case 'search':
                this._navigateSearch(direction);
                break;
            case 'sidebar':
                this._navigateSidebar(direction);
                break;
            case 'dashboard':
            default:
                this._navigateDashboard(direction);
                break;
        }
    }

    // ─── 1. SCOPE DASHBOARD (Hero ⇄ Genres ⇄ Carrousels ⇄ Dynamic Island) ────
    _navigateDashboard(direction) {
        let current = this._focusedElement;

        // Auto-reconnexion si le nœud actuel a été détaché du DOM
        if (!current || !document.body.contains(current)) {
            current = this._reconnectDashboardFocus();
            if (!current) {
                // Point d'entrée par défaut : Premier bouton du Hero ou premier film
                const defaultEl = document.getElementById('sh-hero-btn-play') || document.querySelector('.sh-card:not(.sh-card--skeleton)');
                if (defaultEl) this._setFocus(defaultEl);
                return;
            }
        }

        // A. Zone HERO ACTIONS (#sh-hero-btn-play, trailer, details)
        if (current.id === 'sh-hero-btn-play' || current.id === 'sh-hero-btn-trailer' || current.id === 'sh-hero-btn-details') {
            if (direction === 'right') {
                if (current.id === 'sh-hero-btn-play') { const next = document.getElementById('sh-hero-btn-trailer'); if (next) return this._setFocus(next); }
                if (current.id === 'sh-hero-btn-trailer') { const next = document.getElementById('sh-hero-btn-details'); if (next) return this._setFocus(next); }
            } else if (direction === 'left') {
                if (current.id === 'sh-hero-btn-details') { const prev = document.getElementById('sh-hero-btn-trailer'); if (prev) return this._setFocus(prev); }
                if (current.id === 'sh-hero-btn-trailer') { const prev = document.getElementById('sh-hero-btn-play'); if (prev) return this._setFocus(prev); }
            } else if (direction === 'down') {
                // Descendre vers la barre de genres ou directement le premier carrousel
                const firstChip = document.querySelector('.sh-genre-chip.active') || document.querySelector('.sh-genre-chip');
                if (firstChip) return this._setFocus(firstChip);

                const firstCard = document.querySelector('.sh-dashboard__grid .sh-card:not(.sh-card--skeleton)');
                if (firstCard) return this._setFocus(firstCard);
            } else if (direction === 'up') {
                const navTab = document.querySelector('.sh-dynamic-island, .sh-nav-tab-btn.active, .sh-nav-tab-btn');
                if (navTab) return this._setFocus(navTab);
            }
            return;
        }

        // B. Zone BARRE DE GENRES (.sh-genre-chip)
        if (current.classList.contains('sh-genre-chip')) {
            const chips = Array.from(document.querySelectorAll('.sh-genre-chip'));
            const curIdx = chips.indexOf(current);
            if (direction === 'right' && curIdx !== -1 && curIdx + 1 < chips.length) {
                return this._setFocus(chips[curIdx + 1]);
            } else if (direction === 'left' && curIdx !== -1 && curIdx > 0) {
                return this._setFocus(chips[curIdx - 1]);
            } else if (direction === 'up') {
                const heroPlay = document.getElementById('sh-hero-btn-play') || document.querySelector('.sh-hero-btn-play');
                if (heroPlay) return this._setFocus(heroPlay);
            } else if (direction === 'down') {
                // Descendre sur le premier carrousel du Dashboard (avec restauration de la mémoire de colonne)
                const firstRow = document.querySelector('.sh-dashboard__item');
                if (firstRow) {
                    const cards = Array.from(firstRow.querySelectorAll('.sh-card:not(.sh-card--skeleton)'));
                    if (cards.length > 0) {
                        const savedIdx = this._rowMemory.get(0) || 0;
                        const targetCard = cards[Math.min(savedIdx, cards.length - 1)];
                        return this._setFocus(targetCard);
                    }
                }
            }
            return;
        }

        // C. Zone CARROUSELS DU DASHBOARD (.sh-dashboard__item -> .sh-card)
        if (current.classList.contains('sh-card')) {
            const allRows = Array.from(document.querySelectorAll('.sh-dashboard__item')).filter(r => r.querySelector('.sh-card:not(.sh-card--skeleton)'));
            const currentRow = current.closest('.sh-dashboard__item');
            const rowIdx = allRows.indexOf(currentRow);

            if (currentRow && rowIdx !== -1) {
                const currentCards = Array.from(currentRow.querySelectorAll('.sh-card:not(.sh-card--skeleton)'));
                const cardIdx = currentCards.indexOf(current);

                // Mémoriser la position dans ce rayon
                this._rowMemory.set(rowIdx, Math.max(0, cardIdx));

                // 1. Navigation intra-rayon (Gauche / Droite)
                if (direction === 'right' && cardIdx !== -1 && cardIdx + 1 < currentCards.length) {
                    return this._setFocus(currentCards[cardIdx + 1]);
                } else if (direction === 'left' && cardIdx !== -1 && cardIdx > 0) {
                    return this._setFocus(currentCards[cardIdx - 1]);
                }

                // 2. Navigation inter-rayons (Haut / Bas)
                if (direction === 'down') {
                    if (rowIdx + 1 < allRows.length) {
                        const nextRow = allRows[rowIdx + 1];
                        const nextCards = Array.from(nextRow.querySelectorAll('.sh-card:not(.sh-card--skeleton)'));
                        if (nextCards.length > 0) {
                            // Alignement géométrique horizontal optimal
                            const currentX = current.getBoundingClientRect().left;
                            let bestCard = nextCards[0];
                            let minDeltaX = Infinity;
                            nextCards.forEach(c => {
                                const dx = Math.abs(c.getBoundingClientRect().left - currentX);
                                if (dx < minDeltaX) { minDeltaX = dx; bestCard = c; }
                            });
                            return this._setFocus(bestCard);
                        }
                    }
                } else if (direction === 'up') {
                    if (rowIdx > 0) {
                        const prevRow = allRows[rowIdx - 1];
                        const prevCards = Array.from(prevRow.querySelectorAll('.sh-card:not(.sh-card--skeleton)'));
                        if (prevCards.length > 0) {
                            const currentX = current.getBoundingClientRect().left;
                            let bestCard = prevCards[0];
                            let minDeltaX = Infinity;
                            prevCards.forEach(c => {
                                const dx = Math.abs(c.getBoundingClientRect().left - currentX);
                                if (dx < minDeltaX) { minDeltaX = dx; bestCard = c; }
                            });
                            return this._setFocus(bestCard);
                        }
                    } else if (rowIdx === 0) {
                        // Remonter vers la barre de genres
                        const activeChip = document.querySelector('.sh-genre-chip.active') || document.querySelector('.sh-genre-chip');
                        if (activeChip) return this._setFocus(activeChip);
                    }
                }
            }
            return;
        }

        // D. Fallback générique Dashboard
        const focusables = this._getFocusablesInContainer(document.body);
        if (focusables.length > 0) this._setFocus(focusables[0]);
    }

    // ─── 2. SCOPE FICHE MÉDIA (ModalSlideUpSheet) ───────────────────────────
    _navigateModalSheet(direction) {
        const sheet = document.querySelector('.sh-slideup-sheet--open');
        if (!sheet) return;

        let current = this._focusedElement;
        if (!current || !sheet.contains(current)) {
            const playBtn = sheet.querySelector('#sh-slideup-play-btn, .sh-cinema-btn-play');
            if (playBtn) return this._setFocus(playBtn);
            const firstFocusable = this._getFocusablesInContainer(sheet)[0];
            if (firstFocusable) return this._setFocus(firstFocusable);
            return;
        }

        // A. ÉPISODES (.sh-episode-card)
        if (current.classList.contains('sh-episode-card')) {
            const episodes = Array.from(sheet.querySelectorAll('.sh-episode-card'));
            const curIdx = episodes.indexOf(current);
            if (direction === 'down' && curIdx !== -1 && curIdx + 1 < episodes.length) {
                return this._setFocus(episodes[curIdx + 1]);
            } else if (direction === 'up') {
                if (curIdx > 0) {
                    return this._setFocus(episodes[curIdx - 1]);
                } else {
                    const seasonPill = sheet.querySelector('.sh-season-pill-btn.active') || sheet.querySelector('.sh-season-pill-btn');
                    if (seasonPill) return this._setFocus(seasonPill);
                    const tabBtn = sheet.querySelector('.sh-tab-btn.active') || sheet.querySelector('.sh-tab-btn');
                    if (tabBtn) return this._setFocus(tabBtn);
                }
            }
            return;
        }

        // B. SAISONS (.sh-season-pill-btn)
        if (current.classList.contains('sh-season-pill-btn')) {
            const seasons = Array.from(sheet.querySelectorAll('.sh-season-pill-btn'));
            const curIdx = seasons.indexOf(current);
            if (direction === 'right' && curIdx !== -1 && curIdx + 1 < seasons.length) {
                return this._setFocus(seasons[curIdx + 1]);
            } else if (direction === 'left' && curIdx !== -1 && curIdx > 0) {
                return this._setFocus(seasons[curIdx - 1]);
            } else if (direction === 'down') {
                const firstEp = sheet.querySelector('.sh-episode-card');
                if (firstEp) return this._setFocus(firstEp);
            } else if (direction === 'up') {
                const tabBtn = sheet.querySelector('.sh-tab-btn.active') || sheet.querySelector('.sh-tab-btn');
                if (tabBtn) return this._setFocus(tabBtn);
            }
            return;
        }

        // C. ONGLETS (.sh-tab-btn)
        if (current.classList.contains('sh-tab-btn')) {
            const tabs = Array.from(sheet.querySelectorAll('.sh-tab-btn'));
            const curIdx = tabs.indexOf(current);
            if (direction === 'right' && curIdx !== -1 && curIdx + 1 < tabs.length) {
                return this._setFocus(tabs[curIdx + 1]);
            } else if (direction === 'left' && curIdx !== -1 && curIdx > 0) {
                return this._setFocus(tabs[curIdx - 1]);
            } else if (direction === 'down') {
                const seasonPill = sheet.querySelector('.sh-season-pill-btn.active') || sheet.querySelector('.sh-season-pill-btn');
                if (seasonPill) return this._setFocus(seasonPill);
                const firstEp = sheet.querySelector('.sh-episode-card');
                if (firstEp) return this._setFocus(firstEp);
            } else if (direction === 'up') {
                const playBtn = sheet.querySelector('#sh-slideup-play-btn, .sh-cinema-btn-play');
                if (playBtn) return this._setFocus(playBtn);
            }
            return;
        }

        // D. BOUTONS D'ACTIONS D'EN-TÊTE
        if (current.closest('.sh-cinema-actions')) {
            const actionBtns = Array.from(sheet.querySelectorAll('.sh-cinema-btn-play, .sh-cinema-btn-glass'));
            const curIdx = actionBtns.indexOf(current);
            if (direction === 'right' && curIdx !== -1 && curIdx + 1 < actionBtns.length) {
                return this._setFocus(actionBtns[curIdx + 1]);
            } else if (direction === 'left' && curIdx !== -1 && curIdx > 0) {
                return this._setFocus(actionBtns[curIdx - 1]);
            } else if (direction === 'down') {
                const tabBtn = sheet.querySelector('.sh-tab-btn.active') || sheet.querySelector('.sh-tab-btn');
                if (tabBtn) return this._setFocus(tabBtn);
            }
            return;
        }
    }

    // ─── 3. SCOPES SECONDAIRES (Réglages, Recherche, Tiroir) ────────────────
    _navigateSettings(direction) {
        const container = document.querySelector('#spacehub-settings, .sh-settings-modal');
        if (!container) return;
        const focusables = this._getFocusablesInContainer(container);
        if (focusables.length === 0) return;

        let current = this._focusedElement;
        if (!current || !container.contains(current)) {
            return this._setFocus(focusables[0]);
        }

        const curIdx = focusables.indexOf(current);
        if (direction === 'down' && curIdx + 1 < focusables.length) {
            this._setFocus(focusables[curIdx + 1]);
        } else if (direction === 'up' && curIdx > 0) {
            this._setFocus(focusables[curIdx - 1]);
        }
    }

    _navigateSearch(direction) {
        const searchInput = document.getElementById('sh-search-input');
        const results = Array.from(document.querySelectorAll('.sh-unified-search-modal .sh-card:not(.sh-card--skeleton)'));

        if (this._focusedElement === searchInput) {
            if (direction === 'down' && results.length > 0) {
                return this._setFocus(results[0]);
            }
        } else if (results.includes(this._focusedElement)) {
            const curIdx = results.indexOf(this._focusedElement);
            if (direction === 'up' && curIdx === 0 && searchInput) {
                return this._setFocus(searchInput);
            } else if (direction === 'right' && curIdx + 1 < results.length) {
                return this._setFocus(results[curIdx + 1]);
            } else if (direction === 'left' && curIdx > 0) {
                return this._setFocus(results[curIdx - 1]);
            }
        }
    }

    _navigateSidebar(direction) {
        const items = Array.from(document.querySelectorAll('.sh-sidebar-item, .sh-sidebar-drawer a, .sh-sidebar-drawer button'));
        if (items.length === 0) return;

        let current = this._focusedElement;
        if (!current || !items.includes(current)) {
            return this._setFocus(items[0]);
        }

        const curIdx = items.indexOf(current);
        if (direction === 'down' && curIdx + 1 < items.length) {
            this._setFocus(items[curIdx + 1]);
        } else if (direction === 'up' && curIdx > 0) {
            this._setFocus(items[curIdx - 1]);
        }
    }

    // ─── UTILITAIRES & FOCUS MANAGEMENT ──────────────────────────────────────
    _reconnectDashboardFocus() {
        if (this._lastFocusedId) {
            const reconnected = document.querySelector(
                `[data-id="${this._lastFocusedId}"], [data-item-id="${this._lastFocusedId}"], #${this._lastFocusedId}`
            );
            if (reconnected) return reconnected;
        }
        return null;
    }

    _getFocusablesInContainer(container) {
        const selector = [
            '#sh-hero-btn-play',
            '#sh-hero-btn-trailer',
            '#sh-hero-btn-details',
            '.sh-genre-chip',
            '.sh-card:not(.sh-card--skeleton)',
            '#sh-slideup-play-btn',
            '#sh-slideup-trailer-btn',
            '#sh-btn-audio-popover',
            '.sh-cinema-btn-play',
            '.sh-cinema-btn-glass',
            '.sh-tab-btn',
            '.sh-season-pill-btn',
            '.sh-episode-card',
            '#sh-search-input',
            '.sh-settings-nav__item',
            '.sh-sidebar-item',
            'button:not([disabled]):not(.sh-hero-badge):not(.sh-score-rt):not(.sh-score-imdb)',
            'a[href]',
            'input:not([disabled])',
            '[tabindex="0"]:not(.sh-hero-badge):not(.sh-score-rt):not(.sh-score-imdb)'
        ].join(', ');

        return Array.from(container.querySelectorAll(selector)).filter(el => {
            if (
                el.classList.contains('sh-hero-badge') ||
                el.classList.contains('sh-score-rt') ||
                el.classList.contains('sh-score-imdb') ||
                el.classList.contains('sh-modal-header-badge') ||
                el.classList.contains('sh-critics-bento-card') ||
                el.closest('.sh-cinema-meta-line') ||
                el.closest('.sh-hero-meta')
            ) {
                return false;
            }
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
        });
    }

    _setFocus(element) {
        if (!element) return;
        this.clearFocus();

        this._focusedElement = element;
        this._lastInteractedElement = element;
        this._recordElementId(element);
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

    onModalOpened(container, defaultFocusEl = null) {
        if (this._focusedElement) {
            this._invokingElementStack.push(this._focusedElement);
        }
        this.clearFocus();

        setTimeout(() => {
            const target = defaultFocusEl || container?.querySelector(
                '#sh-slideup-play-btn, .sh-cinema-btn-play, #sh-search-input, .sh-settings-nav__item.active, .sh-console-tab-btn.active, .sh-btn--primary, button:not([disabled])'
            );
            if (target) this._setFocus(target);
        }, 80);
    }

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

    clearFocus() {
        if (this._focusedElement) {
            this._focusedElement.classList.remove('sh-tv-focused');
            this._focusedElement = null;
        }
        document.querySelectorAll('.sh-tv-focused').forEach(el => el.classList.remove('sh-tv-focused'));
    }

    destroy() {
        this.clearFocus();
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._isEnabled = false;
    }
}

export default SpatialNavigation;
