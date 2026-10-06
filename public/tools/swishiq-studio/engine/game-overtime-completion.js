/*
 * Shared game-completion and overtime guard for future Game/Season/Cup/Lineup
 * adapters. This is an additive policy module and does not alter current
 * consumer behavior until those callers are explicitly wired to it.
 */

export const GAME_OVERTIME_COMPLETION_POLICY = Object.freeze({
  version: 'swishiq-shared-overtime-completion-v1',
  regulationMinutes: 48,
  overtimePeriodMinutes: 5,
  maximumOvertimePeriods: 10,
  afterCap: 'incomplete-no-winner-excluded-from-outcome-ledgers',
  tieBreaker: 'none',
});

const fail = message => { throw new Error(message); };
const validScore = value => Number.isSafeInteger(value) && value >= 0;
const validSeed = value => typeof value === 'string' && /^[a-zA-Z0-9:._-]{1,80}$/.test(value);
function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Game simulation cancelled during overtime.');
  error.name = 'AbortError';
  throw error;
}

function completionState(homeScore, awayScore, overtimePeriodsPlayed) {
  const resolved = homeScore !== awayScore;
  const winner = resolved ? homeScore > awayScore ? 'home' : 'away' : null;
  return Object.freeze({
    status: resolved ? (overtimePeriodsPlayed ? 'resolved-overtime' : 'resolved-regulation') : 'incomplete-overtime-cap',
    isGameComplete: resolved,
    winner,
    unresolvedReason: resolved ? null : 'maximum-overtime-periods-reached-with-tied-score',
    mayEnterStandings: resolved,
    mayAdvanceSeries: resolved,
    mayBeChampion: resolved,
  });
}

/**
 * Apply one shared 5-minute overtime period model and completion guard.
 * Consumers supply their own rate/event sampler, but cannot change the
 * period length, cap, tie policy, or completion semantics in this contract.
 */
export async function runSharedOvertimeCompletion({ regulationScore, seed, random,
  simulatePeriod, onPeriod = () => {} } = {}, { signal } = {}) {
  if (!regulationScore || !validScore(regulationScore.home) || !validScore(regulationScore.away)) {
    fail('Regulation home and away scores must be nonnegative safe integers.');
  }
  if (!validSeed(seed) || typeof random !== 'function' || typeof simulatePeriod !== 'function'
    || typeof onPeriod !== 'function') {
    fail('A valid seed, shared random stream, period sampler, and onPeriod callback are required.');
  }

  let homeScore = regulationScore.home, awayScore = regulationScore.away;
  const periods = [];
  while (homeScore === awayScore && periods.length < GAME_OVERTIME_COMPLETION_POLICY.maximumOvertimePeriods) {
    throwIfAborted(signal);
    const periodIndex = periods.length + 1;
    const result = await simulatePeriod(Object.freeze({
      periodIndex,
      periodLabel: `OT${periodIndex}`,
      periodMinutes: GAME_OVERTIME_COMPLETION_POLICY.overtimePeriodMinutes,
      regulationMinutes: GAME_OVERTIME_COMPLETION_POLICY.regulationMinutes,
      currentHomeScore: homeScore,
      currentAwayScore: awayScore,
      seed,
      random,
      signal,
    }));
    // The sampler may yield to other work; discard its result if cancellation
    // arrived while the period was being simulated.
    throwIfAborted(signal);
    if (!result || !validScore(result.homePoints) || !validScore(result.awayPoints)) {
      fail(`Overtime sampler must return nonnegative integer points for both teams in OT${periodIndex}.`);
    }
    homeScore += result.homePoints;
    awayScore += result.awayPoints;
    const period = Object.freeze({
      periodIndex,
      periodLabel: `OT${periodIndex}`,
      periodMinutes: GAME_OVERTIME_COMPLETION_POLICY.overtimePeriodMinutes,
      homePoints: result.homePoints,
      awayPoints: result.awayPoints,
      homeScore,
      awayScore,
      evidence: result.evidence && typeof result.evidence === 'object' ? Object.freeze({ ...result.evidence }) : null,
    });
    periods.push(period);
    await onPeriod(period);
  }
  throwIfAborted(signal);
  const completion = completionState(homeScore, awayScore, periods.length);
  return Object.freeze({
    policy: GAME_OVERTIME_COMPLETION_POLICY,
    seed,
    regulationScore: Object.freeze({ home: regulationScore.home, away: regulationScore.away }),
    finalScore: Object.freeze({ home: homeScore, away: awayScore }),
    overtimePeriodsPlayed: periods.length,
    overtimePeriodLimit: GAME_OVERTIME_COMPLETION_POLICY.maximumOvertimePeriods,
    overtimePeriods: Object.freeze(periods),
    completion,
    resultLedgerEligible: completion.isGameComplete,
    note: 'The ten-period cap is a computation guard, not an NBA rules limit. A game still tied at the guard remains incomplete and receives no winner or standings/series/championship credit.',
  });
}
