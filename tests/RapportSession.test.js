import { describe, it, expect, vi } from 'vitest';
import { creerRapportSession } from '../jellyfin/player/RapportSession.js';
import { ActionMedia } from '../core/TelecommandeTv.js';

/** Horloge fausse pour l'intervalle de progression : on déclenche à la main. */
function creerHorloge() {
    const armes = new Map();
    let prochainId = 1;
    return {
        setIntervalFn: vi.fn((cb, delai) => {
            const id = prochainId++;
            armes.set(id, { cb, delai, actif: true });
            return id;
        }),
        clearIntervalFn: vi.fn((id) => {
            const arme = armes.get(id);
            if (arme) arme.actif = false;
        }),
        declencher(id) {
            const arme = armes.get(id);
            if (!arme || !arme.actif) throw new Error('intervalle inexistant ou annulé');
            arme.cb(); // comme setInterval : il continue de tirer jusqu'à l'annulation
        },
        armes,
    };
}

function monter(overrides = {}) {
    const fakes = {
        video: { currentTime: 42, duration: 600, playbackRate: 1, paused: false },
        item: { Id: 'item-1', Name: 'Film' },
        auth: { getServerUrl: () => 'https://serveur.example', getAuthHeaders: () => ({ Authorization: 'MediaBrowser token="t"' }) },
        api: { getImageUrl: (id, kind) => `https://img/${id}/${kind}` },
        sessionMedia: { supporte: true, position: vi.fn(), decrire: vi.fn(), brancher: vi.fn() },
        etatSession: { mediaSourceId: 'ms-1', playSessionId: 'ps-1', playMethod: 'DirectPlay', playbackStartTicks: 420000000 },
        executerActionMedia: vi.fn(),
        seekRelative: vi.fn(),
        journal: { debug: vi.fn() },
        fetchAvecDelai: vi.fn(() => Promise.resolve()),
        horloge: creerHorloge(),
        ...overrides,
    };
    const rapport = creerRapportSession({
        obtenirVideo: () => fakes.video,
        obtenirItem: () => fakes.item,
        obtenirAuth: () => fakes.auth,
        obtenirApi: () => fakes.api,
        obtenirSessionMedia: () => fakes.sessionMedia,
        lireEtatSession: () => fakes.etatSession,
        executerActionMedia: fakes.executerActionMedia,
        seekRelative: fakes.seekRelative,
        journal: () => fakes.journal,
        fetchAvecDelai: fakes.fetchAvecDelai,
        setIntervalFn: fakes.horloge.setIntervalFn,
        clearIntervalFn: fakes.horloge.clearIntervalFn,
    });
    return { rapport, ...fakes };
}

