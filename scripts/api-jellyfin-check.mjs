#!/usr/bin/env node
/**
 * SpaceHub — contrat de surface d'API Jellyfin
 *
 * POURQUOI
 * --------
 * La prochaine majeure de Jellyfin sera la **12.0** — la 11 est sautée. Deux
 * annonces la concernent directement :
 *
 *   — les **mécanismes d'autorisation dépréciés** ne seront plus acceptés par
 *     défaut. SpaceHub émet `Authorization: MediaBrowser` sur ses appels
 *     principaux, mais « principaux » n'est pas « tous » : la première
 *     exécution de ce contrôle a trouvé deux appels écrits à la main qui
 *     avaient dérivé — dont un qui n'émettait AUCUNE forme supportée ;
 *   — l'API se **stabilise**, les changements non engagés étant repoussés à la
 *     13.0. C'est donc la bonne fenêtre pour FIGER la surface sur laquelle
 *     SpaceHub s'appuie, et la rendre vérifiable.
 *
 * CE QU'IL FAIT
 * -------------
 *   1. Il **recense** les segments de chemin Jellyfin appelés dans le code et
 *      les compare à un inventaire tenu ici. Un point d'entrée nouveau doit
 *      être ajouté sciemment : c'est une dépendance de plus envers la forme de
 *      l'API du serveur, pas un détail.
 *   2. Il **refuse** les formes d'autorisation dépréciées, où qu'elles soient.
 *
 * CE QU'IL NE FAIT PAS. Il ne dit pas si un point d'entrée EXISTE encore sur
 * la 12.0 : cela demanderait un serveur. Il dit ce dont on dépend, ce qui est
 * la première moitié du travail — et la moitié qu'on peut faire sans serveur.
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINES = ['core', 'jellyfin', 'ui', 'integrations', 'plugins'];

/** Formes d'autorisation refusées. */
const DEPRECIEES = [
    { motif: /X-Emby-Token/i, quoi: 'en-tête X-Emby-Token' },
    { motif: /X-MediaBrowser-Token/i, quoi: 'en-tête X-MediaBrowser-Token' },
    { motif: /Emby\s+UserId=/i, quoi: 'autorisation Emby UserId=' },
];

/**
 * Fichiers où `api_key=` VERS JELLYFIN est relu et assumé.
 *
 * Chaque entrée nomme la contrainte du navigateur qui l'impose. Aucune n'est un
 * raccourci : dans chaque cas, il n'existe pas d'endroit où poser un en-tête.
 */
const API_KEY_ASSUME = new Map([
    ['jellyfin/player/ChargementSource.js',
     '<video src> natif : la requête est émise par le navigateur, aucun en-tête '
     + 'possible. Le fichier documente lui-même pourquoi le remède par service '
     + 'worker a été écarté.'],
    ['jellyfin/temps-reel/SocketJellyfin.js',
     'new WebSocket(url) ne prend pas d\'en-têtes ; le serveur n\'accepte le jeton qu\'en paramètre'],
]);

// NOTE SUR CETTE LISTE. Elle ne contient que des cas RÉELS et vérifiés. Une
// exception inscrite pour un fichier qui ne porte plus le motif est un cas
// imaginaire — exactement le défaut que ce dépôt traque ailleurs — et elle
// masquerait le jour où le motif y revient pour une mauvaise raison.

/**
 * Hôtes tiers dont l'API exige `api_key=` en paramètre.
 *
 * Ce contrôle porte sur l'autorisation envers JELLYFIN. TMDB et OMDb sont des
 * services tiers dont la forme d'authentification ne nous appartient pas : les
 * confondre transformerait le contrôle en bruit, et un contrôle bruyant finit
 * désactivé.
 */
const HOTES_TIERS = ['api.themoviedb.org', 'omdbapi.com', 'lrclib.net'];

/**
 * Segments de chemin Jellyfin dont SpaceHub dépend, tenus à jour sciemment.
 *
 * L'unité est le SEGMENT, pas la route complète : `/Items/{id}/PlaybackInfo`
 * inscrit `/Items` et `/PlaybackInfo`. C'est volontaire — le serveur fait
 * évoluer ses routes en déplaçant des segments, et un inventaire de routes
 * complètes se périmerait au premier paramètre optionnel ajouté.
 */
