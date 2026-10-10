import { applyTransaction, evaluateTransaction } from './transaction-engine-v1.mjs';
import { validateLeagueState } from './simulation-contracts-v1.mjs';

export const CPU_STRATEGY_PROFILES = Object.freeze({
  contender: {
    profileId: 'contender', label: 'Contender',
    weights: { projectedWins: 0.42, nearTermFit: 0.25, development: 0.03, futureFlexibility: 0.05, draftAssetValue: 0.03, contractEfficiency: 0.12, payrollRisk: 0.10 },
    acceptThreshold: 0.25,
    priorities: ['near-term wins', 'rotation fit', 'apron room'],
  },
  balanced: {
    profileId: 'balanced', label: 'Balanced',
    weights: { projectedWins: 0.24, nearTermFit: 0.14, development: 0.12, futureFlexibility: 0.16, draftAssetValue: 0.12, contractEfficiency: 0.12, payrollRisk: 0.10 },
    acceptThreshold: 0.15,
    priorities: ['current competitiveness', 'future flexibility', 'asset value'],
  },
  retool: {
    profileId: 'retool', label: 'Retool',
    weights: { projectedWins: 0.13, nearTermFit: 0.12, development: 0.18, futureFlexibility: 0.18, draftAssetValue: 0.15, contractEfficiency: 0.14, payrollRisk: 0.10 },
    acceptThreshold: 0.1,
    priorities: ['medium-term fit', 'age curve', 'contract flexibility'],
  },
  rebuild: {
    profileId: 'rebuild', label: 'Rebuild',
    weights: { projectedWins: 0.04, nearTermFit: 0.04, development: 0.22, futureFlexibility: 0.19, draftAssetValue: 0.28, contractEfficiency: 0.13, payrollRisk: 0.14 },
    acceptThreshold: 0.05,
    priorities: ['development', 'draft assets', 'future flexibility'],
  },
});

function seededRandom(seed = 1) {
  let value = (Number(seed) >>> 0) || 1;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const STRATEGY_WEIGHT_KEYS = Object.freeze(Object.keys(CPU_STRATEGY_PROFILES.balanced.weights));

/** Versioned, validated strategy contract; defaults remain configurable per team. */
export function createCpuStrategyProfile(input = {}) {
  const requestedId = String(input.profileId ?? (typeof input === 'string' ? input : 'balanced')).toLowerCase();
  const base = CPU_STRATEGY_PROFILES[requestedId] ?? CPU_STRATEGY_PROFILES.balanced;
  const suppliedWeights = input.weights ?? {};
  const unknownKeys = Object.keys(suppliedWeights).filter(key => !STRATEGY_WEIGHT_KEYS.includes(key));
  if (unknownKeys.length) throw new Error(`Unknown CPU strategy weights: ${unknownKeys.join(', ')}.`);
  const rawWeights = { ...base.weights };
  for (const [key, raw] of Object.entries(suppliedWeights)) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`CPU strategy weight ${key} must be a nonnegative finite number.`);
    rawWeights[key] = value;
  }
  const total = Object.values(rawWeights).reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) throw new Error('CPU strategy profile must have at least one positive weight.');
  const acceptThreshold = input.acceptThreshold === undefined ? base.acceptThreshold : Number(input.acceptThreshold);
  if (!Number.isFinite(acceptThreshold) || acceptThreshold < 0) throw new Error('CPU strategy acceptance threshold must be nonnegative and finite.');
  const priorities = input.priorities ?? base.priorities;
  if (!Array.isArray(priorities) || priorities.some(priority => typeof priority !== 'string' || !priority.trim())) {
    throw new Error('CPU strategy priorities must be nonempty strings.');
  }
  return {
    format: 'djhc-cpu-strategy-profile-v1',
    schemaVersion: '1.0.0',
    profileId: requestedId,
    label: String(input.label ?? base.label),
    weights: Object.fromEntries(Object.entries(rawWeights).map(([key, weight]) => [key, weight / total])),
    acceptThreshold,
    priorities: [...priorities],
    sourceStatus: input.sourceStatus ?? (Object.hasOwn(CPU_STRATEGY_PROFILES, requestedId) ? 'configured-default' : 'user-configured'),
  };
}

