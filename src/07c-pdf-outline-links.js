  // ============================================================================
  // 11D. TABLE DES MATIÈRES PDF (OUTLINE), LIENS INTERNES & LIMITE CONFIGURABLE
  // ============================================================================

  const PDF_MAX_PAGES_STORAGE_KEY = 'inkflow.pdf.maxImportPages.v1';
  const PDF_DEFAULT_MAX_IMPORT_PAGES = 100;

  // 0 signifie « illimité » (grâce au Lazy Loading {k-1, k, k+1})
  let configuredPdfMaxImportPages = null;

  function getPdfMaxImportPages() {
    if (configuredPdfMaxImportPages !== null) return configuredPdfMaxImportPages;
    try {
      const raw = readLocalSetting(PDF_MAX_PAGES_STORAGE_KEY, '');
      if (raw !== '') {
        const parsed = Number(raw);
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 10000) {
          configuredPdfMaxImportPages = parsed;
          return configuredPdfMaxImportPages;
        }
      }
    } catch (_) {}
    return PDF_DEFAULT_MAX_IMPORT_PAGES;
  }

  function setPdfMaxImportPages(limit) {
    const n = Number(limit);
    const clean = (Number.isFinite(n) && n >= 0) ? Math.min(10000, Math.floor(n)) : PDF_DEFAULT_MAX_IMPORT_PAGES;
    configuredPdfMaxImportPages = clean;
    try {
      writeLocalSetting(PDF_MAX_PAGES_STORAGE_KEY, String(clean));
    } catch (_) {}
    const sel = document.getElementById('selectPdfMaxPages');
    if (sel) sel.value = String(clean);
    return clean;
  }

  // Caches mémoire pour la table des matières et les liens internes PDF (purgés dans destroyPdfDocumentResources)
  const pdfOutlineCache = new Map();       // pdfId -> Array<{ id, title, level, pageNumber, pageId, url }>
  const pdfPageLinksCache = new Map();     // `${pdfId}_${pageNumber}` -> Array<{ rect, targetPageNumber, url, title }>
  const pdfNavHistoryStack = [];           // Pile de retour arrière après un saut par lien interne

  function clearPdfOutlineAndLinksCache(pdfId) {
    if (!pdfId) return;
    pdfOutlineCache.delete(pdfId);
    const prefix = `${pdfId}_`;
    for (const k of Array.from(pdfPageLinksCache.keys())) {
      if (k.startsWith(prefix)) pdfPageLinksCache.delete(k);
    }
  }

  async function resolvePdfDestinationToPageNumber(pdfDoc, dest) {
    if (!pdfDoc || !dest) return null;
    try {
      let resolved = dest;
      if (typeof dest === 'string' && typeof pdfDoc.getDestination === 'function') {
        resolved = await pdfDoc.getDestination(dest);
      }
      if (!Array.isArray(resolved) || resolved.length === 0) return null;
      const ref = resolved[0];
      let pageIndex = -1;
      if (typeof ref === 'number' && Number.isInteger(ref)) {
        pageIndex = ref;
      } else if (ref && typeof ref === 'object' && typeof pdfDoc.getPageIndex === 'function') {
        pageIndex = await pdfDoc.getPageIndex(ref);
      }
      if (!Number.isInteger(pageIndex) || pageIndex < 0) return null;
      return { pageNumber: pageIndex + 1 };
    } catch (_) {
      return null;
    }
  }

  async function extractPdfOutlineTree(pdfDoc, pages = []) {
    if (!pdfDoc || typeof pdfDoc.getOutline !== 'function') return [];
    let rawOutline = null;
    try {
      rawOutline = await pdfDoc.getOutline();
    } catch (_) {
      return [];
    }
    if (!Array.isArray(rawOutline) || rawOutline.length === 0) return [];

    const pageByPdfNum = new Map();
    (pages || []).forEach((p) => {
      if (p && p.pdfPageNumber) pageByPdfNum.set(Number(p.pdfPageNumber), p);
    });

    const out = [];
    const walk = async (items, level) => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (!item) continue;
        const title = String(item.title || '').trim() || 'Section';
        let pageNumber = null;
        if (item.dest) {
          const resolved = await resolvePdfDestinationToPageNumber(pdfDoc, item.dest);
          if (resolved && resolved.pageNumber) pageNumber = resolved.pageNumber;
        }
        const matchedPage = pageNumber ? pageByPdfNum.get(pageNumber) : null;
        const safeUrl = typeof item.url === 'string' && /^https?:\/\//i.test(item.url) ? item.url : null;
        if (pageNumber || safeUrl) {
          out.push({
            id: createUid('pdfout'),
            title,
            level: Math.max(1, Math.min(4, level)),
            pageNumber: pageNumber || null,
            pageId: matchedPage ? matchedPage.id : null,
            url: safeUrl,
            isPdfOutline: true
          });
        }
        if (Array.isArray(item.items) && item.items.length > 0 && out.length < 500) {
          await walk(item.items, level + 1);
        }
      }
    };
    await walk(rawOutline, 1);
    return out;
  }

  async function ensurePdfOutlineLoadedForNotebook(nb) {
    if (!nb) return [];
    const pages = state.pagesByNotebook.get(nb.id) || [];
    const pdfId = nb.pdfId || (pages.find((p) => p.pdfId) || {}).pdfId;
    if (!pdfId) return [];
    if (pdfOutlineCache.has(pdfId)) return pdfOutlineCache.get(pdfId);
    if (Array.isArray(nb.pdfOutline) && nb.pdfOutline.length > 0) {
      pdfOutlineCache.set(pdfId, nb.pdfOutline);
      return nb.pdfOutline;
    }
    try {
      const pdfDoc = await getOrLoadPdfDocument(pdfId);
      if (!pdfDoc) return [];
      const tree = await extractPdfOutlineTree(pdfDoc, pages);
      pdfOutlineCache.set(pdfId, tree);
      if (tree.length > 0) {
        nb.pdfOutline = tree;
        db.saveNotebook(nb).catch(() => {});
      }
      return tree;
    } catch (_) {
      return [];
    }
  }

  async function extractAndCachePdfPageLinks(pdfDoc, pdfPage, page) {
    if (!pdfDoc || !pdfPage || !page || !page.pdfId || !page.pdfPageNumber) return [];
    const cacheKey = `${page.pdfId}_${page.pdfPageNumber}`;
    if (pdfPageLinksCache.has(cacheKey)) return pdfPageLinksCache.get(cacheKey);
    if (typeof pdfPage.getAnnotations !== 'function') {
      pdfPageLinksCache.set(cacheKey, []);
      return [];
    }

    let annotations = [];
    try {
      annotations = await pdfPage.getAnnotations({ intent: 'display' });
    } catch (_) {
      pdfPageLinksCache.set(cacheKey, []);
      return [];
    }
    if (!Array.isArray(annotations) || annotations.length === 0) {
      pdfPageLinksCache.set(cacheKey, []);
      return [];
    }

    const vp = pdfPage.getViewport({ scale: 1 });
    const worldW = page.pdfWidth || vp.width || PAGE_WIDTH;
    const worldH = page.pdfHeight || vp.height || PAGE_HEIGHT;
    const scaleX = worldW / Math.max(1, vp.width || worldW);
    const scaleY = worldH / Math.max(1, vp.height || worldH);

    const links = [];
    for (const ann of annotations) {
      if (!ann || ann.subtype !== 'Link' || !Array.isArray(ann.rect) || ann.rect.length < 4) continue;
      let rectCanvas = null;
      if (typeof vp.convertToViewportRectangle === 'function') {
        rectCanvas = vp.convertToViewportRectangle(ann.rect);
      } else {
        const [rx1, ry1, rx2, ry2] = ann.rect;
        rectCanvas = [rx1, vp.height - ry2, rx2, vp.height - ry1];
      }
      const x1 = Math.min(rectCanvas[0], rectCanvas[2]) * scaleX;
      const y1 = Math.min(rectCanvas[1], rectCanvas[3]) * scaleY;
      const x2 = Math.max(rectCanvas[0], rectCanvas[2]) * scaleX;
      const y2 = Math.max(rectCanvas[1], rectCanvas[3]) * scaleY;
      const w = Math.max(4, x2 - x1);
      const h = Math.max(4, y2 - y1);

      let targetPageNumber = null;
      if (ann.dest) {
        const resolved = await resolvePdfDestinationToPageNumber(pdfDoc, ann.dest);
        if (resolved && resolved.pageNumber) targetPageNumber = resolved.pageNumber;
      }
      const safeUrl = typeof ann.url === 'string' && /^https?:\/\//i.test(ann.url) ? ann.url : null;
      if (!targetPageNumber && !safeUrl) continue;

      links.push({
        rect: { x: x1, y: y1, w, h },
        targetPageNumber,
        url: safeUrl,
        title: targetPageNumber ? `Aller à la page ${targetPageNumber}` : safeUrl
      });
    }

    pdfPageLinksCache.set(cacheKey, links);
    return links;
  }

  function getCachedPdfLinksForPage(page) {
    if (!page || !page.pdfId || !page.pdfPageNumber) return [];
    const cacheKey = `${page.pdfId}_${page.pdfPageNumber}`;
    return pdfPageLinksCache.get(cacheKey) || [];
  }

  function findPdfLinkAtWorldPoint(page, wx, wy) {
    const links = getCachedPdfLinksForPage(page);
    for (let i = 0; i < links.length; i++) {
      const r = links[i].rect;
      if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) {
        return links[i];
      }
    }
    return null;
  }

  function updatePdfLinkBackPillUi() {
    const pill = document.getElementById('pdfLinkBackPill');
    const label = document.getElementById('pdfLinkBackLabel');
    if (!pill) return;
    const top = pdfNavHistoryStack.length > 0 ? pdfNavHistoryStack[pdfNavHistoryStack.length - 1] : null;
    const visible = Boolean(top && top.notebookId === state.activeNotebookId && top.pageId !== state.activePageId);
    pill.classList.toggle('hidden', !visible);
    if (visible && label) {
      label.textContent = `Revenir p. ${top.pageNumber}`;
    }
  }

  function navigateBackFromPdfLink() {
    const top = pdfNavHistoryStack.pop();
    if (!top) {
      updatePdfLinkBackPillUi();
      return false;
    }
    if (top.notebookId === state.activeNotebookId) {
      selectPage(top.pageId);
    }
    updatePdfLinkBackPillUi();
    return true;
  }

  function activatePdfLink(link, sourcePage = getActivePage()) {
    if (!link) return false;
    if (link.targetPageNumber) {
      const pages = getActiveNotebookPages();
      const target = pages.find((p) => Number(p.pdfPageNumber) === Number(link.targetPageNumber))
        || pages[link.targetPageNumber - 1];
      if (!target) return false;
      if (sourcePage && sourcePage.id !== target.id) {
        const srcIdx = pages.findIndex((p) => p.id === sourcePage.id);
        pdfNavHistoryStack.push({
          notebookId: state.activeNotebookId,
          pageId: sourcePage.id,
          pageNumber: sourcePage.pdfPageNumber || (srcIdx >= 0 ? srcIdx + 1 : 1)
        });
        if (pdfNavHistoryStack.length > 20) pdfNavHistoryStack.shift();
      }
      selectPage(target.id);
      updatePdfLinkBackPillUi();
      showToast(`Page ${link.targetPageNumber}`);
      return true;
    }
    if (link.url && /^https?:\/\//i.test(link.url)) {
      try {
        if (typeof window !== 'undefined' && typeof window.open === 'function') {
          window.open(link.url, '_blank', 'noopener,noreferrer');
        }
        return true;
      } catch (_) {}
    }
    return false;
  }

  function drawPdfLinkHintsOverlay(targetCtx, page) {
    if (!page || !page.pdfId) return;
    const links = getCachedPdfLinksForPage(page);
    if (!links || links.length === 0) return;
    if (state.tool !== 'pan' && !state.ctrlKeyPressed) return;
    targetCtx.save();
    targetCtx.fillStyle = 'rgba(37, 99, 235, 0.08)';
    targetCtx.strokeStyle = 'rgba(37, 99, 235, 0.45)';
    targetCtx.lineWidth = Math.max(0.8, 1.2 / Math.max(0.3, state.zoom));
    for (let i = 0; i < links.length; i++) {
      const r = links[i].rect;
      targetCtx.fillRect(r.x, r.y, r.w, r.h);
      targetCtx.strokeRect(r.x, r.y, r.w, r.h);
    }
    targetCtx.restore();
  }
