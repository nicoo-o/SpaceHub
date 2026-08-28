import { defineConfig } from 'vite';
import http from 'node:http';
import https from 'node:https';

function dynamicCorsProxyPlugin() {
  return {
    name: 'dynamic-cors-proxy',
    configureServer(server) {
      server.middlewares.use('/api-proxy', (req, res) => {
        const urlObj = new URL(req.url, 'http://localhost');
        const target = urlObj.searchParams.get('url');

        if (!target) {
          res.statusCode = 400;
          res.end('Missing "url" query parameter');
          return;
        }

        // Handle preflight OPTIONS
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'access-control-allow-headers': '*',
            'access-control-allow-credentials': 'true',
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

            const forwardHeaders = { ...req.headers };
            delete forwardHeaders.host;
            delete forwardHeaders.origin;
            delete forwardHeaders.referer;
            forwardHeaders['host'] = targetUrl.host;
            forwardHeaders['origin'] = targetUrl.origin;
            forwardHeaders['referer'] = `${targetUrl.origin}/`;

            if (bodyBuffer.length > 0) {
              forwardHeaders['content-length'] = String(bodyBuffer.length);
            } else {
              delete forwardHeaders['content-length'];
            }

            const proxyReq = client.request(
              targetUrl,
              {
                method: req.method,
                headers: forwardHeaders,
                rejectUnauthorized: false,
              },
              (proxyRes) => {
                const responseHeaders = { ...proxyRes.headers };
                responseHeaders['access-control-allow-origin'] = '*';
                responseHeaders['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
                responseHeaders['access-control-allow-headers'] = '*';
                responseHeaders['access-control-allow-credentials'] = 'true';

                // Nettoyage des cookies de session pour compatibilité maximale
                if (responseHeaders['set-cookie']) {
                  responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map((cookie) =>
                    cookie.replace(/;\s*Secure/gi, '').replace(/SameSite=Strict/gi, 'SameSite=Lax')
                  );
                }

                res.writeHead(proxyRes.statusCode || 200, responseHeaders);
                proxyRes.pipe(res);
              }
            );

            proxyReq.on('error', (err) => {
              res.statusCode = 502;
              res.end(JSON.stringify({ error: err.message }));
            });

            if (bodyBuffer.length > 0) {
              proxyReq.write(bodyBuffer);
            }
            proxyReq.end();
          } catch (e) {
            res.statusCode = 400;
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
  },
});

