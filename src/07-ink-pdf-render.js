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
    if (typeof clearPdfOutlineAndLinksCache === 'function') {
      clearPdfOutlineAndLinksCache(pdfId);
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

        // Extraction paresseuse des liens internes/externes de cette page PDF avant cleanup()
        if (typeof extractAndCachePdfPageLinks === 'function') {
          try { await extractAndCachePdfPageLinks(pdfDoc, pdfPage, page); } catch (_) {}
        }

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
    if (typeof invalidatePageSpatialIndex === 'function') {
      const active = typeof getActivePage === 'function' ? getActivePage() : null;
      if (active) invalidatePageSpatialIndex(active);
    }
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
    const strokes = (viewBounds && typeof queryPageStrokesInRect === 'function')
      ? queryPageStrokesInRect(page, viewBounds.minX, viewBounds.minY, viewBounds.maxX, viewBounds.maxY, true)
      : (page.strokes || []);
    const shapes = (viewBounds && typeof queryPageShapesInRect === 'function')
      ? queryPageShapesInRect(page, viewBounds.minX, viewBounds.minY, viewBounds.maxX, viewBounds.maxY, true)
      : (page.shapes || []);
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
    if (typeof drawPdfLinkHintsOverlay === 'function') {
      drawPdfLinkHintsOverlay(targetCtx, page);
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
    if (state.splitView && state.splitView.open && page && state.splitView.pageId === page.id) {
      scheduleSplitPaneRender();
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
      if (state.lassoPdfClip) {
        targetCtx.fillStyle = 'rgba(37, 99, 235, 0.06)';
        targetCtx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      }
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

