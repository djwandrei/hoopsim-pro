// Pass-5 diagnostics: variance, correlation, and independence audit for the
// pass-4 champion configuration. Scratch only — evidence, not app code.
// Follows the ledger protocol: design-matrix stats use warmup seasons only
// (strictly prior info); residual independence tests use eval-season
// predictions from the champion's chronological rolling-origin run.
'use strict';
const H = require('./harness2.cjs');
const PF = require('./playerFeatures.cjs');

const BASE_T = ['hp10', 'ap10', 'hpa10', 'apa10', 'restMean', 'g7Mean', 'etMean', 'hp20', 'ap20', 'hpa20', 'apa20'];
const CHAMP_T = [...BASE_T, 'venueTotMean', 'totAdv10'];
const BASE_M = ['pfAdv10', 'defAdv10', 'wrAdv10', 'restAdv', 'g7Adv', 'strAdv', 'emAdv', 'eloAdv', 'pfAdv20', 'defAdv20', 'wrAdv20', 'pfAdv5', 'defAdv5', 'venueAdv'];
const CHAMP_M = [...BASE_M, 'eloAdv_12h50m', 'rStrAdv90'];
const PGSET = ['availAdv5', 'availAdv8', 'missAdv10', 'minTop5Adv'];
const CFG = { total: CHAMP_T, margin: CHAMP_M, recHalf: 270, stratProb: true, stratCut: 6, probScale: 1 };

const PG_FNS = {
  availAdv5: (h, a) => diffPg(h, a, 'a5roll3'),
  availAdv8: (h, a) => diffPg(h, a, 'a8roll3'),
  missAdv10: (h, a) => diffPg(h, a, 'miss10'),
  minTop5Adv: (h, a) => diffPg(h, a, 'minTop5roll5'),
};
const OK_SIDE = s => s && s.nPrior >= 3;
const diffPg = (h, a, k) => OK_SIDE(h) && OK_SIDE(a) && h[k] != null && a[k] != null ? h[k] - a[k] : 0;

