/**
 * SpaceHub — Library View (Media Explorer)
 * Version: 2.1.0 (Monochrome Apple TV+ & Pure Crystal Frosted Glass)
 *
 * Explorateur de bibliothèques multimédia haute performance :
 * - Regroupement automatique des Séries TV & Animés par fiche série (IncludeItemTypes: 'Series')
 * - Design 100% Monochrome Apple TV & Pure Crystal Glassmorphism (Noir OLED absolu, reflets cristal, zéro teinte violette)
 * - Sélecteur de bibliothèques avec capsule de sélection élastique (squash & stretch spring physics)
 * - Barre d'outils pure glass : Tri intelligent, Genres dynamiques, Filtres d'état/4K, Recherche en direct
 * - 3 Modes d'affichage : Grille Affiches 2:3, Grille Backdrops 16:9, Vue Tableau Détaillé
 * - Index alphabétique rapide A-Z pour les collections volumineuses
 * - Défilement infini ultra-fluide avec skeletons glassmorphism
 * - Intégration directe avec ModalSlideUpSheet, Player SpaceHub et synchronisation des favoris Jellyfin
 */

'use strict';

import Logger from '../../core/Logger.js';

class LibraryView {
    constructor() {
        this._log = new Logger('LibraryView');
        this._libraries = [];
        this._activeLibrary = null;
        this._items = [];
        this._totalCount = 0;
        this._startIndex = 0;
        this._pageSize = 48;
        this._isLoading = false;
        this._hasMore = true;

        // Préférences & Filtres
        this._sortBy = 'DateCreated';
        this._sortOrder = 'Descending';
        this._activeGenre = 'all';
        this._activeStatus = 'all'; // 'all' | 'unplayed' | 'resuming' | 'favorite' | '4k'
        this._searchQuery = '';
        this._viewMode = 'poster'; // 'poster' | 'backdrop' | 'list'
        this._alphabetFilter = null;
        this._genresList = [];

        this._allLibraries = [];
        this._hiddenLibraryIds = new Set();
        this._librariesOrder = [];

        this._searchDebounceTimer = null;
        this._scrollObserver = null;

        this._loadPreferences();
        this._injectStyles();
    }

    get _api() {
        return window.SpaceHub?.jellyfin?.api;
    }

    get _cardBuilder() {
        return window.SpaceHub?.ui?.components?.cardBuilder;
    }

    _loadPreferences() {
        try {
            const saved = localStorage.getItem('sh_library_prefs');
            if (saved) {
                const prefs = JSON.parse(saved);
                if (prefs.sortBy) this._sortBy = prefs.sortBy;
                if (prefs.sortOrder) this._sortOrder = prefs.sortOrder;
                if (prefs.viewMode) this._viewMode = prefs.viewMode;
            }
            const hidden = localStorage.getItem('sh_library_hidden_ids');
            if (hidden) {
                const arr = JSON.parse(hidden);
                if (Array.isArray(arr)) {
                    this._hiddenLibraryIds = new Set(arr);
                }
            }
            const order = localStorage.getItem('sh_library_order');
            if (order) {
                const arr = JSON.parse(order);
                if (Array.isArray(arr)) {
                    this._librariesOrder = arr;
                }
            }
        } catch (e) {
            // Ignorer
        }
    }

    _savePreferences() {
        try {
            localStorage.setItem('sh_library_prefs', JSON.stringify({
                sortBy: this._sortBy,
                sortOrder: this._sortOrder,
                viewMode: this._viewMode,
                lastLibraryId: this._activeLibrary?.Id
            }));
            localStorage.setItem('sh_library_hidden_ids', JSON.stringify(Array.from(this._hiddenLibraryIds)));
            localStorage.setItem('sh_library_order', JSON.stringify(this._librariesOrder));
        } catch (e) {
            // Ignorer
        }
    }

    /**
     * Rendu principal de la vue Bibliothèque
     * @param {HTMLElement} container
     * @param {Object} [options]
     */
    async render(container, options = {}) {
        this._container = container;
        container.innerHTML = `
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
                                <span style="font-size: 13px; font-weight: 750; color: #ffffff; letter-spacing: -0.02em;">SpaceHub</span>
                                <span style="color: rgba(255, 255, 255, 0.35); font-size: 12px;">•</span>
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
                            <input type="text" id="sh-lib-search-input" class="sh-lib-search-input" placeholder="Filtrer dans cette bibliothèque..." value="${this._escape(this._searchQuery)}" />
                            <button class="sh-lib-search-clear" id="sh-lib-search-clear" title="Effacer la recherche" style="${this._searchQuery ? 'display:flex;' : 'display:none;'}">✕</button>
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
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${this._sortBy === 'DateCreated' ? 'selected' : ''}" data-sort="DateCreated" data-order="Descending">Récemment ajoutés</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${this._sortBy === 'CommunityRating' ? 'selected' : ''}" data-sort="CommunityRating" data-order="Descending">Les mieux notés</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${this._sortBy === 'PremiereDate,ProductionYear' ? 'selected' : ''}" data-sort="PremiereDate,ProductionYear" data-order="Descending">Date de sortie</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${this._sortBy === 'SortName' && this._sortOrder === 'Ascending' ? 'selected' : ''}" data-sort="SortName" data-order="Ascending">Titre (A → Z)</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${this._sortBy === 'SortName' && this._sortOrder === 'Descending' ? 'selected' : ''}" data-sort="SortName" data-order="Descending">Titre (Z → A)</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${this._sortBy === 'Random' ? 'selected' : ''}" data-sort="Random" data-order="Descending">Aléatoire</div>
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
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${this._activeStatus === 'all' ? 'selected' : ''}" data-status="all">Tous les médias</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${this._activeStatus === 'unplayed' ? 'selected' : ''}" data-status="unplayed">Non vus uniquement</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${this._activeStatus === 'resuming' ? 'selected' : ''}" data-status="resuming">En cours de lecture</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${this._activeStatus === 'favorite' ? 'selected' : ''}" data-status="favorite">Mes favoris</div>
                                    <div tabindex="0" data-nav-focusable="true" class="sh-lib-dropdown-item ${this._activeStatus === '4k' ? 'selected' : ''}" data-status="4k">4K UHD Master</div>
                                </div>
                            </div>

                            <!-- Commutateur de Mode de Vue (Poster / Backdrop / List) -->
                            <div class="sh-lib-viewmode-group">
                                <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-viewmode-btn ${this._viewMode === 'poster' ? 'active' : ''}" data-mode="poster" title="Vue Affiches 2:3">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect width="7" height="10" x="3" y="3" rx="1"></rect>
                                        <rect width="7" height="10" x="14" y="3" rx="1"></rect>
                                        <rect width="7" height="10" x="3" y="14" rx="1"></rect>
                                        <rect width="7" height="10" x="14" y="14" rx="1"></rect>
                                    </svg>
                                </button>
                                <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-viewmode-btn ${this._viewMode === 'backdrop' ? 'active' : ''}" data-mode="backdrop" title="Vue Paysage 16:9">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect width="18" height="8" x="3" y="3" rx="1"></rect>
                                        <rect width="18" height="8" x="3" y="13" rx="1"></rect>
                                    </svg>
                                </button>
                                <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-viewmode-btn ${this._viewMode === 'list' ? 'active' : ''}" data-mode="list" title="Vue Tableau Détaillé">
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
                        <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-genre-chip ${this._activeGenre === 'all' ? 'active' : ''}" data-genre="all">Tous les genres</button>
                    </div>

                    <!-- Index Alphabétique Rapide (A-Z Dock) -->
                    <div class="sh-lib-alphabet-dock" id="sh-lib-alphabet-dock" style="${this._sortBy.includes('SortName') ? 'display:flex;' : 'display:none;'}">
                        <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-alpha-btn ${!this._alphabetFilter ? 'active' : ''}" data-char="">#</button>
                        ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(ch => `
                            <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-alpha-btn ${this._alphabetFilter === ch ? 'active' : ''}" data-char="${ch}">${ch}</button>
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

        this._bindToolbarEvents();
        await this._initLibraries(options.libraryId, options.targetType);
    }

