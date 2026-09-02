# Navigation SpaceHub — comparaison avec l'état de l'art

*2 septembre 2026. Étude comparative et plan d'amélioration.*

## Ce que j'ai comparé, et comment

Huit systèmes de navigation à la télécommande, choisis parce qu'ils tournent en
production sur des dizaines de millions d'appareils, ou parce qu'ils font
autorité :

| Système | Nature | Modèle |
|---|---|---|
| **tvOS Focus Engine** (Apple) | natif, fermé | géométrique + guides déclaratifs |
| **Android TV / Google TV** | natif | géométrique + `nextFocusUp/Down/…` |
| **W3C CSS Spatial Navigation Level 1** | spécification | géométrique, formule normalisée |
| **Enact Spotlight** (LG, webOS) | React, ouvert | conteneurs + restrictions déclaratives |
| **BBC LRUD** | ouvert | arbre de focus explicite |
| **BBC lrud-spatial** | ouvert | géométrique sur le DOM |
| **Norigin Spatial Navigation** | ouvert, multi-TV | registre + hiérarchie |
| **Amazon Vega** | natif | géométrique pondéré + surcharges |

J'ai aussi lu ce que Netflix publie sur son architecture d'entrée, et les
règles de conception « 10 pieds » (l'utilisateur assis à trois mètres).

Deux choses ont été **mesurées** dans un vrai Chromium, pas déduites : le coût
d'un appui sur une flèche selon le nombre d'éléments à l'écran, et le
comportement de la fonction de score sur un cas précis. La première mesure est
reproductible par `node scripts/nav-benchmark.mjs`.

---

## Les deux grandes familles

Il n'existe pas de modèle unique. Les professionnels se répartissent en deux
camps, et le choix a des conséquences.

**La géométrie.** On mesure les rectangles à l'écran et on choisit le voisin le
plus proche dans la direction demandée. C'est ce que font tvOS, Android TV,
Amazon Vega, la spécification W3C et lrud-spatial. Avantage : rien à déclarer,
la mise en page fait foi. Inconvénient : le comportement dépend de la géométrie
réelle, donc des cas tordus apparaissent, et il faut mesurer les éléments à
chaque déplacement.

**L'arbre de focus.** On déclare une structure — cette rangée est horizontale,
cette liste est verticale — et le focus circule dans l'arbre sans jamais mesurer
quoi que ce soit. C'est ce que font BBC LRUD, Netflix et
react-tv-space-navigation. Avantage : parfaitement prévisible, et gratuit en
calcul. Inconvénient : tout doit être déclaré, et une structure qui change
(rendu conditionnel) casse la navigation — c'est le premier piège documenté par
l'équipe de react-tv-space-navigation.

Matthijs Langendijk, qui a travaillé sur plusieurs applications TV, recommande
explicitement **un mélange** : l'arbre pour les cas réguliers, la géométrie pour
les cas complexes.

**SpaceHub est déjà dans ce mélange**, et c'est une bonne nouvelle : la
navigation horizontale dans un carrousel est déléguée au `CarouselController`
(comportement de liste, prévisible), et seule la navigation générale passe par
la géométrie. La question n'est donc pas de changer de modèle. Elle est de
corriger ce que la partie géométrique fait mal.

---

## Ce que SpaceHub fait déjà comme les professionnels

Ce n'est pas de la complaisance : chacun de ces points correspond à un mécanisme
que les systèmes cités implémentent aussi, et qu'il aurait fallu ajouter s'il
manquait.

**1. Un pipeline d'entrée unique avec des priorités déclarées.** C'est
exactement l'architecture que Netflix décrit — centraliser le focus pour avoir
« un seul endroit où corriger les problèmes ». `core/InputRouter.js` fait cela
depuis le commit `1ad80f0`.

**2. Le basculement pointeur / télécommande.** Enact Spotlight fonctionne dans
« deux modes mutuellement exclusifs », bascule en mode pointeur au mouvement de
souris et revient en 5-directions à la première touche. `_state.mode` fait la
même chose.

**3. La pile de couches pour le Retour.** Android TV impose que Retour ramène
toujours à l'écran précédent, sans jamais boucler. La pile d'ouverture réelle
respecte cette règle mieux qu'un ordre figé.

**4. Le carrousel recentre la carte focalisée.** `scrollToCard` centre la carte
dans la rangée : c'est le motif « focus flottant » que décrit Langendijk — le
repère visuel reste stable, c'est le contenu qui bouge dessous. C'est ce que font
Netflix et l'Apple TV.

**5. L'indicateur de focus.** `scale(1.025)` plus une ombre portée renforcée :
Android TV recommande précisément 1,025 / 1,05 / 1,1 selon la taille de
l'élément, plus une lueur de 2 à 32 dp. SpaceHub est sur la valeur basse de la
fourchette, ce qui est cohérent pour des cartes de grande taille.

**6. La marge de sûreté TV.** `ui.tvSafeArea` (3,5 % par défaut, réglable
jusqu'à 7 %) est appliquée par `TvModeManager`. Les règles « 10 pieds »
recommandent une zone d'action sûre de 85 à 95 % de l'écran ; 3,5 % de marge
place SpaceHub à 93 %, dans la fourchette.

**7. Un contrôle que la plupart des bibliothèques n'ont pas.** `npm run test:nav`
vérifie que chaque sélecteur déclaré par le moteur correspond à un élément
réellement émis par l'application. Le piège numéro un documenté par
react-tv-space-navigation — un élément qui disparaît puis revient et perd sa
place — est précisément ce que ce contrôle attrape. Aucune des bibliothèques
étudiées n'expose d'équivalent.

---

## Six écarts, du plus grave au moins grave

### 1. La fonction de score ignore le recouvrement — et se trompe

**Ce que font les autres.** La spécification W3C définit une formule explicite :

```
distance = euclidienne + déplacement − alignement − √(recouvrement)
```

Le terme de **recouvrement** est la surface commune entre le rectangle de départ
et celui du candidat. lrud-spatial fait la même chose autrement : il mesure
d'arête de sortie à arête d'entrée, et accepte par défaut jusqu'à 30 % de
chevauchement. Amazon Vega pondère « moins fortement la distance dans l'axe du
déplacement que la distance perpendiculaire ».

**Ce que fait SpaceHub.** Distance de **centre à centre**, avec une pénalité
linéaire d'alignement (`alignX * 3.5` en vertical, `alignY * 5` en horizontal).
Aucun terme de recouvrement.

**Conséquence, mesurée.** J'ai construit le cas suivant dans le navigateur :

- élément courant : carte de 200 × 200 à (100, 100) ;
- **bannière large** de 1800 × 150 à (0, 340) — c'est-à-dire **directement
  dessous**, à 40 px, avec un recouvrement horizontal total ;
- petite carte alignée de 200 × 200 à (100, 800) — **500 px plus loin**.

Résultat en appuyant sur Bas :

| Candidat | Distance | Recouvrement | Pénalité d'alignement | Score | Choisi |
|---|---|---|---|---|---|
| bannière (à 40 px) | 732 | 200 px (100 %) | −2450 | **−182** | non |
| carte lointaine (à 500 px) | 700 | 200 px (100 %) | 0 | **2300** | **oui** |

SpaceHub saute la bannière et va chercher une carte cinq fois plus loin. La cause
est que la pénalité d'alignement est calculée **entre les centres** : un élément
large est puni d'être large, alors que son recouvrement avec l'élément courant
est total. Les deux candidats ont pourtant exactement le même recouvrement de
projection — 200 px, la largeur entière de l'élément courant.

C'est un défaut d'algorithme, indépendamment de savoir s'il mord aujourd'hui sur
telle ou telle page. Il mordra dès qu'un élément focalisable large — une barre de
filtres, un bandeau, un bouton pleine largeur — se trouvera entre deux rangées.

**Proposition.** Remplacer la pénalité de centre par un vrai terme de
recouvrement de projection, en suivant la formule W3C :

```js
// Recouvrement de la projection sur l'axe perpendiculaire au déplacement.
const recouvrement = Math.max(0,
    Math.min(a.right, b.right) - Math.max(a.left, b.left));   // pour haut/bas
// Alignement = fraction de l'élément courant réellement couverte.
const alignement = recouvrement / Math.max(1, a.width);
```

et mesurer d'**arête à arête** plutôt que de centre à centre. Le calcul est de
même coût. Un test unitaire par cas de figure fige le résultat.

**Effort : une demi-journée. Risque : moyen** — c'est le cœur du moteur, mais il
est désormais couvert par 18 tests unitaires et un scénario E2E, et chaque cas de
figure peut être figé par un test avant modification.

---

### 2. Aucune mémoire de focus par conteneur

**Ce que font les autres.** Tous, sans exception :

- Enact : `enterTo: 'last-focused'` restaure « le dernier enfant à avoir eu le
  focus avant qu'il ne sorte du conteneur » ;
- BBC LRUD : chaque nœud garde un `activeChild` ;
- lrud-spatial : les conteneurs (`nav`, `section`, `.lrud-container`) écrivent un
  attribut `data-focus` ;
- Norigin : `saveLastFocusedChild` ;
- Android TV : la restauration du focus au retour sur un écran fait partie des
  attentes explicites.

**Ce que fait SpaceHub.** Une pile globale (`_focusStack`) pour les couches — qui
répond à une autre question : « où revenir en fermant une modale ». Et une
mémoire de colonne (`_lastColumnX`) pour les déplacements verticaux. Mais **rien
par rangée** : quitter le carrousel « Films » en huitième position, descendre,
remonter, et l'on revient là où la géométrie décide — c'est-à-dire en général la
première carte visible.

**Conséquence.** C'est la différence la plus immédiatement perceptible entre une
application TV amateur et une application professionnelle. Sur Netflix, on quitte
une rangée et on y revient exactement où on l'avait laissée.

**Proposition.** Un attribut `data-focus` sur chaque conteneur de rangée, écrit à
chaque `setFocus`, relu quand la navigation entre dans ce conteneur. C'est
littéralement le mécanisme de lrud-spatial, et il tient en une vingtaine de
lignes. La mémoire de colonne existante devient un cas particulier de ce
mécanisme général.

**Effort : une demi-journée. Risque : faible** — additif, aucun comportement
existant n'est retiré.

---

### 3. Le scope est une liste de priorité codée en dur, pas l'arbre DOM

**Ce que font les autres.** Le conteneur de navigation est déterminé en
**remontant l'arbre** depuis l'élément focalisé :

- W3C : le conteneur est « le plus proche ancêtre » qui en est un ; la propriété
  CSS `spatial-navigation-contain` en déclare de nouveaux ;
- Enact : `SpotlightContainerDecorator` avec `spotlightRestrict: 'self-only'` ;
- Norigin : `isFocusBoundary` ;
- Vega : `FocusManager.setFocusRoot()`.

Et quand aucun candidat n'existe dans le conteneur, l'algorithme **remonte au
conteneur parent** — récursivement, jusqu'à la racine.

**Ce que fait SpaceHub.** `_detectCurrentScope()` est une suite de `if` sur des
sélecteurs globaux, dans un ordre fixe : lecteur, puis réglages, puis recherche,
puis barre latérale, puis modales, puis l'élément focalisé, puis la vue courante.
Il n'y a pas de remontée : un scope est choisi, ses focusables sont les seuls
candidats, point.

**Conséquence.** Cela fonctionne aujourd'hui, et ce n'est pas un bogue. Mais
c'est un point de couplage : chaque nouvelle couche demande une ligne dans cette
fonction, dans le bon ordre. Une couche imbriquée dans une autre — une modale
ouverte depuis les réglages, un popover dans le lecteur — n'a pas de place
naturelle dans une liste plate. C'est exactement la raison pour laquelle tous les
systèmes cités utilisent l'arbre.

**Proposition.** Ne pas tout réécrire. Ajouter un attribut `data-nav-container`
lu en remontant depuis l'élément focalisé, avec repli sur la liste actuelle quand
aucun ancêtre n'en porte. La liste devient le repli au lieu d'être la règle —
même démarche que la pile de couches, qui a remplacé `BACK_ORDER` sans le
supprimer.

**Effort : un à deux jours. Risque : moyen à élevé** — à ne lancer qu'après la
recette matériel, et avec un test par scope existant écrit d'abord.

---

### 4. Aucune redirection déclarative

**Ce que font les autres.** Tous offrent un moyen de dire « depuis ici, vers le
bas, va **là** », sans changer la mise en page :

- tvOS : `UIFocusGuide`, des rectangles invisibles qui redirigent le focus ;
- Android TV et Vega : `nextFocusUp/Down/Left/Right` ;
- Enact : `leaveFor: { up: '.mon-selecteur' }` ;
- BBC LRUD : `registerOverride(source, cible, direction)` ;
- Norigin : gestionnaires de direction par élément.

**Ce que fait SpaceHub.** Rien. Un contrôle inatteignable ne peut être corrigé
qu'en déplaçant du DOM ou en ajoutant un scope.

**Nuance importante.** Android TV donne la règle inverse : « s'il n'existe pas de
chemin direct vers un contrôle, déplacez-le ». La redirection déclarative est un
pansement ; une mise en page où chaque contrôle est atteignable est préférable.
Mais le pansement coûte peu et évite de tordre une mise en page pour satisfaire
l'algorithme.

**Proposition.** Lire quatre attributs optionnels
`data-nav-up|down|left|right="<sélecteur>"` en tête de `_findSpatialTarget`.
Vingt lignes, aucun effet quand les attributs sont absents.

**Effort : deux heures. Risque : très faible.**

---

### 5. Le coût d'un appui n'est pas borné

**Ce que font les autres.** Norigin expose une option `throttle` précisément pour
limiter les appels à `getBoundingClientRect`. Amazon Vega recommande de « garder
les gestionnaires de focus légers pour ne pas bloquer le fil d'affichage » et de
« réduire la durée des animations lors d'appuis rapides ».
react-tv-space-navigation évite le problème en ne mesurant jamais rien.

**Ce que fait SpaceHub.** Chaque appui mesure trois fois chaque candidat :
`getFocusables` appelle `getBoundingClientRect` **et** `getComputedStyle` sur
tous, puis `_findSpatialTarget` rappelle `getBoundingClientRect` sur chacun.
Aucun cache.

**Mesure** (Chromium, machine de développement, `node scripts/nav-benchmark.mjs`) :

| Candidats | getFocusables | _findSpatialTarget | Total | Mesures de géométrie |
|---|---|---|---|---|
| 24 | 0,12 ms | 0,18 ms | 0,29 ms | 73 |
| 60 | 0,65 ms | 0,72 ms | 1,37 ms | 181 |
| 150 | 0,88 ms | 1,18 ms | 2,06 ms | 451 |
| 300 | 1,34 ms | 1,86 ms | 3,20 ms | 901 |
| 600 | 1,71 ms | 2,79 ms | **4,50 ms** | 1801 |

**Conséquence.** Sur cette machine, c'est indolore. Mais le Chromium d'un
téléviseur de 2020 est dix à vingt fois plus lent. À 600 candidats, une
extrapolation prudente (×12) donne **≈54 ms par appui** — alors que le moteur de
répétition tire un pas toutes les **45 ms** en défilement rapide. Le calcul
prendrait plus de temps que l'intervalle entre deux pas : le moteur accumulerait
du retard, et la navigation donnerait cette impression de « caoutchouc » qu'on
reconnaît sur les mauvaises applications TV.

Ce n'est pas une certitude — c'est une extrapolation, à confirmer en recette
(test D6). Mais l'ordre de grandeur suffit à justifier le correctif.

**Proposition, par ordre de rapport bénéfice/effort :**

1. **Mesurer une fois, pas trois.** `getFocusables` peut renvoyer les rectangles
   déjà calculés, que `_findSpatialTarget` réutilise. Divise le coût par deux,
   sans rien changer au comportement.
2. **Éviter `getComputedStyle` quand le rectangle suffit.** Un élément de largeur
   ou hauteur nulle est déjà écarté par son rectangle ; l'appel au style calculé
   ne sert qu'aux cas `visibility` et `opacity`, plus rares, et vérifiables
   seulement sur les candidats retenus.
3. **Cache pour la durée d'une salve de répétition**, invalidé au défilement, au
   redimensionnement et à toute mutation du DOM. C'est le `throttle` de Norigin.
4. **Écarter les candidats hors écran** avant de les mesurer — la spécification
   W3C distingue explicitement les zones focalisables « visibles » des autres.

**Effort : une journée pour les points 1 et 2. Risque : faible** —
`nav-benchmark.mjs` mesure avant et après, et les tests figent le comportement.

---

### 6. Retour à la racine ne fait rien

**Ce que font les autres.** Android TV est catégorique : appuyer plusieurs fois
sur Retour doit finir par ramener au lanceur ; aucune boîte de confirmation ne
doit bloquer la sortie ; et il ne faut jamais afficher de bouton Retour à l'écran
puisque la télécommande en a un.

**Ce que fait SpaceHub.** `_handleBack` parcourt la pile, puis `BACK_ORDER`, puis
ne fait rien. Sur un téléviseur, Retour depuis l'accueil ne produit aucun effet —
l'application paraît coincée.

**Proposition.** Quand aucune couche n'est ouverte, appeler la sortie de la
plateforme : `window.tizen?.application?.getCurrentApplication?.().exit?.()` sur
Samsung, `window.webOS?.platformBack?.()` sur LG, et `history.back()` en repli
dans un navigateur ordinaire. Trois lignes gardées par des tests de présence.

**Effort : une heure. Risque : faible**, mais **invérifiable sans téléviseur** —
à écrire maintenant, à valider en recette (test C8, déjà prévu).

---

### Point mineur : l'anneau de focus natif est désactivé

`.sh-card:focus-visible { outline: none; }` supprime l'anneau du navigateur. La
visibilité du focus repose alors entièrement sur la classe `sh-tv-focused` posée
par le moteur. Tant que le moteur pose la classe, tout va bien — et les tests le
vérifient. Mais une navigation au clavier par tabulation, hors moteur, n'aurait
plus aucun repère visuel. Un `outline` de repli coûte deux lignes.

---

## Plan proposé, en trois vagues

**Vague A — FAITE** *(2 septembre 2026)*

1. ✅ Redirections déclaratives `data-nav-up|down|left|right` (écart 4)
2. ✅ Mémoire de focus par conteneur via `data-focus` (écart 2)
3. ✅ Sortie de l'application sur Retour à la racine (écart 6)
4. ✅ Anneau de focus de repli (point mineur)

18 tests unitaires et un douzième scénario de bout en bout. Les six premiers
tests vérifient le cas « aucun attribut » : le comportement doit être
rigoureusement celui d'avant, une régression silencieuse là serait pire que
l'absence de la fonctionnalité.

Deux décisions prises en cours de route, contre ce que ce document proposait :

- **Le repli `history.back()` est limité au mode TV.** Le plan initial le
  déclenchait partout. Or sur un ordinateur, Échap au niveau racine ne fait rien
  dans toutes les applications web, et sortir du site à la place surprendrait
  sans rien apporter. Tizen et webOS restent inconditionnels — ce sont des
  téléviseurs par définition.
- **La mémoire utilise `getElementById`, pas un sélecteur `#id`.** Une recherche
  par table de hachage, et surtout aucune question d'échappement : `CSS.escape`
  aurait suffi mais ajoutait une dépendance inutile à un cas déjà résolu.

L'usage des trois attributs est documenté dans
[ARCHITECTURE.md](ARCHITECTURE.md).

**Vague B — FAITE** *(2 septembre 2026)*

5. ✅ Terme de recouvrement de projection dans le score (écart 1)
6. ✅ Mesure unique par appui (écart 5, point 1)

La table de cas a bien été écrite **avant** de toucher au moteur, comme prévu :
11 cas — deux rangées alignées, le voisin le plus proche, l'alignement contre la
distance, une grille irrégulière, les bords, la bannière large, la mémoire de
colonne. **Un seul échouait** : la bannière. Les dix autres décrivaient un
comportement déjà correct et servaient de filet — c'est exactement ce qu'une
table de cas doit produire.

Le score suit désormais la formule W3C : distance mesurée d'**arête à arête**
sur l'axe du déplacement, recouvrement de projection récompensé, écart latéral
pénalisé **seulement quand les projections ne se touchent pas**. La mémoire de
colonne est conservée en translatant le rectangle de référence, pas en le
réduisant à un point.

Le point 6 s'est avéré plus modeste que prévu, et il faut le dire : supprimer la
double mesure fait passer de 1200 à 600 appels à `getBoundingClientRect`, mais
`getComputedStyle` — la moitié la plus chère — restait appelé 600 fois. Ce
n'était pas un oubli du plan, c'était une contrainte réelle : un élément en
`visibility: hidden` conserve un rectangle non nul, on ne peut donc pas déduire
sa visibilité de sa seule géométrie. Le gain réel est venu de la vague C.

**Vague C — FAITE** *(2 septembre 2026)*

7. ✅ Conteneurs de navigation par l'arbre DOM (écart 3)
8. ✅ Cache de visibilité par salve de répétition (écart 5, points 3 et 4)

Faites avant la recette matériel, à la demande — contre ce que ce document
recommandait. La contrepartie a été prise au sérieux : 13 tests unitaires
supplémentaires, dont ceux qui vérifient les cas où le nouveau mécanisme ne doit
**pas** s'appliquer.

`data-nav-container` reconnaît deux valeurs, calquées sur Enact : `auto` cherche
d'abord dans le conteneur puis remonte au parent (le `self-first`), `strict` ne
laisse jamais sortir (le `self-only`, pour une modale). L'ancienne liste de
priorité reste le repli — même démarche que la pile de couches, qui a remplacé
`BACK_ORDER` sans le supprimer.

Le cache, lui, a demandé de renoncer à ce que le plan proposait. Le plan parlait
d'un « cache de géométrie ». **C'était une erreur** : une salve de répétition
fait précisément défiler la page, donc les rectangles changent à chaque pas.
Les cacher aurait produit un focus qui saute. Ce qui ne bouge pas pendant une
salve, c'est le **verdict de visibilité** — et c'est justement la moitié la plus
chère. Seul lui est mis en cache.

### Ce que cela donne, mesuré

Appels de géométrie **pour un appui**, sur une page de 600 éléments
(`node scripts/nav-benchmark.mjs`, compteurs réels et non plus une formule) :

| État | `getBoundingClientRect` | `getComputedStyle` | Total |
|---|---|---|---|
| Avant | 1200 | 600 | **1800** |
| Après vague B | 600 | 600 | **1200** |
| Après vague C, en salve | 600 | ~15 | **~615** |

Soit **un tiers du coût d'origine**. En régime de salve, un appui mesure
aujourd'hui 2,11 ms sur la machine de développement ; l'extrapolation prudente
(×12) pour un téléviseur de 2020 donne **≈25 ms**, contre les 45 ms de cadence
du défilement rapide. La marge existe désormais.

*Réserve honnête* : les deux extrapolations de ce document, avant et après, sont
des règles de trois. Seul un vrai téléviseur les confirmera — c'est le test D6
de [RECETTE_MATERIEL.md](RECETTE_MATERIEL.md).

*Réserve sur la comparaison* : le premier chiffre publié dans ce document
(≈54 ms) provenait d'un banc qui chronométrait `getFocusables` et
`_findSpatialTarget` séparément, comptant donc la passe de mesure deux fois. Le
banc a été corrigé pour mesurer **un appui = un appel**. Les chiffres du tableau
ci-dessus sont tous pris avec la version corrigée ; les temps ne sont pas
comparables aux 54 ms, les **comptages d'appels** le sont.

---

## Ce que je ne recommande pas de faire

**Passer à un arbre de focus déclaratif complet.** C'est le modèle de Netflix et
de BBC LRUD, et il est excellent. Mais il suppose de déclarer la structure de
chaque écran, alors que SpaceHub construit son DOM par gabarits et widgets
dynamiques. Le premier piège documenté par react-tv-space-navigation — un élément
affiché sous condition qui perd sa place — deviendrait la norme ici. Le mélange
actuel (liste pour les carrousels, géométrie pour le reste) est le bon compromis
pour cette application.

**Adopter la spécification W3C en attendant son implémentation.** `css-nav-1` est
un brouillon de travail depuis 2019 ; aucun navigateur de téléviseur ne
l'implémente. Sa **formule** est en revanche une excellente référence, et c'est
ce que propose l'écart 1.

**Réécrire vers WebGL ou WebAssembly pour la fluidité.** Certains éditeurs le
font et annoncent 10 à 20 % de gain d'images par seconde. Cela signifie abandonner
le DOM, donc l'accessibilité, le CSS, et l'essentiel du travail fait jusqu'ici —
pour un gain qui ne répond pas au problème mesuré ici, qui est le coût du calcul
de navigation, pas celui du rendu.

**Ajouter une bibliothèque tierce.** Norigin et lrud-spatial sont bons, mais ils
supposent React ou une réécriture des conteneurs, et aucun ne couvre le carrousel
avec recentrage ni la pile de couches, qui fonctionnent déjà. Leurs **idées**
valent mieux que leur code, ici.

---

## Sources

- [CSS Spatial Navigation Level 1 — W3C/CSSWG](https://drafts.csswg.org/css-nav-1/)
- [Making Apple TV Apps: How the Focus Engine Works — Tommy Baggett](https://tommyb.com/blog/making-apple-tv-apps-part-7-how-the-focus-engine-works/)
- [Focus system — Android Developers](https://developer.android.com/design/ui/tv/guides/styles/focus-system)
- [Navigation on TV — Android Developers](https://developer.android.com/design/ui/tv/guides/foundations/navigation-on-tv)
- [Spotlight — Enact (LG webOS)](https://enactjs.com/docs/developer-guide/spotlight/)
- [bbc/lrud — arbre de focus](https://github.com/bbc/lrud/blob/master/docs/usage.md)
- [bbc/lrud-spatial — géométrie sur le DOM](https://github.com/bbc/lrud-spatial)
- [Norigin Spatial Navigation](https://github.com/NoriginMedia/Norigin-Spatial-Navigation)
- [Focus Management — Amazon Vega](https://developer.amazon.com/docs/vega/0.22/focus-management)
- [Pass the Remote: User Input on TV Devices — Netflix Technology Blog](https://netflixtechblog.com/pass-the-remote-user-input-on-tv-devices-923f6920c9a8)
- [react-tv-space-navigation — pièges documentés](https://github.com/bamlab/react-tv-space-navigation/blob/main/docs/pitfalls.md)
- [Learning Focus Management in Smart TV apps — Matthijs Langendijk](https://mlangendijk.medium.com/learning-focus-management-in-smart-tv-apps-0bdb17da3795)
- [Designing a 10ft UI — Pascal Potvin](https://pascalpotvin.medium.com/designing-a-10ft-ui-ae2ca0da08b7)
- [Smart TV app development: performance tips — Wiztivi](https://www.wiztivi.com/blog/smart-tv-app-development-performance-tips)
