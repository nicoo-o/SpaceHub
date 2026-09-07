/**
 * @vitest-environment jsdom
 *
 * Bandes-annonces : lecture directe, et choix pendant la lecture.
 *
 * Le service affichait un menu flottant dès qu'il résolvait plusieurs sources.
 * Deux défauts, tous deux signalés en usage réel :
 *
 *   - il imposait un clic pour rien. On demande à voir la bande-annonce, pas à
 *     choisir laquelle : dans l'écrasante majorité des cas la première convient ;
 *   - il était positionné en coordonnées de PAGE (`document.body` + `top`/`left`)
 *     à partir d'un rectangle de VIEWPORT (`getBoundingClientRect`). Les deux ne
 *     coïncident qu'en haut de page : dès qu'on touchait à la molette, le menu
 *     partait à la dérive.
 *
 * Le choix n'a pas disparu, il a changé de moment : il se fait maintenant
 * pendant la lecture, quand on peut juger si celle-ci convient.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Le service tire tout son environnement de core/services.js — on le double. */
const faux = {
    player: null, toaster: null, auth: null, nav: null,
};
vi.mock('../core/services.js', () => ({
    player: () => faux.player,
    toaster: () => faux.toaster,
    auth: () => faux.auth,
    nav: () => faux.nav,
    trailers: () => null,
}));
vi.mock('../core/TrailerService.css', () => ({}), { virtual: true });

const { default: TrailerService } = await import('../core/TrailerService.js');

let service;

beforeEach(() => {
    document.body.innerHTML = '';
    faux.player = { play: vi.fn(), close: vi.fn(), _playbackOptions: {} };
    faux.toaster = { error: vi.fn(), info: vi.fn(), show: vi.fn() };
    faux.auth = { getServerUrl: () => 'https://exemple', getUserId: () => 'u', getAuthHeaders: () => ({}) };
    faux.nav = null;
    service = new TrailerService();
});

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

/** Court-circuite la résolution réseau : on teste l'aiguillage, pas Jellyfin. */
function avecSources(sources) {
    vi.spyOn(service, 'resolve').mockResolvedValue(sources);
}

const LOCALE = (n = 1) => ({ type: 'local', label: `Locale ${n}`, trailerItem: { Id: `t${n}`, Name: `Trailer ${n}` } });
const YOUTUBE = (n = 1) => ({ type: 'youtube', label: `YouTube ${n}`, videoId: `vid${n}00000` });

describe('La première bande-annonce part immédiatement', () => {
    it('aucun menu de choix n\'est créé, même avec plusieurs sources', async () => {
        avecSources([LOCALE(1), YOUTUBE(2), YOUTUBE(3)]);
        await service.open({ Id: 'm1', Name: 'Un film' });

        expect(document.querySelector('.sh-trailer-menu')).toBeNull();
        expect(faux.player.play).toHaveBeenCalledTimes(1);
        expect(faux.player.play.mock.calls[0][0]).toEqual({ Id: 't1', Name: 'Trailer 1' });
    });

    it('le lecteur est prévenu qu\'il joue une bande-annonce', async () => {
        // C'est ce drapeau qui décide de l'affichage du bouton « suivante »
        // dans le dock du lecteur.
        avecSources([LOCALE(1), YOUTUBE(2)]);
        await service.open({ Id: 'm1' });
        expect(faux.player.play.mock.calls[0][2]).toEqual({ isTrailer: true });
    });

    it('une source unique se comporte exactement pareil', async () => {
        avecSources([YOUTUBE(1)]);
        await service.open({ Id: 'm1' });
        expect(document.querySelector('.sh-trailer-window')).not.toBeNull();
    });

    it('sans aucune source, on le dit et on n\'ouvre rien', async () => {
        avecSources([]);
        await service.open({ Id: 'm1' });
        expect(faux.toaster.info).toHaveBeenCalled();
        expect(document.querySelector('.sh-trailer-window')).toBeNull();
        expect(faux.player.play).not.toHaveBeenCalled();
    });
});

describe('Le bouton « suivante » remplace le menu', () => {
    it('la fenêtre YouTube le porte quand il y a une suite', async () => {
        avecSources([YOUTUBE(1), YOUTUBE(2)]);
        await service.open({ Id: 'm1' });
        const bouton = document.querySelector('.sh-trailer-window__next');
        expect(bouton).not.toBeNull();
        expect(bouton.textContent).toContain('1/2');
    });

    it('elle ne le porte PAS quand il n\'y a rien après', async () => {
        // Un bouton « suivante » qui rejoue la même chose est pire que pas de
        // bouton du tout.
        avecSources([YOUTUBE(1)]);
        await service.open({ Id: 'm1' });
        expect(document.querySelector('.sh-trailer-window__next')).toBeNull();
    });

    it('il fait défiler les sources, en boucle', async () => {
        avecSources([YOUTUBE(1), YOUTUBE(2)]);
        await service.open({ Id: 'm1' });
        const rang = () => document.querySelector('.sh-trailer-window__next').textContent;
        expect(rang()).toContain('1/2');

        service.suivante();
        expect(rang()).toContain('2/2');

        service.suivante();
        expect(rang()).toContain('1/2');
    });

    it('une seule fenêtre à la fois pendant l\'enchaînement', async () => {
        // La sortie animée laissait l'ancienne fenêtre 220 ms de plus dans le
        // DOM. Deux `.sh-trailer-window` coexistaient donc, et tout ce qui les
        // cherche par sélecteur tombait sur la périmée — y compris la garde de
        // `close()` et le focus initial.
        avecSources([YOUTUBE(1), YOUTUBE(2)]);
        await service.open({ Id: 'm1' });
        service.suivante();
        expect(document.querySelectorAll('.sh-trailer-window')).toHaveLength(1);
    });

    it('il ne fait rien s\'il n\'y a qu\'une source', async () => {
        avecSources([YOUTUBE(1)]);
        await service.open({ Id: 'm1' });
        expect(service.suivante()).toBe(false);
    });

    it('passer d\'une locale à une YouTube fait taire le lecteur Jellyfin', async () => {
        // Les deux lecteurs ne se connaissent pas : sans cette fermeture, on
        // entendrait deux bandes-annonces à la fois.
        avecSources([LOCALE(1), YOUTUBE(2)]);
        await service.open({ Id: 'm1' });
        faux.player._playbackOptions = { isTrailer: true };

        service.suivante();
        expect(faux.player.close).toHaveBeenCalled();
        expect(document.querySelector('.sh-trailer-window')).not.toBeNull();
    });
});

describe('Rien ne flotte plus en coordonnées de page', () => {
    it('la fenêtre de lecture est ancrée au viewport, pas au document', () => {
        // La dérive au défilement venait de là : un élément posé sur
        // `document.body` avec un `top` issu de `getBoundingClientRect()` est
        // juste en haut de page, et faux partout ailleurs. La fenêtre, elle,
        // couvre le viewport entier et n'a aucune coordonnée à calculer.
        service.openYoutubeWindow(YOUTUBE(1), 'Un film');
        const win = document.querySelector('.sh-trailer-window');
        expect(win).not.toBeNull();
        expect(win.style.top).toBe('');
        expect(win.style.left).toBe('');
    });

    it('le service n\'expose plus aucune API de menu', () => {
        expect(service._openMenu).toBeUndefined();
        expect(service.closeMenu).toBeUndefined();
    });
});
