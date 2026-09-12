# SpaceHub — état du projet

> **Ce document fait foi.** Les fichiers `AUDIT_*.md` et `PLAN_*.md` à la
> racine sont des archives : ils décrivent l'état du projet au jour où ils ont
> été écrits, et ne sont plus mis à jour. Quand ils contredisent ce document,
> c'est ce document qui a raison.

**Dernière vérification :** 7 septembre 2026, sur PC Windows et dans un
Chromium sans tête.

---

## En une ligne

Client web autonome pour Jellyfin, conçu pour la télécommande autant que pour
la souris, en JavaScript sans framework, compilé par Vite pour un plancher de
compatibilité **Chromium 108** (téléviseurs de 2024).

> Ce plancher est **mesuré**, pas déclaré : `npm run test:plancher` recense les
> fonctionnalités du navigateur réellement employées et refuse toute nouveauté
> au-delà de 108 sans dérogation écrite. Il annonçait « Chrome 69 » jusqu'au
> 11 septembre 2026 — un chiffre que plus personne ne mesurait, et que trois
> composants livrés contredisaient déjà (`:focus-visible` 86, `aspect-ratio` 88,
> `color-mix()` 111). Un plancher faux d'une vingtaine de versions ne protège
> personne : il décide simplement à la place de quelqu'un.

---

## Positionnement

**Application autonome d'abord, compatibilité Jellyfin Web ensuite.**

SpaceHub a son propre écran de connexion, sa propre navigation, son propre
lecteur, et parle à Jellyfin par son API REST. Aucune modification du serveur
n'est nécessaire. L'ancienne méthode d'installation « par injection dans
Jellyfin Web » n'est plus le mode principal — et les instructions publiées
jusqu'au 7 septembre ne pouvaient pas fonctionner : elles pointaient vers un
nom de fichier que Vite ne produit jamais.

---

## État de la validation

| Contrôle | Portée | État |
|---|---|---|
| `npm run lint` | 196 fichiers | ✅ |
| CI GitHub Actions | la même chaîne à chaque push et pull request, build de main publié en artefact, e2e sur deux générations de Chromium (épinglé + courant), rappel changelog sur les PR (label `no-changelog` en échappatoire), mises à jour de dépendances par Dependabot | ✅ |
| `npm run test:unit` | 564 tests, 35 suites (vitest 5) | ✅ |
| `npm run test:smoke` | démarrage complet hors navigateur | ✅ |
| `npm run test:nav` | 46 sélecteurs, 12 scopes | ✅ |
| `npm run test:input` | 10 gestionnaires inscrits | ✅ |
| `npm run test:focus` | 22 conteneurs, 9 classes | ✅ |
| `npm run test:fantomes` | 918 appels, 81 classes | ✅ |
| `npm run test:facade-appelants` | 119 fichiers, surface de 25 membres | ✅ |
| `npm run test:gabarits` | 110 interpolations, 4 modules | ✅ |
| `npm run test:css` | 33 feuilles, 36 jeux d'images-clés | ✅ |
| `npm run test:xss` | 512 interpolations, 140 gabarits | ✅ |
| `npm run test:globals` | plafond de 20 accès | ✅ |
| `npm run build` | bundle de production | ✅ |
| `npm run test:e2e` | 30 scénarios, Chromium réel | ✅ |
| **Recette sur téléviseur réel** | Android TV : protocole prêt (`docs/ACCEPTATION_TV.md`), session v1.2.0 engagée ; Tizen et webOS : jamais tentés | 🟡 **démarrée** |

L'Android TV n'est plus un trou blanc : le protocole d'acceptation existe,
l'APK v1.2.0 est vérifié côté PC et la session attend la télévision. Tizen et
webOS, eux, restent entiers — rien de ce qui demande ces matériels ne l'a été.

---

## Ce qui est fait

**Navigation directionnelle.** Score par arêtes avec recouvrement de
projection (et non centre à centre), mémoire de rangée, conteneurs déclarés
`[data-nav-container]` en mode `auto` ou `strict`, pile de retour, redirections
`data-nav-*`, séparation stricte souris / directionnel, répétition progressive
(180 → 100 → 70 → 45 ms).

**Entrées.** Un routeur unique par priorité — clavier, manette, télécommande.
Aucun écouteur clavier global hors deux exceptions documentées.

**Lecteur.** Négociation `PlaybackInfo`, HLS.js avec repli en flux direct,
segments médias typés (intro, résumé, aperçu, générique de fin), panneau
d'erreur nommant la cause, file d'attente, enchaînement d'épisodes,
sous-titres distants, contrôle parental au point d'entrée unique.

