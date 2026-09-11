/**
 * SpaceHub — Profil d'appareil
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'application cible trois usages — ordinateur, téléviseur, mobile — mais
 * aucune couche ne savait sur laquelle elle tournait. Résultat : le dock
 * « Dynamic Island » se déployait au survol de souris (un téléphone n'en a
 * pas), les cibles tactiles étaient élargies par des règles CSS sans équivalent
 * JS, et toute adaptation mobile à venir aurait fini en `if (estMobile)`
 * dispersés — la prolifération de booléens que le code de TV (TvModeManager,
 * `html.sh-tv-mode`) a su éviter en posant UN marqueur déclaratif sur
 * l'élément racine.
 *
 * Le même motif, transposé au mobile :
 *
 *   - **un seul endroit** sait comment un appareil est détecté (ce module) ;
 *   - **un seul marqueur** publie le verdict (`html.sh-gsm`, posé au boot) ;
 *   - **le CSS écrit le reste** : sous `html.sh-gsm` et
 *     `(hover: none) and (pointer: coarse)`, jamais autrement ;
 *   - le JavaScript des composants demande `estGsm()` à ce module, il ne
 *     refait pas la détection lui-même.
 *
 * Trois profils, mutuellement exclusifs :
 *
 *   - `televisions` — tout ce que `detecterPlateforme()` (TelecommandeTv)
 *     reconnaît : tizen, webos, firetv, androidtv ;
 *   - `gsm` — écran tactile sans pointeur fin ET.userAgent téléphone Android ;
 *     Android SANS « Mobile » est une tablette, profil `gsm` aussi : la barre
 *     de navigation basse y est le bon geste au-dessus de ~600 dp, et le
 *     moteur spatial n'y a pas d'usage réel ;
 *   - `bureau` — tout le reste, y compris un écran tactile branché à une
 *     souris : l'expérience PC prime.
 *
 * Le piège historique : l'UA d'Android TV contient « Android ». D'où l'ordre —
 * la détection TV d'abord, parce qu'elle est la plus précise ; la détection
 * tactile ensuite. `detecterPlateforme()` est réutilisé, pas copié : si demain
 * il apprend une plateforme, ce module suit sans modification.
 *
 * L'horloge de détection : `(hover: none) and (pointer: coarse)` décrit un
 * appareil PRIMAIRE à écran tactile. Un écran tactile secondaire ne suffit pas
 * — c'est voulu : la souris reste l'entrée principale et le profil bureau
 * l'emporte. La détection est réécoutée (`change` de matchMedia) : un écran
 * pliable passe de bureau à gsm et inversement sans recharger la page.
 *
 * Forçage : le réglage `ui.forceProfil` (`''` par défaut, sinon `gsm` ou
 * `bureau`) prime sur la détection — même esprit que `ui.tvMode`. Il sert aux
 * tests et à l'acceptation sur appareil réel sans toucher au code.
 */

'use strict';

import Logger from './Logger.js';

/** Les quatre plateformes TV reconnues par TelecommandeTv. */
const PLATEFORMES_TV = new Set(['tizen', 'webos', 'firetv', 'androidtv']);

/** UA Android téléphone : « Android » ET le jeton « Mobile ». */
const UA_ANDROID_GSM = /Android.*Mobile/;

/** UA Android tablette : « Android » sans le jeton « Mobile ». */
const UA_ANDROID_TABLETTE = /Android(?!.*Mobile)/;

/**
 * Détecte le profil d'un appareil, sans état ni effet de bord.
 *
 * @param {object} deps
 * @param {() => boolean} [deps.estTelecommandeTv]   plateforme TV reconnue ?
 * @param {(q: string) => boolean} [deps.mediaQuery] réponse matchMedia
 * @param {() => string} [deps.userAgent]            navigator.userAgent
 * @returns {'gsm'|'bureau'}
 */
export function detecterProfilAppareil(deps = {}) {
    // Déstructuration évitée volontairement : le contrôle des méthodes
    // fantômes ne voit pas à travers les paramètres déstructurés, et des
    // valeurs par défaut ici sont équivalentes.
    const estTelecommandeTv = deps.estTelecommandeTv || (() => false);
    const mediaQuery = deps.mediaQuery || (() => false);
    const userAgent = deps.userAgent || (() => (typeof navigator !== 'undefined' ? navigator.userAgent : ''));

    // 1. TV d'abord : le plus précis, et l'UA Android TV contient « Android ».
    if (estTelecommandeTv()) return 'bureau';

    const tactileSansSouris = mediaQuery('(hover: none) and (pointer: coarse)');

    // 2. Tactile sans pointeur fin : gsm si Android (téléphone OU tablette).
    if (tactileSansSouris && (UA_ANDROID_GSM.test(userAgent()) || UA_ANDROID_TABLETTE.test(userAgent()))) {
        return 'gsm';
    }

    // 3. Tout le reste — souris, écran tactile avec pointeur fin, desktop —
    //    est bureau : l'expérience PC prime.
    return 'bureau';
}

/**
 * Représentation interne : le nom du profil HTML retenu pour la détection
 * dynamique. Public pour les tests.
 *
 * @param {'gsm'|'bureau'} profil
 * @returns {string|null} le marqueur à poser sur <html>, ou null
 */
