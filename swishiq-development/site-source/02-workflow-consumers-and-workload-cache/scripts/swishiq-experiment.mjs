import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadPinnedJson, readJson, writeJson, hash } from '../prototypes/swishiq-package-v4/experiment-tools/lib/artifacts.mjs';
import { assertDiagnosticOutput } from '../prototypes/swishiq-package-v4/experiment-tools/lib/output.mjs';
import { runPlan } from '../prototypes/swishiq-package-v4/experiment-tools/run-plan.mjs';
import { runMeans } from '../prototypes/swishiq-package-v4/experiment-tools/run-means.mjs';
import { runScreen } from '../prototypes/swishiq-package-v4/experiment-tools/run-screen.mjs';
import { runInference } from '../prototypes/swishiq-package-v4/experiment-tools/run-inference.mjs';
import { compareMeanScreens } from '../prototypes/swishiq-package-v4/experiment-tools/compare-mean-screens.mjs';

const root = path.resolve(import.meta.dirname, '..');
const runsRoot = path.join(root, 'prototypes/swishiq-package-v4/experiment-tools/runs/workflow');
const executors = new Map([
  ['swishiq-experiment-plan-v1', runPlan],
  ['swishiq-mean-batch-plan-v1', runMeans],
  ['swishiq-uncertainty-screen-plan-v1', runScreen],
  ['swishiq-canonical-inference-plan-v1', runInference],
  ['swishiq-cross-mean-screen-comparison-plan-v1', compareMeanScreens],
]);

function candidate100Recent(plan, baseDirectory) {
  const mean = plan.means ?? (plan.format === 'swishiq-mean-batch-plan-v1' ? plan : null);
  if (!mean || mean.warmupSeasonStartYear !== 2020 || mean.throughSeasonStartYear !== 2025
    || !Array.isArray(mean.configurations) || !mean.configurations.length) return false;
  return mean.configurations.every(item => {
    const config = readJson(path.resolve(baseDirectory, item.configuration));
    return /candidate100/i.test(config.version ?? '') && Array.isArray(config.totalFeatureNames)
      && Array.isArray(config.marginFeatureNames);
  });
}

export function prepareExperiment(planFile) {
  const source = loadPinnedJson(path.resolve(planFile));
  const baseDirectory = path.dirname(source.inputPin.path);
  if (!executors.has(source.value.format)) throw Error('Unsupported experiment plan format: ' + source.value.format);
  const plan = structuredClone(source.value);
  const measuredProfile = candidate100Recent(plan, baseDirectory);
  const means = plan.means ?? (plan.format === 'swishiq-mean-batch-plan-v1' ? plan : null);
  const screen = plan.screen ?? (plan.format === 'swishiq-uncertainty-screen-plan-v1' ? plan : null);
  if (means) means.maxWorkers ??= measuredProfile ? 4 : 1;
  if (screen) screen.maxWorkers ??= measuredProfile ? 3 : 1;
  return { sourcePlan: source.inputPin, baseDirectory, plan,
    effectivePlanSha256: hash(plan), workerProfile: measuredProfile ? 'candidate100-2020-warmup-2021-26' : 'serial-unmeasured',
    defaults: { means: means?.maxWorkers ?? null, screen: screen?.maxWorkers ?? null } };
}

function ownedReceipt(location) {
  const absolute = assertDiagnosticOutput(path.resolve(location));
  const file = fs.statSync(absolute).isDirectory() ? path.join(absolute, 'workflow.json') : absolute;
  let receipt = readJson(file);
  if (receipt.format !== 'swishiq-development-workflow-v1') throw Error('Expected a development workflow receipt');
  const terminal = path.join(path.dirname(file), 'terminal.json');
  if (fs.existsSync(terminal)) {
    const completed = readJson(terminal);
    if (completed.format !== receipt.format || hash(completed.sourcePlan) !== hash(receipt.sourcePlan)
      || completed.effectivePlanSha256 !== receipt.effectivePlanSha256) throw Error('Terminal workflow identity changed');
    receipt = completed;
  }
  return { file, receipt };
}

