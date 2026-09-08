# SpaceHub — plan SDK, greffons et nouvelles fonctionnalités

> **Date :** 7 septembre 2026
> **Portée :** six sujets — améliorer le SDK de greffons, améliorer le greffon
> de notes existant, proposer de nouveaux greffons, proposer de nouvelles
> fonctionnalités, améliorer les performances de l'application, et sortir le
> thème clair de sa monotonie.
> **Méthode :** lecture intégrale de `core/SDK.js`, `core/PluginManager.js`,
> `core/PluginPermissions.js`, `core/PluginCatalog.js`, `core/RatingCacheService.js`,
> du greffon `plugins/ratings/`, du préréglage de thème clair et de
> `public/design-system/tokens.css` ; dépouillement de la construction produite
> (`dist/`) et des feuilles de style ; recoupement avec l'état de l'art du bac à
> sable JavaScript, les recommandations de performance 2026, les systèmes de
> conception de référence sur l'élévation en mode clair, et les évolutions
> annoncées du serveur Jellyfin.
>
> **Ce qui est mesuré et ce qui est supposé.** Les tailles de paquets, le compte
> des poids de police, les jetons de thème et les défauts de code sont *relevés*
> dans le dépôt et cités tels quels. Le gain attendu de chaque optimisation est,
> lui, une *estimation* tant que le relevé LoAF (E5) n'existe pas — c'est
> précisément pourquoi il figure dans la liste.

---

## Ce que l'ouverture du SDK a révélé

Le système de greffons est plus abouti que la plupart de ce qu'on trouve dans un
client amateur : il y a un registre, des états (`registered`, `loaded`,
`enabled`, `disabled`, `error`, `quarantined`), des dépendances avec détection
de cycle, un contrôle de santé, des permissions déclarées, un catalogue distant
avec intégrité SHA-256 et signature ECDSA, et un chargeur qui **ne fait ni `eval`
ni `new Function`**.

Cinq défauts le traversent quand même, et trois d'entre eux ont la même
signature : **une garantie qui n'en est pas une**. C'est le genre de défaut le
plus coûteux, parce qu'il produit une confiance injustifiée plutôt qu'un doute
utile.

### La signature du catalogue se vérifie avec sa propre clé

`PluginCatalog` refuse un greffon non signé quand `requireSigned` vaut `true`,
ce qui est le défaut. Mais la clé qui valide la signature voyage **avec** la
chose qu'elle valide :

```js
// Le catalogue entier
await this.verifySignature(payload, document.signature, document.publicKey)
// Puis chaque greffon
await this.verifySignature(source, entry.signature, entry.publicKey)
```

`document.publicKey` et `entry.publicKey` viennent du catalogue téléchargé. Qui
contrôle le catalogue fournit donc **et** le code, **et** la signature, **et**
la clé qui la vérifie : il lui suffit de signer avec la sienne. La vérification
réussit, et elle ne prouve rien.

Une signature n'a de sens que contre une clé **épinglée** — que l'application
porte, et qu'un attaquant ne peut pas remplacer. En l'état, le mécanisme donne
l'assurance d'une chaîne de confiance sans en fournir une.

L'intégrité SHA-256, elle, est correcte : le condensat est comparé au champ
`integrity` de l'entrée. Elle protège d'un CDN qui altère un paquet, pas d'un
catalogue malveillant. C'est déjà utile, et il faut dire lequel des deux
problèmes est couvert.

### Les permissions décrivent, elles n'empêchent pas

`PluginPermissions` refuse par défaut, distingue les permissions qui agissent
sur le serveur, et le contexte remis au greffon vérifie chaque appel :
`ctx.api.fetch` exige `network.external.read`, `ctx.ui.themes.apply` exige
`ui.theme.apply`.

Seulement, un greffon s'exécute **dans la page**, avec le même accès que
l'application. Le greffon de notes livré avec SpaceHub le démontre lui-même :

```js
const ratingCache = window.SpaceHub?.core?.ratingCache;
```

Rien ne l'empêchait d'appeler le `fetch` global plutôt que `ctx.api.fetch`. Et
depuis que le jeton Jellyfin a été déplacé dans `sessionStorage` pour le
soustraire à un XSS, un greffon approuvé le lit en une ligne. **Le modèle de
greffons défait donc le durcissement du jeton.**

Ce n'est pas un défaut d'implémentation, c'est une limite du navigateur : il n'y
a pas d'isolation gratuite dans une page. Mais une liste de permissions qui
ressemble à celle d'Android sans en avoir la force est **pire que pas de liste
du tout**, parce qu'elle invite à approuver.

### Quatre types de contribution sur sept n'ont aucun consommateur

`CONTRIBUTIONS` déclare `widget`, `theme`, `route`, `metadataProvider`,
`action`, `adminPanel`, `module`. Trois d'entre eux fonctionnent, par un effet
de bord de `_registerContribution` qui les transmet à l'hôte. Les quatre autres
— `route`, `action`, `adminPanel`, `module` — sont validés, stockés dans une
`Map`… et jamais relus : `getContributions()` n'a **aucun appelant** dans
l'application.

Un greffon qui enregistre une route reçoit une fonction de désabonnement
parfaitement valide, et aucune route n'existe. Il n'y a pas d'erreur à chercher.

### La configuration d'un greffon est écrite en dur dans l'hôte

`SettingsPanel.js` contient, en clair, les deux champs du greffon de notes :

```js
'#cfg-omdb-key'   → getPluginStorage('spacehub.ratings').set('omdbApiKey', …)
'#cfg-tmdb-key'   → getPluginStorage('spacehub.ratings').set('tmdbApiKey', …)
```

Le mécanisme de stockage est générique ; son interface ne l'est pas. **Tout
nouveau greffon qui a besoin d'un réglage exige donc une modification de
l'application hôte** — ce qui annule une bonne part de l'intérêt d'avoir des
greffons.

### `apiVersion` est déclarée et jamais comparée

Le manifeste porte `apiVersion` (défaut `'2.0.0'`), et rien ne la confronte à la
version du SDK. Seul `compatibility.minSpaceHub` est vérifié. Un greffon écrit
pour une API v1 se charge donc sans un mot contre une API v2.

---

## Partie A — améliorer le SDK existant

### A1. Épingler la clé de signature *(sécurité, effort faible)*

La clé publique du dépôt officiel appartient à l'application, pas au catalogue.
Elle est constante, publique, et sa place est dans le code :

```js
export const CLES_DE_CONFIANCE = Object.freeze({
    'spacehub-officiel': { kty: 'EC', crv: 'P-256', x: '…', y: '…' },
});
```

L'entrée de catalogue ne porte plus une clé mais l'**identifiant** d'une clé
connue (`keyId`). Une clé inconnue est un refus, pas un repli.

Pour un dépôt tiers que l'utilisateur ajoute lui-même, deux choix honnêtes :
soit il colle l'empreinte de la clé au moment où il ajoute l'URL — la confiance
vient alors de lui, explicitement — soit le dépôt est marqué **non signé** et
l'interface le dit. Ce qu'il ne faut pas, c'est continuer d'afficher « signé »
pour une signature auto-portante.

*Contre-épreuve à écrire :* un catalogue dont la clé n'est pas épinglée doit
être refusé, et le test doit tomber si l'on rétablit `entry.publicKey`.

