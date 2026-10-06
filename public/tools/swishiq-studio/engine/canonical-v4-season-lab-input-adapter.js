import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  loadCanonicalV4StudioExactSeasonData,
} from './canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import { resolveCanonicalV4SiteConsumerSourcePolicy } from './canonical-v4-site-consumer-policy.js?v=20261002e&rev=canonical-v4-site-consumer-policy-v2-dependency-cache-closure';

export const CANONICAL_V4_SEASON_LAB_INPUT_ADAPTER_FORMAT = 'djhc-swishiq-v4-season-lab-observed-inputs-v1';
export const CANONICAL_V4_SEASON_LAB_INPUT_ADAPTER_VERSION = 'swishiq-v4-season-lab-observed-inputs-v1';
export const CANONICAL_V4_SEASON_LAB_CAPABILITY = 'seasonLabInputs';
export const CANONICAL_V4_SEASON_LAB_TEAM_STYLE_ARTIFACT = 'team-styles';

const SUPPORTED_YEARS = Object.freeze(Array.from({ length: 9 }, (_, index) => 2017 + index));
const REQUIRED_RATE_METRICS = Object.freeze(['offense', 'defense', 'pace48']);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function exactPackageId(year) {
  return `nba-swishiq-v4-${year}-${String(year + 1).slice(-2)}`;
}

function metricValue(record, key) {
  const metric = record?.values?.metrics?.[key];
  return metric?.status === 'available' && Number.isFinite(metric.value) ? metric.value : null;
}

export function listCanonicalV4SeasonLabExactChoices(releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN) {
  const expected = Array.isArray(releasePin?.expectedIdentity?.packages) ? releasePin.expectedIdentity.packages : [];
  const pins = Array.isArray(releasePin?.packagePins) ? releasePin.packagePins : [];
  if (releasePin?.status !== 'reviewed') return Object.freeze([]);
  return Object.freeze(expected
    .filter(row => row?.scope?.kind === 'exact-season' && row.scope.seasonStartYears?.length === 1
      && SUPPORTED_YEARS.includes(row.scope.seasonStartYears[0])
      && Array.isArray(row.scope.phases) && row.scope.phases.includes('regular')
      && pins.some(pin => pin?.packageId === row.packageId
        && pin.indexSha256 && pin.capabilityMapSha256 && pin.sourceLockDigestKind === 'full-lock-object'
        && pin.sourceLockSha256 && pin.sourceLockEmbeddedSha256 && pin.sourceLockFileSha256
        && Number.isSafeInteger(pin.sourceLockFileByteLength) && pin.sourceLockSchemaSha256))
    .map(row => Object.freeze({
      key: `exact-season:${row.packageId}@${row.packageVersion}`,
      packageId: row.packageId,
      packageVersion: row.packageVersion,
      seasonStartYear: row.scope.seasonStartYears[0],
      label: `${row.scope.seasonStartYears[0]}–${String(row.scope.seasonStartYears[0] + 1).slice(-2)} · V4 descriptive inputs`,
      sourceMode: 'canonical-v4-required',
    }))
    .sort((left, right) => left.seasonStartYear - right.seasonStartYear));
}

