<p align="center">
  <img src="logo.png" alt="SpaceHub Logo" width="140" style="filter: drop-shadow(0 0 35px rgba(124, 106, 255, 0.8));"/>
</p>

<h1 align="center">🌌 SpaceHub</h1>

<p align="center">
  <strong>L'Écosystème Média Ultime de Nouvelle Génération</strong><br/>
  <em>Plateforme Web & Desktop autonome, ultra-performante et modulaire pour Jellyfin, Servarr, Immich et Home Assistant.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.5.0-7c6aff?style=for-the-badge&logo=rocket" alt="version"/>
  <img src="https://img.shields.io/badge/Jellyfin-10.9%2B%20Ready-00A4DC?style=for-the-badge&logo=jellyfin" alt="jellyfin"/>
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite" alt="vite"/>
  <img src="https://img.shields.io/badge/Electron-Desktop-47848F?style=for-the-badge&logo=electron" alt="electron"/>
  <img src="https://img.shields.io/badge/Multi--Thread-Web%20Workers-2ecc71?style=for-the-badge" alt="workers"/>
  <img src="https://img.shields.io/badge/licence-MIT-green?style=for-the-badge" alt="licence"/>
</p>

---

## ✨ Qu'est-ce que SpaceHub ?

> *"L'utilisateur n'a plus besoin d'ouvrir 10 applications différentes. **SpaceHub unifie l'ensemble de votre univers multimédia** (Streaming, Automatisation, Musique Hi-Fi, Photos IA, Domotique, Télévision en direct) dans une interface futuriste, fluide à 120 FPS et personnalisable à l'infini."*

```
                 🚀 S P A C E H U B   E C O S Y S T E M
   ┌──────────────────────────────────────────────────────────────┐
   │  📺 Jellyfin  ·  🎬 Servarr Suite  ·  📸 Immich Photos AI   │
   │  💡 Home Assistant  ·  🎵 LRCLIB Hi-Fi  ·  ⚡ Web Workers   │
   └──────────────────────────────────────────────────────────────┘
```

---

## 🌟 Fonctionnalités Phares

### 🌌 1. Intro Cinématique Style Netflix (Horizon 17)
- **Signature Sonore "Ta-Dum Spatial"** : Synthétisée en temps réel via la **Web Audio API** (*impact sub-bass 40Hz + accord stellaire réverbéré*).
- **Animation Warp Speed 3D** : Champ d'étoiles dynamique sur Canvas + tracé laser du logo néon SpaceHub avec onde de choc prismatique.
- **Skip Instantané** : Clic ou touche `Échap`/`Espace` pour accéder immédiatement à votre bibliothèque.

### ⚡ 2. Architecture Hyper-Performance (Horizon 6++)
- **Moteur Multi-Threadé (`WorkerThreadPool`)** : Déporte l'indexation, la recherche sémantique en langage naturel et le parsing des paroles hors du thread graphique.
- **VirtualGridScroller (60/120 FPS)** : Défilement infini ultra-fluide avec recyclage de nœuds DOM (`DOM Pool`) pour naviguer instantanément dans des bibliothèques de **10 000+ films et séries**.
- **MultiTierCache & Request Coalescer** : Cache L1 Mémoire (< 1ms) + L2 IndexedDB (*Stale-While-Revalidate*) + déduplication des requêtes HTTP en vol.
- **Predictive Binge Preloader** : Préchargement automatique du début de l'épisode suivant dès 85% de visionnage pour du **binge-watching instantané sans latence**.
- **Network Quality Guardian** : Surveillance continue du débit (Mbps/RTT) pour adapter dynamiquement la résolution des miniatures et le débit vidéo.

### 🎬 3. Lecteur Vidéo & Immersion Cinéma (Horizons 4, 5, 6)
- **Trickplay Scrubbing** : Vignettes de prévisualisation au survol de la timeline vidéo (Jellyfin 10.9+).
- **Saut d'Intro Automatique (Skip Intro)** : Détection des marqueurs de chapitres pour passer les génériques en 1 clic.
- **Direct Play Optimizer & Mode Nuit** : Négociation client-side pour éliminer le transcodage serveur et compresseur dynamique Web Audio pour équilibrer dialogues et explosions.
- **SyncPlay & Watch Party** : Salons de visionnage synchronisés à plusieurs avec chat et réactions émojis flottantes.
- **Bandes-Annonces & Recherche Naturelle** : Trailers YouTube intégrés et recherche sémantique (*"comédies des années 90 dans l'espace"*).

### 🛡️ 4. Cockpit Administrateur & NOC Entreprise (Horizon 7++)
- **NOC Graphique 60 FPS (`AdminMetricsChart`)** : Surveillance temps réel de la bande passante (Mbps), ratio Direct Play vs Transcode GPU, et bouton d'urgence **🛑 Kill All Transcodes**.
- **Console de Logs en Direct** : Streaming des journaux serveur Jellyfin avec filtres par niveau (`[ERR]`, `[WRN]`, `[INF]`), recherche Regex et export `.log`.
- **Gestionnaire Utilisateurs & Quotas** : Limitation personnalisée du transcodage 4K et de la bande passante par compte.
- **Santé & Nettoyage 1-Clic** : Diagnostic d'intégrité et purge automatique des fichiers temporaires orphelins.

