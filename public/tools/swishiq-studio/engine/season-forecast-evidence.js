/*
 * Immutable, browser-safe evidence gate for a future Season Lab forecast.
 *
 * A forecast is intentionally not inferred from an observed package, a
 * pooled package, or an arbitrary set of rates.  Callers must pin the raw
 * manifest bytes, and the accepted manifest must pin every model, projection,
 * calendar, calibration, and input artifact used to create the forecast.
 *
 * This module has no UI and deliberately does not start a simulation.  Its
 * output is a narrow, immutable source receipt plus projected team payloads
 * that a stricter Season Lab model can decide to accept.
 */

import { NBA_TEAM_CODES, NBA_TEAM_CONFERENCES, NBA_TEAM_DIVISIONS } from './nba-schedule-source.js?v=20260920c&rev=structure-v1';

export const SEASON_FORECAST_EVIDENCE_VERSION = 'season-forecast-evidence-v3';
export const SEASON_FORECAST_MANIFEST_FORMAT = 'djhc-season-forecast-manifest-v1';
export const SEASON_FORECAST_PROFILE_FORMAT = 'djhc-season-forecast-profiles-v1';
export const SEASON_FORECAST_CALENDAR_FORMAT = 'djhc-season-forecast-calendar-v1';
export const SEASON_FORECAST_BACKTEST_FORMAT = 'djhc-season-forecast-backtest-ledger-v2';
export const SEASON_FORECAST_MODEL_CARD_FORMAT = 'djhc-season-forecast-model-card-v1';
export const SEASON_FORECAST_REPLAY_RECEIPT_VERSION = 'season-forecast-replay-receipt-v3';
export const SEASON_FORECAST_OUTCOME_ELIGIBILITY_VERSION = 'season-outcome-eligibility-v1';
export const SEASON_TRANSITION_VALIDATION_LEDGER_FORMAT = 'djhc-season-transition-validation-ledger-v1';

export const SEASON_FORECAST_EVIDENCE_LIMITS = Object.freeze({
  maxManifestBytes: 1_000_000,
  maxArtifactBytes: 50_000_000,
  maxInputPins: 100,
  maxBacktests: 200,
  maxProfileBytes: 20_000_000,
  maxScheduleBytes: 20_000_000,
});

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const URL_VALUE = /^(?:https?:\/\/[^\s]+|\.?\/?[^\s]+)$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SEED = /^[A-Za-z0-9:._-]{1,80}$/;
const PROFILE_METRICS = Object.freeze({
  offense: 'points-per-100',
  defense: 'points-per-100',
  net: 'points-per-100',
  pace48: 'possessions-per-48-game-minutes',
  pointsPerGame: 'points-per-game',
  pointsAllowedPerGame: 'points-per-game',
});
const PROFILE_METRIC_KEYS = Object.freeze(Object.keys(PROFILE_METRICS));
const INPUT_PIN_KINDS = new Set(['historical-observed', 'accepted-external-input', 'model-training']);
const HOLDOUT_POLICY = 'strict-before-holdout-v1';
const HOLDOUT_ISSUANCE_POLICY = 'forecast-issued-before-holdout-season-v1';
const BACKTEST_METRIC_KEYS = Object.freeze(['winProbability', 'teamWins', 'teamNetRating']);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const fail = message => { throw new Error(message); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const rounded = value => finite(value) ? Math.round(value * 10000) / 10000 : null;
const ordered = values => [...values].sort((left, right) => String(left).localeCompare(String(right), 'en', { numeric: true }));

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function exactKeys(value, keys, label) {
  const entry = requiredObject(value, label);
  const allowed = new Set(keys);
  const unknown = Object.keys(entry).filter(key => !allowed.has(key));
  const missing = keys.filter(key => !(key in entry));
  if (unknown.length) fail(`${label} contains unsupported field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`);
  if (missing.length) fail(`${label} is missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`);
  return entry;
}

function normalizedIdentifier(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTIFIER.test(normalized)) fail(`${label} must be a bounded identifier.`);
  return normalized;
}

function normalizedUrl(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!URL_VALUE.test(normalized) || normalized.length > 1000) fail(`${label} must be a bounded relative or HTTP(S) URL.`);
  return normalized;
}

function normalizedHash(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!SHA256.test(normalized)) fail(`${label} must be a lowercase SHA-256 hex digest.`);
  return normalized;
}

function normalizedUtc(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!UTC_TIMESTAMP.test(normalized) || new Date(normalized).toISOString() !== normalized) fail(`${label} must be a canonical UTC timestamp.`);
  return normalized;
}

function timestamp(value) { return Date.parse(value); }

function byteView(value, label = 'Bytes') {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  fail(`${label} must be ArrayBuffer-compatible.`);
}

