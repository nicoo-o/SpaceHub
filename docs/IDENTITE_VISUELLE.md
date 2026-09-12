# Identité visuelle — faire arriver le système jusqu'aux composants

*12 septembre 2026. Direction **appliquée par jetons et cliquets** : la part mécanique
est faite, le reste est mesuré en fin de document. Compagne de `docs/UI_MOBILE.md`
(coquille GSM) et de `docs/ARCHITECTURE.md` (où vit quoi).*

## Le sujet

SpaceHub est le client d'une **bibliothèque de films et de séries qui appartient à la
maison**. Il vit sur un téléviseur dans une pièce sombre, sur un téléphone dans une
poche, sur un bureau. Son travail est toujours le même : passer de « qu'est-ce qu'on
regarde » à « ça joue », dans le noir, sans lire. Le contenu saturé de l'application,
ce sont les **affiches** ; l'application est le cadre.

## La découverte qui change la commande

Je suis arrivé avec une proposition de palette complète. La lecture de
`public/design-system/tokens.css` l'a rendue inutile, et c'est le vrai résultat de
cette passe : **l'identité existe déjà, elle est délibérée, argumentée par écrit, et
elle est cohérente.** « Monochrome Apple TV » : noir absolu, une gamme d'accent froide
introduite exprès pour que le thème clair cesse d'être une maquette inachevée, et un
**anneau de focus orange dont la raison d'être est écrite noir sur blanc** — « un
indicateur de position doit être la SEULE chose de cette couleur à l'écran ».

Le problème n'est donc pas la direction. C'est que la direction **n'atteint pas les
composants**. Chaque famille du système a un taux de consommation entre 0 et 2 % :

| Ce qui est déclaré | Consommé par les composants | Écrit à la main à la place |
|---|---|---|
| 4 couleurs sémantiques | `--sh-color-info` : **0** · `danger` : 3 | **566** hexadécimaux, dont `#64d2ff` ×18, `#ff453a` ×8, `#32d74b` ×5 |
| La couleur de l'anneau de focus | `--sh-focus-ring*` : 20 | **`#ff9f0a` ×36** — la teinte de l'anneau recopiée presque deux fois plus souvent que le jeton |
| La gamme d'accent (froide) | `--sh-accent*` : **3** | `#5ab4dc` hors jetons : 0 — l'accent n'est nulle part, ni utilisé ni recopié |
| L'échelle typographique (9 paliers) | `--sh-text-*` : **0** | **407** `font-size` écrits à la main |
| Les graisses (6 paliers) | — | **288** `font-weight` sur dix valeurs |
| Les rayons (6 paliers) | `--sh-radius*` : **3** | **390** `border-radius` |
| Le flou de chrome | `--sh-bg-glass*` : **0** | **10** `backdrop-filter` (comptés par `test:css`, plafond 10 — **saturé**) |
| Les durées et courbes | oui | **19** animations `infinite` |

C'est le motif que ce dépôt a déjà nommé pour le CSS — **un vert qui ment** : le système
est vert (il est déclaré, testé, documenté) et il ne décrit pas ce que l'écran affiche.
La commande n'est donc pas « changeons d'identité » mais **« faisons arriver celle-ci,
et faisons-la s'appliquer d'elle-même »**.

## Ce que je retire de ma propre proposition

Le protocole de cette passe exige de repasser le plan au crible et de dire ce qui a
changé. Trois choses :

1. **Je retire la palette que j'avais écrite.** Mon `faisceau` `#4EA1FF` et ma `lampe`
   `#FFA94D` **réinventaient** `--sh-accent` (90, 180, 220) et `--sh-focus-ring`
   (255, 159, 10), qui existent avec une justification meilleure que la mienne — et
   remplacer une décision documentée par son équivalent personnel est le défaut que ce
   dépôt interdit explicitement (« ne pas refactorer pour refactorer »). La seule chose
   que j'ajoute, c'est la **règle** qui va avec et que personne n'applique.
2. **Je retire mon noir `#08090C`.** `--sh-bg-base: #000000` est déclaré « Noir OLED
   absolu » — sur un téléviseur OLED, le noir éteint réellement les pixels, et c'est un
   parti pris tenable. Ce que je garde de l'observation est une **conséquence** bien
   réelle : si le fond est noir, **l'élévation ne peut pas être une ombre**, et c'est
   exactement pourquoi deux des six recettes d'ombre du dépôt utilisent l'encre blanche
   en halo. L'ombre noire sur noir est un cercle vicieux déjà présent dans le code.
