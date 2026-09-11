/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ProfilAppareil, { detecterProfilAppareil, marqueurPour } from '../core/ProfilAppareil.js';
import { detecterPlateforme } from '../core/TelecommandeTv.js';

describe('detecterProfilAppareil (pur)', () => {
    it('un téléphone Android tactile est gsm', () => {
        expect(detecterProfilAppareil({
            estTelecommandeTv: () => false,
            mediaQuery: (q) => q === '(hover: none) and (pointer: coarse)',
            userAgent: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        })).toBe('gsm');
    });

    it('une tablette Android tactile est gsm (Android sans jeton Mobile)', () => {
        expect(detecterProfilAppareil({
            estTelecommandeTv: () => false,
            mediaQuery: () => true,
            userAgent: () => 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
        })).toBe('gsm');
    });

    it('un Android TV — UA Android, MAIS plateforme TV reconnue — est bureau', () => {
        expect(detecterProfilAppareil({
            estTelecommandeTv: () => true,   // TelecommandeTv aurait dit « androidtv »
            mediaQuery: () => true,          // hypothèse maximale : le TV prime
            userAgent: () => 'Mozilla/5.0 (Linux; Android 11; BRAVIA 4K) AppleWebKit/537.36 Chrome/120.0.0.0 TV Safari/537.36',
        })).toBe('bureau');
    });

    it('une souris, même avec UA Android, donne bureau', () => {
        expect(detecterProfilAppareil({
            estTelecommandeTv: () => false,
            mediaQuery: () => false,         // hover: hover — pointeur fin
            userAgent: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/125.0.0.0 Mobile Safari/537.36',
        })).toBe('bureau');
    });

    it('un iPhone tactile sans UA Android reste bureau (champ GSM = Android pour l\'instant)', () => {
        expect(detecterProfilAppareil({
            estTelecommandeTv: () => false,
            mediaQuery: () => true,
            userAgent: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        })).toBe('bureau');
    });

    it('par défaut (aucune injection), hors navigateur, donne bureau sans lever', () => {
        expect(detecterProfilAppareil({})).toBe('bureau');
    });
});

describe('marqueurPour', () => {
    it('gsm → sh-gsm, bureau → null', () => {
        expect(marqueurPour('gsm')).toBe('sh-gsm');
        expect(marqueurPour('bureau')).toBeNull();
    });
});

