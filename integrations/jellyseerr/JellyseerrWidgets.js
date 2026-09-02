import { escapeHtml } from '../../core/utils/domUtils.js';

import './JellyseerrWidgets.css';
import * as svc from '../../core/services.js';
/**
 * Ouvre le menu modal interactif de demande Jellyseerr avec profils et sélection de saisons.
 * @param {Object} item - Média TMDB/Jellyseerr
 * @param {Object} jellyseerr - Instance du service Jellyseerr
 */

/**
 * Ouvre le Hub Multimédia Complet de demande Jellyseerr (Remplacement Intégral de Jellyseerr).
 * @param {Object} item - Média TMDB/Jellyseerr
 * @param {Object} jellyseerr - Instance du service Jellyseerr
 */

/**
 * Ouvre le Hub Multimédia Complet Jellyseerr Grand Format (820px).
 * Vrais profils Sonarr/Radarr, Fiches épisodes riches avec photos et résumés, et Bandes-annonces.
 * @param {Object} item - Média TMDB/Jellyseerr
 * @param {Object} jellyseerr - Instance du service Jellyseerr
 */

/**
 * Ouvre le Hub Multimédia Panorama Cinéma Apple TV 4K (1200px Dual-Pane).
 * Look Premium VisionOS, Zéro Scrollbar visible, Vrais profils Sonarr/Radarr, Fiches épisodes riches et Bande-annonce In-App.
 * @param {Object} item - Média TMDB/Jellyseerr
 * @param {Object} jellyseerr - Instance du service Jellyseerr
 */

/**
 * Ouvre le Média Jellyseerr dans la feuille maîtresse Apple TV ModalSlideUpSheet.
 * @param {Object} item - Média TMDB/Jellyseerr
 * @param {Object} [jellyseerr] - Instance API
 */
function openJellyseerrRequestModal(item, jellyseerr) {
    const tmdbId = item.id || item.tmdbId || item.mediaId || (typeof item.Id === 'string' ? item.Id.replace('jellyseerr-', '') : null);
    const rawType = (item.mediaType || item.Type || item.type || '').toLowerCase();
    const isTv = rawType === 'tv' || rawType === 'series' || rawType === 'tvshow' || Boolean(item.firstAirDate) || Boolean(item.name && !item.title) || Boolean(item.seasons) || item.isSeries;
    const type = isTv ? 'tv' : 'movie';
    const title = item.title || item.name || item.Name || 'Média';
    const poster = item.posterPath ? (item.posterPath.startsWith('http') ? item.posterPath : `https://image.tmdb.org/t/p/w500${item.posterPath}`) : (item.poster || item.posterUrl || item.imageUrl || '');
    const backdrop = item.backdropPath ? (item.backdropPath.startsWith('http') ? item.backdropPath : `https://image.tmdb.org/t/p/w1280${item.backdropPath}`) : (item.backdropUrl || poster);
    const year = (item.releaseDate || item.firstAirDate || item.year || item.ProductionYear || '').slice(0, 4);
    const overview = item.overview || item.Overview || '';

    const formattedItem = {
        ...item,
        Id: `jellyseerr-${tmdbId}`,
        id: tmdbId,
        tmdbId: tmdbId,
        Name: title,
        title: title,
        Type: type === 'tv' ? 'Series' : 'Movie',
        isSeries: type === 'tv',
        isMovie: type === 'movie',
        posterUrl: poster,
        imageUrl: poster,
        backdropUrl: backdrop,
        Overview: overview,
        overview: overview,
        ProductionYear: year,
        year: year,
        isJellyseerr: true,
        source: 'jellyseerr'
    };

    if (svc.slideUpSheet()) {
        svc.slideUpSheet().open(formattedItem);
    } else {
        console.warn('[Jellyseerr] ModalSlideUpSheet non encore initialisé');
    }
}


