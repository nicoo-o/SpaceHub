# UI mobile (GSM) — décisions et grille d'acceptation

*Dernière révision : 11 septembre 2026. Plan d'origine : `PLAN_UI_MOBILE_GSM.md`.*

## Le constat qui a déclenché le chantier

L'APK Android embarquait une **UI/UX de PC** : le dock « Dynamic Island » se
dépliait au survol de la souris (un téléphone n'en a pas), aucune barre de
navigation n'existait, le bouton retour système **tuait l'application** même
avec une fiche média ouverte, et le zoom était bloqué par un
`user-scalable=no` que personne n'avait consciemment posé. L'application
fonctionnait — elle n'était pas *utilisable* au doigt.

## Le modèle retenu (décision du 11 septembre 2026)

**GSM = barre basse + en-tête compact.** Le rendu PC et TV ne change pas
d'un pixel. Trois principes :

1. **Un profil déclaratif, jamais des booléens.** `core/ProfilAppareil.js`
   détecte (TV d'abord — l'UA Android TV contient « Android » —, puis
   `(hover: none) and (pointer: coarse)` + UA Android) et pose `html.sh-gsm`.
   Les composants ne testent jamais « est-ce un mobile » : le CSS écrit le
   reste, comme le fait `html.sh-tv-mode` pour la TV.
2. **Des variants explicites, pas des modes.** `BarreNavigation.js` et
   `EnTeteCompact.js` sont des composants séparés, sélectionnés par
   `AppLayout` quand le profil dit GSM. Le dock PC reste rendu (masqué en
   CSS) : aucune logique de vue n'est touchée.
3. **Le geste a toujours une alternative.** Les swipes de `TouchEngine`
   continuent de fonctionner, mais chaque destination est aussi un tap
   (barre basse) et le clavier reste complet (couches du moteur TV).

## Ce qui a atterri, et où

| Étape | Branches → main | Contenu |
|---|---|---|
| A | `41e73d7` | `core/ProfilAppareil.js` — détection, `html.sh-gsm`, forçage `ui.forceProfil` |
| B | `c79039b` | `BarreNavigation.js` (M3, 3 destinations), `EnTeteCompact.js` + menu en modale-feuille, `GsmNav.css`, contrats DOM |
| C | `af97626` | viewport (zoom réactivé, `viewport-fit=cover`), champs ≥ 16 px, modales en feuilles 88vh, cibles 48 px étendues, `100dvh` |
| D | `ae3a4db` | `core/PontAndroid.js` — retour système sur le pipeline TV, double appui pour quitter, injection `cordova.js` dans www/ seul, `adjustResize`, garde CI |
| E | cette branche | passe e2e mobile (6 scénarios), contrôle statique `test:gsm`, documentation |

## Invariants (vérifiés par `npm run test:gsm`)

Ces règles sont **contrôlées automatiquement** à chaque `npm run test` ; les
supprimer exige de modifier `scripts/verifier-gsm.mjs` dans le même commit —
une décision, pas un oubli.

1. **Le zoom n'est jamais bloqué** : pas de `user-scalable=no` ni
   `maximum-scale` dans le viewport ; `viewport-fit=cover` présent.
2. **Chaque classe CSS de `GsmNav.css` est émise par le JS** — pas de
   sélecteur fantôme (la famille de défauts que `nav-contract-check`
   traque côté moteur TV).
3. **La garde anti sticky-hover reste en place** : les règles `:hover` du
   dock PC sont neutralisées sous `(hover: none)`.
4. **`100dvh` sur le conteneur racine** : `100vh` inclut la zone que la
   barre gestuelle Android réserve.
5. **Les cibles tactiles 48 px couvrent toute la coquille GSM** (barre,
   en-tête, menu).
6. **Le pont Android reste silencieux hors APK** : sans `window.cordova`,
   aucune écoute, aucun effet (prouvé en e2e).
7. **Le retour système ferme les couches** via `demandeRetour()` — le même
   pipeline que la touche Retour TV — et ne quitte qu'après un double
   appui averti.

## Grille d'acceptation sur un vrai GSM

À cocher à la main après installation de l'APK (les émulateurs ne rendent
ni les encoches, ni la barre gestuelle, ni la réactivité réelle du doigt) :

- [ ] **Lancement** : splash plein écran sans débordement sous la barre
      gestuelle ; pas de flash d'interface PC avant la coquille GSM.
- [ ] **Barre basse** : trois onglets, pilule active sous l'onglet courant ;
      tap = navigation immédiate ; jamais de contenu masqué derrière elle.
- [ ] **En-tête** : recherche ouvre le Spotlight ; avatar ouvre le menu en
      feuille ; déconnexion fonctionne depuis la feuille.
- [ ] **Retour système** : fiche média ouverte → Retour ferme la fiche ;
      réglages ouverts → Retour ferme les réglages ; aucune couche →
      avertissement, puis second appui quitte.
- [ ] **Clavier** : champ de connexion → le clavier ne zoome pas la page ;
      la vue se redimensionne (`adjustResize`), le champ reste visible.
- [ ] **Modales** : réglages et fiches s'ouvrent en feuille pleine largeur
      ancrée en bas ; le défilement interne ne fait pas rebondir la page.
- [ ] **Lecteur** : lecture en portrait, OSD accessible au tap, seek par
      zones latérales ; en paysage, plein écran sans chrome.
- [ ] **Encoche / safe-areas** : aucun contenu tronqué en haut (encoche)
      ni en bas (barre gestuelle), en portrait comme en paysage.
- [ ] **Sticky hover** : après un tap sur un onglet, aucun état « survolé »
      ne reste collé.
- [ ] **Zoom doigt** : pincer-zoom possible sur une page de contenu.

## Ce qui est volontairement hors périmètre

- **Plugins Cordova natifs** (statusbar, vibration) : `navigator.vibrate`
  fonctionne déjà ; `theme-color` teinte la barre système. Rien ne le
  justifie encore.
- **Paysage dédié du lecteur** : le comportement actuel (OSD tactile, zones
  de seek) est fonctionnel ; une vraie refonte paysage attend l'acceptation
  sur matériel.
- **iOS** : `ProfilAppareil` rend 'bureau' pour un iPhone tactile —
  délibéré. Le chantier iOS commencera par élargir la détection, pas par
  réécrire la coquille.
