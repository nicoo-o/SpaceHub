/**
 * @vitest-environment jsdom
 *
 * SpaceHub — le minuteur de sommeil est-il ATTEIGNABLE ?
 * =====================================================
 *
 * POURQUOI CE FICHIER EXISTE, ET CE QU'IL DIT DES AUTRES
 * ------------------------------------------------------
 * `core/MinuteurSommeil.js` était complet : deux modes, avertissement une
 * minute avant, bascule automatique en « fin du titre » quand l'échéance
 * tombe à moins de cinq minutes de la fin, et une suite de tests verte sur
 * chacun de ces comportements.
 *
 * Et aucune interface ne l'appelait. `grep -rn sommeil ui/` : zéro. Le
 * module était instancié par `core/SpaceHub.js`, enregistré sous
 * `core.sommeil`, exposé par `core/services.js` — et le service n'avait
 * aucun lecteur, nulle part. Un utilisateur ne pouvait pas programmer
 * d'arrêt : il n'y avait pas de bouton.
 *
 * C'est le trou que les tests unitaires ne voient pas par construction. Ils
 * vérifient qu'un module fait ce qu'il promet À QUI L'APPELLE ; ils ne
 * demandent jamais si quelqu'un l'appelle. Un module fini, testé, branché
 * sur rien passe tous les contrôles du dépôt.
 *
 * CE QUE CE FICHIER VÉRIFIE
 * -------------------------
 * Le chemin complet, du gabarit au minuteur : les pastilles existent dans le
 * gabarit du lecteur, le rendu les câble, un clic arme réellement le
 * minuteur avec les bons arguments, et l'état affiché vient du minuteur et
 * non d'un souvenir du dernier clic.
 */

import { describe, it, expect, vi } from 'vitest';
import { creerPopovers } from '../jellyfin/player/PopoversContenu.js';
import gabaritLecteur from '../jellyfin/player/VideoPlayer.template.js';
import MinuteurSommeil, { Mode } from '../core/MinuteurSommeil.js';

/**
 * Un contexte de gabarit minimal : le gabarit ne lit que des champs.
 *
 * Les champs sont ceux que `gabaritLecteur` interpole réellement — `_subOffset`
 * compris, dont l'absence fait lever `.toFixed(1)` bien avant d'arriver à la
 * section qui nous intéresse.
 */
const CONTEXTE = {
    _playbackRate: 1.0,
    _aspectRatioIndex: 0,
    _subOffset: 0,
    _currentItem: { Name: 'Film', Type: 'Movie' },
    _escape: (s) => s,
    _escapeUrl: (s) => s,
};

function monterPanneau(injections = {}) {
    const hote = document.createElement('div');
    hote.innerHTML = gabaritLecteur(CONTEXTE);
    document.body.appendChild(hote);

    const popovers = creerPopovers({
        obtenirEl: () => hote,
        echapper: (s) => s,
        echapperUrl: (s) => s,
        obtenirApi: () => null,
        lireAudio: () => ({ flux: [], selection: -1 }),
        choisirAudio: () => {},
        lireSousTitres: () => ({ flux: [], selection: -1 }),
        choisirSousTitre: () => {},
        decalerSousTitres: () => {},
        lireVitesse: () => 1,
        choisirVitesse: () => {},
        lireAspect: () => ['contain', 'cover', 'fill'],
        choisirAspect: () => {},
        lireVersions: () => ({ versions: [], sourceActive: null }),
        choisirVersion: () => {},
        lireEpisodes: () => ({ episodes: [], itemCourant: null }),
        choisirEpisode: () => {},
        ...injections,
    });
    return { hote, popovers };
}

describe('Minuteur de sommeil — la porte existe', () => {
    it('le gabarit du lecteur porte des pastilles de minuteur', () => {
        const hote = document.createElement('div');
        hote.innerHTML = gabaritLecteur(CONTEXTE);
        const pastilles = hote.querySelectorAll('#sh-player-sommeil-chips [data-sommeil]');
        expect(pastilles.length).toBeGreaterThanOrEqual(3);
        // « Fin du titre » et « Aucun » sont les deux qui ne sont pas des durées.
        const valeurs = [...pastilles].map(b => b.dataset.sommeil);
        expect(valeurs).toContain('fin-titre');
        expect(valeurs).toContain('aucun');
    });

    it('chaque pastille est atteignable au pavé directionnel', () => {
        // Une commande qu'on ne peut pas atteindre depuis un téléviseur n'est
        // pas une commande : c'est le défaut déjà rencontré sur le mode
        // « vignette » de la médiathèque.
        const hote = document.createElement('div');
        hote.innerHTML = gabaritLecteur(CONTEXTE);
        for (const btn of hote.querySelectorAll('#sh-player-sommeil-chips [data-sommeil]')) {
            expect(btn.getAttribute('data-nav-focusable')).toBe('true');
            expect(btn.getAttribute('tabindex')).toBe('0');
        }
    });
});

