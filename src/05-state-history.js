  // ============================================================================
  // 6. ÉTAT GLOBAL DE L'APPLICATION
  // ============================================================================

  const PAGE_WIDTH = 1190;
  const PAGE_HEIGHT = 1684;

  const state = {
    notebooks: [],
    folders: [],
    currentFolderId: null,
    sidebarFilter: 'all',
    sidebarSearch: '',
    sidebarSort: 'date',
    notebookSortBy: 'date_desc',
    libraryViewMode: 'list',
    pagesSubTab: 'pages',
    pagesFilterBookmarks: false,
    movingNotebookId: null,
    movingItems: null,
    editingFolderId: null,
    folderModalColor: '#0072ce',
    folderModalIcon: 'folder',
    filesPageOpen: false,
    detentePageOpen: false,
    radialWheelSuppressClick: false,
    filesPageTab: 'all',
    filesPageViewMode: 'grid',
    filesPageFavFilter: 'any',
    filesPageSelectMode: false,
    filesPageSelectedIds: new Set(),
    pagesByNotebook: new Map(),
    activeNotebookId: null,
    activePageId: null,
    tool: 'pen',
    previousWritingTool: 'pen',
    penStyle: 'fountain',
    penLineStyle: 'solid',
    highlighterAutoStraighten: false,
    highlighterSmoothing: 0,
    pencilDrawAndHold: true,
    penColor: '#000000',
    pencilColor: '#000000',
    highlighterColor: '#ffff00',
    shapeColor: '#000000',
    tapeColor: '#ff5f67',
    laserColor: '#ef4444',
    textColor: '#000000',
    penSize: 5,
    pencilSize: 5,
    highlighterSize: 22,
    shapeSize: 4,
    eraserSize: 18,
    tapeSize: 26,
    laserSize: 6,
    toolMemory: {
      pen: { color: '#000000', size: 5, colorSlots: ['#000000', '#007aff', '#dc2626'], activeColorSlotIndex: 0, sizeSlots: [2.5, 5, 12] },
      pencil: { color: '#000000', size: 5, colorSlots: ['#000000', '#636363', '#9b9b9b'], activeColorSlotIndex: 0, sizeSlots: [2.5, 5, 10] },
      highlighter: { color: '#ffff00', size: 22, colorSlots: ['#ffff00', '#00ff00', '#00ffff'], activeColorSlotIndex: 0, sizeSlots: [12, 22, 34] },
      shape: { color: '#000000', size: 4, colorSlots: ['#000000', '#007aff', '#dc2626'], activeColorSlotIndex: 0, sizeSlots: [2, 4, 8] },
      eraser: { color: '#94a3b8', size: 18, colorSlots: [], activeColorSlotIndex: 0, sizeSlots: [10, 18, 32] },
      tape: { color: '#ff5f67', size: 26, colorSlots: ['#ff5f67', '#ff9f49', '#f7ca1d'], activeColorSlotIndex: 0, sizeSlots: [18, 26, 36] },
      laser: { color: '#ef4444', size: 6, colorSlots: ['#ef4444', '#007aff', '#009b55'], activeColorSlotIndex: 0, sizeSlots: [4, 6, 10] },
      text: { color: '#000000', size: 16, colorSlots: ['#000000', '#007aff', '#d20000'], activeColorSlotIndex: 0, sizeSlots: [14, 16, 22] }
    },
    smoothing: 0.65,
    tipSharpness: 0.5,
    pressureSensitivity: 0.5,
    pressureMode: 'dynamic',
    eraserMode: 'stroke',
    eraserHighlighterOnly: false,
    eraserAutoDeselect: false,
    eraserFilters: { pen: true, pencil: true, highlighter: true, tape: true },
    lassoMode: 'freehand',
    lassoStartWorld: null,
    lassoFilters: { handwriting: true, shapes: true, texts: true, images: true },
    gnLassoFilterPopoverOpen: false,
    gnLassoAlignPopoverOpen: false,
    splitView: {
      open: false,
      notebookId: null,
      pageId: null,
      ratio: 0.5,
      zoom: 0.72,
      panX: 28,
      panY: 24,
      isPanning: false,
      panStartScreen: { x: 0, y: 0 },
      panStartOffset: { x: 0, y: 0 },
      pickerOpen: false,
      pickerMode: 'split',
      sortMode: 'folders',
      searchQuery: '',
      browseFolderId: null
    },
    shapeType: 'auto',
    shapeFilled: false,
    shapeLineStyle: 'solid',
    shapeRoundedCorners: true,
    shapeStartArrow: 'none',
    shapeEndArrow: 'none',
    shapeHoverConnection: null,
    selectedShapeId: null,
    shapeEditDrag: null,
    pendingShapeTapCandidateId: null,
    pendingShapeTapStartScreen: null,
    instantShapeMode: false,
    autoShapeEnabled: true,
    scribbleToErase: true,
    scribbleEraseShapesAndHl: true,
    circleToLasso: true,
    gnPenPopoverOpen: false,
    gnPencilPopoverOpen: false,
    gnHighlighterPopoverOpen: false,
    gnTapePopoverOpen: false,
    gnStrokePopoverOpen: false,
    gnShapeStrokePopoverOpen: false,
    textFontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    textFontLabel: 'Helvetica',
    textFontSize: 24,
    textBold: false,
    textItalic: false,
    textUnderline: false,
    textStrike: false,
    textAlign: 'left',
    textLineHeightMode: 'automatic',
    textLineHeightFixed: 32,
    textListStyle: 'none',
    textFrameStyle: {
      backgroundColor: null,
      borderColor: null,
      borderWidth: 0,
      cornerRadius: 0,
      padding: 10,
      showShadow: false
    },
    selectedTextId: null,
    editingTextId: null,
    textBoxCreateDrag: null,
    gnTextPopover: null,
    gnTextStyleTab: 'presets',
    tapeForceStraight: false,
    gnEraserModePopoverOpen: false,
    gnEraserAdvPopoverOpen: false,
    gnEraserSizePopoverOpen: false,
    activeSizeSlotByTool: { pen: 1, pencil: 1, highlighter: 1, shape: 1, tape: 1, eraser: 1 },
    palmRejection: true,
    lastPenSeenTime: 0,
    laserTrail: [],
    laserAnimFrame: null,
    currentTape: null,
    predictedPoints: [],
    zoomWindowOpen: false,
    zoomWindowMag: 2.5,
    zoomWindowBox: { x: 80, y: 140, w: 340, h: 120 },
    gdriveAccessToken: '',
    gdriveClientId: '',
    gdriveClientSecret: '',
    gdriveRefreshToken: '',
    gdriveTokenExpiresAt: 0,
    gdriveAccount: null,
    gdriveLinking: false,
    gdriveAutoBackup: false,
    gdriveLocalDirHandle: null,
    gdriveLastSyncAt: 0,
    zoom: 0.88,
    panX: 60,
    panY: 85,
    isSpacePressed: false,
    isPanning: false,
    panStartScreen: { x: 0, y: 0 },
    panStartOffset: { x: 0, y: 0 },
    pullToAdd: {
      active: false,
      direction: null,
      action: null,
      percentage: 0,
      visualOffset: 0,
      rawExcess: 0,
      source: null,
      wheelTimer: null,
      isCommitting: false
    },
    activePointerId: null,
    isDrawing: false,
    strokeStartTime: 0,
    lastPointerUpTime: 0,
    deselectTapPointerId: null,
    currentStroke: null,
    currentShape: null,
    temporaryEraserOverride: false,
    previousToolBeforeEraser: null,
    eraserGestureActive: false,
    eraserHistoryPushed: false,
    lastEraserWorldPt: null,
    temporaryLassoOverride: false,
    previousToolBeforeLasso: null,
    waitBarrelReleaseBeforeHoverTrigger: false,
    holdShapeTimer: null,
    holdShapeAnchorScreen: null,
    currentStrokeSnappedFromAutoShape: false,
    colorWheelTimer: null,
    colorWheelOpen: false,
    colorWheelTapMode: false,
    colorWheelAnchorScreen: null,
    colorWheelCenterScreen: { x: 0, y: 0 },
    colorWheelHoveredColor: null,
    lassoButtonDownTime: 0,
    lassoButtonDownPos: null,
    lassoButtonMaxTravel: 0,
    lastLassoButtonClickTime: 0,
    lastLassoButtonClickPos: null,
    lastPointerPoint: null,
    lastPointerTime: 0,
    // Multi-touch Pinch-to-Zoom & 2-Finger Pan
    touchPoints: new Map(),
    isPinching: false,
    pinchLastDist: 0,
    pinchLastCenter: { x: 0, y: 0 },
    // Lasso
    lassoPolygon: [],
    selectedIds: { strokes: new Set(), shapes: new Set(), texts: new Set(), images: new Set() },
    lassoPdfClip: null,
    lassoClipboard: null,
    selectionBounds: null,
    lassoAction: null,
    lassoDragStartWorld: null,
    lassoLiveMoveDelta: null,
    lassoInitialSnapshot: null,
    lassoInitialBounds: null,
    historyByPage: new Map(),
    newNotebookCover: '#0072ce',
    newNotebookTemplate: {
      paperType: 'grid',
      paperTone: 'white',
      gridSize: 28,
      language: 'fr',
      sizeId: 'goodnotes_standard',
      orientation: 'portrait',
      customTemplateDataUrl: null,
      coverTemplateId: null,
      coverCustomDataUrl: null
    },
    editingLatexCardId: null,
    pendingLatexWorldPos: null,
    lastRecognizedStrokes: [],
    toolOptionsOpen: false,
    pendingPdfImport: null,
    lastExportedPdfBytes: null
  };

  const ERASER_PREFS_STORAGE_KEY = 'inkflow_eraser_prefs_v1';
  function saveEraserPrefsToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(ERASER_PREFS_STORAGE_KEY, JSON.stringify({
        eraserMode: state.eraserMode,
        eraserAutoDeselect: Boolean(state.eraserAutoDeselect),
        eraserFilters: { ...(state.eraserFilters || { pen: true, pencil: true, highlighter: true, tape: true }) }
      }));
    } catch (_) {}
  }

  const PENCIL_PREFS_STORAGE_KEY = 'inkflow_pencil_prefs_v1';
  const HIGHLIGHTER_PREFS_STORAGE_KEY = 'inkflow_highlighter_prefs_v1';
  function savePencilPrefsToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(PENCIL_PREFS_STORAGE_KEY, JSON.stringify({
        pencilDrawAndHold: Boolean(state.pencilDrawAndHold)
      }));
    } catch (_) {}
  }
  function saveHighlighterPrefsToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(HIGHLIGHTER_PREFS_STORAGE_KEY, JSON.stringify({
        highlighterSmoothing: Number(state.highlighterSmoothing || 0),
        highlighterAutoStraighten: Boolean(state.highlighterAutoStraighten)
      }));
    } catch (_) {}
  }

  const TAPE_PREFS_STORAGE_KEY = 'inkflow_tape_prefs_v1';
  function saveTapePrefsToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(TAPE_PREFS_STORAGE_KEY, JSON.stringify({
        tapeForceStraight: Boolean(state.tapeForceStraight)
      }));
    } catch (_) {}
  }

  const SHAPE_STROKE_PREFS_STORAGE_KEY = 'inkflow_shape_stroke_prefs_v1';
  function saveShapeStrokePrefsToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(SHAPE_STROKE_PREFS_STORAGE_KEY, JSON.stringify({
        shapeLineStyle: state.shapeLineStyle || 'solid',
        shapeRoundedCorners: state.shapeRoundedCorners !== false,
        shapeStartArrow: state.shapeStartArrow || 'none',
        shapeEndArrow: state.shapeEndArrow || 'none'
      }));
    } catch (_) {}
  }

  function applyActiveShapeStrokeStyle(sh) {
    if (!sh) return sh;
    sh.lineStyle = state.shapeLineStyle || 'solid';
    sh.roundedCorners = state.shapeRoundedCorners !== false;
    sh.startArrow = state.shapeStartArrow || 'none';
    sh.endArrow = state.shapeEndArrow || 'none';
    return sh;
  }

  try {
    const savedAutoShape = localStorage.getItem('plume_auto_shape_enabled');
    if (savedAutoShape === 'false') state.autoShapeEnabled = false;
    const savedSmoothing = parseFloat(localStorage.getItem('inkflow_smoothing_v1'));
    if (Number.isFinite(savedSmoothing) && savedSmoothing >= 0 && savedSmoothing <= 1) {
      state.smoothing = savedSmoothing;
    }
    const savedShapeStrokeRaw = localStorage.getItem(SHAPE_STROKE_PREFS_STORAGE_KEY);
    if (savedShapeStrokeRaw) {
      const sp = JSON.parse(savedShapeStrokeRaw);
      if (sp && typeof sp === 'object') {
        if (sp.shapeLineStyle === 'solid' || sp.shapeLineStyle === 'dashed' || sp.shapeLineStyle === 'dotted') {
          state.shapeLineStyle = sp.shapeLineStyle;
        }
        if (typeof sp.shapeRoundedCorners === 'boolean') state.shapeRoundedCorners = sp.shapeRoundedCorners;
        if (sp.shapeStartArrow === 'none' || sp.shapeStartArrow === 'open' || sp.shapeStartArrow === 'filled') {
          state.shapeStartArrow = sp.shapeStartArrow;
        }
        if (sp.shapeEndArrow === 'none' || sp.shapeEndArrow === 'open' || sp.shapeEndArrow === 'filled') {
          state.shapeEndArrow = sp.shapeEndArrow;
        }
      }
    }
    const savedPencilRaw = localStorage.getItem(PENCIL_PREFS_STORAGE_KEY);
    if (savedPencilRaw) {
      const pp = JSON.parse(savedPencilRaw);
      if (pp && typeof pp.pencilDrawAndHold === 'boolean') state.pencilDrawAndHold = pp.pencilDrawAndHold;
    }
    const savedPenGesturesRaw = localStorage.getItem('inkflow_pen_gestures_v1');
    if (savedPenGesturesRaw) {
      const gp = JSON.parse(savedPenGesturesRaw);
      if (gp && typeof gp === 'object') {
        if (typeof gp.scribbleToErase === 'boolean') state.scribbleToErase = gp.scribbleToErase;
        if (typeof gp.scribbleEraseShapesAndHl === 'boolean') state.scribbleEraseShapesAndHl = gp.scribbleEraseShapesAndHl;
        if (typeof gp.circleToLasso === 'boolean') state.circleToLasso = gp.circleToLasso;
      }
    }
    const savedHlRaw = localStorage.getItem(HIGHLIGHTER_PREFS_STORAGE_KEY);
    if (savedHlRaw) {
      const hp = JSON.parse(savedHlRaw);
      if (hp && typeof hp === 'object') {
        if (Number.isFinite(hp.highlighterSmoothing) && hp.highlighterSmoothing >= 0 && hp.highlighterSmoothing <= 1) {
          state.highlighterSmoothing = hp.highlighterSmoothing;
        }
        if (typeof hp.highlighterAutoStraighten === 'boolean') {
          state.highlighterAutoStraighten = hp.highlighterAutoStraighten;
        }
      }
    }
    const savedTapeRaw = localStorage.getItem(TAPE_PREFS_STORAGE_KEY);
    if (savedTapeRaw) {
      const tp = JSON.parse(savedTapeRaw);
      if (tp && typeof tp.tapeForceStraight === 'boolean') {
        state.tapeForceStraight = tp.tapeForceStraight;
      }
    }
    const savedEraserRaw = localStorage.getItem(ERASER_PREFS_STORAGE_KEY);
    if (savedEraserRaw) {
      const ep = JSON.parse(savedEraserRaw);
      if (ep && typeof ep === 'object') {
        if (ep.eraserMode === 'stroke' || ep.eraserMode === 'segment' || ep.eraserMode === 'partial') {
          state.eraserMode = ep.eraserMode;
        }
        if (typeof ep.eraserAutoDeselect === 'boolean') {
          state.eraserAutoDeselect = ep.eraserAutoDeselect;
        }
        if (ep.eraserFilters && typeof ep.eraserFilters === 'object') {
          state.eraserFilters = {
            pen: ep.eraserFilters.pen !== false,
            pencil: ep.eraserFilters.pencil !== false,
            highlighter: ep.eraserFilters.highlighter !== false,
            tape: ep.eraserFilters.tape !== false
          };
        }
      }
    }
    const savedTextToolRaw = localStorage.getItem('inkflow_text_tool_prefs_v1');
    if (savedTextToolRaw) {
      const tt = JSON.parse(savedTextToolRaw);
      if (tt && typeof tt === 'object') {
        if (typeof tt.textFontFamily === 'string' && tt.textFontFamily.trim()) state.textFontFamily = tt.textFontFamily;
        if (typeof tt.textFontLabel === 'string' && tt.textFontLabel.trim()) state.textFontLabel = tt.textFontLabel;
        if (Number.isFinite(tt.textFontSize) && tt.textFontSize >= 1 && tt.textFontSize <= 200) state.textFontSize = Math.round(tt.textFontSize);
        if (typeof tt.textColor === 'string' && tt.textColor.startsWith('#')) state.textColor = tt.textColor;
        if (typeof tt.textBold === 'boolean') state.textBold = tt.textBold;
        if (typeof tt.textItalic === 'boolean') state.textItalic = tt.textItalic;
        if (typeof tt.textUnderline === 'boolean') state.textUnderline = tt.textUnderline;
        if (typeof tt.textStrike === 'boolean') state.textStrike = tt.textStrike;
        if (tt.textAlign === 'left' || tt.textAlign === 'center' || tt.textAlign === 'right') state.textAlign = tt.textAlign;
        if (tt.textLineHeightMode === 'automatic' || tt.textLineHeightMode === 'fixed') state.textLineHeightMode = tt.textLineHeightMode;
        if (Number.isFinite(tt.textLineHeightFixed) && tt.textLineHeightFixed >= 8 && tt.textLineHeightFixed <= 200) state.textLineHeightFixed = Math.round(tt.textLineHeightFixed);
        if (tt.textListStyle === 'none' || tt.textListStyle === 'bullets' || tt.textListStyle === 'numbered') state.textListStyle = tt.textListStyle;
        if (tt.textFrameStyle && typeof tt.textFrameStyle === 'object') {
          state.textFrameStyle = {
            backgroundColor: tt.textFrameStyle.backgroundColor || null,
            borderColor: tt.textFrameStyle.borderColor || null,
            borderWidth: Math.max(0, Math.min(20, Number(tt.textFrameStyle.borderWidth) || 0)),
            cornerRadius: Math.max(0, Math.min(20, Number(tt.textFrameStyle.cornerRadius) || 0)),
            padding: Math.max(0, Math.min(20, Number.isFinite(Number(tt.textFrameStyle.padding)) ? Number(tt.textFrameStyle.padding) : 10)),
            showShadow: Boolean(tt.textFrameStyle.showShadow)
          };
        }
      }
    }
  } catch (_) {}

  // Exact GoodNotes 6 TextBoxStyle presets (REA DocumentLoaderRoute-PMJiTofc.js fO)
  const GN_TEXT_BOX_STYLE_PRESETS = [
    { backgroundColor: null, borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false },
    { backgroundColor: '#373b44', borderColor: null, borderWidth: 0, cornerRadius: 7, padding: 10, showShadow: false },
    { backgroundColor: '#ADFF4F', borderColor: null, borderWidth: 0, cornerRadius: 7, padding: 10, showShadow: false },
    { backgroundColor: '#FFD8CE', borderColor: null, borderWidth: 0, cornerRadius: 7, padding: 10, showShadow: true },
    { backgroundColor: '#FFFFFF', borderColor: null, borderWidth: 0, cornerRadius: 7, padding: 10, showShadow: true },
    { backgroundColor: '#F65353', borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false },
    { backgroundColor: '#FCFF4F', borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false },
    { backgroundColor: '#F2F8FF', borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false },
    { backgroundColor: '#4C5B7F', borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false },
    { backgroundColor: '#FFFFFF', borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false }
  ];

  function saveTextToolPrefs() {
    try {
      localStorage.setItem('inkflow_text_tool_prefs_v1', JSON.stringify({
        textFontFamily: state.textFontFamily,
        textFontLabel: state.textFontLabel,
        textFontSize: state.textFontSize,
        textColor: state.textColor,
        textBold: state.textBold,
        textItalic: state.textItalic,
        textUnderline: state.textUnderline,
        textStrike: state.textStrike,
        textAlign: state.textAlign,
        textLineHeightMode: state.textLineHeightMode,
        textLineHeightFixed: state.textLineHeightFixed,
        textListStyle: state.textListStyle,
        textFrameStyle: { ...state.textFrameStyle }
      }));
    } catch (_) {}
  }

  function saveLassoPrefs() {
    try {
      localStorage.setItem('inkflow_lasso_prefs_v1', JSON.stringify({
        lassoMode: state.lassoMode,
        lassoFilters: { ...state.lassoFilters }
      }));
    } catch (_) {}
  }
  try {
    const savedLassoRaw = localStorage.getItem('inkflow_lasso_prefs_v1');
    if (savedLassoRaw) {
      const lp = JSON.parse(savedLassoRaw);
      if (lp && typeof lp === 'object') {
        if (lp.lassoMode === 'freehand' || lp.lassoMode === 'rect') state.lassoMode = lp.lassoMode;
        if (lp.lassoFilters && typeof lp.lassoFilters === 'object') {
          state.lassoFilters = {
            handwriting: lp.lassoFilters.handwriting !== false,
            shapes: lp.lassoFilters.shapes !== false,
            texts: lp.lassoFilters.texts !== false,
            images: lp.lassoFilters.images !== false
          };
        }
      }
    }
  } catch (_) {}

  const TOOL_PREFS_STORAGE_KEY = 'inkflow_tool_prefs_v1';

  function getActiveToolColor(tool = state.tool) {
    if (tool === 'pencil') return state.pencilColor || '#111827';
    if (tool === 'highlighter') return state.highlighterColor;
    if (tool === 'shape') return state.shapeColor || state.penColor;
    if (tool === 'tape') return state.tapeColor || '#f59e0b';
    if (tool === 'laser') return state.laserColor || '#ef4444';
    if (tool === 'text') return state.textColor || state.penColor;
    if (tool === 'eraser') return '#94a3b8';
    return state.penColor;
  }

  function getActiveToolSize(tool = state.tool) {
    if (tool === 'pencil') return state.pencilSize || 5;
    if (tool === 'highlighter') return state.highlighterSize;
    if (tool === 'eraser') return state.eraserSize;
    if (tool === 'shape') return state.shapeSize || state.penSize;
    if (tool === 'tape') return state.tapeSize || state.highlighterSize || 26;
    if (tool === 'laser') return state.laserSize || 6;
    return state.penSize;
  }

  function syncCanonicalToToolMemory(tool) {
    const mem = state.toolMemory && state.toolMemory[tool];
    if (!mem) return;
    mem.color = getActiveToolColor(tool);
    mem.size = getActiveToolSize(tool);
  }

  function applyToolMemoryToCanonical(tool) {
    const mem = state.toolMemory && state.toolMemory[tool];
    if (!mem) return;
    if (tool === 'pen') {
      if (mem.color) state.penColor = mem.color;
      if (Number.isFinite(mem.size)) state.penSize = mem.size;
    } else if (tool === 'pencil') {
      if (mem.color) state.pencilColor = mem.color;
      if (Number.isFinite(mem.size)) state.pencilSize = mem.size;
    } else if (tool === 'highlighter') {
      if (mem.color) state.highlighterColor = mem.color;
      if (Number.isFinite(mem.size)) state.highlighterSize = mem.size;
    } else if (tool === 'shape') {
      if (mem.color) state.shapeColor = mem.color;
      if (Number.isFinite(mem.size)) state.shapeSize = mem.size;
    } else if (tool === 'eraser') {
      if (Number.isFinite(mem.size)) state.eraserSize = mem.size;
    } else if (tool === 'tape') {
      if (mem.color) state.tapeColor = mem.color;
      if (Number.isFinite(mem.size)) state.tapeSize = mem.size;
    } else if (tool === 'laser') {
      if (mem.color) state.laserColor = mem.color;
      if (Number.isFinite(mem.size)) state.laserSize = mem.size;
    } else if (tool === 'text') {
      if (mem.color) state.textColor = mem.color;
    }
  }

  function saveToolMemoryToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      ['pen', 'pencil', 'highlighter', 'shape', 'eraser', 'tape', 'laser', 'text'].forEach(syncCanonicalToToolMemory);
      localStorage.setItem(TOOL_PREFS_STORAGE_KEY, JSON.stringify(state.toolMemory));
    } catch (_) {}
  }

  // Palettes de préréglages exactes GoodNotes 6 (issues de l'analyse REA : pen/shape, pencil, highlighter, tape, text)
  const GN_DEFAULT_COLOR_PRESETS_BY_TOOL = {
    pen: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#ff0202', '#82218b', '#f65353', '#ff9797', '#fe9a23',
      '#007aff', '#03468f', '#009b55', '#7ec636', '#fdff85'
    ],
    pencil: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#baa184', '#cfbfa6', '#e2d7c3', '#f8f7eb'
    ],
    highlighter: [
      '#ffff00', '#00ff00', '#00ffff', '#ffa238', '#ff0038',
      '#fde68a', '#86efac', '#93c5fd', '#f9a8d4', '#c4b5fd'
    ],
    tape: [
      '#ff5f67', '#ff9f49', '#f7ca1d', '#63dd57', '#60d0e2',
      '#80c1ff', '#cea4fa', '#fc8cc7', '#e4e2dc'
    ],
    shape: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#ff0202', '#82218b', '#f65353', '#ff9797', '#fe9a23',
      '#007aff', '#03468f', '#009b55', '#7ec636', '#fdff85'
    ],
    text: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#cc72d3', '#d20000', '#f65353', '#ff9797', '#f59a23',
      '#007aff', '#03468f', '#007355', '#7ec636', '#fdff85'
    ],
    laser: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#ff0202', '#82218b', '#f65353', '#ff9797', '#fe9a23',
      '#007aff', '#03468f', '#009b55', '#7ec636', '#fdff85'
    ],
    cover: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#ff0202', '#82218b', '#f65353', '#ff9797', '#fe9a23',
      '#007aff', '#03468f', '#009b55', '#7ec636', '#fdff85'
    ],
    folder: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#ff0202', '#82218b', '#f65353', '#ff9797', '#fe9a23',
      '#007aff', '#03468f', '#009b55', '#7ec636', '#fdff85'
    ]
  };
  const GN_MAX_COLOR_SLOTS = 12;
  const GN_MAX_COLOR_PRESETS = 50;
  const GN_EXTRA_PRESETS_BY_SCOPE = {
    cover: [...GN_DEFAULT_COLOR_PRESETS_BY_TOOL.cover],
    folder: [...GN_DEFAULT_COLOR_PRESETS_BY_TOOL.folder]
  };

  function normalizeHexColor(hex) {
    if (typeof hex !== 'string') return null;
    let s = hex.trim();
    if (!s.startsWith('#')) s = '#' + s;
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    if (!/^#[0-9a-f]{6}$/i.test(s)) return null;
    return s.toLowerCase();
  }

  function getToolColorPresets(scopeKey) {
    const key = scopeKey || 'pen';
    const mem = state.toolMemory && state.toolMemory[key];
    if (mem) {
      if (!Array.isArray(mem.colorPresets) || mem.colorPresets.length === 0) {
        mem.colorPresets = [...(GN_DEFAULT_COLOR_PRESETS_BY_TOOL[key] || GN_DEFAULT_COLOR_PRESETS_BY_TOOL.pen)];
      }
      return mem.colorPresets;
    }
    if (!GN_EXTRA_PRESETS_BY_SCOPE[key]) {
      GN_EXTRA_PRESETS_BY_SCOPE[key] = [...(GN_DEFAULT_COLOR_PRESETS_BY_TOOL[key] || GN_DEFAULT_COLOR_PRESETS_BY_TOOL.pen)];
    }
    return GN_EXTRA_PRESETS_BY_SCOPE[key];
  }

  function loadToolMemoryFromStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      const raw = localStorage.getItem(TOOL_PREFS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      ['pen', 'pencil', 'highlighter', 'shape', 'eraser', 'tape', 'laser', 'text'].forEach((t) => {
        const entry = parsed[t];
        if (!entry || typeof entry !== 'object') return;
        const target = state.toolMemory[t];
        if (!target) return;
        if (typeof entry.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(entry.color)) {
          target.color = entry.color;
        }
        if (typeof entry.size === 'number' && Number.isFinite(entry.size) && entry.size >= 0.5 && entry.size <= 64) {
          target.size = entry.size;
        }
        if (Array.isArray(entry.colorSlots) && entry.colorSlots.length > 0) {
          target.colorSlots = entry.colorSlots
            .map((c) => normalizeHexColor(c) || (typeof c === 'string' ? c : null))
            .filter(Boolean)
            .slice(0, GN_MAX_COLOR_SLOTS);
        }
        if (typeof entry.activeColorSlotIndex === 'number' && Number.isInteger(entry.activeColorSlotIndex)) {
          target.activeColorSlotIndex = Math.max(0, Math.min(Math.max(0, (target.colorSlots?.length || 1) - 1), entry.activeColorSlotIndex));
        }
        if (Array.isArray(entry.colorPresets) && entry.colorPresets.length > 0) {
          const validPresets = entry.colorPresets
            .map((c) => normalizeHexColor(c))
            .filter(Boolean)
            .slice(0, GN_MAX_COLOR_PRESETS);
          if (validPresets.length > 0) target.colorPresets = validPresets;
        }
        if (Array.isArray(entry.sizeSlots) && entry.sizeSlots.length === 3) {
          const validSizes = entry.sizeSlots.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0.5 && n <= 64);
          if (validSizes.length === 3) target.sizeSlots = validSizes;
        }
        applyToolMemoryToCanonical(t);
      });
    } catch (_) {}
  }

  function setToolColor(tool, hexColor, opts = {}) {
    if (!hexColor) return;
    const norm = normalizeHexColor(hexColor) || hexColor;
    if (tool === 'pencil') state.pencilColor = norm;
    else if (tool === 'highlighter') state.highlighterColor = norm;
    else if (tool === 'shape') state.shapeColor = norm;
    else if (tool === 'tape') state.tapeColor = norm;
    else if (tool === 'laser') state.laserColor = norm;
    else if (tool === 'text') state.textColor = norm;
    else state.penColor = norm;
    const mem = state.toolMemory && state.toolMemory[tool];
    if (mem) {
      mem.color = norm;
      if (Array.isArray(mem.colorSlots)) {
        if (opts && opts.addNewSlot) {
          if (mem.colorSlots.length < GN_MAX_COLOR_SLOTS) {
            mem.colorSlots.push(norm);
          } else {
            mem.colorSlots[mem.colorSlots.length - 1] = norm;
          }
          mem.activeColorSlotIndex = mem.colorSlots.length - 1;
        } else if (opts && typeof opts.slotIndex === 'number' && opts.slotIndex >= 0 && opts.slotIndex < mem.colorSlots.length) {
          if (!opts.selectOnly) {
            mem.colorSlots[opts.slotIndex] = norm;
          }
          mem.activeColorSlotIndex = opts.slotIndex;
        } else {
          const lower = String(norm).toLowerCase();
          const matchIdx = mem.colorSlots.findIndex((c) => String(c).toLowerCase() === lower);
          if (matchIdx >= 0) {
            mem.activeColorSlotIndex = matchIdx;
          } else {
            const idx = (typeof mem.activeColorSlotIndex === 'number' && mem.activeColorSlotIndex >= 0 && mem.activeColorSlotIndex < mem.colorSlots.length)
              ? mem.activeColorSlotIndex
              : 0;
            if (mem.colorSlots.length === 0) mem.colorSlots.push(norm);
            else mem.colorSlots[idx] = norm;
            mem.activeColorSlotIndex = idx;
          }
        }
      }
    }
    saveToolMemoryToStorage();
    if (typeof dom !== 'undefined' && dom.colorDotCursor && dom.colorDotCursor.style.display === 'block') {
      dom.colorDotCursor.style.backgroundColor = getActiveCursorColor();
    }
  }

  function addToolColorSlot(toolKey, hexColor) {
    const key = (state.toolMemory && state.toolMemory[toolKey]) ? toolKey : 'pen';
    const norm = normalizeHexColor(hexColor);
    if (!norm) return -1;
    setToolColor(key, norm, { addNewSlot: true });
    return state.toolMemory[key].activeColorSlotIndex;
  }

  function removeToolColorSlot(toolKey, slotIndex) {
    const key = (state.toolMemory && state.toolMemory[toolKey]) ? toolKey : 'pen';
    const mem = state.toolMemory && state.toolMemory[key];
    if (!mem || !Array.isArray(mem.colorSlots) || mem.colorSlots.length <= 1) return false;
    if (slotIndex < 0 || slotIndex >= mem.colorSlots.length) return false;
    mem.colorSlots.splice(slotIndex, 1);
    const nextIdx = Math.max(0, Math.min(slotIndex, mem.colorSlots.length - 1));
    mem.activeColorSlotIndex = nextIdx;
    setToolColor(key, mem.colorSlots[nextIdx], { slotIndex: nextIdx, selectOnly: true });
    return true;
  }

  function setToolSize(tool, sizeVal) {
    const n = Number(sizeVal);
    if (!Number.isFinite(n) || n <= 0) return;
    if (tool === 'pencil') state.pencilSize = n;
    else if (tool === 'highlighter') state.highlighterSize = n;
    else if (tool === 'eraser') state.eraserSize = n;
    else if (tool === 'shape') state.shapeSize = n;
    else if (tool === 'tape') state.tapeSize = n;
    else if (tool === 'laser') state.laserSize = n;
    else state.penSize = n;
    const mem = state.toolMemory && state.toolMemory[tool];
    if (mem) mem.size = n;
    saveToolMemoryToStorage();
  }

  loadToolMemoryFromStorage();

  const strokePathCache = new WeakMap();
  function getCachedStrokePath(stroke) {
    let cached = strokePathCache.get(stroke);
    const isPencilStroke = stroke && (stroke.tool === 'pencil' || stroke.penStyle === 'pencil');
    const pad = isPencilStroke
      ? Math.max(8, (stroke.size || 5) * 2.4)
      : Math.max(4, (stroke.size || 5) * 0.85);
    if (!cached) {
      const path2d = buildStrokePath2D(stroke);
      const bounds = (stroke.points && stroke.points.length > 0)
        ? (stroke._bounds || computeStrokeBounds(stroke, pad))
        : null;
      stroke._bounds = bounds;
      cached = {
        path2d,
        svgPath: null,
        pencilSamples: null,
        bounds,
        renderMode: stroke._renderMode || ((stroke.tool === 'highlighter' || stroke.pressureMode === 'uniform') ? 'stroke' : 'fill')
      };
      strokePathCache.set(stroke, cached);
    } else {
      if (!cached.bounds && stroke.points && stroke.points.length > 0) {
        cached.bounds = stroke._bounds || computeStrokeBounds(stroke, pad);
        stroke._bounds = cached.bounds;
      }
      if (!cached.renderMode) {
        cached.renderMode = stroke._renderMode || ((stroke.tool === 'highlighter' || stroke.pressureMode === 'uniform') ? 'stroke' : 'fill');
      }
    }
    return cached;
  }
  function getCachedStrokeBounds(stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return null;
    if (stroke._bounds) return stroke._bounds;
    return getCachedStrokePath(stroke).bounds;
  }
  function getCachedStrokeSvgPath(stroke) {
    const cached = getCachedStrokePath(stroke);
    if (!cached.svgPath) cached.svgPath = buildStrokePathData(stroke);
    return cached.svgPath;
  }
  function invalidateStrokeCache(stroke) {
    if (!stroke) return;
    stroke._bounds = null;
    strokePathCache.delete(stroke);
  }

  // ============================================================================
  // 7. RÉFÉRENCES DOM
  // ============================================================================

  const dom = {
    leftSidebar: document.getElementById('leftSidebar'),
    btnToggleSidebar: document.getElementById('btnToggleSidebar'),
    btnCloseSidebar: document.getElementById('btnCloseSidebar'),
    tabNotebooksBtn: document.getElementById('tabNotebooksBtn'),
    tabPagesBtn: document.getElementById('tabPagesBtn'),
    sectionNotebooks: document.getElementById('sectionNotebooks'),
    sectionPages: document.getElementById('sectionPages'),
    notebookList: document.getElementById('notebookList'),
    pagesGrid: document.getElementById('pagesGrid'),
    sidebarPageCount: document.getElementById('sidebarPageCount'),
    btnNewNotebook: document.getElementById('btnNewNotebook'),
    btnNewPageSidebar: document.getElementById('btnNewPageSidebar'),
    btnImportPdfSidebar: document.getElementById('btnImportPdfSidebar'),
    btnExportPdfSidebar: document.getElementById('btnExportPdfSidebar'),
    btnImportPdfPages: document.getElementById('btnImportPdfPages'),
    inputImportPdf: document.getElementById('inputImportPdf'),
    dbStatusDot: document.getElementById('dbStatusDot'),
    dbStatusText: document.getElementById('dbStatusText'),
    strokeCountBadge: document.getElementById('strokeCountBadge'),
    btnBackupJson: document.getElementById('btnBackupJson'),
    btnImportJson: document.getElementById('btnImportJson'),
    inputImportJson: document.getElementById('inputImportJson'),
    btnDesktopInfo: document.getElementById('btnDesktopInfo'),
    toolBtns: document.querySelectorAll('[data-tool]'),
    btnToggleToolOptions: document.getElementById('btnToggleToolOptions'),
    activeToolColorPreview: document.getElementById('activeToolColorPreview'),
    activeToolSummaryText: document.getElementById('activeToolSummaryText'),
    btnCloseToolOptions: document.getElementById('btnCloseToolOptions'),
    btnOpenLatexModal: document.getElementById('btnOpenLatexModal'),
    btnOpenRecognition: document.getElementById('btnOpenRecognition'),
    penColorDot: document.getElementById('penColorDot'),
    hlColorDot: document.getElementById('hlColorDot'),
    btnUndo: document.getElementById('btnUndo'),
    btnRedo: document.getElementById('btnRedo'),
    btnPaperSettings: document.getElementById('btnPaperSettings'),
    btnExportMenu: document.getElementById('btnExportMenu'),
    btnThemeToggle: document.getElementById('btnThemeToggle'),
    btnFullscreenToggle: document.getElementById('btnFullscreenToggle'),
    toolOptionsDock: document.getElementById('toolOptionsDock'),
    colorPaletteGroup: document.getElementById('colorPaletteGroup'),
    colorSwatches: document.querySelectorAll('#colorPaletteGroup .color-swatch'),
    customColorPicker: document.getElementById('customColorPicker'),
    dividerAfterColor: document.getElementById('dividerAfterColor'),
    sizeControlGroup: document.getElementById('sizeControlGroup'),
    sizeDotBtns: document.querySelectorAll('.size-dot-btn'),
    strokeSizeSlider: document.getElementById('strokeSizeSlider'),
    strokeSizeValue: document.getElementById('strokeSizeValue'),
    smoothingControlGroup: document.getElementById('smoothingControlGroup'),
    smoothingSlider: document.getElementById('smoothingSlider'),
    smoothingValue: document.getElementById('smoothingValue'),
    btnPressureDynamic: document.getElementById('btnPressureDynamic'),
    btnPressureUniform: document.getElementById('btnPressureUniform'),
    autoShapeToggle: document.getElementById('autoShapeToggle'),
    textControlGroup: document.getElementById('textControlGroup'),
    btnAddTextCardNow: document.getElementById('btnAddTextCardNow'),
    btnAddLatexCardNow: document.getElementById('btnAddLatexCardNow'),
    shapeControlGroup: document.getElementById('shapeControlGroup'),
    shapeBtns: document.querySelectorAll('[data-shape]'),
    shapeFillCheckbox: document.getElementById('shapeFillCheckbox'),
    eraserControlGroup: document.getElementById('eraserControlGroup'),
    eraserModeBtns: document.querySelectorAll('[data-eraser-mode]'),
    btnClearPage: document.getElementById('btnClearPage'),
    lassoControlGroup: document.getElementById('lassoControlGroup'),
    lassoSelectionBadge: document.getElementById('lassoSelectionBadge'),
    btnRecognizeSelection: document.getElementById('btnRecognizeSelection'),
    btnDuplicateSelection: document.getElementById('btnDuplicateSelection'),
    btnScaleUpSelection: document.getElementById('btnScaleUpSelection'),
    btnScaleDownSelection: document.getElementById('btnScaleDownSelection'),
    btnDeleteSelection: document.getElementById('btnDeleteSelection'),
    paperPopover: document.getElementById('paperPopover'),
    btnClosePaperPopover: document.getElementById('btnClosePaperPopover'),
    paperOptionBtns: document.querySelectorAll('[data-paper]'),
    toneBtns: document.querySelectorAll('[data-tone]'),
    gridSpacingSlider: document.getElementById('gridSpacingSlider'),
    gridSpacingVal: document.getElementById('gridSpacingVal'),
    viewModeBtns: document.querySelectorAll('[data-viewmode]'),
    exportPopover: document.getElementById('exportPopover'),
    btnCloseExportPopover: document.getElementById('btnCloseExportPopover'),
    btnExportSvg: document.getElementById('btnExportSvg'),
    btnExportPng: document.getElementById('btnExportPng'),
    btnExportPdf: document.getElementById('btnExportPdf'),
    btnExportCurrentPagePdf: document.getElementById('btnExportCurrentPagePdf'),
    btnImportPdfFromExportMenu: document.getElementById('btnImportPdfFromExportMenu'),
    canvasViewport: document.getElementById('canvasViewport'),
    pdfBgCanvas: document.getElementById('pdfBgCanvas'),
    inkCanvas: document.getElementById('inkCanvas'),
    activeInkCanvas: document.getElementById('activeInkCanvas'),
    worldObjectsLayer: document.getElementById('worldObjectsLayer'),
    eraserCursor: document.getElementById('eraserCursor'),
    colorDotCursor: document.getElementById('colorDotCursor'),
    lassoFloatingActions: document.getElementById('lassoFloatingActions'),
    shapeEditFloatingBar: document.getElementById('shapeEditFloatingBar'),
    btnQuickDupLasso: document.getElementById('btnQuickDupLasso'),
    btnQuickRecogLasso: document.getElementById('btnQuickRecogLasso'),
    btnQuickDelLasso: document.getElementById('btnQuickDelLasso'),
    radialColorWheel: document.getElementById('radialColorWheel'),
    radialWheelSvg: document.getElementById('radialWheelSvg'),
    radialWheelCenter: document.getElementById('radialWheelCenter'),
    radialCenterDot: document.getElementById('radialCenterDot'),
    radialCenterLabel: document.getElementById('radialCenterLabel'),
    pointerTypeBadge: document.getElementById('pointerTypeBadge'),
    pressureBarFill: document.getElementById('pressureBarFill'),
    pressureReadout: document.getElementById('pressureReadout'),
    coalescedReadout: document.getElementById('coalescedReadout'),
    palmRejectionToggle: document.getElementById('palmRejectionToggle'),
    btnPrevPage: document.getElementById('btnPrevPage'),
    btnNextPage: document.getElementById('btnNextPage'),
    btnQuickAddPage: document.getElementById('btnQuickAddPage'),
    hudPageIndicator: document.getElementById('hudPageIndicator'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnZoomReset: document.getElementById('btnZoomReset'),
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnExtendCanvas: document.getElementById('btnExtendCanvas'),
    btnFitPage: document.getElementById('btnFitPage'),
    // Modale Import PDF
    modalImportPdf: document.getElementById('modalImportPdf'),
    btnCloseImportPdfModal: document.getElementById('btnCloseImportPdfModal'),
    btnCancelImportPdfModal: document.getElementById('btnCancelImportPdfModal'),
    pdfModalDropzone: document.getElementById('pdfModalDropzone'),
    importPdfFileName: document.getElementById('importPdfFileName'),
    importPdfPageCount: document.getElementById('importPdfPageCount'),
    btnSelectPdfFileModal: document.getElementById('btnSelectPdfFileModal'),
    btnGenerateSamplePdf: document.getElementById('btnGenerateSamplePdf'),
    pdfImportErrorBanner: document.getElementById('pdfImportErrorBanner'),
    pdfImportProgressWrap: document.getElementById('pdfImportProgressWrap'),
    pdfImportProgressText: document.getElementById('pdfImportProgressText'),
    pdfImportProgressPercent: document.getElementById('pdfImportProgressPercent'),
    pdfImportProgressFill: document.getElementById('pdfImportProgressFill'),
    btnConfirmPdfAppendNotebook: document.getElementById('btnConfirmPdfAppendNotebook'),
    btnConfirmPdfNewNotebook: document.getElementById('btnConfirmPdfNewNotebook'),
    // Modale LaTeX
    modalLatexEditor: document.getElementById('modalLatexEditor'),
    btnCloseLatexModal: document.getElementById('btnCloseLatexModal'),
    btnCancelLatexModal: document.getElementById('btnCancelLatexModal'),
    btnConfirmLatexModal: document.getElementById('btnConfirmLatexModal'),
    inputLatexCode: document.getElementById('inputLatexCode'),
    latexLivePreview: document.getElementById('latexLivePreview'),
    latexQuickSymbols: document.querySelectorAll('#latexQuickSymbols [data-insert]'),
    latexPresetTemplates: document.querySelectorAll('#latexPresetTemplates [data-template]'),
    // Modale Reconnaissance
    modalRecognition: document.getElementById('modalRecognition'),
    btnCloseRecognitionModal: document.getElementById('btnCloseRecognitionModal'),
    recogSnapshotCanvas: document.getElementById('recogSnapshotCanvas'),
    inputRecognizedText: document.getElementById('inputRecognizedText'),
    inputRecognizedLatex: document.getElementById('inputRecognizedLatex'),
    recogLatexPreview: document.getElementById('recogLatexPreview'),
    btnCopyRecognizedLatex: document.getElementById('btnCopyRecognizedLatex'),
    btnInsertRecognizedText: document.getElementById('btnInsertRecognizedText'),
    btnReplaceWithText: document.getElementById('btnReplaceWithText'),
    btnReplaceWithLatex: document.getElementById('btnReplaceWithLatex'),
    // Autres modales
    modalNewNotebook: document.getElementById('modalNewNotebook'),
    btnCloseNotebookModal: document.getElementById('btnCloseNotebookModal'),
    btnCancelNotebookModal: document.getElementById('btnCancelNotebookModal'),
    btnCreateNotebookConfirm: document.getElementById('btnCreateNotebookConfirm'),
    inputNotebookName: document.getElementById('inputNotebookName'),
    notebookCoverSwatches: document.querySelectorAll('#notebookCoverSwatches .color-swatch'),
    selectDefaultPaper: document.getElementById('selectDefaultPaper'),
    modalDesktopInfo: document.getElementById('modalDesktopInfo'),
    btnCloseDesktopModal: document.getElementById('btnCloseDesktopModal'),
    btnOkDesktopModal: document.getElementById('btnOkDesktopModal'),
    modalRenameItem: document.getElementById('modalRenameItem'),
    modalRenameTitle: document.getElementById('modalRenameTitle'),
    inputRenameValue: document.getElementById('inputRenameValue'),
    btnCloseRenameModal: document.getElementById('btnCloseRenameModal'),
    btnCancelRenameModal: document.getElementById('btnCancelRenameModal'),
    btnConfirmRenameModal: document.getElementById('btnConfirmRenameModal'),
    toastContainer: document.getElementById('toastContainer')
  };

  const ctx = dom.inkCanvas.getContext('2d');
  const activeCtx = dom.activeInkCanvas ? dom.activeInkCanvas.getContext('2d') : null;
  const bgCtx = dom.pdfBgCanvas ? dom.pdfBgCanvas.getContext('2d', { alpha: false }) : null;

  const renderPerfStats = {
    staticRenderCount: 0,
    activeRenderCount: 0,
    mergedStrokesCount: 0,
    lastStaticRenderMs: 0,
    lastActiveRenderMs: 0
  };

  // ============================================================================
  // 8. GESTION DES PAGES, NETTOYAGE D'ÉTAT & HISTORIQUE UNDO / REDO ROBUSTE
  // ============================================================================

  function getActiveNotebook() { return state.notebooks.find((n) => n.id === state.activeNotebookId) || null; }
  function getActiveNotebookPages() {
    const list = state.pagesByNotebook.get(state.activeNotebookId) || [];
    return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  function getActivePage() {
    const pages = getActiveNotebookPages();
    return pages.find((p) => p.id === state.activePageId) || pages[0] || null;
  }
  function cloneStrokeFast(s) {
    const pts = s.points ? new Array(s.points.length) : [];
    if (s.points) {
      for (let i = 0; i < s.points.length; i++) {
        const p = s.points[i];
        pts[i] = {
          x: p.x,
          y: p.y,
          pressure: p.pressure,
          tiltX: p.tiltX || 0,
          tiltY: p.tiltY || 0,
          t: p.t
        };
      }
    }
    const copy = {
      id: s.id,
      tool: s.tool,
      penStyle: s.penStyle || 'fountain',
      lineStyle: s.lineStyle || 'solid',
      color: s.color,
      size: s.size,
      smoothing: s.smoothing,
      tipSharpness: s.tipSharpness,
      pressureSensitivity: s.pressureSensitivity,
      _liveStabilized: s._liveStabilized,
      pressureMode: s.pressureMode,
      simulatePressure: s.simulatePressure,
      recognizedSymbol: s.recognizedSymbol,
      recognizedGroup: s.recognizedGroup,
      points: pts,
      _bounds: s._bounds ? { ...s._bounds } : null,
      _renderMode: s._renderMode
    };
    const existingCache = strokePathCache.get(s);
    if (existingCache) {
      strokePathCache.set(copy, existingCache);
    }
    return copy;
  }

  function clonePageContent(page) {
    if (!page) return { strokes: [], shapes: [], texts: [], tapes: [], images: [] };
    return {
      strokes: (page.strokes || []).map(cloneStrokeFast),
      shapes: (page.shapes || []).map((sh) => ({
        ...sh,
        vertices: Array.isArray(sh.vertices) ? sh.vertices.map((v) => ({ x: v.x, y: v.y })) : undefined,
        startConnection: sh.startConnection ? { ...sh.startConnection } : undefined,
        endConnection: sh.endConnection ? { ...sh.endConnection } : undefined
      })),
      texts: (page.texts || []).map((tb) => ({
        ...tb,
        frameStyle: tb.frameStyle ? { ...tb.frameStyle } : undefined
      })),
      tapes: (page.tapes || []).map((tp) => ({
        ...tp,
        points: Array.isArray(tp.points) ? tp.points.map((p) => ({ x: p.x, y: p.y })) : undefined
      })),
      images: (page.images || []).map((img) => ({ ...img }))
    };
  }
  function getPageHistory(pageId) {
    if (!state.historyByPage.has(pageId)) state.historyByPage.set(pageId, { undoStack: [], redoStack: [] });
    return state.historyByPage.get(pageId);
  }
  function pushHistorySnapshot(targetPage = getActivePage()) {
    const page = targetPage || getActivePage();
    if (!page || !page.id) return;
    const hist = getPageHistory(page.id);
    hist.undoStack.push(clonePageContent(page));
    if (hist.undoStack.length > 60) hist.undoStack.shift();
    hist.redoStack = [];
    updateUndoRedoButtons();
  }

  /**
   * Si un trait ou une forme est en cours de tracé au moment où l'utilisateur change de page ou de cahier,
   * valide proprement ce trait sur la page d'origine et déclenche sa sauvegarde avant la bascule.
   */
  function finalizeActiveDrawingOnCurrentPage() {
    if (!state.isDrawing) return false;
    const page = getActivePage();
    let committed = false;
    if (page) {
      if ((state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter') && state.currentStroke) {
        if (state.currentStrokeSnappedFromAutoShape && state.currentShape) {
          const snapped = state.currentShape;
          delete snapped.detectedName;
          page.shapes.push(snapped);
          committed = true;
        } else if (Array.isArray(state.currentStroke.points) && state.currentStroke.points.length > 0) {
          if (state.currentStroke.points.length === 1) {
            const p0 = state.currentStroke.points[0];
            state.currentStroke.points.push({ x: p0.x + 0.2, y: p0.y + 0.2, pressure: p0.pressure });
          }
          invalidateStrokeCache(state.currentStroke);
          page.strokes.push(state.currentStroke);
          committed = true;
        }
      } else if (state.tool === 'tape' && state.currentTape) {
        if (getTapeTotalLength(state.currentTape) > 10) {
          if (!Array.isArray(page.tapes)) page.tapes = [];
          page.tapes.push(state.currentTape);
          invalidateStaticInkCache();
          committed = true;
        }
        state.currentTape = null;
      } else if (state.tool === 'shape' && state.currentShape) {
        if (Math.hypot(state.currentShape.x2 - state.currentShape.x1, state.currentShape.y2 - state.currentShape.y1) > 4) {
          page.shapes.push(state.currentShape);
          committed = true;
        }
      } else if (state.tool === 'eraser') {
        committed = true;
      }
      if (committed) {
        scheduleSaveActivePage(page);
      }
    }
    cleanupTransientInteractionState(false);
    return committed;
  }

  /**
   * Nettoie tous les états transitoires d'interaction (timers, pointeurs, captures, roue de couleurs, survols)
   */
  function cleanupTransientInteractionState(commitStrokeFirst = false) {
    if (commitStrokeFirst && state.isDrawing) {
      finalizeActiveDrawingOnCurrentPage();
      return;
    }
    cancelHoldShapeTimer();
    cancelColorWheelTimer();
    if (state.colorWheelOpen) closeRadialColorWheel(false);
    if (state.activePointerId !== null && dom.inkCanvas) {
      try { dom.inkCanvas.releasePointerCapture(state.activePointerId); } catch (_) {}
    }
    if (state.deselectTapPointerId !== null && dom.inkCanvas) {
      try { dom.inkCanvas.releasePointerCapture(state.deselectTapPointerId); } catch (_) {}
    }
    state.deselectTapPointerId = null;
    state.isDrawing = false;
    state.isPanning = false;
    state.isPinching = false;
    state.activePointerId = null;
    state.currentStroke = null;
    state.currentShape = null;
    state.currentStrokeSnappedFromAutoShape = false;
    state.holdShapeAnchorScreen = null;
    state.colorWheelAnchorScreen = null;
    state.lassoButtonDownTime = 0;
    state.lassoButtonDownPos = null;
    state.lassoButtonMaxTravel = 0;
    state.lastLassoButtonClickTime = 0;
    state.lastLassoButtonClickPos = null;
    if (typeof commitPendingLassoMoveDelta === 'function') commitPendingLassoMoveDelta();
    state.lassoPolygon = [];
    state.lassoAction = null;
    state.lassoLiveMoveDelta = null;
    state.lassoInitialSnapshot = null;
    state.lassoInitialBounds = null;
    state.lassoDragStartWorld = null;
    state.touchPoints.clear();
    if (typeof resetPullToAddState === 'function') resetPullToAddState();
    if (dom.canvasViewport) dom.canvasViewport.classList.remove('panning');
    if (dom.eraserCursor) dom.eraserCursor.style.display = 'none';
    if (dom.colorDotCursor) dom.colorDotCursor.style.display = 'none';
    state.shapeHoverConnection = null;
    state.selectedShapeId = null;
    state.shapeEditDrag = null;
    state.pendingShapeTapCandidateId = null;
    state.pendingShapeTapStartScreen = null;
    state.eraserGestureActive = false;
    state.eraserHistoryPushed = false;
    state.lastEraserWorldPt = null;
    setCanvasInteractingClass(false);
    if (dom.shapeEditFloatingBar) dom.shapeEditFloatingBar.classList.add('hidden');
    if (state.temporaryEraserOverride) {
      state.temporaryEraserOverride = false;
      state.tool = state.previousToolBeforeEraser || 'pen';
    }
    if (state.temporaryLassoOverride) {
      state.temporaryLassoOverride = false;
      state.tool = state.previousToolBeforeLasso || 'pen';
    }
  }

  function setCanvasInteractingClass(active) {
    const on = Boolean(active);
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.toggle('is-canvas-interacting', on);
    }
  }

  // Restaure l'outil d'origine si un outil temporaire du stylet (gomme/lasso) est resté actif sans geste en cours
  // (ex. bouton pressé en survol hors de la page A4/PDF puis relâché)
  function releaseStaleTemporaryPenTool(e) {
    if (state.isDrawing || !e || e.pointerType !== 'pen') return;
    let changed = false;
    if (state.temporaryEraserOverride && !isPenEraserButton(e)) {
      state.temporaryEraserOverride = false;
      state.tool = state.previousToolBeforeEraser || 'pen';
      changed = true;
    }
    if (state.temporaryLassoOverride && !isPenLassoButton(e)) {
      finalizeLassoButtonClickTracking(e, true);
      state.temporaryLassoOverride = false;
      state.tool = state.previousToolBeforeLasso || 'pen';
      changed = true;
    }
    if (changed) updateToolbarActiveState();
  }

  function isKeyboardTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.isContentEditable);
  }
  function getOpenModalBackdrops() {
    return Array.from(document.querySelectorAll('.modal-backdrop:not(.hidden), .gn-tpl-backdrop:not(.hidden)'))
      .filter((el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0);
  }
  function isAnyModalOpen() {
    return getOpenModalBackdrops().length > 0;
  }
  // Ferme la dernière fenêtre modale ouverte via son bouton Fermer/Annuler (garde la logique propre à chaque modale)
  function closeTopOpenModal(preferredBackdrop = null) {
    const open = getOpenModalBackdrops().filter((el) => el.classList.contains('modal-backdrop'));
    if (!open.length) return false;
    const top = (preferredBackdrop && open.includes(preferredBackdrop)) ? preferredBackdrop : open[open.length - 1];
    const closeBtn = top.querySelector('[id^="btnClose"], [id^="btnCancel"], .modal-close, [data-close], [aria-label="Fermer"]');
    if (closeBtn) closeBtn.click();
    else top.classList.add('hidden');
    return true;
  }

  let isUndoRedoBusy = false;
  function performUndo() {
    if (isUndoRedoBusy) return false;
    const page = getActivePage();
    if (!page || !page.id) return false;
    if (state.isDrawing) {
      cleanupTransientInteractionState(false);
    }
    const hist = getPageHistory(page.id);
    if (!hist || hist.undoStack.length === 0) {
      updateUndoRedoButtons();
      return false;
    }
    isUndoRedoBusy = true;
    try {
      const prev = hist.undoStack.pop();
      if (!prev) {
        updateUndoRedoButtons();
        return false;
      }
      hist.redoStack.push(clonePageContent(page));
      if (hist.redoStack.length > 60) hist.redoStack.shift();
      const restored = clonePageContent(prev);
      page.strokes = restored.strokes;
      page.shapes = restored.shapes;
      page.texts = restored.texts;
      page.tapes = restored.tapes;
      page.images = restored.images;
      invalidateStaticInkCache();
      clearLassoSelection();
      updateUndoRedoButtons();
      renderWorldTextCards();
      requestRender();
      if (dom.leftSidebar && dom.sectionPages && !dom.leftSidebar.classList.contains('collapsed') && !dom.sectionPages.classList.contains('hidden')) {
        page.thumbnail = generatePageThumbnail(page);
        updateSingleSidebarThumbnailDom(page);
      }
      scheduleSaveActivePage(page);
      return true;
    } finally {
      isUndoRedoBusy = false;
    }
  }

  function performRedo() {
    if (isUndoRedoBusy) return false;
    const page = getActivePage();
    if (!page || !page.id) return false;
    if (state.isDrawing) {
      cleanupTransientInteractionState(false);
    }
    const hist = getPageHistory(page.id);
    if (!hist || hist.redoStack.length === 0) {
      updateUndoRedoButtons();
      return false;
    }
    isUndoRedoBusy = true;
    try {
      const next = hist.redoStack.pop();
      if (!next) {
        updateUndoRedoButtons();
        return false;
      }
      hist.undoStack.push(clonePageContent(page));
      if (hist.undoStack.length > 60) hist.undoStack.shift();
      const restored = clonePageContent(next);
      page.strokes = restored.strokes;
      page.shapes = restored.shapes;
      page.texts = restored.texts;
      page.tapes = restored.tapes;
      page.images = restored.images;
      invalidateStaticInkCache();
      clearLassoSelection();
      updateUndoRedoButtons();
      renderWorldTextCards();
      requestRender();
      if (dom.leftSidebar && dom.sectionPages && !dom.leftSidebar.classList.contains('collapsed') && !dom.sectionPages.classList.contains('hidden')) {
        page.thumbnail = generatePageThumbnail(page);
        updateSingleSidebarThumbnailDom(page);
      }
      scheduleSaveActivePage(page);
      return true;
    } finally {
      isUndoRedoBusy = false;
    }
  }

  function updateUndoRedoButtons() {
    const page = getActivePage();
    if (!page) {
      if (dom.btnUndo) dom.btnUndo.disabled = true;
      if (dom.btnRedo) dom.btnRedo.disabled = true;
      return;
    }
    const hist = getPageHistory(page.id);
    if (dom.btnUndo) dom.btnUndo.disabled = hist.undoStack.length === 0;
    if (dom.btnRedo) dom.btnRedo.disabled = hist.redoStack.length === 0;
  }

  // ============================================================================
  // 9. COORDONNÉES MONDE, ZOOM FLUIDE, PINCEMENT & TRANSFORMATIONS
  // ============================================================================

  let cachedViewportRect = null;
  function invalidateViewportRectCache() {
    cachedViewportRect = null;
  }
  function getCachedViewportRect() {
    if (!cachedViewportRect || !(cachedViewportRect.width > 0) || !(cachedViewportRect.height > 0)) {
      const target = dom.canvasViewport || dom.inkCanvas;
      cachedViewportRect = target ? target.getBoundingClientRect() : { left: 0, top: 0, width: 1200, height: 800 };
    }
    return cachedViewportRect;
  }

  function screenToWorld(clientX, clientY) {
    const rect = getCachedViewportRect();
    return {
      x: (clientX - rect.left - state.panX) / state.zoom,
      y: (clientY - rect.top - state.panY) / state.zoom
    };
  }

  let lastAppliedWorldTransform = '';
  function syncWorldLayerTransform() {
    if (dom.worldObjectsLayer) {
      const nextTransform = `translate3d(${state.panX}px, ${state.panY}px, 0) scale(${state.zoom})`;
      if (nextTransform !== lastAppliedWorldTransform) {
        lastAppliedWorldTransform = nextTransform;
        dom.worldObjectsLayer.style.transform = nextTransform;
      }
    }
  }

  let isZoomInteracting = false;
  let zoomSettleTimer = null;
  let panInertiaFrame = null;
  let viewportAnimFrame = null;
  const panVelocitySamples = [];

  function stopViewportAnimations() {
    if (panInertiaFrame) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(panInertiaFrame);
      else clearTimeout(panInertiaFrame);
      panInertiaFrame = null;
    }
    if (viewportAnimFrame) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(viewportAnimFrame);
      else clearTimeout(viewportAnimFrame);
      viewportAnimFrame = null;
    }
    panVelocitySamples.length = 0;
  }

  function recordPanVelocitySample(clientX, clientY, nowMs = performance.now()) {
    panVelocitySamples.push({ x: clientX, y: clientY, t: nowMs });
    while (panVelocitySamples.length > 2 && nowMs - panVelocitySamples[0].t > 70) {
      panVelocitySamples.shift();
    }
  }

  const PAGE_STACK_GAP = 36;

  function getBoundedDeskBackdropColor() {
    const isAppDark = typeof document !== 'undefined' &&
      document.documentElement &&
      typeof document.documentElement.getAttribute === 'function' &&
      document.documentElement.getAttribute('data-theme') === 'dark';
    return isAppDark ? '#1d1f25' : '#e6e5e4';
  }

  function isBoundedPage(page) {
    if (!page) return false;
    return (page.viewMode && page.viewMode !== 'infinite') || Boolean(page.pdfId || page.isPdfPage);
  }

  function getPageBounds(page) {
    const pw = (page && Number.isFinite(page.pdfWidth) && page.pdfWidth > 0)
      ? page.pdfWidth
      : ((page && Number.isFinite(page.pageWidth) && page.pageWidth > 0) ? page.pageWidth : PAGE_WIDTH);
    const ph = (page && Number.isFinite(page.pdfHeight) && page.pdfHeight > 0)
      ? page.pdfHeight
      : ((page && Number.isFinite(page.pageHeight) && page.pageHeight > 0) ? page.pageHeight : PAGE_HEIGHT);
    return { minX: 0, minY: 0, maxX: pw, maxY: ph, width: pw, height: ph };
  }

  function getBoundedStackInfo(refPage = getActivePage()) {
    if (!isBoundedPage(refPage)) return null;
    const allPages = getActiveNotebookPages();
    const boundedPages = allPages.filter((p) => isBoundedPage(p));
    const list = boundedPages.length > 0 ? boundedPages : [refPage];
    let maxW = 0;
    for (let i = 0; i < list.length; i++) {
      const b = getPageBounds(list[i]);
      if (b.width > maxW) maxW = b.width;
    }
    const items = [];
    let curY = 0;
    let activeIdx = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const b = getPageBounds(p);
      const xOffset = Math.round((maxW - b.width) * 0.5);
      items.push({ page: p, index: i, width: b.width, height: b.height, xOffset, yOffset: curY, relX: 0, relY: 0 });
      if (p.id === refPage.id) activeIdx = i;
      curY += b.height + PAGE_STACK_GAP;
    }
    const totalHeight = Math.max(0, curY - PAGE_STACK_GAP);
    const activeItem = items[activeIdx] || items[0];
    for (let i = 0; i < items.length; i++) {
      items[i].relX = items[i].xOffset - activeItem.xOffset;
      items[i].relY = items[i].yOffset - activeItem.yOffset;
    }
    return {
      items,
      activeIdx,
      activeItem,
      maxWidth: maxW,
      totalHeight,
      minRelY: -activeItem.yOffset,
      maxRelY: totalHeight - activeItem.yOffset
    };
  }

  function findStackPageAtWorldPoint(wx, wy, margin = 4) {
    const stack = getBoundedStackInfo(getActivePage());
    if (!stack) return null;
    for (let i = 0; i < stack.items.length; i++) {
      const it = stack.items[i];
      if (
        wx >= it.relX - margin &&
        wx <= it.relX + it.width + margin &&
        wy >= it.relY - margin &&
        wy <= it.relY + it.height + margin
      ) {
        return it;
      }
    }
    return null;
  }

  function switchActivePageInStack(targetPageId) {
    const curPage = getActivePage();
    if (!curPage || !targetPageId || curPage.id === targetPageId) return false;
    const stack = getBoundedStackInfo(curPage);
    if (!stack) return false;
    const targetItem = stack.items.find((it) => it.page.id === targetPageId);
    if (!targetItem) return false;

    const shiftX = targetItem.relX * state.zoom;
    const shiftY = targetItem.relY * state.zoom;
    state.panX += shiftX;
    state.panY += shiftY;
    if (state.isPanning && state.panStartOffset) {
      state.panStartOffset.x += shiftX;
      state.panStartOffset.y += shiftY;
    }
    if (staticInkCache.valid && staticInkCache.zoom > 0) {
      staticInkCache.originPanX += targetItem.relX * staticInkCache.zoom;
      staticInkCache.originPanY += targetItem.relY * staticInkCache.zoom;
      staticInkCache.pageId = targetPageId;
      staticInkCache.effectiveDark = !targetItem.page.pdfId && (targetItem.page.paperTone === 'dark' || targetItem.page.paperTone === 'blueprint');
    }

    state.activePageId = targetPageId;
    ensureActiveAndAdjacentPdfPagesLoaded(targetItem.page);
    renderPagesSidebar();
    updateUndoRedoButtons();
    renderWorldTextCards();
    syncWorldLayerTransform();
    return true;
  }

  function syncActivePageFromStackViewport() {
    if (state.isDrawing || state.currentStroke || state.currentShape || hasAnyLassoSelection()) return false;
    const curPage = getActivePage();
    const stack = getBoundedStackInfo(curPage);
    if (!stack || stack.items.length <= 1 || !dom.canvasViewport) return false;
    const rect = dom.canvasViewport.getBoundingClientRect();
    if (!rect || rect.height <= 0) return false;
    const viewProbeY = (rect.height * 0.45 - state.panY) / state.zoom;
    let bestItem = stack.activeItem;
    let bestDist = Infinity;
    for (let i = 0; i < stack.items.length; i++) {
      const it = stack.items[i];
      if (viewProbeY >= it.relY - PAGE_STACK_GAP * 0.5 && viewProbeY <= it.relY + it.height + PAGE_STACK_GAP * 0.5) {
        bestItem = it;
        break;
      }
      const center = it.relY + it.height * 0.5;
      const d = Math.abs(viewProbeY - center);
      if (d < bestDist) {
        bestDist = d;
        bestItem = it;
      }
    }
    if (bestItem && bestItem.page.id !== state.activePageId) {
      return switchActivePageInStack(bestItem.page.id);
    }
    return false;
  }

  function isPointInsidePage(page, x, y, margin = 0) {
    if (!isBoundedPage(page)) return true;
    const b = getPageBounds(page);
    return x >= -margin && x <= b.maxX + margin && y >= -margin && y <= b.maxY + margin;
  }

  function clampPointToPage(page, pt) {
    if (!pt || !isBoundedPage(page)) return pt;
    const b = getPageBounds(page);
    return {
      x: Math.max(0, Math.min(b.maxX, pt.x)),
      y: Math.max(0, Math.min(b.maxY, pt.y))
    };
  }

  function intersectSegmentWithRect(p0, p1, maxX, maxY) {
    // Algorithme de Liang-Barsky pour trouver l'intersection exacte avec [0, maxX] x [0, maxY]
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    let t0 = 0;
    let t1 = 1;
    const checks = [
      [-dx, p0.x],
      [dx, maxX - p0.x],
      [-dy, p0.y],
      [dy, maxY - p0.y]
    ];
    for (let i = 0; i < 4; i++) {
      const p = checks[i][0];
      const q = checks[i][1];
      if (Math.abs(p) < 1e-9) {
        if (q < 0) return null;
      } else {
        const r = q / p;
        if (p < 0) {
          if (r > t1) return null;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return null;
          if (r < t1) t1 = r;
        }
      }
    }
    return {
      entry: { x: p0.x + t0 * dx, y: p0.y + t0 * dy },
      exit: { x: p0.x + t1 * dx, y: p0.y + t1 * dy }
    };
  }

  function getBoundedFitHeightZoom(page) {
    const rect = dom.canvasViewport ? dom.canvasViewport.getBoundingClientRect() : null;
    const b = getPageBounds(page);
    if (!rect || rect.width <= 0 || rect.height <= 0) return 0.72;
    const topSafe = 58;
    const bottomPad = 14;
    const availW = Math.max(200, rect.width - 28);
    const availH = Math.max(200, rect.height - topSafe - bottomPad);
    return Math.min(availW / b.width, availH / b.height);
  }

  function snapBackBoundedViewportIfZoomedOut() {
    const page = getActivePage();
    if (!isBoundedPage(page) || !dom.canvasViewport) return false;
    const rect = dom.canvasViewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const fitZoom = getBoundedFitHeightZoom(page);
    const b = getPageBounds(page);
    const topSafe = 58;
    const bottomPad = 14;
    const scaledH = b.height * state.zoom;
    const availH = rect.height - topSafe - bottomPad;
    // Si la feuille est dézoomée plus petite que la hauteur haut-bas de l'écran, on rezoome automatiquement pour la recaler haut & bas
    if (state.zoom < fitZoom - 0.004 || scaledH < availH - 2) {
      const targetZoom = Math.max(fitZoom, state.zoom);
      const targetPanX = Math.round((rect.width - b.width * targetZoom) / 2);
      const targetPanY = Math.round(topSafe + Math.max(0, (availH - b.height * targetZoom) / 2));
      animateViewportTo(targetZoom, targetPanX, targetPanY, 220);
      return true;
    }
    return false;
  }

  function getViewportZoomLimits(page) {
    if (isBoundedPage(page)) {
      const fitZoom = getBoundedFitHeightZoom(page);
      // Légère élasticité pendant le pincement/molette (70% du fitZoom), puis rebond automatique vers fitZoom au relâchement
      const minZoom = Math.max(0.25, fitZoom * 0.70);
      return { minZoom, maxZoom: 4.5 };
    }
    return { minZoom: 0.35, maxZoom: 4.5 };
  }

  const GN_PULL_TO_ADD_THRESHOLD_PX = 128;
  const GN_PULL_TO_ADD_MAX_VISUAL_PX = 132;
  const GN_PULL_TO_ADD_RUBBER_FACTOR = 0.54;

  function getBoundedVerticalScrollLimits(zoom, page) {
    const rect = dom.canvasViewport ? dom.canvasViewport.getBoundingClientRect() : null;
    if (!rect || rect.width <= 0 || rect.height <= 0 || !isBoundedPage(page)) return null;
    const vw = rect.width;
    const vh = rect.height;
    const topSafe = 58;
    const bottomPad = 24;
    const b = getPageBounds(page);
    const stack = getBoundedStackInfo(page);
    if (stack && stack.items.length > 1) {
      const scaledW = stack.maxWidth * zoom;
      const scaledTotalH = stack.totalHeight * zoom;
      const availH = vh - topSafe - bottomPad;
      if (scaledTotalH <= availH) {
        const centerY = Math.round(topSafe + (availH - scaledTotalH) / 2 - stack.minRelY * zoom);
        return { minPanY: centerY, maxPanY: centerY, scaledW, scaledH: scaledTotalH, vw, vh, topSafe, bottomPad, pageBounds: b, stack };
      }
      return {
        minPanY: Math.round(vh - bottomPad - stack.maxRelY * zoom),
        maxPanY: Math.round(topSafe + 16 - stack.minRelY * zoom),
        scaledW,
        scaledH: scaledTotalH,
        vw,
        vh,
        topSafe,
        bottomPad,
        pageBounds: b,
        stack
      };
    }
    const scaledW = b.width * zoom;
    const scaledH = b.height * zoom;
    const availH = vh - topSafe - bottomPad;
    if (scaledH <= availH) {
      const centerY = Math.round(topSafe + (availH - scaledH) / 2);
      return { minPanY: centerY, maxPanY: centerY, scaledW, scaledH, vw, vh, topSafe, bottomPad, pageBounds: b, stack };
    }
    return {
      minPanY: Math.round(vh - scaledH - bottomPad),
      maxPanY: topSafe + 16,
      scaledW,
      scaledH,
      vw,
      vh,
      topSafe,
      bottomPad,
      pageBounds: b,
      stack
    };
  }

  function resetPullToAddState() {
    if (!state.pullToAdd) return;
    if (state.pullToAdd.wheelTimer) {
      clearTimeout(state.pullToAdd.wheelTimer);
      state.pullToAdd.wheelTimer = null;
    }
    state.pullToAdd.active = false;
    state.pullToAdd.direction = null;
    state.pullToAdd.action = null;
    state.pullToAdd.percentage = 0;
    state.pullToAdd.visualOffset = 0;
    state.pullToAdd.rawExcess = 0;
    state.pullToAdd.source = null;
    const banner = document.getElementById('gnPullToAddBanner');
    if (banner) banner.classList.add('hidden');
  }

  function updatePullToAddBannerUi() {
    const banner = document.getElementById('gnPullToAddBanner');
    const inner = document.getElementById('gnPtaInner');
    const ringActive = document.getElementById('gnPtaRingActive');
    const label = document.getElementById('gnPtaLabel');
    if (!banner || !inner || !ringActive || !label) return;
    const pta = state.pullToAdd;
    const page = getActivePage();
    if (!pta || !pta.active || !isBoundedPage(page)) {
      banner.classList.add('hidden');
      return;
    }
    const limits = getBoundedVerticalScrollLimits(state.zoom, page);
    if (!limits) {
      banner.classList.add('hidden');
      return;
    }
    // Formules exactes issues de GoodNotes (PullToAddDecorator: shouldReleaseToAdd = p > 1, clipPath = p^3 * 100%)
    const pct = Math.max(0, pta.percentage);
    const ready = pct > 1.0;
    const clipPct = Math.min(Math.round(100 * Math.pow(pct, 3)), 100);
    const isTop = pta.direction === 'top';

    banner.classList.remove('hidden');
    inner.classList.toggle('is-ready', ready);
    inner.classList.toggle('dir-top', isTop);
    if (ringActive.style) {
      ringActive.style.clipPath = `polygon(0 0, 100% 0, 100% ${clipPct}%, 0% ${clipPct}%)`;
    }
    if (pta.action === 'add') {
      label.textContent = ready ? 'Relâcher pour ajouter une page' : 'Tirer pour ajouter une page';
    } else if (pta.action === 'next') {
      label.textContent = ready ? 'Relâcher pour la page suivante' : 'Tirer pour la page suivante';
    } else {
      label.textContent = ready ? 'Relâcher pour la page précédente' : 'Tirer pour la page précédente';
    }

    const pageCenterX = Math.max(115, Math.min(limits.vw - 115, state.panX + limits.scaledW * 0.5));
    const stackBottomWorldY = limits.stack ? limits.stack.maxRelY : limits.pageBounds.height;
    const pageBottomY = state.panY + stackBottomWorldY * state.zoom;
    const bannerTop = isTop
      ? Math.max(limits.topSafe + 8, Math.min(limits.vh - 116, state.panY - 102))
      : Math.max(limits.topSafe + 16, Math.min(limits.vh - 108, pageBottomY + 14));
    if (banner.style) {
      banner.style.left = `${Math.round(pageCenterX)}px`;
      banner.style.top = `${Math.round(bannerTop)}px`;
      banner.style.opacity = String(Math.max(0.12, Math.min(1, pct * 2.2)));
    }
  }

  function applyBoundedPanWithPullToAdd(rawPanX, rawPanY, source = 'pan') {
    const page = getActivePage();
    if (!isBoundedPage(page)) {
      const clamped = clampViewportPan(rawPanX, rawPanY, state.zoom, page);
      state.panX = clamped.panX;
      state.panY = clamped.panY;
      resetPullToAddState();
      return;
    }
    const limits = getBoundedVerticalScrollLimits(state.zoom, page);
    if (!limits) return;
    const clampedX = clampViewportPan(rawPanX, limits.minPanY, state.zoom, page).panX;

    // En défilement vertical continu multi-pages : le "Tirer pour ajouter une page" se déclenche en bas de la DERNIÈRE page
    if (rawPanY < limits.minPanY) {
      const rawExcess = limits.minPanY - rawPanY;
      const visualOffset = Math.min(GN_PULL_TO_ADD_MAX_VISUAL_PX, rawExcess * GN_PULL_TO_ADD_RUBBER_FACTOR);
      const percentage = rawExcess / GN_PULL_TO_ADD_THRESHOLD_PX;
      state.panX = clampedX;
      state.panY = limits.minPanY - visualOffset;
      state.pullToAdd.active = rawExcess > 2;
      state.pullToAdd.direction = 'bottom';
      state.pullToAdd.action = 'add';
      state.pullToAdd.rawExcess = rawExcess;
      state.pullToAdd.visualOffset = visualOffset;
      state.pullToAdd.percentage = percentage;
      state.pullToAdd.source = source;
      updatePullToAddBannerUi();
      return;
    }

    state.panX = clampedX;
    state.panY = Math.max(limits.minPanY, Math.min(limits.maxPanY, rawPanY));
    if (state.pullToAdd.active) resetPullToAddState();
    syncActivePageFromStackViewport();
  }

  function positionBoundedPageAfterTransition(align = 'top') {
    const page = getActivePage();
    if (!isBoundedPage(page) || !dom.canvasViewport) return;
    const limits = getBoundedVerticalScrollLimits(state.zoom, page);
    if (!limits) {
      fitPageToViewport(false);
      return;
    }
    const targetPanX = limits.scaledW <= limits.vw - 24
      ? Math.round((limits.vw - limits.scaledW) / 2)
      : clampViewportPan(state.panX, limits.topSafe + 16, state.zoom, page).panX;
    const pageTopPanY = Math.max(limits.minPanY, Math.min(limits.maxPanY, limits.topSafe + 16));
    const pageBottomPanY = Math.max(limits.minPanY, Math.min(limits.maxPanY, Math.round(limits.vh - limits.pageBounds.height * state.zoom - limits.bottomPad)));
    const targetPanY = align === 'bottom' ? pageBottomPanY : pageTopPanY;
    const slideOffset = align === 'bottom' ? -48 : 48;
    state.panX = targetPanX;
    state.panY = targetPanY + slideOffset;
    syncWorldLayerTransform();
    requestRender();
    animateViewportTo(state.zoom, targetPanX, targetPanY, 220);
  }

  function commitOrResetPullToAdd() {
    const pta = state.pullToAdd;
    if (!pta || !pta.active) return false;
    const { direction, action, percentage } = pta;
    resetPullToAddState();

    const page = getActivePage();
    if (!isBoundedPage(page)) return false;

    if (percentage > 1.0 && !pta.isCommitting) {
      const pages = getActiveNotebookPages();
      const curIdx = pages.findIndex((p) => p.id === state.activePageId);
      if (action === 'add') {
        pta.isCommitting = true;
        Promise.resolve(paidAddPage({ fromPullToAdd: true })).catch(() => {}).finally(() => {
          state.pullToAdd.isCommitting = false;
        });
        return true;
      }
      if (action === 'next' && curIdx >= 0 && curIdx < pages.length - 1) {
        selectPage(pages[curIdx + 1].id);
        positionBoundedPageAfterTransition('top');
        return true;
      }
      if (action === 'prev' && curIdx > 0) {
        selectPage(pages[curIdx - 1].id);
        positionBoundedPageAfterTransition('bottom');
        return true;
      }
    }

    // Retour élastique doux vers le bord de la feuille si le seuil n'est pas atteint
    const limits = getBoundedVerticalScrollLimits(state.zoom, page);
    if (limits) {
      const snapY = direction === 'top' ? limits.maxPanY : limits.minPanY;
      animateViewportTo(state.zoom, state.panX, snapY, 200);
    }
    return true;
  }

  function clampViewportPan(panX, panY, zoom, page) {
    const rect = dom.canvasViewport ? dom.canvasViewport.getBoundingClientRect() : null;
    if (!rect || rect.width <= 0 || rect.height <= 0) return { panX, panY };
    const vw = rect.width;
    const vh = rect.height;
    const topSafe = 58;

    if (isBoundedPage(page)) {
      const b = getPageBounds(page);
      const scaledW = b.width * zoom;
      let clampedX = panX;

      if (scaledW <= vw - 32) {
        const centerX = (vw - scaledW) / 2;
        const slackX = Math.min(120, vw * 0.16);
        clampedX = Math.max(centerX - slackX, Math.min(centerX + slackX, panX));
      } else {
        const marginX = Math.min(140, vw * 0.18);
        const minPanX = vw - scaledW - marginX;
        const maxPanX = marginX;
        clampedX = Math.max(minPanX, Math.min(maxPanX, panX));
      }

      const vLimits = getBoundedVerticalScrollLimits(zoom, page);
      const clampedY = vLimits
        ? Math.max(vLimits.minPanY, Math.min(vLimits.maxPanY, panY))
        : panY;
      return { panX: clampedX, panY: clampedY };
    }

    // Mode page infinie : borne raisonnable autour de l'origine et du contenu existant (±1400 px)
    let minWX = 0, minWY = 0, maxWX = PAGE_WIDTH, maxWY = PAGE_HEIGHT;
    if (page && Array.isArray(page.strokes)) {
      for (let i = 0; i < page.strokes.length; i++) {
        const sb = getCachedStrokeBounds(page.strokes[i]);
        if (sb) {
          if (sb.minX < minWX) minWX = sb.minX;
          if (sb.minY < minWY) minWY = sb.minY;
          if (sb.maxX > maxWX) maxWX = sb.maxX;
          if (sb.maxY > maxWY) maxWY = sb.maxY;
        }
      }
    }
    const worldPad = 1400;
    const minPanX = vw - (maxWX + worldPad) * zoom;
    const maxPanX = -(minWX - worldPad) * zoom;
    const minPanY = vh - (maxWY + worldPad) * zoom;
    const maxPanY = topSafe - (minWY - worldPad) * zoom;
    return {
      panX: Math.max(minPanX, Math.min(maxPanX, panX)),
      panY: Math.max(minPanY, Math.min(maxPanY, panY))
    };
  }

  function startPanInertiaLoop() {
    if (panVelocitySamples.length < 2) return;
    const first = panVelocitySamples[0];
    const last = panVelocitySamples[panVelocitySamples.length - 1];
    const dt = Math.max(1, last.t - first.t);
    if (dt > 120) return;
    let vx = (last.x - first.x) / dt;
    let vy = (last.y - first.y) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.14) return;
    // Plafonne la vitesse initiale d'inertie
    const maxSpeed = 3.2;
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed;
      vy = (vy / speed) * maxSpeed;
    }
    let lastTick = performance.now();
    const step = (now) => {
      panInertiaFrame = null;
      const tickTs = typeof now === 'number' ? now : performance.now();
      const frameDt = Math.max(4, Math.min(48, tickTs - lastTick));
      lastTick = tickTs;
      const decay = Math.exp(-frameDt / 180);
      vx *= decay;
      vy *= decay;
      const dx = vx * frameDt;
      const dy = vy * frameDt;
      if (Math.hypot(dx, dy) < 0.15) {
        return;
      }
      const nextPan = clampViewportPan(state.panX + dx, state.panY + dy, state.zoom, getActivePage());
      const moved = Math.hypot(nextPan.panX - state.panX, nextPan.panY - state.panY);
      state.panX = nextPan.panX;
      state.panY = nextPan.panY;
      syncActivePageFromStackViewport();
      syncWorldLayerTransform();
      requestRender();
      if (moved < 0.1) return;
      panInertiaFrame = requestAnimationFrame(step);
    };
    panInertiaFrame = requestAnimationFrame(step);
  }

  function animateViewportTo(targetZoom, targetPanX, targetPanY, durationMs = 200) {
    stopViewportAnimations();
    const page = getActivePage();
    const { minZoom, maxZoom } = getViewportZoomLimits(page);
    const clampedZoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));
    const clampedTarget = clampViewportPan(targetPanX, targetPanY, clampedZoom, page);
    targetPanX = clampedTarget.panX;
    targetPanY = clampedTarget.panY;
    if (durationMs <= 0) {
      state.zoom = clampedZoom;
      state.panX = targetPanX;
      state.panY = targetPanY;
      if (dom.btnZoomReset) dom.btnZoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
      syncWorldLayerTransform();
      requestRender();
      scheduleHiDpiPdfCheck();
      return Promise.resolve();
    }
    const startZoom = state.zoom;
    const startPanX = state.panX;
    const startPanY = state.panY;
    const t0 = performance.now();
    isZoomInteracting = true;
    return new Promise((resolve) => {
      const step = (now) => {
        viewportAnimFrame = null;
        const ts = typeof now === 'number' ? now : performance.now();
        const rawT = Math.min(1, Math.max(0, (ts - t0) / durationMs));
        // Courbe ease-out cubique amortie GoodNotes (PagingLayoutManager fn#55284)
        const ease = 1 - Math.pow(1 - rawT, 3);
        state.zoom = startZoom + (clampedZoom - startZoom) * ease;
        state.panX = startPanX + (targetPanX - startPanX) * ease;
        state.panY = startPanY + (targetPanY - startPanY) * ease;
        if (dom.btnZoomReset) dom.btnZoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
        syncWorldLayerTransform();
        requestRender();
        if (rawT < 1) {
          viewportAnimFrame = requestAnimationFrame(step);
        } else {
          state.zoom = clampedZoom;
          state.panX = targetPanX;
          state.panY = targetPanY;
          isZoomInteracting = false;
          requestRender();
          scheduleHiDpiPdfCheck();
          resolve();
        }
      };
      viewportAnimFrame = requestAnimationFrame(step);
    });
  }

  function fitPageToViewport(animate = false) {
    stopViewportAnimations();
    const rect = dom.canvasViewport.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const page = getActivePage();
    const pw = (page && page.pdfWidth) ? page.pdfWidth : PAGE_WIDTH;
    const ph = (page && page.pdfHeight) ? page.pdfHeight : PAGE_HEIGHT;
    const availW = rect.width - 28;
    const availH = rect.height - 72;
    const targetZoom = isBoundedPage(page)
      ? Math.min(availW / pw, availH / ph)
      : Math.max(0.45, Math.min(1.08, Math.min(availW / pw, availH / ph)));
    const targetPanX = Math.round((rect.width - pw * targetZoom) / 2);
    const targetPanY = Math.max(58, Math.round(58 + Math.max(0, (rect.height - 72 - ph * targetZoom) / 2)));
    if (animate) {
      animateViewportTo(targetZoom, targetPanX, targetPanY, 220);
      return;
    }
    state.zoom = targetZoom;
    state.panX = targetPanX;
    state.panY = targetPanY;
    if (dom.btnZoomReset) dom.btnZoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
    syncWorldLayerTransform();
    requestRender();
  }

  function zoomAtScreenPoint(newZoom, screenX, screenY, animate = false) {
    stopViewportAnimations();
    const page = getActivePage();
    const { minZoom, maxZoom } = getViewportZoomLimits(page);
    const clamped = Math.max(minZoom, Math.min(maxZoom, newZoom));
    const wx = (screenX - state.panX) / state.zoom;
    const wy = (screenY - state.panY) / state.zoom;
    const rawPanX = screenX - wx * clamped;
    const rawPanY = screenY - wy * clamped;
    const clampedPan = clampViewportPan(rawPanX, rawPanY, clamped, page);
    if (animate) {
      animateViewportTo(clamped, clampedPan.panX, clampedPan.panY, 200);
      return;
    }
    state.zoom = clamped;
    state.panX = clampedPan.panX;
    state.panY = clampedPan.panY;
    isZoomInteracting = true;
    if (zoomSettleTimer) clearTimeout(zoomSettleTimer);
    zoomSettleTimer = setTimeout(() => {
      zoomSettleTimer = null;
      isZoomInteracting = false;
      if (!state.isPinching && snapBackBoundedViewportIfZoomedOut()) return;
      requestRender();
    }, 135);
    if (dom.btnZoomReset) dom.btnZoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
    syncWorldLayerTransform();
    requestRender();
    scheduleHiDpiPdfCheck();
  }

