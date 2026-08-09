# XavPac 6.5 — plan d’évolution

## État audité

- Base actuelle : Next.js 14, React 18, TypeScript strict, Leaflet/React-Leaflet.
- Composants à réduire progressivement : `AviationPanel.tsx` (959 lignes), `DronePanel.tsx` (679 lignes), `StableMap.tsx` (349 lignes).
- Les routes Aviation disposent déjà d’une architecture de fournisseurs réutilisable.
- Les fonctions de passage, RTBA local, NOTAM, enrichissement et provenance possèdent déjà des tests utiles à préserver.
- Les captures présentes dans `artifacts/` sont des références locales et ne sont pas modifiées par le chantier.

## Diagnostic prioritaire Safari/iPhone

1. Une ancienne valeur `xavpac-favorites` non composée d’une liste pouvait atteindre l’état React puis provoquer une erreur sur `.includes()`.
2. Certains accès directs à `localStorage` pouvaient lever `SecurityError` ou `QuotaExceededError`.
3. Le carnet acceptait une liste JSON sans valider chaque observation.
4. Aucun module n’était isolé par une limite d’erreur React.
5. Leaflet ne recalculait pas explicitement sa taille après rotation ou changement du viewport visuel iOS.

## Architecture cible progressive

### Socle commun

- `app/lib/safeStorage.ts` : schéma, validation, migration et accès protégés.
- `app/lib/fullscreen.ts` : Fullscreen API optionnelle et repli CSS.
- `app/lib/geolocationQuality.ts` : qualité, âge et fraîcheur GPS.
- future `app/lib/sourceFreshness.ts` : état live, ancien, hors ligne ou non confirmé.
- `app/components/ModuleErrorBoundary.tsx` : isolation des univers fonctionnels.

### Aviation

Découpage prévu de `AviationPanel.tsx` vers :

- `AircraftMap` et `AircraftMapIcon` ;
- `AircraftDetails` et `AircraftBottomSheet` ;
- `AviationSummary` et `SourceHealth` ;
- `NationalAssetsMode` ;
- `PositionReferenceSelector` ;
- `cameraController` pour les états FREE, FOLLOW et FOCUS.

### Drone

Découpage prévu de `DronePanel.tsx` vers :

- `DroneMission`, `DroneSummary` et `DroneMap` ;
- `NotamCard` et `NotamDetail` ;
- `RtbaStatus` et `RtbaTimeline` ;
- `DroneTraffic`, `DroneWeather` et `MissionChanges`.

### Météo

Composants futurs séparés :

- `WeatherHome` ;
- `NetatmoPanel` ;
- `LightningPanel`, `LightningMap` et `LightningStats` ;
- `StormEpisode` et `WeatherHistory`.

## Migration du stockage

- Clé de version : `xavpac-storage-version`.
- Favoris : migration des anciens objets ou listes vers une liste unique de chaînes.
- HOME : uniquement deux coordonnées finies et valides.
- Position manuelle de session : validée, clairement étiquetée « POINT CHOISI » et conservée pendant la navigation entre modules ; « Reprendre le GPS » la supprime explicitement.
- Observations et identités : validation entrée par entrée ; les éléments incompatibles sont ignorés.
- Stockage bloqué ou plein : retour aux valeurs par défaut sans interrompre l’application.
- La réinitialisation d’un module efface uniquement ses préférences, jamais HOME, le carnet ou la mémoire aéronef.

## Ordre d’implémentation

1. Phase 0 — stockage sûr, Error Boundaries, plein écran CSS, rotation Leaflet, tests de robustesse.
2. Phase 1 — HOME/MOI/MISSION, qualité GPS, caméra FREE/FOLLOW/FOCUS, silhouettes et responsive dédié.
3. Phase 2 — couverture Aviation, moyens nationaux, trajectoire sélectionnée, fiche, « Où regarder ? » et passage HOME.
4. Phase 3 — mission Drone, NOTAM à trois niveaux, RTBA actuel/futur déterministe et briefing.
5. Phase 4 — Netatmo officiel, météo HOME/point/METAR séparée, source foudre autorisée et statistiques spatiales.
6. Phase 5 — mémoire, statistiques, records et « Ce qui a changé ».
7. Phase 6 — route TV et fondations Watch/multi-appareil.

## État d’avancement vérifié

- Phase 0 terminée dans le code : stockage versionné et tolérant aux données anciennes, limites d’erreur par module, plein écran avec repli Safari, recalcul Leaflet après rotation.
- Phase 1 — socle terminé : MOI, HOME et MISSION sont séparés ; la qualité et l’âge GPS sont exposés ; la carte Aviation possède les modes LIBRE, FOCUS et SUIVI ; les aéronefs utilisent une silhouette SVG unique centrée sur leur coordonnée, avec densité de libellé liée au zoom.
- Phase 2 — Aviation terminée localement : fusion Airplanes.live + adsb.fi par Mode-S avec provenance, santé des sources, appareils inconnus conservés, priorité « À regarder maintenant », moyens nationaux renforcés, trajectoire limitée à l’appareil sélectionné, fermeture explicite de la sélection, fiche HOME/MOI, « Où regarder ? » et passage HOME distinct.
- Phase 3 — socle Drone terminé localement : point, hauteur et créneau MISSION pilotent l’analyse ; les deux NOTAM SOFIA les plus proches disposent de l’original officiel, du français, de la provenance et d’une explication horizontale/verticale/temporelle ; le briefing sépare GPS, RTBA, NOTAM, trafic et météo.
- Le moteur RTBA est déterministe et testé pour l’activation actuelle, les créneaux futurs, les chevauchements multiples, l’absence de créneau et les données manquantes. La géométrie AIP locale est distincte de l’activation AZBA. En l’absence d’un accès officiel autorisé aux créneaux AZBA, l’application affiche « STATUT RTBA NON CONFIRMÉ » et ne produit jamais de faux vert.
- La position d’observation saisie volontairement est conservée pendant les changements de section. Les estimations de passage distinguent les minima observés et projetés et n’inventent ni ETA ni altitude lorsque les données nécessaires manquent.
- OGN/FLARM n’est pas intégré à ce stade : aucune source autorisée et suffisamment stable n’est encore établie dans le projet. Cette couverture reste un chantier ultérieur documenté, sans faux affichage.
- Responsive contrôlé à 390 × 844 et 844 × 390 sans débordement horizontal, pour Trafic aérien et Moyens nationaux, avec conservation du point choisi.
- Vérifications automatiques : 77 tests réussis, TypeScript et lint sans erreur, construction Next.js de production réussie ; aucun avertissement ou erreur navigateur pendant le contrôle fonctionnel final.
- Validation Safari réelle encore requise sur un iPhone physique avant toute publication officielle de la version 6.5.

## Tests à chaque phase

- lint et TypeScript strict ;
- tests unitaires des fonctions pures ;
- tests de migration et de données malformées ;
- construction Next.js de production ;
- contrôle iPhone portrait/paysage, iPad/Split View et Mac ;
- absence de perte de sélection, position, carte et filtres lors d’une rotation ;
- contrôle explicite de la provenance et de la fraîcheur des données critiques.

## Risques de régression à surveiller

- recentrage involontaire de Leaflet pendant un rafraîchissement ADS-B ;
- disparition d’un aéronef inconnu pendant l’enrichissement ;
- confusion entre HOME, MOI et MISSION ;
- faux état vert quand une source officielle est indisponible ;
- perte d’état lors du changement de composition responsive ;
- suppression accidentelle du carnet ou de la mémoire pendant une migration ;
- augmentation du nombre d’appels aux fournisseurs et dépassement de quotas.
