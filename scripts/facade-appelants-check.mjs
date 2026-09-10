#!/usr/bin/env node
/**
 * SpaceHub — Contrôle des appelants de la façade VideoPlayer
 * ==========================================================
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * `tests/FacadeLecteur.test.js` garde la façade CÔTÉ CLASSE : après chaque
 * « peau » extraite du monolithe, tout membre du contrat doit encore exister.
 * Ce contrôle la garde CÔTÉ APPELANT : aucun fichier hors de jellyfin/player/
 * ne doit atteindre un membre qui N'EST PAS au contrat — sinon la décomposition
 * (docs/DECOMPOSITION_VIDEOPLAYER.md) se casse en silence : une peau déplace
 * un interne, l'appelant illégitime perd sa cible, et seul l'exécutable en
 * recette s'en aperçoit.
 *
 * SOURCE DE VÉRITÉ UNIQUE
 * -----------------------
 * La surface autorisée vit dans `jellyfin/player/ContratFacade.js`, importée
 * ICI et par le filet de façade. Ajouter un membre à la surface est une ligne
 * committée, visible en revue — jamais un effet de bord d'un appelant pressé.
 *
 * CE QU'IL DÉTECTE
 * ----------------
 *   1. Un import direct d'un INTERNE underscore depuis VideoPlayer.js.
 *   2. Une atteinte de propriété `. _x` sur un récepteur à consonance
 *      lecteur (`lecteur`, `player`, `SpaceHub.player`, `this._lecteur()`…),
 *      hors de la surface autorisée.
 *
 * Ce qu'il ne prétend PAS détecter : un accès via une variable renommée
 * (`const x = SpaceHub.player; x._chose`). La revue reste le dernier gardien ;
 * ce contrôle arrête les formes mécaniquement reconnaissables.
 */

import fs from 'node:fs';
import path from 'node:path';

import { SURFACE_FACADE } from '../jellyfin/player/ContratFacade.js';
import { SURFACE_NAV } from '../core/ContratSpatialNavigation.js';

const RACINES = ['core', 'ui', 'jellyfin', 'integrations', 'plugins', 'api'];
const SURFACE = new Set([...SURFACE_FACADE, ...SURFACE_NAV]);

const problemes = [];

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

const fichiers = RACINES.flatMap(r => walk(r))
    .filter(f => f.endsWith('.js'))
    // La façade et ses satellites : chez eux, les internes.
    .filter(f => !f.replace(/\\/g, '/').startsWith('jellyfin/player/'));

/* ── 1. Imports directs d'internes depuis VideoPlayer.js ─────────────────── */

for (const f of fichiers) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = f.replace(/\\/g, '/');

    for (const m of src.matchAll(
        /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*player\/VideoPlayer\.js['"]/g
    )) {
        for (const nom of m[1].split(',')) {
            const n = nom.trim().split(/\s+as\s+/)[0].trim();
            if (n.startsWith('_')) {
                problemes.push(
                    `${rel} — import direct de l'interne « ${n} » depuis VideoPlayer.js. ` +
                    `Les internes underscore ne font pas partie de la façade (ContratFacade.js).`
                );
            }
        }
    }
}

/* ── 2. Atteintes de propriété sur un récepteur lecteur ─────────────────── */

// Récepteurs reconnus : `lecteur`, `player`, `videoPlayer`, `vp` pour la
// façade du lecteur, `nav`, `spatialNavigation` pour celle du moteur
// (audit docs/AUDIT_MONOLITHES.md), et l'appel `this._lecteur()` retournant
// l'instance. Ce qui précède le `._x` n'est pas borné à gauche : il faut
// que la FIN du récepteur soit un de ces noms, d'où le groupement collé
// au `._`.
const ATTEINTE = /(?:\b(?:lecteur|player|videoPlayer|vp|nav|spatialNavigation)|(?:\b|[\s$&(])_lecteur\(\)\s*\??)\s*\??\.\s*_([A-Za-z][A-Za-z0-9]*)/g;

for (const f of fichiers) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = f.replace(/\\/g, '/');

    // Neutraliser commentaires et gabarits UI avant l'analyse.
    const code = src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, '');

    for (const m of code.matchAll(ATTEINTE)) {
        // La capture exclut l'underscore initial : le contrat, lui, le porte.
        const membre = '_' + m[1];
        if (SURFACE.has(membre)) continue;
        const ligne = code.slice(0, m.index).split('\n').length;
        problemes.push(
            `${rel}:${ligne} — atteinte « ${m[0].trim()} » hors du contrat de façade. ` +
            `Surface autorisée : jellyfin/player/ContratFacade.js. ` +
            `Ajouter un membre au contrat est une décision explicite et committée ; ` +
            `sinon, préférez une API publique du lecteur.`
        );
    }
}

if (problemes.length) {
    console.error(`Contrat de façade (côté appelants) : ${problemes.length} problème(s).\n`);
    for (const p of problemes) console.error('  ✖ ' + p);
    process.exit(1);
}

console.log(`Contrat de façade côté appelants : ${fichiers.length} fichiers vérifiés — aucune atteinte hors contrat.`);
