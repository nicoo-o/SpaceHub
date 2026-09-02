import { escapeHtml } from '../../core/utils/domUtils.js';
import './QBittorrentWidgets.css';
import * as svc from '../../core/services.js';
/**
 * SpaceHub — qBittorrent Dashboard Widgets
 * Version: 0.11.0
 *
 * Widgets pour le Dashboard SpaceHub affichant :
 * 1. QBittorrentSpeedWidget : Vitesse DL/UP en direct et compteurs
 * 2. QBittorrentActiveWidget : Torrents en cours de téléchargement avec contrôles (Pause / Play / Suppr)
 */

'use strict';

class QBittorrentSpeedWidget {
    constructor() {
        this.id = 'qbittorrent-speed';
        this.title = 'Vitesse qBittorrent';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--qbittorrent-speed">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:var(--sh-text-muted);">Mesure des vitesses...</p>
                    </div>
                </div>
            </div>
        `;

        this._injectStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const qbit = svc.integration('qbittorrent');
            if (!qbit) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>qBittorrent n'est pas configuré. Rendez-vous dans les réglages SpaceHub.</p>
                    </div>
                `;
                return;
            }

            const stats = await qbit.getTransferStats();
            const dlSpeed = this._formatSpeed(stats.dl_info_speed || 0);
            const upSpeed = this._formatSpeed(stats.up_info_speed || 0);

            contentEl.innerHTML = `
                <div class="sh-qbit-speed-row">
                    <div class="sh-qbit-speed-card sh-qbit-speed-card--dl">
                        <span class="sh-qbit-speed-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg></span>
                        <div class="sh-qbit-speed-details">
                            <span class="sh-qbit-speed-val">${dlSpeed}</span>
                            <span class="sh-qbit-speed-lbl">Téléchargement</span>
                        </div>
                    </div>
                    <div class="sh-qbit-speed-card sh-qbit-speed-card--up">
                        <span class="sh-qbit-speed-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></span>
                        <div class="sh-qbit-speed-details">
                            <span class="sh-qbit-speed-val">${upSpeed}</span>
                            <span class="sh-qbit-speed-lbl">Envoi</span>
                        </div>
                    </div>
                </div>
            `;
        } catch (err) {
            contentEl.innerHTML = `
                <div class="sh-widget-error">
                    <p>Impossible de joindre qBittorrent (${escapeHtml(err.message)}).</p>
                </div>
            `;
        }
    }

    _formatSpeed(bytesPerSec) {
        if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
        if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
        return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
    }

    async refresh(container) {
        await this.loadData(container);
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans QBittorrentWidgets.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

class QBittorrentActiveWidget {
    constructor() {
        this.id = 'qbittorrent-active';
        this.title = 'Torrents Actifs (qBittorrent)';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--qbittorrent-active">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>${this.title}</span>
                    </h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4);">Chargement des torrents...</p>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const qbit = svc.integration('qbittorrent');
            if (!qbit) {
                contentEl.innerHTML = '<p style="color:rgba(var(--sh-ink, 255, 255, 255), 0.4); text-align:center; padding:24px;">qBittorrent non configuré.</p>';
                return;
            }

            const torrents = await qbit.getTorrents('active');

            if (!torrents || torrents.length === 0) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <p>Aucun torrent en cours de transfert.</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:12px;">
                    ${torrents.slice(0, 10).map(t => {
                        const progress = Math.round((t.progress || 0) * 100);
                        const isPaused = t.state?.includes('pause');
                        const isComplete = progress >= 100 || t.state?.includes('upload') || t.state?.includes('seed');
                        const sizeGB = t.total_size ? (t.total_size / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : (t.size ? (t.size / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : '');
                        const dlSpeed = t.dlspeed > 0 ? `${(t.dlspeed / (1024 * 1024)).toFixed(1)} MB/s` : '';
                        const upSpeed = t.upspeed > 0 ? `${(t.upspeed / 1024).toFixed(1)} KB/s` : '';
                        const eta = t.eta && t.eta > 0 && t.eta < 864000 ? `${Math.round(t.eta / 60)} min` : '';

                        let stateLabel = 'Téléchargement';
                        let stateColor = '#64d2ff';
                        if (isPaused) { stateLabel = 'En pause'; stateColor = '#ffd60a'; }
                        else if (isComplete) { stateLabel = 'Partage (Seeding)'; stateColor = '#32d74b'; }

                        return `
                            <div class="sh-qbit-row">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
                                    <div style="display:flex; flex-direction:column; gap:4px; min-width:0; flex:1;">
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            <span style="font-size:10px; font-weight:750; padding:2px 7px; border-radius:6px; background:${stateColor}22; color:${stateColor}; border:1px solid ${stateColor}44; text-transform:uppercase;">${stateLabel}</span>
                                            ${sizeGB ? `<span style="font-size:11px; color:rgba(var(--sh-ink, 255, 255, 255), 0.45); font-weight:600;">${sizeGB}</span>` : ''}
                                        </div>
                                        <span class="sh-truncate" style="font-weight:650; font-size:13.5px; color:var(--sh-ink-solid, #ffffff);" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                                        <button class="sh-qbit-action-btn sh-qbit-toggle-btn" data-hash="${t.hash}" data-paused="${isPaused}" title="${isPaused ? 'Reprendre' : 'Pause'}">
                                            ${isPaused 
                                                ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>' 
                                                : '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'}
                                        </button>
                                        <button class="sh-qbit-action-btn sh-qbit-action-btn--del sh-qbit-del-btn" data-hash="${t.hash}" title="Supprimer">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                </div>
                                <div style="height:6px; background:rgba(var(--sh-ink, 255, 255, 255), 0.08); border-radius:9999px; overflow:hidden; margin:4px 0;">
                                    <div style="width:${progress}%; height:100%; background:linear-gradient(90deg, #38bdf8, ${stateColor}); border-radius:9999px; box-shadow:0 0 10px ${stateColor}88; transition:width 0.3s ease;"></div>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; font-size:11.5px; color:rgba(var(--sh-ink, 255, 255, 255), 0.5);">
                                    <span><strong>${progress}%</strong> complété ${t.num_seeds !== undefined ? `• ${t.num_seeds} pairs` : ''}</span>
                                    <div style="display:flex; gap:12px; font-weight:600;">
                                        ${dlSpeed ? `<span style="color:#64d2ff;">↓ ${dlSpeed}</span>` : ''}
                                        ${upSpeed ? `<span style="color:#32d74b;">↑ ${upSpeed}</span>` : ''}
                                        ${eta ? `<span style="color:rgba(var(--sh-ink, 255, 255, 255), 0.7);">ETA: ${eta}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            contentEl.querySelectorAll('.sh-qbit-toggle-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const hash = btn.dataset.hash;
                    const isPaused = btn.dataset.paused === 'true';
                    if (isPaused) await qbit.resumeTorrent(hash);
                    else await qbit.pauseTorrent(hash);
                    await this.loadData(container);
                });
            });

            contentEl.querySelectorAll('.sh-qbit-del-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const hash = btn.dataset.hash;
                    await qbit.deleteTorrent(hash, false);
                    await this.loadData(container);
                });
            });

        } catch (err) {
            contentEl.innerHTML = `<p style="color:#ff453a; text-align:center; padding:16px;">${escapeHtml(err.message)}</p>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export { QBittorrentSpeedWidget, QBittorrentActiveWidget };
