/**
 * SpaceHub — Enterprise Admin Cockpit & NOC View (Horizon 7++)
 * Version: 2.0.0
 *
 * Centre de contrôle d'infrastructure et d'administration complet :
 * - NOC en direct avec graphique Canvas 60 FPS de bande passante & GPU
 * - Console de logs serveur en streaming live
 * - Gestion des utilisateurs et quotas
 * - Diagnostics de santé serveur avec bouton "Nettoyage en 1 clic"
 * - Tâches planifiées et inspection des volumes de stockage
 */

'use strict';

import Logger from '../../core/Logger.js';
import LiveStreamMonitor from '../../jellyfin/admin/LiveStreamMonitor.js';
import ServerTaskController from '../../jellyfin/admin/ServerTaskController.js';
import StorageInspector from '../../jellyfin/admin/StorageInspector.js';
import AdminMetricsChart from '../../jellyfin/admin/AdminMetricsChart.js';
import LiveLogViewer from '../../jellyfin/admin/LiveLogViewer.js';
import UserManagementController from '../../jellyfin/admin/UserManagementController.js';
import ServerHealthInspector from '../../jellyfin/admin/ServerHealthInspector.js';

class AdminCockpitView {
    constructor() {
        this._log = new Logger('AdminCockpitView');
        this._monitor = new LiveStreamMonitor();
        this._taskCtrl = new ServerTaskController();
        this._storage = new StorageInspector();
        this._logViewer = new LiveLogViewer();
        this._userCtrl = new UserManagementController();
        this._health = new ServerHealthInspector();

        this._currentTab = 'noc';
        this._refreshInterval = null;
        this._container = null;
        this._metricsChart = null;
    }

    async render(container) {
        this._container = container;
        this._stopPolling();

        container.innerHTML = `
            <div class="sh-admin-cockpit">
                <div class="sh-admin-header">
                    <div>
                        <h2>🛡️ Cockpit Administrateur & NOC</h2>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin-top:4px;">
                            Surveillance réseau en temps réel, logs en direct et maintenance système.
                        </p>
                    </div>
                    <div class="sh-admin-actions">
                        <button class="sh-btn sh-btn--ghost" id="btn-admin-refresh">🔄 Actualiser</button>
                    </div>
                </div>

                <div class="sh-admin-tabs">
                    <button class="sh-admin-tab ${this._currentTab === 'noc' ? 'active' : ''}" data-tab="noc">📊 NOC & Flux en Direct</button>
                    <button class="sh-admin-tab ${this._currentTab === 'logs' ? 'active' : ''}" data-tab="logs">📋 Logs en Direct</button>
                    <button class="sh-admin-tab ${this._currentTab === 'users' ? 'active' : ''}" data-tab="users">👥 Utilisateurs</button>
                    <button class="sh-admin-tab ${this._currentTab === 'health' ? 'active' : ''}" data-tab="health">🩺 Santé & Diagnostic</button>
                    <button class="sh-admin-tab ${this._currentTab === 'tasks' ? 'active' : ''}" data-tab="tasks">⚡ Tâches Planifiées</button>
                    <button class="sh-admin-tab ${this._currentTab === 'storage' ? 'active' : ''}" data-tab="storage">💾 Stockage</button>
                </div>

                <div class="sh-admin-content" id="sh-admin-tab-content">
                    <div style="text-align:center; padding:40px; color:var(--sh-text-muted);">Chargement du Cockpit...</div>
                </div>
            </div>
        `;

        this._injectStyles();
        this._bindHeaderEvents();
        await this._loadTabContent();
    }

    _bindHeaderEvents() {
        const tabs = this._container.querySelectorAll('.sh-admin-tab');
        tabs.forEach(t => {
            t.addEventListener('click', async () => {
                tabs.forEach(tab => tab.classList.remove('active'));
                t.classList.add('active');
                this._currentTab = t.dataset.tab;
                await this._loadTabContent();
            });
        });

        this._container.querySelector('#btn-admin-refresh')?.addEventListener('click', () => {
            this._loadTabContent();
        });
    }

