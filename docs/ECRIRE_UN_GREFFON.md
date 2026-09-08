# Écrire un greffon SpaceHub

> Cette page décrit ce que `ctx` expose **réellement**. Jusqu'ici, la seule
> manière de le savoir était de lire `_buildContext` dans
> `core/PluginManager.js`.

---

## Ce qu'il faut savoir avant d'écrire une ligne

**Un greffon s'exécute dans la page, avec les mêmes droits que l'application.**
Les permissions que vous déclarez décrivent votre intention et ferment les
portes du contexte ; elles ne vous enferment pas. Il n'y a pas d'isolation
gratuite dans un navigateur.

Deux conséquences pratiques :

1. L'écran d'approbation dit à l'utilisateur que vous avez ces droits. Demandez
   le minimum : chaque permission superflue est une raison de plus de refuser.
2. **Le catalogue inspecte votre code source avant de le charger** et refuse
   `sessionStorage`, `localStorage`, `document.cookie`, `window.SpaceHub`, le
   `fetch` global, `XMLHttpRequest`, `eval`, `new Function`, `import()`
   dynamique et `indexedDB`. Chacun a une porte légitime dans `ctx` ; voir le
   tableau plus bas.

Ce n'est pas un bac à sable — quelqu'un de déterminé contourne une inspection
statique. C'est un garde-fou contre le raccourci, et il rend le contournement
visible dans le source.

---

## Le squelette minimal

```js
'use strict';

export default {
    id: 'monorg.monplugin',        // minuscules, points et tirets
    name: 'Mon greffon',
    version: '1.0.0',
    apiVersion: '2.0.0',           // la MAJEURE doit correspondre au SDK
    permissions: [],               // ce que vous demandez, rien de plus
    contributions: [],             // ce que vous fournissez réellement

    onEnable: async (ctx) => { /* … */ },
    onDisable: async (ctx) => { /* … */ },
};
```

Un fichier, un export par défaut. Le point le plus souvent manqué :
**`apiVersion` est vérifiée**. Une majeure différente de celle du SDK fait
refuser le greffon au chargement, avec un message qui le dit — plutôt qu'un
échec obscur, plus tard, sur une méthode disparue.

---

## Les crochets, et quand ils sont appelés

| Crochet | Quand | À quoi il sert |
|---|---|---|
| `healthCheck(ctx)` | avant l'activation, puis à la demande | **lever** si le greffon ne peut pas fonctionner ; c'est ce qui alimente l'état de santé |
| `onLoad(ctx)` | au chargement du module | préparer ce qui ne dépend pas de l'activation |
| `onEnable(ctx)` | à l'activation | enregistrer les contributions |
| `onDisable(ctx)` | à la désactivation | défaire ce que le SDK ne défait pas |
| `onUnload(ctx)` | au retrait | idem, dernier passage |

Les contributions enregistrées par `ctx.sdk.*` sont **retirées
automatiquement**. Ce que vous avez posé vous-même ailleurs — un minuteur, un
écouteur — est à vous de le retirer.

---

## Ce que `ctx` contient

### `ctx.sdk` — enregistrer des contributions

| Appel | Permission | Effet |
|---|---|---|
| `registerWidget(id, Classe)` | `ui.dashboard.write` | ajoute un widget au tableau de bord |
| `registerTheme(theme)` | `ui.theme.register` | ajoute un thème |
| `registerMetadataProvider(p)` | `jellyfin.metadata.read` | ajoute un fournisseur de métadonnées |
| `registerContribution(type, v)` | selon le type | `action`, `route` |
| `on` / `once` / `emit` | — | bus d'événements |

Les cinq types acceptés sont `widget`, `theme`, `route`, `metadataProvider` et
`action`. `adminPanel` et `module` **ont été retirés** : ils étaient acceptés et
n'avaient aucun consommateur — un greffon recevait un désabonnement valide pour
un enregistrement qui ne faisait rien.

**Une action** apparaît dans le menu contextuel des cartes :

```js
ctx.sdk.registerContribution('action', {
    libelle: 'Chercher les paroles',
    convient: (item) => item.type === 'Audio',   // facultatif ; sans lui, partout
    executer: async (item) => { /* … */ },
});
```

**Une route** est préfixée par votre identifiant (`x/<votre-id>/<nom>`) : un
greffon ne peut pas s'emparer de `accueil`.

### `ctx.api` — parler au serveur et au réseau

