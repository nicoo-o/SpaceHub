/**
 * SpaceHub — la sonde de surface du moteur de navigation
 * =======================================================
 *
 * POURQUOI ELLE EXISTE
 * --------------------
 * `core/ContratSpatialNavigation.js` dit quelle surface le monde extérieur a le
 * DROIT de toucher : une liste écrite à la main, vérifiée statiquement
 * (`scripts/facade-appelants-check.mjs` lit les appels dans les sources) et
 * figée côté classe (`tests/FacadeNav.test.js` vérifie que chaque membre
 * existe). Les deux disent la même chose sous deux angles : **déclaré**.
 *
 * Aucun des deux ne dit ce qui est **atteint**. C'est pourtant la seule question
 * qui compte avant d'extraire quoi que ce soit d'un monolithe :
 *
 *   · un membre déclaré que RIEN n'atteint jamais est du poids mort — l'extraire
 *     est un cadeau, le garder est une illusion de compatibilité ;
 *   · un membre atteint qui n'est PAS déclaré est un trou dans le contrat : une
 *     extraction le retirerait, et personne ne le verrait avant la recette ;
 *   · un membre atteint seulement par imbrication (le moteur s'appelle lui-même
 *     pendant qu'il traite un appel) n'a pas besoin d'être public.
 *
 * La sonde répond aux trois en enveloppant les méthodes publiques du moteur et
 * en comptant, pendant la course e2e entière — c'est-à-dire sur l'application
 * réelle, dans un vrai navigateur, avec ses vrais gestes.
 *
 * CE QUI LA REND HONNÊTE
 * ----------------------
 *   1. Elle se pose sur l'**affectation** du moteur (`SpaceHub.spatialNav`), pas
 *      en interrogeant l'objet toutes les N millisecondes : un membre atteint au
 *      démarrage — `getGamepad()`, appelé dans la foulée de l'affectation —
 *      serait manqué par une surveillance, et un relevé faux par construction ne
 *      prouve rien.
 *   2. Elle publie à la PREMIÈRE atteinte de chaque membre, pas seulement sur un
 *      minuteur : un scénario qui se termine entre deux ticks ne peut pas
 *      laisser de trou.
 *   3. Elle croise le relevé avec ce que les SOURCES référencent. Un membre
 *      atteint mais référencé nulle part n'est pas « appelé de l'extérieur » :
 *      c'est un appel différé du moteur (mesuré pour de vrai sur `popFocus`,
 *      programmé par `requestAnimationFrame` dans `onModalClosed`), et le
 *      confondre avec un appelant produirait un faux trou dans le contrat.
 *
 * SA LIMITE, ÉCRITE POUR NE PAS ÊTRE DÉCOUVERTE PLUS TARD
 * ------------------------------------------------------
 * Elle voit les appels, pas les intentions, et elle compte les appels D'UN
 * APPELANT DE PREMIER NIVEAU — pas « d'un appelant extérieur au moteur » : un
 * appel différé du moteur (minuteur, frame, promesse) est de premier niveau par
 * construction. C'est pourquoi la colonne s'appelle « au premier niveau », et
 * pourquoi le croisement avec les références statiques est obligatoire pour
 * conclure quoi que ce soit sur le contrat.
 */

import fs from 'node:fs';
import path from 'node:path';

import { MEMBRES_APPELABLES } from '../core/ContratSpatialNavigation.js';

/** Préfixe du canal : la sonde écrit, le harnais filtre, le reste ne voit rien. */
export const PREFIXE = '__SURFACE_NAV__';

/**
 * La fonction injectée dans la page. Playwright la sérialise et l'exécute avant
 * tout script de l'application ; elle reçoit la liste des membres déclarés en
 * argument (elle ne peut rien importer : elle vit dans la page).
 */
