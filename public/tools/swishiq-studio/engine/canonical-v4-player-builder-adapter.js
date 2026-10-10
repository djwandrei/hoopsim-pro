import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
} from './canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import {
  canonicalV4PlayerSeasonEvidenceAvailability,
  loadCanonicalV4ExactPlayerSeasonEvidence,
} from './canonical-v4-player-season-evidence.js?v=20261002e&rev=canonical-v4-player-season-evidence-v5-dependency-cache-closure';
import { resolveCanonicalV4SiteConsumerSourcePolicy } from './canonical-v4-site-consumer-policy.js?v=20261002e&rev=canonical-v4-site-consumer-policy-v2-dependency-cache-closure';

export const CANONICAL_V4_PLAYER_BUILDER_ADAPTER_FORMAT = 'djhc-swishiq-v4-player-builder-adapter-v1';
export const CANONICAL_V4_PLAYER_BUILDER_ADAPTER_VERSION = 'swishiq-v4-player-builder-adapter-v1';

export function listCanonicalV4PlayerBuilderExactChoices(releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN) {
  const packages = Array.isArray(releasePin?.expectedIdentity?.packages) ? releasePin.expectedIdentity.packages : [];
  return Object.freeze(packages
    .filter(row => row?.scope?.kind === 'exact-season'
      && Number.isSafeInteger(row.scope.seasonStartYears?.[0])
      && row.scope.seasonStartYears.length === 1)
    .map(row => ({
      seasonStartYear: row.scope.seasonStartYears[0],
      packageId: row.packageId,
      packageVersion: row.packageVersion,
      availability: canonicalV4PlayerSeasonEvidenceAvailability({
        seasonStartYear: row.scope.seasonStartYears[0],
        phases: ['regular'],
        releasePin,
      }),
    }))
    .filter(row => row.availability.enabled)
    .sort((left, right) => left.seasonStartYear - right.seasonStartYear)
    .map(row => Object.freeze({
      seasonStartYear: row.seasonStartYear,
      packageId: row.packageId,
      packageVersion: row.packageVersion,
      label: `${row.seasonStartYear}–${String(row.seasonStartYear + 1).slice(-2)}`,
    })));
}

/** Load regular-season V4 player observations for the descriptive Builder view. */
export async function loadCanonicalV4PlayerBuilderSeason({
  seasonStartYear,
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  ...options
} = {}) {
  const policy = resolveCanonicalV4SiteConsumerSourcePolicy({ releasePin, consumerId: 'studio-player-builder-and-bootstrap' });
  if (!policy.v4Required || !policy.releaseReady) {
    const error = new Error(policy.reason);
    error.code = 'canonical-v4-player-builder-release-unavailable';
    throw error;
  }
  const evidence = await loadCanonicalV4ExactPlayerSeasonEvidence({
    seasonStartYear,
    phases: ['regular'],
    releasePin,
    ...options,
  });
  const rows = evidence.playerSeasonRows.filter(row => row.phase === 'regular').map(row => Object.freeze({
    normalizedPlayerNameKey: row.normalizedPlayerNameKey,
    displayName: row.displayName,
    seasonStartYear: row.seasonStartYear,
    teamCode: row.teamCode,
    phase: row.phase,
    positions: row.positions,
    games: row.games,
    starts: row.starts,
    minutes: row.minutes,
    box: row.box,
    metrics: row.metrics,
    identity: row.nameIdentity,
    temporalUse: row.temporalUse,
  }));
  if (!rows.length || rows.some(row => row.seasonStartYear !== seasonStartYear || row.phase !== 'regular')) {
    const error = new Error('The exact V4 Player Builder view does not contain regular-season rows for the selected season.');
    error.code = 'canonical-v4-player-builder-coverage-incomplete';
    throw error;
  }
  return Object.freeze({
    format: CANONICAL_V4_PLAYER_BUILDER_ADAPTER_FORMAT,
    version: CANONICAL_V4_PLAYER_BUILDER_ADAPTER_VERSION,
    status: 'verified-exact-season-descriptive-player-rows',
    sourceMode: 'canonical-v4-required',
    package: evidence.package,
    source: evidence.source,
    scope: evidence.scope,
    rowCount: rows.length,
    rows: Object.freeze(rows),
    useBoundary: Object.freeze({
      identity: 'normalized-display-name-key-scoped-by-season-team-phase',
      providerIdsUsed: false,
      descriptiveOnly: true,
      predictiveEligible: false,
      modelExecution: 'not-performed',
      approvalClaimsMade: false,
    }),
  });
}
