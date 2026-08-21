/**
 * SpaceHub — Downloads View (Offline Media & Servarr Queues)
 * Version: 2.0.0
 *
 * Vue centralisée des téléchargements :
 * - Médias stockés hors-ligne pour voyage / train / avion (IndexedDB)
 * - Torrents actifs qBittorrent
 * - Files d'attente Sonarr / Radarr
 */

'use strict';

import Logger from '../../core/Logger.js';

class DownloadsView {
    constructor() {
        this._log = new Logger('DownloadsView');
        this._currentTab = 'offline';
        this._container = null;
    }

    get _offlineManager() {
        return window.SpaceHub?.offline;
    }

    async render(container) {
        this._container = container;

        container.innerHTML = `
            <div class="sh-downloads-page">
                <div class="sh-downloads-header">
                    <div>
                        <h2>📥 Téléchargements & Mode Hors-Ligne</h2>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin-top:4px;">
                            Accédez à vos médias stockés hors-ligne et gérez les flux qBittorrent, Sonarr et Radarr.
                        </p>
                    </div>
                    <button class="sh-btn sh-btn--ghost sh-btn--sm" id="sh-dl-refresh">🔄 Actualiser</button>
                </div>

                <div class="sh-downloads-tabs">
                    <button class="sh-dl-tab ${this._currentTab === 'offline' ? 'active' : ''}" data-tab="offline">
                        ✈️ Médias Hors-Ligne
                    </button>
                    <button class="sh-dl-tab ${this._currentTab === 'servarr' ? 'active' : ''}" data-tab="servarr">
                        📥 qBittorrent & Servarr
                    </button>
                </div>

                <div class="sh-downloads-content" id="sh-dl-tab-content"></div>
            </div>
        `;

        this._injectStyles();
        this._bindTabs();
        await this._renderCurrentTab();
    }

    _bindTabs() {
        const tabs = this._container.querySelectorAll('.sh-dl-tab');
        tabs.forEach(t => {
            t.addEventListener('click', async () => {
                tabs.forEach(tab => tab.classList.remove('active'));
                t.classList.add('active');
                this._currentTab = t.dataset.tab;
                await this._renderCurrentTab();
            });
        });

        this._container.querySelector('#sh-dl-refresh')?.addEventListener('click', () => {
            this._renderCurrentTab();
        });
    }

    async _renderCurrentTab() {
        const contentEl = this._container?.querySelector('#sh-dl-tab-content');
        if (!contentEl) return;

        if (this._currentTab === 'offline') {
            await this._renderOfflineTab(contentEl);
        } else if (this._currentTab === 'servarr') {
            await this._renderServarrTab(contentEl);
        }
    }

