/**
 * SpaceHub — Spatial Navigation Engine (Navigation v11.0 Résolution Définitive)
 * Version: 11.0.0
 * Moteur Spatial 2D Industriel :
 * - Singleton Unique (Lifecycle garanti)
 * - Sélecteurs Réels Universels (#sh-hero-btn-play, .sh-card, etc.)
 * - Détection de Nœud Détaché & Focus Recovery Automatique
 * - Algorithme Géométrique Standard W3C Projection Overlap Pur
 * - Auto-Focus Déterministe sur Transition de Vue (focusFirst)
 * - Pivot Scroll Viewport (35% du haut, visibilité optimale sous la capsule)
 */

'use strict';

import Logger from './Logger.js';
import { NavAction, mapKeyboardEvent, isDirectionAction } from './InputMapper.js';
import GamepadInput from './GamepadInput.js';
import { CarouselController } from './CarouselController.js';
import { LAYERS, BACK_ORDER, FOCUSABLES, CAROUSELS, SCROLL_CONTAINERS } from './DomContracts.js';


import * as svc from './services.js';
// Les conteneurs de défilement viennent désormais de core/DomContracts.js
const CAROUSEL_SELECTOR = CAROUSELS;

export class SpatialNavigation {
    constructor({ root = document } = {}) {
        this._log = new Logger('SpatialNav-v11');
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

        // 2. Focus Registry Centralisé (Scope -> Provider Function)
        this._focusRegistry = new Map();

        // 3. Carousel Controller Dédié
        this._carouselController = new CarouselController();

        // 4. Repeat & Fast Scroll Engine
        this._repeatState = {
            activeAction: null,
            pressStartTime: 0,
            lastTickTime: 0,
            cadence: 180,
            timerId: null,
            isFastScrolling: false
        };

        // 5. Mémorisation de Colonne X
        this._lastColumnX = null;

        // 5bis. Répétition manette dédiée au scope Player (délégation directe, hors moteur générique)
        this._gamepadPlayerRepeatTimer = null;

        // 6. Gamepad Unique
        // La répétition directionnelle manette est désormais unifiée avec celle du clavier
        // via _startInputRepeat()/_stopInputRepeat() (cf. plan A06) — GamepadInput ne fait plus
        // que signaler le début/la fin d'une pression directionnelle.
        this._gamepad = new GamepadInput({
            onAction: (action) => this.handleAction(action), // boutons non-directionnels (A/B/Start/Select/L2/R2)
            onDirectionStart: (direction) => this._onGamepadDirectionStart(direction),
            onDirectionEnd: () => this._onGamepadDirectionEnd()
        });

        // 7. Bindings d'événements
        this._boundKeyDown = this._handleKeyDown.bind(this);
        this._boundKeyUp = this._handleKeyUp.bind(this);
        this._boundMouseMove = this._handleMouseMove.bind(this);
        this._boundResize = this._handleResize.bind(this);

        // 8. Initialisation des 10 Scopes Réels Déclaratifs
        this._initializeDefaultScopes();

        this._bindEvents();
        this._log.info('Moteur Navigation v11.0 initialisé (Algorithme W3C & Focus Recovery Actif).');
    }

    // ─── INITIALISATION DES 10 SCOPES DU REGISTRY ─────────────────────────────

