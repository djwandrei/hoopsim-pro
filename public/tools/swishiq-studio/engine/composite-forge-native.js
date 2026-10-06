// Native SwishIQ package adapter for Composite Forge.
//
// This adapter is intentionally data-only. It admits verified public
// player-season rows into the Composite Forge cohort contract, preserves the
// native evidence and package pins, and refuses scope leakage. It does not
// promote the registry's compositeRecipe capability or fabricate a player
// grade/impact value.

import { normalizeCompositeForgePackageRef, validatePublicCompositeForgeSelection } from './composite-forge.js?v=20261002f&rev=composite-forge-v4-descriptive-source-pins-v1';

export const COMPOSITE_FORGE_NATIVE_ADAPTER_VERSION = 'composite-forge-native-adapter-v6';
export const COMPOSITE_FORGE_NATIVE_ARTIFACT = 'player-seasons';
const V3_PACKAGE_ID = /^nba-swishiq-v3-(\d{4})-(\d{2})$/;
const V3_PACKAGE_VERSION = /^v3-(\d{4})-(\d{2})-([a-f0-9]{12})$/;
const V3_PLAYER_REF = /^p_[a-f0-9]{32}$/;
const V3_PLAYER_SEASON_REF = /^ps_[a-f0-9]{32}$/;
const V3_MODEL = 'swishiq-v3';
const V3_NORMALIZER = 'swishiq-v3-canonical-normalizer';
const V3_METRICS = 'swishiq-v3-metrics-v1.2';
const V4_PACKAGE_REF_FORMAT = 'djhc-swishiq-v4-package-ref-v1';
const V4_PART_FORMAT = 'djhc-swishiq-v4-verified-public-part-v1';
const V4_PLAYER_RECORD = /^v4p-[a-f0-9]{32}$/;
const V4_MODEL = 'swishiq-canonical-v4';
const V4_NORMALIZER = 'swishiq-canonical-normalizer-v4.1.0';
const V4_METRICS = 'swishiq-canonical-metrics-v4.1.0';
const SHA256 = /^[a-f0-9]{64}$/;
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const TEAM_CODE = /^[A-Z]{3}$/;
const POSITION = /^[A-Z0-9+/-]{1,8}$/;

const COMPONENT_METRICS = Object.freeze({
  points: ['pointsPerGame'],
  assists: ['assistsPerGame'],
  turnovers: ['turnoversPerGame'],
  rebounds: ['reboundsPerGame'],
  steals: ['stealsPerGame'],
  blocks: ['blocksPerGame'],
  fieldGoalAccuracy: ['fgPct', 'fieldGoalPercentage'],
  threePointAccuracy: ['threePPct', 'threePointPercentage'],
  threePointFrequency: ['threePointAttemptRate', 'threePointAttemptShare'],
  freeThrowAccuracy: ['ftPct', 'freeThrowPercentage'],
  involvementPer36: ['involvementPer36'],
  trueShootingPercentage: ['trueShootingPct', 'trueShootingPercentage'],
  effectiveFieldGoalPercentage: ['effectiveFgPct', 'effectiveFieldGoalPercentage'],
  minutesPerGame: ['minutesPerGame'],
});

const COMPONENT_UNITS = Object.freeze({
  points: 'perGame', assists: 'perGame', turnovers: 'perGame', rebounds: 'perGame',
  steals: 'perGame', blocks: 'perGame', fieldGoalAccuracy: 'percent',
  threePointAccuracy: 'percent', threePointFrequency: 'percent', freeThrowAccuracy: 'percent',
  involvementPer36: 'per36', trueShootingPercentage: 'percent',
  effectiveFieldGoalPercentage: 'percent', minutesPerGame: 'minutesPerGame', games: 'games',
});

const SOURCE_UNITS = Object.freeze({
  points: 'points-per-game', assists: 'assists-per-game', turnovers: 'turnovers-per-game',
  rebounds: 'rebounds-per-game', steals: 'steals-per-game', blocks: 'blocks-per-game',
  fieldGoalAccuracy: 'ratio', threePointAccuracy: 'ratio', threePointFrequency: 'ratio',
  freeThrowAccuracy: 'ratio', involvementPer36: 'estimated-involvements-per-36',
  trueShootingPercentage: 'ratio', effectiveFieldGoalPercentage: 'ratio',
  minutesPerGame: 'minutes-per-game',
});

