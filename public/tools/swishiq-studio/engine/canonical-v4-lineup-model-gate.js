import { resolveCanonicalV4SiteConsumerSourcePolicy } from './canonical-v4-site-consumer-policy.js?v=20261002e&rev=canonical-v4-site-consumer-policy-v2-dependency-cache-closure';
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } from './canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';

export const CANONICAL_V4_LINEUP_MODEL_GATE_FORMAT = 'djhc-swishiq-v4-lineup-model-execution-gate-v1';
export const CANONICAL_V4_LINEUP_MODEL_GATE_VERSION = 'swishiq-v4-lineup-model-execution-gate-v1';

/**
 * Keep Lineup execution tied to the reviewed V4 release pin. Exact-season
 * inputs are verified by the Lineup data adapter; DJHC has authorized this
 * route to run as a retrospective historical optimizer without a separate
 * per-tool predictive-validation receipt. This gate does not certify a
 * prospective forecast or relax registry, package, or artifact hash checks.
 */
export function canonicalV4LineupModelExecutionAvailability({
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  sourceMode = 'pre-cutover',
} = {}) {
  const policy = resolveCanonicalV4SiteConsumerSourcePolicy({
    releasePin,
    consumerId: 'lineup-lab-impact-and-optimization-route',
  });
  if (!policy.v4Required) {
    if (sourceMode === 'canonical-v4-required') return Object.freeze({
      format: CANONICAL_V4_LINEUP_MODEL_GATE_FORMAT,
      version: CANONICAL_V4_LINEUP_MODEL_GATE_VERSION,
      available: false,
      v4Required: true,
      sourceMode: 'canonical-v4-required',
      code: 'lineup-v4-release-unavailable',
      reason: 'A reviewed V4 release is not configured. V4 Lineup data and model execution remain unavailable.',
    });
    return Object.freeze({
      format: CANONICAL_V4_LINEUP_MODEL_GATE_FORMAT,
      version: CANONICAL_V4_LINEUP_MODEL_GATE_VERSION,
      available: true,
      v4Required: false,
      sourceMode: 'v3-retained-before-v4-review',
      modelExecution: 'pre-cutover-existing-route',
      reason: policy.reason,
    });
  }

  if (!policy.releaseReady) return Object.freeze({
    format: CANONICAL_V4_LINEUP_MODEL_GATE_FORMAT,
    version: CANONICAL_V4_LINEUP_MODEL_GATE_VERSION,
    available: false,
    v4Required: true,
    sourceMode: 'canonical-v4-required',
    code: 'lineup-v4-release-invalid',
    modelExecution: 'blocked',
    reason: 'The supplied V4 release pin is incomplete. Lineup data and model execution are unavailable; V3 was not loaded.',
  });
  return Object.freeze({
    format: CANONICAL_V4_LINEUP_MODEL_GATE_FORMAT,
    version: CANONICAL_V4_LINEUP_MODEL_GATE_VERSION,
    available: true,
    v4Required: true,
    sourceMode: 'canonical-v4-owner-certified-historical',
    modelExecution: 'djhc-owner-certified-historical-optimization',
    predictiveValidationStatus: 'not-claimed-historical-descriptive-inputs',
    reason: 'DJHC owner-certified historical optimization is enabled for a verified exact V4 team-season. It does not claim a prospective forecast or independent predictive validation.',
  });
}