    _initializeDefaultScopes() {
        // 1. Scope dynamic-island
        this.registerFocusables('dynamic-island', (root = document) => {
            return Array.from(root.querySelectorAll(
                '.sh-dynamic-island .sh-nav-tab-btn, .sh-dynamic-island .sh-nav-action-btn, #sh-user-menu-btn, .sh-user-avatar-btn, [data-nav-scope="dynamic-island"]'
            ));
        });

        // 2. Scope dashboard (Hero Play/Info + Flèches + Cartes Carrousels + Bento Jellyseerr)
        this.registerFocusables('dashboard', (root = document) => {
            return Array.from(root.querySelectorAll(
                '#sh-hero-btn-play, #sh-hero-btn-details, .sh-hero-edge-btn, .sh-dashboard-body .sh-card, .sh-card, .sh-genre-chip, .sh-jellyseerr-bento-card, .sh-jellyseerr-req-action-btn, [data-nav-focusable="true"]'
            ));
        });

        // 3. Scope library (Onglets + Filtres Genres + Barre A-Z + Cartes Médias)
        this.registerFocusables('library', (root = document) => {
            const scopeRoot = root.querySelector('.sh-library-explorer, .sh-library-view') || root;
            return Array.from(scopeRoot.querySelectorAll(
                '.sh-lib-tab-btn, .sh-lib-genre-chip, .sh-lib-alpha-btn, .sh-lib-control-btn, .sh-card, [data-nav-focusable="true"]'
            ));
        });

        // 4. Scope downloads (Onglets + Actions qBittorrent + Cartes Torrents)
        this.registerFocusables('downloads', (root = document) => {
            const scopeRoot = root.querySelector('.sh-downloads-view') || root;
            return Array.from(scopeRoot.querySelectorAll(
                '.sh-dl-tab-btn, .sh-dl-action-btn, .sh-card, .sh-metric-card, [data-nav-focusable="true"]'
            ));
        });

        // 5. Scope jellyseerr (Cartes Bento + Boutons Demande)
        this.registerFocusables('jellyseerr', (root = document) => {
            const scopeRoot = root.querySelector('.sh-jellyseerr-view') || root;
            return Array.from(scopeRoot.querySelectorAll(
                '.sh-jellyseerr-bento-card, .sh-jellyseerr-req-action-btn, .sh-card, [data-nav-scope="jellyseerr"]'
            ));
        });

        // 6. Scope sidebar (items du menu latéral + onglets de hub)
        this.registerFocusables('sidebar', (root = document) => {
            const panel = root.querySelector(LAYERS.sidebar) || document.getElementById('sh-sidebar-panel');
            if (!panel) return [];
            return Array.from(panel.querySelectorAll(`${FOCUSABLES.sidebar}, .sh-hub-tab-btn`));
        });

        // 7. Scope modal (Strictement Confiné à la Modale Active Ouverte)
        this.registerFocusables('modal', (root = document) => {
            const openModal = root.querySelector(
                `${LAYERS.genericModal}, ${LAYERS.slideUpSheet}, ${LAYERS.consoleModal}, ${LAYERS.adminModal}`
            );
            if (!openModal) return [];
            return Array.from(openModal.querySelectorAll(
                '.sh-modal__close, .sh-slideup-close-btn, .sh-cinema-btn-play, .sh-cinema-btn-glass, .sh-season-pill-btn, .sh-console-nav-tab, .sh-tab-btn, .sh-btn--primary, .sh-btn--ghost, button:not([disabled]), [data-nav-focusable="true"]'
            ));
        });

        // 8. Scope player (Strictement Confiné au Player Grand Cinema Actif)
        this.registerFocusables('player', (root = document) => {
            const playerEl = root.querySelector('.sh-grand-cinema-player, #sh-grand-cinema-player') || root;
            return Array.from(playerEl.querySelectorAll(
                '#sh-btn-back, #sh-player-timeline-focus, .sh-pearl-play-btn, .sh-micro-btn, .sh-dock-pill-btn, .sh-top-icon-btn, .sh-popover-item, [data-nav-focusable="true"]'
            ));
        });

        // 9. Scope settings (Strictement Confiné à la Modale Réglages)
        this.registerFocusables('settings', (root = document) => {
            const settingsEl = root.querySelector('#sh-modal-spacehub-settings, .sh-settings-modal') || root;
            return Array.from(settingsEl.querySelectorAll(
                '.sh-settings-nav__item, .sh-input, .sh-settings-toggle, .sh-btn, button:not([disabled]), [data-nav-focusable="true"]'
            ));
        });

        // 10. Scope search (Strictement Confiné au Spotlight Ouvert)
        this.registerFocusables('search', (root = document) => {
            const searchEl = root.querySelector('.sh-unified-search--open, .sh-spotlight-modal') || root;
            return Array.from(searchEl.querySelectorAll(
                '.sh-spotlight-input, .sh-spotlight-tab-btn, .sh-spotlight-item, [data-nav-focusable="true"]'
            ));
        });
    }

    // ─── FOCUS REGISTRY STRICT ────────────────────────────────────────────────

