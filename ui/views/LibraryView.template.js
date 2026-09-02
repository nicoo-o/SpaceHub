/**
 * SpaceHub — Gabarit : vue Bibliotheque
 *
 * 153 lignes de HTML : l'en-tete, les filtres, le tri et la grille. Le gabarit ne
 * depend que de l'etat de filtrage du composant, ce qui en fait le cas le plus net
 * du lot : aucune variable locale a passer.
 *
 * Ce module ne contient que du HTML. Il ne lit rien, n'ecrit rien, n'ecoute
 * rien : il transforme un objet de valeurs en chaine. Le comportement reste
 * entierement dans le composant appelant.
 *
 * Extrait mecaniquement du composant, sans reecriture : le HTML produit est
 * identique octet pour octet a celui d'avant l'extraction, ce que verifie
 * tests/gabarits.test.js contre une empreinte prise avant le deplacement.
 */

'use strict';

/**
 * @param {Object} ctx  valeurs necessaires au gabarit, fournies par l'appelant
 * @returns {string} HTML
 */
export function gabaritBibliotheque(ctx) {
    return `
            <div class="sh-library-explorer">
                <!-- Arrière-plan Ambiant Dynamique Monochrome (Apple TV Ambient Shadow) -->
                <div class="sh-lib-ambient-glow" id="sh-lib-ambient-glow"></div>

                <!-- 🌟 EN-TÊTE CINÉMATIQUE AVEC SÉLECTEUR DE BIBLIOTHÈQUES -->
                <header class="sh-lib-hero-header">
                    <div class="sh-lib-header-content">
                        <div class="sh-lib-title-row">
                            <div class="sh-brand-badge" style="display:inline-flex; align-items:center; gap:8px; margin-bottom: 6px;">
                                <div class="sh-luminous-dot" title="SpaceHub Active"><div class="sh-dot-core"></div></div>
                                <svg class="sh-rocket-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                                    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"></path>
                                </svg>
                                <span style="font-size: 13px; font-weight: 750; color: var(--sh-ink-solid, #ffffff); letter-spacing: -0.02em;">SpaceHub</span>
                                <span style="color: rgba(var(--sh-ink, 255, 255, 255),  0.35); font-size: 12px;">•</span>
                                <div class="sh-lib-badge-pill" id="sh-lib-badge-type">MÉDIATHÈQUE</div>
                            </div>
                            <h1 class="sh-lib-main-title" id="sh-lib-main-title">Mes Bibliothèques</h1>
                            <p class="sh-lib-stats-subtitle" id="sh-lib-stats-subtitle">Chargement de votre catalogue Jellyfin...</p>
                        </div>

                        <!-- Sélecteur d'onglets de bibliothèques Glassmorphism & Bouton de Gestion -->
                        <div class="sh-lib-tabs-container">
                            <div class="sh-lib-tabs-track-wrap">
                                <div class="sh-lib-tabs-track" id="sh-lib-tabs-track">
                                    <div class="sh-lib-tabs-pill" id="sh-lib-tabs-pill"></div>
                                    <span class="sh-lib-tabs-loading">Chargement des dossiers...</span>
                                </div>
                            </div>
                            
                            <button class="sh-lib-manage-btn" id="sh-lib-manage-btn" title="Personnaliser les sections affichées (cocher/décocher)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                                <span>Gérer</span>
                            </button>
                        </div>
                    </div>
                </header>

                <!-- 🎛️ BARRE D'OUTILS PURE GLASS : RECHERCHE, TRI, STATUTS & VUES -->
                <section class="sh-lib-toolbar-sticky" id="sh-lib-toolbar">
                    <div class="sh-lib-toolbar-primary">
                        <!-- Recherche Instantanée -->
                        <div class="sh-lib-search-box">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="sh-lib-search-icon">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <input type="text" id="sh-lib-search-input" class="sh-lib-search-input" placeholder="Filtrer dans cette bibliothèque..." value="${ctx._escape(ctx._searchQuery)}" />
                            <button class="sh-lib-search-clear" id="sh-lib-search-clear" title="Effacer la recherche" style="${ctx._searchQuery ? 'display:flex;' : 'display:none;'}">✕</button>
                        </div>

                        <div class="sh-lib-toolbar-actions">
                            <!-- Menu de Tri -->
                            <div class="sh-lib-dropdown-wrap">
                                <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-control-btn" id="sh-lib-sort-btn" title="Changer l'ordre de tri">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <polyline points="19 12 12 19 5 12"></polyline>
                                    </svg>
                                    <span id="sh-lib-sort-label">Récents</span>
                                    <span class="sh-lib-chevron">▾</span>
                                </button>
                                <div class="sh-lib-dropdown-menu" id="sh-lib-sort-menu">
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${ctx._sortBy === 'DateCreated' ? 'selected' : ''}" data-sort="DateCreated" data-order="Descending">Récemment ajoutés</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${ctx._sortBy === 'CommunityRating' ? 'selected' : ''}" data-sort="CommunityRating" data-order="Descending">Les mieux notés</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${ctx._sortBy === 'PremiereDate,ProductionYear' ? 'selected' : ''}" data-sort="PremiereDate,ProductionYear" data-order="Descending">Date de sortie</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${ctx._sortBy === 'SortName' && ctx._sortOrder === 'Ascending' ? 'selected' : ''}" data-sort="SortName" data-order="Ascending">Titre (A → Z)</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${ctx._sortBy === 'SortName' && ctx._sortOrder === 'Descending' ? 'selected' : ''}" data-sort="SortName" data-order="Descending">Titre (Z → A)</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${ctx._sortBy === 'Random' ? 'selected' : ''}" data-sort="Random" data-order="Descending">Aléatoire</div>
                                </div>
                            </div>

                            <!-- Menu Statut / Qualité -->
                            <div class="sh-lib-dropdown-wrap">
                                <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-control-btn" id="sh-lib-status-btn" title="Filtrer par état">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                    </svg>
                                    <span id="sh-lib-status-label">Tous</span>
                                    <span class="sh-lib-chevron">▾</span>
                                </button>
                                <div class="sh-lib-dropdown-menu" id="sh-lib-status-menu">
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${ctx._activeStatus === 'all' ? 'selected' : ''}" data-status="all">Tous les médias</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${ctx._activeStatus === 'unplayed' ? 'selected' : ''}" data-status="unplayed">Non vus uniquement</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${ctx._activeStatus === 'resuming' ? 'selected' : ''}" data-status="resuming">En cours de lecture</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${ctx._activeStatus === 'favorite' ? 'selected' : ''}" data-status="favorite">Mes favoris</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${ctx._activeStatus === '4k' ? 'selected' : ''}" data-status="4k">4K UHD Master</div>
                                </div>
                            </div>

                            <!-- Commutateur de Mode de Vue (Poster / Backdrop / List) -->
                            <div class="sh-lib-viewmode-group">
                                <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-viewmode-btn ${ctx._viewMode === 'poster' ? 'active' : ''}" data-mode="poster" title="Vue Affiches 2:3">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect width="7" height="10" x="3" y="3" rx="1"></rect>
                                        <rect width="7" height="10" x="14" y="3" rx="1"></rect>
                                        <rect width="7" height="10" x="3" y="14" rx="1"></rect>
                                        <rect width="7" height="10" x="14" y="14" rx="1"></rect>
                                    </svg>
                                </button>
                                <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-viewmode-btn ${ctx._viewMode === 'backdrop' ? 'active' : ''}" data-mode="backdrop" title="Vue Paysage 16:9">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect width="18" height="8" x="3" y="3" rx="1"></rect>
                                        <rect width="18" height="8" x="3" y="13" rx="1"></rect>
                                    </svg>
                                </button>
                                <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-viewmode-btn ${ctx._viewMode === 'list' ? 'active' : ''}" data-mode="list" title="Vue Tableau Détaillé">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="8" y1="6" x2="21" y2="6"></line>
                                        <line x1="8" y1="12" x2="21" y2="12"></line>
                                        <line x1="8" y1="18" x2="21" y2="18"></line>
                                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Ligne des Genres Dynamiques -->
                    <div class="sh-lib-genres-carousel" id="sh-lib-genres-carousel">
                        <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-genre-chip ${ctx._activeGenre === 'all' ? 'active' : ''}" data-genre="all">Tous les genres</button>
                    </div>

                    <!-- Index Alphabétique Rapide (A-Z Dock) -->
                    <div class="sh-lib-alphabet-dock" id="sh-lib-alphabet-dock" style="${ctx._sortBy.includes('SortName') ? 'display:flex;' : 'display:none;'}">
                        <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-alpha-btn ${!ctx._alphabetFilter ? 'active' : ''}" data-char="">#</button>
                        ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(ch => `
                            <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-alpha-btn ${ctx._alphabetFilter === ch ? 'active' : ''}" data-char="${ch}">${ch}</button>
                        `).join('')}
                    </div>
                </section>

                <!-- 🎬 CONTENEUR PRINCIPAL DE LA GRILLE / LISTE -->
                <main class="sh-lib-content-wrap">
                    <div class="sh-lib-grid-container" id="sh-lib-grid-container"></div>
                    
                    <!-- Sentinelle pour le défilement infini -->
                    <div class="sh-lib-infinite-sentinel" id="sh-lib-infinite-sentinel">
                        <div class="sh-lib-infinite-spinner" id="sh-lib-infinite-spinner" style="display:none;">
                            <div class="sh-spinner-dots"></div>
                            <span>Chargement des titres suivants...</span>
                        </div>
                    </div>
                </main>
            </div>
        `;
}

export default gabaritBibliotheque;
