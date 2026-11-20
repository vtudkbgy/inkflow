#!/usr/bin/env node
/**
 * Prépare et allège le dossier `dist/` contenant uniquement les ressources front-end locales
 * (HTML, CSS, JS, PWA et bibliothèques PDF hors-ligne `pdfjs-dist` + `pdf-lib`)
 * afin que Tauri v2 compile un exécutable Windows `.exe` léger et 100 % autonome.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const vendorSrc = path.join(rootDir, 'vendor');
const vendorDest = path.join(distDir, 'vendor');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(vendorDest, { recursive: true });

function minifyCssBundle(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim() + '\n';
}

function cleanJsBundle(js) {
  return js
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*console\.(log|debug)\b.*$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim() + '\n';
}

const rootFiles = [
  'index.html',
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
    fs.writeFileSync(dest, minifyCssBundle(rawCss), 'utf8');
  } else if (file === 'app.js') {
    const rawJs = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(dest, cleanJsBundle(rawJs), 'utf8');
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
