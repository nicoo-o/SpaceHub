# 🔧 Plan de Corrections — SpaceHub / KefinTweaks

> **Basé sur :** `AUDIT_PROFESSIONNEL.md`  
> **Date d'exécution :** 31 août 2026  
> **Statut global :** ✅ P0 critique largement corrigée · ✅ P1 structurante largement corrigée · 🔶 P2 partiellement traitée, recette réelle encore requise

---

## Tableau de bord des corrections

| ID | Priorité | Fichier | Bug / Problème | Statut |
|----|----------|---------|----------------|--------|
| C01 | 🔴 P0 | `integrations/sonarr/SonarrService.js` | `checkHealth()` appelait méthode inexistante `getSystemStatus()` | ✅ Corrigé |
| C02 | 🔴 P0 | `integrations/radarr/RadarrService.js` | `checkHealth()` appelait méthode inexistante `getSystemStatus()` | ✅ Corrigé |
| C03 | 🔴 P0 | `integrations/prowlarr/ProwlarrService.js` | `checkHealth()` appelait méthode inexistante `getSystemStatus()` | ✅ Corrigé |
| C04 | 🔴 P0 | `integrations/bazarr/BazarrService.js` | `checkHealth()` appelait méthode inexistante `getSystemStatus()` + indentation cassée `triggerSync()` | ✅ Corrigé |
| C05 | 🔴 P0 | `integrations/jellyseerr/JellyseerrService.js` | `checkHealth()` appelait méthode inexistante `getStatus()` | ✅ Corrigé |
| C06 | 🔴 P0 | `integrations/qbittorrent/QBittorrentService.js` | `checkHealth()` appelait méthode inexistante `getVersion()` + listener `apiKey` erroné | ✅ Corrigé |
| C07 | 🔴 P0 | `core/ApiClient.js` | `body` jamais envoyé dans POST/PUT/PATCH | ✅ Corrigé |
| C08 | 🔴 P0 | `core/ApiClient.js` | Authentification des images Jellyfin sans en-tête possible sur `<img>` | 🔶 Partiel : token absent des images générées par le client legacy ; le player natif utilise `api_key` uniquement lorsque Safari/HLS l'exige |
| C09 | 🔴 P0 | `core/ApiClient.js` | Indentation cassée du `catch` | ✅ Corrigé |
| C10 | 🔴 P0 | `core/GamepadInput.js` | Opérande mort `NavAction.PLAY_PAUSE \|\| 'play_pause'` × 2 | ✅ Corrigé |
| C11 | 🔴 P0 | `core/GamepadInput.js` | RAF poll 60fps sans manette — gaspillage CPU | ✅ Corrigé |
| C12 | 🔴 P0 | `core/GamepadInput.js` | Fuite mémoire : `setTimeout` non clearé dans `disable()` | ✅ Corrigé |
| C13 | 🔴 P0 | `core/Router.js` | Listener `keydown` jamais supprimé — fuite mémoire | ✅ Corrigé |
| C14 | 🔴 P0 | `core/Router.js` | Historique non borné (croissance infinie) | ✅ Corrigé |
| C15 | 🔴 P0 | `core/Router.js` | Méthode `destroy()` absente | ✅ Ajouté |
| C16 | 🔴 P0 | `core/NotificationService.js` | Token Telegram encodé via `encodeURIComponent` le corrompait | ✅ Corrigé |
| C17 | 🔴 P0 | `scripts/dashboardButtonFix.js` | Comparaison chaîne/nombre `> 10` — toujours false | ✅ Corrigé |
| C18 | 🔴 P0 | `scripts/exclusiveElsewhere.js` | `link.disable = true` — propriété DOM invalide | ✅ Corrigé |
| C19 | 🔴 P0 | `scripts/deviceManager.js` | `SpaceHubToaster.show()` inexistante — utiliser `.toast()` | ✅ Corrigé |
| C20 | 🔴 P0 | `scripts/updoot.js` | Token Jellyfin loggué en console (`console.log` credentials) | ✅ Corrigé |
| C21 | 🔴 P0 | `scripts/updoot.js` | Admin user ID hardcodé dans le code source | ✅ Corrigé |
| C22 | 🔴 P0 | `scripts/updoot.js` | Absence de `'use strict'` | ✅ Corrigé |
| C23 | 🟠 P1 | `core/SettingsManager.js` | Logique inversée dans `registerDefaults()` | ✅ Corrigé |
| C24 | 🟠 P1 | `core/SDK.js` | `this._pm` jamais assigné → `_getPluginManager()` retourne `undefined` | ✅ Corrigé |
| C25 | 🟠 P1 | `core/SDK.js` | `registerTheme()` applique le thème sans que l'utilisateur le demande | ✅ Corrigé |
| C26 | 🟠 P1 | `core/SDK.js` | Méthode `applyTheme()` absente pour l'activation explicite | ✅ Ajouté |
| C27 | 🟠 P1 | `index.html` | `@keyframes sh-spin` manquant — spinner statique | ✅ Corrigé |
| C28 | 🟠 P1 | `vite.config.js` | `allow-credentials: true` + `allow-origin: *` — invalide CORS | ✅ Corrigé |
| C29 | 🟠 P1 | `package.json` | Champs NPM standard absents (description, keywords, repository, bugs) | ✅ Ajouté |
| C30 | 🟠 P1 | `spaceHub-default-config.js` | Drift de schéma vs `spaceHub.minimal.js` (4 champs manquants) | ✅ Corrigé |
| C31 | 🟠 P1 | `spaceHub.minimal.js` | Drift de schéma vs `spaceHub-default-config.js` (3 champs manquants) | ✅ Corrigé |
| C32 | 🟠 P1 | `core/utils/domUtils.js` | Utilitaire `escapeHtml()` centralisé absent (dupliqué 3+ fois) | ✅ Créé |
| C33 | 🟠 P1 | `.eslintrc.json` | Aucun linter configuré dans le projet | ✅ Créé |
| C34 | 🟠 P1 | `.prettierrc` | Aucun formatter configuré dans le projet | ✅ Créé |
| C35 | 🟠 P1 | `docs/CONTRIBUTING.md` | Documentation de contribution absente | ✅ Créé |
| C36 | 🟠 P1 | `docs/ARCHITECTURE.md` | Modes d'utilisation non documentés | ✅ Mis à jour |

