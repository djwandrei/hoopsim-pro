// Composite Forge model layer.
//
// This module intentionally stops at a provenance-preserving synthetic
// component recipe. It does not manufacture a player grade, RAPM, chemistry,
// availability, or a season result. A season result can only be requested
// through runCompositeForgeSimulation after both package capabilities, a
// separate simulationSeed, and a compatible runner have been supplied.

export const COMPOSITE_FORGE_MODEL_VERSION = 'composite-forge-model-v21-swishiq-v3';
export const COMPOSITE_FORGE_RECIPE_VERSION = 3;
export const COMPOSITE_FORGE_PUBLIC_RECEIPT_VERSION = 'composite-forge-public-receipt-v2';
export const COMPOSITE_FORGE_INTERPRETATION = Object.freeze({
  classification: 'descriptive-synthetic-scenario',
  outcomeValidationStatus: 'not-established',
  causalImpactSupported: false,
  calibratedForecastSupported: false,
});
export const COMPOSITE_FORGE_LIMITS = Object.freeze({
  maxProfiles: 6000,
  maxSensitivityProfiles: 4000,
  maxDonorsPerComponent: 8,
  maxPositionsPerProfile: 8,
  maxZ: 3,
  minCohortRows: 3,
  minSeasonRelationshipRows: 5,
  maxRecipeBytes: 32768,
});

// These are deliberately model outputs, not observed box-score claims.  A
// composite may borrow a scoring donor and a different playmaking donor, so
// the output layer keeps the source component and the donor range beside each
// value.  That makes a generated player useful for a game-style roster while
// preventing it from being mistaken for a real player-season row.
export const COMPOSITE_FORGE_OUTPUTS = Object.freeze({
  points: Object.freeze({ component: 'scoring', metric: 'points', unit: 'perGame', range: [0, 50] }),
  assists: Object.freeze({ component: 'playmaking', metric: 'assists', unit: 'perGame', range: [0, 20] }),
  turnovers: Object.freeze({ component: 'playmaking', metric: 'turnovers', unit: 'perGame', range: [0, 12] }),
  rebounds: Object.freeze({ component: 'rebounding', metric: 'rebounds', unit: 'perGame', range: [0, 25] }),
  steals: Object.freeze({ component: 'defensiveActivity', metric: 'steals', unit: 'perGame', range: [0, 6] }),
  blocks: Object.freeze({ component: 'defensiveActivity', metric: 'blocks', unit: 'perGame', range: [0, 8] }),
  involvementPer36: Object.freeze({ component: 'creation', metric: 'involvementPer36', unit: 'per36', range: [0, 100] }),
  fieldGoalPercentage: Object.freeze({ component: 'shooting', metric: 'fieldGoalAccuracy', unit: 'percent', range: [0, 1] }),
  threePointPercentage: Object.freeze({ component: 'shooting', metric: 'threePointAccuracy', unit: 'percent', range: [0, 1] }),
  threePointAttemptShare: Object.freeze({ component: 'shooting', metric: 'threePointFrequency', unit: 'percent', range: [0, 1] }),
  freeThrowPercentage: Object.freeze({ component: 'shooting', metric: 'freeThrowAccuracy', unit: 'percent', range: [0, 1] }),
  // True shooting can exceed 100% when made threes add more points than the
  // two-point-weighted attempt denominator; 150% is the count-derived ceiling.
  trueShootingPercentage: Object.freeze({ component: 'efficiency', metric: 'trueShootingPercentage', unit: 'percent', range: [0, 1.5] }),
  // eFG can exceed 100% when every made three is counted at 1.5 points.
  effectiveFieldGoalPercentage: Object.freeze({ component: 'efficiency', metric: 'effectiveFieldGoalPercentage', unit: 'percent', range: [0, 1.5] }),
  minutesPerGame: Object.freeze({ component: 'workload', metric: 'minutesPerGame', unit: 'minutesPerGame', range: [0, 48] }),
  games: Object.freeze({ component: 'workload', metric: 'games', unit: 'games', range: [0, 200] }),
});

export const COMPOSITE_FORGE_COMPONENTS = Object.freeze([
  { key: 'scoring', label: 'Scoring', metrics: Object.freeze(['points']), defaultMetric: 'points', weight: 1 },
  { key: 'shooting', label: 'Shooting', metrics: Object.freeze(['fieldGoalAccuracy', 'threePointAccuracy', 'threePointFrequency', 'freeThrowAccuracy']), defaultMetric: 'fieldGoalAccuracy', weight: 1 },
  { key: 'creation', label: 'Creation', metrics: Object.freeze(['involvementPer36']), defaultMetric: 'involvementPer36', weight: 1 },
  { key: 'playmaking', label: 'Playmaking and ball security', metrics: Object.freeze(['assists', 'turnovers']), defaultMetric: 'assists', weight: 1 },
  { key: 'rebounding', label: 'Rebounding', metrics: Object.freeze(['rebounds']), defaultMetric: 'rebounds', weight: 1 },
  { key: 'defensiveActivity', label: 'Defensive activity', metrics: Object.freeze(['steals', 'blocks']), defaultMetric: 'steals', weight: 1 },
  { key: 'efficiency', label: 'Efficiency', metrics: Object.freeze(['trueShootingPercentage', 'effectiveFieldGoalPercentage']), defaultMetric: 'auto', weight: 1 },
  { key: 'workload', label: 'Workload', metrics: Object.freeze(['minutesPerGame', 'games']), defaultMetric: 'minutesPerGame', weight: 1 },
].map(spec => Object.freeze(spec)));

// Build-A-Bucket-style choices are represented as role archetypes, not as an
// arbitrary overall grade. Each archetype constrains the positions and the
// minimum relationships that make a synthetic statistical profile coherent.
// A recipe can still choose named donors for every component, but incompatible
// role/skill combinations are now surfaced as an explicit validation block.
export const COMPOSITE_ARCHETYPES = Object.freeze({
  balanced: Object.freeze({ key: 'balanced', label: 'Balanced two-way', positions: Object.freeze(['G', 'F', 'C']), note: 'No single role is forced; selected components still need valid evidence and a supported position.' }),
  leadGuard: Object.freeze({ key: 'lead-guard', label: 'Lead guard', positions: Object.freeze(['G']), requirements: Object.freeze([{ key: 'creation', minimum: 10 }, { key: 'playmaking', minimum: 3 }]), note: 'Primary creation and playmaking must support a guard-led profile.' }),
  twoWayWing: Object.freeze({ key: 'two-way-wing', label: 'Two-way wing', positions: Object.freeze(['G', 'F']), requirements: Object.freeze([{ key: 'scoring', minimum: 12 }, { any: Object.freeze([{ key: 'defensiveActivity', minimum: 0.8 }, { key: 'defensiveActivity', minimum: 0.4, metric: 'blocks' }]) }]), note: 'Scoring must coexist with observable perimeter/interior defensive activity.' }),
  connectorForward: Object.freeze({ key: 'connector-forward', label: 'Connector forward', positions: Object.freeze(['F', 'C']), requirements: Object.freeze([{ key: 'rebounding', minimum: 5 }, { key: 'playmaking', minimum: 2 }]), note: 'A frontcourt connector needs both rebounding and passing evidence.' }),
  rimBig: Object.freeze({ key: 'rim-big', label: 'Rim big', positions: Object.freeze(['C', 'F']), requirements: Object.freeze([{ key: 'rebounding', minimum: 8 }, { key: 'defensiveActivity', minimum: 0.8, metric: 'blocks' }]), note: 'Rim protection and rebounding must be present before the profile can be simulated.' }),
  stretchBig: Object.freeze({ key: 'stretch-big', label: 'Stretch big', positions: Object.freeze(['F', 'C']), requirements: Object.freeze([{ key: 'shooting', minimum: 0.25, metric: 'threePointFrequency' }, { key: 'efficiency', minimum: 0.52, metric: 'trueShootingPercentage' }]), note: 'The frontcourt role requires three-point volume and efficient shooting evidence.' }),
});
const COMPOSITE_ARCHETYPE_KEYS = new Map(Object.entries(COMPOSITE_ARCHETYPES).flatMap(([key, spec]) => [[key, key], [spec.key, key]]));

const COMPONENT_BY_KEY = new Map(COMPOSITE_FORGE_COMPONENTS.map(spec => [spec.key, spec]));
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs', 'all phases']);
const SCOPES = new Set(['team', 'all-teams']);
const PACKAGE_KINDS = new Set(['exact-season', 'pooled-window', 'verified-exact-package-set']);
const SWISHIQ_V3_MODEL = 'swishiq-v3';
const SWISHIQ_V3_NORMALIZER = 'swishiq-v3-canonical-normalizer';
const SWISHIQ_V3_METRICS_V1_1 = 'swishiq-v3-metrics-v1.1';
const SWISHIQ_V3_METRICS_V1_2 = 'swishiq-v3-metrics-v1.2';
const SWISHIQ_V3_PACKAGE_ID = /^nba-swishiq-v3-(\d{4})-(\d{2})$/;
const SWISHIQ_V3_PACKAGE_VERSION = /^v3-(\d{4})-(\d{2})-([a-f0-9]{12})$/;
const SWISHIQ_V4_PACKAGE_ID = /^nba-swishiq-v4-(\d{4})-(\d{2})$/;
const SWISHIQ_V4_PACKAGE_VERSION = /^v4-canonical-(\d{8})-([a-f0-9]{12})$/;
const SWISHIQ_V4_MODEL = 'swishiq-canonical-v4';
const SWISHIQ_V4_NORMALIZER = 'swishiq-canonical-normalizer-v4.1.0';
const SWISHIQ_V4_METRICS = 'swishiq-canonical-metrics-v4.1.0';
const SWISHIQ_V4_PACKAGE_REF_FORMAT = 'djhc-swishiq-v4-package-ref-v1';
const NORMALIZATION_VALUES = new Set(['season', 'cohort', 'none']);
const ROLE_VALUES = new Set(['overlap', 'any', 'none']);
const WORKLOAD_VALUES = new Set(['band', 'none']);
const SEED = /^[A-Za-z0-9:._-]{1,80}$/;
const LEGACY_COMPOSITE_FORGE_MODEL_VERSION = 'composite-forge-model-v20-swishiq-v3';
const LEGACY_COMPOSITE_FORGE_RECIPE_VERSION = 2;
const COHORT_FINGERPRINT = /^[0-9a-f]{16}$/;
const METRIC_DEFINITIONS = Object.freeze({
  points: { unit: 'perGame', direction: 1, exposure: 'games', floor: 10, range: [0, 100], fallback: profile => profile?.perGame?.points },
  fieldGoalAccuracy: { unit: 'percent', direction: 1, exposure: 'denominator', floor: 25, range: [0, 1], fallback: profile => profile?.shooting?.fieldGoalPercentage },
  threePointAccuracy: { unit: 'percent', direction: 1, exposure: 'denominator', floor: 25, range: [0, 1], fallback: profile => profile?.shooting?.threePointPercentage },
  threePointFrequency: { unit: 'percent', direction: 1, exposure: 'denominator', floor: 50, range: [0, 1], fallback: profile => profile?.shooting?.threePointAttemptShare },
  freeThrowAccuracy: { unit: 'percent', direction: 1, exposure: 'denominator', floor: 20, range: [0, 1], fallback: profile => profile?.shooting?.freeThrowPercentage },
  involvementPer36: { unit: 'per36', direction: 1, exposure: 'minutes', floor: 120, range: [0, 100], fallback: profile => profile?.involvement },
  assists: { unit: 'perGame', direction: 1, exposure: 'games', floor: 10, range: [0, 40], fallback: profile => profile?.perGame?.assists },
  turnovers: { unit: 'perGame', direction: -1, exposure: 'games', floor: 10, range: [0, 30], fallback: profile => profile?.perGame?.turnovers },
  rebounds: { unit: 'perGame', direction: 1, exposure: 'games', floor: 10, range: [0, 40], fallback: profile => profile?.perGame?.rebounds },
  steals: { unit: 'perGame', direction: 1, exposure: 'games', floor: 10, range: [0, 10], fallback: profile => profile?.perGame?.steals },
  blocks: { unit: 'perGame', direction: 1, exposure: 'games', floor: 10, range: [0, 10], fallback: profile => profile?.perGame?.blocks },
  trueShootingPercentage: { unit: 'percent', direction: 1, exposure: 'denominator', floor: 50, range: [0, 1.5], fallback: profile => profile?.shooting?.trueShootingPercentage ?? profile?.shooting?.trueShootingApproximation },
  effectiveFieldGoalPercentage: { unit: 'percent', direction: 1, exposure: 'denominator', floor: 50, range: [0, 1.5], fallback: profile => profile?.shooting?.effectiveFieldGoalPercentage ?? profile?.shooting?.effectiveFieldGoal },
  minutesPerGame: { unit: 'minutesPerGame', direction: 1, exposure: 'games', floor: 10, range: [0, 48] },
  games: { unit: 'games', direction: 1, exposure: 'games', floor: 10, range: [0, 200] },
});

// A synthetic line is not a list of copied donor splits. These are the
// evidence-backed cross-skill relationships allowed to influence a displayed
// per-game output after its primary donor component establishes the baseline.
// The primary component remains dominant; a relationship only supplies a
// bounded consistency adjustment when both metrics are observable in the
// selected cohort.
const SYNTHETIC_OUTPUT_INTERACTIONS = Object.freeze({
  points: Object.freeze(['creation', 'efficiency', 'shooting']),
  assists: Object.freeze(['creation', 'scoring']),
  turnovers: Object.freeze(['creation', 'scoring']),
  rebounds: Object.freeze(['defensiveActivity']),
  steals: Object.freeze(['rebounding']),
  blocks: Object.freeze(['rebounding']),
});
// A relationship estimated from a selected cohort is preferred.  When the
// cohort is too small or the observed correlation is effectively zero, the
// builder may use these directional priors as a *small* regularizer.  The
// priors are not player grades or forecasts; they keep a multi-donor recipe
// from collapsing into an unchanged donor line while retaining a bounded,
// inspectable relationship assumption.
const SYNTHETIC_DIRECTIONAL_PRIORS = Object.freeze({
  points: Object.freeze({ creation: 1, efficiency: 1, shooting: 1 }),
  assists: Object.freeze({ creation: 1, scoring: 1 }),
  turnovers: Object.freeze({ creation: 1, scoring: 1 }),
  rebounds: Object.freeze({ defensiveActivity: 1 }),
  steals: Object.freeze({ rebounding: 1 }),
  blocks: Object.freeze({ rebounding: 1 }),
});
const SYNTHETIC_INTERACTION_SHARE = 0.2;
const SYNTHETIC_DIRECTIONAL_PRIOR_SHARE = 0.1;
const SYNTHETIC_DISTINCTNESS_TOLERANCE = 0.0005;
const VOLUME_OUTPUT_KEYS = Object.freeze(['points', 'assists', 'turnovers', 'rebounds', 'steals', 'blocks']);

const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, maximum = 240) => typeof value === 'string' && value.trim() && value.length <= maximum ? value.trim() : null;
const round = value => finite(value) ? Math.round(value * 10000) / 10000 : null;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const fail = message => { throw new Error(message); };

function normalizedEffectiveShares(donors) {
  const totalWeight = donors.reduce((sum, donor) => sum + donor.effectiveWeight, 0);
  if (!(totalWeight > 0)) return donors.map(() => 0);
  const shares = donors.map(donor => round(donor.effectiveWeight / totalWeight));
  const residual = round(1 - shares.reduce((sum, share) => sum + share, 0));
  if (shares.length && residual) {
    const largest = donors.reduce((best, donor, index) => donor.effectiveWeight > donors[best].effectiveWeight ? index : best, 0);
    shares[largest] = round(shares[largest] + residual);
  }
  return shares;
}

function stableJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { if (!finite(value)) fail('Composite recipes cannot contain non-finite numbers.'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  fail('Composite recipes cannot contain unsupported values.');
}

function replayMetric(value) {
  if (!object(value)) return null;
  const allowed = ['value', 'unit', 'total', 'numerator', 'denominator', 'knownGames', 'status', 'method', 'sourceMetric', 'reason', 'evidenceKind', 'coverage'];
  return Object.fromEntries(allowed.map(key => [key, value[key] === undefined ? null : value[key]]));
}

function replaySerializable(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(replaySerializable);
  if (object(value)) return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, replaySerializable(entry)]));
  return value;
}

function replayProfile(profile) {
  return {
    key: profileKey(profile), playerId: profile.playerId || null,
    player: profile.player || profile.playerName || null, playerName: profile.playerName || null,
    packageId: profile.packageId || null, packageVersion: profile.packageVersion || null,
    seasonStartYear: profile.seasonStartYear, phase: profile.phase, scope: profile.scope,
    team: profile.team, positions: Array.isArray(profile.positions) ? [...profile.positions] : [],
    games: profile.games, minutes: profile.minutes === undefined ? null : profile.minutes,
    age: profile.age === undefined ? null : profile.age,
    experience: profile.experience === undefined ? null : profile.experience,
    ageSource: profile.ageSource || null, experienceSource: profile.experienceSource || null,
    stateSource: profile.stateSource || null, stateJoin: profile.stateJoin || null,
    stateQuality: profile.stateQuality || null, stateConflict: replaySerializable(profile.stateConflict || null),
    aggregation: replaySerializable(profile.aggregation || null),
    perGame: replaySerializable(profile.perGame), shooting: replaySerializable(profile.shooting),
    involvement: replaySerializable(profile.involvement),
    components: Object.fromEntries(Object.entries(profile.components || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, replayMetric(value)])),
  };
}

function compositeCohortFingerprint(cohort) {
  const payload = {
    version: 'composite-cohort-replay-v1',
    id: cohort.id,
    profiles: cohort.profiles.map(replayProfile).sort((left, right) => left.key.localeCompare(right.key)),
    eraBaselines: replaySerializable(Array.isArray(cohort.eraBaselines) ? cohort.eraBaselines : []),
    teamProfiles: replaySerializable(Array.isArray(cohort.teamProfiles) ? cohort.teamProfiles : []),
  };
  return hashText(stableJson(payload));
}

function publicPackageRef(packageRef) {
  if (!object(packageRef)) return null;
  const allowed = ['format', 'packageId', 'packageVersion', 'packageManifestSha256', 'sourceManifestSetSha256', 'sourceLockSha256',
    'projectionContentSha256', 'registryVersion', 'registryRevisionSha256', 'projectionIndexPath',
    'indexSha256', 'modelId', 'normalizer', 'metricsVersion', 'acceptedPooledPackage', 'scope', 'sourcePackages', 'playerSeasonsArtifacts'];
  const result = {};
  for (const key of allowed) if (packageRef[key] !== undefined) result[key] = packageRef[key];
  if (object(result.scope)) result.scope = {
    kind: result.scope.kind,
    seasonStartYears: Array.isArray(result.scope.seasonStartYears) ? [...result.scope.seasonStartYears] : [],
    phases: Array.isArray(result.scope.phases) ? [...result.scope.phases] : [],
  };
  if (Array.isArray(result.sourcePackages)) result.sourcePackages = result.sourcePackages.map(source => ({
    format: source.format,
    packageId: source.packageId,
    packageVersion: source.packageVersion,
    packageManifestSha256: source.packageManifestSha256,
    sourceLockSha256: source.sourceLockSha256,
    projectionContentSha256: source.projectionContentSha256,
    registryVersion: source.registryVersion,
    registryRevisionSha256: source.registryRevisionSha256,
    projectionIndexPath: source.projectionIndexPath,
    indexSha256: source.indexSha256,
    modelId: source.modelId,
    normalizer: source.normalizer,
    metricsVersion: source.metricsVersion,
    scope: source.scope ? {
      kind: source.scope.kind,
      seasonStartYears: Array.isArray(source.scope.seasonStartYears) ? [...source.scope.seasonStartYears] : [],
      phases: Array.isArray(source.scope.phases) ? [...source.scope.phases] : [],
    } : null,
    playerSeasonsArtifacts: Array.isArray(source.playerSeasonsArtifacts) ? source.playerSeasonsArtifacts.map(artifact => ({
      artifactId: artifact.artifactId, path: artifact.path, sha256: artifact.sha256, rows: artifact.rows, bytes: artifact.bytes,
    })) : [],
  }));
  if (Array.isArray(result.playerSeasonsArtifacts)) result.playerSeasonsArtifacts = result.playerSeasonsArtifacts.map(artifact => ({
    artifactId: artifact.artifactId, path: artifact.path, sha256: artifact.sha256, rows: artifact.rows, bytes: artifact.bytes,
  }));
  return result;
}

function publicDonor(donor) {
  if (!object(donor)) return null;
  // profileKey/playerId are internal join handles. A public receipt keeps the
  // human-readable donor identity and the observed evidence, never provider
  // IDs or native adapter internals.
  return {
    player: donor.player || null,
    seasonStartYear: donor.seasonStartYear,
    phase: donor.phase,
    team: donor.team,
    scope: donor.scope,
    requestedWeight: donor.requestedWeight,
    exposureReliability: donor.exposureReliability,
    effectiveWeight: donor.effectiveWeight,
    effectiveShare: donor.effectiveShare,
    exposure: donor.exposure,
    exposureUnit: donor.exposureUnit,
    minimumExposure: donor.minimumExposure,
    reliabilityMethod: donor.reliabilityMethod,
    rawValue: donor.rawValue,
    rawContribution: donor.rawContribution,
    normalizedValue: donor.normalizedValue,
    denominator: donor.denominator,
    numerator: donor.numerator,
    knownGames: donor.knownGames,
    status: donor.status,
    method: donor.method,
    sourceMetric: donor.sourceMetric,
    evidenceKind: donor.evidenceKind,
    coverage: donor.coverage,
    sourceReason: donor.sourceReason,
    sourcePackage: publicDonorSourcePackage(donor.sourcePackage),
    baseline: donor.baseline,
    zScoreExtrapolation: donor.zScoreExtrapolation || null,
    fallbackDimensions: donor.fallbackDimensions,
    normalization: donor.normalization,
    aggregation: donor.aggregation,
    profileState: donor.profileState,
  };
}

function publicDonorSourcePackage(source) {
  if (!object(source)) return null;
  return {
    packageId: source.packageId || null,
    packageVersion: source.packageVersion || null,
    packageManifestSha256: source.packageManifestSha256 || null,
    sourceLockSha256: source.sourceLockSha256 || null,
    playerSeasonsArtifactId: source.playerSeasonsArtifactId || null,
    playerSeasonsArtifactSha256: source.playerSeasonsArtifactSha256 || null,
  };
}

function publicSensitivity(sensitivity) {
  if (!object(sensitivity)) return null;
  const safeChanges = changes => Array.isArray(changes) ? changes.map(change => ({
    component: change?.component || null,
    rawChange: change?.rawChange ?? null,
    normalizedChange: change?.normalizedChange ?? null,
    before: change?.before ?? null,
    after: change?.after ?? null,
  })) : [];
  const safeDerived = changes => Array.isArray(changes) ? changes.map(change => ({
    key: change?.key || null, before: change?.before ?? null, after: change?.after ?? null, change: change?.change ?? null,
  })) : [];
  const safeEvidence = changes => Array.isArray(changes) ? changes.map(change => ({
    key: change?.key || null,
    beforeSampleRows: change?.beforeSampleRows ?? null,
    afterSampleRows: change?.afterSampleRows ?? null,
    beforeIndependentDonorCount: change?.beforeIndependentDonorCount ?? null,
    afterIndependentDonorCount: change?.afterIndependentDonorCount ?? null,
    beforeEffectiveIndependentSamples: change?.beforeEffectiveIndependentSamples ?? null,
    afterEffectiveIndependentSamples: change?.afterEffectiveIndependentSamples ?? null,
    beforeEffectiveExposure: change?.beforeEffectiveExposure ?? null,
    afterEffectiveExposure: change?.afterEffectiveExposure ?? null,
    beforeReliability: change?.beforeReliability ?? null,
    afterReliability: change?.afterReliability ?? null,
  })) : [];
  return {
    status: sensitivity.status || null,
    method: sensitivity.method || null,
    delta: sensitivity.delta ?? null,
    componentWeightChanges: Array.isArray(sensitivity.componentWeightChanges)
      ? sensitivity.componentWeightChanges.map(change => ({
        component: change?.component || null,
        direction: change?.direction || null,
        from: change?.from ?? null,
        to: change?.to ?? null,
        changes: safeChanges(change?.changes),
        derivedChanges: safeDerived(change?.derivedChanges),
        evidenceChanges: safeEvidence(change?.evidenceChanges),
        componentRatingChanges: Array.isArray(change?.componentRatingChanges)
          ? change.componentRatingChanges.map(rating => ({
            component: rating?.component || null,
            before: rating?.before ?? null,
            after: rating?.after ?? null,
            change: rating?.change ?? null,
          })) : [],
      }))
      : [],
    donorChanges: Array.isArray(sensitivity.donorChanges)
      ? sensitivity.donorChanges.map(change => ({
        component: change?.component || null,
        changes: safeChanges(change?.changes),
        derivedChanges: safeDerived(change?.derivedChanges),
        evidenceChanges: safeEvidence(change?.evidenceChanges),
        componentRatingChanges: Array.isArray(change?.componentRatingChanges)
          ? change.componentRatingChanges.map(rating => ({
            component: rating?.component || null,
            before: rating?.before ?? null,
            after: rating?.after ?? null,
            change: rating?.change ?? null,
          })) : [],
      }))
      : [],
    note: sensitivity.note || null,
  };
}

function publicValidation(validation) {
  if (!object(validation)) return null;
  const scopedNotice = (notice, fallback) => {
    const value = typeof notice === 'string' ? notice : '';
    const component = value.split(':', 1)[0];
    return component && /^[A-Za-z][A-Za-z0-9_-]*$/.test(component)
      ? `${component}: ${fallback}` : fallback;
  };
  return {
    status: validation.status || null,
    simulationReady: validation.simulationReady === true,
    outputReady: validation.outputReady === true,
    outputStatus: ['ready', 'partial', 'unavailable'].includes(validation.outputStatus) ? validation.outputStatus : null,
    selectedComponentCount: Number.isInteger(validation.selectedComponentCount) ? validation.selectedComponentCount : 0,
    totalComponentCount: Number.isInteger(validation.totalComponentCount) ? validation.totalComponentCount : 0,
    issues: Array.isArray(validation.issues) ? validation.issues.map(issue => scopedNotice(issue, 'validation issue.')) : [],
    warnings: Array.isArray(validation.warnings) ? validation.warnings.map(warning => scopedNotice(warning, 'evidence caveat.')) : [],
    missingComponents: Array.isArray(validation.missingComponents) ? [...validation.missingComponents] : [],
    missingSyntheticOutputs: Array.isArray(validation.missingSyntheticOutputs) ? [...validation.missingSyntheticOutputs] : [],
    extrapolation: object(validation.extrapolation) ? {
      maxZ: validation.extrapolation.maxZ ?? null,
      status: validation.extrapolation.status || null,
    } : null,
    stateEvidence: object(validation.stateEvidence) ? stripCompositeJoinHandles(validation.stateEvidence) : null,
    coherence: object(validation.coherence) ? stripCompositeJoinHandles(validation.coherence) : null,
  };
}