3. **Je retire « deux rayons ».** Les six paliers `--sh-radius-*` sont déjà dessinés
   juste : `12px` (34 usages), `9999px` (56) et `50%` (58) couvrent 148 des 390
   déclarations. Le problème est la consommation, pas l'échelle. J'abaisse donc mon
   ambition à **consommer ce qui existe**, avec `md` et `full` comme défaut.

## La contribution, et un seul endroit où j'appuie fort

> **Là où je mets l'audace, c'est la typographie — parce que c'est le seul endroit où
> il n'y a rien.** Partout ailleurs je reste calme et discipliné.

### Typographie : la police de la plateforme, et une échelle qui existe enfin

*Ce qui suit est APPLIQUÉ. La proposition d'origine — Archivo auto-hébergée, titres
condensés, quatre graisses — a été retirée en cours de route, et c'est le résultat le
plus utile de cette passe, parce qu'un budget l'a réfutée.*

Aujourd'hui : la face déclarée était `'SF Pro Display', 'Inter', …`, **SF Pro n'a jamais
été chargée** (aucun `@font-face`, aucune police embarquée) et seule Inter arrivait,
depuis **Google Fonts**. La typographie changeait donc avec le système d'exploitation
sans que rien ne le dise.

**L'auto-hébergement est impossible ici, et la mesure le prouve :** le démarrage est
mesuré à 274,4 ko gzip pour un plafond de 276 ko (`scripts/poids-check.mjs`) — 1,6 ko
de marge. Une police d'interface auto-hébergée pèse trente à soixante ko. Une direction
qui exige de tripler le budget de démarrage n'est pas une direction, c'est un vœu.

Décision : **la famille vient de la plateforme**, comme la coquille vient de la
plateforme (Material 3 sur GSM, Apple TV sur grand écran). `system-ui` en tête — la
seule entrée qui désigne la bonne police partout — puis Segoe UI Variable, SF Pro,
Roboto, Noto Sans. Ce qui part avec la feuille Google : une requête tierce **bloquante**
au démarrage, deux origines ouvertes dans la CSP, et une dépendance réseau dans une
application qui doit démarrer sans DNS. Le harnais e2e filtrait déjà ses échecs comme
du bruit attendu — un défaut connu, toléré, jamais corrigé.

L'échelle, elle, est **refaite pour la distance de lecture** — et pour de vrai :

| Palier | Valeur | Ce que le codemod y a fait basculer |
|---|---|---|
| `xs` | **12px** (était 11) | 196 déclarations sous le plancher, de 7 à 11,5 px |
| `sm` | 13px | 65 |
| `base` | 15px | 20 |
| `md` | 17px | 2 |
| `lg` | 22px | 6 |
| `xl` | 28px | 2 |
| `2xl` / `3xl` / `4xl` | 36 / 48 / 64px | — |

- **Le plancher est 12 px, et il est mesuré** : plus aucune taille littérale sous ce
  seuil, le barème compris (il commençait à 11). Un texte de 9 px posé sur une affiche,
  sur l'appareil qu'on regarde à trois mètres, n'est pas petit — il est illisible.
- **Les demis-marches restent**, et c'est délibéré : 12,5 · 13,5 · 14 · 14,5 · 16 ·
  18 · 19 · 20 · 24 · 26 · 32 · 34 · 38 · 42 px (100 déclarations) demandent un
  arbitrage **par mise en page**, pas un codemod. Elles sont comptées, pas devinées.
- **La marche 800 est ajoutée au barème** : 41 déclarations l'employaient avant qu'elle
  n'existe. `750`, `650`, `550`, `450`, `850` (83 déclarations) n'existent dans aucune
  police de plateforme — le moteur les ramène déjà à la plus proche ; les nommer
  changerait le rendu Apple, et elles attendent la même passe visuelle.
- Les **chiffres sont tabulaires partout** (`font-variant-numeric`), parce que presque
  tout ce qui bouge dans une interface de média est un nombre.

### Élévation sur noir : une lueur, pas une chute