### 🎵 5. Espace Hi-Fi, Karaoké & Égaliseur DSP (Horizon 11)
- **Paroles Synchronisées Temps Réel** : Moteur LRC via **LRCLIB** avec défilement fluide ligne par ligne style Karaoké et pochette d'album animée.
- **Égaliseur Paramétrique 10 Bandes** : Web Audio DSP (`32Hz` à `16kHz`) avec préréglages professionnels (*Bass Boost, Clarté Vocale, Électro, Rock, Mode Nuit*).
- **Mini-Lecteur Tourne-Disque** : Vinyle animé avec aiguille réactive persistant sur toute l'application.

### 📺 6. Live TV, Guide EPG Panoramique 24h & DVR (Horizon 10)
- Mosaïque des chaînes en direct avec programme actuel et jauge de progression live `● DIRECT`.
- Frise chronologique interactive 24h (**Guide EPG**) avec blocs de programmes proportionnels à leur durée.
- Programmation, annulation et visionnage des enregistrements **DVR**.

### 📸 7. Immich Photos IA & Carte GPS Mondiale (Horizon 12)
- Recherche sémantique par IA (**CLIP Embeddings**) : *"coucher de soleil"*, *"chien dans la neige"*, *"fête"*.
- Reconnaissance faciale et albums automatiques par personne.
- **Carte des Destinations (GPS)** avec pins pulsants géolocalisés et **Diaporama Cinématique (Ken Burns Effect)**.

### ⚙️ 8. Servarr Pro & Recyclarr TRaSH Guides (Horizon 13)
- **File d'Attente Unifiée** : Suivi en direct des téléchargements Sonarr, Radarr et qBittorrent.
- **Recherche Cross-Service** : Recherche et ajout de films/séries en 1 clic.
- **Recyclarr Config Studio** : Visualisation, édition et export des configurations YAML de qualité TRaSH Guides.
- **Calendrier iCal** : Vue mensuelle interactive 7 jours et export `.ics` pour Google / Apple Calendar.

### 💡 9. Domotique Cinéma & Ambilight 360° (Horizon 14)
- **Ambilight Logiciel 100% Canvas** : Analyse des couleurs des bords de la vidéo en temps réel et projection RGB sur vos lampes connectées.
- **Mode Cinéma Automatisé** : Tamise la pièce à 10% au Play, remonte à 40% à la Pause (Mode Entracte) et rétablit 100% à l'Arrêt via **Home Assistant**.

### ♿ 10. Accessibilité Universelle & Inclusion (Horizon 15)
- **Filtres Daltonisme SVG** : Protanopie, Deutéranopie, Tritanopie, Achromatopsie et Contraste Élevé.
- **Confort de Lecture** : Police **OpenDyslexic**, texte agrandi (+15%) et mode Mouvements Réduits.
- **Studio de Sous-titres** avec prévisualisation vidéo en direct.

### ✨ 11. SpaceHub Rewind (Horizon 16)
- Rétrospective annuelle interactive façon Spotify Wrapped.
- Statistiques de visionnage (heures totales, répartition des genres, top films/séries, badge et persona cinéphile).

### 🧩 12. Plugin SDK 3.0 & Theme Studio Pro (Horizon 8++)
- **Live Theme Studio** : Éditeur CSS en direct avec préréglages (*Deep Space, Cyberpunk, OLED Black, Nord, Emerald*) et export `.spacehub-theme.json`.
- **UI Hook Debugger** : Inspecteur visuel avec surlignage des points d'injection et profilage de performance (ms).
- **Sandbox Sécurisée** : Isolation de l'exécution des extensions tierces.

---

## 🗺️ Matrice des Horizons Réalisés

