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
                            <div class="sh-metric-card__icon" style="color: #64d2ff; background: rgba(100, 210, 255, 0.12);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                            </div>
                            <div class="sh-metric-card__data">
                                <span class="sh-metric-card__label">RÉCEPTION</span>
                                <span class="sh-metric-card__val" id="sh-metric-dl-val">0 B/s</span>
                            </div>
                        </div>

                        <div class="sh-metric-card" id="sh-metric-up">
                            <div class="sh-metric-card__icon" style="color: #32d74b; background: rgba(50, 215, 75, 0.12);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                            </div>
                            <div class="sh-metric-card__data">
                                <span class="sh-metric-card__label">ÉMISSION</span>
                                <span class="sh-metric-card__val" id="sh-metric-up-val">0 B/s</span>
                            </div>
                        </div>

                        <div class="sh-metric-card" id="sh-metric-torrents">
                            <div class="sh-metric-card__icon" style="color: #bf5af2; background: rgba(191, 90, 242, 0.12);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </div>
                            <div class="sh-metric-card__data">
                                <span class="sh-metric-card__label">TORRENTS ACTIFS</span>
                                <span class="sh-metric-card__val" id="sh-metric-torrents-val">0</span>
                            </div>
                        </div>

                        <div class="sh-metric-card" id="sh-metric-requests">
                            <div class="sh-metric-card__icon" style="color: #ffd60a; background: rgba(255, 214, 10, 0.12);">
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
        const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
        if (spatialNav?.registerFocusables) {
            spatialNav.registerFocusables('downloads', (container) => {
                const root = container || document.querySelector('.sh-downloads-view') || document;
                return Array.from(root.querySelectorAll(
                    '.sh-dl-tab-btn, .sh-dl-action-btn, .sh-card, [data-nav-focusable="true"], .sh-jellyseerr-query-input, .sh-jellyseerr-clear-btn, .sh-jellyseerr-req-btn'
                ));
            });
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
            window.SpaceHub?.ui?.components?.toaster?.info?.('Données actualisées avec succès.');
        });
    }

    async _renderActiveTab() {
        const slotMain = this._container?.querySelector('#sh-dl-slot-main');
        const slotSub = this._container?.querySelector('#sh-dl-slot-sub');
        if (!slotMain || !slotSub) return;

        slotMain.innerHTML = '<div class="sh-dl-loading"><div class="sh-dl-spinner"></div><p>Chargement des données...</p></div>';
        slotSub.innerHTML = '';

        const dashboard = window.SpaceHub?.ui?.dashboard;

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
        const dashboard = window.SpaceHub?.ui?.dashboard;
        const api = window.SpaceHub?.integrations?.jellyseerr?.api;

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

        const performSearch = async () => {
            const query = input?.value?.trim();
            if (!query) {
                resultsGrid.style.display = 'none';
                resultsGrid.innerHTML = '';
                if (clearBtn) clearBtn.style.display = 'none';
                return;
            }

            if (clearBtn) clearBtn.style.display = 'block';
            resultsGrid.style.display = 'grid';
            resultsGrid.innerHTML = '<div class="sh-dl-loading" style="grid-column: 1/-1;"><div class="sh-dl-spinner"></div><p>Recherche en cours sur Jellyseerr...</p></div>';

            try {
                const res = await api?.search?.(query);
                const items = res?.results || [];

                if (items.length === 0) {
                    resultsGrid.innerHTML = `
                        <div class="sh-jellyseerr-empty" style="grid-column: 1/-1; text-align: center; padding: 30px; color: rgba(255,255,255,0.6);">
                            <p>Aucun média trouvé pour "<strong>${query}</strong>" sur Jellyseerr.</p>
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
                            <div class="sh-jellyseerr-card__poster" style="${poster ? `background-image: url('${poster}');` : 'background: rgba(255,255,255,0.06);'}">
                                <div class="sh-jellyseerr-card__badges">
                                    <span class="sh-jellyseerr-type-badge">${type}</span>
                                    ${year ? `<span class="sh-jellyseerr-year-badge">${year}</span>` : ''}
                                    ${rating ? `<span class="sh-jellyseerr-rating-badge">★ ${rating}</span>` : ''}
                                </div>
                            </div>
                            <div class="sh-jellyseerr-card__info">
                                <h4 class="sh-jellyseerr-card__title" title="${title}">${title}</h4>
                                <p class="sh-jellyseerr-card__overview">${overview}</p>
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
                            window.SpaceHub?.ui?.components?.toaster?.success(`Demande pour "${mediaTitle}" envoyée à Jellyseerr !`);
                        } catch (err) {
                            btn.disabled = false;
                            btn.textContent = 'Erreur';
                            window.SpaceHub?.ui?.components?.toaster?.error(`Échec de la demande : ${err.message}`);
                        }
                    });
                });

            } catch (err) {
                resultsGrid.innerHTML = `
                    <div class="sh-widget-error" style="grid-column: 1/-1; padding: 20px; text-align: center;">
                        <p style="color: var(--sh-color-error, #ff453a);">Erreur de recherche Jellyseerr : ${err.message}</p>
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
        const settings = window.SpaceHub?.core?.settings;
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
                                        ? `<img src="${ev.posterUrl}" alt="${ev.title}" loading="lazy" class="sh-cal-card-img" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'50\\' height=\\'75\\' fill=\\'%23111\\'><rect width=\\'100%\\' height=\\'100%\\'/></svg>'"/>`
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

                const sheet = window.SpaceHub?.ui?.modalSlideUpSheet || window.SpaceHub?.ui?.components?.modalSlideUpSheet;
                if (sheet?.open) {
                    try {
                        sheet.open(modalData);
                        return;
                    } catch (err) {
                        console.error('[SpaceHub Calendar] Erreur modalSlideUpSheet:', err);
                    }
                }

                // Fallback Modal classique si besoin
                if (window.SpaceHub?.ui?.components?.Modal) {
                    const m = new window.SpaceHub.ui.components.Modal({
                        title: ev.title,
                        content: `
                            <div style="display: flex; gap: 20px; align-items: flex-start; padding: 14px 0;">
                                ${ev.posterUrl ? `<img src="${ev.posterUrl}" style="width: 120px; height: 180px; border-radius: 14px; object-fit: cover; box-shadow: 0 10px 30px rgba(0,0,0,0.6);" />` : ''}
                                <div style="display: flex; flex-direction: column; gap: 8px; flex: 1;">
                                    <h3 style="margin: 0; color: #fff; font-size: 18px; font-weight: 700;">${ev.title}</h3>
                                    <p style="margin: 0; color: #64d2ff; font-weight: 600; font-size: 13px;">${ev.subTitle}</p>
                                    <p style="margin: 4px 0; color: rgba(255,255,255,0.75); font-size: 13px; line-height: 1.5;">${ev.overview || 'Sortie programmée dans votre médiathèque.'}</p>
                                    <div style="margin-top: 6px;">
                                        ${ev.hasFile ? '<span style="color: #30d158; font-weight: 700; font-size: 12px; background: rgba(48,209,88,0.15); padding: 4px 8px; border-radius: 6px;">✓ Déjà téléchargé et disponible</span>' : '<span style="color: #ff9f0a; font-weight: 700; font-size: 12px; background: rgba(255,159,10,0.15); padding: 4px 8px; border-radius: 6px;">⏳ En attente de diffusion / téléchargement</span>'}
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
            slotMain.innerHTML = `<p style="color:rgba(255,255,255,0.4); padding:24px;">Erreur chargement calendrier : ${this._escape(err.message)}</p>`;
        }
    }

    /**
     * 🩺 Rendu de l'onglet Santé Médiathèque & Contrôle Qualité.
     */
    async _renderHealthTab(slotMain, slotSub) {
        slotMain.innerHTML = `
            <div class="sh-health-panel" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 24px; padding: 24px; backdrop-filter: blur(24px);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <div>
                        <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0;">🩺 Santé & Contrôle Qualité de la Médiathèque</h2>
                        <p style="font-size: 13px; color: rgba(255, 255, 255, 0.55); margin: 4px 0 0 0;">Analyse des sous-titres manquants (Bazarr), résolutions inférieures à 1080p, et intégrité des saisons.</p>
                    </div>
                    <button id="sh-health-btn-rescan" style="background: #ffffff; border: none; color: #000; padding: 8px 16px; border-radius: 12px; font-size: 12px; font-weight: 700; cursor: pointer; transition: transform 160ms ease;">
                        Re-scanner la Santé
                    </button>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                    <!-- Carte 1 : Sous-titres Bazarr -->
                    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; gap: 16px;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <span style="font-size: 22px;">📝</span>
                                <h3 style="font-size: 16px; font-weight: 600; color: #ffffff; margin: 0;">Sous-titres Français</h3>
                            </div>
                            <p id="sh-health-subtitles-desc" style="font-size: 13px; color: rgba(255, 255, 255, 0.6); margin: 0;">Vérification des manques dans Bazarr...</p>
                        </div>
                        <button id="sh-health-btn-subtitles" style="background: rgba(255, 255, 255, 0.10); border: 1px solid rgba(255, 255, 255, 0.16); color: #ffffff; padding: 8px 14px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer;">
                            Lancer Synchronisation Bazarr
                        </button>
                    </div>

                    <!-- Carte 2 : Qualité & Résolutions -->
                    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; gap: 16px;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <span style="font-size: 22px;">💎</span>
                                <h3 style="font-size: 16px; font-weight: 600; color: #ffffff; margin: 0;">Résolution 4K UHD & 1080p</h3>
                            </div>
                            <p id="sh-health-quality-desc" style="font-size: 13px; color: rgba(255, 255, 255, 0.6); margin: 0;">Analyse de résolution non disponible sans interrogation de la médiathèque.</p>
                        </div>
                        <button id="sh-health-btn-upgrade" style="background: rgba(255, 255, 255, 0.10); border: 1px solid rgba(255, 255, 255, 0.16); color: #ffffff; padding: 8px 14px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer;">
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
            const bazarr = window.SpaceHub?.integrations?.bazarr;
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
            await window.SpaceHub?.integrations?.bazarr?.sync?.();
            window.SpaceHub?.ui?.components?.toaster?.success?.('Recherche automatique de sous-titres lancée !');
        });

        slotMain.querySelector('#sh-health-btn-rescan')?.addEventListener('click', async () => {
            window.SpaceHub?.ui?.components?.toaster?.info?.('Scan de santé en cours...');
            await this._renderHealthTab(slotMain, slotSub);
            window.SpaceHub?.ui?.components?.toaster?.success?.('Scan de santé terminé.');
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
            const qbit = window.SpaceHub?.integrations?.qbittorrent;
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

            const jellyseerr = window.SpaceHub?.integrations?.jellyseerr;
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
        if (document.getElementById('sh-downloads-view-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-downloads-view-styles';
        style.textContent = `
/* ── Page Complète Téléchargements & Flux VisionOS ── */
.sh-downloads-view {
    min-height: 100vh;
    padding: 96px 48px 60px 48px;
    max-width: 1600px;
    margin: 0 auto;
    box-sizing: border-box;
    animation: shDownloadsFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(100, 210, 255, 0.07) 0%, transparent 70%);
}

@keyframes shDownloadsFadeIn {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
}

/* ── Hero Banner & Metrics ── */
.sh-downloads-hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 32px;
    margin-bottom: 32px;
    padding-bottom: 28px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sh-downloads-hero__content {
    max-width: 600px;
}

.sh-downloads-hero__badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 11px;
    font-weight: 750;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 12px;
    backdrop-filter: blur(16px);
}

.sh-pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #32d74b;
    box-shadow: 0 0 8px #32d74b;
    animation: shPulse 2s infinite;
}

@keyframes shPulse {
    0% { transform: scale(0.95); opacity: 0.8; }
    50% { transform: scale(1.3); opacity: 1; }
    100% { transform: scale(0.95); opacity: 0.8; }
}

.sh-downloads-hero__title {
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #ffffff;
    margin: 0 0 8px 0;
    line-height: 1.15;
}

.sh-downloads-hero__subtitle {
    font-size: 14.5px;
    color: rgba(255, 255, 255, 0.55);
    margin: 0;
    line-height: 1.5;
}

/* ── Metrics Cards ── */
.sh-downloads-metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
}

.sh-metric-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 20px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(24px);
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-metric-card:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
    transform: translateY(-2px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}

.sh-metric-card__icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.sh-metric-card__data {
    display: flex;
    flex-direction: column;
}

.sh-metric-card__label {
    font-size: 10.5px;
    font-weight: 750;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.45);
    margin-bottom: 3px;
}

.sh-metric-card__val {
    font-size: 17px;
    font-weight: 800;
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
}

/* ── Navigation Track & Tabs ── */
.sh-downloads-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
}

.sh-downloads-nav__track {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.09);
    backdrop-filter: blur(28px);
    overflow-x: auto;
    scrollbar-width: none;
}
.sh-downloads-nav__track::-webkit-scrollbar {
    display: none;
}

.sh-dl-tab-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 22px;
    border-radius: 9999px;
    border: 1px solid transparent;
    background: transparent;
    color: rgba(255, 255, 255, 0.65);
    font-size: 13.5px;
    font-weight: 650;
    cursor: pointer;
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    white-space: nowrap;
}

.sh-dl-tab-btn:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.08);
}

.sh-dl-tab-btn.active {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.28);
    color: #ffffff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    transform: translateY(-1px);
}

.sh-dl-tab-icon {
    font-size: 14.5px;
}

.sh-dl-action-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ffffff;
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    backdrop-filter: blur(16px);
}

.sh-dl-action-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.28);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

/* ── Content Slots & Bento Glass Card System ── */
.sh-downloads-content {
    animation: shTabContentIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes shTabContentIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Transformation de tous les widgets internes en Bento Glass Cards */
.sh-downloads-view .sh-widget {
    background: rgba(14, 14, 18, 0.72) !important;
    backdrop-filter: blur(40px) saturate(180%) !important;
    -webkit-backdrop-filter: blur(40px) saturate(180%) !important;
    border: 1px solid rgba(255, 255, 255, 0.09) !important;
    border-radius: 24px !important;
    padding: 24px 28px !important;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
    margin-bottom: 24px !important;
    transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.sh-downloads-view .sh-widget:hover {
    border-color: rgba(255, 255, 255, 0.14) !important;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.16) !important;
}

.sh-downloads-view .sh-widget__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: 16px;
}

.sh-downloads-view .sh-widget__title {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 17px;
    font-weight: 750;
    color: #ffffff;
    letter-spacing: -0.3px;
    margin: 0;
}

.sh-downloads-view .sh-widget__title svg, 
.sh-downloads-view .sh-shelf-title-icon {
    width: 20px;
    height: 20px;
    padding: 6px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #64d2ff;
}

.sh-downloads-view .sh-widget__refresh-btn,
.sh-downloads-view .sh-widget__sync-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.06) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    color: rgba(255, 255, 255, 0.85) !important;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    backdrop-filter: blur(16px);
}

.sh-downloads-view .sh-widget__refresh-btn:hover,
.sh-downloads-view .sh-widget__sync-btn:hover {
    background: rgba(255, 255, 255, 0.15) !important;
    border-color: rgba(255, 255, 255, 0.25) !important;
    color: #ffffff !important;
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(255, 255, 255, 0.1);
}

/* ── High-End Empty States ── */
.sh-downloads-view .sh-widget-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 50px 24px !important;
    text-align: center;
    background: rgba(255, 255, 255, 0.02) !important;
    border: 1px dashed rgba(255, 255, 255, 0.08) !important;
    border-radius: 18px !important;
    color: rgba(255, 255, 255, 0.6) !important;
    gap: 12px;
}

.sh-downloads-view .sh-widget-empty svg {
    width: 48px;
    height: 48px;
    padding: 12px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.4);
}

.sh-downloads-view .sh-widget-empty p {
    font-size: 14px;
    font-weight: 500;
    margin: 0;
    max-width: 450px;
    line-height: 1.5;
}

/* ── qBittorrent Styles ── */
.sh-qbit-speed-row {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 16px !important;
}

.sh-qbit-speed-card {
    padding: 18px 22px !important;
    border-radius: 18px !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    backdrop-filter: blur(20px) !important;
}

.sh-qbit-speed-card--dl {
    background: linear-gradient(135deg, rgba(100, 210, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%) !important;
    border-color: rgba(100, 210, 255, 0.18) !important;
}

.sh-qbit-speed-card--up {
    background: linear-gradient(135deg, rgba(50, 215, 75, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%) !important;
    border-color: rgba(50, 215, 75, 0.18) !important;
}

.sh-qbit-row {
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.07) !important;
    border-radius: 16px !important;
    padding: 16px 20px !important;
    margin-bottom: 12px;
    gap: 12px !important;
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.sh-qbit-row:hover {
    background: rgba(255, 255, 255, 0.06) !important;
    border-color: rgba(255, 255, 255, 0.16) !important;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.sh-qbit-row > div:nth-child(2) {
    height: 6px !important;
    background: rgba(255, 255, 255, 0.08) !important;
    border-radius: 9999px !important;
}

.sh-qbit-row > div:nth-child(2) > div {
    background: linear-gradient(90deg, #38bdf8, #64d2ff, #a78bfa) !important;
    box-shadow: 0 0 10px rgba(100, 210, 255, 0.5) !important;
    border-radius: 9999px !important;
}

/* ── Radarr Styles ── */
.sh-radarr-movies-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)) !important;
    gap: 18px !important;
    width: 100% !important;
}

.sh-radarr-movie-card {
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 16px !important;
    overflow: hidden !important;
    transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1) !important;
    padding: 8px !important;
}

.sh-radarr-movie-card:hover {
    background: rgba(255, 255, 255, 0.07) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
    transform: translateY(-4px) !important;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55) !important;
}

.sh-radarr-movie-card__image-wrap {
    position: relative !important;
    border-radius: 12px !important;
    overflow: hidden !important;
    aspect-ratio: 2/3 !important;
}

.sh-radarr-movie-card__image-wrap img {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    transition: transform 0.3s ease !important;
}

.sh-radarr-movie-card:hover .sh-radarr-movie-card__image-wrap img {
    transform: scale(1.05) !important;
}

.sh-radarr-movie-card__date {
    position: absolute !important;
    bottom: 8px !important;
    left: 8px !important;
    right: 8px !important;
    padding: 4px 8px !important;
    border-radius: 8px !important;
    background: rgba(0, 0, 0, 0.75) !important;
    backdrop-filter: blur(10px) !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    text-align: center !important;
    color: #ffffff !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
}

/* ── Sonarr Styles ── */
.sh-sonarr-episodes-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
    gap: 16px !important;
    width: 100% !important;
}

.sh-sonarr-episode-card {
    display: flex !important;
    gap: 14px !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 16px !important;
    padding: 12px !important;
    backdrop-filter: blur(20px) !important;
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.sh-sonarr-episode-card:hover {
    background: rgba(255, 255, 255, 0.06) !important;
    border-color: rgba(255, 255, 255, 0.18) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45) !important;
}

.sh-sonarr-episode-card__image-wrap {
    width: 70px !important;
    height: 100px !important;
    border-radius: 10px !important;
    overflow: hidden !important;
    flex-shrink: 0 !important;
}

.sh-sonarr-episode-card__image-wrap img {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
}

.sh-sonarr-ep-badge {
    background: rgba(100, 210, 255, 0.15) !important;
    color: #64d2ff !important;
    border: 1px solid rgba(100, 210, 255, 0.3) !important;
    border-radius: 6px !important;
    padding: 2px 6px !important;
    font-size: 10px !important;
    font-weight: 750 !important;
}

.sh-sonarr-queue-row,
.sh-radarr-queue-row {
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.07) !important;
    border-radius: 16px !important;
    padding: 16px 20px !important;
    margin-bottom: 12px !important;
    transition: all 0.2s ease !important;
}

.sh-sonarr-queue-row:hover,
.sh-radarr-queue-row:hover {
    background: rgba(255, 255, 255, 0.06) !important;
    border-color: rgba(255, 255, 255, 0.16) !important;
    transform: translateY(-2px) !important;
}

/* ── Bazarr Styles ── */
.sh-bazarr-summary-banner {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 16px 20px !important;
    border-radius: 16px !important;
    background: linear-gradient(135deg, rgba(255, 159, 10, 0.1) 0%, rgba(255, 255, 255, 0.02) 100%) !important;
    border: 1px solid rgba(255, 159, 10, 0.25) !important;
    color: #ff9f0a !important;
    font-size: 14px !important;
    margin-bottom: 20px !important;
    backdrop-filter: blur(20px) !important;
}

.sh-bazarr-item {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.07) !important;
    border-radius: 14px !important;
    padding: 12px 18px !important;
    margin-bottom: 10px !important;
    transition: all 0.2s ease !important;
}

.sh-bazarr-item:hover {
    background: rgba(255, 255, 255, 0.06) !important;
    border-color: rgba(255, 255, 255, 0.16) !important;
    transform: translateY(-1px) !important;
}

.sh-bazarr-type-badge {
    padding: 3px 8px !important;
    border-radius: 6px !important;
    font-size: 10.5px !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
}

.sh-bazarr-type-badge--movie {
    background: rgba(100, 210, 255, 0.15) !important;
    color: #64d2ff !important;
    border: 1px solid rgba(100, 210, 255, 0.3) !important;
}

.sh-bazarr-type-badge--series {
    background: rgba(191, 90, 242, 0.15) !important;
    color: #bf5af2 !important;
    border: 1px solid rgba(191, 90, 242, 0.3) !important;
}

.sh-bazarr-search-btn {
    padding: 6px 14px !important;
    border-radius: 9999px !important;
    background: rgba(255, 255, 255, 0.08) !important;
    border: 1px solid rgba(255, 255, 255, 0.14) !important;
    color: #ffffff !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
}

.sh-bazarr-search-btn:hover {
    background: #64d2ff !important;
    border-color: #64d2ff !important;
    color: #000000 !important;
    box-shadow: 0 4px 12px rgba(100, 210, 255, 0.4) !important;
}

/* ── Jellyseerr Search & Requests ── */
.sh-jellyseerr-search-panel {
    margin-bottom: 28px;
}

.sh-jellyseerr-search-bar {
    position: relative;
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 18px;
    padding: 8px 18px;
    backdrop-filter: blur(20px);
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
}

.sh-jellyseerr-search-bar:focus-within {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.28);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15);
}

.sh-jellyseerr-search-icon {
    color: rgba(255, 255, 255, 0.5);
    margin-right: 12px;
    flex-shrink: 0;
}

.sh-jellyseerr-query-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-size: 15px;
    font-weight: 500;
    padding: 8px 0;
    font-family: inherit;
}

.sh-jellyseerr-query-input::placeholder {
    color: rgba(255, 255, 255, 0.38);
}

.sh-jellyseerr-clear-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: rgba(255, 255, 255, 0.7);
    width: 22px;
    height: 22px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
}

.sh-jellyseerr-clear-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    color: #ffffff;
}

.sh-jellyseerr-results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    margin-top: 18px;
    animation: shTabContentIn 0.3s ease;
}

.sh-jellyseerr-card {
    display: flex;
    gap: 14px;
    padding: 12px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(20px);
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.sh-jellyseerr-card:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(255, 255, 255, 0.16);
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
}

.sh-jellyseerr-card__poster {
    width: 75px;
    height: 110px;
    border-radius: 10px;
    background-size: cover;
    background-position: center;
    position: relative;
    flex-shrink: 0;
    overflow: hidden;
}

.sh-jellyseerr-card__badges {
    position: absolute;
    top: 4px;
    left: 4px;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.sh-jellyseerr-type-badge,
.sh-jellyseerr-year-badge,
.sh-jellyseerr-rating-badge {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 9.5px;
    font-weight: 700;
    backdrop-filter: blur(8px);
}

.sh-jellyseerr-type-badge {
    background: rgba(0, 0, 0, 0.7);
    color: #64d2ff;
}

.sh-jellyseerr-year-badge {
    background: rgba(0, 0, 0, 0.7);
    color: rgba(255, 255, 255, 0.85);
}

.sh-jellyseerr-rating-badge {
    background: rgba(255, 214, 10, 0.85);
    color: #000000;
}

.sh-jellyseerr-card__info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-width: 0;
}

.sh-jellyseerr-card__title {
    font-size: 14.5px;
    font-weight: 700;
    color: #ffffff;
    margin: 0 0 4px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sh-jellyseerr-card__overview {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.55);
    margin: 0 0 8px 0;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.sh-jellyseerr-card__action {
    margin-top: auto;
}

.sh-jellyseerr-req-btn {
    width: 100%;
    padding: 6px 12px;
    border-radius: 8px;
    background: rgba(100, 210, 255, 0.15);
    border: 1px solid rgba(100, 210, 255, 0.35);
    color: #64d2ff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
}

.sh-jellyseerr-req-btn:hover {
    background: #64d2ff;
    color: #000000;
    box-shadow: 0 4px 14px rgba(100, 210, 255, 0.4);
}

.sh-jellyseerr-status-pill {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
}

.sh-jellyseerr-status-pill.status-available {
    background: rgba(50, 215, 75, 0.15);
    color: #32d74b;
    border: 1px solid rgba(50, 215, 75, 0.3);
}

.sh-jellyseerr-status-pill.status-pending {
    background: rgba(255, 214, 10, 0.15);
    color: #ffd60a;
    border: 1px solid rgba(255, 214, 10, 0.3);
}

.sh-jellyseerr-request-card {
    display: flex !important;
    align-items: center !important;
    gap: 16px !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 18px !important;
    padding: 14px 18px !important;
    margin-bottom: 12px !important;
    transition: all 0.2s ease !important;
}

.sh-jellyseerr-request-card:hover {
    background: rgba(255, 255, 255, 0.06) !important;
    border-color: rgba(255, 255, 255, 0.16) !important;
    transform: translateY(-2px) !important;
}

.sh-jellyseerr-request-card__poster {
    width: 50px !important;
    height: 75px !important;
    border-radius: 10px !important;
    overflow: hidden !important;
    flex-shrink: 0 !important;
}

.sh-jellyseerr-request-card__poster img {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
}

.sh-jellyseerr-trending-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)) !important;
    gap: 16px !important;
}

.sh-jellyseerr-trend-card {
    border-radius: 16px !important;
    overflow: hidden !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1) !important;
    padding: 8px !important;
}

.sh-jellyseerr-trend-card:hover {
    background: rgba(255, 255, 255, 0.07) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
    transform: translateY(-4px) !important;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55) !important;
}

.sh-dl-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: rgba(255, 255, 255, 0.5);
    gap: 16px;
}

.sh-dl-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--sh-color-primary, #64d2ff);
    border-radius: 50%;
    animation: shSpin 0.8s linear infinite;
}

@keyframes shSpin {
    to { transform: rotate(360deg); }
}

@media (max-width: 1024px) {
    .sh-downloads-hero {
        flex-direction: column;
        align-items: flex-start;
    }
    .sh-downloads-metrics {
        grid-template-columns: repeat(2, 1fr);
        width: 100%;
    }
    .sh-downloads-view {
        padding: 80px 20px 40px 20px;
    }
}
/* ─── CALENDRIER UNIFIÉ VISIONOS & GRILLE PHYSIQUE INTERACTIVE ─── */
.sh-calendar-full-panel {
    background: rgba(255, 255, 255, 0.04) !important;
    border: 1px solid rgba(255, 255, 255, 0.09) !important;
    border-radius: 24px !important;
    padding: 24px !important;
    backdrop-filter: blur(24px) !important;
    -webkit-backdrop-filter: blur(24px) !important;
}

.sh-cal-header-bar {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    margin-bottom: 24px !important;
    flex-wrap: wrap !important;
    gap: 16px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
    padding-bottom: 16px !important;
}

.sh-cal-brand-tag {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 3px 8px !important;
    background: rgba(255, 255, 255, 0.08) !important;
    border-radius: 100px !important;
    font-size: 10px !important;
    font-weight: 750 !important;
    color: rgba(255, 255, 255, 0.8) !important;
    letter-spacing: 0.8px !important;
    margin-bottom: 4px !important;
}

.sh-cal-live-dot {
    width: 6px !important;
    height: 6px !important;
    border-radius: 50% !important;
    background: #30d158 !important;
    box-shadow: 0 0 6px #30d158 !important;
}

.sh-cal-main-title {
    font-size: 20px !important;
    font-weight: 700 !important;
    color: #ffffff !important;
    margin: 0 !important;
    letter-spacing: -0.3px !important;
}

.sh-cal-controls-row {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    flex-wrap: wrap !important;
}

.sh-cal-pill-track {
    display: flex !important;
    gap: 4px !important;
    background: rgba(255, 255, 255, 0.06) !important;
    border: 1px solid rgba(255, 255, 255, 0.10) !important;
    border-radius: 100px !important;
    padding: 4px !important;
}

.sh-cal-pill-btn {
    background: transparent !important;
    border: none !important;
    color: rgba(255, 255, 255, 0.65) !important;
    padding: 6px 14px !important;
    border-radius: 100px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    transition: all 180ms ease !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
}

.sh-cal-pill-btn:hover {
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.08) !important;
}

.sh-cal-pill-btn.active {
    background: #ffffff !important;
    color: #000000 !important;
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.25) !important;
}

/* ─── VUE GRILLE MENSUELLE PHYSIQUE ─── */
.sh-cal-month-wrapper {
    display: flex !important;
    flex-direction: column !important;
    gap: 14px !important;
}

.sh-cal-month-nav-bar {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    padding: 4px 0 !important;
}

.sh-cal-month-title-group {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
}

.sh-cal-month-title {
    font-size: 18px !important;
    font-weight: 750 !important;
    color: #ffffff !important;
    margin: 0 !important;
    letter-spacing: -0.2px !important;
}

.sh-cal-jump-today-btn {
    background: rgba(255, 255, 255, 0.08) !important;
    border: 1px solid rgba(255, 255, 255, 0.14) !important;
    color: #ffffff !important;
    padding: 4px 10px !important;
    border-radius: 8px !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    transition: all 140ms ease !important;
}

.sh-cal-jump-today-btn:hover {
    background: rgba(255, 255, 255, 0.18) !important;
}

.sh-cal-month-arrows {
    display: flex !important;
    gap: 6px !important;
}

.sh-cal-arrow-btn {
    background: rgba(255, 255, 255, 0.06) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    color: #ffffff !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    font-size: 12px !important;
    transition: all 140ms ease !important;
}

.sh-cal-arrow-btn:hover {
    background: rgba(255, 255, 255, 0.18) !important;
    transform: scale(1.06) !important;
}

.sh-cal-weekdays-header {
    display: grid !important;
    grid-template-columns: repeat(7, 1fr) !important;
    gap: 8px !important;
    text-align: center !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    color: rgba(255, 255, 255, 0.45) !important;
    letter-spacing: 0.8px !important;
    padding-bottom: 6px !important;
}

.sh-cal-month-grid {
    display: grid !important;
    grid-template-columns: repeat(7, 1fr) !important;
    gap: 8px !important;
}

.sh-cal-grid-cell {
    min-height: 110px !important;
    background: rgba(255, 255, 255, 0.02) !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    border-radius: 14px !important;
    padding: 8px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 6px !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    transition: all 180ms ease !important;
}

.sh-cal-grid-cell.empty {
    background: transparent !important;
    border-color: transparent !important;
    pointer-events: none !important;
}

.sh-cal-grid-cell:hover:not(.empty) {
    background: rgba(255, 255, 255, 0.05) !important;
    border-color: rgba(255, 255, 255, 0.15) !important;
}

.sh-cal-grid-cell.has-events {
    cursor: pointer !important;
}

.sh-cal-grid-cell.today {
    border-color: rgba(48, 209, 88, 0.5) !important;
    background: rgba(48, 209, 88, 0.04) !important;
}

.sh-cal-cell-header {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    width: 100% !important;
    box-sizing: border-box !important;
}

.sh-cal-cell-num {
    font-size: 12px !important;
    font-weight: 700 !important;
    color: rgba(255, 255, 255, 0.7) !important;
    width: 22px !important;
    height: 22px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 50% !important;
}

.sh-cal-cell-num.today-badge {
    background: #30d158 !important;
    color: #000000 !important;
    box-shadow: 0 0 8px rgba(48, 209, 88, 0.6) !important;
}

.sh-cal-cell-count {
    font-size: 9.5px !important;
    color: rgba(255, 255, 255, 0.4) !important;
}

.sh-cal-cell-events {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
    max-height: 85px !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    width: 100% !important;
    box-sizing: border-box !important;
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
}

.sh-cal-cell-events::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
}

.sh-cal-event-chip {
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
    padding: 3px 6px !important;
    border-radius: 6px !important;
    font-size: 10.5px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    transition: transform 120ms ease, opacity 120ms ease !important;
}

.sh-cal-event-chip:hover {
    transform: scale(1.02) !important;
    opacity: 0.9 !important;
}

.sh-cal-event-chip.episode {
    background: rgba(191, 90, 242, 0.22) !important;
    border: 1px solid rgba(191, 90, 242, 0.4) !important;
    color: #df9bfa !important;
}

.sh-cal-event-chip.movie {
    background: rgba(100, 210, 255, 0.22) !important;
    border: 1px solid rgba(100, 210, 255, 0.4) !important;
    color: #92e0ff !important;
}

.sh-cal-chip-icon {
    font-size: 10px !important;
    flex-shrink: 0 !important;
}

.sh-cal-chip-title {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    flex: 1 !important;
    min-width: 0 !important;
}

.sh-cal-chip-dispo {
    font-size: 9px !important;
    color: #30d158 !important;
    font-weight: 800 !important;
    flex-shrink: 0 !important;
}

/* ─── VUE CHRONOLOGIQUE TIMELINE ─── */
.sh-cal-timeline-list {
    display: flex !important;
    flex-direction: column !important;
    gap: 24px !important;
}

.sh-cal-day-group {
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
}

.sh-cal-day-header {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
    padding-bottom: 8px !important;
}

.sh-cal-day-title {
    font-size: 15px !important;
    font-weight: 700 !important;
    color: #ffffff !important;
    margin: 0 !important;
}

.sh-cal-day-counter {
    font-size: 11px !important;
    padding: 2px 8px !important;
    border-radius: 100px !important;
    background: rgba(255, 255, 255, 0.08) !important;
    color: rgba(255, 255, 255, 0.6) !important;
}

.sh-cal-cards-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)) !important;
    gap: 14px !important;
}

.sh-cal-timeline-card {
    display: flex !important;
    gap: 12px !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 16px !important;
    padding: 10px !important;
    cursor: pointer !important;
    transition: all 180ms ease !important;
}

.sh-cal-timeline-card:hover {
    background: rgba(255, 255, 255, 0.07) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
    transform: translateY(-2px) !important;
}

.sh-cal-card-img {
    width: 54px !important;
    height: 80px !important;
    object-fit: cover !important;
    border-radius: 10px !important;
    flex-shrink: 0 !important;
}

.sh-cal-card-placeholder {
    width: 54px !important;
    height: 80px !important;
    border-radius: 10px !important;
    background: rgba(255, 255, 255, 0.06) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 24px !important;
    flex-shrink: 0 !important;
}

.sh-cal-card-details {
    display: flex !important;
    flex-direction: column !important;
    justify-content: space-between !important;
    overflow: hidden !important;
    flex: 1 !important;
}

.sh-cal-card-badge-row {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    margin-bottom: 4px !important;
}

.sh-cal-badge-type {
    font-size: 9px !important;
    font-weight: 750 !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
}

.sh-cal-badge-type.ep {
    color: #bf5af2 !important;
    background: rgba(191, 90, 242, 0.15) !important;
}

.sh-cal-badge-type.movie {
    color: #64d2ff !important;
    background: rgba(100, 210, 255, 0.15) !important;
}

.sh-cal-badge-dispo {
    font-size: 9px !important;
    color: #30d158 !important;
    font-weight: 750 !important;
}

.sh-cal-card-name {
    display: block !important;
    font-size: 13px !important;
    color: #ffffff !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}

.sh-cal-card-sub {
    display: block !important;
    font-size: 11px !important;
    color: rgba(255, 255, 255, 0.55) !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    margin-top: 2px !important;
}
        `;
        document.head.appendChild(style);
    }
}

export default DownloadsView;
