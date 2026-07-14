# Contribution

## Branches conseillées

- `main` : version stable
- `develop` : intégration des nouveautés
- `feature/nom-fonction` : une fonction précise
- `fix/nom-correctif` : correction ciblée

## Avant un commit

```bash
npm run typecheck
npm run build
```

## Exemple

```bash
git checkout -b feature/notam-reels
git add .
git commit -m "Ajoute la connexion aux NOTAM"
git push -u origin feature/notam-reels
```