### A2. Dire la vérité sur ce que peut un greffon *(sécurité, effort trivial)*

Avant l'isolation — qui est un chantier —, la correction la moins chère et la
plus utile est de **cesser de promettre ce qui n'est pas tenu**. L'écran
d'approbation doit porter une phrase, une seule, non contournable :

> Un greffon s'exécute avec les mêmes droits que SpaceHub : il peut lire vos
> réglages et votre session. N'installez que des greffons dont vous connaissez
> l'auteur.

Les permissions restent affichées — elles décrivent l'**intention** déclarée du
greffon, ce qui a une valeur réelle — mais elles cessent d'être présentées comme
une barrière.

### A3. Un contrôle statique du code des greffons *(sécurité, effort faible)*

`PluginCatalog` détient la **source en texte** avant de la remettre au chargeur.
C'est le seul moment où une vérification est possible, et il est déjà là.

Un balayage refuse une source qui touche à ce qu'un greffon n'a aucune raison de
toucher : `sessionStorage`, `localStorage`, `document.cookie`, `window.SpaceHub`,
`fetch(` nu, `eval`, `new Function`, `import(`. Le greffon passe par `ctx`, ou il
ne passe pas.

Ce n'est **pas** un bac à sable : un attaquant contourne un contrôle statique en
construisant ses accès dynamiquement (`window['Space'+'Hub']`). Il faut le dire.
Ce que ce contrôle attrape vraiment, c'est l'auteur négligent et le greffon qui
prend un raccourci — c'est-à-dire l'écrasante majorité des cas. Et il rend le
contournement **volontaire et visible**, ce qui change la nature de la faute.

Il s'applique aussi aux greffons livrés avec l'application, et le greffon de
notes est le premier à devoir être corrigé : il doit recevoir `ratingCache` par
son contexte au lieu d'aller le chercher dans `window`.

### A4. Isoler pour de bon : le greffon dans une `iframe` *(sécurité, effort élevé)*

La seule isolation réelle disponible aujourd'hui dans un navigateur est une
`<iframe sandbox>` d'origine distincte, avec `postMessage` comme unique passage.
Le greffon n'a alors ni DOM de l'application, ni `sessionStorage`, ni jeton — il
n'a que les messages qu'on lui accorde.

Les deux autres pistes ne tiennent pas ici :

- **`ShadowRealm`** est à l'**étape 2.7** du processus TC39, avec une demande de
  passage à l'étape 3 en décembre 2024. Aucun navigateur ne l'expose. Ce n'est
  pas une option, c'est une option future.
- **Un moteur JavaScript compilé en WebAssembly** (la voie prise par Figma) est
  jouable sur un ordinateur et déraisonnable sur un téléviseur de 2020, qui est
  le plancher de ce projet.

Le coût réel de l'`iframe` n'est pas le bac à sable : c'est que **toute l'API
devient asynchrone et sérialisable**. Un greffon ne peut plus recevoir une
classe de widget — il envoie une description que l'hôte rend. C'est une refonte
du modèle de contribution, pas une couche par-dessus.

Recommandation honnête : **ne pas le faire tant qu'il n'y a pas de greffons
tiers**. Avec un seul greffon, écrit ici, le risque est nul et le coût
considérable. A2 et A3 couvrent la situation actuelle ; A4 devient nécessaire le
jour où un catalogue tiers ouvre.

### A5. Rendre vivants les quatre types de contribution morts *(effort faible)*

Deux issues, et il faut en choisir une plutôt que de laisser l'ambiguïté :

- **`action`** — mérite d'être implémenté. Le menu contextuel des cartes est
  l'endroit naturel d'un greffon (« envoyer à… », « chercher les paroles »,
  « marquer sur Trakt »). `CardBuilder` a déjà le menu ; il suffit qu'il lise les
  contributions de type `action` et pose un bouton par entrée, avec le même
  garde-fou de type de média que « Lancer une radio ».
- **`route`** — implémentable en quelques lignes : `Router.registerRoute` existe
  déjà. Une route de greffon doit être préfixée (`/x/<pluginId>/…`) pour qu'un
  greffon ne puisse pas voler `/accueil`.
- **`adminPanel` et `module`** — à **retirer** de `CONTRIBUTIONS` tant que rien
  ne les consomme. Une déclaration sans consommateur est un piège pour l'auteur
  du greffon, et l'audit précédent a déjà retiré une contribution fausse du
  manifeste des notes pour cette raison exacte.

### A6. Un schéma de réglages déclaratif *(effort moyen, forte valeur)*

Le manifeste gagne un `settingsSchema`, et l'écran des réglages le rend
génériquement :

```js
settingsSchema: [
    { cle: 'omdbApiKey', type: 'secret', titre: 'Clé API OMDb', requis: true },
    { cle: 'tmdbLanguage', type: 'select', titre: 'Langue des critiques',
      options: ['fr-FR', 'en-US'], defaut: 'fr-FR' },
]
```

Types : `texte`, `secret`, `booleen`, `nombre`, `select`. Le type `secret` ne
revient **jamais** dans le DOM — l'écran affiche « Clé enregistrée (••••) » et
n'écrit que si le champ est rempli. C'est déjà ce que fait le code en dur pour
OMDb ; il s'agit de le généraliser, pas de l'inventer.

Effet direct : les deux blocs codés en dur dans `SettingsPanel.js` disparaissent,
et un nouveau greffon devient configurable sans toucher à l'hôte.

### A7. Vérifier `apiVersion` *(effort trivial)*

Comparer la majeure de `manifest.apiVersion` à celle du SDK. Une majeure
différente est un refus **nommé** — « écrit pour l'API 1, le SDK est en 2 » —
plutôt qu'une erreur obscure au premier appel manquant.

### A8. Passer par le registre de services, pas par `window` *(effort trivial)*

`_registerContribution` s'adresse à `safeWindow().SpaceHub`. L'application a
migré vers `ServiceRegistry`, avec un plafond de vingt accès globaux tenu par
`test:globals`. Ce chemin le contourne et casserait le jour où la façade globale
disparaît.

### A9. Un greffon d'exemple, et une page pour l'écrire *(effort faible)*

Il y a un seul greffon, et il est complexe (trois fournisseurs, deux API, une
recherche de repli). Ce n'est pas un point de départ.

Un greffon minimal de trente lignes — un widget qui affiche une phrase — plus une
page `docs/ECRIRE_UN_GREFFON.md` qui liste ce que `ctx` expose réellement,
vaudront plus que n'importe quelle amélioration d'API. Aujourd'hui, la seule
manière de savoir ce qu'un greffon peut faire est de lire `_buildContext`.

---

## Partie B — nouveaux greffons

Chacun est réalisable **avec le SDK tel qu'il est** — ou avec A5/A6 faits — et
apporte quelque chose que le serveur ne fait pas.

### B1. Paroles LRCLIB *(forte valeur, effort faible)*

`Paroles.js` sait afficher des paroles synchronisées au mot ; encore faut-il que
le fichier en porte, ce qui est rare. LRCLIB est une base publique de paroles
synchronisées, **sans clé d'API**, interrogeable par artiste, titre et durée.

