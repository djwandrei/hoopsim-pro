export const REBOUND_OWNERSHIP_BUDGET_V1 = 'player-rebound-budget-v1';

function review(reason) {
  throw Object.assign(new Error(`Rebound ownership requires review: ${reason}`), {
    reboundReview: { status: 'requires-review', reason },
  });
}
function probability(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) review(`invalid-${name}`);
  return value;
}
function side(value) {
  if (!['home', 'away'].includes(value)) review('invalid-recovery-side');
  return value;
}
function positiveId(value) { return Number.isSafeInteger(value) && value > 0; }
function draw(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) review('invalid-random-draw');
  return value;
}
function creditDraw(p, random) { return p === 1 || (p !== 0 && draw(random) < p); }

/** Match credited player boards to prior/scenario on-court rates without
 * changing the probability of retaining control. Opportunities are supplied by
 * the event branch, including continued shots and last live free-throw misses.
 * Unattributed recoveries are generated assumptions, not observed NBA labels. */
export function estimateReboundOwnershipBudgetV1({ offense, defense, possessions,
  expectedReboundOpportunitiesPerPossession, offensiveRecoveryProbability = 0.24 } = {}) {
  if (!Array.isArray(offense) || !offense.length || !Array.isArray(defense) || !defense.length ||
      !Number.isFinite(possessions) || possessions <= 0 ||
      !Number.isFinite(expectedReboundOpportunitiesPerPossession) || expectedReboundOpportunitiesPerPossession < 0) {
    review('invalid-player-rebound-budget-context');
  }
  const retention = probability(offensiveRecoveryProbability, 'offensive-recovery-probability');
  const sum = (rows, field) => rows.reduce((total, row) => {
    if (!Number.isFinite(row[field]) || row[field] < 0) review(`invalid-${field}`);
    return total + row[field];
  }, 0);
  const requestedOffensiveReboundsPerPossession = sum(offense, 'offensiveReboundsPer36') * (48 / 36) / possessions;
  const requestedOpponentDefensiveReboundsPerPossession = sum(defense, 'defensiveReboundsPer36') * (48 / 36) / possessions;
  const requestedPlayerReboundsPerPossession = requestedOffensiveReboundsPerPossession + requestedOpponentDefensiveReboundsPerPossession;
  const expectedOffensiveRecoveries = expectedReboundOpportunitiesPerPossession * retention;
  const expectedDefensiveRecoveries = expectedReboundOpportunitiesPerPossession * (1 - retention);
  const ratio = (requested, available) => available > 0 ? Math.min(1, requested / available) : 0;
  const offensivePlayerCreditProbability = ratio(requestedOffensiveReboundsPerPossession, expectedOffensiveRecoveries);
  const defensivePlayerCreditProbability = ratio(requestedOpponentDefensiveReboundsPerPossession, expectedDefensiveRecoveries);
  // Side-specific saturation may prevent a requested total from being achieved.
  const appliedPlayerReboundsPerPossession = expectedOffensiveRecoveries * offensivePlayerCreditProbability +
    expectedDefensiveRecoveries * defensivePlayerCreditProbability;
  return { playerCreditProbability: ratio(appliedPlayerReboundsPerPossession, expectedReboundOpportunitiesPerPossession),
    requestedAggregatePlayerCreditProbability: ratio(requestedPlayerReboundsPerPossession, expectedReboundOpportunitiesPerPossession),
    offensivePlayerCreditProbability, defensivePlayerCreditProbability,
    requestedPlayerReboundsPerPossession, requestedOffensiveReboundsPerPossession,
    requestedOpponentDefensiveReboundsPerPossession, expectedReboundOpportunitiesPerPossession,
    appliedPlayerReboundsPerPossession,
    constrained: requestedOffensiveReboundsPerPossession > expectedOffensiveRecoveries + 1e-12 ||
      requestedOpponentDefensiveReboundsPerPossession > expectedDefensiveRecoveries + 1e-12,
    source: 'predicted-or-explicit-scenario-on-court-rates; generated-recovery-attribution-budget',
    empiricallySelected: false };
}

/** Uniform scenarios may change player/team retention separately. Generated
 * split budgets preserve retention and then credit a board conditional on its
 * side. A uniform p=1 consumes only the legacy retention draw. */
export function chooseReboundOwnershipV1({ offenseSide, playerCreditProbability,
  playerOffensiveRetentionProbability, teamOffensiveRetentionProbability = playerOffensiveRetentionProbability,
  offensivePlayerCreditProbability, defensivePlayerCreditProbability } = {}, random) {
  side(offenseSide);
  if (typeof random !== 'function') review('missing-random-generator');
  const p = probability(playerCreditProbability, 'player-credit-probability');
  const playerRetention = probability(playerOffensiveRetentionProbability, 'player-retention-probability');
  const teamRetention = probability(teamOffensiveRetentionProbability, 'team-retention-probability');
  const split = offensivePlayerCreditProbability !== undefined || defensivePlayerCreditProbability !== undefined;
  let offensive, credited;
  if (split) {
    const pO = probability(offensivePlayerCreditProbability, 'offensive-player-credit-probability');
    const pD = probability(defensivePlayerCreditProbability, 'defensive-player-credit-probability');
    if (teamRetention !== playerRetention) review('split-budget-retention-conflict');
    offensive = draw(random) < playerRetention;
    credited = creditDraw(offensive ? pO : pD, random);
  } else {
    credited = creditDraw(p, random);
    offensive = draw(random) < (credited ? playerRetention : teamRetention);
  }
  return { creditType: credited ? 'player' : 'team',
    recoverySide: offensive ? offenseSide : offenseSide === 'home' ? 'away' : 'home',
    offensive, ballDead: !credited };
}

