# Signature Windows et mises à jour automatiques — état des lieux et décision

*Document de décision — septembre 2026. Les prix et comportements cités sont
à revérifier au moment de l'achat ; les sources principales sont la
documentation Microsoft « Code signing options » et « SmartScreen reputation »,
la référence electron-builder (Code Signing for Windows) et les incidents
communautaires référencés en fin de document.*

## État actuel (v1.1.0)

- `SpaceHub-Setup-*.exe` (NSIS) et `SpaceHub-*-portable.exe` sont **non signés**
  (`signAndEditExecutable: false` dans la bobine). SmartScreen affiche un
  avertissement « Éditeur inconnu » au premier lancement ; le README le
  documente (« Exécuter quand même »).
- Aucun auto-update : l'utilisateur télécharge chaque nouvelle release depuis
  GitHub. C'est cohérent avec un client destiné à des serveurs Jellyfin
  auto-hébergés, mais ça repose sur l'utilisateur pour rester à jour.

## Pourquoi signer : les trois bénéfices concrets

1. **SmartScreen** : un binaire signé par un certificat avec réputation réduit
   l'avertissement — jusqu'à le faire disparaître une fois la réputation
   établie (voir plus bas : ce n'est pas instantané avec un OV).
2. **Chaîne d'identité** : l'éditeur affiché dans l'UAC et les propriétés du
   fichier devient vérifiable. Un binaire non signé pourrait être remplacé
   sur un miroir sans que l'utilisateur puisse le distinguer.
3. **Prérequis de l'auto-update vérifié** : electron-updater peut vérifier la
   signature de chaque mise à jour téléchargée. C'est le verrou qui rend
   l'auto-update acceptable pour une app qui touche à des identifiants
   Jellyfin.

## Les options de certificat, évaluées pour ce dépôt

Contexte qui contraint tout : **CI Linux (GitHub Actions), un seul mainteneur,
projet gratuit**. Toute option exigeant un matériel physique branché à chaque
build est disqualifiée pour la CI.

| Option | Coût (2026) | SmartScreen | CI sans matériel | Verdict |
|---|---|---|---|---|
| **Azure Artifact Signing** (ex-Trusted Signing), profil **public** | ~9,99 $/mois (Basic : 5 000 signatures/mois, puis ~0,005 $) | Réputation acquise avec le volume signé ; le CA d'émission a changé en mars 2026 et a temporairement réveillé des avertissements (incident référencé) — le service reste la recommandation de Microsoft pour la distribution hors Store | Oui — signature cloud, identité par Entra ID (3 variables d'env), support natif electron-builder `win.sign: { type: "azure" }` | **Recommandée** dès qu'on signe. Validation d'identité à la création (individu accepté), clé jamais manipulée, aucune infrastructure |
| OV classique (DigiCert/Sectigo/SSL.com) | ~200-400 €/an, renouvelable | « Éditeur inconnu » pendant des semaines/mois le temps d'accumuler de la réputation par téléchargements — puis disparaît | Oui : les OV s'exportent en .pfx (méthode `signtool`, variable `WIN_CSC_LINK`), ça marche depuis Linux via osslsigncode | Alternative si on veut éviter Azure ; avertissements persistants au début |
| EV classique | ~300-500 €/an | Réputation SmartScreen immédiate (historiquement) | Non en pratique : clé verrouillée sur token physique (méthodes `hsm`/`pkcs11` possibles mais avec pilote CSP sur le runner, et le bénéfice « confiance immédiate » est de moins en moins garanti selon Microsoft) | Écartée : coût + friction CI pour un bénéfice qui s'estompe |
| Self-signed / certificat de test | 0 | Aucun bénéfice : avertissement permanent, pas de réputation possible | Oui | Écarté : ne résout rien |

### Sur la réputation SmartScreen (le point mal compris)

- La réputation est **par éditeur et par fichier**, accumulée par les
  téléchargements et exécutions réels. Signer n'efface pas l'avertissement
  du premier build : avec un OV il faut des téléchargements ; avec Azure
  public, même mécanique (les profils Public Trust émettent des certificats
  OV-equivalents).
- **L'horodatage (RFC 3161) est non négociable** : sans lui, la signature
  meurt à l'expiration du certificat ; avec, les builds signés restent
  valides après. electron-builder horodate par défaut
  (`http://timestamp.digicert.com`, `http://timestamp.acs.microsoft.com`
  pour Azure).
- **Ne jamais changer de nom d'éditeur** entre deux releases : la réputation
  suit le sujet du certificat. Si rotation de certificat il y a, garder le
  même CN et lister les deux éditeurs (`publisherName` est un tableau dans
  electron-builder précisément pour ça).
- Un build signé au repo d'identité différent (nouveau CA, nouveau sujet)
  repart de zéro. L'incident de mars 2026 (rotation de CA côté Azure) a
  montré que même le service de Microsoft peut voir sa CA changer : la
  réputation se reconstruit, la signature reste valide.

## Auto-update : faut-il le brancher sur la cible NSIS ?

