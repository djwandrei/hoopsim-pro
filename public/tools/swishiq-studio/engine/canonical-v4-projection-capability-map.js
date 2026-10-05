/*
 * Structural and projection-link checks for the versioned public V4
 * capability-to-artifact map. The digest is computed by each caller over
 * canonicalV4IdentityJson(map), so browser and Node paths use the same bytes.
 */

export const CANONICAL_V4_PROJECTION_CAPABILITY_MAP_FORMAT = 'djhc-swishiq-v4-projection-capability-map-v1';
export const CANONICAL_V4_PROJECTION_CAPABILITY_MAP_VERSION = 'swishiq-v4-projection-capability-map-v1';

const CAPABILITY_ID = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const SEASON_YEAR = value => Number.isSafeInteger(value) && value >= 1947 && value <= 2200;
const CAPABILITY_FIELDS = new Set([
  'nativeCapabilityId', 'capabilityClass', 'requiredArtifactIds', 'artifactIds', 'evidenceState',
  'pooledEligibility', 'predictiveValidationStatus', 'upstreamApprovalStatus',
  'v4ProductionApprovalStatus', 'executionReadiness', 'missingRequirements',
  'provenancePolicy', 'seasonCoverage',
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim())
    && new Set(value).size === value.length;
}

function uniqueYears(value) {
  return Array.isArray(value) && value.every(SEASON_YEAR) && new Set(value).size === value.length;
}