/**
 * SpaceHub — Jellyseerr Dashboard & Discovery Widgets
 * Version: 1.0.0 (Apple VisionOS Glass Bento)
 *
 * Widgets multimédias connectés à l'API Jellyseerr / Overseerr :
 * 1. JellyseerrTrendingWidget : Tendances & Découvertes globales (Films & Séries)
 * 2. JellyseerrPopularMoviesWidget : Films Populaires en streaming
 * 3. JellyseerrPopularSeriesWidget : Séries & Nouveautés TV populaires
 * 4. JellyseerrUpcomingWidget : Sorties très attendues prochainement
 * 5. JellyseerrRequestsWidget : Hub d'approbation et gestion des demandes
 */

'use strict';

/**
 * Génère le balisage HTML d'une carte média Jellyseerr avec design VisionOS.
 * @param {Object} item - Média TMDB/Jellyseerr
 * @returns {string} HTML string
 */
function renderJellyseerrMediaCard(item) {
    const title = item.title || item.name || 'Média';
    const safeTitle = escapeHtml(title);
    const poster = item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : '';
    const safePoster = /^https?:\/\//i.test(poster) ? escapeHtml(poster) : '';
    const rawType = (item.mediaType || item.Type || item.type || '').toLowerCase();
    const isTv = rawType === 'tv' || rawType === 'series' || rawType === 'tvshow' || Boolean(item.firstAirDate) || Boolean(item.name && !item.title) || Boolean(item.seasons) || item.isSeries;
    const type = isTv ? 'tv' : 'movie';
    const typeLabel = type === 'tv' ? 'Série' : 'Film';
    const dateStr = item.releaseDate || item.firstAirDate;
    const year = dateStr ? new Date(dateStr).getFullYear() : '';
    const rating = item.voteAverage ? Number(item.voteAverage).toFixed(1) : null;

    return `

        <div tabindex="0" data-nav-focusable="true" data-nav-role="card" data-nav-scope="jellyseerr" class="sh-jellyseerr-bento-card" data-media-id="${escapeHtml(String(item.id ?? ''))}" data-media-type="${type}" data-overview="${escapeHtml(encodeURIComponent(item.overview || ''))}">
            <div class="sh-jellyseerr-bento-card__poster-wrap">
                ${safePoster
                    ? `<img class="sh-jellyseerr-bento-card__img" src="${safePoster}" alt="${safeTitle}" loading="lazy" />`
                    : `<div class="sh-jellyseerr-bento-card__placeholder">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.8"><rect width="20" height="20" x="2" y="2" rx="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
                       </div>`}
                
                <div class="sh-jellyseerr-bento-card__floating-badges">
                    <span class="sh-jellyseerr-pill-badge sh-jellyseerr-pill-badge--type">${typeLabel}</span>
                    ${rating ? `<span class="sh-jellyseerr-pill-badge sh-jellyseerr-pill-badge--rating">⭐ ${escapeHtml(rating)}</span>` : ''}
                </div>
            </div>

            <div class="sh-jellyseerr-bento-card__body">
                <div class="sh-jellyseerr-bento-card__meta">
                    <h4 class="sh-jellyseerr-bento-card__title sh-truncate" title="${safeTitle}">${safeTitle}</h4>
                    <span class="sh-jellyseerr-bento-card__year">${year ? escapeHtml(year) : typeLabel}</span>
                </div>

                <button tabindex="0" data-nav-focusable="true" class="sh-jellyseerr-req-action-btn" data-type="${escapeHtml(type)}" data-id="${escapeHtml(String(item.id ?? ''))}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span>Demander</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Attache les écouteurs de demande rapide sur les boutons d'un conteneur.
 * @param {HTMLElement} container
 * @param {Object} jellyseerr
 */
function bindJellyseerrRequestButtons(container, jellyseerr) {
    // Clic sur la carte entière pour ouvrir dans ModalSlideUpSheet Apple TV
    container.querySelectorAll('.sh-jellyseerr-bento-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.sh-jellyseerr-req-action-btn')) return;
            const mediaId = card.dataset.mediaId;
            const mediaType = card.dataset.mediaType;
            const title = card.querySelector('.sh-jellyseerr-bento-card__title')?.textContent || 'Média';
            const posterImg = card.querySelector('.sh-jellyseerr-bento-card__img')?.src || '';
            const year = card.querySelector('.sh-jellyseerr-bento-card__year')?.textContent || '';

            let overviewText = '';
            try { overviewText = decodeURIComponent(card.dataset.overview || ''); } catch (e) { overviewText = card.dataset.overview || ''; }

            openJellyseerrRequestModal({
                id: mediaId,
                title,
                mediaType,
                posterPath: posterImg,
                releaseDate: year,
                overview: overviewText
            }, jellyseerr);
        });
    });

    container.querySelectorAll('.sh-jellyseerr-req-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const type = btn.dataset.type;
            const id = btn.dataset.id;
            btn.disabled = true;
            btn.innerHTML = `<span class="sh-spinner-inline"></span><span>Envoi...</span>`;
            
            try {
                await jellyseerr.requestMedia(type, id);
                btn.classList.add('requested');
                btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Demandé</span>`;
                svc.toaster()?.success(`Demande transmise à Jellyseerr !`);
            } catch (err) {
                btn.disabled = false;
                btn.innerHTML = `<span>Réessayer</span>`;
                svc.toaster()?.error(`Erreur: ${escapeHtml(err.message)}`);
            }
        });
    });
}

