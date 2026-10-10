/* Immutable caller pin for the separately versioned native V4 Impact release. */

export const CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN_FORMAT = 'djhc-swishiq-v4-impact-model-release-pin-v1';
export const CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN_VERSION = 'swishiq-v4-impact-native-20261010-v1';

export const CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN = Object.freeze({
  format: CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN_FORMAT,
  version: CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN_VERSION,
  releaseId: 'swishiq-v4-impact-native-20261010-v1',
  manifestPath: 'manifest.json',
  manifestSha256: '33ffa08170730bdd072c10b911f699aeeec38e5cc3b76cd567c17bdf49626b2a',
  manifestBytes: 9006,
  baseUrl: new URL('../data/v4/impact-models/swishiq-v4-impact-native-20261010-v1/', import.meta.url).href,
  modelId: 'swishiq-v4-additive-player-impact',
  modelVersion: 'native-v4-conditional-lineup-od-v1',
  phase: 'regular',
  predictiveEligibility: false,
  permittedUse: 'mean-only',
  acceptedScope: 'historical conditional scoring for specified observed paired lineups',
});

export function getCanonicalV4ImpactModelRequest({
  seasonStartYear,
  packageId,
  packageVersion,
  baseUrl = CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.baseUrl,
  fetchImpl,
  sha256Hex,
  signal,
} = {}) {
  return {
    baseUrl,
    manifestPath: CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.manifestPath,
    expectedManifestSha256: CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.manifestSha256,
    expectedManifestBytes: CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.manifestBytes,
    expectedReleaseId: CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.releaseId,
    seasonStartYear,
    phase: CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN.phase,
    packageId,
    packageVersion,
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(sha256Hex ? { sha256Hex } : {}),
    ...(signal ? { signal } : {}),
  };
}
