import { escapeHtml } from '../../core/utils/domUtils.js';
import './BazarrWidgets.css';
import * as svc from '../../core/services.js';
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
            const bazarr = svc.integration('bazarr');
            if (bazarr) await bazarr.triggerSync();
        });

        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const bazarr = svc.integration('bazarr');
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
                    <p>Impossible de joindre Bazarr (${escapeHtml(err.message)}). Vérifiez vos identifiants.</p>
                </div>
            `;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans BazarrWidgets.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export { BazarrWantedWidget };
