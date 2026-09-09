/**
 * SpaceHub — Segments médias du lecteur (acquisition, requêtes, actions)
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Extrait de VideoPlayer.js (première « peau » du plan de décomposition) :
 * la logique des segments typés du serveur — acquisition sur
 * `/MediaSegments/{id}`, normalisation ticks → secondes, résolution de
 * l'introduction avec repli chapitres, priorités d'actionnabilité — vit
 * ici, SANS état : l'état (`_segmentsMedia`, `_segmentsPourItem`,
 * `_intervalleIntro`, `_segmentCourant`) reste sur le lecteur. Les
 * fonctions reçoivent leurs données ; le lecteur garde la garde de
 * génération, l'écriture d'état et les logs.
 *
 * `SegmentsMedia.test.js` (logique) et `FacadeLecteur.test.js` (frontière)
 * sont les contrats que ce déplacement ne doit pas faire bouger.
 *
 * Le serveur décide, le client agit : Jellyfin laisse explicitement le
 * comportement au client. On s'en sert pour proposer — jamais pour sauter
 * d'autorité.
 */

'use strict';

import { fetchAvecDelai } from '../../core/utils/reseau.js';

/** 1 seconde = 10 000 000 de « ticks » Jellyfin. */
export const TICS_PAR_SECONDE = 10000000;

/**
 * Types de segments sur lesquels on propose une action, et le libellé du
 * bouton correspondant.
 *
 * L'ordre compte : si deux segments se chevauchent (un résumé à
 * l'intérieur d'une introduction, cela arrive), c'est le premier de cette
 * liste qui gagne — le plus spécifique d'abord.
 *
 * `commercial` est volontairement ABSENT : le contenu d'un serveur
 * Jellyfin personnel n'a pas de coupures publicitaires, et proposer de
 * « passer la publicité » sur un enregistrement télé reviendrait à
 * décider à la place de l'utilisateur ce qui est du contenu.
 */
export const SEGMENTS_ACTIONNABLES = [
    { type: 'recap', libelle: 'Passer le résumé' },
    { type: 'intro', libelle: 'Passer l\'intro' },
    { type: 'preview', libelle: 'Passer l\'aperçu' },
];

/**
 * Charge les segments médias d'un titre sur `/MediaSegments/{id}`.
 *
 * Pourquoi c'est mieux que les chapitres. La détection d'introduction
 * reposait entièrement sur le NOM des chapitres — « intro », « opening »,
 * « générique ». Or presque aucun fichier n'a de chapitre nommé ainsi :
 * les chapitres viennent du conteneur vidéo et sont le plus souvent
 * « Chapter 1 », « Chapter 2 »… La fonctionnalité « Passer l'intro »
 * existait donc dans le code sans jamais s'afficher en pratique.
 *
 * Depuis 10.10, le serveur expose `/MediaSegments/{id}` : des plages
 * TYPÉES (Intro, Outro, Commercial, Preview, Recap), produites par les
 * greffons de détection. C'est une donnée, plus une devinette sur une
 * chaîne de caractères.
 *
 * L'absence de segments n'est pas une erreur : un serveur 10.9, ou sans
 * greffon de détection, répond 404. On retombe alors sur les chapitres.
 *
 * Résultats, par convention d'appel :
 *   - `null`              → pas d'URL serveur : rien à faire, silencieusement ;
 *   - `{ ok: false }`     → le serveur a répondu autre chose que 2XX (404…) ;
 *   - `{ ok: true, segments }` → plages normalisées en secondes, fin > début ;
 *   - lève                → réseau coupé, serveur injoignable : à l'appelant
 *     de décider que ce n'est pas une panne.
 *
 * @param {string} itemId
 * @param {{ serverUrl: () => string, headers: () => Object }} acces
 * @returns {Promise<null | {ok: false} | {ok: true, segments: Array}>}
 */
export async function chargerSegments(itemId, { serverUrl, headers }) {
    const base = serverUrl?.() || '';
    if (!base) return null;
    const res = await fetchAvecDelai(
        `${base}/MediaSegments/${encodeURIComponent(itemId)}`,
        { headers: headers?.() || {} },
        6000);
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const bruts = Array.isArray(data?.Items) ? data.Items : (Array.isArray(data) ? data : []);
    const segments = bruts
        .map(seg => ({
            type: String(seg.Type || seg.type || '').toLowerCase(),
            debut: Number(seg.StartTicks ?? seg.startTicks ?? 0) / TICS_PAR_SECONDE,
            fin: Number(seg.EndTicks ?? seg.endTicks ?? 0) / TICS_PAR_SECONDE,
        }))
        .filter(seg => seg.fin > seg.debut);
    return { ok: true, segments };
}

