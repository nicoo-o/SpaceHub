# Plan d'action — audit externe du 7 septembre 2026

Traitement point par point du rapport reçu. Trois catégories : **appliqué**,
**non appliqué** (avec la raison), **hors de ma portée**.

Avant tout, une remarque sur la fiabilité du rapport : ses compteurs
correspondent exactement aux miens — 918 appels dans 81 classes pour le
contrôle des méthodes fantômes, 512 interpolations dans 140 gabarits pour le
contrôle XSS, et les tailles de fichiers à un kilo-octet près. Il a donc bien
été produit sur la version actuelle, pas sur une archive périmée. C'est assez
rare pour être noté, et cela donne du poids à ses recommandations.

---

## ✅ Appliqué

### 1. HUD de diagnostic (recommandation 23)

C'était la meilleure idée du rapport, et de loin la plus rentable.

Sur un PC, la console suffit à comprendre pourquoi le focus part au mauvais
endroit. Sur un téléviseur, il n'y a pas de console : on dispose de ce qu'on a
appuyé et de ce qui est sélectionné après, rien d'autre. Impossible de
distinguer « le score géométrique a mal choisi » de « la mémoire de rangée a
pris la main » ou de « le conteneur strict a bloqué ».

`?debug=1` affiche maintenant : focus, scope, conteneur et son mode, modalité
d'entrée, direction, **voie de décision**, nombre de candidats, score retenu,
latence, et les quatre derniers déplacements.

**Le point de conception qui compte :** le HUD ne recalcule rien. Le moteur
consigne sa décision, le HUD la lit. Un HUD qui recalculerait afficherait sa
propre version du raisonnement, et divergerait précisément le jour où l'on
aurait besoin de lui.

Coût quand il est éteint : nul. Le drapeau `_diagnostic` vaut `null` par
défaut et garde toutes les consignations.

Neuf tests, dont quatre sur son innocuité : il porte `inert` (jamais une cible
de navigation), écrit par `textContent` (les titres de médias viennent du
serveur), coupe la consignation du moteur en s'éteignant, et supporte un
double allumage comme un double arrêt. La contre-épreuve confirme que retirer
`inert` ou passer à `innerHTML` fait tomber les tests correspondants.

### 2. README — deux erreurs que le rapport n'avait pas vues (recommandations 21 et 22)

Le rapport signalait le badge « 60 FPS Zero-Lag » comme une affirmation non
démontrée. C'est juste, et c'est corrigé : « Cible : 60 FPS sur TV 2020+ ».
Une cible assumée n'est pas un mensonge ; une mesure inventée en est un.

En vérifiant, j'ai trouvé deux choses plus graves :

**La méthode d'installation « recommandée » ne pouvait pas fonctionner.** Elle
demandait d'injecter `dist/assets/index.js` depuis un CDN. Vite produit des
noms hachés — `index-BB8HIIqK.js` — qui changent à chaque compilation. Le
fichier annoncé n'a jamais existé. Quiconque a suivi ces instructions a obtenu
un 404 silencieux.

**Le tableau des thèmes en annonçait cinq ; il y en a deux.** *VisionOS Glass*,
*Cyberpunk Red*, *Emerald Glow* et *Monochromic Pure* ne figurent nulle part
dans `ui/themes/presets/`. C'est exactement le défaut que je corrigeais dans le
code le 6 septembre — la commande « Changer de thème » faisait tourner une
liste de quatre identifiants inexistants. La même erreur était dans la
documentation, à sa source.

Le positionnement est aussi tranché, dans le sens que le rapport recommandait
(option C) : **autonome d'abord, compatibilité Jellyfin Web ensuite.**

### 3. Document maître (recommandation 20)

`docs/PROJECT_STATUS.md`. Dix fichiers `.md` traînent à la racine, dont quatre
plans et trois audits de dates différentes : impossible de savoir lequel décrit
l'état réel. Le nouveau document le dit en tête — il fait foi, les autres sont
des archives — et contient l'état de validation, ce qui est fait, ce qui ne
l'est pas et pourquoi, la dette assumée, et la prochaine étape.

### 4. Matrice de compatibilité (recommandation 24)

Déjà couverte par `docs/RECETTE_MATERIEL.md`, qui existait avant le rapport.
Ses chiffres sont périmés (117 tests, 11 scénarios) et seront actualisés — mais
la procédure, elle, est bonne et n'a pas besoin d'être réécrite.

---

## ❌ Non appliqué

### 5. « `npm ci` puis `npm run verify` » (recommandation 1)

**Déjà fait, et le rapport ne pouvait pas le savoir.** Ses trois lignes ⚠️
(tests unitaires, build, E2E « non exécutés ») viennent de ce que l'archive
qu'il a reçue ne contenait pas `node_modules` — c'est un artefact de son
environnement, pas un trou dans le projet.

