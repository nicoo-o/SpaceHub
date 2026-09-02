# Recette sur matériel réel

*Point « priorité 2 » de l'audit externe. À faire par vous : je n'ai aucun appareil.*

## Pourquoi ce document existe, et ce qu'il ne remplace pas

Tout ce que je pouvais vérifier seul l'est : 117 tests unitaires, 6 contrôles
statiques, 11 scénarios de bout en bout dans un vrai Chromium. Ils tournent avec
`npm run verify` et sont tous au vert.

Aucun de ces contrôles ne touche une manette, une télécommande ou un téléviseur.
Un navigateur sans tête ne dit rien sur la latence d'une touche, sur la lisibilité
à trois mètres, ni sur la réaction d'un Chromium de 2020 embarqué dans un
téléviseur. C'est exactement ce que cette recette couvre, et c'est le dernier
point de l'audit qui reste ouvert.

**Écart connu, à confirmer d'abord.** Un seul comportement n'a pas de parité
stricte entre les entrées, et il est ici en tête de liste : dans le lecteur
vidéo, l'avance rapide accélère plus vite au clavier qu'à la manette (le clavier
suit la répétition native du système, la manette une cadence propre de 280 ms
puis 100 ms). C'est délibéré, mais il faut voir si c'est agréable en vrai.

---

## Avant de commencer

### Construire et servir

```bash
npm ci
npm run verify        # doit finir sur « 11/11 scénario(s) au vert »
npm run build
npm run preview       # sert dist/ ; notez l'adresse affichée
```

Pour tester depuis un téléviseur ou un téléphone, l'application doit être servie
sur le réseau local et **en HTTPS** : sans HTTPS, le plein écran, le stockage
persistant et le service worker hors-ligne ne fonctionnent pas de la même façon.
`docs/DEPLOIEMENT.md` donne les configurations nginx et Caddy, avec les deux
pièges (`proxy_read_timeout`, `proxy_buffering off`, en-têtes `Upgrade`).

### Ce qu'il me faut en retour

Pour chaque anomalie, ces cinq éléments — sans eux je ne peux que deviner :

1. **Appareil et version** — « Samsung QE55Q60B, firmware 1560 », « Xbox Series X »
2. **Ce que vous avez fait**, touche par touche
3. **Ce que vous attendiez**
4. **Ce qui s'est passé**
5. **La console** si vous pouvez l'ouvrir (voir « Relever les erreurs » plus bas)

Une photo ou une vidéo du téléviseur vaut mieux qu'une description : je vois le
rendu réel, pas votre interprétation.

---

## A — PC, clavier et souris

Navigateur : Chrome ou Edge à jour, fenêtre maximisée.

| # | Manipulation | Attendu |
|---|--------------|---------|
| A1 | Ouvrir l'application, se connecter | L'écran de connexion apparaît, la connexion aboutit, le tableau de bord se charge |
| A2 | Flèches directionnelles sur le tableau de bord | Le focus se déplace visiblement ; jamais de saut vers une zone lointaine |
| A3 | Maintenir Flèche droite dans un carrousel | Défilement fluide qui **accélère** après ~1 s ; s'arrête net au relâchement |
| A4 | `Ctrl+K` | La recherche s'ouvre par-dessus tout, le curseur est dans le champ |
| A5 | `/` hors d'un champ de saisie | Ouvre aussi la recherche |
| A6 | Taper `/` **dans** le champ de recherche | Écrit un `/`, n'ouvre rien |
| A7 | Ouvrir les Réglages, **puis** la recherche, puis Échap | La **recherche** se ferme ; les réglages restent |
| A8 | Ouvrir la recherche, **puis** les Réglages, puis Échap | Les **réglages** se ferment ; la recherche reste |
| A9 | Échap sans rien d'ouvert | Rien ne se passe, aucune erreur |
| A10 | `Ctrl+Alt+A` | Le panneau d'administration s'ouvre (si votre compte est administrateur) |
| A11 | Basculer le thème clair / sombre | Tout reste lisible ; aucun texte blanc sur blanc |
| A12 | Bouger la souris après une navigation au clavier | Le mode bascule ; le survol répond |

