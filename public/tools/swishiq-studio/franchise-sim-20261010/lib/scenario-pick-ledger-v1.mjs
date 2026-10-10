import { sha256HexV1, stableStringifyV1 } from './sha256-isomorphic-v1.mjs';
import { validateLeagueState } from './simulation-contracts-v1.mjs';

export const SCENARIO_PICK_LEDGER_FORMAT_V1 = 'djhc-scenario-pick-ledger-receipt-v1';

const clone = value => structuredClone(value);
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

function teamCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z0-9][A-Z0-9._:-]{0,79}$/.test(code) ? code : '';
}

function blocked(reason, details = {}) {
  return { format: SCENARIO_PICK_LEDGER_FORMAT_V1, status: 'blocked', missingInputs: [reason], ...details };
}

function completeSourceReceipt(receipt, seasonStartYear) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || !nonEmpty(receipt.id) ||
      receipt.status !== 'complete' || receipt.seasonStartYear !== seasonStartYear ||
      !Array.isArray(receipt.sourceRefs) || receipt.sourceRefs.length === 0) return false;
  return receipt.sourceRefs.every(ref => nonEmpty(ref) || (ref && typeof ref === 'object' && !Array.isArray(ref) &&
    (nonEmpty(ref.sourceUrl) || nonEmpty(ref.sourceSystem) || nonEmpty(ref.id))));
}

function sourceEvidenceForPick(pick) {
  return {
    ownerTeamCode: pick.ownerTeamCode ?? null,
    ownershipStatus: pick.ownershipStatus ?? 'unknown',
    encumbranceStatus: pick.encumbranceStatus ?? 'unknown',
    sourceRefs: clone(pick.sourceRefs ?? []),
  };
}

function transitionMatchesLedger({ pickId, transition, transitionIndex, transactionLedger, sourceEvidenceSha256, seasonStartYear }) {
  const matches = transactionLedger.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry?.proposalId === transition.proposalId);
  if (matches.length !== 1) return { error: `Pick ${pickId} scenario transition ${transition.proposalId ?? '(missing proposalId)'} must match exactly one applied transaction-ledger entry.` };
  const [{ entry, index }] = matches;
  if (entry.kind !== 'trade' || entry.status !== 'provisional' || entry.seasonStartYear !== seasonStartYear ||
      !Array.isArray(entry.touchedTeams) || !entry.touchedTeams.includes(transition.fromTeamCode) ||
      !entry.touchedTeams.includes(transition.toTeamCode)) {
    return { error: `Pick ${pickId} scenario transition ${transition.proposalId} does not match a provisional trade-ledger entry for this season and team pair.` };
  }
  const transferRows = Array.isArray(entry.scenarioPickTransfers) ? entry.scenarioPickTransfers : [];
  const transferMatches = transferRows.filter(row => row?.pickId === pickId && row?.fromTeamCode === transition.fromTeamCode &&
    row?.toTeamCode === transition.toTeamCode && row?.seasonStartYear === seasonStartYear &&
    row?.sourceEvidenceSha256 === sourceEvidenceSha256 && row?.transitionIndex === transitionIndex);
  if (transferMatches.length !== 1) return { error: `Pick ${pickId} transfer ${transition.proposalId} is not uniquely recorded in the append-only scenario transfer ledger.` };
  return { index, transactionRef: { proposalId: entry.proposalId, transactionLedgerIndex: index,
    sourceEvidenceSha256, pickTransfer: clone(transferMatches[0]) } };
}

