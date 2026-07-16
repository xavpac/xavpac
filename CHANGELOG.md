# Changelog

## 6.1.0

- Reconstruction complète de l’onglet Aviation dans l’esprit FlightWall.
- Ajout de la météo des villes via Open-Meteo.
- Ajout des photos d’aéronefs via PlaneSpotters avec illustration de secours.
- Ajout du bouton de recentrage GPS.
- Ajout des vues spécifiques Mac/PC, iPad et iPhone.
- Avions plus visibles, étiquettes détaillées, traces, radar et statistiques.
- Compilation Next.js et contrôle TypeScript validés.


## 5.1.0
- Refonte visuelle Aviation type FlightWall.
- Fonds de carte lisibles avec sélecteur Plan / Satellite / Sombre.
- Avions plus grands, contrastés et orientés selon le cap.
- Intégration de la carte officielle AZBA en direct.
- Vue départementale Saône-et-Loire conservée.
- Adaptation Mac, iPad et iPhone.

# 5.0.0 — GPS continu, Drone 71 et CODIS

- Géolocalisation continue avec `watchPosition` dans Aviation, Drone, CODIS, Astronomie et Météo.
- Bâgé-Dommartin devient la position de secours globale.
- Avions agrandis, plus contrastés, orientés selon leur cap et colorés par catégorie.
- METAR absent de l’onglet Aviation et conservé uniquement dans Drone.
- Carte Drone limitée à la Saône-et-Loire avec R45, R46 et R47 toujours visibles.
- Onglet Centre opérationnel renommé CODIS.
- Compteur de vues local visible dans l’en-tête.
- Météo calculée à la position GPS au lieu de Dommartin-lès-Cuiseaux.

## Sécurité aéronautique

Les tracés RTBA intégrés servent au repérage visuel. L’activation, les limites et les niveaux doivent être vérifiés auprès du SIA/AZBA, des NOTAM, SUP AIP et AIP officiels.

## 6.2.0 — Aviation FlightWall fidèle

- Refonte visuelle complète de l’onglet Aviation autour de la maquette validée.
- Grande carte claire par défaut, satellite et sombre en option.
- Avions agrandis, étiquettes compactes, halo pour l’appareil sélectionné.
- Bouton de recentrage GPS très visible.
- Météo affichée sous les villes sur la carte et dans le panneau latéral.
- Photo réelle via PlaneSpotters lorsqu’elle existe ; illustration explicitement signalée sinon.
- Recherche, filtres en vol/tous, favoris locaux et plein écran.
- Mise en page adaptée Mac/PC, iPad et iPhone.
- Mode aperçu local disponible uniquement avec `?preview=1`, clairement étiqueté.
- TypeScript et build Next.js validés.
