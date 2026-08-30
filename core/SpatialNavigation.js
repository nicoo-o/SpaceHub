/**
 * SpaceHub — Spatial Navigation Engine (Grand Cinema Edition v8.0 Stable Core)
 * Version: 8.0.0
 *
 * Moteur de navigation spatiale déterministe 2D géométrique pour Smart TV & Remote.
 * - Architecture modulaire avec InputMapper (Clavier, Télécommande Smart TV, Gamepad).
 * - Gestion du cycle de vie des écouteurs (named listeners, bind, unbind, destroy sans fuite).
 * - Priorité absolue au VideoPlayer (Player Bypass).
 * - Détection géométrique réelle des scopes (getBoundingClientRect).
 * - Algorithme universel 2D géométrique par bandes naturelles (_findSpatialTarget - isolation stricte 18px).
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
        this._dirHoldTimer = null;
        this._dirHoldStart = 0;
        this._selectHoldTimer = null;
        this._isLongPressActive = false;

        // Module de gestion Gamepad
        this._gamepadInput = new GamepadInput({
            onAction: (action) => this._handleAction(action)
        });

        // Liaisons nommées pour un cycle de vie propre (bind/unbind)
        this._boundKeyDown = this._handleKeyDown.bind(this);
        this._boundKeyUp = this._handleKeyUp.bind(this);
        this._boundMouseMove = this._handleMouseMove.bind(this);
        this._boundMouseOver = this._handleMouseOver.bind(this);
        this._boundPointerDown = this._handlePointerDown.bind(this);
        this._boundResize = this._handleResize.bind(this);

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

            /* ── UNIFICATION DU FOCUS ACTIF HAUTE COUTURE (.sh-focus-active) ── */
            .sh-focus-active,
            .sh-card.sh-focus-active,
            .sh-card.sh-tv-focused {
                outline: none !important;
                box-shadow: none !important;
                transform: translate3d(0, -7px, 0) scale3d(1.03, 1.03, 1) !important;
                z-index: 100 !important;
            }

            .sh-card.sh-focus-active .sh-card__image-wrap,
            .sh-card.sh-tv-focused .sh-card__image-wrap {
                outline: none !important;
                box-shadow: 
                    0 0 0 2.5px #ff9f0a,
                    0 0 0 4px rgba(255, 255, 255, 0.40),
                    0 0 32px rgba(255, 159, 10, 0.65),
                    0 18px 44px rgba(0, 0, 0, 0.95),
                    inset 0 1px 1px rgba(255, 255, 255, 0.70) !important;
            }

            .sh-focus-active:not(.sh-card),
            .sh-tv-focused:not(.sh-card) {
                outline: none !important;
                border-color: #ff9f0a !important;
                box-shadow: 
                    0 0 0 2px #ff9f0a,
                    0 0 18px rgba(255, 159, 10, 0.65) !important;
                z-index: 9999 !important;
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

            /* ── POPOVER ITEMS & MENUS DÉROULANTS HAUTE COUTURE ── */
            .sh-popover-item.sh-tv-focused,
            .sh-dropdown-item.sh-tv-focused,
            .sh-sync-btn.sh-tv-focused,
            .sh-chip-btn.sh-tv-focused,
            .sh-popover-item[data-nav-focusable]:focus-visible {
                outline: none !important;
                background: rgba(255, 159, 10, 0.28) !important;
                border-color: #ff9f0a !important;
                box-shadow: 0 0 0 2px #ff9f0a, 0 0 16px rgba(255, 159, 10, 0.60) !important;
                transform: scale(1.02) !important;
                z-index: 99999 !important;
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
        window.addEventListener('keyup', this._boundKeyUp);
        window.addEventListener('mousemove', this._boundMouseMove, { passive: true });
        document.addEventListener('mouseover', this._boundMouseOver, { passive: true });
        document.addEventListener('pointerdown', this._boundPointerDown, { passive: true });
    }

    _unbindEvents() {
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);
        window.removeEventListener('mousemove', this._boundMouseMove);
        document.removeEventListener('mouseover', this._boundMouseOver);
        document.removeEventListener('pointerdown', this._boundPointerDown);
        window.removeEventListener('resize', this._boundResize);
        window.removeEventListener('orientationchange', this._boundResize);
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
            const now = Date.now();
            if (!e.repeat) {
                this._dirHoldStart = now;
                this._lastFastScrollTick = now;
                this._queueDirection(action);
            } else {
                const holdTime = now - this._dirHoldStart;
                // Fast-scroll cadencé à 95ms pendant le maintien (zéro spam de file, zéro blocage)
                if (holdTime > 700) {
                    if (!this._lastFastScrollTick || now - this._lastFastScrollTick >= 95) {
                        this._lastFastScrollTick = now;
                        this._queueDirection(action);
                    }
                } else {
                    this._queueDirection(action);
                }
            }
        } else if (action === NavAction.PAGE_DOWN) {
            e.preventDefault();
            this._handlePaging('down');
        } else if (action === NavAction.PAGE_UP) {
            e.preventDefault();
            this._handlePaging('up');
        } else if (action === NavAction.SELECT) {
            if (this._focusedElement?.id === 'sh-user-menu-btn' || this._focusedElement?.classList.contains('sh-user-avatar-btn')) {
                e.preventDefault();
                if (window.SpaceHub?._toggleUserDropdown) {
                    window.SpaceHub._toggleUserDropdown(true);
                    setTimeout(() => {
                        const firstItem = document.querySelector('#sh-user-dropdown .sh-user-dropdown__item');
                        if (firstItem) this._setFocus(firstItem);
                    }, 60);
                }
                return;
            }
            if (!e.repeat && this._focusedElement?.classList.contains('sh-card')) {
                // Timer de Long-Press (600ms) pour ouvrir le menu contextuel rapide
                this._selectHoldTimer = setTimeout(() => {
                    this._isLongPressActive = true;
                    this._openCardContextMenu(this._focusedElement);
                }, 600);
            }
            if (this._focusedElement && !this._isLongPressActive) {
                e.preventDefault();
                this._activateFocused();
            }
        } else if (action === NavAction.BACK) {
            this._handleBack(e);
        } else if (action === NavAction.MENU) {
            e.preventDefault();
            this._toggleSidebar();
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
            '[data-nav-focusable], .sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, .sh-nav-action-btn, ' +
            '.sh-cinema-btn-play, .sh-cinema-btn-glass, .sh-hero-btn-play, .sh-hero-btn-glass, ' +
            '.sh-slideup-back-btn, .sh-slideup-close-btn, .sh-episode-card, .sh-season-pill-btn, button, a'
        );
        if (target) {
            this._lastInteractedElement = target;
            this._recordElementId(target);

            // Hover Intent : Délai de 90ms avant d'activer le focus visuel à la souris (évite les flashs)
            if (this._hoverIntentTimer) clearTimeout(this._hoverIntentTimer);
            this._hoverIntentTimer = setTimeout(() => {
                if (this._lastInteractedElement === target && !this._isTvMode) {
                    target.classList.add('sh-mouse-hovered');
                }
            }, 90);
        }
    }

    _handlePointerDown(e) {
        this.clearFocus();
        this._deactivateTvMode();
        const target = e.target.closest(
            '[data-nav-focusable], .sh-card:not(.sh-card--skeleton), .sh-genre-chip, .sh-nav-tab-btn, .sh-nav-action-btn, ' +
            '.sh-cinema-btn-play, .sh-cinema-btn-glass, .sh-hero-btn-play, .sh-hero-btn-glass, ' +
            '.sh-slideup-back-btn, .sh-slideup-close-btn, button, a'
        );
        if (target) {
            this._lastInteractedElement = target;
            this._recordElementId(target);
        }
    }

    _handleKeyUp(e) {
        this._dirHoldStart = 0;
        if (this._selectHoldTimer) {
            clearTimeout(this._selectHoldTimer);
            this._selectHoldTimer = null;
        }
        setTimeout(() => {
            this._isLongPressActive = false;
        }, 100);
    }

    _handlePaging(direction) {
        const allCards = Array.from(document.querySelectorAll('.sh-card:not(.sh-card--skeleton), [data-nav-focusable]'));
        if (allCards.length === 0) return;

        let current = this._focusedElement;
        if (!current || !allCards.includes(current)) return this._setFocus(allCards[0]);

        const curIdx = allCards.indexOf(current);
        const step = 10; // Paging saut de 10 éléments d'un coup

        if (direction === 'down') {
            const nextIdx = Math.min(allCards.length - 1, curIdx + step);
            this._setFocus(allCards[nextIdx]);
        } else {
            const prevIdx = Math.max(0, curIdx - step);
            this._setFocus(allCards[prevIdx]);
        }
    }

    _openCardContextMenu(cardEl) {
        if (!cardEl) return;
        const itemId = cardEl.dataset?.id || cardEl.dataset?.itemId;
        const title = cardEl.querySelector('.sh-card__title')?.textContent || 'Média';
        window.SpaceHub?.ui?.components?.toaster?.info(`⚙️ Menu Rapide : ${title}`);
        cardEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    }

    _handleResize() {
        if (this._focusedElement) {
            const rect = this._focusedElement.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0 || !document.body.contains(this._focusedElement)) {
                this.clearFocus();
                this._reconnectDashboardFocus();
            }
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
        const userDropdown = document.querySelector('#sh-user-dropdown.sh-dropdown--open');
        if (userDropdown && window.getComputedStyle(userDropdown).display !== 'none') return 'user-dropdown';
        // 1. Popover ou Menu Déroulant Actif (Fiche Média ou Dashboard)
        const openPopover = document.querySelector(
            '#sh-audio-popover-menu.open, .sh-audio-popover-menu.open, .sh-popover.open, .sh-dropdown-menu.open'
        );
        if (openPopover && openPopover.getBoundingClientRect().height > 0) {
            return 'popover-menu';
        }

        // 2. Priorité : Player Vidéo
        if (window.SpaceHub?.player?.isOpen?.() || window.SpaceHub?.player?._el) {
            return 'player';
        }

        // 3. Modale fiche média (ModalSlideUpSheet) - Détection géométrique réelle
        const sheet = document.querySelector('.sh-slideup-sheet--open');
        if (sheet && sheet.getBoundingClientRect().height > 0) {
            return 'modal-sheet';
        }

        // 4. Paramètres (Settings) - Priorité avant les modales génériques
        const settings = document.querySelector('#spacehub-settings.is-open, #spacehub-settings.open, #spacehub-settings, .sh-settings-modal');
        if (settings && settings.getBoundingClientRect().height > 0 && window.getComputedStyle(settings).display !== 'none') {
            return 'settings';
        }

        // 5. Modale générale active
        const generalModal = document.querySelector('.sh-modal-overlay.open, .sh-modal.open, .sh-console-modal-overlay.open, #sh-admin-dashboard-modal, .sh-admin-modal-overlay');
        if (generalModal && generalModal.getBoundingClientRect().height > 0) {
            return 'general-modal';
        }

        // 6. Recherche Unifiée (Search)
        const searchModal = document.querySelector('.sh-unified-search-modal.open');
        if (searchModal && (searchModal.getBoundingClientRect().height > 0 || document.activeElement?.id === 'sh-search-input')) {
            return 'search';
        }

        // 7. Sidebar
        const sidebar = document.querySelector('.sh-sidebar--open, .sh-sidebar-drawer.open');
        if (sidebar && sidebar.getBoundingClientRect().width > 0) {
            return 'sidebar';
        }

        // 8. Dashboard
        return 'dashboard';
    }

    _navigateDirectional(direction) {
        const scope = this._detectCurrentScope();
        
        switch (scope) {
            case 'user-dropdown':
                this._navigateUserDropdown(direction);
                break;
            case 'popover-menu':
                this._navigatePopoverMenu(direction);
                break;
            case 'player':
                // Le lecteur vidéo est maître de ses propres commandes
                return;
            case 'modal-sheet':
                this._navigateModalSheet(direction);
                break;
            case 'general-modal':
                this._navigateGeneralModal(direction);
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

            // Identifier le sommet Y de la rangée immédiatement inférieure
            let minTop = Infinity;
            below.forEach(c => {
                const top = c.getBoundingClientRect().top;
                if (top < minTop) minTop = top;
            });

            // Seuil strict de 18px pour isoler rigoureusement une seule rangée physique
            const immediateRow = below.filter(c => c.getBoundingClientRect().top <= minTop + 18);

            // 1. Si la rangée possède un élément actif (ex: onglet actif, saison active), aller dessus en priorité
            const activeInRow = immediateRow.find(c => c.classList.contains('active') || c.classList.contains('selected'));
            if (activeInRow) return activeInRow;

            // 2. Sinon, choisir l'élément le plus proche en alignement horizontal X
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

            // Identifier le bas Y de la rangée immédiatement supérieure
            let maxBottom = -Infinity;
            above.forEach(c => {
                const bottom = c.getBoundingClientRect().bottom;
                if (bottom > maxBottom) maxBottom = bottom;
            });

            // Seuil strict de 18px pour isoler rigoureusement la rangée du dessus
            const immediateRow = above.filter(c => c.getBoundingClientRect().bottom >= maxBottom - 18);

            const activeInRow = immediateRow.find(c => c.classList.contains('active') || c.classList.contains('selected'));
            if (activeInRow) return activeInRow;

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
                const inHorizontalBand = Math.abs(centerY - currentCenterY) < Math.max(currentRect.height, r.height) + 12;
                return r.width > 0 && r.height > 0 && r.left >= currentRect.left + 4 && inHorizontalBand;
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
                const inHorizontalBand = Math.abs(centerY - currentCenterY) < Math.max(currentRect.height, r.height) + 12;
                return r.width > 0 && r.height > 0 && r.right <= currentRect.left - 4 && inHorizontalBand;
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

    _navigateUserDropdown(direction) {
        const dropdown = document.getElementById('sh-user-dropdown');
        if (!dropdown) return;

        const items = Array.from(dropdown.querySelectorAll('.sh-user-dropdown__item, button'));
        if (items.length === 0) return;

        let current = this._focusedElement;
        if (!current || !dropdown.contains(current)) {
            return this._setFocus(items[0]);
        }

        const curIdx = items.indexOf(current);

        if (direction === 'down') {
            if (curIdx !== -1 && curIdx + 1 < items.length) {
                this._setFocus(items[curIdx + 1]);
            }
        } else if (direction === 'up') {
            if (curIdx > 0) {
                this._setFocus(items[curIdx - 1]);
            } else if (curIdx === 0) {
                // Remonter sur le bouton avatar
                this._closeUserDropdown();
                const avatarBtn = document.getElementById('sh-user-menu-btn');
                if (avatarBtn) this._setFocus(avatarBtn);
            }
        } else if (direction === 'left' || direction === 'right') {
            this._closeUserDropdown();
            const avatarBtn = document.getElementById('sh-user-menu-btn');
            if (avatarBtn) this._setFocus(avatarBtn);
        }
    }

    _closeUserDropdown() {
        if (window.SpaceHub?._toggleUserDropdown) {
            window.SpaceHub._toggleUserDropdown(false);
        }
    }

    // ─── 0. SCOPE POPOVER / MENUS DÉROULANTS (Audio & Sous-titres) ───────────
    _navigatePopoverMenu(direction) {
        const popover = document.querySelector(
            '#sh-audio-popover-menu.open, .sh-audio-popover-menu.open, .sh-popover.open, .sh-dropdown-menu.open'
        );
        if (!popover) return;

        const items = Array.from(popover.querySelectorAll('.sh-popover-item, .sh-dropdown-item, button:not([disabled])'));
        if (items.length === 0) return;

        let current = this._focusedElement;
        if (!current || !popover.contains(current)) {
            const selected = popover.querySelector('.sh-popover-item.selected') || items[0];
            return this._setFocus(selected);
        }

        const currentList = current.closest('.sh-popover-list, .sh-popover-column');
        const audioList = popover.querySelector('#sh-popover-audio-list, .sh-popover-column:first-child');
        const subsList = popover.querySelector('#sh-popover-subs-list, .sh-popover-column:last-child');

        if (direction === 'right' && currentList && subsList && currentList !== subsList) {
            const selectedSub = subsList.querySelector('.sh-popover-item.selected') || subsList.querySelector('.sh-popover-item');
            if (selectedSub) return this._setFocus(selectedSub);
        } else if (direction === 'left' && currentList && audioList && currentList !== audioList) {
            const selectedAudio = audioList.querySelector('.sh-popover-item.selected') || audioList.querySelector('.sh-popover-item');
            if (selectedAudio) return this._setFocus(selectedAudio);
        } else {
            const colItems = currentList ? Array.from(currentList.querySelectorAll('.sh-popover-item, button')) : items;
            const curIdx = colItems.indexOf(current);

            if (direction === 'down' && curIdx !== -1 && curIdx + 1 < colItems.length) {
                return this._setFocus(colItems[curIdx + 1]);
            } else if (direction === 'up' && curIdx > 0) {
                return this._setFocus(colItems[curIdx - 1]);
            }
        }
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

            if (direction === 'right') {
                if (curIdx !== -1 && curIdx + 1 < islandItems.length) {
                    return this._setFocus(islandItems[curIdx + 1]);
                } else if (curIdx === islandItems.length - 1) {
                    // Wrap-around vers le premier élément
                    return this._setFocus(islandItems[0]);
                }
            } else if (direction === 'left') {
                if (curIdx !== -1 && curIdx > 0) {
                    return this._setFocus(islandItems[curIdx - 1]);
                } else if (curIdx === 0) {
                    // Wrap-around vers le dernier élément
                    return this._setFocus(islandItems[islandItems.length - 1]);
                }
            } else if (direction === 'down') {
                if (island) {
                    island.classList.remove('sh-island--expanded');
                    island.classList.add('sh-island--compact');
                    if (underglow) underglow.className = 'sh-island-underglow sh-underglow--compact';
                }

                const heroPlay = document.getElementById('sh-hero-btn-play') || document.querySelector('.sh-hero-btn-play');
                if (heroPlay && heroPlay.getBoundingClientRect().height > 0) {
                    return this._setFocus(heroPlay);
                }

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

    // ─── 4. SCOPE MODALES GÉNÉRALES & CONSOLE (Focus Registry & Trap) ─────────
    _navigateGeneralModal(direction) {
        const modal = document.querySelector(
            '.sh-modal-overlay.open, .sh-console-modal-overlay.open, #sh-admin-dashboard-modal, .sh-admin-modal-overlay, .sh-modal.open'
        );
        if (!modal) return;

        const navTabs = Array.from(modal.querySelectorAll('.sh-console-nav-tab, .sh-tab-btn'));
        const bodyFocusables = Array.from(modal.querySelectorAll(
            '#sh-console-body-content button, #sh-console-body-content input, #sh-console-body-content select, #sh-console-body-content a, ' +
            '.sh-admin-bento-grid button, .sh-admin-bento-grid a, .sh-admin-bento-grid [data-nav-focusable]'
        )).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
        });
        const doneBtn = modal.querySelector('.sh-console-done-btn, .sh-admin-modal-close, #sh-console-btn-done');

        let current = this._focusedElement;

        // Si aucun focus dans la modale, focaliser l'onglet actif
        if (!current || !modal.contains(current)) {
            const activeTab = navTabs.find(t => t.classList.contains('active')) || navTabs[0] || bodyFocusables[0] || doneBtn;
            if (activeTab) return this._setFocus(activeTab);
            return;
        }

        // 1. Navigation dans les onglets du haut
        if (navTabs.includes(current)) {
            const curIdx = navTabs.indexOf(current);
            if (direction === 'right') {
                if (curIdx !== -1 && curIdx + 1 < navTabs.length) {
                    const nextTab = navTabs[curIdx + 1];
                    this._setFocus(nextTab);
                    nextTab.click(); // Changement automatique de l'onglet actif
                }
                return;
            }
            if (direction === 'left') {
                if (curIdx > 0) {
                    const prevTab = navTabs[curIdx - 1];
                    this._setFocus(prevTab);
                    prevTab.click();
                }
                return;
            }
            if (direction === 'down') {
                if (bodyFocusables.length > 0) {
                    return this._setFocus(bodyFocusables[0]);
                } else if (doneBtn) {
                    return this._setFocus(doneBtn);
                }
                return;
            }
            return;
        }

        // 2. Navigation dans le corps de la console
        if (bodyFocusables.includes(current)) {
            const curIdx = bodyFocusables.indexOf(current);
            if (direction === 'down') {
                if (curIdx !== -1 && curIdx + 1 < bodyFocusables.length) {
                    return this._setFocus(bodyFocusables[curIdx + 1]);
                } else if (doneBtn) {
                    return this._setFocus(doneBtn);
                }
                return;
            }
            if (direction === 'up') {
                if (curIdx > 0) {
                    return this._setFocus(bodyFocusables[curIdx - 1]);
                } else {
                    const activeTab = navTabs.find(t => t.classList.contains('active')) || navTabs[0];
                    if (activeTab) return this._setFocus(activeTab);
                }
                return;
            }
            if (direction === 'left' || direction === 'right') {
                const target = this._findSpatialTarget(current, bodyFocusables, direction);
                if (target) return this._setFocus(target);
                if (direction === 'right' && curIdx + 1 < bodyFocusables.length) {
                    return this._setFocus(bodyFocusables[curIdx + 1]);
                } else if (direction === 'left' && curIdx > 0) {
                    return this._setFocus(bodyFocusables[curIdx - 1]);
                }
                return;
            }
            return;
        }

        // 3. Navigation depuis le bouton de pied de page (Fermer)
        if (current === doneBtn) {
            if (direction === 'up') {
                if (bodyFocusables.length > 0) {
                    return this._setFocus(bodyFocusables[bodyFocusables.length - 1]);
                } else {
                    const activeTab = navTabs.find(t => t.classList.contains('active')) || navTabs[0];
                    if (activeTab) return this._setFocus(activeTab);
                }
                return;
            }
        }
    }

    // ─── 3. SCOPES SECONDAIRES ──────────────────────────────────────────────
    _navigateSettings(direction) {
        const container = document.querySelector('#spacehub-settings, .sh-settings-modal, .sh-modal-overlay.open');
        if (!container) return;

        const navTabs = Array.from(container.querySelectorAll('.sh-settings-nav__item'));
        const contentItems = Array.from(container.querySelectorAll(
            '.sh-settings-content input, .sh-settings-content select, .sh-settings-content button, .sh-settings-content .sh-theme-card, .sh-settings-content a, .sh-settings-content [tabindex="0"]'
        )).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
        });
        const footerBtns = Array.from(container.querySelectorAll('.sh-modal-footer button, .sh-modal__footer button, [data-action="close"], [data-action="save"]'));

        let current = this._focusedElement;

        if (!current || !container.contains(current)) {
            const activeTab = navTabs.find(t => t.classList.contains('active')) || navTabs[0] || footerBtns[0];
            if (activeTab) return this._setFocus(activeTab);
            return;
        }

        // 1. Navigation dans la barre d'onglets latérale (macOS Style)
        if (navTabs.includes(current)) {
            const curIdx = navTabs.indexOf(current);
            if (direction === 'down') {
                if (curIdx !== -1 && curIdx + 1 < navTabs.length) {
                    const nextTab = navTabs[curIdx + 1];
                    this._setFocus(nextTab);
                    nextTab.click(); // Activer automatiquement l'onglet
                } else if (footerBtns.length > 0) {
                    this._setFocus(footerBtns[0]);
                }
                return;
            }
            if (direction === 'up') {
                if (curIdx > 0) {
                    const prevTab = navTabs[curIdx - 1];
                    this._setFocus(prevTab);
                    prevTab.click();
                }
                return;
            }
            if (direction === 'right') {
                if (contentItems.length > 0) {
                    return this._setFocus(contentItems[0]);
                } else if (footerBtns.length > 0) {
                    return this._setFocus(footerBtns[0]);
                }
                return;
            }
            return;
        }

        // 2. Navigation dans le contenu de droite
        if (contentItems.includes(current)) {
            const curIdx = contentItems.indexOf(current);
            if (direction === 'left') {
                const target = this._findSpatialTarget(current, contentItems, 'left');
                if (target) return this._setFocus(target);
                // Retourner à l'onglet actif
                const activeTab = navTabs.find(t => t.classList.contains('active')) || navTabs[0];
                if (activeTab) return this._setFocus(activeTab);
                return;
            }
            if (direction === 'right') {
                const target = this._findSpatialTarget(current, contentItems, 'right');
                if (target) return this._setFocus(target);
                return;
            }
            if (direction === 'down') {
                const target = this._findSpatialTarget(current, contentItems, 'down');
                if (target) return this._setFocus(target);
                if (curIdx !== -1 && curIdx + 1 < contentItems.length) {
                    return this._setFocus(contentItems[curIdx + 1]);
                } else if (footerBtns.length > 0) {
                    return this._setFocus(footerBtns[0]);
                }
                return;
            }
            if (direction === 'up') {
                const target = this._findSpatialTarget(current, contentItems, 'up');
                if (target) return this._setFocus(target);
                if (curIdx > 0) {
                    return this._setFocus(contentItems[curIdx - 1]);
                } else {
                    const activeTab = navTabs.find(t => t.classList.contains('active')) || navTabs[0];
                    if (activeTab) return this._setFocus(activeTab);
                }
                return;
            }
            return;
        }

        // 3. Navigation dans les boutons de pied de page
        if (footerBtns.includes(current)) {
            const curIdx = footerBtns.indexOf(current);
            if (direction === 'right' && curIdx + 1 < footerBtns.length) {
                return this._setFocus(footerBtns[curIdx + 1]);
            }
            if (direction === 'left') {
                if (curIdx > 0) return this._setFocus(footerBtns[curIdx - 1]);
                const activeTab = navTabs.find(t => t.classList.contains('active')) || navTabs[0];
                if (activeTab) return this._setFocus(activeTab);
                return;
            }
            if (direction === 'up') {
                if (contentItems.length > 0) {
                    return this._setFocus(contentItems[contentItems.length - 1]);
                } else {
                    const activeTab = navTabs.find(t => t.classList.contains('active')) || navTabs[0];
                    if (activeTab) return this._setFocus(activeTab);
                }
                return;
            }
        }
    }

    _navigateSearch(direction) {
        const searchContainer = document.querySelector('.sh-unified-search-modal');
        if (!searchContainer) return;

        const searchInput = document.getElementById('sh-search-input');
        const results = Array.from(searchContainer.querySelectorAll('.sh-card:not(.sh-card--skeleton), [data-nav-focusable], button'));

        if (this._focusedElement === searchInput) {
            if (direction === 'down' && results.length > 0) {
                return this._setFocus(results[0]);
            }
            return;
        }

        let current = this._focusedElement;
        if (!current || !searchContainer.contains(current)) {
            if (searchInput) return this._setFocus(searchInput);
            return;
        }

        const target = this._findSpatialTarget(current, results, direction);
        if (target) {
            return this._setFocus(target);
        }

        if (direction === 'up') {
            const above = results.filter(c => c.getBoundingClientRect().bottom <= current.getBoundingClientRect().top + 5);
            if (above.length === 0 && searchInput) {
                return this._setFocus(searchInput);
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

    _toggleSidebar() {
        const sidebar = window.SpaceHub?.ui?.sidebar || window.SpaceHub?.sidebar;
        if (sidebar && typeof sidebar.toggle === 'function') {
            sidebar.toggle();
            const openDrawer = document.querySelector('.sh-sidebar--open, .sh-sidebar-drawer.open');
            if (openDrawer) {
                const firstItem = openDrawer.querySelector('.sh-sidebar-item, a, button');
                if (firstItem) this._setFocus(firstItem);
            } else {
                this._reconnectDashboardFocus();
            }
        }
    }

    // ─── UTILITAIRES & FOCUS MANAGEMENT ──────────────────────────────────────
    _reconnectDashboardFocus() {
        const heroPlay = document.getElementById('sh-hero-btn-play') || document.querySelector('.sh-hero-btn-play');
        if (heroPlay && heroPlay.getBoundingClientRect().height > 0) {
            return heroPlay;
        }
        if (this._lastDashboardFocusedCard && document.body.contains(this._lastDashboardFocusedCard) && !this._lastDashboardFocusedCard.closest('.sh-slideup-sheet')) {
            return this._lastDashboardFocusedCard;
        }
        if (this._lastDashboardFocusedCardId) {
            const reconnected = document.querySelector(`.sh-dashboard__grid .sh-card[data-id="${this._lastDashboardFocusedCardId}"], .sh-dashboard__grid .sh-card[data-item-id="${this._lastDashboardFocusedCardId}"]`);
            if (reconnected) return reconnected;
        }
        return document.querySelector('.sh-dashboard__grid .sh-card:not(.sh-card--skeleton)');
    }

    _getFocusablesInContainer(container) {
        if (!container) return [];

        // 1. Focus Registry de vue active si disponible
        const currentView = window.SpaceHub?.router?.getCurrentView?.();
        if (currentView?.getFocusables && typeof currentView.getFocusables === 'function') {
            const customFocusables = currentView.getFocusables(container);
            if (Array.isArray(customFocusables) && customFocusables.length > 0) {
                return customFocusables.filter(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
                });
            }
        }

        // 2. Sélecteur universel haute couverture
        const selector = [
            '[data-nav-focusable]',
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
            '.sh-console-nav-tab',
            '.sh-console-done-btn',
            '.sh-admin-header-btn',
            '.sh-admin-modal-close',
            '.sh-admin-mini-action-btn',
            '.sh-lib-tab-btn',
            '.sh-lib-genre-chip',
            '.sh-lib-alpha-btn',
            '.sh-lib-control-btn',
            '.sh-lib-dropdown-item',
            '.sh-lib-viewmode-btn',
            '.sh-lib-backdrop-thumb-wrap',
            '.sh-lib-table-play',
            '.sh-lib-table-fav',
            '.sh-lib-manage-row',
            '.sh-lib-order-btn',
            '.sh-dl-action-btn',
            '.sh-dl-tab-btn',
            'button:not([disabled]):not(.sh-hero-badge):not(.sh-score-rt):not(.sh-score-imdb)',
            'a[href]',
            'input:not([disabled])',
            'select:not([disabled])',
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
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden' && window.getComputedStyle(el).display !== 'none';
        });
    }

    _setFocus(element) {
        if (!element) return;
        this.clearFocus();

        this._focusedElement = element;
        window.SpaceHub?.core?.audioFeedback?.playTick?.();
        this._lastInteractedElement = element;
        this._recordElementId(element);

        // Si l'élément est une carte du Dashboard, mémoriser de façon permanente
        if (element.classList.contains('sh-card') && !element.closest('.sh-slideup-sheet')) {
            this._lastDashboardFocusedCard = element;
            this._lastDashboardFocusedCardId = element.dataset?.id || element.dataset?.itemId || null;
        }

        element.classList.add('sh-tv-focused', 'sh-focus-active');

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
        window.SpaceHub?.core?.audioFeedback?.playSelect?.();
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

        // 0. Popover ou Menu Déroulant (Fermeture prioritaire)
        const openPopover = document.querySelector(
            '#sh-audio-popover-menu.open, .sh-audio-popover-menu.open, .sh-popover.open, .sh-dropdown-menu.open'
        );
        if (openPopover) {
            window.SpaceHub?.ui?.modalSlideUpSheet?._closeAudioPopover?.();
            openPopover.classList.remove('open');
            const anchorBtn = document.getElementById('sh-btn-audio-popover') || document.querySelector('.sh-btn-audio-popover');
            if (anchorBtn) this._setFocus(anchorBtn);
            return;
        }

        // 1. Modale fiche média
        const slideUpModal = document.querySelector('.sh-slideup-sheet--open');
        if (slideUpModal) {
            const currentItem = window.SpaceHub?.ui?.modalSlideUpSheet?._currentItem;
            window.SpaceHub?.ui?.modalSlideUpSheet?.close?.();
            this.onModalClosed(currentItem);
            return;
        }
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
        if (scope === 'player') {
            // Transmission directe des actions manette/remote au lecteur vidéo
            const player = window.SpaceHub?.player;
            if (player && typeof player._onKeyDown === 'function') {
                const keyMap = {
                    'UP': 'ArrowUp',
                    'DOWN': 'ArrowDown',
                    'LEFT': 'ArrowLeft',
                    'RIGHT': 'ArrowRight',
                    'SELECT': 'Enter',
                    'BACK': 'Escape',
                    'PLAY_PAUSE': ' '
                };
                const fakeKey = keyMap[action];
                if (fakeKey) {
                    player._onKeyDown({ key: fakeKey, preventDefault: () => {}, target: document.body });
                }
            }
            return;
        }

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
            this._focusedElement.classList.remove('sh-tv-focused', 'sh-focus-active');
            this._focusedElement = null;
        }
        document.querySelectorAll('.sh-tv-focused, .sh-focus-active').forEach(el => el.classList.remove('sh-tv-focused', 'sh-focus-active'));
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
