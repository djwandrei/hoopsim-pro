import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { atomicWrite, hash, loadPinnedJson, pin, writeJson } from './lib/artifacts.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { compareMeanScreens, CROSS_MEAN_PLAN_FORMAT } from './compare-mean-screens.mjs';

export const ROTATION_CONTINUITY_SUMMARY_FORMAT = 'swishiq-candidate100-rotation-continuity-individual-screen-summary-v1';
export const ROTATION_CONTINUITY_COVERAGE = Object.freeze({
  targetSeasonStartYears: Object.freeze([2022, 2023, 2024, 2025]),
  expectedTargets: 4920,
  perSeason: Object.freeze({ '2022': 1230, '2023': 1230, '2024': 1230, '2025': 1230 }),
});
export const ROTATION_CONTINUITY_COMPARISON = Object.freeze({ seed: 20261010, repetitions: 1000, blockLengthDates: 7 });

const toolsRoot = import.meta.dirname;
const runsRoot = path.resolve(toolsRoot, 'runs');
const RESULT_ID = 'configured-canonical';
const EXPECTED_CANDIDATES = 6;
const METRICS = ['rawTotalMae', 'rawMarginMae', 'brier', 'logLoss'];
const SCREEN_ONLY_STATUS = 'opened-label-screen-only; not-independent-validation';

