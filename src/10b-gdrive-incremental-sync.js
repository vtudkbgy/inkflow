  // ============================================================================
  // 18B. SYNCHRONISATION INCRÉMENTALE & SAUVEGARDE AUTO GOOGLE DRIVE (DOSSIER InkFlow/)
  // ============================================================================

  const GDRIVE_SYNC_FOLDER_NAME = 'InkFlow';
  const GDRIVE_SYNC_META_KEY = 'inkflow.gdrive.incrementalSync.v1';
  const GDRIVE_SYNC_DEBOUNCE_MS = 15000;

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
    // updatedAt exclu du hash pour que deux états au contenu strictement identique produisent le même hash
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

  async function uploadOrUpdateNotebookOnDrive(folderId, nb, pages, contentHash, existingDriveFileId, actionLabel, fetchOpts) {
    const payload = serializeNotebookForDriveSync(nb, pages);
    payload.contentHash = contentHash;
    payload.syncedAt = Date.now();
    const fileName = `inkflow-nb-${nb.id}.json`;
    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      appProperties: {
        inkflowSync: '1',
        inkflowNbId: String(nb.id),
        inkflowHash: String(contentHash),
        inkflowUpdatedAt: String(nb.updatedAt || Date.now())
      }
    };
    if (!existingDriveFileId) {
      metadata.parents = [folderId];
    }
    const boundary = '-------inkflowsync314159265';
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n--${boundary}--`;

    const url = existingDriveFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingDriveFileId)}?uploadType=multipart&fields=id,name,modifiedTime,appProperties`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,appProperties';
    const res = await gdriveFetch(url, {
      method: existingDriveFileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    }, actionLabel, fetchOpts);
    return await res.json();
  }

  async function downloadNotebookFromDrive(driveFileId, actionLabel, fetchOpts) {
    const res = await gdriveFetch(
      `${GDRIVE_API}/files/${encodeURIComponent(driveFileId)}?alt=media`,
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

    const nbRecord = {
      id: targetNbId,
      title: targetTitle,
      coverColor: srcNb.coverColor || '#2563eb',
      coverStyle: srcNb.coverStyle || 'simple',
      defaultPaperType: srcNb.defaultPaperType || 'grid',
      folderId: srcNb.folderId || null,
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
      el.textContent = `Dossier Google Drive « ${GDRIVE_SYNC_FOLDER_NAME}/ » — synchronisation incrémentale par cahier`;
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

  async function syncNotebooksIncrementalWithGoogleDrive(options = {}) {
    const auto = Boolean(options.auto);
    const strategy = options.strategy || 'keep-both'; // 'keep-both' | 'local-wins' | 'remote-wins'
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
      const folderId = await ensureGdriveInkflowSyncFolderId(actionLabel, fetchOpts);
      report.folderId = folderId;

      const listQ = encodeURIComponent(
        `'${folderId}' in parents and trashed=false and mimeType='application/json'`
      );
      const listRes = await gdriveFetch(
        `${GDRIVE_API}/files?q=${listQ}&pageSize=200&fields=files(id,name,modifiedTime,appProperties)`,
        {},
        actionLabel,
        fetchOpts
      );
      const listData = await listRes.json();
      const remoteFiles = Array.isArray(listData && listData.files) ? listData.files : [];
      const remoteByNbId = new Map();
      for (const rf of remoteFiles) {
        const props = rf.appProperties || {};
        let nbId = props.inkflowNbId || '';
        if (!nbId && typeof rf.name === 'string') {
          const m = rf.name.match(/^inkflow-nb-(.+)\.json$/);
          if (m) nbId = m[1];
        }
        if (nbId) remoteByNbId.set(nbId, rf);
      }

      const localNotebooks = (state.notebooks || []).filter((n) => !n.trashedAt);
      const localById = new Map(localNotebooks.map((n) => [n.id, n]));
      let localUiChanged = false;

      // 1. Parcourt les cahiers locaux (upload incrémental, pull distant ou résolution de conflit)
      for (const nb of localNotebooks) {
        const pages = state.pagesByNotebook.get(nb.id) || [];
        const localHash = computeNotebookContentHash(nb, pages);
        const prev = gdriveSyncState.notebooks[nb.id] || null;
        const remote = remoteByNbId.get(nb.id) || null;
        const remoteHash = (remote && remote.appProperties && remote.appProperties.inkflowHash) || null;
        const localChanged = !prev || prev.lastSyncedHash !== localHash;
        const remoteChanged = Boolean(remote && (!prev || (remoteHash && remoteHash !== prev.lastSyncedHash)));

        if (!remote) {
          // Jamais présent sur Drive → création
          const created = await uploadOrUpdateNotebookOnDrive(folderId, nb, pages, localHash, null, actionLabel, fetchOpts);
          gdriveSyncState.notebooks[nb.id] = {
            driveFileId: created.id,
            lastSyncedHash: localHash,
            lastSyncedAt: Date.now(),
            remoteModifiedTime: created.modifiedTime || null
          };
          report.uploaded.push(nb.id);
        } else if (remoteHash && remoteHash === localHash) {
          // Déjà identique des deux côtés → 0 transfert
          gdriveSyncState.notebooks[nb.id] = {
            driveFileId: remote.id,
            lastSyncedHash: localHash,
            lastSyncedAt: Date.now(),
            remoteModifiedTime: remote.modifiedTime || null
          };
          report.skipped.push(nb.id);
        } else if (localChanged && remoteChanged) {
          // CONFLIT détecté (modifié localement ET à distance)
          const remotePayload = await downloadNotebookFromDrive(remote.id, actionLabel, fetchOpts);
          if (strategy === 'remote-wins') {
            await applyRemoteNotebookPayloadLocally(remotePayload, { asConflictCopy: false });
            const newPages = state.pagesByNotebook.get(nb.id) || [];
            const appliedHash = remoteHash || computeNotebookContentHash(state.notebooks.find((n) => n.id === nb.id), newPages);
            gdriveSyncState.notebooks[nb.id] = {
              driveFileId: remote.id,
              lastSyncedHash: appliedHash,
              lastSyncedAt: Date.now(),
              remoteModifiedTime: remote.modifiedTime || null
            };
            report.conflicts.push({ notebookId: nb.id, resolution: 'remote-wins' });
            localUiChanged = true;
          } else if (strategy === 'local-wins') {
            const updated = await uploadOrUpdateNotebookOnDrive(folderId, nb, pages, localHash, remote.id, actionLabel, fetchOpts);
            gdriveSyncState.notebooks[nb.id] = {
              driveFileId: updated.id,
              lastSyncedHash: localHash,
              lastSyncedAt: Date.now(),
              remoteModifiedTime: updated.modifiedTime || null
            };
            report.conflicts.push({ notebookId: nb.id, resolution: 'local-wins' });
          } else {
            // 'keep-both' par défaut : sauvegarde une copie locale du cahier distant et pousse la version locale
            const copyRes = await applyRemoteNotebookPayloadLocally(remotePayload, { asConflictCopy: true });
            const updated = await uploadOrUpdateNotebookOnDrive(folderId, nb, pages, localHash, remote.id, actionLabel, fetchOpts);
            gdriveSyncState.notebooks[nb.id] = {
              driveFileId: updated.id,
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
          // Modifié localement uniquement → PATCH en place
          const updated = await uploadOrUpdateNotebookOnDrive(folderId, nb, pages, localHash, remote.id, actionLabel, fetchOpts);
          gdriveSyncState.notebooks[nb.id] = {
            driveFileId: updated.id,
            lastSyncedHash: localHash,
            lastSyncedAt: Date.now(),
            remoteModifiedTime: updated.modifiedTime || null
          };
          report.uploaded.push(nb.id);
        } else if (remoteChanged) {
          // Modifié à distance uniquement → téléchargement incrémental
          const remotePayload = await downloadNotebookFromDrive(remote.id, actionLabel, fetchOpts);
          const applied = await applyRemoteNotebookPayloadLocally(remotePayload, { asConflictCopy: false });
          if (applied) {
            const newHash = remoteHash || computeNotebookContentHash(applied.notebook, applied.pages);
            gdriveSyncState.notebooks[nb.id] = {
              driveFileId: remote.id,
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

      // 2. Télécharge les cahiers présents uniquement sur Drive
      for (const [remoteNbId, rf] of remoteByNbId.entries()) {
        if (localById.has(remoteNbId)) continue;
        const remotePayload = await downloadNotebookFromDrive(rf.id, actionLabel, fetchOpts);
        const applied = await applyRemoteNotebookPayloadLocally(remotePayload, { asConflictCopy: false });
        if (applied) {
          const newHash = (rf.appProperties && rf.appProperties.inkflowHash) || computeNotebookContentHash(applied.notebook, applied.pages);
          gdriveSyncState.notebooks[remoteNbId] = {
            driveFileId: rf.id,
            lastSyncedHash: newHash,
            lastSyncedAt: Date.now(),
            remoteModifiedTime: rf.modifiedTime || null
          };
          report.downloaded.push(remoteNbId);
          localUiChanged = true;
        }
      }

      gdriveSyncState.dirtyNotebookIds.clear();
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

  function notifyLocalNotebookMutatedForDriveSync(notebookId) {
    if (!notebookId) return;
    gdriveSyncState.dirtyNotebookIds.add(notebookId);
    if (!state.gdriveAutoBackup || !isGdriveLinked() || !isNetworkAvailable()) return;
    if (gdriveSyncState.debounceTimer) clearTimeout(gdriveSyncState.debounceTimer);
    gdriveSyncState.debounceTimer = setTimeout(() => {
      gdriveSyncState.debounceTimer = null;
      if (state.gdriveAutoBackup && isGdriveLinked() && isNetworkAvailable() && !state.isDrawing) {
        syncNotebooksIncrementalWithGoogleDrive({ auto: true });
      }
    }, GDRIVE_SYNC_DEBOUNCE_MS);
  }