function scenarioRowsFromState(state, pickRightsLedger) {
  if (!Array.isArray(pickRightsLedger)) return { error: 'An authoritative pick-rights ledger array is required as the source baseline.' };
  const rows = [];
  for (const pick of state.draftPicks) {
    const scenario = pick?.ownershipScenario;
    if (!scenario) continue;
    const pickId = String(pick.pickId ?? pick.assetId ?? pick.id ?? '').trim();
    if (!pickId || scenario.format !== 'djhc-provisional-pick-transfer-v1' || scenario.status !== 'provisional') {
      return { error: `LeagueState pick ${pickId || '(missing ID)'} has an unsupported provisional ownership scenario.` };
    }
    if (pick.ownershipStatus !== 'provisional-scenario' || pick.encumbranceStatus !== 'provisional-scenario' ||
        pick.usedStatus !== 'available' || Number(pick.seasonStartYear) !== state.seasonStartYear) {
      return { error: `Scenario pick ${pickId} must be an available pick in the current draft season with explicit provisional ownership and encumbrance status.` };
    }
    if (state.draftPicks.filter(row => String(row.pickId ?? row.assetId ?? row.id ?? '').trim() === pickId).length !== 1) {
      return { error: `Scenario pick ${pickId} must identify exactly one existing LeagueState pick row.` };
    }
    const sourceEvidence = scenario.sourceEvidence;
    const sourceOwner = teamCode(sourceEvidence?.ownerTeamCode);
    const currentOwner = teamCode(pick.ownerTeamCode);
    const originalTeamCode = teamCode(pick.originalTeamCode);
    if (!sourceOwner || sourceEvidence?.ownershipStatus !== 'resolved' || sourceEvidence?.encumbranceStatus !== 'clear' ||
        !Array.isArray(sourceEvidence?.sourceRefs) || sourceEvidence.sourceRefs.length === 0 ||
        !originalTeamCode || !state.teams.some(team => team.teamCode === originalTeamCode) ||
        !state.teams.some(team => team.teamCode === sourceOwner)) {
      return { error: `Scenario pick ${pickId} did not begin from an existing, resolved, source-backed and clear ownership row.` };
    }
    if (!currentOwner || scenario.ownerTeamCode !== currentOwner || !state.teams.some(team => team.teamCode === currentOwner)) {
      return { error: `Scenario pick ${pickId} current owner is missing, inconsistent, or absent from LeagueState.` };
    }
    const sourceRows = pickRightsLedger.filter(row => String(row?.pickId ?? '').trim() === pickId);
    if (sourceRows.length !== 1) return { error: `Scenario pick ${pickId} must map to exactly one authoritative source-ledger row.` };
    const sourceRow = sourceRows[0];
    if (Number(sourceRow.seasonStartYear) !== state.seasonStartYear ||
        teamCode(sourceRow.originalTeamCode) !== originalTeamCode ||
        teamCode(sourceRow.ownerTeamCode) !== sourceOwner || sourceRow.ownershipStatus !== 'resolved' ||
        sourceRow.encumbranceStatus !== 'clear' || sourceRow.usedStatus !== 'available' ||
        stableStringifyV1(sourceRow.sourceRefs ?? []) !== stableStringifyV1(sourceEvidence.sourceRefs)) {
      return { error: `Scenario pick ${pickId} does not match its authoritative source-ledger ownership, season, availability, or provenance.` };
    }
    if (stableStringifyV1(sourceEvidenceForPick({ ...pick, ...sourceEvidence })) !== stableStringifyV1(sourceEvidence)) {
      return { error: `Scenario pick ${pickId} source-evidence record is malformed.` };
    }
    const transitions = scenario.transitions;
    if (!Array.isArray(transitions) || transitions.length === 0) return { error: `Scenario pick ${pickId} has no applied transfer history.` };
    const sourceEvidenceSha256 = sha256HexV1(stableStringifyV1(sourceEvidence));
    let expectedFrom = sourceOwner;
    let previousLedgerIndex = -1;
    const transactionRefs = [];
    for (const [transitionIndex, transition] of transitions.entries()) {
      const from = teamCode(transition?.fromTeamCode);
      const to = teamCode(transition?.toTeamCode);
      if (transition?.seasonStartYear !== state.seasonStartYear || from !== expectedFrom || !to || to === from ||
          transition?.sourceEvidenceSha256 !== sourceEvidenceSha256 || !nonEmpty(transition?.proposalId)) {
        return { error: `Scenario pick ${pickId} transition ${transitionIndex + 1} does not form a complete season-matched ownership chain.` };
      }
      const matched = transitionMatchesLedger({ pickId, transition: { ...transition, fromTeamCode: from, toTeamCode: to },
        transitionIndex, transactionLedger: state.transactionLedger, sourceEvidenceSha256, seasonStartYear: state.seasonStartYear });
      if (matched.error) return { error: matched.error };
      if (matched.index <= previousLedgerIndex) return { error: `Scenario pick ${pickId} transfer history is not in append-only transaction order.` };
      previousLedgerIndex = matched.index;
      transactionRefs.push(matched.transactionRef);
      expectedFrom = to;
    }
    if (expectedFrom !== currentOwner) return { error: `Scenario pick ${pickId} transfer chain does not end at its LeagueState owner.` };
    rows.push({
      pickId,
      originalTeamCode,
      seasonStartYear: state.seasonStartYear,
      sourceOwnerTeamCode: sourceOwner,
      currentOwnerTeamCode: currentOwner,
      sourceEvidence: clone(sourceEvidence),
      transitions: clone(transitions),
      transactionRefs,
      ownershipStatus: 'provisional-scenario',
      encumbranceStatus: 'provisional-scenario',
      usedStatus: pick.usedStatus,
      sourceRefs: clone(sourceEvidence.sourceRefs),
    });
  }
  if (!rows.length) return { error: 'No applied provisional pick transfers are available for the scenario-ledger path.' };
  return { rows };
}

