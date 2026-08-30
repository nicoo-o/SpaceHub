/**
 * SpaceHub — Spatial Navigation Engine (Grand Cinema Edition v8.0 Stable Core)
 * Version: 8.0.0
 *
 * Moteur de navigation spatiale déterministe 2D géométrique pour Smart TV & Remote.
 * - Architecture modulaire avec InputMapper (Clavier, Télécommande Smart TV, Gamepad).
 * - Gestion du cycle de vie des écouteurs (named listeners, bind, unbind, destroy sans fuite).
 * - Priorité absolue au VideoPlayer (Player Bypass).
 * - Détection géométrique réelle des scopes (getBoundingClientRect).
 * - Algorithme universel 2D géométrique par bandes naturelles (_findSpatialTarget - zéro saut de ligne).
 * - Verrouillage absolu du scroll Hero à 0px (aucun décalage, filtre noir préservé).
 * - Entourage halo orange pur sur le bouton Regarder blanc.
 * - Back Stack propre avec notification immédiate onModalClosed et reconnexion automatique.
 * - Mode TV dynamique (sh-tv-mode) et compatibilité :focus-visible.
 */

'use strict';

import Logger from './Logger.js';
import { NavAction, mapKeyboardEvent, isDirectionAction } from './InputMapper.js';
import GamepadInput from './GamepadInput.js';

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

        // Module de gestion Gamepad
        this._gamepadInput = new GamepadInput({
            onAction: (action) => this._handleAction(action)
        });

        // Liaisons nommées pour un cycle de vie propre (bind/unbind)
        this._boundKeyDown = this._handleKeyDown.bind(this);
        this._boundMouseMove = this._handleMouseMove.bind(this);
        this._boundMouseOver = this._handleMouseOver.bind(this);
        this._boundPointerDown = this._handlePointerDown.bind(this);

        this._injectStyles();
        this._bindEvents();
        this._log.info('Moteur SpatialNavigation v8.0 (Stable Core) opérationnel.');
    }

    _injectStyles() {
        if (document.getElementById('sh-spatial-nav-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-spatial-nav-styles';
        style.textContent = `
            /* ── MODE TV GLOBAL (CURSEUR MASQUÉ) ── */
            body.sh-tv-mode {
                cursor: none !important;
            }

            body.sh-tv-mode button:focus,
            body.sh-tv-mode a:focus,
            body.sh-tv-mode [tabindex]:focus {
                outline: none !important;
            }

            /* ── AURA LUMINESCENTE CINÉMATIQUE SUR CARTES ── */
            .sh-card {
                will-change: transform;
                backface-visibility: hidden;
                transform: translate3d(0, 0, 0);
            }

            .sh-card.sh-tv-focused,
            .sh-card[data-nav-focusable]:focus-visible {
                outline: none !important;
                box-shadow: none !important;
                transform: translate3d(0, -7px, 0) scale3d(1.03, 1.03, 1) !important;
                z-index: 100 !important;
            }

            .sh-card.sh-tv-focused .sh-card__image-wrap,
            .sh-card[data-nav-focusable]:focus-visible .sh-card__image-wrap {
                outline: none !important;
                box-shadow: 
                    0 0 0 2.5px #ff9f0a,
                    0 0 0 4px rgba(255, 255, 255, 0.40),
                    0 0 32px rgba(255, 159, 10, 0.65),
                    0 18px 44px rgba(0, 0, 0, 0.95),
                    inset 0 1px 1px rgba(255, 255, 255, 0.70) !important;
            }

            .sh-card.sh-tv-focused .sh-card__action-pill,
            .sh-card[data-nav-focusable]:focus-visible .sh-card__action-pill {
                transform: translateX(-50%) translateY(0) scale(1) !important;
                opacity: 1 !important;
            }

            .sh-card.sh-tv-focused .sh-card__image,
            .sh-card[data-nav-focusable]:focus-visible .sh-card__image {
                transform: scale(1.045) !important;
            }

            .sh-card.sh-tv-focused .sh-card__codec-tag {
                opacity: 0 !important;
                transform: translateY(12px) !important;
            }

            /* ── ENTOURAGE HALO ORANGE SUR BOUTON BLANC DU HERO ── */
            #sh-hero-btn-play.sh-tv-focused,
            .sh-hero-btn-play.sh-tv-focused,
            #sh-hero-btn-play:focus-visible {
                outline: none !important;
                background: #ffffff !important;
                color: #000000 !important;
                border-color: #ff9f0a !important;
                box-shadow: 
                    0 0 0 2.5px #ff9f0a,
                    0 0 24px rgba(255, 159, 10, 0.70),
                    0 4px 14px rgba(0, 0, 0, 0.50) !important;
                transform: scale(1.02) !important;
                z-index: 9999 !important;
            }

            /* ── HALO PARFAITEMENT ÉPOUSANT SUR TOUS LES AUTRES BOUTONS ET PILULES ── */
            .sh-genre-chip.sh-tv-focused,
            .sh-season-pill-btn.sh-tv-focused,
            .sh-tab-btn.sh-tv-focused,
            .sh-nav-tab-btn.sh-tv-focused,
            .sh-nav-action-btn.sh-tv-focused,
            .sh-user-avatar-btn.sh-tv-focused,
            .sh-slideup-back-btn.sh-tv-focused,
            .sh-slideup-close-btn.sh-tv-focused,
            .sh-hero-btn-glass.sh-tv-focused,
            .sh-cinema-btn-play.sh-tv-focused,
            .sh-cinema-btn-glass.sh-tv-focused,
            .sh-btn.sh-tv-focused,
            .sh-settings-nav__item.sh-tv-focused,
            [data-nav-focusable]:focus-visible {
                outline: none !important;
                border-color: #ff9f0a !important;
                box-shadow: 
                    0 0 0 2px #ff9f0a,
                    0 0 18px rgba(255, 159, 10, 0.65) !important;
                transform: none !important;
                z-index: 9999 !important;
            }

            /* ── CARTE ÉPISODE HAUTE COUTURE ── */
            .sh-episode-card.sh-tv-focused,
            .sh-ep-card.sh-tv-focused,
            .sh-slideup-ep-card.sh-tv-focused,
            .sh-episode-card[data-nav-focusable]:focus-visible {
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
        window.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('mousemove', this._boundMouseMove, { passive: true });
        document.addEventListener('mouseover', this._boundMouseOver, { passive: true });
        document.addEventListener('pointerdown', this._boundPointerDown, { passive: true });
    }

    _unbindEvents() {
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('mousemove', this._boundMouseMove);
        document.removeEventListener('mouseover', this._boundMouseOver);
        document.removeEventListener('pointerdown', this._boundPointerDown);
    }

    _handleKeyDown(e) {
        if (!this._isEnabled) return;

        const action = mapKeyboardEvent(e);
        if (!action) return;

        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
        if (isInput && action !== NavAction.BACK && action !== NavAction.DOWN && action !== NavAction.UP) return;

        // 1. Priorité absolue au lecteur vidéo (Player Bypass)
        const scope = this._detectCurrentScope();
        if (scope === 'player') {
            return; // Le VideoPlayer gère 100% de ses propres touches
        }

        this._activateTvMode();

        if (isDirectionAction(action)) {
            e.preventDefault();
            this._queueDirection(action);
        } else if (action === NavAction.SELECT) {
            if (this._focusedElement) {
                e.preventDefault();
                this._activateFocused();
            }
        } else if (action === NavAction.BACK) {
            this._handleBack(e);
        }
    }

    _handleMouseMove(e) {
        if (this._lastMouseX === null || this._lastMouseY === null) {
            this._lastMouseX = e.clientX;
            this._lastMouseY = e.clientY;
            return;
        }

        const delta = Math.abs(e.clientX - this._lastMouseX) + Math.abs(e.clientY - this._lastMouseY);
        if (delta > 3) {
            this._lastMouseX = e.clientX;
            this._lastMouseY = e.clientY;

            if (this._focusedElement) {
                this.clearFocus();
            }
            this._deactivateTvMode();
        }
    }

    _handleMouseOver(e) {
        const target = e.target.closest(
            '.sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, .sh-nav-action-btn, ' +
            '.sh-cinema-btn-play, .sh-cinema-btn-glass, .sh-hero-btn-play, .sh-hero-btn-glass, ' +
            '.sh-slideup-back-btn, .sh-slideup-close-btn, .sh-episode-card, .sh-season-pill-btn, button, a'
        );
        if (target) {
            this._lastInteractedElement = target;
            this._recordElementId(target);
        }
    }

    _handlePointerDown(e) {
        this.clearFocus();
        this._deactivateTvMode();
        const target = e.target.closest(
            '.sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, .sh-nav-action-btn, ' +
            '.sh-cinema-btn-play, .sh-cinema-btn-glass, .sh-hero-btn-play, .sh-hero-btn-glass, ' +
            '.sh-slideup-back-btn, .sh-slideup-close-btn, button, a'
        );
        if (target) {
            this._lastInteractedElement = target;
            this._recordElementId(target);
        }
    }

    _activateTvMode() {
        this._isTvMode = true;
        document.body.classList.add('sh-tv-mode');
    }

    _deactivateTvMode() {
        this._isTvMode = false;
        document.body.classList.remove('sh-tv-mode');
    }

    _queueDirection(direction) {
        if (this._isNavigating) return;
        this._isNavigating = true;

        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = requestAnimationFrame(() => {
            try {
                this._navigateDirectional(direction);
            } catch (err) {
                console.warn('[SpatialNavigation] Erreur de navigation:', err);
            } finally {
                this._isNavigating = false;
            }
        });
    }

    _recordElementId(el) {
        if (!el) return;
        this._lastFocusedId = el.dataset?.id || el.dataset?.itemId || el.dataset?.epId || el.id || null;
    }

    _detectCurrentScope() {
        // 1. Priorité : Player Vidéo
        if (window.SpaceHub?.player?.isOpen?.() || window.SpaceHub?.player?._el) {
            return 'player';
        }

        // 2. Modale fiche média (ModalSlideUpSheet) - Détection géométrique réelle
        const sheet = document.querySelector('.sh-slideup-sheet--open');
        if (sheet && sheet.getBoundingClientRect().height > 0) {
            return 'modal-sheet';
        }

        // 3. Modale générale active
        const generalModal = document.querySelector('.sh-modal-overlay.open, .sh-modal.open, .sh-console-modal-overlay.open');
        if (generalModal && generalModal.getBoundingClientRect().height > 0) {
            return 'general-modal';
        }

        // 4. Paramètres (Settings)
        const settings = document.querySelector('#spacehub-settings.is-open, .sh-settings-modal.is-open, #spacehub-settings');
        if (settings && settings.getBoundingClientRect().height > 0 && window.getComputedStyle(settings).display !== 'none') {
            return 'settings';
        }

        // 5. Recherche Unifiée (Search)
        const searchModal = document.querySelector('.sh-unified-search-modal.open');
        if (searchModal && (searchModal.getBoundingClientRect().height > 0 || document.activeElement?.id === 'sh-search-input')) {
            return 'search';
        }

        // 6. Sidebar
        const sidebar = document.querySelector('.sh-sidebar--open, .sh-sidebar-drawer.open');
        if (sidebar && sidebar.getBoundingClientRect().width > 0) {
            return 'sidebar';
        }

        // 7. Dashboard
        return 'dashboard';
    }

    _navigateDirectional(direction) {
        const scope = this._detectCurrentScope();
        
        switch (scope) {
            case 'player':
                // Le lecteur vidéo est maître de ses propres commandes
                return;
            case 'modal-sheet':
                this._navigateModalSheet(direction);
                break;
            case 'general-modal':
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

    // ─── ALGORITHME SPATIAL UNIVERSEL 2D PAR BANDES NATURELLES (ZÉRO SAUT) ───
    /**
     * Recherche la meilleure cible dans une direction donnée sans jamais sauter de rangée
     * @param {HTMLElement} current
     * @param {HTMLElement[]} candidates
     * @param {string} direction 'up' | 'down' | 'left' | 'right'
     * @returns {HTMLElement|null}
     */
    _findSpatialTarget(current, candidates, direction) {
        if (!current || !candidates || candidates.length === 0) return null;

        const currentRect = current.getBoundingClientRect();
        const currentCenterX = currentRect.left + currentRect.width / 2;
        const currentCenterY = currentRect.top + currentRect.height / 2;

        if (direction === 'down') {
            const below = candidates.filter(c => {
                if (c === current) return false;
                const r = c.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.top >= currentRect.bottom - 4;
            });

            if (below.length === 0) return null;

            let minTop = Infinity;
            below.forEach(c => {
                const top = c.getBoundingClientRect().top;
                if (top < minTop) minTop = top;
            });

            // Ne considérer que la rangée immédiatement inférieure (marge de 45px)
            const immediateRow = below.filter(c => c.getBoundingClientRect().top <= minTop + 45);

            let best = immediateRow[0];
            let minDx = Infinity;
            immediateRow.forEach(c => {
                const r = c.getBoundingClientRect();
                const centerX = r.left + r.width / 2;
                const dx = Math.abs(centerX - currentCenterX);
                if (dx < minDx) {
                    minDx = dx;
                    best = c;
                }
            });
            return best;
        }

        if (direction === 'up') {
            const above = candidates.filter(c => {
                if (c === current) return false;
                const r = c.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.bottom <= currentRect.top + 4;
            });

            if (above.length === 0) return null;

            let maxBottom = -Infinity;
            above.forEach(c => {
                const bottom = c.getBoundingClientRect().bottom;
                if (bottom > maxBottom) maxBottom = bottom;
            });

            // Ne considérer que la rangée immédiatement supérieure
            const immediateRow = above.filter(c => c.getBoundingClientRect().bottom >= maxBottom - 45);

            let best = immediateRow[0];
            let minDx = Infinity;
            immediateRow.forEach(c => {
                const r = c.getBoundingClientRect();
                const centerX = r.left + r.width / 2;
                const dx = Math.abs(centerX - currentCenterX);
                if (dx < minDx) {
                    minDx = dx;
                    best = c;
                }
            });
            return best;
        }

        if (direction === 'right') {
            const rightCandidates = candidates.filter(c => {
                if (c === current) return false;
                const r = c.getBoundingClientRect();
                const centerY = r.top + r.height / 2;
                const inHorizontalBand = Math.abs(centerY - currentCenterY) < Math.max(currentRect.height, r.height) + 20;
                return r.width > 0 && r.height > 0 && r.left >= currentRect.left + 5 && inHorizontalBand;
            });

            if (rightCandidates.length === 0) return null;

            let best = rightCandidates[0];
            let minDx = Infinity;
            rightCandidates.forEach(c => {
                const r = c.getBoundingClientRect();
                const dx = r.left - currentRect.right;
                if (dx < minDx) {
                    minDx = dx;
                    best = c;
                }
            });
            return best;
        }

        if (direction === 'left') {
            const leftCandidates = candidates.filter(c => {
                if (c === current) return false;
                const r = c.getBoundingClientRect();
                const centerY = r.top + r.height / 2;
                const inHorizontalBand = Math.abs(centerY - currentCenterY) < Math.max(currentRect.height, r.height) + 20;
                return r.width > 0 && r.height > 0 && r.right <= currentRect.left - 5 && inHorizontalBand;
            });

            if (leftCandidates.length === 0) return null;

            let best = leftCandidates[0];
            let minDx = Infinity;
            leftCandidates.forEach(c => {
                const r = c.getBoundingClientRect();
                const dx = currentRect.left - r.right;
                if (dx < minDx) {
                    minDx = dx;
                    best = c;
                }
            });
            return best;
        }

        return null;
    }

    // ─── 1. SCOPE DASHBOARD (Dynamic Island ⇄ Hero ⇄ Genres ⇄ Carrousels) ───
    _navigateDashboard(direction) {
        let current = this._focusedElement;

        const isCurrentHiddenOrInSheet = current && (
            current.closest('.sh-slideup-sheet') || 
            !document.body.contains(current) || 
            current.getBoundingClientRect().width === 0
        );

        if (!current || isCurrentHiddenOrInSheet) {
            current = this._reconnectDashboardFocus();
            if (!current) {
                const defaultEl = document.getElementById('sh-hero-btn-play') || document.querySelector('.sh-card:not(.sh-card--skeleton)');
                if (defaultEl) this._setFocus(defaultEl);
                return;
            }
            this._setFocus(current);
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
                if (island) {
                    island.classList.remove('sh-island--expanded');
                    island.classList.add('sh-island--compact');
                    if (underglow) underglow.className = 'sh-island-underglow sh-underglow--compact';
                }

                const heroPlay = document.getElementById('sh-hero-btn-play') || document.querySelector('.sh-hero-btn-play');
                if (heroPlay) return this._setFocus(heroPlay);

                const firstChip = document.querySelector('.sh-genre-chip.active') || document.querySelector('.sh-genre-chip');
                if (firstChip) return this._setFocus(firstChip);
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
                const allCards = Array.from(document.querySelectorAll('.sh-card:not(.sh-card--skeleton)'));
                if (allCards.length > 0) {
                    const savedId = this._lastDashboardFocusedCardId;
                    let target = savedId ? document.querySelector(`.sh-card[data-id="${savedId}"]`) : null;
                    if (!target) target = allCards[0];
                    return this._setFocus(target);
                }
            }
            return;
        }

        // D. ZONE CARROUSELS & CARTES MÉDIAS (.sh-card)
        if (current.classList.contains('sh-card')) {
            const parentScroller = current.closest('.sh-card-grid, .sh-widget__items-container, .sh-carousel-scroller, .sh-library-grid') || current.parentElement;
            const siblingCards = Array.from(parentScroller.querySelectorAll('.sh-card:not(.sh-card--skeleton)'));
            const cardIdx = siblingCards.indexOf(current);

            if (direction === 'right') {
                if (cardIdx !== -1 && cardIdx + 1 < siblingCards.length) {
                    return this._setFocus(siblingCards[cardIdx + 1]);
                }
                return;
            }

            if (direction === 'left') {
                if (cardIdx !== -1 && cardIdx > 0) {
                    return this._setFocus(siblingCards[cardIdx - 1]);
                }
                return;
            }

            const allCards = Array.from(document.querySelectorAll('.sh-card:not(.sh-card--skeleton)'));
            const targetCard = this._findSpatialTarget(current, allCards, direction);

            if (targetCard) {
                return this._setFocus(targetCard);
            }

            if (direction === 'up') {
                const activeChip = document.querySelector('.sh-genre-chip.active') || document.querySelector('.sh-genre-chip');
                if (activeChip) return this._setFocus(activeChip);
            }

            return;
        }
    }

    // ─── 2. SCOPE FICHE MÉDIA (ModalSlideUpSheet) ───────────────────────────
    _navigateModalSheet(direction) {
        const sheet = document.querySelector('.sh-slideup-sheet--open');
        if (!sheet) return;

        const allFocusables = this._getFocusablesInContainer(sheet);
        if (allFocusables.length === 0) return;

        let current = this._focusedElement;
        if (!current || !sheet.contains(current)) {
            const playBtn = sheet.querySelector('#sh-slideup-play-btn, .sh-cinema-btn-play') || allFocusables[0];
            return this._setFocus(playBtn);
        }

        const target = this._findSpatialTarget(current, allFocusables, direction);
        if (target) {
            return this._setFocus(target);
        }

        // Fallback linéaire si non trouvé directement par angle strict
        const curIdx = allFocusables.indexOf(current);
        if (direction === 'down' && curIdx !== -1 && curIdx + 1 < allFocusables.length) {
            this._setFocus(allFocusables[curIdx + 1]);
        } else if (direction === 'up' && curIdx > 0) {
            this._setFocus(allFocusables[curIdx - 1]);
        }
    }

    // ─── 3. SCOPES SECONDAIRES ──────────────────────────────────────────────
    _navigateSettings(direction) {
        const container = document.querySelector('#spacehub-settings, .sh-settings-modal, .sh-modal-overlay.open, .sh-modal.open');
        if (!container) return;
        const focusables = this._getFocusablesInContainer(container);
        if (focusables.length === 0) return;

        let current = this._focusedElement;
        if (!current || !container.contains(current)) return this._setFocus(focusables[0]);

        const target = this._findSpatialTarget(current, focusables, direction);
        if (target) {
            return this._setFocus(target);
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
        if (this._lastDashboardFocusedCard && document.body.contains(this._lastDashboardFocusedCard) && !this._lastDashboardFocusedCard.closest('.sh-slideup-sheet')) {
            return this._lastDashboardFocusedCard;
        }
        if (this._lastDashboardFocusedCardId) {
            const reconnected = document.querySelector(`.sh-dashboard__grid .sh-card[data-id="${this._lastDashboardFocusedCardId}"], .sh-dashboard__grid .sh-card[data-item-id="${this._lastDashboardFocusedCardId}"]`);
            if (reconnected) {
                this._lastDashboardFocusedCard = reconnected;
                return reconnected;
            }
        }
        if (this._lastFocusedId) {
            const reconnected = document.querySelector(`.sh-dashboard__grid [data-id="${this._lastFocusedId}"], .sh-dashboard__grid [data-item-id="${this._lastFocusedId}"]`);
            if (reconnected) return reconnected;
        }
        return document.querySelector('.sh-dashboard__grid .sh-card:not(.sh-card--skeleton)');
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
            '[tabindex="0"]:not(.sh-hero-badge):not(.sh-score-rt):not(.sh-score-imdb)',
            '[data-nav-focusable]'
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
        if (element.classList.contains('sh-card') && !element.closest('.sh-slideup-sheet')) {
            this._lastDashboardFocusedCard = element;
            this._lastDashboardFocusedCardId = element.dataset?.id || element.dataset?.itemId || null;
        }

        element.classList.add('sh-tv-focused');

        // 🛑 HERO SCROLL LOCK : Verrouillage strict à top 0px sans scrollIntoView
        const isHeroBtn = element.id === 'sh-hero-btn-play' || element.id === 'sh-hero-btn-trailer' || element.id === 'sh-hero-btn-details';
        if (isHeroBtn) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        // Cartes média : centrage vertical et horizontal
        if (element.classList.contains('sh-card') && !element.closest('.sh-slideup-sheet')) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            return;
        }

        const scroller = element.closest(
            '.sh-card-grid, .sh-carousel-scroller, .sh-cinema-body, .sh-series-episodes-container, .sh-season-pills-row, .sh-slideup-sheet, .sh-cinema-sheet-inner'
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

    onModalClosed(closedItem = null) {
        this.clearFocus();
        const targetId = closedItem?.Id || closedItem?.id || this._lastDashboardFocusedCardId;

        const restore = () => {
            let target = null;
            if (targetId) {
                target = document.querySelector(`.sh-dashboard__grid .sh-card[data-id="${targetId}"], .sh-dashboard__grid .sh-card[data-item-id="${targetId}"]`);
            }
            if (!target && this._lastDashboardFocusedCard && document.body.contains(this._lastDashboardFocusedCard) && !this._lastDashboardFocusedCard.closest('.sh-slideup-sheet')) {
                target = this._lastDashboardFocusedCard;
            }
            if (!target) {
                const saved = this._invokingElementStack.pop();
                if (saved?.element && document.body.contains(saved.element) && !saved.element.closest('.sh-slideup-sheet')) {
                    target = saved.element;
                }
            }
            if (!target) {
                target = document.querySelector('.sh-dashboard__grid .sh-card:not(.sh-card--skeleton)');
            }
            if (target) {
                this._setFocus(target);
                return true;
            }
            return false;
        };

        restore();
        requestAnimationFrame(() => restore());
        setTimeout(() => restore(), 60);
        setTimeout(() => restore(), 160);
    }

    _handleBack(event) {
        event?.preventDefault();

        // 1. Modale fiche média
        const slideUpModal = document.querySelector('.sh-slideup-sheet--open');
        if (slideUpModal) {
            const currentItem = window.SpaceHub?.ui?.modalSlideUpSheet?._currentItem;
            window.SpaceHub?.ui?.modalSlideUpSheet?.close?.();
            this.onModalClosed(currentItem);
            return;
        }

        // 2. Paramètres
        const openSettings = document.querySelector('#spacehub-settings.is-open, .sh-settings-modal.is-open, #spacehub-settings');
        if (openSettings && openSettings.offsetParent !== null) {
            openSettings.querySelector('[data-action="close"], .sh-settings-close-btn')?.click?.();
            return;
        }

        // 3. Recherche
        const openSearch = document.querySelector('.sh-unified-search-modal.open');
        if (openSearch) {
            window.SpaceHub?.ui?.unifiedSearch?.close?.();
            return;
        }

        // 4. Modales génériques (fermeture propre sans .remove() sauvage)
        const openModal = document.querySelector('.sh-modal-overlay.open, .sh-modal.open, .sh-console-modal-overlay.open');
        if (openModal) {
            const closeBtn = openModal.querySelector('[data-action="close"], .sh-modal-close-btn, .sh-modal__close');
            if (closeBtn) {
                closeBtn.click();
            } else {
                openModal.classList.remove('open');
                this.onModalClosed();
            }
            return;
        }

        // 5. Lecteur Vidéo
        if (window.SpaceHub?.player?.isOpen?.() || window.SpaceHub?.player?._el) {
            window.SpaceHub.player.close();
        }
    }

    _handleAction(action) {
        if (!this._isEnabled) return;

        const scope = this._detectCurrentScope();
        if (scope === 'player') return;

        this._activateTvMode();

        if (isDirectionAction(action)) {
            this._queueDirection(action);
        } else if (action === NavAction.SELECT) {
            if (this._focusedElement) {
                this._activateFocused();
            }
        } else if (action === NavAction.BACK) {
            this._handleBack();
        }
    }

    clearFocus() {
        if (this._focusedElement) {
            this._focusedElement.classList.remove('sh-tv-focused');
            this._focusedElement = null;
        }
        document.querySelectorAll('.sh-tv-focused').forEach(el => el.classList.remove('sh-tv-focused'));
    }

    enable() {
        this._isEnabled = true;
        this._gamepadInput?.enable();
    }

    disable() {
        this._isEnabled = false;
        this._gamepadInput?.disable();
        this.clearFocus();
    }

    destroy() {
        this.clearFocus();
        this._unbindEvents();
        if (this._gamepadInput) {
            this._gamepadInput.destroy();
            this._gamepadInput = null;
        }
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._isEnabled = false;
        this._deactivateTvMode();
    }
}

export default SpatialNavigation;
