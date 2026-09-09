<div align="center">

  <img src="logo.png" alt="SpaceHub Logo" width="140" style="border-radius: 28px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);" />

  # 🌌 S P A C E H U B

  ### **The unified media center for Jellyfin and the Servarr stack.**

  One interface for watching, listening and managing — Jellyfin, Sonarr,
  Radarr, Bazarr, Prowlarr, Jellyseerr and qBittorrent, in a single app
  designed for the couch as much as the desk.

  <p align="center">
    <a href="https://github.com/nicoo-o/SpaceHub/actions/workflows/ci.yml"><img src="https://github.com/nicoo-o/SpaceHub/actions/workflows/ci.yml/badge.svg" alt="CI status"/></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-blue?style=for-the-badge&color=0A84FF" alt="License GPL-3.0"/></a>
    <a href="https://jellyfin.org"><img src="https://img.shields.io/badge/Jellyfin-10.8%2B-00A4DC?style=for-the-badge&logo=jellyfin&logoColor=white" alt="Jellyfin 10.8+"/></a>
    <img src="https://img.shields.io/badge/Chromium-69%2B%20·%20TVs%202020%2B-30D158?style=for-the-badge" alt="Chromium 69+ · TVs 2020+"/>
  </p>

</div>

---

## What is SpaceHub?

SpaceHub is a **standalone web app** for Jellyfin: it has its own sign-in
screen (password or Quick Connect), its own navigation and its own player,
and talks to your Jellyfin server through the REST API. **Nothing is
installed on the server** — no plugin, no modification. You serve a static
build behind any web server, and every device in the house opens the same
URL.

It is built in framework-free JavaScript, compiled by Vite to a
**Chromium 69** compatibility floor (smart TVs from 2020 onward), shipped as
a **PWA** with an offline shell and downloadable media, and kept honest by
**561 unit tests, 26 end-to-end scenarios in a real browser and twelve
automated contract checks** that run on every push.

## ✨ Features

|  |  |
|---|---|
| 🎬 **Watch** | HLS player negotiated with the server (`PlaybackInfo`, no forced transcoding), intro/resume/credits segments, remote and custom-styled subtitles, queue with episode chaining, quality badges, cast target, sleep timer |
| 👥 **SyncPlay** | Watch together across devices — server-clock sync (NTP-style), drift correction by playback speed below 400 ms, clean seek above |
| 🎵 **Listen** | Dedicated music mode, radio, synced lyrics from LRCLIB, on-demand ratings |
| 📥 **Manage** | All six Servarr integrations — Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr, qBittorrent — plus an admin console and analytics, without opening six browser tabs |
| 📺 **Ten-foot UI** | Full spatial navigation for TV remotes and gamepads (W3C-style focus algorithm, layer stack, focus recovery), phone-as-keyboard, screen lock, parental control |
| 📡 **Offline** | PWA install, IndexedDB downloads that survive a cut network, honest empty states when the server is gone |
| 🎨 **Yours** | Dark and light themes (contrast-checked), theme presets, onboarding wizard |
| 🧩 **Extensible** | A plugin SDK with default-denied permissions, a signed catalogue (SHA-256 + pinned ECDSA P-256 keys), and no `eval` anywhere |

## 📦 Install

SpaceHub is **one web build for every platform** — PC, Android and TVs all
open the same app. There is nothing to compile on your side.

**1. Download** the latest archive from
[**Releases**](https://github.com/nicoo-o/SpaceHub/releases)
(`spacehub-vX.Y.Z.zip`), or grab the newest build of `main` from the
[Actions tab](https://github.com/nicoo-o/SpaceHub/actions/workflows/ci.yml)
(artifact `spacehub-main`).

**2. Serve it** with HTTPS on your network. The shortest path is Caddy:

```caddy
spacehub.lan {
    encode gzip
    reverse_proxy /svc/jellyfin/* 192.168.1.10:8096
    handle {
        root * /srv/spacehub/dist
        try_files {path} /index.html
        file_server
    }
}
```

> HTTPS matters: without it, PWA install, fullscreen, persistent storage and
> the offline service worker do not behave. Full nginx/Caddy configurations,
> the Servarr path trick (`/svc/sonarr`, `/svc/radarr`… — which removes all
> CORS pain) and the WebSocket/timeout pitfalls are documented in
> [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

**3. Open it** from any device:

| Platform | How |
|---|---|
| 🖥️ **Windows / macOS / Linux** | Any modern browser; « Install app » in Chrome/Edge for the PWA |
| 📱 **Android** | Chrome → menu → *Add to Home screen* |
| 📺 **Android TV / Google TV** | [TV Bro](https://github.com/truefedex/tv-bro) or Firefox TV, open the URL |
| 📺 **Samsung Tizen (2020+)** | Built-in TV browser |
| 📺 **LG webOS (2020+)** | Built-in TV browser |
| 🎮 **Xbox** | Microsoft Edge |

Then point SpaceHub at your Jellyfin server on the sign-in screen. Integrations
are configured in Settings → Integrations with the `/svc/…` URLs from your
reverse proxy.

## 🧩 Plugins

SpaceHub ships a plugin SDK meant for other people: a written guide
([`docs/ECRIRE_UN_GREFFON.md`](docs/ECRIRE_UN_GREFFON.md)), a working example
([`plugins/exemple/`](plugins/exemple/)), default-denied permissions checked
on every context call, dependency resolution with cycle detection,
quarantine, and a catalogue whose signatures are verified against **pinned
keys carried by the app itself** — not by the catalogue it is verifying.

## 🛠️ Development

```bash
npm ci           # install exactly what the lockfile describes
npm run dev      # Vite dev server on http://localhost:3000
npm run verify   # the full gate: test chain, build, weight budget, e2e
```

The test chain runs lint, 561 unit tests, a headless full-boot smoke test,
and contract checks for navigation, input pipeline, focus, ghost methods,
template identifiers, CSS hygiene, XSS escaping, global-access ceiling,
theme contrast and **file-size budgets on the seven largest modules** (they
are frozen — new features go into new modules). CI (`.github/workflows/`)
runs the same gate on every push, and pushing a `v*` tag publishes a release
after the gate passes.

Project status, including what is *not* yet verified, lives in
[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md). The one open item:
**the hardware acceptance run on a real TV** — the procedure is ready in
[`docs/RECETTE_MATERIEL.md`](docs/RECETTE_MATERIEL.md), and it is the only
thing standing between the current test suite and a production claim.

## 📄 License & credits

SpaceHub is licensed under the **[GNU GPL-3.0](LICENSE)**.

It is a fork of [KefinTweaks](https://github.com/ranaldsgift/KefinTweaks)
(MIT © 2022 ranaldsgift) — the original MIT notice is preserved in the
LICENSE file. Thanks to the Jellyfin, Servarr, hls.js and LRCLIB communities
whose work this builds upon.

<div align="center">
  <sub>Built for people who never want to open six tabs to manage a media server.</sub>
</div>
