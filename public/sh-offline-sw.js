/**
 * SpaceHub — Service worker de la coque applicative
 * =================================================
 *
 * Ce qu'il fait, et surtout ce qu'il ne fait PAS.
 *
 * IL MET EN CACHE : le HTML, le JavaScript et le CSS de l'application, plus
 * `tokens.css`. C'est-à-dire strictement ce qu'il faut pour que SpaceHub
 * s'ouvre sans réseau et affiche les téléchargements déjà présents.
 *
 * IL NE TOUCHE PAS AUX MÉDIAS. Aucune requête `/Videos/`, `/Audio/` ou
 * `/Items/…/Images` ne passe par lui. C'est délibéré : faire transiter une
 * vidéo de plusieurs gigaoctets avec ses requêtes Range à travers un service
 * worker met en jeu la lecture elle-même — saccades, ruptures de seek — pour
 * un gain nul, puisque les médias hors ligne sont déjà lus depuis IndexedDB
 * par un object URL.
 *
 * IL NE TOUCHE PAS AUX API. Aucune requête vers Jellyfin ou les services
 * Servarr n'est mise en cache. Servir une réponse d'API périmée depuis un
 * cache produirait exactement le genre de bug indébogable qu'on ne veut pas :
 * une bibliothèque figée d'il y a trois jours, sans que rien ne le dise.
 *
 * Stratégie : réseau d'abord, cache en repli. L'application reste donc toujours
 * à jour quand le réseau est là, et s'ouvre quand même quand il ne l'est pas.
 */

const CACHE = 'spacehub-coque-v1';

/** Chemins toujours mis en cache à l'installation. */
const SOCLE = ['/', '/index.html', '/design-system/tokens.css'];

/**
 * Liste les fichiers construits en lisant `index.html`.
 *
 * Sans cela, le service worker ne met en cache que ce qui passe par lui APRÈS
 * son activation — or les bundles sont demandés au tout début du chargement,
 * bien avant. Au rechargement hors ligne, le HTML sortait donc du cache mais
 * pas le JavaScript : une page noire, ce qui est pire que rien.
 *
 * Lire `index.html` plutôt que coder la liste en dur garantit qu'elle
 * correspond toujours à la version réellement déployée, quels que soient les
 * hachages produits par le build.
 */
async function fichiersDeLaCoque() {
    try {
        const reponse = await fetch('/index.html', { cache: 'reload' });
        const html = await reponse.text();
        const urls = new Set(SOCLE);
        for (const m of html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)) {
            urls.add(m[1]);
        }
        return [...urls];
    } catch {
        return SOCLE;
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        try {
            const cache = await caches.open(CACHE);
            const fichiers = await fichiersDeLaCoque();
            // Un `addAll` échoue en bloc si UNE ressource manque ; on met donc
            // en cache une par une, pour que l'absence d'un fichier optionnel
            // ne fasse pas échouer toute l'installation.
            await Promise.all(fichiers.map(u =>
                cache.add(new Request(u, { cache: 'reload' })).catch(() => {})
            ));
        } catch {
            // Une installation qui échoue laisserait l'application sans coque
            // hors ligne, mais ne doit jamais empêcher son fonctionnement normal.
        }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(cles => Promise.all(cles.filter(c => c !== CACHE).map(c => caches.delete(c))))
            .then(() => self.clients.claim())
    );
});

/** Cette requête relève-t-elle de la coque applicative ? */
function estCoque(url, requete) {
    if (url.origin !== self.location.origin) return false;          // API et médias distants
    if (requete.method !== 'GET') return false;
    if (url.pathname.startsWith('/api-proxy')) return false;        // proxy vers les services
    if (/^\/(Videos|Audio|Items|Users|Sessions)\//.test(url.pathname)) return false;  // Jellyfin servi depuis la même origine
    return requete.destination === 'document'
        || /\.(?:js|css|html|woff2?)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (!estCoque(url, event.request)) return;   // laissé au réseau, sans interception

    event.respondWith(
        fetch(event.request)
            .then(reponse => {
                // Seules les réponses complètes et valides sont gardées : mettre
                // en cache une 404 ou une réponse partielle rendrait l'application
                // durablement cassée hors ligne.
                if (reponse.ok && reponse.status === 200 && reponse.type === 'basic') {
                    const copie = reponse.clone();
                    caches.open(CACHE).then(c => c.put(event.request, copie)).catch(() => {});
                }
                return reponse;
            })
            .catch(async () => {
                const cache = await caches.match(event.request);
                if (cache) return cache;
                // Navigation hors ligne vers une route inconnue : la coque sait
                // se router elle-même une fois chargée.
                if (event.request.destination === 'document') {
                    const index = await caches.match('/index.html');
                    if (index) return index;
                }
                return new Response('Hors ligne', { status: 503, statusText: 'Hors ligne' });
            })
    );
});

/** Permet à l'application de vider le cache de coque (bouton de réglages). */
self.addEventListener('message', (event) => {
    if (event.data === 'sh-vider-coque') {
        caches.delete(CACHE).then(() => event.source?.postMessage?.('sh-coque-videe'));
    }
});
