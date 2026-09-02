'use strict';

import JellyfinConsoleModal from './JellyfinConsoleModal.js';
import { escapeHtml } from '../../core/utils/domUtils.js';

import './AdminDashboardView.css';
import * as svc from '../../core/services.js';
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
        const user = svc.auth()?.getUser?.();
        if (user?.Policy?.IsAdministrator !== true) {
            svc.toaster()?.error?.('Accès réservé aux administrateurs Jellyfin.');
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
            const spatialNav = svc.nav() || svc.nav();
            if (spatialNav) spatialNav.onModalOpened(modal, modal.querySelector('#sh-admin-btn-refresh'));
        });

        // Événements de fermeture
        const closeModal = () => {
            if (this._refreshTimer) {
                clearInterval(this._refreshTimer);
                this._refreshTimer = null;
            }
            modal.classList.remove('open');
            const spatialNav = svc.nav() || svc.nav();
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
            svc.toaster()?.info?.('Données d\'administration actualisées');
        });

        modal.querySelector('#sh-admin-btn-scan-library')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.style.opacity = '0.6';
            const jfApi = svc.jellyfinApi();
            const success = await jfApi?.refreshLibrary?.();
            if (success) {
                svc.toaster()?.success?.('Scan de la médiathèque Jellyfin lancé !');
            } else {
                svc.toaster()?.error?.('Impossible de lancer le scan Jellyfin');
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
            const bazarr = svc.integration('bazarr');
            try {
                if (typeof bazarr?.sync === 'function') {
                    await bazarr.sync();
                    svc.toaster()?.success?.('Synchronisation Bazarr effectuée !');
                } else {
                    svc.toaster()?.info?.('Bazarr non configuré ou inactif.');
                }
            } catch (err) {
                console.error('[AdminDashboardView] Erreur sync Bazarr:', err);
                svc.toaster()?.error?.(`Erreur Bazarr : ${escapeHtml(err?.message || 'Échec de synchronisation')}`);
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
        const jfApi = svc.jellyfinApi();
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

        const jfApi = svc.jellyfinApi();
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
                        <small style="color:rgba(var(--sh-ink, 255, 255, 255), 0.45);">Le serveur est en veille active. Les flux apparaîtront ici en direct dès qu'un utilisateur lance un média.</small>
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
                            <img decoding="async" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(title)}" onerror="this.style.display='none'" />
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
                        svc.toaster()?.success?.('Session de lecture interrompue.');
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
                        svc.toaster()?.success?.('Message envoyé à l\'utilisateur !');
                    }
                });
            });

        } catch (e) {
            container.innerHTML = '<p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.5); padding:16px;">Impossible de contacter l\'API des sessions.</p>';
        }
    }

    /**
     * 💾 Charge le décompte des médias.
     */
    async _loadItemCounts(modal) {
        const jfApi = svc.jellyfinApi();
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
            const bazarr = svc.integration('bazarr');
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
                badge.style.background = 'rgba(var(--sh-ink, 255, 255, 255),  0.10)';
                badge.style.color = 'rgba(var(--sh-ink, 255, 255, 255),  0.75)';
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
                const info = await svc.jellyfinApi()?.getSystemInfo?.();
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
        svc.toaster()?.info?.('Test réel des services en cours...');
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
        svc.toaster()?.[failed.length ? 'warning' : 'success']?.(
            failed.length ? `${failed.length} service(s) nécessitent une vérification.` : 'Tous les services testés répondent correctement.'
        );
    }

    /**
     * Injecte les styles CSS d'élite Apple VisionOS Bento Glass pour l'Administration.
     */
    _injectStyles() {
        // Les styles de ce composant vivent désormais dans AdminDashboardView.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default AdminDashboardView;
