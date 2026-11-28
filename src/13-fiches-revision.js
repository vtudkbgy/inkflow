  // ============================================================================
  // 13. FICHES DE RÉVISION (lasso -> fiche recto/verso + répétition espacée)
  // ============================================================================
  //
  // Deux types de fiches, créées depuis une sélection au lasso :
  //  - « occlusion » : le recto montre la zone autour de la sélection avec la sélection masquée,
  //    le verso montre la même zone sans masque (la réponse est encadrée) ;
  //  - « qa » : le recto est la sélection, le verso est une réponse écrite et/ou une seconde
  //    sélection au lasso (réponse manuscrite).
  // Les faces sont enregistrées en images PNG dans le store IndexedDB `flashcards` : une fiche
  // reste lisible même si la page source change ou si le cahier est supprimé.
  // La planification suit une variante de SM-2 (Encore / Difficile / Bien / Facile).

  const FLASHCARD_MINUTE_MS = 60 * 1000;
  const FLASHCARD_DAY_MS = 24 * 60 * FLASHCARD_MINUTE_MS;
  const FLASHCARD_MIN_EASE = 1.3;
  const FLASHCARD_MAX_EASE = 3.0;
  const FLASHCARD_START_EASE = 2.5;
  const FLASHCARD_MAX_INTERVAL_DAYS = 3650;
  const FLASHCARD_AGAIN_DELAY_MS = 1 * FLASHCARD_MINUTE_MS;
  const FLASHCARD_HARD_LEARNING_DELAY_MS = 10 * FLASHCARD_MINUTE_MS;
  // Une fiche reprogrammée dans cette fenêtre revient dans la séance en cours
  const FLASHCARD_SESSION_REQUEUE_MS = 20 * FLASHCARD_MINUTE_MS;
  const FLASHCARD_IMAGE_MAX_SIDE = 1400;
  const FLASHCARD_GRID_LIMIT = 160;
  const FLASHCARD_MODE_STORAGE_KEY = 'inkflow.flashcards.lastMode';

  const FLASHCARD_GRADES = Object.freeze({ AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 });

  // ---------------------------------------------------------------------------
  // Planification (fonctions pures, testées par scripts/run-unit-tests.js)
  // ---------------------------------------------------------------------------

  function createFlashcardSrs(now = Date.now()) {
    return {
      state: 'new',
      due: now,
      interval: 0,
      ease: FLASHCARD_START_EASE,
      reps: 0,
      lapses: 0,
      lastReviewedAt: null
    };
  }

  function normalizeFlashcardSrs(srs, now = Date.now()) {
    const base = createFlashcardSrs(now);
    if (!srs || typeof srs !== 'object') return base;
    const state = srs.state === 'learning' || srs.state === 'review' ? srs.state : 'new';
    const ease = Number.isFinite(srs.ease) ? Math.min(FLASHCARD_MAX_EASE, Math.max(FLASHCARD_MIN_EASE, srs.ease)) : base.ease;
    return {
      state,
      due: Number.isFinite(srs.due) ? srs.due : now,
      interval: Number.isFinite(srs.interval) && srs.interval > 0 ? srs.interval : 0,
      ease,
      reps: Number.isFinite(srs.reps) && srs.reps > 0 ? Math.floor(srs.reps) : 0,
      lapses: Number.isFinite(srs.lapses) && srs.lapses > 0 ? Math.floor(srs.lapses) : 0,
      lastReviewedAt: Number.isFinite(srs.lastReviewedAt) ? srs.lastReviewedAt : null
    };
  }

  function clampFlashcardInterval(days) {
    return Math.min(FLASHCARD_MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)));
  }

  // Renvoie un nouvel état de planification (ne modifie jamais `srs`).
  function scheduleFlashcardReview(srs, grade, now = Date.now()) {
    const cur = normalizeFlashcardSrs(srs, now);
    const g = Math.max(0, Math.min(3, Math.round(Number(grade) || 0)));
    const next = { ...cur, lastReviewedAt: now };
    const inReview = cur.state === 'review';

    if (g === FLASHCARD_GRADES.AGAIN) {
      if (inReview) {
        next.lapses = cur.lapses + 1;
        next.ease = Math.max(FLASHCARD_MIN_EASE, cur.ease - 0.2);
      }
      next.state = 'learning';
      next.reps = 0;
      next.interval = 0;
      next.due = now + FLASHCARD_AGAIN_DELAY_MS;
      return next;
    }

    if (!inReview) {
      // Fiche nouvelle ou en apprentissage
      if (g === FLASHCARD_GRADES.HARD) {
        next.state = 'learning';
        next.interval = 0;
        next.due = now + FLASHCARD_HARD_LEARNING_DELAY_MS;
        return next;
      }
      next.state = 'review';
      next.reps = cur.reps + 1;
      if (g === FLASHCARD_GRADES.EASY) {
        next.interval = 4;
        next.ease = Math.min(FLASHCARD_MAX_EASE, cur.ease + 0.15);
      } else {
        next.interval = 1;
      }
      next.due = now + next.interval * FLASHCARD_DAY_MS;
      return next;
    }

    // Fiche déjà en révision : l'intervalle grandit, Facile > Bien > Difficile
    const prev = Math.max(1, cur.interval);
    const hardInterval = clampFlashcardInterval(Math.max(prev + 1, prev * 1.2));
    const goodInterval = clampFlashcardInterval(Math.max(hardInterval + 1, prev * cur.ease));
    const easyInterval = clampFlashcardInterval(Math.max(goodInterval + 1, prev * cur.ease * 1.3));
    next.reps = cur.reps + 1;
    if (g === FLASHCARD_GRADES.HARD) {
      next.interval = hardInterval;
      next.ease = Math.max(FLASHCARD_MIN_EASE, cur.ease - 0.15);
    } else if (g === FLASHCARD_GRADES.GOOD) {
      next.interval = goodInterval;
    } else {
      next.interval = easyInterval;
      next.ease = Math.min(FLASHCARD_MAX_EASE, cur.ease + 0.15);
    }
    next.due = now + next.interval * FLASHCARD_DAY_MS;
    return next;
  }

  function formatFlashcardDelay(ms) {
    const safe = Math.max(0, Number(ms) || 0);
    if (safe < FLASHCARD_MINUTE_MS * 1.5) return '1 min';
    if (safe < 60 * FLASHCARD_MINUTE_MS) return `${Math.round(safe / FLASHCARD_MINUTE_MS)} min`;
    if (safe < FLASHCARD_DAY_MS) return `${Math.round(safe / (60 * FLASHCARD_MINUTE_MS))} h`;
    const days = safe / FLASHCARD_DAY_MS;
    if (days < 30.5) return `${Math.round(days)} j`;
    if (days < 365) return `${Math.round(days / 30.4)} mois`;
    const years = days / 365;
    const rounded = years < 10 ? Math.round(years * 10) / 10 : Math.round(years);
    return `${String(rounded).replace('.', ',')} an${rounded >= 2 ? 's' : ''}`;
  }

  // Libellés « dans combien de temps » pour les 4 boutons de notation
  function previewFlashcardIntervals(srs, now = Date.now()) {
    return [0, 1, 2, 3].map((g) => formatFlashcardDelay(scheduleFlashcardReview(srs, g, now).due - now));
  }

  function isFlashcardDue(card, now = Date.now()) {
    if (!card) return false;
    const srs = normalizeFlashcardSrs(card.srs, card.createdAt || now);
    return srs.due <= now;
  }

  function getDueFlashcards(cards, now = Date.now(), notebookId = null) {
    return (cards || [])
      .filter((c) => c && (!notebookId || c.notebookId === notebookId) && isFlashcardDue(c, now))
      .sort((a, b) => {
        const da = normalizeFlashcardSrs(a.srs, a.createdAt || now).due;
        const dbb = normalizeFlashcardSrs(b.srs, b.createdAt || now).due;
        return da - dbb || (a.createdAt || 0) - (b.createdAt || 0);
      });
  }

  // ---------------------------------------------------------------------------
  // État de l'interface
  // ---------------------------------------------------------------------------

  const flashcardStore = {
    cards: [],
    loaded: false,
    loadPromise: null
  };

  // Délai au-delà duquel une réponse « à entourer » oubliée n'est plus attendue
  const FLASHCARD_AWAIT_BACK_TTL_MS = 10 * FLASHCARD_MINUTE_MS;

  const flashcardDraft = {
    active: false,
    awaitingBack: false,
    awaitingSince: 0,
    saving: false,
    mode: 'occlusion',
    notebookId: null,
    pageId: null,
    rect: null,
    images: { occlusionFront: '', occlusionBack: '', qaFront: '' },
    qaBackImage: '',
    qaBackSource: null,
    backText: ''
  };

  const flashcardReview = {
    open: false,
    view: 'library',
    deckId: null,
    queue: [],
    current: null,
    revealed: false,
    reviewedCount: 0,
    gradeCounts: [0, 0, 0, 0]
  };

  function fcEl(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  function fcSetHidden(el, hidden) {
    if (el && el.classList) el.classList.toggle('hidden', Boolean(hidden));
  }

  function fcReadLastMode() {
    try {
      const v = window.localStorage && window.localStorage.getItem(FLASHCARD_MODE_STORAGE_KEY);
      return v === 'qa' ? 'qa' : 'occlusion';
    } catch (_) {
      return 'occlusion';
    }
  }

  function fcWriteLastMode(mode) {
    try { if (window.localStorage) window.localStorage.setItem(FLASHCARD_MODE_STORAGE_KEY, mode); } catch (_) {}
  }

  function fcNewId() {
    const rnd = Math.random().toString(36).slice(2, 8);
    return `fc_${Date.now().toString(36)}_${rnd}`;
  }

  function fcNotebookTitle(notebookId) {
    const nb = (state.notebooks || []).find((n) => n.id === notebookId);
    return nb ? (nb.title || 'Cahier sans titre') : '';
  }

  function fcPageLabel(notebookId, pageId) {
    const pages = state.pagesByNotebook && state.pagesByNotebook.get ? (state.pagesByNotebook.get(notebookId) || []) : [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return '';
    return `page ${idx + 1}`;
  }

  async function loadFlashcards() {
    if (flashcardStore.loadPromise) return flashcardStore.loadPromise;
    flashcardStore.loadPromise = (async () => {
      try {
        const list = await db.getAllFlashcards();
        flashcardStore.cards = Array.isArray(list) ? list.filter((c) => c && c.id) : [];
      } catch (_) {
        flashcardStore.cards = [];
      }
      flashcardStore.loaded = true;
      updateFlashcardBadges();
      return flashcardStore.cards;
    })();
    return flashcardStore.loadPromise;
  }

  async function reloadFlashcards() {
    flashcardStore.loadPromise = null;
    flashcardStore.loaded = false;
    return loadFlashcards();
  }

  function updateFlashcardBadges() {
    const due = getDueFlashcards(flashcardStore.cards, Date.now()).length;
    const badge = fcEl('gnFilesBadgeRevision');
    if (badge) {
      badge.textContent = String(due);
      if (badge.classList) badge.classList.toggle('has-due', due > 0);
    }
    const navBtn = fcEl('gnFilesOpenRevision');
    if (navBtn && typeof navBtn.setAttribute === 'function') {
      navBtn.setAttribute('title', due > 0 ? `${due} fiche${due > 1 ? 's' : ''} à réviser` : 'Réviser les fiches créées au lasso');
    }
  }

  // ---------------------------------------------------------------------------
  // Capture des faces en image
  // ---------------------------------------------------------------------------

  function fcGetSelectionRect() {
    const b = state.selectionBounds;
    if (b && Number.isFinite(b.minX) && Number.isFinite(b.maxX) && b.maxX > b.minX && b.maxY > b.minY) {
      return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
    }
    const clip = state.lassoPdfClip;
    if (clip && Number.isFinite(clip.x)) {
      return { minX: clip.x, minY: clip.y, maxX: clip.x + (clip.width || 0), maxY: clip.y + (clip.height || 0) };
    }
    return null;
  }

  function fcSnapshotSelection(page) {
    const ids = state.selectedIds || {};
    const has = (set, id) => Boolean(set && typeof set.has === 'function' && set.has(id));
    const clip = state.lassoPdfClip && state.lassoPdfClip.src ? { ...state.lassoPdfClip } : null;
    return {
      strokes: (page.strokes || []).filter((s) => has(ids.strokes, s.id)),
      shapes: (page.shapes || []).filter((sh) => has(ids.shapes, sh.id)),
      texts: (page.texts || []).filter((t) => has(ids.texts, t.id)),
      images: (page.images || []).filter((im) => has(ids.images, im.id)),
      pdfClip: clip
    };
  }

  // Zone de contexte autour de la sélection pour les fiches « occlusion »
  function computeFlashcardContextRect(sel, page) {
    const w = Math.max(1, sel.maxX - sel.minX);
    const h = Math.max(1, sel.maxY - sel.minY);
    // La question se trouve le plus souvent au-dessus ou en dessous de la réponse :
    // on privilégie le contexte vertical, puis on borne le format entre 1:1,6 et 2,2:1.
    let padX = Math.max(100, w * 0.25);
    let padY = Math.max(150, h * 1.6);
    const outW = w + padX * 2;
    const outH = h + padY * 2;
    if (outW / outH > 2.2) padY += (outW / 2.2 - outH) / 2;
    else if (outH / outW > 1.6) padX += (outH / 1.6 - outW) / 2;
    const rect = { minX: sel.minX - padX, minY: sel.minY - padY, maxX: sel.maxX + padX, maxY: sel.maxY + padY };
    if (page && typeof isBoundedPage === 'function' && isBoundedPage(page)) {
      const pb = typeof getPageBounds === 'function' ? getPageBounds(page) : { width: page.pdfWidth || PAGE_WIDTH, height: page.pdfHeight || PAGE_HEIGHT };
      const pw = pb.width;
      const ph = pb.height;
      rect.minX = Math.max(rect.minX, Math.min(sel.minX, 0));
      rect.minY = Math.max(rect.minY, Math.min(sel.minY, 0));
      rect.maxX = Math.min(rect.maxX, Math.max(sel.maxX, pw));
      rect.maxY = Math.min(rect.maxY, Math.max(sel.maxY, ph));
    }
    return rect;
  }

  function fcLoadImage(src) {
    return new Promise((resolve) => {
      if (!src || typeof Image !== 'function') { resolve(null); return; }
      try {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      } catch (_) {
        resolve(null);
      }
    });
  }

  function fcRoundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  // Dessine une zone de page dans un PNG.
  // options.selection : ne dessine que ces éléments (sinon toute la page)
  // options.maskRect : masque plein posé sur la réponse ; options.outlineRect : cadre autour de la réponse
  async function renderFlashcardRegion(page, rect, options = {}) {
    if (!page || !rect || typeof document === 'undefined') return '';
    const w = Math.max(24, rect.maxX - rect.minX);
    const h = Math.max(24, rect.maxY - rect.minY);
    const scale = Math.max(0.02, Math.min(2, FLASHCARD_IMAGE_MAX_SIDE / Math.max(w, h)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return '';
    const sel = options.selection || null;
    const pdfClipImg = sel && sel.pdfClip ? await fcLoadImage(sel.pdfClip.src) : null;
    try {
      ctx.save();
      ctx.scale(canvas.width / w, canvas.height / h);
      ctx.translate(-rect.minX, -rect.minY);

      const pb = typeof getPageBounds === 'function' ? getPageBounds(page) : { width: page.pdfWidth || PAGE_WIDTH, height: page.pdfHeight || PAGE_HEIGHT };
      const pw = pb.width;
      const ph = pb.height;
      const isDark = !page.pdfId && (page.paperTone === 'dark' || page.paperTone === 'blueprint');
      ctx.fillStyle = isDark ? '#1e1b1b' : '#ffffff';
      ctx.fillRect(rect.minX, rect.minY, w, h);
      if (typeof isBoundedPage === 'function' && !isBoundedPage(page)) {
        // Page infinie : le motif du papier suit la vue. On place la « vue » sur la zone capturée
        // le temps de ce dessin synchrone (aucune image ne peut s'intercaler), puis on la rétablit.
        const saved = { zoom: state.zoom, panX: state.panX, panY: state.panY };
        try {
          state.zoom = 1;
          state.panX = -rect.minX;
          state.panY = -rect.minY;
          drawPaperBackground(ctx, page, w, h, false);
        } finally {
          state.zoom = saved.zoom;
          state.panX = saved.panX;
          state.panY = saved.panY;
        }
      } else {
        drawPaperBackground(ctx, page, pw, ph, true);
      }
      if (!sel && page.pdfId) drawLockedPdfBackground(ctx, page, true);

      const strokes = sel ? sel.strokes : (page.strokes || []);
      const shapes = sel ? sel.shapes : (page.shapes || []);
      const texts = sel ? sel.texts : (page.texts || []);
      const images = sel ? sel.images : (page.images || []);

      if (pdfClipImg && sel.pdfClip) {
        try { ctx.drawImage(pdfClipImg, sel.pdfClip.x || 0, sel.pdfClip.y || 0, sel.pdfClip.width || 200, sel.pdfClip.height || 140); } catch (_) {}
      }
      images.forEach((imgItem) => {
        const imgEl = getCachedThumbnailImage(imgItem);
        if (imgEl && typeof ctx.drawImage === 'function') {
          try { ctx.drawImage(imgEl, imgItem.x || 0, imgItem.y || 0, imgItem.width || 240, imgItem.height || 180); } catch (_) {}
        }
      });
      strokes.forEach((s) => { if (s.tool === 'highlighter') drawSingleStroke(ctx, s, isDark, false); });
      shapes.forEach((sh) => drawGeometricShape(ctx, sh, false, isDark));
      strokes.forEach((s) => { if (s.tool !== 'highlighter') drawSingleStroke(ctx, s, isDark, false); });
      if (!sel) (page.tapes || []).forEach((tp) => { if (!tp.revealed) drawTapeItem(ctx, tp, false); });
      drawTextBlocksOnCanvas(ctx, texts);

      const unit = 1 / scale;
      if (options.maskRect) {
        const m = options.maskRect;
        fcRoundRectPath(ctx, m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY, 10 * unit);
        ctx.fillStyle = '#0072ce';
        ctx.fill();
        const mh = m.maxY - m.minY;
        const fontPx = Math.max(14 * unit, Math.min(mh * 0.55, 64 * unit));
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${fontPx}px sans-serif`;
        if ('textAlign' in ctx) ctx.textAlign = 'center';
        if ('textBaseline' in ctx) ctx.textBaseline = 'middle';
        ctx.fillText('?', (m.minX + m.maxX) / 2, (m.minY + m.maxY) / 2);
      }
      if (options.outlineRect) {
        const o = options.outlineRect;
        fcRoundRectPath(ctx, o.minX, o.minY, o.maxX - o.minX, o.maxY - o.minY, 10 * unit);
        ctx.lineWidth = 3 * unit;
        ctx.strokeStyle = '#00b577';
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([8 * unit, 6 * unit]);
        ctx.stroke();
      }
      ctx.restore();
      return canvas.toDataURL('image/png');
    } catch (_) {
      return '';
    } finally {
      try { releaseCanvasMemory(canvas); } catch (_) {}
    }
  }

  function fcPadRect(r, pad) {
    return { minX: r.minX - pad, minY: r.minY - pad, maxX: r.maxX + pad, maxY: r.maxY + pad };
  }

  // ---------------------------------------------------------------------------
  // Création depuis le lasso
  // ---------------------------------------------------------------------------

  function resetFlashcardDraft() {
    flashcardDraft.active = false;
    flashcardDraft.awaitingBack = false;
    flashcardDraft.awaitingSince = 0;
    flashcardDraft.saving = false;
    flashcardDraft.notebookId = null;
    flashcardDraft.pageId = null;
    flashcardDraft.rect = null;
    flashcardDraft.images = { occlusionFront: '', occlusionBack: '', qaFront: '' };
    flashcardDraft.qaBackImage = '';
    flashcardDraft.qaBackSource = null;
    flashcardDraft.backText = '';
  }

  async function handleFlashcardLassoAction() {
    const page = getActivePage();
    const rect = fcGetSelectionRect();
    if (!page || !rect || !hasAnyLassoSelection()) {
      showToast('Entoure d’abord une zone au lasso pour en faire une fiche.', 'error', 'flashcard-hint');
      return false;
    }
    if (flashcardDraft.active && flashcardDraft.awaitingBack) {
      if (Date.now() - flashcardDraft.awaitingSince <= FLASHCARD_AWAIT_BACK_TTL_MS) {
        return captureFlashcardBackFromLasso(page, rect);
      }
      resetFlashcardDraft();
    }
    return startFlashcardDraftFromLasso(page, rect);
  }

  async function startFlashcardDraftFromLasso(page, rect) {
    resetFlashcardDraft();
    const selection = fcSnapshotSelection(page);
    const contextRect = computeFlashcardContextRect(rect, page);
    const [occlusionFront, occlusionBack, qaFront] = await Promise.all([
      renderFlashcardRegion(page, contextRect, { maskRect: rect }),
      renderFlashcardRegion(page, contextRect, { outlineRect: fcPadRect(rect, 4) }),
      renderFlashcardRegion(page, fcPadRect(rect, 14), { selection })
    ]);
    if (!occlusionFront && !qaFront) {
      showToast('Impossible de capturer cette sélection.', 'error');
      return false;
    }
    flashcardDraft.active = true;
    flashcardDraft.mode = fcReadLastMode();
    flashcardDraft.notebookId = page.notebookId || state.activeNotebookId;
    flashcardDraft.pageId = page.id;
    flashcardDraft.rect = { ...rect };
    flashcardDraft.images = { occlusionFront, occlusionBack, qaFront };
    openFlashcardCreateModal();
    return true;
  }

  async function captureFlashcardBackFromLasso(page, rect) {
    const selection = fcSnapshotSelection(page);
    const img = await renderFlashcardRegion(page, fcPadRect(rect, 14), { selection });
    if (!img) {
      showToast('Impossible de capturer la réponse.', 'error');
      return false;
    }
    flashcardDraft.awaitingBack = false;
    flashcardDraft.qaBackImage = img;
    flashcardDraft.qaBackSource = { notebookId: page.notebookId || state.activeNotebookId, pageId: page.id, rect: { ...rect } };
    flashcardDraft.mode = 'qa';
    clearLassoSelection();
    requestRender();
    openFlashcardCreateModal();
    return true;
  }

  function openFlashcardCreateModal() {
    const modal = fcEl('modalFlashcardCreate');
    if (!modal) return;
    const textArea = fcEl('fcCreateBackText');
    if (textArea) textArea.value = flashcardDraft.backText || '';
    const source = fcEl('fcCreateSource');
    if (source) {
      const nbTitle = fcNotebookTitle(flashcardDraft.notebookId);
      const pageLabel = fcPageLabel(flashcardDraft.notebookId, flashcardDraft.pageId);
      source.textContent = nbTitle ? `Source : ${nbTitle}${pageLabel ? `, ${pageLabel}` : ''}` : '';
    }
    syncFlashcardCreateModal();
    modal.classList.remove('hidden');
  }

  function closeFlashcardCreateModal({ keepDraft = false } = {}) {
    const modal = fcEl('modalFlashcardCreate');
    if (modal) modal.classList.add('hidden');
    if (!keepDraft) resetFlashcardDraft();
  }

  function syncFlashcardCreateModal() {
    const isQa = flashcardDraft.mode === 'qa';
    document.querySelectorAll('#modalFlashcardCreate [data-fc-mode]').forEach((btn) => {
      const on = btn.dataset.fcMode === flashcardDraft.mode;
      btn.classList.toggle('active', on);
      if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    const front = fcEl('fcCreateFrontImg');
    const back = fcEl('fcCreateBackImg');
    const backEmpty = fcEl('fcCreateBackEmpty');
    const frontSrc = isQa ? flashcardDraft.images.qaFront : flashcardDraft.images.occlusionFront;
    const backSrc = isQa ? flashcardDraft.qaBackImage : flashcardDraft.images.occlusionBack;
    if (front) front.src = frontSrc || '';
    if (back) {
      back.src = backSrc || '';
      fcSetHidden(back, !backSrc);
    }
    fcSetHidden(backEmpty, Boolean(backSrc));
    fcSetHidden(fcEl('fcCreateQaFields'), !isQa);
    fcSetHidden(fcEl('btnFcClearBack'), !flashcardDraft.qaBackImage);
    const pick = fcEl('btnFcPickBackLasso');
    if (pick) pick.textContent = flashcardDraft.qaBackImage ? 'Entourer une autre réponse' : 'Entourer la réponse au lasso';
  }

  function setFlashcardDraftMode(mode) {
    flashcardDraft.mode = mode === 'qa' ? 'qa' : 'occlusion';
    fcWriteLastMode(flashcardDraft.mode);
    syncFlashcardCreateModal();
  }

  function beginPickingFlashcardBack() {
    const textArea = fcEl('fcCreateBackText');
    if (textArea) flashcardDraft.backText = textArea.value || '';
    flashcardDraft.awaitingBack = true;
    flashcardDraft.awaitingSince = Date.now();
    closeFlashcardCreateModal({ keepDraft: true });
    clearLassoSelection();
    if (state.tool !== 'lasso') {
      try { setActiveTool('lasso'); } catch (_) {}
    }
    requestRender();
    showToast('Entoure la réponse au lasso, puis touche le bouton Fiche (Échap pour annuler).', 'info', 'flashcard-hint');
  }

  // Construit l'enregistrement d'une fiche à partir du brouillon (sans l'enregistrer)
  function buildFlashcardFromDraft(draft, now = Date.now()) {
    const isQa = draft.mode === 'qa';
    const backText = String(draft.backText || '').trim();
    const card = {
      id: fcNewId(),
      kind: isQa ? 'qa' : 'occlusion',
      notebookId: draft.notebookId,
      pageId: draft.pageId,
      rect: draft.rect ? { ...draft.rect } : null,
      notebookTitle: fcNotebookTitle(draft.notebookId),
      frontImage: isQa ? draft.images.qaFront : draft.images.occlusionFront,
      backImage: isQa ? (draft.qaBackImage || '') : draft.images.occlusionBack,
      backText: isQa ? backText : '',
      backSource: isQa && draft.qaBackSource ? { ...draft.qaBackSource } : null,
      createdAt: now,
      updatedAt: now,
      srs: createFlashcardSrs(now)
    };
    return card;
  }

  async function confirmFlashcardCreation() {
    if (!flashcardDraft.active || flashcardDraft.saving) return null;
    const textArea = fcEl('fcCreateBackText');
    if (textArea) flashcardDraft.backText = textArea.value || '';
    if (flashcardDraft.mode === 'qa' && !flashcardDraft.qaBackImage && !String(flashcardDraft.backText || '').trim()) {
      showToast('Ajoute une réponse : écris-la ou entoure-la au lasso.', 'error', 'flashcard-hint');
      return null;
    }
    const card = buildFlashcardFromDraft(flashcardDraft);
    if (!card.frontImage) {
      showToast('Le recto de la fiche est vide.', 'error');
      return null;
    }
    // Ferme et vide le brouillon avant toute attente : un double-clic ne crée pas deux fiches
    flashcardDraft.saving = true;
    closeFlashcardCreateModal();
    clearLassoSelection();
    requestRender();
    await loadFlashcards();
    flashcardStore.cards.push(card);
    try { await db.saveFlashcard(card); } catch (_) {}
    updateFlashcardBadges();
    const due = getDueFlashcards(flashcardStore.cards).length;
    showToast(`Fiche créée. ${due} à réviser.`, 'info', 'flashcard-created');
    return card;
  }

  // ---------------------------------------------------------------------------
  // Panneau de révision : paquets, fiches, séance
  // ---------------------------------------------------------------------------

  async function openFlashcardsPanel(deckId = null) {
    await loadFlashcards();
    const modal = fcEl('modalFlashcards');
    if (!modal) return;
    flashcardReview.open = true;
    flashcardReview.deckId = deckId;
    showFlashcardView('library');
    modal.classList.remove('hidden');
  }

  function closeFlashcardsPanel() {
    const modal = fcEl('modalFlashcards');
    if (modal) modal.classList.add('hidden');
    flashcardReview.open = false;
    flashcardReview.queue = [];
    flashcardReview.current = null;
    updateFlashcardBadges();
  }

  function showFlashcardView(view) {
    flashcardReview.view = view;
    fcSetHidden(fcEl('fcLibraryView'), view !== 'library');
    fcSetHidden(fcEl('fcReviewView'), view !== 'review');
    fcSetHidden(fcEl('fcReviewDone'), view !== 'done');
    const title = fcEl('fcPanelTitle');
    if (title) {
      const deckTitle = flashcardReview.deckId ? fcDeckTitle(flashcardReview.deckId) : '';
      title.textContent = view === 'library' ? 'Révision' : (deckTitle ? `Révision · ${deckTitle}` : 'Révision · tous les cahiers');
    }
    if (view === 'library') renderFlashcardLibrary();
  }

  function fcDeckTitle(notebookId) {
    const live = fcNotebookTitle(notebookId);
    if (live) return live;
    const any = flashcardStore.cards.find((c) => c.notebookId === notebookId && c.notebookTitle);
    return any ? any.notebookTitle : 'Cahier supprimé';
  }

  function fcGroupDecks(cards, now) {
    const decks = new Map();
    cards.forEach((c) => {
      const key = c.notebookId || '';
      if (!decks.has(key)) decks.set(key, { id: key, title: fcDeckTitle(key), total: 0, due: 0 });
      const d = decks.get(key);
      d.total += 1;
      if (isFlashcardDue(c, now)) d.due += 1;
    });
    return Array.from(decks.values()).sort((a, b) => b.due - a.due || a.title.localeCompare(b.title, 'fr'));
  }

  function fcDueLabel(card, now) {
    const srs = normalizeFlashcardSrs(card.srs, card.createdAt || now);
    if (srs.state === 'new') return 'Nouvelle';
    if (srs.due <= now) return 'À réviser';
    return `Dans ${formatFlashcardDelay(srs.due - now)}`;
  }

  function renderFlashcardLibrary() {
    const now = Date.now();
    const cards = flashcardStore.cards;
    const totalDue = getDueFlashcards(cards, now).length;
    const summary = fcEl('fcSummary');
    if (summary) {
      summary.textContent = cards.length === 0
        ? ''
        : `${cards.length} fiche${cards.length > 1 ? 's' : ''}, ${totalDue} à réviser maintenant.`;
    }
    fcSetHidden(fcEl('fcEmptyState'), cards.length > 0);

    const deckList = fcEl('fcDeckList');
    const grid = fcEl('fcCardGrid');
    if (deckList) deckList.innerHTML = '';
    if (grid) grid.innerHTML = '';
    if (cards.length === 0) return;

    if (deckList) {
      const decks = fcGroupDecks(cards, now);
      const rows = [{ id: null, title: 'Tous les cahiers', total: cards.length, due: totalDue }].concat(decks);
      rows.forEach((d) => {
        const row = document.createElement('div');
        row.className = `fc-deck-row${flashcardReview.deckId === d.id ? ' active' : ''}`;
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'fc-deck-pick';
        pick.innerHTML = `<strong>${escapeHtml(d.title)}</strong><small>${d.total} fiche${d.total > 1 ? 's' : ''}</small>`;
        pick.addEventListener('click', () => {
          flashcardReview.deckId = d.id;
          renderFlashcardLibrary();
        });
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'btn-primary fc-deck-start';
        start.disabled = d.due === 0;
        start.textContent = d.due > 0 ? `Réviser ${d.due}` : 'À jour';
        start.addEventListener('click', () => startFlashcardSession(d.id));
        row.appendChild(pick);
        row.appendChild(start);
        deckList.appendChild(row);
      });
    }

    if (grid) {
      const deckCards = cards
        .filter((c) => !flashcardReview.deckId || c.notebookId === flashcardReview.deckId)
        .slice()
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      deckCards.slice(0, FLASHCARD_GRID_LIMIT).forEach((card) => {
        const item = document.createElement('div');
        item.className = 'fc-card-item';
        const thumb = document.createElement('img');
        thumb.className = 'fc-card-thumb';
        thumb.alt = 'Recto de la fiche';
        thumb.loading = 'lazy';
        thumb.decoding = 'async';
        thumb.src = card.frontImage || '';
        const meta = document.createElement('div');
        meta.className = 'fc-card-meta';
        const due = isFlashcardDue(card, now);
        meta.innerHTML = `<span class="fc-card-due${due ? ' is-due' : ''}">${escapeHtml(fcDueLabel(card, now))}</span>` +
          `<span class="fc-card-deck">${escapeHtml(fcDeckTitle(card.notebookId))}</span>`;
        const actions = document.createElement('div');
        actions.className = 'fc-card-actions';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'fc-card-link';
        open.textContent = 'Voir la page';
        open.addEventListener('click', () => openFlashcardSource(card));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-btn-tiny danger';
        del.title = 'Supprimer la fiche';
        del.setAttribute('aria-label', 'Supprimer la fiche');
        del.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';
        del.addEventListener('click', async () => {
          if (await confirmFlashcardDeletion()) {
            await deleteFlashcardById(card.id);
            renderFlashcardLibrary();
          }
        });
        actions.appendChild(open);
        actions.appendChild(del);
        item.appendChild(thumb);
        item.appendChild(meta);
        item.appendChild(actions);
        grid.appendChild(item);
      });
      if (deckCards.length > FLASHCARD_GRID_LIMIT) {
        const more = document.createElement('p');
        more.className = 'fc-grid-more';
        more.textContent = `${deckCards.length - FLASHCARD_GRID_LIMIT} fiches plus anciennes ne sont pas affichées.`;
        grid.appendChild(more);
      }
    }
  }

  async function confirmFlashcardDeletion() {
    const msg = 'Supprimer cette fiche ? Son historique de révision sera perdu.';
    try {
      if (window.__TAURI__ && window.__TAURI__.dialog && typeof window.__TAURI__.dialog.confirm === 'function') {
        return Boolean(await window.__TAURI__.dialog.confirm(msg, { title: 'InkFlow', kind: 'warning' }));
      }
      return typeof window.confirm === 'function' ? Boolean(window.confirm(msg)) : false;
    } catch (_) {
      return false;
    }
  }

  async function deleteFlashcardById(cardId) {
    flashcardStore.cards = flashcardStore.cards.filter((c) => c.id !== cardId);
    try { await db.deleteFlashcard(cardId); } catch (_) {}
    updateFlashcardBadges();
  }

  function startFlashcardSession(deckId = null) {
    const now = Date.now();
    flashcardReview.deckId = deckId;
    flashcardReview.queue = getDueFlashcards(flashcardStore.cards, now, deckId).map((c) => c.id);
    flashcardReview.reviewedCount = 0;
    flashcardReview.gradeCounts = [0, 0, 0, 0];
    if (flashcardReview.queue.length === 0) {
      showToast('Rien à réviser pour l’instant.', 'info', 'flashcard-hint');
      showFlashcardView('library');
      return false;
    }
    showFlashcardView('review');
    showNextFlashcard();
    return true;
  }

  function showNextFlashcard() {
    const nextId = flashcardReview.queue.shift();
    const card = nextId ? flashcardStore.cards.find((c) => c.id === nextId) : null;
    if (!card) {
      if (flashcardReview.queue.length > 0) { showNextFlashcard(); return; }
      finishFlashcardSession();
      return;
    }
    flashcardReview.current = card;
    flashcardReview.revealed = false;
    const front = fcEl('fcReviewFrontImg');
    if (front) front.src = card.frontImage || '';
    const backImg = fcEl('fcReviewBackImg');
    if (backImg) {
      backImg.src = card.backImage || '';
      fcSetHidden(backImg, !card.backImage);
    }
    const backText = fcEl('fcReviewBackText');
    if (backText) {
      backText.textContent = card.backText || '';
      fcSetHidden(backText, !card.backText);
    }
    // Pour une fiche « occlusion », le verso remplace le recto (même zone sans masque)
    fcSetHidden(front, false);
    fcSetHidden(fcEl('fcReviewAnswer'), true);
    fcSetHidden(fcEl('fcReviewRevealRow'), false);
    fcSetHidden(fcEl('fcReviewGradeRow'), true);
    const labels = previewFlashcardIntervals(card.srs, Date.now());
    labels.forEach((txt, i) => { const el = fcEl(`fcGradeLabel${i}`); if (el) el.textContent = txt; });
    updateFlashcardProgress();
  }

  function updateFlashcardProgress() {
    const el = fcEl('fcReviewProgress');
    if (!el) return;
    const left = flashcardReview.queue.length + (flashcardReview.current ? 1 : 0);
    el.textContent = `${flashcardReview.reviewedCount} faite${flashcardReview.reviewedCount > 1 ? 's' : ''} · ${left} restante${left > 1 ? 's' : ''}`;
  }

  function revealFlashcard() {
    const card = flashcardReview.current;
    if (!card || flashcardReview.revealed) return;
    flashcardReview.revealed = true;
    if (card.kind === 'occlusion') fcSetHidden(fcEl('fcReviewFrontImg'), true);
    fcSetHidden(fcEl('fcReviewAnswer'), false);
    fcSetHidden(fcEl('fcReviewRevealRow'), true);
    fcSetHidden(fcEl('fcReviewGradeRow'), false);
  }

  async function gradeCurrentFlashcard(grade) {
    const card = flashcardReview.current;
    if (!card || !flashcardReview.revealed) return null;
    const now = Date.now();
    card.srs = scheduleFlashcardReview(card.srs, grade, now);
    card.updatedAt = now;
    flashcardReview.reviewedCount += 1;
    const g = Math.max(0, Math.min(3, Math.round(Number(grade) || 0)));
    flashcardReview.gradeCounts[g] += 1;
    if (card.srs.due - now <= FLASHCARD_SESSION_REQUEUE_MS) flashcardReview.queue.push(card.id);
    flashcardReview.current = null;
    try { await db.saveFlashcard(card); } catch (_) {}
    updateFlashcardBadges();
    if (flashcardReview.open && flashcardReview.view === 'review') showNextFlashcard();
    return card.srs;
  }

  function finishFlashcardSession() {
    flashcardReview.current = null;
    const text = fcEl('fcReviewDoneText');
    if (text) {
      const n = flashcardReview.reviewedCount;
      const [again, hard, good, easy] = flashcardReview.gradeCounts;
      text.textContent = `${n} réponse${n > 1 ? 's' : ''} : ${good + easy} sûre${good + easy > 1 ? 's' : ''}, ${hard} difficile${hard > 1 ? 's' : ''}, ${again} à revoir.`;
    }
    showFlashcardView('done');
  }

  function openFlashcardSource(card) {
    if (!card) return false;
    const nb = (state.notebooks || []).find((n) => n.id === card.notebookId && !n.trashedAt);
    const pages = nb && state.pagesByNotebook && state.pagesByNotebook.get ? (state.pagesByNotebook.get(nb.id) || []) : [];
    const page = pages.find((p) => p.id === card.pageId);
    if (!nb || !page) {
      showToast('La page d’origine de cette fiche n’existe plus.', 'error', 'flashcard-source');
      return false;
    }
    closeFlashcardsPanel();
    if (state.filesPageOpen && typeof closeFilesPage === 'function') closeFilesPage();
    if (state.activeNotebookId !== nb.id) selectNotebook(nb.id);
    if (state.activePageId !== page.id) selectPage(page.id);
    if (card.rect && dom.canvasViewport && typeof dom.canvasViewport.getBoundingClientRect === 'function') {
      const vp = dom.canvasViewport.getBoundingClientRect();
      const cx = (card.rect.minX + card.rect.maxX) / 2;
      const cy = (card.rect.minY + card.rect.maxY) / 2;
      try { animateViewportTo(state.zoom, vp.width / 2 - cx * state.zoom, vp.height / 2 - cy * state.zoom, 260); } catch (_) {}
    }
    return true;
  }

  function isFlashcardModalOpen() {
    const a = fcEl('modalFlashcards');
    const b = fcEl('modalFlashcardCreate');
    const open = (el) => Boolean(el && el.classList && !el.classList.contains('hidden'));
    return open(a) || open(b);
  }

  function handleFlashcardKeydown(e) {
    if (!isFlashcardModalOpen()) {
      // Échap abandonne une réponse « à entourer au lasso » (le lasso garde aussi son propre Échap)
      if (e.key === 'Escape' && flashcardDraft.active && flashcardDraft.awaitingBack) {
        resetFlashcardDraft();
        showToast('Fiche annulée.', 'info', 'flashcard-hint');
      }
      return;
    }
    // Touches de fonction (F11 plein écran…) : laissées à l'application
    if (/^F\d{1,2}$/.test(String(e.key || ''))) return;
    const createOpen = (() => { const el = fcEl('modalFlashcardCreate'); return Boolean(el && !el.classList.contains('hidden')); })();
    // Aucun raccourci de l'application ne doit agir sur le cahier caché derrière la fenêtre
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (createOpen) closeFlashcardCreateModal();
      else if (flashcardReview.view === 'review') showFlashcardView('library');
      else closeFlashcardsPanel();
      return;
    }
    if (createOpen) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.repeat) {
        e.preventDefault();
        confirmFlashcardCreation();
      }
      return;
    }
    if (flashcardReview.view !== 'review') return;
    const tag = e.target && e.target.tagName ? String(e.target.tagName).toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.repeat) { e.preventDefault(); return; }
    // Entrée / Espace sur un bouton ciblé (« Arrêter », « Voir la page ») : action native du bouton
    if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (!flashcardReview.revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      revealFlashcard();
      return;
    }
    if (flashcardReview.revealed && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      gradeCurrentFlashcard(Number(e.key) - 1);
    }
  }

  function initFlashcards() {
    if (typeof document === 'undefined') return;
    const on = (id, fn) => {
      const el = fcEl(id);
      if (el) el.addEventListener('click', (e) => { if (e && typeof e.stopPropagation === 'function') e.stopPropagation(); fn(e); });
    };
    on('btnGnLassoFlashcard', () => handleFlashcardLassoAction());
    on('btnQuickFlashcardLasso', () => handleFlashcardLassoAction());
    on('gnFilesOpenRevision', () => openFlashcardsPanel());

    on('btnCloseFlashcardCreate', () => closeFlashcardCreateModal());
    on('btnFcCreateCancel', () => closeFlashcardCreateModal());
    on('btnFcCreateConfirm', () => confirmFlashcardCreation());
    on('btnFcPickBackLasso', () => beginPickingFlashcardBack());
    on('btnFcClearBack', () => {
      flashcardDraft.qaBackImage = '';
      flashcardDraft.qaBackSource = null;
      syncFlashcardCreateModal();
    });
    document.querySelectorAll('#modalFlashcardCreate [data-fc-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setFlashcardDraftMode(btn.dataset.fcMode));
    });
    const textArea = fcEl('fcCreateBackText');
    if (textArea) textArea.addEventListener('input', () => { flashcardDraft.backText = textArea.value || ''; });

    on('btnCloseFlashcards', () => closeFlashcardsPanel());
    on('btnFcReviewBack', () => showFlashcardView('library'));
    on('btnFcReviewDoneBack', () => showFlashcardView('library'));
    on('btnFcReveal', () => revealFlashcard());
    on('btnFcReviewOpenSource', () => openFlashcardSource(flashcardReview.current));
    document.querySelectorAll('#fcReviewGradeRow [data-fc-grade]').forEach((btn) => {
      btn.addEventListener('click', () => gradeCurrentFlashcard(Number(btn.dataset.fcGrade)));
    });

    // Un clic sur le fond assombri ferme la fenêtre (pas un clic dans la carte)
    ['modalFlashcards', 'modalFlashcardCreate'].forEach((id) => {
      const modal = fcEl(id);
      if (!modal) return;
      modal.addEventListener('pointerdown', (e) => {
        if (e.target !== modal) return;
        if (id === 'modalFlashcards') closeFlashcardsPanel();
        else closeFlashcardCreateModal();
      });
    });

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', handleFlashcardKeydown, true);
    }

    Promise.resolve(initialDbLoadPromise).catch(() => {}).then(() => loadFlashcards());
    // Les fiches deviennent « à réviser » avec le temps : rafraîchit le compteur chaque minute
    if (typeof setInterval === 'function') {
      const timer = setInterval(() => { if (flashcardStore.loaded) updateFlashcardBadges(); }, FLASHCARD_MINUTE_MS);
      if (timer && typeof timer.unref === 'function') timer.unref();
    }
  }

  initFlashcards();

  if (typeof window !== 'undefined' && window.__plumeStudioApi) {
    Object.assign(window.__plumeStudioApi, {
      FLASHCARD_GRADES,
      createFlashcardSrs,
      scheduleFlashcardReview,
      previewFlashcardIntervals,
      formatFlashcardDelay,
      isFlashcardDue,
      getDueFlashcards,
      computeFlashcardContextRect,
      buildFlashcardFromDraft,
      handleFlashcardLassoAction,
      confirmFlashcardCreation,
      setFlashcardDraftMode,
      loadFlashcards,
      openFlashcardsPanel,
      startFlashcardSession,
      revealFlashcard,
      gradeCurrentFlashcard,
      deleteFlashcardById,
      flashcardStore,
      flashcardDraft,
      flashcardReview
    });
  }
