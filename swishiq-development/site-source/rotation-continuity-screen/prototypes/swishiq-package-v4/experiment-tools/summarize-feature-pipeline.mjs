import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  atomicWrite,
  hash,
  loadPinnedJson,
  pin,
  writeJson,
} from './lib/artifacts.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { compareMeanScreens, CROSS_MEAN_PLAN_FORMAT } from './compare-mean-screens.mjs';

export const FEATURE_PIPELINE_SUMMARY_FORMAT = 'swishiq-feature-pipeline-summary-v1';
export const FEATURE_PIPELINE_COMPARISON = Object.freeze({ seed: 20261010, repetitions: 1000, blockLengthDates: 7 });
export const FEATURE_PIPELINE_COVERAGE = Object.freeze({
  targetSeasonStartYears: Object.freeze([2022, 2023, 2024, 2025]),
  expectedTargets: 4920,
  perSeason: Object.freeze({ '2022': 1230, '2023': 1230, '2024': 1230, '2025': 1230 }),
});

const toolsRoot = import.meta.dirname;
const runsRoot = path.resolve(toolsRoot, 'runs');
const RESULT_ID = 'configured-canonical';
const METRICS = ['brier', 'logLoss', 'rawTotalMae', 'rawMarginMae'];

function fail(message) {
  throw new TypeError(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertWithin(root, location, label) {
  const relative = path.relative(root, location);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`${label} escapes ${root}`);
}

function assertPinEqual(actual, expected, label) {
  if (!isRecord(expected) || actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    fail(`${label} no longer matches its recorded byte/hash pin`);
  }
}

function resolveInput(file, baseDirectory = process.cwd()) {
  return path.resolve(baseDirectory, file);
}

function resolvePinnedDescriptor(descriptor, label) {
  if (!isRecord(descriptor) || typeof descriptor.path !== 'string' || !descriptor.path.length
    || !Number.isSafeInteger(descriptor.bytes) || typeof descriptor.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/i.test(descriptor.sha256)) fail(`${label} has an invalid file pin`);
  const file = path.resolve(descriptor.path);
  assertPinEqual(pin(file), descriptor, label);
  return file;
}

function loadWorkflowSnapshot(directory, label) {
  const absolute = path.resolve(directory);
  assertWithin(runsRoot, absolute, `${label} workflow directory`);
  const workflowFile = path.join(absolute, 'workflow.json');
  const terminalFile = path.join(absolute, 'terminal.json');
  const workflowLoaded = loadPinnedJson(workflowFile);
  const terminalLoaded = loadPinnedJson(terminalFile);
  const workflow = workflowLoaded.value;
  const terminal = terminalLoaded.value;
  if (workflow.format !== 'swishiq-development-workflow-v1'
    || terminal.format !== workflow.format
    || !['running', 'complete'].includes(workflow.status)
    || terminal.status !== 'complete') fail(`${label} needs matching workflow/terminal snapshots with a completed terminal state`);
  for (const field of ['pid', 'startedAt', 'baseDirectory']) {
    if (workflow[field] !== terminal[field]) fail(`${label} workflow and terminal snapshots disagree on ${field}`);
  }
  if (hash(workflow.sourcePlan) !== hash(terminal.sourcePlan) || hash(workflow.plan) !== hash(terminal.plan)) {
    fail(`${label} workflow and terminal snapshots do not describe the same pinned plan`);
  }
  const sourcePlanPath = resolvePinnedDescriptor(terminal.sourcePlan, `${label} source plan`);
  const sourcePlanLoaded = loadPinnedJson(sourcePlanPath);
  assertPinEqual(sourcePlanLoaded.inputPin, terminal.sourcePlan, `${label} source plan`);
  if (!isRecord(terminal.plan) || hash(sourcePlanLoaded.value) !== hash(terminal.plan)) {
    fail(`${label} workflow snapshot does not match its pinned source plan`);
  }
  if (!isRecord(terminal.result) || typeof terminal.result.outputDirectory !== 'string') {
    fail(`${label} terminal snapshot has no result output directory`);
  }
  return {
    directory: absolute,
    workflow,
    terminal,
    pins: {
      workflow: workflowLoaded.inputPin,
      terminal: terminalLoaded.inputPin,
      sourcePlan: sourcePlanLoaded.inputPin,
    },
  };
}

function requireCanonicalScreenPlan(plan, label) {
  const screen = plan?.screen ?? plan;
  const years = screen?.targetSeasonStartYears;
  if (!Array.isArray(years) || hash(years) !== hash(FEATURE_PIPELINE_COVERAGE.targetSeasonStartYears)
    || !Array.isArray(screen.fullReceiptIds) || !screen.fullReceiptIds.includes(RESULT_ID)
    || !Array.isArray(screen.variants)
    || !screen.variants.some(variant => variant?.id === RESULT_ID && variant.forceCanonical === true)) {
    fail(`${label} plan does not request the configured-canonical full screen for 2022-2025`);
  }
}

function assertPreparation(preparation, preparationPath) {
  if (!isRecord(preparation) || preparation.format !== 'swishiq-candidate100-hustle-individual-screen-v1'
    || preparation.status !== 'prepared' || !Array.isArray(preparation.cases) || !preparation.cases.length) {
    fail('Preparation file is not a completed hustle individual-screen preparation receipt');
  }
  const adapterPath = resolvePinnedDescriptor(preparation.adapterPin, 'Preparation adapter');
  if (typeof preparation.pipelineFile !== 'string' || !preparation.pipelineFile.length) {
    fail('Preparation file has no pipelineFile');
  }
  const pipelinePlanPath = resolveInput(preparation.pipelineFile, path.dirname(preparationPath));
  const loadedPipelinePlan = loadPinnedJson(pipelinePlanPath);
  const ids = new Set();
  for (const item of preparation.cases) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.length
      || !['total', 'margin'].includes(item.head) || typeof item.metric !== 'string' || !item.metric.length
      || ids.has(item.id)) fail('Preparation cases need unique ids and a supported total/margin head');
    ids.add(item.id);
  }
  if (typeof preparation.baselinePlanFile !== 'string' || !preparation.baselinePlanFile.length) {
    fail('Preparation file has no baselinePlanFile');
  }
  const baselinePlanPath = resolveInput(preparation.baselinePlanFile, path.dirname(preparationPath));
  const loadedPlan = loadPinnedJson(baselinePlanPath);
  return {
    cases: preparation.cases,
    adapterPin: preparation.adapterPin,
    adapterPath,
    pipelinePlanPath,
    pipelinePlanPin: loadedPipelinePlan.inputPin,
    pipelinePlan: loadedPipelinePlan.value,
    baselinePlanPath,
    baselinePlanPin: loadedPlan.inputPin,
    baselinePlan: loadedPlan.value,
  };
}

