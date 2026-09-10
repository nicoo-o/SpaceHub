import { describe, it, expect, vi } from 'vitest';
import { creerChargementSource, authoriserUrl } from '../jellyfin/player/ChargementSource.js';

function monter(overrides = {}) {
    const fakes = {
        video: { src: '', currentTime: 0, playbackRate: 1, volume: 0.8, play: vi.fn(() => Promise.resolve()) },
        item: { Id: 'item-1' },
        auth: { getServerUrl: () => 'https://serveur.example' },
        settings: { get: vi.fn((cle, defaut) => defaut) },
        connexion: { downlink: 10 },
        generation: 3,
        vitesse: 1.5,
        volume: 0.8,
        options: { isTrailer: false },
        relancerLecture: vi.fn(),
        journal: { warn: vi.fn(), debug: vi.fn() },
        ...overrides,
    };
    const chargement = creerChargementSource({
        obtenirVideo: () => fakes.video,
        obtenirItem: () => fakes.item,
        obtenirAuth: () => fakes.auth,
        obtenirSettings: () => fakes.settings,
        obtenirConnexion: () => fakes.connexion,
        lireGeneration: () => fakes.generation,
        lireVitesse: () => fakes.vitesse,
        lireVolume: () => fakes.volume,
        lireOptions: () => fakes.options,
        relancerLecture: fakes.relancerLecture,
        journal: () => fakes.journal,
    });
    return { chargement, ...fakes };
}