Le greffon s'intercale : le serveur n'a rien → on demande à LRCLIB → on convertit
le LRC en la forme que `Paroles.js` attend. Permission :
`network.external.read`. C'est le complément le plus direct de ce qui vient
d'être livré, et le plus visible.

*Réserve :* LRCLIB sert surtout du LRC simple, à la ligne. Le découpage au mot
restera l'exception — il faut le dire plutôt que de laisser espérer un karaoké
partout.

### B2. Scrobbling Last.fm / ListenBrainz *(valeur moyenne, effort faible)*

Le mode musique existe désormais ; scrobbler est le geste qui l'accompagne
naturellement. ListenBrainz est préférable comme cible par défaut : jeton
simple, pas de signature de requête, et l'utilisateur garde ses données.

Permissions : `network.external.read`. Le greffon écoute les événements de
lecture déjà émis par le lecteur. Un réglage `secret` pour le jeton — donc A6
d'abord, sinon il faut encore toucher à l'hôte.

### B3. Trakt pour les films et séries *(valeur moyenne, effort moyen)*

Le pendant vidéo de B2, et la demande la plus fréquente autour des clients
Jellyfin. Plus lourd : OAuth par code d'appareil, ce qui est justement le
mécanisme adapté à un téléviseur — l'utilisateur ouvre une page sur son
téléphone et saisit un code, exactement comme Quick Connect.

*Attention :* le jeton Trakt se rafraîchit et doit être stocké. Il vivra dans le
stockage du greffon, donc dans les réglages, donc lisible par tout ce qui tourne
dans la page. À dire à l'utilisateur, et une raison de plus pour A4 le jour où
des greffons tiers arriveront.

### B4. Thème dérivé de la pochette *(valeur moyenne, effort faible)*

Extraire la couleur dominante de l'affiche ou de la pochette en cours, et
teinter l'interface. Purement local : ni réseau, ni serveur — `ui.theme.register`
et `ui.theme.apply` suffisent.

Le piège est connu et mesurable : l'extraction sur un `<canvas>` d'une image
pleine résolution coûte cher sur un téléviseur. Il faut dessiner dans un canevas
de 16×16 et échantillonner là, pas dans l'image d'origine. Et il faut un garde-fou
de contraste : une couleur dominante sombre sur un texte sombre est illisible, et
le critère WCAG 1.4.3 ne se négocie pas parce que c'est joli.

### B5. Sous-titres externes à la demande *(valeur moyenne, effort moyen)*

Jellyfin a un greffon serveur OpenSubtitles, mais il travaille au moment de
l'analyse de la médiathèque. Un greffon client fait autre chose : chercher
**pendant la lecture**, quand on découvre qu'il n'y a pas de piste dans la bonne
langue.

Il faut être franc sur la limite : le sous-titre récupéré n'est pas ajouté au
serveur — c'est une piste locale, pour cette session. L'ajouter au serveur
exigerait `jellyfin.metadata.write`, donc un administrateur.

### B6. Votre année en musique *(valeur faible, effort faible, plaisir élevé)*

Un widget qui compile les écoutes de l'année depuis les données de lecture
Jellyfin : artistes les plus écoutés, morceau le plus rejoué, heure préférée.
Aucune permission externe — `jellyfin.items.read` suffit.

C'est le genre de fonction dont personne n'a besoin et que tout le monde ouvre.
Elle a aussi une vertu technique : c'est le premier greffon qui exercerait
sérieusement le type de contribution `widget`.

---

## Partie C — nouvelles fonctionnalités de l'application

Celles-ci ne sont pas des greffons : elles touchent au cœur et doivent être dans
l'application.

### C1. SyncPlay — regarder ensemble *(forte valeur, effort moyen)*

**Le canal WebSocket vient d'être construit ; c'est ce qui manquait.** Le
protocole est précis et publié :

- REST : `POST /SyncPlay/New`, `/Join`, `/Leave`, `/Play`, `/Pause`, `/Seek`,
  `/SetPlaylist`, et `GET /SyncPlay/Time` ;
- WebSocket : `SyncPlayCommand` et `SyncPlayGroupUpdate` — deux types que
  `SocketJellyfin` route déjà sans rien changer, puisqu'il s'abonne par nom ;
- synchronisation d'horloge **de type NTP** sur quatre horodatages
  (`requestSent`, `RequestReceptionTime`, `ResponseTransmissionTime`,
  `responseReceived`), décalage = `((t2−t1) + (t3−t4)) / 2`. Phase gloutonne à
  1 s pendant trois mesures, puis entretien à 60 s.

Deux détails décident de la qualité perçue :

- on retient les mesures de **latence minimale**, parce que la gigue s'ajoute au
  délai, elle ne le retranche jamais ;
- une dérive faible se rattrape en **changeant la vitesse de lecture** (0,2× à
  2×), pas en sautant. Un saut toutes les dix secondes est insupportable ;
  au-delà d'un seuil (≈ 400 ms) seulement, on saute.

C'est la fonctionnalité qui rendrait SpaceHub meilleur que les clients qu'il
côtoie, et l'infrastructure est déjà payée.

### C2. Manifeste PWA — rendre l'application installable *(effort trivial)*

Il y a un service worker (`public/sh-offline-sw.js`, enregistré au démarrage) et
**aucun manifeste d'application**. L'application ne peut donc pas être installée,
et cela a une conséquence directe sur le travail de la vague 2 :
`navigator.storage.persist()` est accordé bien plus volontiers à un site
installé. Les téléchargements hors ligne sont aujourd'hui « au mieux » en partie
à cause d'un fichier de quarante lignes qui n'existe pas.

### C3. Personnalisation des sous-titres *(accessibilité, effort faible)*

Taille, police, couleur, fond opaque, position. C'est un besoin
d'**accessibilité** avant d'être un confort : le critère WCAG 1.4.2 et la
lisibilité à trois mètres sur un téléviseur vont dans le même sens. Le lecteur
gère déjà un décalage temporel de sous-titres ; l'apparence est le pendant
manquant.

### C4. Grille de chapitres visuels *(effort faible)*

`Trickplay.js` sait produire une vignette à n'importe quelle seconde. Une grille
de chapitres, avec la vraie image de chaque chapitre, n'est presque que de la
mise en page par-dessus ce qui existe. Sur un téléviseur, c'est le moyen le plus
rapide de retrouver un passage — bien plus qu'une barre de progression à la
télécommande.

### C5. Reprise entre appareils, affichée *(effort faible)*

Jellyfin conserve la position de lecture côté serveur. L'application peut donc
dire « repris à 42 min sur le Salon », et proposer de continuer ici. L'
information existe ; elle n'est simplement pas montrée.

### C6. Changement de profil rapide *(effort moyen)*

Sur un téléviseur familial, ressaisir un mot de passe à la télécommande est la
friction la plus quotidienne. Un sélecteur de profils avec code à quatre
chiffres — et Quick Connect en repli, qui vient d'être livré — supprime le
clavier virtuel du chemin courant.

### C7. Préparer la 12.0 *(anti-régression, effort faible)*

La prochaine majeure de Jellyfin sera **12.0** — la 11 est sautée. Deux points
concernent directement ce client :

- les **mécanismes d'autorisation dépréciés** ne seront plus acceptés par défaut.
  SpaceHub émet déjà `Authorization: MediaBrowser`, le risque est donc faible,
  mais cela reste non vérifié faute d'un serveur configuré ainsi ;
