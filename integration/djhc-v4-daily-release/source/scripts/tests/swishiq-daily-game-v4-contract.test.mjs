import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalV4IdentityJson,
  v4Sha256Hex,
} from '../../tools/swishiq-studio/engine/canonical-v4-identity.js';
import {
  SWISHIQ_DAILY_GAME_V4_BOARD_FORMAT,
  SWISHIQ_DAILY_GAME_V4_BOARD_VERSION,
  SWISHIQ_DAILY_GAME_V4_RESPONSE_FORMAT,
  SwishIqDailyGameV4Error,
  buildSwishIqV4DailyGameRequest,
  findSwishIqV4DailyGamePin,
  normalizeSwishIqV4DailyReleasePin,
  resolveSwishIqDailyGameSourceMode,
  unavailableSwishIqV4DailyGameResponse,
  validateSwishIqV4DailyBoard,
  validateSwishIqV4DailyGameRequest,
  validateSwishIqV4DailyGameRequestEnvelope,
  validateSwishIqV4DailyGameUnavailableResponse,
} from '../../tools/swishiq-studio/engine/swishiq-daily-game-v4-contract.js';
import { loadSwishIQDailyBoard } from '../../tools/swishiq-daily-game-client.js';

const digest = letter => letter.repeat(64);
const scopeFor = year => ({
  kind: 'exact-season', seasonStartYears: [year], seasonStartYear: year, seasonEndYear: year + 1,
  phases: ['regular', 'in_season_tournament', 'play_in', 'playoffs'], pooledFitIsSeasonSpecific: true,
});
const scope = scopeFor(2025);
const packageId = 'nba-swishiq-v4-2025-26';
const packageVersion = 'v4-canonical-20260929-aaaaaaaaaaaa';
const releaseId = 'v4-site-abcdef123456';
const packageLockPins = {
  sourceLockDigestKind: 'full-lock-object',
  sourceLockSha256: digest('1'),
  sourceLockEmbeddedSha256: digest('2'),
  sourceLockFileSha256: digest('3'),
  sourceLockFileByteLength: 42,
  sourceLockSchemaSha256: digest('4'),
};

function allPackageIds() {
  return [
    ...Array.from({ length: 9 }, (_, index) => {
      const year = 2017 + index;
      return `nba-swishiq-v4-${year}-${String(year + 1).slice(-2)}`;
    }),
    'nba-swishiq-v4-2017-26',
  ];
}

function makeReleasePin(dailyGamePins = []) {
  const expectedIdentity = allPackageIds().map((id, index) => ({
    ...packageLockPins,
    packageId: id,
    packageVersion: id === packageId ? packageVersion : `v4-canonical-test-${String(index).padStart(2, '0')}`,
    buildRecipeDigest: digest('5'),
    manifestSha256: digest('6'),
    indexSha256: digest('7'),
    capabilityMapSha256: digest('8'),
    scope: id === packageId ? scope : scopeFor(2017 + index),
    scopeResolutionPolicy: 'exact-season-only-no-pooled-substitution',
    capabilitySummary: { exactSeasonImpact: 'available' },
    buildRecipe: { schemaVersion: 1 },
  }));
  const packagePins = allPackageIds().map((id, index) => ({
    ...packageLockPins,
    packageId: id,
    indexSha256: digest('7'),
    capabilityMapSha256: digest('8'),
    ...(index === 8 ? {} : {}),
  }));
  return {
    format: 'djhc-swishiq-v4-studio-runtime-release-pin-v2',
    version: 'swishiq-v4-studio-runtime-release-pin-v2',
    status: 'reviewed',
    registryUrl: `https://www.djshouseofcards-comics.com/tools/swishiq-studio/data/v4/releases/${releaseId}/registry.json`,
    registrySha256: digest('9'),
    registryRevisionSha256: digest('a'),
    reviewReceiptSha256: digest('b'),
    authorizationReferenceSha256: digest('c'),
    expectedIdentity: { packages: expectedIdentity },
    packagePins,
    dailyGamePins,
  };
}