const BOX_TOTALS = Object.freeze({
  points: 'points', assists: 'assists', turnovers: 'turnovers', rebounds: 'rebounds',
  steals: 'steals', blocks: 'blocks',
});

const COUNT_BACKED_RATE_RATIOS = Object.freeze({
  fieldGoalAccuracy: Object.freeze({ sourceMetric: 'fgPct', made: 'fieldGoalsMade', attempted: 'fieldGoalAttempts' }),
  threePointAccuracy: Object.freeze({ sourceMetric: 'threePPct', made: 'threePointersMade', attempted: 'threePointAttempts' }),
  threePointFrequency: Object.freeze({ sourceMetric: 'threePointAttemptRate', made: 'threePointAttempts', attempted: 'fieldGoalAttempts' }),
});

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const text = (value, maximum = 240) => typeof value === 'string' && value.trim() && value.length <= maximum ? value.trim() : null;
const fail = message => { throw new Error(message); };

function boxCountIdentityErrors(box) {
  const errors = [];
  const identities = [
    ['fieldGoalsMade', box.fieldGoalsMade, box.twoPointMakes + box.threePointersMade,
      `box.fieldGoalsMade (${box.fieldGoalsMade}) must equal box.twoPointMakes (${box.twoPointMakes}) + box.threePointersMade (${box.threePointersMade})`],
    ['fieldGoalAttempts', box.fieldGoalAttempts, box.twoPointAttempts + box.threePointAttempts,
      `box.fieldGoalAttempts (${box.fieldGoalAttempts}) must equal box.twoPointAttempts (${box.twoPointAttempts}) + box.threePointAttempts (${box.threePointAttempts})`],
    ['points', box.points, (2 * box.twoPointMakes) + (3 * box.threePointersMade) + box.freeThrowsMade,
      `box.points (${box.points}) must equal 2 × box.twoPointMakes (${2 * box.twoPointMakes}) + 3 × box.threePointersMade (${3 * box.threePointersMade}) + box.freeThrowsMade (${box.freeThrowsMade})`],
    ['rebounds', box.rebounds, box.offensiveRebounds + box.defensiveRebounds,
      `box.rebounds (${box.rebounds}) must equal box.offensiveRebounds (${box.offensiveRebounds}) + box.defensiveRebounds (${box.defensiveRebounds})`],
  ];
  identities.forEach(([field, actual, expected, message]) => {
    if (actual !== expected) errors.push({ field, message });
  });
  [
    ['fieldGoalsMade', 'fieldGoalAttempts'],
    ['twoPointMakes', 'twoPointAttempts'],
    ['threePointersMade', 'threePointAttempts'],
    ['freeThrowsMade', 'freeThrowAttempts'],
  ].forEach(([madeField, attemptField]) => {
    if (box[madeField] > box[attemptField]) {
      errors.push({ field: madeField, message: `box.${madeField} (${box[madeField]}) must not exceed box.${attemptField} (${box[attemptField]})` });
    }
  });
  return errors;
}

function stableJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(String(value));
}

function scopeSignature(scope) {
  return stableJson({
    kind: scope?.kind,
    seasonStartYears: Array.isArray(scope?.seasonStartYears) ? scope.seasonStartYears : [],
    phases: Array.isArray(scope?.phases) ? scope.phases : [],
  });
}

function seasonYears(scope) {
  return Array.isArray(scope?.seasonStartYears) ? scope.seasonStartYears : [];
}

