# Déploiement de SpaceHub en production

Ce document tranche la question laissée ouverte par l'audit : **le proxy CORS
`/api-proxy` est une fonctionnalité du serveur de développement Vite, pas une
architecture de production.**

## Le problème, en une phrase

Les intégrations Servarr (Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr,
qBittorrent) tournent sur d'autres ports que SpaceHub. Le navigateur bloque donc
les appels directs, sauf si ces services renvoient les en-têtes CORS adéquats —
ce qu'aucun d'eux ne fait par défaut.

En développement, `vite` intercepte `/api-proxy?url=…` et relaie la requête.
En production, les fichiers construits sont servis par nginx, Caddy ou Jellyfin :
**ce chemin n'existe plus**. Pire, un serveur de fichiers configuré en mode
« application monopage » renvoie `index.html` avec un code 200 pour n'importe
quel chemin inconnu — l'appel semble réussir et l'intégration reçoit du HTML là
où elle attend du JSON.

Depuis la vague 5, SpaceHub détecte ce cas : la première réponse HTML ou 404
venant du proxy coupe la bascule et affiche un message explicite au lieu de
réessayer en boucle. Mais détecter n'est pas résoudre — il faut un vrai proxy.

## Les trois options, par ordre de préférence

### 1. Reverse-proxy en façade (recommandé)

Une seule origine pour tout : SpaceHub et les API passent par le même hôte, donc
plus aucune requête inter-origines, donc plus de CORS du tout. C'est aussi ce qui
permet de n'exposer qu'un port et de mettre du HTTPS devant l'ensemble.

**Caddy** — le plus court :

```caddy
spacehub.mondomaine.fr {
    encode gzip

    # Les API internes, chacune sous son préfixe.
    handle_path /svc/sonarr/*     { reverse_proxy 192.168.1.10:8989 }
    handle_path /svc/radarr/*     { reverse_proxy 192.168.1.10:7878 }
    handle_path /svc/prowlarr/*   { reverse_proxy 192.168.1.10:9696 }
    handle_path /svc/bazarr/*     { reverse_proxy 192.168.1.10:6767 }
    handle_path /svc/jellyseerr/* { reverse_proxy 192.168.1.10:5055 }
    handle_path /svc/qbit/*       { reverse_proxy 192.168.1.10:8080 }
    handle_path /svc/jellyfin/*   { reverse_proxy 192.168.1.18:8096 }

    # L'application elle-même, en dernier.
    handle {
        root * /srv/spacehub/dist
        try_files {path} /index.html
        file_server
    }
}
```

**nginx** — équivalent :

```nginx
server {
    listen 443 ssl http2;
    server_name spacehub.mondomaine.fr;

    root /srv/spacehub/dist;
    index index.html;

    location /svc/sonarr/     { proxy_pass http://192.168.1.10:8989/; }
    location /svc/radarr/     { proxy_pass http://192.168.1.10:7878/; }
    location /svc/prowlarr/   { proxy_pass http://192.168.1.10:9696/; }
    location /svc/bazarr/     { proxy_pass http://192.168.1.10:6767/; }
    location /svc/jellyseerr/ { proxy_pass http://192.168.1.10:5055/; }
    location /svc/qbit/       { proxy_pass http://192.168.1.10:8080/; }

    # Jellyfin a besoin des WebSockets pour les notifications en direct.
    location /svc/jellyfin/ {
        proxy_pass http://192.168.1.18:8096/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        # Les flux vidéo sont longs : ne pas les couper au bout de 60 s.
        proxy_read_timeout 3600s;
        proxy_buffering off;
    }

    location / { try_files $uri $uri/ /index.html; }
}
```

Renseignez ensuite chaque intégration avec son URL **relative** dans
Réglages → Intégrations : `/svc/sonarr`, `/svc/radarr`, etc. Plus aucune requête
n'est inter-origines, et le proxy de repli ne sert jamais.

Deux points à ne pas rater : `proxy_read_timeout` généreux et `proxy_buffering off`
pour Jellyfin, faute de quoi nginx tente de mettre un film entier en tampon avant
de le servir ; et les en-têtes `Upgrade`/`Connection` sans lesquels les
notifications en direct de Jellyfin ne fonctionnent pas.

### 2. Proxy dédié conservé, mais servi en production

Si vous tenez au fonctionnement actuel (`/api-proxy?url=…`), il faut le faire
tourner comme un vrai service. Le code du proxy de développement se trouve dans
`vite.config.js` (fonction `attachProxy`) : sa liste blanche d'hôtes est le
mécanisme de sécurité à conserver — sans elle, n'importe qui atteignant votre
SpaceHub peut s'en servir pour émettre des requêtes vers votre réseau interne.

Indiquez ensuite son chemin dans `window.SpaceHubConfig.proxyBase` (dans
`index.html`) ou via le réglage `network.proxyBase`.

### 3. Autoriser CORS sur chaque service

Possible sur certains services Servarr, mais à éviter : cela revient à ouvrir
chaque API à toutes les pages web que visite votre navigateur, et la
configuration est à refaire service par service, à chaque mise à jour.

## Rappel : construire avant de servir

```bash
npm ci
npm test        # lint, fumée, navigation, hygiène CSS, injection HTML
npm run build   # produit dist/
```

Servez le contenu de `dist/`. Le dossier `dist/design-system/tokens.css` est
servi tel quel et **doit** rester accessible : c'est la feuille de tokens
chargée avant tout le reste.

## Vérifier que le déploiement est correct

1. Ouvrir SpaceHub, se connecter à Jellyfin : la bibliothèque doit s'afficher.
2. Lancer une lecture et vérifier dans le tableau de bord Jellyfin que la session
   apparaît en **DirectPlay** (et non en transcodage) pour un fichier compatible.
3. Ouvrir Réglages → Intégrations : chaque service configuré doit répondre.
   Si un message signale l'absence de proxy, c'est l'option 1 ou 2 qui manque.