    async _initLibraries(targetLibraryId = null, targetType = null) {
        const tabsTrack = this._container.querySelector('#sh-lib-tabs-track');
        const manageBtn = this._container.querySelector('#sh-lib-manage-btn');
        if (!tabsTrack) return;

        if (manageBtn) {
            manageBtn.addEventListener('click', () => this._openManageLibrariesModal());
        }

        try {
            let views = await this._api?.getUserViews();
            if (!views || views.length === 0) {
                // Fallback direct
                const rawViews = await window.ApiClient?.getUserViews?.(this._api?.getUserId?.());
                views = rawViews?.Items || (Array.isArray(rawViews) ? rawViews : []);
            }

            if (!views || views.length === 0) {
                tabsTrack.innerHTML = '<span class="sh-lib-tabs-empty">Aucune bibliothèque disponible.</span>';
                return;
            }

            this._allLibraries = views;

            if (!targetLibraryId && targetType && this._allLibraries) {
                const match = this._allLibraries.find(l => {
                    const ct = (l.CollectionType || l.Type || '').toLowerCase();
                    if (targetType === 'movies' && ct.includes('movie')) return true;
                    if (targetType === 'series' && (ct.includes('tv') || ct.includes('series'))) return true;
                    if (targetType === 'music' && ct.includes('music')) return true;
                    return false;
                });
                if (match) targetLibraryId = match.Id;
            }

            this._refreshVisibleLibraries(targetLibraryId);

        } catch (err) {
            this._log.error('Erreur initialisation bibliothèques:', err);
            tabsTrack.innerHTML = `<span style="color:#ff6b6b;">Impossible de contacter Jellyfin (${this._escape(err.message)})</span>`;
        }
    }

