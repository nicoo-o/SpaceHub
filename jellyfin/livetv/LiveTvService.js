/**
 * SpaceHub — Live TV, EPG & DVR Service
 * Version: 1.0.0
 *
 * Gère l'accès aux chaînes de télévision en direct, au guide électronique
 * des programmes (EPG) et à la programmation d'enregistrements (DVR) Jellyfin.
 */

'use strict';

import Logger from '../../core/Logger.js';

class LiveTvService {
    constructor() {
        this._log = new Logger('LiveTvService');
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    get _apiClient() {
        return window.SpaceHub?.core?.api?.getClient('jellyfin');
    }

    /**
     * Récupère la liste des chaînes Live TV avec leur programme actuel.
     * @returns {Promise<Array<Object>>}
     */
    async getChannels() {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const userId = this._auth?.getUserId();
            const res = await fetch(`${serverUrl}/LiveTv/Channels?UserId=${userId}&Fields=CurrentProgram,PrimaryImageAspectRatio`, {
                headers: this._auth?.getAuthHeaders()
            });

            if (!res.ok) return [];

            const data = await res.json();
            return data.Items || [];
        } catch (err) {
            this._log.error('Erreur récupération chaînes Live TV:', err);
            return [];
        }
    }

    /**
     * Récupère les programmes EPG pour une période donnée.
     * @param {string[]} channelIds
     * @param {Date} startDate
     * @param {Date} endDate
     * @returns {Promise<Array<Object>>}
     */
    async getPrograms(channelIds = [], startDate = new Date(), endDate = new Date(Date.now() + 24 * 3600 * 1000)) {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const userId = this._auth?.getUserId();

            const params = new URLSearchParams({
                UserId: userId,
                MinStartDate: startDate.toISOString(),
                MaxEndDate: endDate.toISOString(),
                Fields: 'Overview,PrimaryImageAspectRatio,Genres',
                SortBy: 'StartDate',
                SortOrder: 'Ascending'
            });

            if (channelIds.length > 0) {
                params.append('ChannelIds', channelIds.join(','));
            }

            const res = await fetch(`${serverUrl}/LiveTv/Programs?${params.toString()}`, {
                headers: this._auth?.getAuthHeaders()
            });

            if (!res.ok) return [];

            const data = await res.json();
            return data.Items || [];
        } catch (err) {
            this._log.error('Erreur récupération EPG programmes:', err);
            return [];
        }
    }

    /**
     * Récupère la liste des enregistrements terminés.
     * @returns {Promise<Array<Object>>}
     */
    async getRecordings() {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const userId = this._auth?.getUserId();
            const res = await fetch(`${serverUrl}/LiveTv/Recordings?UserId=${userId}`, {
                headers: this._auth?.getAuthHeaders()
            });

            if (!res.ok) return [];
            const data = await res.json();
            return data.Items || [];
        } catch (err) {
            this._log.warn('Erreur récupération enregistrements:', err.message);
            return [];
        }
    }

    /**
     * Récupère la liste des enregistrements programmés (Timers).
     * @returns {Promise<Array<Object>>}
     */
    async getTimers() {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/LiveTv/Timers`, {
                headers: this._auth?.getAuthHeaders()
            });

            if (!res.ok) return [];
            const data = await res.json();
            return data.Items || [];
        } catch (err) {
            this._log.warn('Erreur récupération timers:', err.message);
            return [];
        }
    }

    /**
     * Programme l'enregistrement d'une émission.
     * @param {Object} program - Objet programme
     */
    async scheduleRecording(program) {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/LiveTv/Timers`, {
                method: 'POST',
                headers: {
                    ...this._auth?.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ProgramId: program.Id,
                    ChannelId: program.ChannelId,
                    StartDate: program.StartDate,
                    EndDate: program.EndDate,
                    Name: program.Name,
                    PrePaddingSeconds: 120, // 2 min avant
                    PostPaddingSeconds: 300 // 5 min après
                })
            });

            return res.ok;
        } catch (err) {
            this._log.error('Erreur programmation enregistrement:', err);
            return false;
        }
    }

    /**
     * Annule un enregistrement programmé.
     * @param {string} timerId
     */
    async cancelTimer(timerId) {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/LiveTv/Timers/${timerId}`, {
                method: 'DELETE',
                headers: this._auth?.getAuthHeaders()
            });

            return res.ok;
        } catch (err) {
            this._log.error('Erreur annulation timer:', err);
            return false;
        }
    }
}

export default LiveTvService;
