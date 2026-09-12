/**
 * @vitest-environment jsdom
 *
 * Honnêteté des données affichées.
 *
 * Un audit a relevé dix-sept endroits où l'interface AFFIRMAIT quelque chose
 * que le code n'avait pas mesuré : un temps restant calculé en supposant que
 * tout média dure 120 minutes, des séries quelconques présentées comme des
 * animés, « tous les sous-titres sont synchronisés » produit par un appel
 * réseau échoué, des pourcentages de genres dont le dénominateur était la
 * somme des cinq premiers.
 *
 * Ces défauts ont un point commun : ils ne provoquent aucune erreur. Rien ne
 * plante, rien n'apparaît dans la console — l'écran est simplement faux. Seul
 * un test qui vérifie la VALEUR peut les attraper.
 *
 * Règle commune que ces tests figent : `0` et `null` ne sont pas
 * interchangeables. « zéro mesuré » et « rien mesuré » doivent produire deux
 * affichages différents.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TIC = 10000000;   // 1 seconde en « ticks » Jellyfin

beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('Temps restant d\'un média', () => {
    it('se calcule sur la vraie durée, pas sur 120 minutes supposées', async () => {
        const { default: CardBuilder } = await import('../ui/components/CardBuilder.js');
        const cb = new CardBuilder();
        const conteneur = document.createElement('div');

        // Épisode de 22 minutes, vu à la moitié → il reste 11 minutes.
        // L'ancienne formule — (100 − %) × 1,2 — donnait 60.
        cb.renderGrid(conteneur, [{
            Id: 'ep1', Name: 'Épisode', Type: 'Episode',
            RunTimeTicks: 22 * 60 * TIC,
            UserData: { PlayedPercentage: 50, PlaybackPositionTicks: 11 * 60 * TIC },
        }]);
        const texte = conteneur.textContent || '';
        expect(texte).toContain('11 min');
        expect(texte, 'la durée forfaitaire de 120 min est revenue').not.toContain('60 min');
    });

    it('n\'affiche aucune durée quand le serveur ne l\'a pas fournie', async () => {
        const { default: CardBuilder } = await import('../ui/components/CardBuilder.js');
        const cb = new CardBuilder();
        const conteneur = document.createElement('div');
        cb.renderGrid(conteneur, [{
            Id: 'x', Name: 'Sans durée', Type: 'Movie',
            UserData: { PlayedPercentage: 40 },   // ni RunTimeTicks ni position
        }]);
        expect(conteneur.textContent || '').not.toMatch(/\d+\s*min/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Bazarr — « zéro manquant » n\'est pas « je n\'ai pas pu demander »', () => {
    async function service(reponses) {
        const { BazarrService } = await import('../integrations/bazarr/BazarrService.js')
            .then(m => ({ BazarrService: m.BazarrService || m.default }));
        const s = new BazarrService();
        s.api = reponses;
        s._cache = null;
        return s;
    }

    it('marque la mesure comme absente quand le serveur ne répond pas', async () => {
        const s = await service({
            getWantedMovies: async () => { throw new Error('ECONNREFUSED'); },
            getWantedEpisodes: async () => { throw new Error('ECONNREFUSED'); },
        });
        const bilan = await s.getWantedSummary();
        expect(bilan.mesure).toBe(false);
        // Le point central : surtout PAS 0, qui vaudrait « tout est à jour ».
        expect(bilan.totalWanted).toBeNull();
        expect(bilan.erreur).toBeTruthy();
    });

    it('rapporte un vrai zéro comme un zéro', async () => {
        const s = await service({
            getWantedMovies: async () => ({ data: [], total: 0 }),
            getWantedEpisodes: async () => ({ data: [], total: 0 }),
        });
        const bilan = await s.getWantedSummary();
        expect(bilan.mesure).toBe(true);
        expect(bilan.totalWanted).toBe(0);
    });

    it('utilise le total du serveur, pas la longueur de la page', async () => {
        // 500 manquants, dont 200 renvoyés : afficher « 200 » serait faux.
        const s = await service({
            getWantedMovies: async () => ({ data: new Array(200).fill({}), total: 500 }),
            getWantedEpisodes: async () => ({ data: [], total: 0 }),
        });
        expect((await s.getWantedSummary()).totalWanted).toBe(500);
    });

    it('n\'affirme pas l\'authentification d\'un fournisseur muet', async () => {
        const s = await service({ getProviders: async () => [{ name: 'OpenSubtitles' }] });
        const [p] = await s.getProvidersStatus();
        expect(p.authenticated, 'un silence était compté comme un oui').toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Prowlarr — l\'absence de statut n\'est pas la santé', () => {
    async function service({ indexeurs, statutsLevent }) {
        const mod = await import('../integrations/prowlarr/ProwlarrService.js');
        const S = mod.ProwlarrService || mod.default;
        const s = new S();
        s.getAllIndexers = async () => indexeurs;
        s.api = {
            getIndexerStatuses: async () => {
                if (statutsLevent) throw new Error('403');
                return [];
            },
        };
        return s;
    }

    it('ne déclare rien « en ligne » quand il n\'a pas pu lire les statuts', async () => {
        const s = await service({
            indexeurs: [{ id: 1, name: 'A', enable: true }, { id: 2, name: 'B', enable: true }],
            statutsLevent: true,
        });
        const bilan = await s.getHealthSummary();
        expect(bilan.statutsFiables).toBe(false);
        expect(bilan.healthy, '2 indexeurs certifiés sains sans aucune donnée').toBe(0);
        expect(bilan.indexers.every(i => i.status === 'Inconnu')).toBe(true);
    });

    it('compte les indexeurs sains quand les statuts sont lisibles', async () => {
        const s = await service({
            indexeurs: [{ id: 1, name: 'A', enable: true }],
            statutsLevent: false,
        });
        const bilan = await s.getHealthSummary();
        expect(bilan.statutsFiables).toBe(true);
        expect(bilan.healthy).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Statistiques de médiathèque', () => {
    async function stats(items, { leve = false } = {}) {
        const mod = await import('../jellyfin/analytics/MediaAnalyticsService.js');
        const S = mod.MediaAnalyticsService || mod.default;
        window.SpaceHub = window.SpaceHub || {};
        window.SpaceHub.jellyfin = window.SpaceHub.jellyfin || {};
        window.SpaceHub.jellyfin.api = {
            getItemsWithTotal: async () => {
                if (leve) throw new Error('503 Service Unavailable');
                return { items };
            },
        };
        const s = new S();
        s._cachedStats = null;
        s._lastCalculated = 0;
        return s.getStats();
    }

    it('ne compte dans les genres que ce qui a été REGARDÉ', async () => {
        const r = await stats([
            { Type: 'Movie', RunTimeTicks: 60 * TIC, Genres: ['Horreur'], UserData: { Played: true } },
            // Jamais vus : ils ne disent rien des goûts de l'utilisateur.
            { Type: 'Movie', RunTimeTicks: 60 * TIC, Genres: ['Comédie'], UserData: {} },
            { Type: 'Movie', RunTimeTicks: 60 * TIC, Genres: ['Comédie'], UserData: {} },
            { Type: 'Movie', RunTimeTicks: 60 * TIC, Genres: ['Comédie'], UserData: {} },
        ]);
        expect(r.mesure).toBe(true);
        expect(r.topGenres.map(g => g.name)).toEqual(['Horreur']);
    });

    it('rapporte des pourcentages qui sont de vraies parts', async () => {
        // 8 visionnages : 4 Action, 2 Drame, 1 Polar, 1 Science-fiction.
        const vu = (genre) => ({ Type: 'Movie', RunTimeTicks: 60 * TIC, Genres: [genre], UserData: { Played: true } });
        const r = await stats([
            vu('Action'), vu('Action'), vu('Action'), vu('Action'),
            vu('Drame'), vu('Drame'), vu('Polar'), vu('Science-fiction'),
        ]);
        const action = r.topGenres.find(g => g.name === 'Action');
        // 4/8 = 50 %, 2/8 = 25 %, 1/8 = 13 % (arrondi). Le dénominateur est
        // le total réel des occurrences, pas la somme du top 5.
        expect(action.percentage).toBe(50);
        expect(r.topGenres.find(g => g.name === 'Drame').percentage).toBe(25);
        expect(r.topGenres.find(g => g.name === 'Polar').percentage).toBe(13);
        // La somme reste au voisinage de 100 (aux arrondis près) au lieu d'y
        // être forcée par construction — c'était tout le défaut : avec plus de
        // cinq genres, l'ancien calcul ramenait TOUJOURS le total à 100 et
        // gonflait chaque part en proportion.
        const somme = r.topGenres.reduce((a, g) => a + g.percentage, 0);
        expect(Math.abs(somme - 100)).toBeLessThanOrEqual(3);
    });

    it('distingue une médiathèque vide d\'un serveur qui n\'a pas répondu', async () => {
        const vide = await stats([]);
        expect(vide.mesure).toBe(true);

        const panne = await stats([], { leve: true });
        expect(panne.mesure).toBe(false);
        expect(panne.erreur).toBeTruthy();
        // Le défaut d'origine : cet objet de zéros s'affichait comme
        // « 0 h · 0 films · 0 épisodes · 0 % 4K ».
        expect(panne.totalWatchTimeHours).toBe(0);
        expect(panne.mesure, 'des zéros présentés comme une mesure').not.toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SDK — ne pas confirmer ce qui n\'a pas eu lieu', () => {
    it('registerModule renvoie faux quand le module est refusé', async () => {
        const { default: ModuleManager } = await import('../core/ModuleManager.js');
        const mm = new ModuleManager();

        expect(mm.register({ id: 'alpha' })).toBe(true);
        expect(mm.register({ id: 'alpha' }), 'doublon accepté').toBe(false);
        expect(mm.register({}), 'module sans id accepté').toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Note presse — une icône est une AFFIRMATION', () => {
    /**
     * LE DÉFAUT, ET POURQUOI IL A SURVÉCU À CE FICHIER.
     *
     * `getRtIconSvg` gardait avec `!Number.isFinite(Number(score))`. Or
     * `Number(null)` vaut ZÉRO, et zéro est fini : le garde ne se déclenchait
     * donc jamais pour `null`, c'est-à-dire pour le cas normal d'un titre sans
     * note presse. L'exécution tombait dans la branche finale et rendait le
     * tomate POURRI.
     *
     * Sur la fiche média, l'ironie était complète : le badge, le score, la
     * phrase et la source étaient tous correctement conditionnés — la phrase
     * disait même « Aucune note presse disponible pour ce titre » — et seule
     * l'icône restait allumée, juste à côté.
     *
     * C'est exactement la règle que ce fichier existe pour tenir, appliquée à
     * une icône plutôt qu'à un nombre : une image de tomate pourrie est une
     * affirmation sur la qualité d'un film, au même titre qu'un pourcentage.
     */
    const rendre = async (score) => {
        const { default: CardBuilder } = await import('../ui/components/CardBuilder.js');
        return new CardBuilder().getRtIconSvg(score);
    };

    it('ne rend AUCUNE icône quand la note est absente', async () => {
        for (const absent of [null, undefined, '', NaN]) {
            const html = await rendre(absent);
            expect(html, String(absent)).toContain('sh-score-placeholder');
            expect(html, String(absent)).not.toContain('<svg');
        }
    });

    it('ne rend pas un tomate POURRI pour une note absente', async () => {
        // La contre-épreuve précise du défaut : `null` tombait dans la branche
        // « score < 60 », celle du splat rouge.
        const html = await rendre(null);
        expect(html).not.toMatch(/svg/i);
    });

    it('rend bien une icône quand la note existe', async () => {
        for (const [note, attendu] of [[92, true], [65, true], [12, true], [0, true]]) {
            const html = await rendre(note);
            expect(html.includes('<svg'), `note ${note}`).toBe(attendu);
        }
    });

    it('distingue une note de zéro d\'une note absente', async () => {
        // Zéro pour cent EST une note : un film unanimement éreinté. Il doit
        // s'afficher. C'est `null` qui ne doit rien afficher.
        expect(await rendre(0)).toContain('<svg');
        expect(await rendre(null)).toContain('sh-score-placeholder');
    });
});
