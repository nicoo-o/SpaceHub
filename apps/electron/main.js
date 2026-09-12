/**
 * SpaceHub — processus principal Electron (Windows)
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * L'application est un site statique autonome (dist/). L'exécutable Windows
 * est une coquille minimale autour de CE MÊME build : une fenêtre Chromium
 * dédiée qui charge www/index.html, rien de plus. Ce fichier est
 * volontairement court — toute logique d'application ici créerait une
 * deuxième source de vérité avec le build web, et une surface d'attaque
 * doublée.
 *
 * Les choix de sécurité suivent la recommandation Electron pour une
 * application qui ne charge que du contenu local :
 *   • contextIsolation (défaut, réaffirmé) et nodeIntegration désactivé —
 *     la page n'a aucun accès à Node ;
 *   • pas de remote module ;
 *   • le menu par défaut est retiré (F11 plein écran reste disponible) ;
 *   • toute navigation hors fichier local est refusée — l'application
 *     n'a pas de raison d'ouvrir un site dans la fenêtre, et les liens
 *     externes ne doivent jamais naviguer le shell.
 */

import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const RACINE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(RACINE, 'www', 'index.html');

// Empêche le cache V8 partagé d'échouer sur des chemins avec espaces
// (C:\Users\…\Desktop\projet perso code\) — comportement observé, bénin.
app.commandLine.appendSwitch('disable-http-cache');

let fenetre = null;

// ─── Mises à jour automatiques (décision docs/SIGNATURE_WINDOWS_ET_AUTO_UPDATE.md) ─
//
// Étape 2 de la décision : electron-updater branché sur GitHub Releases
// (latest.yml + blockmaps joints à la release par le workflow Paquets).
// L'import est CONDITIONNEL : la dépendance n'existe que dans le paquet
// Electron ; le shell doit démarrer sans elle (développement, paquets
// assemblés à la main). Le canal est celui du build (latest pour les
// versions stables), détecté par electron-updater lui-même.
//
// Ordre imposé par la décision : la signature Authenticode d'abord
// (étape 1, docs/SIGNATURE_WINDOWS_ET_AUTO_UPDATE.md) — c'est la
// vérification `verifyUpdateCodeSignature` qui rend ce canal sûr.
let autoUpdater = null;
let majActives = true;   // défaut : activées (opt-out dans les réglages)

const FICHIER_MAJ = () => join(app.getPath('userData'), 'auto-update.json');

/**
 * LE PAQUET EN COURS D'EXÉCUTION EST-IL SIGNÉ ?
 *
 * Cette question n'était pas posée, et `brancherAutoUpdate()` était appelé
 * inconditionnellement. Or la décision écrite dans
 * docs/SIGNATURE_WINDOWS_ET_AUTO_UPDATE.md est sans ambiguïté :
 *
 *   « Sans signature, l'auto-update est une attaque : n'importe qui capable
 *     de remplacer latest.yml sur le canal (miroir, réseau local,
 *     compromission du repo) pousse un binaire arbitraire exécuté par l'app.
 *     C'est la raison de l'ordre : signature d'abord, auto-update ensuite. »
 *
 * L'étape 1 (profil Azure Artifact Signing) n'est pas faite : dans
 * `scripts/preparer-bobines.mjs`, le bloc `sign` n'existe que si les trois
 * variables du profil sont présentes, et sinon le build sort
 * `signAndEditExecutable: false`. Les paquets publiés jusqu'ici sont donc
 * NON SIGNÉS — et téléchargeaient puis installaient quand même ce que le
 * canal leur présentait. Le code faisait exactement ce que sa propre
 * documentation interdit.
 *
 * CE QU'ON MESURE, ET POURQUOI C'EST CELUI-LÀ.
 * `app-update.yml` est écrit dans les ressources du paquet par
 * electron-builder. Son champ `publisherName` n'y apparaît que si la cible
 * Windows a été signée, et c'est LA MÊME valeur qu'electron-updater compare
 * au certificat du binaire téléchargé (`verifyUpdateCodeSignature`). Absente,
 * la vérification n'a rien à comparer et electron-updater la passe. Exiger
 * `publisherName` n'est donc pas une approximation de « est-ce signé » :
 * c'est exactement la condition sous laquelle la vérification a lieu.
 *
 * En cas de doute — fichier absent, illisible, champ vide — on REFUSE. Un
 * canal de mise à jour est une porte d'exécution de code : elle se ferme sur
 * l'incertitude, jamais l'inverse.
 *
 * @returns {boolean}
 */
function canalVerifiable() {
    try {
        const racineRessources = process.resourcesPath || RACINE;
        const brut = readFileSync(join(racineRessources, 'app-update.yml'), 'utf8');
        // Le champ accepte une valeur seule ou une liste (rotation de
        // certificat : `publisherName` est un tableau dans electron-builder
        // précisément pour ça). On accepte les deux formes, et on n'accepte
        // pas une clé annoncée sans rien derrière.
        const bloc = /^publisherName:[^\n]*(?:\n[ \t]+[^\n]*)*/m.exec(brut);
        if (!bloc) return false;
        return bloc[0].replace(/^publisherName:/, '').replace(/[-\s]/g, '').length > 0;
    } catch {
        return false;
    }
}