function jsonFromBytes(value, label) {
  let raw;
  try { raw = decoder.decode(byteView(value, `${label} bytes`)); } catch { fail(`${label} is not valid UTF-8.`); }
  try { return JSON.parse(raw); } catch { fail(`${label} is not valid JSON.`); }
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function descriptor(value, label, { maximumBytes = SEASON_FORECAST_EVIDENCE_LIMITS.maxArtifactBytes } = {}) {
  const entry = exactKeys(value, ['url', 'bytes', 'sha256'], label);
  const bytes = Number(entry.bytes);
  if (!integer(bytes, 1, maximumBytes)) fail(`${label} bytes must be a whole number between 1 and ${maximumBytes}.`);
  return Object.freeze({
    url: normalizedUrl(entry.url, `${label} URL`),
    bytes,
    sha256: normalizedHash(entry.sha256, `${label} SHA-256`),
  });
}

function targetSeasonStartsAfterCutoff(year, cutoffUtc) {
  // A pre-season forecast must be sealed before the target regular season
  // starts. This blocks an in-season observed-rate refresh from being passed
  // off as a forecast of that season.
  const regularSeasonStart = Date.UTC(year, 9, 1);
  if (timestamp(cutoffUtc) >= regularSeasonStart) {
    fail('Forecast input cutoff must be before the target regular season begins.');
  }
}

function holdoutForecastIssuedBeforeSeason(year, cutoffUtc) {
  // A historical backtest is only useful if its forecast really could have
  // existed before that holdout season began.  Merely proving that its inputs
  // predate the *current* target forecast leaves a large hindsight hole.
  const regularSeasonStart = Date.UTC(year, 9, 1);
  if (timestamp(cutoffUtc) >= regularSeasonStart) {
    fail('Forecast backtest sourceCutoffUtc must be before its holdout regular season begins.');
  }
}

function metricNumber(value, label, { minimum = 0, maximum = Number.MAX_VALUE } = {}) {
  const number = Number(value);
  if (!finite(number) || number < minimum || number > maximum) {
    fail(`${label} must be a finite number between ${minimum} and ${maximum}.`);
  }
  return number;
}

function closeEnough(left, right, tolerance = 0.00001) {
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

function validationInterval(value, label, sample) {
  const interval = exactKeys(value, ['nominalCoverage', 'empiricalCoverage', 'sample'], label);
  const intervalSample = Number(interval.sample);
  if (!integer(intervalSample, 1) || intervalSample !== sample) fail(`${label} sample must equal its parent metric sample.`);
  const nominalCoverage = metricNumber(interval.nominalCoverage, `${label} nominalCoverage`, { minimum: Number.EPSILON, maximum: 1 - Number.EPSILON });
  const empiricalCoverage = metricNumber(interval.empiricalCoverage, `${label} empiricalCoverage`, { minimum: 0, maximum: 1 });
  return Object.freeze({ nominalCoverage, empiricalCoverage, sample: intervalSample });
}

function binaryBacktestMetric(value, label) {
  const metric = exactKeys(value, ['sample', 'brier', 'logLoss', 'baselineBrier', 'baselineLogLoss', 'calibrationError'], label);
  const sample = Number(metric.sample);
  if (!integer(sample, 1)) fail(`${label} sample must be a positive whole number.`);
  return Object.freeze({
    sample,
    brier: metricNumber(metric.brier, `${label} brier`, { minimum: 0, maximum: 1 }),
    logLoss: metricNumber(metric.logLoss, `${label} logLoss`),
    baselineBrier: metricNumber(metric.baselineBrier, `${label} baselineBrier`, { minimum: 0, maximum: 1 }),
    baselineLogLoss: metricNumber(metric.baselineLogLoss, `${label} baselineLogLoss`),
    calibrationError: metricNumber(metric.calibrationError, `${label} calibrationError`, { minimum: 0, maximum: 1 }),
  });
}

function continuousBacktestMetric(value, label) {
  const metric = exactKeys(value, ['sample', 'mae', 'rmse', 'baselineMae', 'baselineRmse', 'interval'], label);
  const sample = Number(metric.sample);
  if (!integer(sample, 1)) fail(`${label} sample must be a positive whole number.`);
  const mae = metricNumber(metric.mae, `${label} mae`);
  const rmse = metricNumber(metric.rmse, `${label} rmse`);
  const baselineMae = metricNumber(metric.baselineMae, `${label} baselineMae`);
  const baselineRmse = metricNumber(metric.baselineRmse, `${label} baselineRmse`);
  if (rmse + Number.EPSILON < mae || baselineRmse + Number.EPSILON < baselineMae) {
    fail(`${label} RMSE cannot be lower than MAE.`);
  }
  return Object.freeze({ sample, mae, rmse, baselineMae, baselineRmse, interval: validationInterval(metric.interval, `${label} interval`, sample) });
}

function backtestMetrics(value, label) {
  const metrics = exactKeys(value, BACKTEST_METRIC_KEYS, label);
  return Object.freeze({
    winProbability: binaryBacktestMetric(metrics.winProbability, `${label} winProbability`),
    teamWins: continuousBacktestMetric(metrics.teamWins, `${label} teamWins`),
    teamNetRating: continuousBacktestMetric(metrics.teamNetRating, `${label} teamNetRating`),
  });
}

function weightedMean(rows, metric, key) {
  const total = rows.reduce((sum, row) => sum + row.metrics[metric].sample, 0);
  return total ? rows.reduce((sum, row) => sum + row.metrics[metric][key] * row.metrics[metric].sample, 0) / total : null;
}

function weightedRmse(rows, metric, key) {
  const total = rows.reduce((sum, row) => sum + row.metrics[metric].sample, 0);
  return total ? Math.sqrt(rows.reduce((sum, row) => sum + (row.metrics[metric][key] ** 2) * row.metrics[metric].sample, 0) / total) : null;
}

function validateAggregateMetrics(aggregate, backtests) {
  const metrics = backtestMetrics(aggregate, 'Forecast backtest aggregate');
  for (const metric of BACKTEST_METRIC_KEYS) {
    const expectedSample = backtests.reduce((sum, row) => sum + row.metrics[metric].sample, 0);
    if (metrics[metric].sample !== expectedSample) {
      fail(`Forecast backtest aggregate ${metric} sample does not reconcile to its holdouts.`);
    }
  }
  for (const key of ['brier', 'logLoss', 'baselineBrier', 'baselineLogLoss', 'calibrationError']) {
    const expected = weightedMean(backtests, 'winProbability', key);
    if (!closeEnough(metrics.winProbability[key], expected)) fail(`Forecast backtest aggregate winProbability ${key} does not reconcile to its holdouts.`);
  }
  for (const metric of ['teamWins', 'teamNetRating']) {
    for (const key of ['mae', 'baselineMae']) {
      const expected = weightedMean(backtests, metric, key);
      if (!closeEnough(metrics[metric][key], expected)) fail(`Forecast backtest aggregate ${metric} ${key} does not reconcile to its holdouts.`);
    }
    const expectedCoverage = backtests.reduce((sum, row) => sum
      + row.metrics[metric].interval.empiricalCoverage * row.metrics[metric].sample, 0) / metrics[metric].sample;
    if (!closeEnough(metrics[metric].interval.empiricalCoverage, expectedCoverage)) {
      fail(`Forecast backtest aggregate ${metric} interval coverage does not reconcile to its holdouts.`);
    }
    for (const key of ['rmse', 'baselineRmse']) {
      const expected = weightedRmse(backtests, metric, key);
      if (!closeEnough(metrics[metric][key], expected)) fail(`Forecast backtest aggregate ${metric} ${key} does not reconcile to its holdouts.`);
    }
    const expectedNominal = backtests[0].metrics[metric].interval.nominalCoverage;
    if (backtests.some(row => !closeEnough(row.metrics[metric].interval.nominalCoverage, expectedNominal))
      || !closeEnough(metrics[metric].interval.nominalCoverage, expectedNominal)) {
      fail(`Forecast backtest ${metric} interval nominal coverage must be consistent across holdouts.`);
    }
  }
  return metrics;
}

function normalizedInputPins(value, cutoffUtc) {
  if (!Array.isArray(value) || !value.length || value.length > SEASON_FORECAST_EVIDENCE_LIMITS.maxInputPins) {
    fail(`Forecast inputPins must contain one through ${SEASON_FORECAST_EVIDENCE_LIMITS.maxInputPins} immutable pins.`);
  }
  const seen = new Set();
  return Object.freeze(value.map((pin, index) => {
    const entry = exactKeys(pin, ['id', 'kind', 'observedThroughUtc', 'availableAtUtc', 'artifact'], `Forecast input pin ${index + 1}`);
    const id = normalizedIdentifier(entry.id, `Forecast input pin ${index + 1} ID`);
    const kind = typeof entry.kind === 'string' ? entry.kind.trim() : '';
    if (!INPUT_PIN_KINDS.has(kind)) fail(`Forecast input pin ${id} has an unsupported kind.`);
    if (seen.has(id)) fail(`Forecast input pins contain duplicate ID ${id}.`);
    seen.add(id);
    const observedThroughUtc = normalizedUtc(entry.observedThroughUtc, `Forecast input pin ${id} observedThroughUtc`);
    const availableAtUtc = normalizedUtc(entry.availableAtUtc, `Forecast input pin ${id} availableAtUtc`);
    if (timestamp(observedThroughUtc) > timestamp(cutoffUtc) || timestamp(availableAtUtc) > timestamp(cutoffUtc)) {
      fail(`Forecast input pin ${id} exceeds the immutable input cutoff.`);
    }
    if (timestamp(observedThroughUtc) > timestamp(availableAtUtc)) {
      fail(`Forecast input pin ${id} was available before its observed-through timestamp.`);
    }
    return Object.freeze({ id, kind, observedThroughUtc, availableAtUtc, artifact: descriptor(entry.artifact, `Forecast input pin ${id} artifact`) });
  }));
}

function normalizedManifest(value) {
  const manifest = exactKeys(value, [
    'format', 'manifestId', 'manifestVersion', 'status', 'targetSeasonStartYear',
    'asOfUtc', 'inputCutoffUtc', 'model', 'artifacts', 'inputPins',
  ], 'Forecast manifest');
  if (manifest.format !== SEASON_FORECAST_MANIFEST_FORMAT) fail('Forecast manifest has an unsupported format.');
  if (manifest.status !== 'accepted') fail('Forecast manifest is not accepted.');
  const manifestId = normalizedIdentifier(manifest.manifestId, 'Forecast manifest ID');
  const manifestVersion = normalizedIdentifier(manifest.manifestVersion, 'Forecast manifest version');
  const targetSeasonStartYear = Number(manifest.targetSeasonStartYear);
  if (!integer(targetSeasonStartYear, 1947, 2200)) fail('Forecast manifest needs a valid target season start year.');
  const asOfUtc = normalizedUtc(manifest.asOfUtc, 'Forecast manifest asOfUtc');
  const inputCutoffUtc = normalizedUtc(manifest.inputCutoffUtc, 'Forecast manifest inputCutoffUtc');
  if (asOfUtc !== inputCutoffUtc) fail('Forecast manifest asOfUtc and inputCutoffUtc must be identical.');
  targetSeasonStartsAfterCutoff(targetSeasonStartYear, inputCutoffUtc);

  const rawModel = exactKeys(manifest.model, ['modelId', 'version', 'status', 'trainedThroughUtc', 'artifact'], 'Forecast manifest model');
  if (rawModel.status !== 'accepted') fail('Forecast manifest projection model is not accepted.');
  const model = Object.freeze({
    modelId: normalizedIdentifier(rawModel.modelId, 'Forecast model ID'),
    version: normalizedIdentifier(rawModel.version, 'Forecast model version'),
    trainedThroughUtc: normalizedUtc(rawModel.trainedThroughUtc, 'Forecast model trainedThroughUtc'),
    artifact: descriptor(rawModel.artifact, 'Forecast model artifact'),
  });
  if (timestamp(model.trainedThroughUtc) > timestamp(inputCutoffUtc)) fail('Forecast model training exceeds the immutable input cutoff.');

  const rawArtifacts = exactKeys(manifest.artifacts, ['profiles', 'schedule', 'backtestLedger'], 'Forecast manifest artifacts');
  const artifacts = Object.freeze({
    profiles: descriptor(rawArtifacts.profiles, 'Forecast profile artifact', { maximumBytes: SEASON_FORECAST_EVIDENCE_LIMITS.maxProfileBytes }),
    schedule: descriptor(rawArtifacts.schedule, 'Forecast schedule artifact', { maximumBytes: SEASON_FORECAST_EVIDENCE_LIMITS.maxScheduleBytes }),
    backtestLedger: descriptor(rawArtifacts.backtestLedger, 'Forecast backtest ledger artifact'),
  });
  const allDescriptors = [model.artifact, artifacts.profiles, artifacts.schedule, artifacts.backtestLedger];
  if (new Set(allDescriptors.map(item => item.sha256)).size !== allDescriptors.length) {
    fail('Forecast model, profile, schedule, and backtest artifacts must have distinct immutable hashes.');
  }
  const inputPins = normalizedInputPins(manifest.inputPins, inputCutoffUtc);
  if (new Set(inputPins.map(pin => pin.artifact.sha256)).size !== inputPins.length) fail('Forecast input pins must not reuse an artifact hash.');
  if (inputPins.some(pin => allDescriptors.some(item => item.sha256 === pin.artifact.sha256))) {
    fail('Forecast input pins cannot substitute for a model, profile, schedule, or backtest artifact.');
  }
  return Object.freeze({
    format: manifest.format,
    manifestId,
    manifestVersion,
    status: manifest.status,
    targetSeasonStartYear,
    asOfUtc,
    inputCutoffUtc,
    model,
    artifacts,
    inputPins,
  });
}

/**
 * Validate the schema and time boundary of a parsed manifest.  This does not
 * establish authenticity by itself; use loadAcceptedSeasonForecastEvidence to
 * verify the raw manifest and every pinned artifact byte-for-byte.
 */
export function validateAcceptedSeasonForecastManifest(manifest) {
  return normalizedManifest(jsonClone(manifest));
}

/** Browser-safe SHA-256 helper for the raw immutable artifact bytes. */
export async function sha256Hex(value, { cryptoImpl = globalThis.crypto } = {}) {
  const subtle = cryptoImpl?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') fail('Web Crypto SHA-256 is unavailable in this browser.');
  const bytes = byteView(value);
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchPinnedBytes(fetchImpl, pin, label) {
  if (typeof fetchImpl !== 'function') fail('Forecast evidence loading requires an explicit fetch implementation.');
  let response;
  try {
    response = await fetchImpl(pin.url, { method: 'GET', cache: 'no-store', credentials: 'same-origin' });
  } catch (error) {
    fail(`${label} could not be fetched: ${error instanceof Error ? error.message : String(error)}.`);
  }
  if (!response || response.ok !== true || typeof response.arrayBuffer !== 'function') {
    const status = response && Number.isFinite(Number(response.status)) ? ` (HTTP ${response.status})` : '';
    fail(`${label} fetch did not return an OK byte response${status}.`);
  }
  let raw;
  try { raw = byteView(await response.arrayBuffer(), `${label} response`); } catch (error) {
    fail(`${label} could not read response bytes: ${error instanceof Error ? error.message : String(error)}.`);
  }
  if (raw.byteLength !== pin.bytes) fail(`${label} bytes do not match its immutable descriptor.`);
  const actualHash = await sha256Hex(raw);
  if (actualHash !== pin.sha256) fail(`${label} SHA-256 does not match its immutable descriptor.`);
  // Copy the response so callers or a reused fetch fixture cannot mutate a
  // retained ArrayBuffer after the hash check.
  return new Uint8Array(raw);
}

function profileMetric(value, metric) {
  const raw = exactKeys(value, ['status', 'unit', 'value'], `Projected ${metric} metric`);
  if (raw.status !== 'projected') fail(`Projected ${metric} metric must have projected status; observed or native values are not forecast evidence.`);
  if (raw.unit !== PROFILE_METRICS[metric]) fail(`Projected ${metric} metric has an unsupported unit.`);
  const number = Number(raw.value);
  const limits = metric === 'pace48' ? [60, 130] : metric === 'net' ? [-300, 300] : [0, 300];
  if (!finite(number) || number < limits[0] || number > limits[1]) fail(`Projected ${metric} metric is outside the supported forecast range.`);
  return Object.freeze({ status: 'projected', unit: raw.unit, value: number });
}

function validateProfilesDocument(value, manifest) {
  const document = exactKeys(value, ['format', 'targetSeasonStartYear', 'asOfUtc', 'inputCutoffUtc', 'model', 'profiles'], 'Forecast profile artifact');
  if (document.format !== SEASON_FORECAST_PROFILE_FORMAT) fail('Forecast profile artifact has an unsupported format.');
  if (Number(document.targetSeasonStartYear) !== manifest.targetSeasonStartYear) fail('Forecast profile artifact escapes the target season.');
  if (normalizedUtc(document.asOfUtc, 'Forecast profile artifact asOfUtc') !== manifest.asOfUtc
    || normalizedUtc(document.inputCutoffUtc, 'Forecast profile artifact inputCutoffUtc') !== manifest.inputCutoffUtc) {
    fail('Forecast profile artifact does not match the manifest cutoff.');
  }
  const sourceModel = exactKeys(document.model, ['modelId', 'version'], 'Forecast profile artifact model');
  if (sourceModel.modelId !== manifest.model.modelId || sourceModel.version !== manifest.model.version) {
    fail('Forecast profile artifact does not match the accepted projection model.');
  }
  if (!Array.isArray(document.profiles) || document.profiles.length !== NBA_TEAM_CODES.length) {
    fail('Forecast profile artifact must contain exactly thirty regular-season team profiles.');
  }
  const teamIds = new Set();
  const profiles = document.profiles.map((profile, index) => {
    const raw = exactKeys(profile, ['teamId', 'seasonStartYear', 'phase', 'games', 'profileKind', 'provenance', 'metrics'], `Forecast team profile ${index + 1}`);
    const teamId = typeof raw.teamId === 'string' ? raw.teamId.trim().toUpperCase() : '';
    if (!NBA_TEAM_CODES.includes(teamId) || teamIds.has(teamId)) fail('Forecast team profiles must contain every NBA team exactly once.');
    teamIds.add(teamId);
    if (Number(raw.seasonStartYear) !== manifest.targetSeasonStartYear || raw.phase !== 'regular' || Number(raw.games) !== 82 || raw.profileKind !== 'projected') {
      fail(`Forecast team profile ${teamId} must be a projected 82-game regular-season profile for the manifest target.`);
    }
    const provenance = exactKeys(raw.provenance, ['kind', 'modelId', 'version', 'inputCutoffUtc'], `Forecast team profile ${teamId} provenance`);
    if (provenance.kind !== 'forecast-model' || provenance.modelId !== manifest.model.modelId || provenance.version !== manifest.model.version
      || normalizedUtc(provenance.inputCutoffUtc, `Forecast team profile ${teamId} provenance cutoff`) !== manifest.inputCutoffUtc) {
      fail(`Forecast team profile ${teamId} has non-forecast, native, observed, or pooled provenance.`);
    }
    const metricRecord = exactKeys(raw.metrics, PROFILE_METRIC_KEYS, `Forecast team profile ${teamId} metrics`);
    const metrics = Object.fromEntries(PROFILE_METRIC_KEYS.map(metric => [metric, profileMetric(metricRecord[metric], metric)]));
    if (Math.abs(metrics.net.value - (metrics.offense.value - metrics.defense.value)) > 0.01) {
      fail(`Forecast team profile ${teamId} net rate does not reconcile to projected offense minus defense.`);
    }
    return Object.freeze({
      teamId,
      seasonStartYear: manifest.targetSeasonStartYear,
      phase: 'regular',
      games: 82,
      profileKind: 'projected',
      provenance: Object.freeze({ kind: 'forecast-model', modelId: manifest.model.modelId, version: manifest.model.version, inputCutoffUtc: manifest.inputCutoffUtc }),
      metrics: Object.freeze(metrics),
    });
  });
  if (teamIds.size !== NBA_TEAM_CODES.length || NBA_TEAM_CODES.some(team => !teamIds.has(team))) fail('Forecast team profiles must cover the full NBA team set.');
  return Object.freeze(ordered(profiles.map(profile => profile.teamId)).map(teamId => profiles.find(profile => profile.teamId === teamId)));
}

function validateCalendarDocument(value, manifest) {
  const document = exactKeys(value, ['format', 'targetSeasonStartYear', 'asOfUtc', 'inputCutoffUtc', 'games'], 'Forecast schedule artifact');
  if (document.format !== SEASON_FORECAST_CALENDAR_FORMAT) fail('Forecast schedule artifact has an unsupported format.');
  if (Number(document.targetSeasonStartYear) !== manifest.targetSeasonStartYear) fail('Forecast schedule artifact escapes the target season.');
  if (normalizedUtc(document.asOfUtc, 'Forecast schedule artifact asOfUtc') !== manifest.asOfUtc
    || normalizedUtc(document.inputCutoffUtc, 'Forecast schedule artifact inputCutoffUtc') !== manifest.inputCutoffUtc) {
    fail('Forecast schedule artifact does not match the manifest cutoff.');
  }
  const expectedGames = NBA_TEAM_CODES.length * 82 / 2;
  if (!Array.isArray(document.games) || document.games.length !== expectedGames) {
    fail(`Forecast schedule artifact must contain exactly ${expectedGames} score-free regular-season games.`);
  }
  const ids = new Set();
  const appearances = Object.fromEntries(NBA_TEAM_CODES.map(team => [team, 0]));
  const homeGames = Object.fromEntries(NBA_TEAM_CODES.map(team => [team, 0]));
  const awayGames = Object.fromEntries(NBA_TEAM_CODES.map(team => [team, 0]));
  const opponentGames = new Map();
  const games = document.games.map((game, index) => {
    const raw = exactKeys(game, ['id', 'seasonStartYear', 'phase', 'scheduledAt', 'home', 'away', 'result'], `Forecast schedule game ${index + 1}`);
    const id = normalizedIdentifier(raw.id, `Forecast schedule game ${index + 1} ID`);
    if (ids.has(id)) fail('Forecast schedule artifact contains duplicate game IDs.');
    ids.add(id);
    const home = typeof raw.home === 'string' ? raw.home.trim().toUpperCase() : '';
    const away = typeof raw.away === 'string' ? raw.away.trim().toUpperCase() : '';
    if (!NBA_TEAM_CODES.includes(home) || !NBA_TEAM_CODES.includes(away) || home === away) fail(`Forecast schedule game ${id} has invalid home/away teams.`);
    if (Number(raw.seasonStartYear) !== manifest.targetSeasonStartYear || raw.phase !== 'regular') fail(`Forecast schedule game ${id} is not a target regular-season game.`);
    const scheduledAt = normalizedUtc(raw.scheduledAt, `Forecast schedule game ${id} scheduledAt`);
    if (timestamp(scheduledAt) < Date.UTC(manifest.targetSeasonStartYear, 8, 1)) fail(`Forecast schedule game ${id} falls before the target calendar window.`);
    // Keep a pinned forecast calendar inside the target NBA season. A lower
    // bound alone would allow an otherwise balanced 82-game matrix to place
    // games years after the requested season while still passing the evidence
    // gate and being labeled as that season.
    if (timestamp(scheduledAt) >= Date.UTC(manifest.targetSeasonStartYear + 1, 6, 1)) {
      fail(`Forecast schedule game ${id} falls after the target calendar window.`);
    }
    if (raw.result !== null) fail(`Forecast schedule game ${id} contains observed scores; forecast calendars must be score-free.`);
    appearances[home] += 1; appearances[away] += 1; homeGames[home] += 1; awayGames[away] += 1;
    const [firstTeam, secondTeam] = [home, away].sort();
    const pairKey = `${firstTeam}:${secondTeam}`;
    const pair = opponentGames.get(pairKey) || { games: 0, firstTeamHome: 0, secondTeamHome: 0 };
    pair.games += 1;
    if (home === firstTeam) pair.firstTeamHome += 1;
    else pair.secondTeamHome += 1;
    opponentGames.set(pairKey, pair);
    return Object.freeze({ id, seasonStartYear: manifest.targetSeasonStartYear, phase: 'regular', scheduledAt, home, away, result: null });
  });
  if (Object.values(appearances).some(count => count !== 82) || Object.values(homeGames).some(count => count !== 41) || Object.values(awayGames).some(count => count !== 41)) {
    fail('Forecast schedule artifact must give every NBA team exactly 82 appearances and a 41/41 home/away split.');
  }
  for (let left = 0; left < NBA_TEAM_CODES.length; left += 1) for (let right = left + 1; right < NBA_TEAM_CODES.length; right += 1) {
    const [firstTeam, secondTeam] = [NBA_TEAM_CODES[left], NBA_TEAM_CODES[right]].sort();
    const pair = opponentGames.get(`${firstTeam}:${secondTeam}`) || { games: 0, firstTeamHome: 0, secondTeamHome: 0 };
    const sameDivision = NBA_TEAM_DIVISIONS[firstTeam] === NBA_TEAM_DIVISIONS[secondTeam];
    const sameConference = NBA_TEAM_CONFERENCES[firstTeam] === NBA_TEAM_CONFERENCES[secondTeam];
    const expectedPairing = sameDivision ? pair.games === 4
      : sameConference ? pair.games === 3 || pair.games === 4
        : pair.games === 2;
    if (!expectedPairing) {
      fail('Forecast schedule artifact must follow the NBA opponent matrix: four games within a division, two across conferences, and three or four within a conference.');
    }
    if (Math.abs(pair.firstTeamHome - pair.secondTeamHome) > 1) {
      fail('Forecast schedule artifact must balance home and away games for every opponent pair.');
    }
  }
  return Object.freeze(games.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt) || left.id.localeCompare(right.id)));
}

function validateModelCard(value, manifest) {
  const card = exactKeys(value, ['format', 'modelId', 'version', 'status', 'trainedThroughUtc', 'inputCutoffUtc'], 'Forecast model artifact');
  if (card.format !== SEASON_FORECAST_MODEL_CARD_FORMAT || card.status !== 'accepted') fail('Forecast model artifact is not an accepted model card.');
  if (card.modelId !== manifest.model.modelId || card.version !== manifest.model.version) fail('Forecast model artifact does not match the manifest model.');
  if (normalizedUtc(card.trainedThroughUtc, 'Forecast model artifact trainedThroughUtc') !== manifest.model.trainedThroughUtc
    || normalizedUtc(card.inputCutoffUtc, 'Forecast model artifact inputCutoffUtc') !== manifest.inputCutoffUtc) {
    fail('Forecast model artifact does not match the immutable training cutoff.');
  }
  return Object.freeze({ modelId: manifest.model.modelId, version: manifest.model.version, trainedThroughUtc: manifest.model.trainedThroughUtc, inputCutoffUtc: manifest.inputCutoffUtc });
}

function relativeImprovement(model, baseline) {
  if (!(finite(model) && finite(baseline)) || baseline === 0) return null;
  return (baseline - model) / Math.abs(baseline);
}

// A nominal interval is not calibrated merely because it was emitted by an
// accepted model. Compare observed holdout coverage with the declared target
// in units of the binomial sampling error at that target. This keeps ordinary
// finite-sample noise from downgrading a receipt while surfacing material
// under- or over-coverage before it is handed to a forecast consumer.
function intervalCalibration(metric) {
  const nominalCoverage = metric.interval.nominalCoverage;
  const empiricalCoverage = metric.interval.empiricalCoverage;
  const sample = metric.interval.sample;
  const standardError = Math.sqrt(Math.max(Number.EPSILON, nominalCoverage * (1 - nominalCoverage)) / sample);
  const coverageGap = empiricalCoverage - nominalCoverage;
  const zScore = coverageGap / standardError;
  const status = zScore < -2 ? 'under-covered' : zScore > 2 ? 'over-covered' : 'within-sampling-error';
  return Object.freeze({
    nominalCoverage,
    empiricalCoverage,
    coverageGap: rounded(coverageGap),
    standardError: rounded(standardError),
    zScore: rounded(zScore),
    status,
  });
}

function forecastMetricQuality(metrics) {
  const winProbability = {
    brierImprovement: relativeImprovement(metrics.winProbability.brier, metrics.winProbability.baselineBrier),
    logLossImprovement: relativeImprovement(metrics.winProbability.logLoss, metrics.winProbability.baselineLogLoss),
    calibrationError: metrics.winProbability.calibrationError,
  };
  const continuous = metric => ({
    maeImprovement: relativeImprovement(metrics[metric].mae, metrics[metric].baselineMae),
    rmseImprovement: relativeImprovement(metrics[metric].rmse, metrics[metric].baselineRmse),
    nominalCoverage: metrics[metric].interval.nominalCoverage,
    empiricalCoverage: metrics[metric].interval.empiricalCoverage,
    coverageGap: metrics[metric].interval.empiricalCoverage - metrics[metric].interval.nominalCoverage,
  });
  const teamWins = continuous('teamWins');
  const teamNetRating = continuous('teamNetRating');
  const intervalCalibrationByMetric = Object.freeze({
    teamWins: intervalCalibration(metrics.teamWins),
    teamNetRating: intervalCalibration(metrics.teamNetRating),
  });
  const values = [
    winProbability.brierImprovement, winProbability.logLossImprovement,
    teamWins.maeImprovement, teamWins.rmseImprovement,
    teamNetRating.maeImprovement, teamNetRating.rmseImprovement,
  ].filter(finite);
  const improved = values.filter(value => value > 0).length;
  const pointRegressed = values.filter(value => value < 0).length;
  const intervalRegressed = Object.values(intervalCalibrationByMetric)
    .filter(value => value.status !== 'within-sampling-error').length;
  const regressed = pointRegressed + intervalRegressed;
  const intervalIssues = Object.entries(intervalCalibrationByMetric)
    .filter(([, value]) => value.status !== 'within-sampling-error')
    .map(([metric, value]) => `${metric} ${value.status}`);
  const note = intervalIssues.length
    ? `The ledger reports out-of-sample accuracy against declared baselines. Interval calibration also flags ${intervalIssues.join(', ')} beyond approximate two-standard-error sampling noise. Acceptance is supplied by the immutable package/model governance record, not inferred from these summary metrics alone.`
    : 'The ledger reports out-of-sample accuracy against declared baselines. Acceptance is supplied by the immutable package/model governance record, not inferred from these summary metrics alone.';
  return Object.freeze({
    status: regressed === 0 && improved > 0 ? 'improved-versus-declared-baselines'
      : improved > 0 ? 'mixed-versus-declared-baselines'
        : 'not-improved-versus-declared-baselines',
    winProbability: Object.freeze(winProbability),
    teamWins: Object.freeze(teamWins),
    teamNetRating: Object.freeze(teamNetRating),
    intervalCalibration: intervalCalibrationByMetric,
    note,
  });
}

function validateBacktestLedger(value, manifest) {
  const ledger = exactKeys(value, ['format', 'status', 'model', 'inputCutoffUtc', 'completedThroughSeasonStartYear', 'holdoutPolicy', 'issuancePolicy', 'backtests', 'aggregate'], 'Forecast backtest ledger artifact');
  if (ledger.format !== SEASON_FORECAST_BACKTEST_FORMAT || ledger.status !== 'accepted') fail('Forecast backtest ledger is not accepted.');
  const model = exactKeys(ledger.model, ['modelId', 'version'], 'Forecast backtest ledger model');
  if (model.modelId !== manifest.model.modelId || model.version !== manifest.model.version) fail('Forecast backtest ledger does not match the manifest model.');
  if (normalizedUtc(ledger.inputCutoffUtc, 'Forecast backtest ledger inputCutoffUtc') !== manifest.inputCutoffUtc) fail('Forecast backtest ledger does not match the immutable input cutoff.');
  if (ledger.holdoutPolicy !== HOLDOUT_POLICY || ledger.issuancePolicy !== HOLDOUT_ISSUANCE_POLICY) {
    fail('Forecast backtest ledger does not use strict pre-holdout, pre-season-issued forecast splits.');
  }
  const completedThroughSeasonStartYear = Number(ledger.completedThroughSeasonStartYear);
  if (!integer(completedThroughSeasonStartYear, 1947, manifest.targetSeasonStartYear - 1)) fail('Forecast backtest ledger has an invalid completed-through season.');
  if (!Array.isArray(ledger.backtests) || ledger.backtests.length < 2 || ledger.backtests.length > SEASON_FORECAST_EVIDENCE_LIMITS.maxBacktests) {
    fail(`Forecast backtest ledger must contain two through ${SEASON_FORECAST_EVIDENCE_LIMITS.maxBacktests} completed strict holdouts.`);
  }
  const holds = new Set();
  let previousHoldoutSeasonStartYear = null;
  const backtests = ledger.backtests.map((backtest, index) => {
    const entry = exactKeys(backtest, ['holdoutSeasonStartYear', 'trainedThroughSeasonStartYear', 'sourceCutoffUtc', 'status', 'metrics'], `Forecast backtest ${index + 1}`);
    const holdoutSeasonStartYear = Number(entry.holdoutSeasonStartYear);
    const trainedThroughSeasonStartYear = Number(entry.trainedThroughSeasonStartYear);
    if (!integer(holdoutSeasonStartYear, 1947, manifest.targetSeasonStartYear - 1)
      || !integer(trainedThroughSeasonStartYear, 1947, holdoutSeasonStartYear - 1)
      || entry.status !== 'complete') fail(`Forecast backtest ${index + 1} is not a completed strict rolling holdout.`);
    if (previousHoldoutSeasonStartYear !== null && holdoutSeasonStartYear <= previousHoldoutSeasonStartYear) {
      fail('Forecast backtest holdouts must be in strictly increasing season order.');
    }
    if (holds.has(holdoutSeasonStartYear)) fail('Forecast backtest ledger contains duplicate holdout seasons.');
    holds.add(holdoutSeasonStartYear);
    previousHoldoutSeasonStartYear = holdoutSeasonStartYear;
    const sourceCutoffUtc = normalizedUtc(entry.sourceCutoffUtc, `Forecast backtest ${index + 1} sourceCutoffUtc`);
    if (timestamp(sourceCutoffUtc) > timestamp(manifest.inputCutoffUtc)) fail(`Forecast backtest ${index + 1} exceeds the immutable input cutoff.`);
    holdoutForecastIssuedBeforeSeason(holdoutSeasonStartYear, sourceCutoffUtc);
    return Object.freeze({ holdoutSeasonStartYear, trainedThroughSeasonStartYear, sourceCutoffUtc, status: 'complete',
      metrics: backtestMetrics(entry.metrics, `Forecast backtest ${index + 1} metrics`) });
  });
  if (backtests.at(-1).holdoutSeasonStartYear !== completedThroughSeasonStartYear) {
    fail('Forecast backtest ledger completed-through season does not match its final holdout.');
  }
  const aggregate = validateAggregateMetrics(ledger.aggregate, backtests);
  const holdoutContinuity = summarizeHoldoutContinuity(backtests);
  return Object.freeze({
    completedThroughSeasonStartYear,
    holdoutPolicy: HOLDOUT_POLICY,
    issuancePolicy: HOLDOUT_ISSUANCE_POLICY,
    backtests: Object.freeze(backtests),
    holdoutContinuity,
    aggregate,
    quality: forecastMetricQuality(aggregate),
  });
}

function summarizeHoldoutContinuity(backtests) {
  const years = backtests.map(row => row.holdoutSeasonStartYear);
  const missingHoldoutSeasonStartYears = [];
  let consecutiveHoldoutPairs = 0, nonAdjacentHoldoutPairs = 0, maximumSeasonGap = 0;
  for (let index = 1; index < years.length; index += 1) {
    const gap = years[index] - years[index - 1];
    maximumSeasonGap = Math.max(maximumSeasonGap, gap);
    if (gap === 1) {
      consecutiveHoldoutPairs++;
      continue;
    }
    nonAdjacentHoldoutPairs++;
    for (let year = years[index - 1] + 1; year < years[index]; year += 1) missingHoldoutSeasonStartYears.push(year);
  }
  return Object.freeze({
    status: missingHoldoutSeasonStartYears.length ? 'gaps-present' : 'contiguous',
    firstHoldoutSeasonStartYear: years[0] ?? null,
    lastHoldoutSeasonStartYear: years.at(-1) ?? null,
    holdoutCount: years.length,
    consecutiveHoldoutPairs,
    nonAdjacentHoldoutPairs,
    missingHoldoutSeasonStartYears: Object.freeze(missingHoldoutSeasonStartYears),
    maximumSeasonGap,
    transitionPolicy: 'no-season-transition-or-interpolation-is-inferred-across-unheld-years-v1',
  });
}

function publicSource(manifest, manifestContentSha256, ledger) {
  return Object.freeze({
    kind: 'forecast-season',
    forecastEvidence: true,
    forecastSeasonStartYears: Object.freeze([manifest.targetSeasonStartYear]),
    projectionModel: Object.freeze({
      status: 'accepted',
      modelId: manifest.model.modelId,
      version: manifest.model.version,
      artifactSha256: manifest.model.artifact.sha256,
    }),
    projectionRefs: Object.freeze([Object.freeze({ id: manifest.manifestId, hash: manifestContentSha256 })]),
    forecastManifest: Object.freeze({
      manifestId: manifest.manifestId,
      manifestVersion: manifest.manifestVersion,
      contentSha256: manifestContentSha256,
      seasonStartYear: manifest.targetSeasonStartYear,
      asOfUtc: manifest.asOfUtc,
      modelArtifactSha256: manifest.model.artifact.sha256,
      profileSha256: manifest.artifacts.profiles.sha256,
      scheduleSha256: manifest.artifacts.schedule.sha256,
      backtestLedgerSha256: manifest.artifacts.backtestLedger.sha256,
      scheduleKind: 'generated-future',
    }),
    forecastValidation: Object.freeze({
      status: 'validated',
      ledgerSha256: manifest.artifacts.backtestLedger.sha256,
      completedThroughSeasonStartYear: ledger.completedThroughSeasonStartYear,
      holdoutPolicy: ledger.holdoutPolicy,
      issuancePolicy: ledger.issuancePolicy,
      holdoutCount: ledger.backtests.length,
      backtests: ledger.backtests,
      holdoutContinuity: ledger.holdoutContinuity,
      aggregate: ledger.aggregate,
      quality: ledger.quality,
    }),
    acceptedForecastManifest: true,
  });
}

function teamPayloads(profiles) {
  return Object.freeze(profiles.map(profile => Object.freeze({
    team: profile.teamId,
    projectedProfiles: Object.freeze([profile]),
    // Season Lab currently consumes this normalized field name for both
    // observed and projected rate profiles. Every metric status and the
    // explicit provenance above still stays projected/forecast-only.
    nativeProfiles: Object.freeze([Object.freeze({
      seasonStartYear: profile.seasonStartYear,
      phase: profile.phase,
      games: profile.games,
      metrics: profile.metrics,
      provenance: profile.provenance,
    })]),
  })));
}

/**
 * Load a fully pinned forecast manifest and all of its immutable artifacts.
 *
 * The caller must supply the manifest pin ({ url, bytes, sha256 }); this
 * prevents a mutable URL from becoming a trust root. Any malformed, unpinned,
 * post-cutoff, observed/native/pooled, incomplete, or scored artifact throws
 * instead of returning a degraded source.
 */
export async function loadAcceptedSeasonForecastEvidence({ manifest: manifestPin, fetchImpl } = {}) {
  const pin = descriptor(manifestPin, 'Forecast manifest', { maximumBytes: SEASON_FORECAST_EVIDENCE_LIMITS.maxManifestBytes });
  const manifestBytes = await fetchPinnedBytes(fetchImpl, pin, 'Forecast manifest');
  const manifestContentSha256 = pin.sha256;
  const manifest = normalizedManifest(jsonFromBytes(manifestBytes, 'Forecast manifest'));

  const [modelBytes, profileBytes, scheduleBytes, ledgerBytes, ...inputBytes] = await Promise.all([
    fetchPinnedBytes(fetchImpl, manifest.model.artifact, 'Forecast model artifact'),
    fetchPinnedBytes(fetchImpl, manifest.artifacts.profiles, 'Forecast profile artifact'),
    fetchPinnedBytes(fetchImpl, manifest.artifacts.schedule, 'Forecast schedule artifact'),
    fetchPinnedBytes(fetchImpl, manifest.artifacts.backtestLedger, 'Forecast backtest ledger artifact'),
    ...manifest.inputPins.map(pinValue => fetchPinnedBytes(fetchImpl, pinValue.artifact, `Forecast input pin ${pinValue.id} artifact`)),
  ]);
  const model = validateModelCard(jsonFromBytes(modelBytes, 'Forecast model artifact'), manifest);
  const profiles = validateProfilesDocument(jsonFromBytes(profileBytes, 'Forecast profile artifact'), manifest);
  const games = validateCalendarDocument(jsonFromBytes(scheduleBytes, 'Forecast schedule artifact'), manifest);
  const ledger = validateBacktestLedger(jsonFromBytes(ledgerBytes, 'Forecast backtest ledger artifact'), manifest);
  const inputs = Object.freeze(manifest.inputPins.map((pinValue, index) => Object.freeze({
    id: pinValue.id,
    kind: pinValue.kind,
    observedThroughUtc: pinValue.observedThroughUtc,
    availableAtUtc: pinValue.availableAtUtc,
    bytes: inputBytes[index].byteLength,
    sha256: pinValue.artifact.sha256,
  })));
  const source = publicSource(manifest, manifestContentSha256, ledger);
  return deepFreeze({
    status: 'ready',
    version: SEASON_FORECAST_EVIDENCE_VERSION,
    source,
    teamPayloads: teamPayloads(profiles),
    schedule: {
      kind: 'generated-future',
      scheduleId: `forecast-${manifest.manifestId}-${manifest.targetSeasonStartYear}`,
      gamesPerTeam: 82,
      games,
      sourceReceipt: {
        id: manifest.manifestId,
        version: manifest.manifestVersion,
        contentSha256: manifest.artifacts.schedule.sha256,
      },
    },
    receipt: {
      manifestId: manifest.manifestId,
      manifestVersion: manifest.manifestVersion,
      contentSha256: manifestContentSha256,
      targetSeasonStartYear: manifest.targetSeasonStartYear,
      asOfUtc: manifest.asOfUtc,
      model,
      inputs,
      backtest: ledger,
    },
  });
}

function sourceLabel(value, label) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized && normalized.length <= 180 && !/[\u0000-\u001f\u007f]/.test(normalized)) return normalized;
  } else if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  fail(`${label} must be a bounded string or safe integer.`);
}

