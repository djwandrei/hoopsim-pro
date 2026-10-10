/**
 * Season-keyed CBA cash-consideration state for trade simulations.
 *
 * This ledger records gross paid and gross received amounts independently.
 * The caller must provide reconciled opening balances and annual thresholds
 * for exact use, or explicitly marked scenario assumptions for sandbox use.
 * It does not certify non-cash trade legality.
 */

export const CASH_CONSIDERATION_LEDGER_FORMAT = 'djhc-cash-consideration-ledger-v1';
export const CASH_CONSIDERATION_LEDGER_VERSION = '1.0.0';

export const NBA_CBA_CASH_RULES_V1 = Object.freeze({
  ruleVersionId: 'nba-nbpa-cba-2023',
  effectiveFromSeasonStartYear: 2023,
  effectiveThroughSeasonStartYear: 2029,
  maximumFractionOfSalaryCap: 0.0515,
  cashRuleRef: 'CBA-VII-8(a)',
  apronRuleRef: 'CBA-VII-2(e)(4)-row-I',
  subsequentYearApronRuleRef: 'CBA-VII-2(e)(2)(ii)-row-I',
  subsequentYearProjectionRuleRef: 'CBA-VII-2(e)(3)',
  transitionRuleRef: 'CBA-VII-2(e)(5)',
  officialSource: 'https://imgix.cosmicjs.com/25da5eb0-15eb-11ee-b5b3-fbd321202bdf-Final-2023-NBA-Collective-Bargaining-Agreement-6-28-23.pdf',
});

export const CASH_TRADE_TIMING_FORMAT = 'djhc-cash-trade-timing-v1';
export const CASH_SUBSEQUENT_APRON_CHECK_FORMAT = 'djhc-cash-subsequent-apron-check-v2';
export const CASH_POSTSEASON_PROJECTION_BASIS_FORMAT = 'djhc-cba-vii-2e3-projection-basis-v1';
export const CASH_HIGHER_MAX_REVIEW_FORMAT = 'djhc-cba-vii-2e3-higher-max-review-v1';

const clone = value => structuredClone(value);
const unique = values => [...new Set(values.filter(Boolean))];
const VALID_CASH_CATEGORIES = new Set([
  'trade-consideration',
  'compensation-reimbursement',
  'signing-bonus-reimbursement',
]);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validSourceRef(source) {
  return Boolean(String(source?.sourceSystem ?? '').trim() &&
    String(source?.sourceVersion ?? '').trim() && validDate(source?.retrievedAt));
}

function sourceRefsComplete(sourceRefs) {
  return Array.isArray(sourceRefs) && sourceRefs.length > 0 && sourceRefs.every(validSourceRef);
}

function sourceRefsWithLocator(sourceRefs) {
  return sourceRefsComplete(sourceRefs) && sourceRefs.every(source => String(source?.locator ?? '').trim());
}

function playerFieldSourceRefsComplete(sourceRefs, canonicalName, fieldName) {
  const normalizedName = String(canonicalName ?? '').trim().toLocaleLowerCase('en-US');
  return Boolean(normalizedName && sourceRefsWithLocator(sourceRefs) && sourceRefs.every(source =>
    source?.entityType === 'player' &&
    String(source?.entityKey ?? '').trim().toLocaleLowerCase('en-US') === normalizedName &&
    source?.field === fieldName));
}

function higherMaxReviewCoverageComplete(review, { currentSeasonStartYear, subsequentSeasonStartYear, affectedPlayerCount, teamCodes }) {
  const actualTeams = [...new Set(teamCodes.map(code => String(code ?? '').trim().toUpperCase()).filter(Boolean))].sort();
  const reviewedTeams = Array.isArray(review?.reviewedTeamCodes)
    ? review.reviewedTeamCodes.map(code => String(code ?? '').trim().toUpperCase()).sort()
    : [];
  return review?.format === CASH_HIGHER_MAX_REVIEW_FORMAT && review?.status === 'complete' &&
    Number(review?.currentSeasonStartYear) === currentSeasonStartYear &&
    Number(review?.subsequentSeasonStartYear) === subsequentSeasonStartYear &&
    Number(review?.affectedPlayerCount) === affectedPlayerCount &&
    review?.scope === 'all-projected-team-roster-and-player-contract-rows' &&
    Number.isSafeInteger(review?.reviewedPlayerContractRowCount) && review.reviewedPlayerContractRowCount >= 0 &&
    reviewedTeams.length === actualTeams.length && reviewedTeams.every((code, index) => code === actualTeams[index]) &&
    sourceRefsWithLocator(review?.sourceRefs) && review.sourceRefs.every(source =>
      source?.entityType === 'league' && source?.entityKey === 'all-team-roster-contracts' &&
      source?.field === 'fullRosterCoverage');
}

function validAssumptions(refs) {
  return Array.isArray(refs) && refs.length > 0 && refs.every(ref => String(ref ?? '').trim());
}

function moneyCents(value) {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 100) return null;
  const cents = Math.round(amount * 100);
  return Math.abs(amount * 100 - cents) < 1e-6 ? cents : null;
}

function usd(cents) {
  return cents / 100;
}

function yearRecord(ledger, year) {
  return (ledger?.seasonRecords ?? []).find(row => Number(row?.salaryCapYearStart) === year) ?? null;
}

