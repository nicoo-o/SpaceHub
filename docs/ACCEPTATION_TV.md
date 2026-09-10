# Acceptation TV — le protocole de session

## POURQUOI CE FICHIER EXISTE

Toute la chaîne de vérification du dépôt roule dans Chromium sur un poste de
développement : elle prouve que le *site* est correct, pas que la *boîte* qui
l'embarque l'est. L'APK est la première voie du projet qu'aucun test n'exécute —
le lanceur LEANBACK, la bannière, la prise de focus par D-pad et les touches de
la télécommande n'existent que sur le vrai matériel. Cette session est le seul
contrat qui les couvre. Elle se déroule devant la télévision, télécommande à la
main, et se conclut par une entrée dans le journal en fin de fichier.

Rappel de conception : `scripts/preparer-bobines.mjs` déclare la bannière
(`@drawable/banner`), le `uses-feature` leanback **non requis** (l'APK reste
installable sur téléphone) et le second intent-filter `LEANBACK_LAUNCHER`.
Cette session vérifie que tout cela survit à la fusion du manifeste et au
lanceur réel de la TV — exactement ce que l'acceptation de la v1.1.0 cherchait.

## IDENTITÉ DE LA SESSION

| | |
|---|---|
| Version | **v1.2.0** — paquet `io.spacehub.app`, versionCode 10200 |
| APK     | `build/acceptation-tv/spacehub-v1.2.0.apk` |
| SHA-256 | `aab31aae30c562e23197c03c34af0c532b1e7dd4c0a265e6bb8569c12f296a70` |
| Source  | Release GitHub v1.2.0 — les octets exacts produits et vérifiés par la CI |
| État    | ☐ téléchargé + somme contrôle vérifiée — **fait le 2026-09-10** |

## ÉTAPE 0 — OUTILLAGE (UNE SEULE FOIS)

Sur le PC (aucun Android Studio requis) :

- **Windows** : `winget install --id Google.PlatformTools -e` (ouvrir un
  *nouveau* terminal ensuite), ou le zip « SDK Platform-Tools » de
  developer.android.com extrait quelque part de stable.
- Vérifier : `adb version` affiche une version.

Sur la TV :

1. `Paramètres` → `Préférences relatives à l'appareil` → `À propos` →
   cliquer 7 fois sur `Build` → « Vous êtes développeur ».
2. Revenir : `Options pour développeurs` → activer
   `Débogage réseau` (ou `Débogage USB`, selon la TV).
3. Noter l'adresse IP de la TV (`Paramètres` → `Réseau et Internet`).
   PC et TV doivent être sur le même réseau local.

## ÉTAPE 1 — CONNEXION ADB

```bash
adb connect IP_DE_LA_TV:5555
adb devices          # → IP_DE_LA_TV:5555   device
```

Si la TV affiche une boîte de dialogue d'autorisation (empreinte RSA),
l'accepter avec la télécommande. En cas d'échec : `adb disconnect`, re-vérifier
l'IP, réessayer ; certaines TV coupent le débogage réseau au sommeil.

## ÉTAPE 2 — SIDELoad

```bash
adb install -r build/acceptation-tv/spacehub-v1.2.0.apk
# → Success
```

- **`INSTALL_FAILED_UPDATE_INCOMPATIBLE`** : une version précédente, signée par
  une autre clé éphémère (v1.1.0 sans keystore promu), occupe le paquet.
  Conséquence attendue et documentée de la clé de bootstrap — faire
  `adb uninstall io.spacehub.app` puis réinstaller, **et le noter au journal** :
  c'est un vote de plus pour la promotion du keystore en secret.
- Contrôle : `Paramètres` → `Applications` → `SpaceHub` → version **1.2.0**.

## ÉTAPE 3 — LANCEUR LEANBACK ET BANNIÈRE

À la télécommande, depuis l'accueil de la TV :

- ☐ **L1 — Tuile présente.** SpaceHub apparaît dans les applications de
  l'ACCUEIL TV (rangée Apps, ou onglet Applications sur Google TV) — pas
  seulement dans « Toutes les applications système ».
