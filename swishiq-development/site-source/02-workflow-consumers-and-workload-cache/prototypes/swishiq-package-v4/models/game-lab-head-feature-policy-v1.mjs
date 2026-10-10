/* Explicit, prior-feature-only policies for registered research candidates. */
export const HEAD_FEATURE_POLICY_VERSION = 'swishiq-game-head-feature-policy-v1';
export function applyGameHeadFeaturePolicy(features, policy = {}) {
  if (!features?.total || !features?.margin || !policy || typeof policy !== 'object'
      || Object.keys(policy).some(k => !['restOffDaysCap', 'canonicalLast10Scoring'].includes(k))) throw TypeError('Invalid head feature policy');
  const result = { total: { ...features.total }, margin: { ...features.margin } };
  const finite = name => { const x = features.total[name] ?? features.margin[name]; if (!Number.isFinite(x)) throw TypeError('Required prior feature: ' + name); return x; };
  if (policy.restOffDaysCap !== undefined) {
    if (!Number.isFinite(policy.restOffDaysCap) || policy.restOffDaysCap < 1 || policy.restOffDaysCap > 30) throw TypeError('Invalid rest cap');
    const meanGap = finite('pass6:restMean'), gapAdv = finite('pass6:restAdv');
    const clip = gap => Math.min(policy.restOffDaysCap, Math.max(0, gap - 1));
    const home = clip(meanGap + gapAdv / 2), away = clip(meanGap - gapAdv / 2);
    result.total['pass6:restMean'] = (home + away) / 2;
    result.margin['pass6:restAdv'] = home - away;
    // Both aliases now describe the same rest construct in consistent units.
    result.total['c51:meanRestDays'] = (home + away) / 2;
    result.margin['c51:restAdvantageDays'] = (home - away) / 2;
  }
  if (policy.canonicalLast10Scoring !== undefined && typeof policy.canonicalLast10Scoring !== 'boolean') throw TypeError('Invalid scoring-window policy');
  if (policy.canonicalLast10Scoring) {
    result.total['c51:meanPointsForLast10'] = (finite('pass6:hp10') + finite('pass6:ap10')) / 2;
    result.total['c51:meanPointsAgainstLast10'] = (finite('pass6:hpa10') + finite('pass6:apa10')) / 2;
    for (const [destination, source] of [['pointsForAdvantageLast10', 'pfAdv10'], ['defenseAllowanceAdvantageLast10', 'defAdv10'], ['winRateAdvantageLast10', 'wrAdv10']]) {
      result.margin['c51:' + destination] = finite('pass6:' + source) / 2;
    }
  }
  return result;
}
export const HEAD_FEATURE_POLICY_CONTRACT = Object.freeze({
  sources: 'Named strictly prior-date C51/Pass6 fields; no targets, target-game lineups or injury labels',
  rest: 'Recover home/away elapsed days from mean and difference; subtract one for off days; clamp each side to [0, configured cap]; rebuild means/differences',
  scoring: 'Use existing Pass6 last-ten values and its three-game prior-season fallback to construct consistent C51 aliases',
  missing: 'Missing required source fields throw; unchanged nullable fields keep original warmup-center behavior',
  observedThrough: 'Transformation preserves the input record cutoff and never reads outcomes',
  doubleApplication: 'Apply once to raw feature records; the rest conversion is not idempotent',
});
