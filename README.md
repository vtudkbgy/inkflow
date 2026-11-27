# ✒️ InkFlow (Plume Studio Pro)

Application de prise de notes manuscrites **100 % locale et hors-ligne** (Windows Ink / Stylet, Page Infinie, PDF Haute Résolution, LaTeX & Reconnaissance d'équations), compilable en exécutable Windows natif (`.exe` via Tauri v2 / WebView2) ou utilisable directement dans le navigateur.

---

## ✨ Fonctionnalités principales

- **Rendu ultra-fluide 60/120 FPS** :
  - Architecture triple canvas (`#pdfBgCanvas` fond verrouillé + `#inkCanvas` calque statique avec cache bitmap + `#activeInkCanvas` rendu incrémental $O(1)$ sans latence même sur les traits très longs).
  - Support natif du stylet Windows Ink (`PointerEvent`, pression dynamique, `getCoalescedEvents`).
  - **Boutons latéraux du stylet** : gomme temporaire (maintien = gomme, relâchement = retour au stylo) et **lasso temporaire** sur le 2e bouton.
  - **Roue de couleurs radiale** : restez immobile en maintenant le bouton lasso pour changer de couleur sans quitter la zone d'écriture.
  - **Formes géométriques automatiques (Hold-to-Shape)** : tracez un cercle, une flèche, une ligne, un rectangle ou un triangle et maintenez à la fin pour le redresser automatiquement (activable/désactivable).
- **Page infinie & Navigation** :
  - Zoom par pincement (Pinch-to-Zoom) ou `Ctrl + Molette`, déplacement libre (`Pan`), fonds personnalisables (quadrillé, Seyès, pointillé, ligné, ingénieur, sombre, blueprint).
- **Texte clavier, LaTeX & Reconnaissance** :
  - Emplacements de texte déplaçables et éditables au clavier directement sur la page.
  - Éditeur **LaTeX** intégré avec aperçu en direct.
  - **Reconnaissance d'écriture manuscrite et d'équations** vers texte ou LaTeX.
- **Fiches de révision (répétition espacée)** :
  - Entourez une zone au lasso puis touchez **Fiche** : soit la zone est masquée et il faut la retrouver, soit elle devient la question (réponse écrite au clavier ou entourée au lasso).
  - Séances de révision par cahier depuis **Fichiers → Révision** (Espace pour retourner la fiche, `1` à `4` pour noter Encore / Difficile / Bien / Facile), planification SM-2 et compteur des fiches à réviser.
  - Fiches enregistrées en images dans IndexedDB (store `flashcards`) : elles restent lisibles même si la page change.
- **Gestion complète des PDF (100 % hors-ligne)** :
  - **Importation** via `pdfjs-dist` (worker local, sans lien externe), rendu HiDPI adapté à `window.devicePixelRatio` et chargement paresseux (*Lazy Loading* `{k-1, k, k+1}`).
  - **Sauvegarde optimisée dans IndexedDB** : binaire PDF stocké séparément des annotations vectorielles, sauvegarde différée (*debounce* 500 ms).
  - **Exportation PDF vectorielle** via `pdf-lib` aux coordonnées et proportions exactes.
- **Reverse Engineer Anything (REA) inclus** :
  - Skill d'agent dans [`.agents/skills/reverse-engineer-anything/SKILL.md`](.agents/skills/reverse-engineer-anything/SKILL.md), configuration MCP dans [`mcp.json`](mcp.json) et lanceur CLI dans [`scripts/rea-cli.js`](scripts/rea-cli.js).

---

## 🚀 Démarrage rapide en local

### Prérequis
- **Node.js 22+ ou 24 LTS** (`node -v`) et **npm**
- *(Optionnel, uniquement pour compiler le `.exe` natif Windows)* : **Rust** (`rustup`) et **WebView2** (préinstallé sur Windows 10/11)

### Installation et lancement

```bash
# 1. Cloner le dépôt
git clone https://github.com/vtudkbgy/inkflow.git
cd inkflow

# 2. Installer les dépendances npm
npm install

# 3. Lancer les tests automatisés + vérification du bundle dist/ et WebView2
npm test
npm run build:dist
npm run test:dist
npm run verify:webview2

# 4. Lancer l'application en local dans le navigateur (http://localhost:5173)
npm start
```

### Compiler l'exécutable Windows natif (`.exe` via Tauri v2)

```bash
npm run tauri:build
```
L'exécutable natif léger (~6 Mo) est généré dans `src-tauri/target/.../release/InkFlow.exe` et copié à la racine du projet.

---

## Google Drive (facultatif)

InkFlow reste 100 % hors ligne ; seul Google Drive (import, sauvegarde) demande le réseau. Hors connexion, une pastille « Hors connexion » l'indique et les actions Drive refusées l'expliquent.

Relier un compte (une seule fois) :
1. Dans Google Cloud Console, activer l'API Google Drive.
2. Créer un ID client OAuth de type **Application de bureau** et ajouter son adresse comme utilisateur de test (écran de consentement).
3. Dans InkFlow : **Drive** → onglet **Compte Google** → **Identifiants OAuth** : coller l'ID et le secret client, puis **Relier un compte Google**.

La connexion s'ouvre dans le navigateur (code + PKCE, retour sur `127.0.0.1`). Le jeton de renouvellement est gardé localement et le compte reste relié jusqu'à **Délier**. **Importer depuis Drive** ouvre un sélecteur visuel : PDF, images, documents Google (convertis en PDF) et sauvegardes InkFlow. Dans un navigateur, la liaison ne marche que servie depuis `localhost`.

---

## 🔍 Utiliser Reverse Engineer Anything (REA)

Le projet intègre **REA (`morluto/rea` / `rea-agents`)** pour l'analyse de binaires, d'applications JS/Electron ou de comportements runtime :

```bash
# Afficher l'aide de REA
npm run rea -- --help

# Configurer REA avec votre agent IA (Claude Code, Cursor, Codex, Gemini CLI...)
npm run rea:setup

# Analyser l'application JavaScript en local
npm run rea:analyze
```

Le fichier [`mcp.json`](mcp.json) permet également de brancher directement le serveur MCP `rea` à votre IDE ou agent IA.

---

## 🤝 Collaboration & Accès restreint sur GitHub

Pour partager l'avancement uniquement avec les personnes que vous autorisez :

1. Créez le dépôt en mode **Privé (`Private`)** sur GitHub.
2. Ajoutez vos collaborateurs dans **Settings → Collaborators → Add people**.
3. Consultez [`CONTRIBUTING.md`](CONTRIBUTING.md) pour le workflow branches / Pull Requests et les vérifications CI automatiques.

---

## 📁 Structure du projet

```text
├── index.html                   # Interface principale InkFlow
├── styles.css                   # Design responsive, thèmes clair/sombre, accélération GPU
├── src/                         # Modules sources découpés (assemblés vers app.js & dist/app.js)
├── app.js                       # Bundle front-end assemblé (triple-canvas, IndexedDB, PDF, Drive, Détente)
├── manifest.json / sw.js        # Support PWA hors-ligne
├── vendor/                      # Bibliothèques locales hors-ligne (pdf.js, worker, pdf-lib)
├── src-tauri/                   # Projet Rust / Tauri v2 (compilation Windows .exe)
├── scripts/
│   ├── build-app.js             # Assemblage modulaire src/ -> app.js
│   ├── prepare-dist.js          # Préparation & minification esbuild -> dist/
│   ├── run-unit-tests.js        # Suite de tests unitaires & benchmarks 60/120 FPS
│   ├── verify-webview2-pdf-stylus.js
│   ├── tauri-runner.js          # Build Tauri v2
│   └── rea-cli.js               # Lanceur Reverse Engineer Anything (REA)
├── .agents/skills/reverse-engineer-anything/  # Skill REA pour agents IA
├── .github/workflows/ci.yml     # Intégration Continue (tests source + dist + cargo check Windows)
└── mcp.json                     # Configuration MCP pour REA
```

## 📄 Licence

Distribué sous licence [MIT](LICENSE).