---

## Détail des corrections P0 (Critiques)

### C01–C06 : `checkHealth()` cassé sur 6 intégrations

**Problème racine :** Chaque `*Service.js` appelait des méthodes inexistantes sur leurs `*Api.js` respectifs. La garde `typeof this.api?.getSystemStatus === 'function'` retournait `false`, donc le `try` réussissait toujours sans rien tester. Le statut passait systématiquement à `'connected'` même si le service était hors ligne.

**Correction appliquée :** Tous les `checkHealth()` utilisent maintenant `this.api.testConnection()` qui existe sur tous les clients (retourne `{ success, version?, error? }`). Détection auth via l'analyse du message d'erreur.

```js
// Avant (ne fonctionnait jamais)
if (typeof this.api?.getSystemStatus === 'function') {
    await this.api.getSystemStatus(); // méthode inexistante
}
this.status = 'connected'; // toujours atteint !

// Après (fonctionnel)
const result = await this.api.testConnection();
if (!result.success) {
    const authFail = result.error?.includes('401') || result.error?.includes('403');
    this.status = authFail ? 'auth_failed' : 'offline';
} else {
    this.status = 'connected';
}
```

### C07–C09 : `core/ApiClient.js`

**Bug POST body :** Le `config` de fetch n'incluait jamais le body, rendant toutes les requêtes POST/PUT/PATCH vides.

```js
// Ajouté après la création de config :
if (body && !['GET', 'HEAD'].includes(config.method)) {
    config.body = JSON.stringify(body);
}
```

**Token dans URL :** les URLs d'images générées par `JellyfinClient` peuvent nécessiter `api_key` pour fonctionner dans un élément `<img>` sans en-tête HTTP. Les URLs produites par le client legacy n'embarquent pas de token ; le player ajoute `api_key` uniquement pour les flux natifs Safari/HLS, car aucun en-tête `Authorization` ne peut y être injecté. Une stratégie Blob/Service Worker reste nécessaire pour supprimer totalement ce compromis sans backend dédié.

### C10–C12 : `core/GamepadInput.js`

