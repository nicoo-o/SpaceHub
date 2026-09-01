# Audit professionnel complet — SpaceHub

> **Projet :** SpaceHub — client web unifié pour Jellyfin et l’écosystème Servarr  
> **Version examinée :** 1.0.0  
> **Date :** 31 août 2026  
> **Méthode :** analyse statique multi-couches du dépôt, traçage des appels UI → service → API, revue des contrats, sécurité, navigation, performance, accessibilité et préparation d’une recette réelle.  
> **Limite importante :** aucun serveur Jellyfin/Servarr ni compte de test n’a été fourni pendant cet audit. Les résultats sont donc séparés entre faits confirmés par le code et points à exécuter dans un environnement réel.

---

## 1. Verdict exécutif

### Conclusion courte

SpaceHub possède une base ambitieuse et plusieurs fondations solides : authentification Jellyfin autonome, explorateur de bibliothèques, recherche, fiches médias, lecteur vidéo, dashboard modulaire, cache, thèmes, navigation clavier/manette et six intégrations externes. La séparation `API → Service → Widget` est pertinente et l’interface vise clairement un usage TV/HTPC.

En revanche, **l’application ne peut pas encore être considérée comme un client Jellyfin de production entièrement fiable**. Le principal problème n’est pas l’absence de fonctionnalités, mais le décalage entre :

1. ce qui est visuellement affiché ;
2. ce qui est réellement demandé au serveur ;
3. ce qui est réellement validé avant d’être annoncé comme « en ligne », « optimal » ou « opérationnel » ;
4. ce qui est effectivement utilisé dans chacun des deux modes de déploiement.

### Score global indicatif

| Domaine | Score | Évaluation |
|---|---:|---|
| Vision produit | 9/10 | Positionnement différenciant et ambitieux. |
| Fonctionnalités Jellyfin | 7/10 | Couverture large, mais plusieurs contrats doivent être durcis. |
| Cohérence produit | 5/10 | Le produit mélange client média, centre admin et agrégateur Servarr sans toujours distinguer les rôles. |
| Navigation TV | 6/10 | Moteur riche, mais scopes, focus, modales et lifecycle nécessitent une vraie recette TV. |
| Intégrations | 6/10 | Les appels API existent, mais les états affichés ne sont pas toujours issus d’un test réseau. |
| Player | 6,5/10 | Flux Jellyfin et HLS présents ; sécurité URL, fallback et reporting à revoir. |
| Sécurité | 4/10 | Corrections XSS partielles, tokens encore persistés ou placés dans des URLs. |
| Performance | 5/10 | Cache et lazy loading présents, mais chargement initial et listeners globaux coûteux. |
| Accessibilité | 5,5/10 | Bons éléments dans certaines modales, couverture inégale. |
| Maintenabilité | 4,5/10 | Double architecture et fichiers monolithiques importants. |
| Tests et validation | 1/10 | Aucun test automatisé détecté et aucune recette réelle intégrée au projet. |

**Score global estimé : 5,6/10.** Ce score mesure la fiabilité actuelle, pas le potentiel du projet.

### Niveau de maturité

- **Prototype avancé / bêta fonctionnelle :** oui.
- **Client Jellyfin utilisable par un utilisateur technique :** oui, sous réserve de configuration et de vérification manuelle.
- **Client normal prêt pour tous les utilisateurs d’un serveur :** non, pas encore.
- **Console d’administration fiable :** non, plusieurs indicateurs et contrôles sont encore incomplets ou trompeurs.
- **Système de plugins tiers réellement industrialisé :** non, le SDK existe mais le cycle d’installation, de permission et de compatibilité est incomplet.

---

## 2. Légende des statuts et niveau de confiance

| Statut | Signification |
|---|---|
| **Confirmé par le code** | Le comportement est directement démontré par une lecture des fichiers actuels. |
| **Branché serveur** | Un appel réseau identifiable existe vers Jellyfin ou un service externe. Cela ne garantit pas que l’endpoint est compatible avec toutes les versions. |
| **Local** | La donnée ou le comportement est calculé dans le navigateur ou persisté localement. |
| **Présent mais incomplet** | La structure existe, mais un contrat, un état ou un chemin d’erreur manque. |
| **Trompeur** | L’interface peut présenter une information comme réelle alors que le code ne la mesure pas réellement. |
| **À valider en recette** | Le code paraît cohérent, mais seul un test contre un serveur réel peut confirmer le comportement. |
| **Non implémenté / non garanti** | Le nom, le commentaire ou l’interface suggère une fonction qui n’est pas réellement garantie par le code. |

---

## 3. Périmètre et architecture réelle

### 3.1 Deux applications coexistent

Le dépôt contient deux chemins d’exécution distincts :

```text
Mode standalone / ESM
index.html
  └── core/SpaceHub.js
      ├── core/*
      ├── ui/*
      ├── jellyfin/*
      └── integrations/*

Mode injection Jellyfin / legacy
spaceHub-plugin.js
  └── configuration enregistrée dans JavaScript Injector
      └── spaceHub-injector.js
          └── scripts/*.js et CSS legacy
```

Cette coexistence est documentée, mais elle reste une **double architecture active**, et non un simple mode de compatibilité :

- les scripts legacy ne consomment généralement pas les classes ESM du core ;
- certaines fonctions existent en double ;
- les caches, modales, toasters et helpers ne sont pas toujours les mêmes ;
- la validation du mode standalone ne valide pas automatiquement le mode injecté ;
- la production par CDN et le développement Vite n’ont pas les mêmes proxys réseau ;
- le `Router` central existe mais la navigation principale est principalement pilotée directement par `AppLayout`.

### 3.2 Initialisation ESM actuelle

`core/SpaceHub.js` initialise notamment :

- `EventBus`, `SettingsManager`, `CacheManager` ;
- `ModuleManager`, `PluginManager`, `Router` ;
- `ApiClient` et `JellyfinClient` ;
- `AuthManager` ;
- thème, toaster, modales, card builder ;
- dashboard et widgets ;
- `JellyfinAPI`, recherche, collections, player ;
- six services externes ;
- `AppLayout` si une session est disponible, sinon `LoginView`.

**Point positif :** le bootstrap est lisible et expose un namespace global cohérent.

**Risques :**

- beaucoup de composants sont créés avant de savoir si l’utilisateur est administrateur ou si les intégrations sont configurées ;
- les six intégrations sont enregistrées et chargées séquentiellement, même si elles sont indépendantes ;
- l’initialisation peut prendre du temps avant le premier rendu utile ;
- les erreurs sont souvent absorbées puis remplacées par des états d’interface génériques ;
- une nouvelle instance de `AppLayout` peut être montée après connexion sans destruction explicite de la vue de login précédente.

### 3.3 Outillage

`package.json` contient Vite et `hls.js`, mais :

- le script `lint` n’exécute pas de linter ;
- aucun test automatisé n’est configuré ;
- aucune CI n’est définie ;
- aucune matrice de versions Jellyfin/Servarr n’est déclarée ;
- `dist/` doit être généré par build et ne constitue pas une preuve de déploiement injecté ;
- le proxy CORS dynamique est uniquement un outil de développement et ne fournit pas de solution de production ;
- le build de production passe (`vite build`), mais Vite signale un bundle JavaScript minifié d’environ 1,65 Mo, à découper avant une cible TV peu puissante.

---

## 4. Audit des fonctionnalités utilisateur