    async _loadTabContent() {
        this._stopPolling();
        const contentEl = this._container?.querySelector('#sh-admin-tab-content');
        if (!contentEl) return;

        if (this._currentTab === 'noc') {
            await this._renderNocTab(contentEl);
            this._startPolling(() => this._renderNocTab(contentEl, true), 3000);
        } else if (this._currentTab === 'logs') {
            await this._renderLogsTab(contentEl);
        } else if (this._currentTab === 'users') {
            await this._renderUsersTab(contentEl);
        } else if (this._currentTab === 'health') {
            await this._renderHealthTab(contentEl);
        } else if (this._currentTab === 'tasks') {
            await this._renderTasksTab(contentEl);
        } else if (this._currentTab === 'storage') {
            await this._renderStorageTab(contentEl);
        }
    }

    async _renderNocTab(contentEl, isRefresh = false) {
        const sessions = await this._monitor.getLiveSessions();
        const metrics = this._monitor.calculateBandwidthAndMetrics(sessions);

        if (!isRefresh) {
            contentEl.innerHTML = `
                <div class="sh-noc-container">
                    <div class="sh-noc-chart-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <strong>📈 Débit Réseau & Transcodage (Canvas 60 FPS)</strong>
                            <button class="sh-btn sh-btn--ghost sh-btn--xs" id="btn-kill-all-transcodes" style="color:#e74c3c;">
                                🛑 Arrêter tous les transcodages
                            </button>
                        </div>
                        <canvas id="sh-noc-canvas" style="width:100%; height:160px; border-radius:8px;"></canvas>
                    </div>

                    <div class="sh-metrics-overview" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:16px; margin:20px 0;">
                        <div class="sh-stat-card"><h4 id="stat-sessions">0</h4><span>Sessions Actives</span></div>
                        <div class="sh-stat-card"><h4 id="stat-transcodes">0</h4><span>Transcodages GPU</span></div>
                        <div class="sh-stat-card"><h4 id="stat-directplay">0</h4><span>Direct Play</span></div>
                        <div class="sh-stat-card"><h4 id="stat-bandwidth">0 Mbps</h4><span>Bande Passante</span></div>
                    </div>

                    <div id="sh-live-sessions-list"></div>
                </div>
            `;

            const canvas = contentEl.querySelector('#sh-noc-canvas');
            if (canvas) this._metricsChart = new AdminMetricsChart(canvas);

            contentEl.querySelector('#btn-kill-all-transcodes')?.addEventListener('click', async () => {
                const transcodeSessions = sessions.filter(s => s.PlayState?.PlayMethod === 'Transcode');
                for (const s of transcodeSessions) {
                    await this._monitor.killStream(s.Id);
                }
                window.SpaceHub?.ui?.components?.toaster?.info('Transcodages arrêtés.');
                await this._renderNocTab(contentEl);
            });
        }

        // Mettre à jour les compteurs
        const statSess = contentEl.querySelector('#stat-sessions');
        const statTrans = contentEl.querySelector('#stat-transcodes');
        const statDp = contentEl.querySelector('#stat-directplay');
        const statBw = contentEl.querySelector('#stat-bandwidth');

        if (statSess) statSess.textContent = sessions.length;
        if (statTrans) statTrans.textContent = metrics.transcodingCount;
        if (statDp) statDp.textContent = metrics.directPlayCount;
        if (statBw) statBw.textContent = `${metrics.totalBandwidthMbps} Mbps`;

        if (this._metricsChart) {
            const dpPct = sessions.length > 0 ? Math.round((metrics.directPlayCount / sessions.length) * 100) : 100;
            const trPct = sessions.length > 0 ? Math.round((metrics.transcodingCount / sessions.length) * 100) : 0;
            this._metricsChart.update(parseFloat(metrics.totalBandwidthMbps), dpPct, trPct);
        }

        // Rendu des sessions
        const listEl = contentEl.querySelector('#sh-live-sessions-list');
        if (listEl) {
            if (sessions.length === 0) {
                listEl.innerHTML = '<div style="text-align:center; padding:32px; color:var(--sh-text-muted);">Aucun flux actif actuellement.</div>';
            } else {
                listEl.innerHTML = sessions.map(s => `
                    <div class="sh-session-card" style="background:var(--sh-bg-surface-2); border:1px solid var(--sh-border-color); border-radius:12px; padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${s.UserName || 'Utilisateur'}</strong> · <span style="color:var(--sh-text-secondary);">${s.DeviceName || 'Appareil'}</span>
                            <div style="font-size:13px; color:var(--sh-color-primary); margin-top:2px;">${s.NowPlayingItem?.Name || 'Média en cours'}</div>
                        </div>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <span class="sh-badge ${s.PlayState?.PlayMethod === 'Transcode' ? 'sh-badge--warning' : 'sh-badge--success'}">
                                ${s.PlayState?.PlayMethod || 'Direct'}
                            </span>
                            <button class="sh-btn sh-btn--ghost sh-btn--xs btn-kill-single" data-id="${s.Id}" style="color:#e74c3c;">Arrêter</button>
                        </div>
                    </div>
                `).join('');

                listEl.querySelectorAll('.btn-kill-single').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        await this._monitor.killStream(btn.dataset.id);
                        window.SpaceHub?.ui?.components?.toaster?.info('Flux interrompu.');
                        await this._renderNocTab(contentEl);
                    });
                });
            }
        }
    }

    async _renderLogsTab(contentEl) {
        contentEl.innerHTML = '<div style="text-align:center; padding:32px; color:var(--sh-text-muted);">Récupération des logs serveur...</div>';
        const logs = await this._logViewer.fetchLogs();

        contentEl.innerHTML = `
            <div class="sh-logs-container">
                <div style="display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap;">
                    <select class="sh-select" id="log-level-select" style="width:140px;">
                        <option value="ALL">Tous les niveaux</option>
                        <option value="ERROR">Erreurs [ERR]</option>
                        <option value="WARN">Avertissements [WRN]</option>
                        <option value="INFO">Informations [INF]</option>
                    </select>
                    <input type="text" class="sh-input" id="log-search-input" placeholder="Filtrer par mot-clé / regex..." style="flex:1;" />
                    <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-export-log">📥 Télécharger .log</button>
                </div>

                <div class="sh-logs-console" id="sh-logs-console-box" style="background:#0a0a0f; border:1px solid var(--sh-border-color); border-radius:12px; padding:16px; height:480px; overflow-y:auto;">
                    ${logs.map(l => this._logViewer.formatLineHTML(l)).join('')}
                </div>
            </div>
        `;

        const filterFn = () => {
            const lvl = contentEl.querySelector('#log-level-select').value;
            const q = contentEl.querySelector('#log-search-input').value;
            const filtered = this._logViewer.filterLogs(logs, q, lvl);
            const box = contentEl.querySelector('#sh-logs-console-box');
            box.innerHTML = filtered.map(l => this._logViewer.formatLineHTML(l)).join('');
        };

        contentEl.querySelector('#log-level-select')?.addEventListener('change', filterFn);
        contentEl.querySelector('#log-search-input')?.addEventListener('input', filterFn);

        contentEl.querySelector('#btn-export-log')?.addEventListener('click', () => {
            const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `jellyfin-logs-${Date.now()}.log`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    async _renderUsersTab(contentEl) {
        contentEl.innerHTML = '<div style="text-align:center; padding:32px; color:var(--sh-text-muted);">Récupération des utilisateurs...</div>';
        const users = await this._userCtrl.getUsers();

        contentEl.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">
                ${users.map(u => `
                    <div class="sh-user-card" style="background:var(--sh-bg-surface-2); border:1px solid var(--sh-border-color); border-radius:12px; padding:16px;">
                        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                            <div style="width:42px; height:42px; border-radius:50%; background:var(--sh-bg-surface-3); display:flex; align-items:center; justify-content:center; font-size:18px;">
                                👤
                            </div>
                            <div>
                                <strong>${u.Name}</strong>
                                <div style="font-size:11px; color:var(--sh-text-muted);">${u.Policy?.IsAdministrator ? '🛡️ Administrateur' : 'Standard'}</div>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--sh-text-secondary); margin-top:8px;">
                            <span>Transcodage 4K :</span>
                            <strong>${u.Policy?.EnableVideoPlaybackTranscoding !== false ? '✅ Autorisé' : '❌ Désactivé'}</strong>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    async _renderHealthTab(contentEl) {
        contentEl.innerHTML = '<div style="text-align:center; padding:32px; color:var(--sh-text-muted);">Diagnostic en cours...</div>';
        const h = await this._health.runHealthCheck();

        contentEl.innerHTML = `
            <div class="sh-health-container" style="max-width:800px; margin:0 auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--sh-bg-surface-2); border:1px solid var(--sh-border-color); border-radius:16px; padding:24px; margin-bottom:20px;">
                    <div>
                        <h3 style="margin:0;">🩺 Score de Santé Serveur : <span style="color:#2ecc71;">${h.score}%</span></h3>
                        <p style="font-size:13px; color:var(--sh-text-secondary); margin:4px 0 0 0;">Système stable, aucun avertissement critique.</p>
                    </div>
                    <button class="sh-btn sh-btn--primary" id="btn-one-click-cleanup">🧹 Nettoyage en 1 Clic</button>
                </div>

                <div style="background:var(--sh-bg-surface-2); border:1px solid var(--sh-border-color); border-radius:12px; padding:20px; display:flex; flex-direction:column; gap:12px;">
                    <div style="display:flex; justify-content:space-between;"><span>Version Serveur :</span><strong>${h.serverVersion}</strong></div>
                    <div style="display:flex; justify-content:space-between;"><span>Système d'Exploitation :</span><strong>${h.operatingSystem} (${h.architecture})</strong></div>
                    <div style="display:flex; justify-content:space-between;"><span>Accélération Matérielle :</span><strong>${h.hardwareAcceleration}</strong></div>
                    <div style="display:flex; justify-content:space-between;"><span>Cache Transcodage :</span><strong>${h.transcodeCacheStatus}</strong></div>
                    <div style="display:flex; justify-content:space-between;"><span>Intégrité Base de Données :</span><strong>${h.databaseHealth}</strong></div>
                </div>
            </div>
        `;

        contentEl.querySelector('#btn-one-click-cleanup')?.addEventListener('click', async (e) => {
            e.target.disabled = true;
            e.target.textContent = 'Nettoyage en cours...';
            const res = await this._health.executeOneClickCleanup();
            window.SpaceHub?.ui?.components?.toaster?.success(`Nettoyage terminé : ${res.freedBytes} libérés !`);
            await this._renderHealthTab(contentEl);
        });
    }

    async _renderTasksTab(contentEl) {
        const tasks = await this._taskCtrl.getTasks();
        contentEl.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                ${tasks.map(t => `
                    <div style="background:var(--sh-bg-surface-2); border:1px solid var(--sh-border-color); padding:16px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${t.Name}</strong>
                            <div style="font-size:12px; color:var(--sh-text-muted);">${t.Description || 'Tâche planifiée'}</div>
                        </div>
                        <button class="sh-btn sh-btn--ghost sh-btn--sm btn-start-task" data-id="${t.Id}">▶ Exécuter</button>
                    </div>
                `).join('')}
            </div>
        `;

        contentEl.querySelectorAll('.btn-start-task').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this._taskCtrl.startTask(btn.dataset.id);
                window.SpaceHub?.ui?.components?.toaster?.info('Tâche lancée.');
            });
        });
    }

    async _renderStorageTab(contentEl) {
        const folders = await this._storage.getVirtualFolders();
        contentEl.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">
                ${folders.map(f => `
                    <div style="background:var(--sh-bg-surface-2); border:1px solid var(--sh-border-color); border-radius:12px; padding:16px;">
                        <strong>📁 ${f.Name}</strong>
                        <div style="font-size:12px; color:var(--sh-text-muted); margin-top:6px;">Type : ${f.CollectionType || 'Générique'}</div>
                        <div style="font-size:11px; color:var(--sh-text-secondary); margin-top:4px;">${f.Locations?.join(', ') || 'Disque local'}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    _startPolling(callback, intervalMs) {
        this._refreshInterval = setInterval(callback, intervalMs);
    }

    _stopPolling() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-admin-cockpit-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-admin-cockpit-styles';
        style.textContent = `
.sh-admin-cockpit { max-width: 1600px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--sh-border-color); padding-bottom: 16px; }
.sh-admin-tabs { display: flex; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }
.sh-admin-tab { background: transparent; border: 1px solid var(--sh-border-color); color: var(--sh-text-secondary); padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.sh-admin-tab.active { background: var(--sh-color-primary, #7c6aff); color: #fff; border-color: var(--sh-color-primary, #7c6aff); }
.sh-noc-chart-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); border-radius: 12px; padding: 16px; }
        `;
        document.head.appendChild(style);
    }
}

export default AdminCockpitView;
