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

import Hls from 'hls.js';
import { gabaritLecteur } from './VideoPlayer.template.js';
import { negotiatePlayback } from './DeviceProfile.js';
import Logger from '../../core/Logger.js';

import './VideoPlayer.css';
import * as svc from '../../core/services.js';
import inputRouter, { PRIORITES } from '../../core/InputRouter.js';
class VideoPlayer {
    constructor() {
        this._log = new Logger('VideoPlayer');
        this._el = null;
        this._video = null;
        this._hls = null;
        this._currentItem = null;
        this._sourceMediaItem = null;
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
        this._idleTimer = null;
        this._isControlsVisible = true;
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
                    this._setupVideoSource(urlLocale, startPositionSeconds, '', this._playGeneration, false);
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

        this._setupVideoSource(streamUrl, startPositionSeconds, token, this._playGeneration, nego?.isHls);
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

    _setupVideoSource(streamUrl, startPositionSeconds, token, generation = this._playGeneration, isHls = true) {
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

        if (Hls.isSupported()) {
            if (this._hls) this._hls.destroy();
            this._hls = new Hls({
                capLevelToPlayerSize: true,
                autoStartLoad: true,
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

    _updateEpisodeNavButtons() {
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

        this._el.innerHTML = gabaritLecteur({ ...this, isEpisode, seriesName, episodeNumber, episodeTitle });

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
                    '#sh-btn-back, #sh-player-timeline-focus, #sh-btn-prev-ep, #sh-btn-skip-back, #sh-btn-play-pause, #sh-btn-skip-fwd, #sh-btn-next-ep, #sh-btn-volume, #sh-btn-open-audio-subs, #sh-btn-open-settings, #sh-btn-open-episodes, #sh-btn-fullscreen, .sh-popover-item'
                ));
            }, { force: true }); // re-registration volontaire (scope plus précis que le défaut de boot) — cf. plan A04
        }

        this._renderDrawerContent();

        if (this._el.requestFullscreen) {
            this._el.requestFullscreen().catch(() => {});
        }
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

        video.addEventListener('waiting', () => spinner?.classList.add('visible'));
        video.addEventListener('playing', () => spinner?.classList.remove('visible'));
        video.addEventListener('canplay', () => spinner?.classList.remove('visible'));
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

        el.querySelector('#sh-smart-skip-btn')?.addEventListener('click', () => {
            this._performSkipIntro();
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
        if (!btn) return;
        btn.classList.remove('spring-bounce');
        void btn.offsetWidth;
        btn.classList.add('spring-bounce');
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
                const res = await fetch(`${serverUrl}/Items/${itemId}/RemoteSearch/Subtitles/${lang}`, {
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
                            await fetch(`${serverUrl}/Items/${itemId}/RemoteSearch/Subtitles/${btn.dataset.subId}`, {
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
     * Détecte l'intervalle réel de l'introduction via les chapitres Jellyfin.
     * @param {Object} item
     * @returns {{ start: number, end: number } | null}
     */
    _getIntroInterval(item) {
        const chapters = item?.Chapters || [];
        for (let i = 0; i < chapters.length; i++) {
            const ch = chapters[i];
            const name = (ch.Name || '').toLowerCase();
            const isIntro = ch.ChapterType === 'Intro' || name.includes('intro') || name.includes('opening') || name.includes('générique');
            if (isIntro) {
                const startSec = (ch.StartPositionTicks || 0) / 10000000;
                let endSec = ch.EndPositionTicks ? (ch.EndPositionTicks / 10000000) : null;
                if (!endSec && i + 1 < chapters.length) {
                    endSec = (chapters[i + 1].StartPositionTicks || 0) / 10000000;
                }
                if (!endSec || endSec <= startSec) {
                    // Sans borne de fin fournie par Jellyfin, l'intervalle est ambigu.
                    // Ne pas inventer une durée d'introduction côté client.
                    continue;
                }
                return { start: startSec, end: endSec };
            }
        }
        // Sans chapitre explicite, aucune introduction ne peut être identifiée de manière fiable.
        return null;
    }

    _performSkipIntro() {
        const interval = this._getIntroInterval(this._currentItem);
        if (!interval || !this._video) return;
        this._video.currentTime = Math.min(this._video.duration || interval.end, interval.end);
        this._showFlashOSD('⏭️', 'Introduction passée');
        this._el?.querySelector('#sh-smart-skip-btn')?.classList.remove('visible');
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

        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        const elPlayed = this._el?.querySelector('#sh-timeline-played');
        const elHandle = this._el?.querySelector('#sh-timeline-handle');
        if (elPlayed) elPlayed.style.width = `${pct}%`;
        if (elHandle) elHandle.style.left = `${pct}%`;

        // 1. Bouton Passer l'introduction basé sur les chapitres réels
        const introInterval = this._getIntroInterval(this._currentItem);
        const skipBtn = this._el?.querySelector('#sh-smart-skip-btn');
        if (introInterval && cur >= introInterval.start && cur < introInterval.end) {
            skipBtn?.classList.add('visible');
        } else {
            skipBtn?.classList.remove('visible');
        }

        // 2. Carte & Countdown du prochain épisode
        if (dur > 45 && rem <= 30 && this._nextEpisode) {
            this._showNextEpCard();
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
        const osd = this._el?.querySelector('#sh-player-osd');
        if (!osd) return;

        osd.querySelector('#sh-osd-icon').textContent = icon;
        osd.querySelector('#sh-osd-text').textContent = text;

        const barWrap = osd.querySelector('#sh-osd-bar-wrap');
        const barFill = osd.querySelector('#sh-osd-bar-fill');

        if (progressPct !== null) {
            barWrap.style.display = 'block';
            barFill.style.width = `${Math.round(progressPct * 100)}%`;
        } else {
            barWrap.style.display = 'none';
        }

        osd.classList.remove('active');
        void osd.offsetWidth;
        osd.classList.add('active');

        if (this._osdTimer) clearTimeout(this._osdTimer);
        this._osdTimer = setTimeout(() => {
            osd.classList.remove('active');
        }, 1400);
    }

    _onUserActivity() {
        this._showControls();
        this._resetIdleTimer();
    }

    _showControls() {
        if (!this._isControlsVisible) {
            this._isControlsVisible = true;
            this._el?.classList.remove('hud-hidden');
        }
    }

    _hideControls() {
        if (this._video && !this._video.paused && !this._isDrawerOpen) {
            this._isControlsVisible = false;
            this._el?.classList.add('hud-hidden');
        }
    }

    _resetIdleTimer() {
        if (this._idleTimer) clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => this._hideControls(), 3500);
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
        if (!this._isControlsVisible) return; // le réveil du HUD reste géré par handleNavAction

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
        const url = String(value || '').trim();
        if (!url) return '';
        try {
            const parsed = new URL(url, window.location.origin);
            if (!['http:', 'https:'].includes(parsed.protocol)) return '';
            return parsed.href.replace(/["'\\]/g, character => `\\${character}`);
        } catch {
            return '';
        }
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

        fetch(`${serverUrl}/Sessions/Playing`, {
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
            fetch(`${serverUrl}/Sessions/Playing/Progress`, {
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
        fetch(`${serverUrl}/Sessions/Playing/Stopped`, {
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
        if (!this._isControlsVisible) {
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
            '#sh-btn-prev-ep, #sh-btn-skip-back, #sh-btn-play-pause, #sh-btn-skip-fwd, #sh-btn-next-ep, #sh-btn-volume, #sh-btn-open-audio-subs, #sh-btn-open-settings, #sh-btn-open-episodes, #sh-btn-fullscreen'
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
            next?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
        if (action === 'up') {
            const prev = curIdx <= 0 ? items[items.length - 1] : items[curIdx - 1];
            prev?.focus();
            prev?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
        if (action === 'left' || action === 'right') {
            const audioCol = openPopover.querySelector('#sh-player-audio-list')?.closest('.sh-popover-col');
            const subsCol = openPopover.querySelector('#sh-player-subs-list')?.closest('.sh-popover-col');
            if (audioCol && subsCol) {
                if (action === 'right' && audioCol.contains(focused)) {
                    const target = subsCol.querySelector('.sh-popover-item.selected, .sh-popover-item, .sh-sync-btn');
                    target?.focus();
                    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else if (action === 'left' && subsCol.contains(focused)) {
                    const target = audioCol.querySelector('.sh-popover-item.selected, .sh-popover-item');
                    target?.focus();
                    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
            return;
        }
        if (action === 'select' && focused && openPopover.contains(focused)) {
            focused.click();
        }
    }


    close(exitFullscreen = true) {
        if (!this._el) return;

        this._navHoldAction = null;
        this._reportPlaybackStopped();

        if (this._progressInterval) clearInterval(this._progressInterval);
        if (this._idleTimer) clearTimeout(this._idleTimer);
        if (this._nextEpCountdownInterval) clearInterval(this._nextEpCountdownInterval);
        if (this._osdTimer) clearTimeout(this._osdTimer);

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
        if (isNaN(seconds) || seconds < 0) return '00:00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    _escape(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _injectStyles() {
        // Les styles de ce composant vivent désormais dans VideoPlayer.css,
        // importé en haut du fichier et empaqueté par Vite. Cette méthode est
        // conservée en no-op pour ne casser aucun appelant existant.
    }
}

export default VideoPlayer;
