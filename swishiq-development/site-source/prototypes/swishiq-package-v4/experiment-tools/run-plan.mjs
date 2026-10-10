import fs from 'node:fs';
import path from 'node:path';
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

export async function runPlan(plan, { baseDirectory = process.cwd() } = {}) {
  if (plan.format !== 'swishiq-experiment-plan-v1' || !plan.means || !plan.screen
    || !Array.isArray(plan.means.configurations)) throw Error('Mean and screen stages are required');
  if (plan.means.configurations.some(config => config.resumeCheckpoint && (!config.resumePrefix?.forecasts
    || !config.resumePrefix?.manifest || !config.resumeManifest))) throw Error('Resumed pipeline runs require resumePrefix forecasts/manifest and the checkpoint resumeManifest');
  const output = assertDiagnosticOutput(path.resolve(baseDirectory, plan.outputDirectory ?? '../runs/plans'));
  fs.mkdirSync(output, { recursive: true });
  const invocation = path.join(output, 'run-' + Date.now() + '-' + process.pid); fs.mkdirSync(invocation);
  writeJson(path.join(invocation, 'plan.json'), plan);
  const completed = [];
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
    }
    const meanRun = await measureStage({ stage: 'mean-cache' }, () => runMeans(meanPlan, { baseDirectory }));
    const means = meanRun.value;
    completed.push({ stage: 'mean-cache', outputDirectory: means.outputDirectory,
      resultKeys: means.results.map(result => result.resultKey), timing: meanRun.timing });
    writeJson(path.join(invocation, 'mean-stage.json'), completed.at(-1));
    for (const item of means.results) {
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
        writeJson(path.join(invocation, 'composition-stage-' + item.id + '.json'), completed.at(-1));
      }
      const screen = { ...plan.screen, format: 'swishiq-uncertainty-screen-plan-v1',
        forecasts, sourceManifest, configuration: config.configuration };
      const screenRun = await measureStage({ stage: 'uncertainty-screen', id: item.id },
        () => runScreen(screen, { baseDirectory }));
      const result = screenRun.value;
      const stage = { stage: 'uncertainty-screen', id: item.id, outputDirectory: result.outputDirectory,
        resultKeys: result.results.map(row => row.resultKey), timing: screenRun.timing };
      completed.push(stage); writeJson(path.join(invocation, 'screen-stage-' + item.id + '.json'), stage);
    }
    writeJson(path.join(invocation, 'complete.json'), { format: 'swishiq-experiment-plan-complete-v1', planSha256: hash(plan), completed,
      status: 'development-screen-only', promotionAllowed: false, canonicalFinalStage: 'not-run' });
    return { outputDirectory: invocation, completedStages: completed.length };
  } catch (error) {
    writeJson(path.join(invocation, 'interrupted.json'), { planSha256: hash(plan), completed,
      failedStage, error: error.message,
      resume: 'Rerun the same plan. Matching complete cache stages are verified and reused. Partial cache directories remain for diagnosis.' });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log('Usage: node run-plan.mjs <experiment-plan.json>\nRuns isolated mean + screen stages; completed hash-matching stages are reusable after interruption.');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  const planFile = path.resolve(process.argv[2]);
  console.log(JSON.stringify(await runPlan(readJson(planFile), { baseDirectory: path.dirname(planFile) })));
}