- l'API se **stabilise** : les changements non engagés sont repoussés à la 13.0.
  C'est la bonne fenêtre pour figer la surface d'API sur laquelle SpaceHub
  s'appuie, et écrire un contrat qui la vérifie.

---

---

## Partie D — le greffon de notes, à tous les niveaux

Le greffon `spacehub.ratings` fait plus que son nom ne le dit : notes OMDb
(Rotten Tomatoes, IMDb, Metacritic), recherche OMDb par titre pour les médias
sans identifiant IMDb, et textes critiques réels via TMDB. Il est bien écrit et
sa logique de repli est solide. Six défauts s'y logent quand même, et le premier
est un problème de **quota**, pas de code.

### D1. Le cache ne survit pas à un rechargement — et le quota, lui, ne se recharge pas

`RatingCacheService` garde tout dans une `Map` mémoire avec une durée de vie de
24 h. La durée de vie est juste ; le support ne l'est pas : **tout est perdu au
rechargement de la page**.

Le quota OMDb gratuit est de **1 000 requêtes par jour**. Une page de
médiathèque qui affiche soixante affiches déclenche soixante résolutions. Trois
ouvertures de l'application dans la journée, et la journée est finie — sans
message, les notes cessent simplement d'apparaître.

`CacheManager` existe déjà, avec IndexedDB et un magasin `general` ; le
catalogue de greffons s'en sert. Le cache de notes doit y écrire, et garder la
`Map` comme premier niveau.

Il manque aussi un **cache des absences**. Aujourd'hui, un titre qu'OMDb ne
connaît pas est réinterrogé à chaque visite, indéfiniment. Dans une médiathèque
qui contient de l'animation japonaise ou du cinéma non anglophone, ces échecs
sont souvent la majorité du trafic. Une absence se met en cache aussi — avec une
durée plus longue, sept jours, parce qu'un film absent d'OMDb le reste.

### D2. Deux fournisseurs sur trois survivent à la désactivation du greffon

```js
clearProvider() { this._provider = null; }
```

`_searchProvider` et `_textProvider` n'ont **aucune méthode de retrait**, et les
crochets `onDisable` / `onUnload` du greffon n'appellent que `clearProvider()`.
Désactiver le greffon laisse donc deux de ses trois fermetures installées et
vivantes : la recherche par titre et les textes TMDB continuent d'interroger
Internet avec la clé de l'utilisateur, pour un greffon qu'il croit éteint.

Correction : un `clearProviders()` unique qui retire les trois.
*Contre-épreuve :* après `onDisable`, `hasTextProvider()` doit valoir `false` —
le test doit tomber si l'on rétablit le retrait partiel.

### D3. Le greffon contourne son propre contexte

Les trois crochets font `window.SpaceHub?.core?.ratingCache`. C'est exactement
ce que le contrôle statique proposé en A3 doit refuser, et c'est le greffon
livré avec l'application qui donne l'exemple. `ratingCache` doit être exposé sur
`ctx`, derrière `jellyfin.metadata.read`.

### D4. La clé dans l'URL — ce qu'on peut corriger, et ce qu'on ne peut pas

OMDb n'accepte sa clé qu'en paramètre d'URL (`?apikey=`). Il n'y a rien à faire
de ce côté, et il faut le dire plutôt que de le taire : la clé apparaît dans les
journaux de tout intermédiaire. Le `Referrer-Policy: no-referrer` déjà posé sur
l'application limite la casse, il ne l'annule pas.

TMDB, en revanche, **accepte un jeton Bearer** (jeton de lecture v4). Passer la
moitié TMDB en en-tête sort cette clé-là des URL. C'est la moitié du problème,
et c'est la moitié gratuite.

### D5. L'exigence d'année exacte fait disparaître des films entiers

```js
if (year && Number(data.Year) !== Number(year)) return null;
```

La rigueur est louable, la conséquence l'est moins. L'année d'un film diffère
couramment d'une source à l'autre : présenté à Cannes en 2023, sorti en salle en
2024, Jellyfin retient l'une, OMDb l'autre. Ces titres n'obtiennent **jamais**
de note, en silence.

Tolérance de ±1 an, avec préférence stricte pour l'exact quand les deux
existent, et abandon en cas d'ambiguïté réelle (deux titres identiques à un an
d'écart). C'est plus juste que le tout ou rien actuel.

### D6. Élargir les sources là où OMDb est faible

Trois ajouts qui ne coûtent pas de quota supplémentaire :

- **La note TMDB elle-même** (`vote_average`). La clé TMDB est déjà là pour les
  textes ; sa note est gratuite et couvre le cinéma non anglophone qu'OMDb
  ignore. Elle doit devenir le repli quand OMDb ne trouve rien — aujourd'hui on
  a la clé en main et on ne s'en sert pas pour ça.
- **AniList** pour l'animation japonaise. API GraphQL publique, **sans clé**.
  Les médiathèques d'anime sont fréquentes sous Jellyfin, et c'est précisément
  là qu'OMDb est le plus mauvais.
- **MusicBrainz** pour la musique, maintenant qu'il y a un mode musique. Sans
  clé également.

Ce que je n'ajoute pas : **Letterboxd** n'a pas d'API publique, et **JustWatch**
non plus — les contourner par extraction de page serait fragile et contraire à
leurs conditions.

### D7. Ne résoudre que ce qui est visible

Une rangée de deux cents titres déclenche aujourd'hui deux cents résolutions,
étalées trois par trois. OMDb n'a pas de point d'entrée par lot — il faut le
dire, il n'y a pas de gain à chercher de ce côté.

Le vrai levier est déjà dans l'application : **`VirtualisationRangee`** sait
quelles cartes sont réellement à l'écran. Brancher la résolution des notes sur
cette fenêtre fait passer une rangée de deux cents titres de deux cents appels à
une douzaine. Combiné à D1, le quota cesse d'être un sujet.

### D8. Dire pourquoi il n'y a pas de note

Aujourd'hui, quatre situations produisent le même écran : la clé est absente, la
clé est invalide, le quota est épuisé, ou OMDb ne connaît pas ce titre. Le
service distingue pourtant déjà la clé invalide du quota épuisé — OMDb renvoie
un HTTP 401 dans les deux cas et ne les sépare que dans le corps JSON, ce que le
code note en commentaire.

Cette information doit remonter : une ligne discrète dans les réglages
(« quota OMDb épuisé — réinitialisation à minuit UTC ») vaut mieux qu'un silence
que l'utilisateur interprétera comme une panne de l'application.

### D9. Un contrôle de santé qui contrôle quelque chose

```js
healthCheck: async (ctx) => {
    const key = ctx.settings.get('omdbApiKey', null);
    if (!key) throw new Error('Clé API OMDb non configurée.');
}
```

Il vérifie qu'un champ est rempli. Une clé fausse, expirée ou épuisée passe le
contrôle et le greffon est déclaré sain. Un seul appel réel, mis en cache une
heure, permettrait de rapporter l'état vrai : valide, quota épuisé, ou serveur
injoignable.

---

## Partie B (suite) — encore des greffons

### B7. AniList — l'animation japonaise, enfin correcte *(effort faible)*

