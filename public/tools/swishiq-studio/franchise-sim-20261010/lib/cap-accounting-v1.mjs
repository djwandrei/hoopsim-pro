import { normalizeCanonicalPlayerName, resolvePlayerByCanonicalName, validateLeagueState } from './simulation-contracts-v1.mjs';

export const CAP_LEDGER_FORMAT = 'djhc-team-cap-ledger-v1';
export const CAP_ACCOUNTING_FORMAT = 'djhc-team-cap-accounting-v1';
export const CAP_BASE_FIELDS = Object.freeze({
  teamSalaryUsd: 'capHit', apronTeamSalaryUsd: 'apronCapHit', taxTeamSalaryUsd: 'taxCapHit',
  mtsCapHoldTeamSalaryUsd: 'mtsCapHoldCapHit', mtsPaymentTeamSalaryUsd: 'mtsPaymentCapHit',
});
export const CAP_COMPONENT_KINDS = Object.freeze(['dead-money', 'free-agent-hold', 'draft-hold', 'exception-hold', 'salary-adjustment', 'mts-adjustment']);
export const CAP_ACCOUNTING_RULE_SOURCE = Object.freeze({
  sourceSystem: 'nba-nbpa-cba', sourceVersion: '2023-signed-cba-VII-2c-2d-2e-4-7d6', retrievedAt: '2026-10-07',
  sourceUrl: 'https://imgix.cosmicjs.com/25da5eb0-15eb-11ee-b5b3-fbd321202bdf-Final-2023-NBA-Collective-Bargaining-Agreement-6-28-23.pdf',
});

const clone = value => structuredClone(value);
const bases = Object.keys(CAP_BASE_FIELDS);
function valueOf(value) { return value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value; }
function numeric(value, { signed = false } = {}) {
  const raw = valueOf(value);
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null;
  const status = value?.valueStatus ?? value?.status ?? '';
  if (['conflict', 'unreported', 'unresolved', 'missing-term', 'missing'].includes(status) || String(status).startsWith('unknown')) return null;
  const number = Number(raw);
  return Number.isFinite(number) && (signed || number >= 0) ? number : null;
}
function statusOf(raw, parent) { return raw?.valueStatus ?? raw?.status ?? parent?.status ?? parent?.valueStatus ?? 'unannotated'; }
function termFor(player, year) { return (player.contractSeasons ?? player.contract?.seasons ?? []).find(term => Number(term.seasonStartYear ?? term.fromYear) === year); }
function unique(values) { return [...new Set(values)]; }
function sourceFor(raw, parent) { return raw?.source ?? parent?.source ?? null; }
function cents(value) { return Math.round(value * 100); }
function scenarioSource(source, generatedAt = '2026-10-07') {
  return { sourceSystem: 'djhc-cap-scenario', sourceVersion: 'djhc-cap-scenario-v1', sourceClass: 'generated-scenario',
    generatedAt, retrievedAt: generatedAt, inputSource: clone(source) };
}
function evidence(value, field, year, source) { return { value, field, seasonStartYear: year, unit: 'USD', valueStatus: 'generated-scenario', source: clone(source) }; }

/** Each category's complete declaration is explicit. It describes the supplied
 * simulation state, never the completeness of an outside historical provider. */
export function createTeamCapLedger({ entries = [], coverageBySeason = {}, rosterChargePolicyBySeason = {}, accountingPolicyBySeason = {}, snapshotsBySeason = {}, source = null, assumptions = [] } = {}) {
  const ledger = { format: CAP_LEDGER_FORMAT, schemaVersion: '1.0.0', entries: clone(entries), coverageBySeason: clone(coverageBySeason),
    rosterChargePolicyBySeason: clone(rosterChargePolicyBySeason), accountingPolicyBySeason: clone(accountingPolicyBySeason),
    snapshotsBySeason: clone(snapshotsBySeason), source: clone(source), assumptions: [...assumptions] };
  validateTeamCapLedger(ledger);
  return ledger;
}

