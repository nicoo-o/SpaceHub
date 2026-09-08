/**
 * SpaceHub — greffon d'exemple
 *
 * POURQUOI IL EXISTE. Le seul greffon livré jusqu'ici était celui des notes :
 * trois fournisseurs, deux API externes, une recherche de repli. Excellent
 * comme produit, illisible comme point de départ. Celui-ci ne fait rien
 * d'utile — c'est le but. Il montre, dans l'ordre, tout ce qu'un greffon peut
 * faire, et rien d'autre.
 *
 * IL EST DÉSACTIVÉ PAR DÉFAUT (`isDefault: false`). Un exemple qui s'installe
 * tout seul et ajoute une entrée dans les menus de tout le monde n'est plus un
 * exemple, c'est une nuisance.
 *
 * CE QU'IL FAUT RETENIR EN LE LISANT
 * ----------------------------------
 *   1. TOUT passe par `ctx`. Pas de `window.SpaceHub`, pas de `fetch` global,
 *      pas de `localStorage`. Ce n'est pas une convention de style : le
 *      catalogue INSPECTE la source avant de la charger et refuse ces accès.
 *   2. Une permission non déclarée fait LEVER l'appel correspondant. On déclare
 *      ce dont on a besoin, et rien de plus — chaque permission de trop est une
 *      raison de plus pour l'utilisateur de refuser.
 *   3. Ce qu'on installe dans `onEnable`, on le retire dans `onDisable`. Le SDK
 *      défait automatiquement les contributions enregistrées par `ctx.sdk.*`,
 *      mais pas ce qu'on aurait posé soi-même ailleurs.
 */

'use strict';

const PLUGIN_ID = 'spacehub.exemple';

const manifest = {
    id: PLUGIN_ID,
    name: 'Exemple — point de départ pour écrire un greffon',
    version: '1.0.0',
    // La MAJEURE doit correspondre à celle du SDK, sinon le greffon est refusé
    // au chargement, avec un message qui le dit. Voir core/PluginManager.js.
    apiVersion: '2.0.0',
    author: 'SpaceHub',
    description: 'Ne fait rien d\'utile, et le fait complètement : widget, action de menu, réglages, journal.',
    icon: '📘',
    // Désactivé par défaut : voir l'en-tête.
    isDefault: false,

    // On ne demande QUE ce qu'on utilise. `ui.dashboard.write` pour le widget,
    // `jellyfin.items.read` pour lire une fiche. Pas de réseau : ce greffon
    // n'appelle personne, il ne demande donc pas `network.external.read`.
    permissions: ['ui.dashboard.write', 'jellyfin.items.read'],

    // Types réellement fournis. En déclarer un qu'on ne fournit pas trompe la
    // console des greffons et tout code qui s'y fierait.
    contributions: ['widget', 'action'],

    // Réglages rendus par l'hôte à partir de cette seule déclaration : aucun
    // code d'interface à écrire, et rien à modifier dans l'application.
    settingsSchema: [
        {
            cle: 'salutation',
            type: 'texte',
            titre: 'Texte affiché par le widget',
            defaut: 'Bonjour',
            invite: 'Bonjour',
        },
        {
            cle: 'bavard',
            type: 'booleen',
            titre: 'Écrire dans la console à chaque action',
            defaut: false,
        },
    ],

    /**
     * Appelé avant l'activation. Doit LEVER si le greffon ne peut pas
     * fonctionner — c'est ce qui alimente l'état de santé affiché dans la
     * console des greffons.
     */
    healthCheck: async (ctx) => {
        if (!ctx?.settings) throw new Error('Stockage indisponible.');
    },

    onEnable: async (ctx) => {
        // ── Un widget de tableau de bord ──
        // La classe est construite par l'hôte au moment du rendu. Elle doit
        // exposer `render()` renvoyant un élément ou une chaîne HTML ; ici on
        // renvoie un élément, ce qui évite toute question d'échappement.
        class WidgetExemple {
            render() {
                const bloc = document.createElement('div');
                bloc.className = 'sh-widget';
                const titre = document.createElement('h2');
                titre.className = 'sh-widget__title';
                // `textContent` : cette valeur vient des réglages, donc de
                // l'utilisateur. Elle ne passe jamais par `innerHTML`.
                titre.textContent = ctx.settings.get('salutation', 'Bonjour');
                bloc.appendChild(titre);
                return bloc;
            }
        }
        ctx.sdk.registerWidget('exemple-salutation', WidgetExemple);

        // ── Une entrée dans le menu contextuel des cartes ──
        // `convient` filtre les médias concernés ; sans lui, l'entrée apparaît
        // partout. `executer` reçoit la carte telle que l'interface la connaît.
        ctx.sdk.registerContribution('action', {
            libelle: 'Exemple : afficher l\'identifiant',
            convient: (item) => Boolean(item?.id),
            executer: async (item) => {
                if (ctx.settings.get('bavard', false)) {
                    ctx.log.info('Action déclenchée sur', item?.id);
                }
                ctx.ui.toaster?.show?.(`Identifiant : ${item.id}`, 'info');
            },
        });

        ctx.log.info('Greffon d\'exemple activé.');
    },

    // Les contributions enregistrées par `ctx.sdk.*` sont retirées
    // automatiquement. On n'a donc rien à défaire ici — et surtout rien à
    // oublier. Ce crochet ne sert qu'à dire ce qui se passe.
    onDisable: async (ctx) => {
        ctx.log.info('Greffon d\'exemple désactivé ; ses contributions sont retirées par le SDK.');
    },
};

export default manifest;
