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

/* `scripts` est inclus : le harnais e2e PILOTE le moteur par ses internes, et
   ces atteintes sont déclarées au contrat. Les déclarer sans les vérifier
   laissait le contrat décrire des usages que personne ne contrôlait. */
const RACINES = ['core', 'ui', 'jellyfin', 'integrations', 'plugins', 'api', 'scripts'];

/*
 * DEUX LISTES, PAS UNE.
 *
 * Elles étaient réunies en un seul `Set`, ce qui voulait dire qu'ajouter un
 * interne au contrat du LECTEUR autorisait mécaniquement le même nom sur le
 * MOTEUR — deux façades sans rapport, une seule porte. Chaque famille
 * d'appelants garde donc sa propre surface, et c'est le nom du récepteur qui
 * décide laquelle s'applique.
 */
const SURFACES_PAR_FAMILLE = {
    lecteur: new Set(SURFACE_FACADE),
    moteur: new Set(SURFACE_NAV),
};
const SURFACE = new Set([...SURFACE_FACADE, ...SURFACE_NAV]);

/**
 * Membres que le MOTEUR porte réellement, lus dans sa propre source.
 *
 * C'est ce qui permet de contrôler les atteintes PUBLIQUES sans inventer de
 * faux positifs : un `nav.getBoundingClientRect` quelconque n'est pas un membre
 * du moteur, donc il ne dit rien ; un `nav.pushLayer` en est un, et s'il n'est
 * pas au contrat, c'est une atteinte.
 */
const MEMBRES_MOTEUR = (() => {
    const src = fs.readFileSync('core/SpatialNavigation.js', 'utf8');
    const noms = new Set();
    for (const m of src.matchAll(/^\s{4}(?!\/)([A-Za-z_$][\w$]*)\s*\(/gm)) noms.add(m[1]);
    for (const m of src.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=/g)) noms.add(m[1]);
    return noms;
})();

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
const RECEPTEURS = {
    lecteur: /(?:\b(?:lecteur|player|videoPlayer|vp)|(?:\b|[\s$&(])_lecteur\(\)\s*\??)/,
    moteur: /\b(?:nav|spatialNavigation|moteur)\b/,
};

const ATTEINTE = /(?:\b(?:lecteur|player|videoPlayer|vp|nav|spatialNavigation|moteur)|(?:\b|[\s$&(])_lecteur\(\)\s*\??)\s*\??\.\s*_([A-Za-z][A-Za-z0-9]*)/g;

/** À quelle façade appartient l'appelant, d'après le nom de son récepteur. */
function familleDuRecepteur(texte) {
    return RECEPTEURS.lecteur.test(texte) ? 'lecteur' : 'moteur';
}

/**
 * Atteinte d'une méthode PUBLIQUE — celle que ce contrôle ne voyait pas.
 *
 * Le récepteur est dans la partie non capturante, comme pour les atteintes
 * privées plus haut : c'est la forme qui évite les faux positifs. Elle couvre
 * les quatre écritures réellement employées dans le dépôt : `nav.x`,
 * `spatialNav.x`, `this._nav.x` et l'accesseur `svc.nav().x`.
 */
const ATTEINTE_PUBLIQUE = /(?:\b(?:nav|spatialNav|spatialNavigation|moteur)\b|\bnav\s*\(\s*\)|this\._nav)\s*\??\.\s*([A-Za-z_$][\w$]*)/g;

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
        const famille = familleDuRecepteur(m[0]);
        if (SURFACES_PAR_FAMILLE[famille]?.has(membre)) continue;
        // Un interne du lecteur atteint par un appelant du moteur n'est pas
        // forcément un membre du moteur : on ne parle que de ce qui existe.
        if (famille === 'moteur' && !MEMBRES_MOTEUR.has(membre)) continue;
        const ligne = code.slice(0, m.index).split('\n').length;
        problemes.push(
            `${rel}:${ligne} — atteinte « ${m[0].trim()} » hors du contrat de façade ` +
            `(${famille}). Surface autorisée : ` +
            `${famille === 'moteur' ? 'core/ContratSpatialNavigation.js' : 'jellyfin/player/ContratFacade.js'}. ` +
            `Ajouter un membre au contrat est une décision explicite et committée ; ` +
            `sinon, préférez une API publique.`
        );
    }

    /* ── Les membres PUBLICS du moteur ────────────────────────────────────
       Le contrôle ne voyait que les `._x`. Conséquence : supprimer une méthode
       publique du moteur ne cassait RIEN dans la chaîne — l'appelant perdait sa
       cible en silence, et seule la recette s'en apercevait. C'était la moitié
       manquante du contrat. */
    for (const m of code.matchAll(ATTEINTE_PUBLIQUE)) {
        const membre = m[1];
        if (!MEMBRES_MOTEUR.has(membre)) continue;
        if (SURFACES_PAR_FAMILLE.moteur.has(membre)) continue;
        const ligne = code.slice(0, m.index).split('\n').length;
        problemes.push(
            `${rel}:${ligne} — « ${m[0].trim()} » atteint un membre du moteur ` +
            `absent de core/ContratSpatialNavigation.js. Une méthode publique non ` +
            `déclarée peut être retirée par une extraction sans que rien n'échoue.`
        );
    }
}

if (problemes.length) {
    console.error(`Contrat de façade (côté appelants) : ${problemes.length} problème(s).\n`);
    for (const p of problemes) console.error('  ✖ ' + p);
    process.exit(1);
}

console.log(`Contrat de façade côté appelants : ${fichiers.length} fichiers vérifiés — aucune atteinte hors contrat.`);
