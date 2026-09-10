/**
 * SpaceHub — Grand Cinema Video Player (Apple TV 4K & VisionOS Ultra-Sleek)
 * Version: 4.0.0 (Liquid Ribbon Masterpiece)
 *
 * Conception Ultra-Aérodynamique & Épurée :
 *  - Dock Ultra-Fin 52px : Capsule liquide unique fusionnant timeline ambrée, transport perlé et tiroirs
 *  - Top Bar Apple TV 4K : En-tête tout-en-un à gauche (Retour + LED ambrée + Titre + Badges 4K/Atmos)
 *  - Tiroirs Latéraux en Verre (Glass Drawers) : Audio/Atmos, Sous-titres + Sync Live, Réglages, Épisodes
 *  - Icônes SF Pro Haute Définition : Dessin vectoriel sur-mesure pour chaque fonction
 *  - Z-Index Absolu (2147483647) : Élimination absolue de tout élément parasite Jellyfin
 *  - Moteur HLS adaptatif et playback reporting Jellyfin
 */

'use strict';

import { gabaritLecteur } from './VideoPlayer.template.js';
import { contexteGabarit, comportementDefilement } from '../../core/utils/domUtils.js';
import { negotiatePlayback } from './DeviceProfile.js';
import Logger from '../../core/Logger.js';

import './VideoPlayer.css';
import * as svc from '../../core/services.js';
import inputRouter, { PRIORITES } from '../../core/InputRouter.js';
import { actionMedia, ActionMedia } from '../../core/TelecommandeTv.js';
import Trickplay from './Trickplay.js';
import VerrouEcran from '../../core/VerrouEcran.js';
import SessionMedia from '../../core/SessionMedia.js';
import * as sousTitres from './ApparenceSousTitres.js';
import { fetchAvecDelai } from '../../core/utils/reseau.js';
import * as segmentsMedia from './SegmentsMedia.js';
import * as utilitairesLecteur from './UtilitairesLecteur.js';
import * as visibiliteControles from './VisibiliteControles.js';
class VideoPlayer {
    constructor() {
        this._log = new Logger('VideoPlayer');
        this._el = null;
        this._video = null;
        this._hls = null;
        this._currentItem = null;
        this._sourceMediaItem = null;
        /**
         * Segments médias typés du titre en cours (Jellyfin 10.10+).
         * `null` tant qu'on n'a pas interrogé le serveur, tableau ensuite —
         * éventuellement vide. La distinction compte : elle évite de
         * réinterroger un serveur qui a déjà répondu « aucun segment ».
         * @type {Array<{type: string, debut: number, fin: number}>|null}
         */
        this._segmentsMedia = null;
        this._segmentsPourItem = null;
        /** Versions disponibles du média en cours (greffon Merge Versions). */
        this._versions = [];
        this._transcodeReasons = [];
        this._minuteurStats = null;
        /** Empêche la veille pendant la lecture (repris sur visibilitychange). */
        this._verrouEcran = new VerrouEcran();
        /** Fiche système : notification Android, écran verrouillé iOS, casque. */
        this._sessionMedia = new SessionMedia();
        /** Dernière seconde publiée au système ; évite un appel par frame. */
        this._secondePubliee = -1;
        /** Vignettes de prévisualisation de la barre de progression. */
        this._trickplay = new Trickplay({
            serveur: () => this._auth?.getServerUrl?.() || '',
            jeton: () => this._auth?.getToken?.() || '',
        });
        /** Intervalle d'introduction résolu une fois, relu à chaque `timeupdate`. */
        this._intervalleIntro = undefined;
        /** Segment sous le curseur de lecture, posé par `_onTimeUpdate`. */
        this._segmentCourant = null;
        this._mediaObjectUrl = null;
        this._closeTimer = null;
        this._playGeneration = 0;
        // Renseignes par la negociation PlaybackInfo (jellyfin/player/DeviceProfile.js).
        this._playSessionId = '';
        this._mediaSourceId = null;
        this._playMethod = 'DirectStream';
        this._navHoldLastTick = 0;
        this._playbackOptions = {};
        this._progressInterval = null;
        this._isScrubbing = false;
        this._navHoldAction = null;
        this._navHoldStart = 0;

        // Préférences utilisateur
        this._volume = parseFloat(localStorage.getItem('SpaceHub_player_volume') ?? '1.0');
        this._playbackRate = parseFloat(localStorage.getItem('SpaceHub_playback_speed') ?? '1.0');
        this._subOffset = 0.0;
        this._appliedSubOffset = 0.0;
        this._selectedAudioIndex = null;
        this._selectedSubIndex = -1;
        this._aspectRatioIndex = 0;
        this._aspectRatios = ['contain', 'cover', 'fill'];
        
        // Séries & Épisodes
        this._seasonEpisodes = [];
        this._nextEpisode = null;
        this._prevEpisode = null;
        this._nextEpCountdownInterval = null;
        this._nextEpRemaining = 5;
        this._nextEpCancelled = false;

        // Tiroir Latéral
        this._activeDrawerTab = 'audio';
        this._isDrawerOpen = false;

        // Visibilité des contrôles & OSD flash (peau 5 — module satellite).
        // Les minuteurs et le drapeau de visibilité vivent dans le module ;
        // le lecteur ne garde que le DOM et le tiroir, passés en injections.
        this._visibilite = visibiliteControles.creerVisibiliteControles({
            obtenirEl: () => this._el,
            obtenirVideo: () => this._video,
            estTiroirOuvert: () => this._isDrawerOpen,
        });
        this._seekHoldStart = 0;
        this._seekHoldCount = 0;
        this._focusedHudEl = null;

        // Détection gestuelle
        this._lastTapTime = 0;
        this._lastTapSide = null;

        this._injectStyles();
    }

    get _auth() {
        return svc.auth();
    }

    get _api() {
        return svc.jellyfinApi();
    }

    /**
     * Plafond de débit à annoncer au serveur, en bits par seconde.
     *
     * Trois cas :
     *   - un plafond explicite est réglé → on le respecte ;
     *   - le mode automatique est actif et le navigateur expose une estimation
     *     de débit descendant → on plafonne un peu en dessous, pour laisser de
     *     la marge au reste du réseau ;
     *   - sinon 0 : aucun plafond, le serveur reste libre de faire du DirectPlay.
     *
     * `navigator.connection` n'existe pas partout (absent sur Safari et sur
     * plusieurs navigateurs de téléviseurs) : l'absence renvoie simplement 0,
     * c'est-à-dire le comportement d'avant ce réglage.
     */
    /**
     * Ajoute le jeton d'authentification à une URL de flux — et seulement quand
     * il n'y a aucun autre moyen.
     *
     * Un élément <video> natif ne peut pas porter d'en-tête : pour une lecture
     * directe (DirectPlay) ou pour le HLS natif de Safari, le paramètre `api_key`
     * est le mécanisme officiel de Jellyfin, et c'est aussi ce que fait le client
     * web officiel. Le chemin HLS.js, lui, envoie un en-tête `Authorization` et
     * n'expose donc rien dans les URLs — c'est le cas le plus fréquent.
     *
     * À noter honnêtement : l'API Jellyfin **n'offre pas** de jeton de lecture à
     * durée de vie courte distinct du jeton de session (les clés de `/Auth/Keys`
     * sont permanentes et réservées aux administrateurs). Le remède théorique
     * — faire passer le flux par un service worker qui ajoute l'en-tête — a été
     * écarté : router une vidéo de plusieurs gigaoctets avec requêtes Range à
     * travers un service worker met en jeu la lecture elle-même pour un gain
     * marginal sur un serveur personnel. Le jeton reste donc visible dans les
     * journaux d'accès du serveur pour ces deux cas précis.
     */
    _authoriseUrl(url, token) {
        if (!token) return url;
        // Le serveur peut déjà avoir renvoyé une URL authentifiée : ne pas doubler.
        if (/[?&]api_key=/.test(url)) return url;
        return `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(token)}`;
    }

    _resolveMaxBitrate() {
        const explicite = Number(this._settings?.get?.('player.maxBitrate', 0)) || 0;
        if (explicite > 0) return explicite;
        if (this._settings?.get?.('player.maxBitrateAuto', true) !== true) return 0;
        try {
            const lien = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            const mbps = Number(lien?.downlink);
            if (!Number.isFinite(mbps) || mbps <= 0) return 0;
            // 75 % du débit annoncé : au-delà, la moindre variation vide le tampon.
            const plafond = Math.round(mbps * 0.75 * 1000000);
            // En dessous de 2 Mb/s on ne plafonne pas : mieux vaut laisser le
            // serveur choisir que d'imposer une qualité inregardable.
            return plafond >= 2000000 ? plafond : 0;
        } catch {
            return 0;
        }
    }

