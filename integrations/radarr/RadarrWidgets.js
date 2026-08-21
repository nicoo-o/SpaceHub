/**
 * SpaceHub — Radarr Dashboard Widgets
 * Version: 0.7.0
 *
 * Widgets pour le Dashboard SpaceHub affichant :
 * 1. UpcomingMoviesWidget : Calendrier des sorties films cinéma / digital
 * 2. RadarrQueueWidget : File d'attente et téléchargements Radarr en direct
 */

'use strict';

class UpcomingMoviesWidget {
    constructor() {
        this.id = 'radarr-upcoming';
        this.title = 'Sorties Films à Venir (Radarr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--radarr-upcoming">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">🍿 ${this.title}</h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">🔄</button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:var(--sh-text-muted);">Chargement du calendrier Radarr...</p>
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
            const radarr = window.SpaceHub?.integrations?.radarr;
            if (!radarr) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>⚙️ Radarr n'est pas configuré. Rendez-vous dans les réglages SpaceHub pour renseigner l'URL et la clé API.</p>
                    </div>
                `;
                return;
            }

            const movies = await radarr.getUpcomingMovies(30);

            if (!movies || movies.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>🎬 Aucune sortie de film prévue dans les 30 prochains jours.</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-radarr-movies-grid">
                    ${movies.slice(0, 10).map(m => {
                        const releaseDate = m.digitalRelease || m.physicalRelease || m.inCinemas;
                        const dateObj = releaseDate ? new Date(releaseDate) : null;
                        const dateFormatted = dateObj ? dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Bientôt';
                        const poster = m.images?.find(i => i.coverType === 'poster')?.remoteUrl || '';

                        return `
                            <div class="sh-radarr-movie-card">
                                <div class="sh-radarr-movie-card__image-wrap">
                                    ${poster ? `<img src="${poster}" alt="${m.title || 'Film'}" loading="lazy"/>` : '<div class="sh-placeholder">🍿</div>'}
                                    <span class="sh-radarr-movie-card__date">${dateFormatted}</span>
                                </div>
                                <div class="sh-radarr-movie-card__info">
                                    <h4 class="sh-radarr-movie-card__title sh-truncate">${m.title || 'Film'}</h4>
                                    <p class="sh-radarr-movie-card__year">${m.year || ''} ${m.studio ? `• ${m.studio}` : ''}</p>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } catch (err) {
            contentEl.innerHTML = `
                <div class="sh-widget-error">
                    <p>Impossible de joindre Radarr (${err.message}). Vérifiez vos identifiants.</p>
                </div>
            `;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }

    _injectStyles() {
        if (document.getElementById('sh-radarr-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-radarr-widget-styles';
        style.textContent = `
.sh-radarr-movies-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--sh-space-4, 16px);
}

.sh-radarr-movie-card {
    display: flex;
    flex-direction: column;
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-md, 12px);
    overflow: hidden;
    transition: transform var(--sh-transition-fast, 150ms);
}

.sh-radarr-movie-card:hover {
    transform: translateY(-4px);
    border-color: var(--sh-color-primary, #7c6aff);
}

.sh-radarr-movie-card__image-wrap {
    aspect-ratio: 2/3;
    width: 100%;
    position: relative;
    background: var(--sh-bg-surface-3, #2e2e3d);
}

.sh-radarr-movie-card__image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.sh-radarr-movie-card__date {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0,0,0,0.8);
    font-size: 10px;
    font-weight: 700;
    text-align: center;
    padding: 3px 0;
    color: var(--sh-color-secondary, #00c9a7);
}

.sh-radarr-movie-card__info {
    padding: var(--sh-space-2, 8px) var(--sh-space-3, 12px);
}

.sh-radarr-movie-card__title {
    margin: 0 0 2px 0;
    font-size: var(--sh-text-sm, 13px);
    font-weight: var(--sh-font-semibold, 600);
    color: var(--sh-text-primary, #f0f0f8);
}

.sh-radarr-movie-card__year {
    margin: 0;
    font-size: var(--sh-text-xs, 11px);
    color: var(--sh-text-muted, #5c5c7a);
}
        `;
        document.head.appendChild(style);
    }
}

class RadarrQueueWidget {
    constructor() {
        this.id = 'radarr-queue';
        this.title = 'Téléchargements Radarr';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--radarr-queue">
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
            const radarr = window.SpaceHub?.integrations?.radarr;
            if (!radarr) {
                contentEl.innerHTML = '<p style="color:var(--sh-text-muted);">Radarr non configuré.</p>';
                return;
            }

            const queue = await radarr.getQueueItems();

            if (!queue || queue.length === 0) {
                contentEl.innerHTML = `
                    <div style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>✅ Aucun téléchargement de film en cours dans Radarr.</p>
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
                                    <span class="sh-truncate" style="font-weight:600;">${item.title || item.movie?.title || 'Film'}</span>
                                    <span style="color:var(--sh-color-secondary);">${progress}%</span>
                                </div>
                                <div style="height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                                    <div style="width:${progress}%; height:100%; background:var(--sh-color-secondary);"></div>
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

export { UpcomingMoviesWidget, RadarrQueueWidget };
