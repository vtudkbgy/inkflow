# InkFlow (ex-Plume Studio Pro) — Contexte Technique & Directives

## Projet & Dépôt
- **Nom** : InkFlow — dépôt GitHub : `https://github.com/vtudkbgy/inkflow.git` (compte `vtudkbgy`).
- Application de prise de notes manuscrites 100 % locale et hors-ligne (HTML/CSS/JS Vanilla : `index.html`, `styles.css`, `app.js`, IndexedDB, `vendor/pdf.min.js`, `vendor/pdf.worker.min.js`, `vendor/pdf-lib.min.js`), compilable en `.exe` Windows natif via Tauri v2 (`src-tauri/`).
- Reverse Engineer Anything (REA) est intégré : skill dans `.agents/skills/reverse-engineer-anything/`, serveur MCP dans `mcp.json`, et lanceur CLI via `scripts/rea-cli.js` (`npm run rea`).

## Fonctionnalités & Exigences UI déjà implémentées (ne pas régresser)
- **Interface épurée** : pas de radar, pas de bouton "Web PC", pas de bouton "Page infinie" en haut à gauche, pas d'affichage du nom du cahier/page en plein écran ; options d'outils (stylo, gomme, surligneur, formes, lasso, texte) masquées par défaut derrière le bouton `#btnToggleToolOptions` ; tiroir latéral ne décalant jamais la barre d'outils.
- **Page infinie** avec Pinch-to-Zoom (tactile 2 doigts + `Ctrl+Molette`), Pan libre, fonds personnalisables (quadrillé, Seyès, pointillé, ligné, ingénieur, sombre, blueprint).
- **Stylet Windows Ink** (`PointerEvent` + `getCoalescedEvents`) :
  - Bouton Gomme (`buttons & 32` / `button === 5`) : gomme temporaire au maintien, retour auto au stylo au relâchement.
  - 2e bouton stylet (`buttons & (2|8|16)` / `button === 2|3|4`) : lasso temporaire au maintien, retour auto au stylo au relâchement.
  - Roue de couleurs radiale (`#radialColorWheel`) : maintien immobile ~340 ms avec le bouton lasso.
  - Formes géométriques auto (`Hold-to-Shape`, activable via `#autoShapeToggle`) : maintien immobile ~460 ms en fin de tracé (cercle/ellipse, flèche, ligne, rectangle, triangle).
- **Cartes de texte clavier** (`.world-text-card`), éditeur LaTeX avec aperçu direct, reconnaissance manuscrite (texte & équations).
- **PDF 100 % hors-ligne** : import via `pdfjs-dist` (worker local), rendu HiDPI verrouillé sur `#pdfBgCanvas` avec Lazy Loading `{k-1, k, k+1}` en RAM, binaire PDF stocké séparément dans IndexedDB, gestion propre des edge cases (PDF vide, corrompu, > 100 pages via `#pdfImportErrorBanner`), export vectoriel annoté via `pdf-lib`.

## Architecture Performance 60/120 FPS (règles critiques)
- **Triple canvas** :
  - `#pdfBgCanvas` (fond + PDF verrouillé),
  - `#inkCanvas` (statique + cache bitmap `staticInkCache` avec marge 420 px → Pan en 1 seul `ctx.drawImage` à ~0.15 ms/frame),
  - `#activeInkCanvas` (trait actif rendu en O(1) incrémental via `renderIncrementalStrokeTail` / `_renderedUpToIndex` à ~0.008 ms/move même sur 500 points).
- Toujours appeler `invalidateStaticInkCache()` sur toute mutation du calque statique (Undo/Redo, Gomme, Lasso, Effacer page, changement de page/cahier).
- Préserver `cloneStrokeFast()` dans `clonePageContent()` pour garder le cache `WeakMap` (`strokePathCache`) intact à travers l'historique Undo/Redo.
- Sauvegarde IndexedDB différée (`SAVE_DEBOUNCE_DELAY_MS = 500 ms`), annulée pendant l'écriture et purgée (`flushPendingPageSaves()`) avant tout changement de page/cahier.
- Nettoyage RAM strict : `releaseCanvasMemory`, `destroyPdfDocumentResources`, `cleanupAppResources`.

## Vérifications obligatoires après chaque modification
- `npm test` (8/8 tests unitaires + benchmarks 60/120 FPS)
- `npm run verify:webview2` (4/4 vérifications PDF.js local, stylet, Tauri v2 IPC)
- `npm run tauri:build` (génération du `.exe` natif Windows)
- Zéro dépendance CDN externe ; utiliser `() => ...` dans `.replace()` lors du bundling HTML autonome.

## Synchronisation GitHub obligatoire (à chaque tâche)
- À la fin de **chaque tâche**, vérifier impérativement l'état du dépôt Git et du remote GitHub (`git fetch origin`, `git status -sb`, comparaison `HEAD` vs `origin/main`).
- Commiter toutes les modifications de la tâche avec un message clair et effectuer `git push origin main` (ne jamais laisser de modifications ou de commits non poussés à la fin d'une tâche).
- Confirmer dans le compte-rendu final que le dépôt GitHub est synchronisé (branche, hash du dernier commit, `working tree clean`).
- Note Windows : si `git` n'est pas dans le `PATH` du terminal, utiliser `"C:\Program Files\Git\cmd\git.exe"`.
