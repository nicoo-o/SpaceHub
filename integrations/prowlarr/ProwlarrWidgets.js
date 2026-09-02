import { escapeHtml } from '../../core/utils/domUtils.js';
import './ProwlarrWidgets.css';
import * as svc from '../../core/services.js';
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
            const prowlarr = svc.integration('prowlarr');
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
            const prowlarr = svc.integration('prowlarr');
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
                        <span class="sh-prowlarr-stat-number" style="color:${summary.degraded > 0 ? '#ff453a' : 'rgba(var(--sh-ink, 255, 255, 255), 0.4)'};">${summary.degraded}</span>
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
                    <p>Impossible de joindre Prowlarr (${escapeHtml(err.message)}). Vérifiez vos identifiants.</p>
                </div>
            `;
        }
    }

    async refresh(container) {
        await this.loadData(container);
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans ProwlarrWidgets.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export { ProwlarrStatusWidget };