// Public receipts may include runner-supplied fit or distribution metadata.
// Keep those values displayable while removing opaque native/provider join
// handles if an accepted runner attaches them to a nested result.
function stripCompositeJoinHandles(value) {
  if (Array.isArray(value)) return value.map(stripCompositeJoinHandles);
  if (!object(value)) return value;
  const blocked = /^(?:player(?:id|ref|seasonref)|targetplayer(?:id|ref)|profilekey|selecteddonorkeys|canonicalid|provider(?:id|ref)?|nativeprovenance)$/i;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !blocked.test(key))
    .map(([key, entry]) => [key, stripCompositeJoinHandles(entry)]));
}

// FNV-1a 64 is used only as a deterministic local recipe/run identifier. It
// is not a package integrity hash; package integrity remains bound to the
// package manifest and source locks supplied by the caller.
function hashText(value) {
  let hash = 1469598103934665603n;
  for (const character of String(value)) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, '0');
}

function metricSource(profile, key) {
  const source = profile?.components?.[key];
  if (object(source)) return source;
  return null;
}

function scalarSource(source) {
  if (finite(source)) return source;
  if (object(source) && finite(source.value)) return source.value;
  return null;
}

function componentMeta(profile, key) {
  const source = metricSource(profile, key);
  const raw = scalarSource(source?.value) ?? scalarSource(source) ?? scalarSource(METRIC_DEFINITIONS[key]?.fallback?.(profile));
  return { source, raw, unit: source?.unit || METRIC_DEFINITIONS[key]?.unit || null,
    // Season-package component rows use `total` for count-backed per-game
    // metrics, while ratio rows use numerator/denominator. Preserve both
    // shapes so derived efficiency never silently treats a missing total as
    // zero or invents a denominator.
    numerator: finite(source?.numerator) ? source.numerator : finite(source?.total) ? source.total : null,
    denominator: finite(source?.denominator) ? source.denominator
      : source?.unit === 'perGame' && finite(source?.knownGames) ? source.knownGames : null,
    knownGames: integer(source?.knownGames, 0) ? source.knownGames : integer(profile?.games, 0) ? profile.games : null,
    status: source?.status || null, sourceMetric: source?.sourceMetric || null,
    evidenceKind: source?.evidenceKind || null, coverage: source?.coverage || null,
    sourceCoverage: Array.isArray(source?.sourceCoverage) ? [...source.sourceCoverage] : source?.coverage ? [source.coverage] : [],
    sourceReasons: Array.isArray(source?.sourceReasons) ? [...source.sourceReasons] : [],
    sourceReason: source?.sourceReason || source?.reason || null };
}

function derivedEfficiency(profile, key) {
  const fg = componentMeta(profile, 'fieldGoalAccuracy');
  const three = componentMeta(profile, 'threePointAccuracy');
  const threeShare = componentMeta(profile, 'threePointFrequency');
  const points = componentMeta(profile, 'points');
  const freeThrow = componentMeta(profile, 'freeThrowAccuracy');
  if (key === 'effectiveFieldGoalPercentage'
    && integer(fg.numerator, 0) && integer(fg.denominator, 1)
    && integer(three.numerator, 0) && integer(three.denominator, 1)
    && three.denominator === threeShare.numerator && fg.denominator === threeShare.denominator) {
    return { raw: (fg.numerator + 0.5 * three.numerator) / fg.denominator, numerator: fg.numerator + 0.5 * three.numerator,
      denominator: fg.denominator, knownGames: fg.knownGames, unit: 'percent', method: 'derived-exact-shooting-ratio-v1' };
  }
  if (key === 'trueShootingPercentage'
    && integer(points.numerator, 0) && integer(fg.denominator, 0) && integer(freeThrow.denominator, 0)
    && (fg.denominator + 0.44 * freeThrow.denominator) > 0) {
    return { raw: points.numerator / (2 * (fg.denominator + 0.44 * freeThrow.denominator)), numerator: points.numerator,
      denominator: 2 * (fg.denominator + 0.44 * freeThrow.denominator), knownGames: points.knownGames,
      unit: 'percent', method: 'derived-exact-shooting-ratio-v1' };
  }
  return null;
}

export function readCompositeMetric(profile, key) {
  const definition = METRIC_DEFINITIONS[key];
  if (!definition) fail(`Unsupported Composite Forge metric: ${key}.`);
  const sourceMeta = componentMeta(profile, key);
  // A public season profile may expose a convenience efficiency percentage
  // without its denominator. Prefer an exact count-backed derivation whenever
  // that convenience value is not independently denominator-qualified.
  const derived = (key === 'trueShootingPercentage' || key === 'effectiveFieldGoalPercentage')
    && (sourceMeta.raw === null || sourceMeta.denominator === null)
    ? derivedEfficiency(profile, key) : null;
  let value = derived?.raw ?? sourceMeta.raw;
  let numerator = derived?.numerator ?? sourceMeta.numerator;
  let denominator = derived?.denominator ?? sourceMeta.denominator;
  let knownGames = derived?.knownGames ?? sourceMeta.knownGames;
  let unit = derived?.unit ?? sourceMeta.unit ?? definition.unit;
  let method = derived?.method || sourceMeta.source?.method
    || (sourceMeta.evidenceKind ? `native-${sourceMeta.evidenceKind}`
      : sourceMeta.raw !== null ? 'declared-season-component-v1' : 'profile-field-fallback-v1');
  if (key === 'minutesPerGame' && value === null && finite(profile?.minutes) && integer(profile?.games, 1)) {
    value = profile.minutes / profile.games; numerator = profile.minutes; denominator = profile.games; knownGames = profile.games; unit = definition.unit; method = 'derived-workload-minutes-per-game-v1';
  }
  if (key === 'games' && value === null && integer(profile?.games, 0)) {
    value = profile.games; numerator = profile.games; denominator = 1; knownGames = profile.games; unit = definition.unit; method = 'declared-season-games-v1';
  }
  if (sourceMeta.status === 'unavailable' && !derived) value = null;
  const expectedUnit = definition.unit;
  if (value !== null && sourceMeta.unit && sourceMeta.unit !== expectedUnit && !derived) value = null;
  const exposure = definition.exposure === 'denominator' ? denominator
    : definition.exposure === 'minutes' ? profile?.minutes : knownGames;
  const exposureUnit = definition.exposure === 'denominator' ? 'denominator'
    : definition.exposure === 'minutes' ? 'minutes' : 'games';
  const range = definition.range;
  const rangeValid = value !== null && finite(value) && value >= range[0] && value <= range[1];
  const denominatorValid = definition.exposure === 'denominator'
    ? (method === 'derived-exact-shooting-ratio-v1' ? finite(denominator) && denominator > 0 : integer(denominator, 1))
    : finite(exposure) && exposure > 0;
  const available = value !== null && rangeValid && denominatorValid && (knownGames === null || knownGames > 0);
  const status = !available ? 'unavailable'
    : sourceMeta.status === 'limited_sample' || knownGames !== null && knownGames < 5 ? 'limited_sample' : 'observed';
  const reason = !available ? (value === null ? 'missing-component' : !rangeValid ? 'outside-supported-range' : 'missing-denominator')
    : status === 'limited_sample' ? sourceMeta.sourceReason || 'limited-season-exposure' : 'observed-season-component';
  return { key, value: available ? round(value) : null, unit: expectedUnit, numerator, denominator,
    knownGames, exposure: finite(exposure) ? exposure : null, exposureUnit, status, method, direction: definition.direction,
    minimumExposure: definition.floor, reason, range: [...range], sourceMetric: sourceMeta.sourceMetric,
    evidenceKind: sourceMeta.evidenceKind, coverage: sourceMeta.coverage, sourceCoverage: sourceMeta.sourceCoverage,
    sourceReasons: sourceMeta.sourceReasons, sourceReason: sourceMeta.sourceReason };
}

const SHA256 = /^[a-f0-9]{64}$/;

// Package-version validation is synchronous because Composite Forge exposes a
// synchronous normalizer. The four version-pin fields are validated ASCII
// tokens, so this small SHA-256 implementation matches the UTF-8 package
// contract without relying on an asynchronous WebCrypto call.
function sha256AsciiHex(value) {
  const bytes = [];
  for (const character of String(value)) {
    const code = character.charCodeAt(0);
    if (code > 0x7f) fail('A V3 package version pin contains a non-ASCII value.');
    bytes.push(code);
  }
  const bitLength = BigInt(bytes.length) * 8n;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 56n; shift >= 0n; shift -= 8n) bytes.push(Number((bitLength >> shift) & 0xffn));

  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rotateRight = (word, count) => (word >>> count) | (word << (32 - count));

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array(64).fill(0);
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      words[index] = ((bytes[start] << 24) | (bytes[start + 1] << 16) | (bytes[start + 2] << 8) | bytes[start + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15], y = words[index - 2];
      const sigma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const sigma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  return state.map(word => word.toString(16).padStart(8, '0')).join('');
}

function expectedV3PackageVersion(packageRef, scopeLabel) {
  const sourceLockSha256 = String(packageRef?.sourceLockSha256 || '');
  if (packageRef?.metricsVersion === SWISHIQ_V3_METRICS_V1_1) {
    return `v3-${scopeLabel}-${sourceLockSha256.slice(0, 12)}`;
  }
  if (packageRef?.metricsVersion === SWISHIQ_V3_METRICS_V1_2) {
    const versionDigest = sha256AsciiHex([
      packageRef.modelId,
      sourceLockSha256,
      packageRef.normalizer,
      packageRef.metricsVersion,
    ].join('|'));
    return `v3-${scopeLabel}-${versionDigest.slice(0, 12)}`;
  }
  return null;
}

function normalizeExactSourcePackageRef(source) {
  if (object(source) && source.format === SWISHIQ_V4_PACKAGE_REF_FORMAT) {
    return normalizeExactV4SourcePackageRef(source);
  }
  if (!object(source) || source.format !== 'djhc-swishiq-package-v3'
    || !text(source.packageId, 80) || !text(source.packageVersion, 80)
    || !SHA256.test(String(source.packageManifestSha256 || ''))
    || !SHA256.test(String(source.sourceLockSha256 || ''))
    || !SHA256.test(String(source.projectionContentSha256 || ''))
    || !text(source.registryVersion, 80) || !SHA256.test(String(source.registryRevisionSha256 || ''))
    || !text(source.projectionIndexPath, 320) || source.projectionIndexPath.includes('..')
    || !text(source.modelId, 120) || !text(source.normalizer, 160) || !text(source.metricsVersion, 160)) {
    fail('A verified exact-season source package is missing its published package and registry pins.');
  }
  const scope = source.scope;
  if (!object(scope) || scope.kind !== 'exact-season' || !Array.isArray(scope.seasonStartYears)
    || scope.seasonStartYears.length !== 1 || !integer(scope.seasonStartYears[0], 1947, 2200)
    || !Array.isArray(scope.phases) || !scope.phases.length || scope.phases.some(phase => !PHASES.has(phase))) {
    fail('A verified source package must bind exactly one published season and supported phase.');
  }
  const start = scope.seasonStartYears[0];
  const endLabel = String(start + 1).slice(-2);
  const label = `${start}-${endLabel}`;
  if (source.modelId !== SWISHIQ_V3_MODEL || source.normalizer !== SWISHIQ_V3_NORMALIZER
    || source.packageId !== `nba-swishiq-v3-${label}`
    || source.packageVersion !== expectedV3PackageVersion(source, label)
    || source.projectionIndexPath !== `packages/${source.packageId}/${source.packageVersion}/index.json`) {
    fail('A verified exact-season source package is not pinned to the V3 model and projection schema.');
  }
  const artifacts = source.playerSeasonsArtifacts;
  if (!Array.isArray(artifacts) || !artifacts.length || artifacts.length > 16) {
    fail('Each exact source package needs its verified player-season artifact descriptors.');
  }
  const normalizedArtifacts = artifacts.map(artifact => {
    if (!object(artifact) || !/^player-seasons(?:-\d{4})?$/.test(String(artifact.artifactId || ''))
      || !text(artifact.path, 240) || !/^parts\/player-seasons(?:-\d{4})?\.json$/.test(artifact.path)
      || !SHA256.test(String(artifact.sha256 || '')) || !integer(artifact.rows, 1, 100000)
      || !integer(artifact.bytes, 1, 100000000)) {
      fail('An exact source package has an invalid or unpinned player-season artifact.');
    }
    return { artifactId: artifact.artifactId, path: artifact.path, sha256: artifact.sha256, rows: artifact.rows, bytes: artifact.bytes };
  }).sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  if (new Set(normalizedArtifacts.map(artifact => artifact.artifactId)).size !== normalizedArtifacts.length) {
    fail('An exact source package repeats a player-season artifact descriptor.');
  }
  return {
    format: 'djhc-swishiq-package-v3',
    packageId: source.packageId,
    packageVersion: source.packageVersion,
    packageManifestSha256: source.packageManifestSha256,
    sourceLockSha256: source.sourceLockSha256,
    projectionContentSha256: source.projectionContentSha256,
    registryVersion: source.registryVersion,
    registryRevisionSha256: source.registryRevisionSha256,
    projectionIndexPath: source.projectionIndexPath,
    modelId: source.modelId,
    normalizer: source.normalizer,
    metricsVersion: source.metricsVersion,
    scope: { kind: 'exact-season', seasonStartYears: [scope.seasonStartYears[0]], phases: [...new Set(scope.phases)].sort() },
    playerSeasonsArtifacts: normalizedArtifacts,
  };
}

function normalizeExactV4SourcePackageRef(source) {
  if (!object(source) || source.format !== SWISHIQ_V4_PACKAGE_REF_FORMAT
    || !text(source.packageId, 80) || !text(source.packageVersion, 80)
    || !SHA256.test(String(source.packageManifestSha256 || ''))
    || !SHA256.test(String(source.sourceLockSha256 || ''))
    || !SHA256.test(String(source.indexSha256 || ''))
    || !text(source.registryVersion, 80) || !SHA256.test(String(source.registryRevisionSha256 || ''))
    || source.modelId !== SWISHIQ_V4_MODEL || source.normalizer !== SWISHIQ_V4_NORMALIZER
    || source.metricsVersion !== SWISHIQ_V4_METRICS) {
    fail('A verified V4 exact-season source package is missing its published package and registry pins.');
  }
  const scope = source.scope;
  if (!object(scope) || scope.kind !== 'exact-season' || !Array.isArray(scope.seasonStartYears)
    || scope.seasonStartYears.length !== 1 || !integer(scope.seasonStartYears[0], 1947, 2200)
    || !Array.isArray(scope.phases) || !scope.phases.length || scope.phases.some(phase => !PHASES.has(phase))) {
    fail('A verified V4 source package must bind exactly one published season and supported phase.');
  }
  const start = scope.seasonStartYears[0];
  const end = String(start + 1).slice(-2);
  const packageMatch = SWISHIQ_V4_PACKAGE_ID.exec(source.packageId);
  const versionMatch = SWISHIQ_V4_PACKAGE_VERSION.exec(source.packageVersion);
  if (source.packageId !== `nba-swishiq-v4-${start}-${end}`
    || packageMatch?.[1] !== String(start) || packageMatch?.[2] !== end
    || !versionMatch) {
    fail('A verified exact-season source package is not pinned to the V4 model and package scope.');
  }
  const artifacts = source.playerSeasonsArtifacts;
  if (!Array.isArray(artifacts) || !artifacts.length || artifacts.length > 16) {
    fail('Each V4 exact source package needs its verified player-season artifact descriptors.');
  }
  const normalizedArtifacts = artifacts.map(artifact => {
    if (!object(artifact) || !/^player-seasons(?:-\d{4})?$/.test(String(artifact.artifactId || ''))
      || !text(artifact.path, 240) || !/^parts\/player-seasons(?:-\d{4})?\.json$/.test(artifact.path)
      || !SHA256.test(String(artifact.sha256 || '')) || !integer(artifact.rows, 1, 100000)
      || !integer(artifact.bytes, 1, 100000000)) {
      fail('A V4 exact source package has an invalid or unpinned player-season artifact.');
    }
    return { artifactId: artifact.artifactId, path: artifact.path, sha256: artifact.sha256, rows: artifact.rows, bytes: artifact.bytes };
  }).sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  if (new Set(normalizedArtifacts.map(artifact => artifact.artifactId)).size !== normalizedArtifacts.length) {
    fail('A V4 exact source package repeats a player-season artifact descriptor.');
  }
  return {
    format: SWISHIQ_V4_PACKAGE_REF_FORMAT,
    packageId: source.packageId,
    packageVersion: source.packageVersion,
    packageManifestSha256: source.packageManifestSha256,
    sourceLockSha256: source.sourceLockSha256,
    indexSha256: source.indexSha256,
    registryVersion: source.registryVersion,
    registryRevisionSha256: source.registryRevisionSha256,
    modelId: source.modelId,
    normalizer: source.normalizer,
    metricsVersion: source.metricsVersion,
    acceptedPooledPackage: false,
    scope: { kind: 'exact-season', seasonStartYears: [start], phases: [...new Set(scope.phases)].sort() },
    playerSeasonsArtifacts: normalizedArtifacts,
  };
}

function validatePackageRef(packageRef) {
  if (!object(packageRef)) fail('Composite Forge requires a bound published package or verified source set.');
  const scope = packageRef.scope;
  if (!object(scope) || !PACKAGE_KINDS.has(scope.kind) || !Array.isArray(scope.seasonStartYears) || !scope.seasonStartYears.length
    || scope.seasonStartYears.some(year => !integer(year, 1947, 2200)) || new Set(scope.seasonStartYears).size !== scope.seasonStartYears.length
    || scope.seasonStartYears.some((year, index) => index && year <= scope.seasonStartYears[index - 1])) fail('Composite Forge package scope must list ordered unique seasons.');
  if (!Array.isArray(scope.phases) || !scope.phases.length || scope.phases.some(phase => !PHASES.has(phase))
    || new Set(scope.phases).size !== scope.phases.length) fail('Composite Forge package scope needs supported competition phases.');
  if (scope.kind === 'verified-exact-package-set') {
    if (packageRef.format !== 'djhc-swishiq-verified-exact-package-set-v1' || packageRef.acceptedPooledPackage === true
      || !Array.isArray(packageRef.sourcePackages) || packageRef.sourcePackages.length < 2 || packageRef.sourcePackages.length > 9) {
      fail('A cross-season Composite Forge source set must contain individually verified exact-season packages.');
    }
    const sourcePackages = packageRef.sourcePackages.map(normalizeExactSourcePackageRef)
      .sort((left, right) => left.scope.seasonStartYears[0] - right.scope.seasonStartYears[0]);
    if (new Set(sourcePackages.map(source => source.format)).size !== 1) {
      fail('A verified exact-package set cannot mix V3 and V4 source packages.');
    }
    const sourceYears = sourcePackages.map(source => source.scope.seasonStartYears[0]);
    if (new Set(sourceYears).size !== sourceYears.length || stableJson(sourceYears) !== stableJson(scope.seasonStartYears)) {
      fail('The verified exact-package set season scope must exactly match its distinct source packages.');
    }
    const registryPins = new Set(sourcePackages.map(source => `${source.registryVersion}|${source.registryRevisionSha256}`));
    if (registryPins.size !== 1) fail('Exact source packages must be verified against one registry revision.');
    const sharedPhases = sourcePackages.reduce((shared, source) => shared.filter(phase => source.scope.phases.includes(phase)), [...sourcePackages[0].scope.phases]);
    if (!sharedPhases.length || stableJson(sharedPhases) !== stableJson(scope.phases)) {
      fail('The verified exact-package set phase scope must match the phases shared by all source packages.');
    }
    return {
      format: 'djhc-swishiq-verified-exact-package-set-v1',
      acceptedPooledPackage: false,
      sourcePackages,
      scope: { kind: 'verified-exact-package-set', seasonStartYears: sourceYears, phases: sharedPhases },
    };
  }
  if (!text(packageRef.packageId) || !text(packageRef.packageVersion)) fail('Composite Forge requires a bound package ID and version.');
  if (packageRef.format === SWISHIQ_V4_PACKAGE_REF_FORMAT) {
    if (scope.kind !== 'exact-season' || packageRef.acceptedPooledPackage === true) {
      fail('V4 Composite Forge requires one exact season; pooled donors use individually verified exact-season source packages.');
    }
    return normalizeExactV4SourcePackageRef(packageRef);
  }
  const start = scope.seasonStartYears[0];
  const end = scope.seasonStartYears.at(-1) + 1;
  const label = `${start}-${String(end).slice(-2)}`;
  const packageMatch = SWISHIQ_V3_PACKAGE_ID.exec(packageRef.packageId);
  const versionMatch = SWISHIQ_V3_PACKAGE_VERSION.exec(packageRef.packageVersion);
  if (packageRef.format !== 'djhc-swishiq-package-v3'
    || packageRef.modelId !== SWISHIQ_V3_MODEL
    || packageRef.normalizer !== SWISHIQ_V3_NORMALIZER
    || !SHA256.test(String(packageRef.sourceLockSha256 || ''))
    || packageRef.packageId !== `nba-swishiq-v3-${label}`
    || packageRef.packageVersion !== expectedV3PackageVersion(packageRef, label)
    || packageMatch?.[1] !== String(start) || packageMatch?.[2] !== String(end).slice(-2)
    || versionMatch?.[1] !== String(start) || versionMatch?.[2] !== String(end).slice(-2)) {
    fail('Composite Forge accepts only V3 package IDs, versions, and model pins.');
  }
  if (scope.kind === 'pooled-window' && packageRef.acceptedPooledPackage !== true) fail('Cross-season Composite Forge donors require an accepted pooled package.');
  if (scope.kind === 'exact-season' && scope.seasonStartYears.length !== 1) fail('An exact Composite Forge package must bind one season.');
  return { format: 'djhc-swishiq-package-v3', packageId: packageRef.packageId, packageVersion: packageRef.packageVersion,
    packageManifestSha256: text(packageRef.packageManifestSha256, 128), sourceManifestSetSha256: text(packageRef.sourceManifestSetSha256, 128),
    sourceLockSha256: text(packageRef.sourceLockSha256, 128), projectionContentSha256: text(packageRef.projectionContentSha256, 128),
    registryVersion: text(packageRef.registryVersion, 80), registryRevisionSha256: text(packageRef.registryRevisionSha256, 128),
    projectionIndexPath: text(packageRef.projectionIndexPath, 320), modelId: text(packageRef.modelId, 120),
    normalizer: text(packageRef.normalizer, 160), metricsVersion: text(packageRef.metricsVersion, 160),
    acceptedPooledPackage: packageRef.acceptedPooledPackage === true, scope: { kind: scope.kind, seasonStartYears: [...scope.seasonStartYears], phases: [...scope.phases] } };
}

export function normalizeCompositeForgePackageRef(packageRef) {
  return validatePackageRef(packageRef);
}

/**
 * Bind a cross-season Composite Forge cohort to exact-season package proofs
 * that were individually loaded and hash-verified by the public package
 * loader. This source set is a comparison manifest, never a pooled package.
 */
export function createCompositeForgeExactPackageSetRef(sourcePackages) {
  if (!Array.isArray(sourcePackages)) fail('Composite Forge exact source packages must be listed explicitly.');
  const normalized = sourcePackages.map(normalizeExactSourcePackageRef)
    .sort((left, right) => left.scope.seasonStartYears[0] - right.scope.seasonStartYears[0]);
  const years = normalized.map(source => source.scope.seasonStartYears[0]);
  const phases = normalized.length ? normalized.reduce((shared, source) => shared.filter(phase => source.scope.phases.includes(phase)), [...normalized[0].scope.phases]) : [];
  const sourceFormats = new Set(normalized.map(source => source.format));
  if (sourceFormats.size !== 1) fail('Composite Forge exact source packages cannot mix data versions.');
  return validatePackageRef({
    format: 'djhc-swishiq-verified-exact-package-set-v1',
    sourcePackages: normalized,
    acceptedPooledPackage: false,
    scope: { kind: 'verified-exact-package-set', seasonStartYears: years, phases },
  });
}

function profileKey(profile) {
  return text(profile?.key, 320) || [profile?.playerId, profile?.seasonStartYear, profile?.phase, profile?.team, profile?.scope].join('|');
}

function validateProfile(profile, packageRef) {
  const packageScope = packageRef.scope;
  if (!object(profile) || !text(profileKey(profile), 320) || !text(profile.player || profile.playerName, 240)
    || !text(profile.playerId, 160) || !integer(profile.seasonStartYear, 1947, 2200) || !PHASES.has(profile.phase)
    || !SCOPES.has(profile.scope) || !text(profile.team, 160) || !integer(profile.games, 0, 300)
    || (profile.minutes !== null && profile.minutes !== undefined && (!finite(profile.minutes) || profile.minutes < 0))
    || (profile.positions !== undefined && (!Array.isArray(profile.positions) || profile.positions.length > COMPOSITE_FORGE_LIMITS.maxPositionsPerProfile))) {
    fail('Composite Forge cohort contains an invalid player-season identity or workload row.');
  }
  if (!packageScope.seasonStartYears.includes(profile.seasonStartYear) || !packageScope.phases.includes(profile.phase)) {
    fail('A Composite Forge donor escapes the selected package season or phase scope.');
  }
  if (profile.positions?.some(position => !text(position, 20))) fail('Composite Forge positions must be bounded labels.');
  if (packageScope.kind === 'verified-exact-package-set') {
    const source = packageRef.sourcePackages.find(candidate => candidate.packageId === profile.packageId
      && candidate.packageVersion === profile.packageVersion
      && candidate.scope.seasonStartYears[0] === profile.seasonStartYear
      && candidate.scope.phases.includes(profile.phase));
    const provenance = profile.nativeProvenance;
    const artifact = source?.playerSeasonsArtifacts.find(candidate => candidate.artifactId === provenance?.playerSeasonsArtifactId
      && candidate.sha256 === provenance?.playerSeasonsArtifactSha256);
    if (!source || !artifact || provenance.packageManifestSha256 !== source.packageManifestSha256
      || provenance.sourceLockSha256 !== source.sourceLockSha256) {
      fail('A cross-season donor must retain the exact package and player-season artifact hash that supplied its observed row.');
    }
  } else {
    if (profile.packageId && profile.packageId !== packageRef.packageId) fail('A donor profile belongs to a different package.');
    if (profile.packageVersion && profile.packageVersion !== packageRef.packageVersion) fail('A donor profile belongs to a different package version.');
  }
  return profile;
}

