import {
  SWISHIQ_PUBLIC_PLAYER_REF,
  assertSwishIqPublicSafe,
  sha256Text,
  stableJson,
} from './swishiq-static-projection.mjs';
import { validateSwishIqStaticDailyBoard } from './swishiq-static-daily-board.mjs';
import {
  POINT_RULE_VERSION,
  PREVIOUS_POINT_RULE_VERSION,
  RESULT_PASSPORT_VERSION,
  buildDecisionPoints,
  createResultPassport,
  createScenarioEnvelope,
  decisionProofStatus,
  isResultPassport,
  normalizeResultEvidence,
} from '../../tools/result-passport.js';

/**
 * Server-neutral request and response boundary for swishiq-game-evaluate.
 *
 * This module performs no network, package, or answer-key I/O. A service
 * using it must resolve the static board internally, validate its registry and
 * projection binding, then evaluate sealed answer material separately. The
 * result body deliberately uses the one shared Result Passport contract from
 * tools/result-passport.js; it does not define a second Passport schema.
 */
export const SWISHIQ_GAME_EVALUATE_REQUEST_FORMAT = 'djhc-swishiq-game-evaluate-request-v1';
export const SWISHIQ_GAME_EVALUATE_RESPONSE_FORMAT = 'djhc-swishiq-game-evaluate-response-v1';
export const SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION = 1;
export const SWISHIQ_GAME_EVALUATE_RESULT_CONTRACT_FORMAT = 'djhc-swishiq-result-passport-v1';
export const SWISHIQ_GAME_POINTS_SYSTEM = POINT_RULE_VERSION;

const FIX_CHALLENGE_ID = /^fix-[a-z0-9][a-z0-9-]{1,62}$/;
const DRAFT_ROUND_ID = /^draft-round-[1-5]-[a-z0-9][a-z0-9-]{0,54}$/;
const OUTCOME_UNITS = Object.freeze({
  'point-margin': 'points',
  'points-advantage': 'points',
  'net-rating-difference': 'points-per-100-possessions',
});
const OUTCOME_STATES = new Set(['observed', 'reconstructed', 'estimated', 'synthetic', 'simulated']);
const BENCHMARK_IDS = new Set(['baseline-lineup', 'best-legal-choice', 'league-average', 'same-board-legal-set']);
const PROOF_KINDS = new Set(['exact-enumeration', 'valid-bound', 'evaluated-set']);
const DECISION_STATES = new Set(['best-proven', 'best-found']);
const DECISION_QUALITIES = new Set(['best-legal-choice', 'best-found']);
const EVALUATOR_EVIDENCE_KEYS = Object.freeze([
  'boardRef', 'resultContract', 'evidenceVersion', 'evidenceLabel', 'sourceNote',
  'sourceNotes', 'scope', 'phase', 'denominator', 'coverage', 'reliability', 'uncertainty',
]);
const FORBIDDEN_KEY = /(?:provider|canonical|crosswalk|mapping|raw|archive|coefficient|rapm|private|secret|token|password|source(?!locksha256$|note$|notes$)|answer|correct|solution|legacy|roundscore|fitpoints|fit[_-]?points|projection(?!contentsha256$)|artifact|records|(?:^|[_-])(?:player|team|game)id$)/i;

export class SwishIqGameEvaluateContractError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'SwishIqGameEvaluateContractError';
    this.issues = [...(issues.length ? issues : [message])];
  }
}

function fail(message, issues = []) {
  throw new SwishIqGameEvaluateContractError(message, issues);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys, label) {
  if (!plainObject(value)) fail(label + ' must be a plain object.');
  const unexpected = Object.keys(value).filter(key => !keys.includes(key));
  const missing = keys.filter(key => !Object.hasOwn(value, key));
  if (unexpected.length || missing.length) {
    fail(label + ' fields are invalid.' + (unexpected.length ? ' Unexpected: ' + unexpected.join(', ') + '.' : '')
      + (missing.length ? ' Missing: ' + missing.join(', ') + '.' : ''));
  }
}

