/*
 * Shared public package/capability resolver.
 *
 * Model and game surfaces should ask this resolver for a package before
 * loading a part.  It compares the complete canonical scope, checks every
 * declared capability, and never widens an exact request to a pooled package
 * (or the reverse).  The resolver is intentionally metadata-only; the
 * optional loader below delegates byte/hash verification to the existing
 * static projection verifier.
 */

import {
  CHALLENGE_SCOPE_KINDS,
  PUBLIC_CAPABILITIES,
  resolveChallengeDefinition,
} from './challenge-definition-registry.js?v=20260920c&rev=swishiq-engine-v1';

export const STATIC_PACKAGE_CAPABILITY_RESOLVER_VERSION = 'swishiq-static-package-capability-resolver-v1';
export const STATIC_PACKAGE_CAPABILITY_RESOLVER_FORMAT = 'djhc-swishiq-static-package-capability-resolution-v1';

const CAPABILITY_SET = new Set(PUBLIC_CAPABILITIES);
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function freeze(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function fail(message, code = 'invalid-request') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function text(value, label, maximum = 240) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) fail(`${label} is invalid.`);
  return value.trim();
}

function integer(value, label, minimum = 1947, maximum = 2200) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < minimum || normalized > maximum) fail(`${label} is invalid.`);
  return normalized;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function scopeMatches(entryScope, requestedScope) {
  // A package may publish the complete canonical phase set while a surface
  // asks for one phase.  Match the season window and scope kind exactly, and
  // require every requested phase to be covered; never widen years or switch
  // exact/pooled kinds.
  return entryScope.kind === requestedScope.kind
    && same(entryScope.seasonStartYears, requestedScope.seasonStartYears)
    && requestedScope.phases.every((phase) => entryScope.phases.includes(phase));
}

function normalizeYears(value, label) {
  if (!Array.isArray(value) || !value.length || value.length > 100) fail(`${label} must contain one or more season start years.`);
  const years = value.map((year) => integer(year, label));
  const ordered = [...years].sort((left, right) => left - right);
  if (!same(years, ordered) || new Set(years).size !== years.length
    || years.some((year, index) => index > 0 && year !== years[index - 1] + 1)) {
    fail(`${label} must be ordered, distinct, and contiguous.`);
  }
  return years;
}

function normalizeScope(value, label = 'scope') {
  if (!isObject(value)) fail(`${label} is required.`);
  const kind = text(value.kind, `${label} kind`, 32).toLowerCase();
  if (!CHALLENGE_SCOPE_KINDS.includes(kind)) fail(`${label} kind is unsupported.`);
  const years = normalizeYears(value.seasonStartYears, `${label} seasonStartYears`);
  if (kind === 'exact-season' && years.length !== 1) fail(`${label} exact-season scope must contain one year.`);
  if (kind === 'pooled-window' && years.length < 2) fail(`${label} pooled-window scope must contain multiple years.`);
  const phaseValues = Array.isArray(value.phases)
    ? value.phases.map((phase) => text(phase, `${label} phase`, 40).toLowerCase())
    : value.phase ? [text(value.phase, `${label} phase`, 40).toLowerCase()] : [];
  if (!phaseValues.length || new Set(phaseValues).size !== phaseValues.length || phaseValues.some((phase) => !PHASES.has(phase))) {
    fail(`${label} phases are invalid.`);
  }
  const phases = [...PHASES].filter((phase) => phaseValues.includes(phase));
  return {
    kind,
    seasonStartYears: years,
    seasonStartYear: years[0],
    seasonEndYear: years.at(-1) + 1,
    phases,
    pooledFitIsSeasonSpecific: kind === 'exact-season',
  };
}

function scopeFromRequest(definition, request, registry) {
  const explicit = request.scope;
  let years = explicit?.seasonStartYears || request.seasonStartYears;
  let kind = explicit?.kind || definition.scope.kind;
  if (!years && Number.isSafeInteger(Number(request.seasonStartYear))) years = [Number(request.seasonStartYear)];
  if (!years && Number.isSafeInteger(Number(request.seasonEndYear))) years = [Number(request.seasonEndYear) - 1];
  if (!years && request.packageId && request.packageVersion) {
    const entry = (registry?.packages || []).find((candidate) => candidate.packageId === request.packageId
      && candidate.packageVersion === request.packageVersion);
    if (entry?.scope?.seasonStartYears) {
      years = entry.scope.seasonStartYears;
      kind = entry.scope.kind;
    }
  }
  if (!years) fail('A season scope is required for package resolution.');
  // Let a multi-season request surface as an explicit exact/pooled mismatch
  // instead of being reported as a malformed exact season.  The resolver
  // still rejects the request below unless the challenge definition declares
  // the same kind and pooled acceptance is explicit.
  if (!explicit?.kind && Array.isArray(years)) {
    kind = years.length === 1 ? 'exact-season' : 'pooled-window';
  }
  const phase = explicit?.phase || request.phase || definition.scope.phase;
  const normalizedPhase = String(phase || 'regular').trim().toLowerCase();
  if (normalizedPhase === 'any') {
    const phases = [...PHASES];
    return normalizeScope({ kind, seasonStartYears: years, phases }, 'requested scope');
  }
  return normalizeScope({ kind, seasonStartYears: years, phases: [normalizedPhase] }, 'requested scope');
}

