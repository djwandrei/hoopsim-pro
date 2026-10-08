/* Chronological warmup split and explicit head-feature policies; original V1 remains frozen. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildCandidate57Standardization, buildCandidate57Design, predictCandidate57Score } from '../models/game-lab-candidate57-c51-pass6-hybrid-v4.mjs';
import { fitCandidate57WithFeaturePenalties } from '../models/game-lab-candidate57-feature-penalty-fit-v3.mjs';

import { applyGameHeadFeaturePolicy } from '../models/game-lab-head-feature-policy-v1.mjs';
if (!process.argv[2] || !process.argv[3] || !process.argv[5]) throw Error('Usage: node fit-mean-cache.mjs <configuration.json> <external-feature-rows.jsonl> <warmup-start-year> <new-output-directory>');
const root = import.meta.dirname, configPath = path.resolve(process.argv[2]);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const sourcePath = path.resolve(process.argv[3]);
const warmupYear = Number(process.argv[4] ?? 2020);
const output = path.resolve(process.argv[5]);
if (fs.existsSync(output)) throw Error('Preserve existing mean cache');
const rows = fs.readFileSync(sourcePath, 'utf8').trim().split(/\r?\n/).map(JSON.parse).filter(r => r.seasonStartYear >= warmupYear).map(r => ({...r,features:applyGameHeadFeaturePolicy(r.features,config.headFeaturePolicy)}));
if (!rows.length || new Set(rows.map(r => r.gameRef)).size !== rows.length) throw Error('Source identity denominator');
const warmupCandidates = rows.filter(r => r.seasonStartYear === warmupYear).sort((a,b)=>a.gameDateLocal.localeCompare(b.gameDateLocal)||a.gameRef.localeCompare(b.gameRef));
const prefix = config.standardizationWarmupPrefixGames;
if(!Number.isSafeInteger(prefix)||prefix<100||prefix>=warmupCandidates.length-100)throw Error('Valid chronological warmup prefix required');
const prefixThrough=warmupCandidates[prefix-1].gameDateLocal;
const warmup=warmupCandidates.filter(r=>r.gameDateLocal<=prefixThrough);
const warmupThrough = warmup.map(r => r.gameDateLocal).sort().at(-1);
const standardization = buildCandidate57Standardization({ warmupRows: warmup, totalFeatureNames: config.totalFeatureNames, marginFeatureNames: config.marginFeatureNames });
const equations = n => ({ gram: Array.from({ length: n }, () => Array(n).fill(0)), cross: Array(n).fill(0), weight: 0, observations: 0 });
const normal = { total: equations(config.totalFeatureNames.length + 1), margin: equations(config.marginFeatureNames.length + 1) };
const days = (a, b) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
const forecasts = [], fits = [], grouped = Map.groupBy(rows, r => r.gameDateLocal);
let equationDate = null, outcomeDate = null, fitDate = null, coefficientThrough = null, model = null;
for (const date of [...grouped.keys()].sort()) {
  const day = grouped.get(date).sort((a, b) => a.gameRef.localeCompare(b.gameRef));
  if (day.some(r => !r.observedThrough || r.observedThrough >= date)) throw Error('Strict prior feature cutoff');
  if (equationDate) {
    const factor = 2 ** (-days(equationDate, date) / config.trainingHalfLifeDays);
    for (const eq of Object.values(normal)) { eq.cross = eq.cross.map(v => v * factor); eq.gram = eq.gram.map(r => r.map(v => v * factor)); eq.weight *= factor; }
  }
  if (date > warmupThrough && normal.total.observations >= config.minimumTrainingRows && (!model || days(fitDate, date) >= config.refitIntervalDays)) {
    model = Object.freeze({ ...fitCandidate57WithFeaturePenalties({ ...normal, standardization, totalRidgeLambda: config.totalRidgeLambda,
      marginRidgeLambda: config.marginRidgeLambda, featureRidgePenaltyMultipliers: config.featureRidgePenaltyMultipliers }), frozenVersion: config.version });
    coefficientThrough = outcomeDate; fitDate = date;
    fits.push({ fittedOnDate: date, observedThrough: coefficientThrough, model });
  }
  const pending = [];
  if (model) for (const row of day) {
    if (coefficientThrough >= date || warmupThrough >= date) throw Error('Prior coefficient/standardization cutoff');
    const p = { ...predictCandidate57Score({ model, features: row.features }) };
    if (config.postMeanCalibration) {
      const pf = row.features.total['c51:meanPointsForLast10'], pa = row.features.total['c51:meanPointsAgainstLast10'];
      if (pf !== null && pa !== null) { const w = config.postMeanCalibration.modelWeight; p.total = w * p.total + (1 - w) * (pf + pa); }
    }
    if (config.postMeanAffine) { p.total += config.postMeanAffine.totalOffset; p.margin = config.postMeanAffine.marginScale * p.margin + config.postMeanAffine.marginOffset; }
    p.homeScore = (p.total + p.margin) / 2; p.awayScore = (p.total - p.margin) / 2;
    pending.push({ gameRef: row.gameRef, gameDateLocal: date, seasonStartYear: row.seasonStartYear, homeTeamRef: row.homeTeamRef, awayTeamRef: row.awayTeamRef,
      modelVersion: config.version, featureObservedThrough: row.observedThrough, coefficientObservedThrough: coefficientThrough,
      standardizationObservedThrough: warmupThrough, fittedOnDate: fitDate, prediction: { total: p.total, margin: p.margin, homeScore: p.homeScore, awayScore: p.awayScore }, target: row.target });
  }
  forecasts.push(...pending);
  for (const row of day) {
    const design = buildCandidate57Design({ features: row.features, standardization });
    for (const head of ['total', 'margin']) {
      const eq = normal[head], x = design[head], y = row.target[head];
      if (!Number.isFinite(y)) throw Error('Finite target required');
      for (let i = 0; i < x.length; i++) { eq.cross[i] += x[i] * y; for (let j = 0; j < x.length; j++) eq.gram[i][j] += x[i] * x[j]; }
      eq.weight++; eq.observations++;
    }
  }
  equationDate = date; outcomeDate = date;
}
fs.mkdirSync(output);
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(output, 'forecast-means.jsonl'), forecasts.map(r => JSON.stringify(r)).join('\n') + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(output, 'coefficient-refits.jsonl'), fits.map(r => JSON.stringify(r)).join('\n') + '\n', { flag: 'wx' });
write('final-learning-state.json', { configuration: config, normal, standardization, model, lastEquationDate: equationDate, lastOutcomeDate: outcomeDate, lastFitDate: fitDate, coefficientThrough,
  residualPool: forecasts.slice(-Math.max(3000, config.uncertainty.residualWindowGames)).map(r => ({ gameRef: r.gameRef, gameDateLocal: r.gameDateLocal, seasonStartYear: r.seasonStartYear,
    predictedMargin: r.prediction.margin, predictedTotal: r.prediction.total, total: r.target.total - r.prediction.total, margin: r.target.margin - r.prediction.margin })) });
const pin = file => { const b = fs.readFileSync(file); return { path: path.resolve(file), bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') }; };
write('manifest.json', { format: 'bounded-candidate-prior-date-mean-cache-v1', modelVersion: config.version, status: 'opened-label-development-only', warmupYear, warmupPrefixRequested:prefix, standardizationRows:warmup.length, standardizationObservedThrough:prefixThrough, forecasts: forecasts.length,
  perSeason: Object.fromEntries([...new Set(forecasts.map(r => r.seasonStartYear))].map(y => [y, forecasts.filter(r => r.seasonStartYear === y).length])),
  sourcePins: [sourcePath, configPath, import.meta.filename, path.join(root, '../models/game-lab-candidate57-c51-pass6-hybrid-v4.mjs'), path.join(root, '../models/game-lab-candidate57-feature-penalty-fit-v3.mjs'),path.join(root,'../models/game-lab-head-feature-policy-v1.mjs')].map(pin),
  artifactPins: ['forecast-means.jsonl', 'coefficient-refits.jsonl', 'final-learning-state.json'].map(f => pin(path.join(output, f))), sameLocalDatePredictionsBeforeFeedback: true });
console.log(JSON.stringify({ modelVersion: config.version, output, forecasts: forecasts.length, coefficientRefits: fits.length }));
