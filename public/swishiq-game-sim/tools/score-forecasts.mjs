import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { scoreCandidate57FastGaussian } from '../experiments/models/game-lab-candidate57-fast-gaussian-scoring-v1.mjs';
import { probabilityMetrics, pointMetrics } from '../experiments/models/game-lab-candidate10-predictive-metrics-v2.mjs';

const args = process.argv.slice(2);
if (args.length < 3 || args.includes('--help')) {
  console.log('Usage: node tools/score-forecasts.mjs <external-forecast-means.jsonl> <season-start-years-csv> <new-output-directory> [configuration.json]');
  console.log('Current Candidate100 full-Gaussian settings only; descriptive development metrics, no formal gate certification.');
  process.exit(args.includes('--help') ? 0 : 1);
}
const base = path.resolve(import.meta.dirname, '..');
const bytes = fs.readFileSync(args[0]);
const forecasts = bytes.toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
const years = args[1].split(',').map(Number);
if (!years.length || years.some(y => !Number.isSafeInteger(y)) || new Set(years).size !== years.length) throw Error('Unique integer season start years required');
if (forecasts.some((r, i) => i && (r.gameDateLocal < forecasts[i - 1].gameDateLocal || (r.gameDateLocal === forecasts[i - 1].gameDateLocal && r.gameRef.localeCompare(forecasts[i - 1].gameRef) < 0))) || new Set(forecasts.map(r => r.gameRef)).size !== forecasts.length) throw Error('Unique forecasts in date/game-ref order required');
for (const row of forecasts) for (const field of ['featureObservedThrough', 'coefficientObservedThrough', 'standardizationObservedThrough']) {
  if (typeof row[field] !== 'string' || row[field] >= row.gameDateLocal) throw Error('Invalid prior-date forecast cutoff: ' + field);
}
const configuration = JSON.parse(fs.readFileSync(args[3] ?? path.join(base, 'game-model/configuration.json'), 'utf8'));
if (forecasts.some(r => r.modelVersion !== configuration.version)) throw Error('Forecast/configuration model identity mismatch');
const { scored, ledger } = scoreCandidate57FastGaussian({ forecasts, settings: configuration.uncertainty, targetSeasonStartYears: years });
if (!scored.length) throw Error('No requested target games were scored');
for (const year of years) if (!scored.some(r => r.seasonStartYear === year)) throw Error('Requested season absent from scored targets: ' + year);
const mean = values => values.reduce((sum, v) => sum + v, 0) / values.length;
const summarize = rows => ({ n: rows.length,
  probability: probabilityMetrics(rows.map(r => ({ probability: r.probability, outcome: r.homeWin }))),
  sides: Object.fromEntries(['home', 'away', 'margin'].map(side => {
    const values = rows.map(r => r.sides[side]);
    return [side, { ...pointMetrics(values.map(v => v.error)), crps: mean(values.map(v => v.crps)),
      equalWeightIntervalScore: mean(values.map(v => v.equalWeightIntervalScore)),
      intervals: Object.fromEntries(['0.5', '0.8', '0.9', '0.95'].map(level => [level, {
        coverage: mean(values.map(v => Number(v.intervals[level].covered))),
        meanWidth: mean(values.map(v => v.intervals[level].width)), intervalScore: mean(values.map(v => v.intervals[level].score)) }])) }];
  })) });
const report = { format: 'standalone-candidate100-development-metrics-v1', modelVersion: configuration.version,
  status: 'development-analysis-only; no-independent-validation-claim', targetSeasonStartYears: years,
  inputSha256: createHash('sha256').update(bytes).digest('hex'), pooled: summarize(scored),
  perSeason: Object.fromEntries(years.map(year => [year, summarize(scored.filter(r => r.seasonStartYear === year))])) };
fs.mkdirSync(args[2]);
fs.writeFileSync(path.join(args[2], 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
for (const [name, rows] of [['scored-rows.jsonl', scored], ['forecast-ledger.jsonl', ledger]]) fs.writeFileSync(path.join(args[2], name), rows.map(JSON.stringify).join('\n') + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output: path.resolve(args[2]), targetGames: scored.length }));
