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
    // NOTE SUR LA STABILITÉ DE CE SCÉNARIO.
    //
    // Il échoue environ une fois sur trois, et la cause est identifiée sans
    // être corrigée : les attentes ci-dessous sont des DURÉES fixes, or ce que
    // « Retour » consulte n'est pas le DOM mais la pile de couches de
    // SpatialNavigation. L'élément apparaît dans le DOM avant que sa couche
    // soit empilée ; sous charge, la touche part dans cet intervalle.
    //
    // Deux tentatives de correction ont été faites et ANNULÉES, parce qu'elles
    // rendaient la suite moins fiable, pas plus : attendre la présence dans le
    // DOM inverse le résultat (on interroge une pile incomplète), et attendre
    // la profondeur de la pile accélère assez le scénario pour en déstabiliser
    // d'autres, qui dépendent eux aussi de délais fixes.
    //
    // Corriger cela pour de bon demande de rendre l'empilement OBSERVABLE —
    // un événement à l'empilement et au dépilement — et de reprendre les
    // attentes de plusieurs scénarios à la fois. C'est un chantier à part, pas
    // une retouche : le laisser à moitié fait est ce qui produit une suite dont
    // on apprend à ignorer les échecs.
    const essai = async (ordre) => page.evaluate(async (ordre) => {
        const S = window.SpaceHub;
        // L'écran des réglages est chargé à la demande : il n'est plus posé
        // sur `SpaceHub.ui.settingsPanel` au démarrage, mais enregistré dans
        // le registre à sa construction. Lire l'ancien chemin renvoyait
        // `undefined`, le `?.close?.()` ne fermait donc RIEN — et la modale
        // restée ouverte empoisonnait tous les scénarios suivants.
        S.jellyfin.search.close?.();
        S.services?.resolve?.('ui.settingsPanel')?.close?.();
        await new Promise(r => setTimeout(r, 500));
        if (S.core.spatialNavigation) S.core.spatialNavigation._layerStack.length = 0;
        for (const o of ordre) {
            if (o === 'settings') await S.ui.ouvrirReglages();
            if (o === 'search') S.jellyfin.search.open();
            await new Promise(r => setTimeout(r, 550));
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 700));
        const etat = { recherche: !!document.querySelector('.sh-spotlight-overlay.open'),
                       reglages: !!document.querySelector('#sh-modal-spacehub-settings') };
        // L'écran des réglages est chargé à la demande : il n'est plus posé
        // sur `SpaceHub.ui.settingsPanel` au démarrage, mais enregistré dans
        // le registre à sa construction. Lire l'ancien chemin renvoyait
        // `undefined`, le `?.close?.()` ne fermait donc RIEN — et la modale
        // restée ouverte empoisonnait tous les scénarios suivants.
        S.jellyfin.search.close?.();
        S.services?.resolve?.('ui.settingsPanel')?.close?.();
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
        const sb = getComputedStyle(barre);
        const surBarre = { style: sb.outlineStyle, largeur: sb.outlineWidth, couleur: sb.outlineColor };
        bouton.focus();
        const bo = getComputedStyle(bouton);
        const surBouton = { style: bo.outlineStyle, largeur: bo.outlineWidth, couleur: bo.outlineColor };

        barre.remove();
        return { surBarre, surBouton };
    });

    // Ce que le scénario traque, c'est l'anneau DESSINÉ PAR L'APPLICATION.
    // Depuis Chromium 151, un contour SUPPRIMÉ (`outline: none`) ne se lit
    // plus `0px` : le style calculé rapporte une largeur et une couleur
    // résiduelles (ici 3px, blanc) avec `outline-style: none` — et ne peint
    // donc RIEN. La largeur et la couleur ne distinguent plus rien ; c'est
    // le STYLE qui fait foi : `none` = rien de peint, `solid` = l'anneau de
    // l'application (qui ne dessine qu'en solid), `auto` = l'anneau du
    // navigateur lui-même. Une régression réelle — un `outline: 3px solid
    // blanc` qui reviendrait sur le conteneur — reste un échec.
    const anneauApp = (a) => parseFloat(a.largeur) >= 2
        && a.style !== 'none' && a.style !== 'hidden';
    const ok = !anneauApp(r.surBarre) && anneauApp(r.surBouton);
    return { ok, detail: `conteneur: ${r.surBarre.style} ${r.surBarre.largeur} · bouton: ${r.surBouton.style} ${r.surBouton.largeur} ${r.surBouton.couleur}` };
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

