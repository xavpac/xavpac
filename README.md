# XavPac 2.0

Nouvelle base propre du projet XavPac.

## Modules

1. Aviation
2. Drone SDIS 71
3. Moyens nationaux
4. Astronomie

## Installation dans VS Code

```bash
npm install
npm run dev
```

Puis ouvrir :

```text
http://localhost:3000
```

## Vérification

```bash
npm run typecheck
npm run build
```

## État actuel

Cette version utilise encore des données de démonstration pour l’aviation, les NOTAM,
le RTBA, la météo et l’astronomie.

Elle ne doit pas être utilisée comme source unique de décision opérationnelle tant que
les flux officiels et les contrôles de cohérence ne sont pas connectés.

## Photo

La photo de l’Airbus A320 easyJet est une image illustrative placée dans :

```text
public/aircraft/easyjet-a320.jpg
```

Le crédit complet est conservé dans le projet.

## Version 2.1

- Suppression de la zone NOTAM sur la carte Drone.
- La carte Drone affiche uniquement la position et les zones RTBA.
- Ajout de l’onglet Météo Dommartin-lès-Cuiseaux.
- Données météo en direct via Open-Meteo.
- Prévisions à sept jours.
- Correction de l’erreur d’hydratation liée à l’heure du passage Aviation.

## Version 2.2

- Carte Aviation rapprochée du design FlightWall Pro Ultimate.
- Avion du moment mis en évidence de façon plus claire.
- Icônes avion plus petites et plus discrètes.
- Trajectoire du vol le plus proche conservée.
- Ajout du nom complet de l’aéroport de départ et d’arrivée.
- Ajout de la météo en direct au départ et à l’arrivée.
- Température, conditions et vent affichés pour chaque aéroport.

## Version 2.3

- Carte Aviation dézoomée.
- Zone d'affichage élargie autour de la position.
- Trajectoire du vol le plus proche plus facile à suivre.

## Version 2.4

- Carte Drone recentrée sur l’ensemble de la Saône-et-Loire.
- Suppression complète des NOTAM dans l’onglet Drone.
- Affichage exclusif des zones RTBA.
- RTBA actives, inactives et non vérifiées clairement différenciées.
- Icônes avion affinées, sans gros carré bleu.
- Le reste de l’interface reste inchangé.

Les zones RTBA de cette version sont des données de démonstration.

## Version 2.5

- Carte Aviation centrée automatiquement sur la position réelle.
- Vue initiale d'environ 20 km autour de l'utilisateur.
- Repli sur la position de référence si la géolocalisation est refusée.
- Informations Starlink et satellites enrichies.
- Direction, durée et visibilité indiquées pour chaque passage spatial.
- Aucun autre module modifié.