function packageRef(releasePin) {
  return {
    modelId: 'swishiq-canonical-v4',
    releaseId,
    registrySha256: releasePin.registrySha256,
    registryRevisionSha256: releasePin.registryRevisionSha256,
    reviewReceiptSha256: releasePin.reviewReceiptSha256,
    authorizationReferenceSha256: releasePin.authorizationReferenceSha256,
    packageId,
    packageVersion,
    scope,
    phase: 'regular',
    indexSha256: digest('7'),
    capabilityMapSha256: digest('8'),
    ...packageLockPins,
  };
}

function player(name, teamCode = 'BOS') {
  return {
    displayName: name,
    normalizedPlayerNameKey: name.toLowerCase(),
    seasonStartYear: 2025,
    teamCode,
    phase: 'regular',
  };
}

async function makeBoardAndPin() {
  const releasePin = makeReleasePin();
  const challenges = Array.from({ length: 5 }, (_, challengeIndex) => {
    const prefix = `c${challengeIndex}`;
    const lineup = Array.from({ length: 5 }, (_, index) => player(`${prefix}-lineup-${index}`));
    const candidates = Array.from({ length: 3 }, (_, index) => player(`${prefix}-candidate-${index}`));
    return {
      challengeId: `fix-${prefix}`,
      title: `Challenge ${challengeIndex + 1}`,
      prompt: 'Choose a legal replacement.',
      teamCode: 'BOS',
      lineup,
      removeNormalizedPlayerNameKey: lineup[0].normalizedPlayerNameKey,
      candidates,
    };
  });
  const body = {
    format: SWISHIQ_DAILY_GAME_V4_BOARD_FORMAT,
    contractVersion: SWISHIQ_DAILY_GAME_V4_BOARD_VERSION,
    publicationStatus: 'published',
    boardId: '',
    generatedAt: '2026-10-01T12:00:00.000Z',
    dailySeed: '2026-10-01',
    gameKind: 'fix-the-five',
    packageRef: packageRef(releasePin),
    challenges,
  };
  const content = { ...body };
  delete content.boardId;
  const boardContentSha256 = await v4Sha256Hex(canonicalV4IdentityJson(content));
  body.boardId = `swishiq-v4-fix-the-five-20261001-${boardContentSha256.slice(0, 12)}`;
  body.boardContentSha256 = boardContentSha256;
  const bytes = new TextEncoder().encode(canonicalV4IdentityJson(body));
  const dailyGamePin = {
    gameKind: 'fix-the-five',
    dailySeed: '2026-10-01',
    path: 'daily-games/fix-the-five/2026-10-01.json',
    boardSha256: await v4Sha256Hex(bytes),
    boardContentSha256,
    packageId,
    packageVersion,
    scope,
    phase: 'regular',
  };
  releasePin.dailyGamePins = [dailyGamePin];
  return { releasePin, board: body, bytes, dailyGamePin };
}

test('V4 daily release pins are exact-scope and an absent game pin is explicit', () => {
  const releasePin = makeReleasePin([]);
  assert.equal(normalizeSwishIqV4DailyReleasePin(releasePin).dailyGamePins.length, 0);
  assert.throws(
    () => findSwishIqV4DailyGamePin(releasePin, { gameKind: 'fix-the-five', dailySeed: '2026-10-01' }),
    error => error instanceof SwishIqDailyGameV4Error && error.code === 'v4-daily-board-pin-unavailable',
  );
  const pooledPin = makeReleasePin([{
    gameKind: 'draft-night', dailySeed: '2026-10-01', path: 'daily-games/draft-night/2026-10-01.json',
    boardSha256: digest('d'), boardContentSha256: digest('e'), packageId: 'nba-swishiq-v4-2017-26',
    packageVersion: 'v4-canonical-2017-26',
    scope: { kind: 'pooled-window', seasonStartYears: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], seasonStartYear: 2017, seasonEndYear: 2026, phases: ['regular', 'in_season_tournament', 'play_in', 'playoffs'], pooledFitIsSeasonSpecific: false },
    phase: 'regular',
  }]);
  assert.throws(() => normalizeSwishIqV4DailyReleasePin(pooledPin), error => error.code === 'v4-daily-exact-scope-required');
});

