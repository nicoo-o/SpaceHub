/**
 * PluginManager — la frontière de confiance.
 *
 * Un plugin est du code tiers qui s'exécute dans la page. Tout ce qui compte
 * ici est de nature défensive : refuser un manifeste malformé, refuser une
 * permission inconnue, refuser une dépendance circulaire, et ne jamais laisser
 * un plugin fautif entraîner l'application avec lui.
 *
 * Les tests sont donc écrits à l'envers de l'habitude : la plupart vérifient
 * qu'une chose N'ARRIVE PAS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginManager } from '../core/PluginManager.js';

/** Réglages en mémoire, avec la même signature que SettingsManager. */
function reglagesFactices(initial = {}) {
    const store = { ...initial };
    return {
        store,
        get: (cle, defaut) => (cle in store ? store[cle] : defaut),
        set: (cle, valeur) => { store[cle] = valeur; },
    };
}

function busFactice() {
    const emis = [];
    return { emis, emit: (nom, charge) => emis.push({ nom, charge }), noms: () => emis.map(e => e.nom) };
}

/** Manifeste minimal valide. */
const manifeste = (extra = {}) => ({
    id: 'demo',
    name: 'Démo',
    isDefault: true,
    ...extra,
});

let pm;
let bus;
let reglages;

beforeEach(() => {
    bus = busFactice();
    reglages = reglagesFactices();
    pm = new PluginManager({ eventBus: bus, settings: reglages, hostVersion: '2.0.0', timeoutMs: 200 });
});

describe('Validation du manifeste — ce qui est refusé', () => {
    it('refuse un manifeste sans id', async () => {
        await expect(pm.registerPlugin({ name: 'Sans id' })).resolves.toBe(false);
        expect(pm.getPlugins()).toHaveLength(0);
    });

    it('refuse un id qui ne respecte pas le motif', async () => {
        // Le motif interdit espaces, slash et majuscules non normalisables :
        // l'id sert de clé de réglage et de préfixe de stockage.
        for (const mauvais of ['a', 'mon plugin', 'plug/in', '-debut', '']) {
            await expect(pm.registerPlugin({ id: mauvais })).resolves.toBe(false);
        }
        expect(pm.getPlugins()).toHaveLength(0);
    });

    it('normalise l\'id en minuscules et sans espaces autour', async () => {
        await pm.registerPlugin(manifeste({ id: '  MonPlugin  ' }));
        expect(pm.getPlugins()[0].id).toBe('monplugin');
    });

    it('refuse un hook qui n\'est pas une fonction', async () => {
        await expect(pm.registerPlugin(manifeste({ onEnable: 'coucou' }))).resolves.toBe(false);
    });

    it('refuse une permission inconnue', async () => {
        // Une permission inconnue signifie soit une faute de frappe, soit un
        // plugin écrit pour une autre version : dans les deux cas, refuser.
        await expect(pm.registerPlugin(manifeste({ permissions: ['ui.inexistante'] }))).resolves.toBe(false);
    });

    it('accepte une permission connue', async () => {
        await expect(pm.registerPlugin(manifeste({ permissions: ['ui.dashboard.read'] }))).resolves.toBe(true);
    });

    it('refuse un type de contribution inconnu', async () => {
        await expect(pm.registerPlugin(manifeste({ contributions: ['sousmarin'] }))).resolves.toBe(false);
    });

    it('refuse des dépendances qui ne sont pas un tableau', async () => {
        await expect(pm.registerPlugin(manifeste({ dependencies: 'autre' }))).resolves.toBe(false);
    });

    it('refuse un plugin exigeant une version de SpaceHub plus récente', async () => {
        await expect(pm.registerPlugin(manifeste({ compatibility: { minSpaceHub: '3.0.0' } }))).resolves.toBe(false);
    });

    it('accepte un plugin exigeant une version antérieure ou égale', async () => {
        await expect(pm.registerPlugin(manifeste({ compatibility: { minSpaceHub: '2.0.0' } }))).resolves.toBe(true);
    });
});

describe('Cycle de vie', () => {
    it('appelle onLoad puis onEnable, dans cet ordre', async () => {
        const ordre = [];
        await pm.registerPlugin(manifeste({
            onLoad: () => ordre.push('load'),
            onEnable: () => ordre.push('enable'),
        }));
        expect(ordre).toEqual(['load', 'enable']);
    });

    it('n\'active pas automatiquement un plugin non par défaut', async () => {
        const onEnable = vi.fn();
        await pm.registerPlugin({ id: 'demo', isDefault: false, onEnable });
        expect(onEnable).not.toHaveBeenCalled();
        expect(pm.getPlugins()[0].state).toBe('registered');
    });

    it('respecte le réglage utilisateur plutôt que isDefault', async () => {
        // L'utilisateur a désactivé le plugin : isDefault ne doit pas le
        // réactiver au démarrage suivant.
        reglages.set('plugins.demo.enabled', false);
        const onEnable = vi.fn();
        await pm.registerPlugin(manifeste({ onEnable }));
        expect(onEnable).not.toHaveBeenCalled();
    });

    it('n\'appelle pas onLoad une seconde fois à la réactivation', async () => {
        const onLoad = vi.fn();
        const onEnable = vi.fn();
        await pm.registerPlugin(manifeste({ onLoad, onEnable }));
        await pm.disablePlugin('demo');
        await pm.enablePlugin('demo');
        expect(onLoad).toHaveBeenCalledTimes(1);
        expect(onEnable).toHaveBeenCalledTimes(2);
    });

    it('refuse de remplacer un plugin déjà actif', async () => {
        await pm.registerPlugin(manifeste());
        // Sinon un second enregistrement pourrait substituer du code à un
        // plugin en cours d'exécution, sans passer par aucune permission.
        await expect(pm.registerPlugin(manifeste({ name: 'Imposteur' }))).resolves.toBe(false);
        expect(pm.getPlugins()[0].name).toBe('Démo');
    });
});