describe('Rapport de session Jellyfin — peau 6 (module extrait)', () => {
    it('publierPosition décrit la position auprès du système', () => {
        const { rapport, sessionMedia } = monter();
        rapport.publierPosition();
        expect(sessionMedia.position).toHaveBeenCalledWith({
            duree: 600,
            position: 42,
            vitesse: 1,
        });
    });

    it('publierPosition ne fait rien sans vidéo', () => {
        const { rapport, sessionMedia } = monter({ video: null });
        rapport.publierPosition();
        expect(sessionMedia.position).not.toHaveBeenCalled();
    });

    it('rapporterDebut poste /Sessions/Playing avec l état de session', () => {
        const { rapport, fetchAvecDelai, auth } = monter();
        rapport.rapporterDebut();
        const [url, options] = fetchAvecDelai.mock.calls[0];
        expect(url).toBe('https://serveur.example/Sessions/Playing');
        expect(options.method).toBe('POST');
        expect(options.headers).toEqual(auth.getAuthHeaders());
        expect(JSON.parse(options.body)).toEqual({
            ItemId: 'item-1',
            MediaSourceId: 'ms-1',
            PlaySessionId: 'ps-1',
            PlayMethod: 'DirectPlay',
            PositionTicks: 420000000,
        });
    });

    it('rapporterDebut se tait sans serveur ou sans item', () => {
        const { rapport, fetchAvecDelai } = monter({ auth: { getServerUrl: () => undefined } });
        rapport.rapporterDebut();
        expect(fetchAvecDelai).not.toHaveBeenCalled();
    });

    it('rapporterArret poste /Sessions/Playing/Stopped à la position courante', () => {
        const { rapport, fetchAvecDelai } = monter();
        rapport.rapporterArret();
        const [url, options] = fetchAvecDelai.mock.calls[0];
        expect(url).toBe('https://serveur.example/Sessions/Playing/Stopped');
        expect(JSON.parse(options.body)).toMatchObject({
            ItemId: 'item-1',
            MediaSourceId: 'ms-1',
            PlaySessionId: 'ps-1',
            PlayMethod: 'DirectPlay',
            PositionTicks: 420000000, // 42 s × 10 000 000
        });
    });

    it('demarrerProgres arme un intervalle de 10 s qui ne poste que si la vidéo joue', () => {
        const horloge = creerHorloge();
        const { rapport, fetchAvecDelai, video } = monter({ horloge });

        rapport.demarrerProgres();
        expect(horloge.setIntervalFn).toHaveBeenCalledTimes(1);
        expect(horloge.setIntervalFn.mock.calls[0][1]).toBe(10000);

        const id = horloge.setIntervalFn.mock.results[0].value;

        video.paused = true;
        horloge.declencher(id);
        expect(fetchAvecDelai).not.toHaveBeenCalled();

        video.paused = false;
        video.currentTime = 43;
        horloge.declencher(id);
        const [url, options] = fetchAvecDelai.mock.calls[0];
        expect(url).toBe('https://serveur.example/Sessions/Playing/Progress');
        expect(JSON.parse(options.body)).toMatchObject({
            ItemId: 'item-1',
            PositionTicks: 430000000,
            IsPaused: false,
        });
    });

    it('un second demarrerProgres remplace l intervalle, nettoyer le tue', () => {
        const horloge = creerHorloge();
        const { rapport } = monter({ horloge });

        rapport.demarrerProgres();
        rapport.demarrerProgres();
        expect(horloge.clearIntervalFn).toHaveBeenCalledTimes(1);

        rapport.nettoyer();
        expect(horloge.clearIntervalFn).toHaveBeenCalledTimes(2);
        expect([...horloge.armes.values()].every((a) => !a.actif)).toBe(true);
    });

    it('brancher décrit le titre avec le format SxxExx et la vignette', () => {
        const { rapport, sessionMedia, api } = monter({
            item: { Id: 'ep-9', Name: 'Épisode', SeriesName: 'Série', ParentIndexNumber: 1, IndexNumber: 4 },
        });
        rapport.brancher({ Id: 'ep-9', Name: 'Épisode', SeriesName: 'Série', ParentIndexNumber: 1, IndexNumber: 4 });
        expect(sessionMedia.decrire).toHaveBeenCalledWith({
            titre: 'Épisode',
            sousTitre: 'Série — S1E4',
            vignette: api.getImageUrl('ep-9', 'Primary'),
        });
    });

    it('brancher retombe sur l année quand il n y a ni série ni épisode', () => {
        const { rapport, sessionMedia } = monter();
        rapport.brancher({ Id: 'film-1', Name: 'Film', ProductionYear: 2024 });
        expect(sessionMedia.decrire).toHaveBeenCalledWith(
            expect.objectContaining({ titre: 'Film', sousTitre: '2024' }),
        );
    });

    it('brancher ne fait rien quand le système ne supporte pas la session média', () => {
        const { rapport, sessionMedia } = monter({ sessionMedia: { supporte: false, decrire: vi.fn(), brancher: vi.fn() } });
        rapport.brancher({ Id: 'x', Name: 'X' });
        expect(sessionMedia.decrire).not.toHaveBeenCalled();
        expect(sessionMedia.brancher).not.toHaveBeenCalled();
    });

    it('les boutons média retombent tous sur executerActionMedia', () => {
        const { rapport, sessionMedia, executerActionMedia } = monter();
        rapport.brancher({ Id: 'x', Name: 'X' });
        const boutons = sessionMedia.brancher.mock.calls[0][0];

        boutons.play();
        boutons.pause();
        boutons.stop();
        boutons.previoustrack();
        boutons.nexttrack();
        expect(executerActionMedia.mock.calls.map((c) => c[0])).toEqual([
            ActionMedia.PLAY,
            ActionMedia.PAUSE,
            ActionMedia.STOP,
            ActionMedia.PREVIOUS,
            ActionMedia.NEXT,
        ]);

    });

    it('les flèches du système utilisent le décalage reçu, dix secondes par défaut', () => {
        const { rapport, sessionMedia, seekRelative } = monter();
        rapport.brancher({ Id: 'x', Name: 'X' });
        const boutons = sessionMedia.brancher.mock.calls[0][0];

        boutons.seekbackward({ seekOffset: 30 });
        boutons.seekforward({ seekOffset: 5 });
        boutons.seekbackward({});
        boutons.seekforward({});
        expect(seekRelative.mock.calls.map((c) => c[0])).toEqual([-30, 5, -10, 10]);
    });

    it('seekto déplace la vidéo (fastSeek si demandé) puis republie la position', () => {
        const video = {
            currentTime: 0,
            playbackRate: 1,
            paused: false,
            duration: 600,
            fastSeek: vi.fn((t) => { video.currentTime = t; }),
        };
        const { rapport, sessionMedia, seekRelative } = monter({ video });
        rapport.brancher({ Id: 'x', Name: 'X' });
        const boutons = sessionMedia.brancher.mock.calls[0][0];

        boutons.seekto({ seekTime: 120, fastSeek: true });
        expect(video.fastSeek).toHaveBeenCalledWith(120);

        boutons.seekto({ seekTime: 60 });
        expect(video.currentTime).toBe(60);
    });
});