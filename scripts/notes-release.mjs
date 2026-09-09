#!/usr/bin/env node
/**
 * SpaceHub — notes de release extraites du changelog
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * Les notes de release générées automatiquement listent des messages de
 * commit : c'est un journal du COMMENT, pas du POURQUOI. Le changelog
 * s'écrit pour celui qui télécharge — une phrase par changement qui compte,
 * dans la langue du README. Ce script extrait la section du tag demandé et
 * n'invente rien : s'il n'y a pas de section, la release n'a pas de notes,
 * et c'est un échec, pas une liste de secours.
 *
 * USAGE
 * -----
 *   node scripts/notes-release.mjs v1.0.2     → imprime la section, pour le workflow
 *   node scripts/notes-release.mjs --check    → valide le fichier entier, pour la CI
 *
 * CONVENTION (détaillée dans docs/CONTRIBUTING.md)
 * -----------------------------------------------
 *   ## [1.2.3] - 2026-09-09      ← une section par version, datée
 *   ### Added | Changed | Fixed  ← catégories Keep a Changelog
 *   ## [Unreleased]              ← les changements s'y accumulent entre versions
 *
 * La validation échoue si une section de version n'est pas datée, si la
 * version taguée est absente, ou si [Unreleased] est vide au moment d'y
 * écrire — c'est ce qui empêche la convention de se délayer.
 */

'use strict';

import { readFileSync } from 'node:fs';

const CHEMIN = 'CHANGELOG.md';
const SECTIONS_VALIDES = new Set(['Added', 'Changed', 'Fixed', 'Deprecated', 'Removed', 'Security']);

function lireChangelog() {
    let contenu;
    try {
        contenu = readFileSync(CHEMIN, 'utf8');
    } catch {
        console.error(`✖ ${CHEMIN} introuvable. La convention : les notes de release s'écrivent dans le changelog.`);
        process.exit(1);
    }
    return contenu;
}

/** Découpe le fichier en sections { version, date, lignes } dans l'ordre du fichier. */
function decouper(contenu) {
    const sections = [];
    let courante = null;
    for (const ligne of contenu.split('\n')) {
        const m = ligne.match(/^## \[([^\]]+)\](?:\s+-\s+(.+))?\s*$/);
        if (m) {
            courante = { version: m[1].trim(), date: (m[2] ?? '').trim(), lignes: [] };
            sections.push(courante);
        } else if (courante) {
            courante.lignes.push(ligne);
        }
    }
    return sections;
}

/** Retire les lignes vides de fin et les références de liens — les deux
 * n'appartiennent qu'au fichier, jamais au corps d'une release. */
function corps(sections_) {
    const lignes = [...sections_.lignes];
    const estReference = (l) => /^\[[^\]]+\]:\s*<?https?:/.test(l);
    while (lignes.length > 0 && (lignes[lignes.length - 1].trim() === '' || estReference(lignes[lignes.length - 1]))) lignes.pop();
    return lignes;
}

function valider(sections) {
    const erreurs = [];
    if (sections.length === 0) {
        erreurs.push('aucune section « ## [version] » trouvée.');
        return erreurs;
    }
    for (const s of sections) {
        if (s.version !== 'Unreleased' && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
            erreurs.push(`« ## [${s.version}] » n'a pas de date au format AAAA-MM-JJ (attendu : « ## [${s.version}] - 2026-09-09 »).`);
        }
        if (corps(s).length === 0) {
            erreurs.push(`« ## [${s.version}] » est vide — soit y écrire, soit supprimer la section.`);
        }
        const dansCorps = corps(s).filter(l => /^### /.test(l));
        for (const l of dansCorps) {
            const nom = l.replace(/^###\s+/, '').trim();
            if (!SECTIONS_VALIDES.has(nom)) {
                erreurs.push(`« ### ${nom} » n'est pas une catégorie Keep a Changelog (${[...SECTIONS_VALIDES].join(', ')}).`);
            }
        }
    }
    return erreurs;
}

// ─── Exécution ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const modeCheck = args.includes('--check');
const tag = args.find(a => a !== '--check');

const sections = decouper(lireChangelog());

if (modeCheck) {
    const erreurs = valider(sections);
    if (erreurs.length > 0) {
        console.error(`✖ ${CHEMIN} — la convention n'est pas respectée :\n`);
        for (const e of erreurs) console.error(`  • ${e}`);
        console.error('\n  La convention se discute dans un commit ; elle ne se contourne pas.');
        process.exit(1);
    }
    console.log(`✅ ${CHEMIN} conforme — ${sections.length} section(s), convention Keep a Changelog respectée.`);
    process.exit(0);
}

if (!tag) {
    console.error('✖ Usage : node scripts/notes-release.mjs <tag> | --check');
    process.exit(1);
}

const version = tag.startsWith('v') ? tag.slice(1) : tag;
const section = sections.find(s => s.version === version);

if (!section) {
    console.error(`✖ Aucune section « ## [${version}] » dans ${CHEMIN}.`);
    console.error(`  Les notes de release s'écrivent d'abord dans le changelog — pas de section, pas de release.`);
    console.error(`  Sections présentes : ${sections.map(s => s.version).join(', ') || 'aucune'}.`);
    process.exit(1);
}

const notes = corps(section).join('\n').trim();
if (notes === '') {
    console.error(`✖ La section « ## [${version}] » est vide — écrire les notes avant de taguer.`);
    process.exit(1);
}
console.log(notes);
