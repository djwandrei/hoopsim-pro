import { sha256HexV1 } from './sha256-isomorphic-v1.mjs';

const FORMAT = 'djhc-free-agent-market-decision-receipt-v1';
const clone = value => value === undefined ? undefined : structuredClone(value);

function serializable(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return typeof value === 'number' && !Number.isFinite(value) ? null : value;
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : serializable(item));
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
    .map(([key, item]) => [key, serializable(item)]));
}

function preferenceBasisFor(choice) {
  const row = choice?.alternatives?.find(item => item.teamCode !== null && item.teamCode !== undefined)
    ?? choice?.alternatives?.[0];
  return row?.components?.preferenceConfidence ?? (choice?.status === 'preference-input-supplied'
    ? 'user-supplied' : choice?.status === 'provisional-uncertain-preference-estimate'
      ? 'uncertain-source-estimate' : 'unknown-neutral');
}

/**
 * Create an integrity-checked record of one player-choice decision. This is a
 * deterministic simulator receipt, not evidence of actual player intent.
 */
export function createFreeAgentMarketDecisionReceiptV1({
  stateRevision,
  resultingStateRevision = null,
  seasonStartYear,
  transactionWindow,
  player,
  eligibleOffers = [],
  assessedOffers = [],
  choiceOptions = {},
  choice,
  selectedOffer = null,
  selectedEligibleOfferIndex = null,
  selectedInputOfferIndex = null,
  proposal = null,
  evaluation = null,
  decisionStatus,
} = {}) {
  if (!Number.isInteger(stateRevision) || stateRevision < 0) throw new Error('Free-agent decision receipt requires a nonnegative input revision.');
  if (!Number.isInteger(seasonStartYear) || !Number.isInteger(choice?.fixedSeed)) throw new Error('Free-agent decision receipt requires a season and fixed seed.');
  if (!Array.isArray(eligibleOffers)) throw new Error('Free-agent decision receipt eligibleOffers must be an array.');
  if (!Array.isArray(assessedOffers)) throw new Error('Free-agent decision receipt assessedOffers must be an array.');
  if (!['committed', 'awaiting-user-approval', 'selected-not-committed', 'player-remains-free-agent'].includes(decisionStatus)) {
    throw new Error('Free-agent decision receipt has an unsupported decision status.');
  }
  if (decisionStatus === 'committed' && (!proposal || !Number.isInteger(resultingStateRevision) || resultingStateRevision <= stateRevision)) {
    throw new Error('Committed free-agent decision receipt requires its proposal and resulting revision.');
  }
  if (proposal && proposal.expectedStateRevision !== stateRevision) {
    throw new Error('Free-agent decision receipt proposal must target the exact input revision.');
  }
  if (selectedOffer && (!Number.isInteger(selectedEligibleOfferIndex) || selectedEligibleOfferIndex < 0 ||
      selectedEligibleOfferIndex >= eligibleOffers.length || !Number.isInteger(selectedInputOfferIndex) || selectedInputOfferIndex < 0)) {
    throw new Error('Selected free-agent offer receipt requires valid choice and input indices.');
  }
  if (decisionStatus === 'player-remains-free-agent' && (proposal || selectedOffer)) {
    throw new Error('A player-remains-free-agent receipt cannot include a selected offer or transaction proposal.');
  }
  if (decisionStatus !== 'committed' && resultingStateRevision !== null) {
    throw new Error('Uncommitted free-agent decision receipt cannot claim a resulting revision.');
  }

  const preferenceInputs = serializable({
    explicitPreferences: clone(player?.explicitPreferences ?? null),
    preferenceEstimates: clone(player?.preferenceEstimates ?? null),
    preferenceSourceRefs: clone(player?.preferenceSourceRefs ?? null),
  });
  const playerWeights = choice?.alternatives?.find(item => item.teamCode !== null && item.teamCode !== undefined)
    ?.components?.normalizedWeights ?? null;
  const choiceInputs = serializable({
    canonicalName: player?.canonicalName ?? player?.name ?? null,
    preferenceInputs,
    eligibleOffers: clone(eligibleOffers),
    offerScreening: assessedOffers.map(row => ({
      offerIndex: row.offerIndex,
      eligible: row.eligible === true,
      offer: clone(row.offer),
      compensationStatus: row.compensation?.status ?? null,
      transactionStatus: row.evaluation?.status ?? null,
      userApprovalRequired: row.evaluation?.userApprovalRequired ?? false,
      approvalReceived: row.evaluation?.approvalReceived ?? false,
      ruleVersionId: row.evaluation?.ruleVersionId ?? row.evaluation?.legality?.ruleVersionId ?? null,
      missingInputs: clone(row.evaluation?.missingInputs ?? []),
      blockedReasons: clone(row.evaluation?.blockedReasons ?? []),
    })),
    parameters: {
      fixedSeed: choice.fixedSeed,
      effectiveDrawSeed: choice.fixedSeed || 1,
      temperature: choiceOptions.temperature ?? 0.08,
      salaryCapUsd: choiceOptions.salaryCapUsd ?? null,
      includeOutsideOption: choiceOptions.includeOutsideOption !== false,
      outsideOptionUtility: choiceOptions.outsideOptionUtility ?? null,
      discountRate: choiceOptions.discountRate ?? 0.05,
      effectiveOutsideOptionUtility: choice?.alternatives?.find(item => item.components?.outsideOption)?.expectedUtility ?? null,
    },
  });
  const selectedOfferValue = serializable(clone(selectedOffer));
  const proposalValue = serializable(clone(proposal));
  const evaluationSummary = serializable(evaluation ? {
    status: evaluation.status ?? null,
    executionStatus: evaluation.executionStatus ?? null,
    userApprovalRequired: evaluation.userApprovalRequired ?? false,
    approvalReceived: evaluation.approvalReceived ?? false,
    ruleVersionId: evaluation.ruleVersionId ?? evaluation.legality?.ruleVersionId ?? null,
    missingInputs: evaluation.missingInputs ?? [],
    blockedReasons: evaluation.blockedReasons ?? [],
  } : null);
  const base = serializable({
    format: FORMAT,
    schemaVersion: '1.0.0',
    decisionStatus,
    stateRevision,
    resultingStateRevision,
    seasonStartYear,
    transactionWindow: transactionWindow ?? null,
    canonicalName: player?.canonicalName ?? player?.name ?? null,
    fixedSeed: choice.fixedSeed,
    policyPreferenceBasis: {
      playerChoicePolicyVersion: 'djhc-free-agent-choice-v1',
      normalizedPlayerUtilityWeights: clone(playerWeights),
      preferenceBasis: preferenceBasisFor(choice),
      teamStrategyProfilesByTeam: Object.fromEntries(eligibleOffers.map(offer => [String(offer.teamCode ?? '').toUpperCase(),
        offer.teamTargeting?.strategyProfile ?? null])),
      pricingPolicyByTeam: Object.fromEntries(eligibleOffers.map(offer => [String(offer.teamCode ?? '').toUpperCase(),
        clone(offer.pricing ?? null)])),
    },
    choiceInputs,
    choiceInputsSha256: sha256HexV1(choiceInputs),
    choiceResult: clone(choice),
    selectedEligibleOfferIndex,
    selectedInputOfferIndex,
    selectedOffer: selectedOfferValue,
    selectedOfferSha256: selectedOfferValue === null ? null : sha256HexV1(selectedOfferValue),
    transactionProposal: proposalValue,
    transactionProposalSha256: proposalValue === null ? null : sha256HexV1(proposalValue),
    transactionEvaluation: evaluationSummary,
    disclosure: 'This receipt records a simulated free-agent choice and its transaction handoff. Preference inputs and utility weights are simulation inputs, not evidence of actual player intent or calibrated policy. Transaction status and revision reflect separate rules evaluation and any required user approval.',
  });
  const decisionId = `fa-decision-v1-${sha256HexV1(base).slice(0, 24)}`;
  const receiptPayload = { ...base, decisionId };
  return { ...receiptPayload, receiptSha256: sha256HexV1(receiptPayload) };
}

