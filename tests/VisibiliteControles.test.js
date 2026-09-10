import { describe, it, expect, vi } from 'vitest';
import { creerVisibiliteControles } from '../jellyfin/player/VisibiliteControles.js';

/**
 * Horloge fausse : les minuteurs ne tournent pas, on les déclenche à la main.
 * Le module reçoit `setTimeoutFn`/`clearTimeoutFn` en injection (peau 3 a
 * établi le même gabarit pour son compte à rebours).
 */
function creerHorloge() {
    const armes = new Map();
    let prochainId = 1;
    return {
        setTimeoutFn: vi.fn((cb, delai) => {
            const id = prochainId++;
            armes.set(id, { cb, delai, actif: true });
            return id;
        }),
        clearTimeoutFn: vi.fn((id) => {
            const arme = armes.get(id);
            if (arme) arme.actif = false;
        }),
        declencher(id) {
            const arme = armes.get(id);
            if (!arme || !arme.actif) throw new Error(`minuteur #${id} inexistant ou annulé`);
            arme.actif = false;
            arme.cb();
        },
        armes,
    };
}

/** Faux élément DOM : classList observé, querySelector câblé sur une table. */
function creerEl(selecteurs = {}) {
    const classes = new Set();
    const el = {
        classes,
        classList: {
            add: vi.fn((c) => classes.add(c)),
            remove: vi.fn((c) => classes.delete(c)),
        },
        offsetWidth: 100,
    };
    el.querySelector = vi.fn((sel) => selecteurs[sel] ?? null);
    return el;
}

/** Faux OSD complet du lecteur (icône, texte, barre de progression). */
function creerOsd() {
    const icon = { textContent: '' };
    const text = { textContent: '' };
    const barWrap = { style: { display: '' } };
    const barFill = { style: { width: '' } };
    const osd = creerEl({
        '#sh-osd-icon': icon,
        '#sh-osd-text': text,
        '#sh-osd-bar-wrap': barWrap,
        '#sh-osd-bar-fill': barFill,
    });
    return { osd, icon, text, barWrap, barFill };
}

function monter({ el = creerEl(), video = null, tiroirOuvert = false, horloge } = {}) {
    const visibilite = creerVisibiliteControles({
        obtenirEl: () => el,
        obtenirVideo: () => video,
        estTiroirOuvert: () => tiroirOuvert,
        setTimeoutFn: horloge.setTimeoutFn,
        clearTimeoutFn: horloge.clearTimeoutFn,
    });
    return { visibilite, el, video };
}

