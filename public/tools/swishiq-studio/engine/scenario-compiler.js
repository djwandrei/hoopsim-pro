// Compile a package-bound, replayable scenario for Studio model consumers.
//
// Compilation is deliberately an input contract, not a model run.  It binds
// one package scope, one role rule, one candidate pool, and one seed.  Existing
// Composite Forge, Season, Career, Game, and Challenge engines can consume the
// returned normalized object without inheriting each other's fallbacks.

import {
  MODEL_SCENARIO_CONTRACT_VERSION,
  assertSeed,
  boundedText,
  isObject,
  normalizeModelPackageRef,
  publicModelPackageRef,
  stableHash,
  stableSerialize,
  unavailable,
} from './scenario-contract.js?v=20260920c&rev=swishiq-engine-v1';
import {
  ROLE_TAXONOMY_VERSION,
} from './role-taxonomy.js?v=20260920c&rev=swishiq-engine-v1';
import {
  SEEDED_POOL_ENGINE_VERSION,
  canonicalizeSeededEligibility,
  buildSeededPool,
  validateSeededPool,
} from './seeded-pool.js?v=20260920c&rev=swishiq-seeded-pool-v2';

export const SCENARIO_COMPILER_VERSION = 'swishiq-scenario-compiler-v2';
export const SCENARIO_KINDS = Object.freeze(['composite-forge', 'season', 'career', 'game', 'challenge']);
const KIND_SET = new Set(SCENARIO_KINDS);
const SOURCE_KINDS = new Set(['observed', 'synthetic', 'scenario', 'forecast']);

function failure(status, reason, extra = {}) {
  return { status, reason, compilerVersion: SCENARIO_COMPILER_VERSION, contractVersion: MODEL_SCENARIO_CONTRACT_VERSION, ...extra };
}

function sanitizeJson(value, label) {
  try { stableSerialize(value); }
  catch (error) { throw new Error(`${label} contains unsupported values: ${error.message}`); }
  return value;
}

function normalizeKind(kind) {
  const normalized = String(kind || '').trim().toLowerCase();
  if (!KIND_SET.has(normalized)) throw new Error(`Scenario kind must be one of: ${SCENARIO_KINDS.join(', ')}.`);
  return normalized;
}

function normalizeSource(input, packageRef) {
  const source = isObject(input) ? input : {};
  const kind = String(source.kind || (packageRef.scope.kind === 'forecast-season' ? 'forecast' : 'observed')).trim().toLowerCase();
  if (!SOURCE_KINDS.has(kind)) throw new Error('Scenario source kind is unsupported.');
  if (kind === 'forecast' && packageRef.scope.kind !== 'forecast-season') throw new Error('Forecast source requires a forecast-season package.');
  if (packageRef.scope.kind === 'forecast-season' && kind !== 'forecast') throw new Error('A forecast-season package cannot be relabeled as observed evidence.');
  if (kind === 'synthetic' && packageRef.scope.kind === 'forecast-season') throw new Error('Synthetic source cannot be attached to a forecast-season package.');
  return {
    kind,
    evidence: boundedText(source.evidence, 240),
    modelVersion: boundedText(source.modelVersion, 160),
    manifestHash: source.manifestHash || packageRef.packageManifestSha256 || null,
  };
}

function validateRequestedScope(input, packageRef) {
  const requestedYear = input.seasonStartYear === undefined || input.seasonStartYear === null ? null : Number(input.seasonStartYear);
  if (requestedYear !== null && !packageRef.scope.seasonStartYears.includes(requestedYear)) {
    return 'Requested season is outside the bound package scope.';
  }
  const requestedPhase = input.phase === undefined || input.phase === null ? null : String(input.phase).trim();
  if (requestedPhase !== null && !packageRef.scope.phases.includes(requestedPhase)) return 'Requested phase is outside the bound package scope.';
  if (packageRef.scope.kind === 'pooled-window' && input.acceptedPooledPackage === false) return 'The caller declined the pooled package.';
  if (packageRef.scope.kind === 'forecast-season' && input.acceptedForecastPackage === false) return 'The caller declined the forecast package.';
  return null;
}

function resolveScenarioEligibility(input, pool) {
  const suppliedRule = input.eligibility === undefined && pool?.status === 'ready'
    ? pool.eligibility
    : input.eligibility || {};
  const rule = canonicalizeSeededEligibility(suppliedRule);
  const requestedYear = input.seasonStartYear == null ? null : Number(input.seasonStartYear);
  const requestedPhase = input.phase == null ? null : String(input.phase).trim();
  if (requestedYear !== null && rule.seasons.length && !rule.seasons.includes(requestedYear)) {
    throw new Error('The requested season conflicts with the eligibility season filter.');
  }
  if (requestedPhase !== null && rule.phases.length && !rule.phases.includes(requestedPhase)) {
    throw new Error('The requested phase conflicts with the eligibility phase filter.');
  }
  return canonicalizeSeededEligibility({
    ...rule,
    seasons: requestedYear === null ? rule.seasons : [requestedYear],
    phases: requestedPhase === null ? rule.phases : [requestedPhase],
  });
}