function timingReadiness(timing, seasonStartYear) {
  if (timing?.format !== CASH_TRADE_TIMING_FORMAT || Number(timing?.seasonStartYear) !== seasonStartYear ||
      !['regular-season', 'post-regular-season'].includes(timing?.phase)) {
    return { phase: 'unknown', verified: false, assumed: false,
      reason: 'Cash trade timing must explicitly identify a season-matched regular-season or post-regular-season phase.' };
  }
  if (timing.status === 'complete' && sourceRefsComplete(timing.sourceRefs)) {
    return { phase: timing.phase, verified: true, assumed: false, reason: null };
  }
  if (timing.status === 'provisional-assumption' && validAssumptions(timing.assumptionRefs)) {
    return { phase: timing.phase, verified: false, assumed: true,
      reason: 'Cash trade timing uses an explicit Provisional Sandbox phase assumption.' };
  }
  return { phase: timing.phase, verified: false, assumed: false,
    reason: 'Cash trade timing lacks versioned, dated evidence or an explicit sandbox assumption.' };
}

function subsequentSeasonApronCheck(ruleOutcome, teamCode, seasonStartYear, currentSeasonStartYear, currentThresholds, teamCodes) {
  const check = ruleOutcome?.resultingPayrollByTeam?.[teamCode]?.subsequentSeasonCashApronCheck;
  const cents = moneyCents(check?.postTradeApronTeamSalaryUsd);
  const secondApronCents = moneyCents(check?.secondApronUsd);
  const projection = check?.section2e3Projection;
  const thresholdBasis = projection?.thresholdBasis;
  const requiredThresholds = ['salaryCapUsd', 'firstApronUsd', 'secondApronUsd'];
  const projectedThresholdCents = Object.fromEntries(requiredThresholds.map(field => [field, moneyCents(thresholdBasis?.[field])]));
  const expectedThresholdCents = Object.fromEntries(requiredThresholds.map(field => [field, moneyCents(currentThresholds?.[field])]));
  const thresholdBasisComplete = requiredThresholds.every(field => projectedThresholdCents[field] !== null);
  const thresholdBasisMatchesKnownCurrent = requiredThresholds.every(field => expectedThresholdCents[field] === null ||
    projectedThresholdCents[field] === expectedThresholdCents[field]);
  const thresholdBasisMatchesCashThreshold = projectedThresholdCents.secondApronUsd !== null &&
    projectedThresholdCents.secondApronUsd === secondApronCents;
  const thresholdSeasonsMatch = Number(thresholdBasis?.salaryCapYearStart) === currentSeasonStartYear &&
    Number(thresholdBasis?.payrollProjectionSeasonStartYear) === seasonStartYear &&
    Number(projection?.currentSeasonStartYear) === currentSeasonStartYear &&
    Number(projection?.subsequentSeasonStartYear) === seasonStartYear;
  const higherMax = projection?.higherMaxCriteria;
  const higherMaxReviewComplete = higherMaxReviewCoverageComplete(higherMax?.reviewCoverage, {
    currentSeasonStartYear, subsequentSeasonStartYear: seasonStartYear,
    affectedPlayerCount: Number(higherMax?.affectedPlayerCount), teamCodes,
  });
  const higherMaxNoAffectedPlayer = higherMax?.status === 'no-affected-player' &&
    Number(higherMax?.affectedPlayerCount) === 0 && (!Array.isArray(higherMax?.players) || higherMax.players.length === 0) &&
    sourceRefsComplete(higherMax?.sourceRefs) && higherMaxReviewComplete;
  const higherMaxSalaryResolved = higherMax?.status === 'salary-resolved' && Array.isArray(higherMax.players) &&
    higherMax.players.length > 0 && Number(higherMax.affectedPlayerCount) === higherMax.players.length &&
    sourceRefsComplete(higherMax?.sourceRefs) && higherMaxReviewComplete && higherMax.players.every(player =>
      String(player?.canonicalName ?? '').trim() && moneyCents(player?.highestEligibleSalaryUsd) !== null &&
      player?.salaryTreatment === 'highest-eligible-for-unannounced-honors' &&
      playerFieldSourceRefsComplete(player?.sourceRefs, player?.canonicalName, 'highestEligibleSalaryUsd'));
  const higherMaxResolved = higherMaxNoAffectedPlayer || higherMaxSalaryResolved;
  const higherMaxAssumed = higherMax?.status === 'provisional-assumption' && validAssumptions(higherMax.assumptionRefs);
  const section2e3AssumptionsComplete = projection?.format === CASH_POSTSEASON_PROJECTION_BASIS_FORMAT &&
    projection?.ruleVersionId === NBA_CBA_CASH_RULES_V1.ruleVersionId &&
    projection?.ruleRef === NBA_CBA_CASH_RULES_V1.subsequentYearProjectionRuleRef &&
    projection?.optionsTreatment === 'all-team-and-player-options-exercised' &&
    projection?.etoTreatment === 'no-outstanding-etos-exercised' &&
    projection?.remainingTransactionsTreatment === 'none-for-remainder-of-current-salary-cap-year' &&
    (higherMaxResolved || higherMaxAssumed);
  const currentThresholdsComplete = requiredThresholds.every(field => expectedThresholdCents[field] !== null);
  const currentThresholdsMatchLedger = expectedThresholdCents.salaryCapUsd !== null &&
    expectedThresholdCents.salaryCapUsd === moneyCents(currentThresholds?.ledgerSalaryCapUsd) &&
    expectedThresholdCents.secondApronUsd !== null &&
    expectedThresholdCents.secondApronUsd === moneyCents(currentThresholds?.ledgerSecondApronUsd);
  const base = { check, cents, secondApronCents, seasonStartYear,
    section2e3Projection: projection ? clone(projection) : null,
    thresholdSeasonStartYear: thresholdBasis?.salaryCapYearStart ?? null,
    versioned: check?.format === CASH_SUBSEQUENT_APRON_CHECK_FORMAT && check?.schemaVersion === '2.0.0' &&
      Number(check?.seasonStartYear) === seasonStartYear && check?.ruleVersionId === NBA_CBA_CASH_RULES_V1.ruleVersionId &&
      check?.ruleRef === NBA_CBA_CASH_RULES_V1.subsequentYearApronRuleRef && cents !== null && secondApronCents !== null &&
      thresholdSeasonsMatch && thresholdBasisComplete && thresholdBasisMatchesCashThreshold && thresholdBasisMatchesKnownCurrent &&
      currentThresholdsMatchLedger && section2e3AssumptionsComplete };
  const verified = ruleOutcome?.status === 'pass' && base.versioned && check?.status === 'reconciled' &&
    projection?.status === 'reconciled' && higherMaxResolved && currentThresholdsComplete &&
    sourceRefsComplete(check.ruleSourceRefs) && sourceRefsComplete(check.payrollSourceRefs) &&
    sourceRefsComplete(check.thresholdSourceRefs);
  const assumed = base.versioned && check?.status === 'provisional-assumption' &&
    projection?.status === 'provisional-assumption' && validAssumptions(check.assumptionRefs) &&
    validAssumptions(projection.assumptionRefs);
  return { ...base, verified, assumed };
}