function sourceSeasonId(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() && value.length <= 180 && !/[\u0000-\u001f\u007f]/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  fail(`${label} must be a bounded string, safe integer, or null.`);
}

function seasonRowKey(row) {
  return `${JSON.stringify(row.entityId)}|${row.seasonStartYear}|${JSON.stringify(row.seasonId)}`;
}

function transitionRowKey(row) {
  return `${JSON.stringify(row.entityId)}|${row.fromSeasonStartYear}|${JSON.stringify(row.fromSeasonId)}|${row.toSeasonStartYear}|${JSON.stringify(row.toSeasonId)}`;
}

function validateTransitionValidationLedger(value, { sourceRows, transitions, valueFields }) {
  if (value == null) return Object.freeze({ status: 'descriptive-only', reason: 'no-temporal-validation-ledger-supplied' });
  const ledger = exactKeys(value, ['format', 'status', 'ledgerSha256', 'sourceRecordCount', 'transitionSupportCount',
    'sourceSeasons', 'heldoutTransitionSupportCount', 'heldoutTransitionKeys', 'holdoutSeasonStartYear', 'holdoutPolicy', 'metrics'], 'Season transition validation ledger');
  if (ledger.format !== SEASON_TRANSITION_VALIDATION_LEDGER_FORMAT || ledger.status !== 'validated') {
    fail('Season transition validation ledger must use the supported format and validated status.');
  }
  const ledgerSha256 = normalizedHash(ledger.ledgerSha256, 'Season transition validation ledger SHA-256');
  if (ledger.sourceRecordCount !== sourceRows.length || ledger.transitionSupportCount !== transitions.length) {
    fail('Season transition validation ledger counts do not match the supplied season records and adjacent transitions.');
  }
  if (!integer(ledger.holdoutSeasonStartYear, 1946, 2100) || ledger.holdoutPolicy !== HOLDOUT_POLICY) {
    fail('Season transition validation ledger needs a supported strict-before-holdout policy and season.');
  }
  const expectedSeasonKeys = sourceRows.map(row => seasonRowKey(row)).sort();
  if (!Array.isArray(ledger.sourceSeasons) || ledger.sourceSeasons.length !== expectedSeasonKeys.length) {
    fail('Season transition validation ledger must pin every source entity-season row.');
  }
  const actualSeasonKeys = ledger.sourceSeasons.map((raw, index) => {
    const row = exactKeys(raw, ['entityId', 'seasonStartYear', 'seasonId'], `Season transition ledger source season ${index + 1}`);
    const entityId = sourceLabel(row.entityId, `Season transition ledger source season ${index + 1} entity ID`);
    if (!integer(row.seasonStartYear, 1946, 2100)) fail(`Season transition ledger source season ${index + 1} has an invalid year.`);
    const seasonId = sourceSeasonId(row.seasonId, `Season transition ledger source season ${index + 1} ID`);
    return seasonRowKey({ entityId, seasonStartYear: row.seasonStartYear, seasonId });
  }).sort();
  if (actualSeasonKeys.some((key, index) => key !== expectedSeasonKeys[index])) {
    fail('Season transition validation ledger source season IDs do not match the supplied records.');
  }
  if (!integer(ledger.heldoutTransitionSupportCount, 1, transitions.length)
    || !Array.isArray(ledger.heldoutTransitionKeys) || ledger.heldoutTransitionKeys.length !== ledger.heldoutTransitionSupportCount) {
    fail('Season transition validation ledger needs exact held-out transition support.');
  }
  const availableTransitionKeys = new Set(transitions.map(transitionRowKey));
  const heldoutKeys = ledger.heldoutTransitionKeys.map((raw, index) => {
    const row = exactKeys(raw, ['entityId', 'fromSeasonStartYear', 'fromSeasonId', 'toSeasonStartYear', 'toSeasonId'], `Held-out transition ${index + 1}`);
    const normalized = {
      entityId: sourceLabel(row.entityId, `Held-out transition ${index + 1} entity ID`),
      fromSeasonStartYear: row.fromSeasonStartYear,
      fromSeasonId: sourceSeasonId(row.fromSeasonId, `Held-out transition ${index + 1} source season ID`),
      toSeasonStartYear: row.toSeasonStartYear,
      toSeasonId: sourceSeasonId(row.toSeasonId, `Held-out transition ${index + 1} target season ID`),
    };
    if (!integer(normalized.fromSeasonStartYear, 1946, 2099)
      || !integer(normalized.toSeasonStartYear, 1947, 2100)
      || normalized.toSeasonStartYear !== normalized.fromSeasonStartYear + 1
      || normalized.toSeasonStartYear !== ledger.holdoutSeasonStartYear) {
      fail(`Held-out transition ${index + 1} must target the declared adjacent holdout season.`);
    }
    const key = transitionRowKey(normalized);
    if (!availableTransitionKeys.has(key)) fail(`Held-out transition ${index + 1} is absent from the contiguous source transitions.`);
    return key;
  });
  if (new Set(heldoutKeys).size !== heldoutKeys.length) fail('Season transition validation ledger contains duplicate held-out transitions.');
  const rawMetrics = requiredObject(ledger.metrics, 'Season transition validation metrics');
  const metricKeys = Object.keys(rawMetrics);
  if (!metricKeys.length || metricKeys.some(key => !valueFields.includes(key))) {
    fail('Season transition validation metrics must name at least one requested value field.');
  }
  const metrics = Object.freeze(Object.fromEntries(metricKeys.sort().map(key => {
    const metric = exactKeys(rawMetrics[key], ['sample', 'mae', 'rmse'], `Season transition validation metric ${key}`);
    if (!integer(metric.sample, 1, ledger.heldoutTransitionSupportCount)
      || !finite(metric.mae) || metric.mae < 0 || !finite(metric.rmse) || metric.rmse < 0) {
      fail(`Season transition validation metric ${key} has invalid sample support or error values.`);
    }
    return [key, Object.freeze({ sample: metric.sample, mae: rounded(metric.mae), rmse: rounded(metric.rmse) })];
  })));
  return Object.freeze({ status: 'validated', format: ledger.format, ledgerSha256,
    sourceRecordCount: sourceRows.length, transitionSupportCount: transitions.length, heldoutTransitionSupportCount: ledger.heldoutTransitionSupportCount,
    holdoutSeasonStartYear: ledger.holdoutSeasonStartYear, holdoutPolicy: ledger.holdoutPolicy, metrics });
}

