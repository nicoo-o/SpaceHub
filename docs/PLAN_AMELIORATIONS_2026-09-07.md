# SpaceHub — plan d'améliorations

**7 septembre 2026.** Établi à partir de deux recherches web (écosystème Jellyfin,
plateforme web 2026) confrontées à un inventaire du code existant.

---

## La question qui commande tout le reste

Deux recherches ont produit une trentaine d'idées. La moitié était inutile,
pour une raison simple : **SpaceHub les fait déjà.**

L'écosystème Jellyfin réclame depuis des années trois choses — le décalage des
sous-titres ([jellyfin#130](https://github.com/jellyfin/jellyfin/issues/130),
ouvert depuis 2019), la vitesse de lecture, le Picture-in-Picture. **Les trois
sont implémentées ici.** De même pour la télécommande émettrice
(`RemoteControlService`), les rangées NextUp et Similar, et les segments médias
typés.

Ce plan ne liste donc que ce qui manque **vraiment**, vérifié fichier par
fichier. C'est plus court, et beaucoup plus utile.

---

## Ce que l'inventaire a révélé et que les recherches ne pouvaient pas deviner

Trois manques structurels, tous invisibles depuis l'extérieur.

### 1. Les touches média des télécommandes ne font rien

`core/InputMapper.js` reconnaît la chaîne `'MediaPlayPause'` — c'est-à-dire la
touche d'un **clavier de PC**. Aucun code de télécommande de téléviseur n'y
figure.

Or sur Tizen, seules les flèches, Entrée et Retour arrivent automatiquement.
**Toutes les autres touches doivent être enregistrées explicitement** par
`tizen.tvinputdevice.registerKeyBatch()`, sinon l'application ne les reçoit
jamais. Les codes concernés : lecture/pause **10252**, retour rapide **412**,
avance rapide **417**, stop **413**, piste précédente **10232**, suivante
**10233**, Retour **10009**.

Côté Fire TV, ce n'est même pas une option : Amazon exige formellement que
« toutes les applications média gèrent les événements de touche média
Play/Pause » pour être acceptées.

**Conséquence concrète aujourd'hui : sur un vrai téléviseur, appuyer sur ⏯ ⏪ ⏩
de la télécommande ne produit rien.** C'est le genre de défaut qu'on ne
découvre qu'à la recette — et il est bien plus grave qu'une fonctionnalité
manquante, parce que l'utilisateur essaie le geste évident et conclut que
l'application est cassée.

### 2. Aucun WebSocket

Recherche dans tout le dépôt : zéro occurrence. SpaceHub ne parle à Jellyfin
qu'en requêtes ponctuelles.

Cela ferme d'un coup toute une famille de fonctionnalités : devenir cible de
cast, voir la médiathèque se rafraîchir quand le serveur scanne, être notifié
d'une session ouverte ailleurs, SyncPlay. Ce n'est pas un manque de
fonctionnalité — c'est un manque d'**infrastructure**, et c'est ce qui rend le
point suivant coûteux alors qu'il devrait être simple.

### 3. Le tampon HLS n'est pas plafonné

```js
this._hls = new Hls({ capLevelToPlayerSize: true, autoStartLoad: true, xhrSetup });
```

`backBufferLength` vaut `Infinity` par défaut. Sur un PC avec 16 Go, cela ne se
voit pas. Sur un téléviseur de 2020 — SoC à ~500 Mo pour tout le système —
c'est la première cause de plantage en lecture longue, et cela correspond
exactement au symptôme rapporté sur Tizen : **une dégradation progressive**, un
flux qui part bien puis se détériore au fil des minutes.

C'est une ligne de configuration. C'est probablement la modification la plus
rentable de tout ce document.

---

## Vague 1 — cinq changements, une journée, effet immédiat

Classés par rapport valeur/effort décroissant.

### 1.1 Plafonner le tampon HLS

```js
backBufferLength: 30,        // secondes gardées derrière la position
maxBufferLength: 30,
maxMaxBufferLength: 60,
```

Voir ci-dessus. À faire en premier, et à mesurer sur un vrai téléviseur.

### 1.2 Enregistrer les touches de télécommande

Une couche d'abstraction dans `InputMapper` : au démarrage, si `window.tizen`
existe, appeler `registerKeyBatch` sur les touches média ; normaliser les codes
Tizen, Fire TV et clavier vers les mêmes actions.

Sans cela, la recette téléviseur remontera « les boutons ne marchent pas » — et
ce sera vrai.

### 1.3 Trickplay — les vignettes dans la barre de progression

Jellyfin 10.9+ génère ces planches nativement. L'API est simple :

```
GET /Videos/{itemId}/Trickplay/{width}/{tileIndex}.jpg?mediaSourceId={id}
```

Le `BaseItemDto` porte déjà l'objet `Trickplay` avec `Interval`, `TileWidth`,
`TileHeight`, `ThumbnailCount`. Le calcul tient en cinq lignes, le rendu en une
`background-position`. Environ 200 lignes au total, aucune dépendance.

**Pourquoi c'est en tête :** c'est le geste qui sépare visuellement un client
« maison » d'un client premium, et **aucun client TV majeur ne le fait** —
la demande a été fermée en « not planned » côté Android TV.

Deux pièges relevés : oublier `mediaSourceId` donne un 404 systématique ; et
sans préchargement il y a ~300 ms de latence par vignette. Sur téléviseur,
précharger par lots de 3 et garder au plus 4 planches en mémoire (une planche
10×10 en 320 px pèse 200 à 400 ko).

### 1.4 Logos Fanart au lieu du titre en texte

Si `ImageTags.Logo` existe, afficher `/Items/{id}/Images/Logo` sur le hero et
l'écran de lecture plutôt que le titre en police système.

Effort quasi nul, et c'est **la différence visuelle la plus perceptible** entre
un client amateur et un client soigné. Repli sur le texte si l'image manque.

### 1.5 Screen Wake Lock

Vingt lignes. Baseline depuis mars 2025, disponible sur les téléviseurs 2022+.

Le piège à connaître : le verrou est **libéré automatiquement dès que le
document devient caché**. Il faut le reprendre sur `visibilitychange` — c'est
l'erreur n°1 des implémentations naïves.

---

## Vague 2 — le confort qui se remarque

### 2.1 Quick Connect

Taper un mot de passe complexe avec un pavé directionnel est l'un des pires
moments d'usage qui existent. Jellyfin le reconnaît explicitement.

Flux : `/QuickConnect/Initiate` → afficher un code à six caractères en grand →
sonder `/QuickConnect/Connect` toutes les deux secondes → échanger le secret
contre un jeton. L'utilisateur saisit le code depuis son téléphone.

Android TV et Roku ne supportent que la connexion, pas l'autorisation. Il y a
la place pour faire mieux.

### 2.2 Sélecteur de version

Quand le greffon *Merge Versions* est actif, un film a plusieurs entrées dans
`MediaSources`. Aujourd'hui SpaceHub prend la première sans demander.

Proposer le choix — « 4K HDR remux, 40 Go » contre « 1080p, 6 Go » — avec la
taille et le débit. Rarement bien fait ailleurs, et utile dès qu'on lit depuis
l'extérieur du réseau.

### 2.3 Overlay de statistiques

Débit courant, `PlayMethod`, **`TranscodeReasons`**, codecs, résolution, images
perdues (`video.getVideoPlaybackQuality()`), niveau HLS.js, taille du tampon.

`DeviceProfile.js` lit déjà `TranscodeReasons` mais ne l'affiche nulle part.
La demande « pourquoi ça transcode ? » est récurrente dans l'écosystème, et
c'est accessoirement un outil de diagnostic pour la recette téléviseur — le
pendant du HUD de navigation, côté lecture.

### 2.4 Media Session (PC et mobile seulement)

Métadonnées sur l'écran de verrouillage, contrôles matériels, `setPositionState`.
Sans intérêt sur téléviseur, mais ~60 lignes pour un vrai gain ailleurs.

Trois pièges : `try/catch` **autour de chaque** `setActionHandler` (une action
non supportée lève et tue le reste de l'initialisation) ; artwork en 128×128 en
première entrée du tableau pour iOS ; `setPositionState` lève un `TypeError` si
la durée n'est pas positive.

### 2.5 `navigator.storage.persist()`

Trois lignes. Protège les téléchargements hors-ligne de l'éviction — Safari
supprime les données d'une origine sans interaction depuis sept jours. Et
`estimate()` donne un budget affichable dans les réglages.

---

## Vague 3 — les deux vrais différenciateurs

### 3.1 Devenir cible de cast

**Le scénario TV le plus utile qui manque.** L'utilisateur ouvre Jellyfin sur
son téléphone, choisit « SpaceHub — Salon », le film démarre sur la télévision.
Plus de recherche à la télécommande.

Mécanique : `POST /Sessions/Capabilities/Full` avec `SupportsMediaControl` et
`SupportsRemoteControl`, puis écoute des messages WebSocket `Play`, `Playstate`
et `GeneralCommand`, routés vers les commandes de lecteur qui existent déjà.

Le lecteur, la file d'attente et le contrôle distant sont là. **Ce qui manque
est le WebSocket** — d'où l'intérêt de le construire proprement une fois : il
sert aussi au rafraîchissement de médiathèque et, plus tard, à SyncPlay.

### 3.2 Un vrai mode musique

C'est le plus gros angle mort de l'écosystème : **Streamyfin dit explicitement
ne pas supporter la musique et ne pas prévoir de le faire ; Findroid non plus.**
Un client TV avec un bon mode musique n'a quasiment pas de concurrence.

Trois éléments, du plus au moins rentable :

- **Radio d'artiste en un bouton.** `/Items/{id}/InstantMix` remplit la file
  d'attente existante. Quelques lignes, effet immédiat.
- **Écran de veille musical** : pochette plein écran, fond flouté depuis le
  backdrop, paroles centrées. C'est l'usage télévision évident, et personne ne
  le fait bien.
- **Paroles synchronisées au mot** (`/Audio/{id}/Lyrics`, champ `Cues` depuis
  10.11). Sur un téléviseur faible, un `<span>` par mot positionné une fois et
  un `requestAnimationFrame` qui ne change que la couleur — surtout pas de
  `background-clip: text` animé.

---

## Ce que je n'inclus pas, et pourquoi

| Idée | Raison |
|---|---|
| **SyncPlay** | L'équipe Jellyfin juge elle-même l'API actuelle insuffisante et discute une refonte « SyncPlay 2.0 ». L'usage — regarder ensemble à distance — est marginal depuis un téléviseur. Effort fort, valeur niche, cible mouvante. |
| **Grille EPG Live TV** | Le coût est concentré dans la grille : 100 chaînes × 24 h à virtualiser en deux dimensions sur Chrome 69, avec une navigation directionnelle où « droite » ne veut pas dire « élément suivant » mais « émission suivante », largeurs proportionnelles à la durée. Cela demanderait un mode dédié dans le moteur de navigation. À reconsidérer si — et seulement si — vous avez un tuner. La **lecture d'une chaîne** seule, en revanche, est presque gratuite : même chemin `PlaybackInfo` → HLS. |
| **Google Cast (récepteur personnalisé)** | 5 $ non remboursables, enregistrement de chaque appareil de test, et surtout : un récepteur hébergé en HTTPS devant charger des flux depuis `http://192.168.x.x` se heurte au contenu mixte. C'est l'obstacle réel, pas le SDK. La Remote Playback API couvre Cast **et** AirPlay avec une seule API standard. |
| **Background Fetch** | Chrome uniquement, et Google a déposé un avis de suppression le 25 novembre 2025 (usage mesuré à 0,00002 % des chargements), retiré une semaine plus tard sous la pression. Ne pas bâtir le téléchargement hors-ligne dessus. |
| **Speculation Rules** | Sans objet pour une application monopage. Et elles exigent Chromium 109 alors que les téléviseurs 2024 sont en M108 — ratées d'une version. |
| **View Transitions, `scheduler.yield`, pseudo-classes média CSS** | Toutes intéressantes, toutes hors de portée du parc : `scheduler.yield` demande Chromium 129 (téléviseurs 2026), les pseudo-classes média sont arrivées dans Chromium en septembre 2026. À adopter en amélioration progressive dans deux ans, pas maintenant. |
| **Web Speech, WebHID, File System Access** | Les téléviseurs n'exposent pas de micro à une application web ; la recherche vocale y passe par les API de la plateforme. Les deux autres n'ont aucun usage ici. |
| **Découpage des gros fichiers** | Reporté, pour la raison déjà écrite dans le plan du 7 septembre : cela toucherait tout le code au moment précis où l'on cherche à prouver qu'il est fiable. |

---

## Deux remarques qui ne viennent pas des recherches

### Le contrôle parental va régresser en 10.11

La refonte des classifications (PR #12615) remplace l'entier simple par un
`RatingScore { score, subScore }`, ajoute `InheritedParentalRatingSubValue` sur
les items et `MaxParentalSubRating` sur la politique utilisateur.

Le contrôle parental de SpaceHub ne connaît que l'ancienne forme. Ce n'est pas
une amélioration à planifier : c'est une **régression à éviter**, avec repli sur
les serveurs antérieurs. À traiter dans la vague 1.

### Ce qui manque le plus n'est pas une fonctionnalité

L'application a plus de fonctionnalités que la plupart des clients Jellyfin.
Ce qu'elle n'a pas, c'est **une seule preuve qu'elle fonctionne sur un
téléviseur.**

Chacune des idées ci-dessus a un coût réel et un bénéfice supposé. La recette
matérielle, elle, a un coût nul en développement et transformerait des
suppositions en faits — y compris sur des choses déjà écrites : le tampon HLS,
les touches de télécommande, la lisibilité à trois mètres, la latence du focus.

**Ordre que je recommande :** vague 1 (une journée), puis recette téléviseur,
puis le reste **selon ce que la recette révèle**. Faire les vagues 2 et 3 avant
la recette, c'est ajouter des fonctionnalités à une application dont on ignore
si elle démarre sur la cible.

---

## Récapitulatif

| # | Amélioration | Valeur | Effort | Vague | État |
|---|---|---|---|---|---|
| 1 | Plafonner le tampon HLS | Très haute | Trivial | 1 | fait |
| 2 | Touches de télécommande (Tizen, Fire TV) | Très haute | Faible | 1 | fait |
| 3 | Trickplay | Très haute | Faible | 1 | fait |
| 4 | Logos Fanart | Moyenne | Trivial | 1 | fait (accueil) |
| 5 | Screen Wake Lock | Moyenne | Trivial | 1 | fait |
| 6 | Sous-scores parentaux 10.11 | *anti-régression* | Faible | 1 | fait |
| 7 | Quick Connect | Haute | Faible | 2 | fait |
| 8 | Sélecteur de version | Moyenne | Faible | 2 | fait |
| 9 | Overlay de statistiques | Moyenne | Faible | 2 | fait |
| 10 | Media Session (PC/mobile) | Moyenne | Faible | 2 | fait |
| 11 | `storage.persist()` | Moyenne | Trivial | 2 | fait |
| 12 | Cible de cast + WebSocket | Très haute | Moyen | 3 | fait |
| 13 | Mode musique (radio, veille, paroles) | Haute | Moyen | 3 | fait |

### Ce que « fait » ne veut pas dire

**#4, « fait (accueil) »** — le logo remplace le titre sur le carrousel
d'accueil, là où il change réellement l'allure de l'application. Il n'a PAS été
posé dans la barre supérieure du lecteur : à la taille où ce titre s'affiche
pendant la lecture, une image de logo serait moins lisible que du texte. C'est
un choix, pas un oubli.

**#13** — les trois pièces sont posées et branchées : la composition de radio
(`RadioArtiste`), l'écran plein cadre avec pochette, fond flouté et paroles au
mot (`EcranMusique`), la résolution ligne/mot (`Paroles`). Les deux points
d'entrée existent aussi : « Lancer une radio » au menu contextuel des cartes —
affiché pour la musique seulement, car `/InstantMix` ne compose rien sur un
film — et l'ouverture automatique de l'écran dès que la lecture porte sur de
l'audio, avec fermeture au titre suivant s'il n'est pas musical.

Un détail d'intégration valait d'être relevé : le lecteur occupe le z-index
maximal de la page. Un écran monté sur `document.body` serait passé DERRIÈRE
lui — invisible, sans erreur, sans rien dans une console. Il se monte donc
DANS le lecteur, entre la vidéo et la barre de commandes, qui reste
atteignable par-dessus.

### Ce qui ne peut pas être vérifié d'ici

Trois choses demandent le matériel réel, et aucun test ne les remplace :

- la **recette sur téléviseur** — les touches média Tizen et Fire TV, la
  fluidité de l'écran de paroles à 60 images par seconde sur un modèle 2020 ;
- la **mesure mémoire** du plafonnement HLS avec `SPACEHUB_HLS_UMD=1` ;
- le **cast réel** depuis l'application Jellyfin d'un téléphone : la déclaration
  de capacités et l'écoute WebSocket sont testées séparément, mais le trajet
  complet passe par un serveur que je n'ai pas.
