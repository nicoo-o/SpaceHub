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

## Écosystème plugins et métadonnées (v2)

SpaceHub distingue désormais trois niveaux :

1. **Plugins Jellyfin serveur** : exécutés par Jellyfin, lus via `JellyfinPluginService` et contrôlés par les permissions Jellyfin. Leur présence dans `/Plugins` ne prouve pas qu'ils sont actifs ; l'état est `unknown` lorsqu'il n'est pas fourni par le serveur.
2. **Modules natifs SpaceHub** : intégrations Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr et qBittorrent, gérées par `ModuleManager`.
3. **Plugins SDK SpaceHub** : extensions client validées par `PluginManager`, avec manifest, permissions, contributions, stockage isolé, santé et nettoyage du cycle de vie.

`OnboardingWizard` fournit des parcours utilisateur et administrateur persistés par serveur et compte, avec un scope TV dédié et relance depuis les réglages.

`MetadataService` fusionne les données selon une politique par bibliothèque et conserve la provenance de chaque champ. Jellyfin reste la source serveur ; les fournisseurs externes doivent être enregistrés explicitement et leurs valeurs ne sont jamais écrites dans Jellyfin automatiquement.

`PluginCatalog` impose, pour les plugins distants, une source HTTPS, un manifest, une intégrité SHA-256, une signature ECDSA P-256 et une approbation administrateur. Il charge l'URL configurée au démarrage, propose installation/mise à jour/désinstallation/rollback, conserve les packages vérifiés dans le cache et refuse toute divergence de permissions entre catalogue et package. Le catalogue remet le code à un loader explicite ; il n'utilise pas `eval` ni `new Function`. En l'absence d'un bridge serveur SpaceHub, les approbations et préférences restent locales à l'appareil.

### Permissions SDK

Les permissions sont refusées par défaut. Les permissions d'administration (`server.plugins.*`, `server.system.control`, écriture de métadonnées) exigent un compte administrateur Jellyfin. Le contexte plugin ne contient pas le token et n'expose que des façades contrôlées.

## Conventions CSS

- Variables : `--sh-color-primary`, `--sh-spacing-md`
- Classes : `.sh-button`, `.sh-button--primary` (BEM-like)
- Mobile-first : `@media (min-width: 768px)`

## Modes d'utilisation

SpaceHub supporte deux modes de déploiement :

### Mode A — Injection Jellyfin (production)
Le plugin est injecté dans Jellyfin Web via le plugin "JavaScript Injector".
Ordre de chargement :
1. `spaceHub-default-config.js`
2. `spaceHub.minimal.js` (config utilisateur)
3. `spaceHub-plugin.js` (installation/mise à jour)
4. `spaceHub-injector.js` (chargement de tous les modules)

### Mode B — SPA Standalone (développement Vite)
Lance `npm run dev` et accède à `http://localhost:5173`.
Le point d'entrée est `index.html` → `core/SpaceHub.js`.

## Utilitaires partagés

- `core/utils/domUtils.js` : `escapeHtml()`, `createElement()`, `injectStyles()`, `waitForElement()`

## Correction des vulnérabilités connues

- Toujours utiliser `escapeHtml()` avant `innerHTML` avec des données provenant d'une API
- Le token Jellyfin est géré par `auth/AuthManager.js` — ne pas le lire depuis `localStorage` directement
- Les clés API des intégrations sont dans `SettingsManager` — utiliser `settings.get('sonarr.apiKey')`
- Un plugin SDK doit déclarer ses permissions, dépendances et contributions dans son manifest
- Les plugins distants doivent être signés et approuvés avant téléchargement/exécution
- Utiliser `SpaceHub.jellyfin.plugins` pour les plugins serveur et `SpaceHub.metadata` pour la provenance des métadonnées
