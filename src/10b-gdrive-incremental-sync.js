  // ============================================================================
  // 18B. SYNCHRONISATION INCRÉMENTALE & CIBLAGE PRÉCIS PAR FICHIER GOOGLE DRIVE
  // ============================================================================

  const GDRIVE_SYNC_FOLDER_NAME = 'InkFlow';
  const GDRIVE_SYNC_META_KEY = 'inkflow.gdrive.incrementalSync.v1';
  const GDRIVE_SAVE_FORMAT_KEY = 'inkflow.gdrive.saveFormat.v1';
  const GDRIVE_SYNC_DEBOUNCE_MS = 15000;

  let gdriveDefaultSaveFormatCache = null;

  function getGdriveDefaultSaveFormat() {
    if (gdriveDefaultSaveFormatCache === 'pdf' || gdriveDefaultSaveFormatCache === 'json') {
      return gdriveDefaultSaveFormatCache;
    }
    const raw = readLocalSetting(GDRIVE_SAVE_FORMAT_KEY, 'json');
    gdriveDefaultSaveFormatCache = String(raw || '').toLowerCase() === 'pdf' ? 'pdf' : 'json';
    return gdriveDefaultSaveFormatCache;
  }

  function setGdriveDefaultSaveFormat(format) {
    const next = String(format || '').toLowerCase() === 'pdf' ? 'pdf' : 'json';
    gdriveDefaultSaveFormatCache = next;
    writeLocalSetting(GDRIVE_SAVE_FORMAT_KEY, next);
    renderGdriveSaveFormatUi();
    refreshNewNotebookDriveTargetUi();
    return next;
  }

  function renderGdriveSaveFormatUi() {
    const fmt = getGdriveDefaultSaveFormat();
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('#gdriveSaveFormatRow [data-gdrive-global-format]').forEach((btn) => {
        const active = btn.dataset.gdriveGlobalFormat === fmt;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    }
    const hint = typeof document !== 'undefined' ? document.getElementById('gdriveSaveFormatHint') : null;
    if (hint) {
      hint.textContent = fmt === 'pdf'
        ? 'Lisible sur téléphone et ordinateur sans l’application (.pdf)'
        : 'Synchronisable et modifiable dans InkFlow (.inkflow.json)';
    }
  }

  function uint8ArrayToBase64(bytes) {
    if (!bytes || !bytes.length) return '';
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const chunkSize = 0x8000;
    const chunks = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
      const slice = arr.subarray(i, Math.min(i + chunkSize, arr.length));
      chunks.push(String.fromCharCode.apply(null, slice));
    }
    return btoa(chunks.join(''));
  }

  const gdriveSyncState = {
    folderId: null,
    notebooks: {}, // { [nbId]: { driveFileId, lastSyncedHash, lastSyncedAt, remoteModifiedTime } }
    inFlight: false,
    dirtyNotebookIds: new Set(),
    debounceTimer: null,
    lastReport: null
  };

  function loadGdriveSyncMeta() {
    try {
      const raw = readLocalSetting(GDRIVE_SYNC_META_KEY, '');
      if (!raw) return gdriveSyncState;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.folderId === 'string') gdriveSyncState.folderId = parsed.folderId;
        if (parsed.notebooks && typeof parsed.notebooks === 'object') {
          gdriveSyncState.notebooks = { ...parsed.notebooks };
        }
      }
    } catch (_) {}
    return gdriveSyncState;
  }

  function saveGdriveSyncMeta() {
    try {
      writeLocalSetting(GDRIVE_SYNC_META_KEY, JSON.stringify({
        folderId: gdriveSyncState.folderId || null,
        notebooks: gdriveSyncState.notebooks || {}
      }));
    } catch (_) {}
  }

  function resetGdriveSyncMeta() {
    gdriveSyncState.folderId = null;
    gdriveSyncState.notebooks = {};
    gdriveSyncState.dirtyNotebookIds.clear();
    gdriveSyncState.lastReport = null;
    if (gdriveSyncState.debounceTimer) {
      clearTimeout(gdriveSyncState.debounceTimer);
      gdriveSyncState.debounceTimer = null;
    }
    saveGdriveSyncMeta();
  }

  function normalizeNotebookDriveTarget(target, fallbackTitle = 'Cahier') {
    if (!target || typeof target !== 'object') return null;
    const mode = target.mode === 'file' ? 'file' : 'folder';
    const fileId = typeof target.fileId === 'string' && target.fileId.trim() ? target.fileId.trim() : null;
    const folderId = typeof target.folderId === 'string' && target.folderId.trim() ? target.folderId.trim() : 'root';
    const folderPath = typeof target.folderPath === 'string' && target.folderPath.trim() ? target.folderPath.trim() : 'Mon Drive';
    const rawName = typeof target.fileName === 'string' ? target.fileName.trim() : '';
    const format = target.format
      ? (String(target.format).toLowerCase() === 'pdf' ? 'pdf' : 'json')
      : (/\.pdf$/i.test(rawName) ? 'pdf' : 'json');
    const fileName = mode === 'file' && rawName
      ? rawName
      : sanitizeDriveNotebookFilename(rawName, fallbackTitle, format);
    if (mode === 'file' && !fileId) return null;
    return { mode, fileId, fileName, folderId, folderPath, format };
  }

  function resolveEffectiveDriveTargetForNotebook(nb) {
    if (!nb) return null;
    if (nb.driveTarget && typeof nb.driveTarget === 'object') {
      return normalizeNotebookDriveTarget(nb.driveTarget, nb.title);
    }
    if (nb.folderId) {
      const parentFolder = (state.folders || []).find((f) => f.id === nb.folderId && !f.trashedAt);
      if (parentFolder && parentFolder.driveDefaultFolder && parentFolder.driveDefaultFolder.folderId) {
        const inheritedFmt = parentFolder.driveDefaultFolder.format
          ? (String(parentFolder.driveDefaultFolder.format).toLowerCase() === 'pdf' ? 'pdf' : 'json')
          : getGdriveDefaultSaveFormat();
        return {
          mode: 'folder',
          fileId: null,
          fileName: sanitizeDriveNotebookFilename('', nb.title, inheritedFmt),
          folderId: parentFolder.driveDefaultFolder.folderId,
          folderPath: parentFolder.driveDefaultFolder.folderPath || 'Mon Drive',
          format: inheritedFmt,
          inheritedFromFolder: true
        };
      }
    }
    return null;
  }

  function describeNotebookDriveTarget(nb) {
    const eff = resolveEffectiveDriveTargetForNotebook(nb);
    if (!eff) {
      const defFmt = getGdriveDefaultSaveFormat();
      return defFmt === 'pdf' ? 'Automatique (InkFlow/ · PDF)' : 'Automatique (InkFlow/)';
    }
    const fmtSuffix = eff.format === 'pdf' ? ' · PDF' : '';
    if (eff.mode === 'file') {
      return `${eff.folderPath ? `${eff.folderPath} / ` : ''}${eff.fileName}${fmtSuffix}`;
    }
    return `${eff.folderPath || 'Mon Drive'} / ${eff.fileName}${fmtSuffix}`;
  }

  async function setNotebookDriveTarget(notebookId, target, { syncNow = true } = {}) {
    const nb = (state.notebooks || []).find((n) => n.id === notebookId);
    if (!nb) return null;
    loadGdriveSyncMeta();
    const normalized = normalizeNotebookDriveTarget(target, nb.title);
    nb.driveTarget = normalized;
    nb.updatedAt = Date.now();
    // Réinitialise l'état de synchro de ce cahier pour forcer l'écriture vers la nouvelle cible Drive
    delete gdriveSyncState.notebooks[nb.id];
    saveGdriveSyncMeta();
    await db.saveNotebook(nb);

    // Mémorise également le dossier parent Drive par défaut sur le dossier InkFlow contenant ce cahier
    if (normalized && normalized.folderId && nb.folderId) {
      const parentFolder = (state.folders || []).find((f) => f.id === nb.folderId);
      if (parentFolder && !parentFolder.driveDefaultFolder) {
        parentFolder.driveDefaultFolder = {
          folderId: normalized.folderId,
          folderPath: normalized.folderPath || 'Mon Drive'
        };
        await db.saveFolders(state.folders);
      }
    }

    if (typeof renderNotebooksSidebar === 'function') renderNotebooksSidebar();
    if (syncNow && normalized && isGdriveLinked() && isNetworkAvailable()) {
      await syncSingleNotebookWithGoogleDrive(nb.id, { auto: false });
    }
    return normalized;
  }

  async function setFolderDefaultDriveTarget(folderId, folderTarget) {
    const fld = (state.folders || []).find((f) => f.id === folderId);
    if (!fld) return null;
    fld.driveDefaultFolder = (folderTarget && folderTarget.folderId)
      ? { folderId: folderTarget.folderId, folderPath: folderTarget.folderPath || 'Mon Drive' }
      : null;
    fld.updatedAt = Date.now();
    await db.saveFolders(state.folders);
    if (typeof renderNotebooksSidebar === 'function') renderNotebooksSidebar();
    return fld.driveDefaultFolder;
  }

  function promptNotebookDriveTarget(nb, extraOptions = {}) {
    if (!nb) return;
    const cur = resolveEffectiveDriveTargetForNotebook(nb);
    const defaultFmt = extraOptions.defaultFormat || (cur && cur.format) || getGdriveDefaultSaveFormat();
    openDriveTargetPicker({
      pickerTitle: extraOptions.pickerTitle || `Fichier Google Drive — « ${nb.title} »`,
      notebookTitle: nb.title,
      defaultFormat: defaultFmt,
      defaultFileName: cur ? sanitizeDriveNotebookFilename(cur.fileName, nb.title, defaultFmt) : sanitizeDriveNotebookFilename('', nb.title, defaultFmt),
      initialFolderId: cur ? cur.folderId : null,
      initialFolderPath: cur ? cur.folderPath : '',
      onSelect: async (picked) => {
        if (!picked) return;
        await setNotebookDriveTarget(nb.id, picked, { syncNow: true });
        const fmtLabel = picked.format === 'pdf' ? ' (PDF lisible partout)' : ' (InkFlow)';
        showToast(`Cible Drive enregistrée : ${picked.folderPath} / ${picked.fileName}${fmtLabel}`);
      }
    });
  }

  function promptFolderDefaultDriveTarget(folder) {
    if (!folder) return;
    const cur = folder.driveDefaultFolder || null;
    openDriveTargetPicker({
      folderOnly: true,
      pickerTitle: `Dossier Google Drive par défaut — « ${folder.name} »`,
      initialFolderId: cur ? cur.folderId : null,
      initialFolderPath: cur ? cur.folderPath : '',
      onSelect: async (picked) => {
        if (!picked) return;
        await setFolderDefaultDriveTarget(folder.id, picked);
        showToast(`Les nouveaux cahiers de « ${folder.name} » cibleront « ${picked.folderPath} ».`);
      }
    });
  }

  // interface de sélection dans la modale « Nouveau Cahier »
  function prepareNewNotebookDriveTargetUi() {
    const activeFolder = state.currentFolderId
      ? (state.folders || []).find((f) => f.id === state.currentFolderId && !f.trashedAt)
      : null;
    if (activeFolder && activeFolder.driveDefaultFolder && activeFolder.driveDefaultFolder.folderId) {
      state.newNotebookDriveTarget = {
        mode: 'folder',
        fileId: null,
        fileName: '',
        folderId: activeFolder.driveDefaultFolder.folderId,
        folderPath: activeFolder.driveDefaultFolder.folderPath || 'Mon Drive',
        format: activeFolder.driveDefaultFolder.format || getGdriveDefaultSaveFormat(),
        autoFileName: true
      };
    } else {
      state.newNotebookDriveTarget = null;
    }
    refreshNewNotebookDriveTargetUi();
  }

  function refreshNewNotebookDriveTargetUi() {
    const btn = document.getElementById('btnPickNewNotebookDriveTarget');
    const clearBtn = document.getElementById('btnClearNewNotebookDriveTarget');
    const titleEl = document.getElementById('newNotebookDriveTargetTitle');
    const subEl = document.getElementById('newNotebookDriveTargetSub');
    if (!btn || !titleEl || !subEl) return;

    const typedTitle = (dom.inputNotebookName && dom.inputNotebookName.value.trim()) || `Cahier ${(state.notebooks || []).length + 1}`;
    const target = state.newNotebookDriveTarget;
    const activeFolder = state.currentFolderId
      ? (state.folders || []).find((f) => f.id === state.currentFolderId && !f.trashedAt)
      : null;

    if (target) {
      const fmt = target.format === 'pdf' ? 'pdf' : 'json';
      const fmtBadge = fmt === 'pdf' ? 'PDF (lisible mobile/PC)' : 'Format InkFlow (.json)';
      const dispName = target.mode === 'file'
        ? target.fileName
        : (target.autoFileName ? sanitizeDriveNotebookFilename('', typedTitle, fmt) : sanitizeDriveNotebookFilename(target.fileName, typedTitle, fmt));
      btn.classList.add('is-custom');
      if (clearBtn) clearBtn.classList.remove('hidden');
      titleEl.textContent = dispName;
      subEl.textContent = target.mode === 'file'
        ? `Fichier existant (${fmtBadge}) · ${target.folderPath || 'Mon Drive'}`
        : `${fmtBadge} · ${target.folderPath || 'Mon Drive'}`;
    } else {
      const defFmt = getGdriveDefaultSaveFormat();
      const fmtLabel = defFmt === 'pdf' ? 'PDF' : 'InkFlow';
      btn.classList.remove('is-custom');
      if (clearBtn) clearBtn.classList.add('hidden');
      titleEl.textContent = activeFolder
        ? `Automatique (${fmtLabel} · « ${activeFolder.name} » → InkFlow/)`
        : `Emplacement automatique (InkFlow/ · ${fmtLabel})`;
      subEl.textContent = isGdriveLinked()
        ? 'Cliquez pour choisir le dossier, le fichier et le format (.json ou .pdf)'
        : 'Reliez Google Drive ou cliquez pour configurer l’emplacement et le format';
    }
  }

  // Empreinte déterministe rapide (double FNV-1a 32 bits → 16 hex) sur le contenu utile d'un cahier
  function fnv1aDualHex(str) {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= (c + i) & 0xffff;
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  function serializeNotebookForDriveSync(nb, pagesList) {
    const pages = (Array.isArray(pagesList) ? pagesList : (state.pagesByNotebook.get(nb.id) || []))
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((p) => ({
        id: p.id,
        notebookId: nb.id,
        order: p.order || 0,
        title: p.title || '',
        paperType: p.paperType || 'grid',
        paperTone: p.paperTone || 'ivory',
        gridSize: p.gridSize || 28,
        viewMode: p.viewMode || 'infinite',
        pageWidth: p.pageWidth || null,
        pageHeight: p.pageHeight || null,
        pdfId: p.pdfId || null,
        pdfPageNumber: p.pdfPageNumber || null,
        pdfWidth: p.pdfWidth || null,
        pdfHeight: p.pdfHeight || null,
        pdfOriginalWidth: p.pdfOriginalWidth || null,
        pdfOriginalHeight: p.pdfOriginalHeight || null,
        rotation: p.rotation || 0,
        bookmarked: Boolean(p.bookmarked),
        strokes: (p.strokes || []).map((s) => ({
          id: s.id,
          tool: s.tool,
          penStyle: s.penStyle || 'fountain',
          lineStyle: s.lineStyle || 'solid',
          color: s.color,
          size: s.size,
          smoothing: s.smoothing,
          pressureMode: s.pressureMode,
          points: (s.points || []).map((pt) => ({
            x: Math.round(pt.x * 100) / 100,
            y: Math.round(pt.y * 100) / 100,
            pressure: Math.round((pt.pressure ?? 0.5) * 1000) / 1000
          }))
        })),
        shapes: (p.shapes || []).map((sh) => ({ ...sh })),
        texts: (p.texts || []).map((tx) => ({ ...tx })),
        tapes: (p.tapes || []).map((tp) => ({ ...tp })),
        images: (p.images || []).map((im) => ({
          id: im.id, x: im.x, y: im.y, width: im.width, height: im.height, src: im.src
        }))
      }));

    return {
      format: 'inkflow-notebook-sync-v1',
      notebook: {
        id: nb.id,
        title: nb.title || 'Sans titre',
        coverColor: nb.coverColor || '#2563eb',
        coverStyle: nb.coverStyle || 'simple',
        defaultPaperType: nb.defaultPaperType || 'grid',
        folderId: nb.folderId || null,
        starred: Boolean(nb.starred),
        outline: Array.isArray(nb.outline) ? nb.outline : [],
        updatedAt: nb.updatedAt || 0
      },
      pages
    };
  }

  function computeNotebookContentHash(nb, pagesList) {
    if (!nb) return '';
    const payload = serializeNotebookForDriveSync(nb, pagesList);
    const canonical = {
      ...payload,
      notebook: { ...payload.notebook, updatedAt: 0 }
    };
    return fnv1aDualHex(JSON.stringify(canonical));
  }

  async function ensureGdriveInkflowSyncFolderId(actionLabel = 'Synchronisation InkFlow', fetchOpts = {}) {
    loadGdriveSyncMeta();
    if (gdriveSyncState.folderId) return gdriveSyncState.folderId;
    const q = encodeURIComponent(
      `name='${GDRIVE_SYNC_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'me' in owners`
    );
    const listRes = await gdriveFetch(`${GDRIVE_API}/files?q=${q}&fields=files(id,name)`, {}, actionLabel, fetchOpts);
    const listData = await listRes.json();
    if (listData && Array.isArray(listData.files) && listData.files.length > 0) {
      gdriveSyncState.folderId = listData.files[0].id;
      saveGdriveSyncMeta();
      return gdriveSyncState.folderId;
    }
    const createRes = await gdriveFetch(`${GDRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: GDRIVE_SYNC_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    }, actionLabel, fetchOpts);
    const created = await createRes.json();
    gdriveSyncState.folderId = created.id;
    saveGdriveSyncMeta();
    return gdriveSyncState.folderId;
  }

  async function resolveTargetedDriveFileForNotebook(nb, effTarget, fallbackFolderId, actionLabel, fetchOpts) {
    const desiredName = effTarget.fileName || `inkflow-nb-${nb.id}.json`;
    const parentFolderId = (effTarget.folderId && effTarget.folderId !== 'root')
      ? effTarget.folderId
      : (effTarget.folderId === 'root' ? 'root' : fallbackFolderId);

    // 1. Si un fileId précis est déjà connu (fichier existant choisi ou créé lors d'une synchro précédente)
    if (effTarget.fileId) {
      try {
        const res = await gdriveFetch(
          `${GDRIVE_API}/files/${encodeURIComponent(effTarget.fileId)}?supportsAllDrives=true&fields=id,name,trashed,modifiedTime,appProperties`,
          {},
          actionLabel,
          fetchOpts
        );
        const fileMeta = await res.json();
        if (fileMeta && fileMeta.id && !fileMeta.trashed) {
          return {
            remote: fileMeta,
            parentFolderId,
            fileName: fileMeta.name || desiredName
          };
        }
      } catch (err) {
        if (err && (err.code === 'NETWORK' || err.code === 'GDRIVE_AUTH')) throw err;
        // 404 / fichier supprimé sur Drive → on recréera un nouveau fichier dans parentFolderId
      }
    }

    // 2. Recherche s'il existe déjà un fichier portant exactement ce nom dans le dossier Drive ciblé
    const parentClause = parentFolderId === 'root'
      ? "'root' in parents"
      : `'${escapeDriveQueryValue(parentFolderId)}' in parents`;
    const q = encodeURIComponent(
      `name='${escapeDriveQueryValue(desiredName)}' and ${parentClause} and trashed=false`
    );
    const listRes = await gdriveFetch(
      `${GDRIVE_API}/files?q=${q}&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,modifiedTime,appProperties)`,
      {},
      actionLabel,
      fetchOpts
    );
    const listData = await listRes.json();
    const existing = (listData && Array.isArray(listData.files) && listData.files.length > 0) ? listData.files[0] : null;
    return {
      remote: existing,
      parentFolderId,
      fileName: desiredName
    };
  }

  async function uploadOrUpdateNotebookOnDrive(folderId, nb, pages, contentHash, existingDriveFileId, actionLabel, fetchOpts, customFileName = null) {
    const payload = serializeNotebookForDriveSync(nb, pages);
    payload.contentHash = contentHash;
    payload.syncedAt = Date.now();
    const fileName = customFileName || `inkflow-nb-${nb.id}.json`;
    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      appProperties: {
        inkflowSync: '1',
        inkflowFormat: 'json',
        inkflowNbId: String(nb.id),
        inkflowHash: String(contentHash),
        inkflowUpdatedAt: String(nb.updatedAt || Date.now())
      }
    };
    if (!existingDriveFileId && folderId && folderId !== 'root') {
      metadata.parents = [folderId];
    }
    const boundary = '-------inkflowsync314159265';
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n--${boundary}--`;

    const url = existingDriveFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingDriveFileId)}?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,appProperties`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,appProperties';
    const res = await gdriveFetch(url, {
      method: existingDriveFileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    }, actionLabel, fetchOpts);
    return await res.json();
  }

  async function uploadOrUpdateNotebookPdfOnDrive(folderId, nb, pages, contentHash, existingDriveFileId, actionLabel, fetchOpts, customFileName = null) {
    const orderedPages = (Array.isArray(pages) ? pages : (state.pagesByNotebook.get(nb.id) || []))
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const pdfBytes = await buildPdfBytesForPages(orderedPages, { silent: true });
    if (!pdfBytes || !pdfBytes.length) {
      throw new Error('Impossible de générer le PDF du cahier.');
    }
    const fileName = customFileName || sanitizeDriveNotebookFilename('', nb.title || 'Cahier', 'pdf');
    const metadata = {
      name: fileName,
      mimeType: 'application/pdf',
      appProperties: {
        inkflowSync: '1',
        inkflowFormat: 'pdf',
        inkflowNbId: String(nb.id),
        inkflowHash: String(contentHash),
        inkflowUpdatedAt: String(nb.updatedAt || Date.now())
      }
    };
    if (!existingDriveFileId && folderId && folderId !== 'root') {
      metadata.parents = [folderId];
    }
    const boundary = '-------inkflowpdfsync314159265';
    const base64Pdf = uint8ArrayToBase64(pdfBytes);
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Pdf}\r\n--${boundary}--`;

    const url = existingDriveFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingDriveFileId)}?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,appProperties`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,appProperties';
    const res = await gdriveFetch(url, {
      method: existingDriveFileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    }, actionLabel, fetchOpts);
    return await res.json();
  }

  async function downloadNotebookFromDrive(driveFileId, actionLabel, fetchOpts) {
    const res = await gdriveFetch(
      `${GDRIVE_API}/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`,
      {},
      actionLabel,
      fetchOpts
    );
    return await res.json();
  }

  async function applyRemoteNotebookPayloadLocally(remotePayload, { asConflictCopy = false } = {}) {
    if (!remotePayload || !remotePayload.notebook || !Array.isArray(remotePayload.pages)) return null;
    const srcNb = remotePayload.notebook;
    const targetNbId = asConflictCopy ? createUid('nb') : srcNb.id;
    const targetTitle = asConflictCopy ? `${srcNb.title || 'Cahier'} (conflit Drive)` : (srcNb.title || 'Cahier synchronisé');

    const existingNb = !asConflictCopy ? (state.notebooks || []).find((n) => n.id === targetNbId) : null;
    const nbRecord = {
      id: targetNbId,
      title: targetTitle,
      coverColor: srcNb.coverColor || '#2563eb',
      coverStyle: srcNb.coverStyle || 'simple',
      defaultPaperType: srcNb.defaultPaperType || 'grid',
      folderId: srcNb.folderId || (existingNb ? existingNb.folderId : null) || null,
      driveTarget: (!asConflictCopy && existingNb && existingNb.driveTarget) ? existingNb.driveTarget : undefined,
      starred: Boolean(srcNb.starred),
      outline: Array.isArray(srcNb.outline) ? srcNb.outline : [],
      createdAt: srcNb.createdAt || Date.now(),
      updatedAt: srcNb.updatedAt || Date.now()
    };

    const existingIdx = (state.notebooks || []).findIndex((n) => n.id === targetNbId);
    if (existingIdx >= 0) {
      state.notebooks[existingIdx] = { ...state.notebooks[existingIdx], ...nbRecord };
    } else {
      state.notebooks.push(nbRecord);
    }

    const mappedPages = remotePayload.pages.map((p, idx) => ({
      ...p,
      id: asConflictCopy ? createUid('pg') : (p.id || createUid('pg')),
      notebookId: targetNbId,
      order: typeof p.order === 'number' ? p.order : idx,
      updatedAt: p.updatedAt || Date.now()
    }));

    state.pagesByNotebook.set(targetNbId, mappedPages);
    await db.saveNotebook(nbRecord);
    for (const pg of mappedPages) {
      await db.savePage(pg);
    }
    return { notebook: nbRecord, pages: mappedPages };
  }

  function renderGdriveIncrementalSyncSummary(report = gdriveSyncState.lastReport) {
    const el = document.getElementById('gdriveSyncSummary');
    if (!el) return;
    if (!report) {
      el.textContent = `Dossier Google Drive « ${GDRIVE_SYNC_FOLDER_NAME}/ » (ou fichier Drive ciblé par cahier)`;
      return;
    }
    const parts = [];
    if (report.uploaded.length) parts.push(`${report.uploaded.length} envoyé${report.uploaded.length > 1 ? 's' : ''}`);
    if (report.downloaded.length) parts.push(`${report.downloaded.length} téléchargé${report.downloaded.length > 1 ? 's' : ''}`);
    if (report.conflicts.length) parts.push(`${report.conflicts.length} conflit${report.conflicts.length > 1 ? 's' : ''} préservé${report.conflicts.length > 1 ? 's' : ''}`);
    if (!parts.length) parts.push('Tout est déjà à jour');
    const timeStr = new Date(report.at || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    el.textContent = `${parts.join(' · ')} (${timeStr})`;
  }

  async function persistResolvedDriveFileIdOnNotebook(nb, effTarget, driveFileId, driveFileName) {
    if (!nb || !effTarget || !driveFileId) return;
    const nextFormat = effTarget.format === 'pdf' || /\.pdf$/i.test(String(driveFileName || effTarget.fileName || '')) ? 'pdf' : 'json';
    const nextTarget = {
      mode: effTarget.mode || 'file',
      fileId: driveFileId,
      fileName: driveFileName || effTarget.fileName,
      folderId: effTarget.folderId || 'root',
      folderPath: effTarget.folderPath || 'Mon Drive',
      format: nextFormat
    };
    if (
      !nb.driveTarget ||
      nb.driveTarget.fileId !== nextTarget.fileId ||
      nb.driveTarget.fileName !== nextTarget.fileName ||
      nb.driveTarget.format !== nextTarget.format
    ) {
      nb.driveTarget = nextTarget;
      await db.saveNotebook(nb);
    }
  }

  async function syncNotebooksIncrementalWithGoogleDrive(options = {}) {
    const auto = Boolean(options.auto);
    const strategy = options.strategy || 'keep-both'; // 'keep-both' | 'local-wins' | 'remote-wins'
    const onlyNotebookId = options.onlyNotebookId || null;
    const actionLabel = 'Synchronisation Google Drive';

    if (gdriveSyncState.inFlight) return null;
    if (!isGdriveLinked()) {
      if (!auto) showToast('Reliez d’abord un compte Google.', 'error');
      return null;
    }
    if (!isNetworkAvailable()) {
      gdrivePendingAutoBackup = true;
      if (!auto) notifyNetworkRequired(actionLabel);
      return null;
    }

    loadGdriveSyncMeta();
    gdriveSyncState.inFlight = true;
    const fetchOpts = { quiet: auto };
    const report = {
      at: Date.now(),
      folderId: null,
      uploaded: [],
      downloaded: [],
      skipped: [],
      conflicts: []
    };

    try {
      updateGdriveStatusUi('Synchronisation incrémentale Google Drive…', true);
      let defaultFolderId = null;
      const allLocalNotebooks = (state.notebooks || []).filter((n) => !n.trashedAt);
      const localNotebooks = onlyNotebookId
        ? allLocalNotebooks.filter((n) => n.id === onlyNotebookId)
        : allLocalNotebooks;

      const needsDefaultFolder = !onlyNotebookId || localNotebooks.some((nb) => !resolveEffectiveDriveTargetForNotebook(nb));
      const remoteJsonByNbId = new Map();
      const remotePdfByNbId = new Map();
      const globalDefaultFormat = options.format
        ? (String(options.format).toLowerCase() === 'pdf' ? 'pdf' : 'json')
        : getGdriveDefaultSaveFormat();

      if (needsDefaultFolder) {
        defaultFolderId = await ensureGdriveInkflowSyncFolderId(actionLabel, fetchOpts);
        report.folderId = defaultFolderId;
        const listQ = encodeURIComponent(
          `'${defaultFolderId}' in parents and trashed=false and (mimeType='application/json' or mimeType='application/pdf')`
        );
        const listRes = await gdriveFetch(
          `${GDRIVE_API}/files?q=${listQ}&pageSize=200&fields=files(id,name,mimeType,modifiedTime,appProperties)`,
          {},
          actionLabel,
          fetchOpts
        );
        const listData = await listRes.json();
        const remoteFiles = Array.isArray(listData && listData.files) ? listData.files : [];
        for (const rf of remoteFiles) {
          const props = rf.appProperties || {};
          const isPdfRemote = props.inkflowFormat === 'pdf' ||
            String(rf.mimeType || '').toLowerCase() === 'application/pdf' ||
            /\.pdf$/i.test(String(rf.name || ''));
          let nbId = props.inkflowNbId || '';
          if (!nbId && !isPdfRemote && typeof rf.name === 'string') {
            const m = rf.name.match(/^inkflow-nb-(.+)\.json$/);
            if (m) nbId = m[1];
          }
          if (nbId) {
            if (isPdfRemote) remotePdfByNbId.set(nbId, rf);
            else remoteJsonByNbId.set(nbId, rf);
          }
        }
      }

      const localById = new Map(allLocalNotebooks.map((n) => [n.id, n]));
      let localUiChanged = false;

      // 1. Synchronise chaque cahier local vers sa cible précise (ou vers InkFlow/ par défaut) au format choisi (.json ou .pdf)
      for (const nb of localNotebooks) {
        const pages = state.pagesByNotebook.get(nb.id) || [];
        const localHash = computeNotebookContentHash(nb, pages);
        const effTarget = resolveEffectiveDriveTargetForNotebook(nb);
        const targetFormat = (effTarget && effTarget.format) ? effTarget.format : globalDefaultFormat;
        const syncKey = targetFormat === 'pdf' ? `${nb.id}::pdf` : nb.id;
        const prev = gdriveSyncState.notebooks[syncKey] || null;

        let remote = null;
        let targetParentFolderId = defaultFolderId;
        let targetFileName = null;

        if (effTarget) {
          const resolvedTarget = await resolveTargetedDriveFileForNotebook(nb, effTarget, defaultFolderId, actionLabel, fetchOpts);
          remote = resolvedTarget.remote;
          targetParentFolderId = resolvedTarget.parentFolderId;
          targetFileName = resolvedTarget.fileName;
        } else {
          remote = targetFormat === 'pdf'
            ? (remotePdfByNbId.get(nb.id) || null)
            : (remoteJsonByNbId.get(nb.id) || null);
          if (targetFormat === 'pdf') {
            targetFileName = sanitizeDriveNotebookFilename('', nb.title || 'Cahier', 'pdf');
          }
        }

        const remoteHash = (remote && remote.appProperties && remote.appProperties.inkflowHash) || null;

        // Mode PDF : export lisible sur téléphone/PC (flux unidirectionnel local → Drive avec mise à jour en place PATCH)
        if (targetFormat === 'pdf') {
          const needsPdfUpload = !remote || !remoteHash || remoteHash !== localHash || !prev || prev.lastSyncedHash !== localHash;
          if (!needsPdfUpload) {
            gdriveSyncState.notebooks[syncKey] = {
              driveFileId: remote.id,
              format: 'pdf',
              lastSyncedHash: localHash,
              lastSyncedAt: Date.now(),
              remoteModifiedTime: remote.modifiedTime || null
            };
            if (effTarget) await persistResolvedDriveFileIdOnNotebook(nb, effTarget, remote.id, remote.name || targetFileName);
            report.skipped.push(nb.id);
          } else {
            const uploadedPdf = await uploadOrUpdateNotebookPdfOnDrive(
              targetParentFolderId, nb, pages, localHash, remote ? remote.id : null, actionLabel, fetchOpts, targetFileName
            );
            gdriveSyncState.notebooks[syncKey] = {
              driveFileId: uploadedPdf.id,
              format: 'pdf',
              lastSyncedHash: localHash,
              lastSyncedAt: Date.now(),
              remoteModifiedTime: uploadedPdf.modifiedTime || null
            };
            if (effTarget) await persistResolvedDriveFileIdOnNotebook(nb, effTarget, uploadedPdf.id, uploadedPdf.name || targetFileName);
            report.uploaded.push(nb.id);
          }
          continue;
        }

        const isFirstExplicitTargetBind = Boolean(effTarget && !prev && remote);
        const localChanged = !prev || prev.lastSyncedHash !== localHash;
        const remoteChanged = Boolean(remote && !isFirstExplicitTargetBind && (!prev || (remoteHash && remoteHash !== prev.lastSyncedHash)));

        if (!remote) {
          const created = await uploadOrUpdateNotebookOnDrive(
            targetParentFolderId, nb, pages, localHash, null, actionLabel, fetchOpts, targetFileName
          );
          gdriveSyncState.notebooks[syncKey] = {
            driveFileId: created.id,
            format: 'json',
            lastSyncedHash: localHash,
            lastSyncedAt: Date.now(),
            remoteModifiedTime: created.modifiedTime || null
          };
          if (effTarget) await persistResolvedDriveFileIdOnNotebook(nb, effTarget, created.id, created.name || targetFileName);
          report.uploaded.push(nb.id);
        } else if (remoteHash && remoteHash === localHash) {
          gdriveSyncState.notebooks[syncKey] = {
            driveFileId: remote.id,
            format: 'json',
            lastSyncedHash: localHash,
            lastSyncedAt: Date.now(),
            remoteModifiedTime: remote.modifiedTime || null
          };
          if (effTarget) await persistResolvedDriveFileIdOnNotebook(nb, effTarget, remote.id, remote.name || targetFileName);
          report.skipped.push(nb.id);
        } else if (isFirstExplicitTargetBind) {
          // Première liaison explicite d'un cahier vers un fichier Drive choisi : écrit le cahier directement dans ce fichier Drive
          const updated = await uploadOrUpdateNotebookOnDrive(
            targetParentFolderId, nb, pages, localHash, remote.id, actionLabel, fetchOpts, targetFileName
          );
          gdriveSyncState.notebooks[syncKey] = {
            driveFileId: updated.id,
            format: 'json',
            lastSyncedHash: localHash,
            lastSyncedAt: Date.now(),
            remoteModifiedTime: updated.modifiedTime || null
          };
          await persistResolvedDriveFileIdOnNotebook(nb, effTarget, updated.id, updated.name || targetFileName);
          report.uploaded.push(nb.id);
        } else if (localChanged && remoteChanged) {
          const remotePayload = await downloadNotebookFromDrive(remote.id, actionLabel, fetchOpts);
          if (strategy === 'remote-wins') {
            await applyRemoteNotebookPayloadLocally(remotePayload, { asConflictCopy: false });
            const newPages = state.pagesByNotebook.get(nb.id) || [];
            const appliedHash = remoteHash || computeNotebookContentHash(state.notebooks.find((n) => n.id === nb.id), newPages);
            gdriveSyncState.notebooks[syncKey] = {
              driveFileId: remote.id,
              format: 'json',
              lastSyncedHash: appliedHash,
              lastSyncedAt: Date.now(),
              remoteModifiedTime: remote.modifiedTime || null
            };
            report.conflicts.push({ notebookId: nb.id, resolution: 'remote-wins' });
            localUiChanged = true;
          } else if (strategy === 'local-wins') {
            const updated = await uploadOrUpdateNotebookOnDrive(
              targetParentFolderId, nb, pages, localHash, remote.id, actionLabel, fetchOpts, targetFileName
            );
            gdriveSyncState.notebooks[syncKey] = {
              driveFileId: updated.id,
              format: 'json',
              lastSyncedHash: localHash,
              lastSyncedAt: Date.now(),
              remoteModifiedTime: updated.modifiedTime || null
            };
            report.conflicts.push({ notebookId: nb.id, resolution: 'local-wins' });
          } else {
            const copyRes = await applyRemoteNotebookPayloadLocally(remotePayload, { asConflictCopy: true });
            const updated = await uploadOrUpdateNotebookOnDrive(
              targetParentFolderId, nb, pages, localHash, remote.id, actionLabel, fetchOpts, targetFileName
            );
            gdriveSyncState.notebooks[syncKey] = {
              driveFileId: updated.id,
              format: 'json',
              lastSyncedHash: localHash,
              lastSyncedAt: Date.now(),
              remoteModifiedTime: updated.modifiedTime || null
            };
            report.conflicts.push({
              notebookId: nb.id,
              conflictCopyId: copyRes && copyRes.notebook ? copyRes.notebook.id : null,
              resolution: 'keep-both'
            });
            report.uploaded.push(nb.id);
            localUiChanged = true;
          }
        } else if (localChanged) {
          const updated = await uploadOrUpdateNotebookOnDrive(
            targetParentFolderId, nb, pages, localHash, remote.id, actionLabel, fetchOpts, targetFileName
          );
          gdriveSyncState.notebooks[syncKey] = {
            driveFileId: updated.id,
            format: 'json',
            lastSyncedHash: localHash,
            lastSyncedAt: Date.now(),
            remoteModifiedTime: updated.modifiedTime || null
          };
          if (effTarget) await persistResolvedDriveFileIdOnNotebook(nb, effTarget, updated.id, updated.name || targetFileName);
          report.uploaded.push(nb.id);
        } else if (remoteChanged) {
          const remotePayload = await downloadNotebookFromDrive(remote.id, actionLabel, fetchOpts);
          const applied = await applyRemoteNotebookPayloadLocally(remotePayload, { asConflictCopy: false });
          if (applied) {
            const newHash = remoteHash || computeNotebookContentHash(applied.notebook, applied.pages);
            gdriveSyncState.notebooks[syncKey] = {
              driveFileId: remote.id,
              format: 'json',
              lastSyncedHash: newHash,
              lastSyncedAt: Date.now(),
              remoteModifiedTime: remote.modifiedTime || null
            };
            report.downloaded.push(nb.id);
            localUiChanged = true;
          }
        } else {
          report.skipped.push(nb.id);
        }
      }

      // 2. Télécharge les cahiers .json présents uniquement dans InkFlow/ sur Drive (hors synchro unitaire et hors fichiers PDF)
      if (!onlyNotebookId) {
        for (const [remoteNbId, rf] of remoteJsonByNbId.entries()) {
          if (localById.has(remoteNbId)) continue;
          const remotePayload = await downloadNotebookFromDrive(rf.id, actionLabel, fetchOpts);
          const applied = await applyRemoteNotebookPayloadLocally(remotePayload, { asConflictCopy: false });
          if (applied) {
            const newHash = (rf.appProperties && rf.appProperties.inkflowHash) || computeNotebookContentHash(applied.notebook, applied.pages);
            gdriveSyncState.notebooks[remoteNbId] = {
              driveFileId: rf.id,
              format: 'json',
              lastSyncedHash: newHash,
              lastSyncedAt: Date.now(),
              remoteModifiedTime: rf.modifiedTime || null
            };
            report.downloaded.push(remoteNbId);
            localUiChanged = true;
          }
        }
      }

      if (onlyNotebookId) gdriveSyncState.dirtyNotebookIds.delete(onlyNotebookId);
      else gdriveSyncState.dirtyNotebookIds.clear();
      gdriveSyncState.lastReport = report;
      saveGdriveSyncMeta();
      state.gdriveLastSyncAt = report.at;
      gdrivePendingAutoBackup = false;

      if (localUiChanged) {
        invalidateStaticInkCache();
        if (typeof renderNotebooksSidebar === 'function') renderNotebooksSidebar();
        if (typeof renderPagesSidebar === 'function') renderPagesSidebar();
        if (typeof renderDocTabsBar === 'function') renderDocTabsBar();
        if (typeof requestRender === 'function') requestRender();
      }
      renderGdriveAccountUi();
      renderGdriveIncrementalSyncSummary(report);

      if (!auto) {
        const msg = report.conflicts.length > 0
          ? `Synchro Drive terminée (${report.uploaded.length}↑, ${report.downloaded.length}↓, ${report.conflicts.length} conflit conservé).`
          : `Synchro Drive terminée (${report.uploaded.length} envoyé${report.uploaded.length > 1 ? 's' : ''}, ${report.downloaded.length} téléchargé${report.downloaded.length > 1 ? 's' : ''}).`;
        showToast(msg);
      }
      return report;
    } catch (err) {
      renderGdriveAccountUi();
      if (err && err.code === 'NETWORK') {
        gdrivePendingAutoBackup = true;
        return null;
      }
      if (!auto) reportGdriveError(err, actionLabel);
      return null;
    } finally {
      gdriveSyncState.inFlight = false;
    }
  }

  async function syncSingleNotebookWithGoogleDrive(notebookId, options = {}) {
    if (!notebookId) return null;
    return syncNotebooksIncrementalWithGoogleDrive({
      auto: options.auto !== undefined ? Boolean(options.auto) : true,
      strategy: options.strategy || 'keep-both',
      format: options.format || undefined,
      onlyNotebookId: notebookId
    });
  }

  async function saveNotebookToGoogleDriveAsPdf(notebookId = null, targetOverride = null) {
    const nb = notebookId
      ? (state.notebooks || []).find((n) => n.id === notebookId)
      : getActiveNotebook();
    if (!nb) return null;
    if (!isGdriveLinked()) {
      openCloudBackupModal('api');
      showToast('Reliez d’abord un compte Google pour sauvegarder en PDF sur Drive.', 'error');
      return null;
    }
    if (!requireNetwork('Sauvegarder en PDF sur Google Drive')) return null;

    if (targetOverride) {
      await setNotebookDriveTarget(nb.id, { ...targetOverride, format: 'pdf' }, { syncNow: false });
      return await syncSingleNotebookWithGoogleDrive(nb.id, { auto: false, format: 'pdf' });
    }
    return await syncSingleNotebookWithGoogleDrive(nb.id, { auto: false, format: 'pdf' });
  }

  function notifyLocalNotebookMutatedForDriveSync(notebookId) {
    if (!notebookId) return;
    gdriveSyncState.dirtyNotebookIds.add(notebookId);
    const nb = (state.notebooks || []).find((n) => n.id === notebookId);
    const hasExplicitTarget = Boolean(nb && nb.driveTarget);
    if ((!state.gdriveAutoBackup && !hasExplicitTarget) || !isGdriveLinked() || !isNetworkAvailable()) return;
    if (gdriveSyncState.debounceTimer) clearTimeout(gdriveSyncState.debounceTimer);
    gdriveSyncState.debounceTimer = setTimeout(() => {
      gdriveSyncState.debounceTimer = null;
      if (isGdriveLinked() && isNetworkAvailable() && !state.isDrawing) {
        syncNotebooksIncrementalWithGoogleDrive({ auto: true });
      }
    }, GDRIVE_SYNC_DEBOUNCE_MS);
  }