### 4.1 Connexion Jellyfin

**Chemin :** `LoginView → AuthManager.login() → /Users/AuthenticateByName`.

| Élément | Constat |
|---|---|
| Authentification réelle | **Branchée serveur.** Le formulaire appelle l’endpoint Jellyfin réel. |
| Identifiants | Transmis dans un POST JSON, pas générés localement. |
| Session | Token stocké uniquement dans `sessionStorage`; identifiant d'appareil non secret dans `localStorage`. |
| Vérification au démarrage | Appel `/System/Info`, mais une erreur réseau temporaire conserve la session. |
| Fallback proxy | Présent pour l’URL vide ou certains échecs réseau, mais dépend de la configuration Vite. |
| Message d’erreur | Affiché via `textContent`, donc correctement protégé contre l’injection HTML. |

**Problèmes :**

1. La session est volontairement limitée à l’onglet courant ; il n’existe pas encore d’option « rester connecté ».
2. Une erreur réseau durant `init()` peut laisser l’utilisateur connecté localement alors que la session n’a pas été confirmée.
4. `window.ApiClient` est remplacé par un objet SpaceHub simplifié, ce qui peut interférer avec Jellyfin Web ou des plugins natifs.
5. La version et le device Jellyfin sont partiellement hardcodés (`Chrome`, `10.8.13`).
6. La validation de l’URL serveur est faible : le champ est de type URL, mais les appels internes acceptent directement des valeurs de configuration.

**Conclusion :** la connexion est une vraie fonctionnalité serveur, mais sa politique de session et sa compatibilité avec Jellyfin natif doivent être clarifiées avant production.

### 4.2 Dashboard et accueil

Le dashboard monte les widgets enregistrés et récupère des données Jellyfin pour les bibliothèques, la reprise et les derniers ajouts. Cela constitue une vraie base de client média.

**Fonctionnel et logique :**

- les bibliothèques utilisateur proviennent de Jellyfin ;
- la reprise utilise `Resume` et `NextUp` ;
- les cartes peuvent ouvrir une fiche ou lancer le player ;
- les bibliothèques personnalisées sont détectées dynamiquement ;
- l’agencement peut être modifié et persisté localement ;
- les widgets externes peuvent disparaître ou afficher une erreur si le service n’est pas configuré.

**Incohérences :**

- le layout par défaut contient d’abord une longue liste de widgets, puis un `DEFAULT_CLEAN_LAYOUT` est ajouté si aucun ordre personnalisé n’est trouvé ; le résultat dépend donc du contenu du layout sauvegardé et peut devenir difficile à prévoir ;
- le tri hiérarchique force un ordre global, ce qui limite la promesse de personnalisation ;
- le layout est chargé widget par widget avec `await` dans une boucle, donc séquentiellement ;
- les sections « Science-Fiction », « Action & Aventure » et « Primés aux Oscars » ne sont pas reliées de façon fiable aux genres, tags ou métadonnées du serveur ;
- le filtre Science-Fiction contient explicitement `|| true`, ce qui affiche tous les médias ;
- le dashboard utilise parfois des fallbacks de notes ou de libellés qui donnent l’impression d’une analyse plus précise qu’elle ne l’est.

**Verdict :** accueil utilisable, mais les filtres éditoriaux doivent être traités comme une priorité fonctionnelle et non comme une simple animation d’interface.

### 4.3 Bibliothèques

`LibraryView` est l’une des fonctionnalités les plus proches d’un client Jellyfin normal.

**Données réelles :**

- `getUserViews()` pour les bibliothèques ;
- `getItemsWithTotal()` pour les éléments et la pagination ;
- genres, types, état lu, favoris et recherche via paramètres Jellyfin ;
- URL d’image générée à partir de l’ID Jellyfin ;
- progression et favoris issus de `UserData`.

**Fonctions présentes :**

- changement de bibliothèque ;
- masquage et réordonnancement locaux ;
- filtres genres, statut, favoris, reprise et 4K ;
- recherche avec debounce ;
- mode affiches, paysage et liste ;
- pagination infinie ;
- ouverture de fiche et lancement ;
- raccourci alphabétique.

**Risques fonctionnels :**

1. Le type de bibliothèque est parfois déduit du nom (`anime`, `film`, `tv`, `série`) au lieu de s’appuyer uniquement sur les métadonnées Jellyfin.
2. Le filtre « 4K » utilise `minWidth=3800`, mais la disponibilité et l’interprétation du champ dépendent du serveur et des métadonnées indexées.
3. Le mode liste a été identifié comme sensible aux reconstructions DOM répétées ; il faut confirmer le coût réel sur une bibliothèque de plusieurs centaines d’éléments.
4. Le changement rapide de recherche, genre et bibliothèque peut déclencher une réponse réseau ancienne après la nouvelle réponse : aucun `AbortController` ni numéro de requête n’est généralisé.
5. La vue stocke des préférences dans `localStorage`, ce qui est logique pour l’ergonomie mais doit être clairement séparé des données serveur.
6. Le bouton de gestion des bibliothèques modifie uniquement l’affichage local ; il ne modifie jamais les droits ou la configuration Jellyfin, ce qui doit être explicite.

**Verdict :** fonctionnalité réelle et pertinente. Elle doit devenir la référence UX du produit, avec annulation des requêtes et source de vérité serveur mieux documentée.

### 4.4 Recherche

`UnifiedSearch` combine recherche Jellyfin, navigation rapide, historique et recherche Jellyseerr optionnelle.

**Réel :** la recherche Jellyfin passe par l’API et les résultats sont transformés en cartes.

**Local :** historique, ouverture/fermeture du spotlight, commandes et thème.

**À vérifier :**

- comportement sur serveur lent ;
- annulation d’une requête lors d’une nouvelle saisie ;
- recherche dans les épisodes et albums ;
- navigation TV dans la liste de résultats ;
- fermeture avec Escape/Back ;
- absence de conflit avec le raccourci Ctrl+K du `Router`.

**Risque :** deux couches d’écoute clavier — `Router` et `SpatialNavigation` — peuvent agir sur le même événement selon le focus et l’ordre d’enregistrement.

### 4.5 Fiches médias, favoris et lecture

Les fiches utilisent Jellyfin pour les médias locaux et Jellyseerr/TMDB pour la découverte externe.

**Bon fonctionnement conceptuel :**

- un média Jellyfin conserve son ID serveur ;
- un média Jellyseerr est adapté dans un objet compatible avec la fiche ;
- les favoris appellent `FavoriteItems` ;
- les séries tentent `NextUp`, puis le premier épisode ;
- les saisons et épisodes sont chargés depuis Jellyfin.

**Point d’attention majeur :** les médias Jellyseerr ne sont pas nécessairement présents sur le serveur. La fiche doit séparer visuellement :

- « disponible dans Jellyfin » ;
- « disponible dans Jellyseerr/TMDB » ;
- « demandé » ;
- « en traitement » ;
- « disponible après import Jellyfin ».

Sans cette distinction, l’utilisateur peut croire qu’un média découvert est déjà lisible localement.

### 4.6 Calendrier

`UnifiedCalendarService` agrège Sonarr, Radarr et Jellyseerr, puis `DownloadsView` ou `UnifiedCalendarWidget` affiche une timeline.

**État actuel :** le bug historique `getUpcoming()` inexistant a été corrigé vers `getUpcomingMediaList()`.

**Fonction réelle :**

