/*
 * SwishIQ Studio's public cross-lab boundary.
 *
 * The model contracts live in the canonical SwishIQ engine directory. This adapter is the only public Studio
 * surface that publishes those contracts to the renamed SwishIQ product. It
 * stores only sanitized, bounded handoffs and never joins provider IDs,
 * private package rows, or modeled output back into observed evidence.
 */

import {
  CROSS_LAB_INTEGRATION_VERSION,
  createCareerPathHandoff,
  createCrossLabIntegrationPlan,
  createObservedPairHandoff,
  createSeasonLabHandoff,
  createSyntheticPlayerHandoff,
} from './engine/cross-lab-integration.js?v=20261001b&rev=season-lab-cross-lab-v3-v4-source-pins';
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } from './engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import { resolveCanonicalV4SiteConsumerSourcePolicy } from './engine/canonical-v4-site-consumer-policy.js?v=20261002e&rev=canonical-v4-site-consumer-policy-v2-dependency-cache-closure';

export const SWISHIQ_INTEGRATION_BRIDGE_VERSION = 'swishiq-studio-integration-bridge-v1';
export const SWISHIQ_INTEGRATION_EVENT = 'swishiq:lab-handoff';
export const SWISHIQ_INTEGRATION_STORAGE_KEY = 'swishiq-studio-lab-handoffs-v1';
export const SWISHIQ_INTEGRATION_LIMITS = Object.freeze({ maxHandoffs: 8, maxBytes: 180000 });
export const SWISHIQ_CROSS_LAB_V4_BOUNDARY_CODE = 'cross-lab-v4-handoff-unavailable';

const HANDOFF_KINDS = new Set(['composite', 'career', 'pair', 'season']);
const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;

function defaultStorage() {
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

function safeStorage(storage) {
  return storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' ? storage : null;
}

function boundedJson(value) {
  try {
    const serialized = JSON.stringify(value);
    return serialized.length <= SWISHIQ_INTEGRATION_LIMITS.maxBytes ? serialized : null;
  } catch {
    return null;
  }
}

function safeRead(storage) {
  const target = safeStorage(storage);
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(SWISHIQ_INTEGRATION_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => object(item) && HANDOFF_KINDS.has(item.kind)).slice(0, SWISHIQ_INTEGRATION_LIMITS.maxHandoffs) : [];
  } catch {
    return [];
  }
}

