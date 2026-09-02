/**
 * SpaceHub — Consolidation du vocabulaire de mouvement
 * ====================================================
 *
 * Remplace les courbes et durées écrites en dur par les tokens de mouvement de
 * tokens.css. Avant : 14 courbes de Bézier distinctes et une trentaine de durées,
 * donc deux transitions équivalentes n'avaient pas le même rythme selon le
 * fichier (audit §5, « le système d'animation n'en est pas un »).
 *
 * Règles de prudence :
 *   - seules les déclarations `transition*` et `animation*` sont touchées ;
 *     un `translateY(180px)` n'est jamais confondu avec une durée ;
 *   - dans une forme raccourcie, seule la PREMIÈRE valeur de temps de chaque
 *     segment est une durée — la seconde est un délai (souvent un décalage
 *     volontaire), elle est laissée intacte ;
 *   - les durées déjà exprimées en token sont ignorées.
 *
 *   node scripts/motion-tokens-codemod.mjs [--apply]
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const ROOTS = ['core', 'ui', 'jellyfin', 'integrations'];

const COURBES = new Map([
    ['0.16,1,0.3,1',              '--sh-ease-out'],
    ['0.2,0.8,0.2,1',             '--sh-ease-out'],
    ['0.2,0.85,0.25,1',           '--sh-ease-out'],
    ['0.25,0.46,0.45,0.94',       '--sh-ease-out'],
    ['0.34,1.56,0.64,1',          '--sh-ease-spring'],
    ['0.34,1.56,0.45,1',          '--sh-ease-spring'],
    ['0.34,1.45,0.45,1',          '--sh-ease-spring'],
    ['0.34,1.4,0.64,1',           '--sh-ease-spring'],
    ['0.34,1.20,0.64,1',          '--sh-ease-spring'],
    ['0.3,1.3,0.6,1',             '--sh-ease-spring'],
    ['0.175,0.885,0.32,1.275',    '--sh-ease-spring'],
    ['0.4,0,0.2,1',               '--sh-ease-standard'],
    ['0.5,0,0.5,1',               '--sh-ease-in-out'],
    ['0.36,0.07,0.19,0.97',       '--sh-ease-shake'],
    ['0.19,1,0.22,1',             '--sh-ease-out'],
    ['0.25,1,0.5,1',              '--sh-ease-out'],
    ['0.2,0.9,0.3,1',             '--sh-ease-out'],
]);

/** Palier de durée le plus proche, en millisecondes. */
function palier(ms) {
    if (ms <= 130) return '--sh-dur-1';
    if (ms <= 190) return '--sh-dur-2';
    if (ms <= 290) return '--sh-dur-3';
    if (ms <= 420) return '--sh-dur-4';
    return '--sh-dur-5';
}

function enMs(txt) {
    const v = parseFloat(txt);
    return txt.trim().endsWith('ms') ? v : v * 1000;
}

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.css')) out.push(p);
    }
    return out;
}

const TEMPS = /(?<![\w.-])(\d+(?:\.\d+)?)(ms|s)(?![\w-])/g;
let nCourbes = 0, nDurees = 0, inconnues = new Set();
const fichiers = ROOTS.flatMap(r => walk(r));

for (const f of fichiers) {
    let src = fs.readFileSync(f, 'utf8');

    // 1. Courbes — remplacement direct, sans ambiguïté possible.
    src = src.replace(/cubic-bezier\(([^)]*)\)/g, (tout, args) => {
        const cle = args.split(',').map(x => x.trim()).join(',');
        const tok = COURBES.get(cle);
        if (!tok) { inconnues.add(cle); return tout; }
        nCourbes++;
        return `var(${tok})`;
    });

    // 2. Durées — uniquement dans les déclarations de transition/animation.
    src = src.replace(
        /(^\s*(?:-webkit-)?(?:transition|animation)(?:-duration)?\s*:)([^;{}]*)(;)/gm,
        (tout, tete, valeur, fin) => {
            const dureeSeule = /-duration\s*:$/.test(tete.trim());
            const segments = valeur.split(',').map(seg => {
                let vu = false;
                return seg.replace(TEMPS, (m, num, unite) => {
                    // Dans une forme raccourcie, la 2e valeur de temps est un délai.
                    if (!dureeSeule && vu) return m;
                    vu = true;
                    nDurees++;
                    return `var(${palier(enMs(num + unite))})`;
                });
            });
            return tete + segments.join(',') + fin;
        }
    );

    if (APPLY) fs.writeFileSync(f, src, 'utf8');
}

console.log(`${APPLY ? 'Appliqué' : 'Simulation'} : ${nCourbes} courbe(s) et ${nDurees} durée(s) remplacées par des tokens, sur ${fichiers.length} feuille(s).`);
if (inconnues.size) {
    console.log(`\nCourbes non cartographiées (laissées telles quelles) :`);
    for (const c of inconnues) console.log('  · cubic-bezier(' + c + ')');
}
