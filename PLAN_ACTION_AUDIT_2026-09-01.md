# Plan d'action — Application des correctifs de l'audit du 1er septembre 2026

> **Basé sur :** `AUDIT_SPACEHUB_2026-09-01.md`
> **Objectif :** fournir, pour chaque bug identifié, un correctif prêt à appliquer (fichier, code avant/après, effort, risque, test de validation), dans l'ordre où ils doivent être traités.
> **Principe directeur :** on ne touche **pas** à l'architecture du moteur de navigation dans son ensemble — les six réécritures "définitives" précédentes ont déjà montré que ce n'est pas ce qui manque. On retire des doublons précis et on ajoute des garde-fous ciblés.

---

## Ordre d'exécution recommandé

```
A01 → A02 → A03 → A04   (P0 — corrige le symptôme "navigation cassée", ~1 jour)
   ↓  test manuel + npm run test:smoke
A05 → A06                (P1 — empêche la régression de se reproduire, ~1-2 jours)
   ↓  recette TV/manette complète (checklist §5)
A07 → A08 → A09 → A10   (P2 — performance & UI, ~1-2 jours)
```

Ne pas paralléliser A01-A04 avec autre chose : ce sont les quatre correctifs qui expliquent directement le ressenti "cassé" en usage réel, et ils doivent être validés ensemble avant de continuer, sinon on ne saura pas lequel a réellement résolu quoi en recette.

**Important :** avant même A01, traiter **B0** (voir Chantier B ci-dessous) — il détermine si les correctifs A01-A06 s'appliquent à l'installation réellement testée par l'utilisateur, ou si le serveur tourne sur l'ancienne architecture `scripts/`, auquel cas un travail d'audit équivalent devra d'abord être fait là-bas.

---

## P0 — Corrige directement le symptôme "navigation cassée"

### A01 — Retirer le double défilement des carrousels

**Fichier :** `core/CarouselController.js`
**Réf. audit :** §1.1
**Effort :** 5 minutes
**Risque de régression :** très faible (retire un effet de bord, ne change aucune donnée retournée)

**Avant :**
```js
navigate(carousel, currentCard, direction, isFastScroll = false) {
    if (!carousel || !currentCard) return null;
    const cards = Array.from(carousel.querySelectorAll('.sh-card, [data-nav-focusable="true"]'));
    const curIdx = cards.indexOf(currentCard);
    if (curIdx === -1) return null;

    const targetIdx = direction === 'right' ? curIdx + 1 : curIdx - 1;
    if (targetIdx < 0 || targetIdx >= cards.length) {
        return null; // Frontière du carrousel atteinte
    }

    const targetCard = cards[targetIdx];
    this.scrollToCard(carousel, targetCard, isFastScroll ? 'auto' : 'smooth');
    return targetCard;
}
```

**Après :**
```js
navigate(carousel, currentCard, direction, isFastScroll = false) {
    if (!carousel || !currentCard) return null;
    const cards = Array.from(carousel.querySelectorAll('.sh-card, [data-nav-focusable="true"]'));
    const curIdx = cards.indexOf(currentCard);
    if (curIdx === -1) return null;

    const targetIdx = direction === 'right' ? curIdx + 1 : curIdx - 1;
    if (targetIdx < 0 || targetIdx >= cards.length) {
        return null; // Frontière du carrousel atteinte
    }

    // Le scroll est désormais entièrement délégué à SpatialNavigation.setFocus()
    // (seul responsable du défilement, cf. audit §1.1 — évite le double scrollBy relatif).
    return cards[targetIdx];
}
```

Le paramètre `isFastScroll` de `navigate()` devient inutilisé pour le scroll (il ne servait qu'à choisir `'auto'`/`'smooth'` dans l'appel supprimé) — le laisser dans la signature ne casse rien (compatibilité d'appel), mais un `// eslint-disable-next-line no-unused-vars` ou un renommage `_isFastScroll` peut être ajouté si le linter le signale.

**Test de validation :**
1. Ouvrir un carrousel avec 8+ cartes visibles.
2. Appuyer une fois sur flèche droite : la carte suivante immédiate doit être focus et centrée (pas de saut de 2 cartes).
3. Maintenir la flèche droite 2 secondes : le défilement doit rester fluide et proportionnel au nombre de pressions/répétitions, sans dépassement visible de la carte ciblée à chaque étape.

---

### A02 — Supprimer le double traitement clavier du lecteur vidéo

**Fichier :** `jellyfin/player/VideoPlayer.js`
**Réf. audit :** §1.2
**Effort :** 2-3 heures (refactor + tests manuels)
**Risque de régression :** moyen — c'est le correctif le plus délicat du lot, car `_onKeyDown` portait à la fois de la navigation (à retirer, doublonnée) et des raccourcis clavier purs sans équivalent manette (à conserver).

**Étape 1 — Isoler ce qui doit rester un raccourci clavier pur.**
Les touches `k`, `j`, `l`, `m`, `f`, `s`, `c`, `e` (section "E. TOUCHES DE RACCOURCI DIRECTES" de `_onKeyDown`) ne sont **jamais** interceptées par `InputMapper.mapKeyboardEvent()` — elles ne peuvent donc pas entrer en conflit avec `SpatialNavigation`. Elles doivent être conservées, mais **isolées dans un écouteur dédié et réduit**, qui ne touche plus jamais à `ArrowUp/Down/Left/Right`, `Enter`, `' '`, `Escape` ni `Backspace`.

**Étape 2 — Remplacer l'écouteur global.**

Avant (vers la ligne 886) :
```js
document.addEventListener('keydown', this._keyHandler = (e) => this._onKeyDown(e));
```

Après :
```js
document.addEventListener('keydown', this._keyHandler = (e) => this._onDirectShortcutKeyDown(e));
```

Et remplacer le corps de `_onKeyDown` (tout ce qui gère popovers/timeline/topbar/dock — sections A à D, et la partie navigation de la section E) par une méthode minimale qui ne gère plus que les lettres :

```js
_onDirectShortcutKeyDown(e) {
    if (!this._el || e.target.tagName === 'INPUT') return;
    if (!this._isControlsVisible) return; // le réveil du HUD reste géré par handleNavAction

    switch (e.key) {
        case 'k':
            e.preventDefault();
            this._togglePlayPause();
            break;
        case 'j':
            e.preventDefault();
            this._seekRelative(-10);
            break;
        case 'l':
            e.preventDefault();
            this._seekRelative(+10);
            break;
        case 'm':
            e.preventDefault();
            this._el.querySelector('#sh-btn-volume')?.click();
            break;
        case 'f':
            e.preventDefault();
            this._toggleFullscreen();
            break;
        case 's':
            e.preventDefault();
            this._el.querySelector('#sh-btn-open-audio-subs')?.click();
            break;
        case 'c':
            e.preventDefault();
            this._el.querySelector('#sh-btn-open-settings')?.click();
            break;
        case 'e':
            e.preventDefault();
            this._el.querySelector('#sh-btn-open-episodes')?.click();
            break;
        // Toute touche de navigation (flèches, Entrée, Espace, Échap, Retour)
        // est désormais gérée EXCLUSIVEMENT par SpatialNavigation → handleNavAction().
    }
}
```

**Étape 3 — Réintégrer dans `handleNavAction()` tout ce qui a été retiré et qui est nécessaire (popovers, timeline avec accélération, topbar, dock).**

`handleNavAction()` actuel ne couvre que le cas simple (timeline focus direct, boutons du dock, actions globales). Il doit être étendu pour couvrir aussi : popover ouvert, bouton retour de la topbar, et l'accélération de recherche sur la timeline (qui n'existait que dans le code supprimé). Comme `handleNavAction(action)` ne reçoit qu'une chaîne (`'up'`/`'down'`/`'left'`/`'right'`/`'select'`/`'back'`/`'menu'`/`'play_pause'`) et non l'événement clavier natif, l'accélération doit être reconstruite en interne (le joueur ne peut plus s'appuyer sur `e.repeat`) :