- Sonarr et Radarr peuvent fournir des calendriers serveur ;
- Jellyseerr peut fournir les films à venir ;
- les événements sont normalisés et triés côté client ;
- l’affichage grille/liste est local.

**Limites logiques :**

- une sortie Radarr, une sortie Jellyseerr et un média déjà disponible Jellyfin peuvent représenter des événements différents ;
- la déduplication par titre/date doit être durcie avec les IDs externes et les IDs serveur ;
- l’intervalle par défaut mélange passé récent et futur, alors que l’intitulé « sorties » peut suggérer uniquement l’avenir ;
- les titres, sous-titres, URL poster et attributs HTML doivent tous être échappés ;
- aucun statut clair ne distingue « annoncé », « surveillé », « téléchargé » et « disponible dans Jellyfin ».

### 4.7 Demandes Jellyseerr

Les appels `search`, `getMediaDetails`, `createRequest`, `approveRequest`, `declineRequest` et les listes de découverte existent réellement.

**Pour utilisateur standard :** la demande de film/série est logique si Jellyseerr autorise l’utilisateur.

**Pour administrateur :** l’approbation/refus est logique, mais elle devrait être masquée ou protégée selon le rôle Jellyseerr réel.

**Problèmes :**

- l’application détermine surtout la capacité d’action par présence du service, pas par permission utilisateur ;
- la réponse « Demandé » doit être confirmée par la réponse serveur, pas uniquement par le changement du bouton ;
- le fallback upcoming → trending est utile pour la résilience, mais doit être affiché comme fallback et non comme véritable calendrier ;
- les données TMDB externes peuvent être affichées avec des attributs non échappés dans certaines cartes et modales ;
- les cartes de demande nécessitent un état `loading`, `success`, `already requested`, `available`, `denied` et `server error` séparés.

### 4.8 Sonarr et Radarr

Les APIs déclarent de vrais endpoints pour :

- statut système ;
- séries/films ;
- lookup ;
- ajout/suppression ;
- calendrier ;
- queue ;
- profils de qualité ;
- dossiers racine.

Les services ajoutent cache, détection de doublons et événements.

**Points positifs :**

- `testConnection()` appelle un endpoint réel ;
- `checkHealth()` utilise maintenant ce test ;
- les POST passent par `BaseApiClient` avec body JSON ;
- les listes sont mises en cache avec TTL ;
- la détection de doublons évite certaines demandes incohérentes.

**Limites :**

1. Le test de connexion ne garantit pas que l’utilisateur a le droit d’ajouter ou de supprimer.
2. Les valeurs par défaut `/tv` et `/movies` sont des fallbacks locaux et ne doivent jamais être présentées comme des chemins serveur confirmés.
3. Les profils et dossiers sont pris dans le premier résultat ; ce n’est pas toujours le profil voulu par l’administrateur.
4. Le dashboard expose des widgets Sonarr/Radarr, mais les actions d’ajout ne sont pas systématiquement accessibles depuis un parcours utilisateur complet.
5. Les posters Sonarr/Radarr utilisent des URLs externes fournies par le service ; elles doivent être validées/échappées avant insertion HTML.
6. Les widgets affichent des états vides ou d’erreur, mais ne proposent pas toujours une action de configuration directe.

### 4.9 Prowlarr

La recherche de releases, la liste d’indexeurs, les statuts et le test global sont réellement modélisés via l’API Prowlarr.

**Risque principal :** la notion « sain » est calculée ainsi : absence de statut associé ⇒ considéré comme `Ok`. Cela transforme une information manquante en information positive.

La présentation devrait différencier :

- `OK` confirmé ;
- `dégradé` confirmé ;
- `inconnu / statut indisponible` ;
- `désactivé`.

### 4.10 Bazarr

Les endpoints wanted, providers, recherche de sous-titres et synchronisation sont présents.

**Problème confirmé :** `AdminDashboardView._loadMediaHealth()` récupère `window.SpaceHub.integrations.bazarr.api`, puis teste `getWantedSummary()`. Or `getWantedSummary()` appartient au service `BazarrService`, pas à `BazarrApi`. Le contrôle admin ne lit donc pas le résumé attendu et tombe dans un état de repli.

La distinction correcte est :

```text
bazarr.api     → appels HTTP bas niveau
bazarr service → résumé métier, cache et notifications
```

Le bouton de santé devrait utiliser le service métier.

La synchronisation Bazarr est également présentée comme réussie même lorsque l’API ne permet pas de confirmer précisément la tâche : `syncLibraries()` peut retourner `sync_requested` ou un résultat de repli.

### 4.11 qBittorrent

L’API utilise correctement le modèle de session par cookie et des bodies `application/x-www-form-urlencoded`.

**Fonctions réelles :**

- login ;
- version ;
- transfert ;
- liste torrents ;
- pause/reprise/suppression ;
- ajout par URL.

**Problèmes confirmés :**

1. Le proxy `/api-proxy` est indispensable dans de nombreux cas, mais sa configuration de production n’est pas fournie.
2. Les erreurs de session sont assimilées à un statut HTTP 403 dans le flux de reconnexion ; selon qBittorrent et le proxy, un 401 ou une redirection peut être utilisé.
3. `DownloadsView._updateMetrics()` teste `qbit.getTransferInfo`, alors que le service expose `getTransferStats`. Les vitesses globales peuvent donc rester à `0 B/s` dans la vue pleine page.
4. Le bouton de test global de l’administration ne lance pas réellement `checkHealth()` pour les services.
5. Les torrents sont contrôlables depuis l’interface : les confirmations avant suppression de fichiers doivent être renforcées, surtout pour `deleteFiles=true` si cette action est exposée plus tard.

### 4.12 Statistiques personnelles

`MediaAnalyticsService` calcule des statistiques côté client à partir des médias Jellyfin.

**Ce qui est réel :** les données de base viennent de Jellyfin et les genres/résolutions sont dérivés de ces données.

**Ce qui est calculé localement :** temps total, pourcentages, top genres, catégories de résolution.

**Problèmes de logique :**

- la requête demande potentiellement toute la médiathèque sans pagination effective suffisante ;
- le temps total multiplie `RunTimeTicks` par `PlayCount`, ce qui est une approximation et peut surestimer la durée réelle ;
- les statistiques de qualité ne représentent que les items dont les `MediaStreams` sont renvoyés ;
- HDR, Dolby Vision et 4K sont détectés avec des heuristiques incomplètes ;
- aucune date ou période n’est affichée pour contextualiser les statistiques ;
- l’utilisateur peut interpréter ces chiffres comme des statistiques natives Jellyfin alors qu’elles sont calculées par SpaceHub.

### 4.13 Notifications

Le service prévoit toaster, notifications navigateur, Discord et Telegram.

**À encadrer :**

- les webhooks et tokens sont des secrets, pas de simples paramètres UI ;
- une URL Discord fournie par l’utilisateur doit être validée et ne doit pas permettre un usage SSRF non contrôlé ;
- les appels externes ne doivent pas être considérés comme succès sans vérifier la réponse HTTP ;
- les notifications doivent être désactivables par utilisateur et par type d’événement.

---

## 5. Audit du système de plugins et du SDK

### 5.1 Ce qui existe réellement

`PluginManager` fournit :

