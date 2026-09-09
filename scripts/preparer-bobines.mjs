#!/usr/bin/env node
/**
 * SpaceHub — préparation des « bobines » d'emballage natif
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * L'application web (dist/) est un site statique autonome ; les paquets
 * natifs — APK Android et exécutable Windows — sont une coquille autour de
 * CE MÊME build, pas une réécriture. Cordova et electron-builder exigent
 * chacun une arborescence précise (www/, config.xml, icônes en PNG aux
 * tailles officielles, resources/icon.ico…). Recopier tout cela à la main
 * garantit des dérives ; ce script le reconstruit intégralement depuis
 * dist/ et public/icone.svg, de façon déterministe et rejouable en CI
 * comme sur une machine de développement.
 *
 * CE QU'IL PRODUIT (après `npm run build`) :
 *   build/cordova/     projet Cordova complet prêt pour `cordova build android`
 *     ├─ package.json   marqueur de projet Cordova (généré)
 *     ├─ config.xml    identité, WebView engine, écrans Android TV
 *     ├─ www/          build embarqué (base: './') — voir DÉTAIL CRUCIAL
 *     └─ res/icon/…    toutes les densités Android + bannière TV
 *   build/electron/    projet electron-builder prêt pour `npx electron-builder`
 *     ├─ main.js       processus principal (fenêtre, chargement du www)
 *     ├─ package.json  champ « build » (cibles NSIS + portable)
 *     └─ www/          build embarqué (base: './')
 *
 * DÉTAIL CRUCIAL — le build embarqué est construit avec `base: './'`.
 * Le `npm run build` standard écrit des URL absolues (/assets/…) : correct
 * pour un site servi à la racine, cassé dans une WebView qui ouvre file://
 * (les préchargements de chunks partaient alors vers C:/assets/…). Ce
 * script RECONSTRUIT donc ici une variante embarquée via l'API de Vite,
 * avec la même configuration (plugins, découpage, cible chrome69) mais
 * des chemins relatifs — dist/ n'est pas touché et reste le build web.
 *
 * Usage : node scripts/preparer-bobines.mjs
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build as construireVite } from 'vite';

import { analyserSvg, ecrireIco, rendre, ecrirePng } from './icone-vers-png.mjs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = join(RACINE, 'public', 'icone.svg');
const CORDOVA = join(RACINE, 'build', 'cordova');
const ELECTRON = join(RACINE, 'build', 'electron');
const EMBARQUE = join(RACINE, 'build', 'dist-embarque');

const pkg = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'));
// SPACEHUB_PAQUET_VERSION : en CI, le nom de tag (v1.2.3 → 1.2.3) pour que
// les artefacts s'appellent comme la release ; sinon la version package.json.
// Un déclenchement manuel sans tag peut passer un nom de branche (« main ») :
// versionCode Android et electron-builder exigent du semver — on ignore alors
// la surcharge et on retombe sur la version du dépôt.
const brut = process.env.SPACEHUB_PAQUET_VERSION || '';
const candidat = brut.replace(/^v/, '');
const version = /^\d+\.\d+\.\d+$/.test(candidat) ? candidat : (pkg.version || '0.0.0');
if (brut && version !== candidat) {
    console.warn(`SPACEHUB_PAQUET_VERSION="${brut}" ignoré (semver attendu) — version du dépôt utilisée : ${version}`);
}
const svg = analyserSvg(SVG);

/* ── Build embarqué (base relative) ───────────────────────────────────── */

/**
 * Reconstruit l'application avec `base: './'` dans build/dist-embarque.
 * La configuration du projet (vite.config.js) s'applique intégralement —
 * mêmes plugins, même découpage, même cible chrome69 — seule l'origine des
 * URL change. dist/ n'est pas modifié : l'archive web et les paquets
 * embarquent le même code, pas le même mode d'adressage.
 */
async function construireEmbarque() {
    await construireVite({
        base: './',
        build: { outDir: EMBARQUE, emptyOutDir: true },
    });
}

/* ── Bobine Cordova (APK Android) ────────────────────────────────────────── */

