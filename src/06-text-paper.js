  // ============================================================================
  // 10. EMPLACEMENTS DE TEXTE CLAVIER & BLOCS LATEX SUR LA PAGE INFINIE
  // ============================================================================

  const activeCardListenerCleanups = new Set();
  let activeTextEditorCommitFn = null;
  let suppressNextTextBlur = false;

  function cleanupWorldTextCardListeners() {
    for (const cleanupFn of Array.from(activeCardListenerCleanups)) {
      try { cleanupFn(); } catch (_) {}
    }
    activeCardListenerCleanups.clear();
  }

  function resolveTextBoxFrameStyle(tb) {
    if (tb && tb.frameStyle && typeof tb.frameStyle === 'object') {
      return {
        backgroundColor: tb.frameStyle.backgroundColor || null,
        borderColor: tb.frameStyle.borderColor || null,
        borderWidth: Math.max(0, Math.min(20, Number(tb.frameStyle.borderWidth) || 0)),
        cornerRadius: Math.max(0, Math.min(20, Number(tb.frameStyle.cornerRadius) || 0)),
        padding: Math.max(0, Math.min(20, Number.isFinite(Number(tb.frameStyle.padding)) ? Number(tb.frameStyle.padding) : 10)),
        showShadow: Boolean(tb.frameStyle.showShadow)
      };
    }
    // Compatibilité rétroactive avec les anciens styles ('transparent', 'card', 'sticky', 'latex')
    if (tb && tb.isLatex) {
      return { backgroundColor: 'rgba(245, 243, 255, 0.94)', borderColor: 'rgba(124, 58, 237, 0.30)', borderWidth: 1, cornerRadius: 8, padding: 10, showShadow: true };
    }
    if (tb && tb.style === 'sticky') {
      return { backgroundColor: '#fef9c3', borderColor: 'rgba(202, 138, 4, 0.30)', borderWidth: 1, cornerRadius: 7, padding: 10, showShadow: true };
    }
    if (tb && tb.style === 'card') {
      return { backgroundColor: '#ffffff', borderColor: 'rgba(15, 23, 42, 0.14)', borderWidth: 1, cornerRadius: 7, padding: 10, showShadow: true };
    }
    return { backgroundColor: null, borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false };
  }

  function getActiveTextBox(page = getActivePage()) {
    if (!page || !Array.isArray(page.texts)) return null;
    const id = state.editingTextId || state.selectedTextId;
    if (!id) return null;
    return page.texts.find((t) => t.id === id) || null;
  }

  function getTextBoxEffectiveTypography(tb) {
    const fontFamily = (tb && tb.fontFamily) || state.textFontFamily || "'Helvetica Neue', Helvetica, Arial, sans-serif";
    const fontSize = Math.max(1, Math.min(200, Math.round((tb && Number.isFinite(tb.fontSize) ? tb.fontSize : state.textFontSize) || 24)));
    const color = (tb && tb.color) || state.textColor || '#000000';
    const bold = tb && typeof tb.bold === 'boolean' ? tb.bold : Boolean(state.textBold);
    const italic = tb && typeof tb.italic === 'boolean' ? tb.italic : Boolean(state.textItalic);
    const underline = tb && typeof tb.underline === 'boolean' ? tb.underline : Boolean(state.textUnderline);
    const strike = tb && typeof tb.strike === 'boolean' ? tb.strike : Boolean(state.textStrike);
    const textAlign = (tb && tb.textAlign) || state.textAlign || 'left';
    const lineHeightMode = (tb && tb.lineHeightMode) || state.textLineHeightMode || 'automatic';
    const lineHeightFixed = Math.max(8, Math.min(200, Math.round((tb && Number.isFinite(tb.lineHeightFixed) ? tb.lineHeightFixed : state.textLineHeightFixed) || Math.round(fontSize * 1.35))));
    const listStyle = (tb && tb.listStyle) || state.textListStyle || 'none';
    const frameStyle = tb ? resolveTextBoxFrameStyle(tb) : { ...state.textFrameStyle };
    return { fontFamily, fontSize, color, bold, italic, underline, strike, textAlign, lineHeightMode, lineHeightFixed, listStyle, frameStyle };
  }

  function applyTextBoxVisualStyles(card, tb) {
    if (!card || !tb) return;
    const typo = getTextBoxEffectiveTypography(tb);
    const fs = typo.frameStyle;
    card.style.left = `${tb.x}px`;
    card.style.top = `${tb.y}px`;
    card.style.width = `${Math.max(72, tb.width || 260)}px`;
    card.style.color = typo.color;
    card.style.fontFamily = typo.fontFamily;
    card.style.fontSize = `${typo.fontSize}px`;
    card.style.fontWeight = typo.bold ? '700' : '400';
    card.style.fontStyle = typo.italic ? 'italic' : 'normal';
    const deco = [];
    if (typo.underline) deco.push('underline');
    if (typo.strike) deco.push('line-through');
    card.style.textDecoration = deco.length ? deco.join(' ') : 'none';
    card.style.textAlign = typo.textAlign;
    card.style.lineHeight = typo.lineHeightMode === 'fixed' ? `${typo.lineHeightFixed}px` : '1.35';
    card.style.background = fs.backgroundColor || 'transparent';
    card.style.borderRadius = `${fs.cornerRadius}px`;
    card.style.padding = `${fs.padding}px`;
    if (fs.borderWidth > 0 && fs.borderColor) {
      card.style.border = `${fs.borderWidth}px solid ${fs.borderColor}`;
    } else if (fs.borderWidth > 0) {
      card.style.border = `${fs.borderWidth}px solid rgba(15, 23, 42, 0.25)`;
    } else {
      card.style.border = '0 solid transparent';
    }
    card.style.boxShadow = fs.showShadow ? '0px 4px 10px rgba(0, 0, 0, 0.22)' : 'none';
  }

  function formatTextForListStyle(rawText, listStyle) {
    const lines = String(rawText || '').split('\n');
    const stripped = lines.map((line) => line.replace(/^\s*(?:•\s+|\d+\.\s+)/, ''));
    if (listStyle === 'bullets') {
      return stripped.map((l) => (l.length > 0 ? `• ${l}` : '• ')).join('\n');
    }
    if (listStyle === 'numbered') {
      return stripped.map((l, idx) => `${idx + 1}. ${l}`).join('\n');
    }
    return stripped.join('\n');
  }

  function autoResizeTextCardTextarea(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(28, ta.scrollHeight)}px`;
  }

  function updateTextEditFloatingBar() {
    const bar = document.getElementById('textEditFloatingBar');
    if (!bar) return;
    const page = getActivePage();
    const tb = getActiveTextBox(page);
    if (!tb || !dom.canvasViewport) {
      bar.classList.add('hidden');
      return;
    }
    const cardEl = dom.worldObjectsLayer ? dom.worldObjectsLayer.querySelector(`[data-text-id="${tb.id}"]`) : null;
    const cardHWorld = cardEl && cardEl.offsetHeight ? cardEl.offsetHeight : Math.max(44, (tb.fontSize || 24) * 1.8);
    const cardWWorld = Math.max(72, tb.width || 260);
    const vpRect = dom.canvasViewport.getBoundingClientRect();
    const centerScreenX = state.panX + (tb.x + cardWWorld * 0.5) * state.zoom;
    const topScreenY = state.panY + tb.y * state.zoom;
    const bottomScreenY = state.panY + (tb.y + cardHWorld) * state.zoom;

    const btnType = document.getElementById('btnTextEditType');
    if (btnType) {
      btnType.textContent = state.editingTextId === tb.id ? 'Terminer' : 'Modifier';
    }

    bar.classList.remove('hidden');
    const barW = bar.offsetWidth || 220;
    const barH = bar.offsetHeight || 36;
    const clampedX = Math.max(barW * 0.5 + 12, Math.min((vpRect.width || 900) - barW * 0.5 - 12, centerScreenX));
    let targetY = topScreenY - barH - 22;
    if (targetY < 10) targetY = bottomScreenY + 14;
    targetY = Math.max(10, Math.min((vpRect.height || 600) - barH - 10, targetY));

    bar.style.left = `${Math.round(clampedX)}px`;
    bar.style.top = `${Math.round(targetY)}px`;
  }

  function clearSelectedTextBox(commitFirst = true) {
    if (commitFirst && typeof activeTextEditorCommitFn === 'function') {
      const fn = activeTextEditorCommitFn;
      activeTextEditorCommitFn = null;
      fn(true);
      return;
    }
    const hadAny = Boolean(state.selectedTextId || state.editingTextId);
    state.selectedTextId = null;
    state.editingTextId = null;
    if (hadAny) {
      renderWorldTextCards();
      updateTextEditFloatingBar();
      if (typeof syncGnTextSubBarUi === 'function') syncGnTextSubBarUi();
    }
  }

  function applyTextPropertyToActiveOrDefault(updater, opts = {}) {
    const page = getActivePage();
    const activeTb = getActiveTextBox(page);
    if (activeTb && page) {
      if (!opts.skipHistory) pushHistorySnapshot(page);
      updater(activeTb, true);
      const cardEl = dom.worldObjectsLayer ? dom.worldObjectsLayer.querySelector(`[data-text-id="${activeTb.id}"]`) : null;
      if (cardEl) {
        applyTextBoxVisualStyles(cardEl, activeTb);
        const ta = cardEl.querySelector('.world-card-textarea');
        if (ta) {
          if (opts.syncTextValue) ta.value = activeTb.text || '';
          autoResizeTextCardTextarea(ta);
        } else {
          const rend = cardEl.querySelector('.world-card-rendered');
          if (rend && opts.syncTextValue) {
            rend.innerHTML = activeTb.isLatex ? renderLatexToHtml(activeTb.text, true) : renderRichTextWithLatex(activeTb.text);
          }
        }
      } else {
        renderWorldTextCards();
      }
      scheduleSaveActivePage(page);
      updateTextEditFloatingBar();
    } else {
      updater(null, false);
      saveTextToolPrefs();
    }
    if (typeof syncGnTextSubBarUi === 'function') syncGnTextSubBarUi();
  }

  function renderWorldTextCards() {
    if (!dom.worldObjectsLayer) return;
    cleanupWorldTextCardListeners();
    activeTextEditorCommitFn = null;
    const page = getActivePage();
    dom.worldObjectsLayer.innerHTML = '';
    if (!page) {
      updateTextEditFloatingBar();
      return;
    }

    (page.texts || []).forEach((tb) => {
      const card = document.createElement('div');
      const isLassoSel = state.selectedIds.texts.has(tb.id);
      const isActiveSel = state.selectedTextId === tb.id || state.editingTextId === tb.id;
      card.className = `world-text-card${isLassoSel || isActiveSel ? ' selected' : ''}`;
      card.dataset.textId = tb.id;
      applyTextBoxVisualStyles(card, tb);

      card.innerHTML = `
        <div class="gn-tb-drag-pill" title="Glisser pour déplacer la zone de texte"></div>
        <div class="gn-tb-resize-handle left" data-tb-resize="left" title="Redimensionner la largeur"></div>
        <div class="gn-tb-resize-handle right" data-tb-resize="right" title="Redimensionner la largeur"></div>
        <div class="world-card-body">
          <div class="world-card-rendered">${
            tb.isLatex ? renderLatexToHtml(tb.text, true) : renderRichTextWithLatex(tb.text)
          }</div>
        </div>
      `;

      // Helper : déplacer la zone de texte (depuis la pilule supérieure ou le cadre sélectionné)
      const startMoveCard = (ev, captureTarget) => {
        ev.stopPropagation();
        ev.preventDefault();
        pushHistorySnapshot(page);
        const startX = ev.clientX;
        const startY = ev.clientY;
        const origX = tb.x;
        const origY = tb.y;
        const pid = ev.pointerId;
        try { if (typeof pid === 'number' && captureTarget) captureTarget.setPointerCapture(pid); } catch (_) {}

        const onMove = (mev) => {
          tb.x = Math.round(origX + (mev.clientX - startX) / state.zoom);
          tb.y = Math.round(origY + (mev.clientY - startY) / state.zoom);
          card.style.left = `${tb.x}px`;
          card.style.top = `${tb.y}px`;
          updateTextEditFloatingBar();
          if (hasAnyLassoSelection()) updateLassoFloatingBarPosition();
          if (state.selectedShapeId) updateShapeEditFloatingBar();
        };
        let cleaned = false;
        const cleanupDrag = () => {
          if (cleaned) return;
          cleaned = true;
          activeCardListenerCleanups.delete(cleanupDrag);
          captureTarget.removeEventListener('pointermove', onMove);
          captureTarget.removeEventListener('pointerup', onUp);
          captureTarget.removeEventListener('pointercancel', onUp);
          captureTarget.removeEventListener('lostpointercapture', onUp);
          try { if (typeof pid === 'number') captureTarget.releasePointerCapture(pid); } catch (_) {}
        };
        const onUp = () => {
          cleanupDrag();
          scheduleSaveActivePage(page);
          updateTextEditFloatingBar();
        };
        activeCardListenerCleanups.add(cleanupDrag);
        captureTarget.addEventListener('pointermove', onMove);
        captureTarget.addEventListener('pointerup', onUp);
        captureTarget.addEventListener('pointercancel', onUp);
        captureTarget.addEventListener('lostpointercapture', onUp);
      };

      const dragPill = card.querySelector('.gn-tb-drag-pill');
      if (dragPill) {
        dragPill.addEventListener('pointerdown', (ev) => {
          suppressNextTextBlur = true;
          setTimeout(() => { suppressNextTextBlur = false; }, 120);
          startMoveCard(ev, dragPill);
        });
      }

      // Poignées latérales gauche & droite de redimensionnement largeur (GoodNotes 6)
      card.querySelectorAll('.gn-tb-resize-handle').forEach((handle) => {
        handle.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          suppressNextTextBlur = true;
          setTimeout(() => { suppressNextTextBlur = false; }, 120);
          pushHistorySnapshot(page);
          const side = handle.dataset.tbResize;
          const startX = ev.clientX;
          const origX = tb.x;
          const origW = Math.max(72, tb.width || 260);
          const pid = ev.pointerId;
          try { if (typeof pid === 'number') handle.setPointerCapture(pid); } catch (_) {}

          const onMove = (mev) => {
            const dxWorld = (mev.clientX - startX) / state.zoom;
            if (side === 'right') {
              tb.width = Math.max(72, Math.round(origW + dxWorld));
              card.style.width = `${tb.width}px`;
            } else {
              const nextW = Math.max(72, Math.round(origW - dxWorld));
              const appliedDelta = origW - nextW;
              tb.x = Math.round(origX + appliedDelta);
              tb.width = nextW;
              card.style.left = `${tb.x}px`;
              card.style.width = `${tb.width}px`;
            }
            const ta = card.querySelector('.world-card-textarea');
            if (ta) autoResizeTextCardTextarea(ta);
            updateTextEditFloatingBar();
          };
          let cleaned = false;
          const cleanupResize = () => {
            if (cleaned) return;
            cleaned = true;
            activeCardListenerCleanups.delete(cleanupResize);
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            handle.removeEventListener('lostpointercapture', onUp);
            try { if (typeof pid === 'number') handle.releasePointerCapture(pid); } catch (_) {}
          };
          const onUp = () => {
            cleanupResize();
            scheduleSaveActivePage(page);
            updateTextEditFloatingBar();
          };
          activeCardListenerCleanups.add(cleanupResize);
          handle.addEventListener('pointermove', onMove);
          handle.addEventListener('pointerup', onUp);
          handle.addEventListener('pointercancel', onUp);
          handle.addEventListener('lostpointercapture', onUp);
        });
      });

      // Interaction sur le corps de la zone de texte :
      // - Outil Texte actif : clic = saisie directe immédiate (style GoodNotes 6)
      // - Autre outil non-dessin (Main) : 1er clic = sélection + déplacement, double-clic = saisie
      const bodyEl = card.querySelector('.world-card-body');
      if (bodyEl) {
        bodyEl.addEventListener('pointerdown', (ev) => {
          if (card.classList.contains('editing')) return;
          ev.stopPropagation();
          if (state.selectedTextId === tb.id && state.tool !== 'text') {
            // Déplacement direct par glisser sur une zone déjà sélectionnée
            const startX = ev.clientX;
            const startY = ev.clientY;
            let moved = false;
            const origX = tb.x;
            const origY = tb.y;
            const onMove = (mev) => {
              if (!moved && Math.hypot(mev.clientX - startX, mev.clientY - startY) < 5) return;
              if (!moved) {
                moved = true;
                pushHistorySnapshot(page);
              }
              tb.x = Math.round(origX + (mev.clientX - startX) / state.zoom);
              tb.y = Math.round(origY + (mev.clientY - startY) / state.zoom);
              card.style.left = `${tb.x}px`;
              card.style.top = `${tb.y}px`;
              updateTextEditFloatingBar();
            };
            const onUp = () => {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
              window.removeEventListener('pointercancel', onUp);
              if (moved) scheduleSaveActivePage(page);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
          }
        });
        bodyEl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (card.classList.contains('editing')) return;
          if (state.tool === 'text') {
            enterCardKeyboardEditMode(card, tb, page);
          } else {
            if (state.selectedTextId === tb.id) {
              enterCardKeyboardEditMode(card, tb, page);
            } else {
              state.selectedTextId = tb.id;
              state.editingTextId = null;
              renderWorldTextCards();
              if (typeof syncGnTextSubBarUi === 'function') syncGnTextSubBarUi();
            }
          }
        });
        bodyEl.addEventListener('dblclick', (ev) => {
          ev.stopPropagation();
          enterCardKeyboardEditMode(card, tb, page);
        });
      }

      dom.worldObjectsLayer.appendChild(card);
    });

    // Images / Stickers Goodnotes sur la page infinie (déplaçables & redimensionnables)
    (page.images || []).forEach((imgItem) => {
      const wrap = document.createElement('div');
      const isImgSel = Boolean(state.selectedIds.images && state.selectedIds.images.has(imgItem.id));
      wrap.className = `world-image-card${isImgSel ? ' selected' : ''}`;
      wrap.dataset.imageId = imgItem.id;
      wrap.style.left = `${imgItem.x}px`;
      wrap.style.top = `${imgItem.y}px`;
      wrap.style.width = `${imgItem.width || 240}px`;
      wrap.style.height = `${imgItem.height || 180}px`;
      wrap.innerHTML = `
        <img src="${imgItem.src}" alt="Image" draggable="false" />
        <div class="world-image-controls">
          <button class="world-image-ctrl-btn" data-img-act="crop" type="button" title="Recadrer l'image" aria-label="Recadrer l'image">✂</button>
          <button class="world-image-ctrl-btn danger" data-img-act="delete" type="button" title="Supprimer l'image" aria-label="Supprimer l'image">✕</button>
        </div>
        <div class="world-image-resize-handle" title="Redimensionner"></div>
      `;

      const cropBtn = wrap.querySelector('[data-img-act="crop"]');
      if (cropBtn) {
        cropBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openImageCropModal(imgItem, page);
        });
      }

      const delBtn = wrap.querySelector('[data-img-act="delete"]');
      if (delBtn) {
        delBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          pushHistorySnapshot(page);
          page.images = (page.images || []).filter((x) => x.id !== imgItem.id);
          renderWorldTextCards();
          scheduleSaveActivePage(page);
        });
      }

      // Déplacement image
      wrap.addEventListener('pointerdown', (ev) => {
        if (ev.target.closest('[data-img-act]') || ev.target.closest('.world-image-resize-handle')) return;
        ev.stopPropagation();
        const startX = ev.clientX, startY = ev.clientY;
        const origX = imgItem.x, origY = imgItem.y;
        const pid = ev.pointerId;
        try { if (typeof pid === 'number') wrap.setPointerCapture(pid); } catch (_) {}
        const onMove = (mev) => {
          imgItem.x = Math.round(origX + (mev.clientX - startX) / state.zoom);
          imgItem.y = Math.round(origY + (mev.clientY - startY) / state.zoom);
          wrap.style.left = `${imgItem.x}px`;
          wrap.style.top = `${imgItem.y}px`;
        };
        const onUp = () => {
          wrap.removeEventListener('pointermove', onMove);
          wrap.removeEventListener('pointerup', onUp);
          wrap.removeEventListener('pointercancel', onUp);
          try { if (typeof pid === 'number') wrap.releasePointerCapture(pid); } catch (_) {}
          scheduleSaveActivePage(page);
        };
        wrap.addEventListener('pointermove', onMove);
        wrap.addEventListener('pointerup', onUp);
        wrap.addEventListener('pointercancel', onUp);
      });

      // Redimensionnement image (conservation du ratio)
      const resizeHandle = wrap.querySelector('.world-image-resize-handle');
      if (resizeHandle) {
        resizeHandle.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          const startX = ev.clientX;
          const origW = imgItem.width || 240;
          const origH = imgItem.height || 180;
          const ratio = origH / Math.max(1, origW);
          const pid = ev.pointerId;
          try { if (typeof pid === 'number') resizeHandle.setPointerCapture(pid); } catch (_) {}
          const onMove = (mev) => {
            const nextW = Math.max(48, Math.round(origW + (mev.clientX - startX) / state.zoom));
            imgItem.width = nextW;
            imgItem.height = Math.max(36, Math.round(nextW * ratio));
            wrap.style.width = `${imgItem.width}px`;
            wrap.style.height = `${imgItem.height}px`;
          };
          const onUp = () => {
            resizeHandle.removeEventListener('pointermove', onMove);
            resizeHandle.removeEventListener('pointerup', onUp);
            resizeHandle.removeEventListener('pointercancel', onUp);
            try { if (typeof pid === 'number') resizeHandle.releasePointerCapture(pid); } catch (_) {}
            scheduleSaveActivePage(page);
          };
          resizeHandle.addEventListener('pointermove', onMove);
          resizeHandle.addEventListener('pointerup', onUp);
          resizeHandle.addEventListener('pointercancel', onUp);
        });
      }

      dom.worldObjectsLayer.appendChild(wrap);
    });

    updateTextEditFloatingBar();
    if (typeof syncGnTextSubBarUi === 'function') syncGnTextSubBarUi();
  }

  function enterCardKeyboardEditMode(card, tb, ownerPage = getActivePage()) {
    if (!card || !tb || card.classList.contains('editing')) return;
    if (typeof activeTextEditorCommitFn === 'function') {
      const prevCommit = activeTextEditorCommitFn;
      activeTextEditorCommitFn = null;
      prevCommit(false);
    }
    const targetPage = ownerPage || getActivePage();
    state.selectedTextId = tb.id;
    state.editingTextId = tb.id;
    card.classList.add('editing');
    card.classList.add('selected');
    const bodyEl = card.querySelector('.world-card-body');
    if (!bodyEl) return;

    // Affiche automatiquement la sous-barre de mise en forme GoodNotes quand on édite du texte
    if (state.tool === 'text' && !state.toolOptionsOpen) {
      state.toolOptionsOpen = true;
      updateToolbarActiveState();
    }

    bodyEl.innerHTML = '';
    const ta = document.createElement('textarea');
    ta.className = 'world-card-textarea';
    ta.value = tb.text || '';
    ta.placeholder = tb.isLatex
      ? 'Code LaTeX (ex: \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a})'
      : 'Saisir du texte…';
    ta.rows = Math.max(1, (tb.text || '').split('\n').length);

    bodyEl.appendChild(ta);
    autoResizeTextCardTextarea(ta);

    const focusTimer = setTimeout(() => {
      ta.focus();
      autoResizeTextCardTextarea(ta);
      if (typeof ta.setSelectionRange === 'function') {
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
      updateTextEditFloatingBar();
      if (typeof syncGnTextSubBarUi === 'function') syncGnTextSubBarUi();
    }, 10);

    let committed = false;
    const commitEdit = (reRender = true) => {
      if (committed) return;
      committed = true;
      clearTimeout(focusTimer);
      if (activeTextEditorCommitFn === commitEdit) activeTextEditorCommitFn = null;
      activeCardListenerCleanups.delete(cleanupTa);
      ta.removeEventListener('blur', onBlur);
      ta.removeEventListener('input', onInput);
      ta.removeEventListener('keydown', onKeyDown);
      card.classList.remove('editing');
      const newVal = ta.value.replace(/\s+$/, '');
      if (!newVal.trim() && targetPage) {
        targetPage.texts = (targetPage.texts || []).filter((x) => x.id !== tb.id);
        if (state.selectedTextId === tb.id) state.selectedTextId = null;
        if (state.editingTextId === tb.id) state.editingTextId = null;
      } else {
        tb.text = newVal;
        if (state.editingTextId === tb.id) state.editingTextId = null;
        if (reRender && state.selectedTextId === tb.id) state.selectedTextId = null;
      }
      if (targetPage) scheduleSaveActivePage(targetPage);
      if (reRender && getActivePage() === targetPage) {
        renderWorldTextCards();
        requestRender();
      }
      updateTextEditFloatingBar();
      if (typeof syncGnTextSubBarUi === 'function') syncGnTextSubBarUi();
    };

    const onInput = () => {
      tb.text = ta.value;
      autoResizeTextCardTextarea(ta);
      updateTextEditFloatingBar();
    };

    const onBlur = (bev) => {
      if (suppressNextTextBlur) {
        setTimeout(() => {
          if (!committed && document.body.contains(ta)) ta.focus();
        }, 0);
        return;
      }
      const nextTarget = bev && bev.relatedTarget;
      if (nextTarget && typeof nextTarget.closest === 'function' && (
        nextTarget.closest('.gn-text-subbar') ||
        nextTarget.closest('.gn-text-popover') ||
        nextTarget.closest('#gnColorPopover') ||
        nextTarget.closest('.text-edit-bar') ||
        nextTarget.closest('.world-text-card')
      )) {
        return;
      }
      if (state.gnTextPopover || (gnColorPopoverState && gnColorPopoverState.open)) {
        return;
      }
      commitEdit(true);
    };

    const onKeyDown = (kev) => {
      kev.stopPropagation();
      const mod = kev.ctrlKey || kev.metaKey;
      if (mod && kev.key === 'Enter') {
        kev.preventDefault();
        commitEdit(true);
        return;
      }
      if (kev.key === 'Escape') {
        kev.preventDefault();
        commitEdit(true);
        return;
      }
      if (mod && !kev.altKey) {
        const lower = (kev.key || '').toLowerCase();
        if (lower === 'b') {
          kev.preventDefault();
          applyTextPropertyToActiveOrDefault((t) => { t.bold = !t.bold; });
          return;
        }
        if (lower === 'i') {
          kev.preventDefault();
          applyTextPropertyToActiveOrDefault((t) => { t.italic = !t.italic; });
          return;
        }
        if (lower === 'u') {
          kev.preventDefault();
          applyTextPropertyToActiveOrDefault((t) => { t.underline = !t.underline; });
          return;
        }
        if (lower === 'x' && kev.shiftKey) {
          kev.preventDefault();
          applyTextPropertyToActiveOrDefault((t) => { t.strike = !t.strike; });
          return;
        }
      }
      // Continuation automatique de liste à puces ou numérotée sur Entrée (style GoodNotes 6)
      if (kev.key === 'Enter' && !kev.shiftKey && !mod) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        if (typeof start === 'number' && start === end) {
          const before = ta.value.slice(0, start);
          const lineStart = before.lastIndexOf('\n') + 1;
          const curLine = before.slice(lineStart);
          const bulletMatch = curLine.match(/^(\s*•\s+)(.*)$/);
          const numMatch = curLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
          if (bulletMatch) {
            kev.preventDefault();
            if (!bulletMatch[2].trim()) {
              // Ligne vide à puce -> quitter la liste proprement
              ta.value = ta.value.slice(0, lineStart) + ta.value.slice(end);
              ta.selectionStart = ta.selectionEnd = lineStart;
            } else {
              const ins = `\n${bulletMatch[1]}`;
              ta.value = ta.value.slice(0, start) + ins + ta.value.slice(end);
              ta.selectionStart = ta.selectionEnd = start + ins.length;
            }
            onInput();
            return;
          }
          if (numMatch) {
            kev.preventDefault();
            if (!numMatch[3].trim()) {
              ta.value = ta.value.slice(0, lineStart) + ta.value.slice(end);
              ta.selectionStart = ta.selectionEnd = lineStart;
            } else {
              const nextNum = parseInt(numMatch[2], 10) + 1;
              const ins = `\n${numMatch[1]}${nextNum}. `;
              ta.value = ta.value.slice(0, start) + ins + ta.value.slice(end);
              ta.selectionStart = ta.selectionEnd = start + ins.length;
            }
            onInput();
            return;
          }
        }
      }
    };

    const cleanupTa = () => commitEdit(false);
    activeTextEditorCommitFn = commitEdit;
    activeCardListenerCleanups.add(cleanupTa);

    ta.addEventListener('blur', onBlur);
    ta.addEventListener('input', onInput);
    ta.addEventListener('keydown', onKeyDown);
    updateTextEditFloatingBar();
    if (typeof syncGnTextSubBarUi === 'function') syncGnTextSubBarUi();
  }

  function createInteractiveTextCardAt(worldX, worldY, initialText = '', isLatex = false, autoEdit = true, customWidth = null) {
    const page = getActivePage();
    if (!page) return null;
    pushHistorySnapshot(page);
    const defaultFrame = isLatex
      ? { backgroundColor: 'rgba(245, 243, 255, 0.94)', borderColor: 'rgba(124, 58, 237, 0.28)', borderWidth: 1, cornerRadius: 8, padding: 10, showShadow: true }
      : { ...state.textFrameStyle };
    const startText = (!isLatex && !initialText && state.textListStyle === 'bullets')
      ? '• '
      : (!isLatex && !initialText && state.textListStyle === 'numbered' ? '1. ' : initialText);

    const newCard = {
      id: createUid('tx'),
      x: Math.round(worldX),
      y: Math.round(worldY),
      width: Math.max(72, Math.round(customWidth || (isLatex ? 320 : 260))),
      text: startText,
      color: state.textColor || '#000000',
      fontFamily: state.textFontFamily || "'Helvetica Neue', Helvetica, Arial, sans-serif",
      fontSize: isLatex ? 20 : Math.max(1, Math.min(200, Math.round(state.textFontSize || 24))),
      bold: isLatex ? false : Boolean(state.textBold),
      italic: isLatex ? false : Boolean(state.textItalic),
      underline: isLatex ? false : Boolean(state.textUnderline),
      strike: isLatex ? false : Boolean(state.textStrike),
      textAlign: isLatex ? 'center' : (state.textAlign || 'left'),
      lineHeightMode: state.textLineHeightMode || 'automatic',
      lineHeightFixed: state.textLineHeightFixed || 32,
      listStyle: isLatex ? 'none' : (state.textListStyle || 'none'),
      frameStyle: defaultFrame,
      style: isLatex ? 'latex' : 'transparent',
      isLatex: Boolean(isLatex)
    };
    if (!page.texts) page.texts = [];
    page.texts.push(newCard);
    state.selectedTextId = newCard.id;
    renderWorldTextCards();
    requestRender();
    scheduleSaveActivePage(page);

    if (autoEdit && dom.worldObjectsLayer) {
      const cardEl = dom.worldObjectsLayer.querySelector(`[data-text-id="${newCard.id}"]`);
      if (cardEl) enterCardKeyboardEditMode(cardEl, newCard, page);
    }
    return newCard;
  }

  // ============================================================================
  // 11. RENDU DES 8 FONDS DE PAGE & DU CANEVAS INFINI
  // ============================================================================

  let renderPending = false;
  let staticRenderPending = false;
  let activeRenderPending = false;

  function requestRender() {
    if (!renderPending) {
      renderPending = true;
      requestAnimationFrame(() => {
        renderPending = false;
        staticRenderPending = false;
        activeRenderPending = false;
        renderScene();
      });
    }
  }

  function requestStaticInkRender() {
    if (!bgCtx) {
      requestRender();
      return;
    }
    if (renderPending || staticRenderPending) return;
    staticRenderPending = true;
    requestAnimationFrame(() => {
      staticRenderPending = false;
      if (renderPending) return;
      renderStaticInkLayerOnly();
      const page = getActivePage();
      if (page) {
        const total = (page.strokes?.length || 0) + (page.shapes?.length || 0) + (page.texts?.length || 0);
        if (dom.strokeCountBadge) {
          dom.strokeCountBadge.textContent = `${total} élément${total > 1 ? 's' : ''}`;
        }
        if (state.splitView && state.splitView.open && state.splitView.pageId === page.id) {
          scheduleSplitPaneRender();
        }
      }
    });
  }

  function requestActiveRender() {
    if (!activeCtx) {
      requestRender();
      return;
    }
    if (renderPending) return;
    if (!activeRenderPending) {
      activeRenderPending = true;
      requestAnimationFrame(() => {
        activeRenderPending = false;
        if (!renderPending) {
          renderActiveCanvasOnly();
        }
      });
    }
  }

  // Teintes claires débloquées dans la boutique Détente (le rendu reste valable même si l'achat est perdu)
  const DETENTE_PAPER_TONES = {
    mint: { bg: '#eef6f0', line: '22, 101, 52', seyes: '13, 116, 104' },
    rose: { bg: '#fbf0f0', line: '159, 18, 57', seyes: '157, 23, 77' },
    sky: { bg: '#eef4fb', line: '30, 64, 175', seyes: '37, 99, 235' },
    kraft: { bg: '#ecdfc6', line: '120, 83, 45', seyes: '87, 60, 30' },
    lavande: { bg: '#f3effa', line: '91, 33, 182', seyes: '109, 40, 217' },
    sable: { bg: '#f6efe0', line: '146, 100, 40', seyes: '120, 80, 30' },
    peche: { bg: '#fdf0e6', line: '194, 65, 12', seyes: '180, 70, 30' }
  };

  function getPaperPalette(tone = 'ivory') {
    const shopTone = DETENTE_PAPER_TONES[tone];
    if (shopTone) {
      return {
        bg: shopTone.bg,
        gridLine: `rgba(${shopTone.line}, 0.14)`,
        subGridLine: `rgba(${shopTone.line}, 0.06)`,
        seyesMain: `rgba(${shopTone.seyes}, 0.28)`,
        seyesSub: `rgba(${shopTone.seyes}, 0.12)`,
        marginLine: 'rgba(220, 38, 38, 0.38)',
        dotColor: `rgba(${shopTone.line}, 0.36)`,
        isDark: false
      };
    }
    if (tone === 'dark') {
      return {
        bg: '#14171f',
        gridLine: 'rgba(148, 163, 184, 0.14)',
        subGridLine: 'rgba(148, 163, 184, 0.06)',
        seyesMain: 'rgba(96, 165, 250, 0.28)',
        seyesSub: 'rgba(148, 163, 184, 0.11)',
        marginLine: 'rgba(248, 113, 113, 0.42)',
        dotColor: 'rgba(148, 163, 184, 0.36)',
        isDark: true
      };
    }
    if (tone === 'blueprint') {
      return {
        bg: '#0d2847',
        gridLine: 'rgba(125, 211, 252, 0.24)',
        subGridLine: 'rgba(125, 211, 252, 0.10)',
        seyesMain: 'rgba(186, 230, 253, 0.34)',
        seyesSub: 'rgba(125, 211, 252, 0.14)',
        marginLine: 'rgba(251, 146, 60, 0.52)',
        dotColor: 'rgba(186, 230, 253, 0.42)',
        isDark: true
      };
    }
    if (tone === 'sepia') {
      return {
        bg: '#f5eedc',
        gridLine: 'rgba(120, 83, 45, 0.15)',
        subGridLine: 'rgba(120, 83, 45, 0.07)',
        seyesMain: 'rgba(79, 70, 229, 0.26)',
        seyesSub: 'rgba(99, 102, 241, 0.12)',
        marginLine: 'rgba(185, 28, 28, 0.36)',
        dotColor: 'rgba(120, 83, 45, 0.36)',
        isDark: false
      };
    }
    if (tone === 'white') {
      return {
        bg: '#ffffff',
        gridLine: 'rgba(37, 99, 235, 0.13)',
        subGridLine: 'rgba(37, 99, 235, 0.05)',
        seyesMain: 'rgba(67, 56, 202, 0.28)',
        seyesSub: 'rgba(59, 130, 246, 0.13)',
        marginLine: 'rgba(239, 68, 68, 0.42)',
        dotColor: 'rgba(100, 116, 139, 0.38)',
        isDark: false
      };
    }
    return {
      bg: '#fbfaf5',
      gridLine: 'rgba(71, 85, 105, 0.13)',
      subGridLine: 'rgba(71, 85, 105, 0.06)',
      seyesMain: 'rgba(67, 56, 202, 0.26)',
      seyesSub: 'rgba(59, 130, 246, 0.12)',
      marginLine: 'rgba(220, 38, 38, 0.38)',
      dotColor: 'rgba(100, 116, 139, 0.38)',
      isDark: false
    };
  }

  const GN_TEMPLATE_LOCALE_TEXT = {
    fr: {
      days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
      daysShort: ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'],
      notes: 'Notes',
      tasks: 'Tâches',
      month: 'Mois',
      ledger: ['Date', 'Libellé', 'Réf.', 'Débit', 'Crédit']
    },
    en: {
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      daysShort: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      notes: 'Notes',
      tasks: 'To-Do',
      month: 'Month',
      ledger: ['Date', 'Description', 'Ref.', 'Debit', 'Credit']
    },
    es: {
      days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
      daysShort: ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'],
      notes: 'Notas',
      tasks: 'Tareas',
      month: 'Mes',
      ledger: ['Fecha', 'Concepto', 'Ref.', 'Debe', 'Haber']
    },
    de: {
      days: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
      daysShort: ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'],
      notes: 'Notizen',
      tasks: 'Aufgaben',
      month: 'Monat',
      ledger: ['Datum', 'Beschreibung', 'Ref.', 'Soll', 'Haben']
    }
  };

  const gnCustomTemplateImageCache = new Map();
  function getCustomTemplateImage(dataUrl) {
    if (!dataUrl || typeof Image === 'undefined') return null;
    let entry = gnCustomTemplateImageCache.get(dataUrl);
    if (!entry) {
      const img = new Image();
      entry = { img, loaded: false };
      img.onload = () => {
        entry.loaded = true;
        if (typeof requestRender === 'function') requestRender();
      };
      img.src = dataUrl;
      if (gnCustomTemplateImageCache.size >= 24) {
        const firstKey = gnCustomTemplateImageCache.keys().next().value;
        gnCustomTemplateImageCache.delete(firstKey);
      }
      gnCustomTemplateImageCache.set(dataUrl, entry);
    }
    return entry.loaded ? entry.img : null;
  }

  function drawPaperBackground(targetCtx, page, viewportWidth, viewportHeight, isThumbnail = false, skipDeskFill = false) {
    const palette = getPaperPalette(page.paperTone || 'ivory');
    const baseSpacing = Math.max(14, page.gridSize || 28);
    // Adapte le pas de grille en cas de fort dézoom (ex: 13%) pour éviter l'effet de moiré/points gris et garder une grille nette
    const spacing = (!isThumbnail && baseSpacing * state.zoom < 10)
      ? baseSpacing * Math.pow(2, Math.ceil(Math.log2(10 / (baseSpacing * state.zoom))))
      : baseSpacing;
    const pbDims = getPageBounds(page);
    const pageW = pbDims.width;
    const pageH = pbDims.height;
    const isInfinite = (page.viewMode || 'infinite') === 'infinite' && !isThumbnail;
    const invZoom = isThumbnail ? 2.1 : Math.min(2.5, Math.max(0.5, 1 / state.zoom));
    const localePack = GN_TEMPLATE_LOCALE_TEXT[(page && page.templateLanguage) || 'fr'] || GN_TEMPLATE_LOCALE_TEXT.fr;
    let minX = 0, minY = 0, maxX = pageW, maxY = pageH;

    if (isInfinite) {
      // Coordonnées monde exactes des bords du canevas (indépendantes du décalage de la barre latérale)
      const tl = { x: -state.panX / state.zoom, y: -state.panY / state.zoom };
      const br = { x: (viewportWidth - state.panX) / state.zoom, y: (viewportHeight - state.panY) / state.zoom };
      const majorStep = spacing * 4;
      minX = Math.floor(tl.x / majorStep) * majorStep - majorStep;
      minY = Math.floor(tl.y / majorStep) * majorStep - majorStep;
      maxX = Math.ceil(br.x / majorStep) * majorStep + majorStep;
      maxY = Math.ceil(br.y / majorStep) * majorStep + majorStep;
      targetCtx.fillStyle = palette.bg;
      targetCtx.fillRect(minX, minY, maxX - minX, maxY - minY);
    } else {
      // Format GoodNotes / Page bornée : fond neutre constant (#e6e5e4 clair / #1d1f25 sombre)
      // qui NE change jamais lorsqu'on modifie la couleur de la feuille
      if (!isThumbnail && !skipDeskFill) {
        const tl = { x: -state.panX / state.zoom, y: -state.panY / state.zoom };
        const br = { x: (viewportWidth - state.panX) / state.zoom, y: (viewportHeight - state.panY) / state.zoom };
        targetCtx.fillStyle = getBoundedDeskBackdropColor();
        targetCtx.fillRect(tl.x - 100, tl.y - 100, (br.x - tl.x) + 200, (br.y - tl.y) + 200);
      }
      if (!isThumbnail) {
        const isAppDark = getBoundedDeskBackdropColor() === '#1d1f25';
        targetCtx.save();
        targetCtx.shadowColor = isAppDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(15, 23, 42, 0.16)';
        targetCtx.shadowBlur = 12 * invZoom;
        targetCtx.shadowOffsetX = 0;
        targetCtx.shadowOffsetY = 3 * invZoom;
        targetCtx.fillStyle = palette.bg;
        targetCtx.fillRect(0, 0, pageW, pageH);
        targetCtx.restore();
      } else {
        targetCtx.fillStyle = palette.bg;
        targetCtx.fillRect(0, 0, pageW, pageH);
      }
    }

    targetCtx.save();
    if (!isInfinite) {
      targetCtx.beginPath();
      targetCtx.rect(0, 0, pageW, pageH);
      targetCtx.clip();
    }

    const paperType = page.paperType || 'grid';
    const strongLine = palette.isDark ? 'rgba(226, 232, 240, 0.34)' : 'rgba(51, 65, 85, 0.34)';
    const labelColor = palette.isDark ? 'rgba(226, 232, 240, 0.62)' : 'rgba(71, 85, 105, 0.68)';

    if (paperType.startsWith('custom:') && page.customTemplateDataUrl) {
      const customImg = getCustomTemplateImage(page.customTemplateDataUrl);
      if (customImg) {
        targetCtx.drawImage(customImg, 0, 0, pageW, pageH);
      }
    } else if (paperType === 'grid') {
      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      for (let x = minX; x <= maxX; x += spacing) { targetCtx.moveTo(x, minY); targetCtx.lineTo(x, maxY); }
      for (let y = minY; y <= maxY; y += spacing) { targetCtx.moveTo(minX, y); targetCtx.lineTo(maxX, y); }
      targetCtx.stroke();
    } else if (paperType === 'seyes') {
      // Grands carreaux Seyès français : carreaux principaux + 3 interlignes fins + marge rouge
      const mainStep = spacing * 1.25;
      const subStep = mainStep / 4;
      const startX = Math.floor(minX / mainStep) * mainStep;
      const startY = Math.floor(minY / mainStep) * mainStep;

      if (state.zoom > 0.35 || isThumbnail) {
        targetCtx.lineWidth = 0.8 * invZoom;
        targetCtx.strokeStyle = palette.seyesSub;
        targetCtx.beginPath();
        for (let y = startY; y <= maxY; y += mainStep) {
          for (let s = 1; s <= 3; s++) {
            const sy = y + s * subStep;
            targetCtx.moveTo(minX, sy);
            targetCtx.lineTo(maxX, sy);
          }
        }
        targetCtx.stroke();
      }

      targetCtx.lineWidth = 1.2 * invZoom;
      targetCtx.strokeStyle = palette.seyesMain;
      targetCtx.beginPath();
      for (let x = startX; x <= maxX; x += mainStep) { targetCtx.moveTo(x, minY); targetCtx.lineTo(x, maxY); }
      for (let y = startY; y <= maxY; y += mainStep) { targetCtx.moveTo(minX, y); targetCtx.lineTo(maxX, y); }
      targetCtx.stroke();

      targetCtx.strokeStyle = palette.marginLine;
      targetCtx.lineWidth = 1.6 * invZoom;
      targetCtx.beginPath();
      targetCtx.moveTo(Math.round(pageW * 0.13), minY);
      targetCtx.lineTo(Math.round(pageW * 0.13), maxY);
      targetCtx.stroke();
    } else if (paperType === 'engineering') {
      // Papier millimétré ingénieur
      const sub = spacing / 4;
      if (state.zoom > 0.42 && !isThumbnail) {
        targetCtx.lineWidth = 0.65 * invZoom;
        targetCtx.strokeStyle = palette.subGridLine;
        targetCtx.beginPath();
        for (let x = minX; x <= maxX; x += sub) { targetCtx.moveTo(x, minY); targetCtx.lineTo(x, maxY); }
        for (let y = minY; y <= maxY; y += sub) { targetCtx.moveTo(minX, y); targetCtx.lineTo(maxX, y); }
        targetCtx.stroke();
      }
      targetCtx.lineWidth = 1.25 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      for (let x = minX; x <= maxX; x += spacing) { targetCtx.moveTo(x, minY); targetCtx.lineTo(x, maxY); }
      for (let y = minY; y <= maxY; y += spacing) { targetCtx.moveTo(minX, y); targetCtx.lineTo(maxX, y); }
      targetCtx.stroke();
    } else if (paperType === 'isometric') {
      // Grille isométrique 3D (lignes verticales + diagonales à ±30°)
      const step = spacing * 1.15;
      const tan30 = Math.tan(Math.PI / 6);
      targetCtx.lineWidth = 0.9 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      for (let x = minX; x <= maxX; x += step) {
        targetCtx.moveTo(x, minY);
        targetCtx.lineTo(x, maxY);
      }
      const diagHeight = (maxX - minX) * tan30;
      const yStep = step * tan30 * 2;
      for (let y = minY - diagHeight; y <= maxY + diagHeight; y += yStep) {
        targetCtx.moveTo(minX, y);
        targetCtx.lineTo(maxX, y + diagHeight);
        targetCtx.moveTo(minX, y + diagHeight);
        targetCtx.lineTo(maxX, y);
      }
      targetCtx.stroke();
    } else if (paperType === 'ruled-narrow') {
      // GoodNotes : Interligne étroit (sans marge rouge)
      const narrowStep = Math.max(12, Math.round(spacing * 0.72));
      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      const startY = isInfinite ? minY : Math.round(pageH * 0.055);
      for (let y = startY; y <= maxY; y += narrowStep) {
        targetCtx.moveTo(minX, y);
        targetCtx.lineTo(maxX, y);
      }
      targetCtx.stroke();
    } else if (paperType === 'lined') {
      // GoodNotes : Interligne large (lignes horizontales propres)
      const wideStep = Math.round(spacing * 1.18);
      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      const startY = isInfinite ? minY : Math.round(pageH * 0.06);
      for (let y = startY; y <= maxY; y += wideStep) {
        targetCtx.moveTo(minX, y);
        targetCtx.lineTo(maxX, y);
      }
      targetCtx.stroke();
    } else if (paperType === 'legal') {
      // GoodNotes : Legal (marge rouge verticale gauche + lignes horizontales)
      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      const startY = isInfinite ? minY : Math.round(pageH * 0.06);
      for (let y = startY; y <= maxY; y += spacing) {
        targetCtx.moveTo(minX, y);
        targetCtx.lineTo(maxX, y);
      }
      targetCtx.stroke();
      const marginX = Math.round(pageW * 0.13);
      targetCtx.strokeStyle = palette.marginLine;
      targetCtx.lineWidth = 1.5 * invZoom;
      targetCtx.beginPath();
      targetCtx.moveTo(marginX, minY);
      targetCtx.lineTo(marginX, maxY);
      targetCtx.moveTo(marginX + 4, minY);
      targetCtx.lineTo(marginX + 4, maxY);
      targetCtx.stroke();
    } else if (paperType === 'dotted') {
      targetCtx.fillStyle = palette.dotColor;
      const r = 1.35 * invZoom;
      const screenRadius = r * (isThumbnail ? 1 : state.zoom);
      if (screenRadius <= 1.8) {
        const d = r * 2;
        for (let x = minX; x <= maxX; x += spacing) {
          for (let y = minY; y <= maxY; y += spacing) {
            targetCtx.fillRect(x - r, y - r, d, d);
          }
        }
      } else {
        targetCtx.beginPath();
        for (let x = minX; x <= maxX; x += spacing) {
          for (let y = minY; y <= maxY; y += spacing) {
            targetCtx.moveTo(x + r, y);
            targetCtx.arc(x, y, r, 0, Math.PI * 2);
          }
        }
        targetCtx.fill();
      }
    } else if (paperType === 'cornell') {
      // Notes Cornell GoodNotes : en-tête + colonne indices à gauche + zone notes lignée + résumé en bas
      const headerY = Math.round(pageH * 0.12);
      const cueX = Math.round(pageW * 0.27);
      const summaryY = Math.round(pageH * 0.84);
      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      const startY = isInfinite ? Math.max(headerY, minY) : headerY + spacing;
      for (let y = startY; y <= maxY; y += spacing) {
        if (!isInfinite && y >= summaryY) break;
        targetCtx.moveTo(Math.max(cueX, minX), y);
        targetCtx.lineTo(maxX, y);
      }
      targetCtx.stroke();
      targetCtx.strokeStyle = strongLine;
      targetCtx.lineWidth = 1.5 * invZoom;
      targetCtx.beginPath();
      targetCtx.moveTo(minX, headerY);
      targetCtx.lineTo(maxX, headerY);
      targetCtx.moveTo(cueX, headerY);
      targetCtx.lineTo(cueX, isInfinite ? maxY : summaryY);
      targetCtx.moveTo(minX, summaryY);
      targetCtx.lineTo(maxX, summaryY);
      targetCtx.stroke();
    } else if (paperType === 'single-column') {
      // GoodNotes : Une colonne (marges propres + en-tête + lignes horizontales encadrées)
      const padX = Math.round(pageW * 0.08);
      const headerY = Math.round(pageH * 0.085);
      const bottomY = Math.round(pageH * 0.94);
      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      for (let y = headerY + spacing; y <= (isInfinite ? maxY : bottomY); y += spacing) {
        targetCtx.moveTo(padX, y);
        targetCtx.lineTo(pageW - padX, y);
      }
      targetCtx.stroke();
      targetCtx.strokeStyle = strongLine;
      targetCtx.lineWidth = 1.4 * invZoom;
      targetCtx.beginPath();
      targetCtx.moveTo(padX, headerY);
      targetCtx.lineTo(pageW - padX, headerY);
      targetCtx.stroke();
    } else if (paperType === 'single-column-mix') {
      // GoodNotes : Une colonne, mélange (zone blanche croquis en haut + zone lignée en bas)
      const padX = Math.round(pageW * 0.08);
      const topY = Math.round(pageH * 0.08);
      const splitY = Math.round(pageH * 0.48);
      const bottomY = Math.round(pageH * 0.94);
      targetCtx.strokeStyle = strongLine;
      targetCtx.lineWidth = 1.3 * invZoom;
      targetCtx.beginPath();
      targetCtx.moveTo(padX, topY);
      targetCtx.lineTo(pageW - padX, topY);
      targetCtx.moveTo(padX, splitY);
      targetCtx.lineTo(pageW - padX, splitY);
      targetCtx.stroke();
      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      for (let y = splitY + spacing; y <= (isInfinite ? maxY : bottomY); y += spacing) {
        targetCtx.moveTo(padX, y);
        targetCtx.lineTo(pageW - padX, y);
      }
      targetCtx.stroke();
    } else if (paperType === 'twocolumn' || paperType === 'two-column-left' || paperType === 'two-column-right') {
      // GoodNotes : Deux colonnes (50/50, gauche 34/66, droite 66/34) avec gouttière centrale nette
      const padX = Math.round(pageW * 0.07);
      const headerY = Math.round(pageH * 0.085);
      const bottomY = Math.round(pageH * 0.94);
      const gutter = Math.round(pageW * 0.036);
      const ratio = paperType === 'two-column-left' ? 0.34 : (paperType === 'two-column-right' ? 0.66 : 0.5);
      const splitX = padX + Math.round((pageW - padX * 2) * ratio);
      const leftEnd = splitX - Math.round(gutter * 0.5);
      const rightStart = splitX + Math.round(gutter * 0.5);

      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      for (let y = headerY + spacing; y <= (isInfinite ? maxY : bottomY); y += spacing) {
        targetCtx.moveTo(padX, y);
        targetCtx.lineTo(leftEnd, y);
        targetCtx.moveTo(rightStart, y);
        targetCtx.lineTo(pageW - padX, y);
      }
      targetCtx.stroke();
      targetCtx.strokeStyle = strongLine;
      targetCtx.lineWidth = 1.4 * invZoom;
      targetCtx.beginPath();
      targetCtx.moveTo(padX, headerY);
      targetCtx.lineTo(pageW - padX, headerY);
      targetCtx.moveTo(splitX, headerY);
      targetCtx.lineTo(splitX, isInfinite ? maxY : bottomY);
      targetCtx.stroke();
    } else if (paperType === 'three-column') {
      // GoodNotes : Trois colonnes équilibrées avec gouttières
      const padX = Math.round(pageW * 0.06);
      const headerY = Math.round(pageH * 0.085);
      const bottomY = Math.round(pageH * 0.94);
      const gutter = Math.round(pageW * 0.026);
      const usableW = pageW - padX * 2 - gutter * 2;
      const colW = usableW / 3;
      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      for (let y = headerY + spacing; y <= (isInfinite ? maxY : bottomY); y += spacing) {
        for (let c = 0; c < 3; c++) {
          const cx = padX + c * (colW + gutter);
          targetCtx.moveTo(cx, y);
          targetCtx.lineTo(cx + colW, y);
        }
      }
      targetCtx.stroke();
      targetCtx.strokeStyle = strongLine;
      targetCtx.lineWidth = 1.3 * invZoom;
      targetCtx.beginPath();
      targetCtx.moveTo(padX, headerY);
      targetCtx.lineTo(pageW - padX, headerY);
      for (let c = 1; c < 3; c++) {
        const gx = padX + c * colW + (c - 0.5) * gutter;
        targetCtx.moveTo(gx, headerY);
        targetCtx.lineTo(gx, isInfinite ? maxY : bottomY);
      }
      targetCtx.stroke();
    } else if (paperType === 'todos') {
      // GoodNotes : Listes de tâches (cases à cocher + lignes horizontales)
      const padX = Math.round(pageW * 0.08);
      const headerY = Math.round(pageH * 0.095);
      const bottomY = Math.round(pageH * 0.94);
      const rowStep = Math.round(spacing * 1.25);
      const boxSz = Math.max(10, Math.round(rowStep * 0.46));

      targetCtx.strokeStyle = strongLine;
      targetCtx.lineWidth = 1.5 * invZoom;
      targetCtx.beginPath();
      targetCtx.moveTo(padX, headerY);
      targetCtx.lineTo(pageW - padX, headerY);
      targetCtx.stroke();

      if (!isThumbnail) {
        targetCtx.fillStyle = labelColor;
        targetCtx.font = `600 ${Math.max(13, Math.round(pageW * 0.024))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        targetCtx.fillText(localePack.tasks, padX, headerY - 12);
      }

      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      for (let y = headerY + rowStep; y <= (isInfinite ? maxY : bottomY); y += rowStep) {
        targetCtx.rect(padX, y - boxSz - 2, boxSz, boxSz);
        targetCtx.moveTo(padX + boxSz + 12, y);
        targetCtx.lineTo(pageW - padX, y);
      }
      targetCtx.stroke();
    } else if (paperType === 'planner') {
      // GoodNotes : Semainier A (7 bandes de jours localisées + colonne notes lignée à droite)
      const padX = Math.round(pageW * 0.06);
      const headerY = Math.round(pageH * 0.08);
      const bottomY = Math.round(pageH * 0.95);
      const splitX = Math.round(pageW * 0.62);
      const rowH = (bottomY - headerY) / 7;

      targetCtx.lineWidth = 1.2 * invZoom;
      targetCtx.strokeStyle = strongLine;
      targetCtx.beginPath();
      targetCtx.moveTo(padX, headerY);
      targetCtx.lineTo(pageW - padX, headerY);
      targetCtx.moveTo(splitX, headerY);
      targetCtx.lineTo(splitX, bottomY);
      for (let d = 1; d <= 7; d++) {
        const ry = headerY + d * rowH;
        targetCtx.moveTo(padX, ry);
        targetCtx.lineTo(splitX, ry);
      }
      targetCtx.stroke();

      if (!isThumbnail) {
        targetCtx.fillStyle = labelColor;
        const fSize = Math.max(11, Math.round(pageW * 0.015));
        targetCtx.font = `600 ${fSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        for (let d = 0; d < 7; d++) {
          targetCtx.fillText(localePack.days[d], padX + 8, headerY + d * rowH + fSize + 8);
        }
        targetCtx.fillText(localePack.notes, splitX + 12, headerY - 10);
      }

      targetCtx.lineWidth = 0.85 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      for (let y = headerY + spacing; y <= bottomY; y += spacing) {
        targetCtx.moveTo(splitX + 8, y);
        targetCtx.lineTo(pageW - padX, y);
      }
      targetCtx.stroke();
    } else if (paperType === 'weekly-planner-b') {
      // GoodNotes : Semainier B (grille 2×4 : 7 jours + bloc Notes)
      const padX = Math.round(pageW * 0.06);
      const headerY = Math.round(pageH * 0.08);
      const bottomY = Math.round(pageH * 0.94);
      const gap = Math.round(pageW * 0.025);
      const colW = (pageW - padX * 2 - gap) / 2;
      const rowH = (bottomY - headerY - gap * 3) / 4;
      const labels = [...localePack.days, localePack.notes];
      const fSize = Math.max(11, Math.round(pageW * 0.015));

      targetCtx.lineWidth = 1.15 * invZoom;
      targetCtx.strokeStyle = strongLine;
      for (let idx = 0; idx < 8; idx++) {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const bx = padX + col * (colW + gap);
        const by = headerY + row * (rowH + gap);
        targetCtx.strokeRect(bx, by, colW, rowH);
        targetCtx.beginPath();
        targetCtx.moveTo(bx, by + fSize + 14);
        targetCtx.lineTo(bx + colW, by + fSize + 14);
        targetCtx.stroke();
        if (!isThumbnail) {
          targetCtx.fillStyle = labelColor;
          targetCtx.font = `600 ${fSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          targetCtx.fillText(labels[idx], bx + 10, by + fSize + 4);
        }
      }
    } else if (paperType === 'monthly-planner-b' || paperType === 'monthly-planner-c') {
      // GoodNotes : Planning mensuel B (grille 7×5) et C (grille 7×5 + zone notes en bas)
      const padX = Math.round(pageW * 0.055);
      const headerY = Math.round(pageH * 0.11);
      const calBottomY = paperType === 'monthly-planner-c' ? Math.round(pageH * 0.72) : Math.round(pageH * 0.94);
      const colW = (pageW - padX * 2) / 7;
      const rowH = (calBottomY - headerY) / 5;
      const fSize = Math.max(10, Math.round(pageW * 0.014));

      if (!isThumbnail) {
        targetCtx.fillStyle = labelColor;
        targetCtx.font = `700 ${Math.max(14, Math.round(pageW * 0.022))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        targetCtx.fillText(localePack.month, padX, Math.round(headerY * 0.58));
        targetCtx.font = `600 ${fSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        for (let c = 0; c < 7; c++) {
          targetCtx.fillText(localePack.daysShort[c], padX + c * colW + 6, headerY - 8);
        }
      }

      targetCtx.lineWidth = 1.1 * invZoom;
      targetCtx.strokeStyle = strongLine;
      targetCtx.beginPath();
      for (let c = 0; c <= 7; c++) {
        const x = padX + c * colW;
        targetCtx.moveTo(x, headerY);
        targetCtx.lineTo(x, calBottomY);
      }
      for (let r = 0; r <= 5; r++) {
        const y = headerY + r * rowH;
        targetCtx.moveTo(padX, y);
        targetCtx.lineTo(pageW - padX, y);
      }
      targetCtx.stroke();

      if (paperType === 'monthly-planner-c') {
        const notesStartY = calBottomY + Math.round(pageH * 0.04);
        const bottomY = Math.round(pageH * 0.94);
        if (!isThumbnail) {
          targetCtx.fillStyle = labelColor;
          targetCtx.font = `600 ${fSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          targetCtx.fillText(localePack.notes, padX, notesStartY - 6);
        }
        targetCtx.lineWidth = 0.95 * invZoom;
        targetCtx.strokeStyle = palette.gridLine;
        targetCtx.beginPath();
        for (let y = notesStartY + spacing; y <= bottomY; y += spacing) {
          targetCtx.moveTo(padX, y);
          targetCtx.lineTo(pageW - padX, y);
        }
        targetCtx.stroke();
      }
    } else if (paperType === 'accounting') {
      // GoodNotes : Comptabilité (colonnes Date | Libellé | Réf. | Débit | Crédit)
      const padX = Math.round(pageW * 0.055);
      const headerY = Math.round(pageH * 0.095);
      const bottomY = Math.round(pageH * 0.94);
      const usableW = pageW - padX * 2;
      const colStops = [0, 0.14, 0.56, 0.66, 0.83, 1.0].map((r) => padX + Math.round(usableW * r));

      targetCtx.lineWidth = 0.9 * invZoom;
      targetCtx.strokeStyle = palette.gridLine;
      targetCtx.beginPath();
      for (let y = headerY + spacing; y <= (isInfinite ? maxY : bottomY); y += spacing) {
        targetCtx.moveTo(padX, y);
        targetCtx.lineTo(pageW - padX, y);
      }
      targetCtx.stroke();

      targetCtx.lineWidth = 1.3 * invZoom;
      targetCtx.strokeStyle = strongLine;
      targetCtx.beginPath();
      targetCtx.moveTo(padX, headerY);
      targetCtx.lineTo(pageW - padX, headerY);
      targetCtx.moveTo(padX, headerY - spacing * 1.1);
      targetCtx.lineTo(pageW - padX, headerY - spacing * 1.1);
      for (let i = 0; i < colStops.length; i++) {
        targetCtx.moveTo(colStops[i], headerY - spacing * 1.1);
        targetCtx.lineTo(colStops[i], isInfinite ? maxY : bottomY);
      }
      targetCtx.stroke();

      if (!isThumbnail) {
        targetCtx.fillStyle = labelColor;
        const fSize = Math.max(10, Math.round(pageW * 0.013));
        targetCtx.font = `600 ${fSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        for (let i = 0; i < localePack.ledger.length; i++) {
          targetCtx.fillText(localePack.ledger[i], colStops[i] + 6, headerY - 8);
        }
      }
    } else if (paperType === 'music') {
      // GoodNotes : Papier à musique (portées de 5 lignes)
      const padX = isInfinite ? minX : Math.round(pageW * 0.07);
      const endX = isInfinite ? maxX : (pageW - Math.round(pageW * 0.07));
      const staffGap = spacing * 3.4;
      const lineGap = Math.max(6, Math.round(spacing * 0.34));
      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = strongLine;
      targetCtx.beginPath();
      const firstStaffY = isInfinite ? Math.floor(minY / staffGap) * staffGap : Math.round(pageH * 0.08);
      for (let sy = firstStaffY; sy <= (isInfinite ? maxY : pageH * 0.93); sy += staffGap) {
        for (let l = 0; l < 5; l++) {
          const ly = sy + l * lineGap;
          targetCtx.moveTo(padX, ly);
          targetCtx.lineTo(endX, ly);
        }
      }
      targetCtx.stroke();
    } else if (paperType === 'guitar-tablature') {
      // GoodNotes : Tablature de guitare (6 cordes)
      const padX = isInfinite ? minX : Math.round(pageW * 0.07);
      const endX = isInfinite ? maxX : (pageW - Math.round(pageW * 0.07));
      const staffGap = spacing * 3.8;
      const lineGap = Math.max(6, Math.round(spacing * 0.36));
      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = strongLine;
      targetCtx.beginPath();
      const firstStaffY = isInfinite ? Math.floor(minY / staffGap) * staffGap : Math.round(pageH * 0.08);
      for (let sy = firstStaffY; sy <= (isInfinite ? maxY : pageH * 0.93); sy += staffGap) {
        for (let l = 0; l < 6; l++) {
          const ly = sy + l * lineGap;
          targetCtx.moveTo(padX, ly);
          targetCtx.lineTo(endX, ly);
        }
        if (!isInfinite) {
          targetCtx.moveTo(padX, sy);
          targetCtx.lineTo(padX, sy + 5 * lineGap);
          targetCtx.moveTo(endX, sy);
          targetCtx.lineTo(endX, sy + 5 * lineGap);
        }
      }
      targetCtx.stroke();
    } else if (paperType === 'guitar-score') {
      // GoodNotes : Partition de guitare (portée 5 lignes + tablature 6 cordes couplées)
      const padX = isInfinite ? minX : Math.round(pageW * 0.07);
      const endX = isInfinite ? maxX : (pageW - Math.round(pageW * 0.07));
      const lineGap = Math.max(5.5, Math.round(spacing * 0.30));
      const pairGap = lineGap * 16;
      targetCtx.lineWidth = 1 * invZoom;
      targetCtx.strokeStyle = strongLine;
      targetCtx.beginPath();
      const firstY = isInfinite ? Math.floor(minY / pairGap) * pairGap : Math.round(pageH * 0.075);
      for (let sy = firstY; sy <= (isInfinite ? maxY : pageH * 0.90); sy += pairGap) {
        for (let l = 0; l < 5; l++) {
          const ly = sy + l * lineGap;
          targetCtx.moveTo(padX, ly);
          targetCtx.lineTo(endX, ly);
        }
        const tabY = sy + lineGap * 6.4;
        for (let l = 0; l < 6; l++) {
          const ly = tabY + l * lineGap;
          targetCtx.moveTo(padX, ly);
          targetCtx.lineTo(endX, ly);
        }
        if (!isInfinite) {
          targetCtx.moveTo(padX, sy);
          targetCtx.lineTo(padX, tabY + 5 * lineGap);
          targetCtx.moveTo(endX, sy);
          targetCtx.lineTo(endX, tabY + 5 * lineGap);
        }
      }
      targetCtx.stroke();
    }

    // Bordure nette autour de la feuille en format A4 / page bornée (jamais en mode Page Infinie)
    if (!isInfinite) {
      targetCtx.restore();
      const isAppDark = getBoundedDeskBackdropColor() === '#1d1f25';
      targetCtx.save();
      targetCtx.strokeStyle = isThumbnail
        ? 'rgba(100, 116, 139, 0.25)'
        : (isAppDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(15, 23, 42, 0.10)');
      targetCtx.lineWidth = isThumbnail ? 1 : invZoom;
      targetCtx.strokeRect(0, 0, pageW, pageH);
      targetCtx.restore();
    } else {
      targetCtx.restore();
    }
  }

  function getShapeVertices(sh) {
    if (Array.isArray(sh.vertices) && sh.vertices.length >= 2) return sh.vertices;
    if (sh.type === 'triangle') {
      return [
        { x: (sh.x1 + sh.x2) * 0.5, y: sh.y1 },
        { x: sh.x2, y: sh.y2 },
        { x: sh.x1, y: sh.y2 }
      ];
    }
    if (sh.type === 'diamond') {
      const cx = (sh.x1 + sh.x2) * 0.5, cy = (sh.y1 + sh.y2) * 0.5;
      return [
        { x: cx, y: Math.min(sh.y1, sh.y2) },
        { x: Math.max(sh.x1, sh.x2), y: cy },
        { x: cx, y: Math.max(sh.y1, sh.y2) },
        { x: Math.min(sh.x1, sh.x2), y: cy }
      ];
    }
    return null;
  }

  function getShapeBoundingBox(sh) {
    if (Array.isArray(sh.vertices) && sh.vertices.length >= 2) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const v of sh.vertices) {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
      }
      return { minX, minY, maxX, maxY };
    }
    if (sh.angle && (sh.type === 'rect' || sh.type === 'ellipse')) {
      const cx = (sh.x1 + sh.x2) * 0.5;
      const cy = (sh.y1 + sh.y2) * 0.5;
      const hw = Math.abs(sh.x2 - sh.x1) * 0.5;
      const hh = Math.abs(sh.y2 - sh.y1) * 0.5;
      const c = Math.cos(sh.angle), s = Math.sin(sh.angle);
      const ex = Math.abs(hw * c) + Math.abs(hh * s);
      const ey = Math.abs(hw * s) + Math.abs(hh * c);
      return { minX: cx - ex, minY: cy - ey, maxX: cx + ex, maxY: cy + ey };
    }
    return {
      minX: Math.min(sh.x1, sh.x2),
      minY: Math.min(sh.y1, sh.y2),
      maxX: Math.max(sh.x1, sh.x2),
      maxY: Math.max(sh.y1, sh.y2)
    };
  }

  function isPointNearShape(sh, wx, wy, radius) {
    const thr = radius + (sh.size || 3) * 0.5;
    if (sh.type === 'line' || sh.type === 'arrow') {
      return pointToSegmentDist({ x: wx, y: wy }, { x: sh.x1, y: sh.y1 }, { x: sh.x2, y: sh.y2 }) <= thr;
    }
    if (sh.type === 'triangle' || sh.type === 'polygon') {
      const verts = getShapeVertices(sh);
      if (!verts || verts.length < 3) return false;
      for (let i = 0; i < verts.length; i++) {
        if (pointToSegmentDist({ x: wx, y: wy }, verts[i], verts[(i + 1) % verts.length]) <= thr) return true;
      }
      return Boolean(sh.filled && pointInPolygon(wx, wy, verts));
    }
    if (sh.type === 'polyline') {
      const verts = getShapeVertices(sh);
      if (!verts || verts.length < 2) return false;
      for (let i = 1; i < verts.length; i++) {
        if (pointToSegmentDist({ x: wx, y: wy }, verts[i - 1], verts[i]) <= thr) return true;
      }
      return false;
    }
    if (sh.type === 'arc') {
      const verts = getShapeVertices(sh);
      if (!verts || verts.length < 4) return false;
      const pt = { x: wx, y: wy };
      let prev = verts[0];
      const steps = 16;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const mt = 1 - t;
        const cur = {
          x: mt * mt * mt * verts[0].x + 3 * mt * mt * t * verts[1].x + 3 * mt * t * t * verts[2].x + t * t * t * verts[3].x,
          y: mt * mt * mt * verts[0].y + 3 * mt * mt * t * verts[1].y + 3 * mt * t * t * verts[2].y + t * t * t * verts[3].y
        };
        if (pointToSegmentDist(pt, prev, cur) <= thr) return true;
        prev = cur;
      }
      return false;
    }
    const cx = (sh.x1 + sh.x2) * 0.5;
    const cy = (sh.y1 + sh.y2) * 0.5;
    const hw = Math.max(1, Math.abs(sh.x2 - sh.x1) * 0.5);
    const hh = Math.max(1, Math.abs(sh.y2 - sh.y1) * 0.5);
    const ang = sh.angle || 0;
    const cosA = Math.cos(-ang), sinA = Math.sin(-ang);
    const dx = wx - cx, dy = wy - cy;
    const lx = dx * cosA - dy * sinA;
    const ly = dx * sinA + dy * cosA;
    if (sh.type === 'rect' || sh.type === 'roundedRect') {
      if (Math.abs(lx) <= hw + thr && Math.abs(ly) <= hh + thr) {
        if (sh.filled) return true;
        return Math.abs(Math.abs(lx) - hw) <= thr || Math.abs(Math.abs(ly) - hh) <= thr;
      }
      return false;
    }
    if (sh.type === 'diamond') {
      const verts = getShapeVertices(sh);
      for (let i = 0; i < verts.length; i++) {
        if (pointToSegmentDist({ x: wx, y: wy }, verts[i], verts[(i + 1) % verts.length]) <= thr) return true;
      }
      return Boolean(sh.filled && pointInPolygon(wx, wy, verts));
    }
    if (sh.type === 'elbowArrow') {
      const midY = (sh.y1 + sh.y2) * 0.5;
      const p0 = { x: sh.x1, y: sh.y1 };
      const p1 = { x: sh.x1, y: midY };
      const p2 = { x: sh.x2, y: midY };
      const p3 = { x: sh.x2, y: sh.y2 };
      const pt = { x: wx, y: wy };
      return pointToSegmentDist(pt, p0, p1) <= thr ||
        pointToSegmentDist(pt, p1, p2) <= thr ||
        pointToSegmentDist(pt, p2, p3) <= thr;
    }
    if (sh.type === 'curvedArrow') {
      const dy = sh.y2 - sh.y1;
      const cp1x = sh.x1, cp1y = sh.y1 + dy * 0.65;
      const cp2x = sh.x2, cp2y = sh.y2 - dy * 0.65;
      const pt = { x: wx, y: wy };
      let prev = { x: sh.x1, y: sh.y1 };
      const steps = 14;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const mt = 1 - t;
        const cur = {
          x: mt * mt * mt * sh.x1 + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * sh.x2,
          y: mt * mt * mt * sh.y1 + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * sh.y2
        };
        if (pointToSegmentDist(pt, prev, cur) <= thr) return true;
        prev = cur;
      }
      return false;
    }
    if (sh.type === 'ellipse') {
      const norm = Math.hypot(lx / hw, ly / hh);
      if (sh.filled && norm <= 1) return true;
      const radialApproxDist = Math.abs(norm - 1) * Math.min(hw, hh);
      return radialApproxDist <= thr * 1.15;
    }
    return false;
  }

  function drawShapeArrowhead(targetCtx, tipX, tipY, angleRad, style, strokeSize, color) {
    if (!style || style === 'none') return;
    const headLen = Math.max(12, Math.min(30, (strokeSize || 3) * 3.8));
    const spread = Math.PI / 6;
    const xA = tipX - headLen * Math.cos(angleRad - spread);
    const yA = tipY - headLen * Math.sin(angleRad - spread);
    const xB = tipX - headLen * Math.cos(angleRad + spread);
    const yB = tipY - headLen * Math.sin(angleRad + spread);
    targetCtx.save();
    if (typeof targetCtx.setLineDash === 'function') targetCtx.setLineDash([]);
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    if (style === 'filled') {
      targetCtx.fillStyle = color || '#1e293b';
      targetCtx.beginPath();
      targetCtx.moveTo(tipX, tipY);
      targetCtx.lineTo(xA, yA);
      targetCtx.lineTo(xB, yB);
      targetCtx.closePath();
      targetCtx.fill();
    } else {
      targetCtx.strokeStyle = color || '#1e293b';
      targetCtx.lineWidth = strokeSize || 3;
      targetCtx.beginPath();
      targetCtx.moveTo(xA, yA);
      targetCtx.lineTo(tipX, tipY);
      targetCtx.lineTo(xB, yB);
      targetCtx.stroke();
    }
    targetCtx.restore();
  }

  function tracePolygonPath(targetCtx, verts, rounded = true, close = true) {
    if (!verts || verts.length < 2) return;
    if (!rounded || verts.length < 3 || typeof targetCtx.arcTo !== 'function') {
      targetCtx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) targetCtx.lineTo(verts[i].x, verts[i].y);
      if (close) targetCtx.closePath();
      return;
    }
    const n = verts.length;
    if (close) {
      let minEdge = Infinity;
      for (let i = 0; i < n; i++) {
        const a = verts[i], b = verts[(i + 1) % n];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d < minEdge) minEdge = d;
      }
      const rad = Math.max(0, Math.min(12, minEdge * 0.16));
      if (rad < 1) {
        targetCtx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < n; i++) targetCtx.lineTo(verts[i].x, verts[i].y);
        targetCtx.closePath();
        return;
      }
      const startMidX = (verts[n - 1].x + verts[0].x) * 0.5;
      const startMidY = (verts[n - 1].y + verts[0].y) * 0.5;
      targetCtx.moveTo(startMidX, startMidY);
      for (let i = 0; i < n; i++) {
        const curr = verts[i];
        const next = verts[(i + 1) % n];
        targetCtx.arcTo(curr.x, curr.y, next.x, next.y, rad);
      }
      targetCtx.closePath();
    } else {
      targetCtx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < n - 1; i++) {
        const prev = verts[i - 1], curr = verts[i], next = verts[i + 1];
        const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
        const rad = Math.min(10, d1 * 0.2, d2 * 0.2);
        if (rad >= 1) targetCtx.arcTo(curr.x, curr.y, next.x, next.y, rad);
        else targetCtx.lineTo(curr.x, curr.y);
      }
      targetCtx.lineTo(verts[n - 1].x, verts[n - 1].y);
    }
  }

  function drawGeometricShape(targetCtx, shape, isSelected = false, isPaperDark = false) {
    targetCtx.save();
    if (shape.isHighlighter) {
      targetCtx.globalAlpha = 0.36;
      targetCtx.globalCompositeOperation = isPaperDark ? 'screen' : 'multiply';
    }
    const strokeCol = shape.color || '#1e293b';
    const strokeSz = shape.size || 3;
    const shapeLineStyle = shape.lineStyle || 'solid';
    const isRounded = shape.roundedCorners !== false;
    const startArrow = shape.startArrow || 'none';
    const endArrow = shape.endArrow || 'none';

    targetCtx.strokeStyle = strokeCol;
    targetCtx.lineWidth = strokeSz;
    targetCtx.lineCap = (isRounded || shapeLineStyle === 'dotted') ? 'round' : 'butt';
    targetCtx.lineJoin = isRounded ? 'round' : 'miter';
    if (typeof targetCtx.setLineDash === 'function') {
      targetCtx.setLineDash(getStrokeLineDash(shapeLineStyle, strokeSz));
    }

    const { type, x1, y1, x2, y2, filled, angle } = shape;
    if (filled) targetCtx.fillStyle = hexToRgba(shape.color || '#1d4ed8', 0.12);

    targetCtx.beginPath();
    if (type === 'line') {
      targetCtx.moveTo(x1, y1); targetCtx.lineTo(x2, y2); targetCtx.stroke();
      const ang = Math.atan2(y2 - y1, x2 - x1);
      if (startArrow !== 'none') drawShapeArrowhead(targetCtx, x1, y1, ang + Math.PI, startArrow, strokeSz, strokeCol);
      if (endArrow !== 'none') drawShapeArrowhead(targetCtx, x2, y2, ang, endArrow, strokeSz, strokeCol);
    } else if (type === 'arrow') {
      targetCtx.moveTo(x1, y1); targetCtx.lineTo(x2, y2); targetCtx.stroke();
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const effEnd = (endArrow !== 'none' || startArrow !== 'none') ? endArrow : 'open';
      if (startArrow !== 'none') drawShapeArrowhead(targetCtx, x1, y1, ang + Math.PI, startArrow, strokeSz, strokeCol);
      if (effEnd !== 'none') drawShapeArrowhead(targetCtx, x2, y2, ang, effEnd, strokeSz, strokeCol);
    } else if (type === 'rect') {
      const cx = (x1 + x2) * 0.5, cy = (y1 + y2) * 0.5;
      const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
      const cornerR = isRounded ? Math.min(10, Math.min(rw, rh) * 0.16) : 0;
      targetCtx.save();
      targetCtx.translate(cx, cy);
      if (angle) targetCtx.rotate(angle);
      targetCtx.beginPath();
      if (cornerR > 0 && targetCtx.roundRect) targetCtx.roundRect(-rw * 0.5, -rh * 0.5, rw, rh, cornerR);
      else targetCtx.rect(-rw * 0.5, -rh * 0.5, rw, rh);
      if (filled) targetCtx.fill();
      targetCtx.stroke();
      targetCtx.restore();
    } else if (type === 'ellipse') {
      targetCtx.ellipse((x1 + x2) * 0.5, (y1 + y2) * 0.5, Math.max(1, Math.abs(x2 - x1) * 0.5), Math.max(1, Math.abs(y2 - y1) * 0.5), angle || 0, 0, Math.PI * 2);
      if (filled) targetCtx.fill();
      targetCtx.stroke();
    } else if (type === 'elbowArrow') {
      const midY = (y1 + y2) * 0.5;
      const dotR = Math.max(3, strokeSz * 0.95);
      const startAng = y2 >= y1 ? -Math.PI / 2 : Math.PI / 2;
      if (startArrow === 'none') {
        targetCtx.save();
        if (typeof targetCtx.setLineDash === 'function') targetCtx.setLineDash([]);
        targetCtx.beginPath();
        targetCtx.arc(x1, y1, dotR, 0, Math.PI * 2);
        targetCtx.stroke();
        targetCtx.restore();
      }
      const startY = startArrow === 'none' ? y1 + (y2 >= y1 ? dotR : -dotR) : y1;
      targetCtx.beginPath();
      tracePolygonPath(targetCtx, [
        { x: x1, y: startY },
        { x: x1, y: midY },
        { x: x2, y: midY },
        { x: x2, y: y2 }
      ], isRounded, false);
      targetCtx.stroke();
      const ang = y2 >= midY ? Math.PI / 2 : -Math.PI / 2;
      const effEnd = endArrow !== 'none' ? endArrow : 'open';
      if (startArrow !== 'none') drawShapeArrowhead(targetCtx, x1, y1, startAng, startArrow, strokeSz, strokeCol);
      drawShapeArrowhead(targetCtx, x2, y2, ang, effEnd, strokeSz, strokeCol);
    } else if (type === 'curvedArrow') {
      const dx = x2 - x1, dy = y2 - y1;
      const dotR = Math.max(3, strokeSz * 0.95);
      const cp1x = x1, cp1y = y1 + dy * 0.65;
      const cp2x = x2, cp2y = y2 - dy * 0.65;
      if (startArrow === 'none') {
        targetCtx.save();
        if (typeof targetCtx.setLineDash === 'function') targetCtx.setLineDash([]);
        targetCtx.beginPath();
        targetCtx.arc(x1, y1, dotR, 0, Math.PI * 2);
        targetCtx.stroke();
        targetCtx.restore();
      }
      targetCtx.beginPath();
      targetCtx.moveTo(x1, y1);
      targetCtx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      targetCtx.stroke();
      const tangStartX = (cp1x - x1) || dx;
      const tangStartY = (cp1y - y1) || dy;
      const startAng = Math.atan2(-tangStartY, -tangStartX);
      const tangX = (x2 - cp2x) || dx;
      const tangY = (y2 - cp2y) || dy;
      const ang = Math.atan2(tangY, tangX);
      const effEnd = endArrow !== 'none' ? endArrow : 'open';
      if (startArrow !== 'none') drawShapeArrowhead(targetCtx, x1, y1, startAng, startArrow, strokeSz, strokeCol);
      drawShapeArrowhead(targetCtx, x2, y2, ang, effEnd, strokeSz, strokeCol);
    } else if (type === 'diamond') {
      const verts = getShapeVertices(shape);
      if (verts && verts.length >= 4) {
        tracePolygonPath(targetCtx, verts, isRounded, true);
        if (filled) targetCtx.fill();
        targetCtx.stroke();
      }
    } else if (type === 'roundedRect') {
      const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
      const rad = isRounded ? Math.min(rw, rh) * 0.28 : 0;
      if (rad > 0 && targetCtx.roundRect) targetCtx.roundRect(rx, ry, rw, rh, rad);
      else targetCtx.rect(rx, ry, rw, rh);
      if (filled) targetCtx.fill();
      targetCtx.stroke();
    } else if (type === 'triangle' || type === 'polygon') {
      const verts = getShapeVertices(shape);
      if (verts && verts.length >= 3) {
        tracePolygonPath(targetCtx, verts, isRounded, true);
        if (filled) targetCtx.fill();
        targetCtx.stroke();
      }
    } else if (type === 'polyline') {
      const verts = getShapeVertices(shape);
      if (verts && verts.length >= 2) {
        tracePolygonPath(targetCtx, verts, isRounded, false);
        targetCtx.stroke();
        if (startArrow !== 'none') {
          const a0 = Math.atan2(verts[0].y - verts[1].y, verts[0].x - verts[1].x);
          drawShapeArrowhead(targetCtx, verts[0].x, verts[0].y, a0, startArrow, strokeSz, strokeCol);
        }
        if (endArrow !== 'none') {
          const last = verts.length - 1;
          const a1 = Math.atan2(verts[last].y - verts[last - 1].y, verts[last].x - verts[last - 1].x);
          drawShapeArrowhead(targetCtx, verts[last].x, verts[last].y, a1, endArrow, strokeSz, strokeCol);
        }
      }
    } else if (type === 'arc') {
      const verts = getShapeVertices(shape);
      if (verts && verts.length >= 4) {
        targetCtx.moveTo(verts[0].x, verts[0].y);
        targetCtx.bezierCurveTo(verts[1].x, verts[1].y, verts[2].x, verts[2].y, verts[3].x, verts[3].y);
        targetCtx.stroke();
      }
    }
    if (isSelected) {
      const bb = getShapeBoundingBox(shape);
      targetCtx.globalAlpha = 1.0;
      targetCtx.globalCompositeOperation = 'source-over';
      targetCtx.strokeStyle = '#2563eb';
      targetCtx.lineWidth = 1.5;
      targetCtx.setLineDash([4, 4]);
      targetCtx.strokeRect(bb.minX - 6, bb.minY - 6, (bb.maxX - bb.minX) + 12, (bb.maxY - bb.minY) + 12);
    }
    targetCtx.restore();
  }

  function drawTextBlocksOnCanvas(targetCtx, texts) {
    // Utilisé pour les miniatures et exports PNG (l'affichage principal utilise les cartes DOM interactives)
    (texts || []).forEach((tb) => {
      targetCtx.save();
      const typo = getTextBoxEffectiveTypography(tb);
      const fs = typo.frameStyle;
      const boxW = Math.max(72, tb.width || 260);
      const pad = fs.padding || 0;
      const innerW = Math.max(24, boxW - pad * 2);
      const fontWeight = typo.bold ? '700 ' : '400 ';
      const fontStyle = typo.italic ? 'italic ' : '';
      targetCtx.font = `${fontStyle}${fontWeight}${typo.fontSize}px ${typo.fontFamily}`;
      targetCtx.textBaseline = 'top';

      // Découpage par lignes + retour à la ligne automatique sur boxW
      const rawParas = String(tb.text || '').split('\n');
      const wrappedLines = [];
      for (const para of rawParas) {
        if (!para) {
          wrappedLines.push('');
          continue;
        }
        const words = para.split(' ');
        let cur = '';
        for (const w of words) {
          const cand = cur ? `${cur} ${w}` : w;
          if (cur && targetCtx.measureText(cand).width > innerW) {
            wrappedLines.push(cur);
            cur = w;
          } else {
            cur = cand;
          }
        }
        wrappedLines.push(cur);
      }

      const lh = typo.lineHeightMode === 'fixed' ? typo.lineHeightFixed : Math.round(typo.fontSize * 1.35);
      const boxH = Math.max(lh + pad * 2, wrappedLines.length * lh + pad * 2);

      // Fond / bordure / ombre GoodNotes TextBoxStyle
      if (fs.backgroundColor || fs.borderWidth > 0) {
        targetCtx.save();
        if (fs.showShadow) {
          targetCtx.shadowColor = 'rgba(0, 0, 0, 0.22)';
          targetCtx.shadowBlur = 10;
          targetCtx.shadowOffsetX = 0;
          targetCtx.shadowOffsetY = 4;
        }
        targetCtx.beginPath();
        if (typeof targetCtx.roundRect === 'function' && fs.cornerRadius > 0) {
          targetCtx.roundRect(tb.x, tb.y, boxW, boxH, fs.cornerRadius);
        } else {
          targetCtx.rect(tb.x, tb.y, boxW, boxH);
        }
        if (fs.backgroundColor) {
          targetCtx.fillStyle = fs.backgroundColor;
          targetCtx.fill();
        }
        targetCtx.restore();
        if (fs.borderWidth > 0) {
          targetCtx.beginPath();
          if (typeof targetCtx.roundRect === 'function' && fs.cornerRadius > 0) {
            targetCtx.roundRect(tb.x, tb.y, boxW, boxH, fs.cornerRadius);
          } else {
            targetCtx.rect(tb.x, tb.y, boxW, boxH);
          }
          targetCtx.strokeStyle = fs.borderColor || 'rgba(15, 23, 42, 0.25)';
          targetCtx.lineWidth = fs.borderWidth;
          targetCtx.stroke();
        }
      }

      targetCtx.fillStyle = typo.color || '#000000';
      targetCtx.textAlign = typo.textAlign || 'left';
      const baseTextX = typo.textAlign === 'center'
        ? tb.x + boxW * 0.5
        : (typo.textAlign === 'right' ? tb.x + boxW - pad : tb.x + pad);

      wrappedLines.forEach((line, idx) => {
        const ly = tb.y + pad + idx * lh;
        targetCtx.fillText(line, baseTextX, ly);
        if ((typo.underline || typo.strike) && line.length > 0) {
          const w = targetCtx.measureText(line).width;
          const lx = typo.textAlign === 'center' ? baseTextX - w * 0.5 : (typo.textAlign === 'right' ? baseTextX - w : baseTextX);
          targetCtx.strokeStyle = typo.color || '#000000';
          targetCtx.lineWidth = Math.max(1, typo.fontSize * 0.065);
          if (typo.underline) {
            targetCtx.beginPath();
            targetCtx.moveTo(lx, ly + typo.fontSize * 1.04);
            targetCtx.lineTo(lx + w, ly + typo.fontSize * 1.04);
            targetCtx.stroke();
          }
          if (typo.strike) {
            targetCtx.beginPath();
            targetCtx.moveTo(lx, ly + typo.fontSize * 0.55);
            targetCtx.lineTo(lx + w, ly + typo.fontSize * 0.55);
            targetCtx.stroke();
          }
        }
      });
      targetCtx.restore();
    });
  }

  function isBoundsInViewport(bounds, viewBounds) {
    if (!bounds || !viewBounds) return true;
    return !(
      bounds.maxX < viewBounds.minX ||
      bounds.minX > viewBounds.maxX ||
      bounds.maxY < viewBounds.minY ||
      bounds.minY > viewBounds.maxY
    );
  }

  function getStrokeLineDash(lineStyle, size) {
    const sz = Math.max(1, size || 5);
    if (lineStyle === 'dashed') {
      return [Math.max(7, sz * 2.4), Math.max(6, sz * 2.0)];
    }
    if (lineStyle === 'dotted') {
      return [0.01, Math.max(5, sz * 2.15)];
    }
    return [];
  }

