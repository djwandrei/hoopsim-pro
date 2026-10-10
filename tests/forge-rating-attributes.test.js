import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./helpers/forge-source-loader.mjs', import.meta.url);
const { buildForgePool } = await import('../src/components/forge/forgePool.js');
const { SKILLS } = await import('../src/components/forge/bapSkills.js');
const { forgeShadesOf } = await import('../src/components/forge/forgePlayerComparisons.js');
const { bestForgeOffer, forgeStageSkillState } = await import('../src/components/forge/forgeStageMapping.js');
const { boxFingerprintMatches, createForgeEvidence } = await import('../scripts/lib/forge-evidence.mjs');

const SEASON = 2025;
const PACKAGE = 'synthetic-forge-test-v1';
const count = Object.fromEntries([
  ['points', 180], ['assists', 80], ['rebounds', 90], ['turnovers', 40],
  ['steals', 20], ['blocks', 8], ['offensiveRebounds', 20], ['defensiveRebounds', 70],
  ['fieldGoalAttempts', 160], ['fieldGoalsMade', 80], ['threePointAttempts', 40], ['threePointersMade', 16],
  ['freeThrowAttempts', 40], ['freeThrowsMade', 32], ['twoPointAttempts', 120], ['twoPointMakes', 64],
]);

function row(index, { position = 'PG', evidence = null, box = {} } = {}) {
  return {
    playerRef: `player-${index}`, phase: 'regular', observed: true, seasonStartYear: SEASON,
    displayName: `Player ${index}`, teamCode: `T${index}`, positions: [position],
    games: 20, minutes: 500, box: { ...Object.fromEntries(Object.entries(count)), ...box }, evidence,
  };
}

function source(rows, records) {
  const evidenceRecords = records ?? Object.fromEntries(rows.filter(player => player.evidence).map(player => [player.playerRef, player.evidence]));
  return {
    entry: { packageVersion: PACKAGE },
    blueprintRows: rows,
    forgeEvidence: { year: SEASON, packageVersion: PACKAGE, records: evidenceRecords },
  };
}

function seasonEvidence(records) {
  return { year: SEASON, packageVersion: PACKAGE, records };
}

function clutchEvidence(overrides = {}) {
  return { games: 10, minutes: 20, points: 25, fga: 8, fgm: 4, fta: 4, ftm: 3, turnovers: 1, ...overrides };
}

function perimeterEvidence(overrides = {}) {
  return { minutes: 500, deflections: 20, defendedAttempts: 100, defendedMakes: 45, expectedPercentage: 0.45, ...overrides };
}

function makeBodyRows({ height = i => 72 + i / 2, wingspan = i => 74 + i / 2, weight = i => 160 + i * 5, position = 'PG', count: size = 8 } = {}) {
  return Array.from({ length: size }, (_, i) => {
    const player = row(`${position}-${i}`, { position });
    return {
      ...player,
      playerRef: `body-${position}-${i}`,
      displayName: `Body ${position} ${i}`,
      evidence: { body: { height: height(i), wingspan: wingspan(i), weight: weight(i), position } },
    };
  });
}

test('pool applies the 15-game, 300-minute floor and keeps missing clutch separate from ordinary scoring', () => {
  const rows = Array.from({ length: 15 }, (_, i) => row(i));
  rows.push(row('too-few-games', { box: {} }));
  rows.at(-1).games = 14;
  const players = buildForgePool(source(rows));

  assert.equal(players.length, 15);
  assert.ok(players.every(player => player.games >= 15 && player.minutes >= 300));
  assert.ok(players.every(player => Number.isFinite(player.scoring)));
  assert.ok(players.every(player => player.clutch === null));
  assert.ok(players.every(player => player.ratingEvidence.clutch.components.find(component => component.key === 'clutchTrueShooting').rawValue === null));
});

test('clutch needs valid clutch minutes, attempts, games, and points before it is rated', () => {
  const rows = Array.from({ length: 15 }, (_, i) => row(i));
  const records = Object.fromEntries(rows.map(player => [player.playerRef, { clutch: null }]));
  records['player-0'].clutch = clutchEvidence();
  records['player-1'].clutch = clutchEvidence({ minutes: 9 });
  records['player-2'].clutch = clutchEvidence({ fga: 4, fgm: 2 });
  records['player-3'].clutch = clutchEvidence({ games: 2 });
  records['player-4'].clutch = clutchEvidence({ points: null });

  const players = buildForgePool(source(rows, records));
  const byName = Object.fromEntries(players.map(player => [player.name, player]));

  assert.ok(Number.isFinite(byName['Player 0'].clutch));
  for (const index of [1, 2, 3, 4]) {
    assert.equal(byName[`Player ${index}`].clutch, null);
    assert.equal(byName[`Player ${index}`].ratingEvidence.clutch.components.find(component => component.key === 'clutchTrueShooting').rawValue, null);
  }
  assert.ok(Number.isFinite(byName['Player 1'].scoring));
  assert.notEqual(byName['Player 1'].clutch, byName['Player 1'].scoring);
});

