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

/**
 * AUDIT A9 — pourquoi ce contrôle d'origine existe.
 *
 * Le proxy filtrait déjà sa CIBLE (liste blanche anti-SSRF). Il ne filtrait
 * pas son APPELANT, et répondait `access-control-allow-origin: *`. Or
 * `server.host: true` publie le serveur de développement sur tout le réseau
 * local. Conséquence : n'importe quelle page web ouverte dans le navigateur
 * de l'utilisateur pouvait faire
 *
 *     fetch('http://192.168.1.20:3000/api-proxy?url=http://192.168.1.30:8989/api/v3/…')
 *
 * et LIRE la réponse — le `*` l'y autorisait explicitement. Le proxy devenait
 * une fenêtre sur le réseau local de l'utilisateur, ouverte à tout site
 * visité, aussi longtemps que `npm run dev` tournait.
 *
 * On n'autorise donc que les origines servies par ce même serveur (l'app
 * elle-même) et les requêtes sans origine (curl, `<video>`, navigation directe).
 *
 * @param {import('node:http').IncomingMessage} req
 * @returns {string|null} L'origine à renvoyer, ou `null` si elle est refusée.
 */
function origineAutorisee(req) {
  const origine = req.headers['origin'];
  if (!origine) return null;            // Pas de CORS demandé : rien à accorder.
  try {
    const u = new URL(origine);
    // Même machine que le serveur de développement, quel que soit le port
    // (l'app peut être servie sur 3000, un aperçu sur 4173…).
    return isPrivateOrLocalHost(u.hostname) ? origine : null;
  } catch {
    return null;
  }
}