describe('Minuteur de sommeil — le clic arrive jusqu\'au minuteur', () => {
    it('une durée arme le mode « durée » avec les bonnes minutes', () => {
        const armerSommeil = vi.fn(() => true);
        const { hote, popovers } = monterPanneau({
            lireSommeil: () => ({ actif: false, mode: null, restantMs: null }),
            armerSommeil,
            annulerSommeil: () => true,
        });
        popovers.rendreReglages();

        hote.querySelector('[data-sommeil="45"]').click();

        expect(armerSommeil).toHaveBeenCalledWith({ mode: 'duree', minutes: 45 });
    });

    it('« fin du titre » arme le bon mode, sans minutes', () => {
        const armerSommeil = vi.fn(() => true);
        const { hote, popovers } = monterPanneau({
            lireSommeil: () => ({ actif: false, mode: null, restantMs: null }),
            armerSommeil,
            annulerSommeil: () => true,
        });
        popovers.rendreReglages();

        hote.querySelector('[data-sommeil="fin-titre"]').click();

        expect(armerSommeil).toHaveBeenCalledWith({ mode: 'fin-titre' });
    });

    it('« Aucun » désarme', () => {
        const annulerSommeil = vi.fn(() => true);
        const { hote, popovers } = monterPanneau({
            lireSommeil: () => ({ actif: true, mode: 'duree', restantMs: 900000 }),
            armerSommeil: () => true,
            annulerSommeil,
        });
        popovers.rendreReglages();

        hote.querySelector('[data-sommeil="aucun"]').click();

        expect(annulerSommeil).toHaveBeenCalled();
    });

    it('sans service de minuteur, la section est masquée plutôt que morte', () => {
        const { hote, popovers } = monterPanneau({ lireSommeil: () => null });
        popovers.rendreReglages();

        const section = hote.querySelector('#sh-player-sommeil-chips').closest('.sh-popover-section');
        expect(section.hidden).toBe(true);
    });
});

describe('Minuteur de sommeil — l\'état affiché est celui du minuteur', () => {
    it('« fin du titre » choisi par le minuteur lui-même est montré comme tel', () => {
        // LE CAS QUI COMPTE. Le minuteur bascule tout seul de « durée » à
        // « fin du titre » quand l'échéance tombe à moins de cinq minutes de
        // la fin du média. Un panneau qui se souviendrait de la pastille
        // cliquée afficherait encore « 30 min ».
        const { hote, popovers } = monterPanneau({
            lireSommeil: () => ({ actif: true, mode: 'fin-titre', restantMs: null }),
            armerSommeil: () => true,
            annulerSommeil: () => true,
        });
        popovers.rendreReglages();

        expect(hote.querySelector('[data-sommeil="fin-titre"]').classList.contains('active')).toBe(true);
        expect(hote.querySelector('[data-sommeil="aucun"]').classList.contains('active')).toBe(false);
        expect(hote.querySelector('#sh-player-sommeil-etat').textContent)
            .toMatch(/fin de ce titre/i);
    });

    it('restantMs null ne devient JAMAIS « 0 min »', () => {
        // `Number(null)` vaut zéro, et zéro est fini : le piège maison. En
        // mode « fin du titre » la durée est INCONNUE, pas nulle.
        const { hote, popovers } = monterPanneau({
            lireSommeil: () => ({ actif: true, mode: 'fin-titre', restantMs: null }),
            armerSommeil: () => true,
            annulerSommeil: () => true,
        });
        popovers.rendreReglages();

        expect(hote.querySelector('#sh-player-sommeil-etat').textContent).not.toMatch(/0\s*min/);
    });

    it('rien de programmé : aucune ligne d\'état', () => {
        const { hote, popovers } = monterPanneau({
            lireSommeil: () => ({ actif: false, mode: null, restantMs: null }),
            armerSommeil: () => true,
            annulerSommeil: () => true,
        });
        popovers.rendreReglages();

        expect(hote.querySelector('#sh-player-sommeil-etat').textContent).toBe('');
        expect(hote.querySelector('[data-sommeil="aucun"]').classList.contains('active')).toBe(true);
    });
});

describe('Minuteur de sommeil — bout en bout, avec le vrai module', () => {
    it('un clic sur 30 min arme réellement MinuteurSommeil', () => {
        // Pas de doublure du minuteur ici : le vrai module, branché comme le
        // lecteur le branche. C'est ce cas qui prouve que les arguments passés
        // par le panneau sont ceux qu'`armer()` attend.
        vi.useFakeTimers();
        const video = document.createElement('video');
        const minuteur = new MinuteurSommeil({ lecteur: () => ({ videoElement: video }) });

        const { hote, popovers } = monterPanneau({
            lireSommeil: () => ({ actif: minuteur.actif, mode: minuteur.mode, restantMs: minuteur.restantMs }),
            armerSommeil: (o) => minuteur.armer(o),
            annulerSommeil: () => minuteur.annuler(),
        });
        popovers.rendreReglages();

        expect(minuteur.actif).toBe(false);
        hote.querySelector('[data-sommeil="30"]').click();

        expect(minuteur.actif).toBe(true);
        expect(minuteur.mode).toBe(Mode.DUREE);
        expect(minuteur.restantMs).toBeGreaterThan(29 * 60 * 1000);
        expect(hote.querySelector('#sh-player-sommeil-etat').textContent).toMatch(/30 min/);

        minuteur.annuler();
        vi.useRealTimers();
    });
});
