# XavPac 6.4.0

Tableau de bord Aviation, Drone SDIS 71, Moyens nationaux, CODIS, Astronomie et Météo.

## Nouveautés 6.4.0 — fiabilisation Aviation

- Agrégateur serveur gratuit combinant Airplanes.live, ADSBDB et, en option, OpenSky gratuit.
- Callsign ADS-B, callsign ICAO, numéro commercial IATA et immatriculation séparés.
- Départ et arrivée partagés par la carte, la liste des cinq appareils proches et la fiche détaillée.
- Routes qualifiées : Confirmée, Probable, Déduite ou Non disponible.
- Annuaire local versionné des compagnies et logos, sans hotlink.
- Cache, déduplication et concurrence limitée pour préserver les quotas gratuits.
- Conversion du taux vertical corrigée et marqueurs Leaflet sécurisés.
- Provenance visible pour les routes : source, date, méthode et fraîcheur.
- Couverture courante et score de qualité pondéré sans transformer une observation historique en certitude.
- Mémoire locale des passages et routes récurrentes, toujours qualifiées « Déduites ».
- Détection des Canadair, Dash, Dragon, SAMU, appareils d’État et types remarquables.
- Onglet Santé pour Airplanes.live, ADSBDB, PlaneSpotters, OpenSky et CelesTrak.
- Chaque fournisseur est désactivable par variable d’environnement et remplaçable indépendamment.

XavPac reste un projet personnel utilisant uniquement des sources gratuites. OpenSky est facultatif et nécessite seulement un compte gratuit, sans carte bancaire.

## Confiance et provenance

- **Confirmée** : donnée directe concernant le vol en cours.
- **Probable** : donnée communautaire, notamment ADSBDB.
- **Déduite** : résultat des observations locales répétées de XavPac.
- **Inconnue** : preuve absente, insuffisante ou contradictoire.

Une route répétée ne devient jamais « Confirmée ». Les observations sont conservées dans le stockage local du navigateur et peuvent être supprimées avec les données du site.

## Nouveautés 5.0

- GPS suivi en continu lorsque le site reste ouvert.
- Aucune position de secours fictive : HOME apparaît uniquement après une mesure GPS réelle.
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
- Si le GPS est indisponible ou refusé, aucune position HOME n’est affichée.


## XavPac 6.1 — Aviation FlightWall

Cette version reconstruit réellement l’onglet Aviation :

- carte claire par défaut, satellite et sombre au choix ;
- avions ADS-B agrandis et orientés selon le cap ;
- météo affichée uniquement pour les villes de départ et d’arrivée lorsqu’une route est disponible ;
- bouton de recentrage sur la géolocalisation ;
- traces et cercle de portée activables ;
- fiche avion avec photo PlaneSpotters lorsque disponible ;
- calcul indicatif du prochain passage à partir de la position, du cap et de la vitesse ADS-B ;
- radar local, cinq appareils les plus proches et histogramme d’altitudes ;
- mises en page dédiées aux ordinateurs, tablettes et téléphones.

Les routes départ/arrivée ne sont pas inventées : elles restent indiquées comme indisponibles lorsque la source ADS-B ne les fournit pas.

## XavPac 6.2 — Aviation FlightWall fidèle

Cette version modifie uniquement l’onglet Aviation. Les données opérationnelles restent issues des sources publiques configurées dans le projet. Les départs et arrivées ne sont jamais inventés lorsqu’ils ne sont pas fournis. La photo provient de PlaneSpotters lorsqu’elle est disponible ; l’image de remplacement est explicitement identifiée comme une illustration.
