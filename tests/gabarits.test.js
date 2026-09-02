/**
 * Gabarits extraits — preuve d'identité octet pour octet.
 *
 * Quatre gros littéraux HTML ont été sortis de leur composant vers un module
 * dédié. C'est mécanique par construction (seule transformation appliquée au
 * texte : `this.` → `ctx.`), mais « mécanique » n'est pas « prouvé ».
 *
 * Ces tests comparent le HTML produit par les modules extraits à une empreinte
 * prise sur le code ORIGINAL, avant tout déplacement, avec un jeu de valeurs
 * fixe. `tests/fixtures/gabarits-reference.json` est cette empreinte : elle a
 * été générée depuis les littéraux d'origine, pas depuis les modules.
 *
 * Si un caractère change, ces tests tombent.
 */

import { describe, it, expect } from 'vitest';
import reference from './fixtures/gabarits-reference.json';
import { echapper, avecNeutres } from './helpers/neutre.js';

import { gabaritLecteur } from '../jellyfin/player/VideoPlayer.template.js';
import { gabaritBibliotheque } from '../ui/views/LibraryView.template.js';
import { gabaritFeuille } from '../ui/components/ModalSlideUpSheet.template.js';
import { gabaritConsoleModules } from '../ui/views/JellyfinConsoleModal.template.js';

describe('Gabarits extraits — le HTML n\'a pas bougé d\'un octet', () => {
    it('VideoPlayer.template.js', () => {
        const attendu = reference['jellyfin/player/VideoPlayer.js'];
        const html = gabaritLecteur(avecNeutres({
            _escape: echapper, _volume: 0.8, _playbackRate: 1.25,
            _subOffset: -0.5, _aspectRatioIndex: 2,
            title: 'Le <Titre> & "Cie"', isEpisode: true, seriesName: 'Ma <Serie> & Co',
            episodeNumber: 'S02E07', episodeTitle: "L'<Episode> & suite", year: 2019,
        }, attendu.variablesLibres));
        expect(html).toBe(attendu.html);
    });

    it('LibraryView.template.js', () => {
        const attendu = reference['ui/views/LibraryView.js'];
        const html = gabaritBibliotheque(avecNeutres({
            _escape: echapper, _searchQuery: 'que<te & "x"',
            _sortBy: 'SortName,ProductionYear', _sortOrder: 'Descending',
            _viewMode: 'grid', _activeGenre: 'Dra<me', _activeStatus: 'vu',
            _alphabetFilter: 'M',
        }, attendu.variablesLibres));
        expect(html).toBe(attendu.html);
    });

    it('ModalSlideUpSheet.template.js', () => {
        const attendu = reference['ui/components/ModalSlideUpSheet.js'];
        const html = gabaritFeuille(avecNeutres({
            _escape: echapper, _activeTab: 'apercu',
        }, attendu.variablesLibres));
        expect(html).toBe(attendu.html);
    });

    it('JellyfinConsoleModal.template.js — identique, aux deux échappements ajoutés près', () => {
        // Ce gabarit est le seul à différer de son état d'origine, et la
        // différence est voulue : `mod.icon` et `mod.name` partaient en HTML
        // sans échappement. Plutôt que d'accepter une divergence vague, le
        // test la nomme — il applique l'échappement attendu à la référence et
        // exige une égalité stricte ensuite. Toute AUTRE différence tombe.
        const attendu = reference['ui/views/JellyfinConsoleModal.js'];
        const html = gabaritConsoleModules(avecNeutres({
            _escape: echapper,
        }, attendu.variablesLibres));

        let corrigee = attendu.html;
        for (const i of [0, 1]) {
            for (const champ of ['icon', 'name']) {
                const brut = `<&"servarrIntegrations[${i}].${champ}">`;
                corrigee = corrigee.split(brut).join(echapper(brut));
            }
        }
        expect(html).toBe(corrigee);
    });
});

describe('Les modules de gabarit restent purs', () => {
    it('ne produisent que du texte, sans toucher au DOM', () => {
        // `document` n'existe pas dans cet environnement de test : si un
        // gabarit tentait de lire ou d'ecrire le DOM, l'appel echouerait ici.
        const html = gabaritBibliotheque(avecNeutres({
            _escape: echapper, _searchQuery: '', _sortBy: 'SortName',
            _sortOrder: 'Ascending', _viewMode: 'grid', _activeGenre: null,
            _activeStatus: null, _alphabetFilter: null,
        }, reference['ui/views/LibraryView.js'].variablesLibres));
        expect(typeof html).toBe('string');
        expect(html.length).toBeGreaterThan(1000);
        expect(typeof document).toBe('undefined');
    });
});