function openingRow(record, teamCode) {
  return (record?.openingByTeam ?? []).find(row => String(row?.teamCode ?? '').trim().toUpperCase() === teamCode) ?? null;
}

function balancedCashEvents(record, year, teamCodes, { validateSnapshots = true } = {}) {
  const errors = [];
  const events = Array.isArray(record?.events) ? record.events : [];
  const eventIds = new Set();
  const proposalLegs = new Set();
  const totals = new Map(teamCodes.map(teamCode => [teamCode, { paidCents: 0, receivedCents: 0 }]));
  for (const event of events) {
    const eventId = String(event?.eventId ?? '').trim();
    const eventYear = Number(event?.salaryCapYearStart);
    const payer = String(event?.payerTeamCode ?? '').trim().toUpperCase();
    const receiver = String(event?.receiverTeamCode ?? '').trim().toUpperCase();
    const amountCents = moneyCents(event?.amountUsd);
    if (!eventId || eventIds.has(eventId)) errors.push('Existing cash events require unique nonempty event IDs.');
    eventIds.add(eventId);
    const proposalId = String(event?.proposalId ?? '').trim();
    const legIndex = Number(event?.proposalLegIndex);
    const proposalLegKey = `${proposalId}|${legIndex}`;
    if (!proposalId || !Number.isInteger(legIndex) || legIndex < 0 || proposalLegs.has(proposalLegKey)) errors.push('Existing cash events require a unique proposal ID and leg index.');
    proposalLegs.add(proposalLegKey);
    if (eventYear !== year) errors.push(`Existing cash event ${eventId || '(missing ID)'} has a different Salary Cap Year.`);
    if (!teamCodes.includes(payer) || !teamCodes.includes(receiver) || payer === receiver) errors.push(`Existing cash event ${eventId || '(missing ID)'} has invalid team endpoints.`);
    if (amountCents === null) errors.push(`Existing cash event ${eventId || '(missing ID)'} has an invalid amount.`);
    if (!VALID_CASH_CATEGORIES.has(event?.category)) errors.push(`Existing cash event ${eventId || '(missing ID)'} has an unsupported category.`);
    if (!['confirmed-legal', 'provisional-scenario'].includes(event?.status)) errors.push(`Existing cash event ${eventId || '(missing ID)'} has an unresolved status.`);
    if (event?.status === 'provisional-scenario' && !validAssumptions(event?.assumptionRefs)) errors.push(`Provisional cash event ${eventId || '(missing ID)'} lacks assumption references.`);
    if (!Array.isArray(event?.origin?.sourceRefs) || !String(event?.origin?.proposalId ?? '').trim()) errors.push(`Existing cash event ${eventId || '(missing ID)'} lacks proposal provenance.`);
    if (amountCents === null || !totals.has(payer) || !totals.has(receiver)) continue;
    totals.get(payer).paidCents += amountCents;
    totals.get(receiver).receivedCents += amountCents;
  }
  for (const row of validateSnapshots ? record?.currentBalancesByTeam ?? [] : []) {
    const teamCode = String(row?.teamCode ?? '').trim().toUpperCase();
    if (!teamCode || !teamCodes.includes(teamCode)) errors.push('Cached cash balances reference an unknown team.');
    const derived = totals.get(teamCode);
    const paidCents = moneyCents(row?.grossCashPaidUsd);
    const receivedCents = moneyCents(row?.grossCashReceivedUsd);
    const opening = openingRow(record, teamCode);
    const openingPaid = moneyCents(opening?.grossCashPaidUsd);
    const openingReceived = moneyCents(opening?.grossCashReceivedUsd);
    if (paidCents === null || receivedCents === null || openingPaid === null || openingReceived === null ||
        paidCents !== openingPaid + (derived?.paidCents ?? 0) || receivedCents !== openingReceived + (derived?.receivedCents ?? 0)) {
      errors.push(`Cached cash balances for ${teamCode || '(unknown team)'} do not reconcile to opening balances and append-only events.`);
    }
  }
  return { totals, errors };
}

