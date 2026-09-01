# SpaceHub — Roadmap

## Statuts
- ✅ Terminé
- 🔄 En cours
- 🔜 Planifié
- ❌ Non démarré

---

## v0.1 — Fork Propre ✅

**Objectif** : Transformer KefinTweaks en SpaceHub sans casser l'existant.

- [x] Renommer le projet KefinTweaks → SpaceHub
- [x] Remplacer toutes les occurrences de `KefinTweaks` par `SpaceHub`
- [x] Nettoyer les références dans le code
- [x] Réécrire le README.md
- [x] Restructurer le repository selon l'arborescence cible
- [x] Créer `core/SpaceHub.js` (namespace global)
- [x] Renommer les skins (-kefin → -spacehub)

---

## v0.2 — SpaceHub Core ✅

**Objectif** : Créer le socle technique modulaire.

- [x] `core/ModuleManager.js` — Chargement/déchargement des modules avec résolution des dépendances
- [x] `core/EventBus.js` — Système pub/sub (on, once, off, emit, clear)
- [x] `core/SettingsManager.js` — Configuration persistante avec notation pointée et import/export
- [x] `core/CacheManager.js` — Cache unifié IndexedDB + localStorage avec TTL et getOrFetch
- [x] `core/ApiClient.js` — Client HTTP générique avec retry, JellyfinClient, et registry nommé
- [x] `core/Logger.js` — Logs structurés avec niveaux, timestamps et namespace
- [x] `core/SpaceHub.js` — Mis à jour : orchestre tous les modules au démarrage

---

## v0.3 — Design System ✅

**Objectif** : Créer l'identité visuelle et les composants réutilisables.

- [x] `ui/design-system/tokens.css` — Variables CSS globales (--sh-*)
- [x] `ui/components/CardBuilder.js` — Cartes médias (posters, backdrops, thumbs, skeletons, grilles)
- [x] `ui/components/Modal.js` — Fenêtres modales accessibles avec focus trap et animations
- [x] `ui/components/Toaster.js` — Notifications toast typées avec auto-dismiss et actions
- [x] `ui/themes/ThemeManager.js` — Système dynamique de thèmes CSS connecté aux settings et EventBus
- [x] Presets : SpaceHub Dark/Light, Nothing OS, Cyberpunk, Nord, Catppuccin Mocha, Tokyo Night, Material You, Minimal

---

## v0.4 — Dashboard ✅

**Objectif** : Tableau de bord modulaire avec widgets configurables.

- [x] `ui/layouts/Dashboard.js` — Gestionnaire de grille responsive, cycle de vie des widgets, modale de personnalisation
- [x] `ui/widgets/QuickActionsWidget.js` — Raccourcis rapides (changement de thème, recherche, rechargement, réglages)
- [x] `ui/widgets/ContinueWatchingWidget.js` — Reprise de lecture en cours depuis Jellyfin avec backdrop cards et progress bar
- [x] `ui/widgets/LatestAdditionsWidget.js` — Derniers ajouts Jellyfin en grille de posters avec liens de lecture directe
- [x] `core/SpaceHub.js` — Intégration et initialisation automatique de `SpaceHub.ui.dashboard`

---

## v0.5 — Jellyfin Core Amélioré ✅

**Objectif** : Finaliser l'expérience Jellyfin native.

- [x] `jellyfin/api/JellyfinAPI.js` — Helper et abstraction API Jellyfin enrichie avec cache persistant, gestion des bibliothèques, items, épisodes, sessions et favoris
- [x] `jellyfin/search/UnifiedSearch.js` — Recherche instantanée unifiée (live debounced), filtres par catégories et raccourcis clavier globaux (`Ctrl+K` / `/`)
- [x] `jellyfin/collections/SmartCollections.js` — Générateur de collections intelligentes dynamiques (Top Rated, Unwatched par Genre, Décennies, etc.)
- [x] `core/SpaceHub.js` — Câblage de `SpaceHub.jellyfin` dans le bootstrap principal

---

## v0.6 — Sonarr Integration ✅

**Objectif** : Gestion complète des séries TV.

- [x] `integrations/sonarr/SonarrApi.js` — Client API Sonarr v3 avec endpoints series, calendar, queue, profiles, root folders
- [x] `integrations/sonarr/SonarrService.js` — Logique métier, validation d'existence de séries, persistance cache et publication d'événements
- [x] `integrations/sonarr/SonarrWidgets.js` — Widgets `UpcomingEpisodesWidget` (calendrier) et `SonarrQueueWidget` (téléchargements en direct)
- [x] `core/SpaceHub.js` — Enregistrement du module Sonarr dans le `ModuleManager` et widgets dans le `Dashboard`