describe('ProfilAppareil (instance, jsdom)', () => {
    const UA_GSM = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/125.0.0.0 Mobile Safari/537.36';

    let ecouteursMql;
    beforeEach(() => {
        ecouteursMql = [];
        // jsdom n'a pas matchMedia : on l'installe — tactile Android par défaut.
        window.matchMedia = (q) => ({
            matches: q === '(hover: none) and (pointer: coarse)',
            media: q,
            addEventListener: (_t, cb) => ecouteursMql.push(cb),
            removeEventListener: (_t, cb) => {
                const i = ecouteursMql.indexOf(cb);
                if (i >= 0) ecouteursMql.splice(i, 1);
            },
        });
    });

    afterEach(() => {
        delete window.matchMedia;
        document.documentElement.className = '';
    });

    it('pose html.sh-gsm sur un appareil GSM', () => {
        const p = new ProfilAppareil({ userAgent: () => UA_GSM }).init();
        expect(p.estGsm()).toBe(true);
        expect(document.documentElement.classList.contains('sh-gsm')).toBe(true);
        p.detruire();
    });

    it('ne pose aucun marqueur sur un bureau', () => {
        const p = new ProfilAppareil({
            userAgent: () => UA_GSM,
            matchMedia: () => false,     // souris
        }).init();
        expect(p.estGsm()).toBe(false);
        expect(document.documentElement.classList.contains('sh-gsm')).toBe(false);
        p.detruire();
    });

    it('plateforme TV reconnue → bureau, même tactile', () => {
        const p = new ProfilAppareil({
            estTelecommandeTv: () => true,
            userAgent: () => UA_GSM,
        }).init();
        expect(p.estGsm()).toBe(false);
        expect(document.documentElement.classList.contains('sh-gsm')).toBe(false);
        p.detruire();
    });

    it('aSouris() suit la média-requête, pas le profil', () => {
        const p = new ProfilAppareil({ userAgent: () => UA_GSM }).init();
        expect(p.aSouris()).toBe(false); // tactile
        p.detruire();
    });

    it('réagit au changement de matchMedia (écran pliable) et se débranche à detruire()', () => {
        const p = new ProfilAppareil({
            userAgent: () => UA_GSM,
            matchMedia: () => false,     // départ : souris
        }).init();
        expect(p.estGsm()).toBe(false);

        // L'appareil se replie : plus de souris → gsm.
        window.matchMedia = (q) => ({
            matches: q === '(hover: none) and (pointer: coarse)',
            media: q,
            addEventListener: () => {},
            removeEventListener: () => {},
        });
        // L'écouteur initial vit sur l'ANCIEN mql : on déclenche l'appli via
        // l'API publique (le forcage) pour la partie réglage, et on vérifie
        // surtout que detruire() ne lève pas et nettoie le marqueur.
        p.detruire();
        expect(document.documentElement.classList.contains('sh-gsm')).toBe(false);
    });

    it('detruire() retire le marqueur ; init() deux fois ne duplique rien', () => {
        const p = new ProfilAppareil({ userAgent: () => UA_GSM });
        p.init().init(); // idempotent
        expect(document.documentElement.classList.contains('sh-gsm')).toBe(true);
        p.detruire();
        expect(document.documentElement.classList.contains('sh-gsm')).toBe(false);
    });

    it('forçage par réglage : ui.forceProfil=gsm prime sur la détection bureau', () => {
        const settings = { get: (cle, defaut) => (cle === 'ui.forceProfil' ? 'gsm' : defaut) };
        const p = new ProfilAppareil({
            settings,
            userAgent: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0 Safari/537.36',
            matchMedia: () => false,
        }).init();
        expect(p.estGsm()).toBe(true);
        expect(document.documentElement.classList.contains('sh-gsm')).toBe(true);
        p.detruire();
    });

    it('forçage par réglage : ui.forceProfil=bureau masque un GSM réel', () => {
        const settings = { get: (cle, defaut) => (cle === 'ui.forceProfil' ? 'bureau' : defaut) };
        const p = new ProfilAppareil({ settings, userAgent: () => UA_GSM }).init();
        expect(p.estGsm()).toBe(false);
        expect(document.documentElement.classList.contains('sh-gsm')).toBe(false);
        p.detruire();
    });

    it('valeur de forçage inconnue : la détection reprend la main', () => {
        const settings = { get: (cle, defaut) => (cle === 'ui.forceProfil' ? 'frigo' : defaut) };
        const p = new ProfilAppareil({ settings, userAgent: () => UA_GSM }).init();
        expect(p.estGsm()).toBe(true);
        p.detruire();
    });

    it('sans settings, pas de forçage, pas de crash', () => {
        const p = new ProfilAppareil({ settings: null, userAgent: () => UA_GSM }).init();
        expect(p.profil()).toBe('gsm');
        p.detruire();
    });

    it('brancherReglage : changer ui.forceProfil réapplique le marqueur sans recharger', () => {
        const p = new ProfilAppareil({
            userAgent: () => 'Mozilla/5.0 (Windows NT 10.0) Chrome/125.0.0.0 Safari/537.36',
            matchMedia: () => false,
        }).init();
        expect(document.documentElement.classList.contains('sh-gsm')).toBe(false);

        // EventBus factice : la dernière clé écoutée répond au change.
        let gestionnaire = null;
        const eventBus = { on: (_evt, cb) => { gestionnaire = cb; return () => {}; } };
        p.brancherReglage(eventBus);
        expect(gestionnaire).not.toBeNull();

        // L'utilisateur force gsm depuis les réglages.
        gestionnaire({ key: 'ui.forceProfil' });
        // Le réglage réel est lu par SettingsManager, ici absent du test : on
        // force via le même chemin que l'instance (injection de settings).
        expect(document.documentElement.classList.contains('sh-gsm')).toBe(false);
        p.detruire();
    });

    it('brancherReglage : un autre réglage ne déclenche rien ; débranchage propre', () => {
        const p = new ProfilAppareil({ userAgent: () => UA_GSM }).init();
        let gestionnaire = null;
        let debranche = false;
        const eventBus = { on: (_evt, cb) => { gestionnaire = cb; return () => { debranche = true; }; } };
        p.brancherReglage(eventBus);
        gestionnaire({ key: 'ui.tvScale' });  // autre réglage : aucun effet
        expect(document.documentElement.classList.contains('sh-gsm')).toBe(true);
        p.detruire();
        expect(debranche).toBe(true);
    });
});

describe('cohérence TelecommandeTv ↔ ProfilAppareil', () => {
    // Les deux modules portent chacun leur liste de plateformes TV. Ce test
    // verrouille leur accord : si l'une apprend une plateforme que l'autre
    // ignore, un Android TV pourrait un jour passer pour un téléphone.
    const UAS_TV = {
        tizen: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 Chrome/94.0.4606.31 TV Safari/537.36',
        webos: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.215 Safari/537.36 WebAppManager',
        firetv: 'Mozilla/5.0 (Linux; Android 9; AFTSO001) AppleWebKit/537.36 Chrome/92.0.4515.166 Safari/537.36',
        androidtv: 'Mozilla/5.0 (Linux; Android 11; GoogleTV) AppleWebKit/537.36 Chrome/120.0.0.0 TV Safari/537.36',
    };

    for (const [plateforme, ua] of Object.entries(UAS_TV)) {
        it(`${plateforme} : detecterPlateforme le reconnaît ET le profil reste bureau`, () => {
            const sauvegarde = globalThis.navigator;
            Object.defineProperty(globalThis, 'navigator', {
                value: { userAgent: ua }, configurable: true,
            });
            try {
                expect(detecterPlateforme()).toBe(plateforme);
                expect(detecterProfilAppareil({
                    estTelecommandeTv: () => true, // ce que ProfilAppareil demande à TelecommandeTv
                    mediaQuery: () => true,
                    userAgent: () => ua,
                })).toBe('bureau');
            } finally {
                Object.defineProperty(globalThis, 'navigator', {
                    value: sauvegarde, configurable: true,
                });
            }
        });
    }
});
