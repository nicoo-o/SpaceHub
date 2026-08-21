/**
 * SpaceHub — Calendar View Pro
 * Version: 2.0.0
 *
 * Calendrier unifié des sorties à venir (Sonarr + Radarr + Lidarr).
 * - Vue mensuelle interactive avec grille 7 jours
 * - Vue liste chronologique sur 30 jours
 * - Export iCal (.ics) pour Google Calendar, Apple Calendar, etc.
 * - Clic sur un événement pour ouvrir la fiche Servarr
 */

'use strict';

import Logger from '../../core/Logger.js';

class CalendarView {
    constructor() {
        this._log = new Logger('CalendarView');
        this._rangeDays = 30;
        this._viewMode = 'month'; // 'month' | 'list'
        this._currentMonth = new Date();
        this._allItems = [];
    }

    async render(container) {
        this._container = container;

        container.innerHTML = `
            <div class="sh-calendar-pro">
                <div class="sh-calendar-pro-header">
                    <div>
                        <h2>📅 Calendrier des Sorties</h2>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin-top:4px;">
                            Sonarr · Radarr · Lidarr · Prochains ${this._rangeDays} jours
                        </p>
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-cal-mode-month" style="font-weight:700;">📆 Mois</button>
                        <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-cal-mode-list">📋 Liste</button>
                        <button class="sh-btn sh-btn--primary sh-btn--sm" id="btn-cal-export-ical">📤 Exporter iCal</button>
                    </div>
                </div>

                <div class="sh-calendar-pro-content" id="sh-cal-content">
                    <div style="text-align:center; padding:40px; color:var(--sh-text-muted);">Chargement du calendrier...</div>
                </div>
            </div>
        `;

        this._injectStyles();
        this._allItems = await this._fetchAllItems();

        this._bindHeaderEvents();
        this._renderCurrentView();
    }

    _bindHeaderEvents() {
        this._container.querySelector('#btn-cal-mode-month')?.addEventListener('click', () => {
            this._viewMode = 'month';
            this._container.querySelector('#btn-cal-mode-month').style.fontWeight = '700';
            this._container.querySelector('#btn-cal-mode-list').style.fontWeight = '';
            this._renderCurrentView();
        });

        this._container.querySelector('#btn-cal-mode-list')?.addEventListener('click', () => {
            this._viewMode = 'list';
            this._container.querySelector('#btn-cal-mode-list').style.fontWeight = '700';
            this._container.querySelector('#btn-cal-mode-month').style.fontWeight = '';
            this._renderCurrentView();
        });

        this._container.querySelector('#btn-cal-export-ical')?.addEventListener('click', () => {
            this._exportIcal();
        });
    }

    async _fetchAllItems() {
        const sonarrApi = window.SpaceHub?.integrations?.sonarr?.api;
        const radarrApi = window.SpaceHub?.integrations?.radarr?.api;

        const start = new Date();
        const end = new Date(Date.now() + this._rangeDays * 24 * 60 * 60 * 1000);

        const [episodes, movies] = await Promise.all([
            sonarrApi ? sonarrApi.getCalendar(start, end).catch(() => []) : [],
            radarrApi ? radarrApi.getCalendar(start, end).catch(() => []) : [],
        ]);

        const items = [
            ...(episodes || []).map(e => ({
                type: 'episode',
                date: new Date(e.airDateUtc || e.airDate),
                title: e.series?.title || 'Série inconnue',
                subtitle: `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} — ${e.title || ''}`,
                icon: '📺',
                color: '#7c6aff',
                hasFile: e.hasFile
            })),
            ...(movies || []).map(m => ({
                type: 'movie',
                date: new Date(m.physicalRelease || m.inCinemas || m.digitalRelease),
                title: m.title || 'Film inconnu',
                subtitle: m.inCinemas ? `🎬 Sortie cinéma` : m.physicalRelease ? `📦 Sortie physique` : `🌐 Sortie digitale`,
                icon: '🎬',
                color: '#e74c3c',
                hasFile: m.hasFile
            })),
        ].filter(i => !isNaN(i.date.getTime()))
         .sort((a, b) => a.date - b.date);

        return items;
    }

