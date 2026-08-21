# SpaceHub — Architecture

## Vue d'ensemble

SpaceHub est un plugin JavaScript/CSS injecté dans Jellyfin Web. Il utilise une architecture modulaire où chaque fonctionnalité est un module indépendant.

## Stack Technique

- **Frontend** : JavaScript (ES2020+), CSS Custom Properties
- **Injection** : Plugin "JavaScript Injector" pour Jellyfin
- **Cache** : IndexedDB (persistant) + localStorage (rapide)
- **Layout** : GridStack (dashboard drag & drop)
- **Icônes** : Font Awesome
- **Graphiques** : Chart.js (v1.0)

## Arborescence

```
SpaceHub/
├── core/                    # Socle technique
│   ├── SpaceHub.js          # Namespace global + point d'entrée
│   ├── ModuleManager.js     # Chargement/déchargement des modules (v0.2)
│   ├── EventBus.js          # Pub/Sub entre modules (v0.2)
│   ├── SettingsManager.js   # Configuration persistante (v0.2)
│   ├── CacheManager.js      # Cache IndexedDB + localStorage (v0.2)
│   └── ApiClient.js         # Client HTTP générique (v0.2)
│
├── ui/                      # Interface Utilisateur
│   ├── components/          # Composants réutilisables (v0.3)
│   │   ├── CardBuilder.js
│   │   ├── Modal.js
│   │   └── Toaster.js
│   ├── layouts/             # Dispositions (v0.3)
│   │   └── Dashboard.js
│   ├── themes/              # Thèmes CSS (v0.3)
│   │   ├── ThemeManager.js
│   │   └── presets/
│   └── widgets/             # Widgets dashboard (v0.4)
│       ├── LatestAdditions.js
│       └── UpcomingEpisodes.js
│
├── integrations/            # Intégrations externes (v0.6+)
│   ├── sonarr/
│   ├── radarr/
│   ├── prowlarr/
│   ├── bazarr/
│   ├── jellyseerr/
│   └── qbittorrent/
│
├── jellyfin/                # Améliorations Jellyfin (v0.5)
│   ├── api/
│   ├── search/
│   └── collections/
│
├── scripts/                 # Scripts hérités KefinTweaks (migration en cours)
├── skins/                   # Thèmes CSS prêts à l'emploi
└── docs/                    # Documentation
```

## Namespace Global

```javascript
window.SpaceHub = {
    version: '0.x.x',
    core: { moduleManager, eventBus, settings, cache, api },
    ui: { dashboard, themes, components },
    jellyfin: { api, search, collections },
    integrations: { sonarr, radarr, prowlarr, bazarr, jellyseerr, qbittorrent }
};
```

## Conventions CSS

- Variables : `--sh-color-primary`, `--sh-spacing-md`
- Classes : `.sh-button`, `.sh-button--primary` (BEM-like)
- Mobile-first : `@media (min-width: 768px)`