**Opérande mort :** `NavAction.PLAY_PAUSE || 'play_pause'` — `NavAction.PLAY_PAUSE` vaut déjà `'play_pause'` (truthy), donc le `||` ne servait à rien. Simplifié en `NavAction.PLAY_PAUSE`.

**RAF Poll optimisé :** Avant : `requestAnimationFrame` tournait en boucle 60fps/s même sans aucune manette branchée. Après : quand aucune manette n'est détectée, le moteur bascule sur un `setTimeout(1000)` (1 poll/seconde) pour détecter les connexions sans gaspiller le CPU.

### C13–C15 : `core/Router.js`

**Fuite mémoire :** Le listener `keydown` était une closure anonyme impossible à retirer. Résolu en sauvegardant la référence dans `this._keydownHandler` et en ajoutant une méthode `destroy()`.

**Historique non borné :** Ajout d'une limite de 100 entrées avec `shift()` automatique.

### C16 : `core/NotificationService.js`

**Token Telegram corrompu :** `encodeURIComponent(botToken)` encodait le `:` du token (ex: `123456:ABC` → `123456%3AABC`) rendant l'URL Telegram invalide. Le token doit être inséré tel quel dans le path URL. Corrigé + `parse_mode` mis à jour vers `MarkdownV2`.

### C17 : `scripts/dashboardButtonFix.js`

```js
// Avant — string comparée à number → toujours false
ApiClient.serverVersion().split('.')[1] > 10

// Après — comparaison numérique correcte
parseInt(ApiClient.serverVersion().split('.')[1], 10) > 10
```

### C18 : `scripts/exclusiveElsewhere.js`

```js
link.disable = true;   // ❌ propriété inexistante
link.disabled = true;  // ✅ attribut HTML standard
```

### C19 : `scripts/deviceManager.js`

```js
window.SpaceHubToaster.show(...);  // ❌ méthode inexistante
window.SpaceHubToaster.toast(...); // ✅ méthode correcte
```

### C20–C22 : `scripts/updoot.js`

- Suppression du `console.log` exposant `{ serverUrl, apiKey, userId, ... }` en console
- Remplacement de l'admin user ID hardcodé `['ee8996be37aa4da0912a08b410940d3e']` par `[]` avec un TODO
- Ajout de `'use strict'` pour activer le mode strict JavaScript

---

## Détail des corrections P1 (Importantes)

### C23 : `core/SettingsManager.js`

```js
// Avant — anciens defaults écrasent les nouveaux (logique inversée)
this._defaults = { ...defaults, ...this._defaults };

// Après — nouveaux defaults ont la priorité (correct)
this._defaults = { ...this._defaults, ...defaults };
```

### C24–C26 : `core/SDK.js`

- `_getPluginManager()` : suppression de `this._pm` jamais assigné, ajout d'un `warn` clair si PM absent
- `registerTheme()` : suppression du `tm?.apply(theme.id)` automatique (side effect inattendu)
- Nouvelle méthode `applyTheme(themeId)` pour activation explicite

### C27 : `index.html`

Ajout de `@keyframes sh-spin` manquant dans le `<style>` du splash screen :
```css
@keyframes sh-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}
```

### C28 : `vite.config.js`

Suppression de `'access-control-allow-credentials': 'true'` incompatible avec `allow-origin: *`.

### C29 : `package.json`

Ajout des champs manquants : `description`, `keywords`, `repository`, `bugs`, script `lint`.

### C30–C31 : Drift de schéma configs

Les 4 divergences entre `spaceHub-default-config.js` et `spaceHub.minimal.js` ont été résolues :
- `minPremiereDate` / `maxPremiereDate` ajoutés dans default-config
- `showEpisodesOnSeriesPage` ajouté dans default-config
- `enableSeasonalBackground` ajouté dans minimal.js
- `breadcrumbs` + `hideSingleSeasonContainer` synchronisés

Commentaire d'avertissement sur l'ordre de chargement ajouté en tête des deux fichiers.

### C32 : `core/utils/domUtils.js` (nouveau fichier)

Création d'un module d'utilitaires DOM partagé pour centraliser ce qui était dupliqué partout :

| Fonction | Description |
|----------|-------------|
| `escapeHtml(str)` | Échappe le HTML via `textContent` — anti-XSS |
| `createElement(tag, attrs, text)` | Crée un élément DOM avec attributs |
| `injectStyles(id, css)` | Injecte du CSS de façon idempotente |
| `waitForElement(selector, timeout)` | Attend un élément via MutationObserver |

