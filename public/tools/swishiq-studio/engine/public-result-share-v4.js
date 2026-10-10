/*
 * V4-only projection for signed public-result shares. V3 summaries keep their
 * own projector and registry checks; this path requires exact-season V4
 * package proof and an explicitly available, validated, approved capability.
 */

import { projectPublicResultShareV1 } from './public-result-share.js?v=20260930f';

export const PUBLIC_RESULT_SHARE_V4_FORMAT = 'djhc-swishiq-public-result-share-v4';
export const PUBLIC_RESULT_SHARE_V4_VERSION = 1;

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9._-]{0,119}$/i;
const VERSION = /^[a-z0-9][a-z0-9._-]{0,119}$/i;
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const V4_PIN_KEYS = Object.freeze([
  'format', 'releaseId', 'registrySha256', 'registryRevisionSha256', 'packageId', 'packageVersion',
  'packageManifestSha256', 'sourceLockSha256', 'sourceLockDigestKind', 'indexSha256',
  'projectionContentSha256', 'capabilityMapSha256', 'modelId', 'normalizerVersion',
  'metricsVersion', 'contractVersion', 'interfaceVersion', 'scope',
]);
const V4_SHARE_CAPABILITY_REQUIREMENTS = Object.freeze({
  'lineup-lab:lineup': Object.freeze(['boxScore', 'exactSeasonImpact', 'lineupEvidence']),
  'lineup-lab:rotation': Object.freeze(['boxScore', 'lineupEvidence']),
  'fix-the-five:fix-the-five': Object.freeze(['boxScore', 'exactSeasonImpact']),
  'fix-the-five:fix-the-five-run': Object.freeze(['boxScore', 'exactSeasonImpact']),
  'draft-night:draft-night': Object.freeze(['boxScore', 'exactSeasonImpact']),
  'swishiq-studio:game': Object.freeze(['gameLabInputs']),
  'swishiq-studio:season': Object.freeze(['seasonLabInputs']),
  'swishiq-studio:composite': Object.freeze(['compositeForgeInputs']),
  'swishiq-studio:career': Object.freeze(['careerHistory']),
  'nba-analytics-explorer:career': Object.freeze(['careerHistory']),
  'nba-analytics-explorer:composite': Object.freeze(['compositeForgeInputs']),
  'exact-lineup-studies:lineup': Object.freeze(['boxScore', 'lineupEvidence']),
  'pair-fit-lab:lineup': Object.freeze(['chemistry']),
  'position-lens:composite': Object.freeze(['compositeForgeInputs']),
});
const V4_FIX_THE_FIVE_RUN_INPUT_FORMAT = 'swishiq-fix-the-five-v4-run-input-v1';
const V4_FIX_THE_FIVE_RUN_OUTPUT_FORMAT = 'swishiq-fix-the-five-v4-run-summary-v1';

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('payload contains a non-finite number.');
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isRecord(value)) fail('payload contains an unsupported value.');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function fail(message) {
  throw new TypeError(`V4 public result share: ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireText(value, label, pattern = null) {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) {
    fail(`${label} is missing or invalid.`);
  }
  return value;
}

function requireHash(value, label) {
  return requireText(value, label, HASH);
}

function verifiedPackagePin(proof, capabilityId, scope) {
  if (!isRecord(proof) || proof.format !== 'djhc-swishiq-v4-studio-runtime-adapter-v2'
    || proof.version !== 'swishiq-v4-studio-runtime-adapter-v2'
    || proof.status !== 'verified-data-access' || proof.useBoundary?.descriptiveDataAccess !== 'verified'
    || proof.useBoundary?.approvalClaimsMade !== false) {
    fail('a loader-verified V4 package capability is required.');
  }
  if (proof.capabilityId !== capabilityId || proof.capability?.capabilityId !== capabilityId
    || proof.capability?.evidenceState !== 'evidence'
    || proof.capability?.descriptiveDataAccess !== 'available'
    || proof.capability?.modelExecution !== 'available'
    || proof.capability?.predictiveValidationStatus !== 'passed') {
    fail(`${capabilityId} has no validated V4 model-execution capability.`);
  }
  const packageIdentity = proof.package;
  const source = proof.source;
  const nativeCapabilityId = proof.capability.nativeCapabilityId;
  const capabilitySummary = packageIdentity?.capabilitySummary?.[nativeCapabilityId];
  if (!nativeCapabilityId || !isRecord(capabilitySummary)
    || capabilitySummary.evidenceStatus !== 'available'
    || capabilitySummary.modelValidationStatus !== 'passed'
    || capabilitySummary.productionApprovalStatus !== 'approved'
    || capabilitySummary.upstreamApprovalStatus !== 'approved') {
    fail(`${capabilityId} lacks passed model validation and current upstream/production approvals.`);
  }

  if (!isRecord(packageIdentity) || !isRecord(source) || !isRecord(proof.scope)
    || proof.scope.kind !== 'exact-season' || proof.scope.seasonStartYears?.length !== 1
    || proof.package.scope?.kind !== 'exact-season' || proof.package.scope.seasonStartYears?.length !== 1) {
    fail('only one exact-season V4 package can be shared.');
  }
  const seasonStartYear = proof.scope.seasonStartYears[0];
  const phase = scope?.phase;
  if (!Number.isSafeInteger(seasonStartYear) || seasonStartYear < 2017 || seasonStartYear > 2025
    || !Number.isSafeInteger(scope?.seasonStartYear) || scope.seasonStartYear !== seasonStartYear
    || scope.seasonEndYear !== seasonStartYear + 1 || !PHASES.has(phase)
    || !proof.scope.phases?.includes(phase) || !proof.package.scope.phases?.includes(phase)) {
    fail('the result scope does not match the exact V4 package phase.');
  }
  const pin = {
    format: 'djhc-swishiq-v4-public-package-pin-v1',
    releaseId: requireText(source.releaseId, 'releaseId', /^v4-site-[a-f0-9]{12}$/),
    registrySha256: requireHash(source.registrySha256, 'registrySha256'),
    registryRevisionSha256: requireHash(source.registryRevisionSha256, 'registryRevisionSha256'),
    packageId: requireText(packageIdentity.packageId, 'packageId', ID),
    packageVersion: requireText(packageIdentity.packageVersion, 'packageVersion', VERSION),
    packageManifestSha256: requireHash(packageIdentity.packageManifestSha256, 'packageManifestSha256'),
    sourceLockSha256: requireHash(packageIdentity.sourceLockSha256, 'sourceLockSha256'),
    sourceLockDigestKind: requireText(packageIdentity.sourceLockDigestKind, 'sourceLockDigestKind'),
    indexSha256: requireHash(source.indexSha256, 'indexSha256'),
    projectionContentSha256: requireHash(packageIdentity.projectionContentSha256, 'projectionContentSha256'),
    capabilityMapSha256: requireHash(source.capabilityMapSha256, 'capabilityMapSha256'),
    modelId: requireText(packageIdentity.modelId, 'modelId', ID),
    normalizerVersion: requireText(packageIdentity.normalizerVersion, 'normalizerVersion', VERSION),
    metricsVersion: requireText(packageIdentity.metricsVersion, 'metricsVersion', VERSION),
    contractVersion: requireText(packageIdentity.contractVersion, 'contractVersion', VERSION),
    interfaceVersion: requireText(packageIdentity.interfaceVersion, 'interfaceVersion', VERSION),
    scope: { kind: 'exact-season', seasonStartYear, seasonEndYear: seasonStartYear + 1, phase },
  };

  if (proof.scope.seasonStartYears.length !== 1 || proof.package.scope.seasonStartYears.length !== 1
    || proof.package.scope.seasonStartYears[0] !== seasonStartYear) {
    fail('verified V4 package identity has a mismatched season.');
  }
  return pin;
}

function legacyProjectionPin(v4Pin, proof) {
  return {
    packageId: v4Pin.packageId,
    packageVersion: v4Pin.packageVersion,
    modelId: v4Pin.modelId,
    metricsVersion: v4Pin.metricsVersion,
    packageManifestSha256: v4Pin.packageManifestSha256,
    sourceLockSha256: v4Pin.sourceLockSha256,
    registryVersion: 'swishiq-v4-public-registry-v1',
    registryRevisionSha256: v4Pin.registryRevisionSha256,
    projectionContentSha256: v4Pin.projectionContentSha256,
    normalizer: v4Pin.normalizerVersion,
    scope: v4Pin.scope,
  };
}

function projectFixTheFiveV4Run(result) {
  if (!isRecord(result) || result.status !== 'complete' || Object.keys(result).length !== 2) {
    fail('a complete V4 Fix the Five run summary is required.');
  }
  if (Object.hasOwn(result, 'runSummary')) {
    const summary = result.runSummary;
    if (!isRecord(summary) || Object.keys(summary).length !== 5
      || summary.format !== V4_FIX_THE_FIVE_RUN_OUTPUT_FORMAT
      || summary.roundsCompleted !== 5 || summary.roundsTotal !== 5
      || !Array.isArray(summary.rankCounts) || summary.rankCounts.length !== 3
      || summary.rankCounts.some(count => !Number.isSafeInteger(count) || count < 0)
      || summary.rankCounts.reduce((sum, count) => sum + count, 0) !== 5) {
      fail('the projected V4 Fix the Five run must contain five rank outcomes.');
    }
    const expectedMeanRank = (summary.rankCounts[0] + 2 * summary.rankCounts[1] + 3 * summary.rankCounts[2]) / 5;
    if (!Number.isFinite(summary.meanRank) || summary.meanRank < 1 || summary.meanRank > 3
      || Math.abs(summary.meanRank - expectedMeanRank) > 1e-9) {
      fail('the projected V4 Fix the Five rank mean does not match its counts.');
    }
    return {
      status: 'complete',
      runSummary: {
        format: V4_FIX_THE_FIVE_RUN_OUTPUT_FORMAT,
        roundsCompleted: 5,
        roundsTotal: 5,
        rankCounts: [...summary.rankCounts],
        meanRank: summary.meanRank,
      },
    };
  }

  if (!Object.hasOwn(result, 'dailyRunSummary') || !isRecord(result.dailyRunSummary)) {
    fail('a complete V4 Fix the Five run summary is required.');
  }
  const summary = result.dailyRunSummary;
  if (Object.keys(summary).length !== 4
    || summary.format !== V4_FIX_THE_FIVE_RUN_INPUT_FORMAT
    || summary.roundsCompleted !== 5 || summary.roundsTotal !== 5
    || !Array.isArray(summary.roundRanks) || summary.roundRanks.length !== 5
    || summary.roundRanks.some(rank => !Number.isSafeInteger(rank) || rank < 1 || rank > 3)) {
    fail('the V4 Fix the Five run must contain five exact three-choice ranks.');
  }
  const rankCounts = [1, 2, 3].map(rank => summary.roundRanks.filter(value => value === rank).length);
  const meanRank = summary.roundRanks.reduce((sum, rank) => sum + rank, 0) / summary.roundRanks.length;
  return {
    status: 'complete',
    runSummary: {
      format: V4_FIX_THE_FIVE_RUN_OUTPUT_FORMAT,
      roundsCompleted: 5,
      roundsTotal: 5,
      rankCounts,
      meanRank,
    },
  };
}

function normalizeV4Pin(value) {
  if (!isRecord(value) || Object.keys(value).length !== V4_PIN_KEYS.length
    || V4_PIN_KEYS.some(key => !Object.hasOwn(value, key))
    || value.format !== 'djhc-swishiq-v4-public-package-pin-v1'
    || !isRecord(value.scope)
    || value.scope.kind !== 'exact-season') {
    fail('the V4 package pin is malformed or pooled.');
  }
  const seasonStartYear = value.scope.seasonStartYear;
  if (!Number.isSafeInteger(seasonStartYear) || seasonStartYear < 2017 || seasonStartYear > 2025
    || value.scope.seasonEndYear !== seasonStartYear + 1 || !PHASES.has(value.scope.phase)) {
    fail('the V4 exact-season package scope is invalid.');
  }
  requireText(value.releaseId, 'releaseId', /^v4-site-[a-f0-9]{12}$/);
  for (const field of [
    'registrySha256', 'registryRevisionSha256', 'packageManifestSha256', 'sourceLockSha256',
    'indexSha256', 'projectionContentSha256', 'capabilityMapSha256',
  ]) requireHash(value[field], field);
  for (const field of ['packageId', 'modelId']) requireText(value[field], field, ID);
  for (const field of ['packageVersion', 'normalizerVersion', 'metricsVersion', 'contractVersion', 'interfaceVersion']) {
    requireText(value[field], field, VERSION);
  }
  requireText(value.sourceLockDigestKind, 'sourceLockDigestKind');
  const start = seasonStartYear;
  const expectedPackageId = `nba-swishiq-v4-${start}-${String(start + 1).slice(-2)}`;
  if (value.packageId !== expectedPackageId || value.modelId !== 'swishiq-canonical-v4') {
    fail('the V4 package ID or model ID does not match the exact season.');
  }
  return {
    format: value.format,
    releaseId: value.releaseId,
    registrySha256: value.registrySha256,
    registryRevisionSha256: value.registryRevisionSha256,
    packageId: value.packageId,
    packageVersion: value.packageVersion,
    packageManifestSha256: value.packageManifestSha256,
    sourceLockSha256: value.sourceLockSha256,
    sourceLockDigestKind: value.sourceLockDigestKind,
    indexSha256: value.indexSha256,
    projectionContentSha256: value.projectionContentSha256,
    capabilityMapSha256: value.capabilityMapSha256,
    modelId: value.modelId,
    normalizerVersion: value.normalizerVersion,
    metricsVersion: value.metricsVersion,
    contractVersion: value.contractVersion,
    interfaceVersion: value.interfaceVersion,
    scope: {
      kind: 'exact-season',
      seasonStartYear,
      seasonEndYear: seasonStartYear + 1,
      phase: value.scope.phase,
    },
  };
}

function projectV4PayloadShape(input) {
  const expectedCapabilities = V4_SHARE_CAPABILITY_REQUIREMENTS[`${input?.tool}:${input?.scenarioKind}`];
  if (!isRecord(input) || input.format !== PUBLIC_RESULT_SHARE_V4_FORMAT
    || input.version !== PUBLIC_RESULT_SHARE_V4_VERSION
    || !Array.isArray(input.capabilityIds) || !input.capabilityIds.length
    || input.capabilityIds.length > 10
    || input.capabilityIds.some(id => typeof id !== 'string' || !ID.test(id))
    || new Set(input.capabilityIds).size !== input.capabilityIds.length
    || !expectedCapabilities) {
    fail('the V4 share payload has an unsupported format or capability list.');
  }
  const capabilityIds = [...input.capabilityIds].sort();
  if (canonicalJson(capabilityIds) !== canonicalJson([...expectedCapabilities].sort())) {
    fail('V4 capability IDs do not match this tool and scenario contract.');
  }
  const packagePin = normalizeV4Pin(input.packagePin);
  const isFixTheFiveRun = input.tool === 'fix-the-five' && input.scenarioKind === 'fix-the-five-run';
  const base = projectPublicResultShareV1({
    tool: input.tool,
    scenarioKind: isFixTheFiveRun ? 'fix-the-five' : input.scenarioKind,
    packagePin: {
      packageId: packagePin.packageId,
      packageVersion: packagePin.packageVersion,
      modelId: packagePin.modelId,
      metricsVersion: packagePin.metricsVersion,
      packageManifestSha256: packagePin.packageManifestSha256,
      sourceLockSha256: packagePin.sourceLockSha256,
      registryVersion: 'swishiq-v4-public-registry-v1',
      registryRevisionSha256: packagePin.registryRevisionSha256,
      projectionContentSha256: packagePin.projectionContentSha256,
      normalizer: packagePin.normalizerVersion,
      scope: packagePin.scope,
    },
    result: isFixTheFiveRun
      ? { status: 'complete', decision: { rank: 1, optionCount: 1, countComplete: true } }
      : input.result,
    ...(input.board === undefined ? {} : { board: input.board }),
  });
  return Object.freeze({
    format: PUBLIC_RESULT_SHARE_V4_FORMAT,
    version: PUBLIC_RESULT_SHARE_V4_VERSION,
    tool: base.tool,
    scenarioKind: input.scenarioKind,
    capabilityIds,
    packagePin,
    result: isFixTheFiveRun ? projectFixTheFiveV4Run(input.result) : base.result,
    ...(base.board ? { board: base.board } : {}),
  });
}

/**
 * Project a model result only after every required V4 capability proof agrees
 * on one exact package and reports passed model validation plus approvals.
 * Pooled summaries are intentionally unsupported here.
 */
export function projectPublicResultShareV4(input) {
  if (!isRecord(input) || !Array.isArray(input.verifiedCapabilities)
    || !input.verifiedCapabilities.length || new Set(input.requiredCapabilityIds || []).size !== (input.requiredCapabilityIds || []).length
    || !Array.isArray(input.requiredCapabilityIds) || !input.requiredCapabilityIds.length) {
    fail('one or more required V4 capability proofs are missing.');
  }
  const capabilityIds = [...input.requiredCapabilityIds].sort();
  const expectedCapabilities = V4_SHARE_CAPABILITY_REQUIREMENTS[`${input.tool}:${input.scenarioKind}`];
  if (!expectedCapabilities
    || canonicalJson(capabilityIds) !== canonicalJson([...expectedCapabilities].sort())) {
    fail('required capabilities do not match this tool and scenario contract.');
  }
  const proofById = new Map(input.verifiedCapabilities.map(proof => [proof?.capabilityId, proof]));
  if (proofById.size !== input.verifiedCapabilities.length
    || capabilityIds.some(capabilityId => !proofById.has(capabilityId))) {
    fail('V4 capability proof IDs are missing, duplicated, or unexpected.');
  }
  const scope = input.packagePin?.scope;
  const pins = capabilityIds.map(capabilityId => verifiedPackagePin(proofById.get(capabilityId), capabilityId, scope));
  const packageIdentity = JSON.stringify(pins[0]);
  if (pins.slice(1).some(pin => JSON.stringify(pin) !== packageIdentity)) {
    fail('required capabilities do not share the same V4 package and exact scope.');
  }

  const firstProof = proofById.get(capabilityIds[0]);
  const isFixTheFiveRun = input.tool === 'fix-the-five' && input.scenarioKind === 'fix-the-five-run';
  const base = projectPublicResultShareV1({
    tool: input.tool,
    scenarioKind: isFixTheFiveRun ? 'fix-the-five' : input.scenarioKind,
    packagePin: legacyProjectionPin(pins[0], firstProof),
    result: isFixTheFiveRun
      ? { status: 'complete', decision: { rank: 1, optionCount: 1, countComplete: true } }
      : input.result,
    ...(input.board === undefined ? {} : { board: input.board }),
  });
  const projected = {
    format: PUBLIC_RESULT_SHARE_V4_FORMAT,
    version: PUBLIC_RESULT_SHARE_V4_VERSION,
    tool: base.tool,
    scenarioKind: input.scenarioKind,
    capabilityIds: [...capabilityIds].sort(),
    packagePin: pins[0],
    // V4 Fix the Five run inputs have their own rank-only contract. Let the
    // V4 payload projector validate and sanitize that exact shape.
    result: isFixTheFiveRun ? input.result : base.result,
    ...(base.board ? { board: base.board } : {}),
  };
  return projectV4PayloadShape(projected);
}

/** Structural projection used by signature verification before source reloading. */
export function projectPublicResultShareV4PayloadShape(input) {
  return projectV4PayloadShape(input);
}

export function publicResultShareV4PackagePinMatchesProof(packagePin, proof, capabilityId) {
  try {
    if (!isRecord(packagePin) || !isRecord(proof) || typeof capabilityId !== 'string') return false;
    const expected = verifiedPackagePin(proof, capabilityId, packagePin.scope);
    return Object.keys(expected).every(key => JSON.stringify(packagePin[key]) === JSON.stringify(expected[key]))
      && Object.keys(packagePin).length === Object.keys(expected).length;
  } catch {
    return false;
  }
}
