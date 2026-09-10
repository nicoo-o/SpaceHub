# Promotion du keystore d'amorçage v1.2.0 — la clé devient un secret

## Pourquoi

Sans secret `ANDROID_KEYSTORE`, le workflow Paquets signe l'APK avec une clé
**éphémère** générée à la volée : parfaite pour tester, inutilisable pour
enchaîner les mises à jour — l'APK suivant, signé par une autre clé,
refuse de s'installer par-dessus (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`, vu
en recette v1.2.0). Pour que les versions futures s'installent **en place**,
il faut promouvoir la clé éphémère du run v1.2.0 en secret permanent.

L'urgence est datée : le keystore d'amorçage est téléversé comme **artefact
de run à rétention 30 jours** (`keystore-amorcage-a-promouvoir-en-secret`).
Passé ce délai, il est détruit — et la promotion devient impossible
(`scripts/verifier-amorcage-keystore.mjs` et la note d'alerte préviennent
dans les 7 derniers jours).

## La procédure (une seule fois, ~10 minutes)

### 1. Localiser le run et l'artefact

Le run Paquets du tag **v1.2.0** (celui qui a produit l'APK vérifié en
recette) n'avait aucun secret de signature : il a donc créé le keystore
d'amorçage. Récupérer l'artefact `keystore-amorcage-a-promouvoir-en-secret`
depuis GitHub Actions → run → Artifacts, ou :

```bash
gh run download --repo nicoo-o/SpaceHub --name keystore-amorcage-a-promouvoir-en-secret
# → dossier keystore-amorcage-a-promouvoir-en-secret/spacehub-ephemere.keystore
```

### 2. Vérifier l'empreinte (ne JAMAIS sauter)

L'artefact doit correspondre à la clé dont le résumé du run affiche
l'empreinte. Sur une machine avec un JDK :

```bash
keytool -list -v -keystore spacehub-ephemere.keystore -storepass spacehub-ephemere \
  -alias spacehub | grep 'SHA256:'
```

Comparer avec l'« EMPREINTE SHA256 » imprimée dans le résumé du run v1.2.0
(étape `Signature de l'APK`). Identiques → on continue. Différentes →
STOP : l'artefact a été altéré ou mal téléchargé, ne rien promouvoir.

### 3. Encoder en base64

```bash
base64 -w0 spacehub-ephemere.keystore   # Linux / Git Bash
```

### 4. Poser les secrets

GitHub → Settings → Secrets and variables → Actions → New repository secret :

| Secret | Valeur |
|---|---|
| `ANDROID_KEYSTORE` | la chaîne base64 de l'étape 3 (une seule ligne) |
| `ANDROID_KEYSTORE_PASSWORD` | `spacehub-ephemere` (storepass d'amorçage) |
| `ANDROID_KEY_PASSWORD` | `spacehub-ephemere` (keypass d'amorçage) |
| `ANDROID_KEY_ALIAS` | `spacehub` |

Le mot de passe est public (il vit dans `paquets.yml` — c'est le prix du
bootstrap sans secret). La protection réelle est le secret lui-même : la
clé ne doit pas traîner ailleurs qu'en secret GitHub. **Supprimer le
keystore local et l'artefact téléchargé après la promotion.**

### 5. Prouver la promotion

Relancer le workflow Paquets sur le même tag :

```bash
gh workflow run paquets.yml -f version=v1.2.0
```

Puis vérifier, dans le job APK :

1. l'étape `Signature de l'APK` utilise `KEYSTORE_B64` (plus de clé
   éphémère) ;
2. `apksigner verify --print-certs` sur l'APK produit : l'empreinte SHA-256
   du certificat est celle du keystore promu ;
3. sur la TV : `adb install -r spacehub-v1.2.0.apk` réussit **sans**
   `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (la preuve finale de la mise à jour
   en place).

### 6. Clore la boucle

L'artefact de run peut être supprimé (il a été promu ; le garder n'apporte
rien et prolonge le risque de fuite). Les versions suivantes (v1.3.0…)
s'installeront par-dessus la précédente sans désinstallation.

## Ce qui reste ouvert (dette assumée)

- Le mot de passe de la clé reste `spacehub-ephemere`, public dans le dépôt.
  C'est le compromis du bootstrap documenté dans `paquets.yml` : la clé ne
  vit que dans les secrets, le mot de passe ne protège qu'un fichier déjà
  confidentiel. Une rotation (nouvelle clé) casserait la mise à jour en
  place — à ne faire qu'en dernier recours, en acceptant une
  désinstallation pour les utilisateurs existants.
- Si le run v1.2.0 n'a pas d'artefact (expiré) : la clé est perdue. Le
  prochain build sans secret en génère une nouvelle — l'APK suivant sera
  de nouveau « update-incompatible » avec celui-ci. La note de rétention
  (`scripts/verifier-amorcage-keystore.mjs`) existe pour que ça ne se
  reproduise pas.