    _refreshVisibleLibraries(targetLibraryId = null) {
        const tabsTrack = this._container.querySelector('#sh-lib-tabs-track');
        if (!tabsTrack || !this._allLibraries) return;

        // Réordonner _allLibraries selon _librariesOrder si défini
        if (this._librariesOrder && this._librariesOrder.length > 0) {
            const orderMap = new Map(this._librariesOrder.map((id, index) => [id, index]));
            this._allLibraries.sort((a, b) => {
                const idxA = orderMap.has(a.Id) ? orderMap.get(a.Id) : 999;
                const idxB = orderMap.has(b.Id) ? orderMap.get(b.Id) : 999;
                return idxA - idxB;
            });
        }

        // Filtrer selon les bibliothèques non masquées
        this._libraries = this._allLibraries.filter(lib => !this._hiddenLibraryIds.has(lib.Id));
        if (this._libraries.length === 0) {
            this._libraries = this._allLibraries;
            this._hiddenLibraryIds.clear();
        }

        // Déterminer la bibliothèque active
        let defaultLib = null;
        if (targetLibraryId) {
            defaultLib = this._libraries.find(l => l.Id === targetLibraryId);
        }
        if (!defaultLib && this._activeLibrary) {
            defaultLib = this._libraries.find(l => l.Id === this._activeLibrary.Id);
        }
        if (!defaultLib) {
            const saved = localStorage.getItem('sh_library_prefs');
            const lastId = saved ? JSON.parse(saved)?.lastLibraryId : null;
            defaultLib = this._libraries.find(l => l.Id === lastId) || this._libraries[0];
        }

        this._activeLibrary = defaultLib;

        // Rendu des onglets
        tabsTrack.innerHTML = `
            <div class="sh-lib-tabs-pill" id="sh-lib-tabs-pill"></div>
            ${this._libraries.map(lib => `
                <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-tab-btn ${lib.Id === this._activeLibrary?.Id ? 'active' : ''}" data-id="${lib.Id}" data-type="${lib.CollectionType || lib.Type || ''}">
                    <span class="sh-lib-tab-icon">${this._getIconForType(lib.CollectionType || lib.Type)}</span>
                    <span class="sh-lib-tab-name">${this._escape(lib.Name)}</span>
                </button>
            `).join('')}
        `;

        // Clic sur les onglets de bibliothèques
        tabsTrack.querySelectorAll('.sh-lib-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const libId = btn.dataset.id;
                const lib = this._libraries.find(l => l.Id === libId);
                if (lib && lib.Id !== this._activeLibrary?.Id) {
                    tabsTrack.querySelectorAll('.sh-lib-tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this._updateTabsPill(btn, true);
                    this.switchLibrary(lib);
                }
            });
        });

        const activeBtn = tabsTrack.querySelector('.sh-lib-tab-btn.active');
        if (activeBtn) {
            requestAnimationFrame(() => this._updateTabsPill(activeBtn, false));
            setTimeout(() => this._updateTabsPill(activeBtn, false), 120);
        }

        if (this._activeLibrary) {
            this.switchLibrary(this._activeLibrary);
        }
    }

    _openManageLibrariesModal() {
        document.getElementById('sh-lib-manage-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'sh-lib-manage-modal';
        modal.className = 'sh-lib-modal-overlay';
        modal.innerHTML = `
            <div class="sh-lib-modal-card">
                <div class="sh-lib-modal-header">
                    <div class="sh-lib-modal-titles">
                        <div class="sh-lib-modal-badge">PERSONNALISATION</div>
                        <h2 class="sh-lib-modal-title">Gérer & Réordonner les Sections</h2>
                        <p class="sh-lib-modal-subtitle">Cochez/décochez les sections et utilisez les flèches ▲ ▼ pour modifier leur ordre d'apparition.</p>
                    </div>
                    <button class="sh-lib-modal-close" id="sh-lib-modal-close" title="Fermer">✕</button>
                </div>

                <div class="sh-lib-modal-list sh-scrollbar" id="sh-lib-modal-list"></div>

                <div class="sh-lib-modal-footer">
                    <button class="sh-lib-modal-btn-sec" id="sh-lib-btn-show-all">Tout afficher</button>
                    <button class="sh-lib-modal-btn-pri" id="sh-lib-btn-done">Terminer</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('open'));

        const listContainer = modal.querySelector('#sh-lib-modal-list');

        const renderModalRows = () => {
            if (!listContainer) return;
            listContainer.innerHTML = this._allLibraries.map((lib, idx) => {
                const isVisible = !this._hiddenLibraryIds.has(lib.Id);
                const icon = this._getIconForType(lib.CollectionType || lib.Type);
                const rawType = (lib.CollectionType || lib.Type || '').toLowerCase();
                let typeLabel = 'Médiathèque';
                if (rawType.includes('movie')) typeLabel = 'Films & Cinéma';
                else if (rawType.includes('tv') || rawType.includes('series')) typeLabel = 'Séries TV & Animés';
                else if (rawType.includes('boxset')) typeLabel = 'Sagas & Collections';
                else if (rawType.includes('music')) typeLabel = 'Musique & Albums';

                const isFirst = idx === 0;
                const isLast = idx === this._allLibraries.length - 1;

                return `
                    <div class="sh-lib-manage-row" data-id="${lib.Id}" data-index="${idx}" draggable="true">
                        <div class="sh-drag-handle" title="Glisser pour réordonner">⠿</div>
                        <div class="sh-lib-manage-reorder">
                            <button class="sh-lib-order-btn sh-lib-order-up" data-index="${idx}" ${isFirst ? 'disabled' : ''} title="Monter">▲</button>
                            <button class="sh-lib-order-btn sh-lib-order-down" data-index="${idx}" ${isLast ? 'disabled' : ''} title="Descendre">▼</button>
                        </div>
                        <div class="sh-lib-manage-left">
                            <span class="sh-lib-manage-icon">${icon}</span>
                            <div class="sh-lib-manage-info">
                                <span class="sh-lib-manage-name">${this._escape(lib.Name)}</span>
                                <span class="sh-lib-manage-type">${typeLabel}</span>
                            </div>
                        </div>
                        <label class="sh-apple-switch">
                            <input type="checkbox" class="sh-lib-toggle-input" data-id="${lib.Id}" ${isVisible ? 'checked' : ''}>
                            <span class="sh-apple-switch-slider"></span>
                        </label>
                    </div>
                `;
            }).join('');

            // Toggles
            listContainer.querySelectorAll('.sh-lib-toggle-input').forEach(input => {
                input.addEventListener('change', () => {
                    const libId = input.dataset.id;
                    if (input.checked) {
                        this._hiddenLibraryIds.delete(libId);
                    } else {
                        const visibleCount = this._allLibraries.filter(l => !this._hiddenLibraryIds.has(l.Id)).length;
                        if (visibleCount <= 1) {
                            input.checked = true;
                            window.SpaceHub?.ui?.toaster?.warning?.('Au moins une bibliothèque doit rester visible.');
                            return;
                        }
                        this._hiddenLibraryIds.add(libId);
                    }
                    this._savePreferences();
                    this._refreshVisibleLibraries();
                });
            });

            // Flèches Monter / Descendre
            listContainer.querySelectorAll('.sh-lib-order-up').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = Number(btn.dataset.index);
                    if (idx > 0) {
                        const temp = this._allLibraries[idx];
                        this._allLibraries[idx] = this._allLibraries[idx - 1];
                        this._allLibraries[idx - 1] = temp;
                        this._librariesOrder = this._allLibraries.map(l => l.Id);
                        this._savePreferences();
                        this._refreshVisibleLibraries();
                        renderModalRows();
                    }
                });
            });

            listContainer.querySelectorAll('.sh-lib-order-down').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = Number(btn.dataset.index);
                    if (idx < this._allLibraries.length - 1) {
                        const temp = this._allLibraries[idx];
                        this._allLibraries[idx] = this._allLibraries[idx + 1];
                        this._allLibraries[idx + 1] = temp;
                        this._librariesOrder = this._allLibraries.map(l => l.Id);
                        this._savePreferences();
                        this._refreshVisibleLibraries();
                        renderModalRows();
                    }
                });
            });

            // Drag and Drop avec la souris
            let draggedIdx = null;

            listContainer.querySelectorAll('.sh-lib-manage-row').forEach(row => {
                row.addEventListener('dragstart', (e) => {
                    draggedIdx = Number(row.dataset.index);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(draggedIdx));
                    requestAnimationFrame(() => row.classList.add('dragging'));
                });

                row.addEventListener('dragend', () => {
                    row.classList.remove('dragging');
                    listContainer.querySelectorAll('.sh-lib-manage-row').forEach(r => {
                        r.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
                    });
                });

                row.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const targetIdx = Number(row.dataset.index);
                    if (targetIdx === draggedIdx) return;

                    const rect = row.getBoundingClientRect();
                    const isTop = (e.clientY - rect.top) < (rect.height / 2);
                    row.classList.toggle('drag-over-top', isTop);
                    row.classList.toggle('drag-over-bottom', !isTop);
                });

                row.addEventListener('dragleave', () => {
                    row.classList.remove('drag-over-top', 'drag-over-bottom');
                });

                row.addEventListener('drop', (e) => {
                    e.preventDefault();
                    row.classList.remove('drag-over-top', 'drag-over-bottom');
                    const targetIdx = Number(row.dataset.index);
                    if (draggedIdx === null || draggedIdx === targetIdx) return;

                    const rect = row.getBoundingClientRect();
                    const isTop = (e.clientY - rect.top) < (rect.height / 2);
                    let newIndex = isTop ? targetIdx : targetIdx + 1;
                    if (draggedIdx < newIndex) newIndex--;

                    const [movedItem] = this._allLibraries.splice(draggedIdx, 1);
                    this._allLibraries.splice(newIndex, 0, movedItem);
                    this._librariesOrder = this._allLibraries.map(l => l.Id);
                    this._savePreferences();
                    this._refreshVisibleLibraries();
                    renderModalRows();
                });
            });
        };

        renderModalRows();

        const closeModal = () => {
            modal.classList.remove('open');
            setTimeout(() => modal.remove(), 240);
        };

        modal.querySelector('#sh-lib-modal-close')?.addEventListener('click', closeModal);
        modal.querySelector('#sh-lib-btn-done')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        modal.querySelector('#sh-lib-btn-show-all')?.addEventListener('click', () => {
            this._hiddenLibraryIds.clear();
            this._savePreferences();
            this._refreshVisibleLibraries();
            renderModalRows();
            window.SpaceHub?.ui?.toaster?.success?.('Toutes les bibliothèques sont désormais affichées');
        });
    }

    _updateTabsPill(targetBtn, animate = true) {
        const pill = this._container.querySelector('#sh-lib-tabs-pill');
        const track = this._container.querySelector('#sh-lib-tabs-track');
        if (!pill || !targetBtn || !track) return;

        const left = targetBtn.offsetLeft;
        const width = targetBtn.offsetWidth;
        if (width <= 0) return;

        if (animate) {
            pill.style.transition = 'transform 360ms cubic-bezier(0.34, 1.56, 0.45, 1), width 320ms cubic-bezier(0.34, 1.56, 0.45, 1)';
            pill.style.transform = `translateX(${left}px) scaleX(1.10) scaleY(0.94)`;
            setTimeout(() => {
                pill.style.transform = `translateX(${left}px) scaleX(1) scaleY(1)`;
            }, 160);
        } else {
            pill.style.transition = 'none';
            pill.style.transform = `translateX(${left}px) scaleX(1) scaleY(1)`;
        }
        pill.style.width = `${width}px`;
    }

    /**
     * Change la bibliothèque affichée et charge ses données
     * @param {Object} library
     */
    async switchLibrary(library) {
        if (!library) return;
        this._activeLibrary = library;
        this._items = [];
        this._startIndex = 0;
        this._hasMore = true;
        this._activeGenre = 'all';
        this._alphabetFilter = null;
        this._searchQuery = '';

        this._savePreferences();
        this._updateHeaderDisplay();
        await this._loadGenresForActiveLibrary();
        await this._reloadItems(true);
    }

    _updateHeaderDisplay() {
        const titleEl = this._container.querySelector('#sh-lib-main-title');
        const badgeEl = this._container.querySelector('#sh-lib-badge-type');
        const searchInput = this._container.querySelector('#sh-lib-search-input');
        
        if (titleEl) titleEl.textContent = this._activeLibrary.Name;
        if (badgeEl) {
            const rawType = (this._activeLibrary.CollectionType || this._activeLibrary.Type || '').toLowerCase();
            let label = 'BIBLIOTHÈQUE';
            if (rawType.includes('movie')) label = 'FILMS & CINÉMA';
            else if (rawType.includes('tv') || rawType.includes('series')) label = 'SÉRIES & ANIMÉS';
            else if (rawType.includes('music')) label = 'MUSIQUE & ALBUMS';
            else if (rawType.includes('boxset')) label = 'SAGAS & COFFRETS';
            else if (rawType.includes('book')) label = 'LIVRES & BD';
            badgeEl.textContent = label;
        }

        if (searchInput) searchInput.value = '';
    }

    async _loadGenresForActiveLibrary() {
        const carousel = this._container.querySelector('#sh-lib-genres-carousel');
        if (!carousel) return;

        try {
            this._genresList = await this._api?.getGenres(this._activeLibrary.Id) || [];
            carousel.innerHTML = `
                <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-genre-chip ${this._activeGenre === 'all' ? 'active' : ''}" data-genre="all">Tous les genres</button>
                ${this._genresList.slice(0, 24).map(genre => `
                    <button tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true" class="sh-lib-genre-chip ${this._activeGenre === genre ? 'active' : ''}" data-genre="${this._escape(genre)}">
                        ${this._escape(genre)}
                    </button>
                `).join('')}
            `;

            carousel.querySelectorAll('.sh-lib-genre-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    carousel.querySelectorAll('.sh-lib-genre-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    this._activeGenre = chip.dataset.genre;
                    this._startIndex = 0;
                    this._items = [];
                    this._hasMore = true;
                    this._reloadItems(true);
                });
            });
        } catch (e) {
            this._genresList = [];
        }
    }

    async _reloadItems(resetView = false) {
        if (!this._activeLibrary || this._isLoading) return;
        this._isLoading = true;

        const gridContainer = this._container.querySelector('#sh-lib-grid-container');
        const spinner = this._container.querySelector('#sh-lib-infinite-spinner');

        if (resetView && gridContainer) {
            gridContainer.innerHTML = '';
            gridContainer.className = `sh-lib-grid-container sh-lib-grid--${this._viewMode}`;
            
            // Skeleton de chargement
            if (this._viewMode === 'poster') {
                gridContainer.appendChild(this._cardBuilder?.createSkeletonGrid?.(24, 'poster') || this._createFallbackSkeleton(24));
            } else {
                gridContainer.appendChild(this._createFallbackSkeleton(16));
            }
        }

        if (spinner && !resetView) spinner.style.display = 'flex';

        try {
            const queryOptions = {
                startIndex: String(this._startIndex),
                limit: String(this._pageSize),
                sortBy: this._sortBy,
                sortOrder: this._sortOrder,
            };

            // ── 1. REGLE ESSENTIELLE : Regroupement par Type d'Entité ──
            // Évite d'afficher les épisodes un par un pour les séries et animés
            const colType = (this._activeLibrary.CollectionType || this._activeLibrary.Type || '').toLowerCase();
            const libName = (this._activeLibrary.Name || '').toLowerCase();

            if (colType === 'tvshows' || colType === 'series' || libName.includes('anime') || libName.includes('série') || libName.includes('serie') || libName.includes('tv') || libName.includes('show')) {
                queryOptions.includeItemTypes = 'Series';
            } else if (colType === 'movies' || libName.includes('film') || libName.includes('ciné')) {
                queryOptions.includeItemTypes = 'Movie';
            } else if (colType === 'boxsets' || libName.includes('saga') || libName.includes('collection')) {
                queryOptions.includeItemTypes = 'BoxSet';
            } else if (colType === 'music') {
                queryOptions.includeItemTypes = 'MusicAlbum';
            } else if (colType === 'playlists') {
                queryOptions.includeItemTypes = 'Playlist';
            }

            // Filtrage par Genre
            if (this._activeGenre && this._activeGenre !== 'all') {
                queryOptions.genres = this._activeGenre;
            }

            // Filtrage par Statut
            if (this._activeStatus === 'unplayed') {
                queryOptions.isPlayed = 'false';
            } else if (this._activeStatus === 'favorite') {
                queryOptions.isFavorite = 'true';
            } else if (this._activeStatus === 'resuming') {
                queryOptions.filters = 'IsResuming';
            } else if (this._activeStatus === '4k') {
                queryOptions.minWidth = '3800';
            }

            // Recherche textuelle
            if (this._searchQuery && this._searchQuery.trim().length > 0) {
                queryOptions.searchTerm = this._searchQuery.trim();
            }

            // Filtre alphabétique
            if (this._alphabetFilter) {
                queryOptions.nameStartsWith = this._alphabetFilter;
            }

            const { items, totalCount } = await this._api.getItemsWithTotal(this._activeLibrary.Id, queryOptions);

            this._totalCount = totalCount;
            this._hasMore = (this._startIndex + items.length) < totalCount && items.length > 0;
            this._startIndex += items.length;

            if (resetView) {
                this._items = items;
            } else {
                this._items.push(...items);
            }

            this._updateStatsSubtitle();
            this._renderCurrentView(resetView ? items : items, resetView);

        } catch (err) {
            this._log.error('Erreur chargement médias:', err);
            if (resetView && gridContainer) {
                gridContainer.innerHTML = `
                    <div class="sh-lib-empty-card">
                        <div class="sh-lib-empty-icon">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        </div>
                        <h3>Erreur de chargement</h3>
                        <p>${this._escape(err.message)}</p>
                        <button class="sh-lib-reset-btn" id="sh-lib-retry-btn">Réessayer</button>
                    </div>
                `;
                gridContainer.querySelector('#sh-lib-retry-btn')?.addEventListener('click', () => this._reloadItems(true));
            }
        } finally {
            this._isLoading = false;
            if (spinner) spinner.style.display = 'none';
            this._setupInfiniteScroll();
        }
    }

    _updateStatsSubtitle() {
        const statsEl = this._container.querySelector('#sh-lib-stats-subtitle');
        if (!statsEl) return;

        const countStr = new Intl.NumberFormat('fr-FR').format(this._totalCount);
        const rawType = (this._activeLibrary?.CollectionType || this._activeLibrary?.Type || '').toLowerCase();
        let entity = 'titres';
        if (rawType.includes('movie')) entity = 'films';
        else if (rawType.includes('tv') || rawType.includes('series') || this._activeLibrary?.Name?.toLowerCase().includes('anime')) entity = 'séries & animés';
        else if (rawType.includes('music')) entity = 'albums';
        else if (rawType.includes('boxset')) entity = 'sagas';

        let activeFilters = [];
        if (this._activeGenre !== 'all') activeFilters.push(this._activeGenre);
        if (this._activeStatus !== 'all') {
            const statusNames = { unplayed: 'Non vus', favorite: 'Favoris', resuming: 'En cours', '4k': '4K UHD' };
            activeFilters.push(statusNames[this._activeStatus] || this._activeStatus);
        }
        if (this._searchQuery) activeFilters.push(`"${this._searchQuery}"`);
        if (this._alphabetFilter) activeFilters.push(`Lettre ${this._alphabetFilter}`);

        const filterNotice = activeFilters.length > 0 ? ` • Filtres : ${activeFilters.join(', ')}` : '';
        statsEl.textContent = `${countStr} ${entity} disponibles • Master 4K & Dolby Vision${filterNotice}`;
    }

    _renderCurrentView(itemsToAppend, isFresh = false) {
        const gridContainer = this._container.querySelector('#sh-lib-grid-container');
        if (!gridContainer) return;

        if (isFresh) {
            gridContainer.innerHTML = '';
            gridContainer.className = `sh-lib-grid-container sh-lib-grid--${this._viewMode}`;
        }

        if (this._items.length === 0) {
            gridContainer.innerHTML = `
                <div class="sh-lib-empty-card">
                    <div class="sh-lib-empty-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>
                    </div>
                    <h3>Aucun média trouvé</h3>
                    <p>Aucun titre ne correspond à vos filtres ou à votre recherche.</p>
                    <button class="sh-lib-reset-btn" id="sh-lib-reset-filters">Réinitialiser les filtres</button>
                </div>
            `;
            gridContainer.querySelector('#sh-lib-reset-filters')?.addEventListener('click', () => {
                this._activeGenre = 'all';
                this._activeStatus = 'all';
                this._searchQuery = '';
                this._alphabetFilter = null;
                this._container.querySelectorAll('.sh-lib-genre-chip').forEach(c => c.classList.toggle('active', c.dataset.genre === 'all'));
                this._container.querySelectorAll('.sh-lib-alpha-btn').forEach(b => b.classList.toggle('active', b.dataset.char === ''));
                const input = this._container.querySelector('#sh-lib-search-input');
                if (input) input.value = '';
                this._reloadItems(true);
            });
            return;
        }

        if (this._viewMode === 'poster') {
            this._renderPosterMode(gridContainer, itemsToAppend, isFresh);
        } else if (this._viewMode === 'backdrop') {
            this._renderBackdropMode(gridContainer, itemsToAppend, isFresh);
        } else if (this._viewMode === 'list') {
            this._renderListMode(gridContainer, itemsToAppend, isFresh);
        }
    }

    _renderPosterMode(container, items, isFresh) {
        if (!this._cardBuilder) return;

        items.forEach(item => {
            const card = this._cardBuilder.createCard({
                id: item.Id,
                title: item.Name,
                subtitle: String(item.ProductionYear || ''),
                imageUrl: this._api.getImageUrl(item.Id, 'Primary', { maxWidth: 400, maxHeight: 600 }),
                type: 'poster',
                rating: item.CommunityRating ? Number(item.CommunityRating) : null,
                rottenScore: item.CriticRating || null,
                progress: item.UserData?.PlayedPercentage ? item.UserData.PlayedPercentage / 100 : 0,
                isFavorite: Boolean(item.UserData?.IsFavorite),
                onClick: () => this._openItemDetails(item)
            });

            container.appendChild(card);
        });
    }

    _renderBackdropMode(container, items, isFresh) {
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'sh-lib-backdrop-card';
            card.dataset.id = item.Id;

            const bgUrl = this._api.getImageUrl(item.Id, 'Backdrop', { maxWidth: 600, maxHeight: 340 }) || this._api.getImageUrl(item.Id, 'Primary', { maxWidth: 600, maxHeight: 340 });
            const progress = Math.round(item.UserData?.PlayedPercentage || 0);
            const isFav = Boolean(item.UserData?.IsFavorite);
            const rating = item.CommunityRating ? Number(item.CommunityRating).toFixed(1) : '8.5';
            const year = item.ProductionYear || '';

            card.innerHTML = `
                <div class="sh-lib-backdrop-thumb-wrap">
                    <img src="${bgUrl}" alt="${this._escape(item.Name)}" loading="lazy" />
                    <div class="sh-lib-backdrop-play-overlay">
                        <button class="sh-lib-quick-play-btn" title="▶ Lancer">▶</button>
                    </div>
                    <button class="sh-lib-card-fav-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? '#ff4757' : 'none'}" stroke="${isFav ? '#ff4757' : '#fff'}" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                    </button>
                    ${progress > 0 ? `
                        <div class="sh-lib-card-progress-bar">
                            <div class="sh-lib-card-progress-fill" style="width:${progress}%;"></div>
                        </div>
                    ` : ''}
                </div>
                <div class="sh-lib-backdrop-info">
                    <div class="sh-lib-backdrop-title-row">
                        <span class="sh-lib-backdrop-title">${this._escape(item.Name)}</span>
                    </div>
                    <div class="sh-lib-backdrop-meta-row">
                        <span class="sh-lib-meta-score">★ ${rating}</span>
                        ${year ? `<span class="sh-lib-meta-dot">•</span><span>${year}</span>` : ''}
                        ${item.OfficialRating ? `<span class="sh-lib-meta-dot">•</span><span class="sh-lib-meta-badge">${item.OfficialRating}</span>` : ''}
                    </div>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (e.target.closest('.sh-lib-quick-play-btn')) {
                    this._playItem(item);
                } else if (e.target.closest('.sh-lib-card-fav-btn')) {
                    this._toggleFavorite(item, e.target.closest('.sh-lib-card-fav-btn'));
                } else {
                    this._openItemDetails(item);
                }
            });

            container.appendChild(card);
        });
    }

    _renderListMode(container, items, isFresh) {
        let table = container.querySelector('.sh-lib-table');
        if (isFresh || !table) {
            container.innerHTML = `
                <div class="sh-lib-table-wrap">
                    <table class="sh-lib-table">
                        <thead>
                            <tr>
                                <th style="width: 50px;"></th>
                                <th>Titre</th>
                                <th>Année</th>
                                <th>Genres</th>
                                <th>Note</th>
                                <th>Qualité</th>
                                <th style="text-align: right; width: 120px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="sh-lib-table-body"></tbody>
                    </table>
                </div>
            `;
            table = container.querySelector('#sh-lib-table-body');
        }

        const tbody = container.querySelector('#sh-lib-table-body');
        if (!tbody) return;

        items.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'sh-lib-table-row';
            tr.dataset.id = item.Id;

            const posterUrl = this._api.getImageUrl(item.Id, 'Primary', { maxWidth: 80, maxHeight: 120 });
            const rating = item.CommunityRating ? `★ ${Number(item.CommunityRating).toFixed(1)}` : '—';
            const genres = (item.Genres || []).slice(0, 2).join(', ') || 'Cinéma';
            const isFav = Boolean(item.UserData?.IsFavorite);

            tr.innerHTML = `
                <td class="sh-lib-td-thumb">
                    <img src="${posterUrl}" alt="${this._escape(item.Name)}" loading="lazy" />
                </td>
                <td class="sh-lib-td-title">
                    <span class="sh-lib-table-item-name">${this._escape(item.Name)}</span>
                    <span class="sh-lib-table-item-sub">${item.Type === 'Series' ? 'Série TV' : item.Type === 'BoxSet' ? 'Saga' : 'Film'}</span>
                </td>
                <td class="sh-lib-td-year">${item.ProductionYear || '—'}</td>
                <td class="sh-lib-td-genres">${this._escape(genres)}</td>
                <td class="sh-lib-td-rating">${rating}</td>
                <td class="sh-lib-td-quality"><span class="sh-lib-quality-badge">4K UHD</span></td>
                <td class="sh-lib-td-actions">
                    <button class="sh-lib-table-play" title="▶ Lire">▶</button>
                    <button class="sh-lib-table-fav ${isFav ? 'active' : ''}" title="Favoris">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="${isFav ? '#ff4757' : 'none'}" stroke="${isFav ? '#ff4757' : '#fff'}" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                    </button>
                </td>
            `;

            tr.addEventListener('click', (e) => {
                if (e.target.closest('.sh-lib-table-play')) {
                    this._playItem(item);
                } else if (e.target.closest('.sh-lib-table-fav')) {
                    this._toggleFavorite(item, e.target.closest('.sh-lib-table-fav'));
                } else {
                    this._openItemDetails(item);
                }
            });

            tbody.appendChild(tr);
        });
    }

    _createFallbackSkeleton(count = 18) {
        const wrap = document.createElement('div');
        wrap.className = 'sh-lib-skeleton-grid';
        wrap.innerHTML = Array.from({ length: count }).map(() => `
            <div class="sh-lib-skeleton-card">
                <div class="sh-skeleton-thumb"></div>
                <div class="sh-skeleton-line short"></div>
                <div class="sh-skeleton-line tiny"></div>
            </div>
        `).join('');
        return wrap;
    }

    _setupInfiniteScroll() {
        if (this._scrollObserver) {
            this._scrollObserver.disconnect();
        }

        const sentinel = this._container.querySelector('#sh-lib-infinite-sentinel');
        if (!sentinel || !this._hasMore) return;

        this._scrollObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && this._hasMore && !this._isLoading) {
                this._reloadItems(false);
            }
        }, { rootMargin: '400px' });

        this._scrollObserver.observe(sentinel);
    }

    _openItemDetails(item) {
        if (window.SpaceHub?.ui?.modalSlideUpSheet) {
            window.SpaceHub.ui.modalSlideUpSheet.open(item);
        } else if (item.Id) {
            window.location.hash = `#/details?id=${item.Id}`;
        }
    }

    _playItem(item) {
        if (window.SpaceHub?.player?.play) {
            window.SpaceHub.player.play(item);
        } else if (window.Emby?.Page?.showItem) {
            window.Emby.Page.showItem(item.Id);
        }
    }

    async _toggleFavorite(item, btnEl) {
        const isFav = !Boolean(item.UserData?.IsFavorite);
        if (!item.UserData) item.UserData = {};
        item.UserData.IsFavorite = isFav;

        if (btnEl) {
            btnEl.classList.toggle('active', isFav);
            const svg = btnEl.querySelector('svg');
            if (svg) {
                svg.setAttribute('fill', isFav ? '#ff4757' : 'none');
                svg.setAttribute('stroke', isFav ? '#ff4757' : '#fff');
            }
        }

        try {
            await this._api.setFavorite(item.Id, isFav);
            window.SpaceHub?.ui?.toaster?.success?.(isFav ? 'Ajouté à vos favoris' : 'Retiré des favoris');
        } catch (e) {
            this._log.warn('Erreur toggle favorite:', e);
        }
    }

    _bindToolbarEvents() {
        // Recherche avec debounce
        const searchInput = this._container.querySelector('#sh-lib-search-input');
        const clearBtn = this._container.querySelector('#sh-lib-search-clear');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';

                if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
                this._searchDebounceTimer = setTimeout(() => {
                    this._searchQuery = val;
                    this._startIndex = 0;
                    this._items = [];
                    this._hasMore = true;
                    this._reloadItems(true);
                }, 300);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                clearBtn.style.display = 'none';
                this._searchQuery = '';
                this._startIndex = 0;
                this._items = [];
                this._hasMore = true;
                this._reloadItems(true);
            });
        }

        // Menus Dropdown (Tri & Statuts)
        this._bindDropdown('sh-lib-sort-btn', 'sh-lib-sort-menu', (itemEl) => {
            this._sortBy = itemEl.dataset.sort;
            this._sortOrder = itemEl.dataset.order;
            const sortLabel = this._container.querySelector('#sh-lib-sort-label');
            if (sortLabel) sortLabel.textContent = itemEl.textContent.trim().split(' ')[1] || 'Tri';
            
            // Afficher le dock A-Z si le tri est alphabétique
            const dock = this._container.querySelector('#sh-lib-alphabet-dock');
            if (dock) dock.style.display = this._sortBy.includes('SortName') ? 'flex' : 'none';

            this._savePreferences();
            this._startIndex = 0;
            this._items = [];
            this._hasMore = true;
            this._reloadItems(true);
        });

        this._bindDropdown('sh-lib-status-btn', 'sh-lib-status-menu', (itemEl) => {
            this._activeStatus = itemEl.dataset.status;
            const statusLabel = this._container.querySelector('#sh-lib-status-label');
            if (statusLabel) statusLabel.textContent = itemEl.textContent.trim().split(' ')[0] || 'Tous';
            this._startIndex = 0;
            this._items = [];
            this._hasMore = true;
            this._reloadItems(true);
        });

        // Commutateur de Mode de Vue
        this._container.querySelectorAll('.sh-lib-viewmode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._container.querySelectorAll('.sh-lib-viewmode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._viewMode = btn.dataset.mode;
                this._savePreferences();
                this._renderCurrentView(this._items, true);
            });
        });

        // Clic sur l'Index Alphabétique A-Z
        this._container.querySelectorAll('.sh-lib-alpha-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._container.querySelectorAll('.sh-lib-alpha-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._alphabetFilter = btn.dataset.char || null;
                this._startIndex = 0;
                this._items = [];
                this._hasMore = true;
                this._reloadItems(true);
            });
        });

        // Fermeture des dropdowns au clic extérieur
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.sh-lib-dropdown-wrap')) {
                this._closeAllDropdowns();
            }
        });
    }

    _bindDropdown(btnId, menuId, onSelect) {
        const btn = this._container.querySelector(`#${btnId}`);
        const menu = this._container.querySelector(`#${menuId}`);
        if (!btn || !menu) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menu.classList.contains('open');
            this._closeAllDropdowns();
            if (!isOpen) {
                menu.classList.remove('closing');
                menu.style.display = 'flex';
                void menu.offsetWidth;
                menu.classList.add('open');
            }
        });

        menu.querySelectorAll('.sh-lib-dropdown-item').forEach((item, idx) => {
            item.style.setProperty('--item-idx', idx);
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.querySelectorAll('.sh-lib-dropdown-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                this._closeDropdown(menu);
                if (onSelect) onSelect(item);
            });
        });
    }

    _closeDropdown(menu) {
        if (!menu || !menu.classList.contains('open')) return;
        menu.classList.remove('open');
        menu.classList.add('closing');
        setTimeout(() => {
            if (menu.classList.contains('closing')) {
                menu.style.display = 'none';
                menu.classList.remove('closing');
            }
        }, 160);
    }

    _closeAllDropdowns() {
        this._container?.querySelectorAll('.sh-lib-dropdown-menu.open').forEach(m => {
            this._closeDropdown(m);
        });
    }

    _getIconForType(type = '', name = '') {
        const t = (type || '').toLowerCase();
        const n = (name || '').toLowerCase();

        // 1. Films & Cinéma
        if (t.includes('movie') || n.includes('film') || n.includes('ciné')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`;
        }
        // 2. Animés & Mangas
        if (n.includes('anime') || n.includes('manga') || n.includes('japan')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path></svg>`;
        }
        // 3. Séries TV
        if (t.includes('tv') || t.includes('series') || n.includes('série') || n.includes('serie') || n.includes('tv') || n.includes('show')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>`;
        }
        // 4. Musique
        if (t.includes('music') || n.includes('musique') || n.includes('audio') || n.includes('album')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
        }
        // 5. Sagas & BoxSets
        if (t.includes('boxset') || n.includes('saga') || n.includes('collection')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 9 10-5 10 5-10 5Z"></path><path d="m2 14 10 5 10-5"></path><path d="m2 19 10 5 10-5"></path></svg>`;
        }
        // 6. Playlists
        if (t.includes('playlist') || n.includes('playlist')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="16" y2="18"></line><path d="M4 6h.01M4 12h.01M4 18h.01"></path></svg>`;
        }
        // 7. Livres & BD
        if (t.includes('book') || n.includes('livre') || n.includes('bd')) {
            return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h10M6 10h10"></path></svg>`;
        }
        // 8. Dossier standard
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>`;
    }

    _escape(str = '') {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _injectStyles() {
        if (document.getElementById('sh-library-explorer-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-library-explorer-styles';
        style.textContent = `
/* ══════════════════════════════════════════════════════════════════════════════
   SpaceHub — Library View (Monochrome Apple TV+ & Pure Crystal Frosted Glass)
   ══════════════════════════════════════════════════════════════════════════════ */

.sh-library-explorer {
    width: 100%;
    min-height: 100vh;
    padding: 100px 3.5vw 60px;
    box-sizing: border-box;
    position: relative;
    color: #ffffff;
    background-color: #000000;
    font-family: var(--sh-font-family, -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif);
}

/* ── Lueur Ambiante Neutre Apple (Zéro violet) ── */
.sh-lib-ambient-glow {
    position: fixed;
    top: 0;
    left: 15%;
    right: 15%;
    height: 350px;
    background: radial-gradient(ellipse at top, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 50%, transparent 80%);
    pointer-events: none;
    z-index: 0;
    filter: blur(80px);
}

/* ── En-tête Principal ── */
.sh-lib-hero-header {
    position: relative;
    z-index: 2;
    margin-bottom: 24px;
}

.sh-lib-header-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.sh-lib-title-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.sh-lib-badge-pill {
    display: inline-flex;
    align-self: flex-start;
    font-size: 11px;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    padding: 4px 12px;
    border-radius: 9999px;
    backdrop-filter: blur(16px);
}

.sh-lib-main-title {
    font-size: 38px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #ffffff;
    margin: 0;
    line-height: 1.15;
    text-shadow: 0 4px 24px rgba(0,0,0,0.6);
}

.sh-lib-stats-subtitle {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.60);
    margin: 0;
    font-weight: 450;
    letter-spacing: -0.01em;
}