API GraphQL publique et **sans clé**. Elle apporte ce qu'OMDb ne sait pas
faire : notes, titres d'épisodes exacts, correspondances romaji/anglais/natif, et
la distinction entre saisons et arcs — le point sur lequel les médiathèques
d'anime se cassent le plus souvent. Permission : `network.external.read`.

### B8. Crédits musicaux par MusicBrainz *(effort faible)*

Personnel, label, année de parution, relations entre artistes. Sans clé, avec
une contrainte à respecter honnêtement : MusicBrainz demande **un en-tête
`User-Agent` identifiant** et **une requête par seconde**. Un greffon qui ignore
cela se fait bloquer, et il n'aura pas volé son sort.

L'écran de musique livré en vague 3 est l'endroit naturel pour ces crédits :
c'est de la place déjà occupée par une pochette et du vide.

### B9. Lumières à la lecture — Home Assistant ou Hue *(effort faible, effet fort)*

Baisser les lumières quand la lecture commence, les remonter à la pause et à la
fin. C'est l'usage domestique le plus demandé autour d'un client de cinéma, et
c'est **exactement** ce qu'un greffon doit faire plutôt que le cœur : cela dépend
d'un équipement que la plupart des gens n'ont pas.

Home Assistant expose une API REST avec un jeton de longue durée ; le pont Hue
aussi, en local. Permission : `network.external.read`. Deux réserves à écrire :
le pont Hue local est en **HTTP**, or `ctx.api.fetch` n'autorise que HTTPS — il
faudra soit passer par Home Assistant, soit assouplir explicitement pour une
adresse locale, ce qui est une décision de sécurité à prendre consciemment.

### B10. Export de la médiathèque *(effort trivial)*

CSV ou JSON de ce que contient le serveur : titres, années, formats, durées,
état de visionnage. Utile pour une assurance, un déménagement, ou simplement
pour trier hors de l'application. `jellyfin.items.read` suffit, et rien ne sort
du navigateur.

### B11. Traduction des synopsis *(effort moyen)*

Pour une médiathèque où beaucoup de fiches n'existent qu'en anglais.
**LibreTranslate** est auto-hébergeable et libre, ce qui évite d'envoyer les
titres regardés à un service commercial — une considération qui compte pour un
public qui héberge son propre Jellyfin.

---

## Partie C (suite) — encore des fonctionnalités

### C8. Le téléphone comme clavier *(forte valeur, effort faible)*

La saisie à la télécommande est la pire friction d'un client de téléviseur, et
la solution est déjà à moitié construite. `CibleDistante` déclare ses commandes
au serveur ; il suffit d'y ajouter **`SendString`** et **`SendKey`** pour que
l'application Jellyfin d'un téléphone devienne le clavier de la télévision.

Le coût est de quelques dizaines de lignes — la déclaration, et le routage vers
le champ de recherche actif. Le gain est le geste le plus pénible de l'usage
quotidien.

### C9. Badges de qualité réels *(effort faible)*

HDR10, Dolby Vision, HDR10+, Atmos, DTS-X, la résolution vraie du fichier. Toute
l'information est déjà dans les `MediaStreams` que l'application télécharge pour
négocier la lecture ; elle n'est simplement pas affichée.

Une règle à tenir : n'afficher un badge que si le **fichier** le porte, jamais
parce que le titre est « censé » être en Dolby Vision. Un badge qui ment sur ce
qu'on va voir est pire que pas de badge.

### C10. Minuteur de sommeil *(effort trivial)*

« Arrêter après cet épisode », « dans 30 minutes ». Absent, et attendu de tout
appareil de salon depuis trente ans. À brancher sur la fin de lecture plutôt que
sur une minuterie sèche : couper au milieu d'une scène est la mauvaise version
de cette fonctionnalité.

### C11. Économiseur d'écran d'affiches *(effort faible)*

Après quelques minutes d'inactivité, les affiches et images d'arrière-plan de la
médiathèque en plein écran, avec un fondu lent. Les images sont déjà en cache.

Deux précautions matérielles : un mouvement lent et un déplacement périodique de
tout élément fixe, parce que les dalles OLED marquent ; et une sortie sur
n'importe quelle touche, sans exception.

### C12. Rechercher dans les dialogues *(effort moyen, forte originalité)*

Chercher une réplique et sauter à l'instant où elle est prononcée. L'application
sait déjà récupérer une piste de sous-titres ; l'indexer pour le titre en cours
est une recherche de texte sur quelques centaines de lignes.

Personne ne le fait dans cet écosystème, et c'est la fonctionnalité qu'on montre
à quelqu'un pour lui expliquer pourquoi on n'utilise pas le client officiel.

### C13. Statistiques de médiathèque *(effort faible)*

Heures vues, genres dominants, séries terminées, ce qui dort depuis un an. Toutes
les données sont dans Jellyfin. C'est aussi le premier vrai client du type de
contribution `widget` (A5), donc un moyen de le prouver.

### C14. Import et export des réglages *(effort trivial)*

`SettingsManager` possède déjà `_assainirImport()` — la partie difficile et
risquée est écrite et testée. Il ne manque que deux boutons pour reporter sa
configuration d'un appareil à l'autre.

---

## Partie E — performances

### E1. hls.js est chargé avant que quiconque ait appuyé sur « lecture » *(effort faible, gain majeur)*

```js
import Hls from 'hls.js';   // jellyfin/player/VideoPlayer.js, ligne 16
```

Import **statique**. Résultat mesuré sur la construction actuelle :

| Paquet | Brut | gzip |
|---|---:|---:|
| `vendor-hls` | 593 ko | **185 ko** |
| `index` | 433 ko | 110 ko |
| `app` | 311 ko | 79 ko |

**hls.js pèse plus lourd, à lui seul, que tout le reste de l'application
réuni** — et `dist/index.html` le précharge. Sur un téléviseur de 2020, ce n'est
pas le téléchargement qui coûte le plus, c'est l'analyse et la compilation de
593 ko de JavaScript avant le premier écran.

Or il ne sert qu'au moment où une lecture HLS commence. Un `await import()` dans
`_setupVideoSource`, au moment où la source est connue, le déplace hors du chemin
critique. C'est **la plus grosse amélioration de démarrage disponible**, et elle
tient en une ligne déplacée.

*Piège à ne pas manquer :* le préchargement dans `index.html` est généré par
Vite à partir du graphe de modules. Il faut vérifier dans le HTML **produit** que
la balise a bien disparu — sinon le fichier est toujours cherché, et le gain est
nul.

### E2. La police : six fichiers, une origine tierce, et un poids qui n'existe pas

`index.html` demande `Inter:wght@300;400;500;600;700;800` à Google Fonts, soit
**six fichiers statiques** depuis une origine tierce, sur le chemin de rendu.

Et le dépouillement des feuilles donne ceci :

| Poids | Occurrences |
|---|---:|
| 700 | 204 |
| 600 | 152 |
| **750** | **104** |
| 800 | 84 |
| 500 | 47 |

**Le poids 750 est utilisé 104 fois et n'est pas demandé.** Avec la syntaxe
`wght@300;400;…`, Google sert des instances statiques : 750 n'existe pas, le
navigateur retombe sur 700 ou synthétise. Cent quatre déclarations qui ne
produisent pas ce qu'elles disent.

