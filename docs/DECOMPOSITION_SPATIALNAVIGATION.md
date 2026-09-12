# Décomposition de SpatialNavigation.js — registre

`SpatialNavigation.js` est le moteur de navigation de toute l'application :
1 775 lignes, dix scopes, une pile de couches, une mémoire de focus, un moteur
spatial 2D, un répéteur de touches et un pipeline de retour système. C'est aussi
le module que **le plus grand nombre de fichiers touche** de l'extérieur.

Sa décomposition suit la règle de `docs/CONTRIBUTING.md` — les monolithes ne
grandissent plus ; on n'extrait une responsabilité que lorsqu'on la touche — et
la méthode éprouvée par `docs/DECOMPOSITION_VIDEOPLAYER.md`.

## Ce qui rend cette décomposition différente du lecteur vidéo

Le filet existait **déjà** : l'audit des monolithes
(`docs/AUDIT_MONOLITHES.md`) avait trouvé des atteintes réelles vers les
internes, et trois garde-fous avaient été posés avant toute extraction :

| Garde-fou | Ce qu'il fige |
|---|---|
| `core/ContratSpatialNavigation.js` | la surface publique que le monde extérieur touche, chaque entrée nommant son appelant |
| `tests/FacadeNav.test.js` | chaque membre du contrat existe encore sur une instance neuve |
| `scripts/facade-appelants-check.mjs` | aucun appelant ne touche un membre absent du contrat — et, depuis l'audit, les membres **publics** sont observés, pas seulement les internes |

Les trois disaient la même chose sous trois angles : **déclaré**. Aucun ne disait
ce qui est **atteint** — et c'est la seule question qui compte avant d'extraire,
parce qu'un membre déclaré que rien n'atteint est du poids mort qu'une extraction
liquide, tandis qu'un membre atteint qui n'est pas déclaré est un trou : une
extraction le retirerait sans que rien ne bronche.

La peau 0 ferme exactement cet angle mort.

## La méthode, identique à chaque étape

1. **Étape 0 — le filet, et la PREUVE de ce qu'il couvre.** Le contrat de façade
   et son test (déjà en place), plus l'instrument de surface
   (`scripts/sonde-surface-nav.mjs`) : il mesure, pendant la course e2e entière,
   quelles méthodes publiques le moteur atteint réellement, et croise ce relevé
   avec ce que les sources référencent. Un membre
   atteint-mais-non-référencé n'est pas un appelant : c'est un appel différé du
   moteur. Les confondre ferait élargir le contrat pour rien.
2. **Étape 1 — la peau.** La logique quitte la classe vers un module satellite
   (`core/nav/…`) en fonctions pures ou à injections étroites ; l'ÉTAT reste sur
   le moteur. Chaque méthode d'origine reste en place comme **talon de
   délégation** : la surface publique est inchangée, l'extraction est invisible
   pour les appelants comme pour les tests existants.
3. **Le budget baisse dans le même commit.** `scripts/taille-monolithes-check.mjs`
   reçoit le nouveau plafond : le contrat interdit désormais de regrossir.
4. **La chaîne verte avant tout atterrissage** : tests unitaires, contrôles
   statiques, build, poids, e2e sur deux générations de Chromium.

## Étape atterrie

| Étape | Périmètre | Référence | État |
|---|---|---|---|
| 0 | **L'instrument de surface.** `scripts/sonde-surface-nav.mjs` (sonde injectée avant tout script de la page, accumulateur côté harnais, verdict dans les deux sens) + son câblage dans la course e2e (scénario « Moteur de navigation : la surface DÉCLARÉE est réellement atteinte ») + `tests/SurfaceNav.test.js` (15 tests) pour la moitié statique. **Tailles : aucun budget touché** — rien n'a été extrait. | branche `decomp/spatialnavigation-peau0` | ✅ 2026-09-12 |

## La mesure, et ce qu'elle a trouvé

Relevé du 12 septembre 2026, sur la course e2e entière (38 scénarios, bureau et
téléphone) :

