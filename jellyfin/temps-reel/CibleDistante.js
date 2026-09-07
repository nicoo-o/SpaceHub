/**
 * SpaceHub — devenir cible de télécommande (« cast »)
 *
 * LE SCÉNARIO. On ouvre Jellyfin sur son téléphone, on choisit « SpaceHub —
 * Salon » dans la liste des appareils, et le film démarre sur la télévision.
 * Plus de saisie de titre à la télécommande, plus de navigation à quatre
 * flèches : le téléphone sert de télécommande, la télévision lit.
 *
 * C'est l'inverse de `jellyfin/remote/RemoteControlService.js`, qui ENVOIE des
 * ordres à d'autres appareils. Ici on les REÇOIT.
 *
 * COMMENT LE SERVEUR SAIT QU'ON EXISTE
 * ------------------------------------
 * Deux conditions, et les deux sont nécessaires :
 *
 *   1. `POST /Sessions/Capabilities/Full` déclare `SupportsMediaControl` et la
 *      liste des commandes acceptées. Sans cette déclaration, la session
 *      n'apparaît PAS dans la liste des cibles du téléphone — et pire, un ordre
 *      envoyé quand même reçoit un `204 No Content` : le serveur accepte la
 *      requête et ne fait rien. C'est la confusion la plus rapportée sur ce
 *      sujet : « l'API répond 200, rien ne se passe ».
 *
 *   2. Un WebSocket ouvert. Les ordres n'arrivent QUE par là ; il n'existe pas
 *      de scrutation possible. C'est pourquoi ce module dépend de
 *      `SocketJellyfin` et ne fait rien sans lui.
 *
 * CE QU'ON DÉCLARE ET CE QU'ON NE DÉCLARE PAS. On n'annonce que les commandes
 * réellement implémentées ici. Déclarer `SetVolume` sans savoir régler le
 * volume donne un curseur qui ne fait rien sur le téléphone de l'utilisateur :
 * une promesse non tenue est pire qu'une absence.
 */

'use strict';

import Logger from '../../core/Logger.js';
import { ActionMedia } from '../../core/TelecommandeTv.js';

/**
 * Commandes générales acceptées. Chacune a une implémentation dans
 * `_executerCommande` — la liste et le code ne peuvent pas diverger, un test
 * le vérifie.
 */
export const COMMANDES = [
    'DisplayMessage',
    'GoHome',
    'GoToSearch',
    'Mute',
    'Unmute',
    'ToggleMute',
    'SetVolume',
    'VolumeUp',
    'VolumeDown',
    'ToggleFullscreen',
    'ToggleOsd',
    'Back',
    'SetAudioStreamIndex',
    'SetSubtitleStreamIndex',
];

/** Types de média que ce client sait lire. */
export const MEDIAS_LISIBLES = ['Video', 'Audio'];

/** Un tick Jellyfin vaut 100 ns : dix millions par seconde. */
const TICKS_PAR_SECONDE = 10_000_000;

export class CibleDistante {
    /**
     * @param {Object} options
     * @param {Object} options.socket    SocketJellyfin
     * @param {Object} options.api       client Jellyfin
     * @param {() => Object} options.lecteur   accès paresseux au VideoPlayer
     * @param {() => Object} [options.file]    accès paresseux à la file d'attente
     * @param {Object} [options.routeur]       Router, pour GoHome / GoToSearch
     * @param {Object} [options.toaster]
     */
    constructor({ socket, api, lecteur, file = null, routeur = null, toaster = null } = {}) {
        this._log = new Logger('CibleDistante');
        this._socket = socket || null;
        this._api = api || null;
        this._lecteur = lecteur || (() => null);
        this._file = file || (() => null);
        this._routeur = routeur;
        this._toaster = toaster;
        this._desabonnements = [];
        this._active = false;
    }

    get active() { return this._active; }

