import fs from 'node:fs';
import path from 'node:path';

/**
 * SpaceHub — Le build mesuré est-il celui de la source ?
 * =====================================================
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * `test:e2e` et `test:poids` mesurent **`dist/`**, pas la source. Or ils ne
 * construisent pas : ils mesurent le build qu'ils trouvent. Un `dist/` périmé
 * d'une minute produit donc un verdict qui parle d'un autre code que celui
 * qu'on vient d'écrire.
 *
 * C'est arrivé pendant la passe d'audit du mouvement : l'e2e est sorti à
 * **35/36** sur le viewport de l'écran de connexion, alors que la source était
 * correcte — `dist/index.html` datait de 15:28 et la source de 15:29. Un faux
 * ROUGE, donc, mais le même défaut qu'un faux vert : le verdict ne portait pas
 * sur le code en cours. `npm run verify` construit avant de mesurer et
 * n'attrape donc jamais ce cas ; un appel direct à `test:e2e`, si.
 *
 * CE QU'IL COMPARE
 * ----------------
 * La modification la plus récente de la source (feuilles, modules, gabarits,
 * configuration de construction) contre la modification la plus récente du
 * build. Si la source est plus jeune, on refuse de mesurer.
 *
 * Il ne REGARDE PAS le contenu : comparer des horodatages suffit à répondre à
 * la seule question qui compte — « ce build vient-il de ce code ? ». Un build
 * à jour mais identique reste accepté, et c'est voulu : ce contrôle ne dit
 * rien de la justesse, il dit la provenance.
 */

const RACINES_SOURCE = ['ui', 'core', 'jellyfin', 'integrations', 'plugins', 'public'];
const FICHIERS_SOURCE = ['index.html', 'vite.config.js', 'package.json'];

function plusRecent(repertoire, extensions) {
    let recent = 0;
    let quel = null;
    const visiter = dossier => {
        if (!fs.existsSync(dossier)) return;
        for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name === 'dist') continue;
            const p = path.join(dossier, e.name);
            if (e.isDirectory()) visiter(p);
            else if (extensions.some(x => e.name.endsWith(x))) {
                const t = fs.statSync(p).mtimeMs;
                if (t > recent) { recent = t; quel = p; }
            }
        }
    };
    visiter(repertoire);
    return { quand: recent, quel };
}

/**
 * Refuse de continuer si `dist/` est plus ancien que la source.
 *
 * @returns {{ ok: true, dist: number, source: number } | { ok: false, dist: number, source: number, quel: string }}
 */
export function verifierFraicheurDist({ cwd = process.cwd(), dist = 'dist' } = {}) {
    const dossierDist = path.resolve(cwd, dist);

    if (!fs.existsSync(dossierDist)) {
        return { ok: false, dist: 0, source: 0, quel: 'dist/ est absent' };
    }

    const build = plusRecent(dossierDist, ['.js', '.css', '.html']);

    // Les racines applicatives, puis les fichiers de construction : ce sont
    // eux qui décident de ce que contient dist/.
    let source = { quand: 0, quel: null };
    for (const racine of RACINES_SOURCE) {
        const r = plusRecent(path.resolve(cwd, racine), ['.js', '.css', '.html']);
        if (r.quand > source.quand) source = r;
    }
    for (const f of FICHIERS_SOURCE) {
        const p = path.resolve(cwd, f);
        if (!fs.existsSync(p)) continue;
        const t = fs.statSync(p).mtimeMs;
        if (t > source.quand) source = { quand: t, quel: p };
    }

    return {
        ok: source.quand <= build.quand,
        dist: build.quand,
        source: source.quand,
        quel: source.quel ? path.relative(cwd, source.quel).replace(/\\/g, '/') : null,
    };
}

/**
 * Garde prête à poser en tête d'un script qui mesure `dist/`.
 * Termine le processus en cas de build périmé — c'est un refus, pas un avertissement.
 */
export function exigerDistAJour(etiquette) {
    const r = verifierFraicheurDist();
    if (r.ok) return;

    const quand = t => (t ? new Date(t).toISOString().slice(11, 19) : '  absent ');
    console.error(`\n✖ ${etiquette} : le build mesuré n'est pas celui de la source.\n`);
    if (!r.dist) console.error('   dist/ est absent — lancez « npm run build ».');
    else {
        console.error(`   source modifiée à ${quand(r.source)} (${r.quel})`);
        console.error(`   build  construit à ${quand(r.dist)}`);
    }
    console.error('\n   Ces deux contrôles mesurent dist/ : sans reconstruction, leur verdict');
    console.error('   porte sur un autre code que celui qui vient d\'être écrit.\n');
    process.exit(1);
}
