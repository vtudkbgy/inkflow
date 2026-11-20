#!/usr/bin/env node
/**
 * Lanceur Reverse Engineer Anything (REA - morluto/rea / rea-agents)
 * Utilise l'installation locale dans ./tools/reverse-engineer-anything si présente,
 * ou télécharge/exécute automatiquement `rea-agents` via npx.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const localReaScript = path.join(rootDir, 'tools', 'reverse-engineer-anything', 'scripts', 'rea.mjs');
const args = process.argv.slice(2);

if (fs.existsSync(localReaScript)) {
  const res = spawnSync(process.execPath, [localReaScript, ...args], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  process.exit(res.status ?? 0);
} else {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const res = spawnSync(npxCmd, ['-y', 'rea-agents@latest', ...args], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  process.exit(res.status ?? 0);
}