    async _renderOfflineTab(contentEl) {
        const items = (await this._offlineManager?.getOfflineItems()) || [];
        const totalMb = items.reduce((acc, it) => acc + (it.sizeMb || 0), 0);

        if (items.length === 0) {
            contentEl.innerHTML = `
                <div class="sh-empty-state" style="padding:48px 0; text-align:center;">
                    <div style="font-size:40px; margin-bottom:12px;">✈️</div>
                    <h3>Aucun média hors-ligne</h3>
                    <p style="color:var(--sh-text-muted); font-size:14px; max-width:400px; margin:8px auto 0 auto;">
                        Téléchargez des films ou épisodes depuis leur fiche détaillée pour pouvoir les visionner en voyage sans connexion Internet.
                    </p>
                </div>
            `;
            return;
        }

        contentEl.innerHTML = `
            <div class="sh-offline-section">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <div>
                        <strong>${items.length} média(s) disponible(s) hors-ligne</strong>
                        <span style="font-size:12px; color:var(--sh-text-muted); margin-left:8px;">
                            (Espace utilisé : ${totalMb > 1024 ? (totalMb / 1024).toFixed(2) + ' Go' : totalMb.toFixed(0) + ' Mo'})
                        </span>
                    </div>
                </div>

                <div class="sh-offline-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px;">
                    ${items.map(it => `
                        <div class="sh-offline-card" data-id="${it.id}">
                            <div style="display:flex; gap:12px; align-items:center;">
                                <div style="width:48px; height:68px; background:var(--sh-bg-surface-3); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:22px;">
                                    🎬
                                </div>
                                <div style="flex:1; min-width:0;">
                                    <h4 class="sh-truncate" style="margin:0 0 2px 0;">${it.name}</h4>
                                    ${it.seriesName ? `<div style="font-size:12px; color:var(--sh-text-secondary);">${it.seriesName} - S${it.seasonNumber}E${it.episodeNumber}</div>` : ''}
                                    <div style="font-size:11px; color:var(--sh-text-muted); margin-top:4px;">
                                        💾 ${it.sizeMb} Mo • ⏱️ ${Math.round((it.durationSeconds || 0)/60)} min
                                    </div>
                                </div>
                            </div>
                            <div style="display:flex; gap:8px; margin-top:12px; justify-content:flex-end;">
                                <button class="sh-btn sh-btn--ghost sh-btn--sm btn-delete-offline" data-id="${it.id}" style="color:#e74c3c;">🗑️ Supprimer</button>
                                <button class="sh-btn sh-btn--primary sh-btn--sm btn-play-offline" data-id="${it.id}">▶ Lire</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        contentEl.querySelectorAll('.btn-play-offline').forEach(btn => {
            btn.addEventListener('click', async () => {
                const item = await this._offlineManager?.getOfflineItem(btn.dataset.id);
                if (item) {
                    this._offlineManager.playOffline(item);
                }
            });
        });

        contentEl.querySelectorAll('.btn-delete-offline').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this._offlineManager?.deleteOfflineItem(btn.dataset.id);
                window.SpaceHub?.ui?.components?.toaster?.info('Média supprimé du stockage hors-ligne.');
                await this._renderOfflineTab(contentEl);
            });
        });
    }

    async _renderServarrTab(contentEl) {
        contentEl.innerHTML = `
            <div class="sh-servarr-downloads">
                <section class="sh-downloads__section">
                    <h2>qBittorrent</h2>
                    <div id="sh-dl-qbit" class="sh-downloads__list"><p class="sh-text-muted">Chargement…</p></div>
                </section>
                <section class="sh-downloads__section">
                    <h2>File d'attente Sonarr</h2>
                    <div id="sh-dl-sonarr" class="sh-downloads__list"><p class="sh-text-muted">Chargement…</p></div>
                </section>
                <section class="sh-downloads__section">
                    <h2>File d'attente Radarr</h2>
                    <div id="sh-dl-radarr" class="sh-downloads__list"><p class="sh-text-muted">Chargement…</p></div>
                </section>
            </div>
        `;

        await Promise.all([
            this._loadQBittorrent(contentEl),
            this._loadQueue(contentEl, 'sonarr', '#sh-dl-sonarr'),
            this._loadQueue(contentEl, 'radarr', '#sh-dl-radarr')
        ]);
    }

    async _loadQBittorrent(container) {
        const target = container.querySelector('#sh-dl-qbit');
        const api = window.SpaceHub?.integrations?.qbittorrent?.api;
        if (!api) { target.innerHTML = this._emptyState('qBittorrent non configuré.'); return; }

        try {
            const torrents = await api.getTorrents('all');
            if (!torrents || torrents.length === 0) {
                target.innerHTML = this._emptyState('Aucun torrent actif.');
                return;
            }
            target.innerHTML = torrents.map(t => `
                <div class="sh-downloads__item">
                    <div class="sh-downloads__item-name">${this._esc(t.name)}</div>
                    <div class="sh-downloads__item-meta">
                        <span>${Math.round((t.progress || 0) * 100)}%</span>
                        <span>${this._formatSpeed(t.dlspeed)}</span>
                        <span class="sh-downloads__state">${this._esc(t.state)}</span>
                    </div>
                    <div class="sh-downloads__progress">
                        <div class="sh-downloads__progress-bar" style="width:${Math.round((t.progress || 0) * 100)}%"></div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            this._log.error('Erreur qBittorrent:', err);
            target.innerHTML = this._emptyState('Erreur de connexion à qBittorrent.');
        }
    }

    async _loadQueue(container, serviceName, selector) {
        const target = container.querySelector(selector);
        const api = window.SpaceHub?.integrations?.[serviceName]?.api;
        if (!api) { target.innerHTML = this._emptyState(`${serviceName} non configuré.`); return; }

        try {
            const queue = await api.getQueue();
            const records = queue?.records || queue || [];
            if (!records.length) {
                target.innerHTML = this._emptyState('File d\'attente vide.');
                return;
            }
            target.innerHTML = records.map(item => `
                <div class="sh-downloads__item">
                    <div class="sh-downloads__item-name">${this._esc(item.title || item.series?.title || 'Inconnu')}</div>
                    <div class="sh-downloads__item-meta">
                        <span>${item.status || ''}</span>
                        <span>${item.timeleft || ''}</span>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            this._log.error(`Erreur ${serviceName}:`, err);
            target.innerHTML = this._emptyState(`Erreur de connexion à ${serviceName}.`);
        }
    }

    _formatSpeed(bytesPerSec) {
        if (!bytesPerSec) return '0 Ko/s';
        const kb = bytesPerSec / 1024;
        return kb > 1024 ? `${(kb / 1024).toFixed(1)} Mo/s` : `${kb.toFixed(0)} Ko/s`;
    }

    _emptyState(msg) {
        return `<p class="sh-text-muted">${this._esc(msg)}</p>`;
    }

    _esc(str) {
        const div = document.createElement('div');
        div.textContent = String(str ?? '');
        return div.innerHTML;
    }

    _injectStyles() {
        if (document.getElementById('sh-downloads-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-downloads-styles';
        style.textContent = `
.sh-downloads-page { max-width: 1400px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-downloads-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sh-space-6, 24px); border-bottom: 1px solid var(--sh-border-color); padding-bottom: var(--sh-space-4, 16px); }
.sh-downloads-tabs { display: flex; gap: 12px; margin-bottom: 24px; }
.sh-dl-tab { background: transparent; border: 1px solid var(--sh-border-color); color: var(--sh-text-secondary); padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.sh-dl-tab.active { background: var(--sh-color-primary, #7c6aff); color: #fff; border-color: var(--sh-color-primary, #7c6aff); }
.sh-offline-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; }
.sh-downloads__section { margin-bottom: var(--sh-space-8, 32px); }
.sh-downloads__section h2 { font-size: var(--sh-text-lg, 16px); margin-bottom: var(--sh-space-3, 12px); color: var(--sh-text-secondary); }
.sh-downloads__list { display: flex; flex-direction: column; gap: var(--sh-space-2, 8px); }
.sh-downloads__item { background: var(--sh-bg-surface-2, #22222e); border-radius: var(--sh-radius-md, 12px); padding: var(--sh-space-3, 12px); }
.sh-downloads__item-name { font-weight: 600; margin-bottom: 4px; }
.sh-downloads__item-meta { display: flex; gap: var(--sh-space-3, 12px); font-size: var(--sh-text-sm, 13px); color: var(--sh-text-secondary); }
.sh-downloads__progress { height: 4px; background: var(--sh-bg-surface-3, #2e2e3d); border-radius: 2px; margin-top: 6px; overflow: hidden; }
.sh-downloads__progress-bar { height: 100%; background: var(--sh-color-primary, #7c6aff); }
        `;
        document.head.appendChild(style);
    }
}

export default DownloadsView;
