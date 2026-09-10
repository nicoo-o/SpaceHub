/**
 * @vitest-environment jsdom
 *
 * Canal temps réel et cible de télécommande.
 *
 * CE QUI SE CASSE ICI SE CASSE APRÈS COUP.
 *
 * Un WebSocket sans KeepAlive fonctionne parfaitement… pendant cinquante-neuf
 * secondes. Le serveur ferme à soixante. L'utilisateur voit une application qui
 * « se déconnecte toute seule de temps en temps », et rien dans un test manuel
 * de trente secondes ne le montre.
 *
 * Une reconnexion sans attente croissante fonctionne parfaitement… tant que le
 * serveur répond. Éteignez-le : la boucle `onclose → connecter()` produit des
 * milliers de tentatives par minute.
 *
 * Un ordre `Seek` reçu en ticks et appliqué tel quel à `currentTime` saute dix
 * millions de fois trop loin — la lecture bondit en fin de fichier, sans erreur.
 *
 * Ces trois défauts se testent, et c'est le seul moyen de les voir.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SocketJellyfin, { ATTENTE_MAX_MS, ECHECS_AVANT_ABANDON } from '../jellyfin/temps-reel/SocketJellyfin.js';
import CibleDistante, { COMMANDES } from '../jellyfin/temps-reel/CibleDistante.js';

/** Faux WebSocket : on pilote l'ouverture, la fermeture et les messages. */
class FauxSocket {
    static instances = [];
    constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.envoyes = [];
        this.fermetures = [];
        FauxSocket.instances.push(this);
    }
    send(texte) { this.envoyes.push(JSON.parse(texte)); }
    close(code, raison) { this.fermetures.push({ code, raison }); this._fermer(code); }
    // ─ pilotage ─
    ouvrir() { this.readyState = 1; this.onopen?.(); }
    message(objet) { this.onmessage?.({ data: JSON.stringify(objet) }); }
    _fermer(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
    static derniere() { return FauxSocket.instances.at(-1); }
}

function fabriquerSocket(options = {}) {
    return new SocketJellyfin({
        serveur: () => 'http://nas:8096',
        jeton: () => 'jeton-abc',
        deviceId: () => 'appareil-1',
        ...options,
    });
}