function text(value, label, expression = null, { lower = false, max = 240 } = {}) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(label + ' is invalid.');
  const normalized = lower ? value.trim().toLowerCase() : value.trim();
  if (expression && !expression.test(normalized)) fail(label + ' is invalid.');
  return normalized;
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(label + ' is invalid.');
  return value;
}

function finite(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(label + ' is invalid.');
  return value;
}

function normalizePlayerRef(value, label) {
  return text(value, label, SWISHIQ_PUBLIC_PLAYER_REF, { lower: true, max: 34 });
}

function assertPublicBoundary(value, label) {
  try {
    assertSwishIqPublicSafe(value, label);
  } catch (error) {
    fail(error.message);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicBoundary(item, label + '[' + String(index) + ']'));
    return;
  }
  if (!plainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) fail(label + '.' + key + ' is not allowed at the evaluator boundary.');
    assertPublicBoundary(nested, label + '.' + key);
  }
}

function resultContract(gamePointsSystem = SWISHIQ_GAME_POINTS_SYSTEM) {
  if (![POINT_RULE_VERSION, PREVIOUS_POINT_RULE_VERSION].includes(gamePointsSystem)) {
    fail('The shared Result Passport is not configured for SwishIQ Game Points.');
  }
  return {
    format: SWISHIQ_GAME_EVALUATE_RESULT_CONTRACT_FORMAT,
    version: RESULT_PASSPORT_VERSION,
    gamePointsSystem,
  };
}

function normalizeResultContract(value) {
  exactKeys(value, ['format', 'version', 'gamePointsSystem'], 'result contract');
  const normalized = {
    format: text(value.format, 'result contract format', /^djhc-swishiq-result-passport-v1$/, { max: 80 }),
    version: integer(value.version, 'result contract version', { min: RESULT_PASSPORT_VERSION, max: RESULT_PASSPORT_VERSION }),
    gamePointsSystem: text(value.gamePointsSystem, 'result contract gamePointsSystem', /^swishiq-game-points-v[12]$/, { max: 80 }),
  };
  if (stableJson(normalized) !== stableJson(resultContract(normalized.gamePointsSystem))) fail('Result contract is unsupported.');
  return normalized;
}

/**
 * This public board fingerprint repeats all version and package pins required
 * to validate the static board, but excludes choice lists and sealed answer
 * fields. The evaluator must load the real board by ID and compare this value
 * before it reads private answer material.
 */
export function swishIqGameEvaluateBoardRef(board) {
  return {
    format: board.format,
    contractVersion: board.contractVersion,
    publicationStatus: board.publicationStatus,
    boardId: board.boardId,
    generatedAt: board.generatedAt,
    dailySeed: board.dailySeed,
    gameKind: board.gameKind,
    family: board.family,
    packageRef: board.packageRef,
    gamePointsPolicy: board.gamePointsPolicy,
    boardContentSha256: board.boardContentSha256,
  };
}

function normalizeBoardRef(value, board) {
  exactKeys(value, [
    'format',
    'contractVersion',
    'publicationStatus',
    'boardId',
    'generatedAt',
    'dailySeed',
    'gameKind',
    'family',
    'packageRef',
    'gamePointsPolicy',
    'boardContentSha256',
  ], 'evaluator boardRef');
  const expected = swishIqGameEvaluateBoardRef(board);
  if (stableJson(value) !== stableJson(expected)) fail('Evaluator boardRef does not match the validated board.');
  return expected;
}

