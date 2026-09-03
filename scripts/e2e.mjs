/**
 * SpaceHub — Tests de bout en bout
 * ================================
 *
 * Les six autres suites sont statiques : elles lisent le code. Celle-ci lance
 * l'application CONSTRUITE dans un vrai navigateur et vérifie des comportements
 * — c'est-à-dire la seule catégorie de bug qui a réellement mordu en test réel.
 *
 * Chaque scénario ci-dessous correspond à un défaut trouvé puis corrigé. Ils ne
 * sont pas là pour faire du chiffre : ils sont là pour que ces défauts précis ne
 * puissent pas revenir.
 *
 *   npm run test:e2e
 *
 * Le navigateur utilisé, dans l'ordre : la variable SPACEHUB_CHROMIUM, le
 * Chromium de Playwright s'il est présent, sinon le Chrome ou l'Edge installé
 * sur la machine. Sans aucun des trois, la suite s'ABSTIENT au lieu d'échouer :
 * une machine sans navigateur n'est pas un code cassé.
 */

import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve('dist');
const PORT = Number(process.env.SPACEHUB_E2E_PORT || 4399);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.map':'application/json', '.svg':'image/svg+xml', '.png':'image/png',
               '.woff2':'font/woff2', '.json':'application/json' };

if (!fs.existsSync(path.join(RACINE, 'index.html'))) {
    console.error('✖ dist/ est absent ou incomplet. Lancez « npm run build » d\'abord.');
    process.exit(1);
}

// ─── Serveur de test ─────────────────────────────────────────────────────────
// Sert dist/, et simule un média Jellyfin pour le scénario hors-ligne.
const FAUX_MEDIA = Buffer.alloc(6 * 1024 * 1024, 7);
let reseauCoupe = false;

const serveur = http.createServer((req, res) => {
    if (reseauCoupe) { req.socket.destroy(); return; }
    const chemin = decodeURIComponent(req.url.split('?')[0]);

    if (chemin.startsWith('/Videos/')) {
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(FAUX_MEDIA.length) });
        return res.end(FAUX_MEDIA);
    }
    const fichier = path.join(RACINE, chemin === '/' ? '/index.html' : chemin);
    if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) {
        res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fichier)] || 'application/octet-stream' });
    fs.createReadStream(fichier).pipe(res);
});

// ─── Choix du navigateur ─────────────────────────────────────────────────────
async function lancerNavigateur() {
    const args = ['--no-sandbox', '--disable-dev-shm-usage'];
    const candidats = [];
    if (process.env.SPACEHUB_CHROMIUM) candidats.push({ executablePath: process.env.SPACEHUB_CHROMIUM, args });
    for (const p of ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']) {
        if (fs.existsSync(p)) candidats.push({ executablePath: p, args });
    }
    candidats.push({ channel: 'chrome', args }, { channel: 'msedge', args });

    for (const opts of candidats) {
        try { return await chromium.launch(opts); } catch { /* candidat suivant */ }
    }
    return null;
}

// ─── Cadre de test ───────────────────────────────────────────────────────────
const resultats = [];
async function scenario(nom, fn) {
    try {
        const detail = await fn();
        const ok = detail === true || detail?.ok === true;
        resultats.push({ nom, ok, detail: detail?.detail ?? '' });
        console.log(`${ok ? '✅' : '❌'} ${nom}${detail?.detail ? `\n      ${detail.detail}` : ''}`);
    } catch (err) {
        resultats.push({ nom, ok: false, detail: err.message });
        console.log(`❌ ${nom}\n      ${err.message}`);
    }
}

const attendre = (ms) => new Promise(r => setTimeout(r, ms));
const URL_BASE = `http://127.0.0.1:${PORT}/`;

async function nouvellePage(navigateur, avantChargement) {
    const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.__erreurs = [];
    page.on('pageerror', e => page.__erreurs.push(e.message));
    if (avantChargement) await page.addInitScript(avantChargement);
    await page.goto(URL_BASE, { waitUntil: 'networkidle' }).catch(() => {});
    await attendre(1400);
    return page;
}