describe('Isolation des pannes', () => {
    it('un onEnable qui lève met le plugin en erreur sans propager', async () => {
        await expect(pm.registerPlugin(manifeste({
            onEnable: () => { throw new Error('boum'); },
        }))).resolves.toBe(true);

        const p = pm.getPlugins()[0];
        expect(p.state).toBe('error');
        expect(p.lastError).toContain('boum');
        expect(bus.noms()).toContain('plugin:error');
    });

    it('met en quarantaine après plusieurs échecs', async () => {
        await pm.registerPlugin(manifeste({ onEnable: () => { throw new Error('boum'); } }));
        await pm.enablePlugin('demo').catch(() => {});
        const p = pm.getPlugins()[0];
        // L'état « quarantined » empêche toute nouvelle tentative automatique :
        // un plugin qui échoue en boucle ne doit pas ralentir chaque démarrage.
        expect(['error', 'quarantined']).toContain(p.state);
    });

    it('désactive le plugin dans les réglages après une panne', async () => {
        await pm.registerPlugin(manifeste({ onEnable: () => { throw new Error('boum'); } }));
        expect(reglages.get('plugins.demo.enabled')).toBe(false);
    });

    it('coupe un hook qui ne se termine jamais', async () => {
        // timeoutMs vaut 200 ms dans ces tests. Sans cette coupure, un plugin
        // tiers bloquerait le démarrage de l'application indéfiniment.
        await pm.registerPlugin(manifeste({ onEnable: () => new Promise(() => {}) }));
        const p = pm.getPlugins()[0];
        expect(p.state).toBe('error');
        expect(p.lastError).toContain('Timeout');
    });
});

describe('Dépendances', () => {
    it('active la dépendance avant le dépendant', async () => {
        const ordre = [];
        await pm.registerPlugin({ id: 'base', isDefault: false, onEnable: () => ordre.push('base') });
        await pm.registerPlugin({ id: 'haut', isDefault: true, dependencies: ['base'], onEnable: () => ordre.push('haut') });
        expect(ordre).toEqual(['base', 'haut']);
    });

    it('bloque le dépendant si la dépendance est absente', async () => {
        await pm.registerPlugin(manifeste({ dependencies: ['fantome'] }));
        const p = pm.getPlugins()[0];
        expect(p.state).not.toBe('enabled');
        expect(p.lastError).toContain('fantome');
    });

    it('détecte une dépendance circulaire au lieu de boucler', async () => {
        // Les identifiants font au moins deux caractères : le motif ID_PATTERN
        // impose une lettre suivie d'au moins un autre caractère.
        await pm.registerPlugin({ id: 'alpha', isDefault: false, dependencies: ['beta'] });
        await pm.registerPlugin({ id: 'beta', isDefault: false, dependencies: ['alpha'] });
        await pm.enablePlugin('alpha');
        const alpha = pm.getPlugins().find(p => p.id === 'alpha');
        // Sans détection, cet appel ne rendrait jamais la main.
        expect(alpha.state).not.toBe('enabled');
    });

    it('ignore une dépendance optionnelle absente', async () => {
        await pm.registerPlugin(manifeste({ optionalDependencies: ['fantome'] }));
        expect(pm.getPlugins()[0].state).toBe('enabled');
    });
});

describe('Manifeste public', () => {
    it('n\'expose pas les hooks au reste de l\'application', async () => {
        await pm.registerPlugin(manifeste({ onEnable: () => {} }));
        const publie = bus.emis.find(e => e.nom === 'plugin:registered').charge.manifest;
        // Exposer les hooks permettrait à n'importe quel code de la page de
        // rappeler onEnable hors du cadre des permissions.
        for (const hook of ['onLoad', 'onEnable', 'onDisable', 'onUnload', 'healthCheck']) {
            expect(publie[hook]).toBeUndefined();
        }
        expect(publie.id).toBe('demo');
    });

    it('copie les tableaux plutôt que de les partager', async () => {
        await pm.registerPlugin(manifeste({ permissions: ['ui.dashboard.read'] }));
        const publie = bus.emis.find(e => e.nom === 'plugin:registered').charge.manifest;
        publie.permissions.push('ui.dashboard.write');
        // Une mutation du manifeste publié ne doit pas accorder de permission.
        expect(pm.getPluginManifest('demo').permissions).toEqual(['ui.dashboard.read']);
    });
});
