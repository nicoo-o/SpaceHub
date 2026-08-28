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
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        <span>${this.title}</span>
                    </h2>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button class="sh-widget__sync-btn" title="Synchroniser Bazarr">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            <span>Sync</span>
                        </button>
                        <button class="sh-widget__refresh-btn" title="Actualiser les sous-titres">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        </button>
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
                        <p>Bazarr n'est pas configuré. Rendez-vous dans les réglages SpaceHub pour renseigner l'URL et la clé API.</p>
                    </div>
                `;
                return;
            }

            const summary = await bazarr.getWantedSummary();

            if (summary.totalWanted === 0 && summary.movies.length === 0 && summary.episodes.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <p>Tous vos films et séries ont leurs sous-titres au complet !</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-bazarr-summary-banner">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <span><strong>${summary.totalWanted}</strong> sous-titre(s) manquant(s) dans votre médiathèque</span>
                </div>

                <div class="sh-bazarr-items-list">
                    ${summary.movies.slice(0, 5).map(m => `
                        <div class="sh-bazarr-item">
                            <div class="sh-bazarr-item__details">
                                <span class="sh-bazarr-type-badge sh-bazarr-type-badge--movie">Film</span>
                                <span class="sh-bazarr-item__title sh-truncate">${m.title || m.radarrId || 'Film'}</span>
                            </div>
                            <button class="sh-btn sh-btn--ghost sh-btn--sm sh-bazarr-search-btn" data-type="movie" data-id="${m.radarrId}">Rechercher</button>
                        </div>
                    `).join('')}

                    ${summary.episodes.slice(0, 5).map(ep => `
                        <div class="sh-bazarr-item">
                            <div class="sh-bazarr-item__details">
                                <span class="sh-bazarr-type-badge sh-bazarr-type-badge--series">Épisode</span>
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
                    btn.textContent = 'Recherche...';
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
.sh-widget__refresh-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 50% !important;
    background: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    color: rgba(255, 255, 255, 0.65) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    cursor: pointer !important;
    outline: none !important;
    padding: 0 !important;
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
}

.sh-widget__refresh-btn:hover {
    background: rgba(255, 255, 255, 0.14) !important;
    border-color: rgba(255, 255, 255, 0.28) !important;
    color: #ffffff !important;
    transform: rotate(45deg) scale(1.08) !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
}

.sh-widget__refresh-btn:active {
    transform: rotate(180deg) scale(0.92) !important;
    background: rgba(255, 255, 255, 0.20) !important;
}

.sh-widget__refresh-btn svg {
    width: 14px !important;
    height: 14px !important;
    stroke: currentColor !important;
    stroke-width: 2.3 !important;
    fill: none !important;
    pointer-events: none !important;
}

.sh-widget__sync-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 5px 12px !important;
    border-radius: 9999px !important;
    background: rgba(255, 255, 255, 0.06) !important;
    border: 1px solid rgba(255, 255, 255, 0.14) !important;
    color: rgba(255, 255, 255, 0.85) !important;
    font-size: 11.5px !important;
    font-weight: 650 !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    cursor: pointer !important;
    outline: none !important;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.sh-widget__sync-btn:hover {
    background: rgba(255, 255, 255, 0.15) !important;
    border-color: rgba(255, 255, 255, 0.30) !important;
    color: #ffffff !important;
    transform: translateY(-1px) !important;
}

.sh-widget__sync-btn svg {
    width: 13px !important;
    height: 13px !important;
    stroke: currentColor !important;
    stroke-width: 2.3 !important;
    fill: none !important;
}

.sh-bazarr-summary-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 9px 12px;
    margin-bottom: 10px;
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
}
.sh-bazarr-summary-banner strong {
    color: #ffffff;
}

.sh-bazarr-items-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.sh-bazarr-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 10px 14px;
    gap: 10px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transition: background 140ms ease, border-color 140ms ease;
}
.sh-bazarr-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.14);
}

.sh-bazarr-item__details {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
}

.sh-bazarr-type-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    flex-shrink: 0;
    letter-spacing: 0.03em;
    text-transform: uppercase;
}

.sh-bazarr-type-badge--movie {
    color: #64d2ff;
    background: rgba(100, 210, 255, 0.12);
    border: 1px solid rgba(100, 210, 255, 0.2);
}

.sh-bazarr-type-badge--series {
    color: #32d74b;
    background: rgba(50, 215, 75, 0.12);
    border: 1px solid rgba(50, 215, 75, 0.2);
}

.sh-bazarr-item__title {
    font-size: 13px;
    font-weight: 550;
    color: #ffffff;
}
        `;
        document.head.appendChild(style);
    }
}

export { BazarrWantedWidget };