| Horizon | Description | Statut |
|:---:|---|:---:|
| **H1** | 📚 Libraria (Comics, Mangas, Ebooks) | ⏳ *En développement* |
| **H2** | 🖥️ Desktop Natif (Electron, Discord RPC, Tray, Shortcuts) & Mode TV 10-Foot | ✅ **Complété** |
| **H3** | 🌐 Multi-Serveurs Décentralisé, Recherche Fédérée & Export de Sauvegarde | ✅ **Complété** |
| **H4** | 🍿 Immersion (Bandes-annonces YouTube, Recherche Naturelle, Recommandations) | ✅ **Complété** |
| **H5** | 👥 SyncPlay & Watch Party Collaboratif (Salons, Chat, Émojis) | ✅ **Complété** |
| **H6++** | ⚡ Performance Ultime (Trickplay, Skip Intro, Web Workers, VirtualGridScroller 120 FPS) | ✅ **Complété** |
| **H7++** | 🛡️ Cockpit Administrateur & NOC Entreprise (Graphiques 60 FPS, Logs Live, Quotas) | ✅ **Complété** |
| **H8++** | 🧩 Plugin SDK 3.0, Sandbox Sécurisée & Live Theme Studio Pro | ✅ **Complété** |
| **H9** | ✈️ Mode Hors-Ligne & Téléchargements Locaux (IndexedDB, Sync Réseau) | ✅ **Complété** |
| **H10** | 📺 Live TV, Guide EPG Panoramique 24h & Enregistreur DVR | ✅ **Complété** |
| **H11** | 🎵 Espace Hi-Fi, Paroles Synchronisées LRCLIB & Égaliseur DSP 10 Bandes | ✅ **Complété** |
| **H12** | 📸 Immich Photos IA, Carte GPS de Voyage & Diaporama Ken Burns | ✅ **Complété** |
| **H13** | ⚙️ Servarr Pro (Sonarr, Radarr, Recyclarr TRaSH Guides, Export iCal) | ✅ **Complété** |
| **H14** | 💡 Domotique Cinéma, Ambilight Logiciel & Intégration Home Assistant | ✅ **Complété** |
| **H15** | ♿ Accessibilité Universelle (Filtres Daltonisme, OpenDyslexic, Sous-titres) | ✅ **Complété** |
| **H16** | ✨ SpaceHub Rewind (Statistiques Annuelles, Persona & Badges Cinéphiles) | ✅ **Complété** |
| **H17** | 🌌 Intro Cinématique & Signature Sonore Web Audio Style Netflix | ✅ **Complété** |

---

## 🚀 Démarrage Rapide

### Prérequis
- **Node.js** 18+ & **npm**
- Un serveur **Jellyfin** (10.8+ ou 10.9+)

### Installation & Lancement

```bash
# 1. Cloner le dépôt
git clone https://github.com/nicoo-o/SpaceHub.git
cd SpaceHub

# 2. Installer les dépendances
npm install

# 3. Lancer en mode Développement Web
npm run dev

# 4. Lancer en mode Desktop Natif (Electron avec Discord RPC & Tray)
npm run electron:dev

# 5. Compiler pour la production
npm run build
```

---

## 🏗️ Architecture du Projet

```
SpaceHub/
├── core/                  # Socle technique et moteurs transverses
│   ├── intro/             # [H17] Moteur d'intro cinématique & son spatial Web Audio
│   ├── perf/              # [H6++] Web Workers, VirtualGridScroller, MultiTierCache
│   ├── ambilight/         # [H14] Moteur Ambilight 360° Canvas
│   ├── domotics/          # [H14] Automatisations Mode Cinéma
│   ├── accessibility/     # [H15] Filtres SVG daltonisme, typographie
│   ├── analytics/         # [H16] Moteur SpaceHub Rewind
│   └── extensions/        # [H8++] UIHookManager, HookDebugger, PluginSandbox
├── jellyfin/              # Services et intégrations Jellyfin
│   ├── player/            # VideoPlayer, Trickplay, IntroSkipper, Optimizer, AudioPlayer
│   ├── admin/             # [H7++] LiveStreamMonitor, NOC Metrics, Live Logs, Health
│   ├── livetv/            # [H10] LiveTvService, EPG, Timers DVR
│   ├── syncplay/          # [H5] Salons SyncPlay et chat
│   └── offline/           # [H9] OfflineDownloadManager (IndexedDB)
├── integrations/          # Intégrations écosystème
│   ├── homeassistant/     # [H14] Client Home Assistant REST
│   ├── immich/            # [H12] Client Immich Photos IA & GPS
│   ├── recyclarr/         # [H13] Gestionnaire TRaSH Guides
│   └── sonarr/radarr/...  # Clients d'automatisation Servarr
├── ui/                    # Interface utilisateur moderne
│   ├── layouts/           # AppLayout, navigation réactive
│   ├── themes/            # LiveThemeStudio & ProCodeThemeEditor
│   └── views/             # Vues modularisées (Bibliothèque, Servarr, Admin, LiveTV...)
└── electron/              # Wrapper Desktop Natif (Discord RPC, Tray, Global Shortcuts)
```

---

## 🤝 Contribution & Communauté

Les contributions sont chaleureusement accueillies ! N'hésitez pas à proposer des Pull Requests, signaler des bugs ou suggérer de nouvelles fonctionnalités.

1. Forkez le projet
2. Créez votre branche de fonctionnalité (`git checkout -b feature/ma-super-feature`)
3. Committez vos modifications (`git commit -m 'feat: ajout d'une super feature'`)
4. Poussez sur votre branche (`git push origin feature/ma-super-feature`)
5. Ouvrez une **Pull Request**

---

## 📄 Licence

Distribué sous licence **MIT**. Voir [`LICENSE`](./LICENSE) pour plus d'informations.

<p align="center">
  Fait avec ❤️ et passion pour la communauté multimédia & open-source.
</p>
