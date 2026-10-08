/* Exact unweighted rolling empirical scoring. Order statistics avoid sorting
 * the entire residual pool for every game during feature-weight sweeps. */
class OrderedResiduals {
  constructor() { this.root = null; this.pairDistanceSum = 0; this.seed = 1831565813; }
  random() { this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5; return this.seed >>> 0; }
  size(n = this.root) { return n?.size ?? 0; }
  sum(n = this.root) { return n?.sum ?? 0; }
  refresh(n) { if (n) { n.size = n.count + this.size(n.left) + this.size(n.right); n.sum = n.key * n.count + this.sum(n.left) + this.sum(n.right); } return n; }
  rotate(n, direction) { const x = n[direction]; n[direction] = x[direction === 'left' ? 'right' : 'left']; x[direction === 'left' ? 'right' : 'left'] = this.refresh(n); return this.refresh(x); }
  insert(n, key) {
    if (!n) return { key, count: 1, size: 1, sum: key, priority: this.random(), left: null, right: null };
    if (key === n.key) n.count++; else { const d = key < n.key ? 'left' : 'right'; n[d] = this.insert(n[d], key); if (n[d].priority < n.priority) n = this.rotate(n, d); }
    return this.refresh(n);
  }
  merge(a, b) { if (!a) return b; if (!b) return a; if (a.priority < b.priority) { a.right = this.merge(a.right, b); return this.refresh(a); } b.left = this.merge(a, b.left); return this.refresh(b); }
  remove(n, key) { if (!n) throw Error('Residual not in window'); if (key === n.key) { if (--n.count === 0) return this.merge(n.left, n.right); }
    else if (key < n.key) n.left = this.remove(n.left, key); else n.right = this.remove(n.right, key); return this.refresh(n); }
  prefix(key) { let n = this.root, count = 0, sum = 0; while (n) { if (n.key <= key) { count += this.size(n.left) + n.count; sum += this.sum(n.left) + n.key * n.count; n = n.right; } else n = n.left; } return { count, sum }; }
  absolute(key) { const p = this.prefix(key); return key * p.count - p.sum + (this.sum() - p.sum) - key * (this.size() - p.count); }
  push(key) { if (!Number.isFinite(key)) throw TypeError('Finite residual required'); this.pairDistanceSum += this.absolute(key); this.root = this.insert(this.root, key); }
  shift(key) { this.pairDistanceSum -= this.absolute(key); this.root = this.remove(this.root, key); }
  quantile(q) { let k = Math.max(1, Math.ceil(q * this.size() - 1e-9)), n = this.root; while (n) { const left = this.size(n.left); if (k <= left) n = n.left; else if (k <= left + n.count) return n.key; else { k -= left + n.count; n = n.right; } } throw Error('Empty empirical quantile'); }
  score(location, actual) {
    const n = this.size(), center = this.sum() / n, offset = location - center;
    if (n < 100) throw Error('Insufficient prior residuals');
    const intervals = Object.fromEntries([0.5, 0.8, 0.9, 0.95].map(level => {
      const alpha = 1 - level, lower = offset + this.quantile(alpha / 2), upper = offset + this.quantile(1 - alpha / 2);
      return [String(level), { lower, upper, width: upper - lower, covered: actual >= lower && actual <= upper,
        score: upper - lower + 2 / alpha * Math.max(0, lower - actual) + 2 / alpha * Math.max(0, actual - upper) }];
    }));
    return { error: location - actual, crps: this.absolute(actual - offset) / n - this.pairDistanceSum / (n * n), intervals,
      equalWeightIntervalScore: Object.values(intervals).reduce((sum, x) => sum + x.score, 0) / 4 };
  }
}

export function scoreCandidate57FastEmpirical({ forecasts, settings, targetSeasonStartYears = [2023, 2024, 2025] }) {
  if (!Array.isArray(forecasts) || settings.poolMode !== 'full' || settings.gaussianBlend !== 0 || settings.residualCalendarMode !== 'rolling'
    || settings.integerScoreSupport || settings.conditionalVarianceBlend || settings.varianceAdaptationBlend || settings.residualAgeHalfLifeDays !== null
    || settings.totalMarginCorrelationRetention !== 1 || !Number.isSafeInteger(settings.residualWindowGames) || settings.residualWindowGames < 100) throw TypeError('Fast path supports full unweighted rolling paired residuals only');
  const trees = { home: new OrderedResiduals(), away: new OrderedResiduals(), margin: new OrderedResiduals() }, queue = [], scored = [], ledger = [];
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  for (let first = 0; first < forecasts.length;) {
    let end = first + 1; while (end < forecasts.length && forecasts[end].gameDateLocal === forecasts[first].gameDateLocal) end++;
    const date = forecasts[first].gameDateLocal, day = forecasts.slice(first, end);
    if (first && forecasts[first - 1].gameDateLocal >= date) throw Error('Strictly chronological date batches required');
    for (const row of day) if (targetSeasonStartYears.includes(row.seasonStartYear)) {
      if (queue.at(-1)?.gameDateLocal >= date || row.featureObservedThrough >= date || row.coefficientObservedThrough >= date || row.standardizationObservedThrough >= date) throw Error('Feature/fit/residual cutoff');
      const recent = queue.slice(-settings.biasWindowGames), total = row.prediction.total + settings.totalBiasRetention * mean(recent.map(r => r.total)), margin = row.prediction.margin + settings.marginBiasRetention * mean(recent.map(r => r.margin));
      const m = trees.margin, probability = 1 - m.prefix(m.sum() / m.size() - margin).count / m.size();
      const locations = { home: (total + margin) / 2, away: (total - margin) / 2, margin }, actual = { home: row.target.homeScore, away: row.target.awayScore, margin: row.target.margin };
      scored.push({ gameRef: row.gameRef, gameDateLocal: date, seasonStartYear: row.seasonStartYear, probability,
        homeWin: Number(row.target.margin > 0), sides: Object.fromEntries(Object.keys(trees).map(side => [side, trees[side].score(locations[side], actual[side])])) });
      ledger.push({ gameRef: row.gameRef, gameDateLocal: date, seasonStartYear: row.seasonStartYear, expectedTotal: total, expectedMargin: margin,
        homeWinProbability: probability, featureObservedThrough: row.featureObservedThrough, coefficientObservedThrough: row.coefficientObservedThrough,
        standardizationObservedThrough: row.standardizationObservedThrough, residualObservedThrough: queue.at(-1).gameDateLocal, residualPoolCount: queue.length });
    }
    for (const row of day) {
      const total = row.target.total - row.prediction.total, margin = row.target.margin - row.prediction.margin;
      const residual = { gameDateLocal: date, total, margin, home: (settings.totalResidualScale * total + settings.marginResidualScale * margin) / 2,
        away: (settings.totalResidualScale * total - settings.marginResidualScale * margin) / 2, scaledMargin: settings.marginResidualScale * margin };
      queue.push(residual); trees.home.push(residual.home); trees.away.push(residual.away); trees.margin.push(residual.scaledMargin);
      if (queue.length > settings.residualWindowGames) { const oldest = queue.shift(); trees.home.shift(oldest.home); trees.away.shift(oldest.away); trees.margin.shift(oldest.scaledMargin); }
    }
    first = end;
  }
  return { scored, ledger };
}
