/**
 * SpaceHub — Lidarr Widgets
 * Version: 1.0.0
 *
 * Widgets pour le tableau de bord basés sur Lidarr.
 */

'use strict';

class LidarrUpcomingWidget {
    constructor() {
        this.id = 'lidarr-upcoming';
        this.name = 'Sorties Albums (Lidarr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--lidarr-upcoming">
                <div class="sh-widget__header">
                    <h3 class="sh-widget__title">🎵 Albums à venir</h3>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-items-scroll" id="sh-lidarr-upcoming-list">
                        <div class="sh-loader">Chargement...</div>
                    </div>
                </div>
            </div>
        `;

        this._loadData(container);
    }

    async _loadData(container) {
        const list = container.querySelector('#sh-lidarr-upcoming-list');
        const service = window.SpaceHub?.integrations?.lidarr;

        if (!service || !service.api) {
            list.innerHTML = '<p class="sh-no-data">Lidarr non configuré</p>';
            return;
        }

        try {
            const albums = await service.getUpcomingAlbums();
            if (!albums || albums.length === 0) {
                list.innerHTML = '<p class="sh-no-data">Aucune sortie prévue</p>';
                return;
            }

            list.innerHTML = albums.map(album => `
                <div class="sh-card sh-card--compact">
                    <div class="sh-card__poster-wrap">
                        <img src="${service.api.baseUrl}/api/v1/mediacover/${album.id}/poster?apikey=${service.api.apiKey}" class="sh-card__poster" alt="">
                    </div>
                    <div class="sh-card__body">
                        <h4 class="sh-card__title sh-truncate">${album.title}</h4>
                        <p class="sh-card__subtitle sh-truncate">${album.artist?.artistName || 'Artiste inconnu'}</p>
                    </div>
                </div>
            `).join('');

        } catch (err) {
            list.innerHTML = '<p class="sh-no-data">Erreur Lidarr</p>';
        }
    }
}

class LidarrQueueWidget {
    constructor() {
        this.id = 'lidarr-queue';
        this.name = 'File d\'attente Lidarr';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--lidarr-queue">
                <div class="sh-widget__header">
                    <h3 class="sh-widget__title">📥 Téléchargements Lidarr</h3>
                </div>
                <div class="sh-widget__content">
                    <div id="sh-lidarr-queue-list">
                        <div class="sh-loader">Chargement...</div>
                    </div>
                </div>
            </div>
        `;
        this._loadData(container);
    }

    async _loadData(container) {
        const list = container.querySelector('#sh-lidarr-queue-list');
        const service = window.SpaceHub?.integrations?.lidarr;

        if (!service || !service.api) {
            list.innerHTML = '<p class="sh-no-data">Lidarr non configuré</p>';
            return;
        }

        try {
            const data = await service.api.getQueue();
            const items = data?.records || [];

            if (items.length === 0) {
                list.innerHTML = '<p class="sh-no-data">Aucun téléchargement en cours</p>';
                return;
            }

            list.innerHTML = `
                <table class="sh-table">
                    <thead>
                        <tr>
                            <th>Album</th>
                            <th>Artiste</th>
                            <th>État</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td class="sh-truncate">${item.title}</td>
                                <td>${item.artist?.artistName || '-'}</td>
                                <td><span class="sh-badge sh-badge--primary">${item.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (err) {
            list.innerHTML = '<p class="sh-no-data">Erreur Lidarr</p>';
        }
    }
}

export { LidarrUpcomingWidget, LidarrQueueWidget };
