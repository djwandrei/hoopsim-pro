import path from 'node:path';
import { fitCandidate57WithFeaturePenalties } from '../../models/game-lab-candidate57-feature-penalty-fit-v3.mjs';
import { hash, pin, writeJson, writeJsonl, withArtifactCache } from './artifacts.mjs';
import { indexChronology, validLocalDate } from './chronology.mjs';
import { meanSettings, validateMeanConfiguration } from './configuration.mjs';
import { validateDesignResumeProof } from './design-cache.mjs';
export { prepareDesignCache } from './design-cache.mjs';

const days = (a, b) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
export function meanCacheSignature({ design, config, codePins, fullRefits = false, resumeCheckpoint = null, resumeDesignProof = null }) {
  validateMeanConfiguration(config);
  if (resumeCheckpoint) validateDesignResumeProof({ design, checkpoint: resumeCheckpoint, proof: resumeDesignProof });
  else if (resumeDesignProof) throw Error('Design transfer requires a checkpoint');
  return { format: 'swishiq-batched-mean-v1', designKey: design.key,
    sourcePathMap: design.sourceIdentity?.sourcePathMap ?? {},
    designReceiptPin: pin(path.join(design.directory, 'receipt.json')), meanSettings: meanSettings(config), codePins,
    fullRefits, resumeCheckpointSha256: resumeCheckpoint ? hash(resumeCheckpoint) : null, resumeDesignProof };
}

