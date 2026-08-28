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
                    <h2 class="sh-widget__title">
                        <svg class="sh-shelf-title-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                        <span>${this.title}</span>
                    </h2>
                    <div style="display:flex; gap:var(--sh-space-2,8px);">
                        <button class="sh-btn sh-btn--ghost sh-widget__test-btn" title="Tester tous les indexeurs">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                            <span>Tester</span>
                        </button>
                        <button class="sh-btn sh-btn--ghost sh-widget__refresh-btn" title="Rafraîchir">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        </button>
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
                        <p>Prowlarr n'est pas configuré. Rendez-vous dans les réglages SpaceHub pour renseigner l'URL et la clé API.</p>
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
                        <span class="sh-prowlarr-stat-number" style="color:#32d74b;">${summary.healthy}</span>
                        <span class="sh-prowlarr-stat-label">En ligne</span>
                    </div>
                    <div class="sh-prowlarr-stat-box">
                        <span class="sh-prowlarr-stat-number" style="color:${summary.degraded > 0 ? '#ff453a' : 'rgba(255,255,255,0.4)'};">${summary.degraded}</span>
                        <span class="sh-prowlarr-stat-label">Dégradé</span>
                    </div>
                </div>

                <div class="sh-prowlarr-indexers-list">
                    ${summary.indexers.slice(0, 10).map(idx => `
                        <div class="sh-prowlarr-indexer-item">
                            <span class="sh-prowlarr-badge sh-prowlarr-badge--${idx.protocol}">${idx.protocol === 'torrent' ? 'Torrent' : 'Usenet'}</span>
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
.sh-widget__refresh-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 50% !important;
    background: rgba(255, 255, 255, 0.05) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    color: rgba(255, 255, 255, 0.65) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    cursor: pointer !important;
    outline: none !important;
    padding: 0 !important;
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
}

.sh-widget__refresh-btn:hover {
    background: rgba(255, 255, 255, 0.14) !important;
    border-color: rgba(255, 255, 255, 0.28) !important;
    color: #ffffff !important;
    transform: rotate(45deg) scale(1.08) !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
}

.sh-widget__refresh-btn:active {
    transform: rotate(180deg) scale(0.92) !important;
    background: rgba(255, 255, 255, 0.20) !important;
}

.sh-widget__refresh-btn svg {
    width: 14px !important;
    height: 14px !important;
    stroke: currentColor !important;
    stroke-width: 2.3 !important;
    fill: none !important;
    pointer-events: none !important;
}

.sh-widget__test-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 5px 12px !important;
    border-radius: 9999px !important;
    background: rgba(255, 255, 255, 0.06) !important;
    border: 1px solid rgba(255, 255, 255, 0.14) !important;
    color: rgba(255, 255, 255, 0.85) !important;
    font-size: 11.5px !important;
    font-weight: 650 !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    cursor: pointer !important;
    outline: none !important;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.sh-widget__test-btn:hover {
    background: rgba(255, 255, 255, 0.15) !important;
    border-color: rgba(255, 255, 255, 0.30) !important;
    color: #ffffff !important;
    transform: translateY(-1px) !important;
}

.sh-widget__test-btn svg {
    width: 13px !important;
    height: 13px !important;
    stroke: currentColor !important;
    stroke-width: 2.3 !important;
    fill: none !important;
}

.sh-prowlarr-stats-row {
    display: flex;
    gap: 12px;
    margin-bottom: 14px;
}

.sh-prowlarr-stat-box {
    flex: 1;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 14px;
    padding: 14px 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transition: transform 180ms ease, border-color 180ms ease;
}
.sh-prowlarr-stat-box:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.18);
}

.sh-prowlarr-stat-number {
    font-size: 22px;
    font-weight: 750;
    letter-spacing: -0.02em;
    color: #ffffff;
}

.sh-prowlarr-stat-label {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.45);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-top: 3px;
}

.sh-prowlarr-indexers-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
}

.sh-prowlarr-indexer-item {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 12px;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    transition: background 140ms ease;
}
.sh-prowlarr-indexer-item:hover {
    background: rgba(255, 255, 255, 0.06);
}

.sh-prowlarr-indexer-name {
    flex: 1;
    font-weight: 550;
    color: rgba(255, 255, 255, 0.9);
}

.sh-prowlarr-badge {
    font-size: 9.5px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
}

.sh-prowlarr-badge--torrent {
    color: #64d2ff;
    background: rgba(100, 210, 255, 0.12);
    border: 1px solid rgba(100, 210, 255, 0.2);
}

.sh-prowlarr-badge--usenet {
    color: #32d74b;
    background: rgba(50, 215, 75, 0.12);
    border: 1px solid rgba(50, 215, 75, 0.2);
}

.sh-prowlarr-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}

.sh-prowlarr-status-dot.online {
    background: #32d74b;
    box-shadow: 0 0 8px rgba(50, 215, 75, 0.8);
}

.sh-prowlarr-status-dot.degraded {
    background: #ff453a;
    box-shadow: 0 0 8px rgba(255, 69, 58, 0.8);
}
        `;
        document.head.appendChild(style);
    }
}

export { ProwlarrStatusWidget };
