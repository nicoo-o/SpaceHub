/**
 * Chargement de la source — extrait de VideoPlayer.js (peau 7).
 * ===========================================================================
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Le cœur réseau de la lecture : construction de l'URL authentifiée, plafond
 * de débit annoncé au serveur, bascule sur le flux direct quand HLS échoue,
 * résolution des flux audio/sous-titres de l'item, et rechargement de la
 * source avec de nouvelles options (audio, sous-titres, version). C'est la
 * peau 7 de la décomposition (docs/DECOMPOSITION_VIDEOPLAYER.md) — la
 * dernière, la plus risquée : elle ne touche ni le DOM ni l'état visible,
 * et les talons garantissent la compatibilité pendant la transition.
 *
 * CE QUI RESTE SUR LE LECTEUR
 * ---------------------------
 * Tout l'état (item courant, vidéo, auth, réglages, génération de lecture,
 * vitesse, volume, options de lecture) et les effets (branchement du flux,
 * `play()`). Le module ne lit l'état qu'à travers des accesseurs injectés et
 * ne relance la lecture qu'à travers l'action `relancerLecture` : il ne peut
 * ni lire ni écrire un champ du lecteur.
 *
 * CE QUI VIT ICI
 * --------------
 * La construction des URLs (`api_key` sans doublon, flux statique de repli),
 * la règle du plafond de débit (explicite, puis estimation navigateur à
 * 75 %, rien en dessous de 2 Mb/s), et la résolution pure des flux de
 * l'item (`resoudreFlux` rend l'état à appliquer, le lecteur l'applique).
 *
 * Le comportement reproduit à l'identique la version d'origine, gardes et
 * ordre des vérifications compris.
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
 *
 * @param {string} url
 * @param {?string} token
 * @returns {string}
 */
export function authoriserUrl(url, token) {
    if (!token) return url;
    // Le serveur peut déjà avoir renvoyé une URL authentifiée : ne pas doubler.
    if (/[?&]api_key=/.test(url)) return url;
    return `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(token)}`;
}

/**
 * Crée le chargement de source câblé sur UNE instance de lecteur.
 *
 * @param {object} injections
 * @param {() => HTMLVideoElement|null} injections.obtenirVideo
 * @param {() => object|null} injections.obtenirItem         item courant
 * @param {() => object|null} injections.obtenirAuth         auth Jellyfin
 * @param {() => object|null} injections.obtenirSettings     réglages (débit max)
 * @param {() => object|null} injections.obtenirConnexion    navigator.connection
 * @param {() => number} injections.lireGeneration           génération de lecture
 * @param {() => number} injections.lireVitesse              vitesse de lecture
 * @param {() => number} injections.lireVolume               volume
 * @param {() => object} injections.lireOptions              options de lecture
 * @param {(item: object, positionTicks: number, options: object) => void} injections.relancerLecture
 * @param {() => object} injections.journal                  Logger du lecteur
 * @returns {{ resoudreDebitMax(): number, basculerFluxDirect(startPositionSeconds: number, token: ?string, generation: number): void,
 *            resoudreFlux(item: object): object, rechargerAvecOptions(partialOptions?: object): void }}
 */
export function creerChargementSource(injections) {
    const {
        obtenirVideo,
        obtenirItem,
        obtenirAuth,
        obtenirSettings,
        obtenirConnexion,
        lireGeneration,
        lireVitesse,
        lireVolume,
        lireOptions,
        relancerLecture,
        journal,
    } = injections;

    const api = {
        /**
         * Plafond de débit à annoncer au serveur, en bits par seconde.
         *
         * Trois cas :
         *   - un plafond explicite est réglé → on le respecte ;
         *   - le mode automatique est actif et le navigateur expose une
         *     estimation de débit descendant → on plafonne un peu en dessous,
         *     pour laisser de la marge au reste du réseau ;
         *   - sinon 0 : aucun plafond, le serveur reste libre de faire du
         *     DirectPlay.
         *
         * `navigator.connection` n'existe pas partout (absent sur Safari et
         * sur plusieurs navigateurs de téléviseurs) : l'absence renvoie
         * simplement 0, c'est-à-dire le comportement d'avant ce réglage.
         */
        resoudreDebitMax() {
            const reglages = obtenirSettings();
            const explicite = Number(reglages?.get?.('player.maxBitrate', 0)) || 0;
            if (explicite > 0) return explicite;
            if (reglages?.get?.('player.maxBitrateAuto', true) !== true) return 0;
            try {
                const lien = obtenirConnexion();
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
        },

        /**
         * Bascule sur le flux direct statique — le repli quand hls.js échoue
         * ou que la lecture native ne sait pas faire de HLS.
         */
        basculerFluxDirect(startPositionSeconds, token, generation) {
            const video = obtenirVideo();
            if (generation !== lireGeneration() || !video) return;
            const serverUrl = obtenirAuth()?.getServerUrl() || '';
            const item = obtenirItem();
            const itemId = item?.Id || item?.id;
            if (!serverUrl || !itemId) return;
            // Le flux natif ne peut pas recevoir de header : api_key est le seul
            // fallback compatible avec Safari lorsque Jellyfin n'a pas de cookie
            // de session exploitable.
            video.src = authoriserUrl(
                `${serverUrl}/Videos/${encodeURIComponent(itemId)}/stream?static=true`, token);
            video.currentTime = startPositionSeconds;
            video.playbackRate = lireVitesse();
            video.volume = lireVolume();
            video.play().catch((e) => journal()?.warn('Auto-play direct:', e));
        },

        /**
         * Résout les flux audio/sous-titres de l'item et leurs sélections par
         * défaut. REND l'état à appliquer — le lecteur l'applique, l'état
         * reste sur lui.
         *
         * @param {object} item
         * @returns {{ audioStreams: object[], subStreams: object[],
         *            selectedAudioIndex: number, selectedSubIndex: number }}
         */
        resoudreFlux(item) {
            const streams = item.MediaStreams || [];
            const audioStreams = streams.filter((s) => s.Type === 'Audio');
            const subStreams = streams.filter((s) => s.Type === 'Subtitle');

            const defaultAudio = audioStreams.find((s) => s.IsDefault) || audioStreams[0];
            const selectedAudioIndex = defaultAudio ? defaultAudio.Index : (audioStreams[0]?.Index ?? 0);

            const defaultSub = subStreams.find((s) => s.IsForced || s.IsDefault);
            const selectedSubIndex = defaultSub ? defaultSub.Index : -1;

            return { audioStreams, subStreams, selectedAudioIndex, selectedSubIndex };
        },

        /**
         * Recharge la source avec de nouvelles options (flux audio, sous-titres,
         * version), en reprenant à la position courante.
         */
        rechargerAvecOptions(partialOptions = {}) {
            const item = obtenirItem();
            const video = obtenirVideo();
            if (!item || !video) return;
            const positionTicks = Math.round((video.currentTime || 0) * 10000000);
            const options = { ...lireOptions(), ...partialOptions };
            relancerLecture(item, positionTicks, options);
        },
    };

    return api;
}