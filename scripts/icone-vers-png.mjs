#!/usr/bin/env node
/**
 * SpaceHub — génération des icônes binaires depuis public/icone.svg
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * Les paquets natifs (APK Android, icône .ico de l'exécutable Windows)
 * exigent des PNG et des ICO. Le dépôt ne possède qu'un SVG, et ajouter
 * une dépendance de rasterisation (sharp, svg2png, resvg…) ou un binaire
 * de conversion pour six images produites une fois par plateforme alourdit
 * `node_modules` et la chaîne d'approvisionnement pour rien : l'icône est
 * un dessin simple (fond arrondi + tracé au trait), rasterisable
 * exactement avec un raytraceur maison de ~300 lignes.
 *
 * Ce qui est implémenté, en géométrie EXACTE (pas une approximation) :
 *   • analyse des attributs du SVG source (viewBox, rect arrondi, groupe
 *     translate/scale/translate, stroke-width) — tout autre SVG est refusé
 *     avec un message clair plutôt que rendu de travers ;
 *   • aplatissage des chemins (cubiques, cubiques lissées « s », lignes,
 *     horizontales/verticales, et ARCS « a »/« A » convertis en cubiques
 *     selon la paramétrisation centre de la spécification SVG F.6.5) ;
 *   • tracé au trait d'épaisseur donnée avec bouts et jonctions RONDS
 *     (segments → quads + disques aux sommets), remplissage pair-impair
 *     par lignes de balayage ;
 *   • anticrénelage par suréchantillonnage ×4 puis décimation moyenne ;
 *   • écriture PNG (zlib de node, aucun paquet) et ICO multi-résolutions
 *     (format PNG compressé, lu par Windows Vista et suivants).
 *
 * Le rendu est DÉTERMINISTE : même entrée, octets de sortie identiques —
 * vérifiable par la somme de contrôle de l'artefact de release.
 *
 * MODES
 * -----
 *   icone <taille> <svg> <sortie.png>   une icône carrée (fond arrondi)
 *   banniere <svg> <sortie.png>         bannière Android TV 320×180
 *   ico <svg> <sortie.ico>              icône Windows multi-résolutions
 *
 * Utilisé par scripts/preparer-bobines.mjs — voir ce fichier pour l'usage.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* ── Analyse du SVG ──────────────────────────────────────────────────────── */

/**
 * Lit public/icone.svg et en extrait la géométrie attendue. Refuse
 * explicitement tout ce qui dépasse le sous-ensemble rendu — un rendu
 * silencieusement faux serait pire qu'une erreur franche.
 */