export function validateTeamCapLedger(ledger) {
  if (ledger?.format !== CAP_LEDGER_FORMAT || !Array.isArray(ledger.entries)) throw new Error('Unsupported team cap-ledger format.');
  const seen = new Set();
  for (const entry of ledger.entries) {
    if (!entry.entryId || !Number.isInteger(entry.seasonStartYear) || !CAP_COMPONENT_KINDS.includes(entry.kind)) throw new Error('Cap entries require entryId, season, and a supported kind.');
    const key = `${entry.seasonStartYear}|${entry.entryId}`;
    if (seen.has(key)) throw new Error(`Duplicate cap-ledger entry ${key}.`);
    seen.add(key);
    for (const base of bases) {
      const raw = valueOf(entry.values?.[base]);
      if (raw !== null && raw !== undefined && (raw === '' || typeof raw === 'boolean' || !Number.isFinite(Number(raw)) ||
          (Number(raw) < 0 && !['salary-adjustment', 'mts-adjustment'].includes(entry.kind)))) throw new Error(`Invalid ${base} amount in cap entry ${entry.entryId}.`);
    }
  }
  return { valid: true, entryCount: ledger.entries.length };
}

/** Generate salary bases only for explicitly simple, fully protected contracts.
 * This profile excludes special minimum reimbursements, signing/trade bonuses,
 * deferred salary and other adjustments. Existing conflicting values are held. */
export function buildStandardScenarioContractAccounting(term, { source = null, generatedAt, taxStage = 'projected' } = {}) {
  const year = term?.seasonStartYear ?? term?.fromYear;
  if (!Number.isInteger(year)) throw new Error('Scenario contract accounting requires a contract season.');
  if (term.accountingProfile !== 'standard-guaranteed-no-adjustments') throw new Error('Explicit standard-guaranteed-no-adjustments accounting profile is required.');
  if (!['projected', 'final'].includes(taxStage)) throw new Error('Tax stage must be projected or final.');
  const salary = numeric(term.salary);
  const guaranteed = numeric(term.guaranteedCash);
  const likely = numeric(term.likelyBonus);
  const unlikely = numeric(term.unlikelyBonus);
  if ([salary, guaranteed, likely, unlikely].some(value => value === null) || guaranteed !== salary) throw new Error('Standard accounting needs known salary, full base guarantee, and both bonus amounts.');
  const earned = taxStage === 'final' ? numeric(term.earnedBonusUsd) : likely;
  if (earned === null) throw new Error('Final tax accounting requires the actual earned bonus amount.');
  const topUpState = term.minimumFreeAgentTopUp;
  let topUp = null;
  if (topUpState?.applicable === false) topUp = 0;
  else if (topUpState?.applicable === true && Number.isInteger(topUpState.yearsOfServiceAtSigning) &&
      [0, 1].includes(topUpState.yearsOfServiceAtSigning) && topUpState.signedAsFreeAgent === true &&
      numeric(topUpState.twoYearsMinimumSalaryUsd) !== null) topUp = Math.max(0, numeric(topUpState.twoYearsMinimumSalaryUsd) - salary);
  if (topUp === null) throw new Error('Tax/apron minimum free-agent top-up needs explicit applicable inputs or a non-applicability declaration.');
  const derived = { capHit: salary + likely, apronCapHit: salary + likely + unlikely + topUp,
    taxCapHit: salary + earned + topUp, mtsCapHoldCapHit: salary + earned, mtsPaymentCapHit: salary + likely,
    tradeSalaryOutgoing: salary + likely, tradeSalaryIncoming: salary + likely };
  const next = clone(term);
  const conflicts = [];
  const generatedFields = [];
  const selectedSource = scenarioSource(source ?? term.source, generatedAt);
  for (const [field, amount] of Object.entries(derived)) {
    const existing = numeric(term[field]);
    if (valueOf(term[field]) !== null && valueOf(term[field]) !== undefined) {
      if (existing === null || existing !== amount) conflicts.push({ field, existingValue: valueOf(term[field]), derivedValue: amount });
      continue;
    }
    next[field] = evidence(amount, field, year, selectedSource);
    generatedFields.push(field);
  }
  next.accounting = { format: CAP_ACCOUNTING_FORMAT, profile: term.accountingProfile, taxStage, minimumFreeAgentTopUpUsd: topUp,
    generatedFields, conflicts, source: selectedSource, ruleRefs: ['VII-3d', 'VII-2c', 'VII-2d', 'VII-2e'],
    assumptions: ['The explicit simple-contract profile excludes special salary adjustments and minimum reimbursements.',
      ...(taxStage === 'projected' ? ['Tax and MTS bonus inputs use likely bonuses until actual earned bonuses are supplied.'] : []),
      'Trade-salary fields are regular-season ordinary-contract inputs; offseason trade rules must derive their separate basis.'] };
  return { term: next, status: conflicts.length ? 'conflict' : 'generated-scenario', conflicts, generatedFields };
}