test('V4 selection never requests a V3 board after the V4 board pin is absent', async () => {
  let fetchCount = 0;
  const releasePin = makeReleasePin([]);
  await assert.rejects(loadSwishIQDailyBoard({
    gameKind: 'fix-the-five',
    dailySeed: '2026-10-01',
    sourceMode: 'v4',
    releasePin,
    fetcher: async () => { fetchCount += 1; throw new Error('unexpected network request'); },
  }), error => error.code === 'v4-daily-board-pin-unavailable');
  assert.equal(fetchCount, 0);
  await assert.rejects(loadSwishIQDailyBoard({
    gameKind: 'fix-the-five',
    dailySeed: '2026-10-01',
    sourceMode: 'v3',
    releasePin,
  }), error => error.code === 'v4-daily-v3-fallback-blocked');
});

test('an incomplete supplied V4 pin selects V4 mode and cannot be overridden to V3', () => {
  assert.equal(resolveSwishIqDailyGameSourceMode({ releasePin: { status: 'unconfigured' } }), 'v3');
  assert.equal(resolveSwishIqDailyGameSourceMode({ releasePin: { status: 'reviewed' } }), 'v4');
  assert.equal(resolveSwishIqDailyGameSourceMode({ releasePin: { status: 'draft' } }), 'v4');
  assert.throws(() => resolveSwishIqDailyGameSourceMode({
    sourceMode: 'v3',
    releasePin: { status: 'draft' },
  }), error => error.code === 'v4-daily-v3-fallback-blocked');
});

test('V4 Fix the Five request and unavailable response bind exact board, scenario, and name key', async () => {
  const fixture = await makeBoardAndPin();
  const board = await validateSwishIqV4DailyBoard(fixture.board, {
    releasePin: fixture.releasePin,
    gameKind: 'fix-the-five',
    dailySeed: '2026-10-01',
    boardBytes: fixture.bytes,
  });
  const request = await buildSwishIqV4DailyGameRequest({
    board,
    releasePin: fixture.releasePin,
    scenarioId: 'fix-c0',
    normalizedPlayerNameKey: 'c0-candidate-0',
  });
  assert.equal(request.format, 'djhc-swishiq-game-evaluate-v4-request-v1');
  assert.equal(request.boardRef.boardSha256, fixture.dailyGamePin.boardSha256);
  assert.equal(request.scenarioPins.length, 1);
  assert.equal(request.selection.normalizedPlayerNameKey, 'c0-candidate-0');
  assert.equal(JSON.stringify(request).includes('playerRef'), false);
  assert.equal(JSON.stringify(request).includes('providerId'), false);
  await validateSwishIqV4DailyGameRequestEnvelope(request);
  await validateSwishIqV4DailyGameRequest(request, { board, releasePin: fixture.releasePin });
  const response = unavailableSwishIqV4DailyGameResponse(request, 'v4-daily-evaluator-unavailable');
  assert.equal(response.format, SWISHIQ_DAILY_GAME_V4_RESPONSE_FORMAT);
  assert.equal(validateSwishIqV4DailyGameUnavailableResponse(response, request).status, 'unavailable');
  assert.throws(() => validateSwishIqV4DailyGameUnavailableResponse({ ...response, scenarioSha256: digest('f') }, request), error => error.code === 'v4-daily-response-mismatch');
});

test('V4 daily board refuses altered bytes, provider IDs, and out-of-scope phase', async () => {
  const fixture = await makeBoardAndPin();
  const altered = new Uint8Array(fixture.bytes);
  altered[altered.length - 2] ^= 1;
  await assert.rejects(validateSwishIqV4DailyBoard(fixture.board, {
    releasePin: fixture.releasePin, gameKind: 'fix-the-five', dailySeed: '2026-10-01', boardBytes: altered,
  }), error => error.code === 'v4-daily-board-hash-mismatch');

  const unsafeBoard = structuredClone(fixture.board);
  unsafeBoard.challenges[0].candidates[0].playerRef = 'p_' + 'a'.repeat(32);
  const unsafeBytes = new TextEncoder().encode(canonicalV4IdentityJson(unsafeBoard));
  const unsafePin = {
    ...fixture.dailyGamePin,
    boardSha256: await v4Sha256Hex(unsafeBytes),
  };
  const releasePin = makeReleasePin([unsafePin]);
  await assert.rejects(validateSwishIqV4DailyBoard(unsafeBoard, {
    releasePin, gameKind: 'fix-the-five', dailySeed: '2026-10-01', boardBytes: unsafeBytes,
  }), error => error.code === 'v4-daily-contract-invalid');
});
