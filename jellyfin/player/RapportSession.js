/**
 * Rapport de session Jellyfin & session média système — extrait de
 * VideoPlayer.js (peau 6).
 * ===========================================================================
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Le cycle de vie d'une session de lecture a deux faces qui se tiennent :
 * le rapport au serveur Jellyfin (départ, progression toutes les 10 s,
 * arrêt) et la description du titre auprès du système d'exploitation
 * (écran verrouillé, notification, boutons média). C'est la peau 6 de la
 * décomposition (docs/DECOMPOSITION_VIDEOPLAYER.md) — le dernier bloc qui
 * ne touche ni le DOM du shell ni le réseau de chargement de source.
 *
 * CE QUI RESTE SUR LE LECTEUR
 * ---------------------------
 * Tout l'état de session (`_playSessionId`, `_mediaSourceId`, `_playMethod`,
 * `_playbackStartTicks` — écrits par la négociation PlaybackInfo et relus
 * par les diagnostics et les vignettes), la vidéo, l'item courant, l'auth,
 * l'API et l'instance `SessionMedia`. Le module ne les lit qu'à travers des
 * accesseurs injectés : il ne peut ni lire ni écrire un champ du lecteur.
 *
 * CE QUI VIT ICI
 * --------------
 * Les appels réseau (`/Sessions/Playing`, `/Playing/Progress`,
 * `/Playing/Stopped`), la construction du corps JSON, le câblage des boutons
 * média système — et l'intervalle de progression : l'objet rendu est son
 * SEUL détenteur, `nettoyer()` est appelé à la fermeture du lecteur.
 *
 * Le comportement reproduit à l'identique la version d'origine :
 *   - la progression n'est envoyée que si la vidéo joue ;
 *   - les gardes (`serverUrl`, `itemId`) sont les mêmes, dans le même ordre ;
 *   - l'échec du rapport de départ est journalisé en debug, les autres
 *     échecs sont silencieux (le serveur peut être éteint en cours de route) ;
 *   - `seekto` préfère `fastSeek` quand le système le demande, puis republie
 *     la position.
 */

import { ActionMedia } from '../../core/TelecommandeTv.js';

const INTERVALLE_PROGRES_MS = 10000;
const TICKS_PAR_SECONDE = 10000000;

/**
 * Crée le rapport de session câblé sur UNE instance de lecteur.
 *
 * @param {object} injections
 * @param {() => HTMLVideoElement|null} injections.obtenirVideo
 * @param {() => object|null} injections.obtenirItem         item courant
 * @param {() => object|null} injections.obtenirAuth         auth Jellyfin
 * @param {() => object|null} injections.obtenirApi          api (vignettes)
 * @param {() => object} injections.obtenirSessionMedia      instance SessionMedia
 * @param {() => { mediaSourceId: ?string, playSessionId: string, playMethod: string, playbackStartTicks: ?number }} injections.lireEtatSession
 * @param {(action: string) => void} injections.executerActionMedia  boutons média
 * @param {(delta: number) => void} injections.seekRelative         télécommande
 * @param {() => object} injections.journal                  Logger du lecteur
 * @param {(url: string, options: object) => Promise} injections.fetchAvecDelai
 * @param {typeof setInterval} [injections.setIntervalFn]    horloge injectable
 * @param {typeof clearInterval} [injections.clearIntervalFn] horloge injectable
 * @returns {{ publierPosition(): void, brancher(item: object): void,
 *            rapporterDebut(): void, demarrerProgres(): void,
 *            rapporterArret(): void, nettoyer(): void }}
 */
