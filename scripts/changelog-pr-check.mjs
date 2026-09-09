#!/usr/bin/env node
/**
 * SpaceHub — rappel changelog pour les pull requests
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * La règle « la puce s'écrit dans le même commit que le code » a une ennemie
 * naturelle : l'oubli. Il a déjà eu lieu — le commit Dependabot b3b8645 a vu
 * sa puce arriver deux commits plus tard, rattrapée à la main. Un rappel
 * humain dépend de la mémoire du relecteur ; un rappel de CI ne dort jamais.
 *
 * L'ESPRIT
 * --------
 * Un RAPPEL, pas un mur. Le contrôle échoue en quelques secondes, n'installe
 * aucune dépendance, et offre deux issues honnêtes : écrire la puce, ou
 * poser le label « no-changelog » quand le changement n'appelle pas de puce
 * (refactor interne, outillage CI, docs). La décision reste tracée sur la
 * PR — c'est le seul « tampon » qu'on demande.
 *
 * CE QU'IL VÉRIFIE
 * ----------------
 *   1. La PR ne touche pas le code applicatif        → rien à signaler.
 *   2. Elle touche CHANGELOG.md                      → convention respectée.
 *   3. Le label no-changelog est posé                → rappel désactivé,
 *      la mention reste dans le log de la run.
 *   4. Sinon                                         → échec, avec la liste
 *      des fichiers fautifs et les deux issues de sortie.
 *
 * Le code applicatif = les racines du contrat de taille
 * (scripts/taille-monolithes-check.mjs). Une seule définition du « code
 * applicatif » dans ce dépôt ; l'élargir se fait ici ET là, dans le même
 * commit.
 *
 * USAGE — depuis le workflow, simulable localement :
 *   git diff --name-only -z origin/main...HEAD \
 *     | xargs -0 --no-run-if-empty node scripts/changelog-pr-check.mjs
 *
 * Le label arrive par l'environnement (expression GitHub, pas d'API) :
 *   SPACEHUB_SANS_CHANGELOG=true|false
 */

'use strict';

/** Racines du code applicatif — identiques à taille-monolithes-check.mjs. */
const RACINES_APPLICATIVES = ['core/', 'ui/', 'jellyfin/', 'integrations/', 'plugins/'];

/** Affichage : au-delà, la liste noie le message. */
const MAX_AFFICHES = 5;

// ─── Exécution ───────────────────────────────────────────────────────────────

const fichiers = process.argv.slice(2);

if (fichiers.length === 0) {
    console.error('✖ Aucun fichier reçu sur stdin/arguments — le diff est vide.');
    console.error('  Une PR ouverte a normalement un diff. S\'il est vide, la branche est');
    console.error('  déjà fusionnée ou écrasée : vérifier la PR avant de relancer.');
    process.exit(1);
}

const fautifs = fichiers.filter(f => RACINES_APPLICATIVES.some(r => f.startsWith(r)));

// 1. Rien d'applicatif : outillage, docs, dépendances — la puce n'appelle pas.
if (fautifs.length === 0) {
    console.log('✅ Rappel changelog : rien à signaler — aucun fichier du code applicatif dans cette PR.');
    process.exit(0);
}

// 2. Du code applicatif, mais la puce est là : la convention est tenue.
if (fichiers.includes('CHANGELOG.md')) {
    console.log('✅ Rappel changelog : la PR touche le code applicatif ET CHANGELOG.md — convention respectée.');
    process.exit(0);
}

// 3. Label « no-changelog » : l'escape hatch assumé, laissé en trace visible.
if (process.env.SPACEHUB_SANS_CHANGELOG === 'true') {
    console.log('✅ Rappel changelog : label « no-changelog » posé — rappel désactivé pour cette PR.');
    console.log('   La décision reste tracée sur la PR, c\'est ce qu\'on demande.');
    process.exit(0);
}

// 4. Le rappel proprement dit : bref, orienté vers les deux issues honnêtes.
const affiches = fautifs.slice(0, MAX_AFFICHES);
const restants = fautifs.length - affiches.length;
console.error('✖ Cette PR modifie le code applicatif sans toucher CHANGELOG.md :\n');
for (const f of affiches) console.error(`   • ${f}`);
if (restants > 0) console.error(`   • … et ${restants} autre(s) fichier(s) applicatif(s)\n`);
console.error(`
La convention (docs/CONTRIBUTING.md) : tout changement visible pour
l'utilisateur ajoute sa puce sous « ## [Unreleased] » dans le même commit.

Deux issues honnêtes :
  → écrire la puce dans CHANGELOG.md, ou
  → poser le label « no-changelog » si le changement n'appelle pas de puce
    (refactor interne, outillage CI, docs). Le rappel ne se déclenchera plus,`);
console.error('   mais la décision reste visible sur la PR.');
process.exit(1);
