/**
 * Vague 1 — clés épinglées, version d'API, cache de notes.
 *
 * TROIS DÉFAUTS QUI NE SE VOYAIENT PAS, ET POUR TROIS RAISONS DIFFÉRENTES.
 *
 * La signature du catalogue se vérifiait avec la clé fournie par le catalogue
 * lui-même. Le mécanisme fonctionnait — il retournait `true` — et ne prouvait
 * rien : qui contrôle le catalogue fournit le code, la signature ET la clé.
 * Aucun test ne pouvait échouer, puisque tout marchait comme codé.
 *
 * `apiVersion` était déclarée dans chaque manifeste et confrontée à rien. Un
 * greffon écrit pour une autre majeure se chargeait sans un mot, puis échouait
 * plus tard, ailleurs, sur une méthode disparue.
 *
 * Le cache de notes vivait en mémoire, donc mourait au rechargement — alors que
 * le quota OMDb, lui, ne se recharge qu'une fois par jour. Le symptôme n'était
 * pas une erreur mais une disparition : les notes cessaient d'apparaître.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resoudreCle, approuverCle, revoquerCle, Confiance, CLES_EPINGLEES } from '../core/ClesDeConfiance.js';
import { PluginManager, API_VERSION } from '../core/PluginManager.js';
import RatingCacheService from '../core/RatingCacheService.js';

function reglagesFactices(initial = {}) {
    const store = { ...initial };
    return {
        store,
        get: (cle, defaut) => (cle in store ? store[cle] : defaut),
        set: (cle, valeur) => { store[cle] = valeur; },
    };
}

const CLE_JWK = { kty: 'EC', crv: 'P-256', x: 'aaa', y: 'bbb' };

// ─────────────────────────────────────────────────────────────────────────────
describe('ClesDeConfiance — la clé ne vient jamais du catalogue', () => {
    it('refuse un identifiant inconnu', () => {
        const res = resoudreCle('depot-inconnu', reglagesFactices());
        // CONTRE-ÉPREUVE DU DÉFAUT D'ORIGINE : le code lisait `entry.publicKey`
        // et vérifiait toujours avec succès. Ici l'absence de clé est un refus,
        // et le refus porte sa raison.
        expect(res.cle).toBeNull();
        expect(res.confiance).toBe(Confiance.ABSENTE);
        expect(res.raison).toMatch(/ne prouve rien/i);
    });

    it('refuse un identifiant vide', () => {
        expect(resoudreCle('', reglagesFactices()).cle).toBeNull();
        expect(resoudreCle(null, reglagesFactices()).cle).toBeNull();
        expect(resoudreCle(undefined, reglagesFactices()).cle).toBeNull();
    });

    it('accepte une clé que l\'utilisateur a ajoutée lui-même', () => {
        const reglages = reglagesFactices();
        expect(approuverCle('mon-depot', CLE_JWK, reglages)).toBe(true);

        const res = resoudreCle('mon-depot', reglages);
        expect(res.cle).toEqual(CLE_JWK);
        // La confiance est DÉCLARÉE, pas épinglée : la distinction doit
        // remonter jusqu'à l'interface, qui n'a pas à mentir sur son origine.
        expect(res.confiance).toBe(Confiance.DECLAREE);
    });

    it('ne se laisse pas empoisonner par la chaîne de prototypes', () => {
        const reglages = reglagesFactices();
        approuverCle('legitime', CLE_JWK, reglages);
        // `declarees['constructor']` remonterait une fonction depuis le
        // prototype : sans `hasOwnProperty`, elle serait prise pour une clé
        // approuvée et passée telle quelle à `importKey`.
        for (const piege of ['constructor', '__proto__', 'toString', 'valueOf']) {
            expect(resoudreCle(piege, reglages).cle, piege).toBeNull();
        }
    });

    it('interdit de remplacer une clé épinglée depuis les réglages', () => {
        // Ce test protège l'invariant même s'il n'y a aujourd'hui aucune clé
        // épinglée : le jour où il y en aura une, il devra rester vrai.
        const reglages = reglagesFactices();
        for (const id of Object.keys(CLES_EPINGLEES)) {
            expect(approuverCle(id, { kty: 'EC', x: 'pirate' }, reglages)).toBe(false);
            expect(resoudreCle(id, reglages).confiance).toBe(Confiance.EPINGLEE);
        }
    });

    it('révoque une clé approuvée', () => {
        const reglages = reglagesFactices();
        approuverCle('temporaire', CLE_JWK, reglages);
        expect(revoquerCle('temporaire', reglages)).toBe(true);
        expect(resoudreCle('temporaire', reglages).cle).toBeNull();
        expect(revoquerCle('jamais-ajoutee', reglages)).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PluginManager — la version d\'API', () => {
    let pm;
    beforeEach(() => { pm = new PluginManager({ settings: reglagesFactices() }); });

    it('accepte un greffon de la majeure courante', async () => {
        expect(await pm.registerPlugin({ id: 'ok', apiVersion: API_VERSION })).toBe(true);
    });

    it('accepte un manifeste sans apiVersion', async () => {
        // Le défaut vaut la version courante : ne pas déclarer n'est pas une
        // faute, c'est le cas de tous les greffons écrits avant ce contrôle.
        expect(await pm.registerPlugin({ id: 'sans-version' })).toBe(true);
    });

    it('REFUSE un greffon écrit pour une autre majeure', async () => {
        // CONTRE-ÉPREUVE : sans ce contrôle, ces deux greffons se chargeaient
        // et échouaient plus tard, sur une méthode disparue, à un endroit sans
        // rapport avec la cause.
        expect(await pm.registerPlugin({ id: 'trop-vieux', apiVersion: '1.4.0' })).toBe(false);
        expect(await pm.registerPlugin({ id: 'trop-neuf', apiVersion: '3.0.0' })).toBe(false);
    });

    it('accepte une mineure supérieure, en le disant', async () => {
        // Refuser rendrait toute évolution du SDK bloquante : un greffon écrit
        // pour 2.1 doit tourner sur 2.0, quitte à ce qu'une fonction manque.
        const majeure = API_VERSION.split('.')[0];
        expect(await pm.registerPlugin({ id: 'mineure', apiVersion: `${majeure}.9.0` })).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('RatingCacheService — le quota', () => {
    /** Faux CacheManager : IndexedDB en mémoire, même signature. */
    function cacheFactice() {
        const magasin = new Map();
        return {
            magasin,
            get: vi.fn(async (store, cle) => magasin.get(`${store}/${cle}`) ?? null),
            set: vi.fn(async (store, cle, valeur) => { magasin.set(`${store}/${cle}`, valeur); }),
            delete: vi.fn(async (store, cle) => { magasin.delete(`${store}/${cle}`); }),
        };
    }

    function fabriquer({ cache = cacheFactice(), reponse = { imdb: 8.1 } } = {}) {
        const service = new RatingCacheService({ settings: reglagesFactices(), cache: () => cache });
        const fournisseur = vi.fn(async () => reponse);
        service.setProvider(fournisseur);
        return { service, cache, fournisseur };
    }

    it('écrit sur le disque ce qu\'il a résolu', async () => {
        const { service, cache } = fabriquer();
        await service._resolve('tt0111161');
        // Sans cette écriture, tout était perdu au rechargement de la page —
        // alors que le quota OMDb, lui, ne se recharge qu'à minuit.
        expect(cache.set).toHaveBeenCalledWith('general', 'notes:tt0111161', expect.any(Object), expect.any(Number));
    });

    it('relit le disque plutôt que d\'interroger le réseau', async () => {
        const cache = cacheFactice();
        cache.magasin.set('general/notes:tt0111161',
            { data: { imdb: 9.3 }, expiresAt: Date.now() + 3600_000 });

        const { service, fournisseur } = fabriquer({ cache });
        expect(await service._resolve('tt0111161')).toEqual({ imdb: 9.3 });
        // CONTRE-ÉPREUVE : c'est ici que le quota est économisé. Un appel au
        // fournisseur signifierait que le niveau disque ne sert à rien.
        expect(fournisseur).not.toHaveBeenCalled();
    });

    it('ignore une entrée périmée', async () => {
        const cache = cacheFactice();
        cache.magasin.set('general/notes:tt0111161',
            { data: { imdb: 9.3 }, expiresAt: Date.now() - 1000 });
        const { service, fournisseur } = fabriquer({ cache });
        await service._resolve('tt0111161');
        expect(fournisseur).toHaveBeenCalled();
    });

    it('MÉMORISE une absence au lieu de la redemander sans fin', async () => {
        const { service, cache, fournisseur } = fabriquer({ reponse: null });
        await service._resolve('tt-inconnu');
        expect(fournisseur).toHaveBeenCalledTimes(1);

        // Le titre reste absent : on ne redemande pas.
        await service._resolve('tt-inconnu');
        expect(fournisseur).toHaveBeenCalledTimes(1);

        // Et l'absence est écrite sur le disque, avec une durée de vie PLUS
        // LONGUE qu'une note — un film absent d'OMDb n'y entre pas demain.
        const entree = cache.magasin.get('general/notes:tt-inconnu');
        expect(entree).toBeDefined();
        expect(entree.data).toBeNull();
        expect(entree.expiresAt - Date.now()).toBeGreaterThan(24 * 3600 * 1000);
    });

    it('distingue « absence mémorisée » de « rien en cache »', async () => {
        const cache = cacheFactice();
        // Une absence mémorisée : un objet dont `data` vaut null.
        cache.magasin.set('general/notes:absent', { data: null, expiresAt: Date.now() + 3600_000 });
        const { service, fournisseur } = fabriquer({ cache });
        expect(await service._resolve('absent')).toBeNull();
        // Confondre les deux ferait réinterroger OMDb pour chaque titre qu'il
        // ne connaît pas — c'est-à-dire le gros du gaspillage.
        expect(fournisseur).not.toHaveBeenCalled();
    });

    it('survit à un navigateur sans stockage', async () => {
        const service = new RatingCacheService({ settings: reglagesFactices(), cache: () => null });
        service.setProvider(async () => ({ imdb: 7 }));
        // Navigation privée, IndexedDB refusé : on retombe sur le réseau, sans
        // erreur et sans bloquer.
        await expect(service._resolve('tt1')).resolves.toEqual({ imdb: 7 });
    });

    it('ne lance QU\'UN appel pour deux demandes simultanées', async () => {
        const { service, fournisseur } = fabriquer();

        // LE PIÈGE QUE CE TEST GARDE. La lecture disque est un `await`. Placée
        // entre le test d'existence et l'inscription de la promesse en cours,
        // elle rend la main au navigateur : deux appels simultanés franchissent
        // alors tous deux le test avant que l'un ait pu s'inscrire, et la page
        // envoie deux requêtes OMDb pour la même affiche.
        //
        // Ce défaut a réellement été introduit en ajoutant le niveau disque, et
        // c'est le test de fumée qui l'a attrapé. Il est épinglé ici.
        const [a, b] = await Promise.all([
            service._resolve('tt0111161'),
            service._resolve('tt0111161'),
        ]);
        expect(fournisseur).toHaveBeenCalledTimes(1);
        expect(a).toEqual(b);
    });

    it('dédoublonne aussi quand le disque répond', async () => {
        const cache = cacheFactice();
        cache.magasin.set('general/notes:tt1', { data: { imdb: 5 }, expiresAt: Date.now() + 3600_000 });
        const { service } = fabriquer({ cache });
        await Promise.all([service._resolve('tt1'), service._resolve('tt1'), service._resolve('tt1')]);
        // Trois demandes, une seule lecture disque : sinon on aurait remplacé
        // un gaspillage réseau par un gaspillage de transactions IndexedDB.
        expect(cache.get).toHaveBeenCalledTimes(1);
    });

    it('vide les DEUX niveaux lors d\'une invalidation', async () => {
        const { service, cache } = fabriquer();
        await service._resolve('tt0111161');
        service.invalidate('tt0111161');
        // Sans la suppression sur disque, « invalider » ne vidait que le
        // premier niveau et la lecture suivante retrouvait la même valeur.
        expect(cache.delete).toHaveBeenCalledWith('general', 'notes:tt0111161');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('RatingCacheService — la fuite de fournisseurs', () => {
    it('retire les trois fournisseurs, pas seulement le premier', () => {
        const service = new RatingCacheService({ settings: reglagesFactices(), cache: () => null });
        service.setProvider(async () => null);
        service.setSearchProvider(async () => null);
        service.setTextProvider(async () => null);
        expect(service.hasProvider()).toBe(true);
        expect(service.hasSearchProvider()).toBe(true);
        expect(service.hasTextProvider()).toBe(true);

        service.clearProviders();

        // CONTRE-ÉPREUVE : `clearProvider()` ne remettait à zéro que
        // `_provider`. Désactiver le greffon laissait la recherche par titre et
        // les textes critiques vivants — ils continuaient d'interroger Internet
        // avec la clé de l'utilisateur, pour un greffon qu'il croyait éteint.
        expect(service.hasProvider()).toBe(false);
        expect(service.hasSearchProvider()).toBe(false);
        expect(service.hasTextProvider()).toBe(false);
    });
});