/** Validate the receipt hash and its deterministic decision identifier. */
export function verifyFreeAgentMarketDecisionReceiptV1(receipt) {
  if (receipt?.format !== FORMAT || receipt.schemaVersion !== '1.0.0') return { status: 'unsupported-receipt' };
  if (typeof receipt.receiptSha256 !== 'string' || typeof receipt.decisionId !== 'string') return { status: 'missing-integrity-fields' };
  const { receiptSha256, decisionId, ...base } = serializable(receipt);
  const expectedDecisionId = `fa-decision-v1-${sha256HexV1(base).slice(0, 24)}`;
  if (decisionId !== expectedDecisionId) return { status: 'decision-id-mismatch', expectedDecisionId };
  const expectedSha256 = sha256HexV1({ ...base, decisionId });
  if (receiptSha256 !== expectedSha256) return { status: 'receipt-hash-mismatch', expectedSha256 };
  if (receipt.choiceInputsSha256 !== sha256HexV1(receipt.choiceInputs) ||
      (receipt.selectedOffer === null ? receipt.selectedOfferSha256 !== null
        : receipt.selectedOfferSha256 !== sha256HexV1(receipt.selectedOffer)) ||
      (receipt.transactionProposal === null ? receipt.transactionProposalSha256 !== null
        : receipt.transactionProposalSha256 !== sha256HexV1(receipt.transactionProposal))) {
    return { status: 'bound-payload-hash-mismatch' };
  }
  if (receipt.transactionProposal && receipt.transactionProposal.expectedStateRevision !== receipt.stateRevision) {
    return { status: 'proposal-revision-mismatch' };
  }
  if (receipt.decisionStatus === 'committed' && (!Number.isInteger(receipt.resultingStateRevision) ||
      receipt.resultingStateRevision <= receipt.stateRevision || !receipt.transactionProposal) ||
      receipt.decisionStatus !== 'committed' && receipt.resultingStateRevision !== null) {
    return { status: 'decision-revision-mismatch' };
  }
  return { status: 'pass', decisionId, receiptSha256 };
}
