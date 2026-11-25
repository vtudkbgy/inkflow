#!/usr/bin/env node
/**
 * Bons du banquier publiés sur GitHub (page Détente, jetons fictifs uniquement).
 *
 * Principe
 * - credits/bons.json, sur la branche main du dépôt public, liste les bons en attente.
 * - Chaque bon est signé en ECDSA P-256 / SHA-256 avec une clé privée qui reste sur le
 *   PC du banquier (hors dépôt). app.js ne contient que la clé publique : elle permet de
 *   vérifier un bon, jamais d'en fabriquer un. Un bon modifié, inventé ou signé avec une
 *   autre clé est ignoré par l'application.
 * - L'app affiche un bouton par bon valide, non expiré et pas encore récupéré sur
 *   l'appareil ; le clic crédite le solde et le bouton disparaît.
 *
 * Commandes
 *   node scripts/bons-banquier.js init [--force]
 *       Crée la paire de clés et écrit la clé publique dans app.js (entre les marqueurs
 *       <bons-cle-publique>). --force remplace une clé existante : tous les bons déjà
 *       émis deviennent invalides et l'app doit être republiée.
 *   node scripts/bons-banquier.js emettre <montant> [--pret | --retrait] [--message "…"] [--jours 60]
 *       Signe un bon et le publie sur main. --jours 0 : sans date d'expiration.
 *       --retrait : l'app débite le montant sans clic, une fois par appareil ; si le solde
 *       ne suffit pas, il tombe à 0 et le reste s'ajoute à la dette.
 *   node scripts/bons-banquier.js retirer <id>      Retire un bon (son bouton disparaît).
 *   node scripts/bons-banquier.js liste             Liste les bons publiés et vérifie leur signature.
 *   node scripts/bons-banquier.js purger            Retire les bons expirés.
 *
 * Options communes
 *   --cle <fichier>  Clé privée (défaut : Documents\InkFlow-banquier\cle-privee-bons.pem,
 *                    ou la variable d'environnement INKFLOW_BANQUIER_CLE).
 *   --local          Lit et écrit credits/bons.json dans ce dossier au lieu de GitHub
 *                    (il reste alors à committer et pousser le fichier sur main).
 *   --essai          Affiche le résultat sans rien publier.
 *
 * Publication : par l'API GitHub (`gh api`), directement sur main, sans toucher à la
 * copie de travail locale ni à sa branche. Auteur du commit : l'identité Git du dépôt.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = 'vtudkbgy/inkflow';
const BRANCH = 'main';
const BONS_PATH = 'credits/bons.json';
const PAYLOAD_TAG = 'inkflow-bon-v1';
const MAX_AMOUNT = 10000000;
const MAX_MESSAGE = 140;
const DEFAULT_DAYS = 60;
// retrait : l'app débite le montant sans clic (le manque éventuel passe en dette).
// Les versions de l'app antérieures à ce type ignorent ces bons.
const BON_TYPES = ['cadeau', 'pret', 'retrait'];
const TYPE_LABELS = { cadeau: 'cadeau', pret: 'prêt', retrait: 'retrait' };
const ID_RE = /^[a-z0-9-]{6,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const repoRoot = path.resolve(__dirname, '..');

// Texte signé : doit rester identique à detenteBonPayload() dans app.js.
// Le message est en dernier : il est le seul champ qui peut contenir un saut de ligne.
function bonPayload(bon) {
  return [PAYLOAD_TAG, bon.id, bon.type, String(bon.montant), bon.expire || '', bon.message || ''].join('\n');
}

function toBase64Url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signBon(bon, privateKeyPem) {
  const sig = crypto.sign('sha256', Buffer.from(bonPayload(bon), 'utf8'), { key: privateKeyPem, dsaEncoding: 'ieee-p1363' });
  return { ...bon, sig: toBase64Url(sig) };
}

function verifyBon(bon, publicKey) {
  try {
    const sig = Buffer.from(String(bon.sig || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    return crypto.verify('sha256', Buffer.from(bonPayload(bon), 'utf8'), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig);
  } catch (_) {
    return false;
  }
}

function localDateString(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function newBonId(now = new Date()) {
  return `${localDateString(now).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex')}`;
}

// Construit un bon non signé et valide ses champs (mêmes règles que l'application)
function buildBon({ montant, type = 'cadeau', message = '', jours = DEFAULT_DAYS, now = new Date(), id } = {}) {
  const amount = Number(montant);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
    throw new Error(`Montant invalide : entier de 1 à ${MAX_AMOUNT}.`);
  }
  if (!BON_TYPES.includes(type)) throw new Error(`Type invalide : ${BON_TYPES.join(', ')}.`);
  const msg = String(message || '').trim();
  if (msg.length > MAX_MESSAGE) throw new Error(`Message trop long (${MAX_MESSAGE} caractères au plus).`);
  const days = Number(jours);
  if (!Number.isInteger(days) || days < 0) throw new Error('--jours attend un entier positif (0 : sans expiration).');
  const bon = { id: id || newBonId(now), type, montant: amount };
  if (days > 0) {
    const exp = new Date(now.getTime());
    exp.setDate(exp.getDate() + days);
    bon.expire = localDateString(exp);
  }
  if (msg) bon.message = msg;
  if (!ID_RE.test(bon.id)) throw new Error('Identifiant de bon invalide.');
  return bon;
}

function isExpired(bon, now = new Date()) {
  return Boolean(bon.expire && DATE_RE.test(bon.expire) && bon.expire < localDateString(now));
}

// ---------- Ligne de commande ----------
function parseArgs(argv) {
  const out = { _: [], pret: false, retrait: false, force: false, local: false, essai: false, message: '', jours: DEFAULT_DAYS, cle: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pret') out.pret = true;
    else if (a === '--retrait') out.retrait = true;
    else if (a === '--force') out.force = true;
    else if (a === '--local') out.local = true;
    else if (a === '--essai') out.essai = true;
    else if (a === '--message' && i + 1 < argv.length) out.message = argv[++i];
    else if (a === '--jours' && i + 1 < argv.length) out.jours = Number(argv[++i]);
    else if (a === '--cle' && i + 1 < argv.length) out.cle = path.resolve(argv[++i]);
    else if (a.startsWith('--')) throw new Error(`Option inconnue : ${a}`);
    else out._.push(a);
  }
  return out;
}

function keyPath(args) {
  return args.cle || process.env.INKFLOW_BANQUIER_CLE || path.join(os.homedir(), 'Documents', 'InkFlow-banquier', 'cle-privee-bons.pem');
}

function assertOutsideRepo(file) {
  const rel = path.relative(repoRoot, path.resolve(file));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    throw new Error('Refusé : la clé privée doit rester hors du dépôt.');
  }
}

function readPrivateKey(args) {
  const file = keyPath(args);
  if (!fs.existsSync(file)) throw new Error(`Clé privée introuvable : ${file}. Lancer d'abord « init ».`);
  return fs.readFileSync(file, 'utf8');
}

function readAppPublicJwk() {
  const src = fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8');
  const m = src.match(/const DETENTE_BONS_PUBLIC_KEY = (\{[^}]*\});/);
  if (!m) throw new Error('Clé publique introuvable dans app.js.');
  return JSON.parse(m[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":'));
}

function writeAppPublicJwk(jwk) {
  const appPath = path.join(repoRoot, 'app.js');
  const src = fs.readFileSync(appPath, 'utf8');
  const start = src.indexOf('// <bons-cle-publique>');
  const end = src.indexOf('// </bons-cle-publique>');
  if (start < 0 || end < start) throw new Error('Marqueurs <bons-cle-publique> introuvables dans app.js.');
  const lineStart = src.lastIndexOf('\n', start) + 1;
  const indent = src.slice(lineStart, start);
  const body = [
    '// <bons-cle-publique> écrite par scripts/bons-banquier.js init : clé publique seule, la clé privée reste chez le banquier',
    `${indent}const DETENTE_BONS_PUBLIC_KEY = { kty: 'EC', crv: 'P-256', x: '${jwk.x}', y: '${jwk.y}' };`,
    indent
  ].join('\n');
  fs.writeFileSync(appPath, src.slice(0, start) + body + src.slice(end), 'utf8');
}

function gh(args, input) {
  return execFileSync('gh', args, { input, encoding: 'utf8', stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
}

function gitConfig(key) {
  try {
    return execFileSync('git', ['-C', repoRoot, 'config', key], { encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

function emptyDocument() {
  return { version: 1, info: 'Bons du banquier InkFlow (jetons fictifs). Fichier écrit par scripts/bons-banquier.js : chaque bon est signé, une modification à la main le rend invalide.', bons: [] };
}

function normalizeDocument(doc) {
  const base = emptyDocument();
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.bons)) return base;
  return { ...base, bons: doc.bons };
}

function loadDocument(args) {
  if (args.local) {
    const file = path.join(repoRoot, BONS_PATH);
    return { doc: fs.existsSync(file) ? normalizeDocument(JSON.parse(fs.readFileSync(file, 'utf8'))) : emptyDocument(), sha: null };
  }
  try {
    const raw = gh(['api', `repos/${REPO}/contents/${BONS_PATH}?ref=${BRANCH}`]);
    const meta = JSON.parse(raw);
    const text = Buffer.from(meta.content || '', 'base64').toString('utf8');
    return { doc: normalizeDocument(JSON.parse(text)), sha: meta.sha };
  } catch (err) {
    if (/404|Not Found/i.test(String(err.stderr || err.message))) return { doc: emptyDocument(), sha: null };
    throw new Error(`Lecture de ${BONS_PATH} sur GitHub impossible : ${String(err.stderr || err.message).trim()}`);
  }
}

function saveDocument(args, doc, sha, commitMessage) {
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  if (args.essai) {
    console.log('--essai : rien n’est publié. Contenu qui serait écrit :');
    console.log(text);
    return;
  }
  if (args.local) {
    const file = path.join(repoRoot, BONS_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
    console.log(`Écrit : ${file} (à committer et pousser sur ${BRANCH}).`);
    return;
  }
  const body = { message: commitMessage, content: Buffer.from(text, 'utf8').toString('base64'), branch: BRANCH };
  if (sha) body.sha = sha;
  const name = gitConfig('user.name');
  const email = gitConfig('user.email');
  if (name && email) {
    body.author = { name, email };
    body.committer = { name, email };
  }
  const res = JSON.parse(gh(['api', '-X', 'PUT', `repos/${REPO}/contents/${BONS_PATH}`, '--input', '-'], JSON.stringify(body)));
  const commit = res && res.commit && res.commit.sha ? res.commit.sha.slice(0, 7) : '?';
  console.log(`Publié sur ${REPO}@${BRANCH} (commit ${commit}). L'app le verra en quelques minutes.`);
}

function formatAmount(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function describe(bon, publicKey) {
  const valid = publicKey ? (verifyBon(bon, publicKey) ? 'signature valide' : 'SIGNATURE INVALIDE') : '';
  const exp = bon.expire ? `expire le ${bon.expire}${isExpired(bon) ? ' (EXPIRÉ)' : ''}` : 'sans expiration';
  const msg = bon.message ? ` « ${bon.message} »` : '';
  const label = (TYPE_LABELS[bon.type] || String(bon.type)).padEnd(7);
  return `  ${bon.id}  ${label} ${formatAmount(bon.montant).padStart(10)} jetons  ${exp}  ${valid}${msg}`;
}

function cmdInit(args) {
  const file = keyPath(args);
  assertOutsideRepo(file);
  if (fs.existsSync(file) && !args.force) {
    throw new Error(`Une clé existe déjà (${file}). --force la remplace et invalide tous les bons déjà émis.`);
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { encoding: 'utf8', mode: 0o600 });
  writeAppPublicJwk(publicKey.export({ format: 'jwk' }));
  console.log(`Clé privée : ${file} (à garder, à sauvegarder, à ne jamais partager ni commiter).`);
  console.log('Clé publique écrite dans app.js : committer, pousser et republier l’application.');
}

function cmdEmettre(args) {
  const montant = Number(String(args._[1] || '').replace(/[\s_]/g, ''));
  const privatePem = readPrivateKey(args);
  const publicKey = crypto.createPublicKey(privatePem);
  const appJwk = readAppPublicJwk();
  const keyJwk = publicKey.export({ format: 'jwk' });
  if (appJwk.x !== keyJwk.x || appJwk.y !== keyJwk.y) {
    throw new Error('La clé privée ne correspond pas à la clé publique de app.js : les bons seraient refusés.');
  }
  if (args.pret && args.retrait) throw new Error('--pret et --retrait ne vont pas ensemble.');
  const type = args.retrait ? 'retrait' : (args.pret ? 'pret' : 'cadeau');
  const bon = signBon(buildBon({ montant, type, message: args.message, jours: args.jours }), privatePem);
  const { doc, sha } = loadDocument(args);
  doc.bons.push(bon);
  console.log('Nouveau bon :');
  console.log(describe(bon, publicKey));
  saveDocument(args, doc, sha, `bons: ${TYPE_LABELS[bon.type]} de ${bon.montant} jetons (${bon.id})`);
}

function cmdRetirer(args) {
  const id = args._[1];
  if (!id) throw new Error('Indiquer l’identifiant du bon (voir « liste »).');
  const { doc, sha } = loadDocument(args);
  const before = doc.bons.length;
  doc.bons = doc.bons.filter((b) => b && b.id !== id);
  if (doc.bons.length === before) throw new Error(`Aucun bon ${id}.`);
  saveDocument(args, doc, sha, `bons: retirer ${id}`);
}

function cmdPurger(args) {
  const { doc, sha } = loadDocument(args);
  const expired = doc.bons.filter((b) => isExpired(b));
  if (!expired.length) { console.log('Aucun bon expiré.'); return; }
  doc.bons = doc.bons.filter((b) => !isExpired(b));
  saveDocument(args, doc, sha, `bons: retirer ${expired.length} bon(s) expiré(s)`);
}

function cmdListe(args) {
  const { doc } = loadDocument(args);
  let publicKey = null;
  try {
    publicKey = crypto.createPublicKey({ key: { ...readAppPublicJwk() }, format: 'jwk' });
  } catch (_) { /* clé absente : liste sans vérification */ }
  if (!doc.bons.length) { console.log('Aucun bon publié.'); return; }
  console.log(`${doc.bons.length} bon(s) publié(s) :`);
  doc.bons.forEach((b) => console.log(describe(b, publicKey)));
  console.log('Un bon récupéré reste listé ici : l’app ne prévient pas GitHub (pas de serveur). Il ne peut servir qu’une fois par appareil.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const commands = { init: cmdInit, emettre: cmdEmettre, retirer: cmdRetirer, liste: cmdListe, purger: cmdPurger };
  if (!commands[cmd]) {
    console.log('Usage : node scripts/bons-banquier.js <init|emettre|retirer|liste|purger> [options] (voir l’en-tête du fichier)');
    process.exit(cmd ? 1 : 0);
  }
  commands[cmd](args);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

module.exports = { bonPayload, signBon, verifyBon, buildBon, isExpired, PAYLOAD_TAG, MAX_AMOUNT, MAX_MESSAGE };
