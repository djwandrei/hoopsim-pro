import {
  SWISHIQ_PUBLIC_CAPABILITIES,
  SWISHIQ_PUBLIC_MODEL_CONTRACTS,
  SWISHIQ_PUBLIC_PHASES,
  SWISHIQ_PUBLIC_PLAYER_REF,
  SWISHIQ_PUBLIC_TEAM_CODES,
  assertSwishIqPublicSafe,
  resolveSwishIqPublicPackage,
  sha256Text,
  stableJson,
  validateSwishIqPublicProjectionBinding,
  validateSwishIqPublicProjectionIndex,
  validateSwishIqPublicRegistry,
} from './swishiq-static-projection.mjs';
import { POINT_RULE_VERSION, PREVIOUS_POINT_RULE_VERSION } from '../../tools/result-passport.js';

/**
 * Buyer-safe, static daily-board contract for SwishIQ games.
 *
 * A board is public presentation and legal-choice context only. The sealed
 * answer key, private model inputs, and evaluated outcomes belong to the
 * private result service. A board must resolve to one already-published,
 * exact-season public projection; candidate and pooled packages cannot enter
 * this contract.
 */
export const SWISHIQ_STATIC_DAILY_BOARD_FORMAT = 'djhc-swishiq-static-daily-board-v1';
export const SWISHIQ_STATIC_DAILY_BOARD_VERSION = 1;
export const SWISHIQ_STATIC_DAILY_BOARD_GAME_KINDS = Object.freeze([
  'fix-the-five',
  'draft-night',
]);
export const SWISHIQ_STATIC_DAILY_BOARD_FAMILY = 'team-season';
export const SWISHIQ_STATIC_DAILY_GAME_POINTS_RULE_VERSION = POINT_RULE_VERSION;
export const SWISHIQ_STATIC_DAILY_BOARD_REQUIRED_CAPABILITIES = Object.freeze({
  'fix-the-five': Object.freeze(['challengePools', 'lineupLab', 'publicAdvancedImpact']),
  'draft-night': Object.freeze(['challengePools', 'lineupLab', 'publicAdvancedImpact']),
});
export const SWISHIQ_STATIC_DAILY_BOARD_V3_PROOF_ARTIFACTS = Object.freeze({
  challengePools: Object.freeze(['challenge-pools']),
  lineupLab: Object.freeze(['exact-five-evidence', 'lineup-evidence', 'player-impact']),
  publicAdvancedImpact: Object.freeze(['lineup-evidence', 'player-impact']),
});

const DAILY_MODEL_ID = 'swishiq-v3';
const DAILY_MODEL_CONTRACT = SWISHIQ_PUBLIC_MODEL_CONTRACTS[DAILY_MODEL_ID];

const HASH = /^[a-f0-9]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BOARD_ID = /^swishiq-(?:fix-the-five|draft-night)-\d{8}-[a-f0-9]{12}$/;
const CHALLENGE_ID = /^fix-[a-z0-9][a-z0-9-]{1,62}$/;
const DECK_ID = /^draft-[a-z0-9][a-z0-9-]{1,62}$/;
const ROUND_ID = /^draft-round-[1-5]-[a-z0-9][a-z0-9-]{0,54}$/;
const TEAM_SET = new Set(SWISHIQ_PUBLIC_TEAM_CODES);
const PHASE_SET = new Set(SWISHIQ_PUBLIC_PHASES);
const CAPABILITY_SET = new Set(SWISHIQ_PUBLIC_CAPABILITIES);
const ROLE_SET = new Set(['G', 'F', 'C']);
const FORBIDDEN_BOARD_KEY = /(?:provider|canonical|crosswalk|mapping|raw|archive|coefficient|rapm|private|secret|token|password|source(?!locksha256$)|answer|correct|solution|sealed|outcome|result|rank|score|fitpoints|fit[_-]?points|offen[cs]|defen[cs]|impact|benchmark|formula|modelinput|(?:^|[_-])(?:player|team|game)id$)/i;

export class SwishIqStaticDailyBoardError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'SwishIqStaticDailyBoardError';
    this.issues = [...(issues.length ? issues : [message])];
  }
}

