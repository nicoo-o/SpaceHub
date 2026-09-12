/**
 * SpaceHub — Historique de vues (mémoire du bouton retour)
 * Version: 1.0.0
 *
 * Pourquoi ce fichier existe
 * --------------------------
 * Le pont Android consultait deux choses : le pipeline de couches
 * (`SpatialNavigation.demandeRetour()`) puis la sortie de l'application. Sur
 * un téléphone, « Retour » depuis l'onglet Flux demandait donc confirmation de
 * sortie alors que l'utilisateur voulait revenir à sa bibliothèque — le geste
 * le plus utilisé d'Android était le seul sans mémoire.
 *
 * Ce module est cette mémoire, et il est PUR : aucun DOM, aucun service, aucune
 * horloge. C'est la condition pour la tester sans monter l'application.
 *
 * Le modèle est celui du navigateur, pas celui d'une pile naïve
 * ------------------------------------------------------------
 * Une pile qui se contente d'empiler la vue précédente oscille : Retour de
 * Flux vers Bibliothèques réenregistre Flux, le Retour suivant rend
 * Bibliothèques, et l'application ne propose plus jamais de sortir. Le modèle
 * retenu est une PISTE et une POSITION : Retour recule la position ; naviguer
 * à la main tronque ce qui suivait la position puis ajoute la nouvelle vue.
 * Une branche abandonnée disparaît, comme dans un navigateur.
 *
 * La navigation déclenchée par le Retour elle-même ne se réenregistre pas :
 * `precedente()` pose une attente que le premier `enregistrer()` consomme. Le
 * drapeau vit DANS l'objet, pas dans un champ temporaire de l'appelant — la
 * navigation traverse une file de promesses, et un drapeau posé à côté serait
 * déjà retombé quand elle s'exécute.
 */

'use strict';

/** Longueur maximale de la piste (une session TV ne s'éteint jamais). */
const LIMITE_DEFAUT = 20;

/**
 * @param {{ limite?: number }} [options]
 * @returns {{ enregistrer, precedente, profondeur, vider }}
 */
export function creerHistoriqueVues(options = {}) {
    const limite = Number.isFinite(options.limite) && options.limite > 0
        ? Math.floor(options.limite)
        : LIMITE_DEFAUT;

    let piste = [];
    let position = -1;
    let attenteRetour = false;

    return {
        /**
         * Enregistre une navigation DEMANDÉE par l'utilisateur (ou le routeur).
         * La navigation de retour passe par ici aussi : elle est reconnue et
         * ignorée, parce que `precedente()` a déjà déplacé la position.
         *
         * @param {string} vue
         */
        enregistrer(vue) {
            if (typeof vue !== 'string' || !vue) return;
            if (attenteRetour) {
                attenteRetour = false;
                return;
            }
            if (piste[position] === vue) return;

            piste = piste.slice(0, position + 1);
            piste.push(vue);
            position = piste.length - 1;

            if (piste.length > limite) {
                piste.shift();
                position -= 1;
            }
        },

        /**
         * La vue précédente, ou `null` s'il n'y a rien à défaire. Un appel
         * gagnant pose l'attente qui neutralise le prochain enregistrement.
         *
         * @returns {string|null}
         */
        precedente() {
            if (position <= 0) return null;
            position -= 1;
            attenteRetour = true;
            return piste[position];
        },

        /** Nombre d'entrées de la piste (diagnostic et tests). */
        profondeur() {
            return piste.length;
        },

        /** Oublie tout (déconnexion, destruction de la coquille). */
        vider() {
            piste = [];
            position = -1;
            attenteRetour = false;
        },
    };
}

export default creerHistoriqueVues;
