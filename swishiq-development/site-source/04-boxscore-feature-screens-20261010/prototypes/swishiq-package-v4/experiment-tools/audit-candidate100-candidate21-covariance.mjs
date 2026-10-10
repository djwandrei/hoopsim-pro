import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadPinnedJson, loadPinnedJsonl, pin, writeJson } from './lib/artifacts.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { CANDIDATE21_SCREEN_FEATURES } from './build-candidate100-candidate21-boxscore-feature-artifact.mjs';

const COVARIANCE_FORMAT = 'swishiq-candidate100-candidate21-predictor-covariance-v1';
const COHORTS = Object.freeze({
  development2022to2025: [2022, 2023, 2024, 2025],
  fullWarmupAndDevelopment: [2020, 2021, 2022, 2023, 2024, 2025],
});
const CORRELATION_THRESHOLDS = Object.freeze({ high: 0.8, veryHigh: 0.9, nearDuplicate: 0.98 });

function verifyPin(descriptor, label) {
  if (!descriptor || typeof descriptor.path !== 'string') throw Error('Expected pinned ' + label);
  const actual = pin(descriptor.path);
  if (actual.bytes !== descriptor.bytes || actual.sha256 !== descriptor.sha256) throw Error(label + ' changed: ' + descriptor.path);
  return descriptor.path;
}

function rankValues(values) {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const ranks = new Array(values.length);
  for (let start = 0; start < order.length;) {
    let end = start + 1;
    while (end < order.length && order[end].value === order[start].value) end += 1;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) ranks[order[index].index] = rank;
    start = end;
  }
  return ranks;
}

function moments(values, other) {
  const n = values.length;
  if (!n || n !== other.length) return { n, covariance: null, pearson: null, spearman: null };
  const meanX = values.reduce((sum, value) => sum + value, 0) / n;
  const meanY = other.reduce((sum, value) => sum + value, 0) / n;
  let sumXX = 0, sumYY = 0, sumXY = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = values[index] - meanX, dy = other[index] - meanY;
    sumXX += dx * dx;
    sumYY += dy * dy;
    sumXY += dx * dy;
  }
  const covariance = n > 1 ? sumXY / (n - 1) : null;
  const pearson = sumXX > 0 && sumYY > 0 ? sumXY / Math.sqrt(sumXX * sumYY) : null;
  const ranksX = rankValues(values), ranksY = rankValues(other);
  const meanRX = (n + 1) / 2, meanRY = (n + 1) / 2;
  let rankXX = 0, rankYY = 0, rankXY = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = ranksX[index] - meanRX, dy = ranksY[index] - meanRY;
    rankXX += dx * dx;
    rankYY += dy * dy;
    rankXY += dx * dy;
  }
  const spearman = rankXX > 0 && rankYY > 0 ? rankXY / Math.sqrt(rankXX * rankYY) : null;
  return { n, covariance, pearson, spearman };
}

function featureLists(config) {
  return {
    total: [...config.totalFeatureNames, ...Object.values(CANDIDATE21_SCREEN_FEATURES.total).flat()],
    margin: [...config.marginFeatureNames, ...Object.values(CANDIDATE21_SCREEN_FEATURES.margin).flat()],
  };
}

function auditHead(rows, head, names, cohorts) {
  const results = {};
  for (const [cohortName, years] of Object.entries(cohorts)) {
    const selected = rows.filter(row => years.includes(row.seasonStartYear));
    const vectors = Object.fromEntries(names.map(name => [name, selected.map(row => {
      const value = row.features?.[head]?.[name];
      if (value === null || value === undefined) return null;
      if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Invalid predictor value: ' + head + '/' + name);
      return value;
    })]));
    const missing = Object.fromEntries(names.map(name => [name, vectors[name].filter(value => value === null).length]));
    const pairs = [];
    const standardDeviations = {};
    for (const name of names) {
      const values = vectors[name].filter(value => value !== null);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.length > 1
        ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
        : null;
      standardDeviations[name] = variance === null ? null : Math.sqrt(variance);
    }
    for (let left = 0; left < names.length; left += 1) {
      for (let right = left + 1; right < names.length; right += 1) {
        const x = [], y = [];
        for (let index = 0; index < selected.length; index += 1) {
          const a = vectors[names[left]][index], b = vectors[names[right]][index];
          if (a !== null && b !== null) { x.push(a); y.push(b); }
        }
        const value = moments(x, y);
        pairs.push({ left: names[left], right: names[right], ...value });
      }
    }
    const sortAbs = key => [...pairs].filter(pair => pair[key] !== null)
      .sort((a, b) => Math.abs(b[key]) - Math.abs(a[key]) || a.left.localeCompare(b.left) || a.right.localeCompare(b.right));
    const withThreshold = threshold => pairs.filter(pair => pair.pearson !== null && Math.abs(pair.pearson) >= threshold)
      .sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson));
    results[cohortName] = {
      seasonStartYears: years,
      rows: selected.length,
      featureCount: names.length,
      missingCountByFeature: missing,
      sampleStandardDeviationByFeature: standardDeviations,
      pearsonCovarianceAndCorrelationPairs: pairs,
      topPearsonPairs: sortAbs('pearson').slice(0, 25),
      topSpearmanPairs: sortAbs('spearman').slice(0, 25),
      highPearsonPairs: withThreshold(CORRELATION_THRESHOLDS.high),
      veryHighPearsonPairs: withThreshold(CORRELATION_THRESHOLDS.veryHigh),
      nearDuplicatePearsonPairs: withThreshold(CORRELATION_THRESHOLDS.nearDuplicate),
      pairwiseCompleteCases: true,
      denominator: 'sample covariance with n-1; Pearson on pairwise-complete raw values; Spearman uses average ranks with ties on each pairwise-complete cohort',
    };
  }
  return results;
}