Règle : **sur fond noir, l'élévation est une surface plus claire bordée d'un filet,
jamais une ombre portée.** Le halo d'encre blanche est **réservé à l'anneau de focus**
— il sert aujourd'hui aux deux, ce qui est précisément pourquoi il ne signifie plus
rien.

### Les deux températures, avec leur règle

| | Froid | Chaud |
|---|---|---|
| Jeton | `--sh-accent` (90, 180, 220) | `--sh-focus-ring` (255, 159, 10) |
| Sens | progression, sélection, « nouveau », information | **position** : où je suis, à trois mètres |
| Interdit | — | décor, bouton, pastille, icône non focus |

Et la conséquence mesurable, désormais réglée : `#ff9f0a` apparaissait **36 fois** en
clair dans les composants, contre 20 usages du jeton — la règle « seule chose de cette
couleur à l'écran » était fausse par construction. Les 34 écritures hors repli
consomment maintenant `var(--sh-focus-ring)`. Comme le jeton est le seul des quatre
teintes système à être redéfini en thème clair (`rgb(198, 92, 0)`), ces copies gardaient
l'orange de nuit sur fond blanc : les suivre est un correctif, pas un changement
d'humeur.

### Mouvement

Le mouvement **répond à un geste**. La distinction est déjà écrite dans les jetons
(`--sh-dur-*` décrit une transition, `--sh-loop-*` une boucle) ; les 19 animations
`infinite` la contredisaient. **Six sont parties** — dont `sh-ken-burns`, un zoom
perpétuel de 36 secondes sur le fond, le nom de son propre cliché. Les 14 qui restent
sont des signaux d'attente (rotations, squelettes, scintillements) et le témoin de
lecture en cours : une boucle qui dit « ça travaille » est légitime, une boucle qui
meuble les murs ne l'est pas.

### Les capitales quittent les métadonnées

14 sites portent des libellés en capitales espacées (tags, badges, libellés de cellules
de la fiche, libellé du champ de connexion). Les capitales détruisent la silhouette des
mots — elles coûtent exactement ce que la TV ne peut pas payer, la lecture à distance.
La hiérarchie passe par la graisse et le dégradé d'encre. La casse reste disponible
pour une vraie séquence, jamais pour du décor.

## Règles de l'identité

1. **Les affiches sont la seule chose saturée de l'écran.**
2. **Le froid informe, le chaud situe** — et l'anneau est la seule chose de sa couleur.
3. **Une seule famille, trois appareils : la distance change l'échelle, jamais la police.**
4. **Un écran montre au plus trois surfaces ; on n'encadre pas du contenu qui est déjà
   du contenu.**
5. **Le mouvement répond à un geste ; seul le direct respire.**
6. **Le survol est une affordance de pointeur fin, jamais une promesse.** Un
   `:hover` vit dans `@media (hover: hover)` ; ce que le doigt ne peut pas
   survoler reçoit un retour à la PRESSE (`:active`, 0,97, 120 ms). Un survol non
   gardé ne fait pas que ne pas s'appliquer : il colle après un tap.
7. **Une ombre est un ÉTAT, pas un mouvement ; un flou d'apparition n'est pas un
   mouvement du tout.** L'ombre change AVEC l'état, sans fondu — le déplacement dit
   « ça se lève », l'ombre dit « cette surface est levée », et le repaint de la zone
   floutée à chaque image ne se paie pas pour redire ce que le déplacement raconte.
   Le flou d'un élément déjà invisible (opacité 0) qui se défloute en apparaissant est
   retiré : le fondu et l'échelle portaient déjà l'apparition.

## Le chantier, et son ordre

Aucun comportement, aucun gabarit, aucune classe : une direction applicable par jetons,
et une mesure à chaque étape. Du plus visible au moins risqué — et **avec son état**,
parce qu'un document de direction qui ne dit pas ce qui est fait est un document de
plus :

1. **Typographie — FAITE.** La famille vient de la plateforme, la feuille Google est
   partie, le barème commence à 12 px et 348 déclarations consomment l'échelle (448
   tailles littérales → 100, 316 graisses → 83).
2. **Les étiquettes en capitales — FAITES.** 9 déclarations retirées, y compris
   `.sh-badge` du système, dont personne ne consommait la règle. Le verre, lui, est
   toujours à 10 `backdrop-filter` pour un plafond de 10 : **saturé**, et c'est un
   changement de surface, pas une correction — il attend sa passe.
