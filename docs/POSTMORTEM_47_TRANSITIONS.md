# Postmortem — les 47 transitions mortes

*Incident « vite 8 » — rédigé après la fermeture complète de la boucle
(preuve rendue, gardes en place). Court, parce que l'essentiel est la leçon,
pas l'archive.*

## Ce qui s'est passé

Quarante-sept déclarations `transition` du dépôt portaient `!important` **au
milieu** de leur liste de valeurs :

```css
transition: transform .26s !important, opacity .2s !important, …;
```

Ce n'est pas du CSS : une déclaration n'admet qu'**un** `!important`, terminal.
Les navigateurs ne signalent rien — ils **abandonnent silencieusement la
déclaration entière**, même ses parties valides. Résultat : les boutons
d'action des widgets (rafraîchir, synchroniser), la modale slide-up, l'île
dynamique et des dizaines d'autres surfaces n'ont **jamais animé** leur survol
ou leur ouverture, pendant des mois, sans qu'aucun test ne devienne rouge.

## Pourquoi rien ne l'a vu

- **Les suites statiques lisent le code, pas le rendu.** Elles vérifient des
  sélecteurs, des interpolations, des signatures — aucune ne demandait au
  navigateur « cette transition produit-elle des frames intermédiaires ? ».
- **Le navigateur est muet.** Une déclaration invalide n'est pas une erreur
  console ; le style calculé retombe sur `all 0s` (propriété « all », durée
  nulle). Il fallait regarder le *calculé* pour voir la mort — personne ne
  le faisait.
- **La migration automatisée qui a posé le piège** (durées transformées en
  jetons `--sh-dur-*`) avait produit des listes où la position du
  `!important` semblait plausible à l'œil. Un contrôle « au plus un
  `!important` » existait pourtant — mais il comptait les points
  d'exclamation par **ligne** et manquait les déclarations étalées sur
  plusieurs lignes ou closes par `}` sans point-virgule.

## Ce que vite 8 a exposé

La migration vite 5 → 8 (PR #8, ensemble avec vitest 2 → 5) a changé le
parseur CSS du build : **lightningcss/Rolldown parse strictement** et a
refusé les 47 déclarations. Le build a échoué — pour la première fois,
l'invalidité avait un coût immédiat. Une sonde Chromium a ensuite confirmé
la mécanique exacte du mal : `transition-property` calculée à `all` et
durée à `0s`, c'est-à-dire la déclaration entière jetée.

## Les trois gardes qui empêchent la récidive

1. **Le contrôle statique de POSITION** (`npm run test:css`) — ce n'est pas
   un comptage, c'est une position : au plus un `!important`, uniquement en
   fin de déclaration, détecté **par déclaration** (chaînes, parenthèses,
   data: URLs respectées), préfixes vendeurs compris. Né d'abord pour
   `transition` (#17), épinglé sur le cas « un seul au milieu » (#23), puis
   **étendu à toute propriété** — une priorité au milieu d'un `margin` est
   rejetée exactement comme celle d'un `transition`. Chaque règle est
   désormais épinglée par une fixture vitest.
2. **La preuve rendue, image par image** (`npm run test:e2e`) — les
   scénarios posent de vrais composants avec de vraies feuilles, déclenchent
   le survol RÉEL et échantillonnent la matrice de transformation et
   l'opacité frame par frame : une transition vivante passe par des valeurs
   intermédiaires, une déclaration rejetée saute de départ à arrivée.
   Widgets (#15), puis modale slide-up et île dynamique (#24).
3. **Le témoin jamais cassé** — chaque harnais embarque un élément dont la
   transition est saine depuis l'origine (le soulèvement de `.sh-card`). Si
   la cible n'anime pas mais que le témoin anime, c'est le composant qui a
   régressé ; si le témoin n'anime pas non plus, c'est l'environnement — et
   c'est le harnais qui échoue, pas les composants. Le même témoin étend la
   modale et l'île.

## Le résumé en une phrase

Le mal n'était pas une coquille de syntaxe : c'était l'absence de toute
observation du rendu. Les gardes ne vérifient plus « le code ressemble à du
CSS » mais « cette animation produit des frames, et je peux le prouver ».