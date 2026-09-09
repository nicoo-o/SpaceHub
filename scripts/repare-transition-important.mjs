#!/usr/bin/env node
/**
 * SpaceHub — réparation des déclarations `transition` invalides
 *
 * POURQUOI CE SCRIPT A EXISTÉ
 * ---------------------------
 * Une quinzaine de déclarations `transition:` portaient `!important` au
 * MILIEU de la liste de valeurs (« transform … !important, opacity …
 * !important, … »). Ce n'est pas du CSS : une déclaration n'admet qu'UN
 * `!important`, terminal. La sonde (scripts/.sonde-transition.mjs, lancée
 * une fois pour le diagnostic) le prouve sur Chromium : ces déclarations
 * sont ENTIÈREMENT abandonnées par le navigateur — `transition-property`
 * retombe sur `all`, durée sur `0s`. Ces transitions n'ont jamais animé.
 *
 * Le build sous Vite 8 (lightningcss) refuse désormais ce que les
 * navigateurs toléraient en silence : « Unexpected token Comma ». La
 * réparation — un seul `!important` terminal, forme que la sonde valide
 * pour toute la liste — débloque le build ET remet les transitions en vie.
 *
 * USAGE : node scripts/repare-transition-important.mjs   (idempotent)
 *
 * Le script reste dans le dépôt : la convention des greffons tiers peut
 * réintroduire le motif, et ce code est la référence de la réparation.
 */

'use strict';

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const RACINES = ['core', 'ui', 'jellyfin', 'integrations', 'plugins', 'public'];

function tousLesCss(repertoire) {
    let resultats = [];
    let entrees;
    try {
        entrees = readdirSync(repertoire, { withFileTypes: true });
    } catch {
        return resultats;
    }
    for (const e of entrees) {
        const chemin = `${repertoire}/${e.name}`;
        if (e.isDirectory()) resultats = resultats.concat(tousLesCss(chemin));
        else if (e.name.endsWith('.css')) resultats.push(chemin);
    }
    return resultats;
}

/** Un `!important` mid-liste n'est valide que terminal. La forme réparée :
 * valeur sans aucun `!important`, puis UN `!important` avant le `;`. */
function reparer(source) {
    let reparations = 0;
    const sorti = source.replace(/(?<![a-z-])transition\s*:\s*[^;{}]*?;/gi, (decl) => {
        const importants = decl.match(/!\s*important/gi) || [];
        if (importants.length === 0) return decl;
        const corps = decl
            .replace(/;\s*$/, '')
            .replace(/!\s*important/gi, '')
            .replace(/\s+$/, '');
        const reparé = `${corps} !important;`;
        // Une déclaration déjà conforme (un seul !important, terminal) ne
        // compte pas : la réparation est un changement, pas un passage.
        if (reparé === decl) return decl;
        reparations += 1;
        return reparé;
    });
    return { sorti, reparations };
}

let total = 0;
const fichiers = RACINES.flatMap(tousLesCss);
for (const chemin of fichiers) {
    const avant = readFileSync(chemin, 'utf8');
    const { sorti, reparations } = reparer(avant);
    if (reparations > 0) {
        writeFileSync(chemin, sorti);
        console.log(`  ${chemin} — ${reparations} déclaration(s) réparée(s)`);
        total += reparations;
    }
}

console.log(`\n${total === 0 ? 'Aucune déclaration à réparer (déjà conforme).' : `${total} déclaration(s) réparée(s) au total.`}`);
process.exit(0);