/* ── Sélecteur d'Onglets de Bibliothèques Flottant ── */
.sh-lib-tabs-track-wrap {
    overflow-x: auto;
    padding: 6px 0;
    scrollbar-width: none;
}
.sh-lib-tabs-track-wrap::-webkit-scrollbar {
    display: none;
}

.sh-lib-tabs-track {
    display: inline-flex;
    align-items: center;
    position: relative;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9999px;
    padding: 4px;
    backdrop-filter: blur(32px) saturate(180%);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.50);
}

.sh-lib-tabs-pill {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 0;
    border-radius: 9999px;
    background: #ffffff;
    box-shadow: 0 4px 16px rgba(255, 255, 255, 0.35), 0 0 1px #ffffff;
    pointer-events: none;
    z-index: 1;
}

.sh-lib-tab-btn {
    position: relative;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    padding: 8px 18px;
    border-radius: 9999px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: color 180ms ease;
}

.sh-lib-tab-btn:hover {
    color: #ffffff;
}

.sh-lib-tab-btn.active {
    color: #000000;
    font-weight: 750;
}
.sh-lib-tab-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: inherit;
    transition: transform 180ms ease;
}

.sh-lib-tab-icon svg {
    display: block;
    stroke: currentColor;
    stroke-width: 2.1;
    transition: stroke 180ms ease;
}

