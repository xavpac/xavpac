# XavPac TV

Première version native tvOS de XavPac.

## Fonctionnalités

- Carte Apple Maps plein écran.
- Trafic XavPac en direct via `/api/aircraft`.
- Rafraîchissement toutes les 8 secondes.
- Liste des 12 appareils les plus proches.
- Navigation et sélection avec la télécommande Apple TV.
- Recentrage automatique sur l'appareil sélectionné.
- Indicatif, immatriculation/type/opérateur, altitude, vitesse, cap et distance.

## Installation sur l’Apple TV

1. Sur le Mac, installe Xcode depuis le Mac App Store.
2. Ouvre `XavPacTV.xcodeproj`.
3. Dans Xcode, sélectionne le projet **XavPacTV**, puis la cible **XavPacTV**.
4. Dans **Signing & Capabilities**, choisis ton équipe Apple dans **Team**.
5. Mets le Mac et l’Apple TV sur le même réseau.
6. Dans Xcode : **Window > Devices and Simulators**, puis ajoute/jumelle l’Apple TV si nécessaire.
7. Choisis l’Apple TV comme destination d’exécution dans la barre supérieure.
8. Clique sur ▶︎ **Run**.

Xcode crée alors le profil de développement et installe XavPac TV sur l’Apple TV.

## Plus tard : TestFlight

Une fois l’app stabilisée, le même projet pourra être envoyé dans App Store Connect et distribué sur l’Apple TV via TestFlight. Cela rendra les mises à jour beaucoup plus simples.
