#!/usr/bin/env node
/**
 * SpaceHub — Vérification de la coquille GSM
 * ==========================================
 *
 * La passe e2e mobile (scénarios « GSM — » de scripts/e2e.mjs) prouve le
 * COMPORTEMENT dans un vrai téléphone simulé. Ce contrôle prouve les
 * INVARIANTS STATIQUES que la passe e2e ne voit pas, parce qu'ils sont
 * précisément de la famille des défauts qui ont coûté le plus dans ce
 * dépôt : du vert qui ment.
 *
 *   1. le zoom bloqué : « user-scalable=no » / « maximum-scale » dans le
 *      viewport est un anti-pattern listé (WCAG 1.4.4) qui revenait sans
 *      qu personne ne l'ait décidé ;
 *   2. les champs < 16 px hors garde tactile : moins de 16 px fait ZOOMER
 *      le clavier Android au focus — un défaut invisible au bureau ;
 *   3. le hover qui colle : une règle :hover appliquée à un élément de la
 *      coquille GSM sans garde (hover: hover) reste posée après un tap ;
 *   4. le sélecteur fantôme : une classe GSM référencée par le CSS mais
 *      jamais émise par le JS (ou l'inverse) — la famille de défauts que
 *      nav-contract-check traque pour le moteur TV, ici pour la coquille ;
 *   5. le Retour sans mémoire : le bouton système doit fermer une couche,
 *      PUIS revenir à l'onglet précédent, et seulement ensuite proposer la
 *      sortie. Si l'étape du milieu disparaît, Retour depuis Flux demande de
 *      quitter l'application — le geste le plus utilisé d'Android redevient
 *      destructeur.
 *
 * Chaque règle est checkable sans navigateur : ce script lit les sources.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full, { throwIfNoEntry: false })?.isDirectory()) {
            if (entry !== 'node_modules' && entry !== '.git') walk(full, out);
        } else if (/\.(js|mjs|css|html)$/.test(entry)) out.push(full);
    }
    return out;
}

const FAULTS = [];
const attendus = {
    viewport: 0,
    hoverGarde: 0,
    dvh: 0,
    tapHighlight: 0,
    overscroll: 0,
    classesEmises: 0,
    cibles48: 0,
    retourOnglets: 0,
};

// ─── 1. Viewport : jamais de zoom bloqué ─────────────────────────────────────
const indexHtml = readFileSync(join(RACINE, 'index.html'), 'utf8');
attendus.viewport = 1;
{
    const m = indexHtml.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']+)["']/i);
    if (!m) FAULTS.push('index.html — aucune meta viewport (les mobiles rendent à 980 px et tout est minuscule).');
    else if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(m[1])) {
        FAULTS.push(`index.html — viewport anti-pattern « ${m[1]} » : le pincer-zoom est un besoin d'accessibilité (WCAG 1.4.4).`);
    } else if (!/viewport-fit=cover/.test(m[1])) {
        FAULTS.push('index.html — viewport sans viewport-fit=cover : les safe-areas ne sont pas exposées aux encoches.');
    }
}

// ─── 2. La feuille GSM existe, est scopée, et ses classes sont émises ────────
const gsmCss = readFileSync(join(RACINE, 'ui', 'layouts', 'GsmNav.css'), 'utf8');
attendus.tapHighlight = (gsmCss.match(/-webkit-tap-highlight-color:\s*transparent/g) || []).length;
attendus.overscroll = (gsmCss.match(/overscroll-behavior:\s*contain/g) || []).length;
if (!/-webkit-tap-highlight-color:\s*transparent/.test(gsmCss) && !/-webkit-tap-highlight-color:\s*transparent/.test(readFileSync(join(RACINE, 'public', 'design-system', 'tokens.css'), 'utf8'))) {
    FAULTS.push('GsmNav.css / tokens.css — aucun -webkit-tap-highlight-color: transparent posé intentionnellement : le surlignage natif doublera chaque état visuel.');
}
if (!/overscroll-behavior:\s*contain/.test(gsmCss) && !/overscroll-behavior-y:\s*contain/.test(readFileSync(join(RACINE, 'public', 'design-system', 'tokens.css'), 'utf8'))) {
    FAULTS.push('GsmNav.css / tokens.css — aucun overscroll-behavior: contain : les feuilles modales rebondissent et le pull-to-refresh natif concurrence celui de TouchEngine.');
}

/**
 * Classes que la COQUILLE déclare — chacune doit être émise par le JS.
 *
 * L'inventaire couvrait GsmNav.css seul (vingt classes). Il couvre maintenant
 * les deux feuilles de la coquille : le dock et son île vivent dans
 * AppLayout.css, et c'est là que se trouvaient les sélecteurs que GsmNav.css
 * neutralisait. Scoper l'inventaire au fichier qui portait la garde faisait
 * dépendre la couverture de l'endroit où la garde avait été écrite — une
 * neutralisation retirée faisait alors baisser le nombre de classes vérifiées
 * sans qu'aucune ne disparaisse. 52 classes ici, zéro fantôme.
 */
