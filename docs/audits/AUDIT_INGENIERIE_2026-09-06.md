# Audit d'ingénierie SpaceHub — septembre 2026

**Périmètre :** 126 fichiers JavaScript (40 170 lignes), 33 feuilles CSS, 19 suites de tests, 10 contrats automatisés.
**Méthode :** lecture systématique du code, confrontation à l'état de l'art 2025-2026 (sources listées en annexe), et vérification en navigateur réel.
**État à la clôture :** 300 tests unitaires, 26 scénarios de bout en bout, 10 contrats — tous au vert.

---

## Ce qu'il faut retenir

Trois défauts trouvés cette fois-ci n'auraient été visibles dans aucun journal d'erreur, et c'est ce qui les rend importants :

1. **Le lecteur vidéo ne s'ouvrait pas du tout.** `gabaritLecteur()` lisait deux variables — `title` et `year` — qui n'étaient ni déstructurées de son contexte ni transmises par l'appelant. Toute tentative de lecture levait `ReferenceError: title is not defined` avant le moindre appel réseau. Le test d'empreinte du gabarit ne le voyait pas : il fabriquait lui-même un contexte contenant ces deux valeurs, et validait donc un chemin que l'application n'emprunte jamais.

2. **L'interface affirmait dix-sept choses que le code n'avait pas mesurées.** Un temps restant calculé en supposant que tout média dure 120 minutes ; douze séries quelconques présentées comme des animés ; « Tous les sous-titres français sont synchronisés ! » affiché précisément quand l'appel à Bazarr avait échoué ; « Bazarr connecté » affiché quand Bazarr n'était pas configuré. Aucun de ces cas ne produit d'erreur : l'écran est simplement faux.

3. **Un écran de chargement qui ne partait jamais.** Le retrait du splash était la dernière instruction de `init()`. Toute exception avant elle laissait l'application sur son écran de démarrage, indéfiniment, sans message.

Le fil commun : **du code qui ne peut pas échouer bruyamment échoue silencieusement**. Chaque correctif de ce lot est accompagné d'un test qui a été vérifié en réintroduisant le défaut — sans le correctif, le test tombe.

---

## 1. Fonctionnement réel

### 1.1 Le lecteur vidéo — trois défauts, dont un bloquant

| # | Défaut | Effet | État |
|---|---|---|---|
| 1 | `VideoPlayer.template.js` lisait `title` et `year`, jamais transmis | `ReferenceError` à chaque ouverture — **lecture impossible** | corrigé + contrat |
| 2 | Aucun écouteur `error` sur l'élément `<video>` | 404, jeton expiré, codec absent → écran noir, compteur tournant indéfiniment | corrigé + E2E |
| 3 | Détection d'introduction par le NOM des chapitres | fonctionnalité « Passer l'intro » quasi jamais déclenchée | corrigé (segments médias) |

Le second mérite un mot. Un `<video>` qui échoue ne lève rien : il arrête simplement de charger. Le compteur posé par `_setupVideoSource` restait donc à tourner sur du noir, sans cause ni recours — et sur téléviseur, sans même une touche « Échap » évidente. Un panneau nomme désormais la cause (les quatre codes `MediaError` traduits en phrases qui disent quoi faire) et propose deux issues, avec le focus posé sur la première.

Le troisième était une fonctionnalité fantôme. `_getIntroInterval` cherchait « intro », « opening » ou « générique » dans le nom des chapitres — or les chapitres viennent du conteneur vidéo et s'appellent presque toujours « Chapter 1 », « Chapter 2 ». Jellyfin 10.10 expose `/MediaSegments/{id}` : des plages **typées** (Intro, Outro, Commercial, Preview, Recap) produites par les greffons de détection. C'est une donnée, pas une devinette sur une chaîne de caractères. Les chapitres restent en repli pour les serveurs antérieurs.

Effet de bord corrigé au passage : l'intervalle était recalculé à chaque `timeupdate`, soit quatre balayages du tableau des chapitres par seconde pendant toute la durée du film. Il est résolu une fois par titre.

### 1.2 Ce que l'interface affirmait sans l'avoir mesuré

L'audit a porté spécifiquement sur la question « cette valeur vient-elle du serveur, ou le code l'a-t-il fabriquée ? ». Dix-sept endroits ont été corrigés. Les plus coûteux :

