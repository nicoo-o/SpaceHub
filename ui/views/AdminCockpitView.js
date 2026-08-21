/**
 * SpaceHub — Admin Cockpit View
 * Version: 1.0.0
 *
 * Cockpit d'administration complet : surveillance des flux en direct,
 * transcodages GPU, contrôle des tâches planifiées et santé stockage.
 */

'use strict';

import Logger from '../../core/Logger.js';
import LiveStreamMonitor from '../../jellyfin/admin/LiveStreamMonitor.js';
import ServerTaskController from '../../jellyfin/admin/ServerTaskController.js';
import StorageInspector from '../../jellyfin/admin/StorageInspector.js';

class AdminCockpitView {
    constructor() {
        this._log = new Logger('AdminCockpitView');
        this._monitor = new LiveStreamMonitor();
        this._taskCtrl = new ServerTaskController();
        this._storage = new StorageInspector();
        this._currentTab = 'sessions';
        this._refreshInterval = null;
        this._container = null;
    }

    async render(container) {
        this._container = container;
        this._stopPolling();

        container.innerHTML = `
            <div class="sh-admin-cockpit">
                <div class="sh-admin-header">
                    <div>
                        <h2>🛡️ Cockpit Administrateur</h2>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin-top:4px;">
                            Surveillance en temps réel, contrôle des transcodages et maintenance serveur.
                        </p>
                    </div>
                    <div class="sh-admin-actions">
                        <button class="sh-btn sh-btn--ghost" id="btn-admin-refresh">🔄 Actualiser</button>
                    </div>
                </div>

                <div class="sh-admin-tabs">
                    <button class="sh-admin-tab active" data-tab="sessions">🔴 Flux en Direct</button>
                    <button class="sh-admin-tab" data-tab="tasks">⚡ Tâches & Maintenance</button>
                    <button class="sh-admin-tab" data-tab="storage">💾 Stockage & Système</button>
                </div>

                <div class="sh-admin-content" id="sh-admin-tab-content">
                    <div style="text-align:center; padding:40px; color:var(--sh-text-muted);">Chargement des données...</div>
                </div>
            </div>
        `;

        this._injectStyles();
        this._bindHeaderEvents();
        await this._loadTabContent();

        // Auto-refresh toutes les 4 secondes pour le monitoring en direct
        this._startPolling();
    }