/** Return contract or index-link issues; callers decide how to surface failure. */
export function canonicalV4ProjectionCapabilityMapIssues(map, artifactIds, capabilitySummary = null, packageScope = null) {
  const issues = [];
  if (!isObject(map)
    || map.format !== CANONICAL_V4_PROJECTION_CAPABILITY_MAP_FORMAT
    || map.version !== CANONICAL_V4_PROJECTION_CAPABILITY_MAP_VERSION
    || !isObject(map.capabilities)
    || !Object.keys(map.capabilities).length
    || Object.keys(map).some(key => !['format', 'version', 'capabilities'].includes(key))) {
    return ['map envelope is missing, malformed, or has an unsupported version'];
  }

  const availableArtifactIds = artifactIds instanceof Set ? artifactIds : new Set(artifactIds || []);
  for (const [capabilityId, capability] of Object.entries(map.capabilities)) {
    const label = 'capabilities.' + capabilityId;
    if (!CAPABILITY_ID.test(capabilityId) || !isObject(capability)
      || Object.keys(capability).some(key => !CAPABILITY_FIELDS.has(key))) {
      issues.push(label + ' has an invalid ID, value, or unexpected field');
      continue;
    }
    const required = [
      'nativeCapabilityId', 'requiredArtifactIds', 'artifactIds', 'evidenceState',
      'pooledEligibility', 'predictiveValidationStatus', 'executionReadiness',
      'missingRequirements', 'provenancePolicy', 'seasonCoverage',
    ];
    if (required.some(key => !Object.hasOwn(capability, key))) issues.push(label + ' is missing required fields');
    const sourceOnly = capability.capabilityClass === 'descriptive-source-observation';
    if (capability.capabilityClass !== undefined && !sourceOnly) {
      issues.push(label + '.capabilityClass is unsupported');
    }
    if (capability.nativeCapabilityId !== null
      && (typeof capability.nativeCapabilityId !== 'string' || !CAPABILITY_ID.test(capability.nativeCapabilityId))) {
      issues.push(label + '.nativeCapabilityId is invalid');
    }
    if (capability.nativeCapabilityId === null && !sourceOnly) {
      issues.push(label + ' has no native binding and is not declared as descriptive source-observation data');
    }
    if (sourceOnly && capability.nativeCapabilityId !== null) {
      issues.push(label + ' descriptive source-observation data must not bind to a native model capability');
    }
    if (!uniqueStrings(capability.requiredArtifactIds) || !uniqueStrings(capability.artifactIds)) {
      issues.push(label + ' artifact ID lists must contain unique nonempty strings');
    }
    if (!uniqueStrings(capability.missingRequirements)) issues.push(label + '.missingRequirements is invalid');
    if (!['evidence', 'partial', 'not-included'].includes(capability.evidenceState)) issues.push(label + '.evidenceState is invalid');
    if (!['eligible-with-explicit-acceptance', 'ineligible', 'not-applicable'].includes(capability.pooledEligibility)) {
      issues.push(label + '.pooledEligibility is invalid');
    }
    if (typeof capability.predictiveValidationStatus !== 'string' || !capability.predictiveValidationStatus.trim()) {
      issues.push(label + '.predictiveValidationStatus is missing');
    }
    if (capability.upstreamApprovalStatus !== undefined
      && capability.upstreamApprovalStatus !== null
      && (typeof capability.upstreamApprovalStatus !== 'string' || !capability.upstreamApprovalStatus.trim())) {
      issues.push(label + '.upstreamApprovalStatus is invalid');
    }
    if (capability.v4ProductionApprovalStatus !== undefined
      && capability.v4ProductionApprovalStatus !== null
      && (typeof capability.v4ProductionApprovalStatus !== 'string' || !capability.v4ProductionApprovalStatus.trim())) {
      issues.push(label + '.v4ProductionApprovalStatus is invalid');
    }
    const readiness = capability.executionReadiness;
    if (!isObject(readiness)
      || Object.keys(readiness).sort().join(',') !== 'descriptiveDataAccess,modelExecution'
      || !['available', 'partial', 'not-included'].includes(readiness.descriptiveDataAccess)
      || !['not-applicable', 'not-run', 'not-included', 'blocked-upstream-approval', 'blocked-model-validation', 'blocked-production-approval'].includes(readiness.modelExecution)) {
      issues.push(label + '.executionReadiness is invalid');
    }
    const seasonCoverage = capability.seasonCoverage;
    if (!isObject(seasonCoverage)
      || Object.keys(seasonCoverage).sort().join(',') !== 'coverageState,expectedSeasonStartYears,includedSeasonStartYears,missingSeasonStartYears,rowsBySeason'
      || !['complete', 'partial', 'not-included', 'not-applicable'].includes(seasonCoverage.coverageState)
      || !uniqueYears(seasonCoverage.expectedSeasonStartYears)
      || !uniqueYears(seasonCoverage.includedSeasonStartYears)
      || !uniqueYears(seasonCoverage.missingSeasonStartYears)
      || !Array.isArray(seasonCoverage.rowsBySeason)
      || seasonCoverage.rowsBySeason.some(row => !isObject(row)
        || Object.keys(row).sort().join(',') !== 'rows,seasonStartYear'
        || !SEASON_YEAR(row.seasonStartYear)
        || !Number.isSafeInteger(row.rows) || row.rows < 0)) {
      issues.push(label + '.seasonCoverage is invalid');
    }
    if (!['minimal-public-source-version-retrieval-effective-season', 'none'].includes(capability.provenancePolicy)) {
      issues.push(label + '.provenancePolicy is invalid');
    }
    if (sourceOnly) {
      if (capability.predictiveValidationStatus !== 'not-applicable-descriptive-only') {
        issues.push(label + ' descriptive source-observation data must not claim predictive validation');
      }
      if (capability.executionReadiness?.modelExecution !== 'not-applicable') {
        issues.push(label + ' descriptive source-observation data must not claim model execution readiness');
      }
      if (!Array.isArray(capability.requiredArtifactIds) || !capability.requiredArtifactIds.length) {
        issues.push(label + ' descriptive source-observation data must declare required source artifacts');
      }
      if (capability.upstreamApprovalStatus != null || capability.v4ProductionApprovalStatus != null) {
        issues.push(label + ' descriptive source-observation data must not claim native or production approval');
      }
      sourceSeasonCoverageIssues(capability.seasonCoverage, label, issues, packageScope);
    }
    for (const artifactId of Array.isArray(capability.artifactIds) ? capability.artifactIds : []) {
      if (!availableArtifactIds.has(artifactId)) issues.push(label + ' references absent artifact ' + artifactId);
    }

    if (capability.evidenceState === 'not-included') {
      if (capability.artifactIds?.length !== 0 || readiness?.descriptiveDataAccess !== 'not-included'
        || readiness?.modelExecution !== 'not-included'
        || !['not-included', 'not-applicable'].includes(seasonCoverage?.coverageState)
        || seasonCoverage?.includedSeasonStartYears?.length !== 0) {
        issues.push(label + ' not-included state conflicts with its access, artifacts, or coverage');
      }
    } else if (capability.evidenceState === 'evidence' || capability.evidenceState === 'partial') {
      const expectedAccess = capability.evidenceState === 'evidence' ? 'available' : 'partial';
      if (!Array.isArray(capability.artifactIds) || !capability.artifactIds.length
        || readiness?.descriptiveDataAccess !== expectedAccess
        || !['complete', 'partial', 'not-applicable'].includes(seasonCoverage?.coverageState)) {
        issues.push(label + ' evidence state conflicts with its access, artifacts, or coverage');
      }
      if (capability.evidenceState === 'evidence'
        && Array.isArray(capability.requiredArtifactIds)
        && capability.requiredArtifactIds.some(id => !capability.artifactIds.includes(id))) {
        issues.push(label + ' claims full evidence without all required artifact IDs');
      }
      if (capability.nativeCapabilityId === null && !sourceOnly) {
        issues.push(label + ' has artifact evidence but no native capability binding');
      }
    }

    if (capability.nativeCapabilityId && capabilitySummary) {
      const nativeState = capabilitySummary[capability.nativeCapabilityId];
      if (!isObject(nativeState)) issues.push(label + ' names absent native capability ' + capability.nativeCapabilityId);
      else if (capability.evidenceState === 'evidence' && nativeState.evidenceStatus !== 'available') {
        issues.push(label + ' claims full evidence while native capability ' + capability.nativeCapabilityId + ' is not available');
      }
    }
  }
  return issues;
}