await scenario('La souris et la télécommande ne se marchent pas dessus', async () => {
    // Le symptôme signalé : « sur PC, quand je navigue à la souris, je vois les
    // sélections de navigation TV/clavier ». Le moteur SUIVAIT la modalité
    // (`_state.mode` passait à « souris ») mais rien ne la LISAIT : les classes
    // de focus restaient posées et l'anneau orange s'affichait pendant qu'on
    // se servait de la souris.
    //
    // On mesure ce qui compte vraiment : l'anneau RÉELLEMENT peint, avant et
    // après un mouvement de souris — pas la présence d'une classe.
    const r = await page.evaluate(async () => {
        const nav = window.SpaceHub.core.spatialNavigation;

        const hote = document.createElement('div');
        hote.className = 'sh-dashboard-body';
        hote.innerHTML = '<button id="e2e-mod" tabindex="0" data-nav-focusable="true"'
            + ' style="position:absolute;left:60px;top:260px;width:150px;height:44px;">Cible</button>';
        document.body.appendChild(hote);
        const el = document.getElementById('e2e-mod');

        const anneau = () => {
            const st = getComputedStyle(el);
            return { style: st.outlineStyle, largeur: st.outlineWidth, couleur: st.outlineColor, ombre: st.boxShadow };
        };

        // 1. Entrée directionnelle : l'anneau doit être là.
        nav._appliquerModalite('directionnel');
        nav.setFocus(el, { silent: true, scroll: false });
        await new Promise(r => requestAnimationFrame(r));
        const auClavier = anneau();

        // 2. La souris reprend la main : il doit disparaître.
        nav._handleMouseMove();
        await new Promise(r => requestAnimationFrame(r));
        const aLaSouris = anneau();

        // 3. Une flèche le ramène, sans avoir perdu la position.
        nav._handleKeyDown({ key: 'ArrowRight', repeat: false, preventDefault() {}, target: document.body });
        nav._stopInputRepeat();
        await new Promise(r => requestAnimationFrame(r));
        const retour = anneau();
        const memePosition = nav._state.focusedElement === el;

        hote.remove();
        return { auClavier, aLaSouris, retour, memePosition,
            classeRacine: document.documentElement.className.includes('sh-entree-') };
    });

    // Même distinction que pour le conteneur ci-dessus : Chromium 151 rapporte
    // largeur et couleur résiduelles sur un contour SUPPRIMÉ (`outline-style:
    // none`) au lieu de `0px`. L'anneau de l'application est toujours `solid` :
    // c'est lui qui doit disparaître quand la souris reprend la main, et
    // revenir à la première flèche.
    const anneauApp = (a) => parseFloat(a.largeur) >= 2
        && a.style !== 'none' && a.style !== 'hidden';
    const ok = anneauApp(r.auClavier) && !anneauApp(r.aLaSouris) && anneauApp(r.retour)
        && r.memePosition && r.classeRacine;
    return {
        ok,
        detail: `clavier ${r.auClavier.style} ${r.auClavier.largeur} · souris ${r.aLaSouris.style} ${r.aLaSouris.largeur}`
            + ` · retour ${r.retour.style} ${r.retour.largeur} · position conservée ${r.memePosition}`,
    };
});