export function isReboundableMissV1(event) {
  return Boolean(event && ((event.type === 'field_goal_attempt' && event.countsAsFieldGoalAttempt !== false &&
    ['blocked', 'missed'].includes(event.shotResult)) || (event.type === 'free_throw' &&
    event.result === 'missed' && (event.freeThrowType === undefined || event.freeThrowType === 'ordinary') && event.ballRemainsLive !== false &&
    Number.isSafeInteger(event.attempt) && event.attempt > 0 && event.attempt === event.attempts)));
}

export function createReboundRecoveryLedgerV1() {
  return { format: 'djhc-rebound-recovery-ledger-v1', entries: [], byMissedEventId: new Map(), byEventId: new Map() };
}

function validateLedger(ledger) {
  if (ledger?.format !== 'djhc-rebound-recovery-ledger-v1' || !Array.isArray(ledger.entries) ||
      !(ledger.byMissedEventId instanceof Map) || !(ledger.byEventId instanceof Map)) review('invalid-recovery-ledger');
}

export function claimReboundRecoveryV1(ledger, claim, sourceEvent) {
  validateLedger(ledger);
  if (!claim || !positiveId(claim.eventId) || !positiveId(claim.missedEventId) || claim.eventId <= claim.missedEventId ||
      sourceEvent?.eventId !== claim.missedEventId || !isReboundableMissV1(sourceEvent)) review('invalid-rebound-source-claim');
  side(claim.recoverySide);
  if (!['player', 'team'].includes(claim.creditType)) review('invalid-rebound-credit-type');
  const playerRef = claim.playerRef ?? null;
  if ((claim.creditType === 'player' && (typeof playerRef !== 'string' || !playerRef.trim())) ||
      (claim.creditType === 'team' && playerRef !== null)) review('invalid-rebound-player-attribution');
  if (ledger.byMissedEventId.has(claim.missedEventId) || ledger.byEventId.has(claim.eventId)) review('duplicate-recovery-claim');
  const entry = Object.freeze({ eventId: claim.eventId, missedEventId: claim.missedEventId,
    recoverySide: claim.recoverySide, creditType: claim.creditType, playerRef });
  // All rejection paths precede the first write.
  ledger.entries.push(entry);
  ledger.byMissedEventId.set(entry.missedEventId, entry);
  ledger.byEventId.set(entry.eventId, entry);
  return entry;
}

/** Verify all recoverable misses, including omissions. Pure finalization does
 * not mutate the ledger. The compact result contains counts, never event arrays. */
export function finalizeReboundRecoveryLedgerV1(ledger, eventIndex) {
  validateLedger(ledger);
  if (!(eventIndex instanceof Map) || ledger.entries.length !== ledger.byMissedEventId.size ||
      ledger.entries.length !== ledger.byEventId.size) review('invalid-recovery-index');
  const verified = createReboundRecoveryLedgerV1();
  const bySide = Object.fromEntries(['home', 'away'].map(value => [value, { playerRecoveries: 0, teamRecoveries: 0 }]));
  let recoverableMisses = 0, recoveryEvents = 0;
  for (const [eventId, event] of eventIndex) {
    if (!positiveId(eventId) || !event || (event.eventId !== undefined && event.eventId !== eventId)) review('invalid-event-index-entry');
    if (isReboundableMissV1(event)) {
      recoverableMisses += 1;
      if (!ledger.byMissedEventId.has(eventId)) review('recoverable-miss-without-recovery');
    }
    if (['rebound', 'team_rebound'].includes(event.type)) recoveryEvents += 1;
  }
  for (const entry of ledger.entries) {
    const source = eventIndex.get(entry.missedEventId), event = eventIndex.get(entry.eventId);
    claimReboundRecoveryV1(verified, entry, source && { ...source, eventId: entry.missedEventId });
    const expectedType = entry.creditType === 'player' ? 'rebound' : 'team_rebound';
    if (event?.type !== expectedType || event.recoverySide !== entry.recoverySide ||
        event.creditType !== entry.creditType || (event.actorPlayerRef ?? null) !== entry.playerRef ||
        (event.missedFieldGoalEventId ?? event.missedFreeThrowEventId) !== entry.missedEventId ||
        (source.type === 'field_goal_attempt' ? event.missedFreeThrowEventId !== undefined : event.missedFieldGoalEventId !== undefined) ||
        ledger.byMissedEventId.get(entry.missedEventId) !== entry || ledger.byEventId.get(entry.eventId) !== entry) {
      review('recovery-event-does-not-reconcile');
    }
    bySide[entry.recoverySide][entry.creditType === 'player' ? 'playerRecoveries' : 'teamRecoveries'] += 1;
  }
  if (recoverableMisses !== ledger.entries.length || recoveryEvents !== ledger.entries.length) review('recovery-count-does-not-reconcile');
  return { format: 'djhc-rebound-recovery-summary-v1', recoverableMisses, recoveryEvents, bySide,
    coverage: 'every-modeled-reboundable-miss-has-exactly-one-recovery',
    observedTeamReboundLabelsUsed: false };
}
