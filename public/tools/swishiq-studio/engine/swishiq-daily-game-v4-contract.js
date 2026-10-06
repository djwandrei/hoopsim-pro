/* Typed, name-key-only contract for immutable V4 daily-game boards. */

import {
  canonicalV4IdentityJson,
  v4Sha256Hex,
} from './canonical-v4-identity.js?v=20260927s&rev=canonical-v4-identity-v1';
import { normalizeCanonicalV4PlayerNameKey } from './canonical-v4-player-name-identity.js?v=20261001d&rev=canonical-v4-player-name-identity-v1';

export const SWISHIQ_DAILY_GAME_V4_BOARD_FORMAT = 'djhc-swishiq-static-daily-board-v4';
export const SWISHIQ_DAILY_GAME_V4_BOARD_VERSION = 1;
export const SWISHIQ_DAILY_GAME_V4_REQUEST_FORMAT = 'djhc-swishiq-game-evaluate-v4-request-v1';
export const SWISHIQ_DAILY_GAME_V4_RESPONSE_FORMAT = 'djhc-swishiq-game-evaluate-v4-response-v1';
export const SWISHIQ_DAILY_GAME_V4_CONTRACT_VERSION = 1;
export const SWISHIQ_DAILY_GAME_V4_SCENARIO_FORMAT = 'djhc-swishiq-v4-daily-game-scenario-v1';
export const SWISHIQ_DAILY_GAME_V4_SCENARIOS_FORMAT = 'djhc-swishiq-v4-daily-game-scenarios-v1';