function normalizeFixSelection(value, board) {
  exactKeys(value, ['kind', 'challengeId', 'playerRef'], 'Fix the Five selection');
  if (value.kind !== 'fix-the-five') fail('Fix the Five selection kind is invalid.');
  const challengeId = text(value.challengeId, 'Fix the Five challengeId', FIX_CHALLENGE_ID, { lower: true, max: 64 });
  const playerRef = normalizePlayerRef(value.playerRef, 'Fix the Five playerRef');
  const challenge = board.challenges.find(item => item.challengeId === challengeId);
  if (!challenge) fail('Fix the Five selection challenge is not on this board.');
  if (!challenge.candidates.some(candidate => candidate.playerRef === playerRef)) {
    fail('Fix the Five selection is not a legal candidate.');
  }
  return { kind: 'fix-the-five', challengeId, playerRef };
}

function normalizeDraftSelection(value, board) {
  exactKeys(value, ['kind', 'picks'], 'Draft Night selection');
  if (value.kind !== 'draft-night') fail('Draft Night selection kind is invalid.');
  if (!Array.isArray(value.picks) || value.picks.length !== board.deck.rounds.length) {
    fail('Draft Night selection must contain one pick for each round.');
  }
  const picks = value.picks.map((pick, index) => {
    exactKeys(pick, ['roundId', 'playerRef'], 'Draft Night pick ' + String(index + 1));
    const roundId = text(pick.roundId, 'Draft Night pick ' + String(index + 1) + ' roundId', DRAFT_ROUND_ID, { lower: true, max: 64 });
    const playerRef = normalizePlayerRef(pick.playerRef, 'Draft Night pick ' + String(index + 1) + ' playerRef');
    const round = board.deck.rounds[index];
    if (roundId !== round.roundId) fail('Draft Night picks are not in the board round order.');
    if (!round.candidates.some(candidate => candidate.playerRef === playerRef)) {
      fail('Draft Night pick ' + String(index + 1) + ' is not a legal candidate.');
    }
    return { roundId, playerRef };
  });
  return { kind: 'draft-night', picks };
}

function normalizeSelection(value, board) {
  if (!plainObject(value)) fail('Evaluator selection must be a plain object.');
  return board.gameKind === 'fix-the-five'
    ? normalizeFixSelection(value, board)
    : normalizeDraftSelection(value, board);
}

function validatedBoard({ board, registry, projectionIndex } = {}) {
  if (!board || !registry || !projectionIndex) {
    fail('Evaluator validation requires a static board, registry, and projection index.');
  }
  return validateSwishIqStaticDailyBoard(board, { registry, projectionIndex });
}

function selectedPlayerRefs(selection) {
  return selection.kind === 'fix-the-five'
    ? [selection.playerRef]
    : selection.picks.map(pick => pick.playerRef);
}

function expectedRunId(request) {
  return 'run-' + sha256Text(stableJson({
    boardRef: request.boardRef,
    resultContract: request.resultContract,
    selection: request.selection,
  })).slice(0, 32);
}

function scenarioForRequest(request) {
  const packageRef = request.boardRef.packageRef;
  return createScenarioEnvelope({
    kind: request.boardRef.gameKind,
    packageRef: {
      id: packageRef.packageId,
      format: 'djhc-swishiq-package-v3',
      version: packageRef.packageVersion,
      registryVersion: packageRef.registryVersion,
      registryRevisionSha256: packageRef.registryRevisionSha256,
      manifestSha256: packageRef.packageManifestSha256,
      projectionContentSha256: packageRef.projectionContentSha256,
      sourceLockSha256: packageRef.sourceLockSha256,
      modelId: packageRef.modelId,
    },
    participants: { playerRefs: selectedPlayerRefs(request.selection) },
    objective: {
      id: 'swishiq-game-evaluate',
      version: SWISHIQ_GAME_EVALUATE_REQUEST_FORMAT,
    },
    rules: {
      boardId: request.boardRef.boardId,
      boardContentSha256: request.boardRef.boardContentSha256,
      gamePointsPolicy: request.boardRef.gamePointsPolicy,
      selection: request.selection,
    },
    schedule: {
      season: packageRef.scope.seasonStartYear,
      seasonEndYear: packageRef.scope.seasonEndYear,
      phase: packageRef.phase,
    },
    execution: {
      modelId: packageRef.modelId,
      seed: request.boardRef.boardContentSha256,
    },
    evaluation: {
      evaluatorFormat: SWISHIQ_GAME_EVALUATE_REQUEST_FORMAT,
      evaluatorContractVersion: SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION,
      boardId: request.boardRef.boardId,
      boardContentSha256: request.boardRef.boardContentSha256,
      exactPackageRequired: true,
      packageRef,
      gamePointsPolicy: request.boardRef.gamePointsPolicy,
      resultContract: request.resultContract,
    },
  });
}