function preparerCordova() {
    rmSync(CORDOVA, { recursive: true, force: true });
    mkdirSync(join(CORDOVA, 'res', 'icon', 'android'), { recursive: true });
    mkdirSync(join(CORDOVA, 'res', 'screen', 'android'), { recursive: true });
    cpSync(EMBARQUE, join(CORDOVA, 'www'), { recursive: true });

    // Icônes de lanceur — une par densité, générées depuis le SVG source.
    const densites = [
        ['ldpi', 36], ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96],
        ['xxhdpi', 144], ['xxxhdpi', 192],
    ];
    for (const [densite, taille] of densites) {
        ecrirePng(join(CORDOVA, 'res', 'icon', 'android', `ic_launcher_${densite}.png`), rendre(svg, taille), taille, taille);
    }
    // Bannière Android TV (320×180) et grand icône TV.
    ecrirePng(join(CORDOVA, 'res', 'screen', 'android', 'banniere-tv.png'), rendre(svg, 320, { banniere: true }), 320, 180);
    ecrirePng(join(CORDOVA, 'res', 'icon', 'android', 'ic_launcher_tv.png'), rendre(svg, 320), 320, 320);

    // Densités génériques attendues par certains greffons Cordova.
    ecrirePng(join(CORDOVA, 'res', 'icon.png'), rendre(svg, 512), 512, 512);

    // versionCode numérique dérivé du semver : 1.2.3 → 10203. Faire passer
    // les mises à jour par Android exige un code strictement croissant ;
    // cette formule croît avec la version et reste lisible.
    const [vmaj, vmin, vpatch] = version.split('.').map((n) => parseInt(n, 10) || 0);
    const versionCode = vmaj * 10000 + vmin * 100 + vpatch;

    writeFileSync(join(CORDOVA, 'package.json'), JSON.stringify({
        name: 'spacehub-android',
        version,
        private: true,
        description: 'Bobine de packaging Android — générée, ne pas éditer',
    }, null, 4) + '\n');

    writeFileSync(join(CORDOVA, 'config.xml'), `<?xml version='1.0' encoding='utf-8'?>
<widget id="io.spacehub.app" version="${version}" android-versionCode="${versionCode}" xmlns="http://www.w3.org/ns/widgets"
        xmlns:android="http://schemas.android.com/apk/res/android">
    <name>SpaceHub</name>
    <description>
        Client web unifie pour Jellyfin et la suite Servarr, emballe pour Android.
    </description>
    <author email="spacehub@example.org" href="https://github.com/nicoo-o/SpaceHub">
        SpaceHub Team
    </author>

    <content src="index.html" />
    <!-- L'application EST un site statique embarque : autoriser la navigation
         locale sans filtrage, sinon la WebView bloque ses propres fichiers. -->
    <allow-navigation href="*" />
    <allow-intent href="http://*/*" />
    <allow-intent href="https://*/*" />

    <preference name="BackgroundColor" value="0xff101014" />
    <preference name="fullscreen" value="false" />
    <preference name="AndroidWindowSplashScreenAnimatedIcon" value="res/icon/android/ic_launcher_xxxhdpi.png" />
    <!-- Format #RRGGBB OBLIGATOIRE ici : cette préférence est injectée
         telle quelle dans les ressources Android (values.xml) par le
         template gradle — le format 0xARGB de BackgroundColor y est
         refusé (« expected color but got (raw string) 0xff101014 »,
         premier run v1.1.0). -->
    <preference name="AndroidWindowSplashScreenBackground" value="#101014" />

    <platform name="android">
        <!-- Icônes : sans déclaration <icon>, cordova-android embarque son
             robot par défaut — le paquet serait livré SANS l'icône
             SpaceHub. Une par densité + une par défaut. -->
        <icon src="res/icon.png" />
        <icon src="res/icon/android/ic_launcher_ldpi.png" density="ldpi" />
        <icon src="res/icon/android/ic_launcher_mdpi.png" density="mdpi" />
        <icon src="res/icon/android/ic_launcher_hdpi.png" density="hdpi" />
        <icon src="res/icon/android/ic_launcher_xhdpi.png" density="xhdpi" />
        <icon src="res/icon/android/ic_launcher_xxhdpi.png" density="xxhdpi" />
        <icon src="res/icon/android/ic_launcher_xxxhdpi.png" density="xxxhdpi" />
        <!-- Android TV : sans uses-feature leanback (non requis, donc aussi
             installable sur téléphone) l'app s'installe mais n'apparaît pas
             dans le lanceur TV ; sans bannière, elle s'y affiche sans image.
             La fusion cible l'élément activity (unique) : elle ajoute
             l'attribut banner et un second intent-filter LEANBACK_LAUNCHER
             à côté du LAUNCHER téléphone. -->
        <!-- Cible RELATIVE À LA RACINE DE LA PLATEFORME : cordova-android 15
             joint l'attribut target à platforms/android/ (lib/prepare.js,
             updateFileResources). « res/drawable-xhdpi » atterrissait hors
             du projet gradle et AAPT échouait : « resource drawable/banner
             not found » (troisième run v1.1.0). -->
        <resource-file src="res/screen/android/banniere-tv.png" target="app/src/main/res/drawable-xhdpi/banner.png" />
        <config-file target="app/src/main/AndroidManifest.xml" parent="/manifest">
            <uses-feature android:name="android.software.leanback" android:required="false" />
        </config-file>
        <!-- L'attribut banner fusionne via edit-config (mode merge = attributs
             uniquement : les ENFANTS d'un edit-config ne sont pas appendes) ;
             l'intent-filter LEANBACK passe donc par config-file, qui ajoute
             ses enfants tels quels. Premier run v1.1.0 : l'intent-filter
             declare dans l'edit-config n'a jamais atterri dans le manifeste. -->
        <edit-config file="app/src/main/AndroidManifest.xml" mode="merge" target="/manifest/application/activity">
            <activity android:banner="@drawable/banner" />
        </edit-config>
        <config-file target="app/src/main/AndroidManifest.xml" parent="/manifest/application/activity">
            <intent-filter android:label="@string/launcher_name">
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
        </config-file>
    </platform>
</widget>
`);
    console.log('bobine cordova      -> build/cordova');
}

