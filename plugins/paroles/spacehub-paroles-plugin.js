/**
 * SpaceHub — greffon de paroles LRCLIB
 *
 * POURQUOI IL EXISTE. `jellyfin/musique/Paroles.js` sait afficher des paroles
 * synchronisées, au mot près quand le fichier porte de l'ELRC. Encore faut-il
 * que le fichier en porte — et c'est rare. LRCLIB est une base publique de
 * paroles synchronisées, **sans clé d'API**, interrogeable par artiste, titre,
 * album et durée.
 *
 * Le greffon s'intercale : le serveur n'a rien → on demande à LRCLIB → on
 * convertit le LRC en la forme que `Paroles.js` attend.
 *
 * LA RÉSERVE, ET IL FAUT LA DIRE
 * ------------------------------
 * LRCLIB sert surtout du **LRC simple**, à la ligne. Le découpage au mot
 * restera l'exception. L'écran de musique le gère déjà — une ligne sans
 * découpage s'allume d'un bloc — mais il ne faut pas laisser espérer un
 * karaoké mot à mot sur toute une médiathèque.
 *
 * LA DURÉE EST LE CRITÈRE QUI ÉVITE LES FAUX POSITIFS. Deux morceaux peuvent
 * partager artiste et titre — une version studio et un live, un original et un
 * remix — avec des paroles décalées de plusieurs secondes. LRCLIB accepte une
 * durée : on la donne, et on refuse un écart de plus de deux secondes. Des
 * paroles décalées sont pires que pas de paroles : elles sont visiblement
 * fausses, en permanence.
 */

'use strict';

const PLUGIN_ID = 'spacehub.paroles';

/** Écart de durée toléré, en secondes. */
const TOLERANCE_DUREE = 2;

/** Un tick Jellyfin vaut 100 ns. */
const TICKS_PAR_SECONDE = 10_000_000;

/**
 * Convertit un LRC en la forme attendue par `Paroles.js`.
 *
 * Le format d'une ligne est `[mm:ss.xx] texte`. Trois pièges :
 *   — les centièmes peuvent avoir deux OU trois chiffres selon l'outil ;
 *   — une même ligne peut porter PLUSIEURS horodatages (un refrain répété),
 *     et il faut alors la produire autant de fois ;
 *   — les balises de métadonnées (`[ar:…]`, `[ti:…]`) ressemblent à des
 *     horodatages et n'en sont pas.
 *
 * @param {string} lrc
 * @returns {Array<{Text: string, Start: number}>} temps en TICKS, comme le
 *   serveur les fournit — l'appelant ne doit pas avoir à distinguer les deux
 *   sources.
 */
export function convertirLrc(lrc) {
    const lignes = [];
    for (const brute of String(lrc || '').split('\n')) {
        const horodatages = [...brute.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
        if (!horodatages.length) continue;

        const texte = brute.replace(/\[[^\]]*\]/g, '').trim();
        for (const h of horodatages) {
            const minutes = Number(h[1]);
            const secondes = Number(h[2]);
            // Deux chiffres = centièmes, trois = millièmes. Les traiter
            // pareil décalerait les paroles d'un facteur dix.
            const fraction = h[3]
                ? Number(h[3]) / (10 ** h[3].length)
                : 0;
            if (!Number.isFinite(minutes) || !Number.isFinite(secondes)) continue;
            const total = minutes * 60 + secondes + fraction;
            lignes.push({ Text: texte, Start: Math.round(total * TICKS_PAR_SECONDE) });
        }
    }
    // Une ligne vide entre deux couplets est une INFORMATION : elle éteint
    // l'affichage pendant l'instrumental. On la garde.
    lignes.sort((a, b) => a.Start - b.Start);
    return lignes;
}

const manifest = {
    id: PLUGIN_ID,
    name: 'Paroles LRCLIB',
    version: '1.0.0',
    apiVersion: '2.0.0',
    author: 'SpaceHub',
    description: 'Récupère des paroles synchronisées sur LRCLIB quand le serveur n\'en a pas. Sans clé d\'API.',
    icon: '🎤',
    isDefault: false,
    permissions: ['network.external.read'],
    contributions: [],

    settingsSchema: [
        {
            cle: 'actif',
            type: 'booleen',
            titre: 'Chercher les paroles manquantes sur LRCLIB',
            defaut: true,
            aide: 'Envoie le titre, l\'artiste et la durée du morceau écouté à lrclib.net.',
        },
    ],

    healthCheck: async (ctx) => {
        if (!ctx?.api?.fetch) throw new Error('Accès réseau indisponible.');
    },

    onEnable: async (ctx) => {
        ctx.log.info('Paroles LRCLIB actives en repli du serveur.');
    },

    /**
     * Cherche des paroles pour un morceau.
     *
     * Exporté sur le manifeste pour être appelable et testable ; c'est le
     * point d'entrée que `Paroles.js` utilise en repli.
     *
     * @param {object} ctx
     * @param {object} morceau  fiche Jellyfin du morceau.
     * @returns {Promise<Array|null>} lignes au format serveur, ou null.
     */
    chercher: async (ctx, morceau) => {
        if (ctx.settings.get('actif', true) !== true) return null;

        const titre = morceau?.Name || morceau?.title || '';
        const artiste = (morceau?.Artists || [])[0] || morceau?.AlbumArtist || '';
        const album = morceau?.Album || '';
        const dureeS = Number(morceau?.RunTimeTicks) / TICKS_PAR_SECONDE;
        if (!titre || !artiste) return null;

        const params = new URLSearchParams({ track_name: titre, artist_name: artiste });
        if (album) params.set('album_name', album);
        if (Number.isFinite(dureeS) && dureeS > 0) params.set('duration', String(Math.round(dureeS)));

        try {
            const res = await ctx.api.fetch(`https://lrclib.net/api/get?${params}`);
            // 404 = LRCLIB ne connaît pas ce morceau. C'est le cas courant, pas
            // une panne : on le traite comme une absence, en silence.
            if (!res.ok) return null;
            const data = await res.json();

            // LA VÉRIFICATION DE DURÉE. Deux morceaux peuvent partager artiste
            // et titre — studio et live, original et remix — avec des paroles
            // décalées de plusieurs secondes. Des paroles décalées sont pires
            // que pas de paroles : elles sont visiblement fausses, en continu.
            const dureeAnnoncee = Number(data?.duration);
            if (Number.isFinite(dureeS) && dureeS > 0 && Number.isFinite(dureeAnnoncee)
                && Math.abs(dureeAnnoncee - dureeS) > TOLERANCE_DUREE) {
                ctx.log.info(`Paroles écartées : ${Math.round(Math.abs(dureeAnnoncee - dureeS))} s d'écart de durée.`);
                return null;
            }

            const synchronisees = data?.syncedLyrics;
            if (!synchronisees) {
                // `plainLyrics` existe parfois seul. On ne l'utilise PAS : des
                // paroles non synchronisées affichées dans un écran conçu pour
                // suivre la musique donneraient un bloc de texte figé, que la
                // personne prendrait pour un défaut de synchronisation.
                return null;
            }
            const lignes = convertirLrc(synchronisees);
            return lignes.length ? lignes : null;
        } catch {
            return null;
        }
    },
};

export default manifest;
