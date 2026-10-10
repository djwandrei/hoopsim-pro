import { runCpuFreeAgencyMarket } from '../lib/cpu-free-agency-v1.mjs';
import { evaluateFreeAgencySigning, evaluateFreeAgentOfferCompensation, createFreeAgencyProposal } from '../lib/free-agency-v1.mjs';
import { runCpuTradeMarketRound } from '../lib/cpu-strategy-v1.mjs';
import { resolvePlayerByCanonicalName, normalizeCanonicalPlayerName, validateLeagueState } from '../lib/simulation-contracts-v1.mjs';

export const FRANCHISE_OFFSEASON_PHASE_EXECUTORS_V1_FORMAT = 'djhc-franchise-offseason-phase-executors-v1';

const clone = value => structuredClone(value);
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function blocked(state, phase, status, missingInputs, details = {}) {
  return { format: FRANCHISE_OFFSEASON_PHASE_EXECUTORS_V1_FORMAT, phase, status,
    state: clone(state), missingInputs: [...new Set(missingInputs)], ...details };
}

function mapValueByPlayer(source, canonicalName) {
  if (!object(source)) return null;
  const wanted = normalizeCanonicalPlayerName(canonicalName);
  const row = Object.entries(source).find(([name]) => normalizeCanonicalPlayerName(name) === wanted);
  return row?.[1] ?? null;
}

function supportedCpuLegality(state, evaluation, allowScenarioCompliant) {
  if (evaluation?.status === 'confirmed-legal' && evaluation.executionStatus === 'ready' &&
      evaluation.userApprovalRequired !== true && !(evaluation.blockedReasons?.length)) return true;
  return allowScenarioCompliant && state.mode === 'provisional-sandbox' &&
    evaluation?.status === 'provisional' && evaluation.legalityOutcome === 'scenario-compliant' &&
    evaluation.executionStatus === 'ready-provisional-sandbox' && evaluation.userApprovalRequired !== true &&
    !(evaluation.blockedReasons?.length);
}

function explicitOfferTerms(offer) {
  const seasons = offer?.contractSeasons ?? (Array.isArray(offer?.contractTerms) ? offer.contractTerms :
    offer?.contractTerms?.seasons ?? (offer?.contractTerms ? [offer.contractTerms] : []));
  return Array.isArray(seasons) && seasons.length > 0;
}

function validSeed(seed) {
  return Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xFFFFFFFF;
}

function tradeTransitionReceipt(state, market) {
  const row = market.committed?.[0];
  const entry = market.state.transactionLedger?.at(-1);
  if (!row || !entry || entry.proposalId !== row.proposal.proposalId ||
      market.state.revision !== state.revision + 1) {
    throw new Error('CPU trade market did not produce exactly one committed transaction/ledger transition.');
  }
  return market.state.rosterTransitionReceipts?.at(-1) ?? row.legality.rosterTransitionReceipt ?? null;
}

/**
 * Creates lifecycle-compatible, headless executors for the two bounded
 * transaction windows. Every offer/proposal and its evidence arrives in
 * context; this adapter never generates missing contract terms or trade values.
 */
export function createFranchiseOffseasonPhaseExecutorsV1({ ruleEngine = null } = {}) {
  return Object.freeze({
    'free-agency': (state, context) => executeFranchiseFreeAgencyPhaseV1({ state, context, ruleEngine }),
    'trade-window': (state, context) => executeFranchiseTradeWindowPhaseV1({ state, context, ruleEngine }),
  });
}