function getBaselineScreenIndex(baseline, prep) {
  if (baseline.terminal.plan?.format !== 'swishiq-uncertainty-screen-plan-v1') {
    fail('Baseline workflow must point to the standalone uncertainty screen plan');
  }
  requireCanonicalScreenPlan(baseline.terminal.plan, 'Baseline');
  assertPinEqual(baseline.pins.sourcePlan, prep.baselinePlanPin, 'Preparation baseline plan');
  const result = baseline.terminal.result;
  if (result.targetGames !== FEATURE_PIPELINE_COVERAGE.expectedTargets
    || !Array.isArray(result.results) || !result.results.some(item => item?.id === RESULT_ID)) {
    fail('Baseline terminal result does not report the configured-canonical 4,920-game screen');
  }
  const screenDirectory = path.resolve(result.outputDirectory);
  assertWithin(runsRoot, screenDirectory, 'Baseline screen output');
  const screenIndexPath = path.join(screenDirectory, 'screen-index.json');
  if (!fs.existsSync(screenIndexPath)) fail(`Baseline screen index is unavailable: ${screenIndexPath}`);
  return { screenIndexPath, screenIndexPin: pin(screenIndexPath) };
}

function getCandidateStages(candidate, complete, expectedCases) {
  if (candidate.terminal.plan?.format !== 'swishiq-experiment-plan-v1') {
    fail('Candidate workflow must point to the mean/screen pipeline plan');
  }
  requireCanonicalScreenPlan(candidate.terminal.plan, 'Candidate pipeline');
  const invocation = path.resolve(candidate.terminal.result.outputDirectory);
  assertWithin(runsRoot, invocation, 'Candidate pipeline invocation');
  if (path.resolve(complete.directory) !== invocation) fail('Candidate complete.json is not in the terminal output directory');
  if (complete.value.format !== 'swishiq-experiment-plan-complete-v1'
    || complete.value.status !== 'development-screen-only' || complete.value.promotionAllowed !== false
    || complete.value.canonicalFinalStage !== 'not-run'
    || complete.value.planSha256 !== hash(candidate.terminal.plan)
    || !Array.isArray(complete.value.completed)) fail('Candidate pipeline complete.json is incomplete or does not match its pinned plan');
  const screens = complete.value.completed.filter(item => item?.stage === 'uncertainty-screen');
  const expectedById = new Map(expectedCases.map(item => [item.id, item]));
  if (screens.length !== expectedById.size) fail('Candidate complete.json does not contain one uncertainty screen per prepared case');
  const seen = new Set();
  const candidates = screens.map(stage => {
    if (typeof stage.id !== 'string' || !expectedById.has(stage.id) || seen.has(stage.id)
      || typeof stage.outputDirectory !== 'string') fail('Candidate screen stages do not match the prepared case ids');
    seen.add(stage.id);
    const screenDirectory = path.resolve(stage.outputDirectory);
    assertWithin(runsRoot, screenDirectory, `Candidate screen ${stage.id}`);
    const screenIndexPath = path.join(screenDirectory, 'screen-index.json');
    if (!fs.existsSync(screenIndexPath)) fail(`Candidate screen index is unavailable for ${stage.id}: ${screenIndexPath}`);
    return { id: stage.id, resultId: RESULT_ID, screenIndex: screenIndexPath,
      head: expectedById.get(stage.id).head, metric: expectedById.get(stage.id).metric };
  });
  if (seen.size !== expectedById.size) fail('Candidate complete.json is missing one or more prepared case screens');
  candidates.sort((left, right) => left.id.localeCompare(right.id));
  return { invocation, candidates };
}