    async play(item, startPositionTicks = 0, options = {}) {
        if (startPositionTicks && typeof startPositionTicks === 'object') {
            options = startPositionTicks;
            startPositionTicks = options.startPositionTicks ?? 0;
        }
        if (this._closeTimer) {
            clearTimeout(this._closeTimer);
            this._closeTimer = null;
        }
        this._playGeneration += 1;
        this._playbackOptions = options || {};
        this._el?.classList.remove('sh-player--exiting');
        setTimeout(() => {
            const playPause = this._el?.querySelector('#sh-btn-play-pause');
            if (playPause) playPause.focus();
        }, 150);
        if (!item) return;

        // Garde-fou du mode enfant. Placé ici, au seul point d'entrée de la
        // lecture, plutôt que dispersé dans chaque bouton : un titre bloqué
        // reste bloqué qu'il vienne d'une affiche, de la file d'attente ou de
        // l'enchaînement automatique d'épisodes.
        const parental = svc.parental();
        if (parental?.isEnabled?.() && !parental.isAllowed(item)) {
            this._log.info(`Lecture refusée par le mode enfant : ${item.Name}`);
            svc.toaster()?.show?.(
                `« ${item.Name} » est verrouillé. ${parental.reason(item) || ''}`, 'error');
            this.close?.();
            return;
        }

        // Si une Série entière est envoyée directement au player, résolution automatique de l'épisode
        if (item.Type === 'Series') {
            this._resolveAndPlaySeries(item);
            return;
        }

        this._currentItem = item;
        this._nextEpCancelled = false;
        this._sourceMediaItem = item;
        // Le titre change : tout ce qui était résolu pour le précédent est faux.
        this._segmentsMedia = null;
        this._segmentsPourItem = null;
        this._intervalleIntro = undefined;
        // Sans cette remise à zéro, le bouton du titre précédent resterait
        // actionnable au début du suivant, et sauterait à une position qui
        // n'a plus de sens.
        this._segmentCourant = null;
        this._trickplay.reinitialiser();
        this._chargerSegmentsMedia(item?.Id || item?.id);
        this._brancherSessionMedia(item);
        // C3 — Apparence des sous-titres. Appliquée à chaque ouverture plutôt
        // qu'une fois au démarrage : les réglages peuvent avoir changé entre
        // deux lectures, et une feuille posée une seule fois figerait le
        // premier état pour toute la session.
        sousTitres.appliquer(svc.settings());
        this._basculerModeMusique(item);

        // Recale la file sur ce qui est réellement lancé. Si l'élément vient
        // d'ailleurs (clic sur une affiche), la file devient hors sujet et
        // s'efface d'elle-même — sinon la lecture repartirait, en fin de média,
        // sur un titre sans rapport avec ce que la personne vient de choisir.
        (this._queue || svc.queue())?.syncTo?.(item);
        clearInterval(this._nextEpCountdownInterval);
        this._nextEpCountdownInterval = null;
        this._nextEpRemaining = 8;
        const itemId = item.Id || item.id;
        this._log.info(`🎬 Lancement Grand Cinema Ultra-Sleek pour "${item.Name || item.title}" (ID: ${itemId})`);

        const isAlreadyOpen = Boolean(this._el && document.body.contains(this._el) && this._video);

        if (isAlreadyOpen) {
            // Transition in-place fluide sans écran noir ni destruction du DOM
            this._updatePlayerMetadataInPlace(item);
            this._initMediaStreams(item);
        } else {
            // Premier montage DOM
            this._createPlayerDOM(item);
            this._initMediaStreams(item);
        }

        // Le DOM du lecteur existe à partir d'ici : c'est le premier moment où
        // le bouton « bande-annonce suivante » peut être montré ou caché.
        this._updateTrailerNavButton();

        const serverUrl = this._auth?.getServerUrl() || '';
        const token = this._auth?.getToken() || '';
        const numericStartTicks = Number(startPositionTicks || item.UserData?.PlaybackPositionTicks || 0);
        const startPositionSeconds = Number.isFinite(numericStartTicks) && numericStartTicks > 0
            ? numericStartTicks / 10000000
            : 0;
        this._playbackStartTicks = Math.round(startPositionSeconds * 10000000);

        const audioIndex = options.audioStreamIndex ?? options.AudioStreamIndex;
        const subtitleIndex = options.subtitleStreamIndex ?? options.SubtitleStreamIndex;
        const deviceId = this._auth?.getDeviceId?.() || 'sh_web';
        const maxBitrate = this._resolveMaxBitrate();

        // COPIE HORS-LIGNE D'ABORD.
        // Placé avant la négociation : si le média est sur l'appareil, il n'y a
        // aucune raison de demander quoi que ce soit au serveur — et cela doit
        // marcher précisément quand le serveur est injoignable. `estUtilisable`
        // écarte les copies expirées, la vérification ne se limite donc pas à
        // « le fichier est là ».
        const magasinHorsLigne = svc.offlineStore();
        if (magasinHorsLigne) {
            try {
                const urlLocale = await magasinHorsLigne.urlObjet(itemId);
                if (urlLocale) {
                    this._log.info(`Lecture depuis la copie hors-ligne de « ${item.Name} ».`);
                    this._urlHorsLigne = urlLocale;   // révoquée à la fermeture
                    this._playMethod = 'DirectPlay';
                    this._playSessionId = '';
                    this._mediaSourceId = itemId;
                    this._setupVideoSource(urlLocale, startPositionSeconds, '', this._playGeneration, false)
                        .catch(err => this._log.warn('Source locale :', err?.message || err));
                    this._resetIdleTimer();
                    // Aucun rapport de session : le serveur n'est peut-être pas
                    // joignable, et annoncer une lecture qu'il ne peut pas suivre
                    // laisserait une session fantôme dans son tableau de bord.
                    return;
                }
            } catch (err) {
                this._log.warn('Copie hors-ligne illisible, retour au serveur :', err);
            }
        }

        // NÉGOCIATION AVEC LE SERVEUR (remplace l'attaque directe de master.m3u8).
        // Sans elle, on demandait explicitement le point d'entrée HLS : le serveur
        // partait en remux ou transcodage même quand le fichier était lisible tel
        // quel. Ici, le serveur choisit le meilleur mode qu'il peut d'après les
        // capacités réellement mesurées sur cet appareil.
        const generation = this._playGeneration;
        const nego = await negotiatePlayback({
            serverUrl, token,
            userId: this._auth?.getUserId?.() || this._auth?.getUser?.()?.Id,
            deviceId, itemId,
            startPositionTicks: this._playbackStartTicks,
            maxBitrate,
            audioStreamIndex: Number.isInteger(Number(audioIndex)) ? Number(audioIndex) : null,
            subtitleStreamIndex: Number.isInteger(Number(subtitleIndex)) ? Number(subtitleIndex) : null,
            videoEl: this._video,
            // Version choisie par l'utilisateur, quand il en a choisi une.
            mediaSourceId: this._playbackOptions?.mediaSourceId || null,
        }).catch(() => null);

        if (generation !== this._playGeneration) return; // lecture annulée entre-temps

        let streamUrl;
        if (nego?.url) {
            streamUrl = nego.url;
            this._playSessionId = nego.playSessionId || '';
            this._mediaSourceId = nego.mediaSourceId || itemId;
            this._playMethod = nego.playMethod;
            if (nego.transcodeReasons?.length) {
                this._log.info(`Transcodage demandé par le serveur : ${nego.transcodeReasons.join(', ')}`);
            }
            this._transcodeReasons = nego.transcodeReasons || [];
            this._versions = nego.versions || [];
            // La source réellement lue est connue : les vignettes en dépendent.
            this._preparerVignettes(this._currentItem || item);
        } else {
            // Repli : ancien comportement, si le serveur ne répond pas à PlaybackInfo.
            const fallbackParams = new URLSearchParams({
                DeviceId: deviceId,
                MediaSourceId: itemId,
                VideoCodec: 'h264,hevc,vp9,av1',
                AudioCodec: 'aac,mp3,opus,flac',
                RequireAvc: 'false',
                Tag: item.Etag || '',
                StartTimeTicks: String(Math.round(startPositionSeconds * 10000000)),
            });
            if (Number.isInteger(Number(audioIndex)) && Number(audioIndex) >= 0) fallbackParams.set('AudioStreamIndex', String(audioIndex));
            if (Number.isInteger(Number(subtitleIndex)) && Number(subtitleIndex) >= -1) fallbackParams.set('SubtitleStreamIndex', String(subtitleIndex));
            streamUrl = `${serverUrl}/Videos/${encodeURIComponent(itemId)}/master.m3u8?${fallbackParams}`;
            this._playSessionId = '';
            this._mediaSourceId = itemId;
            this._playMethod = 'Transcode';
            this._log.warn('PlaybackInfo indisponible — repli sur le flux HLS générique.');
        }

        // Volontairement non attendu : la suite de `play()` prépare l'interface,
        // elle n'a pas besoin que le flux soit branché. Mais un rejet sans `catch`
        // remonterait à la frontière d'erreur globale et afficherait une alerte.
        this._setupVideoSource(streamUrl, startPositionSeconds, token, this._playGeneration, nego?.isHls)
            .catch(err => this._log.warn('Branchement de la source :', err?.message || err));
        this._reportPlaybackStart();
        this._startProgressReporting();
        this._resetIdleTimer();

        // Enrichissement asynchrone
        this._enrichMediaData(item, itemId);
    }

    _updatePlayerMetadataInPlace(item) {
        const title = item.Name || item.title || 'Média';
        const isEpisode = item.Type === 'Episode' || Boolean(item.SeriesName);
        const seriesName = item.SeriesName || (isEpisode ? title : '');
        const episodeNumber = isEpisode ? `S${String(item.ParentIndexNumber || 1).padStart(2, '0')}E${String(item.IndexNumber || 1).padStart(2, '0')}` : '';
        const episodeTitle = isEpisode ? (item.Name || title) : '';
        const year = item.ProductionYear || '';

        const mainTitleEl = this._el?.querySelector('#sh-player-main-title');
        const subTitleEl = this._el?.querySelector('#sh-player-sub-title');
        const yearTagEl = this._el?.querySelector('#sh-player-year-tag');

        if (mainTitleEl) mainTitleEl.textContent = seriesName || title;
        if (subTitleEl) subTitleEl.textContent = isEpisode && episodeNumber ? `${episodeNumber} · ${episodeTitle}` : episodeTitle;
        if (yearTagEl) yearTagEl.textContent = year ? String(year) : '';

        // Masquer la carte de fin d'épisode
        this._hideNextEpCard();
        this._closeAllPopovers();

        // Réinitialiser la barre de progression
        const elPlayed = this._el?.querySelector('#sh-timeline-played');
        const elHandle = this._el?.querySelector('#sh-timeline-handle');
        if (elPlayed) elPlayed.style.width = '0%';
        if (elHandle) elHandle.style.left = '0%';
    }

    async _enrichMediaData(item, itemId) {
        if (this._api && itemId) {
            try {
                const fetched = await this._api.getItem(itemId);
                if (fetched && this._currentItem && (this._currentItem.Id === itemId || this._currentItem.id === itemId)) {
                    this._currentItem = { ...item, ...fetched };
                    this._initMediaStreams(this._currentItem);
                    this._renderDrawerContent();
                }
            } catch (e) {
                this._log.debug('Enrichissement différé:', e);
            }
        }
        this._prepareSeasonEpisodes(this._currentItem || item);
    }

    /**
     * Branche la source sur l'élément vidéo.
     *
     * POURQUOI CETTE FONCTION EST DEVENUE ASYNCHRONE. `hls.js` pèse 185 ko une
     * fois compressé — plus, à lui seul, que tout le reste de l'application
     * réuni. Il était importé statiquement en tête de ce fichier, donc analysé
     * et compilé AVANT le premier écran, pour une bibliothèque qui ne sert
     * qu'au moment où une lecture HLS commence. Sur un téléviseur de 2020, ce
     * n'est pas le téléchargement qui coûte, c'est la compilation.
     *
     * `vite.config.js` isolait déjà `hls.js` dans son propre paquet en le
     * décrivant comme « lazy, uniquement si lecture HLS » : l'intention était
     * écrite, l'import statique la contredisait.
     */
    async _setupVideoSource(streamUrl, startPositionSeconds, token, generation = this._playGeneration, isHls = true) {
        const spinner = this._el?.querySelector('#sh-player-buffering-spinner');
        if (spinner) spinner.classList.add('visible');

        // En lecture directe, le serveur renvoie un fichier progressif : passer par
        // HLS.js dans ce cas casserait la lecture. On ne l'utilise que si la source
        // negociee est bien un flux HLS.
        if (!isHls) {
            // Audit 2.6 — le token n'est ajouté à l'URL QUE si le serveur ne l'a
            // pas déjà mis dans l'URL négociée, et seulement ici : un élément
            // <video> natif ne peut pas porter d'en-tête d'authentification, il
            // n'existe pas d'alternative côté navigateur pour une lecture directe.
            // Le chemin HLS, lui, passe par un en-tête (voir xhrSetup plus bas).
            this._video.src = this._authoriseUrl(streamUrl, token);
            this._video.currentTime = startPositionSeconds;
            this._video.playbackRate = this._playbackRate;
            this._video.volume = this._volume;
            this._video.play().catch(e => this._log.warn('Auto-play direct empeche:', e));
            return;
        }

        // PRÉ-CONTRÔLE SANS RIEN TÉLÉCHARGER. `Hls.isSupported()` teste la
        // présence des Media Source Extensions. Sur iOS et iPadOS, elles
        // n'existent pas : hls.js répondrait `false`, et on aurait téléchargé
        // 185 ko pour poser une question dont la réponse était connue. On la
        // pose donc avant, sur `window`.
        const supporteMse = typeof window !== 'undefined'
            && (typeof window.MediaSource !== 'undefined'
                || typeof window.ManagedMediaSource !== 'undefined');

        let Hls = null;
        if (supporteMse) {
            try {
                ({ default: Hls } = await import('hls.js'));
            } catch (err) {
                // Réseau coupé pendant le chargement du module : on n'a plus de
                // lecteur HLS, mais le flux direct reste jouable.
                this._log.warn('hls.js indisponible :', err?.message || err);
            }
            // LE PIÈGE DE L'ATTENTE. Entre la demande du module et son arrivée,
            // la personne a pu fermer le lecteur ou lancer un autre titre. Sans
            // cette relecture de la génération, on brancherait le film précédent
            // sur le lecteur courant.
            if (generation !== this._playGeneration || !this._video) return;
        }

        if (Hls?.isSupported()) {
            if (this._hls) this._hls.destroy();
            this._hls = new Hls({
                capLevelToPlayerSize: true,
                autoStartLoad: true,

                // ── PLAFONNEMENT DU TAMPON ───────────────────────────────
                //
                // `backBufferLength` vaut `Infinity` par défaut : hls.js garde
                // en mémoire TOUT ce qui a déjà été lu, du début du film à la
                // position courante. Sur un PC avec 16 Go, cela ne se voit
                // pas. Sur un téléviseur de 2020 — dont le système entier
                // dispose d'environ 500 Mo — c'est la première cause de
                // plantage en lecture longue.
                //
                // Le symptôme est caractéristique et correspond exactement à
                // ce qui est rapporté sur Tizen : le flux démarre bien, puis
                // se dégrade progressivement au fil des minutes, jusqu'à
                // saccader ou s'arrêter. Ce n'est pas le réseau, c'est la
                // mémoire qui se remplit.
                //
                // 30 secondes derrière la position suffisent largement à un
                // retour arrière court sans re-téléchargement. Au-delà, on
                // paie de la mémoire pour un confort que personne n'utilise.
                backBufferLength: 30,
                // Devant : 30 s de marge, 60 s au maximum quand le réseau est
                // bon. Le défaut (30/600) autorise dix minutes d'avance, ce
                // qui est absurde sur un appareil contraint.
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                // Plafond dur en octets — le seul qui protège vraiment quand
                // le débit est élevé (un flux 4K remplit 60 s bien plus vite
                // qu'un 1080p).
                maxBufferSize: 60 * 1000 * 1000,

                xhrSetup: (xhr) => {
                    if (token) xhr.setRequestHeader('Authorization', `MediaBrowser Token="${token}"`);
                }
            });

            this._hls.loadSource(streamUrl);
            this._hls.attachMedia(this._video);

            this._hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (generation !== this._playGeneration || !this._video) return;
                this._video.currentTime = startPositionSeconds;
                this._video.playbackRate = this._playbackRate;
                this._video.volume = this._volume;
                this._video.play().catch(e => this._log.warn('Auto-play empêché:', e));
            });

