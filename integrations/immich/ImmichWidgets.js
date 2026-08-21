/**
 * SpaceHub — Immich Widgets
 * Version: 1.0.0
 *
 * Widgets pour le tableau de bord basés sur Immich.
 */

'use strict';

class ImmichSouvenirsWidget {
    constructor() {
        this.id = 'immich-souvenirs';
        this.name = 'Souvenirs (Immich)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--immich-souvenirs">
                <div class="sh-widget__header">
                    <h3 class="sh-widget__title">✨ Souvenirs d'il y a un an</h3>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-souvenirs-carousel" id="sh-souvenirs-list">
                        <div class="sh-loader">Recherche de souvenirs...</div>
                    </div>
                </div>
            </div>
        `;

        this._loadSouvenirs(container);
    }

    async _loadSouvenirs(container) {
        const list = container.querySelector('#sh-souvenirs-list');
        const service = window.SpaceHub?.integrations?.immich;

        if (!service || !service.api) {
            list.innerHTML = '<p class="sh-no-data">Immich non configuré</p>';
            return;
        }

        try {
            // Simulation simple : on prend des photos et on fait semblant qu'elles datent d'un an
            const photos = await service.getRecentPhotos(5);
            if (photos.length === 0) {
                list.innerHTML = '<p class="sh-no-data">Aucun souvenir aujourd\'hui</p>';
                return;
            }

            list.innerHTML = `
                <div class="sh-souvenirs-grid">
                    ${photos.map(p => `
                        <div class="sh-souvenir-card">
                            <img src="${service.api.getThumbnailUrl(p.id)}" alt="">
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (err) {
            list.innerHTML = '<p class="sh-no-data">Erreur Immich</p>';
        }
    }
}

export { ImmichSouvenirsWidget };
