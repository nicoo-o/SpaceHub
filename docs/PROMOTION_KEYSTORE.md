# Promotion du keystore d'amorçage — la clé devient un secret

## Pourquoi

Sans secret `ANDROID_KEYSTORE`, le workflow Paquets signe l'APK avec une clé
**éphémère** générée à la volée : parfaite pour tester, inutilisable pour
enchaîner les mises à jour — l'APK suivant, signé par une autre clé, refuse
de s'installer par-dessus (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`, vu en
recette). Pour que les versions futures s'installent **en place**, il faut
promouvoir la clé d'amorçage en secret permanent.

L'urgence est datée : le keystore d'amorçage est téléversé comme **artefact
de run à rétention 30 jours** (`keystore-amorcage-a-promouvoir-en-secret`).
Passé ce délai il est détruit, et la promotion devient impossible
(`scripts/verifier-amorcage-keystore.mjs` et la veille planifiée
`veille-keystore.yml` alertent dans les 7 derniers jours).

## Historique — la clé v1.2.0 est perdue, la v1.3.0 a été amorcée

C'est en préparant la v1.3.0 (10 septembre 2026) que le trou a été trouvé, et
il était double. Les deux défauts sont corrigés ; ils valent d'être lus parce
que le premier a coûté une clé de signature définitive.

1. **Le keystore était copié hors du chemin téléversé.** Le script écrivait
   `../keystore-amorcage/` **depuis `build/cordova`** — donc
   `build/keystore-amorcage/` — tandis que l'étape d'upload regardait
   `keystore-amorcage/` à la racine. Avec `if-no-files-found: ignore`,
   l'étape se terminait en **succès sans rien téléverser**. Les runs v1.2.0
   affichaient donc une empreinte SHA-256… pour une clé détruite avec le
   runner. C'est la perte de la clé v1.2.0.
   → chemin corrigé (`../../`), et l'étape n'est plus armée que par la sortie
   d'amorçage de l'étape de signature, avec `if-no-files-found: error` : une
   clé attendue et absente est désormais un **échec bruyant**.
2. **Le secret `ANDROID_KEYSTORE` n'était jamais décodé.** Il ne servait que
   de drapeau (`[ -z "$KEYSTORE_B64" ]`) : une fois posé, il sautait la
   génération de la clé éphémère, puis gradle recevait
   `--keystore=spacehub.keystore` sur un fichier que personne n'avait écrit.
   La promotion documentée ici **cassait le build** au lieu de signer avec la
   clé permanente.
   → le base64 est décodé dans le dossier de build jetable, derrière une
   porte `keytool -list` qui échoue avec un message actionnable.

Une nouvelle clé a donc été amorcée par un run manuel sur `main`
(run `34535888698`, 10 septembre 2026 22:08 UTC, correctifs en place), puis
promue en secret le même jour à 22:15 UTC.

**La clé de la v1.3.0 :**

