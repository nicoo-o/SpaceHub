/**
 * @vitest-environment jsdom
 *
 * Où vit le jeton d'accès Jellyfin.
 *
 * Il était écrit dans `localStorage`. Trois faits, qui se combinent :
 * `localStorage` est lisible par tout script de la page ; le jeton Jellyfin
 * n'expire pas ; `localStorage` survit à la fermeture du navigateur. La
 * fenêtre d'exposition d'un jeton exfiltré n'était donc pas la session, mais
 * « pour toujours ».
 *
 * Ces tests figent le nouveau contrat : le jeton ne touche JAMAIS
 * `localStorage`, et une copie héritée y est activement effacée plutôt
 * qu'ignorée.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AuthManager from '../jellyfin/auth/AuthManager.js';

const CLE = 'SpaceHub_jellyfin_auth';
const CLE_REPRISE = 'SpaceHub_derniere_session';

const SESSION = {
    ServerUrl: 'http://nas:8096',
    AccessToken: 'jeton-tres-secret',
    User: { Id: 'u1', Name: 'nico' },
};

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Le jeton ne va pas dans localStorage', () => {
    it('n\'y écrit rien à l\'enregistrement d\'une session', () => {
        const auth = new AuthManager();
        auth._saveAuth(SESSION);

        expect(localStorage.getItem(CLE)).toBeNull();
        // Et le jeton n'apparaît nulle part ailleurs dans localStorage.
        const tout = Object.keys(localStorage).map(k => localStorage.getItem(k)).join('|');
        expect(tout).not.toContain('jeton-tres-secret');
    });

    it('le garde en session pour survivre à un rechargement', () => {
        const auth = new AuthManager();
        auth._saveAuth(SESSION);
        expect(JSON.parse(sessionStorage.getItem(CLE)).AccessToken).toBe('jeton-tres-secret');

        // Un rechargement d'onglet = une nouvelle instance, même sessionStorage.
        const apresF5 = new AuthManager();
        expect(apresF5.isAuthenticated()).toBe(true);
        expect(apresF5.getToken()).toBe('jeton-tres-secret');
    });

    it('déconnecte quand l\'onglet est fermé (sessionStorage vidé)', () => {
        const auth = new AuthManager();
        auth._saveAuth(SESSION);
        sessionStorage.clear();                    // ce que fait le navigateur

        expect(new AuthManager().isAuthenticated()).toBe(false);
    });
});

describe('Migration d\'un jeton hérité', () => {
    it('l\'efface de localStorage au lieu de l\'y laisser dormir', () => {
        // Une version antérieure de SpaceHub avait écrit ceci sur le disque.
        localStorage.setItem(CLE, JSON.stringify(SESSION));

        const auth = new AuthManager();

        // La session en cours n'est pas interrompue…
        expect(auth.isAuthenticated()).toBe(true);
        expect(auth.getToken()).toBe('jeton-tres-secret');
        expect(JSON.parse(sessionStorage.getItem(CLE)).AccessToken).toBe('jeton-tres-secret');
        // …mais la copie persistante a disparu. L'ignorer l'aurait laissée
        // lisible sur le disque de l'utilisateur indéfiniment.
        expect(localStorage.getItem(CLE)).toBeNull();
    });

    it('ne se laisse pas piéger par un contenu illisible', () => {
        localStorage.setItem(CLE, '{ ceci n\'est pas du JSON');
        expect(() => new AuthManager()).not.toThrow();
        expect(new AuthManager().isAuthenticated()).toBe(false);
    });
});

describe('Reprise de session — le confort sans le secret', () => {
    it('retient l\'adresse du serveur et le compte, jamais le jeton', () => {
        const auth = new AuthManager();
        auth._saveAuth(SESSION);

        const brut = localStorage.getItem(CLE_REPRISE);
        expect(brut).toBeTruthy();
        expect(brut, 'le jeton a fui dans la mémoire de reprise').not.toContain('jeton-tres-secret');

        const reprise = auth.derniereSession();
        expect(reprise.ServerUrl).toBe('http://nas:8096');
        expect(reprise.UserName).toBe('nico');
        expect(reprise.AccessToken).toBeUndefined();
    });

    it('survit à la fermeture du navigateur — c\'est tout son intérêt', () => {
        new AuthManager()._saveAuth(SESSION);
        sessionStorage.clear();                    // navigateur fermé

        const auth = new AuthManager();
        expect(auth.isAuthenticated()).toBe(false);          // il faut se reconnecter…
        expect(auth.derniereSession().ServerUrl).toBe('http://nas:8096');  // …mais pas tout ressaisir
    });

    it('refuse de rendre une mémoire de reprise qui contiendrait un secret', () => {
        // Garde-fou contre une régression future qui y écrirait le jeton.
        localStorage.setItem(CLE_REPRISE, JSON.stringify({ ServerUrl: 'http://x', AccessToken: 'fuite' }));
        const auth = new AuthManager();
        expect(auth.derniereSession()).toBeNull();
        expect(localStorage.getItem(CLE_REPRISE), 'le secret est resté sur le disque').toBeNull();
    });

    it('n\'empêche pas de fonctionner si le stockage est refusé', () => {
        // Navigation privée stricte : setItem lève.
        const vrai = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError'); };
        try {
            const auth = new AuthManager();
            expect(() => auth._saveAuth(SESSION)).not.toThrow();
            // La session reste utilisable en mémoire.
            expect(auth.isAuthenticated()).toBe(true);
        } finally {
            Storage.prototype.setItem = vrai;
        }
    });
});