function median(values) {
  if (!values.length) return null;
  const orderedValues = [...values].sort((left, right) => left - right);
  const middle = Math.floor(orderedValues.length / 2);
  return orderedValues.length % 2 ? orderedValues[middle] : (orderedValues[middle - 1] + orderedValues[middle]) / 2;
}

function interpolatedQuantile(sortedValues, probability) {
  if (!sortedValues.length) return null;
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position), upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + ((sortedValues[upper] - sortedValues[lower]) * (position - lower));
}

function summarizeTransitionStability(transitionSamplesByField, transitionSupportCount, validation) {
  const metrics = Object.fromEntries(Object.entries(transitionSamplesByField).map(([field, samples]) => {
    const values = samples.map(sample => sample.change);
    const sortedValues = [...values].sort((left, right) => left - right);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const populationSd = values.length
      ? Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length) : null;
    const q25 = interpolatedQuantile(sortedValues, 0.25), q75 = interpolatedQuantile(sortedValues, 0.75);
    const medianChange = median(values);
    return [field, Object.freeze({
      n: values.length,
      transitionSupportCount,
      coverage: transitionSupportCount ? rounded(values.length / transitionSupportCount) : null,
      meanChange: mean === null ? null : rounded(mean),
      medianChange: medianChange === null ? null : rounded(medianChange),
      populationStandardDeviation: populationSd === null ? null : rounded(populationSd),
      interquartileRange: q25 === null ? null : rounded(q75 - q25),
      quartiles: { q25: q25 === null ? null : rounded(q25), q75: q75 === null ? null : rounded(q75) },
      // Pair IDs remain attached so pooled moments can always be traced back
      // to the exact adjacent seasons; detailed values remain in transitions.
      sourceSeasonPairs: Object.freeze(samples.map(sample => sample.pair)),
    })];
  }));
  return deepFreeze({
    status: validation.status === 'validated' ? 'descriptive-with-validated-temporal-ledger' : 'descriptive-only',
    scope: 'gap-safe-adjacent-season-transitions',
    transitionSupportCount,
    dispersionDefinition: 'population standard deviation and linear-interpolated interquartile range over observed supported transitions',
    gapPolicy: 'no-transition-is-created-across-a-missing-season',
    validationLedgerSha256: validation.status === 'validated' ? validation.ledgerSha256 : null,
    metrics,
  });
}

