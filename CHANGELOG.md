# Changelog

All notable changes to SpaceHub are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `CONTEXT.md` : le vocabulaire du domaine, avec les termes de la navigation
  (scope, couche, mémoire de focus, redirection déclarative, intention) et ceux de
  la méthode d'approfondissement (peau, ledger, budget, façade). Le fichier fixe le
  mot juste pour que les revues d'architecture ne réinventent pas trois synonymes
  par concept.
- `docs/IDENTITE_VISUELLE.md` : la direction visuelle — héritée du système déjà
  déclaré, et mesurée. Ses jetons sont consommés entre 0 et 2 % du temps (0 usage
  de l'échelle typographique, 3 de la gamme d'accent, 6 des couleurs sémantiques)
  pendant que 566 couleurs, 407 tailles, 288 graisses et 390 rayons sont écrits à
  la main. La contribution porte sur la typographie, seul endroit sans identité.
- `docs/identite-visuelle/planche.html` : la planche de revue autonome — déclaré
  contre livré, les deux températures, trois distances de lecture, l'élévation sur
  noir. Hors de toute chaîne de contrôle, comme le reste de `docs/`.
- `core/HistoriqueVues.js` : la mémoire du bouton retour système. Le pont
  Android ne connaissait que deux issues — fermer une couche, ou proposer de
  **quitter** l'application. Retour depuis l'onglet Flux demandait donc
  confirmation de sortie alors que l'utilisateur voulait revenir à sa
  bibliothèque. Le module est une piste + une position (modèle du navigateur,
  pas une pile naïve : sans lui, Retour oscillerait entre deux onglets sans
  jamais proposer de sortir), pur, borné à 20 entrées, et testé par sept cas.
- Les instruments qui mesurent l'acquis, sans lesquels cette passe ne serait
qu'une déclaration : `scripts/systeme-design-check.mjs` confronte ce qui est
DÉCLARÉ à ce qui est CONSOMMÉ — 18 plafonds, 6 planchers, calés sur la mesure
du jour —, `scripts/plancher-navigateur-check.mjs` refuse une fonction livrée
au-delà du WebView du parc (Chromium 108, celui des téléviseurs),
`scripts/modules-testes-check.mjs` refuse un module de `core/` que rien
n'importe dans les tests, et `scripts/fraicheur-dist.mjs` refuse de mesurer un
`dist/` plus vieux que ses sources : l'e2e et la pesée jouaient un autre code
que celui qu'on venait d'écrire, et rendaient un verdict faux dans les deux
sens. La couverture a désormais des planchers déclarés (21 / 17 / 20 / 21) et
échoue si elle descend. Chaque cliquet a été vu mordre avant d'être committé.

### Changed
- Les listes `transition` ne nomment plus une propriété qui ne change jamais.
  **167 déclarations** désignaient `box-shadow` ou `filter` sans qu'AUCUN état
  ne change la valeur : elles n'ont jamais rien animé. C'est la même famille que
  les 47 transitions mortes du postmortem, en plus discret — celles-là n'étaient
  pas *invalides*, seulement *inutiles*, et rien ne les voyait : ni la recette,
  ni le navigateur, ni un relecteur. Le compte passe de **145 → 66** (ombres) et
  **79 → 18** (flous), et le cliquet refuse la remontée. La mesure ne lit pas la
  liste : elle compare les valeurs EFFECTIVES de la propriété entre l'état de
  base et ses états (`:hover`, `:active`, `:focus`, `.visible`, `--ouvert`…),
  pseudo-éléments gardés à part — `X::before` est un AUTRE élément que `X`.
  Ce filet a rattrapé trois erreurs de sa première version : le `filter` du
  popover global, des menus déroulants et de l'île sont bel et bien animés, et
  ils auraient été supprimés sans lui.
