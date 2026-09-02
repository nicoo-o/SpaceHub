/**
 * @vitest-environment jsdom
 *
 * ApiClient — la politique de nouvelles tentatives.
 *
 * Ce module décide, sans que personne ne le voie, s'il faut retenter un appel.
 * Se tromper coûte cher dans les deux sens : retenter un 401 triple la charge
 * serveur pour rien et peut verrouiller un compte ; ne pas retenter un 503
 * transforme un redémarrage de serveur de trois secondes en écran d'erreur.
 *
 * Ces tests figent cette politique. Ils remplacent `fetch` par un compteur :
 * ce qui est vérifié n'est pas « ça marche », c'est **combien de fois** le
 * réseau a été sollicité, et avec quels en-têtes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseApiClient, JellyfinClient, ApiError } from '../core/ApiClient.js';

/** Fabrique une réponse fetch minimale mais fidèle. */
function reponse({ status = 200, body = '{}', type = 'application/json', retryAfter = null } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: `Statut ${status}`,
        headers: {
            get: (n) => {
                const nom = n.toLowerCase();
                if (nom === 'content-type') return type;
                if (nom === 'retry-after') return retryAfter;
                return null;
            },
        },
        json: async () => JSON.parse(body),
        text: async () => body,
    };
}

let appels;

