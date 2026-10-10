import {
  applyTransaction,
  approveTransactionProposal,
  createTransactionCounterProposal,
  evaluateTransaction,
} from '../lib/transaction-engine-v1.mjs';
import { validateLeagueState } from '../lib/simulation-contracts-v1.mjs';
import { sha256HexV1, stableStringifyV1 } from '../lib/sha256-isomorphic-v1.mjs';

export const TRANSACTION_PROPOSAL_DECISION_V1_FORMAT = 'djhc-transaction-proposal-decision-v1';

const clone = value => structuredClone(value);
const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const TRANSACTION_PROPOSAL_FORMAT = 'djhc-transaction-proposal-v1';

function pendingProposalParts(pendingProposal) {
  if (pendingProposal?.format === TRANSACTION_PROPOSAL_FORMAT) {
    return { proposal: pendingProposal, savedStateRevision: pendingProposal.expectedStateRevision };
  }
  if (isPlainObject(pendingProposal) && pendingProposal.proposal?.format === TRANSACTION_PROPOSAL_FORMAT) {
    return {
      proposal: pendingProposal.proposal,
      savedStateRevision: pendingProposal.stateRevision ?? pendingProposal.expectedStateRevision ??
        pendingProposal.proposal.expectedStateRevision,
    };
  }
  throw new Error('A versioned pending TransactionProposal is required.');
}

function decisionReceipt({ decision, proposal, counterProposal = null, state, status, evaluation = null }) {
  const receipt = {
    format: TRANSACTION_PROPOSAL_DECISION_V1_FORMAT,
    decision,
    proposalId: proposal.proposalId,
    counterProposalId: counterProposal?.proposalId ?? null,
    sourceSeasonStartYear: state.seasonStartYear,
    targetSeasonStartYear: state.seasonStartYear,
    revisionBefore: state.revision,
    revisionAfter: evaluation?.resultingRevision ?? state.revision,
    status,
    legalityOutcome: evaluation?.legalityOutcome ?? null,
    evidenceBasis: evaluation?.evidenceBasis ?? null,
    rosterTransitionReceiptSha256: evaluation?.rosterTransitionReceipt?.receiptSha256 ?? null,
    proposalSha256: sha256HexV1(stableStringifyV1(proposal)),
    counterProposalSha256: counterProposal ? sha256HexV1(stableStringifyV1(counterProposal)) : null,
  };
  receipt.receiptSha256 = sha256HexV1(stableStringifyV1(receipt));
  return Object.freeze(receipt);
}

function staleResult(state, proposal, decision, expectedStateRevision, reason) {
  const receipt = decisionReceipt({ decision, proposal, state, status: 'stale' });
  return {
    status: 'stale',
    state,
    pendingProposal: null,
    evaluation: null,
    receipt,
    stale: { expectedStateRevision, actualStateRevision: state.revision, reason },
  };
}

function sanitizedCounterChanges(changes, proposal) {
  if (!isPlainObject(changes) || Object.keys(changes).length === 0) {
    throw new Error('Counter decision requires explicit nonempty counterChanges.');
  }
  const immutableFields = ['kind', 'seasonStartYear', 'transactionWindow', 'actor', 'userControlledTeamCodes'];
  for (const field of immutableFields) {
    if (!Object.hasOwn(changes, field)) continue;
    const supplied = JSON.stringify(changes[field]);
    const current = JSON.stringify(proposal[field]);
    if (supplied !== current) throw new Error(`A counter may not change proposal ${field}.`);
  }
  const safeChanges = clone(changes);
  for (const field of ['proposalId', 'expectedStateRevision', 'approvedByUser', 'userApproval', 'format', 'schemaVersion',
    ...immutableFields]) delete safeChanges[field];
  if (Object.keys(safeChanges).length === 0) throw new Error('Counter decision requires explicit changed transaction terms.');
  return safeChanges;
}

/**
 * Resolve a saved transaction proposal using the existing transaction engine.
 * Reject and counter decisions return the exact input LeagueState. Approval
 * binds a fresh user-approval receipt to the current revision before commit.
 */
export function resolveTransactionProposalDecisionV1({
  state,
  pendingProposal,
  decision,
  counterChanges = null,
  ruleEngine = null,
} = {}) {
  validateLeagueState(state);
  if (!['approve', 'reject', 'counter'].includes(decision)) {
    throw new Error('Transaction proposal decision must be approve, reject, or counter.');
  }
  const { proposal, savedStateRevision } = pendingProposalParts(pendingProposal);
  if (!Number.isSafeInteger(savedStateRevision) || savedStateRevision !== state.revision) {
    return staleResult(state, proposal, decision, savedStateRevision, 'Saved proposal revision does not match current LeagueState.');
  }
  if (!Number.isSafeInteger(proposal.expectedStateRevision) || proposal.expectedStateRevision !== state.revision) {
    return staleResult(state, proposal, decision, proposal.expectedStateRevision,
      'TransactionProposal expectedStateRevision does not match current LeagueState.');
  }

  if (decision === 'reject') {
    const receipt = decisionReceipt({ decision, proposal, state, status: 'rejected' });
    return { status: 'rejected', state, pendingProposal: null, evaluation: null, receipt };
  }

  if (decision === 'counter') {
    const safeChanges = sanitizedCounterChanges(counterChanges, proposal);
    const counterProposal = createTransactionCounterProposal(state, proposal, safeChanges);
    if (counterProposal.proposalId === proposal.proposalId) {
      throw new Error('Counter changes do not produce a distinct TransactionProposal.');
    }
    const evaluation = evaluateTransaction(state, counterProposal, { ruleEngine });
    const receipt = decisionReceipt({ decision, proposal, counterProposal, state, status: 'countered', evaluation });
    return { status: 'countered', state, pendingProposal: counterProposal, evaluation, receipt };
  }

  const approvedProposal = approveTransactionProposal(state, proposal);
  try {
    const committed = applyTransaction(state, approvedProposal, { ruleEngine });
    const receipt = decisionReceipt({ decision, proposal: approvedProposal, state, status: 'committed',
      evaluation: committed.evaluation });
    return {
      status: 'committed',
      state: committed.state,
      pendingProposal: null,
      evaluation: committed.evaluation,
      receipt: committed.evaluation.rosterTransitionReceipt,
      decisionReceipt: receipt,
    };
  } catch (error) {
    if (!error?.evaluation) throw error;
    const evaluation = error.evaluation;
    const status = evaluation.status === 'illegal' ? 'illegal' : 'blocked';
    const receipt = decisionReceipt({ decision, proposal: approvedProposal, state, status, evaluation });
    return {
      status,
      state,
      pendingProposal: status === 'blocked' ? proposal : null,
      evaluation,
      receipt,
    };
  }
}