            this._hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal && generation === this._playGeneration) {
                    this._log.warn('Bascule sur flux direct:', data);
                    this._fallbackDirectStream(startPositionSeconds, token, generation);
                }
            });
        } else if (this._video.canPlayType('application/vnd.apple.mpegurl')) {
            // Les éléments <video> natifs ne permettent pas d'ajouter un header d'authentification.
            // Safari nécessite donc le mécanisme officiel api_key de Jellyfin pour les segments.
            // Le token reste en sessionStorage et n'est jamais persisté dans les réglages.
            const nativeUrl = this._authoriseUrl(streamUrl, token);
            this._video.src = nativeUrl;
            this._video.addEventListener('loadedmetadata', () => {
                if (generation !== this._playGeneration || !this._video) return;
                this._video.currentTime = startPositionSeconds;
                this._video.playbackRate = this._playbackRate;
                this._video.volume = this._volume;
                this._video.play().catch(e => this._log.warn('Auto-play Safari:', e));
            }, { once: true });
        } else {
            this._fallbackDirectStream(startPositionSeconds, token, generation);
        }
    }

    _fallbackDirectStream(startPositionSeconds, token, generation = this._playGeneration) {
        if (generation !== this._playGeneration || !this._video) return;
        const serverUrl = this._auth?.getServerUrl() || '';
        const itemId = this._currentItem?.Id || this._currentItem?.id;
        if (!serverUrl || !itemId) return;
        // Le flux natif ne peut pas recevoir de header : api_key est le seul fallback
        // compatible avec Safari lorsque Jellyfin n'a pas de cookie de session exploitable.
        this._video.src = this._authoriseUrl(
            `${serverUrl}/Videos/${encodeURIComponent(itemId)}/stream?static=true`, token);
        this._video.currentTime = startPositionSeconds;
        this._video.playbackRate = this._playbackRate;
        this._video.volume = this._volume;
        this._video.play().catch(e => this._log.warn('Auto-play direct:', e));
    }

    _initMediaStreams(item) {
        const streams = item.MediaStreams || [];
        this._audioStreams = streams.filter(s => s.Type === 'Audio');
        this._subStreams = streams.filter(s => s.Type === 'Subtitle');

        const defaultAudio = this._audioStreams.find(s => s.IsDefault) || this._audioStreams[0];
        this._selectedAudioIndex = defaultAudio ? defaultAudio.Index : (this._audioStreams[0]?.Index ?? 0);

        const defaultSub = this._subStreams.find(s => s.IsForced || s.IsDefault);
        this._selectedSubIndex = defaultSub ? defaultSub.Index : -1;
    }

    async _prepareSeasonEpisodes(item) {
        this._seasonEpisodes = [];
        this._nextEpisode = null;
        this._prevEpisode = null;

        const isEpisode = item.Type === 'Episode' || item.SeriesName;
        if (isEpisode && item.SeriesId && this._api) {
            try {
                const episodes = await this._api.getEpisodes(item.SeriesId, item.SeasonId);
                if (Array.isArray(episodes) && episodes.length > 0) {
                    this._seasonEpisodes = episodes;
                    const currentIndex = episodes.findIndex(e => e.Id === item.Id || (e.IndexNumber === item.IndexNumber && e.ParentIndexNumber === item.ParentIndexNumber));
                    if (currentIndex !== -1) {
                        if (currentIndex + 1 < episodes.length) this._nextEpisode = episodes[currentIndex + 1];
                        if (currentIndex - 1 >= 0) this._prevEpisode = episodes[currentIndex - 1];
                    }
                    this._updateEpisodeNavButtons();
                    this._renderDrawerContent();
                }
            } catch (err) {
                this._log.debug('Chargement épisodes différé:', err);
            }
        }
    }

    /**
     * Montre « bande-annonce suivante » quand il y a réellement une suite.
     *
     * Deux conditions, et les deux comptent : le lecteur joue une
     * bande-annonce (`isTrailer`, posé par TrailerService), et le service en a
     * résolu plusieurs. Un bouton « suivante » qui rejoue la même chose est
     * pire que pas de bouton du tout.
     */
    _updateTrailerNavButton() {
        const btn = this._el?.querySelector('#sh-btn-next-trailer');
        if (!btn) return;
        const trailers = svc.trailers();
        const visible = Boolean(this._playbackOptions?.isTrailer) && (trailers?.nombreDeSources || 0) > 1;
        btn.style.display = visible ? 'inline-flex' : 'none';
    }

    _updateEpisodeNavButtons() {
        this._updateTrailerNavButton();
        const prevBtn = this._el?.querySelector('#sh-btn-prev-ep');
        const nextBtn = this._el?.querySelector('#sh-btn-next-ep');
        const drawerEpBtn = this._el?.querySelector('#sh-btn-open-episodes');
        const tabEpBtn = this._el?.querySelector('#sh-drawer-tab-episodes-btn');

        if (this._seasonEpisodes.length > 0) {
            if (drawerEpBtn) drawerEpBtn.style.display = 'inline-flex';
            if (tabEpBtn) tabEpBtn.style.display = 'inline-flex';
            if (prevBtn) {
                prevBtn.style.display = 'inline-flex';
                prevBtn.disabled = !this._prevEpisode;
                prevBtn.style.opacity = this._prevEpisode ? '1' : '0.35';
            }
            if (nextBtn) {
                nextBtn.style.display = 'inline-flex';
                nextBtn.disabled = !this._nextEpisode;
                nextBtn.style.opacity = this._nextEpisode ? '1' : '0.35';
            }
        } else {
            // Pas d'épisodes autour, mais une file d'attente peut quand même
            // fournir un précédent et un suivant : un film empilé après un autre
            // doit être atteignable par les mêmes boutons.
            const file = this._queue || svc.queue();
            const avant = file?.peekPrevious?.() || null;
            const apres = file?.peekNext?.() || null;

            if (drawerEpBtn) drawerEpBtn.style.display = 'none';
            if (tabEpBtn) tabEpBtn.style.display = 'none';
            if (prevBtn) {
                prevBtn.style.display = avant ? 'inline-flex' : 'none';
                prevBtn.disabled = !avant;
                prevBtn.style.opacity = avant ? '1' : '0.35';
                prevBtn.title = avant ? `Précédent : ${avant.Name || ''}` : 'Précédent';
            }
            if (nextBtn) {
                nextBtn.style.display = apres ? 'inline-flex' : 'none';
                nextBtn.disabled = !apres;
                nextBtn.style.opacity = apres ? '1' : '0.35';
                nextBtn.title = apres ? `Suivant : ${apres.Name || ''}` : 'Suivant';
            }
        }
    }

    _createPlayerDOM(item) {
        this.close(false);
        document.body.classList.add('sh-cinema-active');

        const title = item.Name || item.title || 'Média';
        const isEpisode = item.Type === 'Episode' || item.SeriesName;
        const seriesName = item.SeriesName || (isEpisode ? title : '');
        const episodeNumber = isEpisode ? `S${String(item.ParentIndexNumber || 1).padStart(2, '0')}E${String(item.IndexNumber || 1).padStart(2, '0')}` : '';
        const episodeTitle = isEpisode ? (item.Name || title) : '';
        const year = item.ProductionYear || '';

        this._el = document.createElement('div');
        this._el.id = 'sh-grand-cinema-player';
        this._el.className = 'sh-grand-cinema-player sh-player--entering';
        // Confinement RÉEL du focus.
        //
        // Le moteur sait piéger le focus dans un sous-arbre depuis la vague A
        // (`data-nav-container="strict"` : on cherche dedans, on ne sort
        // jamais), et cet attribut n'était posé NULLE PART — quatre-vingts
        // lignes de moteur qui ne s'exécutaient jamais. Chaque couche rusait
        // donc à sa façon, et aucune ne confinait vraiment : c'est la deuxième
        // des classes de bogues de focus décrites par Netflix, « quelque chose
        // derrière la vue du dessus vole le focus ».
        this._el.dataset.navContainer = 'strict';

        this._el.innerHTML = gabaritLecteur(contexteGabarit(this, { isEpisode, seriesName, episodeNumber, episodeTitle, title, year }));

        document.body.appendChild(this._el);
        this._video = this._el.querySelector('.sh-cinema-video');

        setTimeout(() => {
            this._el?.classList.remove('sh-player--entering');
        }, 400);

        this._bindEvents();

        // Enregistrement officiel dans le Focus Registry
        const spatialNav = svc.nav() || svc.nav();
        if (spatialNav?.registerFocusables) {
            spatialNav.registerFocusables('player', (container) => {
                const root = this._el || container;
                return Array.from(root.querySelectorAll(
                    '#sh-btn-back, #sh-player-timeline-focus, #sh-btn-prev-ep, #sh-btn-skip-back, #sh-btn-play-pause, #sh-btn-skip-fwd, #sh-btn-next-ep, #sh-btn-next-trailer, #sh-btn-volume, #sh-btn-open-audio-subs, #sh-btn-open-settings, #sh-btn-open-episodes, #sh-btn-fullscreen, .sh-popover-item'
                ));
            }, { force: true }); // re-registration volontaire (scope plus précis que le défaut de boot) — cf. plan A04
        }

        this._renderDrawerContent();

        if (this._el.requestFullscreen) {
            this._el.requestFullscreen().catch(() => {});
        }
    }

    /**
     * Traduit un `MediaError` en phrase utile. Les quatre codes sont ceux de
     * la spécification HTML ; le libellé dit ce qu'il faut FAIRE, pas
     * seulement ce qui a échoué.
     * @param {MediaError|null} err
     * @returns {string}
     */
    _messageErreurMedia(err) {
        switch (err?.code) {
            case 1: // MEDIA_ERR_ABORTED
                return 'La lecture a été interrompue avant de commencer.';
            case 2: // MEDIA_ERR_NETWORK
                return 'La connexion au serveur a été perdue pendant la lecture. '
                     + 'Vérifiez que le serveur Jellyfin est toujours accessible.';
            case 3: // MEDIA_ERR_DECODE
                return 'Le flux est arrivé mais l\'appareil n\'a pas pu le décoder. '
                     + 'Le fichier est peut-être endommagé, ou le transcodage a échoué côté serveur.';
            case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                return 'Cet appareil ne sait pas lire ce format, et le serveur n\'a pas fourni '
                     + 'de version convertie. Activez le transcodage dans Jellyfin pour ce profil, '
                     + 'ou vérifiez que votre session est toujours valide.';
            default:
                return err?.message || 'La lecture a échoué pour une raison inconnue.';
        }
    }

    /** Retire le panneau d'échec s'il est affiché. */
    _masquerEchecLecture() {
        this._el?.querySelector('.sh-player-failure')?.remove();
    }

    /**
     * Panneau d'échec de lecture : dit ce qui s'est passé et laisse deux
     * issues — réessayer le même titre, ou revenir en arrière. C'est le
     * minimum pour ne pas laisser l'utilisateur devant un écran noir.
     * @param {string} message
     */
    _afficherEchecLecture(message) {
        if (!this._el || this._el.querySelector('.sh-player-failure')) return;
        this._log.error('Échec de lecture :', message);

        const panneau = document.createElement('div');
        panneau.className = 'sh-player-failure';
        panneau.setAttribute('role', 'alert');

        const titre = document.createElement('p');
        titre.className = 'sh-player-failure__title';
        titre.textContent = 'Lecture impossible';

        const detail = document.createElement('p');
        detail.className = 'sh-player-failure__detail';
        // textContent : le message peut contenir du texte venu du serveur.
        detail.textContent = message;

        const actions = document.createElement('div');
        actions.className = 'sh-player-failure__actions';

        const reessayer = document.createElement('button');
        reessayer.type = 'button';
        reessayer.className = 'sh-btn sh-player-failure__btn';
        reessayer.textContent = 'Réessayer';
        reessayer.setAttribute('data-nav-focusable', 'true');
        reessayer.addEventListener('click', () => {
            const item = this._currentItem;
            const reprise = Math.round((this._video?.currentTime || 0) * 10000000);
            this._masquerEchecLecture();
            if (item) this.play(item, reprise, this._playbackOptions || {});
        });

        const fermer = document.createElement('button');
        fermer.type = 'button';
        fermer.className = 'sh-btn sh-btn--ghost sh-player-failure__btn';
        fermer.textContent = 'Fermer le lecteur';
        fermer.setAttribute('data-nav-focusable', 'true');
        fermer.addEventListener('click', () => this.close());

        actions.append(reessayer, fermer);
        panneau.append(titre, detail, actions);
        this._el.appendChild(panneau);

        // Le focus part sur « Réessayer » : sur téléviseur, un panneau qui
        // n'attrape pas le focus est un panneau qu'on ne peut pas actionner.
        requestAnimationFrame(() => reessayer.focus());
    }

    _bindEvents() {
        const el = this._el;
        const video = this._video;
        const spinner = el.querySelector('#sh-player-buffering-spinner');

        el.querySelector('#sh-btn-back')?.addEventListener('click', () => this.close());

        el.addEventListener('mousemove', () => this._onUserActivity());
        el.addEventListener('mousedown', () => this._onUserActivity());
        el.addEventListener('touchstart', () => this._onUserActivity(), { passive: true });

        const playPauseBtn = el.querySelector('#sh-btn-play-pause');
        const togglePlay = () => {
            if (video.paused) {
                video.play();
                this._showFlashOSD('▶', 'Lecture');
            } else {
                video.pause();
                this._showFlashOSD('⏸', 'Pause');
            }
        };
        playPauseBtn?.addEventListener('click', togglePlay);

        video.addEventListener('click', (e) => {
            if (e.target === video) togglePlay();
        });

        // Verrou d'écran : tenu tant que ça joue, relâché dès la pause. Le
        // demander seulement pendant la lecture évite de garder l'écran allumé
        // sur une vidéo en pause qu'on a oubliée.
        video.addEventListener('play', () => {
            this._verrouEcran.demander();
            this._sessionMedia.etat('playing');
        });
        video.addEventListener('pause', () => {
            this._verrouEcran.liberer();
            this._sessionMedia.etat('paused');
        });
        video.addEventListener('ended', () => {
            this._verrouEcran.liberer();
            this._sessionMedia.etat('none');
        });
        // La durée n'est connue qu'à ce moment : publier la position avant
        // reviendrait à annoncer une durée nulle, que le système affiche.
        video.addEventListener('loadedmetadata', () => this._publierPosition());
        video.addEventListener('ratechange', () => this._publierPosition());
        video.addEventListener('seeked', () => this._publierPosition());

        video.addEventListener('waiting', () => spinner?.classList.add('visible'));
        video.addEventListener('playing', () => spinner?.classList.remove('visible'));
        video.addEventListener('canplay', () => spinner?.classList.remove('visible'));

        // AUDIT B4 — l'élément <video> n'avait aucun écouteur `error`.
        //
        // Un jeton expiré (401), un fichier absent (404), un codec que
        // l'appareil ne sait pas décoder : dans tous ces cas le navigateur
        // arrête le chargement en silence. Le spinner mis en place par
        // `_setupVideoSource` restait alors à tourner sur un écran noir,
        // indéfiniment — l'utilisateur n'avait ni cause, ni recours, et sur
        // téléviseur pas même de touche « Échap » évidente.
        video.addEventListener('error', () => {
            // Un `src` vidé à la fermeture déclenche aussi cet événement :
            // ce n'est pas une panne de lecture.
            if (!video.src && !video.currentSrc) return;
            spinner?.classList.remove('visible');
            this._afficherEchecLecture(this._messageErreurMedia(video.error));
        });
        // Une source retrouvée efface le panneau : le repli HLS → flux direct
        // peut réussir après un premier échec.
        video.addEventListener('loadeddata', () => this._masquerEchecLecture());
        video.addEventListener('playing', () => {
            el.querySelector('.sh-icon-play').style.display = 'none';
            el.querySelector('.sh-icon-pause').style.display = 'block';
        });
        video.addEventListener('pause', () => {
            el.querySelector('.sh-icon-play').style.display = 'block';
            el.querySelector('.sh-icon-pause').style.display = 'none';
            this._showControls();
        });

        // Double Clic / Double Tap Gauche / Droite (Sauts ±10s avec Ripple Waves)
        const leftZone = el.querySelector('#sh-zone-left');
        const rightZone = el.querySelector('#sh-zone-right');

        leftZone?.addEventListener('dblclick', () => this._triggerRippleSkip(-10));
        rightZone?.addEventListener('dblclick', () => this._triggerRippleSkip(10));

        const handleTap = (side, delta) => {
            const now = Date.now();
            if (now - this._lastTapTime < 300 && this._lastTapSide === side) {
                this._triggerRippleSkip(delta);
            }
            this._lastTapTime = now;
            this._lastTapSide = side;
        };
                // Écouteur de fin de média natif
        video.addEventListener('ended', () => {
            this._reportPlaybackStopped();
            if (this._nextEpCancelled) return;

            // La file d'attente prime : si quelqu'un a empilé quelque chose,
            // c'est un choix explicite, alors que l'épisode suivant est une
            // déduction. Une file vide retombe exactement sur l'ancien chemin.
            const file = this._queue || svc.queue();
            const suivantDeLaFile = file?.isActive?.() ? file.next() : null;
            if (suivantDeLaFile) {
                this._log.info('Lecture terminée — élément suivant de la file d\'attente.');
                this.play(suivantDeLaFile);
                return;
            }
            if (this._nextEpisode) {
                this._log.info('Lecture terminée — passage automatique à l\'épisode suivant.');
                this.play(this._nextEpisode);
            }
        });

        // Protection tactile multi-touch contre les conflits avec le scroll
        let touchStartX = 0;
        let touchStartY = 0;
        el.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
            this._onUserActivity();
        }, { passive: true });

        const handleTouchTapSafe = (side, delta, e) => {
            if (e.changedTouches && e.changedTouches.length === 1) {
                const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartX);
                const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY);
                if (deltaX > 15 || deltaY > 15) {
                    return; // Geste de défilement ou glissement ignoré
                }
            }
            handleTap(side, delta);
        };

        leftZone?.addEventListener('touchend', (e) => handleTouchTapSafe('left', -10, e));
        rightZone?.addEventListener('touchend', (e) => handleTouchTapSafe('right', 10, e));

        el.querySelector('#sh-btn-skip-back')?.addEventListener('click', (e) => {
            this._animateButtonSpring(e.currentTarget);
            video.currentTime = Math.max(0, video.currentTime - 10);
            this._showFlashOSD('⏪', '-10s');
        });
        el.querySelector('#sh-btn-skip-fwd')?.addEventListener('click', (e) => {
            this._animateButtonSpring(e.currentTarget);
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
            this._showFlashOSD('⏩', '+10s');
        });

        el.querySelector('#sh-btn-prev-ep')?.addEventListener('click', () => {
            if (this._prevEpisode) { this.play(this._prevEpisode); return; }
            const file = this._queue || svc.queue();
            const avant = file?.previous?.();
            if (avant) this.play(avant);
        });
        el.querySelector('#sh-btn-next-trailer')?.addEventListener('click', () => {
            svc.trailers()?.suivante?.();
        });
        el.querySelector('#sh-btn-next-ep')?.addEventListener('click', () => {
            const file = this._queue || svc.queue();
            // Même arbitrage qu'à la fin du média : un élément explicitement
            // empilé passe avant l'épisode suivant déduit de la série.
            const apres = file?.isActive?.() ? file.next() : null;
            if (apres) { this.play(apres); return; }
            if (this._nextEpisode) this.play(this._nextEpisode);
        });

        video.addEventListener('timeupdate', () => this._onTimeUpdate());
        video.addEventListener('progress', () => this._onBufferProgress());

        // Scrubbing Timeline
        // Le markup expose `sh-player-timeline-focus` (et non `sh-timeline-track`).
        // Garder une garde ici afin qu'un skin incomplet ne fasse pas tomber tout le player.
        const trackWrap = el.querySelector('#sh-player-timeline-focus');
        const tooltip = el.querySelector('#sh-timeline-tooltip');
        const tooltipTime = el.querySelector('#sh-tooltip-time');
        if (!trackWrap) {
            this._log.warn('Timeline indisponible dans le player.');
            return;
        }

        const onScrubMove = (e) => {
            const rect = trackWrap.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const targetTime = pos * (video.duration || 0);

            tooltip.style.left = `${pos * 100}%`;
            tooltipTime.textContent = this._formatTime(targetTime);
            this._afficherVignette(targetTime);

            if (this._isScrubbing) {
                video.currentTime = targetTime;
                el.querySelector('#sh-timeline-played').style.width = `${pos * 100}%`;
                el.querySelector('#sh-timeline-handle').style.left = `${pos * 100}%`;
            }
        };

        trackWrap.addEventListener('mousemove', onScrubMove);
        trackWrap.addEventListener('mousedown', (e) => {
            this._isScrubbing = true;
            onScrubMove(e);
            const onMouseUp = () => {
                this._isScrubbing = false;
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mouseup', onMouseUp);
        });

        // Volume & Ligne Jaune/Ambrée Dynamique
        const volumeRange = el.querySelector('#sh-volume-range');
        const updateVolumeTrack = (v) => {
            if (!volumeRange) return;
            const percent = Math.round(Math.max(0, Math.min(1, v)) * 100);
            volumeRange.style.background = `linear-gradient(to right, #ff9f0a 0%, #ff9f0a ${percent}%, rgba(var(--sh-on-media, 255, 255, 255),  0.22) ${percent}%, rgba(var(--sh-on-media, 255, 255, 255),  0.22) 100%)`;
        };

        if (volumeRange) {
            updateVolumeTrack(this._volume);
            volumeRange.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                video.volume = v;
                video.muted = false;
                this._volume = v;
                updateVolumeTrack(v);
                localStorage.setItem('SpaceHub_player_volume', String(v));
                this._showFlashOSD(v === 0 ? '🔇' : '🔊', `${Math.round(v * 100)}%`, v);
            });
        }

        el.querySelector('#sh-btn-volume')?.addEventListener('click', () => {
            video.muted = !video.muted;
            if (video.muted) {
                updateVolumeTrack(0);
                if (volumeRange) volumeRange.value = '0';
                this._showFlashOSD('🔇', 'Muet');
            } else {
                updateVolumeTrack(video.volume);
                if (volumeRange) volumeRange.value = String(video.volume);
                this._showFlashOSD('🔊', `${Math.round(video.volume * 100)}%`, video.volume);
            }
        });

        // Aspect Ratio
        el.querySelector('#sh-btn-aspect')?.addEventListener('click', () => {
            this._aspectRatioIndex = (this._aspectRatioIndex + 1) % this._aspectRatios.length;
            const mode = this._aspectRatios[this._aspectRatioIndex];
            video.style.objectFit = mode;
            const labels = { contain: '16:9 Adapté', cover: '21:9 Scope', fill: 'Plein écran' };
            this._showFlashOSD('📐', labels[mode] || mode);
        });

        // Picture-in-Picture
        el.querySelector('#sh-btn-pip')?.addEventListener('click', async () => {
            try {
                if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture();
                } else if (document.pictureInPictureEnabled) {
                    await video.requestPictureInPicture();
                }
            } catch (err) {
                this._log.warn('Erreur PiP:', err);
            }
        });

        el.querySelector('#sh-btn-fullscreen')?.addEventListener('click', () => this._toggleFullscreen());

        // 🗄️ Déclencheurs de Tiroirs
        el.querySelector('#sh-btn-open-audio-subs')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._togglePopover('sh-popover-audio-subs', e.currentTarget);
        });
        el.querySelector('#sh-btn-open-settings')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._togglePopover('sh-popover-settings', e.currentTarget);
        });
        el.querySelector('#sh-btn-open-episodes')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._togglePopover('sh-popover-episodes', e.currentTarget);
        });

        // Fermeture des popovers en cliquant ailleurs
        el.addEventListener('click', (e) => {
            if (!e.target.closest('.sh-player-popover') && !e.target.closest('.sh-dock-pill-btn')) {
                this._closeAllPopovers();
            }
        });

        el.querySelector('#sh-btn-stats')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._basculerStatistiques();
        });

        el.querySelector('#sh-smart-skip-btn')?.addEventListener('click', () => {
            // `_segmentCourant` est posé par `_onTimeUpdate` : c'est ce que le
            // bouton affiche à cet instant. À défaut — bouton actionné par une
            // touche avant le premier `timeupdate` — on retombe sur l'intro.
            if (this._segmentCourant) this._passerSegment(this._segmentCourant);
            else this._performSkipIntro();
        });

        el.querySelector('#sh-next-ep-play-now')?.addEventListener('click', () => {
            if (this._nextEpisode) this.play(this._nextEpisode);
        });
        el.querySelector('#sh-next-ep-cancel')?.addEventListener('click', () => {
            this._cancelNextEpCountdown();
        });

        this._keyHandler = (e) => this._onDirectShortcutKeyDown(e);
        inputRouter.inscrire('player', this._keyHandler, { priorite: PRIORITES.player });
    }

    _togglePopover(popoverId, triggerBtn) {
        const popover = this._el?.querySelector(`#${popoverId}`);
        if (!popover) return;

        const isOpen = popover.classList.contains('open');

        // Fermer tous les popovers ouverts
        this._closeAllPopovers();

        if (!isOpen) {
            this._renderPopoversContent();
            popover.classList.add('open');
            triggerBtn?.classList.add('active');
        }
    }

    _closeAllPopovers() {
        this._el?.querySelectorAll('.sh-player-popover').forEach(p => p.classList.remove('open'));
        this._el?.querySelectorAll('.sh-dock-pill-btn').forEach(b => b.classList.remove('active'));
    }

    _renderPopoversContent() {
        this._renderAudioSubsPopover();
        this._renderSettingsPopover();
        this._renderVersionsPopover();
        this._renderEpisodesPopover();
    }

    _renderAudioSubsPopover() {
        const audioList = this._el?.querySelector('#sh-player-audio-list');
        const subsList = this._el?.querySelector('#sh-player-subs-list');

        // 1. Pistes Audio
        if (audioList) {
            if (!this._audioStreams || this._audioStreams.length === 0) {
                audioList.innerHTML = '<div class="sh-popover-empty">Stéréo Standard</div>';
            } else {
                audioList.innerHTML = this._audioStreams.map(s => {
                    const isSel = s.Index === this._selectedAudioIndex;
                    const lang = (s.Language || 'und').toUpperCase();
                    const codec = (s.Codec || 'AAC').toUpperCase();
                    const channels = s.ChannelLayout || (s.Channels ? `${s.Channels} ch` : 'Stéréo');
                    const title = s.DisplayTitle || s.Title || `${lang} · ${codec} ${channels}`;

                    return `
                        <div class="sh-popover-item ${isSel ? 'selected' : ''}" tabindex="0" data-nav-focusable="true" data-audio-idx="${s.Index}">
                            <div class="sh-popover-item-name">${this._escape(title)}</div>
                            <div class="sh-popover-item-badge">${codec} ${channels}</div>
                        </div>
                    `;
                }).join('');

                audioList.querySelectorAll('.sh-popover-item').forEach(el => {
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const selectedIndex = parseInt(el.dataset.audioIdx, 10);
                        this._selectedAudioIndex = selectedIndex;
                        this._renderAudioSubsPopover();
                        const title = el.querySelector('.sh-popover-item-name')?.textContent || 'Audio';
                        this._showFlashOSD('🔊', title);
                        this._reloadCurrentSourceWithOptions({ audioStreamIndex: selectedIndex });
                    });
                });
            }
        }

        // 2. Sous-titres
        if (subsList) {
            let subsHtml = `
                <div class="sh-popover-item ${this._selectedSubIndex === -1 ? 'selected' : ''}" tabindex="0" data-nav-focusable="true" data-sub-idx="-1">
                    <div class="sh-popover-item-name">Désactivé</div>
                </div>
            `;

            if (this._subStreams && this._subStreams.length > 0) {
                subsHtml += this._subStreams.map(s => {
                    const isSel = s.Index === this._selectedSubIndex;
                    const lang = (s.Language || 'und').toUpperCase();
                    const title = s.DisplayTitle || s.Title || `${lang} ${s.IsForced ? '(Forcé)' : ''}`;

                    return `
                        <div class="sh-popover-item ${isSel ? 'selected' : ''}" tabindex="0" data-nav-focusable="true" data-sub-idx="${s.Index}">
                            <div class="sh-popover-item-name">${this._escape(title)}</div>
                            ${s.IsForced ? '<span class="sh-popover-item-badge" tabindex="0" data-nav-focusable="true">FORCÉ</span>' : ''}
                        </div>
                    `;
                }).join('');
            }

            subsList.innerHTML = subsHtml;

            subsList.querySelectorAll('.sh-popover-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const selectedIndex = parseInt(el.dataset.subIdx, 10);
                    this._selectedSubIndex = selectedIndex;
                    this._renderAudioSubsPopover();
                    const title = el.querySelector('.sh-popover-item-name')?.textContent || 'Sous-titre';
                    this._showFlashOSD('💬', `Sous-titres : ${title}`);
                    this._reloadCurrentSourceWithOptions({ subtitleStreamIndex: selectedIndex });
                });
            });
        }

        // 3. Stepper de Synchronisation
        const syncGrid = this._el?.querySelector('#sh-popover-audio-subs .sh-sync-grid');
        syncGrid?.querySelectorAll('.sh-sync-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const delta = parseFloat(btn.dataset.offset);
                if (delta === 0) this._subOffset = 0;
                else this._subOffset = Math.round((this._subOffset + delta) * 10) / 10;

                this._applySubtitleOffset();
                const label = this._el?.querySelector('#sh-popover-offset-val');
                if (label) label.textContent = `${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s`;
                this._showFlashOSD('⏱️', `Sous-titres ${this._subOffset > 0 ? '+' : ''}${this._subOffset.toFixed(1)}s`);
            };
        });
    }

    _renderSettingsPopover() {
        const speedChips = this._el?.querySelector('#sh-player-speed-chips');
        const aspectChips = this._el?.querySelector('#sh-player-aspect-chips');
        const aspectLabels = { contain: '16:9 Adapté', cover: '21:9 Cinéma Scope', fill: 'Plein écran Étiré' };

        if (speedChips) {
            speedChips.querySelectorAll('[data-speed]').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const spd = parseFloat(btn.dataset.speed);
                    this._playbackRate = spd;
                    this._video.playbackRate = spd;
                    localStorage.setItem('SpaceHub_playback_speed', String(spd));
                    const speedInd = this._el?.querySelector('#sh-speed-indicator');
                    if (speedInd) speedInd.textContent = `${spd}x`;
                    speedChips.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', parseFloat(b.dataset.speed) === spd));
                    this._showFlashOSD('⚡', `Vitesse : ${spd}x`);
                };
            });
        }

        if (aspectChips) {
            aspectChips.querySelectorAll('[data-aspect-idx]').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.aspectIdx, 10);
                    this._aspectRatioIndex = idx;
                    const mode = this._aspectRatios[idx];
                    this._video.style.objectFit = mode;
                    aspectChips.querySelectorAll('[data-aspect-idx]').forEach(b => b.classList.toggle('active', parseInt(b.dataset.aspectIdx, 10) === idx));
                    this._showFlashOSD('📐', aspectLabels[mode] || mode);
                };
            });
        }
    }

    /**
     * Propose les versions du média quand il y en a plusieurs.
     *
     * Avec le greffon « Merge Versions », un film peut exister en remux 4K de
     * 40 Go et en 1080p de 6 Go. Le lecteur prenait toujours la première.
     * Depuis l'extérieur du réseau, ce n'est pas le bon choix — et personne ne
     * pouvait le corriger.
     *
     * La section reste masquée quand il n'y a qu'une version : proposer un
     * « choix » d'une seule option est du bruit.
     */
    _renderVersionsPopover() {
        const section = this._el?.querySelector('#sh-player-versions-section');
        const chips = this._el?.querySelector('#sh-player-versions-chips');
        if (!section || !chips) return;

        const versions = this._versions || [];
        if (versions.length < 2) { section.style.display = 'none'; return; }
        section.style.display = '';

        chips.innerHTML = versions.map(v => {
            const actif = v.id === this._mediaSourceId ? 'active' : '';
            // Taille et débit sont ce qui décide réellement du choix.
            const details = [
                v.taille ? `${(v.taille / 1073741824).toFixed(1)} Go` : '',
                v.debit ? `${Math.round(v.debit / 1000000)} Mb/s` : '',
            ].filter(Boolean).join(' · ');
            return `<button class="sh-chip-btn ${actif}" tabindex="0" data-nav-focusable="true"
                        data-version-id="${this._escape(v.id)}">${this._escape(v.nom)}${details ? ` — ${details}` : ''}</button>`;
        }).join('');

        chips.querySelectorAll('[data-version-id]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.dataset.versionId;
                if (id === this._mediaSourceId) return;
                this._showFlashOSD('🎞️', 'Changement de version…');
                // Relance la lecture à la même position, sur l'autre source.
                this._reloadCurrentSourceWithOptions({ mediaSourceId: id });
            };
        });
    }

    /**
     * Panneau de statistiques de lecture.
     *
     * Répond à la question la plus posée de l'écosystème Jellyfin :
     * « pourquoi est-ce que ça transcode ? ». Le serveur le dit dans
     * `TranscodeReasons`, que la négociation lisait déjà sans jamais
     * l'afficher.
     *
     * C'est aussi le pendant, côté lecture, du HUD de navigation : sur un
     * téléviseur sans console, c'est le seul moyen de diagnostiquer une
     * lecture qui saccade.
     */
    _basculerStatistiques() {
        const existant = this._el?.querySelector('.sh-player-stats');
        if (existant) {
            existant.remove();
            if (this._minuteurStats) { clearInterval(this._minuteurStats); this._minuteurStats = null; }
            return;
        }
        if (!this._el) return;

        const panneau = document.createElement('div');
        panneau.className = 'sh-player-stats';
        // Un panneau de diagnostic ne doit jamais devenir une cible de
        // navigation : il fausserait ce qu'il mesure.
        panneau.setAttribute('inert', '');
        panneau.setAttribute('aria-hidden', 'true');
        this._el.appendChild(panneau);

        const rafraichir = () => {
            const v = this._video;
            if (!v || !panneau.isConnected) return;
            const q = v.getVideoPlaybackQuality?.() || {};
            const niveau = this._hls?.levels?.[this._hls.currentLevel];
            const tampon = v.buffered.length
                ? Math.max(0, v.buffered.end(v.buffered.length - 1) - v.currentTime) : 0;

            const lignes = [
                '── Lecture ──',
                `méthode     ${this._playMethod || '—'}`,
                // LA ligne qui justifie tout ce panneau.
                `transcodage ${this._transcodeReasons?.length ? this._transcodeReasons.join(', ') : 'aucun (lecture directe)'}`,
                `source      ${this._mediaSourceId || '—'}`,
                '',
                '── Flux ──',
                `résolution  ${v.videoWidth || '?'}×${v.videoHeight || '?'}`,
                niveau ? `niveau HLS  ${Math.round((niveau.bitrate || 0) / 1000)} kb/s · ${niveau.width}×${niveau.height}` : 'niveau HLS  —',
                `tampon      ${tampon.toFixed(1)} s`,
                '',
                '── Rendu ──',
                `images      ${q.totalVideoFrames ?? '—'} affichées`,
                `perdues     ${q.droppedVideoFrames ?? '—'}`,
            ];
            // textContent : ces valeurs viennent du serveur.
            panneau.textContent = lignes.join('\n');
        };
        rafraichir();
        this._minuteurStats = setInterval(rafraichir, 1000);
    }

    _renderEpisodesPopover() {
        const epList = this._el?.querySelector('#sh-player-episodes-list');
        if (!epList) return;

        if (this._seasonEpisodes.length === 0) {
            epList.innerHTML = '<div class="sh-popover-empty">Aucun épisode disponible.</div>';
            return;
        }

        const currentId = this._currentItem.Id || this._currentItem.id;
        epList.innerHTML = this._seasonEpisodes.map(ep => {
            const isCur = ep.Id === currentId;
            const sNum = String(ep.ParentIndexNumber || 1).padStart(2, '0');
            const eNum = String(ep.IndexNumber || 1).padStart(2, '0');
            const imgUrl = this._escapeUrl(this._api?.getImageUrl(ep.Id, 'Primary', { maxWidth: 200, maxHeight: 112 }) || '');

            return `
                <div class="sh-popover-episode-row ${isCur ? 'selected' : ''}" data-ep-id="${ep.Id}">
                    <div class="sh-popover-ep-thumb">
                        <img decoding="async" src="${imgUrl}" alt="${this._escape(ep.Name)}" onerror="this.style.display='none';"/>
                        <span class="sh-popover-ep-tag">S${sNum}E${eNum}</span>
                    </div>
                    <div class="sh-popover-ep-meta">
                        <div class="sh-popover-ep-name">${this._escape(ep.Name)}</div>
                        <div class="sh-popover-ep-dur">${ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 600000000) + ' min' : ''}</div>
                    </div>
                </div>
            `;
        }).join('');

        epList.querySelectorAll('.sh-popover-episode-row').forEach(row => {
            row.addEventListener('click', () => {
                const epId = row.dataset.epId;
                const targetEp = this._seasonEpisodes.find(e => e.Id === epId);
                if (targetEp) {
                    this._closeAllPopovers();
                    this.play(targetEp);
                }
            });
        });
    }

    /**
     * Avance ou recule de N secondes.
     *
     * Cette méthode était appelée à CINQ endroits — les raccourcis clavier
     * ←/→, J/L, et la délégation manette du scope lecteur — et n'était définie
     * NULLE PART. Chaque appui levait donc une TypeError : sauter dans une
     * vidéo à la télécommande n'a jamais fonctionné. Le nom réel de
     * l'implémentation est `_triggerRippleSkip` ; le renommage n'avait été fait
     * qu'à moitié.
     *
     * On garde les deux noms plutôt que de réécrire les cinq sites : celui-ci
     * dit l'intention, l'autre dit ce qu'il fait à l'écran.
     */
    _seekRelative(deltaSeconds) {
        this._triggerRippleSkip(deltaSeconds);
    }

    _triggerRippleSkip(deltaSeconds) {
        if (!this._video) return;
        this._video.currentTime = Math.max(0, Math.min(this._video.duration || 0, this._video.currentTime + deltaSeconds));
        
        const isFwd = deltaSeconds > 0;
        const rippleEl = this._el?.querySelector(isFwd ? '#sh-ripple-right' : '#sh-ripple-left');
        if (rippleEl) {
            rippleEl.classList.remove('active');
            void rippleEl.offsetWidth;
            rippleEl.classList.add('active');
        }
        this._showFlashOSD(isFwd ? '⏩' : '⏪', `${isFwd ? '+' : ''}${deltaSeconds}s`);
    }

    _animateButtonSpring(btn) {
        // Peau 2 : extrait vers UtilitairesLecteur.js (le nœud est passé en
        // argument — la fonction ne touche jamais l'état du lecteur).
        utilitairesLecteur.ressortirBouton(btn);
    }

    _applySubtitleOffset() {
        const delta = this._subOffset - this._appliedSubOffset;
        if (!delta || !this._video?.textTracks) return;
        for (let i = 0; i < this._video.textTracks.length; i++) {
            const track = this._video.textTracks[i];
            if (!track.cues) continue;
            for (let j = 0; j < track.cues.length; j++) {
                const cue = track.cues[j];
                cue.startTime += delta;
                cue.endTime += delta;
            }
        }
        this._appliedSubOffset = this._subOffset;
    }

    _openRemoteSubtitleModal() {
        const Modal = svc.modalClass();
        const itemId = this._currentItem.Id || this._currentItem.id;

        if (!Modal || !this._api || !itemId) {
            svc.toaster()?.info('Recherche de sous-titres non disponible.');
            return;
        }

        const modal = new Modal({
            id: 'sh-remote-sub-modal',
            title: 'Rechercher des Sous-Titres en Ligne',
            size: 'md',
            content: `
                <div style="padding:16px 0;">
                    <div style="display:flex; gap:8px; margin-bottom:16px;">
                        <input type="text" class="sh-input" id="sh-sub-lang-input" value="fre" placeholder="Code langue (ex: fre, eng)" style="width:120px;"/>
                        <button class="sh-btn sh-btn--primary" id="sh-btn-do-sub-search">Rechercher</button>
                    </div>
                    <div id="sh-sub-search-results" style="max-height:320px; overflow-y:auto;">
                        <p style="color:var(--sh-text-muted); font-size:13px;">Cliquez sur Rechercher pour interroger OpenSubtitles via Jellyfin.</p>
                    </div>
                </div>
            `
        });

        modal.open();

        const resultsEl = modal._el.querySelector('#sh-sub-search-results');
        modal._el.querySelector('#sh-btn-do-sub-search')?.addEventListener('click', async () => {
            const lang = modal._el.querySelector('#sh-sub-lang-input')?.value || 'fre';
            resultsEl.innerHTML = '<p style="color:var(--sh-text-muted); font-size:13px;">Recherche en cours...</p>';
            try {
                const serverUrl = this._auth?.getServerUrl();
                const res = await fetchAvecDelai(`${serverUrl}/Items/${itemId}/RemoteSearch/Subtitles/${lang}`, {
                    headers: this._auth?.getAuthHeaders()
                });
                const subs = await res.json();
                if (!subs || subs.length === 0) {
                    resultsEl.innerHTML = '<p style="color:var(--sh-text-muted); font-size:13px;">Aucun sous-titre trouvé.</p>';
                    return;
                }
                resultsEl.innerHTML = subs.map(s => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; margin-bottom:6px; background:rgba(var(--sh-on-media, 255, 255, 255), 0.05); border-radius:8px;">
                        <div style="font-size:13px; font-weight:500;">
                            <div>${this._escape(s.Name)}</div>
                            <small style="color:var(--sh-text-muted); font-size:11px;">Format: ${s.Format || 'SRT'} • Source: ${s.ProviderName || 'Web'}</small>
                        </div>
                        <button class="sh-btn sh-btn--sm sh-btn--primary sh-dl-sub-btn" data-sub-id="${s.Id}">Télécharger</button>
                    </div>
                `).join('');

                resultsEl.querySelectorAll('.sh-dl-sub-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        btn.disabled = true;
                        btn.textContent = 'Ajout...';
                        try {
                            await fetchAvecDelai(`${serverUrl}/Items/${itemId}/RemoteSearch/Subtitles/${btn.dataset.subId}`, {
                                method: 'POST',
                                headers: this._auth?.getAuthHeaders()
                            });
                            svc.toaster()?.success('Sous-titre ajouté avec succès !');
                            modal.close();
                        } catch {
                            btn.textContent = 'Erreur';
                        }
                    });
                });
            } catch (err) {
                resultsEl.innerHTML = `<p style="color:var(--sh-color-danger); font-size:13px;">Erreur : ${this._escape(err.message)}</p>`;
            }
        });
    }

        /**
     * Charge les SEGMENTS MÉDIAS du titre (Jellyfin 10.10 et suivants).
     *
     * Pourquoi c'est mieux que les chapitres. La détection d'introduction
     * reposait entièrement sur le NOM des chapitres — « intro », « opening »,
     * « générique ». Or presque aucun fichier n'a de chapitre nommé ainsi :
     * les chapitres viennent du conteneur vidéo et sont le plus souvent
     * « Chapter 1 », « Chapter 2 »… La fonctionnalité « Passer l'intro »
     * existait donc dans le code sans jamais s'afficher en pratique.
     *
     * Depuis 10.10, le serveur expose `/MediaSegments/{id}` : des plages
     * TYPÉES (Intro, Outro, Commercial, Preview, Recap), produites par les
     * greffons de détection. C'est une donnée, plus une devinette sur une
     * chaîne de caractères.
     *
     * Le serveur décide, le client agit : Jellyfin laisse explicitement le
     * comportement au client. On s'en sert pour proposer — jamais pour sauter
     * d'autorité.
     *
     * L'absence de segments n'est pas une erreur : un serveur 10.9, ou sans
     * greffon de détection, répond 404. On retombe alors sur les chapitres.
     *
     * @param {string} itemId
     * @returns {Promise<void>}
     */
    async _chargerSegmentsMedia(itemId) {
        if (!itemId) return;
        const generation = this._playGeneration;
        let resultat;
        try {
            resultat = await segmentsMedia.chargerSegments(itemId, {
                serverUrl: () => this._auth?.getServerUrl?.(),
                headers: () => this._auth?.getAuthHeaders?.(),
            });
        } catch (err) {
            // 404 sur un serveur ancien, réseau coupé, greffon absent : aucun
            // de ces cas n'est une panne. On repasse aux chapitres.
            this._segmentsMedia = [];
            this._segmentsPourItem = itemId;
            this._log.debug('Segments médias indisponibles :', err?.message || err);
            return;
        }
        if (generation !== this._playGeneration) return;   // titre changé entre-temps
        if (resultat === null) return;                     // pas d'URL serveur : rien à faire
        this._segmentsMedia = resultat.ok ? resultat.segments : [];
        this._segmentsPourItem = itemId;
        this._intervalleIntro = undefined;                 // à recalculer avec la nouvelle source
        if (this._segmentsMedia.length) {
            this._log.info(`${this._segmentsMedia.length} segment(s) média fourni(s) par le serveur : `
                + this._segmentsMedia.map(s2 => s2.type).join(', '));
        }
    }

    /**
     * Types de segments sur lesquels on propose une action, et le libellé du
     * bouton correspondant.
     *
     * L'ordre compte : si deux segments se chevauchent (un résumé à
     * l'intérieur d'une introduction, cela arrive), c'est le premier de cette
     * liste qui gagne — le plus spécifique d'abord.
     *
     * `commercial` est volontairement ABSENT : le contenu d'un serveur
     * Jellyfin personnel n'a pas de coupures publicitaires, et proposer de
     * « passer la publicité » sur un enregistrement télé reviendrait à
     * décider à la place de l'utilisateur ce qui est du contenu.
     */
    /**
     * Types de segments sur lesquels on propose une action — délégué au
     * module SegmentsMedia ; la façade statique reste le contrat public.
     */
    static get SEGMENTS_ACTIONNABLES() {
        return segmentsMedia.SEGMENTS_ACTIONNABLES;
    }

    /**
     * Le segment actionnable qui couvre l'instant donné, s'il y en a un.
     *
     * Jusqu'ici seule l'introduction était exploitée, alors que le serveur
     * fournit aussi le résumé (« Précédemment dans… »), l'aperçu du prochain
     * épisode et le générique de fin. Un résumé de quatre-vingt-dix secondes
     * qu'on a déjà vu la veille est exactement ce qu'on veut passer.
     *
     * @param {number} temps  Position de lecture, en secondes.
     * @returns {{ start: number, end: number, libelle: string }|null}
     */
    _segmentActionnableA(temps) {
        return segmentsMedia.segmentActionnableA(temps, this._segmentsMedia, this._intervalleIntro);
    }

    /**
     * Fait sauter la lecture à la fin du segment en cours.
     * @param {{ end: number, libelle: string }} segment
     */
    _passerSegment(segment) {
        if (!segment || !this._video) return;
        segmentsMedia.passerSegment(segment, {
            video: this._video,
            montrerOSD: (icone, texte) => this._showFlashOSD(icone, texte),
            cacherBouton: () => this._el?.querySelector('#sh-smart-skip-btn')?.classList.remove('visible'),
        });
    }

    /**
     * Premier segment d'un type donné, s'il existe.
     * @param {...string} types
     * @returns {{ start: number, end: number }|null}
     */
    _segment(...types) {
        return segmentsMedia.premierSegment(this._segmentsMedia, ...types);
    }

    /**
     * Détecte l'intervalle réel de l'introduction via les chapitres Jellyfin.
     * @param {Object} item
     * @returns {{ start: number, end: number } | null}
     */
    _getIntroInterval(item) {
        return segmentsMedia.intervalleIntroduction(item, this._segmentsMedia);
    }

    _performSkipIntro() {
        const interval = this._getIntroInterval(this._currentItem);
        if (!interval || !this._video) return;
        segmentsMedia.passerSegment({ end: interval.end, libelle: 'Passer l\'intro' }, {
            video: this._video,
            montrerOSD: (icone, texte) => this._showFlashOSD(icone, texte),
            cacherBouton: () => this._el?.querySelector('#sh-smart-skip-btn')?.classList.remove('visible'),
        });
    }

        _onTimeUpdate() {
        if (!this._video || this._isScrubbing) return;
        const cur = this._video.currentTime || 0;
        const dur = this._video.duration || 0;
        const rem = Math.max(0, dur - cur);

        const elElapsed = this._el?.querySelector('#sh-time-elapsed');
        const elTotal = this._el?.querySelector('#sh-time-total');
        const elRemaining = this._el?.querySelector('#sh-time-remaining');
        if (elElapsed) elElapsed.textContent = this._formatTime(cur);
        if (elTotal) elTotal.textContent = this._formatTime(dur);
        if (elRemaining) elRemaining.textContent = `-${this._formatTime(rem)}`;

        // Barre de progression système. `timeupdate` bat environ quatre fois
        // par seconde : on ne republie qu'au changement de seconde entière,
        // ce que le système affiche de toute façon.
        const seconde = Math.floor(cur);
        if (seconde !== this._secondePubliee) {
            this._secondePubliee = seconde;
            this._publierPosition();
        }

        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        const elPlayed = this._el?.querySelector('#sh-timeline-played');
        const elHandle = this._el?.querySelector('#sh-timeline-handle');
        if (elPlayed) elPlayed.style.width = `${pct}%`;
        if (elHandle) elHandle.style.left = `${pct}%`;

        // 1. Bouton « Passer l'introduction ».
        //    L'intervalle était recalculé à CHAQUE `timeupdate` — soit quatre
        //    balayages du tableau des chapitres par seconde, pendant tout le
        //    film. On le résout une fois par titre ; `undefined` signifie
        //    « pas encore calculé », `null` « aucune introduction ».
        if (this._intervalleIntro === undefined) {
            this._intervalleIntro = this._getIntroInterval(this._currentItem);
        }
        // Le bouton ne sert plus qu'à l'introduction : il suit aussi le résumé
        // et l'aperçu, et change de libellé en conséquence.
        const segment = this._segmentActionnableA(cur);
        const skipBtn = this._el?.querySelector('#sh-smart-skip-btn');
        if (skipBtn) {
            if (segment) {
                const etiquette = skipBtn.querySelector('span');
                if (etiquette && etiquette.textContent !== segment.libelle) {
                    etiquette.textContent = segment.libelle;
                }
                this._segmentCourant = segment;
                skipBtn.classList.add('visible');
            } else {
                this._segmentCourant = null;
                skipBtn.classList.remove('visible');
            }
        }

        // 2. Carte du prochain épisode.
        //
        //    Le déclencheur était « il reste 30 secondes ». C'est une
        //    approximation qui se trompe dans les deux sens : un film avec
        //    quatre minutes de générique laisse l'utilisateur attendre, et un
        //    épisode sans générique voit la carte recouvrir la dernière scène.
        //
        //    Quand le serveur fournit un segment `outro`, il sait EXACTEMENT
        //    où commence le générique de fin. On s'en sert, et on ne retombe
        //    sur les 30 secondes que sans cette information.
        const outro = this._segment('outro');
        const momentVenu = outro ? cur >= outro.start : (dur > 45 && rem <= 30);
        if (momentVenu && this._nextEpisode) {
            this._showNextEpCard();
            // Le décompte reste calé sur la fin réelle du média.
            if (rem <= 8 && !this._nextEpCancelled && !this._nextEpCountdownInterval) {
                this._startNextEpCountdown();
            }
        } else {
            this._hideNextEpCard();
        }
    }

    _onBufferProgress() {
        if (!this._video || !this._video.duration) return;
        const dur = this._video.duration;
        const buf = this._video.buffered;
        if (buf.length > 0) {
            const end = buf.end(buf.length - 1);
            const elBuf = this._el?.querySelector('#sh-timeline-buffer');
            if (elBuf) elBuf.style.width = `${(end / dur) * 100}%`;
        }
    }

    _showNextEpCard() {
        const card = this._el?.querySelector('#sh-next-ep-card');
        if (!card || !this._nextEpisode || this._nextEpCancelled) return;

        card.classList.add('visible');
        const img = card.querySelector('#sh-next-ep-img');
        const title = card.querySelector('#sh-next-ep-title');
        if (title) {
            title.textContent = `S${String(this._nextEpisode.ParentIndexNumber || 1).padStart(2, '0')}E${String(this._nextEpisode.IndexNumber || 1).padStart(2, '0')} · « ${this._nextEpisode.Name || 'Épisode suivant'} »`;
        }
        if (img && this._api) {
            img.src = this._api.getImageUrl(this._nextEpisode.Id, 'Primary', { maxWidth: 240, maxHeight: 135 });
        }
    }

    _startNextEpCountdown() {
        const card = this._el?.querySelector('#sh-next-ep-card');
        if (!card || !this._nextEpisode || this._nextEpCancelled) return;

        this._showNextEpCard();
        const secTxt = card.querySelector('#sh-next-ep-sec');
        this._nextEpRemaining = 5;
        secTxt.textContent = '5';

        if (this._nextEpCountdownInterval) clearInterval(this._nextEpCountdownInterval);
        this._nextEpCountdownInterval = setInterval(() => {
            this._nextEpRemaining--;
            if (secTxt) secTxt.textContent = String(this._nextEpRemaining);
            if (this._nextEpRemaining <= 0) {
                clearInterval(this._nextEpCountdownInterval);
                this._nextEpCountdownInterval = null;
                if (this._nextEpisode && !this._nextEpCancelled) this.play(this._nextEpisode);
            }
        }, 1000);
    }

    _cancelNextEpCountdown() {
        this._nextEpCancelled = true;
        if (this._nextEpCountdownInterval) clearInterval(this._nextEpCountdownInterval);
        this._hideNextEpCard();
    }

    _hideNextEpCard() {
        if (this._nextEpCountdownInterval) {
            clearInterval(this._nextEpCountdownInterval);
            this._nextEpCountdownInterval = null;
        }
        this._el?.querySelector('#sh-next-ep-card')?.classList.remove('visible');
    }

    _showFlashOSD(icon, text, progressPct = null) {
        this._visibilite.montrerFlashOSD(icon, text, progressPct);
    }

    _onUserActivity() {
        this._visibilite.surActivite();
    }

    _showControls() {
        this._visibilite.montrerControles();
    }

    _hideControls() {
        this._visibilite.cacherControles();
    }

    _resetIdleTimer() {
        this._visibilite.reinitialiserMinuterie();
    }

    _toggleFullscreen() {
        if (!document.fullscreenElement) {
            this._el?.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }

    _onDirectShortcutKeyDown(e) {
        if (!this._el || e.target.tagName === 'INPUT') return;

        // ── TOUCHES MÉDIA DE LA TÉLÉCOMMANDE ────────────────────────────
        //
        // Elles passent AVANT le garde de visibilité du HUD : appuyer sur ⏯
        // quand les contrôles sont masqués doit mettre en pause, pas réveiller
        // le HUD. C'est le geste que fait tout le monde.
        //
        // Elles n'arrivent pas comme `e.key` : les télécommandes envoient des
        // `keyCode` numériques, propres à chaque plateforme. Voir
        // core/TelecommandeTv.js — et sur Samsung, elles n'arrivent même pas
        // du tout sans un `registerKeyBatch()` au démarrage.
        const media = actionMedia(e);
        if (media) {
            e.preventDefault();
            this._executerActionMedia(media);
            return;
        }

        if (!this._visibilite.visibles()) return; // le réveil du HUD reste géré par handleNavAction

        switch (e.key) {
            case 'k':
                e.preventDefault();
                this._togglePlayPause();
                break;
            case 'j':
                e.preventDefault();
                this._seekRelative(-10);
                break;
            case 'l':
                e.preventDefault();
                this._seekRelative(+10);
                break;
            case 'm':
                e.preventDefault();
                this._el.querySelector('#sh-btn-volume')?.click();
                break;
            case 'f':
                e.preventDefault();
                this._toggleFullscreen();
                break;
            case 's':
                e.preventDefault();
                this._el.querySelector('#sh-btn-open-audio-subs')?.click();
                break;
            case 'c':
                e.preventDefault();
                this._el.querySelector('#sh-btn-open-settings')?.click();
                break;
            case 'e':
                e.preventDefault();
                this._el.querySelector('#sh-btn-open-episodes')?.click();
                break;
            // Toute touche de navigation (flèches, Entrée, Espace, Échap, Retour)
            // est désormais gérée EXCLUSIVEMENT par SpatialNavigation → handleNavAction().
        }
    }

    /**
     * Prépare les vignettes du titre courant.
     *
     * Appelée après la négociation, quand on connaît la source média réellement
     * lue : l'API indexe les planches par `mediaSourceId`, et se tromper de
     * source donne un 404.
     *
     * @param {Object} item
     */
    _preparerVignettes(item) {
        try {
            const dispo = this._trickplay.preparer(item, this._mediaSourceId);
            this._el?.querySelector('#sh-timeline-apercu')?.classList.toggle('disponible', dispo);
        } catch (err) {
            this._log.debug('Vignettes indisponibles :', err?.message || err);
        }
    }

    /**
     * Affiche la vignette correspondant à un instant.
     *
     * Volontairement tolérante : si le serveur n'a pas généré de planches, ou
     * si celle-ci n'est pas encore chargée, l'aperçu reste vide et l'infobulle
     * horaire suffit. Une prévisualisation absente ne doit jamais gêner le
     * déplacement du curseur.
     *
     * @param {number} secondes
     */
    _afficherVignette(secondes) {
        const apercu = this._el?.querySelector('#sh-timeline-apercu');
        if (!apercu || !this._trickplay.disponible) return;

        const pos = this._trickplay.positionner(secondes);
        const dim = this._trickplay.dimensions;
        if (!pos || !dim) return;

        // Le chargement est asynchrone ; le curseur, lui, continue de bouger.
        // On note quelle vignette est demandée pour ignorer une planche qui
        // arriverait après que l'utilisateur a déjà bougé ailleurs — sinon
        // l'aperçu clignote en affichant des images périmées.
        const demande = `${pos.tuile}:${pos.colonne}:${pos.ligne}`;
        this._vignetteDemandee = demande;

        this._trickplay.planche(pos.tuile).then((img) => {
            if (!img || this._vignetteDemandee !== demande) return;
            const el = this._el?.querySelector('#sh-timeline-apercu');
            if (!el) return;
            el.style.width = `${dim.largeur}px`;
            el.style.height = `${dim.hauteur}px`;
            el.style.backgroundImage = `url("${img.src}")`;
            el.style.backgroundPosition = `-${pos.colonne * dim.largeur}px -${pos.ligne * dim.hauteur}px`;
            el.classList.add('visible');
        });
    }

    /**
     * Ouvre — ou ferme — l'écran de musique selon ce qu'on lit.
     *
     * Un morceau lu dans un lecteur vidéo donne un rectangle noir : techniquement
     * correct, visuellement vide. L'écran de musique prend cette place avec la
     * pochette, le fond flouté et les paroles, et laisse la barre de commandes
     * accessible par-dessus.
     *
     * Le basculement se fait à CHAQUE titre, dans les deux sens : passer d'un
     * album à un film doit refermer l'écran, sinon la pochette resterait posée
     * sur la vidéo.
     *
     * @param {object} item
     */
    _basculerModeMusique(item) {
        const ecran = svc.ecranMusique?.();
        if (!ecran) return;
        const musical = item?.Type === 'Audio' || item?.MediaType === 'Audio';
        if (!musical) { ecran.fermer(); return; }
        // L'hôte n'existe qu'une fois le lecteur monté : on le fournit ici
        // plutôt qu'à la construction, où `this._el` est encore nul.
        ecran.definirHote(() => this._el);
        ecran.ouvrir(item).catch(() => { /* pas de paroles : ce n'est pas une panne */ });
    }

    /**
     * Publie la position courante auprès du système.
     *
     * Ne fait rien tant que la durée n'est pas connue : `SessionMedia` efface
     * alors l'état plutôt que d'annoncer une durée nulle — un direct n'a pas de
     * barre de progression, et en afficher une vide serait un mensonge.
     */
    _publierPosition() {
        if (!this._video) return;
        this._sessionMedia.position({
            duree: this._video.duration,
            position: this._video.currentTime,
            vitesse: this._video.playbackRate,
        });
    }

    /**
     * Décrit le titre en cours au système et pose les boutons de la
     * notification.
     *
     * Toutes les actions retombent sur `_executerActionMedia` : le casque
     * Bluetooth et la télécommande du téléviseur empruntent le même chemin, il
     * n'y a donc qu'un seul comportement à vérifier.
     *
     * @param {object} item  le média lancé.
     */
    _brancherSessionMedia(item) {
        if (!this._sessionMedia.supporte) return;

        const titre = item?.Name || item?.title || 'Lecture';
        // Un épisode se lit « Série — S1E4 » : sur l'écran verrouillé, le seul
        // nom d'épisode ne dit pas de quelle série il s'agit.
        const saison = item?.ParentIndexNumber;
        const episode = item?.IndexNumber;
        let sousTitre = item?.SeriesName || '';
        if (sousTitre && Number.isFinite(saison) && Number.isFinite(episode)) {
            sousTitre += ` — S${saison}E${episode}`;
        }
        if (!sousTitre && item?.ProductionYear) sousTitre = String(item.ProductionYear);

        const id = item?.SeriesId || item?.Id || item?.id;
        const vignette = id ? (this._api?.getImageUrl?.(id, 'Primary') || '') : '';

        this._sessionMedia.decrire({ titre, sousTitre, vignette });

        this._sessionMedia.brancher({
            play: () => this._executerActionMedia(ActionMedia.PLAY),
            pause: () => this._executerActionMedia(ActionMedia.PAUSE),
            stop: () => this._executerActionMedia(ActionMedia.STOP),
            previoustrack: () => this._executerActionMedia(ActionMedia.PREVIOUS),
            nexttrack: () => this._executerActionMedia(ActionMedia.NEXT),
            // `seekOffset` est optionnel : sans lui, la convention du Web est
            // dix secondes, pas les trente de la télécommande.
            seekbackward: (d) => this._seekRelative(-(d?.seekOffset || 10)),
            seekforward: (d) => this._seekRelative(d?.seekOffset || 10),
            seekto: (d) => {
                if (!this._video || !Number.isFinite(d?.seekTime)) return;
                // `fastSeek` existe pour le glissement continu de la barre
                // système : il évite un décodage complet à chaque position.
                if (d.fastSeek && typeof this._video.fastSeek === 'function') {
                    this._video.fastSeek(d.seekTime);
                } else {
                    this._video.currentTime = d.seekTime;
                }
                this._publierPosition();
            },
        });
    }

    /**
     * Exécute une action média venue de la télécommande.
     *
     * Chaque action fait ce que l'utilisateur attend, et affiche un retour
     * visuel : sur un téléviseur, sans confirmation à l'écran, on ne sait pas
     * si l'appui a été pris en compte.
     *
     * @param {string} action  Une valeur de `ActionMedia`.
     */
    _executerActionMedia(action) {
        if (!this._video) return;
        switch (action) {
            case ActionMedia.PLAY_PAUSE:
                this._togglePlayPause();
                this._showFlashOSD(this._video.paused ? '⏸' : '▶', this._video.paused ? 'Pause' : 'Lecture');
                break;
            case ActionMedia.PLAY:
                this._video.play().catch(() => {});
                this._showFlashOSD('▶', 'Lecture');
                break;
            case ActionMedia.PAUSE:
                this._video.pause();
                this._showFlashOSD('⏸', 'Pause');
                break;
            case ActionMedia.STOP:
                this.close();
                break;
            case ActionMedia.REWIND:
                this._seekRelative(-30);
                this._showFlashOSD('⏪', '−30 s');
                break;
            case ActionMedia.FAST_FORWARD:
                this._seekRelative(+30);
                this._showFlashOSD('⏩', '+30 s');
                break;
            case ActionMedia.NEXT:
                if (this._nextEpisode) this.play(this._nextEpisode);
                else this._showFlashOSD('⏭', 'Aucun épisode suivant');
                break;
            case ActionMedia.PREVIOUS:
                // Convention universelle des lecteurs : au-delà de trois
                // secondes, « précédent » revient au début du titre courant
                // plutôt que de passer au précédent.
                if ((this._video.currentTime || 0) > 3) {
                    this._video.currentTime = 0;
                    this._showFlashOSD('⏮', 'Retour au début');
                } else {
                    const precedent = this._queue?.previous?.();
                    if (precedent) this.play(precedent);
                    else { this._video.currentTime = 0; this._showFlashOSD('⏮', 'Retour au début'); }
                }
                break;
        }
    }

    _reloadCurrentSourceWithOptions(partialOptions = {}) {
        if (!this._currentItem || !this._video) return;
        const positionTicks = Math.round((this._video.currentTime || 0) * 10000000);
        const options = { ...this._playbackOptions, ...partialOptions };
        this.play(this._currentItem, positionTicks, options);
    }

    _togglePlayPause() {
        if (!this._video) return;
        if (this._video.paused) {
            this._video.play().catch(error => this._log.warn('Lecture impossible:', error));
        } else {
            this._video.pause();
        }
    }

    async _resolveAndPlaySeries(item) {
        const seriesId = item?.Id || item?.id;
        if (!seriesId || !this._api) return;
        try {
            const next = await this._api.getNextUp?.(seriesId);
            if (next) {
                this.play(next);
                return;
            }
            const episodes = await this._api.getEpisodes?.(seriesId);
            const first = Array.isArray(episodes)
                ? episodes.find(episode => !episode.UserData?.Played) || episodes[0]
                : null;
            if (first) this.play(first);
            else this._log.warn('Aucun épisode disponible pour cette série.');
        } catch (error) {
            this._log.warn('Impossible de résoudre le prochain épisode:', error);
        }
    }

    _renderDrawerContent() {
        this._renderPopoversContent();
        this._updateEpisodeNavButtons();
    }

    _escapeUrl(value) {
        // Peau 2 : logique pure extraite vers UtilitairesLecteur.js ;
        // le talon reste, la surface interne ne bouge pas.
        return utilitairesLecteur.echapperUrl(value);
    }

    _setVolumeDelta(delta) {
        if (!this._video) return;
        const newVol = Math.max(0, Math.min(1, this._video.volume + delta));
        this._video.volume = newVol;
        this._video.muted = false;
        this._volume = newVol;
        const slider = this._el?.querySelector('#sh-volume-range');
        if (slider) slider.value = String(newVol);
        this._showFlashOSD(newVol === 0 ? '🔇' : '🔊', `${Math.round(newVol * 100)}%`, newVol);
    }

    _reportPlaybackStart() {
        const itemId = this._currentItem.Id || this._currentItem.id;
        const serverUrl = this._auth?.getServerUrl();
        if (!serverUrl || !itemId) return;

        fetchAvecDelai(`${serverUrl}/Sessions/Playing`, {
            method: 'POST',
            headers: this._auth?.getAuthHeaders(),
            body: JSON.stringify({
                ItemId: itemId,
                MediaSourceId: this._mediaSourceId || itemId,
                PlaySessionId: this._playSessionId || undefined,
                PlayMethod: this._playMethod || 'DirectStream',
                PositionTicks: this._playbackStartTicks || Math.round((this._video?.currentTime || 0) * 10000000)
            })
        }).catch(e => this._log.debug('Report play start failed:', e));
    }

    _startProgressReporting() {
        if (this._progressInterval) clearInterval(this._progressInterval);
        this._progressInterval = setInterval(() => {
            if (!this._video || this._video.paused) return;
            const itemId = this._currentItem.Id || this._currentItem.id;
            const serverUrl = this._auth?.getServerUrl();
            if (!serverUrl || !itemId) return;

            const ticks = Math.round((this._video.currentTime || 0) * 10000000);
            fetchAvecDelai(`${serverUrl}/Sessions/Playing/Progress`, {
                method: 'POST',
                headers: this._auth?.getAuthHeaders(),
                body: JSON.stringify({
                    ItemId: itemId,
                MediaSourceId: this._mediaSourceId || itemId,
                PlaySessionId: this._playSessionId || undefined,
                PlayMethod: this._playMethod || 'DirectStream',
                    PositionTicks: ticks,
                    IsPaused: this._video.paused
                })
            }).catch(() => {});
        }, 10000);
    }

    _reportPlaybackStopped() {
        const itemId = this._currentItem?.Id || this._currentItem?.id;
        const serverUrl = this._auth?.getServerUrl();
        if (!serverUrl || !itemId || !this._video) return;

        const ticks = Math.round((this._video.currentTime || 0) * 10000000);
        fetchAvecDelai(`${serverUrl}/Sessions/Playing/Stopped`, {
            method: 'POST',
            headers: this._auth?.getAuthHeaders(),
            body: JSON.stringify({
                ItemId: itemId,
                MediaSourceId: this._mediaSourceId || itemId,
                PlaySessionId: this._playSessionId || undefined,
                PlayMethod: this._playMethod || 'DirectStream',
                PositionTicks: ticks
            })
        }).catch(() => {});
    }

    
    /**
     * Reçoit et exécute les actions de navigation émises par SpatialNavigation ou GamepadInput
     * @param {string} action - Action (play_pause, left, right, up, down, select, back, menu)
     */
    /**
     * Reçoit et exécute les actions de navigation contextuelles de SpatialNavigation
     * @param {string} action - Action NavAction
     */
handleNavAction(action) {
        // Un maintien se caracterise par des impulsions rapprochees. Sans cette
        // remise a zero, deux appuis espaces de 10 s etaient vus comme un maintien
        // de 10 s et provoquaient un saut de 300 s.
        const nowTs = Date.now();
        if (this._navHoldLastTick && nowTs - this._navHoldLastTick > 250) {
            this._navHoldAction = null;
            this._navHoldStart = 0;
        }
        this._navHoldLastTick = nowTs;

        if (!this._el) return;

        // Réveil du HUD si masqué (repris de l'ancien _onKeyDown)
        if (!this._visibilite.visibles()) {
            this._showControls();
            this._resetIdleTimer();
            this._el.querySelector('#sh-btn-play-pause')?.focus();
            return;
        }
        this._resetIdleTimer();

        // 0. Popover ouvert — priorité absolue (repris de la section A de l'ancien _onKeyDown)
        const openPopover = this._el.querySelector('.sh-player-popover.open');
        if (openPopover) {
            this._handlePopoverNav(action, openPopover);
            return;
        }

        const timeline = this._el.querySelector('#sh-player-timeline-focus');
        const topBackBtn = this._el.querySelector('#sh-btn-back, #sh-player-btn-back');
        const active = document.activeElement;

        // Suivi de la durée d'appui maintenu, reconstruit sans e.repeat
        if (action === this._navHoldAction) {
            // action répétée : on ne touche pas _navHoldStart, l'accélération continue
        } else {
            this._navHoldAction = action;
            this._navHoldStart = Date.now();
        }
        const holdTime = Date.now() - this._navHoldStart;

        // 1. Timeline focusée
        if (active === timeline) {
            if (action === 'left' || action === 'right') {
                let step = 5;
                if (holdTime > 5000) step = 300;
                else if (holdTime > 3000) step = 60;
                else if (holdTime > 1000) step = 30;
                this._seekRelative(action === 'right' ? step : -step);
                return;
            }
            if (action === 'down') { this._el.querySelector('#sh-btn-play-pause')?.focus(); return; }
            if (action === 'up') { (topBackBtn || this._el.querySelector('#sh-btn-back'))?.focus(); return; }
            if (action === 'select') { this._togglePlayPause(); return; }
        }

        // 2. Topbar (bouton retour)
        if (active === topBackBtn) {
            if (action === 'down') { (timeline || this._el.querySelector('#sh-btn-play-pause'))?.focus(); return; }
            if (action === 'select') { this.close(); return; }
        }

        // 3. Boutons du dock
        const dockButtons = Array.from(this._el.querySelectorAll(
            '#sh-btn-prev-ep, #sh-btn-skip-back, #sh-btn-play-pause, #sh-btn-skip-fwd, #sh-btn-next-ep, #sh-btn-next-trailer, #sh-btn-volume, #sh-btn-open-audio-subs, #sh-btn-open-settings, #sh-btn-open-episodes, #sh-btn-fullscreen'
        )).filter(el => el.offsetParent !== null && window.getComputedStyle(el).display !== 'none');
        const curIdx = dockButtons.indexOf(active);
        if (curIdx !== -1) {
            if (action === 'left' && curIdx > 0) { dockButtons[curIdx - 1].focus(); return; }
            if (action === 'right' && curIdx + 1 < dockButtons.length) { dockButtons[curIdx + 1].focus(); return; }
            if (action === 'up') { (timeline || topBackBtn)?.focus(); return; }
            if (action === 'down' && active.classList.contains('sh-dock-pill-btn')) { active.click(); return; }
            if (action === 'select') { active.click(); return; }

            // Audit 1.12 — un bouton du dock est focalisé : la direction est
            // CONSOMMÉE même si elle ne mène nulle part. Sans ce garde-fou,
            // « gauche » sur le premier bouton et « bas » sur un bouton non-pilule
            // retombaient dans le switch global : reculer de 10 s ou changer le
            // volume alors que l'utilisateur cherchait seulement à se déplacer.
            if (action === 'left' || action === 'right' || action === 'down') return;
        }

        // 4. Actions globales (aucun élément spécifique focusé)
        switch (action) {
            case 'play_pause': this._togglePlayPause(); break;
            case 'left': this._seekRelative(-10); break;
            case 'right': this._seekRelative(+10); break;
            case 'up': this._setVolumeDelta(+0.05); break;
            case 'down': this._setVolumeDelta(-0.05); break;
            case 'select': this._togglePlayPause(); break;
            case 'back':
            case 'menu': this.close(); break;
        }
    }

    _handlePopoverNav(action, openPopover) {
        const items = Array.from(openPopover.querySelectorAll('.sh-popover-item, .sh-chip-btn, .sh-sync-btn, .sh-popover-ep-card, button:not([disabled])'));
        const focused = document.activeElement;
        const curIdx = items.indexOf(focused);

        if (action === 'back' || action === 'menu') {
            this._closeAllPopovers();
            const triggerBtn = openPopover.closest('.sh-dock-popover-anchor')?.querySelector('.sh-dock-pill-btn');
            triggerBtn?.focus();
            return;
        }
        if (action === 'down') {
            const next = (curIdx === -1 || curIdx + 1 >= items.length) ? items[0] : items[curIdx + 1];
            next?.focus();
            next?.scrollIntoView({ behavior: comportementDefilement(), block: 'nearest' });
            return;
        }
        if (action === 'up') {
            const prev = curIdx <= 0 ? items[items.length - 1] : items[curIdx - 1];
            prev?.focus();
            prev?.scrollIntoView({ behavior: comportementDefilement(), block: 'nearest' });
            return;
        }
        if (action === 'left' || action === 'right') {
            const audioCol = openPopover.querySelector('#sh-player-audio-list')?.closest('.sh-popover-col');
            const subsCol = openPopover.querySelector('#sh-player-subs-list')?.closest('.sh-popover-col');
            if (audioCol && subsCol) {
                if (action === 'right' && audioCol.contains(focused)) {
                    const target = subsCol.querySelector('.sh-popover-item.selected, .sh-popover-item, .sh-sync-btn');
                    target?.focus();
                    target?.scrollIntoView({ behavior: comportementDefilement(), block: 'nearest' });
                } else if (action === 'left' && subsCol.contains(focused)) {
                    const target = audioCol.querySelector('.sh-popover-item.selected, .sh-popover-item');
                    target?.focus();
                    target?.scrollIntoView({ behavior: comportementDefilement(), block: 'nearest' });
                }
            }
            return;
        }
        if (action === 'select' && focused && openPopover.contains(focused)) {
            focused.click();
        }
    }


    close(exitFullscreen = true) {
        // La lecture s'arrête : rendre la main au système. Sans cette
        // libération, la notification survit au lecteur et ses boutons
        // appellent un lecteur détruit.
        this._verrouEcran?.liberer();
        this._sessionMedia?.liberer();
        svc.ecranMusique?.()?.fermer?.();
        this._secondePubliee = -1;
        if (this._minuteurStats) { clearInterval(this._minuteurStats); this._minuteurStats = null; }
        if (!this._el) return;

        this._navHoldAction = null;
        this._reportPlaybackStopped();

        if (this._progressInterval) clearInterval(this._progressInterval);
        this._visibilite.nettoyer();
        if (this._nextEpCountdownInterval) clearInterval(this._nextEpCountdownInterval);

        // Lecture hors ligne : mémoriser où on s'est arrêté (le serveur ne peut
        // pas le savoir), puis révoquer l'object URL. Sans cette révocation le
        // Blob reste référencé et le navigateur ne libère pas la place, même
        // après suppression du téléchargement.
        if (this._urlHorsLigne) {
            const secondes = this._video?.currentTime || 0;
            const id = this._currentItem?.Id || this._currentItem?.id;
            if (id && secondes > 0) {
                svc.offlineStore()?.memoriserPosition?.(id, secondes).catch(() => {});
            }
            URL.revokeObjectURL(this._urlHorsLigne);
            this._urlHorsLigne = null;
        }

        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }

        const elToClose = this._el;
        const videoToClose = this._video;
        const hlsToClose = this._hls;
        const mediaObjectUrlToClose = this._mediaObjectUrl;
        this._playGeneration += 1;
        const sourceItem = this._sourceMediaItem || this._currentItem;
        elToClose.classList.add('sh-player--exiting');

        // Le nœud reste dans le document pendant l'animation de sortie
        // (320 ms). Il faut donc lever le confinement et le rendre INERTE tout
        // de suite : sans cela, `LAYERS.player` continuait de matcher, le
        // scope courant restait « player », `handleNavAction` sortait aussitôt
        // sur `if (!this._el) return`, et pendant un tiers de seconde plus
        // aucune flèche ne faisait quoi que ce soit. Sur un téléviseur lent le
        // délai est bien plus long, et l'utilisateur martèle la touche.
        delete elToClose.dataset.navContainer;
        elToClose.setAttribute('inert', '');

        this._hls = null;
        this._mediaObjectUrl = null;
        this._el = null;
        this._video = null;
        this._currentItem = null;
        this._sourceMediaItem = null;
        this._playbackOptions = {};
        this._playbackStartTicks = 0;
        this._appliedSubOffset = 0.0;

        this._closeTimer = setTimeout(() => {
            this._closeTimer = null;
            hlsToClose?.destroy?.();
            if (videoToClose) {
                videoToClose.pause();
                videoToClose.removeAttribute('src');
                videoToClose.load();
            }
            if (mediaObjectUrlToClose) URL.revokeObjectURL(mediaObjectUrlToClose);

            if (exitFullscreen && document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }

            const anotherPlayerIsActive = Boolean(document.querySelector('#sh-grand-cinema-player'));
            if (!anotherPlayerIsActive) document.body.classList.remove('sh-cinema-active');
            elToClose.remove();

            // Ne pas rouvrir la fiche si un nouveau player a déjà remplacé celui-ci.
            if (anotherPlayerIsActive) {
                this._closeTimer = null;
                return;
            }
            if (sourceItem && svc.slideUpSheet()) {
                svc.slideUpSheet().open(sourceItem);
            } else {
                const nav = svc.nav() || svc.appLayout()?._spatialNav;
                nav?.onModalClosed?.();
            }
            this._closeTimer = null;
        }, 320);
    }

    _formatTime(seconds) {
        // Peau 2 : extraite vers UtilitairesLecteur.js.
        return utilitairesLecteur.formaterTemps(seconds);
    }

    _escape(str) {
        // Peau 2 : extraite vers UtilitairesLecteur.js.
        return utilitairesLecteur.echapperHtml(str);
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans VideoPlayer.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default VideoPlayer;
