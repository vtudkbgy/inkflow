  // ============================================================================
  // 15. BARRE LATÉRALE, MINIATURES & SAUVEGARDE INDEXEDDB
  // ============================================================================

  const SAVE_DEBOUNCE_DELAY_MS = 500;
  const pageSaveTimers = new Map(); // pageId -> { timerId, page }
  const inFlightPageSaves = new Map(); // pageId -> Promise

  function hasPendingPageSave(pageId = state.activePageId) {
    return Boolean(pageId && pageSaveTimers.has(pageId));
  }

  const thumbnailImageCache = new Map();

  function getCachedThumbnailImage(imgItem) {
    if (!imgItem || !imgItem.src || typeof Image === 'undefined') return null;
    const key = imgItem.id || imgItem.src.slice(0, 64);
    let cached = thumbnailImageCache.get(key);
    if (!cached) {
      if (thumbnailImageCache.size > 32) {
        const oldestKey = thumbnailImageCache.keys().next().value;
        if (oldestKey) thumbnailImageCache.delete(oldestKey);
      }
      const el = new Image();
      el.src = imgItem.src;
      cached = el;
      thumbnailImageCache.set(key, cached);
    }
    return (cached && cached.complete && cached.naturalWidth > 0) ? cached : null;
  }

  function generatePageThumbnail(page) {
    const tc = document.createElement('canvas');
    const sc = 0.16;
    const pw = (page && page.pdfWidth) ? page.pdfWidth : PAGE_WIDTH;
    const ph = (page && page.pdfHeight) ? page.pdfHeight : PAGE_HEIGHT;
    tc.width = Math.max(1, Math.round(pw * sc));
    tc.height = Math.max(1, Math.round(ph * sc));
    const tCtx = tc.getContext('2d');
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
    const dataUrl = tc.toDataURL('image/png', 0.7);
    releaseCanvasMemory(tc);
    return dataUrl;
  }

  // Pendant un geste, on suspend la sauvegarde différée en attente (Main Thread libre) mais on la mémorise :
  // elle est replanifiée au relâchement si le geste lui-même n'a rien sauvegardé (lasso, laser, tap…)
  let pageSaveDeferredByGesture = null;
  function deferPendingPageSaveDuringGesture(page) {
    if (!page || !page.id) return;
    if (hasPendingPageSave(page.id)) pageSaveDeferredByGesture = page;
    cancelPendingPageSave(page.id);
  }
  function restoreDeferredPageSaveAfterGesture() {
    const page = pageSaveDeferredByGesture;
    if (!page) return;
    const retry = () => {
      if (pageSaveDeferredByGesture !== page) return;
      // Un autre geste est en cours (ex. paume relevée pendant un trait) : on réessaie après lui
      if (state.isDrawing) { setTimeout(retry, 250); return; }
      pageSaveDeferredByGesture = null;
      const stillExists = (state.pagesByNotebook.get(page.notebookId) || []).includes(page);
      if (stillExists && !hasPendingPageSave(page.id) && !inFlightPageSaves.has(page.id)) scheduleSaveActivePage(page);
    };
    setTimeout(retry, 0);
  }

  function cancelPendingPageSave(pageId) {
    if (!pageId) return;
    const pending = pageSaveTimers.get(pageId);
    if (pending && pending.timerId) {
      clearTimeout(pending.timerId);
    }
    pageSaveTimers.delete(pageId);
  }

  function executePageSaveNow(targetPage) {
    if (!targetPage || !targetPage.id) return Promise.resolve();
    const pageId = targetPage.id;
    cancelPendingPageSave(pageId);

    let savePromise = null;
    savePromise = (async () => {
      try {
        try {
          targetPage.thumbnail = generatePageThumbnail(targetPage);
        } catch (thumbErr) {
          // Une miniature impossible à générer ne doit jamais empêcher la sauvegarde de la page
          console.warn('[InkFlow] Miniature non générée :', thumbErr);
        }
        targetPage.updatedAt = Date.now();
        await db.savePage(targetPage);
        await db.saveWorkspaceState({ activeNotebookId: state.activeNotebookId, activePageId: state.activePageId });
        if (typeof notifyLocalNotebookMutatedForDriveSync === 'function' && targetPage.notebookId) {
          notifyLocalNotebookMutatedForDriveSync(targetPage.notebookId);
        }
        if (pageSaveTimers.size === 0 && inFlightPageSaves.size <= 1) {
          if (dom.dbStatusDot) dom.dbStatusDot.classList.remove('saving');
          if (dom.dbStatusText) dom.dbStatusText.textContent = 'IndexedDB synchronisé';
        }
        if (targetPage.notebookId === state.activeNotebookId) {
          updateSingleSidebarThumbnailDom(targetPage);
        }
      } catch (_) {
        if (dom.dbStatusText) dom.dbStatusText.textContent = 'Stockage actif';
      } finally {
        if (inFlightPageSaves.get(pageId) === savePromise) {
          inFlightPageSaves.delete(pageId);
        }
      }
    })();

    inFlightPageSaves.set(pageId, savePromise);
    return savePromise;
  }

  /**
   * Sauvegarde différée (Debounce 500 ms) : déclenche l'écriture dans IndexedDB 500 ms après
   * la fin du dernier trait pour ne jamais bloquer le fil d'exécution principal (Main Thread).
   */
  function scheduleSaveActivePage(explicitPage = null, delayMs = SAVE_DEBOUNCE_DELAY_MS) {
    // Capture la référence exacte de la page au moment de l'action pour éviter toute corruption lors d'un changement de page rapide
    const targetPage = explicitPage || getActivePage();
    if (!targetPage || !targetPage.id) return;
    const pageId = targetPage.id;

    if (dom.dbStatusDot) dom.dbStatusDot.classList.add('saving');
    if (dom.dbStatusText) dom.dbStatusText.textContent = 'Sauvegarde IndexedDB...';

    const existing = pageSaveTimers.get(pageId);
    if (existing && existing.timerId) {
      clearTimeout(existing.timerId);
    }

    const effectiveDelay = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : SAVE_DEBOUNCE_DELAY_MS;
    const timerId = setTimeout(() => {
      pageSaveTimers.delete(pageId);
      executePageSaveNow(targetPage);
    }, effectiveDelay);

    pageSaveTimers.set(pageId, { timerId, page: targetPage });
  }

  async function flushPendingPageSaves() {
    // Inclut une sauvegarde suspendue par un geste en cours (changement de page/cahier, fermeture)
    if (pageSaveDeferredByGesture) {
      const deferredPage = pageSaveDeferredByGesture;
      pageSaveDeferredByGesture = null;
      if ((state.pagesByNotebook.get(deferredPage.notebookId) || []).includes(deferredPage) && !hasPendingPageSave(deferredPage.id)) {
        scheduleSaveActivePage(deferredPage);
      }
    }
    const pendingEntries = Array.from(pageSaveTimers.values());
    pageSaveTimers.clear();
    for (const entry of pendingEntries) {
      if (entry.timerId) clearTimeout(entry.timerId);
      if (entry.page) {
        executePageSaveNow(entry.page);
      }
    }
    if (inFlightPageSaves.size > 0) {
      await Promise.allSettled(Array.from(inFlightPageSaves.values()));
    }
  }

  function getFolderPath(folderId) {
    const chain = [];
    let cur = folderId;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const f = (state.folders || []).find((x) => x.id === cur);
      if (!f) break;
      chain.unshift(f);
      cur = f.parentId || null;
    }
    return chain;
  }

  const FOLDER_ICON_SVGS = {
    folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    book: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    math: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M18 4H6l6 8-6 8h12"/></svg>',
    calc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M18 4H6l6 8-6 8h12"/></svg>',
    code: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    science: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/></svg>',
    atom: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.8" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(90 12 12)"/></svg>',
    grad: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',
    star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    briefcase: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    art: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
    music: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
  };

  function getFolderIconSvg(iconKey) {
    return FOLDER_ICON_SVGS[iconKey] || FOLDER_ICON_SVGS.folder;
  }

  async function moveNotebookToTrash(nbId) {
    const nb = state.notebooks.find((n) => n.id === nbId);
    if (!nb) return false;
    const activeNonTrashed = state.notebooks.filter((n) => !n.trashedAt && n.id !== nbId);
    if (activeNonTrashed.length === 0) {
      showToast('Impossible de mettre le dernier cahier actif à la corbeille');
      return false;
    }
    nb.trashedAt = Date.now();
    nb.updatedAt = Date.now();
    await db.saveNotebook(nb);
    if (state.activeNotebookId === nbId) {
      selectNotebook(activeNonTrashed[0].id);
    } else {
      renderNotebooksSidebar();
      syncOpenTabsWithActiveNotebook();
    }
    showToast(`« ${nb.title} » déplacé dans la Corbeille`);
    return true;
  }

  async function restoreNotebookFromTrash(nbId) {
    const nb = state.notebooks.find((n) => n.id === nbId);
    if (!nb) return false;
    nb.trashedAt = null;
    nb.updatedAt = Date.now();
    await db.saveNotebook(nb);
    renderNotebooksSidebar();
    showToast(`« ${nb.title} » restauré`);
    return true;
  }

  async function emptyTrash() {
    const trashedNbs = state.notebooks.filter((n) => Boolean(n.trashedAt));
    const trashedFlds = (state.folders || []).filter((f) => Boolean(f.trashedAt));
    if (trashedNbs.length === 0 && trashedFlds.length === 0) return 0;
    let deletedCount = 0;
    for (const nb of trashedNbs) {
      const ok = await deleteNotebookById(nb.id);
      if (ok) deletedCount++;
    }
    if (trashedFlds.length > 0) {
      const trashedIds = new Set(trashedFlds.map((f) => f.id));
      state.folders = (state.folders || []).filter((f) => !trashedIds.has(f.id));
      deletedCount += trashedFlds.length;
      await db.saveFolders(state.folders);
    }
    renderNotebooksSidebar();
    showToast(`Corbeille vidée (${deletedCount} élément${deletedCount > 1 ? 's' : ''})`);
    return deletedCount;
  }

  function isFolderDescendant(candidateId, ancestorId) {
    if (!candidateId || !ancestorId) return false;
    if (candidateId === ancestorId) return true;
    const seen = new Set();
    let cur = candidateId;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const f = (state.folders || []).find((x) => x.id === cur);
      if (!f) break;
      if (f.parentId === ancestorId) return true;
      cur = f.parentId || null;
    }
    return false;
  }

  function moveFolderToParent(folderId, targetParentId) {
    const fld = (state.folders || []).find((f) => f.id === folderId && !f.trashedAt);
    if (!fld) return false;
    const nextParent = targetParentId || null;
    if ((fld.parentId || null) === nextParent) return false;
    if (nextParent && isFolderDescendant(nextParent, folderId)) {
      showToast('Impossible de déplacer un dossier dans lui-même.', 'error');
      return false;
    }
    fld.parentId = nextParent;
    fld.updatedAt = Date.now();
    db.saveFolders(state.folders);
    renderNotebooksSidebar();
    const targetFolder = nextParent ? (state.folders || []).find((f) => f.id === nextParent) : null;
    showToast(`Dossier « ${fld.name} » déplacé dans ${targetFolder ? `« ${targetFolder.name} »` : 'Documents'}`);
    return true;
  }

  async function moveFolderToTrash(folderId) {
    const fld = (state.folders || []).find((f) => f.id === folderId);
    if (!fld || fld.trashedAt) return false;
    const now = Date.now();
    fld.trashedAt = now;
    fld.updatedAt = now;
    if (state.currentFolderId && isFolderDescendant(state.currentFolderId, folderId)) {
      state.currentFolderId = fld.parentId || null;
    }
    await db.saveFolders(state.folders);
    renderNotebooksSidebar();
    showToast(`Dossier « ${fld.name} » déplacé dans la Corbeille`);
    return true;
  }

  async function restoreFolderFromTrash(folderId) {
    const fld = (state.folders || []).find((f) => f.id === folderId);
    if (!fld) return false;
    fld.trashedAt = null;
    if (fld.parentId) {
      const parent = (state.folders || []).find((f) => f.id === fld.parentId && !f.trashedAt);
      if (!parent) fld.parentId = null;
    }
    fld.updatedAt = Date.now();
    await db.saveFolders(state.folders);
    renderNotebooksSidebar();
    showToast(`Dossier « ${fld.name} » restauré`);
    return true;
  }

  async function deleteFolderPermanently(folderId) {
    const fld = (state.folders || []).find((f) => f.id === folderId);
    if (!fld) return false;
    const parentId = fld.parentId || null;
    (state.folders || []).forEach((sub) => { if (sub.parentId === folderId) sub.parentId = parentId; });
    (state.notebooks || []).forEach((nb) => {
      if (nb.folderId === folderId) {
        nb.folderId = parentId;
        db.saveNotebook(nb);
      }
    });
    state.folders = (state.folders || []).filter((x) => x.id !== folderId);
    if (state.currentFolderId === folderId) state.currentFolderId = parentId;
    await db.saveFolders(state.folders);
    renderNotebooksSidebar();
    showToast(`Dossier « ${fld.name} » supprimé définitivement`);
    return true;
  }

  async function duplicateNotebookById(nbId) {
    const srcNb = (state.notebooks || []).find((n) => n.id === nbId);
    if (!srcNb) return null;
    await flushPendingPageSaves();
    const srcPages = state.pagesByNotebook.get(nbId) || [];
    const now = Date.now();
    const copyNb = {
      ...srcNb,
      id: createUid('nb'),
      title: `${srcNb.title} (copie)`,
      trashedAt: null,
      createdAt: now,
      updatedAt: now
    };
    const pageIdMap = new Map();
    const copiedPages = srcPages.map((pg, idx) => {
      const cloned = clonePageContent(pg);
      const newId = createUid('pg');
      pageIdMap.set(pg.id, newId);
      return {
        ...pg,
        id: newId,
        notebookId: copyNb.id,
        order: idx,
        strokes: cloned.strokes,
        shapes: cloned.shapes,
        texts: cloned.texts,
        tapes: cloned.tapes,
        images: cloned.images,
        createdAt: now,
        updatedAt: now
      };
    });
    // Le plan de la copie pointe vers ses propres pages (et non vers celles de l'original)
    copyNb.outline = Array.isArray(srcNb.outline)
      ? srcNb.outline
        .filter((entry) => entry && pageIdMap.has(entry.pageId))
        .map((entry) => ({ ...entry, id: createUid('out'), pageId: pageIdMap.get(entry.pageId) }))
      : [];
    state.notebooks.push(copyNb);
    state.pagesByNotebook.set(copyNb.id, copiedPages);
    await db.saveNotebook(copyNb);
    for (const p of copiedPages) {
      await db.savePage(p);
    }
    renderNotebooksSidebar();
    showToast(`« ${copyNb.title} » dupliqué`);
    return copyNb;
  }

  const PAPER_TYPE_LABELS = {
    blank: 'Vierge',
    lined: 'Ligné',
    grid: 'Quadrillé',
    dotted: 'Pointillé',
    seyes: 'Seyès',
    millimeter: 'Millimétré',
    isometric: 'Isométrique',
    cornell: 'Cornell',
    music: 'Portée',
    planner: 'Agenda'
  };

  function formatCompactDate(ts) {
    if (!ts || !Number.isFinite(Number(ts))) return '';
    try {
      const d = new Date(Number(ts));
      if (Number.isNaN(d.getTime())) return '';
      const now = new Date();
      const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      if (sameDay) return "Aujourd'hui";
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()) {
        return 'Hier';
      }
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch (_) {
      return '';
    }
  }

  function getFolderItemCounts(folderId) {
    const folders = state.folders || [];
    const notebooks = state.notebooks || [];
    const visited = new Set();
    let subfolders = 0;
    let notebookCount = 0;

    function visit(fid) {
      if (!fid || visited.has(fid)) return;
      visited.add(fid);
      for (let i = 0; i < notebooks.length; i++) {
        const nb = notebooks[i];
        if (!nb.trashedAt && nb.folderId === fid) notebookCount++;
      }
      for (let i = 0; i < folders.length; i++) {
        const sub = folders[i];
        if (!sub.trashedAt && sub.parentId === fid && !visited.has(sub.id)) {
          subfolders++;
          visit(sub.id);
        }
      }
    }

    visit(folderId);
    return {
      notebooks: notebookCount,
      subfolders,
      total: notebookCount + subfolders
    };
  }

  function formatFolderItemCountLabel(counts) {
    if (!counts || counts.total <= 0) return '0 élément';
    const parts = [];
    if (counts.notebooks > 0) parts.push(`${counts.notebooks} cahier${counts.notebooks > 1 ? 's' : ''}`);
    if (counts.subfolders > 0) parts.push(`${counts.subfolders} sous-dossier${counts.subfolders > 1 ? 's' : ''}`);
    return parts.join(' • ') || `${counts.total} élément${counts.total > 1 ? 's' : ''}`;
  }

  let draggedNotebookId = null;

  function clearLibraryDragOverClasses() {
    if (dom.notebookList && typeof dom.notebookList.querySelectorAll === 'function') {
      dom.notebookList.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    }
    const crumbEl = document.getElementById('folderBreadcrumb');
    if (crumbEl && typeof crumbEl.querySelectorAll === 'function') {
      crumbEl.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    }
  }

  function moveNotebookToFolder(nbId, targetFolderId) {
    if (!nbId) return false;
    const nb = (state.notebooks || []).find((n) => n.id === nbId && !n.trashedAt);
    if (!nb) return false;
    const nextFolderId = targetFolderId || null;
    if ((nb.folderId || null) === nextFolderId) return false;
    nb.folderId = nextFolderId;
    nb.updatedAt = Date.now();
    db.saveNotebook(nb);
    renderNotebooksSidebar();
    const targetFolder = nextFolderId ? (state.folders || []).find((f) => f.id === nextFolderId) : null;
    const destLabel = targetFolder ? `« ${targetFolder.name} »` : 'Documents';
    showToast(`« ${nb.title} » déplacé dans ${destLabel}`);
    return true;
  }

  function syncSortControlsUi() {
    const sortBy = state.notebookSortBy || 'date_desc';
    const isNameSort = sortBy === 'name_asc' || sortBy === 'name_desc' || state.sidebarSort === 'name';
    state.sidebarSort = isNameSort ? 'name' : 'date';
    const sortSelect = document.getElementById('notebookSortSelect');
    if (sortSelect && sortSelect.value !== sortBy) {
      sortSelect.value = sortBy;
    }
    const btnSortDocs = document.getElementById('btnSortDocs');
    if (btnSortDocs) {
      btnSortDocs.dataset.sort = state.sidebarSort;
      btnSortDocs.classList.toggle('active', state.sidebarSort === 'name');
      btnSortDocs.title = state.sidebarSort === 'name'
        ? 'Tri alphabétique actif — Cliquer pour trier par date'
        : 'Tri par date actif — Cliquer pour trier par nom';
    }
    const btnSortDocsLabel = document.getElementById('btnSortDocsLabel');
    if (btnSortDocsLabel) {
      btnSortDocsLabel.textContent = state.sidebarSort === 'name' ? 'Nom' : 'Date';
    }
  }

  function renderNotebooksSidebar() {
    dom.notebookList.innerHTML = '';
    dom.notebookList.classList.toggle('gn-library-grid', state.libraryViewMode === 'grid');
    syncSortControlsUi();

    const search = (state.sidebarSearch || '').trim().toLowerCase();
    const filter = state.sidebarFilter || 'all';
    const favOnly = filter === 'favorites';
    const recentsOnly = filter === 'recents';
    const trashOnly = filter === 'trash';
    const showGlobal = Boolean(search || favOnly || recentsOnly || trashOnly);

    const trashBar = document.getElementById('trashActionBar');
    const trashCountLabel = document.getElementById('trashCountLabel');
    const trashedTotal = state.notebooks.filter((nb) => Boolean(nb.trashedAt)).length;
    if (trashBar) {
      trashBar.classList.toggle('hidden', !trashOnly);
      if (trashCountLabel) {
        trashCountLabel.textContent = `${trashedTotal} élément${trashedTotal > 1 ? 's' : ''} dans la corbeille`;
      }
    }

    const sortBy = state.notebookSortBy || (state.sidebarSort === 'name' ? 'name_asc' : 'date_desc');
    const sortFoldersFn = (a, b) => {
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' });
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '', 'fr', { sensitivity: 'base' });
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    };
    const sortNotebooksFn = (a, b) => {
      if (recentsOnly || sortBy === 'date_desc') {
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      }
      if (sortBy === 'name_asc') return (a.title || '').localeCompare(b.title || '', 'fr', { sensitivity: 'base' });
      if (sortBy === 'name_desc') return (b.title || '').localeCompare(a.title || '', 'fr', { sensitivity: 'base' });
      if (sortBy === 'type') {
        const aPdf = a.isPdfNotebook || a.pdfId ? 1 : 0;
        const bPdf = b.isPdfNotebook || b.pdfId ? 1 : 0;
        if (bPdf !== aPdf) return bPdf - aPdf;
        return (a.title || '').localeCompare(b.title || '', 'fr', { sensitivity: 'base' });
      }
      return 0;
    };

    // 1. Dossiers Goodnotes (masqués dans Récents et Corbeille)
    const visibleFolders = (trashOnly || recentsOnly) ? [] : (state.folders || []).filter((f) => {
      if (f.trashedAt) return false;
      if (favOnly && !f.starred) return false;
      if (search) return (f.name || '').toLowerCase().includes(search);
      if (!showGlobal) return (f.parentId || null) === (state.currentFolderId || null);
      return true;
    }).sort(sortFoldersFn);

    // 2. Cahiers
    const nonTrashedCount = state.notebooks.filter((n) => !n.trashedAt).length;
    const visibleNotebooks = state.notebooks.filter((nb) => {
      const isTrashed = Boolean(nb.trashedAt);
      if (trashOnly) return isTrashed;
      if (isTrashed) return false;
      if (favOnly && !nb.starred) return false;
      if (search) return (nb.title || '').toLowerCase().includes(search);
      if (!showGlobal) return (nb.folderId || null) === (state.currentFolderId || null);
      return true;
    }).sort(sortNotebooksFn);

    // Fil d'Ariane Goodnotes (Documents > Dossier > Sous-dossier) + Cible Drag & Drop vers parent/racine
    const crumbEl = document.getElementById('folderBreadcrumb');
    if (crumbEl) {
      if (state.currentFolderId && !showGlobal) {
        crumbEl.classList.remove('hidden');
        const chain = getFolderPath(state.currentFolderId);
        const currentTotal = visibleFolders.length + visibleNotebooks.length;
        crumbEl.innerHTML = `<button class="gn-crumb-btn" data-folder-nav="">📁 Documents</button>` +
          chain.map((f) => `<span class="gn-crumb-sep">›</span><button class="gn-crumb-btn" data-folder-nav="${f.id}">${escapeHtml(f.name)}</button>`).join('') +
          `<span class="gn-crumb-count">${currentTotal}</span>`;
        crumbEl.querySelectorAll('[data-folder-nav]').forEach((b) => {
          b.addEventListener('click', () => {
            state.currentFolderId = b.dataset.folderNav || null;
            renderNotebooksSidebar();
          });
          b.addEventListener('dragover', (ev) => {
            if (!draggedNotebookId && !(ev.dataTransfer && ev.dataTransfer.types && Array.from(ev.dataTransfer.types).includes('text/inkflow-notebook'))) return;
            ev.preventDefault();
            if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
            b.classList.add('drag-over');
          });
          b.addEventListener('dragleave', () => {
            b.classList.remove('drag-over');
          });
          b.addEventListener('drop', (ev) => {
            ev.preventDefault();
            b.classList.remove('drag-over');
            let nbId = draggedNotebookId;
            if (!nbId && ev.dataTransfer && typeof ev.dataTransfer.getData === 'function') {
              try { nbId = ev.dataTransfer.getData('text/inkflow-notebook') || ev.dataTransfer.getData('text/plain'); } catch (_) {}
            }
            draggedNotebookId = null;
            clearLibraryDragOverClasses();
            if (nbId) moveNotebookToFolder(nbId, b.dataset.folderNav || null);
          });
        });
      } else {
        crumbEl.classList.add('hidden');
        crumbEl.innerHTML = '';
      }
    }

    visibleFolders.forEach((folder) => {
      const counts = getFolderItemCounts(folder.id);
      const countLabel = formatFolderItemCountLabel(counts);
      const fCard = document.createElement('div');
      fCard.className = 'gn-folder-card';
      fCard.dataset.folderId = folder.id;
      fCard.innerHTML = `
        <div class="gn-folder-icon" style="background:${folder.color || '#0072ce'};color:#ffffff;">${getFolderIconSvg(folder.icon || 'folder')}</div>
        <div class="notebook-info">
          <div class="notebook-name">${escapeHtml(folder.name)}</div>
          <div class="notebook-meta">${countLabel}</div>
        </div>
        <div class="notebook-actions">
          <button class="icon-btn-tiny${folder.starred ? ' starred' : ''}" data-folder-action="star" title="Favori">${folder.starred ? '★' : '☆'}</button>
          <button class="icon-btn-tiny" data-folder-action="customize" title="Couleur et icône">✎</button>
          <button class="icon-btn-tiny danger" data-folder-action="delete" title="Supprimer le dossier">✕</button>
        </div>
      `;
      fCard.addEventListener('dragover', (ev) => {
        if (!draggedNotebookId && !(ev.dataTransfer && ev.dataTransfer.types && Array.from(ev.dataTransfer.types).includes('text/inkflow-notebook'))) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
        fCard.classList.add('drag-over');
      });
      fCard.addEventListener('dragleave', (ev) => {
        if (ev.relatedTarget && typeof fCard.contains === 'function' && fCard.contains(ev.relatedTarget)) return;
        fCard.classList.remove('drag-over');
      });
      fCard.addEventListener('drop', (ev) => {
        ev.preventDefault();
        fCard.classList.remove('drag-over');
        let nbId = draggedNotebookId;
        if (!nbId && ev.dataTransfer && typeof ev.dataTransfer.getData === 'function') {
          try { nbId = ev.dataTransfer.getData('text/inkflow-notebook') || ev.dataTransfer.getData('text/plain'); } catch (_) {}
        }
        draggedNotebookId = null;
        clearLibraryDragOverClasses();
        if (nbId) moveNotebookToFolder(nbId, folder.id);
      });
      fCard.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-folder-action]');
        if (btn) {
          ev.stopPropagation();
          const act = btn.dataset.folderAction;
          if (act === 'star') {
            folder.starred = !folder.starred;
            db.saveFolders(state.folders);
            renderNotebooksSidebar();
          } else if (act === 'customize' || act === 'rename') {
            openFolderCustomizeModal(folder);
          } else if (act === 'delete') {
            const parentId = folder.parentId || null;
            state.folders.forEach((sub) => { if (sub.parentId === folder.id) sub.parentId = parentId; });
            state.notebooks.forEach((nb) => {
              if (nb.folderId === folder.id) {
                nb.folderId = parentId;
                db.saveNotebook(nb);
              }
            });
            state.folders = state.folders.filter((x) => x.id !== folder.id);
            if (state.currentFolderId === folder.id) state.currentFolderId = parentId;
            db.saveFolders(state.folders);
            renderNotebooksSidebar();
            showToast('Dossier supprimé (contenu déplacé au niveau parent)');
          }
          return;
        }
        state.currentFolderId = folder.id;
        renderNotebooksSidebar();
      });
      dom.notebookList.appendChild(fCard);
    });

    visibleNotebooks.forEach((nb) => {
      const pages = state.pagesByNotebook.get(nb.id) || [];
      const hasPdf = Boolean(nb.isPdfNotebook || nb.pdfId || pages.some((p) => p.pdfId));
      const isActive = nb.id === state.activeNotebookId;
      const firstPaperType = pages[0] && pages[0].paperType ? pages[0].paperType : 'grid';
      const paperLabel = hasPdf ? 'PDF' : (PAPER_TYPE_LABELS[firstPaperType] || 'Quadrillé');
      const dateStr = formatCompactDate(nb.updatedAt || nb.createdAt);
      const card = document.createElement('div');
      card.className = `notebook-card${isActive ? ' active' : ''}`;
      card.dataset.notebookId = nb.id;

      if (trashOnly) {
        card.innerHTML = `
          <div class="notebook-cover-thumb" style="background-color:${nb.coverColor || '#64748b'};opacity:0.65;">
            <div class="notebook-spine"></div>
            <span class="notebook-cover-label"></span>
            ${hasPdf ? '<span class="notebook-cover-pdf-pill">PDF</span>' : ''}
          </div>
          <div class="notebook-info">
            <div class="notebook-name">${escapeHtml(nb.title)}${hasPdf ? '<span class="pdf-badge-tag">PDF</span>' : ''}</div>
            <div class="notebook-meta"><span>${pages.length} p.</span><span class="nb-paper-badge">Corbeille</span></div>
          </div>
          <div class="notebook-actions">
            <button class="icon-btn-tiny" data-action="restore-nb" title="Restaurer ce cahier">↺</button>
            <button class="icon-btn-tiny danger" data-action="purge-nb" title="Supprimer définitivement">✕</button>
          </div>
        `;
      } else {
        card.setAttribute('draggable', 'true');
        card.innerHTML = `
          <div class="notebook-cover-thumb" style="background-color:${nb.coverColor || '#0072ce'}">
            <div class="notebook-spine"></div>
            <span class="notebook-cover-label"></span>
            ${hasPdf ? '<span class="notebook-cover-pdf-pill">PDF</span>' : ''}
          </div>
          <div class="notebook-info">
            <div class="notebook-name">${escapeHtml(nb.title)}${hasPdf ? '<span class="pdf-badge-tag">PDF</span>' : ''}</div>
            <div class="notebook-meta">
              <span>${pages.length} page${pages.length > 1 ? 's' : ''}</span>
              <span class="nb-paper-badge">${escapeHtml(paperLabel)}</span>
              ${dateStr ? `<span class="nb-date-meta">${escapeHtml(dateStr)}</span>` : ''}
            </div>
          </div>
          <div class="notebook-actions">
            <button class="icon-btn-tiny${nb.starred ? ' starred' : ''}" data-action="star-nb" title="Favori">${nb.starred ? '★' : '☆'}</button>
            <button class="icon-btn-tiny${nb.driveTarget ? ' has-drive-target' : ''}" data-action="drive-target-nb" title="${escapeHtml(typeof describeNotebookDriveTarget === 'function' ? `Google Drive : ${describeNotebookDriveTarget(nb)}` : 'Choisir le fichier Google Drive')}">☁</button>
            <button class="icon-btn-tiny" data-action="move-nb" title="Déplacer dans un dossier">📁</button>
            <button class="icon-btn-tiny" data-action="rename-nb" title="Renommer">✎</button>
            ${nonTrashedCount > 1 ? `<button class="icon-btn-tiny danger" data-action="delete-nb" title="Mettre à la corbeille">✕</button>` : ''}
          </div>
        `;
        card.addEventListener('dragstart', (ev) => {
          draggedNotebookId = nb.id;
          card.classList.add('dragging');
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = 'move';
            try {
              ev.dataTransfer.setData('text/inkflow-notebook', nb.id);
              ev.dataTransfer.setData('text/plain', nb.id);
            } catch (_) {}
          }
        });
        card.addEventListener('dragend', () => {
          draggedNotebookId = null;
          card.classList.remove('dragging');
          clearLibraryDragOverClasses();
        });
      }
      card.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-action]');
        if (btn) {
          ev.stopPropagation();
          if (btn.dataset.action === 'star-nb') {
            nb.starred = !nb.starred;
            nb.updatedAt = Date.now();
            db.saveNotebook(nb);
            renderNotebooksSidebar();
          } else if (btn.dataset.action === 'drive-target-nb') {
            if (typeof promptNotebookDriveTarget === 'function') promptNotebookDriveTarget(nb);
          } else if (btn.dataset.action === 'move-nb') {
            openMoveNotebookModal(nb);
          } else if (btn.dataset.action === 'rename-nb') {
            openRenameModal('Renommer le cahier', nb.title, (val) => {
              nb.title = val;
              nb.updatedAt = Date.now();
              db.saveNotebook(nb);
              renderNotebooksSidebar();
              updateBreadcrumbs();
            });
          } else if (btn.dataset.action === 'delete-nb') {
            moveNotebookToTrash(nb.id);
          } else if (btn.dataset.action === 'restore-nb') {
            restoreNotebookFromTrash(nb.id);
          } else if (btn.dataset.action === 'purge-nb') {
            deleteNotebookById(nb.id);
          }
          return;
        }
        if (trashOnly) {
          restoreNotebookFromTrash(nb.id);
          return;
        }
        selectNotebook(nb.id);
      });
      dom.notebookList.appendChild(card);
    });
    if (state.filesPageOpen && typeof renderGnFilesPage === 'function') {
      renderGnFilesPage();
    }
  }

  async function rotatePageById(pageId, deltaDeg = 90) {
    const pages = getActiveNotebookPages();
    const p = pages.find((x) => x.id === pageId) || getActivePage();
    if (!p) return null;
    p.rotation = (((p.rotation || 0) + deltaDeg) % 360 + 360) % 360;
    const oldW = p.pdfWidth || PAGE_WIDTH;
    const oldH = p.pdfHeight || PAGE_HEIGHT;
    if (Math.abs(deltaDeg) % 180 === 90) {
      p.pdfWidth = oldH;
      p.pdfHeight = oldW;
      (p.strokes || []).forEach((s) => {
        s.points = (s.points || []).map((pt) => ({
          ...pt,
          x: Math.max(24, oldH - pt.y),
          y: pt.x
        }));
        invalidateStrokeCache(s);
      });
      (p.shapes || []).forEach((sh) => {
        const nx1 = Math.max(24, oldH - sh.y1), ny1 = sh.x1;
        const nx2 = Math.max(24, oldH - sh.y2), ny2 = sh.x2;
        sh.x1 = nx1; sh.y1 = ny1; sh.x2 = nx2; sh.y2 = ny2;
        if (Array.isArray(sh.vertices)) {
          sh.vertices = sh.vertices.map((v) => ({ x: Math.max(24, oldH - v.y), y: v.x }));
        }
      });
    }
    p.thumbnail = generatePageThumbnail(p);
    invalidateStaticInkCache();
    renderPagesSidebar();
    requestRender();
    await db.savePage(p);
    showToast(`Page pivotée (${p.rotation}°)`);
    return p;
  }

  async function reorderPagesInActiveNotebook(fromIndex, toIndex) {
    const nb = getActiveNotebook();
    if (!nb) return false;
    const pages = getActiveNotebookPages();
    if (fromIndex < 0 || fromIndex >= pages.length || toIndex < 0 || toIndex >= pages.length || fromIndex === toIndex) {
      return false;
    }
    const [moved] = pages.splice(fromIndex, 1);
    pages.splice(toIndex, 0, moved);
    for (let i = 0; i < pages.length; i++) {
      pages[i].order = i;
      await db.savePage(pages[i]);
    }
    state.pagesByNotebook.set(nb.id, pages);
    renderPagesSidebar();
    updateBreadcrumbs();
    return true;
  }

  async function addOutlineEntryForPage(pageId = state.activePageId, title = '', level = 1) {
    const nb = getActiveNotebook();
    const pages = getActiveNotebookPages();
    const page = pages.find((p) => p.id === pageId) || getActivePage();
    if (!nb || !page) return null;
    if (!Array.isArray(nb.outline)) nb.outline = [];
    const cleanTitle = (title && String(title).trim()) || page.title || `Section p.${(page.order ?? 0) + 1}`;
    const entry = {
      id: createUid('out'),
      pageId: page.id,
      title: cleanTitle,
      level: Math.max(1, Math.min(3, Number(level) || 1)),
      createdAt: Date.now()
    };
    nb.outline.push(entry);
    nb.updatedAt = Date.now();
    await db.saveNotebook(nb);
    renderOutlineSidebar();
    return entry;
  }

  function renderOutlineSidebar() {
    const outlineList = document.getElementById('outlineList');
    if (!outlineList) return;
    const nb = getActiveNotebook();
    const pages = getActiveNotebookPages();
    outlineList.innerHTML = '';
    if (!nb) return;

    const pdfId = nb.pdfId || (pages.find((p) => p.pdfId) || {}).pdfId;
    const cachedPdfOutline = (pdfId && typeof pdfOutlineCache !== 'undefined' && pdfOutlineCache.has(pdfId))
      ? pdfOutlineCache.get(pdfId)
      : (Array.isArray(nb.pdfOutline) ? nb.pdfOutline : null);

    if (pdfId && !cachedPdfOutline && typeof ensurePdfOutlineLoadedForNotebook === 'function') {
      ensurePdfOutlineLoadedForNotebook(nb).then((loaded) => {
        if (loaded && loaded.length > 0 && state.activeNotebookId === nb.id && state.pagesSubTab === 'outline') {
          renderOutlineSidebar();
        }
      }).catch(() => {});
    }

    const pdfEntries = Array.isArray(cachedPdfOutline) ? cachedPdfOutline : [];
    const manualEntries = Array.isArray(nb.outline) ? nb.outline : [];

    const appendOutlineEntry = (entry) => {
      let pageIdx = -1;
      if (entry.pageId) pageIdx = pages.findIndex((p) => p.id === entry.pageId);
      if (pageIdx < 0 && entry.pageNumber) {
        pageIdx = pages.findIndex((p) => Number(p.pdfPageNumber) === Number(entry.pageNumber));
        if (pageIdx < 0 && entry.pageNumber <= pages.length) pageIdx = entry.pageNumber - 1;
      }
      if (pageIdx < 0 && !entry.url) return;
      const targetPage = pageIdx >= 0 ? pages[pageIdx] : null;
      const item = document.createElement('div');
      item.className = `gn-outline-item${targetPage && targetPage.id === state.activePageId ? ' active' : ''}${entry.isPdfOutline ? ' is-pdf-outline' : ''}`;
      item.style.paddingLeft = `${10 + ((entry.level || 1) - 1) * 14}px`;
      item.innerHTML = `
        <span class="gn-outline-title">${escapeHtml(entry.title)}</span>
        <span class="gn-outline-page">${pageIdx >= 0 ? `p.${pageIdx + 1}` : '↗'}</span>
      `;
      item.addEventListener('click', () => {
        if (targetPage) {
          selectPage(targetPage.id);
        } else if (entry.url && /^https?:\/\//i.test(entry.url) && typeof window !== 'undefined' && typeof window.open === 'function') {
          window.open(entry.url, '_blank', 'noopener,noreferrer');
        }
      });
      outlineList.appendChild(item);
    };

    if (pdfEntries.length > 0) {
      const hdr = document.createElement('div');
      hdr.className = 'gn-outline-group-label';
      hdr.textContent = `Table des matières PDF (${pdfEntries.length})`;
      outlineList.appendChild(hdr);
      pdfEntries.forEach(appendOutlineEntry);
    }

    if (manualEntries.length > 0) {
      if (pdfEntries.length > 0) {
        const hdr = document.createElement('div');
        hdr.className = 'gn-outline-group-label';
        hdr.textContent = 'Signets du plan';
        outlineList.appendChild(hdr);
      }
      manualEntries.forEach(appendOutlineEntry);
    } else if (pdfEntries.length === 0) {
      pages.forEach((p, idx) => {
        appendOutlineEntry({
          id: `auto_${p.id}`,
          pageId: p.id,
          title: p.title || `Page ${idx + 1}`,
          level: 1,
          isAuto: true
        });
      });
    }
  }

  let draggedPageIndex = null;

  function renderPagesSidebar() {
    const allPages = getActiveNotebookPages();
    const subTab = state.pagesSubTab || 'pages';
    const filterBookmarks = subTab === 'bookmarks' || state.pagesFilterBookmarks;
    const pages = filterBookmarks ? allPages.filter((p) => p.bookmarked) : allPages;
    dom.sidebarPageCount.textContent = String(allPages.length);

    const outlineWrap = document.getElementById('outlineSectionWrap');
    if (outlineWrap) {
      const showOutline = subTab === 'outline';
      outlineWrap.classList.toggle('hidden', !showOutline);
      dom.pagesGrid.classList.toggle('hidden', showOutline);
      if (showOutline) {
        renderOutlineSidebar();
        updateBreadcrumbs();
        return;
      }
    }

    dom.pagesGrid.innerHTML = '';
    pages.forEach((p) => {
      const realIdx = allPages.indexOf(p);
      if (!p.thumbnail) {
        if (p.pdfId && !p._pdfThumbGenerated) {
          p.thumbnail = generateLazyPdfPlaceholderThumbnail(p.pdfPageNumber || realIdx + 1, allPages.length, p.title);
        } else if (typeof scheduleAsyncPageThumbnail === 'function' && p.id !== state.activePageId && pages.length > 3) {
          p.thumbnail = generateLazyPdfPlaceholderThumbnail(realIdx + 1, allPages.length, p.title || 'Page');
          scheduleAsyncPageThumbnail(p, { priority: 'normal' });
        } else {
          p.thumbnail = generatePageThumbnail(p);
        }
      }
      const card = document.createElement('div');
      card.className = `page-thumb-card${p.id === state.activePageId ? ' active' : ''}${p.bookmarked ? ' bookmarked' : ''}`;
      card.setAttribute('draggable', 'true');
      card.dataset.pageIndex = String(realIdx);
      const pdfBadge = p.pdfId ? `<span class="pdf-badge-tag">PDF p.${p.pdfPageNumber || realIdx + 1}</span>` : '';
      const rotBadge = p.rotation ? `<span class="pdf-badge-tag">${p.rotation}°</span>` : '';
      const bookmarkRibbon = p.bookmarked ? '<span class="gn-bookmark-ribbon" aria-hidden="true"></span>' : '';
      card.innerHTML = `
        <div class="page-thumb-preview">${bookmarkRibbon}<img data-thumb-page-id="${p.id}" loading="lazy" src="${p.thumbnail}" alt="Page ${realIdx + 1}" /></div>
        <div class="page-thumb-footer">
          <span class="page-thumb-number">${realIdx + 1}. ${escapeHtml(p.title.replace(/^\d+\.\s*/, ''))}${pdfBadge}${rotBadge}</span>
          <div class="page-thumb-actions">
            <button class="icon-btn-tiny${p.bookmarked ? ' starred' : ''}" data-page-action="bookmark" title="Signet">${p.bookmarked ? '🔖' : '☆'}</button>
            <button class="icon-btn-tiny" data-page-action="rotate" title="Pivoter de 90°">↻</button>
            <button class="icon-btn-tiny" data-page-action="rename" title="Renommer">✎</button>
            <button class="icon-btn-tiny" data-page-action="dup" title="Dupliquer">⧉</button>
            ${allPages.length > 1 ? `<button class="icon-btn-tiny danger" data-page-action="del" title="Supprimer">✕</button>` : ''}
          </div>
        </div>
      `;
      card.addEventListener('dragstart', (ev) => {
        draggedPageIndex = realIdx;
        card.classList.add('dragging');
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = 'move';
          try { ev.dataTransfer.setData('text/plain', String(realIdx)); } catch (_) {}
        }
      });
      card.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        if (draggedPageIndex === null || draggedPageIndex === realIdx) return;
        card.classList.toggle('drag-over-before', draggedPageIndex > realIdx);
        card.classList.toggle('drag-over-after', draggedPageIndex < realIdx);
      });
      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over-before', 'drag-over-after');
      });
      card.addEventListener('drop', (ev) => {
        ev.preventDefault();
        card.classList.remove('drag-over-before', 'drag-over-after');
        if (draggedPageIndex !== null && draggedPageIndex !== realIdx) {
          reorderPagesInActiveNotebook(draggedPageIndex, realIdx);
        }
        draggedPageIndex = null;
      });
      card.addEventListener('dragend', () => {
        draggedPageIndex = null;
        card.classList.remove('dragging', 'drag-over-before', 'drag-over-after');
      });
      card.addEventListener('click', (ev) => {
        const ab = ev.target.closest('[data-page-action]');
        if (ab) {
          ev.stopPropagation();
          if (ab.dataset.pageAction === 'bookmark') {
            p.bookmarked = !p.bookmarked;
            renderPagesSidebar();
            scheduleSaveActivePage(p);
          } else if (ab.dataset.pageAction === 'rotate') {
            rotatePageById(p.id, 90);
          } else if (ab.dataset.pageAction === 'rename') {
            openRenameModal('Renommer la page', p.title, (val) => {
              p.title = val;
              updateBreadcrumbs();
              renderPagesSidebar();
              scheduleSaveActivePage(p);
            });
          } else if (ab.dataset.pageAction === 'dup') {
            paidDuplicatePage(p.id);
          } else if (ab.dataset.pageAction === 'del') {
            deletePageById(p.id);
          }
          return;
        }
        selectPage(p.id);
      });
      dom.pagesGrid.appendChild(card);
    });
    updateBreadcrumbs();
  }

  function updateBreadcrumbs() {
    const nb = getActiveNotebook(), pages = getActiveNotebookPages(), page = getActivePage();
    if (!nb || !page) return;
    const idx = pages.findIndex((p) => p.id === page.id) + 1;
    if (dom.hudPageIndicator) dom.hudPageIndicator.textContent = `${idx} / ${pages.length}`;
    if (dom.btnPrevPage) dom.btnPrevPage.disabled = idx <= 1;
    if (dom.btnNextPage) dom.btnNextPage.disabled = idx >= pages.length;

    dom.paperOptionBtns.forEach((b) => b.classList.toggle('active', b.dataset.paper === (page.paperType || 'grid')));
    dom.toneBtns.forEach((b) => b.classList.toggle('active', b.dataset.tone === (page.paperTone || 'ivory')));
    dom.viewModeBtns.forEach((b) => b.classList.toggle('active', b.dataset.viewmode === (page.viewMode || 'infinite')));
    const gSize = Number.isFinite(page.gridSize) ? page.gridSize : 28;
    if (dom.gridSpacingSlider) dom.gridSpacingSlider.value = String(gSize);
    if (dom.gridSpacingVal) dom.gridSpacingVal.textContent = `${gSize}px`;
  }

  function selectNotebook(nbId) {
    const prevNbId = state.activeNotebookId;
    const prevPages = state.pagesByNotebook.get(prevNbId) || [];

    // Finalise tout trait en cours sur la page précédente et force l'écriture IndexedDB avant de changer de cahier
    finalizeActiveDrawingOnCurrentPage();
    flushPendingPageSaves();
    cleanupTransientInteractionState(false);
    invalidateStaticInkCache();

    state.activeNotebookId = nbId;
    const pages = getActiveNotebookPages();
    if (pages.length > 0) state.activePageId = pages[0].id;
    clearLassoSelection();

    // Si on ferme/quitte un cahier PDF, libère ses instances PDF.js et ses rendus canvas de la RAM
    if (prevNbId && prevNbId !== nbId) {
      const activePdfIds = new Set(pages.map((p) => p.pdfId).filter(Boolean));
      const oldPdfIds = new Set(prevPages.map((p) => p.pdfId).filter(Boolean));
      const prevNb = state.notebooks.find((n) => n.id === prevNbId);
      if (prevNb && prevNb.pdfId) oldPdfIds.add(prevNb.pdfId);
      for (const oldPdfId of oldPdfIds) {
        if (!activePdfIds.has(oldPdfId)) {
          destroyPdfDocumentResources(oldPdfId, false);
        }
      }
    }
    ensureActiveAndAdjacentPdfPagesLoaded(getActivePage());

    renderNotebooksSidebar();
    renderPagesSidebar();
    syncOpenTabsWithActiveNotebook();
    if (prevNbId && prevNbId !== nbId && pdfSearchState.open) {
      runPdfAndNotebookSearch(pdfSearchState.query, { preservePage: false });
    }
    updateUndoRedoButtons();
    renderWorldTextCards();
    requestRender();
    // Mémorise le cahier ouvert pour le rouvrir au prochain lancement
    Promise.resolve(db.saveWorkspaceState({ activeNotebookId: state.activeNotebookId, activePageId: state.activePageId })).catch(() => {});
  }

  function selectPage(pageId) {
    const changed = state.activePageId !== pageId;
    if (changed) {
      // Finalise immédiatement le trait en cours sur l'ancienne page et lance sa sauvegarde isolée
      finalizeActiveDrawingOnCurrentPage();
      flushPendingPageSaves();
      cleanupTransientInteractionState(false);
      invalidateStaticInkCache();
    }
    state.activePageId = pageId;
    clearLassoSelection();
    const targetPage = getActivePage();
    ensureActiveAndAdjacentPdfPagesLoaded(targetPage);
    if (changed && isBoundedPage(targetPage) && dom.canvasViewport) {
      const limits = getBoundedVerticalScrollLimits(state.zoom, targetPage);
      if (limits) {
        state.panX = limits.scaledW <= limits.vw - 24
          ? Math.round((limits.vw - limits.scaledW) / 2)
          : clampViewportPan(state.panX, limits.topSafe + 16, state.zoom, targetPage).panX;
        state.panY = Math.max(limits.minPanY, Math.min(limits.maxPanY, limits.topSafe + 16));
        syncWorldLayerTransform();
      }
    }
    renderPagesSidebar();
    updateUndoRedoButtons();
    renderWorldTextCards();
    requestRender();
  }

  function extractInheritedPageSettings(sourcePage, fallbackNotebook = null, overrides = {}) {
    const src = sourcePage || null;
    const opts = (overrides && typeof overrides === 'object' && !('target' in overrides && 'preventDefault' in overrides))
      ? overrides
      : {};
    const isSrcPdf = Boolean(src && (src.pdfId || src.isPdfPage));
    const inheritedPaperType = opts.paperType
      || (src && src.paperType)
      || (fallbackNotebook && fallbackNotebook.defaultPaperType)
      || 'grid';
    const inheritedPaperTone = opts.paperTone
      || (src && src.paperTone)
      || 'ivory';
    const inheritedGridSize = Number.isFinite(opts.gridSize)
      ? opts.gridSize
      : (src && Number.isFinite(src.gridSize) ? src.gridSize : 28);
    const inheritedViewMode = opts.viewMode
      || (isSrcPdf ? 'page' : (src && src.viewMode ? src.viewMode : 'infinite'));
    const inheritedRotation = Number.isFinite(opts.rotation)
      ? opts.rotation
      : (src && Number.isFinite(src.rotation) ? src.rotation : 0);
    const hasCustomDims = Boolean(
      src && Number.isFinite(src.pdfWidth) && src.pdfWidth > 0 && Number.isFinite(src.pdfHeight) && src.pdfHeight > 0
    );
    return {
      paperType: inheritedPaperType,
      paperTone: inheritedPaperTone,
      gridSize: inheritedGridSize,
      viewMode: inheritedViewMode,
      rotation: inheritedRotation,
      pageSize: opts.pageSize || (src && src.pageSize) || 'goodnotes_standard',
      pageOrientation: opts.pageOrientation || (src && src.pageOrientation) || 'portrait',
      pageWidth: Number.isFinite(opts.pageWidth) ? opts.pageWidth : ((src && Number.isFinite(src.pageWidth) && src.pageWidth > 0) ? src.pageWidth : null),
      pageHeight: Number.isFinite(opts.pageHeight) ? opts.pageHeight : ((src && Number.isFinite(src.pageHeight) && src.pageHeight > 0) ? src.pageHeight : null),
      templateLanguage: opts.templateLanguage || (src && src.templateLanguage) || 'fr',
      customTemplateDataUrl: opts.customTemplateDataUrl !== undefined ? opts.customTemplateDataUrl : ((src && src.customTemplateDataUrl) || null),
      pdfWidth: hasCustomDims ? src.pdfWidth : null,
      pdfHeight: hasCustomDims ? src.pdfHeight : null,
      pdfOriginalWidth: (src && Number.isFinite(src.pdfOriginalWidth) && src.pdfOriginalWidth > 0) ? src.pdfOriginalWidth : null,
      pdfOriginalHeight: (src && Number.isFinite(src.pdfOriginalHeight) && src.pdfOriginalHeight > 0) ? src.pdfOriginalHeight : null
    };
  }

  let initialDbLoadPromise = null;

  async function createNotebookProgrammatically(title, paperType = 'grid', coverColor = state.newNotebookCover, templatePageOrOptions = null) {
    if (initialDbLoadPromise) {
      try { await initialDbLoadPromise; } catch (_) {}
    }
    finalizeActiveDrawingOnCurrentPage();
    await flushPendingPageSaves();
    cleanupTransientInteractionState(false);

    const inherited = extractInheritedPageSettings(templatePageOrOptions, null, {
      paperType: paperType || (templatePageOrOptions && templatePageOrOptions.paperType) || 'grid'
    });
    const nbId = createUid('nb');
    const cleanTitle = (title && String(title).trim()) || `Cahier ${state.notebooks.length + 1}`;
    const newNb = {
      id: nbId,
      title: cleanTitle,
      folderId: state.currentFolderId || null,
      driveTarget: (templatePageOrOptions && templatePageOrOptions.driveTarget)
        ? normalizeNotebookDriveTarget(templatePageOrOptions.driveTarget, cleanTitle)
        : undefined,
      starred: false,
      coverColor: coverColor || '#1d4ed8',
      coverTemplateId: (templatePageOrOptions && templatePageOrOptions.coverTemplateId) || undefined,
      coverCustomDataUrl: (templatePageOrOptions && templatePageOrOptions.coverCustomDataUrl) || null,
      defaultPaperType: inherited.paperType,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const p1 = {
      id: createUid('page'),
      notebookId: nbId,
      title: '1. Page 1',
      order: 0,
      paperType: inherited.paperType,
      paperTone: inherited.paperTone,
      gridSize: inherited.gridSize,
      viewMode: inherited.viewMode,
      rotation: inherited.rotation,
      pageSize: inherited.pageSize,
      pageOrientation: inherited.pageOrientation,
      pageWidth: inherited.pageWidth,
      pageHeight: inherited.pageHeight,
      templateLanguage: inherited.templateLanguage,
      customTemplateDataUrl: inherited.customTemplateDataUrl,
      pdfWidth: inherited.pdfWidth,
      pdfHeight: inherited.pdfHeight,
      pdfOriginalWidth: inherited.pdfOriginalWidth,
      pdfOriginalHeight: inherited.pdfOriginalHeight,
      strokes: [],
      shapes: [],
      texts: [],
      tapes: [],
      images: [],
      bookmarked: false,
      updatedAt: Date.now()
    };
    p1.thumbnail = generatePageThumbnail(p1);
    state.notebooks.push(newNb);
    state.pagesByNotebook.set(nbId, [p1]);
    await db.saveNotebook(newNb);
    await db.savePage(p1);
    selectNotebook(nbId);
    if (isBoundedPage(p1)) fitPageToViewport(false);
    return { notebook: newNb, firstPage: p1 };
  }

  async function addNewPageToActiveNotebook(options = {}) {
    const nb = getActiveNotebook();
    if (!nb) return null;
    finalizeActiveDrawingOnCurrentPage();
    await flushPendingPageSaves();
    cleanupTransientInteractionState(false);

    const opts = (options && typeof options === 'object' && !('target' in options && 'preventDefault' in options))
      ? options
      : {};
    const pages = getActiveNotebookPages();
    const cur = getActivePage();
    const prevPage = opts.sourcePage || cur || pages[pages.length - 1] || null;
    const inherited = extractInheritedPageSettings(prevPage, nb, opts);
    const num = pages.length + 1;
    const np = {
      id: createUid('page'),
      notebookId: nb.id,
      title: `${num}. Page ${num}`,
      order: pages.length,
      paperType: inherited.paperType,
      paperTone: inherited.paperTone,
      gridSize: inherited.gridSize,
      viewMode: inherited.viewMode,
      rotation: inherited.rotation,
      pageSize: inherited.pageSize,
      pageOrientation: inherited.pageOrientation,
      pageWidth: inherited.pageWidth,
      pageHeight: inherited.pageHeight,
      templateLanguage: inherited.templateLanguage,
      customTemplateDataUrl: inherited.customTemplateDataUrl,
      pdfWidth: inherited.pdfWidth,
      pdfHeight: inherited.pdfHeight,
      pdfOriginalWidth: inherited.pdfOriginalWidth,
      pdfOriginalHeight: inherited.pdfOriginalHeight,
      strokes: [],
      shapes: [],
      texts: [],
      tapes: [],
      images: [],
      bookmarked: false,
      updatedAt: Date.now()
    };
    np.thumbnail = generatePageThumbnail(np);
    pages.push(np);
    state.pagesByNotebook.set(nb.id, pages);
    state.activePageId = np.id;
    invalidateStaticInkCache();
    cleanupPdfRenderCache(np, 2);
    await db.savePage(np);
    renderNotebooksSidebar();
    renderPagesSidebar();
    updateUndoRedoButtons();
    renderWorldTextCards();
    if (opts.fromPullToAdd && isBoundedPage(np)) {
      positionBoundedPageAfterTransition('top');
    } else if (isBoundedPage(np)) {
      fitPageToViewport(false);
    } else {
      requestRender();
    }
    showToast(`Page ${num} (${inherited.viewMode === 'page' ? 'A4' : 'Infinie'}) créée`);
    return np;
  }

  async function duplicatePageById(pageId) {
    finalizeActiveDrawingOnCurrentPage();
    await flushPendingPageSaves();
    const pages = getActiveNotebookPages();
    const orig = pages.find((p) => p.id === pageId);
    if (!orig) return null;
    const copy = { ...JSON.parse(JSON.stringify(orig)), id: createUid('page'), title: `${orig.title} (Copie)`, order: pages.length };
    copy.thumbnail = generatePageThumbnail(copy);
    pages.push(copy);
    state.pagesByNotebook.set(state.activeNotebookId, pages);
    state.activePageId = copy.id;
    cleanupPdfRenderCache(copy, 2);
    await db.savePage(copy);
    renderNotebooksSidebar();
    renderPagesSidebar();
    updateUndoRedoButtons();
    renderWorldTextCards();
    requestRender();
    showToast('Page dupliquée');
    return copy;
  }

  function isPdfIdStillReferenced(pdfId) {
    if (!pdfId) return false;
    for (const nb of state.notebooks) {
      if (nb.pdfId === pdfId) return true;
      const list = state.pagesByNotebook.get(nb.id) || [];
      if (list.some((p) => p.pdfId === pdfId)) return true;
    }
    return false;
  }

  async function deletePageById(pageId) {
    let pages = getActiveNotebookPages();
    if (pages.length <= 1) return false;
    if (state.activePageId === pageId) {
      cleanupTransientInteractionState(false);
    }
    cancelPendingPageSave(pageId);
    state.historyByPage.delete(pageId);

    const deletedPage = pages.find((p) => p.id === pageId);
    pages = pages.filter((p) => p.id !== pageId);
    state.pagesByNotebook.set(state.activeNotebookId, pages);
    if (state.activePageId === pageId) state.activePageId = pages[0].id;

    await db.deletePage(pageId);
    if (deletedPage && deletedPage.pdfId) {
      const cacheKey = `${deletedPage.pdfId}_${deletedPage.pdfPageNumber}`;
      const entry = pdfRenderedCanvasCache.get(cacheKey);
      if (entry && entry.canvas) releaseCanvasMemory(entry.canvas);
      pdfRenderedCanvasCache.delete(cacheKey);
      if (!isPdfIdStillReferenced(deletedPage.pdfId)) {
        await destroyPdfDocumentResources(deletedPage.pdfId, true);
      }
    }
    cleanupPdfRenderCache(getActivePage(), 2);

    renderNotebooksSidebar();
    renderPagesSidebar();
    updateUndoRedoButtons();
    renderWorldTextCards();
    requestRender();
    showToast('Page supprimée');
    return true;
  }

  async function deleteNotebookById(nbId) {
    if (state.notebooks.length <= 1) return false;
    if (state.activeNotebookId === nbId) {
      cleanupTransientInteractionState(false);
    }
    const deletedNb = state.notebooks.find((n) => n.id === nbId);
    const deletedPages = state.pagesByNotebook.get(nbId) || [];
    const pdfIdsToCheck = new Set();
    if (deletedNb && deletedNb.pdfId) pdfIdsToCheck.add(deletedNb.pdfId);

    for (const p of deletedPages) {
      cancelPendingPageSave(p.id);
      state.historyByPage.delete(p.id);
      if (p.pdfId) pdfIdsToCheck.add(p.pdfId);
    }

    state.notebooks = state.notebooks.filter((n) => n.id !== nbId);
    state.pagesByNotebook.delete(nbId);

    // Un PDF peut être partagé avec une copie du cahier : on ne supprime que ceux qui ne sont plus référencés
    const keepPdfIds = new Set();
    for (const pdfId of pdfIdsToCheck) {
      if (isPdfIdStillReferenced(pdfId)) {
        keepPdfIds.add(pdfId);
      } else {
        await destroyPdfDocumentResources(pdfId, true);
      }
    }
    for (const nb of state.notebooks) {
      if (nb.pdfId) keepPdfIds.add(nb.pdfId);
      (state.pagesByNotebook.get(nb.id) || []).forEach((p) => { if (p.pdfId) keepPdfIds.add(p.pdfId); });
    }

    // Laisse se terminer les sauvegardes déjà en vol de ces pages pour qu'elles ne ressuscitent pas après la suppression
    const pendingSaves = deletedPages.map((p) => inFlightPageSaves.get(p.id)).filter(Boolean);
    if (pendingSaves.length) await Promise.allSettled(pendingSaves);

    await db.deleteNotebook(nbId, keepPdfIds);
    if (state.activeNotebookId === nbId) {
      const nextNb = state.notebooks.find((n) => !n.trashedAt) || state.notebooks[0];
      selectNotebook(nextNb.id);
    } else {
      renderNotebooksSidebar();
      syncOpenTabsWithActiveNotebook();
    }
    return true;
  }

  let toolOptionsPulseTimer = null;
  function triggerToolOptionsPulse() {
    const activeToolBtn = document.querySelector(`.tool-btn[data-tool="${state.tool}"]`);
    const activeDot = state.tool === 'highlighter' ? dom.hlColorDot : (state.tool === 'pen' ? dom.penColorDot : null);
    const targets = [dom.btnToggleToolOptions, dom.activeToolColorPreview, activeToolBtn, activeDot].filter(Boolean);
    targets.forEach((el) => {
      if (!el || !el.classList) return;
      el.classList.remove('pulse-update');
      try { void el.offsetWidth; } catch (_) {}
      el.classList.add('pulse-update');
    });
    if (toolOptionsPulseTimer) clearTimeout(toolOptionsPulseTimer);
    toolOptionsPulseTimer = setTimeout(() => {
      targets.forEach((el) => {
        if (el && el.classList) el.classList.remove('pulse-update');
      });
      toolOptionsPulseTimer = null;
    }, 280);
  }

  function setActiveTool(t, toggleOptionsIfSame = false) {
    if (state.colorWheelOpen) closeRadialColorWheel(false);
    state.temporaryEraserOverride = false;
    state.temporaryLassoOverride = false;
    const isSameTool = state.tool === t;
    const isPenSubBarGroupClick = toggleOptionsIfSame && t === 'pen' && (state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter' || state.tool === 'tape');
    if ((isSameTool || isPenSubBarGroupClick) && toggleOptionsIfSame && t !== 'pan') {
      state.toolOptionsOpen = !state.toolOptionsOpen;
      if (state.toolOptionsOpen) {
        if (dom.paperPopover) dom.paperPopover.classList.add('hidden');
        if (dom.exportPopover) dom.exportPopover.classList.add('hidden');
      }
    } else {
      syncCanonicalToToolMemory(state.tool);
      state.tool = t;
      applyToolMemoryToCanonical(t);
      // Ouvre directement la sous-barre flottante au clic utilisateur sur Formes, Gomme, Texte ou Lasso (reste fermé au démarrage)
      state.toolOptionsOpen = Boolean((t === 'shape' || t === 'eraser' || t === 'text' || t === 'lasso') && toggleOptionsIfSame);
    }
    if (state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter') {
      state.previousWritingTool = state.tool;
    }
    if (state.tool !== 'lasso') {
      clearLassoSelection();
      state.gnLassoFilterPopoverOpen = false;
      state.gnLassoAlignPopoverOpen = false;
    }
    if (state.tool !== 'text' && (state.editingTextId || state.selectedTextId)) {
      clearSelectedTextBox(true);
    }
    if (state.tool !== 'text') state.gnTextPopover = null;
    updateToolbarActiveState();
    triggerToolOptionsPulse();
    requestRender();
  }

  function toggleToolOptionsPopover(forceState) {
    if (state.tool === 'pan') {
      state.toolOptionsOpen = false;
    } else if (typeof forceState === 'boolean') {
      state.toolOptionsOpen = forceState;
    } else {
      state.toolOptionsOpen = !state.toolOptionsOpen;
    }
    if (dom.paperPopover) dom.paperPopover.classList.add('hidden');
    if (dom.exportPopover) dom.exportPopover.classList.add('hidden');
    updateToolbarActiveState();
  }

  function updateToolbarActiveState() {
    dom.toolBtns.forEach((b) => {
      const isPenSubToolActive = b.dataset.tool === 'pen' && (state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter' || state.tool === 'tape');
      b.classList.toggle('active', isPenSubToolActive || b.dataset.tool === state.tool);
    });
    dom.canvasViewport.classList.toggle('pan-cursor', state.tool === 'pan' || state.isSpacePressed);
    dom.canvasViewport.classList.toggle('text-cursor', state.tool === 'text');
    dom.canvasViewport.classList.toggle('eraser-cursor', state.tool === 'eraser');

    // Permet au stylet de dessiner ou déplacer la sélection lasso à travers les cartes de texte
    const isDrawingTool = state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter' || state.tool === 'eraser' || state.tool === 'shape' || state.tool === 'tape' || state.tool === 'laser' || state.tool === 'lasso';
    dom.canvasViewport.classList.toggle('drawing-mode-active', isDrawingTool);

    if (state.tool !== 'eraser') dom.eraserCursor.style.display = 'none';
    if (state.tool !== 'shape' && state.selectedShapeId) clearSelectedShape(true);
    if (dom.colorDotCursor) {
      if (state.tool === 'eraser' || state.tool === 'pan' || state.tool === 'text' || state.isSpacePressed || state.colorWheelOpen) {
        dom.colorDotCursor.style.display = 'none';
      } else {
        dom.colorDotCursor.style.backgroundColor = getActiveCursorColor();
      }
    }

    const isInk = state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter';
    const isShape = state.tool === 'shape', isText = state.tool === 'text', isEraser = state.tool === 'eraser', isLasso = state.tool === 'lasso';
    const isTape = state.tool === 'tape', isLaser = state.tool === 'laser';

    const isGnPenBarTool = state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter' || state.tool === 'tape';
    const isGnShapeBarTool = state.tool === 'shape';
    const isGnEraserBarTool = state.tool === 'eraser';
    const isGnTextBarTool = state.tool === 'text';
    const isGnLassoBarTool = state.tool === 'lasso';
    const showGnSubBar = Boolean(state.toolOptionsOpen && isGnPenBarTool);
    const showGnShapeBar = Boolean(state.toolOptionsOpen && isGnShapeBarTool);
    const showGnEraserBar = Boolean(state.toolOptionsOpen && isGnEraserBarTool);
    const showGnTextBar = Boolean(state.toolOptionsOpen && isGnTextBarTool);
    const showGnLassoBar = Boolean(state.toolOptionsOpen && isGnLassoBarTool);
    const showDock = Boolean(state.toolOptionsOpen && state.tool !== 'pan' && !isGnPenBarTool && !isGnShapeBarTool && !isGnEraserBarTool && !isGnTextBarTool && !isGnLassoBarTool);
    dom.toolOptionsDock.classList.toggle('hidden', !showDock);
    const gnSubBarEl = document.getElementById('gnPenSubBar');
    if (gnSubBarEl) gnSubBarEl.classList.toggle('hidden', !showGnSubBar);
    const gnShapeBarEl = document.getElementById('gnShapeSubBar');
    if (gnShapeBarEl) gnShapeBarEl.classList.toggle('hidden', !showGnShapeBar);
    const gnEraserBarEl = document.getElementById('gnEraserSubBar');
    if (gnEraserBarEl) gnEraserBarEl.classList.toggle('hidden', !showGnEraserBar);
    const gnTextBarEl = document.getElementById('gnTextSubBar');
    if (gnTextBarEl) gnTextBarEl.classList.toggle('hidden', !showGnTextBar);
    const gnLassoBarEl = document.getElementById('gnLassoSubBar');
    if (gnLassoBarEl) gnLassoBarEl.classList.toggle('hidden', !showGnLassoBar);
    if (!showGnSubBar) {
      state.gnPenPopoverOpen = false;
      state.gnPencilPopoverOpen = false;
      state.gnHighlighterPopoverOpen = false;
      state.gnTapePopoverOpen = false;
      state.gnStrokePopoverOpen = false;
    }
    if (!showGnShapeBar) {
      state.gnShapeStrokePopoverOpen = false;
    }
    if (!showGnEraserBar) {
      state.gnEraserModePopoverOpen = false;
      state.gnEraserAdvPopoverOpen = false;
      state.gnEraserSizePopoverOpen = false;
    }
    if (!showGnTextBar && !state.selectedTextId && !state.editingTextId) {
      state.gnTextPopover = null;
    }
    if (!showGnLassoBar) {
      state.gnLassoFilterPopoverOpen = false;
      state.gnLassoAlignPopoverOpen = false;
    }
    const gnPopoverEl = document.getElementById('gnPenPopover');
    const showGnPopover = Boolean(showGnSubBar && state.gnPenPopoverOpen);
    if (gnPopoverEl) gnPopoverEl.classList.toggle('hidden', !showGnPopover);
    const gnPencilPopoverEl = document.getElementById('gnPencilPopover');
    const showGnPencilPopover = Boolean(showGnSubBar && state.gnPencilPopoverOpen);
    if (gnPencilPopoverEl) gnPencilPopoverEl.classList.toggle('hidden', !showGnPencilPopover);
    const gnHighlighterPopoverEl = document.getElementById('gnHighlighterPopover');
    const showGnHighlighterPopover = Boolean(showGnSubBar && state.gnHighlighterPopoverOpen);
    if (gnHighlighterPopoverEl) gnHighlighterPopoverEl.classList.toggle('hidden', !showGnHighlighterPopover);
    const gnTapePopoverEl = document.getElementById('gnTapePopover');
    const showGnTapePopover = Boolean(showGnSubBar && state.gnTapePopoverOpen);
    if (gnTapePopoverEl) gnTapePopoverEl.classList.toggle('hidden', !showGnTapePopover);
    const gnStrokePopoverEl = document.getElementById('gnStrokePopover');
    const showGnStrokePopover = Boolean(showGnSubBar && state.gnStrokePopoverOpen);
    if (gnStrokePopoverEl) gnStrokePopoverEl.classList.toggle('hidden', !showGnStrokePopover);
    const gnShapeStrokePopoverEl = document.getElementById('gnShapeStrokePopover');
    const showGnShapeStrokePopover = Boolean(showGnShapeBar && state.gnShapeStrokePopoverOpen);
    if (gnShapeStrokePopoverEl) gnShapeStrokePopoverEl.classList.toggle('hidden', !showGnShapeStrokePopover);
    const gnEraserModePopoverEl = document.getElementById('gnEraserModePopover');
    if (gnEraserModePopoverEl) gnEraserModePopoverEl.classList.toggle('hidden', !Boolean(showGnEraserBar && state.gnEraserModePopoverOpen));
    const gnEraserAdvPopoverEl = document.getElementById('gnEraserAdvPopover');
    if (gnEraserAdvPopoverEl) gnEraserAdvPopoverEl.classList.toggle('hidden', !Boolean(showGnEraserBar && state.gnEraserAdvPopoverOpen));
    const gnEraserSizePopoverEl = document.getElementById('gnEraserSizePopover');
    if (gnEraserSizePopoverEl) gnEraserSizePopoverEl.classList.toggle('hidden', !Boolean(showGnEraserBar && state.gnEraserSizePopoverOpen));
    const gnLassoFilterPopEl = document.getElementById('gnLassoFilterPopover');
    if (gnLassoFilterPopEl) gnLassoFilterPopEl.classList.toggle('hidden', !Boolean(showGnLassoBar && state.gnLassoFilterPopoverOpen));
    const gnLassoAlignPopEl = document.getElementById('gnLassoAlignPopover');
    if (gnLassoAlignPopEl) gnLassoAlignPopEl.classList.toggle('hidden', !Boolean(showGnLassoBar && state.gnLassoAlignPopoverOpen));
    const gnTextPopMap = {
      font: 'gnTextFontPopover',
      size: 'gnTextSizePopover',
      align: 'gnTextAlignPopover',
      list: 'gnTextListPopover',
      style: 'gnTextBoxStylePopover'
    };
    Object.keys(gnTextPopMap).forEach((k) => {
      const el = document.getElementById(gnTextPopMap[k]);
      if (el) el.classList.toggle('hidden', state.gnTextPopover !== k);
    });
    if (!showGnPopover) {
      const gesturesEl = document.getElementById('gnPenGesturesView');
      if (gesturesEl) gesturesEl.classList.add('hidden');
      const openGestBtn = document.getElementById('btnOpenStylusGestures');
      if (openGestBtn) openGestBtn.classList.remove('active-nav');
    }
    if (typeof syncGnPenSubBarUi === 'function') syncGnPenSubBarUi();
    if (typeof syncGnEraserSubBarUi === 'function') syncGnEraserSubBarUi();
    if (typeof syncGnTextSubBarUi === 'function') syncGnTextSubBarUi();
    if (typeof syncGnLassoSubBarUi === 'function') syncGnLassoSubBarUi();
    if (dom.btnToggleToolOptions) {
      dom.btnToggleToolOptions.classList.toggle('open', showDock || showGnSubBar || showGnShapeBar || showGnEraserBar || showGnTextBar || showGnLassoBar);
      dom.btnToggleToolOptions.setAttribute('aria-expanded', String(showDock || showGnSubBar || showGnShapeBar || showGnEraserBar || showGnTextBar || showGnLassoBar));
      dom.btnToggleToolOptions.disabled = state.tool === 'pan';
    }

    const showColorGroup = isInk || isShape || isText || isLasso || isTape || isLaser;
    const showSizeGroup = isInk || isShape || isEraser || isTape || isLaser;
    dom.colorPaletteGroup.style.display = showColorGroup ? 'flex' : 'none';
    dom.dividerAfterColor.style.display = showColorGroup && showSizeGroup ? 'block' : 'none';
    dom.sizeControlGroup.style.display = showSizeGroup ? 'flex' : 'none';
    dom.smoothingControlGroup.classList.toggle('hidden', !isInk);
    if (dom.autoShapeToggle) dom.autoShapeToggle.checked = state.autoShapeEnabled;
    if (dom.textControlGroup) dom.textControlGroup.classList.toggle('hidden', !isText);
    dom.shapeControlGroup.classList.toggle('hidden', !isShape);
    dom.eraserControlGroup.classList.toggle('hidden', !isEraser);
    dom.lassoControlGroup.classList.toggle('hidden', !isLasso);

    const activeSize = getActiveToolSize(state.tool);
    const activeColor = getActiveToolColor(state.tool);
    const dockSlotsEl = document.getElementById('dockColorSlotsList');
    const dockAddBtnEl = document.getElementById('dockAddColorBtn');
    if (dockSlotsEl && showColorGroup) {
      const dockToolKey = (state.toolMemory && state.toolMemory[state.tool]) ? state.tool : 'pen';
      renderDynamicColorSlotBar(dockSlotsEl, dockToolKey, dockAddBtnEl);
    }
    dom.strokeSizeSlider.value = activeSize;
    dom.strokeSizeValue.textContent = `${Number(activeSize).toFixed(1)}px`;
    if (dom.customColorPicker && /^#[0-9a-f]{6}$/i.test(activeColor)) {
      dom.customColorPicker.value = activeColor;
    }
    if (dom.penColorDot) {
      dom.penColorDot.style.background = state.tool === 'highlighter'
        ? state.highlighterColor
        : (state.tool === 'pencil'
          ? (state.pencilColor || '#111827')
          : (state.tool === 'tape' ? (state.tapeColor || state.penColor) : state.penColor));
    }
    if (dom.hlColorDot) dom.hlColorDot.style.background = state.highlighterColor;
    dom.colorSwatches.forEach((sw) => sw.classList.toggle('active', sw.dataset.color.toLowerCase() === activeColor.toLowerCase()));

    const toolMem = state.toolMemory && state.toolMemory[state.tool];
    const sizeSlots = (toolMem && Array.isArray(toolMem.sizeSlots) && toolMem.sizeSlots.length === 3)
      ? toolMem.sizeSlots
      : [2.5, 5, 12];
    dom.sizeDotBtns.forEach((b, idx) => {
      const slotIdx = b.dataset.sizeSlot !== undefined ? Number(b.dataset.sizeSlot) : idx;
      if (Number.isFinite(slotIdx) && sizeSlots[slotIdx] !== undefined) {
        b.dataset.size = String(sizeSlots[slotIdx]);
      }
      b.classList.toggle('active', Math.abs(parseFloat(b.dataset.size) - activeSize) < 0.25);
    });

    const penStylePills = document.getElementById('penStylePills');
    if (penStylePills) penStylePills.style.display = state.tool === 'pen' ? 'flex' : 'none';
    const penLineStylePills = document.getElementById('penLineStylePills');
    if (penLineStylePills) {
      penLineStylePills.style.display = state.tool === 'pen' ? 'flex' : 'none';
      penLineStylePills.querySelectorAll('[data-line-style]').forEach((b) => {
        b.classList.toggle('active', b.dataset.lineStyle === (state.penLineStyle || 'solid'));
      });
    }
    const hlAutoWrap = document.getElementById('hlAutoStraightenWrap');
    if (hlAutoWrap) hlAutoWrap.classList.toggle('hidden', state.tool !== 'highlighter');
    const hlAutoToggle = document.getElementById('hlAutoStraightenToggle');
    if (hlAutoToggle) hlAutoToggle.checked = Boolean(state.highlighterAutoStraighten);

    const eraserHlOnly = document.getElementById('eraserHighlighterOnlyToggle');
    if (eraserHlOnly) eraserHlOnly.checked = Boolean(state.eraserHighlighterOnly);
    const eraserAutoDesel = document.getElementById('eraserAutoDeselectToggle');
    if (eraserAutoDesel) eraserAutoDesel.checked = Boolean(state.eraserAutoDeselect);
    dom.eraserModeBtns.forEach((b) => b.classList.toggle('active', b.dataset.eraserMode === state.eraserMode));

    const lassoModePills = document.getElementById('lassoModePills');
    if (lassoModePills) {
      lassoModePills.querySelectorAll('[data-lasso-mode]').forEach((b) => {
        b.classList.toggle('active', b.dataset.lassoMode === (state.lassoMode || 'freehand'));
      });
    }

    // Mise à jour du bouton déclencheur d'options dans la barre principale
    if (dom.activeToolColorPreview) {
      const showColorDot = showColorGroup;
      dom.activeToolColorPreview.style.display = showColorDot ? 'inline-block' : 'none';
      dom.activeToolColorPreview.style.background = activeColor;
    }
    if (dom.activeToolSummaryText) {
      if (showSizeGroup) {
        dom.activeToolSummaryText.textContent = `${Number(activeSize).toFixed(1)}px`;
      } else if (isLasso) {
        const selCount = state.selectedIds.strokes.size + state.selectedIds.shapes.size + state.selectedIds.texts.size;
        dom.activeToolSummaryText.textContent = selCount > 0 ? `${selCount} sél.` : 'Options';
      } else if (isText) {
        dom.activeToolSummaryText.textContent = 'Options';
      } else {
        dom.activeToolSummaryText.textContent = '—';
      }
    }
    updateLassoFloatingBarPosition();
  }

  function hexToRgba(hex, alpha) {
    const c = (hex || '#1d4ed8').replace('#', '');
    const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  async function downloadBlob(blob, filename) {
    // Support natif Tauri v2 / WebView2 : utilise le dialogue Windows natif et l'écriture disque directe si disponible
    if (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.dialog && window.__TAURI__.core) {
      try {
        const ext = (String(filename || 'document.pdf').split('.').pop() || 'pdf').toLowerCase();
        const savePath = await window.__TAURI__.dialog.save({
          defaultPath: filename,
          filters: [{ name: `Fichier ${ext.toUpperCase()}`, extensions: [ext] }]
        });
        if (savePath) {
          const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
          await window.__TAURI__.core.invoke('save_binary_file', { path: savePath, bytes });
          showToast(`Fichier enregistré : ${savePath}`);
          return true;
        }
      } catch (_) {
        // Bascule automatiquement sur le téléchargement standard si l'API native n'est pas sollicitée
      }
    }
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
    return true;
  }

  const activeToastByKey = new Map();
  function showToast(msg, type = 'info', dedupeKey = null) {
    if (!dom.toastContainer) return;
    if (dedupeKey && activeToastByKey.has(dedupeKey)) {
      const existing = activeToastByKey.get(dedupeKey);
      if (existing && existing.el && existing.el.isConnected) {
        existing.el.textContent = msg;
        existing.el.className = `toast-msg${type === 'error' ? ' error' : ''}`;
        if (existing.timer) clearTimeout(existing.timer);
        existing.timer = setTimeout(() => {
          existing.el.remove();
          activeToastByKey.delete(dedupeKey);
        }, type === 'error' ? 4200 : 2200);
        return;
      }
    }

    // Évite l'accumulation d'éléments DOM en cas d'actions rapides répétées
    while (dom.toastContainer.children && dom.toastContainer.children.length >= 3 && dom.toastContainer.firstElementChild) {
      dom.toastContainer.firstElementChild.remove();
    }

    const el = document.createElement('div');
    el.className = `toast-msg${type === 'error' ? ' error' : ''}`;
    el.textContent = msg;
    dom.toastContainer.appendChild(el);
    const timer = setTimeout(() => {
      el.remove();
      if (dedupeKey) activeToastByKey.delete(dedupeKey);
    }, type === 'error' ? 4200 : 2400);
    if (dedupeKey) {
      activeToastByKey.set(dedupeKey, { el, timer });
    }
  }

  let currentRenameCallback = null;
  function openRenameModal(title, currentVal, onConfirm) {
    dom.modalRenameTitle.textContent = title;
    dom.inputRenameValue.value = currentVal || '';
    currentRenameCallback = onConfirm;
    dom.modalRenameItem.classList.remove('hidden');
    setTimeout(() => { dom.inputRenameValue.focus(); dom.inputRenameValue.select(); }, 20);
  }
  function closeRenameModal() {
    dom.modalRenameItem.classList.add('hidden');
    currentRenameCallback = null;
  }

  // ============================================================================
  // 16. ÉCOUTEURS D'ÉVÉNEMENTS & NAVIGATION INFINIE
  // ============================================================================

  const DEFAULT_TOOL_SIZE_SLOTS = {
    pen: [2.5, 5, 12],
    pencil: [2.5, 5, 10],
    highlighter: [12, 22, 34],
    shape: [2, 4, 8],
    tape: [18, 26, 36],
    eraser: [10, 18, 32]
  };

  function getToolSizeSliderConfig(tool = state.tool) {
    if (tool === 'pencil') return { min: 1, max: 16, step: 0.5, label: 'Épaisseur Du Crayon' };
    if (tool === 'highlighter') return { min: 6, max: 42, step: 1, label: 'Épaisseur Du Surligneur' };
    if (tool === 'tape') return { min: 12, max: 48, step: 1, label: 'Épaisseur Du Ruban' };
    if (tool === 'shape') return { min: 1, max: 24, step: 0.5, label: 'Épaisseur De La Forme' };
    return { min: 1, max: 20, step: 0.5, label: 'Épaisseur Du Stylo' };
  }

  function isLightHexColor(hex) {
    const c = String(hex || '').replace('#', '').trim();
    if (!c) return false;
    const full = c.length === 3 ? c.replace(/(.)/g, '$1$1') : c;
    const n = parseInt(full, 16);
    if (!Number.isFinite(n)) return false;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 186;
  }

  // Génère les 3 aperçus texturés graphite GoodNotes 6 (algorithme de grains déterministes extrait via REA)
  function buildPencilThicknessPreviewSvg(thicknessVal, minVal = 1, maxVal = 16) {
    const ratio = Math.max(0, Math.min(1, (thicknessVal - minVal) / Math.max(1, maxVal - minVal)));
    const bandH = 2.4 + ratio * 3.8;
    const cy = 5;
    const w = 20;
    const hash = (a, b) => {
      const s = Math.sin(a * 12.9898 + (b + 1) * 78.233) * 43758.5453;
      return s - Math.floor(s);
    };
    const count = Math.round(32 + ratio * 34);
    let circles = '';
    for (let i = 0; i < count; i++) {
      const x = 1.5 + hash(4, i) * (w - 3);
      const y = cy + (hash(5, i) - 0.5) * bandH;
      const r = (0.38 + hash(6, i) * (0.48 + ratio * 0.28)).toFixed(2);
      const op = (0.35 + hash(7, i) * 0.58).toFixed(2);
      circles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="currentColor" opacity="${op}"/>`;
    }
    return `<svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">${circles}</svg>`;
  }

  function renderGnPencilPreviewCanvas() {
    const canvas = document.getElementById('gnPencilPreviewCanvas');
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width || 268;
    const h = canvas.height || 92;
    ctx.clearRect(0, 0, w, h);

    const col = state.pencilColor || '#111827';
    const previewSize = Math.max(2.5, Math.min(11, Number(state.pencilSize || 5)));
    const dabSprite = getPencilDabSprite(col);
    if (!dabSprite) return;

    // Courbe en S fidèle au véritable moteur crayon graphite (pression progressive + grain papier)
    const previewPts = [];
    const steps = 42;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = 24 + t * (w - 48);
      const y = h * 0.52 + Math.sin(t * Math.PI * 1.92 + 0.42) * 26 * (0.78 + 0.22 * Math.sin(t * Math.PI));
      const pressure = 0.22 + 0.68 * Math.sin(Math.pow(t, 0.85) * Math.PI);
      previewPts.push({ x, y, pressure, tiltX: 0, tiltY: 0, t: i * 8 });
    }

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const st = { remainderDist: 0, stepIndex: 0, traveled: 0 };
    for (let i = 0; i < previewPts.length - 1; i++) {
      const p0 = previewPts[Math.max(0, i - 1)];
      const p1 = previewPts[i];
      const p2 = previewPts[i + 1];
      const p3 = previewPts[Math.min(previewPts.length - 1, i + 2)];
      stampPencilCurveSegment(ctx, dabSprite, p0, p1, p2, p3, st, previewSize, 'dynamic', null);
    }
    const valleyPat = getPencilPaperValleyPattern(ctx);
    if (valleyPat) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = valleyPat;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  function getActiveToolSizeSlots(tool = state.tool) {
    const key = DEFAULT_TOOL_SIZE_SLOTS[tool] ? tool : 'pen';
    const mem = state.toolMemory && state.toolMemory[key];
    if (mem && Array.isArray(mem.sizeSlots) && mem.sizeSlots.length === 3) {
      return mem.sizeSlots;
    }
    return [...DEFAULT_TOOL_SIZE_SLOTS[key]];
  }

  // ============================================================================
  // SÉLECTEUR DE COULEUR UNIFIÉ STYLE GOODNOTES 6 (PRÉRÉGLAGES 5 COL. + CUSTOM + SLOTS DYNAMIQUES)
  // ============================================================================
  const GN_COLOR_POPOVER_TITLES = {
    pen: 'Couleur Du Stylo',
    pencil: 'Couleur Du Crayon',
    highlighter: 'Couleur Du Surligneur',
    tape: 'Couleur Du Ruban',
    shape: 'Couleur De Forme',
    text: 'Couleur Du Texte',
    'text-box-bg': 'Couleur De Fond',
    'text-box-border': 'Couleur De Bordure',
    laser: 'Couleur Du Pointeur',
    lasso: 'Changer La Couleur',
    radial: 'Couleur De La Roue',
    cover: 'Couleur De Couverture',
    folder: 'Couleur Du Dossier'
  };

  const gnColorPopoverState = {
    open: false,
    mode: 'add-slot', // 'add-slot' | 'edit-slot' | 'lasso' | 'text-card' | 'notebook-cover' | 'folder-color'
    toolKey: 'pen',
    scopeKey: 'pen',
    slotIndex: -1,
    anchorEl: null,
    page: 'presets', // 'presets' | 'custom'
    customOp: 'add', // 'add' | 'edit'
    editingPresetIndex: -1,
    textCardId: null,
    hsv: { h: 211 / 360, s: 1, v: 1 },
    hex: '#007aff',
    slotMenuOpen: false
  };

  function hexToRgbObj(hex) {
    const norm = normalizeHexColor(hex);
    if (!norm) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(norm.slice(1, 3), 16),
      g: parseInt(norm.slice(3, 5), 16),
      b: parseInt(norm.slice(5, 7), 16)
    };
  }

  function hexToHsv(hex) {
    const { r: r255, g: g255, b: b255 } = hexToRgbObj(hex);
    const r = r255 / 255, g = g255 / 255, b = b255 / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h, s, v };
  }

  function hsvToHex(h, s, v) {
    const hh = ((h % 1) + 1) % 1;
    const ss = Math.max(0, Math.min(1, s));
    const vv = Math.max(0, Math.min(1, v));
    const i = Math.floor(hh * 6);
    const f = hh * 6 - i;
    const p = vv * (1 - ss);
    const q = vv * (1 - f * ss);
    const t = vv * (1 - (1 - f) * ss);
    let r = 0, g = 0, b = 0;
    switch (i % 6) {
      case 0: r = vv; g = t; b = p; break;
      case 1: r = q; g = vv; b = p; break;
      case 2: r = p; g = vv; b = t; break;
      case 3: r = p; g = q; b = vv; break;
      case 4: r = t; g = p; b = vv; break;
      case 5: r = vv; g = p; b = q; break;
    }
    const to2 = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  }

  function getGnColorPopoverState() {
    return { ...gnColorPopoverState };
  }

  function positionGnColorPopover(anchorEl) {
    const pop = document.getElementById('gnColorPopover');
    const caret = document.getElementById('gnColorPopoverCaret');
    if (!pop || !anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') return;
    const aR = anchorEl.getBoundingClientRect();
    const pR = pop.getBoundingClientRect();
    const parentSubBar = typeof anchorEl.closest === 'function'
      ? anchorEl.closest('.gn-pen-subbar, .gn-shape-subbar, .gn-eraser-subbar, .gn-text-subbar, .gn-lasso-subbar')
      : null;
    const barR = parentSubBar && typeof parentSubBar.getBoundingClientRect === 'function'
      ? parentSubBar.getBoundingClientRect()
      : null;
    const popW = pR.width > 0 ? pR.width : 284;
    const popH = pR.height > 0 ? pR.height : 290;
    const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1200;
    const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800;

    const anchorCenterX = aR.left + aR.width * 0.5;
    let left = Math.round(anchorCenterX - popW * 0.5);
    left = Math.max(12, Math.min(vw - popW - 12, left));

    const refBottom = barR && barR.height > 0 ? barR.bottom : aR.bottom;
    const refTop = barR && barR.height > 0 ? barR.top : aR.top;
    const preferAbove = Boolean(document.documentElement.classList.contains('toolbar-pos-bottom') && barR);
    let top = Math.round(refBottom + 10);
    let placeAbove = false;
    if ((preferAbove || top + popH > vh - 12) && refTop - popH - 10 >= 12) {
      top = Math.round(refTop - popH - 10);
      placeAbove = true;
    } else if (top + popH > vh - 12) {
      top = Math.max(12, vh - popH - 12);
    }

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.classList.toggle('caret-bottom', placeAbove);
    if (caret) {
      const relX = Math.max(22, Math.min(popW - 22, anchorCenterX - left));
      caret.style.left = `${Math.round(relX)}px`;
    }
  }

  function positionSubBarPopoverUnderAnchor(anchorEl, popoverId, caretId, isOpen) {
    if (!isOpen || !anchorEl) return;
    const pop = document.getElementById(popoverId);
    const caret = caretId ? document.getElementById(caretId) : null;
    if (!pop || typeof anchorEl.getBoundingClientRect !== 'function' || typeof pop.getBoundingClientRect !== 'function') return;

    const applyPos = () => {
      if (pop.classList && pop.classList.contains('hidden')) return;
      const aR = anchorEl.getBoundingClientRect();
      const pR = pop.getBoundingClientRect();
      if (!aR || aR.width <= 0) return;

      const parentSubBar = typeof anchorEl.closest === 'function'
        ? anchorEl.closest('.gn-pen-subbar, .gn-shape-subbar, .gn-eraser-subbar, .gn-text-subbar, .gn-lasso-subbar')
        : null;
      const barR = parentSubBar && typeof parentSubBar.getBoundingClientRect === 'function'
        ? parentSubBar.getBoundingClientRect()
        : null;

      const popW = pR.width > 0 ? pR.width : (pop.offsetWidth || 316);
      const popH = pR.height > 0 ? pR.height : (pop.offsetHeight || 240);
      const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1200;
      const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800;

      const anchorCenterX = aR.left + aR.width * 0.5;
      let left = Math.round(anchorCenterX - popW * 0.5);
      left = Math.max(12, Math.min(vw - popW - 12, left));

      const refBottom = barR && barR.height > 0 ? barR.bottom : aR.bottom;
      const refTop = barR && barR.height > 0 ? barR.top : aR.top;
      const preferAbove = Boolean(document.documentElement.classList.contains('toolbar-pos-bottom') && barR);
      let top = Math.round(refBottom + 10);
      let placeAbove = false;
      if ((preferAbove || top + popH > vh - 12) && refTop - popH - 10 >= 12) {
        top = Math.round(refTop - popH - 10);
        placeAbove = true;
      } else if (top + popH > vh - 12) {
        top = Math.max(12, vh - popH - 12);
      }

      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.classList.toggle('caret-bottom', placeAbove);

      if (caret) {
        const relX = Math.max(22, Math.min(popW - 22, anchorCenterX - left));
        caret.style.left = `${Math.round(relX)}px`;
      }

      if (popoverId === 'gnPenPopover') {
        const gesturesEl = document.getElementById('gnPenGesturesView');
        if (gesturesEl) {
          const openLeft = (left + popW + 318) > (vw - 12) && (left - 318) >= 12;
          gesturesEl.classList.toggle('open-left', openLeft);
        }
      }
    };

    applyPos();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(applyPos);
    }
    if (typeof setTimeout === 'function') {
      if (pop._alignSettleTimer) clearTimeout(pop._alignSettleTimer);
      pop._alignSettleTimer = setTimeout(() => {
        pop._alignSettleTimer = null;
        applyPos();
      }, 210);
    }
  }

  function closeGnColorPopover() {
    if (!gnColorPopoverState.open) return;
    if (gnColorPopoverState.anchorEl && gnColorPopoverState.anchorEl.classList) {
      gnColorPopoverState.anchorEl.classList.remove('popover-open');
    }
    gnColorPopoverState.open = false;
    gnColorPopoverState.slotMenuOpen = false;
    gnColorPopoverState.anchorEl = null;
    const pop = document.getElementById('gnColorPopover');
    if (pop) pop.classList.add('hidden');
    const slotMenu = document.getElementById('gnColorSlotMenu');
    if (slotMenu) slotMenu.classList.add('hidden');
  }

  function addCustomSwatchToModalGroup(containerId, attrName, hex, onSelectFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const norm = normalizeHexColor(hex) || hex;
    const existing = Array.from(container.querySelectorAll(`[${attrName}]`)).find(
      (b) => (b.getAttribute(attrName) || '').toLowerCase() === norm.toLowerCase()
    );
    let targetBtn = existing;
    if (!targetBtn) {
      targetBtn = document.createElement('button');
      targetBtn.type = 'button';
      targetBtn.className = 'color-swatch';
      targetBtn.setAttribute(attrName, norm);
      targetBtn.style.background = norm;
      targetBtn.title = norm.toUpperCase();
      targetBtn.addEventListener('click', () => {
        onSelectFn(norm, targetBtn);
      });
      const addBtn = container.querySelector('.gn-add-color-btn');
      if (addBtn && typeof container.insertBefore === 'function') {
        container.insertBefore(targetBtn, addBtn);
      } else if (typeof container.appendChild === 'function') {
        container.appendChild(targetBtn);
      }
    }
    onSelectFn(norm, targetBtn);
  }

  function applyColorFromGnPopover(hex, options = {}) {
    const norm = normalizeHexColor(hex);
    if (!norm) return;
    const { mode, toolKey, slotIndex, textCardId } = gnColorPopoverState;
    const closeAfter = options.close !== false;

    if (mode === 'radial-slot' || mode === 'radial-add') {
      applyRadialWheelPick(norm, closeAfter);
      return;
    }

    if (mode === 'add-slot') {
      const addedIdx = addToolColorSlot(toolKey, norm);
      if (state.tool !== toolKey && toolKey !== 'lasso' && toolKey !== 'cover' && toolKey !== 'folder') {
        syncCanonicalToToolMemory(state.tool);
        state.tool = toolKey;
        applyToolMemoryToCanonical(toolKey);
      }
      if (state.tool === 'lasso' && hasAnyLassoSelection()) recolorLassoSelection(norm);
      updateToolbarActiveState();
      if (closeAfter) closeGnColorPopover();
      else {
        gnColorPopoverState.mode = 'edit-slot';
        gnColorPopoverState.slotIndex = addedIdx;
        renderGnColorPopover();
      }
      return;
    }

    if (mode === 'edit-slot') {
      setToolColor(toolKey, norm, { slotIndex });
      if (state.tool === 'lasso' && hasAnyLassoSelection()) recolorLassoSelection(norm);
      updateToolbarActiveState();
      if (closeAfter) closeGnColorPopover();
      else renderGnColorPopover();
      return;
    }

    if (mode === 'lasso') {
      recolorLassoSelection(norm);
      const lDot = document.getElementById('lassoQuickColorDot');
      if (lDot) lDot.style.background = norm;
      const subDot = document.getElementById('gnLassoSubColorDot');
      if (subDot) subDot.style.background = norm;
      if (closeAfter) closeGnColorPopover();
      else renderGnColorPopover();
      return;
    }

    if (mode === 'text-card' || mode === 'text-default') {
      state.textColor = norm;
      if (state.toolMemory && state.toolMemory.text) state.toolMemory.text.color = norm;
      applyTextPropertyToActiveOrDefault((tb) => {
        if (tb) tb.color = norm;
      }, { skipHistory: Boolean(options.livePreview) });
      saveTextToolPrefs();
      if (closeAfter) closeGnColorPopover();
      else renderGnColorPopover();
      return;
    }

    if (mode === 'text-box-bg') {
      applyTextPropertyToActiveOrDefault((tb) => {
        if (tb) {
          tb.frameStyle = { ...resolveTextBoxFrameStyle(tb), backgroundColor: norm };
        } else {
          state.textFrameStyle = { ...state.textFrameStyle, backgroundColor: norm };
        }
      }, { skipHistory: Boolean(options.livePreview) });
      if (closeAfter) closeGnColorPopover();
      else renderGnColorPopover();
      return;
    }

    if (mode === 'text-box-border') {
      applyTextPropertyToActiveOrDefault((tb) => {
        if (tb) {
          const curFs = resolveTextBoxFrameStyle(tb);
          tb.frameStyle = { ...curFs, borderColor: norm, borderWidth: Math.max(1, curFs.borderWidth || 0) };
        } else {
          state.textFrameStyle = {
            ...state.textFrameStyle,
            borderColor: norm,
            borderWidth: Math.max(1, state.textFrameStyle.borderWidth || 0)
          };
        }
      }, { skipHistory: Boolean(options.livePreview) });
      if (closeAfter) closeGnColorPopover();
      else renderGnColorPopover();
      return;
    }

    if (mode === 'notebook-cover') {
      addCustomSwatchToModalGroup('notebookCoverSwatches', 'data-cover', norm, (chosenHex, btnEl) => {
        state.newNotebookCover = chosenHex;
        const container = document.getElementById('notebookCoverSwatches');
        if (container) {
          container.querySelectorAll('[data-cover]').forEach((s) => s.classList.toggle('active', s === btnEl));
        }
      });
      if (closeAfter) closeGnColorPopover();
      else renderGnColorPopover();
      return;
    }

    if (mode === 'folder-color') {
      addCustomSwatchToModalGroup('folderColorSwatches', 'data-folder-color', norm, (chosenHex, btnEl) => {
        state.folderModalColor = chosenHex;
        const container = document.getElementById('folderColorSwatches');
        if (container) {
          container.querySelectorAll('[data-folder-color]').forEach((s) => s.classList.toggle('active', s === btnEl));
        }
      });
      if (closeAfter) closeGnColorPopover();
      else renderGnColorPopover();
      return;
    }

    if (mode === 'shape-edit') {
      const container = document.getElementById('shapeEditColorSwatches');
      const applyCol = (chosenHex) => {
        const page = getActivePage();
        const sh = getSelectedShape(page);
        if (!page || !sh || !chosenHex) return;
        pushHistorySnapshot(page);
        sh.color = chosenHex;
        invalidateStaticInkCache();
        renderStaticInkLayerOnly();
        renderActiveCanvasOnly();
        updateShapeEditFloatingBar();
        scheduleSaveActivePage(page);
      };
      if (container) {
        const existing = Array.from(container.querySelectorAll('[data-shape-color]')).find(
          (b) => (b.getAttribute('data-shape-color') || '').toLowerCase() === norm.toLowerCase()
        );
        if (!existing) {
          const btnEl = document.createElement('button');
          btnEl.type = 'button';
          btnEl.className = 'shape-edit-swatch';
          btnEl.setAttribute('data-shape-color', norm);
          btnEl.style.background = norm;
          btnEl.title = norm.toUpperCase();
          btnEl.addEventListener('click', (ev) => {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            applyCol(norm);
          });
          const addBtn = document.getElementById('btnShapeEditAddColor');
          if (addBtn && typeof container.insertBefore === 'function') {
            container.insertBefore(btnEl, addBtn);
          } else if (typeof container.appendChild === 'function') {
            container.appendChild(btnEl);
          }
        }
      }
      applyCol(norm);
      if (closeAfter) closeGnColorPopover();
      else renderGnColorPopover();
    }
  }

  function syncGnColorCustomEditorUi() {
    const satBox = document.getElementById('gnColorSatBox');
    const satThumb = document.getElementById('gnColorSatThumb');
    const hueThumb = document.getElementById('gnColorHueThumb');
    const preview = document.getElementById('gnColorCustomPreview');
    const hexInput = document.getElementById('gnColorHexInput');
    const commitCircle = document.getElementById('gnColorCommitCircle');
    const { h, s, v } = gnColorPopoverState.hsv;
    const hex = hsvToHex(h, s, v);
    gnColorPopoverState.hex = hex;

    if (satBox) satBox.style.backgroundColor = `hsl(${Math.round(h * 360)}, 100%, 50%)`;
    if (satThumb) {
      satThumb.style.left = `${(s * 100).toFixed(2)}%`;
      satThumb.style.top = `${((1 - v) * 100).toFixed(2)}%`;
      satThumb.style.backgroundColor = hex;
    }
    if (hueThumb) {
      hueThumb.style.left = `${(h * 100).toFixed(2)}%`;
    }
    if (preview) preview.style.background = hex;
    if (commitCircle) commitCircle.style.background = hex;
    if (hexInput && document.activeElement !== hexInput) {
      hexInput.value = hex.toUpperCase();
    }
  }

  function renderGnColorPopover() {
    const pop = document.getElementById('gnColorPopover');
    if (!pop || !gnColorPopoverState.open) return;

    const titleEl = document.getElementById('gnColorPopoverTitle');
    const backBtn = document.getElementById('btnGnColorBack');
    const eyeBtn = document.getElementById('btnGnColorEyedropper');
    const moreBtn = document.getElementById('btnGnColorMoreSlot');
    const slotMenu = document.getElementById('gnColorSlotMenu');
    const presetsView = document.getElementById('gnColorPresetsView');
    const presetsGrid = document.getElementById('gnColorPresetsGrid');
    const customView = document.getElementById('gnColorCustomView');
    const commitAddBtn = document.getElementById('btnGnColorCommitAdd');
    const editActions = document.getElementById('gnColorEditActions');
    const shapeFillSection = document.getElementById('gnColorShapeFillSection');
    const shapeFillSw = document.getElementById('gnColorShapeFillSwitch');

    const { mode, toolKey, scopeKey, slotIndex, page, customOp } = gnColorPopoverState;
    const presets = getToolColorPresets(scopeKey);
    const mem = state.toolMemory && state.toolMemory[toolKey];
    const canDeleteSlot = mode === 'edit-slot' && mem && Array.isArray(mem.colorSlots) && mem.colorSlots.length > 1;
    const isCustom = page === 'custom';

    if (titleEl) {
      titleEl.textContent = GN_COLOR_POPOVER_TITLES[scopeKey] || GN_COLOR_POPOVER_TITLES[toolKey] || 'Couleur Du Stylo';
    }
    if (backBtn) backBtn.classList.toggle('hidden', !isCustom);
    if (eyeBtn) {
      const hasEyedropper = typeof window !== 'undefined' && typeof window.EyeDropper === 'function';
      eyeBtn.classList.toggle('hidden', !isCustom || !hasEyedropper);
    }
    if (moreBtn) moreBtn.classList.toggle('hidden', !canDeleteSlot);
    if (slotMenu) slotMenu.classList.toggle('hidden', !gnColorPopoverState.slotMenuOpen || !canDeleteSlot);

    if (presetsView) presetsView.classList.toggle('hidden', isCustom);
    if (customView) customView.classList.toggle('hidden', !isCustom);

    if (shapeFillSection) {
      const showShapeFill = (mode === 'add-slot' || mode === 'edit-slot') && toolKey === 'shape';
      shapeFillSection.classList.toggle('hidden', !showShapeFill);
      if (shapeFillSw && showShapeFill) shapeFillSw.checked = Boolean(state.shapeFilled);
    }

    if (!isCustom && presetsGrid) {
      presetsGrid.innerHTML = '';
      let currentSelectedHex = null;
      if (mode === 'edit-slot' && mem && mem.colorSlots[slotIndex]) {
        currentSelectedHex = (normalizeHexColor(mem.colorSlots[slotIndex]) || mem.colorSlots[slotIndex]).toLowerCase();
      } else if (mode === 'text-card' || mode === 'text-default') {
        const activeTb = getActiveTextBox(getActivePage());
        const col = (activeTb && activeTb.color) || state.textColor || '#000000';
        currentSelectedHex = (normalizeHexColor(col) || col).toLowerCase();
      } else if (mode === 'text-box-bg') {
        const typo = getTextBoxEffectiveTypography(getActiveTextBox(getActivePage()));
        if (typo.frameStyle.backgroundColor) currentSelectedHex = (normalizeHexColor(typo.frameStyle.backgroundColor) || '').toLowerCase();
      } else if (mode === 'text-box-border') {
        const typo = getTextBoxEffectiveTypography(getActiveTextBox(getActivePage()));
        if (typo.frameStyle.borderColor) currentSelectedHex = (normalizeHexColor(typo.frameStyle.borderColor) || '').toLowerCase();
      } else if (mode === 'notebook-cover' && state.newNotebookCover) {
        currentSelectedHex = (normalizeHexColor(state.newNotebookCover) || '').toLowerCase();
      } else if (mode === 'folder-color' && state.folderModalColor) {
        currentSelectedHex = (normalizeHexColor(state.folderModalColor) || '').toLowerCase();
      } else if (mode === 'radial-slot' && RADIAL_WHEEL_COLORS[slotIndex]) {
        currentSelectedHex = RADIAL_WHEEL_COLORS[slotIndex].hex.toLowerCase();
      }

      presets.forEach((presetHex, pIdx) => {
        const normP = (normalizeHexColor(presetHex) || presetHex).toLowerCase();
        const isSel = Boolean(currentSelectedHex && normP === currentSelectedHex && mode !== 'add-slot');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `gn-color-preset-btn${isSel ? ' selected' : ''}`;
        btn.dataset.presetIndex = String(pIdx);
        btn.dataset.presetHex = normP;
        btn.title = isSel ? `${normP.toUpperCase()} — Cliquer pour modifier ce préréglage` : normP.toUpperCase();
        const light = isLightHexColor(normP);
        btn.innerHTML = `
          <span class="gn-color-preset-dot" style="background:${normP}"></span>
          <svg class="gn-color-preset-chevron" viewBox="0 0 10 6" fill="none" aria-hidden="true">
            <path d="M2 1.5L5 4.5L8 1.5" stroke="${light ? '#3f3f46' : '#ffffff'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        `;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (isSel) {
            // Re-cliquer sur un préréglage déjà sélectionné ouvre l'éditeur personnalisé GoodNotes (modifier / supprimer)
            gnColorPopoverState.page = 'custom';
            gnColorPopoverState.customOp = 'edit';
            gnColorPopoverState.editingPresetIndex = pIdx;
            gnColorPopoverState.hex = normP;
            gnColorPopoverState.hsv = hexToHsv(normP);
            renderGnColorPopover();
            positionGnColorPopover(gnColorPopoverState.anchorEl);
            return;
          }
          applyColorFromGnPopover(normP, { close: true });
        });
        presetsGrid.appendChild(btn);
      });

      // Bouton Roue Arc-en-Ciel GoodNotes pour ajouter une couleur personnalisée
      if (presets.length < GN_MAX_COLOR_PRESETS) {
        const rainbowBtn = document.createElement('button');
        rainbowBtn.type = 'button';
        rainbowBtn.className = 'gn-color-rainbow-btn';
        rainbowBtn.id = 'btnGnColorOpenCustom';
        rainbowBtn.title = 'Couleur personnalisée (Spectre / HEX)';
        rainbowBtn.setAttribute('aria-label', 'Ajouter une couleur personnalisée');
        rainbowBtn.innerHTML = '<span class="gn-color-rainbow-wheel"></span>';
        rainbowBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const startHex = currentSelectedHex || getActiveToolColor(toolKey) || '#007aff';
          gnColorPopoverState.page = 'custom';
          gnColorPopoverState.customOp = 'add';
          gnColorPopoverState.editingPresetIndex = -1;
          gnColorPopoverState.hex = normalizeHexColor(startHex) || '#007aff';
          gnColorPopoverState.hsv = hexToHsv(gnColorPopoverState.hex);
          renderGnColorPopover();
          positionGnColorPopover(gnColorPopoverState.anchorEl);
        });
        presetsGrid.appendChild(rainbowBtn);
      }
    } else if (isCustom) {
      if (commitAddBtn) commitAddBtn.classList.toggle('hidden', customOp !== 'add');
      if (editActions) editActions.classList.toggle('hidden', customOp !== 'edit');
      syncGnColorCustomEditorUi();
    }
  }

  function openGnColorPopover(opts = {}) {
    const pop = document.getElementById('gnColorPopover');
    if (!pop) return false;

    // Si on re-clique sur le même bouton ancre alors que le popover est déjà ouvert, on le ferme (toggle GoodNotes)
    if (gnColorPopoverState.open && opts.anchorEl && gnColorPopoverState.anchorEl === opts.anchorEl && !opts.forceOpen) {
      closeGnColorPopover();
      return false;
    }

    // Ferme les autres popovers concurrents
    state.gnPenPopoverOpen = false;
    state.gnPencilPopoverOpen = false;
    state.gnHighlighterPopoverOpen = false;
    state.gnTapePopoverOpen = false;
    state.gnStrokePopoverOpen = false;
    state.gnShapeStrokePopoverOpen = false;
    if (gnColorPopoverState.anchorEl && gnColorPopoverState.anchorEl.classList) {
      gnColorPopoverState.anchorEl.classList.remove('popover-open');
    }

    const mode = opts.mode || 'add-slot';
    const toolKey = opts.toolKey || (state.toolMemory[state.tool] ? state.tool : 'pen');
    const scopeKey = opts.scopeKey || (mode === 'lasso' ? 'lasso' : (mode === 'notebook-cover' ? 'cover' : (mode === 'folder-color' ? 'folder' : (mode === 'text-card' ? 'text' : toolKey))));

    gnColorPopoverState.open = true;
    gnColorPopoverState.mode = mode;
    gnColorPopoverState.toolKey = toolKey;
    gnColorPopoverState.scopeKey = scopeKey;
    gnColorPopoverState.slotIndex = typeof opts.slotIndex === 'number' ? opts.slotIndex : -1;
    gnColorPopoverState.anchorEl = opts.anchorEl || null;
    gnColorPopoverState.page = opts.initialPage === 'custom' ? 'custom' : 'presets';
    gnColorPopoverState.customOp = 'add';
    gnColorPopoverState.editingPresetIndex = -1;
    gnColorPopoverState.textCardId = opts.textCardId || null;
    gnColorPopoverState.slotMenuOpen = false;

    const initHex = normalizeHexColor(opts.initialColor || getActiveToolColor(toolKey)) || '#007aff';
    gnColorPopoverState.hex = initHex;
    gnColorPopoverState.hsv = hexToHsv(initHex);

    if (gnColorPopoverState.anchorEl && gnColorPopoverState.anchorEl.classList) {
      gnColorPopoverState.anchorEl.classList.add('popover-open');
    }
    pop.classList.remove('hidden');
    renderGnColorPopover();
    positionGnColorPopover(gnColorPopoverState.anchorEl);
    return true;
  }

  function renderDynamicColorSlotBar(containerEl, toolKey, addBtnEl) {
    if (!containerEl) return;
    const key = (state.toolMemory && state.toolMemory[toolKey]) ? toolKey : 'pen';
    const mem = state.toolMemory[key];
    if (!mem) return;
    if (!Array.isArray(mem.colorSlots) || mem.colorSlots.length === 0) {
      mem.colorSlots = [mem.color || '#000000', '#007aff', '#dc2626'];
    }
    const curColor = (getActiveToolColor(key) || mem.color || '#000000').toLowerCase();
    let activeIdx = (typeof mem.activeColorSlotIndex === 'number' && mem.activeColorSlotIndex >= 0 && mem.activeColorSlotIndex < mem.colorSlots.length)
      ? mem.activeColorSlotIndex
      : mem.colorSlots.findIndex((c) => String(c).toLowerCase() === curColor);
    if (activeIdx < 0) activeIdx = 0;
    if ((mem.colorSlots[activeIdx] || '').toLowerCase() !== curColor) {
      const exactIdx = mem.colorSlots.findIndex((c) => String(c).toLowerCase() === curColor);
      if (exactIdx >= 0) activeIdx = exactIdx;
    }
    mem.activeColorSlotIndex = activeIdx;

    const sig = `${key}|${activeIdx}|${mem.colorSlots.join(',')}`;
    if (containerEl.dataset && containerEl.dataset.renderedSig === sig && containerEl.children && containerEl.children.length === mem.colorSlots.length) {
      return;
    }
    if (containerEl.dataset) containerEl.dataset.renderedSig = sig;
    containerEl.innerHTML = '';

    mem.colorSlots.forEach((slotHex, idx) => {
      const normHex = normalizeHexColor(slotHex) || slotHex;
      const isAct = idx === activeIdx;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `gn-color-circle${isAct ? ' active' : ''}${isLightHexColor(normHex) ? ' is-light-color' : ''}`;
      btn.dataset.gnColorSlot = String(idx);
      btn.dataset.gnColor = normHex;
      if (key === 'shape' && isAct) btn.id = 'gnShapeColorBtn';
      btn.style.background = normHex;
      btn.title = isAct
        ? `Couleur active (${normHex.toUpperCase()}) — Cliquer pour changer ou supprimer`
        : `Couleur ${idx + 1} (${normHex.toUpperCase()})`;
      btn.innerHTML = '<svg class="gn-color-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (isAct) {
          openGnColorPopover({
            mode: 'edit-slot',
            toolKey: key,
            slotIndex: idx,
            anchorEl: btn,
            initialColor: normHex
          });
          return;
        }
        closeGnColorPopover();
        state.gnPenPopoverOpen = false;
        state.gnPencilPopoverOpen = false;
        state.gnHighlighterPopoverOpen = false;
        state.gnTapePopoverOpen = false;
        state.gnStrokePopoverOpen = false;
        state.gnShapeStrokePopoverOpen = false;
        setToolColor(key, normHex, { slotIndex: idx, selectOnly: true });
        if (state.tool === 'lasso' && hasAnyLassoSelection()) recolorLassoSelection(normHex);
        updateToolbarActiveState();
      });
      containerEl.appendChild(btn);
    });

    if (addBtnEl) {
      const isFull = mem.colorSlots.length >= GN_MAX_COLOR_SLOTS;
      addBtnEl.disabled = false;
      addBtnEl.title = isFull
        ? `Maximum (${GN_MAX_COLOR_SLOTS}) atteint — cliquer pour ajouter/remplacer une couleur`
        : 'Ajouter une couleur sélectionnable';
    }
  }

  let gnColorPopoverInitialized = false;
  function initGnColorPopover() {
    if (gnColorPopoverInitialized) return;
    gnColorPopoverInitialized = true;

    const pop = document.getElementById('gnColorPopover');
    if (!pop) return;

    pop.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    pop.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (gnColorPopoverState.slotMenuOpen) {
        const moreBtn = document.getElementById('btnGnColorMoreSlot');
        const slotMenu = document.getElementById('gnColorSlotMenu');
        if (slotMenu && !slotMenu.contains(ev.target) && (!moreBtn || !moreBtn.contains(ev.target))) {
          gnColorPopoverState.slotMenuOpen = false;
          slotMenu.classList.add('hidden');
        }
      }
    });

    const backBtn = document.getElementById('btnGnColorBack');
    if (backBtn) {
      backBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        gnColorPopoverState.page = 'presets';
        renderGnColorPopover();
        positionGnColorPopover(gnColorPopoverState.anchorEl);
      });
    }

    const moreBtn = document.getElementById('btnGnColorMoreSlot');
    if (moreBtn) {
      moreBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        gnColorPopoverState.slotMenuOpen = !gnColorPopoverState.slotMenuOpen;
        const slotMenu = document.getElementById('gnColorSlotMenu');
        if (slotMenu) slotMenu.classList.toggle('hidden', !gnColorPopoverState.slotMenuOpen);
      });
    }

    const removeSlotBtn = document.getElementById('btnGnColorRemoveSlot');
    if (removeSlotBtn) {
      removeSlotBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (gnColorPopoverState.mode === 'edit-slot') {
          if (removeToolColorSlot(gnColorPopoverState.toolKey, gnColorPopoverState.slotIndex)) {
            closeGnColorPopover();
            updateToolbarActiveState();
            showToast('Emplacement de couleur supprimé');
          }
        }
      });
    }

    const eyeBtn = document.getElementById('btnGnColorEyedropper');
    if (eyeBtn) {
      eyeBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (typeof window === 'undefined' || typeof window.EyeDropper !== 'function') return;
        try {
          const dropper = new window.EyeDropper();
          const res = await dropper.open();
          if (res && res.sRGBHex) {
            const norm = normalizeHexColor(res.sRGBHex);
            if (norm) {
              gnColorPopoverState.hex = norm;
              gnColorPopoverState.hsv = hexToHsv(norm);
              syncGnColorCustomEditorUi();
            }
          }
        } catch (_) {}
      });
    }

    // 2D Saturation / Brightness picker
    const satBox = document.getElementById('gnColorSatBox');
    if (satBox) {
      let satDragging = false;
      const updateSatFromEvent = (ev) => {
        const rect = satBox.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        const s = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const v = Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top) / rect.height));
        gnColorPopoverState.hsv.s = s;
        gnColorPopoverState.hsv.v = v;
        syncGnColorCustomEditorUi();
      };
      satBox.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        satDragging = true;
        try { satBox.setPointerCapture(ev.pointerId); } catch (_) {}
        updateSatFromEvent(ev);
      });
      satBox.addEventListener('pointermove', (ev) => {
        if (!satDragging) return;
        ev.preventDefault();
        updateSatFromEvent(ev);
      });
      const stopSat = (ev) => {
        if (!satDragging) return;
        satDragging = false;
        try { satBox.releasePointerCapture(ev.pointerId); } catch (_) {}
      };
      satBox.addEventListener('pointerup', stopSat);
      satBox.addEventListener('pointercancel', stopSat);
    }

    // Horizontal Hue Spectrum Bar
    const hueWrap = document.getElementById('gnColorHueWrap');
    if (hueWrap) {
      let hueDragging = false;
      const updateHueFromEvent = (ev) => {
        const bar = document.getElementById('gnColorHueBar') || hueWrap;
        const rect = bar.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;
        const h = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        gnColorPopoverState.hsv.h = h;
        syncGnColorCustomEditorUi();
      };
      hueWrap.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        hueDragging = true;
        try { hueWrap.setPointerCapture(ev.pointerId); } catch (_) {}
        updateHueFromEvent(ev);
      });
      hueWrap.addEventListener('pointermove', (ev) => {
        if (!hueDragging) return;
        ev.preventDefault();
        updateHueFromEvent(ev);
      });
      const stopHue = (ev) => {
        if (!hueDragging) return;
        hueDragging = false;
        try { hueWrap.releasePointerCapture(ev.pointerId); } catch (_) {}
      };
      hueWrap.addEventListener('pointerup', stopHue);
      hueWrap.addEventListener('pointercancel', stopHue);
    }

    // Hex Input two-way sync
    const hexInput = document.getElementById('gnColorHexInput');
    if (hexInput) {
      hexInput.addEventListener('input', (ev) => {
        const raw = String(ev.target.value || '').trim();
        const norm = normalizeHexColor(raw);
        if (norm) {
          gnColorPopoverState.hex = norm;
          gnColorPopoverState.hsv = hexToHsv(norm);
          syncGnColorCustomEditorUi();
        }
      });
      hexInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          if (gnColorPopoverState.customOp === 'add') {
            document.getElementById('btnGnColorCommitAdd')?.click();
          } else {
            document.getElementById('btnGnColorCommitEdit')?.click();
          }
        }
      });
    }

    // Commit New Custom Color (ajoute aux préréglages ET à la barre sélectionnable)
    const commitAddBtn = document.getElementById('btnGnColorCommitAdd');
    if (commitAddBtn) {
      commitAddBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const hex = normalizeHexColor(gnColorPopoverState.hex) || '#007aff';
        const presets = getToolColorPresets(gnColorPopoverState.scopeKey);
        if (!presets.some((c) => c.toLowerCase() === hex.toLowerCase()) && presets.length < GN_MAX_COLOR_PRESETS) {
          presets.push(hex);
          saveToolMemoryToStorage();
        }
        applyColorFromGnPopover(hex, { close: true });
      });
    }

    // Commit Edit Existing Preset (Bouton Valider bleu GoodNotes)
    const commitEditBtn = document.getElementById('btnGnColorCommitEdit');
    if (commitEditBtn) {
      commitEditBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const hex = normalizeHexColor(gnColorPopoverState.hex) || '#007aff';
        const presets = getToolColorPresets(gnColorPopoverState.scopeKey);
        const idx = gnColorPopoverState.editingPresetIndex;
        if (idx >= 0 && idx < presets.length) {
          presets[idx] = hex;
          saveToolMemoryToStorage();
        }
        applyColorFromGnPopover(hex, { close: true });
      });
    }

    // Delete Existing Preset (Bouton Poubelle rouge GoodNotes)
    const delPresetBtn = document.getElementById('btnGnColorDeletePreset');
    if (delPresetBtn) {
      delPresetBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const presets = getToolColorPresets(gnColorPopoverState.scopeKey);
        const idx = gnColorPopoverState.editingPresetIndex;
        if (idx >= 0 && idx < presets.length && presets.length > 1) {
          presets.splice(idx, 1);
          saveToolMemoryToStorage();
        }
        gnColorPopoverState.page = 'presets';
        renderGnColorPopover();
        positionGnColorPopover(gnColorPopoverState.anchorEl);
      });
    }

    // Switch Remplir la couleur pour Formes
    const shapeFillSw = document.getElementById('gnColorShapeFillSwitch');
    if (shapeFillSw) {
      shapeFillSw.addEventListener('change', (ev) => {
        state.shapeFilled = Boolean(ev.target.checked);
        if (dom.shapeFillCheckbox) dom.shapeFillCheckbox.checked = state.shapeFilled;
      });
    }

    // Fermeture au clic extérieur et touche Échap
    document.addEventListener('pointerdown', (ev) => {
      if (!gnColorPopoverState.open) return;
      const t = ev.target;
      if (pop.contains && pop.contains(t)) return;
      if (gnColorPopoverState.anchorEl && gnColorPopoverState.anchorEl.contains && gnColorPopoverState.anchorEl.contains(t)) return;
      closeGnColorPopover();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && gnColorPopoverState.open) {
        ev.preventDefault(); // ne ferme pas aussi la fenêtre modale en dessous
        closeGnColorPopover();
      }
    });

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', () => {
        if (gnColorPopoverState.open && gnColorPopoverState.anchorEl) {
          positionGnColorPopover(gnColorPopoverState.anchorEl);
        }
      });
    }
  }

  function syncGnPenSubBarUi() {
    const subBar = document.getElementById('gnPenSubBar');
    if (!subBar) return;
    const setBtnColorVar = (el, hex) => {
      if (el && el.style && typeof el.style.setProperty === 'function') {
        el.style.setProperty('--gn-tool-color', hex || '#18181b');
      }
    };

    subBar.querySelectorAll('.gn-subtool-btn').forEach((btn) => {
      const st = btn.dataset.subtool;
      let isActive = false;
      if (st === 'pen') {
        isActive = state.tool === 'pen';
        btn.dataset.penstyle = state.penStyle || 'fountain';
        setBtnColorVar(btn, state.penColor || '#111827');
        btn.classList.toggle('popover-open', Boolean(state.gnPenPopoverOpen));
      } else if (st === 'pencil') {
        isActive = state.tool === 'pencil';
        setBtnColorVar(btn, state.pencilColor || '#111827');
        btn.classList.toggle('popover-open', Boolean(state.gnPencilPopoverOpen));
      } else if (st === 'highlighter') {
        isActive = state.tool === 'highlighter';
        btn.dataset.straight = String(Boolean(state.highlighterAutoStraighten));
        setBtnColorVar(btn, state.highlighterColor || '#facc15');
        btn.classList.toggle('popover-open', Boolean(state.gnHighlighterPopoverOpen));
      } else if (st === 'tape') {
        isActive = state.tool === 'tape';
        setBtnColorVar(btn, state.tapeColor || '#ff5f67');
        btn.classList.toggle('popover-open', Boolean(state.gnTapePopoverOpen));
      } else if (st === 'instant-shape') {
        isActive = Boolean(state.instantShapeMode);
      } else {
        isActive = state.tool === st;
      }
      btn.classList.toggle('active', isActive);
    });

    // Synchronisation de la sous-barre Formes GoodNotes (#gnShapeSubBar) & popover Réglages Du Trait (#gnShapeStrokePopover)
    const shapeBar = document.getElementById('gnShapeSubBar');
    if (shapeBar) {
      shapeBar.querySelectorAll('.gn-shape-btn[data-gn-shapetype]').forEach((b) => {
        b.classList.toggle('active', b.dataset.gnShapetype === state.shapeType);
      });
      const shSize = Number(state.shapeSize || 4);
      const barIdx = shSize <= 3 ? 0 : (shSize <= 6 ? 1 : 2);
      const shapeThickBtnEl = document.getElementById('gnShapeThicknessBtn');
      if (shapeThickBtnEl) {
        shapeThickBtnEl.classList.toggle('popover-open', Boolean(state.gnShapeStrokePopoverOpen));
        shapeThickBtnEl.setAttribute('aria-expanded', String(Boolean(state.gnShapeStrokePopoverOpen)));
      }
      shapeBar.querySelectorAll('#gnShapeThicknessBtn .gn-shape-bar').forEach((bar, i) => {
        bar.classList.toggle('active', i === barIdx);
      });
      const shColSlots = document.getElementById('gnShapeColorSlots');
      const shAddColBtn = document.getElementById('gnShapeAddColorBtn');
      if (shColSlots) {
        renderDynamicColorSlotBar(shColSlots, 'shape', shAddColBtn);
      }

      const shPop = document.getElementById('gnShapeStrokePopover');
      if (shPop) {
        const shMm = document.getElementById('gnShapeStrokeMmReadout');
        if (shMm) shMm.textContent = `${(shSize / 10).toFixed(2)} mm`;
        const shLs = state.shapeLineStyle || 'solid';
        shPop.querySelectorAll('#gnShapeLineStyleGrid .gn-line-style-card').forEach((card) => {
          card.classList.toggle('active', card.dataset.gnShapelinestyle === shLs);
        });
        const shSlider = document.getElementById('gnShapeStrokeSizeSlider');
        if (shSlider) shSlider.value = String(Math.max(1, Math.min(24, shSize)));
        const shRoundSw = document.getElementById('gnShapeRoundedCornersSwitch');
        if (shRoundSw) shRoundSw.checked = state.shapeRoundedCorners !== false;
        const startAr = state.shapeStartArrow || 'none';
        const endAr = state.shapeEndArrow || 'none';
        shPop.querySelectorAll('#gnShapeStartArrowCol .gn-arrowhead-opt').forEach((opt) => {
          opt.classList.toggle('active', opt.dataset.arrowStyle === startAr);
        });
        shPop.querySelectorAll('#gnShapeEndArrowCol .gn-arrowhead-opt').forEach((opt) => {
          opt.classList.toggle('active', opt.dataset.arrowStyle === endAr);
        });
        positionSubBarPopoverUnderAnchor(shapeThickBtnEl, 'gnShapeStrokePopover', 'gnShapeStrokePopoverCaret', state.gnShapeStrokePopoverOpen);
      }
    }

    const toolKey = DEFAULT_TOOL_SIZE_SLOTS[state.tool] ? state.tool : 'pen';
    const slots = getActiveToolSizeSlots(toolKey);
    const sliderCfg = getToolSizeSliderConfig(toolKey);
    const curSize = getActiveToolSize();
    const thickWrap = document.getElementById('gnSubBarThickness');
    if (thickWrap) thickWrap.classList.toggle('is-pencil-mode', state.tool === 'pencil');

    const thickBtns = Array.from(subBar.querySelectorAll('.gn-thick-btn'));
    let activeSlotIdx = state.activeSizeSlotByTool && typeof state.activeSizeSlotByTool[toolKey] === 'number'
      ? state.activeSizeSlotByTool[toolKey]
      : -1;
    if (activeSlotIdx < 0 || activeSlotIdx >= thickBtns.length || Math.abs((slots[activeSlotIdx] ?? curSize) - curSize) > 0.05) {
      let bestIdx = 1, bestDiff = Infinity;
      slots.forEach((sv, idx) => {
        const d = Math.abs(sv - curSize);
        if (d < bestDiff) { bestDiff = d; bestIdx = idx; }
      });
      activeSlotIdx = bestIdx;
      if (state.activeSizeSlotByTool) state.activeSizeSlotByTool[toolKey] = activeSlotIdx;
    }

    const lineStyle = state.penLineStyle || 'solid';
    thickBtns.forEach((b, idx) => {
      const sv = Number(slots[idx] ?? b.dataset.gnSize ?? 5);
      b.dataset.gnSize = String(sv);
      b.dataset.gnSlot = String(idx);
      const isAct = idx === activeSlotIdx;
      b.classList.toggle('active', isAct);
      b.classList.toggle('popover-open', Boolean(isAct && state.gnStrokePopoverOpen));
      const mmText = `${(sv / 10).toFixed(2)} mm`;
      b.title = `Épaisseur ${mmText} — Cliquer pour ouvrir Réglages Du Trait`;
      const lineEl = b.querySelector('.gn-thick-line');
      if (lineEl) {
        const ratio = Math.max(0, Math.min(1, (sv - sliderCfg.min) / Math.max(1, sliderCfg.max - sliderCfg.min)));
        const hPx = (1.4 + ratio * 5.2).toFixed(1);
        lineEl.style.height = `${hPx}px`;
        lineEl.classList.toggle('is-dashed', Boolean(isAct && state.tool === 'pen' && lineStyle === 'dashed'));
        lineEl.classList.toggle('is-dotted', Boolean(isAct && state.tool === 'pen' && lineStyle === 'dotted'));
      }
      const pencilPrevEl = b.querySelector('.gn-thick-pencil-preview');
      if (pencilPrevEl && state.tool === 'pencil') {
        const key = `${sv.toFixed(2)}`;
        if (pencilPrevEl.dataset.renderedSize !== key) {
          pencilPrevEl.innerHTML = buildPencilThicknessPreviewSvg(sv, sliderCfg.min, sliderCfg.max);
          pencilPrevEl.dataset.renderedSize = key;
        }
      }
    });

    // Mise à jour du popover "Réglages Du Trait" (style GoodNotes 6)
    const strokePopover = document.getElementById('gnStrokePopover');
    if (strokePopover) {
      const mmEl = document.getElementById('gnStrokeMmReadout');
      if (mmEl) mmEl.textContent = `${(curSize / 10).toFixed(2)} mm`;

      const styleGrid = document.getElementById('gnStrokeLineStyleGrid');
      if (styleGrid) {
        styleGrid.classList.toggle('hidden', state.tool !== 'pen');
        styleGrid.querySelectorAll('.gn-line-style-card').forEach((card) => {
          card.classList.toggle('active', card.dataset.gnLinestyle === lineStyle);
        });
      }

      const thickLabel = document.getElementById('gnStrokeThicknessLabel');
      if (thickLabel) thickLabel.textContent = sliderCfg.label;

      const wedgeSlider = document.getElementById('gnStrokeSizeSlider');
      if (wedgeSlider) {
        wedgeSlider.min = String(sliderCfg.min);
        wedgeSlider.max = String(sliderCfg.max);
        wedgeSlider.step = String(sliderCfg.step);
        wedgeSlider.value = String(Math.max(sliderCfg.min, Math.min(sliderCfg.max, curSize)));
      }
      positionSubBarPopoverUnderAnchor(thickBtns[activeSlotIdx], 'gnStrokePopover', 'gnStrokePopoverCaret', state.gnStrokePopoverOpen);
    }

    // Pastilles de couleurs dynamiques propres à l'outil actif (Stylo, Crayon, Surligneur, Ruban) — style GoodNotes 6
    const subBarSlotsEl = document.getElementById('gnSubBarColorSlots');
    const subBarAddBtnEl = document.getElementById('gnSubAddColorBtn');
    if (subBarSlotsEl) {
      renderDynamicColorSlotBar(subBarSlotsEl, toolKey, subBarAddBtnEl);
    }

    // Mise à jour du popover Crayon (aperçu graphite + Dessiner et maintenir)
    const pencilHoldSw = document.getElementById('gnPencilHoldToShapeSwitch');
    if (pencilHoldSw) pencilHoldSw.checked = Boolean(state.pencilDrawAndHold);
    if (state.gnPencilPopoverOpen) {
      renderGnPencilPreviewCanvas();
      positionSubBarPopoverUnderAnchor(document.getElementById('gnSubToolPencil'), 'gnPencilPopover', 'gnPencilPopoverCaret', true);
    }

    // Mise à jour du popover Surligneur (Stabilisation + Tracer en ligne droite)
    const hlStabPct = Math.round((state.highlighterSmoothing ?? 0) * 100);
    const hlStabSlider = document.getElementById('gnHighlighterStabSlider');
    const hlStabVal = document.getElementById('gnHighlighterStabVal');
    if (hlStabSlider) {
      hlStabSlider.value = String(hlStabPct);
      if (hlStabSlider.style && typeof hlStabSlider.style.setProperty === 'function') {
        hlStabSlider.style.setProperty('--val', `${hlStabPct}%`);
      }
    }
    if (hlStabVal) hlStabVal.textContent = `${hlStabPct}%`;
    const hlStraightSw = document.getElementById('gnHighlighterStraightSwitch');
    if (hlStraightSw) hlStraightSw.checked = Boolean(state.highlighterAutoStraighten);
    if (state.gnHighlighterPopoverOpen) {
      positionSubBarPopoverUnderAnchor(document.getElementById('gnSubToolHighlighter'), 'gnHighlighterPopover', 'gnHighlighterPopoverCaret', true);
    }
    const tapeStraightSw = document.getElementById('gnTapeStraightSwitch');
    if (tapeStraightSw) tapeStraightSw.checked = Boolean(state.tapeForceStraight);
    const tapePrevBar = document.getElementById('gnTapePreviewBar');
    if (tapePrevBar) tapePrevBar.setAttribute('fill', state.tapeColor || '#ff5f67');
    if (state.gnTapePopoverOpen) {
      positionSubBarPopoverUnderAnchor(document.getElementById('gnSubToolTape'), 'gnTapePopover', 'gnTapePopoverCaret', true);
    }
    if (state.gnPenPopoverOpen) {
      positionSubBarPopoverUnderAnchor(document.getElementById('gnSubToolPen'), 'gnPenPopover', 'gnPenPopoverCaret', true);
    }

    // Mise à jour du popover Réglages du stylo
    const titleEl = document.getElementById('gnPenPopoverTitle');
    const styleNames = { fountain: 'Stylo À Plume', ballpoint: 'Stylo À Bille', brush: 'Stylo Pinceau' };
    if (titleEl) titleEl.textContent = styleNames[state.penStyle] || 'Stylo À Plume';

    document.querySelectorAll('#gnPenTypeGrid .gn-pen-type-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.gnPenstyle === state.penStyle);
    });

    const isBall = state.penStyle === 'ballpoint';
    const tipRow = document.getElementById('gnTipSharpnessRow');
    const presRow = document.getElementById('gnPressureSensRow');
    if (tipRow) tipRow.classList.toggle('hidden', isBall);
    if (presRow) presRow.classList.toggle('hidden', isBall);

    const tipPct = Math.round((state.tipSharpness ?? 0.5) * 100);
    const presPct = Math.round((state.pressureSensitivity ?? 0.5) * 100);
    const stabPct = Math.round((state.smoothing ?? 0.65) * 100);
    const tipSlider = document.getElementById('gnTipSharpnessSlider');
    const presSlider = document.getElementById('gnPressureSensSlider');
    const stabSlider = document.getElementById('gnStabilizationSlider');
    const setRangeVar = (el, pct) => {
      if (!el) return;
      el.value = String(pct);
      if (el.style && typeof el.style.setProperty === 'function') el.style.setProperty('--val', `${pct}%`);
    };
    setRangeVar(tipSlider, tipPct);
    setRangeVar(presSlider, presPct);
    setRangeVar(stabSlider, stabPct);
    const tipVal = document.getElementById('gnTipSharpnessVal');
    const presVal = document.getElementById('gnPressureSensVal');
    const stabVal = document.getElementById('gnStabilizationVal');
    if (tipVal) tipVal.textContent = `${tipPct}%`;
    if (presVal) presVal.textContent = `${presPct}%`;
    if (stabVal) stabVal.textContent = `${stabPct}%`;

    // Aperçu dynamique de la courbe S selon le type de stylo & la sensibilité
    const previewPath = document.getElementById('gnPenPreviewPath');
    if (previewPath) {
      const baseW = isBall ? 4.4 : (state.penStyle === 'brush' ? 6.5 : 5.2);
      previewPath.setAttribute('stroke', state.penColor || '#111827');
      previewPath.setAttribute('stroke-width', String(baseW));
      previewPath.setAttribute('stroke-linecap', isBall ? 'round' : 'butt');
    }

    const holdSw = document.getElementById('gnHoldToShapeSwitch');
    if (holdSw) holdSw.checked = Boolean(state.autoShapeEnabled);
    const scribSw = document.getElementById('gnScribbleEraseSwitch');
    if (scribSw) scribSw.checked = Boolean(state.scribbleToErase);
    const scribShSw = document.getElementById('gnScribbleEraseShapesHlSwitch');
    if (scribShSw) scribShSw.checked = Boolean(state.scribbleEraseShapesAndHl);
    const lassoSw = document.getElementById('gnCircleLassoSwitch');
    if (lassoSw) lassoSw.checked = Boolean(state.circleToLasso);
  }

  function syncGnEraserSubBarUi() {
    const eraserBar = document.getElementById('gnEraserSubBar');
    if (!eraserBar) return;

    const modeLabels = { stroke: 'Trait', segment: 'Segment', partial: 'Précision' };
    const modeLabelEl = document.getElementById('gnEraserModeLabel');
    if (modeLabelEl) modeLabelEl.textContent = modeLabels[state.eraserMode] || 'Trait';

    const modeBtn = document.getElementById('gnEraserModeBtn');
    if (modeBtn) modeBtn.classList.toggle('popover-open', Boolean(state.gnEraserModePopoverOpen));
    const advBtn = document.getElementById('gnEraserAdvBtn');
    if (advBtn) {
      advBtn.classList.toggle('popover-open', Boolean(state.gnEraserAdvPopoverOpen));
      advBtn.setAttribute('aria-expanded', String(Boolean(state.gnEraserAdvPopoverOpen)));
    }

    document.querySelectorAll('#gnEraserModePopover .gn-eraser-mode-option').forEach((opt) => {
      opt.classList.toggle('active', opt.dataset.gnErasermode === state.eraserMode);
    });

    // Synchronisation des 3 cercles de taille de la gomme
    const slots = getActiveToolSizeSlots('eraser');
    const curSize = Number(state.eraserSize || 18);
    const sizeBtns = Array.from(eraserBar.querySelectorAll('.gn-eraser-size-btn'));
    let activeSlotIdx = state.activeSizeSlotByTool && typeof state.activeSizeSlotByTool.eraser === 'number'
      ? state.activeSizeSlotByTool.eraser
      : -1;
    if (activeSlotIdx < 0 || activeSlotIdx >= sizeBtns.length || Math.abs((slots[activeSlotIdx] ?? curSize) - curSize) > 0.2) {
      let bestIdx = 1, bestDiff = Infinity;
      slots.forEach((sv, idx) => {
        const d = Math.abs(sv - curSize);
        if (d < bestDiff) { bestDiff = d; bestIdx = idx; }
      });
      activeSlotIdx = bestIdx;
      if (state.activeSizeSlotByTool) state.activeSizeSlotByTool.eraser = activeSlotIdx;
    }

    const minVisual = [20, 28, 42];
    const maxVisual = [32, 46, 66];
    sizeBtns.forEach((btn, idx) => {
      const sv = Number(slots[idx] ?? btn.dataset.gnEraserSize ?? DEFAULT_TOOL_SIZE_SLOTS.eraser[idx]);
      btn.dataset.gnEraserSize = String(sv);
      btn.dataset.gnEraserSlot = String(idx);
      const isAct = idx === activeSlotIdx;
      btn.classList.toggle('active', isAct);
      btn.classList.toggle('popover-open', Boolean(isAct && state.gnEraserSizePopoverOpen));
      btn.title = `Taille de gomme ${Math.round(sv)} px — Cliquer pour ajuster`;
      const ring = btn.querySelector('.gn-eraser-ring');
      if (ring) {
        const ratio = Math.max(0, Math.min(1, (sv - 4) / 52));
        const dPx = Math.round(minVisual[idx] + ratio * (maxVisual[idx] - minVisual[idx]));
        ring.style.width = `${dPx}px`;
        ring.style.height = `${dPx}px`;
      }
    });

    // Synchronisation des filtres dans "Réglages Avancés"
    const filters = state.eraserFilters || { pen: true, pencil: true, highlighter: true, tape: true };
    const fPen = document.getElementById('gnEraserFilterPen');
    const fPencil = document.getElementById('gnEraserFilterPencil');
    const fHl = document.getElementById('gnEraserFilterHighlighter');
    const fTape = document.getElementById('gnEraserFilterTape');
    if (fPen) fPen.checked = state.eraserHighlighterOnly ? false : filters.pen !== false;
    if (fPencil) fPencil.checked = state.eraserHighlighterOnly ? false : filters.pencil !== false;
    if (fHl) fHl.checked = state.eraserHighlighterOnly ? true : filters.highlighter !== false;
    if (fTape) fTape.checked = state.eraserHighlighterOnly ? false : filters.tape !== false;

    const autoDeselSw = document.getElementById('gnEraserAutoDeselectSwitch');
    if (autoDeselSw) autoDeselSw.checked = Boolean(state.eraserAutoDeselect);

    // Synchronisation du popover "Taille De La Gomme"
    const sizeReadout = document.getElementById('gnEraserSizeReadout');
    if (sizeReadout) sizeReadout.textContent = `${Math.round(curSize)} px`;
    const sizeSlider = document.getElementById('gnEraserSizeSlider');
    if (sizeSlider) sizeSlider.value = String(Math.max(4, Math.min(56, curSize)));

    // Positionnement et alignement dynamique des menus & pointes sous chaque bouton de la barre gomme
    positionSubBarPopoverUnderAnchor(modeBtn, 'gnEraserModePopover', 'gnEraserModeCaret', state.gnEraserModePopoverOpen);
    positionSubBarPopoverUnderAnchor(advBtn, 'gnEraserAdvPopover', 'gnEraserAdvCaret', state.gnEraserAdvPopoverOpen);
    positionSubBarPopoverUnderAnchor(sizeBtns[activeSlotIdx], 'gnEraserSizePopover', 'gnEraserSizeCaret', state.gnEraserSizePopoverOpen);
  }

  function bindGoodNotesPenSubBarEvents() {
    const subBar = document.getElementById('gnPenSubBar');
    const popover = document.getElementById('gnPenPopover');
    const mainView = document.getElementById('gnPenMainView');
    const gesturesView = document.getElementById('gnPenGesturesView');
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', () => {
        if (state.gnPenPopoverOpen || state.gnPencilPopoverOpen || state.gnHighlighterPopoverOpen || state.gnTapePopoverOpen || state.gnStrokePopoverOpen || state.gnShapeStrokePopoverOpen) {
          syncGnPenSubBarUi();
        }
        if (state.gnEraserModePopoverOpen || state.gnEraserAdvPopoverOpen || state.gnEraserSizePopoverOpen) {
          syncGnEraserSubBarUi();
        }
        if (gnColorPopoverState && gnColorPopoverState.open && gnColorPopoverState.anchorEl) {
          positionGnColorPopover(gnColorPopoverState.anchorEl);
        }
      });
    }
    if (!subBar || !popover) return;

    subBar.querySelectorAll('.gn-subtool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const st = btn.dataset.subtool;
        state.gnStrokePopoverOpen = false;
        if (st === 'pen') {
          state.gnPencilPopoverOpen = false;
          state.gnHighlighterPopoverOpen = false;
          state.gnTapePopoverOpen = false;
          if (state.tool === 'pen') {
            state.gnPenPopoverOpen = !state.gnPenPopoverOpen;
            if (mainView) mainView.classList.remove('hidden');
            if (gesturesView) gesturesView.classList.add('hidden');
            updateToolbarActiveState();
          } else {
            syncCanonicalToToolMemory(state.tool);
            state.tool = 'pen';
            applyToolMemoryToCanonical('pen');
            state.toolOptionsOpen = true;
            state.gnPenPopoverOpen = false;
            if (mainView) mainView.classList.remove('hidden');
            if (gesturesView) gesturesView.classList.add('hidden');
            updateToolbarActiveState();
          }
        } else if (st === 'pencil') {
          state.gnPenPopoverOpen = false;
          state.gnHighlighterPopoverOpen = false;
          state.gnTapePopoverOpen = false;
          if (state.tool === 'pencil') {
            state.gnPencilPopoverOpen = !state.gnPencilPopoverOpen;
            updateToolbarActiveState();
          } else {
            syncCanonicalToToolMemory(state.tool);
            state.tool = 'pencil';
            applyToolMemoryToCanonical('pencil');
            state.toolOptionsOpen = true;
            state.gnPencilPopoverOpen = false;
            updateToolbarActiveState();
          }
        } else if (st === 'highlighter') {
          state.gnPenPopoverOpen = false;
          state.gnPencilPopoverOpen = false;
          state.gnTapePopoverOpen = false;
          if (state.tool === 'highlighter') {
            state.gnHighlighterPopoverOpen = !state.gnHighlighterPopoverOpen;
            updateToolbarActiveState();
          } else {
            syncCanonicalToToolMemory(state.tool);
            state.tool = 'highlighter';
            applyToolMemoryToCanonical('highlighter');
            state.toolOptionsOpen = true;
            state.gnHighlighterPopoverOpen = false;
            updateToolbarActiveState();
          }
        } else if (st === 'instant-shape') {
          state.instantShapeMode = !state.instantShapeMode;
          if (state.tool !== 'pen' && state.tool !== 'pencil') {
            syncCanonicalToToolMemory(state.tool);
            state.tool = 'pen';
            applyToolMemoryToCanonical('pen');
          }
          state.toolOptionsOpen = true;
          state.gnPenPopoverOpen = false;
          state.gnPencilPopoverOpen = false;
          state.gnHighlighterPopoverOpen = false;
          state.gnTapePopoverOpen = false;
          updateToolbarActiveState();
          showToast(
            state.instantShapeMode
              ? 'Formes instantanées activées — dessinez une forme sans maintenir'
              : 'Formes instantanées désactivées',
            'info',
            1800
          );
        } else if (st === 'tape') {
          state.gnPenPopoverOpen = false;
          state.gnPencilPopoverOpen = false;
          state.gnHighlighterPopoverOpen = false;
          if (state.tool === 'tape') {
            state.gnTapePopoverOpen = !state.gnTapePopoverOpen;
            updateToolbarActiveState();
          } else {
            syncCanonicalToToolMemory(state.tool);
            state.tool = 'tape';
            applyToolMemoryToCanonical('tape');
            state.toolOptionsOpen = true;
            state.gnTapePopoverOpen = false;
            updateToolbarActiveState();
          }
        }
      });
    });

    // Événements du popover Crayon (Dessiner et maintenir)
    const gnPencilHoldSw = document.getElementById('gnPencilHoldToShapeSwitch');
    if (gnPencilHoldSw) {
      gnPencilHoldSw.addEventListener('change', (e) => {
        state.pencilDrawAndHold = Boolean(e.target.checked);
        savePencilPrefsToStorage();
        syncGnPenSubBarUi();
      });
    }

    // Événements du popover Surligneur (Stabilisation des traits + Tracer en ligne droite)
    const gnHlStabSlider = document.getElementById('gnHighlighterStabSlider');
    if (gnHlStabSlider) {
      gnHlStabSlider.addEventListener('input', (e) => {
        state.highlighterSmoothing = Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100));
        saveHighlighterPrefsToStorage();
        syncGnPenSubBarUi();
      });
    }
    const gnHlStraightSw = document.getElementById('gnHighlighterStraightSwitch');
    if (gnHlStraightSw) {
      gnHlStraightSw.addEventListener('change', (e) => {
        state.highlighterAutoStraighten = Boolean(e.target.checked);
        saveHighlighterPrefsToStorage();
        const dockHlToggle = document.getElementById('hlAutoStraightenToggle');
        if (dockHlToggle) dockHlToggle.checked = state.highlighterAutoStraighten;
        syncGnPenSubBarUi();
      });
    }

    // Événements du popover Ruban (Ruban droit + Supprimer tout le ruban — réplication GoodNotes 6)
    const gnTapeStraightSw = document.getElementById('gnTapeStraightSwitch');
    if (gnTapeStraightSw) {
      gnTapeStraightSw.addEventListener('change', (e) => {
        state.tapeForceStraight = Boolean(e.target.checked);
        saveTapePrefsToStorage();
        syncGnPenSubBarUi();
      });
    }
    const btnGnTapeRemoveAll = document.getElementById('btnGnTapeRemoveAll');
    if (btnGnTapeRemoveAll) {
      btnGnTapeRemoveAll.addEventListener('click', () => {
        removeAllTapesOnActivePage();
      });
    }

    subBar.querySelectorAll('.gn-thick-btn').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        const toolKey = DEFAULT_TOOL_SIZE_SLOTS[state.tool] ? state.tool : 'pen';
        const slotIdx = Number.isInteger(parseInt(btn.dataset.gnSlot, 10)) ? parseInt(btn.dataset.gnSlot, 10) : idx;
        const prevSlot = state.activeSizeSlotByTool ? state.activeSizeSlotByTool[toolKey] : -1;
        const slots = getActiveToolSizeSlots(toolKey);
        const sz = Number(slots[slotIdx] ?? parseFloat(btn.dataset.gnSize));

        if (state.gnStrokePopoverOpen && prevSlot === slotIdx) {
          state.gnStrokePopoverOpen = false;
          updateToolbarActiveState();
          return;
        }
        if (state.activeSizeSlotByTool) state.activeSizeSlotByTool[toolKey] = slotIdx;
        if (Number.isFinite(sz) && sz > 0) setToolSize(state.tool, sz);
        state.gnPenPopoverOpen = false;
        state.gnPencilPopoverOpen = false;
        state.gnHighlighterPopoverOpen = false;
        state.gnTapePopoverOpen = false;
        state.gnStrokePopoverOpen = true;
        updateToolbarActiveState();
      });
    });

    // Événements du popover "Réglages Du Trait" (Continu / Tirets / Pointillés + Curseur conique + Reset)
    document.querySelectorAll('#gnStrokeLineStyleGrid .gn-line-style-card').forEach((card) => {
      card.addEventListener('click', () => {
        const ls = card.dataset.gnLinestyle;
        if (!ls) return;
        state.penLineStyle = ls;
        document.querySelectorAll('#penLineStylePills [data-line-style]').forEach((b) => {
          b.classList.toggle('active', b.dataset.lineStyle === ls);
        });
        syncGnPenSubBarUi();
      });
    });

    const gnStrokeSizeSlider = document.getElementById('gnStrokeSizeSlider');
    if (gnStrokeSizeSlider) {
      gnStrokeSizeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!Number.isFinite(val) || val <= 0) return;
        const toolKey = DEFAULT_TOOL_SIZE_SLOTS[state.tool] ? state.tool : 'pen';
        const slotIdx = (state.activeSizeSlotByTool && typeof state.activeSizeSlotByTool[toolKey] === 'number')
          ? state.activeSizeSlotByTool[toolKey]
          : 1;
        const mem = state.toolMemory && state.toolMemory[toolKey];
        if (mem && Array.isArray(mem.sizeSlots) && mem.sizeSlots.length === 3) {
          mem.sizeSlots[slotIdx] = val;
        }
        setToolSize(state.tool, val);
        if (dom.strokeSizeSlider) dom.strokeSizeSlider.value = String(val);
        if (dom.strokeSizeValue) dom.strokeSizeValue.textContent = `${val.toFixed(1)}px`;
        syncGnPenSubBarUi();
      });
    }

    const btnGnStrokeReset = document.getElementById('btnGnStrokeReset');
    if (btnGnStrokeReset) {
      btnGnStrokeReset.addEventListener('click', () => {
        const toolKey = DEFAULT_TOOL_SIZE_SLOTS[state.tool] ? state.tool : 'pen';
        const slotIdx = (state.activeSizeSlotByTool && typeof state.activeSizeSlotByTool[toolKey] === 'number')
          ? state.activeSizeSlotByTool[toolKey]
          : 1;
        const defVal = DEFAULT_TOOL_SIZE_SLOTS[toolKey][slotIdx] ?? 5;
        const mem = state.toolMemory && state.toolMemory[toolKey];
        if (mem && Array.isArray(mem.sizeSlots) && mem.sizeSlots.length === 3) {
          mem.sizeSlots[slotIdx] = defVal;
        }
        if (state.tool === 'pen') {
          state.penLineStyle = 'solid';
          document.querySelectorAll('#penLineStylePills [data-line-style]').forEach((b) => {
            b.classList.toggle('active', b.dataset.lineStyle === 'solid');
          });
        }
        setToolSize(state.tool, defVal);
        updateToolbarActiveState();
      });
    }

    initGnColorPopover();

    const addColorBtn = document.getElementById('gnSubAddColorBtn');
    if (addColorBtn) {
      addColorBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const activeToolKey = (state.toolMemory && state.toolMemory[state.tool]) ? state.tool : 'pen';
        openGnColorPopover({
          mode: 'add-slot',
          toolKey: activeToolKey,
          anchorEl: addColorBtn
        });
      });
    }

    const dockAddColorBtn = document.getElementById('dockAddColorBtn');
    if (dockAddColorBtn) {
      dockAddColorBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const activeToolKey = (state.toolMemory && state.toolMemory[state.tool]) ? state.tool : 'pen';
        openGnColorPopover({
          mode: state.tool === 'lasso' ? 'lasso' : 'add-slot',
          toolKey: activeToolKey,
          anchorEl: dockAddColorBtn
        });
      });
    }

    document.querySelectorAll('#gnPenTypeGrid .gn-pen-type-card').forEach((card) => {
      card.addEventListener('click', () => {
        const ps = card.dataset.gnPenstyle;
        if (!ps) return;
        state.penStyle = ps;
        state.tool = 'pen';
        updateToolbarActiveState();
      });
    });

    const tipSlider = document.getElementById('gnTipSharpnessSlider');
    if (tipSlider) {
      tipSlider.addEventListener('input', (e) => {
        state.tipSharpness = Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100));
        syncGnPenSubBarUi();
      });
    }
    const presSlider = document.getElementById('gnPressureSensSlider');
    if (presSlider) {
      presSlider.addEventListener('input', (e) => {
        state.pressureSensitivity = Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100));
        syncGnPenSubBarUi();
      });
    }
    const stabSlider = document.getElementById('gnStabilizationSlider');
    if (stabSlider) {
      stabSlider.addEventListener('input', (e) => {
        state.smoothing = Math.max(0, Math.min(1.0, parseInt(e.target.value, 10) / 100));
        try { localStorage.setItem('inkflow_smoothing_v1', String(state.smoothing)); } catch (_) {}
        if (dom.smoothingSlider) dom.smoothingSlider.value = String(state.smoothing);
        if (dom.smoothingValue) dom.smoothingValue.textContent = `${Math.round(state.smoothing * 100)}%`;
        syncGnPenSubBarUi();
      });
    }

    const holdSw = document.getElementById('gnHoldToShapeSwitch');
    if (holdSw) {
      holdSw.addEventListener('change', (e) => {
        state.autoShapeEnabled = e.target.checked;
        if (dom.autoShapeToggle) dom.autoShapeToggle.checked = state.autoShapeEnabled;
      });
    }

    const btnOpenGestures = document.getElementById('btnOpenStylusGestures');
    const btnBackPen = document.getElementById('btnBackToPenSettings');
    if (btnOpenGestures && gesturesView) {
      btnOpenGestures.addEventListener('click', () => {
        const willOpen = gesturesView.classList.contains('hidden');
        gesturesView.classList.toggle('hidden', !willOpen);
        btnOpenGestures.classList.toggle('active-nav', willOpen);
      });
    }
    if (btnBackPen && gesturesView) {
      btnBackPen.addEventListener('click', () => {
        gesturesView.classList.add('hidden');
        if (btnOpenGestures) btnOpenGestures.classList.remove('active-nav');
      });
    }

    const savePenGesturesPrefs = () => {
      try {
        localStorage.setItem('inkflow_pen_gestures_v1', JSON.stringify({
          scribbleToErase: Boolean(state.scribbleToErase),
          scribbleEraseShapesAndHl: Boolean(state.scribbleEraseShapesAndHl),
          circleToLasso: Boolean(state.circleToLasso)
        }));
      } catch (_) {}
    };
    const scribSw = document.getElementById('gnScribbleEraseSwitch');
    if (scribSw) scribSw.addEventListener('change', (e) => { state.scribbleToErase = e.target.checked; savePenGesturesPrefs(); });
    const scribShSw = document.getElementById('gnScribbleEraseShapesHlSwitch');
    if (scribShSw) scribShSw.addEventListener('change', (e) => { state.scribbleEraseShapesAndHl = e.target.checked; savePenGesturesPrefs(); });
    const lassoSw = document.getElementById('gnCircleLassoSwitch');
    if (lassoSw) lassoSw.addEventListener('change', (e) => { state.circleToLasso = e.target.checked; savePenGesturesPrefs(); });

    // Événements de la sous-barre flottante Formes GoodNotes (#gnShapeSubBar)
    const shapeBar = document.getElementById('gnShapeSubBar');
    if (shapeBar) {
      shapeBar.querySelectorAll('.gn-shape-btn[data-gn-shapetype]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const stype = btn.dataset.gnShapetype;
          if (!stype) return;
          if (state.tool !== 'shape') {
            syncCanonicalToToolMemory(state.tool);
            state.tool = 'shape';
            applyToolMemoryToCanonical('shape');
          }
          state.shapeType = stype;
          state.gnShapeStrokePopoverOpen = false;
          state.toolOptionsOpen = true;
          updateToolbarActiveState();
        });
      });

      const shapeThickBtn = document.getElementById('gnShapeThicknessBtn');
      if (shapeThickBtn) {
        shapeThickBtn.addEventListener('click', () => {
          state.gnShapeStrokePopoverOpen = !state.gnShapeStrokePopoverOpen;
          updateToolbarActiveState();
        });
      }

      const shapeAddColorBtn = document.getElementById('gnShapeAddColorBtn');
      if (shapeAddColorBtn) {
        shapeAddColorBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          state.gnShapeStrokePopoverOpen = false;
          if (state.tool !== 'shape') {
            syncCanonicalToToolMemory(state.tool);
            state.tool = 'shape';
            applyToolMemoryToCanonical('shape');
          }
          updateToolbarActiveState();
          openGnColorPopover({
            mode: 'add-slot',
            toolKey: 'shape',
            anchorEl: shapeAddColorBtn
          });
        });
      }

      // Popover "Réglages Du Trait" des formes (#gnShapeStrokePopover)
      document.querySelectorAll('#gnShapeLineStyleGrid .gn-line-style-card').forEach((card) => {
        card.addEventListener('click', () => {
          const ls = card.dataset.gnShapelinestyle;
          if (!ls) return;
          state.shapeLineStyle = ls;
          saveShapeStrokePrefsToStorage();
          syncGnPenSubBarUi();
        });
      });

      const shapeStrokeSlider = document.getElementById('gnShapeStrokeSizeSlider');
      if (shapeStrokeSlider) {
        shapeStrokeSlider.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          if (!Number.isFinite(val) || val <= 0) return;
          setToolSize('shape', val);
          if (dom.strokeSizeSlider && state.tool === 'shape') dom.strokeSizeSlider.value = String(val);
          if (dom.strokeSizeValue && state.tool === 'shape') dom.strokeSizeValue.textContent = `${val.toFixed(1)}px`;
          syncGnPenSubBarUi();
        });
      }

      const shapeStrokeResetBtn = document.getElementById('btnGnShapeStrokeReset');
      if (shapeStrokeResetBtn) {
        shapeStrokeResetBtn.addEventListener('click', () => {
          state.shapeLineStyle = 'solid';
          state.shapeRoundedCorners = true;
          state.shapeStartArrow = 'none';
          state.shapeEndArrow = 'none';
          setToolSize('shape', 4);
          saveShapeStrokePrefsToStorage();
          updateToolbarActiveState();
        });
      }

      const shapeRoundSw = document.getElementById('gnShapeRoundedCornersSwitch');
      if (shapeRoundSw) {
        shapeRoundSw.addEventListener('change', (e) => {
          state.shapeRoundedCorners = Boolean(e.target.checked);
          saveShapeStrokePrefsToStorage();
          syncGnPenSubBarUi();
        });
      }

      document.querySelectorAll('#gnShapeStartArrowCol .gn-arrowhead-opt, #gnShapeEndArrowCol .gn-arrowhead-opt').forEach((opt) => {
        opt.addEventListener('click', () => {
          const side = opt.dataset.arrowSide;
          const style = opt.dataset.arrowStyle || 'none';
          if (side === 'start') state.shapeStartArrow = style;
          else if (side === 'end') state.shapeEndArrow = style;
          saveShapeStrokePrefsToStorage();
          syncGnPenSubBarUi();
        });
      });
    }

    // Événements de la sous-barre flottante Gomme GoodNotes 6 (#gnEraserSubBar)
    const eraserBar = document.getElementById('gnEraserSubBar');
    if (eraserBar) {
      const modeBtn = document.getElementById('gnEraserModeBtn');
      if (modeBtn) {
        modeBtn.addEventListener('click', () => {
          state.gnEraserModePopoverOpen = !state.gnEraserModePopoverOpen;
          if (state.gnEraserModePopoverOpen) {
            state.gnEraserAdvPopoverOpen = false;
            state.gnEraserSizePopoverOpen = false;
          }
          updateToolbarActiveState();
        });
      }

      document.querySelectorAll('#gnEraserModePopover .gn-eraser-mode-option').forEach((opt) => {
        opt.addEventListener('click', () => {
          const mode = opt.dataset.gnErasermode;
          if (!mode) return;
          state.eraserMode = mode;
          state.gnEraserModePopoverOpen = false;
          saveEraserPrefsToStorage();
          updateToolbarActiveState();
        });
      });

      const advBtn = document.getElementById('gnEraserAdvBtn');
      if (advBtn) {
        advBtn.addEventListener('click', () => {
          state.gnEraserAdvPopoverOpen = !state.gnEraserAdvPopoverOpen;
          if (state.gnEraserAdvPopoverOpen) {
            state.gnEraserModePopoverOpen = false;
            state.gnEraserSizePopoverOpen = false;
          }
          updateToolbarActiveState();
        });
      }

      const bindEraserFilter = (elId, key) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.addEventListener('change', () => {
          if (!state.eraserFilters) state.eraserFilters = { pen: true, pencil: true, highlighter: true, tape: true };
          state.eraserHighlighterOnly = false;
          state.eraserFilters[key] = Boolean(el.checked);
          saveEraserPrefsToStorage();
          syncGnEraserSubBarUi();
        });
      };
      bindEraserFilter('gnEraserFilterPen', 'pen');
      bindEraserFilter('gnEraserFilterPencil', 'pencil');
      bindEraserFilter('gnEraserFilterHighlighter', 'highlighter');
      bindEraserFilter('gnEraserFilterTape', 'tape');

      const autoDeselSw = document.getElementById('gnEraserAutoDeselectSwitch');
      if (autoDeselSw) {
        autoDeselSw.addEventListener('change', () => {
          state.eraserAutoDeselect = Boolean(autoDeselSw.checked);
          const legacyChk = document.getElementById('eraserAutoDeselectToggle');
          if (legacyChk) legacyChk.checked = state.eraserAutoDeselect;
          saveEraserPrefsToStorage();
        });
      }

      const clearPageBtn = document.getElementById('btnGnEraserClearPage');
      if (clearPageBtn) {
        clearPageBtn.addEventListener('click', () => {
          const page = getActivePage();
          if (!page) return;
          pushHistorySnapshot();
          page.strokes = [];
          page.shapes = [];
          page.texts = [];
          page.tapes = [];
          page.images = [];
          state.gnEraserAdvPopoverOpen = false;
          invalidateStaticInkCache();
          renderWorldTextCards();
          updateToolbarActiveState();
          requestRender();
          scheduleSaveActivePage();
          showToast('Page effacée');
        });
      }

      // 3 boutons circulaires de taille de gomme : clic -> sélectionne l'emplacement + ouvre le curseur conique "Taille De La Gomme"
      eraserBar.querySelectorAll('.gn-eraser-size-btn').forEach((btn, idx) => {
        btn.addEventListener('click', () => {
          const slotIdx = Number.isInteger(parseInt(btn.dataset.gnEraserSlot, 10)) ? parseInt(btn.dataset.gnEraserSlot, 10) : idx;
          const prevSlot = state.activeSizeSlotByTool ? state.activeSizeSlotByTool.eraser : -1;
          const slots = getActiveToolSizeSlots('eraser');
          const sz = Number(slots[slotIdx] ?? parseFloat(btn.dataset.gnEraserSize) ?? 18);

          if (state.gnEraserSizePopoverOpen && prevSlot === slotIdx) {
            state.gnEraserSizePopoverOpen = false;
            updateToolbarActiveState();
            return;
          }
          if (state.activeSizeSlotByTool) state.activeSizeSlotByTool.eraser = slotIdx;
          if (Number.isFinite(sz) && sz > 0) setToolSize('eraser', sz);
          state.gnEraserModePopoverOpen = false;
          state.gnEraserAdvPopoverOpen = false;
          state.gnEraserSizePopoverOpen = true;
          updateToolbarActiveState();
        });
      });

      const eraserSizeSlider = document.getElementById('gnEraserSizeSlider');
      if (eraserSizeSlider) {
        eraserSizeSlider.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          if (!Number.isFinite(val) || val <= 0) return;
          const slotIdx = (state.activeSizeSlotByTool && typeof state.activeSizeSlotByTool.eraser === 'number')
            ? state.activeSizeSlotByTool.eraser
            : 1;
          const mem = state.toolMemory && state.toolMemory.eraser;
          if (mem && Array.isArray(mem.sizeSlots) && mem.sizeSlots.length === 3) {
            mem.sizeSlots[slotIdx] = val;
          }
          setToolSize('eraser', val);
          if (dom.strokeSizeSlider) dom.strokeSizeSlider.value = String(val);
          if (dom.strokeSizeValue) dom.strokeSizeValue.textContent = `${val.toFixed(1)}px`;
          syncGnEraserSubBarUi();
        });
      }

      const btnEraserSizeReset = document.getElementById('btnGnEraserSizeReset');
      if (btnEraserSizeReset) {
        btnEraserSizeReset.addEventListener('click', () => {
          const slotIdx = (state.activeSizeSlotByTool && typeof state.activeSizeSlotByTool.eraser === 'number')
            ? state.activeSizeSlotByTool.eraser
            : 1;
          const defVal = DEFAULT_TOOL_SIZE_SLOTS.eraser[slotIdx] ?? 18;
          const mem = state.toolMemory && state.toolMemory.eraser;
          if (mem && Array.isArray(mem.sizeSlots) && mem.sizeSlots.length === 3) {
            mem.sizeSlots[slotIdx] = defVal;
          }
          setToolSize('eraser', defVal);
          updateToolbarActiveState();
        });
      }
    }
  }

  // ============================================================================
  // SOUS-BARRE TEXTE GOODNOTES 6 & POPOVERS (REA DocumentLoaderRoute-PMJiTofc.js)
  // ============================================================================
  function positionGnTextPopover(popEl, anchorEl) {
    if (!popEl || !anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') return;
    const ar = anchorEl.getBoundingClientRect();
    const popW = popEl.offsetWidth || 288;
    const popH = popEl.offsetHeight || 220;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    let left = ar.left + ar.width * 0.5 - popW * 0.5;
    left = Math.max(10, Math.min(vw - popW - 10, left));
    let top = ar.bottom + 8;
    if (top + popH > vh - 12 && ar.top - popH - 8 > 10) {
      top = ar.top - popH - 8;
    }
    popEl.style.left = `${Math.round(left)}px`;
    popEl.style.top = `${Math.round(top)}px`;
  }

  function findMatchingTextBoxPresetIndex(fs) {
    if (!fs) return 0;
    const normBg = fs.backgroundColor ? String(fs.backgroundColor).toLowerCase() : null;
    const normBd = fs.borderColor ? String(fs.borderColor).toLowerCase() : null;
    return GN_TEXT_BOX_STYLE_PRESETS.findIndex((p) => {
      const pBg = p.backgroundColor ? p.backgroundColor.toLowerCase() : null;
      const pBd = p.borderColor ? p.borderColor.toLowerCase() : null;
      return pBg === normBg &&
        pBd === normBd &&
        Number(p.borderWidth || 0) === Number(fs.borderWidth || 0) &&
        Number(p.cornerRadius || 0) === Number(fs.cornerRadius || 0) &&
        Number(p.padding ?? 10) === Number(fs.padding ?? 10) &&
        Boolean(p.showShadow) === Boolean(fs.showShadow);
    });
  }

  function renderGnTextBoxStylePresetsGrid(activeFrameStyle) {
    const grid = document.getElementById('gnTextStylePresetsGrid');
    if (!grid) return;
    const selIdx = findMatchingTextBoxPresetIndex(activeFrameStyle);
    grid.innerHTML = '';
    GN_TEXT_BOX_STYLE_PRESETS.forEach((preset, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `gn-tb-preset-btn${selIdx === idx ? ' active' : ''}`;
      btn.title = idx === 0 ? 'Transparent (sans fond)' : `Préréglage ${idx}`;

      const tile = document.createElement('span');
      tile.className = 'gn-tb-preset-tile';
      if (idx === 0) {
        tile.style.background = 'linear-gradient(135deg, #ffffff 44%, #ef4444 47%, #ef4444 53%, #ffffff 56%)';
        tile.style.borderRadius = '6px';
        tile.style.border = '1.5px solid rgba(15, 23, 42, 0.22)';
      } else {
        tile.style.background = preset.backgroundColor || 'transparent';
        tile.style.borderRadius = `${preset.cornerRadius || 0}px`;
        tile.style.boxShadow = preset.showShadow
          ? '0px 3px 5px rgba(0,0,0,0.24), inset 0 0 0 1.5px rgba(15,23,42,0.16)'
          : 'inset 0 0 0 1.5px rgba(15,23,42,0.16)';
      }
      btn.appendChild(tile);

      if (selIdx === idx) {
        const chk = document.createElement('span');
        chk.className = 'gn-tb-preset-check';
        chk.innerHTML = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9.5" fill="rgba(64,59,59,0.42)"/><path d="M6.25 10l2.5 2.5 5-5" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btn.appendChild(chk);
      }

      btn.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        suppressNextTextBlur = true;
        setTimeout(() => { suppressNextTextBlur = false; }, 120);
      });
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const darkPreset = preset.backgroundColor && ['#373b44', '#4c5b7f'].includes(preset.backgroundColor.toLowerCase());
        applyTextPropertyToActiveOrDefault((tb) => {
          const nextFs = { ...preset };
          if (tb) {
            tb.frameStyle = nextFs;
            tb.style = nextFs.backgroundColor ? 'card' : 'transparent';
            if (darkPreset && (!tb.color || tb.color.toLowerCase() === '#000000' || tb.color.toLowerCase() === '#1e293b')) {
              tb.color = '#ffffff';
            } else if (!darkPreset && tb.color && tb.color.toLowerCase() === '#ffffff') {
              tb.color = '#000000';
            }
          } else {
            state.textFrameStyle = nextFs;
            if (darkPreset && state.textColor.toLowerCase() === '#000000') state.textColor = '#ffffff';
            else if (!darkPreset && state.textColor.toLowerCase() === '#ffffff') state.textColor = '#000000';
          }
        });
      });

      grid.appendChild(btn);
    });
  }

  function syncGnTextSubBarUi() {
    const activeTb = getActiveTextBox(getActivePage());
    const typo = getTextBoxEffectiveTypography(activeTb);
    const fs = typo.frameStyle;

    // Libellé police
    const fontLabelEl = document.getElementById('gnTextFontLabel');
    if (fontLabelEl) {
      let label = state.textFontLabel || 'Helvetica';
      const fontList = document.getElementById('gnTextFontList');
      if (fontList) {
        fontList.querySelectorAll('.gn-text-font-opt').forEach((opt) => {
          const isMatch = opt.dataset.gnFont === typo.fontFamily;
          opt.classList.toggle('active', isMatch);
          if (isMatch && opt.dataset.gnFontLabel) label = opt.dataset.gnFontLabel;
        });
      }
      fontLabelEl.textContent = label;
    }

    // Taille du texte
    const sizeInput = document.getElementById('gnTextSizeInput');
    if (sizeInput && document.activeElement !== sizeInput) {
      sizeInput.value = String(typo.fontSize);
    }
    const sizeChip = document.getElementById('gnTextSizeChip');
    if (sizeChip) sizeChip.textContent = `${typo.fontSize} pt`;
    const sizeSlider = document.getElementById('gnTextSizeSlider');
    if (sizeSlider) sizeSlider.value = String(Math.max(8, Math.min(120, typo.fontSize)));

    // Couleur du texte
    const colorSwatch = document.getElementById('gnTextColorSwatch');
    if (colorSwatch) colorSwatch.style.background = typo.color || '#000000';

    // B / I / U / S
    const toggleActive = (id, on) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('active', Boolean(on));
        el.setAttribute('aria-pressed', String(Boolean(on)));
      }
    };
    toggleActive('gnTextBoldBtn', typo.bold);
    toggleActive('gnTextItalicBtn', typo.italic);
    toggleActive('gnTextUnderlineBtn', typo.underline);
    toggleActive('gnTextStrikeBtn', typo.strike);

    // Popover triggers active state
    const setPopTrigger = (id, key) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', state.gnTextPopover === key);
    };
    setPopTrigger('gnTextFontBtn', 'font');
    setPopTrigger('gnTextSizeMenuBtn', 'size');
    setPopTrigger('gnTextAlignBtn', 'align');
    setPopTrigger('gnTextListBtn', 'list');
    setPopTrigger('gnTextBoxStyleBtn', 'style');

    // Alignement & Hauteur de ligne
    const alignGrid = document.getElementById('gnTextAlignGrid');
    if (alignGrid) {
      alignGrid.querySelectorAll('[data-gn-align]').forEach((b) => {
        b.classList.toggle('active', b.dataset.gnAlign === typo.textAlign);
      });
    }
    const lhAutoSw = document.getElementById('gnTextLineHeightAutoSwitch');
    if (lhAutoSw) lhAutoSw.checked = typo.lineHeightMode !== 'fixed';
    const lhControls = document.getElementById('gnTextLineHeightControls');
    if (lhControls) lhControls.classList.toggle('disabled', typo.lineHeightMode !== 'fixed');
    const lhChip = document.getElementById('gnTextLineHeightChip');
    if (lhChip) lhChip.textContent = `${typo.lineHeightFixed} pt`;
    const lhSlider = document.getElementById('gnTextLineHeightSlider');
    if (lhSlider) lhSlider.value = String(Math.max(12, Math.min(120, typo.lineHeightFixed)));

    // Style de liste
    const listGrid = document.getElementById('gnTextListGrid');
    if (listGrid) {
      listGrid.querySelectorAll('[data-gn-list]').forEach((b) => {
        b.classList.toggle('active', b.dataset.gnList === typo.listStyle);
      });
    }

    // Aperçu miniature bouton Style de zone
    const previewBox = document.getElementById('gnTextStylePreviewBox');
    if (previewBox) {
      previewBox.style.background = fs.backgroundColor || 'transparent';
      previewBox.style.borderColor = fs.borderColor || (fs.backgroundColor ? 'rgba(15,23,42,0.22)' : '');
      previewBox.style.borderRadius = `${Math.min(7, fs.cornerRadius || 4)}px`;
      previewBox.style.color = fs.backgroundColor && ['#373b44', '#4c5b7f', '#f65353'].includes(String(fs.backgroundColor).toLowerCase()) ? '#ffffff' : '';
    }

    // Onglets & champs du Popover Style de zone de texte
    const isAdv = state.gnTextStyleTab === 'advanced';
    const tabPre = document.getElementById('gnTextStyleTabPresets');
    const tabAdv = document.getElementById('gnTextStyleTabAdvanced');
    const viewPre = document.getElementById('gnTextStylePresetsView');
    const viewAdv = document.getElementById('gnTextStyleAdvancedView');
    if (tabPre) { tabPre.classList.toggle('active', !isAdv); tabPre.setAttribute('aria-selected', String(!isAdv)); }
    if (tabAdv) { tabAdv.classList.toggle('active', isAdv); tabAdv.setAttribute('aria-selected', String(isAdv)); }
    if (viewPre) viewPre.classList.toggle('hidden', isAdv);
    if (viewAdv) viewAdv.classList.toggle('hidden', !isAdv);

    renderGnTextBoxStylePresetsGrid(fs);

    const advBgBtn = document.getElementById('gnTextAdvBgBtn');
    if (advBgBtn) {
      advBgBtn.style.background = fs.backgroundColor || 'linear-gradient(135deg, #ffffff 45%, #ef4444 48%, #ef4444 52%, #ffffff 55%)';
    }
    const advBorderBtn = document.getElementById('gnTextAdvBorderBtn');
    if (advBorderBtn) {
      advBorderBtn.style.background = fs.borderColor || 'linear-gradient(135deg, #ffffff 45%, #ef4444 48%, #ef4444 52%, #ffffff 55%)';
    }
    const advRadiusVal = document.getElementById('gnTextAdvRadiusVal');
    if (advRadiusVal) advRadiusVal.textContent = `${fs.cornerRadius || 0} pt`;
    const advShadowSw = document.getElementById('gnTextAdvShadowSwitch');
    if (advShadowSw) advShadowSw.checked = Boolean(fs.showShadow);
    const advBorderWVal = document.getElementById('gnTextAdvBorderWidthVal');
    if (advBorderWVal) advBorderWVal.textContent = `${fs.borderWidth || 0} pt`;
    const advPadVal = document.getElementById('gnTextAdvPaddingVal');
    if (advPadVal) advPadVal.textContent = `${fs.padding ?? 10} pt`;
  }

  function bindGoodNotesTextSubBarEvents() {
    const keepFocusGuard = (el) => {
      if (!el) return;
      el.addEventListener('pointerdown', (ev) => {
        if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT')) {
          suppressNextTextBlur = true;
          setTimeout(() => { suppressNextTextBlur = false; }, 220);
          return;
        }
        ev.preventDefault();
        suppressNextTextBlur = true;
        setTimeout(() => { suppressNextTextBlur = false; }, 160);
      });
    };

    const subBar = document.getElementById('gnTextSubBar');
    keepFocusGuard(subBar);
    ['gnTextFontPopover', 'gnTextSizePopover', 'gnTextAlignPopover', 'gnTextListPopover', 'gnTextBoxStylePopover', 'textEditFloatingBar'].forEach((id) => {
      keepFocusGuard(document.getElementById(id));
    });

    const toggleTextPopover = (key, anchorEl) => {
      const next = state.gnTextPopover === key ? null : key;
      state.gnTextPopover = next;
      updateToolbarActiveState();
      if (next) {
        const map = { font: 'gnTextFontPopover', size: 'gnTextSizePopover', align: 'gnTextAlignPopover', list: 'gnTextListPopover', style: 'gnTextBoxStylePopover' };
        const pop = document.getElementById(map[next]);
        if (pop && anchorEl) positionGnTextPopover(pop, anchorEl);
      }
    };

    const setFontSizeVal = (nextVal) => {
      const clamped = Math.max(1, Math.min(200, Math.round(nextVal)));
      applyTextPropertyToActiveOrDefault((tb) => {
        if (tb) tb.fontSize = clamped;
        else state.textFontSize = clamped;
      });
    };

    const fontBtn = document.getElementById('gnTextFontBtn');
    if (fontBtn) fontBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTextPopover('font', fontBtn); });

    const fontList = document.getElementById('gnTextFontList');
    if (fontList) {
      fontList.querySelectorAll('.gn-text-font-opt').forEach((opt) => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const fam = opt.dataset.gnFont;
          const lbl = opt.dataset.gnFontLabel || 'Helvetica';
          state.textFontFamily = fam;
          state.textFontLabel = lbl;
          applyTextPropertyToActiveOrDefault((tb) => {
            if (tb) tb.fontFamily = fam;
          });
          state.gnTextPopover = null;
          updateToolbarActiveState();
        });
      });
    }

    const sizeDec = document.getElementById('gnTextSizeDecBtn');
    const sizeInc = document.getElementById('gnTextSizeIncBtn');
    const sizeInput = document.getElementById('gnTextSizeInput');
    const sizeMenuBtn = document.getElementById('gnTextSizeMenuBtn');
    const sizeSlider = document.getElementById('gnTextSizeSlider');
    const sizePopDec = document.getElementById('gnTextSizePopDec');
    const sizePopInc = document.getElementById('gnTextSizePopInc');

    if (sizeDec) sizeDec.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = getTextBoxEffectiveTypography(getActiveTextBox(getActivePage())).fontSize;
      setFontSizeVal(cur - 1);
    });
    if (sizeInc) sizeInc.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = getTextBoxEffectiveTypography(getActiveTextBox(getActivePage())).fontSize;
      setFontSizeVal(cur + 1);
    });
    if (sizePopDec) sizePopDec.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = getTextBoxEffectiveTypography(getActiveTextBox(getActivePage())).fontSize;
      setFontSizeVal(cur - 1);
    });
    if (sizePopInc) sizePopInc.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = getTextBoxEffectiveTypography(getActiveTextBox(getActivePage())).fontSize;
      setFontSizeVal(cur + 1);
    });
    if (sizeInput) {
      sizeInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          const n = parseInt(sizeInput.value, 10);
          if (Number.isFinite(n)) setFontSizeVal(n);
          sizeInput.blur();
        }
      });
      sizeInput.addEventListener('change', () => {
        const n = parseInt(sizeInput.value, 10);
        if (Number.isFinite(n)) setFontSizeVal(n);
        else syncGnTextSubBarUi();
      });
    }
    if (sizeSlider) {
      sizeSlider.addEventListener('input', () => {
        const n = parseInt(sizeSlider.value, 10);
        if (Number.isFinite(n)) setFontSizeVal(n);
      });
    }
    if (sizeMenuBtn) sizeMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTextPopover('size', sizeMenuBtn); });

    const colorBtn = document.getElementById('gnTextColorBtn');
    if (colorBtn) {
      colorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.gnTextPopover = null;
        updateToolbarActiveState();
        const activeTb = getActiveTextBox(getActivePage());
        openGnColorPopover({
          mode: activeTb ? 'text-card' : 'text-default',
          toolKey: 'text',
          scopeKey: 'text',
          textCardId: activeTb ? activeTb.id : null,
          anchorEl: colorBtn,
          initialColor: (activeTb && activeTb.color) || state.textColor || '#000000'
        });
      });
    }

    const bindFmtToggle = (id, prop, stateKey) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyTextPropertyToActiveOrDefault((tb) => {
          if (tb) tb[prop] = !tb[prop];
          else state[stateKey] = !state[stateKey];
        });
      });
    };
    bindFmtToggle('gnTextBoldBtn', 'bold', 'textBold');
    bindFmtToggle('gnTextItalicBtn', 'italic', 'textItalic');
    bindFmtToggle('gnTextUnderlineBtn', 'underline', 'textUnderline');
    bindFmtToggle('gnTextStrikeBtn', 'strike', 'textStrike');

    const alignBtn = document.getElementById('gnTextAlignBtn');
    if (alignBtn) alignBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTextPopover('align', alignBtn); });

    const alignGrid = document.getElementById('gnTextAlignGrid');
    if (alignGrid) {
      alignGrid.querySelectorAll('[data-gn-align]').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const al = b.dataset.gnAlign;
          applyTextPropertyToActiveOrDefault((tb) => {
            if (tb) tb.textAlign = al;
            else state.textAlign = al;
          });
        });
      });
    }

    const lhAutoSw = document.getElementById('gnTextLineHeightAutoSwitch');
    const lhSlider = document.getElementById('gnTextLineHeightSlider');
    const lhDec = document.getElementById('gnTextLineHeightDec');
    const lhInc = document.getElementById('gnTextLineHeightInc');
    const setFixedLineHeight = (val) => {
      const clamped = Math.max(12, Math.min(200, Math.round(val)));
      applyTextPropertyToActiveOrDefault((tb) => {
        if (tb) { tb.lineHeightMode = 'fixed'; tb.lineHeightFixed = clamped; }
        else { state.textLineHeightMode = 'fixed'; state.textLineHeightFixed = clamped; }
      });
    };
    if (lhAutoSw) {
      lhAutoSw.addEventListener('change', () => {
        const mode = lhAutoSw.checked ? 'automatic' : 'fixed';
        applyTextPropertyToActiveOrDefault((tb) => {
          if (tb) tb.lineHeightMode = mode;
          else state.textLineHeightMode = mode;
        });
      });
    }
    if (lhSlider) lhSlider.addEventListener('input', () => setFixedLineHeight(parseInt(lhSlider.value, 10) || 32));
    if (lhDec) lhDec.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = getTextBoxEffectiveTypography(getActiveTextBox(getActivePage())).lineHeightFixed;
      setFixedLineHeight(cur - 2);
    });
    if (lhInc) lhInc.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = getTextBoxEffectiveTypography(getActiveTextBox(getActivePage())).lineHeightFixed;
      setFixedLineHeight(cur + 2);
    });

    const listBtn = document.getElementById('gnTextListBtn');
    if (listBtn) listBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTextPopover('list', listBtn); });

    const listGrid = document.getElementById('gnTextListGrid');
    if (listGrid) {
      listGrid.querySelectorAll('[data-gn-list]').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const ls = b.dataset.gnList || 'none';
          applyTextPropertyToActiveOrDefault((tb) => {
            if (tb) {
              tb.listStyle = ls;
              tb.text = formatTextForListStyle(tb.text, ls);
            } else {
              state.textListStyle = ls;
            }
          }, { syncTextValue: true });
          state.gnTextPopover = null;
          updateToolbarActiveState();
        });
      });
    }

    const styleBtn = document.getElementById('gnTextBoxStyleBtn');
    if (styleBtn) styleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleTextPopover('style', styleBtn); });

    const tabPre = document.getElementById('gnTextStyleTabPresets');
    const tabAdv = document.getElementById('gnTextStyleTabAdvanced');
    if (tabPre) tabPre.addEventListener('click', (e) => { e.stopPropagation(); state.gnTextStyleTab = 'presets'; syncGnTextSubBarUi(); });
    if (tabAdv) tabAdv.addEventListener('click', (e) => { e.stopPropagation(); state.gnTextStyleTab = 'advanced'; syncGnTextSubBarUi(); });

    const advBgBtn = document.getElementById('gnTextAdvBgBtn');
    if (advBgBtn) {
      advBgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const typo = getTextBoxEffectiveTypography(getActiveTextBox(getActivePage()));
        openGnColorPopover({
          mode: 'text-box-bg',
          toolKey: 'text',
          scopeKey: 'text-box-bg',
          anchorEl: advBgBtn,
          initialColor: typo.frameStyle.backgroundColor || '#ffffff'
        });
      });
    }
    const advBgClear = document.getElementById('gnTextAdvBgClear');
    if (advBgClear) {
      advBgClear.addEventListener('click', (e) => {
        e.stopPropagation();
        applyTextPropertyToActiveOrDefault((tb) => {
          if (tb) tb.frameStyle = { ...resolveTextBoxFrameStyle(tb), backgroundColor: null };
          else state.textFrameStyle = { ...state.textFrameStyle, backgroundColor: null };
        });
      });
    }
    const advBorderBtn = document.getElementById('gnTextAdvBorderBtn');
    if (advBorderBtn) {
      advBorderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const typo = getTextBoxEffectiveTypography(getActiveTextBox(getActivePage()));
        openGnColorPopover({
          mode: 'text-box-border',
          toolKey: 'text',
          scopeKey: 'text-box-border',
          anchorEl: advBorderBtn,
          initialColor: typo.frameStyle.borderColor || '#0072ce'
        });
      });
    }
    const advBorderClear = document.getElementById('gnTextAdvBorderClear');
    if (advBorderClear) {
      advBorderClear.addEventListener('click', (e) => {
        e.stopPropagation();
        applyTextPropertyToActiveOrDefault((tb) => {
          if (tb) tb.frameStyle = { ...resolveTextBoxFrameStyle(tb), borderColor: null, borderWidth: 0 };
          else state.textFrameStyle = { ...state.textFrameStyle, borderColor: null, borderWidth: 0 };
        });
      });
    }

    const stepFrameNum = (field, delta) => {
      applyTextPropertyToActiveOrDefault((tb) => {
        const curFs = tb ? resolveTextBoxFrameStyle(tb) : { ...state.textFrameStyle };
        const nextVal = Math.max(0, Math.min(20, (Number(curFs[field]) || 0) + delta));
        const nextFs = { ...curFs, [field]: nextVal };
        if (field === 'borderWidth' && nextVal > 0 && !nextFs.borderColor) {
          nextFs.borderColor = '#cbd5e1';
        }
        if (tb) tb.frameStyle = nextFs;
        else state.textFrameStyle = nextFs;
      });
    };
    const bindStep = (id, field, delta) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', (e) => { e.stopPropagation(); stepFrameNum(field, delta); });
    };
    bindStep('gnTextAdvRadiusDec', 'cornerRadius', -1);
    bindStep('gnTextAdvRadiusInc', 'cornerRadius', 1);
    bindStep('gnTextAdvBorderWidthDec', 'borderWidth', -1);
    bindStep('gnTextAdvBorderWidthInc', 'borderWidth', 1);
    bindStep('gnTextAdvPaddingDec', 'padding', -1);
    bindStep('gnTextAdvPaddingInc', 'padding', 1);

    const advShadowSw = document.getElementById('gnTextAdvShadowSwitch');
    if (advShadowSw) {
      advShadowSw.addEventListener('change', () => {
        applyTextPropertyToActiveOrDefault((tb) => {
          const curFs = tb ? resolveTextBoxFrameStyle(tb) : { ...state.textFrameStyle };
          const nextFs = { ...curFs, showShadow: Boolean(advShadowSw.checked) };
          if (tb) tb.frameStyle = nextFs;
          else state.textFrameStyle = nextFs;
        });
      });
    }

    const saveDefBtn = document.getElementById('btnGnTextSaveDefault');
    if (saveDefBtn) {
      saveDefBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const typo = getTextBoxEffectiveTypography(getActiveTextBox(getActivePage()));
        state.textFontFamily = typo.fontFamily;
        state.textFontSize = typo.fontSize;
        state.textColor = typo.color;
        state.textBold = typo.bold;
        state.textItalic = typo.italic;
        state.textUnderline = typo.underline;
        state.textStrike = typo.strike;
        state.textAlign = typo.textAlign;
        state.textLineHeightMode = typo.lineHeightMode;
        state.textLineHeightFixed = typo.lineHeightFixed;
        state.textListStyle = typo.listStyle;
        state.textFrameStyle = { ...typo.frameStyle };
        saveTextToolPrefs();
        showToast('Style de texte enregistré par défaut');
      });
    }

    const latexBtn = document.getElementById('gnTextLatexBtn');
    if (latexBtn) {
      latexBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const activeTb = getActiveTextBox(getActivePage());
        if (activeTb) {
          openLatexModalForCard(activeTb);
        } else {
          const vpRect = dom.canvasViewport ? dom.canvasViewport.getBoundingClientRect() : { width: 900, height: 600 };
          const centerW = screenToWorld(vpRect.width * 0.5, vpRect.height * 0.42);
          const card = createInteractiveTextCardAt(centerW.x - 160, centerW.y - 24, '', true, false);
          if (card) openLatexModalForCard(card);
        }
      });
    }

    // Barre contextuelle flottante au-dessus de la zone de texte (#textEditFloatingBar)
    const btnEditType = document.getElementById('btnTextEditType');
    if (btnEditType) {
      btnEditType.addEventListener('click', (e) => {
        e.stopPropagation();
        const page = getActivePage();
        const tb = getActiveTextBox(page);
        if (!tb) return;
        if (state.editingTextId === tb.id) {
          clearSelectedTextBox(true);
        } else {
          const cardEl = dom.worldObjectsLayer ? dom.worldObjectsLayer.querySelector(`[data-text-id="${tb.id}"]`) : null;
          if (cardEl) enterCardKeyboardEditMode(cardEl, tb, page);
        }
      });
    }
    const btnEditStyle = document.getElementById('btnTextEditStyle');
    if (btnEditStyle) {
      btnEditStyle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTextPopover('style', btnEditStyle);
      });
    }
    const btnEditLatex = document.getElementById('btnTextEditLatex');
    if (btnEditLatex) {
      btnEditLatex.addEventListener('click', (e) => {
        e.stopPropagation();
        const tb = getActiveTextBox(getActivePage());
        if (tb) openLatexModalForCard(tb);
      });
    }
    const btnEditDup = document.getElementById('btnTextEditDup');
    if (btnEditDup) {
      btnEditDup.addEventListener('click', (e) => {
        e.stopPropagation();
        const page = getActivePage();
        const tb = getActiveTextBox(page);
        if (!page || !tb) return;
        pushHistorySnapshot(page);
        const dup = {
          ...tb,
          id: createUid('tx'),
          x: Math.round(tb.x + 26),
          y: Math.round(tb.y + 26),
          frameStyle: tb.frameStyle ? { ...tb.frameStyle } : undefined
        };
        page.texts.push(dup);
        state.selectedTextId = dup.id;
        state.editingTextId = null;
        renderWorldTextCards();
        scheduleSaveActivePage(page);
        showToast('Zone de texte dupliquée');
      });
    }
    const btnEditDel = document.getElementById('btnTextEditDel');
    if (btnEditDel) {
      btnEditDel.addEventListener('click', (e) => {
        e.stopPropagation();
        const page = getActivePage();
        const tb = getActiveTextBox(page);
        if (!page || !tb) return;
        pushHistorySnapshot(page);
        activeTextEditorCommitFn = null;
        page.texts = (page.texts || []).filter((x) => x.id !== tb.id);
        state.selectedTextId = null;
        state.editingTextId = null;
        state.gnTextPopover = null;
        renderWorldTextCards();
        requestRender();
        scheduleSaveActivePage(page);
      });
    }

    // Fermeture des popovers Texte au clic extérieur
    document.addEventListener('pointerdown', (e) => {
      if (!state.gnTextPopover) return;
      if (e.target && typeof e.target.closest === 'function' && (
        e.target.closest('.gn-text-popover') ||
        e.target.closest('.gn-text-subbar') ||
        e.target.closest('.text-edit-bar') ||
        e.target.closest('#gnColorPopover')
      )) {
        return;
      }
      state.gnTextPopover = null;
      updateToolbarActiveState();
    });
  }

  // ============================================================================
  // SOUS-BARRE LASSO ENRICHIE (Libre/Rect | Filtres | Alignement | Capture PNG)
  // ============================================================================
  function syncGnLassoSubBarUi() {
    const bar = document.getElementById('gnLassoSubBar');
    if (!bar) return;
    const mode = state.lassoMode === 'rect' ? 'rect' : 'freehand';
    const btnFree = document.getElementById('gnLassoModeFreehand');
    const btnRect = document.getElementById('gnLassoModeRect');
    if (btnFree) btnFree.classList.toggle('active', mode === 'freehand');
    if (btnRect) btnRect.classList.toggle('active', mode === 'rect');

    const filters = state.lassoFilters || { handwriting: true, shapes: true, texts: true, images: true };
    const fHw = document.getElementById('gnLassoFilterHandwriting');
    const fSh = document.getElementById('gnLassoFilterShapes');
    const fTx = document.getElementById('gnLassoFilterTexts');
    const fIm = document.getElementById('gnLassoFilterImages');
    if (fHw) fHw.checked = filters.handwriting !== false;
    if (fSh) fSh.checked = filters.shapes !== false;
    if (fTx) fTx.checked = filters.texts !== false;
    if (fIm) fIm.checked = filters.images !== false;

    const enabledCount = [filters.handwriting, filters.shapes, filters.texts, filters.images].filter((v) => v !== false).length;
    const filterBadge = document.getElementById('gnLassoFilterBadge');
    if (filterBadge) {
      filterBadge.textContent = `${enabledCount}/4`;
      filterBadge.classList.toggle('hidden', enabledCount === 4);
    }
    const filterBtn = document.getElementById('gnLassoFilterBtn');
    if (filterBtn) {
      filterBtn.classList.toggle('active', Boolean(state.gnLassoFilterPopoverOpen || enabledCount < 4));
      filterBtn.setAttribute('aria-expanded', String(Boolean(state.gnLassoFilterPopoverOpen)));
    }

    const total =
      state.selectedIds.strokes.size +
      state.selectedIds.shapes.size +
      state.selectedIds.texts.size +
      (state.selectedIds.images ? state.selectedIds.images.size : 0) +
      (state.lassoPdfClip ? 1 : 0);
    const hasSel = total > 0;
    const isPdfZoneOnly = Boolean(state.lassoPdfClip) && total === 1;
    const hasStrokes = state.selectedIds.strokes.size > 0;
    const countPill = document.getElementById('gnLassoCountPill');
    if (countPill) {
      countPill.textContent = hasSel ? (isPdfZoneOnly ? 'Zone PDF' : `${total} sélectionné${total > 1 ? 's' : ''}`) : 'Entourez des éléments';
      countPill.classList.toggle('has-sel', hasSel);
    }

    const setDisabled = (id, dis) => {
      const el = document.getElementById(id);
      if (el) el.disabled = Boolean(dis);
    };
    setDisabled('btnGnLassoColor', !hasSel);
    setDisabled('btnGnLassoAlign', !hasStrokes);
    setDisabled('btnGnLassoScreenshot', !hasSel);
    setDisabled('btnGnLassoSaveElement', !hasSel);
    setDisabled('btnGnLassoDup', !hasSel);
    setDisabled('btnGnLassoRecog', !hasSel);
    setDisabled('btnGnLassoDel', !hasSel);

    const alignBtn = document.getElementById('btnGnLassoAlign');
    if (alignBtn) alignBtn.classList.toggle('active', Boolean(state.gnLassoAlignPopoverOpen));

    const colorDot = document.getElementById('gnLassoSubColorDot');
    if (colorDot) colorDot.style.background = state.penColor || '#007aff';

    positionSubBarPopoverUnderAnchor(filterBtn, 'gnLassoFilterPopover', 'gnLassoFilterCaret', state.gnLassoFilterPopoverOpen);
    positionSubBarPopoverUnderAnchor(alignBtn, 'gnLassoAlignPopover', 'gnLassoAlignCaret', state.gnLassoAlignPopoverOpen);
  }

  function bindGoodNotesLassoSubBarEvents() {
    const btnFree = document.getElementById('gnLassoModeFreehand');
    const btnRect = document.getElementById('gnLassoModeRect');
    if (btnFree) {
      btnFree.addEventListener('click', (e) => {
        e.stopPropagation();
        state.lassoMode = 'freehand';
        saveLassoPrefs();
        syncGnLassoSubBarUi();
      });
    }
    if (btnRect) {
      btnRect.addEventListener('click', (e) => {
        e.stopPropagation();
        state.lassoMode = 'rect';
        saveLassoPrefs();
        syncGnLassoSubBarUi();
      });
    }

    const filterBtn = document.getElementById('gnLassoFilterBtn');
    if (filterBtn) {
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.gnLassoAlignPopoverOpen = false;
        state.gnLassoFilterPopoverOpen = !state.gnLassoFilterPopoverOpen;
        updateToolbarActiveState();
      });
    }

    const bindFilterSwitch = (id, key) => {
      const sw = document.getElementById(id);
      if (!sw) return;
      sw.addEventListener('change', () => {
        if (!state.lassoFilters) state.lassoFilters = { handwriting: true, shapes: true, texts: true, images: true };
        state.lassoFilters[key] = Boolean(sw.checked);
        saveLassoPrefs();
        syncGnLassoSubBarUi();
      });
    };
    bindFilterSwitch('gnLassoFilterHandwriting', 'handwriting');
    bindFilterSwitch('gnLassoFilterShapes', 'shapes');
    bindFilterSwitch('gnLassoFilterTexts', 'texts');
    bindFilterSwitch('gnLassoFilterImages', 'images');

    const btnColor = document.getElementById('btnGnLassoColor');
    if (btnColor) {
      btnColor.addEventListener('click', (e) => {
        e.stopPropagation();
        state.gnLassoFilterPopoverOpen = false;
        state.gnLassoAlignPopoverOpen = false;
        updateToolbarActiveState();
        openGnColorPopover({
          mode: 'lasso',
          toolKey: 'pen',
          scopeKey: 'lasso',
          anchorEl: btnColor,
          initialColor: state.penColor || '#007aff'
        });
      });
    }

    const btnAlign = document.getElementById('btnGnLassoAlign');
    if (btnAlign) {
      btnAlign.addEventListener('click', (e) => {
        e.stopPropagation();
        state.gnLassoFilterPopoverOpen = false;
        state.gnLassoAlignPopoverOpen = !state.gnLassoAlignPopoverOpen;
        updateToolbarActiveState();
      });
    }

    document.querySelectorAll('[data-gn-hwalign]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        alignLassoHandwriting(btn.dataset.gnHwalign || 'left');
        state.gnLassoAlignPopoverOpen = false;
        updateToolbarActiveState();
      });
    });

    const btnStraighten = document.getElementById('btnGnLassoStraighten');
    if (btnStraighten) {
      btnStraighten.addEventListener('click', (e) => {
        e.stopPropagation();
        straightenLassoSelection();
        state.gnLassoAlignPopoverOpen = false;
        updateToolbarActiveState();
      });
    }

    const btnShot = document.getElementById('btnGnLassoScreenshot');
    if (btnShot) btnShot.addEventListener('click', (e) => { e.stopPropagation(); captureLassoSelectionScreenshot(); });

    const btnQuickShot = document.getElementById('btnQuickScreenshotLasso');
    if (btnQuickShot) btnQuickShot.addEventListener('click', (e) => { e.stopPropagation(); captureLassoSelectionScreenshot(); });

    const btnQuickCopy = document.getElementById('btnQuickCopyLasso');
    if (btnQuickCopy) btnQuickCopy.addEventListener('click', (e) => { e.stopPropagation(); copyLassoSelection(); });

    const btnQuickStraighten = document.getElementById('btnQuickStraightenLasso');
    if (btnQuickStraighten) btnQuickStraighten.addEventListener('click', (e) => { e.stopPropagation(); straightenLassoSelection(); });

    const btnSaveEl = document.getElementById('btnGnLassoSaveElement');
    if (btnSaveEl) btnSaveEl.addEventListener('click', (e) => { e.stopPropagation(); if (typeof saveLassoSelectionAsElement === 'function') saveLassoSelectionAsElement(); });

    const btnDup = document.getElementById('btnGnLassoDup');
    if (btnDup) btnDup.addEventListener('click', (e) => { e.stopPropagation(); duplicateLassoSelection(); });

    const btnRecog = document.getElementById('btnGnLassoRecog');
    if (btnRecog) btnRecog.addEventListener('click', (e) => { e.stopPropagation(); openRecognitionModal(); });

    const btnDel = document.getElementById('btnGnLassoDel');
    if (btnDel) btnDel.addEventListener('click', (e) => { e.stopPropagation(); deleteLassoSelection(); });

    document.addEventListener('pointerdown', (e) => {
      if (!state.gnLassoFilterPopoverOpen && !state.gnLassoAlignPopoverOpen) return;
      if (e.target && typeof e.target.closest === 'function' && (
        e.target.closest('.gn-lasso-popover') ||
        e.target.closest('.gn-lasso-subbar')
      )) {
        return;
      }
      state.gnLassoFilterPopoverOpen = false;
      state.gnLassoAlignPopoverOpen = false;
      updateToolbarActiveState();
    });

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', () => {
        if (state.gnLassoFilterPopoverOpen || state.gnLassoAlignPopoverOpen) {
          syncGnLassoSubBarUi();
        }
      });
    }
  }

  function bindEvents() {
    bindGoodNotesPenSubBarEvents();
    bindGoodNotesTextSubBarEvents();
    bindGoodNotesLassoSubBarEvents();
    bindSplitViewEvents();
    dom.inkCanvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
    dom.inkCanvas.addEventListener('pointermove', handlePointerMove, { passive: false });
    dom.inkCanvas.addEventListener('pointerup', handlePointerUpOrCancel);
    dom.inkCanvas.addEventListener('pointercancel', handlePointerUpOrCancel);
    dom.inkCanvas.addEventListener('pointerleave', () => {
      dom.eraserCursor.style.display = 'none';
      if (dom.colorDotCursor) dom.colorDotCursor.style.display = 'none';
      if (state.shapeHoverConnection) {
        state.shapeHoverConnection = null;
        renderActiveCanvasOnly();
      }
    });
    dom.inkCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.inkCanvas.addEventListener('auxclick', (e) => e.preventDefault());
    dom.inkCanvas.addEventListener('selectstart', (e) => e.preventDefault());
    if (dom.canvasViewport) {
      dom.canvasViewport.addEventListener('contextmenu', (e) => e.preventDefault());
      dom.canvasViewport.addEventListener('auxclick', (e) => e.preventDefault());
      dom.canvasViewport.addEventListener('selectstart', (e) => {
        if (!e.target.closest || !e.target.closest('.world-text-card')) e.preventDefault();
      });
    }

    // Prévention de l'interception tactile navigateur + support Pinch-to-Zoom natif
    dom.inkCanvas.addEventListener('touchstart', (e) => {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    dom.inkCanvas.addEventListener('touchmove', (e) => {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    dom.inkCanvas.addEventListener('touchend', (e) => {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    // Double-clic sur la page infinie -> crée immédiatement un emplacement de texte clavier à cet endroit !
    dom.inkCanvas.addEventListener('dblclick', (e) => {
      // Uniquement avec l'outil Texte : un double appui au stylo (point d'un i, ponctuation) ne doit pas créer de zone de texte
      if (state.tool !== 'text') return;
      const wPt = screenToWorld(e.clientX, e.clientY);
      createInteractiveTextCardAt(wPt.x, wPt.y, '', false, true);
    });

    // Zoom pincement pavé tactile (Ctrl + wheel) et déplacement 2 doigts (wheel)
    dom.canvasViewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      stopViewportAnimations();
      const rect = dom.inkCanvas.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        resetPullToAddState();
        zoomAtScreenPoint(state.zoom * Math.exp(-e.deltaY * 0.0055), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        const dx = Math.max(-128, Math.min(128, e.deltaX || 0));
        const dy = Math.max(-128, Math.min(128, e.deltaY || 0));
        const page = getActivePage();
        if (isBoundedPage(page)) {
          const limits = getBoundedVerticalScrollLimits(state.zoom, page);
          const pages = getActiveNotebookPages();
          const curIdx = pages.findIndex((p) => p.id === state.activePageId);
          const pta = state.pullToAdd;
          let handledPull = false;

          if (limits && !pta.isCommitting) {
            if (pta.active && pta.source === 'wheel') {
              const deltaTowardPull = pta.direction === 'bottom' ? dy : -dy;
              const nextExcess = pta.rawExcess + (deltaTowardPull >= 0 ? deltaTowardPull * 0.65 : deltaTowardPull * 0.9);
              if (nextExcess <= 0) {
                resetPullToAddState();
                const clampedWheel = clampViewportPan(state.panX - dx, (pta.direction === 'bottom' ? limits.minPanY : limits.maxPanY) - dy, state.zoom, page);
                state.panX = clampedWheel.panX;
                state.panY = clampedWheel.panY;
              } else {
                const rawY = pta.direction === 'bottom' ? (limits.minPanY - nextExcess) : (limits.maxPanY + nextExcess);
                applyBoundedPanWithPullToAdd(state.panX - dx, rawY, 'wheel');
                handledPull = true;
              }
            } else if (dy > 0 && (state.panY - dy) < limits.minPanY - 0.5) {
              const overshoot = state.panY <= limits.minPanY + 1 ? dy * 0.65 : (limits.minPanY - (state.panY - dy));
              applyBoundedPanWithPullToAdd(state.panX - dx, limits.minPanY - overshoot, 'wheel');
              handledPull = true;
            }
          }

          if (handledPull) {
            if (pta.wheelTimer) clearTimeout(pta.wheelTimer);
            if (pta.percentage >= 1.35) {
              commitOrResetPullToAdd();
            } else {
              pta.wheelTimer = setTimeout(() => {
                pta.wheelTimer = null;
                commitOrResetPullToAdd();
              }, pta.percentage > 1.0 ? 180 : 320);
            }
          } else if (!pta.active) {
            const clampedWheel = clampViewportPan(state.panX - dx, state.panY - dy, state.zoom, page);
            state.panX = clampedWheel.panX;
            state.panY = clampedWheel.panY;
            syncActivePageFromStackViewport();
          }
        } else {
          const clampedWheel = clampViewportPan(state.panX - dx, state.panY - dy, state.zoom, page);
          state.panX = clampedWheel.panX;
          state.panY = clampedWheel.panY;
        }
        syncWorldLayerTransform();
        requestRender();
      }
    }, { passive: false });

    const toggleSb = () => {
      dom.leftSidebar.classList.toggle('collapsed');
    };
    dom.btnToggleSidebar.addEventListener('click', toggleSb);
    dom.btnCloseSidebar.addEventListener('click', toggleSb);

    dom.tabNotebooksBtn.addEventListener('click', () => {
      dom.tabNotebooksBtn.classList.add('active'); dom.tabPagesBtn.classList.remove('active');
      dom.tabNotebooksBtn.setAttribute('aria-selected', 'true'); dom.tabPagesBtn.setAttribute('aria-selected', 'false');
      dom.sectionNotebooks.classList.remove('hidden'); dom.sectionPages.classList.add('hidden');
    });
    dom.tabPagesBtn.addEventListener('click', () => {
      dom.tabPagesBtn.classList.add('active'); dom.tabNotebooksBtn.classList.remove('active');
      dom.tabPagesBtn.setAttribute('aria-selected', 'true'); dom.tabNotebooksBtn.setAttribute('aria-selected', 'false');
      dom.sectionPages.classList.remove('hidden'); dom.sectionNotebooks.classList.add('hidden');
      const curPage = getActivePage();
      if (curPage) {
        curPage.thumbnail = generatePageThumbnail(curPage);
        updateSingleSidebarThumbnailDom(curPage);
      }
    });

    // Cliquer sur un outil le sélectionne sans encombrer l'écran ; re-cliquer sur l'outil déjà actif (ou cliquer sur le bouton d'options dédié) ouvre/ferme ses options
    dom.toolBtns.forEach((b) => b.addEventListener('click', () => setActiveTool(b.dataset.tool, true)));

    if (dom.btnToggleToolOptions) {
      dom.btnToggleToolOptions.addEventListener('click', () => toggleToolOptionsPopover());
    }
    if (dom.btnCloseToolOptions) {
      dom.btnCloseToolOptions.addEventListener('click', () => toggleToolOptionsPopover(false));
    }

    // Boutons d'ajout rapide de Zone Texte et LaTeX
    if (dom.btnAddTextCardNow) {
      dom.btnAddTextCardNow.addEventListener('click', () => {
        toggleToolOptionsPopover(false);
        const vp = dom.canvasViewport.getBoundingClientRect();
        const center = screenToWorld(vp.left + vp.width * 0.38, vp.top + vp.height * 0.38);
        createInteractiveTextCardAt(center.x, center.y, '', false, true);
      });
    }
    if (dom.btnAddLatexCardNow) {
      dom.btnAddLatexCardNow.addEventListener('click', () => {
        toggleToolOptionsPopover(false);
        openLatexModalForCard(null, null);
      });
    }
    if (dom.btnOpenLatexModal) {
      dom.btnOpenLatexModal.addEventListener('click', () => {
        toggleToolOptionsPopover(false);
        openLatexModalForCard(null, null);
      });
    }

    // Éditeur LaTeX
    dom.inputLatexCode.addEventListener('input', () => {
      dom.latexLivePreview.innerHTML = renderLatexToHtml(dom.inputLatexCode.value, true);
    });
    dom.latexQuickSymbols.forEach((chip) => {
      chip.addEventListener('click', () => {
        const ins = chip.dataset.insert;
        const ta = dom.inputLatexCode;
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? ta.value.length;
        ta.value = ta.value.slice(0, start) + ins + ta.value.slice(end);
        dom.latexLivePreview.innerHTML = renderLatexToHtml(ta.value, true);
        ta.focus();
      });
    });
    dom.latexPresetTemplates.forEach((chip) => {
      chip.addEventListener('click', () => {
        dom.inputLatexCode.value = chip.dataset.template;
        dom.latexLivePreview.innerHTML = renderLatexToHtml(dom.inputLatexCode.value, true);
      });
    });
    dom.btnCloseLatexModal.addEventListener('click', closeLatexModal);
    dom.btnCancelLatexModal.addEventListener('click', closeLatexModal);
    dom.btnConfirmLatexModal.addEventListener('click', () => {
      const code = dom.inputLatexCode.value.trim();
      if (!code) { closeLatexModal(); return; }
      const page = getActivePage();
      if (page && state.editingLatexCardId) {
        const card = (page.texts || []).find((x) => x.id === state.editingLatexCardId);
        if (card) {
          pushHistorySnapshot();
          card.text = code;
          card.isLatex = true;
          card.style = 'latex';
          renderWorldTextCards();
          requestRender();
          scheduleSaveActivePage();
        }
      } else {
        const vp = dom.canvasViewport.getBoundingClientRect();
        const pos = state.pendingLatexWorldPos || screenToWorld(vp.left + vp.width * 0.35, vp.top + vp.height * 0.38);
        createInteractiveTextCardAt(pos.x, pos.y, code, true, false);
      }
      closeLatexModal();
      showToast('Équation LaTeX ajoutée sur la page !');
    });

    // Reconnaissance d'écriture et d'équations
    if (dom.btnOpenRecognition) {
      dom.btnOpenRecognition.addEventListener('click', openRecognitionModal);
    }
    if (dom.btnRecognizeSelection) {
      dom.btnRecognizeSelection.addEventListener('click', openRecognitionModal);
    }
    dom.btnCloseRecognitionModal.addEventListener('click', closeRecognitionModal);
    dom.inputRecognizedLatex.addEventListener('input', () => {
      dom.recogLatexPreview.innerHTML = renderLatexToHtml(dom.inputRecognizedLatex.value, true);
    });
    dom.btnCopyRecognizedLatex.addEventListener('click', () => {
      navigator.clipboard?.writeText(dom.inputRecognizedLatex.value);
      showToast('Code LaTeX copié dans le presse-papiers !');
    });
    dom.btnInsertRecognizedText.addEventListener('click', () => {
      const txt = dom.inputRecognizedText.value.trim();
      if (!txt) return;
      const b = computeStrokeBounds(state.lastRecognizedStrokes[0] || { points: [{ x: 140, y: 240 }] });
      createInteractiveTextCardAt(b.minX, b.maxY + 28, txt, false, false);
      closeRecognitionModal();
      showToast('Zone de texte ajoutée sous vos traits');
    });
    dom.btnReplaceWithText.addEventListener('click', () => {
      const page = getActivePage();
      const txt = dom.inputRecognizedText.value.trim();
      if (!page || !txt) return;
      pushHistorySnapshot();
      const idsToRemove = new Set(state.lastRecognizedStrokes.map((s) => s.id));
      let minX = 140, minY = 220;
      if (state.lastRecognizedStrokes.length > 0) {
        const b = recognizeHandwritingAndMath(state.lastRecognizedStrokes).bounds;
        minX = b.minX; minY = b.minY;
      }
      page.strokes = (page.strokes || []).filter((s) => !idsToRemove.has(s.id));
      invalidateStaticInkCache();
      clearLassoSelection();
      createInteractiveTextCardAt(minX, minY, txt, false, false);
      closeRecognitionModal();
      showToast('Traits convertis en emplacement de texte !');
    });
    dom.btnReplaceWithLatex.addEventListener('click', () => {
      const page = getActivePage();
      const ltx = dom.inputRecognizedLatex.value.trim();
      if (!page || !ltx) return;
      pushHistorySnapshot();
      const idsToRemove = new Set(state.lastRecognizedStrokes.map((s) => s.id));
      let minX = 140, minY = 220;
      if (state.lastRecognizedStrokes.length > 0) {
        const b = recognizeHandwritingAndMath(state.lastRecognizedStrokes).bounds;
        minX = b.minX; minY = b.minY;
      }
      page.strokes = (page.strokes || []).filter((s) => !idsToRemove.has(s.id));
      invalidateStaticInkCache();
      clearLassoSelection();
      createInteractiveTextCardAt(minX, minY, ltx, true, false);
      closeRecognitionModal();
      showToast('Traits convertis en Équation LaTeX !');
    });

    const applyColor = (c) => {
      setToolColor(state.tool, c);
      if (state.tool === 'lasso' && hasAnyLassoSelection()) recolorLassoSelection(c);
      updateToolbarActiveState();
      triggerToolOptionsPulse();
    };
    dom.colorSwatches.forEach((sw) => sw.addEventListener('click', () => applyColor(sw.dataset.color)));
    dom.customColorPicker.addEventListener('input', (e) => applyColor(e.target.value));

    const applySize = (v) => {
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return;
      setToolSize(state.tool, n);
      dom.strokeSizeSlider.value = n;
      dom.strokeSizeValue.textContent = `${n.toFixed(1)}px`;
      updateToolbarActiveState();
      triggerToolOptionsPulse();
    };
    dom.strokeSizeSlider.addEventListener('input', (e) => applySize(e.target.value));
    dom.sizeDotBtns.forEach((b) => b.addEventListener('click', () => applySize(b.dataset.size)));

    dom.smoothingSlider.addEventListener('input', (e) => {
      state.smoothing = Math.max(0, Math.min(1.0, parseFloat(e.target.value)));
      try { localStorage.setItem('inkflow_smoothing_v1', String(state.smoothing)); } catch (_) {}
      dom.smoothingValue.textContent = `${Math.round(state.smoothing * 100)}%`;
      syncGnPenSubBarUi();
    });
    dom.btnPressureDynamic.addEventListener('click', () => {
      state.pressureMode = 'dynamic';
      dom.btnPressureDynamic.classList.add('active'); dom.btnPressureUniform.classList.remove('active');
    });
    dom.btnPressureUniform.addEventListener('click', () => {
      state.pressureMode = 'uniform';
      dom.btnPressureUniform.classList.add('active'); dom.btnPressureDynamic.classList.remove('active');
    });

    if (dom.autoShapeToggle) {
      dom.autoShapeToggle.checked = state.autoShapeEnabled;
      dom.autoShapeToggle.addEventListener('change', (e) => {
        state.autoShapeEnabled = Boolean(e.target.checked);
        try { localStorage.setItem('plume_auto_shape_enabled', String(state.autoShapeEnabled)); } catch (_) {}
        showToast(state.autoShapeEnabled ? '✨ Forme auto au maintien activée' : 'Forme auto au maintien désactivée');
      });
    }

    const btnQuickColorLasso = document.getElementById('btnQuickColorLasso');
    if (btnQuickColorLasso) {
      btnQuickColorLasso.addEventListener('click', (e) => {
        e.stopPropagation();
        openGnColorPopover({
          mode: 'lasso',
          toolKey: 'pen',
          scopeKey: 'lasso',
          anchorEl: btnQuickColorLasso,
          initialColor: getActiveToolColor('pen')
        });
      });
    }
    if (dom.btnQuickDupLasso) dom.btnQuickDupLasso.addEventListener('click', (e) => { e.stopPropagation(); duplicateLassoSelection(); });
    if (dom.btnQuickRecogLasso) dom.btnQuickRecogLasso.addEventListener('click', (e) => { e.stopPropagation(); openRecognitionModal(); });
    if (dom.btnQuickDelLasso) dom.btnQuickDelLasso.addEventListener('click', (e) => { e.stopPropagation(); deleteLassoSelection(); });

    // Barre flottante d'édition de forme sélectionnée (#shapeEditFloatingBar)
    if (dom.shapeEditFloatingBar) {
      dom.shapeEditFloatingBar.querySelectorAll('[data-shape-convert]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          convertSelectedShapeType(btn.dataset.shapeConvert);
        });
      });
      const fillBtn = document.getElementById('btnShapeEditFill');
      if (fillBtn) {
        fillBtn.addEventListener('click', (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          const page = getActivePage();
          const sh = getSelectedShape(page);
          if (!page || !sh || !isConnectableTargetShape(sh)) return;
          pushHistorySnapshot(page);
          sh.filled = !sh.filled;
          invalidateStaticInkCache();
          renderScene();
          renderActiveCanvasOnly();
          updateShapeEditFloatingBar();
          scheduleSaveActivePage(page);
        });
      }
      const adjustShapeThickness = (delta) => {
        const page = getActivePage();
        const sh = getSelectedShape(page);
        if (!page || !sh) return;
        pushHistorySnapshot(page);
        sh.size = Math.max(1, Math.min(24, Math.round(((sh.size || 3) + delta) * 2) / 2));
        invalidateStaticInkCache();
        renderScene();
        renderActiveCanvasOnly();
        updateShapeEditFloatingBar();
        scheduleSaveActivePage(page);
      };
      const thinBtn = document.getElementById('btnShapeEditThin');
      if (thinBtn) thinBtn.addEventListener('click', (e) => { if (e && e.stopPropagation) e.stopPropagation(); adjustShapeThickness(-1); });
      const thickBtn = document.getElementById('btnShapeEditThick');
      if (thickBtn) thickBtn.addEventListener('click', (e) => { if (e && e.stopPropagation) e.stopPropagation(); adjustShapeThickness(1); });

      const applySelectedShapeColor = (hex) => {
        const page = getActivePage();
        const sh = getSelectedShape(page);
        if (!page || !sh || !hex) return;
        pushHistorySnapshot(page);
        sh.color = hex;
        invalidateStaticInkCache();
        renderScene();
        renderActiveCanvasOnly();
        updateShapeEditFloatingBar();
        scheduleSaveActivePage(page);
      };
      dom.shapeEditFloatingBar.querySelectorAll('[data-shape-color]').forEach((sw) => {
        sw.addEventListener('click', (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          applySelectedShapeColor(sw.dataset.shapeColor);
        });
      });
      const shapeEditAddColBtn = document.getElementById('btnShapeEditAddColor');
      if (shapeEditAddColBtn) {
        shapeEditAddColBtn.addEventListener('click', (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          const sh = getSelectedShape();
          openGnColorPopover({
            mode: 'shape-edit',
            toolKey: 'shape',
            scopeKey: 'shape',
            anchorEl: shapeEditAddColBtn,
            initialColor: (sh && sh.color) || state.shapeColor || '#111827'
          });
        });
      }
      const customColorInput = document.getElementById('shapeEditCustomColor');
      if (customColorInput) {
        customColorInput.addEventListener('input', (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          applySelectedShapeColor(e.target.value);
        });
      }
      const dupBtn = document.getElementById('btnShapeEditDup');
      if (dupBtn) dupBtn.addEventListener('click', (e) => { if (e && e.stopPropagation) e.stopPropagation(); duplicateSelectedShape(); });
      const delBtn = document.getElementById('btnShapeEditDel');
      if (delBtn) delBtn.addEventListener('click', (e) => { if (e && e.stopPropagation) e.stopPropagation(); deleteSelectedShape(); });
    }

    if (dom.radialColorWheel) {
      dom.radialColorWheel.addEventListener('pointermove', (e) => {
        if (state.colorWheelOpen) updateRadialColorWheelHover(e.clientX, e.clientY);
      });
      dom.radialColorWheel.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.radialWheelSuppressClick) { state.radialWheelSuppressClick = false; return; }
        if (!state.colorWheelOpen) return;
        const slice = e.target.closest('.radial-slice');
        if (slice && slice.dataset.wheelColor) {
          selectRadialColor(slice.dataset.wheelColor);
        } else {
          closeRadialColorWheel(true);
          requestRender();
        }
      });
    }

    dom.shapeBtns.forEach((b) => b.addEventListener('click', () => {
      state.shapeType = b.dataset.shape;
      dom.shapeBtns.forEach((x) => x.classList.toggle('active', x === b));
    }));
    dom.shapeFillCheckbox.addEventListener('change', (e) => { state.shapeFilled = e.target.checked; });

    dom.eraserModeBtns.forEach((b) => b.addEventListener('click', () => {
      state.eraserMode = b.dataset.eraserMode;
      dom.eraserModeBtns.forEach((x) => x.classList.toggle('active', x === b));
    }));
    dom.btnClearPage.addEventListener('click', () => {
      const page = getActivePage();
      if (!page) return;
      pushHistorySnapshot();
      page.strokes = []; page.shapes = []; page.texts = []; page.tapes = []; page.images = [];
      invalidateStaticInkCache();
      renderWorldTextCards();
      requestRender();
      scheduleSaveActivePage();
      showToast('Page effacée');
    });

    dom.btnDuplicateSelection.addEventListener('click', duplicateLassoSelection);
    dom.btnScaleUpSelection.addEventListener('click', () => scaleLassoSelectionByFactor(1.15));
    dom.btnScaleDownSelection.addEventListener('click', () => scaleLassoSelectionByFactor(0.85));
    dom.btnDeleteSelection.addEventListener('click', deleteLassoSelection);
    dom.btnUndo.addEventListener('click', performUndo);
    dom.btnRedo.addEventListener('click', performRedo);

    dom.btnPaperSettings.addEventListener('click', () => {
      state.toolOptionsOpen = false;
      updateToolbarActiveState();
      dom.exportPopover.classList.add('hidden');
      if (dom.paperPopover) dom.paperPopover.classList.add('hidden');
      openGnTemplateLibraryModal('paper');
    });
    dom.btnClosePaperPopover.addEventListener('click', () => dom.paperPopover.classList.add('hidden'));
    dom.paperOptionBtns.forEach((b) => b.addEventListener('click', () => {
      const p = getActivePage(); if (!p) return;
      p.paperType = b.dataset.paper; updateBreadcrumbs(); requestRender(); scheduleSaveActivePage();
    }));
    dom.toneBtns.forEach((b) => b.addEventListener('click', () => {
      const p = getActivePage(); if (!p) return;
      p.paperTone = b.dataset.tone; invalidateStaticInkCache(); updateBreadcrumbs(); requestRender(); scheduleSaveActivePage();
    }));
    dom.gridSpacingSlider.addEventListener('input', (e) => {
      const p = getActivePage(); if (!p) return;
      p.gridSize = parseInt(e.target.value, 10);
      dom.gridSpacingVal.textContent = `${p.gridSize}px`;
      requestRender(); scheduleSaveActivePage();
    });
    dom.viewModeBtns.forEach((b) => b.addEventListener('click', () => {
      const p = getActivePage(); if (!p) return;
      const nextMode = b.dataset.viewmode;
      const nbPages = getActiveNotebookPages();
      nbPages.forEach((pg) => {
        if (!pg.pdfId && !pg.isPdfPage) {
          pg.viewMode = nextMode;
          db.savePage(pg);
        }
      });
      p.viewMode = nextMode;
      invalidateStaticInkCache();
      resetPullToAddState();
      updateBreadcrumbs();
      if (isBoundedPage(p)) fitPageToViewport(true);
      else requestRender();
      scheduleSaveActivePage();
    }));

    dom.btnExportMenu.addEventListener('click', () => {
      state.toolOptionsOpen = false;
      updateToolbarActiveState();
      dom.paperPopover.classList.add('hidden');
      dom.exportPopover.classList.toggle('hidden');
    });
    dom.btnCloseExportPopover.addEventListener('click', () => dom.exportPopover.classList.add('hidden'));

    const buildStandaloneFullHtml = () => {
      return '<!DOCTYPE html>\n' + document.documentElement.outerHTML
        .replace(/height:\s*660px;/g, 'height: 100vh;')
        .replace(/min-height:\s*660px;/g, 'min-height: 100vh;')
        .replace(/border-radius:\s*12px;/g, 'border-radius: 0;');
    };
    const launchOrDownloadStandalone = () => {
      dom.exportPopover.classList.add('hidden');
      const fullHtml = buildStandaloneFullHtml();
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      downloadBlob(blob, 'Plume-Studio-PC.html');
      showToast('Fichier Plume-Studio-PC.html téléchargé !');
    };
    const btnDlApp = document.getElementById('btnDownloadStandaloneApp');
    if (btnDlApp) btnDlApp.addEventListener('click', launchOrDownloadStandalone);

    dom.btnExportSvg.addEventListener('click', () => {
      dom.exportPopover.classList.add('hidden');
      const p = getActivePage(); if (!p) return;
      const pal = getPaperPalette(p.paperTone);
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}"><rect width="100%" height="100%" fill="${pal.bg}"/>`;
      (p.shapes || []).forEach((sh) => {
        const op = sh.isHighlighter ? '0.36' : '1';
        const sw = sh.size || 3;
        const col = sh.color || '#1e293b';
        const fillCol = sh.filled ? hexToRgba(col, 0.12) : 'none';
        if (sh.type === 'line' || sh.type === 'arrow') {
          svg += `<line x1="${sh.x1}" y1="${sh.y1}" x2="${sh.x2}" y2="${sh.y2}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-opacity="${op}"/>`;
          if (sh.type === 'arrow') {
            const ang = Math.atan2(sh.y2 - sh.y1, sh.x2 - sh.x1);
            const hl = Math.max(12, Math.min(28, sw * 3.8));
            const ax1 = sh.x2 - hl * Math.cos(ang - Math.PI / 6), ay1 = sh.y2 - hl * Math.sin(ang - Math.PI / 6);
            const ax2 = sh.x2 - hl * Math.cos(ang + Math.PI / 6), ay2 = sh.y2 - hl * Math.sin(ang + Math.PI / 6);
            svg += `<path d="M ${ax1.toFixed(1)} ${ay1.toFixed(1)} L ${sh.x2.toFixed(1)} ${sh.y2.toFixed(1)} L ${ax2.toFixed(1)} ${ay2.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${op}"/>`;
          }
        } else if (sh.type === 'rect' || sh.type === 'roundedRect') {
          const cx = (sh.x1 + sh.x2) * 0.5, cy = (sh.y1 + sh.y2) * 0.5;
          const rw = Math.abs(sh.x2 - sh.x1), rh = Math.abs(sh.y2 - sh.y1);
          const rad = sh.type === 'roundedRect' ? (Math.min(rw, rh) * 0.28).toFixed(1) : '6';
          const rot = sh.angle ? ` transform="rotate(${(sh.angle * 180 / Math.PI).toFixed(2)} ${cx.toFixed(1)} ${cy.toFixed(1)})"` : '';
          svg += `<rect x="${(cx - rw * 0.5).toFixed(1)}" y="${(cy - rh * 0.5).toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" rx="${rad}" fill="${fillCol}" stroke="${col}" stroke-width="${sw}" stroke-opacity="${op}"${rot}/>`;
        } else if (sh.type === 'ellipse') {
          const cx = (sh.x1 + sh.x2) * 0.5, cy = (sh.y1 + sh.y2) * 0.5;
          const rx = Math.max(1, Math.abs(sh.x2 - sh.x1) * 0.5), ry = Math.max(1, Math.abs(sh.y2 - sh.y1) * 0.5);
          const rot = sh.angle ? ` transform="rotate(${(sh.angle * 180 / Math.PI).toFixed(2)} ${cx.toFixed(1)} ${cy.toFixed(1)})"` : '';
          svg += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${fillCol}" stroke="${col}" stroke-width="${sw}" stroke-opacity="${op}"${rot}/>`;
        } else if (sh.type === 'triangle' || sh.type === 'diamond' || sh.type === 'polygon') {
          const verts = getShapeVertices(sh) || [];
          const ptsAttr = verts.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ');
          svg += `<polygon points="${ptsAttr}" fill="${fillCol}" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round" stroke-opacity="${op}"/>`;
        } else if (sh.type === 'polyline') {
          const verts = getShapeVertices(sh) || [];
          const ptsAttr = verts.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ');
          svg += `<polyline points="${ptsAttr}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${op}"/>`;
        } else if (sh.type === 'arc') {
          const verts = getShapeVertices(sh) || [];
          if (verts.length >= 4) {
            svg += `<path d="M ${verts[0].x.toFixed(1)} ${verts[0].y.toFixed(1)} C ${verts[1].x.toFixed(1)} ${verts[1].y.toFixed(1)} ${verts[2].x.toFixed(1)} ${verts[2].y.toFixed(1)} ${verts[3].x.toFixed(1)} ${verts[3].y.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-opacity="${op}"/>`;
          }
        }
      });
      (p.strokes || []).forEach((s) => {
        const svgPath = getCachedStrokeSvgPath(s);
        if (svgPath) svg += `<path d="${svgPath}" fill="${s.color}" fill-opacity="${s.tool === 'highlighter' ? 0.35 : 1}"/>`;
      });
      svg += `</svg>`;
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'note.svg');
      showToast('Exporté en SVG');
    });
    dom.btnExportPng.addEventListener('click', () => {
      dom.exportPopover.classList.add('hidden');
      const comp = document.createElement('canvas');
      comp.width = dom.inkCanvas.width;
      comp.height = dom.inkCanvas.height;
      const cCtx = comp.getContext('2d');
      if (dom.pdfBgCanvas) cCtx.drawImage(dom.pdfBgCanvas, 0, 0);
      cCtx.drawImage(dom.inkCanvas, 0, 0);
      comp.toBlob((b) => {
        if (b) downloadBlob(b, 'note.png');
        releaseCanvasMemory(comp);
      });
      showToast('Exporté en PNG');
    });

    // Exportation PDF vectorielle annotée avec pdf-lib (Cahier complet ou Page active)
    if (dom.btnExportPdf) {
      dom.btnExportPdf.addEventListener('click', () => {
        dom.exportPopover.classList.add('hidden');
        exportAnnotatedPdfWithPdfLib('notebook', true);
      });
    }
    if (dom.btnExportPdfSidebar) {
      dom.btnExportPdfSidebar.addEventListener('click', () => {
        exportAnnotatedPdfWithPdfLib('notebook', true);
      });
    }
    if (dom.btnExportCurrentPagePdf) {
      dom.btnExportCurrentPagePdf.addEventListener('click', () => {
        dom.exportPopover.classList.add('hidden');
        exportAnnotatedPdfWithPdfLib('page', true);
      });
    }

    // Importation PDF locale avec pdfjs-dist (PDF.js)
    let autoImportModeAfterFilePick = null;
    const openPdfModalHandler = () => {
      dom.exportPopover.classList.add('hidden');
      dom.paperPopover.classList.add('hidden');
      openImportPdfModal();
    };
    if (dom.btnImportPdfSidebar) dom.btnImportPdfSidebar.addEventListener('click', openPdfModalHandler);
    if (dom.btnImportPdfPages) dom.btnImportPdfPages.addEventListener('click', openPdfModalHandler);
    if (dom.btnImportPdfFromExportMenu) dom.btnImportPdfFromExportMenu.addEventListener('click', openPdfModalHandler);

    if (dom.btnCloseImportPdfModal) dom.btnCloseImportPdfModal.addEventListener('click', closeImportPdfModal);
    if (dom.btnCancelImportPdfModal) dom.btnCancelImportPdfModal.addEventListener('click', closeImportPdfModal);

    const triggerPdfFileSelection = async (modeAfterPick = null) => {
      autoImportModeAfterFilePick = modeAfterPick;
      if (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.dialog && window.__TAURI__.core) {
        try {
          const selectedPath = await window.__TAURI__.dialog.open({
            multiple: false,
            filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
          });
          if (selectedPath && typeof selectedPath === 'string') {
            const rawArr = await window.__TAURI__.core.invoke('read_binary_file', { path: selectedPath });
            const uint8 = new Uint8Array(rawArr);
            const fileName = selectedPath.split(/[/\\]/).pop() || 'Document.pdf';
            await stagePdfBufferForImport(uint8.buffer, fileName);
            if (autoImportModeAfterFilePick) {
              const mode = autoImportModeAfterFilePick;
              autoImportModeAfterFilePick = null;
              await paidImportPdf(uint8.buffer, fileName, mode);
            }
            return;
          }
          return;
        } catch (_) {
          // Bascule automatiquement sur l'input file standard WebView2
        }
      }
      if (dom.inputImportPdf) dom.inputImportPdf.click();
    };

    if (dom.btnSelectPdfFileModal) {
      dom.btnSelectPdfFileModal.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerPdfFileSelection(null);
      });
    }
    if (dom.pdfModalDropzone) {
      dom.pdfModalDropzone.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        triggerPdfFileSelection(null);
      });
      dom.pdfModalDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.pdfModalDropzone.classList.add('dragover');
      });
      dom.pdfModalDropzone.addEventListener('dragleave', () => {
        dom.pdfModalDropzone.classList.remove('dragover');
      });
      dom.pdfModalDropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dom.pdfModalDropzone.classList.remove('dragover');
        const f = e.dataTransfer?.files?.[0];
        if (f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) {
          try {
            const buf = await f.arrayBuffer();
            await stagePdfBufferForImport(buf, f.name);
            showToast(`PDF prêt : ${f.name}`);
          } catch (_) {
            // Le message d'erreur détaillé est déjà affiché dans la bannière par stagePdfBufferForImport
          }
        }
      });
    }

    // Permet aussi de glisser-déposer un fichier .pdf directement sur la zone de travail !
    if (dom.canvasViewport) {
      dom.canvasViewport.addEventListener('dragover', (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
        }
      });
      dom.canvasViewport.addEventListener('drop', async (e) => {
        const f = e.dataTransfer?.files?.[0];
        if (f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) {
          e.preventDefault();
          try {
            const buf = await f.arrayBuffer();
            await stagePdfBufferForImport(buf, f.name);
            openImportPdfModal();
          } catch (_) {
            // La bannière d'erreur est ouverte automatiquement par showPdfImportError
          }
        }
      });
    }

    if (dom.inputImportPdf) {
      dom.inputImportPdf.addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try {
          const buf = await f.arrayBuffer();
          await stagePdfBufferForImport(buf, f.name);
          if (autoImportModeAfterFilePick) {
            const mode = autoImportModeAfterFilePick;
            autoImportModeAfterFilePick = null;
            await paidImportPdf(buf, f.name, mode);
          } else if (dom.modalImportPdf && dom.modalImportPdf.classList.contains('hidden')) {
            openImportPdfModal();
          }
        } catch (_) {
          // L'erreur explicite est déjà affichée dans #pdfImportErrorBanner
        }
      });
    }

    if (dom.btnGenerateSamplePdf) {
      dom.btnGenerateSamplePdf.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const sampleBytes = await generateSampleCoursePdfBytes();
          await stagePdfBufferForImport(sampleBytes, 'Cours-Equations-Differentielles.pdf');
          await paidImportPdf(sampleBytes, 'Cours-Equations-Differentielles.pdf', 'new-notebook');
        } catch (_) {
          showToast('Erreur lors de la génération du PDF d\'exemple', 'error');
        }
      });
    }

    if (dom.btnConfirmPdfNewNotebook) {
      dom.btnConfirmPdfNewNotebook.addEventListener('click', async () => {
        if (state.pendingPdfImport && state.pendingPdfImport.bytes) {
          try {
            await paidImportPdf(state.pendingPdfImport.bytes, state.pendingPdfImport.fileName, 'new-notebook');
          } catch (_) {}
        } else if (dom.inputImportPdf) {
          autoImportModeAfterFilePick = 'new-notebook';
          dom.inputImportPdf.click();
        }
      });
    }

    if (dom.btnConfirmPdfAppendNotebook) {
      dom.btnConfirmPdfAppendNotebook.addEventListener('click', async () => {
        if (state.pendingPdfImport && state.pendingPdfImport.bytes) {
          try {
            await paidImportPdf(state.pendingPdfImport.bytes, state.pendingPdfImport.fileName, 'current-notebook');
          } catch (_) {}
        } else if (dom.inputImportPdf) {
          autoImportModeAfterFilePick = 'current-notebook';
          dom.inputImportPdf.click();
        }
      });
    }

    // Thème clair/sombre mémorisé d'une session à l'autre
    try {
      const savedTheme = localStorage.getItem('inkflow.theme');
      if (savedTheme === 'dark' || savedTheme === 'light') document.documentElement.setAttribute('data-theme', savedTheme);
    } catch (_) {}
    dom.btnThemeToggle.addEventListener('click', () => {
      const h = document.documentElement;
      const nextTheme = h.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      h.setAttribute('data-theme', nextTheme);
      try { localStorage.setItem('inkflow.theme', nextTheme); } catch (_) {}
      if (virtualRulerState.visible) renderVirtualRuler();
      if (typeof scheduleSplitPaneRender === 'function') scheduleSplitPaneRender();
      requestRender();
    });

    if (dom.btnFullscreenToggle) {
      dom.btnFullscreenToggle.addEventListener('click', () => {
        toggleFullscreenMode();
      });
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('fullscreenchange', () => {
        updateFullscreenUi(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
        requestRender();
      });
    }
    syncFullscreenState();

    if (dom.palmRejectionToggle) {
      dom.palmRejectionToggle.addEventListener('change', (e) => { state.palmRejection = e.target.checked; });
    }
    if (dom.btnPrevPage) {
      dom.btnPrevPage.addEventListener('click', () => {
        const pages = getActiveNotebookPages(), idx = pages.findIndex((p) => p.id === state.activePageId);
        if (idx > 0) selectPage(pages[idx - 1].id);
      });
    }
    if (dom.btnNextPage) {
      dom.btnNextPage.addEventListener('click', () => {
        const pages = getActiveNotebookPages(), idx = pages.findIndex((p) => p.id === state.activePageId);
        if (idx >= 0 && idx < pages.length - 1) selectPage(pages[idx + 1].id);
      });
    }
    if (dom.btnQuickAddPage) {
      dom.btnQuickAddPage.addEventListener('click', () => paidAddPage());
    }
    if (dom.btnNewPageSidebar) {
      dom.btnNewPageSidebar.addEventListener('click', () => paidAddPage());
    }

    if (dom.btnZoomIn) {
      dom.btnZoomIn.addEventListener('click', () => {
        const r = dom.canvasViewport.getBoundingClientRect();
        zoomAtScreenPoint(state.zoom * 1.25, r.width / 2, r.height / 2);
      });
    }
    if (dom.btnZoomOut) {
      dom.btnZoomOut.addEventListener('click', () => {
        const r = dom.canvasViewport.getBoundingClientRect();
        zoomAtScreenPoint(state.zoom / 1.25, r.width / 2, r.height / 2);
      });
    }
    if (dom.btnZoomReset) {
      dom.btnZoomReset.addEventListener('click', () => {
        const r = dom.canvasViewport.getBoundingClientRect();
        zoomAtScreenPoint(1.0, r.width / 2, r.height / 2);
      });
    }
    if (dom.btnExtendCanvas) {
      dom.btnExtendCanvas.addEventListener('click', () => {
        const p = getActivePage();
        if (p) p.viewMode = 'infinite';
        const r = dom.canvasViewport.getBoundingClientRect();
        zoomAtScreenPoint(Math.max(0.35, state.zoom * 0.62), r.width / 2, r.height / 2);
        updateBreadcrumbs();
      });
    }
    if (dom.btnFitPage) {
      dom.btnFitPage.addEventListener('click', fitPageToViewport);
    }

    const openNewNotebookModal = () => {
      if (dom.inputNotebookName) dom.inputNotebookName.value = '';
      if (typeof updateNewNotebookPaperPreview === 'function') updateNewNotebookPaperPreview();
      if (typeof prepareNewNotebookDriveTargetUi === 'function') prepareNewNotebookDriveTargetUi();
      if (dom.modalNewNotebook) dom.modalNewNotebook.classList.remove('hidden');
    };
    dom.btnNewNotebook.addEventListener('click', openNewNotebookModal);
    if (dom.inputNotebookName) {
      dom.inputNotebookName.addEventListener('input', () => {
        if (typeof refreshNewNotebookDriveTargetUi === 'function') refreshNewNotebookDriveTargetUi();
      });
    }
    const btnPickNewNbDrive = document.getElementById('btnPickNewNotebookDriveTarget');
    if (btnPickNewNbDrive) {
      btnPickNewNbDrive.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const curTitle = (dom.inputNotebookName && dom.inputNotebookName.value.trim()) || `Cahier ${state.notebooks.length + 1}`;
        const cur = state.newNotebookDriveTarget;
        openDriveTargetPicker({
          pickerTitle: 'Choisir le fichier Google Drive du nouveau cahier',
          notebookTitle: curTitle,
          defaultFileName: (cur && !cur.autoFileName && cur.fileName) ? cur.fileName : sanitizeDriveNotebookFilename('', curTitle),
          initialFolderId: cur ? cur.folderId : null,
          initialFolderPath: cur ? cur.folderPath : '',
          onSelect: (picked) => {
            if (!picked) return;
            state.newNotebookDriveTarget = { ...picked, autoFileName: false };
            refreshNewNotebookDriveTargetUi();
          }
        });
      });
    }
    const btnClearNewNbDrive = document.getElementById('btnClearNewNotebookDriveTarget');
    if (btnClearNewNbDrive) {
      btnClearNewNbDrive.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.newNotebookDriveTarget = null;
        if (typeof refreshNewNotebookDriveTargetUi === 'function') refreshNewNotebookDriveTargetUi();
      });
    }
    const closeNb = () => {
      closeGnColorPopover();
      dom.modalNewNotebook.classList.add('hidden');
    };
    dom.btnCloseNotebookModal.addEventListener('click', closeNb);
    dom.btnCancelNotebookModal.addEventListener('click', closeNb);
    dom.notebookCoverSwatches.forEach((sw) => sw.addEventListener('click', () => {
      state.newNotebookCover = sw.dataset.cover;
      if (state.newNotebookTemplate) {
        state.newNotebookTemplate.coverTemplateId = null;
        state.newNotebookTemplate.coverCustomDataUrl = null;
      }
      const nbWrap = document.getElementById('notebookCoverSwatches');
      if (nbWrap) nbWrap.querySelectorAll('[data-cover]').forEach((s) => s.classList.toggle('active', s === sw));
    }));
    const btnAddNotebookCoverColor = document.getElementById('btnAddNotebookCoverColor');
    if (btnAddNotebookCoverColor) {
      btnAddNotebookCoverColor.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openGnColorPopover({
          mode: 'notebook-cover',
          toolKey: 'pen',
          scopeKey: 'cover',
          anchorEl: btnAddNotebookCoverColor,
          initialColor: state.newNotebookCover || '#0072ce'
        });
      });
    }
    const btnChooseNewNotebookPaper = document.getElementById('btnChooseNewNotebookPaper');
    if (btnChooseNewNotebookPaper) {
      btnChooseNewNotebookPaper.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openGnTemplateLibraryModal('paper', {
          mode: 'new-notebook',
          initial: state.newNotebookTemplate,
          onApply: (picked) => {
            if (!picked) return;
            const prev = state.newNotebookTemplate || {};
            state.newNotebookTemplate = {
              paperType: picked.paperType || 'grid',
              paperTone: picked.paperTone || 'white',
              gridSize: Number.isFinite(picked.gridSize) ? picked.gridSize : 28,
              language: picked.language || 'fr',
              sizeId: picked.sizeId || 'goodnotes_standard',
              orientation: picked.orientation || 'portrait',
              customTemplateDataUrl: picked.customTemplateDataUrl || null,
              coverTemplateId: picked.coverSelected ? picked.coverTemplateId : (prev.coverTemplateId || null),
              coverCustomDataUrl: picked.coverSelected ? picked.coverCustomDataUrl : (prev.coverCustomDataUrl || null)
            };
            if (picked.coverSelected && picked.coverColor) {
              state.newNotebookCover = picked.coverColor;
              const nbWrap = document.getElementById('notebookCoverSwatches');
              if (nbWrap) {
                nbWrap.querySelectorAll('[data-cover]').forEach((s) => {
                  s.classList.toggle('active', String(s.dataset.cover || '').toLowerCase() === String(picked.coverColor).toLowerCase());
                });
              }
            }
            updateNewNotebookPaperPreview();
          }
        });
      });
    }
    dom.btnCreateNotebookConfirm.addEventListener('click', async () => {
      const title = dom.inputNotebookName.value.trim() || `Cahier ${state.notebooks.length + 1}`;
      const tpl = state.newNotebookTemplate || {};
      const paperType = (dom.selectDefaultPaper && dom.selectDefaultPaper.value) || tpl.paperType || 'grid';
      const dims = getPageDimensionsForSizeAndOrientation(tpl.sizeId || 'goodnotes_standard', tpl.orientation || 'portrait');
      let chosenDriveTarget = state.newNotebookDriveTarget ? { ...state.newNotebookDriveTarget } : null;
      if (chosenDriveTarget && chosenDriveTarget.mode === 'folder' && chosenDriveTarget.autoFileName) {
        chosenDriveTarget.fileName = sanitizeDriveNotebookFilename('', title);
      }
      const templateOptions = {
        paperType,
        paperTone: tpl.paperTone === 'all' ? 'white' : (tpl.paperTone || 'white'),
        gridSize: Number.isFinite(tpl.gridSize) ? tpl.gridSize : 28,
        viewMode: dims.viewMode,
        pageSize: tpl.sizeId || 'goodnotes_standard',
        pageOrientation: tpl.orientation || 'portrait',
        pageWidth: dims.width,
        pageHeight: dims.height,
        templateLanguage: tpl.language || 'fr',
        customTemplateDataUrl: tpl.customTemplateDataUrl || null,
        coverTemplateId: tpl.coverTemplateId || undefined,
        coverCustomDataUrl: tpl.coverCustomDataUrl || null,
        driveTarget: chosenDriveTarget || undefined
      };
      state.newNotebookDriveTarget = null;
      closeNb();
      const created = await paidCreateNotebook(title, paperType, state.newNotebookCover, templateOptions);
      if (created && created.notebook) {
        if (chosenDriveTarget && chosenDriveTarget.folderId && created.notebook.folderId) {
          const parentFld = (state.folders || []).find((f) => f.id === created.notebook.folderId);
          if (parentFld && !parentFld.driveDefaultFolder) {
            parentFld.driveDefaultFolder = {
              folderId: chosenDriveTarget.folderId,
              folderPath: chosenDriveTarget.folderPath || 'Mon Drive'
            };
            db.saveFolders(state.folders).catch(() => {});
          }
        }
        if (created.notebook.driveTarget && isGdriveLinked() && isNetworkAvailable() && typeof syncSingleNotebookWithGoogleDrive === 'function') {
          syncSingleNotebookWithGoogleDrive(created.notebook.id, { auto: true }).catch(() => {});
        }
      }
      if (created && state.filesPageOpen && typeof closeFilesPage === 'function') {
        closeFilesPage();
      }
    });

    dom.btnBackupJson.addEventListener('click', () => {
      const allPages = [];
      state.pagesByNotebook.forEach((list) => list.forEach((p) => allPages.push({ ...p, thumbnail: undefined })));
      downloadBlob(new Blob([JSON.stringify({ notebooks: state.notebooks, pages: allPages }, null, 2)], { type: 'application/json' }), 'plume-studio.json');
    });
    dom.btnImportJson.addEventListener('click', () => dom.inputImportJson.click());
    dom.inputImportJson.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (Array.isArray(data.notebooks) && Array.isArray(data.pages)) {
          for (const nb of data.notebooks) await db.saveNotebook(nb);
          for (const pg of data.pages) await db.savePage(pg);
          await loadFromIndexedDB();
          showToast('Cahiers importés');
        }
      } catch (_) { showToast('JSON invalide', 'error'); }
    });

    dom.btnDesktopInfo.addEventListener('click', () => dom.modalDesktopInfo.classList.remove('hidden'));
    dom.btnCloseDesktopModal.addEventListener('click', () => dom.modalDesktopInfo.classList.add('hidden'));
    dom.btnOkDesktopModal.addEventListener('click', () => dom.modalDesktopInfo.classList.add('hidden'));

    dom.btnCloseRenameModal.addEventListener('click', closeRenameModal);
    dom.btnCancelRenameModal.addEventListener('click', closeRenameModal);
    dom.btnConfirmRenameModal.addEventListener('click', () => {
      const val = dom.inputRenameValue.value.trim();
      if (val && currentRenameCallback) currentRenameCallback(val);
      closeRenameModal();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreenMode();
        return;
      }
      // Page Détente ouverte : seuls ses propres raccourcis agissent (aucun raccourci de dessin)
      if (state.detentePageOpen) {
        if (!e.defaultPrevented) handleDetenteKeydown(e);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleFilesPage();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openPdfSearchBar();
        return;
      }
      // Dans un champ d'une fenêtre modale : Entrée valide, Échap ferme
      if (e.target && e.target.tagName === 'INPUT' && !e.isComposing) {
        const enterConfirm = {
          inputNotebookName: 'btnCreateNotebookConfirm',
          inputRenameValue: 'btnConfirmRenameModal',
          inputFolderCustomizeName: 'btnConfirmFolderCustomizeModal'
        }[e.target.id];
        if (e.key === 'Enter' && enterConfirm) {
          const confirmBtn = document.getElementById(enterConfirm);
          if (confirmBtn && !confirmBtn.disabled) { e.preventDefault(); confirmBtn.click(); }
          return;
        }
      }
      if (e.key === 'Escape' && !e.defaultPrevented && isKeyboardTypingTarget(e.target) && e.target.closest && e.target.closest('.modal-backdrop')) {
        closeTopOpenModal(e.target.closest('.modal-backdrop'));
        return;
      }
      if (isKeyboardTypingTarget(e.target)) return;
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        // Échap ferme d'abord la fenêtre modale ouverte (création de cahier, renommage, import PDF, LaTeX…)
        if (closeTopOpenModal()) return;
        if (pdfSearchState.open) {
          closePdfSearchBar();
          return;
        }
        const elPop = document.getElementById('elementsPopover');
        if (elPop && !elPop.classList.contains('hidden')) {
          elPop.classList.add('hidden');
          const elBtn = document.getElementById('btnElementsLibrary');
          if (elBtn) elBtn.classList.remove('active');
          return;
        }
        const tbCustPop = document.getElementById('toolbarCustomizePopover');
        if (tbCustPop && !tbCustPop.classList.contains('hidden')) {
          closeToolbarCustomizePopover();
          return;
        }
        const cropMod = document.getElementById('modalImageCrop');
        if (cropMod && !cropMod.classList.contains('hidden')) {
          closeImageCropModal();
          return;
        }
        const cloudMod = document.getElementById('modalGoogleDrive');
        if (cloudMod && !cloudMod.classList.contains('hidden')) {
          cloudMod.classList.add('hidden');
          return;
        }
        if (state.filesPageOpen) {
          const newMenu = document.getElementById('gnFilesNewMenu');
          const ctxMenu = document.getElementById('gnFilesContextMenu');
          if ((newMenu && !newMenu.classList.contains('hidden')) || (ctxMenu && !ctxMenu.classList.contains('hidden'))) {
            closeGnFilesMenus();
          } else if (state.filesPageSelectMode) {
            state.filesPageSelectMode = false;
            state.filesPageSelectedIds.clear();
            renderGnFilesPage();
          } else {
            closeFilesPage();
          }
          return;
        }
        if (state.colorWheelOpen) { closeRadialColorWheel(true); requestRender(); }
        else if (state.selectedShapeId) { clearSelectedShape(true); }
        else if (hasAnyLassoSelection()) { clearLassoSelection(); requestRender(); }
        return;
      }
      // Une fenêtre modale, la page Fichiers ou la page Détente est ouverte : aucun raccourci de toile ne doit agir derrière
      if (isAnyModalOpen() || state.filesPageOpen || state.detentePageOpen) return;
      if (e.code === 'Space') {
        // Empêche Espace d'« activer » le bouton d'outil qui a gardé le focus (ouverture de la sous-barre au keyup)
        e.preventDefault();
        if (!state.isSpacePressed) { state.isSpacePressed = true; dom.canvasViewport.classList.add('pan-cursor'); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) performRedo(); else performUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); performRedo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && hasAnyLassoSelection()) { e.preventDefault(); copyLassoSelection(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && state.lassoClipboard) { e.preventDefault(); pasteLassoSelection(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSb(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedShapeId) { e.preventDefault(); deleteSelectedShape(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && hasAnyLassoSelection()) { e.preventDefault(); deleteLassoSelection(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'j' && e.shiftKey) { e.preventDefault(); openDetentePage(); return; }
      if (k === 'p') setActiveTool('pen');
      else if (k === 'h') setActiveTool('highlighter');
      else if (k === 'e') setActiveTool('eraser');
      else if (k === 'l') setActiveTool('lasso');
      else if (k === 't') setActiveTool('text');
      else if (k === 's') setActiveTool('shape');
      else if (k === 'r' && !e.shiftKey) toggleVirtualRuler();
      else if (k === 'm') openLatexModalForCard(null, null);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { state.isSpacePressed = false; if (state.tool !== 'pan') dom.canvasViewport.classList.remove('pan-cursor'); }
    });
    window.addEventListener('blur', () => {
      // La touche Espace relâchée hors de la fenêtre ne doit pas laisser le mode Main (pan) bloqué
      if (state.isSpacePressed) {
        state.isSpacePressed = false;
        if (state.tool !== 'pan') dom.canvasViewport.classList.remove('pan-cursor');
      }
      finalizeActiveDrawingOnCurrentPage();
      cleanupTransientInteractionState(false);
      requestRender();
    });
    window.addEventListener('pagehide', () => {
      finalizeActiveDrawingOnCurrentPage();
      flushPendingPageSaves();
      cleanupAppResources();
    });
    let fullscreenSyncTimer = null;
    window.addEventListener('resize', () => {
      requestRender();
      if (typeof window !== 'undefined' && window.__TAURI__) {
        if (fullscreenSyncTimer) clearTimeout(fullscreenSyncTimer);
        fullscreenSyncTimer = setTimeout(() => {
          fullscreenSyncTimer = null;
          syncFullscreenState();
        }, 160);
      }
    });

    if (typeof ResizeObserver !== 'undefined') {
      let initialFitDone = false;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            if (!initialFitDone) {
              initialFitDone = true;
              fitPageToViewport();
            } else {
              requestRender();
            }
          }
        }
      });
      ro.observe(dom.canvasViewport);
    }
  }

  let isWindowFullscreen = false;

  function updateFullscreenUi(isFs) {
    isWindowFullscreen = Boolean(isFs);
    if (typeof document !== 'undefined') {
      if (document.documentElement) {
        if (typeof document.documentElement.setAttribute === 'function') {
          document.documentElement.setAttribute('data-fullscreen', isWindowFullscreen ? 'true' : 'false');
        }
        if (document.documentElement.classList) {
          document.documentElement.classList.toggle('is-fullscreen', isWindowFullscreen);
        }
      }
      if (document.body && document.body.classList) {
        document.body.classList.toggle('is-fullscreen', isWindowFullscreen);
      }
    }
    if (dom.btnFullscreenToggle) {
      dom.btnFullscreenToggle.classList.toggle('active', isWindowFullscreen);
      const label = isWindowFullscreen ? 'Quitter le plein écran (F11)' : 'Plein écran (F11)';
      if (typeof dom.btnFullscreenToggle.setAttribute === 'function') {
        dom.btnFullscreenToggle.setAttribute('title', label);
        dom.btnFullscreenToggle.setAttribute('aria-label', label);
        dom.btnFullscreenToggle.setAttribute('aria-pressed', isWindowFullscreen ? 'true' : 'false');
      } else {
        dom.btnFullscreenToggle.title = label;
      }
    }
    return isWindowFullscreen;
  }

  async function syncFullscreenState() {
    try {
      if (typeof window !== 'undefined' && window.__TAURI__) {
        if (window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
          const fsState = await window.__TAURI__.core.invoke('get_window_fullscreen');
          return updateFullscreenUi(fsState);
        }
        if (window.__TAURI__.window && typeof window.__TAURI__.window.getCurrentWindow === 'function') {
          const fsState = await window.__TAURI__.window.getCurrentWindow().isFullscreen();
          return updateFullscreenUi(fsState);
        }
      }
      if (typeof document !== 'undefined') {
        return updateFullscreenUi(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
      }
    } catch (_) {}
    return isWindowFullscreen;
  }

  async function setFullscreenMode(enable) {
    const next = Boolean(enable);
    try {
      if (typeof window !== 'undefined' && window.__TAURI__) {
        let actual = next;
        let handled = false;
        if (window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
          try {
            actual = await window.__TAURI__.core.invoke('set_window_fullscreen', { fullscreen: next });
            handled = true;
          } catch (_) {}
        }
        if (!handled && window.__TAURI__.window && typeof window.__TAURI__.window.getCurrentWindow === 'function') {
          const win = window.__TAURI__.window.getCurrentWindow();
          await win.setFullscreen(next);
          actual = typeof win.isFullscreen === 'function' ? await win.isFullscreen() : next;
          handled = true;
        }
        if (handled) {
          updateFullscreenUi(actual);
          requestRender();
          return actual;
        }
      }

      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        if (next) {
          if (root && typeof root.requestFullscreen === 'function') {
            await root.requestFullscreen();
          } else if (root && typeof root.webkitRequestFullscreen === 'function') {
            await root.webkitRequestFullscreen();
          }
        } else if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (typeof document.exitFullscreen === 'function') {
            await document.exitFullscreen();
          } else if (typeof document.webkitExitFullscreen === 'function') {
            await document.webkitExitFullscreen();
          }
        }
        updateFullscreenUi(next);
        requestRender();
        return next;
      }
    } catch (_) {
      showToast('Impossible de basculer le mode plein écran.', 'error');
    }
    return isWindowFullscreen;
  }

  async function toggleFullscreenMode() {
    const current = await syncFullscreenState();
    return setFullscreenMode(!current);
  }

  async function cleanupAppResources() {
    cleanupTransientInteractionState(false);
    if (zoomSettleTimer) {
      clearTimeout(zoomSettleTimer);
      zoomSettleTimer = null;
    }
    isZoomInteracting = false;
    if (hiDpiPdfZoomTimer) {
      clearTimeout(hiDpiPdfZoomTimer);
      hiDpiPdfZoomTimer = null;
    }
    if (lazyAdjacentPdfTimer) {
      clearTimeout(lazyAdjacentPdfTimer);
      lazyAdjacentPdfTimer = null;
    }
    clearActiveCanvas();
    releaseStaticInkCacheMemory();
    releasePencilBuffersMemory();
    cleanupPdfRenderCache(null, 0);
    for (const pdfId of Array.from(pdfDocInstanceCache.keys())) {
      await destroyPdfDocumentResources(pdfId, false);
    }
    state.pendingPdfImport = null;
    state.lastExportedPdfBytes = null;
  }

  function applyDemoStateSynchronously() {
    const demo = createDemoNotebookAndPages();
    state.notebooks = demo.notebooks;
    state.pagesByNotebook.clear();
    for (const nb of demo.notebooks) {
      const list = demo.pages.filter((p) => p.notebookId === nb.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      state.pagesByNotebook.set(nb.id, list);
    }
    state.activeNotebookId = state.notebooks[0].id;
    state.activePageId = getActiveNotebookPages()[0]?.id || null;
  }