function validateSelection(packageRef, { seasonStartYears, teamCodes, phase }) {
  const scope = packageRef.scope;
  // Exact packages have one unambiguous season and can use their published
  // default. A pooled package must receive an explicit season list so a
  // caller cannot silently widen a Player Builder cohort to every season in
  // the package.
  if (scope.kind === 'pooled-window' && packageRef.acceptedPooledPackage !== true) {
    fail('Cross-season native Composite Forge selection requires an accepted pooled package.');
  }
  if (scope.kind === 'pooled-window' && seasonStartYears === undefined) {
    fail('A pooled native Composite Forge selection must list its seasons explicitly.');
  }
  const selectedYears = seasonStartYears === undefined ? seasonYears(scope) : seasonStartYears;
  if (!Array.isArray(selectedYears) || !selectedYears.length || selectedYears.some(year => !integer(year, 1947, 2200))) {
    fail('Composite Forge native selection needs one or more valid season start years.');
  }
  const uniqueYears = [...new Set(selectedYears)].sort((a, b) => a - b);
  if (uniqueYears.length !== selectedYears.length || uniqueYears.some((year, index) => index && year <= uniqueYears[index - 1])) {
    fail('Composite Forge native selection seasons must be ordered and unique.');
  }
  if (uniqueYears.some(year => !seasonYears(scope).includes(year))) fail('Composite Forge native selection escapes the package season scope.');
  if (scope.kind === 'exact-season' && uniqueYears.length !== 1) fail('An exact native package can provide only one Composite Forge season.');
  const teams = teamCodes === undefined ? null : Array.isArray(teamCodes) ? teamCodes : [teamCodes];
  if (teams?.some(team => !TEAM_CODE.test(String(team)))) fail('Composite Forge native selection contains an invalid team code.');
  const uniqueTeams = teams ? [...new Set(teams.map(team => String(team)))] : null;
  const selectedPhase = phase === undefined || phase === null ? null : text(phase, 40);
  if (selectedPhase && !PHASES.has(selectedPhase)) fail('Composite Forge native selection contains an unsupported phase.');
  if (selectedPhase && !scope.phases.includes(selectedPhase)) fail('Composite Forge native selection phase is outside the package scope.');
  return { seasonStartYears: uniqueYears, teamCodes: uniqueTeams, phase: selectedPhase };
}

function validatePartPins(part, packageRef) {
  if (packageRef.format === V4_PACKAGE_REF_FORMAT) {
    if (!isObject(part) || part.format !== V4_PART_FORMAT || part.status !== 'verified'
      || part.artifactId !== COMPOSITE_FORGE_NATIVE_ARTIFACT || !Array.isArray(part.records)
      || !isObject(part.package) || part.package.packageId !== packageRef.packageId
      || part.package.packageVersion !== packageRef.packageVersion
      || part.package.packageManifestSha256 !== packageRef.packageManifestSha256
      || part.package.sourceLockSha256 !== packageRef.sourceLockSha256
      || part.package.modelId !== V4_MODEL || part.package.normalizerVersion !== V4_NORMALIZER
      || part.package.metricsVersion !== V4_METRICS
      || scopeSignature(part.scope) !== scopeSignature(packageRef.scope)
      || !SHA256.test(String(part.sha256 || ''))) {
      fail('The native Composite Forge player-season part is not a verified V4 public part for the selected package.');
    }
    const artifact = packageRef.playerSeasonsArtifacts?.find(item => item.artifactId === part.artifactId
      && item.sha256 === part.sha256 && item.path === part.path && item.rows === part.rows && item.bytes === part.bytes);
    if (!artifact) fail('The verified V4 Composite Forge part is missing its package-reference artifact pin.');
    return part.records;
  }
  if (!isObject(part) || part.format !== 'djhc-swishiq-public-projection-part-v1' || !Array.isArray(part.records)) {
    fail('The native Composite Forge player-season part is not a V3 public projection part.');
  }
  if (part.artifactId && part.artifactId !== COMPOSITE_FORGE_NATIVE_ARTIFACT) fail('The native Composite Forge part is not the player-seasons artifact.');
  if (part.kind && part.kind !== COMPOSITE_FORGE_NATIVE_ARTIFACT) fail('The native Composite Forge part kind is unsupported.');
  const pins = ['packageId', 'packageVersion', 'packageManifestSha256', 'sourceLockSha256', 'modelId', 'normalizer', 'metricsVersion'];
  for (const pin of pins) {
    if (part[pin] !== undefined && part[pin] !== packageRef[pin]) fail(`The native Composite Forge part does not match its ${pin} pin.`);
  }
  if (part.scope !== undefined && scopeSignature(part.scope) !== scopeSignature(packageRef.scope)) fail('The native Composite Forge part scope does not match its package scope.');
  return part.records;
}

