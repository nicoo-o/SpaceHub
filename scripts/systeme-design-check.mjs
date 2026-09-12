#!/usr/bin/env node
/**
 * SpaceHub — Cliquet « déclaré vs consommé »
 * ==========================================
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * Dix passes d'audit ont trouvé le même défaut sous neuf noms différents :
 * le système de design est DÉCLARÉ et n'est PAS CONSOMMÉ.
 *
 *     0 usage de l'échelle typographique  ·  449 font-size écrits à la main
 *     3 usages des rayons déclarés        ·  448 border-radius écrits à la main
 *     2 usages de la gamme d'accent       ·  613 hexadécimaux écrits à la main
 *   1 171 usages des durées               ·   13 littéraux
 *   536 usages des courbes                ·  753 transitions sur `ease` nu
 *
 * Les durées sont la preuve que ce n'est pas une fatalité : la famille est
 * consommée à 99 %. Les courbes sont à mi-chemin (536 usages, mais 753
 * transitions retombent encore sur le `ease` nu du navigateur). La typographie
 * et les rayons, eux, sont à zéro et à trois : le jeton existe, il est
 * documenté, il est pertinent — et le composant écrit sa propre valeur à côté.
 *
 * DEUX CORRECTIONS QUE CE CONTRÔLE A APPORTÉES À L'AUDIT QUI L'A PRÉCÉDÉ
 * ---------------------------------------------------------------------
 * Il faut les écrire, parce qu'elles vont dans le sens inverse de l'audit et
 * qu'un chiffre faux dans le bon sens reste un chiffre faux :
 *
 *   1. « var(--sh-ease-*) : 0 usage » était FAUX. Le relevé qui l'affirmait
 *      passait un motif à `grep -E`, où `(` ouvre un groupe de capture : la
 *      parenthèse de `var(` était donc un métacaractère, et le motif ne
 *      pouvait rien trouver. La consommation réelle est de 536.
 *   2. « 10 transitions sur ease-in » était FAUX aussi : le motif comptait
 *      `ease-in-out`, qui est légitime. Il n'y a AUCUN `ease-in` nu — ce qui
 *      est une bonne nouvelle, pas un chantier.
 *
 * Leçon pour la suite : un compteur qui n'a jamais rien trouvé n'a peut-être
 * rien trouvé parce qu'il est cassé.
 *
 * C'est le motif que ce dépôt a déjà nommé pour le CSS (POSTMORTEM_47_TRANSITIONS) :
 * un vert qui ment. Un système qu'aucun contrôle ne mesure dérive toujours dans
 * le même sens — vers le littéral, parce que le littéral est plus court à écrire.
 *
 * CE QU'IL MESURE, ET DANS QUEL SENS
 * ----------------------------------
 * Deux familles, parce que le défaut a deux formes :
 *
 *   PLAFONDS — ce qui ne doit plus augmenter : les littéraux et les coûts.
 *              Un plafond dépassé échoue la chaîne.
 *   PLANCHERS — ce qui ne doit plus diminuer : la consommation des jetons.
 *              Un plancher non atteint échoue la chaîne.
 *
 * Un compteur qui s'améliore est signalé dans la sortie : le plafond se
 * baisse (ou le plancher se relève) **dans le commit qui prouve la
 * descente**, jamais au fil de l'eau. Même règle que le budget des
 * monolithes (scripts/taille-monolithes-check.mjs) — un plafond calé sur la
 * taille actuelle est ce qui empêche la croissance de revenir.
 *
 * CE QU'IL NE COUVERT PAS
 * -----------------------
 * `backdrop-filter` et `transition: all` sont déjà tenus par
 * scripts/css-hygiene-check.mjs, et la durée des boucles par la même feuille
 * de contrôle. Les compter ici deux fois ferait deux vérités.
 */

import fs from 'node:fs';
import path from 'node:path';

const RACINES = ['ui', 'core', 'jellyfin', 'integrations', 'plugins', 'public'];
const RACINE = process.cwd();

/* ── Le fichier des jetons est le seul endroit où un littéral est légitime ── */
const CHEMIN_JETONS = 'public/design-system/tokens.css';

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === 'dist') continue;
            walk(p, out);
        } else if (e.name.endsWith('.css') || e.name.endsWith('.js')) {
            out.push(p.replace(/\\/g, '/'));
        }
    }
    return out;
}

const fichiers = RACINES.flatMap(r => walk(path.resolve(RACINE, r)));
const feuilles = fichiers.filter(f => f.endsWith('.css'));

/** Tout le CSS du dépôt, commentaires retirés (un exemple en commentaire n'est pas un usage). */
function cssSansCommentaires(contenu) {
    return contenu.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
}

const textes = new Map();
for (const f of fichiers) textes.set(f, cssSansCommentaires(fs.readFileSync(f, 'utf8')));

/* ── Retire les blocs @media correspondants à un motif, accolades équilibrées ── */
function retirerBlocsMedia(texte, motif) {
    let sortie = '';
    let i = 0;
    while (i < texte.length) {
        if (texte.startsWith('@media', i) && motif.test(texte.slice(i, i + 80))) {
            const debut = texte.indexOf('{', i);
            if (debut === -1) break;
            let profondeur = 0, j = debut;
            for (; j < texte.length; j++) {
                if (texte[j] === '{') profondeur++;
                else if (texte[j] === '}') { profondeur--; if (profondeur === 0) break; }
            }
            // Le bloc retiré laisse des blancs : les numéros de ligne restent justes.
            sortie += texte.slice(i, j + 1).replace(/[^\n]/g, ' ');
            i = j + 1;
        } else {
            sortie += texte[i];
            i++;
        }
    }
    return sortie;
}