**Temps restant sur les cartes.** La formule était `Math.round((100 - PlayedPercentage) * 1.2)`, c'est-à-dire l'hypothèse que tout média dure exactement 120 minutes. Un épisode de 22 minutes vu à la moitié affichait « 60 min ». Le calcul juste — `(RunTimeTicks - PlaybackPositionTicks)` — existait déjà dans ce dépôt, à `ui/layouts/Dashboard.js` ; il n'avait simplement pas été repris. Sans ces deux valeurs, la carte n'affiche plus rien : une absence vaut mieux qu'un nombre inventé.

**Widget « Animés ».** Quand aucune série du genre « Animation » n'était trouvée, le widget filtrait les 24 séries les plus récentes sur des mots écrits en dur — dont un **titre précis** (`re:zero`) gravé dans le moteur, et des fragments qui attrapent tout (`anim` retient « Animals », `hero` retient « Heroes »). Puis, si cela ne donnait rien : `allSeries.slice(0, 12)`, douze séries quelconques sous l'en-tête « Animés ». Le message honnête « Aucun animé trouvé » n'était atteignable que si la médiathèque était vide. Les deux replis sont supprimés.

**Bazarr — la bonne nouvelle produite par une panne.** `getWantedSummary()` faisait suivre ses deux appels d'un `.catch(() => ({ data: [] }))`. Serveur éteint, clé API fausse, 401 : l'erreur disparaissait, le total valait 0, et **trois écrans** en tiraient une affirmation positive — « Tous les sous-titres français sont synchronisés ! », « Tous vos films et séries ont leurs sous-titres au complet ! », « 🟢 Tous les sous-titres français sont à jour ! ». L'utilisateur recevait une garantie produite par l'absence totale de mesure.

Le service distingue désormais trois états : mesuré à zéro, mesuré à N, non mesuré. Un échec ne se met plus en cache — il faut réessayer au prochain affichage, pas figer trois minutes d'ignorance. Corollaire réglé au passage : le repli sur `data.length` plafonnait le compte à la pagination demandée, faisant passer « 500 manquants » pour « 30 manquants ».

**Prowlarr — l'absence de données comptée comme la santé.** `getIndexerStatuses().catch(() => [])` rendait un tableau vide aussi bien quand tout allait bien que quand l'appel échouait (403, timeout) ; l'écran certifiait alors que 100 % des indexeurs étaient en ligne, pastille verte comprise. Un troisième état — pastille grise, « État inconnu » — a été ajouté.

**Statistiques.** Le comptage des genres se trouvait **hors** du bloc « élément vu » : « Top Genres Favoris » mesurait la composition du catalogue de l'administrateur, pas les goûts de l'utilisateur — alors que l'état vide invoquait des « données de visionnage » qui n'entraient pour rien dans le calcul. Le dénominateur des pourcentages était la somme des cinq premiers genres, si bien que les cinq barres totalisaient toujours ~100 % : un genre représentant 8 % des visionnages pouvait s'afficher « 34 % ». Enfin, un échec d'API renvoyait un objet plein de zéros, affiché comme « 0 h · 0 films · 0 épisodes · 0 % 4K ». Les trois sont corrigés, et « Temps Total Regardé » est devenu « Durée cumulée des titres vus » — parce que c'est ce que le chiffre mesure réellement, Jellyfin n'exposant pas de temps de visionnage sans le greffon *Playback Reporting*.

**Succès annoncés sans vérification.** `stopSession()` et `sendMessageToSession()` renvoient un booléen et ne lèvent pas ; l'interface annonçait le succès sans le lire. L'administrateur croyait avoir coupé un flux qui continuait de tourner. Même motif pour la synchronisation Bazarr, où le toast vert inconditionnel s'affichait **en même temps** que l'avertissement honnête du service — deux messages contradictoires côte à côte. Et dans la vue Téléchargements, le chaînage optionnel faisait que sans Bazarr configuré, aucun appel n'avait lieu et le toast vert s'affichait quand même.

**Métriques « FLUX EN DIRECT ».** Les quatre compteurs étaient écrits en dur à `0 B/s` / `0` dans le HTML, sous une pastille pulsante et un rafraîchissement toutes les six secondes. Sans qBittorrent configuré, aucune branche ne s'exécutait ; en cas d'échec, le `catch` était silencieux. « 0 B/s » veut dire « rien ne transite » ; ici cela voulait dire « je n'ai pas regardé ». Les valeurs partent maintenant de `—`.

