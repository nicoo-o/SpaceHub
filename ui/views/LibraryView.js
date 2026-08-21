/**
 * SpaceHub — Library View
 * Version: 1.0.0
 *
 * Vue de navigation complète dans les bibliothèques Jellyfin (Films, Séries, Musique).
 * Affiche les éléments, les saisons/épisodes, et lance le lecteur vidéo SpaceHub.
 */

'use strict';

import Logger from '../../core/Logger.js';

class LibraryView {
    constructor() {
        this._log = new Logger('LibraryView');
        this._selectedLibrary = null;
        this._injectStyles();
    }

    get _api() {
        return window.SpaceHub?.jellyfin?.api;
    }

    get _cardBuilder() {
        return window.SpaceHub?.ui?.components?.cardBuilder;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-library-page sh-scrollbar">
                <header class="sh-library-header">
                    <div class="sh-library-tabs" id="sh-library-tabs">
                        <span style="color:var(--sh-text-muted);">Chargement des bibliothèques...</span>
                    </div>
                </header>
                <div class="sh-library-content" id="sh-library-content"></div>
            </div>
        `;

        await this._loadLibraries(container);
    }

    async _loadLibraries(container) {
        const tabsEl = container.querySelector('#sh-library-tabs');
        const contentEl = container.querySelector('#sh-library-content');

        try {
            const views = await this._api.getUserViews();

            if (!views || views.length === 0) {
                tabsEl.innerHTML = '<p>Aucune bibliothèque trouvée.</p>';
                return;
            }

            tabsEl.innerHTML = views.map((v, i) => `
                <button class="sh-lib-tab ${i === 0 ? 'active' : ''}" data-id="${v.Id}" data-name="${v.Name}" data-type="${v.CollectionType || ''}">
                    ${this._getIconForType(v.CollectionType)} ${v.Name}
                </button>
            `).join('');

            tabsEl.querySelectorAll('.sh-lib-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    tabsEl.querySelectorAll('.sh-lib-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this._loadLibraryItems(tab.dataset.id, contentEl, tab.dataset.type);
                });
            });

            // Charger la première bibliothèque par défaut
            if (views.length > 0) {
                this._loadLibraryItems(views[0].Id, contentEl, views[0].CollectionType);
            }
        } catch (err) {
            this._log.error('Erreur chargement bibliothèques:', err);
            tabsEl.innerHTML = `<p style="color:var(--sh-color-danger);">Erreur : ${err.message}</p>`;
        }
    }

    async _loadLibraryItems(parentId, contentEl, collectionType) {
        contentEl.innerHTML = '';
        contentEl.appendChild(this._cardBuilder.createSkeletonGrid(12, 'poster'));

        try {
            const items = await this._api.getItems(parentId, { limit: 50 });

            if (!items || items.length === 0) {
                contentEl.innerHTML = `
                    <div style="padding:var(--sh-space-12,48px); text-align:center; color:var(--sh-text-muted);">
                        <p>📭 Cette bibliothèque est vide.</p>
                    </div>
                `;
                return;
            }

            const grid = document.createElement('div');
            this._cardBuilder.renderGrid(grid, items, {
                type: 'poster',
                getImageUrl: (item) => this._api.getImageUrl(item.Id, 'Primary', { maxWidth: 300, maxHeight: 450 }),
                onClick: (item) => this._handleItemClick(item)
            });

            contentEl.innerHTML = '';
            contentEl.appendChild(grid);
        } catch (err) {
            contentEl.innerHTML = `
                <div class="sh-widget-error">
                    <p>Impossible de charger les médias (${err.message})</p>
                </div>
            `;
        }
    }

    async _handleItemClick(item) {
        if (item.Type === 'Series') {
            // Afficher les saisons / épisodes
            this._openSeriesModal(item);
        } else if (item.Type === 'Movie' || item.Type === 'Episode' || item.Type === 'Video') {
            // Lancer la lecture
            window.SpaceHub?.player?.play(item);
        } else {
            window.SpaceHub?.player?.play(item);
        }
    }

    async _openSeriesModal(series) {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        const modal = new Modal({
            id: `series-${series.Id}`,
            title: series.Name,
            size: 'xl',
            content: `
                <div class="sh-series-modal">
                    <div class="sh-series-modal__header">
                        <p>${series.Overview || 'Aucun résumé disponible.'}</p>
                    </div>
                    <h3 style="margin:var(--sh-space-4,16px) 0 var(--sh-space-2,8px);">Épisodes</h3>
                    <div class="sh-series-episodes-list" id="series-episodes-list">
                        <p style="color:var(--sh-text-muted);">Chargement des épisodes...</p>
                    </div>
                </div>
            `
        });

        modal.open();

        try {
            const episodes = await this._api.getEpisodes(series.Id);
            const listEl = modal._el.querySelector('#series-episodes-list');

            if (!episodes || episodes.length === 0) {
                listEl.innerHTML = '<p>Aucun épisode trouvé.</p>';
                return;
            }

            listEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${episodes.map(ep => `
                        <div class="sh-episode-row" data-id="${ep.Id}">
                            <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
                                <span class="sh-badge" style="background:var(--sh-bg-surface-3); font-weight:700; font-size:11px;">S${ep.ParentIndexNumber || 1}E${ep.IndexNumber || 1}</span>
                                <span class="sh-truncate" style="font-weight:500; font-size:14px;">${ep.Name}</span>
                            </div>
                            <button class="sh-btn sh-btn--primary sh-btn--sm sh-play-ep-btn" data-id="${ep.Id}">▶ Lire</button>
                        </div>
                    `).join('')}
                </div>
            `;

            listEl.querySelectorAll('.sh-play-ep-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const ep = episodes.find(e => e.Id === btn.dataset.id);
                    if (ep) {
                        modal.close();
                        window.SpaceHub?.player?.play(ep);
                    }
                });
            });
        } catch (err) {
            modal._el.querySelector('#series-episodes-list').innerHTML = `<p style="color:var(--sh-color-danger);">${err.message}</p>`;
        }
    }

    _getIconForType(type) {
        switch (type) {
            case 'movies': return '🎬';
            case 'tvshows': return '📺';
            case 'music': return '🎵';
            case 'books': return '📚';
            default: return '📁';
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-library-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-library-styles';
        style.textContent = `
.sh-library-page {
    max-width: 1600px;
    margin: 0 auto;
    padding: var(--sh-space-6, 24px);
}

.sh-library-header {
    margin-bottom: var(--sh-space-6, 24px);
    border-bottom: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    padding-bottom: var(--sh-space-3, 12px);
}

.sh-library-tabs {
    display: flex;
    gap: var(--sh-space-3, 12px);
    overflow-x: auto;
}

.sh-lib-tab {
    display: inline-flex;
    align-items: center;
    gap: var(--sh-space-2, 8px);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--sh-radius-md, 12px);
    padding: var(--sh-space-2, 8px) var(--sh-space-4, 16px);
    color: var(--sh-text-secondary, #9898b8);
    font-size: var(--sh-text-sm, 13px);
    font-weight: var(--sh-font-medium, 500);
    cursor: pointer;
    transition: all var(--sh-transition-fast, 150ms);
    white-space: nowrap;
}

.sh-lib-tab:hover {
    background: var(--sh-bg-surface-2, #22222e);
    color: var(--sh-text-primary, #f0f0f8);
}

.sh-lib-tab.active {
    background: var(--sh-color-primary, #7c6aff);
    color: #fff;
}

.sh-episode-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--sh-bg-surface-2, #22222e);
    padding: 8px 12px;
    border-radius: var(--sh-radius-sm, 8px);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
}
        `;
        document.head.appendChild(style);
    }
}

export default LibraryView;
