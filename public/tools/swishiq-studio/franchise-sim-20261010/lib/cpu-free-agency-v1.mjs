import { resolvePlayerByCanonicalName, normalizeCanonicalPlayerName, validateLeagueState } from './simulation-contracts-v1.mjs';
import { evaluateFreeAgentTeamFit, rankFreeAgentTargets } from './free-agent-team-targeting-v1.mjs';
import { createFreeAgencyProposal, evaluateFreeAgencySigning, evaluateFreeAgentOfferCompensation, resolveFreeAgentMarket } from './free-agency-v1.mjs';
import { buildFreeAgentOffers, canonicalNameMapValue } from './free-agent-offer-builder-v1.mjs';

/** Contract construction is explicit and caller-owned: only reconciled rules,
 * rights and exception budgets may supply terms. Automatic construction uses
 * current supplied contexts; an explicit builder may override it. This model ranks each offered
 * contract using current rosters and cost, then screens it through the common
 * transaction engine before passing executable offers to player choice. */
export function prepareCpuFreeAgentOffers(state, canonicalName, {
  offerBuilder, ruleEngine = null, teamProfiles = {}, minimumFitScore = 0, minimumCoverage = 0.25,
  userOffers = [],
  marketRound = 1,
  signingContextProvider = null, pricingPolicy = {},
} = {}) {
  validateLeagueState(state);
  if (offerBuilder != null && typeof offerBuilder !== 'function') throw new Error('CPU contract offer builder must be a function.');
  if (signingContextProvider != null && typeof signingContextProvider !== 'function') throw new Error('Signing context provider must be a function.');
  if (!Number.isInteger(marketRound) || marketRound < 1) throw new Error('Market round must be a positive integer.');
  if (!Number.isFinite(minimumFitScore) || minimumFitScore < -1 || minimumFitScore > 1 ||
      !Number.isFinite(minimumCoverage) || minimumCoverage < 0 || minimumCoverage > 1) throw new Error('Invalid CPU targeting thresholds.');
  const resolution = resolvePlayerByCanonicalName(state.players, canonicalName);
  if (resolution.status !== 'resolved') throw new Error(`Free agent ${canonicalName} is ${resolution.status}.`);
  const player = resolution.matches[0], userTeams = new Set(state.userControlledTeamCodes ?? []);
  if (player.teamCode || player.retired === true || player.rosterStatus === 'retired') throw new Error('CPU market requires an active unattached player.');
  const assessments = [], offers = [], constructionReceipts = [];
  for (const team of [...state.teams].sort((a, b) => a.teamCode.localeCompare(b.teamCode, 'en'))) {
    if (userTeams.has(team.teamCode)) continue;
    const strategyProfile = structuredClone(teamProfiles[team.teamCode] ?? team.strategyProfile ?? 'balanced');
    const snapshot = { state: structuredClone(state), player: structuredClone(player), team: structuredClone(team), marketRound,
      strategyProfile };
    const constructed = offerBuilder ? offerBuilder(snapshot) : buildFreeAgentOffers({ ...snapshot, policy: pricingPolicy,
      contexts: signingContextProvider ? signingContextProvider(structuredClone(snapshot))
        : canonicalNameMapValue(team.freeAgentSigningContextsByPlayer, player.canonicalName) ?? [] });
    if (constructed?.format === 'djhc-free-agent-offer-construction-v1') constructionReceipts.push(constructed);
    const choices = constructed == null ? [] : Array.isArray(constructed) ? constructed : constructed?.format === 'djhc-free-agent-offer-construction-v1' ? constructed.offers : [constructed];
    for (const supplied of choices) {
      const offer = { ...structuredClone(supplied), teamCode: team.teamCode, userApproval: null, approvedByUser: false };
      const terms = offer.contractSeasons ?? offer.contractTerms?.seasons ?? [offer.contractTerms].filter(Boolean);
      const fit = evaluateFreeAgentTeamFit({ state, teamCode: team.teamCode,
        candidate: { ...player, contractSeasons: terms }, profile: strategyProfile });
      const adequate = fit.status !== 'excluded' && fit.score !== null && fit.score >= minimumFitScore && fit.coverage >= minimumCoverage;
      if (!adequate) { assessments.push({ teamCode: team.teamCode, offer, fit, status: 'not-targeted', reason: 'Team contribution/fit evidence or configured utility threshold is insufficient.' }); continue; }
      const compensation = evaluateFreeAgentOfferCompensation(offer);
      if (compensation.status === 'unsupported') { assessments.push({ teamCode: team.teamCode, offer, fit, compensation,
        status: 'blocked-player-valuation', reason: 'Incentive or signing-bonus compensation is unsupported by this player-choice path.' }); continue; }
      const proposal = createFreeAgencyProposal({ state, player, offer, userControlledTeamCodes: state.userControlledTeamCodes });
      const legality = evaluateFreeAgencySigning(state, proposal, { ruleEngine });
      const executable = legality.status === 'confirmed-legal' || legality.status === 'provisional' && state.mode === 'provisional-sandbox';
      assessments.push({ teamCode: team.teamCode, offer, fit, legality, status: executable ? 'executable-target' : 'blocked-rules' });
      if (executable) offers.push({ ...offer, teamTargeting: fit });
    }
  }
  // User offers are supplied actions, never manufactured by CPU control.
  for (const offer of userOffers) {
    if (!userTeams.has(String(offer.teamCode).toUpperCase())) throw new Error('User offer must belong to a user-controlled team.');
    offers.push(structuredClone(offer));
  }
  return { format: 'djhc-cpu-free-agent-offers-v1', canonicalName: player.canonicalName, offers, assessments, constructionReceipts,
    assumptions: ['Normalized team-fit weights and thresholds are configurable simulation policies, not inferred GM personalities.',
      'Offer terms are constructed explicitly; this helper does not fabricate missing signing rights, player maximums or exception entitlement.'] };
}

