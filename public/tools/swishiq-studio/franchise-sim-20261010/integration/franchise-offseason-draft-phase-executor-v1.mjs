import { runDraftNightSelectionV1 } from './draft-night-orchestration-v1.mjs';
import { verifyRosterTransitionReceiptV1 } from '../lib/transaction-engine-v1.mjs';
import { normalizeCanonicalPlayerName, validateLeagueState } from '../lib/simulation-contracts-v1.mjs';
import { stableStringifyV1 } from '../lib/sha256-isomorphic-v1.mjs';

export const FRANCHISE_OFFSEASON_DRAFT_PHASE_EXECUTOR_V1_FORMAT = 'djhc-franchise-offseason-draft-phase-executor-v1';

const clone = value => structuredClone(value);

function blocked(state, status, missingInputs, details = {}) {
  return { format: FRANCHISE_OFFSEASON_DRAFT_PHASE_EXECUTOR_V1_FORMAT, phase: 'draft', status,
    state: clone(state), missingInputs: [...new Set(missingInputs)], ...details };
}

function expectedContractSeasons(proposal) {
  if (Array.isArray(proposal?.contractSeasons)) return proposal.contractSeasons;
  const term = proposal?.contractTerms ?? proposal?.prospect?.rookieContractTerms ?? null;
  return term ? [term] : [];
}

