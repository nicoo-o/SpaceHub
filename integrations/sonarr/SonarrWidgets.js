import { escapeHtml } from '../../core/utils/domUtils.js';
import './SonarrWidgets.css';
import * as svc from '../../core/services.js';
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
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
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
            const sonarr = svc.integration('sonarr');
            if (!sonarr) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>Sonarr n'est pas configuré. Rendez-vous dans les réglages SpaceHub pour renseigner l'URL et la clé API.</p>
                    </div>
                `;
                return;
            }

            const episodes = await sonarr.getUpcomingEpisodes(14);

            if (!episodes || episodes.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline>
                        </svg>
                        <p>Aucun épisode prévu dans les 14 prochains jours.</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-card-grid sh-card-grid--poster sh-sonarr-carousel">
                    ${episodes.slice(0, 20).map(ep => {
                        const airDate = ep.airDateUtc ? new Date(ep.airDateUtc) : null;
                        const dateFormatted = airDate ? airDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Bientôt';
                        const timeFormatted = airDate ? airDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
                        const poster = ep.series?.images?.find(i => i.coverType === 'poster')?.remoteUrl || '';
                        const epCode = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;

                        return `
                            <div class="sh-card sh-card--poster sh-sonarr-bento-card">
                                <div class="sh-card__image-wrap sh-sonarr-bento-card__poster-wrap">
                                    ${poster ? `<img class="sh-card__image" src="${poster}" alt="${ep.series?.title || 'Série'}" loading="lazy"/>` : '<div class="sh-card__image sh-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg></div>'}
                                    <div class="sh-card__glint"></div>
                                    <div class="sh-sonarr-bento-card__floating-badges">
                                        <span class="sh-sonarr-pill-badge sh-sonarr-pill-badge--ep">${epCode}</span>
                                        <span class="sh-sonarr-pill-badge sh-sonarr-pill-badge--date">${dateFormatted}</span>
                                    </div>
                                </div>
                                <div class="sh-sonarr-bento-card__body">
                                    <h4 class="sh-sonarr-bento-card__series-title sh-truncate" title="${ep.series?.title || 'Série'}">${ep.series?.title || 'Série'}</h4>
                                    <p class="sh-sonarr-bento-card__ep-title sh-truncate" title="${ep.title || 'Épisode'}">${ep.title || 'Épisode'}</p>
                                    ${timeFormatted ? `<span class="sh-sonarr-bento-card__time">${timeFormatted}</span>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            setTimeout(() => {
                const carousel = contentEl.querySelector('.sh-sonarr-carousel');
                if (carousel && svc.gooeyScroller()) {
                    svc.gooeyScroller().attach(carousel);
                }
            }, 60);
        } catch (err) {
            contentEl.innerHTML = `
                <div class="sh-widget-error">
                    <p>Impossible de joindre Sonarr (${escapeHtml(err.message)}). Vérifiez vos identifiants.</p>
                </div>
            `;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans SonarrWidgets.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
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
            const sonarr = svc.integration('sonarr');
            if (!sonarr) {
                contentEl.innerHTML = '<p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); text-align:center; padding:24px;">Sonarr non configuré.</p>';
                return;
            }

            const queue = await sonarr.getQueueItems();

            if (!queue || queue.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <p>Aucun téléchargement de série en cours dans Sonarr.</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${queue.map(item => {
                        const progress = item.sizeleft && item.size ? Math.round(((item.size - item.sizeleft) / item.size) * 100) : 0;
                        const seriesTitle = item.series?.title || item.title || 'Série';
                        const epTitle = item.episode?.title ? ` - ${item.episode.title}` : '';
                        return `
                            <div class="sh-sonarr-queue-row">
                                <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
                                    <span class="sh-truncate" style="font-weight:600; color:var(--sh-ink-solid, #ffffff);">${seriesTitle}${epTitle}</span>
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

export { UpcomingEpisodesWidget, SonarrQueueWidget };
