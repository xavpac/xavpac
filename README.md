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


## XavPac 3.0 develop — connexions initiales

Sources branchées :

- OpenSky Network : positions aériennes dans un rayon de 20 km.
- Aviation Weather Center : METAR et TAF des aéroports.
- CelesTrak : éléments orbitaux ISS, Starlink et satellites visibles.
- Open-Meteo : météo locale et météo des aéroports.
- SIA/AZBA et Géoportail : liens officiels dans l’onglet Drone.

### Limites importantes

- OpenSky peut appliquer des limites d’accès et présenter des trous de couverture.
- Les routes commerciales, photos et types précis ne sont pas tous fournis par OpenSky.
- CelesTrak fournit les éléments orbitaux ; le calcul SGP4 des passages reste à ajouter.
- Il n’existe pas dans cette version de flux RTBA officiel automatiquement interprété.
  La page AZBA du SIA reste la référence opérationnelle.


## XavPac 3.1 — Aviation live

- Remplacement d’OpenSky par Airplanes.live.
- Recherche dans un rayon réel de 20 km autour de la position.
- Conversion automatique des unités ADS-B :
  - pieds vers mètres ;
  - nœuds vers mètres/seconde puis km/h dans l’interface.
- Affichage de l’indicatif, de l’immatriculation ou du code Mode S.
- Désactivation du cache Vercel pour les positions aériennes.
- Délai maximal de neuf secondes pour éviter de bloquer l’interface.

Airplanes.live est utilisé pour un usage non commercial et sans garantie de disponibilité.


## XavPac 3.2

- La fiche Aviation utilise désormais uniquement l’avion ADS-B réellement sélectionné.
- Suppression de l’avion fictif EZY72MB lorsque le flux ne retourne aucun appareil.
- Suppression des METAR et TAF de l’onglet Aviation.
- Ajout du METAR dans l’onglet Drone.
- Lecture française du vent, des rafales, de la visibilité, des nuages,
  de la température, du point de rosée, de la pression et de la catégorie de vol.
- Le METAR brut reste consultable dans un panneau repliable.


## XavPac 3.3

- METAR traduit uniquement dans l’onglet Drone.
- Carte Aviation rendue plus compacte.
- Carte Aviation centrée sur la géolocalisation avec un rayon de 20 km.
- Toutes les zones RTBA restent visibles, actives ou non.
- Détection automatique de la zone RTBA contenant la position GPS.
- Message clair : zone active, inactive, non vérifiée ou aucune zone.
- Les statuts RTBA restent à confirmer sur la source officielle SIA/AZBA.


## XavPac 3.5 — nouvelle cartographie

- Fond CARTO sombre plus lisible.
- Position GPS sous forme de point bleu animé.
- Silhouettes d’avions SVG fines, orientées selon le cap lorsqu’il est disponible.
- Cercle de rayon 20 km dans Aviation.
- Trajectoires plus fines et arrondies.
- RTBA toujours visibles avec un code couleur clair.
- Cartes adaptées aux ordinateurs, tablettes et téléphones.


## Centre opérationnel

La version 4.1 ajoute une page dédiée au CTA/CODIS avec :

- météo locale actualisée ;
- trafic aérien dans un rayon de 50 km ;
- moyens nationaux détectables par ADS-B ;
- carte de situation ;
- briefing automatique ;
- accès direct à Météo-France Vigilance, Vigicrues, NASA FIRMS, Blitzortung, AZBA et Géoportail UAS.

Les sources externes restent prioritaires pour toute décision opérationnelle.
