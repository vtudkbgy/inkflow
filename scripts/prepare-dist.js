#!/usr/bin/env node
/**
 * Prépare et optimise le dossier `dist/` contenant uniquement les ressources front-end locales
 * (HTML, CSS, JS, PWA et bibliothèques PDF hors-ligne `pdfjs-dist` + `pdf-lib`)
 * afin que Tauri v2 compile un exécutable Windows `.exe` léger et 100 % autonome.
 *
 * Utilise `esbuild` pour la validation syntaxique et la minification sûre de `app.js` et `styles.css`
 * (sans aucune regex fragile sur le code JavaScript).
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const vendorSrc = path.join(rootDir, 'vendor');
const vendorDest = path.join(distDir, 'vendor');

// Assemble les modules `src/` vers `app.js` si le manifeste modulaire est présent
const buildAppScript = path.join(__dirname, 'build-app.js');
if (fs.existsSync(buildAppScript) && fs.existsSync(path.join(rootDir, 'src', 'modules.json'))) {
  const { buildAppBundle } = require('./build-app.js');
  buildAppBundle({ silent: false });
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(vendorDest, { recursive: true });

function minifyCssWithEsbuild(css, sourcefile) {
  const res = esbuild.transformSync(css, {
    loader: 'css',
    minify: true,
    charset: 'utf8',
    sourcefile
  });
  return res.code;
}

function minifyJsWithEsbuild(js, sourcefile) {
  const res = esbuild.transformSync(js, {
    loader: 'js',
    minify: true,
    target: ['es2020', 'chrome100', 'edge100'],
    charset: 'utf8',
    pure: ['console.debug'],
    sourcefile
  });
  return res.code;
}

const rootFiles = [
  'index.html',
  'oauth-callback.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'sw.js'
];

for (const file of rootFiles) {
  const src = path.join(rootDir, file);
  const dest = path.join(distDir, file);
  if (!fs.existsSync(src)) continue;

  if (file === 'styles.css') {
    const rawCss = fs.readFileSync(src, 'utf8');
    const outCss = minifyCssWithEsbuild(rawCss, file);
    fs.writeFileSync(dest, outCss, 'utf8');
    console.log(`[prepare-dist] styles.css : ${(rawCss.length / 1024).toFixed(1)} Ko -> ${(outCss.length / 1024).toFixed(1)} Ko`);
  } else if (file === 'app.js') {
    const rawJs = fs.readFileSync(src, 'utf8');
    const outJs = minifyJsWithEsbuild(rawJs, file);
    fs.writeFileSync(dest, outJs, 'utf8');
    console.log(`[prepare-dist] app.js     : ${(rawJs.length / 1024).toFixed(1)} Ko -> ${(outJs.length / 1024).toFixed(1)} Ko`);
  } else {
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(vendorSrc)) {
  for (const entry of fs.readdirSync(vendorSrc)) {
    const s = path.join(vendorSrc, entry);
    const d = path.join(vendorDest, entry);
    if (fs.statSync(s).isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

const assetsSrc = path.join(rootDir, 'assets');
const assetsDest = path.join(distDir, 'assets');
if (fs.existsSync(assetsSrc)) {
  fs.mkdirSync(assetsDest, { recursive: true });
  for (const entry of fs.readdirSync(assetsSrc)) {
    const s = path.join(assetsSrc, entry);
    const d = path.join(assetsDest, entry);
    if (fs.statSync(s).isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}