```js
// Ajouter dans le constructeur : this._navHoldAction = null; this._navHoldStart = 0;

handleNavAction(action) {
    if (!this._el) return;

    // Réveil du HUD si masqué (repris de l'ancien _onKeyDown)
    if (!this._isControlsVisible) {
        this._showControls();
        this._resetIdleTimer();
        this._el.querySelector('#sh-btn-play-pause')?.focus();
        return;
    }
    this._resetIdleTimer();

    // 0. Popover ouvert — priorité absolue (repris de la section A de l'ancien _onKeyDown)
    const openPopover = this._el.querySelector('.sh-player-popover.open');
    if (openPopover) {
        this._handlePopoverNav(action, openPopover);
        return;
    }

    const timeline = this._el.querySelector('#sh-player-timeline-focus');
    const topBackBtn = this._el.querySelector('#sh-btn-back, #sh-player-btn-back');
    const active = document.activeElement;

    // Suivi de la durée d'appui maintenu, reconstruit sans e.repeat
    if (action === this._navHoldAction) {
        // action répétée : on ne touche pas _navHoldStart, l'accélération continue
    } else {
        this._navHoldAction = action;
        this._navHoldStart = Date.now();
    }
    const holdTime = Date.now() - this._navHoldStart;

    // 1. Timeline focusée
    if (active === timeline) {
        if (action === 'left' || action === 'right') {
            let step = 5;
            if (holdTime > 5000) step = 300;
            else if (holdTime > 3000) step = 60;
            else if (holdTime > 1000) step = 30;
            this._seekRelative(action === 'right' ? step : -step);
            return;
        }
        if (action === 'down') { this._el.querySelector('#sh-btn-play-pause')?.focus(); return; }
        if (action === 'up') { (topBackBtn || this._el.querySelector('#sh-btn-back'))?.focus(); return; }
        if (action === 'select') { this._togglePlayPause(); return; }
    }

    // 2. Topbar (bouton retour)
    if (active === topBackBtn) {
        if (action === 'down') { (timeline || this._el.querySelector('#sh-btn-play-pause'))?.focus(); return; }
        if (action === 'select') { this.close(); return; }
    }

    // 3. Boutons du dock
    const dockButtons = Array.from(this._el.querySelectorAll(
        '#sh-btn-prev-ep, #sh-btn-skip-back, #sh-btn-play-pause, #sh-btn-skip-fwd, #sh-btn-next-ep, #sh-btn-volume, #sh-btn-open-audio-subs, #sh-btn-open-settings, #sh-btn-open-episodes, #sh-btn-fullscreen'
    )).filter(el => el.offsetParent !== null && window.getComputedStyle(el).display !== 'none');
    const curIdx = dockButtons.indexOf(active);
    if (curIdx !== -1) {
        if (action === 'left' && curIdx > 0) { dockButtons[curIdx - 1].focus(); return; }
        if (action === 'right' && curIdx + 1 < dockButtons.length) { dockButtons[curIdx + 1].focus(); return; }
        if (action === 'up') { (timeline || topBackBtn)?.focus(); return; }
        if (action === 'down' && active.classList.contains('sh-dock-pill-btn')) { active.click(); return; }
        if (action === 'select') { active.click(); return; }
    }

    // 4. Actions globales (aucun élément spécifique focusé)
    switch (action) {
        case 'play_pause': this._togglePlayPause(); break;
        case 'left': this._seekRelative(-10); break;
        case 'right': this._seekRelative(+10); break;
        case 'up': this._setVolumeDelta(+0.05); break;
        case 'down': this._setVolumeDelta(-0.05); break;
        case 'select': this._togglePlayPause(); break;
        case 'back':
        case 'menu': this.close(); break;
    }
}

_handlePopoverNav(action, openPopover) {
    const items = Array.from(openPopover.querySelectorAll('.sh-popover-item, .sh-chip-btn, .sh-sync-btn, .sh-popover-ep-card, button:not([disabled])'));
    const focused = document.activeElement;
    const curIdx = items.indexOf(focused);

    if (action === 'back' || action === 'menu') {
        this._closeAllPopovers();
        const triggerBtn = openPopover.closest('.sh-dock-popover-anchor')?.querySelector('.sh-dock-pill-btn');
        triggerBtn?.focus();
        return;
    }
    if (action === 'down') {
        const next = (curIdx === -1 || curIdx + 1 >= items.length) ? items[0] : items[curIdx + 1];
        next?.focus();
        next?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }
    if (action === 'up') {
        const prev = curIdx <= 0 ? items[items.length - 1] : items[curIdx - 1];
        prev?.focus();
        prev?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }
    if (action === 'left' || action === 'right') {
        const audioCol = openPopover.querySelector('#sh-player-audio-list')?.closest('.sh-popover-col');
        const subsCol = openPopover.querySelector('#sh-player-subs-list')?.closest('.sh-popover-col');
        if (audioCol && subsCol) {
            if (action === 'right' && audioCol.contains(focused)) {
                const target = subsCol.querySelector('.sh-popover-item.selected, .sh-popover-item, .sh-sync-btn');
                target?.focus();
                target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else if (action === 'left' && subsCol.contains(focused)) {
                const target = audioCol.querySelector('.sh-popover-item.selected, .sh-popover-item');
                target?.focus();
                target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
        return;
    }
    if (action === 'select' && focused && openPopover.contains(focused)) {
        focused.click();
    }
}
```