function readMetric(report, screenId, metric) {
  const value = metric === 'brier'
    ? report.distributionLossSummaries?.[screenId]?.pooledGameWeighted?.probability?.brier
    : metric === 'logLoss'
      ? report.distributionLossSummaries?.[screenId]?.pooledGameWeighted?.probability?.logLoss
      : metric === 'rawTotalMae'
        ? report.rawMeanForecastErrors?.[screenId]?.total?.mae
        : report.rawMeanForecastErrors?.[screenId]?.margin?.mae;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`Comparison report is missing ${screenId}.${metric}`);
  return value;
}

function classify(difference) {
  if (difference.lower > 0) return 'clear-harm-in-screen-interval';
  if (difference.upper < 0) return 'screen-interval-favors-candidate';
  if (difference.estimate < 0) return 'provisional-point-gain';
  return 'no-point-gain; no-clear-harm';
}

function summarizeRows(report, candidates) {
  const rows = [];
  for (const candidate of candidates) {
    const primaryMetric = candidate.head === 'total' ? 'rawTotalMae' : 'rawMarginMae';
    for (const metric of METRICS) {
      const baseline = readMetric(report, 'baseline', metric);
      const candidateValue = readMetric(report, candidate.id, metric);
      const column = report.pairedDifferences?.columns?.[`${candidate.id}:${metric}`];
      if (!isRecord(column) || ![column.estimate, column.lower, column.upper].every(Number.isFinite)) {
        fail(`Comparison report is missing paired estimate/interval for ${candidate.id}:${metric}`);
      }
      const directDifference = candidateValue - baseline;
      if (Math.abs(directDifference - column.estimate) > 1e-8) {
        fail(`Paired estimate does not reconcile to pooled values for ${candidate.id}:${metric}`);
      }
      const difference = { estimate: column.estimate, lower: column.lower, upper: column.upper, interval: column.interval };
      rows.push({ candidateId: candidate.id, head: candidate.head, feature: candidate.metric,
        metric, primary: metric === primaryMetric, baseline, candidate: candidateValue, difference,
        classification: classify(difference) });
    }
  }
  const summaries = candidates.map(candidate => {
    const primaryMetric = candidate.head === 'total' ? 'rawTotalMae' : 'rawMarginMae';
    const primary = rows.find(row => row.candidateId === candidate.id && row.metric === primaryMetric);
    return { candidateId: candidate.id, head: candidate.head, feature: candidate.metric,
      primaryMetric, primaryClassification: primary.classification,
      primaryPointDifference: primary.difference.estimate,
      primaryInterval: primary.difference };
  });
  return { rows, candidates: summaries };
}

function formatNumber(value, digits) {
  return value.toFixed(digits);
}