function verifyCommittedSelection({ beforeState, afterState, orderedPick, selectionResult, phaseResult }) {
  const proposal = selectionResult?.proposal;
  const evaluation = selectionResult?.evaluation;
  const receipt = evaluation?.rosterTransitionReceipt;
  const pickLegs = (proposal?.legs ?? []).filter(leg => leg.assetType === 'draft-pick' && leg.action === 'consume' &&
    String(leg.pickId ?? leg.assetId ?? '') === orderedPick.pickId &&
    String(leg.fromTeamCode ?? '').toUpperCase() === orderedPick.ownerTeamCode &&
    String(leg.toTeamCode ?? '').toUpperCase() === orderedPick.ownerTeamCode);
  const prospectLegs = (proposal?.legs ?? []).filter(leg => leg.assetType === 'prospect' &&
    String(leg.toTeamCode ?? '').toUpperCase() === orderedPick.ownerTeamCode &&
    normalizeCanonicalPlayerName(leg.prospect?.canonicalName) === normalizeCanonicalPlayerName(proposal?.prospect?.canonicalName));
  if (selectionResult?.status !== 'committed' && selectionResult?.status !== 'committed-provisional') {
    return { valid: false, reason: 'Draft selection did not return a committed transaction.' };
  }
  if (!proposal || proposal.format !== 'djhc-transaction-proposal-v1' || proposal.kind !== 'draft-selection' ||
      proposal.expectedStateRevision !== beforeState.revision || proposal.pickId !== orderedPick.pickId ||
      pickLegs.length !== 1 || prospectLegs.length !== 1) {
    return { valid: false, reason: 'Committed draft proposal does not match the current pick, owner, and state revision.' };
  }
  if (!verifyRosterTransitionReceiptV1(receipt)) return { valid: false, reason: 'Roster transition receipt hash failed verification.' };
  const beforePicks = beforeState.draftPicks.filter(row => String(row.pickId ?? row.assetId ?? row.id) === orderedPick.pickId);
  const afterPicks = afterState.draftPicks.filter(row => String(row.pickId ?? row.assetId ?? row.id) === orderedPick.pickId);
  if (beforePicks.length !== 1 || afterPicks.length !== 1 || beforePicks[0].usedStatus !== 'available' ||
      afterPicks[0].usedStatus !== 'selected' || afterPicks[0].lastTransactionProposalId !== proposal.proposalId) {
    return { valid: false, reason: 'Draft pick must be consumed exactly once by the committed selection proposal.' };
  }
  const normalizedName = normalizeCanonicalPlayerName(proposal.prospect?.canonicalName);
  const newPlayers = afterState.players.filter(row => normalizeCanonicalPlayerName(row.canonicalName ?? row.displayName) === normalizedName);
  if (!normalizedName || newPlayers.length !== 1 || newPlayers[0].teamCode !== orderedPick.ownerTeamCode ||
      newPlayers[0].rosterStatus !== 'rookie') {
    return { valid: false, reason: 'Committed prospect is not present exactly once as a rookie on the pick owner roster.' };
  }
  const playerTerms = newPlayers[0].contractSeasons ?? [];
  const suppliedTerms = expectedContractSeasons(proposal);
  if (!suppliedTerms.length || stableStringifyV1(playerTerms) !== stableStringifyV1(suppliedTerms)) {
    return { valid: false, reason: 'Committed rookie contract terms do not exactly match explicit proposal terms.' };
  }
  const ownerRoster = afterState.teams.find(team => team.teamCode === orderedPick.ownerTeamCode)?.rosterNames ?? [];
  if (ownerRoster.filter(name => normalizeCanonicalPlayerName(name) === normalizedName).length !== 1) {
    return { valid: false, reason: 'Committed prospect must be added exactly once to the owner roster.' };
  }
  const ledgerEntry = afterState.transactionLedger?.at(-1);
  if (afterState.revision !== beforeState.revision + 1 || afterState.transactionLedger?.length !== beforeState.transactionLedger.length + 1 ||
      ledgerEntry?.proposalId !== proposal.proposalId || ledgerEntry?.kind !== 'draft-selection' ||
      ledgerEntry?.revisionBefore !== beforeState.revision || ledgerEntry?.revisionAfter !== afterState.revision) {
    return { valid: false, reason: 'Draft commit must add one matching transaction-ledger entry and one LeagueState revision.' };
  }
  if (receipt.proposalId !== proposal.proposalId || receipt.transactionLedgerProposalId !== proposal.proposalId ||
      receipt.sourceSeasonStartYear !== beforeState.seasonStartYear || receipt.targetSeasonStartYear !== afterState.seasonStartYear ||
      receipt.revisionBefore !== beforeState.revision || receipt.revisionAfter !== afterState.revision ||
      stableStringifyV1(receipt.committedProposal) !== stableStringifyV1(proposal) ||
      stableStringifyV1(receipt.transactionLedgerEntry) !== stableStringifyV1(ledgerEntry)) {
    return { valid: false, reason: 'Roster receipt does not bind the exact proposal, ledger row, season, and revisions.' };
  }
  const added = receipt.addedByTeam?.[orderedPick.ownerTeamCode] ?? [];
  if (added.filter(row => row.normalizedName === normalizedName).length !== 1 ||
      !receipt.movedPlayers?.some(row => row.normalizedName === normalizedName && row.fromTeamCode === null &&
        row.toTeamCode === orderedPick.ownerTeamCode)) {
    return { valid: false, reason: 'Roster transition receipt does not show exactly one new prospect on the current owner.' };
  }
  const persistedReceipt = afterState.rosterTransitionReceipts?.at(-1);
  if (!persistedReceipt || persistedReceipt.receiptSha256 !== receipt.receiptSha256 ||
      !phaseResult?.selectionResult?.evaluation?.rosterTransitionReceipt) {
    return { valid: false, reason: 'Verified roster transition receipt was not persisted with the committed LeagueState.' };
  }
  return { valid: true, receipt, proposal, evaluation, contractTransitionStatus: 'terms-applied-from-proposal' };
}

/** Lifecycle-compatible factory: each invocation attempts exactly one pick. */
export function createFranchiseOffseasonDraftPhaseExecutorV1({ ruleEngine = null } = {}) {
  return (state, context) => executeFranchiseOffseasonDraftPhaseV1({ state, context, ruleEngine });
}