**Étape 4 — Nettoyer `close()`.**
Le bloc existant reste valide tel quel (il détruit `this._keyHandler`, qui pointe maintenant vers `_onDirectShortcutKeyDown` au lieu de `_onKeyDown` — aucun changement nécessaire ici, juste vérifier qu'il n'y a plus de référence résiduelle à `_onKeyDown`).

**Étape 5 — Réinitialiser `_navHoldAction` à la fermeture/au changement de focus.**
Ajouter dans `close()` : `this._navHoldAction = null;` pour éviter qu'un état d'accélération résiduel ne fausse la première pression lors d'une prochaine ouverture du player.

**Test de validation :**
1. Ouvrir un film, focus sur la timeline, appuyer et maintenir flèche droite : le saut doit progresser 5 s → 30 s → 60 s → 300 s selon la durée d'appui, **une seule fois par intervalle** (vérifier au chronomètre que la position avance de la quantité attendue, pas du double).
2. Focus sur les boutons du dock, appuyer une fois sur flèche droite : le focus doit avancer d'exactement un bouton.
3. Ouvrir le popover Audio/Sous-titres, naviguer avec haut/bas/gauche/droite, fermer avec Retour/Échap : doit fonctionner à l'identique d'avant le refactor.
4. Vérifier que `k`/`j`/`l`/`m`/`f`/`s`/`c`/`e` fonctionnent toujours au clavier physique.

---

### A03 — Corriger le scope de navigation Jellyseerr cassé par son propre widget

**Fichier :** `integrations/jellyseerr/JellyseerrWidgets.js`
**Réf. audit :** §1.3
**Effort :** 15 minutes
**Risque de régression :** très faible

**Avant** (dans `JellyseerrTrendingWidget.render()`) :
```js
const spatialNav = window.SpaceHub?.spatialNav || window.SpaceHub?.core?.spatialNavigation;
spatialNav?.registerFocusables && spatialNav.registerFocusables('jellyseerr', root => {
    const scopeRoot = root || document.querySelector('.sh-jellyseerr-view') || document;
    return Array.from(scopeRoot.querySelectorAll('.sh-jellyseerr-bento-card, .sh-jellyseerr-req-action-btn, [data-nav-scope="jellyseerr"]'));
});
```

**Après — solution recommandée : supprimer purement cet appel.**
Le scope `'jellyseerr'` est déjà enregistré correctement par `core/SpatialNavigation.js` dans `_initializeDefaultScopes()`. Ce second enregistrement dans le widget est redondant par conception (il duplique un scope déjà géré par le moteur central) et bogué en plus. Il suffit de retirer entièrement ce bloc du widget :

```js
// Le scope de navigation TV "jellyseerr" est déjà défini de façon confinée
// dans core/SpatialNavigation.js (_initializeDefaultScopes). Ne pas le
// réenregistrer ici — cf. audit §1.3 (bug root || ... qui cassait le confinement).
```

**Si un scope réellement différent est nécessaire pour ce widget précis** (à confirmer avec l'auteur du composant — peut-être l'intention initiale était d'ajouter les cartes de CE widget spécifique en plus de celles déjà couvertes), la bonne pratique est alors d'ajouter une méthode `extendFocusables(scopeName, provider)` sur `SpatialNavigation` qui **compose** plusieurs providers au lieu d'en écraser un — voir A04 ci-dessous, qui couvre ce cas.

**Test de validation :**
1. Sur le Dashboard, focus une carte du widget "Tendances & Découverte" (Jellyseerr).
2. Naviguer avec les flèches : le focus doit rester dans les cartes Jellyseerr adjacentes, jamais sauter vers un autre widget du Dashboard en dehors de la logique normale de proximité 2D.
3. Répéter le test après un rafraîchissement du Dashboard (le bug ne se manifestait qu'après le premier rendu du widget — vérifier qu'il ne réapparaît pas après un second rendu).

---

### A04 — Protéger le registre de scopes contre les réécritures silencieuses

**Fichier :** `core/SpatialNavigation.js`
**Réf. audit :** §1.3 (mesure préventive, pas seulement le cas Jellyseerr)
**Effort :** 30 minutes
**Risque de régression :** faible — ajoute un avertissement, ne change aucun comportement pour le code qui n'écrase pas déjà un scope

**Avant :**
```js
registerFocusables(scopeName, provider) {
    if (!scopeName) return;
    this._focusRegistry.set(scopeName, provider);
    this._log.debug(`Focus Registry: scope "${scopeName}" enregistré.`);
}
```

**Après :**
```js
registerFocusables(scopeName, provider, { force = false } = {}) {
    if (!scopeName) return;
    if (this._focusRegistry.has(scopeName) && !force) {
        this._log.warn(
            `Focus Registry: le scope "${scopeName}" est déjà enregistré. ` +
            `Réécriture ignorée (passez { force: true } si c'est intentionnel). ` +
            `Utilisez extendFocusables() pour composer plusieurs sources sur un même scope.`
        );
        return;
    }
    this._focusRegistry.set(scopeName, provider);
    this._log.debug(`Focus Registry: scope "${scopeName}" enregistré.`);
}

/**
 * Ajoute une source supplémentaire d'éléments focusables à un scope existant
 * sans écraser sa définition d'origine (compose au lieu de remplacer).
 */
