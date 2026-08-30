# SpaceHub — Plan de Développement Complet (v2 — mis à jour)

> **Plugin Jellyfin modulaire** transformant Jellyfin en un **Media Center unifié**.
> **Base** : Fork de [KefinTweaks](https://github.com/nicoo-o/SpaceHub).
> **Architecture** : Frontend JavaScript/CSS injecté dans Jellyfin Web.
> **Objectif** : Remplacer Sonarr, Radarr, Bazarr, Prowlarr, Jellyseerr, qBittorrent, etc. par une **interface unique, cohérente et modulaire**.
>
> **Statut au 17/08/2026** : Le code réel dépasse le README publié (qui n'est pas à jour). Développement effectif jusqu'à **v1.0** selon l'auteur. Ce document remet les statuts à jour et ajoute une décision produit non encore actée formellement (section 10).

---

## 📌 Table des Matières

1. [Vision et Objectifs](#1-vision-et-objectifs)
2. [Audit du Fork KefinTweaks](#2-audit-du-fork-kefintweaks)
3. [Architecture Cible](#3-architecture-cible)
4. [Fichiers KefinTweaks : Conserver / Refactoriser / Supprimer](#4-fichiers-kefintweaks)
5. [Roadmap par Version — Statuts mis à jour](#5-roadmap-par-version)
6. [Conventions de Code](#6-conventions-de-code)
7. [Plan de Migration Concret](#7-plan-de-migration-concret)
8. [Exemples de Code Complets](#8-exemples-de-code)
9. [Notes de Développement](#9-notes-de-developpement)
10. [🆕 Repositionnement Produit : SpaceHub comme Framework UI](#10-repositionnement-produit)
11. [🆕 Évaluation de Cohérence & Idées de Développement](#11-evaluation-et-idees)

---

## 1. Vision et Objectifs

### 🎯 Objectif Principal

Transformer **Jellyfin** en une **plateforme multimédia unifiée**, mélangeant les meilleures fonctionnalités de Plex, Overseerr, Kometa, Tautulli, Sonarr/Radarr/Bazarr/Prowlarr, Jellyseerr.

**Principe directeur** :
> *"L'utilisateur n'a plus besoin d'ouvrir Sonarr, Radarr, Bazarr, Prowlarr, Jellyseerr ou qBittorrent séparément. Tout est accessible dans Space Hub."*

### 🎪 Public Cible

- Utilisateurs Jellyfin cherchant une intégration complète avec les outils *arr*.
- Développeurs souhaitant étendre SpaceHub via un SDK modulaire.
- Communautés esthétiques (Nothing OS, Cyberpunk...) aimant les interfaces modernes.

### 🌟 Valeurs Clés

Modularité · Personnalisation · Performance · Extensibilité.

**✅ Statut** : Vision inchangée, toujours valide. Voir section 10 pour son extension naturelle.

---

## 2. Audit du Fork KefinTweaks

*(Inchangé — cf. plan original. L'audit reste la base du refactor et n'a pas besoin d'être refait.)*

**✅ Statut** : Fait. A servi de base à la restructuration `core/` / `ui/` / `integrations/`.

---

## 3. Architecture Cible

```
SpaceHub/
├── core/                          ✅ EXISTANT — implémenté
│   ├── SpaceHub.js                ✅
│   ├── ModuleManager.js           ✅ (gère register/load/unload, dépendances, statuts, cycle de vie)
│   ├── EventBus.js                ✅
│   ├── SettingsManager.js         ✅
│   ├── CacheManager.js            ✅
│   ├── Logger.js                  ✅
│   ├── ApiClient.js               ✅
│   └── SDK.js                     ✅
│
├── ui/                            ✅ EXISTANT — implémenté
│   ├── components/                ✅ (CardBuilder, Modal, SettingsPanel, Toaster)
│   ├── design-system/tokens.css   ✅
│   ├── layouts/                   ✅
│   ├── themes/                    🔶 partiel
│   └── widgets/                   ✅ (ContinueWatching, LatestAdditions, QuickActions)
│
├── jellyfin/                      🔶 dossier créé, contenu à vérifier/compléter
│
├── integrations/                  🔶 EN COURS
│   ├── sonarr/                    ✅ (Api, Service, Widgets)
│   ├── radarr/                    ✅ (Api, Service, Widgets)
│   ├── prowlarr/                  ⬜ non commencé
│   ├── bazarr/                    ⬜ non commencé
│   ├── jellyseerr/                ⬜ non commencé
│   └── qbittorrent/               ⬜ non commencé
│
├── scripts/                       ⚠️ LEGACY — encore présent (migration en cours)
├── spaceHub-injector.js           ⚠️ LEGACY — encore le point d'entrée réel, en parallèle du Core
├── spaceHub-plugin.js             ⚠️ à réduire à un simple bootstrap
│
├── docs/                          🔶 partiel
└── README.md                      ❌ obsolète — à resynchroniser avec l'état réel
```

**⚠️ Point d'attention central (double architecture)** : le Core (`ModuleManager`) et l'ancien `spaceHub-injector.js` fonctionnent aujourd'hui **en parallèle**, chacun avec son propre système de chargement/dépendances. C'était prévu comme état transitoire (section 7), mais aucun critère de sortie n'était formellement écrit. Il est ajouté ci-dessous (section 5, v0.2bis).

---

## 4. Fichiers KefinTweaks : Conserver / Refactoriser / Supprimer

*(Inchangé dans son contenu — cf. plan original section 4.)*

**✅ Statut** : La majorité des fichiers "à conserver" ont été migrés vers leurs destinations `core/`/`ui/`. `configuration.js` (le fichier monolithique de 336 Ko) reste le principal chantier de découpage restant — à vérifier s'il a été scindé dans `SettingsManager.js` ou s'il subsiste tel quel dans `scripts/`.

---

## 5. Roadmap par Version — Statuts mis à jour

| Version | Objectif | Statut réel (17/08/2026) |
|---|---|---|
| **v0.1** | Fork propre — renommage/restructuration | ✅ **Fait** |
| **v0.2** | Core modulaire (`SpaceHub.js`, `ModuleManager`, `EventBus`...) | ✅ **Fait** — Core solide et fonctionnel |
| **v0.2bis** *(🆕 à ajouter)* | Basculer `spaceHub-injector.js` en simple bootstrap de compatibilité, migrer tous les `scripts/` restants vers des modules `ModuleManager` | ⬜ **Non fait — prochaine priorité réelle** |
| **v0.3** | Design System (tokens CSS, composants, thèmes) | 🔶 **Bien avancé** — tokens.css + composants existent, thèmes à finaliser |
| **v0.4** | Dashboard drag & drop (GridStack, widgets) | 🔶 **Partiel** — widgets existent (Continue Watching, Latest Additions, Quick Actions), le drag & drop / GridStack reste à confirmer |
| **v0.5** | Améliorations Jellyfin core | ⬜ **À vérifier** — dossier `jellyfin/` créé mais contenu non confirmé |
| **v0.6** | Intégration Sonarr | ✅ **Fait** |
| **v0.7** | Intégration Radarr | ✅ **Fait** |
| **v0.8** | Intégration Prowlarr | ⬜ **Non fait** |
| **v0.9** | Intégration Bazarr | ⬜ **Non fait** |
| **v0.10** | Intégration Jellyseerr | ⬜ **Non fait** |
| **v0.11** | Intégration qBittorrent | ⬜ **Non fait** |
| **v1.0** | Release stable — Analytics, SDK, notifications | 🔶 **Annoncée par l'auteur comme atteinte**, mais le SDK (`core/SDK.js`) existe, Analytics/notifications à confirmer |

**Lecture honnête de l'avancement** : le projet est objectivement plus avancé que ce que dit le README, mais **v1.0 au sens strict du plan original** (avec Prowlarr/Bazarr/Jellyseerr/qBittorrent + analytics + notifications) n'est pas complète. Ce qui existe correspond plutôt à une **v0.7 solide** avec un Core et un Design System très matures. Ce n'est pas un problème — c'est juste important de le nommer clairement pour prioriser la suite sans se disperser.

---

## 6. Conventions de Code

*(Inchangé — cf. plan original section 6. Toujours en vigueur : namespace `window.SpaceHub`, `ModuleManager.register()`, `EventBus.on/emit`, CSS custom properties `--sh-*`.)*

**✅ Statut** : Conventions respectées dans le code observé (`core/`, `integrations/sonarr`, `integrations/radarr`).

---

## 7. Plan de Migration Concret

| Étape | Objectif | Statut |
|---|---|---|
| 0. Préparation | Nettoyage et renommage | ✅ Fait |
| 1. Core | Architecture modulaire | ✅ Fait |
| 2. Design System | UI moderne | 🔶 Bien avancé |
| 3. Dashboard | Tableau de bord | 🔶 Partiel |
| 4. Jellyfin Core | Expérience Jellyfin améliorée | ⬜ À vérifier |
| 5. Intégrations | Sonarr, Radarr, etc. | 🔶 2/6 faites |
| **6. 🆕 Dé-duplication Core/Injector** | Faire du `ModuleManager` le seul gestionnaire, réduire l'injector à un bootstrap, puis le supprimer | ⬜ **Nouvelle étape à ajouter — priorité immédiate** |

**Critère de sortie proposé pour l'étape 6** : l'étape est terminée quand `spaceHub-injector.js` ne contient plus de logique de dépendances/chargement propre — uniquement un appel à `SpaceHub.core.moduleManager.load()` — et que tous les fichiers `scripts/` ont soit été migrés en modules, soit supprimés.

---

## 8. Exemples de Code Complets

*(Inchangé — cf. plan original section 8 : `SpaceHub.js`, `ModuleManager.js`, `EventBus.js`, `SettingsManager.js`, `CacheManager.js`, `ApiClient.js`, `Dashboard.js`, `LatestAdditionsWidget.js`, `SonarrApi.js`, `SonarrService.js`, `SonarrWidgets.js`.)*

**✅ Statut** : Ces exemples ont visiblement servi de base réelle au code actuel du dépôt (`core/` et `integrations/sonarr/` suivent cette structure).

---

## 9. Notes de Développement

*(Inchangé — cf. plan original section 9 : pas de Flutter, ordre de priorité Core > UI > Dashboard avant intégrations, tests de compatibilité, optimisations perf, outils recommandés.)*

**✅ Statut** : L'ordre de priorité (« ne pas commencer par Sonarr/Radarr avant que le Core soit fini ») a été respecté dans les faits — le Core existait avant que Sonarr/Radarr soient intégrés.

---

## 10. 🆕 Repositionnement Produit : SpaceHub comme Framework UI

**Ce point n'était pas dans le plan de développement original. C'est une décision produit à acter formellement si elle est retenue, pas juste une conséquence automatique du plan technique.**

### Constat

Le plan original parlait d'« intégrer Sonarr, Radarr, Prowlarr... » comme des modules ajoutés à une interface Jellyfin améliorée. Mais avec le Core, le Design System et les premières intégrations construits, SpaceHub a maintenant l'infrastructure pour aller plus loin : **devenir la seule interface que l'utilisateur ouvre**, les outils *arr* devenant des vues internes plutôt que des liens vers des apps externes.

### Proposition de navigation

```
SpaceHub
│
├── 🏠 Home
├── 🔎 Search
├── 📚 Libraries
├── 📥 Downloads
├── 📅 Calendar
│
├── ⚙️ Management
│   ├── Sonarr
│   ├── Radarr
│   ├── Prowlarr
│   ├── Bazarr
│   └── qBittorrent
│
└── 🧩 Extensions
```

L'utilisateur ne pense plus « je vais ouvrir Sonarr », mais « je vais dans SpaceHub → Séries ».

### Pourquoi c'est cohérent avec la vision existante

Le principe directeur du plan original (*« l'utilisateur n'a plus besoin d'ouvrir Sonarr... séparément »*) va déjà dans ce sens. Ce repositionnement est donc **une extension logique**, pas une contradiction. Mais il implique des choix concrets que le plan actuel ne tranche pas :

- Une **shell de navigation globale** (sidebar/topbar) commune à tous les modules — actuellement chaque intégration a ses propres widgets, pas un espace applicatif dédié.
- Un **système de routing interne** à SpaceHub (actuellement absent du Core décrit).
- Une **hiérarchie de permissions/rôles** si `Management` expose des actions sensibles (suppression de séries, gestion qBittorrent) directement dans Jellyfin.

### Recommandation

Ajouter une **v0.5bis "Shell applicative"** dans la roadmap, entre le Dashboard (v0.4) et les intégrations restantes (v0.8+), avec :
1. Un composant de navigation globale (`ui/layouts/AppShell.js`).
2. Un routeur interne léger (`core/Router.js`) — non prévu dans le Core actuel.
3. Une convention pour que chaque intégration expose une "page" complète (pas seulement des widgets de dashboard).

---

## 11. 🆕 Évaluation de Cohérence & Idées de Développement

### Le projet est-il cohérent ?

**Oui.** Trois raisons concrètes :

1. **La théorie et la pratique s'alignent** : le plan disait de ne pas commencer par les intégrations avant que le Core soit stable — c'est exactement ce qui a été fait (Core d'abord, Sonarr/Radarr ensuite).
2. **La séparation en couches est respectée partout où c'est vérifiable** : API → Service → Widget pour chaque intégration, pas de logique métier mélangée au DOM.
3. **La dette technique identifiée (double architecture Core/Injector) est un état transitoire prévu**, pas un accident — à condition de lui donner une date de fin (section 5 et 7 ci-dessus).

### Est-ce un projet intéressant ?

Oui, pour deux raisons qui dépassent le simple « plugin Jellyfin » :

- Le **Core est réutilisable** au-delà de Jellyfin (`ModuleManager` + `EventBus` + `ApiClient` forment un mini-framework front générique).
- La logique **API → Service → Widget** appliquée à Sonarr/Radarr est directement reproductible pour n'importe quel service REST (Prowlarr, Bazarr, Jellyseerr, qBittorrent, mais aussi des services non prévus au départ).

### Idées de développement (features)

**Court terme (complète la roadmap existante)**
- Terminer les intégrations Prowlarr, Bazarr, Jellyseerr, qBittorrent en réutilisant le patron Sonarr/Radarr.
- Calendrier unifié des sorties (séries + films à venir, croisant Sonarr/Radarr/Jellyseerr).
- Vue "Downloads" centralisée (état qBittorrent + queue Sonarr/Radarr dans un seul widget).

**Moyen terme (renforce le Core)**
- `core/Router.js` pour la navigation interne (nécessaire pour la section 10).
- Système de **notifications centralisées** (Discord/Telegram/Push navigateur) déclenchées via `EventBus` — ex: `sonarr:seriesAdded` → notification Discord automatique.
- **Media Health** : détection de fichiers corrompus/mal encodés, croisée avec Radarr/Sonarr pour proposer un re-téléchargement en un clic.
- **Permissions par utilisateur Jellyfin** : un admin voit `Management`, un utilisateur standard voit seulement `Home/Search/Libraries`.

**Plus ambitieux / différenciant**
- **SDK public documenté** (`core/SDK.js` existe déjà) pour que la communauté crée ses propres modules/widgets tiers — un vrai écosystème de plugins pour SpaceHub, à la manière des thèmes Homarr/Homepage.
- **Mode "TV/10-foot UI"** pour la navigation à la télécommande, réutilisant le même Core (mentionné dans le plan original comme piste "React Native TV" — à db en JS/CSS pur plutôt que réécriture).
- **Widget de statistiques façon Tautulli** (temps de visionnage, top utilisateurs, top médias) alimenté par `core/CacheManager` + `ApiClient`.
- **Assistant de setup** : un onboarding qui détecte automatiquement les services *arr* sur le réseau local (scan de ports courants) pour préremplir la config au lieu de saisir les URLs/API keys à la main.

### Prochaine étape concrète recommandée

Avant d'ajouter de nouvelles features : **fermer la v0.2bis (dé-duplication Core/Injector)**. C'est la seule dette qui, si elle traîne, rend tout le reste plus coûteux à construire (chaque nouvelle intégration ajoutée pendant que la double architecture existe encore risque d'être développée deux fois, ou sur la mauvaise base).

---

**Dernière mise à jour** : 2026-08-17
**Prochaine étape** : v0.2bis — migration complète de `spaceHub-injector.js` vers `ModuleManager`.
**Statut global** : 🟢 Projet cohérent, en avance sur son README, avec une dette technique identifiée et gérable.
