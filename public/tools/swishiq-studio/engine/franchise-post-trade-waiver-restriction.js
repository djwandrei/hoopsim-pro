/*
 * Narrow NBA CBA Article VII, Section 8(h) restriction check.
 *
 * This checks only whether the assignor team may sign or waiver-claim a
 * player after the assignee team waived him. It does not establish waiver
 * priority, free-agent rights, salary-cap legality, contract validity, or
 * general CBA compliance. Complete, accepted source facts are required.
 */

export const FRANCHISE_POST_TRADE_WAIVER_RULE_VERSION = 'swishiq-franchise-post-trade-waiver-rule-v1';
export const FRANCHISE_POST_TRADE_WAIVER_RULE_SOURCE_URL = 'https://imgix.cosmicjs.com/25da5eb0-15eb-11ee-b5b3-fbd321202bdf-Final-2023-NBA-Collective-Bargaining-Agreement-6-28-23.pdf';
export const FRANCHISE_POST_TRADE_WAIVER_RULE_SOURCE_REF = '2023 NBA-NBPA CBA, Article VII, Section 8(h)';

const MIN_DATE = '1946-01-01';
const CBA_EFFECTIVE_DATE = '2023-07-01';
const fail = (code, message) => ({ status: 'fail', reasons: [{ code, message }] });
const unavailable = (code, message) => ({ status: 'unavailable', reasons: [{ code, message }] });
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 120;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function easternDate(value) {
  const ms = instant(value);
  if (ms === null) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(ms);
    const part = type => parts.find(item => item.type === type)?.value;
    const date = `${part('year')}-${part('month')}-${part('day')}`;
    return dateOnly(date);
  } catch {
    return null;
  }
}

