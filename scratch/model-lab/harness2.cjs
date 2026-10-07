// Experimental harness extension: heteroskedastic margin variance model.
// Reuses load/evalLosses/summarize/pairedDelta from harness.cjs.
'use strict';
const H = require('./harness.cjs');
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
const sqrt2pi = Math.sqrt(2 * Math.PI);
const normPdf = z => Math.exp(-0.5 * z * z) / sqrt2pi;
const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
// Analytic CRPS for N(m, s): s * [ z(2Φ(z)-1) + 2φ(z) - 1/√π ]
const crpsGauss = (m, s, y) => {
  const z = (y - m) / s;
  return s * (z * (2 * normCdf(z) - 1) + 2 * normPdf(z) - 1 / Math.sqrt(Math.PI));
};

// cfg: same as harness.runCandidate plus:
//   varRidge: bool — fit a second ridge on squared margin residuals (same
//   standardized margin features), predict per-game variance, Gaussian prob.
//   lambdaVar: ridge penalty (default 60). varFloor/varCeil: clamp the
//   predicted sd to fractions of the trailing pooled sd (defaults .55/1.8).
//   varBlend: blend predicted variance with pooled variance (1 = full).
const SCALE_STATS = v => { let s = 0, s2 = 0; for (const x of v) { s += x; s2 += x * x; } const n = v.length || 1; const mean = s / n; return { mean, sd: Math.sqrt(Math.max(1e-9, s2 / n - mean * mean)), rms: Math.sqrt(s2 / n) || 1 }; };
// Player-games feature accessors (both sides' stats come strictly from games
// before the target game). Missing sides (early season, no prior games)
// contribute 0 — league-neutral.
const PG_FNS = {
  availAdv5: (h, a) => diffPg(h, a, 'a5roll3'),
  availAdv8: (h, a) => diffPg(h, a, 'a8roll3'),
  availMean5: (h, a) => meanPg(h, a, 'a5roll3'),
  missAdv10: (h, a) => diffPg(h, a, 'miss10'),
  minTop5Adv: (h, a) => diffPg(h, a, 'minTop5roll5'),
  minTop5Mean: (h, a) => meanPg(h, a, 'minTop5roll5'),
};
const OK_SIDE = s => s && s.nPrior >= 3;
const diffPg = (h, a, k) => OK_SIDE(h) && OK_SIDE(a) && h[k] != null && a[k] != null ? h[k] - a[k] : 0;
const meanPg = (h, a, k) => OK_SIDE(h) && OK_SIDE(a) && h[k] != null && a[k] != null ? (h[k] + a[k]) / 2 : 0;

