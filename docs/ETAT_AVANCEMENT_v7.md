# SpaceHub — État d'Avancement Réel (v7)

> Ce document remplace la vision "roadmap par version" par un état des lieux honnête, organisé par domaine plutôt que par numéro de version, basé sur ce qui a été **réellement testé** (pas juste lu dans le code) au cours de cette session de développement. Date : 20/08/2026.
>
> **v4** ajoutait une nouvelle famille de fonctionnalités demandées : lecteur vidéo personnalisable, lecteur musique, intégration Immich (photos/vidéos), lecteur photo.
> **v5** précisait le contrôle administrateur sur les widgets/sections visibles par les autres utilisateurs.
> **v6** élargit la vision "dashboard complet tous médias" : nouveaux types de contenu (livres, podcasts, audiobooks, Live TV), supervision serveur, découverte/engagement, famille.
> **v7** remplace Readarr/Calibre-Web/Audiobookshelf par **Libraria** (projet développé en parallèle par l'auteur) pour livres + audiobooks — statut des podcasts encore à trancher.

---

## ✅ CE QUI EST FAIT (testé, fonctionnel)

### Architecture & Core
- Décision d'architecture actée : **app web standalone** (Vite), pas un plugin injecté dans Jellyfin Web — nécessaire pour l'objectif final PC/Android/TV.
- `core/SpaceHub.js`, `ModuleManager`, `EventBus`, `SettingsManager`, `CacheManager`, `Logger`, `ApiClient`, `SDK.js` — tous fonctionnels.
- `src/main.js` — point d'entrée réel, orchestre Auth → Login/App.
- `core/Router.js` — routeur interne (URL avec hash, bouton retour navigateur, liens partageables).

### Authentification
- `AuthManager` + `LoginView` — connexion à un vrai serveur Jellyfin, session revalidée au démarrage, gestion d'erreurs réseau complète.
- Token Jellyfin correctement rafraîchi après connexion (bug corrigé).

### Interface & Navigation
- `AppLayout` avec navigation complète : Accueil, Bibliothèques, Downloads, Calendar, Management, Extensions.
- Thème — bouton de changement de thème testé et fonctionnel par l'utilisateur.
- Dashboard avec widgets (Continue Watching, Latest Additions, Quick Actions) + modale **"Personnaliser"** fonctionnelle (ajout/retrait de widgets, bug de layout par défaut corrigé).
- Recherche unifiée (Ctrl+K) — ouverture, résultats, clic pour ouvrir/lire un média.
- Lecture vidéo (`VideoPlayer`) — **testée et fonctionnelle** par l'utilisateur pour les films/épisodes.
- Clic sur un poster (Dashboard, Recherche, Bibliothèque) — centralisé via `window.SpaceHub.openItem()`, ne dépend plus d'API Jellyfin Web absentes en standalone.

### Réglages & Intégrations
- `SettingsPanel` — configuration des 6 intégrations, bouton "Tester" qui teste bien les valeurs tapées à l'écran (pas l'ancienne valeur enregistrée).
- **Les 6 intégrations passent le test de connexion**, confirmé par l'utilisateur : Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr, qBittorrent.
- Réactivité `settings:changed` → mise à jour live des clients API sans reload (déjà bien conçu, vérifié).
- Proxy de développement (`vite.config.js`) — contourne le CORS des services *arr en `npm run dev`, avec logs serveur pour diagnostiquer. Bug de corruption du corps des requêtes POST corrigé (affectait qBittorrent).

### Nouvelles pages (construites cette session)
- **Downloads** — torrents qBittorrent + files d'attente Sonarr/Radarr, dans une seule vue.
- **Calendar** — sorties Sonarr + Radarr des 14 prochains jours, fusionnées et triées.
- **Management** — page par service *arr avec onglets, réutilise les widgets existants.
- **Extensions** — page réservée (placeholder) pour la nav.

---

## 🔶 CE QUI EST PARTIELLEMENT FAIT (existe, mais incomplet ou pas vérifié)

