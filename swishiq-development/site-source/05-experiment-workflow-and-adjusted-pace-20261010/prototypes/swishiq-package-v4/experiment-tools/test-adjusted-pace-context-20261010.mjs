import assert from 'node:assert/strict';
import { addOpponentAdjustedPaceContexts } from './lib/opponent-adjusted-pace-context.mjs';

function makeInputs(games) {
  const scoreGames = games.map((game) => ({
    gameRef: game.gameRef,
    gameDateLocal: game.gameDateLocal,
    seasonStartYear: game.seasonStartYear,
    homeTeamRef: game.homeTeamRef,
    awayTeamRef: game.awayTeamRef,
  }));
  const playerGameRows = games.flatMap((game) => [
    [game.homeTeamRef, game.homePossessions],
    [game.awayTeamRef, game.awayPossessions],
  ].map(([teamCode, fieldGoalAttempts]) => ({
    time: { phase: 'regular' },
    evidence: { status: 'available' },
    entities: { gameRef: game.gameRef, teamCode },
    values: { box: {
      fieldGoalAttempts,
      freeThrowAttempts: 0,
      offensiveRebounds: 0,
      turnovers: 0,
    } },
  })));

  const contexts = new Map();
  const dates = [...new Set(scoreGames.map((game) => game.gameDateLocal))].sort();
  let observedThrough = null;
  for (const gameDateLocal of dates) {
    for (const game of scoreGames.filter((item) => item.gameDateLocal === gameDateLocal)) {
      contexts.set(game.gameRef, {
        format: 'synthetic-base-context',
        gameDateLocal,
        observedThrough,
        home: { sentinel: game.gameRef + ':home' },
        away: { sentinel: game.gameRef + ':away' },
      });
    }
    observedThrough = gameDateLocal;
  }

  return {
    playerGameRows,
    scoreGames,
    boxscoreContexts: {
      contexts,
      audit: { contextCount: contexts.size, sameLocalDateOutcomesExcluded: true },
    },
  };
}

function closeTo(actual, expected, label) {
  assert.ok(Number.isFinite(actual), `${label} should be finite; got ${actual}`);
  assert.ok(Math.abs(actual - expected) < 1e-10,
    `${label}: expected ${expected}, received ${actual}`);
}

function testSameDateSnapshotsShrinkageAndImmutability() {
  const input = makeInputs([
    {
      gameRef: 'same-date-ab', gameDateLocal: '2024-04-14', seasonStartYear: 2023,
      homeTeamRef: 'A', awayTeamRef: 'B', homePossessions: 130, awayPossessions: 110,
    },
    {
      gameRef: 'same-date-cd', gameDateLocal: '2024-04-14', seasonStartYear: 2023,
      homeTeamRef: 'C', awayTeamRef: 'D', homePossessions: 70, awayPossessions: 110,
    },
    {
      gameRef: 'next-season-ac', gameDateLocal: '2024-10-22', seasonStartYear: 2024,
      homeTeamRef: 'A', awayTeamRef: 'C', homePossessions: 105, awayPossessions: 95,
    },
  ]);
  const beforeContexts = new Map([...input.boxscoreContexts.contexts]
    .map(([key, value]) => [key, structuredClone(value)]));
  const beforeAudit = structuredClone(input.boxscoreContexts.audit);

  const result = addOpponentAdjustedPaceContexts(input);

  // Both games on the first local date use the 100-possession anchor, even
  // though their paired paces differ and the second game is processed later.
  for (const gameRef of ['same-date-ab', 'same-date-cd']) {
    const context = result.contexts.get(gameRef);
    closeTo(context.home.opponentAdjustedPace20, 100, gameRef + ' home snapshot');
    closeTo(context.away.opponentAdjustedPace20, 100, gameRef + ' away snapshot');
    assert.equal(context.observedThrough, null);
  }

  // The following date sees both prior games: league pace is 105, while the
  // two teams' adjusted observations are 140 (A) and 80 (C), shrunk by 8.
  const next = result.contexts.get('next-season-ac');
  closeTo(next.home.opponentAdjustedPace20, (140 + 8 * 105) / 9, 'A after season boundary');
  closeTo(next.away.opponentAdjustedPace20, (80 + 8 * 105) / 9, 'C after season boundary');
  assert.equal(next.observedThrough, '2024-04-14');

  assert.deepEqual(input.boxscoreContexts.contexts, beforeContexts,
    'the baseline box-score contexts must remain unchanged');
  assert.deepEqual(input.boxscoreContexts.audit, beforeAudit,
    'the baseline box-score audit must remain unchanged');
  assert.notStrictEqual(next.home, input.boxscoreContexts.contexts.get('next-season-ac').home,
    'derived contexts should copy baseline side contexts before extending them');
}