/**
 * Premier segment d'un type donné, s'il existe.
 * @param {Array<{type: string, debut: number, fin: number}>|null} segments
 * @param {...string} types
 * @returns {{ start: number, end: number }|null}
 */
export function premierSegment(segments, ...types) {
    const voulus = new Set(types.map(t => t.toLowerCase()));
    const seg = (segments || []).find(s2 => voulus.has(s2.type));
    return seg ? { start: seg.debut, end: seg.fin } : null;
}

/**
 * Détecte l'intervalle réel de l'introduction.
 *
 * Source de vérité n°1 : les segments typés du serveur. Repli : les
 * chapitres, avec leur heuristique sur le nom — conservé pour les serveurs
 * antérieurs à 10.10 et ceux sans greffon.
 *
 * Sans chapitre explicite (ni borne de fin fiable), aucune introduction ne
 * peut être identifiée de manière fiable : on ne devine rien, et on
 * n'invente pas de durée côté client.
 *
 * @param {Object} item  Item Jellyfin en cours, chapitres compris.
 * @param {Array<{type: string, debut: number, fin: number}>|null} segments
 * @returns {{ start: number, end: number } | null}
 */
export function intervalleIntroduction(item, segments) {
    const parSegment = premierSegment(segments, 'intro');
    if (parSegment) return parSegment;

    const chapters = item?.Chapters || [];
    for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const name = (ch.Name || '').toLowerCase();
        const isIntro = ch.ChapterType === 'Intro' || name.includes('intro') || name.includes('opening') || name.includes('générique');
        if (isIntro) {
            const startSec = (ch.StartPositionTicks || 0) / TICS_PAR_SECONDE;
            let endSec = ch.EndPositionTicks ? (ch.EndPositionTicks / TICS_PAR_SECONDE) : null;
            if (!endSec && i + 1 < chapters.length) {
                endSec = (chapters[i + 1].StartPositionTicks || 0) / TICS_PAR_SECONDE;
            }
            if (!endSec || endSec <= startSec) {
                // Sans borne de fin fournie par Jellyfin, l'intervalle est ambigu.
                continue;
            }
            return { start: startSec, end: endSec };
        }
    }
    return null;
}

/**
 * Le segment actionnable qui couvre l'instant donné, s'il y en a un.
 *
 * Jusqu'ici seule l'introduction était exploitée, alors que le serveur
 * fournit aussi le résumé (« Précédemment dans… »), l'aperçu du prochain
 * épisode et le générique de fin. Un résumé de quatre-vingt-dix secondes
 * qu'on a déjà vu la veille est exactement ce qu'on veut passer.
 *
 * L'introduction garde son chemin dédié : elle sait retomber sur les
 * chapitres quand le serveur ne fournit pas de segments (c'est
 * `intervalleIntro`, résolu une fois par titre).
 *
 * @param {number} temps  Position de lecture, en secondes.
 * @param {Array<{type: string, debut: number, fin: number}>|null} segments
 * @param {{ start: number, end: number }|null|undefined} intervalleIntro
 * @returns {{ start: number, end: number, libelle: string }|null}
 */
export function segmentActionnableA(temps, segments, intervalleIntro) {
    for (const { type, libelle } of SEGMENTS_ACTIONNABLES) {
        const plage = type === 'intro'
            ? (intervalleIntro ?? null)
            : premierSegment(segments, type);
        if (plage && temps >= plage.start && temps < plage.end) {
            return { ...plage, libelle };
        }
    }
    return null;
}

/**
 * Fait sauter la lecture à la fin du segment en cours.
 *
 * Les actions DOM arrivent injectées : le module décide DU SAUT, le lecteur
 * reste seul propriétaire de son `<video>`, de son OSD et de son bouton.
 *
 * @param {{ end: number, libelle: string }} segment
 * @param {{ video: HTMLVideoElement, montrerOSD: (icone: string, texte: string) => void, cacherBouton: () => void }} actions
 */
export function passerSegment(segment, { video, montrerOSD, cacherBouton }) {
    video.currentTime = Math.min(video.duration || segment.end, segment.end);
    montrerOSD('⏭️', segment.libelle.replace(/^Passer /, 'Passé : '));
    cacherBouton();
}
