import { createTransactionProposal, evaluateTransaction, applyTransaction, approveTransactionProposal } from './transaction-engine-v1.mjs';
import { resolvePlayerByCanonicalName } from './simulation-contracts-v1.mjs';
import { createFreeAgentMarketDecisionReceiptV1 } from './free-agent-market-decision-receipt-v1.mjs';

const BAD_INPUT_STATUS = /unknown|candidate|conflict|unresolved|unreported|missing|disputed|invalid/i;
function unusableInput(value) {
  return [value?.valueStatus, value?.status].some(status => BAD_INPUT_STATUS.test(String(status ?? '')));
}

function finite(value) {
  const raw = value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value;
  if (raw === null || raw === undefined || typeof raw === 'string' && !raw.trim() || typeof raw === 'boolean' || unusableInput(value)) return null;
  const number = Number(raw); return Number.isFinite(number) ? number : null;
}

function offerSeasons(offer) {
  const supplied = offer.contractSeasons ?? (Array.isArray(offer.contractTerms) ? offer.contractTerms : offer.contractTerms?.seasons);
  return supplied ?? (offer.contractTerms ? [offer.contractTerms] : []);
}

/** Incentive and signing-bonus valuation is a separate, unimplemented branch.
 * Do not let explicitly unsupported compensation compete as if it were zero. */
export function evaluateFreeAgentOfferCompensation(offer) {
  const unsupportedInputs = [];
  const bonusFields = ['likelyBonus', 'unlikelyBonus', 'signingBonus', 'signingBonusUsd', 'bonuses', 'incentives'];
  const records = [{ path: 'offer', value: offer }, ...offerSeasons(offer).map((value, index) => ({ path: `contractSeasons[${index}]`, value }))];
  for (const { path, value } of records) for (const field of bonusFields) {
    if (!Object.hasOwn(value, field)) continue;
    const supplied = value[field];
    if (Array.isArray(supplied) && !supplied.length) continue;
    const amount = finite(supplied);
    if (amount !== 0) unsupportedInputs.push({ path: `${path}.${field}`, value: structuredClone(supplied),
      reason: amount === null ? 'Explicit bonus compensation is unresolved.' : 'Nonzero bonus compensation needs a separate player valuation model.' });
  }
  return { format: 'djhc-free-agent-compensation-readiness-v1',
    status: unsupportedInputs.length ? 'unsupported' : 'base-compensation-path', unsupportedInputs,
    disclosure: 'This choice path values base salary and protected cash. Incentives and signing bonuses require separate valuation; absent bonus fields do not establish complete contract coverage.' };
}

function termAmount(term, field) {
  return unusableInput(term) || unusableInput(term[field]) ? null : finite(term[field]);
}

function stableChoiceValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableChoiceValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${key}:${stableChoiceValue(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function seededRandom(seed = 1) {
  let state = (Number(seed) >>> 0) || 1;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

export const FREE_AGENT_PLAYER_WEIGHTS = Object.freeze({ salary: 0.32, guarantees: 0.22, role: 0.18, winning: 0.14, fit: 0.08, flexibility: 0.04, affinity: 0.02 });
const clamp = value => Math.max(0, Math.min(1, value));

function preferenceBasis(player) {
  const explicit = player.explicitPreferences;
  const hasInputs = explicit && Object.keys(explicit).some(key => key !== 'source' && key !== 'sourceStatus' && key !== 'sourceClass');
  const hasUnusableSourceStatus = [explicit?.sourceClass, explicit?.sourceStatus]
    .some(status => status !== undefined && status !== null && BAD_INPUT_STATUS.test(String(status).trim()));
  if (hasInputs && hasUnusableSourceStatus) return 'uncertain-source-estimate';
  if (hasInputs && !['simulation-assumption', 'generated-scenario'].includes(explicit.sourceClass ?? explicit.sourceStatus)) return 'user-supplied';
  if (hasInputs) return 'configured-simulation-assumption';
  return player.preferenceEstimates && Object.keys(player.preferenceEstimates).length ? 'uncertain-source-estimate' : 'unknown-neutral';
}

function preferencesFor(player) {
  return ['user-supplied', 'configured-simulation-assumption'].includes(preferenceBasis(player)) ? player.explicitPreferences : player.preferenceEstimates ?? {};
}

function playerWeights(preferences) {
  const aliases = { salary: 'salaryWeight', guarantees: 'guaranteeWeight', role: 'roleWeight', winning: 'winningWeight', fit: 'rosterNeedWeight', flexibility: 'flexibilityWeight', affinity: 'affinityWeight' };
  const weights = Object.fromEntries(Object.keys(FREE_AGENT_PLAYER_WEIGHTS).map(key => {
    const supplied = preferences.weights?.[key] ?? preferences[aliases[key]];
    const value = supplied === undefined ? FREE_AGENT_PLAYER_WEIGHTS[key] : finite(supplied);
    if (value === null || value < 0) throw new Error(`Player preference weight ${key} must be nonnegative and finite.`);
    return [key, value];
  }));
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (!total) throw new Error('Player preferences require a positive weight.');
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / total]));
}

