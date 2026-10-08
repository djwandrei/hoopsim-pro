export const NBA_TEAM_FOUL_STATE_V1_FORMAT = 'djhc-nba-team-foul-state-v1';
const RULE_PROFILE = 'nba-current-rule-scenario';
const SOURCE_URL = 'https://official.nba.com/rule-no-12-fouls-and-penalties/';
const KINDS = Object.freeze(['defensive-common', 'shooting', 'offensive', 'technical']);
function review(reason) {
  throw Object.assign(new Error(`NBA team foul penalty requires review: ${reason}`), {
    foulReview: { status: 'requires-review', reason },
  });
}
const safeCount = value => Number.isSafeInteger(value) && value >= 0;
const plainRecord = value => value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const blankPeriod = () => ({ home: { teamFouls: 0, lastTwoMinuteTeamFouls: 0 },
  away: { teamFouls: 0, lastTwoMinuteTeamFouls: 0 } });
function validMoment(moment) {
  return plainRecord(moment) && Number.isSafeInteger(moment.eventId) && moment.eventId > 0 &&
    Number.isSafeInteger(moment.period) && moment.period > 0 &&
    Number.isFinite(moment.clockSecondsRemaining) && moment.clockSecondsRemaining >= 0 &&
    moment.clockSecondsRemaining <= (moment.period <= 4 ? 720 : 300);
}
function validateState(state) {
  if (!plainRecord(state) || state.format !== NBA_TEAM_FOUL_STATE_V1_FORMAT || state.version !== 1 ||
      state.ruleProfile !== RULE_PROFILE || !plainRecord(state.periods) ||
      (state.lastEvent !== null && !validMoment(state.lastEvent))) {
    review('invalid-team-foul-state');
  }
  for (const [key, period] of Object.entries(state.periods)) {
    if (!Number.isSafeInteger(Number(key)) || Number(key) <= 0 || String(Number(key)) !== key || !plainRecord(period) ||
        Object.keys(period).some(side => !['home', 'away'].includes(side))) review('invalid-period-foul-state');
    for (const side of ['home', 'away']) {
      const counts = period[side];
      if (!plainRecord(counts) || !safeCount(counts.teamFouls) || !safeCount(counts.lastTwoMinuteTeamFouls) ||
          counts.lastTwoMinuteTeamFouls > counts.teamFouls ||
          Object.keys(counts).some(field => !['teamFouls', 'lastTwoMinuteTeamFouls'].includes(field))) {
        review('invalid-team-foul-counts');
      }
    }
    if (!state.lastEvent || Number(key) > state.lastEvent.period) review('period-state-ahead-of-events');
  }
  if (state.lastEvent && !state.periods[state.lastEvent.period]) review('missing-last-event-period');
}

/** Generated/current-rule scenario state. It counts supplied supported events;
 * it does not infer fouls from boxes or claim complete historical rule coverage. */
export function createNbaTeamFoulStateV1() {
  return { format: NBA_TEAM_FOUL_STATE_V1_FORMAT, version: 1, ruleProfile: RULE_PROFILE,
    periods: {}, lastEvent: null };
}

/** Pure ordinary-foul decision. Shooting awards take precedence over the
 * common-foul bonus; offensive/technical fouls do not increment team quota.
 * Flagrantry, clear-path, away-from-play and double fouls need separate context
 * and are rejected rather than being treated as ordinary defensive fouls. */
export function evaluateNbaTeamFoulPenaltyV1(state, foul) {
  validateState(state);
  if (!validMoment(foul) || !['home', 'away'].includes(foul.team) || !KINDS.includes(foul.kind)) {
    review('unsupported-or-invalid-foul-event');
  }
  if (foul.kind === 'shooting' && (typeof foul.madeFieldGoal !== 'boolean' ||
      ![2, 3].includes(foul.shootingPoints))) review('unresolved-shooting-award');
  if (foul.kind === 'technical' && foul.technicalType !== 'single-ordinary') {
    review('unsupported-or-unresolved-technical-context');
  }
  if (state.lastEvent && (foul.eventId <= state.lastEvent.eventId || foul.period < state.lastEvent.period ||
      (foul.period === state.lastEvent.period && foul.clockSecondsRemaining > state.lastEvent.clockSecondsRemaining))) {
    review('nonchronological-foul-event');
  }
  const countsTeamFoul = ['defensive-common', 'shooting'].includes(foul.kind);
  const countsPersonalFoul = foul.kind !== 'technical';
  const resultingState = structuredClone(state);
  const period = resultingState.periods[foul.period] ??= blankPeriod();
  const team = period[foul.team];
  if (countsTeamFoul) {
    if (team.teamFouls === Number.MAX_SAFE_INTEGER ||
        (foul.clockSecondsRemaining <= 120 && team.lastTwoMinuteTeamFouls === Number.MAX_SAFE_INTEGER)) {
      review('team-foul-count-overflow');
    }
    team.teamFouls += 1;
    if (foul.clockSecondsRemaining <= 120) team.lastTwoMinuteTeamFouls += 1;
  }
  const quota = foul.period <= 4 ? 4 : 3;
  const quotaPenalty = countsTeamFoul && team.teamFouls > quota;
  const lastTwoPenalty = countsTeamFoul && foul.clockSecondsRemaining <= 120 && team.lastTwoMinuteTeamFouls > 1;
  let freeThrowAttempts = 0, penaltyReason = 'ordinary-offensive-foul; no-team-charge',
    possessionDisposition = 'opponent-inbound', section = 'B-VII';
  if (foul.kind === 'technical') {
    freeThrowAttempts = 1; penaltyReason = 'single-ordinary-technical-foul';
    possessionDisposition = 'dead-ball-free-throw; resume-prior-control'; section = 'A-V';
  } else if (foul.kind === 'shooting') {
    freeThrowAttempts = foul.madeFieldGoal ? 1 : foul.shootingPoints;
    penaltyReason = foul.madeFieldGoal ? 'made-basket-and-one; no-extra-bonus' : 'missed-shooting-foul';
    possessionDisposition = 'ordinary-free-throws; final-missed-attempt-live'; section = 'B-I; B-V-a-6';
  } else if (foul.kind === 'defensive-common') {
    freeThrowAttempts = quotaPenalty || lastTwoPenalty ? 2 : 0;
    penaltyReason = quotaPenalty ? 'period-team-foul-quota' : lastTwoPenalty ? 'last-two-minute-team-foul-quota' : 'below-team-foul-quota';
    possessionDisposition = freeThrowAttempts ? 'ordinary-free-throws; final-missed-attempt-live' : 'offended-team-inbound';
    section = 'B-V-a; B-V-a-1..4';
  }
  resultingState.lastEvent = { eventId: foul.eventId, period: foul.period, clockSecondsRemaining: foul.clockSecondsRemaining };
  return { format: 'djhc-nba-team-foul-penalty-v1', status: 'supported', ruleProfile: RULE_PROFILE,
    countsTeamFoul, countsPersonalFoul, freeThrowAttempts, penaltyReason, possessionDisposition,
    periodTeamFouls: team.teamFouls, lastTwoMinuteTeamFouls: team.lastTwoMinuteTeamFouls,
    commonFoulBonusActiveAfterEvent: team.teamFouls >= quota || team.lastTwoMinuteTeamFouls >= 1,
    resultingState, source: { url: SOURCE_URL, section, verifiedDate: '2026-10-08',
      scope: 'current-NBA-rule-scenario; supported-supplied-events-only' },
    disclosure: 'Rule arithmetic for supplied ordinary events, not a fitted foul-frequency model. Historical and future rule coverage, special foul categories and live integration are separate requirements.' };
}