export function validateCompositeForgeCohort(cohort, packageRef) {
  const packageScope = validatePackageRef(packageRef);
  if (!object(cohort) || !text(cohort.id, 160) || !Array.isArray(cohort.profiles)
    || cohort.profiles.length < 1 || cohort.profiles.length > COMPOSITE_FORGE_LIMITS.maxProfiles) fail('Composite Forge requires a bounded named player-season cohort.');
  const keys = cohort.profiles.map(profileKey);
  if (keys.some(key => !text(key, 320)) || new Set(keys).size !== keys.length) fail('Composite Forge cohort keys must be unique and stable.');
  cohort.profiles.forEach(profile => validateProfile(profile, packageScope));
  if (cohort.eraBaselines !== undefined && (!Array.isArray(cohort.eraBaselines) || cohort.eraBaselines.length > COMPOSITE_FORGE_LIMITS.maxProfiles)) fail('Composite Forge era baselines exceed the bounded cohort contract.');
  if (cohort.eraBaselines) cohort.eraBaselines.forEach(row => {
    if (!object(row) || !text(row.metric, 120) || !PHASES.has(row.phase) || !integer(row.seasonStartYear, 1947, 2200)
      || !finite(row.mean) || row.standardDeviation !== null && row.standardDeviation !== undefined && (!finite(row.standardDeviation) || row.standardDeviation < 0)) {
      fail('Composite Forge era baselines contain an invalid metric, phase, season, or spread.');
    }
  });
  return cohort;
}

function normalizeNormalization(input = {}) {
  const era = input.era || 'season', role = input.role || 'overlap', workload = input.workload || 'band';
  if (!NORMALIZATION_VALUES.has(era) || !ROLE_VALUES.has(role) || !WORKLOAD_VALUES.has(workload)) fail('Composite Forge normalization dimensions are unsupported.');
  const maxZ = input.maxZ === undefined ? COMPOSITE_FORGE_LIMITS.maxZ : input.maxZ;
  if (!finite(maxZ) || maxZ <= 0 || maxZ > 8) fail('Composite Forge maxZ must be a positive bounded number.');
  const minCohortRows = input.minCohortRows === undefined ? COMPOSITE_FORGE_LIMITS.minCohortRows : input.minCohortRows;
  if (!integer(minCohortRows, 1, 100)) fail('Composite Forge minimum normalization cohort must be bounded.');
  return { version: 'era-role-workload-denominator-v1', era, role, workload, maxZ, minCohortRows };
}

function normalizeWeights(input = {}) {
  const raw = Object.fromEntries(COMPOSITE_FORGE_COMPONENTS.map(spec => [spec.key, input?.[spec.key] === undefined ? spec.weight : input[spec.key]]));
  if (Object.values(raw).some(value => !finite(value) || value < 0 || value > 1)) fail('Composite Forge component weights must be finite values from 0 to 1.');
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) fail('Composite Forge needs at least one positive component weight.');
  const entries = Object.entries(raw);
  // Store weights on a 1e-4 grid, then put the rounding residual on the
  // largest component. The recipe therefore sums to exactly one even when
  // sliders produce repeating decimals.
  const units = entries.map(([key, value]) => [key, Math.max(0, Math.round(value / total * 10000))]);
  if (entries.some(([, value], index) => value > 0 && units[index][1] < 1)) {
    fail('Each positive Composite Forge component weight must retain at least 0.0001 of the normalized weight.');
  }
  const unitTotal = units.reduce((sum, [, value]) => sum + value, 0);
  const target = units.reduce((best, entry, index) => entry[1] > units[best][1] ? index : best, 0);
  units[target][1] = Math.max(0, units[target][1] + (10000 - unitTotal));
  return Object.fromEntries(units.map(([key, value]) => [key, value / 10000]));
}

function normalizePlacement(input = {}) {
  const mode = input.mode || 'unassigned';
  if (!['unassigned', 'chosen', 'seeded-random'].includes(mode)) fail('Composite Forge placement must be unassigned, chosen, or seeded-random.');
  const team = input.team === undefined || input.team === null || input.team === '' ? null : text(input.team, 80);
  if (input.team !== undefined && input.team !== null && input.team !== '' && !team) fail('Composite Forge chosen team is invalid.');
  if (input.teamPool !== undefined && !Array.isArray(input.teamPool)) fail('Composite Forge team pool must be an array.');
  const teamPool = input.teamPool === undefined ? [] : [...new Set(input.teamPool.map(value => text(value, 80)).filter(Boolean))];
  if (input.teamPool !== undefined && teamPool.length !== input.teamPool.length) fail('Composite Forge team pool contains invalid or duplicate teams.');
  if (mode === 'chosen' && !team) fail('Chosen Composite Forge placement requires a team.');
  if (mode === 'seeded-random' && !teamPool.length) fail('Seeded-random Composite Forge placement requires a non-empty team pool.');
  if (input.positions !== undefined && !Array.isArray(input.positions)) fail('Composite Forge target positions must be an array.');
  const positions = input.positions === undefined ? [] : [...new Set(input.positions.map(value => {
    const normalized = text(value, 20);
    return normalized ? normalized.toUpperCase() : null;
  }).filter(Boolean))];
  if (input.positions !== undefined && positions.length !== input.positions.length) fail('Composite Forge target positions are invalid.');
  return { mode, team, teamPool, positions };
}

function normalizePlacementSeed(value, placement) {
  const placementSeed = value === undefined || value === null || value === '' ? null : text(value, 80);
  if (value !== undefined && value !== null && value !== '' && (!placementSeed || !SEED.test(placementSeed))) {
    fail('Composite Forge placementSeed is invalid.');
  }
  if (placement.mode === 'seeded-random' && !placementSeed) {
    fail('Seeded-random Composite Forge placement requires a fixed placementSeed.');
  }
  if (placement.mode !== 'seeded-random' && placementSeed) {
    fail('Composite Forge placementSeed is only valid for seeded-random placement.');
  }
  return placementSeed;
}

function normalizeArchetype(value) {
  const raw = value === undefined || value === null || value === '' ? 'balanced'
    : object(value) ? String(value.key || '').trim() || 'balanced' : String(value).trim();
  const key = COMPOSITE_ARCHETYPE_KEYS.get(raw);
  if (!key) fail('Composite Forge archetype is unsupported.');
  const spec = COMPOSITE_ARCHETYPES[key];
  return { key: spec.key, label: spec.label, positions: [...spec.positions], note: spec.note };
}

function normalizeDonorInput(raw) {
  if (typeof raw === 'string') return { profileKey: raw, weight: 1 };
  if (!object(raw)) fail('Composite Forge donors must identify named player-season records.');
  const key = text(raw.profileKey || raw.key || raw.playerSeason || raw.ref, 320);
  const weight = raw.weight === undefined ? 1 : raw.weight;
  if (!key || !finite(weight) || weight <= 0 || weight > 1) fail('Composite Forge donor references need positive bounded weights.');
  return { profileKey: key, weight, ...(raw.sourcePackage === undefined ? {} : { sourcePackage: normalizeDonorSourcePackage(raw.sourcePackage) }) };
}

function normalizeDonorSourcePackage(source) {
  if (!object(source) || !text(source.packageId, 80) || !text(source.packageVersion, 80)
    || !SHA256.test(String(source.packageManifestSha256 || ''))
    || !SHA256.test(String(source.sourceLockSha256 || ''))
    || !/^player-seasons(?:-\d{4})?$/.test(String(source.playerSeasonsArtifactId || ''))
    || !SHA256.test(String(source.playerSeasonsArtifactSha256 || ''))) {
    fail('An exact-package-set donor is missing its package and player-season artifact pins.');
  }
  return {
    packageId: source.packageId,
    packageVersion: source.packageVersion,
    packageManifestSha256: source.packageManifestSha256,
    sourceLockSha256: source.sourceLockSha256,
    playerSeasonsArtifactId: source.playerSeasonsArtifactId,
    playerSeasonsArtifactSha256: source.playerSeasonsArtifactSha256,
  };
}

function sourcePackageForProfile(profile) {
  const provenance = profile?.nativeProvenance;
  return normalizeDonorSourcePackage({
    packageId: provenance?.packageId || profile?.packageId,
    packageVersion: provenance?.packageVersion || profile?.packageVersion,
    packageManifestSha256: provenance?.packageManifestSha256,
    sourceLockSha256: provenance?.sourceLockSha256,
    playerSeasonsArtifactId: provenance?.playerSeasonsArtifactId,
    playerSeasonsArtifactSha256: provenance?.playerSeasonsArtifactSha256,
  });
}

function validateDonorSourcePackage(source, packageRef) {
  const normalized = normalizeDonorSourcePackage(source);
  if (packageRef.scope.kind !== 'verified-exact-package-set') {
    fail('Donor package and artifact pins are supported only by a verified exact-package set.');
  }
  const sourcePackage = packageRef.sourcePackages.find(candidate => candidate.packageId === normalized.packageId
    && candidate.packageVersion === normalized.packageVersion
    && candidate.packageManifestSha256 === normalized.packageManifestSha256
    && candidate.sourceLockSha256 === normalized.sourceLockSha256);
  const artifact = sourcePackage?.playerSeasonsArtifacts.find(candidate => candidate.artifactId === normalized.playerSeasonsArtifactId
    && candidate.sha256 === normalized.playerSeasonsArtifactSha256);
  if (!sourcePackage || !artifact) fail('An exact-package-set donor pin does not match a verified exact package artifact.');
  return normalized;
}

function normalizeDonors(raw, profilesByKey, packageRef) {
  const donors = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (donors.length > COMPOSITE_FORGE_LIMITS.maxDonorsPerComponent) fail('Composite Forge has too many donors in one component.');
  const clean = donors.map(normalizeDonorInput);
  if (new Set(clean.map(donor => donor.profileKey)).size !== clean.length) fail('A Composite Forge component repeats a donor reference.');
  if (clean.some(donor => !profilesByKey.has(donor.profileKey))) fail('Composite Forge recipe references a profile outside the selected cohort.');
  const bound = clean.map(donor => {
    const profile = profilesByKey.get(donor.profileKey);
    if (packageRef.scope.kind === 'verified-exact-package-set') {
      const expected = validateDonorSourcePackage(sourcePackageForProfile(profile), packageRef);
      if (donor.sourcePackage && stableJson(donor.sourcePackage) !== stableJson(expected)) {
        fail('A saved exact-package-set donor pin does not match the selected observed player-season row.');
      }
      return { ...donor, sourcePackage: expected };
    }
    if (donor.sourcePackage) fail('Donor package and artifact pins require a verified exact-package set.');
    return donor;
  });
  const total = bound.reduce((sum, donor) => sum + donor.weight, 0);
  if (clean.length && Math.abs(total - 1) > 0.0002) fail('Donor weights within each Composite Forge component must sum to one.');
  if (!clean.length) return [];
  // Sliders commonly produce thirds or other repeating decimals. Quantize
  // only after checking the raw sum, then place the residual on the largest
  // normalized donor so the saved recipe always sums to exactly one.
  const units = bound.map(donor => Math.max(0, Math.round((donor.weight / total) * 10000)));
  if (units.some(unit => unit < 1)) {
    fail('Each Composite Forge donor must retain at least 0.0001 of its normalized component weight.');
  }
  const residual = 10000 - units.reduce((sum, value) => sum + value, 0);
  const target = bound.reduce((best, donor, index) => donor.weight / total > bound[best].weight / total ? index : best, 0);
  units[target] = Math.max(0, units[target] + residual);
  return bound.map((donor, index) => ({ ...donor, weight: units[index] / 10000 }))
    .sort((a, b) => a.profileKey.localeCompare(b.profileKey));
}

function normalizeComponentInputs(input, profilesByKey, packageRef) {
  const source = object(input) ? input : {};
  return Object.fromEntries(COMPOSITE_FORGE_COMPONENTS.map(spec => {
    const raw = source[spec.key];
    const config = Array.isArray(raw) || typeof raw === 'string' ? { donors: raw } : object(raw) ? raw : {};
    const metric = config.metric || spec.defaultMetric;
    if (metric !== 'auto' && !spec.metrics.includes(metric)) fail(`Metric ${metric} is not supported by the ${spec.key} component.`);
    return [spec.key, { metric, donors: normalizeDonors(config.donors || [], profilesByKey, packageRef) }];
  }));
}

export function createCompositeForgeRecipe(input = {}) {
  if (Object.prototype.hasOwnProperty.call(input, 'seed')) {
    fail('Composite Forge recipe seed semantics changed; use placementSeed and explicitly migrate saved v2 recipes.');
  }
  const packageRef = validatePackageRef(input.packageRef || input.package || {});
  const cohort = Array.isArray(input.cohort) ? { id: 'selected-cohort', profiles: input.cohort } : input.cohort;
  validateCompositeForgeCohort(cohort, packageRef);
  if (input.cohortRef !== undefined) {
    if (!object(input.cohortRef) || input.cohortRef.id !== cohort.id
      || stableJson(input.cohortRef.scope) !== stableJson(packageRef.scope)
      || input.cohortRef.fingerprint !== compositeCohortFingerprint(cohort)) {
      fail('Composite Forge recipe is bound to a different cohort or package scope.');
    }
  }
  const profilesByKey = new Map(cohort.profiles.map(profile => [profileKey(profile), profile]));
  const components = normalizeComponentInputs(input.components || input.donors, profilesByKey, packageRef);
  const placement = normalizePlacement(input.placement);
  const placementSeed = normalizePlacementSeed(input.placementSeed, placement);
  const phase = input.phase === undefined || input.phase === null ? null : text(input.phase, 40);
  if (phase && !PHASES.has(phase)) fail('Composite Forge phase is unsupported.');
  if (phase && !packageRef.scope.phases.includes(phase)) fail('Composite Forge phase is outside the bound package scope.');
  const recipe = {
    version: COMPOSITE_FORGE_RECIPE_VERSION,
    kind: 'synthetic-player',
    modelVersion: COMPOSITE_FORGE_MODEL_VERSION,
    packageRef,
    cohortRef: { id: cohort.id, scope: packageRef.scope, fingerprint: compositeCohortFingerprint(cohort) },
    phase,
    archetype: normalizeArchetype(input.archetype),
    componentWeights: normalizeWeights(input.componentWeights || input.weights),
    components,
    normalization: normalizeNormalization(input.normalization),
    placement,
    placementSeed,
  };
  return recipe;
}

function profileWorkload(profile) {
  return readCompositeMetric(profile, 'minutesPerGame');
}

function overlap(left = [], right = []) {
  return left.some(value => right.includes(value));
}

function workloadBands(profiles) {
  const values = profiles.map(profile => profileWorkload(profile).value).filter(finite).sort((a, b) => a - b);
  if (!values.length) return new Map();
  const q = percentile => values[Math.max(0, Math.min(values.length - 1, Math.ceil(values.length * percentile) - 1))];
  const first = q(1 / 3), second = q(2 / 3);
  return new Map(profiles.map(profile => {
    const value = profileWorkload(profile).value;
    return [profileKey(profile), value === null ? null : value <= first ? 'low' : value <= second ? 'middle' : 'high'];
  }));
}

function baselineRow(cohort, metric, donor, normalization, workloadBand) {
  if (normalization.era === 'none') return null;
  const rows = Array.isArray(cohort.eraBaselines) ? cohort.eraBaselines : [];
  const exact = rows.find(row => row.metric === metric && row.phase === donor.phase
    && (normalization.era !== 'season' || row.seasonStartYear === donor.seasonStartYear)
    && (normalization.workload !== 'band' || !row.workloadBand || row.workloadBand === workloadBand)
    && (normalization.role !== 'overlap' || !row.positions || overlap(row.positions, donor.positions || [])));
  if (!exact) return null;
  return { mean: exact.mean, standardDeviation: exact.standardDeviation ?? null, n: exact.n ?? null,
    source: 'accepted-era-baseline', fallback: false, filters: { era: normalization.era, role: normalization.role, workload: normalization.workload } };
}

function candidateProfiles(cohort, donor, metric, normalization, bands) {
  let candidates = cohort.profiles.filter(profile => profileKey(profile) !== profileKey(donor)
    && profile.phase === donor.phase && readCompositeMetric(profile, metric).status !== 'unavailable');
  const fallbacks = [];
  if (normalization.era === 'season') {
    const sameEra = candidates.filter(profile => profile.seasonStartYear === donor.seasonStartYear);
    if (sameEra.length >= normalization.minCohortRows) candidates = sameEra;
    else fallbacks.push('season-to-cohort');
  }
  if (normalization.role === 'overlap' && donor.positions?.length) {
    const sameRole = candidates.filter(profile => profile.positions?.length && overlap(profile.positions, donor.positions));
    if (sameRole.length >= normalization.minCohortRows) candidates = sameRole;
    else fallbacks.push('role-to-any');
  }
  if (normalization.workload === 'band') {
    const band = bands.get(profileKey(donor));
    const sameWorkload = candidates.filter(profile => band && bands.get(profileKey(profile)) === band);
    if (sameWorkload.length >= normalization.minCohortRows) candidates = sameWorkload;
    else fallbacks.push('workload-band-to-any');
  }
  return { candidates, fallbacks };
}

function weightedStats(rows, metric) {
  const usable = rows.map(profile => ({ profile, metric: readCompositeMetric(profile, metric) })).filter(row => row.metric.status !== 'unavailable');
  if (!usable.length) return null;
  const weights = usable.map(row => Math.max(1, row.metric.exposure || row.metric.knownGames || 1));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const mean = usable.reduce((sum, row, index) => sum + row.metric.value * weights[index], 0) / total;
  const variance = usable.reduce((sum, row, index) => sum + weights[index] * ((row.metric.value - mean) ** 2), 0) / total;
  return { mean, standardDeviation: Math.sqrt(Math.max(0, variance)), n: usable.length, source: 'cohort-derived-baseline-v1' };
}

function normalizeDonorMetric(cohort, donor, metric, normalization, bands) {
  const value = readCompositeMetric(donor, metric);
  if (value.status === 'unavailable') return { value, normalized: null, baseline: null, fallbacks: [], extrapolation: null };
  const explicit = baselineRow(cohort, metric, donor, normalization, bands.get(profileKey(donor)));
  const selected = explicit || weightedStats(candidateProfiles(cohort, donor, metric, normalization, bands).candidates, metric);
  const candidateInfo = explicit ? { candidates: [], fallbacks: [] } : candidateProfiles(cohort, donor, metric, normalization, bands);
  const baseline = selected ? { ...selected, standardDeviation: finite(selected.standardDeviation) ? selected.standardDeviation : null,
    source: selected.source, fallback: candidateInfo.fallbacks.length > 0, filters: { era: normalization.era, role: normalization.role, workload: normalization.workload } } : null;
  const direction = value.direction;
  const normalized = baseline && finite(baseline.mean)
    ? baseline.standardDeviation && baseline.standardDeviation > 0
      ? direction * (value.value - baseline.mean) / baseline.standardDeviation
      : value.value === baseline.mean ? 0 : null
    : null;
  const extrapolation = normalized === null ? null : { z: round(normalized), limit: normalization.maxZ, withinLimit: Math.abs(normalized) <= normalization.maxZ };
  return { value, normalized, baseline, fallbacks: candidateInfo.fallbacks, extrapolation };
}

function resolveMetric(component, profiles) {
  const spec = COMPONENT_BY_KEY.get(component.key);
  if (component.metric !== 'auto') return component.metric;
  return spec.metrics.find(metric => profiles.every(profile => readCompositeMetric(profile, metric).status !== 'unavailable')) || null;
}

function selectedProfiles(recipe, cohort) {
  const byKey = new Map(cohort.profiles.map(profile => [profileKey(profile), profile]));
  return Object.values(recipe.components).flatMap(component => component.donors.map(donor => byKey.get(donor.profileKey))).filter(Boolean);
}

function selectedDonorKeys(recipe) {
  return [...new Set(Object.values(recipe.components || {}).flatMap(component => (
    Array.isArray(component?.donors) ? component.donors.map(donor => donor.profileKey) : []
  )))].sort();
}

function roleRelevantProfiles(recipe, profiles) {
  const skillDonors = new Set(Object.entries(recipe?.components || {})
    .filter(([key]) => key !== 'workload')
    .flatMap(([, component]) => (component?.donors || []).map(donor => donor.profileKey).filter(Boolean)));
  return (Array.isArray(profiles) ? profiles : []).filter(profile => skillDonors.has(profileKey(profile)));
}

function outputDonorKeys(recipe, outputKey) {
  const output = COMPOSITE_FORGE_OUTPUTS[outputKey];
  const componentKeys = output
    ? [output.component, ...(SYNTHETIC_OUTPUT_INTERACTIONS[outputKey] || [])]
    : [];
  return [...new Set(componentKeys.flatMap(componentKey => (
    Array.isArray(recipe.components?.[componentKey]?.donors)
      ? recipe.components[componentKey].donors.map(donor => donor.profileKey)
      : []
  )))].sort();
}

function hasDistinctOutputDonors(recipe, outputKey) {
  return outputDonorKeys(recipe, outputKey).length > 1;
}

function roleFit(recipe, cohort, profiles) {
  const roleProfiles = roleRelevantProfiles(recipe, profiles);
  const distinct = [...new Set(roleProfiles.flatMap(profile => Array.isArray(profile.positions) ? profile.positions : []))];
  const common = roleProfiles.length ? [...new Set(roleProfiles[0].positions || [])].filter(position => roleProfiles.every(profile => (profile.positions || []).includes(position))) : [];
  const workload = profiles.map(profile => profileWorkload(profile).value).filter(finite);
  const target = recipe.placement.positions;
  const donorFamilies = distinct.map(positionFamily).filter(Boolean);
  const targetFamilies = target.map(positionFamily).filter(Boolean);
  const targetSupported = !target.length || targetFamilies.some(family => donorFamilies.includes(family));
  return { status: targetSupported && (target.length ? distinct.length > 0 : common.length > 0) ? 'supported' : 'unresolved',
    requestedPositions: target, donorPositionUnion: distinct, donorCommonPositions: common,
    workloadMinutesPerGame: workload.length ? { minimum: round(Math.min(...workload)), maximum: round(Math.max(...workload)), median: round([...workload].sort((a, b) => a - b)[Math.floor(workload.length / 2)]) } : null,
    cohortPositions: [...new Set(cohort.profiles.flatMap(profile => profile.positions || []))],
    note: targetSupported ? 'Positions show donor eligibility and role support; they are not a complete physical or defensive model.' : 'The requested role has no position support in this donor group.' };
}

function seededIndex(seed, length) {
  return Number(BigInt(`0x${hashText(seed)}`) % BigInt(length));
}

function resolvePlacement(recipe, cohort) {
  const placement = recipe.placement;
  if (placement.mode === 'unassigned') return { status: 'unassigned', mode: placement.mode, team: null, placementSeed: null, candidateTeams: [] };
  const candidates = placement.teamPool.length ? placement.teamPool : [...new Set(cohort.profiles.map(profile => profile.team).filter(Boolean))].sort();
  const placementSeed = recipe.placementSeed;
  const selectionHash = team => hashText(stableJson({ mode: placement.mode, team: team || null, candidateTeams: candidates,
    placementSeed: placement.mode === 'seeded-random' ? placementSeed : null }));
  if (!candidates.length) return { status: 'unavailable', mode: placement.mode, team: null, placementSeed, candidateTeams: [],
    selectionHash: selectionHash(null), reproducible: true };
  if (placement.mode === 'chosen' && !candidates.includes(placement.team)) {
    return { status: 'invalid', mode: placement.mode, team: placement.team, placementSeed, candidateTeams: candidates,
      selectionHash: selectionHash(placement.team), reproducible: true };
  }
  const team = placement.mode === 'chosen' ? placement.team : candidates[seededIndex(`${placementSeed}|placement`, candidates.length)];
  return { status: team ? 'assigned' : 'unavailable', mode: placement.mode, team: team || null, placementSeed,
    candidateTeams: candidates, selectionHash: selectionHash(team), reproducible: true };
}

function syntheticOutputForComponent(component, syntheticStatistics) {
  if (!syntheticStatistics?.values) return null;
  const entry = Object.entries(COMPOSITE_FORGE_OUTPUTS).find(([, output]) => output.component === component.key && output.metric === component.metric);
  const value = entry ? syntheticStatistics.values[entry[0]]?.value : null;
  return finite(value) ? value : null;
}

function teamFitChange(placement, components, cohort, syntheticStatistics = null) {
  if (placement.status !== 'assigned') return { status: 'unavailable', team: placement.team, componentChanges: [], note: 'No team placement was selected.' };
  const teamProfiles = Array.isArray(cohort.teamProfiles) ? cohort.teamProfiles : [];
  const profile = teamProfiles.find(row => row?.team === placement.team);
  if (!profile) return { status: 'unavailable', team: placement.team, componentChanges: [], note: 'This team has no fit baseline, so no team effect is shown.' };
  const baseline = profile.componentBaselines || profile.components || {};
  const changes = components.map(component => {
    const target = baseline[component.key] !== undefined ? baseline[component.key] : baseline[component.metric];
    const targetValue = finite(target) ? target : scalarSource(target?.value);
    const syntheticValue = syntheticOutputForComponent(component, syntheticStatistics);
    const compositeValue = syntheticValue ?? component.value;
    return { component: component.key, unit: component.unit, compositeValue, donorComponentValue: component.value,
      valueSource: modeledComponentValueSource(component, syntheticStatistics),
      teamBaseline: finite(targetValue) ? round(targetValue) : null,
      change: compositeValue !== null && finite(targetValue) ? round(compositeValue - targetValue) : null,
      status: compositeValue !== null && finite(targetValue) ? 'available' : 'unavailable' };
  });
  return { status: changes.some(change => change.status === 'available') ? 'available' : 'unavailable', team: placement.team,
    componentChanges: changes, roleNeeds: profile.roleNeeds || null,
    note: 'Team-fit changes use modeled synthetic outputs when a matching component is available; they are not wins, lineup impact, chemistry, or a team grade.' };
}

function exposureReliability(metric) {
  if (!metric || !finite(metric.exposure) || !finite(metric.minimumExposure) || metric.minimumExposure <= 0) {
    return { value: 0, method: 'sqrt-exposure-over-minimum-v1', status: 'unavailable' };
  }
  const value = clamp(Math.sqrt(Math.max(0, metric.exposure) / metric.minimumExposure), 0, 1);
  return { value, method: 'sqrt-exposure-over-minimum-v1', status: value >= 1 ? 'full' : value > 0 ? 'partial' : 'none' };
}