function addTwelveMonths(value) {
  const date = dateOnly(value);
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  const targetYear = year + 1;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return `${targetYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function sourceEvidence(value, expectedScope) {
  if (!isRecord(value) || value.status !== 'verified-source'
    || !nonEmpty(value.sourceId) || !nonEmpty(value.sourceVersion)
    || !nonEmpty(value.sourceRef) || typeof value.sourceUrl !== 'string'
    || !value.sourceUrl.startsWith('https://') || value.scope !== expectedScope) return null;
  return {
    status: 'verified-source', scope: expectedScope,
    sourceId: value.sourceId.trim(), sourceVersion: value.sourceVersion.trim(),
    sourceRef: value.sourceRef.trim(), sourceUrl: value.sourceUrl.trim(),
  };
}

/**
 * Check only the assignor-team prohibition in CBA Article VII, Section 8(h).
 *
 * Required input:
 * - teamId/playerRef/action/transactionAt (an exact RFC3339 timestamp)
 * - verifiedTradeWaiverHistory: accepted, source-bound, complete scoped facts;
 *   outcome is `no-triggering-trade-waiver` or `traded-then-waived`.
 * - for the triggering event: assignor/assignee ids, exact instants when all
 *   trade conditions were satisfied and when the assignee waived the player.
 * - for a signing/claim by the assignor: verified contract evidence with the
 *   final contract season's end year.
 *
 * `pass` means only that this particular prohibition does not bar the
 * specified attempt. Other signing, waiver, roster, contract, and cap rules
 * are intentionally not evaluated here.
 */
export function evaluateFranchisePostTradeWaiverRestriction(input) {
  const context = isRecord(input) ? input : {};
  const base = {
    status: 'unavailable', reasons: [],
    ruleVersion: FRANCHISE_POST_TRADE_WAIVER_RULE_VERSION,
    ruleSourceUrl: FRANCHISE_POST_TRADE_WAIVER_RULE_SOURCE_URL,
    ruleSourceRef: FRANCHISE_POST_TRADE_WAIVER_RULE_SOURCE_REF,
    receipt: null,
  };
  const transactionDate = easternDate(context.transactionAt);
  if (!nonEmpty(context.teamId) || !nonEmpty(context.playerRef)
    || !['sign', 'claim-waivers'].includes(context.action)
    || transactionDate === null || transactionDate < MIN_DATE) {
    return { ...base, reasons: [{ code: 'post-trade-waiver-context-incomplete', message: 'This scoped check requires the attempting team, player, sign/claim-waivers action, and exact RFC3339 transaction time.' }] };
  }
  if (transactionDate < CBA_EFFECTIVE_DATE) {
    return { ...base, reasons: [{ code: 'post-trade-waiver-cba-version-unavailable', message: 'This helper is scoped to the 2023 CBA effective July 1, 2023; no prior-CBA rule is inferred.' }] };
  }

  const history = context.verifiedTradeWaiverHistory;
  const historySource = sourceEvidence(history, 'player-trade-waiver-history');
  if (!historySource || history.playerRef !== context.playerRef.trim()) {
    return { ...base, reasons: [{ code: 'trade-waiver-history-unverified', message: 'A complete, source-verified trade-and-waiver history for this exact player is required; absent history is not proof that the restriction is inapplicable.' }] };
  }
  if (history.outcome === 'no-triggering-trade-waiver') {
    return {
      ...base, status: 'pass',
      receipt: {
        playerRef: context.playerRef.trim(), teamId: context.teamId.trim(), action: context.action,
        transactionAt: context.transactionAt, transactionDateEastern: transactionDate,
        historyOutcome: history.outcome, historyEvidence: historySource,
        scope: 'Article VII, Section 8(h) only; not a general transaction legality determination',
      },
    };
  }
  if (history.outcome !== 'traded-then-waived') {
    return { ...base, reasons: [{ code: 'trade-waiver-history-outcome-unknown', message: 'The accepted history must explicitly establish either no triggering trade-waiver sequence or a verified trade followed by waiver.' }] };
  }

  const assignorTeamId = nonEmpty(history.assignorTeamId) ? history.assignorTeamId.trim() : null;
  const assigneeTeamId = nonEmpty(history.assigneeTeamId) ? history.assigneeTeamId.trim() : null;
  const tradeCompletedAtMs = instant(history.tradeConditionsSatisfiedAt);
  const waivedAtMs = instant(history.assigneeWaivedAt);
  const tradeDate = easternDate(history.tradeConditionsSatisfiedAt);
  const waivedDate = easternDate(history.assigneeWaivedAt);
  if (!assignorTeamId || !assigneeTeamId || assignorTeamId === assigneeTeamId
    || tradeCompletedAtMs === null || waivedAtMs === null || waivedAtMs <= tradeCompletedAtMs
    || !tradeDate || !waivedDate || tradeDate < CBA_EFFECTIVE_DATE) {
    return { ...base, reasons: [{ code: 'trade-waiver-event-facts-incomplete', message: 'Verified distinct assignor/assignee teams and exact, ordered post-CBA trade-completion and assignee-waiver timestamps are required.' }] };
  }

  const contract = context.verifiedContract;
  const contractSource = sourceEvidence(contract, 'player-contract-term');
  const lastSeasonEndYear = contract?.lastContractSeasonEndYear;
  if (context.teamId.trim() === assignorTeamId
    && (!contractSource || contract.playerRef !== context.playerRef.trim()
      || !Number.isInteger(lastSeasonEndYear) || lastSeasonEndYear < 1946 || lastSeasonEndYear > 2500)) {
    return { ...base, reasons: [{ code: 'final-contract-season-unverified', message: 'A source-verified final contract season for this exact player is required to calculate the July 1 cutoff.' }] };
  }

  const appliesToAttemptingTeam = context.teamId.trim() === assignorTeamId;
  const oneYearDate = addTwelveMonths(tradeDate);
  const julyAfterFinalSeason = contractSource && contract.playerRef === context.playerRef.trim()
    && Number.isInteger(lastSeasonEndYear)
    ? `${lastSeasonEndYear}-07-01`
    : null;
  // Article VII, Section 8(h) uses the EARLIER of the two expiration dates.
  const blockedUntil = appliesToAttemptingTeam && contractSource
    ? [oneYearDate, julyAfterFinalSeason].sort()[0]
    : null;
  const status = appliesToAttemptingTeam && transactionDate < blockedUntil ? 'fail' : 'pass';
  const receipt = {
    playerRef: context.playerRef.trim(), teamId: context.teamId.trim(), action: context.action,
    transactionAt: context.transactionAt, transactionDateEastern: transactionDate,
    historyOutcome: history.outcome, assignorTeamId, assigneeTeamId,
    tradeConditionsSatisfiedAt: history.tradeConditionsSatisfiedAt,
    assigneeWaivedAt: history.assigneeWaivedAt,
    transactionIsByAssignor: appliesToAttemptingTeam,
    oneYearBoundaryDate: oneYearDate,
    july1AfterLastContractSeasonDate: julyAfterFinalSeason,
    blockedUntilDate: blockedUntil,
    boundaryRule: 'prohibited when transactionDateEastern < min(oneYearBoundaryDate, july1AfterLastContractSeasonDate); permitted at or after that date by this rule only',
    historyEvidence: historySource,
    contractEvidence: contractSource,
    scope: 'Article VII, Section 8(h) only; not waiver priority, free-agent rights, salary-cap, roster, contract-form, or general transaction legality',
  };
  return status === 'fail'
    ? { ...base, status, reasons: [{ code: 'assignor-reacquisition-prohibited', message: `Article VII, Section 8(h) bars this assignor team from signing or claiming the player until ${blockedUntil}; the transaction date is ${transactionDate}.` }], receipt }
    : { ...base, status, reasons: [], receipt };
}
