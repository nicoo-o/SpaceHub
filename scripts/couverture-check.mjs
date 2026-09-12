#!/usr/bin/env node
/**
 * SpaceHub — la couverture réelle, affichée à côté du nombre de tests
 * ===================================================================
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Le dépôt annonce son nombre de tests partout : dans le README, dans le
 * CHANGELOG, dans les messages de commit. « 750 tests unitaires » est un
 * chiffre vrai, et il donne une impression fausse. La couverture réelle est
 * de l'ordre de 22 % des instructions.
 *
 * Les deux chiffres ne disent pas la même chose et l'un sans l'autre
 * trompe. 750 tests répondent à « combien de comportements sont épinglés »,
 * la couverture à « quelle part du code a été exécutée au moins une fois
 * pendant la suite ». Un dépôt peut avoir mille tests et laisser les trois
 * quarts de son code jamais chargé une seule fois — c'est le cas ici, et
 * personne ne le lisait nulle part.
 *
 * Les seuils existaient déjà dans `vitest.config.js`, honnêtement présentés
 * comme des PLANCHERS. Deux problèmes :
 *
 *   1. `test:couverture` n'était PAS dans la chaîne `npm test`, ni dans la
 *      CI. Les planchers ne pouvaient donc pas casser quoi que ce soit : ils
 *      n'étaient évalués que si quelqu'un lançait la commande à la main.
 *   2. Le chiffre n'apparaissait nulle part à côté du nombre de tests.
 *
 * CE QUE CE CONTRÔLE FAIT
 * -----------------------
 *   — il lance la suite avec la couverture et lit le résumé JSON ;
 *   — il imprime le nombre de tests ET la couverture, sur la même ligne,
 *     parce que c'est ensemble qu'ils sont honnêtes ;
 *   — il NOMME les modules les plus gros qui sont à zéro : un pourcentage
 *     global est une moyenne, et une moyenne ne dit pas où est le trou ;
 *   — il échoue si la couverture passe sous le plancher. Les planchers ne
 *     peuvent que monter, et les relever est une décision qui doit se voir
 *     dans un commit.
 *
 * CE QU'IL NE FAIT PAS, VOLONTAIREMENT
 * ------------------------------------
 * Il ne fixe aucun OBJECTIF de couverture. Une cible chiffrée se gagne en
 * écrivant les tests les moins utiles du dépôt : ceux qui traversent du code
 * sans rien affirmer. Le plancher protège contre la chute, il ne récompense
 * pas la montée.
 *
 * Il n'est pas non plus dans `npm test` : la mesure coûte environ 45
 * secondes, contre quelques secondes pour la suite seule. Il tourne dans la
 * CI, en parallèle du reste.
 *
 *   node scripts/couverture-check.mjs
 */

'use strict';

import { readFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const RAPPORT = join('coverage', 'coverage-summary.json');

/**
 * PLANCHERS, pas objectifs — calés sur la mesure du 12 septembre 2026
 * (22,04 / 18,32 / 21,29 / 22,47 sur cette configuration exacte) et
 * arrondis vers le bas. Un plancher au dixième casserait la chaîne sur un
 * commit sans rapport, et un contrôle qu'on contourne ne contrôle rien.
 */
const PLANCHERS = {
    statements: 22,
    branches: 18,
    functions: 21,
    lines: 22,
};

/** Combien de modules nommer parmi les plus gros à zéro. */
const NB_TROUS = 12;

// ─── La mesure ────────────────────────────────────────────────────────────
//
// `json-summary` en plus du résumé texte : c'est le seul format qu'on puisse
// relire sans analyser une sortie destinée à l'œil humain.
const lancement = spawnSync('npx', [
    'vitest', 'run', '--coverage',
    '--coverage.reporter=json-summary',
    '--coverage.reporter=text-summary',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const sortie = `${lancement.stdout || ''}${lancement.stderr || ''}`;

// Le nombre de tests, pour pouvoir l'imprimer À CÔTÉ de la couverture.
const compte = /Tests\s+(\d+) passed \((\d+)\)/.exec(sortie);
const nbTests = compte ? Number(compte[2]) : null;
const echecs = /Tests\s+(\d+) failed/.exec(sortie);

if (echecs) {
    console.error('La suite elle-même échoue : la couverture ne veut rien dire '
        + 'dans cet état.');
    console.error(sortie.split('\n').slice(-25).join('\n'));
    process.exit(1);
}

if (!existsSync(RAPPORT)) {
    console.error(`Résumé de couverture introuvable (${RAPPORT}).`);
    console.error(sortie.split('\n').slice(-25).join('\n'));
    process.exit(1);
}

const resume = JSON.parse(readFileSync(RAPPORT, 'utf8'));
const total = resume.total;

if (!total?.statements) {
    console.error('Le résumé de couverture est vide ou illisible : ce contrôle '
        + "échoue plutôt que d'afficher un chiffre qu'il n'a pas mesuré.");
    process.exit(1);
}

// ─── Les trous, nommés ────────────────────────────────────────────────────
//
// Un pourcentage global est une moyenne. Nommer les plus gros modules à zéro
// transforme « 22 % » en une liste de décisions possibles.
const trous = Object.entries(resume)
    .filter(([chemin]) => chemin !== 'total')
    .map(([chemin, m]) => ({
        chemin: chemin.replace(`${process.cwd()}/`, ''),
        instructions: m.statements?.total ?? 0,
        couvertes: m.statements?.covered ?? 0,
        pct: m.statements?.pct ?? 0,
    }))
    .filter(m => m.couvertes === 0 && m.instructions >= 60)
    .sort((a, b) => b.instructions - a.instructions);

// ─── Le verdict ───────────────────────────────────────────────────────────
const lignes = [];
const manques = [];

for (const [cle, plancher] of Object.entries(PLANCHERS)) {
    const pct = total[cle]?.pct ?? 0;
    const marque = pct < plancher ? '✖' : '✓';
    lignes.push(`  ${marque} ${cle.padEnd(12)} ${String(pct).padStart(6)} %`
        + `  (plancher ${plancher} %)`
        + `  ${total[cle]?.covered ?? 0} / ${total[cle]?.total ?? 0}`);
    if (pct < plancher) {
        manques.push(`${cle} : ${pct} % sous le plancher de ${plancher} %.`);
    }
}

console.log(
    nbTests
        ? `\n${nbTests} tests unitaires, qui exécutent ${total.statements.pct} % `
          + 'des instructions du code applicatif.\n'
        : `\nCouverture : ${total.statements.pct} % des instructions.\n`);
console.log(lignes.join('\n'));

if (trous.length) {
    console.log(`\nModules de plus de 60 instructions jamais exécutés `
        + `(${trous.length} au total, les ${Math.min(NB_TROUS, trous.length)} plus gros) :`);
    for (const t of trous.slice(0, NB_TROUS)) {
        console.log(`  ${String(t.instructions).padStart(5)} instr.  ${t.chemin}`);
    }
    const somme = trous.reduce((s, t) => s + t.instructions, 0);
    console.log(`  → ${somme} instructions au total dans ces modules, soit `
        + `${(somme / total.statements.total * 100).toFixed(1)} % du code applicatif.`);
}

if (manques.length) {
    console.error(`\nCouverture : ${manques.length} plancher(s) franchi(s) vers le bas.\n`);
    for (const m of manques) console.error(`  ✖ ${m}`);
    console.error(
        '\nUn plancher ne se baisse pas pour faire passer un commit. Soit le '
        + 'code retiré était couvert et il faut vérifier ce qui a disparu, '
        + 'soit du code non couvert a été ajouté et il lui manque ses tests.');
    process.exit(1);
}

console.log('\nAucun plancher de couverture franchi.');
process.exit(0);