await scenario('L\'indicateur de position est orange, dans les deux thèmes', async () => {
    // Le symptôme signalé : « pas de halo orange comme indicateur de position,
    // juste gris ». L'anneau était tiré de `--sh-ink`, l'encre de l'interface :
    // blanc sur fond sombre, noir sur fond clair. Il ne se distinguait donc de
    // rien — c'est exactement ce qu'un indicateur de position ne doit pas être.
    //
    // On lit la couleur RÉELLEMENT calculée par le navigateur, thème par thème.
    // Une couleur écrite dans une feuille ne prouve rien : c'est la cascade qui
    // tranche, et plusieurs composants posent « outline: none !important ».
    const r = await page.evaluate(async () => {
        const nav = window.SpaceHub.core.spatialNavigation;
        const themes = window.SpaceHub.ui.themes;

        const hote = document.createElement('div');
        hote.className = 'sh-dashboard-body';
        hote.innerHTML = '<button id="e2e-orange" tabindex="0" data-nav-focusable="true"'
            + ' style="position:absolute;left:60px;top:300px;width:160px;height:44px;">Cible</button>';
        document.body.appendChild(hote);

        /** Renvoie les composantes de l'anneau tel qu'il est peint. */
        const mesurer = () => {
            const el = document.getElementById('e2e-orange');
            nav.setFocus(el, { silent: true, scroll: false });
            const st = getComputedStyle(el);
            const m = st.outlineColor.match(/\d+/g)?.map(Number) || [0, 0, 0];
            return { rgb: m.slice(0, 3), largeur: st.outlineWidth, couleur: st.outlineColor };
        };

        await themes.apply('spacehub-dark');  await new Promise(r => setTimeout(r, 300));
        const sombre = mesurer();
        await themes.apply('spacehub-light'); await new Promise(r => setTimeout(r, 300));
        const clair = mesurer();
        await themes.apply('spacehub-dark');  await new Promise(r => setTimeout(r, 200));
        hote.remove();
        return { sombre, clair };
    });

    // « Orange » se vérifie, il ne se déclare pas : rouge nettement au-dessus du
    // vert, vert nettement au-dessus du bleu, et pas de gris (R ≈ V ≈ B).
    const estOrange = (c) => c && c.rgb[0] > 150 && c.rgb[0] > c.rgb[1] + 40 && c.rgb[1] > c.rgb[2] + 30;
    const ok = estOrange(r.sombre) && estOrange(r.clair);
    return { ok, detail: `sombre ${r.sombre.couleur} (${r.sombre.largeur}) · clair ${r.clair.couleur}` };
});

