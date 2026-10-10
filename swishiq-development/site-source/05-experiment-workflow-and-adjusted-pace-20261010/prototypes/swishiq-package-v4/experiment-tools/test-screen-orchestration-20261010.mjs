import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { hash, readJson, readJsonl, writeJson, writeJsonl } from './lib/artifacts.mjs';
import { runPlan } from './run-plan.mjs';

const toolsDirectory = import.meta.dirname;
const runsDirectory = path.join(toolsDirectory, 'runs');
fs.mkdirSync(runsDirectory, { recursive: true });
const fixtureRoot = path.join(runsDirectory, 'screen-orchestration-fixture-20261010-' + randomUUID());
fs.mkdirSync(fixtureRoot, { recursive: false });

const featureRows = [];
for (let index = 0; index < 201; index++) {
  const gameDateLocal = new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10);
  const homeScore = 104 + (index % 9) * 2;
  const awayScore = 90 + (index % 7) * 2;
  featureRows.push({
    gameRef: `orchestration-train-${String(index).padStart(3, '0')}`,
    gameDateLocal,
    seasonStartYear: 2020,
    homeTeamRef: `train-home-${index}`,
    awayTeamRef: `train-away-${index}`,
    observedThrough: new Date(Date.parse(gameDateLocal + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10),
    target: { homeScore, awayScore, total: homeScore + awayScore, margin: homeScore - awayScore },
    features: {
      total: { 'c51:meanPointsForLast10': 78 + (index % 13) * 0.8 },
      margin: { 'c51:pointsForAdvantageLast10': (index % 11) - 5 },
    },
  });
}
const targetDate = '2021-01-01';
const targetRows = [
  { gameDateLocal: targetDate, gameRef: 'orchestration-target-001', homeScore: 115, awayScore: 103, totalFeature: 91.4, marginFeature: 3.5 },
  { gameDateLocal: targetDate, gameRef: 'orchestration-target-002', homeScore: 101, awayScore: 110, totalFeature: 87.2, marginFeature: -2.5 },
  { gameDateLocal: '2021-01-02', gameRef: 'orchestration-target-003', homeScore: 108, awayScore: 99, totalFeature: 89.1, marginFeature: 1.5 },
].map((row, index) => ({
  gameRef: row.gameRef,
  gameDateLocal: row.gameDateLocal,
  seasonStartYear: 2021,
  homeTeamRef: `target-home-${index}`,
  awayTeamRef: `target-away-${index}`,
  observedThrough: new Date(Date.parse(row.gameDateLocal + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10),
  target: { homeScore: row.homeScore, awayScore: row.awayScore, total: row.homeScore + row.awayScore,
    margin: row.homeScore - row.awayScore },
  features: {
    total: { 'c51:meanPointsForLast10': row.totalFeature },
    margin: { 'c51:pointsForAdvantageLast10': row.marginFeature },
  },
}));
featureRows.push(...targetRows);
writeJsonl(path.join(fixtureRoot, 'features.jsonl'), featureRows);

function configuration({ version, postMeanAffine, uncertainty }) {
  return {
    version,
    totalFeatureNames: ['c51:meanPointsForLast10'],
    marginFeatureNames: ['c51:pointsForAdvantageLast10'],
    totalRidgeLambda: 200,
    marginRidgeLambda: 200,
    trainingHalfLifeDays: 720,
    refitIntervalDays: 3,
    minimumTrainingRows: 100,
    standardizationWarmupPrefixGames: 100,
    ...(postMeanAffine ? { postMeanAffine } : {}),
    ...(uncertainty ? { uncertainty } : {}),
  };
}

writeJson(path.join(fixtureRoot, 'configuration-a.json'), configuration({ version: 'orchestration-mean-a-v1' }));
writeJson(path.join(fixtureRoot, 'configuration-b.json'), configuration({
  version: 'orchestration-mean-b-v1',
  postMeanAffine: { totalOffset: 8, marginScale: 1.2, marginOffset: -2 },
}));
writeJson(path.join(fixtureRoot, 'configuration-b-screen-failure.json'), configuration({
  version: 'orchestration-mean-b-v1',
  postMeanAffine: { totalOffset: 8, marginScale: 1.2, marginOffset: -2 },
  // Mean fitting ignores uncertainty settings; screen normalization must reject this unknown field.
  uncertainty: { orchestrationFixtureUnknownSetting: true },
}));

const ordinaryConfigurations = [
  { id: 'fixture-a', configuration: './configuration-a.json' },
  { id: 'fixture-b', configuration: './configuration-b.json' },
  { id: 'fixture-a-alias', configuration: './configuration-a.json' },
];
const targetIdentity = targetRows.map(row => [row.gameRef, row.gameDateLocal, row.seasonStartYear]);
const expectedTargetIdentitySha256 = hash(targetIdentity);
const variantIds = ['residual-scale-100', 'residual-scale-125'];

function makePlan(name, maxConcurrentScreens, configurations, cacheName = name) {
  return {
    format: 'swishiq-experiment-plan-v1',
    outputDirectory: `./outputs/plans/${name}`,
    maxConcurrentScreens,
    means: {
      format: 'swishiq-mean-batch-plan-v1',
      features: './features.jsonl',
      warmupSeasonStartYear: 2020,
      throughSeasonStartYear: 2021,
      cacheRoot: './outputs/cache/means',
      outputDirectory: './outputs/mean-runs',
      maxWorkers: 1,
      configurations,
    },
    screen: {
      format: 'swishiq-uncertainty-screen-plan-v1',
      targetSeasonStartYears: [2021],
      cacheRoot: `./outputs/cache/screens-${cacheName}`,
      outputDirectory: `./outputs/screen-runs/${name}`,
      maxWorkers: 1,
      variants: [
        { id: variantIds[0], forceCanonical: true, settings: { gaussianBlend: 1, totalBiasRetention: 0.6 } },
        { id: variantIds[1], forceCanonical: true, settings: { gaussianBlend: 1, totalBiasRetention: 0.8 } },
      ],
    },
  };
}

function readComplete(result) {
  const completePath = path.join(result.outputDirectory, 'complete.json');
  assert.ok(fs.existsSync(completePath), 'successful workflow writes complete.json');
  return readJson(completePath);
}

function resultKeyProjection(complete) {
  return complete.screens.map(screen => ({ id: screen.id,
    results: screen.results.map(result => [result.id, result.resultKey]) }));
}

function assertScreenOrder(complete, ids) {
  assert.deepEqual(complete.screens.map(screen => screen.id), ids, 'screen summaries retain configuration order');
  for (const screen of complete.screens) {
    assert.deepEqual(screen.results.map(result => result.id), variantIds, 'variant results retain plan order');
    assert.equal(screen.expectedTargets, targetRows.length);
    assert.match(screen.targetIdentitySha256, /^[a-f0-9]{64}$/);
  }
}

function assertMetricArtifacts(plan, complete) {
  const cacheRoot = path.resolve(fixtureRoot, plan.screen.cacheRoot);
  const metricsByScreenAndVariant = new Map();
  for (const screen of complete.screens) for (const result of screen.results) {
    const cacheDirectory = path.join(cacheRoot, 'uncertainty', result.resultKey);
    const receipt = readJson(path.join(cacheDirectory, 'receipt.json'));
    assert.equal(receipt.key, result.resultKey, 'reported result key resolves to the exact cache receipt');
    assert.equal(receipt.signature.expectedIdentity, expectedTargetIdentitySha256);
    assert.equal(receipt.signature.expectedTargets, targetRows.length);
    const metrics = readJson(path.join(cacheDirectory, 'metrics.json'));
    assert.equal(metrics.format, 'swishiq-development-screen-metrics-v1');
    assert.equal(metrics.targetIdentitySha256, expectedTargetIdentitySha256, 'metrics identify the exact ordered target rows');
    assert.equal(metrics.summary.pooled.n, targetRows.length);
    const losses = JSON.parse(gunzipSync(fs.readFileSync(path.join(cacheDirectory, 'losses.json.gz'))).toString('utf8'));
    assert.deepEqual(losses.map(row => [row.gameRef, row.gameDateLocal, row.seasonStartYear]), targetIdentity,
      'cached losses preserve the exact chronological target identity');
    metricsByScreenAndVariant.set(`${screen.id}/${result.id}`, { resultKey: result.resultKey, metrics, losses });
  }
  return metricsByScreenAndVariant;
}

function assertRepeatedMetricsEqual(first, second, complete) {
  for (const screen of complete.screens) for (const result of screen.results) {
    const key = `${screen.id}/${result.id}`;
    assert.deepEqual(second.get(key), first.get(key), `${key} reuses the same result key and metric identity`);
  }
}

function readMeanForecasts(complete) {
  const meanStage = complete.completed.find(stage => stage.stage === 'mean-cache');
  assert.ok(meanStage, 'workflow records the mean-cache stage');
  const index = readJson(path.join(meanStage.outputDirectory, 'mean-index.json'));
  return new Map(index.results.map(item => [item.id, readJsonl(item.forecastFile)
    .filter(row => row.seasonStartYear === 2021)]));
}

function runPlanWithProgrammaticSignal(plan, signalName) {
  const baselineListenerCount = process.listenerCount(signalName);
  let signalCount = 0;
  let interval = null, timeout = null;
  const signalSent = new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      if (interval) clearInterval(interval);
      reject(new Error(`Timed out waiting for the ${signalName} screen-phase listener`));
    }, 30000);
    interval = setInterval(() => {
      if (process.listenerCount(signalName) <= baselineListenerCount) return;
      clearInterval(interval);
      interval = null;
      signalCount += 1;
      resolve({ emitted: process.emit(signalName), signalCount });
    }, 1);
  });
  // runPlan registers the handler immediately before starting screen workers; the timer
  // sees that registration after the child screen processes have been launched.
  const planOutcome = runPlan(plan, { baseDirectory: fixtureRoot })
    .then(value => ({ value }), error => ({ error }));
  return Promise.all([planOutcome, signalSent]).then(([outcome, emitted]) => {
    if (interval) clearInterval(interval);
    if (timeout) clearTimeout(timeout);
    return { outcome, emitted, baselineListenerCount };
  }, error => {
    if (interval) clearInterval(interval);
    if (timeout) clearTimeout(timeout);
    throw error;
  });
}

