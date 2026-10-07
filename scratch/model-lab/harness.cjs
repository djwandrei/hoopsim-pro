// Scratch model-development harness for the V4 Game Lab score model.
// NOT app code: never imported by the app; development experiments only.
// Follows the ledger's protocol: strict chronology (features + fits use only
// games strictly before the target local date), rolling origin per local date,
// two-head ridge (intercept unpenalized), residual-support probability, and
// paired date-cluster bootstrap comparisons.
'use strict';

const DATA_BASE = 'https://www.djshouseofcards-comics.com/tools/swishiq-studio/data/';
const V4 = 'v4/releases/v4-site-12ad90dc8710';
const Q = 'v=20261002b';
const WARMUP_YEARS = [2020, 2021];
const EVAL_YEARS = [2022, 2023, 2024, 2025];
const RESID_WINDOW = 1000;
const CRPS_CAP = 300;

async function load() {
  const registry = await (await fetch(`${DATA_BASE}${V4}/registry.json?${Q}`)).json();
  const years = [...WARMUP_YEARS, ...EVAL_YEARS];
  const parts = await Promise.all(years.map(async (year) => {
    const entry = (registry.packages || []).find(p => p?.modelId === 'swishiq-canonical-v4'
      && p?.scope?.kind === 'exact-season' && Number(p?.scope?.seasonStartYear) === year);
    if (!entry) throw new Error(`no package for ${year}`);
    const packageRoot = `${V4}/${String(entry.projectionIndexPath).split('/').slice(0, -1).join('/')}`;
    const index = await (await fetch(`${DATA_BASE}${packageRoot}/index.json?${Q}`)).json();
    const part = (index.artifacts || []).find(a => a.artifactId === 'team-games');
    return (await (await fetch(`${DATA_BASE}${V4}/${part.path}?${Q}`)).json());
  }));
  const byRef = new Map();
  for (const value of parts) {
    for (const row of (value.records || [])) {
      const v = row.values || {};
      if (row.time?.phase !== 'regular' || v.reconciliationStatus !== 'matched' || v.trainingEligible !== true) continue;
      let g = byRef.get(v.gameRef);
      if (!g) { g = { ref: v.gameRef, season: Number(row.time.seasonStartYear), date: v.localGameDate }; byRef.set(v.gameRef, g); }
      if (v.isHome) { g.home = v.teamCode; g.hp = v.pointsFor; g.ha = v.pointsAgainst; }
      else { g.away = v.teamCode; g.ap = v.pointsFor; g.aa = v.pointsAgainst; }
    }
  }
  const games = [...byRef.values()].filter(g => g.home && g.away)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ref < b.ref ? -1 : 1));
  const teams = [...new Set(games.flatMap(g => [g.home, g.away]))].sort();

  const F_TOTAL = ['hp10', 'ap10', 'hpa10', 'apa10', 'hp20', 'ap20', 'hpa20', 'apa20', 'restMean', 'g7Mean', 'etMean'];
  // Elo variant grid: K x HCA x binary/margin updates (FiveThirtyEight-style
  // margin-of-victory multiplier on the margin variants).
  const ELO_GRID = [];
  for (const K of [12, 16, 20, 24, 32]) for (const H of [35, 50, 65]) for (const useM of [false, true]) ELO_GRID.push({ K, H, useM, name: `${K}h${H}${useM ? 'm' : ''}` });
  const elos = new Map(ELO_GRID.map(v => [v.name, new Map(teams.map(t => [t, 1500]))]));
  const F_MARGIN = ['pfAdv10', 'defAdv10', 'wrAdv10', 'restAdv', 'g7Adv', 'strAdv', 'pfAdv5', 'defAdv5', 'wrAdv20', 'pfAdv20', 'defAdv20', 'emAdv', 'eloAdv', 'venueAdv', 'emFastAdv', 'ewrAdv', 'stdAdv10', 'rStrAdv45', 'rStrAdv60', 'rStrAdv90', 'xStrEm', 'xStrRest', 'xEmRest', 'xEloStr', ...ELO_GRID.map(v => `eloAdv_${v.name}`)];
  const day = v => Math.round(Date.parse(v + 'T12:00:00Z') / 86400000);
  const gameDay = new Map(games.map(g => [g.ref, day(g.date)]));
  const dates = []; const byDate = new Map();
  for (const g of games) { if (!byDate.has(g.date)) { byDate.set(g.date, []); dates.push(g.date); } byDate.get(g.date).push(g); }
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const idxOf = new Map(teams.map((t, i) => [t, i]));

  const hist = new Map(teams.map(t => [t, { d: [], pf: [], pa: [], win: [], homePf: [], awayPf: [], em: 0, et: 0, emf: 0, ewr: null }]));
  const elo = new Map(teams.map(t => [t, 1500]));
  let leaguePf = 110, leaguePa = 110, leagueN = 0;
  const feats = [];
  const seasonFirstDate = new Map();
  for (const d of dates) { const s = byDate.get(d)[0].season; if (!seasonFirstDate.has(s)) seasonFirstDate.set(s, d); }

  for (const d of dates) {
    const rows = byDate.get(d);
    const season = rows[0].season;
    if (d === seasonFirstDate.get(season)) {
      for (const t of teams) elo.set(t, 1505 + (elo.get(t) - 1505) * 2 / 3);
      for (const m0 of elos.values()) for (const t of teams) m0.set(t, 1505 + (m0.get(t) - 1505) * 2 / 3);
    }

    // --- SRS opponent-adjusted ratings from games strictly before d ---
    // Base solve uses season-decay weights; recency solves use exponential
    // day-decay over the last ~20 weeks (form-aware, still schedule-adjusted).
    const dim = teams.length + 1; const ic = dim - 1;
    const solveSrs = (weightFn) => {
      const N = new Float64Array(dim * dim); const rhs = new Float64Array(dim);
      for (const g of games) {
        if (dateIndex.get(g.date) >= dateIndex.get(d)) break;
        if (g.season < season - 2) continue;
        const w = weightFn(g);
        if (!w) continue;
        const ih = idxOf.get(g.home), ia = idxOf.get(g.away), m = g.hp - g.ap;
        N[ih * dim + ih] += w; N[ia * dim + ia] += w; N[ih * dim + ia] -= w; N[ia * dim + ih] -= w;
        N[ih * dim + ic] += w; N[ic * dim + ih] += w; N[ia * dim + ic] -= w; N[ic * dim + ia] -= w; N[ic * dim + ic] += w;
        rhs[ih] += w * m; rhs[ia] -= w * m;
      }
      for (let i = 0; i < dim; i++) N[i * dim + i] += i === ic ? 100 : 30;
      const srsMatrix = []; for (let i = 0; i < dim; i++) { const row = new Float64Array(dim + 1); for (let j = 0; j < dim; j++) row[j] = N[i * dim + j]; row[dim] = rhs[i]; srsMatrix.push(row); }
      return solveLinear(srsMatrix, dim);
    };
    const ratings = solveSrs(g => (g.season === season ? 1 : g.season === season - 1 ? 0.6 : 0.3));
    const nowDay = gameDay.get(rows[0].ref);
    const recRatings = {};
    for (const half of [45, 60, 90]) {
      recRatings[half] = solveSrs(g => {
        const back = nowDay - gameDay.get(g.ref);
        if (back < 0 || back > 140) return 0;
        const w = Math.pow(0.5, back / half);
        return w < 0.03 ? 0 : w;
      });
    }
    const strOf = t => (ratings ? ratings[idxOf.get(t)] : 0);
    const recStrOf = (half, t) => { const r = recRatings[half]; return r ? r[idxOf.get(t)] : 0; };

    for (const g of rows) {
      const h = hist.get(g.home), a = hist.get(g.away);
      const priorOf = (x) => {
        let n = 0, sp = 0, sa = 0;
        for (let i = 0; i < x.d.length; i++) { if (x.d[i].slice(0, 4) === String(season - 1)) { sp += x.pf[i]; sa += x.pa[i]; n++; } }
        return n >= 10 ? { p: sp / n, a: sa / n } : { p: leaguePf, a: leaguePa };
      };
      const ph = priorOf(h), pa = priorOf(a);
      const wmean = (arr, n, prior) => { const k = Math.min(n, arr.length); if (!k) return prior; let s = 0; for (let i = arr.length - k; i < arr.length; i++) s += arr[i]; return k >= 3 ? s / k : (s / k * k + prior * 3) / (k + 3); };
      const wmeanN = (arr, n) => { const k = Math.min(n, arr.length); if (!k) return null; let s = 0; for (let i = arr.length - k; i < arr.length; i++) s += arr[i]; return s / k; };
      const hp10 = wmean(h.pf, 10, ph.p), ap10 = wmean(a.pf, 10, pa.p);
      const hpa10 = wmean(h.pa, 10, ph.a), apa10 = wmean(a.pa, 10, pa.a);
      const hp20 = wmean(h.pf, 20, ph.p), ap20 = wmean(a.pf, 20, pa.p);
      const hpa20 = wmean(h.pa, 20, ph.a), apa20 = wmean(a.pa, 20, pa.a);
      const hp5 = wmean(h.pf, 5, ph.p), ap5 = wmean(a.pf, 5, pa.p);
      const hpa5 = wmean(h.pa, 5, ph.a), apa5 = wmean(a.pa, 5, pa.a);
      const hwr10 = wmeanN(h.win, 10), awr10 = wmeanN(a.win, 10), hwr20 = wmeanN(h.win, 20), awr20 = wmeanN(a.win, 20);
      const stdOf = (x) => { const k = Math.min(10, x.pf.length); if (k < 4) return null; const ms = []; for (let i = x.pf.length - k; i < x.pf.length; i++) ms.push(x.pf[i] - x.pa[i]); const mu = ms.reduce((s2, v) => s2 + v, 0) / k; return Math.sqrt(ms.reduce((s2, v) => s2 + (v - mu) * (v - mu), 0) / k); };
      const hStd = stdOf(h), aStd = stdOf(a);
      const restOf = x => x.d.length ? day(d) - day(x.d[x.d.length - 1]) : 3;
      const hRest = restOf(h), aRest = restOf(a);
      const g7Of = x => { const cut = day(d) - 7; let c = 0; for (let i = x.d.length - 1; i >= 0 && day(x.d[i]) > cut; i--) c++; return c; };
      const hG7 = g7Of(h), aG7 = g7Of(a);
      const venueDev = (x, venueList) => { const vMean = wmeanN(venueList, 10); if (vMean == null) return 0; return vMean - wmean(x.pf, 10, leaguePf); };
      const hVenue = venueDev(h, h.homePf), aVenue = venueDev(a, a.awayPf);
      feats.push({
        idx: feats.length, ref: g.ref, season, date: d, g,
        T: { hp10, ap10, hpa10, apa10, hp20, ap20, hpa20, apa20, restMean: (hRest + aRest) / 2, g7Mean: (hG7 + aG7) / 2, etMean: (h.et + a.et) / 2 },
        M: {
          pfAdv10: hp10 - ap10, defAdv10: hpa10 - apa10, wrAdv10: (hwr10 ?? 0.5) - (awr10 ?? 0.5), restAdv: hRest - aRest,
          g7Adv: hG7 - aG7, strAdv: strOf(g.home) - strOf(g.away), pfAdv5: hp5 - ap5, defAdv5: hpa5 - apa5,
          wrAdv20: (hwr20 ?? 0.5) - (awr20 ?? 0.5), pfAdv20: hp20 - ap20, defAdv20: hpa20 - apa20,
          emAdv: h.em - a.em, emFastAdv: h.emf - a.emf, ewrAdv: (h.ewr ?? 0.5) - (a.ewr ?? 0.5), stdAdv10: (hStd ?? 10) - (aStd ?? 10),
          rStrAdv45: recStrOf(45, g.home) - recStrOf(45, g.away), rStrAdv60: recStrOf(60, g.home) - recStrOf(60, g.away), rStrAdv90: recStrOf(90, g.home) - recStrOf(90, g.away),
          xStrEm: (strOf(g.home) - strOf(g.away)) * (h.em - a.em), xStrRest: (strOf(g.home) - strOf(g.away)) * (hRest - aRest),
          xEmRest: (h.em - a.em) * (hRest - aRest), xEloStr: (elo.get(g.home) - elo.get(g.away)) * (strOf(g.home) - strOf(g.away)) / 100,
          eloAdv: (elo.get(g.home) - elo.get(g.away)) / 100, venueAdv: hVenue - aVenue,
        },
      });
      for (const v of ELO_GRID) { const m0 = elos.get(v.name); feats[feats.length - 1].M[`eloAdv_${v.name}`] = (m0.get(g.home) - m0.get(g.away)) / 100; }
    }
    // --- post-date updates ---
    for (const g of rows) {
      const h = hist.get(g.home), a = hist.get(g.away);
      const m = g.hp - g.ap, tot = g.hp + g.ap;
      h.d.push(g.date); h.pf.push(g.hp); h.pa.push(g.ha); h.win.push(m > 0 ? 1 : 0); h.homePf.push(g.hp);
      h.em = h.em * 0.88 + 0.12 * m; h.et = h.et * 0.88 + 0.12 * tot;
      h.emf = h.emf * 0.8 + 0.2 * m; h.ewr = (h.ewr == null ? 0.5 : h.ewr * 0.8) + 0.2;
      a.d.push(g.date); a.pf.push(g.ap); a.pa.push(g.aa); a.win.push(m < 0 ? 1 : 0); a.awayPf.push(g.ap);
      a.em = a.em * 0.88 - 0.12 * m; a.et = a.et * 0.88 + 0.12 * tot;
      a.emf = a.emf * 0.8 - 0.2 * m; a.ewr = (a.ewr == null ? 0.5 : a.ewr * 0.8) + 0.2 * (m < 0 ? 1 : 0);
      leaguePf = (leaguePf * leagueN + g.hp) / (leagueN + 1); leaguePa = (leaguePa * leagueN + g.ha) / (leagueN + 1); leagueN += 2;
      const eH = elo.get(g.home), eA = elo.get(g.away);
      const p = 1 / (1 + Math.pow(10, -(eH - eA + 50) / 400));
      const act = m > 0 ? 1 : 0;
      elo.set(g.home, eH + 20 * (act - p)); elo.set(g.away, eA - 20 * (act - p));
      for (const v of ELO_GRID) {
        const m0 = elos.get(v.name);
        const eH2 = m0.get(g.home), eA2 = m0.get(g.away);
        const pr2 = 1 / (1 + Math.pow(10, -(eH2 - eA2 + v.H) / 400));
        const act2 = m > 0 ? 1 : 0;
        const upd2 = v.useM
          ? v.K * (act2 - pr2) * (Math.pow(Math.abs(m) + 3, 0.8) / 7.5)
          : v.K * (act2 - pr2);
        m0.set(g.home, eH2 + upd2); m0.set(g.away, eA2 - upd2);
      }
    }
  }

  // frozen standardization from warmup seasons only (strictly prior info)
  const warm = feats.filter(f => WARMUP_YEARS.includes(f.season));
  const scaleT = F_TOTAL.map(k => scaleStats(warm.map(r => r.T[k])));
  const scaleM = F_MARGIN.map(k => scaleStats(warm.map(r => r.M[k])));
  return { games, teams, dates, dateIndex, feats, F_TOTAL, F_MARGIN, scaleT, scaleM, WARMUP_YEARS, EVAL_YEARS };
}

