/**
 * SpaceHub — Industrial Spatial Navigation Engine (FocusTree Architecture)
 * Version: 6.5.0
 *
 * Moteur de navigation spatiale déterministe pour Smart TV.
 * Résolution totale des halos arrondis, navigation fluide Dynamic Island,
 * fiches médias sans blocage et descente saisons ➔ épisodes.
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
        this._lastDashboardFocusedCard = null;
        this._lastDashboardFocusedCardId = null;
        this._rowMemory = new Map();
        this._isEnabled = true;
        this._isTvMode = false;
        this._isNavigating = false;
        this._rafId = null;
        this._lastMouseX = null;
        this._lastMouseY = null;

        this._injectStyles();
        this._bindEvents();
        this._log.info('Moteur SpatialNavigation Industriel v6.5 (Zéro Blocage) prêt.');
    }

    _injectStyles() {
        if (document.getElementById('sh-spatial-nav-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-spatial-nav-styles';
        style.textContent = `
            /* ── AURA LUMINESCENTE CINÉMATIQUE SUR CARTES ── */
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
                outline: none !important;
                box-shadow: 
                    0 0 0 2.5px #ff9f0a,
                    0 0 0 4px rgba(255, 255, 255, 0.40),
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

            /* ── HALO PARFAITEMENT ÉPOUSANT SUR TOUS LES BOUTONS ET PILULES (ZÉRO DÉCALAGE / ZÉRO BOXY) ── */
            .sh-genre-chip.sh-tv-focused,
            .sh-season-pill-btn.sh-tv-focused,
            .sh-tab-btn.sh-tv-focused,
            .sh-nav-tab-btn.sh-tv-focused,
            .sh-nav-action-btn.sh-tv-focused,
            .sh-user-avatar-btn.sh-tv-focused,
            .sh-slideup-back-btn.sh-tv-focused,
            .sh-slideup-close-btn.sh-tv-focused,
            .sh-hero-btn-play.sh-tv-focused,
            .sh-hero-btn-glass.sh-tv-focused,
            .sh-cinema-btn-play.sh-tv-focused,
            .sh-cinema-btn-glass.sh-tv-focused,
            .sh-btn.sh-tv-focused,
            .sh-settings-nav__item.sh-tv-focused {
                outline: none !important;
                border-color: #ff9f0a !important;
                box-shadow: 
                    0 0 0 2px #ff9f0a,
                    0 0 16px rgba(255, 159, 10, 0.65) !important;
                transform: none !important;
                z-index: 9999 !important;
            }

            /* ── CARTE ÉPISODE HAUTE COUTURE ── */
            .sh-episode-card.sh-tv-focused,
            .sh-ep-card.sh-tv-focused,
            .sh-slideup-ep-card.sh-tv-focused {
                outline: none !important;
                background: linear-gradient(135deg, rgba(255, 159, 10, 0.20) 0%, rgba(255, 255, 255, 0.08) 100%) !important;
                border: 2px solid #ff9f0a !important;
                transform: scale(1.02) translateY(-2px) !important;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.60), 0 0 24px rgba(255, 159, 10, 0.40) !important;
            }

            .sh-episode-card.sh-tv-focused .sh-episode-overlay-play {
                opacity: 1 !important;
                transform: scale(1.1) !important;
            }
        `;
        document.head.appendChild(style);
    }

    _bindEvents() {
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

        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('.sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, .sh-nav-action-btn, .sh-cinema-btn-play, .sh-cinema-btn-glass, .sh-hero-btn-play, .sh-hero-btn-glass, .sh-slideup-back-btn, .sh-slideup-close-btn, .sh-episode-card, .sh-season-pill-btn, button, a');
            if (target) {
                this._lastInteractedElement = target;
                this._recordElementId(target);
            }
        }, { passive: true });

        document.addEventListener('pointerdown', (e) => {
            this.clearFocus();
            this._isTvMode = false;
            const target = e.target.closest('.sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, .sh-nav-action-btn, .sh-cinema-btn-play, .sh-cinema-btn-glass, .sh-hero-btn-play, .sh-hero-btn-glass, .sh-slideup-back-btn, .sh-slideup-close-btn, button, a');
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

    _detectCurrentScope() {
        if (document.querySelector('.sh-slideup-sheet--open')) return 'modal-sheet';
        if (document.querySelector('#spacehub-settings, .sh-settings-modal')) return 'settings';
        if (document.querySelector('.sh-unified-search-modal.open, #sh-search-input:focus')) return 'search';
        if (document.querySelector('.sh-sidebar--open, .sh-sidebar-drawer.open')) return 'sidebar';
        return 'dashboard';
    }

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

    // ─── 1. SCOPE DASHBOARD (Dynamic Island ⇄ Hero ⇄ Genres ⇄ Carrousels) ───
    _navigateDashboard(direction) {
        let current = this._focusedElement;

        if (!current || !document.body.contains(current)) {
            current = this._reconnectDashboardFocus();
            if (!current) {
                const defaultEl = document.getElementById('sh-hero-btn-play') || document.querySelector('.sh-card:not(.sh-card--skeleton)');
                if (defaultEl) this._setFocus(defaultEl);
                return;
            }
        }

        // A. ZONE DYNAMIC ISLAND (.sh-nav-tab-btn, .sh-nav-action-btn, .sh-user-avatar-btn)
        if (current.classList.contains('sh-nav-tab-btn') || current.classList.contains('sh-nav-action-btn') || current.classList.contains('sh-user-avatar-btn') || current.closest('.sh-dynamic-island')) {
            const island = document.getElementById('sh-dynamic-island');
            const underglow = document.getElementById('sh-island-underglow');
            if (island && !island.classList.contains('sh-island--expanded')) {
                island.classList.remove('sh-island--compact', 'sh-island--collapsing');
                island.classList.add('sh-island--expanded');
                if (underglow) underglow.className = 'sh-island-underglow sh-underglow--expanded';
            }

            const islandItems = Array.from(document.querySelectorAll('.sh-dynamic-island .sh-nav-tab-btn, .sh-dynamic-island .sh-nav-action-btn, .sh-dynamic-island .sh-user-avatar-btn'));
            const curIdx = islandItems.indexOf(current);

            if (direction === 'right' && curIdx !== -1 && curIdx + 1 < islandItems.length) {
                return this._setFocus(islandItems[curIdx + 1]);
            } else if (direction === 'left' && curIdx !== -1 && curIdx > 0) {
                return this._setFocus(islandItems[curIdx - 1]);
            } else if (direction === 'down') {
                // Replier doucement l'island et descendre vers le Hero
                if (island) {
                    island.classList.remove('sh-island--expanded');
                    island.classList.add('sh-island--compact');
                    if (underglow) underglow.className = 'sh-island-underglow sh-underglow--compact';
                }

                const heroPlay = document.getElementById('sh-hero-btn-play') || document.querySelector('.sh-hero-btn-play');
                if (heroPlay) return this._setFocus(heroPlay);

                const firstChip = document.querySelector('.sh-genre-chip.active') || document.querySelector('.sh-genre-chip');
                if (firstChip) return this._setFocus(firstChip);

                const firstCard = document.querySelector('.sh-dashboard__grid .sh-card:not(.sh-card--skeleton)');
                if (firstCard) return this._setFocus(firstCard);
            }
            return;
        }

        // B. ZONE HERO ACTIONS (#sh-hero-btn-play, trailer, details)
        if (current.id === 'sh-hero-btn-play' || current.id === 'sh-hero-btn-trailer' || current.id === 'sh-hero-btn-details') {
            if (direction === 'right') {
                if (current.id === 'sh-hero-btn-play') { const next = document.getElementById('sh-hero-btn-trailer'); if (next) return this._setFocus(next); }
                if (current.id === 'sh-hero-btn-trailer') { const next = document.getElementById('sh-hero-btn-details'); if (next) return this._setFocus(next); }
            } else if (direction === 'left') {
                if (current.id === 'sh-hero-btn-details') { const prev = document.getElementById('sh-hero-btn-trailer'); if (prev) return this._setFocus(prev); }
                if (current.id === 'sh-hero-btn-trailer') { const prev = document.getElementById('sh-hero-btn-play'); if (prev) return this._setFocus(prev); }
            } else if (direction === 'down') {
                const firstChip = document.querySelector('.sh-genre-chip.active') || document.querySelector('.sh-genre-chip');
                if (firstChip) return this._setFocus(firstChip);

                const firstCard = document.querySelector('.sh-dashboard__grid .sh-card:not(.sh-card--skeleton)');
                if (firstCard) return this._setFocus(firstCard);
            } else if (direction === 'up') {
                const island = document.getElementById('sh-dynamic-island');
                const underglow = document.getElementById('sh-island-underglow');
                if (island) {
                    island.classList.remove('sh-island--compact', 'sh-island--collapsing');
                    island.classList.add('sh-island--expanded');
                    if (underglow) underglow.className = 'sh-island-underglow sh-underglow--expanded';
                }
                const navTab = document.querySelector('.sh-nav-tab-btn.active') || document.querySelector('.sh-nav-tab-btn');
                if (navTab) return this._setFocus(navTab);
            }
            return;
        }

        // C. ZONE BARRE DE GENRES (.sh-genre-chip)
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

        // D. ZONE CARROUSELS (.sh-dashboard__item -> .sh-card)
        if (current.classList.contains('sh-card')) {
            const allRows = Array.from(document.querySelectorAll('.sh-dashboard__item')).filter(r => r.querySelector('.sh-card:not(.sh-card--skeleton)'));
            const currentRow = current.closest('.sh-dashboard__item');
            const rowIdx = allRows.indexOf(currentRow);

            if (currentRow && rowIdx !== -1) {
                const currentCards = Array.from(currentRow.querySelectorAll('.sh-card:not(.sh-card--skeleton)'));
                const cardIdx = currentCards.indexOf(current);

                this._rowMemory.set(rowIdx, Math.max(0, cardIdx));

                if (direction === 'right' && cardIdx !== -1 && cardIdx + 1 < currentCards.length) {
                    return this._setFocus(currentCards[cardIdx + 1]);
                } else if (direction === 'left' && cardIdx !== -1 && cardIdx > 0) {
                    return this._setFocus(currentCards[cardIdx - 1]);
                }

                if (direction === 'down') {
                    if (rowIdx + 1 < allRows.length) {
                        const nextRow = allRows[rowIdx + 1];
                        const nextCards = Array.from(nextRow.querySelectorAll('.sh-card:not(.sh-card--skeleton)'));
                        if (nextCards.length > 0) {
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
                        const activeChip = document.querySelector('.sh-genre-chip.active') || document.querySelector('.sh-genre-chip');
                        if (activeChip) return this._setFocus(activeChip);
                    }
                }
            }
            return;
        }

        // Fallback
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
            return;
        }

        // A. BOUTONS DE LA BARRE DU HAUT (Retour & Fermer)
        if (current.id === 'sh-slideup-back' || current.classList.contains('sh-slideup-back-btn')) {
            if (direction === 'right') {
                const closeBtn = sheet.querySelector('#sh-slideup-close, .sh-slideup-close-btn');
                if (closeBtn) return this._setFocus(closeBtn);
            } else if (direction === 'down') {
                const playBtn = sheet.querySelector('#sh-slideup-play-btn, .sh-cinema-btn-play');
                if (playBtn) return this._setFocus(playBtn);
            }
            return;
        }

        if (current.id === 'sh-slideup-close' || current.classList.contains('sh-slideup-close-btn')) {
            if (direction === 'left') {
                const backBtn = sheet.querySelector('#sh-slideup-back, .sh-slideup-back-btn');
                if (backBtn) return this._setFocus(backBtn);
            } else if (direction === 'down') {
                const trailerBtn = sheet.querySelector('#sh-slideup-trailer-btn, .sh-cinema-btn-glass') || sheet.querySelector('#sh-slideup-play-btn');
                if (trailerBtn) return this._setFocus(trailerBtn);
            }
            return;
        }

        // B. BOUTONS D'ACTION PRINCIPAUX (Regarder, Bande-annonce, Audio)
        if (current.closest('.sh-cinema-actions')) {
            const actionBtns = Array.from(sheet.querySelectorAll('.sh-cinema-btn-play, .sh-cinema-btn-glass'));
            const curIdx = actionBtns.indexOf(current);

            if (direction === 'right' && curIdx !== -1 && curIdx + 1 < actionBtns.length) {
                return this._setFocus(actionBtns[curIdx + 1]);
            } else if (direction === 'left' && curIdx !== -1 && curIdx > 0) {
                return this._setFocus(actionBtns[curIdx - 1]);
            } else if (direction === 'up') {
                const backBtn = sheet.querySelector('#sh-slideup-back, .sh-slideup-back-btn');
                if (backBtn) return this._setFocus(backBtn);
            } else if (direction === 'down') {
                const tabBtn = sheet.querySelector('.sh-tab-btn.active') || sheet.querySelector('.sh-tab-btn');
                if (tabBtn) return this._setFocus(tabBtn);
            }
            return;
        }

        // C. ONGLETS DE NAVIGATION (.sh-tab-btn)
        if (current.classList.contains('sh-tab-btn')) {
            const tabs = Array.from(sheet.querySelectorAll('.sh-tab-btn'));
            const curIdx = tabs.indexOf(current);

            if (direction === 'right' && curIdx !== -1 && curIdx + 1 < tabs.length) {
                return this._setFocus(tabs[curIdx + 1]);
            } else if (direction === 'left' && curIdx !== -1 && curIdx > 0) {
                return this._setFocus(tabs[curIdx - 1]);
            } else if (direction === 'up') {
                const playBtn = sheet.querySelector('#sh-slideup-play-btn, .sh-cinema-btn-play');
                if (playBtn) return this._setFocus(playBtn);
            } else if (direction === 'down') {
                // Descendre vers les saisons ou les épisodes
                const seasonPill = sheet.querySelector('.sh-season-pill-btn.active') || sheet.querySelector('.sh-season-pill-btn');
                if (seasonPill) return this._setFocus(seasonPill);

                const firstEp = sheet.querySelector('.sh-episodes-cards-grid .sh-episode-card') || sheet.querySelector('.sh-episode-card');
                if (firstEp) return this._setFocus(firstEp);
            }
            return;
        }

        // D. SÉLECTEUR DE SAISONS (.sh-season-pill-btn)
        if (current.classList.contains('sh-season-pill-btn')) {
            const seasons = Array.from(sheet.querySelectorAll('.sh-season-pill-btn'));
            const curIdx = seasons.indexOf(current);

            if (direction === 'right' && curIdx !== -1 && curIdx + 1 < seasons.length) {
                return this._setFocus(seasons[curIdx + 1]);
            } else if (direction === 'left' && curIdx !== -1 && curIdx > 0) {
                return this._setFocus(seasons[curIdx - 1]);
            } else if (direction === 'up') {
                const tabBtn = sheet.querySelector('.sh-tab-btn.active') || sheet.querySelector('.sh-tab-btn');
                if (tabBtn) return this._setFocus(tabBtn);
            } else if (direction === 'down') {
                // Descendre impérativement dans les épisodes de la saison
                const firstEp = sheet.querySelector('.sh-episodes-cards-grid .sh-episode-card') || sheet.querySelector('.sh-episode-card');
                if (firstEp) return this._setFocus(firstEp);
            }
            return;
        }

        // E. GRILLE DES ÉPISODES (.sh-episode-card)
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
    }

    // ─── 3. SCOPES SECONDAIRES ──────────────────────────────────────────────
    _navigateSettings(direction) {
        const container = document.querySelector('#spacehub-settings, .sh-settings-modal');
        if (!container) return;
        const focusables = this._getFocusablesInContainer(container);
        if (focusables.length === 0) return;

        let current = this._focusedElement;
        if (!current || !container.contains(current)) return this._setFocus(focusables[0]);

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
            if (direction === 'down' && results.length > 0) return this._setFocus(results[0]);
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
        if (!current || !items.includes(current)) return this._setFocus(items[0]);

        const curIdx = items.indexOf(current);
        if (direction === 'down' && curIdx + 1 < items.length) {
            this._setFocus(items[curIdx + 1]);
        } else if (direction === 'up' && curIdx > 0) {
            this._setFocus(items[curIdx - 1]);
        }
    }

    // ─── UTILITAIRES & FOCUS MANAGEMENT ──────────────────────────────────────
    _reconnectDashboardFocus() {
        if (this._lastDashboardFocusedCard && document.body.contains(this._lastDashboardFocusedCard)) {
            return this._lastDashboardFocusedCard;
        }
        if (this._lastDashboardFocusedCardId) {
            const reconnected = document.querySelector(`.sh-card[data-id="${this._lastDashboardFocusedCardId}"], .sh-card[data-item-id="${this._lastDashboardFocusedCardId}"]`);
            if (reconnected) {
                this._lastDashboardFocusedCard = reconnected;
                return reconnected;
            }
        }
        if (this._lastFocusedId) {
            const reconnected = document.querySelector(`[data-id="${this._lastFocusedId}"], [data-item-id="${this._lastFocusedId}"], #${this._lastFocusedId}`);
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
            '#sh-slideup-back',
            '#sh-slideup-close',
            '#sh-slideup-play-btn',
            '#sh-slideup-trailer-btn',
            '#sh-btn-audio-popover',
            '.sh-cinema-btn-play',
            '.sh-cinema-btn-glass',
            '.sh-tab-btn',
            '.sh-season-pill-btn',
            '.sh-episode-card',
            '.sh-nav-tab-btn',
            '.sh-nav-action-btn',
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

        // Si l'élément est une carte du Dashboard, mémoriser de façon permanente
        if (element.classList.contains('sh-card')) {
            this._lastDashboardFocusedCard = element;
            this._lastDashboardFocusedCardId = element.dataset?.id || element.dataset?.itemId || null;
        }

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
        const invokingEl = this._focusedElement || this._lastInteractedElement;
        if (invokingEl) {
            this._invokingElementStack.push({
                element: invokingEl,
                id: invokingEl.dataset?.id || invokingEl.dataset?.itemId || invokingEl.dataset?.epId || invokingEl.id || null
            });
        }
        this.clearFocus();

        setTimeout(() => {
            const target = defaultFocusEl || container?.querySelector('#sh-slideup-play-btn, .sh-cinema-btn-play, #sh-search-input, .sh-btn--primary');
            if (target) {
                this._setFocus(target);
            } else {
                const backBtn = container?.querySelector('#sh-slideup-back, .sh-slideup-back-btn');
                if (backBtn) this._setFocus(backBtn);
            }
        }, 80);
    }

    onModalClosed() {
        this.clearFocus();
        setTimeout(() => {
            let target = this._lastDashboardFocusedCard;
            if (!target || !document.body.contains(target)) {
                if (this._lastDashboardFocusedCardId) {
                    target = document.querySelector(`.sh-card[data-id="${this._lastDashboardFocusedCardId}"], .sh-card[data-item-id="${this._lastDashboardFocusedCardId}"]`);
                }
            }
            if (!target) {
                const saved = this._invokingElementStack.pop();
                if (saved?.element && document.body.contains(saved.element)) target = saved.element;
            }
            if (!target) {
                target = document.querySelector('.sh-dashboard__grid .sh-card:not(.sh-card--skeleton)');
            }
            if (target) {
                this._setFocus(target);
            }
        }, 50);
    }

    _handleBack(event) {
        const slideUpModal = document.querySelector('.sh-slideup-sheet--open');
        if (slideUpModal) {
            event?.preventDefault();
            window.SpaceHub?.ui?.modalSlideUpSheet?.close?.();
            return;
        }

        const openSettings = document.querySelector('#spacehub-settings');
        if (openSettings) {
            event?.preventDefault();
            openSettings.querySelector('[data-action="close"]')?.click?.();
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
