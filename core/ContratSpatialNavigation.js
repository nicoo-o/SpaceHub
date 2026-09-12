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
 * Et une atteinte par variable renommée (`const m = nav; m._x`) échappe comme
 * toujours au balayage mécanique — la revue reste le dernier gardien.
 */

/**
 * Méthodes publiques réellement appelées de l'extérieur.
 *
 * CE QUE CETTE LISTE ÉTAIT DEVENUE, ET POURQUOI ELLE A DOUBLÉ
 * ----------------------------------------------------------
 * Elle déclarait SIX membres. `scripts/facade-appelants-check.mjs` n'observait
 * que les atteintes privées (`nav._x`) : une méthode publique absente d'ici
 * pouvait donc être retirée par une extraction sans qu'aucun contrôle ne
 * bronche — l'appelant perdait sa cible en silence.
 *
 * Le contrôle sait maintenant observer les membres publics, et il a trouvé dix
 * absents de cette liste, tous réellement appelés : l'enregistrement des
 * focusables, le cycle de vie des couches, la mémoire de focus, le diagnostic
 * et le pont Android. La liste est donc devenue ce qu'elle prétendait être —
 * la surface que le monde extérieur touche vraiment.
 *
 * Chaque entrée dit QUI l'appelle : c'est ce qui permet, dans six mois, de
 * savoir si elle sert encore. Ajouter un membre ici est une décision explicite
 * et committée, jamais un effet de bord d'un appelant pressé.
 */
export const MEMBRES_APPELABLES = Object.freeze([
    // ── Position ──────────────────────────────────────────────────────────
    'setFocus',             // NavTestHarness, e2e, CarouselController, AppLayout, feuille
    'focusFirst',           // NavTestHarness, e2e, AppLayout
    'restorePreviousFocus', // AppSidebarDrawer (fermeture d'un tiroir)
    'pushFocus',            // UnifiedSearch (un seul point de retour)

    // ── Enregistrement des focusables ─────────────────────────────────────
    'extendFocusables',     // Modal, SettingsPanel, LibraryView, DownloadsView, UnifiedSearch
    'registerFocusables',   // AppSidebarDrawer, VideoPlayer
    'getFocusables',        // NavTestHarness, e2e

    // ── Cycle de vie des couches ──────────────────────────────────────────
    'onModalOpened',        // Modal, feuille, tiroir, assistance, panneaux
    'onModalClosed',        // Modal, tiroir, SettingsPanel, LibraryView, VideoPlayer, TouchEngine
    'onLayerClosed',        // Modal, UnifiedSearch
    'pushLayer',            // UnifiedSearch (couche nommée sans focus)

    // ── Diagnostic (HUD de développement) ─────────────────────────────────
    'activerDiagnostic',    // DebugHud
    'dernierDiagnostic',    // DebugHud, e2e
    'getFocusedElement',    // DebugHud, HeroSpotlightComponent

    // ── Périphériques et retour ───────────────────────────────────────────
    'getGamepad',           // SpaceHub (démarrage)
    'demandeRetour',        // PontAndroid (pipeline Retour TV + bouton système)
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