**Lecteur vidéo** — lancer un film, puis :

| # | Touche | Attendu |
|---|--------|---------|
| A13 | `K` ou Espace | Lecture / pause |
| A14 | `J` | Recule de 10 s |
| A15 | `L` | Avance de 10 s |
| A16 | `M` | Ouvre le volume |
| A17 | `F` | Plein écran, et retour |
| A18 | `S` | Panneau audio / sous-titres |
| A19 | `C` | Réglages de lecture |
| A20 | `E` | Liste des épisodes (série) |
| A21 | Maintenir Flèche droite | Avance rapide continue, qui accélère |
| A22 | Échap | Ferme le lecteur, sans laisser d'écran noir |

**Hors-ligne** — après avoir chargé l'application au moins une fois :

| # | Manipulation | Attendu |
|---|--------------|---------|
| A23 | Couper le serveur Jellyfin, recharger la page | L'application s'affiche et annonce clairement l'absence de serveur ; **pas d'écran noir** |
| A24 | Télécharger un média, couper le réseau, le lire | Il se lit depuis le stockage local |
| A25 | Vérifier la place occupée dans les Réglages | Le chiffre correspond à ce qui est téléchargé |

---

## B — Manette Xbox (sur PC)

Brancher la manette **avant** d'ouvrir la page, puis appuyer sur un bouton :
l'API navigateur n'expose la manette qu'après une première pression.

