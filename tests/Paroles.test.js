/**
 * Paroles synchronisées.
 *
 * TROIS ERREURS QUI DONNENT LE MÊME SYMPTÔME : « les paroles ne bougent pas ».
 *
 * 1. Comparer des ticks à des secondes. La première ligne est alors « en
 *    retard » de 116 jours et le morceau finit avant qu'elle n'arrive.
 * 2. Découper la ligne sur les espaces pour l'apparier aux `Cues`. Le champ
 *    `Position` est un indice de CARACTÈRE : à la première virgule, tout se
 *    décale d'un mot et ne se rattrape plus.
 * 3. Traiter `End: null` comme une fin à zéro. Le dernier mot ne s'allume
 *    jamais, et sur la dernière ligne d'un morceau, plus rien ne s'allume.
 *
 * Aucune de ces trois erreurs ne produit d'exception. Elles se voient à l'œil,
 * en écoutant — ou dans ces tests.
 */

import { describe, it, expect, vi } from 'vitest';
import Paroles, { TICKS_PAR_SECONDE } from '../jellyfin/musique/Paroles.js';

const t = (secondes) => Math.round(secondes * TICKS_PAR_SECONDE);

/** Réponse type du serveur : deux lignes, la seconde découpée au mot. */
const REPONSE = {
    Lyrics: [
        { Text: 'Premiere ligne', Start: t(10), End: t(14), Cues: [] },
        {
            Text: "Salut, c'est moi",
            Start: t(14),
            End: t(20),
            // « Salut, » = 7 caractères ; « c'est » commence à 7 ; « moi » à 13.
            Cues: [
                { Start: t(14), End: t(15), Position: 0 },
                { Start: t(16), End: t(17), Position: 7 },
                { Start: t(18), End: null, Position: 13 },
            ],
        },
    ],
};

