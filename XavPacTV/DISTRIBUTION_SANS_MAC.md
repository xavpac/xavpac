# XavPac TV — fonctionnement sans Mac au quotidien

Objectif : ne plus avoir besoin d’ouvrir Xcode ni de laisser le Mac allumé pour utiliser ou mettre à jour XavPac TV.

## Solution retenue : Xcode Cloud + App Store / TestFlight

Apple fournit Xcode Cloud pour compiler, signer et distribuer automatiquement une app tvOS depuis le dépôt Git. C’est la solution la plus fiable pour éviter les réinstallations manuelles via Xcode.

### Important

Avec un compte **Personal Team** gratuit, ce mode n’est pas disponible : les profils de développement expirent au bout de 7 jours et l’app doit être reconstruite/réinstallée périodiquement.

Pour ne plus dépendre du Mac ensuite, il faut rejoindre l’**Apple Developer Program**.

## Après l’inscription Apple Developer

Une seule configuration initiale est nécessaire :

1. Créer l’app **XavPac TV** dans App Store Connect.
2. Utiliser le bundle identifier `fr.xavpac.XavPacTV`.
3. Dans Xcode, configurer une première fois **Xcode Cloud** pour le projet XavPacTV.
4. Choisir le scheme partagé **XavPacTV**.
5. Créer un workflow qui se déclenche sur les changements du dossier XavPacTV.
6. Ajouter une action **Archive** pour tvOS.
7. Ajouter une post-action de distribution vers **TestFlight** pendant la phase de test.
8. Après validation, distribuer l’app via l’App Store pour bénéficier des mises à jour automatiques natives de l’Apple TV.

Après le premier workflow Xcode Cloud réussi, les workflows peuvent être modifiés et gérés depuis App Store Connect sans retourner dans Xcode.

## Résultat

Une fois cette configuration faite :

- le Mac n’a pas besoin d’être allumé ;
- les builds sont faits sur les serveurs Apple ;
- la signature est gérée par Apple ;
- les futures versions sont envoyées automatiquement ;
- l’Apple TV fonctionne seule avec XavPac TV ;
- via l’App Store, les mises à jour peuvent s’installer automatiquement si l’option **Réglages > Apps > Mise à jour automatique** est activée.

TestFlight reste excellent pour tester, mais chaque build de test expire après 90 jours. Pour un panneau permanent, la distribution App Store est préférable.

## Médias de destination

Le backend XavPac essaie les sources dans cet ordre :

1. Pexels si `PEXELS_API_KEY` est configurée ;
2. Pixabay si `PIXABAY_API_KEY` est configurée ;
3. Wikimedia Commons pour les images de secours.

Les clés média restent côté Vercel et ne sont jamais embarquées dans l’app Apple TV.

## État du projet

Le scheme XavPacTV est partagé dans le dépôt pour être détecté par Xcode Cloud.
La version tvOS est actuellement **2.0**.
