/**
 * SpaceHub — Lecture à distance (« cast »)
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'audit relevait que les points d'entrée `/Sessions/{id}/Playing` et
 * `/Sessions/{id}/Command` existent côté Jellyfin mais qu'aucune interface ne
 * s'en servait : impossible d'envoyer un film depuis son téléphone vers la
 * télévision du salon, alors que le serveur sait déjà le faire.
 *
 * Ce que ce service fait : lister les autres appareils connectés au même serveur
 * et leur envoyer des ordres. Il ne diffuse rien lui-même — c'est Jellyfin qui
 * relaie l'ordre à l'appareil cible, lequel lit le média par ses propres moyens.
 * C'est la différence avec Chromecast : ici, aucun flux ne transite par le
 * navigateur qui commande.
 *
 * Deux limites assumées et vérifiables :
 *   - un appareil n'apparaît que s'il est connecté ET qu'il déclare savoir
 *     recevoir des ordres (`SupportsRemoteControl`). Une liste vide veut donc
 *     dire « aucune cible », pas « erreur » ;
 *   - la session de CE navigateur est toujours retirée de la liste : se
 *     commander soi-même à distance n'a pas de sens et embrouille l'interface.
 */

'use strict';

import Logger from '../../core/Logger.js';

class RemoteControlService {
    /**
     * @param {Object} options
     * @param {Object} options.api          client Jellyfin (core/ApiClient)
     * @param {Object} options.auth         AuthManager, pour l'identifiant d'appareil
     * @param {Object} [options.eventBus]
     */
    constructor({ api, auth, eventBus = null } = {}) {
        this._log = new Logger('RemoteControl');
        this._api = api || null;
        this._auth = auth || null;
        this._eventBus = eventBus;
        this._cache = { at: 0, sessions: [] };
    }

    /**
     * Appareils pouvant recevoir un ordre de lecture.
     *
     * @param {Object} [options]
     * @param {boolean} [options.force] ignorer le cache de 5 s
     * @returns {Promise<Array<{Id: string, Nom: string, Client: string, EnLecture: ?string}>>}
     */
    async listTargets({ force = false } = {}) {
        const maintenant = Date.now();
        if (!force && maintenant - this._cache.at < 5000) return this._cache.sessions;

        const monAppareil = this._auth?.getDeviceId?.() || '';
        try {
            const sessions = await this._api?.get?.('jellyfin', '/Sessions');
            const cibles = (Array.isArray(sessions) ? sessions : [])
                .filter(s => s?.SupportsRemoteControl === true)
                .filter(s => s?.DeviceId !== monAppareil)
                .map(s => ({
                    Id: s.Id,
                    Nom: s.DeviceName || s.Client || 'Appareil',
                    Client: s.Client || '',
                    EnLecture: s.NowPlayingItem?.Name || null,
                }));
            this._cache = { at: maintenant, sessions: cibles };
            return cibles;
        } catch (err) {
            this._log.warn('Liste des appareils indisponible :', err?.message || err);
            // Un échec n'est pas une absence : on ne met pas en cache, pour que
            // la prochaine tentative reparte à zéro.
            return [];
        }
    }

    /**
     * Lance un média sur un autre appareil.
     *
     * @param {string} sessionId  identifiant de session cible (listTargets)
     * @param {string|string[]} itemIds  un ou plusieurs identifiants Jellyfin
     * @param {Object} [options]
     * @param {number} [options.startPositionTicks]
     */
    async playOn(sessionId, itemIds, { startPositionTicks = 0 } = {}) {
        if (!sessionId || !itemIds) throw new Error('Session ou média manquant.');
        const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
        const params = new URLSearchParams({
            PlayCommand: 'PlayNow',
            ItemIds: ids.join(','),
        });
        if (startPositionTicks > 0) params.set('StartPositionTicks', String(startPositionTicks));

        await this._api.post('jellyfin', `/Sessions/${encodeURIComponent(sessionId)}/Playing?${params}`, null);
        this._log.info(`Lecture envoyée à la session ${sessionId} (${ids.length} élément(s)).`);
        this._eventBus?.emit('remote:play-sent', { sessionId, itemIds: ids });
    }

    /**
     * Empile un média dans la file de l'appareil distant au lieu de couper ce
     * qu'il est en train de lire.
     */
    async queueOn(sessionId, itemIds) {
        const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
        const params = new URLSearchParams({ PlayCommand: 'PlayNext', ItemIds: ids.join(',') });
        await this._api.post('jellyfin', `/Sessions/${encodeURIComponent(sessionId)}/Playing?${params}`, null);
        this._eventBus?.emit('remote:queue-sent', { sessionId, itemIds: ids });
    }

    /**
     * Commande de transport : PlayPause, Stop, NextTrack, PreviousTrack…
     * (noms définis par l'API Jellyfin, transmis tels quels).
     */
    async command(sessionId, commande) {
        if (!sessionId || !commande) return;
        await this._api.post('jellyfin', `/Sessions/${encodeURIComponent(sessionId)}/Playing/${encodeURIComponent(commande)}`, null);
    }

    /** Affiche un message sur l'appareil distant — utile pour vérifier la cible. */
    async message(sessionId, texte, { titre = 'SpaceHub', duree = 4000 } = {}) {
        await this._api.post('jellyfin', `/Sessions/${encodeURIComponent(sessionId)}/Message`, {
            Header: titre,
            Text: texte,
            TimeoutMs: duree,
        });
    }
}

export default RemoteControlService;
