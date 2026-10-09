import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

let source = await readFile(new URL('../src/lib/season/simEngine.js', import.meta.url), 'utf8');
const replacements = [
  ["import { buildGamePeriods } from '@/lib/season/gamePeriods';", 'const buildGamePeriods = () => [];'],
  ["import { buildGameReplay } from '@/lib/season/gameReplay';", 'const buildGameReplay = () => [];'],
  ["import { replayBoxScores } from '@/lib/season/replayBoxScores';", 'const replayBoxScores = () => ({});'],
];
for (const [before, after] of replacements) {
  assert.ok(source.includes(before), `Expected import shim target: ${before}`);
  source = source.replace(before, after);
}
assert.doesNotMatch(source, /from\s+['"]@\//, 'The simulation test module should not retain Vite aliases.');
const { runRepeat } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function team(code) {
  return {
    code,
    name: code,
    conference: 'EAST',
    off: 110,
    def: 110,
    pace: 99,
    tov: 0.13,
    oppTov: 0.13,
    ftr: 0.25,
    oppFtr: 0.25,
    efg: 0.53,
    oppEfg: 0.53,
    orb: 0.28,
    drb: 0.72,
    roster: [],
  };
}

test('runRepeat preserves game IDs from each supported schedule ID field', () => {
  const bos = team('BOS');
  const lal = team('LAL');
  const league = { teams: [bos, lal], byCode: new Map([[bos.code, bos], [lal.code, lal]]), defAvg: 110, offAvg: 110 };
  const schedule = [
    { gameId: 'game-id', home: 'BOS', away: 'LAL', actual: { home: 100, away: 90 } },
    { id: 'row-id', home: 'LAL', away: 'BOS', actual: { home: 90, away: 100 } },
    { scheduleGameId: 'schedule-id', home: 'BOS', away: 'LAL', actual: { home: 100, away: 90 } },
  ];

  const result = runRepeat(league, schedule, { seed: 7, playoffs: false });

  assert.deepEqual(result.games.map(game => game.gameId), ['game-id', 'row-id', 'schedule-id']);
  assert.deepEqual(result.games.map(game => game.actual), schedule.map(game => game.actual));
});
