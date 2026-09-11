#!/usr/bin/env node
/**
 * SpaceHub — contrat de taille des monolithes
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * Sept fichiers concentrent l'essentiel de la complexité restante. La règle
 * du projet est simple : ils ne GRANDISSENT PLUS. Toute nouvelle
 * fonctionnalité va dans un nouveau module — c'est ce que font déjà les
 * dernières vagues (BadgesQualite, MinuteurSommeil, ApparenceSousTitres,
 * HorlogeServeur sont nés à côté du lecteur, pas dedans).
 *
 * La dérive de taille ne se voit jamais arriver : chaque PR ajoute « juste
 * cent lignes », et deux ans plus tard VideoPlayer pèse 4 000 lignes que plus
 * personne n'ose toucher. Ce contrôle transforme la règle en échec de CI.
 *
 * CE QU'IL VÉRIFIE
 * ----------------
 *   1. Les sept fichiers figés (BUDGETS ci-dessous) restent sous leur budget,
 *      calé sur leur taille au 9 septembre 2026. Le baisser est encouragé ;
 *      le relever est une décision qui doit apparaître dans un commit et se
 *      justifier, comme pour les plafonds de poids.
 *
 *   2. Tout autre fichier du code applicatif reste sous le PLAFOND PAR
 *      DÉFAUT. Un nouveau fichier ne peut pas naître monolithe : s'il devient
 *      trop gros, on le découpe ou on écrit un budget explicite — et un
 *      budget explicite est une dette qu'on assume en public.
 *
 *   npm run test:taille
 */

'use strict';

import { readFileSync, existsSync, readdirSync } from 'node:fs';

/**
 * Budgets en lignes, figés le 9 septembre 2026 à la taille mesurée exacte.
 * Le commentaire garde la valeur d'origine : si le fichier maigrit, le budget
 * reste le témoin de ce dont il partait.
 */
const BUDGETS = {
    // 2578 → 2537 le 9 septembre 2026 : première peau extraite du plan de
    // décomposition (segments médias → jellyfin/player/SegmentsMedia.js).
    // 2537 → 2524 le 10 septembre 2026 : peau 2 (helpers purs →
    // jellyfin/player/UtilitairesLecteur.js).
    // 2524 → 2518 le 10 septembre 2026 : peau 3 (compte à rebours « épisode
    // suivant » → jellyfin/player/CompteAReboursEpisode.js).
    // 2524 → 2374 le 10 septembre 2026 : peau 4 (popovers et tirage du
    // contenu → jellyfin/player/PopoversContenu.js).
    // 2524 → 2500 le 10 septembre 2026 : peau 5 (OSD & visibilité des
    // contrôles → jellyfin/player/VisibiliteControles.js).
    // 2524 → 2435 le 10 septembre 2026 : peau 6 (rapport de session
    // Jellyfin & session média système → jellyfin/player/RapportSession.js).
    // 2524 → 2476 le 10 septembre 2026 : peau 7 (chargement de la source →
    // jellyfin/player/ChargementSource.js) — dernière peau du plan.
    // +5 lignes d'INTERFACE PURE : la paire d'accesseurs publics `queue`
    // (get/set) et `videoElement` remplace les tolérances documentées
    // `_queue`/`_video` du contrat de façade.
    // Fusion des cinq peaux : le fichier mesure 2212 lignes — le plafond est
    // recalé dessus (2578 → 2212), la fusion elle-même est la preuve de la
    // descente.
    // Le budget se baisse dans le commit qui prouve la descente, jamais
    // au fil de l'eau.
    'jellyfin/player/VideoPlayer.js': 2212,
    // 1750 → 1775 le 11 septembre 2026 : +25 lignes — l'API publique
    // demandeRetour() (pipeline Retour partagé TV/bouton système Android) et
    // le marqueur de fermeture vivante dans _handleBack. Le pont Android
    // (core/PontAndroid.js) ne peut pas appeler une méthode _privée : l'audit
    // des façades impose une vraie API publique, testée.
    'core/SpatialNavigation.js': 1775,
    // 1624 → 1643 le 10 septembre 2026 : +19 lignes — le réglage « mises à
    // jour automatiques » (opt-out Windows) appartient aux réglages, pas à un
    // module satellite ; la préférence et son pont sont documentés ailleurs.
    'ui/components/SettingsPanel.js': 1643,
    'ui/components/CardBuilder.js': 1403,
    'jellyfin/search/UnifiedSearch.js': 1366,
    'ui/components/ModalSlideUpSheet.js': 1350,
    'jellyfin/api/JellyfinAPI.js': 1291,
};

/** Tout fichier applicatif sans budget explicite passe sous ce plafond. */
const PLAFOND_DEFAUT = 1200;