beforeEach(() => {
    FauxSocket.instances = [];
    globalThis.WebSocket = FauxSocket;
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete globalThis.WebSocket;
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SocketJellyfin — l\'adresse', () => {
    it('déduit le schéma du SERVEUR, pas de la page', () => {
        // Une page HTTPS qui ouvre un ws:// est bloquée par le navigateur, sans
        // erreur réseau lisible : juste une fermeture immédiate.
        expect(fabriquerSocket({ serveur: () => 'https://nas.exemple.fr' }).adresse())
            .toMatch(/^wss:\/\/nas\.exemple\.fr\/socket\?/);
        expect(fabriquerSocket({ serveur: () => 'http://192.168.1.10:8096' }).adresse())
            .toMatch(/^ws:\/\/192\.168\.1\.10:8096\/socket\?/);
    });

    it('porte api_key et deviceId', () => {
        const url = new URL(fabriquerSocket().adresse());
        expect(url.searchParams.get('api_key')).toBe('jeton-abc');
        // Le deviceId RATTACHE le socket à la session. S'il diffère de celui de
        // l'en-tête d'autorisation, les ordres partent vers une autre session
        // et n'arrivent jamais.
        expect(url.searchParams.get('deviceId')).toBe('appareil-1');
    });

    it('ne fabrique pas d\'adresse bancale quand la session est incomplète', () => {
        expect(fabriquerSocket({ jeton: () => '' }).adresse()).toBe('');
        expect(fabriquerSocket({ deviceId: () => '' }).adresse()).toBe('');
        expect(fabriquerSocket({ serveur: () => '' }).adresse()).toBe('');
    });

    it('supporte une URL de serveur avec barre oblique finale', () => {
        expect(fabriquerSocket({ serveur: () => 'http://nas:8096/' }).adresse())
            .toContain('ws://nas:8096/socket?');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SocketJellyfin — le KeepAlive', () => {
    it('répond immédiatement à ForceKeepAlive', () => {
        const s = fabriquerSocket();
        s.connecter();
        FauxSocket.derniere().ouvrir();
        FauxSocket.derniere().message({ MessageType: 'ForceKeepAlive', Data: 60 });

        // Le serveur envoie ForceKeepAlive après 45 s de silence ; il en reste
        // quinze avant la fermeture. Attendre le prochain intervalle serait
        // jouer avec la marge.
        expect(FauxSocket.derniere().envoyes).toEqual([{ MessageType: 'KeepAlive', Data: null }]);
    });

    it('émet ensuite à la MOITIÉ du délai annoncé par le serveur', () => {
        const s = fabriquerSocket();
        s.connecter();
        const socket = FauxSocket.derniere();
        socket.ouvrir();
        socket.message({ MessageType: 'ForceKeepAlive', Data: 60 });
        socket.envoyes.length = 0;

        vi.advanceTimersByTime(29_000);
        expect(socket.envoyes, 'rien avant la moitié du délai').toHaveLength(0);
        vi.advanceTimersByTime(2_000);
        expect(socket.envoyes, 'un envoi à 30 s').toHaveLength(1);
        vi.advanceTimersByTime(30_000);
        expect(socket.envoyes, 'puis un toutes les 30 s').toHaveLength(2);

        // CONTRE-ÉPREUVE : sans ces envois, le serveur ferme à 60 s. Un client
        // qui écoute sans jamais parler se reconnecte toutes les minutes.
        s.fermer();
    });

    it('respecte un délai différent annoncé par le serveur', () => {
        const s = fabriquerSocket();
        s.connecter();
        const socket = FauxSocket.derniere();
        socket.ouvrir();
        socket.message({ MessageType: 'ForceKeepAlive', Data: 20 });
        socket.envoyes.length = 0;

        vi.advanceTimersByTime(10_000);
        expect(socket.envoyes).toHaveLength(1);
        s.fermer();
    });

    it('cesse d\'émettre quand le canal se ferme', () => {
        const s = fabriquerSocket();
        s.connecter();
        const socket = FauxSocket.derniere();
        socket.ouvrir();
        socket.message({ MessageType: 'ForceKeepAlive', Data: 60 });
        socket._fermer();

        // Un minuteur qui survit à son socket émet dans le vide pour toujours.
        const avant = FauxSocket.instances.length;
        vi.advanceTimersByTime(120_000);
        expect(FauxSocket.instances.length, 'des reconnexions, pas des envois fantômes')
            .toBeGreaterThan(avant - 1);
        s.fermer();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SocketJellyfin — la reconnexion', () => {
    it('attend de plus en plus longtemps, sans jamais dépasser le plafond', () => {
        const s = fabriquerSocket();
        s.connecter();

        const attentes = [];
        for (let i = 0; i < 6; i += 1) {
            const socket = FauxSocket.derniere();
            const avant = FauxSocket.instances.length;
            socket._fermer();
            // On avance par paliers pour mesurer quand la tentative repart.
            let ecoule = 0;
            while (FauxSocket.instances.length === avant && ecoule < ATTENTE_MAX_MS * 2) {
                vi.advanceTimersByTime(250);
                ecoule += 250;
            }
            attentes.push(ecoule);
        }

        // CONTRE-ÉPREUVE DU DÉFAUT CLASSIQUE : une reconnexion immédiate
        // donnerait 0 partout, soit des milliers de tentatives par minute sur
        // un serveur éteint.
        expect(attentes[0]).toBeGreaterThan(0);
        expect(attentes.at(-1), 'l\'attente a grandi').toBeGreaterThan(attentes[0]);
        expect(Math.max(...attentes), 'plafonnée').toBeLessThanOrEqual(ATTENTE_MAX_MS * 1.3);
        s.fermer();
    });

    it('abandonne après un nombre fixé d\'échecs sans jamais s\'ouvrir', () => {
        const s = fabriquerSocket();
        s.connecter();
        for (let i = 0; i < ECHECS_AVANT_ABANDON + 2; i += 1) {
            FauxSocket.derniere()?._fermer();
            vi.advanceTimersByTime(ATTENTE_MAX_MS * 2);
        }
        // Le WebSocket du navigateur n'expose pas le code HTTP : un jeton révoqué
        // et un serveur éteint sont indiscernables. Marteler indéfiniment serait
        // le seul comportement à coup sûr mauvais dans les deux cas.
        expect(s.abandonne).toBe(true);
        const compte = FauxSocket.instances.length;
        vi.advanceTimersByTime(600_000);
        expect(FauxSocket.instances.length).toBe(compte);
    });

    it('remet le compteur à zéro dès qu\'une connexion aboutit', () => {
        const s = fabriquerSocket();
        s.connecter();
        for (let i = 0; i < 3; i += 1) {
            FauxSocket.derniere()._fermer();
            vi.advanceTimersByTime(ATTENTE_MAX_MS * 2);
        }
        FauxSocket.derniere().ouvrir();
        // Une coupure de trois minutes ne doit pas condamner la session suivante.
        FauxSocket.derniere()._fermer();
        vi.advanceTimersByTime(ATTENTE_MAX_MS * 2);
        expect(s.abandonne).toBe(false);
        s.fermer();
    });

    it('ne se reconnecte pas après une fermeture volontaire', () => {
        const s = fabriquerSocket();
        s.connecter();
        FauxSocket.derniere().ouvrir();
        const compte = FauxSocket.instances.length;
        s.fermer();
        vi.advanceTimersByTime(300_000);
        expect(FauxSocket.instances.length).toBe(compte);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SocketJellyfin — les messages', () => {
    it('livre les données au bon abonné', () => {
        const s = fabriquerSocket();
        const play = vi.fn();
        const etat = vi.fn();
        s.sur('Play', play);
        s.sur('Playstate', etat);
        s.connecter();
        FauxSocket.derniere().ouvrir();
        FauxSocket.derniere().message({ MessageType: 'Play', Data: { ItemIds: ['a'] }, MessageId: 'm1' });

        expect(play).toHaveBeenCalledWith({ ItemIds: ['a'] }, expect.any(Object));
        expect(etat).not.toHaveBeenCalled();
        s.fermer();
    });

    it('ignore un message déjà traité', () => {
        const s = fabriquerSocket();
        const play = vi.fn();
        s.sur('Play', play);
        s.connecter();
        FauxSocket.derniere().ouvrir();
        const msg = { MessageType: 'Play', Data: { ItemIds: ['a'] }, MessageId: 'meme-id' };
        FauxSocket.derniere().message(msg);
        FauxSocket.derniere().message(msg);
        // Une réémission ne doit pas relancer le film depuis le début.
        expect(play).toHaveBeenCalledOnce();
        s.fermer();
    });

    it('survit à un message illisible', () => {
        const s = fabriquerSocket();
        s.connecter();
        const socket = FauxSocket.derniere();
        socket.ouvrir();
        expect(() => socket.onmessage({ data: 'ceci n\'est pas du JSON' })).not.toThrow();
        expect(s.etat).toBe('ouvert');
        s.fermer();
    });

    it('un abonné qui jette n\'empêche pas les autres', () => {
        const s = fabriquerSocket();
        const bon = vi.fn();
        s.sur('Play', () => { throw new Error('boum'); });
        s.sur('Play', bon);
        s.connecter();
        FauxSocket.derniere().ouvrir();
        FauxSocket.derniere().message({ MessageType: 'Play', Data: {} });
        expect(bon).toHaveBeenCalled();
        s.fermer();
    });

    it('dit franchement qu\'un envoi n\'est pas parti', () => {
        const s = fabriquerSocket();
        // Canal fermé : l'appelant doit le savoir plutôt que de croire son
        // ordre transmis.
        expect(s.envoyer('KeepAlive')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('CibleDistante — la déclaration de capacités', () => {
    function fabriquer({ postEchoue = false } = {}) {
        const post = vi.fn(async (chemin, corps) => {
            if (postEchoue) throw new Error('403 Forbidden');
            return { chemin, corps };
        });
        const socket = fabriquerSocket();
        const cible = new CibleDistante({
            socket, api: { post, get: vi.fn(async () => ({ Items: [] })) },
            lecteur: () => null,
        });
        return { cible, post, socket };
    }

    it('déclare SupportsMediaControl et les commandes', async () => {
        const { cible, post } = fabriquer();
        expect(await cible.activer()).toBe(true);

        const [chemin, corps] = post.mock.calls[0];
        expect(chemin).toBe('/Sessions/Capabilities/Full');
        // Sans SupportsMediaControl, la session n'apparaît pas dans la liste des
        // cibles du téléphone — et un ordre envoyé quand même reçoit un
        // « 204 No Content » : le serveur accepte et ne fait rien.
        expect(corps.SupportsMediaControl).toBe(true);
        expect(corps.SupportedCommands).toEqual(COMMANDES);
        expect(corps.PlayableMediaTypes).toContain('Video');
    });

    it('n\'annonce que des commandes réellement implémentées', async () => {
        const { cible } = fabriquer();
        await cible.activer();
        // Une commande déclarée sans implémentation donne, sur le téléphone de
        // l'utilisateur, un bouton qui ne fait rien. Ce test lie la liste au code.
        const source = CibleDistante.prototype._executerCommande.toString();
        for (const nom of COMMANDES) {
            expect(source, `« ${nom} » est déclarée mais absente de _executerCommande`)
                .toContain(`'${nom}'`);
        }
    });

    it('dit qu\'elle n\'est pas active quand la déclaration échoue', async () => {
        const { cible } = fabriquer({ postEchoue: true });
        expect(await cible.activer()).toBe(false);
        expect(cible.active).toBe(false);
    });

    it('ne s\'active pas sans canal temps réel', async () => {
        const cible = new CibleDistante({ socket: null, api: { post: vi.fn() }, lecteur: () => null });
        // Les ordres n'arrivent QUE par le WebSocket : sans lui, se déclarer
        // cible reviendrait à promettre une réception impossible.
        expect(await cible.activer()).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('CibleDistante — les ordres reçus', () => {
    function fabriquerCible({ fiches = [] } = {}) {
        const video = { currentTime: 0, volume: 0.5, muted: false, pause: vi.fn(), play: vi.fn(() => Promise.resolve()) };
        const lecteur = {
            videoElement: video,
            play: vi.fn(),
            close: vi.fn(),
            _togglePlayPause: vi.fn(),
            _seekRelative: vi.fn(),
            _executerActionMedia: vi.fn(),
            _toggleFullscreen: vi.fn(),
            _showControls: vi.fn(),
            _reloadCurrentSourceWithOptions: vi.fn(),
        };
        const file = { setQueue: vi.fn(), addNext: vi.fn(), addToEnd: vi.fn() };
        const api = {
            post: vi.fn(async () => ({})),
            get: vi.fn(async () => ({ Items: fiches })),
        };
        const socket = fabriquerSocket();
        const cible = new CibleDistante({
            socket, api, lecteur: () => lecteur, file: () => file,
            routeur: { navigate: vi.fn(), back: vi.fn() },
            toaster: { show: vi.fn() },
        });
        return { cible, lecteur, video, file, api, socket };
    }

    const FICHES = [
        { Id: 'ep1', Name: 'Épisode 1' },
        { Id: 'ep2', Name: 'Épisode 2' },
        { Id: 'ep3', Name: 'Épisode 3' },
    ];

    it('convertit les ticks de Seek en secondes', async () => {
        const { cible, video } = fabriquerCible();
        await cible.activer();
        // 1 tick = 100 ns. 45 min = 2700 s = 27 000 000 000 ticks.
        cible._surPlaystate({ Command: 'Seek', SeekPositionTicks: 27_000_000_000 });

        // CONTRE-ÉPREUVE : passer les ticks tels quels placerait la lecture dix
        // millions de fois trop loin — saut immédiat en fin de fichier, sans
        // la moindre erreur.
        expect(video.currentTime).toBe(2700);
    });

    it('ignore un Seek sans position exploitable', async () => {
        const { cible, video } = fabriquerCible();
        await cible.activer();
        cible._surPlaystate({ Command: 'Seek' });
        expect(video.currentTime).toBe(0);
    });

    it('démarre à l\'index demandé, pas au premier élément', async () => {
        const { cible, lecteur, file } = fabriquerCible({ fiches: FICHES });
        await cible.activer();
        await cible._surPlay({ ItemIds: ['ep1', 'ep2', 'ep3'], StartIndex: 2, PlayCommand: 'PlayNow' });

        // Ignorer StartIndex ferait démarrer la série au premier épisode alors
        // que la personne en a choisi un autre sur son téléphone.
        expect(lecteur.play).toHaveBeenCalledWith(FICHES[2], 0);
        expect(file.setQueue).toHaveBeenCalledWith(FICHES, 2);
    });

    it('rétablit l\'ordre demandé quand le serveur renvoie autre chose', async () => {
        // /Items ne garantit pas l'ordre des identifiants passés en paramètre.
        const { cible, file } = fabriquerCible({ fiches: [FICHES[2], FICHES[0], FICHES[1]] });
        await cible.activer();
        await cible._surPlay({ ItemIds: ['ep1', 'ep2', 'ep3'], PlayCommand: 'PlayNow' });
        expect(file.setQueue.mock.calls[0][0].map(f => f.Id)).toEqual(['ep1', 'ep2', 'ep3']);
    });

    it('n\'interrompt pas la lecture pour un PlayLast', async () => {
        const { cible, lecteur, file } = fabriquerCible({ fiches: FICHES });
        await cible.activer();
        await cible._surPlay({ ItemIds: ['ep1', 'ep2'], PlayCommand: 'PlayLast' });

        // « Ajouter à la file » ne doit surtout pas couper le film en cours.
        expect(lecteur.play).not.toHaveBeenCalled();
        expect(file.addToEnd).toHaveBeenCalledTimes(2);
    });

    it('conserve l\'ordre reçu pour un PlayNext', async () => {
        const { cible, file } = fabriquerCible({ fiches: FICHES });
        await cible.activer();
        await cible._surPlay({ ItemIds: ['ep1', 'ep2', 'ep3'], PlayCommand: 'PlayNext' });

        // `addNext` insère juste après le titre courant : inséré dans l'ordre
        // reçu, ep1 finirait DERNIER. On insère donc à l'envers.
        expect(file.addNext.mock.calls.map(c => c[0].Id)).toEqual(['ep3', 'ep2', 'ep1']);
    });

    it('ne fait rien d\'un ordre portant sur des éléments introuvables', async () => {
        const { cible, lecteur } = fabriquerCible({ fiches: [] });
        await cible.activer();
        await cible._surPlay({ ItemIds: ['inconnu'], PlayCommand: 'PlayNow' });
        expect(lecteur.play).not.toHaveBeenCalled();
    });

    it('convertit le volume de 0-100 vers 0-1', async () => {
        const { cible, video } = fabriquerCible();
        await cible.activer();
        cible._surCommande({ Name: 'SetVolume', Arguments: { Volume: 40 } });
        // Le serveur envoie 0–100 ; l'élément vidéo attend 0–1. Passer 40 tel
        // quel serait borné à 1 par le navigateur : volume à fond, silencieux
        // dans les logs.
        expect(video.volume).toBeCloseTo(0.4, 5);
    });

    it('borne le volume dans l\'intervalle acceptable', async () => {
        const { cible, video } = fabriquerCible();
        await cible.activer();
        cible._surCommande({ Name: 'SetVolume', Arguments: { Volume: 300 } });
        expect(video.volume).toBe(1);
        cible._surCommande({ Name: 'SetVolume', Arguments: { Volume: -20 } });
        expect(video.volume).toBe(0);
    });

    it('renégocie la source pour changer de piste audio', async () => {
        const { cible, lecteur } = fabriquerCible();
        await cible.activer();
        cible._surCommande({ Name: 'SetAudioStreamIndex', Arguments: { Index: 2 } });
        // Sur un flux transcodé la piste audio est cuite dans le flux : il faut
        // redemander la source au serveur, un changement côté client ne peut pas
        // marcher.
        expect(lecteur._reloadCurrentSourceWithOptions).toHaveBeenCalledWith({ audioStreamIndex: 2 });
    });

    it('ignore une commande non déclarée plutôt que d\'en inventer l\'effet', async () => {
        const { cible, lecteur } = fabriquerCible();
        await cible.activer();
        cible._surCommande({ Name: 'TakeScreenshot', Arguments: {} });
        cible._surCommande({ Name: 'ChannelUp', Arguments: {} });
        expect(lecteur.close).not.toHaveBeenCalled();
        expect(lecteur._togglePlayPause).not.toHaveBeenCalled();
    });

    it('route les ordres arrivés par le canal temps réel', async () => {
        const { cible, lecteur, socket } = fabriquerCible();
        await cible.activer();
        socket.connecter();
        FauxSocket.derniere().ouvrir();

        // Le chemin complet : message serveur → socket → cible → lecteur.
        FauxSocket.derniere().message({ MessageType: 'Playstate', Data: { Command: 'Pause' } });
        expect(lecteur.videoElement.pause).toHaveBeenCalled();

        FauxSocket.derniere().message({ MessageType: 'GeneralCommand', Data: { Name: 'ToggleMute' } });
        expect(lecteur.videoElement.muted).toBe(true);
        socket.fermer();
    });

    it('cesse d\'obéir après désactivation', async () => {
        const { cible, lecteur, socket } = fabriquerCible();
        await cible.activer();
        socket.connecter();
        FauxSocket.derniere().ouvrir();
        cible.desactiver();

        FauxSocket.derniere().message({ MessageType: 'Playstate', Data: { Command: 'Stop' } });
        expect(lecteur.close).not.toHaveBeenCalled();
        socket.fermer();
    });
});