function requiredCapabilities(definition, request) {
  // A caller may add constraints, but can never drop capabilities declared by
  // the challenge definition itself. This keeps a tool surface from silently
  // resolving a package that cannot support its registered contract.
  if (request.requiredCapabilities !== undefined && !Array.isArray(request.requiredCapabilities)) {
    fail('Required capabilities must be an array.');
  }
  const requested = request.requiredCapabilities === undefined ? [] : request.requiredCapabilities;
  const values = [...definition.requiredCapabilities, ...(Array.isArray(requested) ? requested : [])];
  if (!Array.isArray(values) || !values.length) fail('At least one required capability is required.');
  const normalized = values.map((capability) => text(capability, 'required capability', 80));
  if (normalized.some((capability) => !CAPABILITY_SET.has(capability))) {
    fail('Required capabilities contain an unsupported capability.');
  }
  return [...new Set(normalized)].sort();
}

function unavailable({ definition, scope = null, phase = null, required = [], code, reason, missing = [], entries = [] }) {
  const result = {
    format: STATIC_PACKAGE_CAPABILITY_RESOLVER_FORMAT,
    resolverVersion: STATIC_PACKAGE_CAPABILITY_RESOLVER_VERSION,
    status: 'blocked', available: false, code, reason,
    definitionId: definition?.id || null, surface: definition?.surface || null,
    scope, phase, requiredCapabilities: Object.freeze([...required]),
    missingCapabilities: Object.freeze([...missing]),
    entries: Object.freeze([...entries]), package: null,
  };
  return freeze(result);
}

function throwIfRequested(result, throwOnUnavailable) {
  if (result.available || !throwOnUnavailable) return result;
  fail(result.reason, result.code);
}

function capabilityAvailable(entry, capability) {
  const descriptor = entry?.capabilities?.[capability];
  return descriptor === true || descriptor?.status === 'available';
}

export function staticPackageCapabilityAvailable(entry, capability) {
  return CAPABILITY_SET.has(String(capability || '')) && capabilityAvailable(entry, String(capability));
}

/**
 * Resolve one package for a registered challenge definition.  The return
 * value is a blocked receipt by default, which lets a browser render a
 * truthful unavailable state without catching contract exceptions. Pass
 * throwOnUnavailable to retain a throwing API for strict callers.
 */