function profileStateProvenance(profile) {
  if (!profile || !object(profile)) return null;
  return {
    age: finite(profile.age) ? round(profile.age) : null,
    experience: integer(profile.experience, 0, 40) ? profile.experience : null,
    ageSource: text(profile.ageSource, 160),
    experienceSource: text(profile.experienceSource, 160),
    stateSource: text(profile.stateSource, 160),
    stateJoin: text(profile.stateJoin, 80),
    stateQuality: text(profile.stateQuality, 80),
    stateConflict: replaySerializable(profile.stateConflict || null),
  };
}

function hasDonorStateConflict(profile) {
  return profile?.stateJoin === 'conflict'
    || profile?.stateQuality === 'conflict'
    || Array.isArray(profile?.stateConflict) && profile.stateConflict.length > 0;
}

function donorStateEvidence(profiles) {
  const unique = [...new Map((Array.isArray(profiles) ? profiles : [])
    .filter(profile => profile && text(profileKey(profile), 320))
    .map(profile => [profileKey(profile), profile])).values()];
  const conflicts = unique.filter(hasDonorStateConflict).map(profile => ({
    profileKey: profileKey(profile),
    playerId: profile.playerId || null,
    seasonStartYear: profile.seasonStartYear,
    state: profileStateProvenance(profile),
  }));
  const missing = unique.filter(profile => !finite(profile.age) || !integer(profile.experience, 0, 40)).map(profile => ({
    profileKey: profileKey(profile),
    playerId: profile.playerId || null,
    seasonStartYear: profile.seasonStartYear,
    state: profileStateProvenance(profile),
  }));
  const status = conflicts.length ? 'conflict' : !unique.length ? 'unavailable' : missing.length ? 'partial' : 'complete';
  return {
    status,
    selectedDonors: unique.length,
    conflictCount: conflicts.length,
    missingCount: missing.length,
    conflicts,
    missing,
    note: status === 'conflict'
      ? 'At least one selected donor has conflicting age or experience evidence; the synthetic line remains reviewable, but simulation readiness is withheld.'
      : status === 'partial'
        ? 'Some selected donors do not carry age and experience state; this is disclosed but does not invent a state value.'
        : status === 'complete'
          ? 'All selected donors carry complete age and experience state without an explicit conflict.'
          : 'No donor state was available because no component donor was selected.',
  };
}

function componentResult(recipe, componentConfig, cohort, byKey, bands, issues, warnings) {
  const spec = COMPONENT_BY_KEY.get(componentConfig.key);
  const donors = componentConfig.donors;
  if (!donors.length) return { key: spec.key, label: spec.label, metric: componentConfig.metric, unit: null, value: null, rawValue: null, normalizedValue: null,
    status: 'unassigned', weight: recipe.componentWeights[spec.key], donorContributions: [], provenance: [], warnings: ['No donor season selected for this component.'] };
  const donorProfiles = donors.map(donor => byKey.get(donor.profileKey));
  if (donorProfiles.some(profile => !profile)) { issues.push(`${spec.key}: donor is outside the selected cohort.`); return { key: spec.key, label: spec.label, metric: componentConfig.metric, status: 'invalid', value: null, rawValue: null, normalizedValue: null, weight: recipe.componentWeights[spec.key], donorContributions: [], provenance: [] }; }
  const metric = resolveMetric({ ...componentConfig, key: spec.key }, donorProfiles);
  if (!metric) {
    const reason = 'no-common-auto-metric-with-available-evidence';
    const message = `${spec.key}: no auto-selected metric has available evidence for every selected donor; no metric fallback was applied.`;
    warnings.push(message);
    const donorContributions = donorProfiles.map((profile, index) => {
      const metricAvailability = spec.metrics.map(metricKey => {
        const evidence = readCompositeMetric(profile, metricKey);
        return {
          metric: metricKey,
          status: evidence.status,
          reason: evidence.reason,
          evidenceKind: evidence.evidenceKind,
          coverage: evidence.coverage,
          sourceMetric: evidence.sourceMetric,
        };
      });
      return {
        profileKey: profileKey(profile),
        player: profile.player || profile.playerName,
        playerId: profile.playerId,
        seasonStartYear: profile.seasonStartYear,
        phase: profile.phase,
        team: profile.team,
        scope: profile.scope,
        requestedWeight: donors[index].weight,
        effectiveWeight: 0,
        effectiveShare: 0,
        rawValue: null,
        status: 'unavailable',
        reason,
        metricAvailability,
        sourcePackage: profile.nativeProvenance && {
          packageId: profile.nativeProvenance.packageId || profile.packageId || null,
          packageVersion: profile.nativeProvenance.packageVersion || profile.packageVersion || null,
          packageManifestSha256: profile.nativeProvenance.packageManifestSha256 || null,
          sourceLockSha256: profile.nativeProvenance.sourceLockSha256 || null,
          playerSeasonsArtifactId: profile.nativeProvenance.playerSeasonsArtifactId || null,
          playerSeasonsArtifactSha256: profile.nativeProvenance.playerSeasonsArtifactSha256 || null,
        },
        profileState: profileStateProvenance(profile),
      };
    });
    return {
      key: spec.key,
      label: spec.label,
      metric: componentConfig.metric,
      unit: null,
      value: null,
      rawValue: null,
      normalizedValue: null,
      weight: recipe.componentWeights[spec.key],
      status: 'unavailable',
      supportedRange: { minimum: null, maximum: null, source: 'no-common-available-metric' },
      donorContributions,
      provenance: donorContributions.map(donor => ({ ...donor, package: recipe.packageRef, cohortId: recipe.cohortRef.id })),
      warnings: [message],
      reason,
    };
  }
  const entries = donorProfiles.map((profile, index) => {
    if (recipe.phase && profile.phase !== recipe.phase) issues.push(`${spec.key}: donor phase differs from the recipe phase.`);
    const normalized = normalizeDonorMetric(cohort, profile, metric, recipe.normalization, bands);
    if (normalized.value.status === 'unavailable') warnings.push(`${spec.key}: ${profileKey(profile)} has unavailable ${metric} evidence.`);
    if (normalized.value.status === 'limited_sample') warnings.push(`${spec.key}: ${profileKey(profile)} uses limited exposure.`);
    if (normalized.value.status !== 'unavailable' && normalized.normalized === null && recipe.normalization.era !== 'none') {
      warnings.push(`${spec.key}: ${profileKey(profile)} has no non-degenerate era baseline for normalized comparison.`);
    }
    if (normalized.normalized === null && normalized.baseline?.standardDeviation === 0) {
      warnings.push(`${spec.key}: ${profileKey(profile)} has zero baseline spread; normalized value is withheld.`);
    }
    if (normalized.extrapolation && !normalized.extrapolation.withinLimit) warnings.push(`${spec.key}: ${profileKey(profile)} exceeds the z-score extrapolation limit; the observed donor value is retained and the out-of-range comparison is disclosed as a non-blocking caveat.`);
    return { profile, requestedWeight: donors[index].weight, metric: normalized.value, normalized };
  });
  const usable = entries.filter(entry => entry.metric.status !== 'unavailable');
  const effectiveEntries = usable.map(entry => {
    const reliability = exposureReliability(entry.metric);
    return { ...entry, exposureReliability: reliability.value, reliabilityMethod: reliability.method,
      effectiveWeight: entry.requestedWeight * reliability.value };
  });
  const totalWeight = effectiveEntries.reduce((sum, entry) => sum + entry.effectiveWeight, 0);
  const rawValue = totalWeight > 0 ? effectiveEntries.reduce((sum, entry) => sum + entry.metric.value * entry.effectiveWeight, 0) / totalWeight : null;
  const normalizedValues = effectiveEntries.filter(entry => finite(entry.normalized.normalized));
  const normalizedWeight = normalizedValues.reduce((sum, entry) => sum + entry.effectiveWeight, 0);
  const normalizedValue = normalizedWeight > 0 ? normalizedValues.reduce((sum, entry) => sum + entry.normalized.normalized * entry.effectiveWeight, 0) / normalizedWeight : null;
  const donorContributions = entries.map(entry => {
    const effective = effectiveEntries.find(candidate => profileKey(candidate.profile) === profileKey(entry.profile));
    const share = totalWeight > 0 && effective ? effective.effectiveWeight / totalWeight : 0;
    const profile = entry.profile;
    return { profileKey: profileKey(profile), player: profile.player || profile.playerName, playerId: profile.playerId, seasonStartYear: profile.seasonStartYear,
      phase: profile.phase, team: profile.team, scope: profile.scope, requestedWeight: entry.requestedWeight,
      exposureReliability: effective ? round(effective.exposureReliability) : 0, effectiveWeight: effective ? round(effective.effectiveWeight) : 0,
      effectiveShare: round(share), rawValue: entry.metric.value, rawContribution: effective ? round(entry.metric.value * share) : null,
      exposure: entry.metric.exposure, exposureUnit: entry.metric.exposureUnit, minimumExposure: entry.metric.minimumExposure,
      reliabilityMethod: effective?.reliabilityMethod || 'sqrt-exposure-over-minimum-v1',
      normalizedValue: entry.normalized.normalized === null ? null : round(entry.normalized.normalized),
      zScoreExtrapolation: entry.normalized.extrapolation,
      denominator: entry.metric.denominator, numerator: entry.metric.numerator, knownGames: entry.metric.knownGames, status: entry.metric.status,
      method: entry.metric.method, sourceMetric: entry.metric.sourceMetric, evidenceKind: entry.metric.evidenceKind,
      coverage: entry.metric.coverage, sourceReason: entry.metric.sourceReason, baseline: entry.normalized.baseline,
      fallbackDimensions: entry.normalized.fallbacks, aggregation: profile.aggregation || null,
      sourcePackage: profile.nativeProvenance && {
        packageId: profile.nativeProvenance.packageId || profile.packageId || null,
        packageVersion: profile.nativeProvenance.packageVersion || profile.packageVersion || null,
        packageManifestSha256: profile.nativeProvenance.packageManifestSha256 || null,
        sourceLockSha256: profile.nativeProvenance.sourceLockSha256 || null,
        playerSeasonsArtifactId: profile.nativeProvenance.playerSeasonsArtifactId || null,
        playerSeasonsArtifactSha256: profile.nativeProvenance.playerSeasonsArtifactSha256 || null,
      },
      profileState: profileStateProvenance(profile) };
  });
  const values = usable.map(entry => entry.metric.value), min = values.length ? Math.min(...values) : null, max = values.length ? Math.max(...values) : null;
  const hasDataCaveats = entries.some(entry => entry.metric.status === 'limited_sample' || entry.normalized.baseline?.fallback);
  const hasZScoreExtrapolation = entries.some(entry => entry.normalized.extrapolation && !entry.normalized.extrapolation.withinLimit);
  const status = !usable.length ? 'unavailable' : hasDataCaveats || hasZScoreExtrapolation ? 'complete_with_caveats' : 'observed';
  return { key: spec.key, label: spec.label, metric, unit: METRIC_DEFINITIONS[metric].unit, value: rawValue === null ? null : round(rawValue), rawValue: rawValue === null ? null : round(rawValue),
    normalizedValue: normalizedValue === null ? null : round(normalizedValue), weight: recipe.componentWeights[spec.key], status,
    extrapolationOnly: hasZScoreExtrapolation && !hasDataCaveats,
    supportedRange: { minimum: round(min), maximum: round(max), source: 'selected-donor-values' },
    donorContributions, provenance: donorContributions.map(donor => ({ ...donor, package: recipe.packageRef, cohortId: recipe.cohortRef.id })),
     note: 'This component blends observed donor-season values with their available samples. It is not an overall player grade.' };
}

function normalizeOutputDonorMetric(recipe, outputSpec, profile, metric, cohort, bands) {
  if (!cohort || recipe.normalization.era !== 'season') {
    return { metric, rawValue: metric.value, normalization: { status: 'not-requested', dimension: recipe.normalization.era } };
  }
  const normalized = normalizeDonorMetric(cohort, profile, outputSpec.metric, recipe.normalization, bands || new Map());
  const targetRows = cohort.profiles.filter(candidate => candidate.phase === profile.phase);
  const target = weightedStats(targetRows, outputSpec.metric);
  if (!finite(normalized.normalized) || !target || !(target.standardDeviation > 0)) {
    return { metric, rawValue: metric.value,
      normalization: { status: 'unavailable', dimension: 'season', reason: 'no-stable-season-transfer',
        fallbacks: normalized.fallbacks || [], baseline: normalized.baseline || null } };
  }
  // normalizeDonorMetric stores direction-adjusted z values. Undo that
  // direction when transferring the donor percentile to the pooled target
  // distribution so low-is-good metrics (for example turnovers) remain in
  // their original units.
  const direction = finite(metric.direction) ? metric.direction : 1;
  const adjustedValue = clamp(target.mean + direction * normalized.normalized * target.standardDeviation, outputSpec.range[0], outputSpec.range[1]);
  return {
    metric: { ...metric, value: round(adjustedValue), method: `${metric.method}+season-percentile-transfer-v1` },
    rawValue: metric.value,
    normalization: { status: 'applied', dimension: 'season', source: 'cohort-percentile-transfer-v1',
      donorValue: round(metric.value), adjustedValue: round(adjustedValue), donorZ: round(normalized.normalized),
      targetMean: round(target.mean), targetStandardDeviation: round(target.standardDeviation),
      fallbacks: normalized.fallbacks || [], baseline: normalized.baseline || null },
  };
}

function outputDonors(recipe, outputSpec, byKey, cohort = null, bands = null) {
  const config = recipe.components[outputSpec.component];
  if (!config?.donors?.length) return [];
  return config.donors.map(donor => {
    const profile = byKey.get(donor.profileKey);
    if (!profile) return null;
    const rawMetric = readCompositeMetric(profile, outputSpec.metric);
    const normalizedOutput = normalizeOutputDonorMetric(recipe, outputSpec, profile, rawMetric, cohort, bands);
    const metric = normalizedOutput.metric;
    if (metric.status === 'unavailable') return null;
    const reliability = exposureReliability(metric);
    return { profile, metric, rawMetric, rawValue: normalizedOutput.rawValue, normalization: normalizedOutput.normalization,
      requestedWeight: donor.weight, reliability: reliability.value, reliabilityMethod: reliability.method,
      effectiveWeight: donor.weight * reliability.value };
  }).filter(Boolean);
}

function independentDonorSupport(donors) {
  const weightByPlayer = new Map();
  donors.forEach((donor, index) => {
    const profile = donor.profile || donor;
    const playerId = text(profile.playerId, 160);
    const identity = playerId || `unresolved-player:${profileKey(profile) || index}`;
    const weight = finite(donor.effectiveWeight) && donor.effectiveWeight > 0
      ? donor.effectiveWeight
      : finite(donor.effectiveShare) && donor.effectiveShare > 0 ? donor.effectiveShare : 0;
    if (weight > 0) weightByPlayer.set(identity, (weightByPlayer.get(identity) || 0) + weight);
  });
  const playerWeights = [...weightByPlayer.values()];
  const total = playerWeights.reduce((sum, weight) => sum + weight, 0);
  const squared = playerWeights.reduce((sum, weight) => sum + (weight ** 2), 0);
  return {
    independentDonorCount: playerWeights.length,
    effectiveIndependentSamples: total > 0 && squared > 0 ? round((total ** 2) / squared) : 0,
    method: 'denominator-weighted-player-identity-kish-ess-v1',
  };
}

function blendOutputMetric(recipe, outputKey, byKey, cohort = null, bands = null) {
  const outputSpec = COMPOSITE_FORGE_OUTPUTS[outputKey];
  if (!outputSpec) return null;
  const donors = outputDonors(recipe, outputSpec, byKey, cohort, bands);
  const totalWeight = donors.reduce((sum, donor) => sum + donor.effectiveWeight, 0);
  if (!(totalWeight > 0)) return null;
  const value = donors.reduce((sum, donor) => sum + donor.metric.value * donor.effectiveWeight, 0) / totalWeight;
  const shares = donors.map(donor => ({
    profileKey: profileKey(donor.profile), player: donor.profile.player || donor.profile.playerName,
    seasonStartYear: donor.profile.seasonStartYear, phase: donor.profile.phase, team: donor.profile.team, scope: donor.profile.scope,
    requestedWeight: donor.requestedWeight, exposureReliability: round(donor.reliability),
    exposure: donor.metric.exposure, exposureUnit: donor.metric.exposureUnit, minimumExposure: donor.metric.minimumExposure,
    reliabilityMethod: donor.reliabilityMethod,
    effectiveShare: round(donor.effectiveWeight / totalWeight), value: round(donor.metric.value),
    rawValue: round(donor.rawValue), normalization: donor.normalization,
    numerator: donor.metric.numerator, denominator: donor.metric.denominator, knownGames: donor.metric.knownGames,
    status: donor.metric.status, method: donor.metric.method, sourceMetric: donor.metric.sourceMetric,
    evidenceKind: donor.metric.evidenceKind, coverage: donor.metric.coverage, sourceReason: donor.metric.sourceReason,
    aggregation: donor.profile.aggregation || null, profileState: profileStateProvenance(donor.profile),
  }));
  const rawValues = donors.map(donor => donor.metric.value).filter(finite);
  const minimum = rawValues.length ? Math.min(...rawValues) : null;
  const maximum = rawValues.length ? Math.max(...rawValues) : null;
  const status = donors.some(donor => donor.metric.status === 'limited_sample') ? 'modeled_limited_sample' : 'modeled';
  const boundedValue = round(clamp(value, outputSpec.range[0], outputSpec.range[1]));
  const independentSupport = independentDonorSupport(donors);
  return { key: outputKey, value: boundedValue, donorBlendValue: boundedValue, unit: outputSpec.unit,
    status, component: outputSpec.component, sourceMetric: outputSpec.metric, donorContributions: shares,
    uncertainty: { minimum: round(minimum), maximum: round(maximum), donorMinimum: round(minimum), donorMaximum: round(maximum),
      sample: donors.length,
      sampleUnit: 'player-season-donor-rows',
      independentDonorCount: independentSupport.independentDonorCount,
      effectiveIndependentSamples: independentSupport.effectiveIndependentSamples,
      independentSupportMethod: independentSupport.method,
      effectiveExposure: round(donors.reduce((sum, donor) => sum + (donor.metric.exposure || 0) * donor.effectiveWeight, 0) / totalWeight),
      reliability: round(donors.reduce((sum, donor) => sum + donor.reliability * donor.effectiveWeight, 0) / totalWeight),
      method: 'observed-donor-range-v2',
      interpretation: 'The range brackets selected donor values; it is not a calibrated prediction interval.' },
    method: donors.some(donor => donor.normalization?.status === 'applied')
      ? 'exposure-weighted-component-donor-blend-v1+season-percentile-transfer-v1'
      : 'exposure-weighted-component-donor-blend-v1' };
}

function relationshipCohort(cohort, recipe, outputSpec, byKey, bands) {
  const donors = outputDonors(recipe, outputSpec, byKey);
  const fallbackDimensions = new Set();
  const profiles = new Map();
  donors.forEach(donor => {
    const candidates = candidateProfiles(cohort, donor.profile, outputSpec.metric, recipe.normalization, bands);
    candidates.fallbacks.forEach(fallback => fallbackDimensions.add(fallback));
    candidates.candidates.forEach(profile => profiles.set(profileKey(profile), profile));
  });
  return {
    profiles: [...profiles.values()],
    method: 'union-of-output-donor-compatible-cohorts-v1',
    candidateCount: profiles.size,
    filters: { era: recipe.normalization.era, role: recipe.normalization.role, workload: recipe.normalization.workload },
    fallbackDimensions: [...fallbackDimensions].sort(),
  };
}

function cohortMetricRows(profiles, metrics) {
  return (Array.isArray(profiles) ? profiles : []).map(profile => {
    const entries = metrics.map(metric => readCompositeMetric(profile, metric));
    if (entries.some(entry => entry.status === 'unavailable' || !finite(entry.value))) return null;
    const reliabilities = entries.map(entry => exposureReliability(entry).value);
    const weight = Math.min(...reliabilities);
    return weight > 0 ? { profile, entries, weight } : null;
  }).filter(Boolean);
}

function weightedPairStats(profiles, leftMetric, rightMetric) {
  const rows = cohortMetricRows(profiles, [leftMetric, rightMetric]).map(row => ({
    left: row.entries[0], right: row.entries[1], weight: row.weight,
    seasonStartYear: row.profile.seasonStartYear,
  }));
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (rows.length < COMPOSITE_FORGE_LIMITS.minCohortRows || !(totalWeight > 0)) {
    return { rows, sample: rows.length, effectiveWeight: totalWeight, weighting: 'minimum-pair-exposure-reliability-v1' };
  }
  const leftMean = rows.reduce((sum, row) => sum + row.weight * row.left.value, 0) / totalWeight;
  const rightMean = rows.reduce((sum, row) => sum + row.weight * row.right.value, 0) / totalWeight;
  const leftVariance = rows.reduce((sum, row) => sum + row.weight * ((row.left.value - leftMean) ** 2), 0) / totalWeight;
  const rightVariance = rows.reduce((sum, row) => sum + row.weight * ((row.right.value - rightMean) ** 2), 0) / totalWeight;
  const covariance = rows.reduce((sum, row) => sum + row.weight * ((row.left.value - leftMean) * (row.right.value - rightMean)), 0) / totalWeight;
  const correlation = leftVariance > 0 && rightVariance > 0 ? covariance / Math.sqrt(leftVariance * rightVariance) : null;
  return { rows, sample: rows.length, effectiveWeight: totalWeight, leftMean, rightMean,
    leftVariance, rightVariance, leftStandardDeviation: Math.sqrt(Math.max(0, leftVariance)),
    rightStandardDeviation: Math.sqrt(Math.max(0, rightVariance)), correlation,
    weighting: 'minimum-pair-exposure-reliability-v1' };
}

function seasonDemeanedPairCorrelation(rows) {
  const seasons = new Map();
  for (const row of rows) {
    if (!integer(row.seasonStartYear, 1947, 2200)) continue;
    const seasonRows = seasons.get(row.seasonStartYear) || [];
    seasonRows.push(row);
    seasons.set(row.seasonStartYear, seasonRows);
  }
  const seasonStartYears = [...seasons.keys()].sort((left, right) => left - right);
  // A pooled multi-season cohort can create a spurious skill relationship
  // when both metrics move with league environment. Only estimate an observed
  // relationship after removing those shared shifts with adequate support in
  // every represented season. An under-supported multi-season cohort must
  // withhold the observed relationship rather than fall back to the confounded
  // pooled correlation; the caller may use only the separately disclosed,
  // bounded prior where policy permits it.
  if (seasonStartYears.length < 2) {
    return { status: 'not-applicable', seasonCount: seasonStartYears.length, seasonStartYears,
      reason: 'Season demeaning requires a compatible cohort spanning at least two seasons.' };
  }
  if (seasonStartYears.some(year => seasons.get(year).length < COMPOSITE_FORGE_LIMITS.minSeasonRelationshipRows)) {
    return { status: 'insufficient-support', seasonCount: seasonStartYears.length, seasonStartYears,
      reason: `Each season needs at least ${COMPOSITE_FORGE_LIMITS.minSeasonRelationshipRows} valid paired rows before shared season shifts can be removed.` };
  }
  const residualRows = [];
  const seasonBaselines = [];
  for (const year of seasonStartYears) {
    const seasonRows = seasons.get(year);
    const seasonWeight = seasonRows.reduce((sum, row) => sum + row.weight, 0);
    if (!(seasonWeight > 0)) return { status: 'unavailable', seasonCount: seasonStartYears.length, seasonStartYears,
      reason: 'Season-specific paired exposure weights are unavailable.' };
    const leftMean = seasonRows.reduce((sum, row) => sum + row.weight * row.left.value, 0) / seasonWeight;
    const rightMean = seasonRows.reduce((sum, row) => sum + row.weight * row.right.value, 0) / seasonWeight;
    const leftVariance = seasonRows.reduce((sum, row) => sum + row.weight * ((row.left.value - leftMean) ** 2), 0) / seasonWeight;
    const rightVariance = seasonRows.reduce((sum, row) => sum + row.weight * ((row.right.value - rightMean) ** 2), 0) / seasonWeight;
    seasonBaselines.push({ seasonStartYear: year, leftMean, rightMean,
      leftStandardDeviation: Math.sqrt(Math.max(0, leftVariance)),
      rightStandardDeviation: Math.sqrt(Math.max(0, rightVariance)),
      sample: seasonRows.length, effectiveWeight: seasonWeight });
    seasonRows.forEach(row => residualRows.push({
      left: row.left.value - leftMean,
      right: row.right.value - rightMean,
      weight: row.weight,
    }));
  }
  const totalWeight = residualRows.reduce((sum, row) => sum + row.weight, 0);
  if (!(totalWeight > 0)) return { status: 'unavailable', seasonCount: seasonStartYears.length, seasonStartYears,
    reason: 'Season-demeaned paired exposure weights are unavailable.' };
  const leftVariance = residualRows.reduce((sum, row) => sum + row.weight * row.left ** 2, 0) / totalWeight;
  const rightVariance = residualRows.reduce((sum, row) => sum + row.weight * row.right ** 2, 0) / totalWeight;
  if (!(leftVariance > 0) || !(rightVariance > 0)) return { status: 'degenerate', seasonCount: seasonStartYears.length, seasonStartYears,
    reason: 'Season-demeaned paired metrics have no within-season variation.' };
  const covariance = residualRows.reduce((sum, row) => sum + row.weight * row.left * row.right, 0) / totalWeight;
  return {
    status: 'applied',
    correlation: clamp(covariance / Math.sqrt(leftVariance * rightVariance), -1, 1),
    sample: residualRows.length,
    effectiveWeight: totalWeight,
    leftStandardDeviation: Math.sqrt(Math.max(0, leftVariance)),
    rightStandardDeviation: Math.sqrt(Math.max(0, rightVariance)),
    seasonCount: seasonStartYears.length,
    seasonStartYears,
    seasonBaselines,
    weighting: 'within-season-minimum-pair-exposure-reliability-v1',
    method: 'season-demeaned-pair-correlation-v1',
  };
}

function seasonAdjustedFeatureZ(component, relationship) {
  const donors = Array.isArray(component?.donorContributions) ? component.donorContributions : [];
  if (!donors.length || !Array.isArray(relationship?.seasonBaselines) || !relationship.seasonBaselines.length) return null;
  const baselines = new Map(relationship.seasonBaselines.map(baseline => [baseline.seasonStartYear, baseline]));
  let totalShare = 0;
  let value = 0;
  for (const donor of donors) {
    const baseline = baselines.get(donor.seasonStartYear);
    if (!baseline || !finite(donor.rawValue) || !finite(donor.effectiveShare)
      || !(baseline.rightStandardDeviation > 0)) return null;
    value += donor.effectiveShare * ((donor.rawValue - baseline.rightMean) / baseline.rightStandardDeviation);
    totalShare += donor.effectiveShare;
  }
  return totalShare > 0 ? value / totalShare : null;
}