/**
 * Build adjacent-season transitions without connecting records across a
 * missing season. Results are descriptive unless a matching temporal
 * validation ledger is supplied.
 */
export function buildContiguousSeasonTransitionBlocks(seasonRecords, {
  entityIdField = 'entityId',
  seasonStartYearField = 'seasonStartYear',
  seasonIdField = 'seasonId',
  valueFields = [],
  temporalValidationLedger = null,
} = {}) {
  if (!Array.isArray(seasonRecords) || !seasonRecords.length) fail('Season transition building needs at least one season record.');
  for (const field of [entityIdField, seasonStartYearField, seasonIdField]) {
    if (typeof field !== 'string' || !field.trim() || field.length > 100) fail('Season transition source field names must be bounded strings.');
  }
  if (!Array.isArray(valueFields) || valueFields.some(field => typeof field !== 'string' || !field.trim() || field.length > 100)
    || new Set(valueFields).size !== valueFields.length) fail('Season transition value fields must be unique, bounded field names.');

  const grouped = new Map();
  const sourceKeys = new Set();
  const normalizedRows = seasonRecords.map((raw, index) => {
    const row = requiredObject(raw, `Season transition record ${index + 1}`);
    const entityId = sourceLabel(row[entityIdField], `Season transition record ${index + 1} entity ID`);
    const seasonStartYear = Number(row[seasonStartYearField]);
    if (!integer(seasonStartYear, 1946, 2100)) fail(`Season transition record ${index + 1} has an invalid season start year.`);
    const seasonId = sourceSeasonId(row[seasonIdField] ?? row.sourceSeasonId, `Season transition record ${index + 1} source season ID`);
    const key = `${entityId}\u001f${seasonStartYear}`;
    if (sourceKeys.has(key)) fail(`Entity ${entityId} has more than one source row for season ${seasonStartYear}.`);
    sourceKeys.add(key);
    const values = Object.freeze(Object.fromEntries(valueFields.map(field => [field, finite(row[field]) ? row[field] : null])));
    const normalized = Object.freeze({ entityId, seasonStartYear, seasonId, values });
    const rows = grouped.get(entityId) || [];
    rows.push(normalized);
    grouped.set(entityId, rows);
    return normalized;
  });

  let contiguousBlockCount = 0, transitionSupportCount = 0, missingSeasonBoundaryCount = 0;
  const metricDeltaSupportCounts = Object.fromEntries(valueFields.map(field => [field, 0]));
  const transitionSamplesByField = Object.fromEntries(valueFields.map(field => [field, []]));
  const gaps = [], allTransitions = [];
  const entities = ordered([...grouped.keys()]).map(entityId => {
    const rows = grouped.get(entityId).sort((left, right) => left.seasonStartYear - right.seasonStartYear);
    const rawBlocks = [];
    let blockRows = [], splitBefore = null;
    for (const row of rows) {
      const previous = blockRows.at(-1);
      if (previous && row.seasonStartYear !== previous.seasonStartYear + 1) {
        const missingSeasonStartYears = [];
        for (let year = previous.seasonStartYear + 1; year < row.seasonStartYear; year += 1) missingSeasonStartYears.push(year);
        const boundary = Object.freeze({ entityId, fromSeasonStartYear: previous.seasonStartYear,
          toSeasonStartYear: row.seasonStartYear, missingSeasonStartYears: Object.freeze(missingSeasonStartYears) });
        gaps.push(boundary);
        missingSeasonBoundaryCount++;
        rawBlocks.push({ rows: blockRows, splitBefore });
        blockRows = [];
        splitBefore = boundary;
      }
      blockRows.push(row);
    }
    if (blockRows.length) rawBlocks.push({ rows: blockRows, splitBefore });

    const blocks = rawBlocks.map(({ rows: contiguousRows, splitBefore: precedingGap }, index) => {
      contiguousBlockCount++;
      const transitions = [];
      for (let cursor = 1; cursor < contiguousRows.length; cursor += 1) {
        const from = contiguousRows[cursor - 1], to = contiguousRows[cursor];
        // The block splitter guarantees adjacency; keep the invariant explicit
        // so later callers cannot accidentally turn a gap into a transition.
        if (to.seasonStartYear !== from.seasonStartYear + 1) fail('Season transition block contains a non-adjacent season pair.');
        const deltas = {}, supportCounts = {};
        for (const field of valueFields) {
          const supported = finite(from.values[field]) && finite(to.values[field]);
          deltas[field] = supported ? rounded(to.values[field] - from.values[field]) : null;
          supportCounts[field] = supported ? 1 : 0;
          if (supported) {
            metricDeltaSupportCounts[field]++;
            transitionSamplesByField[field].push({
              change: to.values[field] - from.values[field],
              pair: Object.freeze({ entityId, fromSeasonStartYear: from.seasonStartYear, fromSeasonId: from.seasonId,
                toSeasonStartYear: to.seasonStartYear, toSeasonId: to.seasonId }),
            });
          }
        }
        const transition = Object.freeze({ entityId, fromSeasonStartYear: from.seasonStartYear, toSeasonStartYear: to.seasonStartYear,
          fromSeasonId: from.seasonId, toSeasonId: to.seasonId, seasonGap: 1, supportCount: 1,
          metricSupportCounts: Object.freeze(supportCounts), deltas: Object.freeze(deltas) });
        transitions.push(transition);
        allTransitions.push(transition);
        transitionSupportCount++;
      }
      return Object.freeze({
        blockId: `${entityId}:block-${index + 1}`,
        entityId,
        blockIndex: index + 1,
        firstSeasonStartYear: contiguousRows[0].seasonStartYear,
        lastSeasonStartYear: contiguousRows.at(-1).seasonStartYear,
        seasonCount: contiguousRows.length,
        splitBefore: precedingGap,
        transitionSupportCount: transitions.length,
        sourceSeasons: Object.freeze(contiguousRows.map(row => Object.freeze({ seasonStartYear: row.seasonStartYear, seasonId: row.seasonId }))),
        transitions: Object.freeze(transitions),
      });
    });
    return Object.freeze({ entityId, seasonCount: rows.length, blockCount: blocks.length,
      transitionSupportCount: blocks.reduce((sum, block) => sum + block.transitionSupportCount, 0),
      blocks: Object.freeze(blocks) });
  });
  const validation = validateTransitionValidationLedger(temporalValidationLedger, {
    sourceRows: normalizedRows, transitions: allTransitions, valueFields,
  });
  const transitionStability = summarizeTransitionStability(transitionSamplesByField, transitionSupportCount, validation);
  return deepFreeze({
    version: 'contiguous-season-transitions-v1',
    status: 'ready',
    interpretation: validation.status === 'validated'
      ? 'adjacent-season descriptive transitions accompanied by a supplied ledger that pins the source seasons and exact held-out adjacent transitions; no transition is inferred across an unheld season'
      : 'descriptive adjacent-season transitions only; no predictive, causal, or gap-bridging claim is made',
    sourceFields: Object.freeze({ entityIdField, seasonStartYearField, seasonIdField, valueFields: Object.freeze([...valueFields]) }),
    sourceRecordCount: normalizedRows.length,
    entityCount: entities.length,
    contiguousBlockCount,
    transitionSupportCount,
    missingSeasonBoundaryCount,
    missingSeasonBoundaries: Object.freeze(gaps),
    metricDeltaSupportCounts: Object.freeze(metricDeltaSupportCounts),
    transitionStability,
    validation,
    entities: Object.freeze(entities),
  });
}

