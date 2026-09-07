/**
 * @vitest-environment jsdom
 *
 * Mode musique : radio d'artiste et écran de paroles.
 *
 * DEUX ÉCHECS SILENCIEUX, ENCORE.
 *
 * `/Items/{id}/InstantMix` sans `UserId` répond `{ Items: [] }` — pas un 400,
 * pas un message : une liste vide. Le bouton « radio » semble ne rien faire, et
 * rien dans une console ne l'explique.
 *
 * L'écran de paroles, lui, échoue par le coût : un karaoké qui recrée ses nœuds
 * ou remet la ligne en page à chaque mot tombe à quelques images par seconde sur
 * un téléviseur de 2020, pendant que le son continue. On vérifie donc ce qu'on
 * peut vérifier sans mesurer : que la structure est posée UNE fois, et que la
 * boucle ne touche au DOM que lorsque quelque chose a changé.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RadioArtiste, { LIMITE_DEFAUT } from '../jellyfin/musique/RadioArtiste.js';
import Paroles, { TICKS_PAR_SECONDE } from '../jellyfin/musique/Paroles.js';
import EcranMusique from '../ui/views/EcranMusique.js';

const t = (s) => Math.round(s * TICKS_PAR_SECONDE);

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('RadioArtiste', () => {
    function fabriquer({ items = [{ Id: 'a' }, { Id: 'b' }], user = { Id: 'u1' }, echoue = false } = {}) {
        const get = vi.fn(async () => {
            if (echoue) throw new Error('503');
            return { Items: items };
        });
        return {
            radio: new RadioArtiste({ api: { get }, auth: { getUser: () => user } }),
            get,
        };
    }

    it('passe UserId, sans quoi le serveur répond une liste vide en silence', async () => {
        const { radio, get } = fabriquer();
        await radio.composer({ Id: 'morceau-1' });

        const url = new URL(get.mock.calls[0][0], 'http://x');
        expect(url.pathname).toBe('/Items/morceau-1/InstantMix');
        expect(url.searchParams.get('UserId')).toBe('u1');
        expect(url.searchParams.get('Limit')).toBe(String(LIMITE_DEFAUT));
    });

    it('demande MediaSources dès la composition', async () => {
        const { radio, get } = fabriquer();
        await radio.composer('morceau-1');
        // Sans ce champ, chaque titre exigerait une requête au moment de sa
        // lecture : cinquante allers-retours sur une file de cinquante titres.
        expect(new URL(get.mock.calls[0][0], 'http://x').searchParams.get('Fields'))
            .toContain('MediaSources');
    });

    it('n\'interroge pas le serveur sans session', async () => {
        const get = vi.fn();
        const radio = new RadioArtiste({ api: { get }, auth: { getUser: () => null } });
        const res = await radio.composer('m');
        expect(res.ok).toBe(false);
        expect(res.raison).toBeTruthy();
        // Envoyer une requête dont on sait qu'elle reviendra vide, c'est
        // fabriquer soi-même le symptôme incompréhensible.
        expect(get).not.toHaveBeenCalled();
    });

    it('distingue « pas assez de musique » d\'une panne', async () => {
        const vide = await fabriquer({ items: [] }).radio.composer('m');
        expect(vide.ok).toBe(false);
        expect(vide.raison).toMatch(/pas assez/i);

        const panne = await fabriquer({ echoue: true }).radio.composer('m');
        expect(panne.ok).toBe(false);
        expect(panne.raison).toMatch(/503/);
    });

    it('refuse un départ sans identifiant', async () => {
        const { radio, get } = fabriquer();
        expect((await radio.composer(null)).ok).toBe(false);
        expect((await radio.composer({})).ok).toBe(false);
        expect(get).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('EcranMusique', () => {
    const REPONSE = {
        Lyrics: [
            { Text: 'Premiere ligne', Start: t(0), End: t(4) },
            {
                Text: "Salut, c'est moi",
                Start: t(4), End: t(10),
                Cues: [
                    { Start: t(4), Position: 0 },
                    { Start: t(6), Position: 7 },
                    { Start: t(8), End: null, Position: 13 },
                ],
            },
        ],
    };

    async function fabriquer({ reponse = REPONSE } = {}) {
        const paroles = new Paroles({ api: { get: vi.fn(async () => reponse) } });
        const media = { currentTime: 0 };
        const ecran = new EcranMusique({
            paroles,
            api: { getImageUrl: () => 'http://nas/img.jpg' },
            media: () => media,
        });
        // La boucle rAF n'a pas sa place dans un test : on peint à la demande.
        vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
        vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
        await ecran.ouvrir({ Id: 'm1', Name: 'Mon <Titre> & "Cie"', Artists: ['A', 'B'] });
        return { ecran, media, paroles };
    }

    it('pose un span par repère, une fois pour toutes', async () => {
        const { ecran, media } = await fabriquer();
        const spans = () => [...document.querySelectorAll('.sh-musique__mot')];
        const avant = spans();
        expect(avant).toHaveLength(4);   // 1 pour la ligne simple, 3 pour la découpée

        media.currentTime = 6;
        ecran._peindre();
        media.currentTime = 8;
        ecran._peindre();

        // CONTRE-ÉPREUVE DU COÛT : un karaoké qui recrée ses nœuds à chaque mot
        // remet la ligne en page soixante fois par seconde. On compare donc
        // l'IDENTITÉ des nœuds, pas leur nombre — un DOM reconstruit à
        // l'identique donnerait le même compte et passerait inaperçu.
        const apres = spans();
        expect(apres).toHaveLength(avant.length);
        for (let i = 0; i < avant.length; i += 1) {
            expect(apres[i], 'le span a été recréé').toBe(avant[i]);
        }
    });

    it('découpe les spans aux positions annoncées', async () => {
        await fabriquer();
        const ligne = document.querySelectorAll('.sh-musique__ligne')[1];
        const textes = [...ligne.querySelectorAll('.sh-musique__mot')].map(s => s.textContent);
        expect(textes).toEqual(['Salut, ', "c'est ", 'moi']);
        // Recollés, ils redonnent la ligne : aucun caractère perdu.
        expect(textes.join('')).toBe("Salut, c'est moi");
    });

    it('allume les mots au fur et à mesure', async () => {
        const { ecran, media } = await fabriquer();
        const ligne = document.querySelectorAll('.sh-musique__ligne')[1];
        const allumes = () => [...ligne.querySelectorAll('.est-chante')].length;

        media.currentTime = 4; ecran._peindre();
        expect(allumes()).toBe(1);
        media.currentTime = 6; ecran._peindre();
        expect(allumes()).toBe(2);
        media.currentTime = 8; ecran._peindre();
        expect(allumes()).toBe(3);
    });

    it('allume d\'un bloc une ligne sans découpage au mot', async () => {
        const { ecran, media } = await fabriquer();
        media.currentTime = 1;
        ecran._peindre();
        const ligne = document.querySelectorAll('.sh-musique__ligne')[0];
        // Sans repères de mots, laisser la ligne éteinte serait pire que de ne
        // rien afficher : on la révèle entière.
        expect(ligne.querySelectorAll('.est-chante')).toHaveLength(1);
        expect(ligne.classList.contains('est-active')).toBe(true);
    });

    it('éteint la ligne quittée', async () => {
        const { ecran, media } = await fabriquer();
        media.currentTime = 1; ecran._peindre();
        media.currentTime = 5; ecran._peindre();

        const lignes = document.querySelectorAll('.sh-musique__ligne');
        expect(lignes[0].classList.contains('est-active')).toBe(false);
        expect(lignes[0].querySelectorAll('.est-chante')).toHaveLength(0);
        expect(lignes[1].classList.contains('est-active')).toBe(true);
    });

    it('ne touche pas au DOM quand rien n\'a changé', async () => {
        const { ecran, media } = await fabriquer();
        media.currentTime = 6;
        ecran._peindre();

        const ligne = document.querySelectorAll('.sh-musique__ligne')[1];
        const espion = vi.spyOn(ligne.classList, 'add');
        // Soixante images par seconde, mais un mot toutes les deux secondes :
        // l'écrasante majorité des passages ne doit rien faire.
        for (let i = 0; i < 30; i += 1) ecran._peindre();
        expect(espion).not.toHaveBeenCalled();
    });

    it('affiche le titre par textContent, jamais par innerHTML', async () => {
        await fabriquer();
        const titre = document.querySelector('.sh-musique__titre');
        // Un titre vient des balises ID3 d'un fichier, donc de n'importe où.
        expect(titre.textContent).toBe('Mon <Titre> & "Cie"');
        expect(titre.children).toHaveLength(0);
    });

    it('dit qu\'il n\'y a pas de paroles plutôt que de laisser un vide', async () => {
        const { ecran } = await fabriquer({ reponse: { Lyrics: [] } });
        expect(document.querySelector('.sh-musique__sans-paroles')).not.toBeNull();
        // Et la boucle ne doit pas jeter faute de lignes.
        expect(() => ecran._peindre()).not.toThrow();
    });

    it('nettoie tout à la fermeture', async () => {
        const { ecran } = await fabriquer();
        expect(ecran.ouvert).toBe(true);
        ecran.fermer();
        expect(ecran.ouvert).toBe(false);
        expect(document.querySelector('.sh-musique')).toBeNull();
        expect(cancelAnimationFrame).toHaveBeenCalled();
    });
});
