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
 *
 * La décision est isolée dans `evaluerArtefacts` (pure, testée par
 * `tests/veille-keystore.test.js`) ; le CLI ne fait que la brancher sur gh.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NOM_ARTEFACT = 'keystore-amorcage-a-promouvoir-en-secret';
const DEPOT = process.env.GITHUB_REPOSITORY || 'nicoo-o/SpaceHub';
const RETENTION_JOURS = 30;
const SEUIL_ALERTE_JOURS = 7;
const JOUR_MS = 24 * 60 * 60 * 1000;

const expireLe = (createdAt) => new Date(createdAt).getTime() + RETENTION_JOURS * JOUR_MS;

/**
 * Décision pure : étant donné la liste brute des artefacts GitHub Actions et
 * l'instant de référence, rend le verdict complet (message, annotation,
 * lignes de détail, code de sortie). Le CLI et les tests partagent ce code —
 * un artefact mocké expirant dans 5 jours doit produire l'alerte attendue.
 */
export function evaluerArtefacts(artefacts, maintenant = Date.now()) {
    const candidats = (artefacts || []).filter((a) => a.name === NOM_ARTEFACT && !a.expired);

    if (candidats.length === 0) {
        return {
            codeSortie: 0,
            annotation: null,
            message: 'Aucun keystore d\'amorçage actif — la promotion est faite, ou jamais amorcée. RAS.',
            lignes: [],
        };
    }

    const lignes = [];
    for (const artefact of candidats) {
        const delaiMs = expireLe(artefact.created_at) - maintenant;
        const joursRestants = Math.ceil(delaiMs / JOUR_MS);
        const lien = `${DEPOT}/actions/runs/${artefact.workflow_run?.id || '?'}`;
        lignes.push(`  · artefact #${artefact.id} (créé ${artefact.created_at}) — ${joursRestants} jour(s) restant(s) — ${lien}`);
    }

    if (candidats.some((a) => expireLe(a.created_at) <= maintenant)) {
        return {
            codeSortie: 1,
            annotation: 'error',
            message: 'Le keystore d\'amorçage est EXPIRÉ — la clé de signature APK est perdue. ' +
                'La prochaine version sans ANDROID_KEYSTORE générera une clé éphémère : ' +
                'mise à jour en place cassée. Voir docs/PROMOTION_KEYSTORE.md.',
            lignes,
        };
    }

    const plusProche = Math.min(...candidats.map((a) => (expireLe(a.created_at) - maintenant) / JOUR_MS));
    if (plusProche <= SEUIL_ALERTE_JOURS) {
        return {
            codeSortie: 1,
            annotation: 'warning',
            message: `Le keystore d'amorçage expire dans ${Math.ceil(plusProche)} jour(s) ` +
                `(rétention ${RETENTION_JOURS} jours) — téléchargez-le et promouvez-le en secret ` +
                'ANDROID_KEYSTORE MAINTENANT : docs/PROMOTION_KEYSTORE.md.',
            lignes,
        };
    }

    return {
        codeSortie: 0,
        annotation: null,
        message: `Keystore d'amorçage présent, ${Math.ceil(plusProche)} jour(s) avant expiration — RAS.`,
        lignes,
    };
}

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

const estCli = process.argv[1]
    && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (estCli) {
    let artefacts;
    try {
        artefacts = ghApi(`repos/${DEPOT}/actions/artifacts?per_page=100`).artifacts || [];
    } catch (err) {
        console.error('✖ gh api a échoué :', err?.message || err);
        process.exit(1);
    }

    const verdict = evaluerArtefacts(artefacts);
    if (verdict.annotation) console.log(`::${verdict.annotation}::${verdict.message}`);
    console.log(verdict.message);
    for (const ligne of verdict.lignes) console.log(ligne);
    process.exit(verdict.codeSortie);
}