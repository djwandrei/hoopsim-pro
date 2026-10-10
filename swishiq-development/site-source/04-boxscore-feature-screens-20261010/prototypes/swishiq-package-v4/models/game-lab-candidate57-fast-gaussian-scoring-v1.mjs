import { normalCdf, scoreCandidate57Distribution } from './game-lab-candidate57-configurable-uncertainty-v7.mjs';

function moments(rows) {
  const n = rows.length, total = rows.reduce((v, r) => v + r.total, 0) / n, margin = rows.reduce((v, r) => v + r.margin, 0) / n;
  return { n, total, margin, vt: rows.reduce((v, r) => v + (r.total - total) ** 2, 0) / n,
    vm: rows.reduce((v, r) => v + (r.margin - margin) ** 2, 0) / n,
    cov: rows.reduce((v, r) => v + (r.total - total) * (r.margin - margin), 0) / n };
}

// Algebraically identical full-Gaussian branch; no support sorting or draws.
export function scoreCandidate57FastGaussian({ forecasts, settings, targetSeasonStartYears = [2023, 2024, 2025] }) {
  if (settings.poolMode !== 'full' || settings.gaussianBlend !== 1 || settings.integerScoreSupport
    || settings.residualCalendarMode !== 'rolling' || settings.conditionalVarianceBlend !== 0
    || settings.residualAgeHalfLifeDays !== null) throw TypeError('Unsupported fast Gaussian settings');
  const scored = [], ledger = [], queue = [];
  const sums = { t: 0, m: 0, tt: 0, mm: 0, tm: 0 };
  const update = (r, sign) => { sums.t += sign * r.total; sums.m += sign * r.margin; sums.tt += sign * r.total ** 2; sums.mm += sign * r.margin ** 2; sums.tm += sign * r.total * r.margin; };
  for (let first = 0; first < forecasts.length;) {
    let end = first + 1; while (end < forecasts.length && forecasts[end].gameDateLocal === forecasts[first].gameDateLocal) end++;
    const date = forecasts[first].gameDateLocal;
    if (first && forecasts[first - 1].gameDateLocal >= date) throw Error('Strictly ordered date batches');
    if (targetSeasonStartYears.includes(forecasts[first].seasonStartYear)) {
      const n = queue.length, t = sums.t / n, m = sums.m / n;
      const vt = sums.tt / n - t * t, vm = sums.mm / n - m * m, cov = sums.tm / n - t * m;
      if (n < 100 || vt <= 1e-12 || vm <= 1e-12 || queue.at(-1).gameDateLocal >= date) throw Error('Prior nondegenerate Gaussian residual pool');
      let ts = settings.totalResidualScale, ms = settings.marginResidualScale;
      if (settings.varianceAdaptationBlend > 0) {
        const recent = moments(queue.slice(-settings.varianceWindowGames)), b = settings.varianceAdaptationBlend;
        ts *= Math.sqrt(1 - b + b * recent.vt / vt); ms *= Math.sqrt(1 - b + b * recent.vm / vm);
      }
      const bs = moments(queue.slice(-settings.biasWindowGames));
      const totalBias = settings.totalBiasRetention * bs.total, marginBias = settings.marginBiasRetention * bs.margin;
      const tv = ts * ts * vt, mv = ms * ms * vm, c = ts * ms * settings.totalMarginCorrelationRetention * cov;
      if (settings.totalMarginCorrelationRetention < 1 && Math.abs(cov / Math.sqrt(vt * vm)) > 1 - 1e-10) throw Error('Non-collinear residuals required');
      const variances = { home: (tv + mv + 2 * c) / 4, away: (tv + mv - 2 * c) / 4, margin: mv };
      for (const row of forecasts.slice(first, end)) {
        if ([row.featureObservedThrough, row.coefficientObservedThrough, row.standardizationObservedThrough].some(d => d >= date)) throw Error('Strict prior feature/model/scales');
        const total = row.prediction.total + totalBias, margin = row.prediction.margin + marginBias;
        const locations = { home: (total + margin) / 2, away: (total - margin) / 2, margin };
        const actual = { home: row.target.homeScore, away: row.target.awayScore, margin: row.target.margin };
        const p = normalCdf(margin / Math.sqrt(mv));
        scored.push({ gameRef: row.gameRef, gameDateLocal: date, seasonStartYear: row.seasonStartYear, probability: p,
          homeWin: Number(row.target.margin > 0), sides: Object.fromEntries(Object.keys(locations).map(side => [side,
            scoreCandidate57Distribution({ mean: locations[side], support: [{ value: locations[side], probability: 1 }], gaussianBlend: 1,
              normal: { mean: locations[side], sd: Math.sqrt(variances[side]) } }, actual[side])])) });
        ledger.push({ gameRef: row.gameRef, gameDateLocal: date, seasonStartYear: row.seasonStartYear, expectedTotal: total, expectedMargin: margin,
          homeWinProbability: p, featureObservedThrough: row.featureObservedThrough, coefficientObservedThrough: row.coefficientObservedThrough,
          standardizationObservedThrough: row.standardizationObservedThrough, residualObservedThrough: queue.at(-1).gameDateLocal, residualPoolCount: n });
      }
    }
    for (const row of forecasts.slice(first, end)) {
      const r = { gameDateLocal: date, total: row.target.total - row.prediction.total, margin: row.target.margin - row.prediction.margin };
      queue.push(r); update(r, 1);
      if (queue.length > settings.residualWindowGames) update(queue.shift(), -1);
    }
    first = end;
  }
  return { scored, ledger };
}
