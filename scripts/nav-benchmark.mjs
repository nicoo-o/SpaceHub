/**
 * SpaceHub — Mesure du coût de la navigation spatiale
 * ===================================================
 *
 * Question à laquelle ce script répond : combien coûte UN appui sur une flèche,
 * en fonction du nombre d'éléments focalisables à l'écran ?
 *
 * Elle n'est pas théorique. `getFocusables()` mesure chaque candidat
 * (`getBoundingClientRect` + `getComputedStyle`) pour filtrer les invisibles,
 * puis `_findSpatialTarget()` mesure à nouveau chaque candidat retenu. Sur un
 * tableau de bord chargé, cela fait plusieurs centaines de mesures de
 * géométrie par appui — et chacune peut forcer un recalcul de mise en page.
 *
 * Sur un ordinateur de développement, cela ne se voit pas. Sur le Chromium
 * d'un téléviseur de 2020, dix à vingt fois plus lent, c'est la différence
 * entre une navigation instantanée et une navigation qui traîne.
 *
 *   node scripts/nav-benchmark.mjs
 *
 * Le script s'ABSTIENT (code 0) si aucun navigateur n'est utilisable.
 */

import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve('dist');
const PORT = Number(process.env.SPACEHUB_BENCH_PORT || 4401);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.woff2': 'font/woff2', '.json': 'application/json' };

if (!fs.existsSync(path.join(RACINE, 'index.html'))) {
    console.error('✖ dist/ absent. Lancez « npm run build » d\'abord.');
    process.exit(1);
}

const serveur = http.createServer((req, res) => {
    const chemin = decodeURIComponent(req.url.split('?')[0]);
    const fichier = path.join(RACINE, chemin === '/' ? '/index.html' : chemin);
    if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) {
        res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fichier)] || 'application/octet-stream' });
    fs.createReadStream(fichier).pipe(res);
});

async function lancerNavigateur() {
    const args = ['--no-sandbox', '--disable-dev-shm-usage'];
    const candidats = [];
    if (process.env.SPACEHUB_CHROMIUM) candidats.push({ executablePath: process.env.SPACEHUB_CHROMIUM, args });
    for (const p of ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        '/opt/pw-browsers/chromium/chrome-linux/chrome']) {
        if (fs.existsSync(p)) candidats.push({ executablePath: p, args });
    }
    candidats.push({ channel: 'chrome', args }, { channel: 'msedge', args });
    for (const opts of candidats) {
        try { return await chromium.launch(opts); } catch { /* suivant */ }
    }
    return null;
}

await new Promise(r => serveur.listen(PORT, r));
const navigateur = await lancerNavigateur();
if (!navigateur) {
    console.log('⚠  Aucun navigateur utilisable — mesure ABSTENUE.');
    serveur.close();
    process.exit(0);
}

const ctx = await navigateur.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' }).catch(() => {});
await new Promise(r => setTimeout(r, 1500));

console.log('SpaceHub — coût d\'un appui sur une flèche\n');
console.log('  cartes │ candidats │ un appui │ rect │ style');
console.log('  ───────┼───────────┼──────────┼──────┼──────');

const mesures = [];
const enSalve = process.env.SPACEHUB_BENCH_SALVE !== '0';