.sh-lib-tab-btn:hover .sh-lib-tab-icon {
    transform: scale(1.08);
}

.sh-lib-tab-btn.active .sh-lib-tab-icon svg {
    stroke: #000000;
}

.sh-lib-tabs-loading, .sh-lib-tabs-empty {
    padding: 8px 16px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
}

/* ── Barre d'Outils Pure Glass Sticky ── */
.sh-lib-toolbar-sticky {
    position: sticky;
    top: 76px;
    z-index: 40;
    background: rgba(14, 14, 18, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 20px;
    padding: 12px 18px;
    backdrop-filter: blur(32px) saturate(180%);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
    margin-bottom: 28px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.sh-lib-toolbar-primary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}

/* Champ de Recherche */
.sh-lib-search-box {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 240px;
    max-width: 380px;
}

.sh-lib-search-icon {
    position: absolute;
    left: 12px;
    color: rgba(255, 255, 255, 0.45);
    pointer-events: none;
}

.sh-lib-search-input {
    width: 100%;
    height: 38px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 0 34px 0 36px;
    color: #ffffff;
    font-size: 13px;
    font-weight: 500;
    outline: none;
    transition: all 180ms ease;
}

.sh-lib-search-input:focus {
    background: rgba(255, 255, 255, 0.10);
    border-color: rgba(255, 255, 255, 0.40);
    box-shadow: 0 0 16px rgba(255, 255, 255, 0.15);
}

.sh-lib-search-input::placeholder {
    color: rgba(255, 255, 255, 0.40);
}

.sh-lib-search-clear {
    position: absolute;
    right: 10px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    border: none;
    color: #fff;
    font-size: 10px;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

/* Actions & Menus Contrôles */
.sh-lib-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.sh-lib-dropdown-wrap {
    position: relative;
}

.sh-lib-control-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 14px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 180ms ease;
}

.sh-lib-control-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.28);
    color: #ffffff;
}

