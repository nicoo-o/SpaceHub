/**
 * SpaceHub — Live TV, 24h EPG Guide & DVR View
 * Version: 2.0.0
 *
 * Vue complète de la télévision en direct :
 * - Mosaïque des chaînes avec programme en cours
 * - Guide électronique des programmes (EPG) panoramique 24h interactif
 * - Gestionnaire d'enregistrements (DVR)
 */

'use strict';

import Logger from '../../../core/Logger.js';
import LiveTvService from '../../../jellyfin/livetv/LiveTvService.js';

class LiveTvView {
    constructor() {
        this._log = new Logger('LiveTvView');
        this._service = new LiveTvService();
        this._currentTab = 'channels';
        this._container = null;
        this._channelsCache = [];
    }

    async render(container) {
        this._container = container;

        container.innerHTML = `
            <div class="sh-livetv-page">
                <div class="sh-livetv-header">
                    <div>
                        <h2>📺 Télévision en direct & Guide EPG</h2>
                        <p style="color:var(--sh-text-secondary); font-size:14px; margin-top:4px;">
                            Regardez le direct, consultez la grille des programmes 24h et gérez vos enregistrements.
                        </p>
                    </div>
                    <button class="sh-btn sh-btn--ghost sh-btn--sm" id="btn-livetv-refresh">🔄 Actualiser</button>
                </div>

                <div class="sh-livetv-tabs">
                    <button class="sh-tv-tab ${this._currentTab === 'channels' ? 'active' : ''}" data-tab="channels">
                        📺 Chaînes & Direct
                    </button>
                    <button class="sh-tv-tab ${this._currentTab === 'epg' ? 'active' : ''}" data-tab="epg">
                        📅 Guide EPG 24h
                    </button>
                    <button class="sh-tv-tab ${this._currentTab === 'dvr' ? 'active' : ''}" data-tab="dvr">
                        🔴 Enregistrements & DVR
                    </button>
                </div>

                <div class="sh-livetv-content" id="sh-livetv-tab-content"></div>
            </div>
        `;

        this._injectStyles();
        this._bindTabs();
        await this._renderCurrentTab();
    }

    _bindTabs() {
        const tabs = this._container.querySelectorAll('.sh-tv-tab');
        tabs.forEach(t => {
            t.addEventListener('click', async () => {
                tabs.forEach(tab => tab.classList.remove('active'));
                t.classList.add('active');
                this._currentTab = t.dataset.tab;
                await this._renderCurrentTab();
            });
        });

        this._container.querySelector('#btn-livetv-refresh')?.addEventListener('click', () => {
            this._renderCurrentTab();
        });
    }

    async _renderCurrentTab() {
        const contentEl = this._container?.querySelector('#sh-livetv-tab-content');
        if (!contentEl) return;

        if (this._currentTab === 'channels') {
            await this._renderChannelsTab(contentEl);
        } else if (this._currentTab === 'epg') {
            await this._renderEpgTab(contentEl);
        } else if (this._currentTab === 'dvr') {
            await this._renderDvrTab(contentEl);
        }
    }

