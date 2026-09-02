/**
 * SpaceHub — Contrats DOM
 * Version: 1.0.0
 *
 * SOURCE DE VÉRITÉ UNIQUE des sélecteurs partagés entre le DOM produit par les
 * composants et le moteur de navigation spatiale.
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'audit du 1er septembre 2026 a montré que la quasi-totalité des blocages de
 * navigation TV venaient de la même cause : un sélecteur écrit dans
 * SpatialNavigation ne correspondait à aucune classe réellement émise
 * (`.sh-sidebar--open`, `.sh-unified-search--open`, `.sh-spotlight-card`,
 * `#sh-hero-play-btn`, `.sh-widget-section`...). Le code semblait complet à la
 * lecture et était mort à l'exécution.
 *
 * Règle d'usage
 * -------------
 * 1. Tout sélecteur utilisé des DEUX côtés (composant qui rend + moteur qui
 *    cherche) DOIT être déclaré ici et importé, jamais réécrit en dur.
 * 2. Le composant qui change une classe met à jour CE fichier, pas seulement son
 *    propre gabarit.
 * 3. `scripts/nav-contract-check.mjs` vérifie automatiquement que chaque
 *    sélecteur déclaré ici apparaît bien quelque part dans le code d'interface.
 */

'use strict';

/** Conteneurs de couches, avec leur état « ouvert » tel qu'il est réellement posé. */
export const LAYERS = {
    player:        '#sh-grand-cinema-player, .sh-grand-cinema-player',
    settings:      '#sh-modal-spacehub-settings.sh-modal--open',
    slideUpSheet:  '.sh-slideup-sheet--open',
    adminModal:    '#sh-admin-dashboard-modal.open',
    consoleModal:  '.sh-console-modal-overlay.open',
    genericModal:  '.sh-modal--open',
    // Le panneau porte `.open`, pas le conteneur racine `#sh-sidebar-drawer`.
    sidebar:       '#sh-sidebar-panel.open',
    // L'overlay Spotlight porte `.open` (cf. UnifiedSearch.js `_overlay.classList.add('open')`).
    search:        '.sh-spotlight-overlay.open',
    dynamicIsland: '#sh-dynamic-island, .sh-dynamic-island',
};

/** Ordre de fermeture pour le bouton Retour : du plus superficiel au plus profond. */
export const BACK_ORDER = [
    'settings', 'slideUpSheet', 'search', 'adminModal',
    'consoleModal', 'genericModal', 'sidebar', 'player',
];

/** Éléments focalisables, par zone. */
export const FOCUSABLES = {
    sidebar:       '.sh-sidebar-item, .sh-sidebar-btn, .sh-sidebar-footer-btn, [data-nav-focusable="true"]',
    search:        '.sh-spotlight-tab-btn, .sh-spotlight-item, [data-nav-focusable="true"]',
    dynamicIsland: '.sh-nav-tab-btn, .sh-nav-action-btn, #sh-user-menu-btn, .sh-user-avatar-btn, .sh-user-dropdown__item',
    hero:          '#sh-hero-btn-play, #sh-hero-btn-trailer, #sh-hero-btn-details, .sh-hero-edge-btn',
    player:        '.sh-dock-pill-btn, .sh-popover-item, .sh-chip-btn, [data-nav-focusable="true"]',
    generic:       '[data-nav-focusable="true"]',
};

/** Conteneurs à défilement horizontal réellement générés par l'application. */
export const CAROUSELS = [
    '.sh-card-grid',
    '.sh-gooey-carousel',
    '.sh-genre-chips-container',
    '.sh-lib-genres-carousel',
].join(', ');

/** Conteneurs à défilement VERTICAL interne (listes à hauteur contrainte). */
export const SCROLL_CONTAINERS = [
    '.sh-lib-modal-list',
    '.sh-popover-list',
    '.sh-cal-cell-events',
    '.sh-settings-tab',
    '.sh-spotlight-results',
].join(', ');

/** Classes posées par le moteur sur l'élément focalisé. */
export const FOCUS_CLASSES = ['sh-focus-active', 'sh-tv-focused'];

export default { LAYERS, BACK_ORDER, FOCUSABLES, CAROUSELS, SCROLL_CONTAINERS, FOCUS_CLASSES };
