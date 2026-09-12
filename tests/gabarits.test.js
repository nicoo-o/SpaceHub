/**
 * Gabarits extraits — preuve d'identité octet pour octet.
 *
 * Quatre gros littéraux HTML ont été sortis de leur composant vers un module
 * dédié. C'est mécanique par construction (seule transformation appliquée au
 * texte : `this.` → `ctx.`), mais « mécanique » n'est pas « prouvé ».
 *
 * Ces tests comparent le HTML produit par les modules extraits à une empreinte
 * prise sur le code ORIGINAL, avant tout déplacement, avec un jeu de valeurs
 * fixe. `tests/fixtures/gabarits-reference.json` est cette empreinte : elle a
 * été générée depuis les littéraux d'origine, pas depuis les modules.
 *
 * Si un caractère change, ces tests tombent.
 */

import { describe, it, expect } from 'vitest';
import reference from './fixtures/gabarits-reference.json';
import { echapper, avecNeutres } from './helpers/neutre.js';

import { gabaritLecteur } from '../jellyfin/player/VideoPlayer.template.js';
import { gabaritBibliotheque } from '../ui/views/LibraryView.template.js';
import { gabaritFeuille } from '../ui/components/ModalSlideUpSheet.template.js';
import { gabaritConsoleModules } from '../ui/views/JellyfinConsoleModal.template.js';

