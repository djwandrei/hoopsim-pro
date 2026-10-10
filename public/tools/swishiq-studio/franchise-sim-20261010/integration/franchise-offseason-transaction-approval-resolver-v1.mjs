import { resolveTransactionProposalDecisionV1 } from './transaction-proposal-decision-v1.mjs';

/**
 * Build the engine-owned resolver callback expected by
 * resolveFranchiseOffseasonApprovalV1. Counter terms are supplied as
 * context.counterChanges; the CBA rule engine is fixed when the resolver is
 * created so saved approvals cannot replace it at decision time.
 */
export function createFranchiseOffseasonTransactionApprovalResolverV1({ ruleEngine = null } = {}) {
  return function resolveFranchiseOffseasonTransactionApproval(state, savedPending, decision, context = null) {
    const result = resolveTransactionProposalDecisionV1({
      state,
      pendingProposal: savedPending,
      decision,
      counterChanges: context?.counterChanges ?? null,
      ruleEngine,
    });
    return {
      status: result.status,
      state: result.state,
      pendingProposal: result.pendingProposal ?? null,
      evaluation: result.evaluation ?? null,
      receipt: result.receipt ?? null,
      decisionReceipt: result.decisionReceipt ?? result.receipt ?? null,
      stale: result.stale ?? null,
    };
  };
}