function profileFor(value) {
  if (value && typeof value === 'object' && value.format && value.format !== 'djhc-cpu-strategy-profile-v1') {
    throw new Error(`Unsupported CPU strategy profile format: ${value.format}.`);
  }
  return createCpuStrategyProfile(typeof value === 'string' ? { profileId: value } : (value ?? {}));
}

function finiteOrNull(value) {
  const raw = value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value;
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean' || ['unknown', 'conflict', 'unreported'].includes(value?.valueStatus)) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function valueComponents(asset = {}, profile) {
  const projection = asset.projection ?? asset.playerForecast ?? {};
  const contract = asset.contract ?? {};
  const uncertainty = Math.max(0, finiteOrNull(projection.uncertainty ?? asset.uncertainty) ?? 0);
  const salary = finiteOrNull(contract.capHit ?? contract.capHitUsd ?? asset.capHit);
  const salaryCap = Math.max(1, finiteOrNull(asset.salaryCap) ?? 100_000_000);
  const capCost = salary === null ? null : (salary / salaryCap) * 100;
  const projectedWins = finiteOrNull(projection.projectedWins ?? asset.projectedWins);
  const nearTermFit = finiteOrNull(asset.nearTermFit ?? asset.roleFit);
  const development = finiteOrNull(projection.developmentValue ?? asset.developmentValue);
  const futureFlexibility = finiteOrNull(contract.futureFlexibility ?? asset.futureFlexibility);
  const draftAssetValue = finiteOrNull(asset.draftAssetValue ?? (asset.assetType === 'draft-pick' ? asset.pickValue : null));
  const contractEfficiency = finiteOrNull(asset.contractEfficiency ?? (projectedWins !== null && capCost !== null ? projectedWins - capCost : null));
  const payrollRisk = finiteOrNull(asset.payrollRisk ?? (capCost === null ? null : -capCost));
  const source = { projectedWins, nearTermFit, development, futureFlexibility, draftAssetValue, contractEfficiency, payrollRisk };
  const available = Object.values(source).filter(Number.isFinite).length;
  const weighted = Object.entries(profile.weights).reduce((sum, [key, weight]) => sum + (Number.isFinite(source[key]) ? source[key] * weight : 0), 0);
  const coverage = available / Object.keys(profile.weights).length;
  return { components: source, rawWeightedValue: weighted, coverage, uncertainty, canonicalName: asset.canonicalName ?? asset.playerName ?? null };
}

export function evaluateTeamTransactionValue({ team, incoming = [], outgoing = [], profile = null } = {}) {
  const selectedProfile = profileFor(profile ?? team?.strategyProfile ?? 'balanced');
  const incomingValues = incoming.map(asset => valueComponents(asset, selectedProfile));
  const outgoingValues = outgoing.map(asset => valueComponents(asset, selectedProfile));
  const incomingValue = incomingValues.reduce((sum, row) => sum + row.rawWeightedValue, 0);
  const outgoingValue = outgoingValues.reduce((sum, row) => sum + row.rawWeightedValue, 0);
  const net = incomingValue - outgoingValue;
  const coverage = [...incomingValues, ...outgoingValues].length
    ? [...incomingValues, ...outgoingValues].reduce((sum, row) => sum + row.coverage, 0) / [...incomingValues, ...outgoingValues].length
    : 1;
  const uncertainty = [...incomingValues, ...outgoingValues].reduce((sum, row) => sum + row.uncertainty, 0);
  const uncertaintyPenalty = (1 - coverage) * 2;
  return {
    format: 'djhc-team-transaction-value-v1',
    teamCode: team?.teamCode ?? null,
    strategyProfile: selectedProfile.profileId,
    components: {
      incoming: incomingValues,
      outgoing: outgoingValues,
      weightedIncoming: incomingValue,
      weightedOutgoing: outgoingValue,
      netExpectedUtility: net,
    },
    uncertainty: {
      coverage,
      modeledSpread: uncertainty,
      lower: net - uncertainty - uncertaintyPenalty,
      upper: net + uncertainty + uncertaintyPenalty,
      penaltyForMissingComponents: uncertaintyPenalty,
    },
    explanation: [
      `Strategy: ${selectedProfile.label} prioritizes ${selectedProfile.priorities.join(', ')}.`,
      'Player skill and game forecasts are kept separate from contract/payroll cost and draft-asset value.',
      'Awards and records are not included as direct player-skill inputs.',
      coverage < 1 ? 'Some value components are missing; the value interval is widened and should be treated as uncertain.' : 'All configured value components had input values.',
    ],
  };
}

