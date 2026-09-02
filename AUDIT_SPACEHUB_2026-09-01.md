# Audit professionnel complet — SpaceHub (nouvelle passe)

> **Projet :** SpaceHub — client web unifié pour Jellyfin et l'écosystème Servarr
> **Date :** 1er septembre 2026
> **Portée :** relecture complète du code présent dans le dossier de travail (état non commité inclus), avec priorité explicite sur la navigation TV/manette signalée comme cassée en test réel, plus performance, réalité serveur des plugins/SDK, lecteur vidéo, UI (centrage/animation), et cohérence globale.
> **Méthode :** lecture ligne par ligne du moteur de navigation et de ses dépendances, du lecteur vidéo, du système de plugins, d'un échantillon représentatif des intégrations et de l'UI ; recoupement avec `AUDIT_PROFESSIONNEL.md` et `PLAN_CORRECTIONS.md` du 31 août pour distinguer ce qui a été réellement corrigé de ce qui reste ouvert ; recoupement avec l'historique Git (26 commits de refonte navigation entre `v9.0` et `v11.0` en quelques jours, ce qui est en soi un signal important — voir §0).
> **Limite :** comme pour l'audit précédent, aucun accès à un serveur Jellyfin/Servarr réel n'a été possible depuis cet environnement. Tout ce qui suit sur la navigation, en revanche, est démontré **par la logique du code lui-même**, indépendamment d'un serveur — ce sont des bugs de calcul et de séquencement JavaScript, pas des hypothèses de recette.

---

## 0. Constat préalable — pourquoi la navigation "cassée" n'est pas surprenante

L'historique Git du dépôt contient, sur une fenêtre très courte, une série ininterrompue de commits présentés comme des refontes **définitives** de la navigation :

```
feat(navigation): refonte majeure Navigation v10
fix(navigation): refonte industrielle v10.1 (... Enter instantané ...)
feat(navigation): finalisation v10.2 (Registry 100% strict sans fallback flou ...)
feat(navigation): refonte industrielle finale v10.3 (Garantie 10/10 Scopes ...)
feat(navigation): refonte industrielle v10.4 définitive (...)
fix(navigation): refonte v11.0 finale (... Algorithme Spatial W3C Pur ...)
```

Six à sept réécritures **"définitives"** du même sous-système en quelques jours ne sont pas un signe de solidité — c'est le symptôme classique d'un correctif qui traite les effets (tel scénario précis rapporté comme buggé) sans jamais fermer la boucle sur la cause profonde. La lecture du code confirme exactement ce diagnostic : la version actuelle (v11.0) est mieux organisée que les précédentes, mais elle a hérité — sans les résoudre — de **trois défauts architecturaux qui garantissent que de nouveaux bugs de navigation continueront d'apparaître à chaque nouvelle vue ou widget ajouté** :

1. Plusieurs systèmes de clavier/manette indépendants coexistent et traitent parfois **le même événement deux fois**.
2. Le registre de scopes de focus est une simple `Map` **mutable à chaud** : n'importe quel widget peut réécrire la définition d'un scope existant, sans garde-fou, avec un bug de logique déjà présent dans un widget livré par défaut.
3. Le défilement des carrousels est déclenché **deux fois pour une seule pression de touche**, par deux chemins de code différents qui ne se connaissent pas.

Ces trois points sont détaillés et démontrés ci-dessous. Ils suffisent à expliquer, sans avoir besoin d'invoquer un problème serveur ou réseau, pourquoi la navigation "semble cassée" en usage réel alors que chaque commit individuel "corrige" un cas précis : le prochain cas précis est déjà programmé par construction.

---

## 1. Navigation TV / manette — bugs concrets identifiés

### 1.1 🔴 Le défilement des carrousels est doublé à chaque pression (bug critique, reproductible)

**Fichiers :** `core/CarouselController.js`, `core/SpatialNavigation.js`

Quand le focus est dans un carrousel horizontal et qu'une flèche gauche/droite est pressée, `SpatialNavigation._findSpatialTarget()` appelle :

```js
const targetCard = this._carouselController.navigate(currentCarousel, current, direction, ...);
if (targetCard) return targetCard;
```

`CarouselController.navigate()` calcule la carte cible **et fait défiler le carrousel lui-même** en interne :

```js
navigate(carousel, currentCard, direction, isFastScroll = false) {
    ...
    this.scrollToCard(carousel, targetCard, isFastScroll ? 'auto' : 'smooth'); // 1er scroll
    return targetCard;
}
```

Le focus est ensuite posé sur la carte retournée via `setFocus()`, qui **refait défiler le même carrousel une seconde fois** :

```js
setFocus(element, {...}) {
    ...
    const carousel = element.closest('.sh-carousel-scroller, ...');
    if (carousel && scroll) {
        this._carouselController.scrollToCard(carousel, element, ...); // 2e scroll
    }
}
```