export function workflowStatus(location) {
  const { file, receipt } = ownedReceipt(location);
  let status = receipt.status;
  if (status === 'running') {
    try { process.kill(receipt.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') status = 'interrupted-before-final-receipt'; else throw error; }
  }
  return { receiptFile: file, status, sourcePlan: receipt.sourcePlan.path,
    workerProfile: receipt.workerProfile, outputDirectory: receipt.result?.outputDirectory ?? null,
    error: receipt.error ?? null, artifactVerification: 'performed by stage executors on run/resume' };
}

export async function executeExperiment(planFile, { resumeFrom = null } = {}) {
  const prepared = prepareExperiment(planFile);
  if (resumeFrom) {
    const prior = ownedReceipt(resumeFrom).receipt;
    if (prior.status === 'running') {
      const status = workflowStatus(resumeFrom).status;
      if (status === 'running') throw Error('The prior workflow process is still running');
    }
    if (hash(prior.sourcePlan) !== hash(prepared.sourcePlan)
      || prior.effectivePlanSha256 !== prepared.effectivePlanSha256) throw Error('Resume plan bytes or effective settings changed');
  }
  fs.mkdirSync(runsRoot, { recursive: true });
  const directory = assertDiagnosticOutput(path.join(runsRoot, 'run-' + Date.now() + '-' + randomUUID()));
  fs.mkdirSync(directory);
  const file = path.join(directory, 'workflow.json');
  const receipt = { format: 'swishiq-development-workflow-v1', status: 'running', pid: process.pid,
    startedAt: new Date().toISOString(), ...prepared, resumeFrom,
    evidenceScope: 'development-only', promotionAllowed: false };
  writeJson(file, receipt);
  const started = process.hrtime.bigint();
  try {
    const result = await executors.get(prepared.plan.format)(prepared.plan, {
      baseDirectory: prepared.baseDirectory, planPin: prepared.sourcePlan,
    });
    Object.assign(receipt, { status: 'complete', completedAt: new Date().toISOString(),
      elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
      result: { outputDirectory: result.outputDirectory, completedStages: result.completedStages ?? null,
        targetGames: result.expectedTargets ?? null, results: result.results?.map(item => ({
          id: item.id, key: item.resultKey, cacheHit: item.cacheHit,
        })) ?? null } });
    writeJson(path.join(directory, 'terminal.json'), receipt);
    return { receiptFile: file, ...receipt.result };
  } catch (error) {
    Object.assign(receipt, { status: 'failed', completedAt: new Date().toISOString(), error: error.message });
    if (!fs.existsSync(path.join(directory, 'terminal.json'))) writeJson(path.join(directory, 'terminal.json'), receipt);
    throw new Error(error.message + '\nWorkflow receipt: ' + file, { cause: error });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, input] = process.argv.slice(2);
  if (!command || command === '--help') {
    console.log('Usage: node scripts/swishiq-experiment.mjs prepare|run|compare <plan.json>\n       node scripts/swishiq-experiment.mjs status|resume <workflow-directory>\nUses the existing pinned mean, uncertainty, comparison and inference caches. Outputs stay diagnostic.');
    process.exit(command ? 0 : 1);
  }
  if (!input) throw Error('A plan or workflow path is required');
  let result;
  if (command === 'prepare') result = prepareExperiment(input);
  else if (command === 'status') result = workflowStatus(input);
  else if (command === 'resume') {
    const prior = ownedReceipt(input).receipt;
    result = await executeExperiment(prior.sourcePlan.path, { resumeFrom: input });
  } else if (command === 'run' || command === 'compare') {
    if (command === 'compare' && readJson(path.resolve(input)).format !== 'swishiq-cross-mean-screen-comparison-plan-v1') {
      throw Error('compare requires a cross-mean comparison plan');
    }
    result = await executeExperiment(input);
  } else throw Error('Unknown workflow command: ' + command);
  console.log(JSON.stringify(result));
}
