/**
 * SpaceHub — Jellyseerr Dashboard Widgets
 * Version: 0.10.0
 *
 * Widgets pour le Dashboard SpaceHub affichant :
 * 1. JellyseerrRequestsWidget : Demandes d'utilisateurs en attente avec boutons Approuver / Refuser
 * 2. JellyseerrTrendingWidget : Médias tendances avec bouton de demande en 1-clic
 */

'use strict';

class JellyseerrRequestsWidget {
    constructor() {
        this.id = 'jellyseerr-requests';
        this.title = 'Demandes de Médias (Jellyseerr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--jellyseerr-requests">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">🛎️ ${this.title}</h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">🔄</button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:var(--sh-text-muted);">Chargement des demandes...</p>
                    </div>
                </div>
            </div>
        `;

        this._injectStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = window.SpaceHub?.integrations?.jellyseerr;
            if (!jellyseerr) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>⚙️ Jellyseerr n'est pas configuré. Rendez-vous dans les réglages SpaceHub pour renseigner l'URL et la clé API.</p>
                    </div>
                `;
                return;
            }

            const requests = await jellyseerr.getPendingRequests();

            if (!requests || requests.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>✅ Aucune demande en attente. Vos utilisateurs sont comblés !</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-jellyseerr-requests-list">
                    ${requests.map(req => {
                        const media = req.media || {};
                        const user = req.requestedBy || {};
                        const title = media.title || media.name || `Média #${req.id}`;
                        const poster = media.posterPath ? `https://image.tmdb.org/t/p/w200${media.posterPath}` : '';

                        return `
                            <div class="sh-jellyseerr-request-card" data-request-id="${req.id}">
                                <div class="sh-jellyseerr-request-card__poster">
                                    ${poster ? `<img src="${poster}" alt="${title}" loading="lazy"/>` : '<div class="sh-placeholder">🎬</div>'}
                                </div>
                                <div class="sh-jellyseerr-request-card__details">
                                    <h4 class="sh-jellyseerr-request-card__title sh-truncate">${title}</h4>
                                    <p class="sh-jellyseerr-request-card__user">Demandé par <strong>${user.displayName || user.email || 'Utilisateur'}</strong></p>
                                </div>
                                <div class="sh-jellyseerr-request-card__actions">
                                    <button class="sh-btn sh-btn--primary sh-btn--sm" data-action="approve" data-id="${req.id}">Approuver</button>
                                    <button class="sh-btn sh-btn--ghost sh-btn--sm" data-action="decline" data-id="${req.id}">Refuser</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            contentEl.querySelectorAll('[data-action="approve"]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    btn.disabled = true;
                    await jellyseerr.approveRequest(id);
                    await this.loadData(container);
                });
            });

            contentEl.querySelectorAll('[data-action="decline"]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    btn.disabled = true;
                    await jellyseerr.declineRequest(id);
                    await this.loadData(container);
                });
            });

        } catch (err) {
            contentEl.innerHTML = `
                <div class="sh-widget-error">
                    <p>Impossible de joindre Jellyseerr (${err.message}). Vérifiez vos identifiants.</p>
                </div>
            `;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }

    _injectStyles() {
        if (document.getElementById('sh-jellyseerr-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-jellyseerr-widget-styles';
        style.textContent = `
.sh-jellyseerr-requests-list {
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-3, 12px);
}

.sh-jellyseerr-request-card {
    display: flex;
    align-items: center;
    gap: var(--sh-space-3, 12px);
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-md, 12px);
    padding: var(--sh-space-2, 8px) var(--sh-space-3, 12px);
}

.sh-jellyseerr-request-card__poster {
    width: 44px;
    height: 66px;
    flex-shrink: 0;
    border-radius: var(--sh-radius-xs, 4px);
    overflow: hidden;
    background: var(--sh-bg-surface-3, #2e2e3d);
}

.sh-jellyseerr-request-card__poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.sh-jellyseerr-request-card__details {
    flex: 1;
    min-width: 0;
}

.sh-jellyseerr-request-card__title {
    margin: 0 0 4px 0;
    font-size: var(--sh-text-sm, 13px);
    font-weight: var(--sh-font-semibold, 600);
    color: var(--sh-text-primary, #f0f0f8);
}

.sh-jellyseerr-request-card__user {
    margin: 0;
    font-size: var(--sh-text-xs, 11px);
    color: var(--sh-text-muted, #5c5c7a);
}

.sh-jellyseerr-request-card__actions {
    display: flex;
    gap: var(--sh-space-2, 8px);
}
        `;
        document.head.appendChild(style);
    }
}

class JellyseerrTrendingWidget {
    constructor() {
        this.id = 'jellyseerr-trending';
        this.title = 'Tendances & Découverte (Jellyseerr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--jellyseerr-trending">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">🔥 ${this.title}</h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">🔄</button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:var(--sh-text-muted);">Chargement des tendances...</p>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = window.SpaceHub?.integrations?.jellyseerr;
            if (!jellyseerr) {
                contentEl.innerHTML = '<p style="color:var(--sh-text-muted);">Jellyseerr non configuré.</p>';
                return;
            }

            const items = await jellyseerr.getTrendingMedia();

            contentEl.innerHTML = `
                <div class="sh-card-grid sh-card-grid--poster">
                    ${items.slice(0, 8).map(item => {
                        const title = item.title || item.name || 'Média';
                        const poster = item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : '';
                        const type = item.mediaType || (item.firstAirDate ? 'tv' : 'movie');

                        return `
                            <div class="sh-card sh-card--poster" style="display:flex; flex-direction:column;">
                                <div class="sh-card__image-wrap">
                                    ${poster ? `<img class="sh-card__image" src="${poster}" alt="${title}" loading="lazy"/>` : '<div class="sh-card__image sh-card__image--placeholder">🎬</div>'}
                                </div>
                                <div class="sh-card__info" style="flex:1; display:flex; flex-direction:column; justify-content:space-between;">
                                    <div>
                                        <p class="sh-card__title sh-truncate">${title}</p>
                                        <p class="sh-card__subtitle">${type === 'tv' ? 'Série' : 'Film'}</p>
                                    </div>
                                    <button class="sh-btn sh-btn--primary sh-btn--sm sh-jellyseerr-req-btn" data-type="${type}" data-id="${item.id}" style="margin-top:8px; width:100%; justify-content:center;">+ Demander</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            contentEl.querySelectorAll('.sh-jellyseerr-req-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const type = btn.dataset.type;
                    const id = btn.dataset.id;
                    btn.disabled = true;
                    btn.textContent = '⏳...';
                    await jellyseerr.requestMedia(type, id);
                    btn.textContent = '✅ Demandé';
                });
            });

        } catch (err) {
            contentEl.innerHTML = `<p style="color:var(--sh-color-danger);">${err.message}</p>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export { JellyseerrRequestsWidget, JellyseerrTrendingWidget };
