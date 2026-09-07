/**
 * @vitest-environment jsdom
 *
 * Verrou d'écran et classifications parentales.
 *
 * Deux correctifs qui partagent une propriété : ils échouent au moment précis
 * où l'on ne regarde pas.
 *
 * Le verrou d'écran est relâché par le navigateur dès que le document devient
 * caché, et ne se rétablit pas seul — une implémentation naïve marche en test
 * puis lâche dès que l'utilisateur change d'onglet dix secondes.
 *
 * Le contrôle parental, lui, ne connaissait que l'ancienne forme des
 * classifications. Il aurait régressé silencieusement à la mise à jour du
 * serveur en 10.11 : le pire moment pour qu'un verrou lâche.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import VerrouEcran from '../core/VerrouEcran.js';
import ParentalControl from '../core/ParentalControl.js';
import SettingsManager from '../core/SettingsManager.js';

// ─────────────────────────────────────────────────────────────────────────────
describe('Verrou d\'écran', () => {
    let verrous;

    beforeEach(() => {
        verrous = [];
        navigator.wakeLock = {
            request: vi.fn(async () => {
                const v = { released: false, release: vi.fn(async function () { this.released = true; }), addEventListener: vi.fn() };
                verrous.push(v);
                return v;
            }),
        };
    });
    afterEach(() => { delete navigator.wakeLock; vi.restoreAllMocks(); });

    it('demande le verrou et le tient', async () => {
        const v = new VerrouEcran();
        expect(await v.demander()).toBe(true);
        expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
        expect(v.actif).toBe(true);
    });

    it('LE REPREND quand le document redevient visible', async () => {
        // C'est la raison d'être du module. Le navigateur relâche le verrou en
        // masquant le document et ne le reprend pas : sans cet écouteur, la
        // veille se déclenche après le premier changement d'onglet.
        const v = new VerrouEcran();
        await v.demander();
        expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);

        // Le navigateur a relâché en arrière-plan.
        verrous[0].released = true;
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve(); await Promise.resolve();

        expect(navigator.wakeLock.request, 'le verrou n\'a pas été repris').toHaveBeenCalledTimes(2);
    });

    it('ne le reprend pas après une libération volontaire', async () => {
        const v = new VerrouEcran();
        await v.demander();
        await v.liberer();

        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve(); await Promise.resolve();

        expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
        expect(v.actif).toBe(false);
    });

    it('ne demande pas deux fois un verrou déjà tenu', async () => {
        const v = new VerrouEcran();
        await v.demander();
        await v.demander();
        expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    });

    it('accepte un refus sans interrompre quoi que ce soit', async () => {
        // Batterie faible, mode économie d'énergie : c'est une décision de
        // l'appareil, pas une panne. La lecture doit continuer.
        navigator.wakeLock.request = vi.fn(async () => { throw new Error('NotAllowedError'); });
        const v = new VerrouEcran();
        await expect(v.demander()).resolves.toBe(false);
        expect(v.actif).toBe(false);
    });

    it('ne plante pas sur un appareil sans l\'API', async () => {
        delete navigator.wakeLock;
        const v = new VerrouEcran();
        expect(v.supporte).toBe(false);
        await expect(v.demander()).resolves.toBe(false);
        await expect(v.liberer()).resolves.toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Classifications parentales — Jellyfin 10.11', () => {
    function controle(maxRank) {
        localStorage.clear();
        const settings = new SettingsManager();
        settings.set('parental.enabled', true);
        settings.set('parental.maxRank', maxRank);
        return new ParentalControl({ settings });
    }

    it('utilise le champ numérique du serveur quand il existe', () => {
        // rang 2 = 13 ans. Le serveur a fait la conversion avec sa table par
        // pays : elle est plus fiable que notre expression régulière sur
        // « PG-13 », « FR-12 », « TV-14 »…
        const p = controle(2);
        expect(p.isAllowed({ InheritedParentalRatingValue: 10 })).toBe(true);
        expect(p.isAllowed({ InheritedParentalRatingValue: 13 })).toBe(true);
        expect(p.isAllowed({ InheritedParentalRatingValue: 16 })).toBe(false);
        expect(p.isAllowed({ InheritedParentalRatingValue: 18 })).toBe(false);
    });

    it('départage deux classifications de même âge par le sous-score', () => {
        // Nouveauté 10.11 : « PG-13 » et « TV-14 » partagent un âge mais pas
        // une sévérité. Le sous-score raffine sans jamais franchir l'âge
        // supérieur.
        const p = controle(2);   // 13 ans
        expect(p.isAllowed({ InheritedParentalRatingValue: 13, InheritedParentalRatingSubValue: 0 })).toBe(true);
        expect(p.isAllowed({ InheritedParentalRatingValue: 13, InheritedParentalRatingSubValue: 90 })).toBe(true);
        // Le sous-score ne fait jamais basculer dans la tranche suivante.
        expect(p.isAllowed({ InheritedParentalRatingValue: 14, InheritedParentalRatingSubValue: 0 })).toBe(false);
    });

    it('retombe sur la chaîne pour les serveurs antérieurs à 10.11', () => {
        // Sans le champ numérique, le comportement d'avant doit être IDENTIQUE
        // — sinon la mise à jour du serveur changerait le verrou dans un sens
        // ou dans l'autre, et les deux sont mauvais.
        const p = controle(2);
        expect(p.isAllowed({ OfficialRating: 'PG' })).toBe(true);
        expect(p.isAllowed({ OfficialRating: 'R' })).toBe(false);
        expect(p.isAllowed({ OfficialRating: 'FR-16' })).toBe(false);
    });

    it('donne un motif lisible dans les deux formes', () => {
        const p = controle(1);
        expect(p.reason({ OfficialRating: 'R' })).toContain('« R »');
        expect(p.reason({ InheritedParentalRatingValue: 18 })).toContain('18+');
        expect(p.reason({ InheritedParentalRatingValue: 0 })).toBeNull();
    });

    it('n\'ouvre rien quand le contrôle est désactivé', () => {
        localStorage.clear();
        const settings = new SettingsManager();
        settings.set('parental.enabled', false);
        const p = new ParentalControl({ settings });
        expect(p.isAllowed({ InheritedParentalRatingValue: 18 })).toBe(true);
    });

    it('respecte le réglage « non classés » quand aucune forme n\'est fournie', () => {
        const p = controle(1);
        expect(p.isAllowed({})).toBe(false);
        p._settings.set('parental.allowUnrated', true);
        expect(p.isAllowed({})).toBe(true);
    });
});
