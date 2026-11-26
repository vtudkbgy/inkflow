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