function scaleStats(v) {
  const n = v.length; let s = 0, s2 = 0;
  for (const x of v) { s += x; s2 += x * x; }
  const mean = s / n;
  return { mean, sd: Math.sqrt(Math.max(1e-9, s2 / n - mean * mean)), rms: Math.sqrt(s2 / n) || 1 };
}

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

// ---- candidate run (rolling origin per local date) ----
// cfg: { lambdaT, lambdaM, total: [...], margin: [...], probScale,
//        gaussProb: bool, varPrior: number, recency: decay^seasonsBack }
function runCandidate(db, cfg) {
  const { feats, scaleT, scaleM, F_TOTAL, F_MARGIN, dates, byDateRef } = { ...db, byDateRef: null };
  void byDateRef;
  const namesT = cfg.total || ['hp10', 'ap10', 'hpa10', 'apa10', 'restMean', 'g7Mean'];
  const namesM = cfg.margin || ['pfAdv10', 'defAdv10', 'wrAdv10', 'restAdv', 'g7Adv', 'strAdv'];
  const iT = namesT.map(k => F_TOTAL.indexOf(k));
  const iM = namesM.map(k => F_MARGIN.indexOf(k));
  if (iT.some(i => i < 0) || iM.some(i => i < 0)) throw new Error('unknown feature');
  const dT = namesT.length + 1, dM = namesM.length + 1;
  const lambdaT = cfg.lambdaT ?? 8, lambdaM = cfg.lambdaM ?? 8;

  // standardized per-game vectors
  const stdT = feats.map(f => iT.map(i => (f.T[F_TOTAL[i]] - scaleT[i].mean) / scaleT[i].sd));
  const stdM = feats.map(f => iM.map(i => f.M[F_MARGIN[i]] / scaleM[i].rms));

  // incremental accumulators
  const mk = d => ({ A: Array.from({ length: d }, () => new Float64Array(d)), b: new Float64Array(d), n: 0 });
  let accT = mk(dT), accM = mk(dM);
  const addRow = (acc, x, y, w) => {
    const d = acc.b.length; const xr = [1, ...x];
    for (let i = 0; i < d; i++) { const xi = xr[i] * w; const Ai = acc.A[i]; for (let j = 0; j < d; j++) Ai[j] += xi * xr[j]; acc.b[i] += xi * y; }
    acc.n += w;
  };
  const rebuildWeighted = (acc, d, lambda, rows, xs, ys, seasons, curSeason, decay) => {
    const nacc = mk(d);
    for (let i = 0; i < rows.length; i++) {
      const w = Math.pow(decay, Math.max(0, curSeason - seasons[i]));
      addRowInto(nacc, [1, ...xs[i]], ys[i], w);
    }
    for (let i = 1; i < d; i++) nacc.A[i][i] += lambda;
    return nacc;
  };
  const addRowInto = (acc, xr, y, w) => {
    const d = acc.b.length;
    for (let i = 0; i < d; i++) { const xi = xr[i] * w; const Ai = acc.A[i]; for (let j = 0; j < d; j++) Ai[j] += xi * xr[j]; acc.b[i] += xi * y; }
    acc.n += w;
  };
  const finalize = (acc, d, lambda) => { const A = acc.A.map(r => Float64Array.from(r)); for (let i = 1; i < d; i++) A[i][i] += lambda; return A.map((row, i) => { const full = new Float64Array(d + 1); for (let j = 0; j < d; j++) full[j] = row[j]; full[d] = acc.b[i]; return full; }); };

  const rawT = [], rawM = [], seasonRows = [], rawD = [];
  const out = [];
  const residM = [];
  const residS = [], residL = [], residMid = [];
  const allResidM = { s: 0, s2: 0, n: 0 };
  const probScale = cfg.probScale ?? 1;
  const stratProb = cfg.stratProb ?? false;
  const stratCut = cfg.stratCut ?? 5;
  const stratHi = cfg.stratHi ?? null; // optional third (mid) pool
  const gaussProb = cfg.gaussProb ?? false;
  const varPrior = cfg.varPrior ?? null;
  const recency = cfg.recency ?? null;
  const recHalf = cfg.recHalf ?? null; // per-date exponential half-life, days
  const recEvery = cfg.recEvery ?? 12; // per-date rebuild cadence (dates)
  let curSeason = null;
  let datesSince = 99;
  const rebuildDateW = (acc, d, lambda, rows, rowDays, half, curDay) => {
    const nacc = mk(d);
    for (let i = 0; i < rows.length; i++) {
      const w = Math.pow(0.5, (curDay - rowDays[i]) / half);
      addRowInto(nacc, rows[i].slice(0, d), rows[i][d], w);
    }
    for (let i = 1; i < d; i++) nacc.A[i][i] += lambda;
    return nacc;
  };

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
      } else {
        accT = rebuildWeighted(accT, dT, lambdaT, rawT, rawT.map(r => r.slice(1, dT)), rawT.map(r => r[dT]), seasonRows, season, recency);
        accM = rebuildWeighted(accM, dM, lambdaM, rawM, rawM.map(r => r.slice(1, dM)), rawM.map(r => r[dM]), seasonRows, season, recency);
      }
      datesSince = 0;
    }
    datesSince++;
    curSeason = season;

    const readyT = accT.n > (dT + 10) * 3;
    const readyM = accM.n > (dM + 10) * 3;
    const bT = readyT ? solveLinear(finalize(accT, dT, lambdaT), dT) : null;
    const bM = readyM ? solveLinear(finalize(accM, dM, lambdaM), dM) : null;
    const wN = residM.length;
    let wm = 0; if (wN) { let s = 0; for (const x of residM) s += x; wm = s / wN; }
    const priorSd = allResidM.n > 100 ? Math.sqrt(Math.max(1e-9, allResidM.s2 / allResidM.n - (allResidM.s / allResidM.n) ** 2)) : null;
    let recentSd = null;
    if (gaussProb && wN > 50) { let s2 = 0; for (const x of residM) { const v = x - wm; s2 += v * v; } recentSd = Math.sqrt(s2 / wN); }

    for (const f of rows) {
      const xT = stdT[f.idx], xM = stdM[f.idx];
      const total = bT ? bT[0] + xT.reduce((s, v, i) => s + v * bT[i + 1], 0) : 226;
      const margin = bM ? bM[0] + xM.reduce((s, v, i) => s + v * bM[i + 1], 0) : 2.5;
      const g = f.g;
      // stratProb: draw the residual support from the pool matching the
      // predicted-margin regime (close games vs big favorites) — margin
      // residuals are heteroskedastic across that split.
      let pool = residM, wNrow = wN, wmRow = wm;
      if (stratProb && wN) {
        const am = Math.abs(margin);
        pool = stratHi != null
          ? (am < stratCut ? (residS.length >= 100 ? residS : residM)
            : am < stratHi ? (residMid.length >= 100 ? residMid : residM)
            : (residL.length >= 100 ? residL : residM))
          : (am < stratCut ? (residS.length >= 100 ? residS : residM) : (residL.length >= 100 ? residL : residM));
        let s2 = 0; for (const x of pool) s2 += x;
        wmRow = pool.length ? s2 / pool.length : 0;
        wNrow = pool.length;
      }
      let p = 0.5;
      if (wNrow) {
        if (gaussProb && priorSd && varPrior != null && recentSd) {
          const sd = Math.sqrt((varPrior * priorSd * priorSd + wNrow * recentSd * recentSd) / (varPrior + wNrow)) * probScale;
          p = 0.5 * (1 + erf(margin / (sd * Math.SQRT2)));
        } else {
          let c = 0;
          for (let i = 0; i < wNrow; i++) { const v = margin + (pool[i] - wmRow) * probScale; c += v > 0 ? 1 : v === 0 ? 0.5 : 0; }
          p = c / wNrow;
        }
      }
      const yT = g.hp + g.ap, yM = g.hp - g.ap;
      let crpsM = null;
      if (wNrow >= 100) {
        const stride = Math.max(1, Math.floor(wNrow / CRPS_CAP));
        const samples = [];
        for (let i = 0; i < wNrow; i += stride) samples.push(margin + (pool[i] - wmRow) * probScale);
        samples.sort((a, b) => a - b);
        crpsM = crpsFromSorted(samples, margin);
        const q = pv => samples[Math.min(samples.length - 1, Math.max(0, Math.round(pv * (samples.length - 1))))];
        var q025 = q(0.025), q975 = q(0.975), q10 = q(0.1), q90 = q(0.9);
      }
      out.push({ idx: f.idx, season: f.season, date: f.date, obsT: yT, obsM: yM, total, margin, p, crpsM, q025, q975, q10, q90 });
      const rm = yM - margin;
      residM.push(rm);
      const amPush = Math.abs(margin);
      const stratPool = stratHi != null ? (amPush < stratCut ? residS : amPush < stratHi ? residMid : residL) : (amPush < stratCut ? residS : residL);
      stratPool.push(rm); if (stratPool.length > RESID_WINDOW) stratPool.shift();
      allResidM.s += rm; allResidM.s2 += rm * rm; allResidM.n += 1;
      if (residM.length > RESID_WINDOW) residM.shift();
      const xTv = iT.map(i => (f.T[F_TOTAL[i]] - scaleT[i].mean) / scaleT[i].sd);
      const xMv = iM.map(i => f.M[F_MARGIN[i]] / scaleM[i].rms);
      addRow(accT, xTv, yT, 1); addRow(accM, xMv, yM, 1);
      rawT.push([1, ...xTv, yT]); rawM.push([1, ...xMv, yM]); seasonRows.push(f.season); rawD.push(db.dateIndex.get(f.date));
    }
  }
  return out;
}