function cohortMetricDistribution(profiles, metric) {
  const rows = cohortMetricRows(profiles, [metric]);
  if (rows.length < COMPOSITE_FORGE_LIMITS.minCohortRows) return null;
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!(totalWeight > 0)) return null;
  const values = rows.map(row => row.entries[0].value);
  const mean = rows.reduce((sum, row) => sum + row.weight * row.entries[0].value, 0) / totalWeight;
  const variance = rows.reduce((sum, row) => sum + row.weight * ((row.entries[0].value - mean) ** 2), 0) / totalWeight;
  const standardDeviation = Math.sqrt(Math.max(0, variance));
  if (!(standardDeviation > 0)) return null;
  return { metric, sample: values.length, effectiveWeight: totalWeight, mean, standardDeviation,
    minimum: Math.min(...values), maximum: Math.max(...values), weighting: 'exposure-reliability-v1' };
}

function cohortMetricRelationship(profiles, leftMetric, rightMetric) {
  const stats = weightedPairStats(profiles, leftMetric, rightMetric);
  if (!stats || stats.sample < COMPOSITE_FORGE_LIMITS.minCohortRows
    || !(stats.leftVariance > 0) || !(stats.rightVariance > 0)) return null;
  const seasonControl = seasonDemeanedPairCorrelation(stats.rows);
  const seasonAdjusted = seasonControl.status === 'applied' ? seasonControl : null;
  const withholdPooledRelationship = seasonControl.seasonCount >= 2 && !seasonAdjusted;
  const correlation = withholdPooledRelationship ? null : seasonAdjusted?.correlation ?? stats.correlation;
  return { sample: stats.sample, effectiveWeight: stats.effectiveWeight,
    correlation,
    rightMean: stats.rightMean, rightStandardDeviation: stats.rightStandardDeviation,
    leftStandardDeviation: seasonAdjusted?.leftStandardDeviation ?? stats.leftStandardDeviation,
    seasonBaselines: seasonAdjusted?.seasonBaselines || null,
    weighting: seasonAdjusted?.weighting || stats.weighting,
    method: withholdPooledRelationship ? 'withheld-multiseason-pair-correlation-v1'
      : seasonAdjusted?.method || 'pooled-pair-correlation-v1',
    relationshipStatus: withholdPooledRelationship ? 'withheld' : 'estimated',
    relationshipReason: withholdPooledRelationship ? seasonControl.reason || 'Multi-season paired support is insufficient for an observed relationship.' : null,
    seasonControlStatus: seasonControl.status,
    seasonControlReason: seasonControl.reason || null,
    seasonCount: seasonControl.seasonCount,
    seasonStartYears: seasonControl.seasonStartYears,
  };
}

function synthesizeOutputFromRelationships(recipe, cohort, byKey, bands, components, outputKey, value) {
  const output = COMPOSITE_FORGE_OUTPUTS[outputKey];
  if (!value || !finite(value.value) || !SYNTHETIC_OUTPUT_INTERACTIONS[outputKey]) return value;
  // A donor in an unrelated component must not unlock a directional prior for
  // this output.  For example, choosing a different workload season should
  // not make an otherwise single-player scoring/creation line look novel.
  const distinctOutputDonors = hasDistinctOutputDonors(recipe, outputKey);
  const selected = relationshipCohort(cohort, recipe, output, byKey, bands);
  const target = cohortMetricDistribution(selected.profiles, output.metric);
  if (!target) return directDonorBlendFallback(value, selected,
    'No non-degenerate compatible-cohort distribution supports cross-skill synthesis.');
  const primaryZ = (value.value - target.mean) / target.standardDeviation;
  const contributors = [];
  const skippedContributors = [];
  for (const componentKey of SYNTHETIC_OUTPUT_INTERACTIONS[outputKey]) {
    const component = components.find(candidate => candidate.key === componentKey);
    if (!component || !finite(component.value) || !(component.weight > 0)) continue;
    const relationship = cohortMetricRelationship(selected.profiles, output.metric, component.metric);
    const featureDistribution = cohortMetricDistribution(selected.profiles, component.metric);
    if (!featureDistribution || !(featureDistribution.standardDeviation > 0)) continue;
    let correlation = relationship?.correlation ?? null;
    let relationKind = 'observed-correlation';
    let directionSource = 'selected-cohort';
    // If the selected cohort cannot estimate a stable relationship, use a
    // deliberately shrunken directional prior only when this is genuinely a
    // multi-donor recipe.  A one-donor recipe is allowed to reproduce the
    // observed row; a multi-donor recipe must expose a bounded cross-skill
    // interaction instead of silently copying one donor's line.
    if (!finite(correlation) || Math.abs(correlation) < 0.1) {
      if (!distinctOutputDonors) {
        skippedContributors.push({ component: component.key, metric: component.metric,
          relationshipMethod: relationship?.method || null,
          relationshipStatus: relationship?.relationshipStatus || 'unavailable',
          seasonControlStatus: relationship?.seasonControlStatus || 'not-applicable',
          reason: relationship?.relationshipReason || 'No supported observed relationship or eligible bounded prior is available for this donor recipe.' });
        continue;
      }
      const priorDirection = SYNTHETIC_DIRECTIONAL_PRIORS[outputKey]?.[componentKey];
      if (!priorDirection) continue;
      correlation = priorDirection * 0.35;
      relationKind = 'directional-prior';
      directionSource = 'bounded-model-prior';
    }
    const featureMean = relationship?.rightMean ?? featureDistribution.mean;
    const featureStandardDeviation = relationship?.rightStandardDeviation ?? featureDistribution.standardDeviation;
    if (!(featureStandardDeviation > 0)) continue;
    const seasonAdjusted = relationship?.seasonControlStatus === 'applied';
    const outputScaleAdjustment = seasonAdjusted && target.standardDeviation > 0
      ? relationship.leftStandardDeviation / target.standardDeviation : 1;
    const rawFeatureZ = seasonAdjusted ? seasonAdjustedFeatureZ(component, relationship)
      : (component.value - featureMean) / featureStandardDeviation;
    if (!finite(rawFeatureZ)) {
      skippedContributors.push({ component: component.key, metric: component.metric,
        relationshipMethod: relationship?.method || null,
        seasonControlStatus: relationship?.seasonControlStatus || 'not-applicable',
        reason: seasonAdjusted
          ? 'Selected component donor season is not represented in the compatible paired-cohort season baselines.'
          : 'The selected component does not have a finite compatible-cohort feature value.' });
      continue;
    }
    const featureZ = clamp(rawFeatureZ,
      -recipe.normalization.maxZ, recipe.normalization.maxZ);
    const supportSample = relationship?.sample ?? featureDistribution.sample;
    const effectiveSampleWeight = relationship?.effectiveWeight ?? featureDistribution.effectiveWeight;
    const exposureReliability = clamp(effectiveSampleWeight / Math.max(1, supportSample), 0, 1);
    const sampleSupport = clamp(effectiveSampleWeight
      / (effectiveSampleWeight + COMPOSITE_FORGE_LIMITS.minCohortRows), 0, 1);
    const supportWeight = exposureReliability * sampleSupport;
    const evidenceWeight = Math.abs(correlation) * component.weight * supportWeight;
    contributors.push({ component: component.key, metric: component.metric, value: round(component.value),
      sample: supportSample, correlation: round(correlation), rawFeatureZ: round(rawFeatureZ), featureZ: round(featureZ),
      featureZClamped: Math.abs(rawFeatureZ) > recipe.normalization.maxZ, featureZLimit: recipe.normalization.maxZ, supportWeight: round(supportWeight),
      effectiveSampleWeight: round(effectiveSampleWeight), exposureReliability: round(exposureReliability), sampleSupport: round(sampleSupport),
      weighting: relationship?.weighting || featureDistribution.weighting,
      relationshipMethod: relationship?.method || (relationKind === 'directional-prior' ? 'bounded-directional-prior-v1' : null),
      relationshipStatus: relationKind === 'directional-prior' ? 'bounded-prior' : relationship?.relationshipStatus || 'estimated',
      relationshipReason: relationKind === 'directional-prior' && relationship?.relationshipStatus === 'withheld'
        ? relationship.relationshipReason : null,
      seasonControlStatus: relationship?.seasonControlStatus || 'not-applicable',
      seasonControlReason: relationship?.seasonControlReason || null,
      outputScaleAdjustment: round(outputScaleAdjustment),
      relationshipSeasonCount: relationship?.seasonCount ?? null,
      relationshipSeasonStartYears: relationship?.seasonStartYears || [],
      relationKind, directionSource, evidenceWeight,
      contribution: correlation * featureZ * component.weight * supportWeight * outputScaleAdjustment,
      donorContributions: Array.isArray(component.donorContributions)
        ? component.donorContributions.map(donor => ({ ...donor })) : [] });
  }
  const totalWeight = contributors.reduce((sum, contributor) => sum + contributor.evidenceWeight, 0);
  if (!(totalWeight > 0)) return directDonorBlendFallback(value, selected,
    skippedContributors.map(contributor => contributor.reason).find(Boolean)
      || 'No stable supported relationship or eligible bounded prior can adjust this output.', skippedContributors, primaryZ);
  const interactionZ = contributors.reduce((sum, contributor) => sum + contributor.contribution, 0) / totalWeight;
  const priorOnly = contributors.every(contributor => contributor.relationKind === 'directional-prior');
  const interactionShare = priorOnly ? SYNTHETIC_DIRECTIONAL_PRIOR_SHARE : SYNTHETIC_INTERACTION_SHARE;
  const synthesizedZ = clamp((1 - interactionShare) * primaryZ + interactionShare * interactionZ,
    -recipe.normalization.maxZ, recipe.normalization.maxZ);
  const synthesizedValue = clamp(target.mean + target.standardDeviation * synthesizedZ, output.range[0], output.range[1]);
  // Preserve small but real interactions after the final four-decimal
  // serialization step.  The old 0.005 threshold could erase a meaningful
  // cross-skill distinction and make two recipes look like a copied donor.
  // A recipe that reuses one donor for every component has no cross-donor
  // signal to synthesize; preserve that observed donor value exactly. For a
  // genuinely multi-donor recipe, retain small but real interactions while
  // avoiding floating-point noise at the published precision.
  const stableValue = !distinctOutputDonors
    || Math.abs(synthesizedValue - value.value) < SYNTHETIC_DISTINCTNESS_TOLERANCE
    ? value.value : synthesizedValue;
  return {
    ...value,
    donorBlendValue: value.value,
    value: round(stableValue),
    method: `${value.method}+cohort-relationship-synthesis-v3`,
    relationshipSynthesis: {
      status: 'applied', targetMetric: output.metric, targetSample: target.sample, targetEffectiveWeight: round(target.effectiveWeight),
      primaryZ: round(primaryZ), interactionZ: round(interactionZ),
      synthesizedZ: round(synthesizedZ), interactionShare, priorOnly,
      interactionDelta: round(stableValue - value.value),
      contributors: contributors.map(({ evidenceWeight, contribution, ...contributor }) => ({ ...contributor, evidenceWeight: round(evidenceWeight), contribution: round(contribution) })),
      skippedContributors,
      cohortSelection: selected,
      note: priorOnly
        ? 'The primary donor blend remains dominant. A bounded directional prior regularizes this multi-donor output because the selected cohort could not estimate a stable relationship; this is not a calibrated forecast.'
        : 'The primary donor blend remains dominant. Compatible cohort-observed cross-skill relationships make a synthetic line internally consistent; this is not a calibrated forecast.',
    },
  };
}

function directDonorBlendFallback(value, cohortSelection, reason, skippedContributors = [], primaryZ = null) {
  return { ...value, relationshipSynthesis: {
    status: 'direct-donor-blend',
    method: 'exposure-weighted-component-donor-blend-v1',
    reason,
    primaryZ: finite(primaryZ) ? round(primaryZ) : null,
    contributors: [],
    skippedContributors,
    cohortSelection,
    note: 'The exposure-weighted donor blend is retained because the selected cohort cannot support a cross-skill relationship adjustment. This is a modeled donor blend, not a calibrated forecast.',
  } };
}

function deriveSyntheticEffectiveFieldGoal(values) {
  const inputs = [
    ['fieldGoalPercentage', values.fieldGoalPercentage],
    ['threePointPercentage', values.threePointPercentage],
    ['threePointAttemptShare', values.threePointAttemptShare],
  ];
  if (inputs.some(([, item]) => !item || !finite(item.value))) return values;

  // eFG = FG% + 0.5 * 3P% * (3PA / FGA). Derive the synthetic value from
  // the final modeled shooting outputs so separately selected donors and
  // season normalization cannot leave an internally contradictory line.
  const value = round(inputs[0][1].value + 0.5 * inputs[1][1].value * inputs[2][1].value);
  const inputValue = (item, edge) => finite(item.uncertainty?.[edge]) ? item.uncertainty[edge] : item.value;
  const minimum = round(inputValue(inputs[0][1], 'minimum')
    + 0.5 * inputValue(inputs[1][1], 'minimum') * inputValue(inputs[2][1], 'minimum'));
  const maximum = round(inputValue(inputs[0][1], 'maximum')
    + 0.5 * inputValue(inputs[1][1], 'maximum') * inputValue(inputs[2][1], 'maximum'));
  const baseline = values.effectiveFieldGoalPercentage || null;
  const contributors = inputs.map(([key, item]) => ({
    output: key,
    value: item.value,
    donorContributions: Array.isArray(item.donorContributions) ? item.donorContributions.map(donor => ({ ...donor })) : [],
  }));
  const effectiveExposure = inputs.map(([, item]) => item.uncertainty?.effectiveExposure).filter(finite);
  const reliability = inputs.map(([, item]) => item.uncertainty?.reliability).filter(finite);
  const sample = inputs.map(([, item]) => item.uncertainty?.sample).filter(value => integer(value, 1));
  const independentDonorCounts = inputs.map(([, item]) => item.uncertainty?.independentDonorCount).filter(value => integer(value, 1));
  const effectiveIndependentSamples = inputs.map(([, item]) => item.uncertainty?.effectiveIndependentSamples).filter(value => finite(value) && value > 0);

  return {
    ...values,
    effectiveFieldGoalPercentage: {
      ...(baseline || {}),
      key: 'effectiveFieldGoalPercentage',
      value,
      donorBlendValue: finite(baseline?.value) ? baseline.value : null,
      donorBlendBaseline: baseline ? { value: baseline.value, donorContributions: baseline.donorContributions || [] } : null,
      donorContributions: [],
      unit: 'percent',
      status: 'modeled-derived',
      component: 'efficiency',
      sourceMetric: 'effectiveFieldGoalPercentage',
      method: 'synthetic-effective-field-goal-identity-v1',
      derivation: {
        status: 'derived',
        method: 'synthetic-effective-field-goal-identity-v1',
        formula: 'fieldGoalPercentage + 0.5 * threePointPercentage * threePointAttemptShare',
        inputs: contributors,
        note: 'The synthetic eFG output is derived from the final modeled shooting outputs; an independently selected eFG donor is retained only as a baseline comparison.',
      },
      uncertainty: {
        minimum,
        maximum,
        donorMinimum: minimum,
        donorMaximum: maximum,
        sample: sample.length ? Math.min(...sample) : null,
        sampleUnit: 'conservative-minimum-player-season-donor-rows',
        independentDonorCount: independentDonorCounts.length ? Math.min(...independentDonorCounts) : null,
        effectiveIndependentSamples: effectiveIndependentSamples.length ? round(Math.min(...effectiveIndependentSamples)) : null,
        independentSupportMethod: 'minimum-component-denominator-weighted-player-identity-kish-ess-v1',
        effectiveExposure: effectiveExposure.length ? round(Math.min(...effectiveExposure)) : null,
        reliability: reliability.length ? round(Math.min(...reliability)) : null,
        method: 'derived-component-donor-range-v1',
        interpretation: 'Conservative component donor range propagated through the eFG identity; not a calibrated prediction interval.',
      },
    },
  };
}

function workloadReferenceEvidence(recipe, outputKey, byKey, cohort, bands) {
  const output = COMPOSITE_FORGE_OUTPUTS[outputKey];
  const donors = outputDonors(recipe, output, byKey, cohort, bands)
    .map(donor => ({ ...donor, minutes: readCompositeMetric(donor.profile, 'minutesPerGame') }));
  const totalWeight = donors.reduce((sum, donor) => sum + donor.effectiveWeight, 0);
  const selectedDonorKeys = recipe.components[output.component]?.donors?.map(donor => donor.profileKey) || [];
  const resolvedDonorKeys = new Set(donors.map(donor => profileKey(donor.profile)));
  const missingMetricDonors = selectedDonorKeys.filter(key => !resolvedDonorKeys.has(key));
  const shares = normalizedEffectiveShares(donors);
  const workloadEvidenceComplete = totalWeight > 0
    && donors.length === selectedDonorKeys.length
    && missingMetricDonors.length === 0
    && donors.every(donor => donor.minutes.status !== 'unavailable' && finite(donor.minutes.value) && donor.minutes.value > 0);
  const donorContributions = donors.map((donor, index) => ({
    profileKey: profileKey(donor.profile),
    player: donor.profile.player || donor.profile.playerName,
    seasonStartYear: donor.profile.seasonStartYear,
    phase: donor.profile.phase,
    team: donor.profile.team,
    scope: donor.profile.scope,
    requestedWeight: donor.requestedWeight,
    effectiveWeight: round(donor.effectiveWeight),
    effectiveShare: shares[index],
    outputValue: donor.metric.value,
    outputNumerator: donor.metric.numerator,
    outputDenominator: donor.metric.denominator,
    outputKnownGames: donor.metric.knownGames,
    outputSourceMetric: donor.metric.sourceMetric,
    outputEvidenceKind: donor.metric.evidenceKind,
    minutesPerGame: donor.minutes.status !== 'unavailable' && finite(donor.minutes.value) && donor.minutes.value > 0
      ? donor.minutes.value : null,
    minutesStatus: donor.minutes.status,
    minutesNumerator: donor.minutes.numerator,
    minutesDenominator: donor.minutes.denominator,
    minutesKnownGames: donor.minutes.knownGames,
    minutesSourceMetric: donor.minutes.sourceMetric,
    minutesEvidenceKind: donor.minutes.evidenceKind,
    minutesMethod: donor.minutes.method,
  }));
  return {
    status: workloadEvidenceComplete ? 'available' : 'unavailable',
    value: workloadEvidenceComplete
      ? donors.reduce((sum, donor) => sum + donor.minutes.value * donor.effectiveWeight, 0) / totalWeight : null,
    donorContributions,
    missingMetricDonors,
    method: 'paired-output-donor-workload-evidence-v1',
    reason: workloadEvidenceComplete ? null
      : 'Every selected output donor needs valid positive minutes-per-game evidence for a paired workload transfer.',
  };
}

function countBackedAttemptsPerGame(recipe, outputKey, byKey, cohort, bands, workloadMinutes) {
  const output = COMPOSITE_FORGE_OUTPUTS[outputKey];
  const donors = outputDonors(recipe, output, byKey, cohort, bands);
  const selectedDonorCount = recipe.components[output.component]?.donors?.length || 0;
  if (!donors.length || donors.length !== selectedDonorCount || donors.some(donor => !integer(donor.metric.denominator, 1)
    || !integer(donor.metric.knownGames, 1))) {
    return { status: 'unavailable', value: null, reason: 'Every selected donor must carry whole-attempt denominators and known-game counts.' };
  }
  if (donors.some(donor => donor.metric.status !== 'observed' || donor.reliability < 1)) {
    return { status: 'unavailable', value: null, reason: 'Selected attempt denominators have limited exposure support for a synthetic identity derivation.' };
  }
  const totalWeight = donors.reduce((sum, donor) => sum + donor.effectiveWeight, 0);
  if (!(totalWeight > 0)) return { status: 'unavailable', value: null, reason: 'Selected donor attempt evidence has no positive effective weight.' };
  const reference = workloadReferenceEvidence(recipe, outputKey, byKey, cohort, bands);
  const hasTargetWorkload = finite(workloadMinutes) && workloadMinutes > 0;
  const referenceByProfile = new Map(reference.donorContributions.map(donor => [donor.profileKey, donor]));
  const shares = normalizedEffectiveShares(donors);
  const independentSupport = independentDonorSupport(donors);
  const attemptEvidence = donors.map((donor, index) => {
    const workloadDonor = referenceByProfile.get(profileKey(donor.profile));
    const attemptsPerGame = donor.metric.denominator / donor.metric.knownGames;
    const workloadRatio = hasTargetWorkload && finite(workloadDonor?.minutesPerGame) && workloadDonor.minutesPerGame > 0
      ? workloadMinutes / workloadDonor.minutesPerGame : 1;
    const appliedRatio = clamp(workloadRatio, 0.5, 1.5);
    return {
      profileKey: profileKey(donor.profile),
      player: donor.profile.player || donor.profile.playerName,
      seasonStartYear: donor.profile.seasonStartYear,
      phase: donor.profile.phase,
      team: donor.profile.team,
      scope: donor.profile.scope,
      requestedWeight: donor.requestedWeight,
      effectiveWeight: round(donor.effectiveWeight),
      effectiveShare: shares[index],
      value: donor.metric.value,
      attempts: donor.metric.denominator,
      knownGames: donor.metric.knownGames,
      attemptsPerGame: round(attemptsPerGame * appliedRatio),
      unadjustedAttemptsPerGame: round(attemptsPerGame),
      workloadMinutesPerGame: workloadDonor?.minutesPerGame ?? null,
      workloadMinutesStatus: workloadDonor?.minutesStatus || 'unavailable',
      workloadRequestedRatio: hasTargetWorkload && finite(workloadDonor?.minutesPerGame) && workloadDonor.minutesPerGame > 0
        ? round(workloadRatio) : null,
      workloadAppliedRatio: round(appliedRatio),
      exposure: donor.metric.exposure,
      exposureUnit: donor.metric.exposureUnit,
      reliability: round(donor.reliability),
      numerator: donor.metric.numerator,
      denominator: donor.metric.denominator,
      sourceMetric: donor.metric.sourceMetric,
      evidenceKind: donor.metric.evidenceKind,
      coverage: donor.metric.coverage,
      method: donor.metric.method,
    };
  });
  if (hasTargetWorkload && reference.status !== 'available') {
    return {
      status: 'unavailable', value: null,
      reason: reference.reason || 'Every attempt donor needs valid minutes-per-game evidence for a paired workload transfer.',
      donorContributions: attemptEvidence,
      workloadAdjustment: {
        status: 'unavailable', workloadMinutesPerGame: round(workloadMinutes),
        referenceMinutesPerGame: null, donorContributions: reference.donorContributions,
        missingMetricDonors: reference.missingMetricDonors,
        method: 'paired-donor-workload-volume-transfer-v2',
      },
    };
  }
  const rates = attemptEvidence.map(donor => donor.attemptsPerGame);
  const appliedRatio = attemptEvidence.reduce((sum, donor) => sum + donor.effectiveShare * donor.workloadAppliedRatio, 0);
  const bounded = hasTargetWorkload && attemptEvidence.some(donor => donor.workloadRequestedRatio !== null
    && (donor.workloadRequestedRatio < 0.5 || donor.workloadRequestedRatio > 1.5));
  return {
    status: 'available',
    value: attemptEvidence.reduce((sum, donor) => sum + donor.attemptsPerGame * donor.effectiveShare, 0),
    minimum: Math.min(...rates),
    maximum: Math.max(...rates),
    sample: donors.length,
    sampleUnit: 'player-season-donor-rows',
    independentDonorCount: independentSupport.independentDonorCount,
    effectiveIndependentSamples: independentSupport.effectiveIndependentSamples,
    independentSupportMethod: independentSupport.method,
    reliability: donors.reduce((sum, donor) => sum + donor.reliability * donor.effectiveWeight, 0) / totalWeight,
    donorContributions: attemptEvidence,
    workloadAdjustment: {
      status: hasTargetWorkload ? (bounded ? 'bounded-transfer' : 'applied') : 'not-applied',
      workloadMinutesPerGame: finite(workloadMinutes) ? round(workloadMinutes) : null,
      referenceMinutesPerGame: finite(reference.value) ? round(reference.value) : null,
      requestedRatio: finite(workloadMinutes) && workloadMinutes > 0 && finite(reference.value) && reference.value > 0
        ? round(workloadMinutes / reference.value) : null,
      appliedRatio: round(appliedRatio),
      donorContributions: reference.donorContributions,
      referenceDonors: reference.donorContributions,
      missingMetricDonors: reference.missingMetricDonors,
      method: 'paired-donor-workload-volume-transfer-v2',
    },
  };
}

