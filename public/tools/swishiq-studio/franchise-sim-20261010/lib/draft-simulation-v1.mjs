import { applyTransaction, createTransactionProposal, evaluateTransaction } from './transaction-engine-v1.mjs';
import { normalizeCanonicalPlayerName, resolvePlayerByCanonicalName, validateLeagueState } from './simulation-contracts-v1.mjs';
import { validateScenarioPickLedgerReceiptV1 } from './scenario-pick-ledger-v1.mjs';

const CPU_DRAFT_PROFILES = new Set(['contender', 'balanced', 'retool', 'rebuild']);
const CPU_DRAFT_POOL_SIZE = 3;

function seededUnit(seed) {
  let value = (seed + 0x6D2B79F5) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function stoppedDraftResult(state, status, reason, extra = {}) {
  return {
    format: 'djhc-cpu-draft-pick-result-v1',
    status,
    state: structuredClone(state),
    selection: null,
    proposal: null,
    evaluation: null,
    violations: [reason],
    ...extra,
  };
}

function finiteEvidence(value) {
  const hasValue = value && typeof value === 'object' && Object.hasOwn(value, 'value');
  const raw = hasValue ? value.value : value;
  const status = hasValue ? String(value.valueStatus ?? value.status ?? '').toLowerCase() : '';
  const hasConflicts = hasValue && (value.conflict === true || (Array.isArray(value.conflicts) && value.conflicts.length > 0));
  if (raw === null || raw === undefined || typeof raw === 'boolean' ||
      (typeof raw === 'string' && raw.trim() === '') ||
      hasConflicts ||
      /conflict|disput|unknown|unresolved|missing|unreported|invalid|not-applicable/.test(status)) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function prospectValue(prospect, strategyProfile = 'balanced') {
  const impactRaw = prospect.projectedWinsContribution === undefined ? prospect.futureImpact : prospect.projectedWinsContribution;
  const impact = finiteEvidence(impactRaw);
  const development = finiteEvidence(prospect.developmentEstimate);
  const roleFit = finiteEvidence(prospect.roleFit);
  const ageCurve = finiteEvidence(prospect.ageCurveValue);
  const traitsSupplied = prospect.physicalTraits !== null && prospect.physicalTraits !== undefined;
  const traitsResolved = !traitsSupplied || prospect.physicalTraits?.identityStatus === 'resolved';
  const physicalMatch = traitsResolved ? finiteEvidence(prospect.physicalMatchupValue) : null;
  const profiles = {
    contender: { impact: 0.5, development: 0.05, roleFit: 0.3, ageCurve: 0.1, physicalMatch: 0.05 },
    balanced: { impact: 0.25, development: 0.2, roleFit: 0.2, ageCurve: 0.2, physicalMatch: 0.15 },
    retool: { impact: 0.15, development: 0.3, roleFit: 0.15, ageCurve: 0.25, physicalMatch: 0.15 },
    rebuild: { impact: 0.05, development: 0.45, roleFit: 0.1, ageCurve: 0.25, physicalMatch: 0.15 },
  };
  const weights = profiles[String(strategyProfile).toLowerCase()] ?? profiles.balanced;
  const components = { impact, development, roleFit, ageCurve, physicalMatch };
  const present = Object.values(components).filter(Number.isFinite).length;
  const value = Object.entries(weights).reduce((sum, [key, weight]) => sum + (Number.isFinite(components[key]) ? components[key] * weight : 0), 0);
  return { value: present ? value : null, coverage: present / Object.keys(components).length, components };
}

export function evaluateDraftBoard({ prospects = [], team, strategyProfile = 'balanced' } = {}) {
  const ranked = prospects.map(prospect => {
    const value = prospectValue(prospect, strategyProfile);
    const identityResolved = prospect.identityStatus === 'resolved' && Boolean(prospect.canonicalName);
    const traitsResolved = prospect.physicalTraits === null || prospect.physicalTraits === undefined || prospect.physicalTraits.identityStatus === 'resolved';
    return {
      canonicalName: prospect.canonicalName ?? null,
      value: value.value,
      uncertainty: Math.max(0, 1 - value.coverage) * 3 + (identityResolved ? 0 : 2) + (traitsResolved ? 0 : 1),
      coverage: value.coverage,
      components: value.components,
      identityStatus: prospect.identityStatus ?? 'unknown',
      sourceRefs: [...(prospect.sourceRefs ?? [])],
      status: identityResolved ? (value.coverage === 1 ? 'candidate-ranked' : 'provisional-ranked') : 'identity-unresolved-held',
    };
  }).sort((a, b) => {
    if (a.value === null && b.value !== null) return 1;
    if (b.value === null && a.value !== null) return -1;
    return (b.value ?? 0) - (a.value ?? 0);
  });
  return {
    format: 'djhc-draft-board-v1',
    teamCode: team?.teamCode ?? null,
    strategyProfile,
    rankedProspects: ranked,
    selectedCandidate: ranked.find(row => row.identityStatus === 'resolved' && row.value !== null)?.canonicalName ?? null,
    status: ranked.some(row => row.status !== 'candidate-ranked') ? 'provisional-candidate-board' : 'candidate-board',
    disclosure: 'Candidate ranking uses only supplied, resolved evidence and uncertainty. It is not a validated draft projection.',
  };
}

export function simulateDraftOrder({ standings, lotteryRules, standingsSeasonStartYear = null, seed = 1 } = {}) {
  if (!Array.isArray(standings) || !standings.length) throw new Error('Draft order requires standings inputs.');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
    throw new Error('Draft order requires an unsigned 32-bit integer seed.');
  }
  const year = Number.isInteger(standingsSeasonStartYear) ? standingsSeasonStartYear : null;
  const teamCodes = standings.map(row => String(row?.teamCode ?? '').trim().toUpperCase());
  const standingsSeasonConflict = Number.isInteger(year) && standings.some(row => row?.seasonStartYear !== undefined &&
    (!Number.isInteger(row.seasonStartYear) || row.seasonStartYear !== year));
  const invalidStandings = !Number.isInteger(year) || teamCodes.some(code => !code) || new Set(teamCodes).size !== teamCodes.length || standingsSeasonConflict;
  const ruleSeason = Number.isInteger(lotteryRules?.seasonStartYear) ? lotteryRules.seasonStartYear : null;
  const ruleSourceRefs = Array.isArray(lotteryRules?.sourceRefs) ? lotteryRules.sourceRefs.filter(Boolean) : [];
  if (!lotteryRules || lotteryRules.status !== 'complete' || typeof lotteryRules.resolveOrder !== 'function' ||
      !String(lotteryRules.ruleVersionId ?? '').trim() || !Number.isInteger(ruleSeason) || ruleSeason !== year ||
      !ruleSourceRefs.length || invalidStandings) {
    const missingInputs = [];
    if (!Number.isInteger(year)) missingInputs.push('A resolved standingsSeasonStartYear is required for the draft-order run.');
    if (teamCodes.some(code => !code)) missingInputs.push('Every standings row needs an exact teamCode.');
    if (new Set(teamCodes).size !== teamCodes.length) missingInputs.push('Standings contain duplicate teamCode values.');
    if (standingsSeasonConflict) missingInputs.push('A standings row has a seasonStartYear that conflicts with the requested season.');
    if (!lotteryRules || lotteryRules.status !== 'complete' || typeof lotteryRules.resolveOrder !== 'function') {
      missingInputs.push('Complete season-specific lottery/order rules and a rule implementation are required.');
    }
    if (!String(lotteryRules?.ruleVersionId ?? '').trim()) missingInputs.push('Draft-order rules need a version ID.');
    if (!Number.isInteger(ruleSeason)) missingInputs.push('Draft-order rules need an explicit seasonStartYear.');
    else if (Number.isInteger(year) && ruleSeason !== year) missingInputs.push('Draft-order rule season does not match the requested season.');
    if (!ruleSourceRefs.length) missingInputs.push('Draft-order rules need at least one source reference.');
    return {
      format: 'djhc-draft-order-v1',
      status: 'unknown-or-provisional',
      order: [],
      standingsSeasonStartYear: Number.isInteger(year) ? year : null,
      missingInputs: [...new Set(missingInputs)],
      provisionalStandings: standings.map(row => ({ ...row })),
    };
  }
  const order = lotteryRules.resolveOrder({ standings: structuredClone(standings), standingsSeasonStartYear: year, seed });
  const orderedTeamCodes = Array.isArray(order) ? order.map(row => String(row?.teamCode ?? row ?? '').trim().toUpperCase()) : [];
  const expectedTeamCodes = new Set(teamCodes);
  const orderIsPermutation = orderedTeamCodes.length === teamCodes.length &&
    orderedTeamCodes.every(code => expectedTeamCodes.has(code)) && new Set(orderedTeamCodes).size === expectedTeamCodes.size;
  if (!orderIsPermutation) return {
    format: 'djhc-draft-order-v1',
    status: 'unknown-or-provisional',
    order: [],
    standingsSeasonStartYear: year,
    ruleVersion: lotteryRules.ruleVersionId,
    sourceRefs: structuredClone(ruleSourceRefs),
    seed,
    missingInputs: ['Draft-order rule implementation did not return each standings team exactly once.'],
    provisionalStandings: standings.map(row => ({ ...row })),
  };
  return { format: 'djhc-draft-order-v1', status: 'resolved-by-supplied-season-rules', order,
    standingsSeasonStartYear: year, ruleVersion: lotteryRules.ruleVersionId, sourceRefs: structuredClone(ruleSourceRefs), seed };
}

export function createDraftSelectionProposal({ state, teamCode, prospect, pickId, userControlledTeamCodes = [], proposalId = null, fixedSeed = null } = {}) {
  return createTransactionProposal({
    proposalId: proposalId ?? ('draft-' + state.seasonStartYear + '-' + pickId + '-' + prospect.canonicalName),
    kind: 'draft-selection',
    seasonStartYear: state.seasonStartYear,
    transactionWindow: state.transactionWindow,
    actor: userControlledTeamCodes.includes(String(teamCode).toUpperCase()) ? 'user' : 'cpu',
    userControlledTeamCodes,
    teamCode,
    pickId,
    prospect,
    contractSeasons: prospect.rookieContractSeasons ?? null,
    contractTerms: prospect.rookieContractTerms ?? null,
    contractScaleInput: prospect.contractScaleInput ?? null,
    assumptions: [...(prospect.assumptions ?? [])],
    sourceRefs: [...(prospect.sourceRefs ?? [])],
    fixedSeed,
    expectedStateRevision: state.revision,
  });
}

export function evaluateDraftSelection(state, proposal, options = {}) {
  const transaction = evaluateTransaction(state, proposal, options);
  return {
    ...transaction,
    type: 'draft-selection',
    pickId: proposal.pickId,
    prospect: proposal.prospect?.canonicalName ?? null,
    draftAssetStatus: state.draftPicks?.find(row => String(row.pickId ?? row.assetId ?? row.id) === String(proposal.pickId))?.ownershipStatus ?? 'unknown',
  };
}

/** Rank and resolve one CPU draft pick from caller-supplied prospects.
 * Strategy weights and rank-sampling are explicit simulation policies, not
 * calibrated predictions of real NBA teams' draft behavior. */
export function runCpuDraftPick({ state, teamCode, pickId, prospects = [], seed, ruleEngine = null,
  scenarioPickLedgerReceipt = null } = {}) {
  validateLeagueState(state);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
    throw new Error('CPU draft pick requires an explicit unsigned 32-bit integer seed.');
  }
  if (state.transactionWindow !== 'draft') {
    return stoppedDraftResult(state, 'blocked-draft-window', 'CPU draft picks require the draft transaction window.');
  }
  if (!Array.isArray(prospects)) throw new Error('CPU draft prospects must be an array.');

  const requestedPickId = String(pickId ?? '').trim();
  if (!requestedPickId) return stoppedDraftResult(state, 'blocked-pick-state', 'A pickId is required.');
  const pickRows = state.draftPicks.filter(row => String(row.pickId ?? row.assetId ?? row.id ?? '') === requestedPickId);
  if (pickRows.length !== 1) {
    return stoppedDraftResult(state, 'blocked-pick-state', pickRows.length ? `Draft pick ${requestedPickId} is ambiguous in LeagueState.`
      : `Draft pick ${requestedPickId} is absent from LeagueState.`);
  }
  const pick = pickRows[0];
  const ownerTeamCode = String(pick.ownerTeamCode ?? '').trim().toUpperCase();
  const requestedTeamCode = String(teamCode ?? '').trim().toUpperCase();
  const scenarioVerification = scenarioPickLedgerReceipt
    ? validateScenarioPickLedgerReceiptV1({ state, receipt: scenarioPickLedgerReceipt })
    : { valid: false };
  const scenarioRow = scenarioVerification.valid
    ? scenarioVerification.scenarioRows.find(row => row.pickId === requestedPickId) ?? null
    : null;
  const provisionalScenarioOwner = Boolean(scenarioRow && pick.ownershipStatus === 'provisional-scenario' &&
    pick.encumbranceStatus === 'provisional-scenario' && pick.ownershipScenario?.ownerTeamCode === ownerTeamCode &&
    scenarioRow.currentOwnerTeamCode === ownerTeamCode);
  if ((pick.ownershipStatus !== 'resolved' && !provisionalScenarioOwner) || !ownerTeamCode) {
    return stoppedDraftResult(state, 'blocked-pick-ownership', `Draft pick ${requestedPickId} ownership is not resolved.`);
  }
  if (!requestedTeamCode || requestedTeamCode !== ownerTeamCode) {
    return stoppedDraftResult(state, 'blocked-pick-ownership', `Draft pick ${requestedPickId} is owned by ${ownerTeamCode}, not ${requestedTeamCode || '(missing team)'}.`);
  }
  const pickSeasonStartYear = Number(pick.seasonStartYear);
  if (!Number.isInteger(pickSeasonStartYear) || pickSeasonStartYear !== state.seasonStartYear) {
    return stoppedDraftResult(state, 'blocked-pick-season', `Draft pick ${requestedPickId} seasonStartYear must resolve to ${state.seasonStartYear}.`);
  }
  if (pick.encumbranceStatus !== 'clear' && !provisionalScenarioOwner) {
    return stoppedDraftResult(state, 'blocked-pick-encumbrance', `Draft pick ${requestedPickId} encumbrance status is ${pick.encumbranceStatus ?? 'unknown'}; clear status is required.`);
  }
  if (pick.usedStatus !== 'available') {
    return stoppedDraftResult(state, 'blocked-pick-availability', `Draft pick ${requestedPickId} usedStatus must be available.`);
  }
  const teamRows = state.teams.filter(row => row.teamCode === ownerTeamCode);
  if (teamRows.length !== 1) return stoppedDraftResult(state, 'blocked-team', `Pick owner team ${ownerTeamCode} is not uniquely present in LeagueState.`);
  const team = teamRows[0];
  const strategyProfile = String(team.strategyProfile ?? 'balanced').toLowerCase();
  if (!CPU_DRAFT_PROFILES.has(strategyProfile)) {
    return stoppedDraftResult(state, 'blocked-strategy-profile', `Team ${ownerTeamCode} has unsupported draft strategy profile ${strategyProfile}.`);
  }

  const board = evaluateDraftBoard({ prospects, team, strategyProfile });
  const candidateByKey = new Map();
  for (const prospect of prospects) {
    const key = normalizeCanonicalPlayerName(prospect?.canonicalName);
    if (!key || prospect?.identityStatus !== 'resolved') continue;
    const rows = candidateByKey.get(key) ?? [];
    rows.push(prospect);
    candidateByKey.set(key, rows);
  }
  const duplicateCandidateNames = [...candidateByKey.entries()].filter(([, rows]) => rows.length !== 1).map(([key]) => key);
  if (duplicateCandidateNames.length) {
    return stoppedDraftResult(state, 'blocked-prospect-identity', 'Prospect input contains duplicate resolved canonical names.', {
      duplicateCandidateNames,
      board,
    });
  }

  const eligible = [];
  const held = [];
  for (const [boardIndex, row] of board.rankedProspects.entries()) {
    const key = normalizeCanonicalPlayerName(row.canonicalName);
    const candidates = candidateByKey.get(key) ?? [];
    if (row.identityStatus !== 'resolved' || !Number.isFinite(row.value) || candidates.length !== 1) {
      held.push({ canonicalName: row.canonicalName, status: row.status, reason: 'Identity or usable supplied board value is unresolved.' });
      continue;
    }
    const existingPlayer = resolvePlayerByCanonicalName(state.players, candidates[0].canonicalName);
    if (existingPlayer.status !== 'unresolved') {
      held.push({ canonicalName: row.canonicalName, status: 'held-existing-player', reason: 'Prospect name already exists in the LeagueState player pool.' });
      continue;
    }
    eligible.push({ boardRank: boardIndex + 1, row, prospect: candidates[0] });
  }
  eligible.sort((a, b) => (b.row.value - a.row.value) ||
    normalizeCanonicalPlayerName(a.row.canonicalName).localeCompare(normalizeCanonicalPlayerName(b.row.canonicalName), 'en'));
  if (!eligible.length) {
    return stoppedDraftResult(state, 'no-eligible-prospects', 'No resolved, unused prospect has a usable supplied board value.', { board, held });
  }

  const pool = eligible.slice(0, CPU_DRAFT_POOL_SIZE).map((candidate, index) => ({
    ...candidate,
    selectionRank: index + 1,
    drawWeight: 1 / (index + 1),
  }));
  const totalWeight = pool.reduce((sum, candidate) => sum + candidate.drawWeight, 0);
  let draw = seededUnit(seed) * totalWeight;
  let selected = pool[pool.length - 1];
  for (const candidate of pool) {
    draw -= candidate.drawWeight;
    if (draw < 0) { selected = candidate; break; }
  }

  const userControlled = new Set((state.userControlledTeamCodes ?? []).map(code => String(code).toUpperCase())).has(ownerTeamCode);
  const proposal = createDraftSelectionProposal({
    state,
    teamCode: ownerTeamCode,
    prospect: selected.prospect,
    pickId: requestedPickId,
    userControlledTeamCodes: state.userControlledTeamCodes,
    fixedSeed: seed,
  });
  const evaluation = evaluateDraftSelection(state, proposal, { ruleEngine });
  const decisionReceipt = {
    format: 'djhc-cpu-draft-decision-receipt-v1',
    schemaVersion: '1.0.0',
    stateRevision: state.revision,
    seasonStartYear: state.seasonStartYear,
    pickId: requestedPickId,
    ownerTeamCode,
    ...(provisionalScenarioOwner ? {
      scenarioPickLedgerReceiptSha256: scenarioPickLedgerReceipt.integritySha256,
      pickOwnershipStatus: 'provisional-sandbox-scenario',
      pickSourceOwnerTeamCode: scenarioRow.sourceOwnerTeamCode,
      pickTransferProposalIds: scenarioRow.transactionRefs.map(row => row.proposalId),
      pickOwnershipDisclosure: 'Uses the explicit provisional sandbox transfer chain for this simulation only; authoritative rights, protections, swaps and Stepien legality remain unresolved.',
    } : {}),
    strategyProfile,
    seed,
    selectionPolicy: 'seeded-rank-weighted-top-three-v1',
    rankedPool: pool.map(candidate => ({
      rank: candidate.selectionRank,
      boardRank: candidate.boardRank,
      canonicalName: candidate.row.canonicalName,
      value: candidate.row.value,
      coverage: candidate.row.coverage,
      uncertainty: candidate.row.uncertainty,
      drawWeight: candidate.drawWeight,
      sourceRefs: [...candidate.row.sourceRefs],
    })),
    selected: {
      canonicalName: selected.row.canonicalName,
      rank: selected.selectionRank,
      boardRank: selected.boardRank,
      value: selected.row.value,
      coverage: selected.row.coverage,
      uncertainty: selected.row.uncertainty,
    },
    heldProspects: held,
    rationale: `Team strategy ${strategyProfile} ranked supplied prospects; a seeded inverse-rank draw selected ${selected.row.canonicalName}.`,
    disclosure: 'Strategy weights and seeded inverse-rank sampling are explicit prototype policies. They are not calibrated to real NBA team preferences or validated prospect projections.',
  };

  if (evaluation.status === 'illegal') {
    return stoppedDraftResult(state, 'blocked-transaction', 'The selected prospect or rookie contract failed transaction validation.', {
      board, decisionReceipt, proposal, evaluation,
    });
  }
  if (userControlled && evaluation.userApprovalRequired && !evaluation.approvalReceived) {
    const approvalOnlyBlock = evaluation.blockedReasons.every(reason => reason.includes('User approval is required'));
    const modeAllows = evaluation.status === 'confirmed-legal' ||
      (evaluation.status === 'provisional' && state.mode === 'provisional-sandbox');
    if (approvalOnlyBlock && modeAllows) {
      return {
        format: 'djhc-cpu-draft-pick-result-v1',
        status: 'awaiting-user-approval',
        state: structuredClone(state),
        board,
        selection: selected.row.canonicalName,
        proposal,
        evaluation,
        decisionReceipt,
        violations: [],
      };
    }
  }
  if (!['ready', 'ready-provisional-sandbox'].includes(evaluation.executionStatus)) {
    return stoppedDraftResult(state, 'blocked-transaction', 'The draft selection is not executable under current state and rules.', {
      board, selection: selected.row.canonicalName, decisionReceipt, proposal, evaluation,
    });
  }

  const applied = applyTransaction(state, proposal, { ruleEngine });
  return {
    format: 'djhc-cpu-draft-pick-result-v1',
    status: applied.evaluation.status === 'confirmed-legal' ? 'committed' : 'committed-provisional',
    state: applied.state,
    board,
    selection: selected.row.canonicalName,
    proposal,
    evaluation: applied.evaluation,
    decisionReceipt,
    violations: [],
  };
}