const serialPlan = makePlan('screen-orchestration-serial', 1, ordinaryConfigurations, 'serial');
const serialResult = await runPlan(serialPlan, { baseDirectory: fixtureRoot });
const serialComplete = readComplete(serialResult);
assert.deepEqual(serialComplete.screenOrchestration, {
  requestedMaxConcurrentScreens: 1,
  effectiveMaxConcurrentScreens: 1,
  mode: 'in-process',
});
assertScreenOrder(serialComplete, ordinaryConfigurations.map(item => item.id));
assert.equal(serialComplete.screens[0].execution.orchestration, 'in-process');
assert.equal(serialComplete.screens[0].cacheMisses, variantIds.length);
assert.equal(serialComplete.screens[0].cacheHits, 0);
assert.equal(serialComplete.screens[1].cacheMisses, variantIds.length);
assert.equal(serialComplete.screens[2].dispatchDeduplicated, true, 'duplicate configuration alias shares one screen dispatch');
assert.equal(serialComplete.screens[2].sharedScreenId, 'fixture-a');
const serialMeanStage = serialComplete.completed.find(stage => stage.stage === 'mean-cache');
assert.equal(serialMeanStage.resultKeys.length, ordinaryConfigurations.length);
assert.equal(serialMeanStage.resultKeys[0], serialMeanStage.resultKeys[2], 'duplicate configuration alias reuses its mean result key');
assert.notEqual(serialMeanStage.resultKeys[0], serialMeanStage.resultKeys[1], 'distinct mean settings have distinct result keys');
const serialMetrics = assertMetricArtifacts(serialPlan, serialComplete);
const serialForecasts = readMeanForecasts(serialComplete);
assert.deepEqual(serialForecasts.get('fixture-a'), serialForecasts.get('fixture-a-alias'));
assert.notDeepEqual(serialForecasts.get('fixture-a').map(row => row.prediction), serialForecasts.get('fixture-b').map(row => row.prediction),
  'the second configuration produces different target forecasts');

