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
            const sonarr = window.SpaceHub?.integrations?.sonarr;
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
                if (carousel && window.SpaceHub?.ui?.gooeyScroller) {
                    window.SpaceHub.ui.gooeyScroller.attach(carousel);
                }
            }, 60);
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
.sh-sonarr-carousel {
    display: flex !important;
    flex-direction: row !important;
    overflow-x: auto !important;
    gap: 20px !important;
    padding: 14px 8px 28px 8px !important;
    scroll-behavior: smooth !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
    scroll-snap-type: x mandatory !important;
    width: 100% !important;
    -webkit-mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 64px), transparent 100%);
    mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 64px), transparent 100%);
}

.sh-sonarr-carousel::-webkit-scrollbar {
    display: none !important;
}

.sh-sonarr-bento-card {
    flex: 0 0 auto !important;
    width: 196px !important;
    scroll-snap-align: start !important;
    scroll-snap-stop: normal !important;
    display: flex !important;
    flex-direction: column !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 18px !important;
    padding: 8px !important;
    transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1) !important;
    position: relative !important;
    cursor: pointer !important;
}

@media (max-width: 768px) {
    .sh-sonarr-carousel {
        gap: 16px !important;
    }
    .sh-sonarr-bento-card {
        width: 150px !important;
    }
}

.sh-sonarr-bento-card:hover {
    background: rgba(255, 255, 255, 0.07) !important;
    border-color: rgba(255, 255, 255, 0.20) !important;
    transform: translateY(-4px) !important;
    box-shadow: 0 14px 35px rgba(0, 0, 0, 0.65) !important;
}

.sh-sonarr-bento-card__poster-wrap {
    position: relative !important;
    aspect-ratio: 2/3 !important;
    border-radius: 12px !important;
    overflow: hidden !important;
    background: rgba(0, 0, 0, 0.5) !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6) !important;
}

.sh-sonarr-bento-card__floating-badges {
    position: absolute !important;
    top: 6px !important;
    left: 6px !important;
    right: 6px !important;
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    pointer-events: none !important;
}

.sh-sonarr-pill-badge {
    padding: 3px 7px !important;
    border-radius: 6px !important;
    font-size: 10px !important;
    font-weight: 750 !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    letter-spacing: 0.02em !important;
}

.sh-sonarr-pill-badge--ep {
    background: rgba(0, 0, 0, 0.80) !important;
    color: #64d2ff !important;
    border: 1px solid rgba(100, 210, 255, 0.35) !important;
}

.sh-sonarr-pill-badge--date {
    background: rgba(0, 0, 0, 0.80) !important;
    color: #ffffff !important;
    border: 1px solid rgba(255, 255, 255, 0.18) !important;
}

.sh-sonarr-bento-card__body {
    padding: 10px 4px 4px 4px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 3px !important;
}

.sh-sonarr-bento-card__series-title {
    font-size: 13.5px !important;
    font-weight: 650 !important;
    color: #ffffff !important;
    margin: 0 !important;
    line-height: 1.3 !important;
}

.sh-sonarr-bento-card__ep-title {
    font-size: 11.5px !important;
    font-weight: 500 !important;
    color: rgba(255, 255, 255, 0.6) !important;
    margin: 0 !important;
}

.sh-sonarr-bento-card__time {
    font-size: 10.5px !important;
    font-weight: 600 !important;
    color: #32d74b !important;
    margin-top: 2px !important;
}

.sh-widget-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 36px 20px;
    text-align: center;
    color: rgba(255, 255, 255, 0.45);
    font-size: 13px;
}


.sh-sonarr-queue-row {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: background 150ms ease;
}
.sh-sonarr-queue-row:hover {
    background: rgba(255, 255, 255, 0.06);
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
                        <p style="color:rgba(255,255,255,0.4);">Chargement de la file d'attente...</p>
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
                contentEl.innerHTML = '<p style="color:rgba(255,255,255,0.4); text-align:center; padding:24px;">Sonarr non configuré.</p>';
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
                                    <span class="sh-truncate" style="font-weight:600; color:#ffffff;">${seriesTitle}${epTitle}</span>
                                    <span style="font-weight:700; color:#ffffff; font-size:12px; background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:9999px;">${progress}%</span>
                                </div>
                                <div style="height:4px; background:rgba(255,255,255,0.08); border-radius:9999px; overflow:hidden;">
                                    <div style="width:${progress}%; height:100%; background:#ffffff; border-radius:9999px;"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } catch (err) {
            contentEl.innerHTML = `<p style="color:#ff453a; text-align:center; padding:16px;">${err.message}</p>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export { UpcomingEpisodesWidget, SonarrQueueWidget };
