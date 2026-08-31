# Guide de Contribution — SpaceHub

## Architecture

SpaceHub est organisé en couches strictes :

```
core/          → Moteur applicatif ESM (Logger, EventBus, SettingsManager, etc.)
ui/            → Interface utilisateur (composants, vues, widgets, thèmes)
jellyfin/      → Intégration Jellyfin (API, auth, player, search, calendar)
integrations/  → Services tiers (Sonarr, Radarr, Bazarr, Prowlarr, Jellyseerr, qBit)
scripts/       → Modules legacy IIFE (en cours de migration vers core/)
skins/         → Correctifs CSS pour thèmes Jellyfin tiers
```

## Ordre de chargement (mode injection Jellyfin)

Le bon ordre de chargement est :
1. `spaceHub-default-config.js` → expose `window.SpaceHubDefaultConfig`
2. `spaceHub.minimal.js` → expose `window.SpaceHubConfig` (surcharge les defaults)
3. `spaceHub-plugin.js` → détecte le plugin Jellyfin, installe l'injector
4. `spaceHub-injector.js` → charge tous les modules depuis le CDN

## Pattern intégration

Chaque intégration (Sonarr, Radarr, etc.) suit ce pattern :
- `*Api.js` → Client HTTP bas niveau (hérite de `BaseApiClient`)
- `*Service.js` → Logique métier + cache + EventBus
- `*Widgets.js` → Composants UI

## Conventions

- ESM natif (`import`/`export`) dans `core/`, `ui/`, `jellyfin/`, `integrations/`
- IIFE + `'use strict'` dans `scripts/` (legacy)
- CSS custom properties préfixées `--sh-*`
- Nommage BEM-like : `.sh-composant__element--modifieur`
- EventBus pour la communication inter-modules (éviter le couplage direct)

## Sécurité

- Ne jamais logger de tokens, mots de passe ou clés API en console
- Utiliser `escapeHtml()` de `core/utils/domUtils.js` avant tout `innerHTML` avec données utilisateur
- Valider les URLs externes avant tout `fetch()` avec `new URL()`
- Ne jamais hardcoder d'identifiants, user IDs ou clés dans le code source

## Développement local

```bash
npm install
npm run dev    # Lance le serveur Vite sur http://localhost:5173
npm run build  # Build de production dans dist/
```
