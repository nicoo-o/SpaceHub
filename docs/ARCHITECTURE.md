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
        InputMapper            (touche → action)
              │
              ▼
     SpatialNavigation         (scope courant, géométrie, focus)
              │
   ┌──────────┴──────────┐
   ▼                     ▼
pile de couches      CarouselController
(quelle couche         (défilement
 est au-dessus)         horizontal)
```

La **pile de couches** enregistre l'ordre d'ouverture réel. « Retour » ferme
donc celle du dessus, et non la première d'une liste figée — un ordre déclaré
faisait fermer les réglages situés *sous* la recherche.

`DomContracts.js` déclare les sélecteurs ; `npm run test:nav` vérifie que chacun
est réellement **émis** par l'application. C'est ce contrôle qui empêche la
dérive entre le DOM et le moteur, à l'origine de la quasi-totalité des bugs de
navigation rencontrés.

### Limite connue

Treize écouteurs `keydown` subsistent hors du moteur (Router, Modal, lecteur,
recherche…), dont six traitent Échap. La pile de couches rend le comportement
correct aujourd'hui, et un scénario E2E le vérifie dans les deux ordres
d'ouverture. Mais une entrée unique passant par `InputMapper` reste la bonne
cible à terme.

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
| `test:smoke` | Les services s'instancient. |
| `test:nav` | Les sélecteurs déclarés sont réellement émis. |
| `test:css` | Aucun CSS en JS, aucune feuille orpheline, plafond de flou tenu. |
| `test:xss` | Aucune donnée serveur non échappée hors des cas documentés. |
| `test:globals` | Le nombre d'accès directs à `window.SpaceHub` ne remonte pas. |
| `test:e2e` | Dix comportements vérifiés dans un vrai navigateur. |

Les six premières lisent le code ; seule la dernière l'exécute. C'est la
distinction qui compte : `lint` et `smoke` ne pouvaient structurellement pas
détecter un sélecteur ne correspondant à rien, c'est-à-dire la totalité des bugs
de navigation trouvés en test réel.
