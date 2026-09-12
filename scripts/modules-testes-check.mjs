#!/usr/bin/env node
/**
 * SpaceHub — Cliquet modules ↔ tests
 * ==================================
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * Le budget des monolithes (scripts/taille-monolithes-check.mjs) empêche un
 * fichier de grossir, avec une liste d'exceptions qui ne peut que DESCENDRE.
 * Rien, en revanche, n'empêchait un module nouveau d'arriver sans test : le
 * chantier GSM de septembre 2026 a produit `core/ProfilAppareil.js` et
 * `core/PontAndroid.js` — et leurs tests ont été écrits APRÈS, verts du premier
 * coup, ce qui ne prouve rien (un test qui n'a jamais échoué n'a jamais montré
 * qu'il pouvait échouer).
 *
 * Ce contrôle fait pour les tests ce que le budget fait pour les lignes :
 * il fige la situation, il refuse l'aggravation, et il signale chaque progrès
 * pour qu'on abaisse la liste dans le commit qui le prouve.
 *
 * CE QU'IL MESURE, ET CE QU'IL NE MESURE PAS
 * ------------------------------------------
 * Il mesure la couverture PAR NOM : un module est « nommé » si son nom de
 * fichier apparaît dans un test de `tests/` ou dans le harnais `scripts/e2e.mjs`.
 *
 * Ce n'est PAS la couverture par comportement, et la nuance compte : l'e2e
 * exerce 36 scénarios dans un vrai navigateur et traverse des modules qu'il ne
 * nomme jamais (le flux de recherche traverse `UnifiedSearch` sans écrire son
 * nom). Un module « non nommé » n'est donc pas « non testé » — il est hors du
 * filet unitaire, ce qui est déjà beaucoup.
 *
 * D'où la liste d'exceptions, avec sa raison : elle distingue ce que l'e2e
 * couvre réellement de ce qui n'est couvert par rien.
 */

import fs from 'node:fs';
import path from 'node:path';

const RACINE = process.cwd();
const RACINES_APP = ['ui', 'core', 'jellyfin', 'integrations', 'plugins'];
/**
 * Les harnais qui EXERCENT le comportement comptent comme des filets : l'e2e
 * joue 36 scénarios dans un vrai navigateur, le contrôle GSM croise la coquille
 * mobile, ceux de navigation et de focus pilotent le moteur.
 *
 * En sont exclus les contrôles qui NOMMENT des fichiers comme données — le
 * budget des monolithes liste chaque module avec son plafond, et les compter
 * reviendrait à déclarer « testé » tout ce qui est mesuré. Ce serait
 * exactement le vert qui ment que ce dépôt traque ailleurs.
 */
const FICHIERS_HARNAIS = [
    'scripts/e2e.mjs',
    'scripts/smoke-tests.mjs',
    'scripts/nav-behavior-check.mjs',
    'scripts/nav-contract-check.mjs',
    'scripts/focus-containers-check.mjs',
    'scripts/input-pipeline-check.mjs',
    'scripts/verifier-gsm.mjs',
];

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === 'dist') continue;
            walk(p, out);
        } else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

const modules = RACINES_APP
    .flatMap(r => walk(path.resolve(RACINE, r)))
    .map(f => path.relative(RACINE, f).replace(/\\/g, '/'))
    .sort();

/* Le texte où l'on cherche le NOM d'un module : les tests et les harnais. */
const fichiersTests = walk(path.resolve(RACINE, 'tests'));
const texteFilets = [
    ...fichiersTests.map(f => fs.readFileSync(f, 'utf8')),
    ...FICHIERS_HARNAIS.filter(f => fs.existsSync(path.resolve(RACINE, f)))
        .map(f => fs.readFileSync(path.resolve(RACINE, f), 'utf8')),
].join('\n');

const nomme = module => {
    const base = path.basename(module, '.js');
    if (base.length < 4) return true; // un nom trop court matcherait n'importe quoi
    return texteFilets.includes(base);
};

/**
 * Exceptions — modules qu'aucun test ne nomme, avec leur raison.
 * Trois familles :
 *   'e2e'         — traversé par les 36 scénarios sans y être nommé.
 *   'greffon'     — surface d'extension, exercée par le harnais de greffons.
 *   'a-couvrir'   — rien ne le couvre. C'est le seul seau qui doit se vider :
 *                   il mérite une peau de test unitaire à chaque passage.
 */
