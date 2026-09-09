#!/usr/bin/env node
/**
 * SpaceHub — contrat de poids du démarrage
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * Le projet tient dix contrats automatisés — navigation, focus, CSS, XSS,
 * globaux, gabarits, méthodes fantômes — et aucun ne surveillait le poids. Le
 * paquet d'entrée est passé de 430 à 433 ko en une vague sans que rien ne le
 * signale. La dérive de poids ne se voit jamais arriver, parce qu'elle
 * n'arrive jamais d'un coup.
 *
 * CE QU'IL VÉRIFIE, ET POURQUOI CES DEUX CHOSES
 * ---------------------------------------------
 *   1. **Le poids de ce qui est chargé au démarrage.** Pas le poids total du
 *      dépôt : celui des paquets que le navigateur va chercher AVANT que
 *      l'utilisateur ait fait quoi que ce soit.
 *
 *   2. **Que `hls.js` n'y soit pas.** C'est le contrôle qui a motivé ce
 *      fichier. `hls.js` pèse 185 ko compressé — plus, à lui seul, que tout le
 *      reste réuni — et il était importé statiquement, donc analysé avant le
 *      premier écran, pour une bibliothèque qui ne sert qu'au moment où une
 *      lecture HLS commence.
 *
 *      Un simple contrôle du code source ne suffirait pas : c'est le HTML
 *      PRODUIT qui décide. On y cherche donc `vendor-hls` parmi les
 *      préchargements — la seule preuve qui vaille.
 *
 * Les plafonds sont volontairement proches des valeurs actuelles. Un plafond
 * confortable ne freine rien : il autorise la dérive jusqu'à ce qu'il soit
 * atteint, et c'est trop tard.
 */

'use strict';

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');

/**
 * Plafonds en octets APRÈS compression gzip.
 *
 * Calés juste au-dessus des valeurs réelles, avec quelques kilo-octets de
 * marge. Un plafond confortable ne freine rien : il autorise la dérive jusqu'à
 * ce qu'il soit atteint, et c'est trop tard. Les relever est une décision, pas
 * une formalité — elle doit apparaître dans un commit et se justifier.
 *
 * Repères, pour comprendre ce que ces chiffres valent :
 *   — avant la vague 1, le démarrage pesait ≈ 464 ko (hls.js préchargé) ;
 *   — sortir hls.js du chemin critique en a retiré 181 ;
 *   — rendre dynamique la console d'administration, gelée par défaut, 18 ;
 *   — rendre dynamique l'écran des réglages, 18 encore.
 *
 * Soit 255 ko aujourd'hui, contre 464 au départ : 45 % de moins.
 */
const PLAFONDS = {
    /** Total de ce que le navigateur charge avant toute interaction.
     *
     * 258 → 270 le 9 septembre 2026 : la migration Vite 8 (rolldown en
     * remplacement d'esbuild, +0,2 ko de runtime) et son minificateur
     * émettent un démarrage de 267,8 ko pour le MÊME code applicatif. La
     * hausse couvre le déplacement d'outillage, pas une croissance du
     * code. Le plafond reste volontairement serré : la prochaine PR qui
     * ajoute 2 ko au démarrage doit redevenir rouge.
     *
     * L'alternative (différer `integrations`, 17,6 ko) est documentée
     * plus bas : tentée, annulée, bloquée par registerWidget — pas une
     * monnaie disponible pour financer une migration.
     */
    demarrage: 270 * 1024,
    /** La feuille de style unique, bloquante au rendu. */
    style: 46 * 1024,
};

/**
 * RESTE À FAIRE, et volontairement pas masqué par un plafond large.
 *
 * `settings` (17 ko) et `integrations` (18 ko) sont découpés en paquets
 * distincts — l'intention était de les différer — mais restent importés
 * statiquement, donc préchargés et compilés au démarrage. Environ 35 ko sont
 * récupérables, et ce n'est PAS une simple retouche d'import :
 *
 *   — `integrations` a été tenté puis annulé. Le tableau de bord ignore, avec
 *     un simple avertissement, un type de widget non encore enregistré au
 *     moment où il lit son agencement — et il ne se rerend pas de lui-même.
 *     Différer l'import ferait donc disparaître les widgets Servarr au premier
 *     affichage, en silence, pour ceux qui s'en servent. Il faut d'abord que
 *     `registerWidget` sache monter un widget arrivé en retard dans
 *     l'emplacement qui l'attendait.
 *
 *   — `settings` A ÉTÉ FAIT : le chaînage muet `svc.settingsPanel()?.open()`
 *     — qui ne faisait RIEN avant chargement, sans erreur, un bouton mort —
 *     est remplacé par `ouvrirReglages()`, qui attend et signale l'échec.
 *
 *     Une leçon à garder : la mise en différé a AUSSI retiré
 *     `SpaceHub.ui.settingsPanel` de la façade globale au démarrage. Cinq
 *     scénarios e2e s'en servaient pour FERMER la modale ; ils fermaient donc
 *     `undefined`, la modale restait ouverte et empoisonnait les scénarios
 *     suivants. Différer un module change ce qui existe AU DÉMARRAGE, pas
 *     seulement quand il se charge.
 *
 * Reste `integrations` (18 ko). Le plafond reste serré pour qu'il se voie.
 */