function deriveSyntheticTrueShooting(recipe, cohort, byKey, bands, values) {
  const donorBlend = values.trueShootingPercentage || null;
  const fail = (reason, inputs = {}, { status = 'not-applied' } = {}) => {
    const inputRecords = Array.isArray(inputs) ? inputs : Object.entries(inputs).map(([output, entry]) => (
      object(entry) ? { output, ...entry } : { output, value: entry }
    ));
    const derivation = { status, method: 'synthetic-true-shooting-identity-v1', reason, inputs: inputRecords };
    return {
      value: donorBlend ? { ...donorBlend, donorBlendValue: donorBlend.value,
        donorBlendBaseline: { value: donorBlend.value, donorContributions: donorBlend.donorContributions || [] },
        derivation } : null,
      receipt: derivation,
    };
  };
  if (!finite(values.points?.value)) return fail('Final synthetic points per game are unavailable.');
  const workloadMinutes = values.minutesPerGame?.value;
  const fieldGoalAttempts = countBackedAttemptsPerGame(recipe, 'fieldGoalPercentage', byKey, cohort, bands, workloadMinutes);
  const freeThrowAttempts = countBackedAttemptsPerGame(recipe, 'freeThrowPercentage', byKey, cohort, bands, workloadMinutes);
  const pointsWorkloadReference = workloadReferenceEvidence(recipe, 'points', byKey, cohort, bands);
  const inputs = {
    points: { value: values.points.value, donorContributions: values.points.donorContributions || [],
      workloadAdjustment: values.points.workloadAdjustment || null,
      workloadReferenceMinutesPerGame: pointsWorkloadReference.value,
      workloadReferenceDonors: pointsWorkloadReference.donorContributions },
    fieldGoalAttemptsPerGame: fieldGoalAttempts,
    freeThrowAttemptsPerGame: freeThrowAttempts,
    workloadMinutesPerGame: { value: workloadMinutes ?? null,
      donorContributions: values.minutesPerGame?.donorContributions || [] },
  };
  if (finite(workloadMinutes) && workloadMinutes > 0 && values.points.workloadAdjustment?.status === 'unavailable') {
    return fail('Final synthetic points could not be workload-aligned because every selected point donor lacks valid paired minutes evidence.', inputs);
  }
  if (fieldGoalAttempts.status !== 'available' || freeThrowAttempts.status !== 'available') {
    return fail('Count-backed field-goal and free-throw attempts per game are both required.', inputs);
  }
  const evidenceDonors = [
    ...inputs.points.donorContributions,
    ...inputs.points.workloadReferenceDonors,
    ...fieldGoalAttempts.donorContributions,
    ...fieldGoalAttempts.workloadAdjustment.referenceDonors,
    ...freeThrowAttempts.donorContributions,
    ...freeThrowAttempts.workloadAdjustment.referenceDonors,
    ...inputs.workloadMinutesPerGame.donorContributions,
  ];
  const phases = new Set(evidenceDonors.map(donor => donor.phase).filter(Boolean));
  const scopes = new Set(evidenceDonors.map(donor => donor.scope).filter(Boolean));
  if (phases.size !== 1 || scopes.size !== 1) {
    return fail('Points, attempt, and workload evidence must share one observed phase and profile scope.', inputs, { status: 'blocked' });
  }
  const denominator = 2 * (fieldGoalAttempts.value + 0.44 * freeThrowAttempts.value);
  if (!(denominator > 0)) return fail('Count-backed shooting attempts do not support a positive true-shooting denominator.', inputs);
  const value = round(values.points.value / denominator);
  const outputSpec = COMPOSITE_FORGE_OUTPUTS.trueShootingPercentage;
  if (!finite(value) || value < outputSpec.range[0] || value > outputSpec.range[1]) {
    return fail('The count-backed identity result falls outside the supported true-shooting range.', inputs, { status: 'blocked' });
  }
  const donorRange = donorBlend?.uncertainty || {};
  const pointsMinimum = finite(values.points.uncertainty?.minimum) ? Math.min(values.points.value, values.points.uncertainty.minimum) : values.points.value;
  const pointsMaximum = finite(values.points.uncertainty?.maximum) ? Math.max(values.points.value, values.points.uncertainty.maximum) : values.points.value;
  const minimumDenominator = 2 * (fieldGoalAttempts.maximum + 0.44 * freeThrowAttempts.maximum);
  const maximumDenominator = 2 * (fieldGoalAttempts.minimum + 0.44 * freeThrowAttempts.minimum);
  const minimum = minimumDenominator > 0 ? round(pointsMinimum / minimumDenominator) : value;
  const maximum = maximumDenominator > 0 ? round(pointsMaximum / maximumDenominator) : value;
  const reliability = Math.min(
    finite(values.points.uncertainty?.reliability) ? values.points.uncertainty.reliability : 0,
    fieldGoalAttempts.reliability,
    freeThrowAttempts.reliability,
  );
  const inputsList = [
    { output: 'points', value: values.points.value, donorContributions: inputs.points.donorContributions,
      workloadAdjustment: inputs.points.workloadAdjustment },
    { output: 'pointsWorkloadReferenceMinutesPerGame', value: pointsWorkloadReference.value,
      donorContributions: pointsWorkloadReference.donorContributions },
    { output: 'workloadMinutesPerGame', value: workloadMinutes ?? null,
      donorContributions: inputs.workloadMinutesPerGame.donorContributions },
    { output: 'fieldGoalAttemptsPerGame', value: fieldGoalAttempts.value,
      donorContributions: fieldGoalAttempts.donorContributions, workloadAdjustment: fieldGoalAttempts.workloadAdjustment },
    { output: 'fieldGoalWorkloadReferenceMinutesPerGame', value: fieldGoalAttempts.workloadAdjustment.referenceMinutesPerGame,
      donorContributions: fieldGoalAttempts.workloadAdjustment.referenceDonors },
    { output: 'freeThrowAttemptsPerGame', value: freeThrowAttempts.value,
      donorContributions: freeThrowAttempts.donorContributions, workloadAdjustment: freeThrowAttempts.workloadAdjustment },
    { output: 'freeThrowWorkloadReferenceMinutesPerGame', value: freeThrowAttempts.workloadAdjustment.referenceMinutesPerGame,
      donorContributions: freeThrowAttempts.workloadAdjustment.referenceDonors },
  ];
  const derivation = {
    status: 'derived', method: 'synthetic-true-shooting-identity-v1',
    formula: 'pointsPerGame / (2 * (fieldGoalAttemptsPerGame + 0.44 * freeThrowAttemptsPerGame))',
    inputs: inputsList,
    note: 'Derived only from final synthetic points per game and count-backed attempt rates from the selected same-phase donor scope; the efficiency donor blend is retained as a comparison baseline.',
  };
  const output = {
    ...(donorBlend || {}), key: 'trueShootingPercentage', value,
    donorBlendValue: finite(donorBlend?.value) ? donorBlend.value : null,
    donorBlendBaseline: donorBlend ? { value: donorBlend.value, donorContributions: donorBlend.donorContributions || [] } : null,
    donorContributions: [], unit: 'percent', status: 'modeled-derived', component: 'efficiency',
    sourceMetric: 'trueShootingPercentage', method: 'synthetic-true-shooting-identity-v1', derivation,
    uncertainty: {
      minimum: finite(minimum) ? Math.min(minimum, value) : value,
      maximum: finite(maximum) ? Math.max(maximum, value) : value,
      donorMinimum: finite(donorRange.minimum) ? donorRange.minimum : null,
      donorMaximum: finite(donorRange.maximum) ? donorRange.maximum : null,
      sample: Math.min(fieldGoalAttempts.sample, freeThrowAttempts.sample,
        integer(values.points.uncertainty?.sample, 1) ? values.points.uncertainty.sample : values.points.donorContributions?.length || 0),
      sampleUnit: 'conservative-minimum-player-season-donor-rows',
      independentDonorCount: Math.min(fieldGoalAttempts.independentDonorCount, freeThrowAttempts.independentDonorCount,
        integer(values.points.uncertainty?.independentDonorCount, 1) ? values.points.uncertainty.independentDonorCount : 0),
      effectiveIndependentSamples: round(Math.min(fieldGoalAttempts.effectiveIndependentSamples, freeThrowAttempts.effectiveIndependentSamples,
        finite(values.points.uncertainty?.effectiveIndependentSamples) ? values.points.uncertainty.effectiveIndependentSamples : 0)),
      independentSupportMethod: 'minimum-count-backed-denominator-weighted-player-identity-kish-ess-v1',
      effectiveExposure: null,
      reliability: round(reliability),
      method: 'count-backed-synthetic-identity-range-v1',
      interpretation: 'Conservative range from the synthetic points donor range and selected count-backed attempt donor ranges; not a calibrated prediction interval.',
    },
  };
  return { value: output, receipt: derivation };
}

function applyWorkloadVolumeConstraint(recipe, values, byKey, cohort, bands) {
  const workloadMinutes = values.minutesPerGame?.value;
  if (!finite(workloadMinutes) || workloadMinutes <= 0) return values;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => {
    if (!VOLUME_OUTPUT_KEYS.includes(key) || !value || !finite(value.value)) return [key, value];
    const reference = workloadReferenceEvidence(recipe, key, byKey, cohort, bands);
    if (reference.status !== 'available' || !finite(reference.value) || reference.value <= 0) {
      return [key, { ...value, preWorkloadValue: value.value, workloadAdjustment: {
        status: 'unavailable', method: 'paired-donor-workload-volume-transfer-v2',
        workloadMinutesPerGame: round(workloadMinutes), referenceMinutesPerGame: null,
        donorContributions: reference.donorContributions, missingMetricDonors: reference.missingMetricDonors,
        reason: reference.reason || 'The selected output donors do not all have usable minutes-per-game evidence.',
      } }];
    }
    const requestedRatio = workloadMinutes / reference.value;
    const output = COMPOSITE_FORGE_OUTPUTS[key];
    const relationshipDelta = finite(value.donorBlendValue) ? value.value - value.donorBlendValue : 0;
    const donorAdjustments = reference.donorContributions.map(donor => {
      const donorRatio = workloadMinutes / donor.minutesPerGame;
      const appliedRatio = clamp(donorRatio, 0.5, 1.5);
      const transferredValue = clamp(donor.outputValue * appliedRatio, output.range[0], output.range[1]);
      const relationshipAdjustment = relationshipDelta * appliedRatio;
      return {
        ...donor,
        workloadRequestedRatio: round(donorRatio),
        workloadAppliedRatio: round(appliedRatio),
        transferredValue: round(transferredValue),
        relationshipAdjustment: round(relationshipAdjustment),
        modeledValue: round(clamp(transferredValue + relationshipAdjustment, output.range[0], output.range[1])),
      };
    });
    const appliedRatio = donorAdjustments.reduce((sum, donor) => sum + donor.workloadAppliedRatio * donor.effectiveShare, 0);
    const adjustedValue = donorAdjustments.reduce((sum, donor) => sum + donor.modeledValue * donor.effectiveShare, 0);
    const unconstrainedRatio = requestedRatio;
    const bounded = donorAdjustments.some(donor => donor.workloadRequestedRatio < 0.5 || donor.workloadRequestedRatio > 1.5);
    const rawDonorValues = (value.donorContributions || []).map(donor => donor.value).filter(finite);
    const outsideDonorRange = rawDonorValues.length
      && (adjustedValue < Math.min(...rawDonorValues) || adjustedValue > Math.max(...rawDonorValues));
    return [key, {
      ...value,
      preWorkloadValue: value.value,
      value: round(adjustedValue),
      method: `${value.method}+paired-donor-workload-volume-transfer-v2`,
      workloadAdjustment: {
        status: bounded ? 'bounded-extrapolation' : 'applied',
        method: 'paired-donor-workload-volume-transfer-v2',
        workloadMinutesPerGame: round(workloadMinutes), referenceDonorMinutesPerGame: round(reference.value),
        requestedRatio: round(unconstrainedRatio), appliedRatio: round(appliedRatio),
        effectiveShareTotal: round(donorAdjustments.reduce((sum, donor) => sum + donor.effectiveShare, 0)),
        outsideSelectedDonorRange: Boolean(outsideDonorRange), donorContributions: donorAdjustments,
        note: 'Each per-game output donor is transferred from its own observed minutes per game to the selected workload, with the 0.50–1.50× bound applied donor by donor. Donor contribution shares sum to one.',
      },
    }];
  }));
}

function buildSyntheticUniqueness(recipe, values) {
  const donorKeys = selectedDonorKeys(recipe);
  const changedOutputs = [];
  const preservedOutputs = [];
  for (const [key, value] of Object.entries(values || {})) {
    if (!value || !finite(value.value) || !finite(value.donorBlendValue)) continue;
    const delta = round(value.value - value.donorBlendValue);
    if (Math.abs(delta) > SYNTHETIC_DISTINCTNESS_TOLERANCE) changedOutputs.push({
      key, delta,
      adjustment: value.derivation?.method
        ? 'statistical-identity-constraint'
        : value.workloadAdjustment?.status
        ? 'workload-volume-constraint'
        : value.relationshipSynthesis?.status === 'applied' ? 'cohort-relationship-synthesis' : 'modeled-adjustment',
    });
    else preservedOutputs.push(key);
  }
  const status = donorKeys.length <= 1 ? 'single-donor-reproduction'
    : changedOutputs.length ? 'modeled-unique' : 'not-unique';
  return {
    status, distinctDonorCount: donorKeys.length, selectedDonorKeys: donorKeys,
    changedOutputs, preservedOutputs,
    method: 'recipe-bound-donor-diversity-and-modeled-adjustment-v2',
    note: status === 'modeled-unique'
      ? 'At least one published output differs from its exposure-weighted donor blend through a bounded relationship or workload adjustment.'
      : status === 'single-donor-reproduction'
        ? 'All components resolve to one donor identity; the synthetic identity is reproducible, but the line is intentionally not presented as a novel statistical observation.'
        : 'Multiple donor identities were selected, but no supported relationship or workload adjustment changed the displayed outputs; the line is not claimed as unique.',
  };
}

function buildSyntheticStatistics(recipe, cohort, byKey, bands, components) {
  const donorValues = Object.fromEntries(Object.keys(COMPOSITE_FORGE_OUTPUTS).map(key => [key, blendOutputMetric(recipe, key, byKey, cohort, bands)]));
  const relationshipValues = Object.fromEntries(Object.entries(donorValues).map(([key, value]) => [key,
    synthesizeOutputFromRelationships(recipe, cohort, byKey, bands, components, key, value)]));
  const shootingConstrainedValues = deriveSyntheticEffectiveFieldGoal(relationshipValues);
  const workloadConstrainedValues = applyWorkloadVolumeConstraint(recipe, shootingConstrainedValues, byKey, cohort, bands);
  const trueShooting = deriveSyntheticTrueShooting(recipe, cohort, byKey, bands, workloadConstrainedValues);
  const values = { ...workloadConstrainedValues, trueShootingPercentage: trueShooting.value };
  const uniqueness = buildSyntheticUniqueness(recipe, values);
  const available = Object.values(values).filter(Boolean);
  const relationshipFallbackOutputs = Object.entries(values)
    .filter(([, value]) => value?.relationshipSynthesis?.status === 'direct-donor-blend')
    .map(([key]) => key);
  const perGameKeys = VOLUME_OUTPUT_KEYS;
  const perGame = Object.fromEntries(perGameKeys.map(key => [key, values[key]?.value ?? null]));
  const skillRates = {
    ...perGame,
    involvementPer36: values.involvementPer36?.value ?? null,
  };
  const games = values.games?.value ?? null;
  const minutesPerGame = values.minutesPerGame?.value ?? null;
  const totals = Object.fromEntries(perGameKeys.map(key => [key,
    finite(perGame[key]) && finite(games) && games > 0 ? Math.round(perGame[key] * games) : null]));
  const minutes = finite(minutesPerGame) && finite(games) && games > 0 ? round(minutesPerGame * games) : null;
  const derived = {
    assistToTurnover: finite(perGame.assists) && finite(perGame.turnovers) && perGame.turnovers > 0 ? round(perGame.assists / perGame.turnovers) : null,
    stocksPerGame: finite(perGame.steals) && finite(perGame.blocks) ? round(perGame.steals + perGame.blocks) : null,
    stocksPer36: finite(perGame.steals) && finite(perGame.blocks) && finite(minutesPerGame) && minutesPerGame > 0
      ? round((perGame.steals + perGame.blocks) * 36 / minutesPerGame) : null,
    scoringPer36: finite(perGame.points) && finite(minutesPerGame) && minutesPerGame > 0 ? round(perGame.points * 36 / minutesPerGame) : null,
    creationToWorkload: finite(values.involvementPer36?.value) && finite(minutesPerGame) && minutesPerGame > 0
      ? round(values.involvementPer36.value * minutesPerGame / 36) : null,
    efficiencySpread: finite(values.trueShootingPercentage?.value) && finite(values.effectiveFieldGoalPercentage?.value)
      ? round(values.trueShootingPercentage.value - values.effectiveFieldGoalPercentage.value) : null,
  };
  const missing = Object.keys(COMPOSITE_FORGE_OUTPUTS).filter(key => !values[key]);
  const boundedWorkloadOutputs = Object.entries(values).filter(([, value]) => value?.workloadAdjustment?.status === 'bounded-extrapolation').map(([key]) => key);
  const unavailableWorkloadOutputs = Object.entries(values).filter(([, value]) => value?.workloadAdjustment?.status === 'unavailable').map(([key]) => key);
  const uniquenessDescription = uniqueness.status === 'modeled-unique'
    ? 'a unique modeled player line'
    : uniqueness.status === 'single-donor-reproduction'
      ? 'a reproducible single-donor line without a novelty claim'
      : uniqueness.status === 'not-unique'
      ? 'a multi-donor line without a supported output adjustment, so uniqueness is not claimed'
      : 'a modeled line with unresolved uniqueness evidence';
  const evidenceDescription = uniqueness.status === 'single-donor-reproduction'
    ? 'It may reproduce the selected donor values, but it is not an observed player season or a calibrated forecast.'
    : uniqueness.status === 'not-unique'
      ? 'It remains an exposure-weighted donor blend without a supported output adjustment; it is not an observed player season or a calibrated forecast.'
    : 'It is not copied donor stats, an observed player season, or a calibrated forecast.';
  return { status: available.length ? (missing.length ? 'partial' : 'modeled') : 'unavailable',
    method: 'component-donor-plus-cohort-relationship-workload-and-identity-constraints-v2',
    perGame, skillRates, totals, derived, workload: { games, minutesPerGame, minutes },
    tendencies: buildSyntheticTendencies(perGame, values, derived, { games, minutesPerGame }),
    uncertainty: buildSyntheticUncertainty(values),
    trueShootingDerivation: trueShooting.receipt,
    uniqueness, values, missing, boundedWorkloadOutputs, unavailableWorkloadOutputs, relationshipFallbackOutputs,
    provenance: available.flatMap(value => [
      ...(value.donorContributions || []),
      ...(Array.isArray(value.workloadAdjustment?.donorContributions) ? value.workloadAdjustment.donorContributions : []),
      ...(Array.isArray(value.derivation?.inputs) ? value.derivation.inputs.flatMap(input => (
        Array.isArray(input?.donorContributions) ? input.donorContributions : []
      )) : []),
    ]),
    note: `Synthetic statistics begin with observed donor components, apply cohort-relationship synthesis where supported${relationshipFallbackOutputs.length
      ? `, and retain direct exposure-weighted donor blends for ${relationshipFallbackOutputs.join(', ')} where compatible relationship support is unavailable` : ''}, then apply workload-constrained volume and exact shooting identities where the required outputs are supported. They are ${uniquenessDescription}. ${evidenceDescription}` };
}

function buildSyntheticTendencies(perGame, values, derived, workload) {
  const candidates = [
    { key: 'scoring-volume', label: 'Scoring volume', metric: 'points', value: perGame.points, unit: 'points/game', source: 'modeled-output' },
    { key: 'creation-load', label: 'Creation load', metric: 'involvementPer36', value: values.involvementPer36?.value ?? null, unit: 'involvement/36', source: 'modeled-output' },
    { key: 'passing-load', label: 'Passing load', metric: 'assists', value: perGame.assists, unit: 'assists/game', source: 'modeled-output' },
    { key: 'ball-security', label: 'Ball security', metric: 'assistToTurnover', value: derived.assistToTurnover, unit: 'assist/turnover', source: 'derived-output' },
    { key: 'defensive-activity', label: 'Defensive activity', metric: 'stocksPer36', value: derived.stocksPer36, unit: 'stocks/36', source: 'derived-output' },
    { key: 'shooting-efficiency', label: 'Shooting efficiency', metric: 'trueShootingPercentage', value: values.trueShootingPercentage?.value ?? null, unit: 'share', source: 'modeled-output' },
    { key: 'workload', label: 'Workload', metric: 'minutesPerGame', value: workload.minutesPerGame, unit: 'minutes/game', source: 'modeled-output' },
  ];
  return candidates.filter(entry => finite(entry.value)).map(entry => ({ ...entry, value: round(entry.value), status: 'modeled',
    note: 'A transparent tendency derived from the synthetic line; it is not an observed player label or a universal grade.' }));
}

function buildSyntheticUncertainty(values) {
  const ranges = Object.entries(COMPOSITE_FORGE_OUTPUTS).map(([key, output]) => {
    const item = values[key];
    const uncertainty = item?.uncertainty;
    if (!item || !uncertainty || !finite(item.value) || !finite(uncertainty.minimum) || !finite(uncertainty.maximum)) {
      return { key, metric: output.metric, status: 'unavailable', value: item?.value ?? null, minimum: null, maximum: null };
    }
    const donorMinimum = uncertainty.minimum;
    const donorMaximum = uncertainty.maximum;
    const minimum = Math.min(donorMinimum, item.value);
    const maximum = Math.max(donorMaximum, item.value);
    return { key, metric: output.metric, status: 'modeled-donor-range', value: round(item.value), minimum: round(minimum), maximum: round(maximum),
      donorMinimum: round(donorMinimum), donorMaximum: round(donorMaximum),
      sample: integer(uncertainty.sample, 0) ? uncertainty.sample : null,
      sampleUnit: uncertainty.sampleUnit || null,
      independentDonorCount: integer(uncertainty.independentDonorCount, 0) ? uncertainty.independentDonorCount : null,
      effectiveIndependentSamples: finite(uncertainty.effectiveIndependentSamples) ? round(uncertainty.effectiveIndependentSamples) : null,
      independentSupportMethod: uncertainty.independentSupportMethod || null,
      effectiveExposure: finite(uncertainty.effectiveExposure) ? round(uncertainty.effectiveExposure) : null,
      reliability: finite(uncertainty.reliability) ? round(uncertainty.reliability) : null,
      outsideDonorRange: item.value < donorMinimum || item.value > donorMaximum,
      includesModeledValue: item.value >= donorMinimum && item.value <= donorMaximum, method: uncertainty.method,
      interpretation: uncertainty.interpretation || 'Observed donor range only; not a calibrated prediction interval.' };
  });
  const available = ranges.filter(range => range.status !== 'unavailable');
  return { status: available.length ? (available.length === ranges.length ? 'modeled' : 'partial') : 'unavailable',
    method: 'observed-donor-range-with-modeled-value-v1', ranges,
    note: 'Ranges preserve selected donor dispersion and include bounded relationship/workload adjustments. They are not calibrated prediction intervals and do not encode hidden injury or coaching stories.' };
}

function componentEvidenceReliability(component) {
  const donors = Array.isArray(component?.donorContributions) ? component.donorContributions : [];
  const weighted = donors.filter(donor => finite(donor?.effectiveShare) && donor.effectiveShare > 0 && finite(donor?.exposureReliability));
  const total = weighted.reduce((sum, donor) => sum + donor.effectiveShare, 0);
  if (!(total > 0)) return null;
  return weighted.reduce((sum, donor) => sum + donor.effectiveShare * donor.exposureReliability, 0) / total;
}

function buildInputEvidenceSummary(components, syntheticStatistics) {
  const weighted = components.filter(component => finite(component?.weight) && component.weight > 0);
  const selected = weighted.filter(component => component.status !== 'unassigned');
  const totalWeight = selected.reduce((sum, component) => sum + component.weight, 0);
  const available = selected.filter(component => component.value !== null && component.status !== 'unavailable' && component.status !== 'invalid');
  const observedWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const coverage = totalWeight > 0 ? observedWeight / totalWeight : 0;
  const reliabilityWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const reliability = reliabilityWeight > 0
    ? available.reduce((sum, component) => sum + component.weight * (componentEvidenceReliability(component) ?? 0), 0) / reliabilityWeight
    : null;
  const caveatComponents = selected.filter(component => component.status === 'complete_with_caveats' && component.extrapolationOnly !== true).map(component => component.key);
  const missingComponents = weighted.filter(component => component.value === null || ['unavailable', 'invalid', 'unassigned'].includes(component.status)).map(component => component.key);
  const boundedWorkloadOutputs = Array.isArray(syntheticStatistics?.boundedWorkloadOutputs) ? [...syntheticStatistics.boundedWorkloadOutputs] : [];
  const status = !available.length ? 'unavailable'
    : coverage >= 0.999 && (reliability ?? 0) >= 0.9 && !caveatComponents.length && !boundedWorkloadOutputs.length ? 'high'
      : coverage >= 0.8 && (reliability ?? 0) >= 0.65 && !boundedWorkloadOutputs.length ? 'moderate' : 'limited';
  return {
    version: 'composite-input-evidence-v1',
    status,
    componentCoverage: round(coverage),
    donorReliability: reliability === null ? null : round(reliability),
    observedComponents: available.map(component => component.key),
    caveatComponents,
    missingComponents,
    boundedWorkloadOutputs,
    note: status === 'high'
      ? 'All selected components have observed donor evidence with strong exposure support. This assesses input support, not forecast accuracy.'
      : status === 'moderate'
        ? 'Most selected components have usable observed donor evidence. Review listed caveats before treating the synthetic line as a scenario input.'
        : status === 'limited'
          ? 'Input support is incomplete, low-exposure, or workload-bounded. The synthetic line remains modeled and should not be used as a calibrated projection.'
          : 'No selected component has enough observed donor evidence to support a synthetic line.',
  };
}

function empiricalPercentile(cohort, metric, value, direction) {
  const values = cohort.profiles.map(profile => readCompositeMetric(profile, metric))
    .filter(entry => entry.status !== 'unavailable' && finite(entry.value)).map(entry => entry.value);
  if (!values.length || !finite(value)) return null;
  const rank = values.reduce((count, candidate) => count + (candidate < value ? 1 : candidate === value ? 0.5 : 0), 0) / values.length;
  const percentile = direction < 0 ? 1 - rank : rank;
  return clamp(percentile, 0, 1);
}

function buildGameRating(recipe, cohort, components, inputEvidence = null, syntheticStatistics = null) {
  const parts = components.filter(component => component.value !== null && component.status !== 'unavailable'
    && recipe.componentWeights[component.key] > 0);
  if (!parts.length) return { status: 'unavailable', scale: 'component-percentile-25-99', components: [], missing: COMPOSITE_FORGE_COMPONENTS.map(spec => spec.key), inputEvidence,
    notObserved: true, purpose: 'game-style component tuning', note: 'No observed component can support a synthetic component tuning aid; no aggregate overall grade is produced.' };
  const ratings = parts.map(component => {
    // Rate the final modeled component output when one exists. Keeping the
    // donor input beside it prevents a percentile aid from quietly rating a
    // stale pre-workload/pre-relationship value.
    const modeledValue = syntheticOutputForComponent(component, syntheticStatistics);
    const ratingValue = finite(modeledValue) ? modeledValue : component.value;
    const rawPercentile = empiricalPercentile(cohort, component.metric, ratingValue, METRIC_DEFINITIONS[component.metric]?.direction || 1);
    // A cohort percentile is too confident when the selected donor has only a
    // small denominator.  Pull the displayed tuning aid toward the cohort
    // midpoint in proportion to donor exposure support.  This is still a
    // component rating aid, not an overall grade or forecast.
    const donorConfidence = modeledComponentReliability(component, syntheticStatistics);
    const confidence = finite(donorConfidence) ? clamp(donorConfidence, 0, 1) : 0.5;
    const percentile = rawPercentile === null ? null : round(0.5 + (rawPercentile - 0.5) * confidence);
    const rating = percentile === null ? null : Math.round(25 + 74 * percentile);
    const n = cohort.profiles.reduce((count, profile) => count + (readCompositeMetric(profile, component.metric).status !== 'unavailable' ? 1 : 0), 0);
    return { component: component.key, label: component.label, metric: component.metric, value: round(ratingValue), inputValue: component.value,
      rating, percentile, rawPercentile: rawPercentile === null ? null : round(rawPercentile), confidence: round(confidence),
      weight: recipe.componentWeights[component.key],
      valueSource: modeledComponentValueSource(component, syntheticStatistics),
      cohortRows: n, basis: 'exposure-shrunk-synthetic-output-cohort-percentile-with-direction-v2', status: rating === null ? 'unavailable' : 'modeled' };
  });
  const usable = ratings.filter(part => finite(part.rating));
  return { status: usable.length ? (usable.length === parts.length ? 'modeled' : 'modeled_with_missing_components') : 'unavailable',
    scale: 'component-percentile-25-99', components: ratings,
    missing: COMPOSITE_FORGE_COMPONENTS.filter(spec => !usable.some(part => part.component === spec.key)).map(spec => spec.key),
    inputEvidence, notObserved: true, purpose: 'game-style component tuning',
    note: 'These are transparent per-component cohort-percentile tuning aids. No aggregate overall grade is produced.' };
}