function solveLinear(M, d) {
  const A = M.map(row => Float64Array.from(row));
  for (let c = 0; c < d; c++) {
    let p = c; for (let r = c + 1; r < d; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-9) return null;
    const t = A[c]; A[c] = A[p]; A[p] = t;
    for (let r = c + 1; r < d; r++) { const m = A[r][c] / A[c][c]; for (let j = c; j <= d; j++) A[r][j] -= m * A[c][j]; }
  }
  const x = new Float64Array(d + 1);
  for (let i = d - 1; i >= 0; i--) { let s = A[i][d]; for (let j = i + 1; j < d; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
  return x;
}

function scaleStats(v) {
  let s = 0, s2 = 0; for (const x of v) { s += x; s2 += x * x; }
  const n = v.length || 1, mean = s / n;
  return { mean, sd: Math.sqrt(Math.max(1e-9, s2 / n - mean * mean)), rms: Math.sqrt(s2 / n) || 1 };
}

// Replicates the champion's standardized design matrix (harness2.runCandidate2).
function buildDesign(db, pg) {
  const { feats, F_TOTAL, F_MARGIN, scaleT, scaleM, WARMUP_YEARS } = db;
  const iT = CHAMP_T.map(k => F_TOTAL.indexOf(k));
  const iM = CHAMP_M.map(k => F_MARGIN.indexOf(k));
  if (iT.some(i => i < 0) || iM.some(i => i < 0)) throw new Error('unknown feature');
  // Name-based column lookup (index-safe: matches harness2's F_TOTAL[i]/F_MARGIN[i]
  // semantics without relying on positional alignment).
  const stdT = feats.map(f => CHAMP_T.map(name => { const i = F_TOTAL.indexOf(name); return (f.T[name] - scaleT[i].mean) / scaleT[i].sd; }));
  const rawM0 = feats.map(f => { const s = pg.get(f.g.ref); return PGSET.map(n => PG_FNS[n](s?.home, s?.away)); });
  const warmMask = feats.map(f => WARMUP_YEARS.includes(f.season));
  const scPg = PGSET.map((_, j) => scaleStats(rawM0.filter((_, i) => warmMask[i]).map(r => r[j])));
  const stdM = feats.map((f, i) => [...CHAMP_M.map(name => { const k = F_MARGIN.indexOf(name); return f.M[name] / scaleM[k].rms; }), ...rawM0[i].map((v, j) => v / scPg[j].rms)]);
  return { stdT, stdM, namesT: CHAMP_T, namesM: [...CHAMP_M, ...PGSET.map(n => 'pg:' + n)], warmMask };
}

const pearson = (x, y) => {
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0; const n = x.length;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxy += x[i] * y[i]; sx2 += x[i] * x[i]; sy2 += y[i] * y[i]; }
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sx2 / n - (sx / n) ** 2, vy = sy2 / n - (sy / n) ** 2;
  return cov / Math.sqrt(Math.max(1e-12, vx * vy));
};

// Gauss-Jordan inverse (full pivoting not needed for SPD correlation matrices).
function invert(A0) {
  const d = A0.length;
  const A = A0.map((r, i) => { const row = Array.from(r); const e = new Array(d).fill(0); e[i] = 1; return row.concat(e); });
  for (let c = 0; c < d; c++) {
    let p = c; for (let r = c + 1; r < d; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null; // singular
    const t = A[c]; A[c] = A[p]; A[p] = t;
    const piv = A[c][c];
    for (let j = 0; j < 2 * d; j++) A[c][j] /= piv;
    for (let r = 0; r < d; r++) {
      if (r === c) continue;
      const m = A[r][c];
      if (!m) continue;
      for (let j = 0; j < 2 * d; j++) A[r][j] -= m * A[c][j];
    }
  }
  return A.map(row => row.slice(d));
}

// VIF by direct regression: R²_j from regressing column j on the others
// (intercept included), VIF = 1/(1−R²). Numerically robust vs matrix inversion.
function vifFromCols(cols) {
  const d = cols.length, n = cols[0].length;
  const ones = new Array(n).fill(1);
  return cols.map((y, j) => {
    const X = [ones, ...cols.filter((_, k) => k !== j)];
    const p = X.length;
    const A = Array.from({ length: p }, () => new Float64Array(p + 1));
    for (let a = 0; a < p; a++) {
      for (let b = a; b < p; b++) {
        let s = 0; const xa = X[a], xb = X[b];
        for (let i = 0; i < n; i++) s += xa[i] * xb[i];
        A[a][b] = s; A[b][a] = s;
      }
      let sb = 0; const xa = X[a], yy = y;
      for (let i = 0; i < n; i++) sb += xa[i] * yy[i];
      A[a][p] = sb;
    }
    let tr = 0; for (let a = 0; a < p; a++) tr += A[a][a];
    const ridge = 1e-8 * (tr / p); // scaled to matrix magnitude
    for (let a = 0; a < p; a++) A[a][a] += ridge;
    const beta = solveLinear(A, p);
    if (!beta) return { vif: Infinity, r2: 1 };
    let rss = 0, tss = 0; const ym = y.reduce((s, x) => s + x, 0) / n;
    for (let i = 0; i < n; i++) {
      let pr = 0; for (let a = 0; a < p; a++) pr += beta[a] * X[a][i];
      rss += (y[i] - pr) ** 2; tss += (y[i] - ym) ** 2;
    }
    const r2 = 1 - rss / tss;
    return { vif: +Math.max(0, 1 / Math.max(1e-12, 1 - r2)).toFixed(2), r2: +r2.toFixed(4) };
  });
}

// Jacobi eigenvalues for a symmetric matrix → condition number of the
// correlation matrix (collinearity severity in one number).
function conditionNumber(C) {
  const d = C.length;
  const A = C.map(r => Float64Array.from(r));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) off += A[i][j] * A[i][j];
    if (off < 1e-18) break;
    for (let p = 0; p < d; p++) for (let q = p + 1; q < d; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < d; k++) { const Akp = A[k][p], Akq = A[k][q]; A[k][p] = c * Akp - s * Akq; A[k][q] = s * Akp + c * Akq; }
      for (let k = 0; k < d; k++) { const Apk = A[p][k], Aqk = A[q][k]; A[p][k] = c * Apk - s * Aqk; A[q][k] = s * Apk + c * Aqk; }
    }
  }
  const eig = Array.from({ length: d }, (_, i) => A[i][i]).sort((a, b) => a - b);
  if (!isFinite(eig[0]) || !isFinite(eig[d - 1])) return { min_eig: null, max_eig: null, cond: null };
  return { min_eig: +eig[0].toFixed(8), max_eig: +eig[d - 1].toFixed(5), cond: +(eig[d - 1] / Math.max(eig[0], 1e-12)).toFixed(1) };
}