function nativeMetric(row, keys) {
  const metrics = isObject(row.metrics) ? row.metrics : {};
  const usableStatuses = new Set(['available', 'observed', 'limited_sample']);
  let unavailable = null;
  for (const sourceMetric of keys) {
    const candidate = metrics[sourceMetric];
    if (!isObject(candidate)) continue;
    if (usableStatuses.has(candidate.status) && finite(candidate.value)) return { ...candidate, sourceMetric };
    if (!unavailable && candidate.status === 'unavailable') unavailable = { ...candidate, sourceMetric };
  }
  return unavailable;
}

function componentFromMetric(row, component, metricKeys) {
  const metric = nativeMetric(row, metricKeys);
  const unit = COMPONENT_UNITS[component];
  if (!metric) return { unit, status: 'unavailable', sourceMetric: metricKeys[0], method: 'native-missing-component-v1', reason: 'missing-input' };
  const sourceUnit = metric.unit || null;
  const knownGames = integer(row.games, 0) ? row.games : null;
  const boxTotal = BOX_TOTALS[component] ? row.box?.[BOX_TOTALS[component]] : null;
  const numerator = finite(metric.numerator) ? metric.numerator : finite(boxTotal) ? boxTotal : null;
  const denominator = finite(metric.denominator) ? metric.denominator : component === 'minutesPerGame' && finite(row.minutes) ? knownGames : component !== 'involvementPer36' && unit === 'perGame' ? knownGames : null;
  const method = `native-${metric.evidenceKind || 'declared'}-${metric.sourceMetric}-v1`;
  const countRatio = COUNT_BACKED_RATE_RATIOS[component];
  const box = row.box || {};
  const supportedV4RateMetrics = new Set(['fgPct', 'threePPct', 'threePointAttemptRate', 'ftPct', 'trueShootingPct', 'effectiveFgPct']);
  let expectedNumerator = null;
  let expectedDenominator = null;
  if (metric.sourceMetric === countRatio?.sourceMetric) {
    expectedNumerator = box[countRatio.made];
    expectedDenominator = box[countRatio.attempted];
  } else if (metric.sourceMetric === 'ftPct' && component === 'freeThrowAccuracy') {
    expectedNumerator = box.freeThrowsMade;
    expectedDenominator = box.freeThrowAttempts;
  } else if (metric.sourceMetric === 'trueShootingPct' && component === 'trueShootingPercentage') {
    expectedNumerator = box.points;
    expectedDenominator = 2 * (box.fieldGoalAttempts + 0.44 * box.freeThrowAttempts);
  } else if (metric.sourceMetric === 'effectiveFgPct' && component === 'effectiveFieldGoalPercentage') {
    expectedNumerator = box.fieldGoalsMade + (0.5 * box.threePointersMade);
    expectedDenominator = box.fieldGoalAttempts;
  }
  const countBackedRateRatio = Boolean(sourceUnit === 'rate'
    && (metric.sourceMetric === countRatio?.sourceMetric
      || row.__swishiqV4Observed === true && supportedV4RateMetrics.has(metric.sourceMetric))
    && finite(metric.value) && metric.value >= 0 && metric.value <= 1
    && finite(metric.numerator) && finite(metric.denominator) && metric.denominator > 0
    && finite(expectedNumerator) && finite(expectedDenominator) && expectedDenominator > 0
    && Math.abs(metric.numerator - expectedNumerator) <= 1e-9
    && Math.abs(metric.denominator - expectedDenominator) <= 1e-9
    && Math.abs(metric.value - metric.numerator / metric.denominator) <= 1e-9);
  if (!sourceUnit || (sourceUnit !== SOURCE_UNITS[component] && !countBackedRateRatio)) {
    return { value: null, unit, numerator, denominator, knownGames, status: 'unavailable', evidenceKind: metric.evidenceKind || null,
      coverage: metric.coverage || null, reason: 'unsupported-unit', sourceMetric: metric.sourceMetric, sourceUnit, method };
  }
  return {
    value: metric.value, unit, numerator, denominator, knownGames,
    status: metric.status || 'unavailable', evidenceKind: metric.evidenceKind || null,
    coverage: metric.coverage || null, reason: metric.reason || null, sourceMetric: metric.sourceMetric,
    sourceUnit, unitNormalization: countBackedRateRatio ? 'count-backed-rate-to-ratio' : null, method,
  };
}