function fail(message, issues = []) {
  throw new SwishIqStaticDailyBoardError(message, issues);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, allowed, label) {
  if (!plainObject(value)) fail(label + ' must be a plain object.');
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  const missing = allowed.filter(key => !Object.hasOwn(value, key));
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

function hash(value, label) {
  return text(value, label, HASH, { lower: true, max: 64 });
}

function positiveInteger(value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(label + ' is invalid.');
  return value;
}

function finiteNumber(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(label + ' is invalid.');
  return value;
}

function normalizeDailySeed(value) {
  const seed = text(value, 'dailySeed', ISO_DATE, { max: 10 });
  const date = new Date(seed + 'T12:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== seed) fail('dailySeed is invalid.');
  return seed;
}

function instant(value, label) {
  const normalized = text(value, label, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/, { max: 40 });
  if (!Number.isFinite(Date.parse(normalized))) fail(label + ' is invalid.');
  return normalized;
}

/**
 * Validate the explicit, board-declared game reward tiers. Public boards may
 * never infer this policy from a default because it is part of the board hash,
 * evaluator request, and shared Result Passport proof.
 */
export function validateSwishIqStaticDailyGamePointsPolicy(value, label = 'daily board gamePointsPolicy') {
  exactKeys(value, ['ruleVersion', 'placementTiers'], label);
  const ruleVersion = text(value.ruleVersion, label + ' ruleVersion', /^swishiq-game-points-v[12]$/, { max: 80 });
  if (![SWISHIQ_STATIC_DAILY_GAME_POINTS_RULE_VERSION, PREVIOUS_POINT_RULE_VERSION].includes(ruleVersion)) {
    fail(label + ' ruleVersion is unsupported.');
  }
  const maximumPlacement = ruleVersion === PREVIOUS_POINT_RULE_VERSION ? 3 : 9;
  if (!Array.isArray(value.placementTiers) || value.placementTiers.length < 2
    || value.placementTiers.length > maximumPlacement + 1) {
    fail(label + ' placementTiers has an unsupported tier count.');
  }
  const placementTiers = value.placementTiers.map((tier, index) => {
    const tierLabel = label + ' placementTiers[' + String(index) + ']';
    exactKeys(tier, ['minimumPercentile', 'points'], tierLabel);
    return {
      minimumPercentile: finiteNumber(tier.minimumPercentile, tierLabel + ' minimumPercentile', { min: 0, max: 1 }),
      points: positiveInteger(tier.points, tierLabel + ' points', { min: 0, max: maximumPlacement }),
    };
  });
  const finalTier = placementTiers.at(-1);
  if (placementTiers[0].points !== maximumPlacement || finalTier.minimumPercentile !== 0 || finalTier.points !== 0
    || placementTiers.some((tier, index) => index > 0 && (
      tier.minimumPercentile >= placementTiers[index - 1].minimumPercentile
      || tier.points >= placementTiers[index - 1].points
    ))) {
    fail(label + ` placementTiers must descend canonically from ${maximumPlacement} points to a zero-point tier.`);
  }
  return { ruleVersion, placementTiers };
}

function boardBodyFields(gameKind) {
  return gameKind === 'fix-the-five' ? ['challenges'] : ['deck'];
}

function omitBoardHashFields(value) {
  const draft = { ...value };
  delete draft.boardId;
  delete draft.boardContentSha256;
  return draft;
}

/**
 * The board content hash is a SHA-256 of recursively sorted canonical JSON
 * with boardId and boardContentSha256 omitted. boardId embeds the first twelve
 * characters of this same hash, which binds a URL-safe ID to its content.
 */
export function swishIqStaticDailyBoardContentSha256(value) {
  return sha256Text(stableJson(omitBoardHashFields(value)));
}

function expectedBoardId({ gameKind, dailySeed, boardContentSha256 }) {
  return 'swishiq-' + gameKind + '-' + dailySeed.replaceAll('-', '') + '-' + boardContentSha256.slice(0, 12);
}

function assertNoPrivateOrOutcomeFields(value, label = 'daily board') {
  try {
    assertSwishIqPublicSafe(value, label);
  } catch (error) {
    fail(error.message);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateOrOutcomeFields(item, label + '[' + String(index) + ']'));
    return;
  }
  if (!plainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_BOARD_KEY.test(key)) fail(label + '.' + key + ' is not allowed in a public SwishIQ board.');
    assertNoPrivateOrOutcomeFields(nested, label + '.' + key);
  }
}

