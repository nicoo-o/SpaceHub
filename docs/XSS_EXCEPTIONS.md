# Injection HTML — les cas relus, un par un

*Point §8 de l'audit externe. Dernière revue : 2 septembre 2026.*

## Pourquoi ce document existe

L'audit initial comptait 237 `innerHTML` et en concluait un risque. Le comptage
brut ne prouve rien : la quasi-totalité de ces `innerHTML` interpole des valeurs
structurelles — une classe CSS choisie par un ternaire, un identifiant interne,
un nombre. Ce qui compte, c'est le sous-ensemble où **une chaîne venue du
serveur Jellyfin ou d'une API tierce** atteint le DOM sans être échappée.

`scripts/xss-hygiene-check.mjs` isole exactement ce sous-ensemble et **échoue si
un nouveau cas apparaît**. Ce document dit ce que la liste blanche du script ne
peut pas dire : d'où vient la donnée, et pourquoi elle est sûre.

État au dernier passage (`npm run test:xss`) :

```
Injection HTML : 138 gabarit(s) balayé(s), 509 interpolation(s) feuilles examinées
  (dont 4 module(s) *.template.js — les gabarits extraits restent sous contrôle).
Aucune donnée externe non échappée hors des 14 cas relus et documentés.
```

138 gabarits balayés ; 509 interpolations examinées ; 14 dispensées
d'échappement, listées plus bas.

> **Le chiffre a plus que doublé, et ce n'est pas une bonne nouvelle.**
> La première version de ce document annonçait 194 interpolations examinées.
> Ce n'était pas le bon nombre : le balayeur s'arrêtait trop tôt. Voir
> « L'angle mort du contrôle » ci-dessous.

## Le mécanisme d'échappement

`core/utils/domUtils.js` :

```js
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const el = document.createElement('div');
    el.textContent = String(str);
    return el.innerHTML;
}
```

Il délègue au navigateur plutôt qu'à une table de remplacement maison : c'est
l'analyseur du navigateur lui-même qui décide ce qui doit être encodé, donc
aucune séquence d'échappement ne peut être oubliée.

Le contrôle considère aussi comme sûres : `encodeURIComponent`, `String(…)`,
`Number(…)`, `JSON.stringify(…)`, les fonctions `render*` (qui construisent
elles-mêmes du HTML relu) et les fabriques d'icônes `*Svg` (constantes du code).

## Ce que le contrôle laisse passer volontairement

Une interpolation n'est signalée que si son expression contient un nom de champ
trahissant une origine externe : `name`, `title`, `overview`, `path`,
`indexer`, `episode`, `series`, `user`, `message`, `error`… Une interpolation
comme `${idx}` ou `${item.RunTimeTicks}` n'est pas signalée. C'est un choix
assumé : ces valeurs ne sont pas des chaînes libres. **Ce n'est pas une preuve
d'absence de faille — c'est un garde-fou contre la dérive**, ce que le comptage
de 237 ne pouvait pas offrir.

## Les 13 cas dispensés

Tous relèvent du même motif, et c'est ce qui les rend défendables : le titre
d'un widget, affiché dans son en-tête, **écrit en dur dans le constructeur du
widget**. Aucun ne traverse le réseau.