function canonicalProfile(row, packageRef, selected) {
  const isV4 = packageRef.format === V4_PACKAGE_REF_FORMAT;
  if (isV4) {
    const values = row?.values;
    const entities = row?.entities;
    const time = row?.time;
    if (!isObject(row) || !V4_PLAYER_RECORD.test(String(row.recordId || ''))
      || row.evidence?.kind !== 'observed' || row.evidence?.status !== 'available'
      || row.temporalUse?.role !== 'descriptive' || row.temporalUse?.eligibleForPredictiveFeatures !== false
      || !isObject(values) || values.observed !== true || !isObject(entities) || !isObject(time)) {
      return { profile: null, reason: 'v4-player-season-evidence-invalid' };
    }
    row = {
      observed: true,
      playerRef: text(entities.playerRef, 160) || text(values.displayName, 240),
      playerSeasonRef: text(row.recordId, 160),
      displayName: values.displayName,
      seasonStartYear: time.seasonStartYear,
      phase: time.phase,
      teamCode: text(entities.teamCode, 8) || values.teamCode,
      positions: values.positions,
      age: values.age,
      games: values.games,
      starts: values.starts,
      minutes: values.minutes,
      box: values.box,
      metrics: values.metrics,
      metricNullReasons: values.metricNullReasons,
      packageId: packageRef.packageId,
      packageVersion: packageRef.packageVersion,
      __swishiqPlayerSeasonsArtifactId: 'player-seasons',
      __swishiqPlayerSeasonsArtifactSha256: row.__swishiqPlayerSeasonsArtifactSha256,
      __swishiqV4Observed: true,
    };
  }
  if (!isObject(row) || row.observed !== true) return { profile: null, reason: 'unobserved' };
  if ((!isV4 && (!V3_PLAYER_REF.test(String(row.playerRef || '')) || !V3_PLAYER_SEASON_REF.test(String(row.playerSeasonRef || ''))))
    || !isObject(row.box) || !isObject(row.metrics) || !isObject(row.metricNullReasons)) {
    return { profile: null, reason: isV4 ? 'v4-player-season-schema-invalid' : 'v3-player-season-schema-invalid' };
  }
  if (row.packageId !== undefined && row.packageId !== packageRef.packageId) return { profile: null, reason: 'package-pin-mismatch' };
  if (row.packageVersion !== undefined && row.packageVersion !== packageRef.packageVersion) return { profile: null, reason: 'package-pin-mismatch' };
  if (!integer(row.seasonStartYear, 1947, 2200) || !selected.seasonStartYears.includes(row.seasonStartYear)) return { profile: null, reason: 'season-out-of-scope' };
  if (!TEAM_CODE.test(String(row.teamCode || '')) || selected.teamCodes && !selected.teamCodes.includes(row.teamCode)) return { profile: null, reason: 'team-out-of-scope' };
  if (!PHASES.has(row.phase) || selected.phase && row.phase !== selected.phase) return { profile: null, reason: 'phase-out-of-scope' };
  const officialBoxKeys = ['points', 'assists', 'blocks', 'defensiveRebounds', 'fieldGoalAttempts', 'fieldGoalsMade',
    'freeThrowAttempts', 'freeThrowsMade', 'offensiveRebounds', 'personalFouls', 'rebounds', 'steals',
    'threePointAttempts', 'threePointersMade', 'turnovers', 'twoPointAttempts', 'twoPointMakes'];
  if (officialBoxKeys.some(key => !integer(row.box[key], 0, 100000))) return { profile: null, reason: isV4 ? 'v4-player-season-box-invalid' : 'v3-player-season-box-invalid' };
  const boxIdentityErrors = boxCountIdentityErrors(row.box);
  if (boxIdentityErrors.length) return { profile: null, reason: isV4 ? 'v4-player-season-box-identity-invalid' : 'v3-player-season-box-identity-invalid', diagnostics: boxIdentityErrors };
  const key = text(row.playerSeasonRef, 160);
  const playerId = text(row.playerRef, 160);
  const player = text(row.displayName, 240);
  const games = row.games;
  if (!key || !playerId || !player || !integer(games, 0, 300)) return { profile: null, reason: 'identity-or-games-invalid' };
  if (row.minutes !== null && row.minutes !== undefined && (!finite(row.minutes) || row.minutes < 0)) return { profile: null, reason: 'minutes-invalid' };
  const rawPositions = Array.isArray(row.positions) ? row.positions.map(position => String(position).trim().toUpperCase()) : [];
  if (rawPositions.some(position => !POSITION.test(position))) return { profile: null, reason: 'positions-invalid' };
  const positions = [...new Set(rawPositions)];
  if (!positions.length) return { profile: null, reason: 'positions-missing' };
  // Age and experience are admitted only when the native row carries them;
  // season index is not a safe substitute for either state variable. Keep the
  // source labels beside the values so donor receipts disclose partial state.
  const age = finite(row.age) && row.age >= 12 && row.age <= 60 ? row.age : null;
  const experience = integer(row.experience, 0, 40) ? row.experience : null;
  const stateSource = age !== null || experience !== null
    ? text(row.stateSource, 160) || 'native-player-season-row' : null;
  const ageSource = age === null ? null : text(row.ageSource, 160) || stateSource;
  const experienceSource = experience === null ? null : text(row.experienceSource, 160) || stateSource;
  const stateJoin = age !== null && experience !== null ? 'native-observed-complete'
    : age !== null || experience !== null ? 'native-observed-partial' : 'missing';
  const stateQuality = age !== null && experience !== null ? 'observed'
    : age !== null || experience !== null ? 'partial' : 'missing';
  const components = Object.fromEntries(Object.entries(COMPONENT_METRICS).map(([component, keys]) => [component, componentFromMetric(row, component, keys)]));
  components.games = { value: games, unit: 'games', numerator: games, denominator: 1, knownGames: games,
    status: 'observed', evidenceKind: 'observed', coverage: 'native-season-row', sourceMetric: 'games', method: 'native-observed-games-v1' };
  return {
    profile: {
      key, packageId: packageRef.packageId, packageVersion: packageRef.packageVersion,
      player, playerName: player, playerId, seasonStartYear: row.seasonStartYear, phase: row.phase,
      scope: 'team', team: String(row.teamCode), positions, games, minutes: finite(row.minutes) ? row.minutes : null,
      starts: integer(row.starts, 0, games) ? row.starts : null, age, experience, ageSource, experienceSource,
      stateSource, stateJoin, stateQuality, stateConflict: null,
      components,
      nativeProvenance: { artifactId: COMPOSITE_FORGE_NATIVE_ARTIFACT, playerSeasonRef: key,
        playerRef: playerId, packageId: packageRef.packageId, packageVersion: packageRef.packageVersion,
        packageManifestSha256: packageRef.packageManifestSha256 || null, sourceLockSha256: packageRef.sourceLockSha256 || null,
        playerSeasonsArtifactId: text(row.__swishiqPlayerSeasonsArtifactId, 64),
        playerSeasonsArtifactSha256: text(row.__swishiqPlayerSeasonsArtifactSha256, 64),
        phase: row.phase, seasonStartYear: row.seasonStartYear, teamCode: String(row.teamCode),
        age, experience, ageSource, experienceSource, stateSource, stateJoin, stateQuality },
    },
    reason: null,
  };
}

