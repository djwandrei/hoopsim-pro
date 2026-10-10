import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readJson, writeJson, hash } from './lib/artifacts.mjs';
import { runMeans } from './run-means.mjs';
import { runScreen } from './run-screen.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { composeForecasts } from './compose-forecasts.mjs';
import { runFeatureExtensionPlan } from './extend-features.mjs';

function startStageTiming() {
  return {
    startedAt: new Date().toISOString(),
    monotonicStart: process.hrtime.bigint(),
    cpuStart: process.cpuUsage(),
  };
}

function finishStageTiming(start) {
  const elapsedNanoseconds = process.hrtime.bigint() - start.monotonicStart;
  const cpu = process.cpuUsage(start.cpuStart);
  const totalMicros = cpu.user + cpu.system;
  return {
    format: 'swishiq-experiment-workflow-stage-timing-v1',
    clock: 'process.hrtime.bigint',
    startedAt: start.startedAt,
    monotonicElapsedNanoseconds: elapsedNanoseconds.toString(),
    elapsedMs: Number(elapsedNanoseconds) / 1e6,
    processCpu: {
      source: 'process.cpuUsage',
      userMicros: cpu.user,
      systemMicros: cpu.system,
      totalMicros,
      totalMs: totalMicros / 1000,
    },
  };
}

function safeStageId(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '_') + '-' + hash(String(value)).slice(0, 8);
}

function runScreenChild(screenPlanFile, baseDirectory, children) {
  const script = path.join(import.meta.dirname, 'run-screen.mjs');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, screenPlanFile, '--base-directory', baseDirectory], {
      cwd: baseDirectory,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.add(child);
    const maxCapture = 64 * 1024;
    let stdout = '', stderr = '';
    const append = (current, chunk) => (current + chunk.toString()).slice(-maxCapture);
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      children.delete(child);
      if (code !== 0) {
        reject(new Error(`Screen child failed (code=${code}, signal=${signal ?? 'none'}): ${stderr.trim() || stdout.trim()}`));
        return;
      }
      try {
        const lastLine = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        const result = JSON.parse(lastLine ?? '');
        if (typeof result.outputDirectory !== 'string' || !result.outputDirectory) {
          throw Error('Screen child did not return an output directory');
        }
        resolve(result);
      } catch (error) {
        reject(new Error(`Screen child returned invalid output: ${error.message}; stderr=${stderr.trim()}`));
      }
    });
  });
}

