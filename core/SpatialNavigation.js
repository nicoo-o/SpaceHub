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
import inputRouter, { PRIORITES } from './InputRouter.js';
// Les conteneurs de défilement viennent désormais de core/DomContracts.js
const CAROUSEL_SELECTOR = CAROUSELS;

/**
 * Conteneurs qui gardent en mémoire leur dernier élément focalisé.
 * Les carrousels par défaut ; `data-nav-remember` permet d'en déclarer d'autres
 * sans toucher à ce fichier.
 */
const MEMOIRE_CONTENEURS = `${CAROUSELS}, [data-nav-remember]`;

/** Blocs de page qui comptent comme « même zone » pour un déplacement vertical. */
const WIDGETS_SELECTOR = '.sh-widget-section, .sh-dashboard-section, .sh-jellyseerr-view, .sh-dynamic-island';

/**
 * Poids du recouvrement : un candidat parfaitement aligné gagne l'équivalent
 * de 1200 px de distance. Assez pour préférer un élément aligné à un élément
 * plus proche mais décalé — sauter latéralement en descendant est désorientant
 * sur un téléviseur — sans écraser la distance quand les deux sont alignés.
 */
const POIDS_ALIGNEMENT = 1200;

/** Poids du trou latéral réel entre deux projections qui ne se touchent pas. */
const POIDS_ECART = 3.5;

/**
 * Tolérance de chevauchement dans l'axe du déplacement, en pixels.
 * Les mises en page réelles se chevauchent de quelques pixels (ombres,
 * marges négatives) ; exiger une séparation stricte écarterait des voisins
 * légitimes. lrud-spatial tolère jusqu'à 30 % de la taille de l'élément.
 */
const SEUIL_CHEVAUCHEMENT = 4;

/** Sentinelle : une redirection « none » bloque volontairement la direction. */
const BLOQUE = Symbol('direction bloquée');

/** Compteur d'identifiants engendrés pour la mémoire de conteneur. */
let COMPTEUR_ID = 0;