| Élément | État réel |
|---|---|
| **Design System** | `tokens.css` + composants (`CardBuilder`, `Modal`, `SettingsPanel`, `Toaster`) existent. Un seul thème testé avec certitude ; l'existence de plusieurs thèmes complets (`ui/themes/`) n'est pas confirmée. |
| **Bibliothèques (`LibraryView`)** | Fonctionne (navigation par bibliothèque, ouverture de série), mais l'affichage de vraies données à grande échelle (grosses bibliothèques, pagination) n'a pas été testé en conditions réelles. |
| **Page détails média** | La modale d'épisodes fonctionne. Les "collections intelligentes" mentionnées dans le plan original (v0.5) n'ont pas été vérifiées — probablement pas implémentées. |
| **Lecteur média** | Fonctionne pour vidéo (films/épisodes) avec le lecteur de base actuel. **Ne fonctionne pas pour l'audio/musique** — confirmé absent. Un lecteur vidéo *personnalisé* (au-delà du lecteur de base actuel) et un lecteur musique dédié sont maintenant planifiés — voir section "Nouvelles fonctionnalités demandées" ci-dessous. |
| **Proxy CORS** | Fonctionne, mais **seulement en `npm run dev`**. Aucune solution pour la production (`npm run build`) ou l'app Electron/Tauri future — à traiter à ce moment-là (reverse proxy CORS ou petit backend). |
| **Réglages : Import/Reset** | Sauvegardent bien les valeurs, mais n'émettent pas `settings:changed` (contrairement à la sauvegarde champ par champ) — les intégrations ne se mettent pas à jour en live après un import/reset, il faut recharger la page. |
| **Performance** | Le bundle de build fait ~780 Ko (pas de code-splitting) — fonctionne, mais pas optimisé. Vite avertit dessus à chaque build. |

---

## ⬜ CE QUI N'EST PAS FAIT (rien construit)

### Dette technique héritée (signalée depuis le début, jamais traitée)
- **Nettoyage `v0.2bis`** : `spaceHub-injector.js`, `spaceHub-plugin.js`, `scripts/` sont du code mort maintenant que l'app standalone tourne réellement — jamais supprimés ni même désactivés explicitement.