function corrPairs(names, cols, threshold) {
  const C = cols.map((_, j) => cols.map((_, k) => j === k ? 1 : pearson(cols[j], cols[k])));
  const pairs = [];
  for (let j = 0; j < names.length; j++) for (let k = j + 1; k < names.length; k++) {
    if (Math.abs(C[j][k]) >= threshold) pairs.push({ a: names[j], b: names[k], r: +C[j][k].toFixed(3) });
  }
  pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  return { pairs, C };
}

function varianceTable(names, cols, warmIdx) {
  return names.map((name, j) => {
    const v = cols[j].filter((_, i) => warmIdx[i]);
    const st = scaleStats(v);
    const zeros = v.filter(x => Math.abs(x) < 1e-10).length;
    return { name, mean: +st.mean.toFixed(4), sd: +st.sd.toFixed(4), cv: Math.abs(st.sd / (st.mean || 1e-9)) > 100 ? null : +(Math.abs(st.sd / st.mean)).toFixed(3), pctZero: +(100 * zeros / v.length).toFixed(1) };
  });
}

async function main() {
  const db = await H.load();
  const pg = await PF.attachPlayerFeatures(db);
  const { stdT, stdM, namesT, namesM, warmMask } = buildDesign(db, pg);
  const warmIdx = warmMask.map(v => v);
  const colsT = namesT.map((_, j) => stdT.map(r => r[j]));
  const colsM = namesM.map((_, j) => stdM.map(r => r[j]));

  // 1. Variance — raw-scale feature values (interpretable mean/sd/CV/zeros).
  const rawT = namesT.map(name => db.feats.map(f => f.T[name]));
  const rawM = namesM.map(name => name.startsWith('pg:')
    ? db.feats.map(f => { const s = pg.get(f.g.ref); return PG_FNS[name.slice(3)](s?.home, s?.away); })
    : db.feats.map(f => f.M[name]));
  const varT = varianceTable(namesT, rawT, warmIdx);
  const varM = varianceTable(namesM, rawM, warmIdx);

  // 2. Correlation on standardized warmup design.
  const corrT = corrPairs(namesT, colsT, 0.7);
  const corrM = corrPairs(namesM, colsM, 0.7);

  // 3. NaN audit on design columns (VIF/Jacobi are NaN-poisoning sensitive).
  const nanAudit = (names, cols) => names.map((name, j) => ({ name, nan: cols[j].filter(x => !Number.isFinite(x)).length })).filter(x => x.nan > 0);
  const nanT = nanAudit(namesT, colsT), nanM = nanAudit(namesM, colsM);
  if (nanT.length || nanM.length) throw new Error(`NaN columns: ${JSON.stringify([...nanT, ...nanM])}`);

  // 3. VIF via direct regression + condition numbers from Jacobi eigenvalues.
  const vifT = vifFromCols(colsT);
  const vifM = vifFromCols(colsM);
  const vifOut = (names, v) => names.map((name, j) => ({ name, vif: v[j].vif, r2: v[j].r2 })).sort((a, b) => b.vif - a.vif);

  // 3b. Exact-dependency check: totAdv10 vs the pf/pa quadruple identity
  // totAdv10 = (hp10 + hpa10) − (ap10 + apa10) (full-window rows are exact).
  const dev = db.feats.map(f => f.T.totAdv10 - ((f.T.hp10 + f.T.hpa10) - (f.T.ap10 + f.T.apa10)));
  const identCheck = { max_abs_dev: +Math.max(...dev.map(Math.abs)).toFixed(4), sd_of_dev: +scaleStats(dev).sd.toFixed(4) };

  // 4. Independence: champion run residuals over eval seasons.
  const out = H.runCandidate2(db, CFG);
  const EVAL = new Set(db.EVAL_YEARS);
  const rows = out.filter(r => EVAL.has(r.season));
  const res = rows.map(r => r.obsM - r.margin);
  const n = res.length;
  const mean = res.reduce((s, x) => s + x, 0) / n;
  let s2 = 0; for (const x of res) s2 += (x - mean) ** 2;
  const sd = Math.sqrt(s2 / n);
  // lag-1 autocorrelation over the chronological residual sequence
  let num = 0; for (let i = 1; i < n; i++) num += (res[i] - mean) * (res[i - 1] - mean);
  const lag1 = num / s2;
  const dw = res.slice(1).reduce((s, x, i) => s + (x - res[i]) ** 2, 0) / s2;
  // Heteroskedasticity: residual sd within predicted-margin strata
  const strat = { close: [], mid: [], blowout: [] };
  for (const r of rows) {
    const e = r.obsM - r.margin, am = Math.abs(r.margin);
    (am < 5 ? strat.close : am < 10 ? strat.mid : strat.blowout).push(e);
  }
  const stratSd = {};
  for (const [k, v] of Object.entries(strat)) {
    const m2 = v.reduce((s, x) => s + x, 0) / v.length;
    stratSd[k] = { n: v.length, sd: +Math.sqrt(v.reduce((s, x) => s + (x - m2) ** 2, 0) / v.length).toFixed(3) };
  }
  const hetRatio = stratSd.blowout.sd / stratSd.close.sd;
  // |resid| vs |pred margin| correlation (variance-predictability check)
  const absE = rows.map(r => Math.abs(r.obsM - r.margin));
  const absP = rows.map(r => Math.abs(r.margin));
  const absCorr = +pearson(absE, absP).toFixed(3);
  // Per-season bias + observed/predicted margin sd
  const bias = db.EVAL_YEARS.map(y => {
    const rs = out.filter(r => r.season === y);
    const e = rs.map(r => r.obsM - r.margin);
    const pm = rs.map(r => r.margin), om = rs.map(r => r.obsM);
    const mE = e.reduce((s, x) => s + x, 0) / e.length;
    const vP = pm.reduce((s, x) => s + x * x, 0) / pm.length - (pm.reduce((s, x) => s + x, 0) / pm.length) ** 2;
    const vO = om.reduce((s, x) => s + x * x, 0) / om.length - (om.reduce((s, x) => s + x, 0) / om.length) ** 2;
    return { season: y, n: e.length, bias: +mE.toFixed(3), predSd: +Math.sqrt(Math.max(0, vP)).toFixed(2), obsSd: +Math.sqrt(Math.max(0, vO)).toFixed(2) };
  });

  return {
    nGames: db.feats.length, nWarm: warmIdx.filter(Boolean).length, nEval: n,
    variance: { total: varT, margin: varM },
    correlation: {
      margin_pairs_ge0_7: corrM.pairs, total_pairs_ge0_7: corrT.pairs,
      margin_max_abs_r: corrM.pairs.length ? corrM.pairs[0].r : null,
      total_max_abs_r: corrT.pairs.length ? corrT.pairs[0].r : null,
    },
    vif: { total: vifOut(namesT, vifT), margin: vifOut(namesM, vifM) },
    condition: { total: conditionNumber(corrT.C), margin: conditionNumber(corrM.C) },
    dependency_check: identCheck,
    residuals: { n, mean: +mean.toFixed(4), sd: +sd.toFixed(3), lag1_autocorr: +lag1.toFixed(4), durbin_watson: +dw.toFixed(3), het_strata: stratSd, het_ratio_blowout_vs_close: +hetRatio.toFixed(2), abs_resid_vs_abs_pred_corr: absCorr, by_season: bias },
  };
}

module.exports = { main, CFG, pearson, vifFromCols, conditionNumber, invert };
if (require.main === module) main().then(r => console.log(JSON.stringify(r, null, 1))).catch(e => { console.error(e); process.exit(1); });