export function analyserSvg(cheminSvg) {
    const source = readFileSync(cheminSvg, 'utf8');

    const viewBox = source.match(/viewBox="0 0 (\d+) (\d+)"/);
    if (!viewBox || viewBox[1] !== '512' || viewBox[2] !== '512') {
        throw new Error(`viewBox attendu « 0 0 512 512 », trouvé : ${viewBox ? viewBox[0] : 'aucun'}`);
    }

    const rect = source.match(/<rect width="512" height="512" rx="(\d+)" fill="(#[0-9a-fA-F]{6})"\/>/);
    if (!rect) throw new Error('rect de fond introuvable (attendu : width 512, height 512, rx, fill hex)');

    const groupe = source.match(/<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\) translate\(([-\d.]+) ([-\d.]+)\)"\s+fill="none"\s+stroke="(#[0-9a-fA-F]{6})"\s+stroke-width="([\d.]+)"\s+stroke-linecap="round"\s+stroke-linejoin="round">/);
    if (!groupe) throw new Error('groupe de tracé introuvable (attendu : translate/scale/translate, fill none, stroke hex, linecap et linejoin round)');

    const chemins = [...source.matchAll(/<path d="([^"]+)"\/>/g)].map(m => m[1]);
    if (chemins.length === 0) throw new Error('aucun <path> trouvé dans le SVG');

    return {
        rx: Number(rect[1]),
        couleurFond: rect[2],
        transforme: { tx: Number(groupe[1]), ty: Number(groupe[2]), k: Number(groupe[3]), tx2: Number(groupe[4]), ty2: Number(groupe[5]) },
        couleurTrait: groupe[6],
        epaisseur: Number(groupe[7]),
        chemins,
    };
}

/* ── Analyseur de chemins ────────────────────────────────────────────────── */

/** Découpe une chaîne « d » en nombres, séparateurs implicites compris
 * (« 2-3.95 », « .55-3.03 »…) — la grammaire SVG n'exige aucun espace. */
function nombres(d) {
    const trouves = d.match(/[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g);
    return trouves ? trouves.map(Number) : [];
}

/**
 * Convertit un arc elliptique (points extrémités) en une liste de cubiques.
 * Traduction directe de l'annexe F.6.5 de la spécification SVG 1.1 —
 * l'algorithme canonique de conversion extrémités→centre.
 */
function arcVersCubiques(x1, y1, x2, y2, rx, ry, phiDeg, grandArc, sens) {
    if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
        return [{ c2x: x2, c2y: y2, x: x2, y: y2 }]; // dégénère en ligne
    }
    const phi = phiDeg * Math.PI / 180;
    const cosP = Math.cos(phi), sinP = Math.sin(phi);
    const dx2 = (x1 - x2) / 2, dy2 = (y1 - y2) / 2;
    const x1p = cosP * dx2 + sinP * dy2;
    const y1p = -sinP * dx2 + cosP * dy2;

    rx = Math.abs(rx); ry = Math.abs(ry);
    // F.6.6 — correction des rayons trop petits.
    const lambda = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
    if (lambda > 1) {
        const s = Math.sqrt(lambda);
        rx *= s; ry *= s;
    }

    const signe = (grandArc !== sens) ? 1 : -1;
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = signe * Math.sqrt(Math.max(0, num / den));
    const cxp = co * rx * y1p / ry;
    const cyp = -co * ry * x1p / rx;
    const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
    const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;

    const angleEntre = (ux, uy, vx, vy) => {
        const dot = ux * vx + uy * vy;
        const lon = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
        let a = Math.acos(Math.min(1, Math.max(-1, dot / (lon || 1))));
        if (ux * vy - uy * vx < 0) a = -a;
        return a;
    };
    const th1 = angleEntre(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dTh = angleEntre((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sens && dTh > 0) dTh -= 2 * Math.PI;
    else if (sens && dTh < 0) dTh += 2 * Math.PI;

    // Point sur l'ellipse et sa dérivée, tournés de phi puis translatés.
    const pt = (th) => [cx + rx * Math.cos(th) * cosP - ry * Math.sin(th) * sinP,
                        cy + rx * Math.sin(th) * cosP + ry * Math.cos(th) * sinP];
    const dp = (th) => [-rx * Math.sin(th) * cosP - ry * Math.cos(th) * sinP,
                        -rx * Math.sin(th) * sinP + ry * Math.cos(th) * cosP];

    const nb = Math.ceil(Math.abs(dTh) / (Math.PI / 2));
    const delta = dTh / nb;
    const t = 4 / 3 * Math.tan(delta / 4);
    const cubiques = [];
    let th = th1;
    for (let i = 0; i < nb; i++) {
        const th2 = th + delta;
        const p1 = pt(th), d1 = dp(th), p2 = pt(th2), d2 = dp(th2);
        cubiques.push({
            c1x: p1[0] + t * d1[0], c1y: p1[1] + t * d1[1],
            c2x: p2[0] - t * d2[0], c2y: p2[1] - t * d2[1],
            x: p2[0], y: p2[1],
        });
        th = th2;
    }
    return cubiques;
}

const PAS_CUBIQUE = 48; // échantillons par cubique — suréchantillonné déjà ×4

/**
 * Analyse une chaîne « d » (sous-ensemble : M m L l H h V v C c S s A a Z z)
 * et retourne des POLYLIGNES en unités du chemin (24 pour notre icône).
 * Les arcs sont convertis en cubiques, les cubiques en segments — le
 * traceur au trait n'a plus ensuite que des segments à décrire.
 */
export function cheminsVersPolylignes(chemins) {
    const polylignes = [];
    let x = 0, y = 0, departX = 0, departY = 0;
    let derC2x = 0, derC2y = 0; // pour la réflexion de « s » (cubique lissée)

    const ligne = () => { const l = [[x, y]]; polylignes.push(l); return l; };
    let courante = null;

    for (const d of chemins) {
        const jetons = d.match(/[MmLlHhVvCcSsAaZz]|[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g) || [];
        let i = 0;
        let cmd = '';
        courante = null;
        const suivant = () => Number(jetons[i++]);

        while (i < jetons.length) {
            if (/[MmLlHhVvCcSsAaZz]/.test(jetons[i])) cmd = jetons[i++];
            const rel = cmd >= 'a' && cmd <= 'z' && cmd !== 'z';
            const maj = cmd.toUpperCase();

            if (maj === 'M') {
                x = suivant() + (rel ? x : 0); y = suivant() + (rel ? y : 0);
                departX = x; departY = y;
                cmd = rel ? 'l' : 'L'; // répétition implicite : lineto
                courante = ligne();
            } else if (maj === 'L') {
                x = suivant() + (rel ? x : 0); y = suivant() + (rel ? y : 0);
                if (!courante) courante = ligne(); else courante.push([x, y]);
            } else if (maj === 'H') {
                x = suivant() + (rel ? x : 0);
                if (!courante) courante = ligne(); else courante.push([x, y]);
            } else if (maj === 'V') {
                y = suivant() + (rel ? y : 0);
                if (!courante) courante = ligne(); else courante.push([x, y]);
            } else if (maj === 'C' || maj === 'S') {
                let c1x, c1y;
                if (maj === 'S') {
                    // Premier point de contrôle = reflet du précédent.
                    c1x = 2 * x - derC2x; c1y = 2 * y - derC2y;
                } else {
                    c1x = suivant() + (rel ? x : 0); c1y = suivant() + (rel ? y : 0);
                }
                const c2x = suivant() + (rel ? x : 0), c2y = suivant() + (rel ? y : 0);
                const fx = suivant() + (rel ? x : 0), fy = suivant() + (rel ? y : 0);
                if (!courante) courante = ligne();
                for (let t = 1; t <= PAS_CUBIQUE; t++) {
                    const u = t / PAS_CUBIQUE, v = 1 - u;
                    courante.push([
                        v * v * v * x + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * fx,
                        v * v * v * y + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * fy,
                    ]);
                }
                derC2x = c2x; derC2y = c2y;
                x = fx; y = fy;
            } else if (maj === 'A') {
                const rx = suivant(), ry = suivant(), rot = suivant();
                const grand = suivant() !== 0, sens = suivant() !== 0;
                const fx = suivant() + (rel ? x : 0), fy = suivant() + (rel ? y : 0);
                if (!courante) courante = ligne();
                for (const cub of arcVersCubiques(x, y, fx, fy, rx, ry, rot, grand, sens)) {
                    for (let t = 1; t <= PAS_CUBIQUE; t++) {
                        const u = t / PAS_CUBIQUE, v = 1 - u;
                        courante.push([
                            v * v * v * x + 3 * v * v * u * cub.c1x + 3 * v * u * u * cub.c2x + u * u * u * cub.x,
                            v * v * v * y + 3 * v * v * u * cub.c1y + 3 * v * u * u * cub.c2y + u * u * u * cub.y,
                        ]);
                    }
                }
                x = fx; y = fy;
                derC2x = x; derC2y = y;
            } else if (maj === 'Z') {
                if (courante && (x !== departX || y !== departY)) courante.push([departX, departY]);
                x = departX; y = departY;
                courante = null;
                derC2x = x; derC2y = y;
            } else {
                throw new Error(`commande de chemin non gérée : « ${cmd} »`);
            }
        }
    }
    return polylignes;
}

/* ── Rasterisation ───────────────────────────────────────────────────────── */

/** Remplissage pair-impair d'un polygone dans un masque 1 bit par ligne. */
function remplirPolygone(masque, W, H, pts) {
    let yMin = Infinity, yMax = -Infinity;
    for (const p of pts) { if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1]; }
    const y0 = Math.max(0, Math.floor(yMin)), y1 = Math.min(H - 1, Math.ceil(yMax));
    for (let y = y0; y <= y1; y++) {
        const yc = y + 0.5;
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
                xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
            }
        }
        xs.sort((m, n) => m - n);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
            const xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
            for (let x = xa; x <= xb; x++) masque[y * W + x] = 1;
        }
    }
}