function normalizeCoverage(value) {
  exactKeys(value, ['status', 'observations'], 'native outcome coverage');
  const status = text(value.status, 'native outcome coverage status', /^(complete|partial|unavailable)$/, { lower: true, max: 40 });
  const observations = integer(value.observations, 'native outcome coverage observations', { min: 0, max: 1_000_000_000 });
  if (status === 'unavailable' && observations !== 0) fail('Unavailable native outcome coverage cannot claim observations.');
  return { status, observations };
}

function normalizeUncertainty(value, unit) {
  if (!plainObject(value)) fail('Native outcome uncertainty must be a plain object.');
  const status = text(value.status, 'native outcome uncertainty status', /^(interval|not-available)$/, { lower: true, max: 40 });
  if (status === 'not-available') {
    exactKeys(value, ['status'], 'native outcome uncertainty');
    return { status };
  }
  exactKeys(value, ['status', 'lower', 'upper', 'unit'], 'native outcome uncertainty');
  const intervalUnit = text(value.unit, 'native outcome uncertainty unit', /^(points|points-per-100-possessions)$/, { max: 80 });
  if (intervalUnit !== unit) fail('Native outcome uncertainty unit does not match the outcome.');
  const lower = finite(value.lower, 'native outcome uncertainty lower', { min: -1000, max: 1000 });
  const upper = finite(value.upper, 'native outcome uncertainty upper', { min: -1000, max: 1000 });
  if (lower > upper) fail('Native outcome uncertainty interval is invalid.');
  return { status, lower, upper, unit: intervalUnit };
}

/** Normalize the bounded native-outcome subset used by games. */
function normalizeNativeOutcomeInput(value) {
  exactKeys(value, ['kind', 'unit', 'value', 'state', 'benchmarkId', 'coverage', 'uncertainty'], 'native outcome');
  const kind = text(value.kind, 'native outcome kind', /^(point-margin|points-advantage|net-rating-difference)$/, { max: 80 });
  const unit = text(value.unit, 'native outcome unit', /^(points|points-per-100-possessions)$/, { max: 80 });
  if (OUTCOME_UNITS[kind] !== unit) fail('Native outcome kind and unit are incompatible.');
  const state = text(value.state, 'native outcome state', null, { lower: true, max: 40 });
  if (!OUTCOME_STATES.has(state)) fail('Native outcome state is invalid.');
  const benchmarkId = text(value.benchmarkId, 'native outcome benchmarkId', null, { lower: true, max: 80 });
  if (!BENCHMARK_IDS.has(benchmarkId)) fail('Native outcome benchmarkId is invalid.');
  return {
    kind,
    unit,
    value: finite(value.value, 'native outcome value', { min: -1000, max: 1000 }),
    direction: 'higher-is-better',
    state,
    benchmarkId,
    coverage: normalizeCoverage(value.coverage),
    uncertainty: normalizeUncertainty(value.uncertainty, unit),
  };
}

function normalizeSharedNativeOutcome(value) {
  exactKeys(value, ['kind', 'unit', 'direction', 'state', 'benchmarkId', 'value', 'coverage', 'uncertainty'], 'Result Passport nativeOutcome');
  const input = {
    kind: value.kind,
    unit: value.unit,
    value: value.value,
    state: value.state,
    benchmarkId: value.benchmarkId,
    coverage: value.coverage,
    uncertainty: value.uncertainty,
  };
  const normalized = normalizeNativeOutcomeInput(input);
  if (value.direction !== normalized.direction) fail('Result Passport nativeOutcome direction is invalid.');
  return normalized;
}

