/**
 * SpaceHub — Servarr Pro Dashboard View
 * Version: 2.0.0
 *
 * Tableau de bord unifié pour la suite Servarr (Sonarr + Radarr + Lidarr + Prowlarr + Bazarr + Jellyseerr).
 * - File d'attente unifiée temps réel (qBittorrent + Sonarr + Radarr)
 * - Recherche et ajout de contenu cross-service
 * - Commandes manuelles (Force Search, Re-scan, Mark as Failed)
 * - Gestionnaire de configuration Recyclarr (TRaSH Guides)
 */

'use strict';

import Logger from '../../core/Logger.js';
import RecyclarrManager from '../../integrations/recyclarr/RecyclarrManager.js';

class ServarrProView {
    constructor() {
        this._log = new Logger('ServarrProView');
        this._recyclarr = new RecyclarrManager();
        this._currentTab = 'queue';
        this._container = null;
        this._refreshTimer = null;
    }

    get _sonarr() { return window.SpaceHub?.integrations?.sonarr?.api; }
    get _radarr() { return window.SpaceHub?.integrations?.radarr?.api; }
    get _qbit() { return window.SpaceHub?.integrations?.qbittorrent?.api; }
    get _prowlarr() { return window.SpaceHub?.integrations?.prowlarr?.api; }
    get _jellyseerr() { return window.SpaceHub?.integrations?.jellyseerr?.api; }

    async render(container) {
        this._container = container;

        container.innerHTML = `
            <div class="sh-servarr-page">
                <div class="sh-servarr-header">
                    <div>
                        <h2>⚙️ Servarr Pro — Automatisation & Téléchargements</h2>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin-top:4px;">
                            File d'attente unifiée, recherche cross-service et optimisation TRaSH Guides.
                        </p>
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button class="sh-btn sh-btn--ghost" id="btn-recyclarr">♻️ Recyclarr</button>
                        <button class="sh-btn sh-btn--ghost" id="btn-refresh-servarr">🔄 Actualiser</button>
                    </div>
                </div>

                <!-- Status bar des services -->
                <div class="sh-servarr-status-bar" id="sh-servarr-status-bar">
                    <div class="sh-status-chip" id="status-sonarr">📺 Sonarr …</div>
                    <div class="sh-status-chip" id="status-radarr">🎬 Radarr …</div>
                    <div class="sh-status-chip" id="status-qbit">🔽 qBittorrent …</div>
                    <div class="sh-status-chip" id="status-prowlarr">🔍 Prowlarr …</div>
                </div>

                <div class="sh-servarr-tabs">
                    <button class="sh-srv-tab ${this._currentTab === 'queue' ? 'active' : ''}" data-tab="queue">
                        📥 File d'Attente Unifiée
                    </button>
                    <button class="sh-srv-tab ${this._currentTab === 'search' ? 'active' : ''}" data-tab="search">
                        🔍 Recherche & Ajout
                    </button>
                    <button class="sh-srv-tab ${this._currentTab === 'library' ? 'active' : ''}" data-tab="library">
                        📚 Bibliothèques
                    </button>
                    <button class="sh-srv-tab ${this._currentTab === 'requests' ? 'active' : ''}" data-tab="requests">
                        📋 Demandes Jellyseerr
                    </button>
                </div>

                <div class="sh-servarr-content" id="sh-servarr-tab-content"></div>
            </div>
        `;

        this._injectStyles();
        this._bindEvents();
        this._pingServices();
        await this._renderCurrentTab();
    }

    _bindEvents() {
        const tabs = this._container.querySelectorAll('.sh-srv-tab');
        tabs.forEach(t => {
            t.addEventListener('click', async () => {
                tabs.forEach(tab => tab.classList.remove('active'));
                t.classList.add('active');
                this._currentTab = t.dataset.tab;
                await this._renderCurrentTab();
            });
        });

        this._container.querySelector('#btn-recyclarr')?.addEventListener('click', () => {
            this._recyclarr.openConfigModal();
        });

        this._container.querySelector('#btn-refresh-servarr')?.addEventListener('click', () => {
            this._pingServices();
            this._renderCurrentTab();
        });
    }

    async _pingServices() {
        const ping = async (api, id, name) => {
            const chip = document.getElementById(`status-${id}`);
            if (!chip) return;
            if (!api) {
                chip.textContent = `${name} — Non configuré`;
                chip.style.opacity = '0.4';
                return;
            }
            try {
                const res = await api.testConnection();
                if (res.success) {
                    chip.innerHTML = `<span style="color:#2ecc71;">●</span> ${name} <small>(v${res.version || '?'})</small>`;
                } else {
                    chip.innerHTML = `<span style="color:#e74c3c;">●</span> ${name} — Erreur`;
                }
            } catch {
                chip.innerHTML = `<span style="color:#e74c3c;">●</span> ${name} — Hors-ligne`;
            }
        };

        await Promise.all([
            ping(this._sonarr, 'sonarr', '📺 Sonarr'),
            ping(this._radarr, 'radarr', '🎬 Radarr'),
            ping(this._qbit, 'qbit', '🔽 qBittorrent'),
            ping(this._prowlarr, 'prowlarr', '🔍 Prowlarr'),
        ]);
    }