/** Applique les en-têtes CORS restreints, ou aucun si l'origine est refusée. */
function poserEntetesCors(req, entetes) {
  const origine = origineAutorisee(req);
  if (!origine) return entetes;
  entetes['access-control-allow-origin'] = origine;
  // Dès qu'on renvoie une origine variable, `Vary` est obligatoire : sans lui,
  // un cache intermédiaire servirait la réponse d'une origine à une autre.
  entetes['vary'] = 'Origin';
  entetes['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
  entetes['access-control-allow-headers'] = 'authorization, content-type, x-api-key, x-emby-authorization, accept';
  return entetes;
}

function dynamicCorsProxyPlugin() {
  // Le middleware est identique en dev et en preview : on le définit une seule
  // fois et on l'accroche aux deux serveurs. Sans configurePreviewServer, le
  // proxy /api-proxy n'existait qu'en `vite dev` — en `vite preview` (et sur
  // tout serveur statique servant dist/) chaque appel repli CORS des
  // intégrations Servarr/Jellyseerr repondait 404.
  const attachProxy = (server) => {
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
          res.writeHead(204, poserEntetesCors(req, {}));
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
              const responseHeaders = poserEntetesCors(req, { ...proxyRes.headers });
              // Incompatible avec une origine renvoyée sans authentification
              // partagée ; on ne le propage jamais depuis la cible.
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
  };

  return {
    name: 'dynamic-cors-proxy',
    configureServer: attachProxy,
    configurePreviewServer: attachProxy,
  };
}

export default defineConfig({
  plugins: [dynamicCorsProxyPlugin()],
  resolve: {
    // ══ hls.js : ESM (défaut) ou UMD/ES5 (SPACEHUB_HLS_UMD=1) ═══════════════
    //
    // LE PROBLÈME RAPPORTÉ. Un rapport hls.js (#7106) documente une
    // dégradation PROGRESSIVE sur les téléviseurs Samsung Tizen en lecture
    // longue — le flux part bien, puis se dégrade au fil des minutes. La
    // cause n'a pas été trouvée dans la configuration de hls.js mais dans la
    // combinaison « sortie ESM de Vite + anciens moteurs V8 », dont la gestion
    // mémoire est sous-optimale. Le correctif retenu par les auteurs du
    // rapport a été d'aliaser le build UMD/ES5. Notre couple Vite +
    // Chrome 69 correspond exactement au cas décrit.
    //
    // LA MESURE, faite ici et non recopiée d'ailleurs :
    //
    //     ESM (dist/hls.mjs)  →  593 kB  (gzip 185 kB)   ← défaut
    //     UMD (dist/hls.js)   →  625 kB  (gzip 194 kB)   ← +32 kB, +5,5 %
    //
    // Les 25 scénarios de bout en bout passent dans les deux cas.
    //
    // POURQUOI CE N'EST PAS LE DÉFAUT. Le coût est certain et mesuré : 9 kB
    // de plus sur le fil, sur un appareil dont le Wi-Fi est justement le
    // point faible. Le gain, lui, n'est PAS vérifié — il demande un vrai
    // téléviseur Tizen et une lecture d'au moins vingt minutes. Échanger un
    // coût certain contre un bénéfice supposé, sur la seule dépendance lourde
    // de l'application et sur son chemin critique, serait un mauvais marché.
    //
    // POUR TESTER SUR UN VRAI TÉLÉVISEUR, une commande :
    //
    //     SPACEHUB_HLS_UMD=1 npm run build
    //
    // Si la dégradation disparaît, faire de cette valeur le défaut est un
    // changement d'une ligne — et il sera alors adossé à une mesure.
    alias: process.env.SPACEHUB_HLS_UMD === '1'
      ? { 'hls.js': 'hls.js/dist/hls.js' }
      : {},
  },
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
    // « esnext » ne rétrograde RIEN. Le bundle partait donc avec 704 `?.` et
    // 97 `??`, dont la seule présence fait échouer l'ANALYSE du fichier sur
    // Chromium < 80 : écran blanc, sans message ni trace.
    //
    // Le repère n'est pas théorique. Les téléviseurs Samsung embarquent :
    //   2017 → M47   2019 → M63   2021 → M76   2023 → M94   2025 → M120
    //   2018 → M56   2020 → M69   2022 → M85   2024 → M108  2026 → M130
    // et le client Jellyfin officiel transpile, lui, jusqu'à Chrome 27.
    //
    // chrome69 couvre les modèles 2020 et plus récents. Descendre davantage
    // demanderait de vraies prothèses d'API (AbortController, IntersectionObserver),
    // ce qui n'est pas le même chantier. Les API manquantes entre 69 et 92 sont
    // couvertes par core/compat.js — esbuild ne traduit que la syntaxe.
    target: 'chrome69',
    outDir: 'dist',
    // AUDIT A15 — `sourcemap: true` publiait les `.map` à côté du bundle.
    // Elles reconstituent le code source complet : noms de variables, logique,
    // points d'entrée non documentés, et tout secret qui traînerait en dur.
    // `'hidden'` les GÉNÈRE toujours (on peut donc les archiver ou les
    // envoyer à un collecteur d'erreurs) mais n'écrit plus le commentaire
    // `//# sourceMappingURL=` dans les fichiers servis : le navigateur d'un
    // visiteur ne les demande plus.
    sourcemap: 'hidden',
    // Un seul fichier CSS pour toute l'application.
    // Raison : depuis l'extraction du CSS hors des fichiers JS, l'ordre de la
    // cascade dépend de l'ordre d'émission des feuilles. Avec le découpage par
    // chunk, tokens.css se retrouvait émis en DERNIER (il appartient au chunk
    // d'entrée) et écrasait les composants — l'inverse de l'ordre historique.
    // Un fichier unique rend l'ordre déterministe (= ordre des imports, donc
    // tokens.css en premier) et évite 5 feuilles bloquantes en cascade sur TV.
    cssCodeSplit: false,
    // hls.js et le chunk app font 584 kB / 590 kB — libs externes non fragmentables.
    // On monte la limite à 700 kB pour éviter le warning non-actionnable sur vendor-hls.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // P2 — Code Splitting : découpage du bundle 1.17 Mo en chunks thématiques
        // pour accélérer le premier rendu sur TV (connexion Wi-Fi faible).
        //
        // Priorité de matching (première règle qui match gagne) :
        //   1. vendor-hls    → hls.js isolé (590 kB, lazy, uniquement si lecture HLS)
        //   2. integrations  → /integrations/ (Servarr, qBit, Jellyseerr…)
        //   3. admin-console → AdminDashboardView + JellyfinConsoleModal (rarement ouverts,
        //                      pas de dépendance croisée avec VideoPlayer/LibraryView — cf. A10)
        //   4. settings      → SettingsPanel (idem, ouvert ponctuellement)
        //   5. app           → /jellyfin/ + /ui/views/ restants groupés ensemble pour éviter
        //                      le circular warning VideoPlayer↔LibraryView (dépendances croisées)
        //   6. (index)       → core + composants + plugins (chunk bootstrap chargé en premier)
        //
        // Gains attendus : le navigateur TV met en cache vendor-hls et ne le re-télécharge
        // pas si seul le code applicatif change ; admin-console/settings n'alourdissent plus
        // le chunk "app" chargé à chaque visite de la bibliothèque/des téléchargements.
        //
        // Note : ce découpage améliore le cache HTTP et le parallélisme du téléchargement des
        // chunks, mais ne les rend pas "chargés à la demande" — ces modules restent importés
        // statiquement depuis core/SpaceHub.js. Un vrai chargement paresseux demanderait de
        // convertir ces imports en import() dynamique (changement plus large, non fait ici).
        manualChunks(id) {
          // hls.js isolé — ne chargé que lors d'une lecture HLS
          if (id.includes('node_modules/hls.js')) return 'vendor-hls';

          // Intégrations tierces — pas de dépendances vers ui/ ou plugins/
          if (id.includes('/integrations/')) return 'integrations';

          // Console admin — vue autonome, aucune dépendance croisée avec le player/la library
          if (id.includes('/ui/views/AdminDashboardView') || id.includes('/ui/views/JellyfinConsoleModal')) {
            return 'admin-console';
          }

          // Panneau de réglages — composant autonome
          if (id.includes('/ui/components/SettingsPanel')) return 'settings';

          // jellyfin + ui/views restants groupés : VideoPlayer (jellyfin/) et LibraryView
          // (ui/views/) s'importent mutuellement → les réunir dans "app" supprime le circular warning.
          if (id.includes('/jellyfin/') || id.includes('/ui/views/')) return 'app';

          // Core runtime + composants + plugins → chunk bootstrap (index.js)
          // Chargé en premier, mis en cache longue durée.
        },
      },
    },
  },
});