function normalizePositions(value, label) {
  if (!Array.isArray(value) || !value.length || value.length > 3) fail(label + ' are invalid.');
  const positions = value.map(position => text(position, label + ' position', /^[GFC]$/, { max: 1 }));
  if (new Set(positions).size !== positions.length || positions.some(position => !ROLE_SET.has(position))) {
    fail(label + ' are invalid.');
  }
  const ordered = [...positions].sort();
  if (stableJson(value) !== stableJson(ordered)) fail(label + ' are not in canonical order.');
  return ordered;
}

function normalizePlayer(value, label, packageRef, expectedTeamCode) {
  exactKeys(value, ['playerRef', 'displayName', 'teamCode', 'seasonStartYear', 'phase', 'positions'], label);
  const player = {
    playerRef: text(value.playerRef, label + ' playerRef', SWISHIQ_PUBLIC_PLAYER_REF, { lower: true, max: 34 }),
    displayName: text(value.displayName, label + ' displayName', null, { max: 120 }),
    teamCode: text(value.teamCode, label + ' teamCode', /^[A-Z]{3}$/, { max: 3 }),
    seasonStartYear: positiveInteger(value.seasonStartYear, label + ' seasonStartYear', { min: 1947, max: 2200 }),
    phase: text(value.phase, label + ' phase', null, { lower: true, max: 40 }),
    positions: normalizePositions(value.positions, label + ' positions'),
  };
  if (!TEAM_SET.has(player.teamCode) || !PHASE_SET.has(player.phase)) fail(label + ' has invalid public context.');
  if (expectedTeamCode && player.teamCode !== expectedTeamCode) fail(label + ' is outside its challenge team.');
  if (player.seasonStartYear !== packageRef.scope.seasonStartYear || player.phase !== packageRef.phase) {
    fail(label + ' is outside the pinned exact season and phase.');
  }
  return player;
}

function requireDistinctPlayerRefs(players, label) {
  const refs = players.map(player => player.playerRef);
  if (new Set(refs).size !== refs.length) fail(label + ' repeats a playerRef.');
}

function normalizeChallenge(value, index, packageRef) {
  const label = 'Fix the Five challenge ' + String(index + 1);
  exactKeys(value, ['challengeId', 'title', 'prompt', 'teamCode', 'lineup', 'removePlayerRef', 'candidates'], label);
  const teamCode = text(value.teamCode, label + ' teamCode', /^[A-Z]{3}$/, { max: 3 });
  if (!TEAM_SET.has(teamCode)) fail(label + ' teamCode is invalid.');
  if (!Array.isArray(value.lineup) || value.lineup.length !== 5) fail(label + ' needs five lineup players.');
  if (!Array.isArray(value.candidates) || value.candidates.length !== 3) fail(label + ' needs three legal candidates.');
  const lineup = value.lineup.map((player, playerIndex) => normalizePlayer(
    player,
    label + ' lineup player ' + String(playerIndex + 1),
    packageRef,
    teamCode,
  ));
  const candidates = value.candidates.map((player, playerIndex) => normalizePlayer(
    player,
    label + ' candidate ' + String(playerIndex + 1),
    packageRef,
    teamCode,
  ));
  requireDistinctPlayerRefs(lineup, label + ' lineup');
  requireDistinctPlayerRefs(candidates, label + ' candidates');
  const removePlayerRef = text(value.removePlayerRef, label + ' removePlayerRef', SWISHIQ_PUBLIC_PLAYER_REF, { lower: true, max: 34 });
  if (!lineup.some(player => player.playerRef === removePlayerRef)) fail(label + ' removePlayerRef is not in the lineup.');
  if (candidates.some(player => lineup.some(lineupPlayer => lineupPlayer.playerRef === player.playerRef))) {
    fail(label + ' candidate is already in the lineup.');
  }
  return {
    challengeId: text(value.challengeId, label + ' challengeId', CHALLENGE_ID, { lower: true, max: 64 }),
    title: text(value.title, label + ' title', null, { max: 120 }),
    prompt: text(value.prompt, label + ' prompt', null, { max: 400 }),
    teamCode,
    lineup,
    removePlayerRef,
    candidates,
  };
}

