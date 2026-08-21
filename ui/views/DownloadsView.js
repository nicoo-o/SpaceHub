/**
 * SpaceHub — Downloads View
 * Version: 1.0.0
 *
 * Vue centralisée des téléchargements : torrents actifs qBittorrent + files
 * d'attente Sonarr/Radarr (import en cours, en attente...), pour ne plus
 * avoir à ouvrir chaque service séparément.
 */

'use strict';

import Logger from '../../core/Logger.js';

class DownloadsView {
    constructor() {
        this._log = new Logger('DownloadsView');
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-downloads">
                <div class="sh-downloads__header">
                    <h1>📥 Téléchargements</h1>
                    <button class="sh-btn sh-btn--ghost sh-btn--sm" id="sh-dl-refresh">🔄 Actualiser</button>
                </div>
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

        this._injectStyles();
        container.querySelector('#sh-dl-refresh')?.addEventListener('click', () => this._loadAll(container));
        await this._loadAll(container);
    }

    async _loadAll(container) {
        await Promise.all([
            this._loadQBittorrent(container),
            this._loadQueue(container, 'sonarr', '#sh-dl-sonarr'),
            this._loadQueue(container, 'radarr', '#sh-dl-radarr'),
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
            this._log.error('Erreur chargement qBittorrent:', err);
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
            this._log.error(`Erreur chargement file ${serviceName}:`, err);
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
.sh-downloads { max-width: 1000px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-downloads__header { display:flex; justify-content:space-between; align-items:center; margin-bottom: var(--sh-space-6, 24px); }
.sh-downloads__section { margin-bottom: var(--sh-space-8, 32px); }
.sh-downloads__section h2 { font-size: var(--sh-text-lg, 16px); margin-bottom: var(--sh-space-3, 12px); color: var(--sh-text-secondary); }
.sh-downloads__list { display:flex; flex-direction:column; gap: var(--sh-space-2, 8px); }
.sh-downloads__item { background: var(--sh-bg-surface-2, #22222e); border-radius: var(--sh-radius-md, 12px); padding: var(--sh-space-3, 12px); }
.sh-downloads__item-name { font-weight: 600; margin-bottom: 4px; }
.sh-downloads__item-meta { display:flex; gap: var(--sh-space-3, 12px); font-size: var(--sh-text-sm, 13px); color: var(--sh-text-secondary); }
.sh-downloads__progress { height: 4px; background: var(--sh-bg-surface-3, #2e2e3d); border-radius: 2px; margin-top: 6px; overflow:hidden; }
.sh-downloads__progress-bar { height:100%; background: var(--sh-color-primary, #7c6aff); }
.sh-text-muted { color: var(--sh-text-muted, #5c5c7a); }
        `;
        document.head.appendChild(style);
    }
}

export default DownloadsView;
