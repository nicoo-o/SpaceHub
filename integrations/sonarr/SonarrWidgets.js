/**
 * SpaceHub — Sonarr Dashboard Widgets
 * Version: 0.6.0
 *
 * Widgets pour le Dashboard SpaceHub affichant :
 * 1. UpcomingEpisodesWidget : Calendrier des prochains épisodes TV
 * 2. SonarrQueueWidget : File d'attente et téléchargements Sonarr en direct
 */

'use strict';

class UpcomingEpisodesWidget {
    constructor() {
        this.id = 'sonarr-upcoming';
        this.title = 'Prochains Épisodes (Sonarr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--sonarr-upcoming">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">📺 ${this.title}</h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">🔄</button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:var(--sh-text-muted);">Chargement du calendrier Sonarr...</p>
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
            const sonarr = window.SpaceHub?.integrations?.sonarr;
            if (!sonarr) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>⚙️ Sonarr n'est pas configuré. Rendez-vous dans les réglages SpaceHub pour renseigner l'URL et la clé API.</p>
                    </div>
                `;
                return;
            }

            const episodes = await sonarr.getUpcomingEpisodes(14);

            if (!episodes || episodes.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>🎉 Aucun épisode prévu dans les 14 prochains jours.</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-sonarr-episodes-grid">
                    ${episodes.slice(0, 12).map(ep => {
                        const airDate = ep.airDateUtc ? new Date(ep.airDateUtc) : null;
                        const dateFormatted = airDate ? airDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Bientôt';
                        const timeFormatted = airDate ? airDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
                        const poster = ep.series?.images?.find(i => i.coverType === 'poster')?.remoteUrl || '';

                        return `
                            <div class="sh-sonarr-episode-card">
                                <div class="sh-sonarr-episode-card__image-wrap">
                                    ${poster ? `<img src="${poster}" alt="${ep.series?.title || 'Série'}" loading="lazy"/>` : '<div class="sh-placeholder">📺</div>'}
                                    <span class="sh-sonarr-episode-card__date">${dateFormatted}</span>
                                </div>
                                <div class="sh-sonarr-episode-card__info">
                                    <h4 class="sh-sonarr-episode-card__series-title sh-truncate">${ep.series?.title || 'Série inconnue'}</h4>
                                    <p class="sh-sonarr-episode-card__ep-info sh-truncate">S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} - ${ep.title || 'Épisode'}</p>
                                    <span class="sh-sonarr-episode-card__time">${timeFormatted}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } catch (err) {
            contentEl.innerHTML = `
                <div class="sh-widget-error">
                    <p>Impossible de joindre Sonarr (${err.message}). Vérifiez vos identifiants.</p>
                </div>
            `;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }

    _injectStyles() {
        if (document.getElementById('sh-sonarr-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-sonarr-widget-styles';
        style.textContent = `
.sh-sonarr-episodes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--sh-space-3, 12px);
}

.sh-sonarr-episode-card {
    display: flex;
    gap: var(--sh-space-3, 12px);
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-md, 12px);
    padding: var(--sh-space-2, 8px);
    transition: transform var(--sh-transition-fast, 150ms);
}

.sh-sonarr-episode-card:hover {
    transform: translateY(-2px);
    border-color: var(--sh-color-primary, #7c6aff);
}

.sh-sonarr-episode-card__image-wrap {
    width: 60px;
    height: 90px;
    flex-shrink: 0;
    border-radius: var(--sh-radius-xs, 4px);
    overflow: hidden;
    position: relative;
    background: var(--sh-bg-surface-3, #2e2e3d);
}

.sh-sonarr-episode-card__image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.sh-sonarr-episode-card__date {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0,0,0,0.8);
    font-size: 9px;
    font-weight: 700;
    text-align: center;
    padding: 2px 0;
    color: var(--sh-color-primary-hover, #9a8bff);
}

.sh-sonarr-episode-card__info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
}

.sh-sonarr-episode-card__series-title {
    margin: 0 0 4px 0;
    font-size: var(--sh-text-sm, 13px);
    font-weight: var(--sh-font-semibold, 600);
    color: var(--sh-text-primary, #f0f0f8);
}

.sh-sonarr-episode-card__ep-info {
    margin: 0 0 4px 0;
    font-size: var(--sh-text-xs, 11px);
    color: var(--sh-text-secondary, #9898b8);
}

.sh-sonarr-episode-card__time {
    font-size: 10px;
    color: var(--sh-text-muted, #5c5c7a);
}
        `;
        document.head.appendChild(style);
    }
}

class SonarrQueueWidget {
    constructor() {
        this.id = 'sonarr-queue';
        this.title = 'Téléchargements Sonarr';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--sonarr-queue">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">📥 ${this.title}</h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">🔄</button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:var(--sh-text-muted);">Chargement de la file d'attente...</p>
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
            const sonarr = window.SpaceHub?.integrations?.sonarr;
            if (!sonarr) {
                contentEl.innerHTML = '<p style="color:var(--sh-text-muted);">Sonarr non configuré.</p>';
                return;
            }

            const queue = await sonarr.getQueueItems();

            if (!queue || queue.length === 0) {
                contentEl.innerHTML = `
                    <div style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>✅ Aucun téléchargement en cours dans Sonarr.</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:var(--sh-space-2,8px);">
                    ${queue.map(item => {
                        const progress = item.sizeleft && item.size ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0;
                        return `
                            <div style="background:var(--sh-bg-surface-2,#22222e); padding:var(--sh-space-3,12px); border-radius:var(--sh-radius-sm,8px);">
                                <div style="display:flex; justify-content:space-between; font-size:var(--sh-text-sm,13px); margin-bottom:6px;">
                                    <span class="sh-truncate" style="font-weight:600;">${item.title || 'Média'}</span>
                                    <span style="color:var(--sh-color-primary);">${progress}%</span>
                                </div>
                                <div style="height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                                    <div style="width:${progress}%; height:100%; background:var(--sh-color-primary);"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } catch (err) {
            contentEl.innerHTML = `<p style="color:var(--sh-color-danger);">${err.message}</p>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export { UpcomingEpisodesWidget, SonarrQueueWidget };