.sh-lib-chevron {
    font-size: 11px;
    opacity: 0.6;
}

.sh-lib-dropdown-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 200px;
    background: rgba(18, 18, 24, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    padding: 6px;
    backdrop-filter: blur(32px);
    -webkit-backdrop-filter: blur(32px);
    box-shadow: 0 20px 48px rgba(0,0,0,0.88);
    display: none;
    flex-direction: column;
    gap: 2px;
    z-index: 50;
    transform-origin: top right;
    opacity: 0;
    transform: scale(0.88) translateY(-8px);
    filter: blur(8px);
    pointer-events: none;
    transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 200ms ease;
}

.sh-lib-dropdown-menu.open {
    display: flex;
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0px);
    pointer-events: auto;
}

.sh-lib-dropdown-menu.closing {
    display: flex;
    opacity: 0;
    transform: scale(0.92) translateY(-6px);
    filter: blur(6px);
    pointer-events: none;
    transition: opacity 160ms ease, transform 160ms ease, filter 160ms ease;
}

.sh-lib-dropdown-menu.open .sh-lib-dropdown-item {
    animation: sh-menu-item-cascade 200ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
    animation-delay: calc(var(--item-idx, 0) * 20ms + 30ms);
}

@keyframes sh-menu-fade-in {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.sh-lib-dropdown-item {
    padding: 8px 12px;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.75);
    font-size: 13px;
    font-weight: 550;
    cursor: pointer;
    transition: all 140ms ease;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.sh-lib-dropdown-item:hover {
    background: rgba(255, 255, 255, 0.10);
    color: #ffffff;
}

.sh-lib-dropdown-item.selected {
    background: rgba(255, 255, 255, 0.16);
    color: #ffffff;
    font-weight: 750;
}

/* Commutateur de vue */
.sh-lib-viewmode-group {
    display: inline-flex;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 12px;
    padding: 3px;
    gap: 2px;
}

.sh-lib-viewmode-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    transition: all 180ms ease;
}