const toutesLesFeuilles = () => [...textes].filter(([f]) => f.endsWith('.css'));
const compte = (re, filtre = () => true, source = toutesLesFeuilles()) => {
    let n = 0;
    for (const [f, t] of source) {
        if (!filtre(f)) continue;
        n += (t.match(re) || []).length;
    }
    return n;
};

/**
 * La consommation se mesure PARTOUT — feuilles et scripts : un style en ligne
 * (`style="color:var(--sh-color-danger)"`) consomme le jeton autant qu'une
 * règle CSS. Les littéraux, eux, ne se comptent que dans les feuilles.
 */
const comptePartout = re => compte(re, () => true, [...textes]);

/**
 * Les deux capitales qui RESTENT, nommées.
 *
 * La casse peut servir une structure, jamais meubler. Ces deux-là sont des
 * repères, pas des étiquettes : l'en-tête d'une colonne de tableau et le libellé
 * d'un contrôle compact. Les nommer ici plutôt que d'accepter un plafond à deux
 * fait la différence entre une dette tolérée et une exception justifiée — une
 * nouvelle capitale ne se fond plus dans le compte, elle échoue.
 */
const CAPITALES_EXEMPTEES = [
    '.sh-lib-table th',      // ui/views/LibraryView.css — repère structurel d'un tableau
    '.sh-hero-scroll-hint',  // ui/components/HeroSpotlightComponent.css — libellé de contrôle
];

function compterCapitales() {
    let n = 0;
    for (const [, texte] of toutesLesFeuilles()) {
        let selecteur = '';
        for (const ligne of texte.split('\n')) {
            const avant = ligne.split('text-transform')[0];
            if (avant.includes('{')) selecteur = avant.split('{')[0].trim();
            else if (avant.includes('}')) selecteur = '';
            if (!/text-transform:\s*uppercase/.test(ligne)) continue;
            if (CAPITALES_EXEMPTEES.some(s => selecteur.includes(s))) continue;
            n += 1;
        }
    }
    return n;
}

/**
 * Motif d'un jeton RÉELLEMENT consommé.
 *
 * Il ne doit pas exiger de parenthèse fermante : la forme documentée du dépôt
 * est `var(--sh-x, repli)`, et une mesure qui l'ignore sous-compte précisément
 * les usages les mieux écrits. C'est l'erreur de la première version de ce
 * contrôle — trois planchers lisaient zéro alors que les jetons servaient.
 */
const usage = nom => new RegExp(`var\\(${nom}\\s*[,)]`, 'g');

/* ══════════════════════════════════════════════════════════════════════
   LA MESURE
   ══════════════════════════════════════════════════════════════════════ */

