/**
 * Le contrat de façade de SpatialNavigation — SOURCE DE VÉRITÉ UNIQUE.
 * =====================================================================
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * L'audit des monolithes (docs/AUDIT_MONOLITHES.md) a trouvé des atteintes
 * réelles vers les internes du moteur : le harnais de développement
 * (`core/dev/NavTestHarness.js` lit `_detectCurrentScope`) et le harnais
 * e2e (scripts/e2e.mjs PILOTE le moteur par l'intérieur : `_state`,
 * `_layerStack`, `_findSpatialTarget`, `_executeNavStep`, `_appliquerModalite`,
 * `_handleKeyDown`, `_handleMouseMove`, `_stopInputRepeat`). Ces harnais
 * sont les filets du moteur — ils prouvent son comportement en vrai
 * navigateur — mais leurs atteintes sont des dépendances réelles : si une
 * future extraction renomme un interne, c'est le harnais qui casse.
 *
 * Ce module fige donc la surface EXACTE que le monde extérieur touche :
 * les méthodes publiques réellement appelées, et les internes réellement
 * atteints par les harnais. Tant que ce contrat tient, une peau ne peut
 * pas retirer un membre qu'un harnais utilise.
 *
 * CE QU'IL NE COUVRE PAS
 * ----------------------
 * Les tests unitaires de la classe elle-même (SpatialNavigation.test.js et
 * ses voisins) : ils TESTENT le moteur, ils n'y sont pas des appelants.
 */

/** Méthodes publiques réellement appelées de l'extérieur. */
export const MEMBRES_APPELABLES = Object.freeze([
    'setFocus',         // NavTestHarness, e2e
    'getFocusables',    // NavTestHarness, e2e
    'focusFirst',       // NavTestHarness, e2e
    'onModalOpened',    // AppLayout (couches ouvertes sans harnais)
    'onModalClosed',    // AppLayout, VideoPlayer
    'dernierDiagnostic', // e2e (HUD)
]);

/**
 * Internes atteints par les harnais — à protéger comme la surface publique.
 * `_state` et `_layerStack` sont des CHAMPS (pas des méthodes) : l'atteinte
 * se fait par lecture/écriture, le filet vérifie leur présence.
 */
export const CHAMPS_ATTEINTS = Object.freeze([
    '_state',               // e2e — focusedElement, mode
    '_layerStack',          // e2e — pile de couches
    '_detectCurrentScope',  // NavTestHarness — diagnostic du scope courant
    '_findSpatialTarget',   // e2e — recherche de cible
    '_executeNavStep',      // e2e — un pas de navigation
    '_appliquerModalite',   // e2e — clavier/souris
    '_handleKeyDown',       // e2e — touche réelle
    '_handleMouseMove',     // e2e — souris réelle
    '_stopInputRepeat',     // e2e — fin de répétition
]);

/** Tout ce qu'un appelant extérieur a le droit de toucher, réuni. */
export const SURFACE_NAV = Object.freeze([
    ...MEMBRES_APPELABLES,
    ...CHAMPS_ATTEINTS,
]);