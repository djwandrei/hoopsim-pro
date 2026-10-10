import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateV4BoxScorePlayers,
  evaluateV4BoxScoreSelection,
  SWISHIQ_DAILY_GAME_V4_BOX_SCORE_ATTRIBUTION,
  SWISHIQ_DAILY_GAME_V4_BOX_SCORE_EVALUATOR_FORMAT,
  SWISHIQ_DAILY_GAME_V4_BOX_SCORE_EVALUATOR_VERSION,
  SWISHIQ_DAILY_GAME_V4_BOX_SCORE_METRIC_ID,
  SWISHIQ_DAILY_GAME_V4_BOX_SCORE_UNIT,
} from '../../tools/swishiq-studio/engine/swishiq-daily-game-v4-box-score.js';
import { SWISHIQ_DAILY_GAME_V4_BOX_SCORE_CONTRACT } from '../../tools/swishiq-studio/engine/swishiq-daily-game-v4-contract.js';

const seasonStartYear = 2025;
const phase = 'regular';
const packageId = 'nba-swishiq-v4-2025-26';
const packageVersion = 'v4-canonical-test-2025-abcdef123456';
const scope = {
  kind: 'exact-season',
  seasonStartYears: [seasonStartYear],
  seasonStartYear,
  seasonEndYear: seasonStartYear + 1,
  phases: ['regular', 'in_season_tournament', 'play_in', 'playoffs'],
  pooledFitIsSeasonSpecific: true,
};

function box(overrides = {}) {
  return {
    points: 10,
    rebounds: 4,
    assists: 5,
    steals: 2,
    blocks: 1,
    fieldGoalAttempts: 8,
    fieldGoalsMade: 4,
    freeThrowAttempts: 2,
    freeThrowsMade: 2,
    turnovers: 3,
    offensiveRebounds: 1,
    defensiveRebounds: 3,
    personalFouls: 2,
    ...overrides,
  };
}

function playerGame(name, gameNumber, {
  teamCode = 'BOS',
  year = seasonStartYear,
  gamePhase = phase,
  minutes = 30,
  stats = box(),
  positions = ['G'],
  evidenceStatus = 'available',
  gameRef = `game-${gameNumber}`,
} = {}) {
  return {
    recordId: `record-${name}-${gameRef}`,
    entities: { playerRef: `private-${name}`, teamCode, gameRef },
    time: { seasonStartYear: year, phase: gamePhase },
    evidence: { status: evidenceStatus },
    values: { displayName: name, minutes, positions, box: stats },
  };
}

function verifiedPart(records) {
  return {
    status: 'verified',
    artifactId: 'player-games',
    package: { packageId, packageVersion, scope },
    sha256: 'a'.repeat(64),
    rows: records.length,
    bytes: records.length * 100,
    records,
  };
}

function productionBox(points) {
  return box({
    points,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    fieldGoalAttempts: 0,
    fieldGoalsMade: 0,
    freeThrowAttempts: 0,
    freeThrowsMade: 0,
    turnovers: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    personalFouls: 0,
  });
}

function seasonRows(name, points, {
  teamCode = 'BOS',
  games = 20,
  minutesPerGame = 10,
} = {}) {
  return Array.from({ length: games }, (_, index) => playerGame(name, index, {
    teamCode,
    minutes: minutesPerGame,
    stats: productionBox(points),
  }));
}

function publicRow(displayName, teamCode = 'BOS') {
  return {
    displayName,
    normalizedPlayerNameKey: displayName.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' '),
    seasonStartYear,
    teamCode,
    phase,
  };
}

function boardContext(gameKind) {
  const boardId = 'swishiq-v4-test-board';
  const packageRef = { packageId, packageVersion, scope, phase };
  const board = {
    contractVersion: 2,
    scoringContract: SWISHIQ_DAILY_GAME_V4_BOX_SCORE_CONTRACT,
    gameKind,
    boardId,
    packageRef,
    scope,
    phase,
  };
  const request = {
    boardRef: { ...packageRef, gameKind, boardId },
    resultContract: { scoringContract: SWISHIQ_DAILY_GAME_V4_BOX_SCORE_CONTRACT },
  };
  return { board, request };
}

