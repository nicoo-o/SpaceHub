/**
 * SpaceHub — Live TV View
 * Version: 1.0.0
 *
 * Affiche la télévision en direct et le guide des programmes (Jellyfin).
 */

'use strict';

import Logger from '../../../core/Logger.js';

class LiveTvView {
    constructor() {
        this._log = new Logger('LiveTvView');
    }

    async render(container) {
        container.innerHTML = `
            <div class="sh-view sh-livetv-view">
                <header class="sh-view__header">
                    <h2 class="sh-view__title">📺 Télévision en direct</h2>
                    <p class="sh-view__subtitle">Chaînes et programmes en cours</p>
                </header>
                <div class="sh-livetv-grid" id="sh-livetv-grid">
                    <div class="sh-loader">Chargement des chaînes...</div>
                </div>
            </div>
        `;

        this._loadChannels();
    }

    async _loadChannels() {
        const grid = document.getElementById('sh-livetv-grid');
        const jellyfin = window.SpaceHub?.core?.api?.getClient('jellyfin');

        if (!jellyfin) {
            grid.innerHTML = '<div class="sh-no-data">Client Jellyfin indisponible.</div>';
            return;
        }

        try {
            // Récupérer les chaînes Live TV
            const data = await jellyfin.get('/LiveTv/Channels?Fields=CurrentProgram');
            const channels = data?.Items || [];

            if (channels.length === 0) {
                grid.innerHTML = '<div class="sh-no-data">Aucune chaîne configurée sur Jellyfin.</div>';
                return;
            }

            grid.innerHTML = channels.map(channel => {
                const program = channel.CurrentProgram;
                return `
                    <div class="sh-channel-card" data-id="${channel.Id}">
                        <div class="sh-channel-card__logo">
                            <img src="${jellyfin.getImageUrl(channel.Id, 'Primary', { maxWidth: 120 })}" alt="${channel.Name}">
                        </div>
                        <div class="sh-channel-card__info">
                            <h4 class="sh-channel-card__name">${channel.Name}</h4>
                            ${program ? `
                                <p class="sh-channel-card__program sh-truncate">${program.Name}</p>
                                <div class="sh-channel-card__progress">
                                    <div class="sh-channel-card__bar" style="width: ${this._getProgramProgress(program)}%"></div>
                                </div>
                            ` : '<p class="sh-channel-card__program">Aucune information</p>'}
                        </div>
                    </div>
                `;
            }).join('');

            grid.querySelectorAll('.sh-channel-card').forEach(card => {
                card.addEventListener('click', () => {
                    const id = card.dataset.id;
                    const channel = channels.find(c => c.Id === id);
                    window.SpaceHub?.player?.play(channel);
                });
            });

        } catch (err) {
            this._log.error('Erreur chargement Live TV:', err);
            grid.innerHTML = '<div class="sh-no-data">Erreur de connexion Live TV.</div>';
        }
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

    _injectStyles() {
        if (document.getElementById('sh-livetv-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-livetv-styles';
        style.textContent = `
.sh-livetv-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
    padding: 24px;
}

.sh-channel-card {
    background: var(--sh-bg-surface-2);
    border: 1px solid var(--sh-border-color);
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    cursor: pointer;
    transition: transform 0.2s, border-color 0.2s;
}

.sh-channel-card:hover {
    transform: translateY(-2px);
    border-color: var(--sh-color-primary);
    background: var(--sh-bg-surface-3);
}

.sh-channel-card__logo {
    width: 60px;
    height: 60px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.sh-channel-card__logo img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}

.sh-channel-card__info {
    flex: 1;
    overflow: hidden;
}

.sh-channel-card__name {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
}

.sh-channel-card__program {
    margin: 4px 0 8px 0;
    font-size: 13px;
    color: var(--sh-text-muted);
}

.sh-channel-card__progress {
    height: 3px;
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
    overflow: hidden;
}

.sh-channel-card__bar {
    height: 100%;
    background: var(--sh-color-primary);
}
        `;
        document.head.appendChild(style);
    }
}

export default LiveTvView;