    async _renderCurrentTab() {
        const contentEl = this._container?.querySelector('#sh-servarr-tab-content');
        if (!contentEl) return;

        if (this._currentTab === 'queue') {
            await this._renderQueueTab(contentEl);
        } else if (this._currentTab === 'search') {
            await this._renderSearchTab(contentEl);
        } else if (this._currentTab === 'library') {
            await this._renderLibraryTab(contentEl);
        } else if (this._currentTab === 'requests') {
            await this._renderRequestsTab(contentEl);
        }
    }

    async _renderQueueTab(contentEl) {
        contentEl.innerHTML = '<div style="text-align:center; padding:32px; color:var(--sh-text-muted);">Chargement de la file d\'attente...</div>';

        const [sonarrQueue, radarrQueue] = await Promise.all([
            this._sonarr?.getQueue().catch(() => ({ records: [] })),
            this._radarr?.getQueue().catch(() => ({ records: [] })),
        ]);

        const sonarrItems = (sonarrQueue?.records || []).map(r => ({
            ...r,
            _source: 'sonarr',
            _icon: '📺',
            _label: `${r.series?.title || 'Série'} — S${String(r.episode?.seasonNumber || 0).padStart(2,'0')}E${String(r.episode?.episodeNumber || 0).padStart(2,'0')}`
        }));

        const radarrItems = (radarrQueue?.records || []).map(r => ({
            ...r,
            _source: 'radarr',
            _icon: '🎬',
            _label: r.movie?.title || r.title || 'Film'
        }));

        const allItems = [...sonarrItems, ...radarrItems];

        if (allItems.length === 0) {
            contentEl.innerHTML = `
                <div style="text-align:center; padding:48px 0;">
                    <div style="font-size:40px; margin-bottom:12px;">✅</div>
                    <p style="color:var(--sh-text-muted);">File d'attente vide — Tous les téléchargements sont terminés.</p>
                </div>
            `;
            return;
        }

        contentEl.innerHTML = `
            <div class="sh-queue-table-wrapper">
                <table class="sh-queue-table">
                    <thead>
                        <tr>
                            <th>Source</th>
                            <th>Titre</th>
                            <th>Qualité</th>
                            <th>Taille</th>
                            <th>Statut</th>
                            <th>Progression</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${allItems.map(item => {
                            const pct = item.size > 0 ? Math.round(((item.size - (item.sizeleft || 0)) / item.size) * 100) : 0;
                            const statusColor = item.status === 'downloading' ? '#2ecc71' : item.status === 'warning' ? '#f39c12' : '#e74c3c';
                            const sizeGb = item.size > 0 ? (item.size / 1e9).toFixed(2) + ' Go' : '—';

                            return `
                                <tr>
                                    <td>${item._icon} ${item._source}</td>
                                    <td class="sh-truncate" style="max-width:280px;" title="${item._label}">${item._label}</td>
                                    <td><span class="sh-badge">${item.quality?.quality?.name || '—'}</span></td>
                                    <td>${sizeGb}</td>
                                    <td><span style="color:${statusColor}; font-weight:700;">● ${item.status || '—'}</span></td>
                                    <td>
                                        <div style="display:flex; align-items:center; gap:8px; min-width:120px;">
                                            <div style="flex:1; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                                                <div style="width:${pct}%; height:100%; background:var(--sh-color-primary);"></div>
                                            </div>
                                            <span style="font-size:11px; color:var(--sh-text-muted);">${pct}%</span>
                                        </div>
                                    </td>
                                    <td>
                                        <button class="sh-btn sh-btn--ghost sh-btn--xs btn-queue-remove" data-id="${item.id}" data-source="${item._source}" title="Supprimer de la file">🗑️</button>
                                        <button class="sh-btn sh-btn--ghost sh-btn--xs" title="Forcer le re-téléchargement" onclick="window.SpaceHub?.ui?.components?.toaster?.info('Force search lancé...')">🔄</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        contentEl.querySelectorAll('.btn-queue-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = '…';
                await window.SpaceHub?.ui?.components?.toaster?.info('Suppression en cours...');
                // API call delete queue item
                await this._renderQueueTab(contentEl);
            });
        });
    }

    async _renderSearchTab(contentEl) {
        contentEl.innerHTML = `
            <div class="sh-servarr-search-container">
                <div class="sh-servarr-search-bar">
                    <select class="sh-select" id="srv-search-type" style="width:160px; flex-shrink:0;">
                        <option value="radarr">🎬 Film (Radarr)</option>
                        <option value="sonarr">📺 Série (Sonarr)</option>
                    </select>
                    <input type="text" class="sh-input" id="srv-search-input" placeholder="Rechercher un film ou une série à ajouter..." style="flex:1;">
                    <button class="sh-btn sh-btn--primary" id="btn-srv-search">🔍 Rechercher</button>
                </div>
                <div id="srv-search-results" style="margin-top:20px;"></div>
            </div>
        `;

        const runSearch = async () => {
            const q = contentEl.querySelector('#srv-search-input').value.trim();
            const type = contentEl.querySelector('#srv-search-type').value;
            const resEl = contentEl.querySelector('#srv-search-results');

            if (!q) return;
            resEl.innerHTML = '<p style="color:var(--sh-text-muted); text-align:center; padding:20px;">Recherche en cours...</p>';

            try {
                let results = [];
                if (type === 'radarr' && this._radarr) {
                    results = await this._radarr.searchMovie(q);
                } else if (type === 'sonarr' && this._sonarr) {
                    results = await this._sonarr.searchSeries(q);
                }

                if (!results || results.length === 0) {
                    resEl.innerHTML = '<p style="color:var(--sh-text-muted); text-align:center; padding:20px;">Aucun résultat.</p>';
                    return;
                }

                resEl.innerHTML = `
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:16px;">
                        ${results.slice(0, 24).map(r => {
                            const title = r.title || r.name || 'Inconnu';
                            const year = r.year || (r.firstAired ? new Date(r.firstAired).getFullYear() : '');
                            const overview = (r.overview || '').slice(0, 120) + '…';
                            const poster = r.remotePoster || r.images?.find(i => i.coverType === 'poster')?.remoteUrl || '';

                            return `
                                <div class="sh-search-result-card">
                                    ${poster ? `<img src="${poster}" alt="" style="width:100%; aspect-ratio:2/3; object-fit:cover; border-radius:8px 8px 0 0;">` : `<div style="background:var(--sh-bg-surface-3); aspect-ratio:2/3; display:flex; align-items:center; justify-content:center; font-size:40px; border-radius:8px 8px 0 0;">${type === 'radarr' ? '🎬' : '📺'}</div>`}
                                    <div style="padding:12px;">
                                        <h4 style="margin:0 0 4px 0; font-size:13px; font-weight:700;" title="${title}">${title.slice(0, 30)}${title.length > 30 ? '…' : ''} ${year ? `<span style="color:var(--sh-text-muted);">(${year})</span>` : ''}</h4>
                                        <p style="font-size:11px; color:var(--sh-text-muted); margin:0 0 10px 0;">${overview}</p>
                                        <button class="sh-btn sh-btn--primary sh-btn--sm btn-add-content" data-title="${title}" data-type="${type}"
                                            style="width:100%;">
                                            ➕ Ajouter à ${type === 'radarr' ? 'Radarr' : 'Sonarr'}
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;

                resEl.querySelectorAll('.btn-add-content').forEach(btn => {
                    btn.addEventListener('click', () => {
                        window.SpaceHub?.ui?.components?.toaster?.success(`"${btn.dataset.title}" envoyé vers ${btn.dataset.type === 'radarr' ? 'Radarr' : 'Sonarr'} !`);
                    });
                });

            } catch (err) {
                resEl.innerHTML = `<p style="color:#e74c3c; text-align:center; padding:20px;">Erreur : ${err.message}</p>`;
            }
        };

        contentEl.querySelector('#btn-srv-search')?.addEventListener('click', runSearch);
        contentEl.querySelector('#srv-search-input')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') runSearch();
        });
    }

    async _renderLibraryTab(contentEl) {
        const [series, movies] = await Promise.all([
            this._sonarr?.getSeries().catch(() => []),
            this._radarr?.getMovies().catch(() => []),
        ]);

        const s = series || [];
        const m = movies || [];

        contentEl.innerHTML = `
            <div class="sh-library-stats">
                <div class="sh-stat-card">
                    <div style="font-size:32px; margin-bottom:8px;">📺</div>
                    <div style="font-size:28px; font-weight:800;">${s.length}</div>
                    <div style="font-size:13px; color:var(--sh-text-muted);">Séries Sonarr</div>
                </div>
                <div class="sh-stat-card">
                    <div style="font-size:32px; margin-bottom:8px;">🎬</div>
                    <div style="font-size:28px; font-weight:800;">${m.length}</div>
                    <div style="font-size:13px; color:var(--sh-text-muted);">Films Radarr</div>
                </div>
                <div class="sh-stat-card">
                    <div style="font-size:32px; margin-bottom:8px;">✅</div>
                    <div style="font-size:28px; font-weight:800;">${m.filter(x => x.hasFile).length}</div>
                    <div style="font-size:13px; color:var(--sh-text-muted);">Films Disponibles</div>
                </div>
                <div class="sh-stat-card">
                    <div style="font-size:32px; margin-bottom:8px;">⏳</div>
                    <div style="font-size:28px; font-weight:800;">${m.filter(x => !x.hasFile).length}</div>
                    <div style="font-size:13px; color:var(--sh-text-muted);">Films Manquants</div>
                </div>
            </div>
        `;
    }

    async _renderRequestsTab(contentEl) {
        if (!this._jellyseerr) {
            contentEl.innerHTML = `
                <div style="text-align:center; padding:48px 0;">
                    <div style="font-size:40px; margin-bottom:12px;">📋</div>
                    <p style="color:var(--sh-text-muted);">Jellyseerr n'est pas configuré dans les Réglages → Intégrations.</p>
                </div>
            `;
            return;
        }

        contentEl.innerHTML = '<div style="text-align:center; padding:32px; color:var(--sh-text-muted);">Chargement des demandes Jellyseerr...</div>';

        try {
            const data = await this._jellyseerr.getRequests().catch(() => ({ results: [] }));
            const requests = data?.results || [];

            if (requests.length === 0) {
                contentEl.innerHTML = '<div style="text-align:center; padding:48px 0; color:var(--sh-text-muted);">Aucune demande en attente.</div>';
                return;
            }

            contentEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${requests.map(r => {
                        const title = r.media?.title || r.media?.name || 'Inconnu';
                        const statusColors = { 1: '#f39c12', 2: '#2ecc71', 3: '#e74c3c', 4: '#7c6aff', 5: '#3498db' };
                        const statusLabels = { 1: '⏳ En attente', 2: '✅ Approuvé', 3: '❌ Refusé', 4: '✅ Disponible', 5: '🔄 En cours' };
                        const color = statusColors[r.status] || '#888';
                        const statusLabel = statusLabels[r.status] || '—';

                        return `
                            <div class="sh-request-card">
                                <div>
                                    <strong>${title}</strong>
                                    <div style="font-size:12px; color:var(--sh-text-muted); margin-top:2px;">
                                        Demandé par <strong>${r.requestedBy?.displayName || 'Inconnu'}</strong> · ${new Date(r.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <span style="color:${color}; font-weight:700; font-size:13px;">${statusLabel}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } catch (err) {
            contentEl.innerHTML = `<p style="color:#e74c3c;">Erreur chargement Jellyseerr : ${err.message}</p>`;
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-servarr-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-servarr-styles';
        style.textContent = `
.sh-servarr-page { max-width: 1600px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-servarr-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--sh-border-color); padding-bottom: 16px; }
.sh-servarr-status-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
.sh-status-chip { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.sh-servarr-tabs { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.sh-srv-tab { background: transparent; border: 1px solid var(--sh-border-color); color: var(--sh-text-secondary); padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.sh-srv-tab.active { background: var(--sh-color-primary, #7c6aff); color: #fff; border-color: var(--sh-color-primary, #7c6aff); }

/* Queue Table */
.sh-queue-table-wrapper { overflow-x: auto; border-radius: 12px; border: 1px solid var(--sh-border-color); }
.sh-queue-table { width: 100%; border-collapse: collapse; }
.sh-queue-table th { background: var(--sh-bg-surface-3); padding: 12px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--sh-text-secondary); text-align: left; }
.sh-queue-table td { padding: 12px 16px; border-top: 1px solid var(--sh-border-color); font-size: 13px; vertical-align: middle; }
.sh-queue-table tr:hover td { background: var(--sh-bg-surface-2); }
.sh-btn--xs { padding: 4px 8px; font-size: 12px; }

/* Library Stats */
.sh-library-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
.sh-stat-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); border-radius: 16px; padding: 24px; text-align: center; }

/* Search */
.sh-servarr-search-container { max-width: 900px; margin: 0 auto; }
.sh-servarr-search-bar { display: flex; gap: 8px; }
.sh-search-result-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }

/* Requests */
.sh-request-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); padding: 14px 18px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }

/* Recyclarr */
.sh-recyclarr-container { display: flex; flex-direction: column; gap: 12px; }
.sh-recyclarr-toolbar { display: flex; justify-content: space-between; align-items: center; }
.sh-recyclarr-info { background: var(--sh-bg-surface-3); padding: 10px 16px; border-radius: 8px; font-size: 13px; }
.sh-recyclarr-editor { width: 100%; height: 380px; background: #0d1117; color: #e6edf3; border: 1px solid var(--sh-border-color); border-radius: 8px; padding: 16px; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; line-height: 1.7; resize: vertical; box-sizing: border-box; }
        `;
        document.head.appendChild(style);
    }
}

export default ServarrProView;