function normalizeFixTheFive(challenges, packageRef) {
  if (!Array.isArray(challenges) || challenges.length !== 5) fail('Fix the Five needs exactly five challenges.');
  const normalized = challenges.map((challenge, index) => normalizeChallenge(challenge, index, packageRef));
  const ids = normalized.map(challenge => challenge.challengeId);
  if (new Set(ids).size !== ids.length) fail('Fix the Five board repeats a challengeId.');
  return normalized;
}

function normalizeDraftRound(value, index, packageRef) {
  const label = 'Draft Night round ' + String(index + 1);
  exactKeys(value, ['roundNumber', 'roundId', 'title', 'prompt', 'teamCode', 'candidates'], label);
  const roundNumber = positiveInteger(value.roundNumber, label + ' roundNumber', { min: 1, max: 5 });
  if (roundNumber !== index + 1) fail(label + ' roundNumber is invalid.');
  const teamCode = text(value.teamCode, label + ' teamCode', /^[A-Z]{3}$/, { max: 3 });
  if (!TEAM_SET.has(teamCode)) fail(label + ' teamCode is invalid.');
  if (!Array.isArray(value.candidates) || value.candidates.length !== 3) fail(label + ' needs three legal candidates.');
  const candidates = value.candidates.map((player, playerIndex) => normalizePlayer(
    player,
    label + ' candidate ' + String(playerIndex + 1),
    packageRef,
    teamCode,
  ));
  requireDistinctPlayerRefs(candidates, label + ' candidates');
  return {
    roundNumber,
    roundId: text(value.roundId, label + ' roundId', ROUND_ID, { lower: true, max: 64 }),
    title: text(value.title, label + ' title', null, { max: 120 }),
    prompt: text(value.prompt, label + ' prompt', null, { max: 400 }),
    teamCode,
    candidates,
  };
}

function normalizeDraftNight(deck, packageRef) {
  exactKeys(deck, ['deckId', 'title', 'prompt', 'rounds'], 'Draft Night deck');
  if (!Array.isArray(deck.rounds) || deck.rounds.length !== 5) fail('Draft Night needs exactly five rounds.');
  const rounds = deck.rounds.map((round, index) => normalizeDraftRound(round, index, packageRef));
  const candidateRefs = rounds.flatMap(round => round.candidates.map(candidate => candidate.playerRef));
  if (new Set(candidateRefs).size !== candidateRefs.length) fail('Draft Night deck repeats a playerRef across rounds.');
  const ids = rounds.map(round => round.roundId);
  if (new Set(ids).size !== ids.length) fail('Draft Night deck repeats a roundId.');
  return {
    deckId: text(deck.deckId, 'Draft Night deck deckId', DECK_ID, { lower: true, max: 64 }),
    title: text(deck.title, 'Draft Night deck title', null, { max: 120 }),
    prompt: text(deck.prompt, 'Draft Night deck prompt', null, { max: 400 }),
    rounds,
  };
}

function requiredCapabilitiesFor(gameKind) {
  const required = SWISHIQ_STATIC_DAILY_BOARD_REQUIRED_CAPABILITIES[gameKind];
  if (!required || required.some(capability => !CAPABILITY_SET.has(capability))) {
    fail('Daily board required capabilities are invalid.');
  }
  return [...required];
}

