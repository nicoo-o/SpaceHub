# Plan de test réel — SpaceHub (1er septembre 2026)

> À utiliser après tous les correctifs du Chantier A (navigation TV, lecteur, perf) et du Chantier B (nettoyage legacy, thèmes clair/foncé, A09, boutons de menu contextuel). Objectif : passer du "validé par lint/smoke" au "validé en conditions réelles" avant tout déploiement.
>
> **Comment l'utiliser :** suis les étapes dans l'ordre (chaque section dépend un peu de la précédente). Pour chaque test, remplis directement le gabarit en bas du document (section « Gabarit à me renvoyer ») au fur et à mesure — pas besoin d'attendre la fin. Renvoie-moi ce fichier une fois rempli (ou juste la section gabarit, copiée dans le chat).

---

## Étape 0 — Build de production

C'est la seule étape que je n'ai pas pu valider du tout dans mon environnement (bug `@rollup/rollup-linux-x64-gnu` propre à la VM de pont). À faire en premier, avant tout le reste — si le build casse, aucun des tests suivants n'a de sens en conditions de prod.

1. Sur ta machine, à la racine du projet : `npm run build`.
2. Vérifie qu'il se termine sans erreur et que `dist/` contient bien les fichiers attendus (`index.html`, `assets/*.js`).
3. Sers `dist/` (par ex. `npx serve dist` ou ton serveur habituel) et ouvre-le dans un navigateur — vérifie que ça charge, comme pour `localhost:3000` en dev.

Si le build échoue, note l'erreur complète dans le gabarit (section Build) — c'est prioritaire sur tout le reste.

---

## Étape 1 — Connexion et chargement général

1. Ouvre l'app (dev `localhost:3000` ou le build de prod servi à l'étape 0).
2. Connecte-toi avec ton compte Jellyfin normal.
3. Ouvre la console développeur (F12) et vérifie qu'il n'y a **aucune erreur rouge** au chargement ni pendant la navigation entre Dashboard / Bibliothèque / fiche média.
4. Vérifie que le Dashboard affiche bien tous tes widgets habituels (bibliothèques, continuer à regarder, ajouts récents...).

C'est le test de non-régression général après le retrait de ~44 000 lignes de code legacy (`scripts/`, `skins/`, les 4 fichiers d'injection à la racine, `SpaceHub-main/`, `pages/`) — rien ne devrait avoir changé ici, mais c'est la meilleure façon de le confirmer.

---

## Étape 2 — Dashboard et intégrations Servarr (A09)

Concerne le changement le plus récent avant les boutons du menu contextuel : les 6 intégrations Servarr (Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr, qBittorrent) ne bloquent plus le premier rendu de l'app — elles s'initialisent après coup.

1. Recharge la page (Ctrl+F5, cache vidé) et regarde si le Dashboard apparaît visiblement plus vite qu'avant (pas de mesure précise nécessaire, juste une impression — si tu as les DevTools Performance sous la main et l'habitude de t'en servir, une capture avant/après serait idéale mais optionnelle).
2. Si tu as des intégrations Servarr configurées : vérifie qu'elles affichent bien leurs données normalement (pas de "chargement infini" ni de widget vide qui ne se remplit jamais).
3. Si tu n'as aucune intégration configurée (c'était le cas la dernière fois qu'on en a parlé) : vérifie que les widgets affichent toujours leur message "non configuré" habituel plutôt que de disparaître silencieusement.

---

## Étape 3 — Menu contextuel (clic droit sur une affiche)

Les deux boutons qu'on vient de câbler — jamais testés en vrai.