/**
 * Convert a verified native `player-seasons` part to the Composite Forge
 * cohort shape. The returned cohort is still a local model input; registry
 * capabilities remain the caller's public-activation gate.
 */
export function adaptNativeCompositeForgeCohort({
  packageRef,
  part,
  records,
  cohortId = 'native-composite-forge-cohort',
  seasonStartYears,
  teamCodes,
  phase,
  eraBaselines,
  teamProfiles,
} = {}) {
  const normalizedPackage = normalizeCompositeForgePackageRef(packageRef);
  const selected = validateSelection(normalizedPackage, { seasonStartYears, teamCodes, phase });
  const rows = validatePartPins(part || records, normalizedPackage);
  if (rows.length > 100000) fail('The native Composite Forge part exceeds the bounded row contract.');
  const profiles = [];
  const skipped = {};
  const seen = new Set();
  for (const row of rows) {
    const built = canonicalProfile(row, normalizedPackage, selected);
    if (!built.profile) {
      if (built.diagnostics?.length) {
        const rowRef = text(row?.playerSeasonRef, 160) || '(unknown player-season ref)';
        fail(`Native Composite Forge row ${rowRef} fails box-count reconciliation: ${built.diagnostics.map(diagnostic => diagnostic.message).join('; ')}.`);
      }
      if (row?.observed === true || selected.seasonStartYears.includes(row?.seasonStartYear)) skipped[built.reason] = (skipped[built.reason] || 0) + 1;
      continue;
    }
    if (seen.has(built.profile.key)) fail('The native Composite Forge part contains duplicate player-season identities.');
    seen.add(built.profile.key);
    profiles.push(built.profile);
  }
  profiles.sort((left, right) => left.seasonStartYear - right.seasonStartYear || left.team.localeCompare(right.team) || left.player.localeCompare(right.player) || left.key.localeCompare(right.key));
  if (!profiles.length) fail('The selected native Composite Forge package has no observed player-season rows for the requested scope.');
  const teams = [...new Set(profiles.map(profile => profile.team))].sort();
  const cohort = {
    id: text(cohortId, 160) || 'native-composite-forge-cohort', profiles,
    eraBaselines: eraBaselines === undefined ? undefined : eraBaselines,
    teamProfiles: Array.isArray(teamProfiles) ? teamProfiles : undefined,
    source: {
      kind: 'swishiq-native-package', artifactId: COMPOSITE_FORGE_NATIVE_ARTIFACT,
      packageId: normalizedPackage.packageId, packageVersion: normalizedPackage.packageVersion,
      packageManifestSha256: normalizedPackage.packageManifestSha256 || null,
      sourceLockSha256: normalizedPackage.sourceLockSha256 || null,
      registryVersion: normalizedPackage.registryVersion || null,
      registryRevisionSha256: normalizedPackage.registryRevisionSha256 || null,
      projectionContentSha256: normalizedPackage.projectionContentSha256 || null,
      selection: { seasonStartYears: selected.seasonStartYears, teamCodes: selected.teamCodes, phase: selected.phase },
      teams, rows: profiles.length, skipped,
      note: 'Observed native player-season rows only. No pooled fallback, private provider field, or synthetic overall grade is added.',
    },
  };
  return Object.freeze({
    status: 'ready', adapterVersion: COMPOSITE_FORGE_NATIVE_ADAPTER_VERSION,
    packageRef: normalizedPackage, selection: Object.freeze(selected), teams: Object.freeze(teams), cohort,
    coverage: Object.freeze({ inputRows: rows.length, selectedRows: profiles.length, skippedRows: Object.values(skipped).reduce((sum, value) => sum + value, 0), skippedByReason: skipped }),
  });
}

