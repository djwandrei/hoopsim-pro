import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyFranchiseControlsToGameInput } from '../public/tools/swishiq-studio/franchise-sim-20261010/lib/franchise-game-input-v1.mjs';
import { updateFranchiseRotationState, validateFranchiseRotationState } from '../public/tools/swishiq-studio/franchise-sim-20261010/lib/franchise-controls-v1.mjs';
import { normalizedShotRecipientWeights, simulateGameLiveSeasonSample } from '../public/tools/swishiq-studio/franchise-sim-20261010/lib/live-game-simulator-v1.mjs';
import { normalizeLiveRotationControls } from '../public/tools/swishiq-studio/franchise-sim-20261010/lib/live-rotation-controls-v1.mjs';
import { buildScheduleCalendarCells, formatScheduleMonth, paginateScheduleRows, scheduleMonthKeys } from '../src/components/season/franchise/franchiseScheduleCalendar.js';

const fixture = JSON.parse(readFileSync(new URL('../public/tools/swishiq-studio/franchise-sim-20261008/integration/season-lab-preview/real-v4-browser-fixture-20261008.json', import.meta.url), 'utf8'));
const state = fixture.sessionInput.leagueState;
const teamCode = state.userControlledTeamCodes[0];
const team = state.teams.find(row => row.teamCode === teamCode);
const storedControls = team.franchiseControlsBySeason[String(state.seasonStartYear)];
const game = fixture.sessionInput.schedule[0];
const gameInput = fixture.gameInputs[game.gameId];
const gameModel = JSON.parse(fixture.gameModelText);
const productionCandidate = JSON.parse(fixture.productionCandidateText);
const playersByName = new Map(state.players.map(player => [String(player.canonicalName).toLowerCase(), player]));

function controlsForUsage(shotUsageMultipliers) {
  return {
    seasonStartYear: state.seasonStartYear,
    starters: storedControls.starters,
    activeRotation: storedControls.activeRotation,
    inactiveRotation: storedControls.inactiveRotation,
    minuteAssignments: storedControls.minuteAssignments,
    gameDurationMinutes: storedControls.gameDurationMinutes,
    rotationControls: { ...storedControls.rotationControls, shotUsageMultipliers },
  };
}

function usageRows(overrides = {}) {
  return storedControls.activeRotation.map((canonicalName, index) => {
    const player = playersByName.get(canonicalName.toLowerCase());
    return { playerRef: player.playerRef, canonicalName, multiplier: overrides[index] ?? 1 };
  });
}

test('schedule calendar groups pinned ISO dates into the correct UTC month and keeps list paging inputs bounded', () => {
  const rows = [
    { date: '2025-11-01', gameId: 'nov' },
    { date: '2025-10-21', gameId: 'oct-a' },
    { date: '2025-10-21', gameId: 'oct-b' },
    { date: '2025-10-31', gameId: 'oct-last' },
  ];
  assert.deepEqual(scheduleMonthKeys(rows), ['2025-10', '2025-11']);
  const october = buildScheduleCalendarCells('2025-10', rows);
  assert.equal(october.length, 35);
  assert.equal(october[3].date, '2025-10-01');
  assert.deepEqual(october.find(cell => cell?.date === '2025-10-21').games.map(row => row.gameId), ['oct-a', 'oct-b']);
  assert.equal(october.find(cell => cell?.date === '2025-10-31').games[0].gameId, 'oct-last');
  assert.match(formatScheduleMonth('2025-10'), /2025/);
  const schedule = Array.from({ length: 500 }, (_, index) => ({ gameId: `g${index}` }));
  const page = paginateScheduleRows(schedule, 2, 100);
  assert.equal(page.page, 2);
  assert.equal(page.pageCount, 5);
  assert.equal(page.start, 201);
  assert.equal(page.end, 300);
  assert.equal(page.rows.length, 100);
  assert.equal(paginateScheduleRows(schedule, 99, 100).page, 4);
});

