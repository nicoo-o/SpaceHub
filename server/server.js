/**
 * SpaceHub — Production Server & Proxy
 * Version: 1.0.0
 *
 * Ce serveur Node.js minimal remplace le proxy de développement Vite en production.
 * Il sert les fichiers statiques (le build dist/) et fournit le point d'entrée /__sh-proxy
 * pour contourner les restrictions CORS des services *arr.
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, '../dist');

const server = http.createServer((req, res) => {
    // 1. Point d'entrée Proxy
    if (req.url.startsWith('/__sh-proxy')) {
        handleProxy(req, res);
        return;
    }

    // 2. Service de fichiers statiques
    handleStatic(req, res);
});

function handleProxy(req, res) {
    try {
        const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const targetParam = reqUrl.searchParams.get('target');

        if (!targetParam) {
            res.statusCode = 400;
            res.end('Missing "target" query parameter');
            return;
        }

        const target = new URL(targetParam);
        console.log(`[Proxy] ${req.method} → ${target.href}`);

        const client = target.protocol === 'https:' ? https : http;
        const headers = { ...req.headers };
        delete headers.host;
        delete headers.origin;
        delete headers.referer;

        const proxyReq = client.request(target, { method: req.method, headers, timeout: 10000 }, (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, {
                ...proxyRes.headers,
                'Access-Control-Allow-Origin': '*',
            });
            proxyRes.pipe(res);
        });

        proxyReq.on('timeout', () => {
            console.error(`[Proxy] Timeout vers ${target.href}`);
            proxyReq.destroy();
            if (!res.headersSent) {
                res.statusCode = 504;
                res.end('Proxy timeout');
            }
        });

        proxyReq.on('error', (err) => {
            console.error(`[Proxy Error] ${err.message}`);
            if (!res.headersSent) {
                res.statusCode = 502;
                res.end(`Proxy error: ${err.message}`);
            }
        });

        req.pipe(proxyReq);
    } catch (err) {
        res.statusCode = 400;
        res.end(`Invalid target: ${err.message}`);
    }
}

function handleStatic(req, res) {
    let reqPath = req.url.split('?')[0];
    let filePath = path.join(DIST_DIR, reqPath === '/' ? 'index.html' : reqPath);

    // Fallback pour le SPA Router
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.woff2': 'font/woff2',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Server error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
}

server.listen(PORT, () => {
    console.log(`\x1b[32m[SpaceHub]\x1b[0m Serveur de production démarré sur http://localhost:${PORT}`);
    console.log(`\x1b[36m[Static]\x1b[0m Servit depuis ${DIST_DIR}`);
    console.log(`\x1b[35m[Proxy]\x1b[0m Point d'entrée actif sur /__sh-proxy`);
});
