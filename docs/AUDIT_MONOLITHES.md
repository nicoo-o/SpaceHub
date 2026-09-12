# Audit des monolithes — atteintes extérieures et contrats de façade

*10 septembre 2026. Méthode identique au contrôle du lecteur
(`scripts/facade-appelants-check.mjs`) : balayage des récepteurs connus et
des membres underscore atteints hors de la classe, sur `core`, `ui`,
`jellyfin`, `integrations`, `plugins` et `scripts/` (harnais compris).*

## Pourquoi cet audit

`VideoPlayer` a un contrat de façade parce que sa décomposition est en
cours : une peau extraite ne doit pas retirer un membre qu'un appelant
utilise. Les trois monolithes restants (SettingsPanel 95 ko, SpatialNavigation
76 ko, ModalSlideUpSheet 73 ko) suivront la même règle quand on les
touchera (« ne pas refactorer pour refactorer », docs/PROJECT_STATUS.md).
L'audit établit AVANT le chantier ce que le monde extérieur touche
réellement sur chacun — le contrat n'existe que là où il y a des atteintes
à protéger.

## SettingsPanel — aucune atteinte, pas de contrat

Balayage des récepteurs `settingsPanel`, `panel`, `reglagesPanel`,
`SpaceHub.ui.settingsPanel` : **zéro** membre underscore atteint hors de la
classe. La surface utilisée est publique (`open`, `close`, résolution par
le registre de services). Un contrat de façade pour une surface déjà
100 % publique serait une bureaucratie vide : un appelant ne peut pas
perdre une cible qu'il n'a jamais eue.

**Verdict : pas de contrat justifié.** La règle existante « nouvelle
fonctionnalité = nouveau module » (contrat de taille) suffit tant que
personne n'atteint les internes.

## ModalSlideUpSheet — aucune atteinte, pas de contrat

Le balayage trouve des `modal._el` dans OnboardingWizard et VideoPlayer —
mais le récepteur y est une instance de **`ui/components/Modal.js`** (le
modal générique, qui expose bien `_el` et `setContent`), pas la feuille
slide-up. Sur `modalSlideUpSheet`, `slideUpSheet`, `sheet` : **zéro**
atteinte. La surface utilisée de la feuille est publique (`open`, `close`,
`destroy`).

**Verdict : pas de contrat justifié.** À surveiller si le balayage d'un
futur chantier trouve des `sheet._x` : le contrat naîtra à ce moment-là,
pas avant.

## SpatialNavigation — atteintes réelles, contrat créé

Deux familles d'atteintes réelles, toutes deux des **harnais** :

| Atteinte | Où | Usage |
|---|---|---|
| `_detectCurrentScope` | `core/dev/NavTestHarness.js` | diagnostic du scope courant (outil de recette TV) |
| `_state`, `_layerStack`, `_findSpatialTarget`, `_executeNavStep`, `_appliquerModalite`, `_handleKeyDown`, `_handleMouseMove`, `_stopInputRepeat` | `scripts/e2e.mjs` | le harnais PILOTE le moteur par l'intérieur pour prouver son comportement en vrai navigateur |

Ce sont des dépendances réelles : une future extraction qui renommerait un
de ces internes casserait les filets. Le contrat est donc justifié — c'est
le seul des trois monolithes où il l'est.

**Livrables :**

- `core/ContratSpatialNavigation.js` — source de vérité unique : méthodes
  publiques réellement appelées (17 au 12 septembre 2026, de `setFocus` à
  `handleAction`) + internes atteints par les harnais.
- `tests/FacadeNav.test.js` — filet côté classe : chaque membre du contrat
  existe sur une instance neuve.
- `scripts/facade-appelants-check.mjs` — étendu aux récepteurs
  `nav` / `spatialNavigation` : toute atteinte `nav._x` hors contrat échoue
  la chaîne.

### Suite (12 septembre 2026) — la surface DÉCLARÉE ne suffisait pas

Les trois garde-fous ci-dessus disent tous la même chose sous trois angles :
ce que le monde extérieur a le **droit** de toucher. Aucun ne disait ce qui est
**atteint** — et c'est la question qui décide d'une extraction : un membre
déclaré que rien n'atteint est du poids mort, un membre atteint qui n'est pas
déclaré est un trou qu'une extraction ouvrirait en silence.

La peau 0 de la décomposition a comblé cet angle mort :
`scripts/sonde-surface-nav.mjs` mesure l'atteint pendant la course e2e entière
et le croise avec ce que les sources référencent. Elle a trouvé que
`handleAction` n'était **ni déclaré, ni mort, ni atteint** (absent du contrat,
non compté comme mort car le moteur se l'appelle, jamais atteint par la course) :
il est entré au contrat. Et elle a montré que le premier balayage manquait la
forme chaînée `svc.nav().membre` — trois membres vivants passaient pour morts.

Le registre de la décomposition, la mesure complète et l'ordre d'extraction
sont dans `docs/DECOMPOSITION_SPATIALNAVIGATION.md`.

## Limites du balayage (rappel)

Comme pour le lecteur : une atteinte via une variable renommée
(`const m = sheet; m._x`) échappe au contrôle mécanique — la revue reste le
dernier gardien. Les tests unitaires des classes elles-mêmes ne sont pas
des « appelants » : ils testent le moteur, ils n'entrent pas au contrat.