- registre en mémoire par ID ;
- manifest avec nom, version, auteur, description et icône ;
- hooks `onLoad`, `onEnable`, `onDisable`, `onUnload` ;
- état persistant `plugins.<id>.enabled` ;
- contexte avec SDK, API Jellyfin, événements, settings, UI et logger ;
- liste des plugins avec état et dernière erreur.

`SDK` expose :

- `registerPlugin()` ;
- activation/désactivation ;
- `registerWidget()` ;
- `registerTheme()` / `applyTheme()` ;
- `registerModule()` ;
- événements ;
- toaster, modale et settings.

### 5.2 Ce qui n’est pas encore un système de plugins complet

Le SDK ne fournit pas encore :

- découverte de plugins depuis un catalogue ;
- installation sécurisée d’un script tiers ;
- vérification d’intégrité ou signature ;
- compatibilité minimale/maximale de version ;
- permissions déclaratives ;
- isolation d’exécution ;
- quotas ou limitation réseau ;
- migration de configuration ;
- dépendances de plugins ;
- rollback ;
- persistance fiable du code installé ;
- écran utilisateur complet pour installer et supprimer un plugin.

Le plugin tiers est donc actuellement **un objet JavaScript déjà chargé par le code appelant**, et non une extension installable comme un plugin Jellyfin classique.

### 5.3 Confusion entre plusieurs types de plugins

Le produit doit distinguer explicitement :

| Type | Source | Autorité | Exemple |
|---|---|---|---|
| Plugin serveur Jellyfin | Serveur Jellyfin | Admin serveur | Plugin installé dans Jellyfin. |
| Plugin JavaScript Injector | Serveur Jellyfin | Admin serveur | Charge du JS dans Jellyfin Web. |
| Plugin SpaceHub SDK | Navigateur | Installation SpaceHub | Widget/thème/module tiers. |
| Intégration Servarr | Service externe | Configuration utilisateur/admin | Sonarr, Radarr, Bazarr, etc. |
| Script legacy | CDN/config Injector | Configuration legacy | `scripts/*.js`. |

Aujourd’hui, l’onglet « Extensions & Plugins » risque de mélanger ces catégories.

### 5.4 Défauts à corriger

- `ThemeManager.getAvailable()` renvoie les presets, mais pas les thèmes custom enregistrés ; le SDK peut enregistrer un thème que l’interface de sélection ne liste pas.
- Le contexte plugin donne accès à des composants puissants sans modèle de permission.
- La persistance `plugins.<id>.enabled` est écrite via `SettingsManager` dans `localStorage`.
- L’activation automatique lors de `registerPlugin()` peut exécuter du code tiers dès son enregistrement, sans confirmation utilisateur.
- Une erreur d’activation est conservée, mais il n’y a pas de stratégie de retry ou de remise à zéro documentée.
- Un plugin peut enregistrer un widget sous un ID existant ; le comportement d’écrasement n’est pas suffisamment gouverné.

### 5.5 Contrat recommandé

Avant d’appeler le SDK « stable », prévoir un manifest de ce type :

```json
{
  "id": "exemple.plugin",
  "version": "1.2.0",
  "spacehub": { "min": "1.0.0", "max": "2.x" },
  "permissions": ["events", "dashboard", "jellyfin.read"],
  "entry": "plugin.js",
  "integrity": "sha256-..."
}
```

Les permissions administratives, l’écriture de configuration serveur, l’accès aux secrets et les appels réseau externes doivent être séparés.

---

## 6. Audit détaillé de la navigation TV

### 6.1 Architecture de navigation

La navigation combine :

- `SpatialNavigation` pour la géométrie et les scopes ;
- `GamepadInput` pour les manettes ;
- `InputMapper` pour clavier/télécommande ;
- `CarouselController` pour les étagères horizontales ;
- `Router` pour les raccourcis et l’historique ;
- `AppLayout`, modales et vues pour le rendu réel.

L’intention est bonne : un focus central, une récupération après rendu et une navigation TV sans souris.

### 6.2 Points positifs

- actions normalisées (`UP`, `DOWN`, `LEFT`, `RIGHT`, `SELECT`, `BACK`, `MENU`) ;
- détection des éléments invisibles et désactivés ;
- focus visible via classes dédiées ;
- mémorisation d’une colonne X pour les déplacements verticaux ;
- navigation spécialisée dans les carrousels ;
- auto-repeat clavier avec accélération ;
- gestion D-pad, stick analogique, boutons et curseur virtuel ;
- destruction de certains timers et listeners ajoutée dans plusieurs composants ;
- ouverture d’une modale avec focus initial prévu.

### 6.3 Problèmes structurels

1. **Deux autorités de navigation coexistent.** Le `Router` enregistre les raccourcis, tandis que `AppLayout.navigate()` rend directement les vues. L’historique du `Router` ne représente donc pas nécessairement l’historique visuel réel.
2. **Le scope est détecté par sélecteurs globaux.** Un élément caché, une modale en transition ou une ancienne instance peut influencer le scope courant.
3. **Les providers sont réenregistrés.** `SpatialNavigation`, `AppLayout`, `Dashboard`, `LibraryView` et `DownloadsView` réécrivent certains scopes, ce qui rend l’ordre d’instanciation important.
4. **Le retour arrière est dispersé.** `SpatialNavigation`, `Router`, les vues, les modales et le player possèdent chacun une partie de la logique Back/Escape.
5. **Le focus précédent peut être obsolète.** Après une reconstruction `innerHTML`, le nœud mémorisé peut être détaché ; le recovery existe, mais le résultat peut revenir au premier élément plutôt qu’à l’équivalent logique.
6. **Les éléments de calendrier, listes et contrôles ajoutés dynamiquement ne sont pas tous explicitement déclarés focusables.** Ils dépendent du sélecteur global du scope.
7. **Les boutons de cartes d’intégration ne sont pas uniformes.** Certains sont `button`, d’autres `div` cliquables, d’autres n’ont pas de focus TV dédié.
8. **Le menu utilisateur contient de nombreux éléments focusables, mais la fermeture et la restauration du focus reposent sur plusieurs timers et clics document.**
9. **La navigation TV doit être testée sur la distance réelle entre widgets.** Un algorithme géométrique correct peut choisir un élément visuellement inattendu si les sections sont très espacées.

### 6.4 Gamepad

Le polling est ralenti à environ 1 Hz sans manette, ce qui est une amélioration par rapport à un RAF permanent. Avec manette connectée, le RAF reste continu et traite aussi le scroll et les boutons.

À tester :

- Xbox, DualSense, Switch Pro et manette générique ;
- ordre A/B sur Nintendo ;
- répétition D-pad et stick ;
- appui long ;
- focus après sortie du mode souris virtuelle ;
- vibration refusée par le navigateur ;
- reconnexion de manette ;
- bouton Play/Pause avec et sans player ;
- navigation de carrousel au bord gauche/droit.

### 6.5 AppLayout et Dynamic Island

L’interface possède plusieurs listeners `document` et `window` : clic extérieur, horloge, resize, événements de menu et recherche. `destroy()` appelle `_unbindEvents`, mais une partie des listeners ajoutés directement dans `_bindHeaderEvents()` n’est pas systématiquement retirée :

- `document.addEventListener('click', ...)` ;
- listeners de l’island ;
- timers de fermeture ;
- intervalle horloge.

Le code courant déclare `_clockInterval`, mais le nettoyage complet doit être vérifié : l’existence du champ ne prouve pas que `destroy()` appelle `clearInterval`.