export function decideCpuNegotiation({ team, currentValue, proposedValue, profile = null, seed = 1, counterOffer = null } = {}) {
  const selectedProfile = profileFor(profile ?? team?.strategyProfile ?? 'balanced');
  const baseline = finiteOrNull(currentValue) ?? 0;
  const isTransactionDelta = proposedValue?.format === 'djhc-team-transaction-value-v1';
  const proposed = isTransactionDelta
    ? proposedValue
    : { components: { netExpectedUtility: finiteOrNull(proposedValue) ?? 0 }, uncertainty: { lower: finiteOrNull(proposedValue) ?? 0, upper: finiteOrNull(proposedValue) ?? 0 } };
  const expected = finiteOrNull(proposed.components?.netExpectedUtility) ?? 0;
  const offset = isTransactionDelta ? 0 : baseline;
  const delta = expected - offset;
  const lower = (finiteOrNull(proposed.uncertainty?.lower) ?? expected) - offset;
  const upper = (finiteOrNull(proposed.uncertainty?.upper) ?? expected) - offset;
  const random = seededRandom(seed);
  let decision;
  if (lower >= selectedProfile.acceptThreshold) decision = 'accept';
  else if (upper < -selectedProfile.acceptThreshold) decision = 'reject';
  else decision = random() < 0.78 && counterOffer ? 'counter' : 'reject';
  return {
    format: 'djhc-cpu-negotiation-decision-v1',
    teamCode: team?.teamCode ?? null,
    strategyProfile: selectedProfile.profileId,
    decision,
    expectedUtilityChange: delta,
    valueBasis: isTransactionDelta ? 'transaction-delta' : 'proposed-absolute-minus-current',
    uncertainty: { lower, upper },
    fixedSeed: Number(seed) >>> 0,
    counterOffer: decision === 'counter' ? { ...structuredClone(counterOffer), approvedByUser: false, userApproval: null } : null,
    explanation: [
      `The ${selectedProfile.label} profile values ${selectedProfile.priorities.join(', ')}.`,
      `Estimated utility interval ${lower.toFixed(2)} to ${upper.toFixed(2)} was compared with its acceptance threshold ${selectedProfile.acceptThreshold.toFixed(2)}.`,
      'CPU acceptance is not evidence that a trade is fair or legally valid.',
    ],
  };
}

export function assessTradeBalance(teamAValue, teamBValue, { materialDifference = 1.5 } = {}) {
  const a = teamAValue?.uncertainty ?? {};
  const b = teamBValue?.uncertainty ?? {};
  const aExpected = finiteOrNull(teamAValue?.components?.netExpectedUtility);
  const bExpected = finiteOrNull(teamBValue?.components?.netExpectedUtility);
  const diff = aExpected === null || bExpected === null ? null : aExpected - bExpected;
  if (diff === null || [a.lower, a.upper, b.lower, b.upper].some(value => !Number.isFinite(value))) {
    return { assessment: 'indeterminate', expectedDifference: diff, explanation: 'Value estimates or uncertainty intervals are missing.' };
  }
  const aVsBLower = a.lower - b.upper;
  const aVsBUpper = a.upper - b.lower;
  if (aVsBLower <= materialDifference && aVsBUpper >= -materialDifference) {
    return { assessment: 'balanced-within-modeled-uncertainty', expectedDifference: diff, comparisonInterval: [aVsBLower, aVsBUpper] };
  }
  if (aVsBLower > materialDifference) return { assessment: 'team-a-advantage', expectedDifference: diff, comparisonInterval: [aVsBLower, aVsBUpper] };
  if (aVsBUpper < -materialDifference) return { assessment: 'team-b-advantage', expectedDifference: diff, comparisonInterval: [aVsBLower, aVsBUpper] };
  return { assessment: 'indeterminate', expectedDifference: diff, comparisonInterval: [aVsBLower, aVsBUpper] };
}

