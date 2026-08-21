/**
 * SpaceHub — Unified Watchlist & Requests View
 * Version: 1.0.0
 *
 * Combine la Watchlist Jellyfin et les demandes Jellyseerr dans une seule interface.
 */

'use strict';

import Logger from '../../../core/Logger.js';

class WatchlistView {
    constructor() {
        this._log = new Logger('WatchlistView');
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-view sh-watchlist-view">
                <header class="sh-view__header">
                    <h2 class="sh-view__title">📋 Ma Liste & Demandes</h2>
                    <p class="sh-view__subtitle">Contenu à voir plus tard ou demandé au serveur</p>
                </header>

                <div class="sh-tabs">
                    <button class="sh-tabs__btn active" data-tab="watchlist">📚 Ma Liste (Jellyfin)</button>
                    <button class="sh-tabs__btn" data-tab="requests">🛎️ Mes Demandes (Jellyseerr)</button>
                </div>

                <div class="sh-watchlist-content" id="sh-watchlist-grid">
                    <div class="sh-loader">Chargement...</div>
                </div>
            </div>
        `;

        this._bindEvents(container);
        this._loadWatchlist();
    }

    _bindEvents(container) {
        container.querySelectorAll('.sh-tabs__btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.sh-tabs__btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (btn.dataset.tab === 'watchlist') this._loadWatchlist();
                else this._loadRequests();
            });
        });
    }

    async _loadWatchlist() {
        const grid = document.getElementById('sh-watchlist-grid');
        const jellyfin = window.SpaceHub?.core?.api?.getClient('jellyfin');

        try {
            const data = await jellyfin.get(`/Users/${window.SpaceHub.auth.getUserId()}/Items?Recursive=true&IsFavorite=true&Fields=PrimaryImageAspectRatio,ProductionYear`);
            const items = data?.Items || [];

            if (items.length === 0) {
                grid.innerHTML = '<div class="sh-no-data">Votre liste est vide.</div>';
                return;
            }

            this._renderGrid(grid, items);
        } catch (err) {
            grid.innerHTML = '<div class="sh-no-data">Erreur de chargement de la liste.</div>';
        }
    }

    async _loadRequests() {
        const grid = document.getElementById('sh-watchlist-grid');
        const jellyseerr = window.SpaceHub?.integrations?.jellyseerr;

        if (!jellyseerr || !jellyseerr.api) {
            grid.innerHTML = '<div class="sh-no-data">Intégration Jellyseerr non configurée.</div>';
            return;
        }

        try {
            const requests = await jellyseerr.api.get('/api/v1/request?take=20&skip=0&filter=all');
            const items = requests?.results || [];

            if (items.length === 0) {
                grid.innerHTML = '<div class="sh-no-data">Aucune demande trouvée.</div>';
                return;
            }

            grid.innerHTML = items.map(req => `
                <div class="sh-card sh-card--compact">
                    <div class="sh-card__poster-wrap">
                        <img src="https://image.tmdb.org/t/p/w300${req.media.posterPath}" class="sh-card__poster" alt="">
                    </div>
                    <div class="sh-card__body">
                        <h4 class="sh-card__title sh-truncate">${req.media.tmdbId} (TMDB)</h4>
                        <span class="sh-badge ${req.status === 1 ? 'sh-badge--warning' : 'sh-badge--success'}">${req.status === 1 ? 'En attente' : 'Approuvé'}</span>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            grid.innerHTML = '<div class="sh-no-data">Erreur de chargement des demandes.</div>';
        }
    }

    _renderGrid(container, items) {
        const jellyfin = window.SpaceHub?.core?.api?.getClient('jellyfin');
        container.innerHTML = `
            <div class="sh-grid">
                ${items.map(item => `
                    <div class="sh-card" data-id="${item.Id}">
                        <div class="sh-card__poster-wrap">
                            <img src="${jellyfin.getImageUrl(item.Id)}" class="sh-card__poster" loading="lazy" alt="">
                        </div>
                        <div class="sh-card__body">
                            <h4 class="sh-card__title sh-truncate">${item.Name}</h4>
                            <p class="sh-card__subtitle">${item.ProductionYear || ''}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        container.querySelectorAll('.sh-card').forEach(card => {
            card.addEventListener('click', () => {
                const item = items.find(i => i.Id === card.dataset.id);
                window.SpaceHub.openItem(item);
            });
        });
    }
}

export default WatchlistView;