function sourceSeasonCoverageIssues(coverage, label, issues, packageScope) {
  const expected = coverage?.expectedSeasonStartYears;
  const included = coverage?.includedSeasonStartYears;
  const missing = coverage?.missingSeasonStartYears;
  const rows = coverage?.rowsBySeason;
  if (!Array.isArray(expected) || !expected.length
    || !Array.isArray(included) || !Array.isArray(missing) || !Array.isArray(rows)) return;

  const expectedSet = new Set(expected);
  const includedSet = new Set(included);
  const missingSet = new Set(missing);
  const rowByYear = new Map(rows.map(row => [row?.seasonStartYear, row?.rows]));
  const ordered = values => values.every((year, index) => index === 0 || year > values[index - 1]);
  if (packageScope && (!Array.isArray(packageScope.seasonStartYears)
    || packageScope.seasonStartYears.length !== expected.length
    || packageScope.seasonStartYears.some((year, index) => year !== expected[index]))) {
    issues.push(label + '.seasonCoverage expected years must match its exact or pooled package scope');
  }
  if (!ordered(expected) || !ordered(included) || !ordered(missing)) {
    issues.push(label + '.seasonCoverage years must be ordered and unique');
  }
  if (included.some(year => !expectedSet.has(year)) || missing.some(year => !expectedSet.has(year))
    || included.some(year => missingSet.has(year))
    || expected.some(year => !includedSet.has(year) && !missingSet.has(year))) {
    issues.push(label + '.seasonCoverage included and missing years must partition expected years');
  }
  if (coverage.coverageState === 'complete' && (missing.length || included.length !== expected.length)) {
    issues.push(label + '.seasonCoverage complete state conflicts with included/missing years');
  } else if (coverage.coverageState === 'partial' && (!included.length || !missing.length)) {
    issues.push(label + '.seasonCoverage partial state requires both included and missing years');
  } else if (coverage.coverageState === 'not-included' && (included.length || missing.length !== expected.length)) {
    issues.push(label + '.seasonCoverage not-included state conflicts with included/missing years');
  } else if (!['complete', 'partial', 'not-included'].includes(coverage.coverageState)) {
    issues.push(label + '.seasonCoverage must describe seasonal source coverage');
  }
  if (rows.length !== included.length
    || included.some(year => !rowByYear.has(year) || !Number.isSafeInteger(rowByYear.get(year)) || rowByYear.get(year) < 1)
    || rows.some(row => !includedSet.has(row?.seasonStartYear))) {
    issues.push(label + '.seasonCoverage rowsBySeason must count each included year exactly once');
  }
}
