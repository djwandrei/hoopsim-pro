import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_FORMAT,
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_VERSION,
} from './canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import { canonicalV4PlayerBaseConsumerAvailability } from './canonical-v4-descriptive-source-consumer.js?v=20261002e&rev=v4-player-base-descriptive-consumer-v2-dependency-cache-closure';

export const CANONICAL_V4_SITE_CONSUMER_POLICY_FORMAT = 'djhc-swishiq-v4-site-consumer-source-policy-v1';
export const CANONICAL_V4_SITE_CONSUMER_POLICY_VERSION = 'swishiq-v4-site-consumer-source-policy-v1';

/**
 * Resolve the source boundary for current Studio consumers. V3 remains an
 * explicitly named pre-cutover mode only while no release pin has been set.
 * Once any pin is supplied, the consumer is V4-only: an incomplete pin or a
 * later V4 load failure must be shown as unavailable and must never trigger a
 * V3 retry.
 */
export function resolveCanonicalV4SiteConsumerSourcePolicy({
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  consumerId,
} = {}) {
  const id = String(consumerId || '').trim();
  if (!id) throw new Error('A site consumer ID is required for the V4 source policy.');

  if (releasePin?.status === 'unconfigured') {
    return Object.freeze({
      format: CANONICAL_V4_SITE_CONSUMER_POLICY_FORMAT,
      version: CANONICAL_V4_SITE_CONSUMER_POLICY_VERSION,
      consumerId: id,
      sourceMode: 'v3-retained-before-v4-review',
      v4Required: false,
      v3Allowed: true,
      fallbackAfterV4Failure: false,
      status: 'awaiting-reviewed-v4-release',
      reason: 'The reviewed V4 site release is not configured; V3 remains the explicitly retained pre-cutover source.',
    });
  }

  const pinShapeValid = releasePin?.format === CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_FORMAT
    && releasePin?.version === CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_VERSION
    && releasePin?.status === 'reviewed';
  const releaseReady = pinShapeValid && canonicalV4PlayerBaseConsumerAvailability(releasePin).enabled;
  return Object.freeze({
    format: CANONICAL_V4_SITE_CONSUMER_POLICY_FORMAT,
    version: CANONICAL_V4_SITE_CONSUMER_POLICY_VERSION,
    consumerId: id,
    sourceMode: 'canonical-v4-required',
    v4Required: true,
    v3Allowed: false,
    fallbackAfterV4Failure: false,
    status: releaseReady ? 'reviewed-v4-release-configured' : 'v4-release-pin-invalid-or-incomplete',
    releaseReady,
    reason: releaseReady
      ? 'Use the reviewed V4 release. If its exact data or a consumer capability fails verification, stop without substituting V3.'
      : 'A V4 release pin has been supplied but is not a complete reviewed release; fail closed and do not substitute V3.',
  });
}
