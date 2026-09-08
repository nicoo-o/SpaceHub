/**
 * SpaceHub — badges de qualité, lus du fichier et de rien d'autre
 *
 * HDR10, Dolby Vision, HDR10+, Atmos, DTS-X, la résolution vraie. Toute
 * l'information est déjà dans les `MediaStreams` que l'application télécharge
 * pour négocier la lecture ; elle n'était simplement pas affichée.
 *
 * LA SEULE RÈGLE QUI COMPTE
 * -------------------------
 * On n'affiche un badge que si le FICHIER le porte. Jamais parce que le titre
 * est « censé » exister en Dolby Vision, jamais parce que la fiche du serveur
 * le mentionne dans un texte libre. Un badge qui ment sur ce qu'on va voir est
 * pire que pas de badge : il transforme une information en promesse, et la
 * personne conclut que son matériel ne suit pas alors que le fichier ne
 * contenait rien de tel.
 *
 * CE QUE JELLYFIN DONNE, ET SES PIÈGES
 * ------------------------------------
 *   — `VideoRange` vaut « SDR » ou « HDR ». C'est trop grossier : il ne
 *     distingue pas HDR10 de Dolby Vision.
 *   — `VideoRangeType` (10.9+) précise : « HDR10 », « HLG », « DOVI »,
 *     « HDR10Plus », « DOVIWithHDR10 »… C'est celui qu'il faut lire, avec
 *     repli sur le premier quand le serveur est ancien.
 *   — Le son Atmos n'a PAS de champ dédié. Il apparaît dans `Profile`
 *     (« TrueHD Atmos ») ou dans `Title`. On lit les deux, et on ne devine pas
 *     à partir du seul nombre de canaux : 7.1 n'est pas Atmos.
 *   — La résolution : `Width`/`Height` du flux, pas le nom du fichier. Un
 *     fichier appelé « 2160p » peut contenir du 1080p.
 */

'use strict';

/**
 * Paliers de résolution, sur la hauteur ÉQUIVALENTE en 16:9.
 *
 * CLASSER SUR LA SEULE HAUTEUR EST FAUX POUR L'UTILISATEUR. Un film au format
 * scope (2,39:1) fait 1920 × 804 : sa hauteur réelle est de 804 pixels, et
 * pourtant tout le monde — le studio, le site de référence, la personne devant
 * son écran — l'appelle « 1080p ». Le classer « 720p » serait exact au pixel
 * près et faux dans tous les sens qui comptent.
 *
 * On retient donc la plus grande des deux valeurs : la hauteur réelle, et la
 * hauteur qu'aurait cette largeur en 16:9. Un 3840 × 1600 devient ainsi 2160,
 * donc « 4K », ce qu'il est.
 */
const PALIERS = [
    { hauteur: 2000, nom: '4K' },
    { hauteur: 1400, nom: '1440p' },
    { hauteur: 900, nom: '1080p' },
    { hauteur: 600, nom: '720p' },
    { hauteur: 0, nom: 'SD' },
];

/** Hauteur équivalente 16:9, en pixels. */
export function hauteurEquivalente(largeur, hauteur) {
    const l = Number(largeur);
    const h = Number(hauteur);
    if (!Number.isFinite(h) || h <= 0) return 0;
    if (!Number.isFinite(l) || l <= 0) return h;
    return Math.max(h, Math.round((l * 9) / 16));
}

/** Marques Atmos et DTS:X telles qu'elles apparaissent réellement. */
const MOTIFS_AUDIO = [
    { motif: /atmos/i, badge: 'Atmos' },
    { motif: /dts[\s:_-]*x/i, badge: 'DTS:X' },
    { motif: /truehd/i, badge: 'TrueHD' },
];

/**
 * @param {object} item  fiche Jellyfin, ou toute chose portant MediaStreams.
 * @param {string|null} [mediaSourceId]  la version lue, si plusieurs existent.
 * @returns {Array<{cle: string, libelle: string, titre: string}>}
 */