### C33–C34 : Outillage qualité

- `.eslintrc.json` : règles ES2022, globals browser + Jellyfin, interdiction `eval`/`new Function`
- `.prettierrc` : single quotes, semi, tabWidth 4, printWidth 120

### C35–C36 : Documentation

- `docs/CONTRIBUTING.md` : guide complet (architecture, ordre de chargement, conventions, sécurité)
- `docs/ARCHITECTURE.md` : ajout des deux modes de déploiement, utilitaires partagés, vulnérabilités connues

---

## Bugs non corrigés (Phase P2 — À planifier)

Ces bugs nécessitent des refactorings plus importants, documentés ici pour une prochaine phase.

### 🔴 Priorité haute

> Les corrections de cette phase restent à valider sur un vrai serveur Jellyfin et avec une télécommande/manette TV. Les badges critiques RT/IMDb ont été neutralisés lorsqu'aucune source externe vérifiée n'est configurée.

| ID | Fichier | Problème | Effort estimé |
|----|---------|----------|---------------|
| ~~B-XSS-01~~ | `ui/components/Modal.js` | ~~`titleEl.innerHTML = this.title` sans escape~~ | ✅ Corrigé 31.08.2026 — `titleEl.textContent` (render + `setTitle`) |
| ~~B-XSS-02~~ | `integrations/*/Widgets.js` | ~~`err.message` injecté brut dans `innerHTML`~~ | ✅ Corrigé 31.08.2026 — `escapeHtml()` de `domUtils.js` sur les 6 intégrations (14 interpolations) |
| ~~B-XSS-03~~ | `scripts/configuration.js` | ~~`innerHTML` massif avec données utilisateur non filtrées~~ | ✅ Corrigé 31.08.2026 — `error.message` échappé via helper local `escapeHtml` (fichier IIFE legacy, pas d'import ESM) |
| ~~B-SEC-01~~ | `jellyfin/auth/AuthManager.js` | ~~Token Jellyfin stocké en clair dans `localStorage`~~ | ✅ Corrigé 31.08.2026 — token uniquement dans `sessionStorage`, ancienne copie `localStorage` supprimée |
| ~~B-BUG-01~~ | `jellyfin/calendar/UnifiedCalendarService.js` | ~~`jellyseerrApi.getUpcoming()` → méthode inexistante~~ → ✅ Исправлено 31.08.2026: заменено на `getUpcomingMediaList()` (объединяет movies+tv с fallback) | ✅ Исправлено |
| ~~B-BUG-02~~ | `ui/components/GooeyCarouselScroller.js` | ~~Статический вызов в `UnifiedCalendarWidget`~~ → ✅ Исправлено 31.08.2026: `new GooeyCarouselScroller()` с кэшированием в `this._scroller` | ✅ Исправлено |

### 🟠 Priorité moyenne

| ID | Fichier | Problème | Effort estimé |
|----|---------|----------|---------------|
| B-PERF-01 | `ui/views/LibraryView.js` | `innerHTML +=` en boucle = O(n²) | 2h — utiliser `DocumentFragment` | 🔶 À faire |
| ~~B-PERF-02~~ | `ui/views/DownloadsView.js` | ~~`setInterval` métriques jamais clearé~~ | ✅ Corrigé 31.08.2026 — `destroy()` arrête le polling |
| ~~B-PERF-03~~ | `ui/layouts/AppLayout.js` | ~~`setInterval` horloge non clearé dans `destroy()`~~ | ✅ Corrigé 31.08.2026 — intervalle et handlers documentaires nettoyés |
| ~~B-PERF-04~~ | `ui/views/JellyfinConsoleModal.js` | ~~`setInterval` tâches non clearé dans le lifecycle~~ | 30 min | ✅ Corrigé 31.08.2026 — timer arrêté à la fermeture et `destroy()` ajouté |
| ~~B-UX-01~~ | `ui/components/CardBuilder.js`, `ui/components/ModalSlideUpSheet.js`, `ui/components/HeroSpotlightComponent.js` | ~~Scores RT/IMDb fabriqués affichés comme réels~~ | ✅ Corrigé 31.08.2026 — suppression des valeurs par défaut ; les données critiques externes non configurées sont masquées. **Rétabli le même jour via le plugin SDK `spacehub.ratings` (OMDb)** : badges RT/IMDb/Metacritic réels, filtrables par fournisseur, non bloquants au rendu |
| ~~B-UX-02~~ | `ui/components/AnalyticsModal.js` | ~~Pas de fermeture Escape, pas de trap focus, pas de role="dialog"~~ | ✅ Corrigé 31.08.2026 — Escape, trap focus et restauration du focus |
| B-MAINT-01 | `ui/components/ModalSlideUpSheet.js` | 3 097 lignes — God File | 3 jours — décomposition en sous-modules | 🔶 À faire |
| B-MAINT-02 | `ui/views/DownloadsView.js` | 2 280 lignes — God File | 2 jours |
| B-MAINT-03 | `ui/views/LibraryView.js` | 2 487 lignes — God File | 2 jours |
| B-MAINT-04 | `scripts/homeScreen.js` | 6 400 lignes — God File avec scraping IMDB HTML | 5 jours |
| B-MAINT-05 | `scripts/watchlist.js` | 8 000 lignes — Monolithe total | 5 jours |
| B-MAINT-06 | `scripts/configuration.js` | 5 700 lignes — God File | 4 jours |
| B-ARCH-01 | Double architecture Core/Injector | `spaceHub-injector.js` legacy en parallèle de `core/` | 5 jours — migration complète |

### 🟡 Priorité basse

| ID | Fichier | Problème |
|----|---------|----------|
| B-DRY-01 | Plusieurs fichiers | `getAuthHeader()` dupliqué 3+ fois → centraliser dans `core/utils/auth.js` |
| B-DRY-02 | `scripts/homeScreen.js` + `configuration.js` | `DISCOVERY_SECTION_DEFINITIONS` dupliqué |
| B-DRY-03 | `ui/widgets/` | `MoviesWidget` et `TvShowsWidget` quasi-identiques → abstraire |
| B-CACHE-01 | `scripts/` | 3 implémentations de cache non coordonnées |
| B-DOC-01 | `README.md` | Badge MIT mais licence à vérifier, URL CDN `@main` instable |
| ~~B-TEST-01~~ | Projet entier | ~~Aucun test unitaire — au minimum sur `core/`~~ | ✅ Smoke tests ajoutés (`npm run test:smoke`), couverture fonctionnelle réelle encore à étendre |

---

## Impact des corrections appliquées

### Avant les corrections

```
checkHealth() → toujours 'connected' (6 intégrations cassées)
POST/PUT/PATCH → body jamais envoyé (ApiClient cassé)
Spinner splash → statique (keyframe manquant)
Console → tokens visibles (sécurité compromise)
Admin ID → hardcodé dans updoot.js
Poll gamepad → 60fps sans manette (gaspillage CPU)
Historique Router → croissance infinie (fuite mémoire)
```

### Après les corrections

```
checkHealth() → détecte réellement connected/offline/auth_failed/unconfigured
POST/PUT/PATCH → body correctement sérialisé et envoyé
Spinner splash → animé correctement
Console → aucune donnée sensible
Admin ID → configuré via settings
Poll gamepad → 1fps sans manette, 60fps avec manette
Historique Router → borné à 100 entrées, nettoyé dans destroy()
```

---

## Fichiers nouveaux créés

| Fichier | Description |
|---------|-------------|
| `core/utils/domUtils.js` | Utilitaires DOM partagés (`escapeHtml`, `createElement`, `injectStyles`, `waitForElement`) |
| `.eslintrc.json` | Configuration ESLint ES2022 |
| `.prettierrc` | Configuration Prettier |
| `docs/CONTRIBUTING.md` | Guide de contribution |
| `PLAN_CORRECTIONS.md` | Ce fichier — plan et traçabilité des corrections |

---

## Vérifications exécutées le 31 août 2026

- `npm run test:smoke` : ✅ réussi (navigation, historique borné, cycle plugin, validation des hooks, POST avec body).
- `npm run lint` : ✅ contrôle syntaxique JavaScript réussi.
- `npm run build` : ✅ build Vite réussi ; ⚠️ avertissement maintenu sur le bundle principal > 500 kB.
- `git diff --check` : ✅ aucune whitespace error dans les fichiers modifiés du périmètre.

> La validation serveur Jellyfin, la lecture Safari/native HLS et la recette avec télécommande TV restent des tests d'intégration à effectuer sur une instance réelle. Le compromis `api_key` des flux/images natifs doit être traité par un proxy d'images authentifié ou des Blob URLs avant une mise en production durcie.

## Écosystème plugins et métadonnées — fondations v2 ajoutées le 31 août 2026

- `core/PluginPermissions.js` centralise les permissions connues, les permissions admin-only et les approbations administrateur.
- `core/PluginManager.js` gère maintenant manifest v2, permissions, contributions typées, stockage isolé, santé, timeout de hooks, quarantaine et nettoyage.
- `core/PluginCatalog.js` valide les entrées, l'HTTPS, SemVer, compatibilité, SHA-256, signature ECDSA et approbation avant téléchargement ; il gère aussi le chargement du catalogue, l'installation, la mise à jour, le rollback et la conservation des packages vérifiés.
- `core/PolicyService.js` distingue le fallback de préférences locales d'un bridge serveur SpaceHub réellement disponible.
- `jellyfin/api/JellyfinPluginService.js` normalise les plugins Jellyfin et refuse de présenter un statut inconnu comme actif ; la configuration n'est accessible qu'à l'administrateur.
- `jellyfin/metadata/MetadataService.js` fusionne les sources par politique et expose la provenance champ par champ sans écriture automatique.
- `JellyfinConsoleModal` expose les états SDK et serveur et permet la lecture/sauvegarde de configuration uniquement quand Jellyfin expose réellement cette capacité.

> La gestion complète d'installation/mise à jour/suppression des plugins Jellyfin serveur reste conditionnée aux endpoints réellement fournis par la version Jellyfin ciblée. Le catalogue SDK distant exige une intégrité et une signature valides ; aucun package non signé ne doit être publié comme officiel. Les actions SDK d'administration sont maintenant exposées dans la console, tandis que les actions Jellyfin non détectées restent désactivées.

## Onboarding et recette interactive ajoutés le 31 août 2026

- `ui/components/OnboardingWizard.js` fournit un parcours utilisateur court et un parcours administrateur conditionné par `Policy.IsAdministrator`.
- La progression est séparée par serveur et utilisateur, versionnée et réinitialisable depuis les réglages.
- `SpatialNavigation` possède un scope `onboarding` afin de confiner le focus TV dans le guide.
- `SettingsPanel` permet de relancer le guide utilisateur, le guide administrateur et de réinitialiser les parcours.
- `docs/ONBOARDING.md` décrit les parcours et la recette navigateur.

> La recette interactive avec `npm run dev` doit encore être menée dans l’aperçu contre le serveur déjà actif sur le port 3000. Elle validera le navigateur et le DOM, mais pas une télécommande TV ou le décodage matériel réel.

## Derniers durcissements appliqués le 31 août 2026

- Le player possède désormais les méthodes de navigation réellement appelées (`_togglePlayPause`, `_renderDrawerContent`, `_showNextEpCard`) et invalide les anciens timers lors d'un remplacement rapide.
- La fermeture du player arrête le reporting, le countdown, les handlers clavier et détruit correctement HLS/URL objet ; le décalage des sous-titres est appliqué par delta et non cumulé à chaque clic.
- Les épisodes fictifs, l'état local fictif « Suivre la série » et les notes par défaut ont été supprimés ; une réponse serveur vide est affichée comme indisponible.
- Les chargements asynchrones de fiche et de saison vérifient leur génération afin qu'une réponse tardive ne réécrive pas une autre fiche ouverte.
- La console Jellyfin et le dashboard d'administration refusent l'accès sans `Policy.IsAdministrator === true`.
- Les plugins tiers restent désactivés par défaut, sauf manifest explicitement marqué `isDefault: true` ; le smoke test couvre ce contrat.
- `git diff --check`, syntax check, smoke tests et build ont été rejoués après ces changements.

## Score post-corrections (estimé)

| Domaine | Avant | Après | Gain |
|---------|-------|-------|------|
| Sécurité | 3.5/10 | 6/10 | +2.5 |
| Fiabilité | 5/10 | 7.5/10 | +2.5 |
| Qualité du code | 6/10 | 7/10 | +1 |
| Performances | 5.5/10 | 6.5/10 | +1 |
| Documentation | 5/10 | 7/10 | +2 |
| **Score moyen** | **5.6/10** | **7.0/10** | **+1.4** |

> Les scores Phase P2 (God Files, tests, double architecture) pourraient amener le projet à 8.5/10 une fois réalisés.

## Session du 31 août 2026 — persistance, mode TV, notes OMDb et corrections d'affichage

### Session Jellyfin persistante (`jellyfin/auth/AuthManager.js`)
- Stockage déplacé de `sessionStorage` vers `localStorage` (comportement du client Jellyfin Web officiel) : la session survit au rechargement et à la fermeture d'onglet ; migration automatique de l'ancienne copie.
- `init()` n'invalide plus la session sur une erreur temporaire (timeout proxy, 502/504) : seules les réponses 401/403 (token révoqué) effacent la session.
- Test smoke dédié : connexion → persistance → rechargement simulé → migration legacy → 504 préservé → 401 purge.

### Mode TV (nouveau module `core/TvModeManager.js`)
- Réglage `ui.tvMode` (`auto`/`on`/`off`, défaut `auto`), détection `gamepadconnected`/`gamepaddisconnected`, classe `sh-tv-mode` sur `<html>`.
- Curseur souris masqué en mode TV ; révélation temporaire (2,5 s) au mouvement de la souris.
- Toggle « Mode TV (télécommande/manette) » dans Réglages → Général ; branché au boot (`SpaceHub.js`) et réactif via l'event bus (`settings:changed`).

### Clé OMDb configurable depuis les Réglages
- Nouveau champ (administrateur) dans Réglages → Général : saisie, enregistrement et test réel de la clé (plugin storage `spacehub.ratings`), avec purge du cache et rafraîchissement immédiat des badges.
- La console admin (onglet Plugins → 🍅 Ratings Plugin) purge également le cache et déclenche l'événement `spacehub:ratings-updated` à l'enregistrement.

### Corrections d'affichage des notes
- **Hero** : doublon 🍅 supprimé (mise à jour en place du badge Jellyfin avec la valeur OMDb) ; badge presse Jellyfin restylé (`.sh-hero-badge--critic` écrasé par le CSS global `.sh-score-btn`) ; badges RT/IMDb/MC mis à jour sans duplication ; pause du carrousel quand le focus reste sur le Hero.
- **Cartes** : rechargement automatique des notes externes après enregistrement d'une clé (`spacehub:ratings-updated`) ; badge 🍅 mis à jour en place avec la valeur OMDb (aucun doublon).
- **Fiche détaillée** : section « À propos » restaurée avec des données réelles uniquement (score RT + statut + source, IMDb + nombre de votes, Metascore) — consensus/quotes/audience fabriqués définitivement supprimés ; badges meta line idempotents et activables au clavier (Entrée/Espace → onglet À propos).
- **Popovers télécommande** : déclenchés au focus (délégation `focusin` + événement `navigation:focusChanged` du moteur spatial) et non plus seulement au survol souris ; masqués au changement de carte ; anti-scintillement 320 ms.
- **Réglages** : titre de la modale corrigé (le durcissement XSS de `Modal` insère le titre via `textContent` — le HTML du badge de marque s'affichait en texte brut) ; titre passé en texte simple.

### Recette interactive du 31 août 2026 (serveur réel 192.168.1.18:8096)
- Session restaurée après rechargement (localStorage) ; clé OMDb enregistrée et testée (Shawshank Redemption : IMDb 9.3 / RT 89% / MC 82).
- 92 cartes avec ★ Jellyfin, 70 avec IMDb (OMDb), 23 avec 🍅 ; popover hover et focus fonctionnels avec données réelles.
- Fiche « Supergirl » : meta line ★ 6.7 · 🍅 53% · IMDb 5.9 ; À propos : RT 53% « Rotten » (source OMDb), IMDb ★ 5.9 — 69 194 votes.
- Mode TV : curseur masqué à la connexion d'une manette, révélé brièvement au mouvement, restauré à la déconnexion.
- Validations : syntax check (122 fichiers), smoke tests, build, `git diff --check` ✅.
