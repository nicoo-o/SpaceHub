/**
 * @vitest-environment jsdom
 *
 * Quick Connect, sélecteur de versions, persistance du stockage.
 *
 * TROIS FONCTIONS QUI SE TROMPENT EN SILENCE.
 *
 * Quick Connect passe par quatre requêtes dont trois ne renvoient rien
 * d'exploitable si l'on se trompe : `/QuickConnect/Enabled` répond
 * littéralement `true`, pas un objet ; le relevé d'autorisation répond `200`
 * avec `Authenticated: false` tant que personne n'a validé — un test qui
 * regarde seulement `res.ok` conclurait à tort que c'est autorisé.
 *
 * Le sélecteur de versions repose sur une confusion classique : le
 * `MediaSourceId` n'est PAS l'identifiant de l'item dès qu'un titre a
 * plusieurs versions. Prendre l'un pour l'autre lance la mauvaise version sans
 * la moindre erreur.
 *
 * La persistance du stockage se demande une fois. Une demande par
 * téléchargement rouvrirait une invite système à chaque fichier sur Firefox.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { negotiatePlayback } from '../jellyfin/player/DeviceProfile.js';
import DownloadManager from '../jellyfin/offline/DownloadManager.js';
import AuthManager from '../jellyfin/auth/AuthManager.js';

beforeEach(() => {
    vi.restoreAllMocks();
    // Sans ce nettoyage, le jeton d'un test précédent survit dans
    // `sessionStorage` et le suivant croit avoir ouvert une session.
    sessionStorage.clear();
    localStorage.clear();
});
afterEach(() => { vi.restoreAllMocks(); });

/** Deux versions du même film : un remux 4K lourd et un encodage léger. */
const DEUX_VERSIONS = {
    PlaySessionId: 'sess-1',
    MediaSources: [
        { Id: 'src-4k', Name: 'Remux 2160p', Size: 64_000_000_000, Bitrate: 80_000_000,
          Container: 'mkv', SupportsDirectPlay: true },
        { Id: 'src-1080', Name: '1080p x265', Size: 4_000_000_000, Bitrate: 5_000_000,
          Container: 'mp4', SupportsDirectPlay: true },
    ],
};