3. **Rayons et couleurs — FAITES pour la part mécanique.** 202 `border-radius`
   rejoignent les paliers (447 → 243 littéraux, 3 → 205 usages) ; les quatre teintes
   système Apple deviennent des jetons (80 écritures en clair), et le halo de sélection
   suit enfin `--sh-focus-ring`, le seul des quatre redéfini en thème clair. Ce qui
   reste — 530 hexadécimaux, 243 rayons, 100 tailles intermédiaires — demande un
   arbitrage par écran.
4. **Les courbes — FAITES.** 753 → 0 : le `ease` du navigateur a disparu des feuilles,
   747 transitions consomment `var(--sh-ease-out)` et 6 boucles passent à `linear`.
5. **Les ombres et les flous animés — FAITS.** 224 → 0, et la coupe s'est faite en
   deux temps parce qu'elle a deux natures. **167 déclarations** nommaient `box-shadow`
   ou `filter` sans qu'AUCUN état ne change la valeur : elles n'avaient jamais rien
   animé, et c'est un prune mécanique, prouvé par la comparaison des valeurs effectives
   entre l'état et ses états. Les **47 qui animaient vraiment** une ombre (un halo qui
   s'allume au survol) ne l'animent plus : l'ombre suit l'état. Les **23 flous** qui
   restaient étaient tous le même motif — un élément invisible qui se défloute en
   apparaissant — et ils ont été retirés, pas remplacés.

6. **Le survol — FAIT.** 230 → 0 : chaque règle `:hover` est dans un
   `@media (hover: hover)`, et les 18 règles qui n'avaient qu'un survol pour
   afforance ont leur retour à la presse. La couverture du retour à la presse passe
   de **17 à 102 surfaces** : la coquille GSM était couverte, tout le CONTENU qu'on
   touche (cartes, rangées, boutons de média) ne l'était pas — et maintenant que le
   survol est gardé, ces surfaces n'auraient plus rien dit du tout. La neutralisation
   `@media (hover: none)` de `GsmNav.css`, qui corrigeait neuf sélecteurs APRÈS
   COUP, est retirée : la garde est à la source.

### Ce qui reste, mesuré

| Chantier | Mesure du jour | Pourquoi il n'est pas fait |
|---|---|---|
| Verre | **10 `backdrop-filter`** (plafond 10, saturé) | C'est un changement de surface, avec un coût GPU à mesurer sur le parc |
| Teintes intermédiaires | **530 hexadécimaux**, **243 rayons**, **100 tailles**, **83 graisses** | Chaque valeur est un choix entre deux paliers, sur une mise en page qu'il faut regarder |
| Budget de démarrage | **275,0 ko gzip pour 276 ko** | Un kilo de marge : c'est LUI qui a refusé la police auto-hébergée, et toute fonctionnalité qui ajoute du JavaScript au démarrage demande désormais une décision explicite |

### View Transitions : bloquées par le parc, et documentées comme telles

`<dialog showModal()` (Chromium 114) et `popover` (Chromium 114) sont **hors de portée
du plancher du parc**, Chromium M108 — voir `scripts/plancher-navigateur-check.mjs`,
qui refuse désormais toute API au-delà. Les `<dialog>` de ce dépôt doivent utiliser
`showModal()` (Chromium 37, disponible), mais l'attribut `popover` et
`document.startViewTransition` (Chromium 111 pour la première version) demanderaient de
relever le plancher : c'est une décision de parc, pas de code. À reprendre le jour où
le plus vieux téléviseur supporté change.

## Ce qui empêche la dérive

Un cliquet à chaque étape, dans le style de `scripts/*-check.mjs`, tous dans
`npm run test` : ces compteurs ne remontent pas. `scripts/systeme-design-check.mjs`
en tient **18 plafonds et 6 planchers** — littéraux, consommation des jetons, plancher
de lisibilité, familles de police déclarées (0), origines de police externes (0),
sources de vérité des jetons (3 sites nommés), vocabulaire des états (22 noms, aucun
hors liste). C'est la seule façon connue dans ce dépôt de faire tenir un vert qui
décrit vraiment ce que l'écran affiche.