### 6.6 Modales et retour TV

Les modales admin, analytics, console, bibliothèque et fiche média ont des implémentations différentes.

**Attendus minimaux :**

- `role="dialog"` ;
- `aria-modal="true"` ;
- focus trap ;
- bouton de fermeture focusable ;
- Escape/Back ;
- restauration du focus sur l’élément d’origine ;
- blocage de la navigation derrière la modale ;
- suppression complète après fermeture.

`Modal.js` est relativement avancée. Les modales custom, notamment `AnalyticsModal`, la modale de gestion de bibliothèque et plusieurs modales d’intégration, n’offrent pas toutes le même niveau.

### 6.7 Matrice TV minimale

| Scénario | Résultat attendu |
|---|---|
| Ouvrir l’app avec une session valide | Le premier focus est visible et placé sur une action utile. |
| Ouvrir l’app sans session | Le focus arrive dans l’URL serveur ou le nom utilisateur. |
| Flèche droite dans un carrousel | Carte suivante, scroll minimal, pas de saut vers une autre section. |
| Flèche gauche sur première carte | Focus conservé ou retour logique vers la section précédente. |
| Flèche bas depuis la dernière carte d’une ligne | Première carte logique de la ligne suivante. |
| Enter sur une carte film | Fiche ou player selon l’action explicite. |
| Enter sur une série | NextUp ou premier épisode, jamais une série non lisible directement sans résolution. |
| Back dans une modale | Ferme la modale et restaure le focus d’origine. |
| Back dans le player | Ferme le player sans perdre la vue précédente. |
| Menu sur une vue | Ouvre le tiroir et focalise son premier item. |
| Escape dans un champ de recherche | Ferme seulement le contexte prévu, sans perdre le texte par erreur. |
| Changement de vue pendant un chargement | La réponse de l’ancienne vue ne remplace pas la nouvelle. |
| Bibliothèque vide | Message clair et focusable, sans boucle de navigation. |
| Serveur lent | Spinner, timeout et retry utilisables à la télécommande. |
| Session expirée | Retour contrôlé à la connexion, sans écran vide. |

---

## 7. Source réelle des données et logique serveur

### 7.1 Jellyfin

Les données suivantes proviennent réellement d’appels Jellyfin dans le mode ESM :

- utilisateur courant ;
- bibliothèques ;
- items ;
- genres ;
- épisodes/saisons ;
- reprise et NextUp ;
- favoris et statut lu ;
- sessions ;
- compteurs ;
- configuration système ;
- tâches ;
- logs ;
- plugins serveur ;
- lecture et reporting partiel.

Cependant, le client utilise aussi :

- fallbacks locaux ;
- cache IndexedDB/localStorage ;
- heuristiques de type de bibliothèque ;
- valeurs d’affichage par défaut ;
- transformations de données Jellyseerr/TMDB.

L’interface doit afficher la provenance lorsque cela influence la décision de l’utilisateur.

### 7.2 Services externes

Les clients Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr et qBittorrent effectuent de vrais appels lorsqu’ils sont configurés. La présence d’une clé API ou d’une URL ne prouve toutefois pas que le service est joignable.

À corriger dans l’interface :

- ne jamais afficher `En ligne` avant un test réussi ;
- ne pas transformer une réponse vide en santé positive ;
- afficher `Non configuré`, `Test en cours`, `En ligne`, `Refusé`, `Hors ligne`, `Inconnu` séparément ;
- conserver le timestamp et la latence du dernier test ;
- différencier service activé, service configuré et service joignable.

### 7.3 Données visiblement simulées ou trompeuses

Constats confirmés :

- `AdminDashboardView` construit ses cartes de services avec un statut `online` fixe et ne consomme pas les `checker` définis ;
- `_testAllServices()` joue une animation puis affiche « tous les microservices répondent » avec « latence < 12ms » sans appeler les services ;
- la qualité média admin affiche `Médiathèque 100% opérationnelle en 4K UHD & 1080p` sans analyse correspondant à cette affirmation ;
- le dashboard utilise `|| true` pour le filtre Science-Fiction ;
- plusieurs composants utilisent des notes par défaut (`8.5`, `8.2`, `88`) lorsque Jellyfin ne fournit pas de note ;
- certaines notes Rotten Tomatoes sont dérivées d’une note Jellyfin ou d’une valeur de repli, alors qu’elles sont présentées avec une icône Rotten Tomatoes ;
- `CardBuilder` peut afficher un score RT calculé à partir de `CommunityRating`, ce qui n’est pas une vraie note Rotten Tomatoes ;
- la détection anime repose sur des mots-clés locaux et non sur un champ serveur garanti.

**Décision produit recommandée :** supprimer les scores externes non disponibles, ou les afficher sous un libellé explicite comme « score SpaceHub estimé » — ce qui reste moins recommandé que leur suppression.

---

## 8. Audit du player et des médias

### 8.1 Fonctionnement présent

`VideoPlayer` contient :

- montage d’un player SpaceHub ;
- HLS.js ;
- lecture HLS native si disponible ;
- fallback direct ;
- reprise depuis `PlaybackPositionTicks` ;
- audio et sous-titres ;
- épisodes précédent/suivant ;
- reporting de lecture ;
- enrichissement différé par `getItem()` ;
- auto-play soumis aux règles du navigateur ;
- nettoyage de l’instance HLS lors d’un changement de source.

La logique de résolution d’une série vers un épisode est adaptée à un client Jellyfin, à condition de ne pas masquer l’échec au serveur.

### 8.2 Problèmes de sécurité

Le player n’ajoute plus le token dans les URLs `master.m3u8`, images ou `/stream`. Hls.js transmet l’autorisation via header ; en lecture HLS native, le navigateur ne permet pas d’ajouter ce header, donc un serveur/cookie compatible est requis.

**Limite résiduelle :** le fallback direct sans header peut échouer sur un navigateur qui ne dispose pas d’une session cookie compatible. Il doit être validé sur Safari et sur le reverse-proxy réellement utilisé.

### 8.3 Problèmes fonctionnels à valider

- accès à un flux HLS avec les headers effectivement transmis par Hls.js ;
- Safari et lecture native, car le listener `loadedmetadata` peut être ajouté à plusieurs reprises si le player est réutilisé ;
- fallback direct après une erreur HLS fatale, qui peut déclencher plusieurs bascules ;
- reporting périodique et arrêt propre lors de la fermeture ;
- lecture d’un item sans `MediaSources` ;
- audio/sous-titre après enrichissement différé ;
- lecture d’un épisode d’un autre serveur ou d’un média Jellyseerr non présent ;
- reprise lorsque la position est proche de la fin ;
- autoplay bloqué ;
- transcodage serveur réel et statut Direct Play/Transcode affiché côté admin.

### 8.4 Optimisation recommandée

- choisir la source et la qualité côté serveur avant d’instancier HLS ;
- ne charger les métadonnées enrichies qu’après démarrage du flux ;
- annuler les enrichissements d’un item précédent ;
- centraliser le reporting dans `ApiClient` ;
- supprimer toute URL contenant le token principal ;
- détruire HLS, timers, listeners vidéo et popovers dans un `destroy()` unique ;
- afficher clairement Direct Play, Direct Stream et Transcoding à partir de la session Jellyfin réelle.

---

## 9. Rôles, permissions et modèle produit

### 9.1 Utilisateur standard

Un utilisateur standard doit pouvoir :

