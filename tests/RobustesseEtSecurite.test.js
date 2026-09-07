/**
 * @vitest-environment jsdom
 *
 * Robustesse et sécurité — les défauts trouvés lors de l'audit d'ingénierie.
 *
 * Chaque test ci-dessous a été VÉRIFIÉ en réintroduisant le défaut qu'il
 * couvre : sans le correctif, il échoue. C'est la seule garantie qui compte —
 * un test qui contourne le chemin cassé ne prouve rien.
 *
 * Ce qui est couvert :
 *   • A1  — la déconnexion prévient le serveur (la session ne restait ouverte).
 *   • A6  — l'import de configuration ne déverrouille plus le mode enfant et
 *           ne pollue plus le prototype.
 *   • A11 — le schéma de l'URL du serveur est validé.
 *   • B2  — un 401/403 en cours de session émet `auth:expired`, une fois.
 *   • B6  — les appels réseau hors ApiClient ont un plafond de temps.
 *   • Défauts enregistrés — `registerDefaults()` servait à rien du tout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SettingsManager from '../core/SettingsManager.js';
import AuthManager from '../jellyfin/auth/AuthManager.js';
import { fetchAvecDelai } from '../core/utils/reseau.js';

// ─────────────────────────────────────────────────────────────────────────────
describe('SettingsManager — les valeurs par défaut enregistrées', () => {
    it('sont réellement lues (elles étaient inatteignables)', () => {
        const s = new SettingsManager();
        // Forme PLATE, celle qu'utilise core/SpaceHub.js au démarrage.
        s.registerDefaults({ 'parental.maxRank': 3, 'ui.theme': 'spacehub-dark' });

        // Avant correctif : `_getDeep` découpait sur le point et cherchait
        // `_defaults.parental.maxRank`, une branche qui n'existe pas → null.
        expect(s.get('parental.maxRank')).toBe(3);
        expect(s.get('ui.theme')).toBe('spacehub-dark');
    });

    it('acceptent aussi la forme imbriquée, sans casser les appelants', () => {
        const s = new SettingsManager();
        s.registerDefaults({ lecteur: { volume: 0.8 } });
        expect(s.get('lecteur.volume')).toBe(0.8);
    });

    it('restent derrière une valeur utilisateur', () => {
        const s = new SettingsManager();
        s.registerDefaults({ 'ui.theme': 'spacehub-dark' });
        s.set('ui.theme', 'spacehub-light');
        expect(s.get('ui.theme')).toBe('spacehub-light');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SettingsManager.import — audit A6', () => {
    let s;
    beforeEach(() => {
        localStorage.clear();
        s = new SettingsManager();
        s.registerDefaults({ 'ui.theme': 'spacehub-dark', 'offline.enabled': true });
    });

    it('refuse de désactiver le mode enfant', () => {
        s.set('parental.enabled', true);
        s.set('parental.pinHash', 'condensat-legitime');

        const bilan = s.import(JSON.stringify({
            parental: { enabled: false, pinHash: 'condensat-de-lattaquant' },
            ui: { theme: 'spacehub-light' },
        }));

        // Le verrou n'a pas bougé…
        expect(s.get('parental.enabled')).toBe(true);
        expect(s.get('parental.pinHash')).toBe('condensat-legitime');
        // …et le reste du fichier a bien été appliqué.
        expect(s.get('ui.theme')).toBe('spacehub-light');
        expect(bilan.refusees.some(r => r.startsWith('parental'))).toBe(true);
    });

    it('refuse `__proto__` sans polluer Object.prototype', () => {
        // JSON.parse crée une propriété PROPRE nommée __proto__, que
        // Object.keys énumère : c'est ce qui rendait l'attaque possible.
        s.import('{"__proto__": {"pollue": "oui"}}');
        expect({}.pollue).toBeUndefined();
        expect(Object.prototype.pollue).toBeUndefined();
    });

    it('refuse une valeur dont le type contredit le défaut enregistré', () => {
        const bilan = s.import(JSON.stringify({ offline: { enabled: 'oui' } }));
        expect(s.get('offline.enabled')).toBe(true);
        expect(bilan.refusees.some(r => r.includes('offline.enabled'))).toBe(true);
    });

    it('rend compte de son travail au lieu de prétendre avoir réussi', () => {
        expect(s.import('ceci n\'est pas du JSON').ok).toBe(false);
        expect(s.import('[]').ok).toBe(false);
        expect(s.import('{"parental":{"enabled":false}}').ok).toBe(false);
        expect(s.import('{"ui":{"theme":"spacehub-light"}}')).toMatchObject({ ok: true, appliquees: 1 });
    });

    it('ne déborde pas la pile sur un objet très profond', () => {
        let profond = '{"a":1}';
        for (let i = 0; i < 200; i++) profond = `{"n":${profond}}`;
        expect(() => s.import(profond)).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('AuthManager — audit A11 : l\'adresse du serveur', () => {
    const auth = new AuthManager();

    it('complète un schéma absent au lieu de partir en URL relative', () => {
        expect(auth._normaliserUrlServeur('192.168.1.20:8096'))
            .toEqual({ ok: true, url: 'http://192.168.1.20:8096' });
    });

    it('refuse tout schéma qui n\'est pas http(s)', () => {
        for (const mauvais of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x']) {
            expect(auth._normaliserUrlServeur(mauvais).ok, mauvais).toBe(false);
        }
        // Cas important : un schéma refusé qui possède POURTANT un nom d'hôte.
        // Sans le contrôle explicite du protocole, ceux-là passaient — le
        // garde-fou sur `hostname` ne les attrape pas.
        for (const mauvais of ['ftp://nas:21/media', 'ws://nas:8096', 'chrome://settings/x']) {
            expect(auth._normaliserUrlServeur(mauvais).ok, mauvais).toBe(false);
        }
    });

    it('conserve un sous-chemin de reverse-proxy et retire le slash final', () => {
        expect(auth._normaliserUrlServeur('https://maison.fr/jellyfin/').url)
            .toBe('https://maison.fr/jellyfin');
    });

    it('accepte le vide (repli sur le proxy relatif)', () => {
        expect(auth._normaliserUrlServeur('')).toEqual({ ok: true, url: '' });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('AuthManager.logout — audit A1', () => {
    let appels;
    beforeEach(() => {
        localStorage.clear();
        appels = [];
        globalThis.fetch = vi.fn(async (url, opts) => {
            appels.push({ url: String(url), method: opts?.method });
            return { ok: true, status: 204, text: async () => '', json: async () => ({}) };
        });
        // jsdom refuse la vraie navigation : on neutralise le rechargement.
        delete window.location;
        window.location = { reload: vi.fn(), origin: 'http://localhost' };
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('ferme la session côté serveur avant d\'effacer le jeton local', async () => {
        const auth = new AuthManager();
        auth._saveAuth({ ServerUrl: 'http://nas:8096', AccessToken: 'jeton', User: { Id: 'u1' } });

        await auth.logout({ rechargement: false });

        const deconnexion = appels.find(a => a.url.endsWith('/Sessions/Logout'));
        expect(deconnexion, 'aucun appel à /Sessions/Logout').toBeTruthy();
        expect(deconnexion.method).toBe('POST');
        expect(auth.isAuthenticated()).toBe(false);
    });

    it('se déconnecte quand même si le serveur est injoignable', async () => {
        globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
        const auth = new AuthManager();
        auth._saveAuth({ ServerUrl: 'http://nas:8096', AccessToken: 'jeton', User: { Id: 'u1' } });

        await expect(auth.logout({ rechargement: false })).resolves.toBeUndefined();
        expect(auth.isAuthenticated()).toBe(false);
    });

    it('retire la coque globale window.ApiClient', async () => {
        const auth = new AuthManager();
        auth._saveAuth({ ServerUrl: 'http://nas:8096', AccessToken: 'jeton', User: { Id: 'u1' } });
        auth._syncGlobalClient('http://nas:8096', 'jeton');
        expect(window.ApiClient).toBeTruthy();

        await auth.logout({ rechargement: false });
        expect(window.ApiClient).toBeUndefined();
    });

    it('n\'expose jamais le jeton par la coque globale', () => {
        const auth = new AuthManager();
        auth._saveAuth({ ServerUrl: 'http://nas:8096', AccessToken: 'secret', User: { Id: 'u1' } });
        auth._syncGlobalClient('http://nas:8096', 'secret');
        expect(window.ApiClient.accessToken).toBeUndefined();
        expect(JSON.stringify(Object.keys(window.ApiClient))).not.toContain('accessToken');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('fetchAvecDelai — audit B6', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

    it('abandonne au bout du délai au lieu d\'attendre indéfiniment', async () => {
        // Un serveur qui accepte la connexion et ne répond jamais : le cas
        // exact d'un NAS éteint derrière un pare-feu silencieux.
        globalThis.fetch = vi.fn((url, opts) => new Promise((_, rejeter) => {
            opts.signal.addEventListener('abort', () => {
                const e = new Error('aborted');
                e.name = 'AbortError';
                rejeter(e);
            });
        }));

        const debut = Date.now();
        await expect(fetchAvecDelai('http://nas:8096/x', {}, 40))
            .rejects.toMatchObject({ nomCourt: 'delai-depasse' });
        expect(Date.now() - debut).toBeLessThan(2000);
    });

    it('laisse la main à un appelant qui gère déjà son propre abandon', async () => {
        const vu = [];
        globalThis.fetch = vi.fn(async (url, opts) => { vu.push(opts); return { ok: true }; });
        const c = new AbortController();
        await fetchAvecDelai('http://x/y', { signal: c.signal }, 10);
        expect(vu[0].signal).toBe(c.signal);
    });

    it('laisse passer les erreurs qui ne sont pas un abandon', async () => {
        globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
        await expect(fetchAvecDelai('http://x/y')).rejects.toThrow('Failed to fetch');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Identité déclarée au serveur Jellyfin', () => {
    it('dit qui elle est au lieu de se faire passer pour le client officiel', async () => {
        const { enteteAutorisation, NOM_CLIENT } = await import('../core/utils/identiteClient.js');
        const entete = enteteAutorisation('sh_web_abc123', 'jeton');

        expect(NOM_CLIENT).toBe('SpaceHub');
        expect(entete).toContain('Client="SpaceHub"');
        // Le mensonge d'origine : Client="Jellyfin Web", Version="10.8.13".
        expect(entete).not.toContain('Jellyfin Web');
        expect(entete).not.toContain('10.8.13');
        expect(entete).toContain('DeviceId="sh_web_abc123"');
        expect(entete).toContain('Token="jeton"');
    });

    it('omet le jeton tant qu\'il n\'y en a pas', async () => {
        const { enteteAutorisation } = await import('../core/utils/identiteClient.js');
        expect(enteteAutorisation('sh_web_abc123')).not.toContain('Token=');
    });

    it('n\'ouvre pas de guillemet dans l\'en-tête', async () => {
        const { enteteAutorisation } = await import('../core/utils/identiteClient.js');
        // Un guillemet dans une valeur casserait l'analyse côté serveur.
        const entete = enteteAutorisation('id"injecte', 'je"ton');
        expect((entete.match(/"/g) || []).length % 2).toBe(0);
        expect(entete).toContain('DeviceId="idinjecte"');
    });

    it('nomme l\'appareil de façon reconnaissable par son propriétaire', async () => {
        const { nomAppareil } = await import('../core/utils/identiteClient.js');
        const original = navigator.userAgent;
        const poser = (ua) => Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
        try {
            poser('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537');
            expect(nomAppareil()).toBe('Téléviseur LG');
            poser('Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537');
            expect(nomAppareil()).toBe('Téléviseur Samsung');
            poser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120');
            expect(nomAppareil()).toBe('PC Windows');
        } finally {
            poser(original);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SettingsManager — le point d\'entrée de l\'interface', () => {
    it('ne prétend jamais « restauré » quand rien n\'a été appliqué', () => {
        localStorage.clear();
        const s = new SettingsManager();
        // Le panneau de réglages lisait le retour de `import()` comme un
        // succès inconditionnel : le message « Configuration restaurée ! »
        // s'affichait même sur un fichier entièrement refusé.
        for (const entree of ['', '   ', 'pas du json', '[]', '{}', 'null']) {
            expect(s.import(entree).ok, entree).toBe(false);
        }
    });
});