describe('Chargement de la source — peau 7 (module extrait)', () => {
    describe('authoriserUrl', () => {
        it('ne touche pas à l URL sans jeton', () => {
            expect(authoriserUrl('https://srv/video.m3u8', null)).toBe('https://srv/video.m3u8');
        });

        it('ne double pas une api_key déjà présente', () => {
            expect(authoriserUrl('https://srv/v.m3u8?api_key=abc', 'xyz')).toBe('https://srv/v.m3u8?api_key=abc');
        });

        it('ajoute api_key avec ? puis & selon la forme de l URL', () => {
            expect(authoriserUrl('https://srv/v.m3u8', 'a b')).toBe('https://srv/v.m3u8?api_key=a%20b');
            expect(authoriserUrl('https://srv/v.m3u8?x=1', 'tok')).toBe('https://srv/v.m3u8?x=1&api_key=tok');
        });
    });

    describe('resoudreDebitMax', () => {
        it('respecte le plafond explicite avant tout', () => {
            const { chargement, settings } = monter({ settings: { get: vi.fn((k) => (k === 'player.maxBitrate' ? 5000000 : true)) } });
            expect(chargement.resoudreDebitMax()).toBe(5000000);
            expect(settings.get).toHaveBeenCalledWith('player.maxBitrate', 0);
        });

        it('renvoie 0 quand le mode automatique est désactivé', () => {
            const { chargement } = monter({ settings: { get: (k) => (k === 'player.maxBitrateAuto' ? false : 0) } });
            expect(chargement.resoudreDebitMax()).toBe(0);
        });

        it('plafonne à 75 % du débit annoncé', () => {
            const { chargement } = monter({ connexion: { downlink: 10 } });
            expect(chargement.resoudreDebitMax()).toBe(7500000);
        });

        it('ne plafonne pas sous 2 Mb/s ni sans connexion', () => {
            const { chargement } = monter({ connexion: { downlink: 1 } });
            expect(chargement.resoudreDebitMax()).toBe(0);
            const sans = monter({ connexion: null });
            expect(sans.chargement.resoudreDebitMax()).toBe(0);
        });

        it('retombe à 0 si la lecture de la connexion lève', () => {
            const { chargement } = monter({ connexion: { get downlink() { throw new Error('boom'); } } });
            expect(chargement.resoudreDebitMax()).toBe(0);
        });
    });

    describe('basculerFluxDirect', () => {
        it('branche le flux statique authentifié et relance la lecture', () => {
            const { chargement, video, auth, journal } = monter();
            chargement.basculerFluxDirect(60, 'tok', 3);
            expect(video.src).toBe(
                'https://serveur.example/Videos/item-1/stream?static=true&api_key=tok');
            expect(video.currentTime).toBe(60);
            expect(video.playbackRate).toBe(1.5);
            expect(video.volume).toBe(0.8);
            expect(video.play).toHaveBeenCalled();
            expect(journal.warn).not.toHaveBeenCalled();
        });

        it('ne fait rien si la génération ne correspond plus ou sans vidéo', () => {
            const { chargement, video } = monter();
            chargement.basculerFluxDirect(0, 'tok', 2); // génération périmée
            expect(video.play).not.toHaveBeenCalled();

            const sansVideo = monter({ video: null });
            sansVideo.chargement.basculerFluxDirect(0, 'tok', 3);
            expect(sansVideo.relancerLecture).not.toHaveBeenCalled();
        });

        it('journalise l échec d auto-play', async () => {
            const play = vi.fn(() => Promise.reject(new Error('bloqué')));
            const { chargement, journal } = monter({ video: { src: '', currentTime: 0, playbackRate: 1, volume: 0.8, play } });
            chargement.basculerFluxDirect(0, 'tok', 3);
            await Promise.resolve();
            expect(journal.warn).toHaveBeenCalledWith('Auto-play direct:', expect.any(Error));
        });
    });

    describe('resoudreFlux', () => {
        const item = {
            MediaStreams: [
                { Type: 'Video', Index: 0 },
                { Type: 'Audio', Index: 1, IsDefault: true },
                { Type: 'Audio', Index: 2 },
                { Type: 'Subtitle', Index: 3, IsForced: true },
                { Type: 'Subtitle', Index: 4 },
            ],
        };

        it('sépare audio/sous-titres et choisit les défauts', () => {
            const { chargement } = monter();
            const etat = chargement.resoudreFlux(item);
            expect(etat.audioStreams.map((s) => s.Index)).toEqual([1, 2]);
            expect(etat.subStreams.map((s) => s.Index)).toEqual([3, 4]);
            expect(etat.selectedAudioIndex).toBe(1);
            expect(etat.selectedSubIndex).toBe(3);
        });

        it('retombe sur le premier flux, et -1/0 sans flux', () => {
            const { chargement } = monter();
            const premier = chargement.resoudreFlux({
                MediaStreams: [
                    { Type: 'Audio', Index: 7 },
                    // Un sous-titre sans IsForced/IsDefault n'est PAS sélectionné
                    // d'office — comportement d'origine, les sous-titres restent
                    // désactivés par défaut sauf choix explicite du serveur.
                    { Type: 'Subtitle', Index: 8, IsDefault: true },
                ],
            });
            expect(premier.selectedAudioIndex).toBe(7);
            expect(premier.selectedSubIndex).toBe(8);

            const vide = chargement.resoudreFlux({});
            expect(vide.audioStreams).toEqual([]);
            expect(vide.subStreams).toEqual([]);
            expect(vide.selectedAudioIndex).toBe(0);
            expect(vide.selectedSubIndex).toBe(-1);
        });
    });

    describe('rechargerAvecOptions', () => {
        it('relance la lecture à la position courante avec les options fusionnées', () => {
            const { chargement, relancerLecture, video, item } = monter();
            video.currentTime = 42;
            chargement.rechargerAvecOptions({ audioStreamIndex: 2 });
            expect(relancerLecture).toHaveBeenCalledWith(item, 420000000, {
                isTrailer: false,
                audioStreamIndex: 2,
            });
        });

        it('ne fait rien sans item ou sans vidéo', () => {
            const { chargement, relancerLecture } = monter({ video: null });
            chargement.rechargerAvecOptions({});
            expect(relancerLecture).not.toHaveBeenCalled();
        });
    });
});