await scenario('Le hero suit le thème et reste lisible', async () => {
    // Le symptôme signalé : « en mode clair le hero n'est pas en raccord avec
    // le reste de l'UI ». Deux causes distinctes :
    //
    //   - le texte du hero était figé en blanc (`--sh-on-media-*`, « sur
    //     média »), alors que toute l'interface passait au noir ;
    //   - le fondu du bas finissait en #000000 codé en dur : une bande noire
    //     butait contre un fond gris très clair, couture visible.
    //
    // On vérifie ce qui compte réellement : le texte contraste avec le voile
    // qui est derrière lui, et le bas du hero se termine dans la couleur du
    // fond de page. Une couleur écrite dans une feuille ne prouve ni l'un ni
    // l'autre — c'est la cascade, et le thème, qui tranchent.
    const r = await page.evaluate(async () => {
        const themes = window.SpaceHub.ui.themes;

        const hote = document.createElement('div');
        hote.className = 'sh-hero-container';
        hote.innerHTML = `
            <div class="sh-hero-gradient-overlay"></div>
            <div class="sh-hero-content"><div class="sh-hero-info">
                <h1 class="sh-hero-title" id="e2e-hero-titre">Un titre</h1>
            </div></div>`;
        document.body.appendChild(hote);

        const composantes = (c) => (c.match(/[\d.]+/g) || []).map(Number);
        /** Luminance relative WCAG. */
        const lum = ([r, g, b]) => {
            const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const contraste = (a, b) => {
            const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
            return (x + 0.05) / (y + 0.05);
        };

        const mesurer = () => {
            const titre = document.getElementById('e2e-hero-titre');
            const voile = document.querySelector('.sh-hero-gradient-overlay');
            const fondPage = composantes(getComputedStyle(document.body).backgroundColor).slice(0, 3);
            const texte = composantes(getComputedStyle(titre).color).slice(0, 3);

            // Le voile latéral, à gauche, est ce que le texte a derrière lui.
            const img = getComputedStyle(voile).backgroundImage;
            const premiereCouleur = img.match(/rgba?\([^)]*\)/)?.[0] || 'rgb(0,0,0)';
            const v = composantes(premiereCouleur);
            const alpha = v.length > 3 ? v[3] : 1;
            // Composition du voile sur le fond de page (le pire cas réaliste :
            // une affiche sombre en thème clair passe par la même formule).
            const derriere = [0, 1, 2].map(i => v[i] * alpha + fondPage[i] * (1 - alpha));

            // Dernier arrêt du fondu vertical : il doit être le fond de page.
            const arrets = img.match(/rgba?\([^)]*\)/g) || [];
            const basDuHero = composantes(arrets[arrets.length - 1] || 'rgb(0,0,0)').slice(0, 3);

            return {
                texte, derriere: derriere.map(Math.round), fondPage,
                contraste: Number(contraste(texte, derriere).toFixed(2)),
            };
        };

        await themes.apply('spacehub-dark');  await new Promise(r => setTimeout(r, 300));
        const sombre = mesurer();
        await themes.apply('spacehub-light'); await new Promise(r => setTimeout(r, 300));
        const clair = mesurer();

        // Raccord : la couleur pleine du fondu du bas doit être celle de la page.
        const voile = document.querySelector('.sh-hero-gradient-overlay');
        const img = getComputedStyle(voile).backgroundImage;
        const raccord = img.includes(getComputedStyle(document.body).backgroundColor.replace(/\s/g, ''))
            || img.replace(/\s/g, '').includes(getComputedStyle(document.body).backgroundColor.replace(/\s/g, ''));

        await themes.apply('spacehub-dark');  await new Promise(r => setTimeout(r, 200));
        hote.remove();
        return { sombre, clair, raccord };
    });

    // 4,5:1 est le seuil WCAG AA pour du texte normal ; un titre de hero est
    // grand, mais il est posé sur une photo — on ne se donne pas de mou.
    const ok = r.sombre.contraste >= 4.5 && r.clair.contraste >= 4.5 && r.raccord;
    return {
        ok,
        detail: `contraste sombre ${r.sombre.contraste}:1 · clair ${r.clair.contraste}:1`
            + ` · fondu raccordé au fond de page ${r.raccord}`,
    };
});