function mesurer() {
    const horsJetons = f => !f.endsWith(CHEMIN_JETONS);

    /* ── Littéraux : plafonds ─────────────────────────────────────────── */
    const hexLitteraux = compte(/#[0-9a-fA-F]{3,8}\b/g, horsJetons);
    const taillesLitterales = compte(/font-size:\s*[\d.]+px/g, horsJetons);
    const graissesLitterales = compte(/font-weight:\s*\d{3}/g, horsJetons);
    /* Un `(?!var\()` après `\s*` ne filtre RIEN : `\s*` peut se réduire à zéro
       caractère, le regard négatif ne voit alors que l'espace qui suit, et
       toute déclaration qui consomme le jeton avec une espace après le deux-
       points était comptée comme un littéral. La première version de ce
       contrôle annonçait donc 447 rayons écrits à la main alors que les
       jetons convertis y figuraient — un compteur cassé dans le bon sens
       reste un compteur cassé. On lit la VALEUR, et on juge sur elle. */
    let rayonsLitteraux = 0;
    for (const [f, t] of toutesLesFeuilles()) {
        if (!horsJetons(f)) continue;
        for (const m of t.matchAll(/border-radius:\s*([^;}]+)/g)) {
            if (!/^var\(/.test(m[1].trim())) rayonsLitteraux += 1;
        }
    }
    const capitalesMetadonnees = compterCapitales();

    /* ── Courbes : le `ease` nu a un démarrage lent, `ease-in` est interdit
           sur une interface (la courbe retarde exactement ce que l'œil
           regarde). `ease-in-out` est épargné : il est légitime au déplacement. */
    const courbesNues = compte(/\bease(?![-a-z])/g, horsJetons);
    const courbesEaseIn = compte(/\bease-in(?!-out)/g, horsJetons);

    /* ── Mouvement : boucles et propriétés non composées ───────────────── */
    const animationsInfinies = compte(/animation:[^;]*\binfinite\b/g, horsJetons);
    const ombresAnimees = compte(/transition[^;]*box-shadow/g, horsJetons);
    const filtresAnimes = compte(/transition[^;]*filter/g, horsJetons);

    /* ── Le toucher : un survol sans garde est du code mort sur un téléphone,
           et pire : il COLLE après un tap. On ne compte que les :hover hors
           des blocs qui les gardent (`hover: hover`) et hors de ceux qui les
           neutralisent (`hover: none`). */
    let hoverNonGardes = 0;
    for (const [, texte] of toutesLesFeuilles()) {
        // eslint-disable-next-line no-empty
        const nu = retirerBlocsMedia(
            retirerBlocsMedia(texte, /hover:\s*hover/),
            /hover:\s*none/
        );
        hoverNonGardes += (nu.match(/:hover\b/g) || []).length;
    }
    /* Le retour à la presse, compté par SÉLECTEUR et non par règle.

       Le motif précédent comptait les règles : une liste groupée de soixante
       sélecteurs valait UN. Ce plancher-là ne pouvait donc pas dire la
       couverture — et c'est la couverture qui compte, parce que c'est elle qui
       décide si un tap produit quelque chose de visible. Un plancher au nombre
       de règles aurait laissé passer une règle unique couvrant zéro surface. */
    let presseAnimee = 0;
    for (const [f, t] of toutesLesFeuilles()) {
        if (!horsJetons(f)) continue;
        for (const m of t.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            if (!/(?:^|;)\s*transform\s*:/.test(m[2])) continue;
            for (const sel of m[1].split(',')) if (/:active\b/.test(sel)) presseAnimee += 1;
        }
    }
    const vhResiduels = (() => {
        let n = 0;
        for (const [f, t] of toutesLesFeuilles()) {
            // Le motif exige le séparateur : `AnalyticsModal.css` se termine
            // aussi par « Modal.css », et le compte incluait donc un fichier
            // qui n'est pas une modale. Une mesure qui déborde de son sujet
            // produit un chiffre qu'on ne peut pas baisser pour de vrai.
            if (!/\/Modal(\.css|SlideUpSheet\.css)$/.test(f)) continue;
            n += (t.match(/[\d.]+vh\b/g) || []).length;
        }
        return n;
    })();

    /* ── Consommation : planchers ─────────────────────────────────────── */
    const jetonsEchelle = comptePartout(usage('--sh-text-(?:xs|sm|base|md|lg|xl|2xl|3xl|4xl)'));
    const jetonsCourbes = comptePartout(usage('--sh-ease-[a-z-]+'));
    const jetonsRayons = comptePartout(usage('--sh-radius-[a-z]+'));
    const jetonsCouleurs = comptePartout(usage('--sh-color-[a-z-]+'));
    // Noms déclarés uniquement : `--sh-accent-danger` n'existe pas (il est
    // consommé avec un repli, donc il fonctionne par accident) et ne doit pas
    // gonfler le plancher.
    const jetonsAccent = comptePartout(usage('--sh-accent(?:-fort|-doux|-trace|-contraste)?'));

    /* ── Le plancher de lisibilité : aucun texte sous 12 px, nulle part.

       Le barème lui-même commençait à 11 px et les feuilles descendaient à
       7 px — le texte le plus difficile à lire de l'application était posé
       sur une affiche, sur l'appareil qu'on regarde à trois mètres. Le
       compte couvre AUSSI le fichier des jetons : c'est là que le barème
       coupable se trouvait. */
    let taillesSousPlancher = 0;
    for (const [, t] of toutesLesFeuilles()) {
        for (const m of t.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
            if (Number(m[1]) < 12) taillesSousPlancher += 1;
        }
    }

    /* ── Le vocabulaire des ÉTATS.

       Un état s'écrit en modificateur BEM sur le bloc concerné —
       `.sh-modal--open`, `.sh-toast--visible` — et le mot vient d'une liste
       fermée. C'est la même famille de défauts que le sélecteur fantôme :
       deux synonymes pour le même état (`.open` et `--open`, `.active` et
       `--visible`) signifient que l'un des deux ne s'applique jamais, et
       personne ne le voit à la lecture. Le compte de noms distincts est
       plafonné : il ne peut que descendre, jamais s'enrichir d'un synonyme. */
    const VOCABULAIRE_ETAT = ['open', 'closed', 'active', 'visible', 'hidden', 'loading', 'error', 'success', 'expanded'];
    const ETATS_EXEMPTES = ['has-events'];   // un jour de calendrier qui porte des événements
    const etats = new Set();
    let etatsHorsVocabulaire = 0;
    for (const [f, t] of [...textes]) {
        if (f.endsWith(CHEMIN_JETONS)) continue;
        for (const m of t.matchAll(/(?:^|[.\s'"`])((?:is-|has-)[a-z-]+|[a-z0-9-]+--(?:open|closed|active|visible|hidden|loading|error|success|expanded))(?![a-z0-9-])/g)) {
            const nom = m[1];
            etats.add(nom);
            const mot = nom.split('--')[1] || nom;
            if (!VOCABULAIRE_ETAT.includes(mot) && !ETATS_EXEMPTES.includes(nom)) etatsHorsVocabulaire += 1;
        }
    }

    /* ── Une seule source de vérité par jeton.

       Un jeton de design se déclare dans le fichier des jetons, ou se
       REDÉFINIT dans un des deux modes qui existent : le préréglage clair et
       le mode TV. Partout ailleurs, une déclaration `--sh-*` est un troisième
       lieu : le composant redéfinit un jeton dans son coin, invisible au
       fichier qui est censé le décrire — le prochain lecteur du barème ne
       verra pas la vraie valeur. Les valeurs injectées à l'exécution
       (marges de sûreté des téléviseurs, facteur d'échelle TV) sont nommées
       ici parce que ce sont des mesures de l'écran, pas des décisions de
       design. */
    const SITES_JETONS = [
        /public\/design-system\/tokens\.css$/,
        /ui\/themes\/presets\/index\.js$/,
        /core\/TvModeManager\.css$/,
    ];
    const JETONS_RUNTIME = /--sh-(?:safe-(?:top|right|bottom|left)|tv-scale)/;
    let jetonsHorsSites = 0;
    for (const [f, t] of [...textes]) {
        if (SITES_JETONS.some(re => re.test(f))) continue;
        for (const m of t.matchAll(/(--sh-[a-z0-9-]+)['"]?\s*:/g)) {
            if (JETONS_RUNTIME.test(m[1])) continue;
            jetonsHorsSites += 1;
        }
    }

    /* ── La typographie : UNE famille, déclarée dans le fichier des jetons, et
           aucune origine externe.

       La feuille Google Fonts a été retirée (index.html) : elle coûtait une
       requête tierce bloquante au démarrage, deux origines ouvertes dans la
       CSP, et une dépendance réseau pour une application qui doit démarrer
       hors ligne (APK, téléviseur). Ces deux compteurs empêchent son retour
       sous une autre forme — le second attrape aussi une police déclarée dans
       une feuille, que le littéral seul ne verrait pas. */
    let famillesDeclarees = 0;
    for (const [f, t] of toutesLesFeuilles()) {
        if (f.endsWith(CHEMIN_JETONS)) continue;
        for (const m of t.matchAll(/font-family:\s*([^;}]+)/g)) {
            const valeur = m[1].trim();
            if (/^inherit\b/.test(valeur)) continue;        // hérite : rien de déclaré
            if (/^var\(--sh-font/.test(valeur)) continue;   // consomme le jeton
            famillesDeclarees += 1;
        }
    }
    // index.html est lu séparément (hors des racines explorées) et nettoyé de
    // ses commentaires : le commentaire qui EXPLIQUE le retrait de la feuille
    // Google nomme l'origine, ce n'est pas une référence. Même règle que
    // `cssSansCommentaires` — un exemple en commentaire n'est pas un usage.
    const indexHtml = fs.readFileSync(path.resolve(RACINE, 'index.html'), 'utf8')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');
    const policesExternes = compte(/fonts\.googleapis|fonts\.gstatic/g, () => true, [...textes])
        + (indexHtml.match(/fonts\.googleapis|fonts\.gstatic/g) || []).length;

    return {
        hexLitteraux, taillesLitterales, graissesLitterales, rayonsLitteraux,
        capitalesMetadonnees, courbesNues, courbesEaseIn, animationsInfinies,
        ombresAnimees, filtresAnimes, hoverNonGardes, presseAnimee, vhResiduels,
        jetonsEchelle, jetonsCourbes, jetonsRayons, jetonsCouleurs, jetonsAccent,
        famillesDeclarees, policesExternes, taillesSousPlancher, jetonsHorsSites,
        etatsDistincts: etats.size, etatsHorsVocabulaire,
    };
}

/* ══════════════════════════════════════════════════════════════════════
   LE CLIQUET
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Plafonds — ne peuvent que descendre.
 * Les valeurs datent du 11 septembre 2026, mesurées sur la branche `main`
 * après les peaux du lecteur et la coquille GSM.
 */
const PLAFONDS = {
    // 613 → 533 : les quatre teintes système Apple (rouge, vert, bleu, orange)
    // sont devenues des jetons — elles ne changent pas d'un thème à l'autre,
    // donc le remplacement ne bouge AUCUN pixel (voir
    // scripts/codemod-couleurs.mjs). Le reste est une dette de teintes
    // intermédiaires qui demanderait un arbitrage par écran.
    // 533 → 530 : `var(--sh-color-danger, #ff5c7a)` portait un repli qui
    // CONTREDISAIT le jeton (le jeton vaut #ff453a). Un repli qui n'est pas la
    // valeur du jeton n'est pas une sécurité, c'est une deuxième vérité qui ne
    // se déclenche jamais — jusqu'au jour où elle se déclenche.
    // 530 → 516 : deux teintes de la marque deviennent des jetons — l'étoile de
    // notation (`#ffd600`, 8 hexadécimaux et 3 triplets alpha) et l'indice
    // d'action (`#38bdf8`, 13 et 11). Le plafond baisse de 35 littéraux et
    // remonte de 21 écritures de jeton du même coup — c'est le mouvement
    // attendu, et non une amélioration nette de 35.
    hexLitteraux: 516,
    // 448 → 100 : 152 tailles valaient EXACTEMENT un échelon (jeton, aucun
    // pixel ne bouge) et 196 étaient sous le plancher de 12 px (elles
    // remontent à `--sh-text-xs`). Les 100 qui restent sont les valeurs
    // intermédiaires — 12,5 · 13,5 · 14 · 14,5 · 16 · 18 · 19 · 20 · 24 · 26 ·
    // 32 · 34 · 38 · 42 — qui demandent un choix entre deux échelons par
    // mise en page ; elles attendent une passe VISUELLE, pas un codemod.
    taillesLitterales: 100,
    // 316 → 83 : 233 graisses valaient un échelon exact (dont 800, absent du
    // barème alors que 41 déclarations l'employaient — il y est désormais).
    // Les 83 restantes sont les demis-marches 750/650/550/450/850, qui
    // n'existent dans AUCUNE police de plateforme : le moteur les ramène déjà
    // à la plus proche, et les nommer changerait le rendu Apple.
    graissesLitterales: 83,
    // 447 → 243. Attention : les 447 d'origine étaient FAUX — 202 d'entre eux
    // étaient déjà des jetons, comptés comme littéraux à cause du défaut de
    // motif décrit plus bas. Le vrai point de départ était 445, et 202
    // déclarations ont été converties (voir scripts/codemod-rayons.mjs).
    rayonsLitteraux: 243,
    // 27 → 0 expliquée. Les deux capitales qui restent sont nommées dans
    // `CAPITALES_EXEMPTEES`, avec leur raison : la casse peut servir une
    // structure (un en-tête de colonne) ou un contrôle, jamais meubler.
    capitalesMetadonnees: 0,
    // 753 → 0 : le `ease` nu du navigateur a disparu des feuilles. 747
    // transitions consomment `var(--sh-ease-out)` et 6 animations sans fin
    // passent à `linear` (une courbe d'accélération sur une boucle produit un
    // à-coup à chaque tour). Le compte est revenu à zéro : ce plafond ne peut
    // plus qu'être reconquis s'il remonte.
    courbesNues: 0,
    courbesEaseIn: 0,
    animationsInfinies: 14,
    /* 145 → 66 → 0. Les listes `transition` nommaient `box-shadow` cent
       quarante-cinq fois ; dans cent dix-sept cas AUCUN état ne changeait
       l'ombre — la transition n'avait jamais rien animé (même famille que les
       47 déclarations mortes du postmortem : une déclaration qui ne se
       déclenche jamais, invisible en recette). Les 66 restants ANIMAIENT
       vraiment une ombre qui s'allume, et ils sont partis au commit suivant.

       Le principe, maintenant tenu à zéro : **une ombre est un ÉTAT, pas un
       mouvement**. Elle change avec l'état, sans fondu — le déplacement
       (`transform`) porte le mouvement, l'ombre dit seulement « cette surface
       est levée ». Une ombre animée coûte un repaint par image de toute la
       zone floutée, sur les appareils les plus faibles du parc (le WebView
       d'un téléviseur), pour un effet que l'œil attribue au déplacement. */
    ombresAnimees: 0,
    /* 79 → 18 → 0, pour la même raison, en pire : un `filter` animé repaint la
       zone à chaque image, et c'est la propriété la plus chère de la liste.
       Les 23 flous qui restaient étaient tous le MÊME motif — un élément déjà
       invisible (opacité 0) qui se défloute en apparaissant. Le fondu et le
       déplacement portaient déjà l'apparition : le flou a été retiré, pas
       remplacé. Les flous STATIQUES (halo d'ambiance, affiche verrouillée,
       console) restent : ils ne coûtent rien par image puisqu'ils ne bougent
       pas. */
    filtresAnimes: 0,
    /* 230 → 0 : chaque règle `:hover` du dépôt est désormais dans un
       `@media (hover: hover)`. Un survol non gardé ne fait pas que ne pas
       s'appliquer sur un téléphone : il COLLE après un tap — l'élément garde
       son état de survol jusqu'au tap suivant — et il promet une affordance
       qui n'existe pas. Les seules règles laissées dehors sont celles d'un
       bloc `(hover: none)`, qui NEUTRALISE exprès (le doigt n'a pas de survol). */
    hoverNonGardes: 0,
    vhResiduels: 0,
    // 1 → 0 : la famille est déclarée UNE fois (public/design-system/tokens.css)
    // et les six feuilles qui réécrivaient leur propre pile (dont une avec un
    // `!important`) consomment le jeton. `font-family: inherit` n'est pas une
    // déclaration de famille : c'est un héritage, et il reste légitime.
    famillesDeclarees: 0,
    // 1 → 0 : la feuille Google Fonts est retirée d'index.html, avec ses deux
    // `preconnect` et les deux origines qu'elle ouvrait dans la CSP.
    policesExternes: 0,
    // 196 → 0 : toute taille littérale sous 12 px est remontée au plancher par
    // scripts/codemod-echelle-typographique.mjs. Un texte de 9 px posé sur une
    // affiche n'est pas petit : il est illisible.
    taillesSousPlancher: 0,
    // 0 : aucun jeton n'est redéclaré hors du fichier des jetons, du préréglage
    // clair et du mode TV. Une quatrième adresse ferait une deuxième vérité.
    jetonsHorsSites: 0,
    // 22 : le vocabulaire des états tel qu'il est MESURÉ. C'est un plafond et
    // non une cible : un synonyme de plus (`.is-opened` à côté de `.--open`)
    // échoue, et chaque unification fait baisser le chiffre.
    etatsDistincts: 22,
    // 0 : tout état nommé vient du vocabulaire fermé, ou d'une exception
    // nommée ici même. `has-events` en est une — un jour de calendrier qui
    // porte des événements, pas un état d'interface.
    etatsHorsVocabulaire: 0,
};

/**
 * Planchers — ne peuvent que monter.
 * Ce sont les seuls chiffres du dépôt qui doivent grandir : la consommation.
 */
const PLANCHERS = {
    // 0 → 349 : l'échelle typographique sort de terre (voir
    // scripts/codemod-echelle-typographique.mjs pour la règle appliquée).
    jetonsEchelle: 349,
    // 537 → 1290 (11 septembre), puis 1290 → 1069 (12 septembre).
    //
    // Le chiffre du 11 septembre mesurait les 753 `ease` nus devenus des jetons
    // (scripts/codemod-courbes.mjs). Il a baissé deux fois le 12, en deux
    // commits, parce que le prune des ombres et des flous animés a retiré 223
    // déclarations qui consommaient chacune un `var(--sh-ease-out)`.
    //
    // UN PLANCHER D'USAGES EST SENSIBLE À CE QUI DISPARAÎT, et c'est une
    // faiblesse de sa forme, pas de son intention : ce qu'il doit prouver, c'est
    // que la famille est CONSOMMÉE (1 067 usages le prouvent largement), pas
    // qu'un nombre de déclarations existe. Le laisser à 1 290 ferait échouer la
    // chaîne sur une simplification juste — et un contrôle qui échoue sur du
    // bon travail est un contrôle qu'on apprend à contourner.
    jetonsCourbes: 1069,
    // 3 → 205 : les paliers de rayon sont désormais consommés. Ce plancher-là
    // était le plus bas du dépôt, et c'était le symptôme : le barème existait,
    // il était juste, et personne ne s'en servait.
    jetonsRayons: 205,
    // 11 → 115 : les 80 teintes système ci-dessus, plus les triplets -rgb qui
    // donnent enfin un chemin à l'alpha (quarante-neuf `rgba(255, 159, 10, …)`
    // écrits à la main).
    // 115 → 116 → 151 : les teintes système, puis les deux teintes de la marque
    // (l'étoile de notation et l'indice d'action, 35 littéraux remplacés).
    jetonsCouleurs: 151,
    jetonsAccent: 2,
    // 18 → 102 : le compteur est passé des RÈGLES aux SÉLECTEURS (voir plus
    // haut), et la couverture est montée de 17 à 102 surfaces pressables — la
    // coquille GSM était couverte, tout le CONTENU qu'on touche (cartes,
    // rangées, boutons de média) ne l'était pas. Maintenant que le survol est
    // gardé, ces surfaces n'auraient plus aucun retour au doigt.
    presseAnimee: 102,
};

/* ══════════════════════════════════════════════════════════════════════
   OÙ EN EST CHAQUE CHANTIER — le départ, le jour, ce qui reste
   ══════════════════════════════════════════════════════════════════════

   Un cliquet dit « c'est vert aujourd'hui ». Il ne dit pas d'où l'on vient, et
   c'est pourtant la question qu'on repose à chaque relecture : 516 hexadécimaux
   qui restent, est-ce peu ou beaucoup ? La réponse est dans le DÉPART — et le
   départ ne se mesure pas, il se DÉCLARE : un instrument ne lit que l'arbre
   qu'il a sous les yeux.

   Trois origines, et elles ne se mélangent pas :

     'audit'   le chiffre vient de l'audit qui a ouvert le chantier, avant que
               ce contrôle existe (docs/IDENTITE_VISUELLE.md).
     'relevé'  le chiffre est ce que CE compteur mesurait à la création du
               cliquet (branche main, 12 septembre) — comparable à lui, à la
               définition près. Le rapport les marque d'un `°`.
     'garde'   il n'y a pas de descente à décrire : le compteur TIENT un niveau
               (14 boucles légitimes, 22 noms d'états) ou interdit une écriture
               (0). Lui donner un « départ » égal au jour laisserait croire
               qu'une progression a eu lieu.

   Trois départs portent une exception NOMMÉE, parce que la taire ferait un
   chiffre faux : les 447 rayons de l'audit en comptaient 202 déjà convertis
   (le vrai départ est 445), les 10 `ease-in` de l'audit n'existaient pas (le
   motif comptait `ease-in-out`, qui est légitime), et `presseAnimee` a changé
   de DÉFINITION en route (des règles, puis des sélecteurs) — 18 → 102 n'est
   donc pas un gain de 84 surfaces à lui seul.

   Ce que ces départs déclarent est vérifié plus bas, avec les compteurs : un
   compteur sans axe, un compteur rangé deux fois, un départ qui contredit le
   sens du compteur font échouer la chaîne. Un rapport incomplet est un rapport
   qu'on croit complet.
*/
const DEPARTS = {
    hexLitteraux: { depart: 613, origine: 'audit' },
    taillesLitterales: { depart: 448, origine: 'audit' },
    graissesLitterales: { depart: 316, origine: 'audit' },
    rayonsLitteraux: {
        depart: 445, origine: 'audit',
        note: "l'audit annonçait 447 : 202 d'entre eux étaient déjà des jetons, comptés comme des littéraux par un motif faux",
    },
    capitalesMetadonnees: { depart: 27, origine: 'audit' },
    courbesNues: { depart: 753, origine: 'audit' },
    courbesEaseIn: {
        depart: 0, origine: 'garde',
        note: "l'audit en annonçait 10 : son motif comptait `ease-in-out`, qui est légitime au déplacement",
    },
    animationsInfinies: {
        depart: 14, origine: 'garde',
        note: "six boucles d'ambiance sont parties ; les 14 qui restent disent « ça travaille »",
    },
    ombresAnimees: { depart: 145, origine: 'relevé' },
    filtresAnimes: { depart: 79, origine: 'relevé' },
    hoverNonGardes: { depart: 230, origine: 'relevé' },
    vhResiduels: { depart: 0, origine: 'garde' },
    famillesDeclarees: { depart: 1, origine: 'audit' },
    policesExternes: { depart: 1, origine: 'audit' },
    taillesSousPlancher: { depart: 196, origine: 'audit' },
    jetonsHorsSites: { depart: 0, origine: 'garde' },
    etatsDistincts: {
        depart: 22, origine: 'garde',
        note: 'le vocabulaire est RELEVÉ, pas visé : un synonyme de plus échoue, et chaque unification fait baisser le chiffre',
    },
    etatsHorsVocabulaire: { depart: 0, origine: 'garde' },
    jetonsEchelle: { depart: 0, origine: 'audit' },
    jetonsCourbes: {
        depart: 537, origine: 'audit',
        note: 'il est DESCENDU deux fois (1290 → 1069) parce qu\'un prune juste a retiré 223 déclarations qui le consommaient — un plancher d\'usages est sensible à ce qui disparaît',
    },
    jetonsRayons: { depart: 3, origine: 'audit' },
    jetonsCouleurs: { depart: 11, origine: 'audit' },
    jetonsAccent: { depart: 2, origine: 'relevé' },
    presseAnimee: {
        depart: 18, origine: 'relevé', redefini: true,
        note: 'comptait des RÈGLES, compte des SÉLECTEURS : la couverture est bien passée de 17 à 102 surfaces, mais le saut de 18 à 102 mélange la mesure et le travail',
    },
};

/**
 * Les axes — chaque compteur appartient à un et un seul chantier.
 *
 * Les six premiers suivent l'ordre du chantier de docs/IDENTITE_VISUELLE.md
 * (§ Le chantier, et son ordre). Le septième ne vient d'aucune étape : c'est la
 * cohérence qu'on ne range nulle part — le vocabulaire des états et les sources
 * de vérité des jetons.
 */
const AXES = [
    {
        etape: '1', nom: 'Typographie',
        compteurs: ['taillesLitterales', 'graissesLitterales', 'taillesSousPlancher',
                    'famillesDeclarees', 'policesExternes', 'jetonsEchelle'],
    },
    { etape: '2', nom: 'Capitales', compteurs: ['capitalesMetadonnees'] },
    {
        etape: '3', nom: 'Couleurs et rayons',
        compteurs: ['hexLitteraux', 'rayonsLitteraux', 'jetonsCouleurs', 'jetonsAccent', 'jetonsRayons'],
    },
    {
        etape: '4', nom: 'Courbes et boucles',
        compteurs: ['courbesNues', 'courbesEaseIn', 'animationsInfinies', 'jetonsCourbes'],
    },
    { etape: '5', nom: 'Ombres et flous animés', compteurs: ['ombresAnimees', 'filtresAnimes'] },
    { etape: '6', nom: 'Survol et toucher', compteurs: ['hoverNonGardes', 'presseAnimee', 'vhResiduels'] },
    {
        etape: '7', nom: 'États et sources de vérité',
        compteurs: ['etatsDistincts', 'etatsHorsVocabulaire', 'jetonsHorsSites'],
    },
];

/**
 * Ce que ce contrôle ne tient PAS, et où c'est tenu.
 *
 * Un rapport de progression qui laisse croire qu'il couvre tout le sujet est le
 * défaut que ce dépôt appelle un vert qui ment : ces trois-là sont mesurés, mais
 * ailleurs — et l'audit les nomme comme des chantiers.
 */
const HORS_CONTROLE = [
    'le verre — 10 `backdrop-filter` pour un plafond de 10, saturé · scripts/css-hygiene-check.mjs',
    'le budget de démarrage — un kilo de marge gzip · scripts/poids-check.mjs',
    "View Transitions — l'API est au-delà du plancher du parc (Chromium 108) · scripts/plancher-navigateur-check.mjs",
];

const LIBELLES = {
    hexLitteraux: 'hexadécimaux écrits en clair',
    taillesLitterales: 'font-size littéraux',
    graissesLitterales: 'font-weight littéraux',
    rayonsLitteraux: 'border-radius littéraux',
    capitalesMetadonnees: 'étiquettes de métadonnées en capitales',
    courbesNues: 'transitions sur `ease` nu',
    courbesEaseIn: 'transitions sur `ease-in`',
    animationsInfinies: 'animations sans fin',
    ombresAnimees: 'transitions de box-shadow',
    filtresAnimes: 'transitions de filter',
    hoverNonGardes: ':hover non gardés (mortels au toucher)',
    vhResiduels: 'vh résiduels dans les modales',
    famillesDeclarees: 'familles de police déclarées hors du fichier de jetons',
    policesExternes: 'références à une origine de police externe',
    taillesSousPlancher: 'tailles de texte sous le plancher de 12 px',
    jetonsHorsSites: 'jetons redéclarés hors des trois sites autorisés',
    etatsDistincts: 'noms de classes d\'état distincts',
    etatsHorsVocabulaire: 'états hors du vocabulaire fermé',
    presseAnimee: 'retours au toucher animés',
    jetonsEchelle: 'usages de var(--sh-text-*)',
    jetonsCourbes: 'usages de var(--sh-ease-*)',
    jetonsRayons: 'usages de var(--sh-radius-*)',
    jetonsCouleurs: 'usages de var(--sh-color-*)',
    jetonsAccent: 'usages de var(--sh-accent*)',
};

const mesures = mesurer();
const problemes = [];
const progres = [];

/* ── Le rapport est un compteur, et il se vérifie.

   Quatre façons de le rendre faux, refusées ici plutôt que dans la tête du
   lecteur : un compteur mesuré que nul axe ne range (il disparaît du rapport),
   un compteur rangé deux fois (il est compté double dans le reste), un départ
   qui contredit le sens annoncé (un plafond dont le « départ » serait sous la
   valeur du jour décrit une descente qui n'a pas eu lieu), et — le sens même
   de cette famille de contrôles — un compteur SANS point de départ déclaré, qui
   ne peut pas dire s'il progresse. */
const TOUS = { ...PLAFONDS, ...PLANCHERS };
const GARDES = new Set(Object.keys(DEPARTS).filter(c => DEPARTS[c].origine === 'garde'));
{
    const ranges = new Set();
    for (const axe of AXES) {
        for (const cle of axe.compteurs) {
            if (!(cle in TOUS)) {
                problemes.push(`Axe « ${axe.nom} » : « ${cle} » n'est pas un compteur mesuré.`);
                continue;
            }
            if (ranges.has(cle)) {
                problemes.push(`« ${cle} » est rangé dans deux axes : le reste de l'un des deux serait compté double.`);
            }
            ranges.add(cle);
        }
    }
    for (const cle of Object.keys(TOUS)) {
        if (!ranges.has(cle)) {
            problemes.push(`« ${cle} » est mesuré mais n'est rangé dans aucun axe : il manquerait au rapport.`);
        }
        if (!DEPARTS[cle]) {
            problemes.push(`« ${cle} » n'a pas de point de départ déclaré : on ne saurait pas s'il progresse.`);
        }
    }
    for (const [cle, dep] of Object.entries(DEPARTS)) {
        if (!(cle in TOUS)) {
            problemes.push(`Un départ est déclaré pour « ${cle} », qui n'est mesuré nulle part.`);
            continue;
        }
        const jour = mesures[cle];
        if (cle in PLAFONDS && dep.depart < jour) {
            problemes.push(
                `« ${cle} » : départ ${dep.depart}, aujourd'hui ${jour}. Un plafond ne remonte pas — ` +
                `c'est le DÉPART déclaré qui est faux, pas la mesure.`
            );
        }
        if (cle in PLANCHERS && dep.depart > jour) {
            problemes.push(
                `« ${cle} » : départ ${dep.depart}, aujourd'hui ${jour}. Une consommation ne baisse pas ` +
                `toute seule — soit un composant a cessé de consommer le jeton, soit le DÉPART déclaré est faux.`
            );
        }
    }
}

/* `--rapport` : où en est chaque chantier — le départ, le jour, ce qui reste —
   puis la table brute, pour caler un plafond ou un plancher dans le commit qui
   prouve la descente. Sans lui, on ne saurait pas de combien baisser. */
if (process.argv.includes('--rapport')) {
    console.log('OÙ EN EST CHAQUE CHANTIER');
    console.log('=========================\n');

    let atterris = 0;
    let deGarde = 0;
    let restantTotal = 0;
    const enCours = [];

    for (const axe of AXES) {
        const aConvertir = axe.compteurs.filter(c => c in PLAFONDS && !GARDES.has(c));
        const reste = aConvertir.reduce((n, c) => n + mesures[c], 0);
        let etat;
        if (!aConvertir.length) { etat = 'garde — ce chantier tient un niveau'; deGarde += 1; }
        else if (reste === 0) { etat = 'atterri'; atterris += 1; }
        else { etat = `${reste} à convertir`; enCours.push({ nom: axe.nom, reste }); restantTotal += reste; }

        console.log(`  ${axe.etape} · ${axe.nom} — ${etat}`);

        for (const cle of axe.compteurs) {
            const dep = DEPARTS[cle];
            const jour = mesures[cle];
            const estPlafond = cle in PLAFONDS;
            const sens = `${estPlafond ? 'plafond' : 'plancher'} ${estPlafond ? PLAFONDS[cle] : PLANCHERS[cle]}`;
            const marque = dep.origine === 'relevé' ? '°' : ' ';
            /* Les deux formes font la MÊME largeur, sinon la colonne des
               valeurs se décale exactement sur les compteurs de garde — et un
               rapport dont les colonnes sautent se relit deux fois. */
            const debut = dep.origine === 'garde'
                ? `niveau`.padEnd(6) + marque + '  '
                : String(dep.depart).padStart(6) + marque + ' →';
            const suite = [];
            if (dep.redefini) suite.push('compteur redéfini');
            if (estPlafond && !GARDES.has(cle)) suite.push(jour ? `reste ${jour}` : 'atterri');
            else if (!estPlafond) suite.push(dep.depart === jour ? 'aucun mouvement' : `+${jour - dep.depart} usages`);
            else suite.push('niveau tenu');
            console.log(
                '      ' + LIBELLES[cle].padEnd(56) + debut +
                String(jour).padStart(7) + '   ' + sens.padEnd(13) +
                '  ' + suite.join(' · ')
            );
            if (dep.note) console.log('          ↳ ' + dep.note);
        }
        console.log('');
    }

    console.log(`  Bilan : ${atterris} chantiers atterris · ${deGarde} de garde · ${enCours.length} en cours — ` +
                `${restantTotal} écritures à convertir :`);
    for (const e of enCours) console.log(`    · ${e.nom} : ${e.reste}`);
    console.log(`\n  ${GARDES.size} des ${Object.keys(TOUS).length} compteurs sont des gardes : ils tiennent un niveau,`);
    console.log("  ils ne descendent pas à zéro — une boucle qui dit « ça travaille » n'est pas une dette.\n");
    console.log("  Les départs viennent de l'audit qui a ouvert chaque chantier (docs/IDENTITE_VISUELLE.md) ;");
    console.log('  ° marque ceux relevés par ce cliquet à sa création. Départ corrigé ou compteur redéfini :');
    console.log('  la raison est écrite sous le compteur.\n');
    console.log('  Hors de ce contrôle :');
    for (const h of HORS_CONTROLE) console.log('    · ' + h);
    console.log('');

    /* ── La table brute, pour caler un chiffre dans le commit qui le change. ── */
    console.log('TABLE BRUTE');
    console.log('compteur'.padEnd(32), 'valeur'.padStart(7), '  sens');
    for (const [cle, plafond] of Object.entries(PLAFONDS)) {
        const v = mesures[cle];
        const fleche = v < plafond ? '↓ à baisser' : v > plafond ? '↑ DÉPASSÉ' : '';
        console.log(cle.padEnd(32), String(v).padStart(7), `  plafond ${plafond} ${fleche}`);
    }
    for (const [cle, plancher] of Object.entries(PLANCHERS)) {
        const v = mesures[cle];
        const fleche = v > plancher ? '↑ à relever' : v < plancher ? '↓ MANQUANT' : '';
        console.log(cle.padEnd(32), String(v).padStart(7), `  plancher ${plancher} ${fleche}`);
    }
    process.exit(0);
}

for (const [cle, plafond] of Object.entries(PLAFONDS)) {
    const valeur = mesures[cle];
    if (valeur > plafond) {
        problemes.push(
            `${LIBELLES[cle]} : ${valeur}, plafond ${plafond} (+${valeur - plafond}). ` +
            `Ce compteur ne peut que descendre — consommez le jeton au lieu d'écrire la valeur.`
        );
    } else if (valeur < plafond) {
        progres.push(`plafond à baisser — ${LIBELLES[cle]} : ${valeur} (plafond ${plafond})`);
    }
}

for (const [cle, plancher] of Object.entries(PLANCHERS)) {
    const valeur = mesures[cle];
    if (valeur < plancher) {
        problemes.push(
            `${LIBELLES[cle]} : ${valeur}, plancher ${plancher}. ` +
            `Un jeton déclaré ne sert à rien tant qu'aucun composant ne le consomme.`
        );
    } else if (valeur > plancher) {
        progres.push(`plancher à relever — ${LIBELLES[cle]} : ${valeur} (plancher ${plancher})`);
    }
}

if (problemes.length) {
    console.error(`Système de design (déclaré vs consommé) : ${problemes.length} problème(s).\n`);
    for (const p of problemes) console.error('  ✖ ' + p);
    console.error('');
    process.exit(1);
}

console.log(
    `Système de design : ${Object.keys(PLAFONDS).length} plafonds tenus, ` +
    `${Object.keys(PLANCHERS).length} planchers tenus.`
);
if (progres.length) {
    console.log('\nDes compteurs ont bougé — baissez le plafond (ou relevez le plancher) dans ce commit :');
    for (const p of progres) console.log('  ↘ ' + p);
}
/* Une ligne de sortie, pas une phrase : le rapport par axe existe, et personne
   ne le trouve s'il faut lire le script pour savoir qu'il est là. */
console.log('Où en est chaque chantier (départ, jour, reste) : npm run test:design -- --rapport');
