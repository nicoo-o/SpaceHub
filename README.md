**English** · [Français](README.fr.md)


# SpaceHub

**The meeting point of the Space suite for Windows 11.**

SpaceHub is the small app and the contract that let SpaceNotch, SpaceFiles and the other Space apps know each other, share
their look and be installed and checked from one place.

## The apps

| App | Role | State |
|---|---|---|
| [SpaceNotch](https://github.com/nicoo-o/SpaceNotch) | Dynamic Island, launcher, notifications | Released |
| [SpaceFiles](https://github.com/nicoo-o/SpaceFiles) | File explorer | In development — source published, no release yet |
| [JellySpace](https://github.com/nicoo-o/JellySpace) | Jellyfin media center | Released — joins later |
| [Libraria](https://github.com/nicoo-o/libraria) | Books and audiobooks | Early — joins later |

## What SpaceHub does today (v1, not published yet)

- **Applications**: one line per installed app — version, protocol version, state (running, stopped, untrusted, no manifest,
  unreadable) — with *Open* and *Settings* buttons.
- **Appearance**: the shared theme (Windows / Dark / Light) and motion (Full / Reduced), written once to a shared settings
  file that the apps follow.
- **Shortcuts**: which global shortcuts are taken and by whom, read-only.
- **Modules**: the plugins found on disk, listed without loading anything.
- **Health**: pipe, protocol and the last error from each log, read-only.
- Starts on demand, no background process, closes to zero memory.

## Planned

- Install and update the Space apps from one place (today each app has its own installer script).
- Show JellySpace and Libraria next to the others.

## The contract (Eco protocol)

Apps declare a manifest, talk through named pipes restricted to the current user (JSON lines), and read one shared settings
file. No network port, no account, no telemetry. The specification lives in the [SpaceFiles repository](https://github.com/nicoo-o/SpaceFiles)
(`docs/ecosystem/`) until it is published here.

## Install

Not published yet. Watch this repository or the [profile](https://github.com/nicoo-o) for the first release.

<sub>Note: this repository name used to belong to the Jellyfin media center, now [JellySpace](https://github.com/nicoo-o/JellySpace).</sub>