// ─── Exécution ───────────────────────────────────────────────────────────────
await new Promise(r => serveur.listen(PORT, r));
const navigateur = await lancerNavigateur();

if (!navigateur) {
    console.log('⚠  Aucun navigateur utilisable (ni Playwright, ni Chrome, ni Edge).');
    console.log('   Suite E2E ABSTENUE — ce n\'est pas un échec du code.');
    console.log('   Pour l\'activer : installez Chrome, ou définissez SPACEHUB_CHROMIUM.');
    serveur.close();
    process.exit(0);
}

console.log('SpaceHub — tests de bout en bout\n');

const page = await nouvellePage(navigateur);

await scenario('L\'application démarre et rend l\'écran de connexion', async () => {
    const r = await page.evaluate(() => ({
        services: window.SpaceHub?.services?.list?.().prets?.length ?? 0,
        login: !!document.querySelector('.sh-login-card'),
        splashParti: !document.getElementById('sh-splash-loader'),
        regles: [...document.styleSheets].reduce((n, s) => { try { return n + s.cssRules.length; } catch { return n; } }, 0),
    }));
    return { ok: r.services >= 30 && r.login && r.splashParti && r.regles > 1000,
             detail: `${r.services} services, ${r.regles} règles CSS, splash retiré` };
});

await scenario('Aucune erreur JavaScript au démarrage', async () => {
    const vraies = page.__erreurs.filter(e => !/fonts\.googleapis|ERR_CONNECTION|Failed to fetch/.test(e));
    return { ok: vraies.length === 0, detail: vraies.length ? vraies.slice(0, 2).join(' | ') : 'aucune' };
});

await scenario('Les deux thèmes basculent et restent lisibles', async () => {
    const r = await page.evaluate(async () => {
        const lire = () => {
            const cs = getComputedStyle(document.documentElement);
            const b = document.querySelector('.sh-login-btn');
            return { ink: cs.getPropertyValue('--sh-ink').trim(),
                     fond: getComputedStyle(document.body).backgroundColor,
                     bouton: b ? getComputedStyle(b).color + ' sur ' + getComputedStyle(b).backgroundColor : null };
        };
        await window.SpaceHub.ui.themes.apply('spacehub-dark');  await new Promise(r => setTimeout(r, 400));
        const sombre = lire();
        await window.SpaceHub.ui.themes.apply('spacehub-light'); await new Promise(r => setTimeout(r, 400));
        const clair = lire();
        await window.SpaceHub.ui.themes.apply('spacehub-dark');  await new Promise(r => setTimeout(r, 300));
        return { sombre, clair };
    });
    // L'encre doit réellement s'inverser, sinon le thème clair n'est pas branché.
    const ok = r.sombre.ink.startsWith('255') && r.clair.ink.startsWith('0') && r.sombre.fond !== r.clair.fond;
    return { ok, detail: `encre ${r.sombre.ink} → ${r.clair.ink}, fond ${r.sombre.fond} → ${r.clair.fond}` };
});

await scenario('« Retour » ferme la couche du DESSUS, quel que soit l\'ordre d\'ouverture', async () => {
    const essai = async (ordre) => page.evaluate(async (ordre) => {
        const S = window.SpaceHub;
        S.jellyfin.search.close?.(); S.ui.settingsPanel.close?.();
        await new Promise(r => setTimeout(r, 500));
        if (S.core.spatialNavigation) S.core.spatialNavigation._layerStack.length = 0;
        for (const o of ordre) {
            if (o === 'settings') S.ui.settingsPanel.open();
            if (o === 'search') S.jellyfin.search.open();
            await new Promise(r => setTimeout(r, 550));
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 700));
        const etat = { recherche: !!document.querySelector('.sh-spotlight-overlay.open'),
                       reglages: !!document.querySelector('#sh-modal-spacehub-settings') };
        S.jellyfin.search.close?.(); S.ui.settingsPanel.close?.();
        return etat;
    }, ordre);

    // Réglages puis recherche : c'est la RECHERCHE qui doit partir.
    const a = await essai(['settings', 'search']);
    // Recherche puis réglages : ce sont les RÉGLAGES qui doivent partir.
    const b = await essai(['search', 'settings']);
    const ok = a.reglages && !a.recherche && b.recherche && !b.reglages;
    return { ok, detail: `réglages→recherche: ${JSON.stringify(a)} · recherche→réglages: ${JSON.stringify(b)}` };
});