export async function runPlan(plan, { baseDirectory = process.cwd() } = {}) {
  if (plan.format !== 'swishiq-experiment-plan-v1' || !plan.means || !plan.screen
    || !Array.isArray(plan.means.configurations)) throw Error('Mean and screen stages are required');
  const requestedScreenConcurrency = plan.maxConcurrentScreens ?? 1;
  if (!Number.isSafeInteger(requestedScreenConcurrency) || requestedScreenConcurrency < 1 || requestedScreenConcurrency > 2) {
    throw Error('maxConcurrentScreens must be 1 or 2');
  }
  if (plan.means.configurations.some(config => config.resumeCheckpoint && (!config.resumePrefix?.forecasts
    || !config.resumePrefix?.manifest || !config.resumeManifest))) throw Error('Resumed pipeline runs require resumePrefix forecasts/manifest and the checkpoint resumeManifest');
  const output = assertDiagnosticOutput(path.resolve(baseDirectory, plan.outputDirectory ?? '../runs/plans'));
  fs.mkdirSync(output, { recursive: true });
  const invocation = path.join(output, 'run-' + Date.now() + '-' + process.pid); fs.mkdirSync(invocation);
  writeJson(path.join(invocation, 'plan.json'), plan);
  const completed = [], screens = [];
  const children = new Set();
  let interruptedSignal = null;
  const stopChildren = () => { for (const child of children) child.kill(); };
  const onInterrupt = signal => {
    if (interruptedSignal) stopChildren();
    interruptedSignal ??= signal;
  };
  const onSigint = () => onInterrupt('SIGINT'), onSigterm = () => onInterrupt('SIGTERM');
  const checkInterrupted = () => {
    if (interruptedSignal) {
      const error = new Error('Experiment interrupted by ' + interruptedSignal + '; active screens drained');
      error.signal = interruptedSignal;
      throw error;
    }
  };
  process.on('exit', stopChildren);
  let failedStage = null;
  const measureStage = async (descriptor, action) => {
    const start = startStageTiming();
    failedStage = { ...descriptor, status: 'running', startedAt: start.startedAt };
    try {
      const value = await action();
      const timing = finishStageTiming(start);
      failedStage = null;
      return { value, timing };
    } catch (error) {
      failedStage = { ...failedStage, status: 'failed', timing: finishStageTiming(start) };
      throw error;
    }
  };
  try {
    let meanPlan = plan.means;
    if (plan.featureExtension) {
      const measured = await measureStage({ stage: 'feature-extension' },
        () => runFeatureExtensionPlan(plan.featureExtension, { baseDirectory }));
      const extension = measured.value;
      meanPlan = { ...meanPlan, features: extension.featureRowsFile, sourceManifest: extension.receiptFile,
        sourcePathMap: extension.sourcePathMap };
      const stage = { stage: 'feature-extension', outputDirectory: extension.outputDirectory,
        resultKey: extension.cacheKey, featureRowsFile: extension.featureRowsFile, sourceManifest: extension.receiptFile,
        timing: measured.timing };
      completed.push(stage); writeJson(path.join(invocation, 'feature-stage.json'), stage);
      checkInterrupted();
    }
    const meanRun = await measureStage({ stage: 'mean-cache' }, () => runMeans(meanPlan, { baseDirectory }));
    const means = meanRun.value;
    completed.push({ stage: 'mean-cache', outputDirectory: means.outputDirectory,
      resultKeys: means.results.map(result => result.resultKey), timing: meanRun.timing });
    writeJson(path.join(invocation, 'mean-stage.json'), completed.at(-1));
    checkInterrupted();
    const screenTasks = [];
    // In-screen comparisons share a resampling cache key across candidates.
    // Keep that workload serial until its lock/reuse path supports contention.
    const useScreenChildProcesses = requestedScreenConcurrency > 1 && means.results.length > 1
      && !plan.screen.comparison;
    for (const [index, item] of means.results.entries()) {
      const config = plan.means.configurations.find(configuration => configuration.id === item.id);
      let forecasts = item.forecastFile, sourceManifest = path.join(item.directory, 'receipt.json');
      if (config.resumeCheckpoint) {
        const compositionRun = await measureStage({ stage: 'forecast-composition', id: item.id }, () => composeForecasts({
          format: 'swishiq-compose-forecasts-plan-v1', prefix: config.resumePrefix,
          resumed: { forecasts, manifest: sourceManifest }, checkpoint: { path: config.resumeCheckpoint, manifest: config.resumeManifest },
          outputDirectory: plan.compositionOutputDirectory ?? '../runs/composed-forecasts' }, { baseDirectory }));
        const composition = compositionRun.value;
        forecasts = composition.forecastFile; sourceManifest = composition.manifestFile;
        completed.push({ stage: 'forecast-composition', id: item.id, outputDirectory: composition.outputDirectory,
          resultKey: composition.resultKey, timing: compositionRun.timing });
        writeJson(path.join(invocation, 'composition-stage-' + safeStageId(item.id) + '.json'), completed.at(-1));
        checkInterrupted();
      }
      const screen = { ...plan.screen, format: 'swishiq-uncertainty-screen-plan-v1',
        forecasts, sourceManifest, configuration: config.configuration,
        ...(useScreenChildProcesses ? { maxWorkers: 1 } : {}) };
      const screenPlanFile = path.join(invocation, 'screen-plan-' + safeStageId(item.id) + '.json');
      screenTasks.push({ index, id: item.id, screen, screenPlanFile });
      writeJson(screenPlanFile, screen);
    }

    const taskGroups = new Map();
    for (const task of screenTasks) {
      const key = hash(task.screen);
      if (!taskGroups.has(key)) taskGroups.set(key, { ...task, aliases: [] });
      taskGroups.get(key).aliases.push(task);
    }
    const uniqueScreenTasks = [...taskGroups.values()];
    const effectiveScreenConcurrency = useScreenChildProcesses
      ? Math.min(requestedScreenConcurrency, uniqueScreenTasks.length) : 1;
    const outcomes = new Array(screenTasks.length);
    let nextScreenTask = 0;
    let firstScreenFailure = null;
    const executeScreen = async task => {
      const start = startStageTiming();
      try {
        let result;
        if (useScreenChildProcesses) {
          const childSummary = await runScreenChild(task.screenPlanFile, baseDirectory, children);
          const outputDirectory = assertDiagnosticOutput(path.resolve(childSummary.outputDirectory));
          const report = readJson(path.join(outputDirectory, 'screen-index.json'));
          if (report.format !== 'swishiq-batched-uncertainty-screen-v1'
              || report.planSha256 !== hash(task.screen)
              || hash(report.results.map(row => row.id)) !== hash(task.screen.variants.map(row => row.id))
              || report.expectedTargets !== childSummary.targetGames
              || report.results.length !== childSummary.variants) {
            throw Error('Screen child receipt does not match its completion summary');
          }
          result = { ...report, outputDirectory };
        } else {
          result = await runScreen(task.screen, { baseDirectory });
        }
        const timing = finishStageTiming(start);
        const screenResults = result.results.map(row => ({ id: row.id, resultKey: row.resultKey, cacheHit: row.cacheHit }));
        const cacheHits = screenResults.filter(row => row.cacheHit).length;
        const summary = { id: task.id, expectedTargets: result.expectedTargets,
          targetIdentitySha256: result.chronology.targetIdentitySha256,
          cacheHit: screenResults.length > 0 && cacheHits === screenResults.length,
          cacheHits, cacheMisses: screenResults.length - cacheHits, results: screenResults,
          execution: { ...result.execution,
            orchestration: useScreenChildProcesses ? 'bounded-child-process' : 'in-process',
            requestedMaxConcurrentScreens: requestedScreenConcurrency,
            effectiveMaxConcurrentScreens: effectiveScreenConcurrency } };
        const stage = { stage: 'uncertainty-screen', ...summary, outputDirectory: result.outputDirectory,
          resultKeys: result.results.map(row => row.resultKey), screenPlanFile: task.screenPlanFile, timing };
        return { summary, stage };
      } catch (error) {
        return { error, failedStage: { stage: 'uncertainty-screen', id: task.id,
          status: 'failed', timing: finishStageTiming(start) } };
      }
    };
    const screenWorker = async () => {
      while (!firstScreenFailure && !interruptedSignal) {
        const index = nextScreenTask++;
        if (index >= uniqueScreenTasks.length) return;
        const task = uniqueScreenTasks[index];
        const outcome = await executeScreen(task);
        for (const [aliasIndex, alias] of task.aliases.entries()) {
          if (outcome.stage) {
            const summary = { ...outcome.summary, id: alias.id,
              dispatchDeduplicated: aliasIndex > 0, sharedScreenId: task.id };
            const stage = { ...outcome.stage, ...summary, screenPlanFile: alias.screenPlanFile };
            outcomes[alias.index] = { summary, stage };
            try {
              writeJson(path.join(invocation, 'screen-stage-' + safeStageId(alias.id) + '.json'), stage);
            } catch (error) {
              outcomes[alias.index].error = error;
              outcomes[alias.index].failedStage = { stage: 'uncertainty-screen-receipt', id: alias.id, status: 'failed' };
            }
          } else outcomes[alias.index] = { ...outcome,
            failedStage: { ...outcome.failedStage, id: alias.id } };
        }
        const taskFailure = task.aliases.map(alias => outcomes[alias.index]).find(result => result.error);
        if (taskFailure && !firstScreenFailure) {
          firstScreenFailure = { index, error: taskFailure.error, failedStage: taskFailure.failedStage };
        }
      }
    };
    // Own signal handling only while external screen processes can exist.
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
    await Promise.all(Array.from({ length: effectiveScreenConcurrency }, () => screenWorker()));
    for (const outcome of outcomes) {
      if (!outcome?.stage) continue;
      screens.push(outcome.summary);
      completed.push(outcome.stage);
    }
    if (firstScreenFailure) {
      const primaryFailure = outcomes.find(outcome => outcome?.error);
      failedStage = primaryFailure.failedStage;
      const failures = outcomes.filter(outcome => outcome?.error).map(outcome => outcome.failedStage);
      primaryFailure.error.screenFailures = failures;
      throw primaryFailure.error;
    }
    checkInterrupted();
    const targetCounts = [...new Set(screens.map(screen => screen.expectedTargets))];
    const targetIdentities = new Set(screens.map(screen => screen.targetIdentitySha256));
    if (targetCounts.length !== 1 || targetIdentities.size !== 1) {
      throw Error('Candidate screens must cover identical target games');
    }
    const expectedTargets = targetCounts.length === 1 ? targetCounts[0] : null;
    writeJson(path.join(invocation, 'complete.json'), { format: 'swishiq-experiment-plan-complete-v1', planSha256: hash(plan), completed,
      expectedTargets, screens,
      screenOrchestration: { requestedMaxConcurrentScreens: requestedScreenConcurrency,
        effectiveMaxConcurrentScreens: effectiveScreenConcurrency,
        mode: useScreenChildProcesses ? 'bounded-child-processes' : 'in-process' },
      status: 'development-screen-only', promotionAllowed: false, canonicalFinalStage: 'not-run' });
    return { outputDirectory: invocation, completedStages: completed.length, expectedTargets, screens,
      screenOrchestration: { requestedMaxConcurrentScreens: requestedScreenConcurrency,
        effectiveMaxConcurrentScreens: effectiveScreenConcurrency,
        mode: useScreenChildProcesses ? 'bounded-child-processes' : 'in-process' } };
  } catch (error) {
    writeJson(path.join(invocation, 'interrupted.json'), { planSha256: hash(plan), completed,
      failedStage, error: error.message, signal: interruptedSignal,
      screenFailures: error.screenFailures ?? [],
      resume: 'Rerun the same plan. Matching complete cache stages are verified and reused. Partial cache directories remain for diagnosis.' });
    throw error;
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('exit', stopChildren);
    stopChildren();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log('Usage: node run-plan.mjs <experiment-plan.json>\nRuns isolated mean + screen stages; completed hash-matching stages are reusable after interruption. Set maxConcurrentScreens to 2 for bounded screen processes.');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  const planFile = path.resolve(process.argv[2]);
  console.log(JSON.stringify(await runPlan(readJson(planFile), { baseDirectory: path.dirname(planFile) })));
}