/**
 * Browser-facing adapter for a verified public package proof. This is the
 * only entry point that should be used by the public Player Builder: it makes
 * the exact-versus-pooled decision explicit before any player-season rows are
 * admitted to the internal Forge cohort.
 */
export function adaptPublishedCompositeForgeCohort({
  proof,
  part,
  records,
  selection,
  cohortId = 'public-composite-forge-cohort',
  eraBaselines,
  teamProfiles,
} = {}) {
  if (!isObject(proof) || proof.package?.status !== 'published' || !isObject(proof.package.scope)) {
    fail('Composite Forge needs a verified published package proof.');
  }
  const selected = validatePublicCompositeForgeSelection(proof.package, selection);
  const packageRef = {
    ...proof.package,
    format: 'djhc-swishiq-package-v3',
    registryVersion: proof.registry?.registryVersion,
    registryRevisionSha256: proof.registry?.registryRevisionSha256,
    acceptedPooledPackage: selected.acceptedPooledPackage,
    scope: proof.package.scope,
  };
  if (packageRef.modelId !== V3_MODEL || packageRef.normalizer !== V3_NORMALIZER || packageRef.metricsVersion !== V3_METRICS) {
    fail('Composite Forge refuses a non-V3 published package proof.');
  }
  const adapted = adaptNativeCompositeForgeCohort({
    packageRef,
    part,
    records,
    cohortId,
    seasonStartYears: selected.seasonStartYears,
    teamCodes: selected.teamCodes || undefined,
    phase: selected.phase,
    eraBaselines,
    teamProfiles,
  });
  return Object.freeze({ ...adapted,
    publicSelection: selected,
    privacy: Object.freeze({ version: 'swishiq-public-player-builder-privacy-v1', nativeJoinHandles: 'internal-only' }),
  });
}
