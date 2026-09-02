# Architecture de SpaceHub

*Dernière révision : 2 septembre 2026.*

> Ce document décrivait jusqu'ici SpaceHub comme « un plugin JavaScript/CSS
> injecté dans Jellyfin Web », avec GridStack et Chart.js. Ce mode a été
> **entièrement supprimé** du dépôt. Ce qui suit décrit ce qui existe réellement.

## Ce qu'est SpaceHub

Une **application web autonome** qui parle à un serveur Jellyfin par son API
REST. Elle ne s'injecte dans rien : elle se sert elle-même, depuis n'importe
quel serveur de fichiers, et vise trois usages — ordinateur, téléviseur et
mobile.

Aucun framework d'interface. Des modules ES natifs, empaquetés par Vite.

## Plancher navigateur

C'est une contrainte structurante, pas un détail de configuration. Les
téléviseurs embarquent des moteurs anciens et figés :

| Modèle Samsung | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|---|
| Chromium | M47 | M56 | M63 | M69 | M76 | M85 | M94 | M108 | M120 | M130 |

`vite.config.js` fixe donc `build.target: 'chrome69'`. Avec la valeur
précédente — `esnext` — le bundle partait avec 704 `?.` non transpilés, dont la
seule présence fait échouer l'**analyse** du fichier sur Chromium < 80 : écran
blanc, sans message ni trace.

esbuild ne traduit que la **syntaxe**. Les API manquantes (`Array.at`,
`replaceChildren`, `Promise.allSettled`, le signal d'`addEventListener`) sont
couvertes par `core/compat.js`, chargé en tout premier — avant même le code
d'amorçage de Vite, qui utilise lui-même `Array.at`.

Un scénario de `npm run test:e2e` démarre l'application avec ces quatre API
retirées, pour que la régression soit détectée et non supposée.

## Les couches

```
index.html
   └── core/SpaceHub.js          amorçage, ~41 services enregistrés
          │
          ├── core/              socle technique
          ├── ui/                interface
          ├── jellyfin/          tout ce qui parle au serveur
          ├── integrations/      Servarr (optionnel)
          └── plugins/           extensions tierces
```

### core/ — socle

| Module | Rôle |
|---|---|
| `SpaceHub.js` | Point d'entrée. Construit et enregistre les services. |
| `ServiceRegistry.js` | Registre de dépendances. `SpaceHub.services.list()` dit ce qui est prêt. |
| `services.js` | Accesseurs nommés adossés au registre, avec repli sur la façade globale. |
| `compat.js` | Prothèses d'API pour les navigateurs de téléviseurs. |
| `EventBus.js` | Publication/abonnement entre modules. |
| `ApiClient.js` | Client HTTP : reprise sur erreur, détection d'absence de proxy. |
| `SettingsManager.js` | Réglages persistants (localStorage). |
| `CacheManager.js` | Cache mémoire et localStorage. |
| `Router.js` | Navigation entre vues. |
| `SpatialNavigation.js` | Navigation à la télécommande : scopes, focus, pile de couches. |
| `DomContracts.js` | Source de vérité des sélecteurs partagés DOM ↔ navigation. |
| `InputMapper.js` / `GamepadInput.js` / `TouchEngine.js` | Entrées clavier, manette, tactile. |
| `TvModeManager.js` | Mode TV : échelle, zone de sûreté, coupure du flou. |
| `ErrorBoundary.js` | Frontière d'erreur locale et globale. |
| `ParentalControl.js` | Verrouillage par classification (garde-fou d'interface). |
| `FeatureFlags.js` | Fonctionnalités gelées, réactivables. |
| `OfflineStore.js` | Stockage IndexedDB des médias téléchargés. |
| `PluginManager.js` / `PluginCatalog.js` / `PluginPermissions.js` / `PolicyService.js` | SDK d'extensions. |

### ui/ — interface

`layouts/` (AppLayout, Dashboard) · `views/` (Library, Downloads, Login, Admin,
Console) · `components/` (CardBuilder, ModalSlideUpSheet, SettingsPanel,
HeroSpotlight, Toaster, Modal, AppSidebarDrawer…) · `widgets/` (les tuiles du
tableau de bord) · `themes/` (ThemeManager et ses préréglages).

**Le CSS ne vit plus dans le JavaScript.** Chaque composant a son fichier
`.css` voisin, importé par le module et empaqueté par Vite. Les tokens
(`public/design-system/tokens.css`) sont servis tels quels et référencés en tête
de `index.html` : ils doivent précéder la feuille générée, sans quoi ils
écraseraient les composants.

### jellyfin/ — le serveur

`api/` · `auth/` (dont la liste des comptes publics) · `player/` (VideoPlayer,
DeviceProfile, PlayQueue) · `offline/` (DownloadManager) · `remote/` (lecture à
distance) · `search/` · `metadata/` · `collections/` · `analytics/` · `calendar/`.

**Négociation de lecture.** Le lecteur appelle `/Items/{id}/PlaybackInfo` avec
un `DeviceProfile` construit à partir des capacités réellement mesurées
(`canPlayType()`), puis suit l'URL que le serveur renvoie. Il n'attaque plus
`master.m3u8` directement, ce qui forçait un transcodage permanent.

## Navigation à la télécommande

```
clavier / manette / télécommande
              │
              ▼
        InputRouter            un seul écouteur de bas niveau,
              │                gestionnaires triés par priorité déclarée
   ┌──────────┼──────────┬──────────┐
   ▼          ▼          ▼          ▼
recherche  lecteur    modales   navigation   (100 … 10)
                                     │
                                     ▼
                              InputMapper    (touche → action)
                                     │
                                     ▼
                            SpatialNavigation (scope, géométrie, focus)
                                     │
                        ┌────────────┴────────────┐
                        ▼                         ▼
                  pile de couches          CarouselController
                (quelle couche              (défilement
                 est au-dessus)              horizontal)
```

`InputRouter` est l'entrée unique du clavier. Auparavant, neuf écouteurs
globaux se partageaient les touches et **leur ordre n'était écrit nulle part** :
il découlait de la phase de propagation (un écouteur sur `document` passe avant
un écouteur sur `window`) et de l'ordre de construction des modules au
démarrage. Déplacer une ligne d'initialisation pouvait donc changer le
destinataire de la touche Échap, sans qu'aucun test ne le voie.

Les priorités sont maintenant des constantes (`PRIORITES` dans
`core/InputRouter.js`) : recherche 100, modales 90, lecteur 80, bande-annonce
75, feuille 70, hero 60, routeur 50, navigation spatiale 10 — le moteur de
navigation est délibérément le dernier servi, puisqu'il est le repli. Un
gestionnaire qui renvoie `true` consomme la touche, ce qui remplace les
`stopPropagation()` implicites d'avant. `npm run test:input` empêche tout
nouvel écouteur clavier global.

La **pile de couches** enregistre l'ordre d'ouverture réel. « Retour » ferme
donc celle du dessus, et non la première d'une liste figée — un ordre déclaré
faisait fermer les réglages situés *sous* la recherche.

`DomContracts.js` déclare les sélecteurs ; `npm run test:nav` vérifie que chacun
est réellement **émis** par l'application. C'est ce contrôle qui empêche la
dérive entre le DOM et le moteur, à l'origine de la quasi-totalité des bugs de
navigation rencontrés.

### Les trois attributs de navigation

Trois mécanismes empruntés aux systèmes professionnels (voir
[NAVIGATION_ETAT_DE_LART.md](NAVIGATION_ETAT_DE_LART.md)) sont pilotés par des
attributs HTML. Tous sont **additifs** : sans l'attribut, le comportement est
exactement celui d'avant.

| Attribut | Sur | Effet |
|---|---|---|
| `data-nav-up\|down\|left\|right="<sélecteur>"` | un élément focalisable | Redirige le focus vers l'élément désigné, avant toute considération de géométrie. La valeur `none` bloque la direction. |
| `data-nav-remember` | un conteneur | Le conteneur retient sa dernière position focalisée, comme les carrousels le font déjà. |
| `data-nav-container="auto\|strict"` | un conteneur | `auto` : chercher d'abord dedans, puis remonter au parent. `strict` : ne jamais laisser sortir — pour une modale ou un menu. |
| `data-focus` | *(posé par le moteur)* | Identifiant du dernier élément focalisé dans ce conteneur. Ne pas l'écrire à la main. |

**Redirection** — l'équivalent d'un `UIFocusGuide` de tvOS, d'un `leaveFor`
d'Enact ou d'un `nextFocusDown` d'Android TV : désigner une destination sans
tordre la mise en page pour satisfaire l'algorithme.

```html
<!-- Depuis ce bouton, Bas mène au premier film, pas au voisin géométrique. -->
<button data-nav-down="#sh-first-movie">Tout voir</button>
<!-- Bord dur : Haut ne fait rien depuis ici. -->
<div class="sh-card" data-nav-up="none"></div>
```

Une redirection dont le sélecteur ne correspond à rien, vise un élément
invisible ou est mal formé **laisse la géométrie reprendre la main**. Une
redirection cassée ne doit jamais immobiliser l'utilisateur — c'est le pire
défaut possible pour ce genre de mécanisme.

À utiliser avec parcimonie : Android TV donne la règle inverse — « s'il
n'existe pas de chemin direct vers un contrôle, déplacez-le ». La redirection
est un pansement, une mise en page atteignable est préférable.

**Mémoire de rangée** — quitter un carrousel en huitième position et y revenir
en huitième position, au lieu de retomber sur la première carte visible. C'est
le `enterTo: 'last-focused'` d'Enact, l'`activeChild` de LRUD, le `data-focus`
de lrud-spatial. Volontairement limitée au déplacement vertical : gauche/droite
est un déplacement *dans* la rangée. La mémoire se périme d'elle-même quand
l'élément mémorisé quitte le DOM.

**Sortie de l'application** — quand « Retour » n'a plus aucune couche à fermer,
`_quitterApplication()` appelle la sortie Tizen, puis `webOS.platformBack`, puis
— en mode TV seulement, et seulement s'il y a une page où revenir — remonte
l'historique. Android TV impose que Retour finisse par ramener au lanceur ; ne
rien faire donnait l'impression d'une application coincée. Hors mode TV, Échap
au niveau racine ne fait rien, comme dans toute application web.

### Limite connue

La parité clavier / manette / télécommande est établie **hors du lecteur** : les
trois entrent dans le même moteur de répétition (`_startInputRepeat`, cadence
180 → 100 → 70 → 45 ms). Dans le lecteur en revanche, la manette suit une
cadence propre (280 ms puis 100 ms) tandis que le clavier s'appuie sur la
répétition native du système (≈500 ms puis ≈30 ms) : l'avance rapide accélère
donc plus vite au clavier. C'est délibéré, c'est le seul écart mesurable qui
subsiste, et il ne peut être arbitré qu'en recette réelle — voir
[RECETTE_MATERIEL.md](RECETTE_MATERIEL.md), tests A21 et B8.

## Modes de déploiement

**Développement** — `npm run dev`. Vite sert les modules et expose le proxy
`/api-proxy` qui contourne CORS pour les services Servarr. Le service worker est
volontairement désactivé.

**Production** — `npm run build`, puis servir `dist/`. Le proxy `/api-proxy`
**n'existe plus** : il faut un reverse-proxy en façade. Voir
[DEPLOIEMENT.md](DEPLOIEMENT.md), qui donne des configurations nginx et Caddy.
Le code détecte désormais l'absence de proxy et le dit, au lieu de recevoir du
HTML là où il attend du JSON.

## Vérification

```
npm run verify     # tests statiques + build + bout en bout
```

| Suite | Ce qu'elle prouve |
|---|---|
| `lint` | Les fichiers s'analysent. |
| `test:unit` | 159 tests unitaires : Router, ApiClient, InputMapper, InputRouter, SpatialNavigation, PluginManager, gabarits extraits, attributs de navigation. |
| `test:smoke` | Les services s'instancient. |
| `test:nav` | Les sélecteurs déclarés sont réellement émis. |
| `test:input` | Aucun écouteur clavier global hors du routeur d'entrée. |
| `test:css` | Aucun CSS en JS, aucune feuille orpheline, plafond de flou tenu. |
| `test:xss` | Aucune donnée serveur non échappée hors des cas documentés. |
| `test:globals` | Le nombre d'accès directs à `window.SpaceHub` ne remonte pas. |
| `test:e2e` | Treize comportements vérifiés dans un vrai navigateur. |

Les contrôles statiques lisent le code ; `test:unit` et `test:e2e` l'exécutent.
C'est la distinction qui compte : `lint` et `smoke` ne pouvaient
structurellement pas détecter un sélecteur ne correspondant à rien, c'est-à-dire
la totalité des bugs de navigation trouvés en test réel.

Trois défauts ont été trouvés **par ces tests**, pas par relecture, ce qui est
le meilleur argument pour les avoir écrits :

- `ApiClient` prétendait retenter les réponses `429` — le code l'exemptait bien
  du rejet immédiat, puis le rejetait dix lignes plus bas. L'intention était
  écrite, le comportement était l'inverse.
- `AnimeWidget` injectait un nom de bibliothèque venu du serveur en HTML non
  échappé, tout en figurant dans la liste blanche du contrôle d'injection avec
  la mention « constante du code ».
- Le contrôle d'injection lui-même s'arrêtait au premier gabarit imbriqué : il
  n'examinait que 194 interpolations sur 509. Quinze injections non échappées
  s'y cachaient (noms de torrents, d'indexeurs, titres Sonarr/Radarr). Voir
  [XSS_EXCEPTIONS.md](XSS_EXCEPTIONS.md).

## Gabarits

Les quatre plus gros littéraux HTML vivent dans des modules `*.template.js`
dédiés (`VideoPlayer.template.js`, `ModalSlideUpSheet.template.js`,
`LibraryView.template.js`, `JellyfinConsoleModal.template.js`). Ce sont des
fonctions pures : elles transforment un objet de valeurs en chaîne, sans lire ni
écrire le DOM.

L'extraction est mécanique — la seule transformation appliquée au texte est
`this.` → `ctx.` — et `tests/gabarits.test.js` le **prouve** : il compare le
HTML produit à une empreinte prise sur le code d'origine, avant tout
déplacement. Les valeurs de test contiennent `<`, `&` et `"` pour qu'un
échappement ajouté ou retiré se voie, et les `.map()` sont réellement exécutés.

Les quatre fichiers hôtes ont perdu de 21 à 27 % de leur volume ; le contrôle
d'injection scanne les modules extraits, pour qu'un gabarit qui déménage ne
sorte pas du champ de la vérification.