const appLayoutCss = readFileSync(join(RACINE, 'ui', 'layouts', 'AppLayout.css'), 'utf8');
const classesCssGsm = [...(gsmCss + '\n' + appLayoutCss).matchAll(/\.([a-z][a-z0-9-]*)/gi)].map(m => m[1])
    .filter(c => c.startsWith('sh-'));
const sourcesJs = walk(join(RACINE, 'ui')).concat(walk(join(RACINE, 'core')))
    .map(f => readFileSync(f, 'utf8')).join('\n');
const uniques = [...new Set(classesCssGsm)];
for (const classe of uniques) {
    // Une classe CSS GSM est « émise » si elle apparaît dans le JS des
    // composants (gabarits, classList, className) — la même règle que
    // nav-contract-check pour les sélecteurs du moteur TV.
    const emise = sourcesJs.includes(classe);
    if (!emise) FAULTS.push(`GsmNav.css — classe .${classe} déclarée mais jamais émise par le JS (sélecteur fantôme : le style ne s'appliquera jamais).`);
}
attendus.classesEmises = uniques.length;

// ─── 3. AUCUN survol à découvert dans la coquille ──────────────────────────
//
// CE QUE CE CONTRÔLE MESURAIT, ET POURQUOI IL A CHANGÉ
// ---------------------------------------------------
// Il comptait les règles `:hover` d'AppLayout.css et exigeait la PRÉSENCE d'un
// bloc `@media (hover: none)` dans GsmNav.css. C'était une garde APRÈS COUP :
// le survol s'appliquait d'abord, la neutralisation le corrigeait ensuite — et
// elle ne couvrait que neuf sélecteurs sur les deux cent trente du dépôt.
//
// Depuis le 12 septembre 2026, la garde est à la SOURCE : chaque règle
// `:hover` est dans un `@media (hover: hover)`, et la neutralisation de
// GsmNav.css est devenue inutile (elle a été retirée). L'invariant se mesure
// donc directement : **zéro survol à découvert** dans les feuilles de la
// coquille. Une règle dans `(hover: none)` ne compte pas — elle neutralise
// exprès, c'est le seul endroit où un `:hover` a le droit d'être nu.
{
    const COQUILLE = ['AppLayout.css', 'GsmNav.css', 'TouchEngine.css'];
    const dossiers = [join(RACINE, 'ui', 'layouts'), join(RACINE, 'core')];
    /** Retire les blocs @media dont le préambule matche, accolades équilibrées. */
    const retirer = (texte, motif) => {
        let sortie = '', i = 0;
        while (i < texte.length) {
            if (texte.startsWith('@media', i) && motif.test(texte.slice(i, i + 80))) {
                const debut = texte.indexOf('{', i);
                if (debut === -1) break;
                let profondeur = 0, j = debut;
                for (; j < texte.length; j++) {
                    if (texte[j] === '{') profondeur++;
                    else if (texte[j] === '}') { profondeur--; if (profondeur === 0) break; }
                }
                sortie += texte.slice(i, j + 1).replace(/[^\n]/g, ' ');
                i = j + 1;
            } else { sortie += texte[i]; i += 1; }
        }
        return sortie;
    };
    let nus = 0;
    for (const feuille of COQUILLE) {
        const chemin = dossiers.map(d => join(d, feuille)).find(p => statSync(p, { throwIfNoEntry: false }));
        if (!chemin) { FAULTS.push(`coquille GSM — feuille introuvable : ${feuille}`); continue; }
        const css = readFileSync(chemin, 'utf8');
        const nu = retirer(retirer(css, /hover:\s*hover/), /hover:\s*none/);
        nus += (nu.match(/:hover\b/g) || []).length;
    }
    attendus.hoverGarde = nus;
    if (nus > 0) {
        FAULTS.push(`${nus} règle(s) :hover À DÉCOUVERT dans la coquille : sur un téléphone elles ne s'appliquent jamais, ou collent après un tap. La garde est « @media (hover: hover) » autour de la règle.`);
    }
}