- ☐ **L2 — Bannière correcte.** La tuile montre l'illustration SpaceHub, pas
  le robot Android par défaut (c'est exactement le défaut que les trois rondes
  d'emballage de v1.1.0 ont corrigé : icônes déclarées, bannière dans le
  projet gradle).
- ☐ **L3 — Titre lisible.** Le libellé sous la tuile est « SpaceHub ».

Preuve en ligne de commande (complète le visuel) :

```bash
adb shell cmd package resolve-activity -c android.intent.category.LEANBACK_LAUNCHER io.spacehub.app
# → activity name: io.spacehub.app/.MainActivity  (ou équivalent, jamais « No activity found »)
adb shell dumpsys package io.spacehub.app | grep -B1 -A3 LEANBACK
# → le second intent-filter avec la catégorie LEANBACK_LAUNCHER
```

Lancer : tuile sélectionnée → `OK`, ou filet de secours :
`adb shell monkey -p io.spacehub.app -c android.intent.category.LAUNCHER 1`.

## ÉTAPE 4 — NAVIGATION À LA TÉLÉCOMMANDÉE (LE CŒUR DE LA SESSION)

Prérequis applicatif : un serveur Jellyfin joignable et au moins un média
jouable. Chaque case se cochet devant l'écran — D-pad = croix directionnelle,
`OK` = touche centrale.

| # | Vérification | Verdict |
|---|---|---|
| N1 | Connexion au serveur possible entièrement au D-pad (saisie d'URL/identifiants au clavier écran ou clavier connecté) | ☐ |
| N2 | **Haut/Bas** déplacent le focus carte par carte sur la grille, jamais bloqués en bord | ☐ |
| N3 | **Gauche/Droite** idem, avec défilement fluide quand le contenu dépasse l'écran | ☐ |
| N4 | **OK** active la carte focus (fiche média ouvre) | ☐ |
| N5 | **Retour** ferme la fiche et rend le focus sur la *même* carte (pas en haut de grille) | ☐ |
| N6 | Retour depuis la grille : sortie propre vers l'accueil TV, pas d'impasse | ☐ |
| N7 | Lecture : **OK** affiche l'OSD, il s'efface seul après quelques secondes | ☐ |
| N8 | Lecture : touche **Lecture/Pause** de la télécommande (et OK quand l'OSD est affiché) | ☐ |
| N9 | Lecture : **Gauche/Droite** font un seek visible, avec retour au même endroit après pause/reprise | ☐ |
| N10 | **Retour** pendant la lecture : arrête proprement (pas de son fantôme en arrière-plan) | ☐ |
| N11 | Veille TV puis réveil : l'app reste utilisable, session non perdue | ☐ |
| N12 | Accueil TV puis retour dans l'app : reprise correcte (ni redémarrage lourd ni écran mort) | ☐ |

Captures utiles si un doute doit être départagé plus tard — en une commande :

```bash
node scripts/triage-tv.mjs IP_DE_LA_TV
# → build/triage-tv/AAAA-MM-JJ-HHmmss/ : logcat-filtre.txt (ANR/fatal/SpaceHub) + ecran.png
```

## ÉTAPE 5 — VERDICT ET CONSIGNATION

- **Vert** : L1–L3, N1–N12 tous cochés → la voie TV de cette version est
  acceptée ; le journal ci-dessous reçoit une ligne datée.
- **Grisé/Bloqué** : toute case non cochée → noter la case, le comportement
  observé et le résultat attendu ; un problème de navigation ou de lanceur
  devient un ticket avant la prochaine version.

Le journal s'ajoute — on n'efface jamais une session précédente.

## JOURNAL DES SESSIONS

| Date | Version | Étapes faites | Résultat | Notes |
|---|---|---|---|---|
| (à compléter) | v1.2.0 | 0→2 faits, 3–5 en attente de la TV | — | APK vérifié côté PC ; ADB absent de la machine au moment de la préparation |