**Rendu.** Virtualisation des rangées au-delà de 60 cartes (400 cartes → 17
nœuds), `content-visibility` sur les sections du tableau de bord,
`scroll-padding` pour que le dock ne masque jamais l'élément focalisé.

**Sécurité.** CSP servie et vérifiée par un scénario qui tente une injection,
jeton en mémoire + `sessionStorage` (jamais `localStorage`), déconnexion
serveur, validation du schéma d'URL, iframe YouTube en bac à sable,
`Referrer-Policy: no-referrer`, sourcemaps non publiées, import de
configuration validé.

**Extensions.** SDK avec permissions refusées par défaut, résolution de
dépendances et détection de cycles, délais sur les hooks, mise en quarantaine,
catalogue vérifié par SHA-256 et signature ECDSA P-256.

**Diagnostic.** HUD `?debug=1` affichant le focus, le scope, le conteneur, la
voie de décision, le nombre de candidats, le score et la latence — construit
précisément pour la recette téléviseur, où il n'y a pas de console.

---

## Ce qui n'est pas fait

| Sujet | Pourquoi |
|---|---|
| Recette sur téléviseur réel | Aucun appareil disponible côté développement. Procédure prête : `docs/RECETTE_MATERIEL.md`. |
| Mesure mémoire hls.js sur Tizen | Demande un appareil et une lecture d'au moins vingt minutes. Bascule prête : `SPACEHUB_HLS_UMD=1 npm run build`. |
| Mesure INP réelle (LoAF) | Idem : les chiffres d'un PC ne disent rien d'un téléviseur de 2020. |
| Compatibilité Jellyfin 12.0 | À tester contre un serveur avec `EnableLegacyAuthorization=false`. L'en-tête moderne est déjà émis, le risque est faible mais non vérifié. |
| Découpage des gros fichiers | Volontairement reporté. Voir ci-dessous. |

---

## Les instruments (12 septembre 2026)

Sept contrôles sont entrés dans `npm run test`, et ils ont été ajoutés AVANT les
corrections qu'ils mesurent — c'est ce qui les rend utiles. Un chantier sans
instrument redevient une intention en trois semaines.

| Contrôle | Ce qu'il empêche | Premier relevé |
|---|---|---|
| `test:design` — `scripts/systeme-design-check.mjs` | Qu'un jeton déclaré cesse d'être consommé | **18 plafonds, 6 planchers**. Premier relevé : 530 hex, 100 tailles, 83 graisses, 243 rayons littéraux pour 349/1290/205/115 usages des jetons. **L'état courant et le chemin restant de chaque chantier se lisent à la demande** : `npm run test:design -- --rapport` |
| `test:plancher` — `scripts/plancher-navigateur-check.mjs` | Qu'une API au-delà du parc (Chromium M108) entre sans décision | 4 dépassements trouvés, 3 dérogations nommées |
| `test:modules` — `scripts/modules-testes-check.mjs` | Qu'un module atterrisse sans test qui le nomme | 140 modules, 88 nommés, 52 exceptions figées |
| `test:couverture` — `vitest run --coverage` | Que la couverture baisse en silence | Planchers par fichier + 52 exceptions |
| `scripts/fraicheur-dist.mjs` | Que `test:e2e` et `test:poids` mesurent un `dist/` périmé | Pris en défaut lors de sa mise en service, sur un vrai faux rouge |
| `test:facade-appelants` étendu | Qu'une méthode PUBLIQUE disparaisse sans que personne ne le voie | 9 membres absents du contrat, `_gamepad` atteint en privé |
| `test:gabarits` étendu | Qu'un attribut `data-*` soit posé dans le DOM et jamais lu | 4 attributs morts trouvés par le nouveau contrat |

Ce que ces compteurs mesurent est détaillé dans `docs/IDENTITE_VISUELLE.md` (ce qui
reste et pourquoi) et `docs/UI_MOBILE.md` (la coquille GSM).

---

## Dette technique assumée

**Sept fichiers dépassent 55 ko.** `SettingsPanel.js` (95), `VideoPlayer.js`
(94), `SpatialNavigation.js` (76), `ModalSlideUpSheet.js` (73),
`UnifiedSearch.js` (63), `CardBuilder.js` (62), `JellyfinConsoleModal.js` et
`DownloadsView.js` (57).

Ce n'est pas une urgence, et un découpage massif maintenant serait une erreur :
il toucherait tout le code au moment précis où l'on cherche à prouver qu'il est
fiable, et rendrait ininterprétable le moindre bug observé en recette.

