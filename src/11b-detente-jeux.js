  // ==================== DÉTENTE : NOUVEAUX JEUX (JETONS FICTIFS UNIQUEMENT) ====================
  // Roue de la fortune, Plinko, ticket à gratter, dés (Sic Bo simplifié).
  // Tout passe par le portefeuille de 11-detente.js (detenteAddBalance, detenteLog, saveDetenteState).
  // Gains exprimés en multiplicateur de RETOUR (la mise est comprise) : gain net = mise × (multiplicateur − 1).
  // Toutes les mises sont des multiples de 10 : tous les multiplicateurs (une décimale) donnent des entiers exacts.
  const DJ_STORAGE_KEY = 'inkflow.detente.jeux.v1';
  const DJ_TABS = ['wheel', 'plinko', 'scratch'];
  const DJ_BETS = [10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  const DJ_HISTORY_MAX = 10;
  const DJ_SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- Roue de la fortune : 24 cases équiprobables ----------
  // 8 cases ×0, 4 ×0,5, 7 ×1, 1 ×1,5, 2 ×2, 1 ×3, 1 ×5 : somme 22,5 / 24 = 93,75 %
  const WF_SEGMENTS = [2, 0, 1, 0.5, 0, 1.5, 1, 0, 3, 1, 0.5, 0, 1, 2, 0, 0.5, 1, 0, 5, 1, 0.5, 0, 1, 0];
  const WF_STEP = 360 / WF_SEGMENTS.length;
  const WF_PEG_WINDOW = 4.2; // degrés de roue pendant lesquels un ergot pousse le pointeur
  const WF_MAX_DEFLECT = 26; // degrés

  // ---------- Plinko : multiplicateurs de la moitié gauche (bord vers centre), symétriques ----------
  const PL_ROWS = [8, 12, 16];
  const PL_RISKS = ['low', 'mid', 'high'];
  const PL_RISK_LABELS = { low: 'bas', mid: 'moyen', high: 'élevé' };
  const PL_HALF = {
    low: {
      8: [4.7, 2.7, 1.4, 0.7, 0.5],
      12: [7.2, 5, 3.2, 1.9, 1.1, 0.6, 0.5],
      16: [9.6, 7.3, 5.3, 3.7, 2.5, 1.5, 0.9, 0.6, 0.5]
    },
    mid: {
      8: [9.9, 4.3, 1.5, 0.4, 0.3],
      12: [17.7, 10.4, 5.4, 2.5, 0.9, 0.4, 0.3],
      16: [26.3, 17.7, 11.3, 6.6, 3.5, 1.7, 0.7, 0.4, 0.3]
    },
    high: {
      8: [25.7, 6.2, 1, 0.2, 0.2],
      12: [65.8, 26.6, 8.8, 2.2, 0.5, 0.2, 0.2],
      16: [132.8, 68.2, 31.7, 12.8, 4.3, 1.2, 0.3, 0.2, 0.2]
    }
  };
  const PL_MAX_BALLS = 4;

  // ---------- Ticket à gratter : trois montants identiques gagnent ce montant ----------
  // Poids sur 10 000 : 1 × 100, 10 × 50, 70 × 20, 200 × 10, 500 × 5, 900 × 2, 1 200 × 1 : 9 500 / 10 000 = 95,0 %
  const SC_PRIZES = [
    { mult: 100, w: 1 }, { mult: 50, w: 10 }, { mult: 20, w: 70 }, { mult: 10, w: 200 },
    { mult: 5, w: 500 }, { mult: 2, w: 900 }, { mult: 1, w: 1200 }, { mult: 0, w: 7119 }
  ];
  const SC_TOTAL_WEIGHT = 10000;
  const SC_SYMBOLS = [1, 2, 5, 10, 20, 50, 100];
  const SC_CELLS = 6;
  const SC_REVEAL_RATIO = 0.55;
  const SC_BRUSH = 26;

  // ---------- Dés (Sic Bo simplifié) : trois dés, un pari par partie ----------
  const DC_SIDE_MULT = 2; // petit (4 à 10) ou grand (11 à 17), perdu sur un triple : 105/216
  const DC_TRIPLE_MULT = 33; // n'importe quel triple : 6/216
  const DC_TOTAL_MULT = { 4: 66, 5: 33, 6: 20, 7: 13.5, 8: 9.5, 9: 8, 10: 7.5, 11: 7.5, 12: 8, 13: 9.5, 14: 13.5, 15: 20, 16: 33, 17: 66 };
  const DC_KINDS = ['small', 'big', 'total', 'triple'];
  const DC_PIPS = {
    1: [[32, 32]],
    2: [[20, 20], [44, 44]],
    3: [[20, 20], [32, 32], [44, 44]],
    4: [[20, 20], [44, 20], [20, 44], [44, 44]],
    5: [[20, 20], [44, 20], [32, 32], [20, 44], [44, 44]],
    6: [[20, 18], [44, 18], [20, 32], [44, 32], [20, 46], [44, 46]]
  };

  const dj = {
    loaded: false,
    bound: false,
    sub: 'scratch', // sous-onglet du panneau « Grattage et dés »
    wheel: { betIdx: 2, spinning: false, angle: 0, def: 0, vel: 0, lastTick: 0, history: [] },
    plinko: { betIdx: 2, rows: 12, risk: 'mid', balls: [], raf: 0, history: [], geo: null },
    scratch: { betIdx: 2, ticket: null, history: [], strokes: [], drawing: null, w: 0, h: 0, dpr: 1, lastCheck: 0, fading: false },
    dice: { betIdx: 2, kind: 'small', total: 10, rolling: false, faces: [1, 4, 6], history: [], lastTick: 0 }
  };

  // ---------- Utilitaires ----------
  function djEl(id) {
    return document.getElementById(id);
  }

  function djFmt(n) {
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }

  function djPct(x, digits = 1) {
    return `${(x * 100).toFixed(digits).replace('.', ',')} %`;
  }

  // Classe de couleur d'un multiplicateur (légende, cases, pions)
  function djTier(m) {
    if (m <= 0) return 't0';
    if (m < 1) return 't1';
    if (m < 2) return 't2';
    if (m < 5) return 't3';
    if (m < 20) return 't4';
    return 't5';
  }

  function djPayout(bet, mult) {
    return Math.round(bet * mult);
  }

  function djBet(game) {
    return DJ_BETS[dj[game].betIdx];
  }

  function djRandomPick(list) {
    return list[detenteRandomInt(list.length)];
  }

  function djShuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = detenteRandomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function djSvgEl(tag, attrs) {
    const el = document.createElementNS(DJ_SVG_NS, tag);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  function djCanAfford(game, msgId) {
    if (detenteState.balance >= djBet(game)) return true;
    setDetenteMessage(msgId, DETENTE_BROKE_HINT, 'muted');
    return false;
  }

  // ---------- Persistance (clé propre : ne touche pas au format du portefeuille) ----------
  function djSave() {
    try {
      localStorage.setItem(DJ_STORAGE_KEY, JSON.stringify({
        sub: dj.sub,
        wheel: { betIdx: dj.wheel.betIdx, history: dj.wheel.history },
        plinko: { betIdx: dj.plinko.betIdx, rows: dj.plinko.rows, risk: dj.plinko.risk, history: dj.plinko.history },
        scratch: { betIdx: dj.scratch.betIdx, ticket: dj.scratch.ticket, history: dj.scratch.history },
        dice: { betIdx: dj.dice.betIdx, kind: dj.dice.kind, total: dj.dice.total, history: dj.dice.history }
      }));
    } catch (_) { /* stockage indisponible : sans conséquence */ }
  }

  function djLoad() {
    if (dj.loaded) return;
    dj.loaded = true;
    try {
      const raw = localStorage.getItem(DJ_STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return;
      const idx = (v, fallback) => (Number.isInteger(v) && v >= 0 && v < DJ_BETS.length ? v : fallback);
      const hist = (v, ok) => (Array.isArray(v) ? v.filter(ok).slice(0, DJ_HISTORY_MAX) : []);
      if (d.sub === 'scratch' || d.sub === 'dice') dj.sub = d.sub;
      if (d.wheel) {
        dj.wheel.betIdx = idx(d.wheel.betIdx, dj.wheel.betIdx);
        dj.wheel.history = hist(d.wheel.history, (h) => h && Number.isFinite(h.mult));
      }
      if (d.plinko) {
        dj.plinko.betIdx = idx(d.plinko.betIdx, dj.plinko.betIdx);
        if (PL_ROWS.includes(d.plinko.rows)) dj.plinko.rows = d.plinko.rows;
        if (PL_RISKS.includes(d.plinko.risk)) dj.plinko.risk = d.plinko.risk;
        dj.plinko.history = hist(d.plinko.history, (h) => h && Number.isFinite(h.mult));
      }
      if (d.scratch) {
        dj.scratch.betIdx = idx(d.scratch.betIdx, dj.scratch.betIdx);
        dj.scratch.history = hist(d.scratch.history, (h) => h && Number.isFinite(h.mult));
        const t = d.scratch.ticket;
        if (t && DJ_BETS.includes(t.bet) && Array.isArray(t.cells) && t.cells.length === SC_CELLS
          && t.cells.every((c) => SC_SYMBOLS.includes(c)) && Number.isFinite(t.mult)) {
          dj.scratch.ticket = { bet: t.bet, cells: t.cells.slice(), mult: t.mult, settled: Boolean(t.settled) };
        }
      }
      if (d.dice) {
        dj.dice.betIdx = idx(d.dice.betIdx, dj.dice.betIdx);
        if (DC_KINDS.includes(d.dice.kind)) dj.dice.kind = d.dice.kind;
        if (Number.isInteger(d.dice.total) && d.dice.total >= 4 && d.dice.total <= 17) dj.dice.total = d.dice.total;
        dj.dice.history = hist(d.dice.history, (h) => h && Array.isArray(h.faces) && h.faces.length === 3 && Number.isFinite(h.mult));
      }
    } catch (_) { /* données illisibles : valeurs par défaut */ }
  }

  // ---------- Solde, relevé, sons ----------
  // Une ligne de relevé par jeu et par séance (parties regroupées, solde net), pour ne pas
  // chasser du relevé les prêts et les envois du banquier.
  function djLog(label, net) {
    const last = detenteState.ledger[0];
    const now = Date.now();
    if (last && last.label === label && now - last.t < 15 * 60 * 1000) {
      last.delta += net;
      last.count = (last.count || 1) + 1;
      last.t = now;
      last.balance = detenteState.balance;
      saveDetenteState();
      if (state.detentePageOpen && detenteState.tab === 'bank') renderDetenteBank();
    } else {
      detenteLog(label, net);
    }
  }

  // Crédite le gain, inscrit le net au relevé, anime le solde et joue le carillon.
  function djSettle(label, bet, payout) {
    const start = detenteState.balance;
    if (payout > 0) {
      detenteAddBalance(payout);
      animateDetenteBalance(start, detenteState.balance);
      if (payout > bet) playDetenteChime(payout >= bet * 10);
      else playDetenteTone(659.25, 0, 0.3, 0.08);
    }
    djLog(label, payout - bet);
    djSave();
  }

  function djRoundText(bet, payout, head) {
    const net = payout - bet;
    if (payout <= 0) return { text: `${head} : perdu.`, tone: 'muted' };
    if (net > 0) return { text: `${head} : +${formatJetons(net)} jetons`, tone: 'win' };
    if (net === 0) return { text: `${head} : mise rendue.`, tone: '' };
    return { text: `${head} : retour de ${formatJetons(payout)} jetons (−${formatJetons(-net)}).`, tone: 'muted' };
  }

  function djPlayTick(slot, minGap, freq, dur, peak) {
    const now = performance.now();
    if (now - slot.lastTick < minGap) return;
    slot.lastTick = now;
    playDetenteTone(freq, 0, dur, peak);
  }

  function djPills(history, id) {
    const el = djEl(id);
    if (!el) return;
    el.innerHTML = history.length
      ? history.map((h) => `<span class="dj-pill dj-${djTier(h.mult)}">${h.mult > 0 ? `×${djFmt(h.mult)}` : '×0'}</span>`).join('')
      : '<span class="detente-history-empty">Aucune partie.</span>';
  }

  // Liste « multiplicateur : probabilité » d'une loi donnée par {mult: probabilité}
  function djDistributionRows(dist, rightFn) {
    return Object.keys(dist).map(Number).sort((a, b) => b - a).map((m) => (
      `<li><span class="dj-pt-l"><i class="dj-swatch dj-${djTier(m)}"></i>×${djFmt(m)}</span><span class="dj-pt-r">${rightFn(m, dist[m])}</span></li>`
    )).join('');
  }

  function djRtpOf(dist) {
    return Object.keys(dist).reduce((s, m) => s + Number(m) * dist[m], 0);
  }

  // ==================== ROUE DE LA FORTUNE ====================
  function wfDistribution() {
    const dist = {};
    WF_SEGMENTS.forEach((m) => { dist[m] = (dist[m] || 0) + 1 / WF_SEGMENTS.length; });
    return dist;
  }

  function wfBuild() {
    const svg = djEl('wfWheel');
    if (!svg) return;
    const rOut = 90;
    const rIn = 24;
    const toXY = (deg, r) => {
      const a = (deg - 90) * Math.PI / 180;
      return [(Math.cos(a) * r).toFixed(2), (Math.sin(a) * r).toFixed(2)];
    };
    let segs = '';
    let pegs = '';
    WF_SEGMENTS.forEach((m, i) => {
      const a0 = i * WF_STEP;
      const a1 = (i + 1) * WF_STEP;
      const [x0, y0] = toXY(a0, rOut);
      const [x1, y1] = toXY(a1, rOut);
      const [x2, y2] = toXY(a1, rIn);
      const [x3, y3] = toXY(a0, rIn);
      const mid = a0 + WF_STEP / 2;
      const label = m > 0 ? `×${djFmt(m)}` : '×0';
      segs += `<g class="wf-seg dj-${djTier(m)}" data-i="${i}"><path d="M${x0} ${y0} A${rOut} ${rOut} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${rIn} ${rIn} 0 0 0 ${x3} ${y3} Z"/>`
        + `<text transform="rotate(${mid.toFixed(2)}) translate(0 -${rOut - 6}) rotate(-90)" text-anchor="end" dominant-baseline="central">${label}</text></g>`;
      const [px, py] = toXY(a0, rOut + 4.5);
      pegs += `<circle class="wf-peg" cx="${px}" cy="${py}" r="2.7"/>`;
    });
    svg.innerHTML = `<circle class="wf-rim" r="102"/><g id="wfRotor">${segs}<circle class="wf-hub-ring" r="${rIn}"/>${pegs}<circle class="wf-hub" r="13"/></g>`
      + '<g id="wfPointer"><path class="wf-pointer" d="M-7.5 -122 L7.5 -122 L0 -90 Z"/><circle class="wf-pivot" cx="0" cy="-116" r="3.2"/></g>';
    wfSetRotor(dj.wheel.angle);
    wfSetPointer(0);
  }

  function wfSetRotor(angle) {
    djEl('wfRotor')?.setAttribute('transform', `rotate(${(angle % 360).toFixed(2)})`);
  }

  function wfSetPointer(def) {
    djEl('wfPointer')?.setAttribute('transform', `rotate(${def.toFixed(2)} 0 -116)`);
  }

  function wfRender() {
    const rows = djDistributionRows(wfDistribution(), (m, p) => {
      const count = Math.round(p * WF_SEGMENTS.length);
      return `${count} ${count > 1 ? 'cases' : 'case'} · ${djPct(p)}`;
    });
    const pt = djEl('wfPaytable');
    if (pt) pt.innerHTML = rows;
    djPills(dj.wheel.history, 'wfHistory');
    wfSetRotor(dj.wheel.angle);
    djRenderHud();
  }

  function wfSpin() {
    const w = dj.wheel;
    if (w.spinning || !state.detentePageOpen) return false;
    if (!djCanAfford('wheel', 'wfResult')) return false;
    const bet = djBet('wheel');
    getDetenteAudioCtx();
    detenteAddBalance(-bet);
    w.spinning = true;
    document.querySelectorAll('#wfWheel .wf-seg.win').forEach((el) => el.classList.remove('win'));
    document.getElementById('wfStage')?.classList.remove('won', 'won-big');
    setDetenteMessage('wfResult', 'La roue tourne…', '');
    djRenderHud();

    const idx = detenteRandomInt(WF_SEGMENTS.length);
    const offset = (detenteRandomInt(1001) / 1000 - 0.5) * 0.4 * WF_STEP; // reste loin des ergots
    const targetLocal = idx * WF_STEP + WF_STEP / 2 + offset;
    const targetMod = ((-targetLocal) % 360 + 360) % 360;
    const a0 = w.angle;
    const a0Mod = ((a0 % 360) + 360) % 360;
    const reduced = isDetenteReducedMotion();
    const a1 = a0 + (reduced ? 1 : 4 + detenteRandomInt(2)) * 360 + ((targetMod - a0Mod + 360) % 360);
    const duration = reduced ? 800 : 5200 + detenteRandomInt(900);
    const t0 = performance.now();
    let prev = t0;
    let prevSegCount = Math.floor(a0 / WF_STEP);
    w.def = 0;
    w.vel = 0;

    const frame = (now) => {
      const t = state.detentePageOpen ? Math.min(1, (now - t0) / duration) : 1;
      const angle = a0 + (a1 - a0) * (1 - Math.pow(1 - t, 3.2));
      wfSetRotor(angle);
      if (!reduced) {
        const dt = Math.min(0.03, Math.max(0.001, (now - prev) / 1000));
        prev = now;
        // Cliquet : chaque ergot qui passe sous le pointeur le pousse puis le relâche (ressort amorti)
        const rel = ((angle % WF_STEP) + WF_STEP) % WF_STEP;
        const segCount = Math.floor(angle / WF_STEP);
        const crossed = segCount > prevSegCount;
        prevSegCount = segCount;
        w.vel += (-2600 * w.def - 34 * w.vel) * dt;
        w.def += w.vel * dt;
        if (rel >= WF_STEP - WF_PEG_WINDOW && t < 1) {
          w.def = -WF_MAX_DEFLECT * (rel - (WF_STEP - WF_PEG_WINDOW)) / WF_PEG_WINDOW;
          w.vel = 0;
        } else if (crossed) {
          w.def = -WF_MAX_DEFLECT;
          w.vel = 0;
        }
        if (crossed && t < 1) djPlayTick(w, 55, 520 + (segCount % 3) * 40, 0.035, 0.05);
        wfSetPointer(Math.max(-WF_MAX_DEFLECT, Math.min(3, w.def)));
      }
      if (t < 1) { requestAnimationFrame(frame); return; }
      w.angle = a1 % 360;
      w.def = 0;
      w.vel = 0;
      wfSetPointer(0);
      wfFinish(idx, bet);
    };
    requestAnimationFrame(frame);
    return true;
  }

  function wfFinish(idx, bet) {
    const w = dj.wheel;
    w.spinning = false;
    const mult = WF_SEGMENTS[idx];
    const payout = djPayout(bet, mult);
    w.history.unshift({ mult });
    w.history = w.history.slice(0, DJ_HISTORY_MAX);
    const segEl = document.querySelector(`#wfWheel .wf-seg[data-i="${idx}"]`);
    if (segEl) segEl.classList.add('win');
    const res = djRoundText(bet, payout, `Case ×${djFmt(mult)}`);
    setDetenteMessage('wfResult', mult <= 0 ? 'Case ×0 : pas cette fois.' : res.text, res.tone);
    const stage = djEl('wfStage');
    if (stage && payout > bet) {
      void stage.offsetWidth;
      stage.classList.add(payout >= bet * 5 ? 'won-big' : 'won');
    }
    djSettle('Roue de la fortune', bet, payout);
    wfRender();
  }

  // ==================== PLINKO ====================
  function plTable(rows, risk) {
    const half = PL_HALF[risk][rows];
    return half.concat(half.slice(0, -1).reverse());
  }

  function plBinomial(n) {
    const p = [1];
    for (let k = 1; k <= n; k++) p.push(p[k - 1] * (n - k + 1) / k);
    return p.map((c) => c / Math.pow(2, n));
  }

  function plDistribution(rows, risk) {
    const table = plTable(rows, risk);
    const p = plBinomial(rows);
    const dist = {};
    table.forEach((m, k) => { dist[m] = (dist[m] || 0) + p[k]; });
    return dist;
  }

  function plGeometry(rows) {
    const W = 400;
    const dx = Math.min(34, 360 / (rows + 1));
    const dy = dx * 0.9;
    const y0 = 26;
    const ballR = dx * 0.2;
    const pegR = dx * 0.085;
    const binH = Math.max(18, dx * 0.82);
    const binY = y0 + rows * dy + 2;
    return { W, H: binY + binH + 8, dx, dy, y0, ox: W / 2, ballR, pegR, binH, binY, rows };
  }

  function plBuild() {
    const svg = djEl('plBoard');
    if (!svg) return;
    const p = dj.plinko;
    const g = plGeometry(p.rows);
    p.geo = g;
    const table = plTable(p.rows, p.risk);
    let pegs = '';
    for (let i = 0; i < p.rows; i++) {
      for (let j = 0; j <= i; j++) {
        const x = g.ox + (j - i / 2) * g.dx;
        const y = g.y0 + i * g.dy;
        pegs += `<circle class="pl-peg" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${g.pegR.toFixed(2)}"/>`;
      }
    }
    let bins = '';
    const fs = Math.min(10, g.dx * 0.36);
    table.forEach((m, k) => {
      const cx = g.ox + (k - p.rows / 2) * g.dx;
      bins += `<g class="pl-bin dj-${djTier(m)}" data-k="${k}"><rect x="${(cx - g.dx / 2 + 1.5).toFixed(2)}" y="${g.binY.toFixed(2)}" width="${(g.dx - 3).toFixed(2)}" height="${g.binH.toFixed(2)}" rx="4"/>`
        + `<text x="${cx.toFixed(2)}" y="${(g.binY + g.binH / 2).toFixed(2)}" text-anchor="middle" dominant-baseline="central" style="font-size:${fs.toFixed(1)}px">${djFmt(m)}</text></g>`;
    });
    svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H.toFixed(1)}`);
    svg.innerHTML = `${bins}${pegs}<g id="plBalls"></g>`;
  }

  function plRender() {
    const p = dj.plinko;
    document.querySelectorAll('#plRisk [data-risk]').forEach((b) => {
      const on = b.dataset.risk === p.risk;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = p.balls.length > 0;
    });
    document.querySelectorAll('#plRows [data-rows]').forEach((b) => {
      const on = Number(b.dataset.rows) === p.rows;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = p.balls.length > 0;
    });
    const dist = plDistribution(p.rows, p.risk);
    const pt = djEl('plPaytable');
    if (pt) pt.innerHTML = djDistributionRows(dist, (m, prob) => djPct(prob, prob < 0.001 ? 3 : 2));
    const note = djEl('plRtpNote');
    if (note) note.textContent = `Retour théorique : ${djPct(djRtpOf(dist))} (${p.rows} rangées, risque ${PL_RISK_LABELS[p.risk]}).`;
    djPills(p.history, 'plHistory');
    djRenderHud();
  }

  function plSetConfig(rows, risk) {
    const p = dj.plinko;
    if (p.balls.length) return;
    if (PL_ROWS.includes(rows)) p.rows = rows;
    if (PL_RISKS.includes(risk)) p.risk = risk;
    plBuild();
    plRender();
    djSave();
  }

  // Chemin de la bille : points de contact (au sommet de chaque ergot) puis la case d'arrivée
  function plBuildPath(bits, g) {
    const hit = g.pegR + g.ballR;
    const pts = [{ x: g.ox, y: g.y0 - 24 }];
    let j = 0;
    for (let i = 0; i < g.rows; i++) {
      pts.push({ x: g.ox + (j - i / 2) * g.dx, y: g.y0 + i * g.dy - hit, peg: i * (i + 1) / 2 + j });
      j += bits[i];
    }
    pts.push({ x: g.ox + (j - g.rows / 2) * g.dx, y: g.binY + g.binH * 0.45, bin: j });
    return pts;
  }

  function plDrop() {
    const p = dj.plinko;
    if (p.balls.length >= PL_MAX_BALLS || !state.detentePageOpen) return false;
    if (!djCanAfford('plinko', 'plResult')) return false;
    const bet = djBet('plinko');
    getDetenteAudioCtx();
    detenteAddBalance(-bet);
    const g = p.geo || plGeometry(p.rows);
    const bits = [];
    for (let i = 0; i < p.rows; i++) bits.push(detenteRandomInt(2));
    const k = bits.reduce((a, b) => a + b, 0);
    const mult = plTable(p.rows, p.risk)[k];
    const reduced = isDetenteReducedMotion();
    const pts = plBuildPath(bits, g);
    const durs = pts.slice(1).map((pt, s) => (reduced ? 40 : (s === 0 ? 200 : (s === pts.length - 2 ? 170 : 125))));
    const el = djSvgEl('circle', { class: 'pl-ball', r: g.ballR.toFixed(2), cx: pts[0].x.toFixed(2), cy: pts[0].y.toFixed(2) });
    djEl('plBalls')?.appendChild(el);
    p.balls.push({ bet, k, mult, pts, durs, el, t0: performance.now(), seg: 0, reduced, rows: p.rows });
    setDetenteMessage('plResult', p.balls.length > 1 ? `${p.balls.length} billes en jeu…` : 'La bille descend…', '');
    plRender();
    if (!p.raf) p.raf = requestAnimationFrame(plFrame);
    return true;
  }

  function plFlash(pegIndex) {
    const el = document.querySelectorAll('#plBoard .pl-peg')[pegIndex];
    if (!el) return;
    el.classList.add('hit');
    setTimeout(() => el.classList.remove('hit'), 190);
  }

  function plFrame(now) {
    const p = dj.plinko;
    p.raf = 0;
    const g = p.geo;
    p.balls.slice().forEach((b) => {
      const closed = !state.detentePageOpen;
      let elapsed = closed ? Infinity : now - b.t0;
      let s = 0;
      let acc = 0;
      while (s < b.durs.length && elapsed >= acc + b.durs[s]) { acc += b.durs[s]; s++; }
      // Contacts franchis depuis la dernière image : éclat de l'ergot et tic discret
      while (b.seg < s) {
        const pt = b.pts[b.seg + 1];
        if (pt && pt.peg !== undefined && !b.reduced && !closed) {
          plFlash(pt.peg);
          playDetenteTone(640 + detenteRandomInt(240), 0, 0.03, 0.03);
        }
        b.seg++;
      }
      if (s >= b.durs.length) { plLand(b); return; }
      const u = (elapsed - acc) / b.durs[s];
      const a = b.pts[s];
      const c = b.pts[s + 1];
      let y;
      if (s === 0) y = a.y + (c.y - a.y) * u * u; // chute libre sur le premier ergot
      else y = a.y + (c.y - a.y) * u - (s === b.durs.length - 1 ? 0.22 : 0.42) * g.dy * 4 * u * (1 - u); // rebond puis chute
      b.el.setAttribute('cx', (a.x + (c.x - a.x) * u).toFixed(2));
      b.el.setAttribute('cy', y.toFixed(2));
    });
    if (p.balls.length) p.raf = requestAnimationFrame(plFrame);
  }

  function plLand(b) {
    const p = dj.plinko;
    p.balls = p.balls.filter((x) => x !== b);
    b.el.remove();
    const payout = djPayout(b.bet, b.mult);
    const bin = document.querySelector(`#plBoard .pl-bin[data-k="${b.k}"]`);
    if (bin && b.rows === p.rows) {
      bin.classList.add('hit');
      setTimeout(() => bin.classList.remove('hit'), 420);
    }
    p.history.unshift({ mult: b.mult });
    p.history = p.history.slice(0, DJ_HISTORY_MAX);
    const res = djRoundText(b.bet, payout, `Case ×${djFmt(b.mult)}`);
    setDetenteMessage('plResult', res.text, res.tone);
    djSettle('Plinko', b.bet, payout);
    plRender();
  }

  // ==================== TICKET À GRATTER ====================
  function scDistribution() {
    const dist = {};
    SC_PRIZES.forEach((pz) => { dist[pz.mult] = pz.w / SC_TOTAL_WEIGHT; });
    return dist;
  }

  function scDraw() {
    const r = detenteRandomInt(SC_TOTAL_WEIGHT);
    let acc = 0;
    for (let i = 0; i < SC_PRIZES.length; i++) {
      acc += SC_PRIZES[i].w;
      if (r < acc) return SC_PRIZES[i].mult;
    }
    return 0;
  }

  // Six cases : trois montants identiques si gain, sinon jamais plus de deux identiques
  function scLayout(mult) {
    const pool = [];
    SC_SYMBOLS.forEach((m) => { if (m !== mult) { pool.push(m); pool.push(m); } });
    const decoys = djShuffle(pool).slice(0, mult > 0 ? SC_CELLS - 3 : SC_CELLS);
    const cells = mult > 0 ? decoys.concat([mult, mult, mult]) : decoys;
    return djShuffle(cells);
  }

  function scBuy() {
    const sc = dj.scratch;
    if (!state.detentePageOpen || (sc.ticket && !sc.ticket.settled)) return false;
    if (!djCanAfford('scratch', 'scResult')) return false;
    const bet = djBet('scratch');
    detenteAddBalance(-bet);
    const mult = scDraw();
    sc.ticket = { bet, cells: scLayout(mult), mult, settled: false };
    sc.strokes = [];
    sc.w = 0; // force la repeinture de l'argenture
    djSave();
    setDetenteMessage('scResult', 'Gratte les six cases : trois montants identiques gagnent.', '');
    scRenderTicket();
    djRenderHud();
    return true;
  }

  function scRenderTicket() {
    const grid = djEl('scGrid');
    const sc = dj.scratch;
    if (!grid) return;
    const t = sc.ticket;
    const cells = t ? t.cells : new Array(SC_CELLS).fill(null);
    grid.innerHTML = cells.map((m) => (
      `<div class="sc-cell${m ? ` dj-${djTier(m)}` : ''}" data-m="${m || ''}"><span>${m ? `×${m}` : ''}</span></div>`
    )).join('');
    if (t && t.settled) scMarkWinners();
    djEl('scTicket')?.classList.toggle('idle', !t);
    djEl('scTicket')?.classList.toggle('done', Boolean(t && t.settled));
    scLayoutCanvas();
  }

  function scMarkWinners() {
    const t = dj.scratch.ticket;
    if (!t || t.mult <= 0) return;
    document.querySelectorAll('#scGrid .sc-cell').forEach((c) => c.classList.toggle('win', Number(c.dataset.m) === t.mult));
  }

  // Taille et peinture de l'argenture ; rejoue les coups déjà donnés si la taille change
  function scLayoutCanvas() {
    const sc = dj.scratch;
    const canvas = djEl('scCanvas');
    const grid = djEl('scGrid');
    if (!canvas || !grid || !canvas.getContext) return;
    const t = sc.ticket;
    const live = Boolean(t && !t.settled);
    canvas.classList.toggle('hidden', !live);
    if (!live) return;
    const rect = grid.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w < 8 || h < 8) return; // panneau masqué : on repeint à l'affichage
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (sc.w === w && sc.h === h && sc.dpr === dpr) return;
    sc.w = w;
    sc.h = h;
    sc.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(canvas);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = css.getPropertyValue('--dj-silver').trim() || '#b4bac6';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = css.getPropertyValue('--dj-silver-line').trim() || 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = -h; k < w; k += 7) { ctx.moveTo(k, h); ctx.lineTo(k + h, 0); }
    ctx.stroke();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = SC_BRUSH;
    sc.strokes.forEach((stroke) => {
      ctx.beginPath();
      stroke.forEach((pt, i) => { if (i) ctx.lineTo(pt[0] * w, pt[1] * h); else ctx.moveTo(pt[0] * w, pt[1] * h); });
      if (stroke.length === 1) ctx.lineTo(stroke[0][0] * w + 0.01, stroke[0][1] * h);
      ctx.stroke();
    });
  }

  function scScratchTo(e, first) {
    const sc = dj.scratch;
    const canvas = djEl('scCanvas');
    const d = sc.drawing;
    if (!canvas || !d || !sc.w) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const events = !first && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const list = events.length ? events : [e];
    list.forEach((ev) => {
      const x = Math.max(0, Math.min(sc.w, ev.clientX - rect.left));
      const y = Math.max(0, Math.min(sc.h, ev.clientY - rect.top));
      const pressure = ev.pointerType === 'pen' && ev.pressure > 0 ? 0.65 + ev.pressure * 0.7 : 1;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = SC_BRUSH * pressure;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(x + 0.01, y);
      ctx.stroke();
      d.x = x;
      d.y = y;
      d.stroke.push([x / sc.w, y / sc.h]);
    });
  }

  // Part de l'argenture déjà grattée (échantillonnage grossier de l'alpha)
  function scScratchedRatio() {
    const canvas = djEl('scCanvas');
    if (!canvas || !canvas.width) return 0;
    try {
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const stride = Math.max(1, Math.round(canvas.width / 90));
      let clear = 0;
      let total = 0;
      for (let y = 0; y < canvas.height; y += stride) {
        for (let x = 0; x < canvas.width; x += stride) {
          total++;
          if (data[(y * canvas.width + x) * 4 + 3] < 40) clear++;
        }
      }
      return total ? clear / total : 0;
    } catch (_) { return 0; }
  }

  function scCheckProgress() {
    const t = dj.scratch.ticket;
    if (!t || t.settled) return;
    if (scScratchedRatio() >= SC_REVEAL_RATIO) scRevealAll();
  }

  function scRevealAll() {
    const sc = dj.scratch;
    const t = sc.ticket;
    if (!t || t.settled || sc.fading) return false;
    sc.drawing = null;
    const finish = () => {
      sc.fading = false;
      sc.strokes = [];
      scSettle();
    };
    const canvas = djEl('scCanvas');
    if (canvas && !isDetenteReducedMotion() && state.detentePageOpen) {
      sc.fading = true;
      canvas.classList.add('fading');
      setTimeout(() => { canvas.classList.remove('fading'); finish(); }, 320);
    } else {
      finish();
    }
    return true;
  }

  function scSettle() {
    const sc = dj.scratch;
    const t = sc.ticket;
    if (!t || t.settled) return;
    t.settled = true;
    const payout = djPayout(t.bet, t.mult);
    sc.history.unshift({ mult: t.mult });
    sc.history = sc.history.slice(0, DJ_HISTORY_MAX);
    scRenderTicket();
    const head = t.mult > 0 ? `Trois ×${t.mult}` : 'Aucun triplet';
    const res = djRoundText(t.bet, payout, head);
    setDetenteMessage('scResult', res.text, res.tone);
    djSettle('Ticket à gratter', t.bet, payout);
    scRenderHistory();
    djRenderHud();
  }

  function scRenderHistory() {
    djPills(dj.scratch.history, 'scHistory');
  }

  function scBind() {
    const canvas = djEl('scCanvas');
    if (!canvas) return;
    const sc = dj.scratch;
    canvas.addEventListener('pointerdown', (e) => {
      const t = sc.ticket;
      if (!t || t.settled || sc.fading || e.button > 0 || !sc.w) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(sc.w, e.clientX - rect.left));
      const y = Math.max(0, Math.min(sc.h, e.clientY - rect.top));
      sc.drawing = { id: e.pointerId, x, y, stroke: [[x / sc.w, y / sc.h]] };
      sc.strokes.push(sc.drawing.stroke);
      scScratchTo(e, true);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!sc.drawing || sc.drawing.id !== e.pointerId) return;
      scScratchTo(e, false);
      const now = performance.now();
      if (now - sc.lastCheck > 350) { sc.lastCheck = now; scCheckProgress(); }
    });
    const end = (e) => {
      if (!sc.drawing || sc.drawing.id !== e.pointerId) return;
      sc.drawing = null;
      scCheckProgress();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  // ==================== DÉS (SIC BO SIMPLIFIÉ) ====================
  function dcMultiplier(faces, kind, total) {
    const sum = faces[0] + faces[1] + faces[2];
    const triple = faces[0] === faces[1] && faces[1] === faces[2];
    if (kind === 'small') return !triple && sum >= 4 && sum <= 10 ? DC_SIDE_MULT : 0;
    if (kind === 'big') return !triple && sum >= 11 && sum <= 17 ? DC_SIDE_MULT : 0;
    if (kind === 'total') return sum === total ? DC_TOTAL_MULT[total] : 0;
    return triple ? DC_TRIPLE_MULT : 0;
  }

  // Calcul exact sur les 216 tirages : { chance, retour théorique } d'un pari
  function dcBetStats(kind, total) {
    let wins = 0;
    let ret = 0;
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        for (let c = 1; c <= 6; c++) {
          const m = dcMultiplier([a, b, c], kind, total);
          if (m > 0) { wins++; ret += m; }
        }
      }
    }
    return { chance: wins / 216, rtp: ret / 216, wins };
  }

  function dcCurrentMult() {
    const d = dj.dice;
    if (d.kind === 'small' || d.kind === 'big') return DC_SIDE_MULT;
    return d.kind === 'total' ? DC_TOTAL_MULT[d.total] : DC_TRIPLE_MULT;
  }

  function dcDieSvg(v) {
    const pips = DC_PIPS[v].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.6" fill="currentColor" stroke="none"/>`).join('');
    return `<svg class="dj-die-svg" width="72" height="72" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="54" height="54" rx="13"/>${pips}</svg>`;
  }

  function dcRenderDice() {
    document.querySelectorAll('#dcDice .dj-die').forEach((el, i) => { el.innerHTML = dcDieSvg(dj.dice.faces[i] || 1); });
  }

  function dcRender() {
    const d = dj.dice;
    document.querySelectorAll('#dcKinds [data-kind]').forEach((b) => {
      const on = b.dataset.kind === d.kind;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = d.rolling;
    });
    const totals = djEl('dcTotals');
    if (totals) {
      totals.classList.toggle('hidden', d.kind !== 'total');
      if (!totals.dataset.built) {
        totals.dataset.built = '1';
        totals.innerHTML = Object.keys(DC_TOTAL_MULT).map((n) => `<button type="button" class="dj-seg-btn" data-total="${n}" aria-pressed="false">${n}</button>`).join('');
      }
      totals.querySelectorAll('[data-total]').forEach((b) => {
        const on = Number(b.dataset.total) === d.total;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.disabled = d.rolling;
      });
    }
    const info = djEl('dcBetInfo');
    if (info) {
      const st = dcBetStats(d.kind, d.total);
      const names = { small: 'Petit (4 à 10, hors triple)', big: 'Grand (11 à 17, hors triple)', total: `Total ${d.total}`, triple: 'Triple (trois dés identiques)' };
      info.textContent = `${names[d.kind]} : retour ×${djFmt(dcCurrentMult())}, ${djPct(st.chance)} de chances.`;
    }
    dcRenderDice();
    const list = djEl('dcHistory');
    if (list) {
      list.innerHTML = d.history.length
        ? d.history.map((h) => `<li><span class="dj-h-faces">${h.faces.join(' · ')}</span><span class="dj-h-total">${h.faces[0] + h.faces[1] + h.faces[2]}</span><span class="dj-h-mult dj-${djTier(h.mult)}">${h.mult > 0 ? `×${djFmt(h.mult)}` : '×0'}</span></li>`).join('')
        : '<li class="detente-history-empty">Aucun lancer.</li>';
    }
    djRenderHud();
  }

  function dcRoll() {
    const d = dj.dice;
    if (d.rolling || !state.detentePageOpen) return false;
    if (!djCanAfford('dice', 'dcResult')) return false;
    const bet = djBet('dice');
    getDetenteAudioCtx();
    detenteAddBalance(-bet);
    d.rolling = true;
    const final = [0, 1, 2].map(() => detenteRandomInt(6) + 1);
    const reduced = isDetenteReducedMotion();
    const settleAt = [0, 1, 2].map((i) => (reduced ? 250 : 900 + i * 260));
    const dieEls = document.querySelectorAll('#dcDice .dj-die');
    dieEls.forEach((el) => el.classList.toggle('rolling', !reduced));
    setDetenteMessage('dcResult', 'Les dés roulent…', '');
    dcRender();
    const t0 = performance.now();
    let lastShuffle = 0;
    const done = [false, false, false];
    const frame = (now) => {
      const el = state.detentePageOpen ? now - t0 : Infinity;
      for (let i = 0; i < 3; i++) {
        if (done[i]) continue;
        if (el >= settleAt[i]) {
          done[i] = true;
          d.faces[i] = final[i];
          dieEls[i]?.classList.remove('rolling');
          dieEls[i]?.classList.add('landed');
          if (state.detentePageOpen) playDetenteTone(330 + i * 55, 0, 0.07, 0.06);
        } else if (now - lastShuffle > 80) {
          d.faces[i] = detenteRandomInt(6) + 1;
          if (!reduced && i === 0) djPlayTick(d, 150, 420 + detenteRandomInt(80), 0.025, 0.025);
        }
      }
      if (now - lastShuffle > 80) lastShuffle = now;
      dcRenderDice();
      if (done.every(Boolean)) { dcFinish(final, bet); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return true;
  }

  function dcFinish(faces, bet) {
    const d = dj.dice;
    d.rolling = false;
    d.faces = faces.slice();
    document.querySelectorAll('#dcDice .dj-die').forEach((el) => { el.classList.remove('rolling'); setTimeout(() => el.classList.remove('landed'), 400); });
    const mult = dcMultiplier(faces, d.kind, d.total);
    const payout = djPayout(bet, mult);
    const sum = faces[0] + faces[1] + faces[2];
    const triple = faces[0] === faces[1] && faces[1] === faces[2];
    d.history.unshift({ faces: faces.slice(), mult });
    d.history = d.history.slice(0, DJ_HISTORY_MAX);
    const head = `${faces.join(' · ')} = ${sum}${triple ? ' (triple)' : ''}`;
    const res = djRoundText(bet, payout, head);
    setDetenteMessage('dcResult', res.text, res.tone);
    djSettle('Dés (Sic Bo)', bet, payout);
    dcRender();
  }

  // ==================== PANNEAUX, MISES, CLAVIER ====================
  function djChangeBet(game, dir) {
    const g = dj[game];
    if ((game === 'wheel' && g.spinning) || (game === 'dice' && g.rolling)) return;
    if (game === 'scratch' && g.ticket && !g.ticket.settled) return;
    g.betIdx = Math.max(0, Math.min(DJ_BETS.length - 1, g.betIdx + dir));
    djSave();
    djRenderHud();
  }

  function djSetSub(sub) {
    if (sub !== 'scratch' && sub !== 'dice') return;
    dj.sub = sub;
    djSave();
    djRenderSub();
    if (sub === 'scratch') scLayoutCanvas();
  }

  function djRenderSub() {
    document.querySelectorAll('#djSub [data-sub]').forEach((b) => {
      const on = b.dataset.sub === dj.sub;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.querySelectorAll('#detentePage [data-dj-sub]').forEach((s) => s.classList.toggle('hidden', s.dataset.djSub !== dj.sub));
    djRenderHud();
  }

  // Mises, boutons actifs ou non, selon le jeu affiché
  function djRenderHud() {
    const bal = detenteState.balance;
    const setBet = (id, game) => { const el = djEl(id); if (el) el.textContent = formatJetons(djBet(game)); };
    const setDis = (id, v) => { const el = djEl(id); if (el) el.disabled = Boolean(v); };
    const steppers = (down, up, game, locked) => {
      setDis(down, locked || dj[game].betIdx <= 0);
      setDis(up, locked || dj[game].betIdx >= DJ_BETS.length - 1);
    };
    setBet('wfBet', 'wheel');
    setBet('plBet', 'plinko');
    setBet('scBet', 'scratch');
    setBet('dcBet', 'dice');
    const wf = dj.wheel;
    steppers('btnWfBetDown', 'btnWfBetUp', 'wheel', wf.spinning);
    setDis('btnWfSpin', wf.spinning || bal < djBet('wheel'));
    const pl = dj.plinko;
    steppers('btnPlBetDown', 'btnPlBetUp', 'plinko', false);
    setDis('btnPlDrop', pl.balls.length >= PL_MAX_BALLS || bal < djBet('plinko'));
    const sc = dj.scratch;
    const live = Boolean(sc.ticket && !sc.ticket.settled);
    steppers('btnScBetDown', 'btnScBetUp', 'scratch', live);
    setDis('btnScBuy', live || bal < djBet('scratch'));
    setDis('btnScReveal', !live || sc.fading);
    const dc = dj.dice;
    steppers('btnDcBetDown', 'btnDcBetUp', 'dice', dc.rolling);
    setDis('btnDcRoll', dc.rolling || bal < djBet('dice'));
  }

  // Appelé par 11-detente.js quand le solde change : remet à jour les boutons du jeu affiché
  function renderDetenteGamesHud() {
    if (dj.bound && DJ_TABS.includes(detenteState.tab)) djRenderHud();
  }

  function renderDetenteGamesPanel(tab) {
    if (!dj.bound) return;
    if (tab === 'wheel') wfRender();
    else if (tab === 'plinko') plRender();
    else if (tab === 'scratch') {
      djRenderSub();
      scRenderTicket();
      scRenderHistory();
      dcRender();
    }
  }

  // Action principale du jeu affiché (Espace ou Entrée)
  function djPrimaryAction() {
    const tab = detenteState.tab;
    if (tab === 'wheel') wfSpin();
    else if (tab === 'plinko') plDrop();
    else if (tab === 'scratch') {
      if (dj.sub === 'dice') dcRoll();
      else if (dj.scratch.ticket && !dj.scratch.ticket.settled) scRevealAll();
      else scBuy();
    }
  }

  function handleDetenteGamesKeydown(e, tag) {
    if (!DJ_TABS.includes(detenteState.tab) || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.target && e.target.closest && e.target.closest('#detenteTabs')) return false; // flèches : navigation des onglets
    if (e.key === ' ' || e.key === 'Enter') {
      if (tag === 'BUTTON' || tag === 'INPUT') return false; // comportement natif du bouton
      e.preventDefault();
      djPrimaryAction();
      return true;
    }
    const game = detenteState.tab === 'scratch' ? (dj.sub === 'dice' ? 'dice' : 'scratch') : detenteState.tab === 'plinko' ? 'plinko' : 'wheel';
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === '+') { e.preventDefault(); djChangeBet(game, 1); return true; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === '-') { e.preventDefault(); djChangeBet(game, -1); return true; }
    return false;
  }

  // ==================== PROBABILITÉS (calculées) ====================
  // Taux de retour théoriques de chaque jeu, calculés ici (aussi exposés aux tests)
  function getDetenteGamesRtp() {
    const plinko = {};
    PL_RISKS.forEach((risk) => PL_ROWS.forEach((rows) => { plinko[`${rows}-${risk}`] = djRtpOf(plDistribution(rows, risk)); }));
    const dice = { small: dcBetStats('small', 0).rtp, big: dcBetStats('big', 0).rtp, triple: dcBetStats('triple', 0).rtp };
    for (let n = 4; n <= 17; n++) dice[`total-${n}`] = dcBetStats('total', n).rtp;
    return { wheel: djRtpOf(wfDistribution()), scratch: djRtpOf(scDistribution()), plinko, dice };
  }

  function renderDetenteGamesOdds() {
    const host = djEl('detenteGamesOdds');
    if (!host) return;
    const wfDist = wfDistribution();
    const wfWin = WF_SEGMENTS.filter((m) => m > 1).length / WF_SEGMENTS.length;
    const wfBack = WF_SEGMENTS.filter((m) => m > 0).length / WF_SEGMENTS.length;
    const scDist = scDistribution();
    const scWin = SC_PRIZES.filter((pz) => pz.mult > 0).reduce((s, pz) => s + pz.w, 0) / SC_TOTAL_WEIGHT;
    const card = (title, body) => `<section class="detente-card"><h3 class="detente-card-title">${title}</h3>${body}</section>`;
    const kv = (rows) => `<ul class="detente-kv">${rows.map(([a, b]) => `<li><span>${a}</span><strong>${b}</strong></li>`).join('')}</ul>`;
    const rtpRows = (rtp) => [['Taux de retour (RTP)', djPct(rtp)], ['Avantage de la maison', djPct(1 - rtp)]];

    let html = card('Roue de la fortune', kv(rtpRows(djRtpOf(wfDist)).concat([
      ['Tours gagnants (plus que la mise)', djPct(wfWin)],
      ['Tours avec un retour (au moins ×0,5)', djPct(wfBack)]
    ])) + `<p class="detente-note">24 cases équiprobables : ${Object.keys(wfDist).map(Number).sort((a, b) => b - a).map((m) => `${Math.round(wfDist[m] * 24)} × ×${djFmt(m)}`).join(', ')}. Calcul exact : somme des multiplicateurs divisée par 24.</p>`);

    const pRows = [];
    PL_RISKS.forEach((risk) => PL_ROWS.forEach((rows) => {
      const dist = plDistribution(rows, risk);
      const max = Math.max(...Object.keys(dist).map(Number));
      pRows.push([`${rows} rangées, risque ${PL_RISK_LABELS[risk]} (max ×${djFmt(max)})`, djPct(djRtpOf(dist))]);
    }));
    html += card('Plinko', kv(pRows) + '<p class="detente-note">Chaque rangée envoie la bille à gauche ou à droite avec la même chance : la case d’arrivée suit la loi binomiale (probabilité C(n, k) / 2^n). Taux de retour = somme de probabilité × multiplicateur de chaque case, calculée sur la table affichée. Plus le risque monte, plus les cases du centre rendent peu et celles du bord beaucoup.</p>');

    html += card('Ticket à gratter', kv(rtpRows(djRtpOf(scDist)).concat([['Tickets gagnants', djPct(scWin, 2)]]).concat(
      SC_PRIZES.filter((pz) => pz.mult > 0).map((pz) => [`Trois ×${pz.mult}`, djPct(pz.w / SC_TOTAL_WEIGHT, pz.w < 10 ? 2 : 1)])
    )) + '<p class="detente-note">Le ticket est tiré à l’achat avec le générateur cryptographique, puis la grille est composée pour que la lecture colle au résultat : trois montants identiques gagnent ce montant, jamais plus de deux identiques sur un ticket perdant.</p>');

    const dcRows = [];
    const side = dcBetStats('small', 0);
    dcRows.push([`Petit (4 à 10) ou Grand (11 à 17), hors triple : ${djPct(side.chance)}`, `×${djFmt(DC_SIDE_MULT)} · RTP ${djPct(side.rtp)}`]);
    const trip = dcBetStats('triple', 0);
    dcRows.push([`Triple, n’importe lequel : ${djPct(trip.chance)}`, `×${DC_TRIPLE_MULT} · RTP ${djPct(trip.rtp)}`]);
    for (let n = 4; n <= 10; n++) {
      const st = dcBetStats('total', n);
      dcRows.push([`Total ${n} ou ${21 - n} : ${djPct(st.chance)} chacun`, `×${djFmt(DC_TOTAL_MULT[n])} · RTP ${djPct(st.rtp)}`]);
    }
    html += card('Dés (Sic Bo simplifié)', kv(dcRows) + '<p class="detente-note">Trois dés équilibrés, un seul pari par lancer. Les totaux gagnent même sur un triple ; le petit et le grand le perdent. Calcul exact sur les 216 tirages. Le petit et le grand donnent le meilleur retour.</p>');
    host.innerHTML = html;
  }

  // ==================== INITIALISATION ====================
  function initDetenteGames() {
    if (dj.bound) return;
    dj.bound = true;
    djLoad();
    wfBuild();
    plBuild();
    scBind();
    renderDetenteGamesOdds();

    const on = (id, fn) => djEl(id)?.addEventListener('click', fn);
    on('btnWfSpin', wfSpin);
    on('btnWfBetDown', () => djChangeBet('wheel', -1));
    on('btnWfBetUp', () => djChangeBet('wheel', 1));
    on('btnPlDrop', plDrop);
    on('btnPlBetDown', () => djChangeBet('plinko', -1));
    on('btnPlBetUp', () => djChangeBet('plinko', 1));
    on('btnScBuy', scBuy);
    on('btnScReveal', scRevealAll);
    on('btnScBetDown', () => djChangeBet('scratch', -1));
    on('btnScBetUp', () => djChangeBet('scratch', 1));
    on('btnDcRoll', dcRoll);
    on('btnDcBetDown', () => djChangeBet('dice', -1));
    on('btnDcBetUp', () => djChangeBet('dice', 1));
    djEl('plRisk')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-risk]');
      if (b) plSetConfig(dj.plinko.rows, b.dataset.risk);
    });
    djEl('plRows')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rows]');
      if (b) plSetConfig(Number(b.dataset.rows), dj.plinko.risk);
    });
    djEl('djSub')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sub]');
      if (b) djSetSub(b.dataset.sub);
    });
    djEl('dcKinds')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kind]');
      if (!b || dj.dice.rolling || !DC_KINDS.includes(b.dataset.kind)) return;
      dj.dice.kind = b.dataset.kind;
      djSave();
      dcRender();
    });
    djEl('dcTotals')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-total]');
      if (!b || dj.dice.rolling) return;
      dj.dice.total = Number(b.dataset.total);
      djSave();
      dcRender();
    });
    window.addEventListener('resize', () => {
      if (state.detentePageOpen && detenteState.tab === 'scratch' && dj.sub === 'scratch') scLayoutCanvas();
    });
  }