.sh-lib-viewmode-btn:hover {
    color: #ffffff;
}

.sh-lib-viewmode-btn.active {
    background: rgba(255, 255, 255, 0.20);
    color: #ffffff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

/* ── Carrousel des Genres ── */
.sh-lib-genres-carousel {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 2px;
}
.sh-lib-genres-carousel::-webkit-scrollbar {
    display: none;
}

.sh-lib-genre-chip {
    display: inline-flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 9999px;
    padding: 5px 14px;
    color: rgba(255, 255, 255, 0.65);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 180ms ease;
}

.sh-lib-genre-chip:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
    color: #ffffff;
}

.sh-lib-genre-chip.active {
    background: #ffffff;
    border-color: #ffffff;
    color: #000000;
    font-weight: 750;
    box-shadow: 0 4px 14px rgba(255, 255, 255, 0.30);
}

/* ── Index Alphabétique Rapide ── */
.sh-lib-alphabet-dock {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    overflow-x: auto;
    scrollbar-width: none;
}
.sh-lib-alphabet-dock::-webkit-scrollbar {
    display: none;
}

.sh-lib-alpha-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.45);
    font-size: 11px;
    font-weight: 700;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 140ms ease;
}

.sh-lib-alpha-btn:hover {
    color: #ffffff;
    transform: scale(1.15);
}

.sh-lib-alpha-btn.active {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.22);
}

/* ── Grille des Médias ── */
.sh-lib-content-wrap {
    position: relative;
    z-index: 1;
}

.sh-lib-grid--poster {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 22px 18px;
}

.sh-lib-grid--backdrop {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 24px 20px;
}

/* Carte Backdrop 16:9 */
.sh-lib-backdrop-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    overflow: hidden;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    transition: all 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-lib-backdrop-card:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateY(-4px);
    box-shadow: 0 16px 36px rgba(0,0,0,0.7);
}

.sh-lib-backdrop-thumb-wrap {
    height: 160px;
    position: relative;
    background: #14141e;
    overflow: hidden;
}

.sh-lib-backdrop-thumb-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 380ms ease;
}

.sh-lib-backdrop-card:hover .sh-lib-backdrop-thumb-wrap img {
    transform: scale(1.05);
}

.sh-lib-backdrop-play-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 200ms ease;
}

.sh-lib-backdrop-card:hover .sh-lib-backdrop-play-overlay {
    opacity: 1;
}

.sh-lib-quick-play-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.95);
    border: none;
    color: #000;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding-left: 3px;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    transform: scale(0.85);
    transition: all 180ms ease;
}

.sh-lib-quick-play-btn:hover {
    transform: scale(1);
    background: #ffffff;
}

.sh-lib-card-fav-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2;
    transition: all 160ms ease;
}

.sh-lib-card-fav-btn:hover {
    transform: scale(1.1);
    background: rgba(0, 0, 0, 0.85);
}

.sh-lib-card-progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(0, 0, 0, 0.5);
}

.sh-lib-card-progress-fill {
    height: 100%;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 0 2px 2px 0;
}

.sh-lib-backdrop-info {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.sh-lib-backdrop-title {
    font-size: 14px;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sh-lib-backdrop-meta-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
}

.sh-lib-meta-score {
    color: #facc15;
    font-weight: 700;
}

.sh-lib-meta-dot {
    opacity: 0.4;
}

.sh-lib-meta-badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
}

/* ── Vue Tableau Détaillé (List View) ── */
.sh-lib-table-wrap {
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 18px;
    overflow: hidden;
    backdrop-filter: blur(20px);
}

.sh-lib-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
}