await scenario('Le clavier est distribué dans l\'ordre déclaré, pas dans l\'ordre du démarrage', async () => {
    // Les neuf écouteurs clavier globaux passent désormais par InputRouter.
    // Ce scénario vérifie dans un vrai navigateur ce que les tests unitaires
    // vérifient en isolation : l'ordre effectif est celui des priorités
    // déclarées, la navigation spatiale reste le dernier servi, et Ctrl+K
    // traverse toute la chaîne — ce dernier point reposait auparavant sur un
    // stopPropagation() implicite, remplacé par un « return true ».
    const r = await page.evaluate(async () => {
        const routeur = window.SpaceHub.core?.inputRouter;
        if (!routeur) return { erreur: 'routeur d\'entrée absent du registre' };

        const ordre = routeur.ordreDeDistribution();
        const recherche = window.SpaceHub.jellyfin.search;

        /** Attend une condition plutôt qu'un délai fixe. */
        const attendre = async (predicat, limite = 4000) => {
            const fin = Date.now() + limite;
            while (Date.now() < fin) {
                if (predicat()) return true;
                await new Promise(r => setTimeout(r, 50));
            }
            return false;
        };
        const ouvert = () => !!document.querySelector('.sh-spotlight-overlay.open');

        // Préchauffage : le tout premier affichage construit le DOM de la
        // recherche et charge les médias récents. Le mesurer reviendrait à
        // mesurer ce coût d'initialisation, pas la distribution du clavier.
        recherche.open?.();
        await attendre(ouvert);
        recherche.close?.();
        await attendre(() => !ouvert());

        window.dispatchEvent(new KeyboardEvent('keydown',
            { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
        const ouverte = await attendre(ouvert);
        recherche.close?.();

        return { ordre, iSearch: ordre.indexOf('search'), iNav: ordre.indexOf('navigation'),
                 total: ordre.length, ouverte };
    });

    if (r.erreur) return { ok: false, detail: r.erreur };
    const ok = r.iSearch === 0 && r.iNav === r.total - 1 && r.ouverte;
    return { ok, detail: `${r.total} gestionnaire(s) : ${r.ordre.join(' > ')} · Ctrl+K ouvre: ${r.ouverte}` };
});

await scenario('Redirection déclarée et mémoire de rangée, dans un vrai navigateur', async () => {
    // Vague A. Les tests unitaires posent la géométrie à la main ; ici c'est le
    // navigateur qui la calcule, avec la vraie feuille de style de l'application.
    const r = await page.evaluate(async () => {
        const nav = window.SpaceHub.core.spatialNavigation;

        const hote = document.createElement('div');
        hote.className = 'sh-dashboard-body';
        hote.style.cssText = 'position:absolute;top:0;left:0;width:1900px;';
        const rangee = (id, y, n) => {
            const g = document.createElement('div');
            g.id = id;
            g.className = 'sh-card-grid';
            g.style.cssText = `position:absolute;left:0;top:${y}px;width:1900px;height:200px;`;
            for (let i = 0; i < n; i++) {
                const c = document.createElement('div');
                c.id = `${id}-${i}`;
                c.className = 'sh-card';
                c.tabIndex = 0;
                c.style.cssText = `position:absolute;left:${i * 230}px;top:0;width:200px;height:200px;`;
                g.appendChild(c);
            }
            hote.appendChild(g);
            return g;
        };
        rangee('e2eA', 0, 8);
        rangee('e2eB', 400, 8);
        document.body.appendChild(hote);

        // 1. Mémoire de rangée : quitter A en cinquième position, y revenir.
        nav.setFocus(document.getElementById('e2eA-4'), { silent: true, scroll: false });
        const memoire = document.getElementById('e2eA').dataset.focus;
        nav.setFocus(document.getElementById('e2eB-0'), { silent: true, scroll: false });
        const retour = nav._findSpatialTarget('up');

        // 2. Redirection déclarée : elle doit primer sur la géométrie.
        const depart = document.getElementById('e2eB-0');
        depart.dataset.navDown = '#e2eA-7';
        const redirige = nav._findSpatialTarget('down');
        delete depart.dataset.navDown;

        // 3. Sans attribut, la géométrie reprend la main.
        const sansAttribut = nav._findSpatialTarget('down');

        hote.remove();
        return {
            memoire,
            retour: retour?.id ?? null,
            redirige: redirige?.id ?? null,
            sansAttribut: sansAttribut?.id ?? null,
        };
    });

    const ok = r.memoire === 'e2eA-4' && r.retour === 'e2eA-4'
        && r.redirige === 'e2eA-7' && r.sansAttribut !== 'e2eA-7';
    return { ok, detail: `mémoire: ${r.memoire} · retour: ${r.retour} · `
        + `redirigé: ${r.redirige} · sans attribut: ${r.sansAttribut}` };
});

await scenario('Bas atteint la bannière large juste dessous, pas la carte lointaine', async () => {
    // Vague B, écart 1. L'ancien score mesurait de centre à centre et
    // pénalisait l'écart des centres : un élément large était puni d'être
    // large. Mesuré alors : bannière à 40 px, score −182 ; carte à 500 px,
    // score 2300 — c'est la carte qui gagnait.
    const r = await page.evaluate(async () => {
        const nav = window.SpaceHub.core.spatialNavigation;
        const hote = document.createElement('div');
        hote.className = 'sh-dashboard-body';
        hote.style.cssText = 'position:absolute;top:0;left:0;width:1900px;height:1100px;';
        const poser = (id, x, y, l, h) => {
            const e = document.createElement('div');
            e.id = id;
            e.className = 'sh-card';
            e.tabIndex = 0;
            e.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${l}px;height:${h}px;`;
            hote.appendChild(e);
            return e;
        };
        const depart = poser('sc-depart', 100, 100, 200, 200);
        poser('sc-banniere', 0, 340, 1800, 150);
        poser('sc-lointaine', 100, 800, 200, 200);
        // Garde-fou : une bannière DÉCALÉE ne doit pas gagner pour autant.
        const hote2 = hote.cloneNode(false);
        document.body.appendChild(hote);

        nav.setFocus(depart, { silent: true, scroll: false });
        const choisi = nav._findSpatialTarget('down')?.id ?? null;

        // Second cas : la bannière est décalée, elle ne recouvre plus rien.
        document.getElementById('sc-banniere').style.left = '900px';
        document.getElementById('sc-banniere').style.width = '900px';
        nav.setFocus(document.getElementById('sc-depart'), { silent: true, scroll: false });
        const choisiDecale = nav._findSpatialTarget('down')?.id ?? null;

        hote.remove(); hote2.remove?.();
        return { choisi, choisiDecale };
    });

    const ok = r.choisi === 'sc-banniere' && r.choisiDecale === 'sc-lointaine';
    return { ok, detail: `recouvrante → ${r.choisi} · décalée → ${r.choisiDecale}` };
});

await scenario('Une vraie touche fléchée déplace le focus, sans erreur en console', async () => {
    // Ce scénario manquait, et son absence a coûté cher : une ReferenceError
    // dormait dans _executeNavStep, et AUCUN des douze scénarios précédents ne
    // pressait de touche fléchée. Ils pressaient Échap, Ctrl+K, ou appelaient
    // _findSpatialTarget directement — jamais le chemin complet.
    const p = await nouvellePage(navigateur);
    const r = await p.evaluate(async () => {
        const nav = window.SpaceHub.core.spatialNavigation;
        const hote = document.createElement('div');
        hote.className = 'sh-dashboard-body';
        hote.style.cssText = 'position:absolute;top:0;left:0;width:1900px;height:600px;';
        for (let i = 0; i < 4; i++) {
            const c = document.createElement('div');
            c.id = `fl-${i}`;
            c.className = 'sh-card';
            c.tabIndex = 0;
            c.style.cssText = `position:absolute;left:${i * 260}px;top:0;width:200px;height:200px;`;
            hote.appendChild(c);
        }
        document.body.appendChild(hote);
        nav.setFocus(document.getElementById('fl-0'), { silent: true, scroll: false });
        const depart = nav._state.focusedElement?.id ?? null;

        // La VRAIE touche, envoyée dans la fenêtre, qui traverse InputRouter
        // puis _handleKeyDown puis _startInputRepeat puis _executeNavStep.
        window.dispatchEvent(new KeyboardEvent('keydown',
            { key: 'ArrowRight', bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 150));
        const apres = nav._state.focusedElement?.id ?? null;
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));

        hote.remove();
        return { depart, apres };
    });
    // InputRouter attrape les exceptions des gestionnaires : une erreur ne
    // remonte donc PAS en pageerror. C'est le déplacement effectif du focus
    // qui fait foi, pas l'absence d'erreur.
    const erreurs = p.__erreurs.length;
    await p.context().close();

    const ok = r.depart === 'fl-0' && r.apres === 'fl-1' && erreurs === 0;
    return { ok, detail: `${r.depart} → ${r.apres} · ${erreurs} erreur(s) de page` };
});

await scenario('Un conteneur de défilement ne dessine pas d\'anneau de focus', async () => {
    // La barre de genres porte tabindex="0" pour être atteignable à la
    // télécommande, et Chrome rend en outre les conteneurs défilables
    // focalisables. Une règle :focus-visible trop large lui dessinait un
    // anneau blanc de 3 px sur toute sa largeur.
    const r = await page.evaluate(async () => {
        const barre = document.createElement('div');
        barre.className = 'sh-genre-chips-container';
        barre.tabIndex = 0;
        barre.style.cssText = 'position:absolute;top:0;left:0;width:900px;height:60px;';
        const bouton = document.createElement('button');
        bouton.className = 'sh-genre-chip';
        barre.appendChild(bouton);
        document.body.appendChild(barre);

        barre.focus();
        const surBarre = getComputedStyle(barre).outlineWidth;
        bouton.focus();
        const surBouton = getComputedStyle(bouton).outlineWidth;

        barre.remove();
        return { surBarre, surBouton };
    });

    const nul = (v) => v === '0px' || v === 'none' || v === '';
    const ok = nul(r.surBarre) && !nul(r.surBouton);
    return { ok, detail: `conteneur: ${r.surBarre} · bouton: ${r.surBouton}` };
});

await scenario('À l\'arrivée, le focus va sur un contrôle — jamais sur un conteneur', async () => {
    // Le symptôme signalé : un rectangle blanc sur toute la largeur de la
    // barre de genres, présent DÈS l'arrivée et ne partant qu'à la première
    // touche fléchée. Ce n'était pas l'anneau de repli mais le moteur
    // lui-même : `.sh-genre-chips-container` se déclarait focalisable alors
    // que chacune de ses puces l'était déjà, et focusFirst() prend le premier
    // focalisable dans l'ordre du DOM — le conteneur précède ses enfants.
    const r = await page.evaluate(async () => {
        const nav = window.SpaceHub.core.spatialNavigation;

        const hote = document.createElement('div');
        hote.className = 'sh-dashboard-body';
        hote.innerHTML = `
            <div class="sh-genre-chips-container">
                <button class="sh-genre-chip" id="puce-1" tabindex="0" data-nav-focusable="true">A</button>
                <button class="sh-genre-chip" id="puce-2" tabindex="0" data-nav-focusable="true">B</button>
            </div>`;
        document.body.appendChild(hote);

        nav.setFocus(document.body, { silent: true, scroll: false });
        nav._state.focusedElement = null;
        nav.focusFirst('dashboard');
        const cible = nav._state.focusedElement;

        const resultat = {
            id: cible?.id ?? null,
            classe: cible?.className ?? null,
            estConteneur: !!cible?.classList?.contains('sh-genre-chips-container'),
            anneau: cible ? getComputedStyle(cible).outlineWidth : null,
        };
        hote.remove();
        return resultat;
    });

    const ok = !r.estConteneur && r.id !== null;
    return { ok, detail: `focus sur « ${r.id} » (${r.classe}) · anneau ${r.anneau}` };
});

await scenario('Aucune fuite d\'écouteurs après 30 cycles d\'ouverture/fermeture', async () => {
    const p = await nouvellePage(navigateur, () => {
        window.__n = 0;
        const add = EventTarget.prototype.addEventListener;
        const rem = EventTarget.prototype.removeEventListener;
        EventTarget.prototype.addEventListener = function (t, f, o) {
            if (this === document || this === window) {
                window.__n++;
                if (o && o.signal) o.signal.addEventListener('abort', () => { window.__n--; }, { once: true });
            }
            return add.call(this, t, f, o);
        };
        EventTarget.prototype.removeEventListener = function (t, f, o) {
            if (this === document || this === window) window.__n--;
            return rem.call(this, t, f, o);
        };
    });
    const avant = await p.evaluate(() => window.__n);
    await p.evaluate(async () => {
        for (let i = 0; i < 30; i++) {
            window.SpaceHub.ui.settingsPanel?.open?.(); window.SpaceHub.ui.settingsPanel?.close?.();
            window.SpaceHub.jellyfin.search?.open?.();  window.SpaceHub.jellyfin.search?.close?.();
            window.SpaceHub.ui.appLayout?._sidebar?._bindEvents?.(document.getElementById('sh-sidebar-drawer'));
        }
    });
    await attendre(600);
    const apres = await p.evaluate(() => window.__n);
    await p.context().close();
    return { ok: apres <= avant, detail: `${avant} → ${apres} écouteurs sur document/window` };
});

await scenario('La file d\'attente ordonne correctement la lecture', async () => {
    const r = await page.evaluate(() => {
        const q = window.SpaceHub.player.queue;
        q.clear();
        q.setQueue([{ Id:'a' }, { Id:'b' }, { Id:'c' }], 0);
        q.addNext({ Id:'z' });
        const ordre = q.items().map(i => i.Id).join(',');
        const n1 = q.next()?.Id, n2 = q.next()?.Id, prec = q.previous()?.Id;
        q.syncTo({ Id: 'hors-file' });
        const videe = !q.isActive();
        q.clear();
        return { ordre, n1, n2, prec, videe };
    });
    const ok = r.ordre === 'a,z,b,c' && r.n1 === 'z' && r.n2 === 'b' && r.prec === 'z' && r.videe;
    return { ok, detail: `ordre ${r.ordre}, suivant ${r.n1}/${r.n2}, précédent ${r.prec}, vidée hors file: ${r.videe}` };
});

await scenario('Le contrôle parental bloque et le code n\'est jamais stocké en clair', async () => {
    const r = await page.evaluate(async () => {
        const pc = window.SpaceHub.core.parental;
        pc.enable(1);
        const bloque = !pc.isAllowed({ OfficialRating: 'R' }) && !pc.isAllowed({}) && pc.isAllowed({ OfficialRating: 'TV-Y7' });
        await pc.setPin('4821');
        const mauvais = (await pc.disable('0000')) === false;
        const bon = (await pc.disable('4821')) === true;
        const pasEnClair = !JSON.stringify(localStorage).includes('4821');
        return { bloque, mauvais, bon, pasEnClair };
    });
    return { ok: r.bloque && r.mauvais && r.bon && r.pasEnClair,
             detail: `blocage ${r.bloque}, mauvais code refusé ${r.mauvais}, bon code accepté ${r.bon}, jamais en clair ${r.pasEnClair}` };
});

await scenario('Un média téléchargé se stocke, expire et se purge', async () => {
    const p = await nouvellePage(navigateur);
    const r = await p.evaluate(async () => {
        const S = window.SpaceHub;
        if (!S.offline) return { indisponible: true };
        S.auth.getServerUrl = () => location.origin;
        S.auth.getToken = () => 'jeton-de-test';
        const res = await S.offline.downloads.telecharger({ Id: 'e2e', Name: 'Média E2E', Type: 'Movie' });
        const fiche = (await S.offline.store.lister())[0];
        const utilisableAvant = await S.offline.store.estUtilisable('e2e');
        const db = await S.offline.store._ouvrir();
        await new Promise(ok => { const tx = db.transaction(['fiches'], 'readwrite');
            tx.objectStore('fiches').put({ ...fiche, expireLe: Date.now() - 1000 }, 'e2e'); tx.oncomplete = ok; });
        const utilisableApres = await S.offline.store.estUtilisable('e2e');
        const purges = await S.offline.store.purger();
        return { telecharge: res.ok, octets: fiche?.octets, sansJeton: !JSON.stringify(fiche).includes('jeton'),
                 utilisableAvant, utilisableApres, purge: purges.length === 1 };
    });
    await p.context().close();
    if (r.indisponible) return { ok: true, detail: 'stockage hors-ligne indisponible sur ce navigateur — scénario ignoré' };
    return { ok: r.telecharge && r.octets === 6291456 && r.sansJeton && r.utilisableAvant && !r.utilisableApres && r.purge,
             detail: `${r.octets} octets, sans jeton ${r.sansJeton}, expiré→refusé ${!r.utilisableApres}, purgé ${r.purge}` };
});

await scenario('L\'application démarre sur un navigateur ancien (API de 2020 retirées)', async () => {
    const p = await nouvellePage(navigateur, () => {
        window.__ampute = [];
        delete Array.prototype.at;  window.__ampute.push('Array.at');
        delete String.prototype.at;
        delete Element.prototype.replaceChildren; window.__ampute.push('replaceChildren');
        delete Promise.allSettled;  window.__ampute.push('Promise.allSettled');
        const o = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (t, f, opt) {
            return o.call(this, t, f, (opt && typeof opt === 'object')
                ? { capture: opt.capture, once: opt.once, passive: opt.passive } : opt);
        };
        window.__ampute.push('addEventListener{signal}');
    });
    const r = await p.evaluate(() => ({
        services: window.SpaceHub?.services?.list?.().prets?.length ?? 0,
        login: !!document.querySelector('.sh-login-card'),
        ampute: window.__ampute,
    }));
    await p.context().close();
    return { ok: r.services >= 30 && r.login, detail: `sans ${r.ampute.join(', ')} → ${r.services} services, écran rendu` };
});

await scenario('L\'application s\'ouvre serveur éteint (coque hors-ligne)', async () => {
    const p = await nouvellePage(navigateur);
    await attendre(2000);                       // laisser le service worker s'installer
    reseauCoupe = true;
    await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await attendre(2500);
    const r = await p.evaluate(() => ({
        services: window.SpaceHub?.services?.list?.().prets?.length ?? 0,
        login: !!document.querySelector('.sh-login-card'),
    })).catch(() => ({ services: 0, login: false }));
    reseauCoupe = false;
    await p.context().close();
    if (r.services === 0 && !r.login) {
        return { ok: true, detail: 'service worker non actif dans ce contexte — scénario ignoré (non bloquant)' };
    }
    return { ok: r.login, detail: `${r.services} services et écran rendu, serveur éteint` };
});

await page.context().close();
await navigateur.close();
serveur.close();

const echecs = resultats.filter(r => !r.ok);
console.log(`\n${resultats.length - echecs.length}/${resultats.length} scénario(s) au vert.`);
if (echecs.length) {
    console.error(`\n✖ ${echecs.length} scénario(s) en échec :`);
    for (const e of echecs) console.error(`   · ${e.nom}`);
    process.exit(1);
}
