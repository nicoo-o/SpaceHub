/**
 * SpaceHub — Activity History View
 * Version: 1.0.0
 *
 * Affiche l'historique de lecture (Tautulli style).
 */

'use strict';

import Logger from '../../core/Logger.js';

class ActivityHistoryView {
    constructor() {
        this._log = new Logger('ActivityHistoryView');
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-view sh-history-view">
                <header class="sh-view__header">
                    <h2 class="sh-view__title">🕰️ Historique d'activité</h2>
                    <p class="sh-view__subtitle">Dernières lectures sur le serveur</p>
                </header>
                <div class="sh-history-content" id="sh-history-list">
                    <div class="sh-loader">Chargement de l'historique...</div>
                </div>
            </div>
        `;

        this._loadHistory();
    }

    async _loadHistory() {
        const list = document.getElementById('sh-history-list');
        const jellyfin = window.SpaceHub?.core?.api?.getClient('jellyfin');

        try {
            // Note: Jellyfin n'a pas d'API d'historique globale simple sans plugin Playback Reporting.
            // On utilise les derniers items vus par l'utilisateur actuel comme fallback.
            const data = await jellyfin.get(`/Users/${window.SpaceHub.auth.getUserId()}/Items?Recursive=true&SortBy=DatePlayed&SortOrder=Descending&Filters=IsPlayed&Limit=50&Fields=DatePlayed,PrimaryImageAspectRatio`);
            const items = data?.Items || [];

            if (items.length === 0) {
                list.innerHTML = '<div class="sh-no-data">Aucun historique disponible.</div>';
                return;
            }

            list.innerHTML = `
                <table class="sh-table">
                    <thead>
                        <tr>
                            <th>Média</th>
                            <th>Date de lecture</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td>
                                    <div style="display:flex; align-items:center; gap:12px;">
                                        <img src="${jellyfin.getImageUrl(item.Id, 'Primary', { maxWidth: 60 })}" style="width:40px; border-radius:4px;" alt="">
                                        <span>${item.Name}</span>
                                    </div>
                                </td>
                                <td style="color:var(--sh-text-muted);">${new Date(item.UserData.LastPlayedDate).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

        } catch (err) {
            list.innerHTML = '<div class="sh-no-data">Erreur de chargement de l\'historique.</div>';
        }
    }
}

export default ActivityHistoryView;