export function sondeSurfaceNav(membresDeclares) {
    if (window.__sondeSurfaceNav) return;

    const etat = {
        appels: Object.create(null),
        premierNiveau: Object.create(null),
        inconnus: Object.create(null),
        profondeur: 0,
        installe: false,
        motif: null,
    };
    window.__sondeSurfaceNav = etat;

    let dernierePublication = 0;
    const publier = () => {
        dernierePublication = Date.now();
        try {
            console.log('__SURFACE_NAV__' + JSON.stringify({
                appels: etat.appels,
                premierNiveau: etat.premierNiveau,
                inconnus: etat.inconnus,
                installe: etat.installe,
                motif: etat.motif,
            }));
        } catch { /* un canal de mesure ne casse jamais la page qu'il mesure */ }
    };

    const declares = new Set(membresDeclares);

    const envelopper = (nav, motif) => {
        if (!nav || etat.installe) return;
        // Toute la chaîne de prototypes : les méthodes d'une classe vivent là, et
        // une extraction future pourrait les répartir sur une classe de base.
        for (let proto = Object.getPrototypeOf(nav); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
            for (const nom of Object.getOwnPropertyNames(proto)) {
                if (nom === 'constructor' || nom.startsWith('_')) continue;
                const descripteur = Object.getOwnPropertyDescriptor(proto, nom);
                if (!descripteur || typeof descripteur.value !== 'function') continue;
                const origine = descripteur.value;
                const enveloppe = function (...args) {
                    const premier = etat.profondeur === 0;
                    etat.appels[nom] = (etat.appels[nom] || 0) + 1;
                    if (premier) etat.premierNiveau[nom] = (etat.premierNiveau[nom] || 0) + 1;
                    if (!declares.has(nom)) etat.inconnus[nom] = (etat.inconnus[nom] || 0) + 1;
                    // Publication à la PREMIÈRE atteinte (et au premier appel de
                    // premier niveau) : un scénario qui se termine entre deux
                    // ticks ne peut pas laisser de trou dans le relevé.
                    if (etat.appels[nom] === 1 || (premier && etat.premierNiveau[nom] === 1)) publier();
                    etat.profondeur += 1;
                    try {
                        return origine.apply(this, args);
                    } finally {
                        etat.profondeur -= 1;
                    }
                };
                Object.defineProperty(proto, nom, { ...descripteur, value: enveloppe });
            }
        }
        etat.installe = true;
        etat.motif = motif;
        publier();
    };

    // ─── La prise sur l'affectation ─────────────────────────────────────────
    // `window.SpaceHub` est posé à l'évaluation du module, l'instance du moteur
    // dans `init()` : il y a une fenêtre — courte mais réelle — pendant laquelle
    // on peut prendre l'assignation en flagrant délit.
    let piegee = false;
    const pieger = () => {
        const hub = window.SpaceHub;
        if (!hub || piegee) return false;
        piegee = true;
        let valeur;
        try {
            valeur = hub.spatialNav;
            Object.defineProperty(hub, 'spatialNav', {
                configurable: true,
                enumerable: true,
                get() { return valeur; },
                set(v) { valeur = v; envelopper(v, 'prise sur l\'affectation'); },
            });
        } catch {
            // Propriété non configurable : la surveillance prend le relais.
        }
        if (valeur) envelopper(valeur, 'instance déjà en place');
        return true;
    };

    const reveil = setInterval(() => {
        if (!piegee) pieger();
        if (!etat.installe) {
            const hub = window.SpaceHub;
            const nav = hub?.core?.spatialNavigation || hub?.spatialNav;
            if (nav) envelopper(nav, 'surveillance');
        }
        if (etat.installe && piegee) clearInterval(reveil);
    }, 4);

    // Le relevé ne doit pas dépendre de la fin de la page.
    setInterval(() => {
        if (Date.now() - dernierePublication > 400) publier();
    }, 250);
    window.addEventListener('pagehide', publier);
    window.addEventListener('beforeunload', publier);

    // Une première publication différée dit « la sonde est là, rien atteint
    // encore » : sans elle, une page où le moteur ne serait jamais construit
    // serait indistinguable d'une page où la sonde n'a pas tourné.
    setTimeout(publier, 2500);
}

/** La liste des membres déclarés, telle que la page doit la connaître. */
export const membresDeclares = () => [...MEMBRES_APPELABLES];

// ════════════════════════════════════════════════════════════════════════════
// L'INVENTAIRE STATIQUE — la surface IMPLÉMENTÉE, et qui la référence
// ════════════════════════════════════════════════════════════════════════════

