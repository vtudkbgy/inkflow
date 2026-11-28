  // ============================================================================
  // 4. STOCKAGE LOCAL INDEXEDDB AVEC FALLBACK MÉMOIRE AUTOMATIQUE
  // ============================================================================

  const DB_NAME = 'PlumeStudioDB';
  const DB_VERSION = 3;
  class NotebookDatabase {
    constructor() {
      this.db = null;
      this.fallbackMode = false;
      this.memNotebooks = new Map();
      this.memPages = new Map();
      this.memPdfs = new Map();
      this.memWorkspace = null;
      this.memFlashcards = new Map();
      this._writeQueue = Promise.resolve();
    }
    _enqueueWrite(taskFn) {
      const next = this._writeQueue.then(() => taskFn(), () => taskFn());
      this._writeQueue = next.catch(() => {});
      return next;
    }
    evictPdfFromRamCache(pdfId) {
      if (!pdfId) return;
      if (!this.fallbackMode && this.db) {
        this.memPdfs.delete(pdfId);
      }
    }
    async open() {
      if (this.fallbackMode) return null;
      if (this.db) return this.db;
      if (typeof indexedDB === 'undefined') {
        this.fallbackMode = true;
        return null;
      }
      try {
        return await new Promise((resolve, reject) => {
          let req;
          try {
            req = indexedDB.open(DB_NAME, DB_VERSION);
          } catch (syncErr) {
            reject(syncErr);
            return;
          }
          req.onblocked = () => {
            // Une autre fenêtre InkFlow garde l'ancienne version de la base ouverte : la mise à niveau attend sa fermeture
            try { if (typeof showToast === 'function') showToast('Ferme les autres fenêtres InkFlow pour terminer la mise à jour des données.', 'error', 'idb-blocked'); } catch (_) {}
          };
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('notebooks')) db.createObjectStore('notebooks', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('pages')) {
              const ps = db.createObjectStore('pages', { keyPath: 'id' });
              ps.createIndex('notebookId', 'notebookId', { unique: false });
            }
            if (!db.objectStoreNames.contains('pdfs')) {
              const pdfStore = db.createObjectStore('pdfs', { keyPath: 'id' });
              pdfStore.createIndex('notebookId', 'notebookId', { unique: false });
            }
            if (!db.objectStoreNames.contains('workspace')) db.createObjectStore('workspace', { keyPath: 'id' });
            // v3 : fiches de révision (image recto/verso + planification de répétition espacée)
            if (!db.objectStoreNames.contains('flashcards')) {
              const fcStore = db.createObjectStore('flashcards', { keyPath: 'id' });
              fcStore.createIndex('notebookId', 'notebookId', { unique: false });
            }
          };
          req.onsuccess = (e) => {
            this.db = e.target.result;
            // Laisse un autre onglet mettre la base à niveau sans rester bloqué sur l'ancienne version
            try {
              this.db.onversionchange = () => {
                try { this.db.close(); } catch (_) {}
                this.db = null;
              };
            } catch (_) {}
            resolve(this.db);
          };
          req.onerror = (e) => reject(e.target.error || new Error('IndexedDB error'));
        });
      } catch (_) {
        this.fallbackMode = true;
        return null;
      }
    }
    async savePdfBinary(pdfRecord) {
      // Stocke le fichier PDF d'origine (ArrayBuffer / Uint8Array) dans un store dédié, séparé des traits vectoriels
      const clonedData = pdfRecord.data instanceof Uint8Array
        ? new Uint8Array(pdfRecord.data).slice()
        : (pdfRecord.data ? new Uint8Array(pdfRecord.data).slice() : new Uint8Array(0));
      const cleanRecord = {
        id: pdfRecord.id,
        notebookId: pdfRecord.notebookId || null,
        fileName: pdfRecord.fileName || 'Document.pdf',
        pageCount: pdfRecord.pageCount || 1,
        data: clonedData,
        createdAt: pdfRecord.createdAt || Date.now()
      };
      this.memPdfs.set(cleanRecord.id, cleanRecord);
      return this._enqueueWrite(async () => {
        await this.open();
        if (this.fallbackMode || !this.db || !this.db.objectStoreNames.contains('pdfs')) return;
        await new Promise((resolve) => {
          try {
            const tx = this.db.transaction('pdfs', 'readwrite');
            tx.objectStore('pdfs').put(cleanRecord);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (_) {
            resolve();
          }
        });
      });
    }
    async getPdfBinary(pdfId) {
      if (!pdfId) return null;
      if (this.memPdfs.has(pdfId)) return this.memPdfs.get(pdfId);
      await this.open();
      if (this.fallbackMode || !this.db || !this.db.objectStoreNames.contains('pdfs')) {
        return this.memPdfs.get(pdfId) || null;
      }
      return new Promise((resolve) => {
        try {
          const req = this.db.transaction('pdfs', 'readonly').objectStore('pdfs').get(pdfId);
          req.onsuccess = () => {
            if (req.result) this.memPdfs.set(pdfId, req.result);
            resolve(req.result || this.memPdfs.get(pdfId) || null);
          };
          req.onerror = () => resolve(this.memPdfs.get(pdfId) || null);
        } catch (_) {
          resolve(this.memPdfs.get(pdfId) || null);
        }
      });
    }
    async deletePdfBinary(pdfId) {
      if (!pdfId) return;
      this.memPdfs.delete(pdfId);
      return this._enqueueWrite(async () => {
        await this.open();
        if (this.fallbackMode || !this.db || !this.db.objectStoreNames.contains('pdfs')) return;
        await new Promise((resolve) => {
          try {
            const tx = this.db.transaction('pdfs', 'readwrite');
            tx.objectStore('pdfs').delete(pdfId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (_) {
            resolve();
          }
        });
      });
    }
    async getAllNotebooks() {
      await this.open();
      if (this.fallbackMode || !this.db) return Array.from(this.memNotebooks.values());
      return new Promise((resolve) => {
        try {
          const req = this.db.transaction('notebooks', 'readonly').objectStore('notebooks').getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve(Array.from(this.memNotebooks.values()));
        } catch (_) {
          resolve(Array.from(this.memNotebooks.values()));
        }
      });
    }
    async getPagesForNotebook(notebookId) {
      await this.open();
      if (this.fallbackMode || !this.db) {
        return Array.from(this.memPages.values()).filter((p) => p.notebookId === notebookId);
      }
      return new Promise((resolve) => {
        try {
          const req = this.db.transaction('pages', 'readonly').objectStore('pages').index('notebookId').getAll(notebookId);
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve(Array.from(this.memPages.values()).filter((p) => p.notebookId === notebookId));
        } catch (_) {
          resolve(Array.from(this.memPages.values()).filter((p) => p.notebookId === notebookId));
        }
      });
    }
    async saveNotebook(notebook) {
      if (!notebook || !notebook.id) return;
      const clonedNb = JSON.parse(JSON.stringify(notebook));
      this.memNotebooks.set(clonedNb.id, clonedNb);
      return this._enqueueWrite(async () => {
        await this.open();
        if (this.fallbackMode || !this.db) return;
        await new Promise((resolve) => {
          try {
            const tx = this.db.transaction('notebooks', 'readwrite');
            tx.objectStore('notebooks').put(clonedNb);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (_) {
            resolve();
          }
        });
      });
    }
    async savePage(page) {
      if (!page || !page.id) return;
      // Capture un instantané profond (deep clone) immédiat pour qu'un changement de page en cours d'écriture ne corrompe jamais la transaction
      const clean = {
        id: page.id,
        notebookId: page.notebookId,
        title: page.title,
        order: page.order,
        paperType: page.paperType,
        paperTone: page.paperTone,
        gridSize: page.gridSize,
        viewMode: page.viewMode || 'infinite',
        pageSize: page.pageSize || null,
        pageOrientation: page.pageOrientation || null,
        pageWidth: (Number.isFinite(page.pageWidth) && page.pageWidth > 0) ? page.pageWidth : null,
        pageHeight: (Number.isFinite(page.pageHeight) && page.pageHeight > 0) ? page.pageHeight : null,
        templateLanguage: page.templateLanguage || null,
        customTemplateDataUrl: page.customTemplateDataUrl || null,
        pdfId: page.pdfId || null,
        pdfPageNumber: page.pdfPageNumber || null,
        pdfWidth: page.pdfWidth || null,
        pdfHeight: page.pdfHeight || null,
        pdfOriginalWidth: page.pdfOriginalWidth || null,
        pdfOriginalHeight: page.pdfOriginalHeight || null,
        strokes: (page.strokes || []).map((s) => ({
          id: s.id,
          tool: s.tool,
          penStyle: s.penStyle || 'fountain',
          lineStyle: s.lineStyle || 'solid',
          color: s.color,
          size: s.size,
          smoothing: s.smoothing,
          pressureMode: s.pressureMode,
          simulatePressure: s.simulatePressure,
          recognizedSymbol: s.recognizedSymbol,
          recognizedGroup: s.recognizedGroup,
          points: Array.isArray(s.points)
            ? s.points.map((pt) => ({
              x: pt.x,
              y: pt.y,
              pressure: pt.pressure,
              tiltX: pt.tiltX || 0,
              tiltY: pt.tiltY || 0
            }))
            : []
        })),
        shapes: JSON.parse(JSON.stringify(page.shapes || [])),
        texts: JSON.parse(JSON.stringify(page.texts || [])),
        tapes: JSON.parse(JSON.stringify(page.tapes || [])),
        images: JSON.parse(JSON.stringify(page.images || [])),
        rotation: page.rotation || 0,
        bookmarked: Boolean(page.bookmarked),
        thumbnail: page.thumbnail || null,
        updatedAt: Date.now()
      };
      this.memPages.set(clean.id, clean);
      return this._enqueueWrite(async () => {
        await this.open();
        if (this.fallbackMode || !this.db) return;
        await new Promise((resolve) => {
          try {
            const tx = this.db.transaction('pages', 'readwrite');
            tx.objectStore('pages').put(clean);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (_) {
            resolve();
          }
        });
      });
    }
    async deletePage(pageId) {
      this.memPages.delete(pageId);
      await this.open();
      if (this.fallbackMode || !this.db) return;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction('pages', 'readwrite');
          tx.objectStore('pages').delete(pageId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (_) {
          resolve();
        }
      });
    }
    async deleteNotebook(notebookId, keepPdfIds = null) {
      const nb = this.memNotebooks.get(notebookId);
      this.memNotebooks.delete(notebookId);
      const pdfIdsToDelete = new Set();
      if (nb && nb.pdfId) pdfIdsToDelete.add(nb.pdfId);
      for (const [pid, pg] of this.memPages.entries()) {
        if (pg.notebookId === notebookId) {
          if (pg.pdfId) pdfIdsToDelete.add(pg.pdfId);
          this.memPages.delete(pid);
        }
      }
      for (const [pdfId, rec] of this.memPdfs.entries()) {
        if (rec.notebookId === notebookId) pdfIdsToDelete.add(pdfId);
      }
      const isKept = (id) => Boolean(keepPdfIds && keepPdfIds.has(id));
      for (const pdfId of pdfIdsToDelete) { if (!isKept(pdfId)) this.memPdfs.delete(pdfId); }
      await this.open();
      if (this.fallbackMode || !this.db) return;
      const pages = await this.getPagesForNotebook(notebookId);
      pages.forEach((p) => { if (p.pdfId) pdfIdsToDelete.add(p.pdfId); });
      if (keepPdfIds) keepPdfIds.forEach((id) => pdfIdsToDelete.delete(id));
      return new Promise((resolve) => {
        try {
          const stores = this.db.objectStoreNames.contains('pdfs') ? ['notebooks', 'pages', 'pdfs'] : ['notebooks', 'pages'];
          const tx = this.db.transaction(stores, 'readwrite');
          tx.objectStore('notebooks').delete(notebookId);
          const ps = tx.objectStore('pages');
          pages.forEach((p) => ps.delete(p.id));
          if (stores.includes('pdfs')) {
            const pdfOs = tx.objectStore('pdfs');
            pdfIdsToDelete.forEach((id) => pdfOs.delete(id));
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (_) {
          resolve();
        }
      });
    }
    async getAllFlashcards() {
      await this.open();
      const memList = () => Array.from(this.memFlashcards.values());
      if (this.fallbackMode || !this.db || !this.db.objectStoreNames.contains('flashcards')) return memList();
      return new Promise((resolve) => {
        try {
          const req = this.db.transaction('flashcards', 'readonly').objectStore('flashcards').getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve(memList());
        } catch (_) {
          resolve(memList());
        }
      });
    }
    async saveFlashcard(card) {
      if (!card || !card.id) return;
      const cloned = JSON.parse(JSON.stringify(card));
      this.memFlashcards.set(cloned.id, cloned);
      return this._enqueueWrite(async () => {
        await this.open();
        if (this.fallbackMode || !this.db || !this.db.objectStoreNames.contains('flashcards')) return;
        await new Promise((resolve) => {
          try {
            const tx = this.db.transaction('flashcards', 'readwrite');
            tx.objectStore('flashcards').put(cloned);
            // Écrite sur disque : inutile de garder une seconde copie des images en RAM
            tx.oncomplete = () => { this.memFlashcards.delete(cloned.id); resolve(); };
            tx.onerror = () => resolve();
          } catch (_) {
            resolve();
          }
        });
      });
    }
    async deleteFlashcard(cardId) {
      if (!cardId) return;
      this.memFlashcards.delete(cardId);
      return this._enqueueWrite(async () => {
        await this.open();
        if (this.fallbackMode || !this.db || !this.db.objectStoreNames.contains('flashcards')) return;
        await new Promise((resolve) => {
          try {
            const tx = this.db.transaction('flashcards', 'readwrite');
            tx.objectStore('flashcards').delete(cardId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (_) {
            resolve();
          }
        });
      });
    }
    async saveWorkspaceState(st) {
      this.memWorkspace = { id: 'current', ...st };
      await this.open();
      if (this.fallbackMode || !this.db) return;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put({ id: 'current', ...st });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (_) {
          resolve();
        }
      });
    }
    async getWorkspaceState() {
      await this.open();
      if (this.fallbackMode || !this.db) return this.memWorkspace;
      return new Promise((resolve) => {
        try {
          const req = this.db.transaction('workspace', 'readonly').objectStore('workspace').get('current');
          req.onsuccess = () => resolve(req.result || this.memWorkspace);
          req.onerror = () => resolve(this.memWorkspace);
        } catch (_) {
          resolve(this.memWorkspace);
        }
      });
    }
    async saveFolders(folders) {
      const cloned = JSON.parse(JSON.stringify(folders || []));
      this.memFolders = cloned;
      await this.open();
      if (this.fallbackMode || !this.db) return;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put({ id: 'folders', items: cloned });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (_) {
          resolve();
        }
      });
    }
    async getFolders() {
      await this.open();
      if (this.fallbackMode || !this.db) return this.memFolders || [];
      return new Promise((resolve) => {
        try {
          const req = this.db.transaction('workspace', 'readonly').objectStore('workspace').get('folders');
          req.onsuccess = () => resolve((req.result && Array.isArray(req.result.items)) ? req.result.items : (this.memFolders || []));
          req.onerror = () => resolve(this.memFolders || []);
        } catch (_) {
          resolve(this.memFolders || []);
        }
      });
    }
  }

  const db = new NotebookDatabase();
  const createUid = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // ============================================================================
  // 5. CAHIER DE DÉMONSTRATION (ÉQUATION MANUSCRITE + BLOCS CLAVIER & LATEX)
  // ============================================================================

  function createHandwrittenEquationStrokes(ox, oy) {
    // Génère les traits manuscrits de l'équation "x^2 + 2x = 0" pour tester immédiatement la reconnaissance !
    return [
      // 'x' (2 traits croisés)
      {
        id: createUid('st'), tool: 'pen', color: '#1e293b', size: 4.5, smoothing: 0.65, pressureMode: 'dynamic',
        recognizedSymbol: 'x', recognizedGroup: 'g_x1',
        points: [{ x: ox + 0, y: oy + 14, pressure: 0.4 }, { x: ox + 14, y: oy + 28, pressure: 0.75 }, { x: ox + 28, y: oy + 42, pressure: 0.5 }]
      },
      {
        id: createUid('st'), tool: 'pen', color: '#1e293b', size: 4.5, smoothing: 0.65, pressureMode: 'dynamic',
        recognizedSymbol: 'x', recognizedGroup: 'g_x1',
        points: [{ x: ox + 28, y: oy + 14, pressure: 0.4 }, { x: ox + 14, y: oy + 28, pressure: 0.75 }, { x: ox + 0, y: oy + 42, pressure: 0.5 }]
      },
      // '^2' (exposant en haut à droite de x)
      {
        id: createUid('st'), tool: 'pen', color: '#1e293b', size: 3.8, smoothing: 0.65, pressureMode: 'dynamic',
        recognizedSymbol: '2', recognizedGroup: 'g_exp2',
        points: [
          { x: ox + 36, y: oy + 4, pressure: 0.4 }, { x: ox + 45, y: oy + 0, pressure: 0.65 },
          { x: ox + 50, y: oy + 7, pressure: 0.7 }, { x: ox + 36, y: oy + 18, pressure: 0.75 },
          { x: ox + 52, y: oy + 18, pressure: 0.5 }
        ]
      },
      // '+' (2 traits)
      {
        id: createUid('st'), tool: 'pen', color: '#1d4ed8', size: 4.5, smoothing: 0.65, pressureMode: 'dynamic',
        recognizedSymbol: '+', recognizedGroup: 'g_plus',
        points: [{ x: ox + 78, y: oy + 15, pressure: 0.5 }, { x: ox + 78, y: oy + 39, pressure: 0.7 }]
      },
      {
        id: createUid('st'), tool: 'pen', color: '#1d4ed8', size: 4.5, smoothing: 0.65, pressureMode: 'dynamic',
        recognizedSymbol: '+', recognizedGroup: 'g_plus',
        points: [{ x: ox + 66, y: oy + 27, pressure: 0.5 }, { x: ox + 90, y: oy + 27, pressure: 0.7 }]
      },
      // '2'
      {
        id: createUid('st'), tool: 'pen', color: '#1e293b', size: 4.5, smoothing: 0.65, pressureMode: 'dynamic',
        recognizedSymbol: '2', recognizedGroup: 'g_coef2',
        points: [
          { x: ox + 108, y: oy + 16, pressure: 0.45 }, { x: ox + 120, y: oy + 11, pressure: 0.7 },
          { x: ox + 128, y: oy + 20, pressure: 0.75 }, { x: ox + 108, y: oy + 41, pressure: 0.8 },
          { x: ox + 130, y: oy + 41, pressure: 0.5 }
        ]
      },
      // 'x'
      {
        id: createUid('st'), tool: 'pen', color: '#1e293b', size: 4.5, smoothing: 0.65, pressureMode: 'dynamic',
        recognizedSymbol: 'x', recognizedGroup: 'g_x2',
        points: [{ x: ox + 140, y: oy + 16, pressure: 0.45 }, { x: ox + 164, y: oy + 41, pressure: 0.7 }]
      },
      {
        id: createUid('st'), tool: 'pen', color: '#1e293b', size: 4.5, smoothing: 0.65, pressureMode: 'dynamic',
        recognizedSymbol: 'x', recognizedGroup: 'g_x2',
        points: [{ x: ox + 164, y: oy + 16, pressure: 0.45 }, { x: ox + 140, y: oy + 41, pressure: 0.7 }]
      },
      // '='
      {
        id: createUid('st'), tool: 'pen', color: '#1d4ed8', size: 4.5, smoothing: 0.65, pressureMode: 'dynamic',
        recognizedSymbol: '=', recognizedGroup: 'g_eq',
        points: [{ x: ox + 184, y: oy + 22, pressure: 0.55 }, { x: ox + 208, y: oy + 22, pressure: 0.65 }]
      },
      {
        id: createUid('st'), tool: 'pen', color: '#1d4ed8', size: 4.5, smoothing: 0.65, pressureMode: 'dynamic',
        recognizedSymbol: '=', recognizedGroup: 'g_eq',
        points: [{ x: ox + 184, y: oy + 33, pressure: 0.55 }, { x: ox + 208, y: oy + 33, pressure: 0.65 }]
      },
      // '0'
      {
        id: createUid('st'), tool: 'pen', color: '#1e293b', size: 4.5, smoothing: 0.65, pressureMode: 'dynamic',
        recognizedSymbol: '0', recognizedGroup: 'g_zero',
        points: [
          { x: ox + 236, y: oy + 12, pressure: 0.5 }, { x: ox + 224, y: oy + 26, pressure: 0.75 },
          { x: ox + 236, y: oy + 41, pressure: 0.8 }, { x: ox + 248, y: oy + 26, pressure: 0.7 },
          { x: ox + 236, y: oy + 12, pressure: 0.5 }
        ]
      }
    ];
  }

  function createDemoNotebookAndPages() {
    const nbId = 'nb_demo_architecture';
    const notebook = {
      id: nbId,
      title: 'Maths, LaTeX & Notes Infinies',
      coverColor: '#2563eb',
      defaultPaperType: 'grid',
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now()
    };

    const eqStrokes = createHandwrittenEquationStrokes(86, 420);

    const page1 = {
      id: 'page_demo_1',
      notebookId: nbId,
      title: '1. Canevas Infini, LaTeX & ICR',
      order: 0,
      paperType: 'grid',
      paperTone: 'ivory',
      gridSize: 28,
      viewMode: 'infinite',
      strokes: [
        {
          id: createUid('st'),
          tool: 'highlighter',
          color: '#facc15',
          size: 22,
          smoothing: 0.8,
          pressureMode: 'uniform',
          points: [{ x: 76, y: 400, pressure: 0.5 }, { x: 220, y: 400, pressure: 0.5 }, { x: 350, y: 400, pressure: 0.5 }]
        },
        ...eqStrokes
      ],
      shapes: [
        { id: createUid('sh'), type: 'rect', x1: 68, y1: 380, x2: 368, y2: 485, color: '#7c3aed', size: 2.5, filled: true },
        { id: createUid('sh'), type: 'arrow', x1: 378, y1: 432, x2: 438, y2: 432, color: '#7c3aed', size: 3, filled: false }
      ],
      texts: [
        {
          id: createUid('tx'),
          x: 68,
          y: 52,
          width: 680,
          text: "Plume Studio Pro — Page Infinie, Clavier & LaTeX\n• Pincez à 2 doigts (ou Ctrl+Molette / bouton « ∞ Étendre ») pour dézoomer et étendre la page à l'infini.\n• Cliquez sur n'importe quel emplacement de texte pour écrire au clavier, ou ajoutez-en avec « Zone Texte (T) ».",
          color: '#1e293b',
          fontSize: 16,
          style: 'card',
          isLatex: false
        },
        {
          id: createUid('tx'),
          x: 68,
          y: 196,
          width: 340,
          text: "\\int_{0}^{+\\infty} e^{-x^{2}} dx = \\frac{\\sqrt{\\pi}}{2}",
          color: '#4c1d95',
          fontSize: 19,
          style: 'latex',
          isLatex: true
        },
        {
          id: createUid('tx'),
          x: 435,
          y: 196,
          width: 340,
          text: "x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}",
          color: '#1e3a8a',
          fontSize: 18,
          style: 'latex',
          isLatex: true
        },
        {
          id: createUid('tx'),
          x: 452,
          y: 392,
          width: 325,
          text: "👈 Équation manuscrite tracée au stylet !\nCliquez sur « ✨ Reconnaître » en haut (ou entourez vos traits au Lasso) pour la convertir en LaTeX : $x^{2} + 2x = 0$",
          color: '#1e293b',
          fontSize: 14,
          style: 'sticky',
          isLatex: false
        }
      ],
      updatedAt: Date.now()
    };

    const page2 = {
      id: 'page_demo_2',
      notebookId: nbId,
      title: '2. Grands Carreaux Seyès',
      order: 1,
      paperType: 'seyes',
      paperTone: 'ivory',
      gridSize: 32,
      viewMode: 'infinite',
      strokes: [],
      shapes: [],
      texts: [
        {
          id: createUid('tx'),
          x: 145,
          y: 64,
          width: 560,
          text: "Cahier Grands Carreaux Seyès & Formules : $\\sum_{n=1}^{\\infty} \\frac{1}{n^{2}} = \\frac{\\pi^{2}}{6}$",
          color: '#1d4ed8',
          fontSize: 18,
          style: 'card',
          isLatex: false
        }
      ],
      updatedAt: Date.now()
    };

    return { notebooks: [notebook], pages: [page1, page2] };
  }

