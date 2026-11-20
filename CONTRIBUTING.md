# Contribuer à InkFlow

Merci de contribuer au projet ! Ce guide décrit le workflow recommandé pour les collaborateurs autorisés.

## 1. Préparer votre environnement local

```bash
git clone https://github.com/vtudkbgy/inkflow.git
cd inkflow
npm install
npm test
```

## 2. Créer une branche dédiée

Ne poussez pas directement vos modifications en cours sur `main`. Créez une branche descriptive :

```bash
git checkout -b feat/ma-nouvelle-fonctionnalite
# ou
git checkout -b fix/correction-stylet
```

## 3. Vérifier avant de soumettre

Avant chaque commit / Pull Request, assurez-vous que toute la suite de tests passe sans erreur :

```bash
npm test
npm run verify:webview2
```

### Règles importantes
- **100 % hors-ligne** : n'ajoutez aucune dépendance CDN externe (toutes les bibliothèques doivent résider dans `vendor/` ou `node_modules`).
- **Performance 60/120 FPS** : ne redessinez jamais le calque statique (`#inkCanvas`) pendant `pointermove` ; passez par le calque actif (`#activeInkCanvas`) et invalidez `staticInkCache` uniquement lors d'une mutation.
- **Mémoire RAM** : tout canvas temporaire ou ressource PDF doit être libéré proprement lors du changement de page ou de cahier.

## 4. Ouvrir une Pull Request

1. Poussez votre branche : `git push -u origin feat/ma-nouvelle-fonctionnalite`
2. Ouvrez une **Pull Request** vers `main` sur GitHub en remplissant le modèle fourni.
3. Attendez le feu vert du workflow **GitHub Actions CI** (`npm test` + `npm run verify:webview2`) puis la relecture du mainteneur.