**Un bouton mort.** « Inspecter », dans le contrôle qualité de l'écran administrateur, n'avait aucun écouteur — une recherche sur son identifiant dans tout le dépôt ne renvoyait que sa propre ligne. Un bouton mort est pire qu'un bouton absent : il fait douter l'utilisateur de lui-même.

**115 lignes de fausses critiques de presse.** `getCriticData()` était neutralisé par un `return null`, mais conservait intact un corpus de citations inventées **attribuées nommément à des journalistes réels** de Télérama, du Monde, de Libération et du Guardian, avec des notes « audience » et « Metacritic » dérivées d'un hachage du titre. Mettre en commentaire du contenu diffamatoire n'est pas le supprimer : la prochaine personne qui lit ce fichier peut décommenter sans mesurer ce qu'elle publie. Le bloc est supprimé. Les vraies critiques arrivent déjà par TMDB, avec auteur et URL d'origine.

### 1.3 Ce qui fonctionne réellement, et bien

L'audit ne trouve pas que des défauts. Trois parties se sont révélées rigoureuses :

- **Le service de plugins Jellyfin** est la partie la plus honnête du dépôt. Il lit vraiment `/Plugins`, déclare explicitement `canInstall: false, canUpdate: false, canUninstall: false` plutôt que de faire semblant, affiche « Statut : Inconnu » avec un badge distinct quand la réponse serveur ne le donne pas, et masque les secrets à l'affichage **en les restaurant à l'enregistrement** s'ils n'ont pas été modifiés.
- **Le SDK de plugins** fonctionne de bout en bout : chacune de ses délégations pointe vers une méthode qui existe (vérifiées une par une), le cycle de vie est complet (résolution de dépendances avec détection de cycles, hooks à délai maximum, quarantaine après deux erreurs, nettoyage au `disable`), les permissions sont refusées par défaut et `assert()` **lève**, et le catalogue vérifie réellement SHA-256 et signature ECDSA P-256 via WebCrypto.
- **Les six intégrations Servarr** appellent toutes de vrais points d'API. `BazarrApi.syncLibraries()` est exemplaire : chaque issue est nommée (`unreachable` / `unsupported` / `failed` / `started`) au lieu du `return { status: 'sync_requested' }` inconditionnel d'origine. Le service était honnête ; ce sont ses appelants qui ne l'étaient pas.

---

## 2. Sécurité

Onze constats traités. Les quatre qui comptent :

**Aucune politique de sécurité du contenu n'existait**, alors que `docs/XSS_EXCEPTIONS.md` affirmait le contraire. L'application construit beaucoup de balisage par `innerHTML` à partir de données du serveur : sans CSP, la moindre injection réussie disposait de la page entière. Une politique est désormais servie, `script-src 'self'` sans `unsafe-inline`, avec `object-src 'none'` et `base-uri 'none'` — les deux vecteurs classiques d'évasion. Un scénario de bout en bout vérifie qu'elle est là **et qu'elle mord** : il injecte un script inline et constate qu'il ne s'exécute pas.

La forme `<meta>` a des limites qu'il faut connaître avant d'y toucher : `frame-ancestors`, `sandbox` et `report-uri` y sont inopérants, il n'y a pas de mode `Report-Only`, et la règle ne s'applique qu'à partir de son analyse — cette balise doit rester la première du `<head>`. Un déploiement derrière un reverse-proxy doit les ajouter en vrais en-têtes.

**Le proxy de développement était une fenêtre sur le réseau local.** Il filtrait sa cible (liste blanche anti-SSRF) mais pas son appelant, et répondait `access-control-allow-origin: *`. Or `server.host: true` le publie sur tout le réseau. N'importe quelle page web ouverte dans le navigateur pouvait donc appeler `http://192.168.1.20:3000/api-proxy?url=http://192.168.1.30:8989/api/v3/…` et **lire la réponse** — le `*` l'y autorisait explicitement — aussi longtemps que `npm run dev` tournait. Seules les origines locales sont désormais acceptées, avec l'en-tête `Vary: Origin` obligatoire.