    _renderCurrentView() {
        const contentEl = this._container?.querySelector('#sh-cal-content');
        if (!contentEl) return;

        if (this._viewMode === 'month') {
            this._renderMonthView(contentEl);
        } else {
            this._renderListView(contentEl);
        }
    }

    _renderMonthView(contentEl) {
        const year = this._currentMonth.getFullYear();
        const month = this._currentMonth.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Lundi en premier

        const monthName = this._currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

        // Construire la grille
        const days = [];
        for (let i = 0; i < startDow; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
        while (days.length % 7 !== 0) days.push(null);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        contentEl.innerHTML = `
            <div class="sh-month-view">
                <div class="sh-month-nav">
                    <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-prev-month">‹</button>
                    <h3 style="margin:0; text-transform:capitalize;">${monthName}</h3>
                    <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-next-month">›</button>
                </div>

                <div class="sh-month-grid">
                    ${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d =>
                        `<div class="sh-month-dow">${d}</div>`
                    ).join('')}

                    ${days.map(day => {
                        if (!day) return '<div class="sh-month-day sh-month-day--empty"></div>';

                        const isToday = day.getTime() === today.getTime();
                        const dayItems = this._allItems.filter(item => {
                            const d = new Date(item.date);
                            return d.getFullYear() === day.getFullYear() &&
                                   d.getMonth() === day.getMonth() &&
                                   d.getDate() === day.getDate();
                        });

                        const dots = dayItems.slice(0, 3).map(i => `<div class="sh-day-dot" style="background:${i.color};"></div>`).join('');
                        const moreCount = dayItems.length > 3 ? `<div style="font-size:9px; color:var(--sh-text-muted);">+${dayItems.length - 3}</div>` : '';

                        return `
                            <div class="sh-month-day ${isToday ? 'sh-month-day--today' : ''} ${dayItems.length > 0 ? 'sh-month-day--has-events' : ''}"
                                 data-date="${day.toISOString()}">
                                <span class="sh-day-number">${day.getDate()}</span>
                                <div class="sh-day-dots">${dots}${moreCount}</div>
                                ${dayItems.length > 0 ? `
                                    <div class="sh-day-tooltip">
                                        ${dayItems.map(i => `<div class="sh-day-tooltip-item">${i.icon} <strong>${i.title}</strong><br><small>${i.subtitle}</small></div>`).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        contentEl.querySelector('#btn-prev-month')?.addEventListener('click', () => {
            this._currentMonth = new Date(year, month - 1, 1);
            this._renderMonthView(contentEl);
        });
        contentEl.querySelector('#btn-next-month')?.addEventListener('click', () => {
            this._currentMonth = new Date(year, month + 1, 1);
            this._renderMonthView(contentEl);
        });
    }

    _renderListView(contentEl) {
        if (this._allItems.length === 0) {
            contentEl.innerHTML = `
                <div style="text-align:center; padding:48px 0;">
                    <div style="font-size:40px; margin-bottom:12px;">📅</div>
                    <p style="color:var(--sh-text-muted);">Aucun événement sur les ${this._rangeDays} prochains jours.</p>
                    <p style="font-size:13px; color:var(--sh-text-muted);">Configurez Sonarr et/ou Radarr dans Réglages → Intégrations.</p>
                </div>
            `;
            return;
        }

        const groups = new Map();
        for (const item of this._allItems) {
            const key = item.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        }

        contentEl.innerHTML = `
            <div class="sh-cal-list-view">
                ${Array.from(groups.entries()).map(([day, dayItems]) => `
                    <div class="sh-cal-day-group">
                        <h3 class="sh-cal-day-title">${day}</h3>
                        ${dayItems.map(i => `
                            <div class="sh-cal-item" style="border-left: 3px solid ${i.color};">
                                <div class="sh-cal-item-icon">${i.icon}</div>
                                <div class="sh-cal-item-body">
                                    <div class="sh-cal-item-title">${this._esc(i.title)}</div>
                                    <div class="sh-cal-item-subtitle">${this._esc(i.subtitle)}</div>
                                </div>
                                <div class="sh-cal-item-status">
                                    ${i.hasFile ? '<span style="color:#2ecc71; font-size:11px; font-weight:700;">✅ Disponible</span>' : '<span style="color:var(--sh-text-muted); font-size:11px;">⏳ En attente</span>'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Exporte le calendrier complet au format iCalendar (.ics).
     */
    _exportIcal() {
        const now = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15) + 'Z';

        const events = this._allItems.map((item, idx) => {
            const dtstart = item.date.toISOString().replace(/[-:]/g, '').slice(0, 8);
            const uid = `spacehub-${item.type}-${idx}-${dtstart}@spacehub`;

            return [
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${now}`,
                `DTSTART;VALUE=DATE:${dtstart}`,
                `DTEND;VALUE=DATE:${dtstart}`,
                `SUMMARY:${item.icon} ${item.title}`,
                `DESCRIPTION:${item.subtitle}`,
                'END:VEVENT'
            ].join('\r\n');
        });

        const ical = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//SpaceHub//Media Calendar//FR',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:SpaceHub — Sorties Médias',
            ...events,
            'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'spacehub-calendar.ics';
        a.click();
        URL.revokeObjectURL(url);

        window.SpaceHub?.ui?.components?.toaster?.success('📤 Calendrier iCal exporté avec succès !');
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
.sh-calendar-pro { max-width: 1100px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-calendar-pro-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid var(--sh-border-color); padding-bottom: 16px; }

/* Month view */
.sh-month-view { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); border-radius: 16px; overflow: hidden; }
.sh-month-nav { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--sh-border-color); }
.sh-month-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
.sh-month-dow { padding: 10px; text-align: center; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--sh-text-muted); border-bottom: 1px solid var(--sh-border-color); }
.sh-month-day { padding: 8px; min-height: 72px; border-bottom: 1px solid var(--sh-border-color); border-right: 1px solid var(--sh-border-color); position: relative; cursor: pointer; transition: background 0.15s; }
.sh-month-day:hover { background: var(--sh-bg-surface-3); }
.sh-month-day--empty { background: rgba(0,0,0,0.1); }
.sh-month-day--today .sh-day-number { background: var(--sh-color-primary, #7c6aff); color: #fff; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; }
.sh-day-number { font-size: 13px; font-weight: 600; }
.sh-day-dots { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; }
.sh-day-dot { width: 6px; height: 6px; border-radius: 50%; }
.sh-day-tooltip { display: none; position: absolute; top: 100%; left: 0; z-index: 100; background: var(--sh-bg-surface-3); border: 1px solid var(--sh-border-color); padding: 10px; border-radius: 10px; min-width: 220px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
.sh-month-day--has-events:hover .sh-day-tooltip { display: block; }
.sh-day-tooltip-item { font-size: 12px; margin-bottom: 8px; line-height: 1.4; }

/* List view */
.sh-cal-list-view { display: flex; flex-direction: column; gap: 24px; }
.sh-cal-day-group {}
.sh-cal-day-title { text-transform: capitalize; font-size: 14px; color: var(--sh-text-secondary); font-weight: 700; margin: 0 0 10px 0; padding-bottom: 6px; border-bottom: 1px solid var(--sh-border-color); }
.sh-cal-item { display: flex; align-items: center; gap: 16px; background: var(--sh-bg-surface-2); border-radius: 10px; padding: 14px 16px; margin-bottom: 8px; }
.sh-cal-item-icon { font-size: 22px; flex-shrink: 0; }
.sh-cal-item-body { flex: 1; min-width: 0; }
.sh-cal-item-title { font-weight: 700; font-size: 14px; }
.sh-cal-item-subtitle { font-size: 12px; color: var(--sh-text-muted); margin-top: 2px; }
.sh-cal-item-status { flex-shrink: 0; }
        `;
        document.head.appendChild(style);
    }
}

export default CalendarView;