    _bindHeaderEvents() {
        const tabs = this._container.querySelectorAll('.sh-admin-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', async () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this._currentTab = tab.dataset.tab;
                await this._loadTabContent();
            });
        });

        this._container.querySelector('#btn-admin-refresh')?.addEventListener('click', () => {
            this._loadTabContent();
        });
    }

    async _loadTabContent() {
        const contentEl = this._container?.querySelector('#sh-admin-tab-content');
        if (!contentEl) return;

        if (this._currentTab === 'sessions') {
            await this._renderSessionsTab(contentEl);
        } else if (this._currentTab === 'tasks') {
            await this._renderTasksTab(contentEl);
        } else if (this._currentTab === 'storage') {
            await this._renderStorageTab(contentEl);
        }
    }

    async _renderSessionsTab(contentEl) {
        const sessions = await this._monitor.getActiveSessions();

        if (sessions.length === 0) {
            contentEl.innerHTML = `
                <div class="sh-empty-state" style="padding:48px 0; text-align:center;">
                    <div style="font-size:40px; margin-bottom:12px;">💤</div>
                    <p style="color:var(--sh-text-muted);">Aucune session active pour le moment.</p>
                </div>
            `;
            return;
        }

        contentEl.innerHTML = `
            <div class="sh-sessions-grid">
                ${sessions.map(s => {
                    const isDirect = s.playMethod === 'Direct Play';
                    const isTranscode = s.playMethod === 'Transcodage';
                    const badgeBg = isDirect ? 'rgba(46,204,113,0.15)' : (isTranscode ? 'rgba(231,76,60,0.15)' : 'rgba(52,152,219,0.15)');
                    const badgeColor = isDirect ? '#2ecc71' : (isTranscode ? '#e74c3c' : '#3498db');

                    return `
                        <div class="sh-session-card" data-session-id="${s.id}">
                            <div class="sh-session-header">
                                <div>
                                    <strong>👤 ${s.userName}</strong>
                                    <div style="font-size:11px; color:var(--sh-text-muted);">${s.client} • ${s.remoteEndPoint}</div>
                                </div>
                                <span class="sh-badge" style="background:${badgeBg}; color:${badgeColor}; font-weight:700;">
                                    ${s.playMethod}
                                </span>
                            </div>

                            ${s.item ? `
                                <div style="margin:12px 0; display:flex; gap:12px; align-items:center;">
                                    <div style="width:48px; height:68px; background:var(--sh-bg-surface-3); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:20px;">
                                        🎬
                                    </div>
                                    <div style="flex:1; min-width:0;">
                                        <h4 class="sh-truncate" style="margin:0 0 2px 0;">${s.item.name}</h4>
                                        ${s.item.seriesName ? `<div style="font-size:12px; color:var(--sh-text-secondary);">${s.item.seriesName}</div>` : ''}
                                        <div style="font-size:11px; color:var(--sh-text-muted); margin-top:4px;">
                                            ${this._formatTime(s.positionSeconds)} / ${this._formatTime(s.item.durationSeconds)}
                                        </div>
                                    </div>
                                </div>
                            ` : '<p style="color:var(--sh-text-muted); font-size:12px; margin:12px 0;">Navigue dans les menus</p>'}

                            ${s.transcoding ? `
                                <div class="sh-transcode-box">
                                    <div style="font-size:11px; font-weight:600; color:var(--sh-text-secondary); margin-bottom:4px;">
                                        ⚡ Transcodage (${s.transcoding.hardwareAccelerationType})
                                    </div>
                                    <div style="font-size:11px; color:var(--sh-text-muted);">
                                        Codec: ${s.transcoding.videoCodec || 'Auto'} • Débit: ${Math.round((s.transcoding.bitrate || 0)/1000)} kbps
                                    </div>
                                    ${s.transcoding.transcodeReasons.length ? `<div style="font-size:10px; color:#e74c3c; margin-top:2px;">Raison: ${s.transcoding.transcodeReasons.join(', ')}</div>` : ''}
                                </div>
                            ` : ''}

                            <div class="sh-session-actions">
                                <button class="sh-btn sh-btn--ghost sh-btn--sm btn-msg-session" data-id="${s.id}">✉️ Message</button>
                                <button class="sh-btn sh-btn--ghost sh-btn--sm btn-kill-session" data-id="${s.id}" style="color:#e74c3c;">⛔ Arrêter</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        this._bindSessionActions(contentEl);
    }

    _bindSessionActions(contentEl) {
        contentEl.querySelectorAll('.btn-kill-session').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sId = btn.dataset.id;
                await this._monitor.stopSession(sId);
                window.SpaceHub?.ui?.components?.toaster?.info('Flux interrompu.');
                this._loadTabContent();
            });
        });

        contentEl.querySelectorAll('.btn-msg-session').forEach(btn => {
            btn.addEventListener('click', () => {
                const sId = btn.dataset.id;
                const msg = prompt('Message à envoyer à l\'utilisateur :');
                if (msg) {
                    this._monitor.sendMessage(sId, msg);
                    window.SpaceHub?.ui?.components?.toaster?.success('Message envoyé !');
                }
            });
        });
    }

    async _renderTasksTab(contentEl) {
        const tasks = await this._taskCtrl.getTasks();

        contentEl.innerHTML = `
            <div class="sh-tasks-list">
                ${tasks.map(t => {
                    const isRunning = t.state === 'Running';
                    return `
                        <div class="sh-task-row">
                            <div style="flex:1; min-width:0;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <strong>${t.name}</strong>
                                    <span class="sh-badge" style="background:${isRunning ? 'rgba(46,204,113,0.15)' : 'var(--sh-bg-surface-3)'}; color:${isRunning ? '#2ecc71' : 'var(--sh-text-muted)'}; font-size:11px;">
                                        ${t.state} ${isRunning ? `(${Math.round(t.currentProgressPercentage)}%)` : ''}
                                    </span>
                                </div>
                                <p style="font-size:12px; color:var(--sh-text-muted); margin:4px 0 0 0;">${t.description}</p>
                            </div>
                            <div>
                                ${isRunning ? `
                                    <button class="sh-btn sh-btn--ghost sh-btn--sm btn-stop-task" data-id="${t.id}" style="color:#e74c3c;">Arrêter</button>
                                ` : `
                                    <button class="sh-btn sh-btn--primary sh-btn--sm btn-start-task" data-id="${t.id}">▶ Lancer</button>
                                `}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        contentEl.querySelectorAll('.btn-start-task').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                await this._taskCtrl.startTask(btn.dataset.id);
                window.SpaceHub?.ui?.components?.toaster?.success('Tâche lancée.');
                setTimeout(() => this._loadTabContent(), 1000);
            });
        });

        contentEl.querySelectorAll('.btn-stop-task').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this._taskCtrl.stopTask(btn.dataset.id);
                window.SpaceHub?.ui?.components?.toaster?.info('Arrêt demandé.');
                setTimeout(() => this._loadTabContent(), 1000);
            });
        });
    }

    async _renderStorageTab(contentEl) {
        const data = await this._storage.getStorageInfo();

        if (!data) {
            contentEl.innerHTML = '<p style="color:var(--sh-text-muted);">Informations non disponibles.</p>';
            return;
        }

        contentEl.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="sh-storage-card">
                    <h4>🖥️ Informations Système</h4>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-top:12px;">
                        <div>
                            <span style="font-size:11px; color:var(--sh-text-muted);">Nom du serveur</span>
                            <div><strong>${data.serverName}</strong></div>
                        </div>
                        <div>
                            <span style="font-size:11px; color:var(--sh-text-muted);">Version Jellyfin</span>
                            <div><strong>${data.version}</strong></div>
                        </div>
                        <div>
                            <span style="font-size:11px; color:var(--sh-text-muted);">Système d'Exploitation</span>
                            <div><strong>${data.os} (${data.arch})</strong></div>
                        </div>
                    </div>
                </div>

                <div class="sh-storage-card">
                    <h4>📁 Dossiers des Bibliothèques</h4>
                    <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
                        ${data.libraries.map(lib => `
                            <div style="padding:10px; background:var(--sh-bg-surface-3); border-radius:8px;">
                                <strong>${lib.name}</strong> <span style="font-size:11px; color:var(--sh-text-muted);">(${lib.type || 'Média'})</span>
                                <div style="font-size:11px; color:var(--sh-color-primary); margin-top:4px; word-break:break-all;">
                                    ${lib.paths.join('<br/>') || 'Emplacement par défaut'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    _formatTime(seconds) {
        const s = Math.floor(seconds || 0);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const remM = m % 60;
        const remS = s % 60;
        if (h > 0) return `${h}:${remM.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`;
        return `${remM}:${remS.toString().padStart(2, '0')}`;
    }

    _startPolling() {
        this._stopPolling();
        this._refreshInterval = setInterval(() => {
            if (this._currentTab === 'sessions') {
                this._loadTabContent();
            }
        }, 4000);
    }

    _stopPolling() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
    }

    destroy() {
        this._stopPolling();
    }

    _injectStyles() {
        if (document.getElementById('sh-admin-cockpit-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-admin-cockpit-styles';
        style.textContent = `
.sh-admin-cockpit {
    max-width: 1400px;
    margin: 0 auto;
    padding: var(--sh-space-6, 24px);
}

.sh-admin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--sh-space-6, 24px);
    border-bottom: 1px solid var(--sh-border-color);
    padding-bottom: var(--sh-space-4, 16px);
}

.sh-admin-tabs {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
}

.sh-admin-tab {
    background: transparent;
    border: 1px solid var(--sh-border-color);
    color: var(--sh-text-secondary);
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
}

.sh-admin-tab.active {
    background: var(--sh-color-primary, #7c6aff);
    color: #fff;
    border-color: var(--sh-color-primary, #7c6aff);
}

.sh-sessions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
}

.sh-session-card {
    background: var(--sh-bg-surface-2, #1e1e24);
    border: 1px solid var(--sh-border-color);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.sh-session-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.sh-transcode-box {
    background: var(--sh-bg-surface-3, #282832);
    padding: 8px 12px;
    border-radius: 6px;
    margin: 8px 0;
}

.sh-session-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
}

.sh-tasks-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.sh-task-row {
    background: var(--sh-bg-surface-2);
    border: 1px solid var(--sh-border-color);
    padding: 16px;
    border-radius: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.sh-storage-card {
    background: var(--sh-bg-surface-2);
    border: 1px solid var(--sh-border-color);
    padding: 20px;
    border-radius: 12px;
}
        `;
        document.head.appendChild(style);
    }
}

export default AdminCockpitView;