/** A bounded market round; recalculate every team after each committed deal.
 * Stop at a pending user decision so its exact revision can be approved. */
export function runCpuFreeAgencyRound(state, {
  offerBuilder, ruleEngine = null, teamProfiles = {}, seed = 1, playerOrder = null,
  minimumFitScore = 0, minimumCoverage = 0.25, maximumSignings = state.players.length,
  userOffersByPlayer = {}, temperature = 0.08, outsideOptionUtility = null,
  includeOutsideOption = true, marketRound = 1,
  signingContextProvider = null, pricingPolicy = {},
} = {}) {
  validateLeagueState(state);
  if (!Number.isInteger(maximumSignings) || maximumSignings < 0) throw new Error('Maximum signings must be a nonnegative integer.');
  let current = structuredClone(state), signings = 0;
  const available = state.players.filter(player => !player.teamCode && player.retired !== true && player.rosterStatus !== 'retired');
  const order = playerOrder ?? available.map(player => player.canonicalName).sort((a, b) => normalizeCanonicalPlayerName(a).localeCompare(normalizeCanonicalPlayerName(b), 'en'));
  if (!Array.isArray(order) || new Set(order.map(normalizeCanonicalPlayerName)).size !== order.length) throw new Error('Free-agent round order must contain unique canonical names.');
  const results = [];
  for (const [index, name] of order.entries()) {
    if (signings >= maximumSignings) break;
    const resolution = resolvePlayerByCanonicalName(current.players, name);
    if (resolution.status !== 'resolved') throw new Error(`Round player ${name} is ${resolution.status}.`);
    const player = resolution.matches[0];
    if (player.teamCode || player.retired === true || player.rosterStatus === 'retired') continue;
    const prepared = prepareCpuFreeAgentOffers(current, name, { offerBuilder, ruleEngine, teamProfiles, minimumFitScore,
      minimumCoverage, userOffers: canonicalNameMapValue(userOffersByPlayer, name) ?? [], marketRound, signingContextProvider, pricingPolicy });
    const market = resolveFreeAgentMarket(current, name, prepared.offers, { ruleEngine,
      seed: (Number(seed) + index) >>> 0, temperature, outsideOptionUtility, includeOutsideOption });
    results.push({ canonicalName: prepared.canonicalName, prepared, status: market.status, choice: market.choice,
      proposal: market.proposal ?? null, evaluation: market.evaluation ?? null,
      decisionReceipt: market.decisionReceipt ?? null });
    if (market.status === 'committed') { current = market.state; signings += 1; }
    if (market.status === 'awaiting-user-approval') return { format: 'djhc-cpu-free-agency-round-v1', status: 'awaiting-user-approval',
      state: current, signings, results, pendingProposal: market.proposal,
      pendingDecisionReceipt: market.decisionReceipt ?? null, fixedSeed: seed };
  }
  return { format: 'djhc-cpu-free-agency-round-v1', status: 'round-complete', state: current, signings, results,
    fixedSeed: seed, completeness: 'This round covers the supplied player order and offer-builder candidates. Additional market rounds, negotiation and signing-calendar rules remain separate.' };
}

