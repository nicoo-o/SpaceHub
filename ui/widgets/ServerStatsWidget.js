/**
 * SpaceHub — Server Stats Widgets
 * Version: 1.0.0
 *
 * Widgets pour surveiller l'état du serveur Jellyfin en temps réel.
 */

'use strict';

class ActiveSessionsWidget {
    constructor() {
        this.id = 'active-sessions';
        this.name = 'Activités en direct';
        this.defaultColSpan = 12;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--sessions">
                <div class="sh-widget__header">
                    <h3 class="sh-widget__title">👥 Qui regarde quoi ?</h3>
                </div>
                <div class="sh-widget__content">
                    <div id="sh-sessions-list">
                        <div class="sh-loader">Vérification...</div>
                    </div>
                </div>
            </div>
        `;
        this._loadSessions(container);
    }

    async _loadSessions(container) {
        const list = container.querySelector('#sh-sessions-list');
        const jellyfin = window.SpaceHub?.core?.api?.getClient('jellyfin');

        try {
            const sessions = await jellyfin.get('/Sessions');
            const active = sessions.filter(s => s.NowPlayingItem);

            if (active.length === 0) {
                list.innerHTML = '<p class="sh-no-data">Aucune lecture en cours</p>';
                return;
            }

            list.innerHTML = active.map(s => `
                <div class="sh-session-item">
                    <div class="sh-session-user">👤 ${s.UserName}</div>
                    <div class="sh-session-media sh-truncate">▶ ${s.NowPlayingItem.Name}</div>
                    <div class="sh-session-device sh-truncate">🖥️ ${s.DeviceName}</div>
                </div>
            `).join('');

        } catch (err) {
            list.innerHTML = '<p class="sh-no-data">Erreur de monitoring</p>';
        }
    }
}

class ServerHealthWidget {
    constructor() {
        this.id = 'server-health';
        this.name = 'Santé du serveur';
        this.defaultColSpan = 6;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--health">
                <div class="sh-widget__header">
                    <h3 class="sh-widget__title">⚙️ État Système</h3>
                </div>
                <div class="sh-widget__content">
                    <div class="sh-health-grid">
                        <div class="sh-health-card">
                            <span class="sh-health-label">Version</span>
                            <span class="sh-health-val" id="sh-health-version">-</span>
                        </div>
                        <div class="sh-health-card">
                            <span class="sh-health-label">OS</span>
                            <span class="sh-health-val" id="sh-health-os">-</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this._loadHealth(container);
    }

    async _loadHealth(container) {
        const jellyfin = window.SpaceHub?.core?.api?.getClient('jellyfin');
        try {
            const info = await jellyfin.get('/System/Info');
            container.querySelector('#sh-health-version').textContent = info.Version;
            container.querySelector('#sh-health-os').textContent = info.OperatingSystem;
        } catch (err) {}
    }
}

export { ActiveSessionsWidget, ServerHealthWidget };
