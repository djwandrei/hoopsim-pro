import { CAP_ACCOUNTING_RULE_SOURCE } from './cap-accounting-v1.mjs';
import { derivePayrollStateForLeague } from './payroll-state-v1.mjs';

export const STORED_TPE_FORMAT = 'djhc-stored-standard-tpe-v1';
const clone = value => structuredClone(value);
const cents = value => Math.round(value * 100);
function amount(raw) {
  const value = raw && typeof raw === 'object' && Object.hasOwn(raw, 'value') ? raw.value : raw;
  const status = raw?.valueStatus ?? raw?.status ?? '';
  return value === null || value === undefined || value === '' || typeof value === 'boolean' ||
    ['unknown', 'conflict', 'unresolved', 'missing', 'unreported', 'candidate'].includes(status) || /^(unknown|candidate)/.test(String(status)) ||
    !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
function anniversary(value) {
  const year = Number(value.slice(0, 4)) + 1;
  const candidate = `${year}${value.slice(4)}`;
  return date(candidate) ?? `${year}-02-28`;
}

/** One player's standard non-simultaneous exception. Aggregated, expanded,
 * transition and two-way exceptions cannot be banked through this contract. */
export function createStoredStandardTpe({ exceptionId, teamCode, createdAt, seasonStartYear,
  outgoingCanonicalName, outgoingTradeSalaryUsd, initialReplacementSalaryUsd = 0,
  outgoingTwoWay, disabledPlayerExceptionUsed, applicableRegularSeasonEndDate,
  creationPostTradeApronTeamSalaryUsd, creationFirstApronUsd, source } = {}) {
  if (!exceptionId || !teamCode || !outgoingCanonicalName || !Number.isInteger(seasonStartYear) || !date(createdAt)) throw new Error('Stored TPE requires ID, team, player, season and creation date.');
  if (seasonStartYear < 2023) throw new Error('Stored TPE creation currently uses the 2023 CBA; earlier rules require their own branch.');
  const capYear = Number(createdAt.slice(0, 4)) - (createdAt.slice(5) < '07-01' ? 1 : 0);
  if (capYear !== seasonStartYear) throw new Error('Stored TPE creation date must match its salary-cap year.');
  const base = amount(outgoingTradeSalaryUsd), initial = amount(initialReplacementSalaryUsd);
  if (base === null || initial === null || base <= 0) throw new Error('Stored TPE requires a positive resolved outgoing trade-salary basis and initial replacement amount.');
  if (outgoingTwoWay !== false || disabledPlayerExceptionUsed !== false) throw new Error('A stored TPE cannot arise from a two-way contract or a player with a used Disabled Player Exception.');
  if (!date(applicableRegularSeasonEndDate) || applicableRegularSeasonEndDate < createdAt) throw new Error('TPE requires the end date of its originating or following applicable regular season.');
  if (!source?.sourceSystem || !source?.sourceVersion || !date(String(source.retrievedAt ?? source.generatedAt ?? '').slice(0, 10))) throw new Error('Stored TPE requires dated and versioned sourced or generated provenance.');
  const creationApron = amount(creationPostTradeApronTeamSalaryUsd), creationFirst = amount(creationFirstApronUsd);
  if (creationApron === null || creationFirst === null) throw new Error('Stored TPE creation requires resolved post-assignment Apron Team Salary and First Apron.');
  const creationAllowanceUsd = creationApron > creationFirst ? 0 : 250000;
  if (cents(initial) > cents(base) + cents(creationAllowanceUsd)) throw new Error('Initial replacements exceed the standard TPE capacity.');
  return { format: STORED_TPE_FORMAT, exceptionId: String(exceptionId), teamCode: String(teamCode).toUpperCase(), seasonStartYear,
    createdAt, expiresAt: anniversary(createdAt), applicableRegularSeasonEndDate, outgoingCanonicalName,
    originalTradeSalaryUsd: base, usedTradeSalaryUsd: initial, usageHistory: [], status: 'active', source: clone(source),
    creationPostTradeApronTeamSalaryUsd: creationApron, creationFirstApronUsd: creationFirst, creationAllowanceUsd,
    ruleRefs: ['VII-6j1i', 'VII-6j3', 'VII-6j7', 'VII-6j8', 'VII-2e4F'], ruleSource: clone(CAP_ACCOUNTING_RULE_SOURCE),
    assumptions: ['Expiration is the calendar anniversary of creation; leap-day anniversaries use February 28.',
      'Outgoing CBA trade-salary and initial replacement salary are supplied separately from cash salary or cap hit.'], legalReady: false };
}

export function evaluateStoredTpeUse({ entry, teamCode, transactionDate, seasonStartYear, incomingTradeSalaryUsd,
  combinedWithOtherExceptions, postTradeApronTeamSalaryUsd, firstApronUsd, ruleVersionId = 'nba-nbpa-cba-2023' } = {}) {
  const missingInputs = [], violations = [], hardCapTriggers = [];
  if (entry?.format !== STORED_TPE_FORMAT) missingInputs.push('The selected stored TPE is absent or unsupported.');
  if (!entry?.source?.sourceSystem || !entry?.source?.sourceVersion || !date(String(entry?.source?.retrievedAt ?? entry?.source?.generatedAt ?? '').slice(0, 10))) missingInputs.push('Stored TPE input provenance is incomplete.');
  if (entry && String(teamCode).toUpperCase() !== entry.teamCode) violations.push('The selected stored TPE belongs to another team.');
  if (ruleVersionId !== 'nba-nbpa-cba-2023' || !Number.isInteger(seasonStartYear) || seasonStartYear < 2023) missingInputs.push('Stored TPE use requires the 2023 CBA branch and an applicable season.');
  const used = amount(entry?.usedTradeSalaryUsd), base = amount(entry?.originalTradeSalaryUsd), incoming = amount(incomingTradeSalaryUsd);
  const apron = amount(postTradeApronTeamSalaryUsd), first = amount(firstApronUsd);
  if (used === null || base === null || incoming === null) missingInputs.push('TPE original, used and incoming trade-salary values must be resolved.');
  if (apron === null || first === null) missingInputs.push('Stored TPE use requires post-trade Apron Team Salary and first-apron threshold.');
  if (!date(transactionDate) || !date(entry?.createdAt) || !date(entry?.expiresAt) || !date(entry?.applicableRegularSeasonEndDate)) missingInputs.push('Stored TPE use requires resolved creation, expiry, usage and applicable regular-season end dates.');
  if (combinedWithOtherExceptions === true) violations.push('A stored standard TPE cannot be combined with another exception or outgoing-player salary for the same acquired contract.');
  else if (combinedWithOtherExceptions !== false) missingInputs.push('Exception non-combination status is unresolved.');
  if (!entry?.status || ['unknown', 'unresolved', 'missing', 'unreported', 'conflict'].includes(entry.status) || String(entry.status).startsWith('unknown')) missingInputs.push('Stored TPE active status is unresolved.');
  else if (entry.status !== 'active') violations.push('The selected stored TPE is inactive, expired or renounced.');
  if (date(entry?.createdAt) && date(entry?.expiresAt) && entry.expiresAt !== anniversary(entry.createdAt)) violations.push('Stored TPE expiration must be its one-year calendar anniversary.');
  if (date(transactionDate) && date(entry?.createdAt) && date(entry?.expiresAt)) {
    if (transactionDate < entry.createdAt) violations.push('A stored TPE cannot be used before it is created.');
    if (transactionDate > entry.expiresAt) violations.push('The selected stored TPE has expired.');
    const capYear = Number(transactionDate.slice(0, 4)) - (transactionDate.slice(5) < '07-01' ? 1 : 0);
    if (capYear !== seasonStartYear) violations.push('Stored TPE usage date does not match the current salary-cap year.');
  }
  const allowanceUsd = apron === null || first === null ? null : apron > first ? 0 : 250000;
  const capacityUsd = base === null || used === null || allowanceUsd === null ? null : Math.max(0, (cents(base) + cents(allowanceUsd) - cents(used)) / 100);
  if (incoming !== null && capacityUsd !== null && cents(incoming) > cents(capacityUsd)) violations.push('Incoming trade salary exceeds the stored TPE remaining capacity.');
  const afterApplicableRegularSeason = date(transactionDate) && date(entry?.applicableRegularSeasonEndDate) ? transactionDate > entry.applicableRegularSeasonEndDate : null;
  if (afterApplicableRegularSeason && seasonStartYear >= 2024 && incoming !== null && incoming > 0) {
    hardCapTriggers.push({ level: 'first-apron', thresholdUsd: first, reason: 'stored-standard-tpe-after-applicable-regular-season', ruleRef: 'VII-2e4F' });
    if (apron !== null && first !== null && apron > first) violations.push('Use of this older stored TPE would exceed the applicable first-apron hard cap.');
  }
  return { format: 'djhc-stored-tpe-use-evaluation-v1', status: violations.length ? 'fail' : missingInputs.length ? 'unknown' : 'pass',
    exceptionId: entry?.exceptionId ?? null, incomingTradeSalaryUsd: incoming, usedTradeSalaryBeforeUsd: used,
    usedTradeSalaryAfterUsd: used === null || incoming === null ? null : (cents(used) + cents(incoming)) / 100,
    allowanceUsd, capacityBeforeUsd: capacityUsd, capacityAfterUsd: capacityUsd === null || incoming === null ? null : Math.max(0, capacityUsd - incoming),
    afterApplicableRegularSeason, hardCapTriggers, missingInputs, violations, ruleRefs: ['VII-6j1i', 'VII-6j3', 'VII-2e4F'], legalReady: false };
}

/** Update capacity once per accepted transaction, retaining the aggregate used
 * salary so the $250k allowance is not replenished on each acquisition. */
export function commitStoredTpeUse(entry, evaluation, { proposalId, transactionDate } = {}) {
  if (evaluation.status !== 'pass' || evaluation.exceptionId !== entry.exceptionId || !proposalId || !date(transactionDate)) throw new Error('Cannot commit an unresolved or failed stored TPE use.');
  if ((entry.usageHistory ?? []).some(row => row.proposalId === proposalId)) throw new Error('Stored TPE use has already been committed.');
  if (evaluation.usedTradeSalaryBeforeUsd !== entry.usedTradeSalaryUsd) throw new Error('Stored TPE evaluation is stale.');
  const next = clone(entry);
  next.usedTradeSalaryUsd = evaluation.usedTradeSalaryAfterUsd;
  next.usageHistory = [...(next.usageHistory ?? []), { proposalId, transactionDate, incomingTradeSalaryUsd: evaluation.incomingTradeSalaryUsd,
    usedTradeSalaryBeforeUsd: evaluation.usedTradeSalaryBeforeUsd, usedTradeSalaryAfterUsd: evaluation.usedTradeSalaryAfterUsd, allowanceUsd: evaluation.allowanceUsd }];
  return next;
}

/** Low-level immutable ledger transition. Team renunciation is committed only
 * through the transaction engine's normal user-approval gate. */
export function closeStoredTpe(entry, { reason, asOfDate, proposalId = null } = {}) {
  if (entry?.format !== STORED_TPE_FORMAT || entry.status !== 'active') throw new Error('Only an active supported stored TPE can be closed.');
  if (!['renounced', 'expired'].includes(reason) || !date(asOfDate)) throw new Error('Stored TPE closure requires a supported reason and valid calendar date.');
  if (date(entry.createdAt) && asOfDate < entry.createdAt) throw new Error('Stored TPE cannot be closed before creation.');
  if (reason === 'expired' && (!date(entry.expiresAt) || asOfDate <= entry.expiresAt)) throw new Error('Stored TPE expires after its inclusive anniversary deadline.');
  if (reason === 'renounced' && !proposalId) throw new Error('TPE renunciation requires a committed proposal ID.');
  if (reason === 'renounced' && (!date(entry.expiresAt) || asOfDate > entry.expiresAt)) throw new Error('An already expired or unresolved-expiry TPE cannot be renounced; advance the exception calendar.');
  return { ...clone(entry), status: reason, closedAt: asOfDate, closedByProposalId: proposalId,
    closure: { reason, asOfDate, proposalId, ruleRefs: reason === 'expired' ? ['VII-6j1i'] : ['VII-6n2'] } };
}

/** Release only linked exception holds. Acquired player salaries and every
 * unrelated ledger entry remain in the team state. */
export function closeStoredTpeHolds(team, exceptionId, { reason, asOfDate, proposalId = null } = {}) {
  let closedHoldCount = 0;
  for (const hold of team.capLedger?.entries ?? []) {
    if (hold.kind !== 'exception-hold' || hold.tpeExceptionId !== exceptionId || hold.active === false) continue;
    hold.active = false;
    hold.closedByProposalId = proposalId;
    hold.closedAt = asOfDate;
    hold.closeReason = `stored-tpe-${reason}`;
    closedHoldCount += 1;
  }
  return closedHoldCount;
}

/** Scheduled expiry is a clock event, not a CPU negotiation or a user offer.
 * Invalid/missing expiry facts remain open and explicitly unresolved. */
export function advanceStoredTpeCalendar(state, { asOfDate } = {}) {
  if (!date(asOfDate)) throw new Error('TPE calendar advancement requires a valid date.');
  const next = clone(state), expired = [], unresolved = [], touched = [];
  for (const team of next.teams ?? []) for (let index = 0; index < (team.tpeLedger ?? []).length; index += 1) {
    const entry = team.tpeLedger[index];
    if (entry.status !== 'active') continue;
    if (!date(entry.expiresAt) || !date(entry.createdAt) || entry.expiresAt !== anniversary(entry.createdAt)) {
      unresolved.push({ teamCode: team.teamCode, exceptionId: entry.exceptionId, reason: 'Creation/expiration is unresolved or conflicts with the one-year deadline.' });
      continue;
    }
    if (asOfDate <= entry.expiresAt) continue;
    team.tpeLedger[index] = closeStoredTpe(entry, { reason: 'expired', asOfDate });
    const closedHoldCount = closeStoredTpeHolds(team, entry.exceptionId, { reason: 'expired', asOfDate });
    expired.push({ teamCode: team.teamCode, exceptionId: entry.exceptionId, asOfDate, closedHoldCount });
    touched.push(team.teamCode);
  }
  let resultState = next;
  if (expired.length) {
    resultState = derivePayrollStateForLeague(next, { teamCodes: [...new Set(touched)] }).state;
    resultState.revision = state.revision + 1;
    resultState.capCalendarLedger = [...(next.capCalendarLedger ?? []), { kind: 'stored-tpe-expiry', asOfDate, expired: clone(expired), revision: resultState.revision }];
  }
  return { state: resultState, report: { format: 'djhc-stored-tpe-calendar-v1', asOfDate, expired, unresolved, legalReady: false } };
}