extendFocusables(scopeName, extraProvider) {
    if (!scopeName || typeof extraProvider !== 'function') return;
    const base = this._focusRegistry.get(scopeName);
    this._focusRegistry.set(scopeName, (root) => {
        const baseResult = typeof base === 'function' ? base(root) : (Array.isArray(base) ? base : []);
        const extra = extraProvider(root) || [];
        return [...new Set([...baseResult, ...extra])];
    });
}
```

**Test de validation :**
1. Après A03, vérifier dans la console que le chargement du Dashboard n'affiche plus d'avertissement `"scope déjà enregistré"` pour `jellyseerr` (puisque A03 a retiré l'appel redondant).
2. Simuler volontairement un appel `registerFocusables('dashboard', () => [])` depuis la console après le démarrage : vérifier qu'un avertissement apparaît et que le scope `dashboard` d'origine continue de fonctionner (preuve que la protection agit).

---

## P1 — Empêche la régression de se reproduire ailleurs

### A05 — Unifier les gestionnaires `keydown` concurrents (Escape en particulier)

**Fichiers concernés :** `core/Router.js`, `ui/components/Modal.js`, `ui/components/ModalSlideUpSheet.js`, `ui/components/AnalyticsModal.js`, `core/TrailerService.js`
**Réf. audit :** §1.5
**Effort :** 1 jour (nécessite d'abord un audit ciblé de chaque composant, car leur niveau de risque réel n'a pas tous été vérifié individuellement dans l'audit du 1er septembre)

**Démarche recommandée (par composant, dans cet ordre) :**

1. **`core/Router.js`** — le cas le plus simple : son unique action liée à `Escape` est `this._eventBus?.emit('navigation:back')`, qui n'a aujourd'hui aucun abonné actif ailleurs dans le code (vérifié par recherche du 1er septembre). **Retirer purement la ligne `e.key === 'Escape'` de `Router._setupKeyboardNavigation()`** — `SpatialNavigation._handleBack()` gère déjà `Escape` de façon centralisée. Conserver Ctrl+K et Ctrl+Alt+A dans `Router` (ce sont des raccourcis globaux sans équivalent NavAction, donc sans conflit).

2. **`ui/components/Modal.js`, `ui/components/ModalSlideUpSheet.js`, `ui/components/AnalyticsModal.js`** — avant de toucher au code, **vérifier d'abord** (recherche à faire en ouvrant chaque fichier) si la classe CSS que ces composants appliquent à leur overlay (`sh-modal--open`, `sh-slideup-sheet--open`, ou une classe propre à `AnalyticsModal`) correspond à l'un des sélecteurs déjà reconnus par `SpatialNavigation._handleBack()` :
   ```js
   // Sélecteurs déjà couverts par _handleBack() dans core/SpatialNavigation.js
   '#sh-modal-spacehub-settings.sh-modal--open'
   '.sh-slideup-sheet--open'
   '.sh-modal-overlay.open, .sh-console-modal-overlay.open, #sh-admin-dashboard-modal, .sh-modal--open'
   ```
   - Si c'est le cas (probable pour `Modal.js` et `ModalSlideUpSheet.js`, dont les classes correspondent déjà), leur écouteur `keydown` local sur `Escape` est **strictement redondant** avec `SpatialNavigation` : à retirer, en s'assurant que la fermeture continue de fonctionner via le chemin central (`_handleBack()` → `panel.close()` / `.click()` sur le bouton de fermeture).
   - Si `AnalyticsModal` utilise une classe/structure différente non reconnue par `_handleBack()`, **ne pas retirer** son écouteur local dans l'immédiat : ajouter d'abord son sélecteur à la liste des modales génériques reconnues par `SpatialNavigation` (scope `'modal'` et `_handleBack()`), puis seulement ensuite retirer l'écouteur local une fois vérifié que la fermeture centrale fonctionne.

3. **`core/TrailerService.js`** — probablement un cas à part (lightbox de bande-annonce, pas une modale standard). Vérifier que son écouteur `keydown` est bien retiré/désactivé quand la lightbox n'est pas ouverte (pattern déjà correct dans `HeroSpotlightComponent`, à prendre comme référence) ; s'il l'est déjà, ce n'est pas un bug actif, seulement une source potentielle si son état de garde a une faille — à confirmer par lecture du fichier avant toute modification.

**Principe à appliquer pour toute nouvelle modale/overlay à l'avenir** (à documenter dans `docs/CONTRIBUTING.md`) : **un composant modal ne doit jamais poser son propre `addEventListener('keydown', ...)` pour `Escape`/flèches/Entrée.** Il doit exposer une méthode `close()` standard et déclarer sa classe d'overlay dans les sélecteurs de `SpatialNavigation` (scope `'modal'` + `_handleBack()`), point final. C'est la seule façon de garantir qu'une touche ne produit jamais deux effets, quel que soit le nombre de modales ajoutées plus tard.

**Test de validation :**
1. Ouvrir chaque modale concernée (Réglages, fiche média SlideUp, Analytics, bande-annonce) une par une, appuyer sur Échap une seule fois : elle doit se fermer une seule fois, sans effet secondaire visible (pas de saut de vue en plus, pas de second `navigation:back` dans les logs).
2. Vérifier dans les logs (`Logger` en mode `debug`) qu'une seule fermeture est déclenchée par pression.

---

### A06 — Unifier la répétition manette avec le moteur de répétition clavier

**Fichiers :** `core/GamepadInput.js`, `core/SpatialNavigation.js`
**Réf. audit :** §1.4
**Effort :** 3-4 heures
**Risque de régression :** moyen (change l'interface entre les deux classes)

**Principe :** au lieu que `GamepadInput` gère elle-même sa propre cadence de répétition (280 ms puis 100 ms fixe) et appelle `onAction(direction)` à chaque tick, elle doit se contenter de signaler **le début et la fin d'une pression directionnelle**, et laisser `SpatialNavigation._startInputRepeat()`/`_stopInputRepeat()` (qui gère déjà l'accélération progressive et le `instantScroll`) piloter la cadence — exactement comme pour `keydown`/`keyup`.

**Changement d'interface proposé :**

```js
// core/GamepadInput.js — remplacer l'appel direct par un signal start/end
constructor({ onAction, onDirectionStart, onDirectionEnd } = {}) {
    ...
    this._onDirectionStart = onDirectionStart || (() => {});
    this._onDirectionEnd = onDirectionEnd || (() => {});
    ...
}

// Dans _processGamepad(), remplacer le bloc de répétition manuelle :
if (direction) {
    if (this._activeDirection !== direction) {
        this._activeDirection = direction;
        this.vibrate(10);
        this._onDirectionStart(direction); // déclenche _startInputRepeat côté SpatialNavigation
    }
    // Le tick/la cadence sont désormais entièrement gérés par SpatialNavigation._startInputRepeat()
} else if (this._activeDirection) {
    this._activeDirection = null;
    this._onDirectionEnd(); // déclenche _stopInputRepeat()
}
```

```js
// core/SpatialNavigation.js — brancher les nouveaux callbacks au lieu de onAction pour les directions
this._gamepad = new GamepadInput({
    onAction: (action) => this.handleAction(action), // boutons non-directionnels (A/B/Start/Select/L2/R2)
    onDirectionStart: (direction) => this._startInputRepeat(direction),
    onDirectionEnd: () => this._stopInputRepeat()
});
```

**Test de validation :**
1. Maintenir le D-pad droit sur un carrousel : la cadence doit progressivement accélérer (comme au clavier) et basculer en scroll instantané après ~350 ms, sans à-coups.
2. Comparer visuellement la fluidité clavier vs manette sur le même carrousel : elles doivent maintenant être indiscernables.
3. Vérifier que les boutons non-directionnels (A/Select, B/Back, Start/Play-Pause, L2/R2) continuent de fonctionner normalement (ils passent toujours par `onAction`, inchangé).

---

## P2 — Performance et UI

### A07 — Ajouter le support global de `prefers-reduced-motion`

**Fichier :** `ui/design-system/tokens.css`
**Réf. audit :** §5
**Effort :** 30 minutes + vérification visuelle
**Risque de régression :** faible

Ajouter à la fin du fichier :
```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