---

## v0.7 — Radarr Integration ✅

**Objectif** : Gestion complète des films.

- [x] `integrations/radarr/RadarrApi.js` — Client API Radarr v3 avec endpoints movies, calendar, queue, profiles, root folders
- [x] `integrations/radarr/RadarrService.js` — Logique métier, validation des films, requêtes, persistance et synchronisation
- [x] `integrations/radarr/RadarrWidgets.js` — Widgets `UpcomingMoviesWidget` (sorties cinéma/digital) et `RadarrQueueWidget` (téléchargements en direct)
- [x] `core/SpaceHub.js` — Enregistrement du module Radarr dans `ModuleManager` et intégration des widgets au dashboard

---

## v0.8 — Prowlarr Integration ✅

**Objectif** : Gestion centralisée des indexeurs torrent / usenet.

- [x] `integrations/prowlarr/ProwlarrApi.js` — Client API Prowlarr v1 (indexers, search, stats, status, applications)
- [x] `integrations/prowlarr/ProwlarrService.js` — Service métier de surveillance de santé, requêtes et test de connectivité
- [x] `integrations/prowlarr/ProwlarrWidgets.js` — Widget `ProwlarrStatusWidget` (santé, compteurs en ligne/dégradé, protocoles)
- [x] `core/SpaceHub.js` — Enregistrement du module Prowlarr dans `ModuleManager` et intégration du widget au dashboard

---

## v0.9 — Bazarr Integration ✅

**Objectif** : Gestion automatisée et synchronisation des sous-titres.

- [x] `integrations/bazarr/BazarrApi.js` — Client API Bazarr v1 (wanted movies/episodes, search subtitles, providers, sync)
- [x] `integrations/bazarr/BazarrService.js` — Service métier de surveillance des sous-titres recherchés, recherche et synchronisation
- [x] `integrations/bazarr/BazarrWidgets.js` — Widget `BazarrWantedWidget` (liste des médias sans sous-titres, recherche individuelle, sync globale)
- [x] `core/SpaceHub.js` — Enregistrement du module Bazarr dans `ModuleManager` et intégration du widget au dashboard

---

## v0.10 — Jellyseerr Integration ✅

**Objectif** : Gestion des demandes d'utilisateurs et découverte de médias.

- [x] `integrations/jellyseerr/JellyseerrApi.js` — Client API Jellyseerr v1 (requests, search, trending, approve, decline)
- [x] `integrations/jellyseerr/JellyseerrService.js` — Service métier de gestion des demandes utilisateurs et médias tendances
- [x] `integrations/jellyseerr/JellyseerrWidgets.js` — Widgets `JellyseerrRequestsWidget` (approbation/refus) et `JellyseerrTrendingWidget` (+ Demander)
- [x] `core/SpaceHub.js` — Enregistrement du module Jellyseerr dans `ModuleManager` et widgets dans le dashboard

---

## v0.11 — qBittorrent Integration ✅

**Objectif** : Client de téléchargement intégré.

- [x] `integrations/qbittorrent/QBittorrentApi.js` — Client API WebUI qBittorrent (session auth, transfer info, torrents listing, pause/resume, delete, add magnet)
- [x] `integrations/qbittorrent/QBittorrentService.js` — Service métier de gestion des torrents actifs, vitesses et actions en direct
- [x] `integrations/qbittorrent/QBittorrentWidgets.js` — Widgets `QBittorrentSpeedWidget` (jauges DL/UP) et `QBittorrentActiveWidget` (liste torrents avec contrôles)
- [x] `core/SpaceHub.js` — Enregistrement du module qBittorrent dans `ModuleManager` et intégration des widgets au dashboard

---

## v1.0 — Release Stable ✅

- [x] `ui/components/SettingsPanel.js` — Panneau de réglages complet (thèmes, dashboard, tests de connexions Servarr & qBittorrent, backup JSON)
- [x] `core/SDK.js` — Extension SDK officiel (`registerWidget`, `registerTheme`, `registerModule`, `on`, `emit`, `showToast`, `openModal`)
- [x] `core/SpaceHub.js` — Orchestration complète v1.0 Stable et exposition globale
- [x] `README.md` & Documentation — Mise à jour complète de l'architecture et du guide d'utilisation


