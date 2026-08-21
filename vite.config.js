import { defineConfig } from 'vite';
import http from 'node:http';
import https from 'node:https';

/**
 * Proxy de développement générique — contourne les restrictions CORS des
 * services *arr (Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr, qBittorrent)
 * qui n'envoient pas d'en-tête Access-Control-Allow-Origin.
 *
 * Le navigateur voit toutes les requêtes comme allant vers localhost:3000
 * (même origine que SpaceHub, donc aucune vérification CORS) ; c'est ce
 * serveur Vite (Node, pas un navigateur) qui relaie ensuite réellement la
 * requête vers l'adresse cible — les serveurs Node ne sont pas soumis aux
 * règles CORS, seuls les navigateurs les appliquent.
 *
 * ⚠️ Ne fonctionne qu'en développement (`npm run dev`). Une fois l'app
 * empaquetée en site statique (`npm run build`) ou en app Electron/Tauri,
 * il faudra soit un vrai reverse proxy (nginx/Caddy) configuré côté serveur
 * avec les en-têtes CORS, soit un petit backend équivalent à ce proxy.
 */
function spaceHubDevProxyPlugin() {
    return {
        name: 'spacehub-dev-proxy',
        configureServer(server) {
            console.log('\x1b[35m[spacehub-dev-proxy]\x1b[0m Proxy actif sur /__sh-proxy (contourne le CORS des services *arr)');

            server.middlewares.use('/__sh-proxy', (req, res) => {
                let target;
                try {
                    const reqUrl = new URL(req.url, 'http://internal');
                    const targetParam = reqUrl.searchParams.get('target');
                    if (!targetParam) {
                        console.warn('[spacehub-dev-proxy] Requête sans paramètre "target" — ignorée.');
                        res.statusCode = 400;
                        res.end('Missing "target" query parameter');
                        return;
                    }
                    target = new URL(targetParam);
                } catch (err) {
                    console.error('[spacehub-dev-proxy] URL cible invalide:', err.message);
                    res.statusCode = 400;
                    res.end('Invalid target URL: ' + err.message);
                    return;
                }

                console.log(`[spacehub-dev-proxy] ${req.method} → ${target.href}`);

                const client = target.protocol === 'https:' ? https : http;
                const headers = { ...req.headers };
                delete headers.host;
                delete headers.origin;
                delete headers.referer;
                // Important : NE PAS supprimer content-length ici. Le corps de la
                // requête (ex: username=...&password=... pour qBittorrent) passe
                // tel quel via req.pipe(proxyReq) plus bas, sans être modifié —
                // donc la longueur d'origine reste exacte. La supprimer forçait
                // un passage en chunked transfer-encoding que le petit serveur
                // HTTP embarqué de qBittorrent ne gère pas bien pour les POST,
                // ce qui corrompait silencieusement le corps (d'où des "identifiants
                // invalides" alors que les identifiants tapés étaient corrects).

                const proxyReq = client.request(target, { method: req.method, headers, timeout: 10000 }, (proxyRes) => {
                    console.log(`[spacehub-dev-proxy] ← ${proxyRes.statusCode} ${target.href}`);
                    res.writeHead(proxyRes.statusCode || 502, {
                        ...proxyRes.headers,
                        'Access-Control-Allow-Origin': '*',
                    });
                    proxyRes.pipe(res);
                });

                proxyReq.on('timeout', () => {
                    console.error(`[spacehub-dev-proxy] TIMEOUT (10s) vers ${target.href} — le serveur cible ne répond pas.`);
                    proxyReq.destroy();
                    if (!res.headersSent) {
                        res.statusCode = 504;
                        res.end('Proxy timeout: target did not respond within 10s');
                    }
                });

                proxyReq.on('error', (err) => {
                    // ECONNREFUSED = rien n'écoute à cette adresse (service éteint / mauvaise IP-port)
                    // ENOTFOUND    = nom d'hôte introuvable (faute de frappe dans l'URL)
                    console.error(`[spacehub-dev-proxy] Erreur réseau vers ${target.href}: ${err.code || err.message}`);
                    if (!res.headersSent) {
                        res.statusCode = 502;
                        res.end('Proxy error: ' + err.message);
                    }
                });

                req.pipe(proxyReq);
            });
        },
    };
}

export default defineConfig({
  plugins: [spaceHubDevProxyPlugin()],
  server: {
    port: 3000,
    open: true,
    host: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/hls.js')) {
            return 'vendor-hls';
          }
        }
      }
    }
  },
});