/** Répertoires du code applicatif — les scripts/ de contrôle ont leur propre vie. */
const RACINES = ['core', 'ui', 'jellyfin', 'integrations', 'plugins'];

/** Ce qui compte comme une ligne : tout, vides et commentaires compris.
 * Le poids d'un fichier pour l'humain, c'est ce qu'il doit LIRE, pas ce
 * qu'un analyseur déciderait de retirer. */
function compteLignes(chemin) {
    const contenu = readFileSync(chemin, 'utf8');
    const lignes = contenu.split('\n');
    // Un fichier qui se termine par un saut de ligne n'a pas de ligne fantôme.
    if (lignes.length > 0 && lignes[lignes.length - 1] === '') lignes.pop();
    return lignes.length;
}

function tousLesJs(repertoire) {
    let resultats = [];
    if (!existsSync(repertoire)) return resultats;
    const entrees = readdirSyncFichier(repertoire);
    for (const entree of entrees) {
        const chemin = `${repertoire}/${entree.nom}`;
        if (entree.estDossier) {
            // node_modules et cie ne sont jamais sous ces racines, mais la
            // défense coûte une ligne et évite une surprise.
            if (entree.nom === 'node_modules' || entree.nom === 'dist') continue;
            resultats = resultats.concat(tousLesJs(chemin));
        } else if (entree.nom.endsWith('.js')) {
            resultats.push(chemin);
        }
    }
    return resultats;
}

/** readdirSync avec withFileTypes, isolé pour rester lisible. */
function readdirSyncFichier(repertoire) {
    return readdirSync(repertoire, { withFileTypes: true })
        .map(e => ({ nom: e.name, estDossier: e.isDirectory() }))
        .sort((a, b) => a.nom.localeCompare(b.nom));
}

// ─── Exécution ───────────────────────────────────────────────────────────────

const violations = [];
const tableau = [];

// 1. Les fichiers figés, contre leur budget explicite.
for (const [chemin, budget] of Object.entries(BUDGETS)) {
    if (!existsSync(chemin)) {
        violations.push(`${chemin} — introuvable. S'il a été déplacé, mettez le budget à jour au lieu de le supprimer.`);
        tableau.push({ chemin, lignes: null, budget, etat: 'ABSENT' });
        continue;
    }
    const lignes = compteLignes(chemin);
    const marge = budget - lignes;
    tableau.push({ chemin, lignes, budget, etat: marge < 0 ? 'DÉPASSE' : 'ok' });
    if (marge < 0) {
        violations.push(`${chemin} : ${lignes} lignes > budget ${budget} (+${-marge}). La règle des monolithes : nouvelle fonctionnalité = nouveau module. Relever le budget est une décision de commit, pas un réflexe.`);
    }
}

// 2. Le reste du code applicatif, contre le plafond par défaut.
for (const racine of RACINES) {
    for (const chemin of tousLesJs(racine)) {
        if (chemin in BUDGETS) continue;
        const lignes = compteLignes(chemin);
        if (lignes > PLAFOND_DEFAUT) {
            violations.push(`${chemin} : ${lignes} lignes > plafond par défaut ${PLAFOND_DEFAUT}. Découpez-le, ou donnez-lui un budget explicite dans BUDGETS — en assumant la dette dans le message de commit.`);
        }
    }
}

// ─── Rapport ─────────────────────────────────────────────────────────────────

console.log('\nContrat de taille des monolithes (règle : ils ne grandissent plus)\n');
const largeur = Math.max(...tableau.map(t => t.chemin.length), 40);
console.log(`  ${'Fichier'.padEnd(largeur)}  Lignes  Budget  Marge`);
console.log(`  ${'─'.repeat(largeur)}  ──────  ──────  ─────`);
for (const t of tableau) {
    if (t.lignes === null) {
        console.log(`  ${t.chemin.padEnd(largeur)}    ABSENT    ${t.budget}      —`);
        continue;
    }
    const marge = t.budget - t.lignes;
    const symbole = marge < 0 ? '✖' : '✓';
    console.log(`  ${t.chemin.padEnd(largeur)}  ${String(t.lignes).padStart(6)}  ${String(t.budget).padStart(6)}  ${(marge >= 0 ? '+' + marge : String(marge)).padStart(5)}  ${symbole}`);
}
console.log(`\n  Plafond par défaut (tout autre fichier applicatif) : ${PLAFOND_DEFAUT} lignes.`);

if (violations.length > 0) {
    console.error('\n✖ Contrat de taille violé :\n');
    for (const v of violations) console.error(`  • ${v}`);
    console.error('\n  La dette se discute dans un commit ; elle ne s\'accumule pas en silence.');
    process.exit(1);
}

console.log('\n✅ Contrat de taille respecté — aucun monolithe n\'a grandi.\n');
