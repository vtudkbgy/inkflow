#!/usr/bin/env node
/**
 * Génère les codes du banquier de la page Détente (jetons fictifs uniquement).
 *
 * - Les codes en clair sont écrits dans un fichier HORS du dépôt (par défaut
 *   Documents\InkFlow-codes-banquier.txt) : ils ne doivent jamais être commités.
 * - app.js ne reçoit que des empreintes salées : SHA-256(sel + ':' + CODE), un sel
 *   aléatoire par code. Le bloc est remplacé entre les marqueurs <detente-codes>.
 * - Codes de 12 caractères tirés de 31 symboles sans caractère ambigu
 *   (ni 0/O, ni 1/I/L) : environ 59 bits d'entropie par code.
 *
 * Usage : node scripts/generate-detente-codes.js [--out <fichier>] [--force]
 * --force est exigé si le fichier existe déjà : régénérer invalide tous les anciens codes.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;

// [type, montant, exemplaires] — g : code cadeau, p : code de prêt
const PLAN = [
  ['g', 1, 10], ['g', 50, 10], ['g', 100, 10], ['g', 1000, 8], ['g', 10000, 6], ['g', 100000, 4], ['g', 1000000, 3],
  ['p', 100, 5], ['p', 1000, 6], ['p', 10000, 5], ['p', 100000, 3], ['p', 1000000, 2]
];

function parseArgs(argv) {
  const out = { file: path.join(os.homedir(), 'Documents', 'InkFlow-codes-banquier.txt'), force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--force') out.force = true;
    else if (argv[i] === '--out' && argv[i + 1]) out.file = path.resolve(argv[++i]);
  }
  return out;
}

function randomCode() {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return s;
}

function formatCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

function formatAmount(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..');
  if (path.resolve(args.file).toLowerCase().startsWith(repoRoot.toLowerCase() + path.sep)) {
    console.error('Refusé : le fichier des codes en clair doit rester hors du dépôt.');
    process.exit(1);
  }
  if (fs.existsSync(args.file) && !args.force) {
    console.error(`Le fichier ${args.file} existe déjà. Relancer avec --force invalide tous les codes déjà distribués.`);
    process.exit(1);
  }

  const seen = new Set();
  const entries = [];
  for (const [kind, amount, copies] of PLAN) {
    for (let i = 0; i < copies; i++) {
      let code;
      do { code = randomCode(); } while (seen.has(code));
      seen.add(code);
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.createHash('sha256').update(`${salt}:${code}`, 'utf8').digest('hex');
      entries.push({ kind, amount, code, salt, hash });
    }
  }

  // 1. Liste en clair, hors dépôt
  const lines = [
    'InkFlow — codes du banquier (page Détente, jetons fictifs)',
    `Généré le ${new Date().toISOString().slice(0, 10)}. Ne pas commiter, ne pas partager en bloc.`,
    'Chaque code ne sert qu’une fois par appareil (pas de serveur : l’usage est mémorisé localement).',
    ''
  ];
  for (const [kind, title] of [['g', 'CODES CADEAUX (créditent le solde)'], ['p', 'CODES DE PRÊT (créditent le solde et créent une dette)']]) {
    lines.push(title);
    for (const e of entries.filter((x) => x.kind === kind)) {
      lines.push(`  ${formatAmount(e.amount).padStart(9)} jetons   ${formatCode(e.code)}`);
    }
    lines.push('');
  }
  fs.mkdirSync(path.dirname(args.file), { recursive: true });
  fs.writeFileSync(args.file, lines.join(os.EOL), 'utf8');

  // 2. Empreintes salées dans app.js (aucun code en clair)
  const appPath = path.join(repoRoot, 'app.js');
  const src = fs.readFileSync(appPath, 'utf8');
  const start = src.indexOf('// <detente-codes>');
  const end = src.indexOf('// </detente-codes>');
  if (start < 0 || end < start) {
    console.error('Marqueurs <detente-codes> introuvables dans app.js.');
    process.exit(1);
  }
  const lineStart = src.lastIndexOf('\n', start) + 1;
  const indent = src.slice(lineStart, start);
  const body = [
    `// <detente-codes> généré par scripts/generate-detente-codes.js : empreintes SHA-256 salées uniquement, jamais de code en clair`,
    `${indent}const DETENTE_CODE_BOOK = [`,
    ...entries.map((e, i) => `${indent}  ['${e.kind}', ${e.amount}, '${e.salt}', '${e.hash}']${i < entries.length - 1 ? ',' : ''}`),
    `${indent}];`,
    `${indent}`
  ].join('\n');
  const next = src.slice(0, start) + body + src.slice(end);
  fs.writeFileSync(appPath, next, 'utf8');

  const gifts = entries.filter((e) => e.kind === 'g').length;
  console.log(`${entries.length} codes générés (${gifts} cadeaux, ${entries.length - gifts} prêts).`);
  console.log(`Liste en clair : ${args.file}`);
}

main();