function injectJellyseerrSharedStyles() {
    // Les styles de ce composant vivent désormais dans JellyseerrWidgets.css,
    // importé en haut du fichier et empaqueté par Vite. Cette méthode est
    // conservée en no-op pour ne casser aucun appelant existant.
}

// ─── 1. Widget Tendances & Découverte ─────────────────────────────────────────
class JellyseerrTrendingWidget {
    constructor() {
        this.id = 'jellyseerr-trending';
        this.title = 'Tendances & Découverte (Jellyseerr)';
        this.defaultColSpan = 12;
    }

    async render(container) {

        // Le scope de navigation TV "jellyseerr" est déjà défini de façon confinée
        // dans core/SpatialNavigation.js (_initializeDefaultScopes). Ne pas le
        // réenregistrer ici — cf. audit §1.3 (bug root || ... qui cassait le confinement).


        container.innerHTML = `
            <div class="sh-widget sh-widget--jellyseerr-trending">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-widget__refresh-btn" title="Rafraîchir les tendances">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding: 14px 8px;">Chargement des tendances...</p>
                    </div>
                </div>
            </div>
        `;

        injectJellyseerrSharedStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = svc.integration('jellyseerr')?.api;
            if (!jellyseerr) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Jellyseerr non configuré.</p></div>';
                return;
            }

