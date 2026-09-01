import { defineConfig } from 'vite';
import http from 'node:http';
import https from 'node:https';

function isPrivateOrLocalHost(host) {
  const h = (host || '').toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.internal') || h.endsWith('.home') || !h.includes('.')) return true;
  return false;
}

function isAllowedProxyTarget(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();

    // 1. Réseau local / Loopback / Home server
    if (isPrivateOrLocalHost(host)) return true;

    // 2. APIs officielles autorisées & Médias
    if (
      host === 'image.tmdb.org' ||
      host === 'api.themoviedb.org' ||
      host.endsWith('.themoviedb.org') ||
      host.endsWith('.tmdb.org') ||
      host.endsWith('.github.com') ||
      host.endsWith('.githubusercontent.com') ||
      host.endsWith('.jsdelivr.net')
    ) {
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}

function dynamicCorsProxyPlugin() {
  return {
    name: 'dynamic-cors-proxy',
    configureServer(server) {
      server.middlewares.use('/api-proxy', (req, res) => {
        const urlObj = new URL(req.url, 'http://localhost');
        const target = urlObj.searchParams.get('url');

        if (!target) {
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing "url" query parameter' }));
          return;
        }

        // Whitelist anti-SSRF stricte
        if (!isAllowedProxyTarget(target)) {
          res.statusCode = 403;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Target host is not allowed by the secure CORS proxy whitelist' }));
          return;
        }

        // Handle preflight OPTIONS
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'access-control-allow-headers': '*',
            // 'access-control-allow-credentials' est incompatible avec origin: *
            // (la spec CORS interdit cette combinaison — les navigateurs ignorent le header).
          });
          res.end();
          return;
        }

        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          const bodyBuffer = Buffer.concat(chunks);

          try {
            const targetUrl = new URL(target);
            const isHttps = targetUrl.protocol === 'https:';
            const client = isHttps ? https : http;
            const isLocal = isPrivateOrLocalHost(targetUrl.hostname);

            const forwardHeaders = { ...req.headers };
            delete forwardHeaders['host'];
            delete forwardHeaders['origin'];
            delete forwardHeaders['referer'];
            delete forwardHeaders['connection'];
            delete forwardHeaders['accept-encoding'];
            delete forwardHeaders['sec-fetch-dest'];
            delete forwardHeaders['sec-fetch-mode'];
            delete forwardHeaders['sec-fetch-site'];

            forwardHeaders['host'] = targetUrl.host;
            forwardHeaders['origin'] = targetUrl.origin;
            forwardHeaders['referer'] = `${targetUrl.origin}/`;

            if (bodyBuffer.length > 0) {
              forwardHeaders['content-length'] = String(bodyBuffer.length);
            } else {
              delete forwardHeaders['content-length'];
            }

            const requestOptions = {
              hostname: targetUrl.hostname,
              port: targetUrl.port || (isHttps ? 443 : 80),
              path: targetUrl.pathname + targetUrl.search,
              method: req.method,
              headers: forwardHeaders,
              // Pour les serveurs locaux LAN avec certificat auto-signé, autoriser le certificat
              rejectUnauthorized: !isLocal,
              // Les endpoints Jellyfin d'agrégation peuvent dépasser 15 s sur un NAS.
              // Le client tente d'abord le serveur directement ; le proxy doit rester
              // suffisamment patient lorsqu'il prend le relais pour un serveur sans CORS.
              timeout: 30000,
            };

            const proxyReq = client.request(requestOptions, (proxyRes) => {
              const responseHeaders = { ...proxyRes.headers };
              responseHeaders['access-control-allow-origin'] = '*';
              responseHeaders['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
              responseHeaders['access-control-allow-headers'] = '*';
              // 'access-control-allow-credentials' est incompatible avec origin: *
              // (la spec CORS interdit cette combinaison — les navigateurs ignorent le header).
              delete responseHeaders['access-control-allow-credentials'];

              // Nettoyage des cookies de session pour compatibilité maximale
              if (responseHeaders['set-cookie']) {
                responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map((cookie) =>
                  cookie.replace(/;\s*Secure/gi, '').replace(/SameSite=Strict/gi, 'SameSite=Lax')
                );
              }

              res.writeHead(proxyRes.statusCode || 200, responseHeaders);
              proxyRes.pipe(res);
            });

            proxyReq.on('timeout', () => {
              proxyReq.destroy();
              if (!res.headersSent) {
                res.statusCode = 504;
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({ error: 'Gateway Timeout: connection to target server timed out' }));
              }
            });

            proxyReq.on('error', (err) => {
              console.error('[CORS Proxy Error]', target, err.message);
              if (!res.headersSent) {
                res.statusCode = 502;
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({ error: `Bad Gateway: ${err.message}` }));
              }
            });

            if (bodyBuffer.length > 0) {
              proxyReq.write(bodyBuffer);
            }
            proxyReq.end();
          } catch (e) {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [dynamicCorsProxyPlugin()],
  server: {
    port: 3000,
    open: true,
    host: true,
    proxy: {
      '/Users': {
        target: 'http://localhost:8096',
        changeOrigin: true,
        secure: false,
      },
      '/Items': {
        target: 'http://localhost:8096',
        changeOrigin: true,
        secure: false,
      },
      '/Videos': {
        target: 'http://localhost:8096',
        changeOrigin: true,
        secure: false,
      },
      '/Shows': {
        target: 'http://localhost:8096',
        changeOrigin: true,
        secure: false,
      },
      '/Sessions': {
        target: 'http://localhost:8096',
        changeOrigin: true,
        secure: false,
      },
      '/System': {
        target: 'http://localhost:8096',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
    // hls.js et le chunk app font 584 kB / 590 kB — libs externes non fragmentables.
    // On monte la limite à 700 kB pour éviter le warning non-actionnable sur vendor-hls.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // P2 — Code Splitting : découpage du bundle 1.17 Mo en chunks thématiques
        // pour accélérer le premier rendu sur TV (connexion Wi-Fi faible).
        //
        // Priorité de matching (première règle qui match gagne) :
        //   1. vendor-hls  → hls.js isolé (590 kB, lazy, uniquement si lecture HLS)
        //   2. integrations → /integrations/ (Servarr, qBit, Jellyseerr…)
        //   3. app         → /jellyfin/ + /ui/views/ groupés ensemble pour éviter le
        //                    circular warning VideoPlayer↔LibraryView (dépendances croisées)
        //   4. (index)     → core + composants + plugins (chunk bootstrap chargé en premier)
        //
        // Gains attendus : le navigateur TV met en cache vendor-hls et ne le re-télécharge
        // pas si seul le code applicatif change.
        manualChunks(id) {
          // hls.js isolé — ne chargé que lors d'une lecture HLS
          if (id.includes('node_modules/hls.js')) return 'vendor-hls';

          // Intégrations tierces — pas de dépendances vers ui/ ou plugins/
          if (id.includes('/integrations/')) return 'integrations';

          // jellyfin + ui/views groupés : VideoPlayer (jellyfin/) et LibraryView (ui/views/)
          // s'importent mutuellement → les réunir dans "app" supprime le circular warning.
          if (id.includes('/jellyfin/') || id.includes('/ui/views/')) return 'app';

          // Core runtime + composants + plugins → chunk bootstrap (index.js)
          // Chargé en premier, mis en cache longue durée.
        },
      },
    },
  },
});