function normalizeConstraints(value) {
  exactKeys(value, ['completed', 'total'], 'Result Passport constraints');
  const total = integer(value.total, 'Result Passport constraints total', { min: 0, max: 100 });
  const completed = integer(value.completed, 'Result Passport constraints completed', { min: 0, max: total });
  return { completed, total };
}

function normalizeDecisionInput(value, { nativeOutcome, selection } = {}) {
  exactKeys(value, ['rank', 'optionCount', 'gapToBest', 'gapUnit', 'state', 'quality', 'proof', 'search'], 'decision');
  const optionCount = integer(value.optionCount, 'decision optionCount', { min: 1, max: 1_000_000 });
  const rank = integer(value.rank, 'decision rank', { min: 1, max: optionCount });
  const gapToBest = finite(value.gapToBest, 'decision gapToBest', { min: 0, max: 1000 });
  const gapUnit = text(value.gapUnit, 'decision gapUnit', /^(points|points-per-100-possessions)$/, { max: 80 });
  if (gapUnit !== nativeOutcome.unit) fail('Decision gap must use the native outcome unit.');
  if (rank === 1 && gapToBest !== 0) fail('The top legal choice must have a zero gap to best.');
  const state = text(value.state, 'decision state', /^(best-proven|best-found)$/, { lower: true, max: 40 });
  const quality = text(value.quality, 'decision quality', /^(best-legal-choice|best-found)$/, { lower: true, max: 40 });
  if (!DECISION_STATES.has(state) || !DECISION_QUALITIES.has(quality)) fail('Decision state or quality is invalid.');
  exactKeys(value.proof, ['kind'], 'decision proof');
  const proofKind = text(value.proof.kind, 'decision proof kind', null, { lower: true, max: 40 });
  if (!PROOF_KINDS.has(proofKind)) fail('Decision proof kind is invalid.');
  exactKeys(value.search, ['exact', 'evaluatedChoices'], 'decision search');
  if (typeof value.search.exact !== 'boolean') fail('Decision search exact flag is invalid.');
  const evaluatedChoices = integer(value.search.evaluatedChoices, 'decision search evaluatedChoices', { min: 1, max: optionCount });
  if (state === 'best-proven' && (rank !== 1 || quality !== 'best-legal-choice'
    || !['exact-enumeration', 'valid-bound'].includes(proofKind) || value.search.exact !== true)) {
    fail('best-proven needs the top legal rank and a complete proof.');
  }
  if (state === 'best-found' && quality !== 'best-found') fail('best-found must use the best-found quality label.');
  return {
    rank,
    optionCount,
    choicesBeaten: optionCount - rank,
    gapToBest,
    gapUnit,
    choiceId: 'choice-' + sha256Text(stableJson(selection)).slice(0, 24),
    state,
    quality,
    proof: { kind: proofKind, legalChoices: optionCount },
    search: { exact: value.search.exact, evaluatedChoices },
  };
}

function normalizeSharedDecision(value, { nativeOutcome, selection } = {}) {
  exactKeys(value, [
    'rank',
    'optionCount',
    'choicesBeaten',
    'gapToBest',
    'gapUnit',
    'choiceId',
    'state',
    'quality',
    'proof',
    'search',
  ], 'Result Passport decision');
  exactKeys(value.proof, ['kind', 'legalChoices'], 'Result Passport decision proof');
  exactKeys(value.search, ['exact', 'evaluatedChoices'], 'Result Passport decision search');
  const normalized = normalizeDecisionInput({
    rank: value.rank,
    optionCount: value.optionCount,
    gapToBest: value.gapToBest,
    gapUnit: value.gapUnit,
    state: value.state,
    quality: value.quality,
    proof: { kind: value.proof.kind },
    search: value.search,
  }, { nativeOutcome, selection });
  if (stableJson(value) !== stableJson(normalized)) fail('Result Passport decision is not derived from the validated selection.');
  return normalized;
}