function fabriquer(reponse = REPONSE) {
    const get = vi.fn(async () => reponse);
    return { paroles: new Paroles({ api: { get } }), get };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('Paroles — le chargement', () => {
    it('interroge le bon point d\'entrée', async () => {
        const { paroles, get } = fabriquer();
        await paroles.charger('morceau-1');
        expect(get).toHaveBeenCalledWith('/Audio/morceau-1/Lyrics');
    });

    it('convertit les ticks en secondes', async () => {
        const { paroles } = fabriquer();
        await paroles.charger('m');
        // CONTRE-ÉPREUVE : sans conversion, `debut` vaudrait 100 000 000 —
        // soit 116 jours, jamais atteints par un morceau de trois minutes.
        expect(paroles.lignes()[0].debut).toBe(10);
        expect(paroles.lignes()[1].debut).toBe(14);
    });

    it('traite l\'absence de paroles comme un cas normal', async () => {
        const paroles = new Paroles({ api: { get: vi.fn(async () => { throw new Error('404'); }) } });
        // La plupart des morceaux n'ont pas de paroles : le serveur répond 404.
        await expect(paroles.charger('m')).resolves.toBe(false);
        expect(paroles.disponibles).toBe(false);
    });

    it('remet les lignes dans l\'ordre', async () => {
        const { paroles } = fabriquer({
            Lyrics: [
                { Text: 'Troisieme', Start: t(30) },
                { Text: 'Premiere', Start: t(10) },
                { Text: 'Deuxieme', Start: t(20) },
            ],
        });
        await paroles.charger('m');
        // Un fichier LRC bricolé à la main n'est pas forcément trié : les
        // paroles sauteraient en avant puis en arrière.
        expect(paroles.lignes().map(l => l.texte)).toEqual(['Premiere', 'Deuxieme', 'Troisieme']);
    });

    it('écarte une ligne sans temps plutôt que de la caler à zéro', async () => {
        const { paroles } = fabriquer({
            Lyrics: [{ Text: 'Sans temps' }, { Text: 'Avec temps', Start: t(5) }],
        });
        await paroles.charger('m');
        // Une ligne à `debut: 0` s'afficherait dès la première seconde de tous
        // les morceaux.
        expect(paroles.lignes()).toHaveLength(1);
        expect(paroles.lignes()[0].texte).toBe('Avec temps');
    });

    it('reconnaît un découpage au mot', async () => {
        const { paroles } = fabriquer();
        await paroles.charger('m');
        expect(paroles.auMot).toBe(true);

        const { paroles: sansMot } = fabriquer({ Lyrics: [{ Text: 'Une ligne', Start: t(1) }] });
        await sansMot.charger('m');
        expect(sansMot.auMot).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Paroles — quelle ligne', () => {
    it('n\'en désigne aucune avant la première', async () => {
        const { paroles } = fabriquer();
        await paroles.charger('m');
        expect(paroles.ligneA(0)).toBe(-1);
        expect(paroles.ligneA(9.9)).toBe(-1);
    });

    it('suit la lecture', async () => {
        const { paroles } = fabriquer();
        await paroles.charger('m');
        expect(paroles.ligneA(10)).toBe(0);
        expect(paroles.ligneA(13.9)).toBe(0);
        expect(paroles.ligneA(14)).toBe(1);
        expect(paroles.ligneA(19.9)).toBe(1);
    });

    it('n\'affiche plus rien après la fin de la dernière ligne', async () => {
        const { paroles } = fabriquer();
        await paroles.charger('m');
        // Un long instrumental final ne doit pas laisser la dernière phrase
        // allumée pendant deux minutes.
        expect(paroles.ligneA(25)).toBe(-1);
    });

    it('garde la dernière ligne quand le serveur ne donne pas de fin', async () => {
        const { paroles } = fabriquer({ Lyrics: [{ Text: 'Fin ouverte', Start: t(10) }] });
        await paroles.charger('m');
        expect(paroles.ligneA(999)).toBe(0);
    });

    it('retombe sur ses pieds après un saut en arrière', async () => {
        const { paroles } = fabriquer();
        await paroles.charger('m');
        expect(paroles.ligneA(19)).toBe(1);
        // Le cache d'indice ne doit pas empêcher de revenir en arrière : c'est
        // exactement ce que fait quelqu'un qui veut réécouter un passage.
        expect(paroles.ligneA(11)).toBe(0);
        expect(paroles.ligneA(19)).toBe(1);
    });

    it('ne désigne rien quand il n\'y a pas de paroles', async () => {
        const paroles = new Paroles({ api: null });
        expect(paroles.ligneA(10)).toBe(-1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Paroles — quels caractères sont chantés', () => {
    it('découpe la ligne aux POSITIONS annoncées, pas aux espaces', async () => {
        const { paroles } = fabriquer();
        await paroles.charger('m');
        const ligne = paroles.lignes()[1];
        expect(ligne.texte).toBe("Salut, c'est moi");

        // Avant le premier mot : rien.
        expect(paroles.caracteresChantes(1, 13.9)).toBe(0);
        // « Salut, » chanté → révélé jusqu'au début du repère suivant, soit 7.
        expect(paroles.caracteresChantes(1, 14)).toBe(7);
        expect(ligne.texte.slice(0, 7)).toBe('Salut, ');
        // Puis « c'est » → 13.
        expect(paroles.caracteresChantes(1, 16)).toBe(13);
        expect(ligne.texte.slice(0, 13)).toBe("Salut, c'est ");
        // Enfin « moi » → toute la ligne, malgré End: null.
        expect(paroles.caracteresChantes(1, 18)).toBe(ligne.texte.length);
    });

    it('CONTRE-ÉPREUVE : un découpage sur les espaces se décale', async () => {
        const { paroles } = fabriquer();
        await paroles.charger('m');
        const ligne = paroles.lignes()[1];
        // Le deuxième « mot » au sens des espaces est « c'est » ; sa position
        // dans la ligne est 7. Un code qui apparie Cues[i] au i-ème mot séparé
        // par des espaces révélerait 5 caractères (« Salut ») au lieu de 7 —
        // la virgule reste éteinte, et l'écart grandit à chaque ponctuation.
        const naif = ligne.texte.split(' ')[0].length;   // 6 : « Salut, »
        expect(naif).not.toBe(paroles.caracteresChantes(1, 14));
    });

    it('révèle tout d\'un coup une ligne sans découpage au mot', async () => {
        const { paroles } = fabriquer();
        await paroles.charger('m');
        // -1 = « pas de découpage » : l'affichage allume la ligne entière.
        // Renvoyer 0 la laisserait éteinte, renvoyer sa longueur ferait croire
        // à un karaoké instantané.
        expect(paroles.caracteresChantes(0, 12)).toBe(-1);
    });

    it('ne révèle rien pour une ligne inexistante', async () => {
        const { paroles } = fabriquer();
        await paroles.charger('m');
        expect(paroles.caracteresChantes(99, 12)).toBe(0);
        expect(paroles.caracteresChantes(-1, 12)).toBe(0);
    });

    it('remet les repères dans l\'ordre des positions', async () => {
        const { paroles } = fabriquer({
            Lyrics: [{
                Text: 'un deux trois',
                Start: t(0),
                Cues: [
                    { Start: t(2), Position: 8 },
                    { Start: t(0), Position: 0 },
                    { Start: t(1), Position: 3 },
                ],
            }],
        });
        await paroles.charger('m');
        expect(paroles.caracteresChantes(0, 0)).toBe(3);
        expect(paroles.caracteresChantes(0, 1)).toBe(8);
        expect(paroles.caracteresChantes(0, 2)).toBe(13);
    });

    it('oublie tout au changement de morceau', async () => {
        const { paroles } = fabriquer();
        await paroles.charger('m');
        expect(paroles.disponibles).toBe(true);
        paroles.reinitialiser();
        expect(paroles.disponibles).toBe(false);
        expect(paroles.ligneA(14)).toBe(-1);
    });
});