- Les courbes d'animation déclarées remplacent le `ease` nu du navigateur :
  **753 → 0**. 747 transitions consomment `var(--sh-ease-out)` — plus franche
  au départ que `cubic-bezier(0.25, 0.1, 0.25, 1)`, celle qui étire exactement
  le moment que l'œil regarde — et 6 animations sans fin passent à `linear`
  (une courbe d'accélération sur une boucle produit un à-coup à chaque tour).
  Aucun `ease-in` nu n'existait, et il n'y en a toujours pas.
- Les quatre teintes système Apple (`#ff453a`, `#32d74b`, `#64d2ff`,
  `#ff9f0a`) deviennent des jetons : 80 écritures en clair en moins, pixels
  identiques puisque ces couleurs ne changent pas d'un thème à l'autre. Le
  halo de sélection suit en revanche `--sh-focus-ring` — le seul des quatre
  redéfini en thème clair, où l'orange vif ne tient pas le contraste : les
  copies en dur gardaient l'orange de nuit sur fond blanc. Quatre triplets
  `-rgb` sont déclarés au passage, ce qui donne enfin un chemin à l'alpha
  (49 `rgba(255, 159, 10, …)` étaient écrits à la main).
- 202 déclarations `border-radius` rejoignent les paliers déclarés : 447 → 243
  littéraux, et 3 → 205 usages des jetons. Mesure corrigée au passage : le
  compteur d'origine était faux de 202 — son regard négatif `(?!var\()` placé
  après un `\s*` ne filtrait rien, puisqu'une `\s*` peut se réduire à zéro
  caractère et laisser voir l'espace qui suit. Les rayons qui consommaient
  déjà le jeton étaient comptés comme écrits à la main.
- L'échelle typographique déclarée est enfin consommée : les `font-size` et
  `font-weight` littéraux passent de 448 et 316 à **100 et 83**, et le cliquet
  refuse les 348 autres. Deux règles mécaniques, aucune mise en page revue :
  un littéral qui vaut EXACTEMENT un échelon devient ce jeton (152 tailles,
  233 graisses — aucun pixel ne bouge), et tout ce qui est sous le plancher de
  12 px remonte à `--sh-text-xs` (196 déclarations, de 7 à 11,5 px). Le barème
  lui-même commence désormais à 12 px — il déclarait 11 — et gagne la marche
  800, absente alors que 41 déclarations l'employaient. Les valeurs
  intermédiaires restantes (12,5 · 13,5 · 14 · 16 · 18 · 20…) demandent un
  arbitrage par mise en page : elles sont comptées, pas devinées.
- Le retour système essaie désormais trois choses DANS CET ORDRE : fermer une
  couche ouverte, revenir à l'onglet précédent, puis proposer la sortie
  (deux appuis en 2 s pour confirmer). `AppLayout.retourVue()` est publique
  pour la même raison que `demandeRetour()` — le pont ne peut pas atteindre un
  champ privé, et l'audit des façades refuse ces atteintes.
- L'expansion tactile ne couvrait que sept des dix-sept familles qui annonçaient
`min-height: 38px` : `verifier-gsm` vérifiait la PRÉSENCE d'une règle à 48 px,
pas sa PORTÉE — il passait pendant que dix familles restaient sous la cible.
Elle couvre maintenant toute la liste, et sans `z-index`, qui faisait capter au
bouton la cible de son voisin. Au même endroit, un tap ne produisait rien de
visible : le dépôt a un `-webkit-tap-highlight-color: transparent` et n'avait
rien mis à la place. Dix-sept familles répondent en 120 ms
(`transform: scale(0.97)`, qui emporte le libellé et l'icône — c'est ce qui
rend la presse physique), la barre d'état d'Android prend la couleur de
l'application (`theme-color`, `color-scheme`), et les modales se mesurent en
`dvh`, que la barre gestuelle du téléphone ne mange plus.
- La typographie vient de la plateforme, et le jeton le dit enfin.
  `--sh-font-family` déclarait `'SF Pro Display', 'Inter'` : SF Pro n'était
  chargée nulle part (aucun `@font-face`) et Inter venait d'une feuille Google
  bloquante au démarrage. Le retrait est décidé par la mesure — le démarrage
  est à 274,4 ko gzip pour un plafond de 276 ko, et une police d'interface
  auto-hébergée en pèse trente à soixante. Ce qui part avec elle : une requête
  tierce bloquante, deux origines ouvertes dans la CSP, et une dépendance
  réseau dans une application qui doit démarrer sans DNS (APK, téléviseur).
  Le harnais e2e filtrait déjà ses échecs comme du bruit attendu.
- Chiffres alignés (`font-variant-numeric: tabular-nums`) sur tout l'arbre :
  dans une interface où presque tout ce qui bouge est un nombre — durées,
  compteurs, pourcentages, horloge — les chiffres proportionnels font sauter
  le texte d'un pixel à chaque seconde.
- Six feuilles réécrivaient leur propre pile de polices à côté du jeton, dont
  une avec un `!important` ; elles consomment `--sh-font-family` ou
  `--sh-font-family-mono`. Deux compteurs les gardent : familles déclarées
  hors du fichier de jetons (0) et références à une origine de police externe
  (0).
- Vingt-cinq déclarations `text-transform: uppercase` quittent quatorze
feuilles. La casse n'est pas de la décoration : sur une étiquette de
métadonnée — un codec, un genre, un statut — les capitales donnent à lire des
mots qui ne sont plus des mots, avec un interlettrage d'autant plus coûteux que
le texte est petit (une étiquette de codec à 9 px, graisse 800, capitales et
interlettrage, posée sur une affiche). Elle sert une structure (un en-tête de
colonne) ou un contrôle ; les deux exceptions sont nommées dans le contrôle,
avec leur raison.

### Fixed
- `var(--sh-color-danger, #ff5c7a)` portait un repli qui **contredisait** le jeton
  (`#ff453a`) : trois déclarations qui décrivaient une couleur qui n'existait nulle
  part. Un repli qui n'est pas la valeur du jeton n'est pas une sécurité, c'est une
  deuxième vérité — qui ne se déclenche jamais, jusqu'au jour où elle se déclenche.
- Le compte des rayons de `scripts/systeme-design-check.mjs` était faux de 202 : le
  regard négatif `(?!var\()` placé après `\s*` ne filtrait rien, puisqu'une `\s*` peut
  se réduire à zéro caractère et laisser voir l'espace qui suit. Les déclarations qui
  consommaient déjà le jeton étaient comptées comme écrites à la main.
- `core/SpaceHub.js` lisait `appLayout?._spatialNav?._gamepad` — DEUX champs
  privés traversés (ceux de la coquille puis ceux du moteur) pour une valeur
  que le contrat expose (`getGamepad()`) et que les tests couvrent déjà.
- Le repli `prefers-reduced-motion` réduisait toute transition à `0.01ms`, ce qui
  éteignait aussi les fondus qui **expliquent** un changement d'état : sous
  mouvement réduit, une modale ou un toast apparaissait sans aucun signal. Il
  remplace désormais la **liste des propriétés** au lieu d'annuler leur durée —
  le déplacement cesse d'être animé, l'opacité et les couleurs continuent de se
  fondre doucement. Moindre et plus doux, pas nul.
- Le curseur de la barre de lecture naissait à `scale(0)` — un point sans
  dimension. Rien n'apparaît à partir de rien : il part de `scale(0.6)` et se
  fond en même temps.
- Huit attributs `data-*` étaient écrits dans le DOM et lus par personne —
`data-library-id`, `data-onboarding-role`, `data-request-id`, `data-task-id`,
`data-nav-role`, `data-instance-id`, `data-locked-reason`, `data-modal-close` :
l'audit manuel en avait vu quatre, le nouveau contrôle quatre de plus. Rien ne
les surveillait, et ils ne se voient pas en recette : ils font croire que
quelque chose est branché. C'est la forme DOM du motif des 47 transitions
mortes, et `gabarits-identifiants-check.mjs` tient maintenant les DEUX sens —
un attribut sans lecteur, un sélecteur `[data-x]` sans écrivain (les points
d'extension publics sont nommés, pas tolérés).

## [1.4.0] - 2026-09-11

### Added
- Mobile (GSM) shell for the Android APK: a device-profile module detects
  phone/tablet/desktop (TV first — the Android TV UA contains "Android")
  and tags the document root; the app shell swaps to an explicit mobile
  variant — a Material 3 bottom navigation bar (3 destinations reusing the
  existing views) plus a compact header whose avatar opens the user menu
  in a bottom-sheet modal. Desktop and TV rendering are unchanged.
- Android back button now walks the same layer stack as the TV remote's
  Back key (media sheet, settings, search, …) instead of killing the app;
  with no layer open, a warned double-press exits. The bridge
  (`core/PontAndroid.js`) is silent outside the APK — the web and Electron
  builds ship without `cordova.js` and without any listener.
- Mobile e2e pass: six scenarios run the critical path in a 412×915
  touch viewport (profile tag, no keyboard zoom, shell rendered with the
  desktop dock hidden, real bottom-bar navigation, bridge inert without
  Cordova). Desktop scenarios unchanged — 36/36 green.
- Static GSM invariants check (`npm run test:gsm`, part of `npm test`):
  viewport must not disable pinch-zoom, every GSM CSS class must be emitted
  by the JS, the anti-sticky-hover guard must exist, root must use `dvh`,
  and 48 px touch targets must cover the whole mobile shell.
- Documentation: `docs/UI_MOBILE.md` (decisions + on-device acceptance
  checklist) and `docs/PLAN_UI_MOBILE_GSM.md` (the original plan, kept for
  its reasoning).

### Changed
- Viewport meta no longer disables zoom (`user-scalable=no`/
  `maximum-scale` were a listed anti-pattern; pinch-zoom is an
  accessibility need) and adds `viewport-fit=cover` for notches.
- All modals render as full-width bottom sheets with contained internal
  scrolling on touch-pointer devices — the native phone gesture.
- APK: `cordova.js` is injected into the packaged `www/` only (no web
  impact, guarded in CI), and the keyboard now resizes the WebView
  (`adjustResize`) instead of panning the page.

### Fixed
- Inputs under 16 px made Android zoom the page on focus; touch-target
  expansion (48 px) now also covers sidebar items, settings rows, the user
  dropdown and the whole mobile shell.
- `100vh` included the area reserved by the Android gesture bar; the root
  container now uses `100dvh` so splash and shell no longer overflow.

## [1.3.0] - 2026-09-10

### Added
- TV acceptance protocol (`docs/ACCEPTATION_TV.md`): the manual session
  that covers what no automated test can — sideloading the release APK over
  ADB, the LEANBACK launcher entry and banner on the real TV home screen,
  and the 12-point remote-navigation checklist (D-pad focus, OK/Back
  behavior, playback keys, sleep/wake), with a dated session journal.
- CSS hygiene check tightened: the transition rule now guarantees the
  *position* of `!important`, not a count — a **single** mid-value
  `!important` (equally declaration-killing under vite 8), a declaration
  closed by `}` without a final semicolon, and vendor-prefixed
  `-webkit-transition` were all invisible to the previous two-exclamation
  regex and are now rejected, per declaration.
- Animation proof extended to the other repaired surfaces: two new e2e
  scenarios assert the modal slide-up sheet animates on open *and* close
  (panel transform + overlay opacity, driven by the real `open()`/`close()`
  methods) and the app-layout dynamic island animates on deploy *and*
  collapse (width + view opacity, triggered by real pointer hover) — same
  technique as the widget scenario: computed declaration alive first,
  per-frame distinct-value sampling, final-state assertions. Suite is now
  30 scenarios.
- Packaging smoke test in the CI chain: the Android bobine is built for
  real and `cordova platform add android@15` runs with the banner and
  LEANBACK checks against `config.xml`, so a packaging mistake now fails in
  the CI chain instead of surfacing at release time.
- Postmortem of the 47 dead transitions (`docs/POSTMORTEM_47_TRANSITIONS.md`):
  how invalid CSS survived for months, why no test saw it, what vite 8
  exposed, and the three guards that now prevent recurrence.
- The CSS hygiene check is pinned by its own vitest suite: every rule is
  exercised against fixture files — embedded style blocks, orphan sheets,
  frozen shadows, GPU caps, keyframe orphans, loop tokens, and the
  `!important` rule — so each rule runs in the unit chain instead of being
  verified by hand.
- Windows auto-update (Electron): electron-updater against the GitHub
  provider, a check at startup then every 6 h with jitter, background
  download and install on quit, `latest.yml` plus blockmaps attached to
  each release, and a settings opt-out (“Mises à jour automatiques”).
- Optional Authenticode signing for the Windows builds: the `win.sign`
  Azure Artifact Signing profile is wired into the packaging bobine and the
  workflow gained a `Get-AuthenticodeSignature` verification gate. With the
  secrets absent the unsigned build keeps working; with them present a
  NotSigned deliverable is an outright failure.
- Real public APIs on VideoPlayer — `videoElement` and `queue` — replacing
  the documented `_video`/`_queue` facade tolerances, which are demoted from
  the contract to history.
- Monolith reach-in audit (`docs/AUDIT_MONOLITHES.md`): SettingsPanel,
  SpatialNavigation and ModalSlideUpSheet examined for callers reaching
  past their surface, with a facade contract added only where one is
  warranted (SpatialNavigation), backed by `tests/FacadeNav.test.js`.
- `scripts/triage-tv.mjs`: one command to pull filtered logcat (ANR, fatal,
  SpaceHub) and screencaps off a TV over ADB, so acceptance triage stops
  being a manual ritual.
- Bootstrap keystore routine, documented in `docs/PROMOTION_KEYSTORE.md` and
  watched by `scripts/verifier-amorcage-keystore.mjs` plus a scheduled
  `veille-keystore.yml` that warns when the artefact is within 7 days of its
  30-day retention expiry.

### Changed
- The `!important` position rule now covers **every** property declaration,
  not only `transition`: a mid-value `!important` in a `margin` is rejected
  exactly like one in a `transition`, after first proving the codebase
  contained zero legitimate non-terminal occurrences.
- VideoPlayer decomposition completed. Steps 3 to 7 moved the next-episode
  countdown, the popovers and content draw, control visibility (OSD), the
  Jellyfin session reporting and the source loading into five satellite
  modules, each with its own unit suite; the monolith drops from 2524 to
  2212 lines, and one-line delegation stubs keep every public member and
  call site unchanged.
- SyncPlay and Cast tests follow the new public APIs instead of the removed
  facade tolerances.

### Fixed
- The packaging workflow could not run at all: `secrets` is not an allowed
  context in a workflow `if:`, which made the whole file invalid and turned
  every trigger into a zero-job run. The signature gate and its companion
  reminder now read the secrets through `env`.
- The bootstrap keystore was copied outside the path the upload step was
  watching, and `if-no-files-found: ignore` silenced it — two “green” runs
  published a signing fingerprint without ever uploading the key, which is
  how the v1.2.0 signing key became unrecoverable. The path is fixed and the
  upload step now fails loudly (`if-no-files-found: error`) whenever a
  bootstrap key is expected.
- The `ANDROID_KEYSTORE` secret was never decoded: it only acted as a flag,
  so once it was set the ephemeral key generation was skipped and the build
  was handed a keystore file nobody had written. The documented promotion
  path therefore could not work — it broke the build instead of signing with
  the permanent key. The base64 is now decoded in the throwaway build
  directory behind a `keytool -list` gate that fails with an actionable
  message when the store is unreadable.

## [1.2.0] - 2026-09-10

### Added
- Decision doc for signed Windows builds and auto-update
  (`docs/SIGNATURE_WINDOWS_ET_AUTO_UPDATE.md`): certificate options
  evaluated against this repo's Linux-CI, single-maintainer reality
  (recommended: Azure Artifact Signing public profile, ~$10/month), how
  SmartScreen reputation actually builds, and the ordered plan — sign
  first, then wire NSIS auto-update with signature verification and a
  user-facing opt-out.
- VideoPlayer decomposition step 2: the four pure helpers (time formatting,
  HTML escaping, URL sanitizing, button spring animation) moved to
  `jellyfin/player/UtilitairesLecteur.js` with a focused unit suite;
  delegation stubs keep every internal call site unchanged. Monolith budget
  lowered 2537 → 2524 in the same change.
- Caller-side facade enforcement: a CI check (`test:facade-appelants`) fails
  when any file outside `jellyfin/player/` reaches a `VideoPlayer` member
  outside the contract — the mirror of the class-side facade test. Both
  guards now read one shared surface (`jellyfin/player/ContratFacade.js`,
  25 members incl. documented tolerances `_video`, `_queue`,
  `_playbackOptions`), so the decomposition cannot be silently broken from
  the caller side either.
- Decomposition ledger for `VideoPlayer.js` (`docs/DECOMPOSITION_VIDEOPLAYER.md`):
  landed steps 0–1 with their commit references, the confirmed extraction
  order for the remaining steps, and the non-negotiables of the method.
- CSS hygiene check: `transition` declarations carrying more than one
  `!important` — the mid-value pattern that vite 8's stricter parser exposed
  (and that had silently disabled 47 widget transitions) — are now rejected
  in CI, per declaration, so multi-line transitions cannot slip through.
- PROJECT_STATUS: the CSS sheet count in the validation table was stale
  (32 → 33).

## [1.1.0] - 2026-09-09

First installable release. The web archive is joined by an Android APK
(Cordova WebView, phone and Android TV launcher) and Windows executables
(Electron NSIS installer + portable) — all built only after the same
verification chain is green, named like the tag, checksummed.

Underneath, the build toolchain moved a generation: Vitest 5 and Vite 8 —
inseparable majors, since vitest 5 peers on vite ≥ 6 — with all 34 suites
passing unmodified, and rolldown's stricter CSS parsing exposing that 47
`transition` declarations had carried an invalid mid-value `!important`:
browsers dropped them whole, so those hover/motion transitions had **never
animated**. They were repaired and a new e2e scenario now proves the
animation frame by frame (45/49/73 intermediate transform values). The
VideoPlayer decomposition also started: the media-segments logic left the
monolith behind an unchanged facade, with the size contract tightened in
the same commit.

### Added
- Continuous integration: the full verification chain runs on every push and
  pull request; builds of `main` are published as downloadable artifacts.
- Automatic releases: pushing a `v*` tag runs the same chain, then attaches
  the build to a GitHub Release.
- File-size contract on the seven largest modules (`npm run test:taille`):
  they no longer grow; new features go into new modules.
- Changelog convention: release notes are written here, not generated from
  commit lists.
- Two-generation e2e in CI: the pinned Chromium (playwright 1.62.1) remains
  the validated baseline, and a canary job runs the same suite on the latest
  Playwright Chromium so browser drift is seen before it bites.
- Dependabot on the GitHub Actions and npm ecosystems, weekly: minor and
  patch updates grouped per ecosystem, majors kept separate; every update
  goes through the same verification chain as human code.
- Changelog reminder on pull requests: a PR touching app code must also
  touch this file, or carry the `no-changelog` label; the check is
  dependency-free and fails in seconds.
- CI resilience: browser-install steps retry up to five times with an apt
  cleanup between attempts, so a drifting mirror (e.g. `Hash Sum mismatch`
  on dl.google.com) fails the build no more.
- Native packages: the `Paquets` workflow builds, for every `v*` release
  and on demand, an Android APK (Cordova WebView embedding the app,
  phone and Android TV launcher) and Windows executables (Electron NSIS
  installer + portable). Both run only after the Release chain is green,
  are named like the tag, carry SHA-256 checksums, and attach to the
  release. Icon set is rasterized from `public/icone.svg` by a
  dependency-free renderer; the embedded build is rebuilt with relative
  paths so the same code also boots from `file://`.
- E2E proof that the repaired CSS transitions actually animate: the new
  scenario performs real hovers (one pointer, sequential, with a never-broken
  witness) and counts distinct transform values per frame — 45/49/73
  intermediate steps where the invalid mid-value `!important` declarations
  had always produced a single jump.

### Changed
- VideoPlayer decomposition started: the media-segments logic (acquisition,
  intro resolution, skip priority) moves to `jellyfin/player/SegmentsMedia.js`
  behind an unchanged facade; the monolith budget drops 2578 → 2537 in the
  same commit. Every existing method still answers, now as delegation.
- Test and build toolchain migrated to Vitest 5 and Vite 8 (vitest 5
  requires vite ≥ 6 as a peer, so the two majors move together): all 34
  suites / 561 tests pass unchanged, builds emit through rolldown, and
  the startup budget moves 258 → 270 kB gzip to absorb the toolchain
  delta — same application code, still 45 % lighter than before wave 1.
- jsdom, the DOM layer under every DOM-touching unit suite, jumped 25 → 30:
  zero test files needed modification, the config used only current-API
  options, and the suite surface (`vi.fn`, `vi.spyOn`, fake timers) is
  stable across the jump — verified against all 561 tests after a clean
  install.
- License unified to GPL-3.0 (package.json, README badge, LICENSE), with the
  upstream KefinTweaks MIT notice preserved in LICENSE.
- README rewritten as an English home page: install from Releases, platform
  matrix (PC, Android, Android TV, Tizen, webOS, Xbox), SDK section.
- Two e2e focus-ring measurements restored on recent Chromium (151+): a
  suppressed outline now reports residual width and color; the honest
  discriminator is `outline-style`, and real regressions still fail.
- CONTRIBUTING.md rewritten against the current architecture; the hardware
  acceptance doc gained an executable one-TV session runbook.

### Fixed

- Packaging: the first `Paquets` run on v1.1.0 produced no artifacts — the
  Cordova build read `release` as a platform name instead of the `--release`
  flag (and its piped output masked the failure), and the Windows job ran a
  bash-only step under PowerShell. Both fixed; a failed native build now
  fails loudly, uploads its full log, and refuses to ship an empty package.
- Packaging: a bootstrap run (no signing secrets) now uploads its ephemeral
  keystore as a run artifact — previously the printed fingerprint pointed at
  a key that was deleted, making permanent signing impossible to bootstrap.
- Packaging: the Windows gather step now collects only the NSIS installer
  and the portable executable — the first run also attached two
  electron-builder internals (the unpacked 246 MB stub and its elevation
  helper) to the release.
- Packaging: the Android splash-screen background now uses the `#RRGGBB`
  format Android resources require — the `0xARGB` value (valid for
  Cordova's runtime `BackgroundColor` preference) failed the resource
  link step (`expected color but got (raw string) 0xff101014`).
- Packaging: the APK now carries the SpaceHub icons and the TV banner —
  the icons were generated but never declared as `<icon>` elements (the
  default Cordova robot would have shipped), and the banner's
  `resource-file` target predated the cordova-android 7 layout, landing
  outside the Gradle project (`resource drawable/banner not found`). The
  LEANBACK launcher intent-filter is now merged through `config-file`,
  whose children are actually appended. The full `platform add` pipeline
  is exercised locally before each change reaches CI.
- Dashboard widget registration no longer crashes at startup:
  `JellyseerrTrendingWidget` and the two qBittorrent widgets were
  registered in `core/SpaceHub.js` but never imported — every dashboard
  init threw a `ReferenceError` (caught, but it aborted the remaining
  registrations). Found by the file:// boot probe written for the
  packaging work.
- 47 CSS `transition` declarations carried an invalid mid-value `!important`
  (one declaration admits only a trailing one): browsers dropped the whole
  declaration — these hover/motion transitions never animated — and the
  new build pipeline rejects the syntax outright. Repaired to the valid
  form; the transitions work for the first time.
- CI ground truth: the verification chain requires Node ≥ 22.15
  (`module.registerHooks`); workflows now run Node 24 and `package.json`
  declares the floor.

## [1.0.1] - 2026-09-09

First downloadable release. One web build for every platform — PC, Android
and TVs all open the same PWA, served behind any reverse proxy.

### Added
- SyncPlay: watch together across devices, with server-clock synchronization
  (NTP-style), drift correction by playback speed below 400 ms and clean
  seeks above.
- Custom subtitle appearance (size, background, contrast — WCAG 1.4.3).
- Sleep timer, quality badges, phone-as-keyboard remote input.
- On-demand ratings and LRCLIB synced lyrics in the music mode.
- Signed plugin catalogue with pinned ECDSA P-256 keys; onboarding guide for
  writing plugins (`docs/ECRIRE_UN_GREFFON.md`).
- Light theme rebuilt on an elevation model, verified by an automated
  contrast contract.
- Startup weight reduced from 464 kB to 265 kB (hls.js out of the critical
  path, lazy admin console and settings).

### Changed
- Plugin SDK made usable by authors other than its own: context-isolated
  permissions, dependency resolution with cycle detection, quarantine.

[Unreleased]: https://github.com/nicoo-o/SpaceHub/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/nicoo-o/SpaceHub/releases/tag/v1.2.0
[1.1.0]: https://github.com/nicoo-o/SpaceHub/releases/tag/v1.1.0
[1.0.1]: https://github.com/nicoo-o/SpaceHub/releases/tag/v1.0.1