for (const nombre of [24, 60, 150, 300, 600]) {
    const r = await page.evaluate(async ([nombre, enSalve]) => {
        const nav = window.SpaceHub.core.spatialNavigation;

        // Grille synthétique dans le scope « dashboard », géométrie réaliste
        // (cartes 200x300, 8 par rangée) pour que le score ait du sens.
        let hote = document.getElementById('__bench');
        if (hote) hote.remove();
        hote = document.createElement('div');
        hote.id = '__bench';
        hote.className = 'sh-dashboard-body';
        hote.style.cssText = 'position:absolute;top:0;left:0;width:1900px;';
        for (let i = 0; i < nombre; i++) {
            const c = document.createElement('div');
            c.className = 'sh-card';
            c.tabIndex = 0;
            c.style.cssText = `position:absolute;width:200px;height:300px;left:${(i % 8) * 230}px;top:${Math.floor(i / 8) * 330}px;`;
            hote.appendChild(c);
        }
        document.body.appendChild(hote);

        // Le scope doit être « dashboard » pour que le provider voie .sh-card.
        const scopeReel = nav._detectCurrentScope();
        const cartes = [...hote.children];
        nav.setFocus(cartes[Math.floor(cartes.length / 2)], { silent: true });

        // Chauffe : la première passe paye la mise en page initiale.
        for (let i = 0; i < 3; i++) { nav.getFocusables(scopeReel); nav._findSpatialTarget('right'); }

        // Compteurs RÉELS. La première version de ce script déduisait le nombre
        // d'appels d'une formule ; une formule ne remarque pas qu'un cache a
        // été ajouté. On instrumente les deux fonctions coûteuses.
        let nRect = 0;
        let nStyle = 0;
        const rectOriginal = Element.prototype.getBoundingClientRect;
        const styleOriginal = window.getComputedStyle;
        Element.prototype.getBoundingClientRect = function (...a) { nRect++; return rectOriginal.apply(this, a); };
        window.getComputedStyle = function (...a) { nStyle++; return styleOriginal.apply(window, a); };

        // UN appui = UN appel à _findSpatialTarget, qui appelle lui-même
        // getFocusables. Chronométrer les deux séparément compterait la passe
        // de mesure deux fois et gonflerait le résultat du double.
        const candidats = nav.getFocusables(scopeReel).length;
        const N = 40;
        let tAppui = 0;

        // Salve de répétition ouverte : c'est le régime qui compte, celui où
        // le moteur tire un pas toutes les 45 ms et où le cache de visibilité
        // entre en jeu. Mesurer hors salve mesurerait le cas facile.
        if (enSalve) {
            nav._executeNavStep = () => {};
            nav._startInputRepeat('right');
        }

        nRect = 0; nStyle = 0;
        for (let i = 0; i < N; i++) {
            // Invalider le cache de mise en page comme le ferait un vrai
            // déplacement de focus (le défilement et la classe de focus
            // changent la géométrie) : sinon on mesure un navigateur au repos.
            document.body.style.setProperty('--bench', String(i));
            void document.body.offsetWidth;

            const t = performance.now();
            nav._findSpatialTarget(i % 2 ? 'right' : 'down');
            tAppui += performance.now() - t;
        }

        if (enSalve) nav._stopInputRepeat();
        Element.prototype.getBoundingClientRect = rectOriginal;
        window.getComputedStyle = styleOriginal;
        hote.remove();
        return {
            scope: scopeReel,
            candidats,
            appui: tAppui / N,
            rectsParAppui: Math.round(nRect / N),
            stylesParAppui: Math.round(nStyle / N),
        };
    }, [nombre, enSalve]);

    const total = r.appui;
    mesures.push({ nombre, ...r, total });
    console.log(`  ${String(nombre).padStart(6)} │ ${String(r.candidats).padStart(9)} │ `
        + `${total.toFixed(2).padStart(5)} ms │ `
        + `${String(r.rectsParAppui).padStart(4)} │ ${String(r.stylesParAppui).padStart(5)}`);
}

console.log('\n  « rect » et « style » COMPTENT les appels réels à getBoundingClientRect');
console.log('  et getComputedStyle pour un appui (les deux fonctions sont instrumentées).');
console.log('  Chacun peut forcer un recalcul de mise en page ou de style.');

const gros = mesures.at(-1);
const petit = mesures[0];
const facteur = (gros.total / petit.total).toFixed(1);
console.log(`\n  De ${petit.candidats} à ${gros.candidats} candidats : ${facteur}× plus lent.`);
console.log('  Un téléviseur de 2020 est 10 à 20× plus lent que cette machine.');
console.log(`  Extrapolation prudente (×12) au pire cas mesuré : ~${(gros.total * 12).toFixed(0)} ms par appui.`);

await ctx.close();
await navigateur.close();
serveur.close();
