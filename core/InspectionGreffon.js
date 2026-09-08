/**
 * SpaceHub — inspection statique du code d'un greffon
 *
 * CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
 * -------------------------------------------
 * Un greffon s'exécute DANS la page, avec le même accès que l'application.
 * Les permissions déclarées décrivent son intention ; elles ne le contraignent
 * pas. La seule isolation réelle disponible dans un navigateur est une
 * `<iframe sandbox>` d'origine distincte — un chantier qui rend toute l'API
 * asynchrone et sérialisable, et qui ne se justifie pas tant qu'aucun greffon
 * tiers n'existe.
 *
 * Ce module n'est donc **pas un bac à sable**. C'est une inspection du texte
 * source, faite au seul moment où elle est possible : `PluginCatalog` détient
 * la source avant de la remettre au chargeur.
 *
 * CE QU'IL ATTRAPE VRAIMENT. Un attaquant décidé contourne une inspection
 * statique en construisant ses accès (`window['Space' + 'Hub']`) — il faut le
 * dire, sans quoi on remplace une fausse garantie par une autre. Ce qu'il
 * attrape, c'est l'auteur négligent et le greffon qui prend un raccourci,
 * c'est-à-dire l'écrasante majorité des cas. Et il rend le contournement
 * VOLONTAIRE et VISIBLE dans le source, ce qui change la nature de la faute.
 *
 * POURQUOI CES MOTIFS-LÀ. Chacun a une porte légitime dans le contexte remis
 * au greffon : `ctx.api.fetch` plutôt que `fetch`, `ctx.settings` plutôt que
 * `localStorage`, `ctx.ratings` plutôt que `window.SpaceHub.core.ratingCache`.
 * Un greffon qui les contourne ne gagne rien qu'il ne puisse obtenir
 * proprement — sauf l'accès à la session, qui est précisément ce qu'on refuse.
 */

'use strict';

/**
 * @type {Array<{motif: RegExp, quoi: string, porte: string}>}
 * `porte` nomme le chemin légitime, pour que le refus soit actionnable.
 */
export const INTERDITS = [
    { motif: /\bsessionStorage\b/, quoi: 'sessionStorage',
      porte: 'ctx.settings — le jeton de session vit là et n\'est pas à vous' },
    { motif: /\blocalStorage\b/, quoi: 'localStorage',
      porte: 'ctx.settings' },
    { motif: /\bdocument\s*\.\s*cookie\b/, quoi: 'document.cookie',
      porte: 'aucune : un greffon n\'a pas affaire aux cookies' },
    { motif: /\bwindow\s*\.\s*SpaceHub\b/, quoi: 'window.SpaceHub',
      porte: 'le contexte `ctx` remis à vos crochets' },
    { motif: /(^|[^.\w])fetch\s*\(/, quoi: 'fetch() global',
      porte: 'ctx.api.fetch — il impose HTTPS, un délai et `credentials: omit`' },
    { motif: /\bXMLHttpRequest\b/, quoi: 'XMLHttpRequest',
      porte: 'ctx.api.fetch' },
    { motif: /(^|[^.\w])eval\s*\(/, quoi: 'eval()',
      porte: 'aucune : le chargeur refuse déjà l\'évaluation dynamique' },
    { motif: /new\s+Function\s*\(/, quoi: 'new Function()',
      porte: 'aucune' },
    { motif: /\bimport\s*\(/, quoi: 'import() dynamique',
      porte: 'aucune : un greffon est un module unique, vérifié en entier' },
    { motif: /\bindexedDB\b/, quoi: 'indexedDB',
      porte: 'ctx.settings' },
];

/**
 * Retire commentaires et chaînes avant l'inspection.
 *
 * SANS CELA, LE CONTRÔLE SE TROMPE DANS LES DEUX SENS : il refuserait un
 * greffon dont un commentaire explique « n'utilisez pas localStorage », et il
 * laisserait passer une explication qui, elle, mérite d'être lue. On préfère
 * inspecter du code.
 *
 * Le découpage est volontairement simple et faillible sur les cas tordus
 * (une regex contenant un guillemet). Il est conçu pour ne jamais MASQUER du
 * code : en cas de doute il garde le texte, quitte à signaler à tort — un faux
 * positif se discute, un faux négatif ne se voit pas.
 */
export function sansCommentairesNiChaines(source) {
    let sortie = '';
    let i = 0;
    const n = source.length;
    while (i < n) {
        const deux = source.slice(i, i + 2);
        if (deux === '//') {
            const fin = source.indexOf('\n', i);
            i = fin === -1 ? n : fin;
            continue;
        }
        if (deux === '/*') {
            const fin = source.indexOf('*/', i + 2);
            i = fin === -1 ? n : fin + 2;
            continue;
        }
        const c = source[i];
        if (c === '"' || c === "'" || c === '`') {
            const guillemet = c;
            i += 1;
            while (i < n) {
                if (source[i] === '\\') { i += 2; continue; }
                if (source[i] === guillemet) { i += 1; break; }
                // Une interpolation `${…}` contient du VRAI code : on le garde.
                if (guillemet === '`' && source.slice(i, i + 2) === '${') {
                    const fin = source.indexOf('}', i);
                    sortie += source.slice(i + 2, fin === -1 ? n : fin) + ' ';
                    i = fin === -1 ? n : fin + 1;
                    continue;
                }
                i += 1;
            }
            // Une chaîne devient un espace : elle ne doit pas coller deux
            // identifiants et fabriquer un mot qui n'existe pas.
            sortie += ' ';
            continue;
        }
        sortie += c;
        i += 1;
    }
    return sortie;
}

/**
 * Inspecte la source d'un greffon.
 *
 * @param {string} source
 * @returns {{ propre: boolean, infractions: Array<{quoi: string, porte: string, ligne: number}> }}
 */
export function inspecter(source) {
    const texte = String(source || '');
    const code = sansCommentairesNiChaines(texte);
    const lignes = code.split('\n');
    const infractions = [];

    for (const { motif, quoi, porte } of INTERDITS) {
        for (let i = 0; i < lignes.length; i += 1) {
            if (motif.test(lignes[i])) {
                infractions.push({ quoi, porte, ligne: i + 1 });
                break;   // une occurrence suffit à refuser ; inutile de toutes les lister
            }
        }
    }
    return { propre: infractions.length === 0, infractions };
}

/** Message lisible pour un refus. */
export function expliquer(infractions) {
    return infractions
        .map(i => `ligne ${i.ligne} : ${i.quoi} — utilisez ${i.porte}`)
        .join(' ; ');
}

export default { INTERDITS, inspecter, expliquer, sansCommentairesNiChaines };
