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
                    <h2 class="sh-widget__title">⚡ ${this.title}</h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">🔄</button>
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
            const qbit = window.SpaceHub?.integrations?.qbittorrent;
            if (!qbit) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>⚙️ qBittorrent n'est pas configuré. Rendez-vous dans les réglages SpaceHub.</p>
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
                        <span class="sh-qbit-speed-icon">⬇️</span>
                        <div class="sh-qbit-speed-details">
                            <span class="sh-qbit-speed-val">${dlSpeed}</span>
                            <span class="sh-qbit-speed-lbl">Téléchargement</span>
                        </div>
                    </div>
                    <div class="sh-qbit-speed-card sh-qbit-speed-card--up">
                        <span class="sh-qbit-speed-icon">⬆️</span>
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
                    <p>Impossible de joindre qBittorrent (${err.message}).</p>
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
        if (document.getElementById('sh-qbit-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-qbit-widget-styles';
        style.textContent = `
.sh-qbit-speed-row {
    display: flex;
    gap: var(--sh-space-3, 12px);
}

.sh-qbit-speed-card {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--sh-space-3, 12px);
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-md, 12px);
    padding: var(--sh-space-3, 12px) var(--sh-space-4, 16px);
}

.sh-qbit-speed-icon {
    font-size: 24px;
}

.sh-qbit-speed-details {
    display: flex;
    flex-direction: column;
}

.sh-qbit-speed-val {
    font-size: var(--sh-text-lg, 20px);
    font-weight: var(--sh-font-bold, 700);
    color: var(--sh-text-primary, #f0f0f8);
}

.sh-qbit-speed-card--dl .sh-qbit-speed-val { color: var(--sh-color-primary, #7c6aff); }
.sh-qbit-speed-card--up .sh-qbit-speed-val { color: var(--sh-color-secondary, #00c9a7); }

.sh-qbit-speed-lbl {
    font-size: var(--sh-text-xs, 11px);
    color: var(--sh-text-muted, #5c5c7a);
    text-transform: uppercase;
}
        `;
        document.head.appendChild(style);
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
                    <h2 class="sh-widget__title">📥 ${this.title}</h2>
                    <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">🔄</button>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:var(--sh-text-muted);">Chargement des torrents...</p>
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
            const qbit = window.SpaceHub?.integrations?.qbittorrent;
            if (!qbit) {
                contentEl.innerHTML = '<p style="color:var(--sh-text-muted);">qBittorrent non configuré.</p>';
                return;
            }

            const torrents = await qbit.getTorrents('active');

            if (!torrents || torrents.length === 0) {
                contentEl.innerHTML = `
                    <div style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>✅ Aucun torrent en cours de transfert.</p>
                    </div>
                `;
                return;
            }

            contentEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:var(--sh-space-2,8px);">
                    ${torrents.slice(0, 6).map(t => {
                        const progress = Math.round((t.progress || 0) * 100);
                        const isPaused = t.state?.includes('pause');

                        return `
                            <div style="background:var(--sh-bg-surface-2,#22222e); padding:var(--sh-space-3,12px); border-radius:var(--sh-radius-sm,8px);">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <span class="sh-truncate" style="font-weight:600; font-size:var(--sh-text-sm,13px); max-width:65%;">${t.name}</span>
                                    <div style="display:flex; gap:6px;">
                                        <button class="sh-btn sh-btn--ghost sh-btn--sm sh-qbit-toggle-btn" data-hash="${t.hash}" data-paused="${isPaused}">
                                            ${isPaused ? '▶️' : '⏸️'}
                                        </button>
                                        <button class="sh-btn sh-btn--ghost sh-btn--sm sh-qbit-del-btn" data-hash="${t.hash}" style="color:var(--sh-color-danger,#ff5c7a);">
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                                <div style="height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; margin-bottom:6px;">
                                    <div style="width:${progress}%; height:100%; background:var(--sh-color-primary);"></div>
                                </div>
                                <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--sh-text-muted);">
                                    <span>${progress}% • ${t.state}</span>
                                    <span>⬇️ ${(t.dlspeed / (1024*1024)).toFixed(1)} MB/s</span>
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
            contentEl.innerHTML = `<p style="color:var(--sh-color-danger);">${err.message}</p>`;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }
}

export { QBittorrentSpeedWidget, QBittorrentActiveWidget };
