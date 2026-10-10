import {
  CANONICAL_V4_PLAYER_NAME_KEY_VERSION,
  CANONICAL_V4_PLAYER_NAME_MATCH_KEY_VERSION,
  normalizeCanonicalV4PlayerNameKey,
  resolveCanonicalV4PlayerNameSeasonMatch,
} from './canonical-v4-player-name-identity.js?v=20261001d&rev=canonical-v4-player-name-identity-v1';
import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_FORMAT,
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_VERSION,
  loadCanonicalV4StudioExactSeasonData,
} from './canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';

export const CANONICAL_V4_PLAYER_SEASON_EVIDENCE_FORMAT = 'djhc-swishiq-v4-player-season-evidence-v2';
export const CANONICAL_V4_PLAYER_SEASON_EVIDENCE_VERSION = 'swishiq-v4-player-season-evidence-v2';

const ALL_PHASES = Object.freeze(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const PLAYER_SEASON_ARTIFACT = 'player-seasons';
const ROSTER_MEMBERSHIP_ARTIFACT = 'roster-memberships';
const FRANCHISE_CAPABILITY = 'franchiseInputs';
const ALLOWED_PHASES = new Set(ALL_PHASES);
const HASH_RE = /^[a-f0-9]{64}$/;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const BOX_COUNT_IDENTITY_FIELDS = Object.freeze([
  'fieldGoalsMade', 'twoPointMakes', 'threePointersMade', 'fieldGoalAttempts',
  'twoPointAttempts', 'threePointAttempts', 'points', 'freeThrowsMade',
  'rebounds', 'offensiveRebounds', 'defensiveRebounds', 'freeThrowAttempts',
]);

const BOX_COUNT_IDENTITY_CHECKS = Object.freeze([
  'fieldGoalsMade=twoPointMakes+threePointersMade',
  'fieldGoalAttempts=twoPointAttempts+threePointAttempts',
  'points=2*twoPointMakes+3*threePointersMade+freeThrowsMade',
  'rebounds=offensiveRebounds+defensiveRebounds',
  'makes<=attempts',
]);

function boxCountIdentityErrors(box) {
  if (!isObject(box)) return [{ field: 'box', message: 'The V4 box-count object is missing.' }];
  const invalidFields = BOX_COUNT_IDENTITY_FIELDS.filter(field => !Number.isSafeInteger(box[field]) || box[field] < 0);
  if (invalidFields.length) {
    return invalidFields.map(field => ({ field, message: `box.${field} must be a non-negative safe integer.` }));
  }
  const safeSum = (...values) => {
    const total = values.reduce((sum, value) => sum + value, 0);
    return Number.isSafeInteger(total) ? total : null;
  };
  const identities = [
    ['fieldGoalsMade', box.fieldGoalsMade, safeSum(box.twoPointMakes, box.threePointersMade),
      'fieldGoalsMade must equal twoPointMakes plus threePointersMade.'],
    ['fieldGoalAttempts', box.fieldGoalAttempts, safeSum(box.twoPointAttempts, box.threePointAttempts),
      'fieldGoalAttempts must equal twoPointAttempts plus threePointAttempts.'],
    ['points', box.points, safeSum(2 * box.twoPointMakes, 3 * box.threePointersMade, box.freeThrowsMade),
      'points must equal two times twoPointMakes plus three times threePointersMade plus freeThrowsMade.'],
    ['rebounds', box.rebounds, safeSum(box.offensiveRebounds, box.defensiveRebounds),
      'rebounds must equal offensiveRebounds plus defensiveRebounds.'],
  ];
  const errors = identities.flatMap(([field, actual, expected, message]) => expected === null || actual !== expected
    ? [{ field, message: expected === null ? `${message} The computed total exceeds safe integer range.` : message }]
    : []);
  [
    ['fieldGoalsMade', 'fieldGoalAttempts'],
    ['twoPointMakes', 'twoPointAttempts'],
    ['threePointersMade', 'threePointAttempts'],
    ['freeThrowsMade', 'freeThrowAttempts'],
  ].forEach(([made, attempted]) => {
    if (box[made] > box[attempted]) {
      errors.push({ field: made, message: `box.${made} must not exceed box.${attempted}.` });
    }
  });
  return errors;
}

/**
 * Report whether an exact-season request can attempt V4 access. This checks
 * only the reviewed release/package pin shape; the loader still verifies the
 * fetched registry, capability map, artifacts, hashes, and row coverage.
 */
export function canonicalV4PlayerSeasonEvidenceAvailability({
  seasonStartYear,
  phases = ['regular'],
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
} = {}) {
  const disabled = (status, reason) => Object.freeze({ status, enabled: false, reason });
  if (!Number.isSafeInteger(seasonStartYear) || seasonStartYear < 2017 || seasonStartYear > 2025) {
    return disabled('disabled-exact-season-invalid', 'Choose one supported exact V4 season from 2017 through 2025.');
  }
  if (!Array.isArray(phases) || !phases.length || new Set(phases).size !== phases.length
    || phases.some(phase => !ALLOWED_PHASES.has(phase))) {
    return disabled('disabled-phase-request-invalid', 'Request one or more distinct supported phases.');
  }
  if (!isObject(releasePin) || releasePin.format !== CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_FORMAT
    || releasePin.version !== CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_VERSION
    || releasePin.status !== 'reviewed') {
    return disabled('disabled-release-pin-unconfigured', 'A reviewed V4 runtime release pin is not configured.');
  }
  const packageId = exactPackageId(seasonStartYear);
  const packagePins = Array.isArray(releasePin.packagePins) ? releasePin.packagePins : [];
  const expectedPackages = Array.isArray(releasePin.expectedIdentity?.packages)
    ? releasePin.expectedIdentity.packages : [];
  const packagePin = packagePins.find(row => row?.packageId === packageId);
  const expected = expectedPackages.find(row => row?.packageId === packageId);
  const packageScope = expected?.scope;
  const hashFields = [
    'sourceLockSha256', 'sourceLockEmbeddedSha256', 'sourceLockFileSha256', 'sourceLockSchemaSha256',
  ];
  const pinsAgree = isObject(packagePin) && isObject(expected)
    && typeof expected.packageVersion === 'string' && expected.packageVersion.length > 0
    && packageScope?.kind === 'exact-season'
    && Array.isArray(packageScope.seasonStartYears)
    && packageScope.seasonStartYears.length === 1
    && packageScope.seasonStartYears[0] === seasonStartYear
    && Array.isArray(packageScope.phases)
    && phases.every(phase => packageScope.phases.includes(phase))
    // Index and capability-map hashes live in packagePins, while
    // expectedIdentity carries package/source-lock identity. The network
    // loader later verifies these separate reviewed pins against the fetched
    // registry proof; comparing them to absent expectedIdentity fields would
    // disable every production exact-season choice.
    && HASH_RE.test(String(packagePin.indexSha256 || ''))
    && HASH_RE.test(String(packagePin.capabilityMapSha256 || ''))
    && packagePin.sourceLockDigestKind === 'full-lock-object'
    && expected.sourceLockDigestKind === 'full-lock-object'
    && hashFields.every(field => HASH_RE.test(String(packagePin[field] || ''))
      && packagePin[field] === expected[field])
    && Number.isSafeInteger(packagePin.sourceLockFileByteLength)
    && packagePin.sourceLockFileByteLength > 0
    && packagePin.sourceLockFileByteLength === expected.sourceLockFileByteLength;
  if (!pinsAgree) {
    return disabled('disabled-exact-season-package-pin-incomplete', `${packageId} lacks matching reviewed package/source-lock pins or requested phases.`);
  }
  return Object.freeze({
    status: 'ready-to-attempt-reviewed-exact-season',
    enabled: true,
    packageId,
    seasonStartYear,
    phases: Object.freeze([...phases]),
    reason: 'The exact-season V4 loader will verify the release and data before returning rows.',
  });
}

function exactPackageId(year) {
  return `nba-swishiq-v4-${year}-${String(year + 1).slice(-2)}`;
}

function scopeMatches(scope, year) {
  return isObject(scope)
    && scope.kind === 'exact-season'
    && Array.isArray(scope.seasonStartYears)
    && scope.seasonStartYears.length === 1
    && scope.seasonStartYears[0] === year;
}

function requireCompletePart(part, artifactId, year) {
  const coverage = part?.part?.coverage;
  if (!isObject(part) || part.status !== 'verified' || part.artifactId !== artifactId
    || !Array.isArray(part.records) || part.records.length !== part.rows
    || !isObject(coverage) || coverage.status !== 'available' || coverage.coverageState !== 'complete'
    || coverage.rowCount !== part.records.length
    || !Array.isArray(coverage.expectedSeasonStartYears)
    || coverage.expectedSeasonStartYears.length !== 1 || coverage.expectedSeasonStartYears[0] !== year
    || !Array.isArray(coverage.includedSeasonStartYears)
    || coverage.includedSeasonStartYears.length !== 1 || coverage.includedSeasonStartYears[0] !== year
    || !Array.isArray(coverage.missingSeasonStartYears) || coverage.missingSeasonStartYears.length) {
    fail('player-evidence-part-incomplete', `${artifactId} is not complete verified evidence for exact season ${year}.`);
  }
}

function seasonTeamPhaseRowKey(record, label) {
  const displayName = record?.values?.displayName;
  const normalizedPlayerNameKey = normalizeCanonicalV4PlayerNameKey(displayName);
  const seasonStartYear = record?.time?.seasonStartYear ?? record?.values?.seasonStartYear;
  const teamCode = record?.values?.teamCode || record?.entities?.teamCode;
  const phase = record?.time?.phase || record?.values?.phase;
  if (!normalizedPlayerNameKey || !Number.isSafeInteger(seasonStartYear)
    || typeof teamCode !== 'string' || !/^[A-Z]{3}$/.test(teamCode)
    || typeof phase !== 'string' || !ALL_PHASES.includes(phase)) {
    fail('player-evidence-row-invalid', `${label} contains a row without a name-season-team-phase key.`);
  }
  return {
    normalizedPlayerNameKey,
    seasonStartYear,
    teamCode,
    phase,
    key: `${normalizedPlayerNameKey}|${seasonStartYear}|${teamCode}|${phase}`,
  };
}

function uniqueRowsByNameScope(records, label, year) {
  const map = new Map();
  for (const record of records) {
    const key = seasonTeamPhaseRowKey(record, label);
    if (key.seasonStartYear !== year) {
      fail('player-evidence-season-mismatch', `${label} contains a row outside exact season ${year}.`);
    }
    if (map.has(key.key)) {
      fail('player-evidence-name-scope-ambiguous', `${label} has duplicate strict name-season-team-phase keys.`);
    }
    map.set(key.key, { record, key });
  }
  return map;
}

/**
 * Map only the season-scoped, name-keyed portion of player evidence. It is
 * deliberately separate from the broader `playerContext` capability because
 * unpinned current profile snapshots do not have season or player identity.
 */
export function mapCanonicalV4PlayerSeasonEvidence(verifiedData) {
  if (!isObject(verifiedData) || verifiedData.status !== 'verified-data-access'
    || verifiedData.format !== 'djhc-swishiq-v4-studio-runtime-adapter-v2'
    || verifiedData.capabilityId !== FRANCHISE_CAPABILITY
    || verifiedData.capability?.evidenceState !== 'evidence'
    || verifiedData.capability?.descriptiveDataAccess !== 'available'
    || !verifiedData.capability?.artifactIds?.includes(ROSTER_MEMBERSHIP_ARTIFACT)
    || !verifiedData.supplementalArtifactIds?.includes(PLAYER_SEASON_ARTIFACT)) {
    fail('verified-franchise-data-required', 'Verified exact franchise data plus the approved player-seasons supplement are required.');
  }
  if (verifiedData.scope?.kind !== 'exact-season' || verifiedData.scope?.seasonStartYears?.length !== 1) {
    fail('exact-season-required', 'Player season evidence requires exactly one V4 season package.');
  }
  const year = verifiedData.scope.seasonStartYears[0];
  if (!Number.isSafeInteger(year) || verifiedData.package?.packageId !== exactPackageId(year)
    || !scopeMatches(verifiedData.package?.scope, year)
    || !scopeMatches(verifiedData.scope, year)) {
    fail('package-scope-mismatch', 'The verified package is not the requested exact-season V4 package.');
  }
  const requestedPhases = verifiedData.scope.phases;
  const packagePhases = verifiedData.package.scope.phases;
  if (!Array.isArray(requestedPhases) || !requestedPhases.length
    || requestedPhases.some(phase => !ALLOWED_PHASES.has(phase))
    || !Array.isArray(packagePhases)
    || requestedPhases.some(phase => !packagePhases.includes(phase))) {
    fail('player-evidence-phase-unavailable', 'The exact package scope does not declare every requested player-evidence phase.');
  }
  const playerPart = verifiedData.parts?.[PLAYER_SEASON_ARTIFACT];
  const rosterPart = verifiedData.parts?.[ROSTER_MEMBERSHIP_ARTIFACT];
  requireCompletePart(playerPart, PLAYER_SEASON_ARTIFACT, year);
  requireCompletePart(rosterPart, ROSTER_MEMBERSHIP_ARTIFACT, year);

  const playerCoveragePhases = playerPart.part.coverage.canonicalPhases;
  const rosterCoveragePhases = rosterPart.part.coverage.canonicalPhases;
  if (!Array.isArray(playerCoveragePhases) || !Array.isArray(rosterCoveragePhases)
    || requestedPhases.some(phase => !playerCoveragePhases.includes(phase) || !rosterCoveragePhases.includes(phase))) {
    fail('player-evidence-phase-unavailable', 'The verified player parts do not contain every requested phase.');
  }
  const phases = new Set(requestedPhases);
  const playerRows = playerPart.records.filter(row => phases.has(row?.time?.phase || row?.values?.phase));
  const rosterRows = rosterPart.records.filter(row => phases.has(row?.time?.phase || row?.values?.phase));
  const players = uniqueRowsByNameScope(playerRows, PLAYER_SEASON_ARTIFACT, year);
  const memberships = uniqueRowsByNameScope(rosterRows, ROSTER_MEMBERSHIP_ARTIFACT, year);
  const membershipRows = [...memberships.values()].map(({ record }) => record);
  const usedMemberships = new Set();
  const evidenceRows = [...players.values()].map(({ record, key }) => {
    const nameMatch = resolveCanonicalV4PlayerNameSeasonMatch({
      canonicalDisplayName: record.values.displayName,
      seasonStartYear: year,
      teamCode: key.teamCode,
      phase: key.phase,
      candidates: membershipRows,
    });
    if (nameMatch.status !== 'matched') {
      fail(nameMatch.status === 'ambiguous' ? 'player-evidence-roster-join-ambiguous' : 'player-evidence-roster-join-incomplete',
        `A player-season row has no unique name-keyed roster match for exact ${year} ${key.teamCode} ${key.phase}.`);
    }
    const membership = nameMatch.candidate;
    const membershipKey = seasonTeamPhaseRowKey(membership, ROSTER_MEMBERSHIP_ARTIFACT).key;
    if (usedMemberships.has(membershipKey)) {
      fail('player-evidence-roster-join-ambiguous', 'A roster row matched more than one player-season identity.');
    }
    usedMemberships.add(membershipKey);
    const values = record.values;
    const rosterValues = membership.values;
    const boxErrors = boxCountIdentityErrors(values.box);
    if (boxErrors.length) {
      const rowRef = typeof record.recordId === 'string' ? record.recordId : key.key;
      fail('player-evidence-box-count-reconciliation',
        `V4 player-season row ${rowRef} (${year} ${key.teamCode} ${key.phase}) has missing or non-reconciled box-count evidence: ${boxErrors.map(error => error.message).join(' ')}`);
    }
    if (record.temporalUse?.role !== 'descriptive'
      || record.temporalUse?.eligibleForPredictiveFeatures !== false) {
      fail('player-evidence-temporal-boundary-invalid', 'Full-season player rows must remain descriptive and prediction-ineligible.');
    }
    return Object.freeze({
      playerNameKey: key.normalizedPlayerNameKey,
      normalizedPlayerNameKey: key.normalizedPlayerNameKey,
      playerSeasonKey: `${key.normalizedPlayerNameKey}|${year}`,
      displayName: values.displayName,
      nameIdentity: Object.freeze({
        canonicalDisplayName: values.displayName,
        canonicalNormalizedPlayerNameKey: key.normalizedPlayerNameKey,
        sourceDisplayName: nameMatch.sourceDisplayName,
        sourceNormalizedPlayerNameKey: nameMatch.sourceNormalizedPlayerNameKey,
        nameKeyVersion: CANONICAL_V4_PLAYER_NAME_KEY_VERSION,
        matchType: nameMatch.matchType,
        playerNameMatchKeyVersion: nameMatch.playerNameMatchKeyVersion,
        playerNameMatchKey: nameMatch.playerNameMatchKey,
        matchEvidence: Object.freeze({
          exactSeasonStartYear: year,
          teamCode: key.teamCode,
          phase: key.phase,
          candidateCountBeforeTeamContext: nameMatch.candidateCountBeforeTeamContext,
          candidateCountAfterTeamContext: nameMatch.candidateCountAfterTeamContext,
          teamContextUsed: nameMatch.teamContextUsed,
          providerIdsUsed: false,
          personContinuityProven: false,
        }),
      }),
      seasonStartYear: year,
      phase: key.phase,
      teamCode: key.teamCode,
      positions: Object.freeze([...(Array.isArray(values.positions) ? values.positions : [])]),
      observed: values.observed === true,
      age: Number.isFinite(values.age) ? values.age : null,
      games: Number.isFinite(values.games) ? values.games : null,
      starts: Number.isFinite(values.starts) ? values.starts : null,
      minutes: Number.isFinite(values.minutes) ? values.minutes : null,
      box: values.box,
      boxCountReconciliation: Object.freeze({
        status: 'reconciled',
        artifactId: PLAYER_SEASON_ARTIFACT,
        checks: BOX_COUNT_IDENTITY_CHECKS,
      }),
      metrics: values.metrics,
      metricNullReasons: values.metricNullReasons,
      shotProfile: values.shotProfile,
      playType: values.playType,
      roster: Object.freeze({
        positions: Object.freeze([...(Array.isArray(rosterValues.positions) ? rosterValues.positions : [])]),
        displayEligible: rosterValues.displayEligible === true,
      }),
      temporalUse: Object.freeze({
        role: 'descriptive',
        eligibleForPredictiveFeatures: false,
        reason: record.temporalUse.eligibilityReason,
      }),
    });
  });
  if (usedMemberships.size !== memberships.size) {
    fail('player-evidence-roster-join-incomplete', 'One or more roster rows do not map to a unique player-season name key.');
  }
  evidenceRows.sort((left, right) => left.normalizedPlayerNameKey.localeCompare(right.normalizedPlayerNameKey)
    || left.teamCode.localeCompare(right.teamCode) || left.phase.localeCompare(right.phase));

  return Object.freeze({
    format: CANONICAL_V4_PLAYER_SEASON_EVIDENCE_FORMAT,
    version: CANONICAL_V4_PLAYER_SEASON_EVIDENCE_VERSION,
    status: 'verified-exact-season-player-evidence',
    package: verifiedData.package,
    scope: verifiedData.scope,
    source: Object.freeze({
      ...verifiedData.source,
      playerSeasonsPartSha256: playerPart.sha256,
      rosterMembershipsPartSha256: rosterPart.sha256,
    }),
    rowCount: evidenceRows.length,
    playerSeasonRows: Object.freeze(evidenceRows),
    joinPolicy: 'strict-normalized-name-first-then-unique-lossy-exact-season-team-phase',
    playerNameKeyVersion: CANONICAL_V4_PLAYER_NAME_KEY_VERSION,
    playerNameMatchKeyVersion: CANONICAL_V4_PLAYER_NAME_MATCH_KEY_VERSION,
    omittedArtifacts: Object.freeze(['player-profile-snapshots']),
    useBoundary: Object.freeze({
      descriptiveDataAccess: 'verified',
      playerIdentity: 'conservative-normalized-display-name-primary-scoped-by-season-team-phase',
      providerPlayerIdsUsed: false,
      profileSnapshotsUsed: false,
      modelInputs: 'typed-inputs-only',
      modelExecution: 'not-performed',
      predictiveEligibility: 'ineligible-until-model-validation-and-point-in-time-input-review',
      approvalClaimsMade: false,
    }),
  });
}

export async function loadCanonicalV4ExactPlayerSeasonEvidence({
  seasonStartYear,
  phases = ['regular'],
  releasePin,
  fetchImpl,
  signal,
  requestTimeoutMs,
  baseUrl,
} = {}) {
  if (!Array.isArray(phases) || !phases.length || new Set(phases).size !== phases.length
    || phases.some(phase => !ALLOWED_PHASES.has(phase))) {
    fail('player-evidence-phase-request-invalid', 'Request one or more distinct supported player-evidence phases.');
  }
  const verifiedData = await loadCanonicalV4StudioExactSeasonData({
    seasonStartYear,
    phases: Array.isArray(phases) ? [...phases] : phases,
    capabilityId: FRANCHISE_CAPABILITY,
    additionalArtifactIds: [PLAYER_SEASON_ARTIFACT],
    ...(releasePin ? { releasePin } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(signal ? { signal } : {}),
    ...(requestTimeoutMs ? { requestTimeoutMs } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
  return mapCanonicalV4PlayerSeasonEvidence(verifiedData);
}