test('pool ignores season evidence from another year or package release', () => {
  const rows = Array.from({ length: 15 }, (_, i) => row(i));
  const records = { 'player-0': { clutch: clutchEvidence() } };
  const staleYear = source(rows, records);
  staleYear.forgeEvidence.year = SEASON - 1;
  const stalePackage = source(rows, records);
  stalePackage.forgeEvidence.packageVersion = 'older-release';

  assert.ok(buildForgePool(staleYear).every(player => player.clutch === null));
  assert.ok(buildForgePool(stalePackage).every(player => player.clutch === null));
});

test('perimeter defense responds to tracking evidence while steals stay fixed', () => {
  const rows = Array.from({ length: 16 }, (_, i) => row(i));
  const records = Object.fromEntries(rows.map(player => [player.playerRef, { perimeter: perimeterEvidence() }]));
  const baseline = buildForgePool(source(rows, records));

  records['player-0'].perimeter = perimeterEvidence({ deflections: 90, defendedMakes: 25 });
  const tracked = buildForgePool(source(rows, records));
  const baselineTarget = baseline.find(player => player.playerRef === 'player-0');
  const trackedTarget = tracked.find(player => player.playerRef === 'player-0');

  assert.equal(baselineTarget.stl, trackedTarget.stl);
  assert.equal(baselineTarget.totals.steals, trackedTarget.totals.steals);
  assert.ok(trackedTarget.perimeterDefense > baselineTarget.perimeterDefense);
  assert.ok(trackedTarget.ratingEvidence.perimeterDefense.components.some(component => component.key === 'deflectionsPer36' && component.rawValue > baselineTarget.ratingEvidence.perimeterDefense.components.find(item => item.key === 'deflectionsPer36').rawValue));
});

test('body rating rises with height and wingspan within a position and compares each position to its peers', () => {
  const heightRows = makeBodyRows({ height: i => 70 + i, wingspan: () => 80, weight: () => 190 });
  const heightRatings = buildForgePool(source(heightRows));
  assert.ok(heightRatings.find(player => player.playerRef === 'body-PG-7').body > heightRatings.find(player => player.playerRef === 'body-PG-0').body);

  const spanRows = makeBodyRows({ height: () => 75, wingspan: i => 78 + i, weight: () => 190 });
  const spanRatings = buildForgePool(source(spanRows));
  assert.ok(spanRatings.find(player => player.playerRef === 'body-PG-7').body > spanRatings.find(player => player.playerRef === 'body-PG-0').body);

  const positionRows = [...makeBodyRows({ position: 'PG', height: i => 70 + i, wingspan: i => 72 + i, weight: i => 160 + i * 5 }),
    ...makeBodyRows({ position: 'C', height: i => 78 + i, wingspan: i => 80 + i, weight: i => 200 + i * 5 })];
  const byPosition = buildForgePool(source(positionRows));
  const topGuard = byPosition.find(player => player.playerRef === 'body-PG-7');
  const topCenter = byPosition.find(player => player.playerRef === 'body-C-7');

  assert.equal(topGuard.ratingEvidence.body.components.find(component => component.key === 'height').comparison, 'PG');
  assert.equal(topCenter.ratingEvidence.body.components.find(component => component.key === 'height').comparison, 'C');
  assert.equal(topGuard.body, topCenter.body);
  assert.notEqual(topGuard.measurements.height, topCenter.measurements.height);
});