export function assertSwishIqStaticDailyV3Proof({
  packageEntry,
  projectionIndex,
  requiredCapabilities = [],
} = {}) {
  if (!plainObject(packageEntry) || packageEntry.modelId !== DAILY_MODEL_ID
    || !/^nba-swishiq-v3-\d{4}-\d{2}$/.test(String(packageEntry.packageId || ''))
    || !/^v3-\d{4}-\d{2}-[a-f0-9]{12}$/.test(String(packageEntry.packageVersion || ''))) {
    fail('Daily games require a published SwishIQ V3 package.');
  }
  if (!plainObject(projectionIndex) || projectionIndex.modelId !== DAILY_MODEL_ID
    || projectionIndex.packageId !== packageEntry.packageId
    || projectionIndex.packageVersion !== packageEntry.packageVersion
    || !Array.isArray(projectionIndex.artifacts)) {
    fail('Daily V3 proof is not bound to the selected package projection.');
  }
  const artifacts = new Map(projectionIndex.artifacts.map(artifact => [artifact.artifactId, artifact]));
  for (const capability of requiredCapabilities) {
    const requiredArtifacts = SWISHIQ_STATIC_DAILY_BOARD_V3_PROOF_ARTIFACTS[capability];
    if (!requiredArtifacts) fail(`Daily V3 proof capability is unsupported: ${capability}.`);
    const registryEvidence = packageEntry.capabilities?.[capability];
    const indexEvidence = projectionIndex.capabilities?.[capability];
    if (registryEvidence?.status !== 'available' || indexEvidence?.status !== 'available') {
      fail(`Daily V3 ${capability} proof is unavailable in the published registry.`);
    }
    for (const artifactId of requiredArtifacts) {
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
  return true;
}

function normalizePackageRef(value, { registry = null, projectionIndex = null } = {}) {
  exactKeys(value, [
    'packageId',
    'packageVersion',
    'packageManifestSha256',
    'sourceLockSha256',
    'modelId',
    'normalizer',
    'metricsVersion',
    'scope',
    'phase',
    'registryVersion',
    'registryRevisionSha256',
    'projectionContentSha256',
    'requiredCapabilities',
  ], 'daily board packageRef');
  if (value.modelId !== DAILY_MODEL_ID || !String(value.packageId || '').startsWith('nba-swishiq-v3-')) {
    fail('Daily games require a published SwishIQ V3 package.');
  }
  const normalizedRegistryVersion = text(value.registryVersion, 'daily board registryVersion', /^swishiq-public-registry-v1$/, { max: 80 });
  const phase = text(value.phase, 'daily board package phase', null, { lower: true, max: 40 });
  if (!PHASE_SET.has(phase)) fail('daily board package phase is invalid.');
  if (!Array.isArray(value.requiredCapabilities) || !value.requiredCapabilities.length) {
    fail('daily board package requiredCapabilities are invalid.');
  }
  const requiredCapabilities = value.requiredCapabilities.map(capability => text(capability, 'daily board package capability', null, { max: 80 }));
  if (new Set(requiredCapabilities).size !== requiredCapabilities.length || requiredCapabilities.some(capability => !CAPABILITY_SET.has(capability))) {
    fail('daily board package requiredCapabilities are invalid.');
  }
  const canonicalCapabilities = [...requiredCapabilities].sort();
  if (stableJson(value.requiredCapabilities) !== stableJson(canonicalCapabilities)) {
    fail('daily board package requiredCapabilities are not in canonical order.');
  }
  const pinned = {
    packageId: text(value.packageId, 'daily board packageId', /^nba-swishiq-v3-\d{4}-\d{2}$/, { lower: true, max: 80 }),
    packageVersion: text(value.packageVersion, 'daily board packageVersion', /^v3-\d{4}-\d{2}-[a-f0-9]{12}$/, { lower: true, max: 120 }),
    packageManifestSha256: hash(value.packageManifestSha256, 'daily board packageManifestSha256'),
    sourceLockSha256: hash(value.sourceLockSha256, 'daily board sourceLockSha256'),
    modelId: text(value.modelId, 'daily board modelId', /^swishiq-v3$/, { lower: true, max: 40 }),
    normalizer: text(value.normalizer, 'daily board normalizer', null, { max: 100 }),
    metricsVersion: text(value.metricsVersion, 'daily board metricsVersion', null, { max: 100 }),
    scope: value.scope,
    phase,
    registryVersion: normalizedRegistryVersion,
    registryRevisionSha256: hash(value.registryRevisionSha256, 'daily board registryRevisionSha256'),
    projectionContentSha256: hash(value.projectionContentSha256, 'daily board projectionContentSha256'),
    requiredCapabilities: canonicalCapabilities,
  };
  if (pinned.normalizer !== DAILY_MODEL_CONTRACT.normalizer
    || pinned.metricsVersion !== DAILY_MODEL_CONTRACT.metricsVersion) {
    fail('Daily board V3 normalizer or metrics version does not match the V3 model contract.');
  }
  if (!registry || !projectionIndex) fail('Published daily board validation requires the static registry and projection index.');
  const normalizedRegistry = validateSwishIqPublicRegistry(registry);
  const normalizedProjection = validateSwishIqPublicProjectionIndex(projectionIndex);
  if (normalizedProjection.scope.kind !== 'exact-season') fail('Daily boards require an exact-season package.');
  if (!normalizedProjection.scope.phases.includes(phase)) fail('Daily board package phase is outside the exact package.');
  const entry = resolveSwishIqPublicPackage(normalizedRegistry, {
    scope: normalizedProjection.scope,
    phase,
    packageId: pinned.packageId,
    packageVersion: pinned.packageVersion,
    requiredCapabilities: canonicalCapabilities,
  });
  const binding = validateSwishIqPublicProjectionBinding(entry, normalizedProjection);
  assertSwishIqStaticDailyV3Proof({
    packageEntry: entry,
    projectionIndex: normalizedProjection,
    requiredCapabilities,
  });
  const expected = {
    packageId: entry.packageId,
    packageVersion: entry.packageVersion,
    packageManifestSha256: entry.packageManifestSha256,
    sourceLockSha256: entry.sourceLockSha256,
    modelId: entry.modelId,
    normalizer: entry.normalizer,
    metricsVersion: entry.metricsVersion,
    scope: entry.scope,
    phase,
    registryVersion: normalizedRegistry.registryVersion,
    registryRevisionSha256: normalizedRegistry.registryRevisionSha256,
    projectionContentSha256: binding.projection.contentSha256,
    requiredCapabilities: canonicalCapabilities,
  };
  if (stableJson(pinned) !== stableJson(expected)) fail('Daily board packageRef does not match its published SwishIQ package.');
  return expected;
}

function packageRefFromPublished({ registry, projectionIndex, packageId, packageVersion, phase, gameKind }) {
  const normalizedRegistry = validateSwishIqPublicRegistry(registry);
  const normalizedProjection = validateSwishIqPublicProjectionIndex(projectionIndex);
  if (normalizedProjection.scope.kind !== 'exact-season') fail('Daily boards require an exact-season package.');
  const requiredCapabilities = requiredCapabilitiesFor(gameKind);
  const entry = resolveSwishIqPublicPackage(normalizedRegistry, {
    scope: normalizedProjection.scope,
    phase,
    packageId,
    packageVersion,
    requiredCapabilities,
  });
  if (entry.modelId !== DAILY_MODEL_ID) fail('Daily games require a published SwishIQ V3 package.');
  const binding = validateSwishIqPublicProjectionBinding(entry, normalizedProjection);
  assertSwishIqStaticDailyV3Proof({
    packageEntry: entry,
    projectionIndex: normalizedProjection,
    requiredCapabilities,
  });
  return {
    packageId: entry.packageId,
    packageVersion: entry.packageVersion,
    packageManifestSha256: entry.packageManifestSha256,
    sourceLockSha256: entry.sourceLockSha256,
    modelId: entry.modelId,
    normalizer: entry.normalizer,
    metricsVersion: entry.metricsVersion,
    scope: entry.scope,
    phase,
    registryVersion: normalizedRegistry.registryVersion,
    registryRevisionSha256: normalizedRegistry.registryRevisionSha256,
    projectionContentSha256: binding.projection.contentSha256,
    requiredCapabilities,
  };
}

function normalizeBoard(value, { registry = null, projectionIndex = null } = {}) {
  if (!plainObject(value)) fail('Daily board must be a plain object.');
  const gameKind = text(value.gameKind, 'daily board gameKind', /^(fix-the-five|draft-night)$/, { lower: true, max: 40 });
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
    ...boardBodyFields(gameKind),
    'boardContentSha256',
  ], 'daily board');
  if (value.format !== SWISHIQ_STATIC_DAILY_BOARD_FORMAT || value.contractVersion !== SWISHIQ_STATIC_DAILY_BOARD_VERSION) {
    fail('Daily board format is unsupported.');
  }
  if (value.publicationStatus !== 'published') fail('Daily board must be published.');
  if (value.family !== SWISHIQ_STATIC_DAILY_BOARD_FAMILY) fail('Daily board family must be a single exact team-season.');
  const packageRef = normalizePackageRef(value.packageRef, { registry, projectionIndex });
  const board = {
    format: SWISHIQ_STATIC_DAILY_BOARD_FORMAT,
    contractVersion: SWISHIQ_STATIC_DAILY_BOARD_VERSION,
    publicationStatus: 'published',
    boardId: text(value.boardId, 'daily board boardId', BOARD_ID, { lower: true, max: 80 }),
    generatedAt: instant(value.generatedAt, 'daily board generatedAt'),
    dailySeed: normalizeDailySeed(value.dailySeed),
    gameKind,
    family: SWISHIQ_STATIC_DAILY_BOARD_FAMILY,
    packageRef,
    gamePointsPolicy: validateSwishIqStaticDailyGamePointsPolicy(value.gamePointsPolicy),
    boardContentSha256: hash(value.boardContentSha256, 'daily board boardContentSha256'),
  };
  if (gameKind === 'fix-the-five') board.challenges = normalizeFixTheFive(value.challenges, packageRef);
  else board.deck = normalizeDraftNight(value.deck, packageRef);
  assertNoPrivateOrOutcomeFields(board, 'daily board');
  const contentSha256 = swishIqStaticDailyBoardContentSha256(board);
  if (board.boardContentSha256 !== contentSha256) fail('Daily board content hash does not match canonical content.');
  if (board.boardId !== expectedBoardId({
    gameKind: board.gameKind,
    dailySeed: board.dailySeed,
    boardContentSha256: board.boardContentSha256,
  })) fail('Daily board ID does not match its canonical content.');
  return board;
}