export { rankFreeAgentTargets };

/** Repeated market decisions use fresh state and a bounded, deterministic
 * round index. A user decision stops the entire market at its exact revision. */
export function runCpuFreeAgencyMarket(state, {
  maximumRounds = 3, startRound = 1, maximumSignings = state.players.length,
  seed = 1, playerOrder = null, ...options
} = {}) {
  validateLeagueState(state);
  if (state.transactionWindow !== 'free-agency') throw new Error('CPU market requires the free-agency window.');
  if (!Number.isInteger(maximumRounds) || maximumRounds < 1 || maximumRounds > 100 ||
      !Number.isInteger(startRound) || startRound < 1 ||
      !Number.isInteger(maximumSignings) || maximumSignings < 0) throw new Error('Invalid bounded market rounds or signing limit.');
  // Include attached players in the stable ordering: the round skips them.
  // Keeping their slots avoids changing draws when resuming after a signing.
  const order = playerOrder ?? state.players.map(player => player.canonicalName)
    .sort((a, b) => normalizeCanonicalPlayerName(a).localeCompare(normalizeCanonicalPlayerName(b), 'en'));
  let current = structuredClone(state), signings = 0, previousOfferKey = null;
  const rounds = [];
  const result = (status, nextRound, pendingProposal = null, pendingDecisionReceipt = null) => ({
    format: 'djhc-cpu-free-agency-market-v1', status, state: current, signings, rounds,
    nextRound, fixedSeed: seed, ...(pendingProposal ? { pendingProposal } : {}),
    ...(pendingDecisionReceipt ? { pendingDecisionReceipt } : {}),
    disclosure: 'Bounded simulated market over supplied players and supported contracts; prices and choices are simulation policies. The calendar is not advanced automatically.',
  });
  if (maximumSignings === 0) return result('signing-limit', startRound);
  for (let offset = 0; offset < maximumRounds; offset += 1) {
    const marketRound = startRound + offset;
    const round = runCpuFreeAgencyRound(current, { ...options, seed: (Number(seed) + marketRound * 1000003) >>> 0,
      playerOrder: order, maximumSignings: maximumSignings - signings, marketRound });
    current = round.state;
    signings += round.signings;
    rounds.push({ ...round, marketRound });
    if (round.status === 'awaiting-user-approval') return result('awaiting-user-approval', marketRound,
      round.pendingProposal, round.pendingDecisionReceipt);
    if (!current.players.some(player => !player.teamCode && player.retired !== true && player.rosterStatus !== 'retired')) return result('market-complete', marketRound + 1);
    if (signings >= maximumSignings) return result('signing-limit', marketRound + 1);
    // Round-specific IDs do not count as changed economic terms.
    const offerKey = JSON.stringify(round.results.map(row => [normalizeCanonicalPlayerName(row.canonicalName),
      [...row.prepared.assessments.map(assessment => assessment.offer), ...row.prepared.offers,
        ...row.prepared.constructionReceipts.flatMap(receipt => receipt.offers)]
        .map(offer => ({ teamCode: offer.teamCode, seasons: offer.contractSeasons ?? offer.contractTerms,
          projectedMinutes: offer.projectedMinutes, teamProjectedWins: offer.teamProjectedWins,
          playerRoleFit: offer.playerRoleFit, mechanism: offer.signingMechanism }))]));
    if (round.signings === 0 && offerKey === previousOfferKey) return result('market-stalled', marketRound + 1);
    previousOfferKey = offerKey;
  }
  return result('market-round-limit', startRound + maximumRounds);
}