| | |
|---|---|
| Type de magasin | PKCS#12 (défaut de Java 9+ pour `keytool` sans `-storetype`) |
| Alias | `spacehub` |
| Storepass / keypass | `spacehub-ephemere` |
| Certificat | `C=FR, O=SpaceHub, OU=Ephemeral, CN=SpaceHub` |
| Validité | 10 000 jours (jusqu'au 26 janvier 2054) |
| **Empreinte SHA-256** | `22:1B:F9:40:E8:1C:58:DB:E4:B5:6D:AB:C5:EB:B8:57:77:CD:AF:EA:17:57:01:3D:ED:5F:4B:D6:08:F9:48:9E` |

**Conséquence à assumer une fois :** les APK publiés avant la v1.3.0 ont été
signés par des clés perdues. Leurs utilisateurs devront **désinstaller puis
réinstaller** une fois ; à partir de la v1.3.0, les mises à jour s'installent
en place.

## La procédure (une seule fois, ~10 minutes)

### 1. Localiser le run et l'artefact

Le run Paquets d'amorçage n'a aucun secret de signature et n'est pas attaché
à une release : il produit l'artefact `keystore-amorcage-a-promouvoir-en-secret`.

```bash
gh run download --repo nicoo-o/SpaceHub --name keystore-amorcage-a-promouvoir-en-secret
# → spacehub-ephemere.keystore
```

### 2. Vérifier l'empreinte (ne JAMAIS sauter)

L'artefact doit correspondre à la clé dont le **résumé du run** affiche
l'empreinte (étape `Signature de l'APK`). Avec un JDK :

```bash
keytool -list -v -keystore spacehub-ephemere.keystore -storepass spacehub-ephemere \
  -alias spacehub | grep 'SHA256:'
```

Sans JDK, `openssl` suffit — et c'est aussi la façon la plus directe de
vérifier qu'un fichier PKCS#12 est réellement lisible avant de le promouvoir :

```bash
openssl pkcs12 -in spacehub-ephemere.keystore -passin pass:spacehub-ephemere \
  -nokeys -clcerts -nomacver 2>/dev/null \
  | openssl x509 -noout -subject -dates -fingerprint -sha256
```

Contrôler au passage que `notBefore` tombe **à l'horodatage du run** : une
clé éphémère créée par ce run-là ne peut pas porter une date antérieure.
Identiques → on continue. Différentes → STOP : l'artefact a été altéré ou mal
téléchargé, ne rien promouvoir.

### 3. Encoder en base64

```bash
base64 -w0 spacehub-ephemere.keystore   # Linux / Git Bash
```

### 4. Poser les secrets

GitHub → Settings → Secrets and variables → Actions, ou en une commande :

```bash
base64 -w0 spacehub-ephemere.keystore | gh secret set ANDROID_KEYSTORE --repo nicoo-o/SpaceHub
gh secret set ANDROID_KEYSTORE_PASSWORD --repo nicoo-o/SpaceHub --body 'spacehub-ephemere'
gh secret set ANDROID_KEY_PASSWORD      --repo nicoo-o/SpaceHub --body 'spacehub-ephemere'
gh secret set ANDROID_KEY_ALIAS         --repo nicoo-o/SpaceHub --body 'spacehub'
```

Le mot de passe est public (il vit dans `paquets.yml` — c'est le prix du
bootstrap sans secret). La protection réelle est le secret lui-même : la clé
ne doit pas traîner ailleurs qu'en secret GitHub **et** dans la sauvegarde que
vous en gardez. Supprimer le keystore local après la promotion n'est pas
obligatoire si cette sauvegarde est le keystore lui-même — mais alors elle
doit être protégée comme un secret, parce qu'elle en est un.

### 5. Prouver la promotion

Relancer le workflow Paquets **sans tag** d'abord (run de validation) :

```bash
gh workflow run paquets.yml --repo nicoo-o/SpaceHub
```

Puis vérifier, dans le job APK :

1. le journal affiche `Keystore permanent chargé depuis le secret
   ANDROID_KEYSTORE` (plus de clé éphémère) ;
2. l'étape `Artefact du keystore d'amorçage` est **absente** du run — c'est la
   preuve qu'aucune clé jetable n'a été créée ;
3. `apksigner verify --print-certs` sur l'APK produit rend l'empreinte du
   keystore promu ;
4. sur la TV : `adb install -r spacehub-vX.Y.Z.apk` réussit **sans**
   `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (la preuve finale de la mise à jour
   en place).

### 6. Clore la boucle

L'artefact de run peut être supprimé (il a été promu ; le garder n'apporte
rien et prolonge le risque de fuite). Les versions suivantes s'installeront
par-dessus la précédente sans désinstallation.

## Ce qui reste ouvert (dette assumée)

- Le mot de passe de la clé reste `spacehub-ephemere`, public dans le dépôt.
  C'est le compromis du bootstrap documenté dans `paquets.yml` : la clé ne vit
  que dans les secrets, le mot de passe ne protège qu'un fichier déjà
  confidentiel. Une rotation (nouvelle clé) casserait la mise à jour en
  place — à ne faire qu'en dernier recours, en acceptant une désinstallation
  pour les utilisateurs existants.
- Le magasin est un **PKCS#12**, pas un JKS historique : `keytool` le lit par
  auto-détection et Gradle aussi, mais les procédures qui cherchent un
  en-tête `feedfeed` (JKS) ne le reconnaîtront pas. Un PKCS#12 commence par
  `30 82` (une séquence DER).
- Si un run d'amorçage passe sans artefact, le workflow **échoue** désormais
  et l'empreinte n'est jamais publiée sans clé téléversée. La veille
  (`scripts/verifier-amorcage-keystore.mjs`) couvre le cas complémentaire :
  l'artefact existe mais approche de sa fin de rétention.
