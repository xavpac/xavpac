# XavPac TV — fonctionnement sans Mac

Objectif : ne plus avoir besoin d'ouvrir Xcode ni de laisser le Mac allumé pour utiliser ou mettre à jour XavPac TV.

## Architecture retenue

1. L'Apple TV exécute XavPac TV de manière autonome.
2. Le trafic, l'enrichissement des vols et les médias de destination viennent de XavPac/Vercel.
3. Les futures versions tvOS sont construites dans le cloud par GitHub Actions.
4. GitHub envoie automatiquement les builds signés vers App Store Connect avec une clé API Apple.
5. La distribution cible est l'App Store (éventuellement en mode non répertorié) afin de profiter des mises à jour automatiques de l'Apple TV.

TestFlight peut servir pendant la phase de mise au point, mais ses builds expirent après 90 jours. Pour un panneau permanent, l'App Store est la solution finale recommandée.

## Pré-requis Apple — une seule fois

Il faut être membre de l'Apple Developer Program.

Créer ensuite dans App Store Connect :

- une app tvOS nommée XavPac TV ;
- bundle identifier : `fr.xavpac.XavPacTV` ;
- une clé App Store Connect API autorisée à gérer les apps.

Dans GitHub > Settings > Secrets and variables > Actions, créer quatre secrets :

- `APPLE_TEAM_ID`
- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_PRIVATE_KEY_BASE64`

Pour `ASC_PRIVATE_KEY_BASE64`, encoder le fichier `.p8` téléchargé depuis App Store Connect en Base64 avant de le coller dans GitHub.

Le workflow `.github/workflows/xavpac-tv-appstore.yml` utilise ensuite la signature automatique Xcode et la clé App Store Connect. Aucun compte Apple n'est mémorisé dans le dépôt.

## Après cette configuration

Toute modification de :

- `XavPacTV/**`
- `XavPacTV.xcodeproj/**`

fusionnée sur `main` déclenche automatiquement :

1. archive tvOS Release ;
2. signature Apple automatique ;
3. incrément du numéro de build ;
4. envoi vers App Store Connect.

Aucun lancement de Xcode local n'est requis.

## Sur l'Apple TV

Pour une app distribuée sur l'App Store, activer :

Réglages > Apps > Mise à jour automatique.

Une fois l'app installée depuis l'App Store, les nouvelles versions peuvent ainsi arriver automatiquement.

## Vidéos de destination

XavPac TV essaie les fournisseurs dans cet ordre :

1. Pexels si `PEXELS_API_KEY` est configurée ;
2. Pixabay si `PIXABAY_API_KEY` est configurée ;
3. Wikimedia Commons pour les images de secours.

Les clés média restent côté Vercel et ne sont jamais embarquées dans l'application Apple TV.
