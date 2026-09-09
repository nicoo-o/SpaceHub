# Guide de contribution — SpaceHub

> **Ce document fait foi** pour contribuer au code. Pour l'état général du
> projet, c'est `docs/PROJECT_STATUS.md`. Les fichiers `AUDIT_*.md` et
> `PLAN_*.md` à la racine sont des archives datées.

## Architecture

SpaceHub est une application web autonome pour Jellyfin : son propre écran de
connexion, son propre lecteur, sa propre navigation — le serveur n'est jamais
modifié, l'application parle à son API REST. JavaScript sans framework,
compilé par Vite pour un plancher de compatibilité **Chromium 69**
(téléviseurs de 2020), distribué en PWA (`manifest.webmanifest` +
`sh-offline-sw.js`).

```
core/          → Moteur applicatif ESM (Logger, EventBus, SettingsManager, Router,
                 SpatialNavigation, PluginManager, SDK…)
ui/            → Interface (components/, views/, layouts/, themes/, design-system/)
jellyfin/      → Intégration Jellyfin (api/, auth/, player/, search/, calendar/,
                 musique/, temps-reel/, offline/, remote/…)
integrations/  → Services tiers, un dossier par service
                 (sonarr, radarr, prowlarr, bazarr, jellyseerr, qbittorrent)
plugins/       → Greffons livrés en exemple (ratings, paroles, exemple)
scripts/       → OUTILLAGE DE CONTRÔLE QUALITÉ uniquement (aucun code applicatif)
tests/         → Suites unitaires Vitest (34 fichiers, 561 tests)
```

L'ancienne architecture « par injection dans Jellyfin Web » (`scripts/*.js`
legacy, `spaceHub-injector.js`, `skins/`) a été supprimée ; toute documentation
qui la mentionne comme active est périmée.

## La règle des monolithes

**Les sept plus gros fichiers ne grandissent plus.** Leurs budgets sont figés
dans `scripts/taille-monolithes-check.mjs` et vérifiés par `npm run
test:taille`, inclus dans la chaîne `npm run test` — un CI vert prouve que la
règle est respectée :

| Fichier | Budget (lignes) |
|---|---:|
| `jellyfin/player/VideoPlayer.js` | 2578 |
| `core/SpatialNavigation.js` | 1750 |
| `ui/components/SettingsPanel.js` | 1624 |
| `ui/components/CardBuilder.js` | 1403 |
| `jellyfin/search/UnifiedSearch.js` | 1366 |
| `ui/components/ModalSlideUpSheet.js` | 1350 |
| `jellyfin/api/JellyfinAPI.js` | 1291 |

Tout autre fichier applicatif passe sous un plafond par défaut de **1200
lignes** : un nouveau module ne naît pas monolithe.

**Ce que cela implique en pratique :** une nouvelle fonctionnalité s'écrit
dans un **nouveau module**, branché au point d'entrée existant — c'est la
manière dont les dernières vagues ont procédé (`BadgesQualite`,
`MinuteurSommeil`, `ApparenceSousTitres`, `HorlogeServeur` sont nés à côté du
lecteur, pas dedans). Si un fichier figé doit malgré tout grossir, relever son
budget est une décision explicite : elle se fait dans un commit qui le
justifie, jamais au fil de l'eau. Découper un monolithe existant est
toujours bienvenu — le budget se baisse alors dans le même commit.

## Pattern intégration

Chaque intégration (Sonarr, Radarr, etc.) suit ce pattern :

- `*Api.js` → client HTTP bas niveau (authentification, routes)
- `*Service.js` → logique métier + cache + EventBus
- `*Widgets.js` → composants UI

Aucune logique métier dans le DOM, aucune manipulation du DOM dans un service.

## Conventions

- ESM natif (`import`/`export`) partout dans le code applicatif
- CSS custom properties préfixées `--sh-*`, extraites des fichiers JS
  (une feuille par composant, à côté de celui-ci)
- Nommage BEM-like : `.sh-composant__element--modifieur`
- EventBus pour la communication inter-modules (éviter le couplage direct)
- Le nommage des modules récents suit le français (`MinuteurSommeil`,
  `HorlogeServeur`) ; ne pas mélanger les langues dans un même domaine

## La chaîne de vérification

`npm run verify` est la porte de fusion : elle exécute la chaîne complète
(`npm run test`), la construction, le contrat de poids et l'e2e. La CI
GitHub Actions (`.github/workflows/ci.yml`) la fait tourner à chaque push et
pull request — elle ne doit jamais être rouge sur `main`.