function receiptPayload(receipt) {
  const { integritySha256, ...payload } = receipt;
  return payload;
}

/**
 * Creates a receipt for applying already-committed provisional pick transfers
 * at Draft Night. It validates them against the untouched source rights ledger
 * and append-only transaction entries; it never constructs a pick-rights or
 * protection/Stepien chain.
 */
export function createScenarioPickLedgerReceiptV1({ state, pickRightsLedger, pickRightsLedgerReceipt } = {}) {
  try { validateLeagueState(state); }
  catch (error) { return blocked(`LeagueState is invalid: ${error.message}`); }
  if (state.mode !== 'provisional-sandbox') return blocked('Scenario pick ownership can be used only in explicit Provisional Sandbox mode.');
  if (state.transactionWindow !== 'draft') return blocked('Scenario pick ledger can be prepared only in the draft transaction window.');
  if (!completeSourceReceipt(pickRightsLedgerReceipt, state.seasonStartYear)) return blocked('A complete, season-matched authoritative pick-rights receipt is required as the scenario baseline.');
  const result = scenarioRowsFromState(state, pickRightsLedger);
  if (result.error) return blocked(result.error);
  const payload = {
    format: SCENARIO_PICK_LEDGER_FORMAT_V1,
    schemaVersion: '1.0.0',
    status: 'provisional-sandbox-scenario',
    seasonStartYear: state.seasonStartYear,
    stateRevision: state.revision,
    sourcePickRightsLedger: clone(pickRightsLedger),
    sourcePickRightsLedgerSha256: sha256HexV1(stableStringifyV1(pickRightsLedger)),
    sourcePickRightsLedgerReceipt: clone(pickRightsLedgerReceipt),
    sourcePickRightsReceiptSha256: sha256HexV1(stableStringifyV1(pickRightsLedgerReceipt)),
    stateDraftPicksSha256: sha256HexV1(stableStringifyV1(state.draftPicks)),
    transactionLedgerSha256: sha256HexV1(stableStringifyV1(state.transactionLedger)),
    scenarioRows: result.rows,
    evidence: result.rows.map(row => ({ pickId: row.pickId, sourceEvidence: clone(row.sourceEvidence),
      transactionRefs: clone(row.transactionRefs) })),
    assumptions: ['Pick ownership follows explicit applied sandbox transaction history only.',
      'The authoritative source ledger remains the baseline and is not rewritten.',
      'Protection, swap, rights-chain and Stepien legality are not inferred or resolved.'],
    disclosure: 'Provisional scenario ownership for simulation only; not authoritative pick rights and not confirmed legal under NBA trade rules.',
  };
  return { ...payload, integritySha256: sha256HexV1(stableStringifyV1(payload)) };
}

/** Verifies a scenario receipt against its source ledger and the current state. */
export function validateScenarioPickLedgerReceiptV1({ state, receipt } = {}) {
  if (!receipt || receipt.format !== SCENARIO_PICK_LEDGER_FORMAT_V1 || receipt.schemaVersion !== '1.0.0' ||
      receipt.status !== 'provisional-sandbox-scenario' || !nonEmpty(receipt.integritySha256)) {
    return { valid: false, reason: 'A versioned provisional scenario pick-ledger receipt is required.' };
  }
  if (sha256HexV1(stableStringifyV1(receiptPayload(receipt))) !== receipt.integritySha256) {
    return { valid: false, reason: 'Scenario pick-ledger receipt integrity hash does not match its contents.' };
  }
  if (receipt.seasonStartYear !== state?.seasonStartYear || receipt.stateRevision !== state?.revision ||
      state?.mode !== 'provisional-sandbox' || state?.transactionWindow !== 'draft') {
    return { valid: false, reason: 'Scenario pick-ledger receipt does not match the current sandbox draft state, season, or revision.' };
  }
  const recomputed = createScenarioPickLedgerReceiptV1({ state, pickRightsLedger: receipt.sourcePickRightsLedger,
    pickRightsLedgerReceipt: receipt.sourcePickRightsLedgerReceipt });
  if (recomputed.status !== 'provisional-sandbox-scenario' ||
      recomputed.integritySha256 !== receipt.integritySha256 ||
      stableStringifyV1(recomputed) !== stableStringifyV1(receipt)) {
    return { valid: false, reason: recomputed.missingInputs?.[0] ?? 'Scenario pick-ledger receipt no longer matches LeagueState and its transaction history.' };
  }
  return { valid: true, scenarioRows: clone(recomputed.scenarioRows) };
}