/** Create a versioned container without manufacturing missing opening rows. */
export function createCashConsiderationLedger(input = {}) {
  const seasonRecords = clone(input.seasonRecords ?? []);
  if (!Array.isArray(seasonRecords)) throw new Error('Cash-consideration ledger seasonRecords must be an array.');
  const years = seasonRecords.map(row => Number(row?.salaryCapYearStart));
  if (years.some(year => !Number.isInteger(year)) || new Set(years).size !== years.length) {
    throw new Error('Cash-consideration ledger requires unique integer Salary Cap Year keys.');
  }
  return {
    format: CASH_CONSIDERATION_LEDGER_FORMAT,
    schemaVersion: CASH_CONSIDERATION_LEDGER_VERSION,
    seasonRecords: seasonRecords.sort((a, b) => a.salaryCapYearStart - b.salaryCapYearStart),
  };
}

/**
 * Evaluate only CBA cash consideration and the cash-payer second-apron trigger.
 * Unknown values remain unknown; scenario values are usable only when the
 * season record and each assumed input are explicitly marked.
 */
export function evaluateCashConsiderationLedger(state, proposal, ruleOutcome = null) {
  const cashLegRows = proposal.legs.map((leg, index) => ({ leg, index }))
    .filter(({ leg }) => (leg.assetType ?? 'player') === 'cash');
  if (!cashLegRows.length) return {
    format: 'djhc-cash-consideration-evaluation-v1', status: 'not-applicable',
    seasonStartYear: proposal.seasonStartYear, ruleRefs: [], missingInputs: [], violations: [],
    executionBlockedReasons: [], sandboxReady: true, proposedEvents: [], balancesByTeam: {}, hardCapTriggers: [],
  };

  const missingInputs = [], violations = [], executionBlockedReasons = [];
  const seasonStartYear = proposal.seasonStartYear;
  const timing = timingReadiness(proposal.cashTradeTiming, seasonStartYear);
  if (!timing.verified && !timing.assumed) missingInputs.push(timing.reason);
  else if (timing.reason) missingInputs.push(timing.reason);
  const ruleRefs = [NBA_CBA_CASH_RULES_V1.cashRuleRef];
  const ledger = state.cashConsiderationLedger;
  const record = yearRecord(ledger, seasonStartYear);
  const teams = new Set(state.teams.map(team => String(team.teamCode).toUpperCase()));
  const proposedEvents = [];
  for (const { leg, index } of cashLegRows) {
    const payerTeamCode = String(leg.fromTeamCode ?? '').trim().toUpperCase();
    const receiverTeamCode = String(leg.toTeamCode ?? '').trim().toUpperCase();
    const amountCents = moneyCents(leg.amountUsd);
    const category = leg.cashCategory ?? 'trade-consideration';
    if (!payerTeamCode || !receiverTeamCode || payerTeamCode === receiverTeamCode || !teams.has(payerTeamCode) || !teams.has(receiverTeamCode)) {
      violations.push(`Cash leg ${index} must identify distinct existing payer and receiver teams.`);
    }
    if (amountCents === null) violations.push(`Cash leg ${index} requires a nonnegative USD amount with at most cent precision.`);
    if (!VALID_CASH_CATEGORIES.has(category)) violations.push(`Cash leg ${index} category must be trade-consideration, compensation-reimbursement, or signing-bonus-reimbursement.`);
    if (amountCents !== null && payerTeamCode && receiverTeamCode && payerTeamCode !== receiverTeamCode && VALID_CASH_CATEGORIES.has(category)) {
      proposedEvents.push({
        eventId: `${proposal.proposalId}:cash:${index}`,
        proposalId: proposal.proposalId,
        proposalLegIndex: index,
        salaryCapYearStart: seasonStartYear,
        payerTeamCode,
        receiverTeamCode,
        amountUsd: usd(amountCents),
        category,
        inputSourceRefs: clone(leg.sourceRefs ?? proposal.sourceRefs ?? []),
      });
    }
  }

  const ruleRefsSet = new Set(state.rulesReference?.ruleRefs ?? []);
  const ruleVersionId = state.rulesReference?.ruleVersionId ?? null;
  const selectedCbaRuleKnown = ruleVersionId === NBA_CBA_CASH_RULES_V1.ruleVersionId &&
    Number.isInteger(seasonStartYear) && seasonStartYear >= NBA_CBA_CASH_RULES_V1.effectiveFromSeasonStartYear &&
    seasonStartYear <= NBA_CBA_CASH_RULES_V1.effectiveThroughSeasonStartYear;
  if (!selectedCbaRuleKnown) missingInputs.push(`Cash rule state is not pinned to the supported 2023 CBA for ${seasonStartYear}-${seasonStartYear + 1}.`);
  const rulesRefComplete = state.rulesReference?.status === 'complete' &&
    Number(state.rulesReference?.seasonStartYear) === seasonStartYear && sourceRefsComplete(state.rulesReference?.sourceRefs) &&
    ruleRefsSet.has(NBA_CBA_CASH_RULES_V1.cashRuleRef) && ruleRefsSet.has(NBA_CBA_CASH_RULES_V1.apronRuleRef);
  if (!rulesRefComplete) missingInputs.push('Selected cash and second-apron rule state is incomplete or lacks versioned, dated source references.');
  if (!record) missingInputs.push(`No cash-consideration opening ledger exists for Salary Cap Year ${seasonStartYear}-${seasonStartYear + 1}; zero balances are not assumed.`);
  if (ledger?.format !== CASH_CONSIDERATION_LEDGER_FORMAT || ledger?.schemaVersion !== CASH_CONSIDERATION_LEDGER_VERSION) {
    missingInputs.push('Cash-consideration ledger format or revision is missing or unsupported.');
  }
  if (record && Number(record.salaryCapYearStart) !== seasonStartYear) missingInputs.push('Cash-consideration ledger Salary Cap Year does not match the trade.');

  const capBasis = record?.capBasis ?? null;
  const salaryCapCents = moneyCents(capBasis?.salaryCapUsd);
  const capBasisVerified = capBasis?.status === 'complete' && salaryCapCents !== null && sourceRefsComplete(capBasis.sourceRefs);
  const capBasisAssumed = capBasis?.status === 'provisional-assumption' && salaryCapCents !== null && validAssumptions(capBasis.assumptionRefs);
  if (!capBasisVerified && !capBasisAssumed) missingInputs.push('Salary Cap Year salary-cap value is missing, invalid, or lacks verified provenance/explicit sandbox assumption.');
  const cashLimitCents = salaryCapCents === null ? null : Math.floor(salaryCapCents * NBA_CBA_CASH_RULES_V1.maximumFractionOfSalaryCap + 1e-8);
  if (capBasisAssumed) missingInputs.push('Cash limit uses an explicit provisional salary-cap assumption.');

  const apronBasis = record?.apronBasis ?? null;
  const secondApronCents = moneyCents(apronBasis?.secondApronUsd);
  const apronBasisVerified = apronBasis?.status === 'complete' && secondApronCents !== null && sourceRefsComplete(apronBasis.sourceRefs);
  const apronBasisAssumed = apronBasis?.status === 'provisional-assumption' && secondApronCents !== null && validAssumptions(apronBasis.assumptionRefs);
  if (!apronBasisVerified && !apronBasisAssumed) missingInputs.push('Second Apron threshold is missing, invalid, or lacks verified provenance/explicit sandbox assumption.');
  if (apronBasisAssumed) missingInputs.push('Cash-payer hard-cap check uses an explicit provisional Second Apron assumption.');

  const ruleState = record?.ruleState ?? null;
  const recordRuleComplete = ruleState?.status === 'complete' && ruleState?.ruleVersionId === NBA_CBA_CASH_RULES_V1.ruleVersionId &&
    Array.isArray(ruleState.ruleRefs) && ruleState.ruleRefs.includes(NBA_CBA_CASH_RULES_V1.cashRuleRef) &&
    ruleState.ruleRefs.includes(NBA_CBA_CASH_RULES_V1.apronRuleRef) && sourceRefsComplete(ruleState.sourceRefs);
  const recordRuleAssumed = ruleState?.status === 'provisional-assumption' && ruleState?.ruleVersionId === NBA_CBA_CASH_RULES_V1.ruleVersionId &&
    Array.isArray(ruleState.ruleRefs) && ruleState.ruleRefs.includes(NBA_CBA_CASH_RULES_V1.cashRuleRef) &&
    ruleState.ruleRefs.includes(NBA_CBA_CASH_RULES_V1.apronRuleRef) && validAssumptions(ruleState.assumptionRefs);
  if (!recordRuleComplete && !recordRuleAssumed) missingInputs.push('Season cash-rule profile is missing, not selected, or lacks an explicit sandbox rule assumption.');
  if (recordRuleAssumed) missingInputs.push('Cash rule profile is explicitly assumed for this sandbox scenario.');

  const mode = state.mode;
  const provisionalRecord = record?.status === 'provisional-sandbox';
  const teamCodesTouched = unique(proposedEvents.flatMap(event => [event.payerTeamCode, event.receiverTeamCode]));
  const existingEventTotals = balancedCashEvents(record, seasonStartYear, state.teams.map(team => String(team.teamCode).toUpperCase()));
  missingInputs.push(...existingEventTotals.errors);
  const openingCents = new Map();
  const openingInputsUsable = Boolean(record);
  for (const teamCode of teamCodesTouched) {
    const row = openingRow(record, teamCode);
    const paidCents = moneyCents(row?.grossCashPaidUsd);
    const receivedCents = moneyCents(row?.grossCashReceivedUsd);
    const complete = row?.status === 'complete' && paidCents !== null && receivedCents !== null && sourceRefsComplete(row?.sourceRefs);
    const assumed = row?.status === 'provisional-assumption' && paidCents !== null && receivedCents !== null && validAssumptions(row?.assumptionRefs);
    if (complete) openingCents.set(teamCode, { paidCents, receivedCents });
    else if (assumed) {
      openingCents.set(teamCode, { paidCents, receivedCents });
      missingInputs.push(`${teamCode} opening gross paid/received cash uses an explicit provisional assumption.`);
    } else {
      missingInputs.push(`${teamCode} requires explicit opening gross paid and gross received cash balances with sources or sandbox assumptions; zero is not assumed.`);
    }
  }
  if (record?.status !== 'complete' && !provisionalRecord) missingInputs.push('Cash opening ledger must be marked complete or explicitly provisional-sandbox.');
  if (provisionalRecord) missingInputs.push('Cash opening ledger is an explicitly provisional sandbox scenario.');
  if (record && !sourceRefsComplete(record.sourceRefs) && !provisionalRecord) missingInputs.push('Cash ledger record lacks versioned, dated source references.');
  if (!record?.sourceRefs || !record.sourceRefs.length) {
    if (provisionalRecord && !validAssumptions(record?.assumptionRefs)) missingInputs.push('Provisional cash ledger has no explicit scenario assumption references.');
  }

  const balancesByTeam = {};
  const allEventTotals = existingEventTotals.totals;
  for (const teamCode of teamCodesTouched) {
    const opening = openingCents.get(teamCode);
    const events = allEventTotals.get(teamCode) ?? { paidCents: 0, receivedCents: 0 };
    if (opening) balancesByTeam[teamCode] = { grossCashPaidUsd: usd(opening.paidCents + events.paidCents), grossCashReceivedUsd: usd(opening.receivedCents + events.receivedCents) };
  }
  for (const event of proposedEvents) {
    const amountCents = moneyCents(event.amountUsd);
    for (const [teamCode, key] of [[event.payerTeamCode, 'grossCashPaidUsd'], [event.receiverTeamCode, 'grossCashReceivedUsd']]) {
      if (!balancesByTeam[teamCode]) continue;
      balancesByTeam[teamCode][key] += usd(amountCents);
    }
  }
  if (cashLimitCents !== null) {
    for (const [teamCode, balance] of Object.entries(balancesByTeam)) {
      if (moneyCents(balance.grossCashPaidUsd) > cashLimitCents) violations.push(`${teamCode} gross cash paid exceeds the ${usd(cashLimitCents)} Salary Cap Year limit under Article VII §8(a).`);
      if (moneyCents(balance.grossCashReceivedUsd) > cashLimitCents) violations.push(`${teamCode} gross cash received exceeds the ${usd(cashLimitCents)} Salary Cap Year limit under Article VII §8(a).`);
    }
  }
  if (cashLimitCents !== null && [...openingCents.keys()].some(teamCode => {
    const opening = openingCents.get(teamCode);
    return opening.paidCents + (allEventTotals.get(teamCode)?.paidCents ?? 0) > cashLimitCents ||
      opening.receivedCents + (allEventTotals.get(teamCode)?.receivedCents ?? 0) > cashLimitCents;
  })) missingInputs.push('Existing gross cash history already exceeds the current limit; ledger reconciliation is required before another trade.');

  const payingTeams = unique(proposedEvents.filter(event => moneyCents(event.amountUsd) > 0).map(event => event.payerTeamCode));
  const apronChecks = {};
  const subsequentApronChecks = {};
  const hardCapTriggers = [];
  const subsequentYearThresholdBasis = {
    salaryCapUsd: state.rulesReference?.thresholds?.salaryCap ?? capBasis?.salaryCapUsd,
    firstApronUsd: state.rulesReference?.thresholds?.firstApron,
    secondApronUsd: state.rulesReference?.thresholds?.secondApron ?? apronBasis?.secondApronUsd,
    ledgerSalaryCapUsd: capBasis?.salaryCapUsd,
    ledgerSecondApronUsd: apronBasis?.secondApronUsd,
  };
  const apronTriggerApplies = seasonStartYear >= 2024;
  if (apronTriggerApplies && payingTeams.length) ruleRefs.push(NBA_CBA_CASH_RULES_V1.apronRuleRef);
  else if (!apronTriggerApplies && payingTeams.length) ruleRefs.push(NBA_CBA_CASH_RULES_V1.transitionRuleRef);
  const isPostRegularSeason = timing.phase === 'post-regular-season';
  if (isPostRegularSeason && payingTeams.length) ruleRefs.push(NBA_CBA_CASH_RULES_V1.subsequentYearApronRuleRef,
    NBA_CBA_CASH_RULES_V1.subsequentYearProjectionRuleRef);
  for (const teamCode of payingTeams) {
    let resultingApronCents = moneyCents(ruleOutcome?.resultingPayrollByTeam?.[teamCode]?.apronTeamSalaryUsd);
    let resultEvidenceComplete = ruleOutcome?.status === 'pass' && ruleOutcome?.resultingPayrollByTeam?.[teamCode]?.status === 'reconciled' &&
      sourceRefsComplete(ruleOutcome?.resultingPayrollByTeam?.[teamCode]?.sourceRefs);
    if (!resultEvidenceComplete || resultingApronCents === null) {
      const assumption = record?.apronChecksByTeam?.find(row => String(row?.teamCode ?? '').toUpperCase() === teamCode);
      const assumedApronCents = moneyCents(assumption?.postTradeApronTeamSalaryUsd);
      if (assumedApronCents !== null && assumption?.status === 'provisional-assumption' && validAssumptions(assumption.assumptionRefs)) {
        resultingApronCents = assumedApronCents;
        resultEvidenceComplete = false;
        missingInputs.push(`${teamCode} post-trade Apron Team Salary uses an explicit provisional assumption.`);
      } else if (resultingApronCents !== null && Array.isArray(ruleOutcome?.resultingPayrollByTeam?.[teamCode]?.sourceRefs) && ruleOutcome.resultingPayrollByTeam[teamCode].sourceRefs.length) {
        missingInputs.push(`${teamCode} post-trade Apron Team Salary is a non-reconciled rule-engine result.`);
      } else {
        missingInputs.push(`${teamCode} cash-payment Second Apron hard-cap check needs post-trade Apron Team Salary or an explicit sandbox assumption.`);
      }
    }
    if (apronTriggerApplies && resultingApronCents !== null && secondApronCents !== null && resultingApronCents > secondApronCents) {
      violations.push(`${teamCode} cannot pay cash because its post-trade Apron Team Salary exceeds the Second Apron under Article VII §2(e)(4) row I.`);
    }
    apronChecks[teamCode] = {
      postTradeApronTeamSalaryUsd: resultingApronCents === null ? null : usd(resultingApronCents),
      secondApronUsd: secondApronCents === null ? null : usd(secondApronCents),
      triggerApplies: apronTriggerApplies,
      status: resultingApronCents !== null && secondApronCents !== null ? resultEvidenceComplete ? 'verified' : 'provisional-assumption' : 'unknown',
    };
    if (apronTriggerApplies && resultingApronCents !== null && secondApronCents !== null && resultingApronCents <= secondApronCents) {
      hardCapTriggers.push({ teamCode, level: 'second-apron', thresholdUsd: usd(secondApronCents), seasonStartYear,
        reason: 'cash-consideration-payment', ruleRef: NBA_CBA_CASH_RULES_V1.apronRuleRef,
        status: resultEvidenceComplete ? 'verified' : 'provisional-assumption' });
    }
    if (isPostRegularSeason) {
      const nextYear = seasonStartYear + 1;
      const nextCheck = subsequentSeasonApronCheck(ruleOutcome, teamCode, nextYear, seasonStartYear, subsequentYearThresholdBasis, [...teams]);
      subsequentApronChecks[teamCode] = {
        seasonStartYear: nextYear,
        thresholdSeasonStartYear: nextCheck.thresholdSeasonStartYear,
        postTradeApronTeamSalaryUsd: nextCheck.cents === null ? null : usd(nextCheck.cents),
        secondApronUsd: nextCheck.secondApronCents === null ? null : usd(nextCheck.secondApronCents),
        section2e3Projection: nextCheck.section2e3Projection,
        status: nextCheck.verified ? 'verified' : nextCheck.assumed ? 'provisional-assumption' : 'unknown',
        ruleRef: NBA_CBA_CASH_RULES_V1.subsequentYearApronRuleRef,
      };
      if (!nextCheck.verified && !nextCheck.assumed) {
        missingInputs.push(`${teamCode} post-regular-season cash payment requires a versioned, sourced subsequent-year Apron Team Salary and Second Apron check for ${nextYear}-${nextYear + 1}.`);
      } else if (nextCheck.assumed) {
        missingInputs.push(`${teamCode} subsequent-year cash-payer apron check uses an explicit Provisional Sandbox assumption.`);
      }
      if (nextCheck.versioned && nextCheck.cents !== null && nextCheck.secondApronCents !== null && nextCheck.cents > nextCheck.secondApronCents) {
        violations.push(`${teamCode} post-regular-season cash payment would exceed the subsequent-year Second Apron under Article VII §2(e)(2)(ii) row I.`);
      } else if (nextCheck.versioned && nextCheck.cents !== null && nextCheck.secondApronCents !== null && nextCheck.cents <= nextCheck.secondApronCents) {
        hardCapTriggers.push({ teamCode, level: 'second-apron', thresholdUsd: usd(nextCheck.secondApronCents), seasonStartYear: nextYear,
          reason: 'post-regular-season-cash-consideration-payment', ruleRef: NBA_CBA_CASH_RULES_V1.subsequentYearApronRuleRef,
          status: nextCheck.verified ? 'verified' : 'provisional-assumption' });
      }
    }
  }

  const valuesReady = cashLimitCents !== null && (capBasisVerified || capBasisAssumed) &&
    (apronBasisVerified || apronBasisAssumed) && (recordRuleComplete || recordRuleAssumed) && selectedCbaRuleKnown && openingInputsUsable &&
    teamCodesTouched.every(code => openingCents.has(code)) && proposedEvents.length === cashLegRows.length &&
    existingEventTotals.errors.length === 0 && (timing.verified || timing.assumed) &&
    payingTeams.every(teamCode => (!apronTriggerApplies ||
      (apronChecks[teamCode]?.postTradeApronTeamSalaryUsd !== null && apronChecks[teamCode]?.secondApronUsd !== null)) &&
      (!isPostRegularSeason || subsequentApronChecks[teamCode]?.status !== 'unknown'));
  const allInputsVerified = valuesReady && record?.status === 'complete' && recordRuleComplete && capBasisVerified && apronBasisVerified &&
    rulesRefComplete && sourceRefsComplete(record?.sourceRefs) && teamCodesTouched.every(teamCode => openingRow(record, teamCode)?.status === 'complete') &&
    (timing.verified) && payingTeams.every(teamCode => (!apronTriggerApplies || apronChecks[teamCode]?.status === 'verified') &&
      (!isPostRegularSeason || subsequentApronChecks[teamCode]?.status === 'verified'));
  const explicitScenarioInputs = (record?.status === 'provisional-sandbox' && validAssumptions(record.assumptionRefs)) ||
    capBasisAssumed || apronBasisAssumed || recordRuleAssumed ||
    timing.assumed ||
    teamCodesTouched.some(teamCode => openingRow(record, teamCode)?.status === 'provisional-assumption') ||
    payingTeams.some(teamCode => record?.apronChecksByTeam?.some(row => String(row?.teamCode ?? '').toUpperCase() === teamCode &&
      row.status === 'provisional-assumption' && validAssumptions(row.assumptionRefs))) ||
    payingTeams.some(teamCode => subsequentApronChecks[teamCode]?.status === 'provisional-assumption');
  const sandboxReady = valuesReady && explicitScenarioInputs && violations.length === 0;
  if (!allInputsVerified && !missingInputs.length) missingInputs.push('Cash-consideration ledger includes unverified or provisional inputs.');
  if (mode === 'provisional-sandbox' && !sandboxReady && violations.length === 0) {
    executionBlockedReasons.push('Cash trade cannot execute in Provisional Sandbox until the user/scenario supplies explicit marked opening cash, cap/rule, and payer apron assumptions with numeric values.');
  }

  return {
    format: 'djhc-cash-consideration-evaluation-v1',
    status: violations.length ? 'fail' : allInputsVerified ? 'pass' : 'unknown',
    seasonStartYear,
    ruleVersionId: ruleVersionId,
    ruleRefs: unique(ruleRefs),
    salaryCapUsd: salaryCapCents === null ? null : usd(salaryCapCents),
    cashLimitUsd: cashLimitCents === null ? null : usd(cashLimitCents),
    balancesByTeam,
    apronChecks,
    subsequentApronChecks,
    cashTradeTiming: { format: proposal.cashTradeTiming?.format ?? null, phase: timing.phase,
      status: timing.verified ? 'verified' : timing.assumed ? 'provisional-assumption' : 'unknown',
      sourceRefs: clone(proposal.cashTradeTiming?.sourceRefs ?? []), assumptionRefs: clone(proposal.cashTradeTiming?.assumptionRefs ?? []) },
    payingTeams,
    hardCapTriggers,
    proposedEvents,
    missingInputs: unique(missingInputs),
    violations: unique(violations),
    executionBlockedReasons: unique(executionBlockedReasons),
    sandboxReady,
  };
}