function markdownSummary(report) {
  const formatNumber = (value, digits = 3) => Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
  const formatCompact = value => Number.isFinite(value) ? value.toPrecision(5) : 'n/a';
  const lines = [
    '# Candidate 100 + Candidate 21 Predictor Covariance Audit',
    '',
    'This is a predictor-only diagnostic over strictly prior feature values. It does not use targets, fit models, or select features.',
    '',
    '## Scope',
    '',
    '- Candidate 100 active predictors plus all low-overlap Candidate 21 screen additions.',
    '- Full covariance values are retained in the JSON receipt; correlations are dimensionless.',
    '- Pairwise complete observations are used. Null Candidate 100 total-head fields are reported explicitly.',
    '- Development evidence only; no promotion or validity claim.',
    '',
  ];
  for (const head of ['total', 'margin']) {
    lines.push('## ' + head + ' head', '');
    for (const [cohortName, cohort] of Object.entries(report.heads[head])) {
      lines.push('### ' + cohortName + ' (' + cohort.rows + ' games; ' + cohort.featureCount + ' predictors)', '');
      lines.push('| Pair | Pearson r | Spearman rho | Covariance | N |');
      lines.push('|---|---:|---:|---:|---:|');
      for (const pair of cohort.topPearsonPairs.slice(0, 12)) {
        lines.push('| ' + pair.left + ' / ' + pair.right + ' | ' + formatNumber(pair.pearson) + ' | '
          + formatNumber(pair.spearman) + ' | ' + formatCompact(pair.covariance) + ' | ' + pair.n + ' |');
      }
      lines.push('', 'High Pearson pairs (|r| ≥ ' + CORRELATION_THRESHOLDS.high + '): ' + cohort.highPearsonPairs.length
        + '; very high (|r| ≥ ' + CORRELATION_THRESHOLDS.veryHigh + '): ' + cohort.veryHighPearsonPairs.length
        + '; near-duplicate screen (|r| ≥ ' + CORRELATION_THRESHOLDS.nearDuplicate + '): ' + cohort.nearDuplicatePearsonPairs.length, '');
    }
  }
  lines.push('## Interpretation guardrail', '',
    'High pairwise correlation signals overlapping linear information and can make individual ridge coefficients less stable. It does not alone justify removal: retain a feature when its paired predictive screen improves the intended outcome without repeated harm.',
    '');
  return lines.join('\n');
}

export function auditCandidate100Candidate21Covariance(artifactRunFile) {
  const artifactRunPath = path.resolve(artifactRunFile);
  const artifactRun = loadPinnedJson(artifactRunPath);
  const rowsFile = verifyPin(artifactRun.value.featureRows, 'Candidate21 feature rows');
  const baselineFile = verifyPin(artifactRun.value.sourcePins.candidate100Configuration, 'Candidate100 configuration');
  const rows = loadPinnedJsonl(rowsFile);
  const configuration = loadPinnedJson(baselineFile);
  const names = featureLists(configuration.value);
  for (const head of ['total', 'margin']) {
    if (new Set(names[head]).size !== names[head].length) throw Error('Duplicate feature in covariance audit: ' + head);
  }
  const report = {
    format: COVARIANCE_FORMAT,
    status: 'completed-predictor-only-development-diagnostic; no-fit-no-promotion',
    promotionAllowed: false,
    targetLabelsUsed: false,
    sourcePins: {
      artifactRun: artifactRun.inputPin,
      featureRows: pin(rowsFile),
      candidate100Configuration: configuration.inputPin,
    },
    cohorts: COHORTS,
    correlationThresholds: CORRELATION_THRESHOLDS,
    heads: {
      total: auditHead(rows.rows, 'total', names.total, COHORTS),
      margin: auditHead(rows.rows, 'margin', names.margin, COHORTS),
    },
    limitations: [
      'Pairwise correlation is descriptive and does not measure conditional or causal information.',
      'The 2022-26 cohort was inspected during model development and is not independent validation.',
      'High correlation alone is not a promotion/removal rule; paired predictive effects and coefficient stability still matter.',
    ],
  };
  const output = assertDiagnosticOutput(path.join(import.meta.dirname, 'runs', 'candidate100-candidate21-covariance',
    'run-' + Date.now() + '-' + randomUUID()));
  fs.mkdirSync(output, { recursive: true });
  writeJson(path.join(output, 'covariance.json'), report);
  const markdownFile = path.join(output, 'covariance.md');
  fs.writeFileSync(markdownFile, markdownSummary(report), { flag: 'wx' });
  return {
    outputDirectory: output,
    report: pin(path.join(output, 'covariance.json')),
    markdown: pin(markdownFile),
    status: report.status,
    featureCounts: { total: names.total.length, margin: names.margin.length },
    developmentRows: 4920,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log('Usage: node audit-candidate100-candidate21-covariance.mjs <candidate21-artifact-run.json>');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  console.log(JSON.stringify(auditCandidate100Candidate21Covariance(path.resolve(process.argv[2]))));
}
