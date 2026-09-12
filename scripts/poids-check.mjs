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
 *   2. **Que ce qui est écrit paresseux le soit vraiment.** C'est `hls.js`
 *      qui a motivé ce fichier : 185 ko compressés — plus, à lui seul, que
 *      tout le reste réuni — importés statiquement, donc analysés avant le
 *      premier écran, pour une bibliothèque qui ne sert qu'au moment où une
 *      lecture HLS commence.
 *
 *      Un contrôle du code source ne suffirait pas : c'est le BUILD qui
 *      décide. Le point 2 confronte donc les deux — les `import()` du code
 *      d'un côté, le paquet où le build a réellement mis chaque module de
 *      l'autre. Le détail de la méthode est plus bas, avec la raison pour
 *      laquelle une liste écrite à la main ne pouvait pas tenir.
 *
 * Les plafonds sont volontairement proches des valeurs actuelles. Un plafond
 * confortable ne freine rien : il autorise la dérive jusqu'à ce qu'il soit
 * atteint, et c'est trop tard.
 */

'use strict';

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

import { exigerDistAJour } from './fraicheur-dist.mjs';

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
     *
     * 270 → 276 le 11 septembre 2026 : coquille GSM (BarreNavigation,
     * EnTeteCompact + feuille GsmNav.css) — deux variantes d'interface de
     * ~4 ko gzip, chargées au démarrage pour que le marqueur html.sh-gsm
     * trouve sa coquille dès le premier rendu sans flash d'interface PC.
     *
     * 276 → 257 le 12 septembre 2026, DANS LE BON SENS pour une fois. Le
     * découpage a été refait avec `advancedChunks` (voir le long
     * commentaire dans vite.config.js) : la console d'administration cesse
     * d'être soudée à trois modules du noyau et quitte réellement le chemin
     * critique. Mesure : 276,1 → 254,8 ko gzip, soit 21,3 ko de moins pour
     * chaque utilisateur à chaque démarrage à froid.
     *
     * Le plafond redescend avec la mesure, à 2 ko près. C'est le seul
     * moment où un plafond se resserre sans discussion : laisser 276 aurait
     * offert 21 ko de dérive gratuite à la prochaine vague, et cette marge
     * aurait été dépensée sans que personne ne le décide.
     */
    demarrage: 257 * 1024,
    /** La feuille de style unique, bloquante au rendu. */
    style: 46 * 1024,
};

/**
 * RESTE À FAIRE, et volontairement pas masqué par un plafond large.
 *
 * MISE À JOUR DU 12 SEPTEMBRE 2026 — `settings` est différé depuis la vague
 * précédente, et `admin-console` l'est vraiment depuis le nouveau découpage.
 * Reste `integrations` (17,6 ko), toujours au démarrage, et pour la raison
 * décrite ci-dessous : ce n'est pas une retouche d'import.
 *
 * Le paragraphe qui suit est conservé tel quel parce qu'il porte la seule
 * information qui manquerait sans lui — POURQUOI `integrations` résiste :
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
 */

/**
 * CE QUI DOIT RESTER HORS DU DÉMARRAGE — DÉDUIT, PLUS ÉNUMÉRÉ
 * ===========================================================
 *
 * Ce contrôle tenait une liste écrite à la main :
 *
 *     const INTERDITS_AU_DEMARRAGE = ['vendor-hls'];
 *
 * Elle a fait son travail pour `hls.js`, et elle a laissé passer tout le
 * reste. Trois paquets étaient censés être différés — `admin-console`,
 * `settings`, `hls` — et seul le dernier figurait dans la liste. Résultat
 * mesuré sur la v1.5.1 : `admin-console` (20,6 ko gzip) était préchargé à
 * chaque démarrage, pour une console éteinte par défaut, et le contrôle du
 * poids le comptait sans rien dire — il n'avait aucune raison de s'en
 * plaindre, personne ne l'avait inscrit.
 *
 * Une liste d'interdits est une liste de ce dont on s'est souvenu. Ce qu'il
 * faut vérifier, c'est une PROPRIÉTÉ :
 *
 *     un module que l'application ne joint QUE par `import()` ne doit pas
 *     atterrir dans un paquet référencé par index.html.
 *
 * C'est la définition même de « différé ». On la déduit du dépôt :
 *
 *   1. les cibles de tous les `import()` du code source — les racines
 *      paresseuses candidates ;
 *   2. moins celles qui sont AUSSI importées statiquement quelque part :
 *      un module dont une chaîne statique dépend est joignable au démarrage
 *      par construction, l'`import()` ne le diffère pas (rolldown le dit
 *      lui-même : INEFFECTIVE_DYNAMIC_IMPORT). Ce n'est pas une exception
 *      qu'on s'accorde, c'est un fait du graphe ;
 *   3. pour chacune des racines restantes, le paquet où le build l'a
 *      réellement mise, lu dans les cartes de source ;
 *   4. si ce paquet est référencé par index.html → défaut.
 *
 * Le point 3 est celui qui compte. Une lecture du code source ne suffit
 * pas : `AdminDashboardView.js` EST derrière un `import()` et se retrouvait
 * pourtant au démarrage, parce que le découpage l'avait soudée à trois
 * modules du noyau. Seul le build produit la réponse.
 *
 * Dépendance assumée : les cartes de source (`build.sourcemap: 'hidden'`).
 * Si elles disparaissent, ce contrôle ne se tait pas — il échoue en le
 * disant. Un contrôle qui cesse silencieusement de vérifier est pire que
 * pas de contrôle : il continue d'afficher du vert.
 */