function normalizedOutcomeStatus(value, label) {
  if (value === 'decided') return 'decided';
  if (value === 'unresolved' || value === 'unresolved-tie') return 'unresolved-tie';
  fail(`${label} must be decided or explicitly unresolved.`);
}

/**
 * Summarize which simulated games can contribute to a season table or title.
 * Scheduled eligibility records the calendar rule; effective eligibility
 * additionally requires a completed simulation and a decided winner.
 */
export function summarizeSeasonOutcomeEligibility(gameOutcomes, { expectedGameIds = null } = {}) {
  if (!Array.isArray(gameOutcomes)) fail('Season outcome eligibility needs a game-outcome array.');
  const expectedIds = expectedGameIds === null ? null : expectedGameIds.map((value, index) =>
    normalizedIdentifier(value, `Expected forecast game ${index + 1} ID`));
  if (expectedIds && new Set(expectedIds).size !== expectedIds.length) fail('Expected forecast game IDs must be unique.');

  const seen = new Set();
  let completedGames = 0, decidedGames = 0, unresolvedTies = 0, incompleteGames = 0;
  let scheduledStandingsGames = 0, standingsEligibleGames = 0;
  const normalized = gameOutcomes.map((raw, index) => {
    const game = requiredObject(raw, `Season outcome ${index + 1}`);
    const gameId = normalizedIdentifier(game.gameId ?? game.id, `Season outcome ${index + 1} game ID`);
    if (seen.has(gameId)) fail(`Season outcome ${gameId} is duplicated.`);
    seen.add(gameId);
    const executionStatus = game.executionStatus ?? game.completionStatus;
    if (!['complete', 'incomplete'].includes(executionStatus)) {
      fail(`Season outcome ${gameId} needs an explicit complete or incomplete execution status.`);
    }
    const resolutionStatus = normalizedOutcomeStatus(game.resolutionStatus ?? game.outcomeStatus, `Season outcome ${gameId} resolution status`);
    if (typeof game.scheduledStandingsEligible !== 'boolean') {
      fail(`Season outcome ${gameId} needs an explicit scheduledStandingsEligible boolean.`);
    }
    const winner = game.winner == null ? null : typeof game.winner === 'string' ? game.winner.trim() : '';
    if (winner !== null && (!winner || winner.length > 120 || /[\u0000-\u001f\u007f]/.test(winner))) {
      fail(`Season outcome ${gameId} winner must be a bounded team name or ID.`);
    }
    if (resolutionStatus === 'decided' && !winner) fail(`Decided season outcome ${gameId} must name its winner.`);
    if (resolutionStatus === 'unresolved-tie' && winner !== null) fail(`Unresolved season outcome ${gameId} cannot name a winner.`);

    const overtimePeriods = game.overtimePeriodsPlayed ?? game.overtimes;
    const overtimeLimit = game.overtimePeriodLimit ?? game.maxOvertimes;
    if (overtimePeriods !== undefined && !integer(overtimePeriods, 0, 100)) fail(`Season outcome ${gameId} has an invalid overtime-period count.`);
    if (overtimeLimit !== undefined && !integer(overtimeLimit, 0, 100)) fail(`Season outcome ${gameId} has an invalid overtime-period limit.`);
    if (overtimePeriods !== undefined && overtimeLimit !== undefined && overtimePeriods > overtimeLimit) {
      fail(`Season outcome ${gameId} exceeds its declared overtime-period limit.`);
    }
    if (game.overtimeCapReached !== undefined && typeof game.overtimeCapReached !== 'boolean') {
      fail(`Season outcome ${gameId} has an invalid overtime-cap status.`);
    }
    if ((game.resolutionStatus === 'unresolved' || game.resolutionStatus === 'unresolved-tie'
      || game.outcomeStatus === 'unresolved' || game.outcomeStatus === 'unresolved-tie')
      && game.overtimeCapReached === false) {
      fail(`Unresolved season outcome ${gameId} cannot be marked as below its overtime cap.`);
    }

    const completed = executionStatus === 'complete';
    const decided = completed && resolutionStatus === 'decided';
    const unresolvedTie = completed && resolutionStatus === 'unresolved-tie';
    if (!completed && (resolutionStatus === 'decided' || winner !== null)) {
      fail(`Incomplete season outcome ${gameId} cannot claim a decided winner.`);
    }
    if (completed) completedGames++;
    else incompleteGames++;
    if (decided) decidedGames++;
    if (unresolvedTie) unresolvedTies++;
    if (game.scheduledStandingsEligible) scheduledStandingsGames++;
    const standingsEligible = game.scheduledStandingsEligible && decided;
    if (standingsEligible) standingsEligibleGames++;
    return Object.freeze({ gameId, executionStatus, resolutionStatus, winner,
      scheduledStandingsEligible: game.scheduledStandingsEligible, standingsEligible,
      overtimePeriodsPlayed: overtimePeriods ?? null, overtimePeriodLimit: overtimeLimit ?? null,
      overtimeCapReached: game.overtimeCapReached ?? null });
  });

  const submittedIds = [...seen].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const missingGameIds = expectedIds ? expectedIds.filter(id => !seen.has(id)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [];
  const unexpectedGameIds = expectedIds ? submittedIds.filter(id => !expectedIds.includes(id)) : [];
  const scheduleCoverage = expectedIds === null ? 'unverified'
    : missingGameIds.length || unexpectedGameIds.length ? 'partial' : 'complete';
  const championshipEligible = scheduleCoverage === 'complete' && scheduledStandingsGames > 0 && unresolvedTies === 0
    && incompleteGames === 0 && standingsEligibleGames === scheduledStandingsGames;

  return deepFreeze({
    version: SEASON_FORECAST_OUTCOME_ELIGIBILITY_VERSION,
    status: scheduleCoverage === 'complete' && incompleteGames === 0 ? 'complete'
      : scheduleCoverage === 'unverified' ? 'coverage-unverified' : 'incomplete',
    scope: 'one-simulated-game-set',
    scheduleCoverage,
    expectedGameCount: expectedIds?.length ?? null,
    submittedGameCount: normalized.length,
    missingGameIds,
    unexpectedGameIds,
    completedGames,
    incompleteGames,
    decidedGames,
    unresolvedTies,
    scheduledStandingsGames,
    standingsEligibleGames,
    excludedFromStandingsGames: scheduledStandingsGames - standingsEligibleGames,
    championshipEligible,
    championshipEligibilityReason: championshipEligible ? null
      : unresolvedTies ? 'unresolved-ties-withhold-standings-and-championship-eligibility'
        : incompleteGames ? 'incomplete-games-withhold-standings-and-championship-eligibility'
          : scheduleCoverage !== 'complete' ? 'exact-schedule-coverage-not-established'
            : 'one-or-more-scheduled-games-are-not-standings-eligible',
    games: normalized,
  });
}

function normalizeMonteCarloError(value) {
  if (value == null) return Object.freeze({ status: 'not-supplied' });
  const entry = requiredObject(value, 'Monte Carlo error receipt');
  const sampleSize = entry.sampleSize ?? entry.trials ?? null;
  if (sampleSize !== null && !integer(sampleSize, 1, 10_000_000)) fail('Monte Carlo error sample size must be a positive whole number.');
  const standardError = (candidate, label) => {
    if (candidate === undefined || candidate === null) return null;
    if (!finite(candidate) || candidate < 0) fail(`${label} must be a finite nonnegative standard error.`);
    return rounded(candidate);
  };
  const pair = (candidate, label) => {
    if (candidate == null) return null;
    const record = requiredObject(candidate, label);
    return Object.freeze({
      a: standardError(record.a, `${label} A`),
      b: standardError(record.b, `${label} B`),
      ...(record.unresolved === undefined ? {} : { unresolved: standardError(record.unresolved, `${label} unresolved`) }),
    });
  };
  const scores = pair(entry.scoreMeanStandardError ?? entry.scoreStandardError, 'Monte Carlo score standard error');
  const outcomeProbabilities = pair(entry.outcomeProbabilityStandardError ?? entry.winRateStandardError, 'Monte Carlo outcome-probability standard error');
  const margin = standardError(entry.marginStandardError, 'Monte Carlo margin standard error');
  const hasValue = Boolean((scores && Object.values(scores).some(finite))
    || (outcomeProbabilities && Object.values(outcomeProbabilities).some(finite)) || margin !== null);
  return Object.freeze({
    status: hasValue ? 'available' : 'not-supplied',
    method: typeof entry.method === 'string' && entry.method.trim() ? entry.method.trim() : null,
    sampleSize,
    scoreMeanStandardError: scores,
    marginStandardError: margin,
    outcomeProbabilityStandardError: outcomeProbabilities,
    interpretation: 'sampling-noise-only; distinct from held-out forecast model error',
  });
}

function acceptedForecastModelError(sourceRecord, backtestLedgerSha256) {
  const validation = sourceRecord.forecastValidation;
  if (!validation || validation.status !== 'validated' || validation.ledgerSha256 !== backtestLedgerSha256
    || !validation.aggregate || !Number.isSafeInteger(validation.holdoutCount) || validation.holdoutCount < 1) {
    return Object.freeze({ status: 'unavailable', reason: 'no-matching-validated-holdout-ledger' });
  }
  const metric = (key, unit) => {
    const value = validation.aggregate[key];
    if (!value || !finite(value.rmse) || value.rmse < 0 || !finite(value.mae) || value.mae < 0) return null;
    return Object.freeze({ mae: rounded(value.mae), rmse: rounded(value.rmse), unit });
  };
  const teamWins = metric('teamWins', 'wins');
  const teamNetRating = metric('teamNetRating', 'points-per-100-possessions');
  if (!teamWins && !teamNetRating) return Object.freeze({ status: 'unavailable', reason: 'validated-ledger-has-no-usable-error-metrics' });
  return Object.freeze({
    status: 'available',
    source: 'accepted-rolling-holdout-ledger',
    ledgerSha256: backtestLedgerSha256,
    holdoutCount: validation.holdoutCount,
    holdoutContinuity: validation.holdoutContinuity || null,
    metrics: Object.freeze({ teamWins, teamNetRating }),
    interpretation: 'held-out predictive-error scale; not Monte Carlo standard error, a confidence interval, or a per-run latent draw',
  });
}

/**
 * Produce a deterministic receipt for a saved/replayed forecast simulation.
 * It is intentionally timestamp-free: matching manifest, model, schedule,
 * seed, and repeat count always yield the same receipt.
 */
export function createSeasonForecastReplayReceipt(evidence, { seed, repeats, gameOutcomes, monteCarloError } = {}) {
  const source = evidence?.source || evidence;
  const sourceRecord = requiredObject(source, 'Forecast evidence source');
  const forecast = requiredObject(sourceRecord.forecastManifest, 'Forecast evidence manifest receipt');
  if (sourceRecord.kind !== 'forecast-season' || sourceRecord.forecastEvidence !== true || sourceRecord.acceptedForecastManifest !== true) {
    fail('Forecast replay receipts require accepted forecast-season evidence.');
  }
  const manifestId = normalizedIdentifier(forecast.manifestId, 'Forecast replay manifest ID');
  const manifestVersion = normalizedIdentifier(forecast.manifestVersion, 'Forecast replay manifest version');
  const contentSha256 = normalizedHash(forecast.contentSha256, 'Forecast replay manifest SHA-256');
  const profileSha256 = normalizedHash(forecast.profileSha256, 'Forecast replay profile SHA-256');
  const scheduleSha256 = normalizedHash(forecast.scheduleSha256, 'Forecast replay schedule SHA-256');
  const backtestLedgerSha256 = normalizedHash(forecast.backtestLedgerSha256, 'Forecast replay backtest SHA-256');
  const normalizedSeed = typeof seed === 'string' ? seed.trim() : '';
  if (!SEED.test(normalizedSeed)) fail('Forecast replay receipts need a short deterministic seed.');
  const normalizedRepeats = Number(repeats);
  if (!integer(normalizedRepeats, 1, 500)) fail('Forecast replay receipts need one through 500 repeats.');
  const outcomeEligibility = gameOutcomes === undefined
    ? Object.freeze({ status: 'not-supplied', version: SEASON_FORECAST_OUTCOME_ELIGIBILITY_VERSION })
    : summarizeSeasonOutcomeEligibility(gameOutcomes, {
      expectedGameIds: Array.isArray(evidence?.schedule?.games) ? evidence.schedule.games.map(game => game.id) : null,
    });
  const normalizedMonteCarloError = normalizeMonteCarloError(monteCarloError);
  const modelError = acceptedForecastModelError(sourceRecord, backtestLedgerSha256);
  const replayKey = [SEASON_FORECAST_REPLAY_RECEIPT_VERSION, manifestId, manifestVersion, contentSha256, profileSha256, scheduleSha256, backtestLedgerSha256, normalizedSeed, normalizedRepeats].join('|');
  return Object.freeze({
    version: SEASON_FORECAST_REPLAY_RECEIPT_VERSION,
    manifestId,
    manifestVersion,
    contentSha256,
    profileSha256,
    scheduleSha256,
    backtestLedgerSha256,
    seed: normalizedSeed,
    repeats: normalizedRepeats,
    replayKey,
    outcomeEligibility,
    uncertaintyAttribution: Object.freeze({
      monteCarloError: normalizedMonteCarloError,
      forecastModelError: modelError,
      componentsKeptSeparate: true,
    }),
  });
}

// Kept exported for focused browser-safe tests and callers that need to make a
// hash pin before persisting a manifest descriptor. It only encodes JSON; it
// never claims a value is an accepted forecast.
export function utf8Bytes(value) {
  return encoder.encode(typeof value === 'string' ? value : JSON.stringify(value));
}
