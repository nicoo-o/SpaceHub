/**
 * @vitest-environment jsdom
 *
 * Les gabarits, appelés comme les composants les appellent.
 *
 * Deuxième leçon de la même famille que `NavigationDeplacementReel`. Les tests
 * d'identité (`gabarits.test.js`) vérifient que chaque module produit le bon
 * HTML — et ils sont justes. Mais ils lui passent un objet littéral construit
 * pour l'occasion, avec `_escape` posé dessus en propriété propre.
 *
 * Or les composants ne font pas cela. Ils appelaient :
 *
 *     gabaritFeuille({ ...this, item, title, … })
 *
 * et la décomposition ne copie que les propriétés PROPRES et énumérables. Or
 * `_escape` est une MÉTHODE, donc portée par le prototype de la classe : elle
 * disparaissait. Ouvrir la fiche d'un média plantait aussitôt sur
 * « TypeError: _escape is not a function », et l'application devenait
 * inutilisable à la souris.
 *
 * Un gabarit testé avec un contexte que personne ne lui passe n'est pas testé.
 * Les tests ci-dessous reproduisent la construction RÉELLE du contexte, avec
 * `_escape` là où il se trouve vraiment : sur le prototype.
 */

import { describe, it, expect } from 'vitest';
import { contexteGabarit, escapeHtml } from '../core/utils/domUtils.js';

import { gabaritLecteur } from '../jellyfin/player/VideoPlayer.template.js';
import { gabaritBibliotheque } from '../ui/views/LibraryView.template.js';
import { gabaritFeuille } from '../ui/components/ModalSlideUpSheet.template.js';
import { gabaritConsoleModules } from '../ui/views/JellyfinConsoleModal.template.js';

/**
 * Un composant comme les vrais : `_escape` sur le PROTOTYPE, les champs d'état
 * en propriétés propres. C'est la forme exacte que les gabarits reçoivent.
 */
class ComposantFactice {
    constructor(etat = {}) {
        Object.assign(this, etat);
    }
    _escape(v) { return escapeHtml(v); }
}

/** Valeur neutre tolérante, pour les variables locales non fournies. */
function neutre(nom) {
    const p = new Proxy(function () { return `«${nom}»`; }, {
        get(cible, cle) {
            if (cle === Symbol.toPrimitive || cle === 'toString' || cle === 'valueOf') {
                return () => `«${nom}»`;
            }
            if (cle === 'length' || cle === 'size') return 0;
            if (cle === Symbol.iterator) return [][Symbol.iterator].bind([]);
            if (cle === 'map' || cle === 'filter' || cle === 'slice') return () => [];
            if (cle === 'join') return () => '';
            if (typeof cle === 'symbol') return cible[cle];
            return p;
        },
        apply: () => p,
    });
    return p;
}

function avec(noms) {
    const o = {};
    for (const n of noms) o[n] = neutre(n);
    return o;
}

describe('Le contexte passé aux gabarits conserve les méthodes du composant', () => {
    it('contexteGabarit garde _escape accessible', () => {
        const composant = new ComposantFactice({ _activeTab: 'apercu' });
        const ctx = contexteGabarit(composant, { title: 'Un <titre>' });

        expect(typeof ctx._escape).toBe('function');
        expect(ctx._escape('<a>')).toBe('&lt;a&gt;');
        expect(ctx.title).toBe('Un <titre>');
        expect(ctx._activeTab).toBe('apercu');
    });

    it('la décomposition, elle, la PERD — c\'est exactement le bogue', () => {
        // Ce test documente la cause. S'il se met à passer, c'est que le
        // langage a changé, pas que le code est devenu correct.
        const composant = new ComposantFactice();
        const decompose = { ...composant };
        expect(decompose._escape).toBeUndefined();
    });

    it('les locales priment sur les champs du composant', () => {
        const composant = new ComposantFactice({ title: 'depuis le composant' });
        const ctx = contexteGabarit(composant, { title: 'depuis la locale' });
        expect(ctx.title).toBe('depuis la locale');
    });
});

describe('Chaque gabarit s\'exécute avec un contexte réel', () => {
    it('VideoPlayer.template.js', () => {
        const composant = new ComposantFactice({
            _volume: 0.8, _playbackRate: 1, _subOffset: 0, _aspectRatioIndex: 0,
        });
        const ctx = contexteGabarit(composant,
            avec(['isEpisode', 'seriesName', 'episodeNumber', 'episodeTitle', 'title', 'year']));
        expect(() => gabaritLecteur(ctx)).not.toThrow();
        expect(gabaritLecteur(ctx)).toContain('<div');
    });

    it('LibraryView.template.js', () => {
        const composant = new ComposantFactice({
            _searchQuery: '', _sortBy: 'SortName', _sortOrder: 'Ascending',
            _viewMode: 'grid', _activeGenre: null, _activeStatus: null,
            _alphabetFilter: null,
        });
        const ctx = contexteGabarit(composant);
        expect(() => gabaritBibliotheque(ctx)).not.toThrow();
    });

    it('ModalSlideUpSheet.template.js — celui qui plantait', () => {
        const composant = new ComposantFactice({ _activeTab: 'apercu' });
        const ctx = contexteGabarit(composant, avec([
            'item', 'title', 'year', 'rating', 'overview', 'genres', 'duration',
            'backBtnLabel', 'cardBuilder', 'rtScore', 'imdbScore', 'has4K',
            'hasAtmos', 'hasDolbyVision', 'isEpisode', 'isSeries', 'isMusic',
            'isCollection', 'isCalendarOrServarr', 'safeBackdropUrl', 'safePosterUrl',
        ]));
        expect(() => gabaritFeuille(ctx)).not.toThrow();
        expect(gabaritFeuille(ctx)).toContain('<div');
    });

    it('JellyfinConsoleModal.template.js', () => {
        const composant = new ComposantFactice();
        const ctx = contexteGabarit(composant,
            avec(['sdkPlugins', 'servarrIntegrations', 'serverPlugins', 'settings', 'svc']));
        expect(() => gabaritConsoleModules(ctx)).not.toThrow();
    });
});
