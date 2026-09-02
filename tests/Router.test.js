/**
 * @vitest-environment jsdom
 *
 * Router — l'ordre des opérations pendant une navigation.
 *
 * Trois choses peuvent mal tourner ici et ne se voient pas à la lecture :
 * la vue précédente n'est pas fermée avant l'ouverture de la suivante (deux
 * vues superposées), une route inconnue casse l'application au lieu de
 * retomber sur l'accueil, et l'historique grossit sans borne pendant une
 * session de plusieurs heures sur un téléviseur qu'on n'éteint jamais.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Router } from '../core/Router.js';
import inputRouter from '../core/InputRouter.js';

/** Bus d'événements minimal : on veut juste savoir ce qui a été émis. */
function busFactice() {
    const emis = [];
    return { emis, emit: (nom, charge) => emis.push({ nom, charge }) };
}

let routeur;
let bus;

beforeEach(() => {
    bus = busFactice();
    routeur = new Router({ eventBus: bus });
});

afterEach(() => {
    routeur.destroy();
});

describe('Enregistrement et navigation', () => {
    it('démarre sur « dashboard »', () => {
        expect(routeur.getCurrentRoute()).toBe('dashboard');
    });

    it('appelle render() de la route ciblée avec les paramètres', async () => {
        const render = vi.fn();
        routeur.registerRoute('library', { render });
        await routeur.navigate('library', { id: 42 });

        expect(render).toHaveBeenCalledWith({ id: 42 });
        expect(routeur.getCurrentRoute()).toBe('library');
    });

    it('accepte open() quand render() est absent', async () => {
        // Les panneaux modaux exposent open(), les vues render(). Le routeur
        // doit servir les deux sans que l'appelant s'en soucie.
        const open = vi.fn();
        routeur.registerRoute('settings', { open });
        await routeur.navigate('settings');
        expect(open).toHaveBeenCalled();
    });

    it('préfère render() si les deux existent', async () => {
        const render = vi.fn();
        const open = vi.fn();
        routeur.registerRoute('x', { render, open });
        await routeur.navigate('x');
        expect(render).toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
    });
});

describe('Fermeture de la vue précédente', () => {
    it('ferme l\'ancienne route AVANT d\'ouvrir la nouvelle', async () => {
        // C'est l'ordre qui compte : inverser produit deux vues superposées,
        // et sur téléviseur le focus se perd entre les deux.
        const ordre = [];
        routeur.registerRoute('a', { close: () => ordre.push('fermeture-a'), render: () => ordre.push('rendu-a') });
        routeur.registerRoute('b', { render: () => ordre.push('rendu-b') });

        await routeur.navigate('a');
        await routeur.navigate('b');

        expect(ordre).toEqual(['rendu-a', 'fermeture-a', 'rendu-b']);
    });

    it('poursuit la navigation même si close() lève', async () => {
        // Une vue qui échoue à se fermer ne doit pas bloquer l'utilisateur
        // sur cette vue : ce serait une application figée.
        const render = vi.fn();
        routeur.registerRoute('cassee', { close: () => { throw new Error('boum'); } });
        routeur.registerRoute('suivante', { render });

        await routeur.navigate('cassee');
        await expect(routeur.navigate('suivante')).resolves.toBeUndefined();
        expect(render).toHaveBeenCalled();
        expect(routeur.getCurrentRoute()).toBe('suivante');
    });

    it('poursuit même si render() de la cible lève', async () => {
        routeur.registerRoute('fragile', { render: () => { throw new Error('boum'); } });
        await expect(routeur.navigate('fragile')).resolves.toBeUndefined();
        // La route reste positionnée : l'erreur est journalisée, pas propagée.
        expect(routeur.getCurrentRoute()).toBe('fragile');
    });
});

describe('Route inconnue', () => {
    it('retombe sur « dashboard » sans lever', async () => {
        await routeur.navigate('nexistepas');
        expect(routeur.getCurrentRoute()).toBe('dashboard');
    });

    it('émet route:changed avec la destination corrigée', async () => {
        await routeur.navigate('nexistepas');
        const dernier = bus.emis.at(-1);
        expect(dernier.nom).toBe('route:changed');
        expect(dernier.charge.to).toBe('dashboard');
    });
});

describe('Historique', () => {
    it('consigne chaque navigation', async () => {
        routeur.registerRoute('a', {});
        routeur.registerRoute('b', {});
        await routeur.navigate('a');
        await routeur.navigate('b');
        expect(routeur._history.map(h => h.route)).toEqual(['a', 'b']);
    });

    it('ne dépasse jamais 100 entrées', async () => {
        // Un téléviseur reste allumé des heures : sans cette borne, l'historique
        // grossit indéfiniment avec les paramètres de chaque navigation.
        routeur.registerRoute('a', {});
        for (let i = 0; i < 150; i++) await routeur.navigate('a');
        expect(routeur._history.length).toBe(100);
    });

    it('retire les entrées les plus anciennes, pas les récentes', async () => {
        routeur.registerRoute('a', {});
        routeur.registerRoute('z', {});
        for (let i = 0; i < 100; i++) await routeur.navigate('a');
        await routeur.navigate('z');
        expect(routeur._history.at(-1).route).toBe('z');
        expect(routeur._history.length).toBe(100);
    });
});

describe('Événement route:changed', () => {
    it('porte l\'origine, la destination et les paramètres', async () => {
        routeur.registerRoute('library', {});
        await routeur.navigate('library', { genre: 'anime' });
        const dernier = bus.emis.at(-1);
        expect(dernier.charge).toMatchObject({
            from: 'dashboard',
            to: 'library',
            params: { genre: 'anime' },
        });
    });

    it('fonctionne sans bus d\'événements', async () => {
        const seul = new Router();
        seul.registerRoute('a', {});
        await expect(seul.navigate('a')).resolves.toBeUndefined();
        seul.destroy();
    });
});

describe('destroy()', () => {
    it('se retire du routeur d\'entrée et vide les routes', () => {
        // Depuis l'unification du pipeline d'entrée, le Router n'attache plus
        // son propre écouteur : il s'inscrit auprès d'InputRouter. Ce qui doit
        // être vérifié est donc sa sortie de la chaîne de distribution — un
        // Router détruit qui y resterait continuerait d'intercepter Ctrl+K.
        routeur.registerRoute('a', {});
        expect(inputRouter.ordreDeDistribution()).toContain('router');

        routeur.destroy();

        expect(inputRouter.ordreDeDistribution()).not.toContain('router');
        expect(routeur._routes.size).toBe(0);
        expect(routeur._history).toEqual([]);
    });

    it('supporte d\'être appelé deux fois', () => {
        routeur.destroy();
        expect(() => routeur.destroy()).not.toThrow();
    });
});
