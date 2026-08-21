/**
 * SpaceHub — Live Stream & Session Monitor (Admin Suite)
 * Version: 1.0.0
 *
 * Surveillance en temps réel de tous les flux et utilisateurs connectés à Jellyfin.
 * Analyse les méthodes de lecture (Direct Play vs Transcodage), codecs, débit (Mbps),
 * accélération matérielle GPU (NVENC/VAAPI/QSV) et permet d'interrompre ou d'alerter.
 */

'use strict';

import Logger from '../../core/Logger.js';

class LiveStreamMonitor {
    constructor() {
        this._log = new Logger('LiveStreamMonitor');
    }

    get _auth() {
        return window.SpaceHub?.auth;
    }

    /**
     * Récupère toutes les sessions actives sur le serveur Jellyfin.
     * @returns {Promise<Array<Object>>}
     */
    async getActiveSessions() {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/Sessions?ActiveWithinSeconds=960`, {
                headers: this._auth?.getAuthHeaders()
            });

            if (!res.ok) return [];

            const sessions = await res.json();
            return sessions.map(session => this._formatSession(session));
        } catch (err) {
            this._log.warn('Erreur récupération sessions actives:', err.message);
            return [];
        }
    }

    _formatSession(s) {
        const item = s.NowPlayingItem;
        const transInfo = s.TranscodingInfo;
        const playState = s.PlayState || {};

        let playMethod = 'Inactif';
        if (item) {
            if (transInfo) {
                playMethod = transInfo.IsVideoDirect && transInfo.IsAudioDirect ? 'Direct Stream' : 'Transcodage';
            } else if (playState.PlayMethod === 'DirectStream') {
                playMethod = 'Direct Stream';
            } else {
                playMethod = 'Direct Play';
            }
        }

        return {
            id: s.Id,
            userName: s.UserName || 'Anonyme',
            userId: s.UserId,
            client: s.Client || s.DeviceName,
            deviceName: s.DeviceName,
            deviceType: s.DeviceType || 'Inconnu',
            appVersion: s.ApplicationVersion || '',
            remoteEndPoint: s.RemoteEndPoint || 'Local',
            isPlaying: !!item && !playState.IsPaused,
            isPaused: !!playState.IsPaused,
            positionTicks: playState.PositionTicks || 0,
            positionSeconds: (playState.PositionTicks || 0) / 10000000,
            item: item ? {
                id: item.Id,
                name: item.Name,
                type: item.Type,
                seriesName: item.SeriesName,
                seasonNumber: item.ParentIndexNumber,
                episodeNumber: item.IndexNumber,
                runTimeTicks: item.RunTimeTicks || 0,
                durationSeconds: (item.RunTimeTicks || 0) / 10000000,
                imageTag: item.ImageTags?.Primary
            } : null,
            playMethod: playMethod,
            transcoding: transInfo ? {
                videoCodec: transInfo.VideoCodec,
                audioCodec: transInfo.AudioCodec,
                container: transInfo.Container,
                bitrate: transInfo.Bitrate,
                framerate: transInfo.Framerate,
                completionPercentage: transInfo.CompletionPercentage,
                transcodeReasons: transInfo.TranscodeReasons || [],
                hardwareAccelerationType: transInfo.HardwareAccelerationType || 'Software'
            } : null
        };
    }

    /**
     * Envoie un message popup sur l'écran d'un utilisateur en cours de lecture.
     * @param {string} sessionId
     * @param {string} text
     * @param {string} [header='Message de l\'administrateur']
     * @param {number} [timeoutMs=6000]
     */
    async sendMessage(sessionId, text, header = 'Message de l\'administrateur SpaceHub', timeoutMs = 6000) {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/Sessions/${sessionId}/Message`, {
                method: 'POST',
                headers: {
                    ...this._auth?.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    Header: header,
                    Text: text,
                    TimeoutMs: timeoutMs
                })
            });
            return res.ok;
        } catch (err) {
            this._log.error(`Erreur envoi message session ${sessionId}:`, err);
            return false;
        }
    }

    /**
     * Interrompt la lecture d'une session distante (Kill Stream).
     * @param {string} sessionId
     */
    async stopSession(sessionId) {
        try {
            const serverUrl = this._auth?.getServerUrl();
            const res = await fetch(`${serverUrl}/Sessions/${sessionId}/Playing/Stop`, {
                method: 'POST',
                headers: this._auth?.getAuthHeaders()
            });
            return res.ok;
        } catch (err) {
            this._log.error(`Erreur arrêt session ${sessionId}:`, err);
            return false;
        }
    }
}

export default LiveStreamMonitor;
