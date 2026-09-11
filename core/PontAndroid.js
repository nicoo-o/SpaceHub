/**
 * SpaceHub — Pont Android (Cordova)
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * L'APK embarque le site statique mais ne lui parlait JAMAIS : aucun
 * `cordova.js` (le pont natif de Cordova), aucun `deviceready`, aucun
 * `backbutton`. Conséquence la plus dure : le bouton retour système tuait
 * l'application même avec une fiche média ouverte — le geste le plus utilisé
 * d'un téléphone, et le plus destructeur.
 *
 * Ce module fait le pont, et il est SILENCIEUX hors APK :
 *
 *   - le script `cordova.js` n'existe que dans la bobine Android (injecté à
 *     l'empaquetage par scripts/preparer-bobines.mjs) ; sur le web et dans
 *     Electron il n'y a pas de script — aucune balise, aucune 404 ;
 *   - sans Cordova (web, Electron, TV), ce module ne fait littéralement rien
 *     : pas d'écouteur, pas d'interface posée, pas de log. Il est chargé
 *     partout pour que l'APK soit la SEULE variante à avoir un pont.
 *
 * Le retour système suit la décision documentée : couche ouverte = la
 * fermer (MÊME pipeline que la touche Retour du téléviseur — reprise de
 * l'ordre BACK_ORDER éprouvé, pas une nouvelle logique) ; aucune couche =
 * quitter l'application. Un second appui dans les 2 s confirme la sortie
 * (une destruction immédiate après un glissement mal calibré est une action
 * destructrice sans confirmation — réglage par un toast d'avertissement).
 */

'use strict';

import Logger from './Logger.js';

/** Délai (ms) pendant lequel un second « retour » confirme la sortie. */
const DELAI_DOUBLE_RETOUR = 2000;

/**
 * Le pont Cordova est-il disponible ? Test en trois temps : la présence du
 * script injecté, l'objet `cordova` qu'il définit, et l'événement
 * `deviceready` qui garantit que les API natives sont prêtes.
 */
function cordovaDisponible() {
    return typeof window !== 'undefined' && typeof window.cordova !== 'undefined';
}

class PontAndroid {
    constructor({ logger = new Logger('PontAndroid'), demandeRetour = null } = {}) {
        this._log = logger;
        this._demandeRetour = demandeRetour;   // injecté : SpatialNavigation
        this._pret = false;
        this._minuteurSortie = null;
        this._offRetour = null;
    }

    /**
     * Installe le pont. Sûr à appeler partout : hors APK, il ne fait rien.
     * En APK, attend `deviceready` avant d'écouter le bouton retour —
     * s'abonner AVANT la readiness est le cas documenté où le geste de
     * navigation système arrive pendant que la WebView démarre encore.
     *
     * @param {{ demandeRetour?: () => boolean }} deps
     */
    init({ demandeRetour } = {}) {
        if (demandeRetour) this._demandeRetour = demandeRetour;
        if (!cordovaDisponible()) {
            // Pas une panne : c'est le web, Electron ou la TV. Le pont n'a
            // rien à y faire, et le dire à chaque démarrage serait du bruit.
            this._log.debug('Cordova absent : pont Android inactif (web/Electron/TV).');
            return this;
        }
        document.addEventListener('deviceready', () => this._surPret(), { once: true });
        return this;
    }

    _surPret() {
        this._pret = true;
        this._log.info('Pont Android prêt — bouton retour système branché.');

        // cordova-android achemine le geste/g bouton vers `backbutton` dès le
        // démarrage ; par défaut la plateforme FERME l'activité — on ne peut
        // l'empêcher qu'en s'abonnant. Un seul abonnement, jamais retiré :
        // le pont vit autant que l'application.
        document.addEventListener('backbutton', (e) => this._surRetour(e), false);
    }

    /**
     * Retour système : couche ouverte → la fermer via le pipeline TV
     * (demandeRetour renvoie true s'il a fermé quelque chose) ; aucune
     * couche → confirmation de sortie en 2 s, puis fermeture de l'app.
     */
    _surRetour(e) {
        const ferme = this._demandeRetour?.();
        if (ferme) {
            this._annulerSortie();
            return;
        }

        // Aucune couche : première pression = avertissement ; seconde dans
        // le délai = sortie. `navigator.app.exitApp()` est la voie Cordova.
        if (this._minuteurSortie) {
            this._annulerSortie();
            navigator.app?.exitApp?.();
            return;
        }
        try { navigator.vibrate?.(30); } catch (_) { /* cosmétique */ }
        this._log.info('Retour système sans couche ouverte — second appui pour quitter.');
        document.dispatchEvent(new CustomEvent('spacehub:quitter-suggere'));
        this._minuteurSortie = setTimeout(() => {
            this._minuteurSortie = null;
        }, DELAI_DOUBLE_RETOUR);
        // Empêche la fermeture immédiate par la plateforme pendant la fenêtre
        // de confirmation.
        e?.preventDefault?.();
    }

    _annulerSortie() {
        if (this._minuteurSortie) {
            clearTimeout(this._minuteurSortie);
            this._minuteurSortie = null;
        }
    }

    /** Le pont est-il connecté à une plateforme native ? */
    estActif() {
        return this._pret;
    }

    /**
     * Attache le moteur de navigation (SpatialNavigation) dont `demandeRetour()`
     * est le pipeline de fermeture. Séparé de init() parce que le moteur est
     * créé APRÈS le pont — le geste retour pouvant arriver pendant le
     * démarrage, le pont s'arme d'abord et répond `false` (confirmation de
     * sortie) tant qu'aucun moteur n'est branché.
     */
    brancherMoteur(moteur) {
        this._demandeRetour = moteur?.demandeRetour?.bind(moteur) || this._demandeRetour;
    }

    /** Retire l'écouteur retour (utile aux tests ; l'app ne l'appelle pas). */
    detruire() {
        this._annulerSortie();
        if (this._pret && typeof document !== 'undefined') {
            document.removeEventListener('backbutton', this._surRetourArme || (() => {}));
        }
        this._offRetour?.();
        this._offRetour = null;
    }
}

export default PontAndroid;
