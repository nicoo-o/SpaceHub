# Plugins et métadonnées SpaceHub

## Les trois catégories

### 1. Plugins Jellyfin serveur

Ils sont installés et exécutés par Jellyfin. SpaceHub les lit avec `SpaceHub.jellyfin.plugins.list()` et les normalise. Leur présence dans la liste ne signifie pas que leur état d'exécution est connu : lorsque Jellyfin ne fournit aucun statut, l'interface affiche **État inconnu**.

Pour un compte administrateur, SpaceHub peut lire et sauvegarder la configuration d'un plugin uniquement lorsque Jellyfin expose un identifiant et une configuration pour ce plugin :

```js
const plugin = await SpaceHub.jellyfin.plugins.getConfiguration(pluginId);
await SpaceHub.jellyfin.plugins.saveConfiguration(pluginId, plugin);
```

Les opérations d'installation, de mise à jour et de suppression ne sont pas inventées. Elles restent indisponibles tant qu'un endpoint officiellement compatible n'a pas été détecté. L'administrateur doit alors utiliser le tableau de bord Jellyfin.

### 2. Modules natifs SpaceHub

Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr et qBittorrent sont des intégrations natives. Elles ne sont pas des plugins Jellyfin et leurs secrets restent dans la configuration SpaceHub.

### 3. Plugins SDK SpaceHub

Un plugin SDK est enregistré avec un manifest :

```js
await SpaceHub.sdk.registerPlugin({
    id: 'example.metadata',
    name: 'Example Metadata',
    version: '1.0.0',
    apiVersion: '2.0.0',
    permissions: ['jellyfin.items.read', 'jellyfin.metadata.read'],
    contributions: ['metadataProvider'],
    onLoad: async (context) => {
        context.sdk.registerMetadataProvider({
            id: 'example',
            name: 'Example Provider',
            fetch: async (item) => ({ Overview: item.Overview })
        });
    }
});
```

Les permissions sont refusées par défaut. Un administrateur doit approuver les permissions demandées avant activation :

```js
SpaceHub.sdk.approvePluginPermissions('example.metadata', [
    'jellyfin.items.read',
    'jellyfin.metadata.read'
]);
await SpaceHub.sdk.enablePlugin('example.metadata');
```

Le contexte fourni au plugin :

- ne contient pas le token Jellyfin ;
- expose les données via des façades contrôlées ;
- fournit un stockage isolé par plugin ;
- limite les requêtes externes à HTTPS et à la permission `network.external.read` ;
- nettoie les abonnements et contributions lors de la désactivation ;
- applique un timeout aux hooks et met en quarantaine un plugin instable.

> Le runtime JavaScript dans la même page n'est pas une sandbox parfaite. Pour du code tiers non fiable, un iframe sandboxé ou un Web Worker avec protocole `postMessage` est requis. Le catalogue signé protège l'intégrité et l'origine, mais ne remplace pas l'isolation.

## 内置插件：spacehub.ratings（外部评分）

SpaceHub 自带一个可选的评分插件 `spacehub.ratings`，通过 OMDb API 提供真实的第三方评分：

- **IMDb**（互联网电影数据库评分）
- **Rotten Tomatoes**（媒体综合评分，百分比）
- **Metacritic**（媒体综合评分）

Jellyfin 的 `CommunityRating`（★ 用户评分）不需要此插件，始终直接显示。

### 安装与配置

插件随应用启动自动注册，默认启用但**没有功能**，直到管理员在控制台配置 OMDb API 密钥：

1. 打开 **管理控制台 → 扩展与插件 SDK → 🍅 Ratings Plugin**；
2. 输入 OMDb API 密钥（[omdbapi.com](https://www.omdbapi.com/apikey.aspx) 免费申请），点击「保存密钥」；
3. 点击「测试连接」验证密钥有效；
4. 勾选默认显示的评分供应商（Jellyfin ★ / RT / IMDb / Metacritic）。

### 供应商显示偏好

- **管理员**在控制台设定所有用户的默认供应商组合；
- **用户**在「设置 → 通用 → 显示评分」中按需取消或重新勾选各供应商，立即生效；
- 某个供应商被取消勾选时，其徽章立即从卡片、Hero 和详情页消失，不会重新请求该数据；
- 未配置 OMDb 密钥或插件被禁用时，只显示 Jellyfin ★ 徽章；
- 没有 IMDb ID 的媒体不会请求外部评分，只显示 Jellyfin ★。

### 数据与缓存

- 评分通过 `RatingCacheService` 缓存 24 小时；
- 同一媒体的并发请求自动合并为一次 OMDb 调用；
- 最多 3 个并行外部请求，超出部分排队；
- 外部评分失败时静默降级，徽章隐藏，不显示任何占位或估计值；
- 评分只用于展示，不会写入 Jellyfin。

## Manifest et catalogue

Une entrée de catalogue distante doit contenir :

- un identifiant et une version SemVer ;
- un manifest ;
- une URL HTTPS ;
- un hash `sha256-...` ;
- une signature ECDSA P-256 et sa clé publique ;
- les permissions et la compatibilité annoncées.

Le catalogue suit les états `available`, `approved`, `downloading`, `verified`, `installing`, `installed`, `rolled_back`, `error`, `revoked` et `uninstalled`. Les opérations d'approbation, d'installation, de mise à jour, de rollback et de révocation exigent un administrateur Jellyfin. Un plugin révoqué ou dont l'intégrité échoue n'est pas chargé.

Le démarrage utilise l'URL `plugins.catalogUrl` si elle est configurée. Une mise à jour conserve jusqu'à cinq versions vérifiées dans le cache et le rollback réactive une version antérieure sans retélécharger son package lorsqu'il est encore disponible localement. Une installation sans `PluginManager`, sans manifest correspondant ou sans permissions identiques à celles du catalogue est refusée.

## Métadonnées

`SpaceHub.metadata` conserve la provenance champ par champ :

```js
const result = await SpaceHub.metadata.get(itemId, { libraryId: 'films' });
// result.values.Overview.sourceId → jellyfin, tmdb, ...
```

Les politiques sont configurables par bibliothèque :

```js
SpaceHub.metadata.setPolicy('films', {
    defaultOrder: ['jellyfin', 'tmdb'],
    fields: {
        Overview: ['jellyfin', 'tmdb'],
        Images: ['jellyfin', 'tmdb']
    }
});
```

Jellyfin reste la source serveur par défaut. Une donnée externe n'est jamais écrite automatiquement. L'écriture demande un administrateur et une confirmation explicite :

```js
await SpaceHub.metadata.applyToServer(itemId, result, { confirm: true });
```

## Politiques globales et utilisateurs

Les préférences personnelles sont locales à l'appareil. La synchronisation serveur, les politiques par groupe et le catalogue global nécessitent le plugin compagnon **SpaceHub Server Bridge**. Sans ce bridge, l'application affiche le mode `local` et ne prétend pas appliquer une politique globale.

## Validation avant publication

1. Tester le manifest et les permissions.
2. Vérifier le hash et la signature.
3. Tester sur un serveur Jellyfin de test.
4. Vérifier les erreurs 401/403/404 et les endpoints absents.
5. Vérifier le nettoyage après désactivation.
6. Vérifier la navigation clavier et télécommande.
7. Publier un changelog et les permissions ajoutées ou retirées.
8. Vérifier l'installation, la mise à jour et le rollback après rechargement de l'application.