| Appel | Permission |
|---|---|
| `getItem(id)`, `getItems(…)` | `jellyfin.items.read` |
| `getMetadata(…)` | `jellyfin.metadata.read` |
| `getServerPlugins()` | `server.plugins.read` |
| `configureServerPlugin(…)` | `server.plugins.configure` *(administrateur)* |
| `fetch(url, options)` | `network.external.read` |

`ctx.api.fetch` **impose HTTPS**, un délai de 20 secondes et
`credentials: 'omit'`. C'est délibéré : un greffon qui interroge un service lent
ne doit pas pouvoir retenir indéfiniment une promesse de l'hôte, et il n'a
aucune raison d'envoyer les cookies de l'utilisateur à un tiers.

*Conséquence connue :* un service en HTTP simple sur le réseau local — un pont
domotique, par exemple — n'est pas joignable. C'est une limite assumée, pas un
oubli.

### `ctx.settings` — votre espace de configuration

`get(cle, defaut)`, `set(cle, valeur)`, `delete(cle)`, `export()`.

Cloisonné par greffon. **Ne stockez pas de secret que vous ne pourriez pas
laisser lire** : ces valeurs vivent dans les réglages, donc dans le navigateur,
et tout ce qui tourne dans la page peut les atteindre.

### `ctx.ui` — parler à l'utilisateur

`toaster`, `dashboard.registerWidget`, `themes.register` / `themes.apply`,
`openModal`.

### `ctx.ratings` — fournir des notes externes

`setProvider`, `setSearchProvider`, `setTextProvider`, `clearProviders`.
Derrière `jellyfin.metadata.read`.

### `ctx.log`

Un journal préfixé par votre identifiant. Utilisez-le : c'est ce qui permet à
quelqu'un de distinguer votre greffon de l'application dans une console.

### `ctx.permissions.has(nom)`

Pour adapter votre comportement plutôt que de laisser lever un appel.

---

## Les réglages : déclarez, ne dessinez pas

L'hôte rend votre formulaire à partir du seul `settingsSchema` :

```js
settingsSchema: [
    { cle: 'apiKey', type: 'secret', titre: 'Clé API', aide: 'Gratuite.' },
    { cle: 'langue', type: 'select', titre: 'Langue', defaut: 'fr',
      options: [{ valeur: 'fr', libelle: 'Français' }] },
    { cle: 'bavard', type: 'booleen', titre: 'Journal détaillé' },
    { cle: 'limite', type: 'nombre', titre: 'Limite', min: 1, max: 100 },
    { cle: 'note', type: 'texte', titre: 'Note libre' },
],
```

Le type **`secret`** mérite une phrase : le champ est toujours rendu **vide**, et
son texte d'invite dit seulement qu'une valeur est enregistrée. Un champ de mot
de passe pré-rempli avec la vraie valeur la rend lisible par l'inspecteur, par
le gestionnaire de mots de passe et par n'importe quelle extension. Et laisser
le champ vide **ne l'efface pas** — sans cela, ouvrir puis fermer l'écran des
réglages effacerait votre clé.

---

## Le tableau des équivalences

| N'écrivez pas | Écrivez | Pourquoi |
|---|---|---|
| `fetch(url)` | `ctx.api.fetch(url)` | HTTPS imposé, délai, pas de cookies |
| `localStorage` | `ctx.settings` | cloisonné par greffon |
| `sessionStorage` | `ctx.settings` | le jeton de session vit là, il n'est pas à vous |
| `window.SpaceHub…` | `ctx.…` | le contexte est l'API, la façade globale disparaîtra |
| `eval`, `new Function` | — | le chargeur les refuse |
| `import()` | — | un greffon est un module unique, vérifié en entier |

---

## Publier dans un catalogue

Une entrée de catalogue porte `id`, `version`, `manifest`, `permissions`,
`entrypoint` (HTTPS), `integrity` (`sha256-…`), `signature`, et **`keyId`**.

`keyId` désigne une clé que **l'installation connaît déjà** — épinglée dans le
code, ou ajoutée par l'utilisateur en connaissance de cause. Une entrée qui
embarque une `publicKey` est refusée : une clé fournie par le catalogue qu'elle
vérifie ne prouve rien.

---

## Par où commencer

`plugins/exemple/spacehub-exemple-plugin.js`. Il ne fait rien d'utile, et c'est
le but : un widget, une action de menu, deux réglages, et pas une ligne de plus.