/** Load exact regular-season team-rate evidence; never executes Season Lab. */
export async function loadCanonicalV4SeasonLabObservedInputs({
  seasonStartYear,
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  ...options
} = {}) {
  const policy = resolveCanonicalV4SiteConsumerSourcePolicy({ releasePin, consumerId: 'studio-native-season-lab' });
  if (!policy.v4Required || !policy.releaseReady) fail('season-lab-v4-release-unavailable', policy.reason);
  if (!SUPPORTED_YEARS.includes(seasonStartYear)) fail('season-lab-v4-scope-invalid', 'Choose one exact V4 season from 2017–26.');

  const verified = await loadCanonicalV4StudioExactSeasonData({
    seasonStartYear,
    phases: ['regular'],
    capabilityId: CANONICAL_V4_SEASON_LAB_CAPABILITY,
    releasePin,
    ...options,
  });
  if (verified.capabilityId !== CANONICAL_V4_SEASON_LAB_CAPABILITY
    || verified.capability?.evidenceState !== 'evidence'
    || verified.capability?.descriptiveDataAccess !== 'available'
    || !['not-applicable', 'blocked-production-approval'].includes(verified.capability?.modelExecution)
    || !['not-applicable-descriptive-only', 'not-run'].includes(verified.capability?.predictiveValidationStatus)) {
    fail('season-lab-v4-model-boundary', 'The selected V4 capability does not provide approved descriptive inputs; Season Lab model execution remains separately gated.');
  }
  if (verified.package?.packageId !== exactPackageId(seasonStartYear)
    || verified.scope?.kind !== 'exact-season'
    || verified.scope?.seasonStartYears?.length !== 1
    || verified.scope.seasonStartYears[0] !== seasonStartYear
    || !verified.scope?.phases?.includes('regular')) {
    fail('season-lab-v4-scope-mismatch', 'The verified V4 package is not the requested exact regular season.');
  }
  const part = verified.parts?.[CANONICAL_V4_SEASON_LAB_TEAM_STYLE_ARTIFACT];
  if (!part || part.status !== 'verified' || part.artifactId !== CANONICAL_V4_SEASON_LAB_TEAM_STYLE_ARTIFACT
    || !Array.isArray(part.records) || part.records.length !== part.rows) {
    fail('season-lab-v4-team-rate-artifact-unavailable', 'The verified V4 Season Lab capability does not contain team-styles rows.');
  }
  const selected = part.records.filter(row => row?.time?.seasonStartYear === seasonStartYear && row?.time?.phase === 'regular');
  const teamRows = selected.map((record, index) => {
    if (record?.temporalUse?.role !== 'descriptive'
      || record?.temporalUse?.eligibleForPredictiveFeatures !== false
      || record?.evidence?.status !== 'available') {
      fail('season-lab-v4-temporal-boundary-invalid', `V4 team-style row ${index + 1} is not descriptive-only observation data.`);
    }
    const teamCode = record?.values?.teamCode;
    if (typeof teamCode !== 'string' || !/^[A-Z]{3}$/.test(teamCode)) {
      fail('season-lab-v4-team-row-invalid', `V4 team-style row ${index + 1} has no exact team code.`);
    }
    const metrics = Object.fromEntries(REQUIRED_RATE_METRICS.map(key => [key, metricValue(record, key)]));
    if (REQUIRED_RATE_METRICS.some(key => !Number.isFinite(metrics[key]))) {
      fail('season-lab-v4-team-rate-incomplete', `V4 ${teamCode} is missing an observed offense, defense, or pace rate.`);
    }
    return Object.freeze({
      teamCode,
      seasonStartYear,
      phase: 'regular',
      recordId: record.recordId,
      rates: Object.freeze(metrics),
      temporalUse: Object.freeze({ role: 'descriptive', eligibleForPredictiveFeatures: false }),
    });
  });
  const teamCodes = teamRows.map(row => row.teamCode);
  if (teamRows.length !== 30 || new Set(teamCodes).size !== 30) {
    fail('season-lab-v4-team-coverage-incomplete', `V4 ${seasonStartYear} regular team rates do not contain exactly 30 unique teams.`);
  }
  return Object.freeze({
    format: CANONICAL_V4_SEASON_LAB_INPUT_ADAPTER_FORMAT,
    version: CANONICAL_V4_SEASON_LAB_INPUT_ADAPTER_VERSION,
    status: 'verified-exact-season-descriptive-team-rates',
    sourceMode: 'canonical-v4-required',
    package: verified.package,
    scope: verified.scope,
    source: verified.source,
    capability: verified.capability,
    rowCount: teamRows.length,
    teamRows: Object.freeze(teamRows),
    modelBoundary: Object.freeze({
      observedInputsReady: true,
      modelExecution: 'not-performed',
    modelExecutionReadiness: verified.capability.modelExecution,
      predictiveValidationStatus: verified.capability.predictiveValidationStatus,
      predictionsEnabled: false,
      approvalClaimsMade: false,
    }),
  });
}
