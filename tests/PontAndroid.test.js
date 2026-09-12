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

/**
 * detruire() — CE BLOC NE PASSE PAS PAR `ecouteurCourant`, ET C'EST TOUT SON
 * INTÉRÊT.
 *
 * Les cas ci-dessus capturent la fonction posée sur `backbutton` et l'appellent
 * à la main. C'est commode, et c'est précisément ce qui a laissé passer le
 * défaut : appeler soi-même la fonction capturée donne le même résultat que
 * l'écouteur soit encore abonné ou non. `detruire()` retirait donc
 * `this._surRetourArme` — un champ jamais affecté — c'est-à-dire rien, et
 * aucun test ne pouvait s'en apercevoir.
 *
 * Ici on répartit un VRAI événement sur `document`. C'est le seul protocole qui
 * distingue « l'abonnement a été retiré » de « la fonction existe encore ».
 */
describe('PontAndroid — detruire() retire vraiment l\'écouteur', () => {
    let demandeRetour;

    // TOUT PONT CRÉÉ ICI EST DÉTRUIT APRÈS LE CAS. Ce n'est pas de
    // l'hygiène décorative : puisque ces cas répartissent de VRAIS
    // événements, un pont laissé abonné par un cas précédent répond aux
    // événements du suivant. C'est arrivé en écrivant ce bloc — deux appels
    // pour une seule répartition — et c'est exactement le symptôme que le
    // défaut corrigé produisait en production de test.
    const ponts = [];
    const creer = (deps) => {
        const pont = new PontAndroid().init(deps);
        ponts.push(pont);
        document.dispatchEvent(new Event('deviceready'));
        return pont;
    };

    beforeEach(() => {
        window.cordova = { version: '13.0.0' };
        demandeRetour = vi.fn(() => true);   // « une couche a été fermée » : pas de sortie
        window.navigator.app = { exitApp: vi.fn() };
    });

    afterEach(() => {
        while (ponts.length) ponts.pop().detruire();
        delete window.cordova;
        delete window.navigator.app;
    });

    function pontPret() {
        return creer({ demandeRetour: () => demandeRetour() });
    }

    it('avant detruire(), un backbutton réel atteint le pont', () => {
        pontPret();
        document.dispatchEvent(new CustomEvent('backbutton'));
        expect(demandeRetour).toHaveBeenCalledTimes(1);
    });

    it('après detruire(), un backbutton réel ne l\'atteint plus', () => {
        const pont = pontPret();
        document.dispatchEvent(new CustomEvent('backbutton'));
        expect(demandeRetour).toHaveBeenCalledTimes(1);

        pont.detruire();

        document.dispatchEvent(new CustomEvent('backbutton'));
        document.dispatchEvent(new CustomEvent('backbutton'));
        // Toujours UN seul appel : les deux derniers ne doivent aller nulle part.
        expect(demandeRetour).toHaveBeenCalledTimes(1);
        expect(pont.estActif()).toBe(false);
    });

    it('deux ponts successifs : le premier détruit ne répond plus pour le second', () => {
        // Le symptôme réel du défaut : entre deux cas de test, un pont
        // « détruit » restait abonné et traitait les événements du suivant.
        const premier = pontPret();
        premier.detruire();

        const appelsDuSecond = vi.fn(() => true);
        creer({ demandeRetour: appelsDuSecond });

        document.dispatchEvent(new CustomEvent('backbutton'));

        expect(appelsDuSecond).toHaveBeenCalledTimes(1);
        expect(demandeRetour).not.toHaveBeenCalled();   // le premier s'est tu
    });

    it('detruire() sans deviceready (hors APK) ne lève pas', () => {
        delete window.cordova;
        const pont = new PontAndroid().init({ demandeRetour: () => true });
        expect(() => pont.detruire()).not.toThrow();
    });
});
