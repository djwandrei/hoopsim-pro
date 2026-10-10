/**
 * Buyer-safe browser boundary for SwishIQ daily games.
 *
 * A board is accepted only after its static registry, exact package projection,
 * package pins, canonical content hash, and legal-choice schema verify. The
 * evaluator receives a semantic public selection and returns one shared Result
 * Passport; it never serves package projections or answer material.
 */

import {
  POINT_RULE_VERSION,
  POINT_RULE_V2_START_SEED,
  PREVIOUS_POINT_RULE_VERSION,
  RESULT_PASSPORT_VERSION,
  buildDecisionPoints,
  createResultPassport,
  createScenarioEnvelope,
  decisionProofStatus,
  isResultPassport,
  normalizeResultEvidence,
} from './result-passport.js?v=20260930f';
import {
  loadSwishIqExactPackageProof,
  sha256Text,
  stableJson,
} from './swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-typed-v4-cutover-gate-v1';
import {
  SWISHIQ_DAILY_GAME_V4_BOARD_FORMAT,
  SwishIqDailyGameV4Error,
  buildSwishIqV4DailyGameRequest,
  dailyGamePinUrl,
  findSwishIqV4DailyGamePin,
  resolveSwishIqDailyGameSourceMode,
  validateSwishIqV4DailyBoard,
  validateSwishIqV4DailyGameResponse,
} from './swishiq-studio/engine/swishiq-daily-game-v4-contract.js?v=20261009b&rev=daily-v4-observed-box-score-v1';

export const SWISHIQ_DAILY_GAME_FORMAT = 'djhc-swishiq-static-daily-board-v1';
export const SWISHIQ_DAILY_GAME_CONTRACT_VERSION = 1;
export const SWISHIQ_DAILY_GAME_KINDS = Object.freeze(['fix-the-five', 'draft-night']);
export const SWISHIQ_DAILY_GAME_FAMILY = 'team-season';
export const SWISHIQ_GAME_EVALUATE_REQUEST_FORMAT = 'djhc-swishiq-game-evaluate-request-v1';
export const SWISHIQ_GAME_EVALUATE_RESPONSE_FORMAT = 'djhc-swishiq-game-evaluate-response-v1';
export const SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION = 1;
export const SWISHIQ_GAME_EVALUATE_RESULT_FORMAT = 'djhc-swishiq-result-passport-v1';

