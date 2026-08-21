/**
 * SpaceHub — Jellyfin SyncPlay Manager & Watch Party
 * Version: 1.0.0
 *
 * Moteur de visionnage synchrone en groupe (SyncPlay).
 * Gère les salons, la synchronisation temporelle à la seconde près,
 * le chat en direct superposé et les réactions émojis flottantes.
 */

'use strict';

import Logger from '../../core/Logger.js';

class SyncPlayManager {
    constructor(eventBus) {
        this._log = new Logger('SyncPlayManager');
        this._eventBus = eventBus;
        this._currentGroup = null;
        this._isSyncing = false;
        this._pollInterval = null;
        this._chatMessages = [];
        this._injectStyles();
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    get _apiClient() {
        return window.SpaceHub?.core?.api?.getClient('jellyfin');
    }

    /**
     * Vérifie si un groupe SyncPlay est actuellement actif.
     */
    isInGroup() {
        return !!this._currentGroup;
    }

    /**
     * Récupère la liste des salons SyncPlay actifs sur le serveur.
     * @returns {Promise<Array<Object>>}
     */
    async getGroups() {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/SyncPlay/List`, {
                headers: this._auth?.getAuthHeaders()
            });
            if (!res.ok) return [];
            return await res.json();
        } catch (err) {
            this._log.warn('Erreur récupération salons SyncPlay:', err.message);
            return [];
        }
    }

    /**
     * Crée un nouveau salon SyncPlay pour regarder un média ensemble.
     * @param {string} groupName
     * @param {Object} item
     */
    async createGroup(groupName, item) {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const name = groupName || `Salon de ${this._auth?.getUser()?.Name || 'SpaceHub'}`;

            const res = await fetch(`${serverUrl}/SyncPlay/New`, {
                method: 'POST',
                headers: {
                    ...this._auth?.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ GroupName: name })
            });

            if (!res.ok) throw new Error('Impossible de créer le salon SyncPlay.');

            const group = await res.json();
            this._currentGroup = group;
            this._startSyncPolling();
            this._eventBus?.emit('syncplay:joined', group);

            // Charger le média dans le salon
            if (item) {
                await this.setPlaylistItem(item.Id);
            }

            this._log.info(`Salon SyncPlay créé : "${name}" (ID: ${group.GroupId})`);
            window.SpaceHub?.ui?.components?.toaster?.success(`Salon "${name}" créé !`);
            return group;
        } catch (err) {
            this._log.error('Erreur création groupe SyncPlay:', err);
            window.SpaceHub?.ui?.components?.toaster?.error(err.message);
            return null;
        }
    }

    /**
     * Rejoint un salon SyncPlay existant.
     * @param {string} groupId
     */
    async joinGroup(groupId) {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/SyncPlay/Join`, {
                method: 'POST',
                headers: {
                    ...this._auth?.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ GroupId: groupId })
            });

            if (!res.ok) throw new Error('Impossible de rejoindre ce salon.');

            this._currentGroup = { GroupId: groupId };
            this._startSyncPolling();
            this._eventBus?.emit('syncplay:joined', this._currentGroup);

