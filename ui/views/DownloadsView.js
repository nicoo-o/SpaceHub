/**
 * SpaceHub — Downloads & Media Hub View
 * Version: 1.0.0 (Apple VisionOS Glassmorphism)
 *
 * Centre de contrôle pleine page dédié aux flux multimédia & téléchargements :
 * - Hero Stats Banner en temps réel (Vitesse DL/UP globale, Torrents actifs, Demandes Jellyseerr, Sous-titres Bazarr)
 * - Navigation par onglets à ressort élastique (Liquid Spring Pill)
 * - Intégration complète des widgets qBittorrent, Jellyseerr, Sonarr, Radarr et Bazarr
 * - Animations fluides d'apparition et transitions sans rechargement
 */

'use strict';

import Logger from '../../core/Logger.js';
import UnifiedCalendarService from '../../jellyfin/calendar/UnifiedCalendarService.js';

import './DownloadsView.css';
import * as svc from '../../core/services.js';
class DownloadsView {
    constructor() {
        this._log = new Logger('DownloadsView');
        this._activeTab = 'qbit';
        this._renderId = 0;
        this._container = null;
        this._statsInterval = null;
        this._injectStyles();
    }

    /**
     * Rendu principal de la vue pleine page.
     * @param {HTMLElement} container
     * @param {Object} [params]
     */
    async render(container, params = {}) {
        const renderId = ++this._renderId;
        this.destroy();
        this._renderId = renderId;
        this._container = container;
        if (params.tab) this._activeTab = params.tab;

        container.innerHTML = `
            <div class="sh-downloads-view">
                <!-- En-tête Hero & Statistiques en Direct -->
                <header class="sh-downloads-hero">
                    <div class="sh-downloads-hero__content">
                        <div class="sh-downloads-hero__badge">
                            <span class="sh-pulse-dot"></span>
                            <span>CENTRE DE CONTRÔLE & FLUX EN DIRECT</span>
                        </div>
                        <h1 class="sh-downloads-hero__title">Centre de Contrôle & Flux</h1>
                        <p class="sh-downloads-hero__subtitle">Pilotez vos transferts qBittorrent, demandes Jellyseerr, calendriers Servarr et sous-titres en temps réel.</p>
                    </div>

                    <!-- Grille de métriques globales en direct -->
                    <div class="sh-downloads-metrics">
                        <div class="sh-metric-card" id="sh-metric-dl">
                            <div class="sh-metric-card__icon" style="color: #64d2ff; background: rgba(100, 210, 255, 0.28);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                            </div>
                            <div class="sh-metric-card__data">
                                <span class="sh-metric-card__label">RÉCEPTION</span>
                                <span class="sh-metric-card__val" id="sh-metric-dl-val">0 B/s</span>
                            </div>
                        </div>

                        <div class="sh-metric-card" id="sh-metric-up">
                            <div class="sh-metric-card__icon" style="color: #32d74b; background: rgba(50, 215, 75, 0.28);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                            </div>
                            <div class="sh-metric-card__data">
                                <span class="sh-metric-card__label">ÉMISSION</span>
                                <span class="sh-metric-card__val" id="sh-metric-up-val">0 B/s</span>
                            </div>
                        </div>

                        <div class="sh-metric-card" id="sh-metric-torrents">
                            <div class="sh-metric-card__icon" style="color: #bf5af2; background: rgba(191, 90, 242, 0.28);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </div>
                            <div class="sh-metric-card__data">
                                <span class="sh-metric-card__label">TORRENTS ACTIFS</span>
                                <span class="sh-metric-card__val" id="sh-metric-torrents-val">0</span>
                            </div>
                        </div>

                        <div class="sh-metric-card" id="sh-metric-requests">
                            <div class="sh-metric-card__icon" style="color: #ffd60a; background: rgba(255, 214, 10, 0.28);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                            </div>
                            <div class="sh-metric-card__data">
                                <span class="sh-metric-card__label">DEMANDES JELLYSEERR</span>
                                <span class="sh-metric-card__val" id="sh-metric-requests-val">0</span>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Barre de Navigation des Services (Liquid Spring Tab Bar) -->
                <nav class="sh-downloads-nav">
                    <div class="sh-downloads-nav__track">
                        <button tabindex="0" data-nav-focusable="true" class="sh-dl-tab-btn ${this._activeTab === 'qbit' ? 'active' : ''}" data-tab="qbit">
                            <span class="sh-dl-tab-icon">⚡</span>
                            <span>qBittorrent</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-dl-tab-btn ${this._activeTab === 'jellyseerr' ? 'active' : ''}" data-tab="jellyseerr">
                            <span class="sh-dl-tab-icon">🍿</span>
                            <span>Jellyseerr</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-dl-tab-btn ${this._activeTab === 'sonarr' ? 'active' : ''}" data-tab="sonarr">
                            <span class="sh-dl-tab-icon">📺</span>
                            <span>Séries (Sonarr)</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-dl-tab-btn ${this._activeTab === 'radarr' ? 'active' : ''}" data-tab="radarr">
                            <span class="sh-dl-tab-icon">🎬</span>
                            <span>Films (Radarr)</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-dl-tab-btn ${this._activeTab === 'bazarr' ? 'active' : ''}" data-tab="bazarr">
                            <span class="sh-dl-tab-icon">📝</span>
                            <span>Sous-titres (Bazarr)</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-dl-tab-btn ${this._activeTab === 'calendar' ? 'active' : ''}" data-tab="calendar">
                            <span class="sh-dl-tab-icon">📅</span>
                            <span>Calendrier Sorties</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-dl-tab-btn ${this._activeTab === 'health' ? 'active' : ''}" data-tab="health">
                            <span class="sh-dl-tab-icon">🩺</span>
                            <span>Santé Médiathèque</span>
                        </button>
                    </div>

                    <div class="sh-downloads-nav__actions">
                        <button tabindex="0" data-nav-focusable="true" class="sh-dl-action-btn" id="sh-dl-btn-refresh" title="Actualiser tous les flux">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            <span>Actualiser</span>
                        </button>
                    </div>
                </nav>

                <!-- Zone de Contenu du Service Actif -->
                <main class="sh-downloads-content" id="sh-downloads-content">
                    <div class="sh-dl-slot" id="sh-dl-slot-main"></div>
                    <div class="sh-dl-slot" id="sh-dl-slot-sub" style="margin-top: 24px;"></div>
                </main>
            </div>
        `;

        this._bindEvents();

        // Enregistrement formel du scope downloads
        const spatialNav = svc.nav() || svc.nav();
        if (spatialNav?.registerFocusables) {
            spatialNav.registerFocusables('downloads', (container) => {
                const root = container || document.querySelector('.sh-downloads-view') || document;
                return Array.from(root.querySelectorAll(
                    '.sh-dl-tab-btn, .sh-dl-action-btn, .sh-card, [data-nav-focusable="true"], .sh-jellyseerr-query-input, .sh-jellyseerr-clear-btn, .sh-jellyseerr-req-btn'
                ));
            }, { force: true }); // re-registration volontaire — cf. plan A04
        }

        await this._renderActiveTab();
        this._startLiveMetrics();
    }

