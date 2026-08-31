/**
 * SpaceHub — Spatial Navigation Engine (Navigation v10)
 * Version: 10.0.0
 * Moteur de Navigation Spatiale 2D Déterministe & Centralisé :
 * - NavigationState (mode, scope, container, row, column, index, history)
 * - Focus Registry centralisé par scope
 * - Contrôleur setFocus unifié avec émission d'événement 'navigation:focusChanged'
 * - Scoring géométrique pondéré avec mémoire de colonne X
 * - Input Repeat & Fast Scroll Engine multi-paliers (0-500ms, 500-1000ms, 1-2s, >2s)
 * - Gestion propre du mode souris sans destruction brutale du focus
 * - Focus Trap et pile de modales (Stack) avec restauration fidèle
 */

'use strict';

import Logger from './Logger.js';
import { NavAction, mapKeyboardEvent, isDirectionAction } from './InputMapper.js';
import GamepadInput from './GamepadInput.js';

export class SpatialNavigation {
    constructor({ root = document } = {}) {
        this._log = new Logger('SpatialNav-v10');
        this._root = root;
        this._isEnabled = true;

        // 1. Navigation State Central
        this._state = {
            mode: 'tv', // 'tv' | 'mouse' | 'touch'
            scope: 'dashboard',
            container: null,
            focusedElement: null,
            previousElement: null,
            row: 0,
            column: 0,
            index: 0,
            history: []
        };

        // 2. Focus Registry (Scope -> Provider Function)
        this._focusRegistry = new Map();

        // 3. Carrousels Enregistrés (Element -> Carousel Controller)
        this._carouselRegistry = new Map();

        // 4. Input Repeat & Fast Scroll Engine
        this._repeatState = {
            activeAction: null,
            pressStartTime: 0,
            lastTickTime: 0,
            cadence: 180,
            timerId: null
        };

        // 5. Mémorisation de Colonne X
        this._lastColumnX = null;

        // 6. Gamepad
        this._gamepad = new GamepadInput({
            onAction: (action) => this.handleAction(action)
        });

        // 7. Bindings d'événements
        this._boundKeyDown = this._handleKeyDown.bind(this);
        this._boundKeyUp = this._handleKeyUp.bind(this);
        this._boundMouseMove = this._handleMouseMove.bind(this);
        this._boundResize = this._handleResize.bind(this);

        this._selectHoldTimer = null;
        this._isLongPressActive = false;

        this._bindEvents();
        this._log.info('Moteur Navigation v10 initialisé avec succès.');
    }

    // ─── API DU FOCUS REGISTRY ───────────────────────────────────────────────

    /**
     * Enregistre un résolveur d'éléments focusables pour un scope donné
     * @param {string} scopeName
     * @param {Function|Array|string} provider
     */
    registerFocusables(scopeName, provider) {
        if (!scopeName) return;
        this._focusRegistry.set(scopeName, provider);
        this._log.debug(`Focus Registry: scope "${scopeName}" enregistré.`);
    }

    /**
     * Désenregistre un scope du registre
     * @param {string} scopeName
     */
    unregisterFocusables(scopeName) {
        this._focusRegistry.delete(scopeName);
    }

