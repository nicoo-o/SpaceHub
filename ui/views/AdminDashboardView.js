'use strict';

import JellyfinConsoleModal from './JellyfinConsoleModal.js';
import { escapeHtml } from '../../core/utils/domUtils.js';

export class AdminDashboardView {
    constructor() {
        this._container = null;
        this._refreshTimer = null;
        this._closeTimer = null;
        this._modal = null;
        this._autoRefreshInterval = 8000; // Rafraîchissement automatique toutes les 8s
    }

    /**
     * Ouvre la modale Grand Cinema d'Administration Serveur.
     */
    open() {
        const user = window.SpaceHub?.auth?.getUser?.();
        if (user?.Policy?.IsAdministrator !== true) {
            window.SpaceHub?.ui?.components?.toaster?.error?.('Accès réservé aux administrateurs Jellyfin.');
            return false;
        }
        document.getElementById('sh-admin-dashboard-modal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'sh-admin-dashboard-modal';
        this._modal = modal;
        modal.className = 'sh-admin-modal-overlay';
        modal.innerHTML = `
            <div class="sh-admin-modal-card sh-scrollbar">
                <!-- EN-TÊTE -->
                <div class="sh-admin-modal-header">
                    <div class="sh-admin-header-left">
                        <div class="sh-admin-modal-badge">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                            SUPERVISION SERVEUR & ADMIN
                        </div>
                        <h2 class="sh-admin-modal-title">Administration SpaceHub</h2>
                        <p class="sh-admin-modal-subtitle" id="sh-admin-server-info-text">Chargement des métriques du serveur...</p>
                    </div>
                    <div class="sh-admin-header-actions">
                        <button tabindex="0" data-nav-focusable="true" class="sh-admin-header-btn" id="sh-admin-btn-refresh" title="Actualiser les données">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                            </svg>
                            <span>Actualiser</span>
                        </button>
                        <button tabindex="0" data-nav-focusable="true" class="sh-admin-modal-close" id="sh-admin-modal-close" aria-label="Fermer">✕</button>
                    </div>
                </div>

                <!-- ONGLET / SECTIONS BENTO -->
                <div class="sh-admin-bento-grid">
                    <!-- SECTION 1 : SESSIONS EN DIRECT (LIVE MONITORING) -->
                    <div class="sh-admin-bento-card sh-admin-card-sessions">
                        <div class="sh-admin-card-header">
                            <div class="sh-admin-card-title-group">
                                <div class="sh-admin-live-dot"></div>
                                <h3 class="sh-admin-card-title">Sessions Actives en Direct</h3>
                            </div>
                            <span class="sh-admin-card-tag" id="sh-admin-sessions-count">0 flux</span>
                        </div>
                        <div class="sh-admin-sessions-list" id="sh-admin-sessions-container">
                            <div class="sh-admin-empty-state">
                                <div class="sh-admin-empty-icon">📡</div>
                                <p>Recherche des sessions de lecture en cours...</p>
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 2 : ÉTAT MÉDIATHÈQUE & SCAN -->
                    <div class="sh-admin-bento-card sh-admin-card-library">
                        <div class="sh-admin-card-header">
                            <h3 class="sh-admin-card-title">État de la Médiathèque</h3>
                            <button tabindex="0" data-nav-focusable="true" class="sh-admin-mini-action-btn" id="sh-admin-btn-scan-library">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                    <path d="M3 3v5h5"></path>
                                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
                                    <path d="M16 16h5v5"></path>
                                </svg>
                                <span>Lancer Scan</span>
                            </button>
                        </div>
                        <div class="sh-admin-metrics-grid" id="sh-admin-metrics-container">
                            <div class="sh-admin-metric-pill">
                                <span class="sh-admin-metric-icon">🎬</span>
                                <div class="sh-admin-metric-data">
                                    <strong id="sh-admin-count-movies">-</strong>
                                    <small>Films</small>
                                </div>
                            </div>
                            <div class="sh-admin-metric-pill">
                                <span class="sh-admin-metric-icon">📺</span>
                                <div class="sh-admin-metric-data">
                                    <strong id="sh-admin-count-series">-</strong>
                                    <small>Séries</small>
                                </div>
                            </div>
                            <div class="sh-admin-metric-pill">
                                <span class="sh-admin-metric-icon">🎞️</span>
                                <div class="sh-admin-metric-data">
                                    <strong id="sh-admin-count-episodes">-</strong>
                                    <small>Épisodes</small>
                                </div>
                            </div>
                            <div class="sh-admin-metric-pill">
                                <span class="sh-admin-metric-icon">🎵</span>
                                <div class="sh-admin-metric-data">
                                    <strong id="sh-admin-count-songs">-</strong>
                                    <small>Morceaux</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 3 : SANTÉ DES MÉDIAS (MEDIA HEALTH & SOUS-TITRES) -->
                    <div class="sh-admin-bento-card sh-admin-card-health">
                        <div class="sh-admin-card-header">
                            <h3 class="sh-admin-card-title">Santé & Diagnostic Médias</h3>
                            <span class="sh-admin-card-badge-health" id="sh-admin-health-badge">Vérification...</span>
                        </div>
                        <div class="sh-admin-health-list" id="sh-admin-health-container">
                            <div class="sh-admin-health-item">
                                <div class="sh-admin-health-icon">📝</div>
                                <div class="sh-admin-health-info">
                                    <strong>Sous-titres Français</strong>
                                    <span id="sh-admin-bazarr-health-text">Synchronisation avec Bazarr...</span>
                                </div>
                                <button class="sh-admin-health-btn" id="sh-admin-btn-sync-bazarr">Synchroniser</button>
                            </div>
                            <div class="sh-admin-health-item">
                                <div class="sh-admin-health-icon">✨</div>
                                <div class="sh-admin-health-info">
                                    <strong>Contrôle Qualité & Résolutions</strong>
                                    <span id="sh-admin-quality-health-text">Analyse des fichiers 1080p/4K...</span>
                                </div>
                                <button class="sh-admin-health-btn" id="sh-admin-btn-inspect-quality">Inspecter</button>
                            </div>
                        </div>
                    </div>

                    <!-- SECTION 4 : STATUT DES MICROSERVICES & CONNECTIVITÉ -->
                    <div class="sh-admin-bento-card sh-admin-card-services">
                        <div class="sh-admin-card-header">
                            <h3 class="sh-admin-card-title">Écosystème des Services Connectés</h3>
                            <button tabindex="0" data-nav-focusable="true" class="sh-admin-mini-action-btn" id="sh-admin-btn-test-all-services">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                </svg>
                                <span>Tester Tout</span>
                            </button>
                        </div>
                        <div class="sh-admin-services-grid" id="sh-admin-services-container">
                            <!-- Services cards will be injected dynamically -->
                        </div>
                    </div>
                </div>

                <!-- PIED DE PAGE : LIEN CONSOLE SYSTÈME JELLYFIN -->
                <div class="sh-admin-modal-footer">
                    <button class="sh-admin-console-link-btn" id="sh-admin-btn-open-jellyfin-console">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                            <line x1="3" y1="9" x2="21" y2="9"></line>
                            <line x1="9" y1="21" x2="9" y2="9"></line>
                        </svg>
                        <span>Ouvrir la Console Système Jellyfin Avancée ↗</span>
                    </button>
                    <button class="sh-admin-close-btn-main" id="sh-admin-modal-done">Terminer</button>
                </div>
            </div>
        `;

        this._injectStyles();
        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            modal.classList.add('open');
            const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
            if (spatialNav) spatialNav.onModalOpened(modal, modal.querySelector('#sh-admin-btn-refresh'));
        });