function offerUtility(offer, player, { salaryCapUsd = null, preferences = {}, weights, discountRate = 0.05 } = {}) {
  const seasons = offerSeasons(offer);
  const salaryValues = seasons.map(term => termAmount(term, 'salary'));
  const guaranteeValues = seasons.map(term => termAmount(term, 'guaranteedCash'));
  const salary = salaryValues.length && salaryValues.every(value => value !== null) ? salaryValues.reduce((sum, value) => sum + value, 0) / seasons.length : null;
  const guarantee = guaranteeValues.length && guaranteeValues.every(value => value !== null) ? guaranteeValues.reduce((sum, value) => sum + value, 0) / seasons.length : null;
  const projectedMinutes = finite(offer.projectedMinutes);
  const projectedWins = finite(offer.teamProjectedWins);
  const rosterNeed = finite(offer.rosterNeed);
  const preferenceConfidence = preferenceBasis(player);
  const cap = finite(offer.salaryCapUsd ?? salaryCapUsd);
  let optionUnknown = false;
  const securedCash = seasons.map((term, index) => {
    const teamOption = term.teamOption && typeof term.teamOption === 'object' ? term.teamOption.value : term.teamOption;
    const playerOption = term.playerOption && typeof term.playerOption === 'object' ? term.playerOption.value : term.playerOption;
    if (typeof teamOption !== 'boolean' || typeof playerOption !== 'boolean' || unusableInput(term) || unusableInput(term.teamOption) || unusableInput(term.playerOption)) optionUnknown = true;
    // A team-controlled unexercised option is contingent, even when cash is
    // fully protected if that option is later exercised.
    return teamOption === true && term.optionDecisionStatus !== 'exercised' ? 0 : guaranteeValues[index];
  });
  const securedPresentValue = seasons.length && !optionUnknown && securedCash.every(value => value !== null) ? securedCash.reduce((sum, value, index) => sum + value / (1 + discountRate) ** index, 0) : null;
  const hasPlayerOption = seasons.some(term => (term.playerOption?.value ?? term.playerOption) === true);
  const roleFit = finite(offer.playerRoleFit);
  const affinity = finite(preferences.teamAffinities?.[String(offer.teamCode).toUpperCase()]);
  const scheduledGames = finite(offer.teamScheduledGames) ?? 82;
  if (projectedMinutes !== null && (projectedMinutes < 0 || projectedMinutes > 48)) throw new Error('Projected minutes per game must be between zero and 48.');
  if (!(scheduledGames > 0) || projectedWins !== null && (projectedWins < 0 || projectedWins > scheduledGames)) throw new Error('Projected team wins must be within the supplied schedule.');
  if (roleFit !== null && (roleFit < 0 || roleFit > 1) || rosterNeed !== null && (rosterNeed < 0 || rosterNeed > 1) ||
      affinity !== null && (affinity < 0 || affinity > 1)) throw new Error('Player role fit, roster need, and explicit team affinity must be normalized from zero to one.');
  const fit = roleFit ?? rosterNeed;
  const normalizedComponents = {
    salary: salary === null || !(cap > 0) ? null : clamp(salary / (cap * 0.35)),
    guarantees: securedPresentValue === null || !(cap > 0) ? null : clamp(securedPresentValue / (cap * 0.35 * 4)),
    role: projectedMinutes === null ? null : clamp(projectedMinutes / 36),
    winning: projectedWins === null ? null : clamp(projectedWins / scheduledGames),
    fit: fit === null ? null : clamp(fit),
    flexibility: !seasons.length || optionUnknown ? null : hasPlayerOption ? 1 : 1 / seasons.length,
    affinity: affinity === null ? null : clamp(affinity),
  };
  const utility = Object.entries(weights).reduce((sum, [key, weight]) => sum + weight * (normalizedComponents[key] ?? 0), 0);
  const missing = [];
  if (salary === null) missing.push('salary');
  if (guarantee === null) missing.push('guaranteedCash');
  if (projectedMinutes === null) missing.push('projectedMinutes');
  if (projectedWins === null) missing.push('teamProjectedWins');
  if (!(cap > 0)) missing.push('salaryCapUsd');
  if (optionUnknown) missing.push('optionTerms');
  if (fit === null) missing.push('playerRoleFit or rosterNeed');
  if (preferenceConfidence === 'unknown-neutral') missing.push('playerPreferences');
  const unknownWeight = Object.entries(weights).reduce((sum, [key, weight]) => sum + (normalizedComponents[key] === null ? weight : 0), 0);
  const uncertainty = unknownWeight + (preferenceConfidence === 'unknown-neutral' ? 0.15 : preferenceConfidence === 'uncertain-source-estimate' ? 0.1 : 0);
  return {
    teamCode: offer.teamCode,
    expectedUtility: utility,
    estimateBasis: 'known-component-lower-bound',
    interval: [Math.max(0, utility - uncertainty), Math.min(1, utility + uncertainty)],
    offerId: offer.offerId ?? null,
    components: { salary, guarantee, contractYears: seasons.length, totalSalary: salary === null ? null : salary * seasons.length,
      totalGuarantees: guarantee === null ? null : guarantee * seasons.length, securedPresentValue, projectedMinutes, projectedWins, rosterNeed, preferenceConfidence,
      normalizedComponents, normalizedWeights: weights, knownWeightCoverage: 1 - unknownWeight, hasPlayerOption,
      optionCashDisclosure: 'Face-value total includes option years. Secured present value excludes unexercised team options; a protected player option is exercisable by the player. No exercise probability is inferred.' },
    missing,
    sourceRefs: [...(offer.sourceRefs ?? []), ...(player.preferenceSourceRefs ?? [])],
  };
}

