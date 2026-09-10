# Décomposition de VideoPlayer.js — registre

`VideoPlayer.js` est le monolithe le plus critique du dépôt : il concentre la
lecture, les transports, la session de rapport Jellyfin, les popovers, les
segments média et les interactions télécommande. Sa décomposition suit la
règle établie dans `docs/CONTRIBUTING.md` (les monolithes ne grandissent plus ;
on n'extrait une responsabilité que lorsqu'on la touche) et le pattern éprouvé
par les gabarits `*.template.js`.

## La méthode, identique à chaque étape

1. **Étape 0 — le filet.** Un test de contrat de façade
   (`tests/FacadeLecteur.test.js`) fige la liste exacte des membres de
   `VideoPlayer` appelés de l'extérieur (modules frères, tests, greffons).
   Tant que ce test passe, aucune peau extraite ne peut retirer un membre
   qu'un appelant réel utilise.
2. **Étape 1 — la peau.** La logique quitte la classe vers un module satellite
   (`jellyfin/player/…`) en fonctions pures ou à injections étroites ; l'ÉTAT
   reste sur le lecteur. Chaque méthode d'origine reste en place comme
   talon de délégation — la surface publique est inchangée, l'extraction est
   invisible pour les appelants comme pour les tests de logique existants.
3. **Le budget baisse dans le même commit.** `scripts/taille-monolithes-check.mjs`
   reçoit le nouveau plafond : le contrat interdit désormais de regrossir.
4. **La chaîne verte avant tout atterrissage** : tests unitaires, contrats,
   build, poids, e2e sur deux générations de Chromium.

## Étapes atterries

