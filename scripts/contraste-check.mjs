#!/usr/bin/env node
/**
 * SpaceHub — contrat de contraste des thèmes
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * Le préréglage clair explique, en commentaire, avoir assombri l'orange du
 * focus « parce que le #ff9f0a d'Apple sur blanc n'atteint pas 3:1 ». C'est le
 * bon raisonnement — et rien ne vérifiait qu'il resterait vrai après la
 * prochaine retouche. Un thème se règle à l'œil ; il ne se garde pas à l'œil.
 *
 * CE QU'IL VÉRIFIE
 * ----------------
 * Les rapports de contraste des paires qui comptent, dans les DEUX thèmes,
 * contre les seuils du WCAG 2.2 :
 *   — 4,5:1 pour du texte de taille normale (critère 1.4.3) ;
 *   — 3:1 pour du texte large et pour les éléments d'INTERFACE — bordures de
 *     champs, indicateurs d'état, et l'anneau de focus (critère 1.4.11).
 *
 * CE QU'IL NE VÉRIFIE PAS, ET IL FAUT LE DIRE
 * -------------------------------------------
 * Il compare des JETONS, pas des pixels. Une règle CSS qui pose une couleur en
 * dur, ou qui superpose deux calques translucides, lui échappe entièrement. Il
 * attrape la dérive d'un thème, pas toutes les fautes de contraste de
 * l'application. Le seul juge complet reste un écran, en lumière du jour — la
 * luminosité ambiante fait chuter le contraste perçu bien plus que n'importe
 * quel écart mesuré ici.
 */

'use strict';

import { readFileSync } from 'node:fs';

const CHEMIN_PRESETS = 'ui/themes/presets/index.js';
const CHEMIN_TOKENS = 'public/design-system/tokens.css';

/** @param {string} hex @returns {[number,number,number]|null} */
function versRgb(hex) {
    const m = String(hex).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    const v = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
    return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16));
}

/** @param {string} triplet "r, g, b" @returns {[number,number,number]|null} */
function versRgbTriplet(triplet) {
    const parts = String(triplet).split(',').map(n => Number(n.trim()));
    if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
    return parts;
}

/**
 * Luminance relative, formule WCAG 2.x.
 * Le seuil est 0,03928 et la puissance 2,4 : ce sont les valeurs de la
 * spécification, pas une approximation.
 */
function luminance([r, g, b]) {
    const canal = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ─── Extraction des jetons ───────────────────────────────────────────────────

const sourcePresets = readFileSync(CHEMIN_PRESETS, 'utf8');
const sourceTokens = readFileSync(CHEMIN_TOKENS, 'utf8');

/** Jetons du thème sombre, lus dans tokens.css (bloc `:root`). */
function jetonsSombres() {
    const jetons = {};
    for (const m of sourceTokens.matchAll(/(--sh-[a-z0-9-]+):\s*([^;]+);/gi)) {
        jetons[m[1]] = m[2].trim();
    }
    return jetons;
}

/** Jetons d'un préréglage, lus dans son objet `variables`. */
function jetonsPreset(id) {
    const debut = sourcePresets.indexOf(`id: '${id}'`);
    if (debut === -1) return null;
    const jetons = {};
    // On s'arrête au préréglage suivant, ou à la fin du tableau.
    const suivant = sourcePresets.indexOf("        id: '", debut + 10);
    const bloc = sourcePresets.slice(debut, suivant === -1 ? undefined : suivant);
    for (const m of bloc.matchAll(/'(--sh-[a-z0-9-]+)':\s*'([^']*)'/gi)) {
        jetons[m[1]] = m[2].trim();
    }
    return jetons;
}

/**
 * Résout un jeton en RGB.
 *
 * Accepte quatre formes, parce que le dépôt les utilise toutes les quatre :
 *   `#rrggbb`, un triplet « r, g, b », `rgb(r, g, b)`, et `var(--autre, repli)`.
 *
 * La première version ne lisait que les deux premières, et rapportait « non
 * évaluable » sur les jetons de sélection — qui sont justement ceux qu'on
 * venait d'ajouter. Un contrôle incapable de lire ses propres jetons ne
 * protège rien ; il rassure, ce qui est pire.
 *
 * Renvoie `null` pour une valeur TRANSLUCIDE : elle ne peut pas être évaluée
 * sans savoir ce qu'il y a dessous, et inventer un chiffre serait pire que de
 * l'admettre.
 *
 * @param {number} profondeur  garde-fou contre une référence circulaire entre
 *   deux jetons, qui produirait sinon une récursion infinie.
 */