- se connecter ;
- voir uniquement ses bibliothèques autorisées ;
- rechercher et lire ce qui lui est accessible ;
- gérer ses favoris et sa progression ;
- utiliser ses statistiques personnelles ;
- demander un média si Jellyseerr l’autorise ;
- configurer ses préférences locales.

Il ne devrait pas voir ou pouvoir déclencher :

- configuration serveur Jellyfin ;
- gestion des utilisateurs ;
- arrêt/redémarrage serveur ;
- tâches et logs admin ;
- contrôle distant d’autres sessions ;
- approbation/refus de demandes sans permission.

### 9.2 Administrateur

L’administrateur peut accéder aux fonctions serveur, mais l’UI doit vérifier le rôle réel (`Policy.IsAdministrator`) avant d’afficher l’entrée admin. Le serveur reste l’autorité finale : masquer le bouton n’est pas une protection suffisante.

### 9.3 Problèmes actuels

- `AppLayout` affiche l’entrée « Administration Serveur » pour tout utilisateur connecté ;
- les erreurs 401/403 ne sont pas toujours distinguées d’une panne ;
- `AdminDashboardView` affiche des services en ligne sans tester leur connectivité ;
- les actions sensibles ne sont pas toutes confirmées avec un niveau adapté ;
- l’interface admin ne montre pas clairement la provenance des données et la date du dernier test ;
- l’appel au résumé Bazarr utilise la mauvaise couche (`api` au lieu du service) ;
- la console système expose des actions destructrices qui doivent être vérifiées avec confirmation renforcée et droits serveur.

### 9.4 Modèle produit recommandé

SpaceHub devrait avoir trois profils d’interface :

1. **Client utilisateur :** médias, recherche, lecture, favoris, demandes autorisées.
2. **Centre personnel :** statistiques, préférences, thèmes, historique et listes.
3. **Centre administration :** services, sessions, tâches, utilisateurs et configuration, visible uniquement après vérification du rôle.

Le centre Servarr doit également être présenté comme une extension optionnelle, pas comme une condition pour utiliser Jellyfin.

---

## 10. Audit sécurité et confidentialité

### 10.1 Risques critiques/élevés actuels

| Priorité | Zone | Constat actuel |
|---|---|---|
| 🔶 | Player | Lecture HLS native à valider lorsque le navigateur ne permet pas d’ajouter le header d’autorisation. |
| ✅ | AuthManager | Token limité à `sessionStorage`; l’identifiant d’appareil reste dans `localStorage`. |
| P0 | AdminDashboard | États de santé et succès de test présentés sans appels réels. |
| P1 | UI | Nombreuses interpolations HTML de données externes dans les widgets/modales, à inventorier et sécuriser intégralement. |
| P1 | SettingsPanel | Secrets d’intégration persistés en localStorage non chiffré. |
| P1 | Proxy | Proxy dev anti-SSRF utile mais non solution de production ; TLS local désactivé. |
| P1 | Global API | Mutation de `window.ApiClient` pouvant affecter Jellyfin Web natif. |
| P2 | SDK | Plugins tiers sans permissions ni isolation. |
| P2 | CDN | Chargement de scripts distants sans SRI ni verrouillage systématique de version. |

### 10.2 XSS

Des corrections récentes ont été intégrées :

- `Modal` utilise désormais `textContent` pour le titre ;
- `escapeHtml()` est centralisé ;
- plusieurs widgets échappent `err.message`.

**État actuel :** les surfaces identifiées dans le périmètre de la correction utilisent désormais `escapeHtml()` ou `textContent`. Un audit XSS complet des scripts legacy reste nécessaire avant d’affirmer une clôture globale.

La correction n’est pas complète si une valeur externe est insérée dans :

- `innerHTML` ;
- `title`, `alt`, `style`, `src`, `data-*` ;
- CSS inline ;
- attributs construits par interpolation ;
- templates de calendrier, cartes Jellyseerr, sessions admin ou recommandations.

Le rapport recommande une règle simple : créer les nœuds DOM et affecter `textContent`, `dataset` et propriétés DOM lorsque la donnée est externe. L’échappement HTML doit rester une solution contrôlée pour les templates statiques.

### 10.3 Secrets

Les clés Sonarr/Radarr/Prowlarr/Bazarr/Jellyseerr, le mot de passe qBittorrent et les tokens de notification ne doivent pas être considérés comme protégés par le simple fait d’être dans `SettingsManager` : celui-ci persiste dans `localStorage`.

Options réalistes :

- session-only par défaut ;
- stockage serveur via un backend de confiance ;
- Web Crypto avec clé non persistée, en expliquant les limites ;
- séparation stricte des secrets admin et utilisateur ;
- bouton « effacer les secrets » ;
- jamais afficher les valeurs dans les exports ou logs.

### 10.4 SSRF et URLs

Les URLs des services sont configurables par l’utilisateur et utilisées depuis le navigateur ou le proxy. Il faut :

- parser avec `new URL()` ;
- autoriser uniquement `http`/`https` selon le besoin ;
- bloquer les schémas non HTTP ;
- définir une politique LAN explicite ;
- ne pas prétendre fournir une protection SSRF complète côté navigateur ;
- sécuriser le proxy de production avec allowlist et authentification ;
- ne jamais désactiver TLS sans option explicite documentée.

---

## 11. Audit performance et stabilité

### 11.1 Démarrage

L’initialisation crée et prépare beaucoup de composants avant le premier écran utile, puis charge les six intégrations les unes après les autres. Sur une machine TV ou un serveur lent :

- splash plus long ;
- travail JS important ;
- nombreuses feuilles de style injectées ;
- plusieurs widgets déclenchent rapidement des requêtes parallèles ou séquentielles ;
- le dashboard peut monter de nombreuses sections dont l’utilisateur n’a pas besoin.

**Recommandations :** afficher rapidement le shell et le contenu Jellyfin essentiel, puis charger les intégrations et widgets secondaires en différé ; paralléliser les modules indépendants ; ne pas tester les intégrations au démarrage sans demande explicite.

### 11.2 DOM et rendu

Risques identifiés :

- fichiers de plusieurs milliers de lignes ;
- CSS injecté dans les classes JS ;
- reconstructions `innerHTML` répétées ;
- listes potentiellement volumineuses ;
- rendu séquentiel du dashboard ;
- nombreux styles inline ;
- listeners attachés à chaque carte ou chaque rendu ;
- `innerHTML +=` historique à surveiller dans le legacy ;
- cartes possiblement recréées lors de chaque refresh.

### 11.3 Timers et listeners

Points à contrôler/corriger :

- horloge `AppLayout` ;
- métriques `DownloadsView` ;
- polling tâches console ;
- polling admin ;
- timers de fermeture Dynamic Island ;
- `setTimeout` de scrollers et transitions ;
- listeners `document` de sidebar, menus et dropdowns ;
- listeners `window.resize` des carrousels ;
- scroll listeners du resume dock ;
- observers et timers des scripts legacy.

Chaque vue et widget monté doit avoir un contrat `destroy()` ou être rendu dans un conteneur dont les listeners sont délégués à un contrôleur unique.

### 11.4 Cache

Le projet contient plusieurs couches :

- `CacheManager` ESM ;
- `indexedDBCache.js` legacy ;
- `localStorageCache.js` legacy ;
- caches métier dans les services.

Le cache est utile, mais la coexistence crée des risques de données périmées, d’invalidation différente et de stockage excessif. Il faut documenter :

