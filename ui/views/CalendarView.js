/**
 * SpaceHub — Calendar View
 * Version: 1.0.0
 *
 * Calendrier unifié des sorties à venir (14 prochains jours), croisant
 * Sonarr (épisodes) et Radarr (films), triés chronologiquement.
 */

'use strict';

import Logger from '../../core/Logger.js';

class CalendarView {
    constructor() {
        this._log = new Logger('CalendarView');
        this._rangeDays = 14;
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-calendar">
                <div class="sh-calendar__header">
                    <h1>📅 Calendrier</h1>
                    <span class="sh-text-muted">Les ${this._rangeDays} prochains jours</span>
                </div>
                <div id="sh-calendar-list" class="sh-calendar__list"><p class="sh-text-muted">Chargement…</p></div>
            </div>
        `;
        this._injectStyles();
        await this._load(container);
    }

    async _load(container) {
        const target = container.querySelector('#sh-calendar-list');
        const start = new Date();
        const end = new Date(Date.now() + this._rangeDays * 24 * 60 * 60 * 1000);

        const sonarrApi = window.SpaceHub?.integrations?.sonarr?.api;
        const radarrApi = window.SpaceHub?.integrations?.radarr?.api;

        const [episodes, movies] = await Promise.all([
            sonarrApi ? sonarrApi.getCalendar(start, end).catch(err => { this._log.error('Erreur Sonarr:', err); return []; }) : [],
            radarrApi ? radarrApi.getCalendar(start, end).catch(err => { this._log.error('Erreur Radarr:', err); return []; }) : [],
        ]);

        const items = [
            ...(episodes || []).map(e => ({
                type: 'episode',
                date: new Date(e.airDateUtc || e.airDate),
                title: e.series?.title || 'Série',
                subtitle: `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} — ${e.title || ''}`,
                icon: '📺',
            })),
            ...(movies || []).map(m => ({
                type: 'movie',
                date: new Date(m.physicalRelease || m.inCinemas || m.digitalRelease),
                title: m.title,
                subtitle: 'Sortie film',
                icon: '🎬',
            })),
        ].filter(i => !isNaN(i.date.getTime()))
         .sort((a, b) => a.date - b.date);

        if (!window.SpaceHub?.integrations?.sonarr && !window.SpaceHub?.integrations?.radarr) {
            target.innerHTML = '<p class="sh-text-muted">Configure Sonarr et/ou Radarr dans les réglages pour voir le calendrier.</p>';
            return;
        }

        if (items.length === 0) {
            target.innerHTML = '<p class="sh-text-muted">Rien de prévu sur cette période.</p>';
            return;
        }

        // Groupement par jour
        const groups = new Map();
        for (const item of items) {
            const key = item.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        }

        target.innerHTML = Array.from(groups.entries()).map(([day, dayItems]) => `
            <div class="sh-calendar__day">
                <h3 class="sh-calendar__day-title">${day}</h3>
                <div class="sh-calendar__day-items">
                    ${dayItems.map(i => `
                        <div class="sh-calendar__item">
                            <span class="sh-calendar__item-icon">${i.icon}</span>
                            <div>
                                <div class="sh-calendar__item-title">${this._esc(i.title)}</div>
                                <div class="sh-calendar__item-subtitle">${this._esc(i.subtitle)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    _esc(str) {
        const div = document.createElement('div');
        div.textContent = String(str ?? '');
        return div.innerHTML;
    }

    _injectStyles() {
        if (document.getElementById('sh-calendar-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-calendar-styles';
        style.textContent = `
.sh-calendar { max-width: 800px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-calendar__header { display:flex; align-items:baseline; gap: var(--sh-space-3, 12px); margin-bottom: var(--sh-space-6, 24px); }
.sh-calendar__day { margin-bottom: var(--sh-space-5, 20px); }
.sh-calendar__day-title { text-transform: capitalize; font-size: var(--sh-text-md, 14px); color: var(--sh-text-secondary); margin-bottom: var(--sh-space-2, 8px); }
.sh-calendar__item { display:flex; align-items:center; gap: var(--sh-space-3, 12px); background: var(--sh-bg-surface-2, #22222e); border-radius: var(--sh-radius-md, 12px); padding: var(--sh-space-3, 12px); margin-bottom: var(--sh-space-2, 8px); }
.sh-calendar__item-icon { font-size: 20px; }
.sh-calendar__item-title { font-weight: 600; }
.sh-calendar__item-subtitle { font-size: var(--sh-text-sm, 13px); color: var(--sh-text-secondary); }
.sh-text-muted { color: var(--sh-text-muted, #5c5c7a); }
        `;
        document.head.appendChild(style);
    }
}

export default CalendarView;
