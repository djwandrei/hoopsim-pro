import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./helpers/forge-source-loader.mjs', import.meta.url);
const { SKILLS, RATING_MODEL } = await import('../src/components/forge/bapSkills.js');
const { buildForgePool, forgePlayerScore } = await import('../src/components/forge/forgePool.js');
const { buildForgeProfile, FORGE_SIM_MODEL, rosterRatings, seededRandom, simulateForgeGame, TEAM_SLOTS } = await import('../src/components/forge/forgeSimulation.js');
const { completeForgeBuild, decodeForgeBuild, forgeBuildKeys, forgeBuildQuery, restoreForgePicks } = await import('../src/components/forge/forgeReceipt.js');
const { readForgeSession, sessionKey } = await import('../src/components/forge/forgeSession.js');

const LEGACY_MODEL = 'djhc-forge-observed-skills-v2';
const SEASON = 2025;
const PACKAGE = 'synthetic-integration-v1';
const neutralRatings = Object.fromEntries(SKILLS.map(skill => [skill.key, 75]));

function rawReceipt(value) {
  return `build=${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
}

function createLocalStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return values.size; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    key(index) { return [...values.keys()][index] ?? null; },
  };
}

function withLocalStorage(storage, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
  try { return run(); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
}

function poolSource() {
  const blueprintRows = Array.from({ length: 16 }, (_, index) => {
    const isGuard = index < 8, position = isGuard ? 'PG' : 'C', offset = isGuard ? index : index - 8;
    return {
      playerRef: `rated-${index}`, phase: 'regular', observed: true, seasonStartYear: SEASON,
      displayName: `Rated Player ${index}`, teamCode: `T${index}`, positions: [position], games: 20, minutes: 500,
      box: {
        points: 180, assists: 80, rebounds: 90, turnovers: 40, steals: 20, blocks: 8,
        offensiveRebounds: 20, defensiveRebounds: 70, fieldGoalAttempts: 160, fieldGoalsMade: 80,
        threePointAttempts: 40, threePointersMade: 16, freeThrowAttempts: 40, freeThrowsMade: 32,
        twoPointAttempts: 120, twoPointMakes: 64,
      },
    };
  });
  const records = Object.fromEntries(blueprintRows.map((player, index) => {
    const isTarget = index === 0, isGuard = index < 8, position = player.positions[0], offset = isGuard ? index : index - 8;
    return [player.playerRef, {
      clutch: isTarget
        ? { games: 10, minutes: 100, points: 60, fga: 35, fgm: 25, fta: 12, ftm: 10, turnovers: 1 }
        : { games: 8, minutes: 24, points: 14, fga: 10, fgm: 5, fta: 5, ftm: 4, turnovers: 2 },
      perimeter: isTarget
        ? { minutes: 500, deflections: 100, defendedAttempts: 200, defendedMakes: 50, expectedPercentage: .45 }
        : { minutes: 500, deflections: 12 + index, defendedAttempts: 100, defendedMakes: 42, expectedPercentage: .45 },
      body: isTarget
        ? { position, height: 77, wingspan: 85, weight: 220 }
        : { position, height: isGuard ? 70 + offset * .8 : 78 + offset, wingspan: isGuard ? 73 + offset * .7 : 80 + offset, weight: isGuard ? 160 + offset * 5 : 200 + offset * 5 },
    }];
  }));
  return {
    entry: { packageVersion: PACKAGE, scope: { seasonStartYears: [SEASON] } },
    blueprintRows,
    forgeEvidence: { year: SEASON, packageVersion: PACKAGE, records },
  };
}

function baseLeague() {
  const teams = ['AAA', 'BBB'].map((code, index) => ({
    code, name: `Team ${code}`, conference: index ? 'WEST' : 'EAST',
    efg: .54, tov: .13, ftr: .25, orb: .27, drb: .73,
    oppEfg: .54, oppTov: .13, oppFtr: .25, pace: 99,
  }));
  return { teams, byCode: new Map(teams.map(team => [team.code, team])), offAvg: 112, defAvg: 112 };
}

function teamProfile(league, code, ratings, prefix) {
  const roster = TEAM_SLOTS.map((slot, index) => ({
    playerRef: `${prefix}-${index}`, name: `${prefix} Player ${index}`,
    rotationMinutes: slot.minutes, ratings,
  }));
  return buildForgeProfile(league, ratings, { code, name: prefix, conference: code === 'AAA' ? 'EAST' : 'WEST', roster });
}

function assertBoxConserved(game, side) {
  const box = side === 'home' ? game.boxHome : game.boxAway;
  const totals = side === 'home' ? game.totalsHome : game.totalsAway;
  const score = side === 'home' ? game.homePts : game.awayPts;
  const sum = key => box.reduce((total, player) => total + player[key], 0);

  assert.equal(totals.pts, score);
  assert.equal(sum('pts'), score);
  for (const key of ['fga', 'fgm', 'threeA', 'threeM', 'fta', 'ftm', 'tov']) assert.equal(sum(key), totals[key], `${side} ${key} must conserve`);
  assert.equal(sum('fgm') - sum('threeM'), totals.twoM);
  assert.equal(sum('fga') - sum('threeA'), totals.twoA);
  assert.ok(Math.abs(sum('min') - 5 * (48 + game.ot * 5)) < 1e-8);
  for (const player of box) {
    assert.ok(player.fgm <= player.fga);
    assert.ok(player.threeM <= player.threeA);
    assert.ok(player.ftm <= player.fta);
    assert.equal(player.pts, 2 * (player.fgm - player.threeM) + 3 * player.threeM + player.ftm);
  }
}

test('current build receipts retain all ten slots and restore 10-slot picks from the current model', () => {
  const keys = SKILLS.map(skill => skill.key);
  assert.equal(keys.length, 10);
  assert.deepEqual(forgeBuildKeys('wheel'), keys);

  const picks = Object.fromEntries(keys.map((key, index) => [key, [`player-${index}`, 75 + index]]));
  const partial = { mode: 'wheel', picks: Object.fromEntries(Object.entries(picks).slice(0, 9)) };
  assert.equal(completeForgeBuild(partial), false);
  assert.equal(completeForgeBuild({ mode: 'wheel', picks }), true);

  const query = forgeBuildQuery({
    mode: 'wheel', picks, year: SEASON, packageVersion: PACKAGE, seed: 41,
    editions: { jersey: 'association', shorts: 'statement' },
  });
  const decoded = decodeForgeBuild(`?${query}`);
  assert.equal(decoded.version, 2);
  assert.equal(decoded.ratingModel, RATING_MODEL);
  assert.equal(decoded.year, SEASON);
  assert.deepEqual(Object.keys(decoded.picks), keys);
  assert.equal(decoded.picks.clutch.playerRef, 'player-6');
  assert.equal(decoded.picks.perimeterDefense.playerRef, 'player-7');
  assert.equal(decoded.picks.body.playerRef, 'player-9');

  const currentSource = { entry: { packageVersion: PACKAGE, scope: { seasonStartYears: [SEASON] } } };
  const currentPool = keys.map((key, index) => ({ playerRef: `player-${index}`, [key]: 80 + index }));
  const restored = restoreForgePicks(decoded, currentPool, currentSource);
  assert.equal(restored.warning, '');
  assert.deepEqual(Object.keys(restored.picks), keys);
  assert.deepEqual(keys.map(key => restored.picks[key].value), keys.map((_, index) => 80 + index));
});

test('legacy session fallback migrates steals, retires offensive rebound, and recalculates resolved ratings', () => {
  const source = { entry: { packageVersion: PACKAGE, scope: { seasonStartYears: [SEASON] } } };
  const currentKey = sessionKey('wheel', source);
  const legacyKey = currentKey.replace(RATING_MODEL, LEGACY_MODEL);
  const legacyQuery = rawReceipt({
    v: 2, m: 'wheel', r: LEGACY_MODEL, y: SEASON, a: PACKAGE, s: 919,
    p: { scoring: ['p-score', 91], steals: ['p-defense', 88], offensiveRebound: ['p-retired', 83] },
    e: { jersey: 'icon', shorts: 'icon' },
  });
  const storage = createLocalStorage({ [legacyKey]: JSON.stringify({ v: 2, build: legacyQuery, phase: 'drafting' }) });
  const pool = [
    { playerRef: 'p-score', scoring: 84, perimeterDefense: 70 },
    { playerRef: 'p-defense', scoring: 75, perimeterDefense: 79 },
    { playerRef: 'p-retired', scoring: 75, perimeterDefense: 75, offensiveRebound: 99 },
  ];

  withLocalStorage(storage, () => {
    const session = readForgeSession(currentKey);
    assert.equal(session.build, legacyQuery);
    const decoded = decodeForgeBuild(`?${session.build}`);
    assert.equal(decoded.ratingModel, LEGACY_MODEL);
    const restored = restoreForgePicks(decoded, pool, source);
    assert.equal(restored.picks.scoring.value, 84);
    assert.equal(restored.picks.perimeterDefense.value, 79);
    assert.equal(Object.hasOwn(restored.picks, 'offensiveRebound'), false);
    assert.match(restored.warning, /Offensive Rebounding is retired/);
    assert.match(restored.warning, /Clutch, Body/);
    assert.equal(completeForgeBuild({ mode: 'wheel', picks: restored.picks }), false);

    storage.setItem(currentKey, JSON.stringify({ v: 2, build: 'current-release', phase: 'drafting' }));
    assert.equal(readForgeSession(currentKey).build, 'current-release');
  });
});

test('simulation deterministically conserves scores and each team box across its player rows', () => {
  const league = baseLeague();
  const homeRatings = { ...neutralRatings, jumpShot: 88, finishing: 82, playmaking: 80, decision: 79, rebounding: 82, perimeterDefense: 86, rimProtection: 78 };
  const awayRatings = { ...neutralRatings, jumpShot: 76, finishing: 78, playmaking: 83, decision: 82, rebounding: 77, perimeterDefense: 74, rimProtection: 84 };
  const home = teamProfile(league, 'AAA', homeRatings, 'Home');
  const away = teamProfile(league, 'BBB', awayRatings, 'Away');
  const first = simulateForgeGame(league, home, away, seededRandom(20261010), { includeBox: true });
  const repeated = simulateForgeGame(league, home, away, seededRandom(20261010), { includeBox: true });

  assert.deepEqual(repeated, first);
  assert.equal(FORGE_SIM_MODEL, 'djhc-forge-four-factor-v3');
  assertBoxConserved(first, 'home');
  assertBoxConserved(first, 'away');
});

test('clutch, perimeter defense, and Body ratings flow from evidence into team simulation factors', () => {
  const players = buildForgePool(poolSource());
  const target = players.find(player => player.playerRef === 'rated-0');

  assert.ok(Number.isFinite(target.clutch));
  assert.ok(Number.isFinite(target.perimeterDefense));
  assert.ok(Number.isFinite(target.body));
  assert.ok(target.clutch > 75 && target.perimeterDefense > 75 && target.body > 75);
  assert.equal(target.ratingEvidence.clutch.observed.games, 10);
  assert.equal(target.measurements.position, 'PG');

  const weighted = rosterRatings(
    Object.fromEntries(TEAM_SLOTS.map((slot, index) => [slot.key, { player: { ...neutralRatings, clutch: 70 + index, perimeterDefense: 80 + index, body: 90 - index } }])),
    TEAM_SLOTS,
  );
  const totalMinutes = TEAM_SLOTS.reduce((sum, slot) => sum + slot.minutes, 0);
  for (const key of ['clutch', 'perimeterDefense', 'body']) {
    const expected = TEAM_SLOTS.reduce((sum, slot, index) => sum + ({ clutch: 70 + index, perimeterDefense: 80 + index, body: 90 - index })[key] * slot.minutes, 0) / totalMinutes;
    assert.equal(weighted[key], expected, `${key} must be minutes-weighted across the rotation`);
  }

  const league = baseLeague();
  const neutral = buildForgeProfile(league, neutralRatings, { code: 'CMP', name: 'Neutral' });
  const integrated = buildForgeProfile(league, {
    ...neutralRatings,
    clutch: target.clutch,
    perimeterDefense: target.perimeterDefense,
    body: target.body,
  }, { code: 'CMP', name: 'Evidence ratings' });

  assert.ok(integrated.clutch > neutral.clutch);
  assert.ok(integrated.oppTov > neutral.oppTov);
  assert.ok(integrated.oppEfg < neutral.oppEfg);
  assert.ok(integrated.orb > neutral.orb);
  assert.ok(integrated.drb > neutral.drb);
  assert.ok(forgePlayerScore(target) > 75);
});