function crpsFromSorted(sorted, m) {
  const n = sorted.length;
  let term1 = 0; for (const x of sorted) term1 += Math.abs(x - m);
  let term2 = 0; for (let i = 0; i < n; i++) term2 += (2 * i - n + 1) * sorted[i];
  return term1 / n - term2 / (2 * n * n);
}
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

// ---- metrics + paired comparisons over evaluation seasons ----
const METRICS = ['brier', 'log', 'maeH', 'maeA', 'maeM', 'crpsM'];
function evalLosses(db, out) {
  const EVAL = new Set(db.EVAL_YEARS);
  return out.filter(r => EVAL.has(r.season)).map(r => {
    const ph = Math.min(1 - 1e-6, Math.max(1e-6, r.p));
    const y = r.obsM > 0 ? 1 : 0;
    return {
      season: r.season, date: r.date, p: r.p,
      brier: (r.p - y) * (r.p - y),
      log: -(y * Math.log(ph) + (1 - y) * Math.log(1 - ph)),
      maeH: Math.abs((r.obsT + r.obsM) / 2 - (r.total + r.margin) / 2),
      maeA: Math.abs((r.obsT - r.obsM) / 2 - (r.total - r.margin) / 2),
      maeM: Math.abs(r.obsM - r.margin),
      crpsM: r.crpsM ?? NaN,
      cover95: r.obsM >= r.q025 && r.obsM <= r.q975,
      cover80: r.obsM >= r.q10 && r.obsM <= r.q90,
      win: y,
      correct: (r.p >= 0.5) === (y === 1),
    };
  });
}
function summarize(lossesArr) {
  const s = { n: lossesArr.length };
  for (const k of METRICS) { let sum = 0, n = 0; for (const r of lossesArr) { if (k === 'crpsM' && !isFinite(r.crpsM)) continue; sum += r[k]; n++; } s[k] = n ? sum / n : NaN; }
  s.acc = lossesArr.filter(r => r.correct).length / lossesArr.length;
  const bins = Array.from({ length: 10 }, () => ({ s: 0, n: 0, o: 0 }));
  for (const r of lossesArr) { const b = Math.min(9, Math.max(0, Math.floor(r.p * 10))); bins[b].s += r.p; bins[b].n++; bins[b].o += r.win; }
  let ece = 0;
  for (const b of bins) if (b.n) { ece += (b.n / lossesArr.length) * Math.abs(b.o / b.n - b.s / b.n); }
  s.ece = ece;
  return s;
}

