/**
 * SpaceHub — Prowlarr Dashboard Widgets
 * Version: 0.8.0
 *
 * Widgets pour le Dashboard SpaceHub affichant :
 * 1. ProwlarrStatusWidget : État de santé et statistiques des indexeurs
 * 2. ProwlarrSearchWidget : Recherche rapide de releases torrents/usenet
 */

'use strict';

class ProwlarrStatusWidget {
    constructor() {
        this.id = 'prowlarr-status';
        this.title = 'Indexeurs Prowlarr';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--prowlarr-status">
                <div class="sh-widget__header">
                    <h2 class="sh-widget__title">🌐 ${this.title}</h2>
                    <div style="display:flex; gap:var(--sh-space-2,8px);">
                        <button class="sh-btn sh-btn--ghost sh-widget__test-btn" title="Tester tous les indexeurs">⚡ Tester</button>
                        <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">🔄</button>
                    </div>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-widget__items-container">
                        <p style="color:var(--sh-text-muted);">Chargement du statut des indexeurs...</p>
                    </div>
                </div>
            </div>
        `;

        this._injectStyles();
        container.querySelector('.sh-widget__refresh-btn')?.addEventListener('click', () => this.refresh(container));
        container.querySelector('.sh-widget__test-btn')?.addEventListener('click', async () => {
            const prowlarr = window.SpaceHub?.integrations?.prowlarr;
            if (prowlarr) {
                await prowlarr.testAllIndexers();
                await this.loadData(container);
            }
        });

        await this.loadData(container);
    }

    async loadData(container) {
        const contentEl = container.querySelector('.sh-widget__items-container');
        if (!contentEl) return;

        try {
            const prowlarr = window.SpaceHub?.integrations?.prowlarr;
            if (!prowlarr) {
                contentEl.innerHTML = `
                    <div class="sh-widget-empty" style="padding:var(--sh-space-4,16px); text-align:center; color:var(--sh-text-muted);">
                        <p>⚙️ Prowlarr n'est pas configuré. Rendez-vous dans les réglages SpaceHub pour renseigner l'URL et la clé API.</p>
                    </div>
                `;
                return;
            }

            const summary = await prowlarr.getHealthSummary();

            contentEl.innerHTML = `
                <div class="sh-prowlarr-stats-row">
                    <div class="sh-prowlarr-stat-box">
                        <span class="sh-prowlarr-stat-number">${summary.total}</span>
                        <span class="sh-prowlarr-stat-label">Total</span>
                    </div>
                    <div class="sh-prowlarr-stat-box">
                        <span class="sh-prowlarr-stat-number" style="color:var(--sh-color-success,#3ddc84);">${summary.healthy}</span>
                        <span class="sh-prowlarr-stat-label">En ligne</span>
                    </div>
                    <div class="sh-prowlarr-stat-box">
                        <span class="sh-prowlarr-stat-number" style="color:${summary.degraded > 0 ? 'var(--sh-color-danger,#ff5c7a)' : 'var(--sh-text-muted,#5c5c7a)'};">${summary.degraded}</span>
                        <span class="sh-prowlarr-stat-label">Dégradé</span>
                    </div>
                </div>

                <div class="sh-prowlarr-indexers-list">
                    ${summary.indexers.slice(0, 10).map(idx => `
                        <div class="sh-prowlarr-indexer-item">
                            <span class="sh-prowlarr-badge sh-prowlarr-badge--${idx.protocol}">${idx.protocol === 'torrent' ? '🧲 Torrent' : '📰 Usenet'}</span>
                            <span class="sh-prowlarr-indexer-name sh-truncate">${idx.name}</span>
                            <span class="sh-prowlarr-status-dot ${idx.status === 'Ok' ? 'online' : 'degraded'}" title="${idx.status}"></span>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (err) {
            contentEl.innerHTML = `
                <div class="sh-widget-error">
                    <p>Impossible de joindre Prowlarr (${err.message}). Vérifiez vos identifiants.</p>
                </div>
            `;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }

    _injectStyles() {
        if (document.getElementById('sh-prowlarr-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-prowlarr-widget-styles';
        style.textContent = `
.sh-prowlarr-stats-row {
    display: flex;
    gap: var(--sh-space-3, 12px);
    margin-bottom: var(--sh-space-4, 16px);
}

.sh-prowlarr-stat-box {
    flex: 1;
    background: var(--sh-bg-surface-2, #22222e);
    border: 1px solid var(--sh-border-color, rgba(255,255,255,0.08));
    border-radius: var(--sh-radius-md, 12px);
    padding: var(--sh-space-3, 12px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.sh-prowlarr-stat-number {
    font-size: var(--sh-text-xl, 24px);
    font-weight: var(--sh-font-bold, 700);
}

.sh-prowlarr-stat-label {
    font-size: var(--sh-text-xs, 11px);
    color: var(--sh-text-muted, #5c5c7a);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.sh-prowlarr-indexers-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--sh-space-2, 8px);
}

.sh-prowlarr-indexer-item {
    display: flex;
    align-items: center;
    gap: var(--sh-space-2, 8px);
    background: var(--sh-bg-surface-2, #22222e);
    padding: var(--sh-space-2, 8px) var(--sh-space-3, 12px);
    border-radius: var(--sh-radius-sm, 8px);
    font-size: var(--sh-text-xs, 11px);
}

.sh-prowlarr-indexer-name {
    flex: 1;
    font-weight: var(--sh-font-medium, 500);
    color: var(--sh-text-primary, #f0f0f8);
}

.sh-prowlarr-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: var(--sh-radius-xs, 4px);
    background: var(--sh-bg-surface-3, #2e2e3d);
    color: var(--sh-text-secondary, #9898b8);
}

.sh-prowlarr-badge--torrent {
    color: var(--sh-color-primary, #7c6aff);
    background: rgba(var(--sh-color-primary-rgb, 124,106,255), 0.15);
}

.sh-prowlarr-badge--usenet {
    color: var(--sh-color-secondary, #00c9a7);
    background: rgba(var(--sh-color-secondary-rgb, 0,201,167), 0.15);
}

.sh-prowlarr-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.sh-prowlarr-status-dot.online {
    background: var(--sh-color-success, #3ddc84);
    box-shadow: 0 0 6px rgba(61, 220, 132, 0.6);
}

.sh-prowlarr-status-dot.degraded {
    background: var(--sh-color-danger, #ff5c7a);
    box-shadow: 0 0 6px rgba(255, 92, 122, 0.6);
}
        `;
        document.head.appendChild(style);
    }
}

export { ProwlarrStatusWidget };
