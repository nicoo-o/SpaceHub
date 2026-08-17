/**
 * SpaceHub — Bazarr Dashboard Widgets
 * Version: 0.9.0
 *
 * Widgets pour le Dashboard SpaceHub affichant :
 * 1. BazarrWantedWidget : Sous-titres manquants pour les films et séries
 */

'use strict';

class BazarrWantedWidget {
    constructor() {
        this.id = 'bazarr-wanted';
        this.title = 'Sous-titres Manquants (Bazarr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--bazarr-wanted">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">💬 ${this.title}</h2>
                    <div style="display:flex; gap:var(--sh-space-2,8px);">
                        <button class="sh-btn sh-btn--ghost sh-widget__sync-btn" title="Synchroniser Bazarr">🔄 Sync</button>
                        <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">🔄</button>
                    </div>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:var(--sh-text-muted);">Chargement des sous-titres manquants...</p>
                    </div>
                </div>
            </div>
        `;

        this._injectStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        container.querySelector('.sh-widget__sync-btn')?.addEventListener('click', async () => {
            const bazarr = window.SpaceHub?.integrations?.bazarr;
            if (bazarr) await bazarr.triggerSync();
        });

        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const bazarr = window.SpaceHub?.integrations?.bazarr;
            if (!bazarr) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>⚙️ Bazarr n'est pas configuré. Rendez-vous dans les réglages SpaceHub pour renseigner l'URL et la clé API.</p>
                    </div>
                `;
                return;
            }

            const summary = await bazarr.getWantedSummary();

            if (summary.totalWanted === 0 && summary.movies.length === 0 && summary.episodes.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>🎉 Tous vos films et séries ont leurs sous-titres au complet !</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-bazarr-summary-banner">
                    <span><strong>${summary.totalWanted}</strong> sous-titre(s) manquant(s) dans votre médiathèque</span>
                </div>

                <div class="sh-bazarr-items-list">
                    ${summary.movies.slice(0, 5).map(m => `
                        <div class="sh-bazarr-item">
                            <div class="sh-bazarr-item__details">
                                <span class="sh-bazarr-type-badge">🎬 Film</span>
                                <span class="sh-bazarr-item__title sh-truncate">${m.title || m.radarrId || 'Film'}</span>
                            </div>
                            <button class="sh-btn sh-btn--ghost sh-btn--sm sh-bazarr-search-btn" data-type="movie" data-id="${m.radarrId}">Rechercher</button>
                        </div>
                    `).join('')}

                    ${summary.episodes.slice(0, 5).map(ep => `
                        <div class="sh-bazarr-item">
                            <div class="sh-bazarr-item__details">
                                <span class="sh-bazarr-type-badge">📺 Épisode</span>
                                <span class="sh-bazarr-item__title sh-truncate">${ep.seriesTitle || 'Série'} - S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}</span>
                            </div>
                            <button class="sh-btn sh-btn--ghost sh-btn--sm sh-bazarr-search-btn" data-type="episode" data-id="${ep.sonarrEpisodeId}">Rechercher</button>
                        </div>
                    `).join('')}
                </div>
            `;

            contentEl.querySelectorAll('.sh-bazarr-search-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const type = btn.dataset.type;
                    const id = btn.dataset.id;
                    btn.disabled = true;
                    btn.textContent = '⏳...';
                    if (type === 'movie') await bazarr.searchMovieSubtitles(id);
                    else await bazarr.searchEpisodeSubtitles(id);
                });
            });

        } catch (err) {
            contentEl.innerHTML = `
                <div class="sh-widget-error">
                    <p>Impossible de joindre Bazarr (${err.message}). Vérifiez vos identifiants.</p>
                </div>
            `;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }

    _injectStyles() {
        if (document.getElementById('sh-bazarr-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-bazarr-widget-styles';
        style.textContent = `
.sh-bazarr-summary-banner {
    background: rgba(var(--sh-color-primary-rgb, 124,106,255), 0.1);
    border: 1px solid rgba(var(--sh-color-primary-rgb, 124,106,255), 0.2);
    border-radius: var(--sh-radius-sm, 8px);
    padding: var(--sh-space-2, 8px) var(--sh-space-3, 12px);
    margin-bottom: var(--sh-space-3, 12px);
    font-size: var(--sh-text-sm, 13px);
    color: var(--sh-color-primary-hover, #9a8bff);
}

.sh-bazarr-items-list {
    display: flex;
    flex-direction: column;
    gap: var(--sh-space-2, 8px);
}

.sh-bazarr-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-sm, 8px);
    padding: var(--sh-space-2, 8px) var(--sh-space-3, 12px);
    gap: var(--sh-space-2, 8px);
}

.sh-bazarr-item__details {
    display: flex;
    align-items: center;
    gap: var(--sh-space-2, 8px);
    min-width: 0;
    flex: 1;
}

.sh-bazarr-type-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: var(--sh-radius-xs, 4px);
    background: var(--sh-bg-surface-3, #2e2e3d);
    color: var(--sh-text-secondary, #9898b8);
    flex-shrink: 0;
}

.sh-bazarr-item__title {
    font-size: var(--sh-text-sm, 13px);
    font-weight: var(--sh-font-medium, 500);
    color: var(--sh-text-primary, #f0f0f8);
}
        `;
        document.head.appendChild(style);
    }
}

export { BazarrWantedWidget };