/** Execute at most one signing, after re-screening an explicit bounded offer set. */
export function executeFranchiseFreeAgencyPhaseV1({ state, context, ruleEngine = null } = {}) {
  validateLeagueState(state);
  if (state.transactionWindow !== 'free-agency') return blocked(state, 'free-agency', 'blocked-wrong-window',
    ['LeagueState must be in the free-agency transaction window.']);
  const marketInput = context?.freeAgencyMarket;
  if (!object(marketInput)) return blocked(state, 'free-agency', 'blocked-requires-input',
    ['context.freeAgencyMarket']);
  if (!validSeed(marketInput.seed)) return blocked(state, 'free-agency', 'blocked-requires-input',
    ['freeAgencyMarket.seed must be an explicit unsigned 32-bit integer.']);
  if (!Array.isArray(marketInput.playerOrder) || marketInput.playerOrder.length === 0) return blocked(state,
    'free-agency', 'blocked-requires-input', ['freeAgencyMarket.playerOrder must explicitly name at least one free agent.']);
  if (!object(marketInput.cpuOffersByPlayer)) return blocked(state, 'free-agency', 'blocked-requires-input',
    ['freeAgencyMarket.cpuOffersByPlayer']);
  if (marketInput.userOffersByPlayer !== undefined && !object(marketInput.userOffersByPlayer)) return blocked(state,
    'free-agency', 'blocked-requires-input', ['freeAgencyMarket.userOffersByPlayer must be a player-to-offer map.']);

  const userTeams = new Set((state.userControlledTeamCodes ?? []).map(code => String(code).toUpperCase()));
  const teams = new Set(state.teams.map(team => String(team.teamCode).toUpperCase()));
  const cpuOffersByPlayer = {};
  const userOffersByPlayer = {};
  const preflightBlocks = [];
  let explicitOfferCount = 0;
  for (const requestedName of marketInput.playerOrder) {
    if (typeof requestedName !== 'string' || !requestedName.trim()) return blocked(state, 'free-agency',
      'blocked-requires-input', ['freeAgencyMarket.playerOrder contains a missing canonical player name.']);
    const resolved = resolvePlayerByCanonicalName(state.players, requestedName);
    if (resolved.status !== 'resolved') return blocked(state, 'free-agency', 'blocked-requires-input',
      [`Free-agent identity is ${resolved.status}: ${requestedName}.`]);
    const player = resolved.matches[0];
    if (player.teamCode || player.retired === true || player.rosterStatus === 'retired') return blocked(state,
      'free-agency', 'blocked-requires-input', [`${player.canonicalName} is not an active unattached free agent.`]);
    const suppliedCpuByTeam = mapValueByPlayer(marketInput.cpuOffersByPlayer, player.canonicalName);
    const suppliedUserOffers = mapValueByPlayer(marketInput.userOffersByPlayer ?? {}, player.canonicalName) ?? [];
    if (suppliedCpuByTeam !== null && !object(suppliedCpuByTeam)) return blocked(state, 'free-agency',
      'blocked-requires-input', [`CPU offer set for ${player.canonicalName} must map team codes to explicit offer arrays.`]);
    if (!Array.isArray(suppliedUserOffers)) return blocked(state, 'free-agency', 'blocked-requires-input',
      [`User offer set for ${player.canonicalName} must be an array.`]);

    const acceptedCpuByTeam = {};
    for (const [rawTeamCode, offers] of Object.entries(suppliedCpuByTeam ?? {})) {
      const teamCode = String(rawTeamCode).toUpperCase();
      if (!teams.has(teamCode)) return blocked(state, 'free-agency', 'blocked-requires-input',
        [`CPU offer references unknown team ${rawTeamCode}.`]);
      if (userTeams.has(teamCode)) return blocked(state, 'free-agency', 'blocked-requires-input',
        [`User-team offers for ${teamCode} must be supplied in userOffersByPlayer.`]);
      if (!Array.isArray(offers)) return blocked(state, 'free-agency', 'blocked-requires-input',
        [`CPU offers for ${player.canonicalName}/${teamCode} must be an array.`]);
      for (const offer of offers) {
        if (!object(offer) || String(offer.teamCode ?? '').toUpperCase() !== teamCode || !explicitOfferTerms(offer)) {
          return blocked(state, 'free-agency', 'blocked-requires-input',
            [`CPU offer for ${player.canonicalName}/${teamCode} needs explicit matching teamCode and year-by-year terms.`]);
        }
        if (offer.approvedByUser === true || offer.userApproval !== undefined && offer.userApproval !== null) return blocked(state, 'free-agency',
          'blocked-invalid-approval', [`CPU offer ${offer.offerId ?? ''} carries a user approval payload.`]);
        explicitOfferCount += 1;
        let evaluation;
        try {
          const proposal = createFreeAgencyProposal({ state, player, offer, userControlledTeamCodes: state.userControlledTeamCodes });
          evaluation = evaluateFreeAgencySigning(state, proposal, { ruleEngine });
        } catch (error) {
          preflightBlocks.push({ canonicalName: player.canonicalName, teamCode, offerId: offer.offerId ?? null,
            status: 'blocked-invalid-offer', reason: error.message });
          continue;
        }
        if (!supportedCpuLegality(state, evaluation, marketInput.allowScenarioCompliantCpuMoves === true)) {
          preflightBlocks.push({ canonicalName: player.canonicalName, teamCode, offerId: offer.offerId ?? null,
            status: evaluation.status === 'illegal' ? 'rejected-illegal' : 'blocked-unknown-legality', evaluation });
          continue;
        }
        (acceptedCpuByTeam[teamCode] ??= []).push(clone(offer));
      }
    }
    cpuOffersByPlayer[player.canonicalName] = acceptedCpuByTeam;
    for (const offer of suppliedUserOffers) {
      const teamCode = String(offer?.teamCode ?? '').toUpperCase();
      if (!userTeams.has(teamCode) || !explicitOfferTerms(offer) || offer.approvedByUser === true ||
          offer.userApproval !== undefined && offer.userApproval !== null) {
        return blocked(state, 'free-agency', 'blocked-requires-input',
          [`User offer for ${player.canonicalName} must have explicit terms, belong to a user-controlled team, and await approval.`]);
      }
      explicitOfferCount += 1;
    }
    userOffersByPlayer[player.canonicalName] = clone(suppliedUserOffers);
  }
  if (explicitOfferCount === 0) return blocked(state, 'free-agency', 'blocked-requires-input',
    ['No explicit CPU or user free-agent offers were supplied.']);

  const offerBuilder = ({ player, team }) => mapValueByPlayer(cpuOffersByPlayer, player.canonicalName)?.[team.teamCode] ?? [];
  const market = runCpuFreeAgencyMarket(state, {
    seed: marketInput.seed,
    playerOrder: marketInput.playerOrder,
    maximumRounds: 1,
    startRound: 1,
    maximumSignings: 1,
    offerBuilder,
    userOffersByPlayer,
    ruleEngine,
    marketRound: 1,
    temperature: Number.isFinite(marketInput.temperature) && marketInput.temperature > 0 ? marketInput.temperature : 0.08,
    outsideOptionUtility: marketInput.outsideOptionUtility ?? null,
    includeOutsideOption: marketInput.includeOutsideOption !== false,
    minimumFitScore: Number.isFinite(marketInput.minimumFitScore) ? marketInput.minimumFitScore : 0,
    minimumCoverage: Number.isFinite(marketInput.minimumCoverage) ? marketInput.minimumCoverage : 0.25,
  });
  const round = market.rounds?.[0];
  const outcomes = (round?.results ?? []).map(row => ({ canonicalName: row.canonicalName, status: row.status,
    evaluation: row.evaluation ?? null, decisionReceipt: row.decisionReceipt ?? null,
    assessments: row.prepared?.assessments ?? [] }));
  if (market.status === 'awaiting-user-approval') {
    const pendingProposal = market.pendingProposal;
    if (!pendingProposal || pendingProposal.expectedStateRevision !== state.revision || market.state.revision !== state.revision) {
      return blocked(state, 'free-agency', 'blocked-stale-proposal',
        ['Free-agent proposal is not bound to the current LeagueState revision.'], { outcomes });
    }
    return { format: FRANCHISE_OFFSEASON_PHASE_EXECUTORS_V1_FORMAT, phase: 'free-agency',
      status: 'awaiting-user-approval', state: clone(state), pendingProposal,
      evaluation: outcomes.find(row => row.evaluation?.proposalId === pendingProposal.proposalId)?.evaluation ?? null,
      decisionReceipt: market.pendingDecisionReceipt ?? null, outcomes, preflightBlocks };
  }
  if (market.signings === 1) {
    if (market.state.revision !== state.revision + 1) throw new Error('Free-agent market must commit exactly one revision per executor call.');
    const ledgerEntry = market.state.transactionLedger?.at(-1);
    if (!ledgerEntry || ledgerEntry.kind !== 'free-agent-signing' || ledgerEntry.revisionBefore !== state.revision ||
        ledgerEntry.revisionAfter !== market.state.revision) throw new Error('Committed free-agent signing has no matching transaction ledger entry.');
    const receipt = market.state.rosterTransitionReceipts?.at(-1) ?? null;
    const decisionReceipt = ledgerEntry.freeAgentMarketDecisionReceipt ?? null;
    const legalityOutcome = ledgerEntry.legalityOutcome;
    return { format: FRANCHISE_OFFSEASON_PHASE_EXECUTORS_V1_FORMAT, phase: 'free-agency',
      status: legalityOutcome === 'confirmed-legal' ? 'committed-confirmed-legal' : 'committed-scenario-compliant',
      state: market.state, evaluation: outcomes.find(row => row.evaluation?.proposalId === ledgerEntry.proposalId)?.evaluation ?? null,
      receipt, decisionReceipt, outcomes, preflightBlocks };
  }
  const noExecutableNames = new Set(outcomes.filter(row => row.status === 'no-executable-offer').map(row =>
    normalizeCanonicalPlayerName(row.canonicalName)));
  const unresolvedUserOffers = marketInput.playerOrder.flatMap(name => {
    const resolution = resolvePlayerByCanonicalName(state.players, name);
    if (resolution.status !== 'resolved' || !noExecutableNames.has(normalizeCanonicalPlayerName(resolution.matches[0].canonicalName))) return [];
    const player = resolution.matches[0];
    return (mapValueByPlayer(userOffersByPlayer, player.canonicalName) ?? []).map(offer => ({ player, offer }));
  });
  if (unresolvedUserOffers.length) {
    if (unresolvedUserOffers.length !== 1) return blocked(state, 'free-agency', 'blocked-requires-input',
      ['Choose exactly one user free-agent offer to review when the supported player-choice path has no executable offer.'],
      { outcomes, preflightBlocks });
    const { player, offer } = unresolvedUserOffers[0];
    try {
      const proposal = createFreeAgencyProposal({ state, player, offer,
        userControlledTeamCodes: state.userControlledTeamCodes });
      const evaluation = evaluateFreeAgencySigning(state, proposal, { ruleEngine });
      const compensation = evaluateFreeAgentOfferCompensation(offer);
      if (evaluation.userApprovalRequired && evaluation.status !== 'illegal' && compensation.status !== 'unsupported' &&
          proposal.expectedStateRevision === state.revision) {
        return { format: FRANCHISE_OFFSEASON_PHASE_EXECUTORS_V1_FORMAT, phase: 'free-agency',
          status: 'awaiting-user-approval', state: clone(state), pendingProposal: proposal, evaluation,
          decisionReceipt: null, outcomes, preflightBlocks,
          handoffReason: 'The explicit user offer is saved for review; contract or CBA evidence is not sufficient for an automatic move.' };
      }
    } catch (error) {
      preflightBlocks.push({ canonicalName: player.canonicalName, teamCode: offer.teamCode,
        offerId: offer.offerId ?? null, status: 'blocked-invalid-offer', reason: error.message });
    }
  }
  const unknown = [...preflightBlocks, ...outcomes.flatMap(row => row.assessments)
    .filter(row => /blocked-rules|blocked-unknown-legality|blocked-invalid-offer/.test(String(row.status)))];
  if (!outcomes.length || unknown.length) return blocked(state, 'free-agency', 'blocked-unknown-legality',
    unknown.map(row => row.reason ?? row.status ?? 'Free-agent legality is unresolved.'), { outcomes, preflightBlocks, marketStatus: market.status });
  return { format: FRANCHISE_OFFSEASON_PHASE_EXECUTORS_V1_FORMAT, phase: 'free-agency',
    status: 'no-qualifying-move', state: clone(state), outcomes, preflightBlocks, marketStatus: market.status };
}