function positionFamily(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'g' || normalized.includes('guard') || normalized === 'pg' || normalized === 'sg') return 'G';
  if (normalized === 'f' || normalized.includes('forward') || normalized === 'sf' || normalized === 'pf') return 'F';
  if (normalized === 'c' || normalized.includes('center') || normalized === 'big') return 'C';
  return null;
}

function componentForRequirement(components, requirement, syntheticStatistics = null) {
  const component = components.find(item => item.key === requirement.key);
  if (!component || component.status === 'unavailable' || !finite(component.value)) return null;
  if (requirement.metric && component.metric !== requirement.metric) return null;
  const output = Object.entries(COMPOSITE_FORGE_OUTPUTS)
    .find(([, spec]) => spec.component === component.key && spec.metric === component.metric);
  const modeled = output ? syntheticStatistics?.values?.[output[0]]?.value : null;
  return finite(modeled) ? modeled : component.value;
}

function roleFamiliesForProfiles(profiles) {
  return [...new Set((Array.isArray(profiles) ? profiles : [])
    .flatMap(profile => (Array.isArray(profile?.positions) ? profile.positions : [])
      .map(positionFamily).filter(Boolean)))];
}

function requirementRoleEvidence(recipe, requirement, profiles, allowedFamilies) {
  const options = requirement.any || [requirement];
  return options.map(option => {
    const donorKeys = new Set(recipe?.components?.[option.key]?.donors
      ?.map(donor => donor.profileKey).filter(Boolean) || []);
    const donors = (Array.isArray(profiles) ? profiles : [])
      .filter(profile => donorKeys.has(profileKey(profile)));
    const roleFamilies = roleFamiliesForProfiles(donors);
    const supportedFamilies = roleFamilies.filter(family => allowedFamilies.has(family));
    return {
      component: option.key,
      donorCount: donors.length,
      roleFamilies,
      supportedFamilies,
      status: supportedFamilies.length ? 'supported' : roleFamilies.length ? 'unsupported' : 'unknown',
    };
  });
}

function cohortRelationship(cohortProfiles, leftMetric, rightMetric, syntheticLeft, syntheticRight) {
  const stats = weightedPairStats(cohortProfiles, leftMetric, rightMetric);
  if (!stats || stats.sample < COMPOSITE_FORGE_LIMITS.minCohortRows) {
    return { status: 'unavailable', sample: stats?.sample || 0, effectiveWeight: stats?.effectiveWeight ? round(stats.effectiveWeight) : 0,
      leftMetric, rightMetric, observedCorrelation: null, syntheticZ: { left: null, right: null }, relationship: 'insufficient-cohort' };
  }
  const { sample, effectiveWeight, leftMean, rightMean, correlation } = stats;
  const leftSd = stats.leftStandardDeviation;
  const rightSd = stats.rightStandardDeviation;
  const syntheticZ = { left: finite(syntheticLeft) && finite(leftSd) && leftSd > 0 ? round((syntheticLeft - leftMean) / leftSd) : null,
    right: finite(syntheticRight) && finite(rightSd) && rightSd > 0 ? round((syntheticRight - rightMean) / rightSd) : null };
  const expectedSign = correlation === null || Math.abs(correlation) < 0.2 ? 'neutral' : correlation > 0 ? 'positive' : 'negative';
  const product = finite(syntheticZ.left) && finite(syntheticZ.right) ? syntheticZ.left * syntheticZ.right : null;
  const relationship = product === null || expectedSign === 'neutral' ? 'within-cohort-pattern'
    : expectedSign === 'positive' && product < -0.25 ? 'counter-trend'
      : expectedSign === 'negative' && product > 0.25 ? 'counter-trend' : 'within-cohort-pattern';
  return { status: 'available', sample, effectiveWeight: round(effectiveWeight), weighting: stats.weighting,
    leftMetric, rightMetric, observedCorrelation: round(correlation), expectedSign, syntheticZ, relationship,
    note: 'Relationship diagnostics compare the synthetic component location with the selected cohort; they do not create an overall grade.' };
}

/**
 * Validate the builder as a role-and-skill profile rather than a bag of
 * unrelated donor statistics. This is intentionally inspectable: every check
 * tells the caller which archetype, role family, and component relationship
 * accepted or blocked the synthetic player.
 */
export function validateCompositeCoherence({ recipe, components = [], profiles = [], cohortProfiles = profiles, syntheticStatistics = null } = {}) {
  const archetypeKey = recipe?.archetype?.key || 'balanced';
  const archetypeEntry = Object.values(COMPOSITE_ARCHETYPES).find(spec => spec.key === archetypeKey) || COMPOSITE_ARCHETYPES.balanced;
  const roleProfiles = roleRelevantProfiles(recipe, profiles);
  const donorFamilies = [...new Set(roleProfiles.flatMap(profile => (profile.positions || []).map(positionFamily).filter(Boolean)))];
  const requestedFamilies = (recipe?.placement?.positions || []).map(positionFamily).filter(Boolean);
  const resolvedFamilies = requestedFamilies.length ? requestedFamilies : donorFamilies;
  const issues = [], warnings = [];
  const allowed = new Set(archetypeEntry.positions);
  if (!resolvedFamilies.length) issues.push('coherence: no supported role family is present in the selected donor set.');
  if (resolvedFamilies.length && resolvedFamilies.every(family => !allowed.has(family))) {
    issues.push(`coherence: the ${archetypeEntry.label} archetype does not support the selected donor role.`);
  }
  if (requestedFamilies.some(family => !allowed.has(family))) {
    issues.push(`coherence: the requested placement position is outside the ${archetypeEntry.label} archetype.`);
  }
  const checks = [];
  for (const requirement of archetypeEntry.requirements || []) {
    if (requirement.any) {
      const roleEvidence = requirementRoleEvidence(recipe, requirement, profiles, allowed);
      const alternatives = requirement.any.map((option, index) => ({ ...option,
        value: componentForRequirement(components, option, syntheticStatistics), role: roleEvidence[index],
      }));
      const passed = alternatives.some(option => finite(option.value) && option.value >= option.minimum && option.role.status === 'supported');
      checks.push({ type: 'any', components: alternatives.map(option => option.key), passed,
        values: alternatives.map(option => ({ component: option.key, metric: option.metric || null,
          value: finite(option.value) ? round(option.value) : null, minimum: option.minimum,
          role: option.role })) });
      if (!passed) {
        const thresholdPasses = alternatives.filter(option => finite(option.value) && option.value >= option.minimum);
        const unsupported = thresholdPasses.filter(option => option.role.status === 'unsupported');
        const unknown = thresholdPasses.filter(option => option.role.status === 'unknown');
        if (unsupported.length) {
          issues.push(`coherence: ${archetypeEntry.label} has threshold evidence, but its selected donor role does not support the requested ${alternatives.map(option => option.metric || option.key).join(' or ')}.`);
        } else if (unknown.length) {
          warnings.push(`coherence: ${archetypeEntry.label} has threshold evidence, but donor position evidence is unavailable for ${unknown.map(option => option.key).join(' or ')}.`);
        } else {
          const hasEvidence = alternatives.some(option => finite(option.value));
          (hasEvidence ? issues : warnings).push(`coherence: ${archetypeEntry.label} needs one of ${alternatives.map(option => option.metric || option.key).join(' or ')} at the declared minimum.`);
        }
      }
      continue;
    }
    const role = requirementRoleEvidence(recipe, requirement, profiles, allowed)[0];
    const value = componentForRequirement(components, requirement, syntheticStatistics);
    const thresholdPassed = finite(value) && value >= requirement.minimum;
    const passed = thresholdPassed && role.status === 'supported';
    checks.push({ type: 'minimum', component: requirement.key, metric: requirement.metric || null,
      value: finite(value) ? round(value) : null, minimum: requirement.minimum, passed, role });
    if (!thresholdPassed) {
      (finite(value) ? issues : warnings).push(`coherence: ${archetypeEntry.label} needs ${requirement.metric || requirement.key} at or above ${requirement.minimum}.`);
    } else if (role.status === 'unsupported') {
      issues.push(`coherence: ${archetypeEntry.label} has ${requirement.metric || requirement.key} threshold evidence, but its selected donor role does not support the requested archetype.`);
    } else if (role.status === 'unknown') {
      warnings.push(`coherence: ${archetypeEntry.label} has ${requirement.metric || requirement.key} threshold evidence, but donor position evidence is unavailable.`);
    }
  }
  const workload = components.find(item => item.key === 'workload' && item.metric === 'minutesPerGame');
  if (finite(workload?.value) && workload.value > 42) warnings.push('coherence: workload exceeds 42 minutes per game; the profile is retained but its role fit is a high-load assumption.');
  const componentValue = (key, metric) => {
    const output = Object.entries(COMPOSITE_FORGE_OUTPUTS).find(([, entry]) => entry.component === key && entry.metric === metric);
    const synthesized = output ? syntheticStatistics?.values?.[output[0]]?.value : null;
    return finite(synthesized) ? synthesized : components.find(item => item.key === key && item.metric === metric)?.value ?? null;
  };
  const relationships = [
    ['points', 'involvementPer36', 'scoring', 'creation'],
    ['points', 'assists', 'scoring', 'playmaking'],
    ['rebounds', 'blocks', 'rebounding', 'defensiveActivity'],
    ['threePointFrequency', 'trueShootingPercentage', 'shooting', 'efficiency'],
  ].map(([leftMetric, rightMetric, leftKey, rightKey]) => ({
    leftKey, rightKey, ...cohortRelationship(cohortProfiles, leftMetric, rightMetric, componentValue(leftKey, leftMetric), componentValue(rightKey, rightMetric)),
  }));
  const counterTrendRelationships = relationships.filter(row => row.relationship === 'counter-trend');
  if (counterTrendRelationships.length) warnings.push(`coherence: ${counterTrendRelationships.length} selected component relationship${counterTrendRelationships.length === 1 ? '' : 's'} run counter to the selected cohort pattern; inspect sensitivity before simulation.`);
  const status = issues.length ? 'incoherent' : warnings.length ? 'supported_with_caveats' : 'supported';
  return {
    status, archetype: archetypeEntry.key, archetypeLabel: archetypeEntry.label,
    allowedPositions: [...archetypeEntry.positions], donorRoleFamilies: donorFamilies,
    resolvedRoleFamilies: resolvedFamilies, checks, relationships, issues, warnings,
    note: status === 'incoherent' ? 'The selected donors cannot form the requested role-and-skill profile without extrapolation.' : archetypeEntry.note,
  };
}

function modeledComponentValue(component, syntheticStatistics) {
  if (!component) return null;
  const output = Object.entries(COMPOSITE_FORGE_OUTPUTS).find(([, spec]) => spec.component === component.key && spec.metric === component.metric);
  const value = output ? syntheticStatistics?.values?.[output[0]]?.value : null;
  return finite(value) ? value : null;
}

function modeledComponentOutput(component, syntheticStatistics) {
  if (!component) return null;
  const output = Object.entries(COMPOSITE_FORGE_OUTPUTS).find(([, spec]) => spec.component === component.key && spec.metric === component.metric);
  return output ? syntheticStatistics?.values?.[output[0]] || null : null;
}

function modeledComponentValueSource(component, syntheticStatistics) {
  const output = modeledComponentOutput(component, syntheticStatistics);
  if (!finite(output?.value)) return 'component-donor-blend';
  if (output.derivation?.status === 'derived') return 'synthetic-derived-output';
  if (output.workloadAdjustment?.status) return 'synthetic-workload-constrained-output';
  if (output.relationshipSynthesis?.status === 'applied') return 'synthetic-relationship-adjusted-output';
  return 'synthetic-output';
}

function modeledComponentReliability(component, syntheticStatistics) {
  const reliability = modeledComponentOutput(component, syntheticStatistics)?.uncertainty?.reliability;
  return finite(reliability) ? clamp(reliability, 0, 1) : componentEvidenceReliability(component);
}

function syntheticQualities(components, cohort, syntheticStatistics = null) {
  const qualities = components.filter(component => finite(component.value) && component.status !== 'unavailable').map(component => {
    const modeledValue = modeledComponentValue(component, syntheticStatistics);
    const value = modeledValue ?? component.value;
    const valueSource = modeledComponentValueSource(component, syntheticStatistics);
    const percentile = empiricalPercentile(cohort, component.metric, value, METRIC_DEFINITIONS[component.metric]?.direction || 1);
    const band = percentile === null ? 'unresolved'
      : percentile >= 0.8 ? 'standout-in-selected-cohort'
        : percentile >= 0.6 ? 'above-selected-cohort'
          : percentile >= 0.4 ? 'typical-selected-cohort' : 'below-selected-cohort';
    return { component: component.key, label: component.label, metric: component.metric, value: round(value), donorBlendValue: component.value,
      valueSource,
      cohortPercentile: percentile === null ? null : round(percentile), band,
      note: 'A selected-cohort trait location, not an observed player attribute or universal rating.' };
  });
  return qualities.sort((left, right) => (right.cohortPercentile ?? -1) - (left.cohortPercentile ?? -1) || left.component.localeCompare(right.component));
}

function buildPlayerProfile(recipe, components, coherence, cohort, syntheticStatistics) {
  // The profile identity contains every current stat-line input, but no team
  // placement or placement seed. The same modeled player therefore keeps its
  // identity when assigned to a different team or placement scenario.
  const profileFingerprint = hashText(stableJson({ identityContract: 'composite-profile-identity-v1',
    modelVersion: recipe.modelVersion, recipeVersion: recipe.version, package: recipe.packageRef,
    cohort: recipe.cohortRef, phase: recipe.phase, components: recipe.components,
    weights: recipe.componentWeights, archetype: recipe.archetype, normalization: recipe.normalization }));
  const syntheticId = `forge-${profileFingerprint}`;
  const rawSkillVector = Object.fromEntries(components.map(component => [component.key, component.value]));
  const skillVector = Object.fromEntries(components.map(component => [component.key, modeledComponentValue(component, syntheticStatistics) ?? component.value]));
  const rawMetrics = Object.fromEntries(components.map(component => [component.metric, component.value]));
  const modeledMetrics = Object.fromEntries(components.map(component => [component.metric, modeledComponentValue(component, syntheticStatistics) ?? component.value]));
  return {
    status: coherence.status === 'incoherent' ? 'unavailable' : 'modeled',
    syntheticId,
    profileFingerprint,
    identity: { kind: 'synthetic-player', profileFingerprint, reproducible: true,
      note: 'This identity names the stat-line profile and is independent of team placement; it is not a real player identity.' },
    archetype: coherence.archetype,
    roleFamilies: coherence.resolvedRoleFamilies,
    skillVector,
    rawSkillVector,
    metrics: modeledMetrics,
    rawMetrics,
    workload: modeledComponentValue(components.find(component => component.key === 'workload'), syntheticStatistics)
      ?? components.find(component => component.key === 'workload')?.value ?? null,
    qualities: syntheticQualities(components, cohort, syntheticStatistics),
    tendencies: syntheticStatistics?.tendencies || [],
    uncertainty: syntheticStatistics?.uncertainty || { status: 'unavailable', ranges: [], note: 'No modeled output ranges are available.' },
    uniqueness: syntheticStatistics?.uniqueness || { status: 'unavailable', distinctDonorCount: 0, changedOutputs: [], preservedOutputs: [] },
    roleFit: { status: coherence.status, archetype: coherence.archetype, roleFamilies: coherence.resolvedRoleFamilies,
      checks: coherence.checks, relationships: coherence.relationships },
    skillInteractions: coherence.relationships,
    modeledLine: syntheticStatistics ? {
      perGame: { ...syntheticStatistics.perGame },
      workload: { ...syntheticStatistics.workload },
      tendencies: [...(syntheticStatistics.tendencies || [])],
      uncertainty: syntheticStatistics.uncertainty || null,
      uniqueness: syntheticStatistics.uniqueness || null,
      method: syntheticStatistics.method,
    } : null,
    interactionChecks: coherence.checks,
    note: 'This is one reproducible, role-constrained synthetic player with donor provenance, exposure-aware component ratings, cohort-relative qualities, and a workload-constrained modeled line. It is not an observed player, universal overall grade, or calibrated forecast.',
  };
}

function compareOutputEvidence(before, after) {
  const beforeValues = before?.values || {}, afterValues = after?.values || {};
  return Object.keys(COMPOSITE_FORGE_OUTPUTS).map(key => {
    const left = beforeValues[key]?.uncertainty || {};
    const right = afterValues[key]?.uncertainty || {};
    const change = {
      key,
      beforeSampleRows: integer(left.sample, 0) ? left.sample : null,
      afterSampleRows: integer(right.sample, 0) ? right.sample : null,
      beforeIndependentDonorCount: integer(left.independentDonorCount, 0) ? left.independentDonorCount : null,
      afterIndependentDonorCount: integer(right.independentDonorCount, 0) ? right.independentDonorCount : null,
      beforeEffectiveIndependentSamples: finite(left.effectiveIndependentSamples) ? round(left.effectiveIndependentSamples) : null,
      afterEffectiveIndependentSamples: finite(right.effectiveIndependentSamples) ? round(right.effectiveIndependentSamples) : null,
      beforeEffectiveExposure: finite(left.effectiveExposure) ? round(left.effectiveExposure) : null,
      afterEffectiveExposure: finite(right.effectiveExposure) ? round(right.effectiveExposure) : null,
      beforeReliability: finite(left.reliability) ? round(left.reliability) : null,
      afterReliability: finite(right.reliability) ? round(right.reliability) : null,
    };
    const fields = Object.keys(change).filter(field => field !== 'key');
    return fields.some(field => change[`before${field.slice(5)}`] !== change[`after${field.slice(5)}`]) ? change : null;
  }).filter(Boolean);
}

function compareDerivedOutputs(before, after) {
  const beforeValues = before?.values || {}, afterValues = after?.values || {};
  return Object.keys(COMPOSITE_FORGE_OUTPUTS).map(key => ({ key, before: beforeValues[key]?.value ?? null, after: afterValues[key]?.value ?? null,
    change: finite(beforeValues[key]?.value) && finite(afterValues[key]?.value) ? round(afterValues[key].value - beforeValues[key].value) : null }));
}

function compareComponentRatings(before, after) {
  const left = Array.isArray(before?.components) ? before.components : [];
  const right = Array.isArray(after?.components) ? after.components : [];
  const keys = [...new Set([...left.map(item => item.component), ...right.map(item => item.component)])].filter(Boolean).sort();
  return keys.map(component => {
    const previous = left.find(item => item.component === component)?.rating;
    const next = right.find(item => item.component === component)?.rating;
    return { component, before: finite(previous) ? previous : null, after: finite(next) ? next : null,
      change: finite(previous) && finite(next) ? next - previous : null };
  });
}

function buildCore(input, { includeSensitivity = true } = {}) {
  const cohort = Array.isArray(input.cohort) ? { id: 'selected-cohort', profiles: input.cohort } : input.cohort;
  const recipe = input.recipe ? createCompositeForgeRecipe({ ...input.recipe, packageRef: input.recipe.packageRef || input.packageRef, cohort })
    : createCompositeForgeRecipe({ ...input, cohort });
  validateCompositeForgeCohort(cohort, recipe.packageRef);
  const byKey = new Map(cohort.profiles.map(profile => [profileKey(profile), profile]));
  const bands = workloadBands(cohort.profiles);
  const issues = [], warnings = [];
  const components = COMPOSITE_FORGE_COMPONENTS.map(spec => componentResult(recipe, { ...recipe.components[spec.key], key: spec.key }, cohort, byKey, bands, issues, warnings));
  const selected = selectedProfiles(recipe, cohort);
  const stateEvidence = donorStateEvidence(selected);
  if (stateEvidence.status === 'conflict') {
    warnings.push(`state: ${stateEvidence.conflictCount} selected donor${stateEvidence.conflictCount === 1 ? '' : 's'} has conflicting age or experience evidence; simulation readiness is withheld.`);
  }
  const phases = [...new Set(selected.map(profile => profile.phase).filter(Boolean))];
  const selectedPhase = phases.length === 1 ? phases[0] : null;
  if (phases.length > 1) issues.push('Donor phases must match; Composite Forge will not blend regular-season and postseason rows.');
  if (recipe.phase && phases.some(phase => phase !== recipe.phase)) issues.push('A selected donor phase differs from the recipe phase.');
  const role = roleFit(recipe, cohort, selected);
  if (role.status === 'unresolved') warnings.push('The donor set does not establish a shared supported role.');
  const placement = resolvePlacement(recipe, cohort);
  if (placement.status === 'invalid') issues.push('The selected Composite Forge placement is outside its declared team pool.');
  const rawSyntheticStatistics = buildSyntheticStatistics(recipe, cohort, byKey, bands, components);
  const inputEvidence = buildInputEvidenceSummary(components, rawSyntheticStatistics);
  const syntheticStatistics = { ...rawSyntheticStatistics, inputEvidence };
  if (syntheticStatistics.relationshipFallbackOutputs.length) {
    warnings.push(`relationships: Cross-skill relationship support is unavailable for ${syntheticStatistics.relationshipFallbackOutputs.join(', ')}; direct donor blends are retained with the limitation disclosed.`);
  }
  if (syntheticStatistics.trueShootingDerivation?.status === 'blocked') {
    issues.push(`efficiency: synthetic true-shooting identity was blocked: ${syntheticStatistics.trueShootingDerivation.reason}`);
  }
  if (inputEvidence.status === 'limited') {
    warnings.push('evidence: donor exposure support is limited; simulation readiness is withheld.');
  } else if (inputEvidence.status === 'unavailable') {
    warnings.push('evidence: donor exposure support is unavailable; simulation readiness is withheld.');
  } else if (inputEvidence.status === 'moderate' && finite(inputEvidence.donorReliability) && inputEvidence.donorReliability < 0.9) {
    warnings.push('evidence: donor exposure support is moderate; simulation readiness is withheld until all selected components have strong exposure support.');
  }
  if (syntheticStatistics.uniqueness?.status === 'not-unique') {
    warnings.push('uniqueness: multiple donor identities were selected, but no supported modeled adjustment changed the displayed outputs.');
  }
  if (syntheticStatistics.boundedWorkloadOutputs.length) {
    issues.push(`workload: ${syntheticStatistics.boundedWorkloadOutputs.join(', ')} would require volume transfer beyond the 0.50–1.50× evidence bound.`);
  }
  if (syntheticStatistics.unavailableWorkloadOutputs.length) {
    warnings.push(`workload: paired minutes evidence is unavailable for ${syntheticStatistics.unavailableWorkloadOutputs.join(', ')}; donor-blend volume remains unadjusted and simulation readiness is withheld.`);
  }
  const missingSyntheticOutputs = [...syntheticStatistics.missing];
  if (missingSyntheticOutputs.length) {
    warnings.push(`outputs: synthetic statistics are unavailable for ${missingSyntheticOutputs.join(', ')}; simulation readiness is withheld.`);
  }
  const teamFit = teamFitChange(placement, components, cohort, syntheticStatistics);
  const gameRating = buildGameRating(recipe, cohort, components, inputEvidence, syntheticStatistics);
  const coherence = validateCompositeCoherence({ recipe, components, profiles: selected, cohortProfiles: cohort.profiles, syntheticStatistics });
  coherence.issues.forEach(issue => issues.push(issue));
  coherence.warnings.forEach(warning => warnings.push(warning));
  const playerProfile = buildPlayerProfile(recipe, components, coherence, cohort, syntheticStatistics);
  const missingComponents = components.filter(component => component.status === 'unassigned' || component.status === 'unavailable').map(component => component.key);
  const selectedComponents = components.filter(component => component.status !== 'unassigned');
  const selectedComponentCount = selectedComponents.length;
  const totalComponentCount = components.length;
  const supportedSelectedComponents = selectedComponents.filter(component => finite(component.value)
    && ['observed', 'complete_with_caveats'].includes(component.status)
    && Array.isArray(component.donorContributions) && component.donorContributions.length > 0
    && component.donorContributions.every(donor => donor.status !== 'unavailable' && finite(donor.rawValue)));
  const hasFiniteSyntheticOutput = Object.values(syntheticStatistics.values).some(value => finite(value?.value));
  const outputReady = issues.length === 0 && selectedComponentCount > 0
    && supportedSelectedComponents.length === selectedComponentCount
    && playerProfile.status === 'modeled' && hasFiniteSyntheticOutput;
  const outputStatus = !outputReady ? 'unavailable'
    : selectedComponentCount < totalComponentCount || missingSyntheticOutputs.length ? 'partial' : 'ready';
  const allObserved = components.every(component => ['observed', 'complete_with_caveats'].includes(component.status));
  const allDonorsObserved = components.every(component => component.donorContributions.every(donor => donor.status === 'observed'));
  const blockingWarnings = warnings.filter(warning => !warning.includes('z-score extrapolation limit')
    && !warning.startsWith('relationships: Cross-skill relationship support is unavailable'));
  const simulationReady = issues.length === 0 && blockingWarnings.length === 0 && missingComponents.length === 0 && allObserved && allDonorsObserved
    && missingSyntheticOutputs.length === 0 && role.status === 'supported' && ['supported'].includes(coherence.status);
  if (missingComponents.length) {
    warnings.push(`components: ${missingComponents.length} of ${totalComponentCount} traits are unassigned or unavailable; their values remain unavailable and full simulation readiness is withheld.`);
  }
  // Keep full-recipe validation separate from partial-output availability:
  // only simulationReady opens simulation, while outputReady reports whether
  // the selected, observed components support any honest synthetic output.
  const validation = { status: issues.length ? 'invalid' : missingComponents.length ? 'incomplete' : warnings.length ? 'complete_with_caveats' : 'complete',
    issues, warnings, missingComponents, missingSyntheticOutputs, outputReady, outputStatus,
    selectedComponentCount, totalComponentCount, simulationReady, stateEvidence, extrapolation: { maxZ: recipe.normalization.maxZ,
      status: issues.some(issue => issue.includes('volume transfer beyond')) ? 'blocked'
        : warnings.some(warning => warning.includes('z-score extrapolation limit')) ? 'out-of-range-caveat'
          : 'within-limit-or-unavailable' },
    coherence: { ...coherence, role: role.status, phase: recipe.phase || selectedPhase || 'unresolved',
      workload: role.workloadMinutesPerGame ? 'observed-range' : 'unavailable' } };
  const recipeHash = hashText(stableJson(recipe));
  const scenarioId = `forge-scenario-${recipeHash}`;
  const result = { status: validation.status, modelVersion: COMPOSITE_FORGE_MODEL_VERSION, recipeHash, scenarioId, recipe,
    placementSeed: recipe.placementSeed, simulationSeed: null,
    package: recipe.packageRef, cohort: recipe.cohortRef, phase: recipe.phase || selectedPhase || null, components,
    interpretation: COMPOSITE_FORGE_INTERPRETATION,
    componentWeights: recipe.componentWeights, donorProvenance: components.flatMap(component => component.provenance), roleFit: role,
    placement, teamFitChange: teamFit, syntheticStatistics, gameRating, playerProfile, sensitivity: null, validation,
    simulatedDistributions: { status: 'unavailable', simulationSeed: null,
      reason: 'No registered seeded Composite Forge simulation runner is available; no simulation seed has been assigned.' },
     note: 'The recipe builds one reproducible synthetic player from named player-season skill components. Its line is cohort-relationship and workload constrained rather than a copied donor stat row. It includes a transparent game-style rating aid; it does not produce a fake overall grade, RAPM value, chemistry effect, availability model, or forecast.' };
  if (includeSensitivity) result.sensitivity = analyzeCompositeForgeSensitivity(input, { baseResult: result });
  return result;
}