/** Exact-legal candidates rank before the separately disclosed provisional set. */
export function findTradeCandidates(state, candidateProposals, {
  ruleEngine = null,
  teamValueForProposal = () => null,
} = {}) {
  const confirmedLegal = [];
  const provisional = [];
  for (const proposal of candidateProposals ?? []) {
    const legality = evaluateTransaction(state, proposal, { ruleEngine });
    if (legality.status === 'illegal') continue;
    const value = teamValueForProposal(proposal, state);
    const row = { proposal, legality, value, rankingScore: value?.components?.netExpectedUtility ?? null };
    if (legality.status === 'confirmed-legal') confirmedLegal.push(row);
    else provisional.push(row);
  }
  const sortByValue = (a, b) => (b.rankingScore ?? -Infinity) - (a.rankingScore ?? -Infinity);
  confirmedLegal.sort(sortByValue);
  provisional.sort(sortByValue);
  return {
    format: 'djhc-trade-search-result-v1',
    confirmedLegal,
    provisionalSandbox: provisional,
    excludedIllegalCount: (candidateProposals ?? []).length - confirmedLegal.length - provisional.length,
    completeness: 'Search only covers candidateProposals supplied by the caller; this is not an exhaustive league-wide trade search.',
  };
}

export function cpuToCpuTransactionDecision({ state, proposal, teamProfiles = {}, teamValues = {}, seed = 1, ruleEngine = null,
  counterOffer = null, allowProvisionalSandbox = false } = {}) {
  const legality = evaluateTransaction(state, proposal, { ruleEngine });
  if (legality.status === 'illegal') return { status: 'rejected-illegal', legality, decisions: [] };
  const teamCodes = [...legality.touchedTeams].map(code => String(code).toUpperCase()).sort();
  if (teamCodes.length !== 2 || teamCodes[0] === teamCodes[1]) {
    return { status: 'rejected-invalid-participants', legality, decisions: [], state: structuredClone(state) };
  }
  if (legality.userApprovalRequired) {
    return {
      status: 'awaiting-user-approval',
      executionAllowed: false,
      autoExecuteAllowed: false,
      legality,
      decisions: [],
      fairness: { assessment: 'indeterminate', explanation: 'User-controlled trades require explicit user review.' },
      fixedSeed: Number(seed) >>> 0,
      blockedReason: 'CPU negotiation and execution are disabled for any transaction involving a user-controlled team.',
      state: structuredClone(state),
    };
  }
  const sandboxOptIn = state.mode === 'provisional-sandbox' && allowProvisionalSandbox === true;
  const scenarioCompliantLegality = legality.status === 'provisional' && legality.legalityOutcome === 'scenario-compliant';
  if (legality.status !== 'confirmed-legal' && !(scenarioCompliantLegality && sandboxOptIn && legality.executionStatus === 'ready-provisional-sandbox')) {
    return {
      status: 'provisional-uncommitted',
      executionAllowed: false,
      autoExecuteAllowed: false,
      legality,
      decisions: [],
      fairness: { assessment: 'indeterminate', explanation: 'Provisional trade inputs must be resolved before CPU acceptance.' },
      fixedSeed: Number(seed) >>> 0,
      blockedReason: 'CPU-to-CPU market execution requires confirmed-legal status.',
      state: structuredClone(state),
    };
  }
  const valueCheck = normalizeTeamValueIntervals(teamValues, teamCodes, { requireTeamCode: false,
    stateMode: state.mode, allowProvisionalSandbox: sandboxOptIn });
  if (valueCheck.issue) {
    return {
      status: 'blocked-missing-values',
      executionAllowed: false,
      autoExecuteAllowed: false,
      legality,
      decisions: [],
      fairness: { assessment: 'indeterminate', explanation: valueCheck.issue },
      missingInputs: [valueCheck.issue],
      fixedSeed: Number(seed) >>> 0,
      state: structuredClone(state),
    };
  }
  teamValues = valueCheck.values;
  const decisions = legality.touchedTeams.map((teamCode, index) => {
    const team = state.teams.find(row => row.teamCode === teamCode);
    const proposed = teamValues[String(teamCode).toUpperCase()];
    return decideCpuNegotiation({ team, currentValue: 0, proposedValue: proposed,
      profile: teamProfiles[teamCode] ?? team?.strategyProfile ?? 'balanced',
      seed: (Number(seed) + index) >>> 0,
      counterOffer });
  });
  const allAccept = decisions.length > 0 && decisions.every(row => row.decision === 'accept');
  const provisionalRun = scenarioCompliantLegality || valueCheck.provisional;
  const canSandboxCommit = sandboxOptIn && (scenarioCompliantLegality || legality.status === 'confirmed-legal' && valueCheck.provisional);
  const teamValueRows = legality.touchedTeams.map(code => teamValues[code]).filter(Boolean);
  const fairness = teamValueRows.length >= 2
    ? assessTradeBalance(teamValueRows[0], teamValueRows[1])
    : { assessment: 'indeterminate', explanation: 'Provide both teams’ value intervals to assess balance.' };
  const result = {
    status: allAccept ? provisionalRun ? 'accepted-provisional-sandbox' : 'accepted-confirmed-legal'
      : decisions.some(row => row.decision === 'counter') ? 'countered-uncommitted' : 'negotiation-not-accepted',
    executionAllowed: allAccept && (legality.status === 'confirmed-legal' && !valueCheck.provisional || canSandboxCommit),
    autoExecuteAllowed: allAccept && (legality.status === 'confirmed-legal' && !valueCheck.provisional || canSandboxCommit),
    legality,
    decisions,
    fairness,
    fixedSeed: seed,
    valueInputStatus: valueCheck.valueStatus,
    ...(provisionalRun ? { provisionalSandboxRequired: true } : {}),
  };
  if (result.autoExecuteAllowed) {
    const executableProposal = { ...proposal, actor: 'cpu', approvedByUser: false };
    const committed = applyTransaction(state, executableProposal, { ruleEngine, allowProvisionalSandbox: sandboxOptIn || state.mode === 'provisional-sandbox' });
    result.state = committed.state;
    result.evaluation = committed.evaluation;
    const ledgerEntry = result.state.transactionLedger.at(-1);
    if (ledgerEntry) ledgerEntry.valueInputStatus = valueCheck.valueStatus;
    if (valueCheck.provisional && legality.status === 'confirmed-legal') {
      const reason = `Trade ${proposal.proposalId} used provisional explicit value inputs.`;
      result.state.stateQuality = { status: 'provisional', reasons: [...new Set([...(result.state.stateQuality?.reasons ?? []), reason])] };
    }
  }
  return result;
}

