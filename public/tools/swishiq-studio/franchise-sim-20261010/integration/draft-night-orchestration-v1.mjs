import { runCpuDraftPick } from '../lib/draft-simulation-v1.mjs';
import { simulateNbaDraftOrderWithLotteryPolicyV1 } from '../lib/draft-lottery-policy-adapter-v1.mjs';
import { sha256HexV1, stableStringifyV1 } from '../lib/sha256-isomorphic-v1.mjs';
import { validateLeagueState } from '../lib/simulation-contracts-v1.mjs';
import { createScenarioPickLedgerReceiptV1, validateScenarioPickLedgerReceiptV1 } from '../lib/scenario-pick-ledger-v1.mjs';

export const DRAFT_NIGHT_ORCHESTRATION_VERSION_V1 = 'djhc-draft-night-orchestration-v1';

function normalizeTeamCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z0-9][A-Z0-9._:-]{0,79}$/.test(code) ? code : '';
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function failed(status, reason, details = {}) {
  return {
    format: DRAFT_NIGHT_ORCHESTRATION_VERSION_V1,
    status,
    draftOrder: [],
    orderedPicks: [],
    nextPick: null,
    missingInputs: [reason],
    ...details,
  };
}

function validateLotteryOrderResult(result, { state, standings, lotteryPolicyInputs, requireStandingsHash = true }) {
  if (result?.status !== 'resolved-by-supplied-season-rules') {
    return result?.missingInputs?.[0] ?? 'A complete season-specific lottery simulation is required.';
  }
  const receipt = result.lotteryPolicyReceipt;
  const expectedDraftYear = state.seasonStartYear + 1;
  if (!receipt || receipt.format !== 'djhc-nba-draft-lottery-policy-receipt-v1' ||
      receipt.status !== 'simulated-policy-draw' || receipt.nbaHistoricalResult !== false) {
    return 'A matching simulated-lottery policy receipt is required; observed historical results are not interchangeable.';
  }
  if (receipt.draftYear !== expectedDraftYear || receipt.standingsSeasonStartYear !== state.seasonStartYear ||
      lotteryPolicyInputs.draftYear !== expectedDraftYear) {
    return 'Lottery policy, standings, and LeagueState seasons do not match.';
  }
  if (lotteryPolicyInputs.standingsSeasonStartYear !== undefined &&
      lotteryPolicyInputs.standingsSeasonStartYear !== state.seasonStartYear) {
    return 'Caller standings season does not match the LeagueState season.';
  }
  if (requireStandingsHash && receipt.standingsSha256 !== sha256HexV1(stableStringifyV1(standings))) {
    return 'Lottery receipt does not bind the supplied standings rows.';
  }
  if (!nonEmpty(receipt.standingsReceipt?.id) ||
      receipt.standingsReceipt.id !== lotteryPolicyInputs.standingsReceipt?.id ||
      receipt.standingsReceipt.seasonStartYear !== state.seasonStartYear) {
    return 'Lottery receipt does not match the supplied standings source receipt.';
  }
  if (!Number.isSafeInteger(lotteryPolicyInputs.seed) ||
      receipt.seed?.draftSimulationSeed !== lotteryPolicyInputs.seed) {
    return 'Lottery receipt seed does not match the requested draft-order seed.';
  }
  if (!String(result.ruleVersion ?? '').startsWith('djhc-nba-draft-lottery-adapter-v1:') ||
      !Array.isArray(result.sourceRefs) || !result.sourceRefs.length ||
      !Array.isArray(receipt.ruleSourceRefs) || !receipt.ruleSourceRefs.length ||
      !receipt.sourceEngineVersion) {
    return 'Lottery result is missing its source-pinned rule version or rule references.';
  }
  if (!Array.isArray(result.order) || result.order.length !== 30 || new Set(result.order).size !== 30 ||
      result.order.some(code => !normalizeTeamCode(code)) ||
      stableStringifyV1(result.order) !== stableStringifyV1(receipt.completeDraftOrder)) {
    return 'Lottery result and its receipt must contain the same exact 30-team order.';
  }
  return null;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function pickRightsReceiptComplete(receipt, seasonStartYear) {
  return Boolean(receipt && typeof receipt === 'object' && !Array.isArray(receipt) &&
    nonEmpty(receipt.id) && receipt.seasonStartYear === seasonStartYear && receipt.status === 'complete' &&
    Array.isArray(receipt.sourceRefs) && receipt.sourceRefs.length > 0 && receipt.sourceRefs.every(ref =>
      nonEmpty(ref) || (ref && typeof ref === 'object' && !Array.isArray(ref) &&
        (nonEmpty(ref.sourceUrl) || nonEmpty(ref.sourceSystem) || nonEmpty(ref.id)))));
}

function pickLedgerError(pickRightsLedger, orderedTeamCodes) {
  if (pickRightsLedger === undefined || pickRightsLedger === null) return null;
  if (!Array.isArray(pickRightsLedger)) return 'Pick-rights ledger must be an array when supplied.';
  if (pickRightsLedger.length > 30) return 'Pick-rights ledger contains more than one first-round slot per original team.';
  const seenOriginals = new Set();
  const seenPickIds = new Set();
  const orderTeams = new Set(orderedTeamCodes);
  for (const [index, row] of pickRightsLedger.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return `Pick-rights ledger row ${index + 1} is malformed.`;
    const originalTeamCode = normalizeTeamCode(row.originalTeamCode);
    const pickId = String(row.pickId ?? '').trim();
    if (!originalTeamCode || !orderTeams.has(originalTeamCode)) return `Pick-rights ledger row ${index + 1} needs an originalTeamCode in the validated order.`;
    if (!pickId) return `Pick-rights ledger row ${index + 1} needs a pickId.`;
    if (seenOriginals.has(originalTeamCode)) return `Duplicate original-team pick slot for ${originalTeamCode}.`;
    if (seenPickIds.has(pickId)) return `Duplicate pickId ${pickId} in the pick-rights ledger.`;
    seenOriginals.add(originalTeamCode);
    seenPickIds.add(pickId);
  }
  return null;
}

function samePickState(ledgerRow, stateRow) {
  return String(stateRow.pickId ?? '').trim() === String(ledgerRow.pickId ?? '').trim() &&
    Number(stateRow.seasonStartYear) === Number(ledgerRow.seasonStartYear) &&
    normalizeTeamCode(stateRow.originalTeamCode) === normalizeTeamCode(ledgerRow.originalTeamCode) &&
    normalizeTeamCode(stateRow.ownerTeamCode) === normalizeTeamCode(ledgerRow.ownerTeamCode) &&
    stateRow.ownershipStatus === ledgerRow.ownershipStatus &&
    stateRow.encumbranceStatus === ledgerRow.encumbranceStatus &&
    stateRow.usedStatus === ledgerRow.usedStatus;
}

function joinRightsLedger({ orderedTeamCodes, pickRightsLedger, pickRightsLedgerReceipt, state, scenarioPickLedgerReceipt = null }) {
  const ledgerByOriginal = new Map((Array.isArray(pickRightsLedger) ? pickRightsLedger : [])
    .map(row => [normalizeTeamCode(row.originalTeamCode), row]));
  const scenarioByPickId = new Map((scenarioPickLedgerReceipt?.scenarioRows ?? []).map(row => [row.pickId, row]));
  const stateTeams = new Set((state.teams ?? []).map(row => normalizeTeamCode(row.teamCode)));
  const orderedPicks = orderedTeamCodes.map((originalTeamCode, index) => {
    const pickNumber = index + 1;
    const ledgerRow = ledgerByOriginal.get(originalTeamCode);
    if (!ledgerRow) return {
      pickNumber,
      originalTeamCode,
      pickId: null,
      ownerTeamCode: null,
      ownershipStatus: 'unresolved',
      encumbranceStatus: 'unknown',
      usedStatus: 'unknown',
      selectionReadiness: 'blocked',
      missingInputs: [`No pick-rights ledger row resolves the ${originalTeamCode} original-team slot.`],
    };
    const pickId = String(ledgerRow.pickId ?? '').trim();
    const matchingStateRows = (state.draftPicks ?? []).filter(row => String(row.pickId ?? '').trim() === pickId);
    const scenarioRow = scenarioByPickId.get(pickId) ?? null;
    const ownerTeamCode = normalizeTeamCode(ledgerRow.ownerTeamCode);
    const base = {
      pickNumber,
      originalTeamCode,
      pickId,
      ownerTeamCode: (scenarioRow?.currentOwnerTeamCode ?? ownerTeamCode) || null,
      seasonStartYear: Number.isInteger(Number(ledgerRow.seasonStartYear)) ? Number(ledgerRow.seasonStartYear) : null,
      ownershipStatus: scenarioRow ? 'provisional-scenario' : ledgerRow.ownershipStatus ?? 'unknown',
      encumbranceStatus: scenarioRow ? 'provisional-scenario' : ledgerRow.encumbranceStatus ?? 'unknown',
      usedStatus: ledgerRow.usedStatus ?? 'unknown',
      pickRightsSourceRefs: clone(ledgerRow.sourceRefs ?? []),
      ...(scenarioRow ? { scenarioPickLedgerReceiptSha256: scenarioPickLedgerReceipt.integritySha256,
        sourceOwnerTeamCode: scenarioRow.sourceOwnerTeamCode,
        scenarioTransactionProposalIds: scenarioRow.transactionRefs.map(ref => ref.proposalId) } : {}),
    };
    const missingInputs = [];
    if (!pickRightsReceiptComplete(pickRightsLedgerReceipt, state.seasonStartYear)) {
      missingInputs.push('A complete season-matched pick-rights source receipt is required before the slot can be selected.');
    }
    if (base.seasonStartYear !== state.seasonStartYear) missingInputs.push(`Pick ${pickId} does not resolve to standings season ${state.seasonStartYear}.`);
    if (matchingStateRows.length !== 1) missingInputs.push(`Pick ${pickId} must match exactly one LeagueState draft-pick row.`);
    else if (!scenarioRow && !samePickState(ledgerRow, matchingStateRows[0])) missingInputs.push(`Pick ${pickId} ledger status conflicts with its LeagueState row.`);
    const selectedOwnerTeamCode = normalizeTeamCode(scenarioRow?.currentOwnerTeamCode ?? ownerTeamCode);
    if (!selectedOwnerTeamCode) missingInputs.push(`Pick ${pickId} current owner is unresolved.`);
    else if (!stateTeams.has(selectedOwnerTeamCode)) missingInputs.push(`Pick ${pickId} owner ${selectedOwnerTeamCode} is absent from LeagueState.`);
    if (base.ownershipStatus !== 'resolved' && !scenarioRow) missingInputs.push(`Pick ${pickId} ownership status is ${base.ownershipStatus}.`);
    if (base.encumbranceStatus !== 'clear' && !scenarioRow) missingInputs.push(`Pick ${pickId} encumbrance status is ${base.encumbranceStatus}.`);
    if (!Array.isArray(ledgerRow.sourceRefs) || !ledgerRow.sourceRefs.length) missingInputs.push(`Pick ${pickId} has no rights source references.`);
    if (base.usedStatus === 'selected') return {
      ...base,
      selectionReadiness: missingInputs.length ? 'blocked' : 'completed',
      missingInputs,
    };
    if (base.usedStatus !== 'available') missingInputs.push(`Pick ${pickId} is not marked available.`);
    return {
      ...base,
      selectionReadiness: missingInputs.length ? 'blocked' : scenarioRow ? 'ready-provisional-sandbox' : 'ready',
      missingInputs,
    };
  });
  const nextPick = orderedPicks.find(row => row.selectionReadiness !== 'completed') ?? null;
  return { orderedPicks, nextPick };
}

function handoffPayload({ state, draftYear, draftOrder, orderedPicks, lotteryPolicyReceipt, pickRightsLedgerReceipt,
  scenarioPickLedgerReceipt = null }) {
  return {
    format: DRAFT_NIGHT_ORCHESTRATION_VERSION_V1,
    stateRevision: state.revision,
    seasonStartYear: state.seasonStartYear,
    draftYear,
    draftOrder: [...draftOrder],
    orderedPicks: clone(orderedPicks),
    lotteryPolicyReceipt: clone(lotteryPolicyReceipt),
    pickRightsLedgerReceipt: clone(pickRightsLedgerReceipt ?? null),
    scenarioPickLedgerReceipt: clone(scenarioPickLedgerReceipt),
  };
}

/**
 * Simulates and validates a 30-slot lottery order, then joins original-team
 * slots to the caller's resolved pick-rights ledger for the existing picker.
 * Missing rights stay visible per slot and cannot be selected.
 */
export function prepareDraftNightOrderV1({ state, standings, lotteryPolicyInputs = {}, pickRightsLedger,
  pickRightsLedgerReceipt = null, allowProvisionalScenarioPickLedger = false } = {}) {
  try { validateLeagueState(state); }
  catch (error) { return failed('blocked-invalid-league-state', error.message); }
  if (state.transactionWindow !== 'draft') return failed('blocked-draft-window', 'Draft-night orchestration requires the draft transaction window.');
  if (!Number.isSafeInteger(state.seasonStartYear)) return failed('blocked-season', 'LeagueState needs a resolved seasonStartYear.');
  if (!lotteryPolicyInputs || typeof lotteryPolicyInputs !== 'object' || Array.isArray(lotteryPolicyInputs)) {
    return failed('provisional-lottery-inputs', 'Explicit season-specific lottery policy inputs are required.');
  }
  if (lotteryPolicyInputs.draftYear !== state.seasonStartYear + 1) {
    return failed('provisional-lottery-inputs', 'Lottery draftYear must immediately follow the LeagueState standings season.');
  }

  const lotteryResult = simulateNbaDraftOrderWithLotteryPolicyV1({
    ...lotteryPolicyInputs,
    standings,
    standingsSeasonStartYear: state.seasonStartYear,
    seed: lotteryPolicyInputs.seed,
  });
  const resultError = validateLotteryOrderResult(lotteryResult, { state, standings, lotteryPolicyInputs });
  if (resultError) return failed('provisional-lottery-order', resultError, {
    lotteryResult: clone(lotteryResult),
    lotteryPolicyReceipt: clone(lotteryResult.lotteryPolicyReceipt ?? null),
    missingInputs: [...new Set([resultError, ...(lotteryResult.missingInputs ?? [])])],
  });

  const ledgerError = pickLedgerError(pickRightsLedger, lotteryResult.order);
  if (ledgerError) return failed('blocked-pick-ledger-integrity', ledgerError, {
    draftOrder: clone(lotteryResult.order),
    lotteryResult: clone(lotteryResult),
    lotteryPolicyReceipt: clone(lotteryResult.lotteryPolicyReceipt),
  });
  let scenarioPickLedgerReceipt = null;
  if (allowProvisionalScenarioPickLedger) {
    scenarioPickLedgerReceipt = createScenarioPickLedgerReceiptV1({ state, pickRightsLedger, pickRightsLedgerReceipt });
    if (scenarioPickLedgerReceipt.status !== 'provisional-sandbox-scenario') {
      return failed('blocked-scenario-pick-ledger', scenarioPickLedgerReceipt.missingInputs?.[0] ?? 'Scenario pick ownership did not validate.', {
        draftOrder: clone(lotteryResult.order), lotteryResult: clone(lotteryResult),
        lotteryPolicyReceipt: clone(lotteryResult.lotteryPolicyReceipt),
        scenarioPickLedgerReceipt: clone(scenarioPickLedgerReceipt),
      });
    }
  }
  const { orderedPicks, nextPick } = joinRightsLedger({
    orderedTeamCodes: lotteryResult.order,
    pickRightsLedger,
    pickRightsLedgerReceipt,
    state,
    scenarioPickLedgerReceipt,
  });
  const ledgerComplete = pickRightsReceiptComplete(pickRightsLedgerReceipt, state.seasonStartYear) &&
    orderedPicks.every(row => row.selectionReadiness === 'ready' || row.selectionReadiness === 'completed');
  const scenarioReady = Boolean(scenarioPickLedgerReceipt) && pickRightsReceiptComplete(pickRightsLedgerReceipt, state.seasonStartYear) &&
    orderedPicks.every(row => ['ready', 'ready-provisional-sandbox', 'completed'].includes(row.selectionReadiness));
  const payload = handoffPayload({
    state,
    draftYear: lotteryResult.lotteryPolicyReceipt.draftYear,
    draftOrder: lotteryResult.order,
    orderedPicks,
    lotteryPolicyReceipt: lotteryResult.lotteryPolicyReceipt,
    pickRightsLedgerReceipt,
    scenarioPickLedgerReceipt,
  });
  const handoffReceipt = {
    format: 'djhc-draft-night-order-handoff-receipt-v1',
    version: DRAFT_NIGHT_ORCHESTRATION_VERSION_V1,
    stateRevision: state.revision,
    seasonStartYear: state.seasonStartYear,
    draftYear: lotteryResult.lotteryPolicyReceipt.draftYear,
    orderSha256: sha256HexV1(stableStringifyV1(lotteryResult.order)),
    standingsSha256: lotteryResult.lotteryPolicyReceipt.standingsSha256,
    lotteryReceiptSha256: sha256HexV1(stableStringifyV1(lotteryResult.lotteryPolicyReceipt)),
    pickRightsReceiptSha256: sha256HexV1(stableStringifyV1(pickRightsLedgerReceipt ?? null)),
    scenarioPickLedgerReceiptSha256: sha256HexV1(stableStringifyV1(scenarioPickLedgerReceipt)),
    rightsLedgerSha256: sha256HexV1(stableStringifyV1(orderedPicks)),
    payloadSha256: sha256HexV1(stableStringifyV1(payload)),
  };
  return {
    format: DRAFT_NIGHT_ORCHESTRATION_VERSION_V1,
    status: ledgerComplete ? 'ready-for-selection' : scenarioReady ? 'ready-provisional-scenario-rights' : 'order-ready-provisional-rights',
    draftYear: lotteryPolicyReceiptDraftYear(lotteryResult),
    seasonStartYear: state.seasonStartYear,
    stateRevision: state.revision,
    draftOrder: clone(lotteryResult.order),
    orderedPicks,
    nextPick,
    lotteryResult: clone(lotteryResult),
    lotteryPolicyReceipt: clone(lotteryResult.lotteryPolicyReceipt),
    pickRightsLedgerReceipt: clone(pickRightsLedgerReceipt),
    scenarioPickLedgerReceipt: clone(scenarioPickLedgerReceipt),
    handoffReceipt,
    missingInputs: ledgerComplete ? [] : [...new Set(orderedPicks.flatMap(row => row.missingInputs ?? []))],
    disclosure: 'Lottery order is a seeded policy simulation for original-team pick slots, not a historical NBA lottery result. Rights mapping is separate and requires resolved pick ownership and encumbrance inputs.',
  };
}

function lotteryPolicyReceiptDraftYear(lotteryResult) {
  return lotteryResult?.lotteryPolicyReceipt?.draftYear ?? null;
}

function verifyPreparedOrder(preparedDraftNight, state) {
  if (!preparedDraftNight || preparedDraftNight.format !== DRAFT_NIGHT_ORCHESTRATION_VERSION_V1 ||
      !preparedDraftNight.handoffReceipt || preparedDraftNight.handoffReceipt.format !== 'djhc-draft-night-order-handoff-receipt-v1') {
    return 'A versioned draft-night handoff receipt is required.';
  }
  if (preparedDraftNight.stateRevision !== state.revision || preparedDraftNight.handoffReceipt.stateRevision !== state.revision ||
      preparedDraftNight.seasonStartYear !== state.seasonStartYear || preparedDraftNight.handoffReceipt.seasonStartYear !== state.seasonStartYear) {
    return 'Draft-night order was prepared for a different LeagueState revision or season.';
  }
  const resultError = validateLotteryOrderResult(preparedDraftNight.lotteryResult, {
    state,
    standings: [],
    lotteryPolicyInputs: {
      draftYear: preparedDraftNight.draftYear,
      standingsReceipt: preparedDraftNight.lotteryPolicyReceipt?.standingsReceipt,
      seed: preparedDraftNight.lotteryPolicyReceipt?.seed?.draftSimulationSeed,
    },
    requireStandingsHash: false,
  });
  if (resultError) return resultError;
  if (stableStringifyV1(preparedDraftNight.draftOrder) !== stableStringifyV1(preparedDraftNight.lotteryResult.order) ||
      stableStringifyV1(preparedDraftNight.lotteryPolicyReceipt) !== stableStringifyV1(preparedDraftNight.lotteryResult.lotteryPolicyReceipt)) {
    return 'Prepared order or policy receipt no longer matches its lottery result.';
  }
  const payload = handoffPayload({
    state: { ...state, revision: preparedDraftNight.handoffReceipt.stateRevision },
    draftYear: preparedDraftNight.draftYear,
    draftOrder: preparedDraftNight.draftOrder,
    orderedPicks: preparedDraftNight.orderedPicks,
    lotteryPolicyReceipt: preparedDraftNight.lotteryPolicyReceipt,
    pickRightsLedgerReceipt: preparedDraftNight.pickRightsLedgerReceipt ?? null,
    scenarioPickLedgerReceipt: preparedDraftNight.scenarioPickLedgerReceipt ?? null,
  });
  if (preparedDraftNight.scenarioPickLedgerReceipt) {
    const scenarioValidation = validateScenarioPickLedgerReceiptV1({ state, receipt: preparedDraftNight.scenarioPickLedgerReceipt });
    if (!scenarioValidation.valid) return scenarioValidation.reason;
  }
  if (sha256HexV1(stableStringifyV1(payload)) !== preparedDraftNight.handoffReceipt.payloadSha256 ||
      sha256HexV1(stableStringifyV1(preparedDraftNight.draftOrder)) !== preparedDraftNight.handoffReceipt.orderSha256 ||
      preparedDraftNight.handoffReceipt.standingsSha256 !== preparedDraftNight.lotteryPolicyReceipt.standingsSha256 ||
      sha256HexV1(stableStringifyV1(preparedDraftNight.lotteryPolicyReceipt)) !== preparedDraftNight.handoffReceipt.lotteryReceiptSha256 ||
      sha256HexV1(stableStringifyV1(preparedDraftNight.pickRightsLedgerReceipt ?? null)) !== preparedDraftNight.handoffReceipt.pickRightsReceiptSha256 ||
      sha256HexV1(stableStringifyV1(preparedDraftNight.scenarioPickLedgerReceipt ?? null)) !== preparedDraftNight.handoffReceipt.scenarioPickLedgerReceiptSha256 ||
      sha256HexV1(stableStringifyV1(preparedDraftNight.orderedPicks)) !== preparedDraftNight.handoffReceipt.rightsLedgerSha256) {
    return 'Draft-night handoff content does not match its receipt hashes.';
  }
  return null;
}

/** Runs one validated current pick through the existing CPU/user draft action. */
export function runDraftNightSelectionV1({ preparedDraftNight, state, pickNumber, prospects = [], seed, ruleEngine = null } = {}) {
  try { validateLeagueState(state); }
  catch (error) { return failed('blocked-invalid-league-state', error.message); }
  const verificationError = verifyPreparedOrder(preparedDraftNight, state);
  if (verificationError) return failed('blocked-invalid-order-handoff', verificationError, {
    draftOrder: clone(preparedDraftNight?.draftOrder ?? []),
    handoffReceipt: clone(preparedDraftNight?.handoffReceipt ?? null),
  });
  if (state.transactionWindow !== 'draft') return failed('blocked-draft-window', 'Draft selection requires the draft transaction window.');
  const nextPickNumber = preparedDraftNight.nextPick?.pickNumber ?? null;
  const requestedPickNumber = pickNumber ?? nextPickNumber;
  if (!Number.isSafeInteger(requestedPickNumber) || requestedPickNumber !== nextPickNumber) {
    return failed('blocked-draft-sequence', `Selection must use the current next pick ${nextPickNumber ?? '(none)'}.`, {
      draftOrder: clone(preparedDraftNight.draftOrder),
      orderedPicks: clone(preparedDraftNight.orderedPicks),
      nextPick: clone(preparedDraftNight.nextPick),
    });
  }
  const orderedPick = preparedDraftNight.orderedPicks.find(row => row.pickNumber === requestedPickNumber);
  const provisionalScenarioReady = orderedPick?.selectionReadiness === 'ready-provisional-sandbox' &&
    Boolean(preparedDraftNight.scenarioPickLedgerReceipt) && state.mode === 'provisional-sandbox';
  if (!orderedPick || (orderedPick.selectionReadiness !== 'ready' && !provisionalScenarioReady)) {
    return failed('blocked-pick-rights', orderedPick?.missingInputs?.[0] ?? 'The current pick has unresolved rights or is not available.', {
      draftOrder: clone(preparedDraftNight.draftOrder),
      orderedPicks: clone(preparedDraftNight.orderedPicks),
      nextPick: clone(orderedPick ?? preparedDraftNight.nextPick),
      lotteryPolicyReceipt: clone(preparedDraftNight.lotteryPolicyReceipt),
    });
  }
  const selection = runCpuDraftPick({
    state,
    teamCode: orderedPick.ownerTeamCode,
    pickId: orderedPick.pickId,
    prospects,
    seed,
    ruleEngine,
    scenarioPickLedgerReceipt: provisionalScenarioReady ? preparedDraftNight.scenarioPickLedgerReceipt : null,
  });
  const selectedProspect = prospects.find(row => row?.canonicalName === selection.selection) ?? null;
  const rookieTermsStatus = selection.evaluation?.status === 'confirmed-legal'
    ? 'confirmed-by-current-season-rule-evaluation'
    : selectedProspect?.rookieContractTerms || selectedProspect?.contractScaleInput
      ? 'provisional-or-unresolved'
      : 'missing-provisional-or-blocked';
  const status = selection.status === 'awaiting-user-approval'
    ? 'awaiting-user-approval'
    : selection.status === 'committed'
      ? 'selection-committed'
      : selection.status === 'committed-provisional'
        ? 'selection-provisional'
        : `blocked-selection:${selection.status}`;
  return {
    format: DRAFT_NIGHT_ORCHESTRATION_VERSION_V1,
    status,
    pickNumber: requestedPickNumber,
    originalTeamCode: orderedPick.originalTeamCode,
    ownerTeamCode: orderedPick.ownerTeamCode,
    pickId: orderedPick.pickId,
    rookieTermsStatus,
    lotteryPolicyReceipt: clone(preparedDraftNight.lotteryPolicyReceipt),
    handoffReceipt: clone(preparedDraftNight.handoffReceipt),
    scenarioPickLedgerReceipt: clone(preparedDraftNight.scenarioPickLedgerReceipt ?? null),
    selectionResult: selection,
    state: clone(selection.state),
    missingInputs: [...(selection.evaluation?.missingInputs ?? selection.violations ?? [])],
    disclosure: provisionalScenarioReady
      ? 'Selection uses a validated provisional sandbox pick-owner scenario. The authoritative rights ledger remains unchanged; protections, swaps, rights-chain and Stepien legality are unresolved. User-controlled selections still wait for approval.'
      : 'Selection is routed through the existing prototype draft flow. User-controlled selections wait for explicit approval; unresolved rookie terms remain provisional or blocked.',
  };
}