// ─── 4. Les unités dvh sont présentes au moins au niveau racine ─────────────
{
    const index = readFileSync(join(RACINE, 'index.html'), 'utf8');
    attendus.dvh = (index.match(/100dvh/g) || []).length;
    if (!/min-height:\s*100dvh/.test(index)) {
        FAULTS.push('index.html — pas de min-height: 100dvh sur le conteneur racine : 100vh inclut la zone que la barre système Android réserve, splash et coquille débordent dessous.');
    }
}

// ─── 5. Les cibles tactiles 48px incluent la coquille GSM ───────────────────
{
    const touchCss = readFileSync(join(RACINE, 'core', 'TouchEngine.css'), 'utf8');
    const bloc = touchCss.slice(touchCss.indexOf('@media (hover: none) and (pointer: coarse)'));
    attendus.cibles48 = ['.sh-tabbar-btn', '.sh-gsm-header__btn', '.sh-gsm-menu__item']
        .filter(s => bloc.includes(s)).length;
    if (attendus.cibles48 < 3) {
        FAULTS.push('TouchEngine.css — la liste des cibles 48px ne couvre plus toute la coquille GSM (barre, en-tête, menu).');
    }
}

// ─── 6. Le Retour défait une navigation AVANT de proposer la sortie ─────────
{
    const pont = readFileSync(join(RACINE, 'core', 'PontAndroid.js'), 'utf8');
    const layout = readFileSync(join(RACINE, 'ui', 'layouts', 'AppLayout.js'), 'utf8');
    const hub = readFileSync(join(RACINE, 'core', 'SpaceHub.js'), 'utf8');

    const appel = pont.indexOf('this._retourVue?.()');
    const sortie = pont.indexOf('quitter-suggere');
    attendus.retourOnglets = appel > -1 ? 1 : 0;
    if (appel === -1 || sortie === -1 || appel > sortie) {
        FAULTS.push('PontAndroid.js — le retour système ne défait plus la navigation d\'onglet avant de proposer la sortie : sur un téléphone, Retour depuis Flux demande de quitter l\'application (core/HistoriqueVues.js).');
    }
    if (!/^\s{4}retourVue\(\)\s*\{/m.test(layout)) {
        FAULTS.push('AppLayout.js — la coquille n\'expose plus retourVue() : le pont n\'a plus rien à appeler en APK.');
    }
    if (!/brancherVues/.test(hub)) {
        FAULTS.push('SpaceHub.js — la coquille n\'est plus branchée sur le pont (brancherVues()) : retourVue() ne sera jamais atteint.');
    }
}

// ─── Verdict ─────────────────────────────────────────────────────────────────
console.log(`Coquille GSM : viewport vérifié, ${attendus.classesEmises} classes CSS croisées au JS, `
    + `${attendus.hoverGarde} règles :hover gardées, dvh×${attendus.dvh}, cibles 48px ${attendus.cibles48}/3, `
    + `retour-onglet ${attendus.retourOnglets ? 'branché' : 'ABSENT'}.`);
if (FAULTS.length) {
    console.error(`\n✖ ${FAULTS.length} invariant(s) GSM violé(s) :`);
    for (const f of FAULTS) console.error(`   · ${f}`);
    console.error('\nLa coquille GSM se dégrade en silence : rétablissez l\'invariant ou documentez\nsa suppression dans docs/UI_MOBILE.md ET dans ce contrôle.');
    process.exit(1);
}
console.log('Aucun invariant GSM violé : le profil mobile reste conforme.');
