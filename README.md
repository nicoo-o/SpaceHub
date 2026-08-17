<p align="center">
  <img src="logo.png" alt="SpaceHub Logo" width="120"/>
</p>

<h1 align="center">SpaceHub</h1>
<p align="center">
  <strong>Plugin Jellyfin modulaire</strong> — Transformez Jellyfin en un Media Center unifié.<br/>
  Intégrez Sonarr, Radarr, Bazarr, Prowlarr, Jellyseerr et qBittorrent dans une seule interface.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue?style=flat-square" alt="version"/>
  <img src="https://img.shields.io/badge/Jellyfin-10.8%2B-00A4DC?style=flat-square&logo=jellyfin" alt="jellyfin"/>
  <img src="https://img.shields.io/badge/licence-MIT-green?style=flat-square" alt="licence"/>
  <img src="https://img.shields.io/badge/status-En%20développement-orange?style=flat-square" alt="status"/>
</p>

---

## 🎯 Vision

> *"L'utilisateur n'a **plus besoin** d'ouvrir Sonarr, Radarr, Bazarr, Prowlarr, Jellyseerr ou qBittorrent séparément. **Tout est accessible dans Space Hub**, avec une expérience fluide, personnalisable et modulaire."*

SpaceHub est un plugin **JavaScript/CSS** injecté dans Jellyfin Web. Il regroupe les meilleures fonctionnalités de :

| Source | Fonctionnalité apportée |
|--------|------------------------|
| **Plex** | Interface utilisateur intuitive |
| **Overseerr / Jellyseerr** | Système de demandes de médias |
| **Tautulli** | Statistiques et monitoring |
| **Sonarr / Radarr** | Gestion centralisée des téléchargements |
| **Bazarr** | Gestion des sous-titres |
| **Prowlarr** | Gestion des indexers |

---

## 🗺️ Roadmap

| Version | Objectif | Statut |
|---------|----------|--------|
| **v0.1** | Fork propre — renommage et restructuration | ✅ En cours |
| **v0.2** | Core modulaire (`SpaceHub.js`, `ModuleManager`, `EventBus`...) | 🔜 |
| **v0.3** | Design System (tokens CSS, composants, thèmes) | 🔜 |
| **v0.4** | Dashboard drag & drop (GridStack, widgets) | 🔜 |
| **v0.5** | Améliorations Jellyfin core | 🔜 |
| **v0.6–v0.11** | Intégrations Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr, qBittorrent | 🔜 |
| **v1.0** | Release stable — Analytics, SDK, notifications | 🔜 |

---

## 📦 Installation

### Pré-requis
- **Jellyfin** 10.8+
- Plugin **JavaScript Injector** installé sur votre serveur Jellyfin

### Installation rapide

1. Dans Jellyfin, allez dans **Tableau de bord → Plugins → JavaScript Injector**
2. Collez le contenu de [`spaceHub-plugin.js`](./spaceHub-plugin.js) dans la zone de script
3. Redémarrez Jellyfin Web
4. SpaceHub s'installera automatiquement au premier chargement

### Installation manuelle (CDN)

Collez ce snippet dans votre JavaScript Injector :

```javascript
(function() {
    const script = document.createElement('script');
    script.src = 'URL_DE_VOTRE_REPO/spaceHub-plugin.js';
    document.head.appendChild(script);
})();
```

---

## 🎨 Thèmes disponibles

SpaceHub inclut plusieurs thèmes CSS prêts à l'emploi :

| Thème | Fichier |
|-------|---------|
| Chromic | `skins/chromic-spacehub.css` |
| Elegant | `skins/elegant-spacehub.css` |
| Flow | `skins/flow-spacehub.css` |
| Glassfin | `skins/glassfin-spacehub.css` |
| JamFin | `skins/jamfin-spacehub.css` |
| NeutralFin | `skins/neutralfin-spacehub.css` |
| ScyFin | `skins/scyfin-spacehub.css` |

---

## 🏗️ Architecture

```
SpaceHub/
├── core/              # Socle technique (v0.2)
├── ui/                # Interface utilisateur (v0.3)
│   ├── components/
│   ├── layouts/
│   ├── themes/
│   └── widgets/
├── integrations/      # Intégrations externes (v0.6+)
│   ├── sonarr/
│   ├── radarr/
│   ├── prowlarr/
│   ├── bazarr/
│   ├── jellyseerr/
│   └── qbittorrent/
├── jellyfin/          # Améliorations Jellyfin (v0.5)
├── scripts/           # Scripts hérités de KefinTweaks (migration en cours)
├── skins/             # Thèmes CSS
└── docs/              # Documentation
```

---

## ⚙️ Configuration

La configuration est gérée via `window.SpaceHubConfig`. Vous pouvez surcharger les valeurs par défaut de [`spaceHub-default-config.js`](./spaceHub-default-config.js).

```javascript
window.SpaceHubConfig = {
    // Activer/désactiver des modules
    scripts: {
        homeScreen: true,
        search: true,
        skinManager: true,
        // ...
    }
};
```

---

## 🤝 Contribution

SpaceHub est open-source. Les contributions sont les bienvenues !

1. Fork le projet
2. Crée une branche (`git checkout -b feature/ma-feature`)
3. Commit tes changements (`git commit -m 'feat: ajoute ma feature'`)
4. Push sur la branche (`git push origin feature/ma-feature`)
5. Ouvre une Pull Request

---

## 📄 Licence

Distribué sous licence **MIT**. Voir [`LICENSE`](./LICENSE) pour plus d'informations.

---

## 🙏 Crédits

SpaceHub est basé sur le projet **[KefinTweaks](https://github.com/ranaldsgift/KefinTweaks)** par [@ranaldsgift](https://github.com/ranaldsgift).

---

<p align="center">
  Fait avec ❤️ pour la communauté Jellyfin
</p>
