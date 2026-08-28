/**
 * SpaceHub — UnifiedCalendarWidget
 * Widget Bento Glass pour l'Accueil affichant la chronologie des sorties de la semaine.
 */

'use strict';

import UnifiedCalendarService from '../../jellyfin/calendar/UnifiedCalendarService.js';
import GooeyCarouselScroller from '../components/GooeyCarouselScroller.js';

export class UnifiedCalendarWidget {
    static get id() { return 'unified-calendar'; }
    static get name() { return '📅 Calendrier des Sorties'; }
    static get description() { return 'Ligne temporelle des sorties séries et films (Sonarr, Radarr, Jellyseerr)'; }
    static get colSpan() { return 12; }

    constructor() {
        this._service = new UnifiedCalendarService();
        this._events = [];
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-widget sh-widget--unified-calendar">
                <div class="sh-widget__header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">📅</span>
                        <div>
                            <h3 class="sh-widget__title" style="margin: 0; font-size: 17px; font-weight: 700; color: #ffffff;">Prochaines Sorties de la Semaine</h3>
                            <p style="margin: 2px 0 0 0; font-size: 12px; color: rgba(255,255,255,0.5);">Épisodes & Films attendus (Sonarr, Radarr & Jellyseerr)</p>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="sh-widget__refresh-btn" id="sh-cal-btn-view-all" style="background: rgba(255, 255, 255, 0.10); border: 1px solid rgba(255, 255, 255, 0.16); color: #ffffff; padding: 6px 14px; border-radius: 12px; font-size: 12px; font-weight: 600; cursor: pointer; backdrop-filter: blur(16px); transition: all 160ms ease;">
                            <span>Voir le calendrier complet →</span>
                        </button>
                    </div>
                </div>

                <div class="sh-calendar-widget-track" id="sh-cal-widget-content">
                    <div class="sh-widget__loading" style="padding: 32px; text-align: center; color: rgba(255,255,255,0.5);">
                        Chargement de la chronologie des sorties...
                    </div>
                </div>
            </div>
        `;

        // Bouton vers la vue Flux complète
        container.querySelector('#sh-cal-btn-view-all')?.addEventListener('click', () => {
            window.SpaceHub?.ui?.appLayout?.navigate?.('flux', { tab: 'calendar' });
        });

        await this._loadEvents(container);
    }

    async _loadEvents(container) {
        const contentEl = container.querySelector('#sh-cal-widget-content');
        if (!contentEl) return;

        try {
            // Récupérer 14 jours de sorties
            const start = new Date(Date.now() - 12 * 60 * 60 * 1000);
            const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            const events = await this._service.getEvents(start, end);
            this._events = events;

            if (events.length === 0) {
                contentEl.innerHTML = `
                    <div style="padding: 32px; text-align: center; color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.03); border-radius: 16px;">
                        <p style="margin: 0; font-size: 14px;">Aucune sortie programmée pour les 14 prochains jours.</p>
                    </div>
                `;
                return;
            }

            const todayStr = new Date().toISOString().split('T')[0];
            const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

            contentEl.innerHTML = `
                <div class="sh-gooey-carousel-wrapper" style="position: relative; width: 100%; overflow: hidden;">
                    <div class="sh-gooey-carousel" id="sh-cal-carousel" style="display: flex; gap: 16px; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; padding: 6px 2px 14px 2px;">
                        ${events.map(ev => {
                            let dayBadge = '';
                            if (ev.dateStr === todayStr) {
                                dayBadge = '<span class="sh-cal-day-badge today">AUJOURD\'HUI</span>';
                            } else if (ev.dateStr === tomorrowStr) {
                                dayBadge = '<span class="sh-cal-day-badge tomorrow">DEMAIN</span>';
                            } else {
                                const formatted = ev.releaseDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
                                dayBadge = `<span class="sh-cal-day-badge">${formatted.toUpperCase()}</span>`;
                            }

                            const typeBadge = ev.type === 'episode'
                                ? '<span class="sh-cal-type-pill ep">📺 ÉPISODE</span>'
                                : '<span class="sh-cal-type-pill movie">🎬 FILM</span>';

                            const posterImg = ev.posterUrl
                                ? `<img src="${ev.posterUrl}" alt="${ev.title}" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'160\\' height=\\'240\\' fill=\\'%23111\\'><rect width=\\'100%\\' height=\\'100%\\'/></svg>'"/>`
                                : `<div class="sh-cal-poster-placeholder">${ev.type === 'episode' ? '📺' : '🎬'}</div>`;

                            return `
                                <div class="sh-cal-card" data-event-id="${ev.id}" style="flex: 0 0 170px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 18px; padding: 10px; cursor: pointer; transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms ease, border-color 200ms ease; display: flex; flex-direction: column; gap: 8px;">
                                    <div class="sh-cal-card-top" style="display: flex; justify-content: space-between; align-items: center;">
                                        ${dayBadge}
                                        ${typeBadge}
                                    </div>
                                    <div class="sh-cal-poster-wrap" style="width: 100%; aspect-ratio: 2/3; border-radius: 12px; overflow: hidden; background: #000; position: relative;">
                                        ${posterImg}
                                        ${ev.hasFile ? '<span style="position: absolute; bottom: 6px; right: 6px; background: rgba(48, 209, 88, 0.85); color: #000; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px;">DISPO</span>' : ''}
                                    </div>
                                    <div class="sh-cal-info" style="display: flex; flex-direction: column; gap: 2px;">
                                        <strong style="font-size: 13px; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ev.title}</strong>
                                        <small style="font-size: 11px; color: rgba(255,255,255,0.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ev.subTitle}</small>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;

            // Injection du scroller inertiel avec chevrons
            const carousel = contentEl.querySelector('#sh-cal-carousel');
            if (carousel) {
                GooeyCarouselScroller.attach(carousel);
            }

            // Clic sur une carte pour ouvrir la fiche
            contentEl.querySelectorAll('.sh-cal-card').forEach(card => {
                card.addEventListener('click', () => {
                    const evId = card.dataset.eventId;
                    const ev = this._events.find(e => e.id === evId);
                    if (ev) {
                        this._openEventDetails(ev);
                    }
                });
            });

            this._injectStyles();
        } catch (e) {
            contentEl.innerHTML = '<p style="color:rgba(255,255,255,0.4); padding:16px;">Impossible de charger le calendrier.</p>';
        }
    }

    _openEventDetails(ev) {
        if (!ev) return;
        const modal = window.SpaceHub?.ui?.modalSlideUpSheet || window.SpaceHub?.ui?.components?.modalSlideUpSheet;
        const relDate = ev.releaseDate instanceof Date ? ev.releaseDate : new Date(ev.releaseDate || Date.now());
        if (modal) {
            modal.open({
                Id: ev.id,
                id: ev.id,
                Name: ev.title,
                title: ev.title,
                SeriesName: ev.type === 'episode' ? ev.title : undefined,
                EpisodeTitle: ev.type === 'episode' ? ev.subTitle : undefined,
                Overview: ev.overview || `${ev.title} — ${ev.subTitle}`,
                overview: ev.overview || `${ev.title} — ${ev.subTitle}`,
                ProductionYear: relDate ? relDate.getFullYear() : '',
                year: relDate ? relDate.getFullYear() : '',
                Genres: [ev.subTitle || 'Sortie Média'],
                Type: ev.type === 'episode' ? 'Episode' : 'Movie',
                type: ev.type === 'episode' ? 'Episode' : 'Movie',
                imageUrl: ev.posterUrl,
                posterUrl: ev.posterUrl,
                ImageTags: { Primary: ev.posterUrl },
                hasFile: Boolean(ev.hasFile),
                source: ev.source || 'calendar',
                network: ev.network || '',
                studio: ev.studio || ''
            });
        }
    }

    _injectStyles() {
        if (document.getElementById('sh-cal-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-cal-widget-styles';
        style.textContent = `
.sh-cal-card:hover {
    transform: translateY(-4px) scale(1.02);
    border-color: rgba(255, 255, 255, 0.25) !important;
    box-shadow: 0 14px 35px rgba(0, 0, 0, 0.6) !important;
}

.sh-cal-poster-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 300ms ease;
}

.sh-cal-card:hover .sh-cal-poster-wrap img {
    transform: scale(1.06);
}

.sh-cal-day-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.10);
    color: rgba(255, 255, 255, 0.85);
    letter-spacing: 0.4px;
}

.sh-cal-day-badge.today {
    background: rgba(255, 45, 85, 0.25);
    border: 1px solid rgba(255, 45, 85, 0.4);
    color: #ff375f;
}

.sh-cal-day-badge.tomorrow {
    background: rgba(255, 159, 10, 0.25);
    border: 1px solid rgba(255, 159, 10, 0.4);
    color: #ff9f0a;
}

.sh-cal-type-pill {
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 6px;
}

.sh-cal-type-pill.ep {
    background: rgba(191, 90, 242, 0.18);
    color: #bf5af2;
}

.sh-cal-type-pill.movie {
    background: rgba(100, 210, 255, 0.18);
    color: #64d2ff;
}

.sh-cal-poster-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    background: rgba(255, 255, 255, 0.05);
}
        `;
        document.head.appendChild(style);
    }
}

export default UnifiedCalendarWidget;