function rosterContractRow(player, year) {
  const term = termFor(player, year);
  const row = { entryId: `roster-${normalizeCanonicalPlayerName(player.canonicalName)}`, kind: 'roster-contract',
    canonicalName: player.canonicalName, seasonStartYear: year, values: {}, statuses: {}, sourceRefs: [] };
  const twoWay = valueOf(term?.twoWay);
  for (const [base, field] of Object.entries(CAP_BASE_FIELDS)) {
    const raw = term?.[field];
    row.statuses[base] = twoWay === true ? statusOf(term?.twoWay, term) : statusOf(raw, term);
    const unusable = ['conflict', 'unreported', 'unresolved', 'missing-term', 'missing'].includes(row.statuses[base]) || String(row.statuses[base]).startsWith('unknown');
    const derivedConflict = (term?.accounting?.conflicts ?? []).some(conflict => conflict.field === field);
    row.values[base] = unusable || derivedConflict ? null : twoWay === true ? 0 : numeric(raw);
    const source = sourceFor(twoWay === true ? term.twoWay : raw, term);
    if (source) row.sourceRefs.push(source);
  }
  const twoWayStatus = statusOf(term?.twoWay, term);
  row.incompleteRosterCounted = String(twoWayStatus).startsWith('unknown') || ['conflict', 'unresolved'].includes(twoWayStatus)
    ? null : twoWay === true ? false : twoWay === false ? true : null;
  if (term?.active === false || ['declined', 'terminated', 'expired'].includes(String(valueOf(term?.optionDecisionStatus) ?? '').toLowerCase())) {
    row.values = Object.fromEntries(bases.map(base => [base, null]));
    row.reason = 'Inactive contract remains on the active roster.';
    row.incompleteRosterCounted = null;
  } else if (valueOf(term?.playerOption) === true || valueOf(term?.teamOption) === true) {
    const decision = valueOf(term?.optionDecisionStatus ?? term?.optionStatus);
    const decisionStatus = statusOf(term?.optionDecisionStatus ?? term?.optionStatus, term);
    if (decision !== 'exercised' || /unknown|candidate|conflict|unresolved|unreported|missing/.test(String(decisionStatus))) {
      row.values = Object.fromEntries(bases.map(base => [base, null]));
      row.statuses = Object.fromEntries(bases.map(base => [base, 'unknown-option-decision']));
      row.incompleteRosterCounted = null;
      row.reason = 'Contingent option-year salary requires an exercised option decision.';
    }
  }
  return row;
}

function rosterChargeRow(rows, entries, policy, year) {
  const values = Object.fromEntries(bases.map(base => [base, 0]));
  const reasons = [];
  if (!policy || !['offseason', 'regular-season'].includes(policy.period)) reasons.push('Incomplete-roster charge period is unresolved.');
  let count = null;
  let charge = null;
  if (policy?.period === 'regular-season') charge = 0;
  else if (policy?.period === 'offseason') {
    const countedNames = new Set();
    for (const row of rows) {
      if (row.incompleteRosterCounted === null) reasons.push(`Contract applicability or two-way/standard status is unresolved for ${row.canonicalName}.`);
      else if (row.incompleteRosterCounted) countedNames.add(normalizeCanonicalPlayerName(row.canonicalName));
    }
    for (const entry of entries.filter(entry => ['free-agent-hold', 'draft-hold'].includes(entry.kind))) {
      if (entry.countsTowardIncompleteRoster === undefined || !entry.canonicalName) reasons.push(`Incomplete-roster count status is unresolved for ${entry.entryId}.`);
      else if (entry.countsTowardIncompleteRoster === true) countedNames.add(normalizeCanonicalPlayerName(entry.canonicalName));
    }
    count = countedNames.size;
    const rookieMinimum = numeric(policy.zeroYearsMinimumSalaryUsd);
    if (rookieMinimum === null) reasons.push('Zero-years-of-service minimum salary is unresolved.');
    if (!reasons.length) charge = Math.max(0, 12 - count) * rookieMinimum;
  }
  values.teamSalaryUsd = charge;
  return { entryId: `incomplete-roster-${year}`, kind: 'incomplete-roster-charge', seasonStartYear: year,
    values, count, missingInputs: reasons, source: clone(policy?.source ?? null), status: policy?.status ?? 'unannotated', ruleRefs: ['VII-4f', 'VII-2e1x'] };
}