| # | Fichier | Ligne (affichage) | Ligne (source) | Valeur |
|---|---------|-------------------|----------------|--------|
| 1 | `ui/widgets/MoviesWidget.js` | 34 | 15 | `'Films'` |
| 2 | `ui/widgets/ContinueWatchingWidget.js` | 28 | 15 | `'Reprendre la lecture'` |
| 3 | `ui/widgets/LatestAdditionsWidget.js` | 27 | 15 | `'Derniers Ajouts'` |
| 4 | `ui/widgets/TvShowsWidget.js` | 28 | 15 | `'Séries TV'` |
| 5 | `ui/widgets/CollectionsWidget.js` | 29 | 15 | `'Sagas & Collections'` |
| 6 | `ui/widgets/MusicWidget.js` | 29 | 15 | `'Musique'` |
| 7 | `ui/widgets/LibrariesWidget.js` | 28 | 16 | `'Mes Collections & Bibliothèques'` |
| 8 | `integrations/sonarr/SonarrWidgets.js` | 28, 145 | 18, 135 | `'Prochains Épisodes (Sonarr)'`, `'Téléchargements Sonarr'` |
| 9 | `integrations/radarr/RadarrWidgets.js` | 28, 146 | 18, 136 | `'Sorties Films à Venir (Radarr)'`, `'Téléchargements Radarr'` |
| 10 | `integrations/bazarr/BazarrWidgets.js` | 27 | 17 | `'Sous-titres Manquants (Bazarr)'` |
| 11 | `integrations/prowlarr/ProwlarrWidgets.js` | 28 | 18 | `'Indexeurs Prowlarr'` |
| 12 | `integrations/qbittorrent/QBittorrentWidgets.js` | 28, 123 | 18, 113 | `'Vitesse qBittorrent'`, `'Torrents Actifs (qBittorrent)'` |
| 13 | `integrations/jellyseerr/JellyseerrWidgets.js` | 217, 290, 363 | 201, 280, 353, 426, 499 | cinq titres constants, un par classe de widget |
| 14 | `ui/components/CardBuilder.js` | 169 | 144-160 | `label` : « Regarder », « Ouvrir », « Reprendre »… calculé sur place, jamais reçu du réseau |

**Source de la donnée** : littéral du code source, fixé à la construction.
**Validation** : aucune n'est nécessaire — la valeur ne peut pas varier à
l'exécution. Le seul moyen de la modifier est de modifier le code source, ce
qui suppose déjà d'avoir réussi à en changer le contenu.

**Vérification à refaire si le code change** : que `this.title` reste affecté
une seule fois, dans le constructeur, avec un littéral. Le tableau ci-dessus
donne les lignes exactes à contrôler. C'est précisément ce contrôle qui a
révélé le cas suivant.

## Le 14e cas — celui qui n'était pas sûr

`ui/widgets/AnimeWidget.js` figurait dans la liste avec la même mention que les
autres : « titre du widget, constante du code ». **C'était faux.**

Le widget détecte la bibliothèque d'animés de l'utilisateur et adopte son nom :

```js
this.title = animeLib.Name || 'Animés';   // ligne ~86
```

`animeLib.Name` est le nom de bibliothèque **choisi par l'administrateur du
serveur Jellyfin** : une chaîne libre, arrivée par le réseau. La mise à jour
immédiate passait par `textContent`, donc sans danger. Mais `render()`
réinjecte `${this.title}` en `innerHTML`, et `ui/layouts/Dashboard.js:794`
rappelle `render()` lors d'un re-rendu du tableau de bord. Au second rendu, le
nom de bibliothèque partait donc en HTML non échappé.

Gravité réelle : faible. Il faut être administrateur du serveur pour nommer une
bibliothèque, et l'administrateur peut déjà bien pire. Mais l'entrée de la liste
blanche affirmait une chose fausse, et une liste blanche qui ment est pire
qu'une absence de liste.

**Corrigé** : `<span>${escapeHtml(this.title)}</span>`, et l'entrée retirée de
`REVUS` — le contrôle reconnaît `escapeHtml` comme sûr, le cas n'a donc plus
besoin de dispense. Un commentaire à l'endroit de l'affectation explique
pourquoi cette valeur-là doit rester échappée.

## L'angle mort du contrôle — et les quinze injections qu'il cachait

Le premier balayeur cherchait la fin d'un gabarit en avançant jusqu'au prochain
accent grave. Or l'écriture la plus courante de cette application est :

```js
container.innerHTML = `
    <div>${poster ? `<img src="${poster}" alt="${m.title}">` : ''}</div>
    …tout le reste du gabarit…
`;
```

L'accent grave du gabarit **imbriqué** terminait le balayage. Tout ce qui
suivait — souvent l'essentiel du HTML — n'était jamais examiné. Le contrôle
affichait « aucune donnée non échappée » en toute bonne foi, sur une fraction
du code.