const EXCEPTIONS = new Map([
    ['core/CarouselController.js', 'a-couvrir'],
    ['core/ErrorBoundary.js', 'a-couvrir'],
    ['core/FeatureFlags.js', 'a-couvrir'],
    ['core/Logger.js', 'a-couvrir'],
    ['core/NotificationService.js', 'a-couvrir'],
    ['core/OfflineStore.js', 'a-couvrir'],
    ['core/PolicyService.js', 'a-couvrir'],
    ['core/ServiceRegistry.js', 'a-couvrir'],
    ['core/TvModeManager.js', 'a-couvrir'],
    ['integrations/bazarr/BazarrApi.js', 'greffon'],
    ['integrations/bazarr/BazarrWidgets.js', 'greffon'],
    ['integrations/jellyseerr/JellyseerrApi.js', 'greffon'],
    ['integrations/jellyseerr/JellyseerrService.js', 'greffon'],
    ['integrations/jellyseerr/JellyseerrWidgets.js', 'greffon'],
    ['integrations/prowlarr/ProwlarrApi.js', 'greffon'],
    ['integrations/prowlarr/ProwlarrWidgets.js', 'greffon'],
    ['integrations/qbittorrent/QBittorrentApi.js', 'greffon'],
    ['integrations/qbittorrent/QBittorrentService.js', 'greffon'],
    ['integrations/qbittorrent/QBittorrentWidgets.js', 'greffon'],
    ['integrations/radarr/RadarrApi.js', 'greffon'],
    ['integrations/radarr/RadarrService.js', 'greffon'],
    ['integrations/radarr/RadarrWidgets.js', 'greffon'],
    ['integrations/sonarr/SonarrApi.js', 'greffon'],
    ['integrations/sonarr/SonarrService.js', 'greffon'],
    ['integrations/sonarr/SonarrWidgets.js', 'greffon'],
    ['jellyfin/api/JellyfinAPI.js', 'a-couvrir'],
    ['jellyfin/api/JellyfinPluginService.js', 'a-couvrir'],
    ['jellyfin/calendar/UnifiedCalendarService.js', 'a-couvrir'],
    ['jellyfin/collections/SmartCollections.js', 'a-couvrir'],
    ['jellyfin/player/PlayQueue.js', 'a-couvrir'],
    ['jellyfin/player/PopoversContenu.js', 'a-couvrir'],
    ['jellyfin/remote/RemoteControlService.js', 'a-couvrir'],
    ['ui/components/AnalyticsModal.js', 'e2e'],
    ['ui/components/GooeyCarouselScroller.js', 'e2e'],
    ['ui/components/Toaster.js', 'e2e'],
    ['ui/components/chargerReglages.js', 'e2e'],
    ['ui/views/AdminDashboardView.js', 'e2e'],
    ['ui/views/DownloadsView.js', 'e2e'],
    ['ui/views/LoginView.js', 'e2e'],
    ['ui/views/chargerConsoleAdmin.js', 'e2e'],
    ['ui/widgets/AnimeWidget.js', 'a-couvrir'],
    ['ui/widgets/CollectionsWidget.js', 'a-couvrir'],
    ['ui/widgets/ContinueWatchingWidget.js', 'a-couvrir'],
    ['ui/widgets/DynamicLibraryWidget.js', 'a-couvrir'],
    ['ui/widgets/LatestAdditionsWidget.js', 'a-couvrir'],
    ['ui/widgets/LibrariesWidget.js', 'a-couvrir'],
    ['ui/widgets/MediaAnalyticsWidget.js', 'a-couvrir'],
    ['ui/widgets/MoviesWidget.js', 'a-couvrir'],
    ['ui/widgets/MusicWidget.js', 'a-couvrir'],
    ['ui/widgets/QuickActionsWidget.js', 'a-couvrir'],
    ['ui/widgets/TvShowsWidget.js', 'a-couvrir'],
    ['ui/widgets/UnifiedCalendarWidget.js', 'a-couvrir'],
]);

const mesure = modules.filter(m => !nomme(m));

if (process.argv.includes('--liste')) {
    /* Sortie prête à coller : le nom et une raison proposée d'après le chemin. */
    for (const m of mesure) {
        const raison = /^ui\/views\//.test(m) || /^ui\/components\//.test(m) || /^ui\/layouts\//.test(m)
            ? 'e2e'
            : /^plugins\//.test(m) || /^integrations\//.test(m)
                ? 'greffon'
                : 'a-couvrir';
        console.log(`    ['${m}', '${raison}'],`);
    }
    console.log(`\n// ${mesure.length} module(s) sans test nommant, sur ${modules.length}.`);
    process.exit(0);
}

const nouvelles = mesure.filter(m => !EXCEPTIONS.has(m));
const reglees = [...EXCEPTIONS.keys()].filter(m => !mesure.includes(m));

const problemes = [];
if (nouvelles.length) {
    problemes.push(
        `${nouvelles.length} module(s) sans test nommant, absent(s) de la liste :`
    );
    for (const m of nouvelles) {
        problemes.push(`    ${m} — écrivez un test qui le nomme, ou ajoutez-le à EXCEPTIONS avec sa raison.`);
        problemes[problemes.length - 1] = '  ' + problemes[problemes.length - 1].trim();
    }
}

if (problemes.length) {
    console.error(`\n✖ Cliquet modules ↔ tests : ${nouvelles.length} nouveau(x) module(s) hors filet.\n`);
    for (const p of problemes) console.error('  ' + p);
    console.error('\n  Un module qui arrive avec son test est un module dont on sait qu\'il');
    console.error('  fonctionne ; un module qui arrive sans est un module dont on l\'espère.\n');
    process.exit(1);
}

console.log(
    `Cliquet modules ↔ tests : ${modules.length} module(s), ` +
    `${modules.length - mesure.length} nommé(s) par un test, ${mesure.length} en exception.`
);
if (reglees.length) {
    console.log('\nDes exceptions ne servent plus — retirez-les dans ce commit :');
    for (const m of reglees) console.log('  ↘ ' + m);
}