export function calculateTeamCapAccounting(state, teamCode, { seasonStartYear = state.seasonStartYear } = {}) {
  const team = state.teams.find(row => row.teamCode === String(teamCode).toUpperCase());
  if (!team) throw new Error(`Unknown team ${teamCode}.`);
  const ledger = team.capLedger;
  if (!ledger) return { format: CAP_ACCOUNTING_FORMAT, status: 'unconfigured', seasonStartYear, teamCode: team.teamCode };
  validateTeamCapLedger(ledger);
  const rows = team.rosterNames.map(name => {
    const resolution = resolvePlayerByCanonicalName(state.players, name);
    if (resolution.status !== 'resolved') throw new Error(`Cap accounting requires an exact roster identity for ${name}.`);
    return rosterContractRow(resolution.matches[0], seasonStartYear);
  });
  const entries = ledger.entries.filter(entry => entry.seasonStartYear === seasonStartYear && entry.active !== false);
  const coverage = ledger.coverageBySeason[String(seasonStartYear)] ?? {};
  const coverageMissing = CAP_COMPONENT_KINDS.filter(kind => !['complete', 'declared-none'].includes(valueOf(coverage[kind]?.status ?? coverage[kind])));
  const coverageConflicts = CAP_COMPONENT_KINDS.filter(kind => valueOf(coverage[kind]?.status ?? coverage[kind]) === 'declared-none' && entries.some(entry => entry.kind === kind));
  const charge = rosterChargeRow(rows, entries, ledger.rosterChargePolicyBySeason[String(seasonStartYear)], seasonStartYear);
  const unresolvedLiabilities = (team.payrollState?.unresolvedLiabilities ?? []).filter(row => row.seasonStartYear === undefined || Number(row.seasonStartYear) === seasonStartYear);
  const missingInputsByBase = {};
  const totals = {};
  const knownSubtotals = {};
  const valueStatuses = {};
  for (const base of bases) {
    const missing = [...coverageMissing.map(kind => `Incomplete ${kind} ledger coverage.`), ...coverageConflicts.map(kind => `${kind} is declared empty but contains active entries.`)];
    if (base === 'teamSalaryUsd') for (const exception of team.tpeLedger ?? []) {
      if (!['active', 'renounced', 'expired', 'exhausted', 'lost-entitlement'].includes(exception.status)) missing.push(`Stored TPE ${exception.exceptionId} active/closed status is unresolved.`);
      if (exception.status !== 'active') continue;
      const original = numeric(exception.originalTradeSalaryUsd), used = numeric(exception.usedTradeSalaryUsd);
      const linked = entries.some(entry => entry.kind === 'exception-hold' && entry.tpeExceptionId === exception.exceptionId);
      if (!linked && (original === null || used === null || original > used)) missing.push(`Stored TPE ${exception.exceptionId} has no explicit deemed-inclusion cap-hold treatment.`);
    }
    if (base === 'teamSalaryUsd') for (const exception of team.signingExceptionLedger ?? []) {
      if (!['active', 'renounced', 'expired', 'exhausted', 'lost-entitlement'].includes(exception.status)) missing.push(`Signing exception ${exception.exceptionId} active/closed status is unresolved.`);
      if (exception.status !== 'active') continue;
      const remaining = numeric(exception.remainingAmountAtWindowUsd);
      const linked = entries.some(entry => entry.kind === 'exception-hold' && entry.signingExceptionId === exception.exceptionId);
      if (remaining === null) missing.push(`Signing exception ${exception.exceptionId} balance is unresolved.`);
      if (!linked && (remaining === null || remaining > 0)) missing.push(`Signing exception ${exception.exceptionId} has no explicit deemed-inclusion cap-hold treatment.`);
    }
    let subtotal = 0;
    let provisional = ledger.source?.sourceClass === 'generated-scenario';
    for (const row of rows) {
      const value = row.values[base];
      if (value === null) missing.push(`${row.canonicalName} lacks ${CAP_BASE_FIELDS[base]}.`);
      else subtotal += cents(value);
      if (!['observed', 'verified', 'resolved', 'reconciled'].includes(row.statuses[base])) provisional = true;
    }
    for (const entry of entries) {
      const status = statusOf(entry.values?.[base], entry);
      const invalidStatus = ['conflict', 'unresolved', 'unreported', 'missing'].includes(status) || String(status).startsWith('unknown');
      const value = invalidStatus ? null : numeric(entry.values?.[base], { signed: ['salary-adjustment', 'mts-adjustment'].includes(entry.kind) });
      if (value === null) missing.push(`${entry.entryId} lacks an explicit ${base} contribution.`);
      else subtotal += cents(value);
      if (!['observed', 'verified', 'resolved', 'reconciled'].includes(statusOf(entry.values?.[base], entry))) provisional = true;
    }
    if (charge.values[base] === null) missing.push(...charge.missingInputs);
    else subtotal += cents(charge.values[base]);
    if (!['observed', 'verified', 'resolved', 'reconciled'].includes(charge.status)) provisional = true;
    for (const liability of unresolvedLiabilities) missing.push(`${liability.canonicalName}: ${liability.reason}`);
    if (subtotal < 0) missing.push(`${base} would be negative after ledger adjustments.`);
    knownSubtotals[base] = subtotal / 100;
    totals[base] = missing.length ? null : subtotal / 100;
    missingInputsByBase[base] = unique(missing);
    valueStatuses[base] = missing.length ? 'unknown' : provisional ? 'scenario-calculated' : 'component-calculated';
  }
  const policy = ledger.accountingPolicyBySeason?.[String(seasonStartYear)] ?? {};
  const snapshots = ledger.snapshotsBySeason?.[String(seasonStartYear)] ?? {};
  const period = ledger.rosterChargePolicyBySeason?.[String(seasonStartYear)]?.period;
  const mts = { stage: period === 'regular-season' ? 'opening-day-required' : 'preseason-projection', floorChargeUsd: null,
    thresholdUsd: null, cureRequired: null, paymentShortfallUsd: null };
  const minimum = numeric(policy.minimumTeamSalaryUsd);
  if (period === 'regular-season') {
    const opening = numeric(snapshots.openingDay?.mtsCapHoldTeamSalaryUsd);
    const current = totals.mtsCapHoldTeamSalaryUsd;
    mts.stage = opening === null ? 'opening-day-missing' : 'opening-day-locked';
    if (minimum === null || opening === null || current === null) {
      missingInputsByBase.teamSalaryUsd.push('Regular-season MTS floor requires current MTS salary, opening-day MTS snapshot, and Minimum Team Salary.');
      totals.teamSalaryUsd = null;
      valueStatuses.teamSalaryUsd = 'unknown';
    } else {
      mts.floorChargeUsd = Math.max(0, cents(minimum) - Math.min(cents(opening), cents(current))) / 100;
      mts.thresholdUsd = Math.min(minimum, opening);
      mts.cureRequired = current < mts.thresholdUsd;
      knownSubtotals.teamSalaryUsd += mts.floorChargeUsd;
      if (totals.teamSalaryUsd !== null) totals.teamSalaryUsd = knownSubtotals.teamSalaryUsd;
    }
    // MTS Payment Salary is an opening-day snapshot plus three specified
    // adjustments, not the salary of the roster after a later trade.
    const paymentAdjustments = policy.mtsPaymentAdjustmentsUsd;
    const adjustments = ['careerEndingInjuryExcluded', 'internationalPaymentIncluded', 'expansionExcluded'].map(field => numeric(paymentAdjustments?.[field]));
    if (opening === null || adjustments.some(value => value === null)) {
      totals.mtsPaymentTeamSalaryUsd = null;
      valueStatuses.mtsPaymentTeamSalaryUsd = 'unknown';
      missingInputsByBase.mtsPaymentTeamSalaryUsd.push('MTS Payment Salary requires the opening-day snapshot and all three explicit payment adjustments.');
    } else {
      totals.mtsPaymentTeamSalaryUsd = (cents(opening) + cents(adjustments[0]) - cents(adjustments[1]) + cents(adjustments[2])) / 100;
      valueStatuses.mtsPaymentTeamSalaryUsd = 'snapshot-calculated';
      missingInputsByBase.mtsPaymentTeamSalaryUsd = [];
      if (totals.mtsPaymentTeamSalaryUsd < 0) {
        missingInputsByBase.mtsPaymentTeamSalaryUsd.push('MTS Payment Salary would be negative.');
        totals.mtsPaymentTeamSalaryUsd = null;
        valueStatuses.mtsPaymentTeamSalaryUsd = 'unknown';
      }
    }
  }
  if (minimum !== null && totals.mtsPaymentTeamSalaryUsd !== null) mts.paymentShortfallUsd = Math.max(0, minimum - totals.mtsPaymentTeamSalaryUsd);
  let taxStage = policy.taxStage ?? coverage.taxStage ?? 'projected-or-unspecified';
  if (snapshots.tax?.stage === 'final-snapshot') {
    const snapshotAmount = numeric(snapshots.tax.taxTeamSalaryUsd);
    const adjustments = numeric(policy.postTaxSnapshotAdjustmentUsd, { signed: true });
    taxStage = 'final-snapshot';
    if (snapshotAmount === null || adjustments === null || snapshotAmount + adjustments < 0) {
      totals.taxTeamSalaryUsd = null;
      valueStatuses.taxTeamSalaryUsd = 'unknown';
      missingInputsByBase.taxTeamSalaryUsd = ['Final tax snapshot or post-snapshot adjustment is unresolved.'];
    } else {
      totals.taxTeamSalaryUsd = (cents(snapshotAmount) + cents(adjustments)) / 100;
      valueStatuses.taxTeamSalaryUsd = 'snapshot-calculated';
      missingInputsByBase.taxTeamSalaryUsd = [];
    }
  }
  return { format: CAP_ACCOUNTING_FORMAT, schemaVersion: '1.0.0', status: bases.some(base => totals[base] === null) ? 'incomplete' : 'calculated',
    teamCode: team.teamCode, seasonStartYear, totals, knownSubtotals, valueStatuses, missingInputsByBase,
    missingInputs: unique(Object.values(missingInputsByBase).flat()), rows, entries: clone(entries), rosterCharge: charge,
    coverage: clone(coverage), assumptions: [...(ledger.assumptions ?? [])], ruleSource: clone(CAP_ACCOUNTING_RULE_SOURCE),
    taxStage, mts, snapshots: clone(snapshots), legalReady: false,
    note: 'Component arithmetic does not certify the complete contract, transaction rules, or official NBA accounting.' };
}