const HASH = /^[a-f0-9]{64}$/;
const PLAYER_REF = /^p_[a-f0-9]{32}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const BOARD_ID = /^swishiq-(?:fix-the-five|draft-night)-\d{8}-[a-f0-9]{12}$/;
const CHALLENGE_ID = /^fix-[a-z0-9][a-z0-9-]{1,62}$/;
const DECK_ID = /^draft-[a-z0-9][a-z0-9-]{1,62}$/;
const ROUND_ID = /^draft-round-[1-5]-[a-z0-9][a-z0-9-]{0,54}$/;
const TEAM_CODES = new Set([
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const POSITIONS = new Set(['G', 'F', 'C']);
const REQUIRED_CAPABILITIES = Object.freeze(['challengePools', 'lineupLab', 'publicAdvancedImpact']);
const REQUIRED_V3_PROOF_ARTIFACTS = Object.freeze({
  challengePools: Object.freeze(['challenge-pools']),
  lineupLab: Object.freeze(['exact-five-evidence', 'lineup-evidence', 'player-impact']),
  publicAdvancedImpact: Object.freeze(['lineup-evidence', 'player-impact']),
});
const V3_NORMALIZER = 'swishiq-v3-canonical-normalizer';
const V3_METRICS_VERSION = 'swishiq-v3-metrics-v1.2';
const EVALUATOR_EVIDENCE_KEYS = Object.freeze([
  'boardRef', 'resultContract', 'evidenceVersion', 'evidenceLabel', 'sourceNote',
  'sourceNotes', 'scope', 'phase', 'denominator', 'coverage', 'reliability', 'uncertainty',
]);
const BOARD_FORBIDDEN_KEY = /(?:provider|canonical|crosswalk|mapping|raw|archive|coefficient|rapm|private|secret|token|password|source(?!locksha256$|note$|notes$)|answer|correct|solution|sealed|outcome|result|rank|score|fitpoints|fit[_-]?points|offen[cs]|defen[cs]|impact|benchmark|formula|modelinput|(?:^|[_-])(?:player|team|game)id$)/i;
const RESPONSE_FORBIDDEN_KEY = /(?:provider|canonical|crosswalk|mapping|raw|archive|coefficient|rapm|private|secret|token|password|source(?!locksha256$|note$|notes$)|answer|correct|solution|fitpoints|fit[_-]?points|roundscore|projection(?!contentsha256$)|artifact|records)/i;
const UUID_IN_TEXT = /[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/i;
const PRIVATE_TEXT = /(?:[A-Za-z]:[\\/]|file:\/\/|\\\\|\/home\/|Bearer\s|service_role|sk_live_|sr:player:)/i;
const validatedBoards = new WeakSet();

function fail(message) {
  throw new Error(message);
}

function object(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys, label) {
  if (!object(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has unsupported or missing fields.`);
  }
}

function text(value, label, pattern = null, maximum = 240) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) fail(`${label} is invalid.`);
  const normalized = value.trim();
  if (pattern && !pattern.test(normalized)) fail(`${label} is invalid.`);
  return normalized;
}

function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`${label} is invalid.`);
  return value;
}

function finite(value, label, minimum = -Infinity, maximum = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(`${label} is invalid.`);
  return value;
}

function assertPublicPayload(value, label, forbiddenKey) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPublicPayload(entry, `${label}[${index}]`, forbiddenKey));
    return;
  }
  if (object(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKey.test(key)) fail(`${label}.${key} is not a public SwishIQ field.`);
      assertPublicPayload(entry, `${label}.${key}`, forbiddenKey);
    }
    return;
  }
  if (typeof value === 'string' && (UUID_IN_TEXT.test(value) || PRIVATE_TEXT.test(value))) {
    fail(`${label} contains a private value.`);
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return;
  fail(`${label} is not JSON-safe.`);
}

export function normalizeDailySeed(value) {
  const seed = text(value, 'Daily date', ISO_DATE, 10);
  const date = new Date(`${seed}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== seed) fail('Daily date is invalid.');
  return seed;
}

export function normalizeOptionalDailySeed(value) {
  if (value == null || value === '') return '';
  return normalizeDailySeed(value);
}

function normalizeInstant(value, label) {
  const normalized = text(value, label, ISO_INSTANT, 40);
  if (!Number.isFinite(Date.parse(normalized))) fail(`${label} is invalid.`);
  return normalized;
}

function normalizeGamePointsPolicy(value) {
  exactKeys(value, ['ruleVersion', 'placementTiers'], 'Game points policy');
  if (![POINT_RULE_VERSION, PREVIOUS_POINT_RULE_VERSION].includes(value.ruleVersion)) {
    fail('Game points policy is unsupported.');
  }
  const maximumPlacement = value.ruleVersion === PREVIOUS_POINT_RULE_VERSION ? 3 : 9;
  if (!Array.isArray(value.placementTiers) || value.placementTiers.length < 2
    || value.placementTiers.length > maximumPlacement + 1) {
    fail('Game points placement tiers are invalid.');
  }
  const tiers = value.placementTiers.map((tier, index) => {
    exactKeys(tier, ['minimumPercentile', 'points'], `Game points tier ${index + 1}`);
    return {
      minimumPercentile: finite(tier.minimumPercentile, `Game points tier ${index + 1} percentile`, 0, 1),
      points: integer(tier.points, `Game points tier ${index + 1} points`, 0, maximumPlacement),
    };
  });
  const last = tiers.at(-1);
  if (tiers[0].points !== maximumPlacement || last.minimumPercentile !== 0 || last.points !== 0
    || tiers.some((tier, index) => index > 0
      && (tier.minimumPercentile >= tiers[index - 1].minimumPercentile || tier.points >= tiers[index - 1].points))) {
    fail('Game points placement tiers are not canonical.');
  }
  return { ruleVersion: value.ruleVersion, placementTiers: tiers };
}

function normalizePositions(value, label) {
  if (!Array.isArray(value) || !value.length || value.length > 3) fail(`${label} is invalid.`);
  const positions = value.map(position => text(position, label, /^[GFC]$/, 1));
  const ordered = [...positions].sort();
  if (new Set(positions).size !== positions.length || positions.some(position => !POSITIONS.has(position))
    || stableJson(value) !== stableJson(ordered)) fail(`${label} is invalid.`);
  return ordered;
}

function normalizePlayer(value, label, packageRef, expectedTeamCode) {
  exactKeys(value, ['playerRef', 'displayName', 'teamCode', 'seasonStartYear', 'phase', 'positions'], label);
  const player = {
    playerRef: text(value.playerRef, `${label} reference`, PLAYER_REF, 34).toLowerCase(),
    displayName: text(value.displayName, `${label} name`, null, 120),
    teamCode: text(value.teamCode, `${label} team`, /^[A-Z]{3}$/, 3),
    seasonStartYear: integer(value.seasonStartYear, `${label} season`, 1947, 2200),
    phase: text(value.phase, `${label} phase`, null, 40).toLowerCase(),
    positions: normalizePositions(value.positions, `${label} positions`),
  };
  if (!TEAM_CODES.has(player.teamCode) || !PHASES.has(player.phase)
    || player.teamCode !== expectedTeamCode
    || player.seasonStartYear !== packageRef.scope.seasonStartYear
    || player.phase !== packageRef.phase) fail(`${label} is outside the pinned team-season.`);
  return player;
}

function distinctPlayers(players, label) {
  if (new Set(players.map(player => player.playerRef)).size !== players.length) fail(`${label} repeats a player.`);
}

function normalizeChallenge(value, index, packageRef) {
  const label = `Fix the Five challenge ${index + 1}`;
  exactKeys(value, ['challengeId', 'title', 'prompt', 'teamCode', 'lineup', 'removePlayerRef', 'candidates'], label);
  const teamCode = text(value.teamCode, `${label} team`, /^[A-Z]{3}$/, 3);
  if (!TEAM_CODES.has(teamCode) || !Array.isArray(value.lineup) || value.lineup.length !== 5
    || !Array.isArray(value.candidates) || value.candidates.length !== 3) fail(`${label} choices are invalid.`);
  const lineup = value.lineup.map((player, playerIndex) => normalizePlayer(player, `${label} lineup player ${playerIndex + 1}`, packageRef, teamCode));
  const candidates = value.candidates.map((player, playerIndex) => normalizePlayer(player, `${label} candidate ${playerIndex + 1}`, packageRef, teamCode));
  distinctPlayers(lineup, `${label} lineup`);
  distinctPlayers(candidates, `${label} candidates`);
  const removePlayerRef = text(value.removePlayerRef, `${label} marked player`, PLAYER_REF, 34).toLowerCase();
  if (!lineup.some(player => player.playerRef === removePlayerRef)
    || candidates.some(candidate => lineup.some(player => player.playerRef === candidate.playerRef))) {
    fail(`${label} replacement scope is invalid.`);
  }
  return {
    challengeId: text(value.challengeId, `${label} ID`, CHALLENGE_ID, 64).toLowerCase(),
    title: text(value.title, `${label} title`, null, 120),
    prompt: text(value.prompt, `${label} prompt`, null, 400),
    teamCode,
    lineup,
    removePlayerRef,
    candidates,
  };
}

function normalizeDeck(value, packageRef) {
  exactKeys(value, ['deckId', 'title', 'prompt', 'rounds'], 'Draft Night deck');
  if (!Array.isArray(value.rounds) || value.rounds.length !== 5) fail('Draft Night needs five rounds.');
  const rounds = value.rounds.map((round, index) => {
    const label = `Draft Night round ${index + 1}`;
    exactKeys(round, ['roundNumber', 'roundId', 'title', 'prompt', 'teamCode', 'candidates'], label);
    const teamCode = text(round.teamCode, `${label} team`, /^[A-Z]{3}$/, 3);
    if (!TEAM_CODES.has(teamCode) || round.roundNumber !== index + 1
      || !Array.isArray(round.candidates) || round.candidates.length !== 3) fail(`${label} is invalid.`);
    const candidates = round.candidates.map((player, playerIndex) => normalizePlayer(player, `${label} candidate ${playerIndex + 1}`, packageRef, teamCode));
    distinctPlayers(candidates, `${label} candidates`);
    return {
      roundNumber: round.roundNumber,
      roundId: text(round.roundId, `${label} ID`, ROUND_ID, 64).toLowerCase(),
      title: text(round.title, `${label} title`, null, 120),
      prompt: text(round.prompt, `${label} prompt`, null, 400),
      teamCode,
      candidates,
    };
  });
  if (new Set(rounds.map(round => round.roundId)).size !== rounds.length) fail('Draft Night repeats a round.');
  return {
    deckId: text(value.deckId, 'Draft Night deck ID', DECK_ID, 64).toLowerCase(),
    title: text(value.title, 'Draft Night deck title', null, 120),
    prompt: text(value.prompt, 'Draft Night deck prompt', null, 400),
    rounds,
  };
}

function normalizePackageRef(value, proof) {
  const keys = [
    'packageId', 'packageVersion', 'packageManifestSha256', 'sourceLockSha256',
    'modelId', 'normalizer', 'metricsVersion', 'scope', 'phase',
    'registryVersion', 'registryRevisionSha256', 'projectionContentSha256',
    'requiredCapabilities',
  ];
  exactKeys(value, keys, 'Board package reference');
  if (!Array.isArray(value.requiredCapabilities)
    || stableJson(value.requiredCapabilities) !== stableJson(REQUIRED_CAPABILITIES)) {
    fail('Board capabilities are invalid.');
  }
  const phase = text(value.phase, 'Board package phase', null, 40).toLowerCase();
  if (!PHASES.has(phase)) fail('Board package phase is invalid.');
  const expected = {
    packageId: proof.package.packageId,
    packageVersion: proof.package.packageVersion,
    packageManifestSha256: proof.package.packageManifestSha256,
    sourceLockSha256: proof.package.sourceLockSha256,
    modelId: proof.package.modelId,
    normalizer: proof.package.normalizer,
    metricsVersion: proof.package.metricsVersion,
    scope: proof.package.scope,
    phase,
    registryVersion: proof.registry.registryVersion,
    registryRevisionSha256: proof.registry.registryRevisionSha256,
    projectionContentSha256: proof.package.projectionContentSha256,
    requiredCapabilities: [...REQUIRED_CAPABILITIES],
  };
  if (stableJson(value) !== stableJson(expected)) fail('Board package reference does not match its published exact package.');
  return expected;
}

function packageExpectation(packageRef) {
  return {
    packageId: packageRef.packageId,
    packageVersion: packageRef.packageVersion,
    packageManifestSha256: packageRef.packageManifestSha256,
    sourceLockSha256: packageRef.sourceLockSha256,
    registryVersion: packageRef.registryVersion,
    registryRevisionSha256: packageRef.registryRevisionSha256,
    projectionContentSha256: packageRef.projectionContentSha256,
    modelId: packageRef.modelId,
    normalizer: packageRef.normalizer,
    metricsVersion: packageRef.metricsVersion,
    scope: packageRef.scope,
  };
}

function assertV3DailyPackageProof(proof) {
  if (!object(proof?.package) || proof.package.modelId !== 'swishiq-v3'
    || !/^nba-swishiq-v3-\d{4}-\d{2}$/.test(String(proof.package.packageId || ''))
    || !/^v3-\d{4}-\d{2}-[a-f0-9]{12}$/.test(String(proof.package.packageVersion || ''))
    || proof.package.normalizer !== V3_NORMALIZER
    || proof.package.metricsVersion !== V3_METRICS_VERSION) {
    fail('Daily games require a hash-validated SwishIQ V3 package proof.');
  }
  if (!object(proof.index) || proof.index.modelId !== 'swishiq-v3'
    || proof.index.packageId !== proof.package.packageId
    || proof.index.packageVersion !== proof.package.packageVersion
    || !Array.isArray(proof.index.artifacts)) {
    fail('Daily V3 proof is not bound to the selected package projection.');
  }
  const artifacts = new Map(proof.index.artifacts.map(artifact => [artifact.artifactId, artifact]));
  for (const capability of REQUIRED_CAPABILITIES) {
    const requiredArtifactIds = REQUIRED_V3_PROOF_ARTIFACTS[capability];
    const registryEvidence = proof.package.capabilities?.[capability];
    const indexEvidence = proof.index.capabilities?.[capability];
    if (registryEvidence?.status !== 'available' || indexEvidence?.status !== 'available') {
      fail(`Daily V3 ${capability} proof is unavailable in the published registry.`);
    }
    for (const artifactId of requiredArtifactIds) {
      if (!registryEvidence.artifactIds?.includes(artifactId)
        || !indexEvidence.artifactIds?.includes(artifactId)) {
        fail(`Daily V3 ${capability} proof is missing ${artifactId}.`);
      }
      const artifact = artifacts.get(artifactId);
      if (!artifact || artifact.kind !== artifactId) {
        fail(`Daily V3 ${capability} proof has no validated ${artifactId} artifact.`);
      }
    }
  }
}

async function normalizeBoard(value, proof) {
  if (!object(value)) fail('SwishIQ daily board is invalid.');
  const gameKind = text(value.gameKind, 'Game kind', /^(fix-the-five|draft-night)$/, 40).toLowerCase();
  exactKeys(value, [
    'format', 'contractVersion', 'publicationStatus', 'boardId', 'generatedAt',
    'dailySeed', 'gameKind', 'family', 'packageRef', 'gamePointsPolicy',
    gameKind === 'fix-the-five' ? 'challenges' : 'deck', 'boardContentSha256',
  ], 'SwishIQ daily board');
  if (value.format !== SWISHIQ_DAILY_GAME_FORMAT || value.contractVersion !== SWISHIQ_DAILY_GAME_CONTRACT_VERSION
    || value.publicationStatus !== 'published' || value.family !== SWISHIQ_DAILY_GAME_FAMILY) {
    fail('SwishIQ daily board format is unsupported.');
  }
  const packageRef = normalizePackageRef(value.packageRef, proof);
  const board = {
    format: SWISHIQ_DAILY_GAME_FORMAT,
    contractVersion: SWISHIQ_DAILY_GAME_CONTRACT_VERSION,
    publicationStatus: 'published',
    boardId: text(value.boardId, 'Board ID', BOARD_ID, 80).toLowerCase(),
    generatedAt: normalizeInstant(value.generatedAt, 'Board generated time'),
    dailySeed: normalizeDailySeed(value.dailySeed),
    gameKind,
    family: SWISHIQ_DAILY_GAME_FAMILY,
    packageRef,
    gamePointsPolicy: normalizeGamePointsPolicy(value.gamePointsPolicy),
    boardContentSha256: text(value.boardContentSha256, 'Board content hash', HASH, 64).toLowerCase(),
  };
  if (gameKind === 'fix-the-five') {
    if (!Array.isArray(value.challenges) || value.challenges.length !== 5) fail('Fix the Five needs five challenges.');
    board.challenges = value.challenges.map((challenge, index) => normalizeChallenge(challenge, index, packageRef));
    if (new Set(board.challenges.map(challenge => challenge.challengeId)).size !== board.challenges.length) fail('Fix the Five repeats a challenge.');
  } else board.deck = normalizeDeck(value.deck, packageRef);
  assertPublicPayload(board, 'SwishIQ daily board', BOARD_FORBIDDEN_KEY);
  const content = { ...board };
  delete content.boardId;
  delete content.boardContentSha256;
  const expectedHash = await sha256Text(stableJson(content));
  const expectedId = `swishiq-${gameKind}-${board.dailySeed.replaceAll('-', '')}-${expectedHash.slice(0, 12)}`;
  if (board.boardContentSha256 !== expectedHash || board.boardId !== expectedId) fail('SwishIQ daily board hash did not verify.');
  return board;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function boardRef(board) {
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

function resultContract(board) {
  return {
    format: SWISHIQ_GAME_EVALUATE_RESULT_FORMAT,
    version: RESULT_PASSPORT_VERSION,
    gamePointsSystem: board.gamePointsPolicy.ruleVersion,
  };
}

function normalizeSelection(board, { challengeId = '', playerRef = '', picks = [] } = {}) {
  if (board.gameKind === 'fix-the-five') {
    const normalizedChallengeId = text(challengeId, 'Challenge ID', CHALLENGE_ID, 64).toLowerCase();
    const normalizedPlayerRef = text(playerRef, 'Player reference', PLAYER_REF, 34).toLowerCase();
    const challenge = board.challenges.find(item => item.challengeId === normalizedChallengeId);
    if (!challenge?.candidates.some(candidate => candidate.playerRef === normalizedPlayerRef)) fail('This player is not a legal choice on the board.');
    return { kind: 'fix-the-five', challengeId: normalizedChallengeId, playerRef: normalizedPlayerRef };
  }
  if (!Array.isArray(picks) || picks.length !== board.deck.rounds.length) fail('Draft Night needs five picks.');
  const normalizedPicks = picks.map((pick, index) => {
    exactKeys(pick, ['roundId', 'playerRef'], `Draft Night pick ${index + 1}`);
    const round = board.deck.rounds[index];
    const roundId = text(pick.roundId, `Draft Night pick ${index + 1} round`, ROUND_ID, 64).toLowerCase();
    const selectedRef = text(pick.playerRef, `Draft Night pick ${index + 1} player`, PLAYER_REF, 34).toLowerCase();
    if (roundId !== round.roundId || !round.candidates.some(candidate => candidate.playerRef === selectedRef)) {
      fail('Draft Night picks do not match the published round order.');
    }
    return { roundId, playerRef: selectedRef };
  });
  if (new Set(normalizedPicks.map(pick => pick.playerRef)).size !== normalizedPicks.length) fail('Draft Night cannot select one player twice.');
  return { kind: 'draft-night', picks: normalizedPicks };
}

function evaluationRequest(board, selection) {
  return {
    format: SWISHIQ_GAME_EVALUATE_REQUEST_FORMAT,
    contractVersion: SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION,
    action: 'evaluate',
    boardRef: boardRef(board),
    resultContract: resultContract(board),
    selection,
  };
}

function scenarioForRequest(request) {
  const packageRef = request.boardRef.packageRef;
  const playerRefs = request.selection.kind === 'fix-the-five'
    ? [request.selection.playerRef]
    : request.selection.picks.map(pick => pick.playerRef);
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
    participants: { playerRefs },
    objective: { id: 'swishiq-game-evaluate', version: SWISHIQ_GAME_EVALUATE_REQUEST_FORMAT },
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
    execution: { modelId: packageRef.modelId, seed: request.boardRef.boardContentSha256 },
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

function normalizeNativeOutcome(value) {
  exactKeys(value, ['kind', 'unit', 'direction', 'state', 'benchmarkId', 'value', 'coverage', 'uncertainty'], 'Result native outcome');
  const units = { 'point-margin': 'points', 'points-advantage': 'points', 'net-rating-difference': 'points-per-100-possessions' };
  const kind = text(value.kind, 'Result outcome kind', /^(point-margin|points-advantage|net-rating-difference)$/, 80);
  const unit = text(value.unit, 'Result outcome unit', /^(points|points-per-100-possessions)$/, 80);
  if (units[kind] !== unit || value.direction !== 'higher-is-better') fail('Result native outcome uses incompatible units.');
  const state = text(value.state, 'Result outcome state', /^(observed|reconstructed|estimated|synthetic|simulated)$/, 40);
  const benchmarkId = text(value.benchmarkId, 'Result benchmark', /^(baseline-lineup|best-legal-choice|league-average|same-board-legal-set)$/, 80);
  exactKeys(value.coverage, ['status', 'observations'], 'Result coverage');
  const coverage = {
    status: text(value.coverage.status, 'Result coverage status', /^(complete|partial|unavailable)$/, 40),
    observations: integer(value.coverage.observations, 'Result observations', 0, 1_000_000_000),
  };
  if (coverage.status === 'unavailable' && coverage.observations !== 0) fail('Unavailable result coverage cannot claim observations.');
  const uncertaintyStatus = text(value.uncertainty?.status, 'Result uncertainty status', /^(interval|not-available)$/, 40);
  let uncertainty;
  if (uncertaintyStatus === 'not-available') {
    exactKeys(value.uncertainty, ['status'], 'Result uncertainty');
    uncertainty = { status: uncertaintyStatus };
  } else {
    exactKeys(value.uncertainty, ['status', 'lower', 'upper', 'unit'], 'Result uncertainty');
    const lower = finite(value.uncertainty.lower, 'Result uncertainty lower', -1000, 1000);
    const upper = finite(value.uncertainty.upper, 'Result uncertainty upper', -1000, 1000);
    if (lower > upper || value.uncertainty.unit !== unit) fail('Result uncertainty is invalid.');
    uncertainty = { status: uncertaintyStatus, lower, upper, unit };
  }
  return { kind, unit, value: finite(value.value, 'Result value', -1000, 1000), direction: 'higher-is-better', state, benchmarkId, coverage, uncertainty };
}

async function normalizeDecision(value, nativeOutcome, selection) {
  exactKeys(value, ['rank', 'optionCount', 'choicesBeaten', 'gapToBest', 'gapUnit', 'choiceId', 'state', 'quality', 'proof', 'search'], 'Result decision');
  const optionCount = integer(value.optionCount, 'Result option count', 1, 1_000_000);
  const rank = integer(value.rank, 'Result rank', 1, optionCount);
  const gapToBest = finite(value.gapToBest, 'Result gap to best', 0, 1000);
  if (value.gapUnit !== nativeOutcome.unit || (rank === 1 && gapToBest !== 0)) fail('Result decision gap is invalid.');
  exactKeys(value.proof, ['kind', 'legalChoices'], 'Result decision proof');
  exactKeys(value.search, ['exact', 'evaluatedChoices'], 'Result decision search');
  const proofKind = text(value.proof.kind, 'Result proof', /^(exact-enumeration|valid-bound|evaluated-set)$/, 40);
  const state = text(value.state, 'Result decision state', /^(best-proven|best-found)$/, 40);
  const quality = text(value.quality, 'Result decision quality', /^(best-legal-choice|best-found)$/, 40);
  if (value.proof.legalChoices !== optionCount || value.choicesBeaten !== optionCount - rank
    || typeof value.search.exact !== 'boolean'
    || !Number.isSafeInteger(value.search.evaluatedChoices) || value.search.evaluatedChoices < 1
    || value.search.evaluatedChoices > optionCount
    || (state === 'best-proven' && (rank !== 1 || quality !== 'best-legal-choice'
      || !['exact-enumeration', 'valid-bound'].includes(proofKind) || value.search.exact !== true))
    || (state === 'best-found' && quality !== 'best-found')) fail('Result decision proof is invalid.');
  const choiceId = `choice-${(await sha256Text(stableJson(selection))).slice(0, 24)}`;
  if (value.choiceId !== choiceId) fail('Result decision does not bind the selected players.');
  return {
    rank,
    optionCount,
    choicesBeaten: optionCount - rank,
    gapToBest,
    gapUnit: nativeOutcome.unit,
    choiceId,
    state,
    quality,
    proof: { kind: proofKind, legalChoices: optionCount },
    search: { exact: value.search.exact, evaluatedChoices: value.search.evaluatedChoices },
  };
}

async function normalizeEvaluationResponse(value, request) {
  exactKeys(value, ['format', 'contractVersion', 'action', 'boardRef', 'resultContract', 'selection', 'resultPassport'], 'Evaluator response');
  assertPublicPayload(value, 'Evaluator response', RESPONSE_FORBIDDEN_KEY);
  if (value.format !== SWISHIQ_GAME_EVALUATE_RESPONSE_FORMAT
    || value.contractVersion !== SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION
    || value.action !== 'evaluate'
    || stableJson(value.boardRef) !== stableJson(request.boardRef)
    || stableJson(value.resultContract) !== stableJson(request.resultContract)
    || stableJson(value.selection) !== stableJson(request.selection)) fail('Evaluator response does not match this board and selection.');
  const passport = value.resultPassport;
  exactKeys(passport, ['version', 'runId', 'scenarioHash', 'scenarioKind', 'status', 'nativeOutcome', 'decision', 'gamePoints', 'constraints', 'evidence', 'replay', 'compatibility'], 'Result Passport');
  if (!isResultPassport(passport) || passport.version !== RESULT_PASSPORT_VERSION || passport.status !== 'complete'
    || passport.scenarioKind !== request.boardRef.gameKind || passport.compatibility !== null) fail('Evaluator response lacks a complete shared Result Passport.');
  const scenario = scenarioForRequest(request);
  const runId = `run-${(await sha256Text(stableJson({ boardRef: request.boardRef, resultContract: request.resultContract, selection: request.selection }))).slice(0, 32)}`;
  if (passport.scenarioHash !== scenario.scenarioHash || passport.runId !== runId) fail('Result Passport does not bind this board scenario.');
  const nativeOutcome = normalizeNativeOutcome(passport.nativeOutcome);
  const decision = await normalizeDecision(passport.decision, nativeOutcome, request.selection);
  exactKeys(passport.constraints, ['completed', 'total'], 'Result constraints');
  const totalRules = integer(passport.constraints.total, 'Total rules', 0, 100);
  const constraints = {
    completed: integer(passport.constraints.completed, 'Completed rules', 0, totalRules),
    total: totalRules,
  };
  const gamePoints = buildDecisionPoints({
    rank: decision.rank,
    optionCount: decision.optionCount,
    rankProofComplete: decisionProofStatus(decision).countComplete,
    validCompletedChoice: true,
    rulesCompleted: constraints.completed,
    rulesTotal: constraints.total,
    placementTiers: request.boardRef.gamePointsPolicy.placementTiers,
    ruleVersion: request.boardRef.gamePointsPolicy.ruleVersion,
  });
  if (!gamePoints || stableJson(passport.gamePoints) !== stableJson(gamePoints)) fail('SwishIQ Game Points do not match the board policy.');
  if (!object(passport.evidence)) fail('Result Passport evidence must be an object.');
  const evidenceKeys = Object.keys(passport.evidence);
  if (evidenceKeys.some(key => !EVALUATOR_EVIDENCE_KEYS.includes(key))) fail('Result Passport evidence contains unsupported fields.');
  const evidence = normalizeResultEvidence({ ...passport.evidence }, { required: true });
  if (stableJson(evidence.boardRef) !== stableJson(request.boardRef)
    || stableJson(evidence.resultContract) !== stableJson(request.resultContract)) {
    fail('Result Passport evidence does not match this board.');
  }
  const replay = {
    boardId: request.boardRef.boardId,
    boardContentSha256: request.boardRef.boardContentSha256,
    gamePointsPolicy: request.boardRef.gamePointsPolicy,
    packageId: request.boardRef.packageRef.packageId,
    packageVersion: request.boardRef.packageRef.packageVersion,
    exactPackageRequired: true,
  };
  if (stableJson(passport.evidence) !== stableJson(evidence) || stableJson(passport.replay) !== stableJson(replay)) {
    fail('Result Passport evidence does not match this board.');
  }
  const expectedPassport = createResultPassport({
    scenario,
    runId,
    status: 'complete',
    nativeOutcome,
    decision,
    gamePoints,
    constraints,
    evidence,
    replay,
    compatibility: null,
  });
  if (stableJson(passport) !== stableJson(expectedPassport)) fail('Result Passport does not match the shared evaluator contract.');
  return deepFreeze({
    format: SWISHIQ_GAME_EVALUATE_RESPONSE_FORMAT,
    contractVersion: SWISHIQ_GAME_EVALUATE_CONTRACT_VERSION,
    action: 'evaluate',
    boardRef: request.boardRef,
    resultContract: request.resultContract,
    selection: request.selection,
    resultPassport: expectedPassport,
  });
}

async function fetchJson(url, fetcher, label) {
  let response;
  try {
    response = await fetcher(url.toString(), { cache: 'no-store', credentials: 'omit' });
  } catch {
    fail(swishIQDailyGameUnavailableMessage());
  }
  if (!response?.ok) fail(swishIQDailyGameUnavailableMessage());
  try {
    return await response.json();
  } catch {
    fail(`${label} is not valid JSON.`);
  }
}

function browserInvoker() {
  const invoker = window.DJ?.remoteCatalog?.invokeFunction;
  if (typeof invoker !== 'function') fail(swishIQDailyGameEvaluatorUnavailableMessage());
  return invoker;
}

export function chicagoDailySeed(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Resolve the optional `seed` query parameter used by the live game pages.
 * A missing or malformed optional deep-link date must not stop module
 * initialization before a board can be requested. Direct board and contract
 * callers still use `normalizeDailySeed`, which remains strict.
 */
export function dailySeedFromPageSearch(search = '', date = new Date()) {
  const query = new URLSearchParams(typeof search === 'string' ? search : '');
  const supplied = query.get('seed');
  if (supplied === null || !supplied.trim()) return chicagoDailySeed(date);
  try {
    return normalizeDailySeed(supplied);
  } catch {
    return chicagoDailySeed(date);
  }
}

export function normalizeGameFamily(value) {
  const family = String(value || '').trim();
  return !family || family === SWISHIQ_DAILY_GAME_FAMILY ? family : '';
}

/** Load one explicitly release-pinned, name-key-only V4 daily board. */
export async function loadSwishIQDailyBoardV4({
  gameKind,
  dailySeed,
  releasePin,
  fetcher = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (typeof fetcher !== 'function') {
    throw new SwishIqDailyGameV4Error('v4-daily-board-unavailable', 'This browser cannot load the pinned V4 daily board.');
  }
  let selected;
  try {
    selected = findSwishIqV4DailyGamePin(releasePin, { gameKind, dailySeed });
  } catch (error) {
    if (error instanceof SwishIqDailyGameV4Error) throw error;
    throw new SwishIqDailyGameV4Error('v4-daily-release-pin-unavailable', 'The reviewed V4 daily release pin is unavailable.');
  }
  const url = new URL(dailyGamePinUrl(releasePin, selected.pin));
  const currentOrigin = globalThis.location?.origin;
  if (currentOrigin && url.origin !== currentOrigin) {
    throw new SwishIqDailyGameV4Error('v4-daily-release-pin-invalid', 'The V4 daily board must use the current site origin.');
  }
  let response;
  try {
    response = await fetcher(url.href, {
      method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error',
    });
  } catch {
    throw new SwishIqDailyGameV4Error('v4-daily-board-unavailable', 'The pinned V4 daily board could not be loaded.');
  }
  if (!response?.ok) {
    throw new SwishIqDailyGameV4Error('v4-daily-board-unavailable', 'The pinned V4 daily board is not available.');
  }
  let bytes;
  let board;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
    board = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new SwishIqDailyGameV4Error('v4-daily-board-unavailable', 'The pinned V4 daily board is not valid UTF-8 JSON.');
  }
  try {
    return deepFreeze(await validateSwishIqV4DailyBoard(board, {
      releasePin,
      gameKind,
      dailySeed,
      boardBytes: bytes,
    }));
  } catch (error) {
    if (error instanceof SwishIqDailyGameV4Error) throw error;
    throw new SwishIqDailyGameV4Error('v4-daily-board-invalid', 'The pinned V4 daily board failed validation.');
  }
}

/** Build and verify the name-key-only Daily V4 request/response envelope. */
export async function revealSwishIQDailyGameV4({
  board,
  releasePin,
  scenarioId = '',
  normalizedPlayerNameKey = '',
  picks = [],
  invoke,
} = {}) {
  const request = await buildSwishIqV4DailyGameRequest({
    board,
    releasePin,
    scenarioId,
    normalizedPlayerNameKey,
    picks,
  });
  let response;
  try {
    response = await (invoke || browserInvoker())('swishiq-game-evaluate', request);
  } catch (error) {
    if (error instanceof SwishIqDailyGameV4Error) throw error;
    throw new SwishIqDailyGameV4Error('v4-daily-evaluator-unavailable', 'The V4 daily evaluator is unavailable; no V3 result was requested.');
  }
  try {
    return validateSwishIqV4DailyGameResponse(response, request, { releasePin, board });
  } catch (error) {
    if (error instanceof SwishIqDailyGameV4Error) throw error;
    throw new SwishIqDailyGameV4Error('v4-daily-response-invalid', 'The V4 daily evaluator response did not match the pinned request.');
  }
}

export function swishIQDailyGameSourceMode({ sourceMode = 'auto', releasePin = null, search = '' } = {}) {
  return resolveSwishIqDailyGameSourceMode({ sourceMode, releasePin, search });
}

export async function assertSwishIQDailyGamePublicBoard(value, {
  expectedGameKind = '',
  expectedDailySeed = '',
  registryUrl,
  fetcher = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (typeof fetcher !== 'function') fail('This browser cannot load the SwishIQ board.');
  if (!object(value) || !object(value.packageRef) || !object(value.packageRef.scope)) fail('SwishIQ daily board is invalid.');
  const phase = text(value.packageRef.phase, 'Board phase', null, 40).toLowerCase();
  const proof = await loadSwishIqExactPackageProof({
    seasonEndYear: value.packageRef.scope.seasonEndYear,
    seasonPhase: phase,
    requiredCapabilities: REQUIRED_CAPABILITIES,
    packageRef: packageExpectation(value.packageRef),
    ...(registryUrl ? { registryUrl } : {}),
    fetchImpl: fetcher,
  });
  assertV3DailyPackageProof(proof);
  const board = await normalizeBoard(value, proof);
  if (expectedGameKind && board.gameKind !== expectedGameKind) fail('SwishIQ daily board does not match this game.');
  if (expectedDailySeed && board.dailySeed !== normalizeDailySeed(expectedDailySeed)) fail('SwishIQ daily board does not match this date.');
  const frozen = deepFreeze(board);
  validatedBoards.add(frozen);
  return frozen;
}

export async function loadSwishIQDailyBoard({
  gameKind,
  dailySeed,
  family = '',
  sourceMode = 'auto',
  releasePin = null,
  registryUrl,
  boardRootUrl = './swishiq-studio/data/boards/',
  fetcher = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (!SWISHIQ_DAILY_GAME_KINDS.includes(gameKind)) fail('Choose a supported SwishIQ daily game.');
  const seed = normalizeDailySeed(dailySeed);
  if (family && family !== SWISHIQ_DAILY_GAME_FAMILY) fail('Only exact team-season boards are supported.');
  const selectedReleasePin = releasePin || globalThis.DJ?.swishIQDailyGameReleasePin || null;
  const selectedSourceMode = resolveSwishIqDailyGameSourceMode({
    sourceMode,
    releasePin: selectedReleasePin,
    search: globalThis.location?.search || '',
  });
  if (selectedSourceMode === 'v4') {
    return await loadSwishIQDailyBoardV4({ gameKind, dailySeed: seed, releasePin: selectedReleasePin, fetcher });
  }
  if (selectedSourceMode !== 'v3') fail('Choose an explicit V3 or V4 daily-game source.');
  if (typeof fetcher !== 'function') fail('This browser cannot load the SwishIQ board.');
  const root = new URL(boardRootUrl, import.meta.url);
  const boardPath = seed < POINT_RULE_V2_START_SEED
    ? `${gameKind}/${seed}.json`
    : `v2/${gameKind}/${seed}.json`;
  const board = await fetchJson(new URL(boardPath, root), fetcher, 'SwishIQ board');
  return assertSwishIQDailyGamePublicBoard(board, {
    expectedGameKind: gameKind,
    expectedDailySeed: seed,
    registryUrl,
    fetcher,
  });
}

/** Use the board format as a hard discriminator; V4 rows never carry V3 playerRef selections. */
export function isSwishIQDailyBoardV4(board) {
  return object(board) && board.format === SWISHIQ_DAILY_GAME_V4_BOARD_FORMAT;
}

export async function revealSwishIQDailyGame({
  board,
  challengeId = '',
  playerRef = '',
  picks = [],
  invoke,
} = {}) {
  if (!validatedBoards.has(board)) fail('Reload this board before requesting a result.');
  const selection = normalizeSelection(board, { challengeId, playerRef, picks });
  const request = evaluationRequest(board, selection);
  let response;
  try {
    response = await (invoke || browserInvoker())('swishiq-game-evaluate', request);
  } catch (error) {
    const status = Number(error?.status || error?.context?.status || error?.response?.status);
    const message = String(error?.message || '').trim();
    if (status === 404 || status === 503
      || message === 'Backend is not configured.'
      || /^daily game evaluation is unavailable\.?$/i.test(message)
      || /(?:function|edge function|swishiq-game-evaluate).*(?:not found|not deployed|unavailable|404)|404.*(?:function|edge function|swishiq-game-evaluate)|failed to send a request to the edge function/i.test(message)) {
      fail(swishIQDailyGameEvaluatorUnavailableMessage());
    }
    throw error;
  }
  return normalizeEvaluationResponse(response, request);
}

export function swishIQDailyGameUnavailableMessage() {
  return 'This exact SwishIQ board is not published yet. No older season, pooled package, or substitute score is used.';
}

export function swishIQDailyGameV4UnavailableMessage(error) {
  const reason = String(error?.code || 'v4-daily-board-unavailable');
  return `V4 daily content is unavailable (${reason}). No V3 board or substitute score was used.`;
}

export function swishIQDailyGameEvaluatorUnavailableMessage() {
  return 'This exact SwishIQ board is published, but its private result evaluator is not available yet. No substitute score is used.';
}

/**
 * Give the game pages a stable state vocabulary without hiding the original
 * verification message.  Static board failures and the private evaluator
 * boundary need different recovery copy for players.
 */
export function swishIQDailyGameErrorKind(error) {
  const message = String(error?.message || '').trim();
  const code = String(error?.code || '');
  const status = Number(error?.status || error?.context?.status || error?.response?.status);
  if (code === 'v4-daily-evaluator-unavailable') return 'evaluator-unavailable';
  if (/^v4-daily-(?:board|release-pin|pin|exact-scope)/.test(code)) return 'board-unavailable';
  if (/^v4-daily-(?:selection|request)/.test(code)) return 'board-invalid';
  if (error instanceof SwishIqDailyGameV4Error || /^v4-daily-/.test(code)) return 'verification-error';
  if (message === swishIQDailyGameUnavailableMessage()) return 'board-unavailable';
  if (status === 503 || message === 'Backend is not configured.'
    || /^daily game evaluation is unavailable\.?$/i.test(message)
    || message === swishIQDailyGameEvaluatorUnavailableMessage()
    || /private result evaluator|swishiq-game-evaluate.*(?:not found|not deployed|unavailable)|failed to send a request to the edge function/i.test(message)) {
    return 'evaluator-unavailable';
  }
  if (/registry|projection|package|board|hash|integrity|legal choice|selection|date|season/i.test(message)) {
    return 'board-invalid';
  }
  return 'verification-error';
}
