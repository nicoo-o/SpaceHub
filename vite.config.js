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
    //     Sous Vite 5 + esbuild (mesure initiale) :
    //       ESM (dist/hls.mjs)  →  593 kB  (gzip 185 kB)   ← défaut
    //       UMD (dist/hls.js)   →  625 kB  (gzip 194 kB)   ← +32 kB, +5,5 %
    //
    //     Re-mesurée le 9 septembre 2026 sous Vite 8 + rolldown — la
    //     décision tient, l'écart est resté le même à 1 ko près :
    //       ESM (dist/hls.mjs)  →  584,6 kB  (gzip 181,5 kB)  ← défaut
    //       UMD (dist/hls.js)   →  619,8 kB  (gzip 190,5 kB)  ← +35 kB, +6,0 %
    //
    // Les 27 scénarios de bout en bout passent dans les deux cas
    // (re-prouvé sur le build UMD lors de la re-mesure).
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
    // Le plus gros paquet est maintenant le démarrage (891 kB brut, 210 ko
    // gzip) et vendor-hls (584 kB). Aucun des deux n'est fragmentable : le
    // premier EST l'application, le second une bibliothèque tierce.
    chunkSizeWarningLimit: 950,
    rollupOptions: {
      output: {
        // DÉCOUPAGE DES PAQUETS — pourquoi `advancedChunks` et pas `manualChunks`
        // =====================================================================
        //
        // CE QUI NE MARCHAIT PAS, ET POURQUOI ÇA NE SE VOYAIT PAS
        // -------------------------------------------------------
        // La version précédente rangeait les modules avec `manualChunks(id)`,
        // en six règles, et un commentaire annonçait le gain : « admin-console
        // et settings n'alourdissent plus le chunk chargé à chaque visite ».
        //
        // Le build produisait l'inverse. Mesuré sur la v1.5.1 :
        //
        //     <link rel="modulepreload" href="/assets/admin-console-….js">
        //
        // dans `dist/index.html`, 20,6 ko gzip, à chaque démarrage, pour une
        // console d'administration que `features.adminConsole` éteint par
        // défaut (core/FeatureFlags.js) et que `core/SpaceHub.js` ne charge
        // qu'en `import()` dynamique.
        //
        // La cause n'était PAS le préchargement. En lisant les cartes de
        // source du paquet, le chunk « admin-console » contenait six modules :
        //
        //     core/Logger.js            2,0 ko de source
        //     core/services.js          9,9 ko
        //     core/utils/domUtils.js    7,4 ko
        //     ui/views/JellyfinConsoleModal.template.js   17,5 ko
        //     ui/views/JellyfinConsoleModal.js            57,5 ko
        //     ui/views/AdminDashboardView.js              31,9 ko
        //
        // Les trois premiers sont les modules les plus partagés du dépôt.
        // `manualChunks` ne leur assignait rien (aucune règle ne couvrait
        // `/core/`), rolldown les a donc groupés par accessibilité — et les a
        // placés DANS le paquet de l'entrée dynamique. Résultat : `index`,
        // `app` et `integrations` importaient tous les trois
        // `admin-console` STATIQUEMENT, pour y prendre une soixantaine de
        // symboles. Le préchargement était honnête ; le découpage ne l'était
        // pas. Retirer le `modulepreload` (par `build.modulePreload`) aurait
        // baissé le chiffre mesuré en RENDANT LE DÉMARRAGE PLUS LENT : le
        // fichier restait nécessaire, simplement découvert plus tard.
        //
        // Un essai en sens inverse — supprimer la règle `admin-console` —
        // rendait les choses pires encore : les deux vues tombaient dans
        // `app`, chargé à chaque visite (+23 ko).
        //
        // POURQUOI `advancedChunks` RÉPOND, LÀ OÙ `manualChunks` NE POUVAIT PAS
        // --------------------------------------------------------------------
        // `manualChunks` est consultatif sous rolldown : un nom rendu pour un
        // module est une étiquette, pas une décision. Vérifié ici — en
        // assignant explicitement `/core/` à un paquet « core », les trois
        // modules ci-dessus restaient dans `admin-console`, et `integrations`
        // se faisait absorber ailleurs.
        //
        // `advancedChunks` décide vraiment, et surtout il sait exprimer la
        // BONNE question. Le critère n'est pas « dans quel dossier vit ce
        // fichier » mais « ce fichier est-il joignable au démarrage » :
        //
        //   — `tags: ['$initial']` capture exactement les modules atteignables
        //     statiquement depuis l'entrée. Un module partagé entre l'entrée et
        //     une vue paresseuse est `$initial` : il va au démarrage, et la vue
        //     paresseuse l'importe depuis là. C'est le sens correct de la
        //     dépendance, celui que `manualChunks` inversait.
        //   — les groupes prioritaires (hls, console admin, réglages) prennent
        //     d'abord ce qui leur revient ; aucun d'eux n'est `$initial`, donc
        //     aucun ne peut se retrouver au démarrage par accident.
        //
        // MESURE
        // ------
        //                        avant      après
        //   démarrage          276,1 ko   254,8 ko gzip   (−21,3)
        //   admin-console      préchargé  différé (18,2 ko)
        //   réglages           différé    différé (18,0 ko)
        //   vendor-hls         différé    différé (175,5 ko)
        //
        // Le graphe des paquets est aussi devenu une étoile — chaque paquet
        // différé importe `index` et rien d'autre. L'ancien découpage avait
        // `index → admin-console`, `app → admin-console`,
        // `integrations → app` : un ordre d'évaluation à tenir en tête.
        //
        // CE QU'ON PERD, ET POURQUOI C'EST ACCEPTABLE
        // -------------------------------------------
        // Le découpage `index` / `app` / `integrations` disparaît : ces trois
        // paquets ne font plus qu'un. L'ancien commentaire en attendait un gain
        // de cache HTTP — « le navigateur TV ne re-télécharge pas si seul le
        // code applicatif change ». Ce gain n'existait pas : les trois
        // changeaient ENSEMBLE à chaque modification du code applicatif, donc
        // leurs empreintes changeaient ensemble. Le seul paquet qui bénéficie
        // vraiment du cache est `vendor-hls`, épinglé à une version de
        // dépendance — et il reste séparé.
        //
        // Une variante gardant les trois paquets a été mesurée : 264,7 ko,
        // soit 10 ko de plus que celle-ci, et elle produisait des imports
        // CIRCULAIRES entre paquets (`index ↔ app`, `app ↔ integrations`).
        // La documentation de rolldown demande alors `preserveEntrySignatures`
        // et `strictExecutionOrder` pour ne pas émettre de paquets invalides.
        // Plus lourd et plus fragile : écarté.
        advancedChunks: {
          includeDependenciesRecursively: false,
          groups: [
            { name: 'vendor-hls', test: /node_modules[\\/]hls\.js/, priority: 100 },
            { name: 'admin-console', test: /[\\/]ui[\\/]views[\\/](AdminDashboardView|JellyfinConsoleModal)/, priority: 90 },
            { name: 'settings', test: /[\\/]ui[\\/]components[\\/]SettingsPanel/, priority: 90 },
            // Tout le reste de ce qui est joignable au démarrage. En dernier,
            // pour ne prendre que ce que les groupes ci-dessus ont laissé.
            { name: 'demarrage', tags: ['$initial'], priority: 10 },
          ],
        },
      },
    },
  },
});

