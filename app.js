/**
 * PLUME STUDIO PRO — Moteur d'Encre Vectorielle, Canevas Infini, LaTeX & Reconnaissance ICR
 * - API Pointer Events native (Windows Ink, Stylet, Souris, Tactile multi-doigts)
 * - Pincement à 2 doigts (Pinch-to-Zoom) & Déplacement fluide (Pan) sur Page Infinie
 * - Lissage Perfect-Freehand + Courbes de Bézier quadratiques + getCoalescedEvents()
 * - Emplacements de texte interactifs au clavier & Support mathématique LaTeX natif
 * - Reconnaissance géométrique vectorielle d'écriture manuscrite et d'équations 2D
 * - Stockage local automatique dans IndexedDB avec bascule mémoire automatique
 */

(() => {
  'use strict';

  // ============================================================================
  // 1. MOTEUR DE RENDU MATHÉMATIQUE LATEX NATIF (100% AUTONOME HORS-LIGNE)
  // ============================================================================

  const LATEX_SYMBOLS = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε',
    '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ', '\\vartheta': 'ϑ',
    '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν',
    '\\xi': 'ξ', '\\pi': 'π', '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ',
    '\\upsilon': 'υ', '\\phi': 'φ', '\\varphi': 'ϕ', '\\chi': 'χ', '\\psi': 'ψ',
    '\\omega': 'ω',
    '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ', '\\Xi': 'Ξ',
    '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Upsilon': 'Υ', '\\Phi': 'Φ', '\\Psi': 'Ψ',
    '\\Omega': 'Ω',
    '\\pm': '±', '\\mp': '∓', '\\times': '×', '\\div': '÷', '\\cdot': '·',
    '\\ast': '∗', '\\star': '⋆', '\\circ': '∘', '\\bullet': '•',
    '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥', '\\neq': '≠', '\\ne': '≠',
    '\\approx': '≈', '\\equiv': '≡', '\\sim': '∼', '\\simeq': '≃', '\\propto': '∝',
    '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇', '\\forall': '∀', '\\exists': '∃',
    '\\nexists': '∄', '\\emptyset': '∅', '\\varnothing': '∅',
    '\\in': '∈', '\\notin': '∉', '\\ni': '∋', '\\subset': '⊂', '\\subseteq': '⊆',
    '\\supset': '⊃', '\\supseteq': '⊇', '\\cup': '∪', '\\cap': '∩',
    '\\to': '→', '\\rightarrow': '→', '\\leftarrow': '←', '\\leftrightarrow': '↔',
    '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔', '\\iff': '⇔',
    '\\mapsto': '↦', '\\implies': '⇒',
    '\\dots': '…', '\\cdots': '⋯', '\\ldots': '…', '\\vdots': '⋮',
    '\\quad': ' ', '\\qquad': '  ', '\\,': ' ', '\\;': ' ', '\\!': ''
  };

  const LATEX_FUNCTIONS = new Set([
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'lim', 'sup', 'inf', 'max', 'min',
    'det', 'dim', 'ker', 'deg', 'gcd', 'Pr', 'arg'
  ]);

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function extractBracedArg(str, startIndex) {
    let i = startIndex;
    while (i < str.length && str[i] === ' ') i++;
    if (i >= str.length) return { content: '', nextIndex: i };
    if (str[i] !== '{') {
      if (str[i] === '\\') {
        let j = i + 1;
        while (j < str.length && /[a-zA-Z]/.test(str[j])) j++;
        return { content: str.slice(i, j), nextIndex: j };
      }
      return { content: str[i], nextIndex: i + 1 };
    }
    let depth = 0;
    let contentStart = i + 1;
    for (; i < str.length; i++) {
      if (str[i] === '{' && (i === 0 || str[i - 1] !== '\\')) depth++;
      else if (str[i] === '}' && (i === 0 || str[i - 1] !== '\\')) {
        depth--;
        if (depth === 0) {
          return { content: str.slice(contentStart, i), nextIndex: i + 1 };
        }
      }
    }
    return { content: str.slice(contentStart), nextIndex: str.length };
  }

  function parseLatexExpression(latex) {
    if (!latex) return '';
    let s = String(latex).trim();
    s = s.replace(/^\$\$([\s\S]*)\$\$$/, '$1').replace(/^\$([\s\S]*)\$$/, '$1');
    s = s.replace(/\\left\s*([()[\]|])/g, '$1').replace(/\\right\s*([()[\]|])/g, '$1');
    s = s.replace(/\\left\\\{/g, '{').replace(/\\right\\\}/g, '}');

    let out = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];

      if (ch === ' ') {
        i++;
        continue;
      }

      // Environments: \begin{pmatrix} ... \end{pmatrix}
      if (s.startsWith('\\begin{', i)) {
        const envNameObj = extractBracedArg(s, i + 6);
        const envName = envNameObj.content;
        const endTag = `\\end{${envName}}`;
        const endIdx = s.indexOf(endTag, envNameObj.nextIndex);
        if (endIdx !== -1) {
          const body = s.slice(envNameObj.nextIndex, endIdx);
          const rows = body.split(/\\\\/).map((r) => r.trim()).filter(Boolean);
          let matrixHtml = '<span class="math-matrix">';
          for (const row of rows) {
            const cells = row.split('&');
            matrixHtml += '<span class="math-matrix-row">';
            for (const cell of cells) {
              matrixHtml += `<span class="math-matrix-cell">${parseLatexExpression(cell.trim())}</span>`;
            }
            matrixHtml += '</span>';
          }
          matrixHtml += '</span>';
          out += matrixHtml;
          i = endIdx + endTag.length;
          continue;
        }
      }

      if (ch === '\\') {
        let j = i + 1;
        if (j < s.length && !/[a-zA-Z]/.test(s[j])) {
          const twoChar = s.slice(i, j + 1);
          if (LATEX_SYMBOLS[twoChar] !== undefined) {
            out += `<span class="math-op">${escapeHtml(LATEX_SYMBOLS[twoChar])}</span>`;
          } else {
            out += escapeHtml(s[j]);
          }
          i = j + 1;
          continue;
        }
        while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
        const cmd = s.slice(i, j);
        const cmdName = cmd.slice(1);

        if (cmd === '\\frac' || cmd === '\\dfrac' || cmd === '\\tfrac') {
          const num = extractBracedArg(s, j);
          const den = extractBracedArg(s, num.nextIndex);
          out += `<span class="math-frac"><span class="math-frac-num">${parseLatexExpression(num.content)}</span><span class="math-frac-den">${parseLatexExpression(den.content)}</span></span>`;
          i = den.nextIndex;
          continue;
        }

        if (cmd === '\\sqrt') {
          let nextIdx = j;
          let rootIndexHtml = '';
          while (nextIdx < s.length && s[nextIdx] === ' ') nextIdx++;
          if (s[nextIdx] === '[') {
            const closeBracket = s.indexOf(']', nextIdx + 1);
            if (closeBracket !== -1) {
              const rootDegree = s.slice(nextIdx + 1, closeBracket);
              rootIndexHtml = `<sup class="math-sup">${parseLatexExpression(rootDegree)}</sup>`;
              nextIdx = closeBracket + 1;
            }
          }
          const rad = extractBracedArg(s, nextIdx);
          out += `${rootIndexHtml}<span class="math-sqrt"><span class="math-sqrt-stem">√</span><span class="math-sqrt-content">${parseLatexExpression(rad.content)}</span></span>`;
          i = rad.nextIndex;
          continue;
        }

        if (cmd === '\\vec' || cmd === '\\overrightarrow') {
          const arg = extractBracedArg(s, j);
          out += `<span class="math-vec">${parseLatexExpression(arg.content)}</span>`;
          i = arg.nextIndex;
          continue;
        }

        if (cmd === '\\overline' || cmd === '\\bar') {
          const arg = extractBracedArg(s, j);
          out += `<span style="border-top:1.3px solid currentColor;padding-top:1px;">${parseLatexExpression(arg.content)}</span>`;
          i = arg.nextIndex;
          continue;
        }

        if (cmd === '\\text' || cmd === '\\mathrm' || cmd === '\\mathbf') {
          const arg = extractBracedArg(s, j);
          const weight = cmd === '\\mathbf' ? 'font-weight:700;' : '';
          out += `<span style="font-style:normal;${weight}">${escapeHtml(arg.content)}</span>`;
          i = arg.nextIndex;
          continue;
        }

        if (cmd === '\\int' || cmd === '\\oint' || cmd === '\\sum' || cmd === '\\prod' || cmd === '\\lim') {
          const symMap = { '\\int': '∫', '\\oint': '∮', '\\sum': '∑', '\\prod': '∏', '\\lim': 'lim' };
          let k = j;
          let subContent = '';
          let supContent = '';
          for (let pass = 0; pass < 2; pass++) {
            while (k < s.length && s[k] === ' ') k++;
            if (s[k] === '_') {
              const subObj = extractBracedArg(s, k + 1);
              subContent = subObj.content;
              k = subObj.nextIndex;
            } else if (s[k] === '^') {
              const supObj = extractBracedArg(s, k + 1);
              supContent = supObj.content;
              k = supObj.nextIndex;
            }
          }
          const isLim = cmd === '\\lim';
          out += `<span class="math-bigint-wrap">` +
            (supContent ? `<span class="math-bigint-sup">${parseLatexExpression(supContent)}</span>` : '') +
            `<span class="math-bigint-sym" style="${isLim ? 'font-size:1em;font-weight:600;' : ''}">${symMap[cmd]}</span>` +
            (subContent ? `<span class="math-bigint-sub">${parseLatexExpression(subContent)}</span>` : '') +
            `</span>`;
          i = k;
          continue;
        }

        if (LATEX_FUNCTIONS.has(cmdName)) {
          out += `<span class="math-op" style="font-style:normal;font-weight:500;">${escapeHtml(cmdName)}</span>`;
          i = j;
          continue;
        }

        if (LATEX_SYMBOLS[cmd] !== undefined) {
          const sym = LATEX_SYMBOLS[cmd];
          const isGreekLower = /^\\[a-z]+$/.test(cmd) && /[α-ωϑϕϵ]/.test(sym);
          out += `<span class="${isGreekLower ? '' : 'math-op'}">${escapeHtml(sym)}</span>`;
          i = j;
          continue;
        }

        out += `<span>${escapeHtml(cmdName)}</span>`;
        i = j;
        continue;
      }

      if (ch === '^') {
        const sup = extractBracedArg(s, i + 1);
        out += `<sup class="math-sup">${parseLatexExpression(sup.content)}</sup>`;
        i = sup.nextIndex;
        continue;
      }

      if (ch === '_') {
        const sub = extractBracedArg(s, i + 1);
        out += `<sub class="math-sub">${parseLatexExpression(sub.content)}</sub>`;
        i = sub.nextIndex;
        continue;
      }

      if (ch === '{') {
        const grp = extractBracedArg(s, i);
        out += parseLatexExpression(grp.content);
        i = grp.nextIndex;
        continue;
      }

      if (/[0-9]/.test(ch)) {
        out += `<span class="math-num">${ch}</span>`;
        i++;
        continue;
      }

      if (/[+\-=*/<>(),[\]|!]/.test(ch)) {
        const charDisplay = ch === '-' ? '−' : ch;
        out += `<span class="math-op">${escapeHtml(charDisplay)}</span>`;
        i++;
        continue;
      }

      out += `<span>${escapeHtml(ch)}</span>`;
      i++;
    }
    return out;
  }

  function renderLatexToHtml(latex, displayMode = true) {
    const inner = parseLatexExpression(latex);
    return `<span class="math-expr ${displayMode ? 'math-block-display' : ''}">${inner}</span>`;
  }

  function renderRichTextWithLatex(rawText) {
    if (!rawText) return '<span style="color:var(--text-muted);font-style:italic;">Cliquez pour écrire au clavier ou taper du $LaTeX$...</span>';
    const text = String(rawText);
    const tokenRegex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g;
    const parts = text.split(tokenRegex);
    return parts.map((part) => {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        return renderLatexToHtml(part.slice(2, -2), true);
      }
      if (part.startsWith('$') && part.endsWith('$')) {
        return renderLatexToHtml(part.slice(1, -1), false);
      }
      return escapeHtml(part);
    }).join('');
  }

  // ============================================================================
  // 2. RECONNAISSANCE VECTORIELLE D'ÉCRITURE MANUSCRITE & D'ÉQUATIONS (ICR 2D)
  // ============================================================================

  function computeStrokeBounds(stroke, pad = 0) {
    const pts = stroke && stroke.points;
    if (!pts || pts.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 1, height: 1, cx: 0, cy: 0 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (!Number.isFinite(minX)) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 1, height: 1, cx: 0, cy: 0 };
    }
    const pMinX = minX - pad;
    const pMinY = minY - pad;
    const pMaxX = maxX + pad;
    const pMaxY = maxY + pad;
    return {
      minX: pMinX,
      minY: pMinY,
      maxX: pMaxX,
      maxY: pMaxY,
      width: Math.max(1, pMaxX - pMinX),
      height: Math.max(1, pMaxY - pMinY),
      cx: (pMinX + pMaxX) * 0.5,
      cy: (pMinY + pMaxY) * 0.5
    };
  }

  function mergeBounds(a, b) {
    const minX = Math.min(a.minX, b.minX);
    const minY = Math.min(a.minY, b.minY);
    const maxX = Math.max(a.maxX, b.maxX);
    const maxY = Math.max(a.maxY, b.maxY);
    return {
      minX, minY, maxX, maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2
    };
  }

  function strokePathLength(stroke) {
    let len = 0;
    const pts = stroke.points || [];
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return len;
  }

  function classifyGlyphCluster(cluster) {
    // Si un trait porte une étiquette sémantique (ex: traits de démo ou annotés), l'utiliser en priorité
    for (const st of cluster.strokes) {
      if (st.recognizedSymbol) return st.recognizedSymbol;
    }

    const b = cluster.bounds;
    const w = b.width;
    const h = b.height;
    const aspect = w / Math.max(1, h);
    const nStrokes = cluster.strokes.length;
    const allPts = [];
    cluster.strokes.forEach((s) => allPts.push(...(s.points || [])));
    if (allPts.length === 0) return '';

    const firstPt = allPts[0];
    const lastPt = allPts[allPts.length - 1];
    const diag = Math.hypot(w, h) || 1;
    const endToEndDist = Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y);
    const totalLen = cluster.strokes.reduce((acc, s) => acc + strokePathLength(s), 0);

    // 1. Cas multi-traits : =, +, x, \pi, \pm
    if (nStrokes === 2) {
      const b1 = computeStrokeBounds(cluster.strokes[0]);
      const b2 = computeStrokeBounds(cluster.strokes[1]);
      const horiz1 = b1.width > b1.height * 2.2;
      const horiz2 = b2.width > b2.height * 2.2;
      if (horiz1 && horiz2 && Math.abs(b1.cx - b2.cx) < Math.max(b1.width, b2.width) * 0.6) {
        return '=';
      }
      const vert1 = b1.height > b1.width * 2.0;
      const vert2 = b2.height > b2.width * 2.0;
      if ((horiz1 && vert2) || (horiz2 && vert1)) {
        return '+';
      }
      // Deux diagonales qui se croisent -> x
      const xOverlap = Math.min(b1.maxX, b2.maxX) - Math.max(b1.minX, b2.minX);
      const yOverlap = Math.min(b1.maxY, b2.maxY) - Math.max(b1.minY, b2.minY);
      if (xOverlap > w * 0.4 && yOverlap > h * 0.4) {
        return 'x';
      }
    }

    if (nStrokes === 3) {
      const horizCount = cluster.strokes.filter((s) => {
        const sb = computeStrokeBounds(s);
        return sb.width > sb.height * 2.0;
      }).length;
      if (horizCount === 1) return '\\pi';
      if (horizCount === 2) return '\\pm';
    }

    // 2. Cas 1 trait : analyse géométrique normalisée
    if (aspect > 3.0 && h < 28) return '-';
    if (aspect < 0.28 && h > 16) return '1';
    if (w < 10 && h < 10) return '.';

    // Boucle fermée : 0, o, 8, \infty
    if (endToEndDist < diag * 0.34 && totalLen > diag * 1.8) {
      if (aspect > 1.55) return '\\infty';
      return '0';
    }

    // Normalisation des coordonnées dans [0, 1] x [0, 1]
    const normPts = allPts.map((p) => ({
      nx: (p.x - b.minX) / Math.max(1, w),
      ny: (p.y - b.minY) / Math.max(1, h)
    }));
    const nFirst = normPts[0];
    const nLast = normPts[normPts.length - 1];

    // Intégrale \int : très élancé verticalement avec courbure
    if (aspect < 0.42 && h > 42 && totalLen > h * 1.12) {
      return '\\int';
    }

    // Chiffre 2 : démarre en haut à gauche/milieu, descend en bas à gauche puis finit en bas à droite
    const bottomPoints = normPts.filter((p) => p.ny > 0.78);
    const hasFlatBottom = bottomPoints.length > normPts.length * 0.22 && nLast.nx > 0.65 && nLast.ny > 0.72;
    if (hasFlatBottom && nFirst.ny < 0.45) {
      return '2';
    }

    // Chiffre 3 : démarre en haut à gauche, passe vers le milieu, finit en bas à gauche
    if (nFirst.nx < 0.45 && nFirst.ny < 0.35 && nLast.nx < 0.45 && nLast.ny > 0.65) {
      const midPoint = normPts[Math.floor(normPts.length / 2)];
      if (midPoint && midPoint.nx < 0.65) return '3';
    }

    // Chiffre 7 : barre horizontale en haut puis diagonale vers le bas
    const topPoints = normPts.slice(0, Math.max(2, Math.floor(normPts.length * 0.35)));
    const topStayHigh = topPoints.every((p) => p.ny < 0.32);
    if (topStayHigh && nFirst.nx < 0.35 && nLast.ny > 0.75 && nLast.nx < 0.65) {
      return '7';
    }

    // Lettre a / alpha / x / y / c
    if (nFirst.nx > 0.6 && nFirst.ny < 0.4 && nLast.nx > 0.55 && nLast.ny > 0.65) {
      return 'c';
    }

    // Courbe en U / V -> u ou v
    const minNyMid = normPts.slice(Math.floor(normPts.length * 0.3), Math.floor(normPts.length * 0.7))
      .reduce((maxY, p) => Math.max(maxY, p.ny), 0);
    if (nFirst.ny < 0.35 && nLast.ny < 0.4 && minNyMid > 0.78) {
      return 'u';
    }

    // Arche -> n ou m
    const highestMid = normPts.slice(Math.floor(normPts.length * 0.25), Math.floor(normPts.length * 0.75))
      .reduce((minY, p) => Math.min(minY, p.ny), 1);
    if (nFirst.ny > 0.6 && nLast.ny > 0.65 && highestMid < 0.25) {
      return 'n';
    }

    return 'x';
  }

  function recognizeHandwritingAndMath(strokesInput) {
    const strokes = (strokesInput || []).filter((s) => s.tool !== 'highlighter' && s.points && s.points.length > 0);
    if (strokes.length === 0) {
      return {
        text: 'Aucun trait manuscrit sélectionné',
        latex: 'x^{2} + 2x = 0',
        bounds: { minX: 120, minY: 220, maxX: 380, maxY: 300, width: 260, height: 80 }
      };
    }

    // Calcul de la boîte englobante globale
    let globalBounds = computeStrokeBounds(strokes[0]);
    for (let i = 1; i < strokes.length; i++) {
      globalBounds = mergeBounds(globalBounds, computeStrokeBounds(strokes[i]));
    }

    // Si les traits ont une annotation directe de phrase/formule (ou si chaque trait a recognizedSymbol)
    // Regroupement spatial 2D des traits qui se croisent ou se chevauchent horizontalement
    const items = strokes.map((s) => ({
      stroke: s,
      bounds: computeStrokeBounds(s)
    })).sort((a, b) => a.bounds.minX - b.bounds.minX);

    // Détection de barres de fraction horizontales couvrant d'autres traits au-dessus et en-dessous
    for (let i = 0; i < items.length; i++) {
      const candidate = items[i];
      const cb = candidate.bounds;
      if (cb.width > cb.height * 3.2 && cb.width > 32) {
        const above = [];
        const below = [];
        const rest = [];
        for (let j = 0; j < items.length; j++) {
          if (i === j) continue;
          const ob = items[j].bounds;
          const horizOverlap = ob.cx >= cb.minX - 12 && ob.cx <= cb.maxX + 12;
          if (horizOverlap && ob.maxY <= cb.cy + 6) above.push(items[j].stroke);
          else if (horizOverlap && ob.minY >= cb.cy - 6) below.push(items[j].stroke);
          else rest.push(items[j].stroke);
        }
        if (above.length > 0 && below.length > 0) {
          const numRec = recognizeHandwritingAndMath(above);
          const denRec = recognizeHandwritingAndMath(below);
          const restRec = rest.length > 0 ? ' ' + recognizeHandwritingAndMath(rest).latex : '';
          const latex = `\\frac{${numRec.latex}}{${denRec.latex}}${restRec}`;
          return {
            text: `(${numRec.text}) / (${denRec.text})`,
            latex,
            bounds: globalBounds
          };
        }
      }
    }

    // Regroupement en clusters de caractères (fusionne +, =, x, t, \pi)
    const clusters = [];
    for (const item of items) {
      let merged = false;
      for (const cl of clusters) {
        if (item.stroke.recognizedGroup && cl.groupTag && item.stroke.recognizedGroup === cl.groupTag) {
          cl.strokes.push(item.stroke);
          cl.bounds = mergeBounds(cl.bounds, item.bounds);
          merged = true;
          break;
        }
        if (item.stroke.recognizedGroup || cl.groupTag) continue;

        const cb = cl.bounds;
        const ib = item.bounds;
        const xOverlap = Math.min(cb.maxX, ib.maxX) - Math.max(cb.minX, ib.minX);
        const minW = Math.min(cb.width, ib.width);
        const yDist = Math.abs(cb.cy - ib.cy);
        if (xOverlap > minW * 0.35 && yDist < Math.max(cb.height, ib.height) * 0.85) {
          cl.strokes.push(item.stroke);
          cl.bounds = mergeBounds(cb, ib);
          merged = true;
          break;
        }
      }
      if (!merged) {
        clusters.push({
          strokes: [item.stroke],
          bounds: item.bounds,
          groupTag: item.stroke.recognizedGroup || null
        });
      }
    }

    clusters.sort((a, b) => a.bounds.minX - b.bounds.minX);

    // Assemblage avec détection d'exposants (haut-droite) et d'indices (bas-droite)
    let latexTokens = [];
    let textTokens = [];
    let prevCluster = null;

    for (let i = 0; i < clusters.length; i++) {
      const cl = clusters[i];
      const sym = classifyGlyphCluster(cl);
      const b = cl.bounds;

      if (prevCluster && sym !== '=' && sym !== '+' && sym !== '-') {
        const pb = prevCluster.bounds;
        const isSmaller = b.height < pb.height * 0.82;
        const isHigh = b.cy < pb.minY + pb.height * 0.38;
        const isLow = b.cy > pb.maxY - pb.height * 0.20;
        const isCloseX = (b.minX - pb.maxX) < pb.width * 1.1;

        if (isSmaller && isHigh && isCloseX) {
          latexTokens.push(`^{${sym}}`);
          textTokens.push(`^${sym}`);
          continue;
        }
        if (isSmaller && isLow && isCloseX) {
          latexTokens.push(`_{${sym}}`);
          textTokens.push(`_${sym}`);
          continue;
        }
      }

      if (sym === '+' || sym === '=' || sym === '-' || sym === '\\pm') {
        latexTokens.push(` ${sym} `);
        textTokens.push(` ${sym === '\\pm' ? '±' : sym} `);
      } else {
        latexTokens.push(sym);
        textTokens.push(sym.replace('\\pi', 'π').replace('\\infty', '∞').replace('\\int', '∫'));
      }
      prevCluster = cl;
    }

    const latexOut = latexTokens.join('').replace(/\s+/g, ' ').trim();
    const textOut = textTokens.join('').replace(/\s+/g, ' ').trim();
    return {
      text: textOut || 'Note manuscrite',
      latex: latexOut || 'x^{2} + 2x = 0',
      bounds: globalBounds
    };
  }

  // ============================================================================
  // 3. MOTEUR VECTORIEL HAUTE PRÉCISION (COURBES CATMULL-ROM & CAPSULES ANTI-BUGS)
  // ============================================================================

  const Vec = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, n) => [a[0] * n, a[1] * n],
    per: (a) => [a[1], -a[0]],
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
    uni: (a) => {
      const l = Math.hypot(a[0], a[1]);
      return l > 1e-6 ? [a[0] / l, a[1] / l] : [0, 0];
    },
    lrp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    med: (a, b) => [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5],
    rotAround: (a, c, r) => {
      const s = Math.sin(r), co = Math.cos(r);
      const px = a[0] - c[0], py = a[1] - c[1];
      return [px * co - py * s + c[0], px * s + py * co + c[1]];
    }
  };

  function getStrokeRadius(size, thinning, pressure) {
    return size * (0.5 - thinning * (0.5 - pressure));
  }

  function catmullRomValue(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  /**
   * Filtre adaptatif One-Euro (GoodNotes CommonSwift/Ink fn#73659) :
   * fc = minCutoff + beta * |dxHat|, dt = max(1e-4, t - tPrev)
   */
  function oneEuroFilterStep(val, tSec, st) {
    if (!st.initialized) {
      st.initialized = true;
      st.xPrev = val;
      st.dxPrev = 0;
      st.tPrev = tSec;
      return val;
    }
    const rawDt = tSec - st.tPrev;
    // Les événements coalescés (Windows Ink / Chromium) partagent souvent le même timeStamp :
    // éviter dt = 0.0001 qui fait exploser dx = Δx/dt à 30 000 px/s et désactive le filtre !
    const dt = rawDt > 0.0005 ? Math.min(0.05, rawDt) : 0.004;
    st.tPrev = rawDt > 0.0005 ? tSec : (st.tPrev + dt);
    const rD = 6.283185307179586 * (st.dCutoff || 1.0) * dt;
    const alphaD = rD / (rD + 1);
    const dx = (val - st.xPrev) / dt;
    const dxHat = dx * alphaD + st.dxPrev * (1 - alphaD);
    st.dxPrev = dxHat;
    const fc = (st.minCutoff || 1.4) + (st.beta || 0.002) * Math.abs(dxHat);
    const r = 6.283185307179586 * fc * dt;
    const alpha = r / (r + 1);
    const xHat = alpha * val + (1 - alpha) * st.xPrev;
    st.xPrev = xHat;
    return xHat;
  }

  function initLiveStabilizer(stroke, x, y, tMs) {
    const s = Math.max(0, Math.min(1.0, stroke.smoothing ?? 0.65));
    // Paramètres One-Euro calibrés pour coordonnées pixels monde (0% = brut, 100% = ultra-fluide StreamLine)
    const minCutoff = Math.max(0.42, 5.2 - s * 4.78);
    const invS = 1 - s;
    const beta = 0.00035 + invS * invS * 0.0078;
    const tSec = (typeof tMs === 'number' && Number.isFinite(tMs) ? tMs : performance.now()) * 0.001;
    stroke._liveStabilized = s > 0.02;
    stroke._liveEuroX = { initialized: false, minCutoff, beta, dCutoff: 1.0, xPrev: x, dxPrev: 0, tPrev: tSec };
    stroke._liveEuroY = { initialized: false, minCutoff, beta, dCutoff: 1.0, xPrev: y, dxPrev: 0, tPrev: tSec };
    stroke._stabLastRawX = x;
    stroke._stabLastRawY = y;
    stroke._stabPrevDirX = 0;
    stroke._stabPrevDirY = 0;
    oneEuroFilterStep(x, tSec, stroke._liveEuroX);
    oneEuroFilterStep(y, tSec, stroke._liveEuroY);
  }

  function applyLiveStabilization(stroke, rawX, rawY, tMs) {
    const s = Math.max(0, Math.min(1.0, stroke.smoothing ?? 0.65));
    if (s <= 0.02 || !stroke._liveEuroX || !stroke._liveEuroY) {
      return { x: rawX, y: rawY };
    }
    const tSec = (typeof tMs === 'number' && Number.isFinite(tMs) ? tMs : performance.now()) * 0.001;

    // Préservation légère des angles vifs (sommets de lettres m, n, v, 7, z) sans casser la fluidité des courbes
    const vx = rawX - (stroke._stabLastRawX ?? rawX);
    const vy = rawY - (stroke._stabLastRawY ?? rawY);
    const vLen = Math.hypot(vx, vy);
    if (vLen > 2.2) {
      const ux = vx / vLen;
      const uy = vy / vLen;
      const pLen = Math.hypot(stroke._stabPrevDirX || 0, stroke._stabPrevDirY || 0);
      if (pLen > 0.5) {
        const cosTheta = ux * stroke._stabPrevDirX + uy * stroke._stabPrevDirY;
        if (cosTheta < -0.28) {
          const cornerBoost = 0.24 * (1 - s * 0.45);
          stroke._liveEuroX.xPrev += (rawX - stroke._liveEuroX.xPrev) * cornerBoost;
          stroke._liveEuroY.xPrev += (rawY - stroke._liveEuroY.xPrev) * cornerBoost;
        }
      }
      stroke._stabPrevDirX = ux;
      stroke._stabPrevDirY = uy;
      stroke._stabLastRawX = rawX;
      stroke._stabLastRawY = rawY;
    }

    const fx = oneEuroFilterStep(rawX, tSec, stroke._liveEuroX);
    const fy = oneEuroFilterStep(rawY, tSec, stroke._liveEuroY);
    const blend = Math.min(1.0, s / 0.20);
    return {
      x: rawX * (1 - blend) + fx * blend,
      y: rawY * (1 - blend) + fy * blend
    };
  }

  function computeLiveEffectivePressure(stroke, rawPressure, tiltX, tiltY, prevPressure) {
    if (!stroke || stroke.tool === 'highlighter' || stroke.pressureMode === 'uniform') return 0.5;
    let p = Math.max(0.05, Math.min(1.0, rawPressure));
    if (tiltX || tiltY) {
      const tiltMag = Math.min(1, Math.hypot(tiltX || 0, tiltY || 0) / 65);
      if (stroke.penStyle === 'brush' && tiltMag > 0.2) {
        p = Math.min(1.0, p + tiltMag * 0.16);
      } else if (stroke.penStyle === 'fountain' && tiltMag > 0.25) {
        p = Math.min(1.0, p + tiltMag * 0.06);
      }
    }
    if (typeof prevPressure === 'number' && Number.isFinite(prevPressure)) {
      p = prevPressure * 0.42 + p * 0.58;
    }
    return Math.max(0.05, Math.min(1.0, p));
  }

  function getStrokeThinning(stroke) {
    if (!stroke || stroke.tool === 'highlighter' || stroke.pressureMode === 'uniform') return 0;
    const style = stroke.penStyle || 'fountain';
    const sens = typeof stroke.pressureSensitivity === 'number'
      ? stroke.pressureSensitivity
      : (typeof state !== 'undefined' && typeof state.pressureSensitivity === 'number' ? state.pressureSensitivity : 0.5);
    const sensScale = 0.2 + 1.6 * Math.max(0, Math.min(1, sens));
    if (style === 'ballpoint') return 0.14;
    if (style === 'pencil' || stroke.tool === 'pencil') return 0.36;
    if (style === 'brush') return Math.min(0.96, 0.85 * sensScale);
    return Math.min(0.92, 0.62 * sensScale);
  }

  function prepareSmoothedSamples(stroke) {
    const raw = stroke.points || [];
    if (raw.length === 0) return [];

    const isHl = stroke.tool === 'highlighter';
    const penStyle = stroke.penStyle || 'fountain';
    const size = Math.max(1, stroke.size || 5);
    const smoothing = Math.max(0, Math.min(1.0, stroke.smoothing ?? 0.65));
    const thinning = getStrokeThinning(stroke);
    const simulatePressure = Boolean(stroke.simulatePressure && stroke.pressureMode !== 'uniform' && !isHl);

    // 1. Décimation des points trop proches (< 1.15 px) pour éviter la surcharge sur les longs traits
    const filtered = [];
    const minFilterDist = 1.15;
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const pr = typeof p.pressure === 'number' && Number.isFinite(p.pressure) ? Math.max(0.05, Math.min(1, p.pressure)) : 0.5;
      const tx = typeof p.tiltX === 'number' && Number.isFinite(p.tiltX) ? p.tiltX : 0;
      const ty = typeof p.tiltY === 'number' && Number.isFinite(p.tiltY) ? p.tiltY : 0;
      const tm = typeof p.t === 'number' && Number.isFinite(p.t) ? p.t : i * 4;
      if (filtered.length === 0) {
        filtered.push({ x: p.x, y: p.y, p: pr, tiltX: tx, tiltY: ty, t: tm });
      } else {
        const last = filtered[filtered.length - 1];
        const d = Math.hypot(p.x - last.x, p.y - last.y);
        if (d >= minFilterDist || i === raw.length - 1) {
          filtered.push({ x: p.x, y: p.y, p: pr, tiltX: tx, tiltY: ty, t: tm });
        }
      }
    }
    if (filtered.length === 0) return [];
    if (filtered.length === 1) {
      return [{ x: filtered[0].x, y: filtered[0].y, r: Math.max(0.45, thinning ? getStrokeRadius(size, thinning, filtered[0].p) : size * 0.5) }];
    }

    // 2. Filtre adaptatif One-Euro + Amortissement d'angles vifs (uniquement pour les traits non stabilisés en direct)
    let pts = filtered;
    if (!stroke._liveStabilized && smoothing > 0.12 && pts.length >= 4) {
      const minCutoff = Math.max(0.85, 4.4 - smoothing * 3.3);
      const beta = 0.016 + (1 - smoothing) * 0.045;
      const fxState = { initialized: false, minCutoff, beta, dCutoff: 1.0, xPrev: 0, dxPrev: 0, tPrev: 0 };
      const fyState = { initialized: false, minCutoff, beta, dCutoff: 1.0, xPrev: 0, dxPrev: 0, tPrev: 0 };
      const wBase = Math.min(0.22, smoothing * 0.22);
      const nextPts = new Array(pts.length);
      nextPts[0] = pts[0];
      oneEuroFilterStep(pts[0].x, pts[0].t * 0.001, fxState);
      oneEuroFilterStep(pts[0].y, pts[0].t * 0.001, fyState);

      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1];
        const tSec = (b.t || i * 4) * 0.001;
        const euroX = oneEuroFilterStep(b.x, tSec, fxState);
        const euroY = oneEuroFilterStep(b.y, tSec, fyState);

        // Détection d'angle aigu / crochet (GoodNotes StylusPointFilter fn#73877 : cos(theta) < -0.766044)
        const ux = b.x - a.x, uy = b.y - a.y;
        const vx = c.x - b.x, vy = c.y - b.y;
        const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
        let turnDamp = 1.0;
        if (lu > 0.3 && lv > 0.3) {
          const cosTheta = (ux * vx + uy * vy) / (lu * lv);
          if (cosTheta < -0.766044) {
            turnDamp = Math.max(0.70, Math.min(0.95, ((cosTheta + 1) / -0.233956) * 0.25 + 0.95));
          }
        }
        const w = wBase * turnDamp;
        const symX = b.x * (1 - 2 * w) + (a.x + c.x) * w;
        const symY = b.y * (1 - 2 * w) + (a.y + c.y) * w;
        const blendEuro = Math.min(0.35, smoothing * 0.35) * turnDamp;
        nextPts[i] = {
          x: symX * (1 - blendEuro) + euroX * blendEuro,
          y: symY * (1 - blendEuro) + euroY * blendEuro,
          p: (b.p * 0.52 + (a.p + c.p) * 0.24) * (turnDamp < 1 ? (0.85 + 0.15 * turnDamp) : 1),
          tiltX: b.tiltX,
          tiltY: b.tiltY,
          t: b.t
        };
      }
      nextPts[pts.length - 1] = pts[pts.length - 1];
      pts = nextPts;
    }

    // 3. Subdivision Catmull-Rom fluide pour garantir des courbes continues sans cassures angulaires
    const dense = [{ x: pts[0].x, y: pts[0].y, p: pts[0].p, tiltX: pts[0].tiltX || 0, tiltY: pts[0].tiltY || 0, runningLength: 0 }];
    let runningLength = 0;
    const maxStep = Math.max(2.2, Math.min(5.5, size * 0.65));

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      const segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      let isSharpCurve = false;
      if (i > 0 && i < pts.length - 2) {
        const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
        const v2x = p2.x - p1.x, v2y = p2.y - p1.y;
        const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
        if (l1 > 0.4 && l2 > 0.4 && (v1x * v2x + v1y * v2y) / (l1 * l2) < 0.90) {
          isSharpCurve = true;
        }
      }

      const subSteps = segDist > maxStep || isSharpCurve
        ? Math.min(5, Math.max(2, Math.ceil(segDist / maxStep)))
        : 1;

      for (let s = 1; s <= subSteps; s++) {
        const t = s / subSteps;
        const cx = s === subSteps ? p2.x : catmullRomValue(p0.x, p1.x, p2.x, p3.x, t);
        const cy = s === subSteps ? p2.y : catmullRomValue(p0.y, p1.y, p2.y, p3.y, t);
        const cp = p1.p + (p2.p - p1.p) * t;
        const cTx = (p1.tiltX || 0) + ((p2.tiltX || 0) - (p1.tiltX || 0)) * t;
        const cTy = (p1.tiltY || 0) + ((p2.tiltY || 0) - (p1.tiltY || 0)) * t;
        const prev = dense[dense.length - 1];
        const d = Math.hypot(cx - prev.x, cy - prev.y);
        if (d < 0.45 && !(i === pts.length - 2 && s === subSteps)) continue;
        runningLength += d;
        dense.push({ x: cx, y: cy, p: cp, tiltX: cTx, tiltY: cTy, dist: d, runningLength });
      }
    }

    // 4. Profil de rayon identique au rendu temps réel (aucun épaississement ni saut au relâchement du stylet)
    const totalLength = runningLength;
    const tipSharp = typeof stroke.tipSharpness === 'number' ? stroke.tipSharpness : 0.5;
    const taperScale = penStyle === 'ballpoint' ? 0.25 : (0.35 + tipSharp * 0.75);
    const taperStart = isHl || totalLength < size * 2.8 ? 0 : Math.min(6, size * 0.45 * taperScale);
    const taperEnd = isHl || totalLength < size * 2.8 ? 0 : Math.min(8, size * 0.60 * taperScale);
    let prevR = thinning ? getStrokeRadius(size, thinning, dense[0].p) : size * 0.5;

    const samples = new Array(dense.length);
    for (let i = 0; i < dense.length; i++) {
      const pt = dense[i];
      const rawR = thinning ? getStrokeRadius(size, thinning, pt.p) : size * 0.5;
      let r = i === 0 ? rawR : (prevR * 0.4 + rawR * 0.6);
      if (taperStart > 0 && pt.runningLength < taperStart) {
        r *= Math.max(0.45, pt.runningLength / taperStart);
      }
      if (taperEnd > 0 && totalLength - pt.runningLength < taperEnd) {
        r *= Math.max(0.40, (totalLength - pt.runningLength) / taperEnd);
      }
      r = Math.max(0.45, r);
      if (i > 0 && pt.dist > 0) {
        const maxDeltaR = Math.max(0.18, pt.dist * 0.45);
        if (Math.abs(r - prevR) > maxDeltaR) {
          r = prevR + Math.sign(r - prevR) * maxDeltaR;
        }
      }
      prevR = r;
      samples[i] = { x: pt.x, y: pt.y, r };
    }
    return samples;
  }

  function addSegmentQuadToPath2D(path, c1, c2) {
    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    const d = Math.hypot(dx, dy);
    if (d <= 1e-3) return;

    const ux = dx / d;
    const uy = dy / d;
    const px = uy;
    const py = -ux;

    // Si la différence de rayon est inférieure à la distance, tangentes coniques exactes ;
    // sinon, trapèze perpendiculaire continu pour ne JAMAIS laisser de trou entre c1 et c2.
    let nLx = px, nLy = py, nRx = -px, nRy = -py;
    if (Math.abs(c1.r - c2.r) < d * 0.96) {
      const sinA = (c1.r - c2.r) / d;
      const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
      nLx = ux * sinA + px * cosA;
      nLy = uy * sinA + py * cosA;
      nRx = ux * sinA - px * cosA;
      nRy = uy * sinA - py * cosA;
    }

    const ax = c1.x + c1.r * nLx, ay = c1.y + c1.r * nLy;
    const bx = c2.x + c2.r * nLx, by = c2.y + c2.r * nLy;
    const cx = c2.x + c2.r * nRx, cy = c2.y + c2.r * nRy;
    const ex = c1.x + c1.r * nRx, ey = c1.y + c1.r * nRy;

    // Garantit un enroulement strictement horaire (+1) pour éliminer tout trou d'auto-intersection
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    path.moveTo(ax, ay);
    if (cross >= 0) {
      path.lineTo(bx, by);
      path.lineTo(cx, cy);
      path.lineTo(ex, ey);
    } else {
      path.lineTo(ex, ey);
      path.lineTo(cx, cy);
      path.lineTo(bx, by);
    }
    path.closePath();
  }

  function buildCenterlinePath2D(points) {
    if (!points || points.length === 0) return null;
    const path = new Path2D();
    path.moveTo(points[0].x, points[0].y);
    if (points.length === 2) {
      path.lineTo(points[1].x, points[1].y);
      return path;
    }
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      path.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5);
    }
    const last = points[points.length - 1];
    path.lineTo(last.x, last.y);
    return path;
  }

  function buildStrokePath2D(stroke) {
    const raw = stroke.points || [];
    if (raw.length === 0) return null;

    // Pour le surligneur, le mode épaisseur uniforme ou les traits tiretés/pointillés,
    // un unique Path2D de ligne médiane lissée rendu par GPU (ctx.stroke) est 25x plus rapide.
    if (stroke.tool === 'highlighter' || stroke.pressureMode === 'uniform' || (stroke.lineStyle && stroke.lineStyle !== 'solid')) {
      stroke._renderMode = 'stroke';
      return buildCenterlinePath2D(raw);
    }

    const samples = prepareSmoothedSamples(stroke);
    if (samples.length === 0) return null;
    stroke._renderMode = 'fill';

    const path = new Path2D();
    const lastIdx = samples.length - 1;
    for (let i = 0; i <= lastIdx; i++) {
      const s = samples[i];
      // Ajoute systématiquement le disque de jonction à chaque point pour sceller 100 % des raccords entre trapèzes
      path.moveTo(s.x + s.r, s.y);
      path.arc(s.x, s.y, s.r, 0, Math.PI * 2, false);
      path.closePath();
      if (i < lastIdx) {
        addSegmentQuadToPath2D(path, s, samples[i + 1]);
      }
    }
    return path;
  }

  function buildStrokePathData(stroke) {
    const samples = prepareSmoothedSamples(stroke);
    if (samples.length === 0) return '';
    const parts = [];
    const lastIdx = samples.length - 1;
    for (let i = 0; i <= lastIdx; i++) {
      const s = samples[i];
      const r = s.r.toFixed(2);
      const sy = s.y.toFixed(2);
      const sxLeft = (s.x - s.r).toFixed(2);
      const sxRight = (s.x + s.r).toFixed(2);
      parts.push(`M ${sxRight} ${sy} A ${r} ${r} 0 1 0 ${sxLeft} ${sy} A ${r} ${r} 0 1 0 ${sxRight} ${sy} Z`);
      if (i < lastIdx) {
        const c1 = s, c2 = samples[i + 1];
        const dx = c2.x - c1.x, dy = c2.y - c1.y, d = Math.hypot(dx, dy);
        if (d > 1e-3) {
          const ux = dx / d, uy = dy / d;
          const px = uy, py = -ux;
          let nLx = px, nLy = py, nRx = -px, nRy = -py;
          if (Math.abs(c1.r - c2.r) < d * 0.96) {
            const sinA = (c1.r - c2.r) / d;
            const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
            nLx = ux * sinA + px * cosA;
            nLy = uy * sinA + py * cosA;
            nRx = ux * sinA - px * cosA;
            nRy = uy * sinA - py * cosA;
          }
          const ax = c1.x + c1.r * nLx, ay = c1.y + c1.r * nLy;
          const bx = c2.x + c2.r * nLx, by = c2.y + c2.r * nLy;
          const cx = c2.x + c2.r * nRx, cy = c2.y + c2.r * nRy;
          const ex = c1.x + c1.r * nRx, ey = c1.y + c1.r * nRy;
          const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
          if (cross >= 0) {
            parts.push(`M ${ax.toFixed(2)} ${ay.toFixed(2)} L ${bx.toFixed(2)} ${by.toFixed(2)} L ${cx.toFixed(2)} ${cy.toFixed(2)} L ${ex.toFixed(2)} ${ey.toFixed(2)} Z`);
          } else {
            parts.push(`M ${ax.toFixed(2)} ${ay.toFixed(2)} L ${ex.toFixed(2)} ${ey.toFixed(2)} L ${cx.toFixed(2)} ${cy.toFixed(2)} L ${bx.toFixed(2)} ${by.toFixed(2)} Z`);
          }
        }
      }
    }
    return parts.join(' ');
  }

  // ============================================================================
  // 3B. DÉTECTION DE FORMES GÉOMÉTRIQUES AU MAINTIEN (HOLD-TO-SHAPE)
  // ============================================================================

  function resamplePolyline(points, count = 64) {
    if (!points || points.length === 0) return [];
    if (points.length === 1) return [points[0]];
    const cumLen = [0];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      cumLen.push(total);
    }
    if (total < 1) return [points[0]];
    const out = [{ x: points[0].x, y: points[0].y }];
    let segIdx = 0;
    for (let k = 1; k < count - 1; k++) {
      const target = (k / (count - 1)) * total;
      while (segIdx < cumLen.length - 2 && cumLen[segIdx + 1] < target) segIdx++;
      const segStart = cumLen[segIdx];
      const segEnd = cumLen[segIdx + 1];
      const denom = Math.max(1e-6, segEnd - segStart);
      const t = (target - segStart) / denom;
      out.push({
        x: points[segIdx].x + (points[segIdx + 1].x - points[segIdx].x) * t,
        y: points[segIdx].y + (points[segIdx + 1].y - points[segIdx].y) * t
      });
    }
    out.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
    return out;
  }

  function pointToSegmentDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function pointToLineDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
  }

  function rdpSimplify(pts, eps) {
    if (pts.length <= 2) return pts.slice();
    let maxDist = 0, maxIdx = 0;
    const first = pts[0], last = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = pointToSegmentDist(pts[i], first, last);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > eps) {
      const left = rdpSimplify(pts.slice(0, maxIdx + 1), eps);
      const right = rdpSimplify(pts.slice(maxIdx), eps);
      return left.slice(0, -1).concat(right);
    }
    return [first, last];
  }

  function computePolygonCorners(closedPts, diag) {
    // Trouve le point le plus éloigné du centre pour démarrer la simplification RDP sans couper un sommet
    let cx = 0, cy = 0;
    for (const p of closedPts) { cx += p.x; cy += p.y; }
    cx /= closedPts.length; cy /= closedPts.length;
    let farIdx = 0, farDist = -1;
    for (let i = 0; i < closedPts.length; i++) {
      const d = Math.hypot(closedPts[i].x - cx, closedPts[i].y - cy);
      if (d > farDist) { farDist = d; farIdx = i; }
    }
    const reordered = closedPts.slice(farIdx).concat(closedPts.slice(0, farIdx), [closedPts[farIdx]]);
    let corners = rdpSimplify(reordered, Math.max(8, diag * 0.055));
    if (corners.length > 1) corners.pop();

    // Fusionne les sommets quasi colinéaires (< 28 deg de déviation)
    let changed = true;
    while (changed && corners.length > 3) {
      changed = false;
      for (let i = 0; i < corners.length; i++) {
        const prev = corners[(i - 1 + corners.length) % corners.length];
        const curr = corners[i];
        const next = corners[(i + 1) % corners.length];
        const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
        const v2x = next.x - curr.x, v2y = next.y - curr.y;
        const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
        if (l1 < diag * 0.10 || l2 < diag * 0.10) {
          corners.splice(i, 1);
          changed = true;
          break;
        }
        const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
        if (dot > 0.87) {
          corners.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    return corners;
  }

  function computePolygonRmsError(samples, vertices, diag) {
    let sumSq = 0;
    for (const p of samples) {
      let best = Infinity;
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i], b = vertices[(i + 1) % vertices.length];
        const d = pointToSegmentDist(p, a, b);
        if (d < best) best = d;
      }
      sumSq += best * best;
    }
    return Math.sqrt(sumSq / samples.length) / Math.max(1, diag);
  }

  // ============================================================================
  // MOTEUR DE RECONNAISSANCE DE FORMES (GoodNotes ShapeRecognition / ShapeBeautifier)
  // Fitters : Line, Arrow, Ellipse, Triangle, Rectangle, Diamond, NGon/Polygon,
  //           Elbow/Polyline, SmoothHobby Arc + ChamferDistanceEstimator + SideSnapping
  // ============================================================================

  function snapLineEndpoint45(x1, y1, x2, y2, degTol = 5.0) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) return { x: x2, y: y2 };
    const ang = Math.atan2(dy, dx);
    const step = Math.PI / 4; // 45 deg
    const nearest = Math.round(ang / step) * step;
    const tolRad = (degTol * Math.PI) / 180;
    if (Math.abs(ang - nearest) <= tolRad) {
      if (Math.abs(Math.sin(nearest)) < 1e-4) return { x: x1 + Math.sign(Math.cos(nearest)) * len, y: y1 };
      if (Math.abs(Math.cos(nearest)) < 1e-4) return { x: x1, y: y1 + Math.sign(Math.sin(nearest)) * len };
      return { x: x1 + Math.cos(nearest) * len, y: y1 + Math.sin(nearest) * len };
    }
    return { x: x2, y: y2 };
  }

  function samplePolylineUniform(vertices, closed, count = 48) {
    if (!vertices || vertices.length < 2) return [];
    const pts = closed ? vertices.concat([vertices[0]]) : vertices;
    return resamplePolyline(pts, count);
  }

  function sampleEllipseUniform(cx, cy, rx, ry, angle, count = 48) {
    const out = [];
    const cosA = Math.cos(angle || 0);
    const sinA = Math.sin(angle || 0);
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;
      const lx = Math.cos(t) * rx;
      const ly = Math.sin(t) * ry;
      out.push({ x: cx + lx * cosA - ly * sinA, y: cy + lx * sinA + ly * cosA });
    }
    return out;
  }

  function sampleCubicBezierUniform(p0, c1, c2, p3, count = 48) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);
      const mt = 1 - t;
      const b0 = mt * mt * mt;
      const b1 = 3 * mt * mt * t;
      const b2 = 3 * mt * t * t;
      const b3 = t * t * t;
      out.push({
        x: b0 * p0.x + b1 * c1.x + b2 * c2.x + b3 * p3.x,
        y: b0 * p0.y + b1 * c1.y + b2 * c2.y + b3 * p3.y
      });
    }
    return out;
  }

  // ChamferDistanceEstimator (bidirectionnel normalisé par la diagonale)
  function computeBidirectionalChamferError(strokePts, shapePts, diag) {
    if (!strokePts.length || !shapePts.length) return Infinity;
    let sumA = 0;
    for (let i = 0; i < strokePts.length; i++) {
      const p = strokePts[i];
      let best = Infinity;
      for (let j = 0; j < shapePts.length; j++) {
        const q = shapePts[j];
        const dSq = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
        if (dSq < best) best = dSq;
      }
      sumA += Math.sqrt(best);
    }
    let sumB = 0;
    for (let j = 0; j < shapePts.length; j++) {
      const q = shapePts[j];
      let best = Infinity;
      for (let i = 0; i < strokePts.length; i++) {
        const p = strokePts[i];
        const dSq = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
        if (dSq < best) best = dSq;
      }
      sumB += Math.sqrt(best);
    }
    return ((sumA / strokePts.length) + (sumB / shapePts.length)) * 0.5 / Math.max(1, diag);
  }

  // SmoothHobbyFitter / CubicCurveFitting (moindres carrés régularisés sur base de Bernstein)
  function fitSmoothCubicCurve(pts, diag) {
    const p0 = pts[0];
    const p3 = pts[pts.length - 1];
    const n = pts.length;
    if (n < 4) {
      return [
        { x: p0.x, y: p0.y },
        { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 },
        { x: p0.x + (p3.x - p0.x) * 2 / 3, y: p0.y + (p3.y - p0.y) * 2 / 3 },
        { x: p3.x, y: p3.y }
      ];
    }
    const cum = [0];
    for (let i = 1; i < n; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const total = Math.max(1e-5, cum[n - 1]);
    let a11 = 1e-4, a12 = 0, a22 = 1e-4;
    let r1x = 0, r1y = 0, r2x = 0, r2y = 0;
    for (let i = 0; i < n; i++) {
      const t = cum[i] / total;
      const mt = 1 - t;
      const b0 = mt * mt * mt;
      const b1 = 3 * mt * mt * t;
      const b2 = 3 * mt * t * t;
      const b3 = t * t * t;
      a11 += b1 * b1;
      a12 += b1 * b2;
      a22 += b2 * b2;
      const rx = pts[i].x - b0 * p0.x - b3 * p3.x;
      const ry = pts[i].y - b0 * p0.y - b3 * p3.y;
      r1x += b1 * rx; r1y += b1 * ry;
      r2x += b2 * rx; r2y += b2 * ry;
    }
    const det = a11 * a22 - a12 * a12;
    let c1x, c1y, c2x, c2y;
    if (Math.abs(det) < 1e-6) {
      const mid = pts[Math.floor(n * 0.5)];
      c1x = p0.x + (mid.x - p0.x) * 0.9;
      c1y = p0.y + (mid.y - p0.y) * 0.9;
      c2x = p3.x + (mid.x - p3.x) * 0.9;
      c2y = p3.y + (mid.y - p3.y) * 0.9;
    } else {
      c1x = (a22 * r1x - a12 * r2x) / det;
      c1y = (a22 * r1y - a12 * r2y) / det;
      c2x = (a11 * r2x - a12 * r1x) / det;
      c2y = (a11 * r2y - a12 * r1y) / det;
    }
    const maxArm = Math.max(40, diag * 1.45);
    const clampPt = (anchor, cx, cy) => {
      const d = Math.hypot(cx - anchor.x, cy - anchor.y);
      if (d > maxArm) {
        const sc = maxArm / d;
        return { x: anchor.x + (cx - anchor.x) * sc, y: anchor.y + (cy - anchor.y) * sc };
      }
      return { x: cx, y: cy };
    };
    return [
      { x: p0.x, y: p0.y },
      clampPt(p0, c1x, c1y),
      clampPt(p3, c2x, c2y),
      { x: p3.x, y: p3.y }
    ];
  }

  // ElbowPolylineFitter & PolylineFitter (simplification RDP + redressement orthogonal H/V)
  function simplifyAndSnapOpenPolyline(pts, diag) {
    let eps = Math.max(6, diag * 0.055);
    let verts = rdpSimplify(pts, eps);
    let guard = 0;
    while (verts.length > 7 && guard < 6) {
      eps *= 1.35;
      verts = rdpSimplify(pts, eps);
      guard++;
    }
    const cleaned = [verts[0]];
    for (let i = 1; i < verts.length; i++) {
      const prev = cleaned[cleaned.length - 1];
      const cur = verts[i];
      if (Math.hypot(cur.x - prev.x, cur.y - prev.y) >= Math.max(8, diag * 0.065) || i === verts.length - 1) {
        cleaned.push({ x: cur.x, y: cur.y });
      }
    }
    const orthoTol = (9.0 * Math.PI) / 180;
    const snapped = cleaned.map((v) => ({ x: v.x, y: v.y }));
    for (let i = 1; i < snapped.length; i++) {
      const a = snapped[i - 1];
      const b = snapped[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.hypot(dx, dy) < 6) continue;
      const ang = Math.atan2(dy, dx);
      if (Math.abs(ang) < orthoTol || Math.abs(Math.abs(ang) - Math.PI) < orthoTol) {
        b.y = a.y;
      } else if (Math.abs(Math.abs(ang) - Math.PI / 2) < orthoTol) {
        b.x = a.x;
      }
    }
    return snapped;
  }

  // ============================================================================
  // MOTEUR DE CONNEXION MAGNETIQUE DES FORMES (GoodNotes ShapeToolConnectionPointsViewModel
  // + SerializedLineNotesItem.LineConnection + intersectionPoint + SideSnapping)
  // ============================================================================

  function isConnectableTargetShape(sh) {
    if (!sh) return false;
    return sh.type === 'ellipse' || sh.type === 'rect' || sh.type === 'roundedRect' ||
      sh.type === 'diamond' || sh.type === 'triangle' || sh.type === 'polygon';
  }

  function isConnectorShape(sh) {
    if (!sh) return false;
    return sh.type === 'line' || sh.type === 'arrow' || sh.type === 'elbowArrow' ||
      sh.type === 'curvedArrow' || sh.type === 'polyline' || sh.type === 'arc';
  }

  function isConnectorToolMode() {
    if (state.tool !== 'shape') return false;
    return state.shapeType === 'auto' || state.shapeType === 'line' || state.shapeType === 'arrow' ||
      state.shapeType === 'elbowArrow' || state.shapeType === 'curvedArrow';
  }

  function getClosedShapeLocalFrame(sh) {
    if (sh.type === 'ellipse' || sh.type === 'rect' || sh.type === 'roundedRect') {
      const cx = (sh.x1 + sh.x2) * 0.5;
      const cy = (sh.y1 + sh.y2) * 0.5;
      const hw = Math.max(1, Math.abs(sh.x2 - sh.x1) * 0.5);
      const hh = Math.max(1, Math.abs(sh.y2 - sh.y1) * 0.5);
      return { cx, cy, hw, hh, angle: sh.angle || 0 };
    }
    const bb = getShapeBoundingBox(sh);
    const cx = (bb.minX + bb.maxX) * 0.5;
    const cy = (bb.minY + bb.maxY) * 0.5;
    const hw = Math.max(1, (bb.maxX - bb.minX) * 0.5);
    const hh = Math.max(1, (bb.maxY - bb.minY) * 0.5);
    return { cx, cy, hw, hh, angle: 0 };
  }

  function getClosedShapePolygonVertices(sh) {
    if (sh.type === 'triangle' || sh.type === 'diamond' || sh.type === 'polygon') {
      return getShapeVertices(sh);
    }
    if (sh.type === 'rect' || sh.type === 'roundedRect') {
      const { cx, cy, hw, hh, angle } = getClosedShapeLocalFrame(sh);
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const toW = (lx, ly) => ({ x: cx + lx * cosA - ly * sinA, y: cy + lx * sinA + ly * cosA });
      return [toW(-hw, -hh), toW(hw, -hh), toW(hw, hh), toW(-hw, hh)];
    }
    return null;
  }

  function worldPointToShapeNormalizedAnchor(sh, pt) {
    const { cx, cy, hw, hh, angle } = getClosedShapeLocalFrame(sh);
    const dx = pt.x - cx, dy = pt.y - cy;
    const cosA = Math.cos(-angle), sinA = Math.sin(-angle);
    const lx = dx * cosA - dy * sinA;
    const ly = dx * sinA + dy * cosA;
    return { nx: lx / hw, ny: ly / hh };
  }

  function resolveShapeAnchorWorldPoint(sh, conn) {
    if (!sh || !conn) return null;
    const { cx, cy, hw, hh, angle } = getClosedShapeLocalFrame(sh);
    const lx = conn.nx * hw;
    const ly = conn.ny * hh;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    return {
      x: cx + lx * cosA - ly * sinA,
      y: cy + lx * sinA + ly * cosA
    };
  }

  // Ports cardinaux (N, E, S, W + sommets / milieux d'arêtes façon GoodNotes ConnectionPointsPreview)
  function getShapeConnectionPorts(sh) {
    if (!isConnectableTargetShape(sh)) return [];
    const { cx, cy, hw, hh, angle } = getClosedShapeLocalFrame(sh);
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const fromLocal = (nx, ny) => {
      const lx = nx * hw, ly = ny * hh;
      return { x: cx + lx * cosA - ly * sinA, y: cy + lx * sinA + ly * cosA, nx, ny };
    };
    if (sh.type === 'ellipse') {
      return [fromLocal(0, -1), fromLocal(1, 0), fromLocal(0, 1), fromLocal(-1, 0)];
    }
    if (sh.type === 'rect' || sh.type === 'roundedRect') {
      return [
        fromLocal(0, -1), fromLocal(1, 0), fromLocal(0, 1), fromLocal(-1, 0),
        fromLocal(-1, -1), fromLocal(1, -1), fromLocal(1, 1), fromLocal(-1, 1)
      ];
    }
    const verts = getClosedShapePolygonVertices(sh);
    if (!verts || verts.length < 3) return [];
    const ports = [];
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      const na = worldPointToShapeNormalizedAnchor(sh, a);
      ports.push({ x: a.x, y: a.y, nx: na.nx, ny: na.ny });
      const mid = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
      const nm = worldPointToShapeNormalizedAnchor(sh, mid);
      ports.push({ x: mid.x, y: mid.y, nx: nm.nx, ny: nm.ny });
    }
    return ports;
  }

  function intersectRayWithSegment(o, d, a, b) {
    const sx = b.x - a.x, sy = b.y - a.y;
    const denom = d.x * sy - d.y * sx;
    if (Math.abs(denom) < 1e-6) return null;
    const qx = a.x - o.x, qy = a.y - o.y;
    const t = (qx * sy - qy * sx) / denom;
    const u = (qx * d.y - qy * d.x) / denom;
    if (u >= -1e-4 && u <= 1 + 1e-4) return { t, x: o.x + t * d.x, y: o.y + t * d.y };
    return null;
  }

  // Projection exacte sur le bord (cercle/ellipse ou polygone) + intersection de rayon (trim overshoot / extend short gap)
  function projectPointAndRayToShapeBoundary(sh, pt, fromPt = null, snapRadius = 30) {
    if (!isConnectableTargetShape(sh)) return null;

    if (sh.type === 'ellipse') {
      const { cx, cy, hw: rx, hh: ry, angle } = getClosedShapeLocalFrame(sh);
      const cosNeg = Math.cos(-angle), sinNeg = Math.sin(-angle);
      const cosPos = Math.cos(angle), sinPos = Math.sin(angle);
      const toUnit = (p) => {
        const dx = p.x - cx, dy = p.y - cy;
        return {
          x: (dx * cosNeg - dy * sinNeg) / rx,
          y: (dx * sinNeg + dy * cosNeg) / ry
        };
      };
      const fromUnit = (u) => ({
        x: cx + (u.x * rx) * cosPos - (u.y * ry) * sinPos,
        y: cy + (u.x * rx) * sinPos + (u.y * ry) * cosPos
      });

      const uPt = toUnit(pt);
      const ptNorm = Math.hypot(uPt.x, uPt.y);
      const isInside = ptNorm < 1.0;

      // Intersection exacte rayon -> cercle unité si l'autre extrémité est hors du cercle
      if (fromPt) {
        const uFrom = toUnit(fromPt);
        const fromNorm = Math.hypot(uFrom.x, uFrom.y);
        const segLenWorld = Math.hypot(pt.x - fromPt.x, pt.y - fromPt.y);
        if (fromNorm > 1.03 && segLenWorld > 4) {
          const dx = uPt.x - uFrom.x;
          const dy = uPt.y - uFrom.y;
          const a = dx * dx + dy * dy;
          const b = 2 * (uFrom.x * dx + uFrom.y * dy);
          const c = uFrom.x * uFrom.x + uFrom.y * uFrom.y - 1;
          const disc = b * b - 4 * a * c;
          if (disc >= 0 && a > 1e-6) {
            const sqrtD = Math.sqrt(disc);
            const tHit = (-b - sqrtD) / (2 * a); // premier point d'entrée sur le bord du cercle
            const maxT = 1 + (snapRadius / Math.max(8, segLenWorld));
            if (tHit >= 0 && tHit <= maxT) {
              const hx = uFrom.x + tHit * dx;
              const hy = uFrom.y + tHit * dy;
              const hn = Math.max(1e-6, Math.hypot(hx, hy));
              const nx = hx / hn, ny = hy / hn;
              const worldHit = fromUnit({ x: nx, y: ny });
              const hitDist = Math.hypot(pt.x - worldHit.x, pt.y - worldHit.y);
              if (isInside || hitDist <= snapRadius * 1.25) {
                return { x: worldHit.x, y: worldHit.y, nx, ny, dist: isInside ? 0 : hitDist, isInside, hitByRay: true };
              }
            }
          }
        }
      }

      // Projection orthogonale directe sur le bord du cercle/ellipse
      let nx = 1, ny = 0;
      if (ptNorm > 1e-5) {
        nx = uPt.x / ptNorm;
        ny = uPt.y / ptNorm;
      } else if (fromPt) {
        const uFrom = toUnit(fromPt);
        const fn = Math.hypot(uFrom.x, uFrom.y);
        if (fn > 1e-5) { nx = uFrom.x / fn; ny = uFrom.y / fn; }
      }
      const rimWorld = fromUnit({ x: nx, y: ny });
      const dist = Math.hypot(pt.x - rimWorld.x, pt.y - rimWorld.y);
      return { x: rimWorld.x, y: rimWorld.y, nx, ny, dist, isInside, hitByRay: false };
    }

    // Polygones, rectangles, losanges, triangles
    const verts = getClosedShapePolygonVertices(sh);
    if (!verts || verts.length < 3) return null;
    const isInside = pointInPolygon(pt.x, pt.y, verts);

    if (fromPt && !pointInPolygon(fromPt.x, fromPt.y, verts)) {
      const segLen = Math.hypot(pt.x - fromPt.x, pt.y - fromPt.y);
      if (segLen > 4) {
        const d = { x: pt.x - fromPt.x, y: pt.y - fromPt.y };
        const maxT = 1 + (snapRadius / Math.max(8, segLen));
        let bestHit = null;
        for (let i = 0; i < verts.length; i++) {
          const hit = intersectRayWithSegment(fromPt, d, verts[i], verts[(i + 1) % verts.length]);
          if (hit && hit.t >= 0 && hit.t <= maxT) {
            if (!bestHit || hit.t < bestHit.t) bestHit = hit;
          }
        }
        if (bestHit) {
          const hitDist = Math.hypot(pt.x - bestHit.x, pt.y - bestHit.y);
          if (isInside || hitDist <= snapRadius * 1.25) {
            const norm = worldPointToShapeNormalizedAnchor(sh, bestHit);
            return { x: bestHit.x, y: bestHit.y, nx: norm.nx, ny: norm.ny, dist: isInside ? 0 : hitDist, isInside, hitByRay: true };
          }
        }
      }
    }

    let bestPt = null, bestDist = Infinity;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq < 1e-6 ? 0 : Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq));
      const px = a.x + t * dx, py = a.y + t * dy;
      const dist = Math.hypot(pt.x - px, pt.y - py);
      if (dist < bestDist) { bestDist = dist; bestPt = { x: px, y: py }; }
    }
    if (!bestPt) return null;
    const norm = worldPointToShapeNormalizedAnchor(sh, bestPt);
    return { x: bestPt.x, y: bestPt.y, nx: norm.nx, ny: norm.ny, dist: bestDist, isInside, hitByRay: false };
  }

  function findShapeConnectionSnap(pt, existingShapes, options = {}) {
    if (!pt || !Array.isArray(existingShapes) || existingShapes.length === 0) return null;
    const fromPt = options.fromPt || null;
    const zoomFactor = Math.max(0.4, state.zoom || 1);
    const snapRadius = options.snapRadius || Math.max(20, Math.min(42, 30 / zoomFactor));
    const portRadius = options.portRadius || Math.max(12, Math.min(22, 16 / zoomFactor));
    const excludeShapeId = options.excludeShapeId || null;

    let bestSnap = null;
    let bestPriorityScore = Infinity;

    for (let i = 0; i < existingShapes.length; i++) {
      const sh = existingShapes[i];
      if (!sh || sh.id === excludeShapeId) continue;

      if (isConnectableTargetShape(sh)) {
        const proj = projectPointAndRayToShapeBoundary(sh, pt, fromPt, snapRadius);
        const ports = getShapeConnectionPorts(sh);
        let bestPort = null, bestPortDist = Infinity;
        for (let p = 0; p < ports.length; p++) {
          const d = Math.hypot(pt.x - ports[p].x, pt.y - ports[p].y);
          if (d < bestPortDist) { bestPortDist = d; bestPort = ports[p]; }
        }
        // Si le rayon d'entrée touche très près d'un port cardinal, on préfère le port cardinal net
        if (proj && proj.hitByRay && bestPort) {
          const dRayToPort = Math.hypot(proj.x - bestPort.x, proj.y - bestPort.y);
          if (dRayToPort <= portRadius * 0.85) {
            const score = dRayToPort * 0.5;
            if (score < bestPriorityScore) {
              bestPriorityScore = score;
              bestSnap = {
                x: bestPort.x,
                y: bestPort.y,
                dist: dRayToPort,
                targetShape: sh,
                connection: { shapeId: sh.id, nx: bestPort.nx, ny: bestPort.ny, mode: 'port' }
              };
            }
            continue;
          }
        }
        // 1) Port cardinal direct
        if (bestPort && bestPortDist <= portRadius) {
          const score = bestPortDist * 0.65;
          if (score < bestPriorityScore) {
            bestPriorityScore = score;
            bestSnap = {
              x: bestPort.x,
              y: bestPort.y,
              dist: bestPortDist,
              targetShape: sh,
              connection: { shapeId: sh.id, nx: bestPort.nx, ny: bestPort.ny, mode: 'port' }
            };
          }
          continue;
        }
        // 2) Bord exact du cercle / de la forme (proximité ou trait entrant dans la forme)
        if (proj && (proj.dist <= snapRadius || (proj.isInside && fromPt))) {
          const score = proj.hitByRay ? Math.min(proj.dist, snapRadius * 0.4) : proj.dist;
          if (score < bestPriorityScore) {
            bestPriorityScore = score;
            bestSnap = {
              x: proj.x,
              y: proj.y,
              dist: proj.dist,
              targetShape: sh,
              connection: { shapeId: sh.id, nx: proj.nx, ny: proj.ny, mode: 'border' }
            };
          }
        }
      } else if (isConnectorShape(sh)) {
        // Aimantation secondaire vers les extrémités d'autres lignes/flèches
        const endPts = Array.isArray(sh.vertices) && sh.vertices.length >= 2
          ? [sh.vertices[0], sh.vertices[sh.vertices.length - 1]]
          : [{ x: sh.x1, y: sh.y1 }, { x: sh.x2, y: sh.y2 }];
        for (const ep of endPts) {
          const d = Math.hypot(pt.x - ep.x, pt.y - ep.y);
          if (d <= 16 && d + 4 < bestPriorityScore) {
            bestPriorityScore = d + 4;
            bestSnap = { x: ep.x, y: ep.y, dist: d, targetShape: sh, connection: null };
          }
        }
      }
    }
    return bestSnap;
  }

  function findHoveredConnectableShape(worldPt, existingShapes, hoverRadius = 46) {
    if (!worldPt || !Array.isArray(existingShapes) || existingShapes.length === 0) return null;
    let bestShape = null, bestDist = hoverRadius;
    for (let i = 0; i < existingShapes.length; i++) {
      const sh = existingShapes[i];
      if (!isConnectableTargetShape(sh)) continue;
      const proj = projectPointAndRayToShapeBoundary(sh, worldPt, null, hoverRadius);
      if (!proj) continue;
      const effDist = proj.isInside ? 0 : proj.dist;
      if (effDist <= bestDist) {
        bestDist = effDist;
        bestShape = sh;
      }
    }
    return bestShape;
  }

  // Met à jour automatiquement les traits connectés lorsqu'une forme cible (ex. cercle) est déplacée, redimensionnée ou supprimée
  function updateConnectedShapesForPage(page, movedShapeIds = null) {
    if (!page || !Array.isArray(page.shapes) || page.shapes.length === 0) return false;
    const byId = new Map();
    for (const sh of page.shapes) {
      if (sh && sh.id) byId.set(sh.id, sh);
    }
    let updated = false;
    for (const sh of page.shapes) {
      if (!isConnectorShape(sh)) continue;
      if (!sh.startConnection && !sh.endConnection) continue;
      const selfMoved = movedShapeIds && movedShapeIds.has(sh.id);

      if (sh.startConnection) {
        const target = byId.get(sh.startConnection.shapeId);
        if (!target) {
          delete sh.startConnection;
          updated = true;
        } else if (!selfMoved && (!movedShapeIds || movedShapeIds.has(target.id))) {
          const pt = resolveShapeAnchorWorldPoint(target, sh.startConnection);
          if (pt) {
            if ((sh.type === 'polyline' || sh.type === 'arc') && Array.isArray(sh.vertices) && sh.vertices.length >= 2) {
              const dx = pt.x - sh.vertices[0].x;
              const dy = pt.y - sh.vertices[0].y;
              sh.vertices[0] = pt;
              if (sh.type === 'arc' && sh.vertices.length >= 4) {
                sh.vertices[1] = { x: sh.vertices[1].x + dx * 0.5, y: sh.vertices[1].y + dy * 0.5 };
              }
              const bb = getShapeBoundingBox(sh);
              sh.x1 = bb.minX; sh.y1 = bb.minY; sh.x2 = bb.maxX; sh.y2 = bb.maxY;
            } else {
              sh.x1 = pt.x;
              sh.y1 = pt.y;
            }
            updated = true;
          }
        }
      }

      if (sh.endConnection) {
        const target = byId.get(sh.endConnection.shapeId);
        if (!target) {
          delete sh.endConnection;
          updated = true;
        } else if (!selfMoved && (!movedShapeIds || movedShapeIds.has(target.id))) {
          const pt = resolveShapeAnchorWorldPoint(target, sh.endConnection);
          if (pt) {
            if ((sh.type === 'polyline' || sh.type === 'arc') && Array.isArray(sh.vertices) && sh.vertices.length >= 2) {
              const lastIdx = sh.vertices.length - 1;
              const dx = pt.x - sh.vertices[lastIdx].x;
              const dy = pt.y - sh.vertices[lastIdx].y;
              sh.vertices[lastIdx] = pt;
              if (sh.type === 'arc' && sh.vertices.length >= 4) {
                sh.vertices[2] = { x: sh.vertices[2].x + dx * 0.5, y: sh.vertices[2].y + dy * 0.5 };
              }
              const bb = getShapeBoundingBox(sh);
              sh.x1 = bb.minX; sh.y1 = bb.minY; sh.x2 = bb.maxX; sh.y2 = bb.maxY;
            } else {
              sh.x2 = pt.x;
              sh.y2 = pt.y;
            }
            updated = true;
          }
        }
      }
    }
    return updated;
  }

  // SideSnapping / NearbyShape : connecte automatiquement les extrémités d'un trait/connecteur aux cercles et formes voisines
  function snapShapeToNearbyShapes(shape, existingShapes, snapRadius = 30) {
    if (!shape || !Array.isArray(existingShapes) || existingShapes.length === 0) return shape;
    if (!isConnectorShape(shape)) return shape;

    if (shape.type === 'line' || shape.type === 'arrow' || shape.type === 'elbowArrow' || shape.type === 'curvedArrow') {
      const origStart = { x: shape.x1, y: shape.y1 };
      const origEnd = { x: shape.x2, y: shape.y2 };
      const s1 = findShapeConnectionSnap(origStart, existingShapes, { fromPt: origEnd, snapRadius, excludeShapeId: shape.id });
      const s2 = findShapeConnectionSnap(origEnd, existingShapes, { fromPt: s1 ? { x: s1.x, y: s1.y } : origStart, snapRadius, excludeShapeId: shape.id });
      const newStart = s1 ? { x: s1.x, y: s1.y } : origStart;
      const newEnd = s2 ? { x: s2.x, y: s2.y } : origEnd;
      if (Math.hypot(newEnd.x - newStart.x, newEnd.y - newStart.y) >= 4) {
        if (s1) {
          shape.x1 = s1.x;
          shape.y1 = s1.y;
          if (s1.connection) shape.startConnection = s1.connection;
        }
        if (s2) {
          shape.x2 = s2.x;
          shape.y2 = s2.y;
          if (s2.connection) shape.endConnection = s2.connection;
        }
      }
    } else if ((shape.type === 'polyline' || shape.type === 'arc') && Array.isArray(shape.vertices) && shape.vertices.length >= 2) {
      const lastIdx = shape.vertices.length - 1;
      const s1 = findShapeConnectionSnap(shape.vertices[0], existingShapes, {
        fromPt: shape.vertices[1],
        snapRadius,
        excludeShapeId: shape.id
      });
      const s2 = findShapeConnectionSnap(shape.vertices[lastIdx], existingShapes, {
        fromPt: shape.vertices[lastIdx - 1],
        snapRadius,
        excludeShapeId: shape.id
      });
      if (s1) {
        shape.vertices[0] = { x: s1.x, y: s1.y };
        if (s1.connection) shape.startConnection = s1.connection;
      }
      if (s2) {
        shape.vertices[lastIdx] = { x: s2.x, y: s2.y };
        if (s2.connection) shape.endConnection = s2.connection;
      }
      const bb = getShapeBoundingBox(shape);
      shape.x1 = bb.minX; shape.y1 = bb.minY; shape.x2 = bb.maxX; shape.y2 = bb.maxY;
    }
    return shape;
  }

  function detectShapeFromStroke(rawPoints, color, size, isHighlighter = false, options = {}) {
    const forceSnap = Boolean(options && options.forceSnap);
    const filled = Boolean(options && options.filled);
    const existingShapes = options && options.existingShapes ? options.existingShapes : null;
    const snapToOtherShapes = options && options.snapToOtherShapes !== false;

    if (!rawPoints || rawPoints.length < (forceSnap ? 2 : 5)) return null;
    let totalLen = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < rawPoints.length; i++) {
      const p = rawPoints[i];
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      if (i > 0) totalLen += Math.hypot(p.x - rawPoints[i - 1].x, p.y - rawPoints[i - 1].y);
    }
    const diag = Math.hypot(maxX - minX, maxY - minY);
    if (!forceSnap && (totalLen < 24 || diag < 18)) return null;
    if (forceSnap && totalLen < 5 && diag < 5) return null;

    const finalizeShape = (sh) => {
      if (!sh) return null;
      if (snapToOtherShapes && existingShapes && existingShapes.length > 0) {
        snapShapeToNearbyShapes(sh, existingShapes);
      }
      return sh;
    };

    const pts = resamplePolyline(rawPoints, 64);
    const pFirst = pts[0], pLast = pts[pts.length - 1];
    const endDist = Math.hypot(pLast.x - pFirst.x, pLast.y - pFirst.y);
    const shapeStyle = { color, size: Math.max(2, size), filled, isHighlighter };
    const openShapeStyle = { color, size: Math.max(2, size), filled: false, isHighlighter };

    // En mode outil Formes (forceSnap), un petit tracé très court devient immédiatement un segment propre
    if (forceSnap && (totalLen < 20 || diag < 14)) {
      const snappedEnd = snapLineEndpoint45(pFirst.x, pFirst.y, pLast.x, pLast.y, 6.0);
      return finalizeShape({
        id: createUid('sh'),
        type: 'line',
        x1: pFirst.x,
        y1: pFirst.y,
        x2: snappedEnd.x,
        y2: snappedEnd.y,
        ...openShapeStyle,
        detectedName: 'Ligne'
      });
    }

    // 1. Ligne droite (avec magnétisme 0° / 45° / 90° façon GoodNotes)
    if (endDist > 16 && totalLen / endDist < (forceSnap ? 1.15 : 1.12)) {
      let maxDev = 0;
      for (const p of pts) {
        const d = pointToLineDist(p, pFirst, pLast);
        if (d > maxDev) maxDev = d;
      }
      if (maxDev / endDist < (forceSnap ? 0.085 : 0.065)) {
        const snappedEnd = snapLineEndpoint45(pFirst.x, pFirst.y, pLast.x, pLast.y, forceSnap ? 5.0 : 3.5);
        return finalizeShape({
          id: createUid('sh'),
          type: 'line',
          x1: pFirst.x,
          y1: pFirst.y,
          x2: snappedEnd.x,
          y2: snappedEnd.y,
          ...openShapeStyle,
          detectedName: 'Ligne'
        });
      }
    }

    // 2. ArrowEndpointEstimator : Flèche tracée en un seul mouvement
    let bestArrowScore = Infinity;
    let bestArrowTip = null;
    for (let k = Math.floor(pts.length * 0.42); k <= Math.floor(pts.length * 0.94); k++) {
      const tip = pts[k];
      const shaftLen = Math.hypot(tip.x - pFirst.x, tip.y - pFirst.y);
      if (shaftLen < 22) continue;
      let maxShaftDev = 0;
      for (let i = 1; i < k; i++) {
        const d = pointToSegmentDist(pts[i], pFirst, tip);
        if (d > maxShaftDev) maxShaftDev = d;
      }
      const shaftErr = maxShaftDev / shaftLen;
      if (shaftErr > (forceSnap ? 0.115 : 0.095)) continue;

      let tailLen = 0, maxHeadDist = 0, turns = 0;
      for (let i = k + 1; i < pts.length; i++) {
        tailLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        const df = Math.hypot(pts[i].x - tip.x, pts[i].y - tip.y);
        if (df > maxHeadDist) maxHeadDist = df;
        if (i > k + 1) {
          const v1x = pts[i - 1].x - pts[i - 2].x, v1y = pts[i - 1].y - pts[i - 2].y;
          const v2x = pts[i].x - pts[i - 1].x, v2y = pts[i].y - pts[i - 1].y;
          const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
          if (l1 > 1 && l2 > 1 && (v1x * v2x + v1y * v2y) / (l1 * l2) < -0.25) turns++;
        }
      }
      const sx = (tip.x - pFirst.x) / shaftLen, sy = (tip.y - pFirst.y) / shaftLen;
      let backCount = 0;
      for (let i = k + 1; i < pts.length; i++) {
        const proj = (pts[i].x - tip.x) * sx + (pts[i].y - tip.y) * sy;
        if (proj < -4) backCount++;
      }
      const tailPoints = pts.length - 1 - k;
      if (tailLen >= 13 && maxHeadDist < Math.max(58, shaftLen * 0.58) && maxHeadDist > 6 && backCount >= Math.max(2, tailPoints * 0.35)) {
        const score = shaftErr - turns * 0.01;
        if (score < bestArrowScore) {
          bestArrowScore = score;
          bestArrowTip = tip;
        }
      }
    }
    if (bestArrowTip) {
      const snappedTip = snapLineEndpoint45(pFirst.x, pFirst.y, bestArrowTip.x, bestArrowTip.y, forceSnap ? 5.0 : 3.5);
      return finalizeShape({
        id: createUid('sh'),
        type: 'arrow',
        x1: pFirst.x,
        y1: pFirst.y,
        x2: snappedTip.x,
        y2: snappedTip.y,
        ...openShapeStyle,
        detectedName: 'Flèche'
      });
    }

    // 3. EndpointProximityEstimator : classification forme fermée vs ouverte
    const closedPts = pts.slice();
    let cx = 0, cy = 0;
    for (const p of closedPts) { cx += p.x; cy += p.y; }
    cx /= closedPts.length; cy /= closedPts.length;

    let winding = 0;
    for (let i = 1; i < closedPts.length; i++) {
      const a1 = Math.atan2(closedPts[i - 1].y - cy, closedPts[i - 1].x - cx);
      const a2 = Math.atan2(closedPts[i].y - cy, closedPts[i].x - cx);
      let da = a2 - a1;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      winding += da;
    }

    const isClosed =
      endDist < Math.max(forceSnap ? 42 : 32, diag * (forceSnap ? 0.42 : 0.36)) ||
      Math.abs(winding) > (forceSnap ? 4.35 : 4.65) ||
      (forceSnap && endDist < diag * 0.48 && Math.abs(winding) > 3.5);

    // 4. Formes ouvertes (mode Outil Formes GoodNotes : TOUJOURS converti en Ligne / Polyligne-Angle / Courbe lisse)
    if (!isClosed) {
      if (!forceSnap) return null;

      const snappedLineEnd = snapLineEndpoint45(pFirst.x, pFirst.y, pLast.x, pLast.y, 5.0);
      const lineSamples = samplePolylineUniform([pFirst, snappedLineEnd], false, 48);
      const lineChamfer = computeBidirectionalChamferError(pts, lineSamples, diag);
      let maxLineDev = 0;
      for (const p of pts) {
        const d = pointToSegmentDist(p, pFirst, pLast);
        if (d > maxLineDev) maxLineDev = d;
      }
      if (endDist > 10 && (maxLineDev / Math.max(1, endDist) < 0.11 || lineChamfer < 0.055)) {
        return finalizeShape({
          id: createUid('sh'),
          type: 'line',
          x1: pFirst.x,
          y1: pFirst.y,
          x2: snappedLineEnd.x,
          y2: snappedLineEnd.y,
          ...openShapeStyle,
          detectedName: 'Ligne'
        });
      }

      // ElbowPolylineFitter / PolylineFitter + CornerFinder (détection de coins localisés vs courbure douce)
      const polyVerts = simplifyAndSnapOpenPolyline(pts, diag);
      let polyChamfer = Infinity;
      let sharpCornerCount = 0;
      if (polyVerts.length >= 3) {
        const polySamples = samplePolylineUniform(polyVerts, false, 48);
        polyChamfer = computeBidirectionalChamferError(pts, polySamples, diag);
        for (let i = 1; i < polyVerts.length - 1; i++) {
          const v1x = polyVerts[i].x - polyVerts[i - 1].x;
          const v1y = polyVerts[i].y - polyVerts[i - 1].y;
          const v2x = polyVerts[i + 1].x - polyVerts[i].x;
          const v2y = polyVerts[i + 1].y - polyVerts[i].y;
          const l1 = Math.hypot(v1x, v1y);
          const l2 = Math.hypot(v2x, v2y);
          if (l1 > 6 && l2 > 6) {
            const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
            if (dot < 0.80) sharpCornerCount++;
          }
        }
      }
      // CornerFinder : vérifie si le trait contient un vrai angle vif localisé (fenêtre ±4 pts sur 64) plutôt qu'une courbe douce
      let minLocalCornerDot = 1;
      const win = 4;
      for (let i = win; i < pts.length - win; i++) {
        const ax = pts[i].x - pts[i - win].x;
        const ay = pts[i].y - pts[i - win].y;
        const bx = pts[i + win].x - pts[i].x;
        const by = pts[i + win].y - pts[i].y;
        const la = Math.hypot(ax, ay);
        const lb = Math.hypot(bx, by);
        if (la > 2 && lb > 2) {
          const d = (ax * bx + ay * by) / (la * lb);
          if (d < minLocalCornerDot) minLocalCornerDot = d;
        }
      }
      const hasLocalizedSharpCorner = minLocalCornerDot < 0.72; // angle vif > 44° concentré sur un coin

      // SmoothHobbyFitter (courbe cubique lisse)
      const arcVerts = fitSmoothCubicCurve(pts, diag);
      const arcSamples = sampleCubicBezierUniform(arcVerts[0], arcVerts[1], arcVerts[2], arcVerts[3], 48);
      const arcChamfer = computeBidirectionalChamferError(pts, arcSamples, diag);

      const makeOpenBBox = (verts) => {
        let bx1 = Infinity, by1 = Infinity, bx2 = -Infinity, by2 = -Infinity;
        for (const v of verts) {
          if (v.x < bx1) bx1 = v.x; if (v.y < by1) by1 = v.y;
          if (v.x > bx2) bx2 = v.x; if (v.y > by2) by2 = v.y;
        }
        return { x1: bx1, y1: by1, x2: bx2, y2: by2 };
      };

      if (
        polyVerts.length >= 3 &&
        sharpCornerCount >= 1 &&
        ((hasLocalizedSharpCorner && polyChamfer < 0.055) || polyChamfer < arcChamfer * 0.85)
      ) {
        const bb = makeOpenBBox(polyVerts);
        return finalizeShape({
          id: createUid('sh'),
          type: 'polyline',
          ...bb,
          vertices: polyVerts,
          ...openShapeStyle,
          detectedName: polyVerts.length === 3 ? 'Angle' : 'Polyligne'
        });
      }

      if (arcChamfer <= lineChamfer * 0.90) {
        const bb = makeOpenBBox(arcSamples);
        return finalizeShape({
          id: createUid('sh'),
          type: 'arc',
          ...bb,
          vertices: arcVerts,
          ...openShapeStyle,
          detectedName: 'Courbe'
        });
      }

      return finalizeShape({
        id: createUid('sh'),
        type: 'line',
        x1: pFirst.x,
        y1: pFirst.y,
        x2: snappedLineEnd.x,
        y2: snappedLineEnd.y,
        ...openShapeStyle,
        detectedName: 'Ligne'
      });
    }

    // 5. Formes fermées : compétition multi-fitters via ChamferDistanceEstimator
    let signedArea = 0;
    for (let i = 0; i < closedPts.length; i++) {
      const a = closedPts[i], b = closedPts[(i + 1) % closedPts.length];
      signedArea += a.x * b.y - b.x * a.y;
    }
    const polyArea = Math.abs(signedArea) * 0.5;
    const perim = totalLen + endDist * 0.85;
    const isoQuotient = (4 * Math.PI * polyArea) / Math.max(1, perim * perim);

    let sxx = 0, syy = 0, sxy = 0;
    for (const p of closedPts) {
      const dx = p.x - cx, dy = p.y - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    sxx /= closedPts.length; syy /= closedPts.length; sxy /= closedPts.length;
    let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);

    const cosT = Math.cos(-angle), sinT = Math.sin(-angle);
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const p of closedPts) {
      const dx = p.x - cx, dy = p.y - cy;
      const u = dx * cosT - dy * sinT;
      const v = dx * sinT + dy * cosT;
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
    const rCx = cx + ((uMin + uMax) * 0.5) * Math.cos(angle) - ((vMin + vMax) * 0.5) * Math.sin(angle);
    const rCy = cy + ((uMin + uMax) * 0.5) * Math.sin(angle) + ((vMin + vMax) * 0.5) * Math.cos(angle);
    const rx = Math.max(4, (uMax - uMin) * 0.5);
    const ry = Math.max(4, (vMax - vMin) * 0.5);

    // 5A. EllipseFitter (Cercle / Ellipse)
    let ellSq = 0;
    for (const p of closedPts) {
      const dx = p.x - rCx, dy = p.y - rCy;
      const u = dx * cosT - dy * sinT;
      const v = dx * sinT + dy * cosT;
      const ellVal = Math.sqrt((u / rx) ** 2 + (v / ry) ** 2);
      ellSq += (ellVal - 1) ** 2;
    }
    const ellipseErr = Math.sqrt(ellSq / closedPts.length);
    const ellRatio = Math.max(rx, ry) / Math.max(1, Math.min(rx, ry));
    const isCircle = ellRatio < 1.16;
    const finalEllRx = isCircle ? (rx + ry) * 0.5 : rx;
    const finalEllRy = isCircle ? (rx + ry) * 0.5 : ry;
    const finalEllAngle = (isCircle || Math.abs(angle % (Math.PI / 2)) < 0.12) ? 0 : angle;
    const ellSamples = sampleEllipseUniform(rCx, rCy, finalEllRx, finalEllRy, finalEllAngle, 48);
    const ellChamfer = computeBidirectionalChamferError(closedPts, ellSamples, diag);

    // Extraction des sommets polygonaux
    const corners = computePolygonCorners(closedPts, diag);

    // 5B. TriangleFitter
    let triErr = Infinity, triChamfer = Infinity, triVerts = null;
    if (corners.length === 3) {
      triVerts = corners.map((c) => ({ x: c.x, y: c.y }));
    } else if (corners.length === 4 && isoQuotient < 0.72) {
      let bestArea = -1;
      for (let skip = 0; skip < 4; skip++) {
        const sub = corners.filter((_, idx) => idx !== skip);
        const area = Math.abs((sub[1].x - sub[0].x) * (sub[2].y - sub[0].y) - (sub[2].x - sub[0].x) * (sub[1].y - sub[0].y));
        if (area > bestArea) { bestArea = area; triVerts = sub.map((c) => ({ x: c.x, y: c.y })); }
      }
    }
    if (triVerts) {
      triErr = computePolygonRmsError(closedPts, triVerts, diag);
      triChamfer = computeBidirectionalChamferError(closedPts, samplePolylineUniform(triVerts, true, 48), diag);
    }

    // 5C. DiamondFitter (Losange)
    const aaCx = (minX + maxX) * 0.5;
    const aaCy = (minY + maxY) * 0.5;
    const diamondVerts = [
      { x: aaCx, y: minY },
      { x: maxX, y: aaCy },
      { x: aaCx, y: maxY },
      { x: minX, y: aaCy }
    ];
    const diamondErr = computePolygonRmsError(closedPts, diamondVerts, diag);
    const diamondChamfer = computeBidirectionalChamferError(closedPts, samplePolylineUniform(diamondVerts, true, 48), diag);
    let diamondCornerGapSum = 0;
    for (const vc of diamondVerts) {
      let bestD = Infinity;
      for (const p of closedPts) {
        const d = Math.hypot(p.x - vc.x, p.y - vc.y);
        if (d < bestD) bestD = d;
      }
      diamondCornerGapSum += bestD;
    }
    const diamondHasCorners = (diamondCornerGapSum / 4) / Math.max(8, Math.min(maxX - minX, maxY - minY)) < 0.21;

    // 5D. RectangleFitter (Carré / Rectangle axé ou orienté)
    let rectErr = Infinity, rectChamfer = Infinity, rectBox = null, rectAngle = 0, rectHasCorners = false, rectIsSquare = false;
    if (corners.length >= 4 && corners.length <= 6) {
      const aaVerts = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
      const aaErr = computePolygonRmsError(closedPts, aaVerts, diag);

      const rotCorners = [
        { u: uMin, v: vMin }, { u: uMax, v: vMin }, { u: uMax, v: vMax }, { u: uMin, v: vMax }
      ].map(({ u, v }) => ({
        x: cx + u * Math.cos(angle) - v * Math.sin(angle),
        y: cy + u * Math.sin(angle) + v * Math.cos(angle)
      }));
      const rotErr = computePolygonRmsError(closedPts, rotCorners, diag);

      const useAA = aaErr <= rotErr * 1.18 || Math.abs(angle % (Math.PI / 2)) < 0.14 || Math.abs((Math.abs(angle) % (Math.PI / 2)) - Math.PI / 2) < 0.14;
      const chosenVerts = useAA ? aaVerts : rotCorners;
      const minSide = useAA ? Math.max(8, Math.min(maxX - minX, maxY - minY)) : Math.max(8, Math.min(rx * 2, ry * 2));

      let cornerGapSum = 0;
      for (const vc of chosenVerts) {
        let bestD = Infinity;
        for (const p of closedPts) {
          const d = Math.hypot(p.x - vc.x, p.y - vc.y);
          if (d < bestD) bestD = d;
        }
        cornerGapSum += bestD;
      }
      rectHasCorners = (cornerGapSum / 4) / minSide < 0.22;

      if (useAA) {
        const bw = maxX - minX, bh = maxY - minY;
        rectIsSquare = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh)) < 1.10;
        const side = (bw + bh) * 0.5;
        rectErr = aaErr;
        rectBox = rectIsSquare
          ? { x1: aaCx - side * 0.5, y1: aaCy - side * 0.5, x2: aaCx + side * 0.5, y2: aaCy + side * 0.5 }
          : { x1: minX, y1: minY, x2: maxX, y2: maxY };
        rectAngle = 0;
      } else {
        rectIsSquare = ellRatio < 1.10;
        const hr = rectIsSquare ? (rx + ry) * 0.5 : rx;
        const vr = rectIsSquare ? (rx + ry) * 0.5 : ry;
        rectErr = rotErr;
        rectBox = { x1: rCx - hr, y1: rCy - vr, x2: rCx + hr, y2: rCy + vr };
        rectAngle = angle;
      }
      rectChamfer = computeBidirectionalChamferError(closedPts, samplePolylineUniform(chosenVerts, true, 48), diag);
    }

    // 5E. NGonFitter / Closed PolylineFitter (Pentagone, Hexagone, Polygone)
    let ngonVerts = null, ngonChamfer = Infinity;
    if (corners.length >= 5 && corners.length <= 8) {
      ngonVerts = corners.map((c) => ({ x: c.x, y: c.y }));
      ngonChamfer = computeBidirectionalChamferError(closedPts, samplePolylineUniform(ngonVerts, true, 48), diag);
    }

    const buildTriangleShape = () => {
      let tMinX = Infinity, tMinY = Infinity, tMaxX = -Infinity, tMaxY = -Infinity;
      for (const v of triVerts) {
        if (v.x < tMinX) tMinX = v.x; if (v.y < tMinY) tMinY = v.y;
        if (v.x > tMaxX) tMaxX = v.x; if (v.y > tMaxY) tMaxY = v.y;
      }
      return { id: createUid('sh'), type: 'triangle', x1: tMinX, y1: tMinY, x2: tMaxX, y2: tMaxY, vertices: triVerts, ...shapeStyle, detectedName: 'Triangle' };
    };
    const buildDiamondShape = () => ({
      id: createUid('sh'),
      type: 'diamond',
      x1: minX,
      y1: minY,
      x2: maxX,
      y2: maxY,
      vertices: diamondVerts,
      ...shapeStyle,
      detectedName: 'Losange'
    });
    const buildRectShape = () => ({
      id: createUid('sh'),
      type: 'rect',
      ...rectBox,
      angle: rectAngle,
      ...shapeStyle,
      detectedName: rectIsSquare ? 'Carré' : 'Rectangle'
    });
    const buildEllipseShape = () => ({
      id: createUid('sh'),
      type: 'ellipse',
      x1: rCx - finalEllRx,
      y1: rCy - finalEllRy,
      x2: rCx + finalEllRx,
      y2: rCy + finalEllRy,
      angle: finalEllAngle,
      ...shapeStyle,
      detectedName: isCircle ? 'Cercle' : 'Ellipse'
    });
    const buildNgonShape = () => {
      let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
      for (const v of ngonVerts) {
        if (v.x < pMinX) pMinX = v.x; if (v.y < pMinY) pMinY = v.y;
        if (v.x > pMaxX) pMaxX = v.x; if (v.y > pMaxY) pMaxY = v.y;
      }
      const names = { 5: 'Pentagone', 6: 'Hexagone', 7: 'Heptagone', 8: 'Octogone' };
      return {
        id: createUid('sh'),
        type: 'polygon',
        x1: pMinX,
        y1: pMinY,
        x2: pMaxX,
        y2: pMaxY,
        vertices: ngonVerts,
        ...shapeStyle,
        detectedName: names[ngonVerts.length] || 'Polygone'
      };
    };

    // Arbitrage strict (mode Stylo Hold-to-Shape)
    if (triVerts && triErr < 0.088 && triErr < ellipseErr * 0.92 && triErr <= rectErr && triErr <= diamondErr) {
      return buildTriangleShape();
    }
    if (diamondHasCorners && diamondErr < 0.075 && diamondChamfer < ellChamfer * 0.85 && diamondChamfer < rectChamfer * 0.90) {
      return buildDiamondShape();
    }
    if (rectBox && rectHasCorners && rectErr < 0.082 && (rectErr < ellipseErr * 0.85 || (corners.length === 4 && isoQuotient < 0.835))) {
      return buildRectShape();
    }
    if (ellipseErr < 0.145 && (!ngonVerts || ellChamfer <= ngonChamfer * 1.15)) {
      return buildEllipseShape();
    }
    if (ngonVerts && ngonChamfer < 0.055 && ngonChamfer < ellChamfer * 0.78) {
      return buildNgonShape();
    }

    // Mode Outil Formes (forceSnap) : sélectionne TOUJOURS le meilleur fitter fermé via ChamferDistanceEstimator
    if (forceSnap) {
      const candidates = [{ score: ellChamfer, build: buildEllipseShape }];
      if (triVerts) candidates.push({ score: triChamfer + 0.002, build: buildTriangleShape });
      if (diamondHasCorners) candidates.push({ score: diamondChamfer + 0.003, build: buildDiamondShape });
      if (rectBox && rectHasCorners) candidates.push({ score: rectChamfer + 0.002, build: buildRectShape });
      if (ngonVerts) candidates.push({ score: ngonChamfer + 0.012, build: buildNgonShape });
      candidates.sort((a, b) => a.score - b.score);
      return candidates[0].build();
    }

    return null;
  }

  // ============================================================================
  // 4. STOCKAGE LOCAL INDEXEDDB AVEC FALLBACK MÉMOIRE AUTOMATIQUE
  // ============================================================================

  const DB_NAME = 'PlumeStudioDB';
  const DB_VERSION = 2;
  class NotebookDatabase {
    constructor() {
      this.db = null;
      this.fallbackMode = false;
      this.memNotebooks = new Map();
      this.memPages = new Map();
      this.memPdfs = new Map();
      this.memWorkspace = null;
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
          };
          req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
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
    async deleteNotebook(notebookId) {
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
      for (const pdfId of pdfIdsToDelete) this.memPdfs.delete(pdfId);
      await this.open();
      if (this.fallbackMode || !this.db) return;
      const pages = await this.getPagesForNotebook(notebookId);
      pages.forEach((p) => { if (p.pdfId) pdfIdsToDelete.add(p.pdfId); });
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

  // ============================================================================
  // 6. ÉTAT GLOBAL DE L'APPLICATION
  // ============================================================================

  const PAGE_WIDTH = 1190;
  const PAGE_HEIGHT = 1684;

  const state = {
    notebooks: [],
    folders: [],
    currentFolderId: null,
    sidebarFilter: 'all',
    sidebarSearch: '',
    sidebarSort: 'date',
    notebookSortBy: 'date_desc',
    libraryViewMode: 'list',
    pagesSubTab: 'pages',
    pagesFilterBookmarks: false,
    movingNotebookId: null,
    movingItems: null,
    editingFolderId: null,
    folderModalColor: '#0072ce',
    folderModalIcon: 'folder',
    filesPageOpen: false,
    filesPageTab: 'all',
    filesPageViewMode: 'grid',
    filesPageFavFilter: 'any',
    filesPageSelectMode: false,
    filesPageSelectedIds: new Set(),
    pagesByNotebook: new Map(),
    activeNotebookId: null,
    activePageId: null,
    tool: 'pen',
    previousWritingTool: 'pen',
    penStyle: 'fountain',
    penLineStyle: 'solid',
    highlighterAutoStraighten: false,
    highlighterSmoothing: 0,
    pencilDrawAndHold: true,
    penColor: '#000000',
    pencilColor: '#000000',
    highlighterColor: '#ffff00',
    shapeColor: '#000000',
    tapeColor: '#ff5f67',
    laserColor: '#ef4444',
    textColor: '#000000',
    penSize: 5,
    pencilSize: 5,
    highlighterSize: 22,
    shapeSize: 4,
    eraserSize: 18,
    tapeSize: 26,
    laserSize: 6,
    toolMemory: {
      pen: { color: '#000000', size: 5, colorSlots: ['#000000', '#007aff', '#dc2626'], activeColorSlotIndex: 0, sizeSlots: [2.5, 5, 12] },
      pencil: { color: '#000000', size: 5, colorSlots: ['#000000', '#636363', '#9b9b9b'], activeColorSlotIndex: 0, sizeSlots: [2.5, 5, 10] },
      highlighter: { color: '#ffff00', size: 22, colorSlots: ['#ffff00', '#00ff00', '#00ffff'], activeColorSlotIndex: 0, sizeSlots: [12, 22, 34] },
      shape: { color: '#000000', size: 4, colorSlots: ['#000000', '#007aff', '#dc2626'], activeColorSlotIndex: 0, sizeSlots: [2, 4, 8] },
      eraser: { color: '#94a3b8', size: 18, colorSlots: [], activeColorSlotIndex: 0, sizeSlots: [10, 18, 32] },
      tape: { color: '#ff5f67', size: 26, colorSlots: ['#ff5f67', '#ff9f49', '#f7ca1d'], activeColorSlotIndex: 0, sizeSlots: [18, 26, 36] },
      laser: { color: '#ef4444', size: 6, colorSlots: ['#ef4444', '#007aff', '#009b55'], activeColorSlotIndex: 0, sizeSlots: [4, 6, 10] },
      text: { color: '#000000', size: 16, colorSlots: ['#000000', '#007aff', '#d20000'], activeColorSlotIndex: 0, sizeSlots: [14, 16, 22] }
    },
    smoothing: 0.65,
    tipSharpness: 0.5,
    pressureSensitivity: 0.5,
    pressureMode: 'dynamic',
    eraserMode: 'stroke',
    eraserHighlighterOnly: false,
    eraserAutoDeselect: false,
    eraserFilters: { pen: true, pencil: true, highlighter: true, tape: true },
    lassoMode: 'freehand',
    lassoStartWorld: null,
    shapeType: 'auto',
    shapeFilled: false,
    shapeLineStyle: 'solid',
    shapeRoundedCorners: true,
    shapeStartArrow: 'none',
    shapeEndArrow: 'none',
    shapeHoverConnection: null,
    selectedShapeId: null,
    shapeEditDrag: null,
    pendingShapeTapCandidateId: null,
    pendingShapeTapStartScreen: null,
    instantShapeMode: false,
    autoShapeEnabled: true,
    scribbleToErase: true,
    scribbleEraseShapesAndHl: true,
    circleToLasso: true,
    gnPenPopoverOpen: false,
    gnPencilPopoverOpen: false,
    gnHighlighterPopoverOpen: false,
    gnTapePopoverOpen: false,
    gnStrokePopoverOpen: false,
    gnShapeStrokePopoverOpen: false,
    textFontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    textFontLabel: 'Helvetica',
    textFontSize: 24,
    textBold: false,
    textItalic: false,
    textUnderline: false,
    textStrike: false,
    textAlign: 'left',
    textLineHeightMode: 'automatic',
    textLineHeightFixed: 32,
    textListStyle: 'none',
    textFrameStyle: {
      backgroundColor: null,
      borderColor: null,
      borderWidth: 0,
      cornerRadius: 0,
      padding: 10,
      showShadow: false
    },
    selectedTextId: null,
    editingTextId: null,
    textBoxCreateDrag: null,
    gnTextPopover: null,
    gnTextStyleTab: 'presets',
    tapeForceStraight: false,
    gnEraserModePopoverOpen: false,
    gnEraserAdvPopoverOpen: false,
    gnEraserSizePopoverOpen: false,
    activeSizeSlotByTool: { pen: 1, pencil: 1, highlighter: 1, shape: 1, tape: 1, eraser: 1 },
    palmRejection: true,
    lastPenSeenTime: 0,
    laserTrail: [],
    laserAnimFrame: null,
    currentTape: null,
    predictedPoints: [],
    zoomWindowOpen: false,
    zoomWindowMag: 2.5,
    zoomWindowBox: { x: 80, y: 140, w: 340, h: 120 },
    gdriveAccessToken: '',
    gdriveClientId: '',
    gdriveAutoBackup: false,
    gdriveLocalDirHandle: null,
    gdriveLastSyncAt: 0,
    zoom: 0.88,
    panX: 60,
    panY: 85,
    isSpacePressed: false,
    isPanning: false,
    panStartScreen: { x: 0, y: 0 },
    panStartOffset: { x: 0, y: 0 },
    pullToAdd: {
      active: false,
      direction: null,
      action: null,
      percentage: 0,
      visualOffset: 0,
      rawExcess: 0,
      source: null,
      wheelTimer: null,
      isCommitting: false
    },
    activePointerId: null,
    isDrawing: false,
    strokeStartTime: 0,
    lastPointerUpTime: 0,
    currentStroke: null,
    currentShape: null,
    temporaryEraserOverride: false,
    previousToolBeforeEraser: null,
    temporaryLassoOverride: false,
    previousToolBeforeLasso: null,
    waitBarrelReleaseBeforeHoverTrigger: false,
    holdShapeTimer: null,
    holdShapeAnchorScreen: null,
    currentStrokeSnappedFromAutoShape: false,
    colorWheelTimer: null,
    colorWheelOpen: false,
    colorWheelTapMode: false,
    colorWheelAnchorScreen: null,
    colorWheelCenterScreen: { x: 0, y: 0 },
    colorWheelHoveredColor: null,
    lastPointerPoint: null,
    lastPointerTime: 0,
    // Multi-touch Pinch-to-Zoom & 2-Finger Pan
    touchPoints: new Map(),
    isPinching: false,
    pinchLastDist: 0,
    pinchLastCenter: { x: 0, y: 0 },
    // Lasso
    lassoPolygon: [],
    selectedIds: { strokes: new Set(), shapes: new Set(), texts: new Set() },
    selectionBounds: null,
    lassoAction: null,
    lassoDragStartWorld: null,
    lassoInitialSnapshot: null,
    lassoInitialBounds: null,
    historyByPage: new Map(),
    newNotebookCover: '#0072ce',
    editingLatexCardId: null,
    pendingLatexWorldPos: null,
    lastRecognizedStrokes: [],
    toolOptionsOpen: false,
    pendingPdfImport: null,
    lastExportedPdfBytes: null
  };

  const ERASER_PREFS_STORAGE_KEY = 'inkflow_eraser_prefs_v1';
  function saveEraserPrefsToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(ERASER_PREFS_STORAGE_KEY, JSON.stringify({
        eraserMode: state.eraserMode,
        eraserAutoDeselect: Boolean(state.eraserAutoDeselect),
        eraserFilters: { ...(state.eraserFilters || { pen: true, pencil: true, highlighter: true, tape: true }) }
      }));
    } catch (_) {}
  }

  const PENCIL_PREFS_STORAGE_KEY = 'inkflow_pencil_prefs_v1';
  const HIGHLIGHTER_PREFS_STORAGE_KEY = 'inkflow_highlighter_prefs_v1';
  function savePencilPrefsToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(PENCIL_PREFS_STORAGE_KEY, JSON.stringify({
        pencilDrawAndHold: Boolean(state.pencilDrawAndHold)
      }));
    } catch (_) {}
  }
  function saveHighlighterPrefsToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(HIGHLIGHTER_PREFS_STORAGE_KEY, JSON.stringify({
        highlighterSmoothing: Number(state.highlighterSmoothing || 0),
        highlighterAutoStraighten: Boolean(state.highlighterAutoStraighten)
      }));
    } catch (_) {}
  }

  const TAPE_PREFS_STORAGE_KEY = 'inkflow_tape_prefs_v1';
  function saveTapePrefsToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(TAPE_PREFS_STORAGE_KEY, JSON.stringify({
        tapeForceStraight: Boolean(state.tapeForceStraight)
      }));
    } catch (_) {}
  }

  const SHAPE_STROKE_PREFS_STORAGE_KEY = 'inkflow_shape_stroke_prefs_v1';
  function saveShapeStrokePrefsToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(SHAPE_STROKE_PREFS_STORAGE_KEY, JSON.stringify({
        shapeLineStyle: state.shapeLineStyle || 'solid',
        shapeRoundedCorners: state.shapeRoundedCorners !== false,
        shapeStartArrow: state.shapeStartArrow || 'none',
        shapeEndArrow: state.shapeEndArrow || 'none'
      }));
    } catch (_) {}
  }

  function applyActiveShapeStrokeStyle(sh) {
    if (!sh) return sh;
    sh.lineStyle = state.shapeLineStyle || 'solid';
    sh.roundedCorners = state.shapeRoundedCorners !== false;
    sh.startArrow = state.shapeStartArrow || 'none';
    sh.endArrow = state.shapeEndArrow || 'none';
    return sh;
  }

  try {
    const savedAutoShape = localStorage.getItem('plume_auto_shape_enabled');
    if (savedAutoShape === 'false') state.autoShapeEnabled = false;
    const savedSmoothing = parseFloat(localStorage.getItem('inkflow_smoothing_v1'));
    if (Number.isFinite(savedSmoothing) && savedSmoothing >= 0 && savedSmoothing <= 1) {
      state.smoothing = savedSmoothing;
    }
    const savedShapeStrokeRaw = localStorage.getItem(SHAPE_STROKE_PREFS_STORAGE_KEY);
    if (savedShapeStrokeRaw) {
      const sp = JSON.parse(savedShapeStrokeRaw);
      if (sp && typeof sp === 'object') {
        if (sp.shapeLineStyle === 'solid' || sp.shapeLineStyle === 'dashed' || sp.shapeLineStyle === 'dotted') {
          state.shapeLineStyle = sp.shapeLineStyle;
        }
        if (typeof sp.shapeRoundedCorners === 'boolean') state.shapeRoundedCorners = sp.shapeRoundedCorners;
        if (sp.shapeStartArrow === 'none' || sp.shapeStartArrow === 'open' || sp.shapeStartArrow === 'filled') {
          state.shapeStartArrow = sp.shapeStartArrow;
        }
        if (sp.shapeEndArrow === 'none' || sp.shapeEndArrow === 'open' || sp.shapeEndArrow === 'filled') {
          state.shapeEndArrow = sp.shapeEndArrow;
        }
      }
    }
    const savedPencilRaw = localStorage.getItem(PENCIL_PREFS_STORAGE_KEY);
    if (savedPencilRaw) {
      const pp = JSON.parse(savedPencilRaw);
      if (pp && typeof pp.pencilDrawAndHold === 'boolean') state.pencilDrawAndHold = pp.pencilDrawAndHold;
    }
    const savedPenGesturesRaw = localStorage.getItem('inkflow_pen_gestures_v1');
    if (savedPenGesturesRaw) {
      const gp = JSON.parse(savedPenGesturesRaw);
      if (gp && typeof gp === 'object') {
        if (typeof gp.scribbleToErase === 'boolean') state.scribbleToErase = gp.scribbleToErase;
        if (typeof gp.scribbleEraseShapesAndHl === 'boolean') state.scribbleEraseShapesAndHl = gp.scribbleEraseShapesAndHl;
        if (typeof gp.circleToLasso === 'boolean') state.circleToLasso = gp.circleToLasso;
      }
    }
    const savedHlRaw = localStorage.getItem(HIGHLIGHTER_PREFS_STORAGE_KEY);
    if (savedHlRaw) {
      const hp = JSON.parse(savedHlRaw);
      if (hp && typeof hp === 'object') {
        if (Number.isFinite(hp.highlighterSmoothing) && hp.highlighterSmoothing >= 0 && hp.highlighterSmoothing <= 1) {
          state.highlighterSmoothing = hp.highlighterSmoothing;
        }
        if (typeof hp.highlighterAutoStraighten === 'boolean') {
          state.highlighterAutoStraighten = hp.highlighterAutoStraighten;
        }
      }
    }
    const savedTapeRaw = localStorage.getItem(TAPE_PREFS_STORAGE_KEY);
    if (savedTapeRaw) {
      const tp = JSON.parse(savedTapeRaw);
      if (tp && typeof tp.tapeForceStraight === 'boolean') {
        state.tapeForceStraight = tp.tapeForceStraight;
      }
    }
    const savedEraserRaw = localStorage.getItem(ERASER_PREFS_STORAGE_KEY);
    if (savedEraserRaw) {
      const ep = JSON.parse(savedEraserRaw);
      if (ep && typeof ep === 'object') {
        if (ep.eraserMode === 'stroke' || ep.eraserMode === 'segment' || ep.eraserMode === 'partial') {
          state.eraserMode = ep.eraserMode;
        }
        if (typeof ep.eraserAutoDeselect === 'boolean') {
          state.eraserAutoDeselect = ep.eraserAutoDeselect;
        }
        if (ep.eraserFilters && typeof ep.eraserFilters === 'object') {
          state.eraserFilters = {
            pen: ep.eraserFilters.pen !== false,
            pencil: ep.eraserFilters.pencil !== false,
            highlighter: ep.eraserFilters.highlighter !== false,
            tape: ep.eraserFilters.tape !== false
          };
        }
      }
    }
    const savedTextToolRaw = localStorage.getItem('inkflow_text_tool_prefs_v1');
    if (savedTextToolRaw) {
      const tt = JSON.parse(savedTextToolRaw);
      if (tt && typeof tt === 'object') {
        if (typeof tt.textFontFamily === 'string' && tt.textFontFamily.trim()) state.textFontFamily = tt.textFontFamily;
        if (typeof tt.textFontLabel === 'string' && tt.textFontLabel.trim()) state.textFontLabel = tt.textFontLabel;
        if (Number.isFinite(tt.textFontSize) && tt.textFontSize >= 1 && tt.textFontSize <= 200) state.textFontSize = Math.round(tt.textFontSize);
        if (typeof tt.textColor === 'string' && tt.textColor.startsWith('#')) state.textColor = tt.textColor;
        if (typeof tt.textBold === 'boolean') state.textBold = tt.textBold;
        if (typeof tt.textItalic === 'boolean') state.textItalic = tt.textItalic;
        if (typeof tt.textUnderline === 'boolean') state.textUnderline = tt.textUnderline;
        if (typeof tt.textStrike === 'boolean') state.textStrike = tt.textStrike;
        if (tt.textAlign === 'left' || tt.textAlign === 'center' || tt.textAlign === 'right') state.textAlign = tt.textAlign;
        if (tt.textLineHeightMode === 'automatic' || tt.textLineHeightMode === 'fixed') state.textLineHeightMode = tt.textLineHeightMode;
        if (Number.isFinite(tt.textLineHeightFixed) && tt.textLineHeightFixed >= 8 && tt.textLineHeightFixed <= 200) state.textLineHeightFixed = Math.round(tt.textLineHeightFixed);
        if (tt.textListStyle === 'none' || tt.textListStyle === 'bullets' || tt.textListStyle === 'numbered') state.textListStyle = tt.textListStyle;
        if (tt.textFrameStyle && typeof tt.textFrameStyle === 'object') {
          state.textFrameStyle = {
            backgroundColor: tt.textFrameStyle.backgroundColor || null,
            borderColor: tt.textFrameStyle.borderColor || null,
            borderWidth: Math.max(0, Math.min(20, Number(tt.textFrameStyle.borderWidth) || 0)),
            cornerRadius: Math.max(0, Math.min(20, Number(tt.textFrameStyle.cornerRadius) || 0)),
            padding: Math.max(0, Math.min(20, Number.isFinite(Number(tt.textFrameStyle.padding)) ? Number(tt.textFrameStyle.padding) : 10)),
            showShadow: Boolean(tt.textFrameStyle.showShadow)
          };
        }
      }
    }
  } catch (_) {}

  // Exact GoodNotes 6 TextBoxStyle presets (REA DocumentLoaderRoute-PMJiTofc.js fO)
  const GN_TEXT_BOX_STYLE_PRESETS = [
    { backgroundColor: null, borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false },
    { backgroundColor: '#373b44', borderColor: null, borderWidth: 0, cornerRadius: 7, padding: 10, showShadow: false },
    { backgroundColor: '#ADFF4F', borderColor: null, borderWidth: 0, cornerRadius: 7, padding: 10, showShadow: false },
    { backgroundColor: '#FFD8CE', borderColor: null, borderWidth: 0, cornerRadius: 7, padding: 10, showShadow: true },
    { backgroundColor: '#FFFFFF', borderColor: null, borderWidth: 0, cornerRadius: 7, padding: 10, showShadow: true },
    { backgroundColor: '#F65353', borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false },
    { backgroundColor: '#FCFF4F', borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false },
    { backgroundColor: '#F2F8FF', borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false },
    { backgroundColor: '#4C5B7F', borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false },
    { backgroundColor: '#FFFFFF', borderColor: null, borderWidth: 0, cornerRadius: 0, padding: 10, showShadow: false }
  ];

  function saveTextToolPrefs() {
    try {
      localStorage.setItem('inkflow_text_tool_prefs_v1', JSON.stringify({
        textFontFamily: state.textFontFamily,
        textFontLabel: state.textFontLabel,
        textFontSize: state.textFontSize,
        textColor: state.textColor,
        textBold: state.textBold,
        textItalic: state.textItalic,
        textUnderline: state.textUnderline,
        textStrike: state.textStrike,
        textAlign: state.textAlign,
        textLineHeightMode: state.textLineHeightMode,
        textLineHeightFixed: state.textLineHeightFixed,
        textListStyle: state.textListStyle,
        textFrameStyle: { ...state.textFrameStyle }
      }));
    } catch (_) {}
  }

  const TOOL_PREFS_STORAGE_KEY = 'inkflow_tool_prefs_v1';

  function getActiveToolColor(tool = state.tool) {
    if (tool === 'pencil') return state.pencilColor || '#111827';
    if (tool === 'highlighter') return state.highlighterColor;
    if (tool === 'shape') return state.shapeColor || state.penColor;
    if (tool === 'tape') return state.tapeColor || '#f59e0b';
    if (tool === 'laser') return state.laserColor || '#ef4444';
    if (tool === 'text') return state.textColor || state.penColor;
    if (tool === 'eraser') return '#94a3b8';
    return state.penColor;
  }

  function getActiveToolSize(tool = state.tool) {
    if (tool === 'pencil') return state.pencilSize || 5;
    if (tool === 'highlighter') return state.highlighterSize;
    if (tool === 'eraser') return state.eraserSize;
    if (tool === 'shape') return state.shapeSize || state.penSize;
    if (tool === 'tape') return state.tapeSize || state.highlighterSize || 26;
    if (tool === 'laser') return state.laserSize || 6;
    return state.penSize;
  }

  function syncCanonicalToToolMemory(tool) {
    const mem = state.toolMemory && state.toolMemory[tool];
    if (!mem) return;
    mem.color = getActiveToolColor(tool);
    mem.size = getActiveToolSize(tool);
  }

  function applyToolMemoryToCanonical(tool) {
    const mem = state.toolMemory && state.toolMemory[tool];
    if (!mem) return;
    if (tool === 'pen') {
      if (mem.color) state.penColor = mem.color;
      if (Number.isFinite(mem.size)) state.penSize = mem.size;
    } else if (tool === 'pencil') {
      if (mem.color) state.pencilColor = mem.color;
      if (Number.isFinite(mem.size)) state.pencilSize = mem.size;
    } else if (tool === 'highlighter') {
      if (mem.color) state.highlighterColor = mem.color;
      if (Number.isFinite(mem.size)) state.highlighterSize = mem.size;
    } else if (tool === 'shape') {
      if (mem.color) state.shapeColor = mem.color;
      if (Number.isFinite(mem.size)) state.shapeSize = mem.size;
    } else if (tool === 'eraser') {
      if (Number.isFinite(mem.size)) state.eraserSize = mem.size;
    } else if (tool === 'tape') {
      if (mem.color) state.tapeColor = mem.color;
      if (Number.isFinite(mem.size)) state.tapeSize = mem.size;
    } else if (tool === 'laser') {
      if (mem.color) state.laserColor = mem.color;
      if (Number.isFinite(mem.size)) state.laserSize = mem.size;
    } else if (tool === 'text') {
      if (mem.color) state.textColor = mem.color;
    }
  }

  function saveToolMemoryToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      ['pen', 'pencil', 'highlighter', 'shape', 'eraser', 'tape', 'laser', 'text'].forEach(syncCanonicalToToolMemory);
      localStorage.setItem(TOOL_PREFS_STORAGE_KEY, JSON.stringify(state.toolMemory));
    } catch (_) {}
  }

  // Palettes de préréglages exactes GoodNotes 6 (issues de l'analyse REA : pen/shape, pencil, highlighter, tape, text)
  const GN_DEFAULT_COLOR_PRESETS_BY_TOOL = {
    pen: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#ff0202', '#82218b', '#f65353', '#ff9797', '#fe9a23',
      '#007aff', '#03468f', '#009b55', '#7ec636', '#fdff85'
    ],
    pencil: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#baa184', '#cfbfa6', '#e2d7c3', '#f8f7eb'
    ],
    highlighter: [
      '#ffff00', '#00ff00', '#00ffff', '#ffa238', '#ff0038',
      '#fde68a', '#86efac', '#93c5fd', '#f9a8d4', '#c4b5fd'
    ],
    tape: [
      '#ff5f67', '#ff9f49', '#f7ca1d', '#63dd57', '#60d0e2',
      '#80c1ff', '#cea4fa', '#fc8cc7', '#e4e2dc'
    ],
    shape: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#ff0202', '#82218b', '#f65353', '#ff9797', '#fe9a23',
      '#007aff', '#03468f', '#009b55', '#7ec636', '#fdff85'
    ],
    text: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#cc72d3', '#d20000', '#f65353', '#ff9797', '#f59a23',
      '#007aff', '#03468f', '#007355', '#7ec636', '#fdff85'
    ],
    laser: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#ff0202', '#82218b', '#f65353', '#ff9797', '#fe9a23',
      '#007aff', '#03468f', '#009b55', '#7ec636', '#fdff85'
    ],
    cover: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#ff0202', '#82218b', '#f65353', '#ff9797', '#fe9a23',
      '#007aff', '#03468f', '#009b55', '#7ec636', '#fdff85'
    ],
    folder: [
      '#000000', '#636363', '#9b9b9b', '#d2d2d2', '#ffffff',
      '#ff0202', '#82218b', '#f65353', '#ff9797', '#fe9a23',
      '#007aff', '#03468f', '#009b55', '#7ec636', '#fdff85'
    ]
  };
  const GN_MAX_COLOR_SLOTS = 12;
  const GN_MAX_COLOR_PRESETS = 50;
  const GN_EXTRA_PRESETS_BY_SCOPE = {
    cover: [...GN_DEFAULT_COLOR_PRESETS_BY_TOOL.cover],
    folder: [...GN_DEFAULT_COLOR_PRESETS_BY_TOOL.folder]
  };

  function normalizeHexColor(hex) {
    if (typeof hex !== 'string') return null;
    let s = hex.trim();
    if (!s.startsWith('#')) s = '#' + s;
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    if (!/^#[0-9a-f]{6}$/i.test(s)) return null;
    return s.toLowerCase();
  }

  function getToolColorPresets(scopeKey) {
    const key = scopeKey || 'pen';
    const mem = state.toolMemory && state.toolMemory[key];
    if (mem) {
      if (!Array.isArray(mem.colorPresets) || mem.colorPresets.length === 0) {
        mem.colorPresets = [...(GN_DEFAULT_COLOR_PRESETS_BY_TOOL[key] || GN_DEFAULT_COLOR_PRESETS_BY_TOOL.pen)];
      }
      return mem.colorPresets;
    }
    if (!GN_EXTRA_PRESETS_BY_SCOPE[key]) {
      GN_EXTRA_PRESETS_BY_SCOPE[key] = [...(GN_DEFAULT_COLOR_PRESETS_BY_TOOL[key] || GN_DEFAULT_COLOR_PRESETS_BY_TOOL.pen)];
    }
    return GN_EXTRA_PRESETS_BY_SCOPE[key];
  }

  function loadToolMemoryFromStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      const raw = localStorage.getItem(TOOL_PREFS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      ['pen', 'pencil', 'highlighter', 'shape', 'eraser', 'tape', 'laser', 'text'].forEach((t) => {
        const entry = parsed[t];
        if (!entry || typeof entry !== 'object') return;
        const target = state.toolMemory[t];
        if (!target) return;
        if (typeof entry.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(entry.color)) {
          target.color = entry.color;
        }
        if (typeof entry.size === 'number' && Number.isFinite(entry.size) && entry.size >= 0.5 && entry.size <= 64) {
          target.size = entry.size;
        }
        if (Array.isArray(entry.colorSlots) && entry.colorSlots.length > 0) {
          target.colorSlots = entry.colorSlots
            .map((c) => normalizeHexColor(c) || (typeof c === 'string' ? c : null))
            .filter(Boolean)
            .slice(0, GN_MAX_COLOR_SLOTS);
        }
        if (typeof entry.activeColorSlotIndex === 'number' && Number.isInteger(entry.activeColorSlotIndex)) {
          target.activeColorSlotIndex = Math.max(0, Math.min(Math.max(0, (target.colorSlots?.length || 1) - 1), entry.activeColorSlotIndex));
        }
        if (Array.isArray(entry.colorPresets) && entry.colorPresets.length > 0) {
          const validPresets = entry.colorPresets
            .map((c) => normalizeHexColor(c))
            .filter(Boolean)
            .slice(0, GN_MAX_COLOR_PRESETS);
          if (validPresets.length > 0) target.colorPresets = validPresets;
        }
        if (Array.isArray(entry.sizeSlots) && entry.sizeSlots.length === 3) {
          const validSizes = entry.sizeSlots.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0.5 && n <= 64);
          if (validSizes.length === 3) target.sizeSlots = validSizes;
        }
        applyToolMemoryToCanonical(t);
      });
    } catch (_) {}
  }

  function setToolColor(tool, hexColor, opts = {}) {
    if (!hexColor) return;
    const norm = normalizeHexColor(hexColor) || hexColor;
    if (tool === 'pencil') state.pencilColor = norm;
    else if (tool === 'highlighter') state.highlighterColor = norm;
    else if (tool === 'shape') state.shapeColor = norm;
    else if (tool === 'tape') state.tapeColor = norm;
    else if (tool === 'laser') state.laserColor = norm;
    else if (tool === 'text') state.textColor = norm;
    else state.penColor = norm;
    const mem = state.toolMemory && state.toolMemory[tool];
    if (mem) {
      mem.color = norm;
      if (Array.isArray(mem.colorSlots)) {
        if (opts && opts.addNewSlot) {
          if (mem.colorSlots.length < GN_MAX_COLOR_SLOTS) {
            mem.colorSlots.push(norm);
          } else {
            mem.colorSlots[mem.colorSlots.length - 1] = norm;
          }
          mem.activeColorSlotIndex = mem.colorSlots.length - 1;
        } else if (opts && typeof opts.slotIndex === 'number' && opts.slotIndex >= 0 && opts.slotIndex < mem.colorSlots.length) {
          if (!opts.selectOnly) {
            mem.colorSlots[opts.slotIndex] = norm;
          }
          mem.activeColorSlotIndex = opts.slotIndex;
        } else {
          const lower = String(norm).toLowerCase();
          const matchIdx = mem.colorSlots.findIndex((c) => String(c).toLowerCase() === lower);
          if (matchIdx >= 0) {
            mem.activeColorSlotIndex = matchIdx;
          } else {
            const idx = (typeof mem.activeColorSlotIndex === 'number' && mem.activeColorSlotIndex >= 0 && mem.activeColorSlotIndex < mem.colorSlots.length)
              ? mem.activeColorSlotIndex
              : 0;
            if (mem.colorSlots.length === 0) mem.colorSlots.push(norm);
            else mem.colorSlots[idx] = norm;
            mem.activeColorSlotIndex = idx;
          }
        }
      }
    }
    saveToolMemoryToStorage();
    if (typeof dom !== 'undefined' && dom.colorDotCursor && dom.colorDotCursor.style.display === 'block') {
      dom.colorDotCursor.style.backgroundColor = getActiveCursorColor();
    }
  }

  function addToolColorSlot(toolKey, hexColor) {
    const key = (state.toolMemory && state.toolMemory[toolKey]) ? toolKey : 'pen';
    const norm = normalizeHexColor(hexColor);
    if (!norm) return -1;
    setToolColor(key, norm, { addNewSlot: true });
    return state.toolMemory[key].activeColorSlotIndex;
  }

  function removeToolColorSlot(toolKey, slotIndex) {
    const key = (state.toolMemory && state.toolMemory[toolKey]) ? toolKey : 'pen';
    const mem = state.toolMemory && state.toolMemory[key];
    if (!mem || !Array.isArray(mem.colorSlots) || mem.colorSlots.length <= 1) return false;
    if (slotIndex < 0 || slotIndex >= mem.colorSlots.length) return false;
    mem.colorSlots.splice(slotIndex, 1);
    const nextIdx = Math.max(0, Math.min(slotIndex, mem.colorSlots.length - 1));
    mem.activeColorSlotIndex = nextIdx;
    setToolColor(key, mem.colorSlots[nextIdx], { slotIndex: nextIdx, selectOnly: true });
    return true;
  }

  function setToolSize(tool, sizeVal) {
    const n = Number(sizeVal);
    if (!Number.isFinite(n) || n <= 0) return;
    if (tool === 'pencil') state.pencilSize = n;
    else if (tool === 'highlighter') state.highlighterSize = n;
    else if (tool === 'eraser') state.eraserSize = n;
    else if (tool === 'shape') state.shapeSize = n;
    else if (tool === 'tape') state.tapeSize = n;
    else if (tool === 'laser') state.laserSize = n;
    else state.penSize = n;
    const mem = state.toolMemory && state.toolMemory[tool];
    if (mem) mem.size = n;
    saveToolMemoryToStorage();
  }

  loadToolMemoryFromStorage();

  const strokePathCache = new WeakMap();
  function getCachedStrokePath(stroke) {
    let cached = strokePathCache.get(stroke);
    const isPencilStroke = stroke && (stroke.tool === 'pencil' || stroke.penStyle === 'pencil');
    const pad = isPencilStroke
      ? Math.max(8, (stroke.size || 5) * 2.4)
      : Math.max(4, (stroke.size || 5) * 0.85);
    if (!cached) {
      const path2d = buildStrokePath2D(stroke);
      const bounds = (stroke.points && stroke.points.length > 0)
        ? (stroke._bounds || computeStrokeBounds(stroke, pad))
        : null;
      stroke._bounds = bounds;
      cached = {
        path2d,
        svgPath: null,
        pencilSamples: null,
        bounds,
        renderMode: stroke._renderMode || ((stroke.tool === 'highlighter' || stroke.pressureMode === 'uniform') ? 'stroke' : 'fill')
      };
      strokePathCache.set(stroke, cached);
    } else {
      if (!cached.bounds && stroke.points && stroke.points.length > 0) {
        cached.bounds = stroke._bounds || computeStrokeBounds(stroke, pad);
        stroke._bounds = cached.bounds;
      }
      if (!cached.renderMode) {
        cached.renderMode = stroke._renderMode || ((stroke.tool === 'highlighter' || stroke.pressureMode === 'uniform') ? 'stroke' : 'fill');
      }
    }
    return cached;
  }
  function getCachedStrokeBounds(stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return null;
    if (stroke._bounds) return stroke._bounds;
    return getCachedStrokePath(stroke).bounds;
  }
  function getCachedStrokeSvgPath(stroke) {
    const cached = getCachedStrokePath(stroke);
    if (!cached.svgPath) cached.svgPath = buildStrokePathData(stroke);
    return cached.svgPath;
  }
  function invalidateStrokeCache(stroke) {
    if (!stroke) return;
    stroke._bounds = null;
    strokePathCache.delete(stroke);
  }

  // ============================================================================
  // 7. RÉFÉRENCES DOM
  // ============================================================================

  const dom = {
    leftSidebar: document.getElementById('leftSidebar'),
    btnToggleSidebar: document.getElementById('btnToggleSidebar'),
    btnCloseSidebar: document.getElementById('btnCloseSidebar'),
    tabNotebooksBtn: document.getElementById('tabNotebooksBtn'),
    tabPagesBtn: document.getElementById('tabPagesBtn'),
    sectionNotebooks: document.getElementById('sectionNotebooks'),
    sectionPages: document.getElementById('sectionPages'),
    notebookList: document.getElementById('notebookList'),
    pagesGrid: document.getElementById('pagesGrid'),
    sidebarPageCount: document.getElementById('sidebarPageCount'),
    btnNewNotebook: document.getElementById('btnNewNotebook'),
    btnNewPageSidebar: document.getElementById('btnNewPageSidebar'),
    btnImportPdfSidebar: document.getElementById('btnImportPdfSidebar'),
    btnExportPdfSidebar: document.getElementById('btnExportPdfSidebar'),
    btnImportPdfPages: document.getElementById('btnImportPdfPages'),
    inputImportPdf: document.getElementById('inputImportPdf'),
    dbStatusDot: document.getElementById('dbStatusDot'),
    dbStatusText: document.getElementById('dbStatusText'),
    strokeCountBadge: document.getElementById('strokeCountBadge'),
    btnBackupJson: document.getElementById('btnBackupJson'),
    btnImportJson: document.getElementById('btnImportJson'),
    inputImportJson: document.getElementById('inputImportJson'),
    btnDesktopInfo: document.getElementById('btnDesktopInfo'),
    toolBtns: document.querySelectorAll('[data-tool]'),
    btnToggleToolOptions: document.getElementById('btnToggleToolOptions'),
    activeToolColorPreview: document.getElementById('activeToolColorPreview'),
    activeToolSummaryText: document.getElementById('activeToolSummaryText'),
    btnCloseToolOptions: document.getElementById('btnCloseToolOptions'),
    btnOpenLatexModal: document.getElementById('btnOpenLatexModal'),
    btnOpenRecognition: document.getElementById('btnOpenRecognition'),
    penColorDot: document.getElementById('penColorDot'),
    hlColorDot: document.getElementById('hlColorDot'),
    btnUndo: document.getElementById('btnUndo'),
    btnRedo: document.getElementById('btnRedo'),
    btnPaperSettings: document.getElementById('btnPaperSettings'),
    btnExportMenu: document.getElementById('btnExportMenu'),
    btnThemeToggle: document.getElementById('btnThemeToggle'),
    btnFullscreenToggle: document.getElementById('btnFullscreenToggle'),
    toolOptionsDock: document.getElementById('toolOptionsDock'),
    colorPaletteGroup: document.getElementById('colorPaletteGroup'),
    colorSwatches: document.querySelectorAll('#colorPaletteGroup .color-swatch'),
    customColorPicker: document.getElementById('customColorPicker'),
    dividerAfterColor: document.getElementById('dividerAfterColor'),
    sizeControlGroup: document.getElementById('sizeControlGroup'),
    sizeDotBtns: document.querySelectorAll('.size-dot-btn'),
    strokeSizeSlider: document.getElementById('strokeSizeSlider'),
    strokeSizeValue: document.getElementById('strokeSizeValue'),
    smoothingControlGroup: document.getElementById('smoothingControlGroup'),
    smoothingSlider: document.getElementById('smoothingSlider'),
    smoothingValue: document.getElementById('smoothingValue'),
    btnPressureDynamic: document.getElementById('btnPressureDynamic'),
    btnPressureUniform: document.getElementById('btnPressureUniform'),
    autoShapeToggle: document.getElementById('autoShapeToggle'),
    textControlGroup: document.getElementById('textControlGroup'),
    btnAddTextCardNow: document.getElementById('btnAddTextCardNow'),
    btnAddLatexCardNow: document.getElementById('btnAddLatexCardNow'),
    shapeControlGroup: document.getElementById('shapeControlGroup'),
    shapeBtns: document.querySelectorAll('[data-shape]'),
    shapeFillCheckbox: document.getElementById('shapeFillCheckbox'),
    eraserControlGroup: document.getElementById('eraserControlGroup'),
    eraserModeBtns: document.querySelectorAll('[data-eraser-mode]'),
    btnClearPage: document.getElementById('btnClearPage'),
    lassoControlGroup: document.getElementById('lassoControlGroup'),
    lassoSelectionBadge: document.getElementById('lassoSelectionBadge'),
    btnRecognizeSelection: document.getElementById('btnRecognizeSelection'),
    btnDuplicateSelection: document.getElementById('btnDuplicateSelection'),
    btnScaleUpSelection: document.getElementById('btnScaleUpSelection'),
    btnScaleDownSelection: document.getElementById('btnScaleDownSelection'),
    btnDeleteSelection: document.getElementById('btnDeleteSelection'),
    paperPopover: document.getElementById('paperPopover'),
    btnClosePaperPopover: document.getElementById('btnClosePaperPopover'),
    paperOptionBtns: document.querySelectorAll('[data-paper]'),
    toneBtns: document.querySelectorAll('[data-tone]'),
    gridSpacingSlider: document.getElementById('gridSpacingSlider'),
    gridSpacingVal: document.getElementById('gridSpacingVal'),
    viewModeBtns: document.querySelectorAll('[data-viewmode]'),
    exportPopover: document.getElementById('exportPopover'),
    btnCloseExportPopover: document.getElementById('btnCloseExportPopover'),
    btnExportSvg: document.getElementById('btnExportSvg'),
    btnExportPng: document.getElementById('btnExportPng'),
    btnExportPdf: document.getElementById('btnExportPdf'),
    btnExportCurrentPagePdf: document.getElementById('btnExportCurrentPagePdf'),
    btnImportPdfFromExportMenu: document.getElementById('btnImportPdfFromExportMenu'),
    canvasViewport: document.getElementById('canvasViewport'),
    pdfBgCanvas: document.getElementById('pdfBgCanvas'),
    inkCanvas: document.getElementById('inkCanvas'),
    activeInkCanvas: document.getElementById('activeInkCanvas'),
    worldObjectsLayer: document.getElementById('worldObjectsLayer'),
    eraserCursor: document.getElementById('eraserCursor'),
    colorDotCursor: document.getElementById('colorDotCursor'),
    lassoFloatingActions: document.getElementById('lassoFloatingActions'),
    shapeEditFloatingBar: document.getElementById('shapeEditFloatingBar'),
    btnQuickDupLasso: document.getElementById('btnQuickDupLasso'),
    btnQuickRecogLasso: document.getElementById('btnQuickRecogLasso'),
    btnQuickDelLasso: document.getElementById('btnQuickDelLasso'),
    radialColorWheel: document.getElementById('radialColorWheel'),
    radialWheelSvg: document.getElementById('radialWheelSvg'),
    radialWheelCenter: document.getElementById('radialWheelCenter'),
    radialCenterDot: document.getElementById('radialCenterDot'),
    radialCenterLabel: document.getElementById('radialCenterLabel'),
    pointerTypeBadge: document.getElementById('pointerTypeBadge'),
    pressureBarFill: document.getElementById('pressureBarFill'),
    pressureReadout: document.getElementById('pressureReadout'),
    coalescedReadout: document.getElementById('coalescedReadout'),
    palmRejectionToggle: document.getElementById('palmRejectionToggle'),
    btnPrevPage: document.getElementById('btnPrevPage'),
    btnNextPage: document.getElementById('btnNextPage'),
    btnQuickAddPage: document.getElementById('btnQuickAddPage'),
    hudPageIndicator: document.getElementById('hudPageIndicator'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnZoomReset: document.getElementById('btnZoomReset'),
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnExtendCanvas: document.getElementById('btnExtendCanvas'),
    btnFitPage: document.getElementById('btnFitPage'),
    // Modale Import PDF
    modalImportPdf: document.getElementById('modalImportPdf'),
    btnCloseImportPdfModal: document.getElementById('btnCloseImportPdfModal'),
    btnCancelImportPdfModal: document.getElementById('btnCancelImportPdfModal'),
    pdfModalDropzone: document.getElementById('pdfModalDropzone'),
    importPdfFileName: document.getElementById('importPdfFileName'),
    importPdfPageCount: document.getElementById('importPdfPageCount'),
    btnSelectPdfFileModal: document.getElementById('btnSelectPdfFileModal'),
    btnGenerateSamplePdf: document.getElementById('btnGenerateSamplePdf'),
    pdfImportErrorBanner: document.getElementById('pdfImportErrorBanner'),
    pdfImportProgressWrap: document.getElementById('pdfImportProgressWrap'),
    pdfImportProgressText: document.getElementById('pdfImportProgressText'),
    pdfImportProgressPercent: document.getElementById('pdfImportProgressPercent'),
    pdfImportProgressFill: document.getElementById('pdfImportProgressFill'),
    btnConfirmPdfAppendNotebook: document.getElementById('btnConfirmPdfAppendNotebook'),
    btnConfirmPdfNewNotebook: document.getElementById('btnConfirmPdfNewNotebook'),
    // Modale LaTeX
    modalLatexEditor: document.getElementById('modalLatexEditor'),
    btnCloseLatexModal: document.getElementById('btnCloseLatexModal'),
    btnCancelLatexModal: document.getElementById('btnCancelLatexModal'),
    btnConfirmLatexModal: document.getElementById('btnConfirmLatexModal'),
    inputLatexCode: document.getElementById('inputLatexCode'),
    latexLivePreview: document.getElementById('latexLivePreview'),
    latexQuickSymbols: document.querySelectorAll('#latexQuickSymbols [data-insert]'),
    latexPresetTemplates: document.querySelectorAll('#latexPresetTemplates [data-template]'),
    // Modale Reconnaissance
    modalRecognition: document.getElementById('modalRecognition'),
    btnCloseRecognitionModal: document.getElementById('btnCloseRecognitionModal'),
    recogSnapshotCanvas: document.getElementById('recogSnapshotCanvas'),
    inputRecognizedText: document.getElementById('inputRecognizedText'),
    inputRecognizedLatex: document.getElementById('inputRecognizedLatex'),
    recogLatexPreview: document.getElementById('recogLatexPreview'),
    btnCopyRecognizedLatex: document.getElementById('btnCopyRecognizedLatex'),
    btnInsertRecognizedText: document.getElementById('btnInsertRecognizedText'),
    btnReplaceWithText: document.getElementById('btnReplaceWithText'),
    btnReplaceWithLatex: document.getElementById('btnReplaceWithLatex'),
    // Autres modales
    modalNewNotebook: document.getElementById('modalNewNotebook'),
    btnCloseNotebookModal: document.getElementById('btnCloseNotebookModal'),
    btnCancelNotebookModal: document.getElementById('btnCancelNotebookModal'),
    btnCreateNotebookConfirm: document.getElementById('btnCreateNotebookConfirm'),
    inputNotebookName: document.getElementById('inputNotebookName'),
    notebookCoverSwatches: document.querySelectorAll('#notebookCoverSwatches .color-swatch'),
    selectDefaultPaper: document.getElementById('selectDefaultPaper'),
    modalDesktopInfo: document.getElementById('modalDesktopInfo'),
    btnCloseDesktopModal: document.getElementById('btnCloseDesktopModal'),
    btnOkDesktopModal: document.getElementById('btnOkDesktopModal'),
    modalRenameItem: document.getElementById('modalRenameItem'),
    modalRenameTitle: document.getElementById('modalRenameTitle'),
    inputRenameValue: document.getElementById('inputRenameValue'),
    btnCloseRenameModal: document.getElementById('btnCloseRenameModal'),
    btnCancelRenameModal: document.getElementById('btnCancelRenameModal'),
    btnConfirmRenameModal: document.getElementById('btnConfirmRenameModal'),
    toastContainer: document.getElementById('toastContainer')
  };

  const ctx = dom.inkCanvas.getContext('2d');
  const activeCtx = dom.activeInkCanvas ? dom.activeInkCanvas.getContext('2d') : null;
  const bgCtx = dom.pdfBgCanvas ? dom.pdfBgCanvas.getContext('2d') : null;

  const renderPerfStats = {
    staticRenderCount: 0,
    activeRenderCount: 0,
    mergedStrokesCount: 0,
    lastStaticRenderMs: 0,
    lastActiveRenderMs: 0
  };

  // ============================================================================
  // 8. GESTION DES PAGES, NETTOYAGE D'ÉTAT & HISTORIQUE UNDO / REDO ROBUSTE
  // ============================================================================

  function getActiveNotebook() { return state.notebooks.find((n) => n.id === state.activeNotebookId) || null; }
  function getActiveNotebookPages() {
    const list = state.pagesByNotebook.get(state.activeNotebookId) || [];
    return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  function getActivePage() {
    const pages = getActiveNotebookPages();
    return pages.find((p) => p.id === state.activePageId) || pages[0] || null;
  }
  function cloneStrokeFast(s) {
    const pts = s.points ? new Array(s.points.length) : [];
    if (s.points) {
      for (let i = 0; i < s.points.length; i++) {
        const p = s.points[i];
        pts[i] = {
          x: p.x,
          y: p.y,
          pressure: p.pressure,
          tiltX: p.tiltX || 0,
          tiltY: p.tiltY || 0,
          t: p.t
        };
      }
    }
    const copy = {
      id: s.id,
      tool: s.tool,
      penStyle: s.penStyle || 'fountain',
      lineStyle: s.lineStyle || 'solid',
      color: s.color,
      size: s.size,
      smoothing: s.smoothing,
      tipSharpness: s.tipSharpness,
      pressureSensitivity: s.pressureSensitivity,
      _liveStabilized: s._liveStabilized,
      pressureMode: s.pressureMode,
      simulatePressure: s.simulatePressure,
      recognizedSymbol: s.recognizedSymbol,
      recognizedGroup: s.recognizedGroup,
      points: pts,
      _bounds: s._bounds ? { ...s._bounds } : null,
      _renderMode: s._renderMode
    };
    const existingCache = strokePathCache.get(s);
    if (existingCache) {
      strokePathCache.set(copy, existingCache);
    }
    return copy;
  }

  function clonePageContent(page) {
    if (!page) return { strokes: [], shapes: [], texts: [], tapes: [], images: [] };
    return {
      strokes: (page.strokes || []).map(cloneStrokeFast),
      shapes: (page.shapes || []).map((sh) => ({
        ...sh,
        vertices: Array.isArray(sh.vertices) ? sh.vertices.map((v) => ({ x: v.x, y: v.y })) : undefined,
        startConnection: sh.startConnection ? { ...sh.startConnection } : undefined,
        endConnection: sh.endConnection ? { ...sh.endConnection } : undefined
      })),
      texts: (page.texts || []).map((tb) => ({
        ...tb,
        frameStyle: tb.frameStyle ? { ...tb.frameStyle } : undefined
      })),
      tapes: (page.tapes || []).map((tp) => ({
        ...tp,
        points: Array.isArray(tp.points) ? tp.points.map((p) => ({ x: p.x, y: p.y })) : undefined
      })),
      images: (page.images || []).map((img) => ({ ...img }))
    };
  }
  function getPageHistory(pageId) {
    if (!state.historyByPage.has(pageId)) state.historyByPage.set(pageId, { undoStack: [], redoStack: [] });
    return state.historyByPage.get(pageId);
  }
  function pushHistorySnapshot(targetPage = getActivePage()) {
    const page = targetPage || getActivePage();
    if (!page || !page.id) return;
    const hist = getPageHistory(page.id);
    hist.undoStack.push(clonePageContent(page));
    if (hist.undoStack.length > 60) hist.undoStack.shift();
    hist.redoStack = [];
    updateUndoRedoButtons();
  }

  /**
   * Si un trait ou une forme est en cours de tracé au moment où l'utilisateur change de page ou de cahier,
   * valide proprement ce trait sur la page d'origine et déclenche sa sauvegarde avant la bascule.
   */
  function finalizeActiveDrawingOnCurrentPage() {
    if (!state.isDrawing) return false;
    const page = getActivePage();
    let committed = false;
    if (page) {
      if ((state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter') && state.currentStroke) {
        if (state.currentStrokeSnappedFromAutoShape && state.currentShape) {
          const snapped = state.currentShape;
          delete snapped.detectedName;
          page.shapes.push(snapped);
          committed = true;
        } else if (Array.isArray(state.currentStroke.points) && state.currentStroke.points.length > 0) {
          if (state.currentStroke.points.length === 1) {
            const p0 = state.currentStroke.points[0];
            state.currentStroke.points.push({ x: p0.x + 0.2, y: p0.y + 0.2, pressure: p0.pressure });
          }
          invalidateStrokeCache(state.currentStroke);
          page.strokes.push(state.currentStroke);
          committed = true;
        }
      } else if (state.tool === 'tape' && state.currentTape) {
        if (getTapeTotalLength(state.currentTape) > 10) {
          if (!Array.isArray(page.tapes)) page.tapes = [];
          page.tapes.push(state.currentTape);
          invalidateStaticInkCache();
          committed = true;
        }
        state.currentTape = null;
      } else if (state.tool === 'shape' && state.currentShape) {
        if (Math.hypot(state.currentShape.x2 - state.currentShape.x1, state.currentShape.y2 - state.currentShape.y1) > 4) {
          page.shapes.push(state.currentShape);
          committed = true;
        }
      } else if (state.tool === 'eraser') {
        committed = true;
      }
      if (committed) {
        scheduleSaveActivePage(page);
      }
    }
    cleanupTransientInteractionState(false);
    return committed;
  }

  /**
   * Nettoie tous les états transitoires d'interaction (timers, pointeurs, captures, roue de couleurs, survols)
   */
  function cleanupTransientInteractionState(commitStrokeFirst = false) {
    if (commitStrokeFirst && state.isDrawing) {
      finalizeActiveDrawingOnCurrentPage();
      return;
    }
    cancelHoldShapeTimer();
    cancelColorWheelTimer();
    if (state.colorWheelOpen) closeRadialColorWheel(false);
    if (state.activePointerId !== null && dom.inkCanvas) {
      try { dom.inkCanvas.releasePointerCapture(state.activePointerId); } catch (_) {}
    }
    state.isDrawing = false;
    state.isPanning = false;
    state.isPinching = false;
    state.activePointerId = null;
    state.currentStroke = null;
    state.currentShape = null;
    state.currentStrokeSnappedFromAutoShape = false;
    state.holdShapeAnchorScreen = null;
    state.colorWheelAnchorScreen = null;
    state.lassoPolygon = [];
    state.lassoAction = null;
    state.lassoInitialSnapshot = null;
    state.lassoInitialBounds = null;
    state.lassoDragStartWorld = null;
    state.touchPoints.clear();
    if (typeof resetPullToAddState === 'function') resetPullToAddState();
    if (dom.canvasViewport) dom.canvasViewport.classList.remove('panning');
    if (dom.eraserCursor) dom.eraserCursor.style.display = 'none';
    if (dom.colorDotCursor) dom.colorDotCursor.style.display = 'none';
    state.shapeHoverConnection = null;
    state.selectedShapeId = null;
    state.shapeEditDrag = null;
    state.pendingShapeTapCandidateId = null;
    state.pendingShapeTapStartScreen = null;
    if (dom.shapeEditFloatingBar) dom.shapeEditFloatingBar.classList.add('hidden');
    if (state.temporaryEraserOverride) {
      state.temporaryEraserOverride = false;
      state.tool = state.previousToolBeforeEraser || 'pen';
    }
    if (state.temporaryLassoOverride) {
      state.temporaryLassoOverride = false;
      state.tool = state.previousToolBeforeLasso || 'pen';
    }
  }

  let isUndoRedoBusy = false;
  function performUndo() {
    if (isUndoRedoBusy) return false;
    const page = getActivePage();
    if (!page || !page.id) return false;
    if (state.isDrawing) {
      cleanupTransientInteractionState(false);
    }
    const hist = getPageHistory(page.id);
    if (!hist || hist.undoStack.length === 0) {
      updateUndoRedoButtons();
      return false;
    }
    isUndoRedoBusy = true;
    try {
      const prev = hist.undoStack.pop();
      if (!prev) {
        updateUndoRedoButtons();
        return false;
      }
      hist.redoStack.push(clonePageContent(page));
      if (hist.redoStack.length > 60) hist.redoStack.shift();
      const restored = clonePageContent(prev);
      page.strokes = restored.strokes;
      page.shapes = restored.shapes;
      page.texts = restored.texts;
      page.tapes = restored.tapes;
      page.images = restored.images;
      invalidateStaticInkCache();
      clearLassoSelection();
      updateUndoRedoButtons();
      renderWorldTextCards();
      requestRender();
      if (dom.leftSidebar && dom.sectionPages && !dom.leftSidebar.classList.contains('collapsed') && !dom.sectionPages.classList.contains('hidden')) {
        page.thumbnail = generatePageThumbnail(page);
        updateSingleSidebarThumbnailDom(page);
      }
      scheduleSaveActivePage(page);
      showToast('Action annulée', 'info', 'undo-redo');
      return true;
    } finally {
      isUndoRedoBusy = false;
    }
  }

  function performRedo() {
    if (isUndoRedoBusy) return false;
    const page = getActivePage();
    if (!page || !page.id) return false;
    if (state.isDrawing) {
      cleanupTransientInteractionState(false);
    }
    const hist = getPageHistory(page.id);
    if (!hist || hist.redoStack.length === 0) {
      updateUndoRedoButtons();
      return false;
    }
    isUndoRedoBusy = true;
    try {
      const next = hist.redoStack.pop();
      if (!next) {
        updateUndoRedoButtons();
        return false;
      }
      hist.undoStack.push(clonePageContent(page));
      if (hist.undoStack.length > 60) hist.undoStack.shift();
      const restored = clonePageContent(next);
      page.strokes = restored.strokes;
      page.shapes = restored.shapes;
      page.texts = restored.texts;
      page.tapes = restored.tapes;
      page.images = restored.images;
      invalidateStaticInkCache();
      clearLassoSelection();
      updateUndoRedoButtons();
      renderWorldTextCards();
      requestRender();
      if (dom.leftSidebar && dom.sectionPages && !dom.leftSidebar.classList.contains('collapsed') && !dom.sectionPages.classList.contains('hidden')) {
        page.thumbnail = generatePageThumbnail(page);
        updateSingleSidebarThumbnailDom(page);
      }
      scheduleSaveActivePage(page);
      showToast('Action rétablie', 'info', 'undo-redo');
      return true;
    } finally {
      isUndoRedoBusy = false;
    }
  }

  function updateUndoRedoButtons() {
    const page = getActivePage();
    if (!page) {
      if (dom.btnUndo) dom.btnUndo.disabled = true;
      if (dom.btnRedo) dom.btnRedo.disabled = true;
      return;
    }
    const hist = getPageHistory(page.id);
    if (dom.btnUndo) dom.btnUndo.disabled = hist.undoStack.length === 0;
    if (dom.btnRedo) dom.btnRedo.disabled = hist.redoStack.length === 0;
  }

  // ============================================================================
  // 9. COORDONNÉES MONDE, ZOOM FLUIDE, PINCEMENT & TRANSFORMATIONS
  // ============================================================================

  function screenToWorld(clientX, clientY) {
    const rect = dom.inkCanvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.panX) / state.zoom,
      y: (clientY - rect.top - state.panY) / state.zoom
    };
  }

  let lastAppliedWorldTransform = '';
  function syncWorldLayerTransform() {
    if (dom.worldObjectsLayer) {
      const nextTransform = `translate3d(${state.panX}px, ${state.panY}px, 0) scale(${state.zoom})`;
      if (nextTransform !== lastAppliedWorldTransform) {
        lastAppliedWorldTransform = nextTransform;
        dom.worldObjectsLayer.style.transform = nextTransform;
      }
    }
  }

  let isZoomInteracting = false;
  let zoomSettleTimer = null;
  let panInertiaFrame = null;
  let viewportAnimFrame = null;
  const panVelocitySamples = [];

  function stopViewportAnimations() {
    if (panInertiaFrame) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(panInertiaFrame);
      else clearTimeout(panInertiaFrame);
      panInertiaFrame = null;
    }
    if (viewportAnimFrame) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(viewportAnimFrame);
      else clearTimeout(viewportAnimFrame);
      viewportAnimFrame = null;
    }
    panVelocitySamples.length = 0;
  }

  function recordPanVelocitySample(clientX, clientY, nowMs = performance.now()) {
    panVelocitySamples.push({ x: clientX, y: clientY, t: nowMs });
    while (panVelocitySamples.length > 2 && nowMs - panVelocitySamples[0].t > 70) {
      panVelocitySamples.shift();
    }
  }

  const PAGE_STACK_GAP = 36;

  function getBoundedDeskBackdropColor() {
    const isAppDark = typeof document !== 'undefined' &&
      document.documentElement &&
      typeof document.documentElement.getAttribute === 'function' &&
      document.documentElement.getAttribute('data-theme') === 'dark';
    return isAppDark ? '#1d1f25' : '#e6e5e4';
  }

  function isBoundedPage(page) {
    if (!page) return false;
    return (page.viewMode && page.viewMode !== 'infinite') || Boolean(page.pdfId || page.isPdfPage);
  }

  function getPageBounds(page) {
    const pw = (page && Number.isFinite(page.pdfWidth) && page.pdfWidth > 0)
      ? page.pdfWidth
      : ((page && Number.isFinite(page.pageWidth) && page.pageWidth > 0) ? page.pageWidth : PAGE_WIDTH);
    const ph = (page && Number.isFinite(page.pdfHeight) && page.pdfHeight > 0)
      ? page.pdfHeight
      : ((page && Number.isFinite(page.pageHeight) && page.pageHeight > 0) ? page.pageHeight : PAGE_HEIGHT);
    return { minX: 0, minY: 0, maxX: pw, maxY: ph, width: pw, height: ph };
  }

  function getBoundedStackInfo(refPage = getActivePage()) {
    if (!isBoundedPage(refPage)) return null;
    const allPages = getActiveNotebookPages();
    const boundedPages = allPages.filter((p) => isBoundedPage(p));
    const list = boundedPages.length > 0 ? boundedPages : [refPage];
    let maxW = 0;
    for (let i = 0; i < list.length; i++) {
      const b = getPageBounds(list[i]);
      if (b.width > maxW) maxW = b.width;
    }
    const items = [];
    let curY = 0;
    let activeIdx = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const b = getPageBounds(p);
      const xOffset = Math.round((maxW - b.width) * 0.5);
      items.push({ page: p, index: i, width: b.width, height: b.height, xOffset, yOffset: curY, relX: 0, relY: 0 });
      if (p.id === refPage.id) activeIdx = i;
      curY += b.height + PAGE_STACK_GAP;
    }
    const totalHeight = Math.max(0, curY - PAGE_STACK_GAP);
    const activeItem = items[activeIdx] || items[0];
    for (let i = 0; i < items.length; i++) {
      items[i].relX = items[i].xOffset - activeItem.xOffset;
      items[i].relY = items[i].yOffset - activeItem.yOffset;
    }
    return {
      items,
      activeIdx,
      activeItem,
      maxWidth: maxW,
      totalHeight,
      minRelY: -activeItem.yOffset,
      maxRelY: totalHeight - activeItem.yOffset
    };
  }

  function findStackPageAtWorldPoint(wx, wy, margin = 4) {
    const stack = getBoundedStackInfo(getActivePage());
    if (!stack) return null;
    for (let i = 0; i < stack.items.length; i++) {
      const it = stack.items[i];
      if (
        wx >= it.relX - margin &&
        wx <= it.relX + it.width + margin &&
        wy >= it.relY - margin &&
        wy <= it.relY + it.height + margin
      ) {
        return it;
      }
    }
    return null;
  }

  function switchActivePageInStack(targetPageId) {
    const curPage = getActivePage();
    if (!curPage || !targetPageId || curPage.id === targetPageId) return false;
    const stack = getBoundedStackInfo(curPage);
    if (!stack) return false;
    const targetItem = stack.items.find((it) => it.page.id === targetPageId);
    if (!targetItem) return false;

    const shiftX = targetItem.relX * state.zoom;
    const shiftY = targetItem.relY * state.zoom;
    state.panX += shiftX;
    state.panY += shiftY;
    if (state.isPanning && state.panStartOffset) {
      state.panStartOffset.x += shiftX;
      state.panStartOffset.y += shiftY;
    }
    if (staticInkCache.valid && staticInkCache.zoom > 0) {
      staticInkCache.originPanX += targetItem.relX * staticInkCache.zoom;
      staticInkCache.originPanY += targetItem.relY * staticInkCache.zoom;
      staticInkCache.pageId = targetPageId;
      staticInkCache.effectiveDark = !targetItem.page.pdfId && (targetItem.page.paperTone === 'dark' || targetItem.page.paperTone === 'blueprint');
    }

    state.activePageId = targetPageId;
    ensureActiveAndAdjacentPdfPagesLoaded(targetItem.page);
    renderPagesSidebar();
    updateUndoRedoButtons();
    renderWorldTextCards();
    syncWorldLayerTransform();
    return true;
  }

  function syncActivePageFromStackViewport() {
    if (state.isDrawing || state.currentStroke || state.currentShape || hasAnyLassoSelection()) return false;
    const curPage = getActivePage();
    const stack = getBoundedStackInfo(curPage);
    if (!stack || stack.items.length <= 1 || !dom.canvasViewport) return false;
    const rect = dom.canvasViewport.getBoundingClientRect();
    if (!rect || rect.height <= 0) return false;
    const viewProbeY = (rect.height * 0.45 - state.panY) / state.zoom;
    let bestItem = stack.activeItem;
    let bestDist = Infinity;
    for (let i = 0; i < stack.items.length; i++) {
      const it = stack.items[i];
      if (viewProbeY >= it.relY - PAGE_STACK_GAP * 0.5 && viewProbeY <= it.relY + it.height + PAGE_STACK_GAP * 0.5) {
        bestItem = it;
        break;
      }
      const center = it.relY + it.height * 0.5;
      const d = Math.abs(viewProbeY - center);
      if (d < bestDist) {
        bestDist = d;
        bestItem = it;
      }
    }
    if (bestItem && bestItem.page.id !== state.activePageId) {
      return switchActivePageInStack(bestItem.page.id);
    }
    return false;
  }

  function isPointInsidePage(page, x, y, margin = 0) {
    if (!isBoundedPage(page)) return true;
    const b = getPageBounds(page);
    return x >= -margin && x <= b.maxX + margin && y >= -margin && y <= b.maxY + margin;
  }

  function clampPointToPage(page, pt) {
    if (!pt || !isBoundedPage(page)) return pt;
    const b = getPageBounds(page);
    return {
      x: Math.max(0, Math.min(b.maxX, pt.x)),
      y: Math.max(0, Math.min(b.maxY, pt.y))
    };
  }

  function intersectSegmentWithRect(p0, p1, maxX, maxY) {
    // Algorithme de Liang-Barsky pour trouver l'intersection exacte avec [0, maxX] x [0, maxY]
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    let t0 = 0;
    let t1 = 1;
    const checks = [
      [-dx, p0.x],
      [dx, maxX - p0.x],
      [-dy, p0.y],
      [dy, maxY - p0.y]
    ];
    for (let i = 0; i < 4; i++) {
      const p = checks[i][0];
      const q = checks[i][1];
      if (Math.abs(p) < 1e-9) {
        if (q < 0) return null;
      } else {
        const r = q / p;
        if (p < 0) {
          if (r > t1) return null;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return null;
          if (r < t1) t1 = r;
        }
      }
    }
    return {
      entry: { x: p0.x + t0 * dx, y: p0.y + t0 * dy },
      exit: { x: p0.x + t1 * dx, y: p0.y + t1 * dy }
    };
  }

  function getBoundedFitHeightZoom(page) {
    const rect = dom.canvasViewport ? dom.canvasViewport.getBoundingClientRect() : null;
    const b = getPageBounds(page);
    if (!rect || rect.width <= 0 || rect.height <= 0) return 0.72;
    const topSafe = 58;
    const bottomPad = 14;
    const availW = Math.max(200, rect.width - 28);
    const availH = Math.max(200, rect.height - topSafe - bottomPad);
    return Math.min(availW / b.width, availH / b.height);
  }

  function snapBackBoundedViewportIfZoomedOut() {
    const page = getActivePage();
    if (!isBoundedPage(page) || !dom.canvasViewport) return false;
    const rect = dom.canvasViewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const fitZoom = getBoundedFitHeightZoom(page);
    const b = getPageBounds(page);
    const topSafe = 58;
    const bottomPad = 14;
    const scaledH = b.height * state.zoom;
    const availH = rect.height - topSafe - bottomPad;
    // Si la feuille est dézoomée plus petite que la hauteur haut-bas de l'écran, on rezoome automatiquement pour la recaler haut & bas
    if (state.zoom < fitZoom - 0.004 || scaledH < availH - 2) {
      const targetZoom = Math.max(fitZoom, state.zoom);
      const targetPanX = Math.round((rect.width - b.width * targetZoom) / 2);
      const targetPanY = Math.round(topSafe + Math.max(0, (availH - b.height * targetZoom) / 2));
      animateViewportTo(targetZoom, targetPanX, targetPanY, 220);
      return true;
    }
    return false;
  }

  function getViewportZoomLimits(page) {
    if (isBoundedPage(page)) {
      const fitZoom = getBoundedFitHeightZoom(page);
      // Légère élasticité pendant le pincement/molette (70% du fitZoom), puis rebond automatique vers fitZoom au relâchement
      const minZoom = Math.max(0.25, fitZoom * 0.70);
      return { minZoom, maxZoom: 4.5 };
    }
    return { minZoom: 0.35, maxZoom: 4.5 };
  }

  const GN_PULL_TO_ADD_THRESHOLD_PX = 128;
  const GN_PULL_TO_ADD_MAX_VISUAL_PX = 132;
  const GN_PULL_TO_ADD_RUBBER_FACTOR = 0.54;

  function getBoundedVerticalScrollLimits(zoom, page) {
    const rect = dom.canvasViewport ? dom.canvasViewport.getBoundingClientRect() : null;
    if (!rect || rect.width <= 0 || rect.height <= 0 || !isBoundedPage(page)) return null;
    const vw = rect.width;
    const vh = rect.height;
    const topSafe = 58;
    const bottomPad = 24;
    const b = getPageBounds(page);
    const stack = getBoundedStackInfo(page);
    if (stack && stack.items.length > 1) {
      const scaledW = stack.maxWidth * zoom;
      const scaledTotalH = stack.totalHeight * zoom;
      const availH = vh - topSafe - bottomPad;
      if (scaledTotalH <= availH) {
        const centerY = Math.round(topSafe + (availH - scaledTotalH) / 2 - stack.minRelY * zoom);
        return { minPanY: centerY, maxPanY: centerY, scaledW, scaledH: scaledTotalH, vw, vh, topSafe, bottomPad, pageBounds: b, stack };
      }
      return {
        minPanY: Math.round(vh - bottomPad - stack.maxRelY * zoom),
        maxPanY: Math.round(topSafe + 16 - stack.minRelY * zoom),
        scaledW,
        scaledH: scaledTotalH,
        vw,
        vh,
        topSafe,
        bottomPad,
        pageBounds: b,
        stack
      };
    }
    const scaledW = b.width * zoom;
    const scaledH = b.height * zoom;
    const availH = vh - topSafe - bottomPad;
    if (scaledH <= availH) {
      const centerY = Math.round(topSafe + (availH - scaledH) / 2);
      return { minPanY: centerY, maxPanY: centerY, scaledW, scaledH, vw, vh, topSafe, bottomPad, pageBounds: b, stack };
    }
    return {
      minPanY: Math.round(vh - scaledH - bottomPad),
      maxPanY: topSafe + 16,
      scaledW,
      scaledH,
      vw,
      vh,
      topSafe,
      bottomPad,
      pageBounds: b,
      stack
    };
  }

  function resetPullToAddState() {
    if (!state.pullToAdd) return;
    if (state.pullToAdd.wheelTimer) {
      clearTimeout(state.pullToAdd.wheelTimer);
      state.pullToAdd.wheelTimer = null;
    }
    state.pullToAdd.active = false;
    state.pullToAdd.direction = null;
    state.pullToAdd.action = null;
    state.pullToAdd.percentage = 0;
    state.pullToAdd.visualOffset = 0;
    state.pullToAdd.rawExcess = 0;
    state.pullToAdd.source = null;
    const banner = document.getElementById('gnPullToAddBanner');
    if (banner) banner.classList.add('hidden');
  }

  function updatePullToAddBannerUi() {
    const banner = document.getElementById('gnPullToAddBanner');
    const inner = document.getElementById('gnPtaInner');
    const ringActive = document.getElementById('gnPtaRingActive');
    const label = document.getElementById('gnPtaLabel');
    if (!banner || !inner || !ringActive || !label) return;
    const pta = state.pullToAdd;
    const page = getActivePage();
    if (!pta || !pta.active || !isBoundedPage(page)) {
      banner.classList.add('hidden');
      return;
    }
    const limits = getBoundedVerticalScrollLimits(state.zoom, page);
    if (!limits) {
      banner.classList.add('hidden');
      return;
    }
    // Formules exactes issues de GoodNotes (PullToAddDecorator: shouldReleaseToAdd = p > 1, clipPath = p^3 * 100%)
    const pct = Math.max(0, pta.percentage);
    const ready = pct > 1.0;
    const clipPct = Math.min(Math.round(100 * Math.pow(pct, 3)), 100);
    const isTop = pta.direction === 'top';

    banner.classList.remove('hidden');
    inner.classList.toggle('is-ready', ready);
    inner.classList.toggle('dir-top', isTop);
    if (ringActive.style) {
      ringActive.style.clipPath = `polygon(0 0, 100% 0, 100% ${clipPct}%, 0% ${clipPct}%)`;
    }
    if (pta.action === 'add') {
      label.textContent = ready ? 'Relâcher pour ajouter une page' : 'Tirer pour ajouter une page';
    } else if (pta.action === 'next') {
      label.textContent = ready ? 'Relâcher pour la page suivante' : 'Tirer pour la page suivante';
    } else {
      label.textContent = ready ? 'Relâcher pour la page précédente' : 'Tirer pour la page précédente';
    }

    const pageCenterX = Math.max(115, Math.min(limits.vw - 115, state.panX + limits.scaledW * 0.5));
    const stackBottomWorldY = limits.stack ? limits.stack.maxRelY : limits.pageBounds.height;
    const pageBottomY = state.panY + stackBottomWorldY * state.zoom;
    const bannerTop = isTop
      ? Math.max(limits.topSafe + 8, Math.min(limits.vh - 116, state.panY - 102))
      : Math.max(limits.topSafe + 16, Math.min(limits.vh - 108, pageBottomY + 14));
    if (banner.style) {
      banner.style.left = `${Math.round(pageCenterX)}px`;
      banner.style.top = `${Math.round(bannerTop)}px`;
      banner.style.opacity = String(Math.max(0.12, Math.min(1, pct * 2.2)));
    }
  }

  function applyBoundedPanWithPullToAdd(rawPanX, rawPanY, source = 'pan') {
    const page = getActivePage();
    if (!isBoundedPage(page)) {
      const clamped = clampViewportPan(rawPanX, rawPanY, state.zoom, page);
      state.panX = clamped.panX;
      state.panY = clamped.panY;
      resetPullToAddState();
      return;
    }
    const limits = getBoundedVerticalScrollLimits(state.zoom, page);
    if (!limits) return;
    const clampedX = clampViewportPan(rawPanX, limits.minPanY, state.zoom, page).panX;

    // En défilement vertical continu multi-pages : le "Tirer pour ajouter une page" se déclenche en bas de la DERNIÈRE page
    if (rawPanY < limits.minPanY) {
      const rawExcess = limits.minPanY - rawPanY;
      const visualOffset = Math.min(GN_PULL_TO_ADD_MAX_VISUAL_PX, rawExcess * GN_PULL_TO_ADD_RUBBER_FACTOR);
      const percentage = rawExcess / GN_PULL_TO_ADD_THRESHOLD_PX;
      state.panX = clampedX;
      state.panY = limits.minPanY - visualOffset;
      state.pullToAdd.active = rawExcess > 2;
      state.pullToAdd.direction = 'bottom';
      state.pullToAdd.action = 'add';
      state.pullToAdd.rawExcess = rawExcess;
      state.pullToAdd.visualOffset = visualOffset;
      state.pullToAdd.percentage = percentage;
      state.pullToAdd.source = source;
      updatePullToAddBannerUi();
      return;
    }

    state.panX = clampedX;
    state.panY = Math.max(limits.minPanY, Math.min(limits.maxPanY, rawPanY));
    if (state.pullToAdd.active) resetPullToAddState();
    syncActivePageFromStackViewport();
  }

  function positionBoundedPageAfterTransition(align = 'top') {
    const page = getActivePage();
    if (!isBoundedPage(page) || !dom.canvasViewport) return;
    const limits = getBoundedVerticalScrollLimits(state.zoom, page);
    if (!limits) {
      fitPageToViewport(false);
      return;
    }
    const targetPanX = limits.scaledW <= limits.vw - 24
      ? Math.round((limits.vw - limits.scaledW) / 2)
      : clampViewportPan(state.panX, limits.topSafe + 16, state.zoom, page).panX;
    const pageTopPanY = Math.max(limits.minPanY, Math.min(limits.maxPanY, limits.topSafe + 16));
    const pageBottomPanY = Math.max(limits.minPanY, Math.min(limits.maxPanY, Math.round(limits.vh - limits.pageBounds.height * state.zoom - limits.bottomPad)));
    const targetPanY = align === 'bottom' ? pageBottomPanY : pageTopPanY;
    const slideOffset = align === 'bottom' ? -48 : 48;
    state.panX = targetPanX;
    state.panY = targetPanY + slideOffset;
    syncWorldLayerTransform();
    requestRender();
    animateViewportTo(state.zoom, targetPanX, targetPanY, 220);
  }

  function commitOrResetPullToAdd() {
    const pta = state.pullToAdd;
    if (!pta || !pta.active) return false;
    const { direction, action, percentage } = pta;
    resetPullToAddState();

    const page = getActivePage();
    if (!isBoundedPage(page)) return false;

    if (percentage > 1.0 && !pta.isCommitting) {
      const pages = getActiveNotebookPages();
      const curIdx = pages.findIndex((p) => p.id === state.activePageId);
      if (action === 'add') {
        pta.isCommitting = true;
        Promise.resolve(addNewPageToActiveNotebook({ fromPullToAdd: true })).finally(() => {
          state.pullToAdd.isCommitting = false;
        });
        return true;
      }
      if (action === 'next' && curIdx >= 0 && curIdx < pages.length - 1) {
        selectPage(pages[curIdx + 1].id);
        positionBoundedPageAfterTransition('top');
        return true;
      }
      if (action === 'prev' && curIdx > 0) {
        selectPage(pages[curIdx - 1].id);
        positionBoundedPageAfterTransition('bottom');
        return true;
      }
    }

    // Retour élastique doux vers le bord de la feuille si le seuil n'est pas atteint
    const limits = getBoundedVerticalScrollLimits(state.zoom, page);
    if (limits) {
      const snapY = direction === 'top' ? limits.maxPanY : limits.minPanY;
      animateViewportTo(state.zoom, state.panX, snapY, 200);
    }
    return true;
  }

  function clampViewportPan(panX, panY, zoom, page) {
    const rect = dom.canvasViewport ? dom.canvasViewport.getBoundingClientRect() : null;
    if (!rect || rect.width <= 0 || rect.height <= 0) return { panX, panY };
    const vw = rect.width;
    const vh = rect.height;
    const topSafe = 58;

    if (isBoundedPage(page)) {
      const b = getPageBounds(page);
      const scaledW = b.width * zoom;
      let clampedX = panX;

      if (scaledW <= vw - 32) {
        const centerX = (vw - scaledW) / 2;
        const slackX = Math.min(120, vw * 0.16);
        clampedX = Math.max(centerX - slackX, Math.min(centerX + slackX, panX));
      } else {
        const marginX = Math.min(140, vw * 0.18);
        const minPanX = vw - scaledW - marginX;
        const maxPanX = marginX;
        clampedX = Math.max(minPanX, Math.min(maxPanX, panX));
      }

      const vLimits = getBoundedVerticalScrollLimits(zoom, page);
      const clampedY = vLimits
        ? Math.max(vLimits.minPanY, Math.min(vLimits.maxPanY, panY))
        : panY;
      return { panX: clampedX, panY: clampedY };
    }

    // Mode page infinie : borne raisonnable autour de l'origine et du contenu existant (±1400 px)
    let minWX = 0, minWY = 0, maxWX = PAGE_WIDTH, maxWY = PAGE_HEIGHT;
    if (page && Array.isArray(page.strokes)) {
      for (let i = 0; i < page.strokes.length; i++) {
        const sb = getCachedStrokeBounds(page.strokes[i]);
        if (sb) {
          if (sb.minX < minWX) minWX = sb.minX;
          if (sb.minY < minWY) minWY = sb.minY;
          if (sb.maxX > maxWX) maxWX = sb.maxX;
          if (sb.maxY > maxWY) maxWY = sb.maxY;
        }
      }
    }
    const worldPad = 1400;
    const minPanX = vw - (maxWX + worldPad) * zoom;
    const maxPanX = -(minWX - worldPad) * zoom;
    const minPanY = vh - (maxWY + worldPad) * zoom;
    const maxPanY = topSafe - (minWY - worldPad) * zoom;
    return {
      panX: Math.max(minPanX, Math.min(maxPanX, panX)),
      panY: Math.max(minPanY, Math.min(maxPanY, panY))
    };
  }

  function startPanInertiaLoop() {
    if (panVelocitySamples.length < 2) return;
    const first = panVelocitySamples[0];
    const last = panVelocitySamples[panVelocitySamples.length - 1];
    const dt = Math.max(1, last.t - first.t);
    if (dt > 120) return;
    let vx = (last.x - first.x) / dt;
    let vy = (last.y - first.y) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.14) return;
    // Plafonne la vitesse initiale d'inertie
    const maxSpeed = 3.2;
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed;
      vy = (vy / speed) * maxSpeed;
    }
    let lastTick = performance.now();
    const step = (now) => {
      panInertiaFrame = null;
      const tickTs = typeof now === 'number' ? now : performance.now();
      const frameDt = Math.max(4, Math.min(48, tickTs - lastTick));
      lastTick = tickTs;
      const decay = Math.exp(-frameDt / 180);
      vx *= decay;
      vy *= decay;
      const dx = vx * frameDt;
      const dy = vy * frameDt;
      if (Math.hypot(dx, dy) < 0.15) {
        return;
      }
      const nextPan = clampViewportPan(state.panX + dx, state.panY + dy, state.zoom, getActivePage());
      const moved = Math.hypot(nextPan.panX - state.panX, nextPan.panY - state.panY);
      state.panX = nextPan.panX;
      state.panY = nextPan.panY;
      syncActivePageFromStackViewport();
      syncWorldLayerTransform();
      requestRender();
      if (moved < 0.1) return;
      panInertiaFrame = requestAnimationFrame(step);
    };
    panInertiaFrame = requestAnimationFrame(step);
  }

  function animateViewportTo(targetZoom, targetPanX, targetPanY, durationMs = 200) {
    stopViewportAnimations();
    const page = getActivePage();
    const { minZoom, maxZoom } = getViewportZoomLimits(page);
    const clampedZoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));
    const clampedTarget = clampViewportPan(targetPanX, targetPanY, clampedZoom, page);
    targetPanX = clampedTarget.panX;
    targetPanY = clampedTarget.panY;
    if (durationMs <= 0) {
      state.zoom = clampedZoom;
      state.panX = targetPanX;
      state.panY = targetPanY;
      if (dom.btnZoomReset) dom.btnZoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
      syncWorldLayerTransform();
      requestRender();
      scheduleHiDpiPdfCheck();
      return Promise.resolve();
    }
    const startZoom = state.zoom;
    const startPanX = state.panX;
    const startPanY = state.panY;
    const t0 = performance.now();
    isZoomInteracting = true;
    return new Promise((resolve) => {
      const step = (now) => {
        viewportAnimFrame = null;
        const ts = typeof now === 'number' ? now : performance.now();
        const rawT = Math.min(1, Math.max(0, (ts - t0) / durationMs));
        // Courbe ease-out cubique amortie GoodNotes (PagingLayoutManager fn#55284)
        const ease = 1 - Math.pow(1 - rawT, 3);
        state.zoom = startZoom + (clampedZoom - startZoom) * ease;
        state.panX = startPanX + (targetPanX - startPanX) * ease;
        state.panY = startPanY + (targetPanY - startPanY) * ease;
        if (dom.btnZoomReset) dom.btnZoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
        syncWorldLayerTransform();
        requestRender();
        if (rawT < 1) {
          viewportAnimFrame = requestAnimationFrame(step);
        } else {
          state.zoom = clampedZoom;
          state.panX = targetPanX;
          state.panY = targetPanY;
          isZoomInteracting = false;
          requestRender();
          scheduleHiDpiPdfCheck();
          resolve();
        }
      };
      viewportAnimFrame = requestAnimationFrame(step);
    });
  }

  function fitPageToViewport(animate = false) {
    stopViewportAnimations();
    const rect = dom.canvasViewport.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const page = getActivePage();
    const pw = (page && page.pdfWidth) ? page.pdfWidth : PAGE_WIDTH;
    const ph = (page && page.pdfHeight) ? page.pdfHeight : PAGE_HEIGHT;
    const availW = rect.width - 28;
    const availH = rect.height - 72;
    const targetZoom = isBoundedPage(page)
      ? Math.min(availW / pw, availH / ph)
      : Math.max(0.45, Math.min(1.08, Math.min(availW / pw, availH / ph)));
    const targetPanX = Math.round((rect.width - pw * targetZoom) / 2);
    const targetPanY = Math.max(58, Math.round(58 + Math.max(0, (rect.height - 72 - ph * targetZoom) / 2)));
    if (animate) {
      animateViewportTo(targetZoom, targetPanX, targetPanY, 220);
      return;
    }
    state.zoom = targetZoom;
    state.panX = targetPanX;
    state.panY = targetPanY;
    if (dom.btnZoomReset) dom.btnZoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
    syncWorldLayerTransform();
    requestRender();
  }

  function zoomAtScreenPoint(newZoom, screenX, screenY, animate = false) {
    stopViewportAnimations();
    const page = getActivePage();
    const { minZoom, maxZoom } = getViewportZoomLimits(page);
    const clamped = Math.max(minZoom, Math.min(maxZoom, newZoom));
    const wx = (screenX - state.panX) / state.zoom;
    const wy = (screenY - state.panY) / state.zoom;
    const rawPanX = screenX - wx * clamped;
    const rawPanY = screenY - wy * clamped;
    const clampedPan = clampViewportPan(rawPanX, rawPanY, clamped, page);
    if (animate) {
      animateViewportTo(clamped, clampedPan.panX, clampedPan.panY, 200);
      return;
    }
    state.zoom = clamped;
    state.panX = clampedPan.panX;
    state.panY = clampedPan.panY;
    isZoomInteracting = true;
    if (zoomSettleTimer) clearTimeout(zoomSettleTimer);
    zoomSettleTimer = setTimeout(() => {
      zoomSettleTimer = null;
      isZoomInteracting = false;
      if (!state.isPinching && snapBackBoundedViewportIfZoomedOut()) return;
      requestRender();
    }, 135);
    if (dom.btnZoomReset) dom.btnZoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
    syncWorldLayerTransform();
    requestRender();
    scheduleHiDpiPdfCheck();
  }

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
      wrap.className = 'world-image-card';
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
  let activeRenderPending = false;

  function requestRender() {
    if (!renderPending) {
      renderPending = true;
      requestAnimationFrame(() => {
        renderPending = false;
        activeRenderPending = false;
        renderScene();
      });
    }
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

  function getPaperPalette(tone = 'ivory') {
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

  // ============================================================================
  // 11A-BIS. MOTEUR CRAYON GRAPHITE RÉALISTE (GRAIN PAPIER MULTI-OCTAVE + PRESSION + INCLINAISON)
  // ============================================================================
  const PENCIL_PAPER_TILE_SIZE = 256;
  const PENCIL_DAB_SPRITE_SIZE = 64;
  let pencilPaperValleyCanvas = null;
  const pencilDabSpriteCache = new Map();
  const pencilLiveBuffer = { canvas: null, ctx: null, width: 0, height: 0, dirty: false };
  const pencilStaticScratch = { canvas: null, ctx: null, width: 0, height: 0 };

  function parseHexColorRgb(hexColor) {
    const key = String(hexColor || '#111827').trim().toLowerCase();
    const c = key.replace('#', '');
    const full = c.length === 3 ? c.replace(/(.)/g, '$1$1') : c;
    const num = parseInt(full, 16);
    if (!Number.isFinite(num)) return { r: 24, g: 24, b: 27 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function pencilHash2D(ix, iy, seed) {
    let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
    n = (n ^ (n >>> 13)) >>> 0;
    n = Math.imul(n, 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function pencilPeriodicValueNoise(x, y, freq, seed) {
    const fx = (x / PENCIL_PAPER_TILE_SIZE) * freq;
    const fy = (y / PENCIL_PAPER_TILE_SIZE) * freq;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const ix0 = ((x0 % freq) + freq) % freq;
    const iy0 = ((y0 % freq) + freq) % freq;
    const ix1 = (ix0 + 1) % freq;
    const iy1 = (iy0 + 1) % freq;
    const n00 = pencilHash2D(ix0, iy0, seed);
    const n10 = pencilHash2D(ix1, iy0, seed);
    const n01 = pencilHash2D(ix0, iy1, seed);
    const n11 = pencilHash2D(ix1, iy1, seed);
    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    return nx0 + (nx1 - nx0) * sy;
  }

  function getPencilPaperValleyCanvas() {
    if (pencilPaperValleyCanvas) return pencilPaperValleyCanvas;
    if (typeof document === 'undefined') return null;
    try {
      const sz = PENCIL_PAPER_TILE_SIZE;
      const off = document.createElement('canvas');
      off.width = sz;
      off.height = sz;
      const octx = off.getContext && off.getContext('2d');
      if (!octx || typeof octx.createImageData !== 'function') return null;

      const img = octx.createImageData(sz, sz);
      const data = img.data;
      for (let y = 0; y < sz; y++) {
        for (let x = 0; x < sz; x++) {
          // Grain papier naturel multi-octave (100 % raccordable sans couture sur 256×256)
          const o1 = pencilPeriodicValueNoise(x, y, 16, 11);
          const o2 = pencilPeriodicValueNoise(x, y, 32, 37);
          const o3 = pencilPeriodicValueNoise(x, y, 64, 73);
          const o4 = pencilPeriodicValueNoise(x, y, 128, 131);
          const micro = pencilHash2D(x, y, 251);
          // Très légère trame fibreuse du papier vergé/esquisse
          const fiberH = pencilPeriodicValueNoise(x * 0.5, y * 2, 64, 307);
          const fiberV = pencilPeriodicValueNoise(x * 2, y * 0.5, 64, 419);
          let h = o1 * 0.14 + o2 * 0.26 + o3 * 0.32 + o4 * 0.17 + micro * 0.07 + (fiberH * 0.02 + fiberV * 0.02);
          // Rehaussement de contraste organique des crêtes et creux du grain papier
          h = Math.max(0, Math.min(1, (h - 0.15) / 0.70));

          // Masque d'évidement des creux du papier (utilisé avec destination-out) :
          // - Crêtes du papier (h >= 0.64) : 0 % effacé (le graphite accroche franchement)
          // - Pentes (0.34..0.64) : transition nette du grain graphite
          // - Creux (h <= 0.34) : jusqu'à 92 % effacé (pores blancs naturels du papier)
          let valleyErase = 0;
          if (h < 0.64) {
            if (h > 0.34) {
              const t = (0.64 - h) / 0.30;
              valleyErase = (t * t * (3 - 2 * t)) * 0.66;
            } else {
              const t = (0.34 - h) / 0.34;
              valleyErase = 0.66 + t * 0.26;
            }
          }
          const idx = (y * sz + x) * 4;
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
          data[idx + 3] = Math.round(Math.max(0, Math.min(255, valleyErase * 255)));
        }
      }
      octx.putImageData(img, 0, 0);
      pencilPaperValleyCanvas = off;
      return off;
    } catch (_) {
      return null;
    }
  }

  function getPencilPaperValleyPattern(targetCtx) {
    if (!targetCtx || typeof targetCtx.createPattern !== 'function') return null;
    const tile = getPencilPaperValleyCanvas();
    if (!tile) return null;
    try {
      const pat = targetCtx.createPattern(tile, 'repeat');
      if (pat && typeof pat.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
        // 256 px mappés sur 128 unités monde = grain ultra-fin 0.5px sur écrans HiDPI 200%
        pat.setTransform(new DOMMatrix().scale(0.5, 0.5));
      }
      return pat;
    } catch (_) {
      return null;
    }
  }

  function getPencilDabSprite(hexColor) {
    const key = String(hexColor || '#111827').trim().toLowerCase();
    const cached = pencilDabSpriteCache.get(key);
    if (cached) return cached;
    if (typeof document === 'undefined') return null;
    try {
      const sz = PENCIL_DAB_SPRITE_SIZE;
      const off = document.createElement('canvas');
      off.width = sz;
      off.height = sz;
      const octx = off.getContext && off.getContext('2d');
      if (!octx || typeof octx.createImageData !== 'function') return null;

      const { r, g, b } = parseHexColorRgb(key);
      const img = octx.createImageData(sz, sz);
      const data = img.data;
      const half = sz * 0.5;
      const maxR = half - 2;

      for (let y = 0; y < sz; y++) {
        for (let x = 0; x < sz; x++) {
          const dx = x + 0.5 - half;
          const dy = y + 0.5 - half;
          const dist = Math.hypot(dx, dy);
          const u = dist / maxR;
          let alpha = 0;
          if (u < 1.0) {
            const ang = Math.atan2(dy, dx);
            // Légère irrégularité organique de la mine taillée (évite un disque géométrique artificiel)
            const leadShape = 0.93 + 0.07 * (Math.sin(ang * 3 + 0.6) * 0.55 + Math.cos(ang * 5 - 1.2) * 0.45);
            const un = u / leadShape;
            if (un < 1.0) {
              if (un <= 0.40) {
                // Cœur ferme de la mine pour garder les petits caractères nets et lisibles
                alpha = 1.0 - 0.12 * (un / 0.40);
              } else if (un <= 0.80) {
                // Épaule poudreuse qui se fragmente dans les crêtes du grain papier
                const t = (un - 0.40) / 0.40;
                const s = t * t * (3 - 2 * t);
                alpha = 0.88 * (1 - s) + 0.16 * s;
              } else {
                // Frange de poussière graphite ultra-douce en bordure
                const t = (un - 0.80) / 0.20;
                alpha = 0.16 * (1 - t) * (1 - t);
              }
              const microGrit = 0.86 + 0.14 * pencilHash2D(x, y, 509);
              alpha *= microGrit;
            }
          }
          const idx = (y * sz + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = Math.round(Math.max(0, Math.min(255, alpha * 255)));
        }
      }
      octx.putImageData(img, 0, 0);
      if (pencilDabSpriteCache.size >= 24) {
        const firstKey = pencilDabSpriteCache.keys().next().value;
        pencilDabSpriteCache.delete(firstKey);
      }
      pencilDabSpriteCache.set(key, off);
      return off;
    } catch (_) {
      return null;
    }
  }

  function releasePencilBuffersMemory() {
    if (pencilLiveBuffer.canvas) {
      releaseCanvasMemory(pencilLiveBuffer.canvas);
      pencilLiveBuffer.canvas = null;
      pencilLiveBuffer.ctx = null;
      pencilLiveBuffer.width = 0;
      pencilLiveBuffer.height = 0;
      pencilLiveBuffer.dirty = false;
    }
    if (pencilStaticScratch.canvas) {
      releaseCanvasMemory(pencilStaticScratch.canvas);
      pencilStaticScratch.canvas = null;
      pencilStaticScratch.ctx = null;
      pencilStaticScratch.width = 0;
      pencilStaticScratch.height = 0;
    }
    if (pencilPaperValleyCanvas) {
      releaseCanvasMemory(pencilPaperValleyCanvas);
      pencilPaperValleyCanvas = null;
    }
    pencilDabSpriteCache.forEach((c) => releaseCanvasMemory(c));
    pencilDabSpriteCache.clear();
  }

  function computePencilDabParams(size, pressure, tiltX, tiltY, pressureMode) {
    const isUniform = pressureMode === 'uniform';
    const p = isUniform ? 0.56 : Math.max(0.06, Math.min(1.0, typeof pressure === 'number' && Number.isFinite(pressure) ? pressure : 0.52));
    const tx = typeof tiltX === 'number' && Number.isFinite(tiltX) ? tiltX : 0;
    const ty = typeof tiltY === 'number' && Number.isFinite(tiltY) ? tiltY : 0;
    const tiltDeg = Math.hypot(tx, ty);
    const tiltMag = Math.min(1, tiltDeg / 65);
    // Activation progressive de l'ombrage latéral (mine inclinée > ~23°)
    const shadeRaw = Math.max(0, Math.min(1, (tiltMag - 0.35) / 0.52));
    const shade = shadeRaw * shadeRaw * (3 - 2 * shadeRaw);

    const rBase = Math.max(0.55, isUniform ? size * 0.5 : getStrokeRadius(size, 0.34, p));
    const rx = rBase * (1.0 + shade * 2.45);
    const ry = rBase * (1.0 + shade * 0.45);
    const angle = tiltDeg > 6 ? Math.atan2(ty, tx) : 0;

    // Pression → densité graphite (léger = esquisse 2H aérienne, moyen = HB riche, fort = 4B/6B dense)
    const pressureDensity = isUniform ? 0.84 : (0.28 + Math.pow(p, 0.70) * 0.70);
    const density = Math.max(0.16, Math.min(0.97, pressureDensity * (1 - shade * 0.45)));

    return { rBase, rx, ry, angle, shade, density, p };
  }

  function stampSinglePencilDab(ctx, dabSprite, x, y, params, ds, stepIdx) {
    const { rBase, rx, ry, angle, shade, density } = params;
    const jitterAmp = rBase * (shade > 0.15 ? 0.13 : 0.06);
    const jx = (pencilHash2D(stepIdx, 17, 613) - 0.5) * 2 * jitterAmp;
    const jy = (pencilHash2D(stepIdx, 43, 719) - 0.5) * 2 * jitterAmp;
    const px = x + jx;
    const py = y + jy;

    // Compensation exacte de l'espacement : densité constante quelle que soit la vitesse ou la taille
    const effSpan = Math.max(1.05, (rx + ry) * 0.66);
    const dabAlpha = Math.max(0.03, Math.min(0.92, 1 - Math.pow(Math.max(0.02, 1 - density), ds / effSpan)));
    ctx.globalAlpha = dabAlpha;

    const scaleBoost = 1.26; // Compense la frange douce du sprite 64×64
    if (shade > 0.03) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      const dw = rx * scaleBoost * 2;
      const dh = ry * scaleBoost * 2;
      ctx.drawImage(dabSprite, -dw * 0.5, -dh * 0.5, dw, dh);
      ctx.restore();
    } else {
      const drawR = rBase * scaleBoost;
      ctx.drawImage(dabSprite, px - drawR, py - drawR, drawR * 2, drawR * 2);
    }
  }

  function stampPencilCurveSegment(ctx, dabSprite, p0, p1, p2, p3, pencilState, size, pressureMode, taperFactorFn) {
    const segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (segDist < 1e-4) return;
    const subSteps = segDist > 3.5 ? Math.min(6, Math.ceil(segDist / 2.8)) : 1;

    let prevX = p1.x;
    let prevY = p1.y;
    let prevP = typeof p1.pressure === 'number' ? p1.pressure : (typeof p1.p === 'number' ? p1.p : 0.52);
    let prevTx = p1.tiltX || 0;
    let prevTy = p1.tiltY || 0;

    const endP = typeof p2.pressure === 'number' ? p2.pressure : (typeof p2.p === 'number' ? p2.p : 0.52);
    const endTx = p2.tiltX || 0;
    const endTy = p2.tiltY || 0;

    for (let s = 1; s <= subSteps; s++) {
      const t = s / subSteps;
      const nx = s === subSteps ? p2.x : catmullRomValue(p0.x, p1.x, p2.x, p3.x, t);
      const ny = s === subSteps ? p2.y : catmullRomValue(p0.y, p1.y, p2.y, p3.y, t);
      const np = prevP + (endP - prevP) * (s === subSteps ? 1 : 1 / (subSteps - s + 1));
      const ntx = prevTx + (endTx - prevTx) * (s === subSteps ? 1 : 1 / (subSteps - s + 1));
      const nty = prevTy + (endTy - prevTy) * (s === subSteps ? 1 : 1 / (subSteps - s + 1));

      const dx = nx - prevX;
      const dy = ny - prevY;
      const d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        const midParams = computePencilDabParams(size, (prevP + np) * 0.5, (prevTx + ntx) * 0.5, (prevTy + nty) * 0.5, pressureMode);
        const ds = Math.max(0.62, Math.min(midParams.rBase * 0.34, 3.0));
        let dist = pencilState.remainderDist;
        while (dist <= d) {
          const frac = dist / d;
          const sx = prevX + dx * frac;
          const sy = prevY + dy * frac;
          const sp = prevP + (np - prevP) * frac;
          const stx = prevTx + (ntx - prevTx) * frac;
          const sty = prevTy + (nty - prevTy) * frac;
          const params = computePencilDabParams(size, sp, stx, sty, pressureMode);
          if (taperFactorFn) {
            const tf = taperFactorFn(pencilState.traveled + dist);
            if (tf < 0.999) {
              params.rBase = Math.max(0.45, params.rBase * (0.55 + 0.45 * tf));
              params.rx = Math.max(0.45, params.rx * (0.55 + 0.45 * tf));
              params.ry = Math.max(0.45, params.ry * (0.55 + 0.45 * tf));
              params.density *= (0.42 + 0.58 * tf);
            }
          }
          stampSinglePencilDab(ctx, dabSprite, sx, sy, params, ds, pencilState.stepIndex++);
          dist += ds;
        }
        pencilState.remainderDist = dist - d;
        pencilState.traveled += d;
      }
      prevX = nx;
      prevY = ny;
      prevP = np;
      prevTx = ntx;
      prevTy = nty;
    }
  }

  function preparePencilRenderPoints(stroke) {
    const raw = stroke.points || [];
    if (raw.length <= 2) return raw;
    const smoothing = Math.max(0, Math.min(1.0, stroke.smoothing ?? 0.65));
    const filtered = [];
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (filtered.length === 0 || i === raw.length - 1 || Math.hypot(p.x - filtered[filtered.length - 1].x, p.y - filtered[filtered.length - 1].y) >= 1.1) {
        filtered.push({
          x: p.x,
          y: p.y,
          pressure: typeof p.pressure === 'number' && Number.isFinite(p.pressure) ? Math.max(0.05, Math.min(1, p.pressure)) : 0.52,
          tiltX: typeof p.tiltX === 'number' && Number.isFinite(p.tiltX) ? p.tiltX : 0,
          tiltY: typeof p.tiltY === 'number' && Number.isFinite(p.tiltY) ? p.tiltY : 0,
          t: typeof p.t === 'number' && Number.isFinite(p.t) ? p.t : i * 4
        });
      }
    }
    if (filtered.length < 4 || stroke._liveStabilized || smoothing <= 0.12) return filtered;
    const w = Math.min(0.20, smoothing * 0.20);
    const out = new Array(filtered.length);
    out[0] = filtered[0];
    for (let i = 1; i < filtered.length - 1; i++) {
      const a = filtered[i - 1], b = filtered[i], c = filtered[i + 1];
      out[i] = {
        x: b.x * (1 - 2 * w) + (a.x + c.x) * w,
        y: b.y * (1 - 2 * w) + (a.y + c.y) * w,
        pressure: b.pressure * 0.56 + (a.pressure + c.pressure) * 0.22,
        tiltX: b.tiltX * 0.6 + (a.tiltX + c.tiltX) * 0.2,
        tiltY: b.tiltY * 0.6 + (a.tiltY + c.tiltY) * 0.2,
        t: b.t
      };
    }
    out[filtered.length - 1] = filtered[filtered.length - 1];
    return out;
  }

  function drawPencilStrokeStatic(targetCtx, stroke, cached, isSelected) {
    const color = stroke.color || '#111827';
    const size = Math.max(1, stroke.size || 5);
    const dabSprite = getPencilDabSprite(color);
    const valleyPattern = getPencilPaperValleyPattern(targetCtx);

    // Fallback léger pour les mocks Canvas en tests unitaires Node.js
    if (!dabSprite || !valleyPattern || !targetCtx.canvas || typeof targetCtx.getTransform !== 'function') {
      targetCtx.save();
      targetCtx.globalAlpha = 0.78;
      targetCtx.fillStyle = color;
      targetCtx.strokeStyle = color;
      if (cached && cached.path2d) {
        if (cached.renderMode === 'stroke') {
          targetCtx.lineWidth = size;
          targetCtx.lineCap = 'round';
          targetCtx.lineJoin = 'round';
          targetCtx.stroke(cached.path2d);
        } else {
          targetCtx.fill(cached.path2d);
        }
      }
      targetCtx.restore();
      return;
    }

    if (!cached.pencilSamples) {
      cached.pencilSamples = preparePencilRenderPoints(stroke);
    }
    const pts = cached.pencilSamples;
    if (!pts || pts.length === 0) return;

    const bounds = cached.bounds || computeStrokeBounds(stroke, Math.max(8, size * 2.4));
    const m = targetCtx.getTransform();
    const corners = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY }
    ];
    let dMinX = Infinity, dMinY = Infinity, dMaxX = -Infinity, dMaxY = -Infinity;
    for (let i = 0; i < 4; i++) {
      const cx = m.a * corners[i].x + m.c * corners[i].y + m.e;
      const cy = m.b * corners[i].x + m.d * corners[i].y + m.f;
      if (cx < dMinX) dMinX = cx;
      if (cy < dMinY) dMinY = cy;
      if (cx > dMaxX) dMaxX = cx;
      if (cy > dMaxY) dMaxY = cy;
    }
    const cw = targetCtx.canvas.width || 0;
    const ch = targetCtx.canvas.height || 0;
    const px0 = Math.max(0, Math.floor(dMinX) - 2);
    const py0 = Math.max(0, Math.floor(dMinY) - 2);
    const px1 = Math.min(cw, Math.ceil(dMaxX) + 2);
    const py1 = Math.min(ch, Math.ceil(dMaxY) + 2);
    const pw = px1 - px0;
    const ph = py1 - py0;
    if (pw <= 0 || ph <= 0) return;

    if (!pencilStaticScratch.canvas) {
      pencilStaticScratch.canvas = document.createElement('canvas');
      pencilStaticScratch.ctx = pencilStaticScratch.canvas.getContext('2d');
    }
    const sctx = pencilStaticScratch.ctx;
    if (!sctx) return;
    if (pencilStaticScratch.width < pw || pencilStaticScratch.height < ph) {
      const nw = Math.max(pencilStaticScratch.width, pw);
      const nh = Math.max(pencilStaticScratch.height, ph);
      pencilStaticScratch.canvas.width = nw;
      pencilStaticScratch.canvas.height = nh;
      pencilStaticScratch.width = nw;
      pencilStaticScratch.height = nh;
    }

    sctx.save();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, pw, ph);
    sctx.setTransform(m.a, m.b, m.c, m.d, m.e - px0, m.f - py0);
    sctx.globalCompositeOperation = 'source-over';

    const pencilState = { remainderDist: 0, stepIndex: 0, traveled: 0 };
    if (pts.length === 1) {
      const p0 = pts[0];
      const params = computePencilDabParams(size, p0.pressure, p0.tiltX, p0.tiltY, stroke.pressureMode);
      stampSinglePencilDab(sctx, dabSprite, p0.x, p0.y, params, Math.max(0.8, params.rBase * 0.45), 0);
    } else {
      let totalLen = 0;
      for (let i = 1; i < pts.length; i++) {
        totalLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      }
      const taperLen = totalLen > size * 2.5 ? Math.min(5.5, size * 0.7) : 0;
      const taperFn = taperLen > 0
        ? (traveled) => {
          if (traveled < taperLen) return Math.max(0.25, traveled / taperLen);
          const rem = totalLen - traveled;
          if (rem < taperLen) return Math.max(0.25, rem / taperLen);
          return 1;
        }
        : null;

      // Premier point d'accroche graphite
      const pFirst = pts[0];
      const firstParams = computePencilDabParams(size, pFirst.pressure, pFirst.tiltX, pFirst.tiltY, stroke.pressureMode);
      if (taperFn) firstParams.density *= 0.6;
      stampSinglePencilDab(sctx, dabSprite, pFirst.x, pFirst.y, firstParams, Math.max(0.7, firstParams.rBase * 0.34), pencilState.stepIndex++);

      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        stampPencilCurveSegment(sctx, dabSprite, p0, p1, p2, p3, pencilState, size, stroke.pressureMode, taperFn);
      }
    }

    // Application du grain papier stationnaire en coordonnées monde (creuse uniquement les vallées du papier)
    const scratchValleyPat = getPencilPaperValleyPattern(sctx);
    if (scratchValleyPat) {
      sctx.globalCompositeOperation = 'destination-out';
      sctx.globalAlpha = 1.0;
      sctx.fillStyle = scratchValleyPat;
      sctx.fillRect(bounds.minX - 2, bounds.minY - 2, bounds.width + 4, bounds.height + 4);
    }
    sctx.restore();

    // Blit du trait graphite texturé sur targetCtx en conservant son clip actif
    targetCtx.save();
    targetCtx.setTransform(1, 0, 0, 1, 0, 0);
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.globalAlpha = 1.0;
    targetCtx.drawImage(pencilStaticScratch.canvas, 0, 0, pw, ph, px0, py0, pw, ph);
    targetCtx.restore();

    if (isSelected && cached && cached.path2d) {
      targetCtx.save();
      targetCtx.setLineDash([]);
      targetCtx.globalAlpha = 0.85;
      targetCtx.globalCompositeOperation = 'source-over';
      targetCtx.strokeStyle = '#2563eb';
      targetCtx.lineWidth = 1.2;
      targetCtx.stroke(cached.path2d);
      targetCtx.restore();
    }
  }

  function drawSingleStroke(targetCtx, stroke, isPaperDark = false, isSelected = false, viewBounds = null) {
    if (!stroke.points || stroke.points.length === 0) return;

    const cached = getCachedStrokePath(stroke);
    if (viewBounds && cached.bounds && !isBoundsInViewport(cached.bounds, viewBounds)) {
      return;
    }

    const isPencil = stroke.tool === 'pencil' || stroke.penStyle === 'pencil';
    if (isPencil) {
      drawPencilStrokeStatic(targetCtx, stroke, cached, isSelected);
      return;
    }

    targetCtx.save();
    if (stroke.tool === 'highlighter') {
      targetCtx.globalAlpha = 0.36;
      targetCtx.globalCompositeOperation = isPaperDark ? 'screen' : 'multiply';
    } else {
      targetCtx.globalAlpha = 1.0;
      targetCtx.globalCompositeOperation = 'source-over';
    }

    const color = stroke.color || '#1e293b';
    targetCtx.fillStyle = color;

    if (stroke.points.length === 1) {
      const p0 = stroke.points[0];
      const r = Math.max(1.2, (stroke.size || 5) * 0.5 * (stroke.pressureMode === 'uniform' ? 0.8 : Math.max(0.35, p0.pressure || 0.5)));
      targetCtx.beginPath();
      targetCtx.arc(p0.x, p0.y, r, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.restore();
      return;
    }

    const { path2d, renderMode } = cached;
    const lineStyle = stroke.lineStyle || 'solid';
    const sz = Math.max(1, stroke.size || 5);
    targetCtx.setLineDash(getStrokeLineDash(lineStyle, sz));
    if (path2d) {
      if (renderMode === 'stroke') {
        targetCtx.strokeStyle = color;
        targetCtx.lineWidth = sz;
        targetCtx.lineCap = 'round';
        targetCtx.lineJoin = 'round';
        targetCtx.stroke(path2d);
      } else {
        targetCtx.fill(path2d);
      }
      if (isSelected) {
        targetCtx.setLineDash([]);
        targetCtx.globalAlpha = 0.9;
        targetCtx.globalCompositeOperation = 'source-over';
        targetCtx.strokeStyle = '#2563eb';
        targetCtx.lineWidth = 1.2;
        targetCtx.stroke(path2d);
      }
    } else {
      targetCtx.strokeStyle = color;
      targetCtx.lineWidth = stroke.size || 5;
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';
      targetCtx.beginPath();
      targetCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1];
        const curr = stroke.points[i];
        targetCtx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) * 0.5, (prev.y + curr.y) * 0.5);
      }
      targetCtx.stroke();
    }
    targetCtx.restore();
  }

  // ============================================================================
  // 11B. MOTEUR PDF.JS LOCAL HAUTE RÉSOLUTION (CALQUE DE FOND VERROUILLÉ)
  // ============================================================================

  function configurePdfJsWorkerLocally() {
    if (typeof window !== 'undefined' && window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
      // Configure le worker local PDF.js sans aucun lien externe (100% hors-ligne, compatible WebView2 tauri.localhost)
      try {
        const href = String(window.location && window.location.href || '');
        if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('tauri://')) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.js', href).href;
        } else {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
        }
      } catch (_) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
      }
    }
  }
  configurePdfJsWorkerLocally();

  const pdfDocInstanceCache = new Map(); // pdfId -> Promise<PDFDocumentProxy>
  const pdfRenderedCanvasCache = new Map(); // `${pdfId}_${pageNum}` -> { canvas, renderedScale, renderingPromise, renderTask, lastUsedAt }
  const pdfTextIndexCache = new Map(); // `${pdfId}_${pageNum}` -> { items: Array<{ str, norm, x, y, width, height }> }
  const virtualRulerState = {
    visible: false,
    positioned: false,
    cx: 480,
    cy: 280,
    angleDeg: 0,
    length: 660,
    thickness: 68,
    activeEdge: null,
    snapped: false
  };
  const pdfSearchState = {
    open: false,
    query: '',
    matches: [],
    activeIndex: -1,
    searchToken: 0
  };
  let hiDpiPdfZoomTimer = null;
  let lazyAdjacentPdfTimer = null;

  function releaseCanvasMemory(canvas) {
    if (!canvas) return;
    try {
      const ctx2d = canvas.getContext && canvas.getContext('2d');
      if (ctx2d && canvas.width > 0 && canvas.height > 0) {
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      }
      // Forcer width/height à 0 libère immédiatement le tampon bitmap GPU/RAM dans Chromium/WebView2
      canvas.width = 0;
      canvas.height = 0;
    } catch (_) {}
  }

  /**
   * Chargement paresseux (Lazy Loading) : ne conserve en mémoire que la page affichée (k),
   * la page précédente (k - 1) et la page suivante (k + 1), soit au maximum 3 pages PDF en RAM.
   */
  function cleanupPdfRenderCache(keepPage = null, maxCachedPages = 3) {
    const keepKeys = new Set();
    if (keepPage && keepPage.pdfId && keepPage.pdfPageNumber && maxCachedPages > 0) {
      const pNum = keepPage.pdfPageNumber;
      keepKeys.add(`${keepPage.pdfId}_${pNum}`);
      if (maxCachedPages >= 2) {
        keepKeys.add(`${keepPage.pdfId}_${pNum + 1}`);
      }
      if (maxCachedPages >= 3 && pNum > 1) {
        keepKeys.add(`${keepPage.pdfId}_${pNum - 1}`);
      }
    }

    for (const [key, entry] of pdfRenderedCanvasCache.entries()) {
      if (!keepKeys.has(key)) {
        if (entry && entry.renderTask && typeof entry.renderTask.cancel === 'function') {
          try { entry.renderTask.cancel(); } catch (_) {}
        }
        if (entry && entry.canvas) {
          releaseCanvasMemory(entry.canvas);
          entry.canvas = null;
        }
        pdfRenderedCanvasCache.delete(key);
      }
    }
  }

  async function ensureActiveAndAdjacentPdfPagesLoaded(activePage = getActivePage()) {
    if (lazyAdjacentPdfTimer) {
      clearTimeout(lazyAdjacentPdfTimer);
      lazyAdjacentPdfTimer = null;
    }
    cleanupPdfRenderCache(activePage, 3);
    if (!activePage || !activePage.pdfId || !activePage.pdfPageNumber) return;

    // 1. Charge et rend en priorité la page affichée à l'écran (k)
    const activeEntry = ensurePdfPageRendered(activePage, 0, false);
    if (activeEntry && activeEntry.renderingPromise) {
      await activeEntry.renderingPromise;
    }

    // 2. Précharge paresseusement (Lazy Loading) uniquement la page précédente (k - 1) et suivante (k + 1)
    const current = getActivePage();
    if (!current || current.id !== activePage.id || !current.pdfId) return;
    const pages = getActiveNotebookPages();
    const prevPage = pages.find((p) => p.pdfId === current.pdfId && p.pdfPageNumber === current.pdfPageNumber - 1);
    const nextPage = pages.find((p) => p.pdfId === current.pdfId && p.pdfPageNumber === current.pdfPageNumber + 1);

    const adjacentPromises = [];
    if (nextPage) {
      const nextEntry = ensurePdfPageRendered(nextPage, 0, true);
      if (nextEntry && nextEntry.renderingPromise) adjacentPromises.push(nextEntry.renderingPromise);
    }
    if (prevPage) {
      const prevEntry = ensurePdfPageRendered(prevPage, 0, true);
      if (prevEntry && prevEntry.renderingPromise) adjacentPromises.push(prevEntry.renderingPromise);
    }
    if (adjacentPromises.length > 0) {
      await Promise.allSettled(adjacentPromises);
    }
    cleanupPdfRenderCache(getActivePage(), 3);
  }

  async function destroyPdfDocumentResources(pdfId, deleteFromDb = false) {
    if (!pdfId) return;
    const prefix = `${pdfId}_`;
    for (const [key, entry] of pdfRenderedCanvasCache.entries()) {
      if (key.startsWith(prefix)) {
        if (entry && entry.renderTask && typeof entry.renderTask.cancel === 'function') {
          try { entry.renderTask.cancel(); } catch (_) {}
        }
        if (entry && entry.canvas) {
          releaseCanvasMemory(entry.canvas);
          entry.canvas = null;
        }
        pdfRenderedCanvasCache.delete(key);
      }
    }
    for (const key of Array.from(pdfTextIndexCache.keys())) {
      if (key.startsWith(prefix)) {
        pdfTextIndexCache.delete(key);
      }
    }

    if (pdfDocInstanceCache.has(pdfId)) {
      const docPromise = pdfDocInstanceCache.get(pdfId);
      pdfDocInstanceCache.delete(pdfId);
      try {
        const doc = await docPromise;
        if (doc) {
          if (typeof doc.cleanup === 'function') {
            try { await doc.cleanup(); } catch (_) {}
          }
          if (typeof doc.destroy === 'function') {
            try { await doc.destroy(); } catch (_) {}
          }
        }
      } catch (_) {}
    }

    if (deleteFromDb) {
      await db.deletePdfBinary(pdfId);
    } else if (typeof db.evictPdfFromRamCache === 'function') {
      db.evictPdfFromRamCache(pdfId);
    }
  }

  function getPdfCacheStats() {
    let totalPixels = 0;
    const renderedPageNumbers = [];
    for (const [key, entry] of pdfRenderedCanvasCache.entries()) {
      if (entry && entry.canvas && entry.canvas.width > 0) {
        totalPixels += (entry.canvas.width || 0) * (entry.canvas.height || 0);
        const parts = key.split('_');
        const num = Number(parts[parts.length - 1]);
        if (Number.isFinite(num)) renderedPageNumbers.push(num);
      }
    }
    return {
      renderedPagesCount: pdfRenderedCanvasCache.size,
      loadedDocsCount: pdfDocInstanceCache.size,
      renderedKeys: Array.from(pdfRenderedCanvasCache.keys()),
      renderedPageNumbers: renderedPageNumbers.sort((a, b) => a - b),
      loadedDocIds: Array.from(pdfDocInstanceCache.keys()),
      totalPixels
    };
  }

  async function getLoadedPdfJsDoc(pdfId) {
    if (!pdfId || typeof window === 'undefined' || !window.pdfjsLib) return null;
    configurePdfJsWorkerLocally();
    if (pdfDocInstanceCache.has(pdfId)) {
      return pdfDocInstanceCache.get(pdfId);
    }
    const loadPromise = (async () => {
      const rec = await db.getPdfBinary(pdfId);
      if (!rec || !rec.data) return null;
      // Toujours cloner les octets pour éviter tout détachement de l'ArrayBuffer en cache
      const rawBytes = rec.data instanceof Uint8Array
        ? new Uint8Array(rec.data).slice()
        : new Uint8Array(rec.data).slice();
      const loadingTask = window.pdfjsLib.getDocument({
        data: rawBytes,
        isEvalSupported: false,
        enableXfa: false,
        useSystemFonts: true,
        disableFontFace: false
      });
      return await loadingTask.promise;
    })();
    pdfDocInstanceCache.set(pdfId, loadPromise);
    try {
      const doc = await loadPromise;
      if (!doc) pdfDocInstanceCache.delete(pdfId);
      return doc;
    } catch (err) {
      pdfDocInstanceCache.delete(pdfId);
      return null;
    }
  }

  function getDesiredPdfRenderScale(page, minScaleOverride = 0) {
    const dpr = Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1);
    const zoomFactor = Math.max(1, Math.min(3.5, state.zoom || 1));
    const pw = page.pdfWidth || PAGE_WIDTH;
    const origW = page.pdfOriginalWidth || 595.28;
    const baseRatio = pw / Math.max(1, origW);
    // Prend en compte window.devicePixelRatio et le niveau de zoom pour que le texte du cours reste parfaitement net
    return Math.max(minScaleOverride, Math.min(4.5, baseRatio * dpr * Math.max(1.35, zoomFactor)));
  }

  function updateSingleSidebarThumbnailDom(page) {
    if (!page || !dom.pagesGrid || typeof dom.pagesGrid.querySelector !== 'function') return;
    const img = dom.pagesGrid.querySelector(`[data-thumb-page-id="${page.id}"]`);
    if (img && page.thumbnail) {
      img.src = page.thumbnail;
    }
  }

  function ensurePdfPageRendered(page, minScaleOverride = 0, isAdjacentPreload = false) {
    if (!page || !page.pdfId || !page.pdfPageNumber) return null;
    const key = `${page.pdfId}_${page.pdfPageNumber}`;
    const desiredScale = isAdjacentPreload
      ? Math.min(2.2, getDesiredPdfRenderScale(page, minScaleOverride))
      : getDesiredPdfRenderScale(page, minScaleOverride);
    const existing = pdfRenderedCanvasCache.get(key);

    if (existing && existing.canvas && existing.canvas.width > 0 && existing.renderedScale >= desiredScale * 0.88) {
      existing.lastUsedAt = Date.now();
      return existing;
    }
    if (existing && existing.renderingPromise) {
      return existing;
    }

    const renderScale = Math.max(desiredScale, existing ? existing.renderedScale : 0);
    const entry = existing || { canvas: null, renderedScale: 0, renderingPromise: null, renderTask: null, lastUsedAt: Date.now() };

    entry.renderingPromise = (async () => {
      let pdfPage = null;
      try {
        const pdfDoc = await getLoadedPdfJsDoc(page.pdfId);
        if (!pdfDoc) return null;
        const pageNum = Math.max(1, Math.min(pdfDoc.numPages, page.pdfPageNumber || 1));
        pdfPage = await pdfDoc.getPage(pageNum);
        const vp1 = pdfPage.getViewport({ scale: 1 });
        if (!page.pdfOriginalWidth || !page.pdfOriginalHeight) {
          page.pdfOriginalWidth = vp1.width;
          page.pdfOriginalHeight = vp1.height;
        }
        if (!page.pdfWidth || !page.pdfHeight) {
          page.pdfWidth = PAGE_WIDTH;
          page.pdfHeight = Math.max(240, Math.round(PAGE_WIDTH * (vp1.height / Math.max(1, vp1.width))));
        }

        const viewport = pdfPage.getViewport({ scale: renderScale });
        const offCanvas = document.createElement('canvas');
        offCanvas.width = Math.max(1, Math.round(viewport.width));
        offCanvas.height = Math.max(1, Math.round(viewport.height));
        const offCtx = offCanvas.getContext('2d', { alpha: false });
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

        const renderTask = pdfPage.render({
          canvasContext: offCtx,
          viewport
        });
        entry.renderTask = renderTask;
        await renderTask.promise;
        entry.renderTask = null;

        if (entry.canvas && entry.canvas !== offCanvas) {
          releaseCanvasMemory(entry.canvas);
        }
        entry.canvas = offCanvas;
        entry.renderedScale = renderScale;
        entry.renderingPromise = null;
        entry.lastUsedAt = Date.now();
        pdfRenderedCanvasCache.set(key, entry);

        // Nettoyage de la page PDF.js temporaire
        if (pdfPage && typeof pdfPage.cleanup === 'function') {
          try { pdfPage.cleanup(); } catch (_) {}
        }

        // Met à jour la miniature dès que cette page PDF est rendue pour la première fois
        if (!page.thumbnail || !page._pdfThumbGenerated) {
          page._pdfThumbGenerated = true;
          page.thumbnail = generatePageThumbnail(page);
          updateSingleSidebarThumbnailDom(page);
        }
        if (getActivePage() === page) {
          requestRender();
        }
        return entry;
      } catch (_) {
        entry.renderTask = null;
        entry.renderingPromise = null;
        if (pdfPage && typeof pdfPage.cleanup === 'function') {
          try { pdfPage.cleanup(); } catch (_) {}
        }
        return null;
      }
    })();

    pdfRenderedCanvasCache.set(key, entry);
    return entry;
  }

  function scheduleHiDpiPdfCheck() {
    if (hiDpiPdfZoomTimer) clearTimeout(hiDpiPdfZoomTimer);
    hiDpiPdfZoomTimer = setTimeout(() => {
      hiDpiPdfZoomTimer = null;
      const page = getActivePage();
      if (page && page.pdfId) {
        ensurePdfPageRendered(page);
      }
    }, 140);
  }

  function drawLockedPdfBackground(targetCtx, page, isThumbnail = false) {
    if (!page || !page.pdfId || !page.pdfPageNumber) return false;
    const pw = page.pdfWidth || PAGE_WIDTH;
    const ph = page.pdfHeight || PAGE_HEIGHT;
    const key = `${page.pdfId}_${page.pdfPageNumber}`;
    const cached = pdfRenderedCanvasCache.get(key);

    targetCtx.save();
    if (!isThumbnail && !isZoomInteracting) {
      targetCtx.shadowColor = 'rgba(15, 23, 42, 0.14)';
      targetCtx.shadowBlur = Math.min(18, 14 / Math.max(0.5, state.zoom));
      targetCtx.shadowOffsetY = Math.min(6, 4 / Math.max(0.5, state.zoom));
    }
    targetCtx.fillStyle = '#ffffff';
    targetCtx.fillRect(0, 0, pw, ph);
    targetCtx.shadowColor = 'transparent';

    if (cached && cached.canvas && cached.canvas.width > 0) {
      targetCtx.imageSmoothingEnabled = true;
      targetCtx.imageSmoothingQuality = isZoomInteracting ? 'low' : 'high';
      targetCtx.drawImage(cached.canvas, 0, 0, pw, ph);
    } else {
      // Fond d'attente pendant le décodage haute résolution PDF.js
      targetCtx.strokeStyle = 'rgba(37, 99, 235, 0.25)';
      targetCtx.lineWidth = 1.5;
      targetCtx.strokeRect(0, 0, pw, ph);
      if (!isThumbnail) {
        targetCtx.fillStyle = '#64748b';
        targetCtx.font = '600 15px Inter, sans-serif';
        targetCtx.textAlign = 'center';
        targetCtx.fillText(`Chargement paresseux PDF haute définition (Page ${page.pdfPageNumber})...`, pw * 0.5, ph * 0.5);
      }
    }

    // Bordure fine du document PDF verrouillé
    targetCtx.strokeStyle = 'rgba(100, 116, 139, 0.28)';
    targetCtx.lineWidth = 1 / Math.max(0.4, isThumbnail ? 1 : state.zoom);
    targetCtx.strokeRect(0, 0, pw, ph);
    targetCtx.restore();

    if (!isThumbnail && (!isZoomInteracting || !(cached && cached.canvas && cached.canvas.width > 0))) {
      ensurePdfPageRendered(page);
    }
    return true;
  }

  function ensureCanvasDimensionsSynced() {
    const dpr = window.devicePixelRatio || 1;
    const rect = dom.canvasViewport.getBoundingClientRect();
    const targetW = Math.max(1, Math.floor(rect.width * dpr));
    const targetH = Math.max(1, Math.floor(rect.height * dpr));

    if (dom.pdfBgCanvas && (dom.pdfBgCanvas.width !== targetW || dom.pdfBgCanvas.height !== targetH)) {
      dom.pdfBgCanvas.width = targetW;
      dom.pdfBgCanvas.height = targetH;
    }
    if (dom.inkCanvas.width !== targetW || dom.inkCanvas.height !== targetH) {
      dom.inkCanvas.width = targetW;
      dom.inkCanvas.height = targetH;
    }
    if (dom.activeInkCanvas && (dom.activeInkCanvas.width !== targetW || dom.activeInkCanvas.height !== targetH)) {
      dom.activeInkCanvas.width = targetW;
      dom.activeInkCanvas.height = targetH;
    }
    return { dpr, rect, targetW, targetH };
  }

  let activeCanvasDirty = false;

  const staticInkCache = {
    canvas: null,
    ctx: null,
    valid: false,
    pageId: null,
    zoom: 1,
    dpr: 1,
    viewW: 0,
    viewH: 0,
    originPanX: 0,
    originPanY: 0,
    effectiveDark: false,
    pad: 240
  };

  function invalidateStaticInkCache() {
    staticInkCache.valid = false;
  }

  function releaseStaticInkCacheMemory() {
    staticInkCache.valid = false;
    staticInkCache.pageId = null;
    if (staticInkCache.canvas) {
      releaseCanvasMemory(staticInkCache.canvas);
      staticInkCache.canvas = null;
      staticInkCache.ctx = null;
    }
  }

  function clearActiveCanvas() {
    if (!activeCtx || !dom.activeInkCanvas) return;
    dom.activeInkCanvas.style.opacity = '1';
    dom.activeInkCanvas.style.mixBlendMode = 'normal';
    if (pencilLiveBuffer.dirty && pencilLiveBuffer.ctx && pencilLiveBuffer.canvas) {
      pencilLiveBuffer.ctx.save();
      pencilLiveBuffer.ctx.setTransform(1, 0, 0, 1, 0, 0);
      pencilLiveBuffer.ctx.clearRect(0, 0, pencilLiveBuffer.canvas.width, pencilLiveBuffer.canvas.height);
      pencilLiveBuffer.ctx.restore();
      pencilLiveBuffer.dirty = false;
    }
    if (!activeCanvasDirty) return;
    activeCtx.save();
    activeCtx.setTransform(1, 0, 0, 1, 0, 0);
    activeCtx.clearRect(0, 0, dom.activeInkCanvas.width, dom.activeInkCanvas.height);
    activeCtx.restore();
    activeCanvasDirty = false;
  }

  /**
   * Rendu incrémental O(1) du Crayon Graphite sur #activeInkCanvas :
   * - Accumule uniquement les nouveaux dabs doux dans pencilLiveBuffer (O(1))
   * - Recomposite uniquement le rectangle sale (dirty rect) sur #activeInkCanvas avec le masque
   *   de grain papier stationnaire en coordonnées monde → zéro superposition sombre aux jonctions
   *   et rendu 100 % identique pixel pour pixel au relâchement du stylet.
   */
  function renderIncrementalPencilTail(stroke, dpr) {
    const pts = stroke.points;
    const size = Math.max(1, stroke.size || 5);
    const color = stroke.color || '#111827';
    const dabSprite = getPencilDabSprite(color);
    const cw = dom.activeInkCanvas.width || 0;
    const ch = dom.activeInkCanvas.height || 0;
    if (!dabSprite || cw <= 0 || ch <= 0) return false;

    if (!pencilLiveBuffer.canvas) {
      pencilLiveBuffer.canvas = document.createElement('canvas');
      pencilLiveBuffer.ctx = pencilLiveBuffer.canvas.getContext('2d');
    }
    const lctx = pencilLiveBuffer.ctx;
    if (!lctx) return false;

    if (pencilLiveBuffer.width !== cw || pencilLiveBuffer.height !== ch) {
      pencilLiveBuffer.canvas.width = cw;
      pencilLiveBuffer.canvas.height = ch;
      pencilLiveBuffer.width = cw;
      pencilLiveBuffer.height = ch;
      pencilLiveBuffer.dirty = false;
    }

    if (!stroke._incrementalStarted) {
      if (activeCanvasDirty) {
        activeCtx.save();
        activeCtx.setTransform(1, 0, 0, 1, 0, 0);
        activeCtx.clearRect(0, 0, cw, ch);
        activeCtx.restore();
      }
      if (pencilLiveBuffer.dirty) {
        lctx.save();
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, cw, ch);
        lctx.restore();
      }
      stroke._incrementalStarted = true;
      stroke._renderedUpToIndex = 0;
      stroke._pencilState = { remainderDist: 0, stepIndex: 0, traveled: 0 };
      dom.activeInkCanvas.style.opacity = '1';
      dom.activeInkCanvas.style.mixBlendMode = 'normal';
    }

    const startIdx = stroke._renderedUpToIndex || 0;
    if (startIdx >= pts.length) return true;
    if (!stroke._pencilState) {
      stroke._pencilState = { remainderDist: 0, stepIndex: 0, traveled: 0 };
    }

    // Calcule le rectangle sale minimal (world + device) couvrant uniquement les nouveaux segments
    let wMinX = Infinity, wMinY = Infinity, wMaxX = -Infinity, wMaxY = -Infinity;
    let maxPad = Math.max(8, size * 1.8);
    const scanStart = Math.max(0, startIdx - 1);
    for (let i = scanStart; i < pts.length; i++) {
      const pt = pts[i];
      if (!pt) continue;
      if (pt.x < wMinX) wMinX = pt.x;
      if (pt.y < wMinY) wMinY = pt.y;
      if (pt.x > wMaxX) wMaxX = pt.x;
      if (pt.y > wMaxY) wMaxY = pt.y;
      const tiltDeg = Math.hypot(pt.tiltX || 0, pt.tiltY || 0);
      if (tiltDeg > 20) {
        maxPad = Math.max(maxPad, size * 3.4 + 6);
      }
    }
    if (!Number.isFinite(wMinX)) return true;

    wMinX -= maxPad;
    wMinY -= maxPad;
    wMaxX += maxPad;
    wMaxY += maxPad;

    // 1. Tamponne uniquement les nouveaux dabs sur pencilLiveBuffer (O(1))
    lctx.save();
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.translate(state.panX, state.panY);
    lctx.scale(state.zoom, state.zoom);
    const activePageForClip = getActivePage();
    if (isBoundedPage(activePageForClip)) {
      const pb = getPageBounds(activePageForClip);
      lctx.beginPath();
      lctx.rect(0, 0, pb.width, pb.height);
      lctx.clip();
    }
    lctx.globalCompositeOperation = 'source-over';

    if (startIdx === 0) {
      const p0 = pts[0];
      const firstParams = computePencilDabParams(size, p0.pressure, p0.tiltX, p0.tiltY, stroke.pressureMode);
      stampSinglePencilDab(lctx, dabSprite, p0.x, p0.y, firstParams, Math.max(0.7, firstParams.rBase * 0.34), stroke._pencilState.stepIndex++);
    }
    const segStart = Math.max(1, startIdx);
    for (let i = segStart; i < pts.length; i++) {
      const p0 = pts[Math.max(0, i - 2)];
      const p1 = pts[i - 1];
      const p2 = pts[i];
      const p3 = pts[Math.min(pts.length - 1, i + 1)];
      stampPencilCurveSegment(lctx, dabSprite, p0, p1, p2, p3, stroke._pencilState, size, stroke.pressureMode, null);
    }
    lctx.restore();
    pencilLiveBuffer.dirty = true;

    // 2. Recomposite uniquement la zone sale (dirty rect) sur #activeInkCanvas avec grain papier monde
    const scaleDev = dpr * state.zoom;
    const dx0 = Math.max(0, Math.floor((wMinX * state.zoom + state.panX) * dpr) - 2);
    const dy0 = Math.max(0, Math.floor((wMinY * state.zoom + state.panY) * dpr) - 2);
    const dx1 = Math.min(cw, Math.ceil((wMaxX * state.zoom + state.panX) * dpr) + 2);
    const dy1 = Math.min(ch, Math.ceil((wMaxY * state.zoom + state.panY) * dpr) + 2);
    const dw = dx1 - dx0;
    const dh = dy1 - dy0;

    if (dw > 0 && dh > 0 && scaleDev > 0) {
      activeCtx.save();
      activeCtx.setTransform(1, 0, 0, 1, 0, 0);
      activeCtx.clearRect(dx0, dy0, dw, dh);
      activeCtx.globalCompositeOperation = 'source-over';
      activeCtx.globalAlpha = 1.0;
      activeCtx.drawImage(pencilLiveBuffer.canvas, dx0, dy0, dw, dh, dx0, dy0, dw, dh);

      const valleyPat = getPencilPaperValleyPattern(activeCtx);
      if (valleyPat) {
        activeCtx.beginPath();
        activeCtx.rect(dx0, dy0, dw, dh);
        activeCtx.clip();
        activeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        activeCtx.translate(state.panX, state.panY);
        activeCtx.scale(state.zoom, state.zoom);
        activeCtx.globalCompositeOperation = 'destination-out';
        activeCtx.globalAlpha = 1.0;
        activeCtx.fillStyle = valleyPat;
        activeCtx.fillRect(wMinX - 2, wMinY - 2, (wMaxX - wMinX) + 4, (wMaxY - wMinY) + 4);
      }
      activeCtx.restore();
    }

    stroke._renderedUpToIndex = pts.length;
    activeCanvasDirty = true;
    return true;
  }

  /**
   * Rendu incrémental O(1) du trait en cours sur #activeInkCanvas :
   * Ne dessine QUE les nouveaux segments ajoutés depuis le dernier mouvement du stylet,
   * sans jamais effacer ni recalculer les milliers de points précédents du trait.
   */
  function renderIncrementalStrokeTail(stroke, dpr, rect, effectiveDark) {
    if (!activeCtx || !dom.activeInkCanvas || !stroke || !stroke.points || stroke.points.length === 0) return;

    const pts = stroke.points;
    const isHl = stroke.tool === 'highlighter';
    const isPencil = stroke.tool === 'pencil' || stroke.penStyle === 'pencil';
    const size = Math.max(1, stroke.size || 5);
    const thinning = getStrokeThinning(stroke);
    const color = stroke.color || '#1e293b';
    const lineStyle = stroke.lineStyle || 'solid';

    if (isPencil && lineStyle === 'solid') {
      if (renderIncrementalPencilTail(stroke, dpr)) return;
    }

    // Pour Tirets / Pointillés : dessiner le chemin continu complet sur #activeInkCanvas en direct
    // afin que les tirets et pointillés apparaissent instantanément PENDANT le tracé (sans reset de phase moveTo)
    if (!isHl && lineStyle !== 'solid') {
      dom.activeInkCanvas.style.opacity = '1';
      dom.activeInkCanvas.style.mixBlendMode = 'normal';
      activeCtx.save();
      activeCtx.setTransform(1, 0, 0, 1, 0, 0);
      activeCtx.clearRect(0, 0, dom.activeInkCanvas.width, dom.activeInkCanvas.height);
      activeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      activeCtx.translate(state.panX, state.panY);
      activeCtx.scale(state.zoom, state.zoom);
      const activePageForDashClip = getActivePage();
      if (isBoundedPage(activePageForDashClip)) {
        const pb = getPageBounds(activePageForDashClip);
        activeCtx.beginPath();
        activeCtx.rect(0, 0, pb.width, pb.height);
        activeCtx.clip();
      }
      activeCtx.globalAlpha = 1.0;
      activeCtx.globalCompositeOperation = 'source-over';
      activeCtx.fillStyle = color;
      activeCtx.strokeStyle = color;
      if (pts.length === 1) {
        activeCtx.beginPath();
        activeCtx.arc(pts[0].x, pts[0].y, Math.max(0.8, size * 0.5), 0, Math.PI * 2);
        activeCtx.fill();
      } else {
        activeCtx.lineWidth = size;
        activeCtx.lineCap = 'round';
        activeCtx.lineJoin = 'round';
        activeCtx.setLineDash(getStrokeLineDash(lineStyle, size));
        const livePath = buildCenterlinePath2D(pts);
        if (livePath) activeCtx.stroke(livePath);
        activeCtx.setLineDash([]);
      }
      activeCtx.restore();
      stroke._incrementalStarted = true;
      stroke._renderedUpToIndex = pts.length;
      activeCanvasDirty = true;
      return;
    }

    if (!stroke._incrementalStarted) {
      if (activeCanvasDirty) {
        activeCtx.save();
        activeCtx.setTransform(1, 0, 0, 1, 0, 0);
        activeCtx.clearRect(0, 0, dom.activeInkCanvas.width, dom.activeInkCanvas.height);
        activeCtx.restore();
      }
      stroke._incrementalStarted = true;
      stroke._renderedUpToIndex = 0;
      dom.activeInkCanvas.style.opacity = isHl ? '0.36' : '1';
      dom.activeInkCanvas.style.mixBlendMode = isHl ? (effectiveDark ? 'screen' : 'multiply') : 'normal';
    }

    const startIdx = stroke._renderedUpToIndex || 0;
    if (startIdx >= pts.length) return;

    activeCtx.save();
    activeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    activeCtx.translate(state.panX, state.panY);
    activeCtx.scale(state.zoom, state.zoom);
    const activePageForClip = getActivePage();
    if (isBoundedPage(activePageForClip)) {
      const pb = getPageBounds(activePageForClip);
      activeCtx.beginPath();
      activeCtx.rect(0, 0, pb.width, pb.height);
      activeCtx.clip();
    }
    activeCtx.globalAlpha = isPencil ? 0.78 : 1.0;
    activeCtx.globalCompositeOperation = 'source-over';
    activeCtx.fillStyle = color;
    activeCtx.strokeStyle = color;

    if (startIdx === 0) {
      const p0 = pts[0];
      const r0 = Math.max(0.5, thinning ? getStrokeRadius(size, thinning, p0.pressure ?? 0.5) : size * 0.5);
      activeCtx.beginPath();
      activeCtx.arc(p0.x, p0.y, r0, 0, Math.PI * 2);
      activeCtx.fill();
    }

    const segStart = Math.max(1, startIdx);
    if (segStart < pts.length) {
      if (isHl || stroke.pressureMode === 'uniform') {
        activeCtx.lineWidth = size;
        activeCtx.lineCap = 'round';
        activeCtx.lineJoin = 'round';
        activeCtx.setLineDash([]);
        activeCtx.beginPath();
        for (let i = segStart; i < pts.length; i++) {
          const p0 = pts[Math.max(0, i - 2)];
          const p1 = pts[i - 1];
          const p2 = pts[i];
          const m0x = i === 1 ? p1.x : (p0.x + p1.x) * 0.5;
          const m0y = i === 1 ? p1.y : (p0.y + p1.y) * 0.5;
          const m1x = (p1.x + p2.x) * 0.5;
          const m1y = (p1.y + p2.y) * 0.5;
          activeCtx.moveTo(m0x, m0y);
          activeCtx.quadraticCurveTo(p1.x, p1.y, m1x, m1y);
        }
        activeCtx.stroke();
      } else {
        const segPath = new Path2D();
        let prevRadius = stroke._lastIncrementalRadius;
        for (let i = segStart; i < pts.length; i++) {
          const p0 = pts[Math.max(0, i - 2)];
          const p1 = pts[i - 1];
          const p2 = pts[i];
          const rawR1 = Math.max(0.45, getStrokeRadius(size, thinning, p1.pressure ?? 0.5));
          const rawR2 = Math.max(0.45, getStrokeRadius(size, thinning, p2.pressure ?? 0.5));
          const r1 = typeof prevRadius === 'number' ? prevRadius : rawR1;
          let r2 = r1 * 0.4 + rawR2 * 0.6;
          const segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          if (segDist > 0) {
            const maxDelta = Math.max(0.18, segDist * 0.45);
            if (Math.abs(r2 - r1) > maxDelta) {
              r2 = r1 + Math.sign(r2 - r1) * maxDelta;
            }
          }
          prevRadius = r2;

          // Subdivision quadratique en temps réel lors d'un mouvement rapide ou d'un virage
          const subSteps = segDist > 3.2 ? Math.min(4, Math.ceil(segDist / 2.5)) : 1;
          if (subSteps === 1) {
            const c1 = { x: p1.x, y: p1.y, r: r1 };
            const c2 = { x: p2.x, y: p2.y, r: r2 };
            addSegmentQuadToPath2D(segPath, c1, c2);
            segPath.moveTo(c2.x + c2.r, c2.y);
            segPath.arc(c2.x, c2.y, c2.r, 0, Math.PI * 2, false);
            segPath.closePath();
          } else {
            let lastSub = { x: p1.x, y: p1.y, r: r1 };
            for (let s = 1; s <= subSteps; s++) {
              const t = s / subSteps;
              const cx = s === subSteps ? p2.x : catmullRomValue(p0.x, p1.x, p2.x, p2.x, t);
              const cy = s === subSteps ? p2.y : catmullRomValue(p0.y, p1.y, p2.y, p2.y, t);
              const cr = r1 + (r2 - r1) * t;
              const curSub = { x: cx, y: cy, r: cr };
              addSegmentQuadToPath2D(segPath, lastSub, curSub);
              segPath.moveTo(curSub.x + curSub.r, curSub.y);
              segPath.arc(curSub.x, curSub.y, curSub.r, 0, Math.PI * 2, false);
              segPath.closePath();
              lastSub = curSub;
            }
          }
        }
        stroke._lastIncrementalRadius = prevRadius;
        activeCtx.fill(segPath);
      }
    }

    activeCtx.restore();
    stroke._renderedUpToIndex = pts.length;
    activeCanvasDirty = true;
  }

  /**
   * Rendu ultra-léger (60/120 FPS) du calque actif (#activeInkCanvas) uniquement.
   * Utilise le rendu incrémental O(1) pour les traits au stylet afin qu'un long trait n'accumule aucun délai.
   */
  function drawShapeConnectionGuides(targetCtx) {
    const hover = state.shapeHoverConnection;
    if (!hover || !hover.targetShape) return;
    const z = Math.max(0.35, state.zoom || 1);
    const ports = getShapeConnectionPorts(hover.targetShape);

    targetCtx.save();
    // 1. Points de connexion cardinaux GoodNotes (discrets bleu #0072ce avec liseré blanc)
    if (ports.length > 0) {
      const dotR = 3.6 / z;
      const strokeW = 1.4 / z;
      for (let i = 0; i < ports.length; i++) {
        const pt = ports[i];
        targetCtx.beginPath();
        targetCtx.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
        targetCtx.fillStyle = '#ffffff';
        targetCtx.fill();
        targetCtx.lineWidth = strokeW;
        targetCtx.strokeStyle = '#0072ce';
        targetCtx.stroke();
      }
    }

    // 2. Point magnétique verrouillé actif (anneau bleu lumineux sur le bord exact du cercle / de la forme)
    if (hover.snapPoint) {
      const sp = hover.snapPoint;
      targetCtx.beginPath();
      targetCtx.arc(sp.x, sp.y, 9.5 / z, 0, Math.PI * 2);
      targetCtx.fillStyle = 'rgba(0, 114, 206, 0.22)';
      targetCtx.fill();

      targetCtx.beginPath();
      targetCtx.arc(sp.x, sp.y, 4.6 / z, 0, Math.PI * 2);
      targetCtx.fillStyle = '#0072ce';
      targetCtx.fill();
      targetCtx.lineWidth = 1.6 / z;
      targetCtx.strokeStyle = '#ffffff';
      targetCtx.stroke();
    }
    targetCtx.restore();
  }

  function updateShapeConnectionHover(worldPt, fromPt, page) {
    if (!page || !Array.isArray(page.shapes) || page.shapes.length === 0 || !isConnectorToolMode()) {
      const had = Boolean(state.shapeHoverConnection);
      state.shapeHoverConnection = null;
      return had;
    }
    const prev = state.shapeHoverConnection;
    const excludeId = state.currentShape ? state.currentShape.id : null;
    const snap = findShapeConnectionSnap(worldPt, page.shapes, { fromPt, excludeShapeId: excludeId });
    let next = null;
    if (snap && snap.targetShape) {
      next = {
        targetShape: snap.targetShape,
        snapPoint: { x: snap.x, y: snap.y },
        connection: snap.connection || null
      };
    } else {
      const hovered = findHoveredConnectableShape(worldPt, page.shapes, Math.max(32, 46 / Math.max(0.4, state.zoom || 1)));
      if (hovered) {
        next = { targetShape: hovered, snapPoint: null, connection: null };
      }
    }
    state.shapeHoverConnection = next;
    const changed =
      Boolean(prev) !== Boolean(next) ||
      (prev && next && (
        prev.targetShape !== next.targetShape ||
        Boolean(prev.snapPoint) !== Boolean(next.snapPoint) ||
        (prev.snapPoint && next.snapPoint && (
          Math.abs(prev.snapPoint.x - next.snapPoint.x) > 0.5 ||
          Math.abs(prev.snapPoint.y - next.snapPoint.y) > 0.5
        ))
      ));
    return changed;
  }

  // ============================================================================
  // ÉDITION INTERACTIVE DE FORME SÉLECTIONNÉE (GoodNotes ShapeTool Editing :
  // clic pour sélectionner, poignées redimensionnement/sommets/rotation/extrémités,
  // conversion de type, remplissage, épaisseur, couleur, dupliquer, supprimer)
  // ============================================================================

  function getSelectedShape(page = getActivePage()) {
    if (!state.selectedShapeId || !page || !Array.isArray(page.shapes)) return null;
    const found = page.shapes.find((s) => s && s.id === state.selectedShapeId);
    if (!found) {
      state.selectedShapeId = null;
      if (dom.shapeEditFloatingBar) dom.shapeEditFloatingBar.classList.add('hidden');
      return null;
    }
    return found;
  }

  function clearSelectedShape(rerender = true) {
    const had = Boolean(state.selectedShapeId || state.shapeEditDrag);
    state.selectedShapeId = null;
    state.shapeEditDrag = null;
    state.pendingShapeTapCandidateId = null;
    state.pendingShapeTapStartScreen = null;
    if (dom.shapeEditFloatingBar) dom.shapeEditFloatingBar.classList.add('hidden');
    if (had && rerender) renderActiveCanvasOnly();
  }

  function selectShapeForEditing(shapeId) {
    const page = getActivePage();
    if (!page || !Array.isArray(page.shapes)) return null;
    const sh = page.shapes.find((s) => s && s.id === shapeId);
    if (!sh) return null;
    clearLassoSelection();
    state.selectedShapeId = sh.id;
    state.shapeEditDrag = null;
    state.shapeHoverConnection = null;
    updateShapeEditFloatingBar();
    renderActiveCanvasOnly();
    return sh;
  }

  function isPointOnOrInsideShape(sh, wx, wy, pad = 12) {
    if (!sh) return false;
    if (isPointNearShape(sh, wx, wy, pad)) return true;
    if (sh.type === 'ellipse') {
      const { cx, cy, hw, hh, angle } = getClosedShapeLocalFrame(sh);
      const dx = wx - cx, dy = wy - cy;
      const cosA = Math.cos(-angle), sinA = Math.sin(-angle);
      const lx = dx * cosA - dy * sinA;
      const ly = dx * sinA + dy * cosA;
      return Math.hypot(lx / Math.max(1, hw), ly / Math.max(1, hh)) <= 1.05;
    }
    if (sh.type === 'rect' || sh.type === 'roundedRect') {
      const { cx, cy, hw, hh, angle } = getClosedShapeLocalFrame(sh);
      const dx = wx - cx, dy = wy - cy;
      const cosA = Math.cos(-angle), sinA = Math.sin(-angle);
      const lx = dx * cosA - dy * sinA;
      const ly = dx * sinA + dy * cosA;
      return Math.abs(lx) <= hw + pad * 0.4 && Math.abs(ly) <= hh + pad * 0.4;
    }
    if (sh.type === 'triangle' || sh.type === 'diamond' || sh.type === 'polygon') {
      const verts = getClosedShapePolygonVertices(sh);
      return Boolean(verts && verts.length >= 3 && pointInPolygon(wx, wy, verts));
    }
    return false;
  }

  function findShapeAtPoint(page, wx, wy) {
    if (!page || !Array.isArray(page.shapes) || page.shapes.length === 0) return null;
    const pad = Math.max(10, 12 / Math.max(0.4, state.zoom || 1));
    for (let i = page.shapes.length - 1; i >= 0; i--) {
      if (isPointOnOrInsideShape(page.shapes[i], wx, wy, pad)) return page.shapes[i];
    }
    return null;
  }

  function getShapeEditHandles(sh) {
    if (!sh) return [];
    const z = Math.max(0.35, state.zoom || 1);
    if (sh.type === 'line' || sh.type === 'arrow' || sh.type === 'elbowArrow' || sh.type === 'curvedArrow') {
      return [
        { id: 'p1', kind: 'endpoint', x: sh.x1, y: sh.y1 },
        { id: 'p2', kind: 'endpoint', x: sh.x2, y: sh.y2 }
      ];
    }
    if (sh.type === 'triangle' || sh.type === 'diamond' || sh.type === 'polygon' || sh.type === 'polyline' || sh.type === 'arc') {
      const verts = getShapeVertices(sh) || [];
      return verts.map((v, idx) => ({ id: `v:${idx}`, kind: 'vertex', index: idx, x: v.x, y: v.y }));
    }
    // rect, roundedRect, ellipse -> 8 poignées de redimensionnement + poignée de rotation en haut
    const { cx, cy, hw, hh, angle } = getClosedShapeLocalFrame(sh);
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const toW = (lx, ly) => ({ x: cx + lx * cosA - ly * sinA, y: cy + lx * sinA + ly * cosA });
    const handles = [
      { id: 'nw', kind: 'resize', sx: -1, sy: -1, ...toW(-hw, -hh) },
      { id: 'n', kind: 'resize', sx: 0, sy: -1, ...toW(0, -hh) },
      { id: 'ne', kind: 'resize', sx: 1, sy: -1, ...toW(hw, -hh) },
      { id: 'e', kind: 'resize', sx: 1, sy: 0, ...toW(hw, 0) },
      { id: 'se', kind: 'resize', sx: 1, sy: 1, ...toW(hw, hh) },
      { id: 's', kind: 'resize', sx: 0, sy: 1, ...toW(0, hh) },
      { id: 'sw', kind: 'resize', sx: -1, sy: 1, ...toW(-hw, hh) },
      { id: 'w', kind: 'resize', sx: -1, sy: 0, ...toW(-hw, 0) }
    ];
    if (sh.type === 'rect' || sh.type === 'ellipse') {
      handles.push({ id: 'rotate', kind: 'rotate', ...toW(0, -(hh + 26 / z)) });
    }
    return handles;
  }

  function hitTestShapeEditHandle(sh, wx, wy) {
    if (!sh) return null;
    const hitR = Math.max(11, 14 / Math.max(0.4, state.zoom || 1));
    const handles = getShapeEditHandles(sh);
    let best = null, bestD = hitR;
    for (let i = 0; i < handles.length; i++) {
      const d = Math.hypot(wx - handles[i].x, wy - handles[i].y);
      if (d <= bestD) { bestD = d; best = handles[i]; }
    }
    return best;
  }

  function drawShapeEditingOverlay(targetCtx, sh) {
    if (!sh) return;
    const z = Math.max(0.35, state.zoom || 1);
    const handles = getShapeEditHandles(sh);
    targetCtx.save();

    // Cadre de sélection bleu GoodNotes (#0072ce)
    targetCtx.strokeStyle = '#0072ce';
    targetCtx.lineWidth = 1.4 / z;
    targetCtx.setLineDash([4 / z, 3 / z]);
    if (sh.type === 'rect' || sh.type === 'roundedRect' || sh.type === 'ellipse') {
      const { cx, cy, hw, hh, angle } = getClosedShapeLocalFrame(sh);
      targetCtx.save();
      targetCtx.translate(cx, cy);
      if (angle) targetCtx.rotate(angle);
      targetCtx.strokeRect(-hw, -hh, hw * 2, hh * 2);
      if (sh.type === 'rect' || sh.type === 'ellipse') {
        targetCtx.setLineDash([]);
        targetCtx.beginPath();
        targetCtx.moveTo(0, -hh);
        targetCtx.lineTo(0, -(hh + 26 / z));
        targetCtx.stroke();
      }
      targetCtx.restore();
    } else if (sh.type === 'arc') {
      const verts = getShapeVertices(sh) || [];
      if (verts.length >= 4) {
        targetCtx.beginPath();
        targetCtx.moveTo(verts[0].x, verts[0].y);
        targetCtx.lineTo(verts[1].x, verts[1].y);
        targetCtx.moveTo(verts[3].x, verts[3].y);
        targetCtx.lineTo(verts[2].x, verts[2].y);
        targetCtx.stroke();
      }
    } else if (sh.type === 'triangle' || sh.type === 'diamond' || sh.type === 'polygon') {
      const bb = getShapeBoundingBox(sh);
      targetCtx.strokeRect(bb.minX - 4 / z, bb.minY - 4 / z, (bb.maxX - bb.minX) + 8 / z, (bb.maxY - bb.minY) + 8 / z);
    }

    // Poignées blanches cerclées bleu GoodNotes
    targetCtx.setLineDash([]);
    const r = 5.2 / z;
    const rotR = 6.0 / z;
    for (let i = 0; i < handles.length; i++) {
      const h = handles[i];
      targetCtx.beginPath();
      targetCtx.arc(h.x, h.y, h.kind === 'rotate' ? rotR : r, 0, Math.PI * 2);
      targetCtx.fillStyle = h.kind === 'rotate' ? '#0072ce' : '#ffffff';
      targetCtx.fill();
      targetCtx.lineWidth = 1.8 / z;
      targetCtx.strokeStyle = h.kind === 'rotate' ? '#ffffff' : '#0072ce';
      targetCtx.stroke();
    }
    targetCtx.restore();
  }

  function updateShapeEditFloatingBar() {
    const bar = dom.shapeEditFloatingBar;
    if (!bar) return;
    const sh = getSelectedShape();
    if (!sh) {
      bar.classList.add('hidden');
      return;
    }
    const isClosed = isConnectableTargetShape(sh);
    const closedGrp = document.getElementById('shapeEditClosedTypes');
    const openGrp = document.getElementById('shapeEditOpenTypes');
    const fillBtn = document.getElementById('btnShapeEditFill');
    const sizeLbl = document.getElementById('shapeEditSizeLabel');
    const customCol = document.getElementById('shapeEditCustomColor');

    if (closedGrp) closedGrp.classList.toggle('hidden', !isClosed);
    if (openGrp) openGrp.classList.toggle('hidden', isClosed);
    if (fillBtn) {
      fillBtn.style.display = isClosed ? '' : 'none';
      fillBtn.classList.toggle('active', Boolean(sh.filled));
    }
    if (sizeLbl) sizeLbl.textContent = `${Math.round((sh.size || 3) * 10) / 10}px`;
    if (customCol && sh.color && /^#[0-9a-f]{6}$/i.test(sh.color)) customCol.value = sh.color;

    bar.querySelectorAll('[data-shape-convert]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.shapeConvert === sh.type);
    });
    const curCol = String(sh.color || '#111827').toLowerCase();
    bar.querySelectorAll('[data-shape-color]').forEach((sw) => {
      sw.classList.toggle('active', String(sw.dataset.shapeColor || '').toLowerCase() === curCol);
    });

    const bb = getShapeBoundingBox(sh);
    const vpRect = dom.canvasViewport.getBoundingClientRect();
    const topMidX = ((bb.minX + bb.maxX) * 0.5) * state.zoom + state.panX;
    const topY = bb.minY * state.zoom + state.panY;
    const botY = bb.maxY * state.zoom + state.panY;
    const clampedX = Math.max(185, Math.min(Math.max(185, vpRect.width - 185), topMidX));
    let barY = topY - 18;
    if (barY < 74) {
      barY = Math.min(vpRect.height - 20, botY + 52);
    }
    bar.style.left = `${clampedX}px`;
    bar.style.top = `${barY}px`;
    bar.classList.remove('hidden');
  }

  function convertSelectedShapeType(newType) {
    const page = getActivePage();
    const sh = getSelectedShape(page);
    if (!page || !sh || !newType || sh.type === newType) return false;
    pushHistorySnapshot(page);
    const bb = getShapeBoundingBox(sh);
    const isTargetClosed = newType === 'ellipse' || newType === 'rect' || newType === 'roundedRect' || newType === 'triangle' || newType === 'diamond';
    if (isTargetClosed) {
      sh.type = newType;
      sh.x1 = bb.minX; sh.y1 = bb.minY; sh.x2 = bb.maxX; sh.y2 = bb.maxY;
      if (newType === 'triangle') {
        sh.angle = 0;
        sh.vertices = [
          { x: (bb.minX + bb.maxX) * 0.5, y: bb.minY },
          { x: bb.maxX, y: bb.maxY },
          { x: bb.minX, y: bb.maxY }
        ];
      } else if (newType === 'diamond') {
        sh.angle = 0;
        const cx = (bb.minX + bb.maxX) * 0.5, cy = (bb.minY + bb.maxY) * 0.5;
        sh.vertices = [
          { x: cx, y: bb.minY },
          { x: bb.maxX, y: cy },
          { x: cx, y: bb.maxY },
          { x: bb.minX, y: cy }
        ];
      } else {
        delete sh.vertices;
        if (newType === 'roundedRect') sh.angle = 0;
      }
      updateConnectedShapesForPage(page, new Set([sh.id]));
    } else {
      const verts = Array.isArray(sh.vertices) && sh.vertices.length >= 2 ? sh.vertices : null;
      const sx = verts ? verts[0].x : sh.x1;
      const sy = verts ? verts[0].y : sh.y1;
      const ex = verts ? verts[verts.length - 1].x : sh.x2;
      const ey = verts ? verts[verts.length - 1].y : sh.y2;
      sh.type = newType;
      sh.x1 = sx; sh.y1 = sy; sh.x2 = ex; sh.y2 = ey;
      sh.filled = false;
      delete sh.vertices;
      delete sh.angle;
    }
    invalidateStaticInkCache();
    renderScene();
    renderActiveCanvasOnly();
    updateShapeEditFloatingBar();
    scheduleSaveActivePage(page);
    return true;
  }

  function applyShapeEditDrag(sh, orig, drag, worldPt, page) {
    if (!sh || !orig || !drag) return;
    const dx = worldPt.x - drag.startWorld.x;
    const dy = worldPt.y - drag.startWorld.y;

    if (drag.mode === 'move') {
      sh.x1 = orig.x1 + dx; sh.y1 = orig.y1 + dy;
      sh.x2 = orig.x2 + dx; sh.y2 = orig.y2 + dy;
      if (Array.isArray(orig.vertices)) {
        sh.vertices = orig.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy }));
      }
      if (isConnectorShape(sh)) {
        delete sh.startConnection;
        delete sh.endConnection;
      }
      updateConnectedShapesForPage(page, new Set([sh.id]));
      return;
    }

    if (drag.mode === 'rotate') {
      const { cx, cy } = getClosedShapeLocalFrame(orig);
      let ang = Math.atan2(worldPt.y - cy, worldPt.x - cx) + Math.PI / 2;
      const step = Math.PI / 4;
      const nearest = Math.round(ang / step) * step;
      if (Math.abs(ang - nearest) < (4 * Math.PI) / 180) ang = nearest;
      sh.angle = ang;
      updateConnectedShapesForPage(page, new Set([sh.id]));
      return;
    }

    if (drag.mode === 'resize') {
      const { cx, cy, hw, hh, angle } = getClosedShapeLocalFrame(orig);
      const cosNeg = Math.cos(-angle), sinNeg = Math.sin(-angle);
      const cosPos = Math.cos(angle), sinPos = Math.sin(angle);
      const ldx = dx * cosNeg - dy * sinNeg;
      const ldy = dx * sinNeg + dy * cosNeg;
      let left = -hw, right = hw, top = -hh, bottom = hh;
      if (drag.sx < 0) left = Math.min(right - 12, left + ldx);
      if (drag.sx > 0) right = Math.max(left + 12, right + ldx);
      if (drag.sy < 0) top = Math.min(bottom - 12, top + ldy);
      if (drag.sy > 0) bottom = Math.max(top + 12, bottom + ldy);
      const nCxLocal = (left + right) * 0.5;
      const nCyLocal = (top + bottom) * 0.5;
      const nHw = Math.max(6, (right - left) * 0.5);
      const nHh = Math.max(6, (bottom - top) * 0.5);
      const nCx = cx + nCxLocal * cosPos - nCyLocal * sinPos;
      const nCy = cy + nCxLocal * sinPos + nCyLocal * cosPos;
      sh.x1 = nCx - nHw; sh.y1 = nCy - nHh;
      sh.x2 = nCx + nHw; sh.y2 = nCy + nHh;
      updateConnectedShapesForPage(page, new Set([sh.id]));
      return;
    }

    if (drag.mode === 'vertex') {
      const baseVerts = Array.isArray(orig.vertices) ? orig.vertices : (getShapeVertices(orig) || []);
      if (baseVerts.length === 0) return;
      const nextVerts = baseVerts.map((v) => ({ x: v.x, y: v.y }));
      const idx = drag.index;
      let targetPt = { x: worldPt.x, y: worldPt.y };
      const isOpenEnd = (sh.type === 'polyline' || sh.type === 'arc') && (idx === 0 || idx === nextVerts.length - 1);
      if (isOpenEnd && page && page.shapes) {
        const otherPt = idx === 0 ? nextVerts[1] : nextVerts[nextVerts.length - 2];
        const snap = findShapeConnectionSnap(targetPt, page.shapes, { fromPt: otherPt, excludeShapeId: sh.id });
        if (snap) {
          targetPt = { x: snap.x, y: snap.y };
          if (idx === 0) sh.startConnection = snap.connection || undefined;
          else sh.endConnection = snap.connection || undefined;
          state.shapeHoverConnection = { targetShape: snap.targetShape, snapPoint: targetPt, connection: snap.connection || null };
        } else {
          if (idx === 0) delete sh.startConnection;
          else delete sh.endConnection;
          updateShapeConnectionHover(targetPt, otherPt, page);
        }
      }
      nextVerts[idx] = targetPt;
      sh.vertices = nextVerts;
      const bb = getShapeBoundingBox(sh);
      sh.x1 = bb.minX; sh.y1 = bb.minY; sh.x2 = bb.maxX; sh.y2 = bb.maxY;
      updateConnectedShapesForPage(page, new Set([sh.id]));
      return;
    }

    if (drag.mode === 'endpoint') {
      const isStart = drag.handleId === 'p1';
      const otherPt = isStart ? { x: sh.x2, y: sh.y2 } : { x: sh.x1, y: sh.y1 };
      const snap = page && page.shapes
        ? findShapeConnectionSnap(worldPt, page.shapes, { fromPt: otherPt, excludeShapeId: sh.id })
        : null;
      let nx = worldPt.x, ny = worldPt.y;
      if (snap) {
        nx = snap.x; ny = snap.y;
        if (isStart) sh.startConnection = snap.connection || undefined;
        else sh.endConnection = snap.connection || undefined;
        state.shapeHoverConnection = { targetShape: snap.targetShape, snapPoint: { x: nx, y: ny }, connection: snap.connection || null };
      } else {
        if (isStart) delete sh.startConnection;
        else delete sh.endConnection;
        if (sh.type === 'line' || sh.type === 'arrow') {
          const snapped45 = snapLineEndpoint45(otherPt.x, otherPt.y, nx, ny, 4.0);
          nx = snapped45.x; ny = snapped45.y;
        }
        updateShapeConnectionHover({ x: nx, y: ny }, otherPt, page);
      }
      if (isStart) { sh.x1 = nx; sh.y1 = ny; }
      else { sh.x2 = nx; sh.y2 = ny; }
    }
  }

  function duplicateSelectedShape() {
    const page = getActivePage();
    const sh = getSelectedShape(page);
    if (!page || !sh) return null;
    pushHistorySnapshot(page);
    const off = 24;
    const copy = {
      ...sh,
      id: createUid('sh'),
      x1: sh.x1 + off, y1: sh.y1 + off, x2: sh.x2 + off, y2: sh.y2 + off,
      vertices: Array.isArray(sh.vertices) ? sh.vertices.map((v) => ({ x: v.x + off, y: v.y + off })) : undefined
    };
    delete copy.startConnection;
    delete copy.endConnection;
    page.shapes.push(copy);
    state.selectedShapeId = copy.id;
    invalidateStaticInkCache();
    renderScene();
    renderActiveCanvasOnly();
    updateShapeEditFloatingBar();
    scheduleSaveActivePage(page);
    showToast('Forme dupliquée');
    return copy;
  }

  function deleteSelectedShape() {
    const page = getActivePage();
    const sh = getSelectedShape(page);
    if (!page || !sh) return false;
    pushHistorySnapshot(page);
    page.shapes = page.shapes.filter((s) => s.id !== sh.id);
    updateConnectedShapesForPage(page);
    clearSelectedShape(false);
    invalidateStaticInkCache();
    renderScene();
    renderActiveCanvasOnly();
    scheduleSaveActivePage(page);
    showToast('Forme supprimée');
    return true;
  }

  function renderActiveCanvasOnly() {
    if (!activeCtx || !dom.activeInkCanvas) {
      renderScene();
      return;
    }
    const t0 = performance.now();
    const page = getActivePage();
    if (!page) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = dom.canvasViewport.getBoundingClientRect();
    const targetW = Math.max(1, Math.floor(rect.width * dpr));
    const targetH = Math.max(1, Math.floor(rect.height * dpr));
    if (dom.activeInkCanvas.width !== targetW || dom.activeInkCanvas.height !== targetH) {
      dom.activeInkCanvas.width = targetW;
      dom.activeInkCanvas.height = targetH;
      if (state.currentStroke) {
        state.currentStroke._incrementalStarted = false;
        state.currentStroke._renderedUpToIndex = 0;
      }
    }

    const isDark = page.paperTone === 'dark' || page.paperTone === 'blueprint';
    const effectiveDark = page.pdfId ? false : isDark;
    const hasShapeConnGuide = Boolean(state.tool === 'shape' && state.shapeHoverConnection);
    const selectedShape = state.selectedShapeId ? getSelectedShape(page) : null;
    const hasPdfSearchHighlights = Boolean(
      pdfSearchState.open &&
      pdfSearchState.matches.length > 0 &&
      pdfSearchState.matches.some((m) => m.pageId === page.id)
    );

    // Cas 1 : Tracé libre au stylo ou surligneur -> rendu incrémental O(1) uniquement des nouveaux points
    if (state.currentStroke && !state.currentStrokeSnappedFromAutoShape && !state.currentShape && !hasShapeConnGuide && !selectedShape && !hasPdfSearchHighlights && state.lassoPolygon.length === 0 && !state.currentTape && state.laserTrail.length === 0) {
      renderIncrementalStrokeTail(state.currentStroke, dpr, rect, effectiveDark);
      renderPerfStats.activeRenderCount++;
      renderPerfStats.lastActiveRenderMs = performance.now() - t0;
      return;
    }

    // Cas 2 : Forme géométrique, Édition de forme, Guides de connexion, Aperçu Zone de Texte, Ruban d'étude, Pointeur Laser, Recherche PDF ou Lasso
    const hasOverlay = Boolean(
      state.currentStroke ||
      state.currentShape ||
      hasShapeConnGuide ||
      selectedShape ||
      hasPdfSearchHighlights ||
      state.textBoxCreateDrag ||
      state.currentTape ||
      state.laserTrail.length > 0 ||
      state.lassoPolygon.length > 1 ||
      (state.selectionBounds && hasAnyLassoSelection())
    );
    if (!hasOverlay) {
      clearActiveCanvas();
      updateLassoFloatingBarPosition();
      updateShapeEditFloatingBar();
      updateTextEditFloatingBar();
      renderPerfStats.activeRenderCount++;
      renderPerfStats.lastActiveRenderMs = performance.now() - t0;
      return;
    }

    dom.activeInkCanvas.style.opacity = '1';
    dom.activeInkCanvas.style.mixBlendMode = 'normal';
    activeCtx.save();
    activeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    activeCtx.clearRect(0, 0, rect.width, rect.height);
    activeCtx.translate(state.panX, state.panY);
    activeCtx.scale(state.zoom, state.zoom);

    if (hasShapeConnGuide) {
      drawShapeConnectionGuides(activeCtx);
    }
    if (selectedShape) {
      drawShapeEditingOverlay(activeCtx, selectedShape);
    }
    if (state.textBoxCreateDrag) {
      const td = state.textBoxCreateDrag;
      const rx = Math.min(td.startWorld.x, td.curWorld.x);
      const ry = Math.min(td.startWorld.y, td.curWorld.y);
      const rw = Math.max(24, Math.abs(td.curWorld.x - td.startWorld.x));
      const rh = Math.max(36, Math.abs(td.curWorld.y - td.startWorld.y));
      activeCtx.save();
      activeCtx.fillStyle = 'rgba(0, 114, 206, 0.06)';
      activeCtx.strokeStyle = '#0072ce';
      activeCtx.lineWidth = 1.5 / Math.max(0.25, state.zoom);
      activeCtx.setLineDash([6 / Math.max(0.25, state.zoom), 4 / Math.max(0.25, state.zoom)]);
      activeCtx.fillRect(rx, ry, rw, rh);
      activeCtx.strokeRect(rx, ry, rw, rh);
      activeCtx.restore();
    }
    if (state.currentStroke && !state.currentStrokeSnappedFromAutoShape) {
      drawSingleStroke(activeCtx, state.currentStroke, effectiveDark, false);
    }
    if (state.currentShape) {
      drawGeometricShape(activeCtx, state.currentShape, false, effectiveDark);
    }
    if (state.currentTape) {
      drawTapeItem(activeCtx, state.currentTape, true);
    }
    if (state.laserTrail.length > 0) {
      drawLaserTrail(activeCtx);
    }
    if (hasPdfSearchHighlights) {
      drawPdfSearchHighlights(activeCtx, page.id);
    }
    drawLassoOverlay(activeCtx);
    activeCtx.restore();
    activeCanvasDirty = true;

    updateLassoFloatingBarPosition();
    updateShapeEditFloatingBar();
    updateTextEditFloatingBar();
    renderPerfStats.activeRenderCount++;
    renderPerfStats.lastActiveRenderMs = performance.now() - t0;
  }

  function getTapeTotalLength(tape) {
    if (!tape) return 0;
    if (Array.isArray(tape.points) && tape.points.length >= 2) {
      let total = 0;
      for (let i = 1; i < tape.points.length; i++) {
        total += Math.hypot(tape.points[i].x - tape.points[i - 1].x, tape.points[i].y - tape.points[i - 1].y);
      }
      return total;
    }
    return Math.hypot((tape.x2 || 0) - (tape.x1 || 0), (tape.y2 || 0) - (tape.y1 || 0));
  }

  function removeAllTapesOnActivePage() {
    const page = getActivePage();
    if (!page) return 0;
    const count = Array.isArray(page.tapes) ? page.tapes.length : 0;
    if (count === 0) {
      state.gnTapePopoverOpen = false;
      updateToolbarActiveState();
      showToast('Aucun ruban sur cette page');
      return 0;
    }
    pushHistorySnapshot(page);
    page.tapes = [];
    state.gnTapePopoverOpen = false;
    invalidateStaticInkCache();
    updateToolbarActiveState();
    requestRender();
    scheduleSaveActivePage(page);
    showToast(`${count} ruban${count > 1 ? 's' : ''} supprimé${count > 1 ? 's' : ''}`);
    return count;
  }

  function drawTapeItem(targetCtx, tape, isPreview = false) {
    if (!tape) return;
    const thick = Math.max(12, tape.thickness || 26);
    const color = tape.color || '#ff5f67';

    // Ruban libre (main levée) lorsque "Ruban droit" est désactivé (comportement par défaut GoodNotes)
    if (Array.isArray(tape.points) && tape.points.length >= 2 && tape.straight === false) {
      const pts = tape.points;
      targetCtx.save();
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';
      targetCtx.beginPath();
      targetCtx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const cur = pts[i];
        const mx = (prev.x + cur.x) * 0.5;
        const my = (prev.y + cur.y) * 0.5;
        targetCtx.quadraticCurveTo(prev.x, prev.y, mx, my);
      }
      targetCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);

      if (tape.revealed && !isPreview) {
        targetCtx.strokeStyle = hexToRgba(color, 0.16);
        targetCtx.lineWidth = thick;
        targetCtx.stroke();
        targetCtx.strokeStyle = color;
        targetCtx.lineWidth = 1.6;
        targetCtx.setLineDash([6, 5]);
        targetCtx.stroke();
      } else {
        targetCtx.globalAlpha = isPreview ? 0.80 : 0.96;
        targetCtx.strokeStyle = color;
        targetCtx.lineWidth = thick;
        targetCtx.stroke();

        // Légère ligne en pointillé translucide au centre façon ruban GoodNotes
        targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        targetCtx.lineWidth = Math.max(2, thick * 0.14);
        targetCtx.setLineDash([Math.max(4, thick * 0.28), Math.max(5, thick * 0.34)]);
        targetCtx.stroke();
      }
      targetCtx.restore();
      return;
    }

    const dx = tape.x2 - tape.x1;
    const dy = tape.y2 - tape.y1;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;
    const angle = Math.atan2(dy, dx);

    targetCtx.save();
    targetCtx.translate(tape.x1, tape.y1);
    targetCtx.rotate(angle);

    if (tape.revealed && !isPreview) {
      targetCtx.fillStyle = hexToRgba(color, 0.12);
      targetCtx.strokeStyle = color;
      targetCtx.lineWidth = 1.6;
      targetCtx.setLineDash([6, 5]);
      targetCtx.fillRect(0, -thick * 0.5, len, thick);
      targetCtx.strokeRect(0, -thick * 0.5, len, thick);
    } else {
      targetCtx.globalAlpha = isPreview ? 0.78 : 0.96;
      targetCtx.fillStyle = color;
      targetCtx.beginPath();
      if (typeof targetCtx.roundRect === 'function') {
        targetCtx.roundRect(0, -thick * 0.5, len, thick, 4);
      } else {
        targetCtx.rect(0, -thick * 0.5, len, thick);
      }
      targetCtx.fill();

      // Rayures diagonales style Ruban d'étude Goodnotes
      targetCtx.save();
      targetCtx.clip();
      targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      targetCtx.lineWidth = 4;
      for (let sx = -thick; sx < len + thick; sx += 14) {
        targetCtx.beginPath();
        targetCtx.moveTo(sx, -thick * 0.6);
        targetCtx.lineTo(sx + thick * 0.8, thick * 0.6);
        targetCtx.stroke();
      }
      targetCtx.restore();
    }
    targetCtx.restore();
  }

  function drawLaserTrail(targetCtx) {
    const now = performance.now();
    const maxAge = 750;
    const pts = state.laserTrail.filter((p) => now - p.t <= maxAge);
    state.laserTrail = pts;
    if (pts.length === 0) return;

    const laserHex = state.laserColor || '#ef4444';
    const laserBaseWidth = Math.max(4, Number(state.laserSize) || 6) * 1.25;
    targetCtx.save();
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const ageRatio = Math.max(0, 1 - (now - p1.t) / maxAge);
      targetCtx.strokeStyle = hexToRgba(laserHex, Number((ageRatio * 0.88).toFixed(3)));
      targetCtx.lineWidth = Math.max(2, (laserBaseWidth * ageRatio) / Math.max(0.4, state.zoom));
      targetCtx.beginPath();
      targetCtx.moveTo(p0.x, p0.y);
      targetCtx.lineTo(p1.x, p1.y);
      targetCtx.stroke();
    }
    const tip = pts[pts.length - 1];
    const tipAge = Math.max(0, 1 - (now - tip.t) / maxAge);
    const r = ((laserBaseWidth * 0.82) * tipAge + 2) / Math.max(0.4, state.zoom);
    targetCtx.fillStyle = hexToRgba(laserHex, Number((tipAge * 0.32).toFixed(3)));
    targetCtx.beginPath();
    targetCtx.arc(tip.x, tip.y, r * 2.2, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.fillStyle = `rgba(255, 255, 255, ${(tipAge * 0.95).toFixed(3)})`;
    targetCtx.beginPath();
    targetCtx.arc(tip.x, tip.y, r * 0.7, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.restore();
  }

  function drawZoomWindowTargetBox(targetCtx) {
    const b = state.zoomWindowBox;
    if (!b) return;
    targetCtx.save();
    targetCtx.strokeStyle = '#2563eb';
    targetCtx.fillStyle = 'rgba(37, 99, 235, 0.06)';
    targetCtx.lineWidth = 2 / Math.max(0.3, state.zoom);
    targetCtx.setLineDash([7 / Math.max(0.3, state.zoom), 4 / Math.max(0.3, state.zoom)]);
    targetCtx.fillRect(b.x, b.y, b.w, b.h);
    targetCtx.strokeRect(b.x, b.y, b.w, b.h);
    targetCtx.restore();
  }

  function drawStaticElementsInWorldRect(targetCtx, page, effectiveDark, viewBounds) {
    const strokes = page.strokes || [];
    const shapes = page.shapes || [];
    const tapes = page.tapes || [];
    const hasSelectedStrokes = state.selectedIds.strokes.size > 0;
    const hasSelectedShapes = state.selectedIds.shapes.size > 0;
    const clipBounded = isBoundedPage(page);
    if (clipBounded) {
      const pb = getPageBounds(page);
      targetCtx.save();
      targetCtx.beginPath();
      targetCtx.rect(0, 0, pb.width, pb.height);
      targetCtx.clip();
    }

    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i];
      if (s.tool === 'highlighter') {
        drawSingleStroke(targetCtx, s, effectiveDark, hasSelectedStrokes && state.selectedIds.strokes.has(s.id), viewBounds);
      }
    }
    for (let i = 0; i < shapes.length; i++) {
      const sh = shapes[i];
      if (viewBounds) {
        const sb = getShapeBoundingBox(sh);
        if (!isBoundsInViewport(sb, viewBounds)) continue;
      }
      drawGeometricShape(targetCtx, sh, hasSelectedShapes && state.selectedIds.shapes.has(sh.id), effectiveDark);
    }
    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i];
      if (s.tool !== 'highlighter') {
        drawSingleStroke(targetCtx, s, effectiveDark, hasSelectedStrokes && state.selectedIds.strokes.has(s.id), viewBounds);
      }
    }
    for (let i = 0; i < tapes.length; i++) {
      drawTapeItem(targetCtx, tapes[i], false);
    }
    if (clipBounded) {
      targetCtx.restore();
    }
  }

  function drawStackStaticElements(targetCtx, activePage, fallbackEffectiveDark, viewBounds) {
    const stack = getBoundedStackInfo(activePage);
    if (!stack || stack.items.length <= 1) {
      drawStaticElementsInWorldRect(targetCtx, activePage, fallbackEffectiveDark, viewBounds);
      return;
    }
    const minY = viewBounds ? viewBounds.minY : -Infinity;
    const maxY = viewBounds ? viewBounds.maxY : Infinity;
    for (let i = 0; i < stack.items.length; i++) {
      const it = stack.items[i];
      if (it.relY + it.height < minY - 64 || it.relY > maxY + 64) continue;
      const p = it.page;
      const pDark = !p.pdfId && (p.paperTone === 'dark' || p.paperTone === 'blueprint');
      const localBounds = viewBounds ? {
        minX: viewBounds.minX - it.relX,
        minY: viewBounds.minY - it.relY,
        maxX: viewBounds.maxX - it.relX,
        maxY: viewBounds.maxY - it.relY
      } : null;
      targetCtx.save();
      targetCtx.translate(it.relX, it.relY);
      drawStaticElementsInWorldRect(targetCtx, p, pDark, localBounds);
      targetCtx.restore();
    }
  }

  function ensureStaticInkBitmapCacheReady(page, rect, dpr, effectiveDark) {
    const pad = staticInkCache.pad;
    const cacheW = Math.max(1, Math.floor((rect.width + pad * 2) * dpr));
    const cacheH = Math.max(1, Math.floor((rect.height + pad * 2) * dpr));

    if (
      staticInkCache.valid &&
      staticInkCache.canvas &&
      staticInkCache.pageId === page.id &&
      staticInkCache.zoom === state.zoom &&
      staticInkCache.dpr === dpr &&
      staticInkCache.viewW === rect.width &&
      staticInkCache.viewH === rect.height &&
      staticInkCache.effectiveDark === effectiveDark &&
      Math.abs(state.panX - staticInkCache.originPanX) <= pad - 12 &&
      Math.abs(state.panY - staticInkCache.originPanY) <= pad - 12
    ) {
      return true;
    }

    if (!staticInkCache.canvas) {
      staticInkCache.canvas = document.createElement('canvas');
      staticInkCache.ctx = staticInkCache.canvas.getContext('2d');
    }
    if (!staticInkCache.ctx) return false;

    if (staticInkCache.canvas.width !== cacheW || staticInkCache.canvas.height !== cacheH) {
      staticInkCache.canvas.width = cacheW;
      staticInkCache.canvas.height = cacheH;
    }

    const cCtx = staticInkCache.ctx;
    const originPanX = state.panX;
    const originPanY = state.panY;
    const viewBounds = {
      minX: (-originPanX - pad) / state.zoom - 24,
      minY: (-originPanY - pad) / state.zoom - 24,
      maxX: (rect.width + pad - originPanX) / state.zoom + 24,
      maxY: (rect.height + pad - originPanY) / state.zoom + 24
    };

    cCtx.save();
    cCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cCtx.clearRect(0, 0, rect.width + pad * 2, rect.height + pad * 2);
    cCtx.translate(originPanX + pad, originPanY + pad);
    cCtx.scale(state.zoom, state.zoom);
    drawStackStaticElements(cCtx, page, effectiveDark, viewBounds);
    cCtx.restore();

    staticInkCache.valid = true;
    staticInkCache.pageId = page.id;
    staticInkCache.zoom = state.zoom;
    staticInkCache.dpr = dpr;
    staticInkCache.viewW = rect.width;
    staticInkCache.viewH = rect.height;
    staticInkCache.originPanX = originPanX;
    staticInkCache.originPanY = originPanY;
    staticInkCache.effectiveDark = effectiveDark;
    return true;
  }

  function renderStaticInkLayerOnly() {
    const page = getActivePage();
    if (!page) return;
    const { dpr, rect } = ensureCanvasDimensionsSynced();
    const isDark = page.paperTone === 'dark' || page.paperTone === 'blueprint';
    const effectiveDark = page.pdfId ? false : isDark;
    const stackForElements = getBoundedStackInfo(page);
    const hasElements = stackForElements && stackForElements.items.length > 1
      ? stackForElements.items.some((it) => ((it.page.strokes && it.page.strokes.length) || (it.page.shapes && it.page.shapes.length) || (it.page.tapes && it.page.tapes.length)) > 0)
      : ((page.strokes && page.strokes.length) || (page.shapes && page.shapes.length) || (page.tapes && page.tapes.length)) > 0;

    // Pendant un zoom actif : blitte instantanément le cache bitmap redimensionné (0.05 ms, 120 FPS) au lieu de reconstruire un énorme canvas hors-écran à chaque cran de molette/pincement
    if (isZoomInteracting && bgCtx && activeCtx && hasElements && !hasAnyLassoSelection()) {
      if (
        staticInkCache.valid &&
        staticInkCache.canvas &&
        staticInkCache.pageId === page.id &&
        staticInkCache.effectiveDark === effectiveDark &&
        staticInkCache.zoom > 0
      ) {
        const scaleRatio = state.zoom / staticInkCache.zoom;
        const cw = staticInkCache.viewW + staticInkCache.pad * 2;
        const ch = staticInkCache.viewH + staticInkCache.pad * 2;
        const dstX = state.panX - (staticInkCache.originPanX + staticInkCache.pad) * scaleRatio;
        const dstY = state.panY - (staticInkCache.originPanY + staticInkCache.pad) * scaleRatio;
        const dstW = cw * scaleRatio;
        const dstH = ch * scaleRatio;
        if (
          scaleRatio >= 0.4 &&
          scaleRatio <= 2.8 &&
          dstX <= 4 &&
          dstY <= 4 &&
          dstX + dstW >= rect.width - 4 &&
          dstY + dstH >= rect.height - 4
        ) {
          ctx.save();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, rect.width, rect.height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'low';
          ctx.drawImage(staticInkCache.canvas, dstX, dstY, dstW, dstH);
          ctx.restore();
          return;
        }
      }
      // Si le zoom dépasse la zone en cache, on dessine directement sur le viewport sans allouer/reconstruire le cache surdimensionné (il sera reconstruit au repos après 110 ms)
    } else if (bgCtx && activeCtx && hasElements && !hasAnyLassoSelection() && ensureStaticInkBitmapCacheReady(page, rect, dpr, effectiveDark)) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, dom.inkCanvas.width, dom.inkCanvas.height);
      const dx = Math.round((state.panX - staticInkCache.originPanX - staticInkCache.pad) * dpr);
      const dy = Math.round((state.panY - staticInkCache.originPanY - staticInkCache.pad) * dpr);
      ctx.drawImage(staticInkCache.canvas, dx, dy);
      ctx.restore();
      return;
    }

    const viewBounds = {
      minX: -state.panX / state.zoom - 32,
      minY: -state.panY / state.zoom - 32,
      maxX: (rect.width - state.panX) / state.zoom + 32,
      maxY: (rect.height - state.panY) / state.zoom + 32
    };

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);

    if (!bgCtx) {
      const fallbackStack = getBoundedStackInfo(page);
      if (fallbackStack && fallbackStack.items.length > 1) {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = getBoundedDeskBackdropColor();
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.restore();
        for (let i = 0; i < fallbackStack.items.length; i++) {
          const it = fallbackStack.items[i];
          if (it.relY + it.height < viewBounds.minY - 120 || it.relY > viewBounds.maxY + 120) continue;
          ctx.save();
          ctx.translate(it.relX, it.relY);
          drawPaperBackground(ctx, it.page, rect.width, rect.height, false, true);
          if (it.page.pdfId) drawLockedPdfBackground(ctx, it.page, false);
          ctx.restore();
        }
      } else {
        drawPaperBackground(ctx, page, rect.width, rect.height, false);
        if (page.pdfId) drawLockedPdfBackground(ctx, page, false);
      }
    }

    drawStackStaticElements(ctx, page, effectiveDark, viewBounds);

    if (!activeCtx) {
      if (state.currentStroke && !state.currentStrokeSnappedFromAutoShape) {
        drawSingleStroke(ctx, state.currentStroke, effectiveDark, false);
      }
      if (state.currentShape) drawGeometricShape(ctx, state.currentShape, false, effectiveDark);
      drawLassoOverlay(ctx);
    }
    ctx.restore();
  }

  /**
   * Fusionne instantanément le trait ou la forme qui vient d'être terminé(e) depuis #activeInkCanvas
   * vers le canvas statique #inkCanvas (et son cache bitmap de déplacement) au lever du stylet, puis nettoie #activeInkCanvas.
   */
  function mergeCompletedItemIntoStaticCanvas(item, itemType = 'stroke') {
    const page = getActivePage();
    if (!page || !item) return;
    if (!activeCtx) {
      invalidateStaticInkCache();
      requestRender();
      return;
    }

    const isDark = page.paperTone === 'dark' || page.paperTone === 'blueprint';
    const effectiveDark = page.pdfId ? false : isDark;
    const dpr = window.devicePixelRatio || 1;

    // Si un surligneur est tracé par-dessus des traits de stylo déjà présents, rafraîchit le calque statique pour respecter l'ordre Z (surligneur sous l'encre)
    const needsZOrderRefresh = itemType === 'stroke' && item.tool === 'highlighter' &&
      ((page.strokes && page.strokes.some((s) => s.tool !== 'highlighter')) || (page.shapes && page.shapes.length > 0));

    if (needsZOrderRefresh) {
      invalidateStaticInkCache();
      renderStaticInkLayerOnly();
    } else {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(state.panX, state.panY);
      ctx.scale(state.zoom, state.zoom);
      if (itemType === 'stroke') {
        drawSingleStroke(ctx, item, effectiveDark, false);
      } else if (itemType === 'shape') {
        drawGeometricShape(ctx, item, false, effectiveDark);
      }
      ctx.restore();

      // Met également à jour le cache bitmap de déplacement en O(1) pour que le prochain Pan reste instantané
      if (staticInkCache.valid && staticInkCache.ctx && staticInkCache.pageId === page.id && staticInkCache.zoom === state.zoom) {
        const pad = staticInkCache.pad;
        const cacheWorldBounds = {
          minX: (-staticInkCache.originPanX - pad) / staticInkCache.zoom,
          minY: (-staticInkCache.originPanY - pad) / staticInkCache.zoom,
          maxX: (staticInkCache.viewW + pad - staticInkCache.originPanX) / staticInkCache.zoom,
          maxY: (staticInkCache.viewH + pad - staticInkCache.originPanY) / staticInkCache.zoom
        };
        const ib = itemType === 'stroke' ? getCachedStrokeBounds(item) : getShapeBoundingBox(item);
        const insideCache = !ib || (
          ib.minX >= cacheWorldBounds.minX &&
          ib.minY >= cacheWorldBounds.minY &&
          ib.maxX <= cacheWorldBounds.maxX &&
          ib.maxY <= cacheWorldBounds.maxY
        );
        if (!insideCache) {
          invalidateStaticInkCache();
        } else {
          const cCtx = staticInkCache.ctx;
          cCtx.save();
          cCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          cCtx.translate(staticInkCache.originPanX + staticInkCache.pad, staticInkCache.originPanY + staticInkCache.pad);
          cCtx.scale(state.zoom, state.zoom);
          if (itemType === 'stroke') {
            drawSingleStroke(cCtx, item, effectiveDark, false);
          } else if (itemType === 'shape') {
            drawGeometricShape(cCtx, item, false, effectiveDark);
          }
          cCtx.restore();
        }
      }
    }

    clearActiveCanvas();
    renderPerfStats.mergedStrokesCount++;
    const total = (page.strokes?.length || 0) + (page.shapes?.length || 0) + (page.texts?.length || 0);
    if (dom.strokeCountBadge) {
      dom.strokeCountBadge.textContent = `${total} élément${total > 1 ? 's' : ''}`;
    }
  }

  let lastBadgeTotalCount = -1;
  function renderScene() {
    const t0 = performance.now();
    const page = getActivePage();
    if (!page) return;
    const { dpr, rect } = ensureCanvasDimensionsSynced();

    syncWorldLayerTransform();

    // 1. CALQUE DE FOND VERROUILLÉ (#pdfBgCanvas) : Fond neutre GoodNotes + Empilement vertical A4 + PDF Haute Résolution
    if (bgCtx) {
      bgCtx.save();
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const boundedStack = getBoundedStackInfo(page);
      if (boundedStack) {
        bgCtx.fillStyle = getBoundedDeskBackdropColor();
        bgCtx.fillRect(0, 0, rect.width, rect.height);
        bgCtx.translate(state.panX, state.panY);
        bgCtx.scale(state.zoom, state.zoom);
        const viewMinY = -state.panY / state.zoom - 120;
        const viewMaxY = (rect.height - state.panY) / state.zoom + 120;
        for (let i = 0; i < boundedStack.items.length; i++) {
          const it = boundedStack.items[i];
          if (it.relY + it.height < viewMinY || it.relY > viewMaxY) continue;
          bgCtx.save();
          bgCtx.translate(it.relX, it.relY);
          drawPaperBackground(bgCtx, it.page, rect.width, rect.height, false, true);
          if (it.page.pdfId) {
            drawLockedPdfBackground(bgCtx, it.page, false);
          }
          bgCtx.restore();
        }
      } else {
        bgCtx.clearRect(0, 0, rect.width, rect.height);
        bgCtx.translate(state.panX, state.panY);
        bgCtx.scale(state.zoom, state.zoom);
        drawPaperBackground(bgCtx, page, rect.width, rect.height, false);
        if (page.pdfId) {
          drawLockedPdfBackground(bgCtx, page, false);
        }
      }
      bgCtx.restore();
    }

    // 2. CALQUE STATIQUE (#inkCanvas) : Tous les traits et formes déjà terminés (via cache bitmap rapide ou frustum culling)
    renderStaticInkLayerOnly();

    // 3. CALQUE ACTIF LÉGER (#activeInkCanvas) : Trait en cours / Forme en cours / Lasso / Laser
    if (activeCtx) {
      if (state.isDrawing || state.currentShape || state.currentTape || state.laserTrail.length > 0 || state.lassoPolygon.length > 0 || hasAnyLassoSelection() || activeCanvasDirty) {
        renderActiveCanvasOnly();
      }
    } else {
      updateLassoFloatingBarPosition();
    }
    if (state.selectedTextId || state.editingTextId) {
      updateTextEditFloatingBar();
    }

    renderPerfStats.staticRenderCount++;
    renderPerfStats.lastStaticRenderMs = performance.now() - t0;

    const total = (page.strokes?.length || 0) + (page.shapes?.length || 0) + (page.texts?.length || 0);
    if (total !== lastBadgeTotalCount && dom.strokeCountBadge) {
      lastBadgeTotalCount = total;
      dom.strokeCountBadge.textContent = `${total} élément${total > 1 ? 's' : ''}`;
    }
  }

  function drawLassoOverlay(targetCtx) {
    if (state.lassoPolygon.length > 1) {
      targetCtx.save();
      targetCtx.beginPath();
      targetCtx.moveTo(state.lassoPolygon[0].x, state.lassoPolygon[0].y);
      for (let i = 1; i < state.lassoPolygon.length; i++) targetCtx.lineTo(state.lassoPolygon[i].x, state.lassoPolygon[i].y);
      targetCtx.closePath();
      targetCtx.fillStyle = 'rgba(37, 99, 235, 0.08)';
      targetCtx.fill();
      targetCtx.lineWidth = 1.6 / state.zoom;
      targetCtx.strokeStyle = '#2563eb';
      targetCtx.setLineDash([6 / state.zoom, 4 / state.zoom]);
      targetCtx.stroke();
      targetCtx.restore();
    }
    if (state.selectionBounds && hasAnyLassoSelection()) {
      const b = state.selectionBounds;
      targetCtx.save();
      targetCtx.strokeStyle = '#1d4ed8';
      targetCtx.lineWidth = 1.8 / state.zoom;
      targetCtx.setLineDash([6 / state.zoom, 4 / state.zoom]);
      targetCtx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      targetCtx.setLineDash([]);
      const hs = 10 / state.zoom;
      [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]].forEach(([cx, cy], idx) => {
        targetCtx.fillStyle = idx === 3 ? '#1d4ed8' : '#ffffff';
        targetCtx.strokeStyle = '#1d4ed8';
        targetCtx.lineWidth = 2 / state.zoom;
        targetCtx.beginPath();
        targetCtx.rect(cx - hs / 2, cy - hs / 2, hs, hs);
        targetCtx.fill();
        targetCtx.stroke();
      });
      targetCtx.restore();
    }
  }

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

  const RADIAL_WHEEL_COLORS = [
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

  function renderRadialColorWheelSvg(activeHex) {
    if (!dom.radialWheelSvg) return;
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
      const d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${innerR} ${innerR} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
      markup += `<path class="radial-slice${isAct ? ' active-color' : ''}" data-wheel-idx="${i}" data-wheel-color="${c.hex}" data-wheel-label="${c.label}" d="${d}" fill="${c.hex}" stroke="rgba(255,255,255,0.65)" stroke-width="1.4" />`;
    }
    dom.radialWheelSvg.innerHTML = markup;
  }

  function openRadialColorWheelAt(clientX, clientY) {
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
    state.colorWheelTapMode = false;
    state.colorWheelHoveredColor = null;
    state.colorWheelCenterScreen = { x: vpRect.left + clampedX, y: vpRect.top + clampedY };

    dom.radialColorWheel.style.left = `${clampedX}px`;
    dom.radialColorWheel.style.top = `${clampedY}px`;
    dom.radialColorWheel.classList.remove('hidden', 'tap-mode');
    if (dom.radialCenterDot) dom.radialCenterDot.style.background = currentHex;
    if (dom.radialCenterLabel) dom.radialCenterLabel.textContent = 'Couleur';

    // Efface l'amorce de tracé lasso pour garder le canevas propre
    state.lassoPolygon = [];
    state.lassoAction = null;
    if (dom.pointerTypeBadge) dom.pointerTypeBadge.textContent = 'Roue de couleurs (glisser vers une teinte)';
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
    showToast(`Couleur : ${entry ? entry.label : hex}`);
  }

  function cancelColorWheelTimer() {
    if (state.colorWheelTimer) {
      clearTimeout(state.colorWheelTimer);
      state.colorWheelTimer = null;
    }
  }

  function scheduleRadialColorWheelCheck(clientX, clientY) {
    cancelColorWheelTimer();
    state.colorWheelAnchorScreen = { x: clientX, y: clientY };
    state.colorWheelTimer = setTimeout(() => {
      state.colorWheelTimer = null;
      if (!state.isDrawing || state.tool !== 'lasso' || state.lassoAction !== 'draw' || state.colorWheelOpen) return;
      openRadialColorWheelAt(state.colorWheelAnchorScreen.x, state.colorWheelAnchorScreen.y);
    }, 340);
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
    showToast(`✨ ${erasedCount} élément${erasedCount > 1 ? 's' : ''} effacé${erasedCount > 1 ? 's' : ''} par griffonnage`);
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
    const selStrokes = new Set();
    const selShapes = new Set();
    const selTexts = new Set();
    (page.strokes || []).forEach((s) => {
      const sb = getCachedStrokeBounds(s);
      if (sb && isPointInPolygon({ x: (sb.minX + sb.maxX) * 0.5, y: (sb.minY + sb.maxY) * 0.5 }, poly)) {
        selStrokes.add(s.id);
      }
    });
    (page.shapes || []).forEach((sh) => {
      const sb = getShapeBoundingBox(sh);
      if (sb && isPointInPolygon({ x: (sb.minX + sb.maxX) * 0.5, y: (sb.minY + sb.maxY) * 0.5 }, poly)) {
        selShapes.add(sh.id);
      }
    });
    (page.texts || []).forEach((t) => {
      const cx = (t.x || 0) + (t.width || 200) * 0.5;
      const cy = (t.y || 0) + 28;
      if (isPointInPolygon({ x: cx, y: cy }, poly)) selTexts.add(t.id);
    });

    const total = selStrokes.size + selShapes.size + selTexts.size;
    if (total === 0) return false;

    state.currentStroke = null;
    state.isDrawing = false;
    state.activePointerId = null;
    state.lassoPolygon = [];
    state.selectedIds = { strokes: selStrokes, shapes: selShapes, texts: selTexts };
    recomputeLassoSelectionBounds();
    state.tool = 'lasso';
    updateToolbarActiveState();
    clearActiveCanvas();
    invalidateStaticInkCache();
    requestRender();
    showToast(`✨ ${total} élément${total > 1 ? 's' : ''} sélectionné${total > 1 ? 's' : ''} au lasso`);
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
    showToast(`✨ ${detected.detectedName}`);
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
      e.target.closest('.radial-color-wheel')
    )) {
      return;
    }
    if (state.colorWheelOpen) {
      if (e.cancelable) e.preventDefault();
      if (state.colorWheelTapMode) {
        closeRadialColorWheel(true);
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
      state.touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (state.touchPoints.size >= 2) {
        cancelHoldShapeTimer();
        cancelColorWheelTimer();
        if (state.isDrawing) {
          state.isDrawing = false;
          state.currentStroke = null;
          state.currentShape = null;
          state.currentStrokeSnappedFromAutoShape = false;
          state.activePointerId = null;
          clearActiveCanvas();
        }
        state.isPinching = true;
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
    if (isPenEraserButton(e)) {
      if (!state.temporaryEraserOverride) {
        state.previousToolBeforeEraser = state.tool === 'eraser' ? 'pen' : state.tool;
      }
      state.temporaryEraserOverride = true;
      state.tool = 'eraser';
      updateToolbarActiveState();
    } else if (isPenLassoButton(e)) {
      if (!state.temporaryLassoOverride) {
        state.previousToolBeforeLasso = state.tool === 'lasso' ? 'pen' : state.tool;
      }
      state.temporaryLassoOverride = true;
      state.tool = 'lasso';
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

    // Si une sélection Lasso est active (ex. après cercle-lasso, 2e bouton du stylet ou duplication),
    // cliquer/glisser dans le cadre de sélection déplace ou redimensionne directement les éléments au lieu de dessiner par-dessus
    if (
      state.tool !== 'eraser' &&
      state.tool !== 'pan' &&
      state.tool !== 'lasso' &&
      tryStartLassoSelectionTransform(worldPt)
    ) {
      cancelPendingPageSave(page.id);
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
      try { if (typeof e.pointerId === 'number') dom.inkCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      updateLassoFloatingBarPosition();
      renderActiveCanvasOnly();
      return;
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
    cancelPendingPageSave(page.id);

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
      pushHistorySnapshot();
      updateEraserCursor(e.clientX, e.clientY, true);
      updateColorDotCursor(e.clientX, e.clientY, false);
      applyEraserAtPoint(worldPt.x, worldPt.y);
      requestRender();
    } else if (state.tool === 'lasso') {
      handleLassoPointerDown(worldPt);
      if (state.lassoAction === 'draw') {
        scheduleRadialColorWheelCheck(e.clientX, e.clientY);
      }
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
      if (performance.now() - state.lastPointerUpTime < 40) return;
      const tipActive = e.pointerType === 'pen' ? (e.pressure > 0.02 || (e.buttons & 1) !== 0) : false;
      const hoverBarrelAllowed = e.pointerType === 'pen' && !state.waitBarrelReleaseBeforeHoverTrigger &&
        (isPenEraserButton(e) || isPenLassoButton(e));
      const isStylusOrTouchContact =
        (e.pointerType === 'pen' && (tipActive || hoverBarrelAllowed)) ||
        (e.pointerType === 'mouse' && e.buttons === 1);
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
      for (const ce of coalesced) {
        const wPt = clampPointToPage(activePageForMove, screenToWorld(ce.clientX, ce.clientY));
        applyEraserAtPoint(wPt.x, wPt.y);
      }
      requestRender();
    } else if (state.tool === 'lasso') {
      if (state.lassoAction === 'draw' && state.colorWheelAnchorScreen) {
        const travel = Math.hypot(e.clientX - state.colorWheelAnchorScreen.x, e.clientY - state.colorWheelAnchorScreen.y);
        if (travel > 14) cancelColorWheelTimer();
      }
      handleLassoPointerMove(clampPointToPage(activePageForMove, screenToWorld(e.clientX, e.clientY)));
      if (state.lassoAction === 'draw') renderActiveCanvasOnly();
      else requestRender();
    }
  }

  function handlePointerUpOrCancel(e) {
    state.lastPointerUpTime = performance.now();
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
          snapBackBoundedViewportIfZoomedOut();
        }
      }
    }

    if (state.isPanning && (e.pointerId === state.activePointerId || state.activePointerId === null)) {
      state.isPanning = false;
      state.activePointerId = null;
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

    if (!state.isDrawing) return;
    if (state.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== state.activePointerId) return;

    if (state.textBoxCreateDrag) {
      const td = state.textBoxCreateDrag;
      state.textBoxCreateDrag = null;
      state.isDrawing = false;
      state.activePointerId = null;
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
              const detName = instantDetected.detectedName;
              const isConnected = Boolean(instantDetected.startConnection || instantDetected.endConnection);
              delete instantDetected.detectedName;
              page.shapes.push(instantDetected);
              state.currentStroke = null;
              state.currentShape = null;
              mergeCompletedItemIntoStaticCanvas(instantDetected, 'shape');
              mergedDirectlyIntoStatic = true;
              scheduleSaveActivePage(page);
              if (detName) showToast(isConnected ? `🔗 ${detName} connecté` : `✨ ${detName}`);
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
        scheduleSaveActivePage(page);
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
      state.temporaryLassoOverride = false;
      if (isPenEraserButton(e) || isPenLassoButton(e)) state.waitBarrelReleaseBeforeHoverTrigger = true;
      state.tool = state.previousToolBeforeLasso || 'pen';
      updateToolbarActiveState();
    }
    if (!mergedDirectlyIntoStatic) {
      requestRender();
    }
  }

  function updateEraserCursor(clientX, clientY, visible) {
    if (!visible) {
      dom.eraserCursor.style.display = 'none';
      return;
    }
    const d = Math.max(4, state.eraserSize * 2 * state.zoom);
    dom.eraserCursor.style.display = 'block';
    dom.eraserCursor.style.width = `${d}px`;
    dom.eraserCursor.style.height = `${d}px`;
    dom.eraserCursor.style.left = `${clientX}px`;
    dom.eraserCursor.style.top = `${clientY}px`;
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

  function updateColorDotCursor(clientX, clientY, visible) {
    if (!dom.colorDotCursor) return;
    if (!visible) {
      dom.colorDotCursor.style.display = 'none';
      return;
    }
    dom.colorDotCursor.style.backgroundColor = getActiveCursorColor();
    dom.colorDotCursor.style.display = 'block';
    dom.colorDotCursor.style.left = `${clientX}px`;
    dom.colorDotCursor.style.top = `${clientY}px`;
  }

  function canEraserEraseStroke(s) {
    if (!s) return false;
    if (state.eraserHighlighterOnly) return s.tool === 'highlighter';
    const f = state.eraserFilters || { pen: true, pencil: true, highlighter: true, tape: true };
    if (s.tool === 'highlighter') return f.highlighter !== false;
    if (s.tool === 'pencil' || s.penStyle === 'ballpoint' || s.penStyle === 'pencil') return f.pencil !== false;
    return f.pen !== false;
  }

  function canEraserEraseShape(sh) {
    if (!sh) return false;
    if (state.eraserHighlighterOnly) return Boolean(sh.isHighlighter);
    const f = state.eraserFilters || { pen: true, pencil: true, highlighter: true, tape: true };
    if (sh.isHighlighter) return f.highlighter !== false;
    return f.pen !== false;
  }

  function applyEraserAtPoint(wx, wy) {
    const page = getActivePage();
    if (!page) return;
    const radius = state.eraserSize;
    const rSq = radius * radius;
    const hlOnly = Boolean(state.eraserHighlighterOnly);
    let changed = false;

    if (state.eraserMode === 'stroke') {
      const beforeLen = (page.strokes || []).length;
      page.strokes = (page.strokes || []).filter((s) => {
        if (!canEraserEraseStroke(s)) return true;
        const b = getCachedStrokeBounds(s);
        if (b && (wx < b.minX - radius || wx > b.maxX + radius || wy < b.minY - radius || wy > b.maxY + radius)) {
          return true;
        }
        const pts = s.points || [];
        for (let i = 0; i < pts.length; i++) {
          const pt = pts[i];
          if ((pt.x - wx) ** 2 + (pt.y - wy) ** 2 <= rSq) return false;
          if (i > 0 && pointToSegmentDist({ x: wx, y: wy }, pts[i - 1], pt) <= radius) return false;
        }
        return true;
      });
      if (page.strokes.length !== beforeLen) changed = true;
    } else {
      const next = [];
      for (const s of page.strokes || []) {
        if (!canEraserEraseStroke(s)) {
          next.push(s);
          continue;
        }
        const b = getCachedStrokeBounds(s);
        if (b && (wx < b.minX - radius || wx > b.maxX + radius || wy < b.minY - radius || wy > b.maxY + radius)) {
          next.push(s);
          continue;
        }
        const pts = s.points || [];
        let seg = [];
        let mod = false;
        const pushSubStroke = (pointsArr) => {
          if (pointsArr.length < 2) return;
          const sub = cloneStrokeFast(s);
          sub.id = createUid('st');
          sub.points = pointsArr;
          sub._bounds = null;
          invalidateStrokeCache(sub);
          next.push(sub);
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

        if (!mod) {
          next.push(s);
        } else {
          changed = true;
          if (seg.length >= 2) pushSubStroke(seg);
        }
      }
      page.strokes = next;
    }

    const prevShapesLen = (page.shapes || []).length;
    page.shapes = (page.shapes || []).filter((sh) => {
      if (!canEraserEraseShape(sh)) return true;
      return !isPointNearShape(sh, wx, wy, radius);
    });
    if (page.shapes.length !== prevShapesLen) {
      changed = true;
      updateConnectedShapesForPage(page);
    }

    const canEraseTape = !hlOnly && (!state.eraserFilters || state.eraserFilters.tape !== false);
    if (canEraseTape) {
      const prevTapesLen = (page.tapes || []).length;
      if (prevTapesLen > 0) {
        page.tapes = page.tapes.filter((tp) => !isPointOnTape(tp, wx, wy, radius));
        if (page.tapes.length !== prevTapesLen) changed = true;
      }
    }

    if (changed) invalidateStaticInkCache();
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
    return state.selectedIds.strokes.size > 0 || state.selectedIds.shapes.size > 0 || state.selectedIds.texts.size > 0;
  }
  function clearLassoSelection() {
    state.lassoPolygon = [];
    state.selectedIds.strokes.clear();
    state.selectedIds.shapes.clear();
    state.selectedIds.texts.clear();
    state.selectionBounds = null;
    state.lassoAction = null;
    updateLassoToolbarBadge();
    updateLassoFloatingBarPosition();
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
  }

  function handleLassoPointerUp() {
    const page = getActivePage();
    if (!page) return;
    if (state.lassoAction === 'draw') {
      if (state.lassoPolygon.length >= 3) {
        (page.strokes || []).forEach((s) => {
          const inside = s.points.filter((p) => pointInPolygon(p.x, p.y, state.lassoPolygon)).length;
          if (inside > 0 && inside >= Math.min(2, s.points.length * 0.25)) state.selectedIds.strokes.add(s.id);
        });
        (page.shapes || []).forEach((sh) => {
          const verts = getShapeVertices(sh);
          const samples = verts ? [...verts, { x: (sh.x1 + sh.x2) / 2, y: (sh.y1 + sh.y2) / 2 }] : [
            { x: (sh.x1 + sh.x2) / 2, y: (sh.y1 + sh.y2) / 2 },
            { x: sh.x1, y: sh.y1 },
            { x: sh.x2, y: sh.y2 }
          ];
          if (samples.some((pt) => pointInPolygon(pt.x, pt.y, state.lassoPolygon))) state.selectedIds.shapes.add(sh.id);
        });
        (page.texts || []).forEach((tb) => {
          if (pointInPolygon(tb.x + 30, tb.y + 15, state.lassoPolygon)) state.selectedIds.texts.add(tb.id);
        });
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
  }

  function updateLassoToolbarBadge() {
    const total = state.selectedIds.strokes.size + state.selectedIds.shapes.size + state.selectedIds.texts.size;
    const has = total > 0;
    dom.lassoSelectionBadge.textContent = has ? `${total} sélectionné${total > 1 ? 's' : ''}` : 'Entourez des traits';
    dom.btnDuplicateSelection.disabled = !has;
    dom.btnScaleUpSelection.disabled = !has;
    dom.btnScaleDownSelection.disabled = !has;
    dom.btnDeleteSelection.disabled = !has;
    if (state.tool === 'lasso' && dom.activeToolSummaryText) {
      dom.activeToolSummaryText.textContent = has ? `${total} sél.` : 'Options';
    }
  }

  function duplicateLassoSelection() {
    const page = getActivePage();
    if (!page || !hasAnyLassoSelection()) return;
    pushHistorySnapshot();
    const ns = new Set(), nsh = new Set(), nt = new Set(), off = 28;
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
        const c = { ...tb, id: createUid('tx'), x: tb.x + off, y: tb.y + off };
        page.texts.push(c); nt.add(c.id);
      }
    });
    state.selectedIds.strokes = ns; state.selectedIds.shapes = nsh; state.selectedIds.texts = nt;
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
    pushHistorySnapshot();
    page.strokes = (page.strokes || []).filter((s) => !state.selectedIds.strokes.has(s.id));
    page.shapes = (page.shapes || []).filter((sh) => !state.selectedIds.shapes.has(sh.id));
    page.texts = (page.texts || []).filter((tb) => !state.selectedIds.texts.has(tb.id));
    invalidateStaticInkCache();
    clearLassoSelection();
    renderWorldTextCards();
    requestRender();
    scheduleSaveActivePage();
    showToast('Sélection supprimée');
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

    if (numPages > MAX_PDF_IMPORT_PAGES) {
      if (pdfDoc && typeof pdfDoc.destroy === 'function') {
        try { await pdfDoc.destroy(); } catch (_) {}
      }
      throw new Error(`Ce PDF contient ${numPages} pages. La limite maximale est fixée à ${MAX_PDF_IMPORT_PAGES} pages par import pour garantir la fluidité et préserver la mémoire RAM.`);
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

    const savePromise = (async () => {
      try {
        targetPage.thumbnail = generatePageThumbnail(targetPage);
        targetPage.updatedAt = Date.now();
        await db.savePage(targetPage);
        await db.saveWorkspaceState({ activeNotebookId: state.activeNotebookId, activePageId: state.activePageId });
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
    const copiedPages = srcPages.map((pg, idx) => {
      const cloned = clonePageContent(pg);
      return {
        ...pg,
        id: createUid('pg'),
        notebookId: copyNb.id,
        order: idx,
        strokes: cloned.strokes,
        shapes: cloned.shapes,
        textCards: cloned.textCards,
        tapes: cloned.tapes,
        images: cloned.images,
        createdAt: now,
        updatedAt: now
      };
    });
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

    const entries = Array.isArray(nb.outline) && nb.outline.length > 0
      ? nb.outline
      : pages.map((p, idx) => ({
          id: `auto_${p.id}`,
          pageId: p.id,
          title: p.title || `Page ${idx + 1}`,
          level: 1,
          isAuto: true
        }));

    entries.forEach((entry) => {
      const pageIdx = pages.findIndex((p) => p.id === entry.pageId);
      if (pageIdx < 0) return;
      const item = document.createElement('div');
      item.className = `gn-outline-item${pages[pageIdx].id === state.activePageId ? ' active' : ''}`;
      item.style.paddingLeft = `${10 + ((entry.level || 1) - 1) * 14}px`;
      item.innerHTML = `
        <span class="gn-outline-title">${escapeHtml(entry.title)}</span>
        <span class="gn-outline-page">p.${pageIdx + 1}</span>
      `;
      item.addEventListener('click', () => selectPage(entry.pageId));
      outlineList.appendChild(item);
    });
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
            duplicatePageById(p.id);
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

  async function createNotebookProgrammatically(title, paperType = 'grid', coverColor = state.newNotebookCover, templatePageOrOptions = null) {
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
      starred: false,
      coverColor: coverColor || '#1d4ed8',
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

    for (const pdfId of pdfIdsToCheck) {
      if (!isPdfIdStillReferenced(pdfId)) {
        await destroyPdfDocumentResources(pdfId, true);
      }
    }

    await db.deleteNotebook(nbId);
    if (state.activeNotebookId === nbId) {
      selectNotebook(state.notebooks[0].id);
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
      // Ouvre directement la sous-barre flottante GoodNotes au clic utilisateur sur Formes, Gomme ou Texte (mais reste fermé par défaut au démarrage / autres outils)
      state.toolOptionsOpen = Boolean((t === 'shape' || t === 'eraser' || t === 'text') && toggleOptionsIfSame);
    }
    if (state.tool === 'pen' || state.tool === 'pencil' || state.tool === 'highlighter') {
      state.previousWritingTool = state.tool;
    }
    if (state.tool !== 'lasso') clearLassoSelection();
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
    const showGnSubBar = Boolean(state.toolOptionsOpen && isGnPenBarTool);
    const showGnShapeBar = Boolean(state.toolOptionsOpen && isGnShapeBarTool);
    const showGnEraserBar = Boolean(state.toolOptionsOpen && isGnEraserBarTool);
    const showGnTextBar = Boolean(state.toolOptionsOpen && isGnTextBarTool);
    const showDock = Boolean(state.toolOptionsOpen && state.tool !== 'pan' && !isGnPenBarTool && !isGnShapeBarTool && !isGnEraserBarTool && !isGnTextBarTool);
    dom.toolOptionsDock.classList.toggle('hidden', !showDock);
    const gnSubBarEl = document.getElementById('gnPenSubBar');
    if (gnSubBarEl) gnSubBarEl.classList.toggle('hidden', !showGnSubBar);
    const gnShapeBarEl = document.getElementById('gnShapeSubBar');
    if (gnShapeBarEl) gnShapeBarEl.classList.toggle('hidden', !showGnShapeBar);
    const gnEraserBarEl = document.getElementById('gnEraserSubBar');
    if (gnEraserBarEl) gnEraserBarEl.classList.toggle('hidden', !showGnEraserBar);
    const gnTextBarEl = document.getElementById('gnTextSubBar');
    if (gnTextBarEl) gnTextBarEl.classList.toggle('hidden', !showGnTextBar);
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
    if (dom.btnToggleToolOptions) {
      dom.btnToggleToolOptions.classList.toggle('open', showDock || showGnSubBar || showGnShapeBar || showGnEraserBar || showGnTextBar);
      dom.btnToggleToolOptions.setAttribute('aria-expanded', String(showDock || showGnSubBar || showGnShapeBar || showGnEraserBar || showGnTextBar));
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
      ? anchorEl.closest('.gn-pen-subbar, .gn-shape-subbar, .gn-eraser-subbar, .gn-text-subbar')
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
    const preferAbove = Boolean(document.body && document.body.classList && document.body.classList.contains('toolbar-pos-bottom') && barR);
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
        ? anchorEl.closest('.gn-pen-subbar, .gn-shape-subbar, .gn-eraser-subbar, .gn-text-subbar')
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
      const preferAbove = Boolean(document.body && document.body.classList && document.body.classList.contains('toolbar-pos-bottom') && barR);
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

  function bindEvents() {
    bindGoodNotesPenSubBarEvents();
    bindGoodNotesTextSubBarEvents();
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
        const start = ta.selectionStart || ta.value.length;
        const end = ta.selectionEnd || ta.value.length;
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
              await importPdfFromBuffer(uint8.buffer, fileName, mode);
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
            await importPdfFromBuffer(buf, f.name, mode);
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
          await importPdfFromBuffer(sampleBytes, 'Cours-Equations-Differentielles.pdf', 'new-notebook');
        } catch (_) {
          showToast('Erreur lors de la génération du PDF d\'exemple', 'error');
        }
      });
    }

    if (dom.btnConfirmPdfNewNotebook) {
      dom.btnConfirmPdfNewNotebook.addEventListener('click', async () => {
        if (state.pendingPdfImport && state.pendingPdfImport.bytes) {
          try {
            await importPdfFromBuffer(state.pendingPdfImport.bytes, state.pendingPdfImport.fileName, 'new-notebook');
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
            await importPdfFromBuffer(state.pendingPdfImport.bytes, state.pendingPdfImport.fileName, 'current-notebook');
          } catch (_) {}
        } else if (dom.inputImportPdf) {
          autoImportModeAfterFilePick = 'current-notebook';
          dom.inputImportPdf.click();
        }
      });
    }

    dom.btnThemeToggle.addEventListener('click', () => {
      const h = document.documentElement;
      h.setAttribute('data-theme', h.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      if (virtualRulerState.visible) renderVirtualRuler();
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
      dom.btnQuickAddPage.addEventListener('click', () => addNewPageToActiveNotebook());
    }
    if (dom.btnNewPageSidebar) {
      dom.btnNewPageSidebar.addEventListener('click', () => addNewPageToActiveNotebook());
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
        showToast('Page infinie étendue ! Déplacez-vous librement ou pincez pour zoomer.');
      });
    }
    if (dom.btnFitPage) {
      dom.btnFitPage.addEventListener('click', fitPageToViewport);
    }

    dom.btnNewNotebook.addEventListener('click', () => {
      dom.inputNotebookName.value = '';
      dom.modalNewNotebook.classList.remove('hidden');
    });
    const closeNb = () => {
      closeGnColorPopover();
      dom.modalNewNotebook.classList.add('hidden');
    };
    dom.btnCloseNotebookModal.addEventListener('click', closeNb);
    dom.btnCancelNotebookModal.addEventListener('click', closeNb);
    dom.notebookCoverSwatches.forEach((sw) => sw.addEventListener('click', () => {
      state.newNotebookCover = sw.dataset.cover;
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
    dom.btnCreateNotebookConfirm.addEventListener('click', async () => {
      const title = dom.inputNotebookName.value.trim() || `Cahier ${state.notebooks.length + 1}`;
      const paperType = dom.selectDefaultPaper.value || 'grid';
      closeNb();
      await createNotebookProgrammatically(title, paperType, state.newNotebookCover);
      if (state.filesPageOpen && typeof closeFilesPage === 'function') {
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
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') {
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
      if (e.code === 'Space' && !state.isSpacePressed) { state.isSpacePressed = true; dom.canvasViewport.classList.add('pan-cursor'); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) performRedo(); else performUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); performRedo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSb(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedShapeId) { e.preventDefault(); deleteSelectedShape(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && hasAnyLassoSelection()) { e.preventDefault(); deleteLassoSelection(); return; }
      const k = e.key.toLowerCase();
      if (k === 'p') setActiveTool('pen');
      else if (k === 'h') setActiveTool('highlighter');
      else if (k === 'e') setActiveTool('eraser');
      else if (k === 'l') setActiveTool('lasso');
      else if (k === 't') setActiveTool('text');
      else if (k === 's') setActiveTool('shape');
      else if (k === 'r') toggleVirtualRuler();
      else if (k === 'm') openLatexModalForCard(null, null);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { state.isSpacePressed = false; if (state.tool !== 'pan') dom.canvasViewport.classList.remove('pan-cursor'); }
    });
    window.addEventListener('blur', () => {
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
    if (typeof document !== 'undefined' && document.documentElement) {
      if (typeof document.documentElement.setAttribute === 'function') {
        document.documentElement.setAttribute('data-fullscreen', isWindowFullscreen ? 'true' : 'false');
      }
      if (document.documentElement.classList) {
        document.documentElement.classList.toggle('is-fullscreen', isWindowFullscreen);
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
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestRender());
          }
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

  // ============================================================================
  // 18. EXTENSIONS GOODNOTES : DOSSIERS, IMAGES, FENÊTRE DE ZOOM & GOOGLE DRIVE
  // ============================================================================

  function openMoveNotebookModal(nbOrItems) {
    const modal = document.getElementById('modalMoveNotebook');
    const select = document.getElementById('selectTargetFolder');
    if (!modal || !select || !nbOrItems) return;
    const items = Array.isArray(nbOrItems)
      ? nbOrItems
      : (nbOrItems.type ? [nbOrItems] : [{ type: 'nb', id: nbOrItems.id }]);
    state.movingItems = items;
    state.movingNotebookId = items.length === 1 && items[0].type === 'nb' ? items[0].id : null;
    const movingFolderIds = new Set(items.filter((x) => x.type === 'fld').map((x) => x.id));
    select.innerHTML = `<option value="">📁 Documents (Racine)</option>`;
    (state.folders || []).filter((f) => !f.trashedAt).forEach((f) => {
      for (const fid of movingFolderIds) {
        if (isFolderDescendant(f.id, fid)) return;
      }
      const pathLabel = getFolderPath(f.id).map((x) => x.name).join(' › ');
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `📁 ${pathLabel}`;
      if (items.length === 1 && items[0].type === 'nb') {
        const nb = state.notebooks.find((n) => n.id === items[0].id);
        if (nb && (nb.folderId || '') === f.id) opt.selected = true;
      } else if (items.length === 1 && items[0].type === 'fld') {
        const fld = (state.folders || []).find((x) => x.id === items[0].id);
        if (fld && (fld.parentId || '') === f.id) opt.selected = true;
      }
      select.appendChild(opt);
    });
    modal.classList.remove('hidden');
  }

  function insertImageToActivePage(dataUrl, naturalW = 320, naturalH = 220) {
    const page = getActivePage();
    if (!page || !dataUrl) return;
    const rect = dom.canvasViewport.getBoundingClientRect();
    const center = screenToWorld(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
    const maxW = 380;
    const scale = naturalW > maxW ? maxW / naturalW : 1;
    const w = Math.max(80, Math.round(naturalW * scale));
    const h = Math.max(60, Math.round(naturalH * scale));
    if (!Array.isArray(page.images)) page.images = [];
    pushHistorySnapshot(page);
    page.images.push({
      id: createUid('img'),
      x: Math.round(center.x - w * 0.5),
      y: Math.round(center.y - h * 0.5),
      width: w,
      height: h,
      src: dataUrl,
      origSrc: dataUrl
    });
    renderWorldTextCards();
    scheduleSaveActivePage(page);
    showToast('Image ajoutée sur la page !');
  }

  function readFileAsImageAndInsert(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      const img = new Image();
      img.onload = () => insertImageToActivePage(src, img.naturalWidth || 320, img.naturalHeight || 220);
      img.onerror = () => insertImageToActivePage(src, 320, 220);
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  // --- Sauvegarde & Restauration Google Drive (Local Drive Desktop + Drive API v3) ---
  function buildFullBackupPayload() {
    const allPages = [];
    for (const list of state.pagesByNotebook.values()) {
      for (const p of list) allPages.push(p);
    }
    return {
      format: 'plume-studio-goodnotes-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      folders: state.folders || [],
      notebooks: state.notebooks || [],
      pages: allPages
    };
  }

  async function restoreFullBackupPayload(data) {
    if (!data || !Array.isArray(data.notebooks) || !Array.isArray(data.pages)) {
      throw new Error('Format de sauvegarde invalide.');
    }
    if (Array.isArray(data.folders)) {
      state.folders = data.folders;
      await db.saveFolders(state.folders);
    }
    for (const nb of data.notebooks) await db.saveNotebook(nb);
    for (const pg of data.pages) await db.savePage(pg);
    await loadFromIndexedDB();
    showToast('Sauvegarde restaurée avec succès !');
  }

  function updateGdriveStatusUi(text, connected = false) {
    const txt = document.getElementById('gdriveStatusText');
    const dot = document.getElementById('gdriveStatusDot');
    const banner = document.getElementById('gdriveStatusBanner');
    if (txt) txt.textContent = text;
    if (dot) dot.style.background = connected ? '#16a34a' : '#94a3b8';
    if (banner && banner.classList) banner.classList.toggle('is-connected', Boolean(connected));
  }

  async function syncToLocalDriveFolderNow() {
    if (!state.gdriveLocalDirHandle) {
      showToast('Choisissez d’abord un dossier Google Drive local.');
      return;
    }
    try {
      const payload = JSON.stringify(buildFullBackupPayload());
      const latestHandle = await state.gdriveLocalDirHandle.getFileHandle('inkflow-backup-latest.plume.json', { create: true });
      const writable = await latestHandle.createWritable();
      await writable.write(payload);
      await writable.close();
      state.gdriveLastSyncAt = Date.now();
      const timeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      updateGdriveStatusUi(`Dossier Drive synchronisé (${state.gdriveLocalDirHandle.name}) — Dernière sauvegarde à ${timeStr}`, true);
      showToast('Sauvegardé dans le dossier Google Drive !');
    } catch (err) {
      showToast(`Erreur sauvegarde dossier Drive : ${err.message || err}`);
    }
  }

  async function ensureGdriveBackupFolderId(token) {
    const q = encodeURIComponent("name='Inkflow Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!listRes.ok) throw new Error(`Google Drive API (${listRes.status})`);
    const listData = await listRes.json();
    if (listData.files && listData.files.length > 0) return listData.files[0].id;

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Inkflow Backups', mimeType: 'application/vnd.google-apps.folder' })
    });
    if (!createRes.ok) throw new Error(`Création dossier Drive (${createRes.status})`);
    const created = await createRes.json();
    return created.id;
  }

  async function backupToGoogleDriveApiNow() {
    const token = state.gdriveAccessToken;
    if (!token) {
      showToast('Connectez Google Drive (ou collez un Access Token / choisissez le dossier Drive local).');
      return;
    }
    try {
      updateGdriveStatusUi('Sauvegarde sur Google Drive en cours...', true);
      const folderId = await ensureGdriveBackupFolderId(token);
      const fileName = `inkflow-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.plume.json`;
      const metadata = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const bodyJson = JSON.stringify(buildFullBackupPayload());
      const boundary = '-------inkflow314159265';
      const multipartBody =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${bodyJson}\r\n--${boundary}--`;
      const upRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });
      if (!upRes.ok) throw new Error(`Upload Drive (${upRes.status})`);
      state.gdriveLastSyncAt = Date.now();
      const timeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      updateGdriveStatusUi(`Connecté à Google Drive — Dernière sauvegarde à ${timeStr}`, true);
      showToast(`Sauvegardé sur Google Drive (${fileName}) !`);
    } catch (err) {
      updateGdriveStatusUi(`Erreur Google Drive : ${err.message || err}`, false);
      showToast(`Erreur Google Drive : ${err.message || err}`);
    }
  }

  async function listGoogleDriveBackups() {
    const listEl = document.getElementById('gdriveBackupsList');
    const token = state.gdriveAccessToken;
    if (!token) {
      showToast('Connectez Google Drive d’abord.');
      return;
    }
    if (listEl) listEl.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);">Chargement...</div>';
    try {
      const folderId = await ensureGdriveBackupFolderId(token);
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=12&fields=files(id,name,modifiedTime,size)`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Liste Drive (${res.status})`);
      const data = await res.json();
      const files = data.files || [];
      if (!listEl) return;
      if (files.length === 0) {
        listEl.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);">Aucune sauvegarde dans Inkflow Backups.</div>';
        return;
      }
      listEl.innerHTML = '';
      files.forEach((f) => {
        const row = document.createElement('div');
        row.className = 'gn-gdrive-backup-row';
        const kb = f.size ? `${Math.round(Number(f.size) / 1024)} Ko` : '';
        row.innerHTML = `<span>${escapeHtml(f.name)} ${kb ? `(${kb})` : ''}</span><button class="btn-small-action" type="button">Restaurer</button>`;
        row.querySelector('button').addEventListener('click', async () => {
          try {
            const dl = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?alt=media`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!dl.ok) throw new Error(`Téléchargement (${dl.status})`);
            const json = await dl.json();
            await restoreFullBackupPayload(json);
            const modal = document.getElementById('modalGoogleDrive');
            if (modal) modal.classList.add('hidden');
          } catch (e2) {
            showToast(`Erreur restauration : ${e2.message || e2}`);
          }
        });
        listEl.appendChild(row);
      });
    } catch (err) {
      if (listEl) listEl.innerHTML = `<div style="font-size:11px;color:#dc2626;">${escapeHtml(err.message || String(err))}</div>`;
    }
  }

  function openFolderCustomizeModal(existingFolder = null) {
    const modal = document.getElementById('modalFolderCustomize');
    const titleEl = document.getElementById('modalFolderCustomizeTitle');
    const nameInput = document.getElementById('inputFolderCustomizeName');
    if (!modal || !nameInput) {
      openRenameModal(
        existingFolder ? 'Renommer le dossier' : 'Nouveau dossier',
        existingFolder ? existingFolder.name : 'Nouveau dossier',
        (name) => {
          if (existingFolder) {
            existingFolder.name = name;
          } else {
            const palette = ['#0072ce', '#7c3aed', '#0d9488', '#d97706', '#e11d48', '#2563eb'];
            state.folders.push({
              id: createUid('fld'),
              name,
              parentId: state.currentFolderId || null,
              color: palette[state.folders.length % palette.length],
              icon: 'folder',
              starred: false,
              createdAt: Date.now()
            });
          }
          db.saveFolders(state.folders);
          renderNotebooksSidebar();
        }
      );
      return;
    }

    state.editingFolderId = existingFolder ? existingFolder.id : null;
    state.folderModalColor = existingFolder ? (existingFolder.color || '#0072ce') : '#0072ce';
    state.folderModalIcon = existingFolder ? (existingFolder.icon || 'folder') : 'folder';
    if (titleEl) titleEl.textContent = existingFolder ? 'Personnaliser le dossier' : 'Nouveau dossier';
    nameInput.value = existingFolder ? existingFolder.name : 'Nouveau dossier';

    document.querySelectorAll('#folderColorSwatches [data-folder-color]').forEach((sw) => {
      sw.classList.toggle('active', sw.dataset.folderColor.toLowerCase() === state.folderModalColor.toLowerCase());
    });
    document.querySelectorAll('#folderSymbolPills [data-folder-icon]').forEach((pill) => {
      pill.classList.toggle('active', pill.dataset.folderIcon === state.folderModalIcon);
    });

    modal.classList.remove('hidden');
    setTimeout(() => { nameInput.focus(); nameInput.select(); }, 20);
  }

  function closeFolderCustomizeModal() {
    const modal = document.getElementById('modalFolderCustomize');
    if (modal) modal.classList.add('hidden');
    state.editingFolderId = null;
  }

  // ============================================================================
  // 18. PAGE PLEIN ÉCRAN : GESTIONNAIRE DE FICHIERS GOODNOTES 6 (#gnFilesPage)
  // Architecture calquée sur GoodNotes for Windows 2.4.6 (analysé via REA)
  // ============================================================================

  let draggedFilesItem = null; // { type: 'nb' | 'fld', id: string }

  function closeGnFilesMenus() {
    const newMenu = document.getElementById('gnFilesNewMenu');
    const ctxMenu = document.getElementById('gnFilesContextMenu');
    if (newMenu) newMenu.classList.add('hidden');
    if (ctxMenu) ctxMenu.classList.add('hidden');
  }

  function positionGnFilesPopover(popoverEl, anchorRectOrPoint) {
    if (!popoverEl) return;
    popoverEl.classList.remove('hidden');
    const vw = typeof window !== 'undefined' ? (window.innerWidth || 1280) : 1280;
    const vh = typeof window !== 'undefined' ? (window.innerHeight || 800) : 800;
    const pw = popoverEl.offsetWidth || 252;
    const ph = popoverEl.offsetHeight || 240;
    let left = anchorRectOrPoint.left ?? anchorRectOrPoint.x ?? 120;
    let top = (anchorRectOrPoint.bottom !== undefined ? anchorRectOrPoint.bottom + 6 : (anchorRectOrPoint.y ?? 120));
    if (left + pw > vw - 14) left = Math.max(14, vw - pw - 14);
    if (top + ph > vh - 14) top = Math.max(14, (anchorRectOrPoint.top ?? top) - ph - 6);
    popoverEl.style.left = `${Math.round(left)}px`;
    popoverEl.style.top = `${Math.round(top)}px`;
  }

  function openGnFilesNewMenu(anchorEl) {
    const newMenu = document.getElementById('gnFilesNewMenu');
    const ctxMenu = document.getElementById('gnFilesContextMenu');
    if (ctxMenu) ctxMenu.classList.add('hidden');
    if (!newMenu) return;
    const rect = anchorEl && typeof anchorEl.getBoundingClientRect === 'function'
      ? anchorEl.getBoundingClientRect()
      : { left: 280, bottom: 110, top: 80 };
    positionGnFilesPopover(newMenu, rect);
  }

  function openGnFilesContextMenu(itemType, item, anchorPoint) {
    const ctxMenu = document.getElementById('gnFilesContextMenu');
    const newMenu = document.getElementById('gnFilesNewMenu');
    if (newMenu) newMenu.classList.add('hidden');
    if (!ctxMenu || !item) return;

    const isTrashed = Boolean(item.trashedAt);
    const entries = [];
    if (itemType === 'fld') {
      if (isTrashed) {
        entries.push({ act: 'restore', label: 'Restaurer le dossier' });
        entries.push({ sep: true });
        entries.push({ act: 'purge', label: 'Supprimer définitivement', danger: true });
      } else {
        entries.push({ act: 'open', label: 'Ouvrir le dossier' });
        entries.push({ act: 'customize', label: 'Couleur & symbole...' });
        entries.push({ act: 'rename', label: 'Renommer' });
        entries.push({ act: 'star', label: item.starred ? 'Retirer des favoris' : 'Ajouter aux favoris' });
        entries.push({ act: 'move', label: 'Déplacer vers...' });
        entries.push({ sep: true });
        entries.push({ act: 'trash', label: 'Mettre à la corbeille', danger: true });
      }
    } else {
      if (isTrashed) {
        entries.push({ act: 'restore', label: 'Restaurer le cahier' });
        entries.push({ sep: true });
        entries.push({ act: 'purge', label: 'Supprimer définitivement', danger: true });
      } else {
        entries.push({ act: 'open', label: 'Ouvrir le cahier' });
        entries.push({ act: 'rename', label: 'Renommer' });
        entries.push({ act: 'duplicate', label: 'Dupliquer' });
        entries.push({ act: 'move', label: 'Déplacer vers...' });
        entries.push({ act: 'star', label: item.starred ? 'Retirer des favoris' : 'Ajouter aux favoris' });
        entries.push({ sep: true });
        entries.push({ act: 'trash', label: 'Mettre à la corbeille', danger: true });
      }
    }

    ctxMenu.innerHTML = entries.map((entry) => {
      if (entry.sep) return '<div class="gn-files-menu-sep"></div>';
      return `<button class="gn-files-menu-item${entry.danger ? ' danger' : ''}" type="button" data-ctx-act="${entry.act}">${escapeHtml(entry.label)}</button>`;
    }).join('');

    ctxMenu.querySelectorAll('[data-ctx-act]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const act = btn.dataset.ctxAct;
        closeGnFilesMenus();
        if (itemType === 'fld') {
          if (act === 'open') {
            state.filesPageTab = 'all';
            state.currentFolderId = item.id;
            renderNotebooksSidebar();
          } else if (act === 'customize') {
            openFolderCustomizeModal(item);
          } else if (act === 'rename') {
            openRenameModal('Renommer le dossier', item.name, (val) => {
              item.name = val;
              item.updatedAt = Date.now();
              db.saveFolders(state.folders);
              renderNotebooksSidebar();
            });
          } else if (act === 'star') {
            item.starred = !item.starred;
            item.updatedAt = Date.now();
            db.saveFolders(state.folders);
            renderNotebooksSidebar();
          } else if (act === 'move') {
            openMoveNotebookModal({ type: 'fld', id: item.id });
          } else if (act === 'trash') {
            await moveFolderToTrash(item.id);
          } else if (act === 'restore') {
            await restoreFolderFromTrash(item.id);
          } else if (act === 'purge') {
            await deleteFolderPermanently(item.id);
          }
        } else {
          if (act === 'open') {
            selectNotebook(item.id);
            closeFilesPage();
          } else if (act === 'rename') {
            openRenameModal('Renommer le cahier', item.title, (val) => {
              item.title = val;
              item.updatedAt = Date.now();
              db.saveNotebook(item);
              renderNotebooksSidebar();
              updateBreadcrumbs();
            });
          } else if (act === 'duplicate') {
            await duplicateNotebookById(item.id);
          } else if (act === 'move') {
            openMoveNotebookModal({ type: 'nb', id: item.id });
          } else if (act === 'star') {
            item.starred = !item.starred;
            item.updatedAt = Date.now();
            db.saveNotebook(item);
            renderNotebooksSidebar();
          } else if (act === 'trash') {
            await moveNotebookToTrash(item.id);
          } else if (act === 'restore') {
            await restoreNotebookFromTrash(item.id);
          } else if (act === 'purge') {
            await deleteNotebookById(item.id);
          }
        }
      });
    });

    positionGnFilesPopover(ctxMenu, anchorPoint);
  }

  function getGnFilesVisibleData() {
    const tab = state.filesPageTab || 'all';
    const search = (state.sidebarSearch || '').trim().toLowerCase();
    const favFilter = state.filesPageFavFilter || 'any';
    const sortBy = state.notebookSortBy || 'date_desc';

    const sortFoldersFn = (a, b) => {
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' });
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '', 'fr', { sensitivity: 'base' });
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    };
    const sortNotebooksFn = (a, b) => {
      if (tab === 'recents' || sortBy === 'date_desc') {
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

    const folders = (state.folders || []).filter((f) => {
      const isTrashed = Boolean(f.trashedAt);
      if (tab === 'trash') return isTrashed && (!search || (f.name || '').toLowerCase().includes(search));
      if (isTrashed) return false;
      if (tab === 'recents') return false;
      if (tab === 'favorites') {
        if (favFilter === 'document') return false;
        return Boolean(f.starred) && (!search || (f.name || '').toLowerCase().includes(search));
      }
      if (search) return (f.name || '').toLowerCase().includes(search);
      return (f.parentId || null) === (state.currentFolderId || null);
    }).sort(sortFoldersFn);

    const notebooks = (state.notebooks || []).filter((nb) => {
      const isTrashed = Boolean(nb.trashedAt);
      if (tab === 'trash') return isTrashed && (!search || (nb.title || '').toLowerCase().includes(search));
      if (isTrashed) return false;
      if (tab === 'favorites') {
        if (favFilter === 'folder') return false;
        return Boolean(nb.starred) && (!search || (nb.title || '').toLowerCase().includes(search));
      }
      if (tab === 'recents') {
        return !search || (nb.title || '').toLowerCase().includes(search);
      }
      if (search) return (nb.title || '').toLowerCase().includes(search);
      return (nb.folderId || null) === (state.currentFolderId || null);
    }).sort(sortNotebooksFn);

    return { tab, search, folders, notebooks };
  }

  function renderGnFilesPage() {
    const pageEl = document.getElementById('gnFilesPage');
    const contentEl = document.getElementById('gnFilesContent');
    if (!pageEl || !contentEl) return;

    const { tab, search, folders, notebooks } = getGnFilesVisibleData();
    const isTrash = tab === 'trash';
    const isFavorites = tab === 'favorites';
    const isRecents = tab === 'recents';
    const isGrid = (state.filesPageViewMode || 'grid') === 'grid';

    // 1. Sidebar active tab & badges
    document.querySelectorAll('#gnFilesSidebarNav [data-files-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.filesTab === tab);
    });
    const activeDocsCount = (state.notebooks || []).filter((n) => !n.trashedAt).length;
    const favCount = (state.notebooks || []).filter((n) => !n.trashedAt && n.starred).length +
      (state.folders || []).filter((f) => !f.trashedAt && f.starred).length;
    const trashCount = (state.notebooks || []).filter((n) => Boolean(n.trashedAt)).length +
      (state.folders || []).filter((f) => Boolean(f.trashedAt)).length;

    const badgeDocs = document.getElementById('gnFilesBadgeDocs');
    const badgeFav = document.getElementById('gnFilesBadgeFav');
    const badgeTrash = document.getElementById('gnFilesBadgeTrash');
    if (badgeDocs) badgeDocs.textContent = String(activeDocsCount);
    if (badgeFav) badgeFav.textContent = String(favCount);
    if (badgeTrash) badgeTrash.textContent = String(trashCount);

    const activeNb = getActiveNotebook();
    const activeNbLabel = document.getElementById('gnFilesActiveNbName');
    if (activeNbLabel) activeNbLabel.textContent = activeNb ? activeNb.title : 'Cahier actif';

    // 2. Breadcrumbs & Back button (GoodNotes top-bar-breadcrumbs)
    const backBtn = document.getElementById('btnGnFilesBack');
    const crumbsEl = document.getElementById('gnFilesBreadcrumbs');
    const showSubfolder = tab === 'all' && Boolean(state.currentFolderId) && !search;
    if (backBtn) backBtn.classList.toggle('hidden', !showSubfolder);

    if (crumbsEl) {
      if (tab === 'all') {
        const chain = showSubfolder ? getFolderPath(state.currentFolderId) : [];
        const parts = [{ id: '', label: 'Documents', isCurrent: chain.length === 0 }];
        chain.forEach((f, idx) => parts.push({ id: f.id, label: f.name, isCurrent: idx === chain.length - 1 }));
        crumbsEl.innerHTML = parts.map((p, idx) => {
          const sep = idx > 0 ? '<span class="gn-files-crumb-sep">›</span>' : '';
          return `${sep}<button class="gn-files-crumb${p.isCurrent ? ' current' : ''}" type="button" data-gn-crumb="${p.id}">${escapeHtml(p.label)}</button>`;
        }).join('');
        crumbsEl.querySelectorAll('[data-gn-crumb]').forEach((b) => {
          b.addEventListener('click', () => {
            const targetId = b.dataset.gnCrumb || null;
            if (targetId === (state.currentFolderId || null)) return;
            state.currentFolderId = targetId;
            renderNotebooksSidebar();
          });
          b.addEventListener('dragover', (ev) => {
            if (!draggedFilesItem) return;
            ev.preventDefault();
            b.classList.add('drag-over');
          });
          b.addEventListener('dragleave', () => b.classList.remove('drag-over'));
          b.addEventListener('drop', (ev) => {
            ev.preventDefault();
            b.classList.remove('drag-over');
            if (!draggedFilesItem) return;
            const targetId = b.dataset.gnCrumb || null;
            if (draggedFilesItem.type === 'nb') moveNotebookToFolder(draggedFilesItem.id, targetId);
            else if (draggedFilesItem.type === 'fld') moveFolderToParent(draggedFilesItem.id, targetId);
            draggedFilesItem = null;
          });
        });
      } else {
        const titles = { recents: 'Récents', favorites: 'Favoris', trash: 'Corbeille' };
        crumbsEl.innerHTML = `<span class="gn-files-crumb current">${titles[tab] || 'Documents'}</span>`;
      }
    }

    // 3. Header controls sync
    const searchInput = document.getElementById('gnFilesSearchInput');
    const searchClear = document.getElementById('btnGnFilesSearchClear');
    if (searchInput && searchInput.value !== (state.sidebarSearch || '')) {
      searchInput.value = state.sidebarSearch || '';
    }
    if (searchClear) searchClear.classList.toggle('hidden', !search);

    const sortSel = document.getElementById('gnFilesSortSelect');
    if (sortSel) sortSel.value = state.notebookSortBy || 'date_desc';

    const gridBtn = document.getElementById('btnGnFilesViewGrid');
    const listBtn = document.getElementById('btnGnFilesViewList');
    if (gridBtn) gridBtn.classList.toggle('active', isGrid);
    if (listBtn) listBtn.classList.toggle('active', !isGrid);

    const selModeBtn = document.getElementById('btnGnFilesSelectMode');
    if (selModeBtn) {
      selModeBtn.classList.toggle('active', Boolean(state.filesPageSelectMode));
      if (typeof selModeBtn.setAttribute === 'function') {
        selModeBtn.setAttribute('aria-pressed', state.filesPageSelectMode ? 'true' : 'false');
      }
    }

    const topNewBtn = document.getElementById('btnGnFilesTopNew');
    if (topNewBtn) topNewBtn.classList.toggle('hidden', isTrash);

    // 4. Contextual subbars
    const favBar = document.getElementById('gnFilesFavFilterBar');
    if (favBar) {
      favBar.classList.toggle('hidden', !isFavorites);
      favBar.querySelectorAll('[data-fav-filter]').forEach((p) => {
        p.classList.toggle('active', p.dataset.favFilter === (state.filesPageFavFilter || 'any'));
      });
    }

    const selBar = document.getElementById('gnFilesSelectionBar');
    if (selBar) {
      selBar.classList.toggle('hidden', !state.filesPageSelectMode);
      const count = state.filesPageSelectedIds.size;
      const selCountEl = document.getElementById('gnFilesSelCount');
      if (selCountEl) selCountEl.textContent = `${count} sélectionné${count > 1 ? 's' : ''}`;
      const dupBtn = document.getElementById('btnGnFilesSelDuplicate');
      const starBtn = document.getElementById('btnGnFilesSelStar');
      const moveBtn = document.getElementById('btnGnFilesSelMove');
      const trashBtn = document.getElementById('btnGnFilesSelTrash');
      if (dupBtn) dupBtn.classList.toggle('hidden', isTrash);
      if (starBtn) starBtn.classList.toggle('hidden', isTrash);
      if (moveBtn) moveBtn.textContent = isTrash ? 'Restaurer' : 'Déplacer';
      if (trashBtn) trashBtn.textContent = isTrash ? 'Supprimer' : 'Corbeille';
    }

    const trashBar = document.getElementById('gnFilesTrashBar');
    if (trashBar) {
      trashBar.classList.toggle('hidden', !isTrash || trashCount === 0);
      const sumEl = document.getElementById('gnFilesTrashSummary');
      if (sumEl) {
        sumEl.textContent = `${trashCount} élément${trashCount > 1 ? 's' : ''} dans la corbeille — cliquez sur un élément pour le restaurer.`;
      }
    }

    // 5. Render Grid or List content
    contentEl.className = `gn-files-content ${isGrid ? 'mode-grid' : 'mode-list'}`;
    contentEl.innerHTML = '';

    // GoodNotes dashed "+ Nouveau" card as first tile in Grid mode (Documents tab)
    if (isGrid && tab === 'all' && !search && !state.filesPageSelectMode) {
      const newCard = document.createElement('button');
      newCard.type = 'button';
      newCard.className = 'gn-file-new-card';
      newCard.innerHTML = `
        <div class="gn-file-new-visual">
          <span class="gn-file-new-plus">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </span>
          <span class="gn-file-new-label">Nouveau...</span>
        </div>
      `;
      newCard.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openGnFilesNewMenu(newCard);
      });
      contentEl.appendChild(newCard);
    }

    const toggleSelectKey = (key) => {
      if (state.filesPageSelectedIds.has(key)) state.filesPageSelectedIds.delete(key);
      else state.filesPageSelectedIds.add(key);
      renderGnFilesPage();
    };

    // Render Folders
    folders.forEach((folder) => {
      const key = `fld:${folder.id}`;
      const isSelected = state.filesPageSelectedIds.has(key);
      const counts = getFolderItemCounts(folder.id);
      const countText = formatFolderItemCountLabel(counts);
      const color = folder.color || '#0072ce';
      const iconSvg = getFolderIconSvg(folder.icon || 'folder');
      const el = document.createElement('div');
      el.className = `${isGrid ? 'gn-file-card' : 'gn-file-row'} gn-file-folder${isSelected ? ' selected' : ''}`;
      el.draggable = !isTrash && !state.filesPageSelectMode;

      if (isGrid) {
        el.innerHTML = `
          ${state.filesPageSelectMode ? `<span class="gn-card-check">${isSelected ? '✓' : ''}</span>` : ''}
          ${!isTrash ? `<button class="gn-card-star-btn${folder.starred ? ' starred' : ''}" type="button" data-f-act="star" title="Favori">${folder.starred ? '★' : '☆'}</button>` : ''}
          <div class="gn-folder-visual">
            <div class="gn-folder-shape" style="--gn-folder-color:${escapeHtml(color)}">
              <span class="gn-folder-watermark">${iconSvg}</span>
            </div>
          </div>
          <div class="gn-card-footer">
            <div class="gn-card-meta">
              <div class="gn-card-title" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</div>
              <div class="gn-card-sub">${escapeHtml(countText)}</div>
            </div>
            <button class="gn-card-more-btn" type="button" data-f-act="more" title="Options">⋯</button>
          </div>
        `;
      } else {
        el.innerHTML = `
          ${state.filesPageSelectMode ? `<span class="gn-card-check" style="position:static;">${isSelected ? '✓' : ''}</span>` : ''}
          <div class="gn-row-icon" style="background:${escapeHtml(color)}">${iconSvg}</div>
          <div class="gn-row-main">
            <div class="gn-card-title">${escapeHtml(folder.name)}</div>
            <div class="gn-card-sub">${escapeHtml(countText)}</div>
          </div>
          <span class="gn-row-date">${escapeHtml(formatCompactDate(folder.updatedAt || folder.createdAt))}</span>
          <div class="gn-row-actions">
            ${!isTrash ? `<button class="gn-card-more-btn" type="button" data-f-act="star" style="color:${folder.starred ? '#f59e0b' : ''}" title="Favori">${folder.starred ? '★' : '☆'}</button>` : ''}
            <button class="gn-card-more-btn" type="button" data-f-act="more" title="Options">⋯</button>
          </div>
        `;
      }

      if (!isTrash) {
        el.addEventListener('dragstart', (ev) => {
          draggedFilesItem = { type: 'fld', id: folder.id };
          el.classList.add('dragging');
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = 'move';
            try { ev.dataTransfer.setData('text/plain', key); } catch (_) {}
          }
        });
        el.addEventListener('dragend', () => {
          draggedFilesItem = null;
          el.classList.remove('dragging');
        });
        el.addEventListener('dragover', (ev) => {
          if (!draggedFilesItem) return;
          if (draggedFilesItem.type === 'fld' && isFolderDescendant(folder.id, draggedFilesItem.id)) return;
          ev.preventDefault();
          el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', (ev) => {
          ev.preventDefault();
          el.classList.remove('drag-over');
          if (!draggedFilesItem) return;
          if (draggedFilesItem.type === 'nb') moveNotebookToFolder(draggedFilesItem.id, folder.id);
          else if (draggedFilesItem.type === 'fld') moveFolderToParent(draggedFilesItem.id, folder.id);
          draggedFilesItem = null;
        });
      }

      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        openGnFilesContextMenu('fld', folder, { x: ev.clientX, y: ev.clientY });
      });

      el.addEventListener('click', (ev) => {
        const actBtn = ev.target.closest('[data-f-act]');
        if (actBtn) {
          ev.stopPropagation();
          if (actBtn.dataset.fAct === 'star') {
            folder.starred = !folder.starred;
            folder.updatedAt = Date.now();
            db.saveFolders(state.folders);
            renderNotebooksSidebar();
          } else if (actBtn.dataset.fAct === 'more') {
            openGnFilesContextMenu('fld', folder, actBtn.getBoundingClientRect());
          }
          return;
        }
        if (state.filesPageSelectMode) {
          toggleSelectKey(key);
          return;
        }
        if (isTrash) {
          restoreFolderFromTrash(folder.id);
          return;
        }
        state.filesPageTab = 'all';
        state.currentFolderId = folder.id;
        renderNotebooksSidebar();
      });

      contentEl.appendChild(el);
    });

    // Render Notebooks
    notebooks.forEach((nb) => {
      const key = `nb:${nb.id}`;
      const isSelected = state.filesPageSelectedIds.has(key);
      const pages = state.pagesByNotebook.get(nb.id) || [];
      const firstPage = pages[0] || null;
      const thumbSrc = firstPage && firstPage.thumbnail && firstPage.thumbnail.startsWith('data:image/')
        ? firstPage.thumbnail
        : '';
      const cover = nb.cover || '#0072ce';
      const paperLabel = PAPER_TYPE_LABELS[firstPage?.paperType] || 'Notes';
      const isPdf = Boolean(nb.isPdfNotebook || nb.pdfId);
      const isActiveNb = nb.id === state.activeNotebookId && !isTrash;
      const dateStr = formatCompactDate(nb.updatedAt || nb.createdAt);
      const pagesLabel = `${pages.length} page${pages.length > 1 ? 's' : ''}`;

      const el = document.createElement('div');
      el.className = `${isGrid ? 'gn-file-card' : 'gn-file-row'} gn-file-notebook${isSelected ? ' selected' : ''}`;
      el.draggable = !isTrash && !state.filesPageSelectMode;

      if (isGrid) {
        el.innerHTML = `
          ${state.filesPageSelectMode ? `<span class="gn-card-check">${isSelected ? '✓' : ''}</span>` : ''}
          ${!isTrash ? `<button class="gn-card-star-btn${nb.starred ? ' starred' : ''}" type="button" data-nb-act="star" title="Favori">${nb.starred ? '★' : '☆'}</button>` : ''}
          <div class="gn-nb-visual${thumbSrc ? ' has-thumb' : ''}" style="--gn-nb-cover:${escapeHtml(cover)}">
            ${thumbSrc
              ? `<img class="gn-nb-thumb-img" src="${thumbSrc}" alt="" loading="lazy" />`
              : `<div class="gn-nb-cover-stripe">${escapeHtml(nb.title)}</div>`}
            <div class="gn-nb-pill-row">
              ${isActiveNb ? '<span class="gn-nb-pill active-pill">Ouvert</span>' : ''}
              ${isPdf ? '<span class="gn-nb-pill pdf-pill">PDF</span>' : `<span class="gn-nb-pill">${escapeHtml(paperLabel)}</span>`}
            </div>
          </div>
          <div class="gn-card-footer">
            <div class="gn-card-meta">
              <div class="gn-card-title" title="${escapeHtml(nb.title)}">${escapeHtml(nb.title)}</div>
              <div class="gn-card-sub">${escapeHtml([dateStr, pagesLabel].filter(Boolean).join(' • '))}</div>
            </div>
            <button class="gn-card-more-btn" type="button" data-nb-act="more" title="Options">⋯</button>
          </div>
        `;
      } else {
        el.innerHTML = `
          ${state.filesPageSelectMode ? `<span class="gn-card-check" style="position:static;">${isSelected ? '✓' : ''}</span>` : ''}
          <div class="gn-row-icon" style="background:${escapeHtml(cover)}">
            ${thumbSrc ? `<img src="${thumbSrc}" alt="" loading="lazy" />` : '<span>📓</span>'}
          </div>
          <div class="gn-row-main">
            <div class="gn-card-title">${escapeHtml(nb.title)}${isActiveNb ? ' • Ouvert' : ''}</div>
            <div class="gn-card-sub">${escapeHtml(isPdf ? 'PDF annoté' : paperLabel)}</div>
          </div>
          <span class="gn-row-count">${escapeHtml(pagesLabel)}</span>
          <span class="gn-row-date">${escapeHtml(dateStr)}</span>
          <div class="gn-row-actions">
            ${!isTrash ? `<button class="gn-card-more-btn" type="button" data-nb-act="star" style="color:${nb.starred ? '#f59e0b' : ''}" title="Favori">${nb.starred ? '★' : '☆'}</button>` : ''}
            <button class="gn-card-more-btn" type="button" data-nb-act="more" title="Options">⋯</button>
          </div>
        `;
      }

      if (!isTrash) {
        el.addEventListener('dragstart', (ev) => {
          draggedFilesItem = { type: 'nb', id: nb.id };
          el.classList.add('dragging');
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = 'move';
            try { ev.dataTransfer.setData('text/plain', key); } catch (_) {}
          }
        });
        el.addEventListener('dragend', () => {
          draggedFilesItem = null;
          el.classList.remove('dragging');
        });
      }

      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        openGnFilesContextMenu('nb', nb, { x: ev.clientX, y: ev.clientY });
      });

      el.addEventListener('click', (ev) => {
        const actBtn = ev.target.closest('[data-nb-act]');
        if (actBtn) {
          ev.stopPropagation();
          if (actBtn.dataset.nbAct === 'star') {
            nb.starred = !nb.starred;
            nb.updatedAt = Date.now();
            db.saveNotebook(nb);
            renderNotebooksSidebar();
          } else if (actBtn.dataset.nbAct === 'more') {
            openGnFilesContextMenu('nb', nb, actBtn.getBoundingClientRect());
          }
          return;
        }
        if (state.filesPageSelectMode) {
          toggleSelectKey(key);
          return;
        }
        if (isTrash) {
          restoreNotebookFromTrash(nb.id);
          return;
        }
        selectNotebook(nb.id);
        closeFilesPage();
      });

      contentEl.appendChild(el);
    });

    // Empty state
    if (folders.length === 0 && notebooks.length === 0 && !(isGrid && tab === 'all' && !search && !state.filesPageSelectMode)) {
      const empty = document.createElement('div');
      empty.className = 'gn-files-empty';
      const emptyTitle = isTrash
        ? 'La corbeille est vide'
        : (isFavorites ? 'Aucun favori pour le moment' : (search ? `Aucun résultat pour « ${search} »` : 'Ce dossier est vide'));
      const emptySub = isTrash
        ? 'Les cahiers et dossiers supprimés apparaîtront ici.'
        : (isFavorites ? 'Cliquez sur l’étoile ☆ d’un cahier ou d’un dossier pour le retrouver ici.' : 'Créez un cahier, un dossier ou importez un PDF.');
      empty.innerHTML = `<div class="gn-files-empty-title">${escapeHtml(emptyTitle)}</div><div>${escapeHtml(emptySub)}</div>`;
      contentEl.appendChild(empty);
    }
  }

  function openFilesPage(initialTab) {
    const pageEl = document.getElementById('gnFilesPage');
    if (!pageEl) return false;
    finalizeActiveDrawingOnCurrentPage();
    flushPendingPageSaves();
    if (initialTab) state.filesPageTab = initialTab;
    state.filesPageOpen = true;
    closeGnFilesMenus();
    pageEl.classList.remove('hidden');
    const triggerBtn = document.getElementById('btnOpenFilesView');
    if (triggerBtn) triggerBtn.classList.add('active');
    renderGnFilesPage();
    return true;
  }

  function closeFilesPage() {
    const pageEl = document.getElementById('gnFilesPage');
    state.filesPageOpen = false;
    state.filesPageSelectMode = false;
    state.filesPageSelectedIds.clear();
    closeGnFilesMenus();
    if (pageEl) pageEl.classList.add('hidden');
    const triggerBtn = document.getElementById('btnOpenFilesView');
    if (triggerBtn) triggerBtn.classList.remove('active');
    requestRender();
    return false;
  }

  function toggleFilesPage() {
    return state.filesPageOpen ? closeFilesPage() : openFilesPage();
  }

  function initGnFilesPageEvents() {
    const triggerBtn = document.getElementById('btnOpenFilesView');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => toggleFilesPage());
    }

    document.getElementById('btnCloseFilesPage')?.addEventListener('click', closeFilesPage);
    document.getElementById('btnFilesReturnToCanvas')?.addEventListener('click', closeFilesPage);
    document.getElementById('btnFilesCloudBackup')?.addEventListener('click', () => {
      const modal = document.getElementById('modalGoogleDrive');
      if (modal) modal.classList.remove('hidden');
    });

    // Navigation latérale GoodNotes + Drop targets (Documents = racine, Corbeille = supprimer)
    document.querySelectorAll('#gnFilesSidebarNav [data-files-tab]').forEach((btn) => {
      const tabKey = btn.dataset.filesTab;
      btn.addEventListener('click', () => {
        closeGnFilesMenus();
        state.filesPageTab = tabKey || 'all';
        if (tabKey === 'all') state.currentFolderId = null;
        state.filesPageSelectMode = false;
        state.filesPageSelectedIds.clear();
        renderGnFilesPage();
      });
      if (tabKey === 'all' || tabKey === 'trash') {
        btn.addEventListener('dragover', (ev) => {
          if (!draggedFilesItem) return;
          ev.preventDefault();
          btn.classList.add('drag-over');
        });
        btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
        btn.addEventListener('drop', async (ev) => {
          ev.preventDefault();
          btn.classList.remove('drag-over');
          if (!draggedFilesItem) return;
          const item = draggedFilesItem;
          draggedFilesItem = null;
          if (tabKey === 'all') {
            if (item.type === 'nb') moveNotebookToFolder(item.id, null);
            else if (item.type === 'fld') moveFolderToParent(item.id, null);
          } else if (tabKey === 'trash') {
            if (item.type === 'nb') await moveNotebookToTrash(item.id);
            else if (item.type === 'fld') await moveFolderToTrash(item.id);
          }
        });
      }
    });

    // Bouton Retour dossier parent
    document.getElementById('btnGnFilesBack')?.addEventListener('click', () => {
      if (!state.currentFolderId) return;
      const cur = (state.folders || []).find((f) => f.id === state.currentFolderId);
      state.currentFolderId = cur ? (cur.parentId || null) : null;
      renderNotebooksSidebar();
    });

    // Recherche instantanée
    const searchInput = document.getElementById('gnFilesSearchInput');
    const searchClear = document.getElementById('btnGnFilesSearchClear');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.sidebarSearch = searchInput.value || '';
        renderNotebooksSidebar();
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        state.sidebarSearch = '';
        if (searchInput) searchInput.value = '';
        renderNotebooksSidebar();
      });
    }

    // Tri
    const sortSel = document.getElementById('gnFilesSortSelect');
    if (sortSel) {
      sortSel.addEventListener('change', () => {
        state.notebookSortBy = sortSel.value || 'date_desc';
        state.sidebarSort = (state.notebookSortBy === 'name_asc' || state.notebookSortBy === 'name_desc') ? 'name' : 'date';
        syncSortControlsUi();
        renderNotebooksSidebar();
      });
    }

    // Mode Grille / Liste
    document.getElementById('btnGnFilesViewGrid')?.addEventListener('click', () => {
      state.filesPageViewMode = 'grid';
      renderGnFilesPage();
    });
    document.getElementById('btnGnFilesViewList')?.addEventListener('click', () => {
      state.filesPageViewMode = 'list';
      renderGnFilesPage();
    });

    // Bouton "+ Nouveau" dans l'en-tête
    const topNewBtn = document.getElementById('btnGnFilesTopNew');
    if (topNewBtn) {
      topNewBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openGnFilesNewMenu(topNewBtn);
      });
    }

    // Actions du popover "+ Nouveau"
    document.querySelectorAll('#gnFilesNewMenu [data-new-action]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const act = btn.dataset.newAction;
        closeGnFilesMenus();
        if (act === 'notebook') {
          if (dom.inputNotebookName) dom.inputNotebookName.value = '';
          if (dom.modalNewNotebook) dom.modalNewNotebook.classList.remove('hidden');
        } else if (act === 'folder') {
          openFolderCustomizeModal(null);
        } else if (act === 'quicknote') {
          const curPage = getActivePage();
          await createNotebookProgrammatically(
            `Note rapide ${state.notebooks.length + 1}`,
            curPage ? curPage.paperType : 'grid',
            state.newNotebookCover,
            curPage
          );
          closeFilesPage();
          showToast('⚡ Note rapide créée');
        } else if (act === 'import-pdf') {
          if (dom.modalImportPdf) dom.modalImportPdf.classList.remove('hidden');
        }
      });
    });

    // Filtres Favoris (Tous / Cahiers / Dossiers)
    document.querySelectorAll('#gnFilesFavFilterBar [data-fav-filter]').forEach((pill) => {
      pill.addEventListener('click', () => {
        state.filesPageFavFilter = pill.dataset.favFilter || 'any';
        renderGnFilesPage();
      });
    });

    // Mode sélection multiple GoodNotes
    document.getElementById('btnGnFilesSelectMode')?.addEventListener('click', () => {
      state.filesPageSelectMode = !state.filesPageSelectMode;
      if (!state.filesPageSelectMode) state.filesPageSelectedIds.clear();
      renderGnFilesPage();
    });
    document.getElementById('btnGnFilesSelDone')?.addEventListener('click', () => {
      state.filesPageSelectMode = false;
      state.filesPageSelectedIds.clear();
      renderGnFilesPage();
    });
    document.getElementById('btnGnFilesSelAll')?.addEventListener('click', () => {
      const { folders, notebooks } = getGnFilesVisibleData();
      const allKeys = [...folders.map((f) => `fld:${f.id}`), ...notebooks.map((n) => `nb:${n.id}`)];
      if (state.filesPageSelectedIds.size === allKeys.length && allKeys.length > 0) {
        state.filesPageSelectedIds.clear();
      } else {
        allKeys.forEach((k) => state.filesPageSelectedIds.add(k));
      }
      renderGnFilesPage();
    });

    const getSelectedParsed = () => Array.from(state.filesPageSelectedIds).map((k) => {
      const idx = k.indexOf(':');
      return { type: k.slice(0, idx), id: k.slice(idx + 1) };
    });

    document.getElementById('btnGnFilesSelMove')?.addEventListener('click', async () => {
      const items = getSelectedParsed();
      if (items.length === 0) return;
      if (state.filesPageTab === 'trash') {
        for (const it of items) {
          if (it.type === 'nb') await restoreNotebookFromTrash(it.id);
          else if (it.type === 'fld') await restoreFolderFromTrash(it.id);
        }
        state.filesPageSelectMode = false;
        state.filesPageSelectedIds.clear();
        renderGnFilesPage();
        return;
      }
      openMoveNotebookModal(items);
    });

    document.getElementById('btnGnFilesSelStar')?.addEventListener('click', () => {
      const items = getSelectedParsed();
      if (items.length === 0) return;
      let foldersDirty = false;
      items.forEach((it) => {
        if (it.type === 'nb') {
          const nb = state.notebooks.find((n) => n.id === it.id);
          if (nb) { nb.starred = !nb.starred; nb.updatedAt = Date.now(); db.saveNotebook(nb); }
        } else if (it.type === 'fld') {
          const fld = (state.folders || []).find((f) => f.id === it.id);
          if (fld) { fld.starred = !fld.starred; fld.updatedAt = Date.now(); foldersDirty = true; }
        }
      });
      if (foldersDirty) db.saveFolders(state.folders);
      renderNotebooksSidebar();
    });

    document.getElementById('btnGnFilesSelDuplicate')?.addEventListener('click', async () => {
      const items = getSelectedParsed().filter((it) => it.type === 'nb');
      if (items.length === 0) return;
      for (const it of items) await duplicateNotebookById(it.id);
      state.filesPageSelectMode = false;
      state.filesPageSelectedIds.clear();
      renderGnFilesPage();
    });

    document.getElementById('btnGnFilesSelTrash')?.addEventListener('click', async () => {
      const items = getSelectedParsed();
      if (items.length === 0) return;
      const inTrash = state.filesPageTab === 'trash';
      for (const it of items) {
        if (inTrash) {
          if (it.type === 'nb') await deleteNotebookById(it.id);
          else if (it.type === 'fld') await deleteFolderPermanently(it.id);
        } else {
          if (it.type === 'nb') await moveNotebookToTrash(it.id);
          else if (it.type === 'fld') await moveFolderToTrash(it.id);
        }
      }
      state.filesPageSelectMode = false;
      state.filesPageSelectedIds.clear();
      renderGnFilesPage();
    });

    // Actions Corbeille globale
    document.getElementById('btnGnFilesRestoreAll')?.addEventListener('click', async () => {
      const trashedNbs = state.notebooks.filter((n) => Boolean(n.trashedAt));
      const trashedFlds = (state.folders || []).filter((f) => Boolean(f.trashedAt));
      for (const fld of trashedFlds) await restoreFolderFromTrash(fld.id);
      for (const nb of trashedNbs) await restoreNotebookFromTrash(nb.id);
      renderGnFilesPage();
    });
    document.getElementById('btnGnFilesEmptyTrash')?.addEventListener('click', async () => {
      await emptyTrash();
      renderGnFilesPage();
    });

    // Fermer les popovers au clic en dehors
    const pageEl = document.getElementById('gnFilesPage');
    if (pageEl) {
      pageEl.addEventListener('click', (ev) => {
        if (!ev.target.closest('#gnFilesNewMenu') && !ev.target.closest('#gnFilesContextMenu')) {
          closeGnFilesMenus();
        }
      });
    }
  }

  let gdriveAutoBackupInterval = null;
  function initGoodnotesExtensions() {
    initGnFilesPageEvents();
    // 1. Dossiers, Recherche, Tri, Vue Grille/Liste, Corbeille & Favoris Goodnotes
    const btnNewFolder = document.getElementById('btnNewFolder');
    if (btnNewFolder) {
      btnNewFolder.addEventListener('click', () => {
        openFolderCustomizeModal(null);
      });
    }

    document.querySelectorAll('#folderColorSwatches [data-folder-color]').forEach((sw) => {
      sw.addEventListener('click', () => {
        state.folderModalColor = sw.dataset.folderColor || '#0072ce';
        document.querySelectorAll('#folderColorSwatches [data-folder-color]').forEach((x) => x.classList.toggle('active', x === sw));
      });
    });

    const btnAddFolderColor = document.getElementById('btnAddFolderColor');
    if (btnAddFolderColor) {
      btnAddFolderColor.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openGnColorPopover({
          mode: 'folder-color',
          toolKey: 'pen',
          scopeKey: 'folder',
          anchorEl: btnAddFolderColor,
          initialColor: state.folderModalColor || '#0072ce'
        });
      });
    }

    document.querySelectorAll('#folderSymbolPills [data-folder-icon]').forEach((pill) => {
      pill.addEventListener('click', () => {
        state.folderModalIcon = pill.dataset.folderIcon || 'folder';
        document.querySelectorAll('#folderSymbolPills [data-folder-icon]').forEach((x) => x.classList.toggle('active', x === pill));
      });
    });

    document.getElementById('btnCloseFolderCustomizeModal')?.addEventListener('click', closeFolderCustomizeModal);
    document.getElementById('btnCancelFolderCustomizeModal')?.addEventListener('click', closeFolderCustomizeModal);
    document.getElementById('btnConfirmFolderCustomizeModal')?.addEventListener('click', () => {
      const nameInput = document.getElementById('inputFolderCustomizeName');
      const name = (nameInput && nameInput.value.trim()) || 'Nouveau dossier';
      if (state.editingFolderId) {
        const existing = (state.folders || []).find((f) => f.id === state.editingFolderId);
        if (existing) {
          existing.name = name;
          existing.color = state.folderModalColor || '#0072ce';
          existing.icon = state.folderModalIcon || 'folder';
          existing.updatedAt = Date.now();
        }
      } else {
        state.folders.push({
          id: createUid('fld'),
          name,
          parentId: state.currentFolderId || null,
          color: state.folderModalColor || '#0072ce',
          icon: state.folderModalIcon || 'folder',
          starred: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      db.saveFolders(state.folders);
      renderNotebooksSidebar();
      closeFolderCustomizeModal();
      showToast(`Dossier « ${name} » enregistré`);
    });

    // Double-clic sur "+ Nouveau" -> Note rapide instantanée sans ouvrir la modale (flux GoodNotes Quick Note)
    if (dom.btnNewNotebook) {
      dom.btnNewNotebook.addEventListener('dblclick', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (dom.modalNewNotebook) dom.modalNewNotebook.classList.add('hidden');
        const curPage = getActivePage();
        await createNotebookProgrammatically(
          `Note rapide ${state.notebooks.length + 1}`,
          curPage ? curPage.paperType : 'grid',
          state.newNotebookCover,
          curPage
        );
        showToast('⚡ Note rapide créée');
      });
    }

    const sortSelect = document.getElementById('notebookSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        state.notebookSortBy = sortSelect.value || 'date_desc';
        state.sidebarSort = (state.notebookSortBy === 'name_asc' || state.notebookSortBy === 'name_desc') ? 'name' : 'date';
        syncSortControlsUi();
        renderNotebooksSidebar();
      });
    }

    const btnSortDocs = document.getElementById('btnSortDocs');
    if (btnSortDocs) {
      btnSortDocs.addEventListener('click', () => {
        state.sidebarSort = state.sidebarSort === 'name' ? 'date' : 'name';
        state.notebookSortBy = state.sidebarSort === 'name' ? 'name_asc' : 'date_desc';
        syncSortControlsUi();
        renderNotebooksSidebar();
      });
    }
    syncSortControlsUi();

    const btnToggleLibraryView = document.getElementById('btnToggleLibraryView');
    if (btnToggleLibraryView) {
      btnToggleLibraryView.addEventListener('click', () => {
        state.libraryViewMode = state.libraryViewMode === 'grid' ? 'list' : 'grid';
        btnToggleLibraryView.classList.toggle('active', state.libraryViewMode === 'grid');
        renderNotebooksSidebar();
      });
    }

    const btnEmptyTrash = document.getElementById('btnEmptyTrash');
    if (btnEmptyTrash) {
      btnEmptyTrash.addEventListener('click', () => {
        emptyTrash();
      });
    }

    // Sous-onglets Pages / Plan / Favoris
    document.querySelectorAll('#pagesSubTabs [data-pages-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.pagesSubTab = btn.dataset.pagesSubtab || 'pages';
        state.pagesFilterBookmarks = state.pagesSubTab === 'bookmarks';
        document.querySelectorAll('#pagesSubTabs [data-pages-subtab]').forEach((b) => b.classList.toggle('active', b === btn));
        const bmBtn = document.getElementById('btnFilterBookmarkedPages');
        if (bmBtn) bmBtn.classList.toggle('active', state.pagesFilterBookmarks);
        renderPagesSidebar();
      });
    });

    const btnAddOutlineEntry = document.getElementById('btnAddOutlineEntry');
    if (btnAddOutlineEntry) {
      btnAddOutlineEntry.addEventListener('click', () => {
        const curPage = getActivePage();
        openRenameModal(
          'Ajouter une entrée au Plan',
          curPage ? curPage.title : 'Chapitre',
          (val) => {
            addOutlineEntryForPage(state.activePageId, val, 1);
            showToast('Section ajoutée au Plan');
          }
        );
      });
    }

    const searchInput = document.getElementById('sidebarSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.sidebarSearch = searchInput.value || '';
        renderNotebooksSidebar();
      });
    }

    document.querySelectorAll('.gn-filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        state.sidebarFilter = pill.dataset.filter || 'all';
        document.querySelectorAll('.gn-filter-pill').forEach((p) => p.classList.toggle('active', p === pill));
        renderNotebooksSidebar();
      });
    });

    const btnFilterBm = document.getElementById('btnFilterBookmarkedPages');
    if (btnFilterBm) {
      btnFilterBm.addEventListener('click', () => {
        state.pagesFilterBookmarks = !state.pagesFilterBookmarks;
        state.pagesSubTab = state.pagesFilterBookmarks ? 'bookmarks' : 'pages';
        btnFilterBm.classList.toggle('active', state.pagesFilterBookmarks);
        document.querySelectorAll('#pagesSubTabs [data-pages-subtab]').forEach((b) => {
          b.classList.toggle('active', b.dataset.pagesSubtab === state.pagesSubTab);
        });
        renderPagesSidebar();
      });
    }

    // Modal déplacer cahier / dossier / sélection multiple
    const moveModal = document.getElementById('modalMoveNotebook');
    const closeMove = () => { if (moveModal) moveModal.classList.add('hidden'); state.movingNotebookId = null; state.movingItems = null; };
    document.getElementById('btnCloseMoveNotebookModal')?.addEventListener('click', closeMove);
    document.getElementById('btnCancelMoveNotebookModal')?.addEventListener('click', closeMove);
    document.getElementById('btnConfirmMoveNotebookModal')?.addEventListener('click', () => {
      const sel = document.getElementById('selectTargetFolder');
      const targetFolderId = (sel && sel.value) || null;
      const items = Array.isArray(state.movingItems) && state.movingItems.length
        ? state.movingItems
        : (state.movingNotebookId ? [{ type: 'nb', id: state.movingNotebookId }] : []);
      let movedCount = 0;
      let foldersDirty = false;
      items.forEach((item) => {
        if (item.type === 'nb') {
          const nb = state.notebooks.find((n) => n.id === item.id);
          if (nb && (nb.folderId || null) !== targetFolderId) {
            nb.folderId = targetFolderId;
            nb.updatedAt = Date.now();
            db.saveNotebook(nb);
            movedCount++;
          }
        } else if (item.type === 'fld') {
          const fld = (state.folders || []).find((f) => f.id === item.id);
          if (fld && (fld.parentId || null) !== targetFolderId && (!targetFolderId || !isFolderDescendant(targetFolderId, fld.id))) {
            fld.parentId = targetFolderId;
            fld.updatedAt = Date.now();
            foldersDirty = true;
            movedCount++;
          }
        }
      });
      if (foldersDirty) db.saveFolders(state.folders);
      if (movedCount > 0) {
        if (state.filesPageSelectMode) {
          state.filesPageSelectMode = false;
          state.filesPageSelectedIds.clear();
        }
        renderNotebooksSidebar();
        showToast(movedCount > 1 ? `${movedCount} éléments déplacés !` : 'Élément déplacé !');
      }
      closeMove();
    });

    // 2. Styles de stylo Goodnotes (Plume / Bille / Pinceau) + Styles de trait (Continu / Tirets / Pointillé) + Options Surligneur, Gomme & Lasso
    document.querySelectorAll('#penStylePills [data-penstyle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.penStyle = btn.dataset.penstyle || 'fountain';
        document.querySelectorAll('#penStylePills [data-penstyle]').forEach((b) => b.classList.toggle('active', b === btn));
        showToast(`Pointe : ${btn.textContent}`);
      });
    });

    document.querySelectorAll('#penLineStylePills [data-line-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.penLineStyle = btn.dataset.lineStyle || 'solid';
        document.querySelectorAll('#penLineStylePills [data-line-style]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    const hlAutoToggle = document.getElementById('hlAutoStraightenToggle');
    if (hlAutoToggle) {
      hlAutoToggle.checked = Boolean(state.highlighterAutoStraighten);
      hlAutoToggle.addEventListener('change', () => {
        state.highlighterAutoStraighten = Boolean(hlAutoToggle.checked);
      });
    }

    const eraserHlOnlyToggle = document.getElementById('eraserHighlighterOnlyToggle');
    if (eraserHlOnlyToggle) {
      eraserHlOnlyToggle.checked = Boolean(state.eraserHighlighterOnly);
      eraserHlOnlyToggle.addEventListener('change', () => {
        state.eraserHighlighterOnly = Boolean(eraserHlOnlyToggle.checked);
      });
    }

    const eraserAutoDeselectToggle = document.getElementById('eraserAutoDeselectToggle');
    if (eraserAutoDeselectToggle) {
      eraserAutoDeselectToggle.checked = Boolean(state.eraserAutoDeselect);
      eraserAutoDeselectToggle.addEventListener('change', () => {
        state.eraserAutoDeselect = Boolean(eraserAutoDeselectToggle.checked);
      });
    }

    document.querySelectorAll('#lassoModePills [data-lasso-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.lassoMode = btn.dataset.lassoMode || 'freehand';
        document.querySelectorAll('#lassoModePills [data-lasso-mode]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    // 3. Insertion d'images / stickers + Coller depuis le presse-papiers (Ctrl+V)
    const btnInsertImg = document.getElementById('btnInsertImage');
    const inputImg = document.getElementById('inputInsertImage');
    if (btnInsertImg && inputImg) {
      btnInsertImg.addEventListener('click', () => inputImg.click());
      inputImg.addEventListener('change', (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (file) readFileAsImageAndInsert(file);
        inputImg.value = '';
      });
    }
    window.addEventListener('paste', (ev) => {
      const ae = document.activeElement;
      const tag = ae && ae.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae && ae.isContentEditable)) return;
      const cd = ev.clipboardData;
      if (!cd) return;
      if (cd.items && cd.items.length > 0) {
        for (const item of cd.items) {
          if (item.type && item.type.startsWith('image/')) {
            const f = item.getAsFile();
            if (f) {
              ev.preventDefault();
              readFileAsImageAndInsert(f);
              return;
            }
          }
        }
      }
      if (cd.files && cd.files.length > 0) {
        for (const f of cd.files) {
          if (f && f.type && f.type.startsWith('image/')) {
            ev.preventDefault();
            readFileAsImageAndInsert(f);
            return;
          }
        }
      }
    });

    // 4. Sauvegarde Cloud (Dossier local synchronisé + Google Drive API v3)
    const gdModal = document.getElementById('modalGoogleDrive');
    const inputClient = document.getElementById('inputGdriveClientId');
    const setCloudBackupTab = (tab) => {
      const isApi = tab === 'api';
      const localPanel = document.getElementById('cloudTabLocal');
      const apiPanel = document.getElementById('cloudTabApi');
      const btnLocal = document.getElementById('btnCloudTabLocal');
      const btnApi = document.getElementById('btnCloudTabApi');
      if (localPanel) localPanel.classList.toggle('hidden', isApi);
      if (apiPanel) apiPanel.classList.toggle('hidden', !isApi);
      if (btnLocal) {
        btnLocal.classList.toggle('active', !isApi);
        btnLocal.setAttribute('aria-selected', isApi ? 'false' : 'true');
      }
      if (btnApi) {
        btnApi.classList.toggle('active', isApi);
        btnApi.setAttribute('aria-selected', isApi ? 'true' : 'false');
      }
    };
    document.querySelectorAll('#modalGoogleDrive [data-cloud-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setCloudBackupTab(btn.dataset.cloudTab));
    });
    try {
      state.gdriveClientId = localStorage.getItem('inkflow_gdrive_client_id') || '';
      state.gdriveAccessToken = localStorage.getItem('inkflow_gdrive_token') || '';
      state.gdriveAutoBackup = localStorage.getItem('inkflow_gdrive_auto') === 'true';
      if (inputClient && state.gdriveClientId) inputClient.value = state.gdriveClientId;
      const chk = document.getElementById('chkGdriveAutoBackup');
      if (chk) chk.checked = state.gdriveAutoBackup;
      if (state.gdriveAccessToken) {
        updateGdriveStatusUi('Google Drive connecté', true);
        setCloudBackupTab('api');
      }
    } catch (_) {}

    document.getElementById('btnOpenGoogleDrive')?.addEventListener('click', () => {
      if (gdModal) gdModal.classList.remove('hidden');
    });
    document.getElementById('btnCloseGoogleDriveModal')?.addEventListener('click', () => {
      if (gdModal) gdModal.classList.add('hidden');
    });
    document.getElementById('btnDoneGoogleDriveModal')?.addEventListener('click', () => {
      if (gdModal) gdModal.classList.add('hidden');
    });
    if (gdModal) {
      gdModal.addEventListener('click', (ev) => {
        if (ev.target === gdModal) gdModal.classList.add('hidden');
      });
    }

    document.getElementById('btnPickLocalDriveFolder')?.addEventListener('click', async () => {
      if (typeof window.showDirectoryPicker !== 'function') {
        showToast('Votre navigateur ne supporte pas le sélecteur de dossier (utilisez Electron / Edge / Chrome).');
        return;
      }
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        state.gdriveLocalDirHandle = handle;
        const btnSync = document.getElementById('btnSyncLocalDriveNow');
        if (btnSync) btnSync.disabled = false;
        updateGdriveStatusUi(`Dossier local connecté : ${handle.name}`, true);
        await syncToLocalDriveFolderNow();
      } catch (_) {}
    });
    document.getElementById('btnSyncLocalDriveNow')?.addEventListener('click', () => syncToLocalDriveFolderNow());

    document.getElementById('btnGdriveConnect')?.addEventListener('click', () => {
      const val = (inputClient && inputClient.value || '').trim();
      if (!val) {
        showToast('Saisissez votre Google OAuth Client ID ou collez un Access Token (ya29...).');
        return;
      }
      if (val.startsWith('ya29.')) {
        state.gdriveAccessToken = val;
        try { localStorage.setItem('inkflow_gdrive_token', val); } catch (_) {}
        updateGdriveStatusUi('Connecté à Google Drive via Access Token.', true);
        showToast('Connecté à Google Drive !');
        return;
      }
      state.gdriveClientId = val;
      try { localStorage.setItem('inkflow_gdrive_client_id', val); } catch (_) {}
      const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
      const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(val)}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&include_granted_scopes=true`;
      const popup = window.open(authUrl, 'inkflow_gdrive_auth', 'width=520,height=640');
      if (!popup) {
        showToast('Popup bloquée — autorisez les popups ou collez un Access Token.');
        return;
      }
      const poll = setInterval(() => {
        try {
          if (!popup || popup.closed) { clearInterval(poll); return; }
          const hash = popup.location && popup.location.hash;
          if (hash && hash.includes('access_token=')) {
            const params = new URLSearchParams(hash.slice(1));
            const tok = params.get('access_token');
            if (tok) {
              state.gdriveAccessToken = tok;
              try { localStorage.setItem('inkflow_gdrive_token', tok); } catch (_) {}
              updateGdriveStatusUi('Connecté à Google Drive (OAuth) !', true);
              showToast('Connecté à Google Drive !');
              popup.close();
              clearInterval(poll);
            }
          }
        } catch (_) {}
      }, 450);
    });

    document.getElementById('btnGdriveBackupNow')?.addEventListener('click', () => backupToGoogleDriveApiNow());
    document.getElementById('btnGdriveListBackups')?.addEventListener('click', () => listGoogleDriveBackups());

    const chkAuto = document.getElementById('chkGdriveAutoBackup');
    if (chkAuto) {
      chkAuto.addEventListener('change', () => {
        state.gdriveAutoBackup = chkAuto.checked;
        try { localStorage.setItem('inkflow_gdrive_auto', String(state.gdriveAutoBackup)); } catch (_) {}
        if (gdriveAutoBackupInterval) clearInterval(gdriveAutoBackupInterval);
        if (state.gdriveAutoBackup) {
          gdriveAutoBackupInterval = setInterval(() => {
            if (state.gdriveLocalDirHandle) syncToLocalDriveFolderNow();
            else if (state.gdriveAccessToken) backupToGoogleDriveApiNow();
          }, 5 * 60 * 1000);
          showToast('Sauvegarde automatique Google Drive activée (toutes les 5 min).');
        }
      });
    }

    // 5. Raccourcis clavier Goodnotes (R = Ruban, K = Laser)
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'r') setActiveTool('tape', false);
      else if (k === 'k') setActiveTool('laser', false);
    });
  }

  async function loadFromIndexedDB() {
    try {
      let [notebooks, savedFolders] = await Promise.all([db.getAllNotebooks(), db.getFolders()]);
      if (Array.isArray(savedFolders)) state.folders = savedFolders;
      if (!notebooks || notebooks.length === 0) {
        const demo = createDemoNotebookAndPages();
        for (const nb of demo.notebooks) await db.saveNotebook(nb);
        for (const pg of demo.pages) { pg.thumbnail = generatePageThumbnail(pg); await db.savePage(pg); }
        notebooks = demo.notebooks;
      }
      state.notebooks = notebooks;
      state.pagesByNotebook.clear();
      for (const nb of state.notebooks) {
        const pages = await db.getPagesForNotebook(nb.id);
        pages.forEach((p) => { if (!p.viewMode) p.viewMode = 'infinite'; });
        state.pagesByNotebook.set(nb.id, pages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      }
      state.activeNotebookId = state.notebooks[0].id;
      state.activePageId = getActiveNotebookPages()[0]?.id;
    } catch (_) {
      if (!state.notebooks || state.notebooks.length === 0) applyDemoStateSynchronously();
    }
    ensureActiveAndAdjacentPdfPagesLoaded(getActivePage());
    renderNotebooksSidebar();
    renderPagesSidebar();
    loadOpenNotebookTabs();
    syncOpenTabsWithActiveNotebook();
    updateToolbarActiveState();
    renderWorldTextCards();
    fitPageToViewport();
    requestRender();
  }

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
    const colorWrap = document.getElementById('gnTplColorFilterWrap');
    const spacingCtrl = document.getElementById('gnTplSpacingControl');
    const spacingSlider = document.getElementById('gnTplGridSpacingSlider');
    const spacingVal = document.getElementById('gnTplGridSpacingVal');

    if (sizeLbl) sizeLbl.textContent = curSize.label;
    if (colorLbl) colorLbl.textContent = curTone.label;
    if (langLbl) langLbl.textContent = curLang.label;
    if (scopeLbl) scopeLbl.textContent = st.scope === 'all' ? 'Toutes les pages' : 'Page actuelle';
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

  function openGnTemplateLibraryModal(initialTab = 'paper') {
    const modal = document.getElementById('gnTemplateLibraryModal');
    if (!modal) return;
    loadGnCustomTemplatesStore();

    const page = getActivePage();
    const nb = getActiveNotebook();
    const st = gnTemplateModalState;

    st.open = true;
    st.activeTab = initialTab === 'cover' ? 'cover' : 'paper';
    st.editMode = false;
    st.selectedForDeletion.clear();
    closeAllGnTplDropdowns();

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

    modal.classList.remove('hidden');
    renderGnTemplateLibraryModal();
  }

  function closeGnTemplateLibraryModal() {
    const modal = document.getElementById('gnTemplateLibraryModal');
    if (modal) modal.classList.add('hidden');
    gnTemplateModalState.open = false;
    gnTemplateModalState.editMode = false;
    gnTemplateModalState.selectedForDeletion.clear();
    closeAllGnTplDropdowns();
  }

  function applyGnTemplateLibrarySelection() {
    const st = gnTemplateModalState;
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
      dot.style.background = nb.color || '#0072ce';
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
  }

  function renderDocTabAddPopover() {
    if (typeof document === 'undefined') return;
    const pop = document.getElementById('docTabAddPopover');
    if (!pop) return;
    pop.innerHTML = '';
    const activeNbs = (state.notebooks || []).filter((n) => !n.trashedAt);
    const openSet = new Set(state.openNotebookTabIds || []);
    activeNbs.forEach((nb) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'doc-tab-pop-item';
      const dot = document.createElement('span');
      dot.className = 'doc-tab-dot';
      dot.style.background = nb.color || '#0072ce';
      const name = document.createElement('span');
      name.className = 'doc-tab-pop-name';
      name.textContent = nb.title || 'Sans titre';
      item.appendChild(dot);
      item.appendChild(name);
      if (openSet.has(nb.id)) {
        const meta = document.createElement('span');
        meta.className = 'doc-tab-pop-meta';
        meta.textContent = nb.id === state.activeNotebookId ? 'Actif' : 'Ouvert';
        item.appendChild(meta);
      }
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        pop.classList.add('hidden');
        openNotebookInTab(nb.id, true);
      });
      pop.appendChild(item);
    });

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'doc-tab-pop-item create-new';
    createBtn.textContent = '+ Nouveau cahier';
    createBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      pop.classList.add('hidden');
      const count = activeNbs.length + 1;
      const nb = await createNotebookProgrammatically(`Cahier ${count}`);
      if (nb && nb.id) {
        openNotebookInTab(nb.id, true);
      }
    });
    pop.appendChild(createBtn);
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
    if (selStrokes.length === 0 && selShapes.length === 0) {
      showToast('Entourez d’abord un schéma ou des traits avec le Lasso.', 'error');
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
      return clone;
    });

    const list = getSavedElementsLibrary();
    const width = Math.max(16, Math.round(maxX - minX));
    const height = Math.max(16, Math.round(maxY - minY));
    const elObj = {
      id: createUid('el'),
      name: (customName && String(customName).trim()) || `Élément ${list.length + 1}`,
      width,
      height,
      strokes: normStrokes,
      shapes: normShapes,
      createdAt: Date.now()
    };
    elObj.preview = generateElementPreviewDataUrl(elObj);
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
      page.shapes.push(nsh);
      state.selectedIds.shapes.add(nsh.id);
    });

    computeSelectionBounds();
    updateLassoToolbarBadge();
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
    // #4 Onglets multi-documents
    loadOpenNotebookTabs();
    syncOpenTabsWithActiveNotebook();
    if (typeof document !== 'undefined') {
      const btnTabAdd = document.getElementById('btnDocTabAdd');
      const popTabAdd = document.getElementById('docTabAddPopover');
      if (btnTabAdd && popTabAdd) {
        btnTabAdd.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const willOpen = popTabAdd.classList.contains('hidden');
          if (willOpen) renderDocTabAddPopover();
          popTabAdd.classList.toggle('hidden', !willOpen);
        });
        document.addEventListener('pointerdown', (ev) => {
          if (!popTabAdd.classList.contains('hidden') && !ev.target.closest('.doc-tab-add-wrap')) {
            popTabAdd.classList.add('hidden');
          }
        });
      }

      // #1 Règle graduée virtuelle
      initVirtualRulerEvents();

      // #3 Modale recadrage d'images
      initImageCropModalEvents();

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
      getGnTemplateLibraryState,
      GN_PAGE_SIZE_PRESETS,
      GN_PAPER_TEMPLATE_GROUPS,
      GN_COVER_TEMPLATE_GROUPS,
      addToolColorSlot,
      removeToolColorSlot,
      getToolColorPresets,
      applyColorFromGnPopover,
      duplicateLassoSelection,
      computeSelectionBounds,
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
      getState: () => state,
      db
    };
  }

  applyDemoStateSynchronously();
  bindEvents();
  initGoodnotesExtensions();
  initGnTemplateLibraryModal();
  initNewFeaturesPack();
  updateToolbarActiveState();
  renderWorldTextCards();
  fitPageToViewport();
  requestRender();
  loadFromIndexedDB();
  registerOfflineServiceWorker();
})();
