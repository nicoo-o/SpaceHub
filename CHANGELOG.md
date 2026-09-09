# Changelog

All notable changes to SpaceHub are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Changed
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

[Unreleased]: https://github.com/nicoo-o/SpaceHub/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/nicoo-o/SpaceHub/releases/tag/v1.0.1