function normalizeControls(controls) {
  if (controls === undefined || controls === null) return {};
  if (!isObject(controls)) throw new Error('Scenario controls must be an object.');
  sanitizeJson(controls, 'Scenario controls');
  return controls;
}

function poolSummary(pool) {
  if (!pool || pool.status !== 'ready') return null;
  return {
    poolHash: pool.poolHash,
    entryCount: pool.entries.length,
    excludedCount: Array.isArray(pool.excluded) ? pool.excluded.length : 0,
    seed: pool.seed,
    eligibility: pool.eligibility,
  };
}

/**
 * Compile a scenario.  If `entries` or `pool` is not supplied, compilation
 * remains unavailable rather than producing an empty/implicit player pool.
 */
export function compileModelScenario(input = {}) {
  if (!isObject(input)) return failure('invalid', 'Scenario input must be an object.');
  let kind;
  try { kind = normalizeKind(input.kind); }
  catch (error) { return failure('invalid', error.message); }
  let packageRef;
  try { packageRef = normalizeModelPackageRef(input.packageRef, { requireAcceptedPooled: true, requireAcceptedForecast: true }); }
  catch (error) { return failure('unavailable', error.message, { kind }); }
  const scopeIssue = validateRequestedScope(input, packageRef);
  if (scopeIssue) return failure('unavailable', scopeIssue, { kind, packageRef: publicModelPackageRef(packageRef) });
  let seed;
  try { seed = assertSeed(input.seed, 'scenario seed'); }
  catch (error) { return failure('invalid', error.message, { kind, packageRef: publicModelPackageRef(packageRef) }); }
  let source;
  let eligibility;
  let controls;
  let pool = input.pool || null;
  try {
    source = normalizeSource(input.source, packageRef);
    eligibility = resolveScenarioEligibility(input, pool);
    controls = normalizeControls(input.controls);
    if (input.constraints !== undefined) sanitizeJson(input.constraints, 'Scenario constraints');
  } catch (error) {
    return failure('invalid', error.message, { kind, packageRef: publicModelPackageRef(packageRef), seed });
  }
  if (pool && pool.status !== 'ready') return failure('unavailable', pool.reason || 'The supplied pool is unavailable.', { kind, packageRef: publicModelPackageRef(packageRef), seed, pool });
  if (!pool && Array.isArray(input.entries)) {
    pool = buildSeededPool({ entries: input.entries, packageRef, seed, eligibility, uniquePlayerKey: input.uniquePlayerKey });
  }
  if (!pool) return failure('unavailable', 'Scenario compilation requires a package-bound eligible pool.', {
    kind, packageRef: publicModelPackageRef(packageRef), seed, eligibility,
  });
  if (pool.status !== 'ready') return failure('unavailable', pool.reason || 'The package-bound pool is unavailable.', {
    kind, packageRef: publicModelPackageRef(packageRef), seed, eligibility, pool,
  });
  pool = validateSeededPool(pool, { packageRef, seed, eligibility });
  if (pool.status !== 'ready') return failure('unavailable', pool.reason || 'The package-bound pool is unavailable.', {
    kind, packageRef: publicModelPackageRef(packageRef), seed, eligibility, pool,
  });
  const capabilities = input.capabilities === undefined ? null : input.capabilities;
  if (capabilities !== null && !isObject(capabilities)) return failure('invalid', 'Scenario capabilities must be an object.', { kind });
  const capability = capabilities?.[kind] ?? capabilities?.scenario;
  if (capability && (capability.status === 'unavailable' || capability.enabled === false || capability.ready === false)) {
    return failure('unavailable', capability.reason || `The ${kind} consumer is not available.`, { kind, packageRef: publicModelPackageRef(packageRef), seed, pool: poolSummary(pool) });
  }
  const constraints = input.constraints === undefined ? {} : input.constraints;
  const canonical = {
    contractVersion: MODEL_SCENARIO_CONTRACT_VERSION,
    compilerVersion: SCENARIO_COMPILER_VERSION,
    kind,
    seed,
    packageRef: publicModelPackageRef(packageRef),
    source,
    eligibility,
    constraints,
    controls,
    poolHash: pool.poolHash,
    selectedSeasonStartYear: input.seasonStartYear == null ? null : Number(input.seasonStartYear),
    selectedPhase: input.phase == null ? null : String(input.phase).trim(),
  };
  const scenarioHash = stableHash(canonical);
  return {
    status: 'ready',
    ...canonical,
    packageRef,
    pool,
    scenarioHash,
    replay: {
      deterministic: true,
      seed,
      scenarioHash,
      poolHash: pool.poolHash,
      compilerVersion: SCENARIO_COMPILER_VERSION,
      scope: packageRef.scope,
    },
    evidence: {
      sourceKind: source.kind,
      packageKind: packageRef.scope.kind,
      observed: source.kind === 'observed',
      modeled: source.kind === 'synthetic' || source.kind === 'scenario' || source.kind === 'forecast',
      fallbackUsed: false,
    },
    engineDependencies: Object.freeze({
      roleTaxonomy: ROLE_TAXONOMY_VERSION,
      pool: SEEDED_POOL_ENGINE_VERSION,
    }),
  };
}