        // Événements de fermeture
        const closeModal = () => {
            if (this._refreshTimer) {
                clearInterval(this._refreshTimer);
                this._refreshTimer = null;
            }
            modal.classList.remove('open');
            const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
            if (spatialNav) spatialNav.onModalClosed();
            if (this._closeTimer) clearTimeout(this._closeTimer);
            this._closeTimer = setTimeout(() => {
                modal.remove();
                if (this._modal === modal) this._modal = null;
                this._closeTimer = null;
            }, 260);
        };

        modal.querySelector('#sh-admin-modal-close')?.addEventListener('click', closeModal);
        modal.querySelector('#sh-admin-modal-done')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Liaison des boutons d'actions
        modal.querySelector('#sh-admin-btn-refresh')?.addEventListener('click', () => {
            this._loadAllData(modal);
            window.SpaceHub?.ui?.components?.toaster?.info?.('Données d\'administration actualisées');
        });

        modal.querySelector('#sh-admin-btn-scan-library')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.style.opacity = '0.6';
            const jfApi = window.SpaceHub?.jellyfin?.api;
            const success = await jfApi?.refreshLibrary?.();
            if (success) {
                window.SpaceHub?.ui?.components?.toaster?.success?.('Scan de la médiathèque Jellyfin lancé !');
            } else {
                window.SpaceHub?.ui?.components?.toaster?.error?.('Impossible de lancer le scan Jellyfin');
            }
            setTimeout(() => {
                btn.disabled = false;
                btn.style.opacity = '1';
            }, 3000);
        });

        modal.querySelector('#sh-admin-btn-open-jellyfin-console')?.addEventListener('click', () => {
            const consoleModal = new JellyfinConsoleModal();
            consoleModal.open();
        });

        modal.querySelector('#sh-admin-btn-sync-bazarr')?.addEventListener('click', async () => {
            const bazarr = window.SpaceHub?.integrations?.bazarr;
            try {
                if (typeof bazarr?.sync === 'function') {
                    await bazarr.sync();
                    window.SpaceHub?.ui?.components?.toaster?.success?.('Synchronisation Bazarr effectuée !');
                } else {
                    window.SpaceHub?.ui?.components?.toaster?.info?.('Bazarr non configuré ou inactif.');
                }
            } catch (err) {
                console.error('[AdminDashboardView] Erreur sync Bazarr:', err);
                window.SpaceHub?.ui?.components?.toaster?.error?.(`Erreur Bazarr : ${escapeHtml(err?.message || 'Échec de synchronisation')}`);
            }
        });

        modal.querySelector('#sh-admin-btn-test-all-services')?.addEventListener('click', () => {
            this._testAllServices(modal);
        });

        // Chargement initial des données
        this._loadAllData(modal);

        // Polling en direct toutes les 8s pour le monitoring
        this._refreshTimer = setInterval(() => {
            if (document.getElementById('sh-admin-dashboard-modal') === modal) {
                this._loadSessions(modal);
            } else {
                this.destroy();
            }
        }, this._autoRefreshInterval);
    }

    destroy() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
        if (this._closeTimer) {
            clearTimeout(this._closeTimer);
            this._closeTimer = null;
        }
        this._modal?.remove();
        this._modal = null;
    }

    /**
     * Charge toutes les données de l'administration.
     */
    async _loadAllData(modal) {
        await Promise.all([
            this._loadSystemInfo(modal),
            this._loadSessions(modal),
            this._loadItemCounts(modal),
            this._loadMediaHealth(modal),
            this._loadServicesStatus(modal)
        ]);
    }

    /**
     * Charge les informations système du serveur Jellyfin.
     */
    async _loadSystemInfo(modal) {
        const infoEl = modal.querySelector('#sh-admin-server-info-text');
        const jfApi = window.SpaceHub?.jellyfin?.api;
        try {
            const info = await jfApi?.getSystemInfo?.();
            if (info && infoEl) {
                const serverName = info.ServerName || 'Serveur Jellyfin';
                const version = info.Version || 'Version indisponible';
                const os = info.OperatingSystem || info.OS || 'Système non communiqué par Jellyfin';
                const state = info?.Version ? 'En ligne' : 'Réponse partielle';
                infoEl.textContent = `${serverName} • v${version} • ${os} • ${state}`;
            } else if (infoEl) {
                infoEl.textContent = 'Informations du serveur indisponibles';
            }
        } catch (e) {
            if (infoEl) infoEl.textContent = 'État du serveur inconnu';
        }
    }

    /**
     * 🔴 Charge les sessions actives en direct (Tautulli-like).
     */
    async _loadSessions(modal) {
        const container = modal.querySelector('#sh-admin-sessions-container');
        const countBadge = modal.querySelector('#sh-admin-sessions-count');
        if (!container) return;

        const jfApi = window.SpaceHub?.jellyfin?.api;
        try {
            const allSessions = await jfApi?.getAllSessions?.();
            // Filtrer les sessions qui lisent actuellement un contenu
            const activeStreams = (allSessions || []).filter(s => s.NowPlayingItem);

            if (countBadge) {
                countBadge.textContent = `${activeStreams.length} flux en cours`;
            }

            if (activeStreams.length === 0) {
                container.innerHTML = `
                    <div class="sh-admin-empty-state">
                        <div class="sh-admin-empty-icon">✨</div>
                        <p><strong>Aucune lecture en cours</strong></p>
                        <small style="color:rgba(255,255,255,0.45);">Le serveur est en veille active. Les flux apparaîtront ici en direct dès qu'un utilisateur lance un média.</small>
                    </div>
                `;
                return;
            }

            container.innerHTML = activeStreams.map(s => {
                const item = s.NowPlayingItem;
                const user = s.UserName || 'Utilisateur';
                const client = s.Client || s.DeviceName || 'Client Web';
                const playState = s.PlayState || {};
                const isPaused = playState.IsPaused;
                const positionTicks = playState.PositionTicks || 0;
                const runtimeTicks = item.RunTimeTicks || 1;
                const percent = Math.min(100, Math.max(0, Math.round((positionTicks / runtimeTicks) * 100)));

                const posMin = Math.floor(positionTicks / 600000000);
                const runMin = Math.floor(runtimeTicks / 600000000);

                const isTranscoding = s.TranscodingInfo && s.TranscodingInfo.IsVideoDirect === false;
                const transcodeBadge = isTranscoding
                    ? `<span class="sh-session-badge sh-badge-transcode">🟠 Transcode (${s.TranscodingInfo.VideoCodec || 'H264'})</span>`
                    : `<span class="sh-session-badge sh-badge-direct">🟢 Direct Play</span>`;

                const title = item.SeriesName ? `${item.SeriesName} — ${item.Name}` : (item.Name || 'Média sans titre');
                const imgUrl = jfApi?.getImageUrl?.(item.Id, 'Primary', { fillWidth: 80, fillHeight: 120 }) || '';

                return `
                    <div class="sh-admin-session-item" data-session-id="${escapeHtml(s.Id)}">
                        <div class="sh-session-poster">
                            <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(title)}" onerror="this.style.display='none'" />
                        </div>
                        <div class="sh-session-details">
                            <div class="sh-session-top-line">
                                <span class="sh-session-user">👤 <strong>${escapeHtml(user)}</strong> sur ${escapeHtml(client)}</span>
                                ${transcodeBadge}
                            </div>
                            <h4 class="sh-session-title">${escapeHtml(title)}</h4>
                            <div class="sh-session-progress-wrapper">
                                <div class="sh-session-progress-bar" style="width: ${percent}%"></div>
                            </div>
                            <div class="sh-session-time-row">
                                <span>${isPaused ? '⏸️ En pause' : '▶️ En lecture'} • ${posMin} min / ${runMin} min (${percent}%)</span>
                                <div class="sh-session-item-actions">
                                    <button class="sh-session-btn-msg" data-session-id="${s.Id}" title="Envoyer un message">💬 Message</button>
                                    <button class="sh-session-btn-stop" data-session-id="${s.Id}" title="Arrêter la lecture">⏹️ Stop</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Liaison des boutons d'actions sur chaque session
            container.querySelectorAll('.sh-session-btn-stop').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const sId = e.currentTarget.dataset.sessionId;
                    if (confirm('Voulez-vous vraiment stopper cette lecture à distance ?')) {
                        await jfApi?.stopSession?.(sId);
                        window.SpaceHub?.ui?.components?.toaster?.success?.('Session de lecture interrompue.');
                        this._loadSessions(modal);
                    }
                });
            });

            container.querySelectorAll('.sh-session-btn-msg').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const sId = e.currentTarget.dataset.sessionId;
                    const msg = prompt('Entrez le message à afficher sur l\'écran de l\'utilisateur :');
                    if (msg && msg.trim()) {
                        await jfApi?.sendMessageToSession?.(sId, msg.trim());
                        window.SpaceHub?.ui?.components?.toaster?.success?.('Message envoyé à l\'utilisateur !');
                    }
                });
            });

        } catch (e) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.5); padding:16px;">Impossible de contacter l\'API des sessions.</p>';
        }
    }

    /**
     * 💾 Charge le décompte des médias.
     */
    async _loadItemCounts(modal) {
        const jfApi = window.SpaceHub?.jellyfin?.api;
        try {
            const counts = await jfApi?.getItemCounts?.();
            if (counts) {
                const setVal = (id, val) => {
                    const el = modal.querySelector(id);
                    if (!el) return;
                    el.textContent = (val !== undefined && val !== null)
                        ? Number(val).toLocaleString()
                        : '—';
                };
                setVal('#sh-admin-count-movies', counts.MovieCount);
                setVal('#sh-admin-count-series', counts.SeriesCount);
                setVal('#sh-admin-count-episodes', counts.EpisodeCount);
                setVal('#sh-admin-count-songs', counts.SongCount);
            }
        } catch (e) {
            ['#sh-admin-count-movies', '#sh-admin-count-series', '#sh-admin-count-episodes', '#sh-admin-count-songs']
                .forEach(id => { const el = modal.querySelector(id); if (el) el.textContent = '—'; });
        }
    }

    /**
     * 🩺 Charge la santé des médias (Bazarr + Jellyfin quality).
     */
    async _loadMediaHealth(modal) {
        const bazarrText = modal.querySelector('#sh-admin-bazarr-health-text');
        const qualityText = modal.querySelector('#sh-admin-quality-health-text');
        const badge = modal.querySelector('#sh-admin-health-badge');

        try {
            const bazarr = window.SpaceHub?.integrations?.bazarr;
            if (bazarr?.getWantedSummary) {
                const summary = await bazarr.getWantedSummary();
                const missing = Number(summary?.totalWanted || 0);
                if (bazarrText) {
                    bazarrText.textContent = missing > 0
                        ? `${missing} sous-titres français manquants à récupérer`
                        : 'Tous les sous-titres français sont synchronisés !';
                }
            } else if (bazarrText) {
                bazarrText.textContent = 'Bazarr connecté et prêt à synchroniser';
            }

            if (qualityText) {
                qualityText.textContent = 'Qualité non analysée : aucune métrique de résolution n\'a été chargée.';
            }

            if (badge) {
                badge.textContent = '⚪ Données partielles';
                badge.style.background = 'rgba(255, 255, 255, 0.10)';
                badge.style.color = 'rgba(255, 255, 255, 0.75)';
            }
        } catch (e) {
            if (bazarrText) bazarrText.textContent = 'Bazarr indisponible ou non configuré.';
            if (qualityText) qualityText.textContent = 'Qualité non analysée.';
            if (badge) badge.textContent = '⚪ Inconnu';
        }
    }

    /**
     * ⚡ Charge le statut de tous les microservices Servarr.
     */
    async _loadServicesStatus(modal) {
        const container = modal.querySelector('#sh-admin-services-container');
        if (!container) return;

        const services = this._getServiceHealthDescriptors();
        this._healthServices = services;
        container.innerHTML = services.map(s => `
            <div class="sh-admin-service-card" id="sh-svc-${s.id}" data-status="unknown">
                <div class="sh-svc-top">
                    <span class="sh-svc-icon">${s.icon}</span>
                    <div class="sh-svc-status-pill unknown">
                        <span class="sh-svc-dot"></span>
                        <span>Non testé</span>
                    </div>
                </div>
                <div class="sh-svc-name">${s.name}</div>
                <div class="sh-svc-port">${s.port ? `Port ${s.port}` : 'Service Jellyfin'}</div>
            </div>
        `).join('');
    }

    _getServiceHealthDescriptors() {
        const integrations = window.SpaceHub?.integrations || {};
        return [
            { id: 'jellyfin', name: 'Jellyfin Server', icon: '🪐', port: '', check: async () => {
                const info = await window.SpaceHub?.jellyfin?.api?.getSystemInfo?.();
                return info ? 'connected' : 'offline';
            } },
            ...[
                ['sonarr', 'Sonarr (Séries)', '📺', '8989'],
                ['radarr', 'Radarr (Films)', '🎬', '7878'],
                ['prowlarr', 'Prowlarr (Indexeurs)', '⚡', '9696'],
                ['bazarr', 'Bazarr (Sous-titres)', '📝', '6767'],
                ['jellyseerr', 'Jellyseerr (Demandes)', '🍿', '5055'],
                ['qbittorrent', 'qBittorrent (Torrents)', '📥', '8080']
            ].map(([id, name, icon, port]) => ({
                id, name, icon, port,
                check: async () => integrations[id]?.checkHealth?.() || 'unconfigured'
            }))
        ];
    }

    _setServiceStatus(modal, descriptor, status, latency = null) {
        const card = modal.querySelector(`#sh-svc-${descriptor.id}`);
        if (!card) return;
        const pill = card.querySelector('.sh-svc-status-pill');
        const label = {
            connected: 'En ligne', connecting: 'Test...', unconfigured: 'Non configuré',
            auth_failed: 'Accès refusé', offline: 'Hors ligne', error: 'Erreur', unknown: 'Inconnu'
        }[status] || 'Inconnu';
        const cssStatus = ['connected', 'connecting', 'unconfigured', 'auth_failed', 'offline', 'error'].includes(status) ? status : 'unknown';
        card.dataset.status = cssStatus;
        pill?.classList.remove('online', 'connected', 'connecting', 'unconfigured', 'auth_failed', 'offline', 'error', 'unknown');
        pill?.classList.add(cssStatus);
        if (pill) pill.querySelector('span:last-child').textContent = latency !== null ? `${label} · ${latency} ms` : label;
    }

    /**
     * Teste réellement la connectivité de tous les services configurés.
     */
    async _testAllServices(modal) {
        const services = this._healthServices || this._getServiceHealthDescriptors();
        window.SpaceHub?.ui?.components?.toaster?.info?.('Test réel des services en cours...');
        await Promise.all(services.map(async descriptor => {
            this._setServiceStatus(modal, descriptor, 'connecting');
            const startedAt = performance.now();
            try {
                const status = await descriptor.check();
                this._setServiceStatus(modal, descriptor, status, Math.round(performance.now() - startedAt));
            } catch (err) {
                this._setServiceStatus(modal, descriptor, err?.status === 401 || err?.status === 403 ? 'auth_failed' : 'offline', Math.round(performance.now() - startedAt));
            }
        }));
        const statuses = services.map(s => modal.querySelector(`#sh-svc-${s.id}`)?.dataset.status);
        const failed = statuses.filter(status => !['connected'].includes(status));
        window.SpaceHub?.ui?.components?.toaster?.[failed.length ? 'warning' : 'success']?.(
            failed.length ? `${failed.length} service(s) nécessitent une vérification.` : 'Tous les services testés répondent correctement.'
        );
    }

    /**
     * Injecte les styles CSS d'élite Apple VisionOS Bento Glass pour l'Administration.
     */
    _injectStyles() {
        if (document.getElementById('sh-admin-dashboard-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-admin-dashboard-styles';
        style.textContent = `
/* ── Overlay Modal Administration Bento Glass ── */
.sh-admin-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.78);
    backdrop-filter: blur(48px) saturate(180%);
    -webkit-backdrop-filter: blur(48px) saturate(180%);
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 280ms cubic-bezier(0.16, 1, 0.3, 1);
    padding: 24px;
    box-sizing: border-box;
}

.sh-admin-modal-overlay.open {
    opacity: 1;
    pointer-events: auto;
}

.sh-admin-modal-card {
    width: 100%;
    max-width: 980px;
    max-height: 90vh;
    background: rgba(14, 14, 18, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 28px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.92), inset 0 1px 0 rgba(255, 255, 255, 0.25);
    padding: 32px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 24px;
    transform: scale(0.96) translateY(12px);
    transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
    overflow-y: auto;
}

.sh-admin-modal-overlay.open .sh-admin-modal-card {
    transform: scale(1) translateY(0);
}

/* ── En-tête ── */
.sh-admin-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 20px;
}

.sh-admin-modal-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 100px;
    font-size: 10px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
}

.sh-admin-modal-title {
    font-size: 24px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
    letter-spacing: -0.5px;
}

.sh-admin-modal-subtitle {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.55);
    margin: 4px 0 0 0;
}

.sh-admin-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.sh-admin-header-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #ffffff;
    padding: 8px 14px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    backdrop-filter: blur(12px);
    transition: all 180ms ease;
}

.sh-admin-header-btn:hover {
    background: rgba(255, 255, 255, 0.20);
    transform: translateY(-1px);
}

.sh-admin-modal-close {
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #ffffff;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 15px;
    transition: all 160ms ease;
}

.sh-admin-modal-close:hover {
    background: rgba(255, 255, 255, 0.22);
    transform: scale(1.08);
}

/* ── Bento Grid ── */
.sh-admin-bento-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 16px;
}

.sh-admin-bento-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 20px;
    padding: 20px;
    box-sizing: border-box;
    backdrop-filter: blur(20px);
}

.sh-admin-card-sessions {
    grid-column: span 12;
}

.sh-admin-card-library {
    grid-column: span 6;
}

.sh-admin-card-health {
    grid-column: span 6;
}

.sh-admin-card-services {
    grid-column: span 12;
}

@media (max-width: 768px) {
    .sh-admin-card-library,
    .sh-admin-card-health {
        grid-column: span 12;
    }
}

.sh-admin-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.sh-admin-card-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
}

.sh-admin-live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #30d158;
    box-shadow: 0 0 10px #30d158;
    animation: sh-pulse-dot 2s infinite ease-in-out;
}

@keyframes sh-pulse-dot {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.4); opacity: 0.6; }
}

.sh-admin-card-title {
    font-size: 16px;
    font-weight: 600;
    color: #ffffff;
    margin: 0;
}

.sh-admin-card-tag {
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 100px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
}

/* ── Sessions List ── */
.sh-admin-sessions-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.sh-admin-session-item {
    display: flex;
    gap: 16px;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 12px;
}

.sh-session-poster {
    width: 50px;
    height: 75px;
    border-radius: 8px;
    background: #000;
    overflow: hidden;
    flex-shrink: 0;
}

.sh-session-poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.sh-session-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.sh-session-top-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.sh-session-user {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
}

.sh-session-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 6px;
    font-weight: 600;
}

.sh-badge-direct {
    background: rgba(48, 209, 88, 0.18);
    color: #30d158;
}

.sh-badge-transcode {
    background: rgba(255, 159, 10, 0.18);
    color: #ff9f0a;
}

.sh-session-title {
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
    margin: 0;
}

.sh-session-progress-wrapper {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    overflow: hidden;
}

.sh-session-progress-bar {
    height: 100%;
    background: #ffffff;
    border-radius: 10px;
}

.sh-session-time-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
}

.sh-session-item-actions {
    display: flex;
    gap: 8px;
}

.sh-session-btn-msg,
.sh-session-btn-stop {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ffffff;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 11px;
    cursor: pointer;
    transition: all 140ms ease;
}

.sh-session-btn-msg:hover {
    background: rgba(255, 255, 255, 0.18);
}

.sh-session-btn-stop:hover {
    background: rgba(255, 69, 58, 0.25);
    border-color: rgba(255, 69, 58, 0.4);
    color: #ff453a;
}

.sh-admin-empty-state {
    text-align: center;
    padding: 28px 16px;
    color: rgba(255, 255, 255, 0.7);
}

.sh-admin-empty-icon {
    font-size: 28px;
    margin-bottom: 8px;
}

/* ── Metrics Grid ── */
.sh-admin-metrics-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
}

.sh-admin-metric-pill {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 12px;
}

.sh-admin-metric-icon {
    font-size: 22px;
}

.sh-admin-metric-data strong {
    display: block;
    font-size: 18px;
    color: #ffffff;
}

.sh-admin-metric-data small {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
}

.sh-admin-mini-action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #ffffff;
    padding: 6px 12px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 160ms ease;
}

.sh-admin-mini-action-btn:hover {
    background: rgba(255, 255, 255, 0.20);
}

/* ── Health List ── */
.sh-admin-health-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.sh-admin-health-item {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 12px;
}

.sh-admin-health-icon {
    font-size: 18px;
}

.sh-admin-health-info {
    flex: 1;
}

.sh-admin-health-info strong {
    display: block;
    font-size: 13px;
    color: #ffffff;
}

.sh-admin-health-info span {
    display: block;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 2px;
}

.sh-admin-health-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #ffffff;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 140ms ease;
}

.sh-admin-health-btn:hover {
    background: rgba(255, 255, 255, 0.18);
}

.sh-admin-card-badge-health {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 100px;
    font-weight: 600;
}

/* ── Services Grid ── */
.sh-admin-services-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 12px;
}

.sh-admin-service-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: transform 180ms ease, border-color 180ms ease;
}

.sh-admin-service-card:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.20);
}

.sh-svc-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.sh-svc-icon {
    font-size: 18px;
}

.sh-svc-status-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 100px;
}

.sh-svc-status-pill.online {
    background: rgba(48, 209, 88, 0.15);
    color: #30d158;
}

.sh-svc-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
}

.sh-svc-name {
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sh-svc-port {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.45);
}

/* ── Footer ── */
.sh-admin-modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 20px;
}

.sh-admin-console-link-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    color: var(--sh-color-primary, #64d2ff);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    padding: 6px 0;
    transition: opacity 160ms ease;
}

.sh-admin-console-link-btn:hover {
    opacity: 0.8;
    text-decoration: underline;
}

.sh-admin-close-btn-main {
    background: #ffffff;
    border: none;
    color: #000000;
    padding: 10px 24px;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 180ms ease;
}

.sh-admin-close-btn-main:hover {
    transform: scale(1.04);
    box-shadow: 0 6px 20px rgba(255, 255, 255, 0.35);
}
        `;
        document.head.appendChild(style);
    }
}

export default AdminDashboardView;
