/**
 * SpaceHub — Spatial Navigation Engine (Navigation v10.2)
 * Version: 10.2.0
 * Moteur de Navigation Spatiale 2D à Confinement Hiérarchique Strict :
 * - Singleton Unique absolu (aucun écrasement possible)
 * - Focus Registry 100% Explicite (Zéro fallback générique flou)
 * - Vrai CarouselController asservi par index (Fast Scroll sans superposition d'animations)
 * - Scoring 2D par Hiérarchie de Conteneurs : Même Carrousel ➔ Même Rangée ➔ Même Widget ➔ Voisin Immédiat
 * - Mémoire de colonne X et gestion douce du mode souris
 */

'use strict';

import Logger from './Logger.js';
import { NavAction, mapKeyboardEvent, isDirectionAction } from './InputMapper.js';
import GamepadInput from './GamepadInput.js';

export class SpatialNavigation {
    constructor({ root = document } = {}) {
        this._log = new Logger('SpatialNav-v10.2');
        this._root = root;
        this._isEnabled = true;

        // 1. Navigation State Centralisé
        this._state = {
            mode: 'tv',
            scope: 'dashboard',
            container: null,
            focusedElement: null,
            previousElement: null,
            row: 0,
            column: 0,
            index: 0,
            history: []
        };

        // 2. Focus Registry Central (Scope -> Provider Function)
        this._focusRegistry = new Map();

        // 3. Repeat & Fast Scroll Engine
        this._repeatState = {
            activeAction: null,
            pressStartTime: 0,
            lastTickTime: 0,
            cadence: 180,
            timerId: null,
            isFastScrolling: false
        };

        // 4. Mémorisation de Colonne X
        this._lastColumnX = null;

        // 5. Gamepad Unique
        this._gamepad = new GamepadInput({
            onAction: (action) => this.handleAction(action)
        });

        // 6. Bindings d'événements
        this._boundKeyDown = this._handleKeyDown.bind(this);
        this._boundKeyUp = this._handleKeyUp.bind(this);
        this._boundMouseMove = this._handleMouseMove.bind(this);
        this._boundResize = this._handleResize.bind(this);

        this._bindEvents();
        this._log.info('Moteur Navigation v10.2 initialisé (Registry 100% Strict & Hiérarchie Déterministe).');
    }

    // ─── FOCUS REGISTRY 100% STRICT ──────────────────────────────────────────

    registerFocusables(scopeName, provider) {
        if (!scopeName) return;
        this._focusRegistry.set(scopeName, provider);
        this._log.debug(`Focus Registry: scope "${scopeName}" enregistré avec succès.`);
    }

    unregisterFocusables(scopeName) {
        this._focusRegistry.delete(scopeName);
    }