    _bindEvents() {
        if (!this._container) return;

        this._container.querySelectorAll('.sh-dl-tab-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tab = e.currentTarget.dataset.tab;
                if (!tab || tab === this._activeTab) return;

                this._container.querySelectorAll('.sh-dl-tab-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this._activeTab = tab;
                await this._renderActiveTab();
            });
        });

        this._container.querySelector('#sh-dl-btn-refresh')?.addEventListener('click', async () => {
            await this._renderActiveTab();
            await this._updateMetrics();
            svc.toaster()?.info?.('Données actualisées avec succès.');
        });
    }

    async _renderActiveTab() {
        const slotMain = this._container?.querySelector('#sh-dl-slot-main');
        const slotSub = this._container?.querySelector('#sh-dl-slot-sub');
        if (!slotMain || !slotSub) return;

        slotMain.innerHTML = '<div class="sh-dl-loading"><div class="sh-dl-spinner"></div><p>Chargement des données...</p></div>';
        slotSub.innerHTML = '';

        const dashboard = svc.dashboard();

        try {
            if (this._activeTab === 'qbit') {
                const SpeedClass = dashboard?._registeredWidgets?.get('qbittorrent-speed');
                const ActiveClass = dashboard?._registeredWidgets?.get('qbittorrent-active');
                slotMain.innerHTML = '';
                if (SpeedClass) {
                    const speed = new SpeedClass();
                    await speed.render(slotMain);
                }
                if (ActiveClass) {
                    const active = new ActiveClass();
                    await active.render(slotSub);
                }
            } else if (this._activeTab === 'jellyseerr') {
                await this._renderJellyseerrTab(slotMain, slotSub);
            } else if (this._activeTab === 'sonarr') {
                const UpClass = dashboard?._registeredWidgets?.get('sonarr-upcoming');
                const QueueClass = dashboard?._registeredWidgets?.get('sonarr-queue');
                slotMain.innerHTML = '';
                if (UpClass) {
                    const up = new UpClass();
                    await up.render(slotMain);
                }
                if (QueueClass) {
                    const q = new QueueClass();
                    await q.render(slotSub);
                }
            } else if (this._activeTab === 'radarr') {
                const UpClass = dashboard?._registeredWidgets?.get('radarr-upcoming');
                const QueueClass = dashboard?._registeredWidgets?.get('radarr-queue');
                slotMain.innerHTML = '';
                if (UpClass) {
                    const up = new UpClass();
                    await up.render(slotMain);
                }
                if (QueueClass) {
                    const q = new QueueClass();
                    await q.render(slotSub);
                }
            } else if (this._activeTab === 'bazarr') {
                const BazClass = dashboard?._registeredWidgets?.get('bazarr-wanted');
                slotMain.innerHTML = '';
                if (BazClass) {
                    const baz = new BazClass();
                    await baz.render(slotMain);
                }
            } else if (this._activeTab === 'calendar') {
                await this._renderCalendarTab(slotMain, slotSub);
            } else if (this._activeTab === 'health') {
                await this._renderHealthTab(slotMain, slotSub);
            }
        } catch (err) {
            this._log.error(`Erreur rendu onglet ${this._activeTab}:`, err);
            slotMain.innerHTML = `
                <div class="sh-widget-error" style="padding: 30px; text-align: center;">
                    <p style="color: var(--sh-color-error, #ff453a);">Impossible de charger les données : ${this._escape(err?.message || 'Erreur inconnue')}</p>
                </div>
            `;
        }
    }

    /**
     * Rendu interactif de l'onglet Jellyseerr avec barre de recherche directe et demandes.
     */
    async _renderJellyseerrTab(slotMain, slotSub) {
        const dashboard = svc.dashboard();
        const api = svc.integration('jellyseerr')?.api;

        slotMain.innerHTML = `
            <!-- Panel de Recherche et Demande Directe Jellyseerr -->
            <div class="sh-jellyseerr-search-panel">
                <div class="sh-jellyseerr-search-bar">
                    <svg class="sh-jellyseerr-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" id="sh-jellyseerr-query-input" class="sh-jellyseerr-query-input" placeholder="Rechercher un film ou une série à demander sur Jellyseerr (TMDB)..." autocomplete="off" />
                    <button class="sh-jellyseerr-clear-btn" id="sh-jellyseerr-clear-btn" style="display:none;" title="Effacer">✕</button>
                </div>
                <div class="sh-jellyseerr-results-grid" id="sh-jellyseerr-results-grid" style="display:none;"></div>
            </div>

            <!-- Emplacement des Demandes Existantes -->
            <div id="sh-jellyseerr-requests-slot"></div>
        `;

        // Monter le widget des demandes en attente
        const reqSlot = slotMain.querySelector('#sh-jellyseerr-requests-slot');
        const ReqClass = dashboard?._registeredWidgets?.get('jellyseerr-requests');
        if (ReqClass && reqSlot) {
            const req = new ReqClass();
            await req.render(reqSlot);
        }

        // Monter l'ensemble des rayons de découverte Jellyseerr dans slotSub
        slotSub.innerHTML = `
            <div id="sh-jellyseerr-slot-trending"></div>
            <div id="sh-jellyseerr-slot-pop-movies" style="margin-top: 24px;"></div>
            <div id="sh-jellyseerr-slot-pop-series" style="margin-top: 24px;"></div>
            <div id="sh-jellyseerr-slot-upcoming" style="margin-top: 24px;"></div>
        `;

        const TrendClass = dashboard?._registeredWidgets?.get('jellyseerr-trending');
        const PopMovieClass = dashboard?._registeredWidgets?.get('jellyseerr-popular-movies');
        const PopSeriesClass = dashboard?._registeredWidgets?.get('jellyseerr-popular-series');
        const UpcomingClass = dashboard?._registeredWidgets?.get('jellyseerr-upcoming');

        const trendEl = slotSub.querySelector('#sh-jellyseerr-slot-trending');
        const popMovieEl = slotSub.querySelector('#sh-jellyseerr-slot-pop-movies');
        const popSeriesEl = slotSub.querySelector('#sh-jellyseerr-slot-pop-series');
        const upcomingEl = slotSub.querySelector('#sh-jellyseerr-slot-upcoming');

        if (TrendClass && trendEl) await (new TrendClass()).render(trendEl);
        if (PopMovieClass && popMovieEl) await (new PopMovieClass()).render(popMovieEl);
        if (PopSeriesClass && popSeriesEl) await (new PopSeriesClass()).render(popSeriesEl);
        if (UpcomingClass && upcomingEl) await (new UpcomingClass()).render(upcomingEl);

        // Binding de la recherche
        const input = slotMain.querySelector('#sh-jellyseerr-query-input');
        const clearBtn = slotMain.querySelector('#sh-jellyseerr-clear-btn');
        const resultsGrid = slotMain.querySelector('#sh-jellyseerr-results-grid');
        let debounceTimer = null;
        // P1 — AbortController : annule la requête en vol si l'utilisateur retape avant la réponse,
        // ce qui évite la race condition "réponse tardive de A écrase les résultats de AB".
        let _searchAbortController = null;

        const performSearch = async () => {
            const query = input?.value?.trim();
            if (!query) {
                resultsGrid.style.display = 'none';
                resultsGrid.innerHTML = '';
                if (clearBtn) clearBtn.style.display = 'none';
                return;
            }

            // Annuler la requête précédente encore en vol
            if (_searchAbortController) {
                _searchAbortController.abort();
            }
            _searchAbortController = new AbortController();
            const { signal } = _searchAbortController;

            if (clearBtn) clearBtn.style.display = 'block';
            resultsGrid.style.display = 'grid';
            resultsGrid.innerHTML = '<div class="sh-dl-loading" style="grid-column: 1/-1;"><div class="sh-dl-spinner"></div><p>Recherche en cours sur Jellyseerr...</p></div>';

            try {
                const res = await api?.search?.(query, { signal });
                // Si la requête a été annulée entre-temps, on ignore silencieusement le résultat
                if (signal.aborted) return;
                const items = res?.results || [];

                if (items.length === 0) {
                    // P0 — XSS : query (saisie utilisateur) échappée avant injection innerHTML
                    resultsGrid.innerHTML = `
                        <div class="sh-jellyseerr-empty" style="grid-column: 1/-1; text-align: center; padding: 30px; color: rgba(var(--sh-ink, 255, 255, 255), 0.6);">
                            <p>Aucun média trouvé pour "<strong>${this._escape(query)}</strong>" sur Jellyseerr.</p>
                        </div>
                    `;
                    return;
                }

                resultsGrid.innerHTML = items.slice(0, 12).map(item => {
                    const title = item.title || item.name || 'Média sans titre';
                    const year = (item.releaseDate || item.firstAirDate || '').substring(0, 4);
                    const poster = item.posterPath 
                        ? `https://image.tmdb.org/t/p/w300_and_h450_bestv2${item.posterPath}`
                        : '';
                    const type = item.mediaType === 'tv' ? 'Série' : 'Film';
                    const rating = item.voteAverage ? (item.voteAverage).toFixed(1) : null;
                    const overview = item.overview ? (item.overview.length > 100 ? item.overview.substring(0, 97) + '...' : item.overview) : '';
                    
                    const mediaStatus = item.mediaInfo?.status; // 5 = Available, 2 = Pending, 3 = Processing
                    let buttonHtml = `<button class="sh-jellyseerr-req-btn" data-id="${item.id}" data-type="${item.mediaType || 'movie'}" data-title="${encodeURIComponent(title)}">📥 Demander</button>`;
                    if (mediaStatus === 5) {
                        buttonHtml = `<span class="sh-jellyseerr-status-pill status-available">✅ Disponible</span>`;
                    } else if (mediaStatus === 2 || mediaStatus === 3) {
                        buttonHtml = `<span class="sh-jellyseerr-status-pill status-pending">⏳ En attente</span>`;
                    }

                    return `
                        <div class="sh-jellyseerr-card">
                            <div class="sh-jellyseerr-card__poster" style="${poster ? `background-image: url('${poster}');` : 'background: rgba(var(--sh-ink, 255, 255, 255), 0.06);'}">
                                <div class="sh-jellyseerr-card__badges">
                                    <span class="sh-jellyseerr-type-badge">${type}</span>
                                    ${year ? `<span class="sh-jellyseerr-year-badge">${year}</span>` : ''}
                                    ${rating ? `<span class="sh-jellyseerr-rating-badge">★ ${rating}</span>` : ''}
                                </div>
                            </div>
                            <div class="sh-jellyseerr-card__info">
                                <!-- P0 — XSS : title et overview (données API TMDB/Jellyseerr) échappés -->
                                <h4 class="sh-jellyseerr-card__title" title="${this._escape(title)}">${this._escape(title)}</h4>
                                <p class="sh-jellyseerr-card__overview">${this._escape(overview)}</p>
                                <div class="sh-jellyseerr-card__action">
                                    ${buttonHtml}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                // Handler boutons Demander
                resultsGrid.querySelectorAll('.sh-jellyseerr-req-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const mediaId = Number(btn.dataset.id);
                        const mediaType = btn.dataset.type || 'movie';
                        const mediaTitle = decodeURIComponent(btn.dataset.title);

                        btn.disabled = true;
                        btn.textContent = 'Envoi...';

                        try {
                            const reqPayload = {
                                mediaType: mediaType,
                                mediaId: mediaId,
                                seasons: mediaType === 'tv' ? 'all' : undefined
                            };
                            await api?.createRequest?.(reqPayload);
                            btn.className = 'sh-jellyseerr-status-pill status-pending';
                            btn.textContent = '✅ Demandé !';
                            svc.toaster()?.success(`Demande pour "${mediaTitle}" envoyée à Jellyseerr !`);
                        } catch (err) {
                            btn.disabled = false;
                            btn.textContent = 'Erreur';
                            svc.toaster()?.error(`Échec de la demande : ${err.message}`);
                        }
                    });
                });

            } catch (err) {
                // Ne pas afficher d'erreur si la requête a été volontairement annulée (AbortError)
                if (err?.name === 'AbortError') return;
                // P0 — XSS : err.message échappé (était direct précédemment)
                resultsGrid.innerHTML = `
                    <div class="sh-widget-error" style="grid-column: 1/-1; padding: 20px; text-align: center;">
                        <p style="color: var(--sh-color-error, #ff453a);">Erreur de recherche Jellyseerr : ${this._escape(err.message)}</p>
                    </div>
                `;
            }
        };

        input?.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(performSearch, 350);
        });

        clearBtn?.addEventListener('click', () => {
            if (input) input.value = '';
            performSearch();
        });
    }

    /**
     * 📅 Rendu du calendrier unifié complet avec double vue (Grille Mensuelle Physique & Liste Chronologique).
     */
    async _renderCalendarTab(slotMain, slotSub) {
        const settings = svc.settings();
        let currentViewMode = settings?.get('calendar.viewMode', 'grid');
        let currentFilter = settings?.get('calendar.filter', 'all');
        let displayedMonthDate = new Date();

        slotMain.innerHTML = `
            <div class="sh-calendar-full-panel">
                <!-- En-tête avec sélecteurs de Vue & Filtres -->
                <div class="sh-cal-header-bar">
                    <div class="sh-cal-header-title-block">
                        <div class="sh-cal-brand-tag">
                            <span class="sh-cal-live-dot"></span>
                            <span>SORTIES MÉDIAS UNIFIÉES</span>
                        </div>
                        <h2 class="sh-cal-main-title">Calendrier des Sorties</h2>
                    </div>

                    <div class="sh-cal-controls-row">
                        <!-- Sélecteur de Mode de Vue (Grille Mensuelle vs Liste) -->
                        <div class="sh-cal-pill-track" id="sh-cal-view-selector">
                            <button class="sh-cal-pill-btn ${currentViewMode === 'grid' ? 'active' : ''}" data-view="grid">
                                <span>📅 Grille Calendrier</span>
                            </button>
                            <button class="sh-cal-pill-btn ${currentViewMode === 'list' ? 'active' : ''}" data-view="list">
                                <span>📋 Chronologie</span>
                            </button>
                        </div>

                        <!-- Filtres Séries / Films -->
                        <div class="sh-cal-pill-track" id="sh-cal-filter-selector">
                            <button class="sh-cal-pill-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">Tous</button>
                            <button class="sh-cal-pill-btn ${currentFilter === 'episode' ? 'active' : ''}" data-filter="episode">📺 Séries</button>
                            <button class="sh-cal-pill-btn ${currentFilter === 'movie' ? 'active' : ''}" data-filter="movie">🎬 Films</button>
                        </div>
                    </div>
                </div>

                <!-- Zone de Contenu du Calendrier -->
                <div id="sh-cal-content-area" class="sh-cal-content-area">
                    <div class="sh-dl-loading">
                        <div class="sh-dl-spinner"></div>
                        <p>Chargement des sorties et du calendrier...</p>
                    </div>
                </div>
            </div>
        `;

        slotSub.innerHTML = '';

        try {
            const calService = new UnifiedCalendarService();
            // Charger 60 jours d'événements
            const startRange = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const endRange = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
            const allEvents = await calService.getEvents(startRange, endRange);

            const contentArea = slotMain.querySelector('#sh-cal-content-area');
            if (!contentArea) return;

            const renderCalendar = () => {
                const filteredEvents = currentFilter === 'all' 
                    ? allEvents 
                    : allEvents.filter(e => e.type === currentFilter);

                if (currentViewMode === 'grid') {
                    renderMonthGrid(filteredEvents);
                } else {
                    renderChronologicalList(filteredEvents);
                }
            };

            // ─── Vue 1 : Grille Calendrier Mensuel Interactif ─────────────────────
            const renderMonthGrid = (events) => {
                const year = displayedMonthDate.getFullYear();
                const month = displayedMonthDate.getMonth();

                const monthName = displayedMonthDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

                // Premier jour du mois et nombre de jours
                const firstDayOfMonth = new Date(year, month, 1);
                const lastDayOfMonth = new Date(year, month + 1, 0);
                const totalDaysInMonth = lastDayOfMonth.getDate();

                // Jour de la semaine du 1er (0 = Dimanche, transformé en 0 = Lundi)
                let startDayOfWeek = firstDayOfMonth.getDay() - 1;
                if (startDayOfWeek === -1) startDayOfWeek = 6; // Dimanche devient 6

                const todayObj = new Date();
                const isCurrentMonth = todayObj.getFullYear() === year && todayObj.getMonth() === month;
                const todayDateNum = isCurrentMonth ? todayObj.getDate() : -1;

                // Indexer les événements par jour
                const eventsByDay = {};
                events.forEach(ev => {
                    const d = ev.releaseDate;
                    if (d.getFullYear() === year && d.getMonth() === month) {
                        const dayNum = d.getDate();
                        if (!eventsByDay[dayNum]) eventsByDay[dayNum] = [];
                        eventsByDay[dayNum].push(ev);
                    }
                });

                let dayCellsHtml = '';

                // Cases vides avant le 1er du mois
                for (let i = 0; i < startDayOfWeek; i++) {
                    dayCellsHtml += `<div class="sh-cal-grid-cell empty"></div>`;
                }

                // Cases des jours du mois
                for (let day = 1; day <= totalDaysInMonth; day++) {
                    const isToday = day === todayDateNum;
                    const dayEvents = eventsByDay[day] || [];
                    const hasEvents = dayEvents.length > 0;

                    dayCellsHtml += `
                        <div class="sh-cal-grid-cell ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}" data-day="${day}">
                            <div class="sh-cal-cell-header">
                                <span class="sh-cal-cell-num ${isToday ? 'today-badge' : ''}">${day}</span>
                                ${hasEvents ? `<span class="sh-cal-cell-count">${dayEvents.length} sortie${dayEvents.length > 1 ? 's' : ''}</span>` : ''}
                            </div>
                            <div class="sh-cal-cell-events">
                                ${dayEvents.map(ev => {
                                    const isEp = ev.type === 'episode';
                                    const colorClass = isEp ? 'episode' : 'movie';
                                    return `
                                        <div class="sh-cal-event-chip ${colorClass}" data-event-id="${ev.id}" title="${ev.title} — ${ev.subTitle}">
                                            <span class="sh-cal-chip-icon">${isEp ? '📺' : '🎬'}</span>
                                            <span class="sh-cal-chip-title">${ev.title}</span>
                                            ${ev.hasFile ? '<span class="sh-cal-chip-dispo">✓</span>' : ''}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }

                contentArea.innerHTML = `
                    <div class="sh-cal-month-wrapper">
                        <!-- Barre de Navigation du Mois -->
                        <div class="sh-cal-month-nav-bar">
                            <div class="sh-cal-month-title-group">
                                <h3 class="sh-cal-month-title">${capitalizedMonth}</h3>
                                <button class="sh-cal-jump-today-btn" id="sh-cal-btn-jump-today">Aujourd'hui</button>
                            </div>
                            <div class="sh-cal-month-arrows">
                                <button class="sh-cal-arrow-btn" id="sh-cal-btn-prev-month" title="Mois précédent">◀</button>
                                <button class="sh-cal-arrow-btn" id="sh-cal-btn-next-month" title="Mois suivant">▶</button>
                            </div>
                        </div>

                        <!-- Grille des Jours de la Semaine -->
                        <div class="sh-cal-weekdays-header">
                            <span>LUN</span>
                            <span>MAR</span>
                            <span>MER</span>
                            <span>JEU</span>
                            <span>VEN</span>
                            <span>SAM</span>
                            <span>DIM</span>
                        </div>

                        <!-- Grille Mensuelle 7 Colonnes -->
                        <div class="sh-cal-month-grid">
                            ${dayCellsHtml}
                        </div>
                    </div>
                `;

                // Navigation des mois
                contentArea.querySelector('#sh-cal-btn-prev-month')?.addEventListener('click', () => {
                    displayedMonthDate = new Date(displayedMonthDate.getFullYear(), displayedMonthDate.getMonth() - 1, 1);
                    renderCalendar();
                });

                contentArea.querySelector('#sh-cal-btn-next-month')?.addEventListener('click', () => {
                    displayedMonthDate = new Date(displayedMonthDate.getFullYear(), displayedMonthDate.getMonth() + 1, 1);
                    renderCalendar();
                });

                contentArea.querySelector('#sh-cal-btn-jump-today')?.addEventListener('click', () => {
                    displayedMonthDate = new Date();
                    renderCalendar();
                });

                // Clic sur une pastille d'événement dans la grille
                contentArea.querySelectorAll('.sh-cal-event-chip').forEach(chip => {
                    chip.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const evId = chip.dataset.eventId;
                        const ev = allEvents.find(x => x.id === evId);
                        if (ev) openMediaModal(ev);
                    });
                });

                // Clic sur une case de jour ayant des sorties
                contentArea.querySelectorAll('.sh-cal-grid-cell.has-events').forEach(cell => {
                    cell.addEventListener('click', (e) => {
                        if (e.target.closest('.sh-cal-event-chip')) return;
                        const dayNum = parseInt(cell.dataset.day, 10);
                        const dayEvs = eventsByDay[dayNum];
                        if (dayEvs && dayEvs.length > 0) {
                            openMediaModal(dayEvs[0]);
                        }
                    });
                });
            };

            // ─── Vue 2 : Liste / Chronologie Détaillée ────────────────────────────
            const renderChronologicalList = (events) => {
                if (events.length === 0) {
                    contentArea.innerHTML = `
                        <div class="sh-cal-empty-state">
                            <p>Aucune sortie trouvée pour ce filtre.</p>
                        </div>
                    `;
                    return;
                }

                const grouped = calService.groupByDay(events);
                const todayStr = new Date().toISOString().split('T')[0];
                const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
                const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

                let html = '<div class="sh-cal-timeline-list">';
                grouped.forEach((dayEvents, dateStr) => {
                    const firstEv = dayEvents[0];
                    let dateTitle = '';
                    let isToday = false;

                    if (dateStr === todayStr) {
                        dateTitle = '🔴 Aujourd\'hui';
                        isToday = true;
                    } else if (dateStr === tomorrowStr) {
                        dateTitle = '🟠 Demain';
                    } else {
                        dateTitle = firstEv.releaseDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                        dateTitle = dateTitle.charAt(0).toUpperCase() + dateTitle.slice(1);
                    }

                    html += `
                        <div class="sh-cal-day-group ${isToday ? 'today' : ''}">
                            <div class="sh-cal-day-header">
                                <h3 class="sh-cal-day-title">${dateTitle}</h3>
                                <span class="sh-cal-day-counter">${dayEvents.length} sortie${dayEvents.length > 1 ? 's' : ''}</span>
                            </div>
                            <div class="sh-cal-cards-grid">
                                ${dayEvents.map(ev => {
                                    const posterImg = ev.posterUrl
                                        ? `<img decoding="async" src="${ev.posterUrl}" alt="${ev.title}" loading="lazy" class="sh-cal-card-img" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'50\\' height=\\'75\\' fill=\\'%23111\\'><rect width=\\'100%\\' height=\\'100%\\'/></svg>'"/>`
                                        : `<div class="sh-cal-card-placeholder">${ev.type === 'episode' ? '📺' : '🎬'}</div>`;

                                    const typePill = ev.type === 'episode'
                                        ? '<span class="sh-cal-badge-type ep">SÉRIE</span>'
                                        : '<span class="sh-cal-badge-type movie">FILM</span>';

                                    return `
                                        <div class="sh-cal-timeline-card" data-event-id="${ev.id}">
                                            ${posterImg}
                                            <div class="sh-cal-card-details">
                                                <div>
                                                    <div class="sh-cal-card-badge-row">
                                                        ${typePill}
                                                        ${ev.hasFile ? '<span class="sh-cal-badge-dispo">✓ Disponible</span>' : ''}
                                                    </div>
                                                    <strong class="sh-cal-card-name">${ev.title}</strong>
                                                    <small class="sh-cal-card-sub">${ev.subTitle}</small>
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                });
                html += '</div>';

                contentArea.innerHTML = html;

                // Clic sur les cartes de la timeline
                contentArea.querySelectorAll('.sh-cal-timeline-card').forEach(card => {
                    card.addEventListener('click', () => {
                        const evId = card.dataset.eventId;
                        const ev = allEvents.find(x => x.id === evId);
                        if (ev) openMediaModal(ev);
                    });
                });
            };

            const openMediaModal = (ev) => {
                if (!ev) return;
                console.log('[SpaceHub Calendar] Clic ouverture média:', ev);
                const relDate = ev.releaseDate instanceof Date ? ev.releaseDate : new Date(ev.releaseDate || Date.now());
                const modalData = {
                    Id: ev.id || ('sh-cal-' + Math.random().toString(36).substr(2, 9)),
                    id: ev.id,
                    Name: ev.title,
                    title: ev.title,
                    SeriesName: ev.type === 'episode' ? ev.title : undefined,
                    EpisodeTitle: ev.type === 'episode' ? ev.subTitle : undefined,
                    Overview: ev.overview || `${ev.title} — ${ev.subTitle}`,
                    overview: ev.overview || `${ev.title} — ${ev.subTitle}`,
                    ProductionYear: relDate ? relDate.getFullYear() : '',
                    year: relDate ? relDate.getFullYear() : '',
                    PremiereDate: relDate ? relDate.toISOString() : undefined,
                    Genres: [ev.subTitle || 'Sortie Média'],
                    Type: ev.type === 'episode' ? 'Episode' : 'Movie',
                    type: ev.type === 'episode' ? 'Episode' : 'Movie',
                    MediaType: 'Video',
                    imageUrl: ev.posterUrl,
                    posterUrl: ev.posterUrl,
                    ImageTags: { Primary: ev.posterUrl },
                    hasFile: Boolean(ev.hasFile),
                    source: ev.source || 'calendar',
                    network: ev.network || '',
                    studio: ev.studio || ''
                };

                const sheet = svc.slideUpSheet() || svc.slideUpSheet();
                if (sheet?.open) {
                    try {
                        sheet.open(modalData);
                        return;
                    } catch (err) {
                        console.error('[SpaceHub Calendar] Erreur modalSlideUpSheet:', err);
                    }
                }

                // Fallback Modal classique si besoin
                if (svc.modalClass()) {
                    const m = new (svc.modalClass())({
                        title: ev.title,
                        content: `
                            <div style="display: flex; gap: 20px; align-items: flex-start; padding: 14px 0;">
                                ${ev.posterUrl ? `<img decoding="async" src="${ev.posterUrl}" style="width: 120px; height: 180px; border-radius: 14px; object-fit: cover; box-shadow: 0 10px 30px rgba(0,0,0,0.6);" />` : ''}
                                <div style="display: flex; flex-direction: column; gap: 8px; flex: 1;">
                                    <h3 style="margin: 0; color: var(--sh-ink-solid, #ffffff); font-size: 18px; font-weight: 700;">${ev.title}</h3>
                                    <p style="margin: 0; color: #64d2ff; font-weight: 600; font-size: 13px;">${ev.subTitle}</p>
                                    <p style="margin: 4px 0; color: rgba(var(--sh-ink, 255, 255, 255), 0.75); font-size: 13px; line-height: 1.5;">${ev.overview || 'Sortie programmée dans votre médiathèque.'}</p>
                                    <div style="margin-top: 6px;">
                                        ${ev.hasFile ? '<span style="color: #30d158; font-weight: 700; font-size: 12px; background: rgba(48,209,88,0.31); padding: 4px 8px; border-radius: 6px;">✓ Déjà téléchargé et disponible</span>' : '<span style="color: #ff9f0a; font-weight: 700; font-size: 12px; background: rgba(255,159,10,0.31); padding: 4px 8px; border-radius: 6px;">⏳ En attente de diffusion / téléchargement</span>'}
                                    </div>
                                </div>
                            </div>
                        `,
                        buttons: [
                            { text: 'Fermer', type: 'secondary', onClick: (modal) => modal.close() }
                        ]
                    });
                    m.open();
                }
            };

            renderCalendar();

            // Câblage du Switcher de Vue (Grille vs Liste)
            slotMain.querySelectorAll('#sh-cal-view-selector .sh-cal-pill-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    slotMain.querySelectorAll('#sh-cal-view-selector .sh-cal-pill-btn').forEach(b => b.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    currentViewMode = e.currentTarget.dataset.view;
                    settings?.set('calendar.viewMode', currentViewMode);
                    renderCalendar();
                });
            });

            // Câblage des Filtres (Tous, Séries, Films)
            slotMain.querySelectorAll('#sh-cal-filter-selector .sh-cal-pill-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    slotMain.querySelectorAll('#sh-cal-filter-selector .sh-cal-pill-btn').forEach(b => b.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    currentFilter = e.currentTarget.dataset.filter;
                    settings?.set('calendar.filter', currentFilter);
                    renderCalendar();
                });
            });

        } catch (err) {
            slotMain.innerHTML = `<p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); padding:24px;">Erreur chargement calendrier : ${this._escape(err.message)}</p>`;
        }
    }

    /**
     * 🩺 Rendu de l'onglet Santé Médiathèque & Contrôle Qualité.
     */
    async _renderHealthTab(slotMain, slotSub) {
        slotMain.innerHTML = `
            <div class="sh-health-panel" style="background: rgba(var(--sh-ink, 255, 255, 255),  0.04); border: 1px solid rgba(var(--sh-ink, 255, 255, 255),  0.09); border-radius: 24px; padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <div>
                        <h2 style="font-size: 20px; font-weight: 700; color: var(--sh-ink-solid, #ffffff); margin: 0;">🩺 Santé & Contrôle Qualité de la Médiathèque</h2>
                        <p style="font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255),  0.55); margin: 4px 0 0 0;">Analyse des sous-titres manquants (Bazarr), résolutions inférieures à 1080p, et intégrité des saisons.</p>
                    </div>
                    <button id="sh-health-btn-rescan" style="background: var(--sh-ink-solid, #ffffff); border: none; color: var(--sh-ink-solid-inv, #000000); padding: 8px 16px; border-radius: 12px; font-size: 12px; font-weight: 700; cursor: pointer; transition: transform 160ms ease;">
                        Re-scanner la Santé
                    </button>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                    <!-- Carte 1 : Sous-titres Bazarr -->
                    <div style="background: rgba(var(--sh-ink, 255, 255, 255),  0.03); border: 1px solid rgba(var(--sh-ink, 255, 255, 255),  0.08); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; gap: 16px;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <span style="font-size: 22px;">📝</span>
                                <h3 style="font-size: 16px; font-weight: 600; color: var(--sh-ink-solid, #ffffff); margin: 0;">Sous-titres Français</h3>
                            </div>
                            <p id="sh-health-subtitles-desc" style="font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255),  0.6); margin: 0;">Vérification des manques dans Bazarr...</p>
                        </div>
                        <button id="sh-health-btn-subtitles" style="background: rgba(var(--sh-ink, 255, 255, 255),  0.10); border: 1px solid rgba(var(--sh-ink, 255, 255, 255),  0.16); color: var(--sh-ink-solid, #ffffff); padding: 8px 14px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer;">
                            Lancer Synchronisation Bazarr
                        </button>
                    </div>

                    <!-- Carte 2 : Qualité & Résolutions -->
                    <div style="background: rgba(var(--sh-ink, 255, 255, 255),  0.03); border: 1px solid rgba(var(--sh-ink, 255, 255, 255),  0.08); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; gap: 16px;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <span style="font-size: 22px;">💎</span>
                                <h3 style="font-size: 16px; font-weight: 600; color: var(--sh-ink-solid, #ffffff); margin: 0;">Résolution 4K UHD & 1080p</h3>
                            </div>
                            <p id="sh-health-quality-desc" style="font-size: 13px; color: rgba(var(--sh-ink, 255, 255, 255),  0.6); margin: 0;">Analyse de résolution non disponible sans interrogation de la médiathèque.</p>
                        </div>
                        <button id="sh-health-btn-upgrade" style="background: rgba(var(--sh-ink, 255, 255, 255),  0.10); border: 1px solid rgba(var(--sh-ink, 255, 255, 255),  0.16); color: var(--sh-ink-solid, #ffffff); padding: 8px 14px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer;">
                            Vérifier dans Radarr / Sonarr
                        </button>
                    </div>
                </div>
            </div>
        `;

        slotSub.innerHTML = '';

        // Charger l'état Bazarr. Les métriques de résolution restent inconnues tant qu'un
        // inventaire réel des médias n'a pas été demandé au serveur Jellyfin.
        const qualityDesc = slotMain.querySelector('#sh-health-quality-desc');
        if (qualityDesc) qualityDesc.textContent = 'Qualité : non analysée (aucune valeur déduite ou simulée).';
        try {
            const bazarr = svc.integration('bazarr');
            const summary = await bazarr?.getWantedSummary?.();
            const descEl = slotMain.querySelector('#sh-health-subtitles-desc');
            if (descEl) {
                const total = summary?.totalWanted ?? summary?.total ?? 0;
                descEl.textContent = total > 0
                    ? `⚠️ ${total} sous-titres français manquants détectés.`
                    : `🟢 Tous les sous-titres français sont à jour !`;
            }
        } catch (e) {
            // Silencieux
        }

        slotMain.querySelector('#sh-health-btn-subtitles')?.addEventListener('click', async () => {
            await svc.integration('bazarr')?.sync?.();
            svc.toaster()?.success?.('Recherche automatique de sous-titres lancée !');
        });

        slotMain.querySelector('#sh-health-btn-rescan')?.addEventListener('click', async () => {
            svc.toaster()?.info?.('Scan de santé en cours...');
            await this._renderHealthTab(slotMain, slotSub);
            svc.toaster()?.success?.('Scan de santé terminé.');
        });
    }

    _startLiveMetrics() {
        if (this._statsInterval) clearInterval(this._statsInterval);
        this._updateMetrics();
        this._statsInterval = setInterval(() => this._updateMetrics(), 6000);
    }

    async _updateMetrics() {
        if (!this._container) return;

        try {
            const qbit = svc.integration('qbittorrent');
            if (qbit?.getTransferStats) {
                const info = await qbit.getTransferStats();
                const dlEl = this._container.querySelector('#sh-metric-dl-val');
                const upEl = this._container.querySelector('#sh-metric-up-val');
                if (dlEl) dlEl.textContent = this._formatSpeed(info.dl_info_speed || 0);
                if (upEl) upEl.textContent = this._formatSpeed(info.up_info_speed || 0);
            }

            if (qbit?.getTorrents) {
                const torrents = await qbit.getTorrents('active');
                const torEl = this._container.querySelector('#sh-metric-torrents-val');
                if (torEl && Array.isArray(torrents)) torEl.textContent = String(torrents.length);
            }

            const jellyseerr = svc.integration('jellyseerr');
            if (jellyseerr?.getPendingRequests) {
                const requests = await jellyseerr.getPendingRequests();
                const reqEl = this._container.querySelector('#sh-metric-requests-val');
                if (reqEl && Array.isArray(requests)) reqEl.textContent = String(requests.length);
            }
        } catch (err) {
            // Silencieux
        }
    }

    _formatSpeed(bytesPerSec) {
        if (!bytesPerSec || bytesPerSec === 0) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
        return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    destroy() {
        this._renderId += 1;
        if (this._statsInterval) {
            clearInterval(this._statsInterval);
            this._statsInterval = null;
        }
        this._container = null;
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans DownloadsView.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default DownloadsView;
