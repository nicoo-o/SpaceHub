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
compatibilité **Chrome 69** (téléviseurs de 2020).

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
| `npm run lint` | 192 fichiers | ✅ |
| CI GitHub Actions | la même chaîne à chaque push et pull request, build de main publié en artefact, e2e sur deux générations de Chromium (épinglé + courant), rappel changelog sur les PR (label `no-changelog` en échappatoire), mises à jour de dépendances par Dependabot | ✅ |
| `npm run test:unit` | 564 tests, 35 suites (vitest 5) | ✅ |
| `npm run test:smoke` | démarrage complet hors navigateur | ✅ |
| `npm run test:nav` | 46 sélecteurs, 12 scopes | ✅ |
| `npm run test:input` | 10 gestionnaires inscrits | ✅ |
| `npm run test:focus` | 22 conteneurs, 9 classes | ✅ |
| `npm run test:fantomes` | 918 appels, 81 classes | ✅ |
| `npm run test:gabarits` | 110 interpolations, 4 modules | ✅ |
| `npm run test:css` | 32 feuilles, 36 jeux d'images-clés | ✅ |
| `npm run test:xss` | 512 interpolations, 140 gabarits | ✅ |
| `npm run test:globals` | plafond de 20 accès | ✅ |
| `npm run build` | bundle de production | ✅ |
| `npm run test:e2e` | 27 scénarios, Chromium réel | ✅ |
| **Recette sur téléviseur réel** | Tizen, webOS, Android TV | ❌ **jamais faite** |

La dernière ligne est le seul vrai trou de validation, et c'est aujourd'hui le
point qui décide de la suite. Tout ce qui pouvait être vérifié sans matériel
l'est ; rien de ce qui demande un téléviseur ne l'a été.

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
