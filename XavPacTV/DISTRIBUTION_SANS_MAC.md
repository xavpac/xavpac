# XavPac TV — fonctionnement sans Mac au quotidien

Objectif : ne plus avoir besoin d’ouvrir Xcode ni de laisser le Mac allumé pour utiliser ou mettre à jour XavPac TV.

## Solution retenue : GitHub Actions + App Store Connect

Le dépôt contient maintenant un workflow capable de compiler, signer et envoyer XavPac TV vers App Store Connect depuis un Mac de build dans le cloud. Apple permet à `xcodebuild` de s’authentifier avec une clé App Store Connect API, sans session Xcode locale.

Le Mac personnel n’est donc plus nécessaire pour les futures mises à jour une fois la configuration Apple faite.

### Important

Avec un compte **Personal Team** gratuit, une app installée directement depuis Xcode reste temporaire. Pour une installation durable et des mises à jour sans Mac, il faut rejoindre l’**Apple Developer Program**.

## Configuration unique — depuis le web

1. Rejoindre l’Apple Developer Program.
2. Créer l’app **XavPac TV** dans App Store Connect.
3. Utiliser le bundle identifier `fr.xavpac.XavPacTV`.
4. Créer une clé **App Store Connect API**.
5. Dans GitHub > Settings > Secrets and variables > Actions, ajouter :
   - `APPLE_TEAM_ID`
   - `ASC_KEY_ID`
   - `ASC_ISSUER_ID`
   - `ASC_PRIVATE_KEY_BASE64`
6. Pour `ASC_PRIVATE_KEY_BASE64`, encoder le fichier `.p8` téléchargé depuis App Store Connect en Base64 avant de le coller dans GitHub.

Le workflow `.github/workflows/xavpac-tv-appstore.yml` :

- archive XavPac TV en Release ;
- utilise la signature automatique Apple ;
- incrémente automatiquement le numéro de build ;
- envoie le build vers App Store Connect.

Aucun compte Apple ni clé privée n’est stocké dans le dépôt.

## Ensuite

Toute modification de :

- `XavPacTV/**`
- `XavPacTV.xcodeproj/**`

fusionnée sur `main` peut déclencher automatiquement la distribution.

Pour la phase de test, TestFlight est pratique, mais un build TestFlight expire après 90 jours.

Pour le mode panneau permanent, la cible finale est l’**App Store**, éventuellement en **app non répertoriée**. Une fois installée depuis l’App Store, l’Apple TV peut appliquer les mises à jour automatiquement si :

**Réglages > Apps > Mise à jour automatique** est activé.

## Xcode Cloud

Le scheme `XavPacTV` est aussi partagé dans le dépôt. Xcode Cloud reste donc une solution de secours possible, mais il n’est pas nécessaire pour la voie GitHub Actions + App Store Connect.

## Médias de destination

Le backend XavPac essaie les sources dans cet ordre :

1. Pexels si `PEXELS_API_KEY` est configurée ;
2. Pixabay si `PIXABAY_API_KEY` est configurée ;
3. Wikimedia Commons pour les images de secours.

Les clés média restent côté Vercel et ne sont jamais embarquées dans l’app Apple TV.

## État du projet

- version tvOS : **2.0**
- bundle identifier : `fr.xavpac.XavPacTV`
- scheme partagé : **XavPacTV**
- automatisation App Store Connect : prête, en attente des identifiants Apple Developer