Deux corrections, dans l'ordre : demander l'**axe variable**
(`wght@300..800`) — un seul fichier, et 750 rend enfin juste ; puis **héberger
la police soi-même** en sous-ensemble latin, ce qui supprime deux poignées de
main réseau et une feuille bloquante tierce. Sur une liaison de téléviseur, ces
deux allers-retours se voient.

### E3. L'image du héros est l'élément LCP et ne le sait pas

Aucun `fetchpriority="high"`, aucun préchargement. Elle concourt à armes égales
avec des vignettes de cartes qui, elles, peuvent attendre. Un attribut sur
l'image d'arrière-plan du carrousel, et un `<link rel="preload">` quand son URL
est connue tôt.

### E4. Découper le travail long — avec la bonne réserve

`scheduler.yield()` est aujourd'hui la meilleure réponse à un temps de réponse
d'interaction dégradé : elle rend la main au navigateur **et reprend en
priorité**, ce que `setTimeout(0)` ne fait pas.

Elle exige Chrome 129. Le plancher de ce projet est Chrome 69. Ce n'est donc
**pas** une technique de base ici : c'est une amélioration progressive, avec un
repli explicite. Le dire est important — une bonne partie des conseils de
performance publiés en 2026 suppose un navigateur récent, et ce projet vise
précisément l'inverse.

### E5. Mesurer avant d'optimiser : un relevé LoAF

L'audit du 6 septembre laissait « mesurer l'INP réel via LoAF » en suspens, et
c'est toujours le cas. `DebugHud` existe déjà avec son `?debug=1` : un `?perf=1`
voisin, qui enregistre les *Long Animation Frames* et nomme les scripts les plus
coûteux, transformerait les extrapolations du dossier navigation en mesures.

Sans cela, toute la suite de cette partie reste une hypothèse raisonnable — y
compris E1, dont je suis pourtant très sûr.

### E6. Étendre `content-visibility` aux grilles

`Dashboard.css` l'utilise déjà, correctement protégé par `@supports` (la
propriété n'existe qu'à partir de Chrome 85, au-dessus du plancher). Les grilles
de médiathèque, qui contiennent bien plus d'éléments, n'en bénéficient pas.

Avec `contain-intrinsic-size` pour éviter que la barre de défilement ne saute —
faute de quoi on échange un problème de peinture contre un problème de
stabilité visuelle.

### E7. Un budget de poids en intégration continue

Le projet tient dix contrats automatisés — navigation, focus, CSS, XSS, globaux,
gabarits, méthodes fantômes. **Aucun ne surveille le poids.** Le paquet `index`
est passé de 430 à 433 ko en une vague sans que rien ne le signale.

Un `test:poids` qui échoue au-dessus d'un plafond par paquet coûte trente lignes
et ferme la porte à la dérive lente — celle qu'on ne voit jamais arriver parce
qu'elle n'arrive jamais d'un coup.

### E8. Dimensions d'images

Quinze images portent `decoding="async"`, deux seulement portent des dimensions
explicites. Si les cartes tiennent leur taille par le CSS, il n'y a pas de
problème ; sinon il y a du décalage de mise en page. **C'est à mesurer avant de
corriger** — et c'est précisément ce que E5 permettrait de trancher.

---

## Partie F — le thème clair

C'est la demande la plus concrète, et le diagnostic est net : **le thème clair
n'est pas mal réglé, il est incolore par construction**.

### Le vrai problème : il n'y a pas de couleur dans le système

En lisant `tokens.css` et le préréglage clair, on trouve ceci :

| | Sombre | Clair |
|---|---|---|
| Couleur d'action principale | `#ffffff` | `#111113` |
| Fond de base | `#000000` | `#f4f4f5` |
| Surfaces | `#111` / `#1a1a1a` / `#242424` | `#fff` / `#ececee` / `#e0e0e3` |

**Le seul jeton chromatique de toute l'application est l'anneau de focus.** Tout
le reste est du gris neutre, saturation zéro, dans les deux thèmes.

Sur fond noir, cela fonctionne : un noir et blanc sur du noir est un parti pris
légitime, cinématographique, que des applications de cinéma assument très bien.
Sur fond blanc, la **même** palette ne se lit plus comme un parti pris, mais
comme une maquette pas finie. Trois mécanismes l'expliquent, et aucun n'est une
question de goût.

**1. Le sombre obtient sa profondeur gratuitement, le clair non.** De `#000000`
à `#242424`, chaque palier est un écart *relatif* énorme, parce qu'on part de
zéro. De `#f4f4f5` à `#ffffff`, on parcourt environ 4 % de l'échelle de
luminance — et l'œil est justement le moins discriminant dans les hautes
lumières. Le même nombre de paliers, une fraction de la séparation perçue.

**2. Tout le système de transparence s'inverse en gris sale.** `--sh-ink` bascule
de `255,255,255` à `0,0,0`, donc chaque surface `rgba(var(--sh-ink), a)` devient
un voile noir. Sur du noir, un voile blanc *éclaire*. Sur du blanc, un voile noir
salit — c'est exactement le « halo sale » que les commentaires du préréglage
tentent de compenser en baissant les opacités.

**3. Le verre dépoli disparaît, et on le paie quand même.** Le préréglage clair
ne redéfinit **aucun** jeton de flou : `--sh-blur-chrome: blur(20px)
saturate(160%)` reste actif. Or flouter une page blanche derrière un panneau
blanc donne… du blanc. Le coût GPU est payé en entier, l'effet est nul.

### F1. Donner une vraie couleur d'accent au système *(la correction principale)*

L'orange du focus (`#ff9f0a` en sombre, `rgb(198,92,0)` en clair, déjà calibré
pour atteindre 3:1) est le seul candidat naturel : il est déjà là, il est déjà
justifié, et il donne au produit une identité.

Il faut en faire une **gamme** — cinq à sept paliers — et l'utiliser là où l'œil
cherche un repère : bouton d'action principal, progression de lecture, élément
sélectionné, badge « nouveau ». Pas partout : la règle qui tient est « commencer
en niveaux de gris, ajouter de la couleur pour clarifier, pas pour décorer ».

Le thème sombre y gagne aussi, mais moins — c'est le clair qui en a besoin.

### F2. Teinter les neutres et rouvrir l'échelle des surfaces

Deux changements liés :

- **Teinter.** Un gris de saturation zéro sur un grand aplat paraît mort. Un
  soupçon de teinte — froide (bleutée) pour un rendu technique, chaude (crème)
  pour un rendu chaleureux — suffit. Les ombres du préréglage le font déjà :
  `--sh-shadow-rgb: 116,116,132` est légèrement bleuté, et le commentaire dit
  pourquoi. Il faut appliquer le même raisonnement aux fonds.
- **Rouvrir l'échelle, et l'inverser.** Aujourd'hui la base est `#f4f4f5` et la
  surface est `#ffffff` : quatre pour cent d'écart. La convention qui marche en
  clair est **un fond plus franc et des surfaces qui remontent vers le blanc** —
  par exemple une base autour de `#eceef2` et des cartes à `#ffffff`. On y gagne
  du contraste de surface sans toucher au contraste du texte.

Le préréglage note d'ailleurs déjà que le blanc pur fatigue et que les
interfaces claires « doivent respirer, pas éblouir ».

