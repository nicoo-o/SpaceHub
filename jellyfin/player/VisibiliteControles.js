/**
 * Visibilité des contrôles & OSD flash — extrait de VideoPlayer.js (peau 5).
 * ===========================================================================
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * L'axe « activité / idle » du lecteur : le HUD se montre à l'activité, se
 * cache seul après 3,5 s sans interaction, et le flash OSD (icône + texte +
 * éventuelle barre de progression) annonce les actions pendant 1,4 s. C'est
 * un sous-système cohérent, autonome, câblé aux mêmes événements que les
 * popovers — c'est la peau 5 de la décomposition
 * (docs/DECOMPOSITION_VIDEOPLAYER.md).
 *
 * CE QUI RESTE SUR LE LECTEUR
 * ---------------------------
 * Le DOM (`_el`, `_video`), le tiroir latéral (`_isDrawerOpen`) et tous les
 * appels d'origine : `_showFlashOSD`, `_onUserActivity`, `_showControls`,
 * `_hideControls`, `_resetIdleTimer` restent des talons de délégation — la
 * surface publique est inchangée (CibleDistante appelle `_showControls`).
 *
 * CE QUI VIT ICI
 * --------------
 * Les minuteurs (`_idleTimer`, `_osdTimer`) et le drapeau
 * `_isControlsVisible` : l'objet rendu est leur SEUL détenteur — personne ne
 * peut laisser un minuteur orphelin ou lire un état périmé par mégarde. Les
 * injections sont des fonctions, jamais l'instance du lecteur : le module ne
 * peut ni lire ni écrire un champ du lecteur.
 *
 * Le comportement reproduit à l'identique la version d'origine :
 *   - le flash OSD réarme son minuteur de 1,4 s à chaque annonce (la
 *     relance de l'animation passe par le reflow `void offsetWidth`) ;
 *   - le HUD ne se cache que si la vidéo joue et que le tiroir est fermé ;
 *   - la veille de 3,5 s est un minuteur unique, réarmé à chaque activité ;
 *   - `nettoyer()` ne laisse aucun minuteur vivant (appelé à la fermeture).
 */

/**
 * Crée la visibilité des contrôles câblée sur UNE instance de lecteur.
 *
 * @param {object} injections
 * @param {() => HTMLElement|null} injections.obtenirEl      racine du lecteur
 * @param {() => HTMLVideoElement|null} injections.obtenirVideo  vidéo (garde pause)
 * @param {() => boolean} injections.estTiroirOuvert         garde tiroir
 * @param {typeof setTimeout} [injections.setTimeoutFn]      horloge injectable
 * @param {typeof clearTimeout} [injections.clearTimeoutFn]  horloge injectable
 * @returns {{ visibles(): boolean, montrerFlashOSD(icon: string, text: string, progressPct?: number|null): void,
 *            surActivite(): void, montrerControles(): void, cacherControles(): void,
 *            reinitialiserMinuterie(): void, nettoyer(): void }}
 */
export function creerVisibiliteControles(injections) {
    const {
        obtenirEl,
        obtenirVideo,
        estTiroirOuvert,
        setTimeoutFn = setTimeout,
        clearTimeoutFn = clearTimeout,
    } = injections;

    const DUREE_FLASH_OSD_MS = 1400;
    const VEILLE_HUD_MS = 3500;

    let osdTimer = null;
    let idleTimer = null;
    let controlesVisibles = true;

    const api = {
        /** Le HUD est-il visible ? (garde des raccourcis clavier du lecteur.) */
        visibles() {
            return controlesVisibles;
        },

        montrerFlashOSD(icon, text, progressPct = null) {
            const osd = obtenirEl()?.querySelector('#sh-player-osd');
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

            // Relance de l'animation : retirer la classe, forcer le reflow,
            // la reposer — sinon la seconde annonce n'anime plus.
            osd.classList.remove('active');
            void osd.offsetWidth;
            osd.classList.add('active');

            if (osdTimer) clearTimeoutFn(osdTimer);
            osdTimer = setTimeoutFn(() => {
                osd.classList.remove('active');
            }, DUREE_FLASH_OSD_MS);
        },

        surActivite() {
            api.montrerControles();
            api.reinitialiserMinuterie();
        },

        montrerControles() {
            if (!controlesVisibles) {
                controlesVisibles = true;
                obtenirEl()?.classList.remove('hud-hidden');
            }
        },

        cacherControles() {
            const video = obtenirVideo();
            if (video && !video.paused && !estTiroirOuvert()) {
                controlesVisibles = false;
                obtenirEl()?.classList.add('hud-hidden');
            }
        },

        reinitialiserMinuterie() {
            if (idleTimer) clearTimeoutFn(idleTimer);
            idleTimer = setTimeoutFn(() => api.cacherControles(), VEILLE_HUD_MS);
        },

        nettoyer() {
            if (osdTimer) clearTimeoutFn(osdTimer);
            if (idleTimer) clearTimeoutFn(idleTimer);
            osdTimer = null;
            idleTimer = null;
        },
    };

    return api;
}