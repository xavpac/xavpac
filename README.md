# XavPac 5.0

Tableau de bord Aviation, Drone SDIS 71, Moyens nationaux, CODIS, Astronomie et Météo.

## Nouveautés 5.0

- GPS suivi en continu lorsque le site reste ouvert.
- Position de secours : Bâgé-Dommartin.
- Avions nettement plus visibles sur la carte.
- Onglet Aviation sans METAR.
- Onglet Drone cadré uniquement sur la Saône-et-Loire.
- R45, R46 et R47 affichées en permanence, avec statut à vérifier sur l’AZBA officiel.
- Onglet CODIS distinct.
- Compteur de vues local affiché dans l’en-tête.
- Météo à la position GPS.

## Données et prudence

XavPac présente des données publiques et des aides de repérage. Pour les décisions opérationnelles et aéronautiques, les sources officielles restent prioritaires. L’information AZBA ne remplace pas les NOTAM, SUP AIP et AIP.

## Développement

```bash
npm install
npm run typecheck
npm run build
```


## XavPac 5.1 — Aviation FlightWall et cartes lisibles

- Carte Aviation claire par défaut, avec choix Plan / Satellite / Sombre.
- Avions nettement agrandis et renforcés pour rester visibles sur tous les fonds.
- Interface responsive Mac, iPad et iPhone.
- Onglet Drone avec deux vues : Saône-et-Loire et carte officielle AZBA du SIA en direct.
- Les couleurs officielles AZBA sont affichées par le service SIA lui-même : rouge actif, bleu inactif.
- Bâgé-Dommartin reste la position de secours lorsque le GPS est indisponible.


## XavPac 6.1 — Aviation FlightWall

Cette version reconstruit réellement l’onglet Aviation :

- carte claire par défaut, satellite et sombre au choix ;
- avions ADS-B agrandis et orientés selon le cap ;
- météo actuelle affichée sous les villes proches ;
- bouton de recentrage sur la géolocalisation ;
- traces et cercle de portée activables ;
- fiche avion avec photo PlaneSpotters lorsque disponible ;
- calcul indicatif du prochain passage à partir de la position, du cap et de la vitesse ADS-B ;
- radar local, cinq appareils les plus proches et histogramme d’altitudes ;
- mises en page dédiées aux ordinateurs, tablettes et téléphones.

Les routes départ/arrivée ne sont pas inventées : elles restent indiquées comme indisponibles lorsque la source ADS-B ne les fournit pas.