export function analyzeCompositeForgeSensitivity(input, { baseResult = null, delta = 0.1 } = {}) {
  if (!finite(delta) || delta <= 0 || delta >= 0.5) fail('Composite Forge sensitivity delta must be between zero and one half.');
  const cohortProfiles = Array.isArray(input?.cohort) ? input.cohort : input?.cohort?.profiles;
  if (Array.isArray(cohortProfiles) && cohortProfiles.length > COMPOSITE_FORGE_LIMITS.maxSensitivityProfiles) {
    return { status: 'unavailable', method: 'one-component-weight-and-donor-leave-one-out-v4-independent-support', delta,
      componentWeightChanges: [], donorChanges: [],
      note: `Sensitivity analysis is not run above ${COMPOSITE_FORGE_LIMITS.maxSensitivityProfiles.toLocaleString()} player-season rows because each comparison repeats a full cohort build.` };
  }
  const base = baseResult || buildCore(input, { includeSensitivity: false });
  const selected = COMPOSITE_FORGE_COMPONENTS.filter(spec => base.recipe.components[spec.key].donors.length && base.componentWeights[spec.key] > 0);
  const componentWeightChanges = [];
  for (const spec of selected) {
    const others = selected.filter(candidate => candidate.key !== spec.key);
    if (!others.length) continue;
    for (const direction of ['up', 'down']) {
      const current = base.recipe.componentWeights[spec.key];
      const target = clamp(current + (direction === 'up' ? delta : -delta), 0.001, 0.95);
      const remaining = 1 - target, otherTotal = others.reduce((sum, candidate) => sum + base.recipe.componentWeights[candidate.key], 0);
      const weights = { ...base.recipe.componentWeights, [spec.key]: target };
      others.forEach(candidate => { weights[candidate.key] = otherTotal > 0 ? base.recipe.componentWeights[candidate.key] / otherTotal * remaining : remaining / others.length; });
      const next = buildCore({ ...input, recipe: { ...base.recipe, componentWeights: weights } }, { includeSensitivity: false });
      componentWeightChanges.push({ component: spec.key, direction, from: current, to: round(target), changes: compareComponentValues(base.components, next.components),
        derivedChanges: compareDerivedOutputs(base.syntheticStatistics, next.syntheticStatistics),
        evidenceChanges: compareOutputEvidence(base.syntheticStatistics, next.syntheticStatistics),
        componentRatingChanges: compareComponentRatings(base.gameRating, next.gameRating) });
    }
  }
  const donorChanges = [];
  for (const spec of COMPOSITE_FORGE_COMPONENTS) {
    const donors = base.recipe.components[spec.key].donors;
    if (donors.length < 2) continue;
    for (const donor of donors) {
      const remaining = donors.filter(candidate => candidate.profileKey !== donor.profileKey);
      const total = remaining.reduce((sum, candidate) => sum + candidate.weight, 0);
      const adjusted = remaining.map(candidate => ({ ...candidate, weight: round(candidate.weight / total) }));
      const components = { ...base.recipe.components, [spec.key]: { ...base.recipe.components[spec.key], donors: adjusted } };
      const next = buildCore({ ...input, recipe: { ...base.recipe, components } }, { includeSensitivity: false });
      donorChanges.push({ component: spec.key, removedDonor: donor.profileKey, changes: compareComponentValues(base.components, next.components),
        derivedChanges: compareDerivedOutputs(base.syntheticStatistics, next.syntheticStatistics),
        evidenceChanges: compareOutputEvidence(base.syntheticStatistics, next.syntheticStatistics),
        componentRatingChanges: compareComponentRatings(base.gameRating, next.gameRating) });
    }
  }
  return { status: 'complete', method: 'one-component-weight-and-donor-leave-one-out-v4-independent-support', delta, componentWeightChanges, donorChanges,
     note: 'Sensitivity shows component values, synthetic statistics, denominator-weighted independent-player support, and per-component tuning changes when weights or donors move. It is not a universal grade or forecast.' };
}

function compareComponentValues(before, after) {
  return before.map(component => {
    const next = after.find(candidate => candidate.key === component.key);
    return { component: component.key, rawChange: component.value !== null && next?.value !== null ? round(next.value - component.value) : null,
      normalizedChange: component.normalizedValue !== null && next?.normalizedValue !== null ? round(next.normalizedValue - component.normalizedValue) : null,
      before: component.value, after: next?.value ?? null };
  });
}

export function buildCompositeForge(input = {}, options = {}) {
  if (!object(input)) fail('Composite Forge input must be an object.');
  return buildCore(input, options);
}

/**
 * Validate the browser's explicit published-package selection before rows are
 * adapted into a Forge cohort. Exact packages always bind one season. A
 * pooled package is never inferred from a season selector: the caller must
 * explicitly accept the pooled scope and list the seasons being used.
 */
export function validatePublicCompositeForgeSelection(packageRef, selection = {}) {
  if (!object(selection) || !Array.isArray(selection.seasonStartYears) || !selection.seasonStartYears.length) {
    fail('Composite Forge needs an explicit package season selection.');
  }
  const scope = packageRef?.scope;
  if (!object(scope) || !PACKAGE_KINDS.has(scope.kind)) fail('Composite Forge package scope is unavailable.');
  if (!Array.isArray(scope.seasonStartYears) || !scope.seasonStartYears.length
    || scope.seasonStartYears.some(year => !integer(Number(year), 1947, 2200))) {
    fail('Composite Forge package seasons are unavailable or malformed.');
  }
  const years = selection.seasonStartYears.map(Number);
  if (years.some(year => !integer(year, 1947, 2200)) || new Set(years).size !== years.length) {
    fail('Composite Forge package seasons must be distinct whole years.');
  }
  const orderedYears = [...years].sort((left, right) => left - right);
  if (orderedYears.some((year, index) => !scope.seasonStartYears.includes(year) || index > 0 && year <= orderedYears[index - 1])) {
    fail('Composite Forge package season selection escapes its published scope.');
  }
  if (scope.kind === 'exact-season' && (orderedYears.length !== 1 || orderedYears[0] !== scope.seasonStartYears[0])) {
    fail('An exact Composite Forge package requires its one published season explicitly.');
  }
  if (scope.kind === 'pooled-window' && selection.acceptedPooledPackage !== true) {
    fail('Cross-season Composite Forge work requires explicit acceptance of the pooled package.');
  }
  const phase = text(selection.phase, 40);
  if (!phase || !scope.phases.includes(phase)) fail('Composite Forge needs an explicit phase inside the package scope.');
  const teams = selection.teamCodes === undefined || selection.teamCodes === null ? null
    : (Array.isArray(selection.teamCodes) ? selection.teamCodes : [selection.teamCodes]);
  if (teams?.some(team => !/^[A-Z]{3}$/.test(String(team).trim().toUpperCase()))) {
    fail('Composite Forge team selection contains an invalid team.');
  }
  return Object.freeze({ seasonStartYears: Object.freeze(orderedYears), phase, teamCodes: teams
    ? Object.freeze([...new Set(teams.map(team => String(team).trim().toUpperCase()))]) : null,
    acceptedPooledPackage: scope.kind === 'pooled-window' });
}

function publicRecipe(recipe) {
  if (!object(recipe)) return null;
  const components = Object.fromEntries(COMPOSITE_FORGE_COMPONENTS.map(spec => {
    const component = recipe.components?.[spec.key];
    return [spec.key, {
      metric: component?.metric || null,
      // A browser receipt can show the donor provenance beside each skill,
      // but it must not expose the native profile join key needed to replay
      // the private cohort.
      donors: Array.isArray(component?.donors)
        ? component.donors.map(donor => ({
          weight: donor?.weight ?? null,
          ...(donor?.sourcePackage ? { sourcePackage: publicDonorSourcePackage(donor.sourcePackage) } : {}),
        })) : [],
    }];
  }));
  return {
    version: recipe.version,
    kind: recipe.kind,
    modelVersion: recipe.modelVersion,
    packageRef: publicPackageRef(recipe.packageRef),
    cohortRef: recipe.cohortRef ? { scope: publicPackageRef({ scope: recipe.cohortRef.scope })?.scope || null } : null,
    phase: recipe.phase || null,
    archetype: stripCompositeJoinHandles(recipe.archetype),
    componentWeights: recipe.componentWeights || null,
    components,
    normalization: recipe.normalization || null,
    placement: stripCompositeJoinHandles(recipe.placement),
    placementSeed: recipe.placementSeed || null,
  };
}

/**
 * Convert a full internal Forge result into the public browser receipt. The
 * recipe remains available to the local save/replay path, while the displayed
 * receipt omits provider/native join handles such as playerId/profileKey.
 */
export function buildPublicCompositeForgeReceipt(result, { includeRecipe = false } = {}) {
  if (!object(result)) return { version: COMPOSITE_FORGE_PUBLIC_RECEIPT_VERSION, status: 'unavailable', reason: 'Composite Forge result is unavailable.' };
  const safeComponents = Array.isArray(result.components) ? result.components.map(component => ({
    key: component.key, label: component.label, metric: component.metric, unit: component.unit,
    value: component.value, rawValue: component.rawValue, normalizedValue: component.normalizedValue,
    weight: component.weight, status: component.status, supportedRange: component.supportedRange,
    donorContributions: Array.isArray(component.donorContributions) ? component.donorContributions.map(publicDonor) : [],
    provenance: Array.isArray(component.provenance) ? component.provenance.map(publicDonor) : [],
    warnings: component.warnings || [], note: component.note,
  })) : [];
  const receipt = {
    version: COMPOSITE_FORGE_PUBLIC_RECEIPT_VERSION,
    status: result.status,
    modelVersion: result.modelVersion,
    interpretation: result.interpretation || COMPOSITE_FORGE_INTERPRETATION,
    recipeHash: result.recipeHash || null,
    scenarioId: result.scenarioId || null,
    placementSeed: result.placementSeed || null,
    simulationSeed: result.simulationSeed || null,
    package: publicPackageRef(result.package),
    cohort: result.cohort ? { scope: result.cohort.scope || null } : null,
    phase: result.phase || null,
    components: safeComponents,
    componentWeights: result.componentWeights || null,
    donorProvenance: safeComponents.flatMap(component => component.provenance || []),
    roleFit: stripCompositeJoinHandles(result.roleFit),
    placement: result.placement ? { status: result.placement.status, mode: result.placement.mode, team: result.placement.team || null,
      placementSeed: result.placement.placementSeed || null,
      candidateTeams: result.placement.candidateTeams || [], selectionHash: result.placement.selectionHash || null, reproducible: result.placement.reproducible === true } : null,
    teamFitChange: stripCompositeJoinHandles(result.teamFitChange),
    playerProfile: stripCompositeJoinHandles(result.playerProfile),
    syntheticStatistics: stripCompositeJoinHandles(result.syntheticStatistics),
    gameRating: stripCompositeJoinHandles(result.gameRating),
    sensitivity: publicSensitivity(result.sensitivity),
    validation: publicValidation(result.validation),
    simulatedDistributions: result.simulatedDistributions
      ? { status: result.simulatedDistributions.status || 'unavailable',
        distributions: Array.isArray(result.simulatedDistributions.distributions)
          ? stripCompositeJoinHandles(result.simulatedDistributions.distributions) : [],
        simulationSeed: result.simulatedDistributions.simulationSeed || null,
        note: result.simulatedDistributions.note || null,
        reason: result.simulatedDistributions.reason || null }
      : { status: 'unavailable', simulationSeed: null, reason: 'No registered seeded simulation runner is available.' },
    note: 'This public receipt contains observed donor components and provenance plus clearly modeled synthetic statistics and a game-style rating aid. It does not expose provider IDs or present the rating as an observed analytical grade.',
  };
  if (includeRecipe) receipt.recipe = publicRecipe(result.recipe);
  return Object.freeze(receipt);
}

export async function runCompositeForgeSimulation(result, { capabilities = {}, runner, signal, simulationSeed } = {}) {
  const available = key => capabilities[key] === true || capabilities[key]?.status === 'available' || capabilities[key]?.available === true;
  const missing = ['compositeSimulation', 'seasonSimulation'].filter(key => !available(key));
  if (missing.length) return { status: 'unavailable', recipeHash: result?.recipeHash || null, scenarioId: result?.scenarioId || null, simulationSeed: null,
    reason: `Composite Forge simulation requires accepted ${missing.join(' and ')} capability${missing.length > 1 ? ' capabilities' : ''}.`, missingCapabilities: missing };
  if (!result?.validation?.simulationReady) return { status: 'unavailable', recipeHash: result?.recipeHash || null, scenarioId: result?.scenarioId || null, simulationSeed: null,
    reason: 'The recipe is not simulation-ready; resolve missing synthetic outputs, donor, denominator, role, phase, and extrapolation issues first.' };
  if (typeof runner !== 'function') return { status: 'unavailable', recipeHash: result.recipeHash, scenarioId: result.scenarioId || null, simulationSeed: null,
    reason: 'No registered seeded season simulation runner was supplied.' };
  if (signal?.aborted) return { status: 'cancelled', recipeHash: result.recipeHash, scenarioId: result.scenarioId || null,
    simulationSeed: null, completedRuns: 0, requestedRuns: 0 };
  const resolvedSimulationSeed = text(simulationSeed, 80);
  if (!resolvedSimulationSeed || !SEED.test(resolvedSimulationSeed)) {
    return { status: 'unavailable', recipeHash: result.recipeHash, scenarioId: result.scenarioId || null, simulationSeed: null,
      reason: 'A seeded Composite Forge simulation runner requires its own explicit simulationSeed.' };
  }
  try {
    const output = await runner({ kind: 'synthetic-player', modelVersion: COMPOSITE_FORGE_MODEL_VERSION,
      recipe: result.recipe, recipeHash: result.recipeHash, scenarioId: result.scenarioId || null,
      components: result.components, placement: result.placement, placementSeed: result.placementSeed || null,
      simulationSeed: resolvedSimulationSeed,
      syntheticPlayer: { syntheticId: result.playerProfile?.syntheticId || null, profile: result.playerProfile || null,
        statistics: result.syntheticStatistics || null, gameRating: result.gameRating || null } }, { signal });
    if (signal?.aborted || output?.status === 'cancelled') return { status: 'cancelled', recipeHash: result.recipeHash,
      scenarioId: result.scenarioId || null, simulationSeed: resolvedSimulationSeed,
      completedRuns: output?.completedRuns || 0, requestedRuns: output?.requestedRuns || 0 };
    if (!object(output) || !Array.isArray(output.distributions)) return { status: 'unavailable', recipeHash: result.recipeHash,
      scenarioId: result.scenarioId || null, simulationSeed: resolvedSimulationSeed,
      reason: 'The season simulation runner did not return bounded simulated distributions.' };
    const safeOutput = { ...output };
    delete safeOutput.seed;
    delete safeOutput.simulationSeed;
    return { ...safeOutput, status: 'complete', recipeHash: result.recipeHash, scenarioId: result.scenarioId || null,
      simulationSeed: resolvedSimulationSeed, modelVersion: COMPOSITE_FORGE_MODEL_VERSION,
        note: 'These distributions require accepted composite and season-simulation capabilities. They are not historical player outcomes.' };
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') return { status: 'cancelled', recipeHash: result.recipeHash,
      scenarioId: result.scenarioId || null, simulationSeed: resolvedSimulationSeed, completedRuns: 0, requestedRuns: 0 };
    return { status: 'unavailable', recipeHash: result.recipeHash, scenarioId: result.scenarioId || null,
      simulationSeed: resolvedSimulationSeed, reason: error?.message || 'Composite simulation failed.' };
  }
}

export function serializeCompositeForgeRecipe(recipe) {
  const serialized = stableJson(recipe);
  if (serialized.length > COMPOSITE_FORGE_LIMITS.maxRecipeBytes) fail('Composite Forge recipe exceeds the bounded save size.');
  return serialized;
}

function validateSavedRecipeShape(recipe) {
  if (!object(recipe) || recipe.version !== COMPOSITE_FORGE_RECIPE_VERSION || recipe.kind !== 'synthetic-player'
    || recipe.modelVersion !== COMPOSITE_FORGE_MODEL_VERSION
    || !Object.prototype.hasOwnProperty.call(recipe, 'placementSeed')
    || Object.prototype.hasOwnProperty.call(recipe, 'seed')) {
    fail('Composite Forge saved recipe has an unsupported shape.');
  }
  const packageRef = validatePackageRef(recipe.packageRef);
  if (!object(recipe.cohortRef) || !text(recipe.cohortRef.id, 160)
    || !COHORT_FINGERPRINT.test(String(recipe.cohortRef.fingerprint || ''))
    || stableJson(recipe.cohortRef.scope) !== stableJson(packageRef.scope)) {
    fail('Composite Forge saved recipe has an invalid cohort binding.');
  }
  if (!object(recipe.components)) fail('Composite Forge saved recipe has no component donor map.');
  for (const spec of COMPOSITE_FORGE_COMPONENTS) {
    const component = recipe.components[spec.key];
    if (!object(component)) fail(`Composite Forge saved recipe is missing its ${spec.key} component.`);
    if (typeof component.metric !== 'string' || !component.metric) {
      fail(`Composite Forge saved recipe is missing its ${spec.key} metric.`);
    }
    const metric = component.metric;
    if (metric !== 'auto' && !spec.metrics.includes(metric)) fail(`Metric ${metric} is not supported by the ${spec.key} component.`);
    const donors = Array.isArray(component.donors) ? component.donors : component.donors ? [component.donors] : [];
    if (donors.length > COMPOSITE_FORGE_LIMITS.maxDonorsPerComponent) fail('Composite Forge saved recipe has too many donors in one component.');
    const clean = donors.map(normalizeDonorInput);
    if (new Set(clean.map(donor => donor.profileKey)).size !== clean.length) fail('A Composite Forge saved component repeats a donor reference.');
    clean.forEach(donor => {
      if (packageRef.scope.kind === 'verified-exact-package-set') validateDonorSourcePackage(donor.sourcePackage, packageRef);
      else if (donor.sourcePackage) fail('Saved donor package and artifact pins require a verified exact-package set.');
    });
    const total = clean.reduce((sum, donor) => sum + donor.weight, 0);
    if (clean.length && Math.abs(total - 1) > 0.0002) fail('Saved donor weights within each Composite Forge component must sum to one.');
  }
  normalizeWeights(recipe.componentWeights);
  normalizeArchetype(recipe.archetype);
  normalizeNormalization(recipe.normalization);
  normalizePlacementSeed(recipe.placementSeed, normalizePlacement(recipe.placement));
  if (recipe.phase !== null && recipe.phase !== undefined
    && (!PHASES.has(recipe.phase) || !packageRef.scope.phases.includes(recipe.phase))) {
    fail('Composite Forge saved recipe phase is outside the bound package scope.');
  }
  return recipe;
}

/**
 * Explicitly migrate the v2/v20 shared-seed recipe contract. The old seed is
 * retained as placementSeed only when it actually selected seeded-random
 * placement; it is never reinterpreted as a simulation seed or profile ID.
 */
export function migrateLegacyCompositeForgeRecipe(legacyRecipe, context = {}) {
  if (!object(legacyRecipe) || legacyRecipe.version !== LEGACY_COMPOSITE_FORGE_RECIPE_VERSION
    || legacyRecipe.modelVersion !== LEGACY_COMPOSITE_FORGE_MODEL_VERSION || legacyRecipe.kind !== 'synthetic-player'
    || !text(legacyRecipe.seed, 80) || !SEED.test(legacyRecipe.seed)) {
    fail('Only validated Composite Forge v2/v20 recipes can be explicitly migrated.');
  }
  const legacyPlacement = normalizePlacement(legacyRecipe.placement);
  const preservedPlacementSeed = legacyPlacement.mode === 'seeded-random' ? legacyRecipe.seed : null;
  const candidate = { ...legacyRecipe, version: COMPOSITE_FORGE_RECIPE_VERSION,
    modelVersion: COMPOSITE_FORGE_MODEL_VERSION, placementSeed: preservedPlacementSeed };
  delete candidate.seed;
  let recipe = validateSavedRecipeShape(candidate);
  const savedPackageRef = normalizeCompositeForgePackageRef(recipe.packageRef);
  const packageRef = context.packageRef ? normalizeCompositeForgePackageRef(context.packageRef) : savedPackageRef;
  if (context.packageRef && stableJson(savedPackageRef) !== stableJson(packageRef)) {
    fail('Legacy Composite Forge recipe does not match the supplied package scope or pins.');
  }
  if (context.cohort) {
    validateCompositeForgeCohort(context.cohort, packageRef);
    if (recipe.cohortRef.id !== context.cohort.id
      || recipe.cohortRef.fingerprint !== compositeCohortFingerprint(context.cohort)) {
      fail('Legacy Composite Forge recipe does not match the supplied cohort contents.');
    }
    recipe = createCompositeForgeRecipe({ ...recipe, packageRef, cohort: context.cohort });
  }
  return Object.freeze({
    status: 'migrated',
    recipe,
    migration: Object.freeze({
      sourceModelVersion: legacyRecipe.modelVersion,
      sourceRecipeVersion: legacyRecipe.version,
      preservedPlacementSeed: Boolean(preservedPlacementSeed),
      legacySeedDisposition: preservedPlacementSeed ? 'preserved-as-placementSeed-for-seeded-random-placement'
        : 'removed-from-profile-identity-and-not-used-for-placement',
      profileIdentityChanges: true,
      simulationSeed: null,
    }),
  });
}

export function parseCompositeForgeRecipe(serialized, context = {}) {
  if (typeof serialized !== 'string' || serialized.length > COMPOSITE_FORGE_LIMITS.maxRecipeBytes) fail('Composite Forge saved recipe is invalid or too large.');
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { fail('Composite Forge saved recipe is not valid JSON.'); }
  const saved = validateSavedRecipeShape(parsed);
  const savedPackageRef = normalizeCompositeForgePackageRef(saved.packageRef);
  const packageRef = context.packageRef ? normalizeCompositeForgePackageRef(context.packageRef) : savedPackageRef;
  if (context.packageRef && stableJson(savedPackageRef) !== stableJson(packageRef)) {
    fail('Composite Forge saved recipe does not match the supplied package scope or pins.');
  }
  if (!context.cohort) return saved;
  validateCompositeForgeCohort(context.cohort, packageRef);
  if (saved.cohortRef.id !== context.cohort.id
    || saved.cohortRef.fingerprint !== compositeCohortFingerprint(context.cohort)) {
    fail('Composite Forge saved recipe does not match the supplied cohort contents.');
  }
  return createCompositeForgeRecipe({ ...saved, packageRef, cohort: context.cohort });
}

export function saveCompositeForgeRecipe(storage, storageKey, recipe) {
  if (!storage || typeof storage.setItem !== 'function' || !text(storageKey, 240)) fail('Composite Forge storage is unavailable.');
  const checked = validateSavedRecipeShape(recipe);
  const payload = { recipe: checked, recipeHash: hashText(serializeCompositeForgeRecipe(checked)) };
  const serialized = stableJson(payload);
  if (serialized.length > COMPOSITE_FORGE_LIMITS.maxRecipeBytes) fail('Composite Forge saved recipe exceeds the bounded save size.');
  storage.setItem(storageKey, serialized);
  return payload;
}

export function loadCompositeForgeRecipe(storage, storageKey, context = {}) {
  if (!storage || typeof storage.getItem !== 'function' || !text(storageKey, 240)) return { status: 'unavailable', recipe: null };
  try {
    const serialized = storage.getItem(storageKey);
    if (!serialized || serialized.length > COMPOSITE_FORGE_LIMITS.maxRecipeBytes) return { status: 'empty', recipe: null };
    const payload = JSON.parse(serialized);
    if (payload?.recipe?.version === LEGACY_COMPOSITE_FORGE_RECIPE_VERSION
      && payload.recipe.modelVersion === LEGACY_COMPOSITE_FORGE_MODEL_VERSION) {
      if (payload.recipeHash !== hashText(stableJson(payload.recipe))) return { status: 'invalid', recipe: null };
      const candidate = migrateLegacyCompositeForgeRecipe(payload.recipe, context);
      return { status: 'migration-required', recipe: null, legacyRecipe: payload.recipe, migration: candidate.migration };
    }
    const recipe = parseCompositeForgeRecipe(JSON.stringify(payload.recipe), context);
    if (payload.recipeHash !== hashText(serializeCompositeForgeRecipe(recipe))) return { status: 'invalid', recipe: null };
    return { status: 'loaded', recipe };
  } catch { return { status: 'invalid', recipe: null }; }
}