function pairedDelta(lossesA, lossesB, reps = 1000) {
  // treatment B minus baseline A; negative = B better
  const n = Math.min(lossesA.length, lossesB.length);
  const clusters = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${lossesA[i].season}|${lossesA[i].date}`;
    let c = clusters.get(key);
    if (!c) { c = { n: 0, crpsN: 0, brier: 0, log: 0, maeH: 0, maeA: 0, maeM: 0, crpsM: 0 }; clusters.set(key, c); }
    for (const k of METRICS) {
      const a = lossesA[i][k], b = lossesB[i][k];
      if (k === 'crpsM' && (!isFinite(a) || !isFinite(b))) continue;
      c[k] += b - a;
    }
    c.n++;
    if (isFinite(lossesA[i].crpsM) && isFinite(lossesB[i].crpsM)) c.crpsN++;
  }
  const list = [...clusters.values()];
  const rng = mulberry32(20261007);
  const boot = {}; for (const k of METRICS) boot[k] = [];
  for (let rep = 0; rep < reps; rep++) {
    const sums = {}; for (const k of METRICS) sums[k] = 0; let totN = 0, crpsN = 0;
    for (let i = 0; i < list.length; i++) { const c = list[Math.floor(rng() * list.length)]; for (const k of METRICS) sums[k] += c[k]; totN += c.n; crpsN += c.crpsN; }
    for (const k of METRICS) boot[k].push(sums[k] / (k === 'crpsM' ? crpsN : totN));
  }
  const result = {};
  for (const k of METRICS) {
    const dN = k === 'crpsM' ? list.reduce((s, c) => s + c.crpsN, 0) : list.reduce((s, c) => s + c.n, 0);
    const point = list.reduce((s, c) => s + c[k], 0) / dN;
    boot[k].sort((a, b) => a - b);
    result[k] = { delta: point, lo: boot[k][Math.floor(0.025 * reps)], hi: boot[k][Math.ceil(0.975 * reps) - 1] };
  }
  return { result, clusters: list.length, games: n };
}
function mulberry32(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

module.exports = { load, runCandidate, evalLosses, summarize, pairedDelta, METRICS };