.sh-lib-table th {
    padding: 14px 16px;
    font-size: 11px;
    font-weight: 750;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.45);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sh-lib-table-row {
    cursor: pointer;
    transition: background 140ms ease;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.sh-lib-table-row:hover {
    background: rgba(255, 255, 255, 0.06);
}

.sh-lib-table td {
    padding: 10px 16px;
    vertical-align: middle;
    font-size: 13px;
}

.sh-lib-td-thumb img {
    width: 36px;
    height: 52px;
    object-fit: cover;
    border-radius: 6px;
    display: block;
}

.sh-lib-td-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.sh-lib-table-item-name {
    font-weight: 700;
    color: #ffffff;
}

.sh-lib-table-item-sub {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
}

.sh-lib-td-year, .sh-lib-td-genres {
    color: rgba(255, 255, 255, 0.65);
}

.sh-lib-td-rating {
    font-weight: 750;
    color: #facc15;
}

.sh-lib-quality-badge {
    font-size: 10px;
    font-weight: 750;
    color: rgba(255, 255, 255, 0.90);
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.18);
    padding: 2px 7px;
    border-radius: 5px;
}

.sh-lib-table-play, .sh-lib-table-fav {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    cursor: pointer;
    margin-left: 4px;
    transition: all 140ms ease;
}

.sh-lib-table-play:hover, .sh-lib-table-fav:hover {
    background: rgba(255, 255, 255, 0.22);
    transform: scale(1.08);
}

/* ── État Vide ── */
.sh-lib-empty-card {
    grid-column: 1 / -1;
    padding: 60px 20px;
    text-align: center;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed rgba(255, 255, 255, 0.12);
    border-radius: 20px;
    margin: 20px 0;
}

.sh-lib-empty-icon {
    font-size: 42px;
    margin-bottom: 12px;
}

.sh-lib-empty-card h3 {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 6px;
}

.sh-lib-empty-card p {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.55);
    margin: 0 0 18px;
}

.sh-lib-reset-btn {
    background: #ffffff;
    border: none;
    border-radius: 9999px;
    color: #000000;
    font-size: 13px;
    font-weight: 750;
    padding: 8px 22px;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(255, 255, 255, 0.35);
    transition: all 180ms ease;
}

.sh-lib-reset-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 20px rgba(255, 255, 255, 0.50);
}

/* ── Skeleton Loading ── */
.sh-lib-skeleton-grid {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 22px 18px;
    width: 100%;
}

.sh-lib-skeleton-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.sh-skeleton-thumb {
    width: 100%;
    aspect-ratio: 2 / 3;
    border-radius: 16px;
    background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%);
    background-size: 200% 100%;
    animation: sh-skeleton-wave 1.6s infinite ease-in-out;
}

.sh-skeleton-line {
    height: 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
}
.sh-skeleton-line.short { width: 75%; }
.sh-skeleton-line.tiny { width: 40%; }

@keyframes sh-skeleton-wave {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

/* ── Sélecteur d'Onglets & Bouton Gérer ── */
.sh-lib-tabs-container {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.sh-lib-manage-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 14px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9999px;
    color: rgba(255, 255, 255, 0.75);
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
    backdrop-filter: blur(20px);
    transition: all 180ms ease;
}

.sh-lib-manage-btn:hover {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.28);
    color: #ffffff;
    transform: scale(1.03);
}

/* ── Modal de Gestion des Sections (Frosted Glass VisionOS) ── */
.sh-lib-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(28px) saturate(180%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    opacity: 0;
    pointer-events: none;
    transition: opacity 220ms ease;
}

.sh-lib-modal-overlay.open {
    opacity: 1;
    pointer-events: auto;
}

.sh-lib-modal-card {
    width: 100%;
    max-width: 480px;
    max-height: 85vh;
    background: rgba(18, 18, 24, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 24px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.92) translateY(12px);
    transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-lib-modal-overlay.open .sh-lib-modal-card {
    transform: scale(1) translateY(0);
}

.sh-lib-modal-header {
    padding: 22px 24px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.sh-lib-modal-badge {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 4px;
}

.sh-lib-modal-title {
    font-size: 20px;
    font-weight: 750;
    color: #ffffff;
    margin: 0 0 4px;
}

.sh-lib-modal-subtitle {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    margin: 0;
    line-height: 1.4;
}

.sh-lib-modal-close {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ffffff;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 160ms ease;
}

.sh-lib-modal-close:hover {
    background: rgba(255, 255, 255, 0.18);
    transform: scale(1.08);
}

.sh-lib-modal-list {
    padding: 12px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 50vh;
}

.sh-lib-manage-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease, opacity 160ms ease;
    cursor: default;
}

.sh-lib-manage-row:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
}

.sh-drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: rgba(255, 255, 255, 0.35);
    cursor: grab;
    user-select: none;
    margin-right: 8px;
    padding: 4px;
    border-radius: 4px;
    transition: all 140ms ease;
}

.sh-drag-handle:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.08);
}

.sh-lib-manage-row:active .sh-drag-handle {
    cursor: grabbing;
}

.sh-lib-manage-row.dragging {
    opacity: 0.35;
    transform: scale(0.98);
    border: 1px dashed rgba(255, 255, 255, 0.45);
    background: rgba(255, 255, 255, 0.02);
}

.sh-lib-manage-row.drag-over-top {
    border-top: 2px solid #ffffff !important;
    box-shadow: 0 -4px 12px rgba(255, 255, 255, 0.35);
}

.sh-lib-manage-row.drag-over-bottom {
    border-bottom: 2px solid #ffffff !important;
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.35);
}

.sh-lib-manage-reorder {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-right: 12px;
}

.sh-lib-order-btn {
    width: 22px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 8px;
    cursor: pointer;
    transition: all 140ms ease;
    padding: 0;
    line-height: 1;
}

.sh-lib-order-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.22);
    color: #ffffff;
    transform: scale(1.1);
}

.sh-lib-order-btn:disabled {
    opacity: 0.20;
    cursor: not-allowed;
}

.sh-lib-manage-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
}

.sh-lib-manage-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.85);
}

.sh-lib-manage-icon svg {
    display: block;
    stroke: currentColor;
    stroke-width: 2;
}

.sh-lib-manage-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.sh-lib-manage-name {
    font-size: 14px;
    font-weight: 650;
    color: #ffffff;
}

.sh-lib-manage-type {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
}

/* ── Apple Switch Toggle (Pure Luxury) ── */
.sh-apple-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 26px;
    flex-shrink: 0;
}

.sh-apple-switch input {
    opacity: 0;
    width: 0;
    height: 0;
}

.sh-apple-switch-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.20);
    transition: all 260ms cubic-bezier(0.16, 1, 0.3, 1);
    border-radius: 9999px;
}

.sh-apple-switch-slider:before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 2px;
    bottom: 2px;
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    transition: all 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-apple-switch input:checked + .sh-apple-switch-slider {
    background: #34c759;
    border-color: #34c759;
    box-shadow: 0 0 12px rgba(52, 199, 89, 0.45);
}

.sh-apple-switch input:checked + .sh-apple-switch-slider:before {
    transform: translateX(18px);
}

.sh-lib-modal-footer {
    padding: 16px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.sh-lib-modal-btn-sec {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 9999px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    font-weight: 600;
    padding: 8px 18px;
    cursor: pointer;
    transition: all 160ms ease;
}

.sh-lib-modal-btn-sec:hover {
    background: rgba(255, 255, 255, 0.14);
    color: #ffffff;
}

.sh-lib-modal-btn-pri {
    background: #ffffff;
    border: none;
    border-radius: 9999px;
    color: #000000;
    font-size: 13px;
    font-weight: 750;
    padding: 8px 22px;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(255, 255, 255, 0.35);
    transition: all 160ms ease;
}

.sh-lib-modal-btn-pri:hover {
    transform: scale(1.03);
    box-shadow: 0 6px 20px rgba(255, 255, 255, 0.50);
}

/* Sentinelle infinie */
.sh-lib-infinite-sentinel {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 24px;
}

.sh-lib-infinite-spinner {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
}

.sh-spinner-dots {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: sh-spin 0.7s linear infinite;
}

@keyframes sh-spin {
    to { transform: rotate(360deg); }
}
        `;
        document.head.appendChild(style);
    }
}

export default LibraryView;