Ces contrôles tournent, et j'ai vérifié qu'ils tournent **sur votre machine**,
pas seulement chez moi : 311 tests unitaires, `npm run build` en 4,9 s, 26
scénarios dans un Chromium réel.

C'est d'ailleurs en les lançant chez vous que j'ai trouvé deux erreurs non
rattrapées — des minuteurs de bande-annonce qui survivaient à la fermeture, et
pouvaient poser le focus sur une fenêtre détachée. Corrigé le 7 septembre.

### 6. Identifiant métier stable pour la mémoire de focus (recommandation 6)

Le rapport le classe lui-même en « future optimisation », et je suis d'accord
de ne pas le faire maintenant — pour une raison précise.

Le défaut décrit est réel : après un rerender complet, `data-focus="sh-nav-37"`
ne correspond plus à rien. Mais le code détecte ce cas et retombe sur la
géométrie, donc il n'y a **pas de bug** — seulement une mémoire perdue. Et à ce
jour, aucune vue de l'application ne se rerender assez souvent pour que la
perte se voie.

Y toucher maintenant reviendrait à modifier le cœur du moteur de navigation
juste avant la recette téléviseur. Si un bug de navigation apparaissait
ensuite, on ne saurait plus s'il vient du téléviseur ou de ce changement.
Noté dans la dette de `PROJECT_STATUS.md`.

### 7. Découpage des gros fichiers (recommandation 19)

**Le rapport recommande de ne pas le faire maintenant, et il a raison.** Je
retiens sa règle telle quelle : extraire une responsabilité quand une nouvelle
fonctionnalité la touche, pas avant.

J'ajoute un argument qu'il ne donne pas : un découpage massif toucherait tout
le code au moment précis où l'on cherche à prouver qu'il est fiable. Le bénéfice
serait esthétique ; le coût serait de rendre ininterprétable le moindre bug
observé en recette.

L'extraction des gabarits `*.template.js` illustre bien le risque : elle était
mécanique, vérifiée par une empreinte octet pour octet — et elle a quand même
cassé le lecteur vidéo, parce que deux variables sont devenues des identifiants
libres. Ce défaut a survécu trois jours sans que rien ne le signale.

### 8. Les huit « à ne pas faire » du rapport

Réécrire le moteur de navigation, passer à Norigin, refaire le DOM en arbre
déclaratif, introduire React, ajouter un gros framework de tests, refactoring
massif, optimiser WebGL, ajouter des fonctionnalités.

**D'accord sur les huit, sans réserve.** Le rapport formule la raison mieux que
je ne le ferais : ajouter des fonctionnalités est devenu moins rentable que
tester ce qui existe.

---

## 🖥️ Hors de ma portée — cela ne dépend que de vous

### 9. La recette sur téléviseur réel (recommandation 2)

C'est le seul vrai trou de validation, et je ne peux pas le combler : je n'ai
aucun appareil. Tout ce qui pouvait être vérifié sans matériel l'est.

Ce que j'ai fait à la place, c'est rendre cette recette **diagnosticable**. Sans
le HUD, un bug de navigation sur téléviseur se rapporte ainsi : « le focus est
parti au mauvais endroit ». Avec le HUD, il se rapporte ainsi : « direction
DROITE, scope library, voie mémoire de rangée, 14 candidats, score 4210 » — et
là, je peux le corriger sans l'appareil.

Ordre suggéré, du plus au moins répandu chez les utilisateurs de Jellyfin :
Android TV / Google TV, Samsung Tizen, LG webOS, Fire TV.
Procédure : `docs/RECETTE_MATERIEL.md`.

### 10. Les deux mesures qui demandent un appareil

- **hls.js sur Tizen.** Bascule prête : `SPACEHUB_HLS_UMD=1 npm run build`.
  Mesure faite de mon côté : +32 ko, +9 ko gzippés. Coût certain, gain non
  vérifiable sans une lecture d'au moins vingt minutes sur un vrai téléviseur.
- **INP réel via LoAF.** Les chiffres d'un PC ne disent rien d'un Chromium de
  2020 embarqué.

---

## Ce que je retiens du rapport

Sa conclusion est la bonne : le projet est passé du moment où il fallait
construire à celui où il faut prouver. Je n'ajouterais rien de significatif au
code avant d'avoir vu l'application tourner sur un téléviseur.

Le seul reproche que je lui ferais est d'avoir validé le README et la
documentation sur leur cohérence apparente plutôt que sur leur véracité. Un
tableau de cinq thèmes bien présenté ressemble à de la documentation correcte ;
il faut ouvrir `ui/themes/presets/` pour voir qu'il en annonce trois qui
n'existent pas. C'est exactement le type de défaut que ce projet a passé une
semaine à corriger dans le code — et il était resté intact dans le fichier que
tout nouvel arrivant lit en premier.