**Oui, mais seulement une fois la signature en place, et avec une mise à jour
par canal explicite — pas un flag implicite.**

### Ce qu'apporte electron-updater

- Vérification **`latest.yml` + SHA512 + signature Authenticode** du binaire
  téléchargé (`verifyUpdateCodeSignature`, actif dès qu'une signature
  existe ; le `publisherName` est écrit dans `app-update.yml` et comparé au
  certificat du paquet téléchargé).
- Détection du canal (latest/beta/alpha), téléchargement en arrière-plan,
  installation à la fermeture — sans réinstaller.
- Les mises à jour différentielles (blockmap) économisent ~90 % du trafic
  sur un installeur de 112 Mo — non négligeable pour un projet sans
  infrastructure : GitHub Releases est un serveur de mises à jour
  parfaitement supporté (`provider: github`).

### Les risques, réels mais bornés

1. **Sans signature, l'auto-update est une attaque** : n'importe qui capable
   de remplacer `latest.yml` sur le canal (miroir, réseau local, compromission
   du repo) pousse un binaire arbitraire exécuté par l'app. C'est la raison
   de l'ordre : **signature d'abord, auto-update ensuite**. Le bypass
   historique de vérification (Doyensec 2020, corrigé) rappelle que cette
   vérification est une surface de sécurité active, pas un bonus.
2. **Le portable reste hors auto-update** : electron-updater ne sait mettre à
   jour que les cibles installées (NSIS ici). Le portable reste
   téléchargement manuel — c'est cohérent avec sa nature.
3. **La mise à jour NSIS relance l'installeur** : c'est le mode
   `nsis-web`/`oneClick` qui est le plus fluide ; sur `oneClick: false` (le
   nôtre, assisté), l'utilisateur voit l'installeur pré-rempli. Acceptable.

### Décision et plan de câblage

**Étape 1 — signer (bloquant pour la suite).** Profil public Azure Artifact
Signing :

1. Compte Azure → « Trusted Signing » (Artifact Signing), validation
   d'identité (individu OK), profil de certificat **Public Trust**.
2. App registration Entra ID + secret, rôle
   « Trusted Signing Certificate Profile Signer ».
3. Secrets GitHub : `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
   (+ `AZURE_ENDPOINT`, `AZURE_CODE_SIGNING_ACCOUNT_NAME`,
   `AZURE_CERTIFICATE_PROFILE_NAME`).
4. Bobine Electron (`scripts/preparer-bobines.mjs`) :
   ```js
   win: {
     sign: {
       type: 'azure',
       publisherName: 'CN=<sujet exact du certificat>',
       endpoint: process.env.AZURE_ENDPOINT,
       codeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT_NAME,
       certificateProfileName: process.env.AZURE_CERTIFICATE_PROFILE_NAME,
     },
   }
   ```
   (retirer `signAndEditExecutable: false`) — sans secrets présents, le
   workflow continue en non-signé pour que la CI ne casse pas.
5. Workflow `paquets.yml` : injecter les secrets dans le job exe ; vérifier la
   signature avec `Get-AuthenticodeSignature` et échouer si `NotSigned`.

**Étape 2 — auto-update NSIS.**

1. Ajouter `electron-updater` en dépendance du paquet Electron (pas du web).
2. `main.js` : import conditionnel, poll toutes les 6 h + au démarrage
   (délai aléatoire 0-10 min pour éviter les pics), canal = canal du build.
3. `publish: { provider: 'github', owner: 'nicoo-o', repo: 'SpaceHub' }` dans
   la config electron-builder ; `latest.yml` + `.blockmap` joints à la
   release à côté des .exe (le workflow les téléverse déjà par motif —
   étendre le motif).
4. Préférence « mises à jour automatiques » dans les réglages, par défaut
   activée, désactivable. Un auto-update non désactivable est hostile pour
   un client auto-hébergé qui maîtrise ses versions.
5. Ne jamais auto-installer sans consentement : télécharger en arrière-plan,
   installer à la fermeture (`autoInstallOnAppQuit`, défaut).

### Ce qui ne change pas

- L'APK garde son propre mécanisme (signature keystore dédiée, mise à jour
  par réinstallation — pas de play store).
- L'archive web reste le canal zéro-install, jamais mise à jour
  automatiquement (elle n'est pas exécutée depuis un disque).
- Le portable reste manuel (voir risques).

## Références

- Microsoft — Code signing options for Windows app developers ;
  SmartScreen reputation (learn.microsoft.com).
- Azure Artifact Signing — tarification (azure.microsoft.com).
- electron-builder — Code Signing for Windows (méthodes `signtool`/`hsm`/
  `pkcs11`/`azure`, `publisherName`, horodatage RFC 3161).
- Doyensec — « Signature Validation Bypass Leading to RCE In Electron-Updater »
  (février 2020) : pourquoi la vérification de signature est critique.
- Incident communautaire mars-avril 2026 — rotation de CA Azure
  (`Microsoft ID Verified CS AOC CA 03`) et avertissements SmartScreen
  passagers : learn.microsoft.com/answers, GitHub `Azure/artifact-signing-action#128`.