    /**
     * Récupère tous les focusables valides et visibles pour un scope ou conteneur
     * @param {string|HTMLElement} scopeOrContainer
     * @returns {HTMLElement[]}
     */
    getFocusables(scopeOrContainer) {
        let rawElements = [];

        if (typeof scopeOrContainer === 'string' && this._focusRegistry.has(scopeOrContainer)) {
            const provider = this._focusRegistry.get(scopeOrContainer);
            if (typeof provider === 'function') {
                rawElements = provider(this._root);
            } else if (Array.isArray(provider)) {
                rawElements = provider;
            } else if (typeof provider === 'string') {
                rawElements = Array.from(this._root.querySelectorAll(provider));
            }
        } else if (scopeOrContainer instanceof HTMLElement) {
            const scope = this._detectCurrentScope();
            if (this._focusRegistry.has(scope)) {
                const provider = this._focusRegistry.get(scope);
                if (typeof provider === 'function') rawElements = provider(scopeOrContainer);
            }
            if (!rawElements || rawElements.length === 0) {
                rawElements = Array.from(scopeOrContainer.querySelectorAll(
                    '[data-nav-focusable="true"], .sh-card, .sh-hero-btn, .sh-hero-edge-btn, .sh-nav-tab-btn, .sh-tab-btn, .sh-jellyseerr-bento-card, .sh-jellyseerr-req-action-btn, #sh-player-timeline-focus, .sh-dock-pill-btn, .sh-pearl-play-btn, .sh-micro-btn, button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                ));
            }
        } else {
            const scope = this._detectCurrentScope();
            return this.getFocusables(scope);
        }

        return this._filterVisibleElements(rawElements);
    }

    _filterVisibleElements(elements) {
        if (!Array.isArray(elements)) return [];
        return elements.filter(el => {
            if (!el || !(el instanceof HTMLElement) || el.disabled) return false;
            if (el.getAttribute('aria-hidden') === 'true' || el.getAttribute('tabindex') === '-1') {
                if (!el.hasAttribute('data-nav-focusable')) return false;
            }
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
    }

    // ─── FOCUS CONTROLLER UNIFIÉ ─────────────────────────────────────────────

    /**
     * Définit le focus sur un élément de façon atomique et émet l'événement global
     * @param {HTMLElement} element
     * @param {Object} options
     */
    setFocus(element, { scroll = true, reason = 'nav', silent = false } = {}) {
        if (!element || element === this._state.focusedElement) return;

        const prev = this._state.focusedElement;
        if (prev) {
            prev.classList.remove('sh-focus-active', 'sh-tv-focused');
            if (!prev.hasAttribute('data-nav-focusable')) {
                prev.setAttribute('tabindex', '-1');
            }
        }

        this._state.previousElement = prev;
        this._state.focusedElement = element;
        this._state.mode = 'tv';

        element.setAttribute('tabindex', '0');
        element.focus({ preventScroll: true });
        element.classList.add('sh-focus-active', 'sh-tv-focused');

        // Mémorisation de l'alignement X
        const rect = element.getBoundingClientRect();
        this._lastColumnX = rect.left + rect.width / 2;

        // Synchronisation du conteneur et du carrousel
        const carousel = element.closest('.sh-carousel-scroller, .sh-card-carousel, [data-carousel]');
        if (carousel && scroll) {
            this._syncCarouselScroll(carousel, element);
        } else if (scroll) {
            this._scrollIntoViewIfNeeded(element);
        }

        // Notification globale EventBus
        if (!silent) {
            window.SpaceHub?.core?.eventBus?.emit('navigation:focusChanged', {
                previous: prev,
                current: element,
                scope: this._state.scope,
                reason
            });
        }
    }

    _syncCarouselScroll(carousel, targetElement) {
        const scroller = carousel.querySelector('.sh-carousel-viewport, .sh-carousel-track, .sh-carousel-scroll') || carousel;
        const targetRect = targetElement.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();

        const offsetLeft = targetRect.left - scrollerRect.left;
        const centerTarget = offsetLeft - (scrollerRect.width / 2) + (targetRect.width / 2);
        scroller.scrollBy({ left: centerTarget, behavior: 'smooth' });
    }

    _scrollIntoViewIfNeeded(element) {
        const rect = element.getBoundingClientRect();
        if (rect.top < 80 || rect.bottom > window.innerHeight - 80) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }

    clearFocus() {
        if (this._state.focusedElement) {
            this._state.focusedElement.classList.remove('sh-focus-active', 'sh-tv-focused');
            this._state.focusedElement = null;
        }
    }

    // ─── GESTION DES SCOPES ──────────────────────────────────────────────────

    _detectCurrentScope() {
        if (document.querySelector('.sh-grand-cinema-player, #sh-grand-cinema-player')) return 'player';
        if (document.querySelector('#sh-modal-spacehub-settings.sh-modal--open')) return 'settings';
        if (document.querySelector('.sh-modal--open, .sh-slideup-sheet--open, .sh-modal-overlay.open, .sh-console-modal-overlay.open, #sh-admin-dashboard-modal')) return 'modal';
        if (document.querySelector('.sh-sidebar--open, .sh-sidebar-drawer.open')) return 'sidebar';
        if (document.querySelector('.sh-unified-search--open')) return 'search';

        const focused = this._state.focusedElement || document.activeElement;
        if (focused?.closest('.sh-dynamic-island, #sh-dynamic-island')) return 'dynamic-island';
        if (focused?.closest('.sh-jellyseerr-view, [data-nav-scope="jellyseerr"]')) return 'jellyseerr';

        const appLayout = window.SpaceHub?.appLayout || window.SpaceHub?.ui?.appLayout;
        return appLayout?._currentView || 'dashboard';
    }

    setScope(scopeName) {
        this._state.scope = scopeName;
        this._log.debug(`Scope de navigation défini sur: "${scopeName}"`);
    }

    // ─── MOTEUR SPATIAL 2D & SCORING PONDÉRÉ ─────────────────────────────────

    _findSpatialTarget(direction) {
        const current = this._state.focusedElement || document.activeElement;
        const scope = this._detectCurrentScope();
        const candidates = this.getFocusables(scope);

        if (candidates.length === 0) return null;
        if (!current || !candidates.includes(current)) return candidates[0];

        const curRect = current.getBoundingClientRect();
        const curCenterX = this._lastColumnX !== null ? this._lastColumnX : (curRect.left + curRect.width / 2);
        const curCenterY = curRect.top + curRect.height / 2;

        let bestCandidate = null;
        let bestScore = -Infinity;

        const currentCarousel = current.closest('.sh-carousel-scroller, .sh-card-carousel, [data-carousel]');

        for (const cand of candidates) {
            if (cand === current) continue;
            const candRect = cand.getBoundingClientRect();
            const candCenterX = candRect.left + candRect.width / 2;
            const candCenterY = candRect.top + candRect.height / 2;

            const deltaX = candCenterX - curCenterX;
            const deltaY = candCenterY - curCenterY;

            // Filtrage directionnel strict
            if (direction === NavAction.RIGHT && deltaX <= 4) continue;
            if (direction === NavAction.LEFT && deltaX >= -4) continue;
            if (direction === NavAction.DOWN && deltaY <= 4) continue;
            if (direction === NavAction.UP && deltaY >= -4) continue;

            // Calcul de distance euclidienne et alignement
            const dist = Math.hypot(deltaX, deltaY);
            let score = 1000 - dist;

            // A. Bonus pour le même conteneur / carrousel en navigation horizontale
            const candCarousel = cand.closest('.sh-carousel-scroller, .sh-card-carousel, [data-carousel]');
            if ((direction === NavAction.LEFT || direction === NavAction.RIGHT)) {
                if (currentCarousel && candCarousel === currentCarousel) {
                    score += 500; // Priorité absolue au même carrousel
                }
                const alignY = Math.abs(deltaY);
                score -= alignY * 4;
            }

            // B. Bonus pour l'alignement de colonne en navigation verticale
            if (direction === NavAction.UP || direction === NavAction.DOWN) {
                const alignX = Math.abs(candCenterX - curCenterX);
                score -= alignX * 2.5; // Favorise la colonne mémorisée
            }

            if (score > bestScore) {
                bestScore = score;
                bestCandidate = cand;
            }
        }

        return bestCandidate;
    }

    // ─── INPUT REPEAT & FAST SCROLL ENGINE ───────────────────────────────────

    _startInputRepeat(action) {
        if (this._repeatState.activeAction === action) return;
        this._stopInputRepeat();

        this._repeatState.activeAction = action;
        this._repeatState.pressStartTime = Date.now();
        this._repeatState.lastTickTime = Date.now();
        this._repeatState.cadence = 180;

        this._executeNavStep(action);

        const repeatLoop = () => {
            if (!this._repeatState.activeAction) return;
            const elapsed = Date.now() - this._repeatState.pressStartTime;

            // Paliers d'accélération
            if (elapsed > 2000) this._repeatState.cadence = 45;
            else if (elapsed > 1000) this._repeatState.cadence = 70;
            else if (elapsed > 500) this._repeatState.cadence = 110;
            else this._repeatState.cadence = 180;

            this._executeNavStep(this._repeatState.activeAction);
            this._repeatState.timerId = setTimeout(repeatLoop, this._repeatState.cadence);
        };

        this._repeatState.timerId = setTimeout(repeatLoop, this._repeatState.cadence);
    }

    _stopInputRepeat() {
        if (this._repeatState.timerId) {
            clearTimeout(this._repeatState.timerId);
            this._repeatState.timerId = null;
        }
        this._repeatState.activeAction = null;
    }

    _executeNavStep(action) {
        const target = this._findSpatialTarget(action);
        if (target) {
            this.setFocus(target, { reason: 'repeat' });
            window.SpaceHub?.core?.audioFeedback?.playTick?.();
        }
    }

    // ─── GESTION DES ACTIONS ET ÉVÉNEMENTS CLAVIER ───────────────────────────

    handleAction(action) {
        if (!this._isEnabled || !action) return;

        const scope = this._detectCurrentScope();

        // 1. Délégation VideoPlayer
        if (scope === 'player') {
            if (action === NavAction.BACK || action === NavAction.MENU) {
                this._handleBack(null);
                return;
            }
            const player = window.SpaceHub?.player;
            if (player && typeof player.handleNavAction === 'function') {
                player.handleNavAction(action);
            }
            return;
        }

        // 2. Traitement Directionnel
        if (isDirectionAction(action)) {
            const target = this._findSpatialTarget(action);
            if (target) {
                this.setFocus(target);
                window.SpaceHub?.core?.audioFeedback?.playTick?.();
            }
            return;
        }

        // 3. Actions Spécifiques
        switch (action) {
            case NavAction.SELECT:
                this.activateFocused();
                break;
            case NavAction.BACK:
                this._handleBack(null);
                break;
            case NavAction.MENU:
                this._toggleSidebar();
                break;
            case NavAction.PAGE_UP:
                this._handlePaging('up');
                break;
            case NavAction.PAGE_DOWN:
                this._handlePaging('down');
                break;
        }
    }

    activateFocused() {
        const el = this._state.focusedElement || document.activeElement;
        if (!el) return;

        window.SpaceHub?.core?.audioFeedback?.playSelect?.();

        // Gestion spéciale Dynamic Island avatar dropdown
        if (el.id === 'sh-user-menu-btn' || el.classList.contains('sh-user-avatar-btn')) {
            if (window.SpaceHub?._toggleUserDropdown) {
                window.SpaceHub._toggleUserDropdown(true);
                setTimeout(() => {
                    const firstItem = document.querySelector('#sh-user-dropdown .sh-user-dropdown__item');
                    if (firstItem) this.setFocus(firstItem);
                }, 60);
            }
            return;
        }

        el.click();
    }

    _handleKeyDown(e) {
        if (!this._isEnabled) return;

        const action = mapKeyboardEvent(e);
        if (!action) return;

        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
        if (isInput && action !== NavAction.BACK && action !== NavAction.DOWN && action !== NavAction.UP) return;

        const scope = this._detectCurrentScope();

        // Scope Player
        if (scope === 'player') {
            if (action === NavAction.BACK || action === NavAction.MENU) {
                this._handleBack(e);
                return;
            }
            const player = window.SpaceHub?.player;
            if (player && typeof player.handleNavAction === 'function') {
                e.preventDefault();
                player.handleNavAction(action);
            }
            return;
        }

        if (isDirectionAction(action)) {
            e.preventDefault();
            if (!e.repeat) {
                this._startInputRepeat(action);
            }
        } else if (action === NavAction.SELECT) {
            this._isLongPressActive = false;
            if (this._selectHoldTimer) clearTimeout(this._selectHoldTimer);

            if (!e.repeat && this._state.focusedElement?.classList.contains('sh-card')) {
                this._selectHoldTimer = setTimeout(() => {
                    this._isLongPressActive = true;
                    this._openCardContextMenu(this._state.focusedElement);
                }, 600);
            }

            if (!e.repeat) e.preventDefault();
        } else if (action === NavAction.BACK) {
            e.preventDefault();
            this._handleBack(e);
        } else if (action === NavAction.MENU) {
            e.preventDefault();
            this._toggleSidebar();
        } else if (action === NavAction.PAGE_DOWN) {
            e.preventDefault();
            this._handlePaging('down');
        } else if (action === NavAction.PAGE_UP) {
            e.preventDefault();
            this._handlePaging('up');
        }
    }

    _handleKeyUp(e) {
        const action = mapKeyboardEvent(e);
        if (isDirectionAction(action)) {
            this._stopInputRepeat();
        } else if (action === NavAction.SELECT) {
            if (this._selectHoldTimer) {
                clearTimeout(this._selectHoldTimer);
                this._selectHoldTimer = null;
                if (!this._isLongPressActive) {
                    this.activateFocused();
                }
            }
            setTimeout(() => { this._isLongPressActive = false; }, 150);
        }
    }

    _handleMouseMove(e) {
        // Transition douce Mode Souris sans clearFocus brutal
        if (this._state.mode !== 'mouse') {
            this._state.mode = 'mouse';
        }
    }

    _handleResize() {
        // Recalcul des colonnes lors du redimensionnement
        this._lastColumnX = null;
    }

    _handleBack(e) {
        // 1. Modale Réglages
        const settingsModal = document.querySelector('#sh-modal-spacehub-settings.sh-modal--open');
        if (settingsModal) {
            e?.preventDefault?.();
            window.SpaceHub?.settingsPanel?.close?.();
            this.onModalClosed();
            return;
        }

        // 2. Fiche Média SlideUp
        const slideUpModal = document.querySelector('.sh-slideup-sheet--open');
        if (slideUpModal) {
            e?.preventDefault?.();
            const slideUpInstance = window.SpaceHub?.ui?.modalSlideUpSheet || window.SpaceHub?.modalSlideUpSheet;
            if (slideUpInstance && typeof slideUpInstance.close === 'function') {
                slideUpInstance.close();
            } else {
                slideUpModal.classList.remove('sh-slideup-sheet--open');
                this.onModalClosed();
            }
            return;
        }

        // 3. Modales Générales
        const openModal = document.querySelector('.sh-modal-overlay.open, .sh-console-modal-overlay.open, #sh-admin-dashboard-modal, .sh-modal--open');
        if (openModal) {
            e?.preventDefault?.();
            openModal.classList.remove('open', 'sh-modal--open');
            this.onModalClosed();
            return;
        }

        // 4. Sidebar Drawer
        const openDrawer = document.querySelector('.sh-sidebar--open, .sh-sidebar-drawer.open');
        if (openDrawer) {
            e?.preventDefault?.();
            this._toggleSidebar();
            return;
        }

        // 5. VideoPlayer
        const playerEl = document.querySelector('#sh-grand-cinema-player');
        if (playerEl) {
            e?.preventDefault?.();
            window.SpaceHub?.player?.close?.();
            return;
        }
    }

    _toggleSidebar() {
        const sidebar = window.SpaceHub?.ui?.sidebar 
            || window.SpaceHub?.sidebar 
            || window.SpaceHub?.ui?.appLayout?._sidebar
            || window.SpaceHub?.appLayout?._sidebar;

        if (sidebar && typeof sidebar.toggle === 'function') {
            sidebar.toggle();
            const openDrawer = document.querySelector('.sh-sidebar--open, .sh-sidebar-drawer.open');
            if (openDrawer) {
                const firstItem = openDrawer.querySelector('.sh-sidebar-item, a, button');
                if (firstItem) this.setFocus(firstItem);
            } else {
                this.restorePreviousFocus();
            }
        }
    }

    _handlePaging(direction) {
        const scope = this._detectCurrentScope();
        const focusables = this.getFocusables(scope);
        if (focusables.length === 0) return;

        const curIdx = focusables.indexOf(this._state.focusedElement);
        const pageSize = 8;
        const targetIdx = direction === 'down' 
            ? Math.min(focusables.length - 1, curIdx + pageSize)
            : Math.max(0, curIdx - pageSize);

        this.setFocus(focusables[targetIdx]);
    }

    _openCardContextMenu(card) {
        const bookmarkBtn = card.querySelector('.sh-card__bookmark-btn');
        if (bookmarkBtn) {
            bookmarkBtn.click();
            window.SpaceHub?.ui?.components?.toaster?.info('★ Favori basculé');
        }
    }

    onModalOpened(container, defaultFocusEl = null) {
        const target = defaultFocusEl || (container ? this.getFocusables(container)[0] : null);
        if (target) this.setFocus(target);
    }

    onModalClosed() {
        this.restorePreviousFocus();
    }

    restorePreviousFocus() {
        if (this._state.previousElement && document.contains(this._state.previousElement)) {
            this.setFocus(this._state.previousElement);
        } else {
            const scope = this._detectCurrentScope();
            const focusables = this.getFocusables(scope);
            if (focusables.length > 0) this.setFocus(focusables[0]);
        }
    }

    getGamepad() {
        return this._gamepad;
    }

    _bindEvents() {
        window.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('keyup', this._boundKeyUp);
        window.addEventListener('mousemove', this._boundMouseMove, { passive: true });
        window.addEventListener('resize', this._boundResize, { passive: true });
        window.addEventListener('orientationchange', this._boundResize, { passive: true });
    }

    _unbindEvents() {
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);
        window.removeEventListener('mousemove', this._boundMouseMove);
        window.removeEventListener('resize', this._boundResize);
        window.removeEventListener('orientationchange', this._boundResize);
        this._stopInputRepeat();
    }

    destroy() {
        this._unbindEvents();
        this._gamepad?.destroy?.();
    }
}

export default SpatialNavigation;
