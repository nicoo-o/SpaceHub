/**
 * @vitest-environment jsdom
 *
 * Trois fonctionnalités de salon : clavier téléphone, minuteur, badges.
 *
 * CE QUI LES RÉUNIT : chacune peut MENTIR discrètement.
 *
 * Écrire dans un champ de recherche sans émettre `input` affiche le texte sans
 * relancer la recherche — le symptôme le plus déroutant possible : on voit ce
 * qu'on a tapé, et rien ne bouge.
 *
 * Un minuteur exact à la seconde coupe au milieu d'une scène. C'est conforme
 * et détestable.
 *
 * Un badge « Dolby Vision » posé parce que la fiche du serveur le mentionne,
 * alors que le fichier ne le porte pas, fait conclure à la personne que son
 * matériel ne suit pas. Un badge qui ment est pire que pas de badge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CibleDistante from '../jellyfin/temps-reel/CibleDistante.js';
import { MinuteurSommeil, Mode, MARGE_FIN_MS } from '../core/MinuteurSommeil.js';
import { badges, hauteurEquivalente } from '../jellyfin/player/BadgesQualite.js';

// ─────────────────────────────────────────────────────────────────────────────
describe('Le téléphone comme clavier', () => {
    function poserChampRecherche() {
        document.body.innerHTML = `
            <div class="sh-spotlight-overlay open">
                <input class="sh-spotlight-input" value="" />
            </div>`;
        return document.querySelector('.sh-spotlight-input');
    }

    function fabriquer() {
        const recherche = { open: vi.fn() };
        const cible = new CibleDistante({
            socket: { sur: () => () => {} },
            api: { post: vi.fn(async () => ({})) },
            lecteur: () => null,
            recherche: () => recherche,
            toaster: { show: vi.fn() },
        });
        return { cible, recherche };
    }

    afterEach(() => { document.body.innerHTML = ''; });

    it('déclare SendString ET SendKey', async () => {
        const { cible } = fabriquer();
        const post = cible._api.post;
        await cible.activer();
        const commandes = post.mock.calls[0][1].SupportedCommands;
        // Sans `SendKey`, on obtient un champ dans lequel on ne peut pas
        // corriger : le téléphone ne peut envoyer ni retour arrière ni Entrée.
        expect(commandes).toContain('SendString');
        expect(commandes).toContain('SendKey');
    });

    it('émet un événement `input`, sans quoi rien ne se recherche', () => {
        const champ = poserChampRecherche();
        const vu = vi.fn();
        champ.addEventListener('input', vu);

        const { cible } = fabriquer();
        cible._surCommande({ Name: 'SendString', Arguments: { String: 'Dune' } });

        expect(champ.value).toBe('Dune');
        // CONTRE-ÉPREUVE : une affectation directe de `value` ne déclenche
        // AUCUN événement. Le texte apparaîtrait, et aucun résultat ne bougerait.
        expect(vu).toHaveBeenCalled();
    });

    it('AJOUTE au texte au lieu de le remplacer', () => {
        const champ = poserChampRecherche();
        const { cible } = fabriquer();
        // Un téléphone envoie souvent mot par mot ; remplacer effacerait ce
        // qui précède à chaque envoi.
        cible._surCommande({ Name: 'SendString', Arguments: { String: 'Blade ' } });
        cible._surCommande({ Name: 'SendString', Arguments: { String: 'Runner' } });
        expect(champ.value).toBe('Blade Runner');
    });

    it('corrige avec Retour arrière', () => {
        const champ = poserChampRecherche();
        champ.value = 'Dunee';
        const { cible } = fabriquer();
        cible._surCommande({ Name: 'SendKey', Arguments: { Key: 'Backspace' } });
        expect(champ.value).toBe('Dune');
    });

    it('traite un caractère isolé comme du texte, pas comme une touche', () => {
        const champ = poserChampRecherche();
        const { cible } = fabriquer();
        cible._surCommande({ Name: 'SendKey', Arguments: { Key: 'a' } });
        expect(champ.value).toBe('a');
    });

    it('ouvre la recherche si elle est fermée', () => {
        document.body.innerHTML = '';
        const { cible, recherche } = fabriquer();
        cible._surCommande({ Name: 'SendString', Arguments: { String: 'x' } });
        expect(recherche.open).toHaveBeenCalled();
    });

    it('ne jette pas quand aucun champ n\'existe', () => {
        document.body.innerHTML = '';
        const { cible } = fabriquer();
        expect(() => cible._surCommande({ Name: 'SendKey', Arguments: { Key: 'Backspace' } })).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Minuteur de sommeil', () => {
    let video;
    let lecteur;
    let minuteur;
    let toaster;

    beforeEach(() => {
        vi.useFakeTimers();
        video = {
            duration: 7200, currentTime: 0, pause: vi.fn(),
            _ecouteurs: {},
            addEventListener(t, fn) { (this._ecouteurs[t] ||= []).push(fn); },
            removeEventListener(t, fn) { this._ecouteurs[t] = (this._ecouteurs[t] || []).filter(f => f !== fn); },
            emettre(t) { for (const fn of [...(this._ecouteurs[t] || [])]) fn(); },
        };
        // Le faux lecteur expose l'API PUBLIQUE : l'élément vidéo se lit par
        // `videoElement`, la file par `queue` — plus jamais par un underscore.
        lecteur = { videoElement: video, close: vi.fn() };
        toaster = { show: vi.fn() };
        minuteur = new MinuteurSommeil({ lecteur: () => lecteur, toaster });
    });
    afterEach(() => vi.useRealTimers());

    it('arrête à l\'échéance', () => {
        minuteur.armer({ minutes: 30 });
        expect(minuteur.actif).toBe(true);
        vi.advanceTimersByTime(30 * 60 * 1000);
        expect(lecteur.close).toHaveBeenCalled();
        expect(minuteur.actif).toBe(false);
    });

    it('prévient une minute avant', () => {
        minuteur.armer({ minutes: 30 });
        toaster.show.mockClear();
        vi.advanceTimersByTime(29 * 60 * 1000);
        // Sans cet avertissement, quelqu'un encore éveillé voit son film
        // s'arrêter sans comprendre, et le minuteur passe pour une panne.
        expect(toaster.show).toHaveBeenCalled();
        expect(lecteur.close).not.toHaveBeenCalled();
    });

    it('ATTEND la fin du titre si elle est proche', () => {
        // Il reste trois minutes de film à l'échéance.
        video.currentTime = 7200 - 180;
        minuteur.armer({ minutes: 30 });
        vi.advanceTimersByTime(30 * 60 * 1000);

        // CONTRE-ÉPREUVE : couper à trois minutes de la fin pour respecter un
        // minuteur à la seconde près est le genre d'exactitude que personne ne
        // demande.
        expect(lecteur.close).not.toHaveBeenCalled();
        expect(minuteur.mode).toBe(Mode.FIN_TITRE);

        video.emettre('ended');
        expect(lecteur.close).toHaveBeenCalled();
    });

    it('coupe quand il reste plus que la marge', () => {
        video.currentTime = 7200 - (MARGE_FIN_MS / 1000) - 60;
        minuteur.armer({ minutes: 30 });
        vi.advanceTimersByTime(30 * 60 * 1000);
        expect(lecteur.close).toHaveBeenCalled();
    });

    it('met en pause AVANT de fermer', () => {
        minuteur.armer({ minutes: 1 });
        vi.advanceTimersByTime(60 * 1000);
        // Fermer d'abord laisserait le son continuer une fraction de seconde
        // sur certains navigateurs.
        expect(video.pause).toHaveBeenCalled();
        const ordrePause = video.pause.mock.invocationCallOrder[0];
        const ordreClose = lecteur.close.mock.invocationCallOrder[0];
        expect(ordrePause).toBeLessThan(ordreClose);
    });

    it('mode « fin du titre » attend l\'événement', () => {
        expect(minuteur.armer({ mode: Mode.FIN_TITRE })).toBe(true);
        expect(minuteur.restantMs).toBeNull();
        vi.advanceTimersByTime(4 * 60 * 60 * 1000);
        expect(lecteur.close).not.toHaveBeenCalled();
        video.emettre('ended');
        expect(lecteur.close).toHaveBeenCalled();
    });

    it('refuse le mode « fin du titre » quand rien ne joue', () => {
        lecteur.videoElement = null;
        expect(minuteur.armer({ mode: Mode.FIN_TITRE })).toBe(false);
        expect(minuteur.actif).toBe(false);
    });

    it('annuler retire l\'écouteur et les minuteurs', () => {
        minuteur.armer({ mode: Mode.FIN_TITRE });
        expect(minuteur.annuler()).toBe(true);
        video.emettre('ended');
        // Un écouteur qui survit à l'annulation ferme le lecteur bien plus
        // tard, sans que rien ne l'explique.
        expect(lecteur.close).not.toHaveBeenCalled();

        minuteur.armer({ minutes: 5 });
        minuteur.annuler();
        vi.advanceTimersByTime(10 * 60 * 1000);
        expect(lecteur.close).not.toHaveBeenCalled();
    });

    it('réarmer remplace, sans cumuler', () => {
        minuteur.armer({ minutes: 5 });
        minuteur.armer({ minutes: 60 });
        vi.advanceTimersByTime(6 * 60 * 1000);
        expect(lecteur.close).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Badges de qualité', () => {
    const flux = (...s) => ({ MediaStreams: s });

    it('classe la résolution sur la hauteur ÉQUIVALENTE 16:9', () => {
        // Un film scope fait 1920 × 804. Le classer « 720p » sur sa hauteur
        // réelle serait exact au pixel près et faux dans tous les sens qui
        // comptent : studio, site de référence et spectateur disent « 1080p ».
        expect(hauteurEquivalente(1920, 804)).toBe(1080);
        expect(hauteurEquivalente(3840, 1600)).toBe(2160);
        expect(hauteurEquivalente(1920, 1080)).toBe(1080);

        expect(badges(flux({ Type: 'Video', Width: 1920, Height: 804 }))[0].libelle).toBe('1080p');
        expect(badges(flux({ Type: 'Video', Width: 3840, Height: 1600 }))[0].libelle).toBe('4K');
    });

    it('garde les dimensions réelles dans l\'infobulle', () => {
        // Le badge simplifie ; il ne doit pas rendre la vérité inaccessible.
        expect(badges(flux({ Type: 'Video', Width: 1920, Height: 804 }))[0].titre).toBe('1920 × 804');
    });

    it('distingue Dolby Vision de HDR10', () => {
        const dv = badges(flux({ Type: 'Video', Width: 3840, Height: 2160, VideoRangeType: 'DOVI' }));
        expect(dv.map(b => b.libelle)).toContain('Dolby Vision');
        const hdr = badges(flux({ Type: 'Video', Width: 3840, Height: 2160, VideoRangeType: 'HDR10' }));
        expect(hdr.map(b => b.libelle)).toContain('HDR10');
        expect(hdr.map(b => b.libelle)).not.toContain('Dolby Vision');
    });

    it('annonce la couche de repli d\'un DOVIWithHDR10', () => {
        // Un téléviseur sans Dolby Vision lira la couche HDR10 : le dire évite
        // à son propriétaire de croire qu'il ne verra rien.
        const l = badges(flux({ Type: 'Video', Width: 3840, Height: 2160, VideoRangeType: 'DOVIWithHDR10' }))
            .map(b => b.libelle);
        expect(l).toContain('Dolby Vision');
        expect(l).toContain('HDR10');
    });

    it('dit « HDR » sans préciser quand le serveur ne précise pas', () => {
        // CONTRE-ÉPREUVE DU MENSONGE : annoncer « HDR10 » au hasard sur un
        // serveur ancien serait une invention.
        const l = badges(flux({ Type: 'Video', Width: 1920, Height: 1080, VideoRange: 'HDR' }))
            .map(b => b.libelle);
        expect(l).toContain('HDR');
        expect(l).not.toContain('HDR10');
    });

    it('lit Atmos dans le profil, pas dans le nombre de canaux', () => {
        const avec = badges(flux(
            { Type: 'Video', Width: 1920, Height: 1080 },
            { Type: 'Audio', Codec: 'truehd', Profile: 'TrueHD Atmos' }));
        expect(avec.map(b => b.libelle)).toContain('Atmos');

        // 7.1 n'est PAS Atmos, et le déduire du nombre de canaux serait faux.
        const sans = badges(flux(
            { Type: 'Video', Width: 1920, Height: 1080 },
            { Type: 'Audio', Codec: 'eac3', Channels: 8 }));
        expect(sans.map(b => b.libelle)).not.toContain('Atmos');
    });

    it('n\'affiche qu\'un seul badge audio', () => {
        const l = badges(flux(
            { Type: 'Video', Width: 1920, Height: 1080 },
            { Type: 'Audio', Profile: 'TrueHD Atmos' },
            { Type: 'Audio', Profile: 'DTS-X' }));
        // Trois badges audio d'affilée n'informent plus, ils encombrent.
        expect(l.filter(b => ['Atmos', 'DTS:X', 'TrueHD'].includes(b.libelle))).toHaveLength(1);
    });

    it('lit la BONNE version quand un titre en a plusieurs', () => {
        const item = { MediaSources: [
            { Id: 'src-4k', MediaStreams: [{ Type: 'Video', Width: 3840, Height: 2160 }] },
            { Id: 'src-hd', MediaStreams: [{ Type: 'Video', Width: 1280, Height: 720 }] },
        ] };
        // Annoncer les badges de la version 4K alors qu'on lit la version
        // légère est exactement le mensonge que ce module refuse.
        expect(badges(item, 'src-hd')[0].libelle).toBe('720p');
        expect(badges(item, 'src-4k')[0].libelle).toBe('4K');
    });

    it('ne renvoie rien plutôt que d\'inventer', () => {
        expect(badges(null)).toEqual([]);
        expect(badges({})).toEqual([]);
        expect(badges({ MediaStreams: [] })).toEqual([]);
    });
});
