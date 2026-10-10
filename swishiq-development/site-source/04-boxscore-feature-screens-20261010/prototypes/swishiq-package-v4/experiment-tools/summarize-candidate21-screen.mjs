import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { hash, pin, readJson, writeJson } from './lib/artifacts.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { compareMeanScreens, CROSS_MEAN_PLAN_FORMAT } from './compare-mean-screens.mjs';
import { compareMeanScreens as compareRelocatedMeanScreens } from './compare-mean-screens-v2.mjs';

function checkPin(saved, label) {
  if (!saved?.path) throw Error('Missing ' + label + ' pin');
  const current = pin(saved.path);
  if (current.sha256 !== saved.sha256 || current.bytes !== saved.bytes) throw Error(label + ' changed');
  return saved.path;
}

function classify(interval) {
  if (interval.upper < 0) return 'exploratory-interval-favors-addition';
  if (interval.lower > 0) return 'exploratory-interval-favors-reference';
  return interval.estimate < 0 ? 'provisional-point-gain' : 'no-point-gain';
}

export function summarizeCandidate21Screen(preparationFile, pipelineDirectory, { sourcePathMap = {} } = {}) {
  if (!sourcePathMap || typeof sourcePathMap !== 'object' || Array.isArray(sourcePathMap)
    || Object.entries(sourcePathMap).some(([original, relocated]) => !path.isAbsolute(original)
      || typeof relocated !== 'string' || !path.isAbsolute(relocated))) {
    throw Error('Source relocation needs absolute original and replacement paths');
  }
  const relocated = Object.keys(sourcePathMap).length > 0;
  const preparationPath = path.resolve(preparationFile);
  const preparation = readJson(preparationPath);
  if (preparation.format !== 'swishiq-candidate100-candidate21-boxscore-individual-screen-v1'
    || preparation.developmentOnly !== true || preparation.promotionAllowed !== false
    || !Array.isArray(preparation.candidates) || !preparation.candidates.length) {
    throw Error('Expected a completed Candidate21 screen preparation');
  }
  const completeFile = path.join(path.resolve(pipelineDirectory), 'complete.json');
  const complete = readJson(completeFile);
  const pipelinePlan = readJson(preparation.candidatePipelineFile);
  if (complete.format !== 'swishiq-experiment-plan-complete-v1' || complete.status !== 'development-screen-only'
    || complete.promotionAllowed !== false || complete.planSha256 !== hash(pipelinePlan)) {
    throw Error('Pipeline completion does not match the prepared plan');
  }
  const baselineFile = checkPin(preparation.baseline.screenIndex, 'baseline screen');
  checkPin(preparation.baseline.configuration, 'baseline configuration');
  checkPin(preparation.baseline.parityReceipt, 'baseline parity receipt');
  const stages = complete.completed.filter(stage => stage.stage === 'uncertainty-screen');
  const expected = new Map(preparation.candidates.map(candidate => [candidate.id, candidate]));
  if (expected.size !== preparation.candidates.length || stages.length !== expected.size
    || new Set(stages.map(stage => stage.id)).size !== expected.size) {
    throw Error('Pipeline needs exactly one screen for every prepared candidate');
  }
  const candidates = stages.map(stage => {
    if (!expected.has(stage.id)) throw Error('Unexpected pipeline screen: ' + stage.id);
    const candidate = expected.get(stage.id);
    checkPin(candidate.configuration, 'candidate configuration ' + candidate.id);
    return { id: candidate.id, screenIndex: path.join(stage.outputDirectory, 'screen-index.json'),
      resultId: 'configured-canonical', ...(relocated ? { sourcePathMap } : {}) };
  });
  const output = assertDiagnosticOutput(path.join(path.dirname(preparationPath), 'summaries',
    'run-' + Date.now() + '-' + randomUUID()));
  fs.mkdirSync(output, { recursive: true });
  const comparisonPlan = {
    format: CROSS_MEAN_PLAN_FORMAT,
    baseline: { screenIndex: baselineFile, resultId: 'configured-canonical' },
    candidates,
    expectedCoverage: {
      targetSeasonStartYears: preparation.targetSeasonStartYears,
      expectedTargets: preparation.targetGamesExpected,
      perSeason: preparation.perSeasonGamesExpected,
    },
    comparison: { repetitions: 1000, blockLengthDates: 7, seed: 20261010 },
    includeDistributionLosses: true,
    cacheRoot: path.resolve(import.meta.dirname, 'runs/cache/cross-mean-comparison'),
    outputDirectory: path.join(output, 'comparison'),
  };
  const planFile = path.join(output, 'comparison-plan.json');
  writeJson(planFile, comparisonPlan);
  const compare = relocated ? compareRelocatedMeanScreens : compareMeanScreens;
  const comparison = compare(comparisonPlan, { baseDirectory: output, planPin: pin(planFile) });
  const report = comparison.comparison;
  const rows = preparation.candidates.map(candidate => {
    const primaryMetric = candidate.head === 'total' ? 'rawTotalMae' : 'rawMarginMae';
    const difference = report.pairedDifferences.columns[candidate.id + ':' + primaryMetric];
    if (!difference || ![difference.estimate, difference.lower, difference.upper].every(Number.isFinite)) {
      throw Error('Missing primary difference: ' + candidate.id);
    }
    const distribution = report.distributionLossSummaries[candidate.id];
    return { id: candidate.id, head: candidate.head, group: candidate.group, features: candidate.features,
      primaryMetric, primaryDifference: difference, classification: classify(difference),
      rawMeanErrors: report.rawMeanForecastErrors[candidate.id],
      rawMeanErrorsBySeason: report.rawMeanForecastErrorsBySeason[candidate.id],
      distributionLosses: distribution,
      pairedDifferences: Object.fromEntries(Object.entries(report.pairedDifferences.columns)
        .filter(([key]) => key.startsWith(candidate.id + ':')).map(([key, value]) => [key.slice(candidate.id.length + 1), value])),
    };
  });
  const summary = {
    format: 'swishiq-candidate21-screen-summary-v1',
    status: 'completed-development-screen; selection-requires-review',
    featureSet: preparation.featureSet ?? 'raw',
    promotionAllowed: false,
    sourcePathMap,
    preparation: pin(preparationPath), pipelineComplete: pin(completeFile),
    comparisonIndex: pin(path.join(comparison.outputDirectory, 'comparison-index.json')),
    coverage: comparison.coverage,
    cacheHits: comparison.cacheHits,
    pairedResampling: {
      ...comparisonPlan.comparison,
      games: report.pairedDifferences.nGames, dateClusters: report.pairedDifferences.nDateClusters,
      inferenceScope: report.pairedDifferences.inferenceScope,
    },
    baseline: { rawMeanErrors: report.rawMeanForecastErrors.baseline,
      distributionLosses: report.distributionLossSummaries.baseline },
    candidates: rows,
    limitations: report.limitations,
  };
  writeJson(path.join(output, 'summary.json'), summary);
  const format = value => Math.abs(value) < 1e-10 ? '0' : value.toFixed(6);
  const lines = ['# Candidate21 paired feature screen', '',
    'Status: development screen; model selection requires review.', '',
    `Feature set: ${summary.featureSet}; ${summary.coverage.expectedTargets} identical target games.`, '',
    'Negative loss deltas favor the addition. Intervals are exploratory paired 95% date-block bootstrap intervals.', '',
    '| Candidate | Head | Primary MAE delta | 95% interval | Brier delta | Log-loss delta | Classification |',
    '|---|---|---:|---|---:|---:|---|'];
  for (const row of rows) {
    const d = row.primaryDifference;
    lines.push(`| ${row.id} | ${row.head} | ${format(d.estimate)} | [${format(d.lower)}, ${format(d.upper)}] | ${format(row.pairedDifferences.brier.estimate)} | ${format(row.pairedDifferences.logLoss.estimate)} | ${row.classification} |`);
  }
  lines.push('', 'Primary point-error, probability, distribution, bias and per-season evidence is preserved in summary.json. A favorable point estimate or exploratory interval does not automatically promote a feature.', '',
    ...report.limitations.map(value => '- ' + value), '');
  fs.writeFileSync(path.join(output, 'summary.md'), lines.join('\n'));
  return { outputDirectory: output, summary: pin(path.join(output, 'summary.json')),
    markdown: pin(path.join(output, 'summary.md')), comparisonKey: comparison.comparisonKey,
    cacheHits: comparison.cacheHits, candidates: rows.length, targetGames: comparison.coverage.expectedTargets };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [preparationFile, pipelineDirectory, sourcePathMapFile] = process.argv.slice(2);
  if (!preparationFile || !pipelineDirectory) throw Error('Usage: node summarize-candidate21-screen.mjs <preparation.json> <completed-pipeline-directory> [source-path-map.json]');
  const sourcePathMap = sourcePathMapFile ? readJson(path.resolve(sourcePathMapFile)) : {};
  console.log(JSON.stringify(summarizeCandidate21Screen(preparationFile, pipelineDirectory, { sourcePathMap })));
}
