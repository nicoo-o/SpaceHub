/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import PontAndroid from '../core/PontAndroid.js';

describe('PontAndroid — hors APK (web/Electron/TV)', () => {
    it('sans window.cordova, init() ne branche rien et ne lève pas', () => {
        const pont = new PontAndroid().init({ demandeRetour: () => true });
        expect(pont.estActif()).toBe(false);
        // Rien n'écoute backbutton : la propager ne doit rien déclencher.
        expect(() => document.dispatchEvent(new CustomEvent('backbutton'))).not.toThrow();
    });
});

describe('PontAndroid — en APK (cordova présent)', () => {
    /** Stupe minimal de l'objet cordova injecté par cordova.js. */
    function installerCordova() { window.cordova = { version: '13.0.0' }; }

    let demandeRetour;
    let exitApp;
    let logWarn;

    beforeEach(() => {
        installerCordova();
        demandeRetour = vi.fn(() => false);
        exitApp = vi.fn();
        window.navigator.app = { exitApp: exitApp };
    });

    afterEach(() => {
        delete window.cordova;
        delete window.navigator.app;
        document.removeEventListener('backbutton', ecouteurCourant);
    });

    /** Capture l'écouteur backbutton posé par le pont pour le déclencher. */
    let ecouteurCourant = null;
    const originalAdd = document.addEventListener.bind(document);
    beforeEach(() => {
        document.addEventListener = (type, cb, opts) => {
            if (type === 'backbutton') ecouteurCourant = cb;
            return originalAdd(type, cb, opts);
        };
    });
    afterEach(() => { document.addEventListener = originalAdd; });

    function pontPret() {
        const pont = new PontAndroid().init({ demandeRetour: () => demandeRetour() });
        document.dispatchEvent(new Event('deviceready'));
        return pont;
    }

    it('deviceready arme le pont et abonne le backbutton', () => {
        const pont = pontPret();
        expect(pont.estActif()).toBe(true);
        expect(ecouteurCourant).not.toBeNull();
    });

    it('couche ouverte : le retour délègue au pipeline TV et ne quitte PAS', () => {
        demandeRetour.mockReturnValueOnce(true);
        pontPret();
        const e = { preventDefault: vi.fn() };
        ecouteurCourant(e);
        expect(demandeRetour).toHaveBeenCalledTimes(1);
        expect(exitApp).not.toHaveBeenCalled();
        expect(e.preventDefault).not.toHaveBeenCalled();
    });

    it('aucune couche : premier retour = avertissement, second = sortie', () => {
        vi.useFakeTimers();
        const pont = pontPret();
        const toast = vi.fn();
        document.addEventListener('spacehub:quitter-suggere', toast);

        ecouteurCourant({ preventDefault: vi.fn() });
        expect(toast).toHaveBeenCalledTimes(1);
        expect(exitApp).not.toHaveBeenCalled();

        // Trois secondes passent : la fenêtre de confirmation est refermée.
        vi.advanceTimersByTime(3000);
        ecouteurCourant({ preventDefault: vi.fn() });
        expect(exitApp).not.toHaveBeenCalled();  // à nouveau un premier appui

        // Second appui DANS le délai cette fois.
        ecouteurCourant({ preventDefault: vi.fn() });
        expect(exitApp).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('retour qui ferme une couche annule la fenêtre de confirmation', () => {
        vi.useFakeTimers();
        const pont = pontPret();
        ecouteurCourant({ preventDefault: vi.fn() });           // 1er appui : avertissement
        demandeRetour.mockReturnValueOnce(true);
        ecouteurCourant({ preventDefault: vi.fn() });           // couche fermée entre-temps
        ecouteurCourant({ preventDefault: vi.fn() });           // retour : avertissement à nouveau
        expect(exitApp).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('aucune couche mais une vue précédente : retour à l\'onglet, aucun avertissement', () => {
        const retourVue = vi.fn(() => true);
        const pont = new PontAndroid().init({
            demandeRetour: () => demandeRetour(),
            retourVue: () => retourVue(),
        });
        document.dispatchEvent(new Event('deviceready'));
        const toast = vi.fn();
        document.addEventListener('spacehub:quitter-suggere', toast);

        const e = { preventDefault: vi.fn() };
        ecouteurCourant(e);

        expect(retourVue).toHaveBeenCalledTimes(1);
        expect(toast).not.toHaveBeenCalled();
        expect(exitApp).not.toHaveBeenCalled();
        expect(e.preventDefault).not.toHaveBeenCalled();
    });

    it('sans vue précédente, le retour retombe sur la confirmation de sortie', () => {
        const retourVue = vi.fn(() => false);
        new PontAndroid().init({ demandeRetour: () => demandeRetour(), retourVue: () => retourVue() });
        document.dispatchEvent(new Event('deviceready'));

        ecouteurCourant({ preventDefault: vi.fn() });

        expect(retourVue).toHaveBeenCalledTimes(1);
        expect(exitApp).not.toHaveBeenCalled();   // premier appui : avertissement
    });

    it('brancherVues attache la coquille après coup (elle naît après le pont)', () => {
        const vues = { retourVue: vi.fn(() => true) };
        const pont = pontPret();
        pont.brancherVues(vues);

        ecouteurCourant({ preventDefault: vi.fn() });

        expect(vues.retourVue).toHaveBeenCalledTimes(1);
        expect(exitApp).not.toHaveBeenCalled();
    });

    it('une couche restée ouverte garde la priorité sur l\'onglet précédent', () => {
        demandeRetour.mockReturnValueOnce(true);
        const retourVue = vi.fn(() => true);
        new PontAndroid().init({ demandeRetour: () => demandeRetour(), retourVue: () => retourVue() });
        document.dispatchEvent(new Event('deviceready'));

        ecouteurCourant({ preventDefault: vi.fn() });

        expect(demandeRetour).toHaveBeenCalledTimes(1);
        expect(retourVue).not.toHaveBeenCalled();
    });

    it('sans navigator.app (plateforme exotique), la sortie ne lève pas', () => {
        delete window.navigator.app;
        pontPret();
        ecouteurCourant({ preventDefault: vi.fn() });
        expect(() => ecouteurCourant({ preventDefault: vi.fn() })).not.toThrow();
    });
});