function toMarkdown(summary) {
  const lines = [
    '# Hustle feature pipeline paired screen summary',
    '',
    `Status: ${summary.status}`,
    '',
    `Coverage: ${summary.coverage.expectedTargets.toLocaleString('en-US')} games; seasons ${summary.coverage.targetSeasonStartYears.join(', ')}; 1,230 per season.`,
    '',
    'Negative paired differences favor the candidate for all four listed metrics. Intervals are the comparator’s 95% date-block bootstrap percentile intervals.',
    '',
    '| Candidate | Head | Metric | Baseline | Candidate | Candidate − baseline | 95% paired interval | Screen classification |',
    '|---|---:|---|---:|---:|---:|---:|---|',
  ];
  for (const row of summary.rows) {
    const digits = row.metric === 'brier' || row.metric === 'logLoss' ? 5 : 3;
    lines.push(`| ${row.candidateId} | ${row.head} | ${row.metric}${row.primary ? ' (primary head)' : ''} | ${formatNumber(row.baseline, digits)} | ${formatNumber(row.candidate, digits)} | ${formatNumber(row.difference.estimate, digits)} | [${formatNumber(row.difference.lower, digits)}, ${formatNumber(row.difference.upper, digits)}] | ${row.classification} |`);
  }
  lines.push('', 'These are opened-label development screens. Point gains remain provisional; an interval-separated direction is still a screen result. This output does not establish independent validation or authorize model promotion.', '');
  return lines.join('\n');
}

function copyPinnedFile(sourceDescriptor, destination, label) {
  const source = resolvePinnedDescriptor(sourceDescriptor, `${label} source`);
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  const copied = pin(destination);
  assertPinEqual(copied, sourceDescriptor, `${label} preserved copy`);
  return copied;
}