function resoudre(jetons, nom, profondeur = 0) {
    if (profondeur > 5) return null;
    const brut = String(jetons[nom] ?? '').trim();
    if (!brut) return null;

    const direct = versRgb(brut) || versRgbTriplet(brut);
    if (direct) return direct;

    const fonction = brut.match(/^rgba?\(\s*([^)]+)\)$/i);
    if (fonction) {
        const parts = fonction[1].split(/[,/]/).map(x => x.trim());
        // Une couleur à quatre composantes est translucide : non évaluable.
        if (parts.length >= 4) return null;
        // `rgb(var(--x))` : on suit la référence.
        if (parts.length === 1 && parts[0].startsWith('var(')) {
            return resoudre(jetons, ...refVar(parts[0]), profondeur + 1) ?? repliVar(jetons, parts[0], profondeur);
        }
        return versRgbTriplet(parts.join(', '));
    }

    if (brut.startsWith('var(')) {
        const [cible, repli] = decouperVar(brut);
        const suivie = resoudre(jetons, cible, profondeur + 1);
        if (suivie) return suivie;
        return repli ? resoudre({ [cible]: repli }, cible, profondeur + 1) : null;
    }
    return null;
}

/** `var(--nom, repli)` → ['--nom', 'repli'|null] */
function decouperVar(expr) {
    const dedans = expr.slice(expr.indexOf('(') + 1, expr.lastIndexOf(')'));
    const virgule = dedans.indexOf(',');
    if (virgule === -1) return [dedans.trim(), null];
    return [dedans.slice(0, virgule).trim(), dedans.slice(virgule + 1).trim()];
}

function refVar(expr) { return [decouperVar(expr)[0]]; }

function repliVar(jetons, expr, profondeur) {
    const repli = decouperVar(expr)[1];
    return repli ? resoudre({ x: repli }, 'x', profondeur + 1) : null;
}

// ─── Les paires à tenir ──────────────────────────────────────────────────────

/**
 * @type {Array<{texte: string, fond: string, seuil: number, quoi: string}>}
 * `seuil` : 4.5 pour du texte, 3 pour un élément d'interface.
 */
const PAIRES = [
    { texte: '--sh-text-primary', fond: '--sh-bg-surface', seuil: 4.5, quoi: 'texte principal sur une carte' },
    { texte: '--sh-text-primary', fond: '--sh-bg-base', seuil: 4.5, quoi: 'texte principal sur le fond de page' },
    { texte: '--sh-accent-rgb', fond: '--sh-bg-surface', seuil: 4.5, quoi: 'accent sur une carte' },
    { texte: '--sh-accent-contraste', fond: '--sh-accent-rgb', seuil: 4.5, quoi: 'encre posée sur l\'accent' },
    { texte: '--sh-focus-ring-rgb', fond: '--sh-bg-surface', seuil: 3, quoi: 'anneau de focus sur une carte' },
    { texte: '--sh-focus-ring-rgb', fond: '--sh-bg-base', seuil: 3, quoi: 'anneau de focus sur le fond de page' },
    { texte: '--sh-color-primary', fond: '--sh-bg-base', seuil: 3, quoi: 'action principale sur le fond de page' },
    { texte: '--sh-selection-ink', fond: '--sh-selection-bg', seuil: 4.5, quoi: 'encre sur un élément sélectionné' },
];