function normalizeTeamValueIntervals(valueByTeam, participantCodes, { requireTeamCode = true, stateMode = 'exact', allowProvisionalSandbox = false } = {}) {
  if (!valueByTeam || typeof valueByTeam !== 'object' || Array.isArray(valueByTeam)) {
    return { values: null, issue: 'Per-team value intervals are missing.' };
  }
  const normalizedEntries = Object.entries(valueByTeam).map(([code, value]) => [String(code).trim().toUpperCase(), value]);
  if (normalizedEntries.some(([code]) => !code) || new Set(normalizedEntries.map(([code]) => code)).size !== normalizedEntries.length) {
    return { values: null, issue: 'Per-team value interval keys are empty or ambiguous after team-code normalization.' };
  }
  const expected = [...participantCodes].sort();
  const actual = normalizedEntries.map(([code]) => code).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    return { values: null, issue: `Value intervals must identify exactly the participating teams: ${expected.join(', ')}.` };
  }
  const values = Object.fromEntries(normalizedEntries);
  let provisional = false;
  for (const code of expected) {
    const row = values[code];
    const expectedValue = Number(row?.components?.netExpectedUtility);
    const lower = Number(row?.uncertainty?.lower);
    const upper = Number(row?.uncertainty?.upper);
    const valueStatus = String(row?.valueStatus ?? '').trim().toLowerCase();
    const resolvedValue = ['resolved-explicit-inputs', 'ready-explicit-inputs'].includes(valueStatus);
    const sandboxValue = valueStatus === 'provisional-explicit-inputs' && stateMode === 'provisional-sandbox' && allowProvisionalSandbox;
    if (sandboxValue) provisional = true;
    if (row?.format !== 'djhc-team-transaction-value-v1' || (requireTeamCode && String(row.teamCode ?? '').toUpperCase() !== code) ||
        !Number.isFinite(expectedValue) || !Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper ||
        expectedValue < lower || expectedValue > upper || (!resolvedValue && !sandboxValue)) {
      const statusIssue = !valueStatus ? ' Value status is unknown.'
        : !resolvedValue && !sandboxValue ? ` Value status ${valueStatus} is not eligible for this execution mode.` : '';
      return { values: null, issue: `Team ${code} requires a matching, finite value estimate and enclosing finite lower/upper interval.${statusIssue}` };
    }
  }
  return { values, issue: null, provisional, valueStatus: provisional ? 'provisional-explicit-inputs' : 'resolved-explicit-inputs' };
}

