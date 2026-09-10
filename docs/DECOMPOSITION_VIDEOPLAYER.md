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
| 3 | Compte à rebours « épisode suivant » : `formaterTitreEpisode` (titre SxxExx) et la mécanique du minuteur (départ à 5, décrément, passage auto à zéro, annulation, redémarrage sans intervalle fantôme) → `jellyfin/player/CompteAReboursEpisode.js` (93 lignes). Talons conservés : `_showNextEpCard`, `_startNextEpCountdown`, `_cancelNextEpCountdown`, `_hideNextEpCard`. Budget : 2524 → **2518** | (branche `decomp/videoplayer-peel3`) | ✅ 2026-09-10 |
| 4 | Popovers & tirage du contenu : bascule (ouvrir referme, contenu rendu à l'ouverture) et les quatre panneaux (audio/sous-titres + stepper de synchro, réglages vitesse/aspect, versions, épisodes) → `jellyfin/player/PopoversContenu.js` (275 lignes). Talons conservés : `_togglePopover`, `_closeAllPopovers`, `_renderPopoversContent`, `_renderAudioSubsPopover`, `_renderSettingsPopover`, `_renderVersionsPopover`, `_renderEpisodesPopover`. Budget : 2524 → **2374** | (branche `decomp/videoplayer-peel4`) | ✅ 2026-09-10 |
| 5 | OSD & visibilité des contrôles : flash OSD (icône/texte/barre de progression, animation relancée par reflow, minuteur 1,4 s réarmé à chaque annonce) et l'axe activité/idle du HUD (montrer, cacher gardé par pause/tiroir, veille 3,5 s réarmée) → `jellyfin/player/VisibiliteControles.js` (134 lignes). Talons conservés : `_showFlashOSD`, `_onUserActivity`, `_showControls`, `_hideControls`, `_resetIdleTimer`. Budget : 2524 → **2500** | (branche `decomp/videoplayer-peel5`) | ✅ 2026-09-10 |
| 6 | Rapport de session Jellyfin & session média système : départ/progression (10 s, vidéo non en pause)/arrêt vers `/Sessions/Playing*`, description du titre et boutons média système (`play`, `pause`, `stop`, `previous`/`next`, `seek±`, `seekto` avec `fastSeek` puis republication) → `jellyfin/player/RapportSession.js` (242 lignes). Talons conservés : `_reportPlaybackStart`, `_startProgressReporting`, `_reportPlaybackStopped`, `_publierPosition`, `_brancherSessionMedia`. Budget : 2524 → **2435** | (branche `decomp/videoplayer-peel6`) | ✅ 2026-09-10 |
| 7 | Chargement de la source : URL authentifiée (`api_key` sans doublon), plafond de débit (explicite, puis 75 % de l'estimation navigateur, rien sous 2 Mb/s), bascule sur le flux statique de repli, résolution des flux audio/sous-titres, rechargement aux options fusionnées → `jellyfin/player/ChargementSource.js` (191 lignes). Talons conservés : `_fallbackDirectStream`, `_initMediaStreams`, `_resolveMaxBitrate`, `_authoriseUrl`, `_reloadCurrentSourceWithOptions`. Budget : 2524 → **2476** | (branche `decomp/videoplayer-peel7`) | ✅ 2026-09-10 |

## Bilan de la décomposition (10 septembre 2026)

Le plan est terminé : **sept peaux, sept modules satellites, zéro membre
public perdu** — le contrat de façade tient en entier à chaque étape.
`VideoPlayer.js` est passé de 2578 lignes à un budget verrouillé de
**2476**, et chaque peau a abaissé le plafond dans le même commit que
la descente.

| Peau | Module satellite | Lignes extraites |
|---|---|---:|
| 1 | `jellyfin/player/SegmentsMedia.js` | 192 |
| 2 | `jellyfin/player/UtilitairesLecteur.js` | 86 |
| 3 | `jellyfin/player/CompteAReboursEpisode.js` | 87 |
| 4 | `jellyfin/player/PopoversContenu.js` | 275 |
| 5 | `jellyfin/player/VisibiliteControles.js` | 134 |
| 6 | `jellyfin/player/RapportSession.js` | 242 |
| 7 | `jellyfin/player/ChargementSource.js` | 191 |
| **Total** | | **1207** |

*Lignes mesurées au commit de chaque peau.*

**La descente du budget** : 2578 → 2537 (peau 1) → 2524 (peau 2) → 2518
(peau 3) → 2374 (peau 4) → 2500 (peau 5) → 2435 (peau 6) → **2476
(peau 7)**. Les peaux 3 à 7 sont parties de main (2524) ; une fois
fusionnées dans l'ordre, le fichier se retrouve sous chaque plafond — la
dernière valeur committée fait foi.

**Ce que le monolithe fait encore, volontairement** :

- **l'assemblage** — le constructeur, `_bindEvents` et `_createPlayerDOM`
  restent dans la classe : c'est le rôle d'une façade de monter ses
  modules (hors périmètre annoncé dès le départ) ;
- **le transport de lecture** — `play()`, `_setupVideoSource` (câblage
  HLS.js / flux natif / repli), et les poignées télécommande/clavier
  (`handleNavAction`, `_onDirectShortcutKeyDown`, `_executerActionMedia`) ;
- **les 36 talons de délégation** — chaque méthode d'origine reste en
  place, surface publique inchangée ; si une future peau les retire, ce
  sera en abaissant le contrat de façade d'abord.

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
| — | ~~3~~ **Compte à rebours « épisode suivant »** | ~~`_showNextEpCard`, `_startNextEpCountdown`, `_cancelNextEpCountdown`, `_hideNextEpCard`~~ | ✅ **Atterrie (peau 3, branche `decomp/videoplayer-peel3`)** — le minuteur (départ à 5, décrément par seconde, passage auto à zéro) est extrait en injections étroites (`surTick`, `surZero`), testé sur horloge fausse ; le titre SxxExx est une fonction pure. |
| — | ~~4~~ **Popovers & tirage du contenu** | ~~`_togglePopover`, `_closeAllPopovers`, `_render*Popover` (audio/sous-titres, réglages, versions, épisodes)~~ | ✅ **Atterrie (peau 4, branche `decomp/videoplayer-peel4`)** — 150 lignes sorties du monolithe en une passe : l'usine `creerPopovers` ne reçoit que des accesseurs/actions, tout l'état et les effets restent sur le lecteur. Les sous-peaux annoncées n'ont pas été nécessaires. |
| — | ~~5~~ **OSD & visibilité des contrôles** | ~~`_showFlashOSD`, `_onUserActivity`, `_showControls`, `_hideControls`, `_resetIdleTimer`~~ | ✅ **Atterrie (peau 5, branche `decomp/videoplayer-peel5`)** — le module détient les deux minuteurs et le drapeau de visibilité (seul détenteur, comme le minuteur de la peau 3) ; le lecteur ne garde que le DOM, la vidéo et le tiroir, passés en injections ; tests sur horloge fausse. |
| — | ~~6~~ **Rapport de session Jellyfin** | ~~`_reportPlaybackStart`, `_startProgressReporting`, `_reportPlaybackStopped`, `_publierPosition`, `_brancherSessionMedia`~~ | ✅ **Atterrie (peau 6, branche `decomp/videoplayer-peel6`)** — l'intervalle de progression vit dans le module (seul détenteur, `nettoyer()` à la fermeture), l'état de session reste sur le lecteur lu en injections ; tests réseau/intervalle/boutons sur fakes (13 cas). |
| — | ~~7~~ **Chargement de la source** | ~~`_fallbackDirectStream`, `_initMediaStreams`, `_resolveMaxBitrate`, `_authoriseUrl`, `_reloadCurrentSourceWithOptions`~~ | ✅ **Atterrie (peau 7, branche `decomp/videoplayer-peel7`)** — dernière peau du plan : `authoriserUrl` pure, débit/fallback/rechargement à injections, `resoudreFlux` REND l'état que le lecteur applique ; tests URL/débit/bascule/flux/rechargement sur fakes (15 cas). |
| — | Hors périmètre | `_bindEvents`, `_createPlayerDOM`, le constructeur | L'assemblage reste dans la classe : c'est le rôle d'un façade. La décomposition s'arrête quand VideoPlayer ne fait plus que monter des modules. |

## Non-négociables (rappel)

- Aucun membre public ne disparaît ni ne change de signature sans échec du
  contrat de façade d'abord.
- Les tests de logique existants d'un sous-système doivent passer **inchangés**
  contre le module extrait ; s'ils doivent changer, l'extraction n'est pas
  invisible et le geste est faux.
- Une peau = une branche = un PR = la chaîne verte, budget abaissé dans le
  même commit que la peau.