export function marqueurPour(profil) {
    return profil === 'gsm' ? 'sh-gsm' : null;
}

class ProfilAppareil {
    constructor({
        logger = new Logger('ProfilAppareil'),
        settings = null,
        estTelecommandeTv = null,
        matchMedia = null,
        userAgent = null,
        document = (typeof window !== 'undefined' ? window.document : null),
    } = {}) {
        this._log = logger;
        this._settings = settings;
        this._document = document;

        const ctx = {
            estTelecommandeTv: estTelecommandeTv || (() => PLATEFORMES_TV.has(detecterPlateformeSansImport())),
            mediaQuery: (q) => {
                if (matchMedia) return matchMedia(q);
                if (typeof window === 'undefined' || !window.matchMedia) return false;
                return window.matchMedia(q).matches;
            },
            userAgent: userAgent || (() => (typeof navigator !== 'undefined' ? navigator.userAgent : '')),
        };

        this._estTelecommandeTv = ctx.estTelecommandeTv;
        this._mediaQuery = ctx.mediaQuery;
        this._userAgent = ctx.userAgent;

        this._profil = 'bureau';
        this._desabonnements = [];
        this._initialise = false;
    }

    /**
     * Détecte, pose le marqueur HTML, s'abonne aux changements.
     * Appelé une fois au démarrage ; sans effet s'il l'est deux fois.
     */
    init() {
        if (this._initialise) return this;
        this._initialise = true;

        this._appliquer();
        this._ecouterChangements();
        this._log.info(`Profil d'appareil : ${this._profil}.`);
        return this;
    }

    /** Le profil courant : 'gsm' ou 'bureau'. */
    profil() {
        return this._profil;
    }

    /** L'appareil est-il un téléphone/tablette Android tactile ? */
    estGsm() {
        return this._profil === 'gsm';
    }

    /** L'appareil a-t-il un pointeur fin (souris, trackpad) ? */
    aSouris() {
        return !this._mediaQuery('(hover: none) and (pointer: coarse)');
    }

    /**
     * Recalcule le profil et pose/retire `html.sh-gsm`.
     * Idempotent : poser deux fois le même marqueur ne change rien.
     */
    _appliquer() {
        // Forçage : le réglage prime sur la détection (même esprit que
        // `ui.tvMode`). Valeur inconnue = ignorée, la détection repart.
        const force = this._settings?.get?.('ui.forceProfil', '');
        if (force === 'gsm' || force === 'bureau') {
            this._profil = force;
        } else {
            this._profil = detecterProfilAppareil({
                estTelecommandeTv: this._estTelecommandeTv,
                mediaQuery: this._mediaQuery,
                userAgent: this._userAgent,
            });
        }

        const racine = this._document?.documentElement;
        if (!racine) return;
        const marqueur = marqueurPour(this._profil);
        if (marqueur) racine.classList.add(marqueur);
        else racine.classList.remove('sh-gsm');
    }

    /** Réévalue le profil quand l'appareil change (écran pliable). */
    _ecouterChangements() {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mql = window.matchMedia('(hover: none) and (pointer: coarse)');
        const ecouteur = () => this._appliquer();
        // `addEventListener` (Chromium 55+) est ce que le plancher navigateur
        // garantit déjà ; `addListener` n'est plus nécessaire.
        mql.addEventListener('change', ecouteur);
        this._desabonnements.push(() => mql.removeEventListener('change', ecouteur));
    }

    /**
     * Branche la réactivité au réglage de forçage `ui.forceProfil` : quand
     * l'utilisateur (ou l'acceptation) change le réglage, le marqueur HTML
     * suit sans recharger. Appelé par SpaceHub une fois SettingsManager prêt
     * — à l'init() le réglage n'existe pas encore.
     *
     * @param {import('./EventBus.js').default} eventBus
     */
    brancherReglage(eventBus) {
        this._offReglage?.();
        this._offReglage = eventBus?.on?.('settings:changed', ({ key } = {}) => {
            if (key === 'ui.forceProfil') this._appliquer();
        });
    }

    /** Retire les écouteurs et le marqueur HTML. */
    detruire() {
        this._offReglage?.();
        this._offReglage = null;
        for (const off of this._desabonnements) off();
        this._desabonnements = [];
        this._document?.documentElement?.classList.remove('sh-gsm');
        this._initialise = false;
    }
}

/**
 * Détecte la plateforme sans importer TelecommandeTv (qui importe Logger, pas
 * de cycle, mais surtout : une dépendance de moins pour un module chargé tôt).
 * Même logique que `detecterPlateforme()` de TelecommandeTv — les deux listes
 * doivent rester d'accord ; le test unitaire le verrouille.
 *
 * @returns {'tizen'|'webos'|'firetv'|'androidtv'|'navigateur'}
 */
function detecterPlateformeSansImport() {
    if (typeof navigator === 'undefined') return 'navigateur';
    const ua = navigator.userAgent || '';
    if (typeof window !== 'undefined' && window.tizen) return 'tizen';
    if (/Tizen/i.test(ua)) return 'tizen';
    if (/Web0S|webOS/i.test(ua)) return 'webos';
    if (/AFT[A-Z]/i.test(ua)) return 'firetv';
    if (/Android TV|GoogleTV|BRAVIA/i.test(ua)) return 'androidtv';
    return 'navigateur';
}

export default ProfilAppareil;