/**
 * Validate a browser-deliverable board against its static registry entry and
 * exact package projection. Omit neither registry nor projectionIndex in a
 * real consumer: without both, publication/candidate status cannot be proven.
 */
export function validateSwishIqStaticDailyBoard(value, options = {}) {
  return normalizeBoard(value, options);
}

/**
 * Build a public board only from a published exact SwishIQ projection. Input
 * intentionally has no answer-key or result fields, so they cannot be emitted
 * by this materializer.
 */
export function buildSwishIqStaticDailyBoard(input = {}) {
  if (!plainObject(input)) fail('Daily board input must be a plain object.');
  const gameKind = text(input.gameKind, 'daily board input gameKind', /^(fix-the-five|draft-night)$/, { lower: true, max: 40 });
  exactKeys(input, [
    'generatedAt',
    'dailySeed',
    'gameKind',
    'phase',
    'registry',
    'projectionIndex',
    'packageId',
    'packageVersion',
    'gamePointsPolicy',
    ...boardBodyFields(gameKind),
  ], 'daily board input');
  const phase = text(input.phase, 'daily board input phase', null, { lower: true, max: 40 });
  if (!PHASE_SET.has(phase)) fail('daily board input phase is invalid.');
  const packageRef = packageRefFromPublished({
    registry: input.registry,
    projectionIndex: input.projectionIndex,
    packageId: input.packageId,
    packageVersion: input.packageVersion,
    phase,
    gameKind,
  });
  const draft = {
    format: SWISHIQ_STATIC_DAILY_BOARD_FORMAT,
    contractVersion: SWISHIQ_STATIC_DAILY_BOARD_VERSION,
    publicationStatus: 'published',
    generatedAt: instant(input.generatedAt, 'daily board input generatedAt'),
    dailySeed: normalizeDailySeed(input.dailySeed),
    gameKind,
    family: SWISHIQ_STATIC_DAILY_BOARD_FAMILY,
    packageRef,
    gamePointsPolicy: validateSwishIqStaticDailyGamePointsPolicy(input.gamePointsPolicy, 'daily board input gamePointsPolicy'),
  };
  if (gameKind === 'fix-the-five') draft.challenges = normalizeFixTheFive(input.challenges, packageRef);
  else draft.deck = normalizeDraftNight(input.deck, packageRef);
  assertNoPrivateOrOutcomeFields(draft, 'daily board input');
  const boardContentSha256 = swishIqStaticDailyBoardContentSha256(draft);
  return validateSwishIqStaticDailyBoard({
    ...draft,
    boardId: expectedBoardId({ gameKind, dailySeed: draft.dailySeed, boardContentSha256 }),
    boardContentSha256,
  }, {
    registry: input.registry,
    projectionIndex: input.projectionIndex,
  });
}