test('relative shot-usage weights normalize among the current players without adding opportunity rows', () => {
  const weights = normalizedShotRecipientWeights([
    { fgaPer36: 12, shotUsageMultiplier: 2 },
    { fgaPer36: 8, shotUsageMultiplier: 0.5 },
    { fgaPer36: 4, shotUsageMultiplier: 0 },
  ]);
  assert.ok(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.ok(Math.abs(weights[0] - 24 / 28) < 1e-12);
  assert.ok(Math.abs(weights[1] - 4 / 28) < 1e-12);
  assert.equal(weights[2], 0);
  const baselineWeights = normalizedShotRecipientWeights([
    { fgaPer36: 0, shotUsageBaseWeight: 0.1, shotUsageMultiplier: 1 },
    { fgaPer36: 10, shotUsageBaseWeight: 10, shotUsageMultiplier: 1 },
  ]);
  assert.ok(Math.abs(baselineWeights[0] - 0.1 / 10.1) < 1e-12, 'default usage preserves the prior nonshared 0.1 attempt-weight floor');
});

test('live rotation controls default to 1.0 and reject unknown, inactive, out-of-range, and non-tenth weights', () => {
  const players = Array.from({ length: 6 }, (_, index) => ({
    playerRef: `p${index + 1}`, canonicalName: `Player ${index + 1}`, minutesTarget: index === 5 ? 0 : 48,
  }));
  const base = { starters: players.slice(0, 5).map(row => row.canonicalName) };
  const defaulted = normalizeLiveRotationControls({ players, controls: base });
  assert.equal(defaulted.status, 'pass');
  assert.deepEqual(defaulted.controls.shotUsageMultipliers.map(row => row.multiplier), [1, 1, 1, 1, 1]);

  const rows = players.slice(0, 5).map(row => ({ playerRef: row.playerRef, canonicalName: row.canonicalName, multiplier: 1 }));
  const invalid = (change, pattern) => {
    const result = normalizeLiveRotationControls({ players, controls: { ...base, shotUsageMultipliers: change(rows.map(row => ({ ...row }))) } });
    assert.equal(result.status, 'requires-review');
    assert.match(result.violations.join(' '), pattern);
  };
  invalid(value => { value[0].playerRef = 'unknown'; return value; }, /mismatched player identity/);
  invalid(value => { value[0].multiplier = 2.1; return value; }, /between 0 and 2/);
  invalid(value => { value[0].multiplier = 1.05; return value; }, /0\.1 increments/);
  invalid(value => { value.push({ playerRef: 'p6', canonicalName: 'Player 6', multiplier: 1 }); return value; }, /Inactive player/);
});

test('Franchise rotation receipts persist exact shot-usage player identities and reject bad or inactive rows', () => {
  const allRows = usageRows({ 0: 1.5, 1: 0.5 });
  const proposed = controlsForUsage(allRows);
  const update = updateFranchiseRotationState({ state, teamCode, controls: proposed, expectedStateRevision: state.revision });
  assert.equal(update.status, 'updated');
  assert.deepEqual(update.controls.rotationControls.shotUsageMultipliers, allRows);
  assert.match(update.receipt.exactControlsPayload, /shotUsageMultipliers/);
  assert.equal(validateFranchiseRotationState({ state: update.state, teamCode }).status, 'pass');

  const wrongIdentity = controlsForUsage(allRows.map((row, index) => index ? row : { ...row, playerRef: 'not-the-roster-id' }));
  const wrongIdentityResult = validateFranchiseRotationState({ state, teamCode, controls: wrongIdentity });
  assert.equal(wrongIdentityResult.status, 'fail');
  assert.match(wrongIdentityResult.violations.join(' '), /mismatched roster\/player identity/);

  const inactiveName = storedControls.inactiveRotation[0];
  const inactivePlayer = playersByName.get(inactiveName.toLowerCase());
  const withInactive = controlsForUsage([...allRows, { playerRef: inactivePlayer.playerRef, canonicalName: inactiveName, multiplier: 1 }]);
  const inactiveResult = validateFranchiseRotationState({ state, teamCode, controls: withInactive });
  assert.equal(inactiveResult.status, 'fail');
  assert.match(inactiveResult.violations.join(' '), /Inactive player/);
});

test('rotation controls preserve valid zero usage and reject every planned five with no shooter', () => {
  const benchName = storedControls.activeRotation.find(name => !storedControls.starters.includes(name));
  assert.ok(benchName, 'the fixture includes active bench players');
  const validZeroUsage = usageRows().map(row => ({ ...row, multiplier: row.canonicalName === benchName ? 0 : 1 }));
  const valid = validateFranchiseRotationState({ state, teamCode, controls: controlsForUsage(validZeroUsage) });
  assert.equal(valid.status, 'pass', 'zero usage remains valid when every planned five has another shooter');

  const zeroUsageStarters = usageRows().map(row => ({
    ...row,
    multiplier: storedControls.starters.includes(row.canonicalName) ? 0 : 1,
  }));
  const proposed = controlsForUsage(zeroUsageStarters);
  const invalid = validateFranchiseRotationState({ state, teamCode, controls: proposed });
  assert.equal(invalid.status, 'fail');
  assert.match(invalid.violations.join(' '), /Planned five-player unit 0-2 minutes has no eligible shooter/);
  assert.match(invalid.violations.join(' '), /Shai Gilgeous-Alexander.*Luguentz Dort.*Chet Holmgren.*Aaron Wiggins.*Cason Wallace/);

  const save = updateFranchiseRotationState({ state, teamCode, controls: proposed, expectedStateRevision: state.revision });
  assert.equal(save.status, 'rejected', 'the invalid rotation cannot be saved for later simulation');
  assert.equal(save.state.revision, state.revision, 'a rejected control update leaves the source state unchanged');
});

test('one seeded franchise game is deterministic, holds its possession budget, and reconciles player boxes', () => {
  const multipliers = usageRows({ 0: 1.5, 1: 0.5 });
  const updated = updateFranchiseRotationState({ state, teamCode, controls: controlsForUsage(multipliers), expectedStateRevision: state.revision });
  assert.equal(updated.status, 'updated');
  assert.ok(Math.abs(updated.controls.minuteAssignments.reduce((sum, row) => sum + row.minutes, 0) - 240) < 1e-7);
  const input = applyFranchiseControlsToGameInput(updated.state, gameInput);
  input.seasonStartYear = game.seasonStartYear;
  input.gameLocalDate = game.gameLocalDate;
  const controlledSide = ['home', 'away'].find(side => gameInput[side]?.teamCode === teamCode);
  assert.ok(controlledSide);
  assert.deepEqual(input[controlledSide].rotationControls.shotUsageMultipliers, multipliers);
  const workerReceipt = input.franchiseControlReceipt.teams.find(row => row.teamCode === teamCode);
  assert.deepEqual(workerReceipt.shotUsageMultipliers, multipliers);
  assert.match(workerReceipt.shotUsageBehavior, /scenario assumption, not a measured efficiency effect/);
  const options = { ...fixture.eventOptions, playerProductionCandidate: productionCandidate, seed: 26001 };
  const first = simulateGameLiveSeasonSample(gameModel, input, options);
  const repeat = simulateGameLiveSeasonSample(gameModel, input, options);
  assert.deepEqual(repeat, first);
  const sample = first.simulations[0];
  const regulationPossessions = first.coachingDiagnostics.regulationPossessionsPerTeam;
  const overtimePossessions = sample.overtimePeriods * Math.max(4, Math.round(regulationPossessions * 5 / 48));
  const expectedPossessions = regulationPossessions + overtimePossessions;
  assert.deepEqual(sample.possessionsPerTeam, { home: expectedPossessions, away: expectedPossessions });
  const expectedTeamMinutes = 240 + 25 * sample.overtimePeriods;
  assert.deepEqual(first.rotationDiagnostics.home.controls.shotUsageMultipliers, multipliers);
  assert.equal(sample.boxScoreConsistency, 'verified-exact-player-to-team-totals-and-event-identities');
  for (const side of ['home', 'away']) {
    const playerBoxes = sample[`${side}Box`];
    const teamStats = sample[`${side}TeamStats`];
    assert.ok(Math.abs(playerBoxes.reduce((sum, row) => sum + Number(row.minutes ?? 0), 0) - expectedTeamMinutes) < 1e-7, `${side} minutes`);
    for (const field of ['points', 'fieldGoalAttempts', 'freeThrowAttempts', 'freeThrowsMade', 'rebounds', 'assists', 'turnovers']) {
      assert.equal(playerBoxes.reduce((sum, row) => sum + Number(row[field] ?? 0), 0), teamStats[field], `${side} ${field}`);
    }
  }
});
