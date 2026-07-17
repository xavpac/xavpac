# XavPac Ultimate 7.3

Tableau de bord aviation et moyens nationaux, conçu pour Mac, PC, iPad et iPhone.

## Modifications principales

- géolocalisation réelle avec punaise HOME ;
- aucune météo des villes voisines sur la carte ;
- aucune liste de météo locale dans l’onglet Aviation ;
- deux blocs météo uniquement : ville de départ et ville d’arrivée ;
- saisie manuelle des villes lorsque le flux ADS-B ne fournit pas la route ;
- même design pour Aviation et Moyens nationaux ;
- photos d’appareils via Planespotters lorsqu’elles sont disponibles ;
- trafic via Airplanes.live ;
- météo via Open-Meteo ;
- compteur de visites conservé.

## Test local

```bash
npm ci
npm run dev
```

Puis ouvrir `http://localhost:3000`.

## Installation dans le dépôt GitHub déjà cloné

Depuis la racine du dépôt XavPac dans le terminal VS Code :

```bash
bash ~/Downloads/XavPac-7.3-online/INSTALLER-DANS-XAVPAC.command
```

Le script :

1. sauvegarde l’ancienne version dans Documents ;
2. remplace les fichiers du site ;
3. vérifie TypeScript et la compilation ;
4. crée le commit Git ;
5. pousse vers GitHub ;
6. déclenche le déploiement automatique Vercel.

## Limite transparente

La source ADS-B publique ne fournit pas toujours les villes de départ et d’arrivée. Les deux champs restent donc modifiables manuellement. Aucune route n’est inventée.
