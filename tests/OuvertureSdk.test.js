/**
 * @vitest-environment jsdom
 *
 * L'ouverture du SDK : inspection, contributions, réglages déclaratifs.
 *
 * CE QUE CES TROIS SUJETS ONT EN COMMUN : ils remplacent une promesse par une
 * vérification.
 *
 * L'inspection statique ne remplace pas un bac à sable — et ces tests le
 * disent, en vérifiant AUSSI ce qu'elle laisse passer. Un contrôle dont on
 * exagère la portée est plus dangereux qu'un contrôle absent : on cesse de s'en
 * méfier.
 *
 * Les contributions `adminPanel` et `module` étaient acceptées et n'avaient
 * aucun consommateur. Un greffon recevait un désabonnement parfaitement valide
 * pour un enregistrement qui ne faisait rien.
 *
 * Et le type `secret` d'un réglage a une règle qui n'est pas cosmétique :
 * laissé vide, il ne doit PAS effacer la clé enregistrée.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inspecter, expliquer, sansCommentairesNiChaines } from '../core/InspectionGreffon.js';
import { PluginManager } from '../core/PluginManager.js';
import { valider, construire, appliquer } from '../ui/components/ReglagesGreffon.js';

function reglagesFactices(initial = {}) {
    const store = { ...initial };
    return { store, get: (c, d) => (c in store ? store[c] : d), set: (c, v) => { store[c] = v; } };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('InspectionGreffon — ce qu\'elle refuse', () => {
    const cas = [
        ['sessionStorage', 'const t = sessionStorage.getItem("x");'],
        ['localStorage', 'localStorage.setItem("a", 1);'],
        ['document.cookie', 'const c = document.cookie;'],
        ['window.SpaceHub', 'const s = window.SpaceHub.core.ratingCache;'],
        ['fetch() global', 'await fetch("https://x.fr");'],
        ['eval()', 'eval("1+1");'],
        ['new Function()', 'const f = new Function("return 1");'],
        ['import() dynamique', 'await import("./autre.js");'],
        ['indexedDB', 'indexedDB.open("db");'],
        ['XMLHttpRequest', 'const x = new XMLHttpRequest();'],
    ];

    for (const [quoi, code] of cas) {
        it(`refuse ${quoi}`, () => {
            const res = inspecter(code);
            expect(res.propre).toBe(false);
            expect(res.infractions.some(i => i.quoi === quoi), expliquer(res.infractions)).toBe(true);
        });
    }

    it('nomme la porte légitime, pas seulement l\'interdit', () => {
        // Un refus qui ne dit pas quoi faire à la place est une impasse.
        const res = inspecter('await fetch("https://x.fr");');
        expect(res.infractions[0].porte).toContain('ctx.api.fetch');
    });

    it('donne le numéro de ligne', () => {
        const res = inspecter('const a = 1;\nconst b = 2;\nlocalStorage.clear();');
        expect(res.infractions[0].ligne).toBe(3);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('InspectionGreffon — ce qu\'elle NE refuse pas', () => {
    it('accepte ctx.api.fetch, qui contient pourtant le mot « fetch »', () => {
        // CONTRE-ÉPREUVE DU FAUX POSITIF : un motif `/fetch\s*\(/ ` naïf
        // refuserait la porte légitime elle-même, et le contrôle serait
        // inutilisable.
        expect(inspecter('await ctx.api.fetch("https://x.fr");').propre).toBe(true);
        expect(inspecter('const f = ctx.api.fetch;').propre).toBe(true);
    });

    it('accepte un commentaire qui NOMME l\'interdit', () => {
        // Un contrôle qui punit l'explication de sa propre règle pousse à
        // effacer l'explication.
        const code = `
            // N'utilisez jamais localStorage ici : passez par ctx.settings.
            /* window.SpaceHub est hors de portée d'un greffon. */
            export default {};
        `;
        expect(inspecter(code).propre).toBe(true);
    });

    it('accepte une CHAÎNE contenant l\'interdit', () => {
        expect(inspecter('ctx.log.info("évitez localStorage");').propre).toBe(true);
    });

    it('regarde DANS une interpolation de gabarit', () => {
        // Une chaîne est neutralisée, mais `${…}` contient du vrai code : le
        // masquer offrirait une cachette évidente.
        const res = inspecter('const u = `${window.SpaceHub.auth.getToken()}`;');
        expect(res.propre).toBe(false);
    });

    it('N\'ATTRAPE PAS un accès construit dynamiquement — et c\'est assumé', () => {
        // Ce test documente la LIMITE. Il passerait au vert si l'on prétendait
        // que l'inspection est un bac à sable ; il est là pour qu'on ne le
        // prétende pas.
        expect(inspecter("const s = window['Space' + 'Hub'];").propre).toBe(true);
    });

    it('neutralise les chaînes sans coller les identifiants voisins', () => {
        const code = sansCommentairesNiChaines('a("x")b');
        expect(code).not.toContain('ab');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PluginManager — les contributions mortes', () => {
    let pm;
    beforeEach(() => { pm = new PluginManager({ settings: reglagesFactices() }); });

    // UN IDENTIFIANT D'UN SEUL CARACTÈRE EST INVALIDE. Le motif exige deux
    // caractères au minimum, et la première version de ces tests utilisait
    // « a », « b », « c » : le refus attendu arrivait bien, mais pour la
    // mauvaise raison — l'identifiant, pas la contribution. Un test qui passe
    // pour une raison qu'on n'a pas choisie ne prouve rien.
    it('accepte les cinq types qui ont un consommateur', async () => {
        expect(await pm.registerPlugin({
            id: 'demo-cinq',
            contributions: ['widget', 'theme', 'route', 'metadataProvider', 'action'],
        })).toBe(true);
    });

    it('refuse un manifeste déclarant adminPanel ou module', async () => {
        // CONTRE-ÉPREUVE : ces deux types étaient acceptés et n'avaient aucun
        // consommateur. Un greffon obtenait un désabonnement valide pour un
        // enregistrement qui ne faisait rien, et rien ne le lui disait.
        expect(await pm.registerPlugin({ id: 'demo-admin', contributions: ['adminPanel'] })).toBe(false);
        expect(await pm.registerPlugin({ id: 'demo-module', contributions: ['module'] })).toBe(false);
        // …et le même greffon SANS ce type passe : la preuve que c'est bien la
        // contribution qui a été refusée, et rien d'autre.
        expect(await pm.registerPlugin({ id: 'demo-admin', contributions: [] })).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ReglagesGreffon — le schéma déclaratif', () => {
    const SCHEMA = [
        { cle: 'apiKey', type: 'secret', titre: 'Clé API' },
        { cle: 'langue', type: 'select', titre: 'Langue', defaut: 'fr',
          options: [{ valeur: 'fr', libelle: 'Français' }, { valeur: 'en', libelle: 'Anglais' }] },
        { cle: 'bavard', type: 'booleen', titre: 'Journal' },
        { cle: 'limite', type: 'nombre', titre: 'Limite', defaut: 10 },
        { cle: 'note', type: 'texte', titre: 'Note' },
    ];

    function stockageFactice(initial = {}) {
        const store = { ...initial };
        return { store, get: (c, d) => (c in store ? store[c] : d), set: (c, v) => { store[c] = v; } };
    }

    it('refuse un schéma bancal en ENTIER plutôt qu'
        + ' d\'en rendre la moitié', () => {
        expect(valider([{ cle: 'a', type: 'inconnu' }]).valide).toBe(false);
        expect(valider([{ cle: 'a', type: 'texte' }, { cle: 'a', type: 'texte' }]).valide).toBe(false);
        expect(valider([{ cle: '2mauvais', type: 'texte' }]).valide).toBe(false);
        expect(valider([{ cle: 'x', type: 'select' }]).valide).toBe(false);   // options absentes
        expect(construire({ pluginId: 'p', schema: [{ cle: 'a', type: 'inconnu' }], stockage: stockageFactice() }))
            .toBeNull();
    });

    it('construit un contrôle par champ', () => {
        const bloc = construire({ pluginId: 'p', schema: SCHEMA, stockage: stockageFactice() });
        expect(bloc.querySelector('#sh-gr-p-apiKey').type).toBe('password');
        expect(bloc.querySelector('#sh-gr-p-langue').tagName).toBe('SELECT');
        expect(bloc.querySelector('#sh-gr-p-bavard').type).toBe('checkbox');
        expect(bloc.querySelector('#sh-gr-p-limite').type).toBe('number');
        expect(bloc.querySelector('#sh-gr-p-note').type).toBe('text');
    });

    it('n\'écrit JAMAIS un secret dans le DOM', () => {
        const bloc = construire({
            pluginId: 'p', schema: SCHEMA,
            stockage: stockageFactice({ apiKey: 'CLE-TRES-SECRETE' }),
        });
        const champ = bloc.querySelector('#sh-gr-p-apiKey');
        // Un champ de mot de passe pré-rempli est lisible par l'inspecteur, le
        // gestionnaire de mots de passe et toute extension.
        expect(champ.value).toBe('');
        expect(bloc.outerHTML).not.toContain('CLE-TRES-SECRETE');
        expect(champ.placeholder).toMatch(/enregistrée/i);
    });

    it('un secret laissé vide N\'EFFACE PAS la clé', () => {
        const stockage = stockageFactice({ apiKey: 'CLE-EXISTANTE' });
        const bloc = construire({ pluginId: 'p', schema: SCHEMA, stockage });
        const bilan = appliquer(bloc, { schema: SCHEMA, stockage });

        // CONTRE-ÉPREUVE : sans cette règle, ouvrir puis fermer l'écran des
        // réglages effacerait la clé de l'utilisateur, sans un mot.
        expect(stockage.store.apiKey).toBe('CLE-EXISTANTE');
        expect(bilan.ignores).toContain('apiKey');
    });

    it('écrit un secret quand il est rempli', () => {
        const stockage = stockageFactice({ apiKey: 'ANCIENNE' });
        const bloc = construire({ pluginId: 'p', schema: SCHEMA, stockage });
        bloc.querySelector('#sh-gr-p-apiKey').value = '  NOUVELLE  ';
        appliquer(bloc, { schema: SCHEMA, stockage });
        expect(stockage.store.apiKey).toBe('NOUVELLE');
    });

    it('relit les valeurs existantes des champs non secrets', () => {
        const stockage = stockageFactice({ langue: 'en', bavard: true, limite: 42, note: 'salut' });
        const bloc = construire({ pluginId: 'p', schema: SCHEMA, stockage });
        expect(bloc.querySelector('#sh-gr-p-langue').value).toBe('en');
        expect(bloc.querySelector('#sh-gr-p-bavard').checked).toBe(true);
        expect(bloc.querySelector('#sh-gr-p-limite').value).toBe('42');
        expect(bloc.querySelector('#sh-gr-p-note').value).toBe('salut');
    });

    it('affiche les libellés par textContent, jamais par innerHTML', () => {
        const schema = [{ cle: 'a', type: 'texte', titre: '<img onerror=alert(1)>' }];
        const bloc = construire({ pluginId: 'p', schema, stockage: stockageFactice() });
        // Un libellé vient d'un greffon, c'est-à-dire de code tiers.
        expect(bloc.querySelector('img')).toBeNull();
        expect(bloc.querySelector('label').textContent).toBe('<img onerror=alert(1)>');
    });

    it('ignore un nombre non numérique plutôt que d\'écrire NaN', () => {
        const stockage = stockageFactice({ limite: 10 });
        const bloc = construire({ pluginId: 'p', schema: SCHEMA, stockage });
        bloc.querySelector('#sh-gr-p-limite').value = 'abc';
        appliquer(bloc, { schema: SCHEMA, stockage });
        expect(stockage.store.limite).toBe(10);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Les greffons livrés passent leur propre inspection', () => {
    it('le greffon de notes et celui d\'exemple sont propres', async () => {
        const { readFileSync } = await import('node:fs');
        for (const chemin of [
            'plugins/ratings/spacehub-ratings-plugin.js',
            'plugins/exemple/spacehub-exemple-plugin.js',
        ]) {
            const res = inspecter(readFileSync(chemin, 'utf8'));
            expect(res.propre, `${chemin} → ${expliquer(res.infractions)}`).toBe(true);
        }
    });
});
