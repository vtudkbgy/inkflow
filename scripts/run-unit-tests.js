#!/usr/bin/env node
/**
 * Suite de tests unitaires et d'intégration automatisés — Plume Studio Pro
 * Exécutable via `npm test` ou `node scripts/run-unit-tests.js`
 *
 * Vérifie :
 *  1. Création, renommage, navigation et suppression de cahiers & pages (et persistance IndexedDB)
 *  2. Sauvegarde vectorielle & absence d'écrasement/corruption IndexedDB lors d'un changement de page en plein tracé
 *  3. Historique Annuler / Rétablir (Ctrl+Z / Ctrl+Y) y compris frappe frénétique (x50) sur historique vide ou en plein tracé
 *  4. Scénarios limites (Edge cases) d'importation PDF : fichier vide (0 octet), binaire corrompu, PDF tronqué, et PDF > 100 pages
 *  5. Gestion de la mémoire (Fuites RAM) : éviction des canvas PDF haute résolution, remise à zéro des tampons bitmap, nettoyage des cartes DOM et destruction des PDFDocumentProxy
 *  6. Exportation PDF vectorielle annotée (pdf-lib) combinant le PDF d'origine verrouillé et les annotations (stylo, surligneur, formes, texte/LaTeX)
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function make2dContextMock(canvasObj) {
  return {
    canvas: canvasObj,
    fillStyle: '#ffffff',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '14px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    save() {},
    restore() {},
    scale() {},
    rotate() {},
    translate() {},
    transform() {},
    setTransform() {},
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    resetTransform() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    arc() {},
    arcTo() {},
    ellipse() {},
    rect() {},
    roundRect() {},
    fill() {},
    stroke() {},
    clip() {},
    fillText() {},
    strokeText() {},
    measureText: (t) => ({ width: String(t || '').length * 7 }),
    setLineDash() {},
    getLineDash: () => [],
    drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData() {}
  };
}

/**
 * Simule un moteur IndexedDB asynchrone réaliste (avec délais d'écriture asynchrones)
 * pour détecter toute condition de course (race condition) lors de sauvegardes concurrentes.
 */
function createRealisticAsyncIndexedDB() {
  const databases = new Map();

  function getOrCreateDbStores(name) {
    if (!databases.has(name)) {
      databases.set(name, {
        notebooks: new Map(),
        pages: new Map(),
        pdfs: new Map(),
        meta: new Map()
      });
    }
    return databases.get(name);
  }

  return {
    open(name, _version) {
      const req = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      setTimeout(() => {
        const stores = getOrCreateDbStores(name);
        const dbObj = {
          objectStoreNames: {
            contains: (s) => Boolean(stores[s])
          },
          createObjectStore: (s) => {
            if (!stores[s]) stores[s] = new Map();
            return { createIndex() {} };
          },
          transaction: (storeNames, _mode) => {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const tx = {
              oncomplete: null,
              onerror: null,
              objectStore: (sName) => {
                const map = stores[sName];
                return {
                  put: (val) => {
                    const r = { onsuccess: null, onerror: null };
                    // Simule une écriture disque asynchrone de 12 ms
                    setTimeout(() => {
                      const key = sName === 'meta' ? val.key : val.id;
                      const cloned = typeof structuredClone === 'function' ? structuredClone(val) : JSON.parse(JSON.stringify(val));
                      map.set(key, cloned);
                      if (r.onsuccess) r.onsuccess({ target: r });
                    }, 8);
                    return r;
                  },
                  get: (key) => {
                    const r = { result: undefined, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      const found = map.get(key);
                      r.result = found ? (typeof structuredClone === 'function' ? structuredClone(found) : JSON.parse(JSON.stringify(found))) : undefined;
                      if (r.onsuccess) r.onsuccess({ target: r });
                    }, 4);
                    return r;
                  },
                  getAll: () => {
                    const r = { result: [], onsuccess: null, onerror: null };
                    setTimeout(() => {
                      r.result = Array.from(map.values()).map((v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v))));
                      if (r.onsuccess) r.onsuccess({ target: r });
                    }, 4);
                    return r;
                  },
                  delete: (key) => {
                    const r = { onsuccess: null, onerror: null };
                    setTimeout(() => {
                      map.delete(key);
                      if (r.onsuccess) r.onsuccess({ target: r });
                    }, 5);
                    return r;
                  },
                  index: (_idxName) => ({
                    getAll: (notebookId) => {
                      const r = { result: [], onsuccess: null, onerror: null };
                      setTimeout(() => {
                        r.result = Array.from(map.values())
                          .filter((item) => item.notebookId === notebookId)
                          .map((v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v))));
                        if (r.onsuccess) r.onsuccess({ target: r });
                      }, 5);
                      return r;
                    }
                  })
                };
              }
            };
            // Déclenche tx.oncomplete après les opérations de la transaction
            setTimeout(() => {
              if (tx.oncomplete) tx.oncomplete();
            }, 18);
            return tx;
          }
        };
        req.result = dbObj;
        if (req.onupgradeneeded) req.onupgradeneeded({ target: req });
        if (req.onsuccess) req.onsuccess({ target: req });
      }, 5);
      return req;
    }
  };
}

function createAppSandbox() {
  const rootDir = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const pdfMinCode = fs.readFileSync(path.join(rootDir, 'vendor', 'pdf.min.js'), 'utf8');
  const pdfWorkerCode = fs.readFileSync(path.join(rootDir, 'vendor', 'pdf.worker.min.js'), 'utf8');
  const pdfLibCode = fs.readFileSync(path.join(rootDir, 'vendor', 'pdf-lib.min.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');

  const idRegex = /id="([^"]+)"/g;
  const ids = new Set();
  let m;
  while ((m = idRegex.exec(html)) !== null) ids.add(m[1]);

  function makeMockElement(id = '', tag = 'DIV') {
    const isCanvas = tag === 'CANVAS' || id.toLowerCase().includes('canvas');
    const listeners = {};
    const children = [];
    const defaultHiddenIds = new Set(['modalImportPdf', 'toolOptionsDock', 'radialColorWheel', 'pdfImportErrorBanner', 'pdfImportProgressWrap']);
    const classSet = new Set(defaultHiddenIds.has(id) ? ['hidden'] : []);

    const el = {
      id,
      tagName: isCanvas ? 'CANVAS' : tag,
      width: isCanvas ? 1200 : 0,
      height: isCanvas ? 800 : 0,
      offsetWidth: 260,
      offsetHeight: 80,
      value: '',
      rows: 2,
      placeholder: '',
      checked: true,
      disabled: false,
      textContent: '',
      _innerHTML: '',
      get innerHTML() {
        return this._innerHTML;
      },
      set innerHTML(val) {
        this._innerHTML = String(val || '');
        if (val === '') {
          children.forEach((c) => { c.isConnected = false; c.parentElement = null; });
          children.length = 0;
        }
      },
      dataset: {},
      style: {},
      files: [],
      children,
      isConnected: true,
      parentElement: null,
      get firstElementChild() {
        return children[0] || null;
      },
      classList: {
        add: (...c) => c.forEach((x) => classSet.add(x)),
        remove: (...c) => c.forEach((x) => classSet.delete(x)),
        toggle: (c, force) => {
          const next = typeof force === 'boolean' ? force : !classSet.has(c);
          if (next) classSet.add(c); else classSet.delete(c);
          return next;
        },
        contains: (c) => classSet.has(c)
      },
      get className() {
        return Array.from(classSet).join(' ');
      },
      set className(val) {
        classSet.clear();
        String(val || '').split(/\s+/).filter(Boolean).forEach((c) => classSet.add(c));
      },
      addEventListener: (ev, fn) => {
        if (!listeners[ev]) listeners[ev] = [];
        listeners[ev].push(fn);
      },
      removeEventListener: (ev, fn) => {
        if (listeners[ev]) listeners[ev] = listeners[ev].filter((f) => f !== fn);
      },
      dispatchEvent: (evt) => {
        const list = listeners[evt.type] || [];
        for (const fn of list) fn(evt);
      },
      setAttribute: () => {},
      getAttribute: () => 'light',
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      appendChild: (c) => {
        if (c) {
          c.isConnected = true;
          c.parentElement = el;
          children.push(c);
        }
        return c;
      },
      remove: () => {
        el.isConnected = false;
        if (el.parentElement && Array.isArray(el.parentElement.children)) {
          const idx = el.parentElement.children.indexOf(el);
          if (idx !== -1) el.parentElement.children.splice(idx, 1);
        }
      },
      focus: () => {},
      blur: () => {
        const list = listeners.blur || [];
        for (const fn of list) fn({ type: 'blur', target: el });
      },
      select: () => {},
      setSelectionRange: () => {},
      click: () => {},
      closest: () => null,
      querySelector: () => makeMockElement('', 'DIV'),
      querySelectorAll: () => [],
      getContext: () => (isCanvas ? make2dContextMock(el) : null),
      toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      toBlob: (cb) => cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })),
      __listeners: listeners
    };
    return el;
  }

  const elementsById = new Map();
  for (const id of ids) {
    elementsById.set(id, makeMockElement(id, id.toLowerCase().includes('canvas') ? 'CANVAS' : 'DIV'));
  }

  const windowListeners = {};
  const documentListeners = {};

  const NativeURL = globalThis.URL;
  NativeURL.createObjectURL = () => 'blob:http://tauri.localhost/mock';
  NativeURL.revokeObjectURL = () => {};

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 4),
    performance: { now: () => Date.now() },
    devicePixelRatio: 2.0,
    indexedDB: createRealisticAsyncIndexedDB(),
    Path2D: class Path2D {
      constructor(d) { this.d = d || ''; }
      moveTo() {}
      lineTo() {}
      quadraticCurveTo() {}
      bezierCurveTo() {}
      arc() {}
      rect() {}
      closePath() {}
    },
    Blob,
    structuredClone: globalThis.structuredClone,
    ReadableStream: globalThis.ReadableStream,
    WritableStream: globalThis.WritableStream,
    TransformStream: globalThis.TransformStream,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    Uint8Array,
    ArrayBuffer,
    DataView,
    Int8Array,
    Uint16Array,
    Int16Array,
    Uint32Array,
    Int32Array,
    Float32Array,
    Float64Array,
    Uint8ClampedArray,
    TextEncoder,
    TextDecoder,
    URL: NativeURL,
    Image: class Image {},
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      clipboard: { writeText: async () => {} }
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    location: {
      href: 'http://tauri.localhost/index.html',
      origin: 'http://tauri.localhost',
      protocol: 'http:',
      host: 'tauri.localhost'
    },
    addEventListener: (ev, fn) => {
      if (!windowListeners[ev]) windowListeners[ev] = [];
      windowListeners[ev].push(fn);
    },
    removeEventListener: (ev, fn) => {
      if (windowListeners[ev]) windowListeners[ev] = windowListeners[ev].filter((f) => f !== fn);
    },
    dispatchEvent: (evt) => {
      const list = windowListeners[evt.type] || [];
      for (const fn of list) fn(evt);
    },
    focus: () => {},
    document: {
      documentElement: makeMockElement('html', 'HTML'),
      body: makeMockElement('body', 'BODY'),
      head: makeMockElement('head', 'HEAD'),
      getElementById: (id) => {
        if (!elementsById.has(id)) elementsById.set(id, makeMockElement(id));
        return elementsById.get(id);
      },
      createElement: (tag) => makeMockElement('', String(tag || 'DIV').toUpperCase()),
      createElementNS: (_ns, tag) => makeMockElement('', String(tag || 'SVG').toUpperCase()),
      querySelectorAll: () => [],
      querySelector: () => makeMockElement('', 'DIV'),
      addEventListener: (ev, fn) => {
        if (!documentListeners[ev]) documentListeners[ev] = [];
        documentListeners[ev].push(fn);
      },
      removeEventListener: (ev, fn) => {
        if (documentListeners[ev]) documentListeners[ev] = documentListeners[ev].filter((f) => f !== fn);
      }
    },
    __windowListeners: windowListeners,
    __documentListeners: documentListeners
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(pdfMinCode, sandbox);
  vm.runInContext(pdfWorkerCode, sandbox);
  vm.runInContext(pdfLibCode, sandbox);
  vm.runInContext(appCode, sandbox);

  return sandbox;
}

/**
 * Exécute `sw.js` dans un bac à sable isolé avec un Cache Storage et un réseau simulés.
 * `network.online` bascule le réseau ; `network.files` contient les fichiers servis.
 */