    /**
     * Déclare les capacités et se met à l'écoute.
     *
     * @returns {Promise<boolean>} vrai si la déclaration a été acceptée. Un
     *   échec n'est pas fatal : le reste de l'application fonctionne, seule la
     *   réception d'ordres est perdue — et il faut le dire, pas le taire.
     */
    async activer() {
        if (this._active) return true;
        if (!this._socket) {
            this._log.warn('Pas de canal temps réel : impossible de recevoir des ordres.');
            return false;
        }

        const declaree = await this._declarerCapacites();
        if (!declaree) return false;

        this._desabonnements = [
            this._socket.sur('Play', (data) => this._surPlay(data)),
            this._socket.sur('Playstate', (data) => this._surPlaystate(data)),
            this._socket.sur('GeneralCommand', (data) => this._surCommande(data)),
        ];
        this._active = true;
        this._log.info('SpaceHub est désormais une cible de lecture à distance.');
        return true;
    }

    /** Cesse d'écouter. Ne dé-déclare pas : la session disparaît d'elle-même. */
    desactiver() {
        for (const retirer of this._desabonnements) { try { retirer(); } catch { /* sans effet */ } }
        this._desabonnements = [];
        this._active = false;
    }

    // ─── Déclaration ────────────────────────────────────────────────────────

    async _declarerCapacites() {
        try {
            await this._api?.post?.('/Sessions/Capabilities/Full', {
                PlayableMediaTypes: MEDIAS_LISIBLES,
                SupportedCommands: COMMANDES,
                SupportsMediaControl: true,
                // Persistance de l'identifiant : le téléphone retrouve « Salon »
                // au lieu d'un nouvel appareil à chaque rechargement de page.
                SupportsPersistentIdentifier: true,
                SupportsSync: false,
            });
            return true;
        } catch (err) {
            this._log.warn('Déclaration des capacités refusée :', err?.message || err);
            return false;
        }
    }

    // ─── Ordres reçus ───────────────────────────────────────────────────────

    /**
     * `Play` — lance, met en file, ou ajoute à la fin.
     *
     * Le message ne porte que des IDENTIFIANTS : il faut aller chercher les
     * fiches. `StartIndex` désigne l'élément par lequel commencer dans la
     * liste envoyée — l'ignorer fait démarrer une série au premier épisode
     * alors que la personne en a choisi un autre.
     */
    async _surPlay(data) {
        const ids = Array.isArray(data?.ItemIds) ? data.ItemIds : [];
        if (!ids.length) return;

        const commande = data.PlayCommand || 'PlayNow';
        const depart = Number.isInteger(data.StartIndex) ? data.StartIndex : 0;
        const positionTicks = Number(data.StartPositionTicks) || 0;

        const fiches = await this._fiches(ids);
        if (!fiches.length) {
            this._log.warn('Ordre de lecture reçu pour des éléments introuvables.');
            return;
        }

        const file = this._file();
        if (commande === 'PlayNext' || commande === 'PlayLast') {
            // Pas de lecture : on complète la file en cours.
            const methode = commande === 'PlayNext' ? 'addNext' : 'addToEnd';
            // `addNext` insère juste après le titre courant : pour conserver
            // l'ordre reçu, on insère à l'envers.
            const aInserer = commande === 'PlayNext' ? [...fiches].reverse() : fiches;
            for (const fiche of aInserer) file?.[methode]?.(fiche);
            this._annoncer(`${fiches.length} titre(s) ajouté(s) à la file.`);
            return;
        }

        // PlayNow : on remplace la file et on lance à l'index demandé.
        const index = Math.min(Math.max(depart, 0), fiches.length - 1);
        file?.setQueue?.(fiches, index);
        this._lecteur()?.play?.(fiches[index], positionTicks);
    }

    /**
     * `Playstate` — pause, reprise, saut, piste suivante.
     *
     * `SeekPositionTicks` est en ticks de 100 ns. Le passer tel quel à
     * `currentTime` placerait la lecture dix millions de fois trop loin, ce qui
     * se manifeste par un saut immédiat en fin de fichier.
     */
    _surPlaystate(data) {
        const lecteur = this._lecteur();
        if (!lecteur) return;
        const commande = data?.Command;

        switch (commande) {
            case 'Stop':          lecteur.close?.(); break;
            case 'Pause':         lecteur._video?.pause?.(); break;
            case 'Unpause':       lecteur._video?.play?.()?.catch?.(() => {}); break;
            case 'PlayPause':     lecteur._togglePlayPause?.(); break;
            case 'NextTrack':     lecteur._executerActionMedia?.(ActionMedia.NEXT); break;
            case 'PreviousTrack': lecteur._executerActionMedia?.(ActionMedia.PREVIOUS); break;
            case 'Rewind':        lecteur._seekRelative?.(-30); break;
            case 'FastForward':   lecteur._seekRelative?.(+30); break;
            case 'Seek': {
                const ticks = Number(data?.SeekPositionTicks);
                if (!Number.isFinite(ticks) || !lecteur._video) break;
                lecteur._video.currentTime = ticks / TICKS_PAR_SECONDE;
                break;
            }
            default:
                this._log.info(`Commande de lecture ignorée : ${commande}`);
        }
    }

