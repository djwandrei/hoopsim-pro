// DJHC scenario-contract.js: original package, seed and receipt contracts.
export const MODEL_SCENARIO_CONTRACT_VERSION = 'swishiq-model-scenario-v1';
export const MODEL_POOL_CONTRACT_VERSION = 'swishiq-seeded-pool-v1';
export const MODEL_PHASES = Object.freeze(['regular','in_season_tournament','play_in','playoffs','all phases']);
export const MODEL_PACKAGE_KINDS = Object.freeze(['exact-season','pooled-window','forecast-season']);
const PHASE_SET = new Set(MODEL_PHASES);
const PACKAGE_KIND_SET = new Set(MODEL_PACKAGE_KINDS);
const SEED_PATTERN = /^[A-Za-z0-9:._-]{1,80}$/;
const HASH_PATTERN = /^[a-f0-9]{16,128}$/i;
export const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const safeInteger = (value, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
export const boundedText = (value, maximum = 240) => typeof value === 'string' && value.trim() && value.length <= maximum ? value.trim() : null;
export function assertSeed(value, label = 'scenario seed') {
  if (typeof value !== 'string' || !SEED_PATTERN.test(value.trim())) throw new Error(`${label} must be a short alphanumeric replay seed.`);
  return value.trim();
}
export function isScenarioSeed(value) { return typeof value === 'string' && SEED_PATTERN.test(value.trim()); }
export function stableSerialize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { if (!finite(value)) throw new Error('Scenario values must be finite numbers.'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  throw new Error('Scenario values must be JSON-compatible.');
}
export function stableHash(value) {
  let hash = 1469598103934665603n;
  for (const character of stableSerialize(value)) { hash ^= BigInt(character.codePointAt(0)); hash = BigInt.asUintN(64, hash * 1099511628211n); }
  return hash.toString(16).padStart(16, '0');
}
function normalizeYears(value, label = 'seasonStartYears') {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a non-empty array.`);
  const years = value.map(Number);
  if (years.some(year => !safeInteger(year, 1947, 2200)) || new Set(years).size !== years.length) throw new Error(`${label} must contain distinct season years from 1947 through 2200.`);
  return years.sort((left,right) => left-right);
}
function normalizePhases(value) {
  if (!Array.isArray(value) || !value.length || value.some(phase => !PHASE_SET.has(phase))) throw new Error('Package scope must list one or more supported competition phases.');
  if (new Set(value).size !== value.length) throw new Error('Package scope phases must be unique.');
  return [...value];
}
function optionalHash(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  if (!HASH_PATTERN.test(normalized)) throw new Error(`${label} must be a hexadecimal integrity hash.`);
  return normalized.toLowerCase();
}
export function normalizeModelPackageRef(packageRef, { requireAcceptedPooled = true, requireAcceptedForecast = true } = {}) {
  if (!isObject(packageRef)) throw new Error('A bound model package is required.');
  const packageId = boundedText(packageRef.packageId,160), packageVersion = boundedText(packageRef.packageVersion,160);
  if (!packageId || !packageVersion) throw new Error('A model package requires a bounded ID and version.');
  const rawScope = packageRef.scope;
  if (!isObject(rawScope) || !PACKAGE_KIND_SET.has(rawScope.kind)) throw new Error('Model package scope is unsupported.');
  const seasonStartYears = normalizeYears(rawScope.seasonStartYears), phases = normalizePhases(rawScope.phases);
  if (rawScope.kind === 'exact-season' && seasonStartYears.length !== 1) throw new Error('An exact-season model package must bind exactly one season.');
  if (rawScope.kind === 'pooled-window' && seasonStartYears.length < 2) throw new Error('A pooled-window model package must bind at least two seasons.');
  if (rawScope.kind === 'forecast-season' && seasonStartYears.length !== 1) throw new Error('A forecast-season model package must bind exactly one season.');
  if (rawScope.kind === 'pooled-window' && requireAcceptedPooled && packageRef.acceptedPooledPackage !== true) throw new Error('A pooled-window model package requires explicit acceptance.');
  if (rawScope.kind === 'forecast-season' && requireAcceptedForecast && packageRef.acceptedForecastPackage !== true) throw new Error('A forecast-season model package requires explicit acceptance.');
  return { packageId, packageVersion, acceptedPooledPackage:packageRef.acceptedPooledPackage === true, acceptedForecastPackage:packageRef.acceptedForecastPackage === true, packageManifestSha256:optionalHash(packageRef.packageManifestSha256,'packageManifestSha256'), sourceManifestSetSha256:optionalHash(packageRef.sourceManifestSetSha256,'sourceManifestSetSha256'), sourceLockSha256:optionalHash(packageRef.sourceLockSha256,'sourceLockSha256'), registryVersion:boundedText(packageRef.registryVersion,160), registryRevisionSha256:optionalHash(packageRef.registryRevisionSha256,'registryRevisionSha256'), scope:{ kind:rawScope.kind, seasonStartYears, phases } };
}
export function rowMatchesModelPackage(row, packageRef, { allowMissingPins = true } = {}) {
  if (!isObject(row) || !isObject(packageRef) || !isObject(packageRef.scope)) return false;
  const year = Number(row.seasonStartYear);
  if (!safeInteger(year,1947,2200) || !packageRef.scope.seasonStartYears.includes(year)) return false;
  if (!PHASE_SET.has(row.phase) || !packageRef.scope.phases.includes(row.phase)) return false;
  if (row.packageId != null && String(row.packageId) !== packageRef.packageId) return false;
  if (row.packageVersion != null && String(row.packageVersion) !== packageRef.packageVersion) return false;
  for (const key of ['packageManifestSha256','sourceManifestSetSha256','sourceLockSha256']) {
    if (!allowMissingPins && row[key] == null && packageRef[key] != null) return false;
    if (row[key] != null && packageRef[key] != null && String(row[key]).toLowerCase() !== packageRef[key].toLowerCase()) return false;
  }
  return true;
}
export function publicModelPackageRef(packageRef) {
  if (!isObject(packageRef)) return null;
  const scope = isObject(packageRef.scope) ? { kind:packageRef.scope.kind || null, seasonStartYears:Array.isArray(packageRef.scope.seasonStartYears) ? [...packageRef.scope.seasonStartYears] : [], phases:Array.isArray(packageRef.scope.phases) ? [...packageRef.scope.phases] : [] } : null;
  return { packageId:packageRef.packageId || null, packageVersion:packageRef.packageVersion || null, acceptedPooledPackage:packageRef.acceptedPooledPackage === true, acceptedForecastPackage:packageRef.acceptedForecastPackage === true, packageManifestSha256:packageRef.packageManifestSha256 || null, sourceManifestSetSha256:packageRef.sourceManifestSetSha256 || null, sourceLockSha256:packageRef.sourceLockSha256 || null, registryVersion:packageRef.registryVersion || null, registryRevisionSha256:packageRef.registryRevisionSha256 || null, scope };
}
export function unavailable(reason, extra = {}) { return { status:'unavailable', reason, ...extra }; }