test('aggregator computes unrounded Hollinger game-score per 40 from complete observed box scores', () => {
  const records = [
    playerGame('Álex O’Connor', 1),
    playerGame('Álex O’Connor', 1), // Identical source duplicate is counted once.
    playerGame('Álex O’Connor', 2, { minutes: 30, stats: box({ points: 20 }), positions: ['F', 'G'] }),
    playerGame('Álex O’Connor', 3, { year: 2024 }),
    playerGame('Álex O’Connor', 4, { gamePhase: 'playoffs' }),
    playerGame('Álex O’Connor', 5, { minutes: 0 }),
    playerGame('Álex O’Connor', 6, { evidenceStatus: 'unavailable' }),
  ];
  const profiles = aggregateV4BoxScorePlayers(verifiedPart(records), { seasonStartYear, phase });
  const profile = profiles.get("álex o'connor|BOS");

  assert.equal(profiles.size, 1);
  assert.equal(profile.displayName, 'Álex O’Connor');
  assert.equal(profile.normalizedPlayerNameKey, "álex o'connor");
  assert.equal(profile.games, 2);
  assert.equal(profile.minutes, 60);
  assert.deepEqual(profile.positions, ['F', 'G']);
  assert.equal(profile.completeGames, 2);
  assert.equal(profile.complete, true);
  assert.ok(Math.abs(profile.gameScoreTotal - 30) < 1e-12);
  assert.ok(Math.abs(profile.score - 20) < 1e-12);
  assert.equal(profile.boxScoreTotals.points, 30);
  assert.equal(profile.boxScoreTotals.rebounds, 8);
});

test('aggregator rejects unverified parts, pooled/wrong-season package metadata, and conflicting duplicate games', () => {
  const part = verifiedPart([playerGame('Player One', 1)]);
  assert.throws(() => aggregateV4BoxScorePlayers({ ...part, status: 'unverified' }, { seasonStartYear }), {
    code: 'v4-box-score-input-unverified',
  });
  assert.throws(() => aggregateV4BoxScorePlayers({ ...part, package: { ...part.package, scope: { ...scope, seasonStartYears: [2024] } } }, { seasonStartYear }), {
    code: 'v4-box-score-package-scope-mismatch',
  });
  assert.throws(() => aggregateV4BoxScorePlayers(verifiedPart([
    playerGame('Player One', 1),
    playerGame('Player One', 1, { stats: box({ points: 11 }) }),
  ]), { seasonStartYear }), {
    code: 'v4-box-score-duplicate-conflict',
  });
});

test('incomplete positive-minute box-score rows retain counts but cannot produce a partial player rate', () => {
  const incomplete = box();
  delete incomplete.personalFouls;
  const [profile] = aggregateV4BoxScorePlayers(verifiedPart([
    playerGame('Player One', 1),
    playerGame('Player One', 2, { stats: incomplete }),
  ]), { seasonStartYear }).values();

  assert.equal(profile.games, 2);
  assert.equal(profile.completeGames, 1);
  assert.equal(profile.minutes, 60);
  assert.equal(profile.complete, false);
  assert.equal(profile.gameScoreTotal, null);
  assert.equal(profile.score, null);
  assert.equal(profile.boxScoreTotals, null);
});

test('Fix the Five ranks all three full-lineup replacement means and returns observed v2 output', () => {
  const { board, request } = boardContext('fix-the-five');
  const lineup = [1, 2, 3, 4, 5].map((points, index) => publicRow(`Lineup ${index + 1}`));
  const candidates = [2, 5, 4].map((points, index) => publicRow(`Candidate ${index + 1}`));
  board.challenges = [{
    challengeId: 'fix-one',
    title: 'Replace one player',
    prompt: 'Choose the best replacement.',
    teamCode: 'BOS',
    lineup,
    removeNormalizedPlayerNameKey: lineup[0].normalizedPlayerNameKey,
    candidates,
  }];
  request.selection = {
    kind: 'fix-the-five',
    challengeId: 'fix-one',
    normalizedPlayerNameKey: candidates[0].normalizedPlayerNameKey,
  };
  const namesAndPoints = [
    ...lineup.map((row, index) => [row.displayName, index + 1]),
    ...candidates.map((row, index) => [row.displayName, [2, 5, 4][index]]),
  ];
  const records = namesAndPoints.flatMap(([name, points]) => seasonRows(name, points));
  const result = evaluateV4BoxScoreSelection({ request, board, playerGamesPart: verifiedPart(records) });

  assert.deepEqual(Object.keys(result), ['format', 'version', 'status', 'evaluationKind', 'scope', 'decision', 'observedProduction', 'evidence']);
  assert.equal(result.format, SWISHIQ_DAILY_GAME_V4_BOX_SCORE_EVALUATOR_FORMAT);
  assert.equal(result.version, SWISHIQ_DAILY_GAME_V4_BOX_SCORE_EVALUATOR_VERSION);
  assert.equal(result.status, 'complete');
  assert.equal(result.evaluationKind, 'descriptive-box-score-production-ranking');
  assert.deepEqual(result.scope, { kind: 'exact-season', seasonStartYear, phase });
  assert.deepEqual(result.decision, { rank: 3, optionCount: 3, countComplete: true });
  assert.equal(result.observedProduction.value, 12.8);
  assert.equal(result.observedProduction.bestValue, 15.2);
  assert.ok(Math.abs(result.observedProduction.gapToBest - 2.4) < 1e-12);
  assert.equal(result.observedProduction.unit, SWISHIQ_DAILY_GAME_V4_BOX_SCORE_UNIT);
  assert.equal(result.observedProduction.metricId, SWISHIQ_DAILY_GAME_V4_BOX_SCORE_METRIC_ID);
  assert.deepEqual(result.evidence, {
    playerCount: 8,
    gameCount: 160,
    attributionScope: SWISHIQ_DAILY_GAME_V4_BOX_SCORE_ATTRIBUTION,
    predictiveEligibility: false,
  });
  assert.equal('estimatedImpact' in result, false);
});

