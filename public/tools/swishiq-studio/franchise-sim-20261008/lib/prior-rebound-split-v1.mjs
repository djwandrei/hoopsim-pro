import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

export const PRIOR_REBOUND_SPLIT_V1 = 'prior-count-rebound-split-v1';
const pseudoRebounds = 20, priorDiscount = 0.5, fallbackOffensiveShare = 0.23;
const historyWindow = 'last-ten-positive-appearances-per-current-and-immediately-prior-season';
const disclosure = 'Player credited-rebound share only. It does not estimate team/dead-ball ownership or injury/appearance.';
const fields = ['offensiveRebounds', 'defensiveRebounds', 'rebounds'];
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function validateCounts(counts) {
  if (!counts || fields.some(field => !Number.isSafeInteger(counts[field]) || counts[field] < 0) ||
      counts.offensiveRebounds + counts.defensiveRebounds !== counts.rebounds) throw new Error('Incomplete or inconsistent prior rebound counts.');
}

function summarizeWindow(window, year, targetDate, seen) {
  if (window?.seasonStartYear !== year || !Array.isArray(window.observations) || window.observations.length > 10) {
    throw new Error('Unsupported prior rebound window.');
  }
  const summary = { games: window.observations.length, minutes: 0,
    counts: { offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0 }, lastPriorDate: null };
  let previousDate = null;
  for (const row of window.observations) {
    if (!validDate(row.date) || row.date >= targetDate || ![year, year + 1].includes(Number(row.date.slice(0, 4))) ||
        (previousDate !== null && row.date < previousDate) || typeof row.gameRef !== 'string' || !row.gameRef.trim() ||
        seen.has(row.gameRef) || (row.seasonStartYear !== undefined && row.seasonStartYear !== year) ||
        !Number.isFinite(row.minutes) || row.minutes <= 0 || row.minutes > 108) throw new Error('Unbound or duplicated prior rebound exposure.');
    validateCounts(row.counts);
    seen.add(row.gameRef); previousDate = row.date; summary.lastPriorDate = row.date;
    summary.minutes += row.minutes;
    for (const field of fields) {
      summary.counts[field] += row.counts[field];
      if (!Number.isSafeInteger(summary.counts[field])) throw new Error('Prior rebound count overflow.');
    }
  }
  if (!Number.isFinite(summary.minutes)) throw new Error('Prior rebound exposure overflow.');
  return summary;
}

/** A bounded prior-only allocation of the existing predicted total, not a
 * second total rebound model. Pseudocount/discount magnitudes are unselected.
 * Missing histories receive a disclosed league/generated split, never a zero
 * skill or a rookie/availability label. */
export function createPriorReboundSplitV1({ canonicalName, seasonStartYear, targetDateExclusive,
  current, prior, leaguePrior = null } = {}) {
  const canonicalNameKey = normalizeCanonicalPlayerName(canonicalName);
  if (!canonicalNameKey || !Number.isInteger(seasonStartYear) || !validDate(targetDateExclusive) ||
      ![seasonStartYear, seasonStartYear + 1].includes(Number(targetDateExclusive.slice(0, 4)))) throw new Error('Unbound prior rebound identity or season.');
  const seen = new Set();
  const components = { current: summarizeWindow(current, seasonStartYear, targetDateExclusive, seen),
    prior: summarizeWindow(prior, seasonStartYear - 1, targetDateExclusive, seen) };
  let priorShare = fallbackOffensiveShare;
  if (leaguePrior !== null) {
    if (leaguePrior.seasonStartYear !== seasonStartYear - 1 || typeof leaguePrior.source !== 'string' || !leaguePrior.source.trim() ||
        !validDate(leaguePrior.lastPriorDate) || leaguePrior.lastPriorDate >= targetDateExclusive ||
        ![seasonStartYear - 1, seasonStartYear].includes(Number(leaguePrior.lastPriorDate.slice(0, 4)))) throw new Error('Unbound prior league rebound split.');
    validateCounts(leaguePrior.counts);
    if (leaguePrior.counts.rebounds <= 0) throw new Error('Prior league rebound denominator is empty.');
    priorShare = leaguePrior.counts.offensiveRebounds / leaguePrior.counts.rebounds;
  }
  const effectiveOffensiveRebounds = components.current.counts.offensiveRebounds + priorDiscount * components.prior.counts.offensiveRebounds;
  const effectiveTotalRebounds = components.current.counts.rebounds + priorDiscount * components.prior.counts.rebounds;
  const offensiveShare = (effectiveOffensiveRebounds + pseudoRebounds * priorShare) / (effectiveTotalRebounds + pseudoRebounds);
  return { format: PRIOR_REBOUND_SPLIT_V1, version: 1, canonicalNameKey, seasonStartYear, targetDateExclusive,
    lastPriorDate: [components.current.lastPriorDate, components.prior.lastPriorDate].filter(Boolean).sort().at(-1) ?? null,
    historyStatus: seen.size ? 'available' : 'no-prior-split-history', components,
    leaguePrior: leaguePrior === null ? null : structuredClone(leaguePrior),
    priorShare, generatedPseudoRebounds: pseudoRebounds, priorSeasonDiscount: priorDiscount,
    effectiveOffensiveRebounds, effectiveTotalRebounds, offensiveShare,
    source: leaguePrior === null ? 'prior-player-counts-with-generated-23-percent-league-split'
      : 'prior-player-counts-with-prior-season-admitted-player-box-split',
    provenance: { derivedFromTargetGame: false, wholeLocalDateEmbargo: true,
      window: historyWindow,
      empiricallySelected: false, disclosure } };
}

