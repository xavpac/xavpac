# XavPac V7

Nouvelle base visuelle stable pour les modules **Aviation** et **Moyens nationaux**.

## Objectifs de cette étape

- grande carte centrale sombre ;
- même design pour Aviation et Moyens nationaux ;
- fiche détaillée à droite ;
- mini-radar, liste des cinq appareils proches et répartition par altitude ;
- punaise GPS réelle ;
- mise en page responsive Mac, PC, iPad et iPhone ;
- trafic ADS-B obtenu côté serveur via Airplanes.live ;
- aucune donnée fictive dans le mode normal.

## Aperçu visuel

Pour contrôler le design sans attendre une réception ADS-B :

```text
https://votre-site.vercel.app/?demo=1
```

Le bandeau affiche alors clairement **Aperçu visuel**. Sans `?demo=1`, seuls les appareils reçus en direct sont affichés.

## Installation

```bash
npm install
npm run dev
```

Puis ouvrir `http://localhost:3000`.

## Vérifications

```bash
npm run typecheck
npm run build
```

## Déploiement

Le projet est compatible Vercel. Relier le dépôt GitHub `xavpac/xavpac` à Vercel ; chaque commit sur `main` déclenchera ensuite une publication automatique.

## Sécurité opérationnelle

Les positions ADS-B publiques peuvent être incomplètes ou retardées. Elles ne remplacent jamais les sources aéronautiques et opérationnelles officielles.