    /** `GeneralCommand` — tout le reste. */
    _surCommande(data) {
        const nom = data?.Name;
        if (!nom) return;
        if (!COMMANDES.includes(nom)) {
            // On n'a pas déclaré cette commande : la recevoir quand même n'est
            // pas une raison de faire semblant.
            this._log.info(`Commande non déclarée, ignorée : ${nom}`);
            return;
        }
        this._executerCommande(nom, data.Arguments || {});
    }

    _executerCommande(nom, args) {
        const lecteur = this._lecteur();
        const video = lecteur?._video || null;

        switch (nom) {
            case 'DisplayMessage':
                // Le seul usage réel : « votre film démarre sur le salon ».
                this._annoncer([args.Header, args.Text].filter(Boolean).join(' — ') || 'Message reçu.');
                break;
            case 'GoHome':      this._routeur?.navigate?.('/'); break;
            case 'GoToSearch':  this._routeur?.navigate?.('/recherche'); break;
            case 'Back':        lecteur?.close?.() ?? this._routeur?.back?.(); break;
            case 'ToggleFullscreen': lecteur?._toggleFullscreen?.(); break;
            case 'ToggleOsd':   lecteur?._showControls?.(); break;
            case 'Mute':        if (video) video.muted = true; break;
            case 'Unmute':      if (video) video.muted = false; break;
            case 'ToggleMute':  if (video) video.muted = !video.muted; break;
            case 'VolumeUp':    this._volume(+0.1); break;
            case 'VolumeDown':  this._volume(-0.1); break;
            case 'SetVolume': {
                // Le serveur envoie 0–100 ; l'élément vidéo attend 0–1.
                const v = Number(args.Volume);
                if (video && Number.isFinite(v)) video.volume = Math.min(1, Math.max(0, v / 100));
                break;
            }
            // Changer de piste impose de renégocier la source auprès du
            // serveur : sur un flux transcodé, la piste audio est CUITE dans le
            // flux, on ne peut pas en changer côté client.
            case 'SetAudioStreamIndex': {
                const i = Number(args.Index);
                if (Number.isFinite(i)) lecteur?._reloadCurrentSourceWithOptions?.({ audioStreamIndex: i });
                break;
            }
            case 'SetSubtitleStreamIndex': {
                const i = Number(args.Index);
                if (Number.isFinite(i)) lecteur?._reloadCurrentSourceWithOptions?.({ subtitleStreamIndex: i });
                break;
            }
        }
    }

    _volume(delta) {
        const video = this._lecteur()?._video;
        if (!video) return;
        video.volume = Math.min(1, Math.max(0, (video.volume || 0) + delta));
    }

    _annoncer(texte) {
        this._toaster?.show?.(texte, 'info');
    }

    /**
     * Récupère les fiches complètes des identifiants reçus, dans l'ordre demandé.
     *
     * Une requête unique plutôt qu'une par identifiant : un ordre « lire la
     * saison » porte vingt épisodes, soit vingt allers-retours sur une liaison
     * de téléviseur.
     */
    async _fiches(ids) {
        try {
            const params = new URLSearchParams({
                Ids: ids.join(','),
                Fields: 'MediaSources,Overview,SeriesName,SeasonId,IndexNumber,ParentIndexNumber,RunTimeTicks',
            });
            const rep = await this._api?.get?.(`/Items?${params}`);
            const items = Array.isArray(rep?.Items) ? rep.Items : [];
            // Le serveur ne garantit pas l'ordre : on le rétablit sur celui reçu.
            const parId = new Map(items.map(i => [i.Id, i]));
            return ids.map(id => parId.get(id)).filter(Boolean);
        } catch (err) {
            this._log.warn('Fiches introuvables pour l\'ordre reçu :', err?.message || err);
            return [];
        }
    }
}

export default CibleDistante;