    registerFocusables(scopeName, provider, { force = false } = {}) {
        if (!scopeName) return;
        if (this._focusRegistry.has(scopeName) && !force) {
            this._log.warn(
                `Focus Registry: le scope "${scopeName}" est déjà enregistré. ` +
                `Réécriture ignorée (passez { force: true } si c'est intentionnel). ` +
                `Utilisez extendFocusables() pour composer plusieurs sources sur un même scope.`
            );
            return;
        }
        this._focusRegistry.set(scopeName, provider);
        this._log.debug(`Focus Registry: scope "${scopeName}" enregistré.`);
    }

    /**
     * Ajoute une source supplémentaire d'éléments focusables à un scope existant
     * sans écraser sa définition d'origine (compose au lieu de remplacer).
     */
    extendFocusables(scopeName, extraProvider) {
        if (!scopeName || typeof extraProvider !== 'function') return;
        const base = this._focusRegistry.get(scopeName);
        this._focusRegistry.set(scopeName, (root) => {
            const baseResult = typeof base === 'function' ? base(root) : (Array.isArray(base) ? base : []);
            const extra = extraProvider(root) || [];
            return [...new Set([...baseResult, ...extra])];
        });
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
            rawElements = Array.from(scopeOrContainer.querySelectorAll('[data-nav-focusable="true"], .sh-card, button:not([disabled])'));
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

    // ─── FOCUS RECOVERY & DETACHED NODE DETECTION ────────────────────────────

    _getValidCurrentElement() {
        let el = this._state.focusedElement || document.activeElement;
        if (el && el instanceof HTMLElement && document.contains(el) && el !== document.body) {
            return el;
        }

        // Focus Recovery automatique : sélection du premier candidat valide du scope
        const scope = this._detectCurrentScope();
        const candidates = this.getFocusables(scope);
        if (candidates.length > 0) {
            this.setFocus(candidates[0], { silent: true });
            return candidates[0];
        }

        return null;
    }

    // ─── FOCUS CONTROLLER ATOMIQUE & PIVOT SCROLL ─────────────────────────────

    setFocus(element, { scroll = true, reason = 'nav', silent = false, instantScroll = false } = {}) {
        if (!element || element === this._state.focusedElement) return;

        const prev = this._state.focusedElement;
        if (prev && document.contains(prev)) {
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

        // Alignement colonne X memorise.
        // Il ne doit etre mis a jour que sur un mouvement HORIZONTAL : sinon la
        // "memoire de colonne" est reecrite a chaque haut/bas et ne sert a rien.
        // Il est aussi recalcule APRES defilement (voir plus bas), car l'ancienne
        // version le figeait avant le scroll et visait ensuite une colonne
        // decalee de plusieurs centaines de pixels.
        const rect = element.getBoundingClientRect();
        if (reason !== 'vertical-move') {
            this._lastColumnX = rect.left + rect.width / 2;
        }

        // Synchronisation du carrousel ou défilement avec Pivot Viewport (35%)
        // Les deux axes sont complémentaires, pas redondants :
        //  - scrollToCard        => défilement HORIZONTAL de la rangée
        //  - _scrollIntoViewIfNeeded => défilement VERTICAL de la page
        // Les traiter en if/else laissait l'élément focalisé hors écran verticalement
        // dès qu'il appartenait à un carrousel (cas de toutes les cartes du Dashboard).
        if (scroll) {
            const carousel = element.closest(CAROUSEL_SELECTOR);
            if (carousel) {
                this._carouselController.scrollToCard(carousel, element, instantScroll ? 'auto' : 'smooth');
            }
            this._scrollIntoInnerContainer(element);
            this._scrollIntoViewIfNeeded(element);
            // La position a change : on rafraichit la colonne memorisee pour que
            // le prochain haut/bas vise la bonne verticale.
            requestAnimationFrame(() => {
                if (this._state.focusedElement !== element) return;
                const r2 = element.getBoundingClientRect();
                if (r2.width > 0) this._lastColumnX = r2.left + r2.width / 2;
            });
        }

        // Événement global unifié
        if (!silent) {
            svc.eventBus()?.emit('navigation:focusChanged', {
                previous: prev,
                current: element,
                scope: this._state.scope,
                reason,
                instantScroll
            });
        }
    }

    /**
     * Fait defiler les conteneurs a defilement VERTICAL interne (listes a
     * hauteur contrainte, popovers, cellules de calendrier). _scrollIntoViewIfNeeded
     * ne pilote que `window` : sans ceci, un element focalise dans une de ces
     * listes restait hors de vue meme si la page etait bien positionnee.
     */
    _scrollIntoInnerContainer(element) {
        let parent = element.parentElement;
        while (parent && parent !== document.body) {
            const canScrollY = parent.scrollHeight > parent.clientHeight + 4;
            if (canScrollY && parent.matches?.(SCROLL_CONTAINERS)) {
                const pr = parent.getBoundingClientRect();
                const er = element.getBoundingClientRect();
                if (er.top < pr.top || er.bottom > pr.bottom) {
                    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                }
                return;
            }
            parent = parent.parentElement;
        }
    }

    _scrollIntoViewIfNeeded(element) {
        const rect = element.getBoundingClientRect();
        // Pivot Scroll : alignement optimal à 35% du haut pour ne jamais masquer l'affiche sous la capsule
        if (rect.top < 100 || rect.bottom > window.innerHeight - 80) {
            const targetY = window.scrollY + rect.top - (window.innerHeight * 0.35);
            window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
        }
    }

    focusFirst(scopeName = null) {
        const scope = scopeName || this._detectCurrentScope();
        this._state.scope = scope;
        const candidates = this.getFocusables(scope);
        if (candidates.length > 0) {
            this.setFocus(candidates[0]);
        }
    }

    clearFocus() {
        if (this._state.focusedElement) {
            this._state.focusedElement.classList.remove('sh-focus-active', 'sh-tv-focused');
            this._state.focusedElement = null;
        }
    }

    // ─── DÉTECTION DU SCOPE COURANT ──────────────────────────────────────────

    _detectCurrentScope() {
        // Tous les sélecteurs proviennent de core/DomContracts.js : c'est ce qui
        // garantit qu'ils correspondent au DOM réellement produit par les composants.
        if (document.querySelector(LAYERS.player)) return 'player';
        if (document.querySelector(LAYERS.settings)) return 'settings';
        // La recherche passe AVANT les modales génériques : Spotlight est une couche
        // à part entière avec ses propres focusables.
        if (document.querySelector(LAYERS.search)) return 'search';
        if (document.querySelector(LAYERS.sidebar)) return 'sidebar';
        if (document.querySelector(`${LAYERS.slideUpSheet}, ${LAYERS.adminModal}, ${LAYERS.consoleModal}, ${LAYERS.genericModal}`)) return 'modal';

        const focused = this._state.focusedElement || document.activeElement;
        if (focused?.closest?.('.sh-dynamic-island, #sh-dynamic-island')) return 'dynamic-island';
        if (focused?.closest?.('.sh-jellyseerr-view, [data-nav-scope="jellyseerr"]')) return 'jellyseerr';

        const appLayout = svc.appLayout();
        return appLayout?._currentView || 'dashboard';
    }

    // ─── MOTEUR SPATIAL 2D W3C PROJECTION OVERLAP (FONCTION PURE) ────────────

    _findSpatialTarget(direction) {
        const current = this._getValidCurrentElement();
        const scope = this._detectCurrentScope();
        const candidates = this.getFocusables(scope);

        if (candidates.length === 0) return null;
        if (!current || !candidates.includes(current)) return candidates[0];

        // 1. Navigation Horizontale dans un Carrousel ➔ Délégation Pure au CarouselController
        const currentCarousel = current.closest(CAROUSEL_SELECTOR);
        if (currentCarousel && (direction === NavAction.LEFT || direction === NavAction.RIGHT)) {
            const targetCard = this._carouselController.navigate(currentCarousel, current, direction, this._repeatState.isFastScrolling);
            if (targetCard) return targetCard; // Retourne l'élément cible calculé
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

            // Distance euclidienne pondérée
            const dist = Math.hypot(deltaX, deltaY);
            let score = 3000 - dist;

            const candCarousel = cand.closest(CAROUSEL_SELECTOR);
            const candWidget = cand.closest('.sh-widget-section, .sh-dashboard-section, .sh-jellyseerr-view, .sh-dynamic-island');

            // A. Priorité même carrousel horizontalement
            if (direction === NavAction.LEFT || direction === NavAction.RIGHT) {
                if (currentCarousel && candCarousel === currentCarousel) {
                    score += 1500;
                }
                const alignY = Math.abs(deltaY);
                score -= alignY * 5;
            }

            // B. Priorité même colonne et conteneur adjacent verticalement
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

    /**
     * Point d'entrée manette pour une pression directionnelle qui commence.
     * Hors du player, délègue au moteur de répétition partagé avec le clavier
     * (_startInputRepeat). Dans le player, VideoPlayer.handleNavAction() gère sa
     * propre accélération interne (cf. A02) et doit être rappelée à intervalles
     * réguliers — comme le ferait la répétition native du clavier (e.repeat) —
     * plutôt que de passer par le moteur de navigation spatiale générique.
     */
    _onGamepadDirectionStart(direction) {
        const scope = this._detectCurrentScope();
        if (scope === 'player') {
            const player = svc.player();
            if (!player || typeof player.handleNavAction !== 'function') return;
            player.handleNavAction(direction);
            const tick = (delay) => {
                this._gamepadPlayerRepeatTimer = setTimeout(() => {
                    player.handleNavAction(direction);
                    tick(100);
                }, delay);
            };
            tick(280);
            return;
        }
        this._startInputRepeat(direction);
    }

    /** Point d'entrée manette pour la fin d'une pression directionnelle. */
    _onGamepadDirectionEnd() {
        if (this._gamepadPlayerRepeatTimer) {
            clearTimeout(this._gamepadPlayerRepeatTimer);
            this._gamepadPlayerRepeatTimer = null;
        }
        this._stopInputRepeat();
    }

    _executeNavStep(action, isFastScroll = false) {
        const target = this._findSpatialTarget(action);
        if (target) {
            this.setFocus(target, {
                reason: (direction === 'up' || direction === 'down') ? 'vertical-move' : 'repeat',
                instantScroll: isFastScroll,
            });
            if (!isFastScroll) {
                svc.audioFeedback()?.playTick?.();
            }
        }
    }

    // ─── GESTION DES ACTIONS & KEYDOWN ────────────────────────────────────────

    handleAction(action) {
        if (!this._isEnabled || !action) return;

        const scope = this._detectCurrentScope();

        // 1. Délégation Player
        if (scope === 'player') {
            if (action === NavAction.BACK || action === NavAction.MENU) {
                this._handleBack(null);
                return;
            }
            const player = svc.player();
            if (player && typeof player.handleNavAction === 'function') {
                player.handleNavAction(action);
            }
            return;
        }

        // 2. Navigation Directionnelle Pure
        if (isDirectionAction(action)) {
            const target = this._findSpatialTarget(action);
            if (target) {
                this.setFocus(target);
                svc.audioFeedback()?.playTick?.();
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
        const el = this._getValidCurrentElement();
        if (!el) return;

        svc.audioFeedback()?.playSelect?.();

        // Dropdown utilisateur de la capsule
        if (el.id === 'sh-user-menu-btn' || el.classList.contains('sh-user-avatar-btn')) {
            const menuUtilisateur = svc.userDropdown();
            if (menuUtilisateur) {
                menuUtilisateur.toggle(true);
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
        // Champ de saisie : Backspace efface du texte (et non « Retour ») ; Échap reste « Retour ».
        if (isInput && e.key === "Backspace") return;
        if (isInput && action !== NavAction.BACK && action !== NavAction.DOWN && action !== NavAction.UP) return;

        const scope = this._detectCurrentScope();

        // Scope Player
        if (scope === 'player') {
            if (action === NavAction.BACK || action === NavAction.MENU) {
                this._handleBack(e);
                return;
            }
            const player = svc.player();
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

    /**
     * Ferme la couche la plus superficielle. L'ordre vient de BACK_ORDER
     * (core/DomContracts.js).
     *
     * Règle absolue : on ferme TOUJOURS par l'instance du composant.
     * L'ancienne version retirait des classes CSS à la main
     * (`classList.remove('open')`), ce qui laissait l'instance en état ouvert
     * (modale plus jamais réouvrable), laissait `body.style.overflow = hidden`
     * (plus aucun défilement de page) et, pour la modale d'administration,
     * laissait un élément détecté comme « modale ouverte » à vie — navigation
     * morte jusqu'au rechargement.
     */
    _handleBack(e) {
        for (const layer of BACK_ORDER) {
            const el = document.querySelector(LAYERS[layer]);
            if (!el) continue;
            e?.preventDefault?.();
            this._closeLayer(layer, el);
            return;
        }
    }

    /** Ferme une couche donnée en privilégiant toujours son API publique. */
    _closeLayer(layer, el) {
        const sh = window.SpaceHub;
        const closers = {
            settings:     () => sh?.ui?.settingsPanel || sh?.settingsPanel,
            slideUpSheet: () => sh?.ui?.modalSlideUpSheet || sh?.modalSlideUpSheet,
            search:       () => sh?.jellyfin?.search || sh?.ui?.search,
            sidebar:      () => sh?.ui?.sidebarDrawer || sh?.ui?.sidebar || sh?.sidebar
                                || sh?.ui?.appLayout?._sidebarDrawer || sh?.ui?.appLayout?._sidebar,
            player:       () => sh?.player,
        };

        const instance = closers[layer]?.();
        if (instance && typeof instance.close === 'function') {
            instance.close();
            if (layer !== 'player') this.onModalClosed();
            return;
        }

        // Repli : bouton de fermeture déclaré par le composant lui-même.
        const closeBtn = el.querySelector('.sh-modal__close, [data-modal-close], #sh-admin-modal-close, .sh-console-close-btn');
        if (closeBtn) {
            closeBtn.click();
            this.onModalClosed();
            return;
        }

        // Dernier repli, volontairement accompagné du nettoyage que le composant
        // aurait dû faire : sans cette ligne, la page reste bloquée sans défilement.
        el.classList.remove('open', 'sh-modal--open', 'sh-slideup-sheet--open');
        document.body.style.overflow = '';
        this._log?.warn?.(`Fermeture de repli sur la couche "${layer}" : aucune instance ni bouton de fermeture trouvé.`);
        this.onModalClosed();
    }

    _toggleSidebar() {
        const sidebar = svc.sidebar()
            || svc.sidebar()
            || svc.appLayout()?._sidebarDrawer
            || svc.appLayout()?._sidebar;

        if (!sidebar || typeof sidebar.toggle !== 'function') return;

        const wasOpen = Boolean(document.querySelector(LAYERS.sidebar));
        if (!wasOpen) this.pushFocus();
        sidebar.toggle();

        // Le drawer place lui-même le focus sur son premier élément à l'ouverture
        // (AppSidebarDrawer.toggle). On ne restaure qu'à la fermeture.
        if (wasOpen) this.popFocus();
    }

    /** Mémorise le point de retour avant d'entrer dans une couche. */
    pushFocus() {
        if (!this._focusStack) this._focusStack = [];
        const cur = this._state.focusedElement;
        if (cur && document.contains(cur)) this._focusStack.push(cur);
    }

    /**
     * Revient au dernier point de retour encore valide.
     * `_state.previousElement` ne convenait pas : il est écrasé à CHAQUE setFocus,
     * donc après avoir navigué dans une modale il pointait un élément interne à
     * cette modale — le focus était « restauré » dans une couche invisible.
     */
    popFocus() {
        if (!this._focusStack) this._focusStack = [];
        while (this._focusStack.length) {
            const candidate = this._focusStack.pop();
            if (candidate && document.contains(candidate) && this._isElementVisible?.(candidate) !== false) {
                this.setFocus(candidate, { reason: 'restore' });
                return true;
            }
        }
        return this.focusFirst();
    }

    /** Place le focus sur le premier élément focalisable du scope courant. */
    focusFirst() {
        const focusables = this.getFocusables(this._detectCurrentScope());
        if (focusables.length > 0) {
            this.setFocus(focusables[0], { reason: 'focus-first' });
            return true;
        }
        return false;
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
        // On empile AVANT d'entrer dans la couche : c'est ce point-là qu'il
        // faudra retrouver à la fermeture, pas le dernier élément visité dedans.
        this.pushFocus();
        const target = defaultFocusEl || (container ? this.getFocusables(container)[0] : null);
        if (target) this.setFocus(target);
    }

    onModalClosed() {
        // Le DOM de la couche peut être retiré de façon asynchrone (animation de
        // sortie) : on attend une frame pour que _detectCurrentScope voie le bon
        // scope avant de choisir où revenir.
        requestAnimationFrame(() => this.popFocus());
    }

    /** @deprecated Conservé pour compatibilité — utiliser popFocus(). */
    restorePreviousFocus() {
        return this.popFocus();
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
        this._onGamepadDirectionEnd(); // nettoie aussi le timer de répétition manette dédié au player
    }

    destroy() {
        this._unbindEvents();
        this._gamepad?.destroy?.();
    }
}

export default SpatialNavigation;
