import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SWISHIQ_DAILY_GAME_V4_BOARD_FORMAT,
  SWISHIQ_DAILY_GAME_V4_BOARD_VERSION,
  buildSwishIqV4DailyGameRequest,
  completeSwishIqV4DailyGameResponse,
  validateSwishIqV4DailyBoard,
  validateSwishIqV4DailyGameResponse,
} from '../../tools/swishiq-studio/engine/swishiq-daily-game-v4-contract.js';
import { canonicalV4IdentityJson, v4Sha256Hex } from '../../tools/swishiq-studio/engine/canonical-v4-identity.js';
import { evaluateSwishIqV4DailyGameSelection } from '../../tools/swishiq-studio/engine/swishiq-daily-game-v4-evaluator.js';

const hash = char => char.repeat(64);
const scopeFor = year => ({
  kind: 'exact-season', seasonStartYears: [year], seasonStartYear: year, seasonEndYear: year + 1,
  phases: ['regular', 'in_season_tournament', 'play_in', 'playoffs'], pooledFitIsSeasonSpecific: true,
});
const scope = scopeFor(2025);
const packageId = 'nba-swishiq-v4-2025-26';
const packageVersion = 'v4-canonical-test-2025-abcdef123456';
const releaseId = 'v4-site-abcdef123456';
const lockPins = {
  sourceLockDigestKind: 'full-lock-object', sourceLockSha256: hash('1'), sourceLockEmbeddedSha256: hash('2'),
  sourceLockFileSha256: hash('3'), sourceLockFileByteLength: 42, sourceLockSchemaSha256: hash('4'),
};

function packageIds() {
  return [...Array.from({ length: 9 }, (_, index) => `nba-swishiq-v4-${2017 + index}-${String(2018 + index).slice(-2)}`), 'nba-swishiq-v4-2017-26'];
}

function makeReleasePin(dailyGamePins = []) {
  const ids = packageIds();
  return {
    format: 'djhc-swishiq-v4-studio-runtime-release-pin-v2',
    version: 'swishiq-v4-studio-runtime-release-pin-v2',
    status: 'reviewed',
    registryUrl: `https://www.djshouseofcards-comics.com/tools/swishiq-studio/data/v4/releases/${releaseId}/registry.json`,
    registrySha256: hash('9'), registryRevisionSha256: hash('a'), reviewReceiptSha256: hash('b'), authorizationReferenceSha256: hash('c'),
    expectedIdentity: { packages: ids.map((id, index) => ({
      ...lockPins, packageId: id,
      packageVersion: id === packageId ? packageVersion : `v4-canonical-test-${index}`,
      buildRecipeDigest: hash('5'), manifestSha256: hash('6'), indexSha256: hash('7'), capabilityMapSha256: hash('8'),
      scope: id === packageId ? scope : scopeFor(2017 + index),
      scopeResolutionPolicy: 'exact-season-only-no-pooled-substitution', capabilitySummary: { exactSeasonImpact: 'available' }, buildRecipe: { schemaVersion: 1 },
    })) },
    packagePins: ids.map((id, index) => ({ ...lockPins, packageId: id, indexSha256: hash('7'), capabilityMapSha256: hash('8') })),
    dailyGamePins,
  };
}

function packageRef(releasePin) {
  return {
    modelId: 'swishiq-canonical-v4', releaseId,
    registrySha256: releasePin.registrySha256, registryRevisionSha256: releasePin.registryRevisionSha256,
    reviewReceiptSha256: releasePin.reviewReceiptSha256, authorizationReferenceSha256: releasePin.authorizationReferenceSha256,
    packageId, packageVersion, scope, phase: 'regular', indexSha256: hash('7'), capabilityMapSha256: hash('8'), ...lockPins,
  };
}

function row(name, teamCode = 'BOS') {
  return { displayName: name, normalizedPlayerNameKey: name.toLowerCase(), seasonStartYear: 2025, teamCode, phase: 'regular' };
}

async function fixFixture() {
  const releasePin = makeReleasePin();
  const challenges = Array.from({ length: 5 }, (_, challengeIndex) => {
    const lineup = Array.from({ length: 5 }, (_, index) => row(`c${challengeIndex}-lineup-${index}`));
    const candidates = Array.from({ length: 3 }, (_, index) => row(`c${challengeIndex}-candidate-${index}`));
    return { challengeId: `fix-c${challengeIndex}`, title: `Challenge ${challengeIndex + 1}`, prompt: 'Choose a legal replacement.', teamCode: 'BOS', lineup, removeNormalizedPlayerNameKey: lineup[0].normalizedPlayerNameKey, candidates };
  });
  const boardSource = {
    format: SWISHIQ_DAILY_GAME_V4_BOARD_FORMAT, contractVersion: SWISHIQ_DAILY_GAME_V4_BOARD_VERSION,
    publicationStatus: 'published', boardId: '', generatedAt: '2026-10-01T12:00:00.000Z', dailySeed: '2026-10-01', gameKind: 'fix-the-five',
    packageRef: packageRef(releasePin), challenges,
  };
  const content = { ...boardSource };
  delete content.boardId;
  const boardContentSha256 = await v4Sha256Hex(canonicalV4IdentityJson(content));
  boardSource.boardId = `swishiq-v4-fix-the-five-20261001-${boardContentSha256.slice(0, 12)}`;
  boardSource.boardContentSha256 = boardContentSha256;
  const boardBytes = new TextEncoder().encode(canonicalV4IdentityJson(boardSource));
  const pin = {
    gameKind: 'fix-the-five', dailySeed: '2026-10-01', path: 'daily-games/fix-the-five/2026-10-01.json',
    boardSha256: await v4Sha256Hex(boardBytes), boardContentSha256, packageId, packageVersion, scope, phase: 'regular',
  };
  releasePin.dailyGamePins = [pin];
  const board = await validateSwishIqV4DailyBoard(boardSource, {
    releasePin, gameKind: 'fix-the-five', dailySeed: '2026-10-01', boardBytes,
  });
  return { releasePin, board, pin };
}