| Verdict | Membres | Sens |
|---|---|---|
| Contrat prouvé | **17/17** déclarés atteints ou exemptés | la surface déclarée est réelle |
| Trous de contrat | **aucun** | rien n'est atteint sans être déclaré et référencé |
| Privés de fait | `activateFocused`, `popFocus` | atteints, référencés nulle part : le moteur se rappelle lui-même (appel différé) |
| Exemptés (décision) | `demandeRetour`, `handleAction` | chemins APK et manette : une course web ne peut pas les jouer |
| Morts tolérés | `clearFocus`, `destroy`, `unextendFocusables`, `unregisterFocusables` | publics, atteints nulle part, référencés nulle part : le gisement des peaux suivantes |
| Surface atteinte | **17/23** méthodes publiques | ce que la course touche vraiment |

Trois choses que l'instrument a mises au jour, et qu'aucun des trois garde-fous
statiques ne pouvait dire :

- **`handleAction` tombait entre les deux classements.** Absent du contrat (donc
  censé être hors surface), non compté comme mort (le moteur se l'appelle :
  `onAction: (action) => this.handleAction(action)`) et jamais atteint par la
  course (un navigateur n'a pas de manette). Il n'était ni déclaré, ni mort, ni
  atteint : invisible. Or le pipeline manette y entre — **`GamepadInput`
  déclenche ce rappel** sur un bouton non directionnel (A/B/Start) ; l'appelant
  est le périphérique, jamais un module qui écrirait `nav.handleAction`. Il est
  entré au contrat, avec la même exemption que `demandeRetour`, et la traversée du
  rappel est désormais couverte par `tests/SpatialNavigation.test.js` — elle ne
  l'était pas, et l'exemption citait une couverture qui n'existait pas.
- **Trois membres vivants passaient pour morts.** Le premier balayage ne lisait
  que la forme `nav.membre` ; `pushLayer`, `onLayerClosed` et `pushFocus` sont
  atteints par la forme chaînée `svc.nav().membre` (le search, le tiroir). Les
  compter morts aurait fait privatiser une API réellement appelée — le faux
  positif le plus dangereux d'un audit de surface. Le balayage lit les deux
  formes, et un test le fige.
- **Deux membres n'ont pas besoin d'être publics.** `activateFocused` et
  `popFocus` sont atteints, jamais référencés : ce sont des appels différés du
  moteur (`popFocus` est programmé par `requestAnimationFrame` dans
  `onModalClosed`). Candidats à privatiser, pas trous de contrat.

**Preuves de l'étape 0** : course e2e **38/38** (dont le nouveau scénario de
surface) ; `tests/SurfaceNav.test.js` 15/15 ; `tests/FacadeNav.test.js` inchangé
et vert ; **l'instrument mord, et c'est vérifié** — une méthode publique fantôme
ajoutée au moteur fait échouer quatre tests dont le verdict réel, la méthode est
retirée, l'arbre redevient celui d'avant. La sonde ne mesure pas le harnais :
les gestes qui manquaient (F10 pour ouvrir puis refermer le tiroir, flèche puis
Entrée au clavier) sont **joués**, jamais appelés à la main.

## Ordre d'extraction confirmé pour la suite

L'ordre va du plus pur au plus enchevêtré, et commence par ce qui ne touche ni
le DOM du shell ni le pipeline d'entrée — c'est aussi ce que la mesure désigne :
`morts tolérés` et `privés de fait` sont les premiers gisements.

