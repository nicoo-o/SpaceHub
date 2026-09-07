/**
 * SpaceHub — Radio d'artiste (« InstantMix »)
 *
 * Un bouton, et le serveur compose une file d'attente à partir d'un morceau,
 * d'un album, d'un artiste ou d'un genre. C'est côté serveur que tout se passe :
 * `GET /Items/{id}/InstantMix`. Quelques lignes ici, effet immédiat.
 *
 * `UserId` EST OBLIGATOIRE. Sans lui, le serveur répond une liste vide sans
 * erreur — pas de 400, pas de message : juste `{ Items: [] }`. Le bouton semble
 * alors « ne rien faire », et rien dans une console ne l'explique. C'est le
 * seul vrai piège de ce point d'entrée, et il est silencieux.
 *
 * On demande `MediaSources` dès la composition : sans ce champ, chaque titre
 * de la file exigerait une requête supplémentaire au moment de sa lecture — 
 * soit, sur une file de cinquante morceaux, cinquante allers-retours sur une
 * liaison de téléviseur.
 */

'use strict';

import Logger from '../../core/Logger.js';

/** Au-delà, la file devient ingérable à la télécommande. */
export const LIMITE_DEFAUT = 50;

const CHAMPS = 'MediaSources,PrimaryImageAspectRatio,Overview,Artists,AlbumArtist,AlbumId,RunTimeTicks';

export class RadioArtiste {
    /**
     * @param {Object} options
     * @param {Object} options.api   client Jellyfin
     * @param {Object} options.auth  AuthManager, pour l'identifiant d'utilisateur
     */
    constructor({ api, auth } = {}) {
        this._log = new Logger('RadioArtiste');
        this._api = api || null;
        this._auth = auth || null;
    }

    /**
     * Compose une file à partir d'un élément musical.
     *
     * @param {object|string} depart  la fiche de départ, ou son identifiant.
     * @param {{limite?: number}} [options]
     * @returns {Promise<{ok: boolean, titres: object[], raison?: string}>}
     */
    async composer(depart, { limite = LIMITE_DEFAUT } = {}) {
        const id = typeof depart === 'string' ? depart : (depart?.Id || depart?.id);
        if (!id) return { ok: false, titres: [], raison: 'Aucun point de départ.' };

        const userId = this._auth?.getUser?.()?.Id || this._auth?.getUserId?.() || '';
        if (!userId) {
            // On le dit plutôt que d'envoyer une requête dont on sait qu'elle
            // reviendra vide.
            return { ok: false, titres: [], raison: 'Aucune session utilisateur.' };
        }

        try {
            const params = new URLSearchParams({
                UserId: userId,
                Limit: String(Math.max(1, limite)),
                Fields: CHAMPS,
            });
            const rep = await this._api?.get?.(`/Items/${encodeURIComponent(id)}/InstantMix?${params}`);
            const titres = Array.isArray(rep?.Items) ? rep.Items : [];
            if (!titres.length) {
                // Une radio vide n'est pas une panne : une médiathèque de trois
                // morceaux ne permet pas d'en composer une.
                return { ok: false, titres: [], raison: 'Pas assez de musique proche pour composer une radio.' };
            }
            this._log.info(`Radio composée : ${titres.length} titre(s).`);
            return { ok: true, titres };
        } catch (err) {
            return { ok: false, titres: [], raison: err?.message || 'Serveur injoignable.' };
        }
    }
}

export default RadioArtiste;