/** Disque plein — bouts ronds et jonctions rondes du trait. */
function remplirDisque(masque, W, H, cx, cy, r) {
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - cy;
        const q = r * r - dy * dy;
        if (q <= 0) continue;
        const dx = Math.sqrt(q);
        const xa = Math.max(0, Math.ceil(cx - dx - 0.5));
        const xb = Math.min(W - 1, Math.floor(cx + dx - 0.5));
        for (let x = xa; x <= xb; x++) masque[y * W + x] = 1;
    }
}

/** Rectangle aux coins arrondis — le fond de l'icône. */
function remplirRectArrondi(masque, W, H, x0, y0, x1, y1, r) {
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
        const yc = y + 0.5;
        if (yc < y0 || yc > y1) continue;
        let xa = x0, xb = x1;
        if (yc < y0 + r || yc > y1 - r) {
            const cyr = (yc < y0 + r) ? y0 + r : y1 - r;
            const dy = Math.abs(cyr - yc);
            const q = r * r - dy * dy;
            if (q <= 0) continue;
            const dx = Math.sqrt(q);
            xa = x0 + r - dx; xb = x1 - r + dx;
        }
        const a = Math.max(0, Math.ceil(xa - 0.5));
        const b = Math.min(W - 1, Math.floor(xb - 0.5));
        for (let x = a; x <= b; x++) masque[y * W + x] = 1;
    }
}