/** Player choice is explicit if preferences are supplied; otherwise it is an uncertain simulation input. */
export function evaluateFreeAgentOffers(player, offers, { seed = 1, temperature = 0.08, salaryCapUsd = null,
  includeOutsideOption = true, outsideOptionUtility = null, discountRate = 0.05 } = {}) {
  const preferences = preferencesFor(player), weights = playerWeights(preferences);
  if (!(finite(temperature) > 0) || finite(discountRate) === null || discountRate < 0) throw new Error('Choice temperature must be positive and discount rate nonnegative.');
  const deduplicated = new Map(), duplicateInputOfferIndices = [], excludedOffers = [];
  (offers ?? []).forEach((offer, offerIndex) => {
    const compensation = evaluateFreeAgentOfferCompensation(offer);
    if (compensation.status === 'unsupported') { excludedOffers.push({ offerIndex, teamCode: offer.teamCode,
      offerId: offer.offerId ?? null, reason: 'unsupported-compensation', compensation }); return; }
    const key = stableChoiceValue({ teamCode: String(offer.teamCode ?? '').toUpperCase(), seasons: offerSeasons(offer),
      projectedMinutes: offer.projectedMinutes ?? null, teamProjectedWins: offer.teamProjectedWins ?? null,
      teamScheduledGames: offer.teamScheduledGames ?? 82, playerRoleFit: offer.playerRoleFit ?? null,
      rosterNeed: offer.rosterNeed ?? null, salaryCapUsd: offer.salaryCapUsd ?? salaryCapUsd });
    if (deduplicated.has(key)) duplicateInputOfferIndices.push(offerIndex);
    else deduplicated.set(key, { offer, offerIndex });
  });
  const alternativesByTeam = new Map(), supersededInputOfferIndices = [];
  for (const { offer, offerIndex } of deduplicated.values()) {
    const alternative = { ...offerUtility(offer, player, { salaryCapUsd, preferences, weights, discountRate }), offerIndex };
    const teamKey = String(offer.teamCode ?? '').toUpperCase();
    if (!teamKey) throw new Error('A free-agent offer requires a team code.');
    const current = alternativesByTeam.get(teamKey);
    // A team cannot increase its choice share by supplying a menu of weaker
    // contracts. Use the player's best expected-utility option for that team.
    if (!current || alternative.expectedUtility > current.expectedUtility) {
      if (current) supersededInputOfferIndices.push(current.offerIndex);
      alternativesByTeam.set(teamKey, alternative);
    } else supersededInputOfferIndices.push(offerIndex);
  }
  const alternatives = [...alternativesByTeam.values()];
  if (includeOutsideOption) {
    const reservation = finite(outsideOptionUtility ?? preferences.reservationUtility ?? 0);
    if (reservation === null || reservation < 0 || reservation > 1) throw new Error('Outside-option utility must be between zero and one.');
    alternatives.push({ teamCode: null, offerId: null, offerIndex: null, expectedUtility: reservation, interval: [reservation, reservation],
      components: { outsideOption: true, preferenceConfidence: 'simulation-assumption' }, missing: [], sourceRefs: [] });
  }
  if (!alternatives.length && excludedOffers.length) return { format: 'djhc-free-agent-choice-v1',
    canonicalName: player.canonicalName ?? player.name, status: 'unresolved-compensation', selectedTeamCode: null,
    selectedOfferIndex: null, selectedOfferId: null, selectionProbability: null, fixedSeed: Number(seed) >>> 0,
    duplicateInputOfferIndices, supersededInputOfferIndices, excludedOffers, alternatives: [], disclosure: 'No offer has supported player-compensation valuation.' };
  if (!alternatives.length) throw new Error('At least one free-agent offer or outside option is required.');
  const scale = Number(temperature);
  const maxUtility = Math.max(...alternatives.map(row => row.expectedUtility));
  const choiceWeights = alternatives.map(row => Math.exp((row.expectedUtility - maxUtility) / scale));
  const totalWeight = choiceWeights.reduce((sum, value) => sum + value, 0);
  alternatives.forEach((row, index) => { row.choiceProbability = choiceWeights[index] / totalWeight; });
  const random = seededRandom(seed);
  let draw = random();
  let selected = alternatives.at(-1);
  for (const row of alternatives) { draw -= row.choiceProbability; if (draw <= 0) { selected = row; break; } }
  const explicit = preferenceBasis(player) === 'user-supplied';
  return {
    format: 'djhc-free-agent-choice-v1',
    canonicalName: player.canonicalName ?? player.name,
    status: selected.offerIndex === null ? 'remains-free-agent' : explicit ? 'preference-input-supplied' : 'provisional-uncertain-preference-estimate',
    selectedTeamCode: selected.teamCode,
    selectedOfferIndex: selected.offerIndex,
    selectedOfferId: selected.offerId,
    selectionProbability: selected.choiceProbability,
    fixedSeed: Number(seed) >>> 0,
    duplicateInputOfferIndices,
    supersededInputOfferIndices,
    excludedOffers,
    alternatives: alternatives.sort((a, b) => b.choiceProbability - a.choiceProbability),
    disclosure: explicit ? 'Choice uses explicitly supplied preferences and offer inputs.' : 'Player preference inputs are not evidenced; this seeded choice is a simulation assumption, not a claim about the player’s real preferences.',
  };
}

