# XavPac TV — Podium des approches (Apple TV)

Cette application **native tvOS** est distincte de l'écran web Vercel. Elle utilise Apple Maps, sans commandes tactiles, clics ni réglages. Conçue pour une Apple TV reliée à un grand écran ou à un vidéoprojecteur.

## Mode invités : proposition 2

- Carte satellite fixe centrée sur Bâgé-Dommartin, rayon de surveillance de 50 km, avec silhouettes adaptées aux avions et hélicoptères.
- **Podium 2–1–3** des trois aéronefs les plus proches, calculé sur leurs positions réelles : le n° 1 est au centre, plus grand, cerclé d'or. Photographies disponibles, immatriculations, types, compagnies, trajets et distances en km.
- À droite, belle vue de la ville d'arrivée du vol présenté. Quand un avion identifié passe à moins de 12 km de HOME, lecture vidéo automatique si un fichier lisible par AVPlayer est disponible. Sinon, photographie panoramique ou fond de secours.
- Une carte d'alerte spécifique identifie les seuls moyens de **Sécurité civile ou de l'Armée**. Elle clignote uniquement lorsqu'un moyen prioritaire est repéré par les sources reçues.
- Actualisation du trafic toutes les 8 secondes, son d'ambiance doux, grand texte lisible depuis la table et **aucune interaction nécessaire**.
- Backend : `https://xavpac-ty3i.vercel.app`. L'écran web public correspondant reste accessible sur `https://xavpac-ty3i.vercel.app/tv` mais n'installe pas l'application tvOS.

Le classement est fondé sur la proximité, pas sur une estimation de l'heure de passage. Les positions, vidéos et destinations dépendent des sources disponibles.

## Musique Apple Music — « Morceaux préférés »

- La playlist partagée `https://music.apple.com/fr/playlist/morceaux-pr%C3%A9f%C3%A9r%C3%A9s/pl.u-7jUWNk8oEy` est référencée dans `AppleMusicSoundtrack.swift`.
- À l'ouverture, XavPac TV tente la lecture automatique **dans l'application**, via MusicKit, sans modifier les panneaux existants.
- Au premier lancement, **accepter l'autorisation Apple Music** sur l'Apple TV. L'abonnement Apple Music doit permettre la lecture du catalogue.
- **Configuration indispensable du compte développeur** : activer le service MusicKit pour l'App ID correspondant à `fr.xavpac.XavPacTV` dans le portail Apple Developer. La signature Personal Team gratuite peut ne pas donner accès au service. L'ajout de code seul ne suffit pas à garantir la lecture.
- La recherche utilise l'identifiant de playlist partagée en premier, puis la playlist « Favorite Songs / Morceaux préférés » de la bibliothèque Apple Music associée à l'Apple TV.
- Si MusicKit ne peut pas être autorisé ou ne retrouve pas la playlist, l'ambiance musicale synthétique préexistante reste active et le radar continue.
- Le son d'ambiance de secours s'arrête après démarrage réussi d'Apple Music ; les alertes des moyens prioritaires restent prévues indépendamment.

## Mettre à jour l'application déjà installée sur Apple TV

Avec une installation réalisée depuis Xcode :

1. Sur le **Mac** ayant installé l'application, récupère la branche GitHub `xavpac-tv-invites-20261014` de `xavpac/xavpac`. Garde le même identifiant d'application : `fr.xavpac.XavPacTV`.
2. Ouvre `XavPacTV.xcodeproj` dans **Xcode**.
3. Vérifie la cible **XavPacTV**, le schéma **XavPacTV**, et ton équipe Apple dans **Signing & Capabilities**.
4. Place le Mac et l'Apple TV sur le même réseau, puis sélectionne ton Apple TV (par exemple « Salon Haut ») comme destination d'exécution.
5. Clique sur **Run ▶**. Xcode compile et réinstalle la nouvelle version sur l'Apple TV. Il n'est normalement pas nécessaire de supprimer l'ancienne application lorsque l'identifiant de signature reste compatible.

Le workflow GitHub `.github/workflows/xavpac-tv-validation.yml` compile la version tvOS sur un Mac distant **pour validation**, mais ne peut pas la déployer sur ton Apple TV sans la signature et la distribution Apple configurées.

## Mise à jour sans Mac par la suite

Le projet contient aussi `.github/workflows/xavpac-tv-appstore.yml` pour la distribution vers **App Store Connect**. Cela nécessite un compte Apple Developer, l'application créée dans App Store Connect et les quatre secrets Apple prévus dans `DISTRIBUTION_SANS_MAC.md`. Une fois la distribution autorisée, TestFlight peut faciliter les mises à jour sans Xcode.

## Vérification technique

- Schéma : `XavPacTV`
- Plateforme : tvOS 17+
- ID : `fr.xavpac.XavPacTV`
- Compilation : GitHub Actions sur `macos-15`, cible `generic/platform=tvOS Simulator`, sans signature
- Limite : une compilation réussie ne prouve pas que les médias distants fonctionneront tous sur l'appareil physique.