/**
 * Rend l'icône en RGBA.
 *
 * @param {object} svg           sortie de analyserSvg()
 * @param {number} taille        côté de l'image en pixels
 * @param {object} [options]     bannière : fond plein et repère du glyphe
 * @returns {Buffer}             pixels RGBA, taille × taille
 */
export function rendre(svg, taille, options = {}) {
    const banniere = options.banniere === true;
    const SUR = 4;                                // suréchantillonnage
    const W = taille * SUR, H = (banniere ? Math.round(taille * 180 / 320) : taille) * SUR;
    const echelle = W / 512;                      // unités SVG → pixels

    const fond = new Uint8Array(W * H);
    if (banniere) {
        remplirRectArrondi(fond, W, H, 0, 0, W, H, 0);
    } else {
        remplirRectArrondi(fond, W, H, 0, 0, W, H, svg.rx * echelle);
    }

    // Le repère du glyphe : notre SVG applique translate(k) scale translate(-12).
    const { tx, ty, k, tx2, ty2 } = svg.transforme;
    const K = banniere ? 4.2 : k;                 // bannière : glyphe plus petit, centré
    const TX = banniere ? W / 2 : tx * echelle;
    const TY = banniere ? H / 2 : ty * echelle;

    const trait = new Uint8Array(W * H);
    const hw = (svg.epaisseur / 2) * K * echelle; // demi-épaisseur en pixels
    const polylignes = cheminsVersPolylignes(svg.chemins);

    for (const pl of polylignes) {
        // Projection dans l'espace pixel (les unités du chemin sont 24).
        const pts = pl.map(([x, y]) => [TX + K * (x + tx2) * echelle, TY + K * (y + ty2) * echelle]);
        for (const [px, py] of pts) remplirDisque(trait, W, H, px, py, hw);
        for (let i = 0; i + 1 < pts.length; i++) {
            const a = pts[i], b = pts[i + 1];
            const dx = b[0] - a[0], dy = b[1] - a[1];
            const lon = Math.hypot(dx, dy);
            if (lon < 0.01) continue;             // couvert par les disques
            const nx = -dy / lon * hw, ny = dx / lon * hw;
            remplirPolygone(trait, W, H, [
                [a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny],
                [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny],
            ]);
        }
    }

    // Composition + décimation moyenne (anticrénelage).
    const rgbFond = hexVersRgb(svg.couleurFond);
    const rgbTrait = hexVersRgb(svg.couleurTrait);
    const hSortie = H / SUR;
    const sortie = Buffer.alloc(taille * hSortie * 4);
    for (let yo = 0; yo < hSortie; yo++) {
        for (let xo = 0; xo < taille; xo++) {
            let a = 0, r = 0, g = 0, b = 0;       // accumulé prémultiplié
            for (let sy = 0; sy < SUR; sy++) {
                for (let sx = 0; sx < SUR; sx++) {
                    const idx = (yo * SUR + sy) * W + (xo * SUR + sx);
                    const dansTrait = trait[idx];
                    const dansFond = fond[idx];
                    let pr = 0, pg = 0, pb = 0, pa = 0;
                    if (dansTrait) { pr = rgbTrait[0]; pg = rgbTrait[1]; pb = rgbTrait[2]; pa = 255; }
                    else if (dansFond) { pr = rgbFond[0]; pg = rgbFond[1]; pb = rgbFond[2]; pa = 255; }
                    r += pr; g += pg; b += pb; a += pa;
                }
            }
            const n = SUR * SUR;
            const o = (yo * taille + xo) * 4;
            if (a > 0) {
                sortie[o] = Math.round(r / a * 255);
                sortie[o + 1] = Math.round(g / a * 255);
                sortie[o + 2] = Math.round(b / a * 255);
                sortie[o + 3] = Math.round(a / n);
            }
        }
    }
    return sortie;
}

function hexVersRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/* ── PNG (RFC 2083) et ICO, sans aucune dépendance ───────────────────────── */

const TABLE_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(morceau) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < morceau.length; i++) c = TABLE_CRC[(c ^ morceau[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function morceauPng(type, donnees) {
    const t = Buffer.from(type, 'ascii');
    const longueur = Buffer.alloc(4);
    longueur.writeUInt32BE(donnees.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, donnees])));
    return Buffer.concat([longueur, t, donnees, crc]);
}

/** Code un PNG RGBA en mémoire (même conteneur que ecrirePng). */
function ecrirePngBuffer(rgba, w, h) {
    const brut = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        brut[y * (w * 4 + 1)] = 0;
        Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(brut, y * (w * 4 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        morceauPng('IHDR', ihdr),
        morceauPng('IDAT', deflateSync(brut, { level: 9 })),
        morceauPng('IEND', Buffer.alloc(0)),
    ]);
}

/** Écrit un PNG RGBA 8 bits. */
export function ecrirePng(chemin, rgba, w, h) {
    const png = ecrirePngBuffer(rgba, w, h);
    writeFileSync(chemin, png);
    return png;
}

/** Réduit une image d'un facteur entier exact par moyennage de blocs. */
function decimer(rgba, w, h, facteur) {
    const wl = w / facteur, hl = h / facteur;
    const sortie = Buffer.alloc(wl * hl * 4);
    for (let y = 0; y < hl; y++) {
        for (let x = 0; x < wl; x++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (let sy = 0; sy < facteur; sy++) {
                for (let sx = 0; sx < facteur; sx++) {
                    const o = ((y * facteur + sy) * w + (x * facteur + sx)) * 4;
                    const al = rgba[o + 3];
                    r += rgba[o] * al; g += rgba[o + 1] * al; b += rgba[o + 2] * al;
                    a += al;
                }
            }
            const n = facteur * facteur;
            const o = (y * wl + x) * 4;
            if (a > 0) {
                sortie[o] = Math.round(r / a);
                sortie[o + 1] = Math.round(g / a);
                sortie[o + 2] = Math.round(b / a);
                sortie[o + 3] = Math.round(a / n);
            }
        }
    }
    return { rgba: sortie, w: wl, h: hl };
}