function runCandidate2(db, cfg) {
  const { feats, scaleT, scaleM, F_TOTAL, F_MARGIN, dates } = db;
  const namesT = cfg.total || ['hp10', 'ap10', 'hpa10', 'apa10', 'restMean', 'g7Mean'];
  const namesM = cfg.margin || ['pfAdv10', 'defAdv10', 'wrAdv10', 'restAdv', 'g7Adv', 'strAdv'];
  const iT = namesT.map(k => F_TOTAL.indexOf(k));
  const iM = namesM.map(k => F_MARGIN.indexOf(k));
  const pg = cfg.pg || null;
  const pgTNames = pg ? (cfg.pgTotal || []) : [];
  const pgMNames = pg ? (cfg.pgMargin || []) : [];
  const pgTIdx = pgTNames.map(n => { if (!PG_FNS[n]) throw new Error(`unknown pg feature ${n}`); return n; });
  const pgMIdx = pgMNames.map(n => { if (!PG_FNS[n]) throw new Error(`unknown pg feature ${n}`); return n; });
  let stdT = feats.map(f => iT.map(i => (f.T[F_TOTAL[i]] - db.scaleT[i].mean) / db.scaleT[i].sd));
  let stdM = feats.map(f => iM.map(i => f.M[F_MARGIN[i]] / db.scaleM[i].rms));
  if (pg) {
    const rawPg = (names) => feats.map(f => { const s = pg.get(f.g.ref); return names.map(n => PG_FNS[n](s?.home, s?.away)); });
    const rawT0 = rawPg(pgTIdx), rawM0 = rawPg(pgMIdx);
    const warmMask = feats.map(f => db.WARMUP_YEARS.includes(f.season));
    const scT = pgTIdx.map((_, j) => SCALE_STATS(rawT0.filter((_, i) => warmMask[i]).map(r => r[j])));
    const scM = pgMIdx.map((_, j) => SCALE_STATS(rawM0.filter((_, i) => warmMask[i]).map(r => r[j])));
    stdT = feats.map((f, i) => [...stdT[i], ...rawT0[i].map((v, j) => v / scT[j].rms)]);
    stdM = feats.map((f, i) => [...stdM[i], ...rawM0[i].map((v, j) => v / scM[j].rms)]);
  }
  const dT = stdT[0].length + 1, dM = stdM[0].length + 1;
  const lambdaT = cfg.lambdaT ?? 8, lambdaM = cfg.lambdaM ?? 8;
  const recHalf = cfg.recHalf ?? null, recEvery = cfg.recEvery ?? 12;
  const recency = cfg.recency ?? null;

  const mk = d => ({ A: Array.from({ length: d }, () => new Float64Array(d)), b: new Float64Array(d), n: 0 });
  const addRowInto = (acc, xr, y, w) => {
    const d = acc.b.length;
    for (let i = 0; i < d; i++) { const xi = xr[i] * w; const Ai = acc.A[i]; for (let j = 0; j < d; j++) Ai[j] += xi * xr[j]; acc.b[i] += xi * y; }
    acc.n += w;
  };
  const rebuildDateW = (acc, d, lambda, rows, rowDays, half, curDay) => {
    const nacc = mk(d);
    for (let i = 0; i < rows.length; i++) {
      const w = Math.pow(0.5, (curDay - rowDays[i]) / half);
      addRowInto(nacc, rows[i].slice(0, d), rows[i][d], w);
    }
    for (let i = 1; i < d; i++) nacc.A[i][i] += lambda;
    return nacc;
  };
  const rebuildWeighted = (acc, d, lambda, rows, seasons, curSeason, decay) => {
    const nacc = mk(d);
    for (let i = 0; i < rows.length; i++) {
      const w = Math.pow(decay, Math.max(0, curSeason - seasons[i]));
      addRowInto(nacc, rows[i].slice(0, d), rows[i][d], w);
    }
    for (let i = 1; i < d; i++) nacc.A[i][i] += lambda;
    return nacc;
  };
  const finalize = (acc, d, lambda) => {
    const A = acc.A.map(r => Float64Array.from(r));
    for (let i = 1; i < d; i++) A[i][i] += lambda;
    return A.map((row, i) => { const full = new Float64Array(d + 1); for (let j = 0; j < d; j++) full[j] = row[j]; full[d] = acc.b[i]; return full; });
  };
  const solve = H.runCandidate.length ? require('./harness.cjs') : null; // noop ref
  // solveLinear is not exported from harness.cjs; re-implement locally.
  function solveLinear(M, d) {
    const A = M.map(row => Float64Array.from(row));
    for (let c = 0; c < d; c++) {
      let p = c; for (let r = c + 1; r < d; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-9) return null;
      const t = A[c]; A[c] = A[p]; A[p] = t;
      for (let r = c + 1; r < d; r++) { const m2 = A[r][c] / A[c][c]; for (let j = c; j <= d; j++) A[r][j] -= m2 * A[c][j]; }
    }
    const x = new Float64Array(d + 1);
    for (let i = d - 1; i >= 0; i--) { let s = A[i][d]; for (let j = i + 1; j < d; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
    return x;
  }

  let accT = mk(dT), accM = mk(dM);
  let accV = cfg.varRidge ? mk(dM) : null;
  const rawT = [], rawM = [], rawV = [], seasonRows = [], rawD = [];
  const out = [];
  const residM = [];
  const residDay = []; // day index of each residual, for recency weighting
  const residPairs = []; // [marginAtFit, resid] for kernel-weighted support
  // Margin-stratified residual pools (heteroskedastic across the favorite
  // regime): each past residual joins the pool its own predicted margin was in.
  const stratProb = cfg.stratProb ?? false;
  const stratCut = cfg.stratCut ?? 5;
  const stratHi = cfg.stratHi ?? null;
  const poolS = [], poolMid = [], poolL = [];
  const allResidM = { s: 0, s2: 0, n: 0 };
  const gaussProb = cfg.gaussProb ?? false;
  const varPrior = cfg.varPrior ?? null;
  const probScale = cfg.probScale ?? 1;
  const varFloor = cfg.varFloor ?? 0.55, varCeil = cfg.varCeil ?? 1.8, varBlend = cfg.varBlend ?? 1;
  const lambdaVar = cfg.lambdaVar ?? 60;
  // Online spread calibration: track realized coverage of the 80%/95%
  // intervals over a trailing window and nudge probScale multiplicatively
  // toward the targets (uses only past games — strictly causal).
  const autoStep = cfg.autoScale ?? null;
  const autoWin = cfg.autoWin ?? 250;
  const intLog = []; // {q10, q90, q025, q975, y}
  let autoS = 1.0;
  let curSeason = null, datesSince = 99;
  let bV = null;

  for (const d of dates) {
    const rows = feats.filter(f => f.date === d);
    if (!rows.length) continue;
    const season = rows[0].season;
    if (season !== curSeason) datesSince = 0;
    const wantRebuild = rawT.length > 0 &&
      (recency != null ? season !== curSeason : recHalf != null && datesSince >= recEvery);
    if (wantRebuild) {
      if (recHalf != null) {
        const curDay = db.dateIndex.get(d);
        accT = rebuildDateW(accT, dT, lambdaT, rawT, rawD, recHalf, curDay);
        accM = rebuildDateW(accM, dM, lambdaM, rawM, rawD, recHalf, curDay);
        if (accV && rawV.length) accV = rebuildDateW(accV, dM, lambdaVar, rawV, rawD, recHalf, curDay);
      } else {
        accT = rebuildWeighted(accT, dT, lambdaT, rawT, seasonRows, season, recency);
        accM = rebuildWeighted(accM, dM, lambdaM, rawM, seasonRows, season, recency);
        if (accV && rawV.length) accV = rebuildWeighted(accV, dM, lambdaVar, rawV, seasonRows, season, recency);
      }
      datesSince = 0;
    }
    datesSince++;
    curSeason = season;

    const readyT = accT.n > (dT + 10) * 3;
    const readyM = accM.n > (dM + 10) * 3;
    const readyV = accV && accV.n > (dM + 10) * 4;
    const bT = readyT ? solveLinear(finalize(accT, dT, lambdaT), dT) : null;
    const bM = readyM ? solveLinear(finalize(accM, dM, lambdaM), dM) : null;
    if (readyV) bV = solveLinear(finalize(accV, dM, lambdaVar), dM);
    const wN = residM.length;
    let wm = 0; if (wN) { let s = 0; for (const x of residM) s += x; wm = s / wN; }
    let priorSd = null, recentSd = null, pooledVar = null;
    if (wN > 50) {
      let s2 = 0; for (const x of residM) { const v = x - wm; s2 += v * v; }
      pooledVar = s2 / wN; recentSd = Math.sqrt(pooledVar);
      if (allResidM.n > 100) {
        const mu = allResidM.s / allResidM.n;
        priorSd = Math.sqrt(Math.max(1e-9, allResidM.s2 / allResidM.n - mu * mu));
      }
    }
    const pooledSd = pooledVar != null ? Math.sqrt(pooledVar) : null;

    for (const f of rows) {
      const xT = stdT[f.idx], xM = stdM[f.idx];
      const total = bT ? bT[0] + xT.reduce((s, v, i) => s + v * bT[i + 1], 0) : 226;
      const margin = bM ? bM[0] + xM.reduce((s, v, i) => s + v * bM[i + 1], 0) : 2.5;
      const g = f.g;
      let p = 0.5, crpsM = null, q025, q975, q10, q90;
      const scaleNow = autoStep ? autoS : probScale;
      if (cfg.varRidge && bM && pooledSd) {
        let sd = pooledSd;
        if (bV) {
          const dev = bV[0] + xM.reduce((s, v, i) => s + v * bV[i + 1], 0);
          const varPred = Math.max(varFloor * pooledVar, Math.min(varCeil * varCeil * pooledVar, varBlend * (pooledVar + dev) + (1 - varBlend) * pooledVar));
          sd = Math.sqrt(varPred);
        }
        if (gaussProb && priorSd && varPrior != null && recentSd) {
          const s2 = (varPrior * priorSd * priorSd + wN * sd * sd) / (varPrior + wN);
          sd = Math.sqrt(s2) * probScale;
        }
        p = 0.5 * (1 + erf(margin / (sd * Math.SQRT2)));
        crpsM = crpsGauss(margin, sd, g.hp - g.ap);
        q025 = margin - 1.959964 * sd; q975 = margin + 1.959964 * sd;
        q10 = margin - 1.281552 * sd; q90 = margin + 1.281552 * sd;
      } else if (stratProb && wN) {
        const am = Math.abs(margin);
        const pool = stratHi != null
          ? (am < stratCut ? (poolS.length >= 100 ? poolS : residM) : am < stratHi ? (poolMid.length >= 100 ? poolMid : residM) : (poolL.length >= 100 ? poolL : residM))
          : (am < stratCut ? (poolS.length >= 100 ? poolS : residM) : (poolL.length >= 100 ? poolL : residM));
        let s2 = 0; for (const x of pool) s2 += x;
        const pm = pool.length ? s2 / pool.length : 0;
        const pN = pool.length;
        p = 0.5;
        if (pN) {
          let c = 0;
          for (let i = 0; i < pN; i++) { const v = margin + (pool[i] - pm) * scaleNow; c += v > 0 ? 1 : v === 0 ? 0.5 : 0; }
          p = c / pN;
          if (pN >= 100) {
            const stride = Math.max(1, Math.floor(pN / 300));
            const samples = [];
            for (let i = 0; i < pN; i += stride) samples.push(margin + (pool[i] - pm) * scaleNow);
            samples.sort((a, b) => a - b);
            const n2 = samples.length;
            let term1 = 0; for (const x of samples) term1 += Math.abs(x - margin);
            let term2 = 0; for (let i = 0; i < n2; i++) term2 += (2 * i - n2 + 1) * samples[i];
            crpsM = term1 / n2 - term2 / (n2 * n2);
            const q = pv => samples[Math.min(n2 - 1, Math.max(0, Math.round(pv * (n2 - 1))))];
            q025 = q(0.025); q975 = q(0.975); q10 = q(0.1); q90 = q(0.9);
          }
        }
      } else if (cfg.kernBand && residPairs.length >= 200) {
        // kernel-weighted residual support: weight each past residual by
        // proximity of its game's predicted margin to the current one
        const band = cfg.kernBand;
        const draw = [];
        let wSum = 0;
        for (const [m0, r0] of residPairs) {
          const w = Math.exp(-0.5 * ((m0 - margin) / band) ** 2);
          if (w > 0.005) { draw.push([margin + (r0 - wm) * probScale, w]); wSum += w; }
        }
        if (draw.length >= 60 && wSum > 0) {
          draw.sort((a, b) => a[0] - b[0]);
          let c = 0; for (const [v, w] of draw) c += v > 0 ? w : v === 0 ? 0.5 * w : 0;
          p = c / wSum;
          if (draw.length >= 100) {
            const ws = draw.map(x => x[1]);
            const totW = wSum;
            let term1 = 0, term2 = 0;
            for (let i = 0; i < draw.length; i++) term1 += ws[i] * Math.abs(draw[i][0] - margin);
            // weighted integral term via prefix sums
            let acc = 0; const prefix = [];
            for (let i = 0; i < draw.length; i++) { prefix.push(acc); acc += ws[i]; }
            for (let i = 0; i < draw.length; i++) {
              // F(x_i) with midpoint convention: (prefix + w/2)/totW
              const Fi = (prefix[i] + ws[i] / 2) / totW;
              term2 += (2 * Fi - 1) * ws[i] * draw[i][0];
            }
            crpsM = term1 / totW - term2 / totW;
            const q = pv => {
              let run = 0;
              for (let i = 0; i < draw.length; i++) { run += ws[i]; if (run / totW >= pv) return draw[i][0]; }
              return draw[draw.length - 1][0];
            };
            q025 = q(0.025); q975 = q(0.975); q10 = q(0.1); q90 = q(0.9);
          }
        } else {
          let c = 0;
          for (let i = 0; i < wN; i++) { const v = margin + (residM[i] - wm) * probScale; c += v > 0 ? 1 : v === 0 ? 0.5 : 0; }
          p = c / wN;
        }
      } else if (wN) {
        const rHalf = cfg.residHalf ?? null;
        const curDay = db.dateIndex.get(d);
        const weights = rHalf ? residDay.map(dd => Math.pow(0.5, (curDay - dd) / rHalf)) : null;
        if (weights) {
          // recency-weighted empirical support
          const draw = [];
          let wSum = 0, meanS = 0;
          for (let i = 0; i < wN; i++) { draw.push([residM[i], weights[i]]); wSum += weights[i]; meanS += weights[i] * residM[i]; }
          meanS /= wSum;
          draw.sort((a, b) => a[0] - b[0]);
          let c = 0;
          for (const [r0, w] of draw) { const v = margin + (r0 - meanS) * scaleNow; c += v > 0 ? w : v === 0 ? 0.5 * w : 0; }
          p = c / wSum;
          if (draw.length >= 100) {
            let term1 = 0; for (const [r0, w] of draw) term1 += w * Math.abs(margin + (r0 - meanS) * scaleNow - margin);
            let prefix = 0; let term2 = 0;
            for (const [r0, w] of draw) { const Fi = (prefix + w / 2) / wSum; term2 += (2 * Fi - 1) * w * (r0 - meanS) * scaleNow; prefix += w; }
            crpsM = term1 / wSum - term2 / wSum;
            const q = pv => { let run = 0; for (const [r0, w] of draw) { run += w; if (run / wSum >= pv) return margin + (r0 - meanS) * scaleNow; } return margin + (draw[draw.length - 1][0] - meanS) * scaleNow; };
            q025 = q(0.025); q975 = q(0.975); q10 = q(0.1); q90 = q(0.9);
          }
        } else {
          let c = 0;
          for (let i = 0; i < wN; i++) { const v = margin + (residM[i] - wm) * scaleNow; c += v > 0 ? 1 : v === 0 ? 0.5 : 0; }
          p = c / wN;
          if (wN >= 100) {
            const stride = Math.max(1, Math.floor(wN / 300));
            const samples = [];
            for (let i = 0; i < wN; i += stride) samples.push(margin + (residM[i] - wm) * scaleNow);
            samples.sort((a, b) => a - b);
            const n2 = samples.length;
            let term1 = 0; for (const x of samples) term1 += Math.abs(x - margin);
            let term2 = 0; for (let i = 0; i < n2; i++) term2 += (2 * i - n2 + 1) * samples[i];
            crpsM = term1 / n2 - term2 / (n2 * n2);
            const q = pv => samples[Math.min(n2 - 1, Math.max(0, Math.round(pv * (n2 - 1))))];
            q025 = q(0.025); q975 = q(0.975); q10 = q(0.1); q90 = q(0.9);
          }
        }
      }
      const yT = g.hp + g.ap, yM = g.hp - g.ap;
      if (autoStep && q025 != null) {
        intLog.push({ q10, q90, q025, q975, y: yM });
        if (intLog.length > autoWin) intLog.shift();
        if (intLog.length >= 100 && intLog.length % 25 === 0) {
          const cov80 = intLog.filter(r => r.y >= r.q10 && r.y <= r.q90).length / intLog.length;
          const cov95 = intLog.filter(r => r.y >= r.q025 && r.y <= r.q975).length / intLog.length;
          const err = ((0.8 - cov80) + (0.95 - cov95)) / 2;
          autoS = Math.min(1.35, Math.max(0.7, autoS * (1 + autoStep * err * 4)));
        }
      }
      out.push({ idx: f.idx, season: f.season, date: f.date, obsT: yT, obsM: yM, total, margin, p, crpsM, q025, q975, q10, q90 });
      const rm = yM - margin;
      residM.push(rm); residDay.push(db.dateIndex.get(f.date)); if (residM.length > 1000) { residM.shift(); residDay.shift(); }
      residPairs.push([margin, rm]); if (residPairs.length > 1000) residPairs.shift();
      const amPush = Math.abs(margin);
      const stratPool = stratHi != null ? (amPush < stratCut ? poolS : amPush < stratHi ? poolMid : poolL) : (amPush < stratCut ? poolS : poolL);
      stratPool.push(rm); if (stratPool.length > 1000) stratPool.shift();
      allResidM.s += rm; allResidM.s2 += rm * rm; allResidM.n += 1;
      const xTv = stdT[f.idx];
      const xMv = stdM[f.idx];
      addRowInto(accT, [1, ...xTv], yT, 1); addRowInto(accM, [1, ...xMv], yM, 1);
      rawT.push([1, ...xTv, yT]); rawM.push([1, ...xMv, yM]); seasonRows.push(f.season); rawD.push(db.dateIndex.get(f.date));
      if (accV && bM) { const r2 = rm * rm; addRowInto(accV, [1, ...xMv], r2, 1); rawV.push([1, ...xMv, r2]); }
    }
  }
  return out;
}

module.exports = { runCandidate2, crpsGauss, ...H };