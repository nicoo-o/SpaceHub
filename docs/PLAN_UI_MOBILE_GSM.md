# Plan — UI/UX mobile (GSM) pour l'APK SpaceHub

*Plan élaboré le 11 septembre 2026 avec les skills `vercel-composition-patterns`,
`web-design-guidelines`, `frontend-design`, `performance`, `accessibility` et
`writing-plans`, plus recherche web (Material 3 navigation bar, WebView Android,
Cordova). **Statut : réalisé.** Le bilan vit dans `docs/UI_MOBILE.md` ; ce
document conserve le raisonnement d'origine.*

## Constat (vérifié dans le code au 11 septembre 2026)

- **Le dock « Dynamic Island » n'a aucun chemin d'ouverture tactile** : il se
  déploie au `mouseenter`/`mouseleave` et au focus clavier. Un tap n'est ni
  l'un ni l'autre → sur GSM, les onglets Bibliothèques/Flux et le menu
  utilisateur sont quasi inatteignables ; les 9 règles `:hover` d'`AppLayout.css`
  collent après tap.
- **Aucune barre basse n'existe** (seul un commentaire `scroll-padding-bottom:
  88px` l'évoque).
- **`TouchEngine` fait déjà le geste natif** (swipes entre vues,
  pull-to-refresh, cibles 48 px, visualViewport) mais rien n'est pensé pour lui.
- **Aucun pont Cordova** : `cordova.js` n'est référencé nulle part, aucun
  `deviceready`/`backbutton` — le bouton retour système tue l'app même avec une
  modale ouverte.
- **Anti-pattern WIG confirmé dans `index.html`** : `maximum-scale=1.0,
  user-scalable=no` (zoom bloqué) ; champs sans `autocomplete` ; aucun
  `-webkit-tap-highlight-color`.
- Drift de version : `build/cordova/config.xml` = 1.2.0, `package.json` = 1.3.0
  (résolu depuis : la version dérive de `package.json`).

## Direction retenue (décisions utilisateur)

**GSM = barre basse + en-tête compact** (rendu PC et TV inchangé) ; **retour
Android** ferme les couches une à une puis **quitte l'app**. Pilotage par
**profil d'appareil déclaratif** (`html.sh-gsm` + media queries), jamais par
booléens dispersés — règle `architecture-avoid-boolean-props` : un composant ne
reçoit pas « estGsm » en paramètre, il existe un **variant explicite**
(`patterns-explicit-variants`) de la coquille, et un **seul fournisseur** qui
sait comment l'appareil est détecté (`state-decouple-implementation`).

## Les cinq étapes (toutes réalisées — voir docs/UI_MOBILE.md pour le bilan)

### Étape A — `core/ProfilAppareil.js` : le socle déclaratif
Branche `core/profil-appareil`. Module pur, injections étroites (méthode du
ledger) : `matchMedia`, `userAgent`, `window.tizen` injectables. Ordre de
détection : 1) plateformes TV de `TelecommandeTv` (le piège : l'UA d'Android TV
contient « Android ») ; 2) `(hover: none) and (pointer: coarse)` + UA Android
(téléphone **ou tablette**) ⇒ GSM ; 3) sinon bureau. Pose `html.sh-gsm` avant
le premier render, réécouté (`change` matchMedia) pour les écrans pliables,
forçage réglage `ui.forceProfil` branché sur `settings:changed` (même esprit
que `ui.tvMode`). 23 tests dont la cohérence verrouillée des deux listes de
plateformes TV.

### Étape B — Navigation GSM : barre basse M3 + en-tête compact
Branche `ui/gsm-nav`. Variants explicites : `ui/layouts/BarreNavigation.js`
(barre Material 3 — spécification vérifiée : 3–5 destinations, fenêtres <
600 dp —, pilule indicatrice en transform, `data-view` existants → `navigate()`
inchangé) et `ui/layouts/EnTeteCompact.js` (titre, recherche, avatar → menu en
**modale-feuille** via la classe `Modal`, confinement focus/Retour/aria déjà
gérés ; contenu échappé). Sélection du variant par `AppLayout` au render, hors
GSM le dock actuel reste seul. Les 9 règles `:hover` reçoivent une garde
`(hover: none)` dans `GsmNav.css` (anti sticky-hover). Sélecteurs enregistrés
dans `core/DomContracts.js` (CHROME_PERSISTANT) → `nav-contract-check` et
`focus-containers-check` couvrent la coquille GSM d'office. Budget poids
démarrage 270 → 276 ko gzip (le CSS GSM est bloquant au premier rendu, choix
assumé contre un flash d'interface PC). 17 tests.

### Étape C — Confort tactile : la checklist WIG appliquée
Branche `ui/gsm-formes`. Retrait de `maximum-scale=1.0, user-scalable=no` +
`viewport-fit=cover` ; `-webkit-tap-highlight-color: transparent` et
`overscroll-behavior-y: contain` posés intentionnellement (le pull-to-refresh
custom coupe le natif) ; `100dvh` sur le conteneur racine ; champs ≥ 16 px sous
pointeur tactile (moins de 16 px fait ZOOMER le clavier Android au focus) ;
toute modale devient une feuille ancrée bas, pleine largeur, 88vh contenue avec
défilement interne ; cibles 48 px étendues au tiroir, au menu GSM, aux
réglages, au dropdown. Tout gardé par `(hover: none) and (pointer: coarse)` ou
scopé `html.sh-gsm` : rendu PC/TV inchangé.

### Étape D — Socle APK : pont Cordova, retour Android
Branche `build/apk-gsm`. `core/PontAndroid.js` : silencieux hors APK (sans
`window.cordova` : aucune écoute, aucun effet) ; en APK, `deviceready` arme le
pont, `backbutton` ferme la couche du dessus via le MÊME pipeline que la touche
Retour TV (`SpatialNavigation.demandeRetour()`, nouvelle API publique — le pont
ne peut pas appeler une méthode `_privée`, contrat de façades), sinon double
appui averti en 2 s puis `navigator.app.exitApp()`. Injection
`<script src="cordova.js">` dans **www/ seulement** par `preparer-bobines.mjs`
(zéro impact web, pas de 404) ; `AndroidWindowSoftInputMode=adjustResize` ;
versionName/versionCode déjà dérivés de `package.json` (le drift 1.2.0/1.3.0
était un résidu). Garde CI dans le smoke packaging : cordova.js présent, balise
injectée, préférence clavier. Budget `SpatialNavigation` 1750 → 1775 (+25
lignes d'API publique, justifié au commit).

### Étape E — Preuves croisées et documentation
Branche `test/gsm-e2e`. Passe e2e mobile dans `scripts/e2e.mjs` : six scénarios
« GSM — » en viewport 412×915 + `hasTouch` + UA Android (profil posé, connexion
sans zoom, zéro erreur JS, coquille rendue et dock masqué, navigation réelle
par la barre, pont inactif sans casser la page) — les 30 scénarios bureau
restent intacts, total 36/36. Contrôle statique `npm run test:gsm`
(`scripts/verifier-gsm.mjs`, ajouté à la chaîne `test`) : viewport sans
anti-pattern, classes CSS GSM croisées au JS, garde hover, `dvh`, cibles 48 px.
Documentation : `docs/UI_MOBILE.md` (décisions + grille d'acceptation sur vrai
GSM), `docs/ARCHITECTURE.md` (section profils), entrées CHANGELOG par PR.

## Ordre de fusion et recette

Fusion séquentielle **A → B → C → D → E** (B et C touchent AppLayout —
empilement sans conflit). Chaque PR : `npm run verify` vert. AppLayout 724 →
829 lignes (plafond défaut 1200). **Recette réelle** : émulation Chrome DevTools
(device mode) sur `dist/`, puis APK signé via le workflow Paquets, acceptation à
la main sur un vrai GSM avec la grille de `docs/UI_MOBILE.md`.

## Risques connus et parades (tous traités)

- **Insets safe-area incohérents dans la WebView Android** (bug Chromium
  396827865 documenté) → replis px fixes partout, `env()` en amélioration
  uniquement, vérification device.
- **Sticky hover / tap fantôme** → gardes `(hover: none)` + `touch-action` +
  e2e mobile + contrôle statique.
- **`cordova.js` en 404 sur le web** → injection uniquement à l'empaquetage +
  garde CI (leçon des artefacts silencieux de la v1.3.0).
- **Retour Android piégeux** (fermer l'app pendant une modale) → réutilisation
  du pipeline TV éprouvé, pas une nouvelle logique.
- **Poids du CSS GSM** → mesuré au commit (270 → 276 ko gzip, budget verrouillé
  par `test:poids`).

## Hors périmètre (propositions ultérieures)

Plugins Cordova natifs (statusbar/vibration — `navigator.vibrate` marche déjà),
paysage dédié du lecteur, offline avancé APK, support iOS.