test('body measurements remain absent when missing, including wingspan', () => {
  const rows = makeBodyRows({ height: () => null, wingspan: () => null, weight: () => null, count: 8 });
  const missing = buildForgePool(source(rows));
  assert.ok(missing.every(player => player.body === null));
  assert.ok(missing.every(player => player.measurements === null || player.measurements.height === null && player.measurements.wingspan === null && player.measurements.weight === null));

  const partialRows = makeBodyRows({ height: i => 70 + i, wingspan: () => null, weight: () => null, count: 8 });
  const partial = buildForgePool(source(partialRows));
  const partialTop = partial.find(player => player.playerRef === 'body-PG-7');
  assert.equal(partialTop.measurements.wingspan, null);
  assert.equal(partialTop.ratingEvidence.body.components.find(component => component.key === 'wingspan').rawValue, null);
  assert.ok(Number.isFinite(partialTop.body));
});

test('Shades of stays hidden until five assigned attributes and ranks only assigned non-Body skills', () => {
  const names = ['LeBron James', 'Stephen Curry', 'Kevin Durant', 'Giannis Antetokounmpo', 'Nikola Jokic'];
  const pool = names.map((name, index) => ({
    name, minutes: 1000, playerRef: `shade-${index}`,
    ...Object.fromEntries(SKILLS.map((skill, skillIndex) => [skill.key, skill.key === 'body' ? (index === 0 ? 99 : 25) : 70 + index * (skillIndex + 1)])),
  }));
  const picks = Object.fromEntries(['scoring', 'jumpShot', 'finishing', 'playmaking'].map(key => [key, { value: 80 }]));

  assert.deepEqual(forgeShadesOf(picks, pool), []);
  picks.body = { value: 25 };
  const first = forgeShadesOf(picks, pool);
  picks.body.value = 99;
  const second = forgeShadesOf(picks, pool);

  assert.equal(first.length, 3);
  assert.deepEqual(first.map(item => item.player.name), second.map(item => item.player.name));
  assert.deepEqual(first.map(item => item.distance), second.map(item => item.distance));
  assert.ok(first.every(item => names.includes(item.player.name) && item.player.minutes >= 600));
  const selectedSkills = SKILLS.filter(skill => ['scoring', 'jumpShot', 'finishing', 'playmaking'].includes(skill.key));
  for (const item of first) {
    const weight = selectedSkills.reduce((sum, skill) => sum + skill.weight, 0);
    const expected = Math.sqrt(selectedSkills.reduce((sum, skill) => sum + skill.weight * (80 - item.player[skill.key]) ** 2, 0) / weight);
    assert.equal(item.distance, expected);
  }
});

test('stage states prevent assigning other, locked, spinning, and non-finite ratings', () => {
  const reveal = { scoring: 90, jumpShot: 84, finishing: NaN };
  const picks = { scoring: { value: 77 } };
  const locked = forgeStageSkillState('scoring', { mode: 'wheel', picks, reveal, selectedKey: null, spinning: false });
  assert.equal(locked.status, 'Locked');
  assert.equal(locked.clickable, false);
  assert.equal(locked.value, 77);

  const wheelOffer = forgeStageSkillState('jumpShot', { mode: 'wheel', picks, reveal, selectedKey: null, spinning: false });
  assert.equal(wheelOffer.live, true);
  assert.equal(wheelOffer.clickable, true);

  const selectedPick = forgeStageSkillState('jumpShot', { mode: 'pick', picks: {}, reveal, selectedKey: 'jumpShot', spinning: false });
  const otherPick = forgeStageSkillState('scoring', { mode: 'pick', picks: {}, reveal, selectedKey: 'jumpShot', spinning: false });
  assert.equal(selectedPick.live, true);
  assert.equal(otherPick.live, false);
  assert.equal(otherPick.clickable, false);

  const spinning = forgeStageSkillState('jumpShot', { mode: 'wheel', picks: {}, reveal, selectedKey: null, spinning: true });
  assert.equal(spinning.status, 'Spinning');
  assert.equal(spinning.clickable, false);
  const invalid = forgeStageSkillState('finishing', { mode: 'wheel', picks: {}, reveal, selectedKey: null, spinning: false });
  assert.equal(invalid.live, false);
  assert.equal(invalid.clickable, false);
  assert.equal(invalid.value, null);
  assert.equal(bestForgeOffer({}, reveal), 'scoring');
});

const box = {
  games: 20, points: 300, assists: 80, rebounds: 100, fieldGoalAttempts: 200, fieldGoalsMade: 100,
  threePointAttempts: 50, threePointersMade: 20, freeThrowAttempts: 60, freeThrowsMade: 50,
  steals: 20, blocks: 10, turnovers: 40,
};
const metricKeys = {
  GP: 'games', PTS: 'points', AST: 'assists', REB: 'rebounds', FGA: 'fieldGoalAttempts', FGM: 'fieldGoalsMade',
  FG3A: 'threePointAttempts', FG3M: 'threePointersMade', FTA: 'freeThrowAttempts', FTM: 'freeThrowsMade',
  STL: 'steals', BLK: 'blocks', TOV: 'turnovers',
};
const metrics = Object.fromEntries(Object.entries(metricKeys).map(([providerKey, key]) => [providerKey, box[key]]));