const INVENTAIRE = new Set([
    '/Audio', '/Auth', '/AuthenticateByName', '/AuthenticateWithQuickConnect',
    '/Branding', '/Capabilities', '/Configuration', '/Connect', '/Counts',
    '/DisplayPreferences', '/Enabled', '/Episodes', '/FavoriteItems', '/Full',
    '/Genres', '/Images', '/Info', '/Initiate', '/InstantMix', '/Items',
    '/Join', '/Latest', '/Leave', '/Library', '/List', '/LiveTv',
    '/Localization', '/Log', '/Logout', '/Logs', '/Lyrics', '/MediaSegments',
    '/Message', '/New', '/NextUp', '/Pause', '/Persons', '/PlaybackInfo',
    '/PlayedItems', '/Playing', '/PlayingItems', '/Playlists', '/Plugins',
    '/Policy', '/Primary', '/Progress', '/Public', '/QuickConnect', '/Refresh',
    '/RemoteSearch', '/Restart', '/Resume', '/Running', '/ScheduledTasks',
    '/Seasons', '/Seek', '/Sessions', '/Shows', '/Shutdown', '/Similar',
    /* nom du greffon serveur dans /Plugins/SpaceHub/Configuration — si le
       greffon est renommé côté serveur, l'appel casse : c'est bien une
       dépendance, même si ce n'est pas une route. */
    '/SpaceHub',
    '/Stop', '/Stopped', '/Stream', '/Studios', '/Subtitles', '/SyncPlay',
    '/System', '/Time', '/Trailers', '/Trickplay', '/Unpause', '/Users',
    '/UserViews', '/Videos', '/Views', '/socket',
]);

/**
 * Retire les commentaires, GARDE les chaînes.
 *
 * POURQUOI CE N'EST PAS UNE REGEX. Deux pièges se referment sur une version
 * naïve, et la première version de ce contrôle est tombée dans le premier :
 *
 *   1. un commentaire qui DOCUMENTE une forme dépréciée (« `X-Emby-Token` est
 *      déprécié, on ne l'émet pas ») se faisait signaler comme s'il l'émettait.
 *      Documenter un refus devenait une faute — l'incitation exactement
 *      inverse de celle qu'on veut ;
 *   2. `'https://exemple/x'` contient `//`. Couper la ligne au premier `//`
 *      MASQUERAIT tout ce qui suit dans une URL, c'est-à-dire précisément
 *      l'endroit où un `api_key=` se cache.
 *
 * Le scanner suit donc l'état « dans une chaîne ». En cas de doute il GARDE le
 * texte : un faux positif se discute, un faux négatif ne se voit pas.
 */
export function sansCommentaires(source) {
    let sortie = '';
    let i = 0;
    const n = source.length;
    while (i < n) {
        const deux = source.slice(i, i + 2);
        if (deux === '//') {
            const fin = source.indexOf('\n', i);
            i = fin === -1 ? n : fin;      // on garde le saut de ligne
            continue;
        }
        if (deux === '/*') {
            const fin = source.indexOf('*/', i + 2);
            const saute = source.slice(i, fin === -1 ? n : fin + 2);
            sortie += saute.replace(/[^\n]/g, ' ');
            i = fin === -1 ? n : fin + 2;
            continue;
        }
        const c = source[i];
        if (c === '"' || c === "'" || c === '`') {
            const guillemet = c;
            sortie += c;
            i += 1;
            while (i < n) {
                if (source[i] === '\\') { sortie += source.slice(i, i + 2); i += 2; continue; }
                sortie += source[i];
                if (source[i] === guillemet) { i += 1; break; }
                i += 1;
            }
            continue;
        }
        sortie += c;
        i += 1;
    }
    return sortie;
}

/** Chaque littéral de chaîne du source, avec sa ligne. */
function litteraux(code) {
    const sortie = [];
    let i = 0;
    let ligne = 1;
    const n = code.length;
    while (i < n) {
        const c = code[i];
        if (c === '\n') { ligne += 1; i += 1; continue; }
        if (c === '"' || c === "'" || c === '`') {
            const guillemet = c;
            const debut = ligne;
            let texte = '';
            i += 1;
            while (i < n) {
                if (code[i] === '\\') { texte += code.slice(i, i + 2); i += 2; continue; }
                if (code[i] === guillemet) { i += 1; break; }
                if (code[i] === '\n') ligne += 1;
                texte += code[i];
                i += 1;
            }
            sortie.push({ texte, ligne: debut });
            continue;
        }
        i += 1;
    }
    return sortie;
}