/** Only executable rule paths enter the player-choice pool. User-team offers
 * may be selected, but committing them still requires explicit user approval. */
export function resolveFreeAgentMarket(state, canonicalName, offers, {
  ruleEngine = null, seed = 1, temperature = 0.08, commitCpu = true, includeOutsideOption = true, outsideOptionUtility = null,
} = {}) {
  const resolution = resolvePlayerByCanonicalName(state.players, canonicalName);
  if (resolution.status !== 'resolved') throw new Error(`Free agent ${canonicalName} is ${resolution.status}.`);
  const player = resolution.matches[0];
  if (player.teamCode || player.retired === true || player.rosterStatus === 'retired') throw new Error('Free-agent market requires an active unattached player.');
  const assessed = (offers ?? []).map((offer, offerIndex) => {
    const proposal = createFreeAgencyProposal({ state, player, offer, userControlledTeamCodes: state.userControlledTeamCodes });
    return { offerIndex, offer, proposal, compensation: evaluateFreeAgentOfferCompensation(offer),
      evaluation: evaluateFreeAgencySigning(state, proposal, { ruleEngine }) };
  });
  const eligible = assessed.filter(row => row.compensation.status !== 'unsupported' && (row.evaluation.status === 'confirmed-legal' ||
    (row.evaluation.status === 'provisional' && state.mode === 'provisional-sandbox')));
  if (!eligible.length) return { format: 'djhc-free-agent-market-result-v1', status: 'no-executable-offer', state: structuredClone(state), choice: null, assessed };
  const choice = evaluateFreeAgentOffers(player, eligible.map(row => row.offer), { seed, temperature,
    salaryCapUsd: state.rulesReference?.thresholds?.salaryCap, includeOutsideOption, outsideOptionUtility });
  const receiptInputs = { stateRevision: state.revision, seasonStartYear: state.seasonStartYear,
    transactionWindow: state.transactionWindow, player, eligibleOffers: eligible.map(row => row.offer),
    assessedOffers: assessed.map(row => ({ ...row, eligible: eligible.includes(row) })),
    choiceOptions: { temperature, salaryCapUsd: state.rulesReference?.thresholds?.salaryCap ?? null,
      includeOutsideOption, outsideOptionUtility, discountRate: 0.05 }, choice };
  if (choice.selectedOfferIndex === null) {
    const decisionReceipt = createFreeAgentMarketDecisionReceiptV1({ ...receiptInputs, decisionStatus: 'player-remains-free-agent' });
    return { format: 'djhc-free-agent-market-result-v1', status: 'player-remains-free-agent',
      state: structuredClone(state), choice, assessed, decisionReceipt };
  }
  const selected = eligible[choice.selectedOfferIndex];
  const pendingApproval = selected.evaluation.userApprovalRequired && !selected.evaluation.approvalReceived;
  if (pendingApproval || !commitCpu) {
    const decisionStatus = pendingApproval ? 'awaiting-user-approval' : 'selected-not-committed';
    const decisionReceipt = createFreeAgentMarketDecisionReceiptV1({ ...receiptInputs, decisionStatus,
      selectedOffer: selected.offer, selectedEligibleOfferIndex: choice.selectedOfferIndex,
      selectedInputOfferIndex: selected.offerIndex, proposal: selected.proposal, evaluation: selected.evaluation });
    return { format: 'djhc-free-agent-market-result-v1', status: decisionStatus,
      state: structuredClone(state), choice, proposal: selected.proposal, evaluation: selected.evaluation,
      selectedInputOfferIndex: selected.offerIndex, assessed, decisionReceipt };
  }
  const applied = applyTransaction(state, selected.proposal, { ruleEngine });
  const decisionReceipt = createFreeAgentMarketDecisionReceiptV1({ ...receiptInputs, decisionStatus: 'committed',
    resultingStateRevision: applied.state.revision, selectedOffer: selected.offer,
    selectedEligibleOfferIndex: choice.selectedOfferIndex, selectedInputOfferIndex: selected.offerIndex,
    proposal: selected.proposal, evaluation: applied.evaluation });
  const ledgerEntry = applied.state.transactionLedger.at(-1);
  if (!ledgerEntry || ledgerEntry.proposalId !== selected.proposal.proposalId) {
    throw new Error('Committed free-agent transaction is missing its matching ledger entry.');
  }
  ledgerEntry.freeAgentMarketDecisionReceipt = decisionReceipt;
  return { format: 'djhc-free-agent-market-result-v1', status: 'committed', ...applied, choice,
    proposal: selected.proposal, selectedInputOfferIndex: selected.offerIndex, assessed, decisionReceipt };
}

