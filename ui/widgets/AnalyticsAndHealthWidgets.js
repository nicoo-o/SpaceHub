/**
 * SpaceHub — Analytics & Media Health Widgets
 * Version: 1.0.0
 *
 * Widgets pour le tableau de bord permettant d'afficher les statistiques
 * d'utilisation (UsageAnalytics) et la surveillance de santé des fichiers médias (MediaHealth).
 */

'use strict';

class UsageAnalyticsWidget {
    constructor() {
        this.id = 'usage-analytics';
        this.title = '📊 Statistiques d\'utilisation';
        this.defaultColSpan = 6;
    }

    get _analytics() {
        return window.SpaceHub?.core?.analytics;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--analytics">
                <div class="sh-widget__header">
                    <h3 class="sh-widget__title">📊 Statistiques d'utilisation</h3>
                    <button class="sh-btn sh-btn--ghost sh-btn--sm" data-action="refresh-analytics">🔄</button>
                </div>
                <div class="sh-widget__content" id="analytics-content">
                    ${this._renderBody()}
                </div>
            </div>
        `;

        this._bindEvents(container);
    }

    _renderBody() {
        const stats = this._analytics?.getStats() || { views: {}, plays: 0 };
        const totalViews = Object.values(stats.views || {}).reduce((a, b) => a + b, 0);

        return `
            <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; margin-bottom:12px;">
                <div style="background:var(--sh-bg-surface-2, #22222e); padding:12px; border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:var(--sh-color-primary, #7c6aff);">${stats.plays || 0}</div>
                    <div style="font-size:12px; color:var(--sh-text-secondary, #9898b8);">Lectures lancées</div>
                </div>
                <div style="background:var(--sh-bg-surface-2, #22222e); padding:12px; border-radius:8px; text-align:center;">
                    <div style="font-size:24px; font-weight:700; color:var(--sh-color-success, #2ecc71);">${totalViews}</div>
                    <div style="font-size:12px; color:var(--sh-text-secondary, #9898b8);">Pages consultées</div>
                </div>
            </div>
            <div style="font-size:12px; color:var(--sh-text-muted, #5c5c7a);">
                Top sections : ${Object.entries(stats.views || {})
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([path, count]) => `<strong>${path || 'accueil'}</strong> (${count})`)
                    .join(', ') || 'Aucune activité'}
            </div>
        `;
    }

    _bindEvents(container) {
        container.querySelector('[data-action="refresh-analytics"]')?.addEventListener('click', () => {
            const content = container.querySelector('#analytics-content');
            if (content) content.innerHTML = this._renderBody();
        });
    }

    async refresh(container) {
        const content = container.querySelector('#analytics-content');
        if (content) content.innerHTML = this._renderBody();
    }
}

class MediaHealthWidget {
    constructor() {
        this.id = 'media-health';
        this.title = '🩺 Santé des médias';
        this.defaultColSpan = 6;
        this._issues = [];
        this._scanning = false;
    }

    get _health() {
        return window.SpaceHub?.core?.health;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--media-health">
                <div class="sh-widget__header">
                    <h3 class="sh-widget__title">🩺 Santé des médias</h3>
                    <button class="sh-btn sh-btn--primary sh-btn--sm" id="btn-scan-health">
                        ${this._scanning ? 'Scan en cours...' : '🔍 Scanner'}
                    </button>
                </div>
                <div class="sh-widget__content" id="health-content">
                    <p style="color:var(--sh-text-secondary, #9898b8); font-size:13px;">
                        Cliquez sur "Scanner" pour vérifier l'état des codecs et flux vidéo de vos médias récents.
                    </p>
                </div>
            </div>
        `;

        this._bindEvents(container);
    }

    _bindEvents(container) {
        container.querySelector('#btn-scan-health')?.addEventListener('click', async (e) => {
            if (this._scanning) return;
            this._scanning = true;
            e.target.textContent = 'Scan en cours...';
            const content = container.querySelector('#health-content');
            content.innerHTML = '<p style="color:var(--sh-text-muted);">Analyse de la bibliothèque Jellyfin...</p>';

            this._issues = await this._health?.scanPotentialIssues(50) || [];
            this._scanning = false;
            e.target.textContent = '🔍 Scanner';

            if (this._issues.length === 0) {
                content.innerHTML = `
                    <div style="background:rgba(46, 204, 113, 0.1); border:1px solid #2ecc71; padding:12px; border-radius:8px; color:#2ecc71; font-size:13px;">
                        ✅ Aucun problème détecté sur les 50 derniers ajouts.
                    </div>
                `;
            } else {
                content.innerHTML = `
                    <div style="margin-bottom:8px; font-size:13px; color:var(--sh-color-warning, #f39c12);">
                        ⚠️ ${this._issues.length} média(s) avec flux manquant ou bitrate invalide :
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px; max-height:160px; overflow-y:auto;">
                        ${this._issues.map(item => `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--sh-bg-surface-2); padding:6px 10px; border-radius:6px; font-size:12px;">
                                <span class="sh-truncate" style="max-width:200px;">${item.Name}</span>
                                <button class="sh-btn sh-btn--ghost sh-btn--sm btn-redownload" data-id="${item.Id}">
                                    🔄 Re-télécharger
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `;

                content.querySelectorAll('.btn-redownload').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const item = this._issues.find(i => i.Id === btn.dataset.id);
                        if (item) {
                            btn.textContent = 'Demande envoyée';
                            btn.disabled = true;
                            await this._health?.triggerRedownload(item);
                            window.SpaceHub?.ui?.components?.toaster?.info(`Recherche déclenchée pour ${item.Name}`);
                        }
                    });
                });
            }
        });
    }

    async refresh(container) {
        if (!this._scanning && this._issues.length > 0) {
            this.render(container);
        }
    }
}

export { UsageAnalyticsWidget, MediaHealthWidget };