            const items = await jellyseerr.getTrendingMedia();
            if (!items || items.length === 0) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Aucun média tendance disponible.</p></div>';
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-card-grid sh-card-grid--poster sh-jellyseerr-carousel">
                    ${items.slice(0, 20).map(item => renderJellyseerrMediaCard(item)).join('')}
                </div>
            `;
            bindJellyseerrRequestButtons(contentEl, jellyseerr);

            setTimeout(() => {
                const carousel = contentEl.querySelector('.sh-jellyseerr-carousel');
                if (carousel && svc.gooeyScroller()) {
                    svc.gooeyScroller().attach(carousel);
                }
            }, 60);
        } catch (err) {
            contentEl.innerHTML = `<div class="sh-widget-empty"><p>Erreur: ${escapeHtml(err.message)}</p></div>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

// ─── 2. Widget Films Populaires ───────────────────────────────────────────────
class JellyseerrPopularMoviesWidget {
    constructor() {
        this.id = 'jellyseerr-popular-movies';
        this.title = 'Films Populaires (Jellyseerr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--jellyseerr-popular-movies">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-widget__refresh-btn" title="Rafraîchir les films populaires">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding: 14px 8px;">Chargement des films populaires...</p>
                    </div>
                </div>
            </div>
        `;

        injectJellyseerrSharedStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = svc.integration('jellyseerr')?.api;
            if (!jellyseerr) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Jellyseerr non configuré.</p></div>';
                return;
            }

            const items = await jellyseerr.getPopularMoviesList();
            if (!items || items.length === 0) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Aucun film populaire disponible.</p></div>';
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-card-grid sh-card-grid--poster sh-jellyseerr-carousel">
                    ${items.slice(0, 20).map(item => renderJellyseerrMediaCard(item)).join('')}
                </div>
            `;
            bindJellyseerrRequestButtons(contentEl, jellyseerr);

            setTimeout(() => {
                const carousel = contentEl.querySelector('.sh-jellyseerr-carousel');
                if (carousel && svc.gooeyScroller()) {
                    svc.gooeyScroller().attach(carousel);
                }
            }, 60);
        } catch (err) {
            contentEl.innerHTML = `<div class="sh-widget-empty"><p>Erreur: ${escapeHtml(err.message)}</p></div>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

// ─── 3. Widget Séries Populaires ──────────────────────────────────────────────
class JellyseerrPopularSeriesWidget {
    constructor() {
        this.id = 'jellyseerr-popular-series';
        this.title = 'Séries Populaires & Nouveautés TV (Jellyseerr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--jellyseerr-popular-series">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-widget__refresh-btn" title="Rafraîchir les séries populaires">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding: 14px 8px;">Chargement des séries populaires...</p>
                    </div>
                </div>
            </div>
        `;

        injectJellyseerrSharedStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = svc.integration('jellyseerr')?.api;
            if (!jellyseerr) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Jellyseerr non configuré.</p></div>';
                return;
            }

            const items = await jellyseerr.getPopularSeriesList();
            if (!items || items.length === 0) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Aucune série populaire disponible.</p></div>';
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-card-grid sh-card-grid--poster sh-jellyseerr-carousel">
                    ${items.slice(0, 20).map(item => renderJellyseerrMediaCard(item)).join('')}
                </div>
            `;
            bindJellyseerrRequestButtons(contentEl, jellyseerr);

            setTimeout(() => {
                const carousel = contentEl.querySelector('.sh-jellyseerr-carousel');
                if (carousel && svc.gooeyScroller()) {
                    svc.gooeyScroller().attach(carousel);
                }
            }, 60);
        } catch (err) {
            contentEl.innerHTML = `<div class="sh-widget-empty"><p>Erreur: ${escapeHtml(err.message)}</p></div>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

// ─── 4. Widget Sorties Très Attendues ─────────────────────────────────────────
class JellyseerrUpcomingWidget {
    constructor() {
        this.id = 'jellyseerr-upcoming';
        this.title = 'Sorties Très Attendues (Jellyseerr)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--jellyseerr-upcoming">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-widget__refresh-btn" title="Rafraîchir les sorties à venir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding: 14px 8px;">Chargement des prochaines sorties...</p>
                    </div>
                </div>
            </div>
        `;

        injectJellyseerrSharedStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = svc.integration('jellyseerr')?.api;
            if (!jellyseerr) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Jellyseerr non configuré.</p></div>';
                return;
            }

            const items = await jellyseerr.getUpcomingMediaList();
            if (!items || items.length === 0) {
                contentEl.innerHTML = '<div class="sh-widget-empty"><p>Aucune sortie prévue disponible.</p></div>';
                return;
            }

            contentEl.innerHTML = `
                <div class="sh-card-grid sh-card-grid--poster sh-jellyseerr-carousel">
                    ${items.slice(0, 20).map(item => renderJellyseerrMediaCard(item)).join('')}
                </div>
            `;
            bindJellyseerrRequestButtons(contentEl, jellyseerr);

            setTimeout(() => {
                const carousel = contentEl.querySelector('.sh-jellyseerr-carousel');
                if (carousel && svc.gooeyScroller()) {
                    svc.gooeyScroller().attach(carousel);
                }
            }, 60);
        } catch (err) {
            contentEl.innerHTML = `<div class="sh-widget-empty"><p>Erreur: ${escapeHtml(err.message)}</p></div>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

// ─── 5. Widget Demandes de Médias (Requests) ──────────────────────────────────
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
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-widget__refresh-btn" title="Rafraîchir les demandes">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:var(--sh-text-muted);">Chargement des demandes...</p>
                    </div>
                </div>
            </div>
        `;

        injectJellyseerrSharedStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const jellyseerr = svc.integration('jellyseerr')?.api;
            if (!jellyseerr) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <p>Jellyseerr n'est pas configuré. Rendez-vous dans les réglages SpaceHub pour renseigner l'URL et la clé API.</p>
                    </div>
                `;
                return;
            }