/** Explicit context contract: { preparedDraftNight, prospects, seed, pickNumber? }. */
export function executeFranchiseOffseasonDraftPhaseV1({ state, context, ruleEngine = null } = {}) {
  try { validateLeagueState(state); }
  catch (error) { return blocked(state ?? {}, 'blocked-invalid-league-state', [error.message]); }
  if (state.transactionWindow !== 'draft') return blocked(state, 'blocked-wrong-window',
    ['LeagueState must be in the draft transaction window.']);
  const prepared = context?.preparedDraftNight;
  if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared)) return blocked(state,
    'blocked-requires-input', ['context.preparedDraftNight']);
  if (!Array.isArray(context.prospects) || context.prospects.length === 0) return blocked(state,
    'blocked-requires-input', ['context.prospects must explicitly supply at least one prospect.']);
  if (!Number.isSafeInteger(context.seed) || context.seed < 0 || context.seed > 0xFFFFFFFF) return blocked(state,
    'blocked-requires-input', ['context.seed must be an explicit unsigned 32-bit integer.']);
  if (prepared.stateRevision !== state.revision || prepared.handoffReceipt?.stateRevision !== state.revision ||
      prepared.seasonStartYear !== state.seasonStartYear || prepared.handoffReceipt?.seasonStartYear !== state.seasonStartYear) {
    return blocked(state, 'blocked-stale-draft-state', ['Prepared draft order revision/season does not match the current LeagueState.']);
  }
  if (!Array.isArray(prepared.orderedPicks)) return blocked(state, 'blocked-invalid-draft-handoff',
    ['Prepared draft handoff must contain its ordered pick-right rows.']);
  const nextPick = prepared.nextPick ?? null;
  if (!nextPick) {
    const completed = prepared.orderedPicks.length > 0 && prepared.orderedPicks.every(row => row.selectionReadiness === 'completed');
    return completed
      ? { format: FRANCHISE_OFFSEASON_DRAFT_PHASE_EXECUTOR_V1_FORMAT, phase: 'draft', status: 'draft-complete', state: clone(state),
        missingInputs: [], receipt: null }
      : blocked(state, 'blocked-pick-rights', ['Draft handoff has no next pick while one or more slots remain unresolved.']);
  }
  const requestedPickNumber = context.pickNumber ?? nextPick.pickNumber;
  if (!Number.isSafeInteger(requestedPickNumber) || requestedPickNumber !== nextPick.pickNumber) return blocked(state,
    'blocked-stale-pick', [`Requested pick ${requestedPickNumber ?? '(missing)'} is not the prepared next pick ${nextPick.pickNumber}.`],
    { nextPick: clone(nextPick) });
  const orderedRows = prepared.orderedPicks.filter(row => row.pickNumber === requestedPickNumber);
  if (orderedRows.length !== 1 || stableStringifyV1(orderedRows[0]) !== stableStringifyV1(nextPick)) return blocked(state,
    'blocked-ambiguous-pick', ['Prepared order must contain exactly one row matching its next pick.'], { nextPick: clone(nextPick) });
  const pickId = String(nextPick.pickId ?? '').trim();
  if (!pickId) return blocked(state, 'blocked-pick-rights', ['Current pick has no resolved pickId.'], { nextPick: clone(nextPick) });
  const matchingPickRows = state.draftPicks.filter(row => String(row.pickId ?? row.assetId ?? row.id ?? '').trim() === pickId);
  if (matchingPickRows.length !== 1) return blocked(state, 'blocked-ambiguous-pick',
    [`Current pick ${pickId} must match exactly one LeagueState draft-pick row.`], { nextPick: clone(nextPick) });
  const pick = matchingPickRows[0];
  if (pick.usedStatus !== 'available') return blocked(state, 'blocked-pick-already-consumed',
    [`Current pick ${pickId} is not available for selection.`], { nextPick: clone(nextPick) });
  if (Number(pick.seasonStartYear) !== state.seasonStartYear ||
      String(pick.ownerTeamCode ?? '').toUpperCase() !== String(nextPick.ownerTeamCode ?? '').toUpperCase()) {
    return blocked(state, 'blocked-pick-rights', ['Current pick season or owner does not match its prepared rights row.'],
      { nextPick: clone(nextPick) });
  }
  const ownerTeams = state.teams.filter(team => team.teamCode === nextPick.ownerTeamCode);
  if (ownerTeams.length !== 1) return blocked(state, 'blocked-ambiguous-team',
    [`Pick owner ${nextPick.ownerTeamCode} must resolve to exactly one LeagueState team.`], { nextPick: clone(nextPick) });

  const phaseResult = runDraftNightSelectionV1({ preparedDraftNight: prepared, state, pickNumber: requestedPickNumber,
    prospects: clone(context.prospects), seed: context.seed, ruleEngine });
  const selectionResult = phaseResult.selectionResult;
  const proposal = selectionResult?.proposal ?? null;
  const evaluation = selectionResult?.evaluation ?? null;
  const userControlled = (state.userControlledTeamCodes ?? []).some(code => String(code).toUpperCase() ===
    String(nextPick.ownerTeamCode).toUpperCase());
  if (userControlled && proposal?.actor === 'user' && proposal.expectedStateRevision === state.revision &&
      evaluation?.userApprovalRequired === true && evaluation.approvalReceived !== true && evaluation.status !== 'illegal') {
    if (phaseResult.state?.revision !== state.revision || selectionResult.state?.revision !== state.revision ||
        stableStringifyV1(selectionResult.state) !== stableStringifyV1(state)) {
      return blocked(state, 'blocked-invalid-user-pending-state',
        ['A pending user pick must preserve the exact input LeagueState.'], { phaseResult });
    }
    return { format: FRANCHISE_OFFSEASON_DRAFT_PHASE_EXECUTOR_V1_FORMAT, phase: 'draft',
      status: 'awaiting-user-approval', state: clone(state), pickNumber: requestedPickNumber,
      pickId, ownerTeamCode: nextPick.ownerTeamCode, selection: selectionResult.selection,
      pendingProposal: proposal, evaluation, decisionReceipt: selectionResult.decisionReceipt ?? null,
      phaseResult, missingInputs: [...(evaluation.missingInputs ?? [])],
      disclosure: 'The pick remains unconsumed until the user decision is resolved. Rule outcome and evidence basis remain those returned by the transaction engine.' };
  }

  if (phaseResult.status === 'blocked-invalid-order-handoff') return blocked(state,
    'blocked-invalid-draft-handoff', phaseResult.missingInputs ?? ['Draft handoff failed verification.'], { phaseResult });
  if (phaseResult.status === 'blocked-pick-rights' || phaseResult.status === 'blocked-pick-window' ||
      phaseResult.status === 'blocked-draft-sequence') return blocked(state, phaseResult.status,
    phaseResult.missingInputs ?? ['Draft order or pick rights are unresolved.'], { phaseResult });
  if (phaseResult.status.startsWith('blocked-selection:') || !selectionResult) return blocked(state,
    'blocked-selection', phaseResult.missingInputs ?? [phaseResult.status], { phaseResult, evaluation });
  if (selectionResult.status !== 'committed' && selectionResult.status !== 'committed-provisional') {
    return blocked(state, 'blocked-selection', selectionResult.violations ?? [selectionResult.status], { phaseResult, evaluation });
  }
  const receiptCheck = verifyCommittedSelection({ beforeState: state, afterState: phaseResult.state,
    orderedPick: nextPick, selectionResult, phaseResult });
  if (!receiptCheck.valid) return blocked(state, 'blocked-unverified-draft-transition', [receiptCheck.reason], { phaseResult, evaluation });
  const status = selectionResult.status === 'committed' ? 'selection-committed' : 'selection-provisional';
  return { format: FRANCHISE_OFFSEASON_DRAFT_PHASE_EXECUTOR_V1_FORMAT, phase: 'draft', status,
    state: clone(phaseResult.state), pickNumber: requestedPickNumber, pickId, ownerTeamCode: nextPick.ownerTeamCode,
    selection: selectionResult.selection, evaluation: receiptCheck.evaluation, receipt: receiptCheck.receipt,
    receiptVerified: true, contractTransitionStatus: receiptCheck.contractTransitionStatus,
    decisionReceipt: selectionResult.decisionReceipt ?? null, phaseResult,
    missingInputs: [...(receiptCheck.evaluation.missingInputs ?? [])],
    disclosure: receiptCheck.evaluation.legalityOutcome === 'confirmed-legal'
      ? 'The transaction engine returned confirmed-legal for this selection; the attached receipt binds the exact pick, prospect, contract terms, roster, ledger, and revisions.'
      : `Selection committed with transaction-engine outcome ${receiptCheck.evaluation.legalityOutcome ?? 'unknown'} and evidence basis ${receiptCheck.evaluation.evidenceBasis ?? 'unreported'}. The attached receipt verifies the state transition; it does not upgrade the rule outcome.`,
  };
}