### Fonctionnalités du plan v1.0 original
- **Analytics / statistiques** d'utilisation — rien construit.
- **Notifications** (Discord, Telegram, push navigateur) — rien construit. (Techniquement prêt à démarrer : l'`EventBus` émet déjà des événements comme `sonarr:seriesAdded`.)
- **Media Health** (détection de fichiers corrompus/mal encodés + re-téléchargement en 1 clic) — rien construit.
- **Performance monitoring** — rien construit.
- **Extension SDK — écosystème public** : `core/SDK.js` existe en interne (utilisé par les 6 intégrations), mais aucune marketplace, aucun mécanisme d'installation de plugin tiers. La page "Extensions" n'est qu'un placeholder.

### Idées ajoutées en v2, jamais commencées
- **Permissions par utilisateur** — voir version détaillée dans "Nouvelles fonctionnalités demandées" (v5) : contrôle admin des widgets/sections visibles par utilisateur, pas juste un interrupteur binaire admin/non-admin.
- **Assistant de setup / auto-découverte réseau** des services *arr — rien construit.
- **Mode TV / 10-foot UI** — rien construit.
- **Chiffrement des clés API** — volontairement pas fait maintenant (peu de valeur réelle côté navigateur), prévu pour la phase Electron/Tauri via stockage sécurisé OS.

### Empaquetage natif (objectif final du projet)
- **Desktop (Electron/Tauri)** — pas commencé.
- **Mobile (Capacitor)** — pas commencé.
- **TV** — pas commencé.
- Ces trois dépendent d'une app web standalone stable, qui est maintenant globalement en place — mais aucun travail d'empaquetage n'a démarré.

---

## 🆕 Nouvelles fonctionnalités demandées (v4)

### Demandées explicitement

| Fonctionnalité | Description | Dépendances |
|---|---|---|
| **Lecteur vidéo personnalisé** | Aller au-delà du `VideoPlayer` actuel (fonctionnel mais basique) : thème visuel propre à SpaceHub, gestes tactiles (mobile/TV), réglages avancés (vitesse, pistes audio/sous-titres, sauts avant/arrière configurables), reprise de lecture améliorée. | `jellyfin/player/VideoPlayer.js` existant, à faire évoluer plutôt qu'à réécrire. |
| **Lecteur musique** | Nouveau : lecture audio (bibliothèques musicales Jellyfin), file d'attente, contrôle depuis n'importe quelle page (mini-lecteur persistant), scrobbling optionnel. | Nouveau module `jellyfin/player/AudioPlayer.js` + API musique de Jellyfin (déjà exposée par `JellyfinAPI.js`, pas encore utilisée pour l'audio). |
| **Intégration Immich** | 7ᵉ intégration : gestion de photos/vidéos personnelles (alternative auto-hébergée à Google Photos), très courante dans les stacks self-hosted aux côtés de Jellyfin. | Nouveau dossier `integrations/immich/` suivant le patron Api → Service → Widgets déjà en place pour les 6 autres. |
| **Lecteur photo** | Visionneuse de photos (albums, plein écran, diaporama) — nécessaire pour exploiter l'intégration Immich, plutôt qu'un simple lien externe vers Immich. | Dépend de l'intégration Immich ci-dessus. Nouveau `ui/views/PhotosView.js`. |
| **Contrôle admin des widgets par utilisateur** | L'administrateur du serveur choisit, pour chaque utilisateur (ou groupe d'utilisateurs) du serveur Jellyfin, quels widgets/sections apparaissent dans leur SpaceHub — ex : afficher Calendar + demandes Jellyseerr aux autres utilisateurs, mais garder Management (Sonarr/Radarr/qBittorrent) réservé à l'admin. Différent du "Personnaliser" actuel qui est un choix que **chaque utilisateur fait pour lui-même** : ici c'est l'admin qui décide **pour les autres**, avec un droit de véto sur ce qu'un utilisateur non-admin peut activer. | Étend l'idée "Permissions par utilisateur" du v2 (déjà notée plus bas) — la rend plus précise : pas juste un interrupteur admin/non-admin binaire sur Management/Extensions, mais une vraie liste de widgets/sections activables par profil, gérée par l'admin. Nécessite un espace de réglages "par utilisateur" côté `SettingsManager` (aujourd'hui les réglages sont globaux à l'installation, pas par compte Jellyfin) — c'est le vrai prérequis technique à poser avant de coder cette fonctionnalité. |

### Idées complémentaires proposées

- **Mini-lecteur persistant** — une fois le lecteur musique en place, garder une barre de lecture visible en bas de l'écran quelle que soit la page consultée (comme Spotify/YouTube Music), plutôt que de perdre la lecture en changeant de section.
- **Diaporama / mode économiseur d'écran photo** — utile sur un client TV : affichage automatique des photos Immich façon cadre photo numérique quand l'app est inactive.
- **Souvenirs / "Il y a un an"** — widget dashboard basé sur les métadonnées de date Immich, dans l'esprit "Google Photos memories".
- **Page "Demandes"** orientée utilisateur — Jellyseerr est déjà intégré côté admin (Management), mais une vraie page où un membre du foyer peut chercher et demander un film/série (sans avoir accès aux réglages) manque encore.
- **Cast / diffusion** (Chromecast, DLNA) — pertinent pour l'objectif TV, permettrait de lancer une lecture depuis le mobile vers la TV.
- **Multi-serveur Jellyfin** — utile si plusieurs serveurs Jellyfin existent.
- **Recherche de sous-titres manuelle** — action rapide "chercher un sous-titre pour cet épisode précis" directement depuis la fiche média.

---

## 🆕 v6 — Vers un dashboard vraiment "tous médias"

### Nouveaux types de médias / intégrations

| Fonctionnalité | Description | Intégration probable |
|---|---|---|
| **Livres / Ebooks** | Bibliothèque de livres avec liseuse intégrée (epub/pdf). | **Libraria** — projet personnel de l'auteur. |
| **Livres audio** | Bibliothèque audiobooks avec reprise de lecture, vitesse de lecture ajustable, chapitres. | **Libraria** — même intégration que les ebooks. |
| **Podcasts** | Abonnements, nouveaux épisodes, lecture avec reprise. | Libraria ou Audiobookshelf. |
| **Musique automatisée** | Lidarr pour automatiser l'ajout de musique. | **Lidarr**. |
| **Live TV / DVR** | Guide des programmes TV et chaînes en direct. | API Jellyfin native (`LiveTv/*`). |

### Supervision & statistiques serveur

- **Widget "Santé du serveur"** — CPU, RAM, espace disque, température.
- **Widget "Espace disque par bibliothèque"** — Répartition de l'espace disque.
- **Activité en direct** — Sessions de lecture actives en direct sur le serveur.
- **Statistiques de visionnage** — Historique, top médias, temps total.

### Découverte & engagement

- **Recommandations personnalisées** — basées sur l'historique.
- **"Tendances du moment"** — ce qui est le plus regardé/écouté sur le serveur.
- **Watchlist personnelle** — liste "à voir plus tard".
- **Bande-annonces intégrées** — lecture directe de trailers.

### Famille & contrôle parental

- **Profils enfants avec filtrage de contenu** — restriction par classification d'âge.
- **Limite de temps d'écran** — quota quotidien/hebdomadaire.
- **Rapport hebdomadaire** — résumé automatique envoyé par Discord/Telegram.