describe('Gabarits extraits — le HTML n\'a pas bougé d\'un octet', () => {
    it('VideoPlayer.template.js — identique, aux cinq ajouts nommés près', () => {
        // Une seule divergence voulue depuis l'empreinte : le bouton
        // « bande-annonce suivante », ajouté au dock en remplacement du menu de
        // choix flottant que TrailerService affichait avant la lecture.
        //
        // La référence n'est PAS régénérée : régénérer une empreinte à chaque
        // changement revient à ne plus rien prouver. On applique la même
        // insertion à la référence, puis on exige l'égalité stricte — toute
        // AUTRE différence tombe.
        const attendu = reference['jellyfin/player/VideoPlayer.js'];
        const html = gabaritLecteur(avecNeutres({
            _escape: echapper, _volume: 0.8, _playbackRate: 1.25,
            _subOffset: -0.5, _aspectRatioIndex: 2,
            title: 'Le <Titre> & "Cie"', isEpisode: true, seriesName: 'Ma <Serie> & Co',
            episodeNumber: 'S02E07', episodeTitle: "L'<Episode> & suite", year: 2019,
        }, attendu.variablesLibres));

        const ANCRE = '<!-- Ancre Dépliante 1 : Épisodes (Séries) -->';
        expect(attendu.html, 'l\'ancre d\'insertion doit exister dans la référence')
            .toContain(ANCRE);

        // On extrait du HTML produit le bloc réellement inséré, entre le bouton
        // « épisode suivant » et l'ancre — plutôt que de le recopier ici, où il
        // se périmerait à la première retouche de l'icône.
        const MARQUE = '<!-- Bande-annonce suivante.';
        const debut = html.indexOf(MARQUE);
        const fin = html.indexOf(ANCRE);
        expect(debut, 'le bouton « bande-annonce suivante » doit être présent').toBeGreaterThan(0);
        expect(html).toContain('id="sh-btn-next-trailer"');
        expect(fin).toBeGreaterThan(debut);
        const insere = html.slice(debut, fin);

        // Ce que l'insertion doit garantir, et que l'égalité seule ne dirait pas.
        expect(insere).toContain('style="display:none;"');        // caché par défaut
        expect(insere).toContain('data-nav-focusable="true"');    // atteignable à la télécommande

        // TROISIÈME divergence voulue : la vignette de prévisualisation
        // (trickplay) ajoutée dans l'infobulle de la barre de progression.
        // Même méthode — on l'extrait du HTML produit et on l'applique à la
        // référence, plutôt que de régénérer celle-ci : toute AUTRE différence
        // doit continuer de faire tomber ce test.
        const ANCRE_TOOLTIP = '<span id="sh-tooltip-time">';
        expect(attendu.html, 'l\'infobulle horaire doit exister dans la référence')
            .toContain(ANCRE_TOOLTIP);

        const MARQUE_APERCU = '<!-- Vignette de prévisualisation.';
        const debutApercu = html.indexOf(MARQUE_APERCU);
        const finApercu = html.indexOf(ANCRE_TOOLTIP, debutApercu);
        expect(debutApercu, 'la vignette de prévisualisation doit être présente').toBeGreaterThan(0);
        expect(finApercu).toBeGreaterThan(debutApercu);
        const apercu = html.slice(debutApercu, finApercu);

        // Ce que l'insertion doit garantir :
        expect(apercu).toContain('id="sh-timeline-apercu"');
        expect(apercu).toContain('aria-hidden="true"');            // décorative
        expect(apercu, 'la vignette ne doit pas être focalisable')
            .not.toContain('data-nav-focusable');

        // QUATRIÈME divergence voulue : le bloc « Version » (sélecteur de
        // versions du média) et le bouton « Statistiques de lecture », ajoutés
        // au tiroir audio/sous-titres. Toujours la même méthode : on extrait du
        // HTML produit ce qui a été inséré et on l'applique à la référence.
        // Régénérer l'empreinte reviendrait à ne plus rien prouver.
        const ANCRE_DIAG = '                                </div>\n'
            + '                            </div>\n'
            + '                        </div>\n\n'
            + '                        <!-- Ancre Dépliante 3';
        expect(attendu.html, 'l\'ancre du tiroir « Vitesse & Réglages » doit exister dans la référence')
            .toContain(ANCRE_DIAG);

        const MARQUE_DIAG = '\n                                    <!-- Versions du média.';
        const debutDiag = html.indexOf(MARQUE_DIAG);
        const finDiag = html.indexOf(ANCRE_DIAG, debutDiag);
        expect(debutDiag, 'le bloc « Version » doit être présent').toBeGreaterThan(0);
        expect(finDiag).toBeGreaterThan(debutDiag);
        const diagnostic = html.slice(debutDiag, finDiag);

        // CE QUE CETTE MÉTHODE NE COUVRE PLUS. Un bloc extrait du HTML produit
        // puis appliqué à la référence est, par construction, égal à lui-même :
        // l'empreinte ne protège plus son CONTENU, seulement le reste du
        // gabarit. Chaque divergence nommée est donc un trou dans la preuve,
        // et il faut le refermer à la main — d'où les vérifications explicites
        // ci-dessous, qui épinglent ce qui compte dans le bloc inséré.
        expect(diagnostic).toContain('<span class="sh-settings-label">Version</span>');
        expect(diagnostic).toContain('<span class="sh-settings-label">Diagnostic</span>');
        expect(diagnostic).toContain('id="sh-player-versions-chips"');
        expect(diagnostic).toContain('>Statistiques de lecture</button>');
        expect(diagnostic).toContain('id="sh-player-versions-section"');
        expect(diagnostic, 'le sélecteur de versions est masqué tant qu\'il n\'y en a qu\'une')
            .toContain('style="display:none;"');
        expect(diagnostic).toContain('id="sh-btn-stats"');
        expect(diagnostic, 'le bouton de statistiques doit être atteignable à la télécommande')
            .toContain('data-nav-focusable="true"');

        // CINQUIÈME divergence voulue : la section « Minuteur de Sommeil »
        // dans le panneau des réglages du lecteur. `core/MinuteurSommeil.js`
        // existait, complet et testé, sans qu'aucune interface ne l'appelle —
        // cette section est sa seule porte d'entrée.
        //
        // Même méthode, pour la même raison : on extrait le bloc du HTML
        // produit et on l'applique à la référence. Régénérer l'empreinte
        // reviendrait à ne plus rien prouver du reste du gabarit.
        const MARQUE_SOMMEIL = '\n\n                                    <!-- Minuteur de sommeil.';
        const debutSommeil = html.indexOf(MARQUE_SOMMEIL);
        expect(debutSommeil, 'la section « Minuteur de Sommeil » doit être présente')
            .toBeGreaterThan(0);
        const finSommeil = html.indexOf('\n                                </div>', debutSommeil);
        expect(finSommeil).toBeGreaterThan(debutSommeil);
        const sommeil = html.slice(debutSommeil, finSommeil);

        // Ce que l'insertion doit garantir, et que l'égalité seule ne dirait
        // pas — voir la remarque ci-dessus sur les trous de la preuve.
        expect(sommeil).toContain('id="sh-player-sommeil-chips"');
        expect(sommeil).toContain('id="sh-player-sommeil-etat"');
        expect(sommeil).toContain('data-sommeil="fin-titre"');
        expect(sommeil).toContain('data-sommeil="aucun"');
        expect(sommeil, 'la ligne d\'état doit être annoncée aux lecteurs d\'écran')
            .toContain('aria-live="polite"');
        // Chaque pastille doit être atteignable à la télécommande : une
        // commande qu'un téléviseur ne peut pas viser n'existe pas.
        const pastilles = sommeil.match(/<button[^>]*data-sommeil="[^"]*"/g) || [];
        expect(pastilles.length).toBeGreaterThanOrEqual(3);
        for (const p of pastilles) {
            expect(p).toContain('data-nav-focusable="true"');
            expect(p).toContain('tabindex="0"');
        }

        // L'ancre est la fin du bloc extrait lui-même : on réinsère le bloc
        // là où il commence dans la référence, c'est-à-dire juste après la
        // section « Format d'Image ».
        const ANCRE_SOMMEIL = html.slice(finSommeil, finSommeil + 200);
        expect(attendu.html, 'la fin du tiroir « Réglages » doit exister dans la référence')
            .toContain(ANCRE_SOMMEIL);

        const corrigee = attendu.html
            .replace(ANCRE, insere + ANCRE)
            .replace(ANCRE_TOOLTIP, apercu + ANCRE_TOOLTIP)
            .replace(ANCRE_DIAG, diagnostic + ANCRE_DIAG)
            .replace(ANCRE_SOMMEIL, sommeil + ANCRE_SOMMEIL);
        expect(html).toBe(corrigee);
    });

    it('LibraryView.template.js — identique, aux attributs dédoublonnés près', () => {
        // Seconde divergence voulue : les gabarits de cette vue portaient
        // `tabindex="0" data-nav-focusable="true"` ÉCRIT DEUX FOIS sur la même
        // balise, trace d'un ajout automatisé passé deux fois. Le parseur HTML
        // ignore le doublon, l'effet net était donc nul — mais on ne peut pas
        // lire un gabarit comme source de vérité quand il se contredit.
        //
        // La référence n'est PAS régénérée : on lui applique le même
        // dédoublonnage, puis on exige l'égalité stricte. Toute AUTRE
        // différence tombe.
        const attendu = reference['ui/views/LibraryView.js'];
        const html = gabaritBibliotheque(avecNeutres({
            _escape: echapper, _searchQuery: 'que<te & "x"',
            _sortBy: 'SortName,ProductionYear', _sortOrder: 'Descending',
            _viewMode: 'grid', _activeGenre: 'Dra<me', _activeStatus: 'vu',
            _alphabetFilter: 'M',
        }, attendu.variablesLibres));

        const DOUBLON = 'tabindex="0" data-nav-focusable="true" tabindex="0" data-nav-focusable="true"';
        expect(attendu.html, 'le doublon doit exister dans la référence').toContain(DOUBLON);
        const corrigee = attendu.html.split(DOUBLON)
            .join('tabindex="0" data-nav-focusable="true"');
        expect(html).toBe(corrigee);
    });

    it('ModalSlideUpSheet.template.js', () => {
        const attendu = reference['ui/components/ModalSlideUpSheet.js'];
        const html = gabaritFeuille(avecNeutres({
            _escape: echapper, _activeTab: 'apercu',
        }, attendu.variablesLibres));
        expect(html).toBe(attendu.html);
    });

    it('JellyfinConsoleModal.template.js — identique, aux échappements et à l\'avertissement près', () => {
        // Ce gabarit est le seul à différer de son état d'origine, et la
        // différence est voulue : `mod.icon` et `mod.name` partaient en HTML
        // sans échappement. Plutôt que d'accepter une divergence vague, le
        // test la nomme — il applique l'échappement attendu à la référence et
        // exige une égalité stricte ensuite. Toute AUTRE différence tombe.
        const attendu = reference['ui/views/JellyfinConsoleModal.js'];
        const html = gabaritConsoleModules(avecNeutres({
            _escape: echapper,
        }, attendu.variablesLibres));

        let corrigee = attendu.html;
        for (const i of [0, 1]) {
            for (const champ of ['icon', 'name']) {
                const brut = `<&"servarrIntegrations[${i}].${champ}">`;
                corrigee = corrigee.split(brut).join(echapper(brut));
            }
        }

        // SECONDE divergence voulue : l'avertissement d'approbation d'un
        // greffon. Il dit que les permissions décrivent une INTENTION et ne
        // contraignent rien — un greffon s'exécute dans la page, avec le même
        // accès que l'application. Même méthode que pour le lecteur : on
        // extrait le bloc du HTML produit et on l'applique à la référence,
        // plutôt que de régénérer celle-ci.
        const INDENT = ' '.repeat(28);
        const ANCRE_APPROBATION = `${INDENT}<button class="sh-console-action-btn sh-sdk-approve"`;
        const MARQUE_AVERTISSEMENT = `${INDENT}<!-- A2`;
        const debut = html.indexOf(MARQUE_AVERTISSEMENT);
        const fin = html.indexOf(ANCRE_APPROBATION, debut);
        expect(debut, 'l\'avertissement d\'approbation doit être présent').toBeGreaterThan(0);
        expect(fin).toBeGreaterThan(debut);
        const avertissement = html.slice(debut, fin);

        // Ce que ce bloc doit garantir, et que l'égalité seule ne dirait pas.
        // L'empreinte ne protège plus son contenu — il est extrait du HTML
        // produit, donc égal à lui-même par construction : ces vérifications
        // referment le trou à la main.
        expect(avertissement).toContain('class="sh-plugin-avertissement"');
        expect(avertissement, 'l\'avertissement doit dire que les droits sont les mêmes')
            .toContain('mêmes droits que SpaceHub');
        expect(avertissement, 'et qu\'une permission ne limite rien')
            .toContain('elles ne la limitent pas');
        expect(avertissement, 'un avertissement replié ne serait pas lu')
            .not.toContain('<details');

        // Le gabarit boucle sur les greffons : le bloc apparaît autant de fois
        // que le bouton. On l'applique donc à CHAQUE occurrence.
        expect(attendu.html.split(ANCRE_APPROBATION).length - 1)
            .toBe(html.split(ANCRE_APPROBATION).length - 1);
        corrigee = corrigee.split(ANCRE_APPROBATION).join(avertissement + ANCRE_APPROBATION);

        expect(html).toBe(corrigee);
    });
});

describe('Les modules de gabarit restent purs', () => {
    it('ne produisent que du texte, sans toucher au DOM', () => {
        // `document` n'existe pas dans cet environnement de test : si un
        // gabarit tentait de lire ou d'ecrire le DOM, l'appel echouerait ici.
        const html = gabaritBibliotheque(avecNeutres({
            _escape: echapper, _searchQuery: '', _sortBy: 'SortName',
            _sortOrder: 'Ascending', _viewMode: 'grid', _activeGenre: null,
            _activeStatus: null, _alphabetFilter: null,
        }, reference['ui/views/LibraryView.js'].variablesLibres));
        expect(typeof html).toBe('string');
        expect(html.length).toBeGreaterThan(1000);
        expect(typeof document).toBe('undefined');
    });
});
