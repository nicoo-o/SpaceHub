# Plan — Chantier B (legacy), simplification apparence, A09, et audit menu flottant / affiches

> Complète `PLAN_ACTION_AUDIT_2026-09-01.md` et `AUDIT_SPACEHUB_2026-09-01.md`. Rédigé le 1er septembre 2026 suite à la demande : statut du nettoyage `scripts/`, simplification des apparences en clair/foncé, implémentation d'A09, et audit UI/UX du menu flottant (fiche média) + des affiches.

---

## 0 — Statut du Chantier B (nettoyage `scripts/`) : pas encore traité

Pour être direct : **aucune ligne de `scripts/` n'a été supprimée.** Ce qui existe aujourd'hui dans `PLAN_ACTION_AUDIT_2026-09-01.md` (section « Chantier B ») est uniquement la préparation — B0 (vérification résolue : l'app moderne tourne bien sur l'environnement réellement testé), B1 (inventaire des ~40 fichiers, 41 409 lignes), B2 (stratégie de suppression en 5 phases), B3 (règle à appliquer). Le travail exécuté jusqu'ici (`applique le plan d'action`) portait sur le **Chantier A** (correctifs de navigation A01-A07/A10) — le Chantier B n'avait pas été demandé.

La section 1 ci-dessous transforme B1/B2 en un **premier lot concret et prêt à exécuter**, pour que le nettoyage puisse réellement démarrer plutôt que de rester une intention.

---

## 1 — Chantier B : premier lot d'exécution concret

Rappel du principe (`PLAN_ACTION_AUDIT_2026-09-01.md` B2) : commencer par le Groupe 1 (fichiers déjà dupliqués par un module ESM moderne), du plus sûr au plus délicat.

### 1.1 Découverte complémentaire : les fichiers de compatibilité `skins/*.css` appartiennent à `scripts/`, pas à l'app moderne

En creusant pour la question sur les apparences (section 2), j'ai vérifié où `skins/*.css` est effectivement chargé :

- **Aucune référence** dans `core/`, `ui/`, `jellyfin/`, `integrations/` (l'app moderne testée sur `localhost:3000`).
- Les seules références actives sont dans `scripts/skinConfig.js`, `scripts/skinConfig-0.3.5-defaults.js` et `scripts/skinManager.js` (le système legacy).
- **Bonus (bug déjà présent, sans impact tant que `scripts/` n'est pas actif)** : ces fichiers legacy pointent vers des noms `*-kefin.css` (ex. `skins/jamfin-kefin.css`) alors que les fichiers réels dans `skins/` s'appellent `*-spacehub.css` (ex. `skins/jamfin-spacehub.css`) — un renommage fait lors du fork KefinTweaks → SpaceHub qui n'a pas été répercuté dans `scripts/`. Ces URLs sont donc cassées (404) dès que `scripts/` tourne réellement. À corriger uniquement si le Chantier B garde ce sous-système ; la section 2 recommande de le supprimer entièrement, ce qui rend le bug sans objet.

**Conséquence pratique :** l'A08 de l'audit original (« réduire `!important` dans `jamfin`/`flow`/`scyfin` », 2-3h par skin) ciblait des fichiers qui ne sont actuellement chargés par aucune app réellement testée. Ce n'est donc pas un correctif à prioriser tel quel — voir section 2, qui propose de les supprimer plutôt que de les polir.

### 1.2 Lot 1 — exécuté, avec une correction importante par rapport à la liste ci-dessous

**⚠️ Correction post-exécution :** la liste des « 5 fichiers les plus sûrs » ci-dessous a été écrite sans vérifier au préalable le graphe de dépendances réel déclaré dans `spaceHub-injector.js` (le champ `dependencies: []` de chaque module legacy). En exécutant le lot, cette vérification a montré que **4 des 5 fichiers listés sont encore activement dépendus par d'autres scripts legacy toujours actifs** :

| Fichier initialement listé | Dépendu par (`dependencies` dans `spaceHub-injector.js`) | Retiré ? |
|---|---|---|
| `scripts/toaster.js` | `subtitleSearch` | ❌ Non — encore une dépendance déclarée |
| `scripts/modal.js` + `.css` | `skinManager`, `watchlist`, `playlist`, `collections` | ❌ Non — 4 dépendances déclarées |
| `scripts/indexedDBCache.js` | `itemDetailsCollections` | ❌ Non — encore une dépendance déclarée |
| `scripts/localStorageCache.js` | `watchlist`, `homeScreen` | ❌ Non — 2 dépendances déclarées |
| `scripts/updoot.js` | *(aucune)* | ✅ **Oui — seul fichier réellement sans dépendant, supprimé** |

**Ce qui a été fait réellement :** seul `scripts/updoot.js` (1235 lignes, IIFE autonome intégrant `window.SpaceHub?.auth`, chargeant Google Fonts et appelant un backend tiers `/updoot` de l'addon `BobHasNoSoul/jellyfin-updoot`) a été supprimé, après confirmation par le graphe de dépendances de `spaceHub-injector.js` et par grep (aucune référence croisée depuis les autres fichiers `scripts/*.js`). Son entrée dans `spaceHub-injector.js` a été retirée. Validé par `node --check`, `npm run lint` (245 fichiers, contre 246 avant) et `npm run test:smoke`.

Les 4 autres fichiers restent en place — leur suppression nécessite d'abord de traiter les modules qui en dépendent (`subtitleSearch`, `skinManager`, `watchlist`, `playlist`, `collections`, `itemDetailsCollections`, `homeScreen`), ce qui relève du reste du Groupe 1/2 de `PLAN_ACTION_AUDIT_2026-09-01.md` (non traité dans cette session).

Liste originale (pour référence, non exécutée telle quelle) :

| Fichier legacy | Équivalent moderne déjà en place | Vérification avant suppression |
|---|---|---|
| `scripts/toaster.js` | `ui/components/Toaster.js` | Ouvrir une action qui déclenche un toast (ex. ajout Jellyseerr) sur les deux modes, comparer visuellement. |
| `scripts/modal.js` + `.css` | `ui/components/Modal.js` | Ouvrir Réglages sur les deux modes. |
| `scripts/indexedDBCache.js` + `scripts/localStorageCache.js` | `core/CacheManager.js` | Vérifier que le cache d'images/API fonctionne toujours après un rechargement. |
| `scripts/updoot.js` | `core/RatingCacheService.js` + plugin `spacehub.ratings` | Vérifier que les notes 🍅/IMDb s'affichent toujours sur une fiche média. |
| `scripts/apiHelper.js`, `scripts/utils.js` | **À NE PAS retirer dans ce lot** — grep `scripts/*.js` d'abord pour confirmer qu'aucun autre fichier de `scripts/` encore actif ne les importe (probable, cf. B2 point 2 de l'audit original). | — |

Procédure par fichier (identique à B2) : retirer l'entrée dans `spaceHub-injector.js` → supprimer le fichier → `npm run lint` + `npm run test:smoke` → vérifier visuellement en mode injection legacy.

### 1.3 Lot 2 — supprimer `skins/` et son chargeur avec le reste du Groupe 3

Vu 1.1, ajouter au Groupe 3 de B1 (déjà prévu en dernier) : une fois Lot 1 + le reste du Groupe 1/2 traités, supprimer le dossier `skins/` en bloc avec `scripts/skinConfig.js`, `scripts/skinConfig-0.3.5-defaults.js`, `scripts/skinManager.js` — aucune compatibilité à préserver côté app moderne (elle n'en a jamais eu besoin).

### 1.4 Ce qui reste inchangé

Le reste de B1/B2/B3 (Groupe 2 « petits gains » et fonctionnalités moyennes, les deux monolithes `watchlist.js`/`homeScreen.js`, la Phase 5) reste valable tel quel dans `PLAN_ACTION_AUDIT_2026-09-01.md` — non recopié ici pour éviter la duplication.

---

## 2 — Simplification de l'apparence : un mode clair et un mode foncé

Décision retenue : remplacer entièrement le système actuel (5 préréglages de couleur SpaceHub + 8 fichiers de compatibilité skins tiers) par un simple choix clair/foncé.

### 2.1 Ce qui existe aujourd'hui

- `ui/themes/presets/index.js` : 5 préréglages, tous sombres — `spacehub-dark` (défaut, tokens de base), `apple-vision-glass`, `obsidian-monochromic`, `tokyo-night`, `nord`. Chacun redéfinit un sous-ensemble des variables CSS de `tokens.css` (bg-base, bg-surface, text-primary, border-color, color-primary, card-bg…).
- `ui/themes/ThemeManager.js` : charge `tokens.css`, applique un préréglage en injectant ses variables dans une balise `<style id="sh-theme-vars">`, expose `SpaceHub.ui.themes.apply(id)` / `getAvailable()`.
- `ui/components/SettingsPanel.js` (ligne 80) : liste les préréglages via `getAvailable()` pour construire le sélecteur dans Réglages.
- `skins/*.css` : appartient au Chantier B (section 1.1), pas à ce chantier.

### 2.2 Changement proposé

1. **`ui/themes/presets/index.js`** — remplacer les 5 entrées par 2 :
   - `spacehub-dark` (« Sombre ») : conserver tel quel — c'est déjà l'apparence de base actuelle (`variables: {}`, aucun changement de comportement).
   - `spacehub-light` (« Clair », nouveau) : proposition de valeurs de départ, à valider visuellement en recette (contraste, lisibilité des posters sur fond clair) avant de figer :
     ```js
     {
         id: 'spacehub-light',
         name: 'Clair',
         icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
         variables: {
             '--sh-bg-base':                '#f4f4f5',
             '--sh-bg-surface':              '#ffffff',
             '--sh-bg-surface-2':            '#ececee',
             '--sh-bg-surface-3':            '#e0e0e3',
             '--sh-bg-overlay':              'rgba(255, 255, 255, 0.88)',
             '--sh-bg-glass':                'rgba(0, 0, 0, 0.04)',
             '--sh-bg-glass-heavy':          'rgba(255, 255, 255, 0.92)',
             '--sh-text-primary':            '#111113',
             '--sh-text-secondary':          'rgba(0, 0, 0, 0.62)',
             '--sh-text-muted':              'rgba(0, 0, 0, 0.38)',
             '--sh-text-on-primary':         '#ffffff',
             '--sh-text-on-dark':            'rgba(0, 0, 0, 0.90)',
             '--sh-color-primary':           '#111113',
             '--sh-color-primary-hover':     '#28282b',
             '--sh-color-primary-active':    '#3a3a3d',
             '--sh-border-color':            'rgba(0, 0, 0, 0.10)',
             '--sh-border-color-hover':      'rgba(0, 0, 0, 0.18)',
             '--sh-border-color-focus':      'rgba(0, 0, 0, 0.45)',
             '--sh-card-bg':                 '#ffffff',
             '--sh-card-shadow-hover':       '0 24px 60px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.10)',
         },
     }
     ```
     Point d'attention explicite pour la recette : `--sh-color-danger/warning/success/info` restent inchangés (couleurs système Apple, déjà lisibles sur fond clair ou foncé) ; en revanche toute règle CSS du reste de l'app qui suppose un fond sombre en dur (`rgba(255,255,255,...)` codé directement plutôt que via une variable `--sh-*`) ne basculera PAS avec le thème — un passage de recherche (`grep -rn "rgba(255, 255, 255" ui/ jellyfin/`) sera nécessaire pour repérer ces cas avant de livrer le mode clair, plutôt que de le découvrir après coup sur TV.
2. **`ui/themes/ThemeManager.js`** : aucun changement de logique nécessaire — `apply()`/`getAvailable()` fonctionnent déjà génériquement sur le tableau `PRESETS`, quel que soit son contenu.
3. **`ui/components/SettingsPanel.js`** : vérifier le rendu du sélecteur avec seulement 2 entrées (probablement déjà correct puisqu'il itère sur `getAvailable()`, mais à confirmer visuellement — un sélecteur pensé pour 5 cartes peut avoir un rendu différent avec 2).
4. **Réglage par défaut** : `core/SpaceHub.js` a déjà `'ui.theme': 'spacehub-dark'` comme valeur par défaut (ligne ~224) — pas de changement nécessaire, le sombre reste la valeur de base.
5. **`skins/*.css`** : traité au Chantier B (section 1.3), pas ici.

### 2.3 Ordre d'exécution suggéré

1. Rédiger `spacehub-light` dans `presets/index.js`, retirer les 3 préréglages fantaisie (`apple-vision-glass`, `obsidian-monochromic`, `tokyo-night`, `nord`).
2. `npm run lint` + `npm run test:smoke`.
3. Recette visuelle manuelle : basculer clair/foncé depuis Réglages, vérifier Dashboard, Bibliothèque, fiche média, Player, chaque modale — chercher spécifiquement les couleurs codées en dur qui ne suivent pas le thème.
4. Corriger les couleurs codées en dur trouvées à l'étape 3 (remplacer par les variables `--sh-*` correspondantes).
5. Une fois validé, retirer `skins/*.css` avec le Lot 2 du Chantier B (section 1.3).

**✅ Fait dans cette session :** `presets/index.js` ne contient plus que 2 préréglages — `spacehub-dark` (« Sombre », renommé, comportement inchangé) et `spacehub-light` (« Clair », nouveau, avec exactement les valeurs proposées ci-dessus). Les 3 préréglages fantaisie (`apple-vision-glass`, `obsidian-monochromic`, `tokyo-night`, `nord`) ont été retirés. Validé par `node --check`, `npm run lint` et `npm run test:smoke`. `SettingsPanel.js` a été vérifié : le sélecteur de thèmes utilise une grille CSS `repeat(auto-fill, minmax(130px, 1fr))` générique sur `getAvailable()`, donc il s'affiche correctement avec 2 entrées sans changement de code nécessaire.

**Non fait dans cette session (recette visuelle manuelle) :** les couleurs de `spacehub-light` ci-dessus n'ont pas été vérifiées visuellement en conditions réelles (contraste, lisibilité des affiches sur fond clair, recherche des `rgba(255, 255, 255, ...)` codés en dur qui ne suivraient pas le thème — étape 3 de l'ordre d'exécution ci-dessus). À faire en ouvrant l'app et en basculant sur « Clair » depuis Réglages avant de considérer ce chantier comme définitivement clos.

---

## 3 — A09 (chargement différé des intégrations Servarr) : pas implémenté, voici pourquoi et le plan corrigé

Tu as demandé si je pouvais le faire. En creusant pour l'implémenter proprement, j'ai trouvé une architecture plus piégeuse que ce que le texte original du plan laissait penser — je préfère l'expliquer plutôt que de livrer un correctif qui casse silencieusement une fonctionnalité que tu pourrais activer plus tard (tu as confirmé n'avoir aucune intégration configurée aujourd'hui, donc le risque immédiat est faible, mais le correctif doit rester correct pour le jour où tu en actives une).

### 3.1 Ce que j'ai découvert

1. **Double point d'import statique, pas un seul.** `core/SpaceHub.js` importe les 6 `*Service.js` + leurs widgets ET `ui/layouts/Dashboard.js` importe **indépendamment** les mêmes 6 modules de widgets (`JellyseerrWidgets.js`, `QBittorrentWidgets.js`, `SonarrWidgets.js`, `RadarrWidgets.js`, `BazarrWidgets.js`, `ProwlarrWidgets.js`) et les enregistre lui-même dans son constructeur (`Dashboard.js` lignes 94-118). Différer un seul des deux sites ne change rien au poids réellement téléchargé.
2. **`_loadLayout()` ne réessaie jamais.** Au premier rendu, `Dashboard._loadLayout()` parcourt une seule fois la disposition (par défaut ou sauvegardée), cherche chaque `widgetType` dans `_registeredWidgets`, et **ignore silencieusement** (`this._log.warn('Type de widget inconnu...')`, puis `continue`) tout type pas encore enregistré à cet instant précis — sans jamais revenir dessus. Si le chargement des services Servarr est différé après le premier rendu (le but même d'A09), les widgets Servarr de la disposition par défaut ou sauvegardée disparaîtraient **définitivement** de l'écran, sans erreur visible, tant qu'aucun mécanisme de rattrapage n'existe.
3. **La disposition par défaut inclut déjà tous les widgets Servarr**, y compris quand rien n'est configuré (`defaultLayout` dans `Dashboard.js`, ~ligne 570 : `jellyseerr-trending`, `qbittorrent-speed`, `sonarr-upcoming`, etc. sont tous présents par défaut).
4. **Ces widgets ont une vraie utilité pour un compte non configuré** : `SonarrWidgets.js` (et les autres) affichent un message explicite « Sonarr non configuré » plutôt que de disparaître — c'est l'écran de découverte qui invite à configurer l'intégration depuis le Dashboard. Charger ces widgets uniquement pour les intégrations déjà configurées supprimerait cette découverte pour un nouvel utilisateur qui n'a encore rien configuré.

Le point 4 n'est pas un problème technique — c'est un choix produit : est-ce que « Sonarr non configuré » doit continuer à apparaître pour inviter à la configuration, même au prix du poids JS chargé pour tout le monde ?

### 3.2 Plan corrigé (prêt à exécuter, avec le point 4 tranché)

**Si le choix est « garder la découverte visible »** (recommandé pour ne rien perdre côté produit) :
- Le gain réaliste n'est plus « ne charger que les intégrations configurées », mais **« ne pas bloquer le premier rendu sur leur initialisation »** — un objectif plus modeste que le texte initial de l'audit, mais sans risque de régression :
  1. Dans `core/SpaceHub.js`, sortir les 6 `await registerIntegration(...)` (lignes ~475-480) du chemin bloquant : les lancer avec `requestIdleCallback` (repli `setTimeout(..., 0)`) **après** le montage de `#app`, sans `await` sur le chemin principal.
  2. Ne rien changer à `Dashboard.js` — les imports statiques de widgets y restent (ils sont nécessaires dès le premier rendu pour l'affichage « non configuré »). Le gain vient uniquement du fait que les 6 `new ServiceClass(...)` (potentiellement des appels réseau si déjà configuré) ne bloquent plus le montage de l'app.
  3. Test de validation : mesurer le temps jusqu'au premier rendu utile avant/après avec les DevTools Performance (comme prévu dans le texte original d'A09).

**Si le choix est « accepter de perdre l'écran de découverte pour gagner en poids/vitesse »** :
  1. Retirer les imports Servarr des DEUX fichiers (`SpaceHub.js` ET `Dashboard.js`).
  2. Ajouter à `Dashboard.js` une méthode de rattrapage, par exemple `registerWidgetAndMount(id, WidgetClass, itemConfig)`, appelée après un `import()` dynamique différé et conditionnel (uniquement si `settings.get('<id>.enabled')` et URL/clé présents) : elle enregistre la classe puis monte directement le widget dans la grille déjà rendue (réutiliser `_mountWidget`), sans dépendre d'un second passage de `_loadLayout`.
  3. Retirer aussi les entrées Servarr de `defaultLayout` dans `Dashboard.js` (puisqu'elles ne doivent plus apparaître pour un compte non configuré).
  4. Effort réaliste : environ une demi-journée à une journée, comme estimé dans le plan original — mais avec une étape de recette obligatoire (activer une intégration factice, vérifier qu'elle apparaît bien sur le Dashboard, désactiver, vérifier qu'elle disparaît) avant de considérer que c'est fini.

**Recommandation :** commencer par la première option (peu de risque, gain réel sur le temps de premier rendu) et ne faire la seconde que si le poids du bundle reste un problème après mesure.

**✅ Fait dans cette session :** la première option (« ne pas bloquer le premier rendu ») a été implémentée telle que décrite en 3.2 point 1. Dans `core/SpaceHub.js`, les 6 `await registerIntegration(...)` ont été sortis du chemin bloquant et regroupés dans `registerDeferredIntegrations()`, lancée via `requestIdleCallback` (repli `setTimeout(..., 0)` si indisponible) **après** le montage de `#app`. `Dashboard.js` n'a pas été modifié — ses imports statiques de widgets restent en place, donc l'écran de découverte « Sonarr non configuré » etc. continue de s'afficher normalement. Validé par `node --check` et `npm run lint`/`npm run test:smoke`.

**Non fait (mesure de performance) :** le gain réel sur le temps de premier rendu (DevTools Performance, avant/après) n'a pas été mesuré dans cette session — à faire sur ton environnement réel pour confirmer l'amélioration. L'option « vrai chargement conditionnel » (point 2 de 3.2) reste non implémentée, gated sur ta décision produit du point 4.

---

## 4 — Audit UI/UX : menu flottant (fiche média) et affiches

### 4.1 Menu flottant (`ui/components/ModalSlideUpSheet.js`, fiche média)

**Présence de Rotten Tomatoes et du texte critique dans « À propos » — vérifié, légitime :**

- Le score 🍅 vient soit du champ natif Jellyfin `CriticRating`, soit de l'API OMDb (si une clé est configurée) — jamais inventé ni recalculé côté client.
- Le texte critique dans l'onglet « À propos » vient de l'API officielle TMDB (`api.themoviedb.org/3/{type}/{id}/reviews`) — pas de scraping HTML, contrairement au problème déjà relevé sur `scripts/homeScreen.js` dans l'audit initial (§3).
- Quand aucune donnée réelle n'existe (pas de `CriticRating`, pas de clé OMDb, pas de review TMDB), la carte correspondante est masquée proprement (`hidden`, classe `--hidden`) plutôt que d'afficher un score ou un texte inventé — le commentaire du code le dit explicitement (« rien d'inventé »). **Bonne pratique confirmée, aucun correctif nécessaire.**

**Navigation TV dans ce menu — vérifiée, globalement cohérente :**

- Le scope `'modal'` de `SpatialNavigation` reconnaît bien `.sh-slideup-sheet--open` (`_detectCurrentScope()`), et sa liste de sélecteurs focusables inclut `.sh-tab-btn` et `[data-nav-focusable="true"]` — les onglets (Épisodes, À propos, Distribution, Similaires...) et les badges de notes 🍅/IMDb sont donc navigables au clavier/télécommande, pas seulement à la souris.
- Les panneaux d'onglets inactifs sont masqués via `display: none` (`.sh-tab-panel` / `.active`), et `SpatialNavigation._filterVisibleElements()` exclut les éléments non visibles — changer d'onglet ne laisse donc pas la télécommande naviguer « à travers » un panneau caché.
- Fermeture (Échap/Retour) : déjà corrigée au Chantier A (A05) — un seul déclenchement, sauf pour le popover audio interne qui se ferme en premier (comportement voulu, cf. `PLAN_ACTION_AUDIT_2026-09-01.md`).

**Point d'amélioration mineur relevé (P3, cosmétique, pas un bug) :** changer d'onglet (`Entrée` sur un `.sh-tab-btn`) ne déplace pas explicitement le focus dans le nouveau panneau — la télécommande reste sur l'onglet, et atteindre le contenu dépend de l'algorithme géométrique générique (`Bas` doit retrouver le bon élément le plus proche). Ça fonctionne dans la plupart des cas mais un déplacement explicite du focus vers le premier élément du panneau nouvellement actif serait plus prévisible. Non traité ici — à ajouter au Chantier A P3 si tu veux qu'il soit corrigé.

### 4.2 Affiches (`ui/components/CardBuilder.js`)

**Points positifs confirmés :**

- `aspect-ratio` réservé par type de carte (2/3 posters, 16/9 backdrops, 4/3 miniatures) — pas de saut de mise en page (CLS) pendant le chargement des images.
- `loading="lazy"` natif sur les images + `onerror` avec repli vers une image de substitution — pas d'icône d'image cassée si une affiche est manquante.
- URLs d'images construites via l'API Jellyfin avec `maxWidth`/`maxHeight`/`quality` (400×600, qualité 90 par défaut) plutôt que de charger l'image source pleine résolution — bon réflexe de performance, en particulier sur TV/Wi-Fi faible.
- Sécurité : le commentaire du code confirme explicitement que le token d'authentification n'est jamais placé dans l'URL d'image générée — cohérent avec le reste de l'app.
- Focus TV cohérent : `.sh-tv-focused` réutilise les mêmes styles que `:hover` (léger zoom, reflet, badge codec, pastille d'action) — un utilisateur TV voit exactement la même affordance qu'un utilisateur souris, pas une version dégradée.
- `data-nav-focusable="true"` posé sur chaque carte — navigable nativement, sans code spécifique à ajouter par vue.

**Aucun correctif nécessaire sur ce point** — c'est une implémentation soignée. Si tu as un exemple précis d'affiche qui pose problème visuellement (mauvais recadrage, mauvais ratio pour un type de média particulier), donne-moi l'exemple et je creuse ce cas précis plutôt que de deviner.

---

## 5 — Chantier B : que faut-il régler avant de retirer les 4 fichiers utilitaires restants du Lot 1 ?

Suite à la correction de la section 1.2, `toaster.js`, `modal.js`+`.css`, `indexedDBCache.js`, `localStorageCache.js` restent en place car encore dépendus par 7 scripts legacy actifs (`subtitleSearch`, `skinManager`, `watchlist`, `playlist`, `collections`, `itemDetailsCollections`, `homeScreen`). Aucun de ces 7 n'est lui-même dépendu par un autre script encore actif (vérifié dans `spaceHub-injector.js`) — ce sont tous des feuilles du graphe, donc chacun peut en théorie être traité indépendamment des autres.

**Important — deux questions séparées, à ne pas confondre :**
1. *Est-ce que `scripts/` (mode injection JS sur le Jellyfin natif) est encore utilisé quelque part en pratique ?* Le B0 de l'audit initial a seulement vérifié que l'environnement de test réel tourne sur l'app moderne (`localhost:3000`) — pas si le mode injection legacy est encore déployé ailleurs (un vrai serveur Jellyfin de prod avec le plugin JS Injector, par exemple). Si non, la suppression de `scripts/*.js` est du nettoyage de code mort, point final — la question de « parité fonctionnelle avec l'app moderne » ne se pose même pas puisque personne n'utilise plus ces fichiers.
2. *Si tu veux que l'app moderne couvre un jour tout ce que faisait `scripts/`* — utile si tu comptes abandonner définitivement le mode injection et donc retrouver ces fonctionnalités ailleurs — voici ce que j'ai trouvé en comparant chaque script à l'app moderne :

| Script legacy (lignes) | Fonctionnalité | Équivalent dans l'app moderne |
|---|---|---|
| `subtitleSearch.js` (1183) | Recherche/téléchargement de sous-titres depuis l'OSD du lecteur | ✅ Remplacé, en mieux — `VideoPlayer.js` a `_openRemoteSubtitleModal()` (API native Jellyfin `RemoteSearch/Subtitles`, directement dans l'OSD) + l'intégration Bazarr (recherche via Sonarr/Radarr, plus complet). |
| `skinManager.js` (2971) | Sélecteur de skins **tiers pour le Jellyfin natif** (jamfin, flow, scyfin...) + chargement des CSS `skins/*.css` | ⚠️ Pas un vrai remplacement — `ThemeManager`/presets clair-foncé ne concernent que l'app moderne elle-même, un contexte différent. Cette fonctionnalité n'a de sens que si le mode injection sur Jellyfin natif est encore utilisé quelque part (cf. question 1 ci-dessus). |
| `watchlist.js` (8011) | Liste personnalisée multi-types (Film/Série/Saison/Épisode/BoxSet/Playlist), stockée en localStorage, avec nettoyage auto à la lecture, nécessite le plugin Custom Tabs | ❌ Pas remplacé. L'app moderne n'a que le bouton Favoris natif Jellyfin (`CardBuilder.js`, `LibraryView.js`), une fonctionnalité plus simple. **Bug trouvé en creusant :** le bouton « Ajouter à ma liste » du menu contextuel (`ui/components/CardBuilder.js`, id `sh-ctx-watchlist`) existe dans le DOM mais n'a **aucun gestionnaire de clic câblé** — contrairement à « Lire », « Détails » et « Bande-annonce » juste à côté qui fonctionnent. C'est un bouton mort actuellement. Idem pour « Marquer comme vu » (`sh-ctx-watched`). |
| `playlist.js` (1287) | Sur la page playlist native Jellyfin : navigue vers la fiche au lieu de lancer la lecture, ajoute un bouton lecture, ajoute un tri | ✅ Largement couvert — l'app moderne traite déjà les Playlists comme des dossiers navigables (`CardBuilder.js`) et `LibraryView.js` a son propre tri générique (Récents, Mieux notés, Date de sortie, Titre, Aléatoire). Jamais vérifié visuellement en recette. |
| `collections.js` (657) | Tri sur la page d'une collection native Jellyfin | ⚠️ Partiel — ouvrir une Saga dans l'app moderne (`ModalSlideUpSheet`, panneau « Films de la Saga ») n'a pas de contrôle de tri visible ; probablement acceptable vu que les sagas sont petites, mais pas une équivalence stricte. |
| `itemDetailsCollections.js` (288) | Sur la fiche d'un film/série, affiche à quelle(s) saga(s)/collection(s) il appartient | ❌ Pas remplacé — aucune trace de cette fonctionnalité inverse (film → sa saga) dans `ModalSlideUpSheet.js`. |
| `homeScreen.js` (6368) | Sections personnalisées sur l'accueil, générées à partir de playlists publiques Jellyfin | ⚠️ Partiel/différent — `Dashboard.js` est l'héritier conceptuel (sections/widgets personnalisables) mais fonctionne différemment : il tire ses widgets des bibliothèques/intégrations Servarr, pas de playlists publiques. Des sections basées sur des playlists spécifiques ne réapparaîtraient pas automatiquement. |

**Verdict pratique :**
- `subtitleSearch` et `playlist` peuvent être retirés sans perte fonctionnelle si le mode injection legacy n'est plus utilisé (ce qui libère `toaster.js`, en partie `modal.js`).
- `watchlist`, `itemDetailsCollections`, `homeScreen`, `collections`, `skinManager` ont des lacunes réelles ou des fonctionnalités orthogonales côté app moderne — les retirer du dossier `scripts/` ne pose problème que si quelqu'un utilise encore ces fonctionnalités via le mode injection ; ça ne « répare » ni ne « remplace » rien côté app moderne.
- Le bug des boutons morts « Ajouter à ma liste » / « Marquer comme vu » dans `CardBuilder.js` est indépendant de tout ça — à corriger (câbler les handlers, probablement `api.setFavorite()` déjà disponible) que Chantier B avance ou non.

### 5.1 Confirmation utilisateur : le mode injection n'est plus utilisé du tout — le système legacy entier retiré

Confirmé le 1er septembre 2026 : le plan de développement initial de SpaceHub prévoit un client natif Jellyfin (PC, TV, mobile) — le mode injection JS sur le Jellyfin natif n'a donc plus aucun usage réel, nulle part. La question de parité fonctionnelle de la section 5 devient sans objet : ce n'est plus « est-ce remplacé », c'est « personne ne charge plus ces fichiers ».

**Chaîne complète identifiée et supprimée (~43 750 lignes) :**

| Emplacement | Contenu | Statut |
|---|---|---|
| Racine : `spaceHub-plugin.js`, `spaceHub-injector.js`, `spaceHub-default-config.js`, `spaceHub.minimal.js` | Chaîne de bootstrap du mode injection (ordre de chargement documenté dans leurs propres commentaires) | ✅ Supprimés |
| `scripts/` — tous les fichiers sauf `smoke-tests.mjs` et `syntax-check.mjs` | Les ~31 scripts legacy (`toaster.js`, `modal.js`, `watchlist.js`, `homeScreen.js`, `skinManager.js`, etc.) + `third party/jquery.flurry.min.js` | ✅ Supprimés — `smoke-tests.mjs`/`syntax-check.mjs` conservés (outillage `npm run lint`/`npm run test:smoke` de l'app moderne, qui vivait dans le même dossier par coïncidence de nommage) |
| `skins/` (dossier entier) | CSS de compatibilité pour skins tiers (jamfin, flow, scyfin, elegant, neutralfin, glassfin, chromic, fin-10.11) sur le Jellyfin natif | ✅ Supprimé |

**Non touché, en dehors du périmètre de cette suppression :**
- `pages/` (captures d'écran/vidéo de démo pour la doc du plugin legacy, non référencées par le README actuel) — laissé en place, décision à prendre séparément.
- `SpaceHub-main/` (copie complète du dépôt, probablement l'instantané de comparaison de l'audit initial) — laissé en place, décision à prendre séparément.
- Le bug des boutons morts « Ajouter à ma liste »/« Marquer comme vu » dans `CardBuilder.js` (section 5, tableau) — toujours pas corrigé.

**Validation après suppression :** `npm run lint` → 209 fichiers JS (contre 245 avant, soit -36 fichiers : 31 scripts legacy + `third party/jquery.flurry.min.js` + 4 fichiers racine). `npm run test:smoke` → tous les tests passent, aucune régression détectée sur l'app moderne (attendu, puisqu'aucun fichier de `core/`, `ui/`, `jellyfin/`, `integrations/`, `plugins/` ne référençait quoi que ce soit dans les chemins supprimés).

**Chantier B est maintenant terminé** pour la partie « code legacy mort » — il ne reste que les deux décisions annexes ci-dessus (`pages/`, `SpaceHub-main/`) et le correctif indépendant des boutons morts.

### 5.2 Nettoyage final : `pages/`, `SpaceHub-main/`, et correctif des boutons morts

Les trois points annexes ont été traités le 1er septembre 2026 :

- **`pages/` supprimé** — captures d'écran/vidéo de démo de l'ancien plugin, non référencées par le README actuel.
- **`SpaceHub-main/` supprimé** — c'était une copie complète du dépôt entier (son propre `core/`, `ui/`, `scripts/`, etc.), utilisée comme instantané de comparaison pendant l'audit initial et devenue obsolète depuis. `npm run lint` passe de 209 à 86 fichiers JS après sa suppression (elle dupliquait la quasi-totalité du code source une seconde fois).
- **Boutons morts corrigés** (`ui/components/CardBuilder.js`, menu contextuel clic-droit) :
  - « Ajouter à ma liste » (`#sh-ctx-watchlist`) déclenche maintenant un clic programmatique sur le bouton favori déjà présent sur la carte (`.sh-card__bookmark-btn`) — réutilise exactement la même logique de bascule + appel `api.setFavorite()` + toast, plutôt que de dupliquer le code.
  - « Marquer comme vu » (`#sh-ctx-watched`) appelle maintenant `api.setPlayedStatus(item.id, true)` avec toast de confirmation et gestion d'erreur.

**Validation :** `node --check` sur `CardBuilder.js`, `npm run lint` (86 fichiers, OK) et `npm run test:smoke` (OK) après les trois suppressions/correctifs.

**Vérification en direct effectuée :** l'app moderne (`localhost:3000`, serveur Vite toujours actif) a été ouverte dans un navigateur — chargement propre, écran de connexion SpaceHub affiché normalement, **aucune erreur console** après le retrait de ~44 000 lignes de legacy + la copie dupliquée du dépôt. Je n'ai pas de session Jellyfin ouverte (identifiants non fournis, et je n'entre jamais de mot de passe à ta place), donc je n'ai pas pu cliquer plus loin dans l'app connectée — le reste de la vérification (menu contextuel, bascule de thème, dashboard) nécessite un passage manuel de ta part.

### 5.3 L'app est-elle prête pour un vrai test ?

**Oui pour un premier passage réel**, avec quelques points précis à vérifier en priorité puisque ce sont les seuls changements de cette session jamais testés en conditions réelles (au-delà de `node --check`/lint/smoke, qui valident la syntaxe et l'absence de régression mais pas le rendu visuel ni le comportement utilisateur) :

1. **`npm run build`** — jamais pu être exécuté dans cet environnement (bug `@rollup/rollup-linux-x64-gnu` manquant, spécifique à cette VM de pont) — à lancer sur ta machine avant tout déploiement de production.
2. **Menu contextuel (clic droit sur une affiche)** — « Ajouter à ma liste » et « Marquer comme vu » viennent d'être câblés, jamais cliqués en vrai. Vérifier que le favori se synchronise bien avec l'icône marque-page de la carte, et que le marquage "vu" ne lève pas d'erreur.
3. **Réglages → Thèmes** — basculer Sombre/Clair, vérifier le contraste et la lisibilité des affiches/texte en mode clair (couleurs jamais validées visuellement, cf. section 2.3).
4. **Dashboard** — confirmer que les widgets Servarr (Sonarr/Radarr/etc.) affichent toujours leur état « non configuré » malgré le chargement différé (A09), et que le montage de l'app n'est pas visuellement retardé.
5. **Navigation TV/télécommande** — les correctifs A01-A07 du Chantier A avaient déjà été validés par `npm run lint`/`test:smoke` mais méritent un passage réel sur télécommande si ça n'a pas encore été fait depuis leur application.

Rien de bloquant identifié dans le code — c'est maintenant le moment où la vérification manuelle prend le relais de la validation automatisée.

---

## Suivi

| Sujet | Statut |
|---|---|
| Chantier B — nettoyage complet du mode injection | ✅ Fait (section 5.1) — confirmé par l'utilisateur que le mode injection n'est plus utilisé nulle part (roadmap = client natif Jellyfin PC/TV/mobile). Racine (`spaceHub-plugin.js`, `spaceHub-injector.js`, `spaceHub-default-config.js`, `spaceHub.minimal.js`), `scripts/` (sauf outillage lint/smoke), et `skins/` supprimés en un seul passage (~43 750 lignes). |
| Chantier B — `pages/` (screenshots doc plugin legacy) | ✅ Supprimé |
| Chantier B — `SpaceHub-main/` (copie complète du dépôt) | ✅ Supprimé |
| Boutons morts « Ajouter à ma liste » / « Marquer comme vu » | ✅ Corrigés (`CardBuilder.js`) — jamais cliqués en conditions réelles |
| Vérification en direct (`localhost:3000`) | ✅ App chargée sans erreur console après nettoyage — session Jellyfin non testée (pas d'identifiants) |
| Apparence — préréglage `spacehub-light` | ✅ Fait (code) — couleurs pas encore validées en recette visuelle |
| Apparence — retrait des 3 préréglages fantaisie | ✅ Fait |
| A09 — option « ne pas bloquer le premier rendu » | ✅ Fait — `core/SpaceHub.js`, non mesuré en performance réelle |
| A09 — option « vrai chargement conditionnel » | ⬜ Plan écrit (section 3.2), nécessite décision produit + recette avec une intégration activée |
| Audit menu flottant (RT/critiques, nav TV) | ✅ Fait — aucun correctif nécessaire |
| Audit affiches (CardBuilder) | ✅ Fait — aucun correctif nécessaire |

**Validation technique effectuée après application (1er septembre 2026) :** `node --check` sur tous les fichiers modifiés (`spaceHub-injector.js`, `ui/themes/presets/index.js`, `core/SpaceHub.js`) → OK. `npm run lint` → 245 fichiers JS, syntaxe OK. `npm run test:smoke` → tous les tests passent. `npm run build` n'a pas pu être exécuté dans cet environnement (bug connu `@rollup/rollup-linux-x64-gnu` manquant, spécifique à cette VM de pont) — à lancer sur ta machine avant tout déploiement.

---

*Rédigé le 1er septembre 2026, en complément de `AUDIT_SPACEHUB_2026-09-01.md` et `PLAN_ACTION_AUDIT_2026-09-01.md`.*
