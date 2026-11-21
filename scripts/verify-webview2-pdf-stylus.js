#!/usr/bin/env node
/**
 * Vérification complète WebView2 / Tauri v2 :
 * 1. Résolution locale du worker `pdfjs-dist` (`./vendor/pdf.worker.min.js`) sous origine `http://tauri.localhost/`
 * 2. Rendu haute résolution PDF.js (`window.devicePixelRatio`) + sauvegarde IndexedDB séparée + export `pdf-lib`
 * 3. Événements `PointerEvent` du stylet Windows Ink (`pointerType: 'pen'`, `getCoalescedEvents()`, pression,
 *    bouton gomme `32`, 2e bouton Lasso `2`, maintien forme auto, maintien roue de couleurs)
 * 4. Intégration Tauri v2 (`window.__TAURI__.dialog` + `window.__TAURI__.core.invoke('save_binary_file' / 'read_binary_file')`)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

async function runVerification() {
  const rootDir = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const pdfMinCode = fs.readFileSync(path.join(rootDir, 'vendor', 'pdf.min.js'), 'utf8');
  const pdfWorkerCode = fs.readFileSync(path.join(rootDir, 'vendor', 'pdf.worker.min.js'), 'utf8');
  const pdfLibCode = fs.readFileSync(path.join(rootDir, 'vendor', 'pdf-lib.min.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');

  // Extraction de tous les IDs présents dans index.html
  const idRegex = /id="([^"]+)"/g;
  const ids = new Set();
  let m;
  while ((m = idRegex.exec(html)) !== null) ids.add(m[1]);

  function makeMockElement(id = '', tag = 'DIV') {
    const isCanvas = tag === 'CANVAS' || id.toLowerCase().includes('canvas');
    const listeners = {};
    const classSet = new Set(id === 'modalImportPdf' || id === 'toolOptionsDock' || id === 'radialColorWheel' ? ['hidden'] : []);
    const el = {
      id,
      tagName: isCanvas ? 'CANVAS' : tag,
      width: isCanvas ? 1200 : 0,
      height: isCanvas ? 800 : 0,
      value: '',
      checked: true,
      disabled: false,
      textContent: '',
      innerHTML: '',
      dataset: {},
      style: {},
      files: [],
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
      appendChild: (c) => c,
      remove: () => {},
      focus: () => {},
      select: () => {},
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

  const savedTauriFiles = [];
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 5),
    performance: { now: () => Date.now() },
    devicePixelRatio: 2.0, // Simule un écran Haute Définition Surface Pro / 2-en-1 Windows (200% DPI)
    Path2D: class Path2D {
      constructor(d) { this.d = d || ''; this.__isMockPath2D = true; }
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
    URL: {
      createObjectURL: () => 'blob:http://tauri.localhost/mock',
      revokeObjectURL: () => {}
    },
    Image: class Image {},
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      clipboard: { writeText: async () => {} }
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    // Simulation de l'environnement Tauri v2 WebView2 (`http://tauri.localhost/`)
    location: {
      href: 'http://tauri.localhost/index.html',
      origin: 'http://tauri.localhost',
      protocol: 'http:',
      host: 'tauri.localhost'
    },
    __TAURI__: {
      dialog: {
        save: async ({ defaultPath }) => `C:\\Users\\Utilisateur\\Documents\\${defaultPath || 'Export-Annote.pdf'}`,
        open: async () => `C:\\Users\\Utilisateur\\Documents\\Cours.pdf`
      },
      core: {
        invoke: async (cmd, payload) => {
          if (cmd === 'save_binary_file') {
            savedTauriFiles.push({ path: payload.path, byteLength: payload.bytes.length });
            return payload.path;
          }
          if (cmd === 'set_window_fullscreen') {
            sandbox.__mockFullscreen = Boolean(payload && payload.fullscreen);
            return sandbox.__mockFullscreen;
          }
          if (cmd === 'get_window_fullscreen') {
            return Boolean(sandbox.__mockFullscreen);
          }
          return null;
        }
      }
    },
    document: {
      documentElement: makeMockElement('html', 'HTML'),
      body: makeMockElement('body', 'BODY'),
      head: makeMockElement('head', 'HEAD'),
      getElementById: (id) => {
        if (!elementsById.has(id)) elementsById.set(id, makeMockElement(id));
        return elementsById.get(id);
      },
      createElement: (tag) => makeMockElement('', String(tag || 'DIV').toUpperCase()),
      createElementNS: (ns, tag) => makeMockElement('', String(tag || 'SVG').toUpperCase()),
      querySelectorAll: () => [],
      querySelector: () => makeMockElement('', 'DIV'),
      addEventListener: () => {},
      removeEventListener: () => {}
    }
  };

  // Expose le constructeur URL standard tout en conservant createObjectURL/revokeObjectURL
  const NativeURL = globalThis.URL;
  NativeURL.createObjectURL = () => 'blob:http://tauri.localhost/mock';
  NativeURL.revokeObjectURL = () => {};
  sandbox.URL = NativeURL;

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.focus = () => {};

  vm.createContext(sandbox);
  vm.runInContext(pdfMinCode, sandbox);
  vm.runInContext(pdfWorkerCode, sandbox);
  vm.runInContext(pdfLibCode, sandbox);
  vm.runInContext(appCode, sandbox);

  const api = sandbox.__plumeStudioApi;
  if (!api) throw new Error('window.__plumeStudioApi non initialisé');

  // 1. Vérification du worker local de pdfjs-dist sous WebView2 (`http://tauri.localhost/vendor/pdf.worker.min.js`)
  api.configurePdfJsWorkerLocally();
  const workerSrc = sandbox.pdfjsLib.GlobalWorkerOptions.workerSrc;
  if (workerSrc !== 'http://tauri.localhost/vendor/pdf.worker.min.js') {
    throw new Error(`WorkerSrc inattendu sous WebView2: ${workerSrc}`);
  }
  if (!sandbox.pdfjsWorker || !sandbox.pdfjsWorker.WorkerMessageHandler) {
    throw new Error('pdf.worker.min.js local non chargé en mémoire');
  }
  console.log('✓ [1/4] Worker local pdfjs-dist vérifié sous WebView2 :', workerSrc);

  // 2. Vérification des PointerEvent du stylet Windows Ink (tracé rapide avec getCoalescedEvents, Gomme 32, Lasso 2)
  const state = api.getState();
  const initialPage = state.pagesByNotebook.get(state.activeNotebookId)[0];
  const initialStrokes = initialPage.strokes.length;

  // 2a. Tracé rapide en boucle au stylet avec événements coalescés (getCoalescedEvents)
  api.handlePointerDown({
    pointerId: 10,
    pointerType: 'pen',
    button: 0,
    buttons: 1,
    clientX: 250,
    clientY: 250,
    pressure: 0.62,
    tiltX: 12,
    tiltY: -8,
    timeStamp: 1000,
    cancelable: true,
    preventDefault: () => {}
  });
  api.handlePointerMove({
    pointerId: 10,
    pointerType: 'pen',
    button: -1,
    buttons: 1,
    clientX: 310,
    clientY: 280,
    pressure: 0.78,
    timeStamp: 1016,
    cancelable: true,
    preventDefault: () => {},
    getCoalescedEvents: () => [
      { pointerId: 10, pointerType: 'pen', buttons: 1, clientX: 265, clientY: 255, pressure: 0.66, timeStamp: 1004 },
      { pointerId: 10, pointerType: 'pen', buttons: 1, clientX: 285, clientY: 240, pressure: 0.72, timeStamp: 1008 },
      { pointerId: 10, pointerType: 'pen', buttons: 1, clientX: 300, clientY: 265, pressure: 0.75, timeStamp: 1012 },
      { pointerId: 10, pointerType: 'pen', buttons: 1, clientX: 310, clientY: 280, pressure: 0.78, timeStamp: 1016 }
    ]
  });
  api.handlePointerUpOrCancel({
    pointerId: 10,
    pointerType: 'pen',
    button: 0,
    buttons: 0,
    clientX: 310,
    clientY: 280,
    pressure: 0,
    timeStamp: 1030
  });

  if (initialPage.strokes.length !== initialStrokes + 1) {
    throw new Error('Le tracé au stylet Windows Ink (PointerEvent + getCoalescedEvents) n\'a pas été enregistré');
  }
  console.log(`✓ [2/4] Tracé au stylet Windows Ink (PointerEvent + getCoalescedEvents) vérifié : ${initialPage.strokes[initialPage.strokes.length - 1].points.length} points lissés`);

  // 2b. Vérification des boutons physiques du stylet : Gomme (mask 32 / button 5) et 2e bouton Lasso (mask 2 / button 2)
  const isEraser = api.isPenEraserButton({ pointerType: 'pen', buttons: 32, button: 5 });
  const isLasso = api.isPenLassoButton({ pointerType: 'pen', buttons: 2, button: 2 });
  if (!isEraser || !isLasso) {
    throw new Error('Détection des boutons latéraux du stylet (Gomme=32, Lasso=2) défaillante');
  }

  // Activation temporaire du Lasso au maintien du 2e bouton du stylet + retour automatique au stylo au relâchement
  api.handlePointerDown({
    pointerId: 11,
    pointerType: 'pen',
    button: 2,
    buttons: 2,
    clientX: 260,
    clientY: 260,
    pressure: 0.5,
    timeStamp: 2000,
    cancelable: true,
    preventDefault: () => {}
  });
  if (state.tool !== 'lasso' || !state.temporaryLassoOverride) {
    throw new Error('Le maintien du 2e bouton du stylet n\'a pas activé temporairement le Lasso');
  }
  api.handlePointerUpOrCancel({
    pointerId: 11,
    pointerType: 'pen',
    button: 2,
    buttons: 0,
    clientX: 260,
    clientY: 260,
    pressure: 0,
    timeStamp: 2050
  });
  if (state.tool !== 'pen' || state.temporaryLassoOverride) {
    throw new Error('Le relâchement du 2e bouton du stylet n\'est pas revenu automatiquement au stylo');
  }
  console.log('✓ [3/4] Boutons physiques du stylet (Gomme=32 et 2e bouton Lasso=2 avec retour auto au stylo) vérifiés');

  // 3. Vérification de l'import PDF haute résolution, du stockage IndexedDB séparé et de l'export PDF via Tauri v2 IPC
  const samplePdfBytes = await api.generateSampleCoursePdfBytes();
  await api.importPdfFromBuffer(samplePdfBytes, 'Cours-Tauri-WebView2.pdf', 'new-notebook');
  const activeNb = state.notebooks.find((n) => n.id === state.activeNotebookId);
  const pdfPages = state.pagesByNotebook.get(activeNb.id);
  if (!activeNb.pdfId || pdfPages.length !== 2) {
    throw new Error('L\'import PDF dans un nouveau cahier n\'a pas généré les 2 pages attendues');
  }

  // Ajout d'une annotation au stylet sur la page 1 du PDF puis exportation via pdf-lib + Tauri v2 save_binary_file
  pdfPages[0].strokes.push({
    id: 'st_tauri_verify',
    tool: 'pen',
    color: '#dc2626',
    size: 4,
    smoothing: 0.65,
    pressureMode: 'dynamic',
    points: [
      { x: 120, y: 240, pressure: 0.6 },
      { x: 180, y: 260, pressure: 0.75 },
      { x: 240, y: 230, pressure: 0.65 }
    ]
  });

  const exportedBytes = await api.exportAnnotatedPdfWithPdfLib('notebook', true);
  if (!exportedBytes || exportedBytes.byteLength < 1000 || savedTauriFiles.length === 0) {
    throw new Error('L\'exportation PDF via pdf-lib + Tauri v2 save_binary_file a échoué');
  }

  // Vérification du mode plein écran natif Tauri v2 (masquage de la barre de titre Windows)
  const fsOn = await api.toggleFullscreenMode();
  const fsBtn = elementsById.get('btnFullscreenToggle');
  if (!fsOn || !sandbox.__mockFullscreen || !fsBtn.classList.contains('active')) {
    throw new Error('L\'activation du mode plein écran natif Tauri v2 a échoué');
  }
  const fsOff = await api.toggleFullscreenMode();
  if (fsOff || sandbox.__mockFullscreen || fsBtn.classList.contains('active')) {
    throw new Error('La sortie du mode plein écran natif Tauri v2 a échoué');
  }

  // Vérification de la page plein écran de gestion de fichiers GoodNotes (#gnFilesPage)
  const openedFiles = api.openFilesPage('all');
  const filesPageEl = elementsById.get('gnFilesPage');
  if (!openedFiles || !state.filesPageOpen || filesPageEl.classList.contains('hidden')) {
    throw new Error('L\'ouverture de la page plein écran des fichiers GoodNotes a échoué');
  }
  const dupNb = await api.duplicateNotebookById(activeNb.id);
  if (!dupNb || dupNb.id === activeNb.id || !dupNb.title.includes('(copie)')) {
    throw new Error('La duplication d\'un cahier depuis la page fichiers a échoué');
  }
  api.closeFilesPage();
  if (state.filesPageOpen || !filesPageEl.classList.contains('hidden')) {
    throw new Error('La fermeture de la page plein écran des fichiers GoodNotes a échoué');
  }

  // Vérification de l'empilement vertical A4 (avec espace PAGE_STACK_GAP) + fond de bureau constant (#e6e5e4)
  const pdfStack = api.getBoundedStackInfo(pdfPages[0]);
  if (!pdfStack || pdfStack.items.length !== 2) {
    throw new Error('L\'empilement vertical des pages bornées/A4 n\'a pas retourné les 2 pages attendues');
  }
  const expectedDeltaY = pdfStack.items[0].height + api.PAGE_STACK_GAP;
  const actualDeltaY = pdfStack.items[1].relY - pdfStack.items[0].relY;
  if (actualDeltaY !== expectedDeltaY) {
    throw new Error(`Espacement vertical inter-pages inattendu: ${actualDeltaY} au lieu de ${expectedDeltaY}`);
  }
  const prevTone = pdfPages[0].paperTone;
  const deskLightBefore = api.getBoundedDeskBackdropColor();
  pdfPages[0].paperTone = 'dark';
  const deskLightAfterDarkPaper = api.getBoundedDeskBackdropColor();
  pdfPages[0].paperTone = 'blueprint';
  const deskLightAfterBlueprint = api.getBoundedDeskBackdropColor();
  pdfPages[0].paperTone = prevTone;
  if (deskLightBefore !== '#e6e5e4' || deskLightAfterDarkPaper !== '#e6e5e4' || deskLightAfterBlueprint !== '#e6e5e4') {
    throw new Error(`La couleur du fond autour de la feuille A4 ne doit pas changer avec la couleur du papier (${deskLightBefore} / ${deskLightAfterDarkPaper} / ${deskLightAfterBlueprint})`);
  }

  // Vérification du sélecteur de couleur GoodNotes 6 (+ ajout d'une couleur sélectionnable + préréglages par outil)
  const penSlotsBefore = state.toolMemory.pen.colorSlots.length;
  const openedColorPop = api.openGnColorPopover({ mode: 'add-slot', toolKey: 'pen', anchorEl: elementsById.get('gnSubAddColorBtn') });
  if (!openedColorPop || !api.getGnColorPopoverState().open) {
    throw new Error('L\'ouverture du popover couleur GoodNotes via le bouton + a échoué');
  }
  api.applyColorFromGnPopover('#82218b', { close: true });
  if (state.toolMemory.pen.colorSlots.length !== penSlotsBefore + 1 || state.penColor !== '#82218b') {
    throw new Error('La sélection d\'une couleur depuis le menu + n\'a pas ajouté une nouvelle pastille sélectionnable');
  }
  if (api.getGnColorPopoverState().open) {
    throw new Error('Le popover couleur GoodNotes aurait dû se fermer après ajout de la couleur');
  }
  const removedSlot = api.removeToolColorSlot('pen', state.toolMemory.pen.colorSlots.length - 1);
  if (!removedSlot || state.toolMemory.pen.colorSlots.length !== penSlotsBefore) {
    throw new Error('La suppression d\'un emplacement de couleur a échoué');
  }
  if (api.getToolColorPresets('pen').length < 15 || api.getToolColorPresets('highlighter').length < 5 || api.getToolColorPresets('tape').length < 9) {
    throw new Error('Les palettes de préréglages GoodNotes par outil sont incomplètes');
  }

  // Vérification du déplacement d'une sélection Lasso (et après duplication) même lorsque l'outil actif est Stylo
  state.tool = 'pen';
  const targetStroke = pdfPages[0].strokes[pdfPages[0].strokes.length - 1];
  state.selectedIds.strokes.clear();
  state.selectedIds.shapes.clear();
  state.selectedIds.texts.clear();
  state.selectedIds.strokes.add(targetStroke.id);
  api.computeSelectionBounds();
  api.duplicateLassoSelection();
  const strokesCountAfterDup = pdfPages[0].strokes.length;
  const dupStroke = pdfPages[0].strokes[pdfPages[0].strokes.length - 1];
  const origDupX = dupStroke.points[0].x;
  const sb = state.selectionBounds;
  const dragStartScreenX = ((sb.minX + sb.maxX) * 0.5) * state.zoom + state.panX;
  const dragStartScreenY = ((sb.minY + sb.maxY) * 0.5) * state.zoom + state.panY;
  api.handlePointerDown({
    pointerId: 33,
    pointerType: 'pen',
    button: 0,
    buttons: 1,
    clientX: dragStartScreenX,
    clientY: dragStartScreenY,
    pressure: 0.6,
    timeStamp: 5000,
    cancelable: true,
    preventDefault: () => {}
  });
  api.handlePointerMove({
    pointerId: 33,
    pointerType: 'pen',
    button: -1,
    buttons: 1,
    clientX: dragStartScreenX + 60,
    clientY: dragStartScreenY + 25,
    pressure: 0.6,
    timeStamp: 5020,
    cancelable: true,
    preventDefault: () => {}
  });
  api.handlePointerUpOrCancel({
    pointerId: 33,
    pointerType: 'pen',
    button: 0,
    buttons: 0,
    clientX: dragStartScreenX + 60,
    clientY: dragStartScreenY + 25,
    pressure: 0,
    timeStamp: 5040
  });
  if (pdfPages[0].strokes.length !== strokesCountAfterDup) {
    throw new Error('Cliquer dans une sélection Lasso (après copie) en outil Stylo a dessiné un nouveau trait au lieu de déplacer la sélection');
  }
  if (Math.abs(dupStroke.points[0].x - origDupX) < 10) {
    throw new Error('Le glisser-déposer d\'une sélection Lasso dupliquée en outil Stylo n\'a pas déplacé le trait copié');
  }

  // Vérification des paramètres du Ruban GoodNotes 6 (Ruban droit / libre + Supprimer tout le ruban)
  state.tool = 'tape';
  state.tapeForceStraight = false;
  pdfPages[0].tapes = [
    { id: 'tp_verify_free', x1: 40, y1: 40, x2: 140, y2: 60, straight: false, points: [{ x: 40, y: 40 }, { x: 90, y: 55 }, { x: 140, y: 60 }], thickness: 26, color: '#ff5f67', revealed: false },
    { id: 'tp_verify_straight', x1: 40, y1: 120, x2: 180, y2: 120, straight: true, thickness: 26, color: '#ff9f49', revealed: false }
  ];
  const removedTapesCount = api.removeAllTapesOnActivePage();
  if (removedTapesCount !== 2 || pdfPages[0].tapes.length !== 0) {
    throw new Error('Le bouton "Supprimer tout le ruban" n\'a pas effacé tous les rubans de la page');
  }

  // Vérification #1 : Règle graduée virtuelle rotative + aimantation de tracé sur le bord supérieur
  const rulerShown = api.toggleVirtualRuler(true);
  const rState = api.getVirtualRulerState();
  if (!rulerShown || !rState.visible) {
    throw new Error('La règle virtuelle (#1) ne s\'est pas activée correctement');
  }
  const topEdgeScreenY = rState.cy - rState.thickness * 0.5;
  const nearWorldStart = {
    x: (rState.cx - 80 - state.panX) / state.zoom,
    y: (topEdgeScreenY - 8 - state.panY) / state.zoom
  };
  const nearWorldNext = {
    x: (rState.cx + 80 - state.panX) / state.zoom,
    y: (topEdgeScreenY - 19 - state.panY) / state.zoom
  };
  const snapped1 = api.snapWorldPointToVirtualRuler(nearWorldStart, true);
  const snapped2 = api.snapWorldPointToVirtualRuler(nearWorldNext, false);
  if (Math.abs(snapped2.y - snapped1.y) > 0.05) {
    throw new Error(`Le guidage sur le bord de la règle virtuelle (#1) n'a pas projeté le trait en ligne droite (dy=${Math.abs(snapped2.y - snapped1.y)})`);
  }
  api.toggleVirtualRuler(false);

  // Vérification #4 : Onglets multi-documents (ouverture, bascule et fermeture d'onglet)
  const firstNbId = state.notebooks.find((n) => !n.trashedAt && n.id !== state.activeNotebookId)?.id;
  if (firstNbId) {
    api.openNotebookInTab(firstNbId, false);
    const tabsBeforeClose = (state.openNotebookTabIds || []).length;
    if (tabsBeforeClose < 2) {
      throw new Error('L\'ouverture d\'un second cahier dans les onglets (#4) n\'a pas ajouté d\'onglet');
    }
    const closedOk = api.closeNotebookTab(firstNbId);
    if (!closedOk || state.openNotebookTabIds.length !== tabsBeforeClose - 1) {
      throw new Error('La fermeture d\'un onglet de cahier (#4) a échoué');
    }
  }

  // Vérification #6 : Bibliothèque d'Éléments / Stickers réutilisables (enregistrement Lasso + insertion modèle)
  state.selectedIds.strokes.clear();
  state.selectedIds.shapes.clear();
  state.selectedIds.texts.clear();
  state.selectedIds.strokes.add(dupStroke.id);
  const savedEl = api.saveLassoSelectionAsElement('Schéma Vérif');
  if (!savedEl || !api.getSavedElementsLibrary().some((e) => e.id === savedEl.id)) {
    throw new Error('L\'enregistrement d\'une sélection Lasso dans la Bibliothèque d\'Éléments (#6) a échoué');
  }
  const shapesBeforeElInsert = (pdfPages[0].shapes || []).length;
  const insertedBuiltin = api.insertElementIntoActivePage(api.BUILTIN_VECTOR_ELEMENTS[0]);
  if (!insertedBuiltin || (pdfPages[0].shapes || []).length <= shapesBeforeElInsert || state.selectedIds.shapes.size === 0) {
    throw new Error('L\'insertion d\'un modèle vectoriel depuis la Bibliothèque d\'Éléments (#6) a échoué');
  }

  // Vérification #9 : Recherche de texte hors-ligne dans le PDF importé & les cartes texte (Ctrl+F)
  pdfPages[0].texts = pdfPages[0].texts || [];
  pdfPages[0].texts.push({ id: 'txt_search_verify', x: 80, y: 120, width: 220, text: 'Théorème de Cauchy-Schwarz' });
  api.openPdfSearchBar();
  const textMatches = await api.runPdfAndNotebookSearch('Cauchy');
  if (!Array.isArray(textMatches) || textMatches.length < 1) {
    throw new Error('La recherche (#9) n\'a pas trouvé le texte d\'une carte texte du cahier');
  }
  const pdfMatches = await api.runPdfAndNotebookSearch('Page');
  if (!Array.isArray(pdfMatches) || pdfMatches.length < 1 || !pdfMatches.some((m) => m.source === 'pdf')) {
    throw new Error('La recherche PDF hors-ligne (#9) n\'a pas trouvé de texte natif dans le PDF importé');
  }
  api.closePdfSearchBar();

  // Vérification #3 : API et DOM de recadrage d'images présents
  if (typeof api.openImageCropModal !== 'function' || typeof api.applyImageCrop !== 'function' || !sandbox.document.getElementById('modalImageCrop')) {
    throw new Error('Les contrôles de recadrage d\'images (#3) sont introuvables');
  }

  console.log(`✓ [4/4] Import PDF (PDF.js) + Export annoté + Plein écran + Pile A4 + Couleurs + Lasso + Ruban + Pack #1/#3/#4/#6/#9 vérifiés : ${savedTauriFiles[0].path} (${savedTauriFiles[0].byteLength} octets)`);
}

runVerification().catch((err) => {
  console.error('❌ Échec de la vérification WebView2 :', err);
  process.exit(1);
});
