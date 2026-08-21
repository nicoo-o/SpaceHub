/**
 * SpaceHub — Unified Search
 * Version: 0.5.0
 *
 * Moteur de recherche instantané unifié.
 * Supporte la recherche en direct (debounce 300ms), le filtrage par type
 * (Films, Séries, Épisodes, Artistes, Musiques), le raccourci global Ctrl+K / /,
 * et l'affichage des résultats avec le CardBuilder SpaceHub.
 */

'use strict';

import Logger from '../../core/Logger.js';

class UnifiedSearch {
    constructor() {
        this._log = new Logger('UnifiedSearch');
        this._modal = null;
        this._debounceTimer = null;
        this._activeFilter = 'All';
        this._lastQuery = '';

        this._setupKeyboardShortcut();
        this._log.info('Initialisé.');
    }

    get _apiClient() {
        return window.SpaceHub?.core?.api?.getClient('jellyfin');
    }

    _setupKeyboardShortcut() {
        document.addEventListener('keydown', (e) => {
            // Raccourci Ctrl+K ou Cmd+K ou "/" (si pas dans un input)
            const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                this.open();
            } else if (e.key === '/' && !isTyping) {
                e.preventDefault();
                this.open();
            }
        });
    }

    /**
     * Ouvre la modale de recherche unifiée.
     */
    open() {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        if (this._modal && this._modal.isOpen) return;

        this._modal = new Modal({
            id: 'unified-search',
            size: 'lg',
            showCloseButton: true,
            content: `
                <div class="sh-search">
                    <div class="sh-search__bar">
                        <span class="sh-search__icon">🔍</span>
                        <input type="text" class="sh-search__input" placeholder="Rechercher des films, séries, musiques, artistes..." autofocus />
                        <span class="sh-search__kbd-hint">ESC pour fermer</span>
                    </div>
                    <div class="sh-search__filters">
                        <button class="sh-search__filter active" data-filter="All">Tous</button>
                        <button class="sh-search__filter" data-filter="Movie">Films</button>
                        <button class="sh-search__filter" data-filter="Series">Séries</button>
                        <button class="sh-search__filter" data-filter="Episode">Épisodes</button>
                        <button class="sh-search__filter" data-filter="MusicArtist,MusicAlbum,Audio">Musique</button>
                    </div>
                    <div class="sh-search__results sh-scrollbar">
                        <div class="sh-search__placeholder">
                            <p>Tapez au moins 2 caractères pour démarrer la recherche...</p>
                        </div>
                    </div>
                </div>
            `,
            onOpen: (m) => {
                this._bindModalEvents(m);
            }
        });

        this._injectStyles();
        this._modal.open();
    }

    _bindModalEvents(modal) {
        const input = modal._el.querySelector('.sh-search__input');
        const resultsEl = modal._el.querySelector('.sh-search__results');
        const filters = modal._el.querySelectorAll('.sh-search__filter');

        input?.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            this._lastQuery = query;

            clearTimeout(this._debounceTimer);
            if (query.length < 2) {
                resultsEl.innerHTML = `
                    <div class="sh-search__placeholder">
                        <p>Tapez au moins 2 caractères pour démarrer la recherche...</p>
                    </div>
                `;
                return;
            }

            this._debounceTimer = setTimeout(() => {
                this._performSearch(query, this._activeFilter, resultsEl);
            }, 300);
        });

        filters.forEach(btn => {
            btn.addEventListener('click', () => {
                filters.forEach(f => f.classList.remove('active'));
                btn.classList.add('active');
                this._activeFilter = btn.dataset.filter;

                if (this._lastQuery.length >= 2) {
                    this._performSearch(this._lastQuery, this._activeFilter, resultsEl);
                }
            });
        });

        setTimeout(() => input?.focus(), 50);
    }

    async _performSearch(query, filter, container) {
        container.innerHTML = `
            <div class="sh-search__loading">
                <span class="sh-spinner"></span>
                <p>Recherche en cours...</p>
            </div>
        `;

        try {
            const userId = window.ApiClient?.getCurrentUserId?.() || '';
            const typeParam = filter === 'All' ? 'Movie,Series,Episode,MusicArtist,MusicAlbum,Audio' : filter;

            const params = new URLSearchParams({
                searchTerm: query,
                userId: userId,
                includeItemTypes: typeParam,
                limit: '24',
                recursive: 'true',
                fields: 'PrimaryImageAspectRatio,ProductionYear,CommunityRating,Overview'
            });

            const data = await this._apiClient.get(`/Items?${params.toString()}`);
            const items = data?.Items || [];

            if (items.length === 0) {
                container.innerHTML = `
                    <div class="sh-search__empty">
                        <p>Aucun résultat trouvé pour "<strong>${this._escape(query)}</strong>".</p>
                    </div>
                `;
                return;
            }

            const cardBuilder = window.SpaceHub?.ui?.components?.cardBuilder;
            if (cardBuilder) {
                container.innerHTML = '';
                const grid = document.createElement('div');
                cardBuilder.renderGrid(grid, items, {
                    type: 'poster',
                    getImageUrl: (item) => this._apiClient.getImageUrl(item.Id, 'Primary', { maxWidth: 300, maxHeight: 450 }),
                    onClick: (item) => {
                        this._modal?.close();
                        window.SpaceHub?.openItem?.(item);
                    }
                });
                container.appendChild(grid);
            }
        } catch (err) {
            this._log.error('Erreur recherche:', err);
            container.innerHTML = `
                <div class="sh-widget-error">
                    <p>Erreur lors de la recherche : ${err.message}</p>
                </div>
            `;
        }
    }

    _escape(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    _injectStyles() {
        if (document.getElementById('sh-unified-search-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-unified-search-styles';
        style.textContent = `
.sh-search {
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-4, 16px);
}

.sh-search__bar {
    display: flex;
    align-items: center;
    gap: var(--sh-space-3, 12px);
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-md, 12px);
    padding: var(--sh-space-3, 12px) var(--sh-space-4, 16px);
}

.sh-search__bar:focus-within {
    border-color: var(--sh-color-primary, #7c6aff);
    box-shadow: 0 0 0 2px rgba(var(--sh-color-primary-rgb, 124,106,255), 0.2);
}

.sh-search__icon {
    font-size: 18px;
    color: var(--sh-text-muted, #5c5c7a);
}

.sh-search__input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--sh-text-primary, #f0f0f8);
    font-family: var(--sh-font-family, sans-serif);
    font-size: var(--sh-text-md, 17px);
}

.sh-search__kbd-hint {
    font-size: var(--sh-text-xs, 11px);
    color: var(--sh-text-muted, #5c5c7a);
    background: var(--sh-bg-surface-3, #2e2e3d);
    padding: 2px 6px;
    border-radius: var(--sh-radius-xs, 4px);
}

.sh-search__filters {
    display: flex;
    gap: var(--sh-space-2, 8px);
    overflow-x: auto;
    padding-bottom: 2px;
}

.sh-search__filter {
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    color: var(--sh-text-secondary, #9898b8);
    padding: var(--sh-space-2, 8px) var(--sh-space-3, 12px);
    border-radius: var(--sh-radius-sm, 8px);
    font-size: var(--sh-text-xs, 11px);
    font-weight: var(--sh-font-semibold, 600);
    cursor: pointer;
    transition: all var(--sh-transition-fast, 150ms);
}

.sh-search__filter:hover {
    color: var(--sh-text-primary, #f0f0f8);
    background: var(--sh-bg-surface-3, #2e2e3d);
}

.sh-search__filter.active {
    background: var(--sh-color-primary, #7c6aff);
    color: var(--sh-text-on-primary, #ffffff);
    border-color: var(--sh-color-primary, #7c6aff);
}

.sh-search__results {
    min-height: 260px;
    max-height: 55vh;
    overflow-y: auto;
    padding-right: var(--sh-space-2, 8px);
}

.sh-search__placeholder,
.sh-search__empty,
.sh-search__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--sh-space-10, 40px) 0;
    color: var(--sh-text-muted, #5c5c7a);
    text-align: center;
}
        `;
        document.head.appendChild(style);
    }
}

export default UnifiedSearch;