/** Execute at most one CPU trade from caller-supplied proposals and values. */
export function executeFranchiseTradeWindowPhaseV1({ state, context, ruleEngine = null } = {}) {
  validateLeagueState(state);
  if (state.transactionWindow !== 'trade-window') return blocked(state, 'trade-window', 'blocked-wrong-window',
    ['LeagueState must be in the trade-window transaction window.']);
  const marketInput = context?.tradeMarket;
  if (!object(marketInput)) return blocked(state, 'trade-window', 'blocked-requires-input', ['context.tradeMarket']);
  if (!validSeed(marketInput.seed)) return blocked(state, 'trade-window', 'blocked-requires-input',
    ['tradeMarket.seed must be an explicit unsigned 32-bit integer.']);
  if (!Array.isArray(marketInput.candidateOffers) || marketInput.candidateOffers.length === 0) return blocked(state,
    'trade-window', 'blocked-requires-input', ['tradeMarket.candidateOffers must contain explicit trade proposals.']);
  const eligible = [];
  const stale = [];
  for (const candidate of marketInput.candidateOffers) {
    const proposal = candidate?.proposal;
    if (proposal?.format !== 'djhc-transaction-proposal-v1' || proposal.kind !== 'trade') {
      continue;
    }
    if (proposal.expectedStateRevision !== state.revision) {
      stale.push({ proposalId: proposal.proposalId ?? null, expectedStateRevision: proposal.expectedStateRevision,
        actualStateRevision: state.revision });
      continue;
    }
    const clean = clone(candidate);
    delete clean.allowProvisionalSandbox;
    if (marketInput.allowScenarioCompliantCpuMoves === true) clean.allowProvisionalSandbox = true;
    eligible.push(clean);
  }
  if (!eligible.length) return blocked(state, 'trade-window', stale.length ? 'blocked-stale-proposal' : 'blocked-requires-input',
    stale.length ? ['Every supplied trade proposal is stale.'] : ['No valid versioned trade proposals were supplied.'], { stale });

  const market = runCpuTradeMarketRound({ state, candidateOffers: eligible, seed: marketInput.seed,
    teamProfiles: object(marketInput.teamProfiles) ? marketInput.teamProfiles : {}, ruleEngine });
  if (market.pendingUserApproval?.length) {
    const pendingProposal = market.pendingUserApproval[0].proposal;
    if (pendingProposal.expectedStateRevision !== state.revision || market.state.revision !== state.revision) {
      return blocked(state, 'trade-window', 'blocked-stale-proposal',
        ['User-team proposal is not bound to the current LeagueState revision.'], { stale, market });
    }
    return { format: FRANCHISE_OFFSEASON_PHASE_EXECUTORS_V1_FORMAT, phase: 'trade-window',
      status: 'awaiting-user-approval', state: clone(state), pendingProposal,
      evaluation: market.pendingUserApproval[0].legality, receipt: null, market, stale };
  }
  if (market.committed.length === 1) {
    const completed = market.committed[0];
    const receipt = tradeTransitionReceipt(state, market);
    return { format: FRANCHISE_OFFSEASON_PHASE_EXECUTORS_V1_FORMAT, phase: 'trade-window',
      status: completed.legality.legalityOutcome === 'confirmed-legal'
        ? 'committed-confirmed-legal' : 'committed-scenario-compliant',
      state: market.state, evaluation: completed.legality, receipt, market, stale };
  }
  if (market.blockedMissingValues.length) return blocked(state, 'trade-window', 'blocked-requires-input',
    market.blockedMissingValues.map(row => row.reason ?? 'Trade value intervals are incomplete.'), { market, stale });
  if (market.provisional.length || market.scenarioCompliant.length) return blocked(state, 'trade-window',
    'blocked-unknown-legality', market.provisional.map(row => row.reason ?? 'Trade legality is provisional.')
      .concat(market.scenarioCompliant.filter(row => row.status !== 'committed-provisional-sandbox')
        .map(row => 'Scenario-compliant CPU trade did not meet the explicit sandbox execution gate.')), { market, stale });
  return { format: FRANCHISE_OFFSEASON_PHASE_EXECUTORS_V1_FORMAT, phase: 'trade-window',
    status: 'no-qualifying-move', state: clone(state), market, stale };
}
