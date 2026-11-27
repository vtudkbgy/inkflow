  // ============================================================================
  // 15B. RENDU ASYNCHRONE NON-BLOQUANT & OFFSCREENCANVAS (MINIATURES & SPLIT VIEW)
  // ============================================================================

  function createOffscreenRenderSurface(width, height) {
    const w = Math.max(1, Math.round(width || 1));
    const h = Math.max(1, Math.round(height || 1));
    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        const oc = new OffscreenCanvas(w, h);
        const ctx = oc.getContext('2d');
        if (ctx) return { canvas: oc, ctx, isOffscreen: true };
      } catch (_) {}
    }
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext && c.getContext('2d');
      if (ctx) return { canvas: c, ctx, isOffscreen: false };
    }
    return null;
  }

  async function surfaceToDataUrl(surface, mime = 'image/webp', quality = 0.72) {
    if (!surface || !surface.canvas) return '';
    if (surface.isOffscreen && typeof surface.canvas.convertToBlob === 'function') {
      const tryTypes = mime === 'image/webp' ? ['image/webp', 'image/png'] : [mime];
      for (let ti = 0; ti < tryTypes.length; ti++) {
        try {
          const blob = await surface.canvas.convertToBlob({ type: tryTypes[ti], quality });
          if (blob && blob.size > 0 && typeof FileReader !== 'undefined') {
            const res = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(String(reader.result || ''));
              reader.onerror = () => resolve('');
              reader.readAsDataURL(blob);
            });
            if (res && res.startsWith('data:image/')) return res;
          }
        } catch (_) {}
      }
    }
    if (typeof surface.canvas.toDataURL === 'function') {
      try {
        const fast = surface.canvas.toDataURL(mime, quality);
        if (fast && fast.startsWith('data:image/')) return fast;
      } catch (_) {}
      try {
        return surface.canvas.toDataURL('image/png');
      } catch (_) {}
    }
    return '';
  }

  function releaseOffscreenSurface(surface) {
    if (!surface || !surface.canvas) return;
    try {
      surface.canvas.width = 0;
      surface.canvas.height = 0;
    } catch (_) {}
  }

  function paintPageThumbnailOnContext(tCtx, page, pw, ph, sc) {
    tCtx.save();
    tCtx.scale(sc, sc);
    drawPaperBackground(tCtx, page, pw, ph, true);
    if (page && page.pdfId) {
      drawLockedPdfBackground(tCtx, page, true);
    }
    const isDark = !page?.pdfId && (page.paperTone === 'dark' || page.paperTone === 'blueprint');
    (page.images || []).forEach((imgItem) => {
      const imgEl = getCachedThumbnailImage(imgItem);
      if (imgEl && typeof tCtx.drawImage === 'function') {
        try {
          tCtx.drawImage(imgEl, imgItem.x || 0, imgItem.y || 0, imgItem.width || 240, imgItem.height || 160);
        } catch (_) {}
      }
    });
    (page.strokes || []).forEach((s) => { if (s.tool === 'highlighter') drawSingleStroke(tCtx, s, isDark, false); });
    (page.shapes || []).forEach((sh) => drawGeometricShape(tCtx, sh, false, isDark));
    (page.strokes || []).forEach((s) => { if (s.tool !== 'highlighter') drawSingleStroke(tCtx, s, isDark, false); });
    (page.tapes || []).forEach((tp) => { if (!tp.revealed) drawTapeItem(tCtx, tp, false); });
    drawTextBlocksOnCanvas(tCtx, page.texts);
    tCtx.restore();
  }

  async function generatePageThumbnailAsync(page) {
    const sc = 0.16;
    const pw = (page && page.pdfWidth) ? page.pdfWidth : PAGE_WIDTH;
    const ph = (page && page.pdfHeight) ? page.pdfHeight : PAGE_HEIGHT;
    const surface = createOffscreenRenderSurface(Math.round(pw * sc), Math.round(ph * sc));
    if (!surface) return generatePageThumbnail(page);
    try {
      paintPageThumbnailOnContext(surface.ctx, page, pw, ph, sc);
      return await surfaceToDataUrl(surface, 'image/webp', 0.72);
    } finally {
      releaseOffscreenSurface(surface);
    }
  }

  // File asynchrone prioritaire : rend les miniatures pendant les temps libres du thread principal
  // et cède immédiatement la priorité dès qu'un trait au stylet ou un Pan est actif (120 Hz protégé).
  const asyncThumbQueue = [];
  const asyncThumbQueuedIds = new Set();
  const asyncThumbStats = { scheduled: 0, completed: 0, deferredForStylus: 0, usedOffscreen: typeof OffscreenCanvas !== 'undefined' };
  let asyncThumbTimer = null;
  let asyncThumbRunning = false;

  function isInteractiveGestureBusy() {
    return Boolean(
      state.isDrawing ||
      state.isPanning ||
      (typeof activeTouchPointers !== 'undefined' && activeTouchPointers && activeTouchPointers.size > 0)
    );
  }

  function scheduleNextAsyncThumbTick(delayMs = 16) {
    if (asyncThumbTimer !== null || asyncThumbRunning) return;
    if (asyncThumbQueue.length === 0) return;
    if (delayMs <= 16 && typeof requestIdleCallback === 'function') {
      asyncThumbTimer = requestIdleCallback((deadline) => {
        asyncThumbTimer = null;
        processAsyncThumbSlice(deadline);
      }, { timeout: 220 });
    } else {
      asyncThumbTimer = setTimeout(() => {
        asyncThumbTimer = null;
        processAsyncThumbSlice(null);
      }, delayMs);
    }
  }

  async function processAsyncThumbSlice(deadline) {
    if (asyncThumbRunning || asyncThumbQueue.length === 0) return;
    if (isInteractiveGestureBusy()) {
      asyncThumbStats.deferredForStylus++;
      scheduleNextAsyncThumbTick(120);
      return;
    }
    if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 3 && !deadline.didTimeout) {
      scheduleNextAsyncThumbTick(16);
      return;
    }
    const job = asyncThumbQueue.shift();
    if (!job || !job.page) {
      scheduleNextAsyncThumbTick(16);
      return;
    }
    asyncThumbQueuedIds.delete(job.page.id);
    asyncThumbRunning = true;
    try {
      const dataUrl = await generatePageThumbnailAsync(job.page);
      if (dataUrl) {
        job.page.thumbnail = dataUrl;
        asyncThumbStats.completed++;
        if (job.page.notebookId === state.activeNotebookId) {
          updateSingleSidebarThumbnailDom(job.page);
        }
        if (typeof job.onDone === 'function') job.onDone(dataUrl, job.page);
      }
    } catch (_) {
      // Silencieux : une miniature non générée ne bloque jamais l'application
    } finally {
      asyncThumbRunning = false;
      if (asyncThumbQueue.length > 0) scheduleNextAsyncThumbTick(16);
    }
  }

  function scheduleAsyncPageThumbnail(page, { priority = 'normal', onDone = null } = {}) {
    if (!page || !page.id) return false;
    if (asyncThumbQueuedIds.has(page.id)) return false;
    asyncThumbQueuedIds.add(page.id);
    asyncThumbStats.scheduled++;
    const job = { page, priority, onDone };
    if (priority === 'high') asyncThumbQueue.unshift(job);
    else asyncThumbQueue.push(job);
    scheduleNextAsyncThumbTick(16);
    return true;
  }

  async function flushAsyncThumbnailQueue() {
    if (asyncThumbTimer !== null) {
      if (typeof cancelIdleCallback === 'function') {
        try { cancelIdleCallback(asyncThumbTimer); } catch (_) {}
      }
      try { clearTimeout(asyncThumbTimer); } catch (_) {}
      asyncThumbTimer = null;
    }
    while (asyncThumbQueue.length > 0) {
      const job = asyncThumbQueue.shift();
      if (!job || !job.page) continue;
      asyncThumbQueuedIds.delete(job.page.id);
      const dataUrl = await generatePageThumbnailAsync(job.page);
      if (dataUrl) {
        job.page.thumbnail = dataUrl;
        asyncThumbStats.completed++;
        if (job.page.notebookId === state.activeNotebookId) {
          updateSingleSidebarThumbnailDom(job.page);
        }
        if (typeof job.onDone === 'function') job.onDone(dataUrl, job.page);
      }
    }
  }

  function getAsyncThumbnailStats() {
    return { ...asyncThumbStats, pending: asyncThumbQueue.length };
  }

  // Cache OffscreenCanvas dédié au panneau secondaire Split View (évite de re-rastériser tous les traits lors d'un Pan)
  const splitOffscreenCache = {
    surface: null,
    pageId: null,
    revision: '',
    scale: 0,
    isDark: false,
    pw: 0,
    ph: 0
  };

  function releaseSplitOffscreenCache() {
    if (splitOffscreenCache.surface) {
      releaseOffscreenSurface(splitOffscreenCache.surface);
      splitOffscreenCache.surface = null;
    }
    splitOffscreenCache.pageId = null;
    splitOffscreenCache.revision = '';
    splitOffscreenCache.scale = 0;
  }

  function getSplitPageRevisionKey(page) {
    if (!page) return '';
    const pdfEntry = (page.pdfId && typeof pdfRenderedCanvasCache !== 'undefined')
      ? pdfRenderedCanvasCache.get(`${page.pdfId}_${page.pdfPageNumber || 1}`)
      : null;
    const pdfReady = pdfEntry && pdfEntry.canvas ? `${Math.round((pdfEntry.renderedScale || 1) * 10)}` : '0';
    return [
      page.updatedAt || 0,
      (page.strokes || []).length,
      (page.shapes || []).length,
      (page.texts || []).length,
      (page.tapes || []).length,
      (page.images || []).length,
      page.paperType || '',
      page.paperTone || '',
      page.rotation || 0,
      pdfReady
    ].join(':');
  }

  function ensureSplitOffscreenPageBitmap(page, pw, ph, targetScale, isDark) {
    const quantizedScale = Math.max(0.5, Math.min(2.5, Math.round(targetScale * 4) / 4));
    const rev = getSplitPageRevisionKey(page);
    if (
      splitOffscreenCache.surface &&
      splitOffscreenCache.pageId === page.id &&
      splitOffscreenCache.revision === rev &&
      splitOffscreenCache.scale === quantizedScale &&
      splitOffscreenCache.isDark === isDark &&
      splitOffscreenCache.pw === pw &&
      splitOffscreenCache.ph === ph
    ) {
      return splitOffscreenCache.surface.canvas;
    }

    const bw = Math.max(1, Math.min(2400, Math.round(pw * quantizedScale)));
    const bh = Math.max(1, Math.min(3200, Math.round(ph * quantizedScale)));
    const effScaleX = bw / Math.max(1, pw);
    const effScaleY = bh / Math.max(1, ph);

    if (!splitOffscreenCache.surface || splitOffscreenCache.surface.canvas.width !== bw || splitOffscreenCache.surface.canvas.height !== bh) {
      releaseSplitOffscreenCache();
      splitOffscreenCache.surface = createOffscreenRenderSurface(bw, bh);
    }
    if (!splitOffscreenCache.surface) return null;

    const sctx = splitOffscreenCache.surface.ctx;
    sctx.save();
    sctx.setTransform(effScaleX, 0, 0, effScaleY, 0, 0);
    sctx.clearRect(0, 0, pw, ph);
    drawPaperBackground(sctx, page, pw, ph, true);
    if (page.pdfId) {
      drawLockedPdfBackground(sctx, page, false);
    }
    (page.images || []).forEach((imgItem) => {
      const imgEl = getCachedThumbnailImage(imgItem);
      if (imgEl && typeof sctx.drawImage === 'function') {
        try { sctx.drawImage(imgEl, imgItem.x || 0, imgItem.y || 0, imgItem.width || 240, imgItem.height || 180); } catch (_) {}
      }
    });
    (page.strokes || []).forEach((s) => { if (s.tool === 'highlighter') drawSingleStroke(sctx, s, isDark, false); });
    (page.shapes || []).forEach((sh) => drawGeometricShape(sctx, sh, false, isDark));
    (page.strokes || []).forEach((s) => { if (s.tool !== 'highlighter') drawSingleStroke(sctx, s, isDark, false); });
    (page.tapes || []).forEach((tp) => { if (!tp.revealed) drawTapeItem(sctx, tp, false); });
    drawTextBlocksOnCanvas(sctx, page.texts);
    sctx.restore();

    splitOffscreenCache.pageId = page.id;
    splitOffscreenCache.revision = rev;
    splitOffscreenCache.scale = quantizedScale;
    splitOffscreenCache.isDark = isDark;
    splitOffscreenCache.pw = pw;
    splitOffscreenCache.ph = ph;
    return splitOffscreenCache.surface.canvas;
  }