Le balayeur suit désormais une pile de contextes (gabarit, expression, chaîne)
et descend récursivement dans les gabarits imbriqués pour ne juger que les
expressions **feuilles**. Le nombre d'interpolations examinées est passé de 194
à 509 : les deux tiers du HTML n'étaient pas contrôlés.

Ce que cela avait laissé passer, corrigé dans la même passe :

| Fichier | Donnée | Origine |
|---------|--------|---------|
| `integrations/sonarr/SonarrWidgets.js` | `ep.series?.title`, `ep.title`, `item.episode.title` | titres de série et d'épisode renvoyés par l'API Sonarr |
| `integrations/radarr/RadarrWidgets.js` | `m.title`, `item.movie?.title` | titres de film renvoyés par l'API Radarr |
| `integrations/bazarr/BazarrWidgets.js` | `m.title` | titre de film renvoyé par Bazarr |
| `integrations/prowlarr/ProwlarrWidgets.js` | `idx.name` | nom d'indexeur, saisi librement dans Prowlarr |
| `integrations/qbittorrent/QBittorrentWidgets.js` | `t.name` (deux fois : attribut `title` et contenu) | **nom de torrent** — la chaîne la moins fiable du lot : elle vient d'un tracker public |
| `integrations/jellyseerr/JellyseerrWidgets.js` | `title` (attribut `alt` et contenu), `user.displayName \|\| user.email` | titre de média et identité d'utilisateur, via Jellyseerr |
| `ui/widgets/UnifiedCalendarWidget.js` | `ev.title`, `ev.subTitle`, `ev.posterUrl` | calendrier agrégé depuis Sonarr et Radarr |
| `core/TrailerService.js` | `s.label` | libellé de bande-annonce, champ `Name` des `RemoteTrailers` Jellyfin |
| `ui/views/JellyfinConsoleModal.template.js` | `mod.icon`, `mod.name` | catalogue local, échappé par précaution |

Toutes passent désormais par `escapeHtml` (ou `ctx._escape` dans les modules de
gabarit) ; `ev.posterUrl`, qui atterrit dans un attribut `src`, passe par
`encodeURI`.

Gravité : modérée. Il faut contrôler un des services connectés — ou, pour
qBittorrent, réussir à faire télécharger un torrent au nom façonné. Mais ce sont
exactement les chaînes qu'un contrôle d'injection est censé attraper, et le
contrôle affichait « tout va bien ».

**La leçon vaut plus que le correctif** : un contrôle automatique qui passe au
vert n'est une garantie que si l'on a vérifié ce qu'il regarde vraiment. Celui-ci
n'avait jamais été mis en défaut parce que personne ne lui avait demandé combien
de HTML il voyait. Le nombre d'interpolations examinées est maintenant affiché à
chaque passage, précisément pour qu'une chute se remarque.

## Les gabarits extraits restent sous contrôle

Quatre gros littéraux HTML ont été sortis de leur composant vers des modules
`*.template.js`. Un gabarit qui quitte un `innerHTML =` pour un `return` sortait
mécaniquement du champ du contrôle : le nombre d'interpolations examinées aurait
chuté sans qu'aucune ne soit devenue sûre. Le contrôle scanne donc aussi le
`return` des modules `*.template.js`.

## Ce que ce document ne prétend pas

- Il ne prouve pas l'absence de faille d'injection dans l'application.
- Il ne couvre pas les `innerHTML` sans interpolation (gabarits statiques), ni
  les interpolations dont l'expression n'évoque aucun champ externe. Cette
  seconde limite est un choix de sensibilité : le contrôle ne signale une
  interpolation que si son expression contient un nom de champ trahissant une
  origine externe (`name`, `title`, `overview`, `path`, `user`…). Une donnée
  serveur rangée dans une variable au nom neutre lui échapperait.
- Il ne remplace pas une Content-Security-Policy. La CSP est décrite dans
  `docs/DEPLOIEMENT.md` et relève du déploiement, pas du code client.

Ce qu'il fait : rendre chaque dispense justifiable par écrit, et faire échouer
la construction dès qu'une quatorzième apparaît sans justification.
