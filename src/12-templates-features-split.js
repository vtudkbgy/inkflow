  // ============================================================================
  // BIBLIOTHÈQUE DE MODÈLES DE PAGE & COUVERTURES STYLE GOODNOTES 6 (ANALYSE REA)
  // ============================================================================
  const GN_CUSTOM_TEMPLATES_STORAGE_KEY = 'inkflow_gn_custom_templates_v1';

  const GN_PAGE_SIZE_PRESETS = [
    { id: 'goodnotes_standard', label: 'Standard', width: 834, height: 1079, meta: '834 × 1079' },
    { id: 'a4', label: 'A4', width: 1091, height: 1543, meta: '210 × 297 mm' },
    { id: 'a5', label: 'A5', width: 769, height: 1091, meta: '148 × 210 mm' },
    { id: 'a6', label: 'A6', width: 546, height: 769, meta: '105 × 148 mm' },
    { id: 'a7', label: 'A7', width: 385, height: 546, meta: '74 × 105 mm' },
    { id: 'a3', label: 'A3', width: 1543, height: 2183, meta: '297 × 420 mm' },
    { id: 'letter', label: 'Lettre', width: 1122, height: 1452, meta: 'US Letter' },
    { id: 'tabloid', label: 'Tabloïd', width: 1452, height: 2244, meta: 'US Tabloid' },
    { id: 'infinite', label: 'Page infinie', width: PAGE_WIDTH, height: PAGE_HEIGHT, meta: '∞ Illimitée', isInfinite: true }
  ];

  const GN_PAPER_TONE_OPTIONS = [
    { id: 'white', label: 'Papier blanc', swatch: '#ffffff' },
    { id: 'ivory', label: 'Papier jaune', swatch: '#fbf6dc' },
    { id: 'dark', label: 'Papier sombre', swatch: '#14171f' },
    { id: 'sepia', label: 'Parchemin', swatch: '#f5eedc' },
    { id: 'blueprint', label: 'Blueprint', swatch: '#0d2847' },
    { id: 'all', label: 'Tous les papiers', swatch: 'conic-gradient(#ffffff 0deg 120deg, #fbf6dc 120deg 240deg, #1e293b 240deg 360deg)' }
  ];

  const GN_TEMPLATE_LANGUAGES = [
    { id: 'fr', label: 'Français' },
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Español' },
    { id: 'de', label: 'Deutsch' }
  ];

  const GN_PAPER_TEMPLATE_GROUPS = [
    {
      id: 'essentials',
      title: 'Basique',
      items: [
        { id: 'blank', label: 'Vierge' },
        { id: 'dotted', label: 'Papier à pointillés' },
        { id: 'ruled-narrow', label: 'Interligne étroit' },
        { id: 'lined', label: 'Interligne large' },
        { id: 'grid', label: 'Papier quadrillé' },
        { id: 'seyes', label: 'Seyès (Grands carreaux)' },
        { id: 'engineering', label: 'Millimétré' },
        { id: 'isometric', label: 'Isométrique 3D' }
      ]
    },
    {
      id: 'writing_papers',
      title: 'Papier à lettres',
      items: [
        { id: 'cornell', label: 'Cornell' },
        { id: 'legal', label: 'Legal' },
        { id: 'single-column', label: 'Une colonne' },
        { id: 'single-column-mix', label: 'Une colonne, mélange' },
        { id: 'three-column', label: 'Trois colonnes' },
        { id: 'twocolumn', label: 'Deux colonnes' },
        { id: 'two-column-left', label: 'Deux colonnes, gauche' },
        { id: 'two-column-right', label: 'Deux colonnes, droite' }
      ]
    },
    {
      id: 'planner',
      title: 'Planning',
      items: [
        { id: 'todos', label: 'Listes de tâches' },
        { id: 'planner', label: 'Semainier A' },
        { id: 'weekly-planner-b', label: 'Semainier B' },
        { id: 'monthly-planner-b', label: 'Planning mensuel B' },
        { id: 'monthly-planner-c', label: 'Planning mensuel C' },
        { id: 'accounting', label: 'Comptabilité' }
      ]
    },
    {
      id: 'music',
      title: 'Musique',
      items: [
        { id: 'music', label: 'Papier à musique' },
        { id: 'guitar-score', label: 'Partition de guitare' },
        { id: 'guitar-tablature', label: 'Tablature de guitare' }
      ]
    }
  ];

  const GN_COVER_TEMPLATE_GROUPS = [
    {
      id: 'common',
      title: 'Courant',
      items: [
        { id: 'no-cover', label: 'Pas de couverture', coverColor: '#e2e8f0', style: 'none' }
      ]
    },
    {
      id: 'simple',
      title: 'Simple',
      items: [
        { id: 'simple', label: 'Simple', coverColor: '#f5efe6', accent: '#d6c7b2', style: 'simple' },
        { id: 'simple-blue', label: 'Simple bleu', coverColor: '#2563eb', accent: '#93c5fd', style: 'simple' },
        { id: 'simple-green', label: 'Simple vert', coverColor: '#0f766e', accent: '#5eead4', style: 'simple' },
        { id: 'simple-pink', label: 'Simple rose', coverColor: '#db2777', accent: '#f9a8d4', style: 'simple' },
        { id: 'simple-red', label: 'Simple rouge', coverColor: '#be123c', accent: '#fda4af', style: 'simple' },
        { id: 'simple-black', label: 'Simple noir', coverColor: '#1e293b', accent: '#94a3b8', style: 'simple' },
        { id: 'simple-allblack', label: 'Simple noir intégral', coverColor: '#0f172a', accent: '#334155', style: 'simple' }
      ]
    },
    {
      id: 'solid',
      title: 'Uni',
      items: [
        { id: 'solid-white', label: 'Uni blanc', coverColor: '#f8fafc', style: 'solid' },
        { id: 'solid-yellow', label: 'Uni jaune', coverColor: '#f59e0b', style: 'solid' },
        { id: 'solid-babyblue', label: 'Uni bleu pastel', coverColor: '#60a5fa', style: 'solid' },
        { id: 'solid-blue', label: 'Uni bleu', coverColor: '#0072ce', style: 'solid' },
        { id: 'solid-teal', label: 'Uni bleu canard', coverColor: '#0d9488', style: 'solid' },
        { id: 'solid-green', label: 'Uni vert', coverColor: '#16a34a', style: 'solid' },
        { id: 'solid-pink', label: 'Uni rose', coverColor: '#ec4899', style: 'solid' },
        { id: 'solid-red', label: 'Uni rouge', coverColor: '#dc2626', style: 'solid' },
        { id: 'solid-grey', label: 'Uni gris', coverColor: '#475569', style: 'solid' }
      ]
    },
    {
      id: 'black_and_white',
      title: 'Noir et blanc',
      items: [
        { id: 'bw-geometric', label: 'Géométrique', coverColor: '#1e293b', style: 'bw-geo' },
        { id: 'bw-lines', label: 'Lignes', coverColor: '#334155', style: 'bw-lines' },
        { id: 'bw-waves', label: 'Ondulations', coverColor: '#1f2937', style: 'bw-waves' },
        { id: 'bw-waves-black', label: 'Ondulations noires', coverColor: '#0f172a', style: 'bw-waves-dark' },
        { id: 'bw-dots', label: 'Cercle et points', coverColor: '#374151', style: 'bw-dots' },
        { id: 'bw-math', label: 'Maths', coverColor: '#1e293b', style: 'bw-math' }
      ]
    },
    {
      id: 'patterns',
      title: 'Motifs',
      items: [
        { id: 'pat-fluid', label: 'Fluide', coverColor: '#2563eb', accent: '#38bdf8', style: 'pat-fluid' },
        { id: 'pat-soft', label: 'Pastel', coverColor: '#8b5cf6', accent: '#f472b6', style: 'pat-soft' },
        { id: 'pat-brushes', label: 'Pinceaux', coverColor: '#0ea5e9', accent: '#6366f1', style: 'pat-brushes' },
        { id: 'pat-waves', label: 'Vagues', coverColor: '#0f766e', accent: '#2dd4bf', style: 'pat-waves' },
        { id: 'pat-zigzag', label: 'Zigzag', coverColor: '#b45309', accent: '#fbbf24', style: 'pat-zigzag' }
      ]
    }
  ];

  const gnTemplateModalState = {
    open: false,
    mode: 'page', // 'page' | 'new-notebook'
    onApplyNewNotebook: null,
    coverTouchedInPicker: false,
    activeTab: 'paper', // 'paper' | 'cover'
    editMode: false,
    sizeId: 'goodnotes_standard',
    toneId: 'white',
    language: 'fr',
    orientation: 'portrait', // 'portrait' | 'landscape'
    scope: 'current', // 'current' | 'all'
    gridSize: 28,
    selectedPaperId: 'lined',
    selectedCustomDataUrl: null,
    selectedCoverId: 'simple-blue',
    collapsedSections: new Set(),
    selectedForDeletion: new Set(), // templateIds or groupIds
    importTargetGroupId: null,
    openDropdown: null, // 'size' | 'color' | 'lang' | 'scope' | null
    customStore: {
      groups: [{ id: 'my-templates', title: 'Mes modèles', type: 'paper' }],
      templates: [] // { id, groupId, type: 'paper'|'cover', label, dataUrl, orientation }
    }
  };

  function loadGnCustomTemplatesStore() {
    try {
      const raw = localStorage.getItem(GN_CUSTOM_TEMPLATES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.groups) && Array.isArray(parsed.templates)) {
        gnTemplateModalState.customStore = parsed;
      }
    } catch (_) {}
  }

  function saveGnCustomTemplatesStore() {
    try {
      localStorage.setItem(GN_CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(gnTemplateModalState.customStore));
    } catch (_) {}
  }

  function getGnTemplateLibraryState() {
    return { ...gnTemplateModalState };
  }

  function getPageDimensionsForSizeAndOrientation(sizeId, orientation) {
    const preset = GN_PAGE_SIZE_PRESETS.find((s) => s.id === sizeId) || GN_PAGE_SIZE_PRESETS[0];
    if (preset.isInfinite) {
      return { width: PAGE_WIDTH, height: PAGE_HEIGHT, viewMode: 'infinite' };
    }
    const isLandscape = orientation === 'landscape';
    const w = isLandscape ? Math.max(preset.width, preset.height) : Math.min(preset.width, preset.height);
    const h = isLandscape ? Math.min(preset.width, preset.height) : Math.max(preset.width, preset.height);
    return { width: w, height: h, viewMode: 'page' };
  }

  function renderGnPaperThumbnail(canvas, tplItem, toneId, orientation, language, gridSize) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const isLand = orientation === 'landscape';
    const cssW = isLand ? 138 : 106;
    const cssH = isLand ? 100 : 138;
    const dpr = 2;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const tctx = canvas.getContext('2d');
    if (!tctx) return;

    const previewTone = toneId === 'all' ? 'white' : (toneId || 'white');
    const virtualW = isLand ? 1079 : 834;
    const virtualH = isLand ? 834 : 1079;
    const scaleX = canvas.width / virtualW;
    const scaleY = canvas.height / virtualH;

    tctx.save();
    tctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    const mockPage = {
      paperType: tplItem.id,
      paperTone: previewTone,
      gridSize: Math.max(18, gridSize || 28),
      viewMode: 'page',
      pageWidth: virtualW,
      pageHeight: virtualH,
      templateLanguage: language || 'fr',
      customTemplateDataUrl: tplItem.dataUrl || null
    };
    drawPaperBackground(tctx, mockPage, virtualW, virtualH, true, true);
    tctx.restore();
  }

  function renderGnCoverThumbnail(canvas, coverItem, orientation) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const isLand = orientation === 'landscape';
    const cssW = isLand ? 138 : 106;
    const cssH = isLand ? 100 : 138;
    const dpr = 2;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const tctx = canvas.getContext('2d');
    if (!tctx) return;
    const w = canvas.width;
    const h = canvas.height;
    tctx.clearRect(0, 0, w, h);

    if (coverItem.dataUrl) {
      const img = getCustomTemplateImage(coverItem.dataUrl);
      if (img) {
        tctx.drawImage(img, 0, 0, w, h);
        return;
      }
    }

    if (coverItem.style === 'none') {
      tctx.fillStyle = '#f8fafc';
      tctx.fillRect(0, 0, w, h);
      tctx.strokeStyle = '#cbd5e1';
      tctx.lineWidth = 3;
      tctx.setLineDash([8, 6]);
      tctx.strokeRect(8, 8, w - 16, h - 16);
      tctx.setLineDash([]);
      tctx.beginPath();
      tctx.moveTo(24, h - 24);
      tctx.lineTo(w - 24, 24);
      tctx.strokeStyle = '#94a3b8';
      tctx.lineWidth = 3;
      tctx.stroke();
      return;
    }

    const base = coverItem.coverColor || '#2563eb';
    const acc = coverItem.accent || '#93c5fd';

    if (coverItem.style && coverItem.style.startsWith('bw-')) {
      const darkBg = coverItem.style === 'bw-waves-dark';
      tctx.fillStyle = darkBg ? '#111827' : '#ffffff';
      tctx.fillRect(0, 0, w, h);
      tctx.strokeStyle = darkBg ? 'rgba(255,255,255,0.65)' : '#1e293b';
      tctx.fillStyle = darkBg ? 'rgba(255,255,255,0.65)' : '#1e293b';
      tctx.lineWidth = 2.5;
      if (coverItem.style === 'bw-geo') {
        for (let y = 20; y < h; y += 38) {
          for (let x = 20; x < w; x += 38) {
            tctx.strokeRect(x, y, 22, 22);
          }
        }
      } else if (coverItem.style === 'bw-lines') {
        for (let y = 18; y < h; y += 16) {
          tctx.beginPath(); tctx.moveTo(16, y); tctx.lineTo(w - 16, y); tctx.stroke();
        }
      } else if (coverItem.style === 'bw-waves' || coverItem.style === 'bw-waves-dark') {
        for (let y = 24; y < h; y += 22) {
          tctx.beginPath();
          for (let x = 0; x <= w; x += 12) {
            const wy = y + Math.sin(x * 0.08 + y) * 7;
            if (x === 0) tctx.moveTo(x, wy); else tctx.lineTo(x, wy);
          }
          tctx.stroke();
        }
      } else if (coverItem.style === 'bw-dots') {
        for (let y = 26; y < h; y += 34) {
          for (let x = 26; x < w; x += 34) {
            tctx.beginPath(); tctx.arc(x, y, 7, 0, Math.PI * 2); tctx.fill();
          }
        }
      } else if (coverItem.style === 'bw-math') {
        tctx.font = '700 22px Georgia, serif';
        const syms = ['∑', 'π', '∫', '√', '∞', 'Δ'];
        for (let i = 0; i < 9; i++) {
          tctx.fillText(syms[i % syms.length], 24 + (i % 3) * 62, 54 + Math.floor(i / 3) * 76);
        }
      }
    } else if (coverItem.style && coverItem.style.startsWith('pat-')) {
      const grad = tctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, base);
      grad.addColorStop(1, acc);
      tctx.fillStyle = grad;
      tctx.fillRect(0, 0, w, h);
      tctx.fillStyle = 'rgba(255,255,255,0.22)';
      tctx.beginPath();
      tctx.arc(w * 0.78, h * 0.25, w * 0.38, 0, Math.PI * 2);
      tctx.fill();
      tctx.beginPath();
      tctx.arc(w * 0.22, h * 0.80, w * 0.32, 0, Math.PI * 2);
      tctx.fill();
    } else {
      tctx.fillStyle = base;
      tctx.fillRect(0, 0, w, h);
      if (coverItem.style === 'simple') {
        // Bandeau d'étiquette caractéristique des couvertures "Simple" GoodNotes
        tctx.fillStyle = 'rgba(255,255,255,0.92)';
        tctx.fillRect(w * 0.18, h * 0.24, w * 0.64, h * 0.16);
        tctx.fillStyle = acc;
        tctx.fillRect(w * 0.18, h * 0.24, 6, h * 0.16);
      }
    }

    // Reliure verticale discrète à gauche façon cahier GoodNotes
    tctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
    tctx.fillRect(0, 0, Math.round(w * 0.085), h);
    tctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    tctx.fillRect(Math.round(w * 0.085), 0, 2, h);
  }

  function closeAllGnTplDropdowns() {
    gnTemplateModalState.openDropdown = null;
    ['gnTplSizeMenu', 'gnTplColorMenu', 'gnTplLangMenu', 'gnTplScopeMenu'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    ['gnTplBtnSize', 'gnTplBtnColor', 'gnTplBtnLang'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('aria-expanded', 'false');
    });
  }

  function renderGnTplDropdowns() {
    const sizeMenu = document.getElementById('gnTplSizeMenu');
    const colorMenu = document.getElementById('gnTplColorMenu');
    const langMenu = document.getElementById('gnTplLangMenu');
    const scopeMenu = document.getElementById('gnTplScopeMenu');

    if (sizeMenu) {
      sizeMenu.innerHTML = '';
      GN_PAGE_SIZE_PRESETS.forEach((sz) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `gn-tpl-dropdown-item${gnTemplateModalState.sizeId === sz.id ? ' selected' : ''}`;
        btn.innerHTML = `<span class="gn-tpl-dropdown-item-main"><span>${sz.label}</span></span><span class="gn-tpl-dropdown-meta">${sz.meta}</span>`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          gnTemplateModalState.sizeId = sz.id;
          closeAllGnTplDropdowns();
          renderGnTemplateLibraryModal();
        });
        sizeMenu.appendChild(btn);
      });
    }

    if (colorMenu) {
      colorMenu.innerHTML = '';
      GN_PAPER_TONE_OPTIONS.forEach((tone) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `gn-tpl-dropdown-item${gnTemplateModalState.toneId === tone.id ? ' selected' : ''}`;
        btn.innerHTML = `<span class="gn-tpl-dropdown-item-main"><span class="gn-tpl-tone-dot" style="background:${tone.swatch}"></span><span>${tone.label}</span></span>${gnTemplateModalState.toneId === tone.id ? '<span>✓</span>' : ''}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          gnTemplateModalState.toneId = tone.id;
          closeAllGnTplDropdowns();
          renderGnTemplateLibraryModal();
        });
        colorMenu.appendChild(btn);
      });
    }

    if (langMenu) {
      langMenu.innerHTML = '';
      GN_TEMPLATE_LANGUAGES.forEach((lang) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `gn-tpl-dropdown-item${gnTemplateModalState.language === lang.id ? ' selected' : ''}`;
        btn.innerHTML = `<span class="gn-tpl-dropdown-item-main"><span>${lang.label}</span></span>${gnTemplateModalState.language === lang.id ? '<span>✓</span>' : ''}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          gnTemplateModalState.language = lang.id;
          closeAllGnTplDropdowns();
          renderGnTemplateLibraryModal();
        });
        langMenu.appendChild(btn);
      });
    }

    if (scopeMenu) {
      scopeMenu.innerHTML = '';
      [
        { id: 'current', label: 'Page actuelle' },
        { id: 'all', label: 'Toutes les pages' }
      ].forEach((sc) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `gn-tpl-dropdown-item${gnTemplateModalState.scope === sc.id ? ' selected' : ''}`;
        btn.innerHTML = `<span class="gn-tpl-dropdown-item-main"><span>${sc.label}</span></span>${gnTemplateModalState.scope === sc.id ? '<span>✓</span>' : ''}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          gnTemplateModalState.scope = sc.id;
          closeAllGnTplDropdowns();
          renderGnTemplateLibraryModal();
        });
        scopeMenu.appendChild(btn);
      });
    }
  }

  function renderGnTemplateLibraryModal() {
    const body = document.getElementById('gnTplBody');
    if (!body) return;

    const st = gnTemplateModalState;
    const isPaper = st.activeTab === 'paper';
    const isLand = st.orientation === 'landscape';

    // Sync tabs & edit mode header/footer
    const tabCover = document.getElementById('gnTplTabCover');
    const tabPaper = document.getElementById('gnTplTabPaper');
    if (tabCover) { tabCover.classList.toggle('active', !isPaper); tabCover.setAttribute('aria-selected', String(!isPaper)); }
    if (tabPaper) { tabPaper.classList.toggle('active', isPaper); tabPaper.setAttribute('aria-selected', String(isPaper)); }

    const editBtn = document.getElementById('gnTplBtnEdit');
    const delBtn = document.getElementById('gnTplBtnDeleteSelected');
    if (editBtn) editBtn.classList.toggle('hidden', st.editMode);
    if (delBtn) {
      delBtn.classList.toggle('hidden', !st.editMode);
      delBtn.disabled = st.selectedForDeletion.size === 0;
    }

    const normalLeft = document.getElementById('gnTplFooterNormalLeft');
    const normalRight = document.getElementById('gnTplFooterNormalRight');
    const editLeft = document.getElementById('gnTplFooterEditLeft');
    const editRight = document.getElementById('gnTplFooterEditRight');
    if (normalLeft) normalLeft.classList.toggle('hidden', st.editMode);
    if (normalRight) normalRight.classList.toggle('hidden', st.editMode);
    if (editLeft) editLeft.classList.toggle('hidden', !st.editMode);
    if (editRight) editRight.classList.toggle('hidden', !st.editMode);

    // Sync filter labels
    const curSize = GN_PAGE_SIZE_PRESETS.find((s) => s.id === st.sizeId) || GN_PAGE_SIZE_PRESETS[0];
    const curTone = GN_PAPER_TONE_OPTIONS.find((t) => t.id === st.toneId) || GN_PAPER_TONE_OPTIONS[0];
    const curLang = GN_TEMPLATE_LANGUAGES.find((l) => l.id === st.language) || GN_TEMPLATE_LANGUAGES[0];

    const sizeLbl = document.getElementById('gnTplSizeLabel');
    const colorLbl = document.getElementById('gnTplColorLabel');
    const langLbl = document.getElementById('gnTplLangLabel');
    const scopeLbl = document.getElementById('gnTplScopeLabel');
    const scopeWrap = document.querySelector('.gn-tpl-scope-wrap');
    const applyBtn = document.getElementById('gnTplBtnApply');
    const colorWrap = document.getElementById('gnTplColorFilterWrap');
    const spacingCtrl = document.getElementById('gnTplSpacingControl');
    const spacingSlider = document.getElementById('gnTplGridSpacingSlider');
    const spacingVal = document.getElementById('gnTplGridSpacingVal');

    const isNewNbPicker = st.mode === 'new-notebook';
    if (sizeLbl) sizeLbl.textContent = curSize.label;
    if (colorLbl) colorLbl.textContent = curTone.label;
    if (langLbl) langLbl.textContent = curLang.label;
    if (scopeLbl) scopeLbl.textContent = st.scope === 'all' ? 'Toutes les pages' : 'Page actuelle';
    if (scopeWrap) scopeWrap.classList.toggle('hidden', isNewNbPicker);
    if (applyBtn) applyBtn.textContent = isNewNbPicker ? 'Sélectionner' : 'Appliquer';
    if (colorWrap) colorWrap.classList.toggle('hidden', !isPaper);
    if (spacingCtrl) spacingCtrl.classList.toggle('hidden', !isPaper);
    if (spacingSlider) spacingSlider.value = String(st.gridSize || 28);
    if (spacingVal) spacingVal.textContent = `${st.gridSize || 28}px`;

    const btnPort = document.getElementById('gnTplOrientPortrait');
    const btnLand = document.getElementById('gnTplOrientLandscape');
    if (btnPort) { btnPort.classList.toggle('active', !isLand); btnPort.setAttribute('aria-pressed', String(!isLand)); }
    if (btnLand) { btnLand.classList.toggle('active', isLand); btnLand.setAttribute('aria-pressed', String(isLand)); }

    renderGnTplDropdowns();

    // Construit la liste des sections (groupes personnalisés + groupes officiels GoodNotes)
    const builtInGroups = isPaper ? GN_PAPER_TEMPLATE_GROUPS : GN_COVER_TEMPLATE_GROUPS;
    const customGroups = (st.customStore.groups || [])
      .filter((g) => (g.type || 'paper') === st.activeTab)
      .map((g) => ({
        id: g.id,
        title: g.title,
        isCustomGroup: true,
        items: (st.customStore.templates || []).filter((t) => t.groupId === g.id && (t.type || 'paper') === st.activeTab)
      }))
      .filter((g) => st.editMode || g.items.length > 0);

    const allGroups = [...builtInGroups, ...customGroups];
    body.innerHTML = '';

    allGroups.forEach((group) => {
      const secKey = `${st.activeTab}:${group.id}`;
      const isCollapsed = st.collapsedSections.has(secKey);

      const sectionEl = document.createElement('section');
      sectionEl.className = `gn-tpl-section${isCollapsed ? ' collapsed' : ''}`;
      sectionEl.dataset.tplGroup = group.id;

      const headerEl = document.createElement('div');
      headerEl.className = 'gn-tpl-section-header';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'gn-tpl-section-title-wrap';
      titleWrap.innerHTML = `<svg class="gn-tpl-section-caret" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2.5 4l3.5 4 3.5-4z"></path></svg><span class="gn-tpl-section-title">${group.title}</span>`;
      headerEl.appendChild(titleWrap);

      if (st.editMode && group.isCustomGroup) {
        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'gn-tpl-section-actions';
        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'gn-tpl-group-rename-btn';
        renameBtn.textContent = 'Renommer';
        renameBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const nextName = window.prompt('Nouveau nom du groupe :', group.title);
          if (nextName && nextName.trim()) {
            const target = st.customStore.groups.find((g) => g.id === group.id);
            if (target) {
              target.title = nextName.trim();
              saveGnCustomTemplatesStore();
              renderGnTemplateLibraryModal();
            }
          }
        });
        actionsWrap.appendChild(renameBtn);
        headerEl.appendChild(actionsWrap);
      }

      headerEl.addEventListener('click', () => {
        if (st.collapsedSections.has(secKey)) st.collapsedSections.delete(secKey);
        else st.collapsedSections.add(secKey);
        sectionEl.classList.toggle('collapsed', st.collapsedSections.has(secKey));
      });
      sectionEl.appendChild(headerEl);

      const carouselEl = document.createElement('div');
      carouselEl.className = 'gn-tpl-carousel';

      // En mode Modifier, affiche la carte pointillée bleue "+ Importer" officielle GoodNotes dans les groupes persos
      if (st.editMode && group.isCustomGroup) {
        const importCard = document.createElement('button');
        importCard.type = 'button';
        importCard.className = `gn-tpl-card gn-tpl-import-card${isLand ? ' landscape' : ''}`;
        importCard.innerHTML = `<div class="gn-tpl-thumb-frame"><div class="gn-tpl-import-box"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg></div></div><span class="gn-tpl-card-label">Importer</span>`;
        importCard.addEventListener('click', () => {
          st.importTargetGroupId = group.id;
          const fileInp = document.getElementById('gnTplImportFileInput');
          if (fileInp) { fileInp.value = ''; fileInp.click(); }
        });
        carouselEl.appendChild(importCard);
      }

      group.items.forEach((item) => {
        const isSelected = isPaper
          ? st.selectedPaperId === item.id
          : st.selectedCoverId === item.id;
        const isCustomItem = Boolean(item.dataUrl || String(item.id).startsWith('custom:'));
        const isMarkedDelete = st.selectedForDeletion.has(item.id);

        const card = document.createElement('button');
        card.type = 'button';
        card.className = `gn-tpl-card${isLand ? ' landscape' : ''}${isSelected && !st.editMode ? ' selected' : ''}${isMarkedDelete ? ' marked-delete' : ''}`;
        card.dataset.tplId = item.id;

        const frame = document.createElement('div');
        frame.className = 'gn-tpl-thumb-frame';

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.className = 'gn-tpl-thumb-canvas';
        thumbCanvas.setAttribute('aria-hidden', 'true');
        if (isPaper) {
          renderGnPaperThumbnail(thumbCanvas, item, st.toneId, st.orientation, st.language, st.gridSize);
        } else {
          renderGnCoverThumbnail(thumbCanvas, item, st.orientation);
        }
        frame.appendChild(thumbCanvas);

        if (st.editMode && isCustomItem) {
          const check = document.createElement('span');
          check.className = 'gn-tpl-edit-check';
          check.textContent = isMarkedDelete ? '✓' : '';
          frame.appendChild(check);
        }

        const lbl = document.createElement('span');
        lbl.className = 'gn-tpl-card-label';
        lbl.textContent = item.label;

        card.appendChild(frame);
        card.appendChild(lbl);

        card.addEventListener('click', () => {
          if (st.editMode) {
            if (!isCustomItem) return;
            if (st.selectedForDeletion.has(item.id)) st.selectedForDeletion.delete(item.id);
            else st.selectedForDeletion.add(item.id);
            renderGnTemplateLibraryModal();
            return;
          }
          if (isPaper) {
            st.selectedPaperId = item.id;
            st.selectedCustomDataUrl = item.dataUrl || null;
          } else {
            st.selectedCoverId = item.id;
            st.coverTouchedInPicker = true;
          }
          renderGnTemplateLibraryModal();
        });

        card.addEventListener('dblclick', () => {
          if (st.editMode) return;
          if (isPaper) {
            st.selectedPaperId = item.id;
            st.selectedCustomDataUrl = item.dataUrl || null;
          } else {
            st.selectedCoverId = item.id;
            st.coverTouchedInPicker = true;
          }
          applyGnTemplateLibrarySelection();
        });

        carouselEl.appendChild(card);
      });

      sectionEl.appendChild(carouselEl);
      body.appendChild(sectionEl);
    });

    // Bandeau GoodNotes officiel en bas de liste : "Vous voulez créer un tableau de taille illimitée ?"
    if (isPaper && !st.editMode) {
      const banner = document.createElement('div');
      banner.className = 'gn-tpl-infinite-banner';
      const isAlreadyInf = st.sizeId === 'infinite';
      banner.innerHTML = `<span class="gn-tpl-infinite-banner-text">${isAlreadyInf ? 'Mode Tableau blanc / Page infinie sélectionné.' : 'Vous voulez créer un tableau de taille illimitée ?'}</span>`;
      const actBtn = document.createElement('button');
      actBtn.type = 'button';
      actBtn.className = 'gn-tpl-infinite-banner-btn';
      actBtn.textContent = isAlreadyInf ? 'Revenir au format Standard' : 'Passer en Page infinie';
      actBtn.addEventListener('click', () => {
        st.sizeId = isAlreadyInf ? 'goodnotes_standard' : 'infinite';
        renderGnTemplateLibraryModal();
      });
      banner.appendChild(actBtn);
      body.appendChild(banner);
    }
  }

  function updateNewNotebookPaperPreview() {
    loadGnCustomTemplatesStore();
    const tpl = state.newNotebookTemplate || {
      paperType: 'grid',
      paperTone: 'white',
      gridSize: 28,
      language: 'fr',
      sizeId: 'goodnotes_standard',
      orientation: 'portrait',
      customTemplateDataUrl: null
    };
    const paperId = tpl.paperType || 'grid';
    if (dom.selectDefaultPaper) dom.selectDefaultPaper.value = paperId;

    const flatPapers = [
      ...GN_PAPER_TEMPLATE_GROUPS.flatMap((g) => g.items),
      ...(gnTemplateModalState.customStore.templates || []).filter((t) => (t.type || 'paper') === 'paper')
    ];
    const item = flatPapers.find((p) => p.id === paperId) || {
      id: paperId,
      label: paperId,
      dataUrl: tpl.customTemplateDataUrl || null
    };
    const sizePreset = GN_PAGE_SIZE_PRESETS.find((s) => s.id === tpl.sizeId) || GN_PAGE_SIZE_PRESETS[0];
    const tonePreset = GN_PAPER_TONE_OPTIONS.find((t) => t.id === (tpl.paperTone || 'white')) || GN_PAPER_TONE_OPTIONS[0];
    const isInfinite = Boolean(sizePreset && sizePreset.isInfinite);
    const isLand = tpl.orientation === 'landscape';

    const titleEl = document.getElementById('newNotebookPaperTitle');
    const metaEl = document.getElementById('newNotebookPaperMeta');
    const previewWrap = document.getElementById('newNotebookPaperPreviewWrap');
    const previewCanvas = document.getElementById('newNotebookPaperPreviewCanvas');

    if (titleEl) titleEl.textContent = item.label || 'Papier quadrillé';
    if (metaEl) {
      const parts = [sizePreset.label, tonePreset.label];
      if (!isInfinite) parts.push(isLand ? 'Paysage' : 'Portrait');
      parts.push(`${Number.isFinite(tpl.gridSize) ? tpl.gridSize : 28}px`);
      metaEl.textContent = parts.join(' · ');
    }
    if (previewWrap) previewWrap.classList.toggle('landscape', !isInfinite && isLand);
    if (previewCanvas) {
      renderGnPaperThumbnail(
        previewCanvas,
        { ...item, dataUrl: tpl.customTemplateDataUrl || item.dataUrl || null },
        tpl.paperTone || 'white',
        isInfinite ? 'portrait' : (tpl.orientation || 'portrait'),
        tpl.language || 'fr',
        Number.isFinite(tpl.gridSize) ? tpl.gridSize : 28
      );
    }
  }

  function openGnTemplateLibraryModal(initialTab = 'paper', options = null) {
    const modal = document.getElementById('gnTemplateLibraryModal');
    if (!modal) return;
    loadGnCustomTemplatesStore();

    const st = gnTemplateModalState;
    const isNewNbPicker = Boolean(options && options.mode === 'new-notebook');

    st.open = true;
    st.mode = isNewNbPicker ? 'new-notebook' : 'page';
    st.onApplyNewNotebook = (isNewNbPicker && typeof options.onApply === 'function') ? options.onApply : null;
    st.coverTouchedInPicker = false;
    st.activeTab = initialTab === 'cover' ? 'cover' : 'paper';
    st.editMode = false;
    st.selectedForDeletion.clear();
    closeAllGnTplDropdowns();

    if (isNewNbPicker) {
      const init = (options && options.initial) || state.newNotebookTemplate || {};
      st.selectedPaperId = init.paperType || 'grid';
      st.selectedCustomDataUrl = init.customTemplateDataUrl || null;
      st.toneId = init.paperTone || 'white';
      st.gridSize = Number.isFinite(init.gridSize) ? init.gridSize : 28;
      st.language = init.language || 'fr';
      st.orientation = init.orientation || 'portrait';
      st.sizeId = init.sizeId || 'goodnotes_standard';
      st.selectedCoverId = init.coverTemplateId || 'simple-blue';
    } else {
      const page = getActivePage();
      const nb = getActiveNotebook();
      if (page) {
        st.selectedPaperId = page.paperType || 'grid';
        st.selectedCustomDataUrl = page.customTemplateDataUrl || null;
        st.toneId = page.paperTone || 'white';
        st.gridSize = Number.isFinite(page.gridSize) ? page.gridSize : 28;
        st.language = page.templateLanguage || 'fr';
        st.orientation = page.pageOrientation || ((page.pageWidth && page.pageHeight && page.pageWidth > page.pageHeight) ? 'landscape' : 'portrait');
        if ((page.viewMode || 'infinite') === 'infinite' && !page.pdfId) {
          st.sizeId = 'infinite';
        } else {
          st.sizeId = page.pageSize || 'goodnotes_standard';
        }
      }
      if (nb) {
        st.selectedCoverId = nb.coverTemplateId || 'simple-blue';
      }
    }

    modal.classList.remove('hidden');
    renderGnTemplateLibraryModal();
  }

  function closeGnTemplateLibraryModal() {
    const modal = document.getElementById('gnTemplateLibraryModal');
    if (modal) modal.classList.add('hidden');
    gnTemplateModalState.open = false;
    gnTemplateModalState.mode = 'page';
    gnTemplateModalState.onApplyNewNotebook = null;
    gnTemplateModalState.coverTouchedInPicker = false;
    gnTemplateModalState.editMode = false;
    gnTemplateModalState.selectedForDeletion.clear();
    closeAllGnTplDropdowns();
  }

  function applyGnTemplateLibrarySelection() {
    const st = gnTemplateModalState;

    if (st.mode === 'new-notebook') {
      const flatCovers = [
        ...GN_COVER_TEMPLATE_GROUPS.flatMap((g) => g.items),
        ...(st.customStore.templates || []).filter((t) => t.type === 'cover')
      ];
      const coverSelected = Boolean(st.activeTab === 'cover' || st.coverTouchedInPicker);
      const chosenCover = coverSelected ? flatCovers.find((c) => c.id === st.selectedCoverId) : null;
      const picked = {
        paperType: st.selectedPaperId || 'grid',
        paperTone: st.toneId === 'all' ? 'white' : (st.toneId || 'white'),
        gridSize: Number.isFinite(st.gridSize) ? st.gridSize : 28,
        language: st.language || 'fr',
        sizeId: st.sizeId || 'goodnotes_standard',
        orientation: st.orientation || 'portrait',
        customTemplateDataUrl: st.selectedCustomDataUrl || null,
        coverSelected: Boolean(chosenCover),
        coverTemplateId: chosenCover ? chosenCover.id : null,
        coverColor: chosenCover ? (chosenCover.coverColor || null) : null,
        coverCustomDataUrl: chosenCover ? (chosenCover.dataUrl || null) : null
      };
      const cb = st.onApplyNewNotebook;
      closeGnTemplateLibraryModal();
      if (typeof cb === 'function') cb(picked);
      return;
    }

    const page = getActivePage();
    const nb = getActiveNotebook();
    if (!page || !nb) {
      closeGnTemplateLibraryModal();
      return;
    }

    if (st.activeTab === 'cover') {
      const flatCovers = [
        ...GN_COVER_TEMPLATE_GROUPS.flatMap((g) => g.items),
        ...(st.customStore.templates || []).filter((t) => t.type === 'cover')
      ];
      const chosenCover = flatCovers.find((c) => c.id === st.selectedCoverId);
      if (chosenCover) {
        nb.coverTemplateId = chosenCover.id;
        nb.coverColor = chosenCover.coverColor || nb.coverColor || '#0072ce';
        nb.coverCustomDataUrl = chosenCover.dataUrl || null;
        nb.updatedAt = Date.now();
        db.saveNotebook(nb);
        renderNotebooksSidebar();
        if (typeof renderGnFilesPage === 'function') renderGnFilesPage();
        showToast(`Couverture appliquée : ${chosenCover.label}`);
      }
      closeGnTemplateLibraryModal();
      return;
    }

    const dims = getPageDimensionsForSizeAndOrientation(st.sizeId, st.orientation);
    const effectiveTone = st.toneId === 'all' ? (page.paperTone || 'white') : st.toneId;
    const targetPages = st.scope === 'all'
      ? getActiveNotebookPages().filter((pg) => !pg.pdfId && !pg.isPdfPage)
      : [page];

    targetPages.forEach((pg) => {
      pg.paperType = st.selectedPaperId;
      pg.paperTone = effectiveTone;
      pg.gridSize = st.gridSize;
      pg.templateLanguage = st.language;
      pg.customTemplateDataUrl = st.selectedCustomDataUrl || null;
      if (!pg.pdfId && !pg.isPdfPage) {
        pg.viewMode = dims.viewMode;
        pg.pageSize = st.sizeId;
        pg.pageOrientation = st.orientation;
        pg.pageWidth = dims.width;
        pg.pageHeight = dims.height;
      }
      pg.updatedAt = Date.now();
      pg.thumbnail = generatePageThumbnail(pg);
      db.savePage(pg);
    });

    nb.defaultPaperType = st.selectedPaperId;
    nb.updatedAt = Date.now();
    db.saveNotebook(nb);

    invalidateStaticInkCache();
    resetPullToAddState();
    updateBreadcrumbs();
    renderPagesSidebar();
    if (isBoundedPage(page)) fitPageToViewport(true);
    else requestRender();
    scheduleSaveActivePage(page);
    showToast('Changement de modèle effectué');
    closeGnTemplateLibraryModal();
  }

  function initGnTemplateLibraryModal() {
    const modal = document.getElementById('gnTemplateLibraryModal');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    loadGnCustomTemplatesStore();

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeGnTemplateLibraryModal();
      } else if (!e.target.closest('.gn-tpl-filter-wrap')) {
        closeAllGnTplDropdowns();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!gnTemplateModalState.open) return;
      if (e.key === 'Escape') {
        e.preventDefault(); // Échap consommé : le raccourci global ne doit pas fermer aussi la fenêtre en dessous
        if (gnTemplateModalState.openDropdown) closeAllGnTplDropdowns();
        else closeGnTemplateLibraryModal();
      }
    });

    const tabCover = document.getElementById('gnTplTabCover');
    const tabPaper = document.getElementById('gnTplTabPaper');
    if (tabCover) {
      tabCover.addEventListener('click', () => {
        gnTemplateModalState.activeTab = 'cover';
        closeAllGnTplDropdowns();
        renderGnTemplateLibraryModal();
      });
    }
    if (tabPaper) {
      tabPaper.addEventListener('click', () => {
        gnTemplateModalState.activeTab = 'paper';
        closeAllGnTplDropdowns();
        renderGnTemplateLibraryModal();
      });
    }

    const bindDropdown = (btnId, menuId, key) => {
      const btn = document.getElementById(btnId);
      const menu = document.getElementById(menuId);
      if (!btn || !menu) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = gnTemplateModalState.openDropdown !== key;
        closeAllGnTplDropdowns();
        if (willOpen) {
          gnTemplateModalState.openDropdown = key;
          menu.classList.remove('hidden');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    };
    bindDropdown('gnTplBtnSize', 'gnTplSizeMenu', 'size');
    bindDropdown('gnTplBtnColor', 'gnTplColorMenu', 'color');
    bindDropdown('gnTplBtnLang', 'gnTplLangMenu', 'lang');
    bindDropdown('gnTplBtnScope', 'gnTplScopeMenu', 'scope');

    const btnPort = document.getElementById('gnTplOrientPortrait');
    const btnLand = document.getElementById('gnTplOrientLandscape');
    if (btnPort) {
      btnPort.addEventListener('click', () => {
        gnTemplateModalState.orientation = 'portrait';
        renderGnTemplateLibraryModal();
      });
    }
    if (btnLand) {
      btnLand.addEventListener('click', () => {
        gnTemplateModalState.orientation = 'landscape';
        renderGnTemplateLibraryModal();
      });
    }

    const spacingSlider = document.getElementById('gnTplGridSpacingSlider');
    if (spacingSlider) {
      spacingSlider.addEventListener('input', (e) => {
        gnTemplateModalState.gridSize = parseInt(e.target.value, 10) || 28;
        const valEl = document.getElementById('gnTplGridSpacingVal');
        if (valEl) valEl.textContent = `${gnTemplateModalState.gridSize}px`;
        renderGnTemplateLibraryModal();
      });
    }

    const btnEdit = document.getElementById('gnTplBtnEdit');
    const btnDoneEdit = document.getElementById('gnTplBtnDoneEdit');
    const btnDeleteSelected = document.getElementById('gnTplBtnDeleteSelected');
    if (btnEdit) {
      btnEdit.addEventListener('click', () => {
        gnTemplateModalState.editMode = true;
        gnTemplateModalState.selectedForDeletion.clear();
        closeAllGnTplDropdowns();
        renderGnTemplateLibraryModal();
      });
    }
    if (btnDoneEdit) {
      btnDoneEdit.addEventListener('click', () => {
        gnTemplateModalState.editMode = false;
        gnTemplateModalState.selectedForDeletion.clear();
        renderGnTemplateLibraryModal();
      });
    }
    if (btnDeleteSelected) {
      btnDeleteSelected.addEventListener('click', () => {
        const ids = gnTemplateModalState.selectedForDeletion;
        if (ids.size === 0) return;
        gnTemplateModalState.customStore.templates = (gnTemplateModalState.customStore.templates || []).filter((t) => !ids.has(t.id));
        ids.clear();
        saveGnCustomTemplatesStore();
        renderGnTemplateLibraryModal();
        showToast('Modèles personnalisés supprimés');
      });
    }

    const btnImportFooter = document.getElementById('gnTplBtnImportFooter');
    const fileInput = document.getElementById('gnTplImportFileInput');
    if (btnImportFooter && fileInput) {
      btnImportFooter.addEventListener('click', () => {
        const st = gnTemplateModalState;
        let grp = (st.customStore.groups || []).find((g) => (g.type || 'paper') === st.activeTab);
        if (!grp) {
          grp = { id: `grp_${Date.now()}`, title: 'Mes modèles', type: st.activeTab };
          st.customStore.groups.push(grp);
          saveGnCustomTemplatesStore();
        }
        st.importTargetGroupId = grp.id;
        fileInput.value = '';
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          if (!dataUrl) return;
          const st = gnTemplateModalState;
          const baseName = file.name.replace(/\.[^.]+$/, '') || 'Modèle importé';
          const targetGroupId = st.importTargetGroupId || ((st.customStore.groups.find((g) => (g.type || 'paper') === st.activeTab) || {}).id) || 'my-templates';
          const newId = `custom:${Date.now()}`;
          st.customStore.templates.push({
            id: newId,
            groupId: targetGroupId,
            type: st.activeTab,
            label: baseName,
            dataUrl,
            orientation: st.orientation
          });
          saveGnCustomTemplatesStore();
          if (st.activeTab === 'paper') {
            st.selectedPaperId = newId;
            st.selectedCustomDataUrl = dataUrl;
          } else {
            st.selectedCoverId = newId;
          }
          renderGnTemplateLibraryModal();
          showToast(`Modèle importé : ${baseName}`);
        };
        reader.readAsDataURL(file);
      });
    }

    const btnNewGroup = document.getElementById('gnTplBtnNewGroup');
    if (btnNewGroup) {
      btnNewGroup.addEventListener('click', () => {
        const name = window.prompt('Nom du nouveau groupe de modèles :', 'Mes modèles');
        if (!name || !name.trim()) return;
        gnTemplateModalState.customStore.groups.push({
          id: `grp_${Date.now()}`,
          title: name.trim(),
          type: gnTemplateModalState.activeTab
        });
        saveGnCustomTemplatesStore();
        renderGnTemplateLibraryModal();
        showToast(`Groupe créé : ${name.trim()}`);
      });
    }

    const btnCancel = document.getElementById('gnTplBtnCancel');
    const btnApply = document.getElementById('gnTplBtnApply');
    if (btnCancel) btnCancel.addEventListener('click', closeGnTemplateLibraryModal);
    if (btnApply) btnApply.addEventListener('click', applyGnTemplateLibrarySelection);
  }

  // ============================================================================
  // PACK FONCTIONNALITÉS #1 (RÈGLE), #3 (RECADRAGE IMAGE), #4 (ONGLETS),
  // #6 (BIBLIOTHÈQUE D'ÉLÉMENTS) & #9 (RECHERCHE PDF / CAHIER)
  // ============================================================================

  // --- #4 ONGLETS DE CAHIERS OUVERTS ---
  const DOC_TABS_STORAGE_KEY = 'inkflow_open_tabs_v1';
  if (!Array.isArray(state.openNotebookTabIds)) state.openNotebookTabIds = [];

  function saveOpenNotebookTabs() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DOC_TABS_STORAGE_KEY, JSON.stringify(state.openNotebookTabIds || []));
      }
    } catch (_) {}
  }

  function loadOpenNotebookTabs() {
    let saved = [];
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(DOC_TABS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) saved = parsed.filter((id) => typeof id === 'string');
        }
      }
    } catch (_) {}
    const validIds = new Set((state.notebooks || []).filter((n) => !n.trashedAt).map((n) => n.id));
    state.openNotebookTabIds = saved.filter((id) => validIds.has(id));
    if (state.activeNotebookId && validIds.has(state.activeNotebookId) && !state.openNotebookTabIds.includes(state.activeNotebookId)) {
      state.openNotebookTabIds.push(state.activeNotebookId);
    }
    if (state.openNotebookTabIds.length === 0) {
      const firstActive = (state.notebooks || []).find((n) => !n.trashedAt);
      if (firstActive) state.openNotebookTabIds.push(firstActive.id);
    }
    saveOpenNotebookTabs();
  }

  function syncOpenTabsWithActiveNotebook() {
    const validIds = new Set((state.notebooks || []).filter((n) => !n.trashedAt).map((n) => n.id));
    state.openNotebookTabIds = (state.openNotebookTabIds || []).filter((id, idx, arr) => validIds.has(id) && arr.indexOf(id) === idx);
    if (state.activeNotebookId && validIds.has(state.activeNotebookId) && !state.openNotebookTabIds.includes(state.activeNotebookId)) {
      state.openNotebookTabIds.push(state.activeNotebookId);
    }
    if (state.openNotebookTabIds.length === 0) {
      const firstActive = (state.notebooks || []).find((n) => !n.trashedAt);
      if (firstActive) state.openNotebookTabIds.push(firstActive.id);
    }
    saveOpenNotebookTabs();
    renderDocTabsBar();
  }

  function openNotebookInTab(nbId, activate = true) {
    const nb = (state.notebooks || []).find((n) => n.id === nbId && !n.trashedAt);
    if (!nb) return false;
    if (!Array.isArray(state.openNotebookTabIds)) state.openNotebookTabIds = [];
    if (state.activeNotebookId && !state.openNotebookTabIds.includes(state.activeNotebookId)) {
      state.openNotebookTabIds.push(state.activeNotebookId);
    }
    if (!state.openNotebookTabIds.includes(nbId)) {
      state.openNotebookTabIds.push(nbId);
      saveOpenNotebookTabs();
    }
    if (activate && state.activeNotebookId !== nbId) {
      selectNotebook(nbId);
    } else {
      renderDocTabsBar();
    }
    return true;
  }

  function closeNotebookTab(nbId) {
    if (!Array.isArray(state.openNotebookTabIds) || state.openNotebookTabIds.length <= 1) return false;
    const idx = state.openNotebookTabIds.indexOf(nbId);
    if (idx === -1) return false;
    state.openNotebookTabIds.splice(idx, 1);
    saveOpenNotebookTabs();
    if (state.activeNotebookId === nbId) {
      const nextId = state.openNotebookTabIds[Math.max(0, idx - 1)] || state.openNotebookTabIds[0];
      if (nextId) selectNotebook(nextId);
    } else {
      renderDocTabsBar();
    }
    return true;
  }

  function renderDocTabsBar() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById('docTabsList');
    if (!listEl) return;
    const nbMap = new Map((state.notebooks || []).filter((n) => !n.trashedAt).map((n) => [n.id, n]));
    const ids = (state.openNotebookTabIds || []).filter((id) => nbMap.has(id));
    if (ids.length === 0 && state.activeNotebookId && nbMap.has(state.activeNotebookId)) {
      ids.push(state.activeNotebookId);
    }
    listEl.innerHTML = '';
    const canClose = ids.length > 1;
    ids.forEach((id) => {
      const nb = nbMap.get(id);
      if (!nb) return;
      const isActive = id === state.activeNotebookId;
      const tabBtn = document.createElement('div');
      tabBtn.className = `doc-tab${isActive ? ' active' : ''}`;
      tabBtn.setAttribute('role', 'tab');
      tabBtn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tabBtn.dataset.notebookId = id;
      tabBtn.title = nb.title || 'Cahier';

      const dot = document.createElement('span');
      dot.className = 'doc-tab-dot';
      dot.style.background = nb.coverColor || nb.color || '#0072ce';
      tabBtn.appendChild(dot);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'doc-tab-title';
      titleSpan.textContent = nb.title || 'Sans titre';
      tabBtn.appendChild(titleSpan);

      if (canClose) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'doc-tab-close';
        closeBtn.type = 'button';
        closeBtn.title = 'Fermer cet onglet';
        closeBtn.setAttribute('aria-label', `Fermer l'onglet ${nb.title || ''}`);
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          closeNotebookTab(id);
        });
        tabBtn.appendChild(closeBtn);
      }

      tabBtn.addEventListener('click', () => {
        if (state.activeNotebookId !== id) {
          selectNotebook(id);
        }
      });
      listEl.appendChild(tabBtn);
    });
    if (typeof syncSplitViewUi === 'function') syncSplitViewUi();
  }

  function renderDocTabAddPopover() {
    if (typeof document === 'undefined') return;
    if (typeof renderSplitNotebookPickerList === 'function') {
      renderSplitNotebookPickerList();
    }
  }

  // ============================================================================
  // SPLIT VIEW — VUE DIVISÉE (2 CAHIERS CÔTE À CÔTE REDIMENSIONNABLES)
  // ============================================================================
  let splitRenderPending = false;

  function scheduleSplitPaneRender() {
    if (!state.splitView || !state.splitView.open) return;
    if (splitRenderPending) return;
    splitRenderPending = true;
    const run = () => {
      if (state.isDrawing) {
        setTimeout(run, 60);
        return;
      }
      splitRenderPending = false;
      renderSplitPane();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  function getSplitPanePages() {
    const nbId = state.splitView && state.splitView.notebookId;
    if (!nbId) return [];
    return (state.pagesByNotebook.get(nbId) || []).filter((p) => !p.trashedAt);
  }

  function getSplitPaneActivePage() {
    const pages = getSplitPanePages();
    if (!pages.length) return null;
    const found = pages.find((p) => p.id === state.splitView.pageId);
    if (found) return found;
    state.splitView.pageId = pages[0].id;
    return pages[0];
  }

  const SPLIT_MIN_ZOOM = 0.2;
  const SPLIT_MAX_ZOOM = 5.0;
  const splitTouchPoints = new Map();
  let splitIsPinching = false;
  let splitPinchLastDist = 0;
  let splitPinchLastCenter = { x: 0, y: 0 };

  function getSplitFitZoom(page, rect) {
    if (!page || !rect || rect.width <= 0) return 0.72;
    const pw = page.pdfWidth || page.pageWidth || PAGE_WIDTH;
    return Math.max(SPLIT_MIN_ZOOM, Math.min(2.2, (rect.width - 36) / pw));
  }

  function applySplitZoom(factor, anchorScreenX = null, anchorScreenY = null) {
    if (!state.splitView || !Number.isFinite(factor) || factor <= 0) return state.splitView ? state.splitView.zoom : 0.72;
    const vp = document.getElementById('splitViewport');
    const rect = (vp && typeof vp.getBoundingClientRect === 'function')
      ? vp.getBoundingClientRect()
      : { width: 600, height: 800 };
    const oldZ = state.splitView.zoom || 0.72;
    const nextZ = Math.max(SPLIT_MIN_ZOOM, Math.min(SPLIT_MAX_ZOOM, oldZ * factor));
    const ax = anchorScreenX !== null ? anchorScreenX : rect.width * 0.5;
    const ay = anchorScreenY !== null ? anchorScreenY : rect.height * 0.5;
    const wx = (ax - state.splitView.panX) / oldZ;
    const wy = (ay - state.splitView.panY) / oldZ;
    state.splitView.zoom = nextZ;
    state.splitView.panX = ax - wx * nextZ;
    state.splitView.panY = ay - wy * nextZ;
    syncSplitViewUi();
    renderSplitPane();
    return nextZ;
  }

  function fitSplitPaneToWidth() {
    const vp = document.getElementById('splitViewport');
    const page = getSplitPaneActivePage();
    if (!vp || !page || typeof vp.getBoundingClientRect !== 'function') return;
    const rect = vp.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pw = page.pdfWidth || page.pageWidth || PAGE_WIDTH;
    const targetZoom = getSplitFitZoom(page, rect);
    state.splitView.zoom = targetZoom;
    state.splitView.panX = Math.max(12, Math.round((rect.width - pw * targetZoom) * 0.5));
    state.splitView.panY = 18;
    syncSplitViewUi();
    renderSplitPane();
  }

  function syncSplitViewUi() {
    if (typeof document === 'undefined' || !state.splitView) return;
    const sv = state.splitView;
    const shell = document.getElementById('workspaceSplitShell');
    const resizer = document.getElementById('splitResizer');
    const pane = document.getElementById('splitSecondaryPane');
    const toggleBtn = document.getElementById('btnToggleSplitView');

    if (toggleBtn) {
      toggleBtn.classList.toggle('active', Boolean(sv.open));
      toggleBtn.setAttribute('aria-pressed', String(Boolean(sv.open)));
    }
    if (shell) {
      shell.classList.toggle('split-active', Boolean(sv.open));
      if (shell.style && typeof shell.style.setProperty === 'function') {
        shell.style.setProperty('--split-primary-width', `${(sv.ratio * 100).toFixed(2)}%`);
      }
    }
    if (resizer) resizer.classList.toggle('hidden', !sv.open);
    if (pane) pane.classList.toggle('hidden', !sv.open);
    if (!sv.open) {
      if (sv.pickerMode !== 'tab') closeSplitNotebookPopover();
      return;
    }

    const activeNbs = (state.notebooks || []).filter((n) => !n.trashedAt);
    if (!activeNbs.some((n) => n.id === sv.notebookId)) {
      const other = activeNbs.find((n) => n.id !== state.activeNotebookId) || activeNbs[0];
      sv.notebookId = other ? other.id : null;
      sv.pageId = null;
    }
    const curNb = activeNbs.find((n) => n.id === sv.notebookId) || null;
    const triggerBtn = document.getElementById('btnSplitNotebookPicker');
    const triggerDot = document.getElementById('splitNbTriggerDot');
    const triggerLabel = document.getElementById('splitNbTriggerLabel');
    const triggerBadge = document.getElementById('splitNbTriggerBadge');
    if (triggerDot) triggerDot.style.background = (curNb && (curNb.coverColor || curNb.color)) || '#0072ce';
    if (triggerLabel) triggerLabel.textContent = (curNb && curNb.title) || 'Choisir un fichier';
    if (triggerBadge) triggerBadge.classList.toggle('hidden', !curNb || curNb.id !== state.activeNotebookId);
    if (triggerBtn) {
      const isSplitPickerOpen = Boolean(sv.pickerOpen && sv.pickerMode !== 'tab');
      triggerBtn.classList.toggle('open', isSplitPickerOpen);
      triggerBtn.setAttribute('aria-expanded', String(isSplitPickerOpen));
    }
    if (sv.pickerOpen) {
      renderSplitNotebookPickerList();
    }

    const pages = getSplitPanePages();
    const curPage = getSplitPaneActivePage();
    const pageIdx = curPage ? pages.findIndex((p) => p.id === curPage.id) : -1;
    const readout = document.getElementById('splitPageReadout');
    if (readout) readout.textContent = pages.length > 0 ? `${pageIdx + 1} / ${pages.length}` : '0 / 0';
    const prevBtn = document.getElementById('btnSplitPrevPage');
    const nextBtn = document.getElementById('btnSplitNextPage');
    if (prevBtn) prevBtn.disabled = pageIdx <= 0;
    if (nextBtn) nextBtn.disabled = pageIdx < 0 || pageIdx >= pages.length - 1;

    const zoomPct = `${Math.round((sv.zoom || 0.72) * 100)}%`;
    const atMinZoom = (sv.zoom || 0.72) <= SPLIT_MIN_ZOOM + 0.005;
    const atMaxZoom = (sv.zoom || 0.72) >= SPLIT_MAX_ZOOM - 0.005;
    const zoomReadout = document.getElementById('btnSplitZoomFit');
    const floatZoomReadout = document.getElementById('btnSplitFloatZoomFit');
    if (zoomReadout) zoomReadout.textContent = zoomPct;
    if (floatZoomReadout) floatZoomReadout.textContent = zoomPct;
    const btnZOut = document.getElementById('btnSplitZoomOut');
    const btnZIn = document.getElementById('btnSplitZoomIn');
    const btnFZOut = document.getElementById('btnSplitFloatZoomOut');
    const btnFZIn = document.getElementById('btnSplitFloatZoomIn');
    if (btnZOut) btnZOut.disabled = atMinZoom;
    if (btnZIn) btnZIn.disabled = atMaxZoom;
    if (btnFZOut) btnFZOut.disabled = atMinZoom;
    if (btnFZIn) btnFZIn.disabled = atMaxZoom;
  }

  function renderSplitPane() {
    if (!state.splitView || !state.splitView.open) return;
    const canvas = document.getElementById('splitCanvas');
    const vp = document.getElementById('splitViewport');
    if (!canvas || !vp || typeof vp.getBoundingClientRect !== 'function') return;
    const rect = vp.getBoundingClientRect();
    if (rect.width <= 4 || rect.height <= 4) return;

    const dpr = window.devicePixelRatio || 1;
    const tw = Math.max(1, Math.floor(rect.width * dpr));
    const th = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isAppDark = document.documentElement && document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = isAppDark ? '#171920' : '#edece8';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const page = getSplitPaneActivePage();
    if (!page) {
      ctx.fillStyle = isAppDark ? '#9ca3af' : '#64748b';
      ctx.font = '600 13px Inter, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aucune page à afficher', rect.width * 0.5, rect.height * 0.5);
      ctx.restore();
      return;
    }

    const sv = state.splitView;
    const pw = page.pdfWidth || page.pageWidth || PAGE_WIDTH;
    const ph = page.pdfHeight || page.pageHeight || PAGE_HEIGHT;

    ctx.translate(sv.panX, sv.panY);
    ctx.scale(sv.zoom, sv.zoom);

    // Ombre de la feuille A4 / PDF dans le panneau secondaire
    ctx.save();
    ctx.shadowColor = isAppDark ? 'rgba(0,0,0,0.45)' : 'rgba(15,23,42,0.14)';
    ctx.shadowBlur = 22 / Math.max(0.4, sv.zoom);
    ctx.shadowOffsetY = 6 / Math.max(0.4, sv.zoom);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pw, ph);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();

    if (page.pdfId) {
      const splitPdfScale = Math.max(1.2, Math.min(4.0, dpr * sv.zoom * (pw / Math.max(1, page.pdfOriginalWidth || pw))));
      const entry = ensurePdfPageRendered(page, splitPdfScale, false);
      if (entry && entry.renderingPromise) {
        entry.renderingPromise.then(() => scheduleSplitPaneRender()).catch(() => {});
      }
    }

    const isDark = !page.pdfId && (page.paperTone === 'dark' || page.paperTone === 'blueprint');
    const cachedSurface = typeof ensureSplitOffscreenPageBitmap === 'function'
      ? ensureSplitOffscreenPageBitmap(page, pw, ph, Math.max(1, dpr * sv.zoom), isDark)
      : null;

    if (cachedSurface && typeof ctx.drawImage === 'function') {
      ctx.drawImage(cachedSurface, 0, 0, pw, ph);
    } else {
      drawPaperBackground(ctx, page, pw, ph, true);
      if (page.pdfId) {
        drawLockedPdfBackground(ctx, page, false);
      }
      (page.images || []).forEach((imgItem) => {
        const imgEl = getCachedThumbnailImage(imgItem);
        if (imgEl && typeof ctx.drawImage === 'function') {
          try { ctx.drawImage(imgEl, imgItem.x || 0, imgItem.y || 0, imgItem.width || 240, imgItem.height || 180); } catch (_) {}
        } else if (imgItem && imgItem.src && typeof Image !== 'undefined') {
          const loader = new Image();
          loader.onload = () => scheduleSplitPaneRender();
          loader.src = imgItem.src;
        }
      });
      (page.strokes || []).forEach((s) => { if (s.tool === 'highlighter') drawSingleStroke(ctx, s, isDark, false); });
      (page.shapes || []).forEach((sh) => drawGeometricShape(ctx, sh, false, isDark));
      (page.strokes || []).forEach((s) => { if (s.tool !== 'highlighter') drawSingleStroke(ctx, s, isDark, false); });
      (page.tapes || []).forEach((tp) => { if (!tp.revealed) drawTapeItem(ctx, tp, false); });
      drawTextBlocksOnCanvas(ctx, page.texts);
    }

    ctx.restore();
    ctx.restore();
  }

  function openSplitView(targetNbId = null, targetPageId = null) {
    const activeNbs = (state.notebooks || []).filter((n) => !n.trashedAt);
    if (!activeNbs.length) return false;
    let chosenNbId = targetNbId;
    if (!chosenNbId || !activeNbs.some((n) => n.id === chosenNbId)) {
      const otherOpenTab = (state.openNotebookTabIds || []).find((id) => id !== state.activeNotebookId && activeNbs.some((n) => n.id === id));
      const otherNb = activeNbs.find((n) => n.id !== state.activeNotebookId);
      chosenNbId = otherOpenTab || (otherNb ? otherNb.id : state.activeNotebookId);
    }
    state.splitView.open = true;
    state.splitView.notebookId = chosenNbId;
    const pages = getSplitPanePages();
    if (targetPageId && pages.some((p) => p.id === targetPageId)) {
      state.splitView.pageId = targetPageId;
    } else if (chosenNbId === state.activeNotebookId && pages.length > 1) {
      const curIdx = pages.findIndex((p) => p.id === state.activePageId);
      state.splitView.pageId = pages[(curIdx + 1) % pages.length].id;
    } else {
      state.splitView.pageId = pages[0] ? pages[0].id : null;
    }
    syncSplitViewUi();
    invalidateStaticInkCache();
    requestRender();
    setTimeout(() => {
      fitSplitPaneToWidth();
      invalidateStaticInkCache();
      requestRender();
    }, 30);
    return true;
  }

  function closeSplitView() {
    if (!state.splitView || !state.splitView.open) return false;
    state.splitView.open = false;
    state.splitView.isPanning = false;
    splitTouchPoints.clear();
    splitIsPinching = false;
    if (typeof releaseSplitOffscreenCache === 'function') releaseSplitOffscreenCache();
    syncSplitViewUi();
    invalidateStaticInkCache();
    requestRender();
    setTimeout(() => {
      invalidateStaticInkCache();
      requestRender();
    }, 30);
    return true;
  }

  function toggleSplitView() {
    if (state.splitView && state.splitView.open) return closeSplitView();
    return openSplitView();
  }

  function swapSplitViewPanes() {
    if (!state.splitView || !state.splitView.open) return false;
    const prevPrimaryNbId = state.activeNotebookId;
    const prevPrimaryPageId = state.activePageId;
    const targetNbId = state.splitView.notebookId;
    const targetPageId = state.splitView.pageId;
    if (!targetNbId) return false;

    state.splitView.notebookId = prevPrimaryNbId;
    state.splitView.pageId = prevPrimaryPageId;

    if (targetNbId !== prevPrimaryNbId) {
      openNotebookInTab(targetNbId, true);
    }
    if (targetPageId && state.activePageId !== targetPageId) {
      selectPage(targetPageId);
    }
    syncSplitViewUi();
    fitSplitPaneToWidth();
    showToast('Panneaux échangés');
    return true;
  }

  const splitNaturalCollator = (typeof Intl !== 'undefined' && typeof Intl.Collator === 'function')
    ? new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })
    : null;

  function compareSplitTitles(a, b) {
    const sa = String(a || '').trim();
    const sb = String(b || '').trim();
    if (splitNaturalCollator) return splitNaturalCollator.compare(sa, sb);
    return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
  }

  function getNotebookFolderPathLabel(nb) {
    if (!nb || !nb.folderId) return '';
    if (typeof getFolderPath === 'function') {
      const chain = getFolderPath(nb.folderId) || [];
      if (chain.length > 0) return chain.map((f) => f.name || 'Dossier').join(' / ');
    }
    const f = (state.folders || []).find((x) => x.id === nb.folderId && !x.trashedAt);
    return f ? (f.name || 'Dossier') : '';
  }

  function getNotebookLastActivityTs(nb) {
    if (!nb) return 0;
    const pages = (state.pagesByNotebook.get(nb.id) || []).filter((p) => !p.trashedAt);
    let latest = Number(nb.updatedAt || nb.createdAt || 0);
    for (const p of pages) {
      const ts = Number(p.updatedAt || p.createdAt || 0);
      if (ts > latest) latest = ts;
    }
    return latest;
  }

  function positionSplitNotebookPopover() {
    const pop = document.getElementById('splitNotebookPopover');
    const caret = document.getElementById('splitNotebookPopoverCaret');
    const isTabMode = state.splitView && state.splitView.pickerMode === 'tab';
    const anchor = document.getElementById(isTabMode ? 'btnDocTabAdd' : 'btnSplitNotebookPicker');
    if (!pop || !anchor || typeof anchor.getBoundingClientRect !== 'function') return;
    const aR = anchor.getBoundingClientRect();
    const pR = pop.getBoundingClientRect();
    const popW = pR.width > 0 ? pR.width : 300;
    const popH = pR.height > 0 ? pR.height : 340;
    const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1200;
    const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800;

    let left = isTabMode ? Math.round(aR.left + aR.width * 0.5 - popW * 0.5) : Math.round(aR.left);
    left = Math.max(12, Math.min(vw - popW - 12, left));
    let top = Math.round(aR.bottom + 8);
    let flippedAbove = false;
    if (top + popH > vh - 12 && aR.top - popH - 8 >= 12) {
      top = Math.round(aR.top - popH - 8);
      flippedAbove = true;
    } else if (top + popH > vh - 12) {
      top = Math.max(12, vh - popH - 12);
    }
    pop.classList.toggle('flipped-above', flippedAbove);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    if (caret) {
      const anchorCenterX = isTabMode ? (aR.left + aR.width * 0.5) : (aR.left + Math.min(aR.width * 0.5, 80));
      const relX = Math.max(20, Math.min(popW - 20, anchorCenterX - left));
      caret.style.left = `${Math.round(relX)}px`;
    }
  }

  function closeSplitNotebookPopover() {
    if (!state.splitView) return;
    state.splitView.pickerOpen = false;
    const pop = document.getElementById('splitNotebookPopover');
    if (pop) {
      pop.classList.add('hidden');
      pop.classList.remove('flipped-above');
    }
    const triggerBtn = document.getElementById('btnSplitNotebookPicker');
    if (triggerBtn) {
      triggerBtn.classList.remove('open');
      triggerBtn.setAttribute('aria-expanded', 'false');
    }
    const tabAddBtn = document.getElementById('btnDocTabAdd');
    if (tabAddBtn) {
      tabAddBtn.classList.remove('open');
      tabAddBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function selectSplitNotebook(nbId) {
    if (!nbId) return;
    if (state.splitView && state.splitView.pickerMode === 'tab') {
      closeSplitNotebookPopover();
      openNotebookInTab(nbId, true);
      return;
    }
    state.splitView.notebookId = nbId;
    const pages = getSplitPanePages();
    if (nbId === state.activeNotebookId && pages.length > 1) {
      const curIdx = pages.findIndex((p) => p.id === state.activePageId);
      state.splitView.pageId = pages[(curIdx + 1) % pages.length].id;
    } else {
      state.splitView.pageId = pages[0] ? pages[0].id : null;
    }
    closeSplitNotebookPopover();
    syncSplitViewUi();
    fitSplitPaneToWidth();
  }

  function doesFolderContainNotebook(folderId, targetNbId) {
    if (!folderId || !targetNbId) return false;
    const targetNb = (state.notebooks || []).find((n) => n.id === targetNbId && !n.trashedAt);
    if (!targetNb || !targetNb.folderId) return false;
    if (targetNb.folderId === folderId) return true;
    const chain = typeof getFolderPath === 'function' ? (getFolderPath(targetNb.folderId) || []) : [];
    return chain.some((f) => f && f.id === folderId);
  }

  function renderSplitNotebookPickerList() {
    const listEl = document.getElementById('splitNbList');
    const bcEl = document.getElementById('splitNbBreadcrumb');
    if (!listEl) return;
    const sv = state.splitView;
    const sortMode = sv.sortMode || 'folders';
    const q = String(sv.searchQuery || '').trim().toLowerCase();

    const activeFolders = (state.folders || []).filter((f) => !f.trashedAt);
    if (sv.browseFolderId && !activeFolders.some((f) => f.id === sv.browseFolderId)) {
      sv.browseFolderId = null;
    }

    document.querySelectorAll('#splitNbSortPills .split-nb-sort-pill').forEach((pill) => {
      const isAct = pill.dataset.splitSort === sortMode;
      pill.classList.toggle('active', isAct);
      pill.setAttribute('aria-selected', String(isAct));
    });

    // Fil d'Ariane cliquable quand on a ouvert un dossier (en mode Dossiers hors recherche)
    if (bcEl) {
      const showBc = sortMode === 'folders' && !q && Boolean(sv.browseFolderId);
      bcEl.classList.toggle('hidden', !showBc);
      bcEl.innerHTML = '';
      if (showBc) {
        const chain = typeof getFolderPath === 'function' ? (getFolderPath(sv.browseFolderId) || []) : [];
        const parentId = chain.length >= 2 ? chain[chain.length - 2].id : null;

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'split-nb-back-btn';
        backBtn.title = 'Remonter au dossier parent';
        backBtn.setAttribute('aria-label', 'Remonter au dossier parent');
        backBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
        backBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          sv.browseFolderId = parentId;
          renderSplitNotebookPickerList();
        });
        bcEl.appendChild(backBtn);

        const rootCrumb = document.createElement('button');
        rootCrumb.type = 'button';
        rootCrumb.className = 'split-nb-crumb';
        rootCrumb.textContent = 'Dossiers';
        rootCrumb.addEventListener('click', (ev) => {
          ev.stopPropagation();
          sv.browseFolderId = null;
          renderSplitNotebookPickerList();
        });
        bcEl.appendChild(rootCrumb);

        chain.forEach((fld, idx) => {
          const sep = document.createElement('span');
          sep.className = 'split-nb-crumb-sep';
          sep.textContent = '›';
          bcEl.appendChild(sep);

          const isLast = idx === chain.length - 1;
          const cBtn = document.createElement('button');
          cBtn.type = 'button';
          cBtn.className = `split-nb-crumb${isLast ? ' current' : ''}`;
          cBtn.textContent = fld.name || 'Dossier';
          if (!isLast) {
            cBtn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              sv.browseFolderId = fld.id;
              renderSplitNotebookPickerList();
            });
          }
          bcEl.appendChild(cBtn);
        });
      }
    }

    const isTabMode = sv.pickerMode === 'tab';
    const openTabSet = new Set(state.openNotebookTabIds || []);
    const activeNbs = (state.notebooks || []).filter((n) => !n.trashedAt);
    const enrichNb = (nb) => {
      const pages = (state.pagesByNotebook.get(nb.id) || []).filter((p) => !p.trashedAt);
      const folderPath = getNotebookFolderPathLabel(nb);
      const isPdf = pages.some((p) => Boolean(p.pdfId));
      return {
        nb,
        title: nb.title || 'Sans titre',
        folderPath,
        pageCount: pages.length,
        isPdf,
        isActivePrimary: nb.id === state.activeNotebookId,
        isOpenInTab: isTabMode && openTabSet.has(nb.id) && nb.id !== state.activeNotebookId,
        isSelected: isTabMode ? (nb.id === state.activeNotebookId) : (nb.id === sv.notebookId),
        lastTs: getNotebookLastActivityTs(nb)
      };
    };

    const appendFolderRow = (fld, showParentSub = false) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'split-nb-folder-row';
      row.dataset.splitFolderId = fld.id;

      const ico = document.createElement('span');
      ico.className = 'split-nb-folder-ico';
      const col = fld.color || '#0072ce';
      ico.style.color = col;
      ico.style.background = `${col}1c`;
      ico.innerHTML = (typeof FOLDER_ICON_SVGS === 'object' && FOLDER_ICON_SVGS[fld.icon]) ? FOLDER_ICON_SVGS[fld.icon] : (FOLDER_ICON_SVGS.folder || '');
      row.appendChild(ico);

      const main = document.createElement('span');
      main.className = 'split-nb-item-main';
      const titleEl = document.createElement('span');
      titleEl.className = 'split-nb-item-title';
      titleEl.textContent = fld.name || 'Sans nom';
      main.appendChild(titleEl);
      if (showParentSub && fld.parentId) {
        const pChain = typeof getFolderPath === 'function' ? (getFolderPath(fld.parentId) || []) : [];
        if (pChain.length) {
          const subEl = document.createElement('span');
          subEl.className = 'split-nb-item-sub';
          subEl.textContent = pChain.map((x) => x.name || 'Dossier').join(' / ');
          main.appendChild(subEl);
        }
      }
      row.appendChild(main);

      const right = document.createElement('span');
      right.className = 'split-nb-item-right';
      const highlightTargetId = isTabMode ? state.activeNotebookId : sv.notebookId;
      if (doesFolderContainNotebook(fld.id, highlightTargetId)) {
        const dot = document.createElement('span');
        dot.className = 'split-nb-folder-active-dot';
        dot.title = 'Contient le fichier actuellement affiché';
        right.appendChild(dot);
      }
      const counts = typeof getFolderItemCounts === 'function' ? getFolderItemCounts(fld.id) : { notebooks: 0, total: 0 };
      const countEl = document.createElement('span');
      countEl.className = 'split-nb-folder-count';
      countEl.textContent = String(counts.notebooks || counts.total || 0);
      right.appendChild(countEl);

      const chev = document.createElement('span');
      chev.className = 'split-nb-folder-chevron';
      chev.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
      right.appendChild(chev);
      row.appendChild(right);

      row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        sv.sortMode = 'folders';
        sv.browseFolderId = fld.id;
        if (sv.searchQuery) {
          sv.searchQuery = '';
          const searchInput = document.getElementById('splitNbSearchInput');
          if (searchInput) searchInput.value = '';
        }
        renderSplitNotebookPickerList();
      });
      listEl.appendChild(row);
    };

    const appendRow = (entry, showFolderSub) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `split-nb-item${entry.isSelected ? ' selected' : ''}`;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(entry.isSelected));
      btn.dataset.splitNbId = entry.nb.id;

      const dot = document.createElement('span');
      dot.className = 'split-nb-item-dot';
      dot.style.background = entry.nb.coverColor || entry.nb.color || '#0072ce';
      btn.appendChild(dot);

      const main = document.createElement('span');
      main.className = 'split-nb-item-main';
      const titleEl = document.createElement('span');
      titleEl.className = 'split-nb-item-title';
      titleEl.textContent = entry.title;
      main.appendChild(titleEl);
      if (showFolderSub && entry.folderPath) {
        const subEl = document.createElement('span');
        subEl.className = 'split-nb-item-sub';
        subEl.textContent = entry.folderPath;
        main.appendChild(subEl);
      }
      btn.appendChild(main);

      const right = document.createElement('span');
      right.className = 'split-nb-item-right';
      if (entry.isPdf) {
        const pdfTag = document.createElement('span');
        pdfTag.className = 'split-nb-item-tag pdf-doc';
        pdfTag.textContent = 'PDF';
        right.appendChild(pdfTag);
      }
      if (entry.isActivePrimary) {
        const actTag = document.createElement('span');
        actTag.className = 'split-nb-item-tag active-doc';
        actTag.textContent = 'Actif';
        right.appendChild(actTag);
      } else if (entry.isOpenInTab) {
        const openTag = document.createElement('span');
        openTag.className = 'split-nb-item-tag open-tab';
        openTag.textContent = 'Ouvert';
        right.appendChild(openTag);
      }
      const pagesEl = document.createElement('span');
      pagesEl.className = 'split-nb-item-pages';
      pagesEl.textContent = `${entry.pageCount} p.`;
      right.appendChild(pagesEl);

      if (entry.isSelected) {
        const chk = document.createElement('span');
        chk.className = 'split-nb-item-check';
        chk.innerHTML = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 10.5 8.2 14.8 16.5 6.2"></polyline></svg>';
        right.appendChild(chk);
      }
      btn.appendChild(right);

      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        selectSplitNotebook(entry.nb.id);
      });
      listEl.appendChild(btn);
    };

    listEl.innerHTML = '';

    // Cas 1 : Recherche active -> affiche les dossiers correspondants (cliquables) puis les fichiers correspondants
    if (q) {
      const matchingFolders = activeFolders
        .filter((f) => String(f.name || '').toLowerCase().includes(q))
        .sort((a, b) => compareSplitTitles(a.name, b.name));
      const matchingNbs = activeNbs
        .map(enrichNb)
        .filter((entry) => entry.title.toLowerCase().includes(q) || entry.folderPath.toLowerCase().includes(q))
        .sort((a, b) => compareSplitTitles(a.title, b.title));

      if (matchingFolders.length === 0 && matchingNbs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'split-nb-empty';
        empty.textContent = 'Aucun dossier ou fichier ne correspond.';
        listEl.appendChild(empty);
        return;
      }
      matchingFolders.forEach((f) => appendFolderRow(f, true));
      matchingNbs.forEach((entry) => appendRow(entry, true));
      return;
    }

    // Cas 2 : Mode "Dossiers" navigable niveau par niveau (cliquer sur un dossier ouvre uniquement son contenu)
    if (sortMode === 'folders') {
      const curFolderId = sv.browseFolderId || null;
      const directSubfolders = activeFolders
        .filter((f) => (f.parentId || null) === curFolderId)
        .sort((a, b) => compareSplitTitles(a.name, b.name));
      const directNbs = activeNbs
        .filter((nb) => (nb.folderId || null) === curFolderId)
        .map(enrichNb)
        .sort((a, b) => compareSplitTitles(a.title, b.title));

      if (directSubfolders.length === 0 && directNbs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'split-nb-empty';
        empty.textContent = curFolderId ? 'Ce dossier est vide.' : 'Aucun cahier disponible.';
        listEl.appendChild(empty);
        return;
      }

      directSubfolders.forEach((fld) => appendFolderRow(fld, false));
      if (directSubfolders.length > 0 && directNbs.length > 0 && !curFolderId) {
        const sep = document.createElement('div');
        sep.className = 'split-nb-group-label';
        sep.textContent = 'Hors dossier';
        listEl.appendChild(sep);
      }
      directNbs.forEach((entry) => appendRow(entry, false));
      return;
    }

    // Cas 3 : Modes plats "A–Z" ou "Récents"
    const allEnriched = activeNbs.map(enrichNb);
    if (allEnriched.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'split-nb-empty';
      empty.textContent = 'Aucun cahier disponible.';
      listEl.appendChild(empty);
      return;
    }
    if (sortMode === 'recent') {
      allEnriched.sort((a, b) => (b.lastTs - a.lastTs) || compareSplitTitles(a.title, b.title));
    } else {
      allEnriched.sort((a, b) => compareSplitTitles(a.title, b.title));
    }
    allEnriched.forEach((entry) => appendRow(entry, true));
  }

  function openSplitNotebookPopover(mode = 'split') {
    const pop = document.getElementById('splitNotebookPopover');
    if (!pop) return;
    const nextMode = mode === 'tab' ? 'tab' : 'split';
    state.splitView.pickerOpen = true;
    state.splitView.pickerMode = nextMode;
    state.splitView.searchQuery = '';
    state.splitView.browseFolderId = null;
    pop.setAttribute('aria-label', nextMode === 'tab' ? 'Ouvrir un cahier dans un onglet' : 'Choisir un fichier pour la vue divisée');
    const footer = document.getElementById('splitNbFooter');
    if (footer) footer.classList.toggle('hidden', nextMode !== 'tab');
    const tabAddBtn = document.getElementById('btnDocTabAdd');
    if (tabAddBtn) {
      tabAddBtn.classList.toggle('open', nextMode === 'tab');
      tabAddBtn.setAttribute('aria-expanded', String(nextMode === 'tab'));
    }
    const splitTriggerBtn = document.getElementById('btnSplitNotebookPicker');
    if (splitTriggerBtn) {
      splitTriggerBtn.classList.toggle('open', nextMode !== 'tab');
      splitTriggerBtn.setAttribute('aria-expanded', String(nextMode !== 'tab'));
    }
    const searchInput = document.getElementById('splitNbSearchInput');
    if (searchInput) searchInput.value = '';
    pop.classList.remove('hidden');
    if (nextMode !== 'tab') syncSplitViewUi();
    renderSplitNotebookPickerList();
    positionSplitNotebookPopover();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => positionSplitNotebookPopover());
    }
    if (searchInput) {
      setTimeout(() => { try { searchInput.focus(); } catch (_) {} }, 20);
    }
  }

  function bindSplitViewEvents() {
    try {
      const savedSort = localStorage.getItem('inkflow_split_sort_v1');
      if (savedSort === 'folders' || savedSort === 'alpha' || savedSort === 'recent') {
        state.splitView.sortMode = savedSort;
      }
    } catch (_) {}

    const btnToggle = document.getElementById('btnToggleSplitView');
    if (btnToggle) {
      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSplitView();
      });
    }
    const btnClose = document.getElementById('btnSplitClose');
    if (btnClose) btnClose.addEventListener('click', () => closeSplitView());

    const btnSwap = document.getElementById('btnSplitSwapPanes');
    if (btnSwap) btnSwap.addEventListener('click', () => swapSplitViewPanes());

    const btnPicker = document.getElementById('btnSplitNotebookPicker');
    if (btnPicker) {
      btnPicker.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.splitView.pickerOpen && state.splitView.pickerMode !== 'tab') closeSplitNotebookPopover();
        else openSplitNotebookPopover('split');
      });
    }

    const btnCreateNew = document.getElementById('btnSplitNbCreateNew');
    if (btnCreateNew) {
      btnCreateNew.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeSplitNotebookPopover();
        const activeNbs = (state.notebooks || []).filter((n) => !n.trashedAt);
        const count = activeNbs.length + 1;
        const nb = await paidCreateNotebook(`Cahier ${count}`);
        if (nb && nb.notebook && nb.notebook.id) {
          openNotebookInTab(nb.notebook.id, true);
        }
      });
    }

    const searchInput = document.getElementById('splitNbSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.splitView.searchQuery = searchInput.value || '';
        renderSplitNotebookPickerList();
      });
      searchInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSplitNotebookPopover();
        } else if (e.key === 'Backspace' && !searchInput.value && state.splitView.browseFolderId) {
          e.preventDefault();
          const chain = typeof getFolderPath === 'function' ? (getFolderPath(state.splitView.browseFolderId) || []) : [];
          state.splitView.browseFolderId = chain.length >= 2 ? chain[chain.length - 2].id : null;
          renderSplitNotebookPickerList();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const firstItem = document.querySelector('#splitNbList .split-nb-item');
          if (firstItem && firstItem.dataset.splitNbId) {
            selectSplitNotebook(firstItem.dataset.splitNbId);
          } else {
            const firstFolder = document.querySelector('#splitNbList .split-nb-folder-row');
            if (firstFolder && firstFolder.dataset.splitFolderId) {
              state.splitView.sortMode = 'folders';
              state.splitView.browseFolderId = firstFolder.dataset.splitFolderId;
              state.splitView.searchQuery = '';
              searchInput.value = '';
              renderSplitNotebookPickerList();
            }
          }
        }
      });
    }

    document.querySelectorAll('#splitNbSortPills .split-nb-sort-pill').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = pill.dataset.splitSort;
        if (mode === 'folders' || mode === 'alpha' || mode === 'recent') {
          state.splitView.sortMode = mode;
          try { localStorage.setItem('inkflow_split_sort_v1', mode); } catch (_) {}
          renderSplitNotebookPickerList();
        }
      });
    });

    document.addEventListener('pointerdown', (e) => {
      if (!state.splitView || !state.splitView.pickerOpen) return;
      if (e.target && typeof e.target.closest === 'function' && (
        e.target.closest('#splitNotebookPopover') ||
        e.target.closest('#btnSplitNotebookPicker') ||
        e.target.closest('#btnDocTabAdd')
      )) {
        return;
      }
      closeSplitNotebookPopover();
    });

    const btnPrev = document.getElementById('btnSplitPrevPage');
    const btnNext = document.getElementById('btnSplitNextPage');
    const stepSplitPage = (delta) => {
      const pages = getSplitPanePages();
      if (!pages.length) return;
      const curIdx = Math.max(0, pages.findIndex((p) => p.id === state.splitView.pageId));
      const nextIdx = Math.max(0, Math.min(pages.length - 1, curIdx + delta));
      if (pages[nextIdx]) {
        state.splitView.pageId = pages[nextIdx].id;
        syncSplitViewUi();
        fitSplitPaneToWidth();
      }
    };
    if (btnPrev) btnPrev.addEventListener('click', () => stepSplitPage(-1));
    if (btnNext) btnNext.addEventListener('click', () => stepSplitPage(1));

    const btnZoomOut = document.getElementById('btnSplitZoomOut');
    const btnZoomIn = document.getElementById('btnSplitZoomIn');
    const btnZoomFit = document.getElementById('btnSplitZoomFit');
    const btnFloatZoomOut = document.getElementById('btnSplitFloatZoomOut');
    const btnFloatZoomIn = document.getElementById('btnSplitFloatZoomIn');
    const btnFloatZoomFit = document.getElementById('btnSplitFloatZoomFit');
    const bindZoomClick = (el, fn) => {
      if (!el) return;
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
    };
    bindZoomClick(btnZoomOut, () => applySplitZoom(1 / 1.18));
    bindZoomClick(btnZoomIn, () => applySplitZoom(1.18));
    bindZoomClick(btnZoomFit, () => fitSplitPaneToWidth());
    bindZoomClick(btnFloatZoomOut, () => applySplitZoom(1 / 1.18));
    bindZoomClick(btnFloatZoomIn, () => applySplitZoom(1.18));
    bindZoomClick(btnFloatZoomFit, () => fitSplitPaneToWidth());

    // Pan (1 doigt / souris) + Pinch-to-Zoom (2 doigts tactiles) + Ctrl+Molette sur le viewport secondaire
    const vp = document.getElementById('splitViewport');
    if (vp) {
      let splitPanPointerId = null;
      vp.addEventListener('pointerdown', (e) => {
        if (e.target && typeof e.target.closest === 'function' && e.target.closest('.split-floating-zoom-bar')) {
          return;
        }
        if (e.pointerType === 'touch') {
          splitTouchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (splitTouchPoints.size >= 2) {
            state.splitView.isPanning = false;
            splitPanPointerId = null;
            splitIsPinching = true;
            const pts = Array.from(splitTouchPoints.values());
            splitPinchLastDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            splitPinchLastCenter = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
            try { if (typeof e.pointerId === 'number') vp.setPointerCapture(e.pointerId); } catch (_) {}
            return;
          }
        }
        state.splitView.isPanning = true;
        splitPanPointerId = e.pointerId;
        state.splitView.panStartScreen = { x: e.clientX, y: e.clientY };
        state.splitView.panStartOffset = { x: state.splitView.panX, y: state.splitView.panY };
        try { if (typeof e.pointerId === 'number') vp.setPointerCapture(e.pointerId); } catch (_) {}
      });
      vp.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' && splitTouchPoints.has(e.pointerId)) {
          splitTouchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (splitIsPinching && splitTouchPoints.size >= 2) {
            if (e.cancelable) e.preventDefault();
            const pts = Array.from(splitTouchPoints.values());
            const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            const newCenter = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
            const rect = vp.getBoundingClientRect();
            if (splitPinchLastDist > 10 && newDist > 10) {
              const factor = newDist / splitPinchLastDist;
              applySplitZoom(factor, newCenter.x - rect.left, newCenter.y - rect.top);
            }
            state.splitView.panX += (newCenter.x - splitPinchLastCenter.x);
            state.splitView.panY += (newCenter.y - splitPinchLastCenter.y);
            splitPinchLastDist = newDist;
            splitPinchLastCenter = newCenter;
            scheduleSplitPaneRender();
            return;
          }
        }
        if (!state.splitView.isPanning) return;
        if (splitPanPointerId !== null && e.pointerId !== undefined && e.pointerId !== splitPanPointerId) return;
        state.splitView.panX = state.splitView.panStartOffset.x + (e.clientX - state.splitView.panStartScreen.x);
        state.splitView.panY = state.splitView.panStartOffset.y + (e.clientY - state.splitView.panStartScreen.y);
        scheduleSplitPaneRender();
      });
      const endPan = (e) => {
        if (e.pointerType === 'touch') {
          const wasPinching = splitIsPinching;
          splitTouchPoints.delete(e.pointerId);
          if (splitTouchPoints.size < 2) {
            splitIsPinching = false;
            if (wasPinching && splitTouchPoints.size === 1) {
              const [restId, restPt] = Array.from(splitTouchPoints.entries())[0];
              state.splitView.isPanning = true;
              splitPanPointerId = restId;
              state.splitView.panStartScreen = { x: restPt.x, y: restPt.y };
              state.splitView.panStartOffset = { x: state.splitView.panX, y: state.splitView.panY };
              try { if (typeof e.pointerId === 'number') vp.releasePointerCapture(e.pointerId); } catch (_) {}
              return;
            }
          } else if (wasPinching) {
            const pts = Array.from(splitTouchPoints.values());
            splitPinchLastDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            splitPinchLastCenter = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
          }
          if (wasPinching) {
            try { if (typeof e.pointerId === 'number') vp.releasePointerCapture(e.pointerId); } catch (_) {}
            return;
          }
        }
        if (!state.splitView.isPanning) return;
        state.splitView.isPanning = false;
        splitPanPointerId = null;
        try { if (typeof e.pointerId === 'number') vp.releasePointerCapture(e.pointerId); } catch (_) {}
      };
      vp.addEventListener('pointerup', endPan);
      vp.addEventListener('pointercancel', endPan);
      vp.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          const rect = vp.getBoundingClientRect();
          const absY = Math.abs(e.deltaY || 0);
          const factor = absY > 0 && absY < 40
            ? Math.exp(-(e.deltaY || 0) * 0.008)
            : (e.deltaY < 0 ? 1.15 : 1 / 1.15);
          applySplitZoom(factor, e.clientX - rect.left, e.clientY - rect.top);
        } else if (e.shiftKey && !e.deltaX) {
          state.splitView.panX -= e.deltaY || 0;
          scheduleSplitPaneRender();
        } else {
          state.splitView.panX -= e.deltaX || 0;
          state.splitView.panY -= e.deltaY || 0;
          scheduleSplitPaneRender();
        }
      }, { passive: false });
      vp.addEventListener('dblclick', (e) => {
        if (e.target && typeof e.target.closest === 'function' && e.target.closest('.split-floating-zoom-bar')) {
          return;
        }
        const rect = vp.getBoundingClientRect();
        const page = getSplitPaneActivePage();
        const fitZ = getSplitFitZoom(page, rect);
        if (Math.abs((state.splitView.zoom || fitZ) - fitZ) < 0.08) {
          applySplitZoom(1.75, e.clientX - rect.left, e.clientY - rect.top);
        } else {
          fitSplitPaneToWidth();
        }
      });
    }

    // Séparateur vertical redimensionnable (25% à 75%, double-clic = 50/50)
    const resizer = document.getElementById('splitResizer');
    const shell = document.getElementById('workspaceSplitShell');
    if (resizer && shell) {
      let dragging = false;
      resizer.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dragging = true;
        resizer.classList.add('dragging');
        try { if (typeof e.pointerId === 'number') resizer.setPointerCapture(e.pointerId); } catch (_) {}
      });
      resizer.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const rect = shell.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = Math.max(0.25, Math.min(0.75, (e.clientX - rect.left) / rect.width));
        state.splitView.ratio = ratio;
        if (shell.style && typeof shell.style.setProperty === 'function') {
          shell.style.setProperty('--split-primary-width', `${(ratio * 100).toFixed(2)}%`);
        }
        invalidateStaticInkCache();
        requestRender();
        scheduleSplitPaneRender();
        if (state.splitView.pickerOpen) positionSplitNotebookPopover();
      });
      const stopDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        resizer.classList.remove('dragging');
        try { if (typeof e.pointerId === 'number') resizer.releasePointerCapture(e.pointerId); } catch (_) {}
        invalidateStaticInkCache();
        requestRender();
        scheduleSplitPaneRender();
      };
      resizer.addEventListener('pointerup', stopDrag);
      resizer.addEventListener('pointercancel', stopDrag);
      resizer.addEventListener('dblclick', () => {
        state.splitView.ratio = 0.5;
        if (shell.style && typeof shell.style.setProperty === 'function') {
          shell.style.setProperty('--split-primary-width', '50%');
        }
        invalidateStaticInkCache();
        requestRender();
        fitSplitPaneToWidth();
      });
    }

    // Raccourci clavier Ctrl+\ pour basculer Split View + resize fenêtre
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        if (state.detentePageOpen) return;
        e.preventDefault();
        toggleSplitView();
      }
    });
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', () => {
        if (state.splitView && state.splitView.open) {
          scheduleSplitPaneRender();
          if (state.splitView.pickerOpen) positionSplitNotebookPopover();
        }
      });
    }
  }

  // --- #1 RÈGLE GRADUÉE VIRTUELLE ROTATIVE ---
  const RULER_SNAP_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, -30, -45, -60, -90, -120, -135, -150, -180];

  function normalizeRulerAngle(rawDeg, allowSnap = true) {
    let deg = ((rawDeg + 180) % 360 + 360) % 360 - 180;
    let snapped = false;
    if (allowSnap) {
      for (const target of RULER_SNAP_ANGLES) {
        if (Math.abs(deg - target) <= 2.5) {
          deg = target === -180 ? 180 : target;
          snapped = true;
          break;
        }
      }
    }
    return { angleDeg: deg, snapped };
  }

  function renderVirtualRuler() {
    if (typeof document === 'undefined') return;
    const overlay = document.getElementById('virtualRulerOverlay');
    const canvas = document.getElementById('virtualRulerCanvas');
    const readout = document.getElementById('rulerAngleReadout');
    const toggleBtn = document.getElementById('btnToggleRuler');
    if (toggleBtn) toggleBtn.classList.toggle('active', virtualRulerState.visible);
    if (!overlay) return;
    if (!virtualRulerState.visible) {
      overlay.classList.add('hidden');
      return;
    }
    overlay.classList.remove('hidden');
    const len = virtualRulerState.length;
    const thick = virtualRulerState.thickness;
    overlay.style.width = `${len}px`;
    overlay.style.height = `${thick}px`;
    overlay.style.transform = `translate(${Math.round(virtualRulerState.cx - len * 0.5)}px, ${Math.round(virtualRulerState.cy - thick * 0.5)}px) rotate(${virtualRulerState.angleDeg.toFixed(2)}deg)`;

    if (readout) {
      let disp = Math.round(virtualRulerState.angleDeg);
      if (disp === -0 || disp === 180 || disp === -180) disp = Math.abs(disp);
      readout.textContent = `${disp}°`;
      readout.classList.toggle('snapped', Boolean(virtualRulerState.snapped));
    }

    if (!canvas || typeof canvas.getContext !== 'function') return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const cw = Math.round(len * dpr);
    const ch = Math.round(thick * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const rctx = canvas.getContext('2d');
    if (!rctx) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    rctx.save();
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rctx.clearRect(0, 0, len, thick);

    // Corps translucide acrylique
    rctx.fillStyle = isDark ? 'rgba(34, 39, 52, 0.82)' : 'rgba(255, 255, 255, 0.84)';
    rctx.fillRect(0, 0, len, thick);

    // Bandes subtiles le long des bords actifs
    rctx.fillStyle = isDark ? 'rgba(96, 165, 250, 0.14)' : 'rgba(0, 114, 206, 0.08)';
    rctx.fillRect(0, 0, len, 6);
    rctx.fillRect(0, thick - 6, len, 6);

    // Bordure nette
    rctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(15, 23, 42, 0.24)';
    rctx.lineWidth = 1.2;
    rctx.strokeRect(0.6, 0.6, len - 1.2, thick - 1.2);

    // Ligne médiane pointillée
    rctx.save();
    rctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(15, 23, 42, 0.12)';
    rctx.setLineDash([5, 5]);
    rctx.beginPath();
    rctx.moveTo(46, thick * 0.5);
    rctx.lineTo(len - 46, thick * 0.5);
    rctx.stroke();
    rctx.restore();

    // Graduations mm / 0.5 cm / cm sur les deux bords (37.8 px ≈ 1 cm)
    const pxPerCm = 37.8;
    const pxPerMm = pxPerCm / 10;
    const startX = 48;
    const endX = len - 48;
    const tickColor = isDark ? 'rgba(241, 245, 249, 0.78)' : 'rgba(15, 23, 42, 0.72)';
    const minorColor = isDark ? 'rgba(203, 213, 225, 0.42)' : 'rgba(51, 65, 85, 0.36)';
    rctx.font = '600 9.5px system-ui, -apple-system, sans-serif';
    rctx.textAlign = 'center';

    let mmIndex = 0;
    for (let x = startX; x <= endX + 0.5; x += pxPerMm, mmIndex++) {
      const isCm = mmIndex % 10 === 0;
      const isHalf = !isCm && mmIndex % 5 === 0;
      const tickLen = isCm ? 14 : (isHalf ? 9.5 : 5.5);
      rctx.strokeStyle = isCm ? tickColor : minorColor;
      rctx.lineWidth = isCm ? 1.25 : 0.9;

      // Bord supérieur
      rctx.beginPath();
      rctx.moveTo(x, 0);
      rctx.lineTo(x, tickLen);
      rctx.stroke();

      // Bord inférieur
      rctx.beginPath();
      rctx.moveTo(x, thick);
      rctx.lineTo(x, thick - tickLen);
      rctx.stroke();

      if (isCm) {
        const cmVal = mmIndex / 10;
        // Évite de chevaucher le badge d'angle au centre
        if (Math.abs(x - len * 0.5) > 52) {
          rctx.fillStyle = tickColor;
          rctx.fillText(String(cmVal), x, 24);
        }
      }
    }
    rctx.restore();
  }

  function toggleVirtualRuler(forceState) {
    const next = typeof forceState === 'boolean' ? forceState : !virtualRulerState.visible;
    virtualRulerState.visible = next;
    virtualRulerState.activeEdge = null;
    if (next && !virtualRulerState.positioned && dom.canvasViewport) {
      const rect = dom.canvasViewport.getBoundingClientRect();
      if (rect && rect.width > 100 && rect.height > 100) {
        virtualRulerState.cx = Math.round(rect.width * 0.5);
        virtualRulerState.cy = Math.round(Math.max(190, rect.height * 0.46));
        virtualRulerState.length = Math.min(680, Math.max(380, Math.round(rect.width * 0.62)));
        virtualRulerState.positioned = true;
      }
    }
    renderVirtualRuler();
    return virtualRulerState.visible;
  }

  function snapWorldPointToVirtualRuler(worldPt, isStart = false) {
    if (!virtualRulerState.visible || !worldPt || !Number.isFinite(worldPt.x) || !Number.isFinite(worldPt.y)) {
      if (isStart) virtualRulerState.activeEdge = null;
      return worldPt;
    }
    const zoom = Math.max(0.05, state.zoom || 1);
    const sx = worldPt.x * zoom + (state.panX || 0);
    const sy = worldPt.y * zoom + (state.panY || 0);
    const rad = (virtualRulerState.angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = sx - virtualRulerState.cx;
    const dy = sy - virtualRulerState.cy;
    // Coordonnées locales dans le repère de la règle
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const halfLen = virtualRulerState.length * 0.5;
    const halfThick = virtualRulerState.thickness * 0.5;
    const snapBand = 28;

    if (isStart) {
      if (Math.abs(lx) <= halfLen + snapBand) {
        const distTop = Math.abs(ly - (-halfThick));
        const distBot = Math.abs(ly - halfThick);
        if (distTop <= snapBand && distTop <= distBot) {
          virtualRulerState.activeEdge = 'top';
        } else if (distBot <= snapBand) {
          virtualRulerState.activeEdge = 'bottom';
        } else {
          virtualRulerState.activeEdge = null;
        }
      } else {
        virtualRulerState.activeEdge = null;
      }
    }

    if (!virtualRulerState.activeEdge) return worldPt;
    const targetLy = virtualRulerState.activeEdge === 'top' ? -(halfThick + 1.5) : (halfThick + 1.5);
    const projSx = virtualRulerState.cx + lx * cos - targetLy * sin;
    const projSy = virtualRulerState.cy + lx * sin + targetLy * cos;
    return {
      x: (projSx - (state.panX || 0)) / zoom,
      y: (projSy - (state.panY || 0)) / zoom
    };
  }

  function initVirtualRulerEvents() {
    if (typeof document === 'undefined') return;
    const btnToggle = document.getElementById('btnToggleRuler');
    const overlay = document.getElementById('virtualRulerOverlay');
    const btnClose = document.getElementById('btnCloseRuler');
    const rotLeft = document.getElementById('rulerRotateLeft');
    const rotRight = document.getElementById('rulerRotateRight');

    if (btnToggle) {
      btnToggle.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleVirtualRuler();
      });
    }
    if (btnClose) {
      btnClose.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleVirtualRuler(false);
      });
    }
    if (!overlay) return;

    const rulerTouchMap = new Map();
    let dragMode = null; // 'move' | 'rotate' | 'two-finger'
    let dragStartX = 0;
    let dragStartY = 0;
    let origCx = 0;
    let origCy = 0;
    let origAngle = 0;
    let startHandleAngle = 0;
    let twoFingerStartAngle = 0;
    let twoFingerStartMid = null;

    function getViewportOffset() {
      const r = dom.canvasViewport ? dom.canvasViewport.getBoundingClientRect() : { left: 0, top: 0 };
      return { left: r.left || 0, top: r.top || 0 };
    }

    const startRotateDrag = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const vp = getViewportOffset();
      const px = ev.clientX - vp.left;
      const py = ev.clientY - vp.top;
      dragMode = 'rotate';
      origAngle = virtualRulerState.angleDeg;
      startHandleAngle = Math.atan2(py - virtualRulerState.cy, px - virtualRulerState.cx) * (180 / Math.PI);
      overlay.classList.add('dragging');
      try { if (typeof ev.pointerId === 'number') ev.currentTarget.setPointerCapture(ev.pointerId); } catch (_) {}
    };

    const moveRotateDrag = (ev) => {
      if (dragMode !== 'rotate') return;
      ev.stopPropagation();
      const vp = getViewportOffset();
      const px = ev.clientX - vp.left;
      const py = ev.clientY - vp.top;
      const curAngle = Math.atan2(py - virtualRulerState.cy, px - virtualRulerState.cx) * (180 / Math.PI);
      const res = normalizeRulerAngle(origAngle + (curAngle - startHandleAngle), !ev.altKey);
      virtualRulerState.angleDeg = res.angleDeg;
      virtualRulerState.snapped = res.snapped;
      renderVirtualRuler();
    };

    const endRotateDrag = (ev) => {
      if (dragMode !== 'rotate') return;
      dragMode = null;
      overlay.classList.remove('dragging');
      try { if (typeof ev.pointerId === 'number') ev.currentTarget.releasePointerCapture(ev.pointerId); } catch (_) {}
    };

    [rotLeft, rotRight].forEach((handle) => {
      if (!handle) return;
      handle.addEventListener('pointerdown', startRotateDrag);
      handle.addEventListener('pointermove', moveRotateDrag);
      handle.addEventListener('pointerup', endRotateDrag);
      handle.addEventListener('pointercancel', endRotateDrag);
    });

    overlay.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.ruler-rotate-handle') || ev.target.closest('.ruler-close-btn')) return;
      ev.stopPropagation();
      ev.preventDefault();
      if (ev.pointerType === 'touch') {
        rulerTouchMap.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      }
      if (rulerTouchMap.size >= 2) {
        const pts = Array.from(rulerTouchMap.values());
        dragMode = 'two-finger';
        origCx = virtualRulerState.cx;
        origCy = virtualRulerState.cy;
        origAngle = virtualRulerState.angleDeg;
        twoFingerStartMid = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
        twoFingerStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * (180 / Math.PI);
      } else {
        dragMode = 'move';
        dragStartX = ev.clientX;
        dragStartY = ev.clientY;
        origCx = virtualRulerState.cx;
        origCy = virtualRulerState.cy;
      }
      overlay.classList.add('dragging');
      try { if (typeof ev.pointerId === 'number') overlay.setPointerCapture(ev.pointerId); } catch (_) {}
    });

    overlay.addEventListener('pointermove', (ev) => {
      if (!dragMode || dragMode === 'rotate') return;
      ev.stopPropagation();
      if (ev.pointerType === 'touch' && rulerTouchMap.has(ev.pointerId)) {
        rulerTouchMap.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      }
      if (dragMode === 'two-finger' && rulerTouchMap.size >= 2 && twoFingerStartMid) {
        const pts = Array.from(rulerTouchMap.values());
        const mid = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
        const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * (180 / Math.PI);
        virtualRulerState.cx = origCx + (mid.x - twoFingerStartMid.x);
        virtualRulerState.cy = origCy + (mid.y - twoFingerStartMid.y);
        const res = normalizeRulerAngle(origAngle + (ang - twoFingerStartAngle), true);
        virtualRulerState.angleDeg = res.angleDeg;
        virtualRulerState.snapped = res.snapped;
        renderVirtualRuler();
      } else if (dragMode === 'move') {
        virtualRulerState.cx = origCx + (ev.clientX - dragStartX);
        virtualRulerState.cy = origCy + (ev.clientY - dragStartY);
        renderVirtualRuler();
      }
    });

    const endBodyDrag = (ev) => {
      if (ev.pointerType === 'touch') rulerTouchMap.delete(ev.pointerId);
      if (rulerTouchMap.size < 2 && dragMode === 'two-finger') {
        dragMode = null;
      } else if (dragMode === 'move') {
        dragMode = null;
      }
      if (!dragMode) overlay.classList.remove('dragging');
      try { if (typeof ev.pointerId === 'number') overlay.releasePointerCapture(ev.pointerId); } catch (_) {}
    };
    overlay.addEventListener('pointerup', endBodyDrag);
    overlay.addEventListener('pointercancel', endBodyDrag);

    overlay.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const step = ev.shiftKey ? 5 : 1;
      const dir = ev.deltaY > 0 ? 1 : -1;
      const res = normalizeRulerAngle(virtualRulerState.angleDeg + dir * step, !ev.altKey && step >= 5);
      virtualRulerState.angleDeg = res.angleDeg;
      virtualRulerState.snapped = res.snapped;
      renderVirtualRuler();
    }, { passive: false });
  }

  // --- #3 RECADRAGE D'IMAGES (RECTANGLE & MAIN LEVÉE) ---
  const imageCropState = {
    open: false,
    imgItem: null,
    page: null,
    loadedImg: null,
    mode: 'rect', // 'rect' | 'freehand'
    rect: { x: 0.08, y: 0.08, w: 0.84, h: 0.84 },
    freehand: [],
    drawBox: { x: 0, y: 0, w: 520, h: 360 },
    dragAction: null,
    dragStart: null,
    dragOrigRect: null
  };

  function closeImageCropModal() {
    imageCropState.open = false;
    imageCropState.imgItem = null;
    imageCropState.page = null;
    imageCropState.loadedImg = null;
    imageCropState.dragAction = null;
    const modal = document.getElementById('modalImageCrop');
    if (modal) modal.classList.add('hidden');
  }

  function renderImageCropCanvas() {
    const canvas = document.getElementById('imageCropCanvas');
    const img = imageCropState.loadedImg;
    if (!canvas || !img) return;
    const cctx = canvas.getContext('2d');
    if (!cctx) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const pad = 16;
    const availW = cw - pad * 2;
    const availH = ch - pad * 2;
    const scale = Math.min(availW / Math.max(1, img.naturalWidth || img.width), availH / Math.max(1, img.naturalHeight || img.height));
    const dw = Math.round((img.naturalWidth || img.width) * scale);
    const dh = Math.round((img.naturalHeight || img.height) * scale);
    const dx = Math.round((cw - dw) * 0.5);
    const dy = Math.round((ch - dh) * 0.5);
    imageCropState.drawBox = { x: dx, y: dy, w: dw, h: dh };

    cctx.clearRect(0, 0, cw, ch);
    cctx.drawImage(img, dx, dy, dw, dh);

    if (imageCropState.mode === 'rect') {
      const r = imageCropState.rect;
      const rx = dx + r.x * dw;
      const ry = dy + r.y * dh;
      const rw = r.w * dw;
      const rh = r.h * dh;

      // Assombrit la zone extérieure
      cctx.save();
      cctx.fillStyle = 'rgba(15, 23, 42, 0.52)';
      cctx.beginPath();
      cctx.rect(dx, dy, dw, dh);
      cctx.rect(rx, ry, rw, rh);
      cctx.fill('evenodd');

      // Règle des tiers
      cctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      cctx.lineWidth = 1;
      cctx.beginPath();
      cctx.moveTo(rx + rw / 3, ry); cctx.lineTo(rx + rw / 3, ry + rh);
      cctx.moveTo(rx + (2 * rw) / 3, ry); cctx.lineTo(rx + (2 * rw) / 3, ry + rh);
      cctx.moveTo(rx, ry + rh / 3); cctx.lineTo(rx + rw, ry + rh / 3);
      cctx.moveTo(rx, ry + (2 * rh) / 3); cctx.lineTo(rx + rw, ry + (2 * rh) / 3);
      cctx.stroke();

      // Bordure de sélection
      cctx.strokeStyle = '#ffffff';
      cctx.lineWidth = 2;
      cctx.strokeRect(rx, ry, rw, rh);
      cctx.strokeStyle = '#0072ce';
      cctx.lineWidth = 1;
      cctx.strokeRect(rx - 1, ry - 1, rw + 2, rh + 2);

      // 4 poignées d'angle
      const handles = [
        [rx, ry],
        [rx + rw, ry],
        [rx, ry + rh],
        [rx + rw, ry + rh]
      ];
      handles.forEach(([hx, hy]) => {
        cctx.fillStyle = '#0072ce';
        cctx.strokeStyle = '#ffffff';
        cctx.lineWidth = 2;
        cctx.beginPath();
        cctx.arc(hx, hy, 6.5, 0, Math.PI * 2);
        cctx.fill();
        cctx.stroke();
      });
      cctx.restore();
    } else {
      // Mode Main levée
      const pts = imageCropState.freehand;
      if (pts.length >= 2) {
        cctx.save();
        cctx.fillStyle = 'rgba(15, 23, 42, 0.52)';
        cctx.beginPath();
        cctx.rect(dx, dy, dw, dh);
        cctx.moveTo(dx + pts[0].x * dw, dy + pts[0].y * dh);
        for (let i = 1; i < pts.length; i++) {
          cctx.lineTo(dx + pts[i].x * dw, dy + pts[i].y * dh);
        }
        cctx.closePath();
        cctx.fill('evenodd');

        cctx.strokeStyle = '#38bdf8';
        cctx.lineWidth = 2.2;
        cctx.setLineDash([6, 4]);
        cctx.beginPath();
        cctx.moveTo(dx + pts[0].x * dw, dy + pts[0].y * dh);
        for (let i = 1; i < pts.length; i++) {
          cctx.lineTo(dx + pts[i].x * dw, dy + pts[i].y * dh);
        }
        cctx.closePath();
        cctx.stroke();
        cctx.restore();
      }
    }
  }

  function openImageCropModal(imgItem, page) {
    if (!imgItem || !imgItem.src || typeof document === 'undefined') return false;
    const modal = document.getElementById('modalImageCrop');
    if (!modal) return false;
    imageCropState.open = true;
    imageCropState.imgItem = imgItem;
    imageCropState.page = page || getActivePage();
    imageCropState.mode = 'rect';
    imageCropState.rect = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
    imageCropState.freehand = [];
    document.querySelectorAll('#modalImageCrop [data-crop-mode]').forEach((b) => {
      const active = b.dataset.cropMode === 'rect';
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const hint = document.getElementById('cropHintText');
    if (hint) hint.textContent = 'Ajustez le cadre ou les poignées d\'angle pour recadrer l\'image.';

    modal.classList.remove('hidden');
    const img = new Image();
    img.onload = () => {
      imageCropState.loadedImg = img;
      renderImageCropCanvas();
    };
    img.src = imgItem.src;
    return true;
  }

  function applyImageCrop() {
    const img = imageCropState.loadedImg;
    const imgItem = imageCropState.imgItem;
    const page = imageCropState.page || getActivePage();
    if (!img || !imgItem || !page) {
      closeImageCropModal();
      return false;
    }
    const natW = img.naturalWidth || img.width || 320;
    const natH = img.naturalHeight || img.height || 240;
    const outCanvas = document.createElement('canvas');
    const octx = outCanvas.getContext('2d');
    if (!octx) return false;

    let cropWFrac = 1;
    let cropHFrac = 1;

    if (imageCropState.mode === 'rect') {
      const r = imageCropState.rect;
      const sx = Math.max(0, Math.round(r.x * natW));
      const sy = Math.max(0, Math.round(r.y * natH));
      const sw = Math.max(8, Math.min(natW - sx, Math.round(r.w * natW)));
      const sh = Math.max(8, Math.min(natH - sy, Math.round(r.h * natH)));
      outCanvas.width = sw;
      outCanvas.height = sh;
      octx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      cropWFrac = sw / Math.max(1, natW);
      cropHFrac = sh / Math.max(1, natH);
    } else {
      const pts = imageCropState.freehand;
      if (!pts || pts.length < 3) {
        showToast('Tracez d’abord un contour fermé à main levée autour de la zone à conserver.', 'error');
        return false;
      }
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      pts.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
      const sx = Math.max(0, Math.floor(minX * natW));
      const sy = Math.max(0, Math.floor(minY * natH));
      const sw = Math.max(8, Math.min(natW - sx, Math.ceil((maxX - minX) * natW)));
      const sh = Math.max(8, Math.min(natH - sy, Math.ceil((maxY - minY) * natH)));
      outCanvas.width = sw;
      outCanvas.height = sh;
      octx.save();
      octx.beginPath();
      octx.moveTo(pts[0].x * natW - sx, pts[0].y * natH - sy);
      for (let i = 1; i < pts.length; i++) {
        octx.lineTo(pts[i].x * natW - sx, pts[i].y * natH - sy);
      }
      octx.closePath();
      octx.clip();
      octx.drawImage(img, -sx, -sy, natW, natH);
      octx.restore();
      cropWFrac = sw / Math.max(1, natW);
      cropHFrac = sh / Math.max(1, natH);
    }

    pushHistorySnapshot(page);
    if (!imgItem.origSrc) imgItem.origSrc = imgItem.src;
    imgItem.src = outCanvas.toDataURL('image/png');
    imgItem.width = Math.max(40, Math.round((imgItem.width || 240) * cropWFrac));
    imgItem.height = Math.max(32, Math.round((imgItem.height || 180) * cropHFrac));
    releaseCanvasMemory(outCanvas);
    closeImageCropModal();
    renderWorldTextCards();
    scheduleSaveActivePage(page);
    showToast('Image recadrée !');
    return true;
  }

  function initImageCropModalEvents() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modalImageCrop');
    const canvas = document.getElementById('imageCropCanvas');
    const btnClose = document.getElementById('btnCloseImageCrop');
    const btnCancel = document.getElementById('btnCropCancel');
    const btnApply = document.getElementById('btnCropApply');
    const btnReset = document.getElementById('btnCropReset');
    const hint = document.getElementById('cropHintText');

    if (btnClose) btnClose.addEventListener('click', closeImageCropModal);
    if (btnCancel) btnCancel.addEventListener('click', closeImageCropModal);
    if (btnApply) btnApply.addEventListener('click', applyImageCrop);
    if (modal) {
      modal.addEventListener('click', (ev) => {
        if (ev.target === modal) closeImageCropModal();
      });
    }
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (imageCropState.mode === 'rect') {
          const isAlreadyFull = imageCropState.rect.x <= 0.01 && imageCropState.rect.y <= 0.01 && imageCropState.rect.w >= 0.99 && imageCropState.rect.h >= 0.99;
          imageCropState.rect = { x: 0, y: 0, w: 1, h: 1 };
          if (isAlreadyFull && imageCropState.imgItem && imageCropState.imgItem.origSrc && imageCropState.imgItem.origSrc !== imageCropState.imgItem.src) {
            const origImg = new Image();
            origImg.onload = () => {
              imageCropState.loadedImg = origImg;
              renderImageCropCanvas();
              showToast('Image d’origine restaurée dans l’aperçu');
            };
            origImg.src = imageCropState.imgItem.origSrc;
            return;
          }
        } else {
          imageCropState.freehand = [];
        }
        renderImageCropCanvas();
      });
    }

    document.querySelectorAll('#modalImageCrop [data-crop-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.cropMode === 'freehand' ? 'freehand' : 'rect';
        imageCropState.mode = mode;
        document.querySelectorAll('#modalImageCrop [data-crop-mode]').forEach((b) => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (hint) {
          hint.textContent = mode === 'rect'
            ? 'Ajustez le cadre ou les poignées d\'angle pour recadrer l\'image.'
            : 'Dessinez un contour libre autour de la zone à découper (fond transparent).';
        }
        renderImageCropCanvas();
      });
    });

    if (!canvas) return;
    function getNormalizedCropPoint(ev) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      const cx = (ev.clientX - rect.left) * scaleX;
      const cy = (ev.clientY - rect.top) * scaleY;
      const b = imageCropState.drawBox;
      return {
        cx,
        cy,
        nx: Math.max(0, Math.min(1, (cx - b.x) / Math.max(1, b.w))),
        ny: Math.max(0, Math.min(1, (cy - b.y) / Math.max(1, b.h)))
      };
    }

    canvas.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      const pt = getNormalizedCropPoint(ev);
      try { if (typeof ev.pointerId === 'number') canvas.setPointerCapture(ev.pointerId); } catch (_) {}
      if (imageCropState.mode === 'freehand') {
        imageCropState.dragAction = 'freehand';
        imageCropState.freehand = [{ x: pt.nx, y: pt.ny }];
        renderImageCropCanvas();
        return;
      }
      const b = imageCropState.drawBox;
      const r = imageCropState.rect;
      const rx = b.x + r.x * b.w;
      const ry = b.y + r.y * b.h;
      const rw = r.w * b.w;
      const rh = r.h * b.h;
      const hitRad = 16;
      const corners = [
        { act: 'nw', x: rx, y: ry },
        { act: 'ne', x: rx + rw, y: ry },
        { act: 'sw', x: rx, y: ry + rh },
        { act: 'se', x: rx + rw, y: ry + rh }
      ];
      let matched = null;
      for (const c of corners) {
        if (Math.hypot(pt.cx - c.x, pt.cy - c.y) <= hitRad) {
          matched = c.act;
          break;
        }
      }
      if (!matched && pt.cx >= rx && pt.cx <= rx + rw && pt.cy >= ry && pt.cy <= ry + rh) {
        matched = 'move';
      }
      if (!matched) {
        matched = 'new';
        imageCropState.rect = { x: pt.nx, y: pt.ny, w: 0.05, h: 0.05 };
      }
      imageCropState.dragAction = matched;
      imageCropState.dragStart = { nx: pt.nx, ny: pt.ny };
      imageCropState.dragOrigRect = { ...imageCropState.rect };
    });

    canvas.addEventListener('pointermove', (ev) => {
      if (!imageCropState.dragAction) return;
      ev.preventDefault();
      const pt = getNormalizedCropPoint(ev);
      if (imageCropState.dragAction === 'freehand') {
        const list = imageCropState.freehand;
        const last = list[list.length - 1];
        if (!last || Math.hypot(pt.nx - last.x, pt.ny - last.y) >= 0.008) {
          list.push({ x: pt.nx, y: pt.ny });
          renderImageCropCanvas();
        }
        return;
      }
      const orig = imageCropState.dragOrigRect;
      const st = imageCropState.dragStart;
      const minSize = 0.08;
      const act = imageCropState.dragAction;
      let { x, y, w, h } = orig;
      if (act === 'move') {
        x = Math.max(0, Math.min(1 - w, orig.x + (pt.nx - st.nx)));
        y = Math.max(0, Math.min(1 - h, orig.y + (pt.ny - st.ny)));
      } else if (act === 'new') {
        x = Math.min(st.nx, pt.nx);
        y = Math.min(st.ny, pt.ny);
        w = Math.max(minSize, Math.abs(pt.nx - st.nx));
        h = Math.max(minSize, Math.abs(pt.ny - st.ny));
        if (x + w > 1) w = 1 - x;
        if (y + h > 1) h = 1 - y;
      } else if (act === 'se') {
        w = Math.max(minSize, Math.min(1 - x, pt.nx - x));
        h = Math.max(minSize, Math.min(1 - y, pt.ny - y));
      } else if (act === 'nw') {
        const maxX = orig.x + orig.w - minSize;
        const maxY = orig.y + orig.h - minSize;
        x = Math.max(0, Math.min(maxX, pt.nx));
        y = Math.max(0, Math.min(maxY, pt.ny));
        w = orig.x + orig.w - x;
        h = orig.y + orig.h - y;
      } else if (act === 'ne') {
        const maxY = orig.y + orig.h - minSize;
        y = Math.max(0, Math.min(maxY, pt.ny));
        h = orig.y + orig.h - y;
        w = Math.max(minSize, Math.min(1 - x, pt.nx - x));
      } else if (act === 'sw') {
        const maxX = orig.x + orig.w - minSize;
        x = Math.max(0, Math.min(maxX, pt.nx));
        w = orig.x + orig.w - x;
        h = Math.max(minSize, Math.min(1 - y, pt.ny - y));
      }
      imageCropState.rect = { x, y, w, h };
      renderImageCropCanvas();
    });

    const endCropDrag = (ev) => {
      imageCropState.dragAction = null;
      try { if (typeof ev.pointerId === 'number') canvas.releasePointerCapture(ev.pointerId); } catch (_) {}
    };
    canvas.addEventListener('pointerup', endCropDrag);
    canvas.addEventListener('pointercancel', endCropDrag);
  }

  // --- #6 BIBLIOTHÈQUE D'ÉLÉMENTS & STICKERS RÉUTILISABLES ---
  const ELEMENTS_STORAGE_KEY = 'inkflow_elements_library_v1';

  function buildBuiltinVectorElements() {
    const mkLine = (x1, y1, x2, y2, color = '#1e293b', size = 2.4) => ({
      type: 'line', x1, y1, x2, y2, color, size, filled: false, lineStyle: 'solid'
    });
    const mkArrow = (x1, y1, x2, y2, color = '#1e293b', size = 2.6) => ({
      type: 'arrow', x1, y1, x2, y2, color, size, filled: false, lineStyle: 'solid'
    });
    return [
      {
        id: 'builtin_repere',
        name: 'Repère orthonormé',
        builtin: true,
        width: 240,
        height: 200,
        strokes: [],
        shapes: [
          mkArrow(10, 100, 230, 100, '#1e293b', 2.4),
          mkArrow(120, 190, 120, 10, '#1e293b', 2.4),
          mkLine(60, 95, 60, 105, '#475569', 1.8),
          mkLine(90, 95, 90, 105, '#475569', 1.8),
          mkLine(150, 95, 150, 105, '#475569', 1.8),
          mkLine(180, 95, 180, 105, '#475569', 1.8),
          mkLine(115, 40, 125, 40, '#475569', 1.8),
          mkLine(115, 70, 125, 70, '#475569', 1.8),
          mkLine(115, 130, 125, 130, '#475569', 1.8),
          mkLine(115, 160, 125, 160, '#475569', 1.8)
        ]
      },
      {
        id: 'builtin_axe_gradue',
        name: 'Axe gradué',
        builtin: true,
        width: 280,
        height: 44,
        strokes: [],
        shapes: [
          mkArrow(8, 22, 272, 22, '#0f172a', 2.5),
          mkLine(40, 14, 40, 30, '#0072ce', 2),
          mkLine(80, 14, 80, 30, '#0072ce', 2),
          mkLine(120, 14, 120, 30, '#0072ce', 2),
          mkLine(160, 14, 160, 30, '#0072ce', 2),
          mkLine(200, 14, 200, 30, '#0072ce', 2),
          mkLine(240, 14, 240, 30, '#0072ce', 2)
        ]
      },
      {
        id: 'builtin_cercle_trigo',
        name: 'Cercle trigo',
        builtin: true,
        width: 210,
        height: 210,
        strokes: [],
        shapes: [
          { type: 'ellipse', x1: 25, y1: 25, x2: 185, y2: 185, color: '#0072ce', size: 2.5, filled: false, lineStyle: 'solid' },
          mkArrow(8, 105, 202, 105, '#1e293b', 2),
          mkArrow(105, 202, 105, 8, '#1e293b', 2),
          mkLine(48, 48, 162, 162, '#94a3b8', 1.5),
          mkLine(48, 162, 162, 48, '#94a3b8', 1.5)
        ]
      },
      {
        id: 'builtin_tableau_2x3',
        name: 'Tableau 2×3',
        builtin: true,
        width: 280,
        height: 150,
        strokes: [],
        shapes: [
          { type: 'rect', x1: 0, y1: 0, x2: 280, y2: 150, color: '#1e293b', size: 2.2, filled: false, lineStyle: 'solid' },
          mkLine(0, 50, 280, 50, '#1e293b', 2),
          mkLine(0, 100, 280, 100, '#475569', 1.6),
          mkLine(140, 0, 140, 150, '#475569', 1.6)
        ]
      },
      {
        id: 'builtin_encadre',
        name: 'Encadré Important',
        builtin: true,
        width: 270,
        height: 110,
        strokes: [],
        shapes: [
          { type: 'roundedRect', x1: 0, y1: 0, x2: 270, y2: 110, color: '#dc2626', size: 2.6, filled: true, lineStyle: 'solid' },
          mkLine(14, 16, 14, 94, '#dc2626', 4.5)
        ]
      }
    ];
  }

  const BUILTIN_VECTOR_ELEMENTS = buildBuiltinVectorElements();

  let elementsLibraryMemoryFallback = null;

  function getSavedElementsLibrary() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(ELEMENTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            elementsLibraryMemoryFallback = parsed;
            return parsed;
          }
        }
      }
    } catch (_) {}
    return Array.isArray(elementsLibraryMemoryFallback) ? elementsLibraryMemoryFallback.slice() : [];
  }

  function saveElementsLibraryList(list) {
    elementsLibraryMemoryFallback = Array.isArray(list) ? list.slice() : [];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ELEMENTS_STORAGE_KEY, JSON.stringify(elementsLibraryMemoryFallback));
        return true;
      }
    } catch (_) {
      showToast('Espace local plein : impossible d’enregistrer plus d’éléments.', 'error');
      return false;
    }
    return true;
  }

  function generateElementPreviewDataUrl(el) {
    if (
      el &&
      Array.isArray(el.images) &&
      el.images.length > 0 &&
      el.images[0] &&
      el.images[0].src &&
      (!el.strokes || el.strokes.length === 0) &&
      (!el.shapes || el.shapes.length === 0)
    ) {
      return el.images[0].src;
    }
    if (typeof document === 'undefined') return '';
    try {
      const c = document.createElement('canvas');
      c.width = 172;
      c.height = 116;
      const pctx = c.getContext('2d');
      if (!pctx) return '';
      const w = Math.max(10, el.width || 120);
      const h = Math.max(10, el.height || 90);
      const pad = 12;
      const scale = Math.min((c.width - pad * 2) / w, (c.height - pad * 2) / h);
      const ox = (c.width - w * scale) * 0.5;
      const oy = (c.height - h * scale) * 0.5;
      pctx.save();
      pctx.translate(ox, oy);
      pctx.scale(scale, scale);
      (el.images || []).forEach((imgItem) => {
        const imgEl = getCachedThumbnailImage(imgItem);
        if (imgEl && typeof pctx.drawImage === 'function') {
          try { pctx.drawImage(imgEl, imgItem.x || 0, imgItem.y || 0, imgItem.width || 120, imgItem.height || 90); } catch (_) {}
        }
      });
      (el.strokes || []).forEach((s) => drawSingleStroke(pctx, s, false, false));
      (el.shapes || []).forEach((sh) => drawGeometricShape(pctx, sh, false, false));
      pctx.restore();
      const url = c.toDataURL('image/png');
      releaseCanvasMemory(c);
      return url;
    } catch (_) {
      return '';
    }
  }

  function saveLassoSelectionAsElement(customName) {
    const page = getActivePage();
    if (!page) return null;
    const selStrokes = (page.strokes || []).filter((s) => state.selectedIds.strokes.has(s.id));
    const selShapes = (page.shapes || []).filter((sh) => state.selectedIds.shapes.has(sh.id));
    const selImages = (page.images || []).filter((img) => state.selectedIds.images && state.selectedIds.images.has(img.id));
    const rawImages = selImages.map((img) => ({
      x: img.x || 0,
      y: img.y || 0,
      width: img.width || 240,
      height: img.height || 180,
      src: img.src
    }));
    if (state.lassoPdfClip && state.lassoPdfClip.src) {
      rawImages.push({
        x: state.lassoPdfClip.x || 0,
        y: state.lassoPdfClip.y || 0,
        width: state.lassoPdfClip.width || 200,
        height: state.lassoPdfClip.height || 140,
        src: state.lassoPdfClip.src
      });
    }
    if (selStrokes.length === 0 && selShapes.length === 0 && rawImages.length === 0) {
      showToast('Entourez d’abord un schéma, une zone PDF ou des traits avec le Lasso.', 'error');
      return null;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selStrokes.forEach((s) => {
      (s.points || []).forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });
    selShapes.forEach((sh) => {
      const bb = getShapeBoundingBox(sh);
      minX = Math.min(minX, bb.minX);
      minY = Math.min(minY, bb.minY);
      maxX = Math.max(maxX, bb.maxX);
      maxY = Math.max(maxY, bb.maxY);
    });
    rawImages.forEach((img) => {
      minX = Math.min(minX, img.x);
      minY = Math.min(minY, img.y);
      maxX = Math.max(maxX, img.x + img.width);
      maxY = Math.max(maxY, img.y + img.height);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

    const normStrokes = selStrokes.map((s) => {
      const clone = JSON.parse(JSON.stringify(s));
      delete clone.id;
      clone.points = (clone.points || []).map((p) => ({
        ...p,
        x: Math.round((p.x - minX) * 100) / 100,
        y: Math.round((p.y - minY) * 100) / 100
      }));
      return clone;
    });
    const normShapes = selShapes.map((sh) => {
      const clone = JSON.parse(JSON.stringify(sh));
      delete clone.id;
      delete clone.startConnection;
      delete clone.endConnection;
      clone.x1 = Math.round((clone.x1 - minX) * 100) / 100;
      clone.y1 = Math.round((clone.y1 - minY) * 100) / 100;
      clone.x2 = Math.round((clone.x2 - minX) * 100) / 100;
      clone.y2 = Math.round((clone.y2 - minY) * 100) / 100;
      if (Array.isArray(clone.points)) {
        clone.points = clone.points.map((p) => ({
          x: Math.round((p.x - minX) * 100) / 100,
          y: Math.round((p.y - minY) * 100) / 100
        }));
      }
      if (Array.isArray(clone.vertices)) {
        clone.vertices = clone.vertices.map((v) => ({
          x: Math.round((v.x - minX) * 100) / 100,
          y: Math.round((v.y - minY) * 100) / 100
        }));
      }
      return clone;
    });
    const normImages = rawImages.map((img) => ({
      x: Math.round((img.x - minX) * 100) / 100,
      y: Math.round((img.y - minY) * 100) / 100,
      width: Math.max(16, Math.round(img.width)),
      height: Math.max(16, Math.round(img.height)),
      src: img.src
    }));

    const list = getSavedElementsLibrary();
    const width = Math.max(16, Math.round(maxX - minX));
    const height = Math.max(16, Math.round(maxY - minY));
    const defaultLabel = (state.lassoPdfClip && normStrokes.length === 0 && normShapes.length === 0)
      ? `Extrait PDF ${list.length + 1}`
      : `Élément ${list.length + 1}`;
    const elObj = {
      id: createUid('el'),
      name: (customName && String(customName).trim()) || defaultLabel,
      width,
      height,
      strokes: normStrokes,
      shapes: normShapes,
      images: normImages,
      createdAt: Date.now()
    };
    const isPureSingleImage = normImages.length === 1 && normStrokes.length === 0 && normShapes.length === 0;
    elObj.preview = isPureSingleImage ? '' : generateElementPreviewDataUrl(elObj);
    list.unshift(elObj);
    saveElementsLibraryList(list);
    renderElementsPopover();
    showToast(`« ${elObj.name} » enregistré dans vos Éléments !`);
    return elObj;
  }

  function deleteSavedElement(elId) {
    const list = getSavedElementsLibrary().filter((item) => item.id !== elId);
    saveElementsLibraryList(list);
    renderElementsPopover();
    showToast('Élément supprimé');
  }

  function insertElementIntoActivePage(elObj) {
    const page = getActivePage();
    if (!page || !elObj) return false;
    let cx = 300;
    let cy = 260;
    if (dom.canvasViewport && typeof dom.canvasViewport.getBoundingClientRect === 'function') {
      const rect = dom.canvasViewport.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const center = screenToWorld(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
        cx = center.x;
        cy = center.y;
      }
    }
    const w = Math.max(20, elObj.width || 160);
    const h = Math.max(20, elObj.height || 120);
    let ox = cx - w * 0.5;
    let oy = cy - h * 0.5;
    if (isBoundedPage(page)) {
      const pb = getPageBounds(page);
      ox = Math.max(12, Math.min(Math.max(12, pb.maxX - w - 12), ox));
      oy = Math.max(12, Math.min(Math.max(12, pb.maxY - h - 12), oy));
    }

    pushHistorySnapshot(page);
    if (!Array.isArray(page.strokes)) page.strokes = [];
    if (!Array.isArray(page.shapes)) page.shapes = [];
    if (!Array.isArray(page.images)) page.images = [];
    clearLassoSelection();

    (elObj.strokes || []).forEach((s) => {
      const ns = JSON.parse(JSON.stringify(s));
      ns.id = createUid('st');
      ns.points = (ns.points || []).map((p) => ({
        ...p,
        x: p.x + ox,
        y: p.y + oy
      }));
      page.strokes.push(ns);
      state.selectedIds.strokes.add(ns.id);
    });
    (elObj.shapes || []).forEach((sh) => {
      const nsh = JSON.parse(JSON.stringify(sh));
      nsh.id = createUid('sh');
      nsh.x1 += ox;
      nsh.y1 += oy;
      nsh.x2 += ox;
      nsh.y2 += oy;
      if (Array.isArray(nsh.points)) {
        nsh.points = nsh.points.map((p) => ({ x: p.x + ox, y: p.y + oy }));
      }
      if (Array.isArray(nsh.vertices)) {
        nsh.vertices = nsh.vertices.map((v) => ({ x: v.x + ox, y: v.y + oy }));
      }
      page.shapes.push(nsh);
      state.selectedIds.shapes.add(nsh.id);
    });
    (elObj.images || []).forEach((img) => {
      const nimg = {
        id: createUid('img'),
        x: Math.round((img.x || 0) + ox),
        y: Math.round((img.y || 0) + oy),
        width: Math.max(20, Math.round(img.width || 240)),
        height: Math.max(20, Math.round(img.height || 180)),
        src: img.src
      };
      page.images.push(nimg);
      if (state.selectedIds.images) state.selectedIds.images.add(nimg.id);
    });

    computeSelectionBounds();
    updateLassoToolbarBadge();
    updateLassoFloatingBarPosition();
    renderWorldTextCards();
    invalidateStaticInkCache();
    requestRender();
    scheduleSaveActivePage(page);

    const pop = document.getElementById('elementsPopover');
    const btn = document.getElementById('btnElementsLibrary');
    if (pop) pop.classList.add('hidden');
    if (btn) btn.classList.remove('active');
    showToast(`« ${elObj.name || 'Élément'} » inséré — glissez pour repositionner`);
    return true;
  }

  function renderElementsPopover() {
    if (typeof document === 'undefined') return;
    const userGrid = document.getElementById('userElementsGrid');
    const builtinGrid = document.getElementById('builtinElementsGrid');
    const countEl = document.getElementById('userElementsCount');
    if (!userGrid || !builtinGrid) return;

    const saved = getSavedElementsLibrary();
    if (countEl) countEl.textContent = `(${saved.length})`;
    userGrid.innerHTML = '';
    if (saved.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'elements-empty-msg';
      empty.textContent = 'Aucun élément enregistré pour l’instant.';
      userGrid.appendChild(empty);
    } else {
      saved.forEach((el) => {
        const tile = document.createElement('div');
        tile.className = 'element-tile';
        tile.title = `Insérer « ${el.name} »`;
        const previewSrc = el.preview || generateElementPreviewDataUrl(el);
        const img = document.createElement('img');
        img.className = 'element-tile-preview';
        img.alt = el.name || 'Élément';
        if (previewSrc) img.src = previewSrc;
        tile.appendChild(img);

        const label = document.createElement('span');
        label.className = 'element-tile-name';
        label.textContent = el.name || 'Élément';
        tile.appendChild(label);

        const del = document.createElement('button');
        del.className = 'element-tile-del';
        del.type = 'button';
        del.title = 'Supprimer cet élément';
        del.textContent = '✕';
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          deleteSavedElement(el.id);
        });
        tile.appendChild(del);

        tile.addEventListener('click', () => insertElementIntoActivePage(el));
        userGrid.appendChild(tile);
      });
    }

    builtinGrid.innerHTML = '';
    BUILTIN_VECTOR_ELEMENTS.forEach((el) => {
      if (!el.preview) el.preview = generateElementPreviewDataUrl(el);
      const tile = document.createElement('div');
      tile.className = 'element-tile';
      tile.title = `Insérer « ${el.name} »`;
      const img = document.createElement('img');
      img.className = 'element-tile-preview';
      img.alt = el.name;
      if (el.preview) img.src = el.preview;
      tile.appendChild(img);

      const label = document.createElement('span');
      label.className = 'element-tile-name';
      label.textContent = el.name;
      tile.appendChild(label);

      tile.addEventListener('click', () => insertElementIntoActivePage(el));
      builtinGrid.appendChild(tile);
    });
  }

  // --- #9 RECHERCHE DE TEXTE DANS LES PDF IMPORTÉS & CARTES TEXTE (Ctrl+F) ---
  function normalizeSearchText(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  async function extractPdfPageTextItems(page) {
    if (!page || !page.pdfId || !page.pdfPageNumber) return [];
    const cacheKey = `${page.pdfId}_${page.pdfPageNumber}`;
    if (pdfTextIndexCache.has(cacheKey)) {
      return pdfTextIndexCache.get(cacheKey);
    }
    try {
      const pdfDoc = await getLoadedPdfJsDoc(page.pdfId);
      if (!pdfDoc) return [];
      const pdfPage = await pdfDoc.getPage(page.pdfPageNumber);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const textContent = await pdfPage.getTextContent();
      const pageW = page.width || viewport.width || PAGE_WIDTH;
      const pageH = page.height || viewport.height || PAGE_HEIGHT;
      const sx = pageW / Math.max(1, viewport.width);
      const sy = pageH / Math.max(1, viewport.height);
      const items = [];
      const utilTransform = window.pdfjsLib && window.pdfjsLib.Util && window.pdfjsLib.Util.transform;

      for (const item of (textContent.items || [])) {
        if (!item || !item.str || !item.str.trim()) continue;
        let tx = 0;
        let ty = 0;
        let fontH = 14;
        if (utilTransform && Array.isArray(item.transform) && Array.isArray(viewport.transform)) {
          const m = utilTransform(viewport.transform, item.transform);
          tx = m[4] * sx;
          ty = m[5] * sy;
          fontH = Math.max(9, Math.hypot(m[2], m[3]) * sy);
        } else if (Array.isArray(item.transform)) {
          tx = (item.transform[4] || 0) * sx;
          ty = (viewport.height - (item.transform[5] || 0)) * sy;
          fontH = Math.max(9, Math.abs(item.transform[3] || item.height || 14) * sy);
        }
        const itemW = Math.max(10, (item.width || item.str.length * (fontH * 0.52)) * sx);
        items.push({
          str: item.str,
          norm: normalizeSearchText(item.str),
          x: tx,
          y: ty - fontH * 0.88,
          width: itemW,
          height: fontH * 1.18
        });
      }
      pdfTextIndexCache.set(cacheKey, items);
      return items;
    } catch (_) {
      return [];
    }
  }

  function updatePdfSearchBarUi() {
    if (typeof document === 'undefined') return;
    const countEl = document.getElementById('pdfSearchCount');
    const prevBtn = document.getElementById('btnPdfSearchPrev');
    const nextBtn = document.getElementById('btnPdfSearchNext');
    const total = pdfSearchState.matches.length;
    const idx = total > 0 && pdfSearchState.activeIndex >= 0 ? pdfSearchState.activeIndex + 1 : 0;
    if (countEl) countEl.textContent = `${idx} / ${total}`;
    if (prevBtn) prevBtn.disabled = total <= 1;
    if (nextBtn) nextBtn.disabled = total <= 1;
  }

  function drawPdfSearchHighlights(ctx, pageId) {
    if (!pdfSearchState.open || !pdfSearchState.matches.length) return;
    ctx.save();
    pdfSearchState.matches.forEach((m, idx) => {
      if (m.pageId !== pageId) return;
      const isCurrent = idx === pdfSearchState.activeIndex;
      const pad = 2;
      ctx.fillStyle = isCurrent ? 'rgba(249, 115, 22, 0.42)' : 'rgba(250, 204, 21, 0.36)';
      ctx.strokeStyle = isCurrent ? '#ea580c' : 'rgba(202, 138, 4, 0.65)';
      ctx.lineWidth = (isCurrent ? 2 : 1) / Math.max(0.25, state.zoom || 1);
      ctx.fillRect(m.x - pad, m.y - pad, m.width + pad * 2, m.height + pad * 2);
      ctx.strokeRect(m.x - pad, m.y - pad, m.width + pad * 2, m.height + pad * 2);
    });
    ctx.restore();
  }

  function navigatePdfSearchToIndex(index) {
    const total = pdfSearchState.matches.length;
    if (total === 0) {
      pdfSearchState.activeIndex = -1;
      updatePdfSearchBarUi();
      renderActiveCanvasOnly();
      return null;
    }
    const safeIdx = ((index % total) + total) % total;
    pdfSearchState.activeIndex = safeIdx;
    const match = pdfSearchState.matches[safeIdx];
    if (match && match.pageId && state.activePageId !== match.pageId) {
      selectPage(match.pageId);
    }
    // Centre doucement la vue si le résultat est hors de l'écran
    if (match && dom.canvasViewport) {
      const vp = dom.canvasViewport.getBoundingClientRect();
      if (vp && vp.width > 0 && vp.height > 0) {
        const sx = (match.x + match.width * 0.5) * state.zoom + state.panX;
        const sy = (match.y + match.height * 0.5) * state.zoom + state.panY;
        if (sx < 40 || sx > vp.width - 40 || sy < 95 || sy > vp.height - 40) {
          const targetPanX = vp.width * 0.5 - (match.x + match.width * 0.5) * state.zoom;
          const targetPanY = vp.height * 0.45 - (match.y + match.height * 0.5) * state.zoom;
          const clamped = clampViewportPan(targetPanX, targetPanY, state.zoom, getActivePage());
          state.panX = clamped.panX;
          state.panY = clamped.panY;
          syncWorldLayerTransform();
          requestRender();
        }
      }
    }
    updatePdfSearchBarUi();
    renderActiveCanvasOnly();
    return match;
  }

  async function runPdfAndNotebookSearch(rawQuery, options = {}) {
    const q = String(rawQuery || '').trim();
    pdfSearchState.query = q;
    const token = ++pdfSearchState.searchToken;
    if (!q) {
      pdfSearchState.matches = [];
      pdfSearchState.activeIndex = -1;
      updatePdfSearchBarUi();
      renderActiveCanvasOnly();
      return [];
    }
    const normQ = normalizeSearchText(q);
    const pages = getActiveNotebookPages();
    const matches = [];

    for (let pi = 0; pi < pages.length; pi++) {
      if (token !== pdfSearchState.searchToken) return pdfSearchState.matches;
      const pg = pages[pi];
      // 1. Recherche dans le texte PDF natif hors-ligne
      if (pg.pdfId && pg.pdfPageNumber) {
        const items = await extractPdfPageTextItems(pg);
        if (token !== pdfSearchState.searchToken) return pdfSearchState.matches;
        for (const it of items) {
          let pos = 0;
          while ((pos = it.norm.indexOf(normQ, pos)) !== -1) {
            const totalLen = Math.max(1, it.norm.length);
            const subX = it.x + (pos / totalLen) * it.width;
            const subW = Math.max(12, (normQ.length / totalLen) * it.width);
            matches.push({
              pageId: pg.id,
              pageIndex: pi,
              x: subX,
              y: it.y,
              width: subW,
              height: it.height,
              text: it.str,
              source: 'pdf'
            });
            pos += Math.max(1, normQ.length);
          }
        }
      }
      // 2. Recherche dans les cartes texte & LaTeX du cahier
      for (const tb of (pg.texts || [])) {
        const content = `${tb.text || ''} ${tb.latex || ''}`.trim();
        if (!content) continue;
        if (normalizeSearchText(content).includes(normQ)) {
          matches.push({
            pageId: pg.id,
            pageIndex: pi,
            x: tb.x || 0,
            y: tb.y || 0,
            width: Math.max(80, tb.width || 220),
            height: 36,
            text: content,
            source: 'text'
          });
        }
      }
    }

    if (token !== pdfSearchState.searchToken) return pdfSearchState.matches;
    pdfSearchState.matches = matches;
    if (matches.length === 0) {
      pdfSearchState.activeIndex = -1;
      updatePdfSearchBarUi();
      renderActiveCanvasOnly();
      return [];
    }
    let initialIdx = 0;
    if (options.preservePage !== false) {
      const onCur = matches.findIndex((m) => m.pageId === state.activePageId);
      if (onCur >= 0) initialIdx = onCur;
    }
    navigatePdfSearchToIndex(initialIdx);
    return matches;
  }

  function openPdfSearchBar() {
    pdfSearchState.open = true;
    const bar = document.getElementById('pdfSearchBar');
    const input = document.getElementById('pdfSearchInput');
    const btn = document.getElementById('btnPdfSearch');
    if (bar) bar.classList.remove('hidden');
    if (btn) btn.classList.add('active');
    updatePdfSearchBarUi();
    if (input) {
      input.focus();
      input.select();
    }
  }

  function closePdfSearchBar() {
    pdfSearchState.open = false;
    pdfSearchState.matches = [];
    pdfSearchState.activeIndex = -1;
    const bar = document.getElementById('pdfSearchBar');
    const btn = document.getElementById('btnPdfSearch');
    if (bar) bar.classList.add('hidden');
    if (btn) btn.classList.remove('active');
    renderActiveCanvasOnly();
  }

  function initNewFeaturesPack() {
    // #4 Onglets multi-documents : les onglets enregistrés sont chargés par loadFromIndexedDB une fois les vrais cahiers connus
    // (les charger ici, avec le cahier de démo provisoire, effaçait la liste enregistrée)
    if (typeof document !== 'undefined') {
      const btnTabAdd = document.getElementById('btnDocTabAdd');
      if (btnTabAdd) {
        btnTabAdd.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (state.splitView && state.splitView.pickerOpen && state.splitView.pickerMode === 'tab') {
            closeSplitNotebookPopover();
          } else {
            openSplitNotebookPopover('tab');
          }
        });
      }

      // #1 Règle graduée virtuelle
      initVirtualRulerEvents();

      // #3 Modale recadrage d'images
      initImageCropModalEvents();

      // #P3.2 Limite de pages PDF configurable & bouton Retour lien interne PDF
      const selPdfLimit = document.getElementById('selectPdfMaxPages');
      if (selPdfLimit && typeof getPdfMaxImportPages === 'function') {
        selPdfLimit.value = String(getPdfMaxImportPages());
        selPdfLimit.addEventListener('change', () => {
          setPdfMaxImportPages(Number(selPdfLimit.value));
        });
      }
      const btnPdfBack = document.getElementById('pdfLinkBackPill');
      if (btnPdfBack && typeof navigateBackFromPdfLink === 'function') {
        btnPdfBack.addEventListener('click', (ev) => {
          ev.stopPropagation();
          navigateBackFromPdfLink();
        });
      }

      // #6 Bibliothèque d'éléments réutilisables
      const btnElements = document.getElementById('btnElementsLibrary');
      const popElements = document.getElementById('elementsPopover');
      const btnCloseElements = document.getElementById('btnCloseElementsPopover');
      const btnSaveElLasso = document.getElementById('btnQuickSaveElementLasso');
      if (btnElements && popElements) {
        btnElements.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const willOpen = popElements.classList.contains('hidden');
          if (willOpen) renderElementsPopover();
          popElements.classList.toggle('hidden', !willOpen);
          btnElements.classList.toggle('active', willOpen);
        });
        document.addEventListener('pointerdown', (ev) => {
          if (!popElements.classList.contains('hidden') && !ev.target.closest('#elementsPopover') && !ev.target.closest('#btnElementsLibrary')) {
            popElements.classList.add('hidden');
            btnElements.classList.remove('active');
          }
        });
      }
      if (btnCloseElements && popElements) {
        btnCloseElements.addEventListener('click', () => {
          popElements.classList.add('hidden');
          if (btnElements) btnElements.classList.remove('active');
        });
      }
      if (btnSaveElLasso) {
        btnSaveElLasso.addEventListener('click', (ev) => {
          ev.stopPropagation();
          saveLassoSelectionAsElement();
        });
      }

      // #9 Recherche PDF / Cahier (Ctrl+F)
      const btnPdfSearch = document.getElementById('btnPdfSearch');
      const searchInput = document.getElementById('pdfSearchInput');
      const btnPrev = document.getElementById('btnPdfSearchPrev');
      const btnNext = document.getElementById('btnPdfSearchNext');
      const btnCloseSearch = document.getElementById('btnPdfSearchClose');
      let searchDebounceTimer = null;

      if (btnPdfSearch) {
        btnPdfSearch.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (pdfSearchState.open) closePdfSearchBar();
          else openPdfSearchBar();
        });
      }
      if (btnCloseSearch) btnCloseSearch.addEventListener('click', closePdfSearchBar);
      if (btnPrev) btnPrev.addEventListener('click', () => navigatePdfSearchToIndex(pdfSearchState.activeIndex - 1));
      if (btnNext) btnNext.addEventListener('click', () => navigatePdfSearchToIndex(pdfSearchState.activeIndex + 1));
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
          searchDebounceTimer = setTimeout(() => {
            runPdfAndNotebookSearch(searchInput.value);
          }, 160);
        });
        searchInput.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            if (pdfSearchState.matches.length === 0) {
              runPdfAndNotebookSearch(searchInput.value);
            } else {
              navigatePdfSearchToIndex(pdfSearchState.activeIndex + (ev.shiftKey ? -1 : 1));
            }
          } else if (ev.key === 'Escape') {
            ev.preventDefault();
            closePdfSearchBar();
          }
        });
      }

      // Personnalisation de la barre d'outils
      initToolbarCustomization();
    }
  }

  // ============================================================================
  // PERSONNALISATION DE LA BARRE D'OUTILS (ORDRE, VISIBILITÉ, POSITION HAUT/BAS)
  // ============================================================================
  const TOOLBAR_CONFIG_STORAGE_KEY = 'inkflow_toolbar_config_v1';

  const TOOLBAR_CENTER_ITEMS_META = [
    { id: 'toolPen', label: 'Stylo / Surligneur / Ruban' },
    { id: 'toolEraser', label: 'Gomme' },
    { id: 'toolLasso', label: 'Lasso' },
    { id: 'toolShape', label: 'Formes' },
    { id: 'toolText', label: 'Zone de texte' },
    { id: 'btnInsertImage', label: 'Image' },
    { id: 'btnElementsLibrary', label: 'Éléments' },
    { id: 'btnToggleRuler', label: 'Règle graduée' },
    { id: 'toolLaser', label: 'Pointeur laser' },
    { id: 'toolPan', label: 'Main / Déplacer' }
  ];

  const TOOLBAR_RIGHT_ITEMS_META = [
    { id: 'btnPdfSearch', label: 'Recherche (Ctrl+F)' },
    { id: 'btnOpenRecognition', label: 'Reconnaissance IA / LaTeX' },
    { id: 'btnPaperSettings', label: 'Modèles & fonds de page' },
    { id: 'btnExportMenu', label: 'Exporter' },
    { id: 'btnThemeToggle', label: 'Thème Clair / Sombre' },
    { id: 'btnFullscreenToggle', label: 'Plein écran' }
  ];

  function createDefaultToolbarConfig() {
    return {
      position: 'top',
      showDocTabs: true,
      centerOrder: TOOLBAR_CENTER_ITEMS_META.map((x) => x.id),
      rightOrder: TOOLBAR_RIGHT_ITEMS_META.map((x) => x.id),
      hiddenIds: []
    };
  }

  let toolbarCustomConfig = createDefaultToolbarConfig();

  function normalizeOrderList(savedOrder, defaults) {
    const valid = new Set(defaults);
    const result = [];
    if (Array.isArray(savedOrder)) {
      savedOrder.forEach((id) => {
        if (valid.has(id) && !result.includes(id)) result.push(id);
      });
    }
    defaults.forEach((id) => {
      if (!result.includes(id)) result.push(id);
    });
    return result;
  }

  function loadToolbarCustomizationConfig() {
    const def = createDefaultToolbarConfig();
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(TOOLBAR_CONFIG_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const allValid = new Set([...def.centerOrder, ...def.rightOrder]);
            toolbarCustomConfig = {
              position: parsed.position === 'bottom' ? 'bottom' : 'top',
              showDocTabs: parsed.showDocTabs !== false,
              centerOrder: normalizeOrderList(parsed.centerOrder, def.centerOrder),
              rightOrder: normalizeOrderList(parsed.rightOrder, def.rightOrder),
              hiddenIds: Array.isArray(parsed.hiddenIds)
                ? parsed.hiddenIds.filter((id, i, arr) => allValid.has(id) && arr.indexOf(id) === i)
                : []
            };
            // Toujours garantir au moins un outil principal visible
            const visibleCenterCount = toolbarCustomConfig.centerOrder.filter((id) => !toolbarCustomConfig.hiddenIds.includes(id)).length;
            if (visibleCenterCount === 0) {
              toolbarCustomConfig.hiddenIds = toolbarCustomConfig.hiddenIds.filter((id) => id !== 'toolPen');
            }
            return toolbarCustomConfig;
          }
        }
      }
    } catch (_) {}
    toolbarCustomConfig = def;
    return toolbarCustomConfig;
  }

  function saveToolbarCustomizationConfig() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TOOLBAR_CONFIG_STORAGE_KEY, JSON.stringify(toolbarCustomConfig));
      }
    } catch (_) {}
  }

  function getToolbarCustomizationConfig() {
    return {
      position: toolbarCustomConfig.position,
      showDocTabs: toolbarCustomConfig.showDocTabs,
      centerOrder: [...toolbarCustomConfig.centerOrder],
      rightOrder: [...toolbarCustomConfig.rightOrder],
      hiddenIds: [...toolbarCustomConfig.hiddenIds]
    };
  }

  function applyToolbarCustomization() {
    if (typeof document === 'undefined') return;
    const cfg = toolbarCustomConfig;
    const hiddenSet = new Set(cfg.hiddenIds || []);

    if (document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.toggle('toolbar-pos-bottom', cfg.position === 'bottom');
    }

    const tabsBar = document.getElementById('docTabsBar');
    if (tabsBar && tabsBar.classList) {
      tabsBar.classList.toggle('user-hidden', cfg.showDocTabs === false);
    }

    const centerEl = document.getElementById('gnBarCenter');
    if (centerEl) {
      cfg.centerOrder.forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.classList.toggle('toolbar-item-hidden', hiddenSet.has(id));
        if (btn.parentNode === centerEl && typeof centerEl.appendChild === 'function') {
          centerEl.appendChild(btn);
        }
      });
    }

    const rightEl = document.getElementById('gnBarRight');
    const customizeBtn = document.getElementById('btnCustomizeToolbar');
    if (rightEl) {
      cfg.rightOrder.forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.classList.toggle('toolbar-item-hidden', hiddenSet.has(id));
        if (btn.parentNode === rightEl && typeof rightEl.appendChild === 'function') {
          rightEl.appendChild(btn);
        }
      });
      if (customizeBtn && customizeBtn.parentNode === rightEl && typeof rightEl.appendChild === 'function') {
        rightEl.appendChild(customizeBtn);
      }
    }

    const posTopBtn = document.getElementById('btnToolbarPosTop');
    const posBotBtn = document.getElementById('btnToolbarPosBottom');
    if (posTopBtn) posTopBtn.classList.toggle('active', cfg.position !== 'bottom');
    if (posBotBtn) posBotBtn.classList.toggle('active', cfg.position === 'bottom');

    const chkTabs = document.getElementById('chkToolbarShowDocTabs');
    if (chkTabs) chkTabs.checked = cfg.showDocTabs !== false;
  }

  function setToolbarItemVisibility(itemId, visible) {
    const centerIds = TOOLBAR_CENTER_ITEMS_META.map((x) => x.id);
    const rightIds = TOOLBAR_RIGHT_ITEMS_META.map((x) => x.id);
    if (!centerIds.includes(itemId) && !rightIds.includes(itemId)) return false;

    const nextHidden = new Set(toolbarCustomConfig.hiddenIds || []);
    if (visible) {
      nextHidden.delete(itemId);
    } else {
      if (centerIds.includes(itemId)) {
        const remainingCenter = centerIds.filter((id) => id !== itemId && !nextHidden.has(id));
        if (remainingCenter.length === 0) {
          showToast('Au moins un outil principal doit rester visible.', 'error');
          return false;
        }
      }
      nextHidden.add(itemId);
    }
    toolbarCustomConfig.hiddenIds = Array.from(nextHidden);
    saveToolbarCustomizationConfig();
    applyToolbarCustomization();
    renderToolbarCustomizePopover();
    return true;
  }

  function reorderToolbarItems(section, newOrder) {
    if (section === 'center') {
      toolbarCustomConfig.centerOrder = normalizeOrderList(newOrder, TOOLBAR_CENTER_ITEMS_META.map((x) => x.id));
    } else if (section === 'right') {
      toolbarCustomConfig.rightOrder = normalizeOrderList(newOrder, TOOLBAR_RIGHT_ITEMS_META.map((x) => x.id));
    } else {
      return false;
    }
    saveToolbarCustomizationConfig();
    applyToolbarCustomization();
    renderToolbarCustomizePopover();
    return true;
  }

  function moveToolbarItemByDelta(section, itemId, delta) {
    const list = section === 'center' ? [...toolbarCustomConfig.centerOrder] : [...toolbarCustomConfig.rightOrder];
    const idx = list.indexOf(itemId);
    const targetIdx = idx + delta;
    if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return false;
    const [moved] = list.splice(idx, 1);
    list.splice(targetIdx, 0, moved);
    return reorderToolbarItems(section, list);
  }

  function setToolbarPosition(pos) {
    toolbarCustomConfig.position = pos === 'bottom' ? 'bottom' : 'top';
    saveToolbarCustomizationConfig();
    applyToolbarCustomization();
    return toolbarCustomConfig.position;
  }

  function setDocTabsVisibility(show) {
    toolbarCustomConfig.showDocTabs = Boolean(show);
    saveToolbarCustomizationConfig();
    applyToolbarCustomization();
    return toolbarCustomConfig.showDocTabs;
  }

  function resetToolbarCustomization() {
    toolbarCustomConfig = createDefaultToolbarConfig();
    saveToolbarCustomizationConfig();
    applyToolbarCustomization();
    renderToolbarCustomizePopover();
    showToast('Barre d’outils réinitialisée par défaut');
    return getToolbarCustomizationConfig();
  }

  function openToolbarCustomizePopover() {
    if (typeof document === 'undefined') return;
    const pop = document.getElementById('toolbarCustomizePopover');
    const btn = document.getElementById('btnCustomizeToolbar');
    if (!pop) return;
    renderToolbarCustomizePopover();
    pop.classList.remove('hidden');
    if (btn) btn.classList.add('active');
  }

  function closeToolbarCustomizePopover() {
    if (typeof document === 'undefined') return;
    const pop = document.getElementById('toolbarCustomizePopover');
    const btn = document.getElementById('btnCustomizeToolbar');
    if (pop) pop.classList.add('hidden');
    if (btn) btn.classList.remove('active');
  }

  function renderToolbarCustomizeSection(containerId, section, orderIds, metaList) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const metaMap = new Map(metaList.map((m) => [m.id, m]));
    const hiddenSet = new Set(toolbarCustomConfig.hiddenIds || []);
    container.innerHTML = '';

    orderIds.forEach((id, idx) => {
      const meta = metaMap.get(id);
      if (!meta) return;
      const isVisible = !hiddenSet.has(id);

      const row = document.createElement('div');
      row.className = `tb-cust-item${isVisible ? '' : ' is-hidden-item'}`;
      row.dataset.itemId = id;
      row.dataset.section = section;

      const handle = document.createElement('span');
      handle.className = 'tb-cust-handle';
      handle.title = 'Glisser pour réorganiser';
      handle.textContent = '≡';
      row.appendChild(handle);

      const iconWrap = document.createElement('span');
      iconWrap.className = 'tb-cust-item-icon';
      const origBtn = document.getElementById(id);
      const origSvg = origBtn ? origBtn.querySelector('svg') : null;
      if (origSvg && typeof origSvg.cloneNode === 'function') {
        iconWrap.appendChild(origSvg.cloneNode(true));
      }
      row.appendChild(iconWrap);

      const label = document.createElement('span');
      label.className = 'tb-cust-item-name';
      label.textContent = meta.label;
      row.appendChild(label);

      const orderBtns = document.createElement('div');
      orderBtns.className = 'tb-cust-order-btns';

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'tb-cust-move-btn';
      upBtn.title = 'Monter';
      upBtn.textContent = '▲';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        moveToolbarItemByDelta(section, id, -1);
      });

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'tb-cust-move-btn';
      downBtn.title = 'Descendre';
      downBtn.textContent = '▼';
      downBtn.disabled = idx === orderIds.length - 1;
      downBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        moveToolbarItemByDelta(section, id, 1);
      });

      orderBtns.appendChild(upBtn);
      orderBtns.appendChild(downBtn);
      row.appendChild(orderBtns);

      const swWrap = document.createElement('label');
      swWrap.className = 'gn-ios-switch';
      swWrap.title = isVisible ? 'Masquer de la barre d’outils' : 'Afficher dans la barre d’outils';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = isVisible;
      chk.addEventListener('change', () => {
        const ok = setToolbarItemVisibility(id, chk.checked);
        if (!ok) chk.checked = true;
      });
      const slider = document.createElement('span');
      slider.className = 'gn-ios-slider';
      swWrap.appendChild(chk);
      swWrap.appendChild(slider);
      row.appendChild(swWrap);

      // Glisser-déposer fluide par PointerEvents (souris, tactile & stylet)
      handle.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        row.classList.add('is-dragging');
        const pid = ev.pointerId;
        let currentTargetId = null;
        try { if (typeof pid === 'number') handle.setPointerCapture(pid); } catch (_) {}

        const onMove = (mev) => {
          const rows = Array.from(container.querySelectorAll('.tb-cust-item'));
          let hovered = null;
          for (const r of rows) {
            r.classList.remove('is-drag-target');
            if (r === row) continue;
            const rect = r.getBoundingClientRect();
            if (mev.clientY >= rect.top && mev.clientY <= rect.bottom) {
              hovered = r;
            }
          }
          if (hovered) {
            hovered.classList.add('is-drag-target');
            currentTargetId = hovered.dataset.itemId;
          } else {
            currentTargetId = null;
          }
        };

        const onUp = () => {
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
          handle.removeEventListener('pointercancel', onUp);
          try { if (typeof pid === 'number') handle.releasePointerCapture(pid); } catch (_) {}
          row.classList.remove('is-dragging');
          container.querySelectorAll('.is-drag-target').forEach((el) => el.classList.remove('is-drag-target'));
          if (currentTargetId && currentTargetId !== id) {
            const list = section === 'center' ? [...toolbarCustomConfig.centerOrder] : [...toolbarCustomConfig.rightOrder];
            const fromIdx = list.indexOf(id);
            const toIdx = list.indexOf(currentTargetId);
            if (fromIdx >= 0 && toIdx >= 0) {
              const [moved] = list.splice(fromIdx, 1);
              list.splice(toIdx, 0, moved);
              reorderToolbarItems(section, list);
            }
          }
        };

        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
      });

      container.appendChild(row);
    });
  }

  function renderToolbarCustomizePopover() {
    if (typeof document === 'undefined') return;
    renderToolbarCustomizeSection(
      'toolbarCustomizeCenterList',
      'center',
      toolbarCustomConfig.centerOrder,
      TOOLBAR_CENTER_ITEMS_META
    );
    renderToolbarCustomizeSection(
      'toolbarCustomizeRightList',
      'right',
      toolbarCustomConfig.rightOrder,
      TOOLBAR_RIGHT_ITEMS_META
    );
    const posTopBtn = document.getElementById('btnToolbarPosTop');
    const posBotBtn = document.getElementById('btnToolbarPosBottom');
    if (posTopBtn) posTopBtn.classList.toggle('active', toolbarCustomConfig.position !== 'bottom');
    if (posBotBtn) posBotBtn.classList.toggle('active', toolbarCustomConfig.position === 'bottom');
    const chkTabs = document.getElementById('chkToolbarShowDocTabs');
    if (chkTabs) chkTabs.checked = toolbarCustomConfig.showDocTabs !== false;
  }

  function initToolbarCustomization() {
    loadToolbarCustomizationConfig();
    applyToolbarCustomization();
    if (typeof document === 'undefined') return;

    const btnOpen = document.getElementById('btnCustomizeToolbar');
    const pop = document.getElementById('toolbarCustomizePopover');
    const btnClose = document.getElementById('btnCloseToolbarCustomize');
    const btnPosTop = document.getElementById('btnToolbarPosTop');
    const btnPosBot = document.getElementById('btnToolbarPosBottom');
    const chkTabs = document.getElementById('chkToolbarShowDocTabs');
    const btnReset = document.getElementById('btnResetToolbarConfig');

    if (btnOpen && pop) {
      btnOpen.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (pop.classList.contains('hidden')) openToolbarCustomizePopover();
        else closeToolbarCustomizePopover();
      });
      document.addEventListener('pointerdown', (ev) => {
        if (!pop.classList.contains('hidden') && !ev.target.closest('#toolbarCustomizePopover') && !ev.target.closest('#btnCustomizeToolbar')) {
          closeToolbarCustomizePopover();
        }
      });
    }
    if (btnClose) btnClose.addEventListener('click', closeToolbarCustomizePopover);
    if (btnPosTop) btnPosTop.addEventListener('click', () => setToolbarPosition('top'));
    if (btnPosBot) btnPosBot.addEventListener('click', () => setToolbarPosition('bottom'));
    if (chkTabs) {
      chkTabs.addEventListener('change', () => setDocTabsVisibility(chkTabs.checked));
    }
    if (btnReset) btnReset.addEventListener('click', resetToolbarCustomization);
  }

  // ============================================================================
  // MODE HORS-LIGNE (VERSION NAVIGATEUR) : ENREGISTREMENT DU SERVICE WORKER sw.js
  // ============================================================================
  // Uniquement servi en http(s) dans un navigateur : jamais sous Tauri (WebView2,
  // tauri.localhost ou devUrl) ni sous Electron (file://), qui embarquent déjà
  // leurs fichiers. Renvoie true si l'enregistrement est programmé.
  function registerOfflineServiceWorker(env = window) {
    try {
      const nav = env && env.navigator;
      const loc = env && env.location;
      if (!nav || !nav.serviceWorker || typeof nav.serviceWorker.register !== 'function') return false;
      if (!loc || (loc.protocol !== 'http:' && loc.protocol !== 'https:')) return false;
      if (env.__TAURI__ || env.__TAURI_INTERNALS__) return false;
      const hostname = String(loc.hostname || String(loc.host || '').split(':')[0]).toLowerCase();
      if (hostname === 'tauri.localhost' || hostname.endsWith('.tauri.localhost')) return false;
      if (env.isSecureContext === false) return false;

      const register = () => {
        nav.serviceWorker.register('./sw.js').catch((err) => {
          console.warn('[InkFlow] Service worker hors-ligne non enregistré :', err);
        });
      };
      if (env.document && env.document.readyState === 'complete') register();
      else env.addEventListener('load', register, { once: true });
      return true;
    } catch (err) {
      return false;
    }
  }

  if (typeof window !== 'undefined') {
    window.__plumeStudioApi = {
      registerOfflineServiceWorker,
      isNetworkAvailable,
      isNetworkFailure,
      setNetworkState,
      requireNetwork,
      buildGdriveAuthUrl,
      computePkceChallenge,
      storeGdriveTokens,
      clearGdriveSession,
      isGdriveLinked,
      gdriveFetch,
      getDriveImportKind,
      buildDriveListQuery,
      getDriveOrderBy,
      normalizeDriveItem,
      formatDriveBytes,
      importPdfFromBuffer,
      stagePdfBufferForImport,
      validateAndOpenPdfDocument,
      exportAnnotatedPdfWithPdfLib,
      generateSampleCoursePdfBytes,
      ensurePdfPageRendered,
      ensureActiveAndAdjacentPdfPagesLoaded,
      configurePdfJsWorkerLocally,
      cleanupPdfRenderCache,
      destroyPdfDocumentResources,
      cleanupAppResources,
      cleanupTransientInteractionState,
      finalizeActiveDrawingOnCurrentPage,
      getPdfCacheStats,
      getRenderPerfStats: () => ({ ...renderPerfStats }),
      renderScene,
      renderStaticInkLayerOnly,
      renderActiveCanvasOnly,
      selectShapeForEditing,
      clearSelectedShape,
      convertSelectedShapeType,
      duplicateSelectedShape,
      deleteSelectedShape,
      mergeCompletedItemIntoStaticCanvas,
      invalidateStaticInkCache,
      clearActiveCanvas,
      handlePointerDown,
      handlePointerMove,
      handlePointerUpOrCancel,
      isPenEraserButton,
      isPenLassoButton,
      performUndo,
      performRedo,
      pushHistorySnapshot,
      scheduleSaveActivePage,
      hasPendingPageSave,
      cancelPendingPageSave,
      flushPendingPageSaves,
      SAVE_DEBOUNCE_DELAY_MS,
      createNotebookProgrammatically,
      selectNotebook,
      selectPage,
      addNewPageToActiveNotebook,
      duplicatePageById,
      deletePageById,
      deleteNotebookById,
      moveNotebookToTrash,
      restoreNotebookFromTrash,
      emptyTrash,
      rotatePageById,
      reorderPagesInActiveNotebook,
      addOutlineEntryForPage,
      oneEuroFilterStep,
      animateViewportTo,
      stopViewportAnimations,
      setFullscreenMode,
      toggleFullscreenMode,
      syncFullscreenState,
      openFilesPage,
      closeFilesPage,
      toggleFilesPage,
      openDetentePage,
      closeDetentePage,
      evaluateDetenteLine,
      verifyDetenteBons,
      refreshDetenteBons,
      claimDetenteBon,
      getDetentePendingBons,
      getDetenteWallet: () => ({ balance: detenteState.balance, debt: detenteState.debt, borrowed: detenteState.borrowed, stock: { ...detenteState.stock }, ledger: detenteState.ledger.map((e) => ({ ...e })) }),
      getDetenteAccount,
      detenteAccountHash,
      buyDetenteItem,
      runDetentePaidCreation,
      DETENTE_SHOP,
      openRadialWheelEditor,
      RADIAL_WHEEL_COLORS,
      duplicateNotebookById,
      moveFolderToParent,
      moveFolderToTrash,
      restoreFolderFromTrash,
      getBoundedStackInfo,
      getBoundedDeskBackdropColor,
      PAGE_STACK_GAP,
      openGnColorPopover,
      closeGnColorPopover,
      getGnColorPopoverState,
      openGnTemplateLibraryModal,
      closeGnTemplateLibraryModal,
      applyGnTemplateLibrarySelection,
      getGnTemplateLibraryState,
      updateNewNotebookPaperPreview,
      GN_PAGE_SIZE_PRESETS,
      GN_PAPER_TEMPLATE_GROUPS,
      GN_COVER_TEMPLATE_GROUPS,
      addToolColorSlot,
      removeToolColorSlot,
      getToolColorPresets,
      applyColorFromGnPopover,
      duplicateLassoSelection,
      copyLassoSelection,
      pasteLassoSelection,
      handleLassoPointerUp,
      deleteLassoSelection,
      clearLassoSelection,
      computeSelectionBounds,
      alignLassoHandwriting,
      straightenLassoSelection,
      captureLassoSelectionScreenshot,
      tryCircleToLassoSelection,
      syncGnLassoSubBarUi,
      openSplitView,
      closeSplitView,
      toggleSplitView,
      swapSplitViewPanes,
      applySplitZoom,
      fitSplitPaneToWidth,
      renderSplitPane,
      removeAllTapesOnActivePage,
      toggleVirtualRuler,
      snapWorldPointToVirtualRuler,
      getVirtualRulerState: () => ({ ...virtualRulerState }),
      openNotebookInTab,
      closeNotebookTab,
      renderDocTabsBar,
      saveLassoSelectionAsElement,
      insertElementIntoActivePage,
      getSavedElementsLibrary,
      BUILTIN_VECTOR_ELEMENTS,
      openImageCropModal,
      closeImageCropModal,
      applyImageCrop,
      openPdfSearchBar,
      closePdfSearchBar,
      runPdfAndNotebookSearch,
      navigatePdfSearchToIndex,
      getPdfSearchState: () => ({ ...pdfSearchState, matches: [...pdfSearchState.matches] }),
      getToolbarCustomizationConfig,
      setToolbarItemVisibility,
      reorderToolbarItems,
      moveToolbarItemByDelta,
      setToolbarPosition,
      setDocTabsVisibility,
      resetToolbarCustomization,
      openToolbarCustomizePopover,
      closeToolbarCustomizePopover,
      getActiveNotebook,
      getActivePage,
      getActiveNotebookPages,
      computeStrokeBounds,
      getCachedStrokePath,
      getCachedStrokeBounds,
      cloneStrokeFast,
      clonePageContent,
      applyEraserAtPoint,
      detectAndApplyScribbleToErase,
      SpatialStrokeGrid,
      getPageSpatialIndex,
      invalidatePageSpatialIndex,
      queryPageStrokesInRect,
      queryPageStrokesAtPoint,
      queryPageShapesInRect,
      createOffscreenRenderSurface,
      generatePageThumbnailAsync,
      scheduleAsyncPageThumbnail,
      flushAsyncThumbnailQueue,
      getAsyncThumbnailStats,
      ensureSplitOffscreenPageBitmap,
      releaseSplitOffscreenCache,
      computeNotebookContentHash,
      syncNotebooksIncrementalWithGoogleDrive,
      resetGdriveSyncMeta,
      gdriveSyncState,
      getPdfMaxImportPages,
      setPdfMaxImportPages,
      resolvePdfDestinationToPageNumber,
      extractPdfOutlineTree,
      ensurePdfOutlineLoadedForNotebook,
      extractAndCachePdfPageLinks,
      getCachedPdfLinksForPage,
      findPdfLinkAtWorldPoint,
      activatePdfLink,
      navigateBackFromPdfLink,
      getState: () => state,
      db
    };
  }

  applyDemoStateSynchronously();
  bindEvents();
  initGoodnotesExtensions();
  initGnTemplateLibraryModal();
  updateNewNotebookPaperPreview();
  initNewFeaturesPack();
  updateToolbarActiveState();
  renderWorldTextCards();
  fitPageToViewport();
  requestRender();
  initialDbLoadPromise = loadFromIndexedDB();
  registerOfflineServiceWorker();
