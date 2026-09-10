#!/usr/bin/env node
/**
 * SpaceHub — veille du keystore d'amorçage (rétention 30 jours)
 * =================================================================
 *
 * Le keystore éphémère créé par le workflow Paquets (quand ANDROID_KEYSTORE
 * est absent) est téléversé comme artefact de run à rétention 30 jours :
 * `keystore-amorcage-a-promouvoir-en-secret`. C'est LA seule copie de la
 * clé — passé ce délai, la promotion en secret (docs/PROMOTION_KEYSTORE.md)
 * devient impossible et la prochaine version casse la mise à jour en place.
 *
 * Ce script interroge GitHub Actions et prévient dans les 7 derniers jours.
 *
 *   GH_TOKEN=… node scripts/verifier-amorcage-keystore.mjs
 *
 * Sorties :
 *   0 — RAS (aucun artefact, ou plus de 7 jours restants) ;
 *   1 — ALERTE : l'artefact expire dans moins de 7 jours (ou est expiré) —
 *       le run du job tombe en échec pour que la notification soit visible.
 */

import { execFileSync } from 'node:child_process';

const DEPOT = process.env.GITHUB_REPOSITORY || 'nicoo-o/SpaceHub';
const NOM_ARTEFACT = 'keystore-amorcage-a-promouvoir-en-secret';
const RETENTION_JOURS = 30;
const SEUIL_ALERTE_JOURS = 7;

function ghApi(chemin) {
    const jeton = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (!jeton) {
        console.error('✖ GH_TOKEN manquant — le script lit les artefacts via gh api.');
        process.exit(1);
    }
    const args = ['api', chemin, '--jq', '.', '-H', `Authorization: Bearer ${jeton}`];
    // gh api n'a pas besoin du header si GH_TOKEN est posé — on le laisse
    // néanmoins explicite pour un usage hors GitHub Actions.
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
}

function alerter(message, workflow = 'warning') {
    // Les annotations GitHub Actions rendent l'alerte visible dans le
    // résumé du run, pas seulement dans les logs.
    console.log(`::${workflow}::${message}`);
    console.log(message);
}

let artefacts;
try {
    artefacts = ghApi(`repos/${DEPOT}/actions/artifacts?per_page=100`).artifacts || [];
} catch (err) {
    console.error('✖ gh api a échoué :', err?.message || err);
    process.exit(1);
}

const candidats = artefacts.filter((a) => a.name === NOM_ARTEFACT && !a.expired);

if (candidats.length === 0) {
    console.log('Aucun keystore d\'amorçage actif — la promotion est faite, ou jamais amorcée. RAS.');
    process.exit(0);
}

const maintenant = Date.now();
const expireLe = (createdAt) => new Date(createdAt).getTime() + RETENTION_JOURS * 24 * 60 * 60 * 1000;

const lignes = [];
for (const artefact of candidats) {
    const delaiMs = expireLe(artefact.created_at) - maintenant;
    const joursRestants = Math.ceil(delaiMs / (24 * 60 * 60 * 1000));
    const lien = `${DEPOT}/actions/runs/${artefact.workflow_run?.id || '?'}`;
    lignes.push(`  · artefact #${artefact.id} (créé ${artefact.created_at}) — ${joursRestants} jour(s) restant(s) — ${lien}`);
}

if (candidats.some((a) => expireLe(a.created_at) <= maintenant)) {
    alerter(
        `Le keystore d'amorçage est EXPIRÉ — la clé de signature APK est perdue. ` +
        `La prochaine version sans ANDROID_KEYSTORE générera une clé éphémère : ` +
        `mise à jour en place cassée. Voir docs/PROMOTION_KEYSTORE.md.`,
        'error',
    );
    for (const l of lignes) console.log(l);
    process.exit(1);
}

const plusProche = Math.min(...candidats.map((a) => (expireLe(a.created_at) - maintenant) / (24 * 60 * 60 * 1000)));
if (plusProche <= SEUIL_ALERTE_JOURS) {
    alerter(
        `Le keystore d'amorçage expire dans ${Math.ceil(plusProche)} jour(s) ` +
        `(rétention ${RETENTION_JOURS} jours) — téléchargez-le et promouvez-le en secret ` +
        `ANDROID_KEYSTORE MAINTENANT : docs/PROMOTION_KEYSTORE.md.`,
    );
    for (const l of lignes) console.log(l);
    process.exit(1);
}

console.log(`Keystore d'amorçage présent, ${Math.ceil(plusProche)} jour(s) avant expiration — RAS.`);
for (const l of lignes) console.log(l);
process.exit(0);