function testTwentyGameWindowCarriesAcrossSeasons() {
  const games = [];
  const paces = [];
  for (let index = 1; index <= 22; index += 1) {
    const date = index <= 10
      ? new Date(Date.UTC(2023, 9, 20 + index - 1))
      : new Date(Date.UTC(2024, 9, 20 + index - 11));
    const pace = 80 + 2 * index;
    paces.push(pace);
    games.push({
      gameRef: 'window-' + index,
      gameDateLocal: date.toISOString().slice(0, 10),
      seasonStartYear: index <= 10 ? 2023 : 2024,
      homeTeamRef: 'PACE-TEAM',
      awayTeamRef: 'OPP-' + index,
      homePossessions: pace + 4,
      awayPossessions: pace - 4,
    });
  }
  const input = makeInputs(games);
  const result = addOpponentAdjustedPaceContexts(input);

  // Every opponent is new, so its prior profile is the pre-game raw league
  // pace. This gives an independently calculated feedback sequence for the
  // repeating team. Game 22 must use observations 2..21, across both seasons.
  const adjustedObservations = [];
  let leagueSum = 0;
  for (let index = 0; index < 21; index += 1) {
    const priorLeagueMean = index === 0 ? 100 : leagueSum / index;
    adjustedObservations.push(2 * paces[index] - priorLeagueMean);
    leagueSum += paces[index];
  }
  const priorLeagueMean = leagueSum / 21;
  const rollingExpected = (adjustedObservations.slice(-20).reduce((sum, value) => sum + value, 0)
    + 8 * priorLeagueMean) / 28;
  const allHistoryExpected = (adjustedObservations.reduce((sum, value) => sum + value, 0)
    + 8 * priorLeagueMean) / 29;
  const currentSeasonOnly = adjustedObservations.slice(10);
  const resetAtSeasonExpected = (currentSeasonOnly.reduce((sum, value) => sum + value, 0)
    + 8 * priorLeagueMean) / (currentSeasonOnly.length + 8);

  const target = result.contexts.get('window-22');
  closeTo(target.home.opponentAdjustedPace20, rollingExpected, '20-game cross-season window');
  closeTo(target.away.opponentAdjustedPace20, priorLeagueMean, 'new opponent prior league mean');
  assert.ok(Math.abs(rollingExpected - allHistoryExpected) > 0.01,
    'the synthetic sequence should distinguish the 20-game cap from unbounded history');
  assert.ok(Math.abs(rollingExpected - resetAtSeasonExpected) > 0.01,
    'the synthetic sequence should distinguish cross-season history from a season reset');
}

function testInvalidPairedPossessionsFail() {
  const input = makeInputs([{
    gameRef: 'zero-possessions', gameDateLocal: '2024-01-01', seasonStartYear: 2023,
    homeTeamRef: 'ZERO', awayTeamRef: 'VALID', homePossessions: 0, awayPossessions: 100,
  }]);
  assert.throws(() => addOpponentAdjustedPaceContexts(input), /Missing or invalid paired possessions/);
}

testSameDateSnapshotsShrinkageAndImmutability();
testTwentyGameWindowCarriesAcrossSeasons();
testInvalidPairedPossessionsFail();
console.log('Adjusted pace context checks passed: 3 cases.');