export function summarizeFeaturePipeline(preparationFile, baselineWorkflowDirectory, candidateWorkflowDirectory) {
  const preparationPath = resolveInput(preparationFile);
  const preparationLoaded = loadPinnedJson(preparationPath);
  const preparation = preparationLoaded.value;
  const prep = assertPreparation(preparation, preparationPath);
  assertWithin(runsRoot, prep.adapterPath, 'Preparation adapter');
  assertWithin(runsRoot, prep.pipelinePlanPath, 'Preparation pipeline plan');
  assertWithin(runsRoot, prep.baselinePlanPath, 'Preparation baseline plan');

  const baseline = loadWorkflowSnapshot(baselineWorkflowDirectory, 'Baseline');
  const candidate = loadWorkflowSnapshot(candidateWorkflowDirectory, 'Candidate');
  if (path.resolve(baseline.terminal.sourcePlan.path) !== prep.baselinePlanPath) {
    fail('Baseline workflow source plan does not match preparation.json');
  }
  if (hash(baseline.terminal.plan) !== hash(prep.baselinePlan)) {
    fail('Baseline workflow plan does not match the pinned baseline plan file');
  }
  if (path.resolve(candidate.terminal.sourcePlan.path) !== prep.pipelinePlanPath) {
    fail('Candidate workflow source plan does not match preparation.json');
  }
  assertPinEqual(candidate.pins.sourcePlan, prep.pipelinePlanPin, 'Preparation pipeline plan');
  if (hash(candidate.terminal.plan) !== hash(prep.pipelinePlan)) {
    fail('Candidate workflow plan does not match the prepared pipeline plan file');
  }
  requireCanonicalScreenPlan(baseline.terminal.plan, 'Baseline');
  const baselineScreen = getBaselineScreenIndex(baseline, prep);

  const candidateCompletePath = path.join(path.resolve(candidate.terminal.result.outputDirectory), 'complete.json');
  const candidateCompleteLoaded = loadPinnedJson(candidateCompletePath);
  const candidateStages = getCandidateStages(candidate, { directory: path.dirname(candidateCompletePath), value: candidateCompleteLoaded.value }, prep.cases);

  const summaryRoot = path.join(runsRoot, 'hustle-individual', 'feature-pipeline-summaries',
    `run-${Date.now()}-${process.pid}`);
  assertDiagnosticOutput(summaryRoot);
  assertWithin(runsRoot, summaryRoot, 'Feature pipeline summary output');
  fs.mkdirSync(path.dirname(summaryRoot), { recursive: true });
  fs.mkdirSync(summaryRoot, { recursive: false });

  const comparisonPlan = {
    format: CROSS_MEAN_PLAN_FORMAT,
    baseline: { screenIndex: baselineScreen.screenIndexPath, resultId: RESULT_ID },
    candidates: candidateStages.candidates.map(({ id, screenIndex, resultId }) => ({ id, screenIndex, resultId })),
    expectedCoverage: FEATURE_PIPELINE_COVERAGE,
    comparison: FEATURE_PIPELINE_COMPARISON,
    outputDirectory: path.join(summaryRoot, 'comparisons'),
  };
  const comparisonPlanPath = path.join(summaryRoot, 'cross-mean-comparison-plan.json');
  writeJson(comparisonPlanPath, comparisonPlan);
  const comparisonPlanPin = pin(comparisonPlanPath);
  const comparisonRun = compareMeanScreens(comparisonPlan, {
    baseDirectory: summaryRoot,
    planPin: comparisonPlanPin,
  });
  if (comparisonRun.status !== 'opened-label-screen-only; not-independent-validation'
    || comparisonRun.comparison?.status !== comparisonRun.status) fail('Comparator returned an unexpected validation status');

  const summarized = summarizeRows(comparisonRun.comparison, candidateStages.candidates);
  const comparisonIndexPath = path.join(comparisonRun.outputDirectory, 'comparison-index.json');
  const comparisonIndexPin = pin(comparisonIndexPath);
  const copiedComparisonIndex = copyPinnedFile(comparisonIndexPin,
    path.join(summaryRoot, 'original-comparison-index.json'), 'Original comparison index');
  const comparisonReceiptPin = comparisonRun.comparisonReceiptPin;
  const copiedComparisonReceipt = copyPinnedFile(comparisonReceiptPin,
    path.join(summaryRoot, 'original-comparison-receipt.json'), 'Original comparison receipt');

  const summary = {
    format: FEATURE_PIPELINE_SUMMARY_FORMAT,
    status: comparisonRun.status,
    evidenceScope: 'development-only',
    independentValidation: false,
    promotionAllowed: false,
    coverage: FEATURE_PIPELINE_COVERAGE,
    comparisonOptions: FEATURE_PIPELINE_COMPARISON,
    inputs: {
      preparation: preparationLoaded.inputPin,
      preparationAdapter: prep.adapterPin,
      baselineWorkflow: baseline.pins.workflow,
      baselineTerminal: baseline.pins.terminal,
      baselineSourcePlan: baseline.pins.sourcePlan,
      baselineScreenIndex: baselineScreen.screenIndexPin,
      candidateWorkflow: candidate.pins.workflow,
      candidateTerminal: candidate.pins.terminal,
      candidateSourcePlan: candidate.pins.sourcePlan,
      candidateComplete: candidateCompleteLoaded.inputPin,
    },
    comparisonPlan: { path: comparisonPlanPath, ...comparisonPlanPin },
    comparison: {
      outputDirectory: comparisonRun.outputDirectory,
      comparisonKey: comparisonRun.comparisonKey,
      resamplingKey: comparisonRun.resamplingKey,
      cacheHits: comparisonRun.cacheHits,
      originalComparisonIndex: { path: path.join(summaryRoot, 'original-comparison-index.json'), ...copiedComparisonIndex },
      originalComparisonReceipt: { path: path.join(summaryRoot, 'original-comparison-receipt.json'), ...copiedComparisonReceipt },
      originalComparisonIndexPath: comparisonIndexPath,
    },
    candidates: summarized.candidates,
    rows: summarized.rows,
    limitations: [
      'This is a paired opened-label screen, not independent validation or formal model inference.',
      'The 95% intervals use same-season circular date-block resampling; they do not establish independent generalization.',
      'Raw total/margin head MAE comes from the pinned mean forecast inputs; Brier and log loss come from the configured-canonical uncertainty-screen outputs.',
      'A provisional point gain has a negative paired estimate without an interval fully below zero. Clear harm is limited to a paired interval fully above zero in this screen.',
      'Canonical final scoring and model promotion were not run by this helper.',
    ],
  };
  writeJson(path.join(summaryRoot, 'summary.json'), summary);
  atomicWrite(path.join(summaryRoot, 'summary.md'), Buffer.from(toMarkdown(summary), 'utf8'));
  return { outputDirectory: summaryRoot, summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2).filter(argument => argument !== '--help');
  if (process.argv.includes('--help') || args.length !== 3) {
    console.log('Usage: node summarize-feature-pipeline.mjs <preparation.json> <baseline-workflow-directory> <candidate-pipeline-workflow-directory>\nReads completed snapshots only, runs the paired mean-screen comparator, and writes a pinned plan plus a compact summary under experiment-tools/runs.');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  const result = summarizeFeaturePipeline(args[0], args[1], args[2]);
  console.log(JSON.stringify({ outputDirectory: result.outputDirectory,
    candidateCount: result.summary.candidates.length,
    rowCount: result.summary.rows.length,
    comparisonKey: result.summary.comparison.comparisonKey,
    status: result.summary.status }));
}