function normalizeSharedGamePoints(value, { decision, constraints, gamePointsPolicy } = {}) {
  exactKeys(value, ['ruleVersion', 'validChoice', 'ruleCompletion', 'placement', 'total', 'max', 'breakdown'], 'Result Passport gamePoints');
  const expected = buildDecisionPoints({
    rank: decision.rank,
    optionCount: decision.optionCount,
    rankProofComplete: decisionProofStatus(decision).countComplete,
    validCompletedChoice: true,
    rulesCompleted: constraints.completed,
    rulesTotal: constraints.total,
    placementTiers: gamePointsPolicy.placementTiers,
    ruleVersion: gamePointsPolicy.ruleVersion,
  });
  if (!expected || stableJson(value) !== stableJson(expected)) {
    fail('Result Passport gamePoints are not derived from the shared SwishIQ rule.');
  }
  return expected;
}

function expectedEvidence(request, metadata = null) {
  const base = {
    boardRef: request.boardRef,
    resultContract: request.resultContract,
  };
  if (metadata === null || metadata === undefined) return base;
  if (!plainObject(metadata)) fail('Evaluator evidence metadata must be a plain object.');
  if (metadata.boardRef !== undefined && stableJson(metadata.boardRef) !== stableJson(base.boardRef)) {
    fail('Evaluator evidence board pins do not match the request.');
  }
  if (metadata.resultContract !== undefined && stableJson(metadata.resultContract) !== stableJson(base.resultContract)) {
    fail('Evaluator evidence result contract does not match the request.');
  }
  const candidate = { ...metadata, boardRef: metadata.boardRef ?? base.boardRef, resultContract: metadata.resultContract ?? base.resultContract };
  const unexpected = Object.keys(candidate).filter(key => !EVALUATOR_EVIDENCE_KEYS.includes(key));
  if (unexpected.length) fail('Evaluator evidence contains unsupported fields.');
  const normalized = normalizeResultEvidence(candidate, { required: true });
  if (stableJson(normalized.boardRef) !== stableJson(base.boardRef)
    || stableJson(normalized.resultContract) !== stableJson(base.resultContract)) {
    fail('Evaluator evidence board or result contract pins do not match the request.');
  }
  return normalized;
}

function expectedReplay(request) {
  return {
    boardId: request.boardRef.boardId,
    boardContentSha256: request.boardRef.boardContentSha256,
    gamePointsPolicy: request.boardRef.gamePointsPolicy,
    packageId: request.boardRef.packageRef.packageId,
    packageVersion: request.boardRef.packageRef.packageVersion,
    exactPackageRequired: true,
  };
}

function buildSharedResultPassport({ request, nativeOutcome, decision, constraints, evidence = null } = {}) {
  const scenario = scenarioForRequest(request);
  const normalizedNativeOutcome = normalizeNativeOutcomeInput(nativeOutcome);
  const normalizedConstraints = normalizeConstraints(constraints);
  const normalizedDecision = normalizeDecisionInput(decision, {
    nativeOutcome: normalizedNativeOutcome,
    selection: request.selection,
  });
  const gamePoints = buildDecisionPoints({
    rank: normalizedDecision.rank,
    optionCount: normalizedDecision.optionCount,
    rankProofComplete: decisionProofStatus(normalizedDecision).countComplete,
    validCompletedChoice: true,
    rulesCompleted: normalizedConstraints.completed,
    rulesTotal: normalizedConstraints.total,
    placementTiers: request.boardRef.gamePointsPolicy.placementTiers,
    ruleVersion: request.boardRef.gamePointsPolicy.ruleVersion,
  });
  if (!gamePoints || gamePoints.ruleVersion !== request.boardRef.gamePointsPolicy.ruleVersion) {
    fail('Shared Result Passport did not create SwishIQ Game Points.');
  }
  return createResultPassport({
    scenario,
    runId: expectedRunId(request),
    status: 'complete',
    nativeOutcome: normalizedNativeOutcome,
    decision: normalizedDecision,
    gamePoints,
    constraints: normalizedConstraints,
    evidence: expectedEvidence(request, evidence),
    replay: expectedReplay(request),
    compatibility: null,
  });
}

