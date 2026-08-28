/**
 * SpaceHub — MediaAnalyticsWidget
 * Widget Bento Glass d'Accueil résumant l'activité de visionnage de l'utilisateur.
 */

'use strict';

import MediaAnalyticsService from '../../jellyfin/analytics/MediaAnalyticsService.js';
import AnalyticsModal from '../components/AnalyticsModal.js';

export class MediaAnalyticsWidget {
    static get id() { return 'media-analytics'; }
    static get name() { return '📊 Mes Statistiques'; }
    static get description() { return 'Temps de visionnage personnel, films vus et genres favoris'; }
    static get colSpan() { return 12; }

    constructor() {
        this._service = new MediaAnalyticsService();
        this._modal = new AnalyticsModal();
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--analytics">
                <div class="sh-widget__header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">📊</span>
                        <div>
                            <h3 class="sh-widget__title" style="margin: 0; font-size: 17px; font-weight: 700; color: #ffffff;">Mon Activité & Statistiques</h3>
                            <p style="margin: 2px 0 0 0; font-size: 12px; color: rgba(255,255,255,0.5);">Temps de visionnage et répartition de votre médiathèque</p>
                        </div>
                    </div>
                    <button class="sh-widget__refresh-btn" id="sh-btn-view-detailed-stats" style="background: rgba(255, 255, 255, 0.10); border: 1px solid rgba(255, 255, 255, 0.16); color: #ffffff; padding: 6px 14px; border-radius: 12px; font-size: 12px; font-weight: 600; cursor: pointer; backdrop-filter: blur(16px); transition: all 160ms ease;">
                        <span>Détails complets →</span>
                    </button>
                </div>

                <div id="sh-analytics-widget-body">
                    <div style="padding: 24px; text-align: center; color: rgba(255,255,255,0.5);">Calcul de l'activité...</div>
                </div>
            </div>
        `;

        container.querySelector('#sh-btn-view-detailed-stats')?.addEventListener('click', () => {
            this._modal.open();
        });

        await this._loadData(container);
    }

    async _loadData(container) {
        const bodyEl = container.querySelector('#sh-analytics-widget-body');
        if (!bodyEl) return;

        try {
            const stats = await this._service.getStats();

            bodyEl.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
                    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; display: flex; align-items: center; gap: 14px;">
                        <span style="font-size: 24px;">⏱️</span>
                        <div>
                            <strong style="font-size: 20px; color: #ffffff; display: block;">${stats.totalWatchTimeHours} h</strong>
                            <small style="font-size: 11px; color: rgba(255,255,255,0.5);">Temps total regardé</small>
                        </div>
                    </div>

                    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; display: flex; align-items: center; gap: 14px;">
                        <span style="font-size: 24px;">🎬</span>
                        <div>
                            <strong style="font-size: 20px; color: #ffffff; display: block;">${stats.playedMoviesCount} films</strong>
                            <small style="font-size: 11px; color: rgba(255,255,255,0.5);">Films visionnés</small>
                        </div>
                    </div>

                    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; display: flex; align-items: center; gap: 14px;">
                        <span style="font-size: 24px;">📺</span>
                        <div>
                            <strong style="font-size: 20px; color: #ffffff; display: block;">${stats.playedEpisodesCount} épisodes</strong>
                            <small style="font-size: 11px; color: rgba(255,255,255,0.5);">Épisodes terminés</small>
                        </div>
                    </div>

                    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; display: flex; align-items: center; gap: 14px;">
                        <span style="font-size: 24px;">💎</span>
                        <div>
                            <strong style="font-size: 20px; color: #ffffff; display: block;">${stats.resolutionPercentages.uhd4k}% 4K UHD</strong>
                            <small style="font-size: 11px; color: rgba(255,255,255,0.5);">Titres Ultra Haute Définition</small>
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            bodyEl.innerHTML = '<p style="color:rgba(255,255,255,0.4); padding:16px;">Impossible de charger les métriques.</p>';
        }
    }
}

export default MediaAnalyticsWidget;