function chargerPreferenceMaj() {
    try {
        const brut = readFileSync(FICHIER_MAJ(), 'utf8');
        majActives = JSON.parse(brut).actif !== false;
    } catch {
        // Fichier absent ou illisible : on garde le défaut (activées).
    }
}

function verifierMisesAJour() {
    if (!majActives || !autoUpdater) return;
    autoUpdater.checkForUpdates().catch((err) => {
        // Échec réseau, release sans métadonnées : jamais un crash, jamais
        // une fenêtre — la prochaine vérification repartira.
        console.log('[SpaceHub:AutoUpdate] vérification impossible :', err?.message || err);
    });
}

/** Planifie le prochain contrôle avec un jitter aléatoire (évite les pics). */
function planifierControle(delaiMs) {
    setTimeout(() => {
        verifierMisesAJour();
        planifierControle(6 * 60 * 60 * 1000 + Math.floor(Math.random() * 10 * 60 * 1000));
    }, delaiMs);
}

function brancherAutoUpdate() {
    if (!canalVerifiable()) {
        // NE PAS se contenter de sauter : le dire. Un canal de mise à jour
        // silencieusement inactif est aussi trompeur qu'un canal
        // silencieusement non vérifié — dans les deux cas personne ne sait.
        console.log(
            '[SpaceHub:AutoUpdate] DÉSACTIVÉ : ce paquet n\'est pas signé '
            + '(aucun publisherName dans app-update.yml), donc electron-updater '
            + 'ne pourrait pas vérifier la signature du binaire téléchargé. '
            + 'Voir docs/SIGNATURE_WINDOWS_ET_AUTO_UPDATE.md — étape 1 avant étape 2. '
            + 'Les mises à jour restent manuelles jusque-là.');
        return;
    }
    import('electron-updater').then(({ autoUpdater: updater }) => {
        autoUpdater = updater;
        autoUpdater.autoDownload = true;          // télécharge en arrière-plan
        autoUpdater.autoInstallOnAppQuit = true;  // installe à la fermeture, jamais pendant
        // Réaffirmé plutôt que laissé au défaut : c'est LA vérification qui
        // rend ce canal sûr, et un défaut qui change de valeur au fil des
        // versions d'electron-updater la retirerait sans rien casser
        // visiblement.
        autoUpdater.verifyUpdateCodeSignature = true;
        autoUpdater.on('update-downloaded', () => {
            console.log('[SpaceHub:AutoUpdate] mise à jour téléchargée — installation à la fermeture.');
        });
        // Première vérification au démarrage, décalée de 0 à 10 min pour ne
        // pas percuter le lancement ; puis toutes les 6 h avec jitter.
        planifierControle(Math.floor(Math.random() * 10 * 60 * 1000));
    }).catch(() => {
        // Dépendance absente : pas d'auto-update, rien de plus à faire.
    });
}

// La page web (réglages) transmet l'opt-out par le pont préchargé.
ipcMain.on('auto-update:definir-actif', (_event, actif) => {
    majActives = actif === true;
    try {
        writeFileSync(FICHIER_MAJ(), JSON.stringify({ actif: majActives }));
    } catch {
        // userData illisible : la préférence vit en mémoire jusqu'à la fin.
    }
    console.log(`[SpaceHub:AutoUpdate] mises à jour automatiques ${majActives ? 'activées' : 'désactivées'}.`);
    if (autoUpdater && majActives) verifierMisesAJour();
});

function creerFenetre() {
    fenetre = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 600,
        backgroundColor: '#101014',
        autoHideMenuBar: true,
        icon: join(RACINE, 'icon.ico'),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            sandbox: true,
            spellcheck: false,
            // Le SEUL pont (preload.cjs) : la préférence d'auto-update.
            preload: join(RACINE, 'preload.cjs'),
        },
    });

    // Aucun menu applicatif — l'application web gère toute la navigation.
    Menu.setApplicationMenu(null);

    if (!existsSync(INDEX)) {
        // Ne doit jamais arriver : le paquet embarque www/. Message clair
        // plutôt qu'une fenêtre blanche muette si l'assemblage a dévié.
        fenetre.loadURL('data:text/html,' + encodeURIComponent(
            '<body style="background:#101014;color:#f0f0f8;font-family:sans-serif;display:grid;place-items:center;height:92vh">' +
            '<div><h1>SpaceHub</h1><p>www/index.html introuvable dans le paquet.</p></div></body>'));
        return;
    }

    fenetre.loadFile(INDEX);

    // Les liens externes (documentation, GitHub…) vont au navigateur réel,
    // jamais dans la fenêtre de l'application.
    fenetre.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });

    // Filet : refuse toute navigation principale qui quitterait le paquet.
    fenetre.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('file://')) event.preventDefault();
    });
}

const verrou = app.requestSingleInstanceLock();
if (!verrou) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (fenetre) {
            if (fenetre.isMinimized()) fenetre.restore();
            fenetre.focus();
        }
    });

    chargerPreferenceMaj();
    brancherAutoUpdate();

    app.whenReady().then(creerFenetre);

    // Windows : fermer toutes les fenêtres quitte l'application.
    app.on('window-all-closed', () => app.quit());

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
    });
}
