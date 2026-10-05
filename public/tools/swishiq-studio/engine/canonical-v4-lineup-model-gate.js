import { resolveCanonicalV4SiteConsumerSourcePolicy } from './canonical-v4-site-consumer-policy.js?v=20261002e&rev=canonical-v4-site-consumer-policy-v2-dependency-cache-closure';
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } from './canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';

export const CANONICAL_V4_LINEUP_MODEL_GATE_FORMAT = 'djhc-swishiq-v4-lineup-model-execution-gate-v1';
export const CANONICAL_V4_LINEUP_MODEL_GATE_VERSION = 'swishiq-v4-lineup-model-execution-gate-v1';

/**
 * Keep the existing Lineup route available before V4 cutover. After any V4
 * release pin is supplied, block V3 inputs and solver execution until a
 * separate exact-scope Lineup input adapter and model-specific validation
 * receipt are wired and reviewed.
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

  return Object.freeze({
    format: CANONICAL_V4_LINEUP_MODEL_GATE_FORMAT,
    version: CANONICAL_V4_LINEUP_MODEL_GATE_VERSION,
    available: false,
    v4Required: true,
    sourceMode: 'canonical-v4-required',
    code: policy.releaseReady ? 'lineup-v4-validation-not-configured' : 'lineup-v4-release-invalid',
    modelExecution: 'blocked',
    reason: policy.releaseReady
      ? 'V4 is selected, but exact Lineup inputs and a Lineup-specific predictive-validation receipt are not configured. V3 was not loaded and the optimizer did not run.'
      : 'The supplied V4 release pin is incomplete. Lineup data and model execution are unavailable; V3 was not loaded.',
  });
}
