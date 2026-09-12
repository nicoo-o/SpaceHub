# CONTEXT.md — le vocabulaire du domaine

Ce fichier donne des **noms** aux concepts qui portent une couture. Il n'explique pas
comment le code marche — c'est le rôle de [ARCHITECTURE.md](docs/ARCHITECTURE.md) —
il fixe le mot juste pour que les revues d'architecture, les ledgers et les
propositions d'approfondissement ne réinventent pas trois synonymes par concept.

Une règle : si un module nouveau est nommé d'après un concept absent d'ici, on
l'ajoute ici **dans le même commit**. Un vocabulaire qui dérive ne sert plus à rien.

## Navigation et focus

| Terme | Ce qu'il désigne | Où il vit |
|---|---|---|
| **Moteur de focus** | Le module qui sait où l'utilisateur est, et comment s'y déplacer. Une seule porte pour la manette, le tactile, le clavier et le retour système. | `core/SpatialNavigation.js` |
| **Scope** | Une région nommée dont le moteur collecte les focusables — `sidebar`, `search`, `dynamicIsland`, `player`, `generic`. Les sélecteurs sont un contrat, pas un détail. | `core/DomContracts.js`, épinglé par `scripts/nav-contract-check.mjs` |
| **Focusable** | Un élément atteignable au déplacement : `[data-nav-focusable="true"]`, ou un sélecteur de scope. | gabarits des modules |
| **Registre de focusables** | Le geste par lequel un module déclare ce qu'on peut atteindre chez lui, et le retire en partant. | appelé par 9 modules |
| **Couche** | Une surface qui prend le focus en s'ouvrant et le rend en se fermant — modale, feuille, tiroir, popover. Le moteur en tient une pile. | `Modal`, `ModalSlideUpSheet`, `SettingsPanel`, `AppSidebarDrawer`, `OnboardingWizard` |
| **Mémoire de focus** | Le souvenir, par conteneur, de l'élément qui avait le focus ; il y est rendu au retour. | `data-focus`, vague A |
| **Redirection déclarative** | Un attribut qui force la cible d'un déplacement contre la géométrie : `data-nav-up`, `data-nav-down`, `data-nav-left`, `data-nav-right`. | gabarits, vague A |
| **Appui** | Une pression physique, qui produit **une** étape de navigation. Le coût d'un appui doit rester borné. | vague B |
| **Racine** | Le niveau sans couche au-dessus. Retour y sort de l'application **en mode TV seulement** — décision assumée de la vague A. | `demandeRetour()` |
| **Intention** | Ce qu'un appelant veut du moteur, par opposition à *comment* il le fait. L'interface approfondie s'exprime en intentions ; la géométrie, les scopes et la pile cessent d'être publiques. | à introduire par l'approfondissement en cours |
| **Diagnostic** | La trace d'une décision de déplacement, destinée au HUD de débogage. Un seul appelant : le HUD. | surface à parquer derrière une couture de débogage |

## Méthode de travail — approfondissement et décomposition

| Terme | Ce qu'il désigne | Où il vit |
|---|---|---|
| **Peau** | Une unité de décomposition livrée sur sa propre branche, avec sa chaîne verte et son budget baissé. Une peau = une PR. | `docs/DECOMPOSITION_VIDEOPLAYER.md` |
| **Ledger** | Le registre d'une décomposition : peaux atterries, lignes extraites par module, budget final, ce que le monolithe fait encore. | `docs/DECOMPOSITION_VIDEOPLAYER.md` |
| **Budget** | Le plafond de lignes d'un fichier, dans une liste qui **ne peut que descendre**. Un plafond calé sur la taille actuelle interdit toute croissance. | `scripts/taille-monolithes-check.mjs` |
| **Façade** | Le contrat entre un module et ses appelants : les seules méthodes qu'ils ont le droit d'appeler. | `scripts/facade-appelants-check.mjs` |
| **Tolérance de façade** | Une exception documentée où des appelants atteignent un membre privé, en attendant une vraie entrée publique. | ledger du lecteur (`_video`, `_queue`) |
| **Cliquet** | Un contrôle qui refuse une régression vers l'état antérieur — un plafond qui ne remonte pas, une exception qui ne s'ajoute pas. | `scripts/*-check.mjs` |
