#!/usr/bin/env node
/**
 * Assemble les modules sources de `src/` (listés dans `src/modules.json`) en `app.js`,
 * en validant la syntaxe JavaScript via `esbuild`.
 *
 * Cela permet de maintenir une architecture modulaire lisible dans `src/` tout en gardant
 * un unique script local 100 % hors-ligne (`app.js` pour le dev/navigateur/tests et `dist/app.js`
 * minifié par `esbuild` pour Tauri v2).
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const manifestPath = path.join(srcDir, 'modules.json');
const outputPath = path.join(rootDir, 'app.js');

function buildAppBundle({ silent = false, checkOnly = false } = {}) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifeste modulaire introuvable : ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const modules = Array.isArray(manifest.modules) ? manifest.modules : [];
  if (modules.length === 0) {
    throw new Error('src/modules.json ne contient aucun module.');
  }

  const parts = [];
  const header = manifest.header || [
    '/**',
    ' * InkFlow — Moteur d\'Encre Vectorielle, Canevas Infini, LaTeX, PDF & Google Drive',
    ' * Fichier généré automatiquement depuis `src/` par `npm run build:app`.',
    ' */',
    '(() => {',
    "  'use strict';",
    ''
  ].join('\n');
  parts.push(header);

  for (const rel of modules) {
    const full = path.join(srcDir, rel);
    if (!fs.existsSync(full)) {
      throw new Error(`Module manquant dans src/ : ${rel}`);
    }
    const content = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
    // Vérifie que chaque module est syntaxiquement autonome (aucun bloc ouvert non fermé entre modules)
    esbuild.transformSync(`(() => {\n${content}\n})();`, {
      loader: 'js',
      target: ['es2020', 'chrome100', 'edge100'],
      sourcefile: `src/${rel}`
    });
    parts.push(`\n  // >>> MODULE: src/${rel}\n${content}\n`);
  }

  const footer = manifest.footer || '\n})();\n';
  parts.push(footer);

  const assembled = parts.join('');

  // Validation syntaxique AST complète via esbuild (détecte toute erreur de syntaxe immédiatement)
  esbuild.transformSync(assembled, {
    loader: 'js',
    target: ['es2020', 'chrome100', 'edge100'],
    sourcefile: 'app.js'
  });

  if (!checkOnly) {
    fs.writeFileSync(outputPath, assembled, 'utf8');
  }

  if (!silent) {
    const kb = (Buffer.byteLength(assembled, 'utf8') / 1024).toFixed(1);
    console.log(`[build-app] ${modules.length} modules src/ assemblés -> app.js (${kb} Ko)`);
  }
  return { moduleCount: modules.length, bytes: Buffer.byteLength(assembled, 'utf8') };
}

if (require.main === module) {
  const checkOnly = process.argv.includes('--check');
  try {
    buildAppBundle({ silent: false, checkOnly });
  } catch (err) {
    console.error('[build-app] Erreur :', err && err.message ? err.message : err);
    process.exit(1);
  }
}

module.exports = { buildAppBundle };