export function badges(item, mediaSourceId = null) {
    const flux = _flux(item, mediaSourceId);
    if (!flux.length) return [];

    const sortie = [];
    const video = flux.find(f => f?.Type === 'Video');
    const audios = flux.filter(f => f?.Type === 'Audio');

    if (video) {
        const equivalente = hauteurEquivalente(video.Width, video.Height);
        if (equivalente > 0) {
            const palier = PALIERS.find(p => equivalente >= p.hauteur);
            // L'infobulle donne les dimensions RÉELLES : le badge simplifie,
            // il ne doit pas rendre la vérité inaccessible.
            sortie.push({ cle: 'resolution', libelle: palier.nom,
                titre: `${video.Width || '?'} × ${video.Height || '?'}` });
        }

        // `VideoRangeType` d'abord : « HDR » tout court ne distingue pas
        // HDR10 de Dolby Vision, et c'est précisément la distinction qui
        // intéresse quelqu'un qui a payé pour un téléviseur Dolby Vision.
        const type = String(video.VideoRangeType || '').toUpperCase();
        const plage = String(video.VideoRange || '').toUpperCase();
        if (type.includes('DOVI')) {
            sortie.push({ cle: 'dv', libelle: 'Dolby Vision', titre: video.VideoRangeType });
            // « DOVIWithHDR10 » porte les deux : le fichier a une couche de
            // repli HDR10, et un téléviseur sans Dolby Vision la lira.
            if (type.includes('HDR10')) {
                sortie.push({ cle: 'hdr10', libelle: 'HDR10', titre: 'Couche de repli HDR10' });
            }
        } else if (type.includes('HDR10PLUS')) {
            sortie.push({ cle: 'hdr10plus', libelle: 'HDR10+', titre: video.VideoRangeType });
        } else if (type.includes('HDR10')) {
            sortie.push({ cle: 'hdr10', libelle: 'HDR10', titre: video.VideoRangeType });
        } else if (type.includes('HLG')) {
            sortie.push({ cle: 'hlg', libelle: 'HLG', titre: video.VideoRangeType });
        } else if (plage === 'HDR') {
            // Serveur ancien : on sait que c'est du HDR, pas lequel. On le dit
            // ainsi plutôt que d'annoncer HDR10 au hasard.
            sortie.push({ cle: 'hdr', libelle: 'HDR', titre: 'Type non précisé par le serveur' });
        }
    }

    // Le son : on prend le MEILLEUR badge disponible parmi toutes les pistes,
    // parce qu'un fichier porte souvent une piste Atmos et une piste stéréo de
    // repli, et c'est la première qui mérite d'être annoncée.
    for (const { motif, badge } of MOTIFS_AUDIO) {
        const trouve = audios.find(a => motif.test(`${a?.Profile || ''} ${a?.Title || ''} ${a?.Codec || ''}`));
        if (trouve) {
            sortie.push({ cle: badge.toLowerCase(), libelle: badge,
                titre: trouve.Profile || trouve.Title || badge });
            break;   // un seul badge audio : trois d'affilée n'informent plus
        }
    }
    return sortie;
}

/**
 * Extrait les flux de la bonne source.
 *
 * Un titre à plusieurs versions a plusieurs `MediaSources` ; annoncer les
 * badges de la version 4K alors qu'on lit la version légère serait exactement
 * le mensonge que ce module refuse.
 */
function _flux(item, mediaSourceId) {
    const sources = Array.isArray(item?.MediaSources) ? item.MediaSources : [];
    if (mediaSourceId) {
        const voulue = sources.find(s => s?.Id === mediaSourceId);
        if (Array.isArray(voulue?.MediaStreams)) return voulue.MediaStreams;
    }
    if (Array.isArray(sources[0]?.MediaStreams)) return sources[0].MediaStreams;
    return Array.isArray(item?.MediaStreams) ? item.MediaStreams : [];
}

export default { badges };
