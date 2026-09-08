/**
 * SpaceHub — rendu générique des réglages d'un greffon
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * `SettingsPanel.js` contenait, EN DUR, les deux champs du greffon de notes :
 *
 *     '#cfg-omdb-key'  → getPluginStorage('spacehub.ratings').set('omdbApiKey', …)
 *     '#cfg-tmdb-key'  → getPluginStorage('spacehub.ratings').set('tmdbApiKey', …)
 *
 * Le mécanisme de stockage était générique ; son interface ne l'était pas. Tout
 * nouveau greffon ayant besoin d'un réglage exigeait donc une modification de
 * l'application hôte — ce qui annule une bonne part de l'intérêt d'avoir des
 * greffons.
 *
 * Un manifeste déclare maintenant son `settingsSchema`, et ce module le rend.
 *
 * LE TYPE `secret` NE REVIENT JAMAIS DANS LE DOM
 * ----------------------------------------------
 * Un champ de mot de passe pré-rempli avec la vraie valeur la rend lisible :
 * par l'inspecteur, par le gestionnaire de mots de passe, par une extension.
 * Le champ reste donc VIDE, et son texte d'invite dit seulement qu'une clé est
 * enregistrée. On n'écrit que si l'utilisateur a tapé quelque chose — sans quoi
 * ouvrir puis fermer les réglages effacerait la clé.
 *
 * C'est déjà ce que faisait le code en dur pour OMDb. On le généralise, on ne
 * l'invente pas.
 */

'use strict';

/** Types acceptés dans un `settingsSchema`. */
export const TYPES = new Set(['texte', 'secret', 'booleen', 'nombre', 'select']);

/**
 * Valide un schéma. Un schéma invalide n'est pas rendu à moitié : on le refuse
 * en entier et on dit pourquoi, plutôt que d'afficher trois champs sur cinq.
 *
 * @param {Array} schema
 * @returns {{ valide: boolean, erreurs: string[] }}
 */
export function valider(schema) {
    const erreurs = [];
    if (!Array.isArray(schema)) return { valide: false, erreurs: ['Le schéma doit être un tableau.'] };
    const vues = new Set();
    for (const [i, champ] of schema.entries()) {
        const ou = `champ ${i + 1}`;
        if (!champ || typeof champ !== 'object') { erreurs.push(`${ou} : entrée invalide.`); continue; }
        if (typeof champ.cle !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(champ.cle)) {
            erreurs.push(`${ou} : clé absente ou invalide.`);
        } else if (vues.has(champ.cle)) {
            erreurs.push(`${ou} : clé « ${champ.cle} » en double.`);
        } else {
            vues.add(champ.cle);
        }
        if (!TYPES.has(champ.type)) erreurs.push(`${ou} : type « ${champ.type} » inconnu.`);
        if (champ.type === 'select' && !Array.isArray(champ.options)) {
            erreurs.push(`${ou} : un select exige un tableau d'options.`);
        }
    }
    return { valide: erreurs.length === 0, erreurs };
}

/**
 * Construit le formulaire d'un greffon.
 *
 * Tout est bâti par `document.createElement` et `textContent` : un libellé de
 * greffon est du texte tiers, il ne passe jamais par `innerHTML`.
 *
 * @param {Object} options
 * @param {string} options.pluginId
 * @param {Array} options.schema
 * @param {{get: Function, set: Function}} options.stockage
 * @returns {HTMLElement|null}
 */
export function construire({ pluginId, schema, stockage } = {}) {
    const validation = valider(schema);
    if (!validation.valide || !stockage) return null;

    const bloc = document.createElement('div');
    bloc.className = 'sh-greffon-reglages';
    bloc.dataset.pluginId = pluginId;

    for (const champ of schema) {
        const ligne = document.createElement('div');
        ligne.className = 'sh-form-group';

        const etiquette = document.createElement('label');
        etiquette.textContent = champ.titre || champ.cle;
        etiquette.setAttribute('for', `sh-gr-${pluginId}-${champ.cle}`);
        ligne.appendChild(etiquette);

        const controle = _controle(pluginId, champ, stockage);
        ligne.appendChild(controle);

        if (champ.aide) {
            const aide = document.createElement('p');
            aide.className = 'sh-form-hint';
            aide.textContent = champ.aide;
            ligne.appendChild(aide);
        }
        bloc.appendChild(ligne);
    }
    return bloc;
}

