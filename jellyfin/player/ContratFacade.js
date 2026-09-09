/**
 * Le contrat de façade de VideoPlayer — SOURCE DE VÉRITÉ UNIQUE.
 * ================================================================
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * La décomposition du monolithe (docs/DECOMPOSITION_VIDEOPLAYER.md) repose
 * sur un contrat : la liste exacte des membres de `VideoPlayer` que le monde
 * extérieur a le droit de toucher. Deux gardiens l'appliquent :
 *
 *   - côté classe  : tests/FacadeLecteur.test.js — tout membre du contrat
 *     doit encore exister et répondre après chaque « peau » extraite ;
 *   - côté appelant: scripts/facade-appelants-check.mjs — aucun fichier hors
 *     de jellyfin/player/ ne doit atteindre un membre HORS contrat.
 *
 * Les deux importent CES listes : ajouter un membre au contrat est une
 * décision explicite, committée ici, visible dans la revue — jamais un
 * effet de bord discret d'un appelant pressé.
 *
 * POURQUOI DES MEMBRES EN UNDERSCORE
 * ----------------------------------
 * Les talons de délégation (`_togglePlayPause`, `_segment`…) portent un
 * underscore historique mais SONT la façade : `CibleDistante` et les tests
 * en dépendent, le filet les fige. Leur renommage est une évolution de
 * contrat, pas un détail d'implémentation.
 */

/** Méthodes que l'extérieur peut appeler (fonctions). */
export const MEMBRES_APPELABLES = Object.freeze([
    // Modules frères, temps réel (CibleDistante, SpatialNavigation…).
    'play', 'close', 'handleNavAction',
    '_togglePlayPause', '_seekRelative', '_executerActionMedia',
    '_showControls', '_reloadCurrentSourceWithOptions', '_toggleFullscreen',
    '_brancherSessionMedia', '_publierPosition',
    // Logique segments, unitairement testée par SegmentsMedia.test.js.
    '_chargerSegmentsMedia', '_segment', '_getIntroInterval',
    '_segmentActionnableA', '_passerSegment', '_performSkipIntro',
]);

/**
 * Champs d'état que l'extérieur peut lire, présents dès le constructeur.
 * `_video` est une tolérance DOCUMENTÉE : des atteintes existantes que le
 * filet enregistre — candidates à une vraie API publique si la décomposition
 * les rend faciles à exposer proprement.
 */
export const CHAMPS_TOLERES = Object.freeze([
    '_segmentsMedia',   // null = pas encore interrogé ; [] = interrogé, rien
    '_segmentsPourItem',
    '_intervalleIntro',
    '_segmentCourant',
    '_video',           // élément <video> — CibleDistante, MinuteurSommeil, SpaceHub
    '_playbackOptions', // lecture de isTrailer — TrailerService
]);

/**
 * Champs injectés APRÈS construction par l'intégrateur — absents d'une
 * instance neuve, ce qui est normal. `_queue` est le miroir de l'accesseur
 * public `queue`, affecté par core/SpaceHub.js au démarrage.
 */
export const CHAMPS_INJECTES = Object.freeze([
    '_queue',
]);

/** Propriétés publiques (accesseurs) que l'extérieur peut lire/écrire. */
export const PROPRIETES_PUBLIQUES = Object.freeze([
    'queue',
]);

/** Tout ce qu'un appelant extérieur a le droit de toucher, réuni. */
export const SURFACE_FACADE = Object.freeze([
    ...MEMBRES_APPELABLES,
    ...CHAMPS_TOLERES,
    ...CHAMPS_INJECTES,
    ...PROPRIETES_PUBLIQUES,
]);