| Étape | Périmètre | Référence | État |
|---|---|---|---|
| 0 | Filet de façade : `tests/FacadeLecteur.test.js` (3 tests — la liste exacte des membres appelés de l'extérieur, plus la sémantique d'état `_segmentsMedia` : `null` = pas encore interrogé) | PR #13, commit squashé `402979a` | ✅ 2026-09-09 |
| 1 | Segments média : `MediaSegments` (typés Intro/Outro/Recap…), priorités, repli chapitres, skip actionnable → `jellyfin/player/SegmentsMedia.js` (192 lignes). Talons conservés : `_chargerSegmentsMedia`, `_segment`, `_segmentActionnableA`, `_passerSegment`, `_getIntroInterval`, `_performSkipIntro`. Budget : 2578 → **2537** | PR #13, commit squashé `402979a` | ✅ 2026-09-09 |
| 2 | Helpers purs : formatage de temps, échappement HTML, assainissement d'URL, animation bouton → `jellyfin/player/UtilitairesLecteur.js`. Talons conservés : `_formatTime`, `_escape`, `_escapeUrl`, `_animateButtonSpring`. Budget : 2537 → **2524** | PR #20 | ✅ 2026-09-10 |
<<<<<<< HEAD
| 3 | Compte à rebours « épisode suivant » : `formaterTitreEpisode` (titre SxxExx) et la mécanique du minuteur (départ à 5, décrément, passage auto à zéro, annulation, redémarrage sans intervalle fantôme) → `jellyfin/player/CompteAReboursEpisode.js` (93 lignes). Talons conservés : `_showNextEpCard`, `_startNextEpCountdown`, `_cancelNextEpCountdown`, `_hideNextEpCard`. Budget : 2524 → **2518** | (branche `decomp/videoplayer-peel3`) | ✅ 2026-09-10 |
| 4 | Popovers & tirage du contenu : bascule (ouvrir referme, contenu rendu à l'ouverture) et les quatre panneaux (audio/sous-titres + stepper de synchro, réglages vitesse/aspect, versions, épisodes) → `jellyfin/player/PopoversContenu.js` (275 lignes). Talons conservés : `_togglePopover`, `_closeAllPopovers`, `_renderPopoversContent`, `_renderAudioSubsPopover`, `_renderSettingsPopover`, `_renderVersionsPopover`, `_renderEpisodesPopover`. Budget : 2524 → **2374** | (branche `decomp/videoplayer-peel4`) | ✅ 2026-09-10 |
| 5 | OSD & visibilité des contrôles : flash OSD (icône/texte/barre de progression, animation relancée par reflow, minuteur 1,4 s réarmé à chaque annonce) et l'axe activité/idle du HUD (montrer, cacher gardé par pause/tiroir, veille 3,5 s réarmée) → `jellyfin/player/VisibiliteControles.js` (134 lignes). Talons conservés : `_showFlashOSD`, `_onUserActivity`, `_showControls`, `_hideControls`, `_resetIdleTimer`. Budget : 2524 → **2500** | (branche `decomp/videoplayer-peel5`) | ✅ 2026-09-10 |

Note sur les références : les deux commits d'étape (`215b32f`, `f118ffa`)
existent dans la branche de travail, supprimée après la fusion squash — la
référence durable est le commit squashé `402979a` (PR #13), qui porte les deux
étapes et le budget abaissé dans le même arbre.

Preuves de l'étape 1 : `tests/SegmentsMedia.test.js` (14 tests) passe
**inchangé** contre le module extrait ; le contrat de façade tient (3 tests) ;
chaîne complète verte (564 tests au total, 27/27 e2e à l'époque, plafond 2537
verrouillé).

Preuves de l'étape 3 : `tests/CompteAReboursEpisode.test.js` (9 tests) exerce
la mécanique du minuteur sur une horloge fausse — aucun test existant n'a
changé, le contrat de façade tient, budget 2518 verrouillé dans le même
commit que la peau.

## Ordre d'extraction confirmé pour la suite

Chaque peau ci-dessous est une responsabilité cohésive déjà repérable dans le
fichier, une taille raisonnable pour un geste unique, et peu de dépendances
avec les suivantes. L'ordre minimise les conflits : on commence par ce qui ne
touche ni la session réseau ni le DOM du shell.

| Ordre | Étape | Périmètre candidat | Pourquoi cet ordre |
|---|---|---|---|
| — | ~~2~~ **Formatage & petites puretés** | ~~`_formatTime`, `_escapeUrl`, `_animateButtonSpring`, `_triggerRippleSkip`, utilitaires de ticks~~ | ✅ **Atterrie (peau 2, PR #20)** — ajustée : `_triggerRippleSkip` reste dans la classe (comportement câblé, pas une pureté) ; `_escape` rejoint le lot. |
<<<<<<< HEAD
| — | ~~3~~ **Compte à rebours « épisode suivant »** | ~~`_showNextEpCard`, `_startNextEpCountdown`, `_cancelNextEpCountdown`, `_hideNextEpCard`~~ | ✅ **Atterrie (peau 3, branche `decomp/videoplayer-peel3`)** — le minuteur (départ à 5, décrément par seconde, passage auto à zéro) est extrait en injections étroites (`surTick`, `surZero`), testé sur horloge fausse ; le titre SxxExx est une fonction pure. |
| — | ~~4~~ **Popovers & tirage du contenu** | ~~`_togglePopover`, `_closeAllPopovers`, `_render*Popover` (audio/sous-titres, réglages, versions, épisodes)~~ | ✅ **Atterrie (peau 4, branche `decomp/videoplayer-peel4`)** — 150 lignes sorties du monolithe en une passe : l'usine `creerPopovers` ne reçoit que des accesseurs/actions, tout l'état et les effets restent sur le lecteur. Les sous-peaux annoncées n'ont pas été nécessaires. |
| — | ~~5~~ **OSD & visibilité des contrôles** | ~~`_showFlashOSD`, `_onUserActivity`, `_showControls`, `_hideControls`, `_resetIdleTimer`~~ | ✅ **Atterrie (peau 5, branche `decomp/videoplayer-peel5`)** — le module détient les deux minuteurs et le drapeau de visibilité (seul détenteur, comme le minuteur de la peau 3) ; le lecteur ne garde que le DOM, la vidéo et le tiroir, passés en injections ; tests sur horloge fausse. |
| 6 | **Rapport de session Jellyfin** | `_reportPlaybackStart`, `_startProgressReporting`, `_reportPlaybackStopped`, `_publierPosition`, `_brancherSessionMedia` | Dépend de l'auth et du réseau, pas de l'UI ; à extraire d'un bloc car ces méthodes se tiennent (cycle de vie complet d'une session). |
| 7 | **Chargement de la source** | `_fallbackDirectStream`, `_initMediaStreams`, `_resolveMaxBitrate`, `_authoriseUrl`, `_reloadCurrentSourceWithOptions` | Le cœur réseau de la lecture — le plus risqué, donc en dernier, quand le filet a fait ses preuves sur six gestes ; les talons garantissent la compatibilité pendant la transition. |
| — | Hors périmètre | `_bindEvents`, `_createPlayerDOM`, le constructeur | L'assemblage reste dans la classe : c'est le rôle d'un façade. La décomposition s'arrête quand VideoPlayer ne fait plus que monter des modules. |

## Non-négociables (rappel)

- Aucun membre public ne disparaît ni ne change de signature sans échec du
  contrat de façade d'abord.
- Les tests de logique existants d'un sous-système doivent passer **inchangés**
  contre le module extrait ; s'ils doivent changer, l'extraction n'est pas
  invisible et le geste est faux.
- Une peau = une branche = un PR = la chaîne verte, budget abaissé dans le
  même commit que la peau.