function poserFetch(charge) {
    globalThis.fetch = vi.fn(async () => ({
        ok: true, status: 200, json: async () => charge,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
describe('Sélecteur de versions', () => {
    const base = { serverUrl: 'http://nas:8096', token: 'j', userId: 'u', deviceId: 'd', itemId: 'film-1' };

    it('expose toutes les versions avec leur poids et leur débit', async () => {
        poserFetch(DEUX_VERSIONS);
        const res = await negotiatePlayback(base);

        expect(res.versions).toHaveLength(2);
        expect(res.versions[0]).toMatchObject({
            id: 'src-4k', nom: 'Remux 2160p', taille: 64_000_000_000, debit: 80_000_000,
        });
        // Sans le débit, l'utilisateur ne peut pas choisir : c'est LUI qui dit
        // si sa liaison tient 80 Mb/s, l'application ne peut pas le deviner.
        expect(res.versions[1].debit).toBe(5_000_000);
    });

    it('lit la version demandée, pas la première', async () => {
        poserFetch(DEUX_VERSIONS);
        const res = await negotiatePlayback({ ...base, mediaSourceId: 'src-1080' });

        // CONTRE-ÉPREUVE DU PIÈGE : sans la recherche par identifiant, on
        // obtiendrait `src-4k` — la première du tableau — et la personne qui a
        // choisi la version légère recevrait le remux de 64 Go.
        expect(res.mediaSourceId).toBe('src-1080');
        expect(res.url).toContain('MediaSourceId=src-1080');
        // L'identifiant de l'item et celui de la source sont distincts.
        expect(res.mediaSourceId).not.toBe(base.itemId);
    });

    it('retombe sur la première version si celle demandée n\'existe plus', async () => {
        poserFetch(DEUX_VERSIONS);
        // Cas réel : l'utilisateur a choisi une version, l'administrateur l'a
        // supprimée entre-temps. Mieux vaut lire autre chose que rien.
        const res = await negotiatePlayback({ ...base, mediaSourceId: 'src-disparue' });
        expect(res.mediaSourceId).toBe('src-4k');
    });

    it('expose aussi les versions sur le chemin transcodé', async () => {
        poserFetch({
            PlaySessionId: 'sess-2',
            MediaSources: [
                { Id: 'src-a', Name: 'A', TranscodingUrl: '/videos/x/master.m3u8',
                  TranscodingSubProtocol: 'hls', TranscodeReasons: ['VideoCodecNotSupported'] },
                { Id: 'src-b', Name: 'B' },
            ],
        });
        const res = await negotiatePlayback(base);
        // Les deux chemins de retour doivent produire la même forme, sinon le
        // sélecteur disparaît dès que le serveur transcode.
        expect(res.versions).toHaveLength(2);
        expect(res.transcodeReasons).toEqual(['VideoCodecNotSupported']);
    });

    it('nomme une version sans nom par son fichier', async () => {
        poserFetch({ MediaSources: [{ Id: 's', Path: 'D:\\Films\\Dune (2021) 2160p.mkv' }] });
        const res = await negotiatePlayback(base);
        // « Version » tout court n'aide personne à choisir.
        expect(res.versions[0].nom).toBe('Dune (2021) 2160p.mkv');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Persistance du stockage hors ligne', () => {
    function fabriquer({ persistanceAccordee = true } = {}) {
        const demanderPersistance = vi.fn(async () => persistanceAccordee);
        const store = {
            demanderPersistance,
            existe: vi.fn(async () => false),
        };
        const dm = new DownloadManager({ store });
        // On neutralise le transfert : c'est la demande de persistance qu'on teste.
        dm._traiterFile = vi.fn(async () => {});
        return { dm, demanderPersistance };
    }

    it('demande la persistance au premier téléchargement', async () => {
        const { dm, demanderPersistance } = fabriquer();
        dm.telecharger({ Id: 'a', Name: 'A' });
        await Promise.resolve(); await Promise.resolve();
        expect(demanderPersistance).toHaveBeenCalledOnce();
    });

    it('ne la redemande jamais ensuite', async () => {
        const { dm, demanderPersistance } = fabriquer();
        dm.telecharger({ Id: 'a', Name: 'A' });
        await Promise.resolve(); await Promise.resolve();
        dm.telecharger({ Id: 'b', Name: 'B' });
        dm.telecharger({ Id: 'c', Name: 'C' });
        await Promise.resolve(); await Promise.resolve();

        // CONTRE-ÉPREUVE : sans la mémorisation du résultat, Firefox rouvrirait
        // son invite système à chaque fichier mis en file.
        expect(demanderPersistance).toHaveBeenCalledOnce();
    });

    it('n\'empêche pas le téléchargement quand elle est refusée', async () => {
        const { dm } = fabriquer({ persistanceAccordee: false });
        dm.telecharger({ Id: 'a', Name: 'A' });
        await Promise.resolve(); await Promise.resolve();
        // Un refus qualifie le stockage, il ne l'interdit pas.
        expect(dm._traiterFile).toHaveBeenCalled();
        expect(dm._persistant).toBe(false);
    });

    it('survit à un navigateur sans l\'API de persistance', async () => {
        const store = { existe: vi.fn(async () => false) };  // pas de demanderPersistance
        const dm = new DownloadManager({ store });
        dm._traiterFile = vi.fn(async () => {});
        expect(() => dm.telecharger({ Id: 'a', Name: 'A' })).not.toThrow();
        await Promise.resolve(); await Promise.resolve();
        expect(dm._persistant).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Quick Connect', () => {
    /**
     * Fabrique un `fetch` qui répond par route.
     * @param {Record<string, {ok?: boolean, status?: number, json?: any}>} routes
     */
    function poserRoutes(routes) {
        const appels = [];
        globalThis.fetch = vi.fn(async (url, options) => {
            appels.push({ url: String(url), options });
            const cle = Object.keys(routes).find(k => String(url).includes(k));
            const r = cle ? routes[cle] : { ok: false, status: 404 };
            return {
                ok: r.ok !== false,
                status: r.status ?? 200,
                json: async () => r.json,
            };
        });
        return appels;
    }

    it('lit la réponse booléenne nue de /QuickConnect/Enabled', async () => {
        poserRoutes({ '/QuickConnect/Enabled': { json: true } });
        const auth = new AuthManager();
        // Le serveur répond littéralement `true`, pas `{ Enabled: true }` : une
        // lecture de propriété donnerait `undefined`, donc « indisponible »,
        // et le bouton ne s'afficherait jamais.
        expect(await auth.quickConnectDisponible('http://nas:8096')).toBe(true);
    });

    it('conclut à l\'indisponibilité quand le serveur répond `false`', async () => {
        poserRoutes({ '/QuickConnect/Enabled': { json: false } });
        const auth = new AuthManager();
        expect(await auth.quickConnectDisponible('http://nas:8096')).toBe(false);
    });

    it('conclut à l\'indisponibilité quand le serveur est injoignable', async () => {
        globalThis.fetch = vi.fn(async () => { throw new Error('réseau'); });
        const auth = new AuthManager();
        // Un serveur muet n'est pas un serveur qui accepte Quick Connect.
        expect(await auth.quickConnectDisponible('http://nas:8096')).toBe(false);
    });

    it('démarre une demande et rend le code affichable', async () => {
        const appels = poserRoutes({
            '/QuickConnect/Initiate': { json: { Code: '123456', Secret: 'sec-abc' } },
        });
        const auth = new AuthManager();
        const res = await auth.quickConnectDemarrer('http://nas:8096');

        expect(res).toMatchObject({ ok: true, code: '123456', secret: 'sec-abc' });
        // L'en-tête d'autorisation est requis même sans jeton : le serveur y lit
        // le DeviceId, qui identifie la demande. Sans lui, le code affiché ne
        // correspond à aucune session et l'autorisation n'arrive jamais.
        const initiate = appels.find(a => a.url.includes('Initiate'));
        expect(initiate.options.method).toBe('POST');
        expect(initiate.options.headers.Authorization ?? initiate.options.headers['X-Emby-Authorization'])
            .toBeTruthy();
    });

    it('refuse une réponse incomplète plutôt que d\'afficher « undefined »', async () => {
        poserRoutes({ '/QuickConnect/Initiate': { json: { Code: '123456' } } });   // Secret manquant
        const auth = new AuthManager();
        const res = await auth.quickConnectDemarrer('http://nas:8096');
        expect(res.ok).toBe(false);
        expect(res.erreur).toBeTruthy();
    });

    it('explique un 401 par la désactivation, pas par un échec générique', async () => {
        poserRoutes({ '/QuickConnect/Initiate': { ok: false, status: 401 } });
        const auth = new AuthManager();
        const res = await auth.quickConnectDemarrer('http://nas:8096');
        expect(res.ok).toBe(false);
        expect(res.erreur).toMatch(/désactivé/i);
    });

    it('ne conclut PAS à l\'autorisation sur un simple 200', async () => {
        poserRoutes({
            '/QuickConnect/Initiate': { json: { Code: '1', Secret: 'sec' } },
            '/QuickConnect/Connect': { json: { Authenticated: false } },
        });
        const auth = new AuthManager();
        await auth.quickConnectDemarrer('http://nas:8096');

        // LE PIÈGE : le serveur répond 200 tant que la demande existe. Un test
        // sur `res.ok` conclurait « autorisé » dès le premier relevé, et
        // l'application tenterait d'échanger un secret non validé.
        expect(await auth.quickConnectAutorise('sec')).toBe(false);
    });

    it('reconnaît l\'autorisation quand elle arrive', async () => {
        poserRoutes({
            '/QuickConnect/Initiate': { json: { Code: '1', Secret: 'sec' } },
            '/QuickConnect/Connect': { json: { Authenticated: true } },
        });
        const auth = new AuthManager();
        await auth.quickConnectDemarrer('http://nas:8096');
        expect(await auth.quickConnectAutorise('sec')).toBe(true);
    });

    it('traite un relevé manqué comme « pas encore », pas comme un échec', async () => {
        poserRoutes({ '/QuickConnect/Initiate': { json: { Code: '1', Secret: 'sec' } } });
        const auth = new AuthManager();
        await auth.quickConnectDemarrer('http://nas:8096');

        globalThis.fetch = vi.fn(async () => { throw new Error('coupure Wi-Fi'); });
        // Une coupure d'une seconde ne doit pas annuler une demande que
        // l'utilisateur est en train de valider sur son téléphone.
        await expect(auth.quickConnectAutorise('sec')).resolves.toBe(false);
    });

    it('refuse de terminer sans demande en cours', async () => {
        poserRoutes({});
        const auth = new AuthManager();
        // Sans `_quickConnectUrl`, on ne sait pas à quel serveur parler : mieux
        // vaut le dire que d'émettre une requête vers une URL vide.
        const res = await auth.quickConnectTerminer('sec');
        expect(res.success).toBe(false);
    });

    it('ouvre la session quand le secret est échangé', async () => {
        poserRoutes({
            '/QuickConnect/Initiate': { json: { Code: '1', Secret: 'sec' } },
            '/Users/AuthenticateWithQuickConnect': {
                json: { AccessToken: 'jeton-xyz', User: { Id: 'u1', Name: 'Nicolas' } },
            },
        });
        const auth = new AuthManager();
        await auth.quickConnectDemarrer('http://nas:8096');
        const res = await auth.quickConnectTerminer('sec');

        expect(res.success).toBe(true);
        expect(res.user.Name).toBe('Nicolas');
        expect(auth.getToken()).toBe('jeton-xyz');
    });

    it('rejette une réponse d\'authentification sans jeton', async () => {
        poserRoutes({
            '/QuickConnect/Initiate': { json: { Code: '1', Secret: 'sec' } },
            '/Users/AuthenticateWithQuickConnect': { json: { User: { Id: 'u1' } } },
        });
        const auth = new AuthManager();
        await auth.quickConnectDemarrer('http://nas:8096');
        const res = await auth.quickConnectTerminer('sec');
        // Une session ouverte sans jeton échouerait à la première requête, mais
        // seulement plus tard, sur un écran qui ne dirait pas pourquoi.
        expect(res.success).toBe(false);
        // Rien n'a été enregistré : ni jeton vide, ni session à moitié ouverte.
        expect(auth.getToken()).toBeFalsy();
        expect(auth.isAuthenticated?.()).toBeFalsy();
    });
});