**Règle retenue :** ne pas refactorer pour refactorer. Quand une nouvelle
fonctionnalité touche une responsabilité distincte dans l'un de ces fichiers,
extraire cette responsabilité à ce moment-là. Les gabarits `*.template.js`
montrent que l'extraction fonctionne — à condition de vérifier ce qu'ils lisent,
ce que fait désormais `test:gabarits`.

**La décomposition de `VideoPlayer.js` a commencé** (étapes 0 et 1 atterries,
PR #13 — filet de façade, segments média extraits, budget 2578 → 2537) : le
registre des étapes et l'ordre confirmé des suivantes vivent dans
`docs/DECOMPOSITION_VIDEOPLAYER.md`. Le contrat est appliqué des DEUX côtés :
côté classe par `tests/FacadeLecteur.test.js`, côté appelants par
`test:facade-appelants` (surface unique dans `jellyfin/player/ContratFacade.js`).

**La décomposition de `SpatialNavigation.js` a commencé par son filet**
(peau 0, branche `decomp/spatialnavigation-peau0`) : le contrat de façade et son
contrôle existaient déjà, ce qui manquait était la preuve de ce qui est
réellement **atteint**. `scripts/sonde-surface-nav.mjs` la fournit — 17/23
méthodes publiques atteintes, aucun trou de contrat, deux privés de fait et
quatre morts tolérés qui désignent les premières peaux. Rien n'a encore été
extrait : la mesure est dans `docs/DECOMPOSITION_SPATIALNAVIGATION.md`, avec
l'ordre d'extraction confirmé.

**Mémoire de focus par identifiant généré.** Les conteneurs mémorisent
`data-focus="sh-nav-37"`. Après un rerender complet, l'ancien identifiant ne
correspond plus à rien ; le code le détecte et retombe sur la géométrie — donc
pas de bug, mais une mémoire perdue. Un identifiant métier stable
(`data-nav-key="jellyfin-item-12345"`) serait meilleur pour les listes très
dynamiques. Non fait : à ce jour, aucune vue ne se rerender assez souvent pour
que cela se voie.

**Décision majors (9 septembre 2026) — vite 8 et vitest 5 pris ENSEMBLE.**
Vitest 5 exige `vite >= 6` en dépendance homologue : les deux PR majeures de
Dependabot (#6 vite 5→8, #8 vitest 2→5) formaient une seule migration, pas
deux. Réalisée complète dans #8 (merge `c6331c2`) — les 47 déclarations CSS
`transition` invalides que lightningcss refuse ont été réparées au passage
(sonde Chromium : les navigateurs abandonnaient la déclaration entière, ces
c transitions n'avaient jamais animé), `target: 'chrome69'` re-vérifié,
plafond de poids relevé 258 → 270 ko avec justification dans
`scripts/poids-check.mjs`. #6, dont le bump isolé devenait vide une fois
absorbé, reste fermée (GitHub verrouille de toute façon la réouverture
d'une PR Dependabot dont la branche a été recréée) — le diagnostic complet
vit dans le commentaire du 9 septembre 2026 sur la PR #6. Le contraste de
l'épisode : un miroir apt incohérent (dépôt google-chrome préconfiguré sur
l'image des runners) a fait échouer la Verify sans qu'aucun test ne tourne —
corrigé dans les workflows, cf. `CHANGELOG.md`.

---

## Prochaine étape

Une seule, et elle ne dépend plus du code : **la recette sur téléviseur réel.**

L'ordre d'importance des appareils, du plus au moins répandu chez les
utilisateurs de Jellyfin : Android TV / Google TV, puis Samsung Tizen, puis
LG webOS, puis Fire TV.

Ce qu'il faut regarder en priorité, dans cet ordre : la télécommande (le focus
va-t-il où l'œil l'attend ?), la touche Retour, le lecteur, les rangées
virtualisées, les modales, la recherche.

Le HUD `?debug=1` est là pour ça : quand le focus part au mauvais endroit, il
dit quelle voie a tranché et avec quel score. Sans lui, on ne rapporte qu'un
symptôme ; avec lui, on rapporte une cause.

---

## Historique des audits

| Document | Date | Statut |
|---|---|---|
| `docs/audits/AUDIT_INGENIERIE_2026-09-06.md` | 6 sept. | Le plus récent. ~40 défauts corrigés. |
| `AUDIT_SPACEHUB_2026-09-01.md` et les `PLAN_*.md` | 1er sept. | Archive. Points traités. |
| `AUDIT_PROFESSIONNEL.md`, `PLAN_CORRECTIONS.md` | antérieurs | Archive. |
| `SpaceHub_Plan_de_Developpement*.md` | antérieurs | Archive. |