**Les sourcemaps étaient publiées en production.** Elles reconstituent le code source complet. `sourcemap: 'hidden'` les génère toujours (on peut donc les archiver) mais retire le commentaire `sourceMappingURL` des fichiers servis.

**La déconnexion ne déconnectait rien côté serveur.** `logout()` effaçait le jeton du navigateur et s'arrêtait là. La session Jellyfin restait ouverte, le jeton valide — et il n'expire pas. Un jeton récupéré avant la « déconnexion » continuait de fonctionner indéfiniment. `POST /Sessions/Logout` est maintenant appelé, jeton encore en main, avec un plafond de 4 secondes pour qu'un serveur éteint ne fasse pas patienter l'utilisateur.

Également traités : validation du schéma de l'URL serveur (`javascript:`, `file:`, `data:`, `ftp:` étaient acceptés tels quels ; une saisie sans schéma produisait une URL relative et l'utilisateur voyait « serveur injoignable » alors qu'il ne manquait que `http://`) ; `Referrer-Policy: no-referrer` ; `sandbox` et `referrerpolicy` sur l'iframe YouTube (sans quoi l'URL complète, qui contient l'identifiant de l'item Jellyfin, partait chez Google à chaque bande-annonce) ; et **l'import de configuration**, qui fusionnait n'importe quel JSON sans un seul contrôle — un fichier `{"parental":{"enabled":false}}` désactivait le verrou parental, et `{"__proto__":{…}}` polluait `Object.prototype`, puisque `JSON.parse` crée une propriété propre que `Object.keys` énumère.

### Identité déclarée au serveur

L'en-tête d'autorisation annonçait `Client="Jellyfin Web", Device="Chrome", Version="10.8.13"` — un mensonge, dupliqué dans trois fichiers. Conséquence concrète : dans le tableau de bord de l'administrateur, la session apparaissait comme le client officiel, impossible à distinguer, et sans indication de l'appareil. Une source unique déclare maintenant `Client="SpaceHub"` avec un appareil déduit de l'agent utilisateur — « Téléviseur LG », « PC Windows » — ce que l'utilisateur cherche réellement quand il regarde ses sessions.

---

## 3. Robustesse

**Le démarrage.** `init` était passé tel quel à `addEventListener` : la promesse qu'il renvoie n'était rattachée à rien, donc un échec partait en rejet non traité. Combiné au retrait du splash placé en dernière instruction, cela donnait le pire mode de panne possible — un écran de chargement éternel, sans message. Le retrait est maintenant dans un `finally`, et un écran de repli nomme la cause avec un bouton « Recharger ». Sans lui, retirer le splash ne ferait que révéler une page noire.

**La session révoquée.** La validité du jeton n'était vérifiée qu'au démarrage. Si l'administrateur fermait la session pendant l'utilisation, chaque widget affichait indépendamment « n'a pas pu s'afficher », l'état local restait « authentifié », et rien ne ramenait à l'écran de connexion ni ne disait pourquoi. `ApiClient` émet désormais `auth:expired` une seule fois par chargement, sur le premier 401/403 ; `SpaceHub.js` l'écoute et remonte l'écran de connexion **avec le motif** — d'où l'option `rechargement: false`, un `reload()` effacerait le message.

**Seize appels réseau sans délai d'attente.** Un `fetch` sans `signal` n'abandonne jamais de lui-même dans un délai utile. Un NAS éteint, un pare-feu qui laisse tomber les paquets sans répondre, et l'appel reste en suspens : le bouton « Se connecter » tourne indéfiniment, la synchronisation ne rend jamais la main. Ce n'était visible dans aucun journal — la promesse n'échoue pas, elle n'aboutit simplement pas. Les seize passent par `fetchAvecDelai`, y compris le `fetch` que le SDK expose aux plugins (plafond non négociable de 20 s : un greffon ne doit pas pouvoir retenir une promesse de l'hôte).

**L'état du réseau était ignoré.** Coupure Wi-Fi : chaque widget partait en erreur l'un après l'autre sans jamais nommer la vraie cause, et rien ne se rétablissait au retour — il fallait recharger. Un bandeau permanent signale désormais que les données affichées peuvent être périmées. `navigator.onLine === false` est une information fiable ; `true` ne prouve rien, on ne s'en sert donc que pour expliquer une panne, jamais pour promettre que tout fonctionne.

**Les valeurs par défaut n'existaient pas.** `registerDefaults()` reçoit un objet **plat** — `{ 'parental.enabled': false }` — mais `get()` interrogeait `_getDeep(this._defaults, 'parental.enabled')`, qui découpe sur le point et cherche une branche `_defaults.parental.enabled` qui n'existe pas. Les 36 valeurs par défaut enregistrées au démarrage n'ont **jamais** servi. L'application ne s'en apercevait pas parce que presque tous les appels passent un repli en second argument : le registre entier était décoratif.

---

## 4. Performance et interface

**Rendu paresseux du tableau de bord.** Il empile jusqu'à 27 widgets, chacun étant une rangée de cartes avec ses affiches et ses ombres. Le navigateur les met en page et les peint tous au premier rendu, y compris les vingt qui sont à trois écrans plus bas. `content-visibility: auto` avec `contain-intrinsic-size` — sous `@supports`, la propriété n'existant qu'à partir de Chrome 85 alors que le plancher du projet est Chrome 69 — laisse le navigateur sauter la mise en page des sections lointaines. Les deux premières en sont exemptées : elles sont toujours à l'écran, et les rendre paresseuses retarderait le plus grand élément affiché.

**Focus masqué par le dock (WCAG 2.4.11, niveau AA).** Quand c'est le **navigateur** qui fait défiler — touche Tab, `element.focus()`, ancre, retour d'historique — il aligne l'élément sur le bord haut de la zone visible, c'est-à-dire sous le dock flottant : l'élément a le focus, l'anneau est dessiné, et on ne voit ni l'un ni l'autre. C'est l'échec F110 de la norme, et il est invisible en test automatisé puisque le focus, lui, est bien posé. Le moteur de navigation spatiale a sa propre logique (pivot à 35 %), mais elle ne couvre que les touches fléchées. `scroll-padding` couvre tous les défilements, déclarativement, y compris ceux qu'on n'a pas prévus.

**Squelettes de chargement.** Un compteur centré dans une zone vide ne dit pas ce qui arrive et n'occupe pas la place que le contenu prendra : tout saute à l'arrivée des données. Le squelette réserve la forme réelle du panneau.

---

## 5. Comparaison à l'état de l'art

Ce qui a changé depuis 2024 et qui concerne directement ce projet.

**L'authentification Jellyfin bascule pour de bon.** `X-Emby-Authorization` et le paramètre d'URL `api_key=` sont dépréciés depuis 10.11 (octobre 2025) ; 10.12 a basculé le défaut de `EnableLegacyAuthorization` à `false`, cassant au passage Jellyseerr. La suppression est planifiée pour la majeure suivante — qui s'appelle désormais **12.0**, pas 10.12. SpaceHub émet déjà `Authorization: MediaBrowser` (la forme supportée) en plus de l'en-tête déprécié, donc le risque est limité. Reste le `api_key=` dans les URL de flux, que l'élément `<video>` natif rend inévitable : il n'accepte pas d'en-tête d'authentification. **Action recommandée :** tester contre un serveur avec `EnableLegacyAuthorization=false` — c'est le seul moyen de savoir si l'application survit à la prochaine majeure.

**La Navigation API est devenue Baseline début 2026** et fait partie d'Interop 2026. Elle offre nativement ce que le moteur maison code à la main : un événement unique pour toutes les navigations, `intercept()` sans `pushState`, `scroll: 'manual'`, et surtout la **restauration automatique du focus après navigation**. Indisponible sur Chrome 69, donc à traiter en amélioration progressive derrière un `if ('navigation' in window)`.

**`focusgroup` a shippé (Chrome 150, juillet 2026).** Il rend déclarative la navigation par flèches dans les widgets composites. Mais il ne fait pas de grille 2D, n'est pas encore dans la spécification HTML, et n'est pas dans Interop 2026 : le moteur spatial maison reste nécessaire. `focusgroup` ne pourrait servir que pour les barres d'outils et les onglets.

**Le diagnostic INP a changé d'outil.** Long Tasks est obsolète pour ce travail ; **LoAF** (Chrome 123) mesure la frame entière et expose l'attribution par script avec `forcedLayoutDuration` — le seul moyen de prouver quel gestionnaire coûte cher. Seuils Core Web Vitals inchangés : LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1, au 75e percentile.

**Vite est devenu une surface d'attaque documentée** — trois avis de sécurité en 2025 sur le contournement de `server.fs.deny`. La version du projet (5.4.21) est postérieure aux correctifs.

**Un piège de bundling propre aux téléviseurs.** Un rapport hls.js documente une dégradation progressive sur Tizen, tracée non pas à la configuration hls.js mais à la **sortie ESM de Vite combinée aux anciens moteurs V8**, dont la gestion mémoire est sous-optimale ; le correctif retenu a été d'aliaser le build UMD/ES5. Le couple Vite + Chrome 69 de ce projet correspond exactement au cas décrit. **Ce point n'a pas été appliqué** : il change le format de module de la seule dépendance lourde de l'application, et il serait irresponsable de l'appliquer sans mesure sur un téléviseur réel. C'est la première chose à tester si des ralentissements progressifs apparaissent en lecture longue.

---

## 6. Second lot — la dette identifiée, traitée

Les points listés comme « à faire » à la première passe ont été repris. Ce qui suit rend compte de ce qui a été fait, et de ce qui a été délibérément *décidé autrement*.

### 6.1 Le jeton quitte `localStorage`

Trois faits se combinaient : `localStorage` est lisible par tout script de la page ; le jeton Jellyfin **n'expire pas** ; `localStorage` survit à la fermeture du navigateur. La fenêtre d'exposition d'un jeton exfiltré n'était donc pas la session, mais « pour toujours ».

Le cookie `HttpOnly` — la vraie réponse — nous est fermé : il doit être posé par le serveur, et SpaceHub ne contrôle pas le serveur Jellyfin de l'utilisateur. Le jeton vit désormais **en mémoire**, avec une copie `sessionStorage` pour que F5 ne déconnecte pas. Cloisonnée à l'onglet, effacée à sa fermeture.

Deux détails qui font la différence entre un correctif et un demi-correctif :

- **La copie héritée est effacée, pas ignorée.** Un jeton écrit par la version précédente traîne sur le disque de l'utilisateur. Se contenter de ne plus le lire l'y laisserait, lisible, indéfiniment. Il est déplacé vers `sessionStorage` — la session en cours n'est donc pas interrompue — et l'original est supprimé.
- **Le coût est compensé.** Fermer le navigateur déconnecte : sur un téléviseur qu'on rallume chaque soir, c'est une saisie de plus. `derniereSession()` garde dans `localStorage` l'adresse du serveur et le nom du compte — **et rien d'autre** ; un garde-fou refuse de rendre cette mémoire si une régression future y écrivait un secret. L'écran de connexion revient donc pré-rempli, focus dans le champ mot de passe. Il ne reste que le mot de passe à taper.

**Ce qui n'a pas bougé, et pourquoi.** Les clés API Servarr (`sonarr.apiKey`, `bazarr.apiKey`…) et `parental.pinHash` restent dans `localStorage`, via `SettingsManager`. Ce n'est pas un oubli : ce sont des éléments de *configuration*, pas des identifiants de session. Les déplacer imposerait de resaisir six clés API à chaque ouverture du navigateur — un prix sans rapport avec le bénéfice. La distinction posée par l'OWASP porte sur les identifiants de session, et c'est celle qui a été appliquée.

### 6.2 hls.js : la mesure a été faite, et elle tranche autrement

Le rapport hls.js #7106 documente une dégradation progressive sur Tizen, tracée à la combinaison « sortie ESM de Vite + anciens moteurs V8 », avec le build UMD/ES5 pour correctif. Notre couple correspond au cas décrit. La mesure, faite ici :

| Build | Taille | gzip |
|---|---|---|
| ESM (`dist/hls.mjs`) — défaut | 593 kB | 185 kB |
| UMD (`dist/hls.js`) | 625 kB | 194 kB |

Les 26 scénarios de bout en bout passent dans les deux cas. **Le UMD n'est pas devenu le défaut** : le coût est certain et mesuré — 9 kB de plus sur le fil, sur un appareil dont le Wi-Fi est justement le point faible — tandis que le gain n'est pas vérifié ; il demande un vrai téléviseur Tizen et une lecture d'au moins vingt minutes. Échanger un coût certain contre un bénéfice supposé, sur la seule dépendance lourde de l'application et sur son chemin critique, serait un mauvais marché.

Le basculement tient en une variable d'environnement :

```
SPACEHUB_HLS_UMD=1 npm run build
```

Si la dégradation disparaît sur l'appareil, en faire le défaut est un changement d'une ligne — et il sera alors adossé à une mesure plutôt qu'à un rapport concernant une autre application.

### 6.3 Segments médias : au-delà de l'introduction

Le bouton ne connaissait que l'introduction. Il suit maintenant trois types :

| Segment | Libellé | Effet |
|---|---|---|
| `recap` | « Passer le résumé » | saute le « Précédemment dans… » |
| `intro` | « Passer l'intro » | inchangé, avec repli sur les chapitres |
| `preview` | « Passer l'aperçu » | saute la bande-annonce du prochain épisode |

L'ordre compte : un résumé imbriqué dans une introduction — cela arrive — donne la main au plus spécifique.

`commercial` est **volontairement absent**. Le contenu d'un serveur Jellyfin personnel n'a pas de coupures publicitaires, et proposer de « passer la publicité » sur un enregistrement télé reviendrait à décider à la place de l'utilisateur ce qui est du contenu.

Le segment `outro` sert autrement : il déclenche la carte « épisode suivant ». Le seuil était « il reste 30 secondes », une approximation qui se trompe dans les deux sens — un film avec quatre minutes de générique fait attendre, un épisode sans générique voit la carte recouvrir la dernière scène. Quand le serveur fournit un `outro`, il sait exactement où le générique commence.

### 6.4 Virtualisation des rangées

Au-delà de 60 cartes, une rangée ne rend que sa fenêtre visible plus une marge, et deux cales tiennent la place du reste. Mesure en navigateur réel : **400 cartes → 17 nœuds dans le DOM au départ, 33 après avoir parcouru 150 cartes au clavier.**

Ce qui a demandé le plus d'attention n'est pas la virtualisation mais ce qu'elle menace. Le moteur spatial cherche sa cible parmi les éléments **présents** : une carte pas encore rendue, et la flèche droite ne trouve rien — le focus s'arrête au milieu de la rangée, sans que rien ne l'explique. Trois protections, et deux défauts trouvés en les écrivant :

1. **Marge de 12 cartes** de chaque côté. Une pression de touche en consomme une.
2. **Extension sur focus**, sans attendre l'événement de défilement — qui arrive *après* que le moteur a cherché sa cible, donc trop tard.
3. **Seuil de 60** : en dessous, on ne virtualise pas du tout, le gain serait nul et le risque réel.

Les deux défauts, tous deux trouvés par les tests et non par relecture :

- **`insertBefore` sur un élément focalisé lui retire le focus.** Déplacer un nœud le détache puis le rattache ; le navigateur repose le focus sur `<body>`. Garder la carte dans le DOM ne suffisait donc pas — il faut lui rendre le focus après le réordonnancement.
- **Et rendre le focus provoquait une récursion infinie.** `focus()` émet `focusin`, écouté pour étendre la fenêtre, qui rappelle le rendu, qui rend le focus… « Maximum call stack size exceeded ». Sur un téléviseur, cela ne produit pas une trace dans une console : cela fige l'application. Une garde de réentrance, et un test qui compte les passes imbriquées — il en mesure 30 quand on retire la garde, 1 avec.

### 6.5 Les quatre dettes du SDK

- **`applyTheme`** rapportait un échec quand `apply()` réussissait sans rien renvoyer : le `|| false` transformait tout `undefined` en `false`. C'est l'inverse d'un mensonge, mais c'est faux pareil — un plugin qui teste ce retour affiche une erreur alors que le thème est à l'écran.
- **`registerMetadataProvider`** rendait une fonction de désabonnement vide quand le service était absent. Du point de vue du plugin, tout s'était bien passé : il avait « un désabonnement », donc son enregistrement avait « réussi ». Il découvrait le contraire beaucoup plus tard, sans moyen de relier les deux. Il renvoie `null` — l'enregistrement n'a pas eu lieu, et cela se voit.
- **Le plugin de notes était réservé aux administrateurs**, alors qu'il ne demande que `network.external.read` et `jellyfin.metadata.read` — ni l'une ni l'autre dans `ADMIN_ONLY`. Aucun compte ordinaire ne voyait jamais de note externe, et l'écran de réglages lui réclamait pourtant sa clé API OMDb : on lui demandait un secret pour rien. `setApproved` n'exige désormais un administrateur que si le lot contient une permission qui **agit sur le serveur** — et il refuse le lot **entier** dans ce cas, sans quoi il suffirait de noyer une permission serveur dans un lot anodin.
- **La contribution `metadataProvider`** était déclarée et jamais enregistrée. Ce plugin n'est pas un fournisseur de métadonnées au sens du SDK : il alimente `RatingCacheService`. Ajouter un enregistrement factice pour faire coller le manifeste aurait été pire que la déclaration fausse ; elle est retirée.

**Trouvé au passage :** `SDK.getPluginStorage` laissait remonter l'exception de `PluginManager` sur un plugin inconnu. Le chaînage optionnel ne protège pas d'une exception levée *à l'intérieur* d'une fonction — il ne couvre que son absence. Cet accesseur est appelé depuis un littéral de gabarit du panneau de réglages : un plugin non chargé y faisait disparaître **tout l'écran des réglages**.

### 6.6 Ce qui reste ouvert

- **Tester contre un Jellyfin avec `EnableLegacyAuthorization=false`.** `Authorization: MediaBrowser` est déjà émis, donc le risque est limité — mais c'est le seul moyen de savoir si l'application survit à la prochaine majeure (qui s'appellera 12.0, pas 10.12).
- **Mesurer l'INP réel via LoAF** sur une rangée longue, téléviseur compris.
- **Vérifier le comportement mémoire sur un vrai Tizen**, avec et sans `SPACEHUB_HLS_UMD=1`.
- **Le paramètre `api_key=` dans les URL de flux** reste : l'élément `<video>` natif n'accepte pas d'en-tête d'authentification, il n'existe pas d'alternative côté navigateur pour une lecture directe.

## Annexe — état des contrôles automatisés

| Contrôle | Portée | Ce qu'il empêche |
|---|---|---|
| `test:unit` | 300 tests, 22 suites | régressions fonctionnelles |
| `test:e2e` | 26 scénarios, navigateur réel | ce que jsdom ne voit pas |
| `test:fantomes` | 902 appels, 80 classes | méthodes et fonctions appelées mais jamais définies |
| `test:gabarits` | 110 interpolations, 4 modules | **nouveau** — un gabarit qui lit une variable qu'on ne lui donne pas |
| `test:focus` | 22 conteneurs, 9 classes | conteneurs de défilement déclarés focalisables, scopes réécrits |
| `test:nav` | 46 sélecteurs, 12 scopes | moteur de navigation désaligné du DOM |
| `test:css` | 32 feuilles, 36 jeux d'images-clés | CSS dans le JS, images-clés orphelines, coût GPU |
| `test:xss` | 508 interpolations | données externes non échappées |
| `test:input` | 10 gestionnaires | écouteurs clavier hors du routeur |
| `test:globals` | plafond de 20 accès | dispersion des accès à `window.SpaceHub` |

Le contrat `test:gabarits` est né de cette session : il a été écrit après la découverte du défaut du lecteur vidéo, et il l'attrape — ainsi que sa jumelle, `year` — sans produire un seul faux positif sur les quatre modules de gabarit du dépôt.

---

## Annexe — sources

Navigation et téléviseurs : spécification W3C *Spatial Navigation* et polyfill WICG ; API Norigin Spatial Navigation ; guide *Magic Remote* de LG webOS ; retour de production Zattoo sur la double modalité pointeur / 5-way ; Adrian Roselli, *Where to Put Focus When Deleting a Thing*.
Performance : *Web Vitals* et *content-visibility* sur web.dev ; *Long Animation Frames API* sur Chrome for Developers ; retours terrain Oxagile sur les téléviseurs Tizen d'entrée de gamme ; hls.js #7106.
Sécurité : *Mitigate XSS with a strict CSP* (web.dev) ; *HTML5 Security Cheat Sheet* de l'OWASP ; avis de sécurité Vite ; *Abusing Exposed Sourcemaps* (Sentry).
Accessibilité : critères WCAG 2.2 — 2.4.11, 2.4.13, 2.5.8, 1.4.2 — sur le site du W3C WAI ; MDN sur `prefers-reduced-motion` et les régions live.
Jellyfin : notes de version 10.10 et 10.11 ; *State of the Fin* du 24 mai 2026 ; documentation des segments médias ; référence d'autorisation de l'API.