- clé ;
- durée ;
- source ;
- invalidation après mutation ;
- comportement offline ;
- taille maximale ;
- nettoyage périodique.

### 11.5 Réseau

Ajouter systématiquement :

- `AbortController` pour recherches et changement de vue ;
- timeout par requête ;
- retry uniquement pour erreurs réseau/429/5xx ;
- pas de retry sur 401/403/404 ;
- déduplication des appels simultanés ;
- indication « données en cache » ;
- protection contre la réponse d’une vue détruite.

---

## 12. Audit UI, centrage, animation et accessibilité

### 12.1 Points forts

- design tokens et surfaces glass cohérents ;
- hiérarchie visuelle premium ;
- états de chargement et d’erreur souvent prévus ;
- boutons avec états hover/active ;
- responsive mobile présent ;
- focus TV visuellement identifié dans le core ;
- `LoginView` et `Modal.js` montrent une bonne intention d’accessibilité.

### 12.2 Problèmes

- styles injectés et `!important` nombreux, ce qui rend les corrections de centrage difficiles ;
- dimensions fixes de grandes modales, parfois inadaptées à un téléviseur 720p ou à un mobile ;
- plusieurs interfaces masquent volontairement les scrollbars, ce qui peut réduire la compréhension du contenu ;
- Dynamic Island, resume dock, sidebar et modales se superposent avec des z-index élevés ;
- absence de stratégie globale `prefers-reduced-motion` ;
- animations nombreuses lors du rendu initial et du focus, avec risque de fatigue visuelle ;
- certains textes affichés comme diagnostics sont trop affirmatifs ;
- emojis utilisés comme icônes fonctionnelles sans toujours fournir de libellé accessible ;
- `AnalyticsModal` et d’autres modales custom nécessitent un alignement avec le contrat de `Modal.js` ;
- certains éléments cliquables sont des `div` plutôt que des boutons/liens ;
- doublons d’attributs `tabindex` et `data-nav-focusable` dans plusieurs templates, signe de génération/édition accumulée.

### 12.3 Centrage et TV

Le centrage visuel doit être validé à ces résolutions :

- 1280×720 ;
- 1920×1080 ;
- 3840×2160 ;
- viewport réduit avec zoom navigateur ;
- mobile portrait et paysage.

Vérifier particulièrement :

- modal admin ;
- console Jellyfin ;
- fiche média ;
- calendrier ;
- Dynamic Island déployée ;
- sidebar ouverte ;
- player et tiroirs audio/sous-titres ;
- cartes avec titre très long ;
- langues et polices différentes.

### 12.4 Accessibilité minimale à atteindre

- un seul élément `tabindex="0"` actif par zone quand la navigation TV est engagée ;
- `aria-label` pour les boutons icon-only ;
- `role="dialog"` et `aria-modal` pour toutes les modales ;
- focus trap uniforme ;
- Escape et Back documentés ;
- contraste vérifié ;
- taille de cible adaptée à la télécommande ;
- respect de `prefers-reduced-motion` ;
- annonces d’erreur avec `role="alert"` ;
- aucune information essentielle uniquement portée par la couleur.

---

## 13. Évaluation logique du produit

### 13.1 Ce qui est logique

- utiliser Jellyfin comme source d’autorité pour les bibliothèques, droits, progression et lecture ;
- garder Sonarr/Radarr/Bazarr/Prowlarr/Jellyseerr/qBittorrent optionnels ;
- proposer une vue unifiée des services externes ;
- séparer API bas niveau, service métier et widget ;
- permettre à l’utilisateur de personnaliser l’ordre et la visibilité des bibliothèques ;
- offrir une navigation TV dédiée plutôt qu’un simple site desktop ;
- ouvrir une fiche avant de lire un média découvert externe ;
- garder les statistiques personnelles côté client lorsque Jellyfin ne fournit pas directement la métrique.

### 13.2 Ce qui n’est pas encore suffisamment logique

- afficher des fonctions d’administration à un utilisateur qui n’est pas admin ;
- annoncer des microservices « en ligne » sans test ;
- annoncer la médiathèque « 100% opérationnelle en 4K » sans analyse ;
- mélanger note Jellyfin, estimation SpaceHub et note Rotten Tomatoes ;
- traiter les données TMDB/Jellyseerr comme si elles étaient des médias locaux ;
- faire dépendre un filtre utilisateur d’un `|| true` ;
- avoir un Router central qui ne représente pas toutes les navigations réelles ;
- appeler une méthode du service sur l’objet API dans le diagnostic Bazarr ;
- exposer la configuration de secrets dans le même stockage persistant que les préférences ordinaires ;
- proposer une architecture plugin sans permissions alors que le plugin reçoit API, UI et settings.

### 13.3 Expérience attendue d’un client Jellyfin normal

Un client normal doit fonctionner correctement même si :

- aucun service Servarr n’est installé ;
- l’utilisateur n’est pas admin ;
- certaines bibliothèques sont interdites ;
- le serveur est lent ;
- un poster manque ;
- un média n’a pas de note ;
- le navigateur bloque l’autoplay ;
- le serveur refuse le transcodage ;
- une session expire ;
- le réseau externe est indisponible.

SpaceHub s’en approche, mais les fallbacks actuels doivent être moins affirmatifs et les états dégradés doivent rester utilisables.

---

## 14. Protocole de recette réelle

### 14.1 Préparation

Prévoir :

- Jellyfin récent et un compte administrateur ;
- un compte utilisateur standard ;
- bibliothèques Films, Séries, Musique, Collections et au moins une bibliothèque personnalisée ;
- médias avec poster, sans poster, avec sous-titres et sans sous-titres ;
- au moins une série avec NextUp et une série sans progression ;
- un navigateur desktop ;
- un téléviseur ou viewport 1280×720 ;
- une manette Xbox ou PlayStation ;
- Sonarr, Radarr, Bazarr, Prowlarr, Jellyseerr et qBittorrent disponibles séparément ;
- chaque service testé dans les états configuré, incorrect, hors ligne et absent.

### 14.2 Authentification

- [ ] Connexion avec URL directe.
- [ ] Connexion via proxy de développement.
- [ ] Mauvais identifiants.
- [ ] Serveur inaccessible.
- [ ] Session valide après rechargement.
- [ ] Session expirée pendant la navigation.
- [ ] Déconnexion et suppression de toutes les données sensibles.
- [ ] Vérification qu’aucun token n’apparaît dans les URLs de lecture ou logs.

### 14.3 Client utilisateur

- [ ] Bibliothèques autorisées uniquement.
- [ ] Bibliothèque vide.
- [ ] Recherche, debounce et changement rapide de terme.
- [ ] Filtres genres, favoris, non vus, reprise et 4K.
- [ ] Modes poster, paysage et liste.
- [ ] Favori puis actualisation.
- [ ] Marquage lu/non lu.
- [ ] Fiche d’un film.
- [ ] Fiche d’une série, saison, épisode et retour.
- [ ] Lecture directe.
- [ ] Reprise.
- [ ] Sous-titre et audio.
- [ ] Épisode suivant.
- [ ] Autoplay bloqué.
- [ ] Statistiques personnelles avec médiathèque petite et volumineuse.

### 14.4 Navigation TV