/** Build a request from a fully validated public board and legal p_ selection. */
export function buildSwishIqGameEvaluateRequest({ board, registry, projectionIndex, selection } = {}) {
  const normalizedBoard = validatedBoard({ board, registry, projectionIndex });
  const normalizedSelection = normalizeSelection(selection, normalizedBoard);
  return validateSwishIqGameEvaluateRequest({
    format: SWISHIQ_GAME_EVALUATE_REQUEST_FORMAT,
    contractVersion: SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION,
    action: 'evaluate',
    boardRef: swishIqGameEvaluateBoardRef(normalizedBoard),
    resultContract: resultContract(normalizedBoard.gamePointsPolicy.ruleVersion),
    selection: normalizedSelection,
  }, { board: normalizedBoard, registry, projectionIndex });
}

/**
 * Validate a request after resolving the same static board internally. A
 * self-asserted request cannot prove that a package is published or exact.
 */
export function validateSwishIqGameEvaluateRequest(value, { board, registry, projectionIndex } = {}) {
  const normalizedBoard = validatedBoard({ board, registry, projectionIndex });
  exactKeys(value, ['format', 'contractVersion', 'action', 'boardRef', 'resultContract', 'selection'], 'evaluator request');
  if (value.format !== SWISHIQ_GAME_EVALUATE_REQUEST_FORMAT
    || value.contractVersion !== SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION
    || value.action !== 'evaluate') {
    fail('Evaluator request format is unsupported.');
  }
  const normalized = {
    format: SWISHIQ_GAME_EVALUATE_REQUEST_FORMAT,
    contractVersion: SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION,
    action: 'evaluate',
    boardRef: normalizeBoardRef(value.boardRef, normalizedBoard),
    resultContract: normalizeResultContract(value.resultContract),
    selection: normalizeSelection(value.selection, normalizedBoard),
  };
  if (normalized.resultContract.gamePointsSystem !== normalizedBoard.gamePointsPolicy.ruleVersion) {
    fail('Result contract Game Points do not match the validated board policy.');
  }
  assertPublicBoundary(normalized, 'evaluator request');
  return normalized;
}

/**
 * Build a complete evaluator response after a private service has evaluated a
 * published board against its verified package. The supplied fields become the shared Result
 * Passport; there is no output field for package projection data or answers.
 */
export function buildSwishIqGameEvaluateResponse({
  request,
  board,
  registry,
  projectionIndex,
  nativeOutcome,
  decision,
  constraints,
  evidence = null,
} = {}) {
  const normalizedRequest = validateSwishIqGameEvaluateRequest(request, { board, registry, projectionIndex });
  const resultPassport = buildSharedResultPassport({
    request: normalizedRequest,
    nativeOutcome,
    decision,
    constraints,
    evidence,
  });
  return validateSwishIqGameEvaluateResponse({
    format: SWISHIQ_GAME_EVALUATE_RESPONSE_FORMAT,
    contractVersion: SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION,
    action: 'evaluate',
    boardRef: normalizedRequest.boardRef,
    resultContract: normalizedRequest.resultContract,
    selection: normalizedRequest.selection,
    resultPassport,
  }, { request: normalizedRequest, board, registry, projectionIndex });
}

/**
 * Validate a response against the original validated request. It cannot
 * substitute a board, package version, selection, point system, or Passport
 * contract; strict output fields leave no route for a package projection.
 */
