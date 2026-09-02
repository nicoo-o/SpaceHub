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
import { gabaritBibliotheque } from './LibraryView.template.js';

import './LibraryView.css';
import * as svc from '../../core/services.js';
class LibraryView {
    constructor() {
        // Confirmation du scope library dans le Focus Registry
        const spatialNav = svc.nav() || svc.nav();
        if (spatialNav?.registerFocusables) {
            spatialNav.registerFocusables('library', (container) => {
                const root = container || document.querySelector('.sh-library-view') || document;
                return Array.from(root.querySelectorAll('.sh-lib-tab-btn, .sh-lib-genre-chip, .sh-lib-alpha-btn, .sh-lib-control-btn, .sh-card, [data-nav-focusable="true"], .sh-lib-manage-btn, .sh-lib-search-input, .sh-lib-search-clear'));
            }, { force: true }); // re-registration volontaire — cf. plan A04
        }
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
        return svc.jellyfinApi();
    }

    get _cardBuilder() {
        return svc.cardBuilder();
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

        // Un AbortController par cycle de rendu.
        // Les ecouteurs poses sur des elements internes disparaissent avec le DOM,
        // mais ceux poses sur `document` survivaient a chaque re-rendu : changer de
        // bibliotheque en empilait un de plus a chaque fois, et les fermetures de
        // menus se declenchaient autant de fois qu'il y avait eu de rendus.
        this._renderAbort?.abort();
        this._renderAbort = new AbortController();
        container.innerHTML = gabaritBibliotheque(this);

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
        requestAnimationFrame(() => {
            modal.classList.add('open');
            const spatialNav = svc.nav() || svc.nav();
            spatialNav?.onModalOpened?.(modal, modal.querySelector('#sh-lib-modal-close'));
        });

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
                            svc.toaster()?.warning?.('Au moins une bibliothèque doit rester visible.');
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
            const spatialNav = svc.nav() || svc.nav();
            spatialNav?.onModalClosed?.();
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
            svc.toaster()?.success?.('Toutes les bibliothèques sont désormais affichées');
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
            const rating = item.CommunityRating !== undefined && item.CommunityRating !== null
                ? Number(item.CommunityRating).toFixed(1)
                : null;
            const year = item.ProductionYear || '';

            card.innerHTML = `
                <div class="sh-lib-backdrop-thumb-wrap">
                    <img decoding="async" src="${bgUrl}" alt="${this._escape(item.Name)}" loading="lazy" />
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
                        ${rating !== null ? `<span class="sh-lib-meta-score">★ ${this._escape(rating)}/10</span>` : ''}
                        ${year ? `<span class="sh-lib-meta-dot">•</span><span>${year}</span>` : ''}
                        ${item.OfficialRating ? `<span class="sh-lib-meta-dot">•</span><span class="sh-lib-meta-badge">${this._escape(item.OfficialRating)}</span>` : ''}
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
                    <img decoding="async" src="${posterUrl}" alt="${this._escape(item.Name)}" loading="lazy" />
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
        if (svc.slideUpSheet()) {
            svc.slideUpSheet().open(item);
        } else if (item.Id) {
            window.location.hash = `#/details?id=${item.Id}`;
        }
    }

    _playItem(item) {
        if (svc.player()?.play) {
            svc.player().play(item);
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
            svc.toaster()?.success?.(isFav ? 'Ajouté à vos favoris' : 'Retiré des favoris');
        } catch (e) {
            this._log.warn('Erreur toggle favorite:', e);
        }
    }

    /** Libere tout ce qui survit au DOM de la vue. */
    destroy() {
        this._renderAbort?.abort();
        this._renderAbort = null;
        this._container = null;
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
        }, { signal: this._renderAbort.signal });
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
        // Les styles de ce composant vivent désormais dans LibraryView.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default LibraryView;