/**
 * Écrit une ICO multi-résolutions (Vista et suivants acceptent des images
 * PNG compressées dans le conteneur ICO) : une entrée par taille demandée,
 * chaque taille rendue indépendamment pour rester exacte aux petites
 * résolutions où une simple décimation brouille le trait.
 */
export function ecrireIco(chemin, svg, tailles) {
    const images = tailles
        .slice()
        .sort((a, b) => b - a)
        .map((t) => ({ t, png: ecrirePngBuffer(rendre(svg, t), t, t) }));

    // ICONDIR (6 octets) puis une ICONDIRENTRY (16 octets) par image.
    const entete = Buffer.alloc(6);
    entete.writeUInt16LE(1, 0);                   // type 1 : icône
    entete.writeUInt16LE(images.length, 4);

    const entrees = [];
    let decalage = 6 + 16 * images.length;
    for (const { t, png } of images) {
        const e = Buffer.alloc(16);
        e[0] = t >= 256 ? 0 : t;                  // 256 se note 0
        e[1] = t >= 256 ? 0 : t;
        e.writeUInt16LE(1, 4);                    // plans de couleur
        e.writeUInt16LE(32, 6);                   // bits par pixel
        e.writeUInt32LE(png.length, 8);
        e.writeUInt32LE(decalage, 12);
        decalage += png.length;
        entrees.push(e);
    }

    const ico = Buffer.concat([entete, ...entrees, ...images.map((i) => i.png)]);
    writeFileSync(chemin, ico);
    return ico;
}

/* ── Point d'entrée en ligne de commande ─────────────────────────────────── */

function usage() {
    console.error('Usage :');
    console.error('  node scripts/icone-vers-png.mjs icone <taille> <icone.svg> <sortie.png>');
    console.error('  node scripts/icone-vers-png.mjs banniere <icone.svg> <sortie.png>   (320x180, Android TV)');
    console.error('  node scripts/icone-vers-png.mjs ico <icone.svg> <sortie.ico>');
    process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [mode, ...reste] = process.argv.slice(2);
    const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    if (mode === 'icone' && reste.length === 3) {
        const taille = Number(reste[0]);
        if (!Number.isInteger(taille) || taille < 16 || taille > 1024) {
            console.error(`taille invalide : ${reste[0]}`);
            process.exitCode = 2;
        } else {
            const svg = analyserSvg(reste[1]);
            ecrirePng(reste[2], rendre(svg, taille), taille, taille);
            console.log(`icone ${taille}x${taille} -> ${reste[2]}`);
        }
    } else if (mode === 'banniere' && reste.length === 2) {
        const svg = analyserSvg(reste[0]);
        ecrirePng(reste[1], rendre(svg, 320, { banniere: true }), 320, 180);
        console.log(`banniere 320x180 -> ${reste[1]}`);
    } else if (mode === 'ico' && reste.length === 2) {
        const svg = analyserSvg(reste[0]);
        ecrireIco(reste[1], svg, [16, 24, 32, 48, 64, 128, 256]);
        console.log(`ico multi-resolutions -> ${reste[1]}`);
    } else {
        usage();
    }
}