test('Draft Night ranks the 243 legal five-pick combinations by mean observed production', () => {
  const { board, request } = boardContext('draft-night');
  const namesAndPoints = [];
  const rounds = Array.from({ length: 5 }, (_, roundIndex) => {
    const candidates = Array.from({ length: 3 }, (_, candidateIndex) => {
      const displayName = `Round ${roundIndex + 1} Candidate ${candidateIndex + 1}`;
      const points = roundIndex * 3 + candidateIndex + 1;
      namesAndPoints.push([displayName, points]);
      return publicRow(displayName);
    });
    return {
      roundNumber: roundIndex + 1,
      roundId: `draft-round-${roundIndex + 1}-test`,
      title: `Round ${roundIndex + 1}`,
      prompt: 'Choose one player.',
      teamCode: 'BOS',
      candidates,
    };
  });
  board.deck = { deckId: 'draft-test', title: 'Draft Night', prompt: 'Choose five.', rounds };
  request.selection = rounds.map(round => ({
    roundId: round.roundId,
    normalizedPlayerNameKey: round.candidates[0].normalizedPlayerNameKey,
  }));
  const records = namesAndPoints.flatMap(([name, points]) => seasonRows(name, points));
  const result = evaluateV4BoxScoreSelection({ request, board, playerGamesPart: verifiedPart(records) });

  assert.deepEqual(result.decision, { rank: 243, optionCount: 243, countComplete: true });
  assert.equal(result.observedProduction.value, 28);
  assert.equal(result.observedProduction.bestValue, 36);
  assert.equal(result.observedProduction.gapToBest, 8);
  assert.equal(result.evidence.playerCount, 15);
  assert.equal(result.evidence.gameCount, 300);
});

test('evaluator requires the v2 scoring contract and complete 20-game, 200-minute profiles', () => {
  const { board, request } = boardContext('fix-the-five');
  const lineup = [1, 2, 3, 4, 5].map((_, index) => publicRow(`Lineup ${index + 1}`));
  const candidates = [1, 2, 3].map((_, index) => publicRow(`Candidate ${index + 1}`));
  board.challenges = [{
    challengeId: 'fix-one', teamCode: 'BOS', lineup,
    removeNormalizedPlayerNameKey: lineup[0].normalizedPlayerNameKey, candidates,
  }];
  request.selection = {
    kind: 'fix-the-five', challengeId: 'fix-one',
    normalizedPlayerNameKey: candidates[0].normalizedPlayerNameKey,
  };
  const names = [...lineup, ...candidates].map(row => row.displayName);
  const belowThreshold = names.flatMap((name, index) => seasonRows(name, index + 1, { games: name === 'Candidate 1' ? 19 : 20 }));
  assert.throws(() => evaluateV4BoxScoreSelection({
    request, board, playerGamesPart: verifiedPart(belowThreshold),
  }), { code: 'v4-box-score-player-ineligible' });
  assert.throws(() => evaluateV4BoxScoreSelection({
    request: { ...request, resultContract: { scoringContract: 'legacy-impact-v1' } },
    board,
    playerGamesPart: verifiedPart(names.flatMap((name, index) => seasonRows(name, index + 1))),
  }), { code: 'v4-box-score-scoring-contract-mismatch' });
});