- [ ] Premier focus après login.
- [ ] Flèches dans Dynamic Island.
- [ ] Flèches dans chaque carrousel.
- [ ] Passage entre rangées.
- [ ] Back depuis fiche, modale, sidebar et player.
- [ ] Menu et fermeture du tiroir.
- [ ] Enter sur tous les boutons principaux.
- [ ] PageUp/PageDown.
- [ ] Appui long et auto-repeat.
- [ ] Manette connectée après démarrage.
- [ ] Manette déconnectée puis reconnectée.
- [ ] Mode souris virtuelle.
- [ ] Focus après chargement asynchrone.
- [ ] Focus après refresh.
- [ ] Focus après erreur réseau.

### 14.5 Admin

Avec le compte standard :

- [ ] l’entrée admin est absente ou refusée proprement ;
- [ ] aucune configuration serveur n’est accessible ;
- [ ] aucune action distante n’est exécutée.

Avec le compte administrateur :

- [ ] sessions réelles ;
- [ ] arrêt d’une session ;
- [ ] message à une session ;
- [ ] compteurs Jellyfin ;
- [ ] scan bibliothèque ;
- [ ] utilisateurs ;
- [ ] politique utilisateur ;
- [ ] tâches ;
- [ ] logs ;
- [ ] plugins serveur ;
- [ ] configuration réseau/transcodage ;
- [ ] redémarrage/arrêt avec confirmation renforcée ;
- [ ] statut de chaque service issu d’un test réel ;
- [ ] latence affichée cohérente.

### 14.6 Intégrations

Pour chaque intégration :

- [ ] URL correcte + clé correcte ;
- [ ] clé incorrecte ;
- [ ] service hors ligne ;
- [ ] service absent ;
- [ ] test de connexion ;
- [ ] état affiché correspondant au résultat ;
- [ ] refresh ;
- [ ] cache ;
- [ ] mutation serveur ;
- [ ] erreur 401/403 différenciée ;
- [ ] bouton désactivé pendant l’appel ;
- [ ] réponse confirmée avant d’afficher succès.

### 14.7 Player et performance

- [ ] Direct Play.
- [ ] Direct Stream.
- [ ] Transcodage.
- [ ] HLS.
- [ ] lecture native Safari si concerné.
- [ ] changement de média rapide.
- [ ] fermeture immédiate pendant le chargement.
- [ ] reporting visible dans les sessions Jellyfin.
- [ ] absence de fuite de timer après fermeture.
- [ ] CPU et mémoire après 30 minutes de navigation.
- [ ] CPU et mémoire après 20 ouvertures/fermetures de vues et modales.

---

## 15. Plan d’action priorisé

### P0 — Avant usage public

1. Retirer le token Jellyfin des URLs de flux et définir un mécanisme d’authentification média sûr.
2. Cesser d’écrire le token de session dans `localStorage`, ou fournir un choix explicite et sécurisé avec migration des anciennes données.
3. Remplacer les statuts admin simulés par de vrais appels `checkHealth()` et afficher `inconnu` lorsqu’un test n’a pas eu lieu.
4. Supprimer les messages trompeurs : « latence < 12ms », « 100% opérationnelle », scores RT/IMDb par défaut et filtres avec `|| true`.
5. Corriger l’appel Bazarr `api.getWantedSummary()` vers le service métier approprié.
6. Corriger les métriques qBittorrent de `DownloadsView` (`getTransferInfo` versus `getTransferStats`).
7. Vérifier les permissions admin avant d’afficher ou d’exécuter les fonctions d’administration.
8. Établir une recette réelle bloquante pour la navigation TV et le player.

### P1 — Fiabilité produit

1. Choisir une autorité unique pour les routes et vues.
2. Unifier les contrats de modales : rôle, focus trap, Escape/Back, restauration et destruction.
3. Ajouter `AbortController` et protection contre les réponses obsolètes.
4. Uniformiser les états d’intégration : non configuré, test, connecté, refusé, hors ligne, inconnu.
5. Séparer visuellement média Jellyfin, découverte Jellyseerr/TMDB et média demandé.
6. Corriger l’inventaire XSS de toutes les interpolations HTML restantes.
7. Ajouter une confirmation spécifique aux actions destructrices admin et qBittorrent.
8. Ajouter un vrai `destroy()` à `AppLayout`, `DownloadsView`, `Dashboard`, widgets et scrollers.
9. Tester les formats de réponse de chaque endpoint avec les versions prises en charge.

### P2 — Performance et architecture

1. Charger le shell et les données Jellyfin essentielles avant les widgets externes.
2. Paralléliser les modules indépendants.
3. Unifier les caches ESM et legacy.
4. Remplacer les grosses reconstructions DOM par `DocumentFragment` ou délégation d’événements.
5. Externaliser le CSS injecté depuis les gros fichiers JS.
6. Décomposer `VideoPlayer`, `UnifiedSearch`, `ModalSlideUpSheet`, `LibraryView`, `configuration.js`, `homeScreen.js` et `watchlist.js`.
7. Réduire les listeners globaux et les observers legacy.
8. Ajouter une politique de taille et de nettoyage du cache.
9. Générer une mesure Lighthouse/Performance et une mesure TV low-power.

### P3 — Industrialisation

1. Ajouter ESLint réellement exécuté et Prettier.
2. Ajouter Vitest ou un outil de test adapté au projet.
3. Tester `SettingsManager`, `EventBus`, `ModuleManager`, `ApiClient`, `Router`, `InputMapper`, `CarouselController` et les services métier.
4. Ajouter mocks HTTP pour Jellyfin et les six intégrations.
5. Ajouter tests d’accessibilité et tests de navigation TV.
6. Documenter une matrice de versions Jellyfin/Servarr.
7. Définir un SDK versionné avec permissions, compatibilité, manifest et intégrité.
8. Réduire progressivement la dépendance aux scripts legacy.
9. Documenter le déploiement injecté, le standalone et le proxy de production séparément.

---

## 16. Conclusion finale

SpaceHub est **structurellement riche et produit-oriented**, pas un simple habillage Jellyfin. La couverture fonctionnelle est déjà importante et plusieurs flux serveur sont réellement implémentés. La base est suffisamment sérieuse pour poursuivre le développement vers un client Jellyfin complet.

Mais l’application doit encore franchir une étape essentielle : **faire correspondre chaque information affichée à une preuve réelle et chaque action à une permission et un état serveur confirmés**. Tant que les statuts admin sont simulés, que le token circule dans les URLs de lecture, que des notes externes sont estimées, que certaines métriques ne correspondent pas au contrat de service et que la navigation TV n’a pas été validée sur matériel réel, l’application reste une bêta avancée.

La priorité n’est pas d’ajouter encore davantage d’effets visuels ou de widgets. La priorité est de :

1. fiabiliser le client Jellyfin de base ;
2. séparer utilisateur et administrateur ;
3. rendre les intégrations honnêtes sur leur état ;
4. sécuriser les tokens et les templates ;
5. unifier la navigation et le lifecycle ;
6. réaliser la recette TV réelle ;
7. seulement ensuite industrialiser le SDK et la double architecture.

**Avis professionnel :** le projet a un fort potentiel et une vision claire, mais il ne faut pas le présenter comme « entièrement stable » ou « zéro lag » avant la résolution des P0 et la validation contre un environnement Jellyfin/Servarr réel.

---

*Audit statique actualisé le 31 août 2026. Les résultats serveur, réseau, lecture et performance matérielle doivent être complétés par la matrice de recette ci-dessus.*