| Contrôle | Ce qu'il prouve |
|---|---|
| `npm run lint` | Syntaxe valide sur tous les fichiers |
| `npm run test:unit` | 561 tests unitaires Vitest (34 suites) |
| `npm run test:smoke` | Démarrage complet de l'application hors navigateur |
| `npm run test:nav` | Contrats de navigation (sélecteurs, scopes, comportement) |
| `npm run test:input` | Pipeline d'entrée : un seul routeur, ordre écrit |
| `npm run test:focus` | Conteneurs focalisables déclarés et cohérents |
| `npm run test:fantomes` | Aucune « méthode fantôme » (appel sans définition) |
| `npm run test:gabarits` | Identifiants d'interpolation des gabarits |
| `npm run test:css` | Hygiène CSS (feuilles, jeux d'images-clés) |
| `npm run test:xss` | Toute interpolation HTML passe par l'échappement |
| `npm run test:globals` | Plafond d'accès globaux (20) |
| `npm run test:contraste` | Contraste des thèmes clair et foncé |
| `npm run test:taille` | Règle des monolithes (voir plus haut) |
| `npm run test:changelog` | Convention du changelog (voir plus bas) |
| `npm run build` + `test:poids` | Build de production sous les plafonds de poids |
| `npm run test:e2e` | 26 scénarios dans un vrai Chromium |

## Développement local

```bash
npm ci           # installer exactement ce que le lockfile décrit
npm run dev      # serveur Vite sur http://localhost:3000
npm run verify   # la porte de fusion complète, avant chaque merge
```

Pour tester l'e2e sur une machine sans Chrome : `npx playwright@1.62.1
install chromium`, puis `export SPACEHUB_CHROMIUM=$(find
~/.cache/ms-playwright -type f -name chrome -path '*chrome-linux*' | head -1)`.

## Sécurité

- Ne jamais logger de tokens, mots de passe ou clés API en console
- Utiliser `escapeHtml()` avant tout `innerHTML` avec des données externes —
  les exceptions documentées vivent dans `docs/XSS_EXCEPTIONS.md`
- Valider les URLs externes avant tout `fetch()` avec `new URL()`
- Le jeton d'authentification vit en mémoire + `sessionStorage`, jamais dans
  `localStorage` (`tests/StockageDuJeton.test.js` le vérifie)
- Ne jamais hardcoder d'identifiants, user IDs ou clés dans le code source

## Greffons et SDK

Pour écrire un greffon, lire `docs/ECRIRE_UN_GREFFON.md` et partir de
`plugins/exemple/`. Rappels non négociables : tout passe par le contexte
`ctx` remis par le SDK — pas de `window.SpaceHub`, pas de `fetch` global ;
les permissions sont refusées par défaut.

## Changelog

Les notes de release s'écrivent dans `CHANGELOG.md`, au format
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) — en **anglais**,
comme le README : elles deviennent telles quelles le corps de la release
GitHub. Elles décrivent le POURQUOI pour celui qui télécharge, pas une liste
de messages de commit.

```markdown
## [Unreleased]

### Added
- Ce qui n'existait pas. Une puce par changement qui compte pour l'utilisateur.

### Changed
- Ce qui existait et se comporte autrement.

### Fixed
- Ce qui était cassé et ne l'est plus.

## [1.2.3] - 2026-09-09

Une phrase d'introduction, si la version le mérite.

### Added
- …
```

Les règles, vérifiées par `npm run test:changelog` (donc par la CI) :

1. **Tout changement visible s'écrit d'abord dans `## [Unreleased]`** — au
   moment du commit qui le réalise, pas la veille de la release.
2. **Une version se publie en renommant et en datant** : `## [Unreleased]`
   devient `## [1.2.3] - AAAA-MM-JJ`, une section `Unreleased` vide repart.
3. **Pas de section, pas de release.** Pousser un tag sans sa section échoue
   (`scripts/notes-release.mjs`) — le workflow refuse de publier des notes
   générées automatiquement à la place.
4. Catégories réservées : `Added`, `Changed`, `Fixed`, `Deprecated`,
   `Removed`, `Security`.
5. **Une PR qui touche le code applicatif touche `CHANGELOG.md`** — vérifié
   par le job « Rappel changelog » de la CI (`scripts/changelog-pr-check.mjs`,
   aucune dépendance). Le code applicatif y a la même définition que le
   contrat de taille (`core/`, `ui/`, `jellyfin/`, `integrations/`,
   `plugins/`). Deux issues honnêtes :
   - écrire la puce sous `[Unreleased]` (le cas normal), ou
   - poser le label **`no-changelog`** quand le changement n'appelle pas de
     puce : refactor interne, outillage CI, docs. La décision reste tracée
     sur la PR — c'est le seul « tampon » demandé.

Concrètement : un commit qui ajoute une fonctionnalité visible modifie le
code **et** ajoute sa puce sous `[Unreleased]` dans le même commit. Le
rappel de CI est là pour l'oubli, pas pour la pédagogie : il a déjà eu lieu
(la puce Dependabot est arrivée deux commits plus tard).

## Publication

Les releases sont automatiques : pousser un tag `v*` déclenche
`.github/workflows/release.yml`, qui fait tourner la même chaîne de
vérification, **extrait la section du tag depuis `CHANGELOG.md`** (échec si
absente ou vide), puis joint `dist/` en archive à la release GitHub. Voir
`docs/DEPLOIEMENT.md` pour servir l'archive derrière nginx ou Caddy.
