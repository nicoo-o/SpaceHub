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
 */
export const CHAMPS_TOLERES = Object.freeze([
    '_segmentsMedia',   // null = pas encore interrogé ; [] = interrogé, rien
    '_segmentsPourItem',
    '_intervalleIntro',
    '_segmentCourant',
    '_playbackOptions', // lecture de isTrailer — TrailerService
]);

/**
 * Propriétés publiques (accesseurs) que l'extérieur peut lire/écrire.
 * `videoElement` est en lecture seule (getter) : l'élément <video> appartient
 * au lecteur, personne ne doit pouvoir le remplacer. `queue` est une paire
 * get/set alimentée par core/SpaceHub.js au démarrage.
 */
export const PROPRIETES_PUBLIQUES = Object.freeze([
    'queue',
    'videoElement',
]);

/**
 * HISTORIQUE — ce qui n'est plus toléré, et pourquoi
 * --------------------------------------------------
 * `_video` et `_queue` étaient des tolérances DOCUMENTÉES : des atteintes
 * existantes que le filet enregistrait en attendant mieux. Elles ont été
 * remplacées par de vraies API publiques le 10 septembre 2026 :
 *
 *   - `_video` → accesseur `videoElement` (lecture seule).
 *     CibleDistante, MinuteurSommeil, SpaceHub lisent l'élément <video> ;
 *     personne n'a besoin de le remplacer.
 *   - `_queue` → paire d'accesseurs `queue` (get/set). Le miroir
 *     `player._queue = player.queue` posé par core/SpaceHub.js a disparu :
 *     l'affectation publique `player.queue = …` passe par le setter.
 *
 * Toute nouvelle atteinte à ces noms underscore échoue au contrôle côté
 * appelants : une API publique, ou rien.
 */

/** Tout ce qu'un appelant extérieur a le droit de toucher, réuni. */
export const SURFACE_FACADE = Object.freeze([
    ...MEMBRES_APPELABLES,
    ...CHAMPS_TOLERES,
    ...PROPRIETES_PUBLIQUES,
]);
