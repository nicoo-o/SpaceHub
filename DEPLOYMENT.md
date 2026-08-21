# SpaceHub — Guide de Build & Déploiement

Ce guide explique comment construire et déployer SpaceHub sur les différentes plateformes : Desktop (Electron), Mobile (Capacitor) et TV (Android TV).

## Prérequis

- Node.js 18+ 
- npm ou yarn
- Pour Desktop : Electron Builder
- Pour Mobile : Android Studio / Xcode
- Pour TV : Android Studio avec SDK Android TV

## Build Web (Base)

```bash
# Installer les dépendances
npm install

# Build de production
npm run build

# Preview du build
npm run preview
```

Le build web sera généré dans le dossier `dist/`.

---

## Desktop (Electron)

### Installation

```bash
cd electron
npm install
```

### Développement

```bash
# Lancer en mode développement
npm start
```

### Build Production

```bash
# Build pour Windows
npm run build:win

# Build pour macOS  
npm run build:mac

# Build pour Linux
npm run build:linux
```

Les builds seront générés dans `dist-electron/`.

### Fonctionnalités Desktop

- Stockage sécurisé via keytar (Keychain macOS, Credential Manager Windows, libsecret Linux)
- Auto-updater intégré
- Menu natif
- Gestion fenêtre (minimize, maximize, close)
- Détection plateforme

---

## Mobile (Capacitor)

### Installation

```bash
cd capacitor
npm install
```

### Configuration

```bash
# Synchroniser avec le build web
npm run sync

# Ouvrir Android Studio
npm run open:android

# Ouvrir Xcode
npm run open:ios
```

### Build Android

```bash
cd android
./gradlew assembleDebug    # Debug
./gradlew assembleRelease  # Release
```

### Build iOS

```bash
cd ios
pod install
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug
```

### Fonctionnalités Mobile

- Splash screen personnalisé
- Status bar dark mode
- Gestion clavier
- Stockage sécurisé (Keychain iOS, Keystore Android)
- Navigation native

---

## Android TV

### Installation

```bash
# Ouvrir le projet dans Android Studio
# Le projet se trouve dans android-tv/
```

### Configuration

1. Importer le projet dans Android Studio
2. Configurer le keystore de signature dans `buildOptions`
3. Copier le build web dans `android-tv/app/src/main/assets/dist/`

### Build

```bash
cd android-tv
./gradlew assembleDebug    # Debug
./gradlew assembleRelease  # Release
```

### Déploiement

```bash
# Installer sur un appareil connecté
./gradlew installDebug

# Générer l'APK
./gradlew assembleRelease
# L'APK sera dans app/build/outputs/apk/release/
```

### Fonctionnalités TV

- Interface Leanback (10-foot UI)
- Navigation D-pad
- Mode TV activé automatiquement
- Support télécommande
- Lecture vidéo avec ExoPlayer
- Banner pour launcher Android TV

---

## Stockage Sécurisé

Le service `SecureStorage` gère automatiquement le stockage des clés API :

### Desktop (Electron)
- Utilise `keytar` pour accéder au coffre-fort système
- macOS : Keychain
- Windows : Credential Manager  
- Linux : libsecret / Secret Service

### Mobile (Capacitor)
- iOS : Keychain
- Android : Keystore

### Web (Fallback)
- Chiffrement AES-GCM avec Web Crypto API
- Clé de chiffrement stockée dans localStorage
- Migration automatique depuis localStorage non sécurisé

### Migration

```javascript
// Dans le code d'initialisation
const secureStorage = new SecureStorage();
await secureStorage.migrateFromLocalStorage();
```

---

## Auto-Updates (Desktop)

L'application Electron supporte les mises à jour automatiques :

1. Configurer l'URL des releases dans `electron/main.js`
2. Héberger les releases sur un serveur
3. L'application vérifie automatiquement les mises à jour
4. L'utilisateur est notifié quand une mise à jour est disponible

---

## Structure des Builds

```
dist/                    # Build web (base)
├── index.html
├── assets/
└── ...

dist-electron/           # Builds Electron
├── SpaceHub-1.0.0-win.exe
├── SpaceHub-1.0.0-mac.dmg
└── SpaceHub-1.0.0-linux.AppImage

android-tv/app/build/    # Build Android TV
└── outputs/apk/release/
    └── app-release.apk

capacitor/android/app/build/  # Build Mobile Android
└── outputs/apk/release/

capacitor/ios/build/          # Build Mobile iOS
```

---

## Signature des Builds

### Android

```bash
# Générer un keystore
keytool -genkey -v -keystore spacehub.keystore -alias spacehub -keyalg RSA -keysize 2048 -validity 10000

# Configurer dans capacitor.config.json ou android-tv/build.gradle
```

### iOS

La signature se fait via Xcode avec les certificats de développement/distribution Apple.

### Windows

La signature peut être ajoutée via Electron Builder avec un certificat Code Signing.

---

## Déploiement

### Desktop

- Windows : Installer MSI/EXE ou portable
- macOS : DMG ou PKG
- Linux : AppImage, DEB ou RPM

### Mobile

- Android : APK via Google Play Store ou sideload
- iOS : IPA via App Store (nécessite compte développeur)

### TV

- Android TV : APK via Google Play Store (catégorie TV)
- Fire TV : APK via Amazon Appstore

---

## Variables d'Environnement

### Développement

```bash
NODE_ENV=development
```

### Production

```bash
NODE_ENV=production
```

### Electron

```bash
# Pour activer le dev server Vite
NODE_ENV=development npm start
```

---

## Dépannage

### Erreur de build Electron

```bash
# Nettoyer les caches
npm run build -- --clean
rm -rf dist-electron
```

### Erreur build Android

```bash
# Nettoyer le projet Gradle
cd android
./gradlew clean
```

### Erreur build iOS

```bash
# Nettocher les pods
cd ios
pod deintegrate
pod install
```

### Problèmes de stockage sécurisé

```bash
# Vérifier que keytar est installé correctement
cd electron
npm list keytar

# Sur Linux, vérifier que libsecret est installé
sudo apt-get install libsecret-1-dev
```

---

## Scripts Utiles

### Build complet toutes plateformes

```bash
# Build web
npm run build

# Build Desktop
cd electron && npm run build && cd ..

# Build Mobile Android
cd capacitor && npm run sync && cd android && ./gradlew assembleRelease && cd ../..

# Build TV
cd android-tv && ./gradlew assembleRelease && cd ..
```

### Déploiement rapide

```bash
# Web → Preview
npm run preview

# Desktop → Dev
cd electron && npm start

# Mobile → Dev sur appareil
cd capacitor && npm run sync && npm run open:android
```

---

## Support

Pour les problèmes de build ou déploiement, consulter :

- [Electron Builder Documentation](https://www.electron.build/)
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Android TV Documentation](https://developer.android.com/training/tv)