### F3. Remplacer le verre par un trait

En clair, le flou ne produit rien : il doit être neutralisé
(`--sh-blur-chrome: none`) et remplacé par ce qui fonctionne réellement sur fond
clair — **une bordure d'un pixel**. C'est la règle des systèmes de conception
sérieux : en clair, une carte plate se délimite par un trait, une carte élevée
par une ombre, et l'on n'échange pas l'un contre l'autre.

Gain secondaire : six couches de `backdrop-filter` en moins à composer, sur le
thème et le matériel où cela coûte le plus cher.

### F4. Reconstruire les ombres au lieu de les affaiblir

Le préréglage a fait le bon diagnostic (le noir pur salit sur fond clair) et
choisi le mauvais levier : il a **baissé les opacités** à 0,12–0,24. À ces
valeurs, sur du blanc, l'ombre n'est plus qu'un souffle — et c'était le dernier
indice de profondeur qui restait.

La solution connue est une **ombre à deux couches** : un contact serré (1 à 2 px,
opacité plus élevée) qui pose l'objet, et une ombre d'ambiance large et très
diffuse (opacité faible) qui l'élève. Ensemble elles se lisent nettement sans
salir, là où une seule ombre moyenne fait exactement l'inverse.

### F5. L'accent tiré de l'affiche *(prolonge B4)*

Une teinte extraite de l'affiche en cours, appliquée aux détails d'accent, donne
au thème clair ce qui lui manque le plus : de la **variation**. La page cesse
d'être identique quel que soit ce qu'on regarde.

À condition de garder le garde-fou de contraste : une couleur dominante trop
claire sur un fond clair est illisible, et le critère 1.4.3 ne se négocie pas
parce que le résultat est joli. En pratique : on ne prend pas la couleur
dominante telle quelle, on la ramène à une luminosité choisie et on ne garde
d'elle que la teinte.

### F6. Un troisième thème, presque gratuit

Une fois la gamme d'accent et l'échelle de surfaces en place, un thème
« lecture » chaud — fonds crème, encre brun-noir — ne coûte qu'un jeu de
variables. C'est la démonstration que le travail de F1 et F2 a bien été fait :
si un troisième thème demande de retoucher du CSS ailleurs, c'est que des
couleurs sont encore codées en dur, ce que le préréglage soupçonne déjà en
commentaire.

### Ce qu'il faut vérifier, et pas seulement regarder

Le thème clair se juge dans des conditions que le bureau de développement ne
reproduit pas : la luminosité ambiante réduit le contraste perçu d'un écran de
façon considérable. Deux contrôles concrets :

- la **contre-épreuve des affiches** — une affiche très claire sur une carte
  blanche doit rester délimitée ; c'est précisément le cas que le commentaire du
  préréglage signale comme non vérifié ;
- un **contrôle automatisé du contraste** des paires de jetons, dans l'esprit
  des contrats existants : le préréglage explique avoir assombri l'orange du
  focus pour atteindre 3:1, mais rien ne vérifie que ce sera encore vrai après
  la prochaine retouche.

---

## Ce que je n'inclus pas, et pourquoi

| Idée | Raison |
|---|---|
| Marché de greffons tiers | Sans A1 et A4, ouvrir un catalogue tiers reviendrait à distribuer un accès complet à la session de l'utilisateur avec une étiquette « signé » qui ne prouve rien. |
| Greffons en WebAssembly | Le coût mémoire est déraisonnable sur le plancher matériel de ce projet, et rien dans les usages visés ne demande cette puissance. |
| API de greffon synchrone conservée après A4 | Incompatible avec `postMessage`. Autant l'assumer plutôt que de maintenir deux modèles. |
| Recommandations « parce que vous avez regardé » | Demande un modèle et des données d'usage que ce client n'a pas ; les faire mal produit des suggestions absurdes, ce qui est pire que rien. |
| Transcodage ou traitement média côté client | Ce n'est pas le rôle d'un client de lecture, et le serveur le fait mieux. |
| Doubler l'administration Jellyfin | Déjà gelé par `FeatureFlags`, pour la même raison qu'à l'époque. |
| Letterboxd et JustWatch dans le greffon de notes | Ni l'un ni l'autre n'expose d'API publique. Les contourner par extraction de page serait fragile et contraire à leurs conditions d'utilisation. |
| Un point d'entrée par lot pour OMDb | Il n'existe pas. Le gain vient du cache persistant et de la fenêtre de virtualisation, pas d'une requête groupée qu'on ne peut pas faire. |
| `scheduler.yield()` comme technique de base | Elle exige Chrome 129 ; le plancher de ce projet est Chrome 69. Elle reste utile en amélioration progressive, jamais comme fondation. |
| Un thème clair « pastel » ou coloré | La demande est de sortir de la monotonie, pas de changer d'identité. Une gamme d'accent et une échelle de surfaces suffisent ; teinter l'ensemble ferait un autre produit. |
| Supprimer les six couches de `backdrop-filter` partout | En thème sombre elles produisent réellement quelque chose, et le contrôle CSS les plafonne déjà à dix. On les neutralise **en clair**, là où elles ne rendent rien. |
| Un moteur de recommandation | Demande un modèle et des données d'usage que ce client n'a pas. Fait à moitié, il produit des suggestions absurdes — pire que pas de suggestion. |

---

## Récapitulatif

Quarante-quatre points, quatre vagues. La vague 1 ne contient que ce qui répare
un mensonge ou coûte moins d'une heure ; la vague 2 rend le SDK utilisable par
quelqu'un d'autre que son auteur et débloque le démarrage ; la 3 apporte les
grandes fonctionnalités ; la 4 est du confort.

### Vague 1 — arrêter de promettre ce qui n'est pas tenu, et le gratuit

| # | Sujet | Nature | Valeur | Effort |
|---|---|---|---|---|
| E1 | **hls.js en import dynamique** — 185 ko gzip hors du démarrage | perf | Très haute | Faible |
| A1 | Épingler la clé de signature du catalogue | sécurité | Très haute | Faible |
| A2 | Dire ce que peut réellement un greffon | sécurité | Très haute | Trivial |
| D1 | Persister le cache de notes + cache des absences | greffon | Très haute | Faible |
| D2 | Fermer la fuite des fournisseurs à la désactivation | correctif | Haute | Trivial |
| C2 | Manifeste PWA (débloque `storage.persist()`) | app | Haute | Trivial |
| E2 | Police : axe variable, puis auto-hébergement | perf | Haute | Faible |
| E3 | `fetchpriority` sur l'image du héros | perf | Moyenne | Trivial |
| A7 | Vérifier `apiVersion` | robustesse | Moyenne | Trivial |
| A8 | Registre de services au lieu de `window` | dette | Moyenne | Trivial |
| C14 | Import/export des réglages | app | Moyenne | Trivial |

### Vague 2 — rendre le SDK et le thème clair utilisables