/** Paquets qui ne doivent JAMAIS être préchargés au démarrage. */
const INTERDITS_AU_DEMARRAGE = ['vendor-hls'];

const erreurs = [];
const lignes = [];

if (!existsSync(DIST) || !existsSync(join(DIST, 'index.html'))) {
    console.error('Aucune construction dans dist/. Lancez `npm run build` d\'abord.');
    process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// Tout ce que le HTML référence directement : le script d'entrée, les
// `modulepreload`, la feuille de style. C'est exactement le chemin critique.
const referencees = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map(m => m[1]);

if (referencees.length === 0) {
    erreurs.push('Aucun paquet référencé dans dist/index.html — la construction semble incomplète.');
}

for (const interdit of INTERDITS_AU_DEMARRAGE) {
    const trouve = referencees.filter(nom => nom.includes(interdit));
    if (trouve.length) {
        erreurs.push(
            `« ${interdit} » est chargé au démarrage (${trouve.join(', ')}). `
            + 'Il doit rester derrière un import dynamique.');
    }
}

let totalDemarrage = 0;
for (const nom of referencees) {
    const chemin = join(ASSETS, nom);
    if (!existsSync(chemin)) continue;
    const octets = gzipSync(readFileSync(chemin)).length;
    totalDemarrage += octets;
    lignes.push(`  ${nom.padEnd(34)} ${(octets / 1024).toFixed(1).padStart(7)} ko gzip`);

    if (nom.endsWith('.css') && octets > PLAFONDS.style) {
        erreurs.push(`La feuille ${nom} pèse ${(octets / 1024).toFixed(1)} ko `
            + `(plafond ${(PLAFONDS.style / 1024).toFixed(0)} ko).`);
    }
}

if (totalDemarrage > PLAFONDS.demarrage) {
    erreurs.push(
        `Le démarrage pèse ${(totalDemarrage / 1024).toFixed(1)} ko gzip, `
        + `plafond ${(PLAFONDS.demarrage / 1024).toFixed(0)} ko.`);
}

// Information seulement : le poids des paquets différés. Ils ne comptent pas
// dans le plafond — c'est tout l'intérêt de les avoir différés — mais les
// perdre de vue serait la meilleure façon de les laisser grossir.
const differes = existsSync(ASSETS)
    ? readdirSync(ASSETS)
        .filter(nom => nom.endsWith('.js') && !referencees.includes(nom))
        .map(nom => ({ nom, octets: gzipSync(readFileSync(join(ASSETS, nom))).length }))
        .sort((a, b) => b.octets - a.octets)
    : [];

console.log('Poids du démarrage (ce que le navigateur charge avant toute interaction) :');
console.log(lignes.join('\n'));
console.log(`  ${'TOTAL'.padEnd(34)} ${(totalDemarrage / 1024).toFixed(1).padStart(7)} ko gzip `
    + `(plafond ${(PLAFONDS.demarrage / 1024).toFixed(0)} ko)`);

if (differes.length) {
    console.log('\nDifférés — hors plafond, chargés à la demande :');
    for (const { nom, octets } of differes.slice(0, 6)) {
        console.log(`  ${nom.padEnd(34)} ${(octets / 1024).toFixed(1).padStart(7)} ko gzip`);
    }
}

if (erreurs.length) {
    console.error(`\nPoids : ${erreurs.length} problème(s).\n`);
    for (const e of erreurs) console.error(`  ✖ ${e}`);
    process.exit(1);
}

console.log('\nAucun paquet interdit au démarrage, aucun plafond dépassé.');