const parallelPlan = makePlan('screen-orchestration-parallel', 2, ordinaryConfigurations, 'parallel');
const parallelResult = await runPlan(parallelPlan, { baseDirectory: fixtureRoot });
const parallelComplete = readComplete(parallelResult);
assert.deepEqual(parallelComplete.screenOrchestration, {
  requestedMaxConcurrentScreens: 2,
  effectiveMaxConcurrentScreens: 2,
  mode: 'bounded-child-processes',
});
assertScreenOrder(parallelComplete, ordinaryConfigurations.map(item => item.id));
assert.equal(parallelComplete.screens[0].execution.orchestration, 'bounded-child-process');
assert.equal(parallelComplete.screens[0].execution.effectiveMaxConcurrentScreens, 2);
assert.equal(parallelComplete.screens[0].cacheMisses, variantIds.length);
assert.equal(parallelComplete.screens[0].cacheHits, 0);
assert.equal(parallelComplete.screens[1].cacheMisses, variantIds.length);
assert.equal(parallelComplete.screens[2].dispatchDeduplicated, true);
assert.deepEqual(resultKeyProjection(parallelComplete), resultKeyProjection(serialComplete),
  'serial and concurrent dispatch return identical ordered result keys');
const parallelMetrics = assertMetricArtifacts(parallelPlan, parallelComplete);
assertRepeatedMetricsEqual(serialMetrics, parallelMetrics, serialComplete);