export function resolveStaticPackageCapability({
  registry,
  definition,
  definitionId = null,
  scope = null,
  seasonStartYears = null,
  seasonStartYear = null,
  seasonEndYear = null,
  phase = null,
  packageId = null,
  packageVersion = null,
  requiredCapabilities: requestedCapabilities,
  acceptPooled = false,
  throwOnUnavailable = false,
} = {}) {
  if (!isObject(registry) || !Array.isArray(registry.packages)) {
    return throwIfRequested(unavailable({ code: 'registry-unavailable', reason: 'The static package registry is unavailable.', required: [] }), throwOnUnavailable);
  }
  let resolvedDefinition;
  try {
    resolvedDefinition = definition
      ? (typeof definition === 'string' ? resolveChallengeDefinition(definition) : definition)
      : resolveChallengeDefinition(definitionId || '');
  } catch (error) {
    return throwIfRequested(unavailable({ code: 'definition-invalid', reason: error.message, required: [] }), throwOnUnavailable);
  }
  const request = { scope, seasonStartYears, seasonStartYear, seasonEndYear, phase, packageId, packageVersion, requiredCapabilities: requestedCapabilities };
  let required;
  try { required = requiredCapabilities(resolvedDefinition, request); }
  catch (error) {
    return throwIfRequested(unavailable({ definition: resolvedDefinition, code: 'capability-request-invalid', reason: error.message, required: [] }), throwOnUnavailable);
  }

  let requestedScope;
  try { requestedScope = scopeFromRequest(resolvedDefinition, request, registry); }
  catch (error) {
    return throwIfRequested(unavailable({ definition: resolvedDefinition, code: 'scope-invalid', reason: error.message, required }), throwOnUnavailable);
  }
  if (requestedScope.kind !== resolvedDefinition.scope.kind) {
    return throwIfRequested(unavailable({ definition: resolvedDefinition, scope: requestedScope, code: 'scope-mismatch', reason: `The ${resolvedDefinition.id} definition requires ${resolvedDefinition.scope.kind}; no other scope was used.`, required }), throwOnUnavailable);
  }
  if (requestedScope.kind === 'pooled-window' && acceptPooled !== true) {
    return throwIfRequested(unavailable({ definition: resolvedDefinition, scope: requestedScope, code: 'pooled-acceptance-required', reason: 'The pooled package must be accepted explicitly; it never replaces an exact season.', required }), throwOnUnavailable);
  }
  const requestedPhase = String(phase || scope?.phase || resolvedDefinition.scope.phase || 'regular').trim().toLowerCase();
  if (requestedPhase !== 'any' && !PHASES.has(requestedPhase)) {
    return throwIfRequested(unavailable({ definition: resolvedDefinition, scope: requestedScope, code: 'phase-invalid', reason: 'The requested phase is unsupported.', required }), throwOnUnavailable);
  }

  const candidates = registry.packages.filter((entry) => {
    if (!isObject(entry) || entry.status !== 'published' || !isObject(entry.scope)) return false;
    let entryScope;
    try { entryScope = normalizeScope(entry.scope, 'registry package scope'); } catch { return false; }
    if (!scopeMatches(entryScope, requestedScope)) return false;
    if (requestedPhase !== 'any' && !entryScope.phases.includes(requestedPhase)) return false;
    if (packageId !== null && entry.packageId !== packageId) return false;
    if (packageVersion !== null && entry.packageVersion !== packageVersion) return false;
    return required.every((capability) => capabilityAvailable(entry, capability));
  });
  if (candidates.length !== 1) {
    const missing = [...new Set(registry.packages
      .filter((entry) => {
        if (!isObject(entry) || entry.status !== 'published' || !isObject(entry.scope)) return false;
        try { return scopeMatches(normalizeScope(entry.scope, 'registry package scope'), requestedScope); } catch { return false; }
      })
      .flatMap((entry) => required.filter((capability) => !capabilityAvailable(entry, capability))))].sort();
    const code = candidates.length > 1 ? 'ambiguous-package' : missing.length ? 'capability-unavailable' : 'package-unavailable';
    const reason = candidates.length > 1
      ? 'More than one published package satisfies the exact scope and capability request.'
      : missing.length
        ? `The selected package does not publish ${missing.join(' and ')}; no other scope was used.`
        : `No published package satisfies the ${requestedScope.kind} scope and capability request; no fallback was used.`;
    return throwIfRequested(unavailable({ definition: resolvedDefinition, scope: requestedScope, phase: requestedPhase, code, reason, required, missing }), throwOnUnavailable);
  }
  const selected = candidates[0];
  const selectedCopy = clone(selected);
  return freeze({
    format: STATIC_PACKAGE_CAPABILITY_RESOLVER_FORMAT,
    resolverVersion: STATIC_PACKAGE_CAPABILITY_RESOLVER_VERSION,
    status: 'ready', available: true, code: null, reason: null,
    definitionId: resolvedDefinition.id, surface: resolvedDefinition.surface,
    scope: requestedScope, phase: requestedPhase, requiredCapabilities: Object.freeze(required),
    missingCapabilities: Object.freeze([]), entries: Object.freeze([freeze(selectedCopy)]), package: freeze(selectedCopy),
  });
}

export function resolveStaticPackageCapabilities({ registry, definitions = null, requests = {} } = {}) {
  const selectedDefinitions = definitions || Object.keys(requests).map((id) => resolveChallengeDefinition(id));
  if (!Array.isArray(selectedDefinitions) || !selectedDefinitions.length) fail('At least one challenge definition is required.');
  const resolutions = selectedDefinitions.map((definition) => {
    const request = requests[definition.id] || {};
    return resolveStaticPackageCapability({ registry, definition, ...request });
  });
  return freeze(resolutions);
}

/**
 * Browser adapter: after metadata resolution, ask the established verifier
 * to fetch and hash-check the selected index.  This function never invents a
 * path and never loads a package when metadata resolution is blocked.
 */
export async function loadStaticPackageCapability({
  registry = null,
  registryUrl,
  fetchImpl,
  definition,
  ...request
} = {}) {
  const resolution = resolveStaticPackageCapability({ registry, definition, ...request });
  if (!resolution.available) return resolution;
  const verifier = await import('../../swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-typed-v4-cutover-gate-v1');
  const proof = resolution.scope.kind === 'exact-season'
    ? await verifier.loadSwishIqExactPackageProof({
      seasonEndYear: resolution.scope.seasonEndYear,
      seasonPhase: resolution.phase,
      requiredCapabilities: resolution.requiredCapabilities,
      packageRef: resolution.package,
      registryUrl,
      fetchImpl,
    })
    : await verifier.loadSwishIqPublishedPackageProof({
      packageId: resolution.package.packageId,
      packageVersion: resolution.package.packageVersion,
      requiredCapabilities: resolution.requiredCapabilities,
      registryUrl,
      fetchImpl,
    });
  return freeze({ resolution, proof });
}