/* ── Bobine Electron (.exe Windows) ──────────────────────────────────────── */

function preparerElectron() {
    rmSync(ELECTRON, { recursive: true, force: true });
    mkdirSync(join(ELECTRON, 'www'), { recursive: true });
    cpSync(EMBARQUE, join(ELECTRON, 'www'), { recursive: true });
    cpSync(join(RACINE, 'apps', 'electron', 'main.js'), join(ELECTRON, 'main.js'));

    const icone = join(ELECTRON, 'icon.ico');
    ecrireIco(icone, svg, [16, 24, 32, 48, 64, 128, 256]);
    // electron-builder convertit lui-même un PNG >= 512 en ICO pour les
    // ressources de l'exécutable — voie native éprouvée (notre ICO maison
    // n'est pas reconnu par son analyseur, cf. historique CI) ; il sert
    // d'icône de fenêtre (BrowserWindow) dans main.js.
    ecrirePng(join(ELECTRON, 'icon.png'), rendre(svg, 512), 512, 512);

    writeFileSync(join(ELECTRON, 'package.json'), JSON.stringify({
        name: 'spacehub',
        productName: 'SpaceHub',
        version,
        description: pkg.description || 'SpaceHub — Media Center',
        main: 'main.js',
        author: typeof pkg.author === 'string' ? pkg.author : 'SpaceHub Team',
        license: pkg.license || 'GPL-3.0',
        // electron-builder lit ici la version d'Electron à embarquer —
        // aucune installation n'est nécessaire dans ce dossier.
        devDependencies: { electron: pkg.electronVersion || '44.3.0' },
        build: {
            appId: 'io.spacehub.app',
            productName: 'SpaceHub',
            directories: { output: 'sortie' },
            files: ['main.js', 'www/**/*', 'icon.ico', 'icon.png'],
            win: {
                target: [
                    { target: 'nsis', arch: ['x64'] },
                    { target: 'portable', arch: ['x64'] },
                ],
                icon: 'icon.png',
                // Pas de certificat de signature : l'installeur est non
                // signé, Windows SmartScreen affiche un avertissement à la
                // première exécution (« Exécuter quand même »). Le passage
                // à un certificat de signature de code se branchera ici.
                signAndEditExecutable: false,
            },
            nsis: {
                oneClick: false,
                perMachine: false,
                allowToChangeInstallationDirectory: true,
                createDesktopShortcut: true,
                shortcutName: 'SpaceHub',
                artifactName: 'SpaceHub-Setup-${version}.exe',
            },
            portable: { artifactName: 'SpaceHub-${version}-portable.exe' },
        },
    }, null, 4) + '\n');
    console.log('bobine electron     -> build/electron');
}

/* ── Point d'entrée ──────────────────────────────────────────────────────── */

await construireEmbarque();
preparerCordova();
preparerElectron();
rmSync(EMBARQUE, { recursive: true, force: true });
console.log(`bobines pretes (version ${version}) — projets natifs dans build/`);