export function validatePriorReboundSplitV1(profile, { canonicalName, seasonStartYear, gameLocalDate } = {}) {
  const nameKey = normalizeCanonicalPlayerName(canonicalName);
  if (profile?.format !== PRIOR_REBOUND_SPLIT_V1 || profile.version !== 1 ||
      !nameKey || !Number.isInteger(seasonStartYear) || profile.canonicalNameKey !== nameKey || profile.seasonStartYear !== seasonStartYear ||
      !validDate(gameLocalDate) || profile.targetDateExclusive !== gameLocalDate ||
      ![seasonStartYear, seasonStartYear + 1].includes(Number(gameLocalDate.slice(0, 4))) ||
      profile.generatedPseudoRebounds !== pseudoRebounds || profile.priorSeasonDiscount !== priorDiscount ||
      profile.provenance?.derivedFromTargetGame !== false || profile.provenance?.wholeLocalDateEmbargo !== true ||
      profile.provenance?.empiricallySelected !== false || profile.provenance?.window !== historyWindow ||
      profile.provenance?.disclosure !== disclosure) throw new Error('Unbound prior rebound split.');
  let games = 0;
  for (const part of ['current', 'prior']) {
    const component = profile.components?.[part];
    if (!component || !Number.isSafeInteger(component.games) || component.games < 0 || component.games > 10 ||
        !Number.isFinite(component.minutes) || component.minutes < 0 || component.minutes > component.games * 108 ||
        (component.games === 0 ? component.minutes !== 0 || component.lastPriorDate !== null :
          component.minutes <= 0 || !validDate(component.lastPriorDate) || component.lastPriorDate >= gameLocalDate ||
          ![seasonStartYear - (part === 'prior' ? 1 : 0), seasonStartYear + (part === 'current' ? 1 : 0)]
            .includes(Number(component.lastPriorDate.slice(0, 4))))) throw new Error('Invalid prior rebound window summary.');
    validateCounts(component.counts);
    if (component.games === 0 && component.counts.rebounds !== 0) throw new Error('Empty rebound window has counts.');
    games += component.games;
  }
  const latest = [profile.components.current.lastPriorDate, profile.components.prior.lastPriorDate].filter(Boolean).sort().at(-1) ?? null;
  if (latest !== profile.lastPriorDate || profile.historyStatus !== (games ? 'available' : 'no-prior-split-history')) throw new Error('Prior rebound exposure summary disagrees.');
  let priorShare = fallbackOffensiveShare;
  if (profile.leaguePrior !== null) {
    const league = profile.leaguePrior;
    if (!league || league.seasonStartYear !== seasonStartYear - 1 || typeof league.source !== 'string' || !league.source.trim() ||
        !validDate(league.lastPriorDate) || league.lastPriorDate >= gameLocalDate ||
        ![seasonStartYear - 1, seasonStartYear].includes(Number(league.lastPriorDate.slice(0, 4)))) throw new Error('Invalid league rebound split provenance.');
    validateCounts(league.counts);
    if (league.counts.rebounds <= 0) throw new Error('Empty league rebound denominator.');
    priorShare = league.counts.offensiveRebounds / league.counts.rebounds;
  }
  const offensive = profile.components.current.counts.offensiveRebounds + priorDiscount * profile.components.prior.counts.offensiveRebounds;
  const total = profile.components.current.counts.rebounds + priorDiscount * profile.components.prior.counts.rebounds;
  const share = (offensive + pseudoRebounds * priorShare) / (total + pseudoRebounds);
  if (profile.priorShare !== priorShare || profile.effectiveOffensiveRebounds !== offensive || profile.effectiveTotalRebounds !== total ||
      !Number.isFinite(profile.offensiveShare) || profile.offensiveShare < 0 || profile.offensiveShare > 1 ||
      Math.abs(profile.offensiveShare - share) > 1e-12 ||
      profile.source !== (profile.leaguePrior === null ? 'prior-player-counts-with-generated-23-percent-league-split'
        : 'prior-player-counts-with-prior-season-admitted-player-box-split')) throw new Error('Prior rebound split does not reproduce its counts.');
  return profile;
}

export function allocatePriorReboundSplitV1(profile, context, totalRatePer36, projectedMinutes) {
  validatePriorReboundSplitV1(profile, context);
  if (!Number.isFinite(totalRatePer36) || totalRatePer36 < 0 || !Number.isFinite(projectedMinutes) || projectedMinutes < 0) {
    throw new Error('Invalid predicted rebound total or exposure.');
  }
  const offensiveReboundsPer36 = totalRatePer36 * profile.offensiveShare;
  const defensiveReboundsPer36 = totalRatePer36 - offensiveReboundsPer36;
  const expectedTotal = totalRatePer36 * projectedMinutes / 36;
  const expectedOffensive = offensiveReboundsPer36 * projectedMinutes / 36;
  if (![offensiveReboundsPer36, defensiveReboundsPer36, expectedTotal, expectedOffensive].every(Number.isFinite)) {
    throw new Error('Predicted rebound count overflow.');
  }
  return { offensiveReboundsPer36, defensiveReboundsPer36,
    expectedCounts: { rebounds: expectedTotal, offensiveRebounds: expectedOffensive, defensiveRebounds: expectedTotal - expectedOffensive },
    source: profile.source, historyStatus: profile.historyStatus,
    evidence: { canonicalNameKey: profile.canonicalNameKey, targetDateExclusive: profile.targetDateExclusive,
      lastPriorDate: profile.lastPriorDate, currentGames: profile.components.current.games, priorGames: profile.components.prior.games },
    empiricallySelected: false };
}