/** Retire commentaires et chaînes littérales avant de chercher des imports. */
function sansCommentaires(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** Tous les fichiers .js du code applicatif (pas les tests, pas dist/). */
function fichiersSource(racine = '.') {
    const DOSSIERS = ['core', 'ui', 'jellyfin', 'integrations', 'plugins'];
    const trouves = [];
    const descendre = (dir) => {
        for (const e of readdirSync(join(racine, dir), { withFileTypes: true })) {
            const rel = `${dir}/${e.name}`;
            if (e.isDirectory()) descendre(rel);
            else if (e.name.endsWith('.js')) trouves.push(rel);
        }
    };
    for (const d of DOSSIERS) {
        if (existsSync(join(racine, d))) descendre(d);
    }
    return trouves;
}

/** Normalise un chemin relatif : « core/a/../b.js » devient « core/b.js ». */
function normaliser(chemin) {
    const pile = [];
    for (const seg of chemin.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') pile.pop();
        else pile.push(seg);
    }
    return pile.join('/');
}

/**
 * Les racines réellement paresseuses : cibles d'`import()` qu'aucune chaîne
 * statique n'atteint.
 *
 * Les chemins sont résolus depuis le fichier appelant, puis normalisés en
 * chemins relatifs à la racine du dépôt. Comparer des noms de fichiers seuls
 * suffirait presque et échouerait juste où il ne faut pas : le paquet
 * `hls.js` s'appelle `hls.mjs` dans les cartes de source, et deux fichiers
 * homonymes dans deux dossiers deviendraient le même module.
 *
 * @returns {{ racines: Array<{specificateur: string, chemin: string|null, paquetNpm: string|null}> }}
 */
function racinesParesseuses() {
    const dynamiques = new Map();   // chemin résolu (ou spécificateur nu) → spécificateur d'origine
    const statiques = new Set();

    const resoudre = (depuis, specificateur) => {
        if (!specificateur.startsWith('.')) return null;   // paquet npm
        const dossier = depuis.split('/').slice(0, -1).join('/');
        return normaliser(`${dossier}/${specificateur}`);
    };

    for (const fichier of fichiersSource()) {
        const src = sansCommentaires(readFileSync(fichier, 'utf8'));

        for (const m of src.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g)) {
            const resolu = resoudre(fichier, m[1]);
            dynamiques.set(resolu ?? m[1], m[1]);
        }
        // `import … from '…'`, `export … from '…'`, et `import '…'` (effet de bord).
        for (const m of src.matchAll(/\b(?:import|export)\b[^;'"`]*?\bfrom\s*['"`]([^'"`]+)['"`]/g)) {
            statiques.add(resoudre(fichier, m[1]) ?? m[1]);
        }
        for (const m of src.matchAll(/\bimport\s*['"`]([^'"`]+)['"`]/g)) {
            statiques.add(resoudre(fichier, m[1]) ?? m[1]);
        }
    }

    const racines = [];
    for (const [cle, specificateur] of dynamiques) {
        if (statiques.has(cle)) continue;              // aussi joint statiquement
        racines.push(specificateur.startsWith('.')
            ? { specificateur, chemin: cle, paquetNpm: null }
            : { specificateur, chemin: null, paquetNpm: cle });
    }
    racines.sort((a, b) => a.specificateur.localeCompare(b.specificateur));
    return { racines };
}

/**
 * Où le build a réellement mis chaque module, d'après les cartes de source.
 *
 * Les `sources` d'une carte sont relatives au dossier de la carte
 * (`dist/assets/`), d'où les `../../` en tête : on les normalise en chemins
 * relatifs à la racine du dépôt pour pouvoir les comparer au code source.
 *
 * @returns {{ parChemin: Map<string,string>, parPaquetNpm: Map<string,string>, nbCartes: number }}
 */
function placementDesModules() {
    const parChemin = new Map();
    const parPaquetNpm = new Map();
    let nbCartes = 0;
    if (!existsSync(ASSETS)) return { parChemin, parPaquetNpm, nbCartes };

    for (const nom of readdirSync(ASSETS)) {
        if (!nom.endsWith('.js.map')) continue;
        let carte;
        try { carte = JSON.parse(readFileSync(join(ASSETS, nom), 'utf8')); } catch { continue; }
        nbCartes += 1;
        const paquet = nom.slice(0, -4);
        for (const source of carte.sources || []) {
            const propre = normaliser(source.replace(/^(\.\.\/)+/, ''));
            parChemin.set(propre, paquet);
            const npm = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(propre);
            if (npm) parPaquetNpm.set(npm[1], paquet);
        }
    }
    return { parChemin, parPaquetNpm, nbCartes };
}

const erreurs = [];
const lignes = [];

// Ce contrôle mesure dist/ : un build périmé lui ferait peser un autre code
// que celui qu'on vient d'écrire.
exigerDistAJour('Poids des paquets');

if (!existsSync(DIST) || !existsSync(join(DIST, 'index.html'))) {
    console.error('Aucune construction dans dist/. Lancez `npm run build` d\'abord.');
    process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// Tout ce que le HTML référence directement : le script d'entrée, les
// `modulepreload`, la feuille de style. C'est exactement le chemin critique.
//
// DÉDOUBLONNÉ, par précaution et non par nécessité : la construction
// actuelle ne référence chaque fichier qu'une fois. Mais un découpage
// intermédiaire essayé pendant ce travail faisait lister le paquet d'entrée
// DEUX fois — une fois en `src`, une fois parmi ses propres
// `modulepreload`. Le navigateur ne le télécharge qu'une fois ; le compter
// deux fois ajoutait 71 ko à un total parfaitement sain, et le plafond
// passait au rouge pour une raison qui n'existait pas.
const referencees = [...new Set(
    [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map(m => m[1]))];

if (referencees.length === 0) {
    erreurs.push('Aucun paquet référencé dans dist/index.html — la construction semble incomplète.');
}

// ─── Le contrat : ce qui est paresseux dans le code l'est dans le build ───
const { racines } = racinesParesseuses();
const { parChemin, parPaquetNpm, nbCartes } = placementDesModules();
const paquetsDeDemarrage = new Set(referencees.filter(n => n.endsWith('.js')));
const rapportParesse = [];

if (nbCartes === 0) {
    erreurs.push(
        'Aucune carte de source dans dist/assets : impossible de savoir dans quel '
        + 'paquet chaque module a atterri. Ce contrôle a besoin de '
        + "`build.sourcemap` (au moins 'hidden'). Il échoue plutôt que de "
        + 'prétendre avoir vérifié.');
} else if (racines.length === 0) {
    erreurs.push(
        "Aucune racine paresseuse détectée dans le code source. C'est "
        + "invraisemblable (hls.js, la console d'administration, les réglages en "
        + "sont), donc c'est l'analyse qui a cessé de fonctionner.");
} else {
    for (const racine of racines) {
        const paquet = racine.chemin
            ? parChemin.get(racine.chemin)
            : parPaquetNpm.get(racine.paquetNpm);

        // TROIS ISSUES, TOUTES DITES À VOIX HAUTE. Le troisième cas — le
        // module n'est nulle part dans le build — est celui qu'on serait
        // tenté d'ignorer en silence ; c'est justement celui où une analyse
        // cassée (chemin mal résolu, dossier renommé) ressemblerait à un
        // succès.
        if (!paquet) {
            rapportParesse.push(`    ${racine.specificateur.padEnd(46)} absent du build`);
            continue;
        }
        if (paquetsDeDemarrage.has(paquet)) {
            erreurs.push(
                `« ${racine.specificateur} » n'est joint que par import(), mais le `
                + `build l'a mis dans « ${paquet} » — un paquet que index.html `
                + "charge au démarrage. Son import dynamique ne diffère donc rien. "
                + 'Cause habituelle : un module partagé a entraîné tout le paquet '
                + 'sur le chemin critique (voir le commentaire du découpage dans '
                + 'vite.config.js).');
        } else {
            rapportParesse.push(`    ${racine.specificateur.padEnd(46)} → ${paquet}`);
        }
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

if (rapportParesse.length) {
    console.log(`\nRacines paresseuses — cibles d'import() qu'aucune chaîne statique `
        + `n'atteint (${racines.length}) :`);
    console.log(rapportParesse.join('\n'));
}

if (erreurs.length) {
    console.error(`\nPoids : ${erreurs.length} problème(s).\n`);
    for (const e of erreurs) console.error(`  ✖ ${e}`);
    process.exit(1);
}

console.log('\nChaque racine paresseuse est hors du démarrage, aucun plafond dépassé.');