function createServiceWorkerSandbox() {
  const rootDir = path.resolve(__dirname, '..');
  const swCode = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  const origin = 'http://localhost:5173';
  const listeners = {};
  const stores = new Map();
  const network = { online: true, files: new Map(), redirected: new Set(), partial: new Set(), requests: [] };

  const toUrl = (input) => new URL(typeof input === 'string' ? input : input.url, `${origin}/sw.js`).href;
  const stripSearch = (href) => href.split('?')[0];

  function openStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      entries,
      async add(request) {
        const response = await fakeFetch(request);
        if (!response.ok) throw new TypeError(`Échec du cache pour ${toUrl(request)}`);
        entries.set(toUrl(request), response);
      },
      async addAll(requests) {
        for (const request of requests) await this.add(request);
      },
      async put(request, response) {
        entries.set(toUrl(request), response);
      },
      async match(request, opts = {}) {
        const href = toUrl(request);
        if (entries.has(href)) return entries.get(href).clone();
        if (opts.ignoreSearch) {
          for (const [key, value] of entries) {
            if (stripSearch(key) === stripSearch(href)) return value.clone();
          }
        }
        return undefined;
      }
    };
  }

  const caches = {
    open: async (name) => openStore(name),
    keys: async () => Array.from(stores.keys()),
    delete: async (name) => stores.delete(name),
    match: async (request, opts) => {
      for (const name of stores.keys()) {
        const hit = await openStore(name).match(request, opts);
        if (hit) return hit;
      }
      return undefined;
    }
  };

  async function fakeFetch(input) {
    const href = toUrl(input);
    network.requests.push(href);
    if (!network.online) throw new TypeError('Failed to fetch');
    const pathname = new URL(href).pathname;
    const key = pathname === '/' ? '/index.html' : pathname;
    if (!network.files.has(key)) return new Response('Not found', { status: 404 });
    const status = network.partial.has(pathname) ? 206 : 200;
    const res = new Response(network.files.get(key), { status });
    Object.defineProperty(res, 'type', { value: 'basic' });
    // Simule un serveur qui redirige ce chemin (ex. `serve` : /index.html → /)
    Object.defineProperty(res, 'redirected', { value: network.redirected.has(pathname) });
    return res;
  }

  // Comme dans un vrai service worker, une URL relative se résout par rapport à l'emplacement de sw.js.
  class SwRequest extends Request {
    constructor(input, init) {
      super(typeof input === 'string' ? new URL(input, `${origin}/sw.js`).href : input, init);
    }
  }

  const sandbox = {
    console,
    URL,
    Request: SwRequest,
    Response,
    Promise,
    caches,
    fetch: fakeFetch,
    location: new URL(`${origin}/sw.js`),
    clients: { claim: async () => { sandbox.__claimed = true; } },
    skipWaiting: () => { sandbox.__skipped = true; },
    addEventListener: (type, fn) => { listeners[type] = fn; }
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(swCode, sandbox);

  async function dispatchExtendable(type, extra = {}) {
    const waits = [];
    let responded = null;
    const event = {
      ...extra,
      waitUntil: (p) => waits.push(p),
      respondWith: (p) => { responded = p; }
    };
    listeners[type](event);
    const response = responded ? await responded : null;
    await Promise.all(waits);
    return { response, intercepted: Boolean(responded) };
  }

  const fetchEvent = (url, init = {}, mode = 'cors') => {
    const request = new Request(new URL(url, origin).href, init);
    Object.defineProperty(request, 'mode', { value: mode });
    return dispatchExtendable('fetch', { request });
  };

  return { sandbox, stores, network, origin, dispatchExtendable, fetchEvent };
}

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 SUITE DE TESTS UNITAIRES & AUDIT QUALITÉ — PLUME STUDIO PRO');
  console.log('======================================================================');

  const sandbox = createAppSandbox();
  const api = sandbox.__plumeStudioApi;
  assert.ok(api, 'window.__plumeStudioApi doit être exposé');

  // Attendre la fin du chargement initial IndexedDB
  await new Promise((r) => setTimeout(r, 120));

  const results = [];
  async function runStep(name, fn) {
    const start = Date.now();
    try {
      const detail = await fn();
      const ms = Date.now() - start;
      console.log(`✅ [PASS] ${name} (${ms} ms)`);
      if (detail) console.log(`   ↳ ${detail}`);
      results.push({ name, status: 'PASS', ms, detail });
    } catch (err) {
      const ms = Date.now() - start;
      console.error(`❌ [FAIL] ${name} (${ms} ms)`);
      console.error(`   ↳ ${err && err.stack ? err.stack : err}`);
      results.push({ name, status: 'FAIL', ms, error: String(err) });
      throw err;
    }
  }

  // ------------------------------------------------------------------------
  // TEST 1 : Création, navigation et suppression de cahiers & pages
  // ------------------------------------------------------------------------
  await runStep('Test 1 : Création / suppression de cahiers et pages + nettoyage historique', async () => {
    const st = api.getState();
    const initialNbCount = st.notebooks.length;

    const { notebook: nbCreated, firstPage: p1 } = await api.createNotebookProgrammatically('Cahier Test Audit', 'grid', '#047857');
    const p2 = await api.addNewPageToActiveNotebook();
    const p3 = await api.addNewPageToActiveNotebook();

    // Ajoute un historique sur p2 pour vérifier son nettoyage à la suppression
    api.selectPage(p2.id);
    api.pushHistorySnapshot();

    const dbNbsAfterCreate = await api.db.getAllNotebooks();
    const dbPagesAfterCreate = await api.db.getPagesForNotebook(nbCreated.id);

    assert.equal(dbNbsAfterCreate.some((n) => n.id === nbCreated.id), true, 'Le cahier créé doit être sauvegardé dans IndexedDB');
    assert.equal(dbPagesAfterCreate.length, 3, 'Le cahier créé doit contenir 3 pages dans IndexedDB');

    // Supprime la page p2
    const delPageOk = await api.deletePageById(p2.id);
    assert.equal(delPageOk, true, 'La suppression de la page 2 doit réussir');
    assert.equal(st.historyByPage.has(p2.id), false, 'L’historique Undo/Redo de la page supprimée doit être nettoyé de la RAM');

    const dbPagesAfterPageDelete = await api.db.getPagesForNotebook(nbCreated.id);
    assert.equal(dbPagesAfterPageDelete.length, 2, 'Il doit rester 2 pages dans IndexedDB après suppression');

    // Supprime aussi p3 puis tente de supprimer la toute dernière page p1 (doit être refusé proprement)
    await api.deletePageById(p3.id);
    const delLastPageAttempt = await api.deletePageById(p1.id);
    assert.equal(delLastPageAttempt, false, 'La suppression de l’unique page restante d’un cahier doit être bloquée proprement');

    // Supprime le cahier créé
    const delNbOk = await api.deleteNotebookById(nbCreated.id);
    assert.equal(delNbOk, true, 'La suppression du cahier doit réussir');

    const dbNbsAfterNbDelete = await api.db.getAllNotebooks();
    const dbPagesAfterNbDelete = await api.db.getPagesForNotebook(nbCreated.id);
    assert.equal(dbNbsAfterNbDelete.some((n) => n.id === nbCreated.id), false, 'Le cahier supprimé ne doit plus exister dans IndexedDB');
    assert.equal(dbPagesAfterNbDelete.length, 0, 'Les pages du cahier supprimé ne doivent plus exister dans IndexedDB');
    assert.equal(st.notebooks.length, initialNbCount, 'Le nombre de cahiers doit revenir à l’état initial');

    // Vérification GoodNotes : Corbeille (soft-delete + restauration + vidage), Rotation 90°, Réorganisation de pages, Plan (Outline) & Modèles de papier
    const { notebook: nbGn, firstPage: gnP1 } = await api.createNotebookProgrammatically('Cahier GoodNotes FS', 'cornell', '#0072ce');
    const gnP2 = await api.addNewPageToActiveNotebook();
    gnP2.paperType = 'twocolumn';
    api.renderScene();
    gnP2.paperType = 'planner';
    api.renderScene();

    // Rotation 90° de la page
    const rotated = await api.rotatePageById(gnP1.id, 90);
    assert.equal(rotated.rotation, 90, 'rotatePageById doit pivoter la page de 90°');

    // Vérification héritage complet des paramètres de la page précédente lors de la création d'une nouvelle page
    gnP1.paperType = 'seyes';
    gnP1.paperTone = 'dark';
    gnP1.gridSize = 40;
    gnP1.viewMode = 'page';
    gnP1.bookmarked = true;
    api.selectPage(gnP1.id);
    const gnP3Inherited = await api.addNewPageToActiveNotebook();
    assert.equal(gnP3Inherited.paperType, 'seyes', 'La nouvelle page doit hériter de paperType');
    assert.equal(gnP3Inherited.paperTone, 'dark', 'La nouvelle page doit hériter de paperTone');
    assert.equal(gnP3Inherited.gridSize, 40, 'La nouvelle page doit hériter de gridSize');
    assert.equal(gnP3Inherited.viewMode, 'page', 'La nouvelle page doit hériter de viewMode (A4/Infinie)');
    assert.equal(gnP3Inherited.rotation, 90, 'La nouvelle page doit hériter de la rotation (90°)');
    assert.equal(gnP3Inherited.pdfWidth, gnP1.pdfWidth, 'La nouvelle page doit hériter de la largeur orientée');
    assert.equal(gnP3Inherited.pdfHeight, gnP1.pdfHeight, 'La nouvelle page doit hériter de la hauteur orientée');
    assert.equal(gnP3Inherited.bookmarked, false, 'La nouvelle page ne doit pas copier le signet');
    assert.equal((gnP3Inherited.strokes || []).length, 0, 'La nouvelle page doit être vierge de traits');
    await api.deletePageById(gnP3Inherited.id);

    // Réorganisation des pages (glisser-déposer page 0 -> index 1)
    const reordered = await api.reorderPagesInActiveNotebook(0, 1);
    assert.equal(reordered, true, 'reorderPagesInActiveNotebook(0, 1) doit réussir');
    assert.equal(api.getActiveNotebookPages()[1].id, gnP1.id, 'La page 1 doit maintenant être en position 1');

    // Ajout d'une entrée au Plan (Outline)
    const outlineEntry = await api.addOutlineEntryForPage(gnP1.id, 'Chapitre 1 : Introduction', 1);
    assert.ok(outlineEntry && outlineEntry.title === 'Chapitre 1 : Introduction', 'addOutlineEntryForPage doit créer une entrée dans nb.outline');
    assert.equal(nbGn.outline.length, 1, 'Le cahier doit contenir 1 entrée de plan');

    // Mise à la corbeille (soft-delete) puis restauration
    const trashedOk = await api.moveNotebookToTrash(nbGn.id);
    assert.equal(trashedOk, true, 'moveNotebookToTrash doit déplacer le cahier dans la corbeille');
    assert.ok(Number.isFinite(nbGn.trashedAt) && nbGn.trashedAt > 0, 'nb.trashedAt doit être défini');
    const restoredOk = await api.restoreNotebookFromTrash(nbGn.id);
    assert.equal(restoredOk, true, 'restoreNotebookFromTrash doit restaurer le cahier');
    assert.equal(nbGn.trashedAt, null, 'nb.trashedAt doit être remis à null après restauration');

    // Mise à la corbeille puis vidage définitif de la corbeille
    await api.moveNotebookToTrash(nbGn.id);
    const purgedCount = await api.emptyTrash();
    assert.equal(purgedCount, 1, 'emptyTrash doit supprimer définitivement le cahier mis à la corbeille');
    assert.equal(st.notebooks.length, initialNbCount, 'Le nombre de cahiers doit revenir à l’état initial après emptyTrash');

    return `Cahier créé (3 pages), Corbeille/Restauration, Rotation 90°, Réorganisation, Plan & Modèles GoodNotes : 0 orphelin IndexedDB/RAM.`;
  });

  // ------------------------------------------------------------------------
  // TEST 2 : Sauvegarde vectorielle & Concurrence IndexedDB (changement de page en plein trait)
  // ------------------------------------------------------------------------
  await runStep('Test 2 : Sauvegarde vectorielle & absence de corruption IndexedDB lors d’un changement de page en plein tracé', async () => {
    const st = api.getState();
    const { notebook: nb, firstPage: pageA } = await api.createNotebookProgrammatically('Cahier Concurrence IndexedDB', 'lined', '#1d4ed8');
    const pageB = await api.addNewPageToActiveNotebook();

    // Revient sur Page A et commence un tracé au stylet SANS lever le stylet (pas de pointerup !)
    api.selectPage(pageA.id);
    st.tool = 'pen';
    st.penColor = '#dc2626';
    st.penSize = 6;

    api.handlePointerDown({
      pointerId: 701,
      pointerType: 'pen',
      button: 0,
      buttons: 1,
      clientX: 180,
      clientY: 200,
      pressure: 0.7,
      preventDefault() {}
    });
    for (let i = 1; i <= 8; i++) {
      api.handlePointerMove({
        pointerId: 701,
        pointerType: 'pen',
        button: 0,
        buttons: 1,
        clientX: 180 + i * 12,
        clientY: 200 + i * 6,
        pressure: 0.75,
        getCoalescedEvents: () => [],
        preventDefault() {}
      });
    }

    assert.equal(st.isDrawing, true, 'Le trait doit être en cours de dessin avant le changement de page');
    assert.ok(st.currentStroke, 'currentStroke doit être non nul avant le changement de page');

    // Changement brutal vers Page B PENDANT que le trait sur Page A est encore en cours !
    api.selectPage(pageB.id);

    assert.equal(st.isDrawing, false, 'L’état isDrawing doit être nettoyé lors du changement de page');
    assert.equal(pageA.strokes.length, 1, 'Le trait en cours sur Page A doit être finalisé sur Page A avant la bascule');

    // Dessine immédiatement un trait bleu sur Page B pendant que la sauvegarde asynchrone de Page A est en cours
    st.penColor = '#2563eb';
    api.handlePointerDown({
      pointerId: 702,
      pointerType: 'pen',
      button: 0,
      buttons: 1,
      clientX: 220,
      clientY: 280,
      pressure: 0.65,
      preventDefault() {}
    });
    for (let i = 1; i <= 6; i++) {
      api.handlePointerMove({
        pointerId: 702,
        pointerType: 'pen',
        button: 0,
        buttons: 1,
        clientX: 220 + i * 15,
        clientY: 280 - i * 5,
        pressure: 0.68,
        getCoalescedEvents: () => [],
        preventDefault() {}
      });
    }
    api.handlePointerUpOrCancel({
      pointerId: 702,
      pointerType: 'pen',
      button: 0,
      buttons: 0,
      clientX: 310,
      clientY: 250,
      pressure: 0.5,
      preventDefault() {}
    });

    // Force la synchronisation de toutes les sauvegardes IndexedDB en attente
    await api.flushPendingPageSaves();

    const savedPages = await api.db.getPagesForNotebook(nb.id);
    const savedPageA = savedPages.find((p) => p.id === pageA.id);
    const savedPageB = savedPages.find((p) => p.id === pageB.id);

    assert.equal(savedPageA.strokes.length, 1, 'Page A dans IndexedDB doit contenir exactement 1 trait');
    assert.equal(savedPageA.strokes[0].color, '#dc2626', 'Le trait sauvegardé sur Page A doit conserver sa couleur rouge');
    assert.ok(savedPageA.strokes[0].points.length >= 5, 'Le trait sauvegardé sur Page A doit contenir tous ses points vectoriels');

    assert.equal(savedPageB.strokes.length, 1, 'Page B dans IndexedDB doit contenir exactement 1 trait');
    assert.equal(savedPageB.strokes[0].color, '#2563eb', 'Le trait sauvegardé sur Page B doit conserver sa couleur bleue');
    assert.ok(savedPageB.strokes[0].points.length >= 4, 'Le trait sauvegardé sur Page B doit contenir tous ses points vectoriels');

    await api.deleteNotebookById(nb.id);
    return `Page A (${savedPageA.strokes[0].points.length} pts, ${savedPageA.strokes[0].color}) et Page B (${savedPageB.strokes[0].points.length} pts, ${savedPageB.strokes[0].color}) enregistrées sans collision dans IndexedDB.`;
  });

  // ------------------------------------------------------------------------
  // TEST 3 : Historique Annuler / Rétablir & Frappe frénétique Ctrl+Z / Ctrl+Y
  // ------------------------------------------------------------------------
  await runStep('Test 3 : Frappe frénétique Ctrl+Z (x50) et Ctrl+Y (x50) avec historique vide et en plein tracé', async () => {
    const st = api.getState();
    const { notebook: nb, firstPage: pg } = await api.createNotebookProgrammatically('Cahier Test Undo Redo', 'grid', '#7c3aed');

    // Trace 3 traits distincts
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      const sx = 150 + sIdx * 60;
      const sy = 180 + sIdx * 35;
      api.handlePointerDown({
        pointerId: 800 + sIdx,
        pointerType: 'pen',
        button: 0,
        buttons: 1,
        clientX: sx,
        clientY: sy,
        pressure: 0.6,
        preventDefault() {}
      });
      api.handlePointerMove({
        pointerId: 800 + sIdx,
        pointerType: 'pen',
        button: 0,
        buttons: 1,
        clientX: sx + 45,
        clientY: sy + 25,
        pressure: 0.7,
        getCoalescedEvents: () => [],
        preventDefault() {}
      });
      api.handlePointerUpOrCancel({
        pointerId: 800 + sIdx,
        pointerType: 'pen',
        button: 0,
        buttons: 0,
        clientX: sx + 90,
        clientY: sy + 50,
        pressure: 0.5,
        preventDefault() {}
      });
    }

    assert.equal(pg.strokes.length, 3, 'La page doit compter 3 traits avant annulation');

    // Frappe frénétique : 50 appels Ctrl+Z (alors qu'il n'y a que 3 états dans l'historique !)
    let undoSuccessCount = 0;
    for (let i = 0; i < 50; i++) {
      sandbox.dispatchEvent({
        type: 'keydown',
        key: 'z',
        code: 'KeyZ',
        ctrlKey: true,
        shiftKey: false,
        target: { tagName: 'DIV' },
        preventDefault() {}
      });
      if (api.performUndo()) undoSuccessCount++;
    }
    const strokesAfterFranticUndo = pg.strokes.length;
    const toastDomCountAfterUndo = sandbox.document.getElementById('toastContainer').children.length;

    assert.equal(strokesAfterFranticUndo, 0, 'Après 50 Ctrl+Z frénétiques, la page doit avoir 0 trait sans erreur');
    assert.ok(toastDomCountAfterUndo <= 3, `Le conteneur de notifications ne doit pas dépasser 3 toasts DOM (actuel: ${toastDomCountAfterUndo})`);

    // Frappe frénétique : 50 appels Ctrl+Y (alors qu'il n'y a que 3 états à rétablir !)
    for (let i = 0; i < 50; i++) {
      sandbox.dispatchEvent({
        type: 'keydown',
        key: 'y',
        code: 'KeyY',
        ctrlKey: true,
        shiftKey: false,
        target: { tagName: 'DIV' },
        preventDefault() {}
      });
      api.performRedo();
    }
    const strokesAfterFranticRedo = pg.strokes.length;
    const toastDomCountAfterRedo = sandbox.document.getElementById('toastContainer').children.length;

    assert.equal(strokesAfterFranticRedo, 3, 'Après 50 Ctrl+Y frénétiques, les 3 traits doivent être intégralement rétablis');
    assert.ok(toastDomCountAfterRedo <= 3, `Le conteneur de notifications ne doit pas dépasser 3 toasts DOM (actuel: ${toastDomCountAfterRedo})`);

    // Cas limite supplémentaire : appuyer sur Ctrl+Z PENDANT qu'un 4e trait est en train d'être dessiné
    api.handlePointerDown({
      pointerId: 899,
      pointerType: 'pen',
      button: 0,
      buttons: 1,
      clientX: 200,
      clientY: 300,
      pressure: 0.8,
      preventDefault() {}
    });
    api.handlePointerMove({
      pointerId: 899,
      pointerType: 'pen',
      button: 0,
      buttons: 1,
      clientX: 260,
      clientY: 340,
      pressure: 0.8,
      getCoalescedEvents: () => [],
      preventDefault() {}
    });
    api.performUndo();
    assert.equal(pg.strokes.length, 3, 'Un Ctrl+Z en plein 4e tracé doit finaliser puis annuler proprement ce 4e tracé');
    assert.equal(st.isDrawing, false, 'isDrawing doit être false après un Ctrl+Z en plein tracé');

    // Vérification du cache Path2D/bounds/renderMode, de cloneStrokeFast, de la gomme et de Undo/Redo sur tapes & images
    const firstStroke = pg.strokes[0];
    firstStroke.penStyle = 'brush';
    firstStroke.recognizedSymbol = 'x';
    firstStroke.recognizedGroup = 'g_test';
    const rawBounds = api.computeStrokeBounds(firstStroke);
    assert.ok(Number.isFinite(rawBounds.width) && Number.isFinite(rawBounds.height) && Number.isFinite(rawBounds.cx) && Number.isFinite(rawBounds.cy), 'computeStrokeBounds doit retourner width, height, cx, cy');
    const cachedPen = api.getCachedStrokePath(firstStroke);
    assert.equal(cachedPen.renderMode, 'fill', 'Un trait de stylo dynamique doit avoir renderMode="fill" dans strokePathCache');
    assert.ok(cachedPen.bounds && Number.isFinite(cachedPen.bounds.minX), 'getCachedStrokePath doit inclure bounds');
    assert.deepEqual(api.getCachedStrokeBounds(firstStroke), cachedPen.bounds, 'getCachedStrokeBounds doit retourner les bounds en cache');

    const clonedStroke = api.cloneStrokeFast(firstStroke);
    assert.equal(clonedStroke.penStyle, 'brush', 'cloneStrokeFast doit préserver penStyle');
    assert.equal(clonedStroke.recognizedSymbol, 'x', 'cloneStrokeFast doit préserver recognizedSymbol');
    assert.equal(clonedStroke.recognizedGroup, 'g_test', 'cloneStrokeFast doit préserver recognizedGroup');
    assert.equal(api.getCachedStrokePath(clonedStroke), cachedPen, 'cloneStrokeFast doit préserver l’entrée WeakMap strokePathCache');

    const hlStroke = {
      id: 'st_hl_mode_check',
      tool: 'highlighter',
      color: '#facc15',
      size: 20,
      pressureMode: 'uniform',
      points: [{ x: 100, y: 100, pressure: 0.5 }, { x: 200, y: 100, pressure: 0.5 }]
    };
    const cachedHl = api.getCachedStrokePath(hlStroke);
    assert.equal(cachedHl.renderMode, 'stroke', 'Un trait de surligneur doit avoir renderMode="stroke" dans strokePathCache');

    // Test Gomme (applyEraserAtPoint utilise getCachedStrokeBounds) + Undo/Redo avec tapes et images
    api.pushHistorySnapshot(pg);
    pg.tapes = [{ id: 'tp_test_1', x1: 100, y1: 100, x2: 240, y2: 100, thickness: 24, color: '#f59e0b', revealed: false }];
    pg.images = [{ id: 'img_test_1', x: 120, y: 120, width: 160, height: 120, src: 'data:image/png;base64,iVBORw0KGgo=' }];
    const hitPt = firstStroke.points[0];
    st.eraserMode = 'stroke';
    api.applyEraserAtPoint(hitPt.x, hitPt.y);
    assert.equal(pg.strokes.length, 2, 'La gomme mode trait entier doit effacer le trait touché via getCachedStrokeBounds');

    api.performUndo();
    assert.equal(pg.strokes.length, 3, 'Undo après gomme doit restaurer les 3 traits');
    assert.equal((pg.tapes || []).length, 0, 'Undo doit restaurer tapes à son état précédent');
    assert.equal((pg.images || []).length, 0, 'Undo doit restaurer images à son état précédent');

    api.performRedo();
    assert.equal(pg.strokes.length, 2, 'Redo doit ré-appliquer la suppression par gomme');
    assert.equal((pg.tapes || []).length, 1, 'Redo doit restaurer le ruban (tape)');
    assert.equal((pg.images || []).length, 1, 'Redo doit restaurer l’image');

    // Vérification GoodNotes Ink & Outils : One-Euro Filter, traits pointillés/tirets, Surligneur auto-straighten, Gomme Segment & Surligneur seul & Auto-deselect, Lasso Rectangulaire
    const euroState = { minCutoff: 1.45, beta: 0.032, dCutoff: 1.0 };
    const euroInit = api.oneEuroFilterStep(100, 0.0, euroState);
    const euroFiltered = api.oneEuroFilterStep(110, 0.016, euroState);
    assert.equal(euroInit, 100, 'oneEuroFilterStep doit initialiser avec la première valeur');
    assert.ok(euroFiltered > 100 && euroFiltered <= 110, 'oneEuroFilterStep doit lisser de manière adaptative entre prevVal et rawVal');

    const dashedStroke = {
      id: 'st_dashed_check',
      tool: 'pen',
      penStyle: 'ballpoint',
      lineStyle: 'dashed',
      color: '#1e293b',
      size: 4,
      pressureMode: 'dynamic',
      points: [{ x: 100, y: 120, pressure: 0.5 }, { x: 240, y: 120, pressure: 0.6 }]
    };
    assert.equal(api.getCachedStrokePath(dashedStroke).renderMode, 'stroke', 'Un trait en mode tirets (lineStyle="dashed") doit utiliser renderMode="stroke"');

    // Surligneur Auto-Straighten : un trait quasi-rectiligne doit être redressé en 2 points alignés
    st.tool = 'highlighter';
    st.highlighterAutoStraighten = true;
    api.handlePointerDown({ pointerId: 910, pointerType: 'pen', button: 0, buttons: 1, clientX: 100, clientY: 200, pressure: 0.5, timeStamp: 1000, preventDefault() {} });
    api.handlePointerMove({ pointerId: 910, pointerType: 'pen', button: 0, buttons: 1, clientX: 230, clientY: 202, pressure: 0.5, timeStamp: 1025, getCoalescedEvents: () => [], preventDefault() {} });
    api.handlePointerMove({ pointerId: 910, pointerType: 'pen', button: 0, buttons: 1, clientX: 360, clientY: 201, pressure: 0.5, timeStamp: 1050, getCoalescedEvents: () => [], preventDefault() {} });
    api.handlePointerUpOrCancel({ pointerId: 910, pointerType: 'pen', button: 0, buttons: 0, clientX: 360, clientY: 201, pressure: 0, timeStamp: 1070, preventDefault() {} });
    const autoStraightHl = pg.strokes[pg.strokes.length - 1];
    assert.equal(autoStraightHl.tool, 'highlighter', 'Le dernier trait doit être un surligneur');
    assert.equal(autoStraightHl.points.length, 2, 'Le surligneur quasi-rectiligne doit être redressé en un segment parfait de 2 points');
    assert.equal(autoStraightHl.points[0].y, autoStraightHl.points[1].y, 'Le surligneur quasi-horizontal (< 4°) doit être aligné horizontalement');

    // Curseur point coloré minimaliste (#colorDotCursor) synchronisé sur la couleur de l'outil actif
    const colorDotEl = sandbox.document.getElementById('colorDotCursor');
    assert.ok(colorDotEl, 'L’élément #colorDotCursor doit exister dans le DOM');
    st.tool = 'pen';
    st.penColor = '#2563eb';
    api.handlePointerMove({ pointerId: 915, pointerType: 'pen', button: 0, buttons: 0, clientX: 140, clientY: 160, pressure: 0, getCoalescedEvents: () => [], preventDefault() {} });
    assert.equal(colorDotEl.style.display, 'block', 'Le point coloré doit s’afficher au survol du stylo');
    assert.equal(colorDotEl.style.backgroundColor, '#2563eb', 'Le point coloré doit refléter la couleur sélectionnée du stylo');
    st.tool = 'eraser';
    api.handlePointerMove({ pointerId: 915, pointerType: 'pen', button: 0, buttons: 0, clientX: 145, clientY: 165, pressure: 0, getCoalescedEvents: () => [], preventDefault() {} });
    assert.equal(colorDotEl.style.display, 'none', 'Le point coloré doit être masqué lorsque la gomme est active');

    // Vérification Griffonner pour effacer : 0 faux positif en écriture cursive & suppression chirurgicale (sans effacer ce qu'il y a autour)
    st.scribbleToErase = true;
    st.scribbleEraseShapesAndHl = true;
    const scribTestPage = {
      id: 'pg_scribble_test',
      notebookId: pg.notebookId,
      strokes: [
        // Mot cible à l'intérieur d'un cadre (y=300, x=300..360)
        { id: 'st_typo', tool: 'pen', size: 4, color: '#111827', points: [{ x: 300, y: 300 }, { x: 320, y: 292 }, { x: 340, y: 308 }, { x: 360, y: 300 }] },
        // Mot voisin juste à droite (x=378..430) — NE DOIT PAS être effacé
        { id: 'st_neighbor', tool: 'pen', size: 4, color: '#111827', points: [{ x: 378, y: 300 }, { x: 405, y: 294 }, { x: 430, y: 304 }] },
        // Longue diagonale voisine dont la boîte englobante chevauche (260,240)->(420,260) — NE DOIT PAS être effacée
        { id: 'st_diag_nearby', tool: 'pen', size: 4, color: '#111827', points: [{ x: 250, y: 245 }, { x: 420, y: 255 }] }
      ],
      shapes: [
        // Cadre rectangle entourant tout (240..460, 230..360) — NE DOIT PAS être effacé quand on griffonne à l'intérieur !
        { id: 'sh_outer_box', type: 'rect', x1: 240, y1: 230, x2: 460, y2: 360, size: 3, color: '#2563eb' }
      ],
      texts: [],
      tapes: [],
      images: []
    };
    // 1) Écriture cursive "mmmm" progressant gauche->droite juste à côté du mot voisin : NE DOIT JAMAIS effacer !
    const cursivePts = [];
    for (let k = 0; k <= 24; k++) {
      cursivePts.push({ x: 375 + k * 2.4, y: 318 - Math.abs(Math.sin(k * 0.9)) * 14 });
    }
    assert.equal(
      api.detectAndApplyScribbleToErase({ id: 'st_cursive_m', tool: 'pen', size: 4, points: cursivePts }, scribTestPage),
      false,
      'Une écriture cursive "mmmm" à côté d’autres traits ne doit jamais déclencher le griffonnage'
    );
    assert.equal(scribTestPage.strokes.length, 3, 'Aucun trait ne doit être effacé par une écriture cursive');

    // 2) Vrai griffonnage va-et-vient (→ ← → ←) directement sur st_typo : efface UNIQUEMENT st_typo, garde st_neighbor, st_diag_nearby et sh_outer_box !
    const realScribblePts = [];
    const passes = [
      [296, 294, 364, 296],
      [364, 296, 296, 300],
      [296, 300, 364, 303],
      [364, 303, 296, 306],
      [296, 306, 362, 308]
    ];
    for (const [x1, y1, x2, y2] of passes) {
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        realScribblePts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
      }
    }
    assert.equal(
      api.detectAndApplyScribbleToErase({ id: 'st_real_scrib', tool: 'pen', size: 4, points: realScribblePts }, scribTestPage),
      true,
      'Un vrai griffonnage va-et-vient sur un mot doit effacer le mot ciblé'
    );
    assert.equal(
      scribTestPage.strokes.map((s) => s.id).join(','),
      'st_neighbor,st_diag_nearby',
      'Seul st_typo doit être effacé : les mots/traits voisins doivent rester intacts'
    );
    assert.equal(scribTestPage.shapes.length, 1, 'Le cadre englobant sh_outer_box ne doit PAS être effacé lorsqu’on griffonne à l’intérieur');

    // Outil Formes principal (GoodNotes ShapeTool : forceSnap garanti — tout tracé devient une forme géométrique propre)
    st.tool = 'shape';
    st.shapeType = 'auto';
    const strokesBeforeShapes = pg.strokes.length;
    const shapesBeforeShapes = pg.shapes.length;
    const drawShapeGesture = (pid, coords) => {
      api.handlePointerDown({ pointerId: pid, pointerType: 'pen', button: 0, buttons: 1, clientX: coords[0][0], clientY: coords[0][1], pressure: 0.5, timeStamp: 2000, preventDefault() {} });
      for (let i = 1; i < coords.length; i++) {
        api.handlePointerMove({ pointerId: pid, pointerType: 'pen', button: 0, buttons: 1, clientX: coords[i][0], clientY: coords[i][1], pressure: 0.5, timeStamp: 2000 + i * 15, getCoalescedEvents: () => [], preventDefault() {} });
      }
      const last = coords[coords.length - 1];
      api.handlePointerUpOrCancel({ pointerId: pid, pointerType: 'pen', button: 0, buttons: 0, clientX: last[0], clientY: last[1], pressure: 0, timeStamp: 2000 + coords.length * 15, preventDefault() {} });
      return pg.shapes[pg.shapes.length - 1];
    };
    // 1) Ligne rapide (2 points) -> doit forcément devenir 'line'
    const shFastLine = drawShapeGesture(920, [[120, 120], [260, 123]]);
    assert.equal(shFastLine.type, 'line', 'Un tracé rapide de 2 points en outil Formes doit forcément devenir une ligne');
    // 2) Forme en L ouverte -> doit devenir 'polyline'
    const shElbow = drawShapeGesture(921, [[120, 200], [122, 260], [121, 310], [180, 312], [250, 309]]);
    assert.equal(shElbow.type, 'polyline', 'Un tracé en L ouvert en outil Formes doit devenir une polyligne / angle');
    // 3) Arc courbe lisse ouvert -> doit devenir 'arc'
    const arcPts = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI + (i / 14) * Math.PI * 0.82;
      arcPts.push([380 + Math.cos(a) * 65, 240 + Math.sin(a) * 65]);
    }
    const shArc = drawShapeGesture(922, arcPts);
    assert.equal(shArc.type, 'arc', 'Une courbe ouverte lisse en outil Formes doit devenir un arc cubique lisse');
    // 4) Losange fermé -> doit devenir 'diamond'
    const shDiamond = drawShapeGesture(923, [[480, 160], [510, 190], [540, 220], [510, 250], [480, 280], [450, 250], [420, 220], [450, 190], [480, 162]]);
    assert.equal(shDiamond.type, 'diamond', 'Un losange fermé en outil Formes doit être reconnu en diamond');
    // 5) Pentagone fermé -> doit devenir 'polygon' (5 sommets)
    const pentPts = [];
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      const nextA = -Math.PI / 2 + ((i + 1) / 5) * Math.PI * 2;
      pentPts.push([640 + Math.cos(a) * 60, 220 + Math.sin(a) * 60]);
      if (i < 5) {
        pentPts.push([
          640 + (Math.cos(a) + Math.cos(nextA)) * 30,
          220 + (Math.sin(a) + Math.sin(nextA)) * 30
        ]);
      }
    }
    const shPent = drawShapeGesture(924, pentPts);
    assert.equal(shPent.type, 'polygon', 'Un pentagone fermé en outil Formes doit être reconnu en polygon');
    assert.equal(pg.strokes.length, strokesBeforeShapes, 'L’outil Formes principal ne doit jamais laisser de trait brut non converti');
    assert.equal(pg.shapes.length, shapesBeforeShapes + 5, 'Les 5 gestes en outil Formes doivent tous avoir produit une forme géométrique');

    // Connexion magnétique automatique des traits vers un cercle (GoodNotes ConnectionPoints / intersectionPoint)
    const circlePts = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      circlePts.push([420 + Math.cos(a) * 50, 420 + Math.sin(a) * 50]);
    }
    const shCircle = drawShapeGesture(925, circlePts);
    assert.equal(shCircle.type, 'ellipse', 'Le cercle tracé en outil Formes doit être reconnu comme ellipse/cercle');
    const cCx = (shCircle.x1 + shCircle.x2) * 0.5;
    const cCy = (shCircle.y1 + shCircle.y2) * 0.5;
    const cRx = Math.abs(shCircle.x2 - shCircle.x1) * 0.5;
    const cRy = Math.abs(shCircle.y2 - shCircle.y1) * 0.5;
    // Trait tracé vers le cercle (s'arrêtant un peu avant le bord gauche -> doit s'aimanter exactement au bord)
    const toScreen = (wx, wy) => [wx * st.zoom + st.panX, wy * st.zoom + st.panY];
    const shLineShort = drawShapeGesture(926, [toScreen(cCx - cRx - 95, cCy), toScreen(cCx - cRx - 14, cCy)]);
    assert.equal(shLineShort.type, 'line', 'Le trait vers le cercle doit devenir une ligne');
    assert.ok(shLineShort.endConnection && shLineShort.endConnection.shapeId === shCircle.id, 'Le trait arrêté près du cercle doit se connecter automatiquement au cercle');
    const normEndShort = Math.hypot((shLineShort.x2 - cCx) / cRx, (shLineShort.y2 - cCy) / cRy);
    assert.ok(Math.abs(normEndShort - 1) < 0.05, 'L’extrémité du trait doit reposer exactement sur le bord du cercle');
    // Trait tracé en diagonale entrant légèrement à l'intérieur du cercle -> doit être coupé net sur le bord (intersectionPoint)
    const shLineOvershoot = drawShapeGesture(927, [toScreen(cCx + cRx + 80, cCy - 80), toScreen(cCx + 10, cCy - 10)]);
    assert.ok(shLineOvershoot.endConnection && shLineOvershoot.endConnection.shapeId === shCircle.id, 'Un trait entrant légèrement dans le cercle doit se connecter au bord du cercle');
    const normEndOver = Math.hypot((shLineOvershoot.x2 - cCx) / cRx, (shLineOvershoot.y2 - cCy) / cRy);
    assert.ok(Math.abs(normEndOver - 1) < 0.05, 'L’extrémité du trait entrant doit être rognée exactement sur le bord du cercle');
    // Connecteur coudé direct (#gnShapeSubBar elbowArrow) vers le cercle
    st.shapeType = 'elbowArrow';
    const [elStartX, elStartY] = toScreen(cCx, cCy - cRy - 80);
    const [elEndX, elEndY] = toScreen(cCx + 3, cCy - cRy - 10);
    api.handlePointerDown({ pointerId: 928, pointerType: 'pen', button: 0, buttons: 1, clientX: elStartX, clientY: elStartY, pressure: 0.5, preventDefault() {} });
    api.handlePointerMove({ pointerId: 928, pointerType: 'pen', button: 0, buttons: 1, clientX: elEndX, clientY: elEndY, pressure: 0.5, getCoalescedEvents: () => [], preventDefault() {} });
    api.handlePointerUpOrCancel({ pointerId: 928, pointerType: 'pen', button: 0, buttons: 0, clientX: elEndX, clientY: elEndY, pressure: 0, preventDefault() {} });
    const shElbowConn = pg.shapes[pg.shapes.length - 1];
    assert.equal(shElbowConn.type, 'elbowArrow', 'Le connecteur coudé doit être créé');
    assert.ok(shElbowConn.endConnection && shElbowConn.endConnection.shapeId === shCircle.id, 'Le connecteur coudé doit se connecter au port nord du cercle');
    st.shapeType = 'auto';

    // Clic sur une forme dessinée -> sélection, redimensionnement par poignée (avec suivi des traits connectés), conversion de type, remplissage/épaisseur/couleur
    const [tapCx, tapCy] = toScreen(cCx, cCy);
    api.handlePointerDown({ pointerId: 929, pointerType: 'pen', button: 0, buttons: 1, clientX: tapCx, clientY: tapCy, pressure: 0.5, preventDefault() {} });
    api.handlePointerUpOrCancel({ pointerId: 929, pointerType: 'pen', button: 0, buttons: 0, clientX: tapCx + 1, clientY: tapCy + 1, pressure: 0, preventDefault() {} });
    assert.equal(st.selectedShapeId, shCircle.id, 'Cliquer sur le cercle en outil Formes doit le sélectionner pour édition');
    const shapeEditBar = sandbox.document.getElementById('shapeEditFloatingBar');
    assert.ok(shapeEditBar && !shapeEditBar.classList.contains('hidden'), 'La barre flottante #shapeEditFloatingBar doit apparaître sur sélection d’une forme');

    // Redimensionnement via la poignée Est (+40 px) -> le cercle s'élargit et le trait connecté suit automatiquement
    const prevCircleRight = Math.max(shCircle.x1, shCircle.x2);
    const prevLineOverX2 = shLineOvershoot.x2;
    const [eastX, eastY] = toScreen(prevCircleRight, cCy);
    const [eastDragX, eastDragY] = toScreen(prevCircleRight + 40, cCy);
    api.handlePointerDown({ pointerId: 930, pointerType: 'pen', button: 0, buttons: 1, clientX: eastX, clientY: eastY, pressure: 0.5, preventDefault() {} });
    api.handlePointerMove({ pointerId: 930, pointerType: 'pen', button: 0, buttons: 1, clientX: eastDragX, clientY: eastDragY, pressure: 0.5, getCoalescedEvents: () => [], preventDefault() {} });
    api.handlePointerUpOrCancel({ pointerId: 930, pointerType: 'pen', button: 0, buttons: 0, clientX: eastDragX, clientY: eastDragY, pressure: 0, preventDefault() {} });
    assert.ok(Math.max(shCircle.x1, shCircle.x2) > prevCircleRight + 30, 'Glisser la poignée Est doit élargir la forme sélectionnée');
    assert.ok(shLineOvershoot.x2 > prevLineOverX2 + 10, 'Le trait connecté au cercle doit suivre automatiquement le redimensionnement');

    // Changement de type (Cercle -> Rectangle), remplissage, épaisseur et duplication via la barre flottante
    assert.equal(api.convertSelectedShapeType('rect'), true, 'La conversion du cercle sélectionné en rectangle doit réussir');
    assert.equal(shCircle.type, 'rect', 'convertSelectedShapeType("rect") doit convertir le cercle en rectangle');
    const fillEditBtn = sandbox.document.getElementById('btnShapeEditFill');
    fillEditBtn.dispatchEvent({ type: 'click', target: fillEditBtn, stopPropagation() {} });
    assert.equal(shCircle.filled, true, 'Le bouton Remplissage doit activer le remplissage de la forme');
    const prevShapeSz = shCircle.size;
    const thickEditBtn = sandbox.document.getElementById('btnShapeEditThick');
    thickEditBtn.dispatchEvent({ type: 'click', target: thickEditBtn, stopPropagation() {} });
    assert.ok(shCircle.size > prevShapeSz, 'Le bouton + doit augmenter l’épaisseur de la forme');
    const customColInput = sandbox.document.getElementById('shapeEditCustomColor');
    customColInput.value = '#dc2626';
    customColInput.dispatchEvent({ type: 'input', target: customColInput, stopPropagation() {} });
    assert.equal(shCircle.color, '#dc2626', 'Le sélecteur couleur de la barre d’édition doit recolorer la forme');
    api.clearSelectedShape(true);
    assert.equal(st.selectedShapeId, null, 'clearSelectedShape doit désélectionner proprement la forme');

    // Gomme mode "segment" + "Surligneur seul" (eraserHighlighterOnly)
    st.eraserMode = 'segment';
    st.eraserHighlighterOnly = true;
    const penStrokesBeforeHlErase = pg.strokes.filter((s) => s.tool !== 'highlighter').length;
    const midHlX = (autoStraightHl.points[0].x + autoStraightHl.points[1].x) * 0.5;
    const midHlY = autoStraightHl.points[0].y;
    api.applyEraserAtPoint(midHlX, midHlY);
    const hlStrokesAfterSplit = pg.strokes.filter((s) => s.tool === 'highlighter');
    assert.equal(hlStrokesAfterSplit.length, 2, 'La gomme mode segment au milieu d’un trait de surligneur doit le scinder en 2 sous-traits');
    // Tenter d'effacer un trait de stylo avec eraserHighlighterOnly = true ne doit PAS supprimer le trait de stylo
    const remainingPenPt = pg.strokes.find((s) => s.tool !== 'highlighter').points[0];
    api.applyEraserAtPoint(remainingPenPt.x, remainingPenPt.y);
    assert.equal(pg.strokes.filter((s) => s.tool !== 'highlighter').length, penStrokesBeforeHlErase, 'eraserHighlighterOnly=true doit préserver les traits de stylo');
    st.eraserHighlighterOnly = false;
    st.eraserMode = 'stroke';

    // Gomme avec retour automatique au stylo (eraserAutoDeselect)
    st.previousWritingTool = 'pen';
    st.tool = 'eraser';
    st.eraserAutoDeselect = true;
    api.handlePointerDown({ pointerId: 911, pointerType: 'pen', button: 0, buttons: 1, clientX: 50, clientY: 50, pressure: 0.5, preventDefault() {} });
    api.handlePointerUpOrCancel({ pointerId: 911, pointerType: 'pen', button: 0, buttons: 0, clientX: 55, clientY: 55, pressure: 0, preventDefault() {} });
    assert.equal(st.tool, 'pen', 'eraserAutoDeselect=true doit ramener automatiquement à l’outil d’écriture après avoir gommé');
    st.eraserAutoDeselect = false;

    // Lasso rectangulaire (lassoMode = 'rect')
    st.tool = 'lasso';
    st.lassoMode = 'rect';
    api.handlePointerDown({ pointerId: 912, pointerType: 'pen', button: 0, buttons: 1, clientX: 40, clientY: 40, pressure: 0.5, preventDefault() {} });
    api.handlePointerMove({ pointerId: 912, pointerType: 'pen', button: 0, buttons: 1, clientX: 420, clientY: 420, pressure: 0.5, getCoalescedEvents: () => [], preventDefault() {} });
    assert.equal(st.lassoPolygon.length, 4, 'En mode lasso rectangulaire (rect), lassoPolygon doit former un rectangle à 4 sommets');
    api.handlePointerUpOrCancel({ pointerId: 912, pointerType: 'pen', button: 0, buttons: 0, clientX: 420, clientY: 420, pressure: 0, preventDefault() {} });
    st.lassoMode = 'freehand';
    st.tool = 'pen';

    await api.flushPendingPageSaves();
    await api.deleteNotebookById(nb.id);
    return `100 raccourcis Ctrl+Z / Ctrl+Y + One-Euro + Tirets + Surligneur auto-straighten + Gomme 3 modes/Surligneur seul + Lasso rect vérifiés.`;
  });

  // ------------------------------------------------------------------------
  // TEST 4 : Scénarios limites d'importation PDF (vide, corrompu, tronqué, > 100 pages)
  // ------------------------------------------------------------------------
  await runStep('Test 4 : Gestion propre des PDF vides (0 octet), corrompus, tronqués et > 100 pages', async () => {
    const st = api.getState();
    const nbCountBefore = st.notebooks.length;
    const banner = sandbox.document.getElementById('pdfImportErrorBanner');

    // 4A. PDF vide (0 octet)
    let emptyErr = null;
    try {
      await api.importPdfFromBuffer(new Uint8Array(0), 'Vide.pdf', 'new-notebook');
    } catch (err) {
      emptyErr = err.message;
    }
    const bannerVisibleAfterEmpty = !banner.classList.contains('hidden');

    // 4B. Fichier non-PDF / binaire aléatoire
    let invalidHeaderErr = null;
    try {
      const fakeBytes = new TextEncoder().encode('Ceci est un fichier texte renommé en .pdf');
      await api.importPdfFromBuffer(fakeBytes, 'FauxFichier.pdf', 'new-notebook');
    } catch (err) {
      invalidHeaderErr = err.message;
    }

    // 4C. Fichier avec en-tête %PDF-1.7 mais structure interne corrompue
    let corruptedBodyErr = null;
    try {
      const brokenPdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 999 0 R >>\nendobj\n%%EOF');
      await api.importPdfFromBuffer(brokenPdf, 'Corrompu.pdf', 'new-notebook');
    } catch (err) {
      corruptedBodyErr = err.message;
    }

    // 4D. PDF de plus de 100 pages (105 pages générées via pdf-lib)
    let tooManyPagesErr = null;
    const bigPdf = await sandbox.PDFLib.PDFDocument.create();
    for (let i = 0; i < 105; i++) {
      bigPdf.addPage();
    }
    const bigPdfBytes = await bigPdf.save();
    try {
      await api.importPdfFromBuffer(bigPdfBytes, 'Cours-105-Pages.pdf', 'new-notebook');
    } catch (err) {
      tooManyPagesErr = err.message;
    }
    const bannerTextAfter105 = banner.textContent;
    const nbCountAfter = st.notebooks.length;

    assert.ok(emptyErr && /vide/i.test(emptyErr), `Attendu erreur PDF vide, reçu: ${emptyErr}`);
    assert.equal(bannerVisibleAfterEmpty, true, 'La bannière d’erreur #pdfImportErrorBanner doit être visible à l’écran');
    assert.ok(invalidHeaderErr && /(%PDF-|valide|corrompu)/i.test(invalidHeaderErr), `Attendu erreur en-tête %PDF-, reçu: ${invalidHeaderErr}`);
    assert.ok(corruptedBodyErr && /corrompu|illisible/i.test(corruptedBodyErr), `Attendu erreur structure PDF corrompue, reçu: ${corruptedBodyErr}`);
    assert.ok(tooManyPagesErr && /105 pages/i.test(tooManyPagesErr) && /100 pages/i.test(tooManyPagesErr), `Attendu erreur limite 100 pages, reçu: ${tooManyPagesErr}`);
    assert.ok(bannerTextAfter105.includes('100 pages'), 'La bannière UI doit expliquer clairement la limite de 100 pages');
    assert.equal(nbCountAfter, nbCountBefore, 'Aucun cahier fantôme ne doit être créé lorsqu’un import PDF échoue');

    return `4 cas limites rejetés proprement avec bannière UI explicite (0 octet, sans en-tête, corrompu, 105 pages > 100).`;
  });

  // ------------------------------------------------------------------------
  // TEST 5 : Gestion de la mémoire RAM (éviction des rendus PDF & fermeture de cahier)
  // ------------------------------------------------------------------------
  await runStep('Test 5 : Gestion de la mémoire RAM (éviction des canvas PDF hors-écran et destruction PDFDocumentProxy)', async () => {
    const st = api.getState();
    const defaultNbId = st.notebooks[0].id;

    // Génère un PDF de 5 pages
    const doc5 = await sandbox.PDFLib.PDFDocument.create();
    const font = await doc5.embedFont(sandbox.PDFLib.StandardFonts.HelveticaBold);
    for (let i = 1; i <= 5; i++) {
      const p = doc5.addPage();
      p.drawText(`Page de test memoire RAM #${i}`, { x: 50, y: 750, size: 18, font });
    }
    const pdf5Bytes = await doc5.save();

    const { notebook: pdfNb, pages: pdfPages, pdfId } = await api.importPdfFromBuffer(pdf5Bytes, 'Audit-Memoire-5p.pdf', 'new-notebook');
    const statsAfterImport = api.getPdfCacheStats();

    // Parcourt successivement les pages 1 -> 2 -> 3 -> 4 -> 5
    let maxCachedPagesDuringNavigation = statsAfterImport.renderedPagesCount;
    for (const pg of pdfPages) {
      api.selectPage(pg.id);
      const entry = api.ensurePdfPageRendered(pg);
      if (entry && entry.renderingPromise) {
        await entry.renderingPromise;
      }
      const stNav = api.getPdfCacheStats();
      if (stNav.renderedPagesCount > maxCachedPagesDuringNavigation) {
        maxCachedPagesDuringNavigation = stNav.renderedPagesCount;
      }
    }

    // Change de cahier (ferme le cahier PDF pour revenir sur le cahier standard)
    api.selectNotebook(defaultNbId);
    await new Promise((r) => setTimeout(r, 40));
    const statsAfterLeavingPdfNotebook = api.getPdfCacheStats();

    // Vérifie que le binaire PDF est toujours dans IndexedDB même après libération de la RAM
    const pdfStillInIndexedDb = Boolean(await api.db.getPdfBinary(pdfId));

    // Supprime le cahier PDF : doit supprimer le binaire PDF d'IndexedDB et de la RAM
    await api.deleteNotebookById(pdfNb.id);
    const pdfInIndexedDbAfterDelete = await api.db.getPdfBinary(pdfId);

    assert.ok(statsAfterImport.renderedPagesCount <= 2, `Après import d'un PDF de 5 pages, au plus 2 canvas (p.1 + p.2) doivent être en cache (actuel: ${statsAfterImport.renderedPagesCount})`);
    assert.ok(maxCachedPagesDuringNavigation <= 3, `Pendant la navigation sur 5 pages, le cache ne doit jamais dépasser 3 pages {k-1, k, k+1} (max observé: ${maxCachedPagesDuringNavigation})`);
    assert.equal(statsAfterLeavingPdfNotebook.renderedPagesCount, 0, 'Quitter un cahier PDF doit vider tous les canvas PDF en cache (0 canvas en RAM)');
    assert.equal(statsAfterLeavingPdfNotebook.totalPixels, 0, 'Le nombre de pixels PDF en cache RAM doit tomber à 0 après fermeture du cahier');
    assert.equal(statsAfterLeavingPdfNotebook.loadedDocsCount, 0, 'L’instance PDFDocumentProxy doit être détruite quand on quitte le cahier PDF');
    assert.equal(pdfStillInIndexedDb, true, 'Le PDF binaire doit rester sauvegardé dans IndexedDB quand on change simplement de cahier');
    assert.equal(pdfInIndexedDbAfterDelete, null, 'La suppression du cahier PDF doit supprimer le binaire PDF d’IndexedDB');

    return `Cache borné à ${maxCachedPagesDuringNavigation} page(s) max {k-1, k, k+1} pendant la navigation, puis 0 pixel / 0 doc en RAM à la fermeture du cahier.`;
  });

  // ------------------------------------------------------------------------
  // TEST 6 : Exportation PDF vectorielle annotée avec pdf-lib
  // ------------------------------------------------------------------------
  await runStep('Test 6 : Exportation PDF annoté (pdf-lib) avec fond PDF + traits stylet, surligneur, formes et texte', async () => {
    const sampleBytes = await api.generateSampleCoursePdfBytes();
    const { notebook: pdfNb, pages: pdfPages } = await api.importPdfFromBuffer(sampleBytes, 'Cours-Export-Test.pdf', 'new-notebook');

    const p1 = pdfPages[0];
    api.selectPage(p1.id);

    p1.strokes.push({
      id: 'st_test_pen',
      tool: 'pen',
      color: '#1d4ed8',
      size: 5,
      smoothing: 0.5,
      pressureMode: 'dynamic',
      points: [
        { x: 100, y: 240, pressure: 0.5 },
        { x: 180, y: 255, pressure: 0.8 },
        { x: 260, y: 245, pressure: 0.6 }
      ]
    });
    p1.strokes.push({
      id: 'st_test_hl',
      tool: 'highlighter',
      color: '#fde047',
      size: 22,
      smoothing: 0.5,
      pressureMode: 'uniform',
      points: [
        { x: 80, y: 180, pressure: 0.5 },
        { x: 320, y: 180, pressure: 0.5 }
      ]
    });
    p1.shapes.push({
      id: 'sh_test_arrow',
      type: 'arrow',
      x1: 120,
      y1: 320,
      x2: 340,
      y2: 380,
      color: '#dc2626',
      size: 4,
      filled: false
    });
    p1.texts.push({
      id: 'tx_test_latex',
      x: 110,
      y: 420,
      width: 280,
      text: 'Solution : $y(x) = 3 e^{x^2}$',
      color: '#0f172a',
      fontSize: 16,
      style: 'latex',
      isLatex: true
    });

    await api.flushPendingPageSaves();

    const exportedBytes = await api.exportAnnotatedPdfWithPdfLib('notebook', false);
    const header = new TextDecoder().decode(exportedBytes.slice(0, 8));
    const loadedOut = await sandbox.PDFLib.PDFDocument.load(exportedBytes);
    const outPageCount = loadedOut.getPageCount();

    await api.deleteNotebookById(pdfNb.id);
    await api.cleanupAppResources();

    assert.ok(header.startsWith('%PDF-'), `L'export doit produire un fichier PDF valide (%PDF-), reçu: ${header}`);
    assert.equal(outPageCount, 2, 'Le PDF exporté doit conserver les 2 pages du document');
    assert.ok(exportedBytes.byteLength > sampleBytes.byteLength, `Le PDF annoté (${exportedBytes.byteLength} o) doit être plus riche que le PDF vierge (${sampleBytes.byteLength} o)`);

    return `PDF annoté exporté et revalidé via pdf-lib (${outPageCount} pages, ${exportedBytes.byteLength} octets, en-tête ${header.trim()}).`;
  });

  // ------------------------------------------------------------------------
  // TEST 7 : Rendu Double Canvas (60/120 FPS) & Sauvegarde différée (Debounce 500 ms)
  // ------------------------------------------------------------------------
  await runStep('Test 7 : Rendu Double Canvas 60/120 FPS (trait long 500 pts O(1) incrémental + pan cache bitmap + Debounce 500 ms)', async () => {
    const page = api.getActivePage();
    assert.ok(page, 'Une page active doit exister');
    assert.equal(api.SAVE_DEBOUNCE_DELAY_MS, 500, 'Le délai de debounce IndexedDB doit être exactement de 500 ms');

    // Ajoute 120 traits de texte manuscrit sur la page pour simuler une page bien remplie
    for (let s = 0; s < 120; s++) {
      const baseX = 60 + (s % 12) * 65;
      const baseY = 120 + Math.floor(s / 12) * 52;
      const pts = [];
      for (let k = 0; k < 18; k++) {
        pts.push({
          x: baseX + k * 2.8,
          y: baseY + Math.sin(k * 0.6) * 6,
          pressure: 0.45 + (k % 5) * 0.08
        });
      }
      page.strokes.push({
        id: `st_dense_${s}`,
        tool: 'pen',
        color: '#1e293b',
        size: 3.5,
        smoothing: 0.5,
        pressureMode: 'dynamic',
        points: pts
      });
    }
    api.invalidateStaticInkCache();
    api.renderScene();

    // Benchmark du déplacement (Pan) sur la page remplie de 120 traits (via staticInkCache)
    const st = api.getState();
    const panStart = performance.now();
    const panFrames = 30;
    for (let f = 1; f <= panFrames; f++) {
      st.panX += 6;
      st.panY -= 4;
      api.renderScene();
    }
    const avgPanFrameMs = (performance.now() - panStart) / panFrames;

    // Attend la stabilisation d'éventuels rendus précédents
    await new Promise((r) => setTimeout(r, 25));
    const perfBefore = api.getRenderPerfStats();
    const strokesBefore = page.strokes.length;

    // 1. pointerdown stylet pour un très long trait continu de 500 mouvements
    api.handlePointerDown({
      pointerId: 501,
      pointerType: 'pen',
      button: 0,
      buttons: 1,
      pressure: 0.55,
      clientX: 80,
      clientY: 160,
      timeStamp: 1000,
      cancelable: true,
      preventDefault: () => {}
    });

    // 2. 500 mouvements rapides du stylet (trait très long continu)
    let first100Ms = 0;
    let last100Ms = 0;
    for (let i = 1; i <= 500; i++) {
      const t0 = performance.now();
      api.handlePointerMove({
        pointerId: 501,
        pointerType: 'pen',
        button: -1,
        buttons: 1,
        pressure: 0.45 + Math.sin(i * 0.1) * 0.25,
        clientX: 80 + i * 2.2,
        clientY: 160 + Math.sin(i * 0.25) * 24,
        timeStamp: 1000 + i * 4,
        cancelable: true,
        getPredictedEvents: () => [
          { clientX: 80 + (i + 1) * 2.2, clientY: 160 + Math.sin((i + 1) * 0.25) * 24, pressure: 0.5 }
        ],
        preventDefault: () => {}
      });
      const dt = performance.now() - t0;
      if (i <= 100) first100Ms += dt;
      if (i > 400) last100Ms += dt;
    }

    const avgFirst100MoveMs = first100Ms / 100;
    const avgLast100MoveMs = last100Ms / 100;
    assert.equal(st.predictedPoints.length, 1, 'getPredictedEvents doit alimenter state.predictedPoints pendant le tracé');

    const perfDuringMove = api.getRenderPerfStats();
    const staticRedrawsDuringMove = perfDuringMove.staticRenderCount - perfBefore.staticRenderCount;
    const activeRedrawsDuringMove = perfDuringMove.activeRenderCount - perfBefore.activeRenderCount;

    // 3. pointerup : lève le stylet -> fusionne le trait sur le canvas statique et planifie la sauvegarde à +500 ms
    api.handlePointerUpOrCancel({
      pointerId: 501,
      pointerType: 'pen',
      button: 0,
      buttons: 0,
      pressure: 0,
      clientX: 80 + 500 * 2.2,
      clientY: 170,
      timeStamp: 3100,
      cancelable: true,
      preventDefault: () => {}
    });

    const perfAfterUp = api.getRenderPerfStats();
    const staticRedrawsOnUp = perfAfterUp.staticRenderCount - perfDuringMove.staticRenderCount;
    const mergedCountDelta = perfAfterUp.mergedStrokesCount - perfBefore.mergedStrokesCount;

    // Vérifie qu'à t + 120 ms la sauvegarde est toujours en attente (Debounce 500 ms non écoulé -> Main Thread libre)
    await new Promise((r) => setTimeout(r, 120));
    const pendingAt120ms = api.hasPendingPageSave(page.id);

    // Attend la fin du délai de 500 ms (total ~580 ms) pour vérifier l'écriture automatique dans IndexedDB
    await new Promise((r) => setTimeout(r, 460));
    const pendingAfter580ms = api.hasPendingPageSave(page.id);
    const savedInDb = (await api.db.getPagesForNotebook(page.notebookId)).find((p) => p.id === page.id);

    assert.equal(staticRedrawsDuringMove, 0, `Le canvas statique ne doit JAMAIS être redessiné pendant pointermove (observé: ${staticRedrawsDuringMove})`);
    assert.ok(activeRedrawsDuringMove >= 450, `Le canvas actif léger (#activeInkCanvas) doit avoir rendu chaque mouvement significatif du stylet (observé: ${activeRedrawsDuringMove})`);
    assert.ok(avgLast100MoveMs < 1.0, `La fin d'un long trait de 500 points doit rester ultra-rapide O(1) (< 1 ms/move, observé: ${avgLast100MoveMs.toFixed(3)} ms)`);
    assert.ok(avgPanFrameMs < 2.0, `Le déplacement (Pan) sur une page de 120 traits doit être instantané via cache bitmap (< 2 ms/frame, observé: ${avgPanFrameMs.toFixed(3)} ms)`);
    assert.equal(staticRedrawsOnUp, 0, `Le lever du stylet doit fusionner le trait sans redessiner toute la scène statique (observé: ${staticRedrawsOnUp})`);
    assert.equal(mergedCountDelta, 1, 'Le trait terminé doit avoir été fusionné une fois sur #inkCanvas');
    assert.equal(pendingAt120ms, true, 'La sauvegarde IndexedDB doit être différée (en attente à +120 ms)');
    assert.equal(pendingAfter580ms, false, 'La sauvegarde IndexedDB doit être exécutée automatiquement après 500 ms');
    assert.equal(savedInDb.strokes.length, strokesBefore + 1, 'Le trait fusionné doit être persisté dans IndexedDB après les 500 ms');

    return `Long trait 500 pts O(1) (début=${avgFirst100MoveMs.toFixed(3)}ms, fin=${avgLast100MoveMs.toFixed(3)}ms/move), Pan 120 traits=${avgPanFrameMs.toFixed(3)}ms/frame, Debounce 500 ms OK.`;
  });

  // ------------------------------------------------------------------------
  // TEST 8 : Chargement paresseux (Lazy Loading) d'un cahier de 50 pages PDF
  // ------------------------------------------------------------------------
  await runStep('Test 8 : Chargement paresseux (Lazy Loading) d’un PDF de 50 pages (uniquement page affichée k + k-1 et k+1 en RAM)', async () => {
    const doc50 = await sandbox.PDFLib.PDFDocument.create();
    const font = await doc50.embedFont(sandbox.PDFLib.StandardFonts.HelveticaBold);
    for (let i = 1; i <= 50; i++) {
      const p = doc50.addPage();
      p.drawText(`Cours Magistral - Page ${i} / 50`, { x: 50, y: 760, size: 16, font });
    }
    const pdf50Bytes = await doc50.save();

    const { notebook: nb50, pages: pages50 } = await api.importPdfFromBuffer(pdf50Bytes, 'Cours-Long-50-Pages.pdf', 'new-notebook');
    const statsAtOpen = api.getPdfCacheStats();

    // Saute directement à la page 25 (milieu du cahier de 50 pages)
    api.selectPage(pages50[24].id);
    await api.ensureActiveAndAdjacentPdfPagesLoaded(pages50[24]);
    const statsAtPage25 = api.getPdfCacheStats();

    // Saute à la dernière page (page 50)
    api.selectPage(pages50[49].id);
    await api.ensureActiveAndAdjacentPdfPagesLoaded(pages50[49]);
    const statsAtPage50 = api.getPdfCacheStats();

    assert.equal(pages50.length, 50, 'Le cahier doit contenir les 50 pages du PDF');
    assert.deepEqual(Array.from(statsAtOpen.renderedPageNumbers), [1, 2], `À l'ouverture sur la page 1, seules les pages [1, 2] doivent être rendues en mémoire (reçu: [${statsAtOpen.renderedPageNumbers.join(', ')}])`);
    assert.deepEqual(Array.from(statsAtPage25.renderedPageNumbers), [24, 25, 26], `Sur la page 25, seules les pages [24, 25, 26] (k-1, k, k+1) doivent être en mémoire (reçu: [${statsAtPage25.renderedPageNumbers.join(', ')}])`);
    assert.deepEqual(Array.from(statsAtPage50.renderedPageNumbers), [49, 50], `Sur la page 50, seules les pages [49, 50] doivent être en mémoire (reçu: [${statsAtPage50.renderedPageNumbers.join(', ')}])`);

    await api.deleteNotebookById(nb50.id);
    await api.cleanupAppResources();

    return `Cahier de 50 pages PDF : ouverture = pages [${statsAtOpen.renderedPageNumbers.join(', ')}], saut page 25 = pages [${statsAtPage25.renderedPageNumbers.join(', ')}], page 50 = pages [${statsAtPage50.renderedPageNumbers.join(', ')}] en RAM.`;
  });

  // ------------------------------------------------------------------------
  // TEST 9 : Mode hors-ligne de la version navigateur (service worker)
  // ------------------------------------------------------------------------
  await runStep('Test 9 : Mode hors-ligne navigateur (service worker réseau d’abord, cache en secours, jamais sous Tauri/Electron)', async () => {
    // 1. Enregistrement : uniquement dans un navigateur servi en http(s)
    const makeEnv = ({ protocol = 'http:', hostname = 'localhost', sw = true, tauri = false, secure = true, ready = 'complete', reject = false } = {}) => {
      const registered = [];
      const listeners = {};
      const env = {
        navigator: sw ? {
          serviceWorker: {
            register: (url) => {
              registered.push(url);
              return reject ? Promise.reject(new Error('refus simulé')) : Promise.resolve({ scope: '/' });
            }
          }
        } : {},
        location: { protocol, hostname, host: hostname },
        isSecureContext: secure,
        document: { readyState: ready },
        addEventListener: (type, fn) => { listeners[type] = fn; }
      };
      if (tauri) env.__TAURI__ = {};
      return { env, registered, listeners };
    };

    const browser = makeEnv();
    assert.equal(api.registerOfflineServiceWorker(browser.env), true, 'Le navigateur (http://localhost) doit enregistrer le service worker');
    assert.deepEqual(browser.registered, ['./sw.js']);

    const loading = makeEnv({ ready: 'loading' });
    assert.equal(api.registerOfflineServiceWorker(loading.env), true);
    assert.deepEqual(loading.registered, [], 'Pendant le chargement, l’enregistrement doit attendre l’événement load');
    loading.listeners.load();
    assert.deepEqual(loading.registered, ['./sw.js']);

    const https = makeEnv({ protocol: 'https:', hostname: 'notes.example.org' });
    assert.equal(api.registerOfflineServiceWorker(https.env), true);

    const refused = makeEnv({ reject: true });
    assert.equal(api.registerOfflineServiceWorker(refused.env), true, 'Un refus du navigateur ne doit pas lever d’exception');
    await new Promise((r) => setTimeout(r, 0));

    const skipped = {
      'Tauri (global __TAURI__)': makeEnv({ tauri: true }),
      'Tauri (tauri.localhost)': makeEnv({ hostname: 'tauri.localhost' }),
      'Electron (file://)': makeEnv({ protocol: 'file:', hostname: '' }),
      'navigateur sans service worker': makeEnv({ sw: false }),
      'contexte non sécurisé (http sur IP du réseau)': makeEnv({ hostname: '192.168.1.20', secure: false })
    };
    for (const [label, ctx] of Object.entries(skipped)) {
      assert.equal(api.registerOfflineServiceWorker(ctx.env), false, `Pas de service worker attendu pour : ${label}`);
      assert.deepEqual(ctx.registered, [], `Aucun enregistrement attendu pour : ${label}`);
    }
    assert.equal(api.registerOfflineServiceWorker(), false, 'Le bac à sable des tests (tauri.localhost) ne doit rien enregistrer');

    // 2. Comportement de sw.js
    const swEnv = createServiceWorkerSandbox();
    const { network, stores, fetchEvent, dispatchExtendable } = swEnv;
    const readText = async (res) => (res ? res.text() : null);
    network.files.set('/index.html', '<html>InkFlow v1</html>');
    network.files.set('/styles.css', 'body{}');
    network.files.set('/app.js', 'app v1');
    network.files.set('/manifest.json', '{}');
    network.files.set('/assets/inkflow-logo.png', 'png');
    network.files.set('/vendor/pdf.min.js', 'pdf');
    network.files.set('/vendor/pdf.worker.min.js', 'worker');
    // vendor/pdf-lib.min.js volontairement absent : l'installation doit quand même réussir

    stores.set('inkflow-v3', new Map());
    stores.set('autre-app-cache', new Map());

    await dispatchExtendable('install');
    assert.equal(swEnv.sandbox.__skipped, true, 'skipWaiting doit être appelé à l’installation');
    const shellStoreName = Array.from(stores.keys()).find((k) => k.startsWith('inkflow-') && k !== 'inkflow-v3');
    assert.ok(shellStoreName, 'Un cache InkFlow versionné doit être créé');
    const shellStore = stores.get(shellStoreName);
    assert.equal(shellStore.size, 8, `8 fichiers attendus en cache (fichier absent ignoré), reçu ${shellStore.size}`);

    await dispatchExtendable('activate');
    assert.equal(stores.has('inkflow-v3'), false, 'L’ancien cache InkFlow doit être supprimé');
    assert.equal(stores.has('autre-app-cache'), true, 'Les caches d’autres applications ne doivent pas être touchés');
    assert.equal(swEnv.sandbox.__claimed, true);

    // En ligne : la version du serveur prime et rafraîchit le cache
    network.files.set('/app.js', 'app v2');
    const online = await fetchEvent('/app.js');
    assert.equal(await readText(online.response), 'app v2', 'En ligne, la version du serveur doit être servie (pas de version figée)');
    assert.equal(await shellStore.get(`${swEnv.origin}/app.js`).clone().text(), 'app v2', 'Le cache doit être rafraîchi');

    // Hors-ligne : la dernière copie en cache est servie
    network.online = false;
    assert.equal(await readText((await fetchEvent('/app.js')).response), 'app v2');
    assert.equal(await readText((await fetchEvent('/app.js?v=42')).response), 'app v2', 'Les paramètres d’URL ne doivent pas empêcher le secours hors-ligne');
    assert.equal(await readText((await fetchEvent('/', {}, 'navigate')).response), '<html>InkFlow v1</html>');
    assert.equal(await readText((await fetchEvent('/index.html?source=pwa', {}, 'navigate')).response), '<html>InkFlow v1</html>');
    await assert.rejects(fetchEvent('/inconnu.js'), 'Une ressource jamais vue doit échouer normalement hors-ligne');

    // Les variantes d'URL (?v=…) ne multiplient pas les entrées du cache
    network.online = true;
    await fetchEvent('/app.js?v=43');
    await fetchEvent('/app.js?t=99');
    assert.equal(shellStore.size, 8, `Les paramètres d’URL ne doivent pas ajouter d’entrées (reçu ${shellStore.size})`);

    // Réponses partielles (206) jamais mises en cache
    network.files.set('/vendor/gros.bin', 'morceau');
    network.partial.add('/vendor/gros.bin');
    await fetchEvent('/vendor/gros.bin');
    assert.equal(shellStore.has(`${swEnv.origin}/vendor/gros.bin`), false, 'Une réponse 206 ne doit pas être mise en cache');

    // Serveur qui redirige /index.html vers / (comme `serve`, utilisé par `npm start`)
    const redirectEnv = createServiceWorkerSandbox();
    for (const [file, body] of network.files) redirectEnv.network.files.set(file, body);
    redirectEnv.network.redirected.add('/index.html');
    await redirectEnv.dispatchExtendable('install');
    await redirectEnv.dispatchExtendable('activate');
    const redirectStore = Array.from(redirectEnv.stores.values())[0];
    assert.equal(redirectStore.has(`${redirectEnv.origin}/index.html`), false, 'Une réponse redirigée ne doit jamais être mise en cache');
    assert.equal(redirectStore.has(`${redirectEnv.origin}/`), true);
    redirectEnv.network.online = false;
    assert.equal(await readText((await redirectEnv.fetchEvent('/index.html', {}, 'navigate')).response), '<html>InkFlow v1</html>', 'Hors-ligne, /index.html (start_url du manifeste) doit être servi via la copie de /');

    // Requêtes ignorées : POST et autres origines
    assert.equal((await fetchEvent('/api', { method: 'POST', body: 'x' })).intercepted, false, 'Les POST ne doivent pas être interceptés');
    assert.equal((await fetchEvent('https://cdn.example.com/lib.js')).intercepted, false, 'Les autres origines ne doivent pas être interceptées');

    return 'Enregistré en http(s) uniquement (ignoré sous Tauri, Electron, sans support ou hors contexte sûr) ; réseau d’abord, cache rafraîchi, secours hors-ligne (y compris avec paramètres d’URL) vérifiés.';
  });

  await runStep('Test 10 : Bons du banquier signés (ECDSA P-256) : signature vérifiée, falsification refusée, récupération unique', async () => {
    const nodeCrypto = require('node:crypto');
    const bons = require('./bons-banquier.js');
    const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const jwk = publicKey.export({ format: 'jwk' });
    const testKey = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
    const other = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    const now = new Date('2026-11-24T12:00:00');

    const gift = bons.signBon(bons.buildBon({ montant: 500, message: 'Bravo pour ta semaine ! « é » ✓', jours: 30, now, id: '20261124-cadeau01' }), privatePem);
    const loan = bons.signBon(bons.buildBon({ montant: 2000, type: 'pret', jours: 0, now, id: '20261124-pret0001' }), privatePem);
    const tampered = { ...bons.signBon(bons.buildBon({ montant: 10, jours: 30, now, id: '20261124-falsifie' }), privatePem), montant: 10000 };
    const foreign = bons.signBon(bons.buildBon({ montant: 777, jours: 30, now, id: '20261124-etranger' }), other);
    const expired = bons.signBon(bons.buildBon({ montant: 50, jours: 1, now: new Date('2026-10-01T12:00:00'), id: '20261001-expire01' }), privatePem);
    const doc = { version: 1, bons: [gift, loan, tampered, foreign, expired, { id: 'x', montant: 'beaucoup' }, gift] };
    assert.equal(bons.verifyBon(gift, publicKey), true, 'Le script doit vérifier ses propres signatures');
    assert.equal(bons.verifyBon(tampered, publicKey), false, 'Le script doit refuser un montant modifié');

    const savedCrypto = sandbox.crypto;
    const savedStorage = { getItem: sandbox.localStorage.getItem, setItem: sandbox.localStorage.setItem };
    const store = new Map();
    sandbox.crypto = globalThis.crypto;
    sandbox.localStorage.getItem = (k) => (store.has(k) ? store.get(k) : null);
    sandbox.localStorage.setItem = (k, v) => { store.set(k, String(v)); };
    try {
      const valid = await api.verifyDetenteBons(doc, { publicKey: testKey, now: now.getTime() });
      assert.deepEqual([...valid].map((b) => b.id), ['20261124-cadeau01', '20261124-pret0001'],
        'Seuls les bons signés par la bonne clé, intacts et non expirés sont retenus (doublon ignoré)');
      assert.equal(valid[0].message, 'Bravo pour ta semaine ! « é » ✓', 'Le message (UTF-8) fait partie de la signature');
      assert.deepEqual(await api.verifyDetenteBons(doc, { publicKey: testKey, now: new Date('2027-01-30T12:00:00').getTime() }).then((l) => [...l].map((b) => b.id)),
        ['20261124-pret0001'], 'Après sa date, un bon expiré disparaît (le prêt sans expiration reste)');
      assert.deepEqual([...(await api.verifyDetenteBons({ bons: 'rien' }, { publicKey: testKey }))], [], 'Un document mal formé ne doit rien donner');

      const pending = await api.refreshDetenteBons({ document: doc, publicKey: testKey, now: now.getTime() });
      assert.equal(pending.length, 2, 'Deux boutons attendus');
      const before = api.getDetenteWallet();
      assert.equal(api.claimDetenteBon('20261124-cadeau01'), true, 'Le premier clic crédite le bon');
      assert.equal(api.claimDetenteBon('20261124-cadeau01'), false, 'Un second clic ne doit rien créditer');
      assert.equal(api.getDetenteWallet().balance, before.balance + 500);
      assert.equal(api.claimDetenteBon('20261124-pret0001'), true);
      const after = api.getDetenteWallet();
      assert.equal(after.balance, before.balance + 2500);
      assert.equal(after.debt, before.debt + 2000, 'Un prêt ajoute la même somme à la dette');
      assert.equal(api.claimDetenteBon('20261124-falsifie'), false, 'Un bon falsifié ne peut pas être récupéré');
      const again = await api.refreshDetenteBons({ document: doc, publicKey: testKey, now: now.getTime() });
      assert.equal(again.length, 0, 'Une fois récupérés, les bons ne réapparaissent plus (mémorisés sur l’appareil)');
      assert.ok(JSON.parse(store.get('inkflow.detente.bonsRecus.v1')).includes('20261124-cadeau01'));
    } finally {
      sandbox.crypto = savedCrypto;
      sandbox.localStorage.getItem = savedStorage.getItem;
      sandbox.localStorage.setItem = savedStorage.setItem;
    }
    return 'Bons valides acceptés ; montant modifié, autre clé, bon expiré et document mal formé refusés ; crédit unique (cadeau et prêt avec dette).';
  });

  // ------------------------------------------------------------------------
  // TEST 11 : Google Drive (liaison, jetons, sélecteur) et indicateur hors connexion
  // ------------------------------------------------------------------------
  await runStep('Test 11 : Google Drive (PKCE, requêtes du sélecteur, renouvellement du jeton) et refus hors connexion', async () => {
    sandbox.crypto = globalThis.crypto;
    sandbox.URLSearchParams = globalThis.URLSearchParams;

    // PKCE S256 : vecteur de la RFC 7636 (annexe B)
    assert.equal(
      await api.computePkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    );
    const authUrl = new URL(api.buildGdriveAuthUrl({ clientId: 'id-test', redirectUri: 'http://127.0.0.1:5173/oauth-callback.html', codeChallenge: 'abc', stateParam: 'inkflow-s' }));
    assert.equal(authUrl.origin + authUrl.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(authUrl.searchParams.get('response_type'), 'code');
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authUrl.searchParams.get('access_type'), 'offline');
    assert.match(authUrl.searchParams.get('scope'), /drive\.readonly/);

    // Types importables
    assert.equal(api.getDriveImportKind('application/pdf', 'Cours.pdf'), 'pdf');
    assert.equal(api.getDriveImportKind('image/jpeg', 'photo.jpg'), 'image');
    assert.equal(api.getDriveImportKind('image/heic', 'photo.heic'), null, 'HEIC non affichable : non proposé');
    assert.equal(api.getDriveImportKind('application/vnd.google-apps.document', 'Notes'), 'gdoc');
    assert.equal(api.getDriveImportKind('application/json', 'inkflow-backup-2026.plume.json'), 'backup');
    assert.equal(api.getDriveImportKind('application/json', 'config.json'), null);
    assert.equal(api.getDriveImportKind('application/zip', 'a.zip'), null);

    // Requêtes Drive : dossier, recherche échappée, vues, filtres
    const qFolder = api.buildDriveListQuery({ view: 'root', folderId: 'root', filter: 'pdf' });
    assert.match(qFolder, /'root' in parents/);
    assert.match(qFolder, /mimeType = 'application\/pdf'/);
    assert.match(qFolder, /google-apps\.folder/);
    assert.doesNotMatch(qFolder, /image\//);
    const qSearch = api.buildDriveListQuery({ view: 'root', folderId: 'root', filter: 'all', search: "l'été \\ 2" });
    assert.match(qSearch, /name contains 'l\\'été \\\\ 2'/, 'Apostrophe et antislash échappés');
    assert.doesNotMatch(qSearch, /in parents/, 'La recherche porte sur tout le Drive');
    const qRecent = api.buildDriveListQuery({ view: 'recent', filter: 'all' });
    assert.doesNotMatch(qRecent, /google-apps\.folder/, 'Pas de dossiers dans Récents');
    assert.match(api.buildDriveListQuery({ view: 'shared', filter: 'all' }), /sharedWithMe = true/);
    assert.match(api.buildDriveListQuery({ view: 'starred', filter: 'all' }), /starred = true/);
    assert.equal(api.getDriveOrderBy({ view: 'recent' }), 'recency desc');
    assert.equal(api.getDriveOrderBy({ view: 'root', folderId: 'root' }), 'folder,name_natural');

    // Normalisation : raccourcis résolus, filtre appliqué, types inconnus écartés
    const shortcut = api.normalizeDriveItem({ id: 's1', name: 'Raccourci', mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: 'p9', targetMimeType: 'application/pdf' } });
    assert.equal(shortcut.id, 'p9');
    assert.equal(shortcut.kind, 'pdf');
    assert.equal(api.normalizeDriveItem({ id: 'i1', name: 'a.png', mimeType: 'image/png' }, 'pdf'), null);
    assert.equal(api.normalizeDriveItem({ id: 'z', name: 'a.zip', mimeType: 'application/zip' }), null);
    assert.equal(api.normalizeDriveItem({ id: 'f', name: 'Cours', mimeType: 'application/vnd.google-apps.folder' }).isFolder, true);
    assert.equal(api.formatDriveBytes(2516582), '2,4 Mo');

    // Jeton expiré → renouvellement automatique puis requête Drive avec le nouveau jeton
    const calls = [];
    sandbox.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), opts });
      if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.neuf', expires_in: 3599 }) };
      }
      const auth = opts.headers && opts.headers.Authorization;
      if (auth !== 'Bearer ya29.neuf') return { ok: false, status: 401, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ files: [] }) };
    };
    api.clearGdriveSession();
    api.storeGdriveTokens({ access_token: 'ya29.ancien', expires_in: 3600, refresh_token: '1//rafraichir' });
    assert.equal(api.isGdriveLinked(), true);
    const res = await api.gdriveFetch('https://www.googleapis.com/drive/v3/files', {}, 'Test');
    assert.equal(res.ok, true);
    const tokenCall = calls.find((c) => c.url.startsWith('https://oauth2.googleapis.com/token'));
    assert.ok(tokenCall, 'Un 401 doit déclencher le renouvellement du jeton');
    assert.match(String(tokenCall.opts.body), /grant_type=refresh_token/);
    assert.match(String(tokenCall.opts.body), /refresh_token=1%2F%2Frafraichir/);

    // Refresh révoqué (invalid_grant) → compte délié proprement
    sandbox.fetch = async (url) => {
      if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
        return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }) };
      }
      return { ok: false, status: 401, json: async () => ({}) };
    };
    await assert.rejects(() => api.gdriveFetch('https://www.googleapis.com/drive/v3/files', {}, 'Test'), (err) => err.code === 'GDRIVE_AUTH');
    assert.equal(api.isGdriveLinked(), false, 'invalid_grant doit délier le compte');

    // Jeton collé à la main (sans refresh) refusé par Google → compte délié, pas d'état « relié » fantôme
    sandbox.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    api.storeGdriveTokens({ access_token: 'ya29.manuel', expires_in: 3600 });
    await assert.rejects(() => api.gdriveFetch('https://www.googleapis.com/drive/v3/files', {}, 'Test'), (err) => err.code === 'GDRIVE_AUTH');
    assert.equal(api.isGdriveLinked(), false, 'Un jeton temporaire refusé doit délier le compte');

    // Hors connexion : refus explicite sans requête réseau, puis panne réseau détectée
    api.storeGdriveTokens({ access_token: 'ya29.x', expires_in: 3600, refresh_token: '1//r' });
    let networkCalls = 0;
    sandbox.fetch = async () => { networkCalls++; throw new TypeError('Failed to fetch'); };
    api.setNetworkState({ online: false });
    assert.equal(api.isNetworkAvailable(), false);
    assert.equal(api.requireNetwork('Importer depuis Google Drive'), false);
    await assert.rejects(() => api.gdriveFetch('https://www.googleapis.com/drive/v3/files', {}, 'Importer depuis Google Drive'), (err) => err.code === 'NETWORK' && err.handled === true);
    assert.equal(networkCalls, 0, 'Aucune requête ne doit partir hors connexion');
    const pill = sandbox.document.getElementById('netStatusPill');
    assert.equal(pill.classList.contains('hidden'), false, 'L’indicateur doit s’afficher après un refus');
    assert.equal(pill.classList.contains('is-alert'), true);

    api.setNetworkState({ online: true, unreachable: false });
    assert.equal(api.isNetworkAvailable(), true);
    await assert.rejects(() => api.gdriveFetch('https://www.googleapis.com/drive/v3/files', {}, 'Test'), (err) => err.code === 'NETWORK');
    assert.equal(api.isNetworkAvailable(), false, 'Un échec réseau réel doit marquer le réseau injoignable');
    assert.equal(api.isNetworkFailure('Réseau indisponible : délai dépassé'), true, 'Erreurs réseau renvoyées par Rust reconnues');

    api.setNetworkState({ online: true, unreachable: false });
    api.clearGdriveSession();
    delete sandbox.fetch;
    return 'PKCE RFC 7636, URL OAuth, 7 types de fichiers, 6 formes de requête Drive, raccourcis, renouvellement du jeton sur 401, déliaison sur invalid_grant, refus hors connexion sans requête et détection d’une panne réseau vérifiés.';
  });

  console.log('======================================================================');
  console.log(`🎉 TOUS LES TESTS UNITAIRES SONT PASSÉS AVEC SUCCÈS (${results.length}/${results.length})`);
  console.log('======================================================================');
}

runTests().catch((err) => {
  console.error('Échec de la suite de tests unitaires :', err);
  process.exit(1);
});