export function creerRapportSession(injections) {
    const {
        obtenirVideo,
        obtenirItem,
        obtenirAuth,
        obtenirApi,
        obtenirSessionMedia,
        lireEtatSession,
        executerActionMedia,
        seekRelative,
        journal,
        fetchAvecDelai,
        setIntervalFn = setInterval,
        clearIntervalFn = clearInterval,
    } = injections;

    let progresInterval = null;

    const api = {
        /**
         * Publie la position courante auprès du système. Ne fait rien tant
         * que la durée n'est pas connue : `SessionMedia` efface alors l'état
         * plutôt que d'annoncer une durée nulle — un direct n'a pas de barre
         * de progression, et en afficher une vide serait un mensonge.
         */
        publierPosition() {
            const video = obtenirVideo();
            if (!video) return;
            obtenirSessionMedia().position({
                duree: video.duration,
                position: video.currentTime,
                vitesse: video.playbackRate,
            });
        },

        /**
         * Décrit le titre en cours au système et pose les boutons de la
         * notification. Toutes les actions retombent sur
         * `executerActionMedia` : le casque Bluetooth et la télécommande du
         * téléviseur empruntent le même chemin, il n'y a donc qu'un seul
         * comportement à vérifier.
         *
         * @param {object} item  le média lancé.
         */
        brancher(item) {
            const sessionMedia = obtenirSessionMedia();
            if (!sessionMedia.supporte) return;

            const titre = item?.Name || item?.title || 'Lecture';
            // Un épisode se lit « Série — S1E4 » : sur l'écran verrouillé, le
            // seul nom d'épisode ne dit pas de quelle série il s'agit.
            const saison = item?.ParentIndexNumber;
            const episode = item?.IndexNumber;
            let sousTitre = item?.SeriesName || '';
            if (sousTitre && Number.isFinite(saison) && Number.isFinite(episode)) {
                sousTitre += ` — S${saison}E${episode}`;
            }
            if (!sousTitre && item?.ProductionYear) sousTitre = String(item.ProductionYear);

            const id = item?.SeriesId || item?.Id || item?.id;
            const vignette = id ? (obtenirApi()?.getImageUrl?.(id, 'Primary') || '') : '';

            sessionMedia.decrire({ titre, sousTitre, vignette });

            sessionMedia.brancher({
                play: () => executerActionMedia(ActionMedia.PLAY),
                pause: () => executerActionMedia(ActionMedia.PAUSE),
                stop: () => executerActionMedia(ActionMedia.STOP),
                previoustrack: () => executerActionMedia(ActionMedia.PREVIOUS),
                nexttrack: () => executerActionMedia(ActionMedia.NEXT),
                // `seekOffset` est optionnel : sans lui, la convention du Web
                // est dix secondes, pas les trente de la télécommande.
                seekbackward: (d) => seekRelative(-(d?.seekOffset || 10)),
                seekforward: (d) => seekRelative(d?.seekOffset || 10),
                seekto: (d) => {
                    const video = obtenirVideo();
                    if (!video || !Number.isFinite(d?.seekTime)) return;
                    // `fastSeek` existe pour le glissement continu de la barre
                    // système : il évite un décodage complet à chaque position.
                    if (d.fastSeek && typeof video.fastSeek === 'function') {
                        video.fastSeek(d.seekTime);
                    } else {
                        video.currentTime = d.seekTime;
                    }
                    api.publierPosition();
                },
            });
        },

        /** Annonce au serveur le début de la lecture. */
        rapporterDebut() {
            const item = obtenirItem();
            const itemId = item?.Id || item?.id;
            const auth = obtenirAuth();
            const serverUrl = auth?.getServerUrl();
            if (!serverUrl || !itemId) return;

            const { mediaSourceId, playSessionId, playMethod, playbackStartTicks } = lireEtatSession();
            const video = obtenirVideo();

            fetchAvecDelai(`${serverUrl}/Sessions/Playing`, {
                method: 'POST',
                headers: auth?.getAuthHeaders(),
                body: JSON.stringify({
                    ItemId: itemId,
                    MediaSourceId: mediaSourceId || itemId,
                    PlaySessionId: playSessionId || undefined,
                    PlayMethod: playMethod || 'DirectStream',
                    PositionTicks: playbackStartTicks || Math.round((video?.currentTime || 0) * TICKS_PAR_SECONDE),
                }),
            }).catch((e) => journal()?.debug('Report play start failed:', e));
        },

        /** Lance la progression périodique (toutes les 10 s, vidéo non en pause). */
        demarrerProgres() {
            if (progresInterval) clearIntervalFn(progresInterval);
            progresInterval = setIntervalFn(() => {
                const video = obtenirVideo();
                if (!video || video.paused) return;

                const item = obtenirItem();
                const itemId = item?.Id || item?.id;
                const auth = obtenirAuth();
                const serverUrl = auth?.getServerUrl();
                if (!serverUrl || !itemId) return;

                const { mediaSourceId, playSessionId, playMethod } = lireEtatSession();
                const ticks = Math.round((video.currentTime || 0) * TICKS_PAR_SECONDE);

                fetchAvecDelai(`${serverUrl}/Sessions/Playing/Progress`, {
                    method: 'POST',
                    headers: auth?.getAuthHeaders(),
                    body: JSON.stringify({
                        ItemId: itemId,
                        MediaSourceId: mediaSourceId || itemId,
                        PlaySessionId: playSessionId || undefined,
                        PlayMethod: playMethod || 'DirectStream',
                        PositionTicks: ticks,
                        IsPaused: video.paused,
                    }),
                }).catch(() => {});
            }, INTERVALLE_PROGRES_MS);
        },

        /** Annonce au serveur la fin de la lecture. */
        rapporterArret() {
            const item = obtenirItem();
            const itemId = item?.Id || item?.id;
            const auth = obtenirAuth();
            const serverUrl = auth?.getServerUrl();
            const video = obtenirVideo();
            if (!serverUrl || !itemId || !video) return;

            const { mediaSourceId, playSessionId, playMethod } = lireEtatSession();
            const ticks = Math.round((video.currentTime || 0) * TICKS_PAR_SECONDE);

            fetchAvecDelai(`${serverUrl}/Sessions/Playing/Stopped`, {
                method: 'POST',
                headers: auth?.getAuthHeaders(),
                body: JSON.stringify({
                    ItemId: itemId,
                    MediaSourceId: mediaSourceId || itemId,
                    PlaySessionId: playSessionId || undefined,
                    PlayMethod: playMethod || 'DirectStream',
                    PositionTicks: ticks,
                }),
            }).catch(() => {});
        },

        /** Coupe la progression : appelé à la fermeture du lecteur. */
        nettoyer() {
            if (progresInterval) {
                clearIntervalFn(progresInterval);
                progresInterval = null;
            }
        },
    };

    return api;
}