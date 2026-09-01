# Onboarding SpaceHub

SpaceHub propose deux parcours de découverte distincts après la première connexion Jellyfin.

## Parcours utilisateur

Le parcours utilisateur est court et couvre :

1. le rôle de SpaceHub comme client Jellyfin ;
2. la navigation Accueil, Bibliothèques et Flux ;
3. le menu latéral et la touche Menu ;
4. la recherche et les fiches médias ;
5. la lecture et la reprise ;
6. les thèmes et préférences personnelles.

Les médias et bibliothèques mentionnés dans ce guide proviennent du serveur Jellyfin. Le guide ne fabrique pas de résultat de recherche ou de média de démonstration.

## Parcours administrateur

Le parcours administrateur est affiché seulement lorsque le compte possède `Policy.IsAdministrator === true`. Il présente :

1. les responsabilités administrateur ;
2. les bibliothèques et la provenance des métadonnées ;
3. la différence entre plugins Jellyfin serveur et plugins SDK SpaceHub ;
4. les intégrations Sonarr, Radarr, Prowlarr, Bazarr, Jellyseerr et qBittorrent ;
5. les thèmes, widgets, catalogue SDK et politiques locales/globales ;
6. les contrôles de sécurité et la console d’administration.

Un utilisateur standard ne peut pas ouvrir le guide administrateur.

## Première connexion et persistance

L’état est mémorisé dans `SettingsManager` avec une clé dérivée du serveur et de l’utilisateur :

```text
onboarding.<serveur>.<utilisateur>.user.completed
onboarding.<serveur>.<utilisateur>.user.version
onboarding.<serveur>.<utilisateur>.admin.completed
onboarding.<serveur>.<utilisateur>.admin.version
```

Ainsi, deux utilisateurs du même serveur n’héritent pas de la progression l’un de l’autre. Les guides peuvent être relancés ou réinitialisés depuis **Réglages → Général → Découverte de SpaceHub**.

## Commandes clavier et TV

- Flèches : déplacer le focus ;
- Entrée/A : activer l’action ;
- Retour/B ou Escape : fermer le guide ;
- Tab : parcourir les contrôles au clavier ;
- `Ignorer` : fermer sans marquer le parcours comme terminé ;
- `Terminer` : enregistrer la version courante comme terminée.

Le guide utilise le scope `onboarding` de `SpatialNavigation`, de sorte que les flèches ne traversent pas le dashboard situé derrière la modale.

## Test navigateur avec `npm run dev`

Le test navigateur permet de vérifier :

- le centrage et les animations du guide ;
- l’ordre et la progression des étapes ;
- le focus visible ;
- les commandes clavier ;
- la fermeture et la restauration du focus ;
- la séparation utilisateur/administrateur ;
- la persistance et la réinitialisation ;
- les erreurs console et les requêtes réseau.

Cette validation ne remplace pas une recette sur une vraie Android TV, Apple TV, télécommande Bluetooth/CEC ou un téléviseur Tizen/webOS.
