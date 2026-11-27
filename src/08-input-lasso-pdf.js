  // ============================================================================
  // 12. GESTION DES ENTRÉES STYLET, FORMES AUTO, ROUE DE COULEURS & PINCEMENT
  // ============================================================================

  const PEN_ERASER_MASK = 32;
  const PEN_LASSO_MASK = 2 | 8 | 16; // 2e bouton du stylet (Windows Ink bouton droit=2 ou X1=8 / X2=16)

  function isPenEraserButton(e) {
    return e.pointerType === 'pen' && (((e.buttons & PEN_ERASER_MASK) !== 0) || e.button === 5);
  }

  function isPenLassoButton(e) {
    return e.pointerType === 'pen' && !isPenEraserButton(e) &&
      (((e.buttons & PEN_LASSO_MASK) !== 0) || e.button === 2 || e.button === 3 || e.button === 4);
  }

  const RADIAL_WHEEL_DEFAULT_COLORS = [
    { hex: '#1e293b', label: 'Noir' },
    { hex: '#1d4ed8', label: 'Bleu' },
    { hex: '#0284c7', label: 'Azur' },
    { hex: '#15803d', label: 'Vert' },
    { hex: '#facc15', label: 'Jaune' },
    { hex: '#d97706', label: 'Ambre' },
    { hex: '#dc2626', label: 'Rouge' },
    { hex: '#db2777', label: 'Rose' },
    { hex: '#7c3aed', label: 'Violet' }
  ];
  const RADIAL_WHEEL_STORAGE_KEY = 'inkflow.radialWheelColors.v1';
  const RADIAL_WHEEL_MIN_COLORS = 3;
  const RADIAL_WHEEL_MAX_COLORS = 12;
  // Tableau unique muté sur place : la roue, le survol et la sélection lisent toujours la même référence
  const RADIAL_WHEEL_COLORS = RADIAL_WHEEL_DEFAULT_COLORS.map((c) => ({ ...c }));

  function radialWheelLabelFor(hex) {
    const norm = String(hex).toLowerCase();
    const known = RADIAL_WHEEL_DEFAULT_COLORS.find((c) => c.hex === norm);
    return known ? known.label : norm.toUpperCase();
  }

  function loadRadialWheelColors() {
    try {
      const raw = localStorage.getItem(RADIAL_WHEEL_STORAGE_KEY);
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      const clean = list
        .map((hex) => (typeof normalizeHexColor === 'function' ? normalizeHexColor(hex) : null))
        .filter(Boolean)
        .slice(0, RADIAL_WHEEL_MAX_COLORS);
      if (clean.length < RADIAL_WHEEL_MIN_COLORS) return;
      RADIAL_WHEEL_COLORS.splice(0, RADIAL_WHEEL_COLORS.length, ...clean.map((hex) => ({ hex: hex.toLowerCase(), label: radialWheelLabelFor(hex) })));
    } catch (_) { /* stockage indisponible : couleurs par défaut */ }
  }

  function saveRadialWheelColors() {
    try {
      const isDefault = RADIAL_WHEEL_COLORS.length === RADIAL_WHEEL_DEFAULT_COLORS.length &&
        RADIAL_WHEEL_COLORS.every((c, i) => c.hex === RADIAL_WHEEL_DEFAULT_COLORS[i].hex);
      if (isDefault) localStorage.removeItem(RADIAL_WHEEL_STORAGE_KEY);
      else localStorage.setItem(RADIAL_WHEEL_STORAGE_KEY, JSON.stringify(RADIAL_WHEEL_COLORS.map((c) => c.hex)));
    } catch (_) { /* quota ou mode privé : sans conséquence */ }
  }

  function buildRadialWheelSlicesMarkup(activeHex, extraClassForIdx) {
    const n = RADIAL_WHEEL_COLORS.length;
    const cx = 92, cy = 92, innerR = 35, outerR = 82;
    const gap = 0.032;
    const step = (Math.PI * 2) / n;
    let markup = '';
    for (let i = 0; i < n; i++) {
      const c = RADIAL_WHEEL_COLORS[i];
      const startA = -Math.PI / 2 - step / 2 + i * step + gap * 0.5;
      const endA = -Math.PI / 2 - step / 2 + (i + 1) * step - gap * 0.5;
      const x1 = cx + outerR * Math.cos(startA), y1 = cy + outerR * Math.sin(startA);
      const x2 = cx + outerR * Math.cos(endA), y2 = cy + outerR * Math.sin(endA);
      const x3 = cx + innerR * Math.cos(endA), y3 = cy + innerR * Math.sin(endA);
      const x4 = cx + innerR * Math.cos(startA), y4 = cy + innerR * Math.sin(startA);
      const isAct = activeHex && c.hex.toLowerCase() === activeHex.toLowerCase();
      const extra = extraClassForIdx ? extraClassForIdx(i) : '';
      const d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${innerR} ${innerR} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
      markup += `<path class="radial-slice${isAct ? ' active-color' : ''}${extra}" data-wheel-idx="${i}" data-wheel-color="${c.hex}" data-wheel-label="${escapeHtml(c.label)}" d="${d}" fill="${c.hex}" stroke="rgba(255,255,255,0.65)" stroke-width="1.4" />`;
    }
    return markup;
  }

  function renderRadialColorWheelSvg(activeHex) {
    if (!dom.radialWheelSvg) return;
    dom.radialWheelSvg.innerHTML = buildRadialWheelSlicesMarkup(activeHex);
  }

  // ---------- Éditeur des couleurs de la roue (ajouter, remplacer, réordonner, retirer) ----------
  const radialEditorState = { selected: 0 };

  function renderRadialWheelEditor() {
    const wheel = document.getElementById('radialEditorWheel');
    const sel = Math.max(0, Math.min(RADIAL_WHEEL_COLORS.length - 1, radialEditorState.selected));
    radialEditorState.selected = sel;
    if (wheel) wheel.innerHTML = buildRadialWheelSlicesMarkup(null, (i) => (i === sel ? ' editor-selected' : ''));
    const list = document.getElementById('radialEditorSwatches');
    if (list) {
      list.innerHTML = '';
      RADIAL_WHEEL_COLORS.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `radial-editor-swatch${i === sel ? ' selected' : ''}`;
        b.style.background = c.hex;
        b.dataset.radialIdx = String(i);
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', i === sel ? 'true' : 'false');
        b.title = `${c.label} (${c.hex.toUpperCase()})`;
        b.setAttribute('aria-label', b.title);
        list.appendChild(b);
      });
      if (RADIAL_WHEEL_COLORS.length < RADIAL_WHEEL_MAX_COLORS) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'radial-editor-swatch radial-editor-add';
        add.id = 'btnRadialAddColor';
        add.title = 'Ajouter une couleur';
        add.setAttribute('aria-label', 'Ajouter une couleur');
        add.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        list.appendChild(add);
      }
    }
    const n = RADIAL_WHEEL_COLORS.length;
    const left = document.getElementById('btnRadialMoveLeft');
    if (left) left.disabled = sel <= 0;
    const right = document.getElementById('btnRadialMoveRight');
    if (right) right.disabled = sel >= n - 1;
    const rm = document.getElementById('btnRadialRemove');
    if (rm) rm.disabled = n <= RADIAL_WHEEL_MIN_COLORS;
    const reset = document.getElementById('btnRadialResetDefaults');
    if (reset) {
      reset.disabled = n === RADIAL_WHEEL_DEFAULT_COLORS.length &&
        RADIAL_WHEEL_COLORS.every((c, i) => c.hex === RADIAL_WHEEL_DEFAULT_COLORS[i].hex);
    }
  }

  function openRadialWheelEditor(selectIdx = 0, openPicker = false) {
    const modal = document.getElementById('modalRadialWheelColors');
    if (!modal) return false;
    if (state.colorWheelOpen) closeRadialColorWheel(true);
    radialEditorState.selected = selectIdx;
    modal.classList.remove('hidden');
    renderRadialWheelEditor();
    if (openPicker) openRadialSlotPicker(radialEditorState.selected);
    requestRender();
    return true;
  }

  function closeRadialWheelEditor() {
    const modal = document.getElementById('modalRadialWheelColors');
    if (gnColorPopoverState.open && String(gnColorPopoverState.mode).startsWith('radial-')) closeGnColorPopover();
    if (modal) modal.classList.add('hidden');
  }

  function openRadialSlotPicker(idx, adding = false) {
    const list = document.getElementById('radialEditorSwatches');
    const anchor = adding
      ? document.getElementById('btnRadialAddColor')
      : (list && list.querySelector(`[data-radial-idx="${idx}"]`));
    openGnColorPopover({
      mode: adding ? 'radial-add' : 'radial-slot',
      toolKey: 'pen',
      scopeKey: 'radial',
      slotIndex: adding ? -1 : idx,
      anchorEl: anchor || null,
      initialColor: adding ? '#0072ce' : (RADIAL_WHEEL_COLORS[idx] && RADIAL_WHEEL_COLORS[idx].hex),
      forceOpen: true
    });
  }

  // Appelé par le sélecteur de couleur (modes « radial-slot » et « radial-add »)
  function applyRadialWheelPick(norm, closeAfter) {
    const hex = norm.toLowerCase();
    if (gnColorPopoverState.mode === 'radial-add') {
      if (RADIAL_WHEEL_COLORS.length >= RADIAL_WHEEL_MAX_COLORS) { closeGnColorPopover(); return; }
      RADIAL_WHEEL_COLORS.push({ hex, label: radialWheelLabelFor(hex) });
      // Les aperçus suivants modifient la pastille ajoutée au lieu d'en ajouter d'autres
      gnColorPopoverState.mode = 'radial-slot';
      gnColorPopoverState.slotIndex = RADIAL_WHEEL_COLORS.length - 1;
      radialEditorState.selected = gnColorPopoverState.slotIndex;
    } else {
      const idx = gnColorPopoverState.slotIndex;
      if (!RADIAL_WHEEL_COLORS[idx]) { closeGnColorPopover(); return; }
      RADIAL_WHEEL_COLORS[idx] = { hex, label: radialWheelLabelFor(hex) };
    }
    saveRadialWheelColors();
    renderRadialWheelEditor();
    if (closeAfter) closeGnColorPopover();
    else {
      const list = document.getElementById('radialEditorSwatches');
      const anchor = list && list.querySelector(`[data-radial-idx="${gnColorPopoverState.slotIndex}"]`);
      if (anchor) {
        if (gnColorPopoverState.anchorEl && gnColorPopoverState.anchorEl.classList) gnColorPopoverState.anchorEl.classList.remove('popover-open');
        gnColorPopoverState.anchorEl = anchor;
      }
      renderGnColorPopover();
    }
  }

  function moveRadialWheelColor(dir) {
    const i = radialEditorState.selected;
    const j = i + dir;
    if (j < 0 || j >= RADIAL_WHEEL_COLORS.length) return;
    const tmp = RADIAL_WHEEL_COLORS[i];
    RADIAL_WHEEL_COLORS[i] = RADIAL_WHEEL_COLORS[j];
    RADIAL_WHEEL_COLORS[j] = tmp;
    radialEditorState.selected = j;
    saveRadialWheelColors();
    renderRadialWheelEditor();
  }

  function removeRadialWheelColor() {
    if (RADIAL_WHEEL_COLORS.length <= RADIAL_WHEEL_MIN_COLORS) return;
    RADIAL_WHEEL_COLORS.splice(radialEditorState.selected, 1);
    saveRadialWheelColors();
    renderRadialWheelEditor();
  }

  function resetRadialWheelColors() {
    RADIAL_WHEEL_COLORS.splice(0, RADIAL_WHEEL_COLORS.length, ...RADIAL_WHEEL_DEFAULT_COLORS.map((c) => ({ ...c })));
    radialEditorState.selected = 0;
    saveRadialWheelColors();
    renderRadialWheelEditor();
  }

  function initRadialWheelEditor() {
    loadRadialWheelColors();
    document.getElementById('btnOpenRadialWheelEditor')?.addEventListener('click', () => openRadialWheelEditor(0));
    document.getElementById('btnCloseRadialWheelEditor')?.addEventListener('click', closeRadialWheelEditor);
    document.getElementById('btnRadialEditorDone')?.addEventListener('click', closeRadialWheelEditor);
    document.getElementById('btnRadialResetDefaults')?.addEventListener('click', resetRadialWheelColors);
    document.getElementById('btnRadialMoveLeft')?.addEventListener('click', () => moveRadialWheelColor(-1));
    document.getElementById('btnRadialMoveRight')?.addEventListener('click', () => moveRadialWheelColor(1));
    document.getElementById('btnRadialRemove')?.addEventListener('click', removeRadialWheelColor);
    document.getElementById('btnRadialEditColor')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openRadialSlotPicker(radialEditorState.selected);
    });
    const list = document.getElementById('radialEditorSwatches');
    if (list) {
      list.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        ev.stopPropagation();
        if (btn.id === 'btnRadialAddColor') { openRadialSlotPicker(-1, true); return; }
        const idx = Number(btn.dataset.radialIdx);
        if (!Number.isInteger(idx)) return;
        if (idx === radialEditorState.selected) { openRadialSlotPicker(idx); return; }
        radialEditorState.selected = idx;
        if (gnColorPopoverState.open) closeGnColorPopover();
        renderRadialWheelEditor();
      });
    }
    const wheel = document.getElementById('radialEditorWheel');
    if (wheel) {
      wheel.addEventListener('click', (ev) => {
        const slice = ev.target.closest('.radial-slice');
        if (!slice) return;
        ev.stopPropagation();
        radialEditorState.selected = Number(slice.dataset.wheelIdx) || 0;
        if (gnColorPopoverState.open) closeGnColorPopover();
        renderRadialWheelEditor();
      });
    }
    // Roue ouverte en mode « toucher » : bouton Modifier, clic droit (souris) ou appui long sur une pastille
    document.getElementById('btnRadialWheelEdit')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openRadialWheelEditor(0);
    });
    if (dom.radialColorWheel) {
      let holdTimer = null;
      const cancelHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
      dom.radialColorWheel.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const slice = ev.target.closest && ev.target.closest('.radial-slice');
        if (!slice || !state.colorWheelTapMode || ev.pointerType === 'pen' || ev.pointerType === 'touch') return;
        openRadialWheelEditor(Number(slice.dataset.wheelIdx) || 0, true);
      });
      dom.radialColorWheel.addEventListener('pointerdown', (ev) => {
        cancelHold();
        const slice = ev.target.closest && ev.target.closest('.radial-slice');
        if (!slice || !state.colorWheelTapMode || ev.button !== 0 || isPenLassoButton(ev) || isPenEraserButton(ev)) return;
        const idx = Number(slice.dataset.wheelIdx) || 0;
        const x0 = ev.clientX, y0 = ev.clientY;
        holdTimer = setTimeout(() => {
          holdTimer = null;
          state.radialWheelSuppressClick = true;
          openRadialWheelEditor(idx, true);
        }, 560);
        const onMove = (mv) => { if (Math.hypot(mv.clientX - x0, mv.clientY - y0) > 10) cancelHold(); };
        const onEnd = () => {
          cancelHold();
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onEnd);
          window.removeEventListener('pointercancel', onEnd);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
      });
    }
  }

  const RADIAL_WHEEL_DBLCLICK_MS = 450;
  const RADIAL_WHEEL_CLICK_MAX_HOLD_MS = 380;
  const RADIAL_WHEEL_CLICK_MAX_TRAVEL_PX = 28;
  const RADIAL_WHEEL_DBLCLICK_MAX_DIST_PX = 64;

  function getPointerEventTimestamp(e) {
    return (e && typeof e.timeStamp === 'number' && e.timeStamp > 0) ? e.timeStamp : performance.now();
  }

  function finalizeLassoButtonClickTracking(e, allowClickCandidate = true) {
    const nowTs = getPointerEventTimestamp(e);
    const downPos = state.lassoButtonDownPos;
    const endX = (e && typeof e.clientX === 'number') ? e.clientX : (downPos ? downPos.x : 0);
    const endY = (e && typeof e.clientY === 'number') ? e.clientY : (downPos ? downPos.y : 0);
    const endTravel = downPos ? Math.hypot(endX - downPos.x, endY - downPos.y) : 0;
    const maxTravel = Math.max(state.lassoButtonMaxTravel || 0, endTravel);
    const holdDuration = state.lassoButtonDownTime > 0 ? (nowTs - state.lassoButtonDownTime) : Infinity;

    if (
      allowClickCandidate &&
      downPos &&
      !hasAnyLassoSelection() &&
      holdDuration <= RADIAL_WHEEL_CLICK_MAX_HOLD_MS &&
      maxTravel <= RADIAL_WHEEL_CLICK_MAX_TRAVEL_PX
    ) {
      state.lastLassoButtonClickTime = nowTs;
      state.lastLassoButtonClickPos = { x: endX, y: endY };
    } else {
      state.lastLassoButtonClickTime = 0;
      state.lastLassoButtonClickPos = null;
    }
    state.lassoButtonDownTime = 0;
    state.lassoButtonDownPos = null;
    state.lassoButtonMaxTravel = 0;
  }

  function openRadialColorWheelAt(clientX, clientY, tapMode = true) {
    if (!dom.radialColorWheel || !dom.canvasViewport) return;
    const vpRect = dom.canvasViewport.getBoundingClientRect();
    const relX = clientX - vpRect.left;
    const relY = clientY - vpRect.top;
    const clampedX = Math.max(98, Math.min(Math.max(98, vpRect.width - 98), relX));
    const clampedY = Math.max(106, Math.min(Math.max(106, vpRect.height - 108), relY));

    const targetTool = state.temporaryLassoOverride ? (state.previousToolBeforeLasso || 'pen') : state.tool;
    const currentHex = targetTool === 'highlighter' ? state.highlighterColor : state.penColor;
    renderRadialColorWheelSvg(currentHex);

    state.colorWheelOpen = true;
    if (dom.colorDotCursor) dom.colorDotCursor.style.display = 'none';
    state.colorWheelTapMode = Boolean(tapMode);
    state.colorWheelHoveredColor = null;
    state.colorWheelCenterScreen = { x: vpRect.left + clampedX, y: vpRect.top + clampedY };

    dom.radialColorWheel.style.left = `${clampedX}px`;
    dom.radialColorWheel.style.top = `${clampedY}px`;
    dom.radialColorWheel.classList.remove('hidden', 'tap-mode');
    if (state.colorWheelTapMode) {
      dom.radialColorWheel.classList.add('tap-mode');
    }
    if (dom.radialCenterDot) dom.radialCenterDot.style.background = currentHex;
    if (dom.radialCenterLabel) dom.radialCenterLabel.textContent = 'Couleur';

    // Efface l'amorce de tracé lasso pour garder le canevas propre
    state.lassoPolygon = [];
    state.lassoAction = null;
    if (dom.pointerTypeBadge) {
      dom.pointerTypeBadge.textContent = state.colorWheelTapMode
        ? 'Touchez une couleur sur la roue'
        : 'Roue de couleurs (glisser vers une teinte)';
    }
    requestRender();
  }

  function closeRadialColorWheel(restoreLassoTool = false) {
    state.colorWheelOpen = false;
    state.colorWheelTapMode = false;
    state.colorWheelHoveredColor = null;
    cancelColorWheelTimer();
    if (dom.radialColorWheel) {
      dom.radialColorWheel.classList.add('hidden');
      dom.radialColorWheel.classList.remove('tap-mode');
    }
    if (restoreLassoTool && state.temporaryLassoOverride) {
      state.temporaryLassoOverride = false;
      state.tool = state.previousToolBeforeLasso || 'pen';
      updateToolbarActiveState();
    }
  }

  function updateRadialColorWheelHover(clientX, clientY) {
    if (!state.colorWheelOpen || !dom.radialWheelSvg) return null;
    const c = state.colorWheelCenterScreen;
    const dx = clientX - c.x;
    const dy = clientY - c.y;
    const dist = Math.hypot(dx, dy);

    const slices = dom.radialWheelSvg.querySelectorAll('.radial-slice');
    let chosenIdx = -1;
    if (dist > 26 && dist <= 165) {
      const n = RADIAL_WHEEL_COLORS.length;
      const step = (Math.PI * 2) / n;
      const ang = Math.atan2(dy, dx);
      const shifted = ((ang + Math.PI / 2 + step / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      chosenIdx = Math.floor(shifted / step) % n;
    }

    slices.forEach((sl, idx) => sl.classList.toggle('hovered', idx === chosenIdx));

    if (chosenIdx >= 0) {
      const entry = RADIAL_WHEEL_COLORS[chosenIdx];
      state.colorWheelHoveredColor = entry.hex;
      if (dom.radialCenterDot) dom.radialCenterDot.style.background = entry.hex;
      if (dom.radialCenterLabel) dom.radialCenterLabel.textContent = entry.label;
      return entry.hex;
    }

    state.colorWheelHoveredColor = null;
    const targetTool = state.temporaryLassoOverride ? (state.previousToolBeforeLasso || 'pen') : state.tool;
    const currentHex = targetTool === 'highlighter' ? state.highlighterColor : state.penColor;
    if (dom.radialCenterDot) dom.radialCenterDot.style.background = currentHex;
    if (dom.radialCenterLabel) dom.radialCenterLabel.textContent = dist <= 26 ? 'Choisir' : 'Annuler';
    return null;
  }

  function selectRadialColor(hex) {
    const entry = RADIAL_WHEEL_COLORS.find((c) => c.hex.toLowerCase() === String(hex).toLowerCase());
    const targetTool = state.temporaryLassoOverride ? (state.previousToolBeforeLasso || 'pen') : state.tool;
    setToolColor(targetTool, hex);
    if (hasAnyLassoSelection()) recolorLassoSelection(hex);
    closeRadialColorWheel(true);
    updateToolbarActiveState();
    triggerToolOptionsPulse();
    requestRender();
  }

  function cancelColorWheelTimer() {
    if (state.colorWheelTimer) {
      clearTimeout(state.colorWheelTimer);
      state.colorWheelTimer = null;
    }
  }

  function cancelHoldShapeTimer() {
    if (state.holdShapeTimer) {
      clearTimeout(state.holdShapeTimer);
      state.holdShapeTimer = null;
    }
  }

  function scribbleSegmentsIntersect(a1, a2, b1, b2) {
    const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
    const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-6) return false;
    const dx = b1.x - a1.x, dy = b1.y - a1.y;
    const t = (dx * d2y - dy * d2x) / denom;
    const u = (dx * d1y - dy * d1x) / denom;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  function decimateStrokeForGeometry(pts, minDist) {
    if (!pts || pts.length === 0) return [];
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const last = out[out.length - 1];
      if (Math.hypot(pts[i].x - last.x, pts[i].y - last.y) >= minDist || i === pts.length - 1) {
        out.push(pts[i]);
      }
    }
    return out;
  }

  function countAxisReversals(projVals, minSwing) {
    if (!projVals || projVals.length < 3) return 0;
    let dir = 0; // +1 croissant, -1 décroissant
    let extreme = projVals[0];
    let reversals = 0;
    for (let i = 1; i < projVals.length; i++) {
      const v = projVals[i];
      if (dir === 0) {
        if (v - extreme >= minSwing) {
          dir = 1;
          extreme = v;
        } else if (extreme - v >= minSwing) {
          dir = -1;
          extreme = v;
        }
      } else if (dir === 1) {
        if (v > extreme) {
          extreme = v;
        } else if (extreme - v >= minSwing) {
          reversals++;
          dir = -1;
          extreme = v;
        }
      } else {
        if (v < extreme) {
          extreme = v;
        } else if (v - extreme >= minSwing) {
          reversals++;
          dir = 1;
          extreme = v;
        }
      }
    }
    return reversals;
  }

  function measureScribbleOverlapWithStroke(scribPts, scribSize, targetStroke) {
    const tRaw = targetStroke && targetStroke.points;
    if (!tRaw || tRaw.length === 0) return { intersections: 0, closeHits: 0, touchedRatio: 0, isHit: false };
    const tPts = decimateStrokeForGeometry(tRaw, 5);
    const hitRadius = Math.max(5.5, ((scribSize || 5) + (targetStroke.size || 5)) * 0.65);

    // Cas particulier : point isolé (ex : point sur un i, virgule, point final)
    if (tPts.length === 1) {
      const tp = tPts[0];
      let closeHits = 0;
      for (let i = 1; i < scribPts.length; i++) {
        if (pointToSegmentDist(tp, scribPts[i - 1], scribPts[i]) <= hitRadius + 2) {
          closeHits++;
        }
      }
      return { intersections: closeHits >= 2 ? 1 : 0, closeHits, touchedRatio: closeHits > 0 ? 1 : 0, isHit: closeHits >= 2 };
    }

    let intersections = 0;
    let closeHits = 0;
    const touchedTargetIndices = new Set();

    for (let i = 1; i < scribPts.length; i++) {
      const a1 = scribPts[i - 1];
      const a2 = scribPts[i];
      const aMinX = Math.min(a1.x, a2.x) - hitRadius;
      const aMaxX = Math.max(a1.x, a2.x) + hitRadius;
      const aMinY = Math.min(a1.y, a2.y) - hitRadius;
      const aMaxY = Math.max(a1.y, a2.y) + hitRadius;

      let segClose = false;
      for (let j = 1; j < tPts.length; j++) {
        const b1 = tPts[j - 1];
        const b2 = tPts[j];
        if (Math.max(b1.x, b2.x) < aMinX || Math.min(b1.x, b2.x) > aMaxX || Math.max(b1.y, b2.y) < aMinY || Math.min(b1.y, b2.y) > aMaxY) {
          continue;
        }
        if (scribbleSegmentsIntersect(a1, a2, b1, b2)) {
          intersections++;
          touchedTargetIndices.add(j - 1);
          touchedTargetIndices.add(j);
          segClose = true;
        } else if (
          pointToSegmentDist(a2, b1, b2) <= hitRadius ||
          pointToSegmentDist(b2, a1, a2) <= hitRadius
        ) {
          touchedTargetIndices.add(j);
          segClose = true;
        }
      }
      if (segClose) closeHits++;
    }

    const touchedRatio = touchedTargetIndices.size / Math.max(1, tPts.length);
    const isShortStroke = tPts.length <= 4;
    const isHit =
      intersections >= 2 ||
      (intersections >= 1 && (closeHits >= 3 || touchedRatio >= 0.28)) ||
      (isShortStroke && closeHits >= 2 && touchedRatio >= 0.5);

    return { intersections, closeHits, touchedRatio, isHit };
  }

  function detectAndApplyScribbleToErase(stroke, page) {
    if (!state.scribbleToErase || !stroke || stroke.tool !== 'pen' || !page) return false;
    const pts = stroke.points || [];
    if (pts.length < 12) return false;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let pathLen = 0;
    let sumX = 0, sumY = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      sumX += p.x;
      sumY += p.y;
      if (i > 0) {
        pathLen += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      }
    }
    const diag = Math.hypot(maxX - minX, maxY - minY);
    // Rejette immédiatement les petites lettres, traits simples et mots cursifs peu repliés
    if (diag < 24 || pathLen < 105 || pathLen / diag < 2.85) return false;

    // 1. Axe principal (PCA 2D) et axe secondaire du geste pour distinguer un vrai va-et-vient d'une écriture cursive gauche→droite
    const meanX = sumX / pts.length;
    const meanY = sumY / pts.length;
    let cxx = 0, cxy = 0, cyy = 0;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - meanX;
      const dy = pts[i].y - meanY;
      cxx += dx * dx;
      cxy += dx * dy;
      cyy += dy * dy;
    }
    const pcaAngle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const ax = Math.cos(pcaAngle);
    const ay = Math.sin(pcaAngle);
    const bx = -ay;
    const by = ax;

    const projU = new Array(pts.length);
    const projV = new Array(pts.length);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - meanX;
      const dy = pts[i].y - meanY;
      const u = dx * ax + dy * ay;
      const v = dx * bx + dy * by;
      projU[i] = u;
      projV[i] = v;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const spanU = maxU - minU;
    const spanV = maxV - minV;

    // Compte les vrais allers-retours d'amplitude significative sur l'axe principal et l'axe secondaire
    const principalReversals = countAxisReversals(projU, Math.max(12, spanU * 0.32));
    const secondaryReversals = countAxisReversals(projV, Math.max(10, spanV * 0.48));

    // 2. Compte les vrais virages en épingle serrés (angle > 125°, dot < -0.57) sur segments significatifs
    const stepMin = Math.max(6, Math.min(12, diag * 0.08));
    const dirSamples = decimateStrokeForGeometry(pts, stepMin);
    let sharpHairpins = 0;
    for (let i = 2; i < dirSamples.length; i++) {
      const ux = dirSamples[i - 1].x - dirSamples[i - 2].x;
      const uy = dirSamples[i - 1].y - dirSamples[i - 2].y;
      const vx = dirSamples[i].x - dirSamples[i - 1].x;
      const vy = dirSamples[i].y - dirSamples[i - 1].y;
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu >= 5 && lv >= 5) {
        const dot = (ux * vx + uy * vy) / (lu * lv);
        if (dot < -0.57) sharpHairpins++;
      }
    }

    // Motif A : vrai griffonnage va-et-vient sur le même emplacement (horizontal, vertical ou diagonal)
    const isBackAndForthScribble = principalReversals >= 3 && sharpHairpins >= 2 && pathLen / diag >= 2.85;
    // Motif B : rature en dents de scie serrées traversant un mot (exige ensuite des intersections réelles denses)
    const isDenseZigZagScrub = secondaryReversals >= 4 && sharpHairpins >= 4 && pathLen / diag >= 3.15;

    if (!isBackAndForthScribble && !isDenseZigZagScrub) return false;

    // 3. Test géométrique CHIRURGICAL (intersections réelles avec le tracé, jamais par simple boîte englobante large)
    const scribGeomPts = decimateStrokeForGeometry(pts, 5);
    const tightPad = Math.max(5, (stroke.size || 5) * 0.85);
    const box = { minX: minX - tightPad, minY: minY - tightPad, maxX: maxX + tightPad, maxY: maxY + tightPad };
    const boxesOverlap = (a, b) => a && b && a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

    let erasedCount = 0;
    let totalRealCrossings = 0;
    const includeShapesAndHl = Boolean(state.scribbleEraseShapesAndHl);
    const keptStrokes = [];
    for (let i = 0; i < (page.strokes || []).length; i++) {
      const s = page.strokes[i];
      if (!includeShapesAndHl && s.tool === 'highlighter') {
        keptStrokes.push(s);
        continue;
      }
      const sb = getCachedStrokeBounds(s);
      if (!boxesOverlap(box, sb)) {
        keptStrokes.push(s);
        continue;
      }
      const overlap = measureScribbleOverlapWithStroke(scribGeomPts, stroke.size || 5, s);
      if (overlap.isHit) {
        erasedCount++;
        totalRealCrossings += Math.max(1, overlap.intersections);
      } else {
        keptStrokes.push(s);
      }
    }

    let keptShapes = page.shapes || [];
    if (includeShapesAndHl && keptShapes.length > 0) {
      const shapeHitRadius = Math.max(6, (stroke.size || 5) * 1.1);
      keptShapes = keptShapes.filter((sh) => {
        const sb = getShapeBoundingBox(sh);
        if (!boxesOverlap(box, sb)) return true;
        // Ne supprime une forme que si le griffonnage croise RÉELLEMENT son contour (jamais en griffonnant à l'intérieur d'un cadre)
        let borderHits = 0;
        for (let k = 0; k < scribGeomPts.length; k++) {
          if (isPointNearShape(sh, scribGeomPts[k].x, scribGeomPts[k].y, shapeHitRadius)) {
            borderHits++;
            if (borderHits >= 3) break;
          }
        }
        if (borderHits >= 3) {
          erasedCount++;
          totalRealCrossings += borderHits;
          return false;
        }
        return true;
      });
    }

    // Pour le motif B (zig-zag progressif), exige au moins 3 vrais croisements d'encre pour ne jamais confondre avec de l'écriture
    if (erasedCount === 0 || (!isBackAndForthScribble && totalRealCrossings < 3)) return false;

    page.strokes = keptStrokes;
    page.shapes = keptShapes;
    invalidateStaticInkCache();
    clearActiveCanvas();
    scheduleSaveActivePage(page);
    return true;
  }

  function tryCircleToLassoSelection(pts, page) {
    if (!state.circleToLasso || !page || !pts || pts.length < 12) return false;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].x < minX) minX = pts[i].x;
      if (pts[i].y < minY) minY = pts[i].y;
      if (pts[i].x > maxX) maxX = pts[i].x;
      if (pts[i].y > maxY) maxY = pts[i].y;
    }
    const diag = Math.hypot(maxX - minX, maxY - minY);
    if (diag < 32) return false;
    const closeDist = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y);
    if (closeDist > diag * 0.36) return false;

    const poly = pts.map((p) => ({ x: p.x, y: p.y }));
    const filters = state.lassoFilters || { handwriting: true, shapes: true, texts: true, images: true };
    const selStrokes = new Set();
    const selShapes = new Set();
    const selTexts = new Set();
    const selImages = new Set();
    if (filters.handwriting !== false) {
      const candidateStrokes = typeof queryPageStrokesInRect === 'function'
        ? queryPageStrokesInRect(page, minX, minY, maxX, maxY, false)
        : (page.strokes || []);
      candidateStrokes.forEach((s) => {
        const sb = getCachedStrokeBounds(s);
        if (sb && pointInPolygon((sb.minX + sb.maxX) * 0.5, (sb.minY + sb.maxY) * 0.5, poly)) {
          selStrokes.add(s.id);
        }
      });
    }
    if (filters.shapes !== false) {
      const candidateShapes = typeof queryPageShapesInRect === 'function'
        ? queryPageShapesInRect(page, minX, minY, maxX, maxY, false)
        : (page.shapes || []);
      candidateShapes.forEach((sh) => {
        const sb = getShapeBoundingBox(sh);
        if (sb && pointInPolygon((sb.minX + sb.maxX) * 0.5, (sb.minY + sb.maxY) * 0.5, poly)) {
          selShapes.add(sh.id);
        }
      });
    }
    if (filters.texts !== false) {
      (page.texts || []).forEach((t) => {
        const cx = (t.x || 0) + (t.width || 200) * 0.5;
        const cy = (t.y || 0) + 28;
        if (pointInPolygon(cx, cy, poly)) selTexts.add(t.id);
      });
    }
    if (filters.images !== false) {
      (page.images || []).forEach((img) => {
        const cx = (img.x || 0) + (img.width || 240) * 0.5;
        const cy = (img.y || 0) + (img.height || 180) * 0.5;
        if (pointInPolygon(cx, cy, poly)) selImages.add(img.id);
      });
    }

    const total = selStrokes.size + selShapes.size + selTexts.size + selImages.size;
    if (total === 0) return false;

    state.currentStroke = null;
    state.isDrawing = false;
    // Le stylet est encore posé : on ignore la suite de ce contact pour ne pas effacer aussitôt la sélection créée
    state.deselectTapPointerId = state.activePointerId;
    state.activePointerId = null;
    state.lassoPolygon = [];
    state.selectedIds.strokes = selStrokes;
    state.selectedIds.shapes = selShapes;
    state.selectedIds.texts = selTexts;
    state.selectedIds.images = selImages;
    computeSelectionBounds();
    state.tool = 'lasso';
    updateToolbarActiveState();
    updateLassoToolbarBadge();
    updateLassoFloatingBarPosition();
    renderWorldTextCards();
    clearActiveCanvas();
    invalidateStaticInkCache();
    requestRender();
    return true;
  }

  function scheduleHoldShapeCheck() {
    cancelHoldShapeTimer();
    const isAutoShapeTool = state.tool === 'shape' && state.shapeType === 'auto';
    const holdShapeActive = state.tool === 'pencil' ? Boolean(state.pencilDrawAndHold) : Boolean(state.autoShapeEnabled);
    if ((!isAutoShapeTool && !holdShapeActive && !state.circleToLasso) || state.currentStrokeSnappedFromAutoShape) return;
    if (state.tool !== 'pen' && state.tool !== 'pencil' && state.tool !== 'highlighter' && !isAutoShapeTool) return;
    state.holdShapeTimer = setTimeout(() => {
      state.holdShapeTimer = null;
      trySnapStrokeToShape();
    }, isAutoShapeTool ? 320 : 460);
  }

  function trySnapStrokeToShape() {
    if (!state.isDrawing || !state.currentStroke || state.currentStrokeSnappedFromAutoShape || state.colorWheelOpen) return;
    const isAutoShapeTool = state.tool === 'shape' && state.shapeType === 'auto';
    if (state.tool !== 'pen' && state.tool !== 'pencil' && state.tool !== 'highlighter' && !isAutoShapeTool) return;
    const pts = state.currentStroke.points || [];
    if (pts.length < (isAutoShapeTool ? 2 : 5)) return;

    const page = getActivePage();
    // Geste GoodNotes : entourer des éléments et maintenir -> Sélection au lasso automatique
    if (state.tool === 'pen' && state.circleToLasso && tryCircleToLassoSelection(pts, page)) {
      return;
    }

    const holdShapeActive = state.tool === 'pencil' ? Boolean(state.pencilDrawAndHold) : Boolean(state.autoShapeEnabled);
    if (!isAutoShapeTool && !holdShapeActive) return;
    const detected = detectShapeFromStroke(
      pts,
      state.currentStroke.color,
      state.currentStroke.size,
      state.currentStroke.tool === 'highlighter',
      {
        forceSnap: isAutoShapeTool || Boolean(state.currentStroke._isInstantShapeStroke),
        filled: isAutoShapeTool ? Boolean(state.shapeFilled) : false,
        existingShapes: page ? page.shapes : null,
        snapToOtherShapes: true
      }
    );
    if (!detected) return;
    if (isAutoShapeTool) applyActiveShapeStrokeStyle(detected);

    state.currentShape = detected;
    state.currentStrokeSnappedFromAutoShape = true;
    if (dom.pointerTypeBadge) dom.pointerTypeBadge.textContent = `✨ Forme parfaite : ${detected.detectedName}`;
    requestActiveRender();
  }

  let lastTelemetryUpdateMs = 0;
  let lastHoldScheduleTimeMs = 0;
  let lastBadgeLabelStr = '';
  let lastPressureWidthStr = '';
  let lastPressureTextStr = '';
  let lastCoalescedTextStr = '';

  function updateTelemetryHUD(e, coalescedCount = 1, computedPressure = 0.5, force = false) {
    const now = performance.now();
    if (!force && state.isDrawing && now - lastTelemetryUpdateMs < 90) return;
    lastTelemetryUpdateMs = now;
    const typeMap = { pen: 'Stylet Windows Ink', mouse: 'Souris PC', touch: 'Tactile / Pincement' };
    const label = typeMap[e.pointerType] || 'Pointeur';
    const tilt = e.pointerType === 'pen' && (e.tiltX || e.tiltY) ? ` (${e.tiltX || 0}°, ${e.tiltY || 0}°)` : '';
    const badgeStr = `${label}${tilt}`;
    if (badgeStr !== lastBadgeLabelStr && dom.pointerTypeBadge) {
      lastBadgeLabelStr = badgeStr;
      dom.pointerTypeBadge.textContent = badgeStr;
    }
    const wStr = `${Math.round(Math.max(0.05, Math.min(1, computedPressure)) * 100)}%`;
    if (wStr !== lastPressureWidthStr && dom.pressureBarFill) {
      lastPressureWidthStr = wStr;
      dom.pressureBarFill.style.width = wStr;
    }
    const pStr = computedPressure.toFixed(2);
    if (pStr !== lastPressureTextStr && dom.pressureReadout) {
      lastPressureTextStr = pStr;
      dom.pressureReadout.textContent = pStr;
    }
    const cStr = `${coalescedCount} pt${coalescedCount > 1 ? 's' : ''}`;
    if (cStr !== lastCoalescedTextStr && dom.coalescedReadout) {
      lastCoalescedTextStr = cStr;
      dom.coalescedReadout.textContent = cStr;
    }
  }

  function extractEffectivePressure(evt, worldPt) {
    if (state.pressureMode === 'uniform') return 0.5;
    if (evt.pointerType === 'pen' || (evt.pressure > 0 && evt.pressure !== 0.5)) {
      return Math.max(0.05, Math.min(1.0, evt.pressure));
    }
    const now = evt.timeStamp || performance.now();
    if (state.lastPointerPoint && state.lastPointerTime) {
      const dt = Math.max(1, now - state.lastPointerTime);
      const dist = Math.hypot(worldPt.x - state.lastPointerPoint.x, worldPt.y - state.lastPointerPoint.y);
      return Math.max(0.22, Math.min(0.88, 0.78 - (dist / dt) * 0.22));
    }
    return 0.55;
  }

  function handlePointerDown(e) {
    if (e.target && e.target.closest && (
      e.target.closest('.world-text-card') ||
      e.target.closest('.lasso-floating-actions') ||
      e.target.closest('.shape-edit-bar') ||
      e.target.closest('.text-edit-bar') ||
      e.target.closest('.gn-text-subbar') ||
      e.target.closest('.gn-text-popover') ||
      e.target.closest('.gn-lasso-subbar') ||
      e.target.closest('.gn-lasso-popover') ||
      e.target.closest('.split-secondary-pane') ||
      e.target.closest('.split-resizer') ||
      e.target.closest('.split-nb-popover') ||
      e.target.closest('.radial-color-wheel')
    )) {
      return;
    }
    if (state.colorWheelOpen) {
      if (e.cancelable) e.preventDefault();
      if (state.colorWheelTapMode) {
        closeRadialColorWheel(true);
        if (isPenEraserButton(e) || isPenLassoButton(e)) {
          state.waitBarrelReleaseBeforeHoverTrigger = true;
        }
        state.lastLassoButtonClickTime = 0;
        state.lastLassoButtonClickPos = null;
        requestRender();
        return;
      }
      const hovered = updateRadialColorWheelHover(e.clientX, e.clientY);
      if (hovered) {
        selectRadialColor(hovered);
        state.lastPointerUpTime = performance.now();
        state.waitBarrelReleaseBeforeHoverTrigger = true;
      }
      return;
    }
    if (e.cancelable) e.preventDefault();
    window.focus();
    stopViewportAnimations();

    // Si une action temporaire stylet (Lasso ou Gomme) a déjà commencé en survol et que la mine touche l'écran, poursuivre sans réinitialiser
    if (state.isDrawing && e.pointerType === 'pen' && (state.temporaryLassoOverride || state.temporaryEraserOverride) &&
      (isPenLassoButton(e) || isPenEraserButton(e))) {
      state.activePointerId = e.pointerId;
      try { if (typeof e.pointerId === 'number') dom.inkCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }

    dom.paperPopover.classList.add('hidden');
    dom.exportPopover.classList.add('hidden');
    if (state.toolOptionsOpen) {
      state.toolOptionsOpen = false;
      updateToolbarActiveState();
    }

    // Suivi multi-touch pour le pincement (Pinch-to-Zoom) et le déplacement à 2 doigts
    if (e.pointerType === 'touch') {
      // Paume ou doigt posé pendant un tracé au stylet/souris : ignoré pour ne pas voler ni annuler le trait en cours
      if (state.isDrawing && !state.isPanning && state.activePointerId != null && state.activePointerId !== e.pointerId &&
        !state.temporaryLassoOverride && !state.temporaryEraserOverride) {
        return;
      }
      state.touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (state.touchPoints.size >= 2) {
        cancelHoldShapeTimer();
        cancelColorWheelTimer();
        if (state.isDrawing) {
          state.isDrawing = false;
          state.currentStroke = null;
          state.currentShape = null;
          state.currentStrokeSnappedFromAutoShape = false;
          state.eraserGestureActive = false;
          state.eraserHistoryPushed = false;
          state.lastEraserWorldPt = null;
          state.activePointerId = null;
          clearActiveCanvas();
        }
        // Le 1er doigt avait démarré un pan : on l'arrête, sinon la vue sauterait à l'origine du pan au relâchement du 2e doigt
        if (state.isPanning) {
          state.isPanning = false;
          state.activePointerId = null;
          dom.canvasViewport.classList.remove('panning');
        }
        state.isPinching = true;
        setCanvasInteractingClass(true);
        const pts = Array.from(state.touchPoints.values());
        state.pinchLastDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        state.pinchLastCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        if (dom.pointerTypeBadge) dom.pointerTypeBadge.textContent = 'Pincement Zoom / Pan 2 doigts';
        return;
      }
    }

    const isPen = e.pointerType === 'pen';
    if (isPen) {
      state.lastPenSeenTime = performance.now();
    } else if (e.pointerType === 'touch' && state.touchPoints.size === 1 && performance.now() - state.lastPenSeenTime < 350) {
      // Rejet de paume bref juste après le stylet (tout en gardant le zoom 2 doigts)
      return;
    }

    // Déplacement (Pan) : 1 doigt tactile automatiquement = bouger, Clic molette, Clic droit souris (hors bouton stylet !), Barre Espace, Outil Main
    const isMiddleOrMouseRight = (!isPen && (e.button === 1 || e.button === 2 || (e.buttons & 4) !== 0 || (e.buttons & 2) !== 0)) ||
      (isPen && e.button === 1 && !isPenLassoButton(e));
    const isTouchPan = e.pointerType === 'touch';
    if (isMiddleOrMouseRight || state.isSpacePressed || state.tool === 'pan' || isTouchPan) {
      resetPullToAddState();
      state.isPanning = true;
      setCanvasInteractingClass(true);
      state.activePointerId = e.pointerId;
      state.panStartScreen = { x: e.clientX, y: e.clientY };
      state.panStartOffset = { x: state.panX, y: state.panY };
      panVelocitySamples.length = 0;
      recordPanVelocitySample(e.clientX, e.clientY);
      dom.canvasViewport.classList.add('panning');
      try { dom.inkCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      updateTelemetryHUD(e, 1, e.pressure || 0.5, true);
      return;
    }

    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 5 && (e.buttons & 1) === 0 && (e.buttons & 32) === 0) return;

    // Boutons latéraux du stylet : Gomme (bouton 5 / mask 32) vs Lasso temporaire (2e bouton / mask 2,8,16)
    // Un double-clic sur le 2e bouton du stylet ouvre directement la roue de couleurs radiale
    if (isPenEraserButton(e)) {
      state.lastLassoButtonClickTime = 0;
      state.lastLassoButtonClickPos = null;
      if (!state.temporaryEraserOverride) {
        state.previousToolBeforeEraser = state.tool === 'eraser' ? 'pen' : state.tool;
      }
      state.temporaryEraserOverride = true;
      state.tool = 'eraser';
      updateToolbarActiveState();
    } else if (isPenLassoButton(e)) {
      const nowTs = getPointerEventTimestamp(e);
      const prevPos = state.lastLassoButtonClickPos;
      const isDoubleClick = Boolean(
        state.lastLassoButtonClickTime > 0 &&
        prevPos &&
        (nowTs - state.lastLassoButtonClickTime) <= RADIAL_WHEEL_DBLCLICK_MS &&
        Math.hypot(e.clientX - prevPos.x, e.clientY - prevPos.y) <= RADIAL_WHEEL_DBLCLICK_MAX_DIST_PX
      );
      if (isDoubleClick) {
        state.lastLassoButtonClickTime = 0;
        state.lastLassoButtonClickPos = null;
        state.lassoButtonDownTime = 0;
        state.lassoButtonDownPos = null;
        state.lassoButtonMaxTravel = 0;
        state.waitBarrelReleaseBeforeHoverTrigger = true;
        openRadialColorWheelAt(e.clientX, e.clientY, true);
        return;
      }
      if (!state.temporaryLassoOverride) {
        state.previousToolBeforeLasso = state.tool === 'lasso' ? 'pen' : state.tool;
      }
      state.temporaryLassoOverride = true;
      state.tool = 'lasso';
      state.lassoButtonDownTime = nowTs;
      state.lassoButtonDownPos = { x: e.clientX, y: e.clientY };
      state.lassoButtonMaxTravel = 0;
      updateToolbarActiveState();
    }

    let page = getActivePage();
    if (!page) {
      applyDemoStateSynchronously();
      page = getActivePage();
      if (!page) return;
    }

    let rawWorldPt = screenToWorld(e.clientX, e.clientY);
    // En format A4 empilé verticalement : si le stylet touche une autre page visible de la pile, bascule sans saut sur cette page
    if (isBoundedPage(page)) {
      const hitStackItem = findStackPageAtWorldPoint(rawWorldPt.x, rawWorldPt.y, 4);
      if (hitStackItem && hitStackItem.page.id !== page.id) {
        switchActivePageInStack(hitStackItem.page.id);
        page = getActivePage();
        rawWorldPt = screenToWorld(e.clientX, e.clientY);
      }
      if (!isPointInsidePage(page, rawWorldPt.x, rawWorldPt.y, 4)) {
        return;
      }
    }
    const worldPt = clampPointToPage(page, rawWorldPt);
    const pressure = extractEffectivePressure(e, worldPt);
    state.lastPointerPoint = worldPt;
    state.lastPointerTime = e.timeStamp || performance.now();
    updateTelemetryHUD(e, 1, pressure, true);

    // Activation des liens internes/externes PDF en mode Main (pan) ou avec Ctrl+Clic (ne gêne jamais le stylet)
    if (page.pdfId && (state.tool === 'pan' || e.ctrlKey) && typeof findPdfLinkAtWorldPoint === 'function') {
      const hitPdfLink = findPdfLinkAtWorldPoint(page, worldPt.x, worldPt.y);
      if (hitPdfLink && activatePdfLink(hitPdfLink, page)) {
        return;
      }
    }

    // Si une sélection Lasso est active (ex. après cercle-lasso, 2e bouton du stylet ou duplication),
    // cliquer/glisser dans le cadre de sélection déplace ou redimensionne directement les éléments au lieu de dessiner par-dessus
    if (
      state.tool !== 'eraser' &&
      state.tool !== 'pan' &&
      tryStartLassoSelectionTransform(worldPt)
    ) {
      deferPendingPageSaveDuringGesture(page);
      if (state.gnPenPopoverOpen || state.gnPencilPopoverOpen || state.gnHighlighterPopoverOpen || state.gnTapePopoverOpen || state.gnStrokePopoverOpen || state.gnShapeStrokePopoverOpen) {
        state.gnPenPopoverOpen = false;
        state.gnPencilPopoverOpen = false;
        state.gnHighlighterPopoverOpen = false;
        state.gnTapePopoverOpen = false;
        state.gnStrokePopoverOpen = false;
        state.gnShapeStrokePopoverOpen = false;
        updateToolbarActiveState();
      }
      state.activePointerId = e.pointerId;
      state.isDrawing = true;
      setCanvasInteractingClass(true);
      try { if (typeof e.pointerId === 'number') dom.inkCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      updateLassoFloatingBarPosition();
      renderActiveCanvasOnly();
      return;
    }

    // Une sélection (lasso, forme ou zone de texte) est active et l'appui tombe hors de celle-ci :
    // cet appui sert uniquement à terminer la manœuvre (désélection), sans dessiner ni créer quoi que ce soit.
    if (state.tool !== 'pan' && !state.temporaryEraserOverride) {
      const hasLassoSel = hasAnyLassoSelection();
      const selShape = state.selectedShapeId ? getSelectedShape(page) : null;
      const keepForShapeEdit = Boolean(selShape) && state.tool === 'shape' && (
        hitTestShapeEditHandle(selShape, worldPt.x, worldPt.y) ||
        isPointOnOrInsideShape(selShape, worldPt.x, worldPt.y) ||
        findShapeAtPoint(page, worldPt.x, worldPt.y)
      );
      const hasTextSel = Boolean(state.selectedTextId || state.editingTextId);
      if (((hasLassoSel || selShape) && !keepForShapeEdit) || hasTextSel) {
        if (hasLassoSel) clearLassoSelection();
        if (state.selectedShapeId && !keepForShapeEdit) clearSelectedShape(false);
        if (hasTextSel) clearSelectedTextBox(true);
        // Bloque tout tracé tant que ce même appui n'est pas relâché (le pointermove relancerait sinon un trait)
        state.deselectTapPointerId = e.pointerId;
        try { if (typeof e.pointerId === 'number') dom.inkCanvas.setPointerCapture(e.pointerId); } catch (_) {}
        renderActiveCanvasOnly();
        requestRender();
        return;
      }
    }

    if (state.tool === 'text') {
      if (state.gnTextPopover) {
        state.gnTextPopover = null;
        updateToolbarActiveState();
      }
      // Si une zone de texte est déjà en cours d'édition ou sélectionnée, un clic sur la page la valide et la désélectionne proprement (comme GoodNotes 6) sans créer une zone fantôme
      if (state.editingTextId || state.selectedTextId) {
        clearSelectedTextBox(true);
        return;
      }
      // Permet soit un clic rapide (zone de texte instantanée), soit un cliquer-glisser pour tracer la largeur voulue (GoodNotes NewTextBoxPreviewRenderer)
      state.activePointerId = e.pointerId;
      state.isDrawing = true;
      state.textBoxCreateDrag = {
        startWorld: { x: worldPt.x, y: worldPt.y },
        curWorld: { x: worldPt.x, y: worldPt.y },
        startScreen: { x: e.clientX, y: e.clientY }
      };
      try { if (typeof e.pointerId === 'number') dom.inkCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    if (state.selectedTextId || state.editingTextId) {
      clearSelectedTextBox(true);
    }

    // Annule le minuteur de sauvegarde différée (500 ms) si un nouveau trait commence pour ne jamais bloquer le Main Thread pendant l'écriture
    deferPendingPageSaveDuringGesture(page);

    // Édition interactive de forme sélectionnée (GoodNotes ShapeTool Editing : poignées + déplacement + clic sur forme)
    state.pendingShapeTapCandidateId = null;
    state.pendingShapeTapStartScreen = null;
    if (state.tool === 'shape') {
      const curSelSh = getSelectedShape(page);
      if (curSelSh) {
        const hitHandle = hitTestShapeEditHandle(curSelSh, worldPt.x, worldPt.y);
        if (hitHandle) {
          pushHistorySnapshot(page);
          state.activePointerId = e.pointerId;
          state.isDrawing = true;
          state.shapeEditDrag = {
            mode: hitHandle.kind,
            handleId: hitHandle.id,
            sx: hitHandle.sx || 0,
            sy: hitHandle.sy || 0,
            index: hitHandle.index,
            startWorld: { x: worldPt.x, y: worldPt.y },
            origShape: {
              ...curSelSh,
              vertices: Array.isArray(curSelSh.vertices) ? curSelSh.vertices.map((v) => ({ x: v.x, y: v.y })) : undefined
            }
          };
          try { if (typeof e.pointerId === 'number') dom.inkCanvas.setPointerCapture(e.pointerId); } catch (_) {}
          renderActiveCanvasOnly();
          return;
        }
        if (isPointOnOrInsideShape(curSelSh, worldPt.x, worldPt.y)) {
          pushHistorySnapshot(page);
          state.activePointerId = e.pointerId;
          state.isDrawing = true;
          state.shapeEditDrag = {
            mode: 'move',
            handleId: 'body',
            startWorld: { x: worldPt.x, y: worldPt.y },
            origShape: {
              ...curSelSh,
              vertices: Array.isArray(curSelSh.vertices) ? curSelSh.vertices.map((v) => ({ x: v.x, y: v.y })) : undefined
            }
          };
          try { if (typeof e.pointerId === 'number') dom.inkCanvas.setPointerCapture(e.pointerId); } catch (_) {}
          renderActiveCanvasOnly();
          return;
        }
        clearSelectedShape(false);
      }
      const tapHit = findShapeAtPoint(page, worldPt.x, worldPt.y);
      if (tapHit) {
        state.pendingShapeTapCandidateId = tapHit.id;
        state.pendingShapeTapStartScreen = { x: e.clientX, y: e.clientY };
      }
    } else if (state.selectedShapeId) {
      clearSelectedShape(false);
    }

    state.activePointerId = e.pointerId;
    state.isDrawing = true;
    setCanvasInteractingClass(true);
    state.drawingPausedOutsidePage = false;
    state.lastOutsideRawPt = null;
    state.strokeStartTime = performance.now();
    state.currentStrokeSnappedFromAutoShape = false;
    state.currentShape = null;
    const hadLassoSelection = hasAnyLassoSelection();

    // Ferme automatiquement tout popover de réglages ouvert dès qu'on pose le stylet sur la page
    if (state.gnPenPopoverOpen || state.gnPencilPopoverOpen || state.gnHighlighterPopoverOpen || state.gnStrokePopoverOpen || state.gnShapeStrokePopoverOpen) {
      state.gnPenPopoverOpen = false;
      state.gnPencilPopoverOpen = false;
      state.gnHighlighterPopoverOpen = false;
      state.gnStrokePopoverOpen = false;
      state.gnShapeStrokePopoverOpen = false;
      updateToolbarActiveState();
    }

    if (state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter' || (state.tool === 'shape' && state.shapeType === 'auto')) {
      clearLassoSelection();
      pushHistorySnapshot();
      const isHl = state.tool === 'highlighter';
      const isPencil = state.tool === 'pencil';
      const isAutoShapeTool = state.tool === 'shape' && state.shapeType === 'auto';
      const downTime = e.timeStamp || performance.now();
      state.predictedPoints = [];
      state.currentStroke = {
        id: createUid('st'),
        tool: isAutoShapeTool ? 'pen' : state.tool,
        penStyle: isHl ? 'highlighter' : (isPencil ? 'pencil' : (isAutoShapeTool ? 'ballpoint' : state.penStyle)),
        lineStyle: (isHl || isPencil || isAutoShapeTool) ? 'solid' : (state.penLineStyle || 'solid'),
        color: isAutoShapeTool ? (state.shapeColor || state.penColor) : (isHl ? state.highlighterColor : (isPencil ? state.pencilColor : state.penColor)),
        size: isAutoShapeTool ? Math.max(2, state.shapeSize || state.penSize) : (isHl ? state.highlighterSize : (isPencil ? state.pencilSize : state.penSize)),
        smoothing: isAutoShapeTool ? 0 : (isHl ? (state.highlighterSmoothing ?? 0) : state.smoothing),
        tipSharpness: state.tipSharpness ?? 0.5,
        pressureSensitivity: state.pressureSensitivity ?? 0.5,
        pressureMode: (isHl || isAutoShapeTool) ? 'uniform' : state.pressureMode,
        simulatePressure: false,
        _isInstantShapeStroke: isAutoShapeTool || ((state.tool === 'pen' || isPencil) && Boolean(state.instantShapeMode)),
        points: [],
        _renderedUpToIndex: 0
      };
      const effPressure = computeLiveEffectivePressure(state.currentStroke, pressure, e.tiltX || 0, e.tiltY || 0, null);
      const startPt = snapWorldPointToVirtualRuler(worldPt, true);
      state.currentStroke.points.push({
        x: startPt.x,
        y: startPt.y,
        pressure: effPressure,
        tiltX: e.tiltX || 0,
        tiltY: e.tiltY || 0,
        t: downTime
      });
      initLiveStabilizer(state.currentStroke, startPt.x, startPt.y, downTime);
      state.holdShapeAnchorScreen = { x: e.clientX, y: e.clientY };
      cancelHoldShapeTimer();
      if (hadLassoSelection) requestRender();
      else renderActiveCanvasOnly();
    } else if (state.tool === 'tape') {
      clearLassoSelection();
      const hitTape = findTapeAtPoint(page, worldPt.x, worldPt.y);
      if (hitTape) {
        hitTape.revealed = !hitTape.revealed;
        state.isDrawing = false;
        state.activePointerId = null;
        invalidateStaticInkCache();
        requestRender();
        scheduleSaveActivePage(page);
        return;
      }
      pushHistorySnapshot();
      const tapeStartPt = snapWorldPointToVirtualRuler(worldPt, true);
      const isStraightTape = Boolean(state.tapeForceStraight);
      state.currentTape = {
        id: createUid('tp'),
        x1: tapeStartPt.x,
        y1: tapeStartPt.y,
        x2: tapeStartPt.x,
        y2: tapeStartPt.y,
        straight: isStraightTape,
        points: isStraightTape ? undefined : [{ x: tapeStartPt.x, y: tapeStartPt.y }],
        thickness: Math.max(12, state.tapeSize || state.highlighterSize || 26),
        color: state.tapeColor || '#ff5f67',
        revealed: false
      };
      renderActiveCanvasOnly();
    } else if (state.tool === 'laser') {
      state.laserTrail.push({ x: worldPt.x, y: worldPt.y, t: performance.now() });
      startLaserDecayLoop();
      renderActiveCanvasOnly();
    } else if (state.tool === 'shape') {
      clearLassoSelection();
      pushHistorySnapshot();
      const isDirectConnector = state.shapeType === 'line' || state.shapeType === 'arrow' || state.shapeType === 'elbowArrow' || state.shapeType === 'curvedArrow';
      const startSnap = isDirectConnector ? findShapeConnectionSnap(worldPt, page.shapes) : null;
      const sx = startSnap ? startSnap.x : worldPt.x;
      const sy = startSnap ? startSnap.y : worldPt.y;
      state.currentShape = applyActiveShapeStrokeStyle({
        id: createUid('sh'),
        type: state.shapeType,
        x1: sx,
        y1: sy,
        x2: sx,
        y2: sy,
        color: state.shapeColor || state.penColor,
        size: Math.max(2, state.shapeSize || state.penSize),
        filled: state.shapeFilled,
        startConnection: startSnap && startSnap.connection ? startSnap.connection : undefined
      });
      if (hadLassoSelection) requestRender();
      else renderActiveCanvasOnly();
    } else if (state.tool === 'eraser') {
      clearLassoSelection();
      // Snapshot Undo paresseux : aucun clonage de page tant que la gomme n'a pas réellement touché un trait/forme/tape
      state.eraserGestureActive = true;
      state.eraserHistoryPushed = false;
      state.lastEraserWorldPt = { x: worldPt.x, y: worldPt.y };
      updateEraserCursor(e.clientX, e.clientY, true);
      updateColorDotCursor(e.clientX, e.clientY, false);
      const erasedOnDown = applyEraserAtPoint(worldPt.x, worldPt.y);
      if (hadLassoSelection) requestRender();
      else if (erasedOnDown) requestStaticInkRender();
    } else if (state.tool === 'lasso') {
      handleLassoPointerDown(worldPt);
      if (state.lassoAction === 'draw' && !hadLassoSelection) renderActiveCanvasOnly();
      else requestRender();
    }

    if (state.tool !== 'eraser') {
      updateColorDotCursor(e.clientX, e.clientY, shouldShowColorDotCursor(e, false));
    }

    try {
      if (typeof e.pointerId === 'number') dom.inkCanvas.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function handlePointerMove(e) {
    const showEraserCircle = state.tool === 'eraser' || (!state.isDrawing && isPenEraserButton(e));
    updateEraserCursor(e.clientX, e.clientY, showEraserCircle);
    updateColorDotCursor(e.clientX, e.clientY, shouldShowColorDotCursor(e, showEraserCircle));

    // Pincement à 2 doigts (Pinch-to-Zoom + Pan simultané)
    if (e.pointerType === 'touch' && state.touchPoints.has(e.pointerId)) {
      state.touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (state.isPinching && state.touchPoints.size >= 2) {
        if (e.cancelable) e.preventDefault();
        const pts = Array.from(state.touchPoints.values());
        const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const newCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const rect = dom.inkCanvas.getBoundingClientRect();

        if (state.pinchLastDist > 12 && newDist > 12) {
          const factor = newDist / state.pinchLastDist;
          const targetZoom = state.zoom * factor;
          zoomAtScreenPoint(targetZoom, newCenter.x - rect.left, newCenter.y - rect.top);
        }
        const pinchPan = clampViewportPan(
          state.panX + (newCenter.x - state.pinchLastCenter.x),
          state.panY + (newCenter.y - state.pinchLastCenter.y),
          state.zoom,
          getActivePage()
        );
        state.panX = pinchPan.panX;
        state.panY = pinchPan.panY;
        state.pinchLastDist = newDist;
        state.pinchLastCenter = newCenter;
        syncWorldLayerTransform();
        requestRender();
        return;
      }
    }

    if (state.isPanning && (e.pointerId === state.activePointerId || state.activePointerId === null)) {
      if (e.cancelable) e.preventDefault();
      const rawPanX = state.panStartOffset.x + (e.clientX - state.panStartScreen.x);
      const rawPanY = state.panStartOffset.y + (e.clientY - state.panStartScreen.y);
      const activePg = getActivePage();
      if (isBoundedPage(activePg)) {
        applyBoundedPanWithPullToAdd(rawPanX, rawPanY, 'pan');
      } else {
        const clampedPan = clampViewportPan(rawPanX, rawPanY, state.zoom, activePg);
        state.panX = clampedPan.panX;
        state.panY = clampedPan.panY;
      }
      recordPanVelocitySample(e.clientX, e.clientY);
      syncWorldLayerTransform();
      requestRender();
      return;
    }

    // Survol actif de la roue de couleurs ouverte
    if (state.colorWheelOpen) {
      updateRadialColorWheelHover(e.clientX, e.clientY);
      if (!state.colorWheelTapMode && e.pointerType === 'pen' && e.buttons === 0 && e.pressure <= 0.005) {
        handlePointerUpOrCancel(e);
      }
      return;
    }

    // Fin propre si un bouton stylet temporaire (Lasso ou Gomme) est relâché en survol sans contact
    if (state.isDrawing && e.pointerType === 'pen' && e.buttons === 0 && e.pressure <= 0.005 &&
      (state.temporaryLassoOverride || state.temporaryEraserOverride)) {
      handlePointerUpOrCancel(e);
      return;
    }

    if (!state.isDrawing) {
      if (e.pointerType === 'pen' && !isPenEraserButton(e) && !isPenLassoButton(e)) {
        state.waitBarrelReleaseBeforeHoverTrigger = false;
      }
      releaseStaleTemporaryPenTool(e);
      if (performance.now() - state.lastPointerUpTime < 40) return;
      const tipActive = e.pointerType === 'pen' ? (e.pressure > 0.02 || (e.buttons & 1) !== 0) : false;
      const hoverBarrelAllowed = e.pointerType === 'pen' && !state.waitBarrelReleaseBeforeHoverTrigger &&
        (isPenEraserButton(e) || isPenLassoButton(e));
      const isStylusOrTouchContact =
        (e.pointerType === 'pen' && (tipActive || hoverBarrelAllowed)) ||
        (e.pointerType === 'mouse' && e.buttons === 1);
      if (state.deselectTapPointerId != null) {
        if (isStylusOrTouchContact && e.pointerId === state.deselectTapPointerId) return;
        state.deselectTapPointerId = null;
      }
      if (isStylusOrTouchContact && state.tool !== 'text') {
        handlePointerDown(e);
        return;
      }
      if (isConnectorToolMode() && e.pointerType !== 'touch') {
        const hoverPg = getActivePage();
        if (hoverPg && hoverPg.shapes && hoverPg.shapes.length > 0) {
          const wHover = screenToWorld(e.clientX, e.clientY);
          if (updateShapeConnectionHover(wHover, null, hoverPg)) {
            renderActiveCanvasOnly();
          }
        }
      }
      if (e.pointerType === 'pen') updateTelemetryHUD(e, 1, e.pressure || 0);
      return;
    }

    if (state.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== state.activePointerId) return;
    if (e.cancelable) e.preventDefault();

    let coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    if (!coalesced || coalesced.length === 0) coalesced = [e];

    const activePageForMove = getActivePage();
    if (state.textBoxCreateDrag) {
      const wPt = clampPointToPage(activePageForMove, screenToWorld(e.clientX, e.clientY));
      state.textBoxCreateDrag.curWorld = { x: wPt.x, y: wPt.y };
      renderActiveCanvasOnly();
      return;
    }

    if (state.shapeEditDrag) {
      const selSh = getSelectedShape(activePageForMove);
      if (selSh && activePageForMove) {
        const wPt = clampPointToPage(activePageForMove, screenToWorld(e.clientX, e.clientY));
        applyShapeEditDrag(selSh, state.shapeEditDrag.origShape, state.shapeEditDrag, wPt, activePageForMove);
        invalidateStaticInkCache();
        renderScene();
        renderActiveCanvasOnly();
        updateShapeEditFloatingBar();
      }
      return;
    }
    if (state.lassoAction === 'move' || state.lassoAction === 'scale') {
      handleLassoPointerMove(clampPointToPage(activePageForMove, screenToWorld(e.clientX, e.clientY)));
      requestRender();
      return;
    }
    if (state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter' || (state.tool === 'shape' && state.shapeType === 'auto')) {
      if (!state.currentStroke && !state.drawingPausedOutsidePage) return;

      // Si la forme a déjà été détectée au maintien, ajuste en douceur l'extrémité pour Ligne / Flèche sur le canvas actif uniquement
      if (state.currentStrokeSnappedFromAutoShape && state.currentShape) {
        if (state.currentShape.type === 'line' || state.currentShape.type === 'arrow') {
          const wPt = clampPointToPage(activePageForMove, screenToWorld(e.clientX, e.clientY));
          const snappedEnd = snapLineEndpoint45(state.currentShape.x1, state.currentShape.y1, wPt.x, wPt.y, 5.0);
          state.currentShape.x2 = snappedEnd.x;
          state.currentShape.y2 = snappedEnd.y;
          if (activePageForMove && activePageForMove.shapes) {
            snapShapeToNearbyShapes(state.currentShape, activePageForMove.shapes, 16);
          }
          renderActiveCanvasOnly();
        }
        return;
      }

      const bounded = isBoundedPage(activePageForMove);
      const pageB = bounded ? getPageBounds(activePageForMove) : null;
      let lastP = 0.5;
      const minMoveDist = 0.85 / Math.max(0.25, state.zoom);
      let addedCount = 0;

      for (const ce of coalesced) {
        if (!Number.isFinite(ce.clientX) || !Number.isFinite(ce.clientY)) continue;
        const rawPt = snapWorldPointToVirtualRuler(screenToWorld(ce.clientX, ce.clientY), false);
        const p = extractEffectivePressure(ce, rawPt);
        lastP = p;
        const ptTime = ce.timeStamp || performance.now();

        if (bounded) {
          const inside = rawPt.x >= 0 && rawPt.x <= pageB.maxX && rawPt.y >= 0 && rawPt.y <= pageB.maxY;
          if (!inside) {
            // Sortie de la feuille A4 / PDF : on coupe proprement le trait au bord exact sans jamais dessiner le long du bord
            if (!state.drawingPausedOutsidePage && state.currentStroke && state.currentStroke.points.length > 0) {
              const curPts = state.currentStroke.points;
              const prevIn = curPts[curPts.length - 1];
              const hit = intersectSegmentWithRect(prevIn, rawPt, pageB.maxX, pageB.maxY);
              if (hit && hit.exit && Math.hypot(hit.exit.x - prevIn.x, hit.exit.y - prevIn.y) > 0.25) {
                curPts.push({
                  x: hit.exit.x,
                  y: hit.exit.y,
                  pressure: p,
                  tiltX: ce.tiltX || 0,
                  tiltY: ce.tiltY || 0,
                  t: ptTime
                });
              }
              const finishedStroke = state.currentStroke;
              const wasInstantShape = Boolean(finishedStroke._isInstantShapeStroke);
              delete finishedStroke._liveEuroX;
              delete finishedStroke._liveEuroY;
              delete finishedStroke._lastRawPt;
              delete finishedStroke._stabLastRawX;
              delete finishedStroke._stabLastRawY;
              delete finishedStroke._stabPrevDirX;
              delete finishedStroke._stabPrevDirY;
              delete finishedStroke._isInstantShapeStroke;
              state.currentStroke = null;
              if (wasInstantShape && finishedStroke.points.length >= 2) {
                const edgeShape = detectShapeFromStroke(
                  finishedStroke.points,
                  finishedStroke.color,
                  finishedStroke.size,
                  finishedStroke.tool === 'highlighter',
                  {
                    forceSnap: true,
                    filled: state.tool === 'shape' ? Boolean(state.shapeFilled) : false,
                    existingShapes: activePageForMove.shapes,
                    snapToOtherShapes: true
                  }
                );
                if (edgeShape) {
                  if (state.tool === 'shape') applyActiveShapeStrokeStyle(edgeShape);
                  delete edgeShape.detectedName;
                  activePageForMove.shapes.push(edgeShape);
                  mergeCompletedItemIntoStaticCanvas(edgeShape, 'shape');
                }
              } else {
                invalidateStrokeCache(finishedStroke);
                activePageForMove.strokes.push(finishedStroke);
                mergeCompletedItemIntoStaticCanvas(finishedStroke, 'stroke');
              }
              clearActiveCanvas();
              scheduleSaveActivePage(activePageForMove);
              state.drawingPausedOutsidePage = true;
            }
            state.lastOutsideRawPt = rawPt;
            continue;
          }

          // Retour dans la feuille après en être sorti : démarre un nouveau trait net depuis le point d'entrée sur le bord
          if (state.drawingPausedOutsidePage) {
            const isHl = state.tool === 'highlighter';
            const isPencil = state.tool === 'pencil';
            const entryPts = [];
            if (state.lastOutsideRawPt) {
              const hit = intersectSegmentWithRect(state.lastOutsideRawPt, rawPt, pageB.maxX, pageB.maxY);
              if (hit && hit.entry) {
                entryPts.push({
                  x: hit.entry.x,
                  y: hit.entry.y,
                  pressure: p,
                  tiltX: ce.tiltX || 0,
                  tiltY: ce.tiltY || 0,
                  t: ptTime
                });
              }
            }
            entryPts.push({
              x: rawPt.x,
              y: rawPt.y,
              pressure: p,
              tiltX: ce.tiltX || 0,
              tiltY: ce.tiltY || 0,
              t: ptTime
            });
            state.currentStroke = {
              id: createUid('st'),
              tool: state.tool,
              penStyle: isHl ? 'highlighter' : (isPencil ? 'pencil' : state.penStyle),
              lineStyle: (isHl || isPencil) ? 'solid' : (state.penLineStyle || 'solid'),
              color: isHl ? state.highlighterColor : (isPencil ? state.pencilColor : state.penColor),
              size: isHl ? state.highlighterSize : (isPencil ? state.pencilSize : state.penSize),
              smoothing: isHl ? (state.highlighterSmoothing ?? 0) : state.smoothing,
              tipSharpness: state.tipSharpness ?? 0.5,
              pressureSensitivity: state.pressureSensitivity ?? 0.5,
              pressureMode: isHl ? 'uniform' : state.pressureMode,
              simulatePressure: false,
              points: entryPts,
              _renderedUpToIndex: 0
            };
            initLiveStabilizer(state.currentStroke, rawPt.x, rawPt.y, ptTime);
            state.drawingPausedOutsidePage = false;
            state.lastOutsideRawPt = null;
            state.lastPointerPoint = rawPt;
            state.lastPointerTime = ptTime;
            addedCount++;
            continue;
          }
        }

        if (!state.currentStroke) continue;
        const pts = state.currentStroke.points;
        const prevPt = pts[pts.length - 1];
        // Stabilisation One-Euro en TEMPS RÉEL pendant le tracé (contournée si guidage sur règle actif)
        const stabPt = virtualRulerState.activeEdge ? rawPt : applyLiveStabilization(state.currentStroke, rawPt.x, rawPt.y, ptTime);
        const finalPt = bounded ? clampPointToPage(activePageForMove, stabPt) : stabPt;
        const effP = computeLiveEffectivePressure(state.currentStroke, p, ce.tiltX || 0, ce.tiltY || 0, prevPt ? prevPt.pressure : null);
        state.currentStroke._lastRawPt = {
          x: bounded ? clampPointToPage(activePageForMove, rawPt).x : rawPt.x,
          y: bounded ? clampPointToPage(activePageForMove, rawPt).y : rawPt.y,
          pressure: effP,
          tiltX: ce.tiltX || 0,
          tiltY: ce.tiltY || 0,
          t: ptTime
        };
        if (prevPt && Math.hypot(finalPt.x - prevPt.x, finalPt.y - prevPt.y) < minMoveDist) {
          prevPt.pressure = prevPt.pressure * 0.5 + effP * 0.5;
          continue;
        }
        state.lastPointerPoint = finalPt;
        state.lastPointerTime = ptTime;
        pts.push({
          x: finalPt.x,
          y: finalPt.y,
          pressure: effP,
          tiltX: ce.tiltX || 0,
          tiltY: ce.tiltY || 0,
          t: ptTime
        });
        addedCount++;
      }

      const pts = state.currentStroke ? state.currentStroke.points : [];

      // Lecture optionnelle des événements prédits (getPredictedEvents) pour l'aperçu d'encre anticipé
      const rawPredicted = typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents() : null;
      if (rawPredicted && rawPredicted.length > 0) {
        const predPts = [];
        const maxPred = Math.min(3, rawPredicted.length);
        for (let pi = 0; pi < maxPred; pi++) {
          const pe = rawPredicted[pi];
          if (pe && Number.isFinite(pe.clientX) && Number.isFinite(pe.clientY)) {
            const pw = clampPointToPage(activePageForMove, screenToWorld(pe.clientX, pe.clientY));
            predPts.push({ x: pw.x, y: pw.y, pressure: extractEffectivePressure(pe, pw) });
          }
        }
        state.predictedPoints = predPts;
      } else {
        state.predictedPoints = [];
      }

      // Détection d'immobilité (Hold-to-Shape) après un tracé réel >= 24px (throttlée pour éviter clearTimeout/setTimeout à 240 Hz)
      const holdShapeAllowed = state.tool === 'pencil' ? Boolean(state.pencilDrawAndHold) : Boolean(state.autoShapeEnabled);
      if (holdShapeAllowed) {
        const anchor = state.holdShapeAnchorScreen;
        const movedScreen = anchor ? Math.hypot(e.clientX - anchor.x, e.clientY - anchor.y) : 99;
        const nowMs = performance.now();
        if (movedScreen > 8) {
          state.holdShapeAnchorScreen = { x: e.clientX, y: e.clientY };
          if (pts.length >= 6 && nowMs - lastHoldScheduleTimeMs > 75) {
            lastHoldScheduleTimeMs = nowMs;
            scheduleHoldShapeCheck();
          }
        } else if (!state.holdShapeTimer && pts.length >= 6) {
          lastHoldScheduleTimeMs = nowMs;
          scheduleHoldShapeCheck();
        }
      }

      updateTelemetryHUD(e, coalesced.length, lastP);
      if (state.tool === 'shape' && state.shapeType === 'auto' && state.currentStroke && state.currentStroke.points.length > 0 && activePageForMove && activePageForMove.shapes && activePageForMove.shapes.length > 0) {
        const tipPt = state.currentStroke.points[state.currentStroke.points.length - 1];
        const originPt = state.currentStroke.points[0];
        const prevHad = Boolean(state.shapeHoverConnection);
        const connChanged = updateShapeConnectionHover(tipPt, originPt, activePageForMove);
        if (connChanged && !state.shapeHoverConnection && prevHad) {
          state.currentStroke._incrementalStarted = false;
          state.currentStroke._renderedUpToIndex = 0;
        }
        if (addedCount > 0 || connChanged) renderActiveCanvasOnly();
      } else if (addedCount > 0) {
        // Rendu incrémental O(1) à 60/120 FPS : ne dessine que la queue du trait en cours sur #activeInkCanvas
        renderActiveCanvasOnly();
      }
    } else if (state.tool === 'tape') {
      if (!state.currentTape) return;
      const wPt = clampPointToPage(activePageForMove, snapWorldPointToVirtualRuler(screenToWorld(e.clientX, e.clientY), false));
      if (state.currentTape.straight === false && Array.isArray(state.currentTape.points)) {
        const pts = state.currentTape.points;
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(wPt.x - last.x, wPt.y - last.y) >= 3) {
          pts.push({ x: wPt.x, y: wPt.y });
          state.currentTape.x2 = wPt.x;
          state.currentTape.y2 = wPt.y;
        }
      } else {
        // Mode "Ruban droit" (GoodNotes forceStraightenTape) : ligne droite nette avec aimantation horizontale/verticale douce
        const dx = wPt.x - state.currentTape.x1;
        const dy = wPt.y - state.currentTape.y1;
        if (Math.abs(dy) < Math.abs(dx) * 0.14) {
          state.currentTape.x2 = wPt.x;
          state.currentTape.y2 = state.currentTape.y1;
        } else if (Math.abs(dx) < Math.abs(dy) * 0.14) {
          state.currentTape.x2 = state.currentTape.x1;
          state.currentTape.y2 = wPt.y;
        } else {
          state.currentTape.x2 = wPt.x;
          state.currentTape.y2 = wPt.y;
        }
      }
      renderActiveCanvasOnly();
    } else if (state.tool === 'laser') {
      const now = performance.now();
      for (const ce of coalesced) {
        const wPt = clampPointToPage(activePageForMove, screenToWorld(ce.clientX, ce.clientY));
        state.laserTrail.push({ x: wPt.x, y: wPt.y, t: now });
      }
      startLaserDecayLoop();
      renderActiveCanvasOnly();
    } else if (state.tool === 'shape') {
      if (!state.currentShape) return;
      const wPt = clampPointToPage(activePageForMove, screenToWorld(e.clientX, e.clientY));
      const isDirectConnector = isConnectorShape(state.currentShape);
      if (isDirectConnector && activePageForMove && activePageForMove.shapes && activePageForMove.shapes.length > 0) {
        const fromPt = { x: state.currentShape.x1, y: state.currentShape.y1 };
        const endSnap = findShapeConnectionSnap(wPt, activePageForMove.shapes, { fromPt, excludeShapeId: state.currentShape.id });
        if (endSnap) {
          state.currentShape.x2 = endSnap.x;
          state.currentShape.y2 = endSnap.y;
          state.currentShape.endConnection = endSnap.connection || undefined;
          state.shapeHoverConnection = {
            targetShape: endSnap.targetShape,
            snapPoint: { x: endSnap.x, y: endSnap.y },
            connection: endSnap.connection || null
          };
        } else {
          state.currentShape.x2 = wPt.x;
          state.currentShape.y2 = wPt.y;
          delete state.currentShape.endConnection;
          updateShapeConnectionHover(wPt, fromPt, activePageForMove);
        }
      } else {
        state.currentShape.x2 = wPt.x;
        state.currentShape.y2 = wPt.y;
      }
      renderActiveCanvasOnly();
    } else if (state.tool === 'eraser') {
      const minStep = Math.max(0.8, state.eraserSize * 0.2);
      const minStepSq = minStep * minStep;
      const maxGap = Math.max(2, state.eraserSize * 0.65);
      let anyErased = false;
      for (let ci = 0; ci < coalesced.length; ci++) {
        const ce = coalesced[ci];
        const wPt = clampPointToPage(activePageForMove, screenToWorld(ce.clientX, ce.clientY));
        const isLast = ci === coalesced.length - 1;
        if (state.lastEraserWorldPt) {
          const dx = wPt.x - state.lastEraserWorldPt.x;
          const dy = wPt.y - state.lastEraserWorldPt.y;
          const distSq = dx * dx + dy * dy;
          if (!isLast && distSq < minStepSq) continue;
          const jumpDist = Math.sqrt(distSq);
          if (jumpDist > maxGap) {
            const steps = Math.min(16, Math.ceil(jumpDist / maxGap));
            for (let s = 1; s < steps; s++) {
              const t = s / steps;
              if (applyEraserAtPoint(state.lastEraserWorldPt.x + dx * t, state.lastEraserWorldPt.y + dy * t)) {
                anyErased = true;
              }
            }
          }
        }
        state.lastEraserWorldPt = wPt;
        if (applyEraserAtPoint(wPt.x, wPt.y)) anyErased = true;
      }
      if (anyErased) requestStaticInkRender();
    } else if (state.tool === 'lasso') {
      if (state.temporaryLassoOverride && state.lassoButtonDownPos) {
        const travel = Math.hypot(e.clientX - state.lassoButtonDownPos.x, e.clientY - state.lassoButtonDownPos.y);
        if (travel > state.lassoButtonMaxTravel) state.lassoButtonMaxTravel = travel;
      }
      handleLassoPointerMove(clampPointToPage(activePageForMove, screenToWorld(e.clientX, e.clientY)));
      if (state.lassoAction === 'draw') renderActiveCanvasOnly();
      else requestRender();
    }
  }

  function handlePointerUpOrCancel(e) {
    state.lastPointerUpTime = performance.now();
    restoreDeferredPageSaveAfterGesture();
    if (!state.isDrawing && !state.isPanning && !state.colorWheelOpen) releaseStaleTemporaryPenTool(e);
    if (state.deselectTapPointerId != null && (e.pointerId === state.deselectTapPointerId || e.pointerId === undefined)) {
      state.deselectTapPointerId = null;
      try { if (typeof e.pointerId === 'number') dom.inkCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    state.predictedPoints = [];
    virtualRulerState.activeEdge = null;
    cancelHoldShapeTimer();
    cancelColorWheelTimer();

    if (e.pointerType === 'touch') {
      const wasPinching = state.isPinching;
      state.touchPoints.delete(e.pointerId);
      if (state.touchPoints.size < 2) {
        state.isPinching = false;
        if (wasPinching) {
          const snappingBack = snapBackBoundedViewportIfZoomedOut();
          // Le doigt restant reprend un pan à partir de sa position actuelle (sans saut), sauf pendant le recalage animé
          if (!snappingBack && state.touchPoints.size === 1) {
            const [restId, restPt] = Array.from(state.touchPoints.entries())[0];
            state.isPanning = true;
            state.activePointerId = restId;
            state.panStartScreen = { x: restPt.x, y: restPt.y };
            state.panStartOffset = { x: state.panX, y: state.panY };
            panVelocitySamples.length = 0;
            dom.canvasViewport.classList.add('panning');
          } else {
            setCanvasInteractingClass(false);
          }
        } else if (!state.isDrawing && !state.isPanning) {
          setCanvasInteractingClass(false);
        }
      } else if (wasPinching) {
        // Encore 2 doigts ou plus : on ré-ancre le pincement sur les deux premiers pour éviter un saut de zoom
        const pts = Array.from(state.touchPoints.values());
        state.pinchLastDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        state.pinchLastCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      }
      if (wasPinching) return;
    }

    if (state.isPanning && (e.pointerId === state.activePointerId || state.activePointerId === null)) {
      state.isPanning = false;
      state.activePointerId = null;
      setCanvasInteractingClass(false);
      dom.canvasViewport.classList.remove('panning');
      try { if (typeof e.pointerId === 'number') dom.inkCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      if (commitOrResetPullToAdd()) return;
      startPanInertiaLoop();
      return;
    }

    // Validation / Bascule tactile de la Roue de Couleurs au relâchement du bouton lasso
    if (state.colorWheelOpen) {
      if (!state.colorWheelTapMode) {
        state.isDrawing = false;
        state.activePointerId = null;
        setCanvasInteractingClass(false);
        try { if (typeof e.pointerId === 'number') dom.inkCanvas.releasePointerCapture(e.pointerId); } catch (_) {}

        const hovered = updateRadialColorWheelHover(e.clientX, e.clientY);
        const distCenter = Math.hypot(e.clientX - state.colorWheelCenterScreen.x, e.clientY - state.colorWheelCenterScreen.y);
        if (hovered) {
          selectRadialColor(hovered);
          if (isPenEraserButton(e) || isPenLassoButton(e)) state.waitBarrelReleaseBeforeHoverTrigger = true;
        } else if (distCenter <= 26) {
          state.colorWheelTapMode = true;
          if (dom.radialColorWheel) dom.radialColorWheel.classList.add('tap-mode');
          if (dom.pointerTypeBadge) dom.pointerTypeBadge.textContent = 'Touchez une couleur sur la roue';
        } else {
          closeRadialColorWheel(true);
          if (isPenEraserButton(e) || isPenLassoButton(e)) state.waitBarrelReleaseBeforeHoverTrigger = true;
        }
        requestRender();
      }
      return;
    }

    if (!state.isDrawing) {
      if (!state.isPanning && !state.isPinching) setCanvasInteractingClass(false);
      return;
    }
    if (state.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== state.activePointerId) return;

    if (state.textBoxCreateDrag) {
      const td = state.textBoxCreateDrag;
      state.textBoxCreateDrag = null;
      state.isDrawing = false;
      state.activePointerId = null;
      setCanvasInteractingClass(false);
      try { if (typeof e.pointerId === 'number') dom.inkCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      clearActiveCanvas();
      const dragScreenDist = Math.hypot((e.clientX ?? td.startScreen.x) - td.startScreen.x, (e.clientY ?? td.startScreen.y) - td.startScreen.y);
      if (dragScreenDist >= 14) {
        const minX = Math.min(td.startWorld.x, td.curWorld.x);
        const minY = Math.min(td.startWorld.y, td.curWorld.y);
        const draggedW = Math.max(120, Math.round(Math.abs(td.curWorld.x - td.startWorld.x)));
        createInteractiveTextCardAt(minX, minY, '', false, true, draggedW);
      } else {
        createInteractiveTextCardAt(td.startWorld.x, td.startWorld.y, '', false, true, 260);
      }
      return;
    }

    if (state.shapeEditDrag) {
      const pageForEdit = getActivePage();
      state.shapeEditDrag = null;
      state.shapeHoverConnection = null;
      state.isDrawing = false;
      state.activePointerId = null;
      setCanvasInteractingClass(false);
      try { if (typeof e.pointerId === 'number') dom.inkCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      if (pageForEdit) {
        invalidateStaticInkCache();
        scheduleSaveActivePage(pageForEdit);
      }
      renderScene();
      renderActiveCanvasOnly();
      updateShapeEditFloatingBar();
      return;
    }

    state.isDrawing = false;
    setCanvasInteractingClass(false);
    state.drawingPausedOutsidePage = false;
    state.lastOutsideRawPt = null;
    state.activePointerId = null;
    state.shapeHoverConnection = null;
    const tapCandidateId = state.pendingShapeTapCandidateId;
    const tapStartScreen = state.pendingShapeTapStartScreen;
    state.pendingShapeTapCandidateId = null;
    state.pendingShapeTapStartScreen = null;
    try { if (typeof e.pointerId === 'number') dom.inkCanvas.releasePointerCapture(e.pointerId); } catch (_) {}

    // Clic / Tap rapide sur une forme existante en outil Formes -> ouvre le mode édition (poignées + barre flottante)
    if (state.tool === 'shape' && tapCandidateId && tapStartScreen) {
      const moveScreenDist = Math.hypot((e.clientX ?? tapStartScreen.x) - tapStartScreen.x, (e.clientY ?? tapStartScreen.y) - tapStartScreen.y);
      let maxStrokeSpan = 0;
      if (state.currentStroke && state.currentStroke.points && state.currentStroke.points.length > 1) {
        const p0 = state.currentStroke.points[0];
        for (const pt of state.currentStroke.points) {
          const d = Math.hypot(pt.x - p0.x, pt.y - p0.y);
          if (d > maxStrokeSpan) maxStrokeSpan = d;
        }
      }
      if (moveScreenDist < 9 && maxStrokeSpan < 9) {
        state.currentStroke = null;
        state.currentShape = null;
        state.currentStrokeSnappedFromAutoShape = false;
        const pgTap = getActivePage();
        if (pgTap && pgTap.id) {
          const histTap = getPageHistory(pgTap.id);
          if (histTap.undoStack.length > 0) histTap.undoStack.pop();
          updateUndoRedoButtons();
        }
        selectShapeForEditing(tapCandidateId);
        return;
      }
    }

    let mergedDirectlyIntoStatic = false;
    const page = getActivePage();
    if (page) {
      if (state.lassoAction === 'move' || state.lassoAction === 'scale') {
        handleLassoPointerUp();
      } else if ((state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter' || (state.tool === 'shape' && state.shapeType === 'auto')) && state.currentStroke) {
        if (state.currentStrokeSnappedFromAutoShape && state.currentShape) {
          const snapped = state.currentShape;
          delete snapped.detectedName;
          page.shapes.push(snapped);
          state.currentShape = null;
          state.currentStroke = null;
          state.currentStrokeSnappedFromAutoShape = false;
          mergeCompletedItemIntoStaticCanvas(snapped, 'shape');
          mergedDirectlyIntoStatic = true;
          scheduleSaveActivePage(page);
        } else {
          if (state.currentStroke.points.length === 1) {
            const p0 = state.currentStroke.points[0];
            state.currentStroke.points.push({ x: p0.x + 0.2, y: p0.y + 0.2, pressure: p0.pressure });
          }
          const finishedStroke = state.currentStroke;

          // Mode Forme instantanée (Outil Formes de la barre principale OU bouton Formes instantanées) :
          // comportement GoodNotes ShapeTool — convertit FORCÉMENT tout geste tracé en forme géométrique propre au relâchement
          if (finishedStroke._isInstantShapeStroke && finishedStroke.points.length >= 2) {
            const instantDetected = detectShapeFromStroke(
              finishedStroke.points,
              finishedStroke.color,
              finishedStroke.size,
              finishedStroke.tool === 'highlighter',
              {
                forceSnap: true,
                filled: state.tool === 'shape' ? Boolean(state.shapeFilled) : false,
                existingShapes: page.shapes,
                snapToOtherShapes: true
              }
            );
            if (instantDetected) {
              if (state.tool === 'shape') applyActiveShapeStrokeStyle(instantDetected);
              delete instantDetected.detectedName;
              page.shapes.push(instantDetected);
              state.currentStroke = null;
              state.currentShape = null;
              mergeCompletedItemIntoStaticCanvas(instantDetected, 'shape');
              mergedDirectlyIntoStatic = true;
              scheduleSaveActivePage(page);
              clearActiveCanvas();
              requestRender();
              return;
            } else if (state.tool === 'shape') {
              // Tap accidentel minuscule (< 5px) dans l'outil Formes : on annule proprement au lieu de laisser un point brut
              state.currentStroke = null;
              state.currentShape = null;
              clearActiveCanvas();
              requestRender();
              return;
            }
          }

          // Geste GoodNotes : Griffonner pour effacer
          if (finishedStroke.tool === 'pen' && !finishedStroke._isInstantShapeStroke && detectAndApplyScribbleToErase(finishedStroke, page)) {
            state.currentStroke = null;
            mergedDirectlyIntoStatic = false;
            requestRender();
            return;
          }

          // Redressement automatique GoodNotes pour le Surligneur (traits quasi-rectilignes)
          if (finishedStroke.tool === 'highlighter' && state.highlighterAutoStraighten && finishedStroke.points.length >= 2) {
            const pts = finishedStroke.points;
            const pStart = pts[0];
            const pEnd = pts[pts.length - 1];
            const endDist = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);
            if (endDist >= 18) {
              let totalLen = 0;
              let maxDev = 0;
              for (let i = 1; i < pts.length; i++) {
                totalLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
                const dev = pointToSegmentDist(pts[i], pStart, pEnd);
                if (dev > maxDev) maxDev = dev;
              }
              if (totalLen / endDist <= 1.22 && maxDev / endDist <= 0.14) {
                let x2 = pEnd.x;
                let y2 = pEnd.y;
                const ang = Math.atan2(y2 - pStart.y, x2 - pStart.x);
                const snapRad = (4.0 * Math.PI) / 180;
                if (Math.abs(ang) < snapRad || Math.abs(Math.abs(ang) - Math.PI) < snapRad) {
                  y2 = pStart.y;
                } else if (Math.abs(Math.abs(ang) - Math.PI / 2) < snapRad) {
                  x2 = pStart.x;
                }
                finishedStroke.points = [
                  { x: pStart.x, y: pStart.y, pressure: 0.5 },
                  { x: x2, y: y2, pressure: 0.5 }
                ];
                finishedStroke._liveStabilized = false;
              }
            }
          }

          // Rattrapage doux de la pointe au relâchement lorsque la stabilisation est élevée (évite les fins de traits coupées court)
          if (finishedStroke._liveStabilized && finishedStroke._lastRawPt && finishedStroke.points.length >= 2) {
            const tail = finishedStroke.points[finishedStroke.points.length - 1];
            const rawEnd = finishedStroke._lastRawPt;
            const lagDist = Math.hypot(rawEnd.x - tail.x, rawEnd.y - tail.y);
            if (lagDist > 1.5 && lagDist < 36) {
              const pull = Math.min(22, lagDist * 0.68);
              const ratio = pull / lagDist;
              const midX = tail.x + (rawEnd.x - tail.x) * (ratio * 0.5);
              const midY = tail.y + (rawEnd.y - tail.y) * (ratio * 0.5);
              const endX = tail.x + (rawEnd.x - tail.x) * ratio;
              const endY = tail.y + (rawEnd.y - tail.y) * ratio;
              finishedStroke.points.push(
                { x: midX, y: midY, pressure: (tail.pressure + rawEnd.pressure) * 0.5, tiltX: rawEnd.tiltX, tiltY: rawEnd.tiltY, t: rawEnd.t },
                { x: endX, y: endY, pressure: rawEnd.pressure, tiltX: rawEnd.tiltX, tiltY: rawEnd.tiltY, t: rawEnd.t }
              );
            }
          }

          delete finishedStroke._liveEuroX;
          delete finishedStroke._liveEuroY;
          delete finishedStroke._lastRawPt;
          delete finishedStroke._stabLastRawX;
          delete finishedStroke._stabLastRawY;
          delete finishedStroke._stabPrevDirX;
          delete finishedStroke._stabPrevDirY;
          delete finishedStroke._isInstantShapeStroke;
          invalidateStrokeCache(finishedStroke);
          page.strokes.push(finishedStroke);
          state.currentStroke = null;
          mergeCompletedItemIntoStaticCanvas(finishedStroke, 'stroke');
          mergedDirectlyIntoStatic = true;
          scheduleSaveActivePage(page);
        }
      } else if (state.tool === 'tape' && state.currentTape) {
        if (getTapeTotalLength(state.currentTape) > 10) {
          if (!Array.isArray(page.tapes)) page.tapes = [];
          page.tapes.push(state.currentTape);
          invalidateStaticInkCache();
          scheduleSaveActivePage(page);
        }
        state.currentTape = null;
        clearActiveCanvas();
      } else if (state.tool === 'laser') {
        startLaserDecayLoop();
        mergedDirectlyIntoStatic = true;
      } else if (state.tool === 'shape' && state.currentShape) {
        const finishedShape = state.currentShape;
        state.currentShape = null;
        if (Math.hypot(finishedShape.x2 - finishedShape.x1, finishedShape.y2 - finishedShape.y1) > 4) {
          if (isConnectorShape(finishedShape)) {
            snapShapeToNearbyShapes(finishedShape, page.shapes);
          }
          page.shapes.push(finishedShape);
          mergeCompletedItemIntoStaticCanvas(finishedShape, 'shape');
          mergedDirectlyIntoStatic = true;
          scheduleSaveActivePage(page);
        } else {
          clearActiveCanvas();
          mergedDirectlyIntoStatic = true;
        }
      } else if (state.tool === 'eraser') {
        const didErase = Boolean(state.eraserHistoryPushed);
        state.eraserGestureActive = false;
        state.eraserHistoryPushed = false;
        state.lastEraserWorldPt = null;
        if (didErase) {
          scheduleSaveActivePage(page);
          requestStaticInkRender();
        }
        mergedDirectlyIntoStatic = true;
        if (state.eraserAutoDeselect && !state.temporaryEraserOverride) {
          state.tool = state.previousWritingTool || 'pen';
          updateToolbarActiveState();
        }
      } else if (state.tool === 'lasso') {
        handleLassoPointerUp();
      }
    }

    if (state.temporaryEraserOverride) {
      state.temporaryEraserOverride = false;
      if (isPenEraserButton(e) || isPenLassoButton(e)) state.waitBarrelReleaseBeforeHoverTrigger = true;
      state.tool = state.previousToolBeforeEraser || 'pen';
      updateToolbarActiveState();
    }
    if (state.temporaryLassoOverride) {
      finalizeLassoButtonClickTracking(e, true);
      state.temporaryLassoOverride = false;
      if (isPenEraserButton(e) || isPenLassoButton(e)) state.waitBarrelReleaseBeforeHoverTrigger = true;
      state.tool = state.previousToolBeforeLasso || 'pen';
      updateToolbarActiveState();
    }
    if (!mergedDirectlyIntoStatic) {
      requestRender();
    }
  }

  let lastEraserCursorSize = -1;
  function updateEraserCursor(clientX, clientY, visible) {
    if (!visible) {
      if (dom.eraserCursor.style.display !== 'none') {
        dom.eraserCursor.style.display = 'none';
      }
      return;
    }
    const d = Math.max(4, Math.round(state.eraserSize * 2 * state.zoom));
    if (dom.eraserCursor.style.display !== 'block') {
      dom.eraserCursor.style.display = 'block';
    }
    if (d !== lastEraserCursorSize) {
      lastEraserCursorSize = d;
      dom.eraserCursor.style.width = `${d}px`;
      dom.eraserCursor.style.height = `${d}px`;
    }
    dom.eraserCursor.style.transform = `translate3d(${clientX}px, ${clientY}px, 0) translate(-50%, -50%)`;
  }

  function getActiveCursorColor() {
    if (state.tool === 'pencil') return state.pencilColor || '#111827';
    if (state.tool === 'highlighter') return state.highlighterColor || '#fde047';
    if (state.tool === 'shape') return state.shapeColor || state.penColor || '#1e293b';
    if (state.tool === 'tape') return state.tapeColor || '#f59e0b';
    if (state.tool === 'laser') return state.laserColor || '#ef4444';
    if (state.tool === 'text') return state.textColor || state.penColor || '#1e293b';
    return state.penColor || '#1e293b';
  }

  function shouldShowColorDotCursor(e, showEraserCircle) {
    if (showEraserCircle) return false;
    if (state.tool === 'eraser' || state.tool === 'pan' || state.tool === 'text') return false;
    if (state.isSpacePressed || state.isPanning || state.colorWheelOpen) return false;
    if (e && e.pointerType === 'touch') return false;
    return true;
  }

  let lastColorDotColor = '';
  function updateColorDotCursor(clientX, clientY, visible) {
    if (!dom.colorDotCursor) return;
    if (!visible) {
      if (dom.colorDotCursor.style.display !== 'none') {
        dom.colorDotCursor.style.display = 'none';
      }
      return;
    }
    const nextColor = getActiveCursorColor();
    if (nextColor !== lastColorDotColor) {
      lastColorDotColor = nextColor;
      dom.colorDotCursor.style.backgroundColor = nextColor;
    }
    if (dom.colorDotCursor.style.display !== 'block') {
      dom.colorDotCursor.style.display = 'block';
    }
    dom.colorDotCursor.style.transform = `translate3d(${clientX}px, ${clientY}px, 0) translate(-50%, -50%)`;
  }

  function canEraserEraseStroke(s) {
    if (!s) return false;
    if (state.eraserHighlighterOnly) return s.tool === 'highlighter';
    const f = state.eraserFilters || { pen: true, pencil: true, highlighter: true, tape: true };
    if (s.tool === 'highlighter') return f.highlighter !== false;
    if (s.tool === 'pencil' || s.penStyle === 'pencil') return f.pencil !== false;
    return f.pen !== false;
  }

  function canEraserEraseShape(sh) {
    if (!sh) return false;
    if (state.eraserHighlighterOnly) return Boolean(sh.isHighlighter);
    const f = state.eraserFilters || { pen: true, pencil: true, highlighter: true, tape: true };
    if (sh.isHighlighter) return f.highlighter !== false;
    return f.pen !== false;
  }

  function ensureEraserHistorySnapshot(page) {
    if (!state.eraserGestureActive || state.eraserHistoryPushed) return;
    state.eraserHistoryPushed = true;
    pushHistorySnapshot(page);
  }

  function applyEraserAtPoint(wx, wy) {
    const page = getActivePage();
    if (!page) return false;
    const radius = state.eraserSize;
    const rSq = radius * radius;
    const hlOnly = Boolean(state.eraserHighlighterOnly);
    let changed = false;

    const spatialCandidates = (typeof queryPageStrokesAtPoint === 'function')
      ? queryPageStrokesAtPoint(page, wx, wy, radius)
      : (page.strokes || []);

    if (state.eraserMode === 'stroke') {
      if (spatialCandidates && spatialCandidates.length > 0) {
        let erasedSet = null;
        for (let ci = 0; ci < spatialCandidates.length; ci++) {
          const s = spatialCandidates[ci];
          if (!canEraserEraseStroke(s)) continue;
          const b = getCachedStrokeBounds(s);
          if (b && (wx < b.minX - radius || wx > b.maxX + radius || wy < b.minY - radius || wy > b.maxY + radius)) {
            continue;
          }
          const pts = s.points || [];
          let hit = false;
          for (let i = 0; i < pts.length; i++) {
            const pt = pts[i];
            if ((pt.x - wx) ** 2 + (pt.y - wy) ** 2 <= rSq) { hit = true; break; }
            if (i > 0 && pointToSegmentDist({ x: wx, y: wy }, pts[i - 1], pt) <= radius) { hit = true; break; }
          }
          if (hit) {
            if (!erasedSet) erasedSet = new Set();
            erasedSet.add(s);
          }
        }
        if (erasedSet && erasedSet.size > 0) {
          ensureEraserHistorySnapshot(page);
          page.strokes = (page.strokes || []).filter((s) => !erasedSet.has(s));
          changed = true;
        }
      }
    } else if (spatialCandidates && spatialCandidates.length > 0) {
      let replacements = null;
      for (let ci = 0; ci < spatialCandidates.length; ci++) {
        const s = spatialCandidates[ci];
        if (!canEraserEraseStroke(s)) continue;
        const b = getCachedStrokeBounds(s);
        if (b && (wx < b.minX - radius || wx > b.maxX + radius || wy < b.minY - radius || wy > b.maxY + radius)) {
          continue;
        }
        const pts = s.points || [];
        let seg = [];
        let mod = false;
        const subStrokes = [];
        const pushSubStroke = (pointsArr) => {
          if (pointsArr.length < 2) return;
          const sub = cloneStrokeFast(s);
          sub.id = createUid('st');
          sub.points = pointsArr;
          sub._bounds = null;
          invalidateStrokeCache(sub);
          subStrokes.push(sub);
        };

        for (let i = 0; i < pts.length; i++) {
          const pt = pts[i];
          const ptInside = (pt.x - wx) ** 2 + (pt.y - wy) ** 2 <= rSq;

          if (!ptInside && seg.length > 0) {
            const pPrev = seg[seg.length - 1];
            const distSeg = pointToSegmentDist({ x: wx, y: wy }, pPrev, pt);
            if (distSeg <= radius) {
              // Le segment traverse le cercle de la gomme alors que ses deux extrémités sont à l'extérieur
              const dx = pt.x - pPrev.x;
              const dy = pt.y - pPrev.y;
              const fx = pPrev.x - wx;
              const fy = pPrev.y - wy;
              const a = dx * dx + dy * dy;
              const bCoef = 2 * (fx * dx + fy * dy);
              const cCoef = fx * fx + fy * fy - rSq;
              const disc = bCoef * bCoef - 4 * a * cCoef;
              mod = true;
              if (disc > 0 && a > 1e-6) {
                const sqrtD = Math.sqrt(disc);
                const t1 = Math.max(0, Math.min(1, (-bCoef - sqrtD) / (2 * a)));
                const t2 = Math.max(0, Math.min(1, (-bCoef + sqrtD) / (2 * a)));
                if (t1 > 0.02) {
                  seg.push({
                    x: pPrev.x + dx * t1,
                    y: pPrev.y + dy * t1,
                    pressure: (pPrev.pressure ?? 0.5) * (1 - t1) + (pt.pressure ?? 0.5) * t1
                  });
                }
                pushSubStroke(seg);
                seg = [];
                if (t2 < 0.98) {
                  seg.push({
                    x: pPrev.x + dx * t2,
                    y: pPrev.y + dy * t2,
                    pressure: (pPrev.pressure ?? 0.5) * (1 - t2) + (pt.pressure ?? 0.5) * t2
                  });
                }
              } else {
                pushSubStroke(seg);
                seg = [];
              }
              seg.push(pt);
              continue;
            }
          }

          if (ptInside) {
            mod = true;
            if (seg.length >= 2) pushSubStroke(seg);
            seg = [];
          } else {
            seg.push(pt);
          }
        }

        if (mod) {
          if (seg.length >= 2) pushSubStroke(seg);
          if (!replacements) replacements = new Map();
          replacements.set(s, subStrokes);
        }
      }

      if (replacements && replacements.size > 0) {
        ensureEraserHistorySnapshot(page);
        const next = [];
        for (const s of page.strokes || []) {
          const subs = replacements.get(s);
          if (subs !== undefined) {
            for (let k = 0; k < subs.length; k++) next.push(subs[k]);
          } else {
            next.push(s);
          }
        }
        page.strokes = next;
        changed = true;
      }
    }

    const shapesArr = page.shapes || [];
    if (shapesArr.length > 0) {
      let hitShape = false;
      for (let i = 0; i < shapesArr.length; i++) {
        const sh = shapesArr[i];
        if (canEraserEraseShape(sh) && isPointNearShape(sh, wx, wy, radius)) {
          hitShape = true;
          break;
        }
      }
      if (hitShape) {
        ensureEraserHistorySnapshot(page);
        page.shapes = shapesArr.filter((sh) => !canEraserEraseShape(sh) || !isPointNearShape(sh, wx, wy, radius));
        changed = true;
        updateConnectedShapesForPage(page);
      }
    }

    const canEraseTape = !hlOnly && (!state.eraserFilters || state.eraserFilters.tape !== false);
    if (canEraseTape && Array.isArray(page.tapes) && page.tapes.length > 0) {
      let hitTape = false;
      for (let i = 0; i < page.tapes.length; i++) {
        if (isPointOnTape(page.tapes[i], wx, wy, radius)) {
          hitTape = true;
          break;
        }
      }
      if (hitTape) {
        ensureEraserHistorySnapshot(page);
        page.tapes = page.tapes.filter((tp) => !isPointOnTape(tp, wx, wy, radius));
        changed = true;
      }
    }

    if (changed) invalidateStaticInkCache();
    return changed;
  }

  function isPointOnTape(tp, wx, wy, pad = 4) {
    if (!tp) return false;
    const halfThick = (tp.thickness || 26) * 0.5 + pad;
    if (Array.isArray(tp.points) && tp.points.length >= 2 && tp.straight === false) {
      const pts = tp.points;
      for (let i = 1; i < pts.length; i++) {
        if (pointToSegmentDist({ x: wx, y: wy }, pts[i - 1], pts[i]) <= halfThick) return true;
      }
      return false;
    }
    const dx = tp.x2 - tp.x1, dy = tp.y2 - tp.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) return false;
    const t = Math.max(0, Math.min(1, ((wx - tp.x1) * dx + (wy - tp.y1) * dy) / lenSq));
    const px = tp.x1 + t * dx, py = tp.y1 + t * dy;
    return Math.hypot(wx - px, wy - py) <= halfThick;
  }

  function findTapeAtPoint(page, wx, wy) {
    if (!page || !Array.isArray(page.tapes)) return null;
    for (let i = page.tapes.length - 1; i >= 0; i--) {
      if (isPointOnTape(page.tapes[i], wx, wy, 4)) return page.tapes[i];
    }
    return null;
  }

  function startLaserDecayLoop() {
    if (state.laserAnimFrame) return;
    const step = () => {
      state.laserAnimFrame = null;
      if (state.laserTrail.length === 0) {
        clearActiveCanvas();
        return;
      }
      renderActiveCanvasOnly();
      if (state.laserTrail.length > 0) {
        state.laserAnimFrame = requestAnimationFrame(step);
      }
    };
    state.laserAnimFrame = requestAnimationFrame(step);
  }

  // ============================================================================
  // 13. LASSO DE SÉLECTION & CONVERSION MANUSCRIT -> TEXTE / LATEX
  // ============================================================================

  function hasAnyLassoSelection() {
    return (
      state.selectedIds.strokes.size > 0 ||
      state.selectedIds.shapes.size > 0 ||
      state.selectedIds.texts.size > 0 ||
      (state.selectedIds.images && state.selectedIds.images.size > 0) ||
      Boolean(state.lassoPdfClip)
    );
  }
  function clearLassoSelection() {
    state.lassoPolygon = [];
    state.selectedIds.strokes.clear();
    state.selectedIds.shapes.clear();
    state.selectedIds.texts.clear();
    if (state.selectedIds.images) state.selectedIds.images.clear();
    state.lassoPdfClip = null;
    state.selectionBounds = null;
    state.lassoAction = null;
    state.gnLassoAlignPopoverOpen = false;
    updateLassoToolbarBadge();
    updateLassoFloatingBarPosition();
    if (typeof syncGnLassoSubBarUi === 'function') syncGnLassoSubBarUi();
  }
  function extractPdfRegionFromLassoPolygon(page, polygon) {
    if (!page || !page.pdfId || !page.pdfPageNumber || !Array.isArray(polygon) || polygon.length < 3) return null;
    const pw = page.pdfWidth || PAGE_WIDTH;
    const ph = page.pdfHeight || PAGE_HEIGHT;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of polygon) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    minX = Math.max(0, Math.min(pw, minX));
    minY = Math.max(0, Math.min(ph, minY));
    maxX = Math.max(0, Math.min(pw, maxX));
    maxY = Math.max(0, Math.min(ph, maxY));
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 12 || h < 12) return null;

    const key = `${page.pdfId}_${page.pdfPageNumber}`;
    const cached = pdfRenderedCanvasCache.get(key);
    const hasCachedCanvas = Boolean(cached && cached.canvas && cached.canvas.width > 0 && cached.canvas.height > 0);
    const rawScaleX = hasCachedCanvas ? (cached.canvas.width / pw) : 2;
    const rawScaleY = hasCachedCanvas ? (cached.canvas.height / ph) : 2;
    const maxDim = 1200;
    const limitScale = Math.min(1, maxDim / Math.max(1, w * rawScaleX, h * rawScaleY));
    const outW = Math.max(16, Math.round(w * rawScaleX * limitScale));
    const outH = Math.max(16, Math.round(h * rawScaleY * limitScale));

    let src = '';
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = outW;
        cropCanvas.height = outH;
        const cCtx = cropCanvas.getContext('2d');
        if (cCtx) {
          const sxFactor = outW / w;
          const syFactor = outH / h;
          cCtx.save();
          cCtx.beginPath();
          cCtx.moveTo((polygon[0].x - minX) * sxFactor, (polygon[0].y - minY) * syFactor);
          for (let i = 1; i < polygon.length; i++) {
            cCtx.lineTo((polygon[i].x - minX) * sxFactor, (polygon[i].y - minY) * syFactor);
          }
          cCtx.closePath();
          if (typeof cCtx.clip === 'function') cCtx.clip();
          cCtx.fillStyle = '#ffffff';
          cCtx.fillRect(0, 0, outW, outH);
          if (hasCachedCanvas && typeof cCtx.drawImage === 'function') {
            const srcX = (minX / pw) * cached.canvas.width;
            const srcY = (minY / ph) * cached.canvas.height;
            const srcW = (w / pw) * cached.canvas.width;
            const srcH = (h / ph) * cached.canvas.height;
            cCtx.imageSmoothingEnabled = true;
            cCtx.imageSmoothingQuality = 'high';
            cCtx.drawImage(cached.canvas, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
          }
          cCtx.restore();
          if (typeof cropCanvas.toDataURL === 'function') {
            src = cropCanvas.toDataURL('image/png');
          }
        }
        releaseCanvasMemory(cropCanvas);
      } catch (_) {}
    }
    if (!src) {
      src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    }
    return {
      pageId: page.id,
      pdfId: page.pdfId,
      pdfPageNumber: page.pdfPageNumber,
      x: Math.round(minX * 100) / 100,
      y: Math.round(minY * 100) / 100,
      width: Math.max(16, Math.round(w)),
      height: Math.max(16, Math.round(h)),
      src
    };
  }
  function materializePdfLassoClipIfNeeded(page) {
    if (!page || !state.lassoPdfClip) return null;
    const clip = state.lassoPdfClip;
    if (!Array.isArray(page.images)) page.images = [];
    const imgItem = {
      id: createUid('img'),
      x: clip.x,
      y: clip.y,
      width: clip.width,
      height: clip.height,
      src: clip.src
    };
    page.images.push(imgItem);
    state.lassoPdfClip = null;
    if (state.selectedIds.images) state.selectedIds.images.add(imgItem.id);
    invalidateStaticInkCache();
    renderWorldTextCards();
    return imgItem;
  }
  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
    }
    return inside;
  }
  function computeSelectionBounds() {
    const page = getActivePage();
    if (!page || !hasAnyLassoSelection()) { state.selectionBounds = null; return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    (page.strokes || []).forEach((s) => {
      if (state.selectedIds.strokes.has(s.id)) {
        s.points.forEach((p) => {
          if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
        });
      }
    });
    (page.shapes || []).forEach((sh) => {
      if (state.selectedIds.shapes.has(sh.id)) {
        const bb = getShapeBoundingBox(sh);
        minX = Math.min(minX, bb.minX); minY = Math.min(minY, bb.minY);
        maxX = Math.max(maxX, bb.maxX); maxY = Math.max(maxY, bb.maxY);
      }
    });
    (page.texts || []).forEach((tb) => {
      if (state.selectedIds.texts.has(tb.id)) {
        minX = Math.min(minX, tb.x); minY = Math.min(minY, tb.y);
        maxX = Math.max(maxX, tb.x + (tb.width || 240)); maxY = Math.max(maxY, tb.y + 60);
      }
    });
    (page.images || []).forEach((img) => {
      if (state.selectedIds.images && state.selectedIds.images.has(img.id)) {
        minX = Math.min(minX, img.x || 0); minY = Math.min(minY, img.y || 0);
        maxX = Math.max(maxX, (img.x || 0) + (img.width || 240));
        maxY = Math.max(maxY, (img.y || 0) + (img.height || 180));
      }
    });
    if (state.lassoPdfClip) {
      const clip = state.lassoPdfClip;
      minX = Math.min(minX, clip.x || 0);
      minY = Math.min(minY, clip.y || 0);
      maxX = Math.max(maxX, (clip.x || 0) + (clip.width || 120));
      maxY = Math.max(maxY, (clip.y || 0) + (clip.height || 90));
    }
    state.selectionBounds = minX < Infinity ? { minX: minX - 10, minY: minY - 10, maxX: maxX + 10, maxY: maxY + 10 } : null;
  }

  function updateLassoFloatingBarPosition() {
    if (!dom.lassoFloatingActions || !dom.canvasViewport) return;
    if (!state.selectionBounds || !hasAnyLassoSelection() || state.isDrawing || state.colorWheelOpen) {
      dom.lassoFloatingActions.classList.add('hidden');
      return;
    }
    const vpRect = dom.canvasViewport.getBoundingClientRect();
    if (vpRect.width <= 0 || vpRect.height <= 0) return;
    const b = state.selectionBounds;
    const centerScreenX = ((b.minX + b.maxX) * 0.5) * state.zoom + state.panX;
    let topScreenY = b.minY * state.zoom + state.panY - 12;
    if (topScreenY < 105) {
      topScreenY = Math.min(vpRect.height - 72, b.maxY * state.zoom + state.panY + 46);
    }
    const clampedX = Math.max(76, Math.min(vpRect.width - 76, centerScreenX));
    const clampedY = Math.max(96, Math.min(vpRect.height - 64, topScreenY));
    dom.lassoFloatingActions.style.left = `${clampedX}px`;
    dom.lassoFloatingActions.style.top = `${clampedY}px`;
    dom.lassoFloatingActions.classList.remove('hidden');
  }

  function tryStartLassoSelectionTransform(worldPt) {
    const page = getActivePage();
    if (!page || !state.selectionBounds || !hasAnyLassoSelection()) return false;
    const b = state.selectionBounds;
    const invZoom = 1 / Math.max(0.25, state.zoom);
    if (Math.hypot(worldPt.x - b.maxX, worldPt.y - b.maxY) <= 18 * invZoom) {
      pushHistorySnapshot();
      materializePdfLassoClipIfNeeded(page);
      state.lassoAction = 'scale';
      state.lassoDragStartWorld = worldPt;
      state.lassoInitialBounds = { ...b };
      state.lassoInitialSnapshot = clonePageContent(page);
      return true;
    }
    const pad = 10 * invZoom;
    if (
      worldPt.x >= b.minX - pad &&
      worldPt.x <= b.maxX + pad &&
      worldPt.y >= b.minY - pad &&
      worldPt.y <= b.maxY + pad
    ) {
      pushHistorySnapshot();
      materializePdfLassoClipIfNeeded(page);
      state.lassoAction = 'move';
      state.lassoDragStartWorld = worldPt;
      state.lassoInitialSnapshot = clonePageContent(page);
      return true;
    }
    return false;
  }

  function handleLassoPointerDown(worldPt) {
    const page = getActivePage();
    if (!page) return;
    if (tryStartLassoSelectionTransform(worldPt)) return;
    clearLassoSelection();
    state.lassoAction = 'draw';
    state.lassoStartWorld = worldPt;
    state.lassoPolygon = [worldPt];
  }

  function handleLassoPointerMove(worldPt) {
    const page = getActivePage();
    if (!page) return;
    if (state.lassoAction === 'draw') {
      if (state.lassoMode === 'rect' && state.lassoStartWorld) {
        const s = state.lassoStartWorld;
        state.lassoPolygon = [
          { x: s.x, y: s.y },
          { x: worldPt.x, y: s.y },
          { x: worldPt.x, y: worldPt.y },
          { x: s.x, y: worldPt.y }
        ];
      } else {
        state.lassoPolygon.push(worldPt);
      }
    } else if (state.lassoAction === 'move' && state.lassoInitialSnapshot) {
      const dx = worldPt.x - state.lassoDragStartWorld.x;
      const dy = worldPt.y - state.lassoDragStartWorld.y;
      page.strokes.forEach((s, idx) => {
        if (state.selectedIds.strokes.has(s.id)) {
          const orig = state.lassoInitialSnapshot.strokes[idx];
          if (orig) { s.points = orig.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })); invalidateStrokeCache(s); }
        }
      });
      page.shapes.forEach((sh, idx) => {
        if (state.selectedIds.shapes.has(sh.id)) {
          const orig = state.lassoInitialSnapshot.shapes[idx];
          if (orig) {
            sh.x1 = orig.x1 + dx; sh.y1 = orig.y1 + dy; sh.x2 = orig.x2 + dx; sh.y2 = orig.y2 + dy;
            if (Array.isArray(orig.vertices)) sh.vertices = orig.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy }));
          }
        }
      });
      if (state.selectedIds.shapes.size > 0) {
        updateConnectedShapesForPage(page, state.selectedIds.shapes);
      }
      page.texts.forEach((tb, idx) => {
        if (state.selectedIds.texts.has(tb.id)) {
          const orig = state.lassoInitialSnapshot.texts[idx];
          if (orig) { tb.x = orig.x + dx; tb.y = orig.y + dy; }
        }
      });
      (page.images || []).forEach((img, idx) => {
        if (state.selectedIds.images && state.selectedIds.images.has(img.id)) {
          const orig = state.lassoInitialSnapshot.images && state.lassoInitialSnapshot.images[idx];
          if (orig) { img.x = Math.round(orig.x + dx); img.y = Math.round(orig.y + dy); }
        }
      });
      invalidateStaticInkCache();
      computeSelectionBounds();
      renderWorldTextCards();
    } else if (state.lassoAction === 'scale' && state.lassoInitialSnapshot && state.lassoInitialBounds) {
      const b = state.lassoInitialBounds;
      const sx = Math.max(0.25, Math.min(4.0, (worldPt.x - b.minX) / Math.max(20, b.maxX - b.minX)));
      const sy = Math.max(0.25, Math.min(4.0, (worldPt.y - b.minY) / Math.max(20, b.maxY - b.minY)));
      scaleSelectedEntitiesFromSnapshot(b.minX, b.minY, sx, sy);
      if (state.selectedIds.shapes.size > 0) {
        updateConnectedShapesForPage(page, state.selectedIds.shapes);
      }
      invalidateStaticInkCache();
      computeSelectionBounds();
      renderWorldTextCards();
    }
  }

  function scaleSelectedEntitiesFromSnapshot(ox, oy, sx, sy) {
    const page = getActivePage();
    if (!page || !state.lassoInitialSnapshot) return;
    const ms = (sx + sy) / 2;
    page.strokes.forEach((s, idx) => {
      if (state.selectedIds.strokes.has(s.id)) {
        const orig = state.lassoInitialSnapshot.strokes[idx];
        if (orig) {
          s.size = Math.max(1, orig.size * ms);
          s.points = orig.points.map((p) => ({ ...p, x: ox + (p.x - ox) * sx, y: oy + (p.y - oy) * sy }));
          invalidateStrokeCache(s);
        }
      }
    });
    page.shapes.forEach((sh, idx) => {
      if (state.selectedIds.shapes.has(sh.id)) {
        const orig = state.lassoInitialSnapshot.shapes[idx];
        if (orig) {
          if (Array.isArray(orig.vertices)) {
            sh.vertices = orig.vertices.map((v) => ({ x: ox + (v.x - ox) * sx, y: oy + (v.y - oy) * sy }));
            const bb = getShapeBoundingBox(sh);
            sh.x1 = bb.minX; sh.y1 = bb.minY; sh.x2 = bb.maxX; sh.y2 = bb.maxY;
          } else {
            sh.x1 = ox + (orig.x1 - ox) * sx; sh.y1 = oy + (orig.y1 - oy) * sy;
            sh.x2 = ox + (orig.x2 - ox) * sx; sh.y2 = oy + (orig.y2 - oy) * sy;
          }
        }
      }
    });
    page.texts.forEach((tb, idx) => {
      if (state.selectedIds.texts.has(tb.id)) {
        const orig = state.lassoInitialSnapshot.texts[idx];
        if (orig) {
          tb.x = ox + (orig.x - ox) * sx; tb.y = oy + (orig.y - oy) * sy;
          tb.fontSize = Math.max(10, Math.round((orig.fontSize || 16) * ms));
        }
      }
    });
    (page.images || []).forEach((img, idx) => {
      if (state.selectedIds.images && state.selectedIds.images.has(img.id)) {
        const orig = state.lassoInitialSnapshot.images && state.lassoInitialSnapshot.images[idx];
        if (orig) {
          img.x = Math.round(ox + (orig.x - ox) * sx);
          img.y = Math.round(oy + (orig.y - oy) * sy);
          img.width = Math.max(40, Math.round((orig.width || 240) * sx));
          img.height = Math.max(32, Math.round((orig.height || 180) * sy));
        }
      }
    });
  }

  function handleLassoPointerUp() {
    const page = getActivePage();
    if (!page) return;
    if (state.lassoAction === 'draw') {
      if (state.lassoPolygon.length >= 3) {
        const filters = state.lassoFilters || { handwriting: true, shapes: true, texts: true, images: true };
        let lMinX = Infinity, lMinY = Infinity, lMaxX = -Infinity, lMaxY = -Infinity;
        for (let i = 0; i < state.lassoPolygon.length; i++) {
          const lp = state.lassoPolygon[i];
          if (lp.x < lMinX) lMinX = lp.x;
          if (lp.y < lMinY) lMinY = lp.y;
          if (lp.x > lMaxX) lMaxX = lp.x;
          if (lp.y > lMaxY) lMaxY = lp.y;
        }
        if (filters.handwriting !== false) {
          const candidateStrokes = typeof queryPageStrokesInRect === 'function'
            ? queryPageStrokesInRect(page, lMinX, lMinY, lMaxX, lMaxY, false)
            : (page.strokes || []);
          candidateStrokes.forEach((s) => {
            const inside = s.points.filter((p) => pointInPolygon(p.x, p.y, state.lassoPolygon)).length;
            if (inside > 0 && inside >= Math.min(2, s.points.length * 0.25)) state.selectedIds.strokes.add(s.id);
          });
        }
        if (filters.shapes !== false) {
          const candidateShapes = typeof queryPageShapesInRect === 'function'
            ? queryPageShapesInRect(page, lMinX, lMinY, lMaxX, lMaxY, false)
            : (page.shapes || []);
          candidateShapes.forEach((sh) => {
            const verts = getShapeVertices(sh);
            const samples = verts ? [...verts, { x: (sh.x1 + sh.x2) / 2, y: (sh.y1 + sh.y2) / 2 }] : [
              { x: (sh.x1 + sh.x2) / 2, y: (sh.y1 + sh.y2) / 2 },
              { x: sh.x1, y: sh.y1 },
              { x: sh.x2, y: sh.y2 }
            ];
            if (samples.some((pt) => pointInPolygon(pt.x, pt.y, state.lassoPolygon))) state.selectedIds.shapes.add(sh.id);
          });
        }
        if (filters.texts !== false) {
          (page.texts || []).forEach((tb) => {
            const tx = tb.x || 0, ty = tb.y || 0, tw = tb.width || 200;
            const samples = [
              { x: tx + tw * 0.5, y: ty + 20 },
              { x: tx + 24, y: ty + 15 },
              { x: tx + tw - 24, y: ty + 15 }
            ];
            if (samples.some((pt) => pointInPolygon(pt.x, pt.y, state.lassoPolygon))) state.selectedIds.texts.add(tb.id);
          });
        }
        if (filters.images !== false && state.selectedIds.images) {
          (page.images || []).forEach((img) => {
            const ix = img.x || 0, iy = img.y || 0, iw = img.width || 240, ih = img.height || 180;
            const samples = [
              { x: ix + iw * 0.5, y: iy + ih * 0.5 },
              { x: ix + iw * 0.25, y: iy + ih * 0.25 },
              { x: ix + iw * 0.75, y: iy + ih * 0.75 }
            ];
            if (samples.some((pt) => pointInPolygon(pt.x, pt.y, state.lassoPolygon))) state.selectedIds.images.add(img.id);
          });
        }
        // Sur une page PDF : si aucun élément vectoriel/image n'a été entouré, capture la zone PDF pour pouvoir la déplacer, copier ou enregistrer en Élément
        if (!hasAnyLassoSelection() && page.pdfId && page.pdfPageNumber && filters.images !== false) {
          const pdfClip = extractPdfRegionFromLassoPolygon(page, state.lassoPolygon);
          if (pdfClip) {
            state.lassoPdfClip = pdfClip;
          }
        }
      }
      state.lassoPolygon = [];
      invalidateStaticInkCache();
      computeSelectionBounds();
      updateLassoToolbarBadge();
      renderWorldTextCards();
    } else if (state.lassoAction === 'move' || state.lassoAction === 'scale') {
      scheduleSaveActivePage();
    }
    state.lassoAction = null;
    state.lassoInitialSnapshot = null;
    updateLassoFloatingBarPosition();
    if (typeof syncGnLassoSubBarUi === 'function') syncGnLassoSubBarUi();
  }

  function updateLassoToolbarBadge() {
    const total =
      state.selectedIds.strokes.size +
      state.selectedIds.shapes.size +
      state.selectedIds.texts.size +
      (state.selectedIds.images ? state.selectedIds.images.size : 0) +
      (state.lassoPdfClip ? 1 : 0);
    const has = total > 0;
    const isPdfZoneOnly = Boolean(state.lassoPdfClip) && total === 1;
    if (dom.lassoSelectionBadge) dom.lassoSelectionBadge.textContent = has ? (isPdfZoneOnly ? 'Zone PDF' : `${total} sélectionné${total > 1 ? 's' : ''}`) : 'Entourez des traits';
    if (dom.btnDuplicateSelection) dom.btnDuplicateSelection.disabled = !has;
    if (dom.btnScaleUpSelection) dom.btnScaleUpSelection.disabled = !has;
    if (dom.btnScaleDownSelection) dom.btnScaleDownSelection.disabled = !has;
    if (dom.btnDeleteSelection) dom.btnDeleteSelection.disabled = !has;
    if (state.tool === 'lasso' && dom.activeToolSummaryText) {
      dom.activeToolSummaryText.textContent = has ? (isPdfZoneOnly ? 'Zone PDF' : `${total} sél.`) : 'Options';
    }
    if (typeof syncGnLassoSubBarUi === 'function') syncGnLassoSubBarUi();
  }

  function copyLassoSelection() {
    const page = getActivePage();
    if (!page || !hasAnyLassoSelection()) return false;
    const selStrokes = (page.strokes || []).filter((s) => state.selectedIds.strokes.has(s.id));
    const selShapes = (page.shapes || []).filter((sh) => state.selectedIds.shapes.has(sh.id));
    const selTexts = (page.texts || []).filter((tb) => state.selectedIds.texts.has(tb.id));
    const selImages = (page.images || []).filter((img) => state.selectedIds.images && state.selectedIds.images.has(img.id));
    const rawImages = selImages.map((img) => ({
      x: img.x || 0,
      y: img.y || 0,
      width: img.width || 240,
      height: img.height || 180,
      src: img.src
    }));
    if (state.lassoPdfClip) {
      rawImages.push({
        x: state.lassoPdfClip.x || 0,
        y: state.lassoPdfClip.y || 0,
        width: state.lassoPdfClip.width || 200,
        height: state.lassoPdfClip.height || 140,
        src: state.lassoPdfClip.src
      });
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selStrokes.forEach((s) => (s.points || []).forEach((p) => {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }));
    selShapes.forEach((sh) => {
      const bb = getShapeBoundingBox(sh);
      minX = Math.min(minX, bb.minX); minY = Math.min(minY, bb.minY);
      maxX = Math.max(maxX, bb.maxX); maxY = Math.max(maxY, bb.maxY);
    });
    selTexts.forEach((tb) => {
      minX = Math.min(minX, tb.x || 0); minY = Math.min(minY, tb.y || 0);
      maxX = Math.max(maxX, (tb.x || 0) + (tb.width || 240));
      maxY = Math.max(maxY, (tb.y || 0) + 60);
    });
    rawImages.forEach((img) => {
      minX = Math.min(minX, img.x); minY = Math.min(minY, img.y);
      maxX = Math.max(maxX, img.x + img.width); maxY = Math.max(maxY, img.y + img.height);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return false;

    state.lassoClipboard = {
      sourcePageId: page.id,
      origX: minX,
      origY: minY,
      width: Math.max(16, Math.round(maxX - minX)),
      height: Math.max(16, Math.round(maxY - minY)),
      strokes: selStrokes.map((s) => {
        const c = JSON.parse(JSON.stringify(s));
        delete c.id;
        c.points = (c.points || []).map((p) => ({ ...p, x: p.x - minX, y: p.y - minY }));
        return c;
      }),
      shapes: selShapes.map((sh) => {
        const c = JSON.parse(JSON.stringify(sh));
        delete c.id; delete c.startConnection; delete c.endConnection;
        c.x1 -= minX; c.y1 -= minY; c.x2 -= minX; c.y2 -= minY;
        if (Array.isArray(c.points)) c.points = c.points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
        if (Array.isArray(c.vertices)) c.vertices = c.vertices.map((v) => ({ x: v.x - minX, y: v.y - minY }));
        return c;
      }),
      texts: selTexts.map((tb) => {
        const c = JSON.parse(JSON.stringify(tb));
        delete c.id;
        c.x = (c.x || 0) - minX; c.y = (c.y || 0) - minY;
        return c;
      }),
      images: rawImages.map((img) => ({
        x: img.x - minX,
        y: img.y - minY,
        width: img.width,
        height: img.height,
        src: img.src
      }))
    };
    showToast(state.lassoPdfClip ? 'Zone PDF copiée (Ctrl+V pour coller)' : 'Sélection copiée (Ctrl+V pour coller)');
    return true;
  }

  function pasteLassoSelection() {
    const page = getActivePage();
    const clip = state.lassoClipboard;
    if (!page || !clip) return false;
    let ox = clip.origX + 28;
    let oy = clip.origY + 28;
    if (clip.sourcePageId !== page.id) {
      let cx = 300, cy = 260;
      if (dom.canvasViewport && typeof dom.canvasViewport.getBoundingClientRect === 'function') {
        const rect = dom.canvasViewport.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          const center = screenToWorld(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
          cx = center.x; cy = center.y;
        }
      }
      ox = cx - (clip.width || 120) * 0.5;
      oy = cy - (clip.height || 90) * 0.5;
    }
    if (isBoundedPage(page)) {
      const pb = getPageBounds(page);
      ox = Math.max(12, Math.min(Math.max(12, pb.maxX - (clip.width || 60) - 12), ox));
      oy = Math.max(12, Math.min(Math.max(12, pb.maxY - (clip.height || 60) - 12), oy));
    }
    pushHistorySnapshot(page);
    if (!Array.isArray(page.strokes)) page.strokes = [];
    if (!Array.isArray(page.shapes)) page.shapes = [];
    if (!Array.isArray(page.texts)) page.texts = [];
    if (!Array.isArray(page.images)) page.images = [];
    clearLassoSelection();

    (clip.strokes || []).forEach((s) => {
      const ns = JSON.parse(JSON.stringify(s));
      ns.id = createUid('st');
      ns.points = (ns.points || []).map((p) => ({ ...p, x: p.x + ox, y: p.y + oy }));
      invalidateStrokeCache(ns);
      page.strokes.push(ns);
      state.selectedIds.strokes.add(ns.id);
    });
    (clip.shapes || []).forEach((sh) => {
      const nsh = JSON.parse(JSON.stringify(sh));
      nsh.id = createUid('sh');
      nsh.x1 += ox; nsh.y1 += oy; nsh.x2 += ox; nsh.y2 += oy;
      if (Array.isArray(nsh.points)) nsh.points = nsh.points.map((p) => ({ x: p.x + ox, y: p.y + oy }));
      if (Array.isArray(nsh.vertices)) nsh.vertices = nsh.vertices.map((v) => ({ x: v.x + ox, y: v.y + oy }));
      page.shapes.push(nsh);
      state.selectedIds.shapes.add(nsh.id);
    });
    (clip.texts || []).forEach((tb) => {
      const ntb = JSON.parse(JSON.stringify(tb));
      ntb.id = createUid('tx');
      ntb.x = (ntb.x || 0) + ox; ntb.y = (ntb.y || 0) + oy;
      page.texts.push(ntb);
      state.selectedIds.texts.add(ntb.id);
    });
    (clip.images || []).forEach((img) => {
      const nimg = {
        id: createUid('img'),
        x: Math.round((img.x || 0) + ox),
        y: Math.round((img.y || 0) + oy),
        width: Math.max(16, Math.round(img.width || 200)),
        height: Math.max(16, Math.round(img.height || 140)),
        src: img.src
      };
      page.images.push(nimg);
      if (state.selectedIds.images) state.selectedIds.images.add(nimg.id);
    });
    invalidateStaticInkCache();
    computeSelectionBounds();
    updateLassoToolbarBadge();
    updateLassoFloatingBarPosition();
    renderWorldTextCards();
    requestRender();
    scheduleSaveActivePage(page);
    showToast('Sélection collée');
    return true;
  }

  function duplicateLassoSelection() {
    const page = getActivePage();
    if (!page || !hasAnyLassoSelection()) return;
    pushHistorySnapshot();
    const ns = new Set(), nsh = new Set(), nt = new Set(), ni = new Set(), off = 28;
    if (!Array.isArray(page.images)) page.images = [];
    if (state.lassoPdfClip) {
      const clip = state.lassoPdfClip;
      const c = {
        id: createUid('img'),
        x: Math.round((clip.x || 0) + off),
        y: Math.round((clip.y || 0) + off),
        width: Math.max(16, Math.round(clip.width || 200)),
        height: Math.max(16, Math.round(clip.height || 140)),
        src: clip.src
      };
      page.images.push(c);
      ni.add(c.id);
      state.lassoPdfClip = null;
    }
    page.strokes.forEach((s) => {
      if (state.selectedIds.strokes.has(s.id)) {
        const c = { ...cloneStrokeFast(s), id: createUid('st'), points: s.points.map((p) => ({ ...p, x: p.x + off, y: p.y + off })), _bounds: null };
        invalidateStrokeCache(c);
        page.strokes.push(c); ns.add(c.id);
      }
    });
    page.shapes.forEach((sh) => {
      if (state.selectedIds.shapes.has(sh.id)) {
        const c = { ...JSON.parse(JSON.stringify(sh)), id: createUid('sh'), x1: sh.x1 + off, y1: sh.y1 + off, x2: sh.x2 + off, y2: sh.y2 + off };
        if (Array.isArray(c.vertices)) c.vertices = c.vertices.map((v) => ({ x: v.x + off, y: v.y + off }));
        page.shapes.push(c); nsh.add(c.id);
      }
    });
    page.texts.forEach((tb) => {
      if (state.selectedIds.texts.has(tb.id)) {
        const c = { ...tb, id: createUid('tx'), x: tb.x + off, y: tb.y + off, frameStyle: tb.frameStyle ? { ...tb.frameStyle } : undefined };
        page.texts.push(c); nt.add(c.id);
      }
    });
    (page.images || []).forEach((img) => {
      if (state.selectedIds.images && state.selectedIds.images.has(img.id)) {
        const c = { ...img, id: createUid('img'), x: (img.x || 0) + off, y: (img.y || 0) + off };
        page.images.push(c); ni.add(c.id);
      }
    });
    state.selectedIds.strokes = ns; state.selectedIds.shapes = nsh; state.selectedIds.texts = nt;
    if (state.selectedIds.images) state.selectedIds.images = ni;
    invalidateStaticInkCache();
    computeSelectionBounds();
    updateLassoToolbarBadge();
    updateLassoFloatingBarPosition();
    renderWorldTextCards();
    requestRender();
    scheduleSaveActivePage();
    showToast('Sélection dupliquée');
  }

  function scaleLassoSelectionByFactor(factor) {
    const page = getActivePage();
    if (!page || !hasAnyLassoSelection() || !state.selectionBounds) return;
    pushHistorySnapshot();
    materializePdfLassoClipIfNeeded(page);
    const cx = (state.selectionBounds.minX + state.selectionBounds.maxX) / 2;
    const cy = (state.selectionBounds.minY + state.selectionBounds.maxY) / 2;
    state.lassoInitialSnapshot = clonePageContent(page);
    scaleSelectedEntitiesFromSnapshot(cx, cy, factor, factor);
    state.lassoInitialSnapshot = null;
    invalidateStaticInkCache();
    computeSelectionBounds();
    renderWorldTextCards();
    requestRender();
    scheduleSaveActivePage();
  }

  function deleteLassoSelection() {
    const page = getActivePage();
    if (!page || !hasAnyLassoSelection()) return;
    const onlyPdfClip = Boolean(state.lassoPdfClip) &&
      state.selectedIds.strokes.size === 0 &&
      state.selectedIds.shapes.size === 0 &&
      state.selectedIds.texts.size === 0 &&
      (!state.selectedIds.images || state.selectedIds.images.size === 0);
    if (onlyPdfClip) {
      clearLassoSelection();
      requestRender();
      return;
    }
    pushHistorySnapshot();
    page.strokes = (page.strokes || []).filter((s) => !state.selectedIds.strokes.has(s.id));
    page.shapes = (page.shapes || []).filter((sh) => !state.selectedIds.shapes.has(sh.id));
    page.texts = (page.texts || []).filter((tb) => !state.selectedIds.texts.has(tb.id));
    if (state.selectedIds.images && state.selectedIds.images.size > 0) {
      page.images = (page.images || []).filter((img) => !state.selectedIds.images.has(img.id));
    }
    invalidateStaticInkCache();
    clearLassoSelection();
    renderWorldTextCards();
    requestRender();
    scheduleSaveActivePage();
  }

  function recolorLassoSelection(newColor) {
    const page = getActivePage();
    if (!page || !hasAnyLassoSelection()) return;
    pushHistorySnapshot();
    page.strokes.forEach((s) => { if (state.selectedIds.strokes.has(s.id)) { s.color = newColor; invalidateStrokeCache(s); } });
    page.shapes.forEach((sh) => { if (state.selectedIds.shapes.has(sh.id)) sh.color = newColor; });
    page.texts.forEach((tb) => { if (state.selectedIds.texts.has(tb.id)) tb.color = newColor; });
    invalidateStaticInkCache();
    renderWorldTextCards();
    requestRender();
    scheduleSaveActivePage();
  }

  // Alignement gauche / centre / droite des lignes manuscrites sélectionnées (GoodNotes align_handwriting)
  function alignLassoHandwriting(alignment = 'left') {
    const page = getActivePage();
    if (!page || state.selectedIds.strokes.size === 0) {
      showToast('Sélectionnez de l\'écriture manuscrite pour l\'aligner');
      return false;
    }
    const selStrokes = (page.strokes || []).filter((s) => state.selectedIds.strokes.has(s.id) && s.points && s.points.length > 0);
    if (selStrokes.length === 0) return false;

    const items = selStrokes.map((s) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      return { s, minX, maxX, minY, maxY, cy: (minY + maxY) * 0.5, h: Math.max(8, maxY - minY) };
    }).sort((a, b) => a.cy - b.cy);

    // Regroupement en lignes horizontales par chevauchement vertical
    const lines = [];
    for (const it of items) {
      let placed = false;
      for (const ln of lines) {
        const tol = Math.max(20, (ln.avgH + it.h) * 0.65);
        if (Math.abs(it.cy - ln.cy) <= tol) {
          ln.items.push(it);
          ln.minX = Math.min(ln.minX, it.minX);
          ln.maxX = Math.max(ln.maxX, it.maxX);
          ln.cy = ln.items.reduce((acc, x) => acc + x.cy, 0) / ln.items.length;
          ln.avgH = ln.items.reduce((acc, x) => acc + x.h, 0) / ln.items.length;
          placed = true;
          break;
        }
      }
      if (!placed) {
        lines.push({ items: [it], minX: it.minX, maxX: it.maxX, cy: it.cy, avgH: it.h });
      }
    }

    const globalMinX = Math.min(...lines.map((l) => l.minX));
    const globalMaxX = Math.max(...lines.map((l) => l.maxX));
    const globalCenterX = (globalMinX + globalMaxX) * 0.5;

    pushHistorySnapshot(page);
    for (const ln of lines) {
      let dx = 0;
      if (alignment === 'left') dx = globalMinX - ln.minX;
      else if (alignment === 'right') dx = globalMaxX - ln.maxX;
      else if (alignment === 'center') dx = globalCenterX - (ln.minX + ln.maxX) * 0.5;
      if (Math.abs(dx) < 0.25) continue;
      for (const it of ln.items) {
        it.s.points = it.s.points.map((p) => ({ ...p, x: p.x + dx }));
        invalidateStrokeCache(it.s);
      }
    }

    invalidateStaticInkCache();
    computeSelectionBounds();
    updateLassoFloatingBarPosition();
    requestRender();
    scheduleSaveActivePage(page);
    const lbl = alignment === 'center' ? 'centrée' : (alignment === 'right' ? 'alignée à droite' : 'alignée à gauche');
    showToast(`Écriture ${lbl}`);
    return true;
  }

  // Redressement automatique de la pente d'une ligne manuscrite (GoodNotes straighten_line)
  function straightenLassoSelection() {
    const page = getActivePage();
    if (!page || state.selectedIds.strokes.size === 0) {
      showToast('Sélectionnez une ligne manuscrite à redresser');
      return false;
    }
    const selStrokes = (page.strokes || []).filter((s) => state.selectedIds.strokes.has(s.id) && s.points && s.points.length > 0);
    if (selStrokes.length === 0) return false;

    // Régression linéaire pondérée sur les centres des points pour estimer l'angle de la ligne
    let sumX = 0, sumY = 0, count = 0;
    for (const s of selStrokes) {
      for (const p of s.points) { sumX += p.x; sumY += p.y; count++; }
    }
    if (count < 2) return false;
    const mx = sumX / count, my = sumY / count;
    let sxx = 0, sxy = 0;
    for (const s of selStrokes) {
      for (const p of s.points) {
        const dx = p.x - mx, dy = p.y - my;
        sxx += dx * dx;
        sxy += dx * dy;
      }
    }
    if (sxx < 10) return false;
    const angle = Math.atan2(sxy, sxx);
    // Borne raisonnable (±35°) pour ne jamais retourner une colonne verticale
    const clampedAngle = Math.max(-0.62, Math.min(0.62, angle));
    if (Math.abs(clampedAngle) < 0.008) {
      showToast('La ligne est déjà droite');
      return true;
    }

    pushHistorySnapshot(page);
    const cosA = Math.cos(-clampedAngle);
    const sinA = Math.sin(-clampedAngle);
    for (const s of selStrokes) {
      s.points = s.points.map((p) => {
        const dx = p.x - mx;
        const dy = p.y - my;
        return {
          ...p,
          x: mx + dx * cosA - dy * sinA,
          y: my + dx * sinA + dy * cosA
        };
      });
      invalidateStrokeCache(s);
    }

    invalidateStaticInkCache();
    computeSelectionBounds();
    updateLassoFloatingBarPosition();
    requestRender();
    scheduleSaveActivePage(page);
    showToast('Ligne redressée');
    return true;
  }

  // Capture d'écran haute définition (2x) de la zone sélectionnée au Lasso (GoodNotes take_screenshot)
  async function captureLassoSelectionScreenshot() {
    const page = getActivePage();
    if (!page || !state.selectionBounds || !hasAnyLassoSelection()) {
      showToast('Sélectionnez d\'abord une zone au Lasso');
      return false;
    }
    const b = state.selectionBounds;
    const pad = 12;
    const w = Math.max(24, Math.round((b.maxX - b.minX) + pad * 2));
    const h = Math.max(24, Math.round((b.maxY - b.minY) + pad * 2));
    const scale = 2;
    const cap = document.createElement('canvas');
    cap.width = Math.min(4096, Math.round(w * scale));
    cap.height = Math.min(4096, Math.round(h * scale));
    const cCtx = cap.getContext('2d');
    if (!cCtx) return false;

    const effScaleX = cap.width / w;
    const effScaleY = cap.height / h;
    cCtx.save();
    cCtx.scale(effScaleX, effScaleY);
    cCtx.translate(-(b.minX - pad), -(b.minY - pad));

    const pw = (page && page.pdfWidth) ? page.pdfWidth : PAGE_WIDTH;
    const ph = (page && page.pdfHeight) ? page.pdfHeight : PAGE_HEIGHT;
    drawPaperBackground(cCtx, page, pw, ph, true);
    if (page.pdfId) drawLockedPdfBackground(cCtx, page, false);

    const isDark = !page.pdfId && (page.paperTone === 'dark' || page.paperTone === 'blueprint');
    (page.images || []).forEach((imgItem) => {
      const imgEl = getCachedThumbnailImage(imgItem);
      if (imgEl && typeof cCtx.drawImage === 'function') {
        try { cCtx.drawImage(imgEl, imgItem.x || 0, imgItem.y || 0, imgItem.width || 240, imgItem.height || 180); } catch (_) {}
      }
    });
    (page.strokes || []).forEach((s) => { if (s.tool === 'highlighter') drawSingleStroke(cCtx, s, isDark, false); });
    (page.shapes || []).forEach((sh) => drawGeometricShape(cCtx, sh, false, isDark));
    (page.strokes || []).forEach((s) => { if (s.tool !== 'highlighter') drawSingleStroke(cCtx, s, isDark, false); });
    (page.tapes || []).forEach((tp) => { if (!tp.revealed) drawTapeItem(cCtx, tp, false); });
    drawTextBlocksOnCanvas(cCtx, page.texts);
    cCtx.restore();

    let copied = false;
    try {
      const blob = await new Promise((resolve) => (typeof cap.toBlob === 'function' ? cap.toBlob(resolve, 'image/png') : resolve(null)));
      if (blob && navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem === 'function') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copied = true;
      }
    } catch (_) {
      copied = false;
    }

    if (!copied) {
      try {
        const dataUrl = cap.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `capture-inkflow-${Date.now()}.png`;
        a.click();
        showToast('Capture PNG téléchargée');
      } catch (_) {
        showToast('Capture générée');
      }
    } else {
      showToast('Capture copiée dans le presse-papiers');
    }
    releaseCanvasMemory(cap);
    return true;
  }

  // ============================================================================
  // 14. MODALES LATEX & RECONNAISSANCE MANUSCRITE (TEXTE + ÉQUATIONS)
  // ============================================================================

  function openLatexModalForCard(existingCard = null, worldPos = null) {
    state.editingLatexCardId = existingCard ? existingCard.id : null;
    state.pendingLatexWorldPos = worldPos;
    const defaultLatex = existingCard ? existingCard.text : '\\int_{0}^{+\\infty} e^{-x^{2}} dx = \\frac{\\sqrt{\\pi}}{2}';
    dom.inputLatexCode.value = defaultLatex;
    dom.latexLivePreview.innerHTML = renderLatexToHtml(defaultLatex, true);
    dom.modalLatexEditor.classList.remove('hidden');
    setTimeout(() => dom.inputLatexCode.focus(), 20);
  }

  function closeLatexModal() {
    dom.modalLatexEditor.classList.add('hidden');
    state.editingLatexCardId = null;
    state.pendingLatexWorldPos = null;
  }

  function openRecognitionModal() {
    const page = getActivePage();
    if (!page) return;

    let targetStrokes = [];
    if (state.selectedIds.strokes.size > 0) {
      targetStrokes = (page.strokes || []).filter((s) => state.selectedIds.strokes.has(s.id) && s.tool !== 'highlighter');
    } else {
      targetStrokes = (page.strokes || []).filter((s) => s.tool !== 'highlighter');
    }

    state.lastRecognizedStrokes = targetStrokes;
    const result = recognizeHandwritingAndMath(targetStrokes);

    // Dessine l'aperçu des traits analysés dans #recogSnapshotCanvas
    const snapCtx = dom.recogSnapshotCanvas.getContext('2d');
    const sw = dom.recogSnapshotCanvas.width;
    const sh = dom.recogSnapshotCanvas.height;
    snapCtx.clearRect(0, 0, sw, sh);
    if (targetStrokes.length > 0) {
      const b = result.bounds;
      const pad = 12;
      const sc = Math.min((sw - pad * 2) / Math.max(20, b.width), (sh - pad * 2) / Math.max(20, b.height));
      snapCtx.save();
      snapCtx.translate((sw - b.width * sc) / 2 - b.minX * sc, (sh - b.height * sc) / 2 - b.minY * sc);
      snapCtx.scale(sc, sc);
      targetStrokes.forEach((s) => drawSingleStroke(snapCtx, s, false, false));
      snapCtx.restore();
    }

    dom.inputRecognizedText.value = result.text;
    dom.inputRecognizedLatex.value = result.latex;
    dom.recogLatexPreview.innerHTML = renderLatexToHtml(result.latex, true);
    dom.modalRecognition.classList.remove('hidden');
  }

  function closeRecognitionModal() {
    dom.modalRecognition.classList.add('hidden');
  }

  // ============================================================================
  // 14B. IMPORTATION PDF (PDF.JS) & EXPORTATION VECTORIELLE ANNOTÉE (PDF-LIB)
  // ============================================================================

  function parseHexToPdfRgb(hex) {
    if (typeof window === 'undefined' || !window.PDFLib || !window.PDFLib.rgb) return null;
    const clean = String(hex || '#1e293b').replace('#', '').trim();
    const full = clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean.padEnd(6, '0').slice(0, 6);
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return window.PDFLib.rgb(0.12, 0.16, 0.23);
    return window.PDFLib.rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
  }

  function latexToPdfReadableString(str) {
    if (!str) return '';
    let s = String(str)
      .replace(/\$\$/g, '')
      .replace(/\$/g, '')
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
      .replace(/\\int_\{([^{}]+)\}\^\{([^{}]+)\}/g, 'Integral[$1 -> $2] ')
      .replace(/\\sum_\{([^{}]+)\}\^\{([^{}]+)\}/g, 'Sum[$1 .. $2] ')
      .replace(/\\infty/g, 'inf')
      .replace(/\\pi/g, 'pi')
      .replace(/\\alpha/g, 'alpha')
      .replace(/\\beta/g, 'beta')
      .replace(/\\gamma/g, 'gamma')
      .replace(/\\delta/g, 'delta')
      .replace(/\\Delta/g, 'Delta')
      .replace(/\\theta/g, 'theta')
      .replace(/\\lambda/g, 'lambda')
      .replace(/\\sigma/g, 'sigma')
      .replace(/\\omega/g, 'omega')
      .replace(/\\pm/g, '+/-')
      .replace(/\\times/g, 'x')
      .replace(/\\cdot/g, '*')
      .replace(/\\leq/g, '<=')
      .replace(/\\geq/g, '>=')
      .replace(/\\neq/g, '!=')
      .replace(/\\approx/g, '~=')
      .replace(/\\rightarrow/g, '->')
      .replace(/\\Rightarrow/g, '=>')
      .replace(/\^\{([^{}]+)\}/g, '^($1)')
      .replace(/_\{([^{}]+)\}/g, '_($1)')
      .replace(/[{}]/g, '');
    // Filtre les caractères hors WinAnsi (ISO-8859-1) pour éviter toute erreur d'encodage StandardFonts dans pdf-lib
    let safe = '';
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (code === 10 || code === 13 || (code >= 32 && code <= 255)) {
        safe += s[i];
      } else if (s[i] === '—' || s[i] === '–') {
        safe += '-';
      } else if (s[i] === '•' || s[i] === '·') {
        safe += '*';
      } else if (s[i] === '’' || s[i] === '‘') {
        safe += "'";
      } else if (s[i] === '“' || s[i] === '”') {
        safe += '"';
      } else if (s[i] === '…') {
        safe += '...';
      } else if (s[i] === '²') {
        safe += '^2';
      }
    }
    return safe;
  }

  async function generateSampleCoursePdfBytes() {
    if (typeof window === 'undefined' || !window.PDFLib) {
      throw new Error('La bibliothèque locale pdf-lib est introuvable.');
    }
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Page 1 : Cours de Mathématiques & Analyse
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawRectangle({ x: 36, y: 748, width: 523, height: 58, color: rgb(0.93, 0.96, 1.0), borderColor: rgb(0.15, 0.39, 0.92), borderWidth: 1.5 });
    p1.drawText('COURS : EQUATIONS DIFFERENTIELLES & ANALYSE (PDF LOCAL)', { x: 52, y: 780, size: 14, font: fontBold, color: rgb(0.11, 0.23, 0.54) });
    p1.drawText('Support de cours haute definition — Annotez directement au stylet par-dessus ce calque verrouille', { x: 52, y: 760, size: 9.5, font: fontReg, color: rgb(0.28, 0.33, 0.41) });

    p1.drawText('1. Theoreme fondamental (Ordre 1)', { x: 44, y: 712, size: 13, font: fontBold, color: rgb(0.06, 0.09, 0.16) });
    p1.drawText("Soit l'equation differentielle lineaire homogene : y'(x) + a(x) y(x) = 0.", { x: 44, y: 690, size: 11, font: fontReg, color: rgb(0.12, 0.16, 0.23) });
    p1.drawText('Si A(x) est une primitive de a(x) sur un intervalle I, alors la solution generale est :', { x: 44, y: 672, size: 11, font: fontReg, color: rgb(0.12, 0.16, 0.23) });

    p1.drawRectangle({ x: 80, y: 618, width: 435, height: 38, color: rgb(0.98, 0.98, 1.0), borderColor: rgb(0.49, 0.23, 0.93), borderWidth: 1.2 });
    p1.drawText('y(x) = C * exp( -A(x) )   avec C appartenant a R', { x: 145, y: 632, size: 13, font: fontBold, color: rgb(0.30, 0.11, 0.58) });

    p1.drawText('2. Exercice d application (Annotez votre demonstration ci-dessous) :', { x: 44, y: 580, size: 12.5, font: fontBold, color: rgb(0.06, 0.09, 0.16) });
    p1.drawText("Resoudre sur R l'equation : y' - 2x y = 0 avec la condition initiale y(0) = 3.", { x: 44, y: 558, size: 11, font: fontReg, color: rgb(0.12, 0.16, 0.23) });

    // Zone quadrillée d'exercice dans le PDF
    p1.drawRectangle({ x: 44, y: 120, width: 507, height: 416, color: rgb(1, 1, 1), borderColor: rgb(0.79, 0.84, 0.88), borderWidth: 1 });
    for (let y = 146; y < 530; y += 26) {
      p1.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 0.4, color: rgb(0.88, 0.91, 0.94) });
    }
    p1.drawText('Zone de resolution manuscrite (Page 1/2)', { x: 56, y: 516, size: 9.5, font: fontReg, color: rgb(0.58, 0.64, 0.72) });

    // Page 2 : Oscillateur Harmonique & Intégrales de Gauss
    const p2 = pdfDoc.addPage([595.28, 841.89]);
    p2.drawRectangle({ x: 36, y: 748, width: 523, height: 58, color: rgb(0.94, 0.99, 0.96), borderColor: rgb(0.08, 0.50, 0.24), borderWidth: 1.5 });
    p2.drawText('CHAPITRE 2 : OSCILLATEUR HARMONIQUE & INTEGRALE DE GAUSS', { x: 52, y: 780, size: 13.5, font: fontBold, color: rgb(0.06, 0.38, 0.18) });
    p2.drawText('Page 2 du PDF — Surlignez les formules cles ou entourez-les au Lasso', { x: 52, y: 760, size: 9.5, font: fontReg, color: rgb(0.28, 0.33, 0.41) });

    p2.drawText('Equation du mouvement libre non amorti :', { x: 44, y: 710, size: 12.5, font: fontBold, color: rgb(0.06, 0.09, 0.16) });
    p2.drawText('x\'\'(t) + omega_0^2 * x(t) = 0   =>   x(t) = X_m * cos(omega_0 * t + phi)', { x: 64, y: 684, size: 12, font: fontBold, color: rgb(0.11, 0.23, 0.54) });

    p2.drawRectangle({ x: 44, y: 120, width: 507, height: 530, color: rgb(1, 1, 1), borderColor: rgb(0.79, 0.84, 0.88), borderWidth: 1 });
    for (let y = 146; y < 645; y += 26) {
      p2.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 0.4, color: rgb(0.88, 0.91, 0.94) });
    }
    p2.drawText('Notes et schemas complementaires (Page 2/2)', { x: 56, y: 630, size: 9.5, font: fontReg, color: rgb(0.58, 0.64, 0.72) });

    return await pdfDoc.save();
  }

  const MAX_PDF_IMPORT_PAGES = 100;

  function showPdfImportError(msg) {
    const cleanMsg = String(msg || 'Erreur lors de la lecture du fichier PDF.');
    if (dom.pdfImportErrorBanner) {
      dom.pdfImportErrorBanner.textContent = `⚠️ ${cleanMsg}`;
      dom.pdfImportErrorBanner.classList.remove('hidden');
    }
    if (dom.modalImportPdf && dom.modalImportPdf.classList.contains('hidden')) {
      dom.modalImportPdf.classList.remove('hidden');
    }
    updatePdfImportProgressUI(false, '', 0);
    showToast(cleanMsg, 'error', 'pdf-import-error');
  }

  function clearPdfImportError() {
    if (dom.pdfImportErrorBanner) {
      dom.pdfImportErrorBanner.textContent = '';
      dom.pdfImportErrorBanner.classList.add('hidden');
    }
  }

  async function validateAndOpenPdfDocument(arrayBuffer, fileName = 'Document.pdf') {
    if (!arrayBuffer) {
      throw new Error(`Le fichier PDF « ${fileName} » est vide ou introuvable.`);
    }
    const bytes = arrayBuffer instanceof Uint8Array
      ? new Uint8Array(arrayBuffer).slice()
      : new Uint8Array(arrayBuffer).slice();

    if (!bytes || bytes.byteLength === 0) {
      throw new Error(`Le fichier PDF « ${fileName} » est vide (0 octet).`);
    }
    if (bytes.byteLength < 8) {
      throw new Error(`Le fichier PDF « ${fileName} » est corrompu ou tronqué (${bytes.byteLength} octets).`);
    }

    // Vérification de la signature %PDF- dans les 1024 premiers octets
    const headLen = Math.min(1024, bytes.byteLength);
    let headAscii = '';
    for (let i = 0; i < headLen; i++) {
      headAscii += String.fromCharCode(bytes[i]);
    }
    if (!headAscii.includes('%PDF-')) {
      throw new Error(`Le fichier « ${fileName} » n'est pas un document PDF valide (en-tête %PDF- manquant ou fichier corrompu).`);
    }

    if (typeof window === 'undefined' || !window.pdfjsLib) {
      throw new Error('Le moteur PDF.js (pdfjs-dist) local est introuvable.');
    }
    configurePdfJsWorkerLocally();

    let loadingTask = null;
    let pdfDoc = null;
    try {
      loadingTask = window.pdfjsLib.getDocument({
        data: bytes.slice(),
        isEvalSupported: false,
        enableXfa: false,
        useSystemFonts: true,
        disableFontFace: false
      });
      pdfDoc = await loadingTask.promise;
    } catch (err) {
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        try { await loadingTask.destroy(); } catch (_) {}
      }
      const detail = err && err.message ? String(err.message) : '';
      if (/password/i.test(detail)) {
        throw new Error(`Le fichier PDF « ${fileName} » est protégé par un mot de passe.`);
      }
      throw new Error(`Le fichier PDF « ${fileName} » est corrompu ou illisible.`);
    }

    const numPages = Number(pdfDoc && pdfDoc.numPages) || 0;
    if (numPages <= 0) {
      if (pdfDoc && typeof pdfDoc.destroy === 'function') {
        try { await pdfDoc.destroy(); } catch (_) {}
      }
      throw new Error(`Le document PDF « ${fileName} » ne contient aucune page (0 page).`);
    }

    const maxImportPages = typeof getPdfMaxImportPages === 'function' ? getPdfMaxImportPages() : MAX_PDF_IMPORT_PAGES;
    if (maxImportPages > 0 && numPages > maxImportPages) {
      if (pdfDoc && typeof pdfDoc.destroy === 'function') {
        try { await pdfDoc.destroy(); } catch (_) {}
      }
      throw new Error(`Ce PDF contient ${numPages} pages. La limite maximale est fixée à ${maxImportPages} pages par import pour garantir la fluidité et préserver la mémoire RAM.`);
    }

    // Vérifie que la première page est décodable (détecte les arbres de pages PDF corrompus)
    try {
      const firstPage = await pdfDoc.getPage(1);
      const vp = firstPage.getViewport({ scale: 1 });
      if (!vp || !(vp.width > 0) || !(vp.height > 0)) {
        throw new Error('Dimensions de page PDF invalides.');
      }
      if (typeof firstPage.cleanup === 'function') {
        try { firstPage.cleanup(); } catch (_) {}
      }
    } catch (_) {
      if (pdfDoc && typeof pdfDoc.destroy === 'function') {
        try { await pdfDoc.destroy(); } catch (_) {}
      }
      throw new Error(`Le fichier PDF « ${fileName} » est corrompu (impossible de décoder la première page).`);
    }

    return { pdfDoc, bytes, numPages };
  }

  function updatePdfImportProgressUI(visible, text = '', percent = 0) {
    if (!dom.pdfImportProgressWrap) return;
    dom.pdfImportProgressWrap.classList.toggle('hidden', !visible);
    if (dom.pdfImportProgressText && text) dom.pdfImportProgressText.textContent = text;
    if (dom.pdfImportProgressPercent) dom.pdfImportProgressPercent.textContent = `${Math.round(percent)}%`;
    if (dom.pdfImportProgressFill) dom.pdfImportProgressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  function openImportPdfModal() {
    if (!dom.modalImportPdf) {
      if (dom.inputImportPdf) dom.inputImportPdf.click();
      return;
    }
    clearPdfImportError();
    updatePdfImportProgressUI(false, '', 0);
    if (!state.pendingPdfImport) {
      if (dom.importPdfFileName) dom.importPdfFileName.textContent = 'Glisser un fichier PDF ici';
      if (dom.importPdfPageCount) dom.importPdfPageCount.textContent = 'ou sélectionnez un document local';
      if (dom.pdfModalDropzone) dom.pdfModalDropzone.classList.remove('has-file');
      if (dom.btnConfirmPdfAppendNotebook) dom.btnConfirmPdfAppendNotebook.disabled = true;
      if (dom.btnConfirmPdfNewNotebook) dom.btnConfirmPdfNewNotebook.disabled = true;
    }
    dom.modalImportPdf.classList.remove('hidden');
  }

  function closeImportPdfModal() {
    if (dom.modalImportPdf) dom.modalImportPdf.classList.add('hidden');
    if (dom.pdfModalDropzone) dom.pdfModalDropzone.classList.remove('has-file');
    updatePdfImportProgressUI(false, '', 0);
    clearPdfImportError();
    state.pendingPdfImport = null;
  }

  async function stagePdfBufferForImport(arrayBuffer, fileName = 'Document.pdf') {
    clearPdfImportError();
    try {
      const { pdfDoc, bytes, numPages } = await validateAndOpenPdfDocument(arrayBuffer, fileName);
      if (pdfDoc && typeof pdfDoc.destroy === 'function') {
        try { await pdfDoc.destroy(); } catch (_) {}
      }
      state.pendingPdfImport = {
        bytes,
        fileName: fileName || 'Document.pdf',
        numPages
      };
      if (dom.importPdfFileName) dom.importPdfFileName.textContent = `${fileName}`;
      if (dom.importPdfPageCount) {
        const sizeKb = Math.max(1, Math.round(bytes.byteLength / 1024));
        dom.importPdfPageCount.textContent = `${numPages} page${numPages > 1 ? 's' : ''} · ${sizeKb} Ko`;
      }
      if (dom.pdfModalDropzone) dom.pdfModalDropzone.classList.add('has-file');
      if (dom.btnConfirmPdfAppendNotebook) dom.btnConfirmPdfAppendNotebook.disabled = false;
      if (dom.btnConfirmPdfNewNotebook) dom.btnConfirmPdfNewNotebook.disabled = false;
      return state.pendingPdfImport;
    } catch (err) {
      state.pendingPdfImport = null;
      if (dom.pdfModalDropzone) dom.pdfModalDropzone.classList.remove('has-file');
      showPdfImportError(err && err.message ? err.message : 'Fichier PDF invalide ou corrompu.');
      throw err;
    }
  }

  function generateLazyPdfPlaceholderThumbnail(pageNum = 1, totalPages = 1, title = 'PDF') {
    const safeTitle = String(title || 'PDF').slice(0, 18).replace(/[<>&"']/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="203" viewBox="0 0 144 203">` +
      `<rect width="144" height="203" fill="#ffffff"/>` +
      `<rect x="10" y="10" width="124" height="183" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>` +
      `<rect x="20" y="24" width="68" height="7" rx="3" fill="#2563eb" opacity="0.22"/>` +
      `<rect x="20" y="40" width="104" height="4" rx="2" fill="#94a3b8" opacity="0.35"/>` +
      `<rect x="20" y="50" width="92" height="4" rx="2" fill="#94a3b8" opacity="0.3"/>` +
      `<rect x="20" y="60" width="98" height="4" rx="2" fill="#94a3b8" opacity="0.25"/>` +
      `<text x="72" y="114" font-family="sans-serif" font-size="14" font-weight="700" fill="#1e293b" text-anchor="middle">Page ${pageNum} / ${totalPages}</text>` +
      `<text x="72" y="134" font-family="sans-serif" font-size="9" fill="#64748b" text-anchor="middle">${safeTitle}</text>` +
      `</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  async function importPdfFromBuffer(arrayBuffer, fileName = 'Cours.pdf', mode = 'new-notebook') {
    clearPdfImportError();
    updatePdfImportProgressUI(true, 'Validation et lecture du document PDF...', 8);

    let validated = null;
    try {
      validated = await validateAndOpenPdfDocument(arrayBuffer, fileName);
    } catch (err) {
      showPdfImportError(err && err.message ? err.message : 'Impossible d\'importer ce fichier PDF.');
      throw err;
    }

    const { pdfDoc, bytes: storedBytes, numPages } = validated;
    const pdfId = createUid('pdf');
    const cleanName = String(fileName || 'Cours.pdf').replace(/\.pdf$/i, '').trim() || 'Document PDF';

    // Finalise tout trait en cours et vide les caches de rendus PDF précédents avant l'import
    finalizeActiveDrawingOnCurrentPage();
    await flushPendingPageSaves();
    cleanupTransientInteractionState(false);

    let targetNb = null;
    let existingPages = [];

    if (mode === 'current-notebook' && getActiveNotebook()) {
      targetNb = getActiveNotebook();
      targetNb.updatedAt = Date.now();
      existingPages = getActiveNotebookPages();
      await db.saveNotebook(targetNb);
    } else {
      const nbId = createUid('nb');
      targetNb = {
        id: nbId,
        title: `📄 ${cleanName}`,
        coverColor: '#dc2626',
        defaultPaperType: 'blank',
        pdfId,
        isPdfNotebook: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      state.notebooks.push(targetNb);
      state.pagesByNotebook.set(nbId, []);
      await db.saveNotebook(targetNb);
    }

    // Sauvegarde locale optimisée : stocke le binaire PDF d'origine dans IndexedDB ('pdfs'), séparément des traits vectoriels
    await db.savePdfBinary({
      id: pdfId,
      notebookId: targetNb.id,
      fileName: fileName || `${cleanName}.pdf`,
      pageCount: numPages,
      data: storedBytes,
      createdAt: Date.now()
    });

    pdfDocInstanceCache.set(pdfId, Promise.resolve(pdfDoc));

    // Chargement paresseux (Lazy Loading) : lit uniquement les dimensions de la 1re page sans rendre les 50 pages d'un coup
    let defaultOrigW = 595.28;
    let defaultOrigH = 841.89;
    try {
      const firstPdfPage = await pdfDoc.getPage(1);
      const vp1 = firstPdfPage.getViewport({ scale: 1 });
      defaultOrigW = Math.max(1, vp1.width);
      defaultOrigH = Math.max(1, vp1.height);
      if (typeof firstPdfPage.cleanup === 'function') {
        try { firstPdfPage.cleanup(); } catch (_) {}
      }
    } catch (_) {}

    const defaultWorldW = PAGE_WIDTH;
    const defaultWorldH = Math.max(240, Math.round(PAGE_WIDTH * (defaultOrigH / defaultOrigW)));
    const createdPages = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pct = 15 + Math.round((pageNum / numPages) * 65);
      updatePdfImportProgressUI(true, `Indexation paresseuse page ${pageNum} / ${numPages}...`, pct);

      const orderIdx = existingPages.length + createdPages.length;
      const newPage = {
        id: createUid('page'),
        notebookId: targetNb.id,
        title: `${orderIdx + 1}. ${cleanName} (p.${pageNum})`,
        order: orderIdx,
        paperType: 'blank',
        paperTone: 'white',
        gridSize: 28,
        viewMode: 'infinite',
        pdfId,
        pdfPageNumber: pageNum,
        pdfWidth: defaultWorldW,
        pdfHeight: defaultWorldH,
        pdfOriginalWidth: defaultOrigW,
        pdfOriginalHeight: defaultOrigH,
        strokes: [],
        shapes: [],
        texts: [],
        _pdfThumbGenerated: false,
        thumbnail: generateLazyPdfPlaceholderThumbnail(pageNum, numPages, cleanName),
        updatedAt: Date.now()
      };

      await db.savePage(newPage);
      createdPages.push(newPage);
    }

    const updatedList = [...existingPages, ...createdPages];
    state.pagesByNotebook.set(targetNb.id, updatedList);
    state.activeNotebookId = targetNb.id;
    state.activePageId = createdPages[0].id;
    state.pendingPdfImport = null;

    // Extrait la table des matières PDF (pdfDoc.getOutline()) pour navigation instantanée dans la barre latérale
    if (typeof extractPdfOutlineTree === 'function') {
      try {
        const pdfOutline = await extractPdfOutlineTree(pdfDoc, createdPages);
        if (pdfOutline && pdfOutline.length > 0) {
          targetNb.pdfOutline = pdfOutline;
          if (typeof pdfOutlineCache !== 'undefined') pdfOutlineCache.set(pdfId, pdfOutline);
          await db.saveNotebook(targetNb);
        }
      } catch (_) {}
    }

    updatePdfImportProgressUI(true, 'Rendu haute résolution de la page affichée...', 90);
    // Charge et rend uniquement la page affichée (p.1) et la page suivante (p.2) en mémoire
    await ensureActiveAndAdjacentPdfPagesLoaded(createdPages[0]);
    await db.savePage(createdPages[0]);
    await db.saveWorkspaceState({ activeNotebookId: state.activeNotebookId, activePageId: state.activePageId });

    updatePdfImportProgressUI(true, 'Import terminé !', 100);
    clearLassoSelection();
    renderNotebooksSidebar();
    renderPagesSidebar();
    syncOpenTabsWithActiveNotebook();
    updateUndoRedoButtons();
    renderWorldTextCards();
    fitPageToViewport();
    requestRender();
    closeImportPdfModal();
    showToast(`PDF importé (${numPages} page${numPages > 1 ? 's' : ''}) — Calque de fond verrouillé !`);

    return { notebook: targetNb, pages: createdPages, pdfId };
  }

  async function exportAnnotatedPdfWithPdfLib(scope = 'notebook', triggerDownload = true) {
    if (typeof window === 'undefined' || !window.PDFLib) {
      showToast('Erreur : pdf-lib non disponible');
      return null;
    }
    const { PDFDocument, StandardFonts, rgb, LineCapStyle, LineJoinStyle, BlendMode, degrees } = window.PDFLib;
    const nb = getActiveNotebook();
    const pagesToExport = scope === 'page'
      ? [getActivePage()].filter(Boolean)
      : getActiveNotebookPages();

    if (!pagesToExport || pagesToExport.length === 0) {
      showToast('Aucune page à exporter');
      return null;
    }

    showToast('Génération du PDF vectoriel annoté (pdf-lib)...');

    const outPdf = await PDFDocument.create();
    const fontReg = await outPdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await outPdf.embedFont(StandardFonts.HelveticaBold);
    const loadedSourcePdfs = new Map();

    for (let pIdx = 0; pIdx < pagesToExport.length; pIdx++) {
      const page = pagesToExport[pIdx];
      let pdfPage = null;

      // 1. Charge la page du PDF d'origine si présente, sinon crée une page aux proportions exactes
      if (page.pdfId && page.pdfPageNumber) {
        try {
          let srcDoc = loadedSourcePdfs.get(page.pdfId);
          if (!srcDoc) {
            const rec = await db.getPdfBinary(page.pdfId);
            if (rec && rec.data) {
              const rawBytes = new Uint8Array(rec.data).slice();
              srcDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
              loadedSourcePdfs.set(page.pdfId, srcDoc);
            }
          }
          if (srcDoc) {
            const srcPageIdx = Math.max(0, Math.min(srcDoc.getPageCount() - 1, (page.pdfPageNumber || 1) - 1));
            const [copiedPage] = await outPdf.copyPages(srcDoc, [srcPageIdx]);
            pdfPage = outPdf.addPage(copiedPage);
          }
        } catch (_) {
          pdfPage = null;
        }
      }

      const worldW = page.pdfWidth || PAGE_WIDTH;
      const worldH = page.pdfHeight || PAGE_HEIGHT;

      if (!pdfPage) {
        const blankW = page.pdfOriginalWidth || 595.28;
        const blankH = page.pdfOriginalHeight || Math.round(blankW * (worldH / Math.max(1, worldW)));
        pdfPage = outPdf.addPage([blankW, blankH]);

        // Fond de page personnalisable pour les pages sans PDF d'origine
        const tone = page.paperTone || 'ivory';
        let bgCol = rgb(0.984, 0.98, 0.96);
        if (tone === 'white') bgCol = rgb(1, 1, 1);
        else if (tone === 'sepia') bgCol = rgb(0.96, 0.933, 0.863);
        else if (tone === 'dark') bgCol = rgb(0.078, 0.09, 0.122);
        else if (tone === 'blueprint') bgCol = rgb(0.051, 0.157, 0.278);
        else if (DETENTE_PAPER_TONES[tone]) {
          const hex = parseInt(DETENTE_PAPER_TONES[tone].bg.slice(1), 16);
          bgCol = rgb(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
        }

        pdfPage.drawRectangle({ x: 0, y: 0, width: blankW, height: blankH, color: bgCol });

        const pType = page.paperType || 'grid';
        const stepWorld = Math.max(14, page.gridSize || 28);
        const stepX = stepWorld * (blankW / worldW);
        const stepY = stepWorld * (blankH / worldH);
        const lineCol = (tone === 'dark' || tone === 'blueprint') ? rgb(0.35, 0.45, 0.60) : rgb(0.78, 0.83, 0.89);

        if (pType === 'grid' || pType === 'seyes' || pType === 'engineering') {
          for (let gx = stepX; gx < blankW; gx += stepX) {
            pdfPage.drawLine({ start: { x: gx, y: 0 }, end: { x: gx, y: blankH }, thickness: 0.45, color: lineCol, opacity: 0.45 });
          }
          for (let gy = stepY; gy < blankH; gy += stepY) {
            pdfPage.drawLine({ start: { x: 0, y: gy }, end: { x: blankW, y: gy }, thickness: 0.45, color: lineCol, opacity: 0.45 });
          }
        } else if (pType === 'lined') {
          for (let gy = stepY; gy < blankH - 30; gy += stepY) {
            pdfPage.drawLine({ start: { x: 0, y: gy }, end: { x: blankW, y: gy }, thickness: 0.55, color: lineCol, opacity: 0.55 });
          }
        }
      }

      const { width: pdfW, height: pdfH } = pdfPage.getSize();
      const scaleX = pdfW / Math.max(1, worldW);
      const scaleY = pdfH / Math.max(1, worldH);
      const scaleLen = (scaleX + scaleY) * 0.5;
      const toPdfX = (wx) => wx * scaleX;
      const toPdfY = (wy) => pdfH - wy * scaleY;

      // 2. Dessine les traits de surligneur en mode Multiply translucide aux coordonnées exactes
      for (const s of (page.strokes || [])) {
        if (s.tool !== 'highlighter' || !s.points || s.points.length === 0) continue;
        const col = parseHexToPdfRgb(s.color || '#facc15');
        const hlWidth = Math.max(2, (s.size || 22) * scaleLen);
        if (s.points.length === 1) {
          pdfPage.drawCircle({
            x: toPdfX(s.points[0].x),
            y: toPdfY(s.points[0].y),
            size: hlWidth * 0.5,
            color: col,
            opacity: 0.35,
            blendMode: BlendMode ? BlendMode.Multiply : undefined
          });
        } else {
          let d = `M ${(s.points[0].x * scaleX).toFixed(2)} ${(s.points[0].y * scaleY).toFixed(2)}`;
          for (let i = 1; i < s.points.length; i++) {
            const prev = s.points[i - 1];
            const curr = s.points[i];
            const mx = ((prev.x + curr.x) * 0.5) * scaleX;
            const my = ((prev.y + curr.y) * 0.5) * scaleY;
            d += ` Q ${(prev.x * scaleX).toFixed(2)} ${(prev.y * scaleY).toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
          }
          const last = s.points[s.points.length - 1];
          d += ` L ${(last.x * scaleX).toFixed(2)} ${(last.y * scaleY).toFixed(2)}`;
          pdfPage.drawSvgPath(d, {
            x: 0,
            y: pdfH,
            borderColor: col,
            borderWidth: hlWidth,
            borderOpacity: 0.35,
            borderLineCap: LineCapStyle ? LineCapStyle.Round : undefined,
            borderLineJoin: LineJoinStyle ? LineJoinStyle.Round : undefined,
            blendMode: BlendMode ? BlendMode.Multiply : undefined
          });
        }
      }

      // 3. Dessine les formes géométriques vectorielles (lignes, flèches, rectangles, cercles/ellipses, triangles)
      for (const sh of (page.shapes || [])) {
        const col = parseHexToPdfRgb(sh.color || '#1e293b');
        const strokeW = Math.max(0.8, (sh.size || 3) * scaleLen);
        const op = sh.isHighlighter ? 0.36 : 1.0;
        const fillOp = sh.filled ? 0.14 : undefined;
        const bm = (sh.isHighlighter && BlendMode) ? BlendMode.Multiply : undefined;

        if (sh.type === 'line' || sh.type === 'arrow') {
          pdfPage.drawLine({
            start: { x: toPdfX(sh.x1), y: toPdfY(sh.y1) },
            end: { x: toPdfX(sh.x2), y: toPdfY(sh.y2) },
            thickness: strokeW,
            color: col,
            opacity: op,
            lineCap: LineCapStyle ? LineCapStyle.Round : undefined,
            blendMode: bm
          });
          if (sh.type === 'arrow') {
            const ang = Math.atan2(sh.y2 - sh.y1, sh.x2 - sh.x1);
            const headLen = Math.max(12, Math.min(28, (sh.size || 3) * 3.8));
            const ax1 = sh.x2 - headLen * Math.cos(ang - Math.PI / 6);
            const ay1 = sh.y2 - headLen * Math.sin(ang - Math.PI / 6);
            const ax2 = sh.x2 - headLen * Math.cos(ang + Math.PI / 6);
            const ay2 = sh.y2 - headLen * Math.sin(ang + Math.PI / 6);
            pdfPage.drawLine({
              start: { x: toPdfX(ax1), y: toPdfY(ay1) },
              end: { x: toPdfX(sh.x2), y: toPdfY(sh.y2) },
              thickness: strokeW,
              color: col,
              opacity: op,
              lineCap: LineCapStyle ? LineCapStyle.Round : undefined,
              blendMode: bm
            });
            pdfPage.drawLine({
              start: { x: toPdfX(ax2), y: toPdfY(ay2) },
              end: { x: toPdfX(sh.x2), y: toPdfY(sh.y2) },
              thickness: strokeW,
              color: col,
              opacity: op,
              lineCap: LineCapStyle ? LineCapStyle.Round : undefined,
              blendMode: bm
            });
          }
        } else if (sh.type === 'rect' || sh.type === 'roundedRect') {
          const minX = Math.min(sh.x1, sh.x2);
          const maxY = Math.max(sh.y1, sh.y2);
          const rw = Math.max(1, Math.abs(sh.x2 - sh.x1)) * scaleX;
          const rh = Math.max(1, Math.abs(sh.y2 - sh.y1)) * scaleY;
          pdfPage.drawRectangle({
            x: toPdfX(minX),
            y: toPdfY(maxY),
            width: rw,
            height: rh,
            borderColor: col,
            borderWidth: strokeW,
            borderOpacity: op,
            color: sh.filled ? col : undefined,
            opacity: fillOp,
            blendMode: bm
          });
        } else if (sh.type === 'ellipse') {
          const cx = (sh.x1 + sh.x2) * 0.5;
          const cy = (sh.y1 + sh.y2) * 0.5;
          const rx = Math.max(1, Math.abs(sh.x2 - sh.x1) * 0.5) * scaleX;
          const ry = Math.max(1, Math.abs(sh.y2 - sh.y1) * 0.5) * scaleY;
          pdfPage.drawEllipse({
            x: toPdfX(cx),
            y: toPdfY(cy),
            xScale: rx,
            yScale: ry,
            borderColor: col,
            borderWidth: strokeW,
            borderOpacity: op,
            color: sh.filled ? col : undefined,
            opacity: fillOp,
            rotate: sh.angle && degrees ? degrees((-sh.angle * 180) / Math.PI) : undefined,
            blendMode: bm
          });
        } else if (sh.type === 'triangle' || sh.type === 'diamond' || sh.type === 'polygon') {
          const verts = getShapeVertices(sh);
          if (verts && verts.length >= 3) {
            let d = `M ${(verts[0].x * scaleX).toFixed(2)} ${(verts[0].y * scaleY).toFixed(2)}`;
            for (let i = 1; i < verts.length; i++) {
              d += ` L ${(verts[i].x * scaleX).toFixed(2)} ${(verts[i].y * scaleY).toFixed(2)}`;
            }
            d += ' Z';
            pdfPage.drawSvgPath(d, {
              x: 0,
              y: pdfH,
              borderColor: col,
              borderWidth: strokeW,
              borderOpacity: op,
              color: sh.filled ? col : undefined,
              opacity: fillOp,
              borderLineJoin: LineJoinStyle ? LineJoinStyle.Round : undefined,
              blendMode: bm
            });
          }
        } else if (sh.type === 'polyline') {
          const verts = getShapeVertices(sh);
          if (verts && verts.length >= 2) {
            let d = `M ${(verts[0].x * scaleX).toFixed(2)} ${(verts[0].y * scaleY).toFixed(2)}`;
            for (let i = 1; i < verts.length; i++) {
              d += ` L ${(verts[i].x * scaleX).toFixed(2)} ${(verts[i].y * scaleY).toFixed(2)}`;
            }
            pdfPage.drawSvgPath(d, {
              x: 0,
              y: pdfH,
              borderColor: col,
              borderWidth: strokeW,
              borderOpacity: op,
              borderLineCap: LineCapStyle ? LineCapStyle.Round : undefined,
              borderLineJoin: LineJoinStyle ? LineJoinStyle.Round : undefined,
              blendMode: bm
            });
          }
        } else if (sh.type === 'arc') {
          const verts = getShapeVertices(sh);
          if (verts && verts.length >= 4) {
            const d = `M ${(verts[0].x * scaleX).toFixed(2)} ${(verts[0].y * scaleY).toFixed(2)} C ${(verts[1].x * scaleX).toFixed(2)} ${(verts[1].y * scaleY).toFixed(2)} ${(verts[2].x * scaleX).toFixed(2)} ${(verts[2].y * scaleY).toFixed(2)} ${(verts[3].x * scaleX).toFixed(2)} ${(verts[3].y * scaleY).toFixed(2)}`;
            pdfPage.drawSvgPath(d, {
              x: 0,
              y: pdfH,
              borderColor: col,
              borderWidth: strokeW,
              borderOpacity: op,
              borderLineCap: LineCapStyle ? LineCapStyle.Round : undefined,
              blendMode: bm
            });
          }
        }
      }

      // 4. Dessine les traits de stylo vectoriels avec sensibilité à la pression
      for (const s of (page.strokes || [])) {
        if (s.tool === 'highlighter' || !s.points || s.points.length === 0) continue;
        const col = parseHexToPdfRgb(s.color || '#1e293b');
        const baseSize = s.size || 5;
        const isDynamic = s.pressureMode !== 'uniform';

        if (s.points.length === 1) {
          const p0 = s.points[0];
          const pFactor = isDynamic ? Math.max(0.35, p0.pressure || 0.5) : 0.8;
          const r = Math.max(0.8, baseSize * 0.5 * pFactor * scaleLen);
          pdfPage.drawCircle({
            x: toPdfX(p0.x),
            y: toPdfY(p0.y),
            size: r,
            color: col,
            opacity: 1
          });
        } else {
          for (let i = 1; i < s.points.length; i++) {
            const p0 = s.points[i - 1];
            const p1 = s.points[i];
            const avgP = ((p0.pressure ?? 0.5) + (p1.pressure ?? 0.5)) * 0.5;
            const widthFactor = isDynamic ? (0.36 + avgP * 0.88) : 0.78;
            const segThickness = Math.max(0.65, baseSize * widthFactor * scaleLen);
            pdfPage.drawLine({
              start: { x: toPdfX(p0.x), y: toPdfY(p0.y) },
              end: { x: toPdfX(p1.x), y: toPdfY(p1.y) },
              thickness: segThickness,
              color: col,
              opacity: 1,
              lineCap: LineCapStyle ? LineCapStyle.Round : undefined
            });
          }
        }
      }

      // 5. Dessine les emplacements de texte clavier & formules LaTeX aux coordonnées exactes
      for (const tb of (page.texts || [])) {
        const cleanText = latexToPdfReadableString(tb.text || '');
        if (!cleanText.trim()) continue;
        const fontSizeWorld = tb.fontSize || 16;
        const fontSizePdf = Math.max(7, fontSizeWorld * scaleLen);
        const lhWorld = fontSizeWorld * 1.38;
        const lines = cleanText.split(/\r?\n/);
        const cardW = (tb.width || 280) * scaleX;
        const cardH = Math.max(fontSizeWorld * 1.8, lines.length * lhWorld + 16) * scaleY;
        const boxX = toPdfX(tb.x);
        const boxTopY = toPdfY(tb.y);

        if (tb.style !== 'transparent') {
          const isSticky = tb.style === 'sticky';
          const isLatex = tb.isLatex || tb.style === 'latex';
          const fillCol = isSticky ? rgb(0.996, 0.976, 0.765) : isLatex ? rgb(0.96, 0.95, 1.0) : rgb(1, 1, 1);
          const borderCol = isSticky ? rgb(0.918, 0.702, 0.031) : isLatex ? rgb(0.486, 0.227, 0.929) : rgb(0.79, 0.84, 0.88);
          pdfPage.drawRectangle({
            x: boxX,
            y: boxTopY - cardH,
            width: cardW,
            height: cardH,
            color: fillCol,
            opacity: 0.92,
            borderColor: borderCol,
            borderWidth: 0.8,
            borderOpacity: 0.75
          });
        }

        const textCol = parseHexToPdfRgb(tb.color || '#1e293b');
        const chosenFont = tb.isLatex ? fontBold : fontReg;
        for (let lIdx = 0; lIdx < lines.length; lIdx++) {
          const lineStr = lines[lIdx];
          if (!lineStr) continue;
          const wy = tb.y + 10 + (lIdx + 0.82) * lhWorld;
          pdfPage.drawText(lineStr, {
            x: toPdfX(tb.x + 10),
            y: toPdfY(wy),
            size: fontSizePdf,
            font: chosenFont,
            color: textCol
          });
        }
      }
    }

    const pdfBytes = await outPdf.save();
    state.lastExportedPdfBytes = pdfBytes;

    if (triggerDownload) {
      const baseTitle = (nb ? nb.title : 'Notes-Plume-Studio')
        .replace(/[^\w\d\-_À-ÿ ]+/g, '')
        .trim()
        .replace(/\s+/g, '-') || 'Notes-Annotees';
      const suffix = scope === 'page' ? `-Page-${(pagesToExport[0]?.order ?? 0) + 1}` : '-Annote';
      await downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `${baseTitle}${suffix}.pdf`);
      showToast(`PDF annoté exporté (${pagesToExport.length} page${pagesToExport.length > 1 ? 's' : ''}) !`);
    }

    return pdfBytes;
  }