function proposalTeamCodes(proposal) {
  return [...new Set((proposal?.legs ?? []).flatMap(leg => [leg.fromTeamCode, leg.toTeamCode])
    .map(code => String(code ?? '').trim().toUpperCase()).filter(Boolean))].sort();
}

function validateCounterProposal(state, counterProposal, teamCodes, ruleEngine) {
  if (!counterProposal) return { proposal: null, legality: null, issue: null };
  if (counterProposal.format !== 'djhc-transaction-proposal-v1' || counterProposal.kind !== 'trade') {
    return { proposal: null, legality: null, issue: 'A counter proposal must be a versioned trade TransactionProposal.' };
  }
  const counterTeams = proposalTeamCodes(counterProposal);
  if (JSON.stringify(counterTeams) !== JSON.stringify([...teamCodes].sort())) {
    return { proposal: null, legality: null, issue: 'A CPU counter proposal must involve the same two teams as the original offer.' };
  }
  const userTeams = new Set([
    ...(state.userControlledTeamCodes ?? []), ...(counterProposal.userControlledTeamCodes ?? []),
  ].map(code => String(code).toUpperCase()));
  if (counterTeams.some(code => userTeams.has(code))) {
    return { proposal: null, legality: null, issue: 'A CPU counter proposal cannot bypass a user-controlled-team approval gate.' };
  }
  const legality = evaluateTransaction(state, counterProposal, { ruleEngine });
  if (legality.status === 'illegal') return { proposal: null, legality, issue: 'The supplied counter proposal is illegal.' };
  return { proposal: counterProposal, legality, issue: null };
}

/** Process only caller-supplied offers. A confirmed-legal CPU trade commits one
 * offer at a time; later proposals and value forecasts must be refreshed
 * against the resulting LeagueState. Provisional and user-team offers never
 * auto-commit in this market path. */