| Ordre | Étape | Périmètre candidat | Pourquoi cet ordre |
|---|---|---|---|
| 1 | **Le moteur spatial 2D** | `_findSpatialTarget`, `_chercherDansLesConteneurs`, `_cibleRedirigee`, `_cibleMemorisee`, `_substituerMemoire`, `_chercherParGeometrie`, `_rect` (~390 lignes avec la détection de scope) | fonctions pures, zéro état, le plus gros bloc cohésif. `_findSpatialTarget` reste en talon : le harnais e2e le pilote directement. |
| 2 | **La répétition des touches** | `_startInputRepeat`, `_stopInputRepeat`, `_onGamepadDirectionStart`, `_onGamepadDirectionEnd` (~140 lignes) | le module devient seul détenteur des minuteurs ; cycle de vie testable sur horloge fausse. |
| 3 | **Le registre de focusables** | `_focusablesDuChrome`, `_initializeDefaultScopes`, `registerFocusables`, `extendFocusables`, `unextendFocusables`, `unregisterFocusables`, `getFocusables`, `_filterVisibleElements`, `_isElementVisible` (~300 lignes) | c'est ici que vivent **deux des quatre morts tolérés** (`unextendFocusables`, `unregisterFocusables`) : l'extraction force à trancher. Les prédicats de visibilité sont testables sans DOM réel. |
| 4 | **Le contrôleur de focus et le pivot scroll** | `_getValidCurrentElement`, `setFocus`, `_scrollIntoInnerContainer`, `_scrollIntoViewIfNeeded`, `focusFirst`, `clearFocus`, `activerDiagnostic`, `dernierDiagnostic`, `getFocusedElement` (~190 lignes) | `clearFocus` (troisième mort toléré) se retire ou se privatise ici. Le contrat de façade est entièrement concerné : `setFocus`, `focusFirst`, `restorePreviousFocus`. |
| 5 | **Le retour, les couches et le tiroir** | `_coucheOuverte`, `_layerOf`, `_closeLayer`, `_handleBack`, `demandeRetour`, `_quitterApplication`, `_toggleSidebar`, `onModalOpened`, `pushLayer`, `onLayerClosed`, `onModalClosed`, `pushFocus`, `popFocus` (~320 lignes) | le pipeline de retour est déjà couvert par `PontAndroid` et par le scénario e2e du retour : le filet de comportement existe avant l'extraction. `popFocus` et `pushFocus` s'y privatisent ou s'y déclarent. |
| 6 | **L'entrée et les actions** | `_handleKeyDown`, `_handleKeyUp`, `_basculerLecture`, `_appliquerModalite`, `_initialiserModalite`, `_handleMouseMove`, `_handleResize`, `_executeNavStep`, `handleAction`, `activateFocused`, `_handlePaging`, `destroy` (~260 lignes) | en dernier : le harnais e2e pilote **cinq de ces membres à la main** (`_handleKeyDown`, `_handleMouseMove`, `_appliquerModalite`, `_executeNavStep`, `_stopInputRepeat`). Tant que la sonde ne prouve pas qu'un membre peut être privatisé, il reste en talon. |
| — | Hors périmètre | le constructeur, `_bindEvents`, `_unbindEvents` | l'assemblage reste dans la classe : c'est le rôle d'une façade. La décomposition s'arrête quand le moteur ne fait plus que monter des modules. |

## Non-négociables (rappel)

- **Le contrat tient à chaque étape.** Les 17 membres de
  `MEMBRES_APPELABLES` et les 9 internes de `CHAMPS_ATTEINTS` ne disparaissent ni
  ne changent de signature sans que `facade-appelants-check` échoue d'abord.
  Privatiser un membre, c'est d'abord l'abaisser au contrat, dans un commit qui
  le dit.
- **Rien n'est retiré que la sonde ne déclare mort.** Un membre `privé de fait`
  se privatise **après** que la sonde le confirme, jamais sur la foi d'un
  balayage de texte.
- **Les tests de logique existants passent inchangés** contre le module extrait ;
  s'ils doivent changer, l'extraction n'est pas invisible et le geste est faux.
- **La sonde évolue avec le code, dans le même commit.** Si une peau rend un
  membre atteignable (ou plus atteignable), `EXEMPTIONS`, `MORTS_TOLERES` et le
  verdict se mettent à jour ensemble — sinon le cliquet mesure le passé.
- **Une peau = une branche = un PR = la chaîne verte**, budget abaissé dans le
  même commit que la peau.
