/**
 * SpaceHub — Routeur d'entrée clavier
 * Version: 1.0.0
 *
 * Le problème qu'il résout
 * -----------------------
 * L'application posait treize écouteurs `keydown` indépendants. Trois sont
 * attachés à un élément précis (une carte, un badge, le champ de recherche) et
 * sont légitimes : ils ne concernent que leur élément. Les neuf autres étaient
 * globaux — sur `window` ou `document` — et se partageaient le clavier sans
 * qu'aucun ne sache que les autres existaient.
 *
 * Leur ordre d'exécution n'était écrit nulle part. Il résultait de deux choses
 * invisibles à la lecture : la phase de propagation (un écouteur sur `document`
 * s'exécute avant un écouteur sur `window`) et l'ordre de construction des
 * modules au démarrage. Autrement dit, déplacer une ligne d'initialisation
 * pouvait changer la touche Échap de destinataire, sans qu'aucun test ne le
 * voie. C'est exactement le bogue qui a fait fermer la mauvaise couche.
 *
 * Ce que fait ce module
 * ---------------------
 * Un seul écouteur de bas niveau, en phase de capture, et une liste de
 * gestionnaires **triés par une priorité déclarée**. L'ordre devient une donnée
 * du code, lisible et testable, au lieu d'un effet de bord du démarrage.
 *
 * Un gestionnaire qui a traité la touche renvoie `true` : la distribution
 * s'arrête là. C'est l'équivalent explicite du `stopPropagation()` que
 * certains modules appelaient — sauf qu'ici, on sait qui s'arrête et pourquoi.
 *
 * Ce qu'il ne fait pas
 * --------------------
 * Il ne décide pas à la place des gestionnaires. Chacun garde sa logique
 * exacte, y compris ses propres gardes (« suis-je ouvert ? », « l'utilisateur
 * saisit-il du texte ? »). La migration devait être sans changement de
 * comportement ; enrichir les gestionnaires au passage aurait rendu toute
 * régression impossible à attribuer.
 */

'use strict';

import Logger from './Logger.js';

/**
 * Priorités déclarées, du plus prioritaire au moins prioritaire.
 *
 * Ces valeurs reproduisent l'ordre effectif observé avant la migration ; elles
 * ne le réinventent pas. Le gain n'est pas un ordre différent, c'est un ordre
 * **écrit**.
 */
export const PRIORITES = {
    /** Ctrl+K et « / » : la recherche capturait déjà l'événement en premier. */
    search: 100,
    /** Piégeage du focus (Tab) d'une modale ouverte. */
    modal: 90,
    analytics: 85,
    /** Raccourcis du lecteur vidéo, actifs seulement quand il est ouvert. */
    player: 80,
    /** Fenêtre bande-annonce : Échap la ferme. */
    trailer: 75,
    /** Sous-état local de la feuille : le popover audio. */
    slideUpSheet: 70,
    /** Touche « P » du hero. */
    hero: 60,
    /** Raccourcis applicatifs : Ctrl+Alt+A, Ctrl+K. */
    router: 50,
    /** Moteur de navigation spatiale — toujours en dernier, c'est le repli. */
    navigation: 10,
};

class InputRouter {
    constructor() {
        this._log = new Logger('InputRouter');
        /** @type {Array<{nom: string, priorite: number, sur: string, gestionnaire: Function, ordre: number}>} */
        this._gestionnaires = [];
        this._compteur = 0;
        this._branche = false;
        this._surKeyDown = (e) => this._distribuer('keydown', e);
        this._surKeyUp = (e) => this._distribuer('keyup', e);
    }

    /**
     * Inscrit un gestionnaire.
     *
     * @param {string} nom            identifiant lisible, unique (« player », « modal:abc »)
     * @param {(e: KeyboardEvent) => boolean|void} gestionnaire
     *        renvoie `true` pour consommer l'événement et arrêter la distribution
     * @param {Object} [options]
     * @param {number} [options.priorite=0]  voir PRIORITES
     * @param {'keydown'|'keyup'} [options.sur='keydown']
     * @returns {() => void} fonction de désinscription — à appeler à la fermeture
     */
    inscrire(nom, gestionnaire, { priorite = 0, sur = 'keydown' } = {}) {
        if (typeof gestionnaire !== 'function') {
            this._log.error(`Gestionnaire « ${nom} » ignoré : ce n'est pas une fonction.`);
            return () => {};
        }
        // Une réinscription sous le même nom remplace l'ancienne. Sans cela, un
        // composant rouvert plusieurs fois empilerait ses gestionnaires et
        // traiterait chaque touche autant de fois qu'il a été ouvert.
        this.desinscrire(nom);

        this._gestionnaires.push({ nom, priorite, sur, gestionnaire, ordre: this._compteur++ });
        this._gestionnaires.sort((a, b) => (b.priorite - a.priorite) || (a.ordre - b.ordre));
        this._brancher();
        return () => this.desinscrire(nom);
    }

    /** Retire un gestionnaire par son nom. */
    desinscrire(nom) {
        const i = this._gestionnaires.findIndex(g => g.nom === nom);
        if (i !== -1) this._gestionnaires.splice(i, 1);
    }

    /** Noms inscrits, dans l'ordre de distribution. Sert aux tests et au diagnostic. */
    ordreDeDistribution(sur = 'keydown') {
        return this._gestionnaires.filter(g => g.sur === sur).map(g => g.nom);
    }

    _brancher() {
        if (this._branche || typeof window === 'undefined') return;
        // Capture : ce routeur doit voir la touche avant les écouteurs attachés
        // à un élément précis, comme le faisait la recherche auparavant.
        window.addEventListener('keydown', this._surKeyDown, true);
        window.addEventListener('keyup', this._surKeyUp, true);
        this._branche = true;
    }

    _distribuer(type, e) {
        for (const g of this._gestionnaires) {
            if (g.sur !== type) continue;
            try {
                if (g.gestionnaire(e) === true) return;
            } catch (err) {
                // Indispensable : avec un écouteur unique, une exception dans un
                // gestionnaire priverait de clavier tous ceux qui suivent — donc
                // la navigation entière. Chaque gestionnaire échoue seul.
                this._log.error(`Gestionnaire clavier « ${g.nom} » a échoué :`, err);
            }
        }
    }

    /** Détache tout. Utilisé par les tests et à l'extinction. */
    destroy() {
        if (this._branche && typeof window !== 'undefined') {
            window.removeEventListener('keydown', this._surKeyDown, true);
            window.removeEventListener('keyup', this._surKeyUp, true);
        }
        this._branche = false;
        this._gestionnaires = [];
    }
}

/**
 * Instance unique. Un routeur d'entrée par application : c'est tout l'intérêt.
 */
const inputRouter = new InputRouter();

export { InputRouter };
export default inputRouter;