const HASH = /^[a-f0-9]{64}$/;
const YEAR_MIN = 2017;
const YEAR_MAX = 2025;
const GAME_KINDS = new Set(['fix-the-five', 'draft-night']);
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const CANONICAL_PHASES = Object.freeze(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const RELEASE_ID = /^v4-site-[a-f0-9]{12}$/;
const SAFE_PATH_PART = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const HASHED_SCENARIO_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DAILY_PIN_KEYS = Object.freeze([
  'gameKind', 'dailySeed', 'path', 'boardSha256', 'boardContentSha256',
  'packageId', 'packageVersion', 'scope', 'phase',
]);
const PACKAGE_REF_KEYS = Object.freeze([
  'modelId', 'releaseId', 'registrySha256', 'registryRevisionSha256',
  'reviewReceiptSha256', 'authorizationReferenceSha256', 'packageId',
  'packageVersion', 'scope', 'phase', 'indexSha256', 'capabilityMapSha256',
  'sourceLockDigestKind', 'sourceLockSha256', 'sourceLockEmbeddedSha256',
  'sourceLockFileSha256', 'sourceLockFileByteLength', 'sourceLockSchemaSha256',
]);
const validatedBoards = new WeakSet();

export class SwishIqDailyGameV4Error extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'SwishIqDailyGameV4Error';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new SwishIqDailyGameV4Error(code, message);
}

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value, keys, label) {
  if (!object(value)) fail('v4-daily-contract-invalid', `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('v4-daily-contract-invalid', `${label} has missing or unsupported fields.`);
  }
}

function text(value, label, pattern = null, maximum = 240) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    fail('v4-daily-contract-invalid', `${label} is invalid.`);
  }
  const normalized = value.trim();
  if (pattern && !pattern.test(normalized)) fail('v4-daily-contract-invalid', `${label} is invalid.`);
  return normalized;
}

function hash(value, label) {
  return text(value, label, HASH, 64);
}

function validDate(value) {
  const date = text(value, 'dailySeed', /^\d{4}-\d{2}-\d{2}$/, 10);
  const parsed = new Date(date + 'T12:00:00.000Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    fail('v4-daily-contract-invalid', 'dailySeed is not a calendar date.');
  }
  return date;
}

function normalizeScope(scope, phase) {
  exactKeys(scope, ['kind', 'seasonStartYears', 'seasonStartYear', 'seasonEndYear', 'phases', 'pooledFitIsSeasonSpecific'], 'V4 daily scope');
  if (scope.kind !== 'exact-season' || !Array.isArray(scope.seasonStartYears)
    || scope.seasonStartYears.length !== 1
    || !Number.isSafeInteger(scope.seasonStartYears[0])
    || scope.seasonStartYears[0] < YEAR_MIN || scope.seasonStartYears[0] > YEAR_MAX
    || scope.seasonStartYear !== scope.seasonStartYears[0]
    || scope.seasonEndYear !== scope.seasonStartYear + 1
    || scope.pooledFitIsSeasonSpecific !== true
    || canonicalV4IdentityJson(scope.phases) !== canonicalV4IdentityJson(CANONICAL_PHASES)
    || !scope.phases.includes(phase) || !PHASES.has(phase)) {
    fail('v4-daily-exact-scope-required', 'V4 daily games require one complete canonical exact-season package scope and an explicitly pinned phase.');
  }
  return {
    kind: 'exact-season',
    seasonStartYears: [...scope.seasonStartYears],
    seasonStartYear: scope.seasonStartYear,
    seasonEndYear: scope.seasonEndYear,
    phases: [...scope.phases],
    pooledFitIsSeasonSpecific: true,
  };
}

function expectedPackageId(year) {
  return `nba-swishiq-v4-${year}-${String(year + 1).slice(-2)}`;
}

function normalizeDailyPin(value) {
  exactKeys(value, DAILY_PIN_KEYS, 'V4 daily board pin');
  const gameKind = text(value.gameKind, 'daily pin gameKind', /^(fix-the-five|draft-night)$/, 40);
  const dailySeed = validDate(value.dailySeed);
  const phase = text(value.phase, 'daily pin phase', /^(regular|in_season_tournament|play_in|playoffs)$/, 40);
  const scope = normalizeScope(value.scope, phase);
  const year = scope.seasonStartYears[0];
  const path = text(value.path, 'daily pin path', null, 240);
  if (path.startsWith('/') || path.includes('\\') || path.includes('%') || path.includes('?') || path.includes('#')
    || path.split('/').some(part => !SAFE_PATH_PART.test(part) || part === '.' || part === '..')) {
    fail('v4-daily-pin-invalid', 'V4 daily board path must be a safe relative path inside the immutable release.');
  }
  const packageId = text(value.packageId, 'daily pin packageId', /^nba-swishiq-v4-(?:20\d{2}-\d{2}|2017-26)$/, 80);
  if (packageId !== expectedPackageId(year)) fail('v4-daily-pin-invalid', 'Daily board packageId does not match its exact season.');
  return Object.freeze({
    gameKind,
    dailySeed,
    path,
    boardSha256: hash(value.boardSha256, 'daily pin boardSha256'),
    boardContentSha256: hash(value.boardContentSha256, 'daily pin boardContentSha256'),
    packageId,
    packageVersion: text(value.packageVersion, 'daily pin packageVersion', /^v4-canonical-[A-Za-z0-9-]+$/, 120),
    scope,
    phase,
  });
}

function releaseIdFromRegistryUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('v4-daily-release-pin-invalid', 'registryUrl is invalid.'); }
  const match = /^\/tools\/swishiq-studio\/data\/v4\/releases\/(v4-site-[a-f0-9]{12})\/registry\.json$/.exec(url.pathname);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
    || url.search || url.hash || !match) {
    fail('v4-daily-release-pin-invalid', 'registryUrl must address an immutable V4 site release.');
  }
  return { url, releaseId: match[1], releaseRoot: new URL('./', url) };
}

/** Validate only the board references of a reviewed release pin. Empty lists are valid but contain no boards. */
export function normalizeSwishIqV4DailyReleasePin(releasePin) {
  if (!object(releasePin) || releasePin.format !== 'djhc-swishiq-v4-studio-runtime-release-pin-v2'
    || releasePin.version !== 'swishiq-v4-studio-runtime-release-pin-v2'
    || releasePin.status !== 'reviewed') {
    fail('v4-daily-release-pin-unavailable', 'A reviewed immutable V4 release pin is unavailable.');
  }
  const registry = releaseIdFromRegistryUrl(releasePin.registryUrl);
  for (const key of ['registrySha256', 'registryRevisionSha256', 'reviewReceiptSha256', 'authorizationReferenceSha256']) {
    hash(releasePin[key], `release pin ${key}`);
  }
  if (!Array.isArray(releasePin.dailyGamePins)) {
    fail('v4-daily-board-pin-unavailable', 'The reviewed release contains no V4 daily-game board pins.');
  }
  if (!Array.isArray(releasePin.expectedIdentity?.packages) || releasePin.expectedIdentity.packages.length !== 10
    || !Array.isArray(releasePin.packagePins) || releasePin.packagePins.length !== 10) {
    fail('v4-daily-release-pin-invalid', 'The reviewed release does not pin all ten exact and pooled package identities.');
  }
  const packageIds = [...Array.from({ length: 9 }, (_, index) => {
    const year = 2017 + index;
    return expectedPackageId(year);
  }), 'nba-swishiq-v4-2017-26'];
  if (packageIds.some(id => releasePin.expectedIdentity.packages.filter(row => row?.packageId === id).length !== 1
    || releasePin.packagePins.filter(row => row?.packageId === id).length !== 1)) {
    fail('v4-daily-release-pin-invalid', 'The reviewed release has missing or duplicate package identity pins.');
  }
  const pins = releasePin.dailyGamePins.map(normalizeDailyPin);
  const ids = pins.map(pin => `${pin.gameKind}:${pin.dailySeed}`);
  if (new Set(ids).size !== ids.length) fail('v4-daily-release-pin-invalid', 'The release repeats a daily-game board pin.');
  return Object.freeze({
    releaseId: registry.releaseId,
    registryUrl: registry.url.href,
    releaseRootUrl: registry.releaseRoot.href,
    registrySha256: releasePin.registrySha256,
    registryRevisionSha256: releasePin.registryRevisionSha256,
    reviewReceiptSha256: releasePin.reviewReceiptSha256,
    authorizationReferenceSha256: releasePin.authorizationReferenceSha256,
    expectedIdentity: releasePin.expectedIdentity,
    packagePins: releasePin.packagePins,
    dailyGamePins: Object.freeze(pins),
  });
}

export function findSwishIqV4DailyGamePin(releasePin, { gameKind, dailySeed } = {}) {
  const release = normalizeSwishIqV4DailyReleasePin(releasePin);
  const kind = text(gameKind, 'gameKind', /^(fix-the-five|draft-night)$/, 40);
  const seed = validDate(dailySeed);
  const matches = release.dailyGamePins.filter(pin => pin.gameKind === kind && pin.dailySeed === seed);
  if (matches.length !== 1) fail('v4-daily-board-pin-unavailable', 'No reviewed V4 board is pinned for this game and date.');
  return Object.freeze({ release, pin: matches[0] });
}

function normalizePlayerRow(row, { seasonStartYear, teamCode, phase }, label) {
  exactKeys(row, ['displayName', 'normalizedPlayerNameKey', 'seasonStartYear', 'teamCode', 'phase'], label);
  const displayName = text(row.displayName, `${label} displayName`, null, 120);
  const normalizedPlayerNameKey = text(row.normalizedPlayerNameKey, `${label} normalizedPlayerNameKey`, null, 160);
  if (normalizeCanonicalV4PlayerNameKey(displayName) !== normalizedPlayerNameKey
    || row.seasonStartYear !== seasonStartYear || row.teamCode !== teamCode || row.phase !== phase) {
    fail('v4-daily-board-invalid', `${label} name key or exact team/season/phase does not match its board context.`);
  }
  return { displayName, normalizedPlayerNameKey, seasonStartYear, teamCode, phase };
}

function normalizeScenarioRecord(gameKind, record, pin, label) {
  const seasonStartYear = pin.scope.seasonStartYears[0];
  if (gameKind === 'fix-the-five') {
    exactKeys(record, [
      'challengeId', 'title', 'prompt', 'teamCode', 'lineup',
      'removeNormalizedPlayerNameKey', 'candidates',
    ], label);
    const teamCode = text(record.teamCode, `${label} teamCode`, /^[A-Z]{3}$/, 3);
    if (!Array.isArray(record.lineup) || record.lineup.length !== 5
      || !Array.isArray(record.candidates) || record.candidates.length !== 3) {
      fail('v4-daily-board-invalid', `${label} must contain five lineup names and three candidates.`);
    }
    const lineup = record.lineup.map((row, index) => normalizePlayerRow(row, {
      seasonStartYear, teamCode, phase: pin.phase,
    }, `${label} lineup[${index}]`));
    const candidates = record.candidates.map((row, index) => normalizePlayerRow(row, {
      seasonStartYear, teamCode, phase: pin.phase,
    }, `${label} candidates[${index}]`));
    const allKeys = [...lineup, ...candidates].map(row => row.normalizedPlayerNameKey);
    if (new Set(allKeys).size !== allKeys.length
      || !lineup.some(row => row.normalizedPlayerNameKey === record.removeNormalizedPlayerNameKey)) {
      fail('v4-daily-board-invalid', `${label} repeats or omits its exact name-key selection context.`);
    }
    return {
      challengeId: text(record.challengeId, `${label} challengeId`, HASHED_SCENARIO_ID, 64),
      title: text(record.title, `${label} title`, null, 120),
      prompt: text(record.prompt, `${label} prompt`, null, 400),
      teamCode,
      lineup,
      removeNormalizedPlayerNameKey: text(record.removeNormalizedPlayerNameKey, `${label} removeNormalizedPlayerNameKey`, null, 160),
      candidates,
    };
  }
  exactKeys(record, ['roundNumber', 'roundId', 'title', 'prompt', 'teamCode', 'candidates'], label);
  const roundNumber = record.roundNumber;
  if (!Number.isSafeInteger(roundNumber) || roundNumber < 1 || roundNumber > 5
    || !Array.isArray(record.candidates) || record.candidates.length !== 3) {
    fail('v4-daily-board-invalid', `${label} must contain an ordered round and three candidates.`);
  }
  const teamCode = text(record.teamCode, `${label} teamCode`, /^[A-Z]{3}$/, 3);
  const candidates = record.candidates.map((row, index) => normalizePlayerRow(row, {
    seasonStartYear, teamCode, phase: pin.phase,
  }, `${label} candidates[${index}]`));
  if (new Set(candidates.map(row => row.normalizedPlayerNameKey)).size !== candidates.length) {
    fail('v4-daily-board-invalid', `${label} repeats a candidate name key.`);
  }
  return {
    roundNumber,
    roundId: text(record.roundId, `${label} roundId`, /^draft-round-[1-5]-[a-z0-9][a-z0-9-]{0,54}$/, 64),
    title: text(record.title, `${label} title`, null, 120),
    prompt: text(record.prompt, `${label} prompt`, null, 400),
    teamCode,
    candidates,
  };
}

function normalizePackageRef(value, release, pin) {
  exactKeys(value, PACKAGE_REF_KEYS, 'V4 daily packageRef');
  if (value.modelId !== 'swishiq-canonical-v4' || value.releaseId !== release.releaseId
    || value.registrySha256 !== release.registrySha256
    || value.registryRevisionSha256 !== release.registryRevisionSha256
    || value.reviewReceiptSha256 !== release.reviewReceiptSha256
    || value.authorizationReferenceSha256 !== release.authorizationReferenceSha256
    || value.packageId !== pin.packageId || value.packageVersion !== pin.packageVersion
    || value.phase !== pin.phase || canonicalV4IdentityJson(value.scope) !== canonicalV4IdentityJson(pin.scope)) {
    fail('v4-daily-package-ref-mismatch', 'V4 daily board packageRef differs from the reviewed release pin.');
  }
  const packagePin = release.packagePins?.find(item => item?.packageId === pin.packageId);
  const expected = release.expectedIdentity?.packages?.find(item => item?.packageId === pin.packageId);
  if (!packagePin || !expected || expected.packageVersion !== pin.packageVersion
    || !expected.scope || canonicalV4IdentityJson(expected.scope) !== canonicalV4IdentityJson(pin.scope)) {
    fail('v4-daily-package-ref-mismatch', 'The reviewed release does not bind this exact package identity.');
  }
  for (const key of ['indexSha256', 'capabilityMapSha256', 'sourceLockDigestKind', 'sourceLockSha256',
    'sourceLockEmbeddedSha256', 'sourceLockFileSha256', 'sourceLockFileByteLength', 'sourceLockSchemaSha256']) {
    if (value[key] !== packagePin[key] || value[key] !== expected[key]) {
      fail('v4-daily-package-ref-mismatch', `V4 daily packageRef ${key} is not pinned by the reviewed release.`);
    }
  }
  if (value.sourceLockDigestKind !== 'full-lock-object') {
    fail('v4-daily-package-ref-mismatch', 'V4 daily packageRef must bind the full source-lock object.');
  }
  return Object.freeze({ ...value });
}

export async function validateSwishIqV4DailyBoard(board, {
  releasePin,
  gameKind,
  dailySeed,
  boardBytes,
} = {}) {
  const { release, pin } = findSwishIqV4DailyGamePin(releasePin, { gameKind, dailySeed });
  if (!(boardBytes instanceof Uint8Array) || await v4Sha256Hex(boardBytes) !== pin.boardSha256) {
    fail('v4-daily-board-hash-mismatch', 'V4 daily board bytes do not match the immutable release pin.');
  }
  if (!object(board)) fail('v4-daily-board-invalid', 'V4 daily board must be an object.');
  const bodyKeys = pin.gameKind === 'fix-the-five' ? ['challenges'] : ['deck'];
  exactKeys(board, [
    'format', 'contractVersion', 'publicationStatus', 'boardId', 'generatedAt',
    'dailySeed', 'gameKind', 'packageRef', 'boardContentSha256', ...bodyKeys,
  ], 'V4 daily board');
  if (board.format !== SWISHIQ_DAILY_GAME_V4_BOARD_FORMAT
    || board.contractVersion !== SWISHIQ_DAILY_GAME_V4_BOARD_VERSION
    || board.publicationStatus !== 'published' || board.gameKind !== pin.gameKind
    || board.dailySeed !== pin.dailySeed || board.boardContentSha256 !== pin.boardContentSha256) {
    fail('v4-daily-board-pin-mismatch', 'V4 daily board does not match the selected release pin.');
  }
  const packageRef = normalizePackageRef(board.packageRef, release, pin);
  const boardId = text(board.boardId, 'V4 daily board boardId', /^swishiq-v4-(?:fix-the-five|draft-night)-\d{8}-[a-f0-9]{12}$/, 100);
  if (boardId !== `swishiq-v4-${pin.gameKind}-${pin.dailySeed.replaceAll('-', '')}-${pin.boardContentSha256.slice(0, 12)}`) {
    fail('v4-daily-board-pin-mismatch', 'V4 daily board ID is not bound to its content hash.');
  }
  const generatedAt = text(board.generatedAt, 'V4 daily board generatedAt', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/, 40);
  if (!Number.isFinite(Date.parse(generatedAt))) fail('v4-daily-board-invalid', 'V4 daily board generatedAt is invalid.');
  const base = {
    format: SWISHIQ_DAILY_GAME_V4_BOARD_FORMAT,
    contractVersion: SWISHIQ_DAILY_GAME_V4_BOARD_VERSION,
    publicationStatus: 'published',
    boardId,
    generatedAt,
    dailySeed: pin.dailySeed,
    gameKind: pin.gameKind,
    packageRef,
    boardContentSha256: pin.boardContentSha256,
  };
  if (pin.gameKind === 'fix-the-five') {
    if (!Array.isArray(board.challenges) || board.challenges.length !== 5) fail('v4-daily-board-invalid', 'V4 Fix the Five board requires five challenges.');
    const challenges = board.challenges.map((record, index) => normalizeScenarioRecord(pin.gameKind, record, pin, `challenge[${index}]`));
    if (new Set(challenges.map(item => item.challengeId)).size !== challenges.length) fail('v4-daily-board-invalid', 'V4 Fix the Five board repeats a challenge ID.');
    base.challenges = challenges;
  } else {
    exactKeys(board.deck, ['deckId', 'title', 'prompt', 'rounds'], 'V4 Draft Night deck');
    if (!Array.isArray(board.deck.rounds) || board.deck.rounds.length !== 5) fail('v4-daily-board-invalid', 'V4 Draft Night board requires five rounds.');
    const rounds = board.deck.rounds.map((record, index) => {
      const normalized = normalizeScenarioRecord(pin.gameKind, record, pin, `round[${index}]`);
      if (normalized.roundNumber !== index + 1) fail('v4-daily-board-invalid', 'V4 Draft Night rounds are not in canonical order.');
      return normalized;
    });
    if (new Set(rounds.map(item => item.roundId)).size !== rounds.length) fail('v4-daily-board-invalid', 'V4 Draft Night board repeats a round ID.');
    base.deck = {
      deckId: text(board.deck.deckId, 'V4 Draft Night deckId', /^draft-[a-z0-9][a-z0-9-]{1,62}$/, 64),
      title: text(board.deck.title, 'V4 Draft Night title', null, 120),
      prompt: text(board.deck.prompt, 'V4 Draft Night prompt', null, 400),
      rounds,
    };
  }
  const content = { ...base };
  delete content.boardId;
  delete content.boardContentSha256;
  if (await v4Sha256Hex(canonicalV4IdentityJson(content)) !== pin.boardContentSha256) {
    fail('v4-daily-board-content-hash-mismatch', 'V4 daily board canonical content does not match its pin.');
  }
  const normalized = Object.freeze({ ...base, scope: pin.scope, phase: pin.phase });
  validatedBoards.add(normalized);
  return normalized;
}

function boardRefFromBoard(board, release) {
  const pin = release.dailyGamePins.find(row => row.gameKind === board.gameKind && row.dailySeed === board.dailySeed);
  return Object.freeze({
    releaseId: release.releaseId,
    gameKind: board.gameKind,
    dailySeed: board.dailySeed,
    boardId: board.boardId,
    path: pin.path,
    boardSha256: pin.boardSha256,
    boardContentSha256: pin.boardContentSha256,
    packageId: pin.packageId,
    packageVersion: pin.packageVersion,
    scope: pin.scope,
    phase: pin.phase,
  });
}

function scenarioRecordFromBoard(board, scenarioId) {
  if (board.gameKind === 'fix-the-five') {
    const matches = board.challenges.filter(row => row.challengeId === scenarioId);
    if (matches.length !== 1) fail('v4-daily-selection-invalid', 'Selected V4 challenge is not on this board.');
    return [matches[0]];
  }
  const matches = board.deck.rounds.filter(row => row.roundId === scenarioId);
  if (matches.length !== 1) fail('v4-daily-selection-invalid', 'Selected V4 draft round is not on this board.');
  return matches;
}

async function scenarioPinsForBoard(board, boardRef, resultContract, records) {
  return Object.freeze(await Promise.all(records.map(async scenarioRecord => {
    const scenarioSha256 = await v4Sha256Hex(canonicalV4IdentityJson({
      format: SWISHIQ_DAILY_GAME_V4_SCENARIO_FORMAT,
      boardRef,
      resultContract,
      gameKind: board.gameKind,
      scenarioRecord,
    }));
    return Object.freeze(board.gameKind === 'fix-the-five'
      ? { challengeId: scenarioRecord.challengeId, scenarioSha256 }
      : { roundId: scenarioRecord.roundId, scenarioSha256 });
  })));
}

export async function buildSwishIqV4DailyGameRequest({
  board,
  releasePin,
  scenarioId = '',
  normalizedPlayerNameKey = '',
  picks = [],
} = {}) {
  if (!validatedBoards.has(board)) fail('v4-daily-board-unvalidated', 'A hash-verified V4 daily board is required before building a request.');
  const release = normalizeSwishIqV4DailyReleasePin(releasePin);
  const boardRef = boardRefFromBoard(board, release);
  const resultContract = Object.freeze({ format: SWISHIQ_DAILY_GAME_V4_RESPONSE_FORMAT, contractVersion: SWISHIQ_DAILY_GAME_V4_CONTRACT_VERSION });
  const scenarioRecords = board.gameKind === 'fix-the-five'
    ? scenarioRecordFromBoard(board, scenarioId)
    : board.deck.rounds;
  const scenarioPins = await scenarioPinsForBoard(board, boardRef, resultContract, scenarioRecords);
  const scenarioSha256 = await v4Sha256Hex(canonicalV4IdentityJson({
    format: SWISHIQ_DAILY_GAME_V4_SCENARIOS_FORMAT,
    boardRef,
    resultContract,
    gameKind: board.gameKind,
    scenarioPins,
  }));
  let selection;
  if (board.gameKind === 'fix-the-five') {
    if (typeof normalizedPlayerNameKey !== 'string' || !scenarioRecords[0].candidates.some(row => row.normalizedPlayerNameKey === normalizedPlayerNameKey)) {
      fail('v4-daily-selection-invalid', 'Fix the Five selection must name one listed legal candidate.');
    }
    selection = Object.freeze({
      kind: 'fix-the-five',
      challengeId: scenarioId,
      normalizedPlayerNameKey,
    });
  } else {
    if (!Array.isArray(picks) || picks.length !== 5 || picks.some((pick, index) => {
      const round = board.deck.rounds[index];
      return !object(pick) || Object.keys(pick).sort().join(',') !== 'normalizedPlayerNameKey,roundId'
        || pick.roundId !== round.roundId
        || !round.candidates.some(row => row.normalizedPlayerNameKey === pick.normalizedPlayerNameKey);
    }) || new Set(picks.map(pick => pick.normalizedPlayerNameKey)).size !== picks.length) {
      fail('v4-daily-selection-invalid', 'Draft Night picks must cover the five ordered board rounds with distinct listed name keys.');
    }
    selection = Object.freeze(picks.map(pick => Object.freeze({ ...pick })));
  }
  const runId = await v4Sha256Hex(canonicalV4IdentityJson({ scenarioSha256, selection }));
  return Object.freeze({
    format: SWISHIQ_DAILY_GAME_V4_REQUEST_FORMAT,
    contractVersion: SWISHIQ_DAILY_GAME_V4_CONTRACT_VERSION,
    action: 'evaluate',
    boardRef,
    resultContract,
    scenarioPins,
    scenarioSha256,
    runId,
    selection,
  });
}

export async function validateSwishIqV4DailyGameRequest(request, { board, releasePin } = {}) {
  await validateSwishIqV4DailyGameRequestEnvelope(request);
  if (board?.gameKind === 'fix-the-five') {
    exactKeys(request.selection, ['kind', 'challengeId', 'normalizedPlayerNameKey'], 'V4 Fix the Five selection');
    if (request.selection.kind !== 'fix-the-five') fail('v4-daily-request-invalid', 'V4 Fix the Five selection kind is invalid.');
  }
  let expected;
  if (board?.gameKind === 'fix-the-five') {
    expected = await buildSwishIqV4DailyGameRequest({
      board,
      releasePin,
      scenarioId: request.selection.challengeId,
      normalizedPlayerNameKey: request.selection.normalizedPlayerNameKey,
    });
  } else if (board?.gameKind === 'draft-night') {
    expected = await buildSwishIqV4DailyGameRequest({ board, releasePin, picks: request.selection });
  } else {
    fail('v4-daily-request-invalid', 'V4 daily request has no validated board context.');
  }
  if (canonicalV4IdentityJson(expected) !== canonicalV4IdentityJson(request)) {
    fail('v4-daily-request-mismatch', 'V4 daily request is not bound to its exact board, scenario, and selection.');
  }
  return expected;
}

export async function validateSwishIqV4DailyGameRequestEnvelope(request) {
  exactKeys(request, [
    'format', 'contractVersion', 'action', 'boardRef', 'resultContract',
    'scenarioPins', 'scenarioSha256', 'runId', 'selection',
  ], 'V4 daily evaluator request');
  if (request.format !== SWISHIQ_DAILY_GAME_V4_REQUEST_FORMAT
    || request.contractVersion !== SWISHIQ_DAILY_GAME_V4_CONTRACT_VERSION
    || request.action !== 'evaluate') {
    fail('v4-daily-request-invalid', 'V4 daily evaluator request format is unsupported.');
  }
  const ref = request.boardRef;
  exactKeys(ref, [
    'releaseId', 'gameKind', 'dailySeed', 'boardId', 'path', 'boardSha256',
    'boardContentSha256', 'packageId', 'packageVersion', 'scope', 'phase',
  ], 'V4 daily request boardRef');
  const kind = text(ref.gameKind, 'V4 request gameKind', /^(fix-the-five|draft-night)$/, 40);
  const phase = text(ref.phase, 'V4 request phase', /^(regular|in_season_tournament|play_in|playoffs)$/, 40);
  normalizeScope(ref.scope, phase);
  text(ref.releaseId, 'V4 request releaseId', RELEASE_ID, 40);
  validDate(ref.dailySeed);
  text(ref.boardId, 'V4 request boardId', /^swishiq-v4-(?:fix-the-five|draft-night)-\d{8}-[a-f0-9]{12}$/, 100);
  const requestPin = normalizeDailyPin({
    gameKind: kind,
    dailySeed: ref.dailySeed,
    path: ref.path,
    boardSha256: ref.boardSha256,
    boardContentSha256: ref.boardContentSha256,
    packageId: ref.packageId,
    packageVersion: ref.packageVersion,
    scope: ref.scope,
    phase,
  });
  if (requestPin.gameKind !== kind || requestPin.dailySeed !== ref.dailySeed) {
    fail('v4-daily-request-invalid', 'V4 daily request boardRef is inconsistent.');
  }
  exactKeys(request.resultContract, ['format', 'contractVersion'], 'V4 daily resultContract');
  if (request.resultContract.format !== SWISHIQ_DAILY_GAME_V4_RESPONSE_FORMAT
    || request.resultContract.contractVersion !== SWISHIQ_DAILY_GAME_V4_CONTRACT_VERSION) {
    fail('v4-daily-request-invalid', 'V4 daily resultContract is unsupported.');
  }
  if (!Array.isArray(request.scenarioPins) || request.scenarioPins.length !== (kind === 'fix-the-five' ? 1 : 5)) {
    fail('v4-daily-request-invalid', 'V4 daily request scenario pin count is invalid.');
  }
  request.scenarioPins.forEach((scenario, index) => {
    const key = kind === 'fix-the-five' ? 'challengeId' : 'roundId';
    exactKeys(scenario, [key, 'scenarioSha256'], `V4 scenarioPins[${index}]`);
    text(scenario[key], `V4 scenarioPins[${index}].${key}`, kind === 'fix-the-five'
      ? HASHED_SCENARIO_ID : /^draft-round-[1-5]-[a-z0-9][a-z0-9-]{0,54}$/, 64);
    hash(scenario.scenarioSha256, `V4 scenarioPins[${index}].scenarioSha256`);
  });
  if (kind === 'fix-the-five') {
    exactKeys(request.selection, ['kind', 'challengeId', 'normalizedPlayerNameKey'], 'V4 Fix the Five selection');
    if (request.selection.kind !== kind || request.selection.challengeId !== request.scenarioPins[0].challengeId) {
      fail('v4-daily-request-invalid', 'V4 Fix the Five selection is not bound to its scenario pin.');
    }
    const selectionKey = text(request.selection.normalizedPlayerNameKey, 'V4 selection normalizedPlayerNameKey', null, 160);
    if (normalizeCanonicalV4PlayerNameKey(selectionKey) !== selectionKey) fail('v4-daily-request-invalid', 'V4 selection name key is not canonical.');
  } else {
    if (!Array.isArray(request.selection) || request.selection.length !== 5) fail('v4-daily-request-invalid', 'V4 Draft Night selection requires five ordered picks.');
    request.selection.forEach((pick, index) => {
      exactKeys(pick, ['roundId', 'normalizedPlayerNameKey'], `V4 Draft Night selection[${index}]`);
      if (pick.roundId !== request.scenarioPins[index].roundId) fail('v4-daily-request-invalid', 'V4 Draft Night picks do not follow the pinned round order.');
      const selectionKey = text(pick.normalizedPlayerNameKey, `V4 Draft Night selection[${index}].normalizedPlayerNameKey`, null, 160);
      if (normalizeCanonicalV4PlayerNameKey(selectionKey) !== selectionKey) fail('v4-daily-request-invalid', 'V4 Draft Night name key is not canonical.');
    });
    if (new Set(request.selection.map(pick => pick.normalizedPlayerNameKey)).size !== 5) {
      fail('v4-daily-request-invalid', 'V4 Draft Night selection repeats a normalized player name key.');
    }
  }
  hash(request.scenarioSha256, 'V4 request scenarioSha256');
  const expectedScenarioSha256 = await v4Sha256Hex(canonicalV4IdentityJson({
    format: SWISHIQ_DAILY_GAME_V4_SCENARIOS_FORMAT,
    boardRef: ref,
    resultContract: request.resultContract,
    gameKind: kind,
    scenarioPins: request.scenarioPins,
  }));
  if (request.scenarioSha256 !== expectedScenarioSha256) {
    fail('v4-daily-request-invalid', 'V4 daily request scenario hash does not bind its ordered scenario pins.');
  }
  const expectedRunId = await v4Sha256Hex(canonicalV4IdentityJson({
    scenarioSha256: request.scenarioSha256,
    selection: request.selection,
  }));
  if (text(request.runId, 'V4 request runId', HASH, 64) !== expectedRunId) {
    fail('v4-daily-request-invalid', 'V4 daily request runId does not bind its scenario and selection.');
  }
  return Object.freeze(requestPin);
}

export function unavailableSwishIqV4DailyGameResponse(request, reason) {
  const allowed = new Set([
    'v4-daily-release-pin-unavailable', 'v4-daily-board-pin-unavailable',
    'v4-daily-board-unavailable', 'v4-daily-evaluator-unavailable',
  ]);
  const normalizedReason = text(reason, 'V4 daily unavailable reason', /^[a-z0-9-]{1,80}$/, 80);
  if (!allowed.has(normalizedReason)) fail('v4-daily-contract-invalid', 'V4 daily unavailable reason is unsupported.');
  return Object.freeze({
    format: SWISHIQ_DAILY_GAME_V4_RESPONSE_FORMAT,
    contractVersion: SWISHIQ_DAILY_GAME_V4_CONTRACT_VERSION,
    action: 'evaluate',
    status: 'unavailable',
    reason: normalizedReason,
    ...(object(request) ? {
      boardRef: request.boardRef,
      resultContract: request.resultContract,
      scenarioPins: request.scenarioPins,
      scenarioSha256: request.scenarioSha256,
      runId: request.runId,
      selection: request.selection,
    } : {}),
  });
}

export function completeSwishIqV4DailyGameResponse(request, { evaluation, sourcePins } = {}) {
  if (!object(evaluation) || evaluation.format !== 'djhc-swishiq-v4-daily-game-evaluator-v1'
    || evaluation.version !== 'swishiq-v4-daily-exact-season-impact-boxscore-rank-v1'
    || evaluation.status !== 'complete' || evaluation.evaluationKind !== 'descriptive-source-impact-ranking'
    || !object(sourcePins) || !object(sourcePins.packageRef)
    || !Array.isArray(sourcePins.parts)) {
    fail('v4-daily-contract-invalid', 'A complete V4 descriptive evaluation and source pins are required.');
  }
  return Object.freeze({
    format: SWISHIQ_DAILY_GAME_V4_RESPONSE_FORMAT,
    contractVersion: SWISHIQ_DAILY_GAME_V4_CONTRACT_VERSION,
    action: 'evaluate',
    status: 'complete',
    boardRef: request.boardRef,
    resultContract: request.resultContract,
    scenarioPins: request.scenarioPins,
    scenarioSha256: request.scenarioSha256,
    runId: request.runId,
    selection: request.selection,
    evaluation,
    sourcePins,
  });
}

export function validateSwishIqV4DailyGameUnavailableResponse(response, request) {
  exactKeys(response, [
    'format', 'contractVersion', 'action', 'status', 'reason', 'boardRef',
    'resultContract', 'scenarioPins', 'scenarioSha256', 'runId', 'selection',
  ], 'V4 daily evaluator response');
  if (response.format !== SWISHIQ_DAILY_GAME_V4_RESPONSE_FORMAT
    || response.contractVersion !== SWISHIQ_DAILY_GAME_V4_CONTRACT_VERSION
    || response.action !== 'evaluate' || response.status !== 'unavailable'
    || !['v4-daily-release-pin-unavailable', 'v4-daily-board-pin-unavailable',
      'v4-daily-board-unavailable', 'v4-daily-evaluator-unavailable'].includes(response.reason)) {
    fail('v4-daily-response-invalid', 'The V4 evaluator did not return a supported unavailable response.');
  }
  for (const key of ['boardRef', 'resultContract', 'scenarioPins', 'scenarioSha256', 'runId', 'selection']) {
    if (canonicalV4IdentityJson(response[key]) !== canonicalV4IdentityJson(request[key])) {
      fail('v4-daily-response-mismatch', `V4 evaluator response ${key} differs from the request.`);
    }
  }
  return Object.freeze({ ...response });
}

export function validateSwishIqV4DailyGameResponse(response, request, { releasePin = null, board = null } = {}) {
  if (response?.status === 'unavailable') {
    return validateSwishIqV4DailyGameUnavailableResponse(response, request);
  }
  exactKeys(response, [
    'format', 'contractVersion', 'action', 'status', 'boardRef', 'resultContract',
    'scenarioPins', 'scenarioSha256', 'runId', 'selection', 'evaluation', 'sourcePins',
  ], 'V4 daily evaluator response');
  if (response.format !== SWISHIQ_DAILY_GAME_V4_RESPONSE_FORMAT
    || response.contractVersion !== SWISHIQ_DAILY_GAME_V4_CONTRACT_VERSION
    || response.action !== 'evaluate' || response.status !== 'complete') {
    fail('v4-daily-response-invalid', 'The V4 evaluator response format is unsupported.');
  }
  for (const key of ['boardRef', 'resultContract', 'scenarioPins', 'scenarioSha256', 'runId', 'selection']) {
    if (canonicalV4IdentityJson(response[key]) !== canonicalV4IdentityJson(request[key])) {
      fail('v4-daily-response-mismatch', `V4 evaluator response ${key} differs from the request.`);
    }
  }
  exactKeys(response.sourcePins, ['packageRef', 'parts'], 'V4 daily sourcePins');
  const normalizedPin = normalizeDailyPin({
    gameKind: request.boardRef.gameKind,
    dailySeed: request.boardRef.dailySeed,
    path: request.boardRef.path,
    boardSha256: request.boardRef.boardSha256,
    boardContentSha256: request.boardRef.boardContentSha256,
    packageId: request.boardRef.packageId,
    packageVersion: request.boardRef.packageVersion,
    scope: request.boardRef.scope,
    phase: request.boardRef.phase,
  });
  const sourcePackageRef = response.sourcePins?.packageRef;
  if (!object(sourcePackageRef)
    || sourcePackageRef.modelId !== 'swishiq-canonical-v4'
    || sourcePackageRef.releaseId !== request.boardRef.releaseId
    || sourcePackageRef.packageId !== normalizedPin.packageId
    || sourcePackageRef.packageVersion !== normalizedPin.packageVersion
    || sourcePackageRef.phase !== normalizedPin.phase
    || canonicalV4IdentityJson(sourcePackageRef.scope) !== canonicalV4IdentityJson(normalizedPin.scope)) {
    fail('v4-daily-response-source-mismatch', 'V4 evaluator source pins do not match the board package scope.');
  }
  if (board?.packageRef && canonicalV4IdentityJson(sourcePackageRef) !== canonicalV4IdentityJson(board.packageRef)) {
    fail('v4-daily-response-source-mismatch', 'V4 evaluator source packageRef does not match the verified board.');
  }
  const release = normalizeSwishIqV4DailyReleasePin(releasePin);
  const packagePin = release.packagePins.find(row => row.packageId === normalizedPin.packageId);
  const expectedIdentity = release.expectedIdentity.packages.find(row => row.packageId === normalizedPin.packageId);
  normalizePackageRef(sourcePackageRef, release, normalizedPin);
  if (!packagePin || !expectedIdentity
    || release.releaseId !== request.boardRef.releaseId
    || sourcePackageRef.registrySha256 !== release.registrySha256
    || sourcePackageRef.registryRevisionSha256 !== release.registryRevisionSha256
    || sourcePackageRef.reviewReceiptSha256 !== release.reviewReceiptSha256
    || sourcePackageRef.authorizationReferenceSha256 !== release.authorizationReferenceSha256) {
    fail('v4-daily-response-source-mismatch', 'V4 evaluator source proof is not bound to the reviewed release pin.');
  }
  for (const key of ['indexSha256', 'capabilityMapSha256', 'sourceLockDigestKind', 'sourceLockSha256',
    'sourceLockEmbeddedSha256', 'sourceLockFileSha256', 'sourceLockFileByteLength', 'sourceLockSchemaSha256']) {
    if (sourcePackageRef[key] !== packagePin[key] || sourcePackageRef[key] !== expectedIdentity[key]) {
      fail('v4-daily-response-source-mismatch', `V4 evaluator source packageRef ${key} is not pinned by the release.`);
    }
  }
  const parts = response.sourcePins.parts;
  if (parts.length !== 2 || new Set(parts.map(part => part?.artifactId)).size !== 2
    || !['player-impact', 'player-games'].every(id => parts.some(part => part?.artifactId === id))) {
    fail('v4-daily-response-source-mismatch', 'V4 evaluator must bind both player-impact and player-games part hashes.');
  }
  parts.forEach((part, index) => {
    exactKeys(part, ['artifactId', 'sha256', 'rows', 'bytes'], `V4 source part[${index}]`);
    text(part.artifactId, `V4 source part[${index}] artifactId`, /^(player-impact|player-games)$/, 80);
    hash(part.sha256, `V4 source part[${index}] sha256`);
    if (!Number.isSafeInteger(part.rows) || part.rows < 0 || !Number.isSafeInteger(part.bytes) || part.bytes < 0) {
      fail('v4-daily-response-source-mismatch', 'V4 evaluator part row and byte counts must be non-negative integers.');
    }
  });
  const evaluation = response.evaluation;
  exactKeys(evaluation, ['format', 'version', 'status', 'evaluationKind', 'scope', 'decision', 'estimatedImpact', 'evidence'], 'V4 daily evaluation');
  if (evaluation.format !== 'djhc-swishiq-v4-daily-game-evaluator-v1'
    || evaluation.version !== 'swishiq-v4-daily-exact-season-impact-boxscore-rank-v1'
    || evaluation.status !== 'complete' || evaluation.evaluationKind !== 'descriptive-source-impact-ranking'
    || !object(evaluation.scope) || evaluation.scope.kind !== 'exact-season'
    || evaluation.scope.seasonStartYear !== normalizedPin.scope.seasonStartYears[0]
    || evaluation.scope.phase !== normalizedPin.phase
    || !object(evaluation.decision) || !Number.isSafeInteger(evaluation.decision.rank)
    || !Number.isSafeInteger(evaluation.decision.optionCount) || evaluation.decision.rank < 1
    || evaluation.decision.rank > evaluation.decision.optionCount || evaluation.decision.countComplete !== true
    || !object(evaluation.estimatedImpact) || evaluation.estimatedImpact.unit !== 'points-per-100-possessions'
    || !['value', 'bestValue', 'gapToBest'].every(key => Number.isFinite(evaluation.estimatedImpact[key]))
    || !Number.isSafeInteger(evaluation.evidence?.impactRows) || evaluation.evidence.impactRows < 1
    || !Number.isSafeInteger(evaluation.evidence?.sameTeamPhaseBoxScorePlayers) || evaluation.evidence.sameTeamPhaseBoxScorePlayers < 1
    || !Number.isSafeInteger(evaluation.evidence?.sameTeamPhaseBoxScoreGames) || evaluation.evidence.sameTeamPhaseBoxScoreGames < 1
    || evaluation.evidence.attributionScope !== 'source-reported-context-only / not-a-proven-team-split'
    || evaluation.evidence.predictiveEligibility !== false
    || evaluation.evidence.calibrationStatus !== 'not-validated-for-game-outcome-prediction'
    || evaluation.evidence.uncertainty !== 'not-available') {
    fail('v4-daily-response-invalid', 'V4 evaluation metrics, evidence scope, or descriptive-only boundary are invalid.');
  }
  return Object.freeze({ ...response });
}

export function resolveSwishIqDailyGameSourceMode({ sourceMode = 'auto', releasePin = null, search = '' } = {}) {
  if (!['auto', 'v3', 'v4'].includes(sourceMode)) fail('v4-daily-source-invalid', 'sourceMode must be auto, v3, or v4.');
  const query = new URLSearchParams(search);
  const v4Selected = sourceMode === 'v4'
    || query.get('source')?.trim().toLowerCase() === 'v4'
    || (object(releasePin) && releasePin.status !== 'unconfigured');
  if (sourceMode === 'v3' && v4Selected) {
    fail('v4-daily-v3-fallback-blocked', 'V4 is selected for this daily game; V3 boards cannot be used as a fallback.');
  }
  return v4Selected ? 'v4' : 'v3';
}

export function dailyGamePinUrl(releasePin, pin) {
  const release = normalizeSwishIqV4DailyReleasePin(releasePin);
  const normalizedPin = normalizeDailyPin(pin);
  if (!release.dailyGamePins.some(candidate => canonicalV4IdentityJson(candidate) === canonicalV4IdentityJson(normalizedPin))) {
    fail('v4-daily-pin-invalid', 'Daily board reference is not a member of the reviewed release pin.');
  }
  const base = new URL(release.releaseRootUrl);
  const url = new URL(normalizedPin.path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)
    || url.search || url.hash) fail('v4-daily-pin-invalid', 'V4 daily board path escapes its immutable release root.');
  return url.href;
}

export function isSwishIqV4DailyGameError(error, code = '') {
  return error instanceof SwishIqDailyGameV4Error
    && (!code || error.code === code);
}
