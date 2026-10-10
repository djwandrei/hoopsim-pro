import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJson, writeJson, writeJsonl } from './lib/artifacts.mjs';
import { executeExperiment } from '../../../scripts/swishiq-experiment.mjs';

const fixtureRoot = path.join(import.meta.dirname, 'runs', 'cycle2-workflow-receipt-fixture-20261010-' + randomUUID());
fs.mkdirSync(fixtureRoot, { recursive: false });

const featureRows = [];
for (let index = 0; index < 201; index++) {
  const gameDateLocal = new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10);
  const homeScore = 106 + (index % 7) * 2;
  const awayScore = 92 + (index % 5) * 2;
  featureRows.push({
    gameRef: `cycle2-fixture-${String(index).padStart(3, '0')}`,
    gameDateLocal,
    seasonStartYear: 2020,
    homeTeamRef: `home-${index}`,
    awayTeamRef: `away-${index}`,
    observedThrough: new Date(Date.parse(gameDateLocal + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10),
    target: { homeScore, awayScore, total: homeScore + awayScore, margin: homeScore - awayScore },
    features: {
      total: { 'c51:meanPointsForLast10': 85 + (index % 13) * 0.7 },
      margin: { 'c51:pointsForAdvantageLast10': (index % 11) - 5 },
    },
  });
}
const targetDate = '2021-01-01';
featureRows.push({
  gameRef: 'cycle2-fixture-target-2021',
  gameDateLocal: targetDate,
  seasonStartYear: 2021,
  homeTeamRef: 'target-home',
  awayTeamRef: 'target-away',
  observedThrough: '2020-12-31',
  target: { homeScore: 114, awayScore: 98, total: 212, margin: 16 },
  features: {
    total: { 'c51:meanPointsForLast10': 91.2 },
    margin: { 'c51:pointsForAdvantageLast10': 2 },
  },
});

writeJsonl(path.join(fixtureRoot, 'features.jsonl'), featureRows);
writeJson(path.join(fixtureRoot, 'configuration.json'), {
  version: 'cycle2-workflow-receipt-fixture-20261010',
  totalFeatureNames: ['c51:meanPointsForLast10'],
  marginFeatureNames: ['c51:pointsForAdvantageLast10'],
  totalRidgeLambda: 200,
  marginRidgeLambda: 200,
  trainingHalfLifeDays: 720,
  refitIntervalDays: 3,
  minimumTrainingRows: 100,
  standardizationWarmupPrefixGames: 100,
});
const plan = {
  format: 'swishiq-experiment-plan-v1',
  outputDirectory: './outputs/plan-runs',
  means: {
    format: 'swishiq-mean-batch-plan-v1',
    features: './features.jsonl',
    warmupSeasonStartYear: 2020,
    throughSeasonStartYear: 2021,
    cacheRoot: './outputs/cache',
    outputDirectory: './outputs/means',
    maxWorkers: 1,
    configurations: [{ id: 'fixture', configuration: './configuration.json' }],
  },
  screen: {
    format: 'swishiq-uncertainty-screen-plan-v1',
    targetSeasonStartYears: [2021],
    cacheRoot: './outputs/cache',
    outputDirectory: './outputs/screens',
    maxWorkers: 2,
    variants: [
      { id: 'fixture-retention-60', forceCanonical: true, settings: { gaussianBlend: 1, totalBiasRetention: 0.6 } },
      { id: 'fixture-retention-80', forceCanonical: true, settings: { gaussianBlend: 1, totalBiasRetention: 0.8 } },
    ],
  },
};
const planFile = path.join(fixtureRoot, 'plan.json');
writeJson(planFile, plan);

function assertScreenReceipt(result, { cacheHits, cacheMisses, cacheHit, workerThreadsUsed, mode }) {
  const screen = result.screens?.[0];
  assert.ok(screen, 'workflow result includes screen summary');
  assert.equal(screen.expectedTargets, 1, 'screen records its target denominator');
  assert.equal(screen.cacheHits, cacheHits, 'screen records the number of reused variant caches');
  assert.equal(screen.cacheMisses, cacheMisses, 'screen records the number of newly computed variant caches');
  assert.equal(screen.cacheHit, cacheHit, 'screen records whether every variant reused cache');
  assert.equal(screen.results.length, 2, 'screen receipt identifies each variant cache');
  assert.equal(screen.execution.workerThreadsUsed, workerThreadsUsed, 'screen records actual workers used');
  assert.equal(screen.execution.mode, mode, 'screen records its execution mode');
  return screen;
}

const first = await executeExperiment(planFile);
const firstExpectedWorkers = Math.min(2, os.availableParallelism());
const firstScreen = assertScreenReceipt(first, {
  cacheHits: 0,
  cacheMisses: 2,
  cacheHit: false,
  workerThreadsUsed: firstExpectedWorkers > 1 ? firstExpectedWorkers : 0,
  mode: firstExpectedWorkers > 1 ? 'managed-worker-threads' : 'in-process',
});
const firstComplete = readJson(path.join(first.outputDirectory, 'complete.json'));
const firstTerminal = readJson(path.join(path.dirname(first.receiptFile), 'terminal.json'));
assert.equal(firstComplete.expectedTargets, 1);
assert.deepEqual(firstComplete.screens[0], firstScreen);
assert.equal(firstTerminal.result.targetGames, 1);
assert.deepEqual(firstTerminal.result.screens[0], firstScreen);

const resumed = await executeExperiment(planFile, { resumeFrom: first.receiptFile });
const resumedScreen = assertScreenReceipt(resumed, {
  cacheHits: 2,
  cacheMisses: 0,
  cacheHit: true,
  workerThreadsUsed: 0,
  mode: 'cache-only',
});
const resumedComplete = readJson(path.join(resumed.outputDirectory, 'complete.json'));
const resumedTerminal = readJson(path.join(path.dirname(resumed.receiptFile), 'terminal.json'));
assert.equal(resumedComplete.expectedTargets, 1);
assert.deepEqual(resumedComplete.screens[0], resumedScreen);
assert.equal(resumedTerminal.result.targetGames, 1);
assert.deepEqual(resumedTerminal.result.screens[0], resumedScreen);

console.log(JSON.stringify({
  status: 'passed',
  fixtureRoot,
  firstReceipt: first.receiptFile,
  firstComplete: path.join(first.outputDirectory, 'complete.json'),
  resumedReceipt: resumed.receiptFile,
  resumedComplete: path.join(resumed.outputDirectory, 'complete.json'),
  targetsPerScreen: 1,
  initialCacheMisses: firstScreen.cacheMisses,
  resumedCacheHits: resumedScreen.cacheHits,
  initialWorkers: firstScreen.execution.workerThreadsUsed,
  resumedWorkers: resumedScreen.execution.workerThreadsUsed,
}, null, 2));
