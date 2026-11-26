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