| # | Sujet | Nature | Valeur | Effort |
|---|---|---|---|---|
| F1 | **Une vraie couleur d'accent dans le système** | thème | Très haute | Moyen |
| F2 | Teinter les neutres, rouvrir l'échelle des surfaces | thème | Très haute | Faible |
| F3 | Verre → bordure en clair (et flou neutralisé) | thème + perf | Haute | Faible |
| F4 | Ombres à deux couches au lieu d'ombres affaiblies | thème | Haute | Faible |
| E5 | Relevé LoAF sous `?perf=1` | perf | Haute | Faible |
| E7 | Budget de poids en intégration continue | perf | Haute | Trivial |
| A3 | Contrôle statique des sources de greffons | sécurité | Haute | Faible |
| A5 | Contributions mortes : `action` et `route`, retrait des autres | SDK | Haute | Faible |
| A6 | Schéma de réglages déclaratif | SDK | Haute | Moyen |
| A9 | Greffon d'exemple + documentation | SDK | Haute | Faible |
| D3 | Le greffon de notes passe par son contexte | correctif | Haute | Trivial |
| D5 | Tolérance d'année ±1 | correctif | Moyenne | Trivial |
| D7 | Ne résoudre que les cartes visibles | greffon | Haute | Faible |
| D8 | Dire pourquoi il n'y a pas de note | greffon | Moyenne | Faible |
| C8 | **Le téléphone comme clavier** (`SendString`) | app | Très haute | Faible |
| C9 | Badges de qualité réels (HDR, Atmos…) | app | Haute | Faible |
| C10 | Minuteur de sommeil | app | Moyenne | Trivial |
| C4 | Grille de chapitres visuels | app | Moyenne | Faible |
| C5 | Reprise entre appareils affichée | app | Moyenne | Faible |
| B1 | Paroles LRCLIB | greffon | Haute | Faible |

### Vague 3 — les grandes fonctionnalités

| # | Sujet | Nature | Valeur | Effort |
|---|---|---|---|---|
| C1 | **SyncPlay** — regarder ensemble | app | Très haute | Moyen |
| C12 | **Rechercher dans les dialogues** | app | Haute | Moyen |
| C3 | Personnalisation des sous-titres | accessibilité | Haute | Faible |
| C7 | Préparer la 12.0 | anti-régression | Haute | Faible |
| E4 | `scheduler.yield()` en amélioration progressive | perf | Moyenne | Faible |
| E6 | `content-visibility` sur les grilles | perf | Moyenne | Faible |
| D4 | Jeton Bearer pour TMDB | sécurité | Moyenne | Trivial |
| D6 | Sources élargies : TMDB, AniList, MusicBrainz | greffon | Haute | Moyen |
| D9 | Contrôle de santé qui contrôle | greffon | Moyenne | Faible |
| C6 | Changement de profil rapide | app | Moyenne | Moyen |
| C11 | Économiseur d'écran d'affiches | app | Moyenne | Faible |
| C13 | Statistiques de médiathèque | app | Moyenne | Faible |
| F5 | Accent tiré de l'affiche | thème | Moyenne | Moyen |
| B2 | Scrobbling ListenBrainz | greffon | Moyenne | Faible |
| B7 | AniList — l'animation japonaise | greffon | Haute | Faible |

### Vague 4 — confort et périphérie

| # | Sujet | Nature | Valeur | Effort |
|---|---|---|---|---|
| F6 | Troisième thème « lecture » | thème | Faible | Trivial |
| B4 | Thème dérivé de la pochette | greffon | Moyenne | Faible |
| B6 | Votre année en musique | greffon | Faible | Faible |
| B8 | Crédits musicaux MusicBrainz | greffon | Moyenne | Faible |
| B9 | Lumières à la lecture (Home Assistant / Hue) | greffon | Moyenne | Faible |
| B10 | Export de la médiathèque | greffon | Faible | Trivial |
| B3 | Trakt | greffon | Moyenne | Moyen |
| B5 | Sous-titres externes à la demande | greffon | Moyenne | Moyen |
| B11 | Traduction des synopsis | greffon | Faible | Moyen |
| E8 | Dimensions d'images — **à mesurer d'abord** | perf | Inconnue | Trivial |

### Hors vague

| # | Sujet | Déclencheur |
|---|---|---|
| A4 | Isolation en `iframe` | le jour où du code que nous n'avons pas écrit peut être installé |

### Le principe d'ordre

Trois règles ont produit ce classement, et elles priment sur la valeur perçue.

**Un mensonge se répare avant qu'une fonctionnalité s'ajoute.** A1, A2 et D2
sont en vague 1 non parce qu'ils se voient — ils ne se voient pas — mais parce
qu'une signature qui ne prouve rien et un greffon qui interroge Internet après
sa désactivation sont des dettes qui grossissent en silence.

**Ce qui est gratuit passe devant ce qui est cher.** E1 déplace 185 ko hors du
démarrage en changeant un `import` de place : aucune autre optimisation de cette
liste n'a ce rapport. Il en va de même de C2, quarante lignes qui débloquent le
travail déjà fait sur le stockage persistant.

**On ne mesure pas après, on mesure avant.** E5 est en vague 2 et non en vague 3
parce que E4, E6 et E8 sont des paris sans lui. E1 est la seule optimisation que
je place avant la mesure, parce que 185 ko de JavaScript analysés avant le
premier écran n'ont pas besoin d'être mesurés pour être un problème.

Enfin, le thème clair est traité **en bloc** : F1 à F4 forment une seule
correction. Ajouter un accent sans rouvrir l'échelle des surfaces donnerait une
tache de couleur sur une page toujours plate ; rouvrir l'échelle sans traiter le
verre laisserait six couches de flou qui coûtent cher et ne produisent rien.
Séparés, ces quatre points déçoivent ; ensemble, ils changent le produit.

---

## Sources

**Bac à sable.** Proposition TC39 `ShadowRealm` (étape 2.7, demande d'étape 3
en décembre 2024, aucune implémentation navigateur) ; retours d'ingénierie
Zendesk sur l'isolation par `iframe`.

**Jellyfin.** *State of the Fin* du 24 mai 2026 — versionnage 12.0 (la 11 est
sautée), autorisations dépréciées refusées par défaut, stabilisation de l'API
avant la 13.0 ; référence de protocole SyncPlay — points d'entrée `/SyncPlay/*`,
synchronisation d'horloge de type NTP sur quatre horodatages, correction par
`SpeedToSync` (0,2×–2×) et repli `SkipToSync` au-delà d'environ 400 ms ;
documentation du SDK Kotlin sur les WebSockets.

**Performance.** Guide *Core Web Vitals* 2026 — `scheduler.yield()` présentée
comme la correction la plus efficace du temps de réponse d'interaction, seuil de
200 ms et marge conseillée à 150 ms, `fetchpriority` et préchargement pour le
plus grand rendu de contenu ; *Long Animation Frames API*.

**Thème clair.** Systèmes de conception de référence sur l'élévation en mode
clair — appariement surface/ombre, bordure plutôt qu'ombre pour une carte plate
et pour le contenu défilant ; recommandations de conception d'interface claire —
éviter le blanc pur, neutres tièdes, une à deux profondeurs d'ombre, couleur
vive réservée aux actions, contraste de texte à 4,5:1 minimum, et vérification
en lumière du jour où le contraste perçu chute fortement.

**Relevés du dépôt** (et non des sources externes) : tailles des paquets de
`dist/`, occurrences de `font-weight` dans les feuilles, jetons de
`public/design-system/tokens.css` et de `ui/themes/presets/index.js`, et le code
cité dans les parties A et D.