function evidenceParts({ name = 'Exact Player', team = 'BOS', baseYear = SEASON, extraBase = [], seasonRows = null, providerVersion = PACKAGE, baseMetrics = metrics } = {}) {
  const season = {
    time: { seasonStartYear: SEASON, phase: 'regular' }, entities: { playerRef: 'canonical-1' },
    values: { displayName: 'Exact Player', teamCode: 'BOS', positions: ['PG'], observed: true, games: box.games, box: { ...box } },
  };
  const anchor = {
    recordId: 'anchor-1', time: { seasonStartYear: baseYear, phase: 'regular' },
    values: { displayName: name, entityLevel: 'player', teamCode: team, sourceDatasetVersion: providerVersion, metrics: { ...baseMetrics } },
  };
  return {
    parts: {
      seasons: seasonRows || [season], base: [anchor, ...extraBase], clutch: [], hustle: [], defense: [],
    },
    context: { records: [] }, combineRows: [],
  };
}

test('box fingerprints need at least eight matching fields and reject any conflicting comparable field', () => {
  const sevenKeys = Object.keys(metrics).slice(0, 7);
  const sevenCanonical = Object.fromEntries(sevenKeys.map(key => [metricKeys[key] === 'games' ? 'games' : metricKeys[key], box[metricKeys[key]]]));
  const sevenProvider = Object.fromEntries(sevenKeys.map(key => [key, metrics[key]]));
  const eightKeys = Object.keys(metrics).slice(0, 8);
  const eightCanonical = Object.fromEntries(eightKeys.map(key => [metricKeys[key], box[metricKeys[key]]]));
  const eightProvider = Object.fromEntries(eightKeys.map(key => [key, metrics[key]]));
  assert.equal(boxFingerprintMatches(sevenCanonical, sevenProvider), false);
  assert.equal(boxFingerprintMatches(eightCanonical, eightProvider), true);
  assert.equal(boxFingerprintMatches(box, metrics), true);

  const mismatch = { ...metrics, PTS: metrics.PTS + 1 };
  assert.equal(boxFingerprintMatches(box, mismatch), false);
});

test('evidence joins require exact normalized name, team, season, unique anchors, and a matching box fingerprint', () => {
  const valid = evidenceParts();
  const joined = createForgeEvidence(SEASON, PACKAGE, valid.parts, valid.context, valid.combineRows);
  assert.equal(joined.coverage.anchored, 1);
  assert.equal(joined.records['canonical-1'].anchor, 'anchor-1');

  const wrongName = evidenceParts({ name: 'Exact Player II' });
  assert.deepEqual(createForgeEvidence(SEASON, PACKAGE, wrongName.parts, wrongName.context, wrongName.combineRows).records, {});
  const wrongTeam = evidenceParts({ team: 'LAL' });
  assert.deepEqual(createForgeEvidence(SEASON, PACKAGE, wrongTeam.parts, wrongTeam.context, wrongTeam.combineRows).records, {});
  const wrongSeason = evidenceParts({ baseYear: SEASON - 1 });
  assert.deepEqual(createForgeEvidence(SEASON, PACKAGE, wrongSeason.parts, wrongSeason.context, wrongSeason.combineRows).records, {});
  const wrongFingerprint = evidenceParts({ baseMetrics: { ...metrics, FGM: metrics.FGM + 1 } });
  assert.deepEqual(createForgeEvidence(SEASON, PACKAGE, wrongFingerprint.parts, wrongFingerprint.context, wrongFingerprint.combineRows).records, {});

  const duplicateAnchor = evidenceParts({ extraBase: [{
    recordId: 'anchor-duplicate', time: { seasonStartYear: SEASON, phase: 'regular' },
    values: { displayName: 'Exact Player', entityLevel: 'player', teamCode: 'BOS', sourceDatasetVersion: PACKAGE, metrics: { ...metrics } },
  }] });
  assert.deepEqual(createForgeEvidence(SEASON, PACKAGE, duplicateAnchor.parts, duplicateAnchor.context, duplicateAnchor.combineRows).records, {});
});