/** Append committed cash events and materialize separate per-team balances. */
export function applyCashConsiderationEvents(state, proposal, evaluation, transactionStatus) {
  if (!evaluation?.proposedEvents?.length) return;
  const ledger = state.cashConsiderationLedger;
  const record = yearRecord(ledger, proposal.seasonStartYear);
  if (!record) throw new Error('Cannot commit cash events without their season-keyed opening ledger.');
  record.events ??= [];
  for (const event of evaluation.proposedEvents) {
    if (record.events.some(row => row.eventId === event.eventId)) throw new Error(`Cash event ${event.eventId} already exists.`);
    const scenarioRef = `Explicit provisional cash event supplied by transaction proposal ${proposal.proposalId}.`;
    record.events.push({
      ...clone(event),
      status: transactionStatus === 'confirmed-legal' ? 'confirmed-legal' : 'provisional-scenario',
      assumptionRefs: transactionStatus === 'confirmed-legal' ? [] : [scenarioRef],
      unresolvedInputs: transactionStatus === 'confirmed-legal' ? [] : unique(evaluation.missingInputs),
      origin: { kind: 'transaction-proposal', proposalId: proposal.proposalId, proposalSchemaVersion: proposal.schemaVersion,
        sourceRefs: clone(event.inputSourceRefs ?? []), cashTradeTiming: clone(evaluation.cashTradeTiming ?? null),
        ruleRefs: clone(evaluation.ruleRefs ?? []), currentApronChecks: clone(evaluation.apronChecks ?? {}),
        subsequentApronChecks: clone(evaluation.subsequentApronChecks ?? {}) },
    });
    if (transactionStatus !== 'confirmed-legal') record.assumptionRefs = unique([...(record.assumptionRefs ?? []), scenarioRef]);
  }
  const teams = state.teams.map(team => String(team.teamCode).toUpperCase());
  const totals = balancedCashEvents(record, proposal.seasonStartYear, teams, { validateSnapshots: false });
  if (totals.errors.length) throw new Error(`Committed cash ledger failed reconciliation: ${totals.errors.join(' ')}`);
  for (const teamCode of unique(evaluation.proposedEvents.flatMap(event => [event.payerTeamCode, event.receiverTeamCode]))) {
    const opening = openingRow(record, teamCode);
    const openingPaid = moneyCents(opening?.grossCashPaidUsd);
    const openingReceived = moneyCents(opening?.grossCashReceivedUsd);
    if (openingPaid === null || openingReceived === null) throw new Error(`Cash ledger opening balances are absent for ${teamCode}.`);
    const movement = totals.totals.get(teamCode) ?? { paidCents: 0, receivedCents: 0 };
    const balanceRow = { teamCode, grossCashPaidUsd: usd(openingPaid + movement.paidCents),
      grossCashReceivedUsd: usd(openingReceived + movement.receivedCents),
      status: transactionStatus === 'confirmed-legal' ? 'complete' : 'provisional-sandbox',
      sourceRefs: clone(opening.sourceRefs ?? []),
      assumptionRefs: transactionStatus === 'confirmed-legal' ? [] : unique([...(opening.assumptionRefs ?? []), ...evaluation.missingInputs]),
      asOfProposalId: proposal.proposalId };
    record.currentBalancesByTeam ??= [];
    const index = record.currentBalancesByTeam.findIndex(row => String(row.teamCode).toUpperCase() === teamCode);
    if (index >= 0) record.currentBalancesByTeam[index] = balanceRow;
    else record.currentBalancesByTeam.push(balanceRow);
  }
  if (transactionStatus !== 'confirmed-legal') record.status = 'provisional-sandbox';
}