/**
 * Segments de chemin d'un littéral, en n'acceptant que ceux qui appartiennent
 * VRAIMENT à une URL.
 *
 * TROIS VERSIONS ONT ÉTÉ NÉCESSAIRES, ET C'EST INSTRUCTIF :
 *
 *   1. `"/Segment` — un segment collé au guillemet ouvrant. 12 points d'entrée
 *      trouvés, et l'annonce « inventaire complet ». Elle en manquait 25, dont
 *      /PlaybackInfo et /Lyrics : le style dominant du code est
 *      `${base}/Items/${id}/PlaybackInfo`, où le segment suit une accolade
 *      fermante. Une garantie qui n'en était pas une.
 *   2. Tout `/Segment` d'un littéral contenant une barre oblique. 179 points
 *      d'entrée — dont nos propres modules. Un inventaire où l'on inscrit ses
 *      fichiers ne dit plus rien de la dépendance envers Jellyfin.
 *   3. Celle-ci. « Contenir une barre oblique » n'est pas « être une URL » :
 *      `échec direct/CORS` et `docs/DEPLOIEMENT.md` en contiennent une sans
 *      être des chemins.
 *
 * On exige donc un ANCRAGE — début de littéral, `${…}`, ou `://` — et on ne
 * poursuit qu'en CHAÎNE continue : un espace rompt le chemin.
 */
export function segmentsDeChemin(texte) {
    const sortie = [];
    const chemins = /(?:^|\}|:\/\/[A-Za-z0-9_.\-:]*)((?:\/(?:\$\{[^}]*\}|[A-Za-z0-9_.\-]+))+)/g;
    for (const m of texte.matchAll(chemins)) {
        for (const seg of m[1].matchAll(/\/([A-Z][A-Za-z]+)/g)) sortie.push(`/${seg[1]}`);
    }
    return sortie;
}

function parcourir(dir, sortie = []) {
    if (!fs.existsSync(dir)) return sortie;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) parcourir(p, sortie);
        else if (e.name.endsWith('.js')) sortie.push(p);
    }
    return sortie;
}

export function analyserApi({ racines = RACINES, cwd = process.cwd() } = {}) {
    const erreurs = [];
    const rencontres = new Set();
    let fichiers = 0;

    for (const fichier of racines.flatMap(r => parcourir(path.resolve(cwd, r)))) {
        const rel = path.relative(cwd, fichier).split(path.sep).join('/');
        const code = sansCommentaires(fs.readFileSync(fichier, 'utf8'));
        fichiers += 1;

        for (const { motif, quoi } of DEPRECIEES) {
            if (motif.test(code)) erreurs.push(`${rel} — ${quoi}, refusé par Jellyfin 12.0.`);
        }

        if (!API_KEY_ASSUME.has(rel)) {
            for (const { texte, ligne } of litteraux(code)) {
                if (!texte.includes('api_key=')) continue;
                if (HOTES_TIERS.some(h => texte.includes(h))) continue;
                erreurs.push(`${rel}:${ligne} — « api_key= » dans une URL Jellyfin. `
                    + 'Utilisez l\'en-tête Authorization ; si un élément natif l\'impose '
                    + 'vraiment, ajoutez ce fichier à API_KEY_ASSUME avec la contrainte.');
            }
        }

        for (const { texte } of litteraux(code)) {
            for (const seg of segmentsDeChemin(texte)) rencontres.add(seg);
        }
        if (code.includes('/socket?')) rencontres.add('/socket');
    }

    const nouveaux = [...rencontres].filter(p => !INVENTAIRE.has(p)).sort();
    if (nouveaux.length) {
        erreurs.push(`Points d'entrée hors inventaire : ${nouveaux.join(', ')}. `
            + 'Ajoutez-les à INVENTAIRE dans ce fichier — chacun est une dépendance de '
            + 'plus envers la forme de l\'API du serveur.');
    }
    return { erreurs, fichiers, rencontres: rencontres.size, inventaire: INVENTAIRE.size };
}

export function afficherRapport(r) {
    console.log(`API Jellyfin : ${r.fichiers} fichier(s), ${r.rencontres} segment(s) rencontré(s).`);
    console.log(`  Inventaire tenu : ${r.inventaire} entrées.`);
    if (r.erreurs.length) {
        console.error(`\nAPI Jellyfin : ${r.erreurs.length} problème(s).\n`);
        for (const e of r.erreurs) console.error(`  ✖ ${e}`);
        return false;
    }
    console.log('  Aucune autorisation dépréciée (X-Emby-Token, X-MediaBrowser-Token, Emby UserId=).');
    console.log(`  « api_key= » assumé dans ${API_KEY_ASSUME.size} fichier(s), chacun avec sa contrainte.`);
    console.log('  Aucun segment hors inventaire.');
    return true;
}

const estCli = process.argv[1]
    && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (estCli) {
    if (!afficherRapport(analyserApi())) process.exitCode = 1;
}