    async _renderChannelsTab(contentEl) {
        contentEl.innerHTML = '<div style="text-align:center; padding:40px; color:var(--sh-text-muted);">Chargement des chaînes...</div>';
        const channels = await this._service.getChannels();
        this._channelsCache = channels;

        if (channels.length === 0) {
            contentEl.innerHTML = `
                <div class="sh-empty-state" style="padding:48px 0; text-align:center;">
                    <div style="font-size:40px; margin-bottom:12px;">📺</div>
                    <p style="color:var(--sh-text-muted);">Aucune chaîne Live TV configurée sur Jellyfin.</p>
                </div>
            `;
            return;
        }

        const serverUrl = window.SpaceHub?.auth?.getServerUrl();
        const token = window.SpaceHub?.auth?.getToken();

        contentEl.innerHTML = `
            <div class="sh-livetv-grid">
                ${channels.map(channel => {
                    const program = channel.CurrentProgram;
                    const logoUrl = `${serverUrl}/Items/${channel.Id}/Images/Primary?tag=${channel.ImageTags?.Primary || ''}&maxWidth=120&api_key=${token}`;

                    return `
                        <div class="sh-channel-card" data-id="${channel.Id}">
                            <div class="sh-channel-card__logo">
                                <img src="${logoUrl}" alt="${channel.Name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                                <div style="display:none; font-size:24px;">📺</div>
                            </div>
                            <div class="sh-channel-card__info">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <h4 class="sh-channel-card__name">${channel.Name}</h4>
                                    <span style="font-size:10px; color:#2ecc71; font-weight:700;">● DIRECT</span>
                                </div>
                                ${program ? `
                                    <p class="sh-channel-card__program sh-truncate">${program.Name}</p>
                                    <div class="sh-channel-card__progress">
                                        <div class="sh-channel-card__bar" style="width: ${this._getProgramProgress(program)}%"></div>
                                    </div>
                                ` : '<p class="sh-channel-card__program">Aucune information EPG</p>'}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        contentEl.querySelectorAll('.sh-channel-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                const channel = channels.find(c => c.Id === id);
                if (channel) {
                    window.SpaceHub?.player?.play(channel);
                }
            });
        });
    }

    async _renderEpgTab(contentEl) {
        contentEl.innerHTML = '<div style="text-align:center; padding:40px; color:var(--sh-text-muted);">Génération de la grille des programmes 24h...</div>';

        if (this._channelsCache.length === 0) {
            this._channelsCache = await this._service.getChannels();
        }

        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        const programs = await this._service.getPrograms([], startOfDay, endOfDay);
        const serverUrl = window.SpaceHub?.auth?.getServerUrl();
        const token = window.SpaceHub?.auth?.getToken();

        const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

        contentEl.innerHTML = `
            <div class="sh-epg-container">
                <div class="sh-epg-timeline-header">
                    <div class="sh-epg-corner-cell">Chaînes</div>
                    <div class="sh-epg-hours-track">
                        ${hours.map(h => `<div class="sh-epg-hour-slot">${h}</div>`).join('')}
                    </div>
                </div>

                <div class="sh-epg-grid-body">
                    ${this._channelsCache.map(channel => {
                        const channelProgs = programs.filter(p => p.ChannelId === channel.Id);
                        const logoUrl = `${serverUrl}/Items/${channel.Id}/Images/Primary?tag=${channel.ImageTags?.Primary || ''}&maxWidth=80&api_key=${token}`;

                        return `
                            <div class="sh-epg-row">
                                <div class="sh-epg-channel-cell" data-channel-id="${channel.Id}">
                                    <img src="${logoUrl}" alt="${channel.Name}" style="max-height:28px; max-width:48px;" onerror="this.style.display='none'">
                                    <span class="sh-truncate" style="font-size:12px; font-weight:600;">${channel.Name}</span>
                                </div>
                                <div class="sh-epg-programs-track">
                                    ${channelProgs.map(p => {
                                        const pStart = new Date(p.StartDate);
                                        const pEnd = new Date(p.EndDate);
                                        const startMin = pStart.getHours() * 60 + pStart.getMinutes();
                                        const durationMin = Math.max(15, (pEnd - pStart) / (1000 * 60));
                                        const widthPx = durationMin * 3.5; // 3.5px par minute
                                        const leftPx = startMin * 3.5;

                                        return `
                                            <div class="sh-epg-program-block" data-id="${p.Id}" style="left:${leftPx}px; width:${widthPx}px;" title="${p.Name}">
                                                <div class="sh-truncate" style="font-size:12px; font-weight:700;">${p.Name}</div>
                                                <div style="font-size:10px; color:var(--sh-text-muted);">${this._formatTimeOnly(pStart)} - ${this._formatTimeOnly(pEnd)}</div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        this._bindEpgEvents(contentEl, programs);
    }

    _bindEpgEvents(contentEl, programs) {
        contentEl.querySelectorAll('.sh-epg-channel-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const ch = this._channelsCache.find(c => c.Id === cell.dataset.channelId);
                if (ch) window.SpaceHub?.player?.play(ch);
            });
        });

        contentEl.querySelectorAll('.sh-epg-program-block').forEach(block => {
            block.addEventListener('click', () => {
                const prog = programs.find(p => p.Id === block.dataset.id);
                if (prog) this._openProgramModal(prog);
            });
        });
    }

    _openProgramModal(program) {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        const modal = new Modal({
            id: `prog-${program.Id}`,
            title: program.Name,
            size: 'md',
            content: `
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; color:var(--sh-text-secondary); font-size:13px;">
                        <span>📅 ${new Date(program.StartDate).toLocaleDateString()}</span>
                        <span>⏱️ ${this._formatTimeOnly(new Date(program.StartDate))} - ${this._formatTimeOnly(new Date(program.EndDate))}</span>
                    </div>
                    ${program.Genres?.length ? `<div style="display:flex; gap:6px;">${program.Genres.map(g => `<span class="sh-badge" style="background:var(--sh-bg-surface-3);">${g}</span>`).join('')}</div>` : ''}
                    <p style="color:var(--sh-text-secondary); font-size:14px; line-height:1.6;">${program.Overview || 'Aucun résumé fourni pour ce programme.'}</p>
                </div>
            `,
            footer: `
                <button class="sh-btn sh-btn--ghost" data-action="close">Fermer</button>
                <button class="sh-btn sh-btn--primary" id="btn-record-program">🔴 Programmer l'enregistrement (DVR)</button>
            `
        });

        modal.open();
        modal._el.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.close());

        modal._el.querySelector('#btn-record-program')?.addEventListener('click', async () => {
            const ok = await this._service.scheduleRecording(program);
            if (ok) {
                window.SpaceHub?.ui?.components?.toaster?.success(`Enregistrement de "${program.Name}" programmé !`);
                modal.close();
            } else {
                window.SpaceHub?.ui?.components?.toaster?.error('Échec programmation enregistrement.');
            }
        });
    }

    async _renderDvrTab(contentEl) {
        contentEl.innerHTML = '<div style="text-align:center; padding:40px; color:var(--sh-text-muted);">Chargement du DVR...</div>';

        const [timers, recordings] = await Promise.all([
            this._service.getTimers(),
            this._service.getRecordings()
        ]);

        contentEl.innerHTML = `
            <div class="sh-dvr-container">
                <section style="margin-bottom:28px;">
                    <h3>⏰ Enregistrements Programmés (${timers.length})</h3>
                    <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
                        ${timers.length === 0 ? '<p style="color:var(--sh-text-muted); font-size:13px;">Aucun enregistrement programmé.</p>' : ''}
                        ${timers.map(t => `
                            <div class="sh-dvr-timer-card">
                                <div>
                                    <strong>${t.Name}</strong>
                                    <div style="font-size:12px; color:var(--sh-text-muted); margin-top:2px;">
                                        📅 ${new Date(t.StartDate).toLocaleString()}
                                    </div>
                                </div>
                                <button class="sh-btn sh-btn--ghost sh-btn--sm btn-cancel-timer" data-id="${t.Id}" style="color:#e74c3c;">Annuler</button>
                            </div>
                        `).join('')}
                    </div>
                </section>

                <section>
                    <h3>🎬 Enregistrements Terminés (${recordings.length})</h3>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px; margin-top:12px;">
                        ${recordings.length === 0 ? '<p style="color:var(--sh-text-muted); font-size:13px;">Aucun enregistrement terminé pour l\'instant.</p>' : ''}
                        ${recordings.map(r => `
                            <div class="sh-dvr-rec-card">
                                <h4 class="sh-truncate" style="margin:0 0 4px 0;">${r.Name}</h4>
                                <div style="font-size:11px; color:var(--sh-text-muted);">
                                    Enregistré le ${new Date(r.StartDate).toLocaleDateString()}
                                </div>
                                <button class="sh-btn sh-btn--primary sh-btn--sm btn-play-rec" data-id="${r.Id}" style="margin-top:12px;">▶ Regarder</button>
                            </div>
                        `).join('')}
                    </div>
                </section>
            </div>
        `;

        contentEl.querySelectorAll('.btn-cancel-timer').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this._service.cancelTimer(btn.dataset.id);
                window.SpaceHub?.ui?.components?.toaster?.info('Enregistrement annulé.');
                await this._renderDvrTab(contentEl);
            });
        });

        contentEl.querySelectorAll('.btn-play-rec').forEach(btn => {
            btn.addEventListener('click', () => {
                const rec = recordings.find(r => r.Id === btn.dataset.id);
                if (rec) window.SpaceHub?.player?.play(rec);
            });
        });
    }

    _getProgramProgress(program) {
        if (!program.StartDate || !program.EndDate) return 0;
        const start = new Date(program.StartDate).getTime();
        const end = new Date(program.EndDate).getTime();
        const now = Date.now();
        const total = end - start;
        const elapsed = now - start;
        return Math.max(0, Math.min(100, (elapsed / total) * 100));
    }

    _formatTimeOnly(date) {
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }

    _injectStyles() {
        if (document.getElementById('sh-livetv-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-livetv-styles';
        style.textContent = `
.sh-livetv-page { max-width: 1600px; margin: 0 auto; padding: var(--sh-space-6, 24px); }
.sh-livetv-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sh-space-6, 24px); border-bottom: 1px solid var(--sh-border-color); padding-bottom: var(--sh-space-4, 16px); }
.sh-livetv-tabs { display: flex; gap: 12px; margin-bottom: 24px; }
.sh-tv-tab { background: transparent; border: 1px solid var(--sh-border-color); color: var(--sh-text-secondary); padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.sh-tv-tab.active { background: var(--sh-color-primary, #7c6aff); color: #fff; border-color: var(--sh-color-primary, #7c6aff); }
.sh-livetv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.sh-channel-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); border-radius: 12px; display: flex; align-items: center; gap: 16px; padding: 16px; cursor: pointer; transition: transform 0.2s, border-color 0.2s; }
.sh-channel-card:hover { transform: translateY(-2px); border-color: var(--sh-color-primary); background: var(--sh-bg-surface-3); }
.sh-channel-card__logo { width: 50px; height: 50px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.sh-channel-card__logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
.sh-channel-card__info { flex: 1; min-width: 0; }
.sh-channel-card__name { margin: 0; font-size: 14px; font-weight: 700; }
.sh-channel-card__program { margin: 4px 0 6px 0; font-size: 12px; color: var(--sh-text-muted); }
.sh-channel-card__progress { height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; }
.sh-channel-card__bar { height: 100%; background: var(--sh-color-primary); }

/* EPG Grid Styles */
.sh-epg-container { border: 1px solid var(--sh-border-color); border-radius: 12px; overflow: auto; max-height: 700px; background: var(--sh-bg-surface-2); }
.sh-epg-timeline-header { display: flex; position: sticky; top: 0; z-index: 10; background: var(--sh-bg-surface-3); border-bottom: 1px solid var(--sh-border-color); }
.sh-epg-corner-cell { width: 160px; min-width: 160px; padding: 12px; font-weight: 700; font-size: 12px; border-right: 1px solid var(--sh-border-color); background: var(--sh-bg-surface-3); position: sticky; left: 0; z-index: 12; }
.sh-epg-hours-track { display: flex; }
.sh-epg-hour-slot { width: 210px; min-width: 210px; padding: 12px; font-size: 12px; font-weight: 600; color: var(--sh-text-secondary); border-right: 1px solid var(--sh-border-color); }
.sh-epg-grid-body { display: flex; flex-direction: column; }
.sh-epg-row { display: flex; border-bottom: 1px solid var(--sh-border-color); min-height: 60px; }
.sh-epg-channel-cell { width: 160px; min-width: 160px; padding: 10px; display: flex; align-items: center; gap: 8px; border-right: 1px solid var(--sh-border-color); background: var(--sh-bg-surface-2); position: sticky; left: 0; z-index: 5; cursor: pointer; }
.sh-epg-programs-track { position: relative; width: 5040px; min-height: 60px; }
.sh-epg-program-block { position: absolute; top: 4px; bottom: 4px; background: var(--sh-bg-surface-3); border: 1px solid var(--sh-border-color); border-radius: 6px; padding: 6px 10px; cursor: pointer; overflow: hidden; transition: background 0.2s; }
.sh-epg-program-block:hover { background: var(--sh-color-primary-hover, rgba(124,106,255,0.3)); border-color: var(--sh-color-primary); }

.sh-dvr-timer-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); padding: 14px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
.sh-dvr-rec-card { background: var(--sh-bg-surface-2); border: 1px solid var(--sh-border-color); padding: 16px; border-radius: 12px; }
        `;
        document.head.appendChild(style);
    }
}

export default LiveTvView;
