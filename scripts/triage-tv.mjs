#!/usr/bin/env node
/**
 * SpaceHub — triage TV en une commande
 * =================================================================
 *
 * La session d'acceptation TV (docs/ACCEPTATION_TV.md) se termine par des
 * captures et un logcat filtré quand un doute doit être départagé plus tard.
 * À la main c'est trois commandes et deux écrans de bruit ; ce script ramène
 * un dossier horodaté prêt à coller dans un ticket :
 *
 *   node scripts/triage-tv.mjs [IP_DE_LA_TV[:5555]]
 *
 *   · connecte ADB (si une IP est donnée et qu'aucun appareil n'est là),
 *   · vide le logcat et filtre ANR / fatal / SpaceHub → `logcat-filtre.txt`,
 *   · capture l'écran → `ecran.png`.
 *
 * Sorties :
 *   0 — triage écrit dans build/triage-tv/AAAA-MM-JJ-HHmmss/ ;
 *   1 — adb absent, aucun appareil, ou un appel adb a échoué.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DOSSIER_SORTIE = join('build', 'triage-tv');

function adb(args) {
    return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// 1. adb présent ?
try {
    adb(['version']);
} catch {
    console.error('✖ adb introuvable — installez les Platform-Tools (docs/ACCEPTATION_TV.md, étape 0).');
    process.exit(1);
}

// 2. Appareil : connexion explicite si une IP est donnée, sinon état courant.
const ip = process.argv[2];
let appareils;
try {
    appareils = adb(['devices']);
} catch (err) {
    console.error('✖ adb devices a échoué :', err?.message || err);
    process.exit(1);
}
const enLigne = appareils
    .split(/\r?\n/)
    .slice(1)
    .some((l) => /\tdevice$/.test(l.trim()));

if (!enLigne) {
    if (!ip) {
        console.error(
            "✖ Aucun appareil connecté. Passez l'IP en argument :\n" +
                '    node scripts/triage-tv.mjs 192.168.1.42\n' +
                "  (autoriser l'empreinte RSA sur la TV si demandé)",
        );
        process.exit(1);
    }
    console.log(`Connexion à ${ip}…`);
    try {
        adb(['connect', ip]);
    } catch (err) {
        console.error('✖ adb connect a échoué :', err?.message || err);
        process.exit(1);
    }
}

// 3. Dossier horodaté — on n'écrase jamais une session précédente.
const horodatage = new Date()
    .toISOString()
    .replace(/[:T]/g, '-')
    .replace(/\..+$/, '');
const dossier = join(DOSSIER_SORTIE, horodatage);
mkdirSync(dossier, { recursive: true });

// 4. Logcat filtré : ANR, fatals et traces SpaceHub. `-d` vide le tampon
//    après lecture ; le filtre garde aussi le contexte par la sortie entière
//    de logcat (pas de `-t`), pour ne rien rater d'un crash multi-ligne.
try {
    const logcat = adb(['logcat', '-d']);
    const filtre = /anr|fatal|spacehub/i;
    const lignes = logcat.split(/\r?\n/).filter((l) => filtre.test(l));
    const cheminLog = join(dossier, 'logcat-filtre.txt');
    writeFileSync(cheminLog, lignes.join('\n') + (lignes.length ? '\n' : ''));
    console.log(`  · logcat filtré (${lignes.length} lignes) → ${cheminLog}`);
} catch (err) {
    console.error('✖ logcat a échoué :', err?.message || err);
    process.exit(1);
}

// 5. Capture d'écran : screencap écrit sur la TV, on rapatrie le fichier.
try {
    adb(['shell', 'screencap', '-p', '/sdcard/triage-tv.png']);
    const cheminPng = join(dossier, 'ecran.png');
    adb(['pull', '/sdcard/triage-tv.png', cheminPng]);
    adb(['shell', 'rm', '/sdcard/triage-tv.png']);
    console.log(`  · capture d'écran → ${cheminPng}`);
} catch (err) {
    console.error('✖ screencap/pull a échoué :', err?.message || err);
    process.exit(1);
}

console.log(`✓ Triage prêt : ${dossier}`);