const reusedResult = await runPlan(parallelPlan, { baseDirectory: fixtureRoot });
const reusedComplete = readComplete(reusedResult);
assertScreenOrder(reusedComplete, ordinaryConfigurations.map(item => item.id));
assert.deepEqual(resultKeyProjection(reusedComplete), resultKeyProjection(parallelComplete));
for (const screen of reusedComplete.screens) {
  assert.equal(screen.cacheHit, true, `${screen.id} marks a complete cache reuse`);
  assert.equal(screen.cacheHits, variantIds.length);
  assert.equal(screen.cacheMisses, 0);
}
const reusedMetrics = assertMetricArtifacts(parallelPlan, reusedComplete);
assertRepeatedMetricsEqual(parallelMetrics, reusedMetrics, reusedComplete);

const comparisonPlan = makePlan('screen-orchestration-comparison-fallback', 2, ordinaryConfigurations, 'comparison');
comparisonPlan.screen.comparison = { referenceId: variantIds[0], seed: 20261010, repetitions: 12, blockLengthDates: 1 };
const comparisonResult = await runPlan(comparisonPlan, { baseDirectory: fixtureRoot });
const comparisonComplete = readComplete(comparisonResult);
assert.deepEqual(comparisonComplete.screenOrchestration, {
  requestedMaxConcurrentScreens: 2,
  effectiveMaxConcurrentScreens: 1,
  mode: 'in-process',
}, 'comparison plans fall back to serial screens despite a concurrency request of two');
assertScreenOrder(comparisonComplete, ordinaryConfigurations.map(item => item.id));
for (const screen of comparisonComplete.screens) {
  assert.equal(screen.execution.orchestration, 'in-process');
  assert.equal(screen.execution.effectiveMaxConcurrentScreens, 1);
  const stage = comparisonComplete.completed.find(item => item.stage === 'uncertainty-screen' && item.id === screen.id);
  const screenIndex = readJson(path.join(stage.outputDirectory, 'screen-index.json'));
  assert.equal(screenIndex.comparison.referenceId, variantIds[0]);
  assert.equal(screenIndex.comparison.screenOnly, true);
  assert.equal(screenIndex.comparison.nDateClusters, 2);
  assert.equal(screenIndex.comparison.replicateCount, 12);
}
assert.deepEqual(resultKeyProjection(comparisonComplete), resultKeyProjection(serialComplete),
  'comparison orchestration leaves the candidate result keys unchanged');
const comparisonMetrics = assertMetricArtifacts(comparisonPlan, comparisonComplete);
assertRepeatedMetricsEqual(serialMetrics, comparisonMetrics, comparisonComplete);

const signalPlan = makePlan('screen-orchestration-programmatic-signal', 2, ordinaryConfigurations, 'programmatic-signal');
const listenerCountsBeforeSignal = {
  sigint: process.listenerCount('SIGINT'),
  sigterm: process.listenerCount('SIGTERM'),
  exit: process.listenerCount('exit'),
};
const { outcome: signalOutcome, emitted: signalEmission } = await runPlanWithProgrammaticSignal(signalPlan, 'SIGTERM');
assert.ok(signalOutcome.error, 'one programmatic signal interrupts the workflow after screen tasks drain');
assert.equal(signalEmission.signalCount, 1, 'exactly one programmatic signal event is emitted');
assert.equal(signalEmission.emitted, true, 'runPlan owns the emitted SIGTERM event during the screen phase');
assert.deepEqual({
  sigint: process.listenerCount('SIGINT'),
  sigterm: process.listenerCount('SIGTERM'),
  exit: process.listenerCount('exit'),
}, listenerCountsBeforeSignal, 'runPlan removes its temporary process listeners after the drain');
const signalOutputRoot = path.resolve(fixtureRoot, signalPlan.outputDirectory);
const signalInvocations = fs.readdirSync(signalOutputRoot)
  .map(name => path.join(signalOutputRoot, name))
  .filter(directory => fs.existsSync(path.join(directory, 'interrupted.json')));