| # | Manipulation | Attendu |
|---|--------------|---------|
| B1 | Croix directionnelle | Déplace le focus comme les flèches |
| B2 | Stick gauche, poussée franche | Idem ; **aucune dérive** au repos (zone morte 0,18) |
| B3 | Maintenir la croix vers la droite | Défilement qui accélère — **la même cadence qu'au clavier (A3)** |
| B4 | Bouton A | Valide, comme Entrée |
| B5 | Bouton B | Retour, comme Échap |
| B6 | Bouton B avec deux couches ouvertes | Ferme celle du **dessus** (même règle qu'en A7/A8) |
| B7 | Menu / Start | Ouvre le menu latéral |
| B8 | Dans le lecteur : croix gauche/droite maintenue | Avance rapide. **Comparez explicitement avec A21** — c'est l'écart connu |
| B9 | Débrancher la manette pendant la navigation | Aucune erreur, aucun défilement resté bloqué |
| B10 | Rebrancher | Reprend sans recharger la page |

---

## C — Télécommande de téléviseur

L'application traite la télécommande comme un clavier : les résultats devraient
être identiques à la section A. C'est cette hypothèse qu'on vérifie.

| # | Touche | Attendu |
|---|--------|---------|
| C1 | Les quatre directions | Déplacent le focus |
| C2 | OK / Entrée | Valide |
| C3 | Retour de la télécommande | Ferme la couche du dessus |
| C4 | Touche Menu, Guide ou Options | Ouvre le menu latéral |
| C5 | Lecture / Pause | Agit dans le lecteur |
| C6 | Chaîne + / Chaîne − | Page précédente / suivante dans une longue liste |
| C7 | Maintenir une direction | Défilement qui accélère, sans emballement |
| C8 | Touche Retour depuis l'accueil | **Notez ce qui se passe** — c'est le cas où le comportement dépend le plus du téléviseur |

---

## D — Téléviseur : ce qui ne se voit qu'en vrai

À faire **depuis le canapé**, à distance normale, avec la télécommande.

| # | Point | Ce qu'il faut regarder |
|---|-------|------------------------|
| D1 | Démarrage | Combien de secondes entre l'ouverture et le tableau de bord utilisable ? |
| D2 | Lisibilité | Les textes secondaires sont-ils lisibles à 3 m ? Les notes, durées, sous-titres de carte ? |
| D3 | Focus | Voit-on **toujours** où est le focus, sans le chercher ? |
| D4 | Débordement | Un élément sort-il de l'écran ? (surbalayage : certains téléviseurs rognent 3 à 5 % des bords) |
| D5 | Fluidité | Le défilement des carrousels est-il fluide, ou saccadé ? |
| D6 | Latence | Combien de temps entre l'appui et le déplacement du focus ? Au-delà de ~150 ms, c'est perceptible |
| D7 | Images | Les affiches se chargent-elles avant qu'on arrive dessus, ou après ? |
| D8 | Lecture | La vidéo démarre-t-elle sans transcodage ? (à vérifier dans le tableau de bord Jellyfin) |
| D9 | Longue session | Après 30 min de navigation, est-ce toujours aussi réactif ? |
| D10 | Veille | Mettre le téléviseur en veille, revenir : l'application est-elle toujours vivante ? |

**Le modèle et l'année du téléviseur comptent.** L'application vise
Chromium 69 (téléviseurs de 2020 et plus). Un modèle de 2018 ou 2019 devrait
partiellement fonctionner, un modèle de 2017 probablement pas. Si l'écran reste
**noir sans aucun message**, c'est le symptôme d'une syntaxe non comprise :
notez-moi le modèle et l'année, c'est l'information décisive.

---

## E — Téléphone et tablette

| # | Manipulation | Attendu |
|---|--------------|---------|
| E1 | Ouvrir sur téléphone | Mise en page adaptée, rien ne déborde en largeur |
| E2 | Faire défiler un carrousel au doigt | Fluide, avec inertie |
| E3 | Toucher une carte | Ouvre la fiche |
| E4 | Balayer la fiche vers le bas | La ferme |
| E5 | Pivoter en paysage | La mise en page suit |
| E6 | Lire une vidéo | Les contrôles sont assez grands pour le doigt |

---

## Relever les erreurs

**PC** : `F12` → onglet Console. Copiez tout ce qui est en rouge.

**Téléviseur Samsung (Tizen)** : activer le mode développeur dans l'application
« Apps » (entrer 12345 avec la télécommande), puis se connecter avec les
outils Tizen. Long — à ne faire que si un problème ne se reproduit pas sur PC.

**Téléviseur LG (webOS)** : outils webOS Dev Mode, même remarque.

**Le plus simple, sur n'importe quel téléviseur** : reproduire le problème sur
PC avec la fenêtre réduite à la taille de l'écran du téléviseur et Chrome forcé
en Chromium 69 (`--user-agent`). Si le problème apparaît là, la console PC
suffit.

---

## Gabarit de retour à me renvoyer

Copiez ceci, remplissez, renvoyez-le tel quel.

```
=== RECETTE SPACEHUB — <date> ===

MATÉRIEL
  PC        : navigateur + version, système
  Manette   : modèle, filaire ou sans fil
  Téléviseur: marque, modèle exact, année, version du firmware
  Téléphone : modèle, système, navigateur
  Serveur   : version de Jellyfin, HTTPS oui/non, reverse proxy lequel

RÉSULTATS  (une ligne par test : OK / KO / non testé)
  A1..A25 :
  B1..B10 :
  C1..C8  :
  D1..D10 : (réponses en texte, pas OK/KO)
  E1..E6  :

L'ÉCART CONNU (A21 vs B8)
  L'avance rapide au clavier est-elle nettement plus rapide qu'à la manette ?
  Est-ce gênant ?  →

ANOMALIES  (une fiche par anomalie)
  #1
    Appareil    :
    Manipulation:
    Attendu     :
    Obtenu      :
    Console     :
    Photo/vidéo : oui/non

IMPRESSION GÉNÉRALE
  Le plus agréable          :
  Le plus agaçant           :
  Utiliseriez-vous ceci tous les jours ?  →
```

---

## Ce que je ferai de vos retours

Chaque anomalie reproductible devient d'abord un test — unitaire si elle tient
dans un module, de bout en bout si elle demande un vrai navigateur — **puis**
un correctif. Dans cet ordre : c'est ce qui garantit qu'elle ne revient pas, et
c'est la démarche qui a permis de trouver, cette session, la couche fermée par
erreur et le 429 jamais retenté.

Ce qui ne se reproduit que sur votre téléviseur et nulle part ailleurs, je vous
le dirai franchement plutôt que de deviner : sans l'appareil, je peux proposer
une hypothèse, pas une vérification.