export function applyCapAccountingToLeague(state, { seasonStartYear = state.seasonStartYear, teamCodes = null } = {}) {
  const next = clone(state);
  const selected = teamCodes ? new Set(teamCodes.map(code => String(code).toUpperCase())) : null;
  const reports = {};
  for (const team of next.teams) {
    if (!team.capLedger || (selected && !selected.has(team.teamCode))) continue;
    const result = calculateTeamCapAccounting(next, team.teamCode, { seasonStartYear });
    reports[team.teamCode] = result;
    team.capAccounting = result;
    const payroll = team.payrollState ?? {};
    team.payrollState = { ...payroll, seasonStartYear, totalTeamSalaryUsd: result.totals.teamSalaryUsd,
      teamSalaryUsd: result.totals.teamSalaryUsd, apronTeamSalaryUsd: result.totals.apronTeamSalaryUsd,
      taxTeamSalaryUsd: result.totals.taxTeamSalaryUsd, mtsCapHoldTeamSalaryUsd: result.totals.mtsCapHoldTeamSalaryUsd,
      mtsPaymentTeamSalaryUsd: result.totals.mtsPaymentTeamSalaryUsd, minimumTeamSalaryUsd: result.totals.mtsPaymentTeamSalaryUsd,
      totalBasis: 'explicit-cap-component-ledger', status: result.status === 'calculated' ? 'component-calculated' : 'unknown',
      components: { ...(payroll.components ?? {}), totalTeamSalaryUsd: result.totals.teamSalaryUsd,
        apronTeamSalaryUsd: result.totals.apronTeamSalaryUsd, taxTeamSalaryUsd: result.totals.taxTeamSalaryUsd,
        incompleteRosterChargesUsd: result.rosterCharge.values.teamSalaryUsd,
        unitemizedPayrollAnchorUsd: null },
      provisionalReasons: unique([...(payroll.provisionalReasons ?? []), ...result.missingInputs, 'Payroll uses component accounting with sourced or generated input provenance.']) };
  }
  validateLeagueState(next);
  return { state: next, reports };
}