export function validateSwishIqGameEvaluateResponse(value, {
  request,
  board,
  registry,
  projectionIndex,
} = {}) {
  const normalizedRequest = validateSwishIqGameEvaluateRequest(request, { board, registry, projectionIndex });
  const normalizedBoard = validatedBoard({ board, registry, projectionIndex });
  exactKeys(value, ['format', 'contractVersion', 'action', 'boardRef', 'resultContract', 'selection', 'resultPassport'], 'evaluator response');
  if (value.format !== SWISHIQ_GAME_EVALUATE_RESPONSE_FORMAT
    || value.contractVersion !== SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION
    || value.action !== 'evaluate') {
    fail('Evaluator response format is unsupported.');
  }
  const boardRef = normalizeBoardRef(value.boardRef, normalizedBoard);
  const responseResultContract = normalizeResultContract(value.resultContract);
  const selection = normalizeSelection(value.selection, normalizedBoard);
  if (stableJson(boardRef) !== stableJson(normalizedRequest.boardRef)
    || stableJson(responseResultContract) !== stableJson(normalizedRequest.resultContract)
    || stableJson(selection) !== stableJson(normalizedRequest.selection)) {
    fail('Evaluator response does not bind the validated request.');
  }
  const passport = value.resultPassport;
  exactKeys(passport, [
    'version',
    'runId',
    'scenarioHash',
    'scenarioKind',
    'status',
    'nativeOutcome',
    'decision',
    'gamePoints',
    'constraints',
    'evidence',
    'replay',
    'compatibility',
  ], 'shared Result Passport');
  if (!isResultPassport(passport) || passport.version !== RESULT_PASSPORT_VERSION
    || passport.status !== 'complete' || passport.scenarioKind !== normalizedRequest.boardRef.gameKind
    || passport.compatibility !== null) {
    fail('Evaluator response does not contain the shared complete Result Passport.');
  }
  const expectedScenario = scenarioForRequest(normalizedRequest);
  if (passport.scenarioHash !== expectedScenario.scenarioHash || passport.runId !== expectedRunId(normalizedRequest)) {
    fail('Result Passport does not bind the validated board scenario.');
  }
  const nativeOutcome = normalizeSharedNativeOutcome(passport.nativeOutcome);
  const constraints = normalizeConstraints(passport.constraints);
  const decision = normalizeSharedDecision(passport.decision, {
    nativeOutcome,
    selection: normalizedRequest.selection,
  });
  const gamePoints = normalizeSharedGamePoints(passport.gamePoints, {
    decision,
    constraints,
    gamePointsPolicy: normalizedRequest.boardRef.gamePointsPolicy,
  });
  let evidence;
  try {
    evidence = expectedEvidence(normalizedRequest, passport.evidence);
  } catch (error) {
    fail(error?.message || 'Result Passport evidence is invalid.');
  }
  if (stableJson(passport.evidence) !== stableJson(evidence)
    || stableJson(passport.replay) !== stableJson(expectedReplay(normalizedRequest))) {
    fail('Result Passport evidence or replay pins do not match the validated request.');
  }
  const expected = createResultPassport({
    scenario: expectedScenario,
    runId: expectedRunId(normalizedRequest),
    status: 'complete',
    nativeOutcome,
    decision,
    gamePoints,
    constraints,
    evidence,
    replay: expectedReplay(normalizedRequest),
    compatibility: null,
  });
  if (stableJson(passport) !== stableJson(expected)) fail('Result Passport does not match the shared evaluator contract.');
  const normalized = {
    format: SWISHIQ_GAME_EVALUATE_RESPONSE_FORMAT,
    contractVersion: SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION,
    action: 'evaluate',
    boardRef,
    resultContract: responseResultContract,
    selection,
    resultPassport: expected,
  };
  assertPublicBoundary(normalized, 'evaluator response');
  return normalized;
}