function wrapper(kind, input = {}) {
  return compileModelScenario({ ...input, kind });
}

export const compileCompositeForgeScenario = input => wrapper('composite-forge', input);
export const compileSeasonScenario = input => wrapper('season', input);
export const compileCareerScenario = input => wrapper('career', input);
export const compileGameScenario = input => wrapper('game', input);
export const compileChallengeScenario = input => wrapper('challenge', input);

export function assertReadyScenario(scenario, expectedKind = null) {
  if (!scenario || scenario.status !== 'ready') throw new Error(scenario?.reason || 'The scenario is unavailable.');
  if (expectedKind && scenario.kind !== expectedKind) throw new Error(`Expected a ${expectedKind} scenario.`);
  return scenario;
}

export function publicScenarioReceipt(scenario) {
  if (!scenario || typeof scenario !== 'object') return unavailable('Scenario receipt is unavailable.');
  if (scenario.status !== 'ready') return { status: 'unavailable', reason: scenario.reason || 'Scenario is unavailable.' };
  let canonical;
  let packageRef;
  let receiptPool;
  try {
    packageRef = normalizeModelPackageRef(scenario.packageRef);
    canonical = {
      contractVersion: MODEL_SCENARIO_CONTRACT_VERSION,
      compilerVersion: SCENARIO_COMPILER_VERSION,
      kind: normalizeKind(scenario.kind),
      seed: assertSeed(scenario.seed, 'scenario seed'),
      packageRef: publicModelPackageRef(packageRef),
      source: normalizeSource(scenario.source, packageRef),
      eligibility: canonicalizeSeededEligibility(scenario.eligibility),
      constraints: scenario.constraints,
      controls: normalizeControls(scenario.controls),
      poolHash: scenario.poolHash,
      selectedSeasonStartYear: scenario.selectedSeasonStartYear == null ? null : Number(scenario.selectedSeasonStartYear),
      selectedPhase: scenario.selectedPhase == null ? null : String(scenario.selectedPhase).trim(),
    };
    sanitizeJson(canonical, 'Scenario receipt');
    receiptPool = validateSeededPool(scenario.pool, {
      packageRef,
      seed: canonical.seed,
      eligibility: canonical.eligibility,
    });
    if (receiptPool.status !== 'ready' || receiptPool.poolHash !== canonical.poolHash) {
      return unavailable('Scenario replay receipt does not match the compiled scenario and package-bound pool.');
    }
  } catch {
    return unavailable('Scenario replay receipt is invalid.');
  }
  const expectedHash = stableHash(canonical);
  const expectedEvidence = {
    sourceKind: canonical.source.kind,
    packageKind: packageRef.scope.kind,
    observed: canonical.source.kind === 'observed',
    modeled: canonical.source.kind === 'synthetic' || canonical.source.kind === 'scenario' || canonical.source.kind === 'forecast',
    fallbackUsed: false,
  };
  try {
    if (scenario.contractVersion !== MODEL_SCENARIO_CONTRACT_VERSION
      || scenario.compilerVersion !== SCENARIO_COMPILER_VERSION
      || scenario.scenarioHash !== expectedHash
      || receiptPool.poolHash !== scenario.poolHash
      || scenario.replay?.deterministic !== true
      || scenario.replay.seed !== scenario.seed
      || scenario.replay.scenarioHash !== expectedHash
      || scenario.replay.poolHash !== scenario.poolHash
      || scenario.replay.compilerVersion !== SCENARIO_COMPILER_VERSION
      || stableSerialize(scenario.replay.scope) !== stableSerialize(packageRef.scope)
      || stableSerialize(scenario.evidence) !== stableSerialize(expectedEvidence)) {
      return unavailable('Scenario replay receipt does not match the compiled scenario and package-bound pool.');
    }
  } catch {
    return unavailable('Scenario replay receipt does not match the compiled scenario and package-bound pool.');
  }
  return {
    status: 'ready',
    contractVersion: MODEL_SCENARIO_CONTRACT_VERSION,
    compilerVersion: SCENARIO_COMPILER_VERSION,
    kind: scenario.kind,
    seed: scenario.seed,
    scenarioHash: scenario.scenarioHash,
    packageRef: publicModelPackageRef(scenario.packageRef),
    poolHash: scenario.poolHash,
    evidence: scenario.evidence,
    replay: scenario.replay,
  };
}