export class SpatialNavigation {
    constructor({ root = document } = {}) {
        this._log = new Logger('SpatialNav-v11');
        this._root = root;
        this._isEnabled = true;

        // 1. Navigation State Centralisé
        /**
         * Couches ouvertes, dans leur ordre d'ouverture réel — la dernière est
         * celle du dessus. Alimentée par onModalOpened(), consommée par
         * _handleBack(). Voir _handleBack pour le bug que cela corrige.
         */
        this._layerStack = [];

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

        // 5ter. Caches de mesure. `_rectsCourants` ne vit que le temps d'une
        // recherche ; `_cacheVisibilite` le temps d'une salve de répétition.
        this._rectsCourants = null;
        this._cacheVisibilite = null;

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

    /**
     * Écarte les éléments qui ne sont pas réellement à l'écran.
     *
     * Chaque rectangle calculé ici est CONSERVÉ dans `_rectsCourants`. C'est le
     * point le plus rentable de tout le moteur : sans ce cache, la recherche
     * géométrique remesurait aussitôt les mêmes éléments, soit deux fois plus
     * de calculs de mise en page par appui — 1801 appels de géométrie sur une
     * page de 600 éléments, mesurés par `node scripts/nav-benchmark.mjs`.
     *
     * Le cache est vidé à chaque nouvel appel : il ne vit que le temps d'une
     * recherche, et ne peut donc pas renvoyer une position périmée.
     */
    _filterVisibleElements(elements) {
        if (!Array.isArray(elements)) return [];
        const rects = new Map();
        const cacheStyle = this._cacheVisibilite;   // non nul pendant une salve
        const visibles = elements.filter(el => {
            if (!el || !(el instanceof HTMLElement) || el.disabled) return false;
            if (el.getAttribute('aria-hidden') === 'true') return false;

            // Le rectangle est TOUJOURS recalculé : il change à chaque
            // défilement, et une salve de répétition fait précisément défiler.
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;

            // Le verdict de style, lui, ne bouge quasiment jamais en cours de
            // salve — et c'est la moitié du coût d'un appui.
            let visible = cacheStyle?.get(el);
            if (visible === undefined) {
                const style = window.getComputedStyle(el);
                visible = style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && style.opacity !== '0';
                cacheStyle?.set(el, visible);
            }
            if (!visible) return false;

            rects.set(el, rect);
            return true;
        });
        this._rectsCourants = rects;
        return visibles;
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

        // Mémoire de conteneur : la rangée retient sa dernière position.
        this._memoriserDansConteneur(element);

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

    /**
     * Inscrit l'élément comme dernière position connue de son conteneur.
     *
     * L'identifiant est stocké dans `data-focus`, comme le fait lrud-spatial :
     * un attribut se lit dans l'inspecteur, survit à un re-rendu partiel, et ne
     * retient aucun nœud en mémoire — contrairement à une table d'objets, qui
     * garderait en vie des cartes depuis longtemps remplacées.
     *
     * Un identifiant est engendré si l'élément n'en a pas : les cartes n'en
     * portent pas toutes, et sans identifiant il n'y a rien à mémoriser.
     */
    _memoriserDansConteneur(element) {
        const conteneur = element.closest?.(MEMOIRE_CONTENEURS);
        if (!conteneur) return;
        if (!element.id) element.id = `sh-nav-${++COMPTEUR_ID}`;
        conteneur.dataset.focus = element.id;
    }

    _findSpatialTarget(direction) {
        const current = this._getValidCurrentElement();
        const scope = this._detectCurrentScope();
        const candidates = this.getFocusables(scope);

        if (candidates.length === 0) return null;
        if (!current || !candidates.includes(current)) return candidates[0];

        // 0. Redirection déclarée sur l'élément lui-même. Elle passe AVANT tout
        //    le reste, y compris le carrousel : c'est son objet même — dire
        //    « depuis ici, dans cette direction, va là », sans discussion.
        const redirection = this._cibleRedirigee(current, direction);
        if (redirection === BLOQUE) return null;
        if (redirection) return redirection;

        // 0bis. Conteneur déclaré par l'arbre DOM. Quand l'élément courant est
        //       dans un `[data-nav-container]`, la recherche se limite d'abord
        //       à ce conteneur, puis remonte à son parent si elle ne trouve
        //       rien — c'est le modèle du W3C, d'Enact et de Norigin, là où
        //       `_detectCurrentScope()` ne connaît qu'une liste plate.
        const parConteneur = this._chercherDansLesConteneurs(current, direction);
        if (parConteneur !== undefined) return parConteneur;

        // 1. Navigation Horizontale dans un Carrousel ➔ Délégation Pure au CarouselController
        const currentCarousel = current.closest(CAROUSEL_SELECTOR);
        if (currentCarousel && (direction === NavAction.LEFT || direction === NavAction.RIGHT)) {
            const targetCard = this._carouselController.navigate(currentCarousel, current, direction, this._repeatState.isFastScrolling);
            if (targetCard) return targetCard; // Retourne l'élément cible calculé
        }

        const geometrique = this._chercherParGeometrie(current, direction, candidates);

        // 3. Mémoire de conteneur : si l'on CHANGE de rangée, on revient là où
        //    on l'avait quittée plutôt que là où la géométrie tombe.
        return this._substituerMemoire(current, geometrique, direction) || geometrique;
    }

    /**
     * Recherche en remontant l'arbre des conteneurs déclarés.
     *
     * `_detectCurrentScope()` choisit un scope dans une liste de priorité fixe,
     * écrite en dur. Cela fonctionne, mais une couche imbriquée dans une autre
     * — une modale ouverte depuis les réglages, un popover dans le lecteur —
     * n'a pas de place naturelle dans une liste plate. Tous les systèmes
     * étudiés remontent l'arbre à la place :
     *
     *   - W3C : « le plus proche ancêtre » qui est un conteneur, et l'on
     *     remonte au parent quand aucun candidat n'existe dedans ;
     *   - Enact : `spotlightRestrict: 'self-first' | 'self-only'` ;
     *   - Norigin : `isFocusBoundary` ; Vega : `setFocusRoot()`.
     *
     * Ici, un élément portant `data-nav-container` devient un conteneur. Deux
     * valeurs sont reconnues :
     *   - `data-nav-container` (ou `="auto"`) : on cherche d'abord dedans,
     *     puis on remonte — le `self-first` d'Enact ;
     *   - `data-nav-container="strict"` : on ne sort jamais — le `self-only`
     *     d'Enact, pour une modale ou un menu qui doit piéger le focus.
     *
     * @returns {HTMLElement|null|undefined} l'élément trouvé, `null` si un
     *   conteneur strict a bloqué la sortie, ou `undefined` si aucun conteneur
     *   n'est déclaré — auquel cas l'appelant reprend la voie habituelle. Les
     *   trois cas sont distincts : `null` signifie « décidé, rien à faire »,
     *   `undefined` signifie « pas concerné ».
     */
    _chercherDansLesConteneurs(current, direction) {
        let conteneur = current.closest?.('[data-nav-container]');
        if (!conteneur) return undefined;

        while (conteneur) {
            const candidats = this.getFocusables(conteneur);
            const trouve = candidats.length
                ? this._chercherParGeometrie(current, direction, candidats)
                : null;
            if (trouve) return trouve;

            // Rien dans ce conteneur. Un conteneur strict s'arrête là.
            if (conteneur.dataset.navContainer === 'strict') return null;
            conteneur = conteneur.parentElement?.closest?.('[data-nav-container]');
        }
        // Tous les conteneurs épuisés : on laisse le scope global décider.
        return undefined;
    }

    /**
     * Redirection déclarée par `data-nav-up|down|left|right`.
     *
     * Équivalent des guides de focus de tvOS, du `leaveFor` d'Enact ou des
     * `nextFocusUp/Down/…` d'Android TV : désigner une destination sans tordre
     * la mise en page pour satisfaire l'algorithme.
     *
     * Trois retours possibles :
     *   - un élément  : redirection appliquée ;
     *   - `BLOQUE`    : la valeur « none », un bord dur volontaire ;
     *   - `null`      : rien de déclaré, ou cible introuvable/invisible — la
     *                   géométrie reprend la main. Une redirection cassée ne
     *                   doit JAMAIS immobiliser l'utilisateur, c'est le pire
     *                   défaut possible pour ce genre de mécanisme.
     */
    _cibleRedirigee(element, direction) {
        const cle = { [NavAction.UP]: 'navUp', [NavAction.DOWN]: 'navDown',
            [NavAction.LEFT]: 'navLeft', [NavAction.RIGHT]: 'navRight' }[direction];
        const selecteur = cle && element?.dataset?.[cle];
        if (!selecteur) return null;
        if (selecteur === 'none') return BLOQUE;
        let cible = null;
        try {
            cible = this._root.querySelector(selecteur);
        } catch {
            // Sélecteur mal formé : on le signale une fois, et on continue.
            this._log.warn(`Redirection « ${cle} » ignorée : sélecteur invalide « ${selecteur} ».`);
            return null;
        }
        if (!cible) return null;
        return this._filterVisibleElements([cible])[0] || null;
    }

    /**
     * Cible que la mémoire de conteneur propose, ou `null`.
     *
     * Exposée pour les tests : elle recalcule la géométrie puis applique la
     * substitution, ce que `_findSpatialTarget` fait en deux temps pour ne pas
     * parcourir les candidats deux fois.
     */
    _cibleMemorisee(current, direction) {
        const candidates = this.getFocusables(this._detectCurrentScope());
        const geometrique = this._chercherParGeometrie(current, direction, candidates);
        return this._substituerMemoire(current, geometrique, direction);
    }

    /**
     * Remplace la cible géométrique par la dernière position connue du
     * conteneur d'arrivée, quand on change de conteneur.
     *
     * C'est le `enterTo: 'last-focused'` d'Enact, l'`activeChild` de LRUD, le
     * `data-focus` de lrud-spatial. Sans cela, quitter une rangée en huitième
     * position et y revenir ramène à la première carte visible — c'est la
     * différence la plus immédiatement perceptible avec une application TV
     * professionnelle.
     *
     * Volontairement limité au déplacement VERTICAL : gauche/droite est un
     * déplacement DANS la rangée, y appliquer la mémoire ferait sauter le focus
     * au lieu de le faire avancer d'un cran.
     */
    _substituerMemoire(current, geometrique, direction) {
        if (direction !== NavAction.UP && direction !== NavAction.DOWN) return null;
        if (!geometrique) return null;

        const arrivee = geometrique.closest(MEMOIRE_CONTENEURS);
        if (!arrivee) return null;
        if (arrivee === current?.closest?.(MEMOIRE_CONTENEURS)) return null;   // même rangée

        const memoire = arrivee.dataset.focus;
        if (!memoire) return null;

        // getElementById plutôt qu'un sélecteur : une recherche par table de
        // hachage, et surtout aucune question d'échappement — un identifiant
        // engendré peut contenir n'importe quoi.
        const cible = document.getElementById(memoire);
        // Le contenu d'une rangée est rechargé en permanence : une mémoire
        // périmée doit s'effacer d'elle-même, jamais renvoyer un nœud détaché
        // ni un élément qui a changé de rangée entre-temps.
        if (!cible || !arrivee.contains(cible)) {
            delete arrivee.dataset.focus;
            return null;
        }
        return this._filterVisibleElements([cible])[0] || null;
    }

    /**
     * Recherche géométrique — le cœur du moteur.
     *
     * Le principe suit la spécification CSS Spatial Navigation du W3C :
     *
     *     distance = euclidienne + déplacement − alignement − √(recouvrement)
     *
     * Le terme qui compte, et qui manquait, est le **recouvrement de
     * projection** : la part de l'élément de départ que le candidat couvre sur
     * l'axe perpendiculaire au déplacement. lrud-spatial le calcule autrement
     * — d'arête de sortie à arête d'entrée — mais aboutit au même endroit.
     *
     * Ce que l'ancienne version faisait, et pourquoi c'était faux
     * ----------------------------------------------------------
     * Elle mesurait de CENTRE à CENTRE et pénalisait l'écart des centres
     * (`alignX * 3.5`). Un élément large était donc puni d'être large : une
     * bannière pleine largeur placée juste sous une carte, qui la recouvre
     * pourtant à 100 %, obtenait un score très négatif à cause de son centre
     * lointain. Le focus sautait par-dessus pour atterrir cinq fois plus loin.
     *
     * Mesuré : bannière à 40 px, score −182 ; carte à 500 px, score 2300.
     * C'est la carte qui gagnait. Voir docs/NAVIGATION_ETAT_DE_LART.md, écart 1,
     * et le cas 6 de tests/NavigationScore.test.js.
     *
     * Ce que fait la version actuelle
     * ------------------------------
     *   - distance mesurée **d'arête à arête** sur l'axe du déplacement, ce qui
     *     ne dépend plus de la taille des éléments ;
     *   - **recouvrement** récompensé en proportion de ce qu'il couvre ;
     *   - écart latéral pénalisé **seulement s'il y a un vrai trou** entre les
     *     projections — un élément qui recouvre n'est jamais « décalé ».
     *
     * La mémoire de colonne (`_lastColumnX`) est conservée : le rectangle de
     * référence est translaté sur la colonne mémorisée, pas remplacé par un
     * point. Sans quoi descendre deux fois de suite dériverait latéralement.
     */
    _chercherParGeometrie(current, direction, candidates) {
        const currentCarousel = current.closest(CAROUSEL_SELECTOR);
        const brut = this._rect(current);

        // Rectangle de référence : le rectangle courant, recentré sur la
        // colonne mémorisée quand il y en a une.
        const curRect = this._lastColumnX === null ? brut : (() => {
            const decalage = this._lastColumnX - (brut.left + brut.width / 2);
            return { left: brut.left + decalage, right: brut.right + decalage,
                top: brut.top, bottom: brut.bottom,
                width: brut.width, height: brut.height };
        })();

        const vertical = direction === NavAction.UP || direction === NavAction.DOWN;
        const currentWidget = current.closest(WIDGETS_SELECTOR);

        let bestCandidate = null;
        let bestScore = -Infinity;

        for (const cand of candidates) {
            if (cand === current) continue;
            const candRect = this._rect(cand);

            // Filtrage directionnel : le candidat doit franchir l'arête de
            // sortie. Sur les centres, un élément large chevauchant l'élément
            // courant était écarté à tort ; sur les arêtes, il ne l'est pas.
            let distance;
            if (direction === NavAction.DOWN)  distance = candRect.top - curRect.bottom;
            else if (direction === NavAction.UP)    distance = curRect.top - candRect.bottom;
            else if (direction === NavAction.RIGHT) distance = candRect.left - curRect.right;
            else                                    distance = curRect.left - candRect.right;
            if (distance < -SEUIL_CHEVAUCHEMENT) continue;
            distance = Math.max(0, distance);

            // Recouvrement des projections sur l'axe perpendiculaire.
            const [debutA, finA, debutB, finB] = vertical
                ? [curRect.left, curRect.right, candRect.left, candRect.right]
                : [curRect.top, curRect.bottom, candRect.top, candRect.bottom];
            const recouvrement = Math.min(finA, finB) - Math.max(debutA, debutB);
            const reference = Math.max(1, Math.min(finA - debutA, finB - debutB));
            const fractionAlignee = Math.max(0, Math.min(1, recouvrement / reference));
            // Trou réel entre les projections — nul dès qu'elles se touchent.
            const ecart = Math.max(0, -recouvrement);

            let score = 3000 - distance
                + fractionAlignee * POIDS_ALIGNEMENT
                - ecart * POIDS_ECART;

            if (!vertical) {
                // Rester dans le même carrousel prime : gauche/droite est un
                // déplacement DANS la rangée.
                const candCarousel = cand.closest(CAROUSEL_SELECTOR);
                if (currentCarousel && candCarousel === currentCarousel) score += 1500;
            } else {
                // Rester dans le même bloc de la page, à alignement égal.
                const candWidget = cand.closest(WIDGETS_SELECTOR);
                if (currentWidget && candWidget === currentWidget) score += 500;
            }

            if (score > bestScore) {
                bestScore = score;
                bestCandidate = cand;
            }
        }

        return bestCandidate;
    }

    /**
     * Rectangle d'un élément, mesuré une seule fois par appui.
     *
     * `getFocusables()` mesure déjà chaque candidat pour écarter les invisibles.
     * Le remesurer ici doublait le nombre de calculs de mise en page — 1801
     * appels de géométrie par appui sur une page de 600 éléments. Le cache est
     * rempli par `_filterVisibleElements` et vidé au début de chaque recherche.
     */
    _rect(element) {
        const cache = this._rectsCourants;
        if (cache) {
            const connu = cache.get(element);
            if (connu) return connu;
        }
        const r = element.getBoundingClientRect();
        cache?.set(element, r);
        return r;
    }

    // ─── REPEAT & FAST SCROLL ENGINE ─────────────────────────────────────────

    _startInputRepeat(action) {
        if (this._repeatState.activeAction === action) return;
        this._stopInputRepeat();

        // Cache de visibilité, ouvert pour la durée de la salve. Voir
        // _cacheVisibilite pour ce qu'il met en jeu.
        this._cacheVisibilite = new Map();

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
        this._cacheVisibilite = null;
    }

    /**
     * Cache de visibilité — ce qu'il gagne, et ce qu'il met en jeu.
     *
     * Mesuré (`node scripts/nav-benchmark.mjs`) : un appui sur une page de 600
     * éléments coûtait 600 appels à `getBoundingClientRect` ET 600 à
     * `getComputedStyle`. La seconde moitié est la plus chère : elle force la
     * résolution du style calculé, pas seulement de la mise en page.
     *
     * En défilement rapide, le moteur tire un pas toutes les 45 ms. Sur le
     * Chromium d'un téléviseur de 2020 — dix à vingt fois plus lent que la
     * machine de mesure — le calcul risquait de dépasser l'intervalle entre
     * deux pas, et la navigation aurait accumulé du retard.
     *
     * Le cache ne vit QUE pendant une salve de répétition, c'est-à-dire entre
     * l'enfoncement et le relâchement d'une direction. C'est le `throttle` de
     * Norigin, appliqué à la seule mesure qui ne bouge pas.
     *
     * Ce qui n'est PAS caché, et pourquoi :
     *   - **les rectangles** : ils changent à chaque défilement, et une salve
     *     fait précisément défiler. Les cacher renverrait des positions
     *     périmées, donc un focus qui saute ;
     *   - **`display: none`** : un élément ainsi caché a un rectangle nul, et
     *     le rectangle est recalculé à chaque appui — il reste donc écarté.
     *
     * Ce qui peut devenir périmé, en connaissance de cause : un élément qui
     * passe en `visibility: hidden` ou `opacity: 0` PENDANT une salve reste
     * candidat jusqu'au relâchement de la touche. Le cas suppose une animation
     * déclenchée par autre chose que la navigation elle-même, pendant une
     * pression maintenue — quelques centaines de millisecondes. Le compromis
     * est assumé : il achète la moitié du coût de chaque appui.
     */

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
        // Un redimensionnement ou une rotation refait toute la mise en page :
        // le verdict de visibilité mis en cache pour la salve en cours n'est
        // plus fiable. C'est le seul événement qui peut invalider ce cache
        // sans passer par le relâchement de la touche.
        this._cacheVisibilite = this._repeatState.activeAction ? new Map() : null;
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
    /**
     * Ferme la couche la plus HAUTE, c'est-à-dire la dernière ouverte.
     *
     * BACK_ORDER seul ne suffisait pas : c'est une liste figée, donc « Retour »
     * fermait par priorité déclarée et non dans l'ordre réel d'ouverture.
     * Concrètement — reproduit puis corrigé — ouvrir les réglages, puis la
     * recherche par-dessus, et appuyer une fois sur Échap laissait la recherche
     * à l'écran et fermait les RÉGLAGES en dessous. L'utilisateur voyait la
     * couche du dessus rester, sans savoir ce qui venait de disparaître.
     *
     * La pile enregistre l'ordre d'ouverture observé. BACK_ORDER ne sert plus
     * que de repli, pour les couches ouvertes sans passer par onModalOpened
     * (ancien code, ou couche déjà présente au chargement).
     */
    _handleBack(e) {
        // 1. Couche la plus récemment ouverte, si elle est toujours à l'écran.
        for (let i = this._layerStack.length - 1; i >= 0; i--) {
            const layer = this._layerStack[i];
            const el = LAYERS[layer] ? document.querySelector(LAYERS[layer]) : null;
            if (!el) { this._layerStack.splice(i, 1); continue; }   // fermée autrement
            e?.preventDefault?.();
            this._layerStack.splice(i, 1);
            this._closeLayer(layer, el);
            return;
        }

        // 2. Repli : ordre déclaré, pour ce que la pile n'a pas vu s'ouvrir.
        for (const layer of BACK_ORDER) {
            const el = document.querySelector(LAYERS[layer]);
            if (!el) continue;
            e?.preventDefault?.();
            this._closeLayer(layer, el);
            return;
        }

        // 3. Plus rien à fermer. Android TV est catégorique : appuyer
        //    plusieurs fois sur Retour doit finir par ramener au lanceur, et
        //    aucune confirmation ne doit bloquer la sortie. Ne rien faire ici
        //    donne l'impression d'une application coincée.
        this._quitterApplication(e);
    }

    /**
     * Sortie de l'application, quand Retour n'a plus aucune couche à fermer.
     *
     * Chaque plateforme a sa porte de sortie, et aucune n'existe ailleurs :
     * les appels sont donc gardés par des tests de présence, pas par une
     * détection d'appareil — un test de présence ne se trompe pas de modèle.
     *
     * Reste le cas d'un téléviseur qui n'est ni Tizen ni webOS — un navigateur
     * d'Android TV, un Fire TV — où il n'existe aucune API de sortie : remonter
     * l'historique est alors le seul chemin. Deux gardes l'encadrent :
     *
     *   - **le mode TV doit être actif.** Sur un ordinateur, Échap au niveau
     *     racine ne fait rien dans toutes les applications web, et c'est bien
     *     ainsi. Sortir du site à la place surprendrait sans rien apporter ;
     *   - **il doit y avoir une page où revenir.** Sur un onglet ouvert
     *     directement sur l'application, `history.back()` ne mène nulle part.
     *
     * Le routeur n'utilise pas l'API History (aucun `pushState` dans le code) :
     * `history.length > 1` signifie donc bien « l'utilisateur vient d'ailleurs »,
     * et non « il a changé de vue trois fois ».
     *
     * @returns {boolean} vrai si une sortie a été tentée
     */
    _quitterApplication(e = null) {
        try {
            const tizen = window.tizen?.application?.getCurrentApplication?.();
            if (typeof tizen?.exit === 'function') {
                e?.preventDefault?.();
                tizen.exit();
                return true;
            }
            if (typeof window.webOS?.platformBack === 'function') {
                e?.preventDefault?.();
                window.webOS.platformBack();
                return true;
            }
            const modeTv = svc.tvMode()?.isActive?.() === true
                || document.documentElement.classList.contains('sh-tv-mode');
            if (modeTv && window.history?.length > 1) {
                e?.preventDefault?.();
                window.history.back();
                return true;
            }
        } catch (err) {
            this._log.warn('Sortie de l\'application impossible :', err);
        }
        return false;
    }

    /**
     * Quelle couche l'élément conteneur représente-t-il ?
     * Sert à empiler la bonne clé quand une couche s'ouvre.
     */
    _layerOf(container) {
        if (!container) return null;
        for (const [nom, selecteur] of Object.entries(LAYERS)) {
            try {
                if (container.matches?.(selecteur) || container.closest?.(selecteur)) return nom;
            } catch { /* sélecteur non applicable à cet élément */ }
        }
        return null;
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

        // Ordre d'ouverture RÉEL, pour que « Retour » ferme bien le dessus.
        const layer = this._layerOf(container);
        if (layer) {
            const dejaLa = this._layerStack.indexOf(layer);
            if (dejaLa !== -1) this._layerStack.splice(dejaLa, 1);
            this._layerStack.push(layer);
        }
        const target = defaultFocusEl || (container ? this.getFocusables(container)[0] : null);
        if (target) this.setFocus(target);
    }

    /**
     * Empile explicitement une couche par son nom.
     *
     * `onModalOpened` déduit la couche du conteneur, ce qui suppose que celui-ci
     * porte déjà sa classe d'ouverture. Ce n'est pas toujours le cas : la
     * recherche pose `.open` APRÈS avoir signalé son ouverture, donc la
     * déduction échouait silencieusement et la couche n'entrait jamais dans la
     * pile. Passer le nom lève l'ambiguïté.
     */
    pushLayer(layer) {
        if (!layer || !LAYERS[layer]) return;
        const i = this._layerStack.indexOf(layer);
        if (i !== -1) this._layerStack.splice(i, 1);
        this._layerStack.push(layer);
    }

    /** Retire une couche de la pile quand elle se ferme par un autre chemin. */
    onLayerClosed(container) {
        const layer = typeof container === 'string' ? container : this._layerOf(container);
        const i = layer ? this._layerStack.indexOf(layer) : -1;
        if (i !== -1) this._layerStack.splice(i, 1);
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
        // Le clavier passe par le routeur d'entrée, en dernière priorité : ce
        // moteur est le repli, toute couche ouverte doit pouvoir le devancer.
        this._retirerClavier = [
            inputRouter.inscrire('navigation', this._boundKeyDown,
                { priorite: PRIORITES.navigation, sur: 'keydown' }),
            inputRouter.inscrire('navigation:up', this._boundKeyUp,
                { priorite: PRIORITES.navigation, sur: 'keyup' }),
        ];
        window.addEventListener('mousemove', this._boundMouseMove, { passive: true });
        window.addEventListener('resize', this._boundResize, { passive: true });
        window.addEventListener('orientationchange', this._boundResize, { passive: true });
    }

    _unbindEvents() {
        this._retirerClavier?.forEach(retirer => retirer());
        this._retirerClavier = null;
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