export function createFreeAgencyProposal({ state, player, offer, userControlledTeamCodes = [], proposalId = null } = {}) {
  const seasons = offerSeasons(offer);
  if (!seasons.length) throw new Error('Free-agent offer requires year-by-year contract terms.');
  return createTransactionProposal({
    proposalId: proposalId ?? undefined,
    kind: 'free-agent-signing',
    seasonStartYear: state.seasonStartYear,
    transactionWindow: state.transactionWindow,
    actor: userControlledTeamCodes.includes(String(offer.teamCode).toUpperCase()) ? 'user' : 'cpu',
    userControlledTeamCodes,
    legs: [{ assetType: 'player', canonicalName: player.canonicalName ?? player.name, fromTeamCode: null, toTeamCode: offer.teamCode, action: 'sign' }],
    contractSeasons: seasons,
    contractScaleInput: offer.contractScaleInput ?? null,
    signingMechanism: offer.signingMechanism ?? null,
    signingRuleInput: offer.signingRuleInput ?? null,
    signingRoleProjection: finite(offer.projectedMinutes) === null ? null : {
      seasonStartYear: state.seasonStartYear, projectedMinutes: finite(offer.projectedMinutes),
      playerRoleFit: finite(offer.playerRoleFit), teamProjectedWins: finite(offer.teamProjectedWins),
      projectedMinutesByPosition: structuredClone(offer.projectedMinutesByPosition ?? null),
      disclosure: 'Supplied or generated conditional role estimate, not confirmed future availability or minutes.' },
    expectedStateRevision: state.revision,
    approvedByUser: Boolean(offer.userApproval),
    userApproval: offer.userApproval ?? null,
    assumptions: [...(offer.assumptions ?? [])],
    sourceRefs: [...(offer.sourceRefs ?? [])],
    fixedSeed: offer.fixedSeed ?? null,
  });
}

/** Separate explicit action; later changes to any offered term invalidate it. */
export function approveFreeAgentOffer(state, player, offer) {
  const proposal = approveTransactionProposal(state, createFreeAgencyProposal({ state, player, offer,
    userControlledTeamCodes: state.userControlledTeamCodes }));
  return { ...structuredClone(offer), approvedByUser: true, userApproval: proposal.userApproval };
}

export function evaluateFreeAgencySigning(state, proposal, options = {}) {
  const transaction = evaluateTransaction(state, proposal, options);
  return {
    ...transaction,
    type: 'free-agent-signing',
    contractValueComponents: {
      salary: proposal.contractTerms?.salary ?? null,
      capHit: proposal.contractTerms?.capHit ?? null,
      guarantees: proposal.contractTerms?.guaranteedCash ?? null,
      bonuses: proposal.contractTerms?.bonuses ?? null,
      options: proposal.contractTerms?.options ?? null,
      contractSeasons: structuredClone(proposal.contractSeasons ?? [proposal.contractTerms].filter(Boolean)),
    },
    reminder: 'Team-side legality uses the shared transaction rule engine. Player preference estimates are separate and do not change legality.',
  };
}