export function fitMeanCache({ design, config, cacheRoot, codePins, counters = {}, fullRefits = false, resumeCheckpoint = null, resumeDesignProof = null }) {
  const signature = meanCacheSignature({ design, config, codePins, fullRefits, resumeCheckpoint, resumeDesignProof });
  const modelVersionNeutral = 'experiment-mean-signature-' + hash(signature);
  const artifact = withArtifactCache(cacheRoot, 'mean', signature, directory => {
    const equations = width => ({ gram: Array.from({ length: width }, () => Array(width).fill(0)), cross: Array(width).fill(0), weight: 0, observations: 0 });
    let normal = { total: equations(design.widths.total), margin: equations(design.widths.margin) };
    let equationDate = null, outcomeDate = null, fitDate = null, coefficientThrough = null, model = null, residualPool = [];
    const forecasts = [], refits = [], checkpoints = [];
    if (resumeCheckpoint) {
      if (resumeCheckpoint.format !== 'swishiq-experiment-mean-state-v1'
        || hash(resumeCheckpoint.meanSettings) !== hash(meanSettings(config)) || !resumeCheckpoint.completeLocalDateBatch) throw Error('Incompatible season checkpoint');
      ({ normal, equationDate, outcomeDate, fitDate, coefficientThrough, model, residualPool } = structuredClone(resumeCheckpoint.state));
      const boundary = design.chronology.dates.find(batch => batch.date === outcomeDate);
      if (!validLocalDate(outcomeDate) || !boundary || equationDate !== outcomeDate || !validLocalDate(fitDate)
        || fitDate > equationDate || !validLocalDate(coefficientThrough) || coefficientThrough >= fitDate
        || design.warmupThrough >= fitDate) throw Error('Invalid resume boundaries');
      for (const head of ['total', 'margin']) {
        const eq = normal?.[head], width = design.widths[head], coefficients = model?.[head + 'Head']?.coefficients;
        if (!eq || eq.observations !== boundary.end || !Number.isFinite(eq.weight) || eq.weight <= 0
          || !Array.isArray(eq.cross) || eq.cross.length !== width || eq.cross.some(value => !Number.isFinite(value))
          || !Array.isArray(eq.gram) || eq.gram.length !== width || eq.gram.some(row => !Array.isArray(row)
            || row.length !== width || row.some(value => !Number.isFinite(value)))
          || !Array.isArray(coefficients) || coefficients.length !== width || coefficients.some(value => !Number.isFinite(value))) throw Error('Invalid checkpoint dimensions/normal equations');
      }
      if (hash(model.standardization) !== hash(design.standardization) || !Array.isArray(residualPool)
        || residualPool.some(row => !validLocalDate(row.gameDateLocal) || row.gameDateLocal > outcomeDate
          || ['total', 'margin', 'predictedTotal', 'predictedMargin'].some(key => !Number.isFinite(row[key])))) throw Error('Invalid checkpoint standardization/residual state');
    }
    const checkpoint = year => {
      const name = 'state-through-' + year + '.json';
      const recentResidualPool = residualPool.slice(-3000);
      const state = { normal, equationDate, outcomeDate, fitDate, coefficientThrough, model, residualPool: recentResidualPool };
      writeJson(path.join(directory, name), { format: 'swishiq-experiment-mean-state-v1', designKey: design.key,
        meanSettings: meanSettings(config), completeLocalDateBatch: true, state });
      residualPool = recentResidualPool;
      checkpoints.push({ year, path: name, observedThrough: outcomeDate });
    };
    const batches = design.chronology.dates;
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex], date = batch.date, firstRowOfDate = design.rowMetadata[batch.start];
      if (outcomeDate && date <= outcomeDate) continue;
      if (equationDate) {
        const factor = 2 ** (-days(equationDate, date) / config.trainingHalfLifeDays);
        // Preserve the original multiply/add order; decay existing arrays in place.
        for (const eq of Object.values(normal)) {
          for (let i = 0; i < eq.cross.length; i++) eq.cross[i] = eq.cross[i] * factor;
          for (let i = 0; i < eq.gram.length; i++) {
            const row = eq.gram[i];
            for (let j = 0; j < row.length; j++) row[j] = row[j] * factor;
          }
          eq.weight = eq.weight * factor;
        }
      }
      if (date > design.warmupThrough && normal.total.observations >= config.minimumTrainingRows
        && (!model || days(fitDate, date) >= config.refitIntervalDays)) {
        model = { ...fitCandidate57WithFeaturePenalties({ ...normal, standardization: design.standardization,
          totalRidgeLambda: config.totalRidgeLambda, marginRidgeLambda: config.marginRidgeLambda,
          featureRidgePenaltyMultipliers: config.featureRidgePenaltyMultipliers }), frozenVersion: modelVersionNeutral };
        coefficientThrough = outcomeDate; fitDate = date;
        refits.push({ fittedOnDate: date, observedThrough: coefficientThrough, ...(fullRefits ? { model } : { modelSha256: hash(model) }) });
        counters.coefficientRefits = (counters.coefficientRefits ?? 0) + 1;
      }
      const pendingResiduals = [];
      if (model) for (let index = batch.start; index < batch.end; index++) {
        const row = design.rowMetadata[index];
        if (coefficientThrough >= date || design.warmupThrough >= date) throw Error('Prior coefficient/standardization cutoff');
        const dot = head => model[head + 'Head'].coefficients.reduce((sum, value, j) => sum + value * design.arrays[head][index * design.widths[head] + j], 0);
        let total = dot('total'), margin = dot('margin');
        if (config.postMeanCalibration && row.blendPointsFor !== null && row.blendPointsAgainst !== null) {
          const weight = config.postMeanCalibration.modelWeight; total = weight * total + (1 - weight) * (row.blendPointsFor + row.blendPointsAgainst);
        }
        if (config.postMeanAffine) { total += config.postMeanAffine.totalOffset; margin = config.postMeanAffine.marginScale * margin + config.postMeanAffine.marginOffset; }
        if (!Number.isFinite(total) || !Number.isFinite(margin)) throw Error('Nonfinite score mean');
        forecasts.push({ gameRef: row.gameRef, gameDateLocal: date, seasonStartYear: row.seasonStartYear,
          homeTeamRef: row.homeTeamRef, awayTeamRef: row.awayTeamRef, modelVersion: modelVersionNeutral,
          featureObservedThrough: row.observedThrough, coefficientObservedThrough: coefficientThrough,
          standardizationObservedThrough: design.warmupThrough, fittedOnDate: fitDate,
          prediction: { total, margin, homeScore: (total + margin) / 2, awayScore: (total - margin) / 2 }, target: row.target });
        pendingResiduals.push({ gameRef: row.gameRef, gameDateLocal: date, seasonStartYear: row.seasonStartYear,
          predictedTotal: total, predictedMargin: margin, total: row.target.total - total, margin: row.target.margin - margin });
      }
      residualPool.push(...pendingResiduals);
      for (let index = batch.start; index < batch.end; index++) {
        const row = design.rowMetadata[index];
        for (const head of ['total', 'margin']) {
          const eq = normal[head], width = design.widths[head], target = row.target[head], offset = index * width;
          for (let i = 0; i < width; i++) {
            const x = design.arrays[head][offset + i]; eq.cross[i] += x * target;
            for (let j = 0; j < width; j++) eq.gram[i][j] += x * design.arrays[head][offset + j];
          }
          eq.weight++; eq.observations++;
        }
      }
      equationDate = date; outcomeDate = date;
      const year = firstRowOfDate.seasonStartYear, next = batches[batchIndex + 1];
      if (!next || design.rowMetadata[next.start].seasonStartYear !== year) checkpoint(year);
    }
    if (!forecasts.length) throw Error('No new forecasts after the supplied warmup/checkpoint');
    const chronology = indexChronology(forecasts);
    writeJsonl(path.join(directory, 'forecast-means.jsonl'), forecasts);
    writeJsonl(path.join(directory, 'refits.jsonl'), refits);
    writeJson(path.join(directory, 'mean.json'), { meanSettings: meanSettings(config), modelVersionNeutral, chronology,
      forecasts: forecasts.length, coefficientRefits: refits.length, checkpoints,
      warmupObservedThrough: design.warmupThrough, resumeObservedThrough: resumeCheckpoint?.state.outcomeDate ?? null });
    counters.predictions = (counters.predictions ?? 0) + forecasts.length;
    return { forecasts: forecasts.length, coefficientRefits: refits.length, checkpoints, targetIdentitySha256: chronology.targetIdentitySha256 };
  });
  counters.meanCacheHits = (counters.meanCacheHits ?? 0) + Number(artifact.cacheHit);
  return artifact;
}