function fail(message) {
  throw new TypeError(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertWithin(root, location, label) {
  const relative = path.relative(root, location);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${label} escapes ${root}`);
  }
}

function resolveInput(file, baseDirectory = process.cwd()) {
  if (typeof file !== 'string' || !file.length) fail('Expected a non-empty path');
  return path.resolve(baseDirectory, file);
}

function readJson(file, label) {
  try {
    const loaded = loadPinnedJson(file);
    if (!isRecord(loaded.value)) fail(`${label} must contain a JSON object`);
    return loaded;
  } catch (error) {
    if (error instanceof TypeError) throw error;
    fail(`Unable to read ${label} at ${file}: ${error.message}`);
  }
}

function assertCoverage(plan, label) {
  const screen = plan?.screen ?? plan;
  if (!isRecord(screen)
    || !Array.isArray(screen.targetSeasonStartYears)
    || hash(screen.targetSeasonStartYears) !== hash(ROTATION_CONTINUITY_COVERAGE.targetSeasonStartYears)
    || !Array.isArray(screen.fullReceiptIds)
    || !screen.fullReceiptIds.includes(RESULT_ID)
    || !Array.isArray(screen.variants)
    || !screen.variants.some(variant => variant?.id === RESULT_ID && variant.forceCanonical === true)) {
    fail(`${label} must request the configured-canonical full screen for 2022-2025`);
  }
}

function featureIdentity(item) {
  const identity = item.semanticFeature ?? item.feature ?? item.metric;
  if (typeof identity !== 'string' || !identity.trim()) {
    fail(`Preparation case ${item.id} needs one semanticFeature, feature, or metric label`);
  }
  for (const field of ['features', 'semanticFeatures']) {
    if (Array.isArray(item[field]) && item[field].length !== 1) {
      fail(`Preparation case ${item.id} must describe exactly one ${field} entry`);
    }
  }
  return identity;
}

function assertPreparation(preparation, preparationPath, pipelinePlanPath, baselinePlanPath) {
  if (!isRecord(preparation) || preparation.status !== 'prepared'
    || preparation.developmentOnly !== true || preparation.promotionAllowed !== false
    || !Array.isArray(preparation.cases) || preparation.cases.length !== EXPECTED_CANDIDATES) {
    fail('Preparation must be a prepared development-only screen with six cases and promotion disabled');
  }
  if (typeof preparation.pipelineFile !== 'string'
    || resolveInput(preparation.pipelineFile, path.dirname(preparationPath)) !== pipelinePlanPath) {
    fail('Preparation pipelineFile does not resolve to the run root pipeline-plan.json');
  }
  if (typeof preparation.baselinePlanFile !== 'string'
    || resolveInput(preparation.baselinePlanFile, path.dirname(preparationPath)) !== baselinePlanPath) {
    fail('Preparation baselinePlanFile does not resolve to the run root baseline-plan.json');
  }

  const ids = new Set();
  const features = new Set();
  const cases = preparation.cases.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) {
      fail('Preparation cases need six unique, non-empty ids');
    }
    ids.add(item.id);
    const semanticFeature = featureIdentity(item);
    if (features.has(semanticFeature)) fail(`Preparation repeats single-feature addition ${semanticFeature}`);
    features.add(semanticFeature);
    const head = item.head ?? null;
    if (head !== null && (typeof head !== 'string' || !head.trim())) {
      fail(`Preparation case ${item.id} has an invalid head label`);
    }
    const displayFeature = [item.metric, item.feature, semanticFeature]
      .find(value => typeof value === 'string' && value.trim());
    return {
      id: item.id,
      feature: displayFeature,
      semanticFeature,
      head,
      configuration: typeof item.configuration === 'string' ? item.configuration : null,
    };
  });
  return cases;
}

function assertPipelinePlan(plan, pipelinePlanPath, pipelineDirectory) {
  if (!isRecord(plan) || plan.format !== 'swishiq-experiment-plan-v1'
    || !isRecord(plan.means) || !Array.isArray(plan.means.configurations)
    || plan.means.configurations.length !== EXPECTED_CANDIDATES) {
    fail('Pipeline plan must contain exactly six mean configurations');
  }
  const declaredPipelineDirectory = resolveInput(plan.outputDirectory, path.dirname(pipelinePlanPath));
  if (declaredPipelineDirectory !== pipelineDirectory) {
    fail('Executed pipeline plan outputDirectory does not match its containing pipeline directory');
  }
  assertCoverage(plan, 'Pipeline screen plan');
  const ids = plan.means.configurations.map(configuration => configuration?.id);
  if (ids.some(id => typeof id !== 'string' || !id.length) || new Set(ids).size !== EXPECTED_CANDIDATES) {
    fail('Pipeline mean configurations must have six unique candidate ids');
  }
  return ids;
}

function assertScreenIndex(index, label) {
  if (!isRecord(index) || index.format !== 'swishiq-batched-uncertainty-screen-v1'
    || index.status !== SCREEN_ONLY_STATUS || index.promotionAllowed !== false
    || !Array.isArray(index.targetSeasonStartYears)
    || hash(index.targetSeasonStartYears) !== hash(ROTATION_CONTINUITY_COVERAGE.targetSeasonStartYears)
    || index.expectedTargets !== ROTATION_CONTINUITY_COVERAGE.expectedTargets
    || !isRecord(index.chronology)
    || !/^[a-f0-9]{64}$/i.test(index.chronology.targetIdentitySha256 ?? '')
    || !Array.isArray(index.results)) {
    fail(`${label} is not a complete development-only 2022-2025 screen index`);
  }
  const canonical = index.results.filter(item => item?.id === RESULT_ID);
  if (canonical.length !== 1 || typeof canonical[0].resultKey !== 'string' || !canonical[0].resultKey.length) {
    fail(`${label} must contain exactly one ${RESULT_ID} result with a result key`);
  }
  return canonical[0];
}

function baselineFingerprint(index, canonical) {
  return hash({
    targetIdentitySha256: index.chronology.targetIdentitySha256,
    inputPin: index.inputPin,
    sourceManifestPin: index.sourceManifestPin,
    configurationPin: index.configurationPin,
    resultKey: canonical.resultKey,
    implementation: canonical.implementation,
    settings: canonical.settings,
  });
}

function findBaselineScreen(baselinePlan, runRoot, baselinePlanPath) {
  if (baselinePlan.format !== 'swishiq-uncertainty-screen-plan-v1'
    || typeof baselinePlan.outputDirectory !== 'string') fail('Baseline plan must be a completed uncertainty-screen plan');
  assertCoverage(baselinePlan, 'Baseline');
  const baselineDirectory = resolveInput(baselinePlan.outputDirectory, path.dirname(baselinePlanPath));
  assertWithin(runsRoot, baselineDirectory, 'Baseline screen output directory');
  if (!fs.existsSync(baselineDirectory) || !fs.statSync(baselineDirectory).isDirectory()) {
    fail(`Baseline screen output directory is unavailable: ${baselineDirectory}`);
  }
  const indexPaths = [];
  const directIndex = path.join(baselineDirectory, 'screen-index.json');
  if (fs.existsSync(directIndex)) indexPaths.push(directIndex);
  for (const entry of fs.readdirSync(baselineDirectory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const indexPath = path.join(baselineDirectory, entry.name, 'screen-index.json');
      if (fs.existsSync(indexPath)) indexPaths.push(indexPath);
    }
  }
  if (!indexPaths.length) fail(`No completed baseline screen-index.json found under ${baselineDirectory}`);

  const candidates = indexPaths.map(screenIndexPath => {
    const loaded = readJson(screenIndexPath, 'baseline screen index');
    const canonical = assertScreenIndex(loaded.value, 'Baseline screen index');
    return { screenIndexPath, screenIndexPin: loaded.inputPin, index: loaded.value, canonical,
      fingerprint: baselineFingerprint(loaded.value, canonical),
      modifiedAt: fs.statSync(screenIndexPath).mtimeMs };
  });
  const fingerprints = new Set(candidates.map(candidate => candidate.fingerprint));
  if (fingerprints.size !== 1) {
    fail('Baseline output contains multiple incompatible completed screen indexes; resolve the baseline run before summarizing');
  }
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  const selected = candidates[0];
  assertWithin(runRoot, selected.screenIndexPath, 'Baseline screen index');
  return selected;
}

function loadCandidateScreens(complete, screenPlanDirectory, pipelineRunDirectory, cases) {
  if (!isRecord(complete) || complete.format !== 'swishiq-experiment-plan-complete-v1'
    || complete.status !== 'development-screen-only' || complete.promotionAllowed !== false
    || complete.canonicalFinalStage !== 'not-run' || !Array.isArray(complete.completed)) {
    fail('Pipeline complete.json must record a development-screen-only run with no canonical final stage or promotion');
  }
  assertWithin(runsRoot, screenPlanDirectory, 'Candidate screen output directory');
  const byId = new Map(cases.map(item => [item.id, item]));
  const stages = complete.completed.filter(item => item?.stage === 'uncertainty-screen');
  if (stages.length !== EXPECTED_CANDIDATES) fail('Pipeline complete.json must contain exactly six uncertainty-screen stages');
  const seen = new Set();
  const candidates = stages.map(stage => {
    if (!isRecord(stage) || typeof stage.id !== 'string' || !byId.has(stage.id) || seen.has(stage.id)
      || typeof stage.outputDirectory !== 'string' || !Array.isArray(stage.resultKeys)) {
      fail('Pipeline screen stages do not match the six prepared candidate ids');
    }
    seen.add(stage.id);
    const outputDirectory = resolveInput(stage.outputDirectory, pipelineRunDirectory);
    assertWithin(screenPlanDirectory, outputDirectory, `Candidate screen ${stage.id}`);
    const screenIndexPath = path.join(outputDirectory, 'screen-index.json');
    const loaded = readJson(screenIndexPath, `candidate ${stage.id} screen index`);
    const canonical = assertScreenIndex(loaded.value, `Candidate ${stage.id} screen index`);
    if (!stage.resultKeys.includes(canonical.resultKey)) {
      fail(`Pipeline stage result keys do not include the configured-canonical result for ${stage.id}`);
    }
    return { ...byId.get(stage.id), resultId: RESULT_ID, screenIndexPath,
      screenIndexPin: loaded.inputPin, resultKey: canonical.resultKey };
  });
  if (seen.size !== EXPECTED_CANDIDATES) fail('Pipeline complete.json is missing one or more prepared cases');
  candidates.sort((left, right) => left.id.localeCompare(right.id));
  return candidates;
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
    const primaryMetric = candidate.head === 'total' ? 'rawTotalMae'
      : candidate.head === 'margin' ? 'rawMarginMae' : null;
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
      const difference = { estimate: column.estimate, lower: column.lower, upper: column.upper,
        interval: column.interval };
      rows.push({ candidateId: candidate.id, feature: candidate.feature,
        semanticFeature: candidate.semanticFeature, head: candidate.head,
        metric, primary: metric === primaryMetric, baseline, candidate: candidateValue,
        difference, classification: classify(difference) });
    }
  }
  const summaries = candidates.map(candidate => {
    const primaryMetric = candidate.head === 'total' ? 'rawTotalMae'
      : candidate.head === 'margin' ? 'rawMarginMae' : null;
    const primary = primaryMetric
      ? rows.find(row => row.candidateId === candidate.id && row.metric === primaryMetric)
      : null;
    return { candidateId: candidate.id, feature: candidate.feature,
      semanticFeature: candidate.semanticFeature, head: candidate.head,
      primaryMetric, primaryClassification: primary?.classification ?? null,
      primaryPointDifference: primary?.difference.estimate ?? null,
      primaryInterval: primary?.difference ?? null };
  });
  return { rows, candidates: summaries };
}

function formatNumber(value, digits) {
  return value.toFixed(digits);
}

function markdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

function toMarkdown(summary) {
  const lines = [
    '# Candidate100 rotation-continuity individual screen summary',
    '',
    `Status: ${summary.status}`,
    '',
    `Coverage: ${summary.coverage.expectedTargets.toLocaleString('en-US')} games; seasons ${summary.coverage.targetSeasonStartYears.join(', ')}; 1,230 per season.`,
    '',
    `Comparison: ${summary.comparisonOptions.repetitions.toLocaleString('en-US')} same-season circular date-block bootstrap resamples; ${summary.comparisonOptions.blockLengthDates}-date blocks; seed ${summary.comparisonOptions.seed}. Intervals are 95% paired percentile intervals.`,
    '',
    'Negative paired differences (candidate minus baseline) favor the candidate for all listed metrics.',
    '',
    '| Candidate | Feature addition | Head | Metric | Baseline | Candidate | Candidate − baseline | 95% paired interval | Screen classification |',
    '|---|---|---|---|---:|---:|---:|---:|---|',
  ];
  for (const row of summary.rows) {
    const digits = row.metric === 'brier' || row.metric === 'logLoss' ? 5 : 3;
    const head = row.head ?? '';
    lines.push(`| ${markdownCell(row.candidateId)} | ${markdownCell(row.feature)} | ${markdownCell(head)} | ${row.metric}${row.primary ? ' (primary head)' : ''} | ${formatNumber(row.baseline, digits)} | ${formatNumber(row.candidate, digits)} | ${formatNumber(row.difference.estimate, digits)} | [${formatNumber(row.difference.lower, digits)}, ${formatNumber(row.difference.upper, digits)}] | ${row.classification} |`);
  }
  lines.push('', 'These are opened-label development screens. Point gains remain provisional; an interval-separated direction is still a screen result. This output does not establish independent validation or authorize model promotion. Canonical final scoring was not run.', '');
  return lines.join('\n');
}

export function summarizeRotationContinuityPipeline(pipelineRunDirectory) {
  const pipelineRun = resolveInput(pipelineRunDirectory);
  assertDiagnosticOutput(pipelineRun);
  assertWithin(runsRoot, pipelineRun, 'Pipeline run directory');
  if (!fs.existsSync(pipelineRun) || !fs.statSync(pipelineRun).isDirectory()) {
    fail(`Pipeline run directory is unavailable: ${pipelineRun}`);
  }
  const pipelineDirectory = path.dirname(pipelineRun);
  const runRoot = path.dirname(pipelineDirectory);
  assertWithin(runsRoot, runRoot, 'Individual-screen run directory');

  const pipelinePlanPath = path.join(runRoot, 'pipeline-plan.json');
  const baselinePlanPath = path.join(runRoot, 'baseline-plan.json');
  const preparationPath = path.join(runRoot, 'preparation.json');
  const executedPlanPath = path.join(pipelineRun, 'plan.json');
  const completePath = path.join(pipelineRun, 'complete.json');
  const preparationLoaded = readJson(preparationPath, 'screen preparation');
  const pipelinePlanLoaded = readJson(pipelinePlanPath, 'prepared pipeline plan');
  const baselinePlanLoaded = readJson(baselinePlanPath, 'baseline plan');
  const executedPlanLoaded = readJson(executedPlanPath, 'executed pipeline plan');
  const completeLoaded = readJson(completePath, 'pipeline complete receipt');
  const cases = assertPreparation(preparationLoaded.value, preparationPath, pipelinePlanPath, baselinePlanPath);
  assertCoverage(baselinePlanLoaded.value, 'Baseline');
  const planIds = assertPipelinePlan(executedPlanLoaded.value, executedPlanPath, pipelineDirectory);
  if (hash(pipelinePlanLoaded.value) !== hash(executedPlanLoaded.value)) {
    fail('Executed pipeline plan does not match the prepared pipeline-plan.json');
  }
  if (completeLoaded.value.planSha256 !== hash(executedPlanLoaded.value)) {
    fail('complete.json planSha256 does not match its executed plan.json');
  }
  const caseIds = cases.map(item => item.id);
  if (hash([...planIds].sort()) !== hash([...caseIds].sort())) {
    fail('Pipeline configuration ids do not match the six prepared feature additions');
  }

  const baseline = findBaselineScreen(baselinePlanLoaded.value, runRoot, baselinePlanPath);
  const screenPlanDirectory = resolveInput(executedPlanLoaded.value.screen.outputDirectory, path.dirname(pipelinePlanPath));
  const candidates = loadCandidateScreens(completeLoaded.value, screenPlanDirectory, pipelineRun, cases);
  const comparisonPlan = {
    format: CROSS_MEAN_PLAN_FORMAT,
    baseline: { screenIndex: baseline.screenIndexPath, resultId: RESULT_ID },
    candidates: candidates.map(({ id, screenIndexPath, resultId }) => ({ id, screenIndex: screenIndexPath, resultId })),
    expectedCoverage: ROTATION_CONTINUITY_COVERAGE,
    comparison: ROTATION_CONTINUITY_COMPARISON,
    outputDirectory: 'comparisons',
  };

  const summaryPath = path.join(pipelineRun, 'summary.json');
  const markdownPath = path.join(pipelineRun, 'summary.md');
  const comparisonPlanPath = path.join(pipelineRun, 'rotation-continuity-comparison-plan.json');
  for (const output of [summaryPath, markdownPath, comparisonPlanPath]) {
    if (fs.existsSync(output)) fail(`Preserve existing summary output: ${output}`);
  }
  writeJson(comparisonPlanPath, comparisonPlan);
  const comparisonPlanPin = pin(comparisonPlanPath);
  const comparisonRun = compareMeanScreens(comparisonPlan, { baseDirectory: pipelineRun, planPin: comparisonPlanPin });
  if (comparisonRun.status !== SCREEN_ONLY_STATUS || comparisonRun.comparison?.status !== SCREEN_ONLY_STATUS
    || comparisonRun.promotionAllowed !== false || comparisonRun.requiresCanonicalFinalRerun !== true) {
    fail('Comparator returned an unexpected development-screen status');
  }
  if (comparisonRun.comparison.targets?.n !== ROTATION_CONTINUITY_COVERAGE.expectedTargets
    || hash(comparisonRun.comparison.targets.targetSeasonStartYears) !== hash(ROTATION_CONTINUITY_COVERAGE.targetSeasonStartYears)
    || comparisonRun.comparison.targets.targetIdentitySha256 !== baseline.index.chronology.targetIdentitySha256) {
    fail('Paired comparator did not confirm identical 2022-2025 target games');
  }

  const summarized = summarizeRows(comparisonRun.comparison, candidates);
  const comparisonIndexPath = path.join(comparisonRun.outputDirectory, 'comparison-index.json');
  const summary = {
    format: ROTATION_CONTINUITY_SUMMARY_FORMAT,
    status: comparisonRun.status,
    evidenceScope: 'development-only',
    independentValidation: false,
    promotionAllowed: false,
    canonicalFinalStage: 'not-run',
    coverage: ROTATION_CONTINUITY_COVERAGE,
    comparisonOptions: ROTATION_CONTINUITY_COMPARISON,
    inputs: {
      preparation: preparationLoaded.inputPin,
      preparedPipelinePlan: pipelinePlanLoaded.inputPin,
      executedPipelinePlan: executedPlanLoaded.inputPin,
      pipelineComplete: completeLoaded.inputPin,
      baselinePlan: baselinePlanLoaded.inputPin,
      baselineScreenIndex: baseline.screenIndexPin,
      candidateScreenIndexes: candidates.map(candidate => ({ id: candidate.id,
        resultKey: candidate.resultKey, screenIndex: candidate.screenIndexPin })),
    },
    comparisonPlan: { path: comparisonPlanPath, ...comparisonPlanPin },
    comparison: {
      outputDirectory: comparisonRun.outputDirectory,
      comparisonKey: comparisonRun.comparisonKey,
      resamplingKey: comparisonRun.resamplingKey,
      targetIdentitySha256: comparisonRun.comparison.targets.targetIdentitySha256,
      cacheHits: comparisonRun.cacheHits,
      comparisonIndex: { path: comparisonIndexPath, ...pin(comparisonIndexPath) },
    },
    candidates: summarized.candidates,
    rows: summarized.rows,
    limitations: [
      'This is an opened-label development screen, not independent validation or formal model inference.',
      'All six additions are compared on the same 4,920 games from seasons 2022-2025 using shared same-season circular date-block draws.',
      'The 95% paired intervals are screen diagnostics and do not establish independent generalization.',
      'Negative candidate-minus-baseline differences favor the candidate for all four metrics; a provisional point gain does not establish a promotion decision.',
      'Canonical final scoring and model promotion were not run by this helper.',
    ],
  };
  writeJson(summaryPath, summary);
  atomicWrite(markdownPath, Buffer.from(toMarkdown(summary), 'utf8'));
  return { outputDirectory: pipelineRun, summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2).filter(argument => argument !== '--help');
  if (process.argv.includes('--help') || args.length !== 1) {
    console.log('Usage: node summarize-rotation-continuity-pipeline.mjs <pipeline-run-directory>\nReads completed pipeline screens only, compares six single-feature additions with their baseline on identical 2022-2025 games using date-block bootstrap resampling, and writes summary.json and summary.md into the supplied pipeline run directory.');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  try {
    const result = summarizeRotationContinuityPipeline(args[0]);
    console.log(JSON.stringify({ outputDirectory: result.outputDirectory,
      candidateCount: result.summary.candidates.length,
      rowCount: result.summary.rows.length,
      comparisonKey: result.summary.comparison.comparisonKey,
      status: result.summary.status }));
  } catch (error) {
    console.error(`Rotation-continuity summary failed: ${error.message}`);
    process.exitCode = 1;
  }
}