/**
 * Séparation MINIMALE entre deux surfaces voisines, en clarté PERCEPTUELLE.
 *
 * Ce n'est pas un critère WCAG : c'est le cœur du défaut « thème clair
 * monotone ». Deux surfaces qui ne se distinguent pas ne construisent pas de
 * hiérarchie, et l'interface paraît plate quel que soit le reste.
 *
 * POURQUOI L* ET NON LA LUMINANCE. La première version de ce contrôle
 * comparait la luminance relative — et déclarait le thème SOMBRE en faute,
 * alors qu'il fonctionne. La luminance est linéaire à la lumière, pas à la
 * perception : de #000000 à #111111 l'écart mesuré est de 0,006, et pourtant
 * la séparation se voit parfaitement. L'œil discrimine bien mieux dans les
 * ombres que dans les hautes lumières, et c'est exactement pour cela qu'un
 * thème clair paraît plat là où le même nombre de paliers suffit en sombre.
 *
 * L*, la clarté du modèle CIELAB, est construite pour cela : un écart de L*
 * correspond au même écart perçu en haut comme en bas de l'échelle. Le seuil
 * ci-dessous est calé pour accepter les deux thèmes tels qu'ils doivent être,
 * et refuser l'ancienne échelle claire (#f4f4f5 → #ffffff, ΔL* ≈ 4,0), qui est
 * précisément celle qui donnait l'impression de platitude.
 */
const ECART_SURFACES_MIN = 5;

/**
 * Clarté perceptuelle CIELAB, à partir de la luminance relative.
 * L* = 116·f(Y) − 16, avec le coude standard en (6/29)³.
 */
function clarte(rgb) {
    const y = luminance(rgb);
    const seuil = (6 / 29) ** 3;
    const f = y > seuil ? Math.cbrt(y) : (y / (3 * (6 / 29) ** 2)) + (4 / 29);
    return 116 * f - 16;
}
const PAIRES_SURFACES = [
    ['--sh-bg-base', '--sh-bg-surface'],
    ['--sh-bg-surface', '--sh-bg-surface-3'],
];

// ─── Exécution ───────────────────────────────────────────────────────────────

const themes = [
    { nom: 'sombre', jetons: jetonsSombres() },
    { nom: 'clair', jetons: { ...jetonsSombres(), ...(jetonsPreset('spacehub-light') || {}) } },
];

const erreurs = [];
let verifiees = 0;

for (const { nom, jetons } of themes) {
    for (const { texte, fond, seuil, quoi } of PAIRES) {
        const a = resoudre(jetons, texte);
        const b = resoudre(jetons, fond);
        if (!a || !b) {
            // Un jeton translucide ou absent n'est pas une faute : on le dit et
            // on passe, plutôt que d'inventer un chiffre.
            console.log(`  · ${nom} — ${quoi} : non évaluable (jeton translucide ou absent)`);
            continue;
        }
        verifiees += 1;
        const ratio = contraste(a, b);
        const ok = ratio >= seuil;
        console.log(`  ${ok ? '·' : '✖'} ${nom} — ${quoi} : ${ratio.toFixed(2)}:1 (seuil ${seuil}:1)`);
        if (!ok) {
            erreurs.push(`${nom} — ${quoi} : ${ratio.toFixed(2)}:1, il faut ${seuil}:1 `
                + `(${texte} sur ${fond}).`);
        }
    }

    for (const [a, b] of PAIRES_SURFACES) {
        const ca = resoudre(jetons, a);
        const cb = resoudre(jetons, b);
        if (!ca || !cb) continue;
        verifiees += 1;
        const ecart = Math.abs(clarte(ca) - clarte(cb));
        const ok = ecart >= ECART_SURFACES_MIN;
        console.log(`  ${ok ? '·' : '✖'} ${nom} — séparation ${a} / ${b} : `
            + `ΔL* ${ecart.toFixed(1)} (minimum ${ECART_SURFACES_MIN})`);
        if (!ok) {
            erreurs.push(`${nom} — les surfaces ${a} et ${b} ne se distinguent pas `
                + `(ΔL* ${ecart.toFixed(1)}, minimum ${ECART_SURFACES_MIN}). `
                + 'Sans séparation de surface, l\'interface paraît plate.');
        }
    }
}

console.log(`\nContraste : ${verifiees} paire(s) évaluée(s) sur ${themes.length} thème(s).`);

if (erreurs.length) {
    console.error(`\nContraste : ${erreurs.length} problème(s).\n`);
    for (const e of erreurs) console.error(`  ✖ ${e}`);
    process.exit(1);
}

console.log('Toutes les paires tiennent leur seuil, et les surfaces se distinguent.');