**Test de validation :** activer "Réduire les animations" dans les préférences système (macOS : Accessibilité → Affichage ; Windows : Effets visuels), recharger l'app, vérifier que les transitions de carrousel/modales/Dynamic Island sont quasi instantanées sans que l'app se casse visuellement (pas d'élément qui reste à une position intermédiaire).

### A08 — Réduire l'usage de `!important` dans les skins `jamfin`/`flow`/`scyfin`

**Fichiers :** `skins/jamfin-spacehub.css`, `skins/flow-spacehub.css`, `skins/scyfin-spacehub.css`
**Réf. audit :** §5
**Effort :** 2-3 heures par skin (à traiter un par un, pas en lot, pour pouvoir vérifier visuellement chaque retrait)
**Risque de régression :** moyen — nécessite une vérification visuelle après chaque retrait

**Démarche :** pour chaque `!important` trouvé (`grep -n '!important' skins/<fichier>.css`), identifier la règle plus spécifique qui rendait le `!important` nécessaire, et soit (a) augmenter la spécificité du sélecteur ciblé (ex. ajouter la classe parente réelle) pour se passer du `!important`, soit (b) si la règle en conflit est elle-même injectée dynamiquement en JS avec un style inline, migrer ce style inline vers une classe CSS pour redonner la main à la cascade normale. Ne pas traiter en modification de masse — chaque retrait doit être vérifié visuellement dans le thème concerné.

### A09 — Différer le chargement des widgets d'intégrations externes

**Fichier :** `core/SpaceHub.js`
**Réf. audit :** §6 (repris de `AUDIT_PROFESSIONNEL.md` §11.1, toujours valable)
**Effort :** 1 jour
**Risque de régression :** moyen

**Démarche :** dans le bootstrap, séparer explicitement deux phases : (1) rendu du shell + widgets Jellyfin natifs (bibliothèques, reprise, derniers ajouts) → premier écran utile ; (2) chargement des six intégrations Servarr et de leurs widgets, déclenché **après** le premier rendu (`requestIdleCallback` si disponible, sinon `setTimeout(..., 0)`), et seulement pour les intégrations réellement configurées (URL + clé présentes) plutôt que les six systématiquement.

**Test de validation :** mesurer le temps jusqu'au premier rendu utile (Dashboard visible et interactif) avant/après avec les DevTools Performance, sur un profil CPU throttlé (4x-6x) pour simuler un appareil TV bas de gamme.

### A10 — Réduire le poids du bundle JS applicatif

**Fichier :** `vite.config.js`
**Réf. audit :** §6
**Effort :** 0,5-1 jour
**Risque de régression :** faible

Découper `manualChunks` par grande zone fonctionnelle (ex. `player`, `admin-console`, `settings`) en plus du découpage déjà existant (vendor HLS séparé), pour que les vues peu utilisées (console admin, réglages avancés) ne soient chargées qu'à la demande plutôt que dans le bundle principal.

---

## Chantier B — Suppression définitive de l'architecture legacy `scripts/`

> Ajouté le 1er septembre 2026, à la demande explicite du porteur du projet : **`scripts/` n'a jamais été prévu comme une partie permanente du produit.** Il apparaît déjà dans `docs/ARCHITECTURE.md` comme "scripts hérités KefinTweaks (migration en cours)" et dans `SpaceHub_Plan_de_Developpement_v2.md` comme la dette n°1 à fermer ("v0.2bis — priorité immédiate", jamais faite depuis le 17 août). Ce chantier acte que cette migration va enfin être menée à son terme, au lieu de rester indéfiniment "transitoire".

### B0 — 🔴 Constat préalable indispensable : deux applications distinctes coexistent dans ce dépôt

Avant de toucher à quoi que ce soit dans `scripts/`, il faut clarifier un point découvert en préparant ce chantier, qui a un impact direct sur le Chantier A (navigation) :

- **`index.html`** (utilisé par `npm run dev` et par le build `dist/` que le `README.md` recommande d'injecter — "Méthode 1 : Injection dans Jellyfin Web (Recommandée)") charge **uniquement** `/core/SpaceHub.js` — c'est l'application moderne ES Modules : `core/`, `ui/`, `jellyfin/`, `integrations/`. C'est **cette** application, et notamment `core/SpatialNavigation.js`, qui a été auditée dans `AUDIT_SPACEHUB_2026-09-01.md` et corrigée dans le Chantier A ci-dessus.
- **`spaceHub-plugin.js`** est un **second point d'entrée séparé**, à coller dans le plugin "JavaScript Injector" de Jellyfin ("Users paste this script into JS Injector instead of injector.js" — commentaire d'en-tête du fichier lui-même). Une fois installé, il charge `spaceHub-injector.js`, qui charge à son tour **la totalité des 41 409 lignes de `scripts/`** — une implémentation entièrement différente, plus ancienne, qui ne charge **aucun** des modules `core/`/`ui/`/`jellyfin/` audités (pas de `SpatialNavigation`, pas de `PluginManager`, pas de `VideoPlayer` moderne).
- `docs/ARCHITECTURE.md` appelle ce second chemin "Mode A — Injection Jellyfin (production)", ce qui laisse penser que c'est le mode de déploiement principal — **alors que le `README.md` met en avant l'injection du bundle `dist/` (l'application moderne) comme méthode recommandée.** Les deux documents se contredisent sur ce qui est réellement "la" version de production.

**Conséquence directe et urgente :** si le serveur Jellyfin réel testé par l'utilisateur a été configuré via `spaceHub-plugin.js` / le "JS Injector" legacy plutôt que via le bundle `dist/` du README, **alors la navigation cassée observée en test réel ne vient probablement pas des bugs corrigés au Chantier A** (qui ne concernent que `core/SpatialNavigation.js`, jamais chargé dans ce mode), mais d'un système de navigation entièrement différent et non audité, quelque part dans `scripts/` (candidats probables : `headerTabs.js`, `skinManager.js`, ou une logique de focus intégrée directement dans `homeScreen.js`/`watchlist.js`).

**Action immédiate avant de continuer :** vérifier sur le serveur réel utilisé pour les tests quel script est effectivement chargé (`spaceHub-plugin.js`/`spaceHub-injector.js` vs le bundle `dist/assets/index.js`) — un simple coup d'œil dans l'onglet Réseau du navigateur pendant le chargement de Jellyfin Web suffit. Cela conditionne si le Chantier A s'applique tel quel, ou si un audit équivalent doit d'abord être fait sur `scripts/` avant de le supprimer à l'aveugle.

#### Résultat de la vérification du 1er septembre 2026

Vérification effectuée directement sur le serveur réel (`http://192.168.1.18:8096`, hôte "NAS1", celui utilisé pour la recette du 31 août d'après `PLAN_CORRECTIONS.md`) via le navigateur, en inspectant l'onglet Réseau au chargement de la page.

**Constat : ni l'application moderne (`core/SpaceHub.js` / `dist/assets/index.js`) ni l'application legacy (`spaceHub-plugin.js` / `spaceHub-injector.js` / `scripts/*.js`) ne sont chargées sur ce serveur.** La page servie est le client Jellyfin Web **strictement natif, sans aucune injection SpaceHub** — écran de connexion standard ("Merci de vous identifier"), uniquement des chunks Jellyfin natifs (`web/*.chunk.js`) et des plugins serveur Jellyfin classiques (`AchievementBadges`, `TwoFactorAuth`, `MdbListRatings`, etc.). Aucune requête vers un fichier contenant "spaceHub" n'apparaît, ni avant ni après le chargement initial.

**Cela change la question posée initialement :** ce n'est plus "quelle version de SpaceHub tourne", mais **"SpaceHub n'est actuellement pas actif du tout sur ce serveur"**. Deux causes possibles, à vérifier avec le porteur du projet :
1. Le plugin "JavaScript Injector" de Jellyfin est désactivé, désinstallé, ou son script a été vidé côté administration (Tableau de bord Jellyfin → Plugins → JavaScript Injector) depuis la dernière recette du 31 août.
2. Le serveur `192.168.1.18:8096` n'est plus l'environnement de test actuel — un autre serveur/profil a peut-être pris le relais depuis.

**Cette question reste donc ouverte et bloquante** pour juger si les bugs remontés en "test réel" par l'utilisateur ont été observés sur l'application moderne auditée (Chantier A), sur l'application legacy (Chantier B), ou sur une session antérieure où l'injection était encore active. Tant qu'elle n'est pas tranchée avec le porteur du projet, ne pas supposer que les correctifs A01-A06 suffisent à eux seuls.

#### ✅ B0 résolu — confirmation du 1er septembre 2026

Le porteur du projet confirme tester réellement via **`http://localhost:3000/`** — le serveur de développement Vite local (`npm run dev`), qui sert `index.html` → `core/SpaceHub.js`, avec le proxy CORS dynamique de `vite.config.js` pointant vers le vrai serveur Jellyfin (`192.168.1.18:8096`).

Vérification faite directement sur `http://localhost:3000/` : le titre d'onglet affiche bien **"SpaceHub — Media Center"**, et l'onglet Réseau confirme le chargement de la totalité de la pile moderne auditée — `ui/layouts/AppLayout.js`, `ui/views/LibraryView.js`, `ui/views/DownloadsView.js`, `jellyfin/player/VideoPlayer.js`, `jellyfin/auth/AuthManager.js`, les six intégrations Servarr (`integrations/*/Api.js`+`Service.js`+`Widgets.js`), `core/InputMapper.js`, `core/GamepadInput.js`, `core/CarouselController.js`, `core/PluginPermissions.js`, et `plugins/ratings/spacehub-ratings-plugin.js`. C'est très exactement le périmètre audité dans `AUDIT_SPACEHUB_2026-09-01.md` et corrigé par le Chantier A.

**Conclusion : les correctifs A01-A06 s'appliquent directement à l'environnement réellement testé par l'utilisateur.** Le Chantier A peut être appliqué et validé en recette sans réserve sur ce point. Le serveur `192.168.1.18:8096` en accès direct (sans passer par `localhost:3000`) sert quant à lui du Jellyfin strictement natif au moment de cette vérification — cohérent avec le fait que l'utilisateur teste via le serveur de développement plutôt que via une injection en production sur le NAS. Le Chantier B (nettoyage de `scripts/`) reste pertinent pour la suite (dette technique, cohérence du dépôt, futur mode de déploiement en production), mais n'est **plus bloquant** pour appliquer et valider le Chantier A dès maintenant.

### B1 — Inventaire de `scripts/` (41 409 lignes, ~40 fichiers)

| Groupe | Fichiers | Lignes (approx.) | Traitement |
|---|---|---:|---|
| **Groupe 1 — déjà dupliqués par un module ESM moderne** | `utils.js`, `apiHelper.js`, `cardBuilder.js`+`.css`, `modal.js`+`.css`, `toaster.js`, `search.js`+`.css`, `indexedDBCache.js`, `localStorageCache.js`, `collections.js`, `skinManager.js`, `skinConfig.js`, `skinConfig-0.3.5-defaults.js`, `defaultSkin.css`, `configuration.js`+`.css`, `infiniteScroll.js`, `updoot.js` | ≈ 16 300 | Candidats à **suppression directe**, un fichier à la fois, après vérification manuelle que l'équivalent moderne (`ui/components/CardBuilder.js`, `ui/components/Modal.js`, `ui/components/Toaster.js`, `jellyfin/search/UnifiedSearch.js`, `core/CacheManager.js`, `jellyfin/collections/SmartCollections.js`, `ui/themes/ThemeManager.js`, `core/SettingsManager.js`+`ui/components/SettingsPanel.js`, pagination de `ui/views/LibraryView.js`, `core/RatingCacheService.js`) couvre bien le même périmètre fonctionnel côté produit. |
| **Groupe 2 — fonctionnalités sans équivalent moderne** | `watchlist.js`+`.css`, `playlist.js`, `homeScreen.js`+`.css`, `subtitleSearch.js`+`.css`, `breadcrumbs.js`+`.css`, `headerTabs.js`, `seriesEpisodes.js`+`.css`, `seriesInfo.js`, `deviceManager.js`, `itemDetailsCollections.js`, `flattenSingleSeasonShows.js`, `customMenuLinks.js`, `exclusiveElsewhere.js`, `backdropLeakFix.js`, `dashboardButtonFix.js`, `removeContinue.js`, `snowverlay.js` | ≈ 23 100 | **Ne pas supprimer avant d'avoir soit porté la fonctionnalité dans `core`/`ui`/`jellyfin`, soit décidé explicitement de l'abandonner** (voir B2 — certaines, comme `snowverlay.js`, sont candidates à un abandon pur et simple plutôt qu'un portage). |
| **Groupe 3 — le chargeur legacy lui-même** | `spaceHub-injector.js`, `spaceHub-plugin.js`, `spaceHub-default-config.js`, `spaceHub.minimal.js` | ≈ 890 | À réduire puis supprimer **en dernier**, une fois les groupes 1 et 2 vidés — c'est le "critère de sortie" déjà défini dans `SpaceHub_Plan_de_Developpement_v2.md` §7 (étape 6). |

### B2 — Stratégie de suppression, phasée et réaliste

Le volume (41 409 lignes, dont deux fichiers isolés de plus de 6 000 lignes) rend une suppression en un seul passage irréaliste et risquée. Séquence recommandée :

1. **Phase 0 (avant tout)** : trancher B0 — confirmer quel mode tourne réellement en production pour l'utilisateur.
2. **Phase 1 — Groupe 1, un fichier à la fois** (effort : 2-3 jours au total). Pour chaque fichier : retirer son entrée de `spaceHub-injector.js`, supprimer le fichier, relancer `npm run test:smoke` + `npm run build`, puis vérifier visuellement en mode injection que la fonctionnalité correspondante marche toujours via son équivalent ESM. Ordre suggéré (du plus sûr au plus délicat) : `toaster.js` → `modal.js`+`.css` → `indexedDBCache.js`/`localStorageCache.js` → `cardBuilder.js`+`.css` → `search.js`+`.css` → `collections.js` → `skinManager.js`/`skinConfig*.js`/`defaultSkin.css` → `configuration.js`+`.css` (le plus gros de ce groupe, à traiter en dernier) → `infiniteScroll.js` → `updoot.js` → `apiHelper.js`/`utils.js` (probablement des utilitaires transverses encore importés par d'autres scripts du Groupe 2 — à ne retirer qu'une fois tout le Groupe 2 traité).
3. **Phase 2 — Groupe 2, "petits gains" d'abord** (effort : 1-2 jours). Commencer par les fichiers courts et isolés qui sont soit de simples correctifs ponctuels dont l'intention peut être vérifiée puis réimplémentée en quelques lignes dans `core`/`ui`, soit de purs correctifs déjà couverts implicitement par la réécriture ESM : `dashboardButtonFix.js` (37 l.), `backdropLeakFix.js` (40 l.), `exclusiveElsewhere.js` (57 l.), `customMenuLinks.js` (112 l.), `removeContinue.js` (294 l.). **`snowverlay.js`** (effet de neige saisonnier, 143 l.) est un candidat à trancher comme décision produit simple : soit l'ajouter comme thème/option dans `ui/themes`, soit l'abandonner — ce n'est pas un correctif technique.
4. **Phase 3 — Groupe 2, fonctionnalités moyennes** (effort : 1-2 semaines). `deviceManager.js`, `breadcrumbs.js`+`.css`, `headerTabs.js`, `seriesInfo.js`, `seriesEpisodes.js`+`.css`, `itemDetailsCollections.js`, `flattenSingleSeasonShows.js`, `subtitleSearch.js`+`.css`, `playlist.js` — chacune doit être portée comme un module `ui/`/`jellyfin/` à part entière (avec, si elle touche à la navigation TV, un scope `SpatialNavigation` correctement confiné dès sa conception — pas ajouté après coup comme cela a produit les bugs du Chantier A).
5. **Phase 4 — Groupe 2, les deux monolithes** (effort : plusieurs semaines chacun, à traiter comme deux chantiers séparés avec leur propre plan détaillé) : `watchlist.js` (8 011 lignes + 1 958 lignes de CSS — le plus gros fichier du projet) et `homeScreen.js` (6 368 lignes + 146 lignes de CSS, déjà signalé dans `PLAN_CORRECTIONS.md` comme contenant du *scraping HTML IMDb*, à examiner avec attention avant tout portage — ce genre de pratique est fragile et potentiellement contraire aux conditions d'utilisation d'IMDb, à remplacer par l'API OMDb déjà utilisée par le plugin `spacehub.ratings`, cf. audit §3). **Ne pas commencer ces deux fichiers avant que les phases 1 à 3 soient terminées** : leur taille les rend trop risqués pour servir de "premier essai" de la méthode de portage.
6. **Phase 5 — Groupe 3** : une fois `scripts/` vide, réduire `spaceHub-injector.js` à un simple bootstrap de compatibilité (ou le supprimer entièrement), supprimer `spaceHub-plugin.js`, `spaceHub-default-config.js`, `spaceHub.minimal.js`, et mettre à jour `README.md` pour ne plus documenter qu'**une seule** méthode d'installation.

### B3 — Règle à appliquer pendant tout le chantier

Chaque fonctionnalité portée depuis `scripts/` vers `core`/`ui`/`jellyfin` doit respecter dès le départ les principes qui ont fait défaut lors des six réécritures "définitives" de la navigation (cf. audit §0) : **une seule autorité par domaine** (un seul gestionnaire clavier, un seul scope de focus par zone, pas de logique dupliquée entre deux fichiers). Ne pas réintroduire dans le code moderne les mêmes anti-patterns qui viennent d'être corrigés au Chantier A.

### Suivi — Chantier B

| Phase | Contenu | Statut |
|---|---|---|
| B0 | Confirmer le mode réellement déployé (dist/ESM vs injector/scripts) | ✅ Résolu le 1er septembre 2026 — `localhost:3000` (dev server) confirmé comme environnement réel de test, il sert l'app moderne ESM. Chantier A applicable sans réserve. Non bloquant pour la suite du Chantier B. |
| B1 | Inventaire (ce document) | ✅ Fait |
| Phase 1 | Suppression Groupe 1 (≈16 300 lignes déjà dupliquées) | ⬜ À faire |
| Phase 2 | Portage "petits gains" | ⬜ À faire |
| Phase 3 | Portage fonctionnalités moyennes | ⬜ À faire |
| Phase 4 | Portage `watchlist.js` et `homeScreen.js` | ⬜ À faire |
| Phase 5 | Suppression du chargeur legacy + mise à jour README | ⬜ À faire |

---

## Checklist de recette après A01-A06 (à réaliser sur device réel)

Cette checklist reprend et complète celle déjà définie dans `AUDIT_PROFESSIONNEL.md` §14.4, en la recentrant sur les bugs corrigés ici :

- [ ] Carrousel Dashboard : flèche droite/gauche répétée avance d'une carte à la fois, jamais deux.
- [ ] Carrousel Library : idem, y compris en appui long (fast-scroll).
- [ ] Player — dock : flèche droite/gauche entre les boutons avance d'un bouton à la fois.
- [ ] Player — timeline : appui maintenu sur flèche accélère progressivement (5 s → 300 s), une seule fois par palier.
- [ ] Player — popover Audio/Sous-titres : navigation haut/bas/gauche/droite et fermeture Échap fonctionnent sans double effet.
- [ ] Player — raccourcis clavier `j`/`k`/`l`/`m`/`f`/`s`/`c`/`e` toujours actifs.
- [ ] Widget Jellyseerr (Dashboard) : le focus reste confiné aux cartes Jellyseerr adjacentes lors de la navigation directionnelle.
- [ ] Échap dans chaque modale (Réglages, fiche média, Analytics, bande-annonce) : une seule fermeture par pression.
- [ ] Manette (Xbox/DualSense/Switch Pro si disponible) : cadence de défilement comparable au clavier, sans à-coups.
- [ ] `npm run test:smoke` et `npm run build` passent sans nouvelle erreur.

---

## Suivi

| ID | Priorité | Statut |
|----|----------|--------|
| A01 | P0 | ✅ Appliqué le 1er septembre 2026 — `core/CarouselController.js` |
| A02 | P0 | ✅ Appliqué le 1er septembre 2026 — `jellyfin/player/VideoPlayer.js` |
| A03 | P0 | ✅ Appliqué le 1er septembre 2026 — `integrations/jellyseerr/JellyseerrWidgets.js` |
| A04 | P0 | ✅ Appliqué le 1er septembre 2026 — `core/SpatialNavigation.js` **+ correctif additionnel non prévu au plan initial** : les 9 sites d'appel qui « confirment » un scope déjà enregistré au boot (`ui/layouts/Dashboard.js`, `ui/views/LibraryView.js`, `ui/views/DownloadsView.js`, `ui/layouts/AppLayout.js`, `ui/components/Modal.js`, `ui/components/SettingsPanel.js`, `ui/components/AppSidebarDrawer.js`, `jellyfin/player/VideoPlayer.js`, `jellyfin/search/UnifiedSearch.js`) ont dû recevoir `{ force: true }` — sans ce correctif, le garde-fou anti-doublon d'A04 aurait silencieusement bloqué **toutes** ces re-registrations légitimes et gelé la navigation TV sur les sélecteurs génériques de boot dans toute l'application. Ce n'était pas visible dans le texte du plan d'origine ; découvert et corrigé pendant l'implémentation. |
| A05 | P1 | 🟡 Appliqué partiellement le 1er septembre 2026 — `core/Router.js` (Escape retiré, aucun abonné actif confirmé par recherche), `ui/components/Modal.js` (Escape retiré, Tab-trap conservé), `ui/components/ModalSlideUpSheet.js` (retrait partiel : seul le repli générique `else this.close()` est retiré, la fermeture du popover audio interne `_audioPopoverOpen` est conservée — non connue de `_handleBack()`), `core/TrailerService.js` (vérifié : déjà correct, écouteur borné à l'ouverture/fermeture, aucun changement nécessaire). **`ui/components/AnalyticsModal.js` volontairement non touché** : sa classe `.sh-analytics-modal-overlay.open` n'est pas reconnue par `_handleBack()` ; une première tentative d'ajouter ce sélecteur à `_handleBack()` a été annulée en cours d'implémentation car elle aurait fait cohabiter l'ancien écouteur local et le nouveau chemin central, recréant exactement le bug de double-déclenchement visé par ce chantier. Reste à faire manuellement, avec vérification visuelle, avant de toucher ce fichier. |
| A06 | P1 | ✅ Appliqué le 1er septembre 2026 — `core/GamepadInput.js` + `core/SpatialNavigation.js`. **Adapté par rapport au code du plan** : le plan proposait de brancher `onDirectionStart` directement sur `_startInputRepeat()` sans condition ; en l'état cela aurait cassé la navigation manette dans le lecteur vidéo (bypass total de `VideoPlayer.handleNavAction()`). Le correctif appliqué distingue le scope `player` (délégation répétée à `handleNavAction()`, cadence 280 ms puis 100 ms comme avant) du reste de l'app (délégué au moteur partagé `_startInputRepeat`/`_stopInputRepeat`). Gère aussi la déconnexion manette en cours de maintien (`_onDirectionEnd` désormais appelé explicitement, sinon la répétition tournerait indéfiniment). |
| A07 | P2 | ✅ Appliqué le 1er septembre 2026 — `ui/design-system/tokens.css` |
| A08 | P2 | ⬜ Non traité — nécessite une vérification visuelle par skin (`jamfin`/`flow`/`scyfin`), non automatisable sans accès visuel live à chaque thème |
| A09 | P2 | ⬜ Non traité — reporté volontairement : le texte du plan sous-estime l'effort réel (les imports des 6 services Servarr sont statiques dans `core/SpaceHub.js` ; un vrai chargement différé exige de les convertir en `import()` dynamique, un changement plus large qu'un simple réordonnancement, avec un risque de casser l'initialisation des intégrations sans test live/DevTools Performance pour valider) |
| A10 | P2 | 🟡 Appliqué partiellement le 1er septembre 2026 — `vite.config.js` : `admin-console` et `settings` séparés du chunk `app` (aucune dépendance croisée avec VideoPlayer/LibraryView, donc sans risque). **`player` volontairement resté fusionné avec `app`** : le code existant fusionne déjà délibérément `/jellyfin/` et `/ui/views/` pour éviter un warning de dépendance circulaire VideoPlayer↔LibraryView — le séparer aurait réintroduit ce problème. Attention : ce découpage change uniquement le regroupement des fichiers de sortie (meilleur cache HTTP/téléchargement parallèle) — comme pour A09, ces modules restent importés statiquement, donc ce n'est **pas** un vrai chargement à la demande. |

### Validation effectuée après application (1er septembre 2026)

- `node --check` sur chacun des 16 fichiers modifiés : **OK**.
- `npm run lint` (`scripts/syntax-check.mjs`) : **246 fichiers JS, syntaxe OK**.
- `npm run test:smoke` : **passé, code de sortie 0**.
- `npm run build` : **n'a pas pu être exécuté depuis cette session** — la VM Linux utilisée pour appliquer ces correctifs a un `node_modules` sans le binaire natif `@rollup/rollup-linux-x64-gnu` (bug connu npm avec les dépendances optionnelles). **À faire par le porteur du projet sur sa machine habituelle** avant tout déploiement : `npm run build`, puis recette manuelle complète (checklist ci-dessus) sur `http://localhost:3000/`.

Les points P3 du plan d'action de l'audit (dé-duplication Core/Injector, inventaire XSS complet, UI d'installation de plugins) ne sont pas détaillés ici — ce sont des chantiers structurels plus larges qui méritent leur propre plan une fois A01-A06 validés en recette réelle.

---

*Plan établi le 1er septembre 2026 à partir de `AUDIT_SPACEHUB_2026-09-01.md`. Les correctifs A01, A03 et A04 sont des retraits/ajouts ciblés à faible risque et peuvent être appliqués directement. A02 et A06 sont des refactors plus larges qui doivent être testés manuellement avant merge — le code fourni ici est une proposition de départ, pas un patch validé en recette.*