/** Itemized liabilities may replace only their own previously unknown marker. */
export function appendCapLedgerEntries(state, teamCode, entries, { resolveProposalId = null, canonicalName = null, incrementRevision = true } = {}) {
  const next = clone(state);
  const team = next.teams.find(row => row.teamCode === String(teamCode).toUpperCase());
  if (!team?.capLedger) throw new Error('Itemized cap entries require a configured team cap ledger.');
  team.capLedger.entries.push(...clone(entries));
  for (const entry of entries) {
    const coverage = team.capLedger.coverageBySeason[String(entry.seasonStartYear)];
    if (coverage && (coverage[entry.kind] === 'declared-none' || coverage[entry.kind]?.status === 'declared-none')) coverage[entry.kind] = 'complete';
  }
  validateTeamCapLedger(team.capLedger);
  if (resolveProposalId && canonicalName) {
    const coveredSeasons = new Set(entries.filter(entry => bases.every(base => {
      const status = statusOf(entry.values?.[base], entry);
      return !['conflict', 'unreported', 'unresolved', 'missing'].includes(status) && !String(status).startsWith('unknown') && numeric(entry.values?.[base], { signed: true }) !== null;
    })).map(entry => entry.seasonStartYear));
    team.payrollState ??= {};
    team.payrollState.unresolvedLiabilities = (team.payrollState.unresolvedLiabilities ?? []).filter(row =>
      row.proposalId !== resolveProposalId || normalizeCanonicalPlayerName(row.canonicalName) !== normalizeCanonicalPlayerName(canonicalName) || !coveredSeasons.has(row.seasonStartYear));
  }
  if (incrementRevision) next.revision += 1;
  return applyCapAccountingToLeague(next, { teamCodes: [team.teamCode] });
}

