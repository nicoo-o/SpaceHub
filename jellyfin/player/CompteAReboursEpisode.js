/**
 * Compte à rebours « épisode suivant » — extrait de VideoPlayer.js (peau 3).
 * ===========================================================================
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * La carte « épisode suivant » (affiche + minuteur de cinq secondes + passage
 * automatique) est un sous-système autonome : un état local minuscule et une
 * frontière d'événements nette. Sa logique de minuterie se teste très bien
 * hors classe — c'est la peau 3 de la décomposition
 * (docs/DECOMPOSITION_VIDEOPLAYER.md).
 *
 * Ce qui reste sur le lecteur : les gardes (`_nextEpisode`, `_nextEpCancelled`),
 * le DOM (carte, chiffre affiché) et le déclencheur de lecture. Ce qui vit
 * ici : le FORMAT du titre et la MÉCANIQUE du minuteur, en injections
 * étroites (`surTick`, `surZero`, et les fonctions de minuterie remplaçables
 * pour que les tests pilotent le temps sans attendre une seconde réelle).
 *
 * Le comportement reproduit à l'identique la version d'origine :
 *   - le chiffre affiché commence à 5, puis décrémente une fois par seconde ;
 *   - à zéro, `surZero` est appelé UNE fois et le minuteur s'arrête ;
 *   - `demarrer` repart toujours de zéro, sans minuteur fantôme ;
 *   - `arreter` ne laisse aucun intervalle vivant.
 */

/**
 * Titre de la carte : « S01E02 · « Nom » », avec les mêmes replis que
 * l'original (saison ou numéro absents → 01, nom absent → « Épisode suivant »).
 *
 * @param {{ ParentIndexNumber?: number, IndexNumber?: number, Name?: string }} episode
 * @returns {string}
 */
export function formaterTitreEpisode(episode) {
    const saison = String(episode.ParentIndexNumber || 1).padStart(2, '0');
    const numero = String(episode.IndexNumber || 1).padStart(2, '0');
    return `S${saison}E${numero} · « ${episode.Name || 'Épisode suivant'} »`;
}

/**
 * Crée le minuteur du compte à rebours. L'objet rendu est le seul détenteur
 * de l'intervalle et du compteur : personne ne peut laisser un intervalle
 * orphelin en lisant un champ par mégarde.
 *
 * @param {object} options
 * @param {(restant: number) => void} options.surTick  chiffre à afficher
 * @param {() => void} options.surZero                 moment du passage auto
 * @param {typeof setInterval} [options.setIntervalFn] injection pour les tests
 * @param {typeof clearInterval} [options.clearIntervalFn] injection pour les tests
 * @param {number} [options.dureeMs]                   pas du minuteur (1000)
 * @returns {{ demarrer(): void, arreter(): void, actif: boolean, restant: number }}
 */
export function creerCompteARebours(injections) {
    const { surTick, surZero, setIntervalFn = setInterval, clearIntervalFn = clearInterval, dureeMs = 1000 } = injections;
    let intervalle = null;
    let restant = 5;

    const arreter = () => {
        if (intervalle !== null) {
            clearIntervalFn(intervalle);
            intervalle = null;
        }
    };

    return {
        demarrer() {
            // Un redémarrage (nouvel épisode, double déclenchement) repart de
            // zéro : l'ancien intervalle meurt ici, jamais ailleurs.
            arreter();
            restant = 5;
            surTick(restant);
            intervalle = setIntervalFn(() => {
                restant -= 1;
                surTick(restant);
                if (restant <= 0) {
                    arreter();
                    surZero();
                }
            }, dureeMs);
        },
        arreter,
        get actif() {
            return intervalle !== null;
        },
        get restant() {
            return restant;
        },
    };
}