Et `scrollToCard()` utilise `scroller.scrollBy({ left: centerTarget, behavior })` — **`scrollBy` est un défilement relatif** (il s'ajoute à la position courante), pas absolu comme `scrollTo`. Les deux appels ont lieu de façon synchrone dans le même tick JavaScript, donc les deux lectures de `getBoundingClientRect()` renvoient la géométrie *avant tout défilement* : les deux appels calculent un delta quasi identique et l'additionnent au scroll courant.

**Conséquence concrète :** chaque pression de flèche gauche/droite dans un carrousel fait défiler le rail **environ deux fois plus loin que la carte suivante**, ce qui produit exactement la sensation décrite par l'utilisateur — un défilement qui saute, dépasse la carte visée, ou "rebondit". En appui long (fast-scroll), l'effet est encore plus visible car il se cumule à chaque tick de répétition (jusqu'à ~13 fois/seconde en régime rapide).

**Correction recommandée :** `CarouselController.navigate()` ne doit **plus** appeler `scrollToCard()` lui-même — il doit rester une fonction pure qui calcule seulement la carte cible. Seul `SpatialNavigation.setFocus()` doit avoir la responsabilité du défilement, une fois, à la fin de la synchronisation de focus.

### 1.2 🔴 Le lecteur vidéo traite chaque touche deux fois via deux moteurs clavier indépendants (bug critique, reproductible)

**Fichiers :** `jellyfin/player/VideoPlayer.js`, `core/SpatialNavigation.js`

`VideoPlayer` enregistre son propre écouteur global au montage du player :

```js
document.addEventListener('keydown', this._keyHandler = (e) => this._onKeyDown(e));
```

`_onKeyDown()` (≈250 lignes) réimplémente en totalité la navigation clavier du player : déplacement entre les boutons du dock, avance/recul sur la timeline avec accélération selon la durée d'appui (5 s → 30 s → 300 s de saut), focus haut/bas, fermeture au `Escape`/`Enter` sur le bouton retour, navigation dans les popovers audio/sous-titres.

Au même moment, `SpatialNavigation._handleKeyDown()` — un écouteur **séparé**, posé sur `window` — détecte que le scope courant est `'player'` et délègue **la même touche** à :

```js
const player = window.SpaceHub?.player;
if (player && typeof player.handleNavAction === 'function') {
    player.handleNavAction(action); // ré-exécute une logique quasi identique
}
```

`handleNavAction()` (lignes 1769+) réimplémente **une deuxième fois** une bonne partie de la même logique (déplacement entre boutons du dock, seek ±10 s sur la timeline, focus haut/bas). Comme aucun des deux gestionnaires n'appelle `stopPropagation()`, et que l'écouteur sur `document` (VideoPlayer) se déclenche avant celui sur `window` (SpatialNavigation) dans l'ordre de propagation DOM, **une seule pression de touche produit deux actions successives** :

- Sur les boutons du dock : `ArrowRight` déplace le focus au bouton suivant via `_onKeyDown`, puis `handleNavAction` lit le nouveau `document.activeElement` (déjà déplacé) et le déplace **encore d'un cran** → le focus avance de deux boutons au lieu d'un.
- Sur la timeline : `_onKeyDown` fait un saut progressif (5 à 300 s selon la durée d'appui), puis `handleNavAction('left'/'right')` déclenche **un second saut fixe de 10 s** dans la même direction → la position de lecture "saute" de façon incohérente avec ce que l'utilisateur attend.
- Sur `Escape`/`Menu` : les deux chemins peuvent chacun appeler une fermeture/action de retour, avec un risque de double effet selon l'état.

**Conséquence concrète :** c'est très probablement la source la plus visible du ressenti "navigation cassée" côté télécommande/manette, puisque le lecteur vidéo est l'écran où l'utilisateur navigue le plus intensément avec une télécommande.

**Correction recommandée :** choisir **une seule** autorité de navigation clavier pour le player. Le plus propre est de supprimer entièrement `_onKeyDown()` et son `document.addEventListener('keydown', ...)`, et de ne conserver que `handleNavAction()`, appelé exclusivement par `SpatialNavigation` (qui a déjà toute la logique de mapping clavier/manette centralisée dans `InputMapper`). Cela supprime aussi une duplication de ~250 lignes.

### 1.3 🟠 Le registre de scopes de focus est mutable à chaud, et un widget livré par défaut casse le confinement du scope Jellyseerr (bug reproductible)

**Fichiers :** `core/SpatialNavigation.js`, `integrations/jellyseerr/JellyseerrWidgets.js`

Le moteur définit au démarrage un scope `'jellyseerr'` correctement confiné :

```js
this.registerFocusables('jellyseerr', (root = document) => {
    const scopeRoot = root.querySelector('.sh-jellyseerr-view') || root;
    return Array.from(scopeRoot.querySelectorAll('.sh-jellyseerr-bento-card, ...'));
});
```

Mais `registerFocusables()` ne fait **aucune vérification** avant d'écraser une entrée existante — c'est un simple `Map.set()`. Or `JellyseerrTrendingWidget.render()` (le widget "Tendances & Découverte" affiché par défaut sur le tableau de bord) **réenregistre ce même scope** à chaque rendu :

```js
spatialNav.registerFocusables('jellyseerr', root => {
    const scopeRoot = root || document.querySelector('.sh-jellyseerr-view') || document;
    return Array.from(scopeRoot.querySelectorAll('.sh-jellyseerr-bento-card, ...'));
});
```

Le bug est dans le `root || ...` : quand `SpatialNavigation.getFocusables()` invoque ce provider, il lui passe toujours `this._root` (qui vaut `document`, jamais `null`/`undefined`). `root` est donc **toujours véridique**, et `scopeRoot = root` **avant même d'essayer** `.sh-jellyseerr-view` — un élément qui, de toute façon, **n'existe nulle part dans le DOM réellement rendu** (vérifié par recherche exhaustive : la classe `.sh-jellyseerr-view` n'est jamais assignée à un élément, seulement citée dans des sélecteurs qui la cherchent en vain).

**Conséquence concrète :** dès que le widget Jellyseerr du tableau de bord s'affiche une fois, le scope `'jellyseerr'` devient **document entier** pour le reste de la session — la confinement de scope annoncé dans les commentaires ("Isolation hermétique des providers", "Scopes... Explicites") ne tient plus. Si l'utilisateur navigue avec le focus dans une carte Jellyseerr, une pression de flèche peut l'envoyer n'importe où ailleurs sur la page (widgets non liés), ce qui est perçu comme un focus qui "saute au hasard".

**Correction recommandée :** (a) interdire la réécriture silencieuse d'un scope existant dans `registerFocusables()` — avertir ou refuser sauf appel explicite `force: true` ; (b) supprimer le second appel `registerFocusables('jellyseerr', ...)` dans `JellyseerrWidgets.js`, qui est redondant et bogué ; (c) donner réellement la classe `.sh-jellyseerr-view` au conteneur pertinent, ou retirer la référence morte des sélecteurs.

### 1.4 🟠 Le clavier et la manette utilisent deux moteurs de répétition différents, avec un comportement visuellement différent

**Fichiers :** `core/GamepadInput.js`, `core/SpatialNavigation.js`

Au clavier, un appui maintenu passe par `_startInputRepeat()` : cadence progressive (180 ms → 100 ms → 70 ms → 45 ms selon la durée d'appui) et bascule en `instantScroll: true` (scroll `auto`, sans animation) après 350 ms — pensé pour rester fluide en défilement rapide.

À la manette, `GamepadInput._processGamepad()` gère elle-même la répétition (délai initial 280 ms puis 100 ms fixe) et appelle directement `this._onAction(direction)`, c'est-à-dire `SpatialNavigation.handleAction()` — un chemin qui **ne passe jamais par `_startInputRepeat()`** et donc jamais par `instantScroll`. Résultat : à la manette, un défilement rapide maintenu redéclenche un scroll `smooth` (animé) toutes les 100 ms sans jamais basculer en scroll instantané, ce qui — combiné au bug de double-scroll du §1.1 — produit un défilement saccadé et imprévisible, sensiblement différent (et moins fluide) qu'au clavier pour la même action.

**Correction recommandée :** faire passer les directions issues de la manette par le même moteur de répétition que le clavier (`_startInputRepeat`/`_executeNavStep`), au lieu de dupliquer une logique de répétition parallèle dans `GamepadInput`.

### 1.5 🟠 Au moins onze gestionnaires `keydown` indépendants coexistent dans l'application

Recherche exhaustive des `addEventListener('keydown', ...)` : `AudioFeedback` (déverrouillage audio, inoffensif), `Router` (Échap/Ctrl+K/Ctrl+Alt+A), `SpatialNavigation` (le moteur central), `TrailerService`, `AnalyticsModal`, `CardBuilder` (par carte), `HeroSpotlightComponent` (correctement limité à la touche `P`, donc pas un problème), `Modal`, `ModalSlideUpSheet`, `VideoPlayer` (voir §1.2), `UnifiedSearch` (deux écouteurs : un global Ctrl+K/`/`, un local au spotlight).

Aucun de ces gestionnaires n'appelle `stopPropagation()`. Tant qu'ils sont correctement gardés par un test de visibilité/scope (comme `HeroSpotlightComponent`), ce n'est pas un problème. Mais **`Router` et `SpatialNavigation` traitent tous les deux `Escape` de façon indépendante** : `Router` émet un évènement `navigation:back` sur le bus (aujourd'hui sans abonné connu ailleurs que lui-même, donc inoffensif *pour l'instant*), pendant que `SpatialNavigation._handleBack()` ferme directement modale/tiroir/player. Le jour où un nouveau composant s'abonne à `navigation:back` en plus de gérer directement `Escape`, la même régression que celle du player (§1.2) réapparaîtra ailleurs. **Ce n'est pas encore un bug actif, mais c'est une dette qui a déjà produit un bug identique une fois — le pattern architectural doit être corrigé, pas seulement le symptôme du player.**

**Recommandation structurelle :** faire de `SpatialNavigation` la **seule** source d'écoute clavier/manette bas niveau. Les autres composants ne doivent réagir qu'à des évènements haut niveau qu'elle émet (`navigation:focusChanged`, `navigation:action`), jamais directement à `keydown`. C'est le seul moyen de garantir qu'une touche ne produit jamais deux effets.

### 1.6 🟡 L'algorithme spatial n'est pas l'algorithme qu'il prétend être

Le fichier s'intitule "Algorithme Géométrique Standard W3C Projection Overlap Pur" en commentaire. L'algorithme W3C CSS Spatial Navigation réel calcule un chevauchement de rectangles de projection dans l'axe perpendiculaire au mouvement, pondéré par la distance. Le code actuel (`_findSpatialTarget`) ne calcule **aucun chevauchement de rectangle** : il compare uniquement les centres des éléments (distance euclidienne) avec des pénalités d'alignement arbitraires (`- alignY * 5` en horizontal, `- alignX * 3.5` en vertical) et un bonus fixe de `+1500`/`+500` pour "même carrousel"/"même widget". Ce n'est pas un défaut en soi — une heuristique centre-à-centre peut très bien fonctionner — mais l'écart entre le commentaire ("Pur", "Standard W3C") et la réalité du code est trompeur pour la maintenance future, et les coefficients (5, 3.5, 1500, 500) sont choisis empiriquement sans justification ni test : ils peuvent donner un résultat contre-intuitif dès que deux sections ont des hauteurs de carte très différentes (ex. le Hero très haut à côté d'un widget compact), un des scénarios que l'audit précédent recommandait déjà de tester en recette réelle (§6.9 de `AUDIT_PROFESSIONNEL.md`).

### 1.7 🟢 Ce qui fonctionne correctement et doit être préservé

- La disparition du conteneur de vue (`container.innerHTML = ''` dans `AppLayout.navigate()`) avant le rendu de la vue suivante est correcte : elle empêche les anciennes cartes de "fuiter" dans le scope de la nouvelle vue — un risque que l'audit précédent soulevait et qui est en réalité maîtrisé.
- `HeroSpotlightComponent` est un bon exemple de raccourci clavier correctement isolé (garde explicite sur la touche, vérifie qu'aucune modale/lightbox n'est ouverte, ne touche jamais aux flèches).
- Le nettoyage mémoire du Gamepad (polling réduit à 1 Hz sans manette, timers nettoyés dans `disable()`) et du `Router` (historique borné à 100, listener détruit proprement) — corrections de la session du 31 août — sont bien en place dans le code actuel.
- Le concept général (Focus Registry par scope + détection automatique de scope + récupération de focus sur nœud détaché) est une bonne architecture *sur le papier*. Le problème n'est pas la conception d'ensemble, mais l'absence de garde-fous qui laisse d'autres modules la contourner (§1.3) et la duplication de moteurs d'entrée (§1.2, §1.4, §1.5).

### 1.8 Ce qui reste à vérifier uniquement en recette réelle (ne peut pas être confirmé par lecture de code seule)

La matrice de recette TV détaillée en §6.7/§14.4 de `AUDIT_PROFESSIONNEL.md` reste entièrement valable et n'a pas été rejouée ici (pas d'accès à un écran TV/télécommande physique). Une fois les bugs 1.1 et 1.2 corrigés, il est très probable qu'une bonne partie des symptômes remontés en usage réel disparaisse — mais la recette sur device réel (Xbox/DualSense/télécommande CEC, résolutions 720p/1080p/4K) reste indispensable avant de déclarer la navigation stable.

---

## 2. Lecteur vidéo (player) et optimisation du lancement

Au-delà du double traitement clavier (§1.2), l'examen du player confirme les grandes lignes de l'audit du 31 août, avec quelques ajouts :

- **Structure saine :** `VideoPlayer` (2 963 lignes — un fichier volumineux mais logiquement séparé par sections : montage, HLS, popovers, HUD, navigation, reporting) utilise `hls.js` pour le flux adaptatif, avec repli sur lecture native, reprise de position via `PlaybackPositionTicks`, gestion audio/sous-titres, épisode suivant/précédent, et nettoyage de l'instance HLS au changement de source.
- **Sécurité des URLs :** confirmé — le token Jellyfin n'est plus intégré dans les URLs `master.m3u8`/`stream` pour le flux principal ; `hls.js` transmet l'autorisation via en-tête HTTP. Le compromis résiduel documenté par l'audit précédent (Safari/lecture native ne pouvant pas ajouter d'en-tête `Authorization`, donc `api_key` encore utilisé dans ce cas précis) est toujours présent et reste la limite correcte à connaître, pas un oubli.
- **`close()` est maintenant complet** : l'examen confirme que `close()` nettoie bien `_progressInterval`, `_idleTimer`, `_nextEpCountdownInterval`, `_osdTimer` et le `_keyHandler` — un point que l'audit du 31 août listait comme corrigé, et qui l'est effectivement dans le code lu ici.
- **Lancement du lecteur — optimisation :** le player enrichit les métadonnées de l'item **après** le montage (`getItem()` différé), ce qui est la bonne pratique (afficher vite, enrichir ensuite) et va dans le sens de "lancement optimisé". Le point encore perfectible signalé par l'audit précédent reste valable : la sélection de la source/qualité devrait se faire côté serveur *avant* d'instancier HLS plutôt qu'après un premier essai, pour éviter un rebasculement visible au démarrage.
- **Nouveau point trouvé ici :** `_onKeyDown()` gère un système d'accélération de recherche (5 s → 30 s → 60 s → 300 s selon la durée d'appui) qui est une bonne idée UX pour la télécommande, mais qui est aujourd'hui invalidée par le double-traitement (§1.2) — cette fonctionnalité mérite d'être conservée une fois la duplication supprimée, pas jetée avec elle.

**Verdict player :** techniquement le module le plus abouti du projet une fois isolé de son bug de double-entrée. Une fois §1.2 corrigé, le player devrait redevenir fluide à la télécommande. Le reste (Direct Play/Transcode affiché depuis la session réelle, tests Safari, reporting périodique) suit les recommandations déjà justes de l'audit du 31 août — non re-vérifiées ici faute de serveur, toujours valables.

---

## 3. Écosystème plugins & SDK — ce qui est réel, ce qui ne l'est pas encore

Le système est **substantiellement plus abouti** que ce que décrivait l'audit du 31 août (`core/PluginManager.js`, `core/PluginCatalog.js`, `core/PluginPermissions.js`), ce qui confirme qu'un travail correctif réel a bien eu lieu entre-temps sur ce point précis :

- **Permissions réellement appliquées** : chaque capacité exposée au contexte d'un plugin (`ctx.api.getItem`, `ctx.api.fetch`, `ctx.ui.dashboard.registerWidget`, etc.) est gardée par un appel `permissions.assert()` qui lève une erreur si la permission n'a pas été approuvée. Les permissions d'administration (`server.plugins.*`, `server.system.control`, écriture de métadonnées) exigent explicitement `Policy.IsAdministrator === true` — vérifié dans `core/PluginPermissions.js`.
- **`ctx.api.fetch()` est verrouillé au HTTPS strict** (`if (!/^https:\/\//i.test(url)) throw ...`) et force `credentials: 'omit'` — un plugin tiers ne peut donc pas siphonner les cookies de session ni appeler du contenu non chiffré.
- **Le catalogue distant (`PluginCatalog`) est un vrai système d'intégrité** : validation SemVer, hachage SHA-256 obligatoire, signature ECDSA P-256 vérifiée via `crypto.subtle.verify()`, comparaison stricte que les permissions du paquet téléchargé correspondent à celles annoncées dans le catalogue, historique de versions et **rollback réel** vers un paquet précédemment installé. Le chargement du module se fait via `import()` d'une Blob URL générée localement (pas d'`eval`/`new Function`), ce qui correspond à ce que documentait déjà `docs/ARCHITECTURE.md`.
- **Un plugin de référence réel est livré par défaut** : `plugins/ratings/spacehub-ratings-plugin.js` (`spacehub.ratings`) déclare un manifest complet (id, version, permissions `network.external.read` + `jellyfin.metadata.read`, contribution `metadataProvider`), et alimente réellement les badges RT/IMDb/Metacritic via l'API OMDb et les textes de critique via TMDB — **avec de vraies clés API configurées par l'admin**, un vrai `healthCheck()`, et exclusivement via `ctx.api.fetch()` (donc soumis à la même politique HTTPS/permissions que n'importe quel plugin tiers). C'est une preuve concrète, vérifiable dans le code, que le SDK fonctionne de bout en bout pour au moins un cas réel — pas une coquille vide.

**Ce qui manque encore pour un véritable "app store" de plugins tiers** (repris et confirmé de l'audit précédent, toujours valable) :
- Aucune interface utilisateur complète d'installation/désinstallation grand public n'a été trouvée branchée sur `PluginCatalog.install()`/`uninstall()` dans les vues — les méthodes existent côté SDK mais leur exposition dans `JellyfinConsoleModal`/`SettingsPanel` reste à confirmer/étendre.
- Sans bridge serveur SpaceHub, les approbations restent locales à l'appareil (`PolicyService` bascule en mode `'local'`) — ce qui est honnêtement documenté dans le code (`_localPolicy()`), mais signifie qu'un même utilisateur devra ré-approuver ses plugins sur chaque appareil/navigateur.
- Aucun catalogue distant réel (URL HTTPS signée) n'est fourni par défaut dans le dépôt — le mécanisme est prêt, mais il n'y a aujourd'hui qu'un seul "vrai" plugin (`ratings`), livré en local et marqué `isDefault: true`, pas téléchargé depuis un catalogue.

**Verdict :** l'affirmation à vérifier ("les plugins/SDK marchent-ils réellement, ou est-ce du code généré côté client ?") a une réponse claire : **le SDK est réel**, avec de vraies vérifications cryptographiques, et au moins une intégration serveur/API externe authentique en production dans le code (`spacehub.ratings`, OMDb/TMDB). Ce n'est pas une simulation. Ce qui reste incomplet, c'est l'écosystème *autour* (marketplace, UI d'installation grand public, bridge serveur), pas le moteur lui-même.

---

## 4. Intégrations Servarr (Sonarr/Radarr/Prowlarr/Bazarr/Jellyseerr/qBittorrent)

Un échantillonnage du code confirme que les appels réseau sont réels et non fabriqués : `integrations/sonarr/SonarrApi.js` cible bien les vrais points d'entrée Sonarr v3 (`/api/v3/system/status`, `/api/v3/series`, `/api/v3/calendar`, `/api/v3/queue`, `/api/v3/qualityprofile`, `/api/v3/rootfolder`), avec le même patron `API → Service → Widgets` reproduit pour les cinq autres services. Ce point n'a pas été inversé depuis l'audit du 31 août, et il n'y a aucune trace de données de démonstration codées en dur dans les clients API eux-mêmes.

Les défauts fonctionnels détaillés par l'audit précédent — `checkHealth()` qui affichait `'connected'` sans jamais tester le service (corrigé, confirmé dans `PLAN_CORRECTIONS.md` avec un avant/après cohérent avec le code actuel), l'appel Bazarr qui interrogeait la mauvaise couche (`api.getWantedSummary()` au lieu du service), la mauvaise méthode qBittorrent dans `DownloadsView` (`getTransferInfo` vs `getTransferStats`), le fallback "sain par défaut" de Prowlarr en l'absence de statut — n'ont pas été re-vérifiés ligne à ligne ici faute de temps disponible pour re-couvrir tout le périmètre déjà traité en détail le 31 août ; le tableau de correction affirme qu'ils sont corrigés. **Recommandation :** avant de considérer ce point clos, faire tourner `npm run test:smoke` et vérifier manuellement au moins une fois chaque `checkHealth()` contre un vrai service arrêté pour confirmer que l'état affiché passe bien à `offline`/`auth_failed` et non `connected`.

**Verdict :** intégrations honnêtes sur le principe (vrais appels), la fiabilité de l'affichage d'état (connecté/hors ligne/inconnu) dépend des corrections du 31 août tenant réellement en usage — à confirmer en recette, pas en lecture de code seule.

---

## 5. UI — centrage, animation, fluidité, cohérence visuelle

- **`ui/design-system/tokens.css`** (286 lignes) fournit une base de variables cohérente (`--sh-*`), dans l'esprit du design system documenté.
- **`prefers-reduced-motion` n'est géré que dans un seul fichier** de toute la base (`grep` exhaustif) — c'est-à-dire que l'immense majorité des transitions/animations (carrousels, modales, Dynamic Island, hero) ignorent la préférence d'accessibilité du système d'exploitation. C'est un vrai manque, simple à corriger globalement via une règle `@media (prefers-reduced-motion: reduce)` dans `tokens.css` qui neutralise les `transition`/`animation` par défaut.
- **Usage de `!important`** : modéré mais non négligeable dans plusieurs skins optionnels (`jamfin-spacehub.css` : 8 occurrences, `flow-spacehub.css` et `scyfin-spacehub.css` : 6 chacun). Cohérent avec le constat de l'audit précédent : les corrections de centrage/alignement sur ces thèmes seront plus fragiles à maintenir tant que ces overrides existent, car un futur correctif de centrage devra lui-même passer par `!important` pour avoir de l'effet, créant une escalade.
- **CSS injecté en JavaScript plutôt que fichiers statiques** : plusieurs composants (`LibraryView`, `DownloadsView`, `TvModeManager`, `GamepadInput`, etc.) injectent leur propre bloc `<style>` via `document.head.appendChild` au montage plutôt que de charger un fichier CSS statique. C'est protégé contre la duplication (test `getElementById` avant injection), mais cela empêche le navigateur de paralléliser le téléchargement/parsing CSS avec le JS, et complique tout audit de centrage global puisque les règles ne sont pas visibles dans les fichiers `.css` du dépôt — il faut lire le JS pour les trouver. C'est cohérent avec le constat déjà fait par l'audit précédent ("styles injectés... rend les corrections de centrage difficiles").
- **Poids du bundle** : `dist/assets/` mesuré directement dans ce dépôt : `index-*.js` (587 Ko), `app-*.js` (446 Ko), `integrations-*.js` (149 Ko), soit environ **1,18 Mo de JS applicatif minifié** avant même le vendor HLS (589 Ko). Le CSS packagé par Vite (`index-*.css`) ne pèse que 7,2 Ko — signe que l'essentiel du CSS réel de l'application est injecté par JS comme noté ci-dessus, et n'est donc **pas comptabilisé** dans ce chiffre : le poids réel transmis au navigateur (JS incluant du CSS en template strings + CSS statique) est probablement supérieur à ce que Vite rapporte en sortie de build.

**Verdict UI :** l'intention visuelle (glassmorphism VisionOS) est cohérente et le design system existe réellement, mais la fluidité perçue souffre de trois choses cumulées : le double-scroll de navigation (§1.1), l'absence de `prefers-reduced-motion`, et un volume de JS important à parser/exécuter avant que l'UI soit interactive sur un appareil TV peu puissant.

---

## 6. Performance globale

- **Découpage de bundle** : Vite scinde bien le vendor HLS (`vendor-hls-*.js`, 589 Ko) du reste — un point positif déjà crédité par l'audit du 31 août (P2 de `PLAN_CORRECTIONS.md`, "Vite code-splitting" mentionné comme corrigé). Le JS applicatif reste néanmoins volumineux (~1,18 Mo) pour un usage TV/HTPC bas de gamme.
- **`setInterval` sans nettoyage systématique** : 11 fichiers utilisent `setInterval` à travers le projet (`ui`, `core`, `jellyfin`, `integrations`, `scripts`). Une bonne partie a été corrigée le 31 août (horloge `AppLayout`, métriques `DownloadsView`, tâches `JellyfinConsoleModal`), mais l'inventaire n'a pas été refait fichier par fichier ici : toute nouvelle vue/widget ajoutée sans passer explicitement par un `destroy()` documenté réintroduira le même risque, faute d'un contrat unique appliqué à toute la base (le point reste valable tel que formulé dans le plan d'action P2 de l'audit précédent).
- **Chargement au démarrage** : `core/SpaceHub.js` initialise séquentiellement les six intégrations Servarr et une longue liste de composants avant le premier rendu utile — confirmé par simple lecture de la structure du bootstrap, cohérent avec le constat déjà fait par l'audit précédent (§11.1). Rien n'indique qu'un chargement différé (lazy) des widgets non visibles ait été mis en place depuis.
- **Double appel de scroll (§1.1)** a aussi un coût CPU/GPU réel en plus du bug visuel : chaque pas de navigation dans un carrousel déclenche deux calculs de `getBoundingClientRect()` + deux animations de scroll qui se chevauchent, ce qui sur un appareil TV bas de gamme peut suffire à faire percevoir un vrai lag, pas seulement un défaut esthétique.

**Verdict performance :** le point le plus rentable à corriger en premier est justement le §1.1 (double-scroll) : c'est à la fois un bug fonctionnel et un gaspillage de calcul répété à chaque frappe, sur l'écran (Dashboard/Library) où l'utilisateur passe le plus de temps à naviguer.

---

## 7. Cohérence produit et alignement avec la vision

La vision documentée (`README.md`, `SpaceHub_Plan_de_Developpement_v2.md`) — un client Jellyfin unifié remplaçant l'usage séparé de Sonarr/Radarr/Bazarr/Prowlarr/Jellyseerr/qBittorrent, avec une esthétique VisionOS et un mode TV/manette natif — reste un positionnement cohérent et le code actuel s'en approche sincèrement : les six intégrations existent et appellent de vraies API (§4), un moteur de navigation TV dédié existe et n'est pas un gadget cosmétique (§1), un SDK de plugins fonctionne réellement de bout en bout pour au moins un cas (§3).

Le point de friction principal reste **procédural plutôt que produit** : le rythme des correctifs "définitifs" successifs sur la navigation (§0) montre un mode de travail qui corrige des symptômes rapportés un par un sans étape de vérification de non-régression sur l'architecture d'entrée dans son ensemble. Tant que §1.2 et §1.5 ne sont pas traités à la racine (une seule autorité clavier/manette), chaque nouvelle fonctionnalité ajoutée à l'interface (nouvelle vue, nouveau widget, nouvelle modale) a un risque non négligeable de réintroduire un bug de double-traitement similaire à celui trouvé dans le player, simplement parce que rien dans le code n'empêche un nouveau composant d'ajouter son propre `addEventListener('keydown', ...)`.

Le second point de friction, hérité tel quel de l'audit précédent et non contredit ici, reste la **double architecture Core/Injector** (`spaceHub-injector.js` + `scripts/*.js` legacy en parallèle de `core/`/`ui/`) : elle n'a pas disparu et continue de représenter la dette qui rend toute nouvelle fonctionnalité plus coûteuse à ajouter correctement tant qu'elle n'est pas résorbée (cf. `SpaceHub_Plan_de_Developpement_v2.md` §5, v0.2bis toujours listée "non faite — prochaine priorité réelle" au 17 août, statut non revérifié depuis).

---

## 8. Évaluation détaillée par fonctionnalité

| Fonctionnalité | Cohérence avec la vision | Niveau fonctionnel réel | Ce qu'il reste à améliorer en priorité |
|---|---|---|---|
| **Navigation TV / manette** | Élevée dans l'intention (scopes, focus registry, repeat engine) | **Fragile** — bugs actifs et reproductibles par lecture de code (§1.1, §1.2) | Corriger le double-scroll carrousel, unifier le clavier du player avec `SpatialNavigation`, verrouiller le registre de scopes contre les réécritures silencieuses |
| **Lecteur vidéo** | Élevée (Direct Play/HLS, reprise, épisode suivant) | Bon sur le fond, cassé côté clavier/manette par le bug §1.2 | Supprimer `_onKeyDown()` dupliqué ; valider Direct Play/Transcode réel en recette |
| **Tableau de bord / Dashboard** | Élevée | Bon — widgets réels branchés sur Jellyfin | Filtre "Science-Fiction" à corriger si le `\|\| true` signalé le 31 août est toujours présent (non re-vérifié ici) ; charger les widgets externes en différé |
| **Bibliothèques (LibraryView)** | Élevée — la plus proche d'un client Jellyfin standard | Bon | Ajouter `AbortController` sur les requêtes de recherche/filtre concurrentes |
| **Recherche unifiée** | Bonne | Bonne, mais raccourcis Ctrl+K dupliqués entre `Router` et `UnifiedSearch` (à vérifier qu'un seul agit réellement) | Clarifier qui possède le raccourci global |
| **Fiches médias / SlideUp Sheet** | Bonne | Bonne, fichier très volumineux (~3 100 lignes selon le plan de correction) | Découper le fichier ; séparer visuellement média Jellyfin réel vs découverte Jellyseerr/TMDB (déjà recommandé le 31 août) |
| **Calendrier unifié** | Bonne | Fonctionnel, agrégation Sonarr/Radarr/Jellyseerr réelle | Durcir la déduplication par ID plutôt que titre/date |
| **Jellyseerr (demandes)** | Bonne | Fonctionnel côté appels API | Le scope de navigation dédié est cassé par le widget Trending (§1.3) — impact direct sur l'usage TV de cette fonctionnalité précisément |
| **Sonarr / Radarr** | Bonne | Fonctionnel, endpoints réels confirmés | Suivre les recommandations déjà émises (profils/dossiers non toujours les bons par défaut) |
| **Prowlarr** | Bonne | Fonctionnel | Corriger l'ambiguïté "statut absent = sain" si toujours présente |
| **Bazarr** | Bonne | Fonctionnel | Vérifier que la correction console-admin (bonne couche API/service) est bien effective |
| **qBittorrent** | Bonne | Fonctionnel | Vérifier en usage réel que les métriques globales de `DownloadsView` affichent des valeurs non nulles |
| **Plugins SDK** | Très bonne — c'est un vrai différenciateur | **Réel et vérifié** (§3), pas une façade | Construire l'UI d'installation grand public complète, publier un vrai catalogue distant signé |
| **Console d'administration** | Bonne intention | À revérifier — l'audit du 31 août signalait des statuts simulés, corrections annoncées non re-vérifiées ici | Confirmer que `_testAllServices()` appelle réellement chaque `checkHealth()` |
| **Statistiques personnelles** | Cohérente avec la vision "Tautulli-like" | Calcul côté client à partir de vraies données Jellyfin, approximations documentées | Afficher clairement que ce sont des statistiques calculées par SpaceHub, pas natives Jellyfin |
| **Thèmes / UI VisionOS** | Très cohérente visuellement | Bonne, mais `prefers-reduced-motion` quasi absent (§5) | Ajouter le support global de l'accessibilité motion |
| **Notifications (toast/Discord/Telegram)** | Cohérente | Fonctionnelle pour le toaster ; Discord/Telegram nécessitent audit des secrets (repris de l'audit précédent, non re-testé ici) | Valider la réponse HTTP réelle avant d'annoncer un envoi réussi |
| **Onboarding** | Bonne | Ajouté le 31 août, scope TV dédié dans `SpatialNavigation` | À valider en recette réelle avec télécommande |

---

## 9. Plan d'action priorisé

### P0 — Corrige directement le symptôme "navigation cassée"
1. **`core/CarouselController.js`** : retirer l'appel à `scrollToCard()` à l'intérieur de `navigate()` — ne garder que le calcul de la carte cible, laisser `SpatialNavigation.setFocus()` être l'unique responsable du scroll (§1.1).
2. **`jellyfin/player/VideoPlayer.js`** : supprimer `_onKeyDown()` et son `document.addEventListener('keydown', ...)` ; ne conserver que `handleNavAction()`, appelé uniquement par `SpatialNavigation` (§1.2). Réintégrer dans `handleNavAction()` la logique d'accélération du seek (5 s → 300 s) qui existe aujourd'hui uniquement dans le code à supprimer.
3. **`integrations/jellyseerr/JellyseerrWidgets.js`** : retirer le second appel `registerFocusables('jellyseerr', ...)` qui écrase et casse le scope initial (§1.3). Corriger ou supprimer la référence à `.sh-jellyseerr-view` qui ne correspond à aucun élément réel.
4. **`core/SpatialNavigation.js`** : faire de `registerFocusables()` un enregistrement protégé (avertissement ou refus en cas de réécriture non explicite d'un scope existant), pour empêcher qu'un futur widget reproduise le bug 1.3 ailleurs.

### P1 — Empêche la régression de se reproduire ailleurs
5. Unifier tous les gestionnaires `keydown` (§1.5) derrière `SpatialNavigation` : `TrailerService`, `AnalyticsModal`, `Modal`, `ModalSlideUpSheet` ne doivent plus écouter `keydown` directement mais réagir aux évènements du moteur central.
6. Faire passer la répétition manette (`GamepadInput`) par le même moteur de répétition/accélération que le clavier (§1.4), au lieu d'une logique de répétition dupliquée.
7. Rejouer `npm run test:smoke` + une recette manuelle ciblée sur les quatre points ci-dessus avant de les considérer clos.

### P2 — Performance et UI
8. Ajouter une règle globale `prefers-reduced-motion` dans `tokens.css`.
9. Réduire l'usage de `!important` dans les skins `jamfin`/`flow`/`scyfin` en augmentant la spécificité naturelle plutôt qu'en forçant.
10. Différer le chargement des widgets d'intégrations externes après le premier rendu utile du Dashboard (repris de l'audit du 31 août, toujours pertinent).
11. Réduire le poids du bundle JS applicatif (actuellement ~1,18 Mo hors vendor HLS) par découpage supplémentaire par route/vue.

### P3 — Suite du plan déjà engagé (non re-audité ligne à ligne ici, toujours valable)
12. Fermer la dé-duplication Core/Injector documentée dans `SpaceHub_Plan_de_Developpement_v2.md`.
13. Terminer l'inventaire XSS et la politique de secrets décrits dans `AUDIT_PROFESSIONNEL.md` §10.
14. Construire l'UI complète d'installation de plugins depuis le catalogue (le moteur est prêt, §3).

---

## 10. Conclusion

Le diagnostic de l'utilisateur ("la navigation est buguée et cassée en test réel") est confirmé **par le code lui-même**, indépendamment de tout facteur serveur ou réseau : deux bugs précis et reproductibles (double-scroll des carrousels, double traitement clavier dans le lecteur vidéo) suffisent à expliquer un ressenti de navigation erratique, en particulier à la télécommande/manette où c'est justement le mode d'usage le plus sollicité. Un troisième bug (scope Jellyseerr cassé par son propre widget) montre que le problème n'est pas isolé au player mais est un symptôme d'un défaut architectural plus large : rien dans le moteur de navigation n'empêche aujourd'hui un composant tiers du projet de réécrire silencieusement une règle de focus ou d'ajouter son propre écouteur clavier concurrent.

La bonne nouvelle est que ces trois bugs sont **localisés, bien identifiés, et correctibles sans réécriture d'architecture** (contrairement aux six précédentes tentatives "définitives") : il s'agit de retirer un appel redondant à trois endroits précis, pas de reconcevoir le moteur. Le reste du produit — plugins/SDK (réellement fonctionnel, pas une façade), intégrations Servarr (vrais appels API), lecteur vidéo (solide une fois débarrassé de son bug d'entrée), design system — est globalement à la hauteur de la vision affichée. La priorité reste, comme le concluait déjà l'audit du 31 août, de fiabiliser ce qui existe avant d'ajouter de nouvelles fonctionnalités — et cette nouvelle passe montre précisément où porter cet effort en premier.

---

*Audit réalisé le 1er septembre 2026 par lecture complète du moteur de navigation et de ses dépendances, du lecteur vidéo, du système de plugins, et d'un échantillon représentatif des intégrations et de l'UI, sur l'état de travail présent dans le dossier local (non commité inclus). Les sections reprises de `AUDIT_PROFESSIONNEL.md` (31 août) et non re-vérifiées ligne à ligne ici sont explicitement signalées comme telles ; tout le reste a été confirmé par lecture directe du code dans cette passe.*