function safeWrite(storage, handoffs) {
  const target = safeStorage(storage);
  if (!target) return false;
  const serialized = boundedJson(handoffs);
  if (!serialized) return false;
  try {
    target.setItem(SWISHIQ_INTEGRATION_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

function normalizedHandoff(kind, payload) {
  if (!HANDOFF_KINDS.has(kind)) throw new Error(`Unsupported SwishIQ handoff kind: ${kind}.`);
  if (kind === 'composite') return createSyntheticPlayerHandoff(payload);
  if (kind === 'career') return createCareerPathHandoff(payload);
  if (kind === 'pair') return createObservedPairHandoff(payload);
  return createSeasonLabHandoff(payload);
}

const V4_PACKAGE_ID = /^nba-swishiq-v4-/;
const HASH = /^[a-f0-9]{64}$/;
const V4_PAIR_CAPABILITY_ID = 'franchiseInputs';

function collectPackagePins(value, output = [], depth = 0) {
  if (!object(value) || depth > 5) return output;
  const packageId = text(value.packageId);
  if (packageId && (value.sourceGeneration === 'V4' || V4_PACKAGE_ID.test(packageId))) output.push(value);
  for (const key of ['package', 'packageRef', 'packageRefs', 'packages', 'seasonPackages', 'source', 'setup', 'recipe']) {
    const child = value[key];
    if (Array.isArray(child)) child.forEach(item => collectPackagePins(item, output, depth + 1));
    else if (object(child)) collectPackagePins(child, output, depth + 1);
  }
  return output;
}

function matchingCanonicalPackagePin(packageRef, releasePin) {
  const packageId = text(packageRef?.packageId);
  const configuredPin = releasePin?.packagePins?.find(row => row?.packageId === packageId);
  const expectedIdentity = releasePin?.expectedIdentity?.packages?.find(row => row?.packageId === packageId);
  let releaseId = null;
  try {
    const registryUrl = new URL(releasePin?.registryUrl);
    releaseId = registryUrl.pathname.match(/\/v4-site-[a-f0-9]{12}\/registry\.json$/)?.[0]
      ?.match(/v4-site-[a-f0-9]{12}/)?.[0] || null;
  } catch { /* An invalid immutable URL is rejected below. */ }
  const scopeMatches = object(expectedIdentity?.scope)
    && expectedIdentity.scope.kind === packageRef?.scope?.kind
    && Array.isArray(expectedIdentity.scope.seasonStartYears)
    && expectedIdentity.scope.seasonStartYears.length === packageRef?.scope?.seasonStartYears?.length
    && expectedIdentity.scope.seasonStartYears.every((year, index) => year === packageRef.scope.seasonStartYears[index])
    && Array.isArray(expectedIdentity.scope.phases)
    && Array.isArray(packageRef?.scope?.phases)
    && packageRef.scope.phases.length > 0
    && packageRef.scope.phases.every(phase => expectedIdentity.scope.phases.includes(phase));
  const scope = packageRef?.scope;
  const scopePackageId = scope?.kind === 'pooled-window'
    ? 'nba-swishiq-v4-2017-26'
    : scope?.kind === 'exact-season' && Number.isSafeInteger(scope.seasonStartYears?.[0])
      ? `nba-swishiq-v4-${scope.seasonStartYears[0]}-${String(scope.seasonStartYears[0] + 1).slice(-2)}`
      : null;
  return packageRef?.sourceGeneration === 'V4'
    && Boolean(releaseId)
    && packageId === scopePackageId
    && packageRef.releaseId === releaseId
    && packageRef.registrySha256 === releasePin.registrySha256
    && packageRef.registryRevisionSha256 === releasePin.registryRevisionSha256
    && packageRef.reviewReceiptSha256 === releasePin.reviewReceiptSha256
    && packageRef.authorizationReferenceSha256 === releasePin.authorizationReferenceSha256
    && configuredPin
    && expectedIdentity
    && packageRef.packageVersion === expectedIdentity.packageVersion
    && packageRef.packageManifestSha256 === expectedIdentity.manifestSha256
    && packageRef.sourceLockSha256 === expectedIdentity.sourceLockSha256
    && packageRef.sourceLockSha256 === configuredPin.sourceLockSha256
    && packageRef.indexSha256 === configuredPin.indexSha256
    && packageRef.capabilityMapSha256 === configuredPin.capabilityMapSha256
    && HASH.test(String(packageRef.projectionContentSha256 || ''))
    && packageRef.capabilityId === V4_PAIR_CAPABILITY_ID
    && scopeMatches;
}

function crossLabHandoffDecision(handoff, releasePin, payload = null) {
  const policy = resolveCanonicalV4SiteConsumerSourcePolicy({
    releasePin,
    consumerId: 'studio-cross-lab-handoff-bridge',
  });
  const packagePins = collectPackagePins(handoff);
  collectPackagePins(payload, packagePins);
  const hasV4Reference = packagePins.length > 0;
  if (!policy.v4Required) {
    return hasV4Reference
      ? {
        allowed: false,
        code: 'cross-lab-v4-release-unavailable',
        sourceMode: 'canonical-v4-required',
        reason: 'This cross-lab handoff references V4, but the reviewed canonical V4 release pin is not configured. No V4 or V3 substitute was shared.',
      }
      : { allowed: true, sourceMode: policy.sourceMode };
  }
  if (!policy.releaseReady) {
    return {
      allowed: false,
      code: 'cross-lab-v4-release-invalid',
      sourceMode: 'canonical-v4-required',
      reason: 'The cross-lab handoff is unavailable because the canonical V4 release pin is incomplete. No V3 handoff was shared.',
    };
  }
  if (!hasV4Reference || packagePins.some(packageRef => !matchingCanonicalPackagePin(packageRef, releasePin))) {
    return {
      allowed: false,
      code: 'cross-lab-v4-package-pin-mismatch',
      sourceMode: 'canonical-v4-required',
      reason: 'The cross-lab handoff does not match the current reviewed V4 release and exact package pins. No V3 handoff was shared.',
    };
  }
  if (handoff?.kind !== 'observed-pair-profile' || handoff?.modeled !== false) {
    return {
      allowed: false,
      code: 'cross-lab-v4-model-unapproved',
      sourceMode: 'canonical-v4-required',
      reason: 'V4 cross-lab model outputs remain unavailable until a model-specific adapter and predictive-validation approval receipt exist. The verified descriptive source was not converted into a model result.',
    };
  }
  return { allowed: true, sourceMode: 'canonical-v4-required' };
}

function unavailableHandoff(kind, { code, reason, sourceMode }) {
  const handoff = Object.freeze({
    version: CROSS_LAB_INTEGRATION_VERSION,
    status: 'unavailable',
    kind,
    modeled: false,
    code,
    reason,
    sourceMode,
    fallbackAfterV4Failure: false,
  });
  return Object.freeze({
    bridgeVersion: SWISHIQ_INTEGRATION_BRIDGE_VERSION,
    contractVersion: CROSS_LAB_INTEGRATION_VERSION,
    kind,
    publishedAt: null,
    status: 'unavailable',
    sourceMode,
    handoff,
    stored: false,
  });
}

/**
 * Validate and persist one public handoff. The returned value is safe to put
 * in a UI event or replay receipt; an unavailable handoff is still returned
 * so the receiving panel can explain its exact gate.
 */
export function publishSwishIqLabHandoff(kind, payload, {
  storage = defaultStorage(),
  eventTarget = globalThis,
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
} = {}) {
  const handoff = normalizedHandoff(kind, payload);
  const boundary = crossLabHandoffDecision(handoff, releasePin, payload);
  if (!boundary.allowed) return unavailableHandoff(kind, boundary);
  const envelope = Object.freeze({
    bridgeVersion: SWISHIQ_INTEGRATION_BRIDGE_VERSION,
    contractVersion: CROSS_LAB_INTEGRATION_VERSION,
    kind,
    publishedAt: new Date().toISOString(),
    sourceMode: boundary.sourceMode,
    handoff,
  });
  const existing = safeRead(storage).filter(item => item.kind !== kind);
  const next = [envelope, ...existing].slice(0, SWISHIQ_INTEGRATION_LIMITS.maxHandoffs);
  const stored = safeWrite(storage, next);
  try {
    if (eventTarget && typeof eventTarget.dispatchEvent === 'function' && typeof eventTarget.CustomEvent === 'function') {
      eventTarget.dispatchEvent(new eventTarget.CustomEvent(SWISHIQ_INTEGRATION_EVENT, { detail: envelope }));
    }
  } catch {
    // Event delivery is optional; storage/replay remains authoritative.
  }
  return Object.freeze({ ...envelope, stored });
}

export function readSwishIqLabHandoffs(storage = defaultStorage(), {
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
} = {}) {
  return Object.freeze(safeRead(storage).map(item => {
    const boundary = crossLabHandoffDecision(item?.handoff, releasePin);
    if (!boundary.allowed) return unavailableHandoff(item?.kind, boundary);
    return Object.freeze({ ...item, sourceMode: boundary.sourceMode });
  }));
}

export function clearSwishIqLabHandoffs(storage = defaultStorage()) {
  const target = safeStorage(storage);
  if (!target) return false;
  try {
    target.removeItem?.(SWISHIQ_INTEGRATION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function buildSwishIqIntegrationPlan(options = {}) {
  return createCrossLabIntegrationPlan(options);
}

export { createObservedPairHandoff, createSeasonLabHandoff };
