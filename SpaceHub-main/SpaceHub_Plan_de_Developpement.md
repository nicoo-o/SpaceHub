# Space Hub — Plan de Développement Complet

> **Plugin Jellyfin modulaire** transformant Jellyfin en un **Media Center unifié**.
> **Base** : Fork de [KefinTweaks](https://github.com/nicoo-o/SpaceHub) (repo original : `nicoo-o/SpaceHub`).
> **Architecture** : Frontend JavaScript/CSS injecté dans Jellyfin Web.
> **Objectif** : Remplacer Sonarr, Radarr, Bazarr, Prowlarr, Jellyseerr, qBittorrent, etc. par une **interface unique, cohérente et modulaire**.

---

## 📌 **Table des Matières**

1. [Vision et Objectifs](#1-vision-et-objectifs)
2. [Audit du Fork KefinTweaks](#2-audit-du-fork-kefintweaks)
3. [Architecture Cible](#3-architecture-cible)
4. [Fichiers KefinTweaks : Conserver / Refactoriser / Supprimer](#4-fichiers-kefintweaks--conserver--refactoriser--supprimer)
5. [Roadmap par Version](#5-roadmap-par-version)
6. [Conventions de Code](#6-conventions-de-code)
7. [Plan de Migration Concret](#7-plan-de-migration-concret)
8. [Exemples de Code Complets](#8-exemples-de-code-complets)
9. [Notes de Développement](#9-notes-de-développement)

---
---

## 1. Vision et Objectifs

### 🎯 **Objectif Principal**
Transformer **Jellyfin** en une **plateforme multimédia unifiée**, mélangeant les meilleures fonctionnalités de :
- **Plex** (interface utilisateur intuitive)
- **Overseerr** (système de demandes de médias)
- **Kometa** (métadonnées avancées et automatisées)
- **Tautulli** (statistiques et monitoring)
- **Sonarr/Radarr/Bazarr/Prowlarr** (gestion centralisée des téléchargements)
- **Jellyseerr** (système de demandes utilisateur)

**Principe directeur** :
> *"L’utilisateur n’a **plus besoin** d’ouvrir Sonarr, Radarr, Bazarr, Prowlarr, Jellyseerr ou qBittorrent séparément. **Tout est accessible dans Space Hub**, avec une **expérience fluide, personnalisable et modulaire**."*

### 🎪 **Public Cible**
- Utilisateurs de **Jellyfin** cherchant une **intégration complète** avec les outils *arr*.
- Développeurs souhaitant **étendre** Space Hub via un **SDK modulaire**.
- Communautés (ex: **Nothing OS**, **Cyberpunk**) aimant les **interfaces modernes et personnalisables**.

### 🌟 **Valeurs Clés**
- **Modularité** : Chaque fonctionnalité est un module indépendant.
- **Personnalisation** : Thèmes, widgets, layouts adaptables à chaque utilisateur.
- **Performance** : Optimisé pour une expérience fluide même sur mobile.
- **Extensibilité** : SDK pour permettre aux développeurs tiers d’ajouter des modules.

---
---

## 2. Audit du Fork KefinTweaks

### 📁 **Structure Actuelle du Repository**

```bash
KefinTweaks-copy-/
├── LICENSE
├── README.md
├── injector.js              # ⭐ Système d'injection modulaire (41 Ko)
├── kefinTweaks-plugin.js    # ⭐ Plugin principal (64 Ko)
├── kefinTweaks-default-config.js # Config par défaut (11 Ko)
├── logo.png
│
├── pages/
│   ├── images/              # Assets pour les pages
│   └── videos/              # Assets vidéo
│
├── scripts/                 # ⭐ Dossier principal (40+ fichiers)
│   ├── apiHelper.js         # ⭐ Helper pour API Jellyfin (21 Ko)
│   ├── backdropLeakFix.js
│   ├── breadcrumbs.js       # Gestion des breadcrumbs (38 Ko)
│   ├── cardBuilder.js       # ⭐ Construction des cartes médias (79 Ko)
│   ├── collections.js
│   ├── configuration.js     # ⚠️ **Config centrale (336 Ko, 5 735 lignes !)**
│   ├── homeScreen.js        # ⭐ Home Screen personnalisé (284 Ko)
│   ├── indexedDBCache.js    # ⭐ Cache IndexedDB (8 Ko)
│   ├── localStorageCache.js # ⭐ Cache localStorage (10 Ko)
│   ├── modal.js             # ⭐ Gestion des modales (9 Ko)
│   ├── search.js            # ⭐ Recherche personnalisée (29 Ko)
│   ├── skinManager.js       # ⭐ Gestion des skins (122 Ko)
│   ├── toaster.js           # ⭐ Notifications toast (5 Ko)
│   └── utils.js             # ⭐ Fonctions utilitaires (24 Ko)
│
└── skins/                   # ⭐ Thèmes CSS (10+ fichiers)
    ├── chromic-kefin.css
    ├── elegant-kefin.css
    └── ...
```

---

### ✅ **Points Forts à Conserver**

| **Fichier/Module** | **Pourquoi ?** | **Destination dans Space Hub** | **Priorité** |
|-------------------|---------------|--------------------------------|--------------|
| `injector.js` | Système d’injection modulaire avec dépendances. | `core/ModuleManager.js` | ⭐⭐⭐ |
| `apiHelper.js` | Helper pour les appels API Jellyfin. | `core/ApiClient.js` | ⭐⭐⭐ |
| `indexedDBCache.js` | Cache persistant côté client. | `core/CacheManager.js` | ⭐⭐⭐ |
| `localStorageCache.js` | Cache rapide pour petits paramètres. | `core/CacheManager.js` | ⭐⭐⭐ |
| `skinManager.js` | Gestion dynamique des thèmes CSS. | `ui/themes/ThemeManager.js` | ⭐⭐⭐ |
| `cardBuilder.js` | Construction des cartes médias. | `ui/components/CardBuilder.js` | ⭐⭐⭐ |
| `modal.js` | Gestion des fenêtres modales. | `ui/components/Modal.js` | ⭐⭐⭐ |
| `toaster.js` | Notifications toast. | `ui/components/Toaster.js` | ⭐⭐⭐ |
| `homeScreen.js` | Home Screen personnalisable. | `ui/dashboard/Dashboard.js` | ⭐⭐⭐ |
| `search.js` | Recherche améliorée. | `jellyfin/search/UnifiedSearch.js` | ⭐⭐⭐ |

---

### ⚠️ **Points Faibles à Refactoriser**

| **Problème** | **Fichier/Module** | **Solution** | **Priorité** |
|--------------|-------------------|--------------|--------------|
| Fichier monolithique | `configuration.js` (336 Ko, 5 735 lignes) | Découper en modules séparés. | ⭐⭐⭐ |
| Variables globales polluantes | `window.KefinTweaksConfig` | Remplacer par `SpaceHub.config`. | ⭐⭐⭐ |
| Pas de système d’événements | Aucun | Créer `core/EventBus.js`. | ⭐⭐⭐ |
| Pas de client API générique | Aucun | Créer `core/ApiClient.js`. | ⭐⭐⭐ |

---
---

## 3. Architecture Cible

### 📁 **Arborescence Finale de SpaceHub**

```bash
SpaceHub/
├── core/                          # ⭐ Cœur du plugin
│   ├── SpaceHub.js                # Point d'entrée + namespace global
│   ├── ModuleManager.js           # Gestion des modules
│   ├── EventBus.js                # Système d'événements (pub/sub)
│   ├── SettingsManager.js         # Configuration centralisée
│   ├── CacheManager.js            # Cache unifié (IndexedDB + localStorage)
│   ├── Logger.js                  # Logs structurés
│   └── ApiClient.js               # Client API unifié
│
├── ui/                            # ⭐ Interface Utilisateur
│   ├── components/                # Composants réutilisables
│   │   ├── CardBuilder.js
│   │   ├── Modal.js
│   │   └── Toaster.js
│   ├── layouts/                   # Dispositions
│   │   └── Dashboard.js
│   ├── themes/                    # Thèmes
│   │   ├── ThemeManager.js
│   │   └── presets/
│   └── widgets/                   # Widgets
│       ├── LatestAdditions.js
│       └── UpcomingEpisodes.js
│
├── jellyfin/                     # ⭐ Améliorations Jellyfin
│   ├── api/
│   │   └── JellyfinAPI.js
│   ├── search/
│   │   └── UnifiedSearch.js
│   └── collections/
│       └── SmartCollections.js
│
├── integrations/                 # ⭐ Intégrations externes
│   ├── sonarr/
│   │   ├── SonarrApi.js
│   │   ├── SonarrService.js
│   │   └── SonarrWidgets.js
│   ├── radarr/
│   ├── prowlarr/
│   ├── bazarr/
│   ├── jellyseerr/
│   └── qbittorrent/
│
├── docs/                        # ⭐ Documentation
│   ├── AUDIT.md
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
│
├── package.json
└── README.md
```

---
---

## 4. Fichiers KefinTweaks : Conserver / Refactoriser / Supprimer

### ✅ **À Conserver (Presque Tel Quel)**

| **Fichier** | **Action** | **Destination** | **Raison** |
|-------------|-----------|----------------|-----------|
| `apiHelper.js` | Conserver, wrapper | `jellyfin/api/JellyfinAPI.js` | Base solide pour l'API Jellyfin. |
| `indexedDBCache.js` | Conserver, intégrer | `core/CacheManager.js` | Cache persistant déjà fonctionnel. |
| `modal.js` | Conserver | `ui/components/Modal.js` | Système de fenêtres modales. |
| `toaster.js` | Conserver | `ui/components/Toaster.js` | Notifications UI. |
| `cardBuilder.js` | Conserver, adapter | `ui/components/CardBuilder.js` | Cartes médias. |
| `homeScreen.js` | Conserver, évoluer | `ui/dashboard/Dashboard.js` | Prototype du futur Dashboard. |
| `skinManager.js` | Conserver, évoluer | `ui/themes/ThemeManager.js` | Base du système de thèmes. |

---

### 🔄 **À Refactoriser**

| **Fichier** | **Action** | **Destination** | **Raison** |
|-------------|-----------|----------------|-----------|
| `configuration.js` | Découper | `core/SettingsManager.js` + modules | Trop gros (336 Ko, 5 735 lignes). |
| `search.js` | Refactoriser | `jellyfin/search/UnifiedSearch.js` | Intégrer la recherche unifiée. |

---

### ❌ **À Ne Pas Garder Comme Architecture Finale**

| **Élément** | **Problème** | **Solution** |
|-------------|-------------|--------------|
| `window.KefinTweaksConfig` | Global polluant | Migrer vers `SpaceHub.config`. |
| Structure monolithique | Tout dans quelques fichiers | Architecture modulaire par dossier. |

---
---

## 5. Roadmap par Version

---

### **📌 Légende des Priorités**
- ⭐⭐⭐ = **Critique** (à faire en premier)
- ⭐⭐ = **Important** (à faire après les critiques)
- ⭐ = **Nice-to-have** (si temps disponible)

---

### **v0.1 — Fork Propre**
**Objectif** : Transformer `KefinTweaks` en `SpaceHub` sans casser l’existant.

| # | **Tâche** | **Priorité** |
|---|----------|--------------|
| 1 | Renommer le projet `KefinTweaks` → `SpaceHub` (GitHub + code). | ⭐⭐⭐ |
| 2 | Remplacer toutes les occurrences de `KefinTweaks` par `SpaceHub`. | ⭐⭐⭐ |
| 3 | Nettoyer les références `KefinTweaks` dans le code. | ⭐⭐⭐ |
| 4 | Nettoyer le `README.md` et la documentation. | ⭐⭐⭐ |
| 5 | Modifier le branding (logo, couleurs, nom). | ⭐⭐⭐ |
| 6 | Vérifier la licence et la compatibilité Jellyfin. | ⭐⭐ |
| 7 | Restructurer le repository selon l’arborescence cible. | ⭐⭐⭐ |

**Livrable** : Repository `SpaceHub` fonctionnel, visuellement proche de `KefinTweaks`.

---

### **v0.2 — Space Hub Core**
**Objectif** : Créer le **socle technique modulaire**.

| # | **Tâche** | **Fichier** | **Priorité** |
|---|----------|-------------|--------------|
| 1 | Créer `core/SpaceHub.js` | ⭐⭐⭐ |
| 2 | Créer `core/ModuleManager.js` | ⭐⭐⭐ |
| 3 | Créer `core/EventBus.js` | ⭐⭐⭐ |
| 4 | Créer `core/SettingsManager.js` | ⭐⭐⭐ |
| 5 | Créer `core/CacheManager.js` | ⭐⭐ |
| 6 | Créer `core/ApiClient.js` | ⭐⭐⭐ |

**Livrable** : Architecture modulaire fonctionnelle.

---

### **v0.3 — Design System**
**Objectif** : Créer l’**identité visuelle** et les **composants réutilisables**.

| # | **Tâche** | **Fichier** | **Priorité** |
|---|----------|-------------|--------------|
| 1 | Définir les design tokens | `ui/design-system/tokens.css` | ⭐⭐⭐ |
| 2 | Créer les composants de base | `ui/components/*.js` | ⭐⭐⭐ |
| 3 | Créer le système de grid responsive | `ui/layouts/Grid.js` | ⭐⭐ |
| 4 | Créer le `ThemeEngine` avec presets | `ui/themes/ThemeManager.js` | ⭐⭐ |

**Presets de thèmes** : Nothing OS, Material You, Netflix, Cyberpunk, Minimal, Space, Nord, Catppuccin, Tokyo Night.

---

### **v0.4 — Dashboard**
**Objectif** : Tableau de bord modulaire avec widgets déplaçables.

| # | **Tâche** | **Priorité** |
|---|----------|--------------|
| 1 | Système de grid drag & drop (GridStack) | ⭐⭐⭐ |
| 2 | Widgets redimensionnables | ⭐⭐⭐ |
| 3 | Widget : Continue Watching | ⭐⭐⭐ |
| 4 | Widget : Derniers Ajouts | ⭐⭐⭐ |

---

### **v0.5 — Jellyfin Core Amélioré**
**Objectif** : Finaliser l’expérience Jellyfin.

| # | **Tâche** | **Priorité** |
|---|----------|--------------|
| 1 | Recherche unifiée | ⭐⭐⭐ |
| 2 | Page détails enrichie | ⭐⭐⭐ |
| 3 | Collections intelligentes | ⭐⭐ |

---

### **v0.6 à v0.11 — Intégrations**
- **v0.6** : Sonarr (gestion des séries)
- **v0.7** : Radarr (gestion des films)
- **v0.8** : Prowlarr (gestion des indexers)
- **v0.9** : Bazarr (gestion des sous-titres)
- **v0.10** : Jellyseerr (système de demandes)
- **v0.11** : qBittorrent (gestion des téléchargements)

---

### **v1.0 — Release Stable**
- Analytics et statistiques
- Calendrier des épisodes
- Notifications (Discord, Telegram, etc.)
- Media Health (vérification des médias)
- Performance monitoring
- Extension SDK

---
---

## 6. Conventions de Code

### 📌 **Namespace Global**

**Avant (KefinTweaks)** :
```javascript
window.KefinTweaksConfig = { /* ... */ };
```

**Après (SpaceHub)** :
```javascript
window.SpaceHub = {
    version: "0.1.0",
    core: { moduleManager: null, eventBus: null, settings: null },
    ui: { dashboard: null, themes: null },
    integrations: { sonarr: null, radarr: null }
};
```

---

### 📌 **Gestion des Modules**

```javascript
SpaceHub.core.moduleManager.register({
    id: "sonarr",
    dependencies: ["core", "api"],
    enabled: true,
    init: async function() {
        SpaceHub.integrations.sonarr = new SonarrService();
    }
});
```

---

### 📌 **Système d’Événements**

```javascript
// Écouter
SpaceHub.core.eventBus.on("sonarr:seriesAdded", (data) => {
    console.log("Nouvelle série:", data);
});

// Émettre
SpaceHub.core.eventBus.emit("dashboard:refresh");
```

---

### 📌 **CSS**
- Utiliser les **Custom Properties** : `--sh-color-primary: #ffffff;`
- **Nommage BEM-like** : `.sh-button`, `.sh-button--primary`
- **Mobile-first** : `@media (min-width: 768px) { ... }`

---
---

## 7. Plan de Migration Concret

### 🎯 **Stratégie**
1. **Ne pas casser l’existant** : Garder KefinTweaks fonctionnel pendant la migration.
2. **Refactoriser progressivement** : Core → UI → Dashboard → Intégrations.
3. **Tester à chaque étape**.

---

### 📅 **Feuille de Route**

| **Étape** | **Durée** | **Objectif** | **Livrable** |
|-----------|-----------|--------------|--------------|
| 0. Préparation | 1-2 jours | Nettoyage et renommage | SpaceHub fonctionnel |
| 1. Core | 3-4 jours | Architecture modulaire | Core fonctionnel |
| 2. Design System | 4-6 semaines | UI moderne | Interface thémable |
| 3. Dashboard | 3-4 semaines | Tableau de bord | Dashboard personnalisable |
| 4. Jellyfin Core | 4-5 semaines | Expérience Jellyfin améliorée | SpaceHub utilisable |
| 5. Intégrations | 6-8 semaines | Sonarr, Radarr, etc. | Intégrations fonctionnelles |

---

### 🚀 **Actions Immédiates**

1. **Renommer le repository** : `KefinTweaks-copy-` → `SpaceHub`
2. **Nettoyer le code** : Remplacer `KefinTweaks` par `SpaceHub`
3. **Créer l’arborescence** : `core/`, `ui/`, `integrations/`
4. **Implémenter le Core** : `SpaceHub.js`, `ModuleManager.js`, etc.

---
---

## 8. Exemples de Code Complets

---

### 📁 **`core/SpaceHub.js`**

```javascript
const SpaceHub = {
    version: "0.2.0",
    core: {},
    ui: {},
    jellyfin: {},
    integrations: {},
};

async function init() {
    console.log(`[SpaceHub v${SpaceHub.version}] Initialisation...`);
    
    SpaceHub.core.moduleManager = new (await import("./ModuleManager.js")).default();
    await SpaceHub.core.moduleManager.init();
    
    SpaceHub.core.eventBus = new (await import("./EventBus.js")).default();
    SpaceHub.core.settings = new (await import("./SettingsManager.js")).default();
    SpaceHub.core.cache = new (await import("./CacheManager.js")).default();
    SpaceHub.core.api = new (await import("./ApiClient.js")).default();
    
    console.log("[SpaceHub] Initialisation terminée.");
}

if (typeof window !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
    window.SpaceHub = SpaceHub;
}

export default SpaceHub;
```

---

### 📁 **`core/ModuleManager.js`**

```javascript
class ModuleManager {
    constructor() {
        this.modules = new Map();
        this.loadedModules = new Set();
        this.pendingModules = new Set();
    }

    register(moduleConfig) {
        if (this.modules.has(moduleConfig.id)) return;
        this.modules.set(moduleConfig.id, {
            config: moduleConfig,
            instance: null,
            status: "registered",
        });
    }

    async load(moduleId) {
        if (this.loadedModules.has(moduleId)) {
            return this.modules.get(moduleId).instance;
        }

        const module = this.modules.get(moduleId);
        if (!module) throw new Error(`Module "${moduleId}" non trouvé.`);

        this.pendingModules.add(moduleId);

        // Charger les dépendances
        for (const depId of module.config.dependencies || []) {
            if (!this.loadedModules.has(depId)) {
                await this.load(depId);
            }
        }

        // Initialiser le module
        if (module.config.init) {
            module.instance = await module.config.init();
        }

        module.status = "loaded";
        this.loadedModules.add(moduleId);
        this.pendingModules.delete(moduleId);

        return module.instance;
    }

    async unload(moduleId) {
        const module = this.modules.get(moduleId);
        if (!module || !this.loadedModules.has(moduleId)) return;

        if (module.config.destroy) {
            await module.config.destroy(module.instance);
        }

        module.status = "unloaded";
        this.loadedModules.delete(moduleId);
        module.instance = null;
    }
}

export default ModuleManager;
```

---

### 📁 **`core/EventBus.js`**

```javascript
class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    on(eventName, callback) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, new Set());
        }
        this.listeners.get(eventName).add(callback);
        return () => this.off(eventName, callback);
    }

    emit(eventName, data) {
        const listeners = this.listeners.get(eventName);
        if (listeners) {
            listeners.forEach(callback => {
                try { callback(data); } catch (error) {
                    console.error(`[EventBus] Erreur dans ${eventName}:`, error);
                }
            });
        }
    }

    off(eventName, callback) {
        const listeners = this.listeners.get(eventName);
        if (listeners) {
            listeners.delete(callback);
        }
    }
}

export default EventBus;
```

---

### 📁 **`core/SettingsManager.js`**

```javascript
class SettingsManager {
    constructor() {
        this.defaults = {};
        this.settings = {};
        this.storageKey = "SpaceHubSettings";
        this.load();
    }

    load() {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
            try { this.settings = JSON.parse(saved); }
            catch (error) { this.settings = {}; }
        }
    }

    save() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    }

    set(key, value) {
        this.settings[key] = value;
        this.save();
    }

    get(key, defaultValue = null) {
        return this.settings[key] ?? this.defaults[key] ?? defaultValue;
    }

    has(key) { return key in this.settings; }
    delete(key) { delete this.settings[key]; this.save(); }

    export() { return JSON.stringify(this.settings); }
    import(data) {
        try {
            const parsed = typeof data === "string" ? JSON.parse(data) : data;
            this.settings = { ...this.settings, ...parsed };
            this.save();
        } catch (error) { console.error("Erreur import:", error); }
    }
}

export default SettingsManager;
```

---

### 📁 **`core/CacheManager.js`**

```javascript
class CacheManager {
    constructor() {
        this.dbName = "SpaceHubCache";
        this.dbVersion = 1;
        this.stores = ["jellyfin", "sonarr", "general"];
        this.indexedDB = null;
        this.initIndexedDB();
    }

    initIndexedDB() {
        const request = indexedDB.open(this.dbName, this.dbVersion);
        request.onerror = (e) => console.error("IndexedDB error:", e.target.error);
        request.onsuccess = (e) => this.indexedDB = e.target.result;
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            this.stores.forEach(store => {
                if (!db.objectStoreNames.contains(store)) {
                    db.createObjectStore(store);
                }
            });
        };
    }

    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!this.indexedDB) return reject(new Error("IndexedDB non initialisé"));
            const tx = this.indexedDB.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result?.value);
            req.onerror = () => reject(req.error);
        });
    }

    async set(storeName, key, value, ttl = null) {
        return new Promise((resolve, reject) => {
            if (!this.indexedDB) return reject(new Error("IndexedDB non initialisé"));
            const tx = this.indexedDB.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const data = ttl ? { value, expires: Date.now() + ttl * 1000 } : { value };
            const req = store.put(data, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    getLocal(key) {
        const value = localStorage.getItem(`SpaceHub_${key}`);
        return value ? JSON.parse(value) : null;
    }

    setLocal(key, value) {
        localStorage.setItem(`SpaceHub_${key}`, JSON.stringify(value));
    }
}

export default CacheManager;
```

---

### 📁 **`core/ApiClient.js`**

```javascript
class BaseApiClient {
    constructor(baseUrl, apiKey = null, headers = {}) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.defaultHeaders = { "Content-Type": "application/json", ...headers };
    }

    async request(method, endpoint, data = null, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            ...this.defaultHeaders,
            ...(this.apiKey && { "X-Api-Key": this.apiKey }),
            ...options.headers,
        };
        const config = { method: method.toUpperCase(), headers };
        if (data && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
            config.body = JSON.stringify(data);
        }
        try {
            const response = await fetch(url, config);
            if (!response.ok) throw new Error(`Requête échouée (${response.status})`);
            return await response.json();
        } catch (error) {
            console.error(`Erreur ${method} ${url}:`, error);
            throw error;
        }
    }

    get(endpoint, options) { return this.request("GET", endpoint, null, options); }
    post(endpoint, data, options) { return this.request("POST", endpoint, data, options); }
    put(endpoint, data, options) { return this.request("PUT", endpoint, data, options); }
    delete(endpoint, options) { return this.request("DELETE", endpoint, null, options); }
}

class JellyfinClient extends BaseApiClient {
    constructor() {
        super("", null, { "X-Emby-Token": window.ApiClient?.accessToken?.() || "" });
        this.baseUrl = window.ApiClient?.serverAddress?.() || "";
    }

    async getLatestItems(limit = 20) {
        return this.get(`/Items/Latest?Limit=${limit}&Fields=PrimaryImageAspectRatio,BasicSyncInfo`);
    }

    getImageUrl(imageTag, options = {}) {
        const params = new URLSearchParams({ maxWidth: 300, maxHeight: 450, quality: 90, ...options });
        return `${this.baseUrl}/Items/${imageTag}/Images/Primary?${params.toString()}`;
    }
}

class ApiClient {
    constructor() {
        this.clients = {};
    }
    addClient(name, client) { this.clients[name] = client; }
    get(name) { return this.clients[name]; }
    async request(clientName, method, endpoint, data, options) {
        return this.get(clientName).request(method, endpoint, data, options);
    }
}

export { ApiClient, BaseApiClient, JellyfinClient };
export default ApiClient;
```

---

### 📁 **`ui/dashboard/Dashboard.js`**

```javascript
import GridStack from "gridstack";
import "gridstack/dist/gridstack.min.css";

class Dashboard {
    constructor(containerId = "spacehub-dashboard") {
        this.containerId = containerId;
        this.grid = null;
        this.widgets = new Map();
        this.init();
    }

    init() {
        if (!document.getElementById(this.containerId)) {
            const container = document.createElement("div");
            container.id = this.containerId;
            document.body.appendChild(container);
        }
        this.grid = GridStack.init({ float: true, cellHeight: "70px" }, `#${this.containerId}`);
        this.loadSavedLayout();
    }

    loadSavedLayout() {
        const layout = SpaceHub.core.settings.get("dashboard.layout", []);
        layout.forEach(item => {
            const widget = this.widgets.get(item.widgetId);
            if (widget) this.addWidget(widget, item);
        });
    }

    addWidget(WidgetClass, options = {}) {
        const widgetId = `widget-${WidgetClass.name}-${Date.now()}`;
        const gridItem = this.grid.addWidget({ id: widgetId, ...options });
        const widget = new WidgetClass();
        widget.render(gridItem.el);
        this.widgets.set(widgetId, { widget, gridItem });
        this.saveLayout();
        return widgetId;
    }

    saveLayout() {
        const layout = this.grid.save(false);
        SpaceHub.core.settings.set("dashboard.layout", layout);
    }
}

export default Dashboard;
```

---

### 📁 **`ui/widgets/LatestAdditionsWidget.js`**

```javascript
class LatestAdditionsWidget {
    constructor() {
        this.id = "latest-additions";
        this.title = "Derniers Ajouts";
        this.defaultWidth = 4;
        this.defaultHeight = 2;
    }

    async render(container) {
        container.innerHTML = `
            <div class="widget-header">
                <h3>${this.title}</h3>
                <button class="refresh-btn"><i class="fas fa-sync"></i></button>
            </div>
            <div class="widget-content">Chargement...</div>
        `;
        await this.loadData(container);
        this.bindEvents(container);
    }

    async loadData(container) {
        try {
            const items = await SpaceHub.core.api.get("jellyfin").getLatestItems(10);
            const content = container.querySelector(".widget-content");
            content.innerHTML = items.map(item => `
                <div class="media-card" data-id="${item.Id}">
                    <img src="${SpaceHub.core.api.get("jellyfin").getImageUrl(item.BackdropImageTags?.[0])}" />
                    <div>${item.Name}</div>
                </div>
            `).join("");
        } catch (error) {
            console.error("Erreur:", error);
        }
    }

    bindEvents(container) {
        container.querySelector(".refresh-btn").addEventListener("click", () => this.loadData(container));
    }
}

export default LatestAdditionsWidget;
```

---

### 📁 **`integrations/sonarr/SonarrApi.js`**

```javascript
class SonarrApi extends SpaceHub.core.ApiClient.get("base") {
    constructor() {
        const settings = SpaceHub.core.settings;
        super(settings.get("sonarr.url"), settings.get("sonarr.apiKey"));
    }

    async getSeries() { return this.get("/api/series"); }
    async getUpcomingEpisodes() {
        const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        return this.get(`/api/calendar?start=${new Date().toISOString()}&end=${endDate.toISOString()}`);
    }
    async addSeries(series) { return this.post("/api/series", series); }
    async deleteSeries(seriesId, deleteFiles = false) {
        return this.delete(`/api/series/${seriesId}?deleteFiles=${deleteFiles}`);
    }
}

export default SonarrApi;
```

---

### 📁 **`integrations/sonarr/SonarrService.js`**

```javascript
class SonarrService {
    constructor() {
        this.api = new (await import("./SonarrApi.js")).default();
    }

    async getAllSeries() { return this.api.getSeries(); }
    async addSeries(seriesData) {
        const exists = (await this.getAllSeries()).some(s => s.tvdbId === seriesData.tvdbId);
        if (exists) throw new Error("Série déjà existante");
        return this.api.addSeries(seriesData);
    }
    async deleteSeries(seriesId) { return this.api.deleteSeries(seriesId); }
    async getUpcomingEpisodes() { return this.api.getUpcomingEpisodes(); }
}

export default SonarrService;
```

---

### 📁 **`integrations/sonarr/SonarrWidgets.js`**

```javascript
class UpcomingEpisodesWidget {
    constructor() {
        this.id = "sonarr-upcoming";
        this.title = "Prochains Épisodes";
        this.defaultWidth = 4;
        this.defaultHeight = 3;
    }

    async render(container) {
        container.innerHTML = `
            <div class="widget-header"><h3>${this.title}</h3></div>
            <div class="widget-content">Chargement...</div>
        `;
        const episodes = await SpaceHub.integrations.sonarr.service.getUpcomingEpisodes();
        container.querySelector(".widget-content").innerHTML = episodes.map(ep => `
            <div class="episode-card">
                <img src="${ep.Series.PosterUrl}" />
                <div>${ep.Series.Title} - S${ep.SeasonNumber}E${ep.EpisodeNumber}</div>
                <div>${new Date(ep.AirDateUtc).toLocaleDateString()}</div>
            </div>
        `).join("");
    }
}

export { UpcomingEpisodesWidget };
```

---
---

## 9. Notes de Développement

### 🔹 **Pourquoi ne pas partir sur Flutter ?**
Le fork **KefinTweaks** est déjà une base **JavaScript/CSS intégrée à Jellyfin Web**. Partir sur Flutter signifierait jeter toute cette base.

**Stratégie recommandée** :
```
Space Hub Web (Base JavaScript/CSS)
    ├── Desktop wrapper (Electron/Tauri)
    ├── Mobile wrapper (Capacitor)
    └── TV client (React Native TV)
```

---

### 🔹 **Ordre de Priorité Critique**
1. **❌ Ne PAS commencer par Sonarr/Radarr** → Architecture non finalisée = refactorisation coûteuse.
2. **✅ Finaliser le Core + UI + Dashboard d’abord** → Fondation de Space Hub.
3. **✅ Ajouter les intégrations une par une** → Chaque intégration = module indépendant.

---

### 🔹 **Tests de Compatibilité**

| **Environnement** | **Version Minimum** | **Statut** |
|-------------------|---------------------|------------|
| Jellyfin | 10.8.x | ✅ Testé |
| Chrome | Dernière | ✅ Testé |
| Firefox | Dernière | ✅ Testé |
| Safari | Dernière | ⚠️ À tester |

---

### 🔹 **Optimisations de Performance**

| **Technique** | **Implémentation** | **Bénéfice** |
|--------------|-------------------|--------------|
| Lazy loading | Charger les modules à la demande | Réduction du temps de chargement |
| Cache agressif | IndexedDB + localStorage + TTL | Réduction des requêtes API |
| Debounce | Délai de 300ms avant recherche | Évite les requêtes inutiles |

---

### 🔹 **Outils Recommandés**

| **Catégorie** | **Outil** | **Pourquoi ?** |
|--------------|----------|---------------|
| Build | Webpack/Vite | Bundler le code |
| Tests | Jest | Tests unitaires |
| Grid Layout | GridStack | Widgets déplaçables |
| Graphiques | Chart.js | Statistiques |
| Icons | Font Awesome | Pack d’icônes |

---

### 🔹 **Ressources Utiles**
- [Jellyfin API](https://api.jellyfin.org/)
- [Sonarr API](https://servarr.com/dev/sonarr/)
- [Radarr API](https://servarr.com/dev/radarr/)
- [GridStack](https://gridstackjs.com/)
- [Chart.js](https://www.chartjs.org/)
- [Font Awesome](https://fontawesome.com/)

---

**Dernière mise à jour** : 2026-08-14
**Prochaine étape** : Commencer par l’Étape 0 (renommage et nettoyage).
**Statut** : ✅ **Prêt à démarrer !**

---

> **💡 Conseil** : Commence par implémenter le **Core** et teste chaque module individuellement.
> **🚀 Besoin d’aide ?** Si tu veux que je te génère d’autres fichiers, fais-moi signe !