1. Clique droit sur n'importe quelle affiche (film, série...) dans le Dashboard ou la Bibliothèque.
2. Clique sur **« Ajouter à ma liste »** : vérifie que l'icône marque-page sur la carte se met à jour (devient active/pleine), qu'un toast de confirmation apparaît, et que l'état est bien sauvegardé côté serveur (recharge la page, vérifie que le favori a persisté).
3. Reclique dessus pour vérifier le retrait (bascule dans l'autre sens).
4. Clique droit à nouveau, clique sur **« Marquer comme vu »** : vérifie qu'un toast de confirmation apparaît sans erreur, et que le statut "vu" est bien pris en compte côté Jellyfin (barre de progression, indicateur "vu" ailleurs dans l'app selon ce que Jellyfin affiche normalement).
5. Pendant ces deux tests, garde un œil sur la console (F12) pour toute erreur.

---

## Étape 4 — Thèmes clair/foncé

Les couleurs du mode clair n'ont jamais été validées visuellement — c'est le test le plus susceptible de révéler quelque chose à ajuster.

1. Va dans Réglages → Thèmes.
2. Vérifie que seuls 2 choix apparaissent : "Sombre" et "Clair" (plus les 3 anciens préréglages fantaisie).
3. Bascule sur "Clair" et parcours : Dashboard, Bibliothèque (vue grille et vue liste si les deux existent), une fiche média (menu flottant), le lecteur vidéo, au moins une fenêtre modale (Réglages lui-même, par exemple).
4. Sur chaque écran, cherche spécifiquement :
   - Du texte illisible (trop clair sur fond clair, ou l'inverse).
   - Des zones qui sont restées sombres alors que le reste est passé en clair (signe d'une couleur codée en dur plutôt que liée au thème).
   - Le contraste des affiches/posters sur le nouveau fond clair (est-ce que ça reste agréable à l'œil ?).
5. Rebascule sur "Sombre" et vérifie que rien n'a changé par rapport à avant (c'est censé être strictement identique à l'ancien préréglage par défaut).

---

## Étape 5 — Navigation télécommande / TV

Les correctifs A01 à A07 du Chantier A ont été validés par lint/smoke à l'époque, mais si tu n'as pas encore refait un vrai passage télécommande depuis, c'est le moment. Idéalement sur le device TV réel que tu utilises (pas juste au clavier sur PC), pour tester aussi la manette si applicable.

1. Navigue dans le Dashboard avec les flèches/télécommande — vérifie que le focus se déplace de façon prévisible, sans saut bizarre ni élément "perdu".
2. Ouvre une fiche média (menu flottant) : navigue entre les onglets (Épisodes, À propos, Distribution, Similaires...), vérifie que le focus reste cohérent en changeant d'onglet.
3. Dans le lecteur vidéo : teste les raccourcis (lecture/pause, avance/recul, changement de sous-titre/audio), et si tu as une manette, teste les appuis longs sur les directions (accélération de la répétition — c'est le correctif A06).
4. Teste le bouton Retour/Échap à plusieurs endroits (une modale ouverte, le menu flottant d'une fiche média, un popover audio dans le lecteur) — vérifie qu'un seul niveau se ferme à chaque appui, jamais deux d'un coup.
5. Si tu as accès aux réglages d'accessibité système (réduction des animations), active-le et vérifie que les animations de l'app se réduisent bien (correctif A07).

---

## Étape 6 — Cas limites / ce qui pourrait avoir été affecté par le nettoyage

Ces points n'ont probablement rien à voir avec le nettoyage (rien dans le code moderne ne référençait `scripts/`/`skins/`), mais autant les cocher pendant qu'on y est puisqu'on a touché beaucoup de fichiers cette session.

1. Recherche de sous-titres depuis le lecteur (bouton dans l'OSD) — doit toujours fonctionner (API native Jellyfin).
2. Si tu utilises l'intégration Bazarr — recherche de sous-titres depuis là aussi.
3. Ouvre une Saga/Collection — vérifie que les films qui la composent s'affichent normalement (pas de tri disponible, c'est normal et déjà documenté, pas un bug).
4. Bandes-annonces depuis le menu contextuel ou la fiche média.

---

## Gabarit à me renvoyer

Copie ce tableau (ou le fichier entier) et remplis chaque ligne. `✅ OK` / `❌ Problème` / `⏭️ Pas testé`. Pour toute ligne en ❌, ajoute si possible : ce que tu attendais, ce qui s'est passé, une capture d'écran, et le message d'erreur console s'il y en a un.

**Contexte de test** (à remplir une fois) :
- Device(s) testé(s) : _(PC / TV / mobile — précise le modèle si TV)_
- Navigateur / build : _(dev localhost:3000, ou build de prod servi comment)_
- Compte utilisé : _(admin ou utilisateur standard)_

| # | Test | Résultat | Notes / erreur console / capture |
|---|---|---|---|
| 0.1 | `npm run build` se termine sans erreur | | |
| 0.2 | Le build de prod (`dist/`) charge correctement | | |
| 1.1 | Connexion réussie | | |
| 1.2 | Aucune erreur console au chargement/navigation | | |
| 1.3 | Dashboard affiche tous les widgets habituels | | |
| 2.1 | Dashboard semble se charger aussi vite ou plus vite qu'avant | | |
| 2.2 | Widgets Servarr configurés affichent leurs données | | |
| 2.3 | Widgets Servarr non configurés affichent "non configuré" (pas de disparition) | | |
| 3.1 | "Ajouter à ma liste" : icône + toast + persistance après rechargement | | |
| 3.2 | "Ajouter à ma liste" : retrait fonctionne aussi | | |
| 3.3 | "Marquer comme vu" : toast + statut pris en compte, sans erreur console | | |
| 4.1 | Réglages → Thèmes : seulement "Sombre" et "Clair" listés | | |
| 4.2 | Mode clair : texte lisible partout (Dashboard/Bibliothèque/fiche média/lecteur/modale) | | |
| 4.3 | Mode clair : pas de zone restée sombre par erreur | | |
| 4.4 | Mode clair : contraste des affiches acceptable | | |
| 4.5 | Retour au mode "Sombre" : identique à avant | | |
| 5.1 | Navigation télécommande dans le Dashboard : focus cohérent | | |
| 5.2 | Navigation dans les onglets du menu flottant (fiche média) | | |
| 5.3 | Raccourcis lecteur vidéo (lecture/pause, avance/recul, sous-titres/audio) | | |
| 5.4 | Manette : appui long = accélération progressive de la répétition | | |
| 5.5 | Bouton Retour/Échap : un seul niveau fermé à la fois, partout testé | | |
| 5.6 | Réduction des animations (accessibilité) bien respectée | | |
| 6.1 | Recherche de sous-titres (OSD lecteur) | | |
| 6.2 | Recherche de sous-titres via Bazarr (si utilisé) | | |
| 6.3 | Ouverture d'une Saga/Collection : films affichés normalement | | |
| 6.4 | Bandes-annonces (menu contextuel / fiche média) | | |

**Autre chose remarquée, non listée ci-dessus ?** _(espace libre)_

---

## Résultats du 1er passage réel (1er septembre 2026) et corrections appliquées

### 🔴 Bug critique trouvé et corrigé : plantage en basculant sur le thème clair (4.2)

**Cause :** `ThemeManager.apply()` appelle `settings.set('ui.theme', ...)`, qui ré-émet l'événement `settings:changed` — et `ThemeManager` est lui-même abonné à cet événement pour réagir aux changements de thème. Résultat : `apply()` → `settings:changed` → `apply()` → `settings:changed` → ... jusqu'à `RangeError: Maximum call stack size exceeded`. C'est un bug préexistant dans la logique événementielle (pas quelque chose introduit par l'ajout du mode clair) — il n'avait simplement jamais été déclenché avant que quelqu'un clique vraiment sur un thème depuis Réglages.

**Correctif :** dans `ui/themes/ThemeManager.js`, le handler d'écoute ne rappelle `apply()` que si la valeur reçue diffère du thème déjà actif (`value !== this._current`) — casse la boucle sans changer le comportement normal.

**Vérifié en direct** (navigateur ouvert sur `localhost:3000`, appel direct de `SpaceHub.ui.themes.apply('spacehub-light')` en console) : plus d'erreur, les variables CSS s'appliquent bien (`--sh-bg-base: #f4f4f5`, `data-sh-theme="spacehub-light"`), `node --check`/`lint`/`smoke` passent.

**Point annexe repéré au passage :** l'écran de connexion garde un fond sombre "nébuleuse OLED" fixe même en thème clair — ça a l'air volontaire (image de marque de l'écran de login, indépendante du thème choisi une fois connecté), pas un bug. Dis-moi si tu veux que ce soit aussi clair, sinon je le laisse tel quel.

**À revérifier de ton côté maintenant que c'est corrigé :** refais l'étape 4 (bascule clair/foncé, contraste, zones restées sombres) — c'était bloqué net par ce crash, donc rien n'a pu être vérifié visuellement au-delà du plantage lui-même.

### 🟡 Corrigé : "Marquer comme vu" (3.3) — toast sans effet, pas de retour arrière possible

**Cause :** le correctif précédent appelait bien l'API (`setPlayedStatus`) mais ne gardait aucune trace de l'état sur la carte — impossible de savoir si un média était déjà marqué, donc impossible de l'annuler, et rien à l'écran pour le confirmer.

**Correctif** (`ui/components/CardBuilder.js`) :
- L'état "vu" est maintenant lu dès la création de la carte (`card._isPlayed`, depuis les données natives Jellyfin) et mis à jour à chaque clic.
- Un petit badge ✓ vert apparaît en haut à gauche de l'affiche quand le média est marqué vu (le bouton favori occupe déjà le haut-droite, le badge codec le bas-gauche).
- Le clic sur "Marquer comme vu" / "Marquer comme non vu" dans le menu contextuel bascule maintenant dans les deux sens — le libellé du bouton s'adapte à l'état actuel à chaque ouverture du menu.

**À vérifier de ton côté :** clique droit sur une affiche → le badge doit apparaître/disparaître, et le libellé du menu doit alterner entre "Marquer comme vu" et "Marquer comme non vu".

### ⚪ Expliqué, pas un bug de cette session : erreurs CORS/proxy sur les intégrations (bloc d'erreurs collé en bas de ton fichier)

Deux choses différentes dans ce que tu as collé :
1. **`GET http://localhost:51511/api-proxy?...` → 404.** Le port `51511` indique que tu testais le build de prod servi par `npx serve dist` (ou équivalent), pas le serveur de dev Vite sur `localhost:3000`. Le proxy CORS `/api-proxy` est une fonctionnalité du serveur de dev Vite (`configureServer` dans `vite.config.js`) — il n'existe tout simplement pas quand `dist/` est servi par un serveur statique comme `serve`. Ce n'est pas un bug introduit cette session ; c'est une limite connue de tester le build de prod en local sans un vrai reverse-proxy devant. Pour un déploiement réel, il faudra soit un reverse-proxy qui fait ce rôle, soit revoir ce mécanisme — sujet à part, pas urgent.
2. **`net::ERR_CONNECTION_REFUSED` sur `localhost:8989`, `localhost:5055`, etc.** Ce sont les ports par défaut de Sonarr/Jellyseerr — "connexion refusée" veut dire qu'aucun service n'écoute à cette adresse depuis le poste où tourne le navigateur, pas un bug SpaceHub. Les widgets ont malgré tout affiché leur état "non configuré" côté UI (confirmé par tes réponses 2.2/2.3), donc le mécanisme de repli fonctionne — la console est juste bruyante en dessous.

Rien à corriger ici pour l'instant, sauf si tu veux qu'on rende le fallback plus silencieux en console.

### 🟠 En attente de précisions : navigation télécommande (5.1 à 5.6, tout en échec)

Les 6 tests de la section 5 sont tous ressortis en échec ("complètement bugué", "pas bon"), mais la section "Contexte de test" en haut du gabarit n'a pas été remplie — je ne sais pas sur quel device (PC clavier, vraie télécommande TV, manette) ni quel navigateur/build ça a été testé. Sans ça je ne peux pas cibler le bon correctif : les correctifs A01-A07 du Chantier A n'avaient jusqu'ici été validés qu'au niveau code (`lint`/`smoke`), jamais en conditions réelles — donc il est tout à fait possible que ce soient de vraies régressions jamais détectées avant ce test, mais "complètement bugué" partout à la fois (Dashboard, onglets, lecteur, manette, Échap, animations) est assez large pour aussi évoquer autre chose (ex. pas de retour visuel de focus au clavier sur PC, différent d'un vrai test télécommande TV).

**Avant d'aller plus loin, il me faudrait pour au moins un des points 5.1-5.6 :** le device exact utilisé, et pour un cas précis (par exemple 5.1, la navigation dans le Dashboard) — ce que tu attendais vs. ce qui s'est vraiment passé (l'élément ne bouge pas du tout ? il bouge mais on ne voit pas où est le focus ? il saute à un endroit inattendu ?).

**Réponse obtenue :** testé au clavier sur PC ; le focus se déplace bien (confirmé en rejouant les touches), mais rien à l'écran n'indique où il se trouve.

### 🔴 Bug trouvé et corrigé à partir de cette réponse : l'indicateur de focus n'existe que sur les affiches et le hero, nulle part ailleurs

**Cause confirmée par le code :** `SpatialNavigation.setFocus()` ajoute bien les classes `.sh-focus-active`/`.sh-tv-focused` à *tout* élément qui reçoit le focus logique (barre latérale, boutons, filtres, onglets, champs...) — la logique de déplacement du focus fonctionne. Mais en cherchant dans tout le code où ces classes ont un style visuel associé, seuls deux fichiers en définissent un : `CardBuilder.js` (les affiches — effet de zoom/lift déjà en place) et `HeroSpotlightComponent.js` (le bandeau hero). **Partout ailleurs dans l'app — sidebar, Réglages, filtres de bibliothèque, onglets du menu flottant, boutons de modale — le focus se déplaçait sans jamais rien afficher.** Ça correspond exactement à ta description : ça bouge, mais c'est invisible.

**Correctif** (`ui/design-system/tokens.css`, feuille de style globale) : ajout d'un contour de focus générique (`outline`, couleur liée au thème actif) appliqué à tout élément portant `.sh-focus-active`, sauf les affiches et le hero qui gardent leur propre effet déjà en place (pas de double traitement).

**Validation :** `npm run lint`/`npm run test:smoke` passent. Je n'ai pas pu faire de vérification visuelle en direct sur ce correctif précis (l'outil de navigateur intégré était temporairement indisponible au moment de finaliser) — contrairement au correctif du thème clair, celui-ci n'a donc été vérifié qu'au niveau du code, pas encore en conditions réelles.

**À revérifier de ton côté :** refais 5.1 (navigation clavier dans le Dashboard) — tu devrais maintenant voir un contour lumineux se déplacer sur la sidebar, les boutons, les filtres, en plus de l'effet déjà existant sur les affiches. Si c'est bon, reteste aussi 5.2 à 5.6 dans la foulée : plusieurs de ces échecs (onglets du menu flottant, bouton Retour/Échap) pourraient avoir la même cause — on ne verra que maintenant si la logique de déplacement elle-même a un souci séparé, une fois qu'on peut enfin voir où est le focus.

---

*Rédigé le 1er septembre 2026, en complément de `PLAN_CHANTIERS_BCD_2026-09-01.md`, `PLAN_ACTION_AUDIT_2026-09-01.md` et `AUDIT_SPACEHUB_2026-09-01.md`.*