describe('Visibilité des contrôles — peau 5 (module extrait)', () => {
    it('le HUD est visible au départ', () => {
        const { visibilite } = monter({ horloge: creerHorloge() });
        expect(visibilite.visibles()).toBe(true);
    });

    it('montrerControles retire hud-hidden, cacherControles le repose quand la vidéo joue', () => {
        const horloge = creerHorloge();
        const el = creerEl();
        const video = { paused: false };
        const { visibilite } = monter({ el, video, horloge });

        visibilite.cacherControles();
        expect(visibilite.visibles()).toBe(false);
        expect(el.classList.add).toHaveBeenCalledWith('hud-hidden');

        visibilite.montrerControles();
        expect(visibilite.visibles()).toBe(true);
        expect(el.classList.remove).toHaveBeenCalledWith('hud-hidden');
    });

    it('ne cache pas le HUD quand la vidéo est en pause ou que le tiroir est ouvert', () => {
        const horloge = creerHorloge();

        const pause = monter({ video: { paused: true }, horloge });
        pause.visibilite.cacherControles();
        expect(pause.visibilite.visibles()).toBe(true);

        const tiroir = monter({ video: { paused: false }, tiroirOuvert: true, horloge });
        tiroir.visibilite.cacherControles();
        expect(tiroir.visibilite.visibles()).toBe(true);
    });

    it('reinitialiserMinuterie arme la veille de 3,5 s qui cache le HUD', () => {
        const horloge = creerHorloge();
        const el = creerEl();
        const { visibilite } = monter({ el, video: { paused: false }, horloge });

        visibilite.reinitialiserMinuterie();
        expect(horloge.setTimeoutFn).toHaveBeenCalledTimes(1);
        expect(horloge.setTimeoutFn.mock.calls[0][1]).toBe(3500);
        const id = horloge.setTimeoutFn.mock.results[0].value;

        horloge.declencher(id);
        expect(visibilite.visibles()).toBe(false);
        expect(el.classList.add).toHaveBeenCalledWith('hud-hidden');
    });

    it('surActivite montre le HUD et réarme la veille', () => {
        const horloge = creerHorloge();
        const { visibilite } = monter({ el: creerEl(), horloge });

        visibilite.cacherControles();
        visibilite.surActivite();
        expect(visibilite.visibles()).toBe(true);
        expect(horloge.setTimeoutFn).toHaveBeenCalledTimes(1);
    });

    it('montrerFlashOSD affiche icône/texte, anime et réarme un minuteur de 1,4 s', () => {
        const horloge = creerHorloge();
        const { osd, icon, text } = creerOsd();
        const el = creerEl({ '#sh-player-osd': osd });
        const { visibilite } = monter({ el, horloge });

        visibilite.montrerFlashOSD('▶', 'Lecture');
        expect(icon.textContent).toBe('▶');
        expect(text.textContent).toBe('Lecture');
        expect(barWrapStyle(osd)).toBe('none');
        expect(osd.classList.add).toHaveBeenCalledWith('active');

        expect(horloge.setTimeoutFn.mock.calls[0][1]).toBe(1400);
        const id = horloge.setTimeoutFn.mock.results[0].value;
        horloge.declencher(id);
        expect(osd.classList.remove).toHaveBeenCalledWith('active');
    });

    it('montrerFlashOSD avec progression affiche la barre à la bonne largeur', () => {
        const horloge = creerHorloge();
        const { osd, barWrap, barFill } = creerOsd();
        const el = creerEl({ '#sh-player-osd': osd });
        const { visibilite } = monter({ el, horloge });

        visibilite.montrerFlashOSD('🔊', '42%', 0.42);
        expect(barWrap.style.display).toBe('block');
        expect(barFill.style.width).toBe('42%');
    });

    it('un second flash réarme le minuteur sans en laisser deux vivants', () => {
        const horloge = creerHorloge();
        const { osd } = creerOsd();
        const el = creerEl({ '#sh-player-osd': osd });
        const { visibilite } = monter({ el, horloge });

        visibilite.montrerFlashOSD('▶', 'Lecture');
        visibilite.montrerFlashOSD('⏸', 'Pause');
        expect(horloge.setTimeoutFn).toHaveBeenCalledTimes(2);
        expect(horloge.clearTimeoutFn).toHaveBeenCalledTimes(1);
        // Le premier minuteur a été annulé : seul le second peut se déclencher.
        const id = horloge.setTimeoutFn.mock.results[1].value;
        horloge.declencher(id);
        expect(osd.classList.remove).toHaveBeenCalledWith('active');
    });

    it('montrerFlashOSD sans élément OSD ne fait rien et n\'arme rien', () => {
        const horloge = creerHorloge();
        const { visibilite } = monter({ el: creerEl(), horloge });

        visibilite.montrerFlashOSD('▶', 'Lecture');
        expect(horloge.setTimeoutFn).not.toHaveBeenCalled();
    });

    it('nettoyer annule les deux minuteurs sans laisser d\'orphelin', () => {
        const horloge = creerHorloge();
        const { osd } = creerOsd();
        const el = creerEl({ '#sh-player-osd': osd });
        const { visibilite } = monter({ el, video: { paused: false }, horloge });

        visibilite.montrerFlashOSD('▶', 'Lecture');
        visibilite.reinitialiserMinuterie();
        expect(horloge.armes.size).toBe(2);

        visibilite.nettoyer();
        expect(horloge.clearTimeoutFn).toHaveBeenCalledTimes(2);
        // Aucun minuteur encore vivant : tout est annulé.
        expect([...horloge.armes.values()].every((a) => !a.actif)).toBe(true);
    });
});

function barWrapStyle(osd) {
    return osd.querySelector('#sh-osd-bar-wrap').style.display;
}