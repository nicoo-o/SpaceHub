/**
 * @vitest-environment jsdom
 *
 * Virtualisation d'une rangée — et la contrainte qui la gouverne.
 *
 * Ne rendre que les cartes visibles est facile. Le faire sans casser la
 * navigation à la télécommande l'est beaucoup moins : le moteur spatial
 * cherche sa cible parmi les éléments PRÉSENTS dans le DOM. Si la carte
 * suivante n'y est pas encore, la flèche droite ne trouve rien et le focus
 * s'arrête au milieu de la rangée, sans que rien ne l'explique.
 *
 * Ces tests portent donc autant sur ce que la virtualisation NE DOIT PAS
 * faire — retirer la carte focalisée, laisser un bord sans marge — que sur
 * ce qu'elle fait.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualisationRangee, SEUIL_VIRTUALISATION, MARGE } from '../ui/components/VirtualisationRangee.js';

/** Rangée de test : jsdom ne fait pas de mise en page, on la simule. */
function rangee(nombre, { largeurVisible = 900, largeurCarte = 180 } = {}) {
    const conteneur = document.createElement('div');
    document.body.appendChild(conteneur);
    Object.defineProperty(conteneur, 'clientWidth', { value: largeurVisible, configurable: true });
    conteneur.scrollLeft = 0;

    const fabriquer = (i) => {
        const el = document.createElement('button');
        el.textContent = `carte ${i}`;
        el.dataset.test = String(i);
        el.getBoundingClientRect = () => ({ width: largeurCarte, height: 260, top: 0, left: 0, right: 0, bottom: 0 });
        return el;
    };
    return { conteneur, fabriquer, virtuel: new VirtualisationRangee(conteneur, nombre, fabriquer) };
}

const indices = (conteneur) =>
    [...conteneur.querySelectorAll('[data-indice-rangee]')]
        .map(c => Number(c.dataset.indiceRangee));

beforeEach(() => { document.body.innerHTML = ''; });

describe('Seuil d\'activation', () => {
    it('ne virtualise pas une rangée courte', () => {
        // En dessous du seuil, le gain est nul et le risque bien réel.
        const { virtuel } = rangee(SEUIL_VIRTUALISATION);
        expect(virtuel.demarrer()).toBe(false);
    });

    it('virtualise au-delà du seuil', () => {
        const { virtuel } = rangee(SEUIL_VIRTUALISATION + 1);
        expect(virtuel.demarrer()).toBe(true);
    });
});

describe('Fenêtre rendue', () => {
    it('ne rend qu\'une fraction des cartes', () => {
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();
        const rendues = indices(conteneur);
        expect(rendues.length).toBeLessThan(60);
        expect(rendues.length).toBeGreaterThan(0);
        expect(rendues[0]).toBe(0);
    });

    it('rend une marge de part et d\'autre du visible', () => {
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();
        // 900 px visibles / 180 px par carte = 5 cartes, plus la marge.
        expect(indices(conteneur).length).toBeGreaterThanOrEqual(5 + MARGE);
    });

    it('suit le défilement', async () => {
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();
        expect(indices(conteneur)).toContain(0);

        conteneur.scrollLeft = 180 * 200;           // au 200e
        conteneur.dispatchEvent(new Event('scroll'));
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));

        const rendues = indices(conteneur);
        expect(rendues).toContain(200);
        expect(rendues, 'le début aurait dû être libéré').not.toContain(0);
    });

    it('garde les indices en ordre croissant dans le DOM', async () => {
        // L'ordre du DOM décide de la navigation par tabulation : des ajouts
        // partiels ne doivent pas mélanger la rangée.
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();
        conteneur.scrollLeft = 180 * 30;
        conteneur.dispatchEvent(new Event('scroll'));
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));

        const rendues = indices(conteneur);
        expect(rendues).toEqual([...rendues].sort((a, b) => a - b));
    });

    it('tient la place des cartes absentes', () => {
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();
        const cales = conteneur.querySelectorAll('.sh-rangee-cale');
        expect(cales.length).toBe(2);
        // Sans les cales, la barre de défilement mentirait et la position
        // sauterait à chaque déplacement de fenêtre.
        expect(cales[1].style.flex).toMatch(/\d+px$/);
    });
});

describe('Ce qui protège la navigation', () => {
    it('ne retire JAMAIS la carte qui a le focus', async () => {
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();

        const carte = conteneur.querySelector('[data-indice-rangee="2"]');
        carte.focus();
        expect(document.activeElement).toBe(carte);

        // Un défilement massif, très loin de la carte focalisée.
        conteneur.scrollLeft = 180 * 300;
        conteneur.dispatchEvent(new Event('scroll'));
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));

        // Détruire l'élément focalisé, c'est la quatrième classe de bogue de
        // focus décrite par Netflix : plus rien ne porte le focus, et la
        // télécommande n'a plus de point de départ.
        expect(document.body.contains(carte), 'la carte focalisée a été retirée').toBe(true);
        expect(document.activeElement).toBe(carte);
    });

    it('étend la fenêtre quand le focus approche du bord, sans attendre le défilement', () => {
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();
        const avant = Math.max(...indices(conteneur));

        // Le focus atteint la dernière carte rendue. L'événement `scroll`
        // arrive APRÈS le déplacement du focus : sans cet écouteur, il existe
        // une fenêtre où la carte suivante n'existe pas encore.
        conteneur.querySelector(`[data-indice-rangee="${avant}"]`)
            .dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        expect(Math.max(...indices(conteneur))).toBeGreaterThan(avant);
    });

    it('laisse toujours des cartes après celle qui a le focus', () => {
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();
        // On avance de proche en proche, comme le ferait la flèche droite.
        for (let i = 0; i < 120; i++) {
            const carte = conteneur.querySelector(`[data-indice-rangee="${i}"]`);
            expect(carte, `la carte ${i} manquait — la flèche droite se serait arrêtée ici`).toBeTruthy();
            carte.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        }
    });

    it('ne rend pas les cales focalisables', () => {
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();
        for (const cale of conteneur.querySelectorAll('.sh-rangee-cale')) {
            expect(cale.getAttribute('data-nav-focusable')).toBeNull();
            expect(cale.getAttribute('aria-hidden')).toBe('true');
            expect(cale.tabIndex).toBeLessThanOrEqual(0);
        }
    });

    it('s\'arrête proprement', () => {
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();
        virtuel.detruire();
        const avant = indices(conteneur).length;
        conteneur.scrollLeft = 180 * 300;
        conteneur.dispatchEvent(new Event('scroll'));
        expect(indices(conteneur).length).toBe(avant);
        expect(() => virtuel.detruire()).not.toThrow();
    });
});

describe('Réentrance', () => {
    it('bloque un appel imbriqué au lieu de descendre la pile', () => {
        // LE DÉFAUT OBSERVÉ. `_appliquer` rend le focus à la carte qu'il vient
        // de déplacer ; `focus()` émet `focusin` ; `_onFocus` étend la fenêtre
        // et rappelle `_appliquer`. Comme `this._debut` n'est mis à jour qu'à
        // la FIN de la passe, l'appel imbriqué voit encore l'ancienne fenêtre,
        // ne sort pas par la condition d'égalité, et repart pour un tour :
        // « Maximum call stack size exceeded ». Sur un téléviseur, cela ne
        // produit pas une trace dans une console — cela fige l'application.
        //
        // On provoque la réentrance directement, plutôt que par le chemin du
        // focus : c'est ce que la garde doit empêcher, quel que soit le
        // chemin qui l'atteint.
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();

        let profondeur = 0;
        let maxProfondeur = 0;
        const vrai = virtuel._appliquerVraiment.bind(virtuel);
        virtuel._appliquerVraiment = (d, f) => {
            profondeur += 1;
            maxProfondeur = Math.max(maxProfondeur, profondeur);
            try {
                const resultat = vrai(d, f);
                // Réentrance : exactement ce que fait le gestionnaire de focus.
                if (profondeur < 30) virtuel._appliquer({ debut: d + 5, fin: f + 5 });
                return resultat;
            } finally {
                profondeur -= 1;
            }
        };

        virtuel._appliquer({ debut: 100, fin: 130 });

        expect(maxProfondeur, `${maxProfondeur} passes imbriquées — la garde de réentrance ne tient pas`).toBe(1);
        expect(conteneur.querySelectorAll('[data-indice-rangee]').length).toBeGreaterThan(0);
    });

    it('rend la main après une passe, sans rester bloqué', () => {
        const { conteneur, virtuel } = rangee(500);
        virtuel.demarrer();
        virtuel._appliquer({ debut: 100, fin: 130 });
        expect(virtuel._enCours, 'la garde est restée levée').toBe(false);
        // Une seconde passe doit donc toujours fonctionner.
        virtuel._appliquer({ debut: 200, fin: 230 });
        expect(indices(conteneur)).toContain(200);
    });
});