/** Capture a simulation's time-specific salary basis once. Later roster moves
 * cannot relabel a current salary as the opening-day or final tax snapshot. */
export function captureTeamCapSnapshot(state, teamCode, { stage, snapshotRef, source = null } = {}) {
  if (!['opening-day', 'tax'].includes(stage) || !snapshotRef) throw new Error('Cap snapshot requires a supported stage and an explicit timing reference.');
  const next = clone(state);
  const team = next.teams.find(row => row.teamCode === String(teamCode).toUpperCase());
  if (!team?.capLedger) throw new Error('Cap snapshot requires a configured ledger.');
  const year = String(next.seasonStartYear);
  team.capLedger.snapshotsBySeason ??= {};
  const snapshots = team.capLedger.snapshotsBySeason[year] ??= {};
  const key = stage === 'opening-day' ? 'openingDay' : 'tax';
  if (snapshots[key]) throw new Error('A salary snapshot already exists for this season and stage.');
  const result = calculateTeamCapAccounting(next, team.teamCode);
  const base = stage === 'opening-day' ? 'mtsCapHoldTeamSalaryUsd' : 'taxTeamSalaryUsd';
  if (result.totals[base] === null) throw new Error(`Cannot snapshot unresolved ${base}.`);
  if (stage === 'tax' && result.taxStage !== 'earned-bonuses-final') throw new Error('Tax snapshot requires explicit final earned-bonus accounting.');
  snapshots[key] = { stage: stage === 'tax' ? 'final-snapshot' : stage, [base]: result.totals[base], snapshotRef,
    source: clone(source), valueStatus: result.valueStatuses[base], components: clone({ rows: result.rows, entries: result.entries }),
    ruleRefs: [stage === 'tax' ? 'VII-2d1i' : 'VII-2c1ii'] };
  next.revision += 1;
  return applyCapAccountingToLeague(next, { teamCodes: [team.teamCode] });
}