function verifiedParts(board) {
  const impactValues = new Map();
  const selectedChallenge = board.challenges[0];
  selectedChallenge.lineup.forEach((item, index) => impactValues.set(item.normalizedPlayerNameKey, index + 1));
  selectedChallenge.candidates.forEach((item, index) => impactValues.set(item.normalizedPlayerNameKey, [0, 7, 8][index]));
  const impactRecords = [...impactValues].map(([key, value]) => ({
    entities: { displayName: key }, time: { seasonStartYear: 2025, phase: 'regular' }, evidence: { status: 'available' },
    values: {
      displayName: key, fitScope: { kind: 'exact-season', seasonStartYears: [2025], seasonStartYear: 2025, seasonEndYear: 2026, phases: ['regular'], pooledFitIsSeasonSpecific: true },
      combined: { value, unit: 'points-per-100-possessions', status: 'available' }, displayEligible: true, holdoutStatus: 'validated', pairedPossessions: 500,
    },
  }));
  const playerGameRecords = [...impactValues.keys()].map((key, index) => ({
    entities: { displayName: key, teamCode: 'BOS', gameRef: `g_${index}` }, time: { seasonStartYear: 2025, phase: 'regular' },
    evidence: { status: 'available' }, values: { displayName: key, minutes: 20, box: { points: 10 } },
  }));
  const sourcePackage = { packageId, packageVersion, scope };
  return {
    impactPart: { status: 'verified', artifactId: 'player-impact', package: sourcePackage, records: impactRecords, sha256: hash('d'), rows: impactRecords.length, bytes: 1000 },
    playerGamesPart: { status: 'verified', artifactId: 'player-games', package: sourcePackage, records: playerGameRecords, sha256: hash('e'), rows: playerGameRecords.length, bytes: 2000 },
  };
}

test('V4 Fix the Five ranks an exact name-key selection from exact-scope impact plus same-team phase box scores', async () => {
  const fixture = await fixFixture();
  const request = await buildSwishIqV4DailyGameRequest({
    board: fixture.board, releasePin: fixture.releasePin, scenarioId: 'fix-c0', normalizedPlayerNameKey: 'c0-candidate-2',
  });
  const parts = verifiedParts(fixture.board);
  const evaluation = evaluateSwishIqV4DailyGameSelection({ request, board: fixture.board, ...parts });
  assert.equal(evaluation.status, 'complete');
  assert.equal(evaluation.decision.rank, 1);
  assert.equal(evaluation.decision.optionCount, 3);
  assert.equal(evaluation.estimatedImpact.value, 7);
  assert.equal(evaluation.evidence.sameTeamPhaseBoxScorePlayers, 8);
  assert.equal(evaluation.evidence.attributionScope, 'source-reported-context-only / not-a-proven-team-split');
  assert.equal(evaluation.evidence.predictiveEligibility, false);
  assert.equal(JSON.stringify(evaluation).includes('playerRef'), false);
  assert.equal(JSON.stringify(evaluation).includes('provider'), false);

  const response = completeSwishIqV4DailyGameResponse(request, {
    evaluation,
    sourcePins: {
      packageRef: fixture.board.packageRef,
      parts: ['player-impact', 'player-games'].map(artifactId => ({ artifactId, sha256: parts[artifactId === 'player-impact' ? 'impactPart' : 'playerGamesPart'].sha256, rows: 8, bytes: artifactId === 'player-impact' ? 1000 : 2000 })),
    },
  });
  const validated = validateSwishIqV4DailyGameResponse(response, request, { releasePin: fixture.releasePin, board: fixture.board });
  assert.equal(validated.status, 'complete');
  assert.equal(validated.sourcePins.parts.length, 2);
});

test('V4 evaluator rejects unverified source, non-exact phase impact, and missing team box score context', async () => {
  const fixture = await fixFixture();
  const request = await buildSwishIqV4DailyGameRequest({ board: fixture.board, releasePin: fixture.releasePin, scenarioId: 'fix-c0', normalizedPlayerNameKey: 'c0-candidate-2' });
  const parts = verifiedParts(fixture.board);
  assert.throws(() => evaluateSwishIqV4DailyGameSelection({ request, board: fixture.board, ...parts, impactPart: { ...parts.impactPart, status: 'unverified' } }), { code: 'v4-daily-evaluator-input-unverified' });

  const wrongPhase = verifiedParts(fixture.board);
  wrongPhase.impactPart.records[0].values.fitScope.phases = ['regular', 'playoffs'];
  assert.throws(() => evaluateSwishIqV4DailyGameSelection({ request, board: fixture.board, ...wrongPhase }), { code: 'v4-daily-impact-row-unavailable' });

  const noTeamBox = verifiedParts(fixture.board);
  noTeamBox.playerGamesPart.records = noTeamBox.playerGamesPart.records.filter(row => row.entities.teamCode !== 'BOS');
  assert.throws(() => evaluateSwishIqV4DailyGameSelection({ request, board: fixture.board, ...noTeamBox }), { code: 'v4-daily-box-score-context-unavailable' });
});
