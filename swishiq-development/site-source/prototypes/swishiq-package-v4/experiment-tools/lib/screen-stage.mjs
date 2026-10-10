import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { hash, writeJson, writeJsonl, atomicWrite, withArtifactCache } from './artifacts.mjs';
import { scoreForecasts, compactLossRows } from './uncertainty-batch.mjs';
import { summarizeScreenRows } from './screen-metrics.mjs';

export function computeScreenVariant({ cacheRoot, signature, forecasts, chronology, forecastByRef, forceCanonical = false }) {
  return withArtifactCache(cacheRoot, 'uncertainty', signature, directory => {
    const { settings, years, includeCalibrationSlope, expectedIdentity, expectedTargets, fullReceipt } = signature;
    const { scored, ledger, implementation } = scoreForecasts({ forecasts, settings, years, chronology, forceCanonical });
    if (scored.length !== expectedTargets || hash(scored.map(row => [row.gameRef, row.gameDateLocal, row.seasonStartYear])) !== expectedIdentity) throw Error('Scorer changed the target identity/denominator');
    const summary = summarizeScreenRows(scored, { includeCalibrationSlope });
    const losses = compactLossRows(scored, forecastByRef);
    writeJson(path.join(directory, 'metrics.json'), { format: 'swishiq-development-screen-metrics-v1', status: 'opened-label-screen-only',
      independentValidation: false, canonicalParityEstablished: false, sourceProvenanceVerified: !!signature.sourceManifestPin,
      summary, settings, implementation, targetIdentitySha256: expectedIdentity,
      observedThroughRule: 'strictly prior local date; entire local-date batch before feedback' });
    atomicWrite(path.join(directory, 'losses.json.gz'), gzipSync(JSON.stringify(losses)));
    if (fullReceipt) { writeJsonl(path.join(directory, 'scored-rows.jsonl'), scored); writeJsonl(path.join(directory, 'forecast-ledger.jsonl'), ledger); }
    return { targets: scored.length, implementation, fullReceipt, targetIdentitySha256: expectedIdentity };
  });
}