const RACINES = ['core', 'ui', 'jellyfin', 'integrations', 'plugins', 'api', 'scripts'];
const MOTEUR = 'core/SpatialNavigation.js';

function fichiersDe(racine, sortie = []) {
    if (!fs.existsSync(racine)) return sortie;
    for (const e of fs.readdirSync(racine, { withFileTypes: true })) {
        const p = path.join(racine, e.name);
        if (e.isDirectory()) fichiersDe(p, sortie);
        else if (p.endsWith('.js')) sortie.push(p.replace(/\\/g, '/'));
    }
    return sortie;
}

/** Les commentaires parlent des membres ; ils n'en sont pas. */
const sansCommentaires = src => src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^ \n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');

/**
 * La surface IMPLÉMENTÉE : les méthodes publiques réellement portées par le
 * moteur, lues dans sa source. C'est elle qu'on compare au contrat et au relevé.
 */
export function membresPublicsMoteur() {
    const src = sansCommentaires(fs.readFileSync(MOTEUR, 'utf8'));
    const noms = new Set();
    for (const m of src.matchAll(/^\s{4}(?!\/)([A-Za-z_$][\w$]*)\s*\(/gm)) noms.add(m[1]);
    return [...noms].filter(n => !n.startsWith('_') && n !== 'constructor').sort();
}

/** Toute référence `recepteur.membre` dans les sources d'application. */
export function inventaireReferences() {
    const references = new Map();
    for (const fichier of RACINES.flatMap(r => fichiersDe(r))) {
        const src = sansCommentaires(fs.readFileSync(fichier, 'utf8'));
        // La forme `svc.nav().x` compte : c'est par elle que le search atteint
        // `pushLayer`, `onLayerClosed` et `pushFocus`. Sans elle, trois membres
        // vivants passaient pour des morts — un faux positif qui aurait fait
        // privatiser une API réellement appelée.
        for (const m of src.matchAll(
            /(?:\b(?:nav|spatialNav|spatialNavigation|moteur)\b\s*\(?\s*\)?|this\._nav)\s*\??\.\s*([A-Za-z_$][\w$]*)/g
        )) {
            const ligne = src.slice(0, m.index).split('\n').length;
            if (!references.has(m[1])) references.set(m[1], []);
            references.get(m[1]).push(`${fichier}:${ligne}`);
        }
    }
    return references;
}

/**
 * Les membres publics du moteur qu'AUCUNE ligne de la base ne référence — pas
 * même une ligne du moteur (hors sa propre définition). C'est la surface morte :
 * publique, déclarée nulle part, appelée nulle part.
 */
export function membresJamaisReferencés() {
    const texteMoteur = sansCommentaires(fs.readFileSync(MOTEUR, 'utf8'));
    const references = inventaireReferences();
    const morts = [];
    for (const membre of membresPublicsMoteur()) {
        // Auto-référence : `this.membre`. Compter le MOT serait faux — `destroy`
        // apparaît deux fois dans le moteur (`destroy()` et `this._gamepad
        // .destroy()`), sur DEUX objets différents ; la définition elle-même ne
        // compte pas comme un appel.
        const autoReference = new RegExp(`\\bthis\\.${membre}\\b`).test(texteMoteur);
        const externes = references.get(membre) || [];
        if (!autoReference && externes.length === 0) morts.push(membre);
    }
    return morts;
}

// ════════════════════════════════════════════════════════════════════════════
// LES DÉCISIONS — ce que la course ne peut PAS atteindre, et pourquoi
// ════════════════════════════════════════════════════════════════════════════

/**
 * Membres déclarés qu'une course e2e web ne peut pas atteindre. Chaque entrée est
 * une décision motivée : elle empêche la sonde de mentir dans un sens (déclarer
 * atteint ce qui ne l'est pas) comme dans l'autre (crier au membre mort).
 */
export const EXEMPTIONS = Object.freeze({
    demandeRetour:
        "chemin d'APK : `SpaceHub` s'en saisit au démarrage (`pontAndroid.brancherMoteur`), " +
        "mais il n'est appelé que sur un backbutton système — hors Cordova le pont est " +
        "inerte par construction. Le chemin est couvert par tests/PontAndroid.test.js.",
});

/**
 * La surface MORTE tolérée : publique, atteinte par personne, référencée par
 * personne. Ce n'est pas une fatalité, c'est le gisement de la prochaine peau —
 * privatiser ou supprimer, et retirer la ligne d'ici. Un NOUVEAU membre mort
 * échoue : ajouter du vide public doit être une décision, pas un effet de bord.
 */
export const MORTS_TOLERES = Object.freeze({
    clearFocus: 'jamais appelé depuis l\'arrivée de `popFocus` (le dépilement gère le focus).',
    unextendFocusables: 'aucun appelant : les sources ajoutées ne sont jamais retirées à chaud.',
    unregisterFocusables: 'aucun appelant : un scope ne se désenregistre jamais.',
    destroy: 'aucun appelant : le moteur vit aussi longtemps que l\'application.',
});

// ════════════════════════════════════════════════════════════════════════════
// L'ACCUMULATEUR ET LE VERDICT
// ════════════════════════════════════════════════════════════════════════════

/** Accumulateur côté harnais : union de toutes les pages, max par membre. */
export function creerAccumulateur() {
    const releve = {
        appels: Object.create(null),
        premierNiveau: Object.create(null),
        inconnus: Object.create(null),
        pages: 0,
        motifs: new Set(),
        muettes: 0,
    };

    const fusionner = (cible, source) => {
        for (const [membre, n] of Object.entries(source || {})) {
            cible[membre] = Math.max(cible[membre] || 0, n);
        }
    };

    return {
        /**
         * Enregistre un relevé de page. `libelle` dit QUI mesure (le scénario
         * courant) : c'est ce qui rend le relevé attribuable, donc discutable.
         */
        noter(libelle, charge) {
            if (!charge) return;
            releve.pages += 1;
            if (charge.motif) releve.motifs.add(charge.motif);
            if (!charge.installe) releve.muettes += 1;
            fusionner(releve.appels, charge.appels);
            fusionner(releve.premierNiveau, charge.premierNiveau);
            fusionner(releve.inconnus, charge.inconnus);
            void libelle;
        },
        lire() { return releve; },
    };
}

/**
 * Le verdict, dans les deux sens.
 *
 *   · `trous`     — atteint, absent du contrat, ET référencé par une source :
 *                   le contrat a un trou, une extraction casserait un appelant.
 *   · `prives`    — atteint, absent du contrat, référencé nulle part : appel
 *                   différé du moteur. Pas un trou ; un candidat à privatiser.
 *   · `manquants` — déclaré, jamais atteint, sans exemption : le contrat promet
 *                   une surface que rien ne prouve.
 *   · `morts`     — public, atteint nulle part, référencé nulle part : le
 *                   gisement. Toléré s'il est nommé, refusé s'il est nouveau.
 *
 * `injections` n'existe QUE pour le filet unitaire (tests/SurfaceNav.test.js) :
 * il faut pouvoir fabriquer un relevé et un corps de sources où le verdict DOIT
 * mordre — un contrôle qui ne peut pas échouer n'est pas un contrôle. En
 * production, les trois lecteurs réels sont appelés.
 */
export function verdictSurface(releve, injections = {}) {
    const declares = [...MEMBRES_APPELABLES];
    const publics = injections.publics || membresPublicsMoteur();
    const references = injections.references || inventaireReferences();
    const morts = injections.morts || membresJamaisReferencés();
    const atteints = publics.filter(m => (releve.appels[m] || 0) > 0);
    const premierNiveau = publics.filter(m => (releve.premierNiveau[m] || 0) > 0);

    const manquants = declares.filter(m => !atteints.includes(m) && !EXEMPTIONS[m]);
    const trous = atteints.filter(m => !declares.includes(m) && (references.get(m) || []).length > 0);
    const prives = atteints.filter(m => !declares.includes(m) && (references.get(m) || []).length === 0);
    const mortsNouveaux = morts.filter(m => !MORTS_TOLERES[m]);
    const mortsReparés = Object.keys(MORTS_TOLERES).filter(m => !morts.includes(m));

    return { declares, publics, atteints, premierNiveau, manquants, trous, prives,
             morts, mortsNouveaux, mortsReparés, exemptions: Object.keys(EXEMPTIONS),
             references, releve };
}