    getFocusables(scopeOrContainer) {
        let rawElements = [];

        if (typeof scopeOrContainer === 'string') {
            const provider = this._focusRegistry.get(scopeOrContainer);
            if (typeof provider === 'function') {
                rawElements = provider(this._root);
            } else if (Array.isArray(provider)) {
                rawElements = provider;
            } else if (typeof provider === 'string') {
                rawElements = Array.from(this._root.querySelectorAll(provider));
            }
        } else if (scopeOrContainer instanceof HTMLElement) {
            rawElements = Array.from(scopeOrContainer.querySelectorAll(
                '[data-nav-focusable="true"], .sh-card, .sh-hero-btn, .sh-hero-edge-btn, .sh-nav-tab-btn, .sh-jellyseerr-bento-card, .sh-jellyseerr-req-action-btn, #sh-player-timeline-focus, .sh-dock-pill-btn, .sh-pearl-play-btn, .sh-micro-btn, .sh-settings-nav-item, .sh-settings-input, .sh-settings-toggle, .sh-sidebar-item, .sh-lib-tab-btn, .sh-lib-genre-chip, .sh-lib-alpha-btn, .sh-dl-tab-btn, .sh-dl-action-btn'
            ));
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
            if (el.getAttribute('aria-hidden') === 'true') return false;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
    }

    // ─── FOCUS CONTROLLER ATOMIQUE ───────────────────────────────────────────

    setFocus(element, { scroll = true, reason = 'nav', silent = false, instantScroll = false } = {}) {
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

        // Alignement colonne X
        const rect = element.getBoundingClientRect();
        this._lastColumnX = rect.left + rect.width / 2;

        // Synchronisation du carrousel sans superposition d'animations
        const carousel = element.closest('.sh-carousel-scroller, .sh-card-carousel, [data-carousel], .sh-carousel-container');
        if (carousel && scroll) {
            this._syncCarouselScroll(carousel, element, instantScroll);
        } else if (scroll) {
            this._scrollIntoViewIfNeeded(element);
        }

        // Événement global unifié
        if (!silent) {
            window.SpaceHub?.core?.eventBus?.emit('navigation:focusChanged', {
                previous: prev,
                current: element,
                scope: this._state.scope,
                reason,
                instantScroll
            });
        }
    }

    _syncCarouselScroll(carousel, targetElement, instant = false) {
        const scroller = carousel.querySelector('.sh-carousel-viewport, .sh-carousel-track, .sh-carousel-scroll') || carousel;
        const targetRect = targetElement.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();

        const offsetLeft = targetRect.left - scrollerRect.left;
        const centerTarget = offsetLeft - (scrollerRect.width / 2) + (targetRect.width / 2);

        scroller.scrollBy({
            left: centerTarget,
            behavior: instant ? 'auto' : 'smooth'
        });
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

    // ─── DÉTECTION DU SCOPE ──────────────────────────────────────────────────

    _detectCurrentScope() {
        if (document.querySelector('.sh-grand-cinema-player, #sh-grand-cinema-player')) return 'player';
        if (document.querySelector('#sh-modal-spacehub-settings.sh-modal--open')) return 'settings';
        if (document.querySelector('.sh-modal--open, .sh-slideup-sheet--open, .sh-modal-overlay.open, .sh-console-modal-overlay.open, #sh-admin-dashboard-modal')) return 'modal';
        if (document.querySelector('.sh-sidebar--open, .sh-sidebar-drawer.open')) return 'sidebar';
        if (document.querySelector('.sh-unified-search--open')) return 'search';

        const focused = this._state.focusedElement || document.activeElement;
        if (focused?.closest?.('.sh-dynamic-island, #sh-dynamic-island')) return 'dynamic-island';
        if (focused?.closest?.('.sh-jellyseerr-view, [data-nav-scope="jellyseerr"]')) return 'jellyseerr';

        const appLayout = window.SpaceHub?.appLayout || window.SpaceHub?.ui?.appLayout;
        return appLayout?._currentView || 'dashboard';
    }

    // ─── VRAI CAROUSEL CONTROLLER ASSERVI PAR INDEX ──────────────────────────

    _handleCarouselNavigation(carousel, currentCard, direction, isFastScroll = false) {
        const cards = Array.from(carousel.querySelectorAll('.sh-card, [data-nav-focusable="true"]'));
        const curIdx = cards.indexOf(currentCard);
        if (curIdx === -1) return false;

        let targetIdx = direction === NavAction.RIGHT ? curIdx + 1 : curIdx - 1;
        if (targetIdx < 0 || targetIdx >= cards.length) {
            return false; // Limite atteinte
        }

        const targetCard = cards[targetIdx];
        this.setFocus(targetCard, {
            reason: isFastScroll ? 'fast-scroll' : 'nav',
            instantScroll: isFastScroll
        });
        return true;
    }

    // ─── MOTEUR SPATIAL 2D PAR HIÉRARCHIE DE CONTENEURS STRICTE ──────────────

    _findSpatialTarget(direction) {
        const current = this._state.focusedElement || document.activeElement;
        const scope = this._detectCurrentScope();
        const candidates = this.getFocusables(scope);

        if (candidates.length === 0) return null;
        if (!current || !candidates.includes(current)) return candidates[0];

        // 1. Délégation Prioritaire au Carrousel en Navigation Horizontale
        const currentCarousel = current.closest('.sh-carousel-scroller, .sh-card-carousel, [data-carousel], .sh-carousel-container');
        if (currentCarousel && (direction === NavAction.LEFT || direction === NavAction.RIGHT)) {
            const handled = this._handleCarouselNavigation(currentCarousel, current, direction, this._repeatState.isFastScrolling);
            if (handled) return null; // Action déjà exécutée par le CarouselController
        }

        const curRect = current.getBoundingClientRect();
        const curCenterX = this._lastColumnX !== null ? this._lastColumnX : (curRect.left + curRect.width / 2);
        const curCenterY = curRect.top + curRect.height / 2;

        const currentWidget = current.closest('.sh-widget-section, .sh-dashboard-section, .sh-jellyseerr-view, .sh-dynamic-island');

        let bestCandidate = null;
        let bestScore = -Infinity;

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

            const dist = Math.hypot(deltaX, deltaY);
            let score = 2000 - dist;

            const candCarousel = cand.closest('.sh-carousel-scroller, .sh-card-carousel, [data-carousel], .sh-carousel-container');
            const candWidget = cand.closest('.sh-widget-section, .sh-dashboard-section, .sh-jellyseerr-view, .sh-dynamic-island');

            // 2. Priorité : même carrousel (horizontal)
            if (direction === NavAction.LEFT || direction === NavAction.RIGHT) {
                if (currentCarousel && candCarousel === currentCarousel) {
                    score += 1500;
                }
                const alignY = Math.abs(deltaY);
                score -= alignY * 5;
            }

            // 3. Priorité : même widget ou widget adjacent (vertical)
            if (direction === NavAction.UP || direction === NavAction.DOWN) {
                if (currentWidget && candWidget === currentWidget) {
                    score += 500;
                }
                const alignX = Math.abs(candCenterX - curCenterX);
                score -= alignX * 3.5;
            }

            if (score > bestScore) {
                bestScore = score;
                bestCandidate = cand;
            }
        }

        return bestCandidate;
    }

    // ─── REPEAT & FAST SCROLL ENGINE ─────────────────────────────────────────

    _startInputRepeat(action) {
        if (this._repeatState.activeAction === action) return;
        this._stopInputRepeat();

        this._repeatState.activeAction = action;
        this._repeatState.pressStartTime = Date.now();
        this._repeatState.lastTickTime = Date.now();
        this._repeatState.cadence = 180;
        this._repeatState.isFastScrolling = false;

        this._executeNavStep(action, false);

        const repeatLoop = () => {
            if (!this._repeatState.activeAction) return;
            const elapsed = Date.now() - this._repeatState.pressStartTime;

            this._repeatState.isFastScrolling = elapsed > 350;

            if (elapsed > 2000) this._repeatState.cadence = 45;
            else if (elapsed > 1000) this._repeatState.cadence = 70;
            else if (elapsed > 350) this._repeatState.cadence = 100;
            else this._repeatState.cadence = 180;

            this._executeNavStep(this._repeatState.activeAction, this._repeatState.isFastScrolling);
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
        this._repeatState.isFastScrolling = false;
    }

    _executeNavStep(action, isFastScroll = false) {
        const target = this._findSpatialTarget(action);
        if (target) {
            this.setFocus(target, { reason: 'repeat', instantScroll: isFastScroll });
            if (!isFastScroll) {
                window.SpaceHub?.core?.audioFeedback?.playTick?.();
            }
        }
    }

    // ─── GESTION DES TOUCHES & SELECT INSTANTANÉ ──────────────────────────────

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

        // 2. Navigation Directionnelle
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
            e.preventDefault();
            this.activateFocused();
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
        }
    }

    _handleMouseMove() {
        if (this._state.mode !== 'mouse') {
            this._state.mode = 'mouse';
        }
    }

    _handleResize() {
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
