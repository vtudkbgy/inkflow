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

  console.log('======================================================================');
  console.log(`🎉 TOUS LES TESTS UNITAIRES SONT PASSÉS AVEC SUCCÈS (${results.length}/${results.length})`);
  console.log('======================================================================');
}

runTests().catch((err) => {
  console.error('Échec de la suite de tests unitaires :', err);
  process.exit(1);
});