            this._log.info(`Salon SyncPlay rejoint : ${groupId}`);
            window.SpaceHub?.ui?.components?.toaster?.success('Salon Watch Party rejoint !');
            return true;
        } catch (err) {
            this._log.error('Erreur adhésion SyncPlay:', err);
            window.SpaceHub?.ui?.components?.toaster?.error(err.message);
            return false;
        }
    }

    /**
     * Quitte le salon SyncPlay en cours.
     */
    async leaveGroup() {
        if (!this._currentGroup) return;
        try {
            const serverUrl = this._auth?.getServerUrl();
            await fetch(`${serverUrl}/SyncPlay/Leave`, {
                method: 'POST',
                headers: this._auth?.getAuthHeaders()
            });
        } catch {
            // ignore
        }

        this._stopSyncPolling();
        const oldGroup = this._currentGroup;
        this._currentGroup = null;
        this._eventBus?.emit('syncplay:left', oldGroup);
        this._log.info('Salon SyncPlay quitté.');
    }

    /**
     * Définit le média en cours de lecture pour le groupe.
     * @param {string} itemId
     */
    async setPlaylistItem(itemId) {
        if (!this._currentGroup) return;
        try {
            const serverUrl = this._auth?.getServerUrl();
            await fetch(`${serverUrl}/SyncPlay/SetPlaylistItem`, {
                method: 'POST',
                headers: {
                    ...this._auth?.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ItemIds: [itemId], StartIndex: 0 })
            });
        } catch (err) {
            this._log.warn('Erreur setPlaylistItem:', err);
        }
    }

    /**
     * Transmet l'action Play au salon.
     */
    async notifyPlay() {
        if (!this._currentGroup || this._isSyncing) return;
        try {
            const serverUrl = this._auth?.getServerUrl();
            await fetch(`${serverUrl}/SyncPlay/Unpause`, {
                method: 'POST',
                headers: this._auth?.getAuthHeaders()
            });
        } catch (err) {
            this._log.warn('Erreur SyncPlay Play:', err);
        }
    }

    /**
     * Transmet l'action Pause au salon.
     */
    async notifyPause() {
        if (!this._currentGroup || this._isSyncing) return;
        try {
            const serverUrl = this._auth?.getServerUrl();
            await fetch(`${serverUrl}/SyncPlay/Pause`, {
                method: 'POST',
                headers: this._auth?.getAuthHeaders()
            });
        } catch (err) {
            this._log.warn('Erreur SyncPlay Pause:', err);
        }
    }

    /**
     * Transmet un saut temporel (Seek) au salon.
     * @param {number} positionSeconds
     */
    async notifySeek(positionSeconds) {
        if (!this._currentGroup || this._isSyncing) return;
        try {
            const serverUrl = this._auth?.getServerUrl();
            const positionTicks = Math.round(positionSeconds * 10000000);
            await fetch(`${serverUrl}/SyncPlay/Seek`, {
                method: 'POST',
                headers: {
                    ...this._auth?.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ PositionTicks: positionTicks })
            });
        } catch (err) {
            this._log.warn('Erreur SyncPlay Seek:', err);
        }
    }

    /**
     * Envoie un message texte de chat dans le salon.
     * @param {string} message
     */
    sendChatMessage(message) {
        const text = (message || '').trim();
        if (!text) return;

        const msgObj = {
            id: `msg_${Date.now()}`,
            user: this._auth?.getUser()?.Name || 'Moi',
            text: text,
            timestamp: new Date().toLocaleTimeString().slice(0, 5)
        };

        this._chatMessages.push(msgObj);
        this._eventBus?.emit('syncplay:chat', msgObj);
    }

    /**
     * Envoie une réaction émoji flottante.
     * @param {string} emoji
     */
    triggerReaction(emoji) {
        this._eventBus?.emit('syncplay:reaction', emoji);
        this._spawnFloatingEmoji(emoji);
    }

    _spawnFloatingEmoji(emoji) {
        const container = document.getElementById('sh-syncplay-reactions-layer') || document.body;
        const el = document.createElement('div');
        el.className = 'sh-floating-emoji';
        el.textContent = emoji;
        el.style.left = `${Math.random() * 60 + 20}%`;
        container.appendChild(el);

        setTimeout(() => el.remove(), 2500);
    }

    _startSyncPolling() {
        this._stopSyncPolling();
        // Ping et synchronisation toutes les 2 secondes
        this._pollInterval = setInterval(async () => {
            if (!this._currentGroup) return;
            try {
                const serverUrl = this._auth?.getServerUrl();
                const res = await fetch(`${serverUrl}/SyncPlay/Ping`, {
                    method: 'POST',
                    headers: {
                        ...this._auth?.getAuthHeaders(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ Ping: 0 })
                });

                if (res.ok) {
                    const status = await res.json();
                    this._applyGroupState(status);
                }
            } catch {
                // ignore
            }
        }, 2500);
    }

    _stopSyncPolling() {
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
        }
    }

    _applyGroupState(status) {
        const player = window.SpaceHub?.player;
        if (!player || !player.videoElement) return;

        const video = player.videoElement;
        const targetSeconds = (status.PositionTicks || 0) / 10000000;
        const drift = Math.abs(video.currentTime - targetSeconds);

        this._isSyncing = true;

        // Corriger la dérive si supérieure à 0.8 seconde
        if (drift > 0.8) {
            video.currentTime = targetSeconds;
        }

        // Corriger l'état Play/Pause
        if (status.IsPaused && !video.paused) {
            video.pause();
        } else if (!status.IsPaused && video.paused) {
            video.play().catch(() => {});
        }

        setTimeout(() => {
            this._isSyncing = false;
        }, 300);
    }

    /**
     * Ouvre la modale de création / sélection de salon SyncPlay.
     * @param {Object} item - Média à regarder
     */
    async openSyncPlayModal(item) {
        const Modal = window.SpaceHub?.ui?.components?.Modal;
        if (!Modal) return;

        const groups = await this.getGroups();

        const modal = new Modal({
            id: 'syncplay-modal',
            title: `🍿 Regarder ensemble (SyncPlay) : ${item?.Name || ''}`,
            size: 'md',
            content: `
                <div class="sh-syncplay-modal-content">
                    <div style="margin-bottom:16px;">
                        <h4 style="margin-bottom:8px;">Créer un nouveau salon</h4>
                        <div style="display:flex; gap:8px;">
                            <input type="text" class="sh-input" id="syncplay-group-name" placeholder="Nom du salon (ex: Soirée Ciné)" value="Watch Party ${item?.Name || ''}" style="flex:1;"/>
                            <button class="sh-btn sh-btn--primary" id="btn-create-syncplay">Créer & Lancer</button>
                        </div>
                    </div>

                    <hr style="border:none; border-top:1px solid var(--sh-border-color); margin:16px 0;"/>

                    <h4 style="margin-bottom:8px;">Salons disponibles sur le serveur</h4>
                    <div id="syncplay-groups-list" style="max-height:200px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
                        ${groups.length === 0 ? '<p style="color:var(--sh-text-muted); font-size:13px;">Aucun salon actif pour le moment.</p>' : ''}
                        ${groups.map(g => `
                            <div class="sh-syncplay-group-row" data-id="${g.GroupId}" style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--sh-bg-surface-3); border-radius:8px;">
                                <div>
                                    <strong>${g.GroupName}</strong>
                                    <div style="font-size:11px; color:var(--sh-text-muted);">${g.Participants?.length || 1} participant(s)</div>
                                </div>
                                <button class="sh-btn sh-btn--ghost sh-btn--sm btn-join-group" data-id="${g.GroupId}">Rejoindre</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `
        });

        modal.open();

        modal._el.querySelector('#btn-create-syncplay')?.addEventListener('click', async () => {
            const name = modal._el.querySelector('#syncplay-group-name')?.value;
            modal.close();
            const group = await this.createGroup(name, item);
            if (group && item) {
                window.SpaceHub?.player?.play(item);
            }
        });

        modal._el.querySelectorAll('.btn-join-group').forEach(btn => {
            btn.addEventListener('click', async () => {
                const gId = btn.dataset.id;
                modal.close();
                await this.joinGroup(gId);
                if (item) window.SpaceHub?.player?.play(item);
            });
        });
    }

    _injectStyles() {
        if (document.getElementById('sh-syncplay-styles')) return;
        const style = document.createElement('style');
        style.id = 'sh-syncplay-styles';
        style.textContent = `
.sh-floating-emoji {
    position: fixed;
    bottom: 100px;
    font-size: 32px;
    pointer-events: none;
    z-index: 9999;
    animation: floatUp 2.5s ease-out forwards;
}

@keyframes floatUp {
    0% { transform: translateY(0) scale(0.6); opacity: 1; }
    50% { transform: translateY(-120px) scale(1.2); opacity: 0.9; }
    100% { transform: translateY(-260px) scale(1.5); opacity: 0; }
}

.sh-syncplay-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(124, 106, 255, 0.2);
    color: var(--sh-color-primary, #7c6aff);
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
}
        `;
        document.head.appendChild(style);
    }
}

export default SyncPlayManager;