assert.equal(signalInvocations.length, 1, 'single signal writes an interrupted receipt after screens drain');
const signalReceiptPath = path.join(signalInvocations[0], 'interrupted.json');
const signalReceipt = readJson(signalReceiptPath);
assert.equal(signalReceipt.signal, 'SIGTERM');
assert.match(signalReceipt.error, /active screens drained/);
assert.deepEqual(signalReceipt.screenFailures, []);
const drainedScreens = signalReceipt.completed.filter(stage => stage.stage === 'uncertainty-screen');
assert.deepEqual(drainedScreens.map(stage => stage.id), ordinaryConfigurations.map(item => item.id),
  'all active child screens complete in deterministic plan order before interruption is recorded');
for (const stage of drainedScreens) {
  const screenIndexPath = path.join(stage.outputDirectory, 'screen-index.json');
  assert.ok(fs.existsSync(screenIndexPath), `${stage.id} child wrote its completion index before the drain receipt`);
  assert.deepEqual(readJson(screenIndexPath).results.map(row => row.id), variantIds);
}
assert.equal(fs.existsSync(path.join(signalInvocations[0], 'complete.json')), false,
  'single-signal drain writes interrupted.json without a success receipt');

const failurePlan = makePlan('screen-orchestration-failure', 2, [
  { id: 'fixture-good', configuration: './configuration-a.json' },
  { id: 'fixture-screen-fails', configuration: './configuration-b-screen-failure.json' },
], 'failure');
let failure;
await assert.rejects(runPlan(failurePlan, { baseDirectory: fixtureRoot }), error => {
  failure = error;
  assert.match(error.message, /Unknown uncertainty setting/);
  return true;
});
const failureOutputRoot = path.resolve(fixtureRoot, failurePlan.outputDirectory);
const interruptedInvocations = fs.readdirSync(failureOutputRoot)
  .map(name => path.join(failureOutputRoot, name))
  .filter(directory => fs.existsSync(path.join(directory, 'interrupted.json')));
assert.equal(interruptedInvocations.length, 1, 'failed workflow writes one interrupted receipt');
const interruptedPath = path.join(interruptedInvocations[0], 'interrupted.json');
const interrupted = readJson(interruptedPath);
assert.equal(interrupted.failedStage.stage, 'uncertainty-screen');
assert.equal(interrupted.failedStage.id, 'fixture-screen-fails');
assert.equal(interrupted.failedStage.status, 'failed');
assert.match(interrupted.error, /Unknown uncertainty setting/);
assert.deepEqual(interrupted.screenFailures.map(stage => stage.id), ['fixture-screen-fails']);
const completedScreens = interrupted.completed.filter(stage => stage.stage === 'uncertainty-screen');
assert.deepEqual(completedScreens.map(stage => stage.id), ['fixture-good'], 'successful sibling screen is recorded after its peer fails');
assert.ok(fs.existsSync(path.join(completedScreens[0].outputDirectory, 'screen-index.json')),
  'successful sibling screen output is complete before the interrupted receipt is finalized');
assert.equal(fs.existsSync(path.join(interruptedInvocations[0], 'complete.json')), false,
  'failed workflow does not write a success completion receipt');

console.log(JSON.stringify({
  status: 'passed',
  fixtureRoot,
  serialOutputDirectory: serialResult.outputDirectory,
  parallelOutputDirectory: parallelResult.outputDirectory,
  reusedOutputDirectory: reusedResult.outputDirectory,
  comparisonOutputDirectory: comparisonResult.outputDirectory,
  signalInterruptedReceipt: signalReceiptPath,
  interruptedReceipt: interruptedPath,
  targetGames: targetRows.length,
  configurationIds: ordinaryConfigurations.map(item => item.id),
  serialOrchestration: serialComplete.screenOrchestration,
  parallelOrchestration: parallelComplete.screenOrchestration,
  comparisonFallback: comparisonComplete.screenOrchestration,
  signalDelivery: 'programmatic process.emit(SIGTERM); no operating-system signal sent',
  signalDrainedScreens: drainedScreens.map(stage => stage.id),
  duplicateAliasResultKeys: serialComplete.screens[2].results.map(row => row.resultKey),
  repeatedCacheHits: reusedComplete.screens.map(screen => screen.cacheHits),
  completedSiblingOnFailure: completedScreens[0].id,
}, null, 2));
