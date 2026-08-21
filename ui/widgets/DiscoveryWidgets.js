/**
 * SpaceHub — Discovery Widgets
 * Version: 1.0.0
 *
 * Widgets pour la découverte de contenu sur le dashboard.
 */

'use strict';

class RecommendedWidget {
    constructor() {
        this.id = 'recommended';
        this.name = 'Pour vous (Recommandations)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--discovery">
                <div class="sh-widget__header">
                    <h3 class="sh-widget__title">✨ Recommandé pour vous</h3>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-items-scroll" id="sh-recommended-list">
                        <div class="sh-loader">Vérification de vos goûts...</div>
                    </div>
                </div>
            </div>
        `;
        this._loadData(container);
    }

    async _loadData(container) {
        const list = container.querySelector('#sh-recommended-list');
        const discovery = window.SpaceHub?.core?.discovery;
        const jellyfin = window.SpaceHub?.core?.api?.getClient('jellyfin');

        try {
            const items = await discovery.getPersonalized(10);
            if (items.length === 0) {
                list.innerHTML = '<p class="sh-no-data">Regardez plus de médias pour avoir des recommandations !</p>';
                return;
            }

            list.innerHTML = items.map(item => `
                <div class="sh-card sh-card--compact" data-id="${item.Id}">
                    <div class="sh-card__poster-wrap">
                        <img src="${jellyfin.getImageUrl(item.Id)}" class="sh-card__poster" loading="lazy" alt="">
                    </div>
                    <div class="sh-card__body">
                        <h4 class="sh-card__title sh-truncate">${item.Name}</h4>
                    </div>
                </div>
            `).join('');

            list.querySelectorAll('.sh-card').forEach(card => {
                card.addEventListener('click', () => {
                    const item = items.find(i => i.Id === card.dataset.id);
                    window.SpaceHub.openItem(item);
                });
            });
        } catch (err) {
            list.innerHTML = '<p class="sh-no-data">Erreur de découverte</p>';
        }
    }
}

class TrendsWidget {
    constructor() {
        this.id = 'trends';
        this.name = 'Tendances du serveur';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--trends">
                <div class="sh-widget__header">
                    <h3 class="sh-widget__title">🔥 Tendances du moment</h3>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-items-scroll" id="sh-trends-list">
                        <div class="sh-loader">Analyse du serveur...</div>
                    </div>
                </div>
            </div>
        `;
        this._loadData(container);
    }

    async _loadData(container) {
        const list = container.querySelector('#sh-trends-list');
        const discovery = window.SpaceHub?.core?.discovery;
        const jellyfin = window.SpaceHub?.core?.api?.getClient('jellyfin');

        try {
            const items = await discovery.getTrending(10);
            if (items.length === 0) {
                list.innerHTML = '<p class="sh-no-data">Le serveur est calme aujourd\'hui.</p>';
                return;
            }

            list.innerHTML = items.map(item => `
                <div class="sh-card sh-card--compact" data-id="${item.Id}">
                    <div class="sh-card__poster-wrap">
                        <img src="${jellyfin.getImageUrl(item.Id)}" class="sh-card__poster" loading="lazy" alt="">
                    </div>
                    <div class="sh-card__body">
                        <h4 class="sh-card__title sh-truncate">${item.Name}</h4>
                    </div>
                </div>
            `).join('');

            list.querySelectorAll('.sh-card').forEach(card => {
                card.addEventListener('click', () => {
                    const item = items.find(i => i.Id === card.dataset.id);
                    window.SpaceHub.openItem(item);
                });
            });
        } catch (err) {
            list.innerHTML = '<p class="sh-no-data">Erreur tendances</p>';
        }
    }
}

export { RecommendedWidget, TrendsWidget };