/**
 * Applique le formulaire au stockage du greffon.
 *
 * @returns {{ecrits: string[], ignores: string[]}} `ignores` liste les secrets
 *   laissés vides — ce n'est pas une erreur, c'est le cas normal quand on
 *   n'a pas voulu changer sa clé.
 */
export function appliquer(bloc, { schema, stockage } = {}) {
    const ecrits = [];
    const ignores = [];
    if (!bloc || !stockage) return { ecrits, ignores };

    for (const champ of schema || []) {
        const el = bloc.querySelector(`#sh-gr-${bloc.dataset.pluginId}-${champ.cle}`);
        if (!el) continue;

        if (champ.type === 'booleen') { stockage.set(champ.cle, el.checked === true); ecrits.push(champ.cle); continue; }
        if (champ.type === 'nombre') {
            // UN CHAMP VIDE N'EST PAS ZÉRO. Un `<input type="number">` dont on
            // efface le contenu — ou dans lequel on tape autre chose qu'un
            // nombre, ce que le navigateur refuse en rendant `value` vide —
            // donne `Number('') === 0`, qui est parfaitement fini. On écrivait
            // donc 0 par-dessus la valeur de l'utilisateur, en silence.
            const brut = String(el.value ?? '').trim();
            if (!brut) { ignores.push(champ.cle); continue; }
            const n = Number(brut);
            if (Number.isFinite(n)) { stockage.set(champ.cle, n); ecrits.push(champ.cle); }
            else ignores.push(champ.cle);
            continue;
        }
        const valeur = String(el.value || '').trim();
        if (champ.type === 'secret' && !valeur) {
            // Champ laissé vide : on NE TOUCHE PAS à la clé enregistrée.
            // Écrire la chaîne vide ici effacerait la configuration à chaque
            // ouverture-fermeture de l'écran des réglages.
            ignores.push(champ.cle);
            continue;
        }
        stockage.set(champ.cle, valeur);
        ecrits.push(champ.cle);
    }
    return { ecrits, ignores };
}

// ─── Interne ────────────────────────────────────────────────────────────────

function _controle(pluginId, champ, stockage) {
    const id = `sh-gr-${pluginId}-${champ.cle}`;
    const actuelle = stockage.get(champ.cle, champ.defaut ?? null);

    if (champ.type === 'select') {
        const select = document.createElement('select');
        select.className = 'sh-input';
        select.id = id;
        for (const option of champ.options) {
            const o = document.createElement('option');
            // Une option peut être une chaîne ou { valeur, libelle }.
            o.value = String(option?.valeur ?? option);
            o.textContent = String(option?.libelle ?? option);
            if (o.value === String(actuelle)) o.selected = true;
            select.appendChild(o);
        }
        return select;
    }

    const input = document.createElement('input');
    input.className = champ.type === 'booleen' ? 'sh-settings-toggle' : 'sh-input';
    input.id = id;
    input.setAttribute('data-nav-focusable', 'true');

    if (champ.type === 'booleen') {
        input.type = 'checkbox';
        input.checked = actuelle === true;
        return input;
    }
    if (champ.type === 'nombre') {
        input.type = 'number';
        input.value = Number.isFinite(Number(actuelle)) ? String(actuelle) : '';
        if (Number.isFinite(champ.min)) input.min = String(champ.min);
        if (Number.isFinite(champ.max)) input.max = String(champ.max);
        return input;
    }
    if (champ.type === 'secret') {
        input.type = 'password';
        input.autocomplete = 'off';
        // VIDE, toujours. Le texte d'invite dit seulement qu'une valeur existe.
        input.value = '';
        input.placeholder = actuelle ? 'Clé enregistrée (••••)' : (champ.invite || champ.titre || '');
        return input;
    }
    input.type = 'text';
    input.value = actuelle == null ? '' : String(actuelle);
    if (champ.invite) input.placeholder = champ.invite;
    return input;
}

export default { TYPES, valider, construire, appliquer };
