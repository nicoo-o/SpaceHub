[English](README.md) · **Français**


# SpaceHub

**Le point de rencontre de la suite Space pour Windows 11.**

SpaceHub est la petite application et le contrat qui permettent à SpaceNotch, SpaceFiles et aux autres applications Space de se
connaître, de partager leur style, et d'être installées et vérifiées au même endroit.

## Les applications

| Application | Rôle | État |
|---|---|---|
| [SpaceNotch](https://github.com/nicoo-o/SpaceNotch) | Dynamic Island, lanceur, notifications | Publiée |
| [SpaceFiles](https://github.com/nicoo-o/SpaceFiles) | Explorateur de fichiers | En développement — source publiée, pas encore de version |
| [JellySpace](https://github.com/nicoo-o/JellySpace) | Centre multimédia Jellyfin | Publié — rejoindra plus tard |
| [Libraria](https://github.com/nicoo-o/libraria) | Livres et livres audio | Début — rejoindra plus tard |

## Ce que fait SpaceHub aujourd'hui (v1, pas encore publié)

- **Applications** : une ligne par application installée — version, version du protocole, état (en marche, arrêtée, non fiable,
  sans manifeste, illisible) — avec les boutons *Ouvrir* et *Réglages*.
- **Apparence** : le thème partagé (Windows / Sombre / Clair) et le mouvement (Complet / Réduit), écrits une fois dans un
  fichier de réglages partagé que les applications suivent.
- **Raccourcis** : quels raccourcis globaux sont pris et par qui, en lecture seule.
- **Modules** : les greffons trouvés sur le disque, listés sans rien charger.
- **Santé** : tube, protocole et dernière erreur de chaque journal, en lecture seule.
- Démarre à la demande, aucun processus en arrière-plan, mémoire nulle une fois fermé.

## Prévu

- Installer et mettre à jour les applications Space depuis un seul endroit (aujourd'hui chaque application a son propre script d'installation).
- Afficher JellySpace et Libraria à côté des autres.

## Le contrat (protocole Eco)

Les applications déclarent un manifeste, se parlent par des tubes nommés réservés à l'utilisateur courant (lignes JSON) et lisent
un fichier de réglages partagé. Pas de port réseau, pas de compte, pas de télémétrie. La spécification vit dans le dépôt de
SpaceFiles (`docs/ecosystem/`) en attendant d'être publiée ici.

## Installer

Pas encore publié. Suis ce dépôt ou le [profil](https://github.com/nicoo-o) pour la première version.

<sub>Note : ce nom de dépôt appartenait au centre multimédia Jellyfin, devenu [JellySpace](https://github.com/nicoo-o/JellySpace).</sub>