export function runCpuTradeMarketRound({ state, candidateOffers = [], seed, teamProfiles = {}, ruleEngine = null } = {}) {
  validateLeagueState(state);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
    throw new Error('CPU trade market round requires an explicit unsigned 32-bit integer seed.');
  }
  if (!Array.isArray(candidateOffers)) throw new Error('CPU trade market candidateOffers must be an array.');

  const result = {
    format: 'djhc-cpu-trade-market-round-v1',
    schemaVersion: '1.0.0',
    status: 'round-complete',
    state: structuredClone(state),
    fixedSeed: seed,
    confirmedLegal: [],
    scenarioCompliant: [],
    provisional: [],
    rejectedIllegal: [],
    blockedMissingValues: [],
    rejected: [],
    countered: [],
    pendingUserApproval: [],
    committed: [],
    unprocessedOfferCount: 0,
    completeness: 'Only caller-supplied candidate offers were evaluated. This is not an exhaustive league-wide trade search; CPU acceptance and modeled balance are not evidence of fairness.',
  };
  const proposalIds = new Set();
  for (const [index, candidate] of candidateOffers.entries()) {
    const proposal = candidate?.proposal;
    const proposalId = String(proposal?.proposalId ?? '').trim();
    if (!proposalId || proposal?.format !== 'djhc-transaction-proposal-v1' || proposal.kind !== 'trade') {
      result.rejectedIllegal.push({ proposalId: proposalId || null, status: 'invalid-candidate', reason: 'Candidate must contain a versioned trade proposal with proposalId.' });
      continue;
    }
    if (proposalIds.has(proposalId)) throw new Error(`CPU trade market contains duplicate proposalId ${proposalId}.`);
    proposalIds.add(proposalId);

    const legality = evaluateTransaction(state, proposal, { ruleEngine });
    const teamCodes = [...legality.touchedTeams].map(code => String(code).toUpperCase()).sort();
    const offer = { proposal, legality, teamCodes, teamValuesByTeam: candidate.teamValuesByTeam ?? null };
    if (legality.status === 'illegal') {
      result.rejectedIllegal.push(offer);
      continue;
    }
    if (teamCodes.length !== 2 || teamCodes[0] === teamCodes[1]) {
      result.rejectedIllegal.push({ ...offer, status: 'invalid-participants', reason: 'CPU trade offers must involve exactly two distinct teams.' });
      continue;
    }
    const userTeams = new Set([
      ...(state.userControlledTeamCodes ?? []), ...(proposal.userControlledTeamCodes ?? []),
    ].map(code => String(code).toUpperCase()));
    const userControlledOffer = legality.userApprovalRequired || teamCodes.some(code => userTeams.has(code));
    if (legality.status === 'confirmed-legal') {
      offer.status = 'confirmed-legal';
      result.confirmedLegal.push(offer);
    } else if (legality.legalityOutcome === 'scenario-compliant') {
      offer.status = 'scenario-compliant-uncommitted';
      result.scenarioCompliant.push(offer);
    } else {
      offer.status = 'provisional-uncommitted';
      result.provisional.push(offer);
    }
    if (userControlledOffer) {
      offer.status = legality.status === 'confirmed-legal' ? 'pending-user-approval'
        : legality.legalityOutcome === 'scenario-compliant' ? 'pending-user-review-scenario-compliant' : 'pending-user-review-provisional';
      offer.valueInputStatus = 'not-used-for-automatic-acceptance';
      result.pendingUserApproval.push(offer);
      result.status = legality.status === 'confirmed-legal' ? 'awaiting-user-approval'
        : legality.legalityOutcome === 'scenario-compliant' ? 'awaiting-user-review-scenario-compliant' : 'awaiting-user-review-provisional';
      result.unprocessedOfferCount = candidateOffers.length - index - 1;
      return result;
    }
    const sandboxOptIn = state.mode === 'provisional-sandbox' && candidate.allowProvisionalSandbox === true;
    const scenarioCompliantLegality = legality.status === 'provisional' && legality.legalityOutcome === 'scenario-compliant';
    if (legality.status !== 'confirmed-legal' && (!scenarioCompliantLegality || !sandboxOptIn || legality.executionStatus !== 'ready-provisional-sandbox')) {
      continue;
    }

    const valueCheck = normalizeTeamValueIntervals(candidate.teamValuesByTeam, teamCodes, {
      stateMode: state.mode, allowProvisionalSandbox: sandboxOptIn,
    });
    if (valueCheck.issue) {
      offer.status = 'blocked-missing-values';
      offer.reason = valueCheck.issue;
      result.blockedMissingValues.push(offer);
      continue;
    }
    const counterCheck = validateCounterProposal(state, candidate.counterProposal ?? null, teamCodes, ruleEngine);
    const counterProposal = counterCheck.issue ? null : counterCheck.proposal;
    const decision = cpuToCpuTransactionDecision({
      state,
      proposal,
      teamProfiles,
      teamValues: valueCheck.values,
      seed: (seed + index * 1000003) >>> 0,
      ruleEngine,
      counterOffer: counterProposal,
      allowProvisionalSandbox: sandboxOptIn,
    });
    const completed = {
      ...offer,
      values: valueCheck.values,
      valueInputStatus: valueCheck.valueStatus,
      fairness: decision.fairness,
      decision,
      seed: decision.fixedSeed,
      ...(candidate.counterProposal ? { counterProposalIssue: counterCheck.issue, counterProposalLegality: counterCheck.legality } : {}),
    };
    if (decision.autoExecuteAllowed && decision.state) {
      completed.status = decision.status === 'accepted-provisional-sandbox' ? 'committed-provisional-sandbox' : 'committed-confirmed-legal';
      result.committed.push(completed);
      result.state = decision.state;
      result.status = completed.status === 'committed-provisional-sandbox' ? 'committed-one-offer-provisional-sandbox' : 'committed-one-offer';
      result.unprocessedOfferCount = candidateOffers.length - index - 1;
      return result;
    }
    if (decision.decisions.some(row => row.decision === 'counter') && counterProposal) {
      completed.status = 'countered-uncommitted';
      completed.counterProposal = counterProposal;
      completed.counterProposalApprovalStatus = 'not-approved';
      result.countered.push(completed);
      continue;
    }
    completed.status = 'rejected-by-cpu';
    result.rejected.push(completed);
  }
  return result;
}
