#!/usr/bin/env node
/**
 * Bons du banquier publiés sur GitHub (page Détente, jetons fictifs uniquement).
 *
 * Principe
 * - credits/bons.json, sur la branche main du dépôt public, liste les bons.
 * - Chaque bon est signé en ECDSA P-256 / SHA-256 avec une clé privée qui reste sur le
 *   PC du banquier (hors dépôt). app.js ne contient que la clé publique : elle permet de
 *   vérifier un bon, jamais d'en fabriquer un. Un bon modifié, inventé ou signé avec une
 *   autre clé est ignoré par l'application.
 * - Bons v2 : adressés à un compte (--pour : code client affiché dans Détente › Banque, publié
 *   seulement sous forme d'empreinte) ou à tous les comptes ouverts avant l'émission (--tous).
 *   Une installation neuve ne reçoit ni les anciens cadeaux ni les anciens retraits.
 * - Cadeau et prêt : bouton « Récupérer » dans l'app. Retrait et annulation : appliqués sans
 *   clic. Tout bon ne s'applique qu'une fois par appareil.
 *
 * Commandes
 *   node scripts/bons-banquier.js init [--force]
 *       Crée la paire de clés et écrit la clé publique dans app.js (entre les marqueurs
 *       <bons-cle-publique>). --force remplace une clé existante : tous les bons déjà
 *       émis deviennent invalides et l'app doit être republiée.
 *   node scripts/bons-banquier.js client ajouter <nom> <code>   Note un code client dans le carnet local.
 *   node scripts/bons-banquier.js client liste                  Affiche le carnet.
 *   node scripts/bons-banquier.js client retirer <nom>          Retire un client du carnet.
 *   node scripts/bons-banquier.js emettre <montant> (--pour <nom|code> | --tous) [--pret | --retrait] [--message "…"] [--jours 60]
 *       Signe un bon et le publie sur main. --jours 0 : sans date d'expiration.
 *       --retrait : l'app débite le montant sans clic ; si le solde ne suffit pas, il tombe à 0
 *       et le reste s'ajoute à la dette.
 *   node scripts/bons-banquier.js annuler <id> [--message "…"]
 *       Annule un bon. Pas encore récupéré : il disparaît. Déjà récupéré : l'app reprend les
 *       jetons (cadeau, prêt : la dette baisse d'autant) ou rend ceux d'un retrait.
 *   node scripts/bons-banquier.js retirer <id>      Retire un bon du fichier (sans effet s'il est déjà récupéré).
 *   node scripts/bons-banquier.js liste             Liste les bons publiés et vérifie leur signature.
 *   node scripts/bons-banquier.js purger            Retire les bons expirés.
 *
 * Options communes
 *   --cle <fichier>  Clé privée (défaut : Documents\InkFlow-banquier\cle-privee-bons.pem,
 *                    ou la variable d'environnement INKFLOW_BANQUIER_CLE). Le carnet de
 *                    clients (clients.json) est dans le même dossier, hors dépôt.
 *   --local          Lit et écrit credits/bons.json dans ce dossier au lieu de GitHub
 *                    (il reste alors à committer et pousser le fichier sur main).
 *   --essai          Affiche le résultat sans rien publier.
 *
 * Publication : par l'API GitHub (`gh api`), directement sur main, sans toucher à la
 * copie de travail locale ni à sa branche. Auteur du commit : l'identité Git du dépôt.
 * Le fichier est public : le message d'un bon est lisible par tous, le code client non.
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
const PAYLOAD_TAG_V2 = 'inkflow-bon-v2';
const MAX_AMOUNT = 10000000;
const MAX_MESSAGE = 140;
const DEFAULT_DAYS = 60;
const BON_TYPES = ['cadeau', 'pret', 'retrait', 'annulation'];
const TYPE_LABELS = { cadeau: 'cadeau', pret: 'prêt', retrait: 'retrait', annulation: 'annulation' };
const ID_RE = /^[a-z0-9-]{6,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HASH_RE = /^[0-9a-f]{24}$/;
// Code client : doit rester identique à DETENTE_ACCOUNT_ALPHABET / detenteAccountHash() dans app.js
const ACCOUNT_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ACCOUNT_CODE_LEN = 10;
const repoRoot = path.resolve(__dirname, '..');

// Texte signé : doit rester identique à detenteBonPayload() dans app.js.
// Le message est en dernier : il est le seul champ qui peut contenir un saut de ligne.
function bonPayload(bon) {
  if (bon.v === 2) {
    return [PAYLOAD_TAG_V2, bon.id, bon.type, String(bon.montant), bon.expire || '', bon.emis, bon.pour || '', bon.annule || '', bon.message || ''].join('\n');
  }
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

function normalizeAccountCode(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (code.length !== ACCOUNT_CODE_LEN) return '';
  for (const ch of code) if (!ACCOUNT_ALPHABET.includes(ch)) return '';
  return code;
}

function formatAccountCode(code) {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

// Empreinte publiée dans le champ « pour » : le code client n'apparaît jamais sur GitHub
function accountHash(code) {
  return crypto.createHash('sha256').update(`inkflow-compte-v1:${code}`, 'utf8').digest('hex').slice(0, 24);
}

function localDateString(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoSeconds(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function newBonId(now = new Date()) {
  return `${localDateString(now).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex')}`;
}

// Construit un bon v2 non signé et valide ses champs (mêmes règles que l'application).
// pour : empreinte du compte visé (absent : tous les comptes ouverts avant l'émission).
// expire : date imposée (annulation : celle du bon annulé), sinon calculée depuis jours.
function buildBon({ montant, type = 'cadeau', message = '', jours = DEFAULT_DAYS, now = new Date(), id, pour, annule, expire } = {}) {
  const amount = Number(montant);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
    throw new Error(`Montant invalide : entier de 1 à ${MAX_AMOUNT}.`);
  }
  if (!BON_TYPES.includes(type)) throw new Error(`Type invalide : ${BON_TYPES.join(', ')}.`);
  const msg = String(message || '').trim();
  if (msg.length > MAX_MESSAGE) throw new Error(`Message trop long (${MAX_MESSAGE} caractères au plus).`);
  if (pour !== undefined && !HASH_RE.test(String(pour))) throw new Error('Destinataire invalide.');
  if (type === 'annulation' ? !ID_RE.test(String(annule || '')) : annule !== undefined) {
    throw new Error('Une annulation (et elle seule) indique le bon annulé.');
  }
  const bon = { v: 2, id: id || newBonId(now), type, montant: amount, emis: isoSeconds(now) };
  if (expire !== undefined) {
    if (expire && !DATE_RE.test(expire)) throw new Error('Date d’expiration invalide.');
    if (expire) bon.expire = expire;
  } else {
    const days = Number(jours);
    if (!Number.isInteger(days) || days < 0) throw new Error('--jours attend un entier positif (0 : sans expiration).');
    if (days > 0) {
      const exp = new Date(now.getTime());
      exp.setDate(exp.getDate() + days);
      bon.expire = localDateString(exp);
    }
  }
  if (pour) bon.pour = pour;
  if (annule) bon.annule = annule;
  if (msg) bon.message = msg;
  if (!ID_RE.test(bon.id)) throw new Error('Identifiant de bon invalide.');
  if (bon.annule === bon.id) throw new Error('Un bon ne peut pas s’annuler lui-même.');
  return bon;
}

function isExpired(bon, now = new Date()) {
  return Boolean(bon.expire && DATE_RE.test(bon.expire) && bon.expire < localDateString(now));
}

// ---------- Ligne de commande ----------
function parseArgs(argv) {
  const out = { _: [], pret: false, retrait: false, force: false, local: false, essai: false, tous: false, pour: null, message: '', jours: DEFAULT_DAYS, cle: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pret') out.pret = true;
    else if (a === '--retrait') out.retrait = true;
    else if (a === '--force') out.force = true;
    else if (a === '--local') out.local = true;
    else if (a === '--essai') out.essai = true;
    else if (a === '--tous') out.tous = true;
    else if (a === '--pour' && i + 1 < argv.length) out.pour = argv[++i];
    else if (a === '--message' && i + 1 < argv.length) out.message = argv[++i];
    else if (a === '--jours' && i + 1 < argv.length) out.jours = Number(argv[++i]);
    else if (a === '--cle' && i + 1 < argv.length) out.cle = path.resolve(argv[++i]);
    else if (a.startsWith('--')) throw new Error(`Option inconnue ou incomplète : ${a}`);
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
    throw new Error('Refusé : les fichiers du banquier doivent rester hors du dépôt.');
  }
}

function readPrivateKey(args) {
  const file = keyPath(args);
  if (!fs.existsSync(file)) throw new Error(`Clé privée introuvable : ${file}. Lancer d'abord « init ».`);
  return fs.readFileSync(file, 'utf8');
}

// ---------- Carnet de clients (local, hors dépôt : noms et codes ne sont jamais publiés) ----------
function clientsPath(args) {
  return path.join(path.dirname(keyPath(args)), 'clients.json');
}

function loadClients(args) {
  const file = clientsPath(args);
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data.clients) ? data.clients.filter((c) => c && typeof c.nom === 'string' && normalizeAccountCode(c.code)) : [];
  } catch (_) {
    return [];
  }
}

function saveClients(args, clients) {
  const file = clientsPath(args);
  assertOutsideRepo(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ info: 'Carnet du banquier InkFlow : codes clients. Reste sur ce PC.', clients }, null, 2)}\n`, 'utf8');
}

function findClient(clients, name) {
  const key = String(name || '').trim().toLocaleLowerCase('fr');
  return clients.find((c) => c.nom.toLocaleLowerCase('fr') === key) || null;
}

// --pour accepte un nom du carnet ou un code client ; --tous vise tous les comptes
function resolveRecipient(args) {
  if (args.tous && args.pour) throw new Error('--pour et --tous ne vont pas ensemble.');
  if (args.tous) return { pour: undefined, label: 'tous les comptes ouverts avant ce bon' };
  if (!args.pour) {
    throw new Error('Indique le destinataire : --pour <nom ou code client> (code affiché dans Détente › Banque), ou --tous.');
  }
  const client = findClient(loadClients(args), args.pour);
  const code = client ? normalizeAccountCode(client.code) : normalizeAccountCode(args.pour);
  if (!code) throw new Error(`« ${args.pour} » n’est ni un client du carnet ni un code client valide (10 caractères, ex. ABCDE-FGH23).`);
  return { pour: accountHash(code), label: client ? `${client.nom} (${formatAccountCode(code)})` : formatAccountCode(code) };
}

function recipientLabel(bon, clients) {
  if (!bon.pour) return bon.v === 2 ? 'tous' : 'tous (ancien format)';
  const c = clients.find((x) => accountHash(normalizeAccountCode(x.code)) === bon.pour);
  return c ? c.nom : `compte ${bon.pour.slice(0, 8)}…`;
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

// Écriture avec `gh api -i` : sans -i, certaines versions de gh remplacent toute erreur HTTP
// par « unexpected end of JSON input ». On lit donc le statut et le corps nous-mêmes.
function splitHttpResponse(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n');
  const cut = text.indexOf('\n\n');
  const head = cut >= 0 ? text.slice(0, cut) : text;
  const bodyText = cut >= 0 ? text.slice(cut + 2).trim() : '';
  const status = Number((head.match(/^HTTP\/[\d.]+\s+(\d{3})/) || [])[1]) || 0;
  let json = null;
  try { json = bodyText ? JSON.parse(bodyText) : null; } catch (_) { json = null; }
  return { status, json, bodyText };
}

function ghWrite(args, input) {
  let raw;
  try {
    raw = gh(args, input);
  } catch (err) {
    raw = err.stdout;
    const res = splitHttpResponse(raw);
    const detail = (res.json && res.json.message) || String(err.stderr || err.message).trim();
    throw new Error(`GitHub a refusé l’écriture${res.status ? ` (HTTP ${res.status})` : ''} : ${detail}`);
  }
  const res = splitHttpResponse(raw);
  if (res.status && (res.status < 200 || res.status >= 300)) throw new Error(`GitHub a refusé l’écriture (HTTP ${res.status}).`);
  return res.json;
}

function gitConfig(key) {
  try {
    return execFileSync('git', ['-C', repoRoot, 'config', key], { encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

function emptyDocument() {
  return { version: 2, info: 'Bons du banquier InkFlow (jetons fictifs). Fichier écrit par scripts/bons-banquier.js : chaque bon est signé, une modification à la main le rend invalide.', bons: [] };
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
  const res = ghWrite(['api', '-i', '-X', 'PUT', `repos/${REPO}/contents/${BONS_PATH}`, '--input', '-'], JSON.stringify(body));
  const commit = res && res.commit && res.commit.sha ? res.commit.sha.slice(0, 7) : '?';
  console.log(`Publié sur ${REPO}@${BRANCH} (commit ${commit}). L'app le verra en quelques minutes.`);
}

function formatAmount(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function describe(bon, publicKey, clients = []) {
  const valid = publicKey ? (verifyBon(bon, publicKey) ? 'signature valide' : 'SIGNATURE INVALIDE') : '';
  const exp = bon.expire ? `expire le ${bon.expire}${isExpired(bon) ? ' (EXPIRÉ)' : ''}` : 'sans expiration';
  const msg = bon.message ? ` « ${bon.message} »` : '';
  const ref = bon.annule ? ` annule ${bon.annule}` : '';
  const label = (TYPE_LABELS[bon.type] || String(bon.type)).padEnd(10);
  return `  ${bon.id}  ${label} ${formatAmount(bon.montant).padStart(10)} jetons  pour ${recipientLabel(bon, clients)}  ${exp}  ${valid}${ref}${msg}`;
}

function signingKeys(args) {
  const privatePem = readPrivateKey(args);
  const publicKey = crypto.createPublicKey(privatePem);
  const appJwk = readAppPublicJwk();
  const keyJwk = publicKey.export({ format: 'jwk' });
  if (appJwk.x !== keyJwk.x || appJwk.y !== keyJwk.y) {
    throw new Error('La clé privée ne correspond pas à la clé publique de app.js : les bons seraient refusés.');
  }
  return { privatePem, publicKey };
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

function cmdClient(args) {
  const sub = args._[1];
  const clients = loadClients(args);
  if (sub === 'ajouter') {
    const nom = String(args._[2] || '').trim();
    const code = normalizeAccountCode(args._[3]);
    if (!nom || nom.length > 40) throw new Error('Usage : client ajouter <nom> <code client> (nom de 1 à 40 caractères).');
    if (!code) throw new Error('Code client invalide : 10 caractères, affiché dans Détente › Banque (ex. ABCDE-FGH23).');
    const others = clients.filter((c) => c.nom.toLocaleLowerCase('fr') !== nom.toLocaleLowerCase('fr'));
    others.push({ nom, code: formatAccountCode(code) });
    saveClients(args, others);
    console.log(`Client ${nom} : ${formatAccountCode(code)} (carnet : ${clientsPath(args)}).`);
    return;
  }
  if (sub === 'retirer') {
    const c = findClient(clients, args._[2]);
    if (!c) throw new Error(`Aucun client « ${args._[2] || ''} » dans le carnet.`);
    saveClients(args, clients.filter((x) => x !== c));
    console.log(`Client ${c.nom} retiré du carnet.`);
    return;
  }
  if (sub === 'liste' || !sub) {
    if (!clients.length) { console.log('Carnet vide. Ajouter : client ajouter <nom> <code client>.'); return; }
    clients.forEach((c) => console.log(`  ${c.nom.padEnd(20)} ${formatAccountCode(normalizeAccountCode(c.code))}`));
    return;
  }
  throw new Error('Usage : client <ajouter|liste|retirer>.');
}

function cmdEmettre(args) {
  const montant = Number(String(args._[1] || '').replace(/[\s_]/g, ''));
  if (args.pret && args.retrait) throw new Error('--pret et --retrait ne vont pas ensemble.');
  const recipient = resolveRecipient(args);
  const { privatePem, publicKey } = signingKeys(args);
  const type = args.retrait ? 'retrait' : (args.pret ? 'pret' : 'cadeau');
  const bon = signBon(buildBon({ montant, type, message: args.message, jours: args.jours, pour: recipient.pour }), privatePem);
  const { doc, sha } = loadDocument(args);
  doc.bons.push(bon);
  console.log(`Nouveau bon pour ${recipient.label} :`);
  console.log(describe(bon, publicKey, loadClients(args)));
  saveDocument(args, doc, sha, `bons: ${TYPE_LABELS[bon.type]} de ${bon.montant} jetons (${bon.id})`);
}

function cmdAnnuler(args) {
  const id = args._[1];
  if (!id) throw new Error('Indiquer l’identifiant du bon à annuler (voir « liste »).');
  const { privatePem, publicKey } = signingKeys(args);
  const { doc, sha } = loadDocument(args);
  const target = doc.bons.find((b) => b && b.id === id);
  if (!target) throw new Error(`Aucun bon ${id} dans le fichier : rien à annuler.`);
  if (target.type === 'annulation') throw new Error('Une annulation ne s’annule pas. Pour rendre des jetons repris, émettre un cadeau.');
  if (doc.bons.some((b) => b && b.type === 'annulation' && b.annule === id)) throw new Error(`Le bon ${id} est déjà annulé.`);
  if (isExpired(target)) throw new Error(`Le bon ${id} a expiré : l’app l’a déjà oublié, une annulation serait sans effet.`);
  if (!verifyBon(target, publicKey)) throw new Error(`Le bon ${id} n’a pas une signature valide : l’app l’ignore déjà.`);
  const bon = signBon(buildBon({
    montant: target.montant,
    type: 'annulation',
    annule: id,
    pour: target.pour,
    expire: target.expire || '',
    message: args.message
  }), privatePem);
  doc.bons.push(bon);
  console.log('Annulation :');
  console.log(describe(bon, publicKey, loadClients(args)));
  saveDocument(args, doc, sha, `bons: annuler ${id} (${bon.id})`);
}

function cmdRetirer(args) {
  const id = args._[1];
  if (!id) throw new Error('Indiquer l’identifiant du bon (voir « liste »).');
  const { doc, sha } = loadDocument(args);
  const before = doc.bons.length;
  const linked = doc.bons.filter((b) => b && b.type === 'annulation' && b.annule === id).map((b) => b.id);
  doc.bons = doc.bons.filter((b) => b && b.id !== id && !linked.includes(b.id));
  if (doc.bons.length === before) throw new Error(`Aucun bon ${id}.`);
  if (linked.length) console.log(`Annulation(s) liée(s) retirée(s) aussi : ${linked.join(', ')}.`);
  console.log('Rappel : un bon déjà récupéré reste acquis. Pour reprendre des jetons, utiliser « annuler ».');
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
  const clients = loadClients(args);
  console.log(`${doc.bons.length} bon(s) publié(s) :`);
  doc.bons.forEach((b) => console.log(describe(b, publicKey, clients)));
  console.log('Un bon récupéré reste listé ici : l’app ne prévient pas GitHub (pas de serveur). Il ne sert qu’une fois par appareil.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const commands = { init: cmdInit, client: cmdClient, emettre: cmdEmettre, annuler: cmdAnnuler, retirer: cmdRetirer, liste: cmdListe, purger: cmdPurger };
  if (!commands[cmd]) {
    console.log('Usage : node scripts/bons-banquier.js <init|client|emettre|annuler|retirer|liste|purger> [options] (voir l’en-tête du fichier ou docs/BONS-BANQUIER.md)');
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

module.exports = {
  bonPayload, signBon, verifyBon, buildBon, isExpired, accountHash, normalizeAccountCode, formatAccountCode,
  PAYLOAD_TAG, PAYLOAD_TAG_V2, MAX_AMOUNT, MAX_MESSAGE, ACCOUNT_ALPHABET, ACCOUNT_CODE_LEN
};
