# Changelog

All notable changes to SpaceHub are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

[Unreleased]: https://github.com/nicoo-o/SpaceHub/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/nicoo-o/SpaceHub/releases/tag/v1.1.0
[1.0.1]: https://github.com/nicoo-o/SpaceHub/releases/tag/v1.0.1
