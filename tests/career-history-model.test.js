import assert from 'node:assert/strict';
import test from 'node:test';
import { careerPlayers, careerSeasons } from '../src/components/career/careerHistoryModel.js';
import { perGameStats } from '../src/lib/season/labs.js';

const row = (overrides = {}) => ({
  playerRef: 'player-1',
  displayName: 'Test Player',
  teamCode: 'AAA',
  seasonStartYear: 2024,
  phase: 'regular',
  observed: true,
  games: 10,
  minutes: 200,
  careerMetrics: { points: 10, rebounds: 0, assists: 2, steals: 0, blocks: 0, turnovers: 1 },
  ...overrides,
});

test('career archive rollups preserve missing values while keeping observed zeroes', () => {
  const players = careerPlayers([
    row(),
    row({
      teamCode: 'BBB',
      games: 5,
      minutes: null,
      careerMetrics: { points: null, rebounds: 0, assists: 4, steals: null, blocks: 0, turnovers: null },
    }),
  ]);

  assert.equal(players.length, 1);
  const [player] = players;
  assert.equal(player.games, 15);
  assert.equal(player.minutes, null);
  assert.equal(player.points, null);
  assert.equal(player.rebounds, 0);
  assert.equal(player.steals, null);

  const [season] = careerSeasons(player);
  assert.equal(season.minutes, null);
  assert.equal(season.pts, null);
  assert.equal(season.reb, 0);
  assert.equal(season.ast, 8 / 3);
});

test('career archive rollups keep complete metrics game weighted', () => {
  const [player] = careerPlayers([
    row(),
    row({ teamCode: 'BBB', games: 5, minutes: 100, careerMetrics: { points: 20, rebounds: 1, assists: 4, steals: 0, blocks: 0, turnovers: 1 } }),
  ]);
  const [season] = careerSeasons(player);

  assert.equal(player.points, 200);
  assert.equal(player.minutes, 300);
  assert.equal(season.pts, 40 / 3);
  assert.equal(season.minutes, 300);
});

test('picker rates keep missing archive totals unavailable', () => {
  assert.equal(perGameStats({ games: 10, minutes: null }).mpg, null);
  assert.equal(perGameStats({ games: 10, minutes: 0 }).mpg, 0);
});
