/**
 * Valeurs neutres pour rendre un gabarit sans données réelles.
 *
 * Ce module est partagé par le générateur d'empreinte (qui a tourné sur le code
 * AVANT extraction) et par les tests (qui tournent sur les modules extraits).
 * Le partage n'est pas cosmétique : si les deux côtés fabriquaient leurs
 * valeurs séparément, la moindre divergence rendrait la comparaison vide de
 * sens tout en la laissant passer au vert.
 *
 * Deux propriétés comptent :
 *
 *  - les marques contiennent `<`, `&` et `"`. Sans cela, ajouter ou retirer un
 *    échappement ne changerait rien au rendu, et la « preuve d'identité » ne
 *    prouverait rien sur le seul point qui touche à la sécurité ;
 *  - `map`, `filter`, `slice`, `forEach` et `find` appellent réellement leur
 *    rappel sur deux éléments. Une valeur neutre qui se contentait de se
 *    renvoyer elle-même laissait le corps de chaque `.map()` — c'est-à-dire la
 *    majorité du HTML des listes — hors de la comparaison.
 */

'use strict';

/** Échappement HTML, identique à celui de core/utils/domUtils.js. */
export function echapper(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const TABLEAU = new Set(['map', 'filter', 'slice', 'forEach', 'find', 'some', 'every', 'sort', 'reverse', 'flat']);

/**
 * Valeur utilisable comme chaîne, comme fonction, comme objet et comme
 * tableau, quelle que soit l'écriture rencontrée dans le gabarit.
 */
export function neutre(nom) {
    const marque = `<&"${nom}">`;
    const f = function () { return marque; };

    const p = new Proxy(f, {
        get(cible, cle) {
            if (cle === Symbol.toPrimitive || cle === 'toString' || cle === 'valueOf') {
                return () => marque;
            }
            if (cle === 'length' || cle === 'size') return 2;
            if (cle === Symbol.iterator) return [][Symbol.iterator].bind(elements());
            if (typeof cle === 'symbol') return cible[cle];
            if (cle === 'join') return (sep = ',') => elements().join(sep);
            if (TABLEAU.has(cle)) {
                // Le resultat reste un vrai tableau : `.map(...).join('')`
                // fonctionne alors sans qu'on ait a redefinir `join`, ce qui
                // provoquait une recursion infinie.
                return (...args) => Array.prototype[cle].apply(elements(), args);
            }
            return neutre(`${nom}.${String(cle)}`);
        },
        apply: () => p,
    });

    /** Deux éléments : assez pour révéler un rappel jamais appelé. */
    function elements() {
        return [neutre(`${nom}[0]`), neutre(`${nom}[1]`)];
    }

    return p;
}

/** Complète un contexte avec des valeurs neutres pour les noms manquants. */
export function avecNeutres(ctx, noms) {
    const sortie = { ...ctx };
    for (const n of noms) if (!(n in sortie)) sortie[n] = neutre(n);
    return sortie;
}