            const res = await jellyseerr.getRequests(20, 0, 'pending');
            const requests = res?.results || [];

            if (!requests || requests.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <p>Aucune demande en attente. Vos utilisateurs sont comblés !</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${requests.map(req => {
                        const media = req.media || {};
                        const user = req.requestedBy || {};
                        const title = media.title || media.name || `Média #${req.id}`;
                        const poster = media.posterPath ? `https://image.tmdb.org/t/p/w200${media.posterPath}` : '';

                        return `
                            <div class="sh-jellyseerr-request-card" data-request-id="${req.id}" style="display: flex; align-items: center; gap: 14px; background: rgba(var(--sh-ink, 255, 255, 255),  0.03); border: 1px solid rgba(var(--sh-ink, 255, 255, 255),  0.07); border-radius: 14px; padding: 10px 14px;">
                                <div class="sh-jellyseerr-request-card__poster" style="width: 44px; height: 66px; flex-shrink: 0; border-radius: 8px; overflow: hidden; background: rgba(var(--sh-ink-inv, 0, 0, 0.16), 0.3);">
                                    ${poster ? `<img src="${poster}" alt="${title}" style="width:100%; height:100%; object-fit:cover;" loading="lazy"/>` : '<div class="sh-placeholder" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.18);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg></div>'}
                                </div>
                                <div class="sh-jellyseerr-request-card__details" style="flex:1;">
                                    <h4 class="sh-jellyseerr-request-card__title sh-truncate" style="margin:0 0 4px 0; color:var(--sh-ink-solid, #ffffff); font-size:14px;">${title}</h4>
                                    <p class="sh-jellyseerr-request-card__user" style="margin:0; font-size:11.5px; color:rgba(var(--sh-ink, 255, 255, 255), 0.5);">Demandé par <strong style="color:rgba(var(--sh-ink, 255, 255, 255), 0.85);">${user.displayName || user.email || 'Utilisateur'}</strong></p>
                                </div>
                                <div style="display:flex; gap:8px;">
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
            contentEl.innerHTML = `<div class="sh-widget-empty"><p>Erreur: ${escapeHtml(err.message)}</p></div>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export { 
    JellyseerrRequestsWidget, 
    JellyseerrTrendingWidget, 
    JellyseerrPopularMoviesWidget, 
    JellyseerrPopularSeriesWidget, 
    JellyseerrUpcomingWidget 
};


if (typeof window !== 'undefined') {
    window.SpaceHub = window.SpaceHub || {};
    window.SpaceHub.integrations = window.SpaceHub.integrations || {};
    window.SpaceHub.integrations.jellyseerr = svc.integration('jellyseerr') || {};
    svc.integration('jellyseerr').openRequestModal = openJellyseerrRequestModal;
}