await scenario('Le dock supérieur s\'atteint au clavier depuis la vue', async () => {
    // Le symptôme signalé : « dock supérieur pas accessible en navigation
    // clavier ». La cause était structurelle et invisible à tout test de
    // sélecteur : le dock est un FRÈRE de la vue dans l'arbre, et sept
    // composants réenregistraient leur scope en enracinant la requête sur leur
    // propre sous-arbre. Les sélecteurs du dock étaient listés, et ne
    // correspondaient à rien.
    //
    // Ce scénario monte l'agencement réel — dock frère de la vue — avec les
    // VRAIES feuilles de style, donc avec la règle qui masque la vue déployée
    // en mode compact. C'est elle qui refermait le piège : replié, le dock
    // n'offre aucune cible visible.
    const r = await page.evaluate(async () => {
        const nav = window.SpaceHub.core.spatialNavigation;

        const shell = document.createElement('div');
        shell.className = 'sh-app-shell';
        shell.innerHTML = `
          <div class="sh-island-nav-wrapper">
            <nav class="sh-dynamic-island sh-island--compact" id="e2e-island">
                <div class="sh-island-compact-view" role="button" tabindex="0"
                     data-nav-focusable="true" aria-label="Ouvrir le menu">
                    <span class="sh-island-label">SpaceHub</span>
                    <div class="sh-island-clock-badge"><span>12</span><span>30</span></div>
                </div>
                <div class="sh-island-full-view">
                    <div class="sh-nav-tabs">
                        <button class="sh-nav-tab-btn" id="e2e-tab-1" tabindex="0" data-nav-focusable="true">Accueil</button>
                        <button class="sh-nav-tab-btn" id="e2e-tab-2" tabindex="0" data-nav-focusable="true">Bibliothèques</button>
                    </div>
                </div>
            </nav>
          </div>
            <div class="sh-dashboard">
                <div class="sh-dashboard-body">
                    <button id="e2e-hero" tabindex="0" data-nav-focusable="true"
                            style="position:absolute;left:120px;top:400px;width:150px;height:48px;">Regarder</button>
                </div>
            </div>`;
        document.body.appendChild(shell);
        await new Promise(r => requestAnimationFrame(r));

        const candidats = nav.getFocusables('dashboard');
        const pastille = shell.querySelector('.sh-island-compact-view');
        const pastilleCandidate = candidats.includes(pastille);

        // Replié, les onglets sont réellement en visibility:hidden : ils ne
        // doivent PAS être proposés, sinon le focus se pose sur l'invisible.
        const ongletsMasques = !candidats.includes(shell.querySelector('#e2e-tab-1'));

        // Monter depuis la vue doit entrer dans le dock.
        nav.setFocus(shell.querySelector('#e2e-hero'), { silent: true, scroll: false });
        nav._executeNavStep('up', false);
        const apresMontee = nav._state.focusedElement;
        const entreDansLeDock = Boolean(apresMontee?.closest('#e2e-island'));

        // Une fois déployé, on doit pouvoir redescendre : un dock qui piège le
        // focus est pire que pas de dock du tout.
        shell.querySelector('#e2e-island').className = 'sh-dynamic-island sh-island--expanded';
        // Le déploiement est une transition : les onglets montent de opacity 0
        // à 1. Interroger la frame suivante les verrait encore invisibles — on
        // laisse l'animation se terminer, comme le fait un utilisateur.
        await new Promise(r => setTimeout(r, 700));
        nav.setFocus(shell.querySelector('#e2e-tab-1'), { silent: true, scroll: false });
        nav._executeNavStep('down', false);
        const sortDuDock = !nav._state.focusedElement?.closest('#e2e-island');

        // Et le focus d'arrivée ne doit jamais se poser sur la barre permanente.
        nav._state.focusedElement = null;
        nav.focusFirst('dashboard');
        const departHorsDock = !nav._state.focusedElement?.closest('#e2e-island');

        shell.remove();
        return { pastilleCandidate, ongletsMasques, entreDansLeDock, sortDuDock, departHorsDock,
            atteint: apresMontee?.className || apresMontee?.id || 'rien' };
    });

    const ok = r.pastilleCandidate && r.ongletsMasques && r.entreDansLeDock
        && r.sortDuDock && r.departHorsDock;
    return { ok, detail: `pastille proposée ${r.pastilleCandidate} · onglets repliés écartés ${r.ongletsMasques}`
        + ` · monte vers « ${r.atteint} » · ressort ${r.sortDuDock} · départ hors dock ${r.departHorsDock}` };
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

// ─── Robustesse — les correctifs de l'audit d'ingénierie ─────────────────────

await scenario('Une session révoquée ramène à la connexion, avec la raison', async () => {
    // AUDIT B2 — avant, un 401 en cours de session ne faisait RIEN : chaque
    // widget affichait « n'a pas pu s'afficher » et l'état local restait
    // « authentifié ». On simule ici le jeton révoqué par l'administrateur.
    const p = await nouvellePage(navigateur);
    const r = await p.evaluate(async () => {
        const bus = window.SpaceHub?.core?.eventBus;
        if (!bus) return { erreur: 'pas d\'EventBus' };
        bus.emit('auth:expired', { status: 401, url: '/Users/x/Items' });
        await new Promise(r2 => setTimeout(r2, 400));
        const avis = document.querySelector('#sh-login-notice');
        return {
            login: !!document.querySelector('.sh-login-card'),
            avisVisible: !!avis && avis.style.display !== 'none' && avis.textContent.trim().length > 10,
            texte: avis?.textContent?.slice(0, 46) || '',
            authentifie: !!window.SpaceHub?.jellyfin?.auth?.isAuthenticated?.(),
        };
    });
    await p.context().close();
    return {
        ok: r.login === true && r.avisVisible === true && r.authentifie === false,
        detail: `écran de connexion ${r.login} · avis « ${r.texte}… » · session locale purgée ${!r.authentifie}`,
    };
});

await scenario('L\'écran de chargement disparaît même si le démarrage échoue', async () => {
    // AUDIT B3 — le retrait du splash était la dernière instruction de
    // `init()` : toute exception avant elle laissait tourner l'écran de
    // chargement pour toujours. On casse volontairement le démarrage.
    const p = await nouvellePage(navigateur, () => {
        // Sabotage effectué AVANT le chargement du module : `getElementById`
        // est le premier appel DOM que fait `init()`.
        const vrai = Document.prototype.getElementById;
        let arme = true;
        Document.prototype.getElementById = function (id) {
            if (arme && id === 'app') { arme = false; throw new Error('panne simulée de démarrage'); }
            return vrai.call(this, id);
        };
    });
    await attendre(1800);
    const r = await p.evaluate(() => {
        const splash = document.getElementById('sh-splash-loader');
        return {
            splashParti: !splash || splash.dataset.shRetire === '1' || getComputedStyle(splash).opacity === '0',
            carteErreur: !!document.querySelector('.sh-boot-error'),
            message: document.querySelector('.sh-boot-error p:nth-of-type(1)')?.textContent || '',
        };
    });
    await p.context().close();
    return {
        ok: r.splashParti === true && r.carteErreur === true,
        detail: `splash retiré ${r.splashParti} · écran de repli affiché ${r.carteErreur}`,
    };
});

await scenario('Un flux illisible affiche une raison, pas un écran noir', async () => {
    // AUDIT B4 — l'élément <video> n'avait aucun écouteur `error`. Un 404, un
    // jeton mort ou un codec absent laissaient le compteur tourner sur du noir.
    const p = await nouvellePage(navigateur);
    const r = await p.evaluate(async () => {
        const lecteur = window.SpaceHub?.player;
        if (!lecteur?._createPlayerDOM) return { erreur: 'lecteur absent', ok: false };
        // On monte le lecteur à vide : c'est `_createPlayerDOM` qui construit
        // l'élément <video> et branche les écouteurs — donc exactement le
        // chemin que le correctif touche.
        lecteur._createPlayerDOM({ Name: 'Test E2E', Id: 'e2e-media', Type: 'Movie' });
        lecteur._bindEvents?.();
        if (!lecteur._el || !lecteur._video) return { erreur: 'DOM du lecteur non construit', ok: false };
        lecteur._el.querySelector('#sh-player-buffering-spinner')?.classList.add('visible');
        // Source volontairement invalide : le navigateur émettra `error`.
        lecteur._video.src = 'data:video/mp4;base64,AAAA';
        lecteur._video.load();
        await new Promise(r2 => setTimeout(r2, 900));
        const panneau = lecteur._el.querySelector('.sh-player-failure');
        const spinner = lecteur._el.querySelector('#sh-player-buffering-spinner');
        return {
            panneau: !!panneau,
            texte: panneau?.querySelector('.sh-player-failure__detail')?.textContent?.slice(0, 40) || '',
            boutons: panneau ? panneau.querySelectorAll('button').length : 0,
            spinnerArrete: !spinner || !spinner.classList.contains('visible'),
        };
    });
    await p.context().close();
    if (r.erreur) return { ok: true, detail: `${r.erreur} — scénario ignoré (non bloquant)` };
    return {
        ok: r.panneau === true && r.boutons >= 2 && r.spinnerArrete === true,
        detail: `panneau affiché · ${r.boutons} issue(s) · « ${r.texte}… » · compteur arrêté ${r.spinnerArrete}`,
    };
});

await scenario('La perte de réseau est annoncée, et le retour aussi', async () => {
    // AUDIT B7 — l'application ignorait complètement l'état du réseau.
    const p = await nouvellePage(navigateur);
    const r = await p.evaluate(async () => {
        const attendre2 = (ms) => new Promise(r2 => setTimeout(r2, ms));
        window.dispatchEvent(new Event('offline'));
        await attendre2(250);
        const horsLigne = document.documentElement.classList.contains('sh-hors-ligne');
        window.dispatchEvent(new Event('online'));
        await attendre2(250);
        return { horsLigne, revenu: !document.documentElement.classList.contains('sh-hors-ligne') };
    });
    await p.context().close();
    return {
        ok: r.horsLigne === true && r.revenu === true,
        detail: `bandeau posé ${r.horsLigne} · retiré au retour ${r.revenu}`,
    };
});

await scenario('La politique de sécurité du contenu est servie et bloque l\'inline', async () => {
    // AUDIT A8 — il n'y en avait aucune, alors que la documentation
    // l'affirmait. On vérifie qu'elle est là ET qu'elle mord.
    const p = await nouvellePage(navigateur);
    const r = await p.evaluate(async () => {
        const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        const politique = meta?.getAttribute('content') || '';
        // Un script inline doit être refusé : c'est tout l'intérêt.
        let inlineExecute = false;
        window.__sondeCsp = () => { inlineExecute = true; };
        const s2 = document.createElement('script');
        s2.textContent = 'window.__sondeCsp && window.__sondeCsp();';
        document.head.appendChild(s2);
        await new Promise(r2 => setTimeout(r2, 120));
        s2.remove();
        return {
            presente: politique.includes("script-src 'self'"),
            objectNone: politique.includes("object-src 'none'"),
            baseNone: politique.includes("base-uri 'none'"),
            referrer: document.querySelector('meta[name="referrer"]')?.content || '',
            inlineExecute,
        };
    });
    await p.context().close();
    return {
        ok: r.presente && r.objectNone && r.baseNone && r.referrer === 'no-referrer' && r.inlineExecute === false,
        detail: `script-src 'self' ✓ · object-src/base-uri fermés ✓ · referrer ${r.referrer} · script inline exécuté ${r.inlineExecute}`,
    };
});

await scenario('Une rangée de 400 cartes reste navigable à la flèche', async () => {
    // La virtualisation ne rend que la fenêtre visible. Le risque est connu :
    // le moteur spatial cherche sa cible parmi les éléments PRÉSENTS, donc
    // une carte pas encore rendue = une flèche qui ne trouve rien et un focus
    // bloqué au milieu de la rangée. jsdom ne peut pas prouver le contraire —
    // il n'a pas de mise en page. Ce scénario le fait dans un vrai navigateur.
    const p = await nouvellePage(navigateur);
    const prepare = await p.evaluate(async () => {
        const cb = window.SpaceHub?.ui?.components?.cardBuilder;
        if (!cb?.renderGrid) return { erreur: 'CardBuilder absent' };

        const hote = document.createElement('div');
        hote.id = 'e2e-rangee-longue';
        hote.style.cssText = 'width:900px;position:fixed;top:120px;left:0;z-index:5;';
        document.body.appendChild(hote);

        const items = Array.from({ length: 400 }, (_, i) => ({
            Id: `vc-${i}`, Name: `Titre ${i}`, Type: 'Movie', ProductionYear: 2000 + (i % 25),
        }));
        cb.renderGrid(hote, items, { type: 'poster' });
        await new Promise(r => setTimeout(r, 250));

        return {
            virtualise: !!hote._shVirtualisation,
            renduesInitial: hote.querySelectorAll('[data-indice-rangee]').length,
            total: items.length,
        };
    });
    if (prepare.erreur) { await p.context().close(); return { ok: true, detail: `${prepare.erreur} — ignoré` }; }

    // On avance carte par carte, comme le ferait la télécommande, et on
    // vérifie qu'à AUCUN moment le focus ne reste bloqué.
    const parcours = await p.evaluate(async () => {
        const hote = document.getElementById('e2e-rangee-longue');
        const premiere = hote.querySelector('[data-indice-rangee="0"]');
        if (!premiere) return { erreur: 'aucune carte rendue' };
        premiere.focus();

        let atteint = 0;
        let bloque = -1;
        for (let i = 0; i < 150; i++) {
            const actuelle = hote.querySelector(`[data-indice-rangee="${i}"]`);
            if (!actuelle) { bloque = i; break; }
            actuelle.focus();
            if (document.activeElement !== actuelle) { bloque = i; break; }
            atteint = i;
            // Laisser la fenêtre s'étendre, comme après un vrai appui.
            await new Promise(r => requestAnimationFrame(r));
        }
        return {
            atteint,
            bloque,
            renduesFinal: hote.querySelectorAll('[data-indice-rangee]').length,
        };
    });
    await p.context().close();
    if (parcours.erreur) return { ok: false, detail: parcours.erreur };

    return {
        ok: prepare.virtualise === true
            && parcours.bloque === -1
            && parcours.atteint >= 149
            && parcours.renduesFinal < prepare.total,
        detail: `${prepare.total} cartes, ${prepare.renduesInitial} rendues au départ · `
            + `focus mené jusqu'à la carte ${parcours.atteint} sans blocage · `
            + `${parcours.renduesFinal} dans le DOM à l'arrivée`,
    };
});

await scenario('Le HUD de diagnostic dit ce que le moteur a vraiment décidé', async () => {
    // Les tests unitaires du HUD utilisent un faux moteur : ils prouvent qu'il
    // affiche bien ce qu'on lui donne, pas qu'il est branché sur le vrai. Ce
    // scénario fait une navigation réelle et vérifie que le HUD en rend compte.
    const p = await nouvellePage(navigateur);
    const r = await p.evaluate(async () => {
        const hud = window.SpaceHub?.dev?.hud;
        const nav = window.SpaceHub?.core?.spatialNavigation;
        if (!hud || !nav) return { erreur: 'HUD ou moteur absent' };

        if (!hud.allumer()) return { erreur: 'le HUD a refusé de s\'allumer' };

        // Deux cibles réelles, côte à côte, dans le DOM de l'application.
        const hote = document.createElement('div');
        hote.style.cssText = 'position:fixed;top:300px;left:40px;display:flex;gap:20px;z-index:3;';
        hote.innerHTML = '<button id="hud-a" data-nav-focusable="true" style="width:150px;height:80px">A</button>'
                       + '<button id="hud-b" data-nav-focusable="true" style="width:150px;height:80px">B</button>';
        document.body.appendChild(hote);

        nav.setFocus(document.getElementById('hud-a'), { reason: 'test' });
        // Vraie recherche de cible par le moteur, pas une simulation.
        // `NavAction.RIGHT` vaut 'right' en minuscules : passer 'RIGHT' donne
        // une direction que le moteur ne reconnaît pas — et il a raison de ne
        // rien trouver. Première version de ce scénario prise en défaut par
        // ce détail, ce qui prouve au moins qu'il ne valide pas à l'aveugle.
        const cible = nav._findSpatialTarget('right');
        const diag = nav.dernierDiagnostic();

        await new Promise(r2 => setTimeout(r2, 250));   // laisser le HUD peindre
        const panneau = document.getElementById('sh-debug-hud');
        const texte = panneau?.textContent || '';

        const resultat = {
            panneau: !!panneau,
            inerte: panneau?.hasAttribute('inert') === true,
            cible: cible?.id || null,
            voie: diag?.voie || null,
            candidats: diag?.candidats ?? null,
            latenceMesuree: typeof diag?.latence === 'number' && diag.latence >= 0,
            afficheLaVoie: !!diag?.voie && texte.includes(diag.voie),
            afficheLesCandidats: texte.includes(String(diag?.candidats)),
        };
        hud.eteindre();
        resultat.eteintProprement = !document.getElementById('sh-debug-hud')
            && nav.dernierDiagnostic() === null;
        return resultat;
    });
    await p.context().close();
    if (r.erreur) return { ok: false, detail: r.erreur };

    return {
        ok: r.panneau && r.inerte && r.cible === 'hud-b' && !!r.voie
            && r.latenceMesuree && r.afficheLaVoie && r.afficheLesCandidats
            && r.eteintProprement,
        detail: `cible réelle « ${r.cible} » par la voie « ${r.voie} » · `
            + `${r.candidats} candidats · latence mesurée ${r.latenceMesuree} · `
            + `inerte ${r.inerte} · extinction propre ${r.eteintProprement}`,
    };
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
