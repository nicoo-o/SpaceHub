import { escapeHtml } from '../../core/utils/domUtils.js';
import './RadarrWidgets.css';
import * as svc from '../../core/services.js';
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
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
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
            const radarr = svc.integration('radarr');
            if (!radarr) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>Radarr n'est pas configuré. Rendez-vous dans les réglages SpaceHub pour renseigner l'URL et la clé API.</p>
                    </div>
                `;
                return;
            }

            const movies = await radarr.getUpcomingMovies(30);

            if (!movies || movies.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line>
                        </svg>
                        <p>Aucune sortie de film prévue dans les 30 prochains jours.</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-card-grid sh-card-grid--poster sh-radarr-carousel">
                    ${movies.slice(0, 20).map(m => {
                        const releaseDate = m.digitalRelease || m.physicalRelease || m.inCinemas;
                        const dateObj = releaseDate ? new Date(releaseDate) : null;
                        const dateFormatted = dateObj ? dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Bientôt';
                        const poster = m.images?.find(i => i.coverType === 'poster')?.remoteUrl || '';
                        const year = m.year || (dateObj ? dateObj.getFullYear() : '');
                        const studio = m.studio || 'Cinéma';

                        return `
                            <div class="sh-card sh-card--poster sh-radarr-bento-card">
                                <div class="sh-card__image-wrap sh-radarr-bento-card__poster-wrap">
                                    ${poster 
                                        ? `<img class="sh-card__image" src="${poster}" alt="${m.title || 'Film'}" loading="lazy"/>` 
                                        : '<div class="sh-card__image sh-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg></div>'}
                                    <div class="sh-card__glint"></div>
                                    <div class="sh-radarr-bento-card__floating-badges">
                                        <span class="sh-radarr-pill-badge sh-radarr-pill-badge--date">${dateFormatted}</span>
                                    </div>
                                </div>
                                <div class="sh-radarr-bento-card__body">
                                    <h4 class="sh-radarr-bento-card__title sh-truncate" title="${m.title || 'Film'}">${m.title || 'Film'}</h4>
                                    <span class="sh-radarr-bento-card__meta">${year ? `${year} • ` : ''}${studio}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            setTimeout(() => {
                const carousel = contentEl.querySelector('.sh-radarr-carousel');
                if (carousel && svc.gooeyScroller()) {
                    svc.gooeyScroller().attach(carousel);
                }
            }, 60);
        } catch (err) {
            contentEl.innerHTML = `
                <div class="sh-widget-error">
                    <p>Impossible de joindre Radarr (${escapeHtml(err.message)}). Vérifiez vos identifiants.</p>
                </div>
            `;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans RadarrWidgets.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
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
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4);">Chargement de la file d'attente...</p>
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
            const radarr = svc.integration('radarr');
            if (!radarr) {
                contentEl.innerHTML = '<p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); text-align:center; padding:24px;">Radarr non configuré.</p>';
                return;
            }

            const queue = await radarr.getQueueItems();

            if (!queue || queue.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <p>Aucun téléchargement de film en cours dans Radarr.</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${queue.map(item => {
                        const progress = item.sizeleft && item.size ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0;
                        return `
                            <div class="sh-radarr-queue-row">
                                <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
                                    <span class="sh-truncate" style="font-weight:600; color:var(--sh-ink-solid, #ffffff);">${item.title || item.movie?.title || 'Film'}</span>
                                    <span style="font-weight:700; color:var(--sh-ink-solid, #ffffff); font-size:12px; background:rgba(var(--sh-ink, 255, 255, 255), 0.08); padding:2px 8px; border-radius:9999px;">${progress}%</span>
                                </div>
                                <div style="height:4px; background:rgba(var(--sh-ink, 255, 255, 255), 0.08); border-radius:9999px; overflow:hidden;">
                                    <div style="width:${progress}%; height:100%; background:var(--sh-ink-solid, #ffffff); border-radius:9999px;"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } catch (err) {
            contentEl.innerHTML = `<p style="color:#ff453a; text-align:center; padding:16px;">${escapeHtml(err.message)}</p>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export { UpcomingMoviesWidget, RadarrQueueWidget };