beforeEach(() => {
    appels = [];
    globalThis.fetch = vi.fn(async (url, config) => {
        appels.push({ url, config });
        return reponse();
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Validation des paramètres', () => {
    it('refuse un endpoint qui n\'est pas relatif', async () => {
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        // Un endpoint absolu contournerait baseUrl : c'est un bogue d'appelant,
        // pas une requête à tenter.
        await expect(c.get('http://ailleurs/api')).rejects.toThrow(TypeError);
        expect(appels).toHaveLength(0);
    });

    it('refuse une baseUrl vide', async () => {
        const c = new BaseApiClient('', 'cle');
        await expect(c.get('/api/v3/series')).rejects.toThrow(TypeError);
        expect(appels).toHaveLength(0);
    });

    it('retire le slash final de la baseUrl', async () => {
        const c = new BaseApiClient('http://sonarr:8989/', 'cle');
        await c.get('/api/v3/series');
        // Sans cela l'URL contiendrait un double slash, que certains serveurs
        // (dont Sonarr) rejettent en 404.
        expect(appels[0].url).toBe('http://sonarr:8989/api/v3/series');
    });
});

describe('En-têtes', () => {
    it('envoie la clé API en X-Api-Key pour un client générique', async () => {
        const c = new BaseApiClient('http://radarr:7878', 'ma-cle');
        await c.get('/api/v3/movie');
        expect(appels[0].config.headers['X-Api-Key']).toBe('ma-cle');
    });

    it('n\'envoie PAS X-Api-Key pour Jellyfin', async () => {
        // Jellyfin s'authentifie par son propre en-tête. Envoyer X-Api-Key en
        // plus a déjà provoqué des 400 sur certaines versions du serveur.
        const c = new JellyfinClient();
        c.setBaseUrl('http://jellyfin:8096');
        c.setApiKey('jeton');
        await c.get('/Users/Me');
        expect(appels[0].config.headers['X-Api-Key']).toBeUndefined();
    });

    it('retire Content-Type sur un GET sans corps', async () => {
        // Un GET avec Content-Type déclenche une requête préliminaire CORS
        // inutile — un aller-retour réseau gratuit sur chaque appel.
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await c.get('/api/v3/series');
        expect(appels[0].config.headers['Content-Type']).toBeUndefined();
    });

    it('conserve Content-Type et sérialise le corps sur un POST', async () => {
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await c.post('/api/v3/command', { name: 'RefreshSeries' });
        expect(appels[0].config.headers['Content-Type']).toBe('application/json');
        expect(appels[0].config.body).toBe('{"name":"RefreshSeries"}');
    });

    it('n\'envoie pas de corps sur un GET même si on lui en passe un', async () => {
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await c.request('GET', '/api/v3/series', { ignore: true });
        expect(appels[0].config.body).toBeUndefined();
    });
});

describe('Interprétation de la réponse', () => {
    it('rend null sur 204 sans tenter de lire un corps', async () => {
        globalThis.fetch = vi.fn(async () => reponse({ status: 204, body: '' }));
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await expect(c.delete('/api/v3/series/1')).resolves.toBeNull();
    });

    it('analyse le JSON quand le type l\'annonce', async () => {
        globalThis.fetch = vi.fn(async () => reponse({ body: '{"a":1}' }));
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await expect(c.get('/x')).resolves.toEqual({ a: 1 });
    });

    it('rend du texte brut quand ce n\'est pas du JSON', async () => {
        // Certains points d'accès Jellyfin renvoient du texte nu ; l'analyser
        // en JSON lèverait une erreur incompréhensible côté appelant.
        globalThis.fetch = vi.fn(async () => reponse({ body: 'coucou', type: 'text/plain' }));
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await expect(c.get('/x')).resolves.toBe('coucou');
    });
});

describe('Politique de nouvelle tentative — le cœur du module', () => {
    it('ne retente JAMAIS un 401', async () => {
        globalThis.fetch = vi.fn(async () => reponse({ status: 401, body: 'refusé' }));
        const c = new BaseApiClient('http://sonarr:8989', 'mauvaise-cle');
        await expect(c.get('/x')).rejects.toBeInstanceOf(ApiError);
        // Retenter une clé invalide ne la rendra pas valide, et certains
        // services verrouillent après plusieurs échecs.
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('ne retente ni 400, ni 403, ni 404, ni 422', async () => {
        for (const status of [400, 403, 404, 422]) {
            globalThis.fetch = vi.fn(async () => reponse({ status, body: '' }));
            const c = new BaseApiClient('http://sonarr:8989', 'cle');
            await expect(c.get('/x')).rejects.toBeInstanceOf(ApiError);
            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        }
    });

    it('retente un 429 — c\'est le seul 4xx qui vaut la peine', async () => {
        let n = 0;
        globalThis.fetch = vi.fn(async () => {
            n++;
            return n === 1
                ? reponse({ status: 429, body: '', retryAfter: '0.01' })
                : reponse({ body: '{"ok":1}' });
        });
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await expect(c.get('/x', { retries: 1 })).resolves.toEqual({ ok: 1 });
        expect(n).toBe(2);
    });

    it('retente un 503 puis réussit', async () => {
        let n = 0;
        globalThis.fetch = vi.fn(async () => {
            n++;
            return n === 1 ? reponse({ status: 503, body: '' }) : reponse({ body: '{"ok":1}' });
        });
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await expect(c.get('/x', { retries: 1 })).resolves.toEqual({ ok: 1 });
        expect(n).toBe(2);
    });

    it('abandonne après le nombre de tentatives demandé', async () => {
        globalThis.fetch = vi.fn(async () => reponse({ status: 500, body: '' }));
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await expect(c.get('/x', { retries: 1 })).rejects.toBeInstanceOf(ApiError);
        // retries: 1 signifie « une tentative, puis une seule reprise ».
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('n\'effectue qu\'un appel avec retries: 0', async () => {
        globalThis.fetch = vi.fn(async () => reponse({ status: 500, body: '' }));
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await expect(c.get('/x', { retries: 0 })).rejects.toBeInstanceOf(ApiError);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
});

describe('Annulation par l\'appelant', () => {
    it('n\'appelle pas le réseau si le signal est déjà annulé', async () => {
        const ac = new AbortController();
        ac.abort();
        globalThis.fetch = vi.fn(async (_u, config) => {
            // fetch réel refuse immédiatement quand le signal est déjà annulé.
            if (config.signal?.aborted) {
                const e = new Error('Annulé');
                e.name = 'AbortError';
                throw e;
            }
            return reponse();
        });
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await expect(c.get('/x', { signal: ac.signal, retries: 0 })).rejects.toThrow();
    });
});

describe('ApiError', () => {
    it('porte le statut, le corps et l\'URL pour le diagnostic', async () => {
        globalThis.fetch = vi.fn(async () => reponse({ status: 404, body: 'introuvable' }));
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        try {
            await c.get('/api/v3/series/999');
            throw new Error('aurait dû échouer');
        } catch (err) {
            expect(err).toBeInstanceOf(ApiError);
            expect(err.status).toBe(404);
            expect(err.body).toBe('introuvable');
            expect(err.url).toContain('/api/v3/series/999');
        }
    });
});

describe('Retry-After — le délai demandé par le serveur', () => {
    it('honore un Retry-After exprimé en secondes', async () => {
        let n = 0;
        const debut = Date.now();
        globalThis.fetch = vi.fn(async () => {
            n++;
            return n === 1
                ? reponse({ status: 429, body: '', retryAfter: '0.05' })
                : reponse({ body: '{"ok":1}' });
        });
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        await expect(c.get('/x', { retries: 1 })).resolves.toEqual({ ok: 1 });
        // Le backoff par défaut d'un 429 serait de 1000 ms ; Retry-After le
        // remplace, donc l'attente doit être nettement plus courte.
        expect(Date.now() - debut).toBeLessThan(500);
    });

    it('ignore un Retry-After illisible et retombe sur le backoff', async () => {
        globalThis.fetch = vi.fn(async () => reponse({ status: 429, body: '', retryAfter: 'demain' }));
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        // retries: 0 pour ne pas attendre le backoff dans le test : ce qui est
        // vérifié ici est l'absence de plantage sur un en-tête invalide.
        await expect(c.get('/x', { retries: 0 })).rejects.toBeInstanceOf(ApiError);
    });

    it('borne l\'attente à 30 secondes', async () => {
        globalThis.fetch = vi.fn(async () => reponse({ status: 429, body: '', retryAfter: '3600' }));
        const c = new BaseApiClient('http://sonarr:8989', 'cle');
        try {
            await c.get('/x', { retries: 0 });
        } catch (err) {
            // Une heure demandée, trente secondes retenues : au-delà, mieux
            // vaut rendre la main que de paraître figé.
            expect(err.retryApresMs).toBe(30000);
        }
    });
});
