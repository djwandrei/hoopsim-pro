import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  loadCanonicalV4StudioExactSeasonData,
} from '/tools/swishiq-studio/engine/canonical-v4-studio-runtime-adapter.js?v=20261008&rev=franchise-v4-intake-v1';
import { mapCanonicalV4PlayerSeasonEvidence } from '/tools/swishiq-studio/engine/canonical-v4-player-season-evidence.js?v=20261008&rev=franchise-v4-intake-v1';
import { normalizeCanonicalV4PlayerNameKey } from '/tools/swishiq-studio/engine/canonical-v4-player-name-identity.js?v=20261008&rev=franchise-v4-intake-v1';
import { NBA_TEAM_CODES, normalizeNbaScheduleArtifact, selectActualNbaSchedule } from '/tools/swishiq-studio/engine/nba-schedule-source.js?v=20261008&rev=franchise-v4-intake-v1';
import { resolveSeasonAgeByName, SEASON_AGE_INDEX_FORMAT } from '../lib/season-age-transition-v1.mjs';
import { createLeagueState, normalizeCanonicalPlayerName } from '../lib/simulation-contracts-v1.mjs';

export const V4_FRANCHISE_INTAKE_FORMAT = 'djhc-v4-franchise-intake-v1';
export const V4_FRANCHISE_INTAKE_VERSION = '1.0.0';
export const V4_FRANCHISE_SCENARIO_MODE = 'retrospective-user-scenario';
export const V4_LAST_OBSERVED_TEAM_POLICY = 'last-observed-team-scenario';

const DEFAULT_V4_RELEASE_PIN = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN;

export const V4_FRANCHISE_SOURCE_PINS = Object.freeze({
  scheduleArtifact: Object.freeze({
    artifactId: 'nba-actual-schedules-v1',
    path: '../../../tools/swishiq-studio/data/nba-actual-schedules-v1.json',
    sha256: '522ed031595601aff75b26d5f3d3cc8022525c0e8b29d072baa0b626d54d4e3e',
  }),
  seasonAgeIndex: Object.freeze({
    artifactId: 'season-age-anchor-index-v1',
    path: '../data/season-age-anchor-index-v1.json',
    sha256: 'b8d38d4861c2af3a76684c0d228d04dc2c1941f22ed0893688dcdc5961f36df4',
  }),
});

const REGULAR_PHASES = Object.freeze(['regular']);
const PLAYER_RATE_FIELDS = Object.freeze({
  pointsPer36: { boxKey: 'points', metricKey: 'pointsPer36' },
  reboundsPer36: { boxKey: 'rebounds', metricKey: 'reboundsPer36' },
  assistsPer36: { boxKey: 'assists', metricKey: 'assistsPer36' },
  stealsPer36: { boxKey: 'steals', metricKey: 'stealsPer36' },
  blocksPer36: { boxKey: 'blocks', metricKey: 'blocksPer36' },
  turnoversPer36: { boxKey: 'turnovers', metricKey: 'turnoversPer36' },
  threesPer36: { boxKey: 'threePointersMade', metricKey: 'threePointersMadePer36' },
  fieldGoalAttemptsPer36: { boxKey: 'fieldGoalAttempts', metricKey: 'fieldGoalAttemptsPer36' },
  freeThrowAttemptsPer36: { boxKey: 'freeThrowAttempts', metricKey: 'freeThrowAttemptsPer36' },
  threePointAttemptsPer36: { boxKey: 'threePointAttempts', metricKey: 'threePointAttemptsPer36' },
});

const RATING_SCENARIO_MAPPINGS = Object.freeze({
  overallRating: 'value',
  scoringRating: 'components.domainPercentiles.scoring',
  shootingRating: 'components.domainPercentiles.shooting',
  creationRating: 'components.domainPercentiles.creation',
  reboundingRating: 'components.domainPercentiles.rebounding',
  // This source component measures defensive activity; the mapping is a
  // simulation scenario input, not a claim that it is a pure defense skill.
  defenseRating: 'components.domainPercentiles.defensiveActivity',
});

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const normalizedPhase = row => row?.time?.phase ?? row?.values?.phase ?? null;
const normalizedSeason = row => row?.time?.seasonStartYear ?? row?.values?.seasonStartYear ?? null;
const normalizedTeam = row => String(row?.values?.teamCode ?? row?.entities?.teamCode ?? '').trim().toUpperCase();
const safeText = value => typeof value === 'string' && value.trim() ? value.trim() : null;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function deeplyEqualPinValue(left, right) {
  if (Object.is(left, right)) return true;
  if (left instanceof Map || right instanceof Map) {
    if (!(left instanceof Map) || !(right instanceof Map) || left.size !== right.size) return false;
    for (const [key, value] of left) {
      if (!right.has(key) || !deeplyEqualPinValue(value, right.get(key))) return false;
    }
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => deeplyEqualPinValue(value, right[index]));
  }
  if (!object(left) || !object(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index]
      && deeplyEqualPinValue(left[key], right[key]));
}

/**
 * Build an explicit same-origin preview pin. The immutable release registry
 * path is mirrored at the current browser origin; every reviewed hash and
 * package identity remains byte-for-byte equal to the canonical pin.
 */
export function createV4FranchiseLocalMirrorReleasePinV1({
  origin = globalThis.location?.origin,
} = {}) {
  if (typeof origin !== 'string' || !origin.trim()) {
    fail('local-mirror-origin-required', 'A same-origin HTTP(S) preview origin is required to mirror the pinned V4 registry.');
  }
  let canonical;
  let mirrorOrigin;
  try {
    canonical = new URL(DEFAULT_V4_RELEASE_PIN.registryUrl);
    mirrorOrigin = new URL(origin);
  } catch (error) {
    fail('local-mirror-origin-invalid', `The V4 local-mirror origin is invalid: ${error.message}`);
  }
  if (!['https:', 'http:'].includes(mirrorOrigin.protocol)
    || mirrorOrigin.username || mirrorOrigin.password || mirrorOrigin.search || mirrorOrigin.hash
    || mirrorOrigin.pathname !== '/') {
    fail('local-mirror-origin-invalid', 'The origin must be an HTTP(S) origin without credentials, path, query, or fragment.');
  }
  if (mirrorOrigin.origin === canonical.origin) return DEFAULT_V4_RELEASE_PIN;
  const mirroredRegistry = new URL(canonical.pathname, mirrorOrigin.origin);
  return Object.freeze({ ...DEFAULT_V4_RELEASE_PIN, registryUrl: mirroredRegistry.href });
}

function resolveReviewedV4ReleasePin(releasePin = DEFAULT_V4_RELEASE_PIN) {
  if (!object(releasePin) || typeof releasePin.registryUrl !== 'string') {
    fail('release-pin-invalid', 'The reviewed canonical V4 release pin or its registry-origin-only clone is required.');
  }
  const canonicalComparison = { ...releasePin, registryUrl: DEFAULT_V4_RELEASE_PIN.registryUrl };
  if (!deeplyEqualPinValue(canonicalComparison, DEFAULT_V4_RELEASE_PIN)) {
    fail('release-pin-override-rejected', 'Only the registry URL may differ from the reviewed canonical V4 release pin; all hashes and package identity pins must remain unchanged.');
  }
  let candidateUrl;
  let canonicalUrl;
  try {
    candidateUrl = new URL(releasePin.registryUrl);
    canonicalUrl = new URL(DEFAULT_V4_RELEASE_PIN.registryUrl);
  } catch (error) {
    fail('release-pin-registry-url-invalid', `The V4 release pin registry URL is invalid: ${error.message}`);
  }
  if (!['https:', 'http:'].includes(candidateUrl.protocol)
    || candidateUrl.username || candidateUrl.password || candidateUrl.search || candidateUrl.hash
    || candidateUrl.pathname !== canonicalUrl.pathname) {
    fail('release-pin-registry-url-invalid', 'The mirrored registry must retain the canonical versioned release path and use an uncredentialed HTTP(S) URL without query or fragment.');
  }
  const runtimeOrigin = globalThis.location?.origin;
  if (runtimeOrigin && candidateUrl.origin !== runtimeOrigin) {
    fail('release-pin-origin-mismatch', 'A browser-local V4 registry mirror must use the current page origin.');
  }
  return releasePin;
}

function releasePinReceipt(releasePin) {
  const selectedPin = resolveReviewedV4ReleasePin(releasePin);
  const selectedUrl = new URL(selectedPin.registryUrl);
  const canonicalUrl = new URL(DEFAULT_V4_RELEASE_PIN.registryUrl);
  return Object.freeze({
    registryUrl: selectedUrl.href,
    registryOrigin: selectedUrl.origin,
    registryPath: selectedUrl.pathname,
    reviewedRegistryUrl: canonicalUrl.href,
    localMirror: selectedUrl.origin !== canonicalUrl.origin,
    registrySha256: selectedPin.registrySha256,
    registryRevisionSha256: selectedPin.registryRevisionSha256,
    bundleId: selectedPin.expectedIdentity.bundle.bundleId,
    bundleVersion: selectedPin.expectedIdentity.bundle.bundleVersion,
    bundleManifestSha256: selectedPin.expectedIdentity.bundle.manifestSha256,
    packagePinCount: selectedPin.packagePins.length,
    pinBoundary: 'Only registry origin may be changed; registry path, hash, revision, bundle identity, and all package hashes/identities remain the reviewed release pins.',
  });
}

function requireRetrospectiveRegularRequest({ seasonStartYear, phase = 'regular', mode = V4_FRANCHISE_SCENARIO_MODE } = {}) {
  if (!Number.isSafeInteger(seasonStartYear) || seasonStartYear < 2017 || seasonStartYear > 2025) {
    fail('season-unsupported', 'V4 franchise intake needs one supported exact season start year from 2017 through 2025.');
  }
  if (phase !== 'regular') {
    fail('regular-season-only', 'This intake initializes regular-season retrospective scenarios only.');
  }
  if (mode !== V4_FRANCHISE_SCENARIO_MODE) {
    fail('scenario-mode-unsupported', 'V4 full-season aggregates are not a pregame forecast. Use retrospective-user-scenario mode.');
  }
}

function partRecords(verifiedData, artifactId) {
  const part = verifiedData?.parts?.[artifactId];
  if (!part || part.status !== 'verified' || !Array.isArray(part.records)
    || part.records.length !== part.rows || !/^[a-f0-9]{64}$/.test(part.sha256 || '')) {
    fail('verified-part-required', `Verified complete V4 artifact ${artifactId} is required.`);
  }
  return part;
}

function partReceipt(part) {
  return Object.freeze({
    artifactId: part.artifactId,
    status: part.status,
    rows: part.rows,
    sha256: part.sha256,
    coverage: part.part?.coverage ?? null,
    provenance: part.part?.provenance ?? null,
  });
}

function verifiedSourceReceipt(verifiedData) {
  return Object.freeze({
    format: verifiedData.format,
    capabilityId: verifiedData.capabilityId,
    capability: verifiedData.capability,
    supplementalArtifactIds: verifiedData.supplementalArtifactIds,
    scope: verifiedData.scope,
    package: verifiedData.package,
    source: verifiedData.source,
    parts: Object.freeze(Object.fromEntries(Object.entries(verifiedData.parts || {})
      .map(([artifactId, part]) => [artifactId, partReceipt(part)]))),
    useBoundary: verifiedData.useBoundary,
  });
}

function partSha(verifiedData, artifactId) {
  return verifiedData?.parts?.[artifactId]?.sha256 ?? null;
}

function exactPlayerSeasonKey(name, seasonStartYear, teamCode, phase) {
  return `${normalizeCanonicalV4PlayerNameKey(name)}|${seasonStartYear}|${teamCode}|${phase}`;
}

function buildRawPlayerSourceMap(verifiedFranchiseData, seasonStartYear) {
  const playerPart = partRecords(verifiedFranchiseData, 'player-seasons');
  const rows = playerPart.records.filter(row => normalizedSeason(row) === seasonStartYear && normalizedPhase(row) === 'regular');
  const byKey = new Map();
  for (const record of rows) {
    const name = safeText(record?.values?.displayName);
    const teamCode = normalizedTeam(record);
    const phase = normalizedPhase(record);
    const key = exactPlayerSeasonKey(name, seasonStartYear, teamCode, phase);
    if (!name || !teamCode || !record.recordId || byKey.has(key)) {
      fail('player-season-raw-key-invalid', 'Raw player-seasons rows need unique strict name-season-team-phase keys and record IDs.');
    }
    byKey.set(key, record);
  }
  return { part: playerPart, rows, byKey };
}

function typedPlayerSeasonRows(verifiedFranchiseData, seasonStartYear) {
  const typedEvidence = mapCanonicalV4PlayerSeasonEvidence(verifiedFranchiseData);
  const rawSource = buildRawPlayerSourceMap(verifiedFranchiseData, seasonStartYear);
  if (typedEvidence.scope.seasonStartYears[0] !== seasonStartYear) {
    fail('player-season-scope-mismatch', 'Typed player evidence does not match the requested exact season.');
  }
  const rows = typedEvidence.playerSeasonRows.filter(row => row.seasonStartYear === seasonStartYear && row.phase === 'regular')
    .map(row => {
      const key = exactPlayerSeasonKey(row.displayName, seasonStartYear, row.teamCode, row.phase);
      const rawRecord = rawSource.byKey.get(key);
      if (!rawRecord) fail('player-season-source-join-missing', `Typed evidence has no raw source row for ${key}.`);
      return Object.freeze({
        ...row,
        source: Object.freeze({
          artifactId: 'player-seasons',
          recordId: rawRecord.recordId,
          partSha256: rawSource.part.sha256,
          packageId: verifiedFranchiseData.package.packageId,
          packageVersion: verifiedFranchiseData.package.packageVersion,
          identityBoundary: 'name-season-team-phase; V4 playerRef values are not used to establish person continuity',
        }),
        rawRecord,
      });
    });
  if (rows.length !== typedEvidence.playerSeasonRows.filter(row => row.phase === 'regular').length
    || rows.length !== rawSource.rows.length) {
    fail('player-season-row-coverage-mismatch', 'Typed and raw exact regular-season player evidence row counts do not reconcile.');
  }
  return { typedEvidence, rows, part: rawSource.part };
}

function buildPlayerRateEvidence(row) {
  const rates = {};
  const box = object(row.box) ? row.box : {};
  const minutes = finite(row.minutes) && row.minutes > 0 ? row.minutes : null;
  for (const [field, definition] of Object.entries(PLAYER_RATE_FIELDS)) {
    const metric = row.metrics?.[definition.metricKey];
    if (metric?.status === 'available' && finite(metric.value)) {
      rates[field] = Object.freeze({
        value: metric.value,
        unit: metric.unit,
        status: 'available',
        method: 'canonical-v4-player-season-metric',
        metricKey: definition.metricKey,
        numerator: metric.numerator ?? null,
        denominator: metric.denominator ?? null,
        knownGames: metric.knownGames ?? row.games ?? null,
        reason: null,
        source: row.source,
        temporalUse: row.temporalUse,
      });
      continue;
    }
    const count = box[definition.boxKey];
    if (minutes !== null && finite(count) && count >= 0) {
      rates[field] = Object.freeze({
        value: count * 36 / minutes,
        unit: 'per-36-minutes',
        status: 'derived-descriptive-scenario-rate',
        method: 'full-season-box-count-times-36-divided-by-observed-total-minutes',
        numerator: count,
        denominator: minutes,
        reason: metric?.reason ?? 'canonical-v4-per36-metric-unavailable; derived from exact-season box counts and minutes',
        source: row.source,
        temporalUse: row.temporalUse,
      });
      continue;
    }
    rates[field] = Object.freeze({
      value: null,
      unit: 'per-36-minutes',
      status: 'unavailable',
      method: null,
      numerator: finite(count) ? count : null,
      denominator: minutes,
      reason: metric?.reason ?? 'missing-valid-full-season-count-or-minutes',
      source: row.source,
      temporalUse: row.temporalUse,
    });
  }
  return Object.freeze(rates);
}

function metricSummary(record, key) {
  const metric = record?.values?.metrics?.[key];
  return Object.freeze({
    value: finite(metric?.value) ? metric.value : null,
    unit: metric?.unit ?? null,
    status: metric?.status ?? 'unavailable',
    numerator: metric?.numerator ?? null,
    denominator: metric?.denominator ?? null,
    evidenceKind: metric?.evidenceKind ?? null,
    reason: metric?.reason ?? null,
  });
}

function buildTeamRateEvidence(verifiedSeasonLabData, seasonStartYear) {
  const part = partRecords(verifiedSeasonLabData, 'team-styles');
  const records = part.records.filter(row => normalizedSeason(row) === seasonStartYear && normalizedPhase(row) === 'regular');
  const byTeam = new Map();
  for (const record of records) {
    const teamCode = normalizedTeam(record);
    if (!teamCode || byTeam.has(teamCode)) fail('team-style-key-invalid', 'Exact-season regular team-style rows must be unique by team code.');
    const metrics = record.values?.metrics ?? {};
    byTeam.set(teamCode, Object.freeze({
      teamCode,
      phase: 'regular',
      source: Object.freeze({
        artifactId: 'team-styles',
        recordId: record.recordId ?? null,
        partSha256: part.sha256,
        evidenceKind: record.values?.evidenceKind ?? record.evidence?.kind ?? null,
        temporalUse: record.temporalUse ?? null,
      }),
      metrics: Object.freeze({
        offense: metricSummary(record, 'offense'),
        defense: metricSummary(record, 'defense'),
        pace48: metricSummary(record, 'pace48'),
        pointsPerGame: metricSummary(record, 'pointsPerGame'),
        pointsAllowedPerGame: metricSummary(record, 'pointsAllowedPerGame'),
        net: metricSummary(record, 'net'),
      }),
      rawRecord: record,
      mappingBoundary: 'retrospective descriptive team rates; not pregame forecast features or 0-100 ratings',
    }));
  }
  const missingTeamCodes = NBA_TEAM_CODES.filter(code => !byTeam.has(code));
  return Object.freeze({
    status: missingTeamCodes.length ? 'partial' : 'verified-exact-regular-team-rates',
    seasonStartYear,
    phase: 'regular',
    teamCount: byTeam.size,
    expectedTeamCount: NBA_TEAM_CODES.length,
    missingTeamCodes: Object.freeze(missingTeamCodes),
    rows: Object.freeze([...byTeam.values()].sort((a, b) => a.teamCode.localeCompare(b.teamCode))),
    source: partReceipt(part),
    mappingBoundary: 'descriptive only; never treated as pregame team ratings/features',
  });
}

function buildRatingMap(verifiedRatingData, seasonStartYear) {
  const part = partRecords(verifiedRatingData, 'djhc-own-player-seasons');
  const matchingRows = part.records.filter(row => normalizedSeason(row) === seasonStartYear
    && normalizedPhase(row) === 'regular'
    && row?.values?.ratingMetricId === 'djhc.rating.overall');
  const byName = new Map();
  for (const rawRecord of matchingRows) {
    const name = safeText(rawRecord.values?.displayName);
    const key = normalizeCanonicalV4PlayerNameKey(name);
    if (!key) continue;
    const rows = byName.get(key) ?? [];
    rows.push(rawRecord);
    byName.set(key, rows);
  }
  return { part, byName };
}

function getRatingPath(record, path) {
  return path.split('.').reduce((value, key) => value?.[key], record?.values);
}

function ratingEvidenceFor(playerRow, ratingMap) {
  const matches = ratingMap.byName.get(playerRow.normalizedPlayerNameKey) ?? [];
  if (!matches.length) return Object.freeze({ status: 'unavailable-exact-name-season-match', scenarioAttributes: Object.freeze({}), source: null });
  if (matches.length !== 1) return Object.freeze({ status: 'ambiguous-exact-name-season-match', scenarioAttributes: Object.freeze({}), source: null,
    matchingRecordIds: Object.freeze(matches.map(row => row.recordId ?? null)) });
  const record = matches[0];
  const scenarioAttributes = {};
  for (const [field, path] of Object.entries(RATING_SCENARIO_MAPPINGS)) {
    const value = getRatingPath(record, path);
    if (finite(value)) scenarioAttributes[field] = value;
  }
  return Object.freeze({
    status: Object.keys(scenarioAttributes).length === Object.keys(RATING_SCENARIO_MAPPINGS).length ? 'available' : 'partial',
    ratingSystemId: record.values?.ratingSystemId ?? null,
    ratingMetricId: record.values?.ratingMetricId ?? null,
    scenarioAttributes: Object.freeze(scenarioAttributes),
    source: Object.freeze({
      artifactId: 'djhc-own-player-seasons',
      recordId: record.recordId ?? null,
      partSha256: ratingMap.part.sha256,
      seasonStartYear: normalizedSeason(record),
      phase: normalizedPhase(record),
      unit: record.values?.unit ?? null,
      componentMappings: RATING_SCENARIO_MAPPINGS,
      sourceTemporalUse: record.temporalUse ?? null,
      useBoundary: 'retrospective descriptive scenario attributes only; same-season pregame forecast features are explicitly ineligible',
    }),
    rawRecord: record,
  });
}

function groupPlayerSeasonRowsByName(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.normalizedPlayerNameKey;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function normalizeRosterChoices(rosterChoicesByName = {}) {
  const entries = rosterChoicesByName instanceof Map
    ? [...rosterChoicesByName.entries()]
    : object(rosterChoicesByName) ? Object.entries(rosterChoicesByName) : null;
  if (!entries) fail('roster-choices-invalid', 'rosterChoicesByName must be a plain object or Map of exact player name keys to team codes.');
  const normalized = new Map();
  const duplicateKeys = [];
  for (const [keyValue, teamValue] of entries) {
    const key = normalizeCanonicalV4PlayerNameKey(keyValue);
    const teamCode = typeof teamValue === 'string' ? teamValue.trim().toUpperCase() : '';
    if (!key || !/^[A-Z]{2,4}$/.test(teamCode)) {
      fail('roster-choice-invalid-entry', 'Every roster choice needs a nonempty exact player name/key and a team code.');
    }
    if (normalized.has(key)) duplicateKeys.push(key);
    normalized.set(key, teamCode);
  }
  if (duplicateKeys.length) fail('roster-choice-key-duplicate', `Multiple roster choices normalize to the same exact player name key: ${[...new Set(duplicateKeys)].join(', ')}.`);
  return normalized;
}

function suggestionFor(nameKey, teamSuggestionsByName) {
  if (teamSuggestionsByName instanceof Map) return teamSuggestionsByName.get(nameKey) ?? null;
  return object(teamSuggestionsByName) ? teamSuggestionsByName[nameKey] ?? null : null;
}

function chooseRosterRows(playerRows, { rosterChoicesByName = {}, teamSuggestionsByName = {} } = {}) {
  const groups = groupPlayerSeasonRowsByName(playerRows);
  const explicitChoices = normalizeRosterChoices(rosterChoicesByName);
  const usedChoiceKeys = new Set();
  const selectedRows = [];
  const unresolvedRosterChoices = [];
  const invalidChoices = [];

  for (const [nameKey, candidates] of groups) {
    const options = [...candidates].sort((a, b) => a.teamCode.localeCompare(b.teamCode));
    const requestedTeam = explicitChoices.get(nameKey) ?? null;
    if (requestedTeam) usedChoiceKeys.add(nameKey);
    if (options.length === 1) {
      if (requestedTeam && requestedTeam !== options[0].teamCode) {
        invalidChoices.push({ normalizedPlayerNameKey: nameKey, requestedTeamCode: requestedTeam,
          allowedTeamCodes: [options[0].teamCode], reason: 'choice-team-not-present-in-exact-season-aggregate-rows' });
        unresolvedRosterChoices.push(choicePrompt(nameKey, options, teamSuggestionsByName, 'invalid-team-choice'));
      } else {
        selectedRows.push({ row: options[0], choiceSource: requestedTeam ? 'explicit-user-selection' : 'unique-exact-season-team-row' });
      }
      continue;
    }
    const optionTeamCodes = [...new Set(options.map(row => row.teamCode))];
    if (optionTeamCodes.length === 1) {
      selectedRows.push({ row: options[0], choiceSource: 'unique-exact-season-team-row' });
      continue;
    }
    if (requestedTeam && optionTeamCodes.includes(requestedTeam)) {
      const row = options.find(candidate => candidate.teamCode === requestedTeam);
      selectedRows.push({ row, choiceSource: 'explicit-user-selection' });
      continue;
    }
    if (requestedTeam) {
      invalidChoices.push({ normalizedPlayerNameKey: nameKey, requestedTeamCode: requestedTeam,
        allowedTeamCodes: optionTeamCodes, reason: 'choice-team-not-present-in-exact-season-aggregate-rows' });
    }
    unresolvedRosterChoices.push(choicePrompt(nameKey, options, teamSuggestionsByName,
      requestedTeam ? 'invalid-team-choice' : 'multiple-regular-season-team-rows'));
  }

  const unknownChoiceKeys = [...explicitChoices.keys()].filter(key => !usedChoiceKeys.has(key) && !groups.has(key));
  return { selectedRows, unresolvedRosterChoices, invalidChoices, unknownChoiceKeys };
}

function choicePrompt(nameKey, rows, teamSuggestionsByName, reason) {
  const first = rows[0];
  return Object.freeze({
    normalizedPlayerNameKey: nameKey,
    displayName: first?.displayName ?? nameKey,
    reason,
    explicitUserChoiceRequired: true,
    options: Object.freeze(rows.map(row => Object.freeze({
      teamCode: row.teamCode,
      phase: row.phase,
      seasonStartYear: row.seasonStartYear,
      source: row.source,
    }))),
    suggestion: suggestionFor(nameKey, teamSuggestionsByName),
    suggestionPolicyBoundary: 'suggestion is not a roster/contract fact and is never applied automatically',
  });
}

function prototypeIdentityCollisions(selectedRows) {
  const byPrototypeKey = new Map();
  for (const { row } of selectedRows) {
    const key = normalizeCanonicalPlayerName(row.displayName);
    const names = byPrototypeKey.get(key) ?? new Map();
    names.set(row.normalizedPlayerNameKey, row.displayName);
    byPrototypeKey.set(key, names);
  }
  return [...byPrototypeKey.entries()]
    .filter(([, names]) => names.size > 1)
    .map(([prototypeNameKey, names]) => ({
      prototypeNameKey,
      names: [...names.entries()].map(([normalizedPlayerNameKey, displayName]) => ({ normalizedPlayerNameKey, displayName })),
      reason: 'prototype LeagueState lowercases and removes punctuation/diacritics; distinct V4 exact keys collide and need an identity-contract change',
    }));
}

function teamRowKey(scheduledAtUtc, teamCode, opponentTeamCode, isHome) {
  return `${scheduledAtUtc}|${teamCode}|${opponentTeamCode}|${isHome ? 'home' : 'away'}`;
}

function gameLocalDateForRow(row) {
  return row?.time?.gameDateLocal ?? row?.time?.gameLocalDate ?? row?.values?.localGameDate ?? row?.values?.gameLocalDate ?? null;
}

function buildScheduleCrosswalk(scheduleArtifact, verifiedSeasonLabData, seasonStartYear) {
  const teamGamesPart = partRecords(verifiedSeasonLabData, 'team-games');
  const selected = selectActualNbaSchedule(normalizeNbaScheduleArtifact(scheduleArtifact), {
    seasonStartYear,
    teamIds: NBA_TEAM_CODES,
    phases: ['regular'],
  });
  if (selected.status !== 'ready') {
    return Object.freeze({ status: 'unavailable', seasonStartYear, phase: 'regular', reason: selected.reason,
      source: Object.freeze({ artifactId: V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.artifactId,
        sha256: V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.sha256, teamGamesPart: partReceipt(teamGamesPart) }), games: Object.freeze([]) });
  }
  const rows = teamGamesPart.records.filter(row => normalizedSeason(row) === seasonStartYear && normalizedPhase(row) === 'regular');
  const index = new Map();
  for (const row of rows) {
    const scheduledAtUtc = row?.time?.scheduledAtUtc ?? row?.values?.scheduledAtUtc;
    const teamCode = normalizedTeam(row);
    const opponent = String(row?.values?.opponentTeamCode ?? '').trim().toUpperCase();
    const isHome = row?.values?.isHome;
    if (!scheduledAtUtc || !teamCode || !opponent || typeof isHome !== 'boolean') continue;
    const key = teamRowKey(scheduledAtUtc, teamCode, opponent, isHome);
    const matches = index.get(key) ?? [];
    matches.push(row);
    index.set(key, matches);
  }
  const games = [];
  const crosswalkErrors = [];
  for (const game of selected.games) {
    const scheduledAtUtc = game.scheduledAt;
    const homeRows = index.get(teamRowKey(scheduledAtUtc, game.home, game.away, true)) ?? [];
    const awayRows = index.get(teamRowKey(scheduledAtUtc, game.away, game.home, false)) ?? [];
    if (homeRows.length !== 1 || awayRows.length !== 1) {
      crosswalkErrors.push({ scheduleGameId: game.id, homeMatches: homeRows.length, awayMatches: awayRows.length,
        reason: 'schedule-to-team-games-home-away-crosswalk-not-one-to-one' });
      continue;
    }
    const homeDate = gameLocalDateForRow(homeRows[0]);
    const awayDate = gameLocalDateForRow(awayRows[0]);
    const gameLocalDate = homeDate ?? awayDate;
    const gameRefHome = homeRows[0]?.entities?.gameRef ?? homeRows[0]?.values?.gameRef ?? null;
    const gameRefAway = awayRows[0]?.entities?.gameRef ?? awayRows[0]?.values?.gameRef ?? null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gameLocalDate || '') || gameLocalDate !== awayDate
      || !safeText(gameRefHome) || !safeText(gameRefAway) || gameRefHome !== gameRefAway) {
      crosswalkErrors.push({ scheduleGameId: game.id, homeDate, awayDate, gameRefHome, gameRefAway,
        reason: 'local-date-or-game-reference-disagreement' });
      continue;
    }
    games.push(Object.freeze({
      gameId: game.id,
      sourceGameCode: game.sourceGameCode ?? null,
      seasonStartYear,
      phase: 'regular',
      scheduledAtUtc,
      gameLocalDate,
      homeTeamCode: game.home,
      awayTeamCode: game.away,
      sourceGameRef: gameRefHome ?? gameRefAway,
      sourceRecordIds: Object.freeze([homeRows[0].recordId ?? null, awayRows[0].recordId ?? null]),
      sourceArtifacts: Object.freeze([
        Object.freeze({ artifactId: V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.artifactId,
          sha256: V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.sha256, scheduleGameId: game.id }),
        Object.freeze({ artifactId: 'team-games', sha256: teamGamesPart.sha256,
          homeRecordId: homeRows[0].recordId ?? null, awayRecordId: awayRows[0].recordId ?? null }),
      ]),
      scoreUseBoundary: 'observed scores intentionally omitted; schedule is fixture only',
    }));
  }
  const complete = games.length === selected.games.length && crosswalkErrors.length === 0;
  return Object.freeze({
    status: complete ? 'verified-exact-regular-schedule-with-local-date-crosswalk' : 'blocked-crosswalk-incomplete',
    seasonStartYear,
    phase: 'regular',
    gameCount: games.length,
    expectedGameCount: selected.games.length,
    coverage: selected.coverage,
    crosswalkErrorCount: crosswalkErrors.length,
    crosswalkErrors: Object.freeze(crosswalkErrors),
    games: Object.freeze(games),
    sourceReceipt: selected.sourceReceipt,
    source: Object.freeze({
      scheduleArtifact: Object.freeze({ artifactId: V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.artifactId,
        sha256: V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.sha256 }),
      teamGamesPart: partReceipt(teamGamesPart),
    }),
    scheduleScoresIncluded: false,
  });
}

function buildScenarioPlayer(selected, ageIndex, ratingMap) {
  const row = selected.row;
  const rateEvidence = buildPlayerRateEvidence(row);
  const age = resolveSeasonAgeByName({
    index: ageIndex,
    playerName: row.displayName,
    targetSeasonStartYear: row.seasonStartYear,
  });
  const ratingEvidence = ratingEvidenceFor(row, ratingMap);
  const player = {
    canonicalName: row.displayName,
    teamCode: row.teamCode,
    phase: 'regular',
    seasonStartYear: row.seasonStartYear,
    positions: [...(row.positions ?? [])],
    games: row.games,
    starts: row.starts,
    seasonMinutes: row.minutes,
    minutesPerGame: finite(row.minutes) && finite(row.games) && row.games > 0 ? row.minutes / row.games : null,
    box: row.box,
    metrics: row.metrics,
    ...Object.fromEntries(Object.entries(rateEvidence).filter(([, value]) => finite(value.value))
      .map(([field, value]) => [field, value.value])),
    ...(age.status === 'available' ? { age: age.age } : { age: null }),
    ...ratingEvidence.scenarioAttributes,
    ratingEvidence: Object.freeze({
      status: ratingEvidence.status,
      source: ratingEvidence.source,
      scenarioMode: V4_FRANCHISE_SCENARIO_MODE,
      useBoundary: 'descriptive same-season rating attributes affect user-scenario outcomes; this is not a pregame forecast input',
    }),
    ageEvidence: Object.freeze({ ...age, artifactId: V4_FRANCHISE_SOURCE_PINS.seasonAgeIndex.artifactId,
      indexSha256: V4_FRANCHISE_SOURCE_PINS.seasonAgeIndex.sha256 }),
    per36Evidence: rateEvidence,
    sourceEvidence: row.source,
    identityEvidence: row.nameIdentity,
    rosterChoiceSource: selected.choiceSource,
    contractState: Object.freeze({ status: 'unknown', reason: 'No confirmed dated contract evidence is loaded by this intake.' }),
    playerHistoryBoundary: 'season totals and season-end ratings are retrospective scenario attributes; no pregame history is inferred',
  };
  // The full rating row is kept beside the typed player evidence; the state
  // carries a compact record receipt so local saves stay bounded.
  return Object.freeze({ player: Object.freeze(player), rawRatingRecord: ratingEvidence.rawRecord ?? null });
}

function buildState({ seasonStartYear, selectedPlayers, teamRates, sourceReceipts }) {
  const players = selectedPlayers.map(item => item.player);
  const rosterNamesByTeam = new Map(NBA_TEAM_CODES.map(teamCode => [teamCode, []]));
  for (const player of players) rosterNamesByTeam.get(player.teamCode)?.push(player.canonicalName);
  const teams = NBA_TEAM_CODES.map(teamCode => ({
    teamCode,
    rosterNames: rosterNamesByTeam.get(teamCode) ?? [],
    payrollState: { status: 'unknown', components: {}, reason: 'No verified cap ledger, dated contracts, or current legal payroll state is loaded.' },
    teamRateSource: teamRates.rows.find(row => row.teamCode === teamCode)?.source ?? null,
  }));
  const state = createLeagueState({
    seasonStartYear,
    mode: 'provisional-sandbox',
    transactionWindow: 'preseason',
    stateQuality: {
      status: 'provisional',
      reasons: [
        'State was initialized from full-season retrospective aggregates for an explicit user scenario.',
        'Same-season descriptive ratings and box-count rates are not pregame forecasts or validated predictions.',
        'Contract, cap, option, dead-money, and legal payroll state remain unknown.',
      ],
    },
    players,
    teams,
    sourceCatalog: Object.entries(sourceReceipts).filter(([, receipt]) => Boolean(receipt)).map(([key, receipt]) => ({
      artifactId: receipt.artifactId ?? receipt.capabilityId ?? receipt.format ?? key,
      packageId: receipt.package?.packageId ?? null,
      packageVersion: receipt.package?.packageVersion ?? null,
      source: receipt.source ?? null,
    })),
  });
  state.scenarioDisclosure = Object.freeze({
    mode: V4_FRANCHISE_SCENARIO_MODE,
    basis: 'exact-season full-season player and team aggregates plus retrospective season-end ratings',
    predictionClaim: false,
    regularSeasonOnly: true,
    ageConvention: 'Basketball-Reference season age on January 31 of the season second calendar year; missing age anchors remain null',
    ratingUse: 'V4 canonical player ratings remain descriptive scenario attributes and are mapped into simulator player rating fields',
    rosterUse: 'multi-team season rows require a user-selected team; latest-game suggestions are not applied automatically',
    payrollUse: 'unknown; no legal contracts or cap state are asserted',
  });
  state.sourceReceipts = sourceReceipts;
  return state;
}

/**
 * Pure construction step over current verified V4 adapter outputs and pinned
 * static artifacts. The only accepted source phase is regular season and the
 * only mode is an explicitly retrospective/user-created scenario.
 */
export function buildV4FranchiseIntakeV1({
  seasonStartYear,
  phase = 'regular',
  mode = V4_FRANCHISE_SCENARIO_MODE,
  verifiedFranchiseData,
  verifiedSeasonLabData,
  verifiedRatingData,
  scheduleArtifact,
  scheduleArtifactSha256 = V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.sha256,
  ageIndex,
  ageIndexSha256 = V4_FRANCHISE_SOURCE_PINS.seasonAgeIndex.sha256,
  rosterChoicesByName = {},
} = {}) {
  requireRetrospectiveRegularRequest({ seasonStartYear, phase, mode });
  if (scheduleArtifactSha256 !== V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.sha256) {
    fail('schedule-pin-mismatch', 'The schedule artifact hash does not match the reviewed schedule pin.');
  }
  if (ageIndexSha256 !== V4_FRANCHISE_SOURCE_PINS.seasonAgeIndex.sha256
    || ageIndex?.format !== SEASON_AGE_INDEX_FORMAT) {
    fail('age-index-pin-mismatch', 'The exact pinned season-age anchor index is required.');
  }
  if (verifiedFranchiseData?.capabilityId !== 'franchiseInputs'
    || verifiedSeasonLabData?.capabilityId !== 'seasonLabInputs'
    || verifiedRatingData?.capabilityId !== 'playerRatings') {
    fail('verified-v4-capabilities-required', 'Verified franchiseInputs, seasonLabInputs, and playerRatings data are required.');
  }
  for (const source of [verifiedFranchiseData, verifiedSeasonLabData, verifiedRatingData]) {
    if (source.status !== 'verified-data-access' || source.scope?.kind !== 'exact-season'
      || source.scope.seasonStartYears?.length !== 1 || source.scope.seasonStartYears[0] !== seasonStartYear
      || source.scope.phases?.length !== 1 || source.scope.phases[0] !== 'regular') {
      fail('v4-exact-regular-scope-required', 'Every V4 capability must be verified for exactly the same regular season.');
    }
  }
  const typedPlayers = typedPlayerSeasonRows(verifiedFranchiseData, seasonStartYear);
  const teamRates = buildTeamRateEvidence(verifiedSeasonLabData, seasonStartYear);
  const ratingMap = buildRatingMap(verifiedRatingData, seasonStartYear);
  const schedule = buildScheduleCrosswalk(scheduleArtifact, verifiedSeasonLabData, seasonStartYear);
  const choiceResolution = chooseRosterRows(typedPlayers.rows, { rosterChoicesByName });
  const identityCollisions = prototypeIdentityCollisions(choiceResolution.selectedRows);
  const candidateScenarioBySourceKey = new Map(typedPlayers.rows.map(row => {
    const candidate = buildScenarioPlayer({ row, choiceSource: 'candidate-unselected' }, ageIndex, ratingMap);
    return [`${row.normalizedPlayerNameKey}|${row.teamCode}|${row.source.recordId}`, candidate];
  }));
  const selectedPlayers = choiceResolution.selectedRows.map(item => {
    const candidate = candidateScenarioBySourceKey.get(`${item.row.normalizedPlayerNameKey}|${item.row.teamCode}|${item.row.source.recordId}`);
    return { player: Object.freeze({ ...candidate.player, rosterChoiceSource: item.choiceSource }), rawRatingRecord: candidate.rawRatingRecord };
  });
  const ratingPart = partRecords(verifiedRatingData, 'djhc-own-player-seasons');
  const sourceReceipts = Object.freeze({
    franchiseInputs: verifiedSourceReceipt(verifiedFranchiseData),
    seasonLabInputs: verifiedSourceReceipt(verifiedSeasonLabData),
    playerRatings: verifiedSourceReceipt(verifiedRatingData),
    playerGames: null,
    scheduleArtifact: Object.freeze({ artifactId: V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.artifactId,
      sha256: scheduleArtifactSha256, sourceReceipt: schedule.sourceReceipt ?? null }),
    seasonAgeIndex: Object.freeze({ artifactId: V4_FRANCHISE_SOURCE_PINS.seasonAgeIndex.artifactId,
      sha256: ageIndexSha256, format: ageIndex.format, anchorCount: ageIndex.anchors?.length ?? null,
      sourcePartSha256: ageIndex.provenance?.sourcePartSha256 ?? null,
      workbookSha256: ageIndex.provenance?.workbookSha256 ?? null }),
  });
  const issues = [];
  if (choiceResolution.unresolvedRosterChoices.length) issues.push({
    code: 'explicit-roster-choice-required',
    count: choiceResolution.unresolvedRosterChoices.length,
    message: 'Multi-team regular-season aggregates do not establish a unique franchise roster; select an exact team for each listed player.',
  });
  if (choiceResolution.invalidChoices.length) issues.push({ code: 'invalid-roster-choice', rows: choiceResolution.invalidChoices });
  if (choiceResolution.unknownChoiceKeys.length) issues.push({ code: 'unknown-roster-choice-name-keys', keys: choiceResolution.unknownChoiceKeys });
  if (identityCollisions.length) issues.push({ code: 'prototype-name-identity-collision', rows: identityCollisions });
  if (schedule.status !== 'verified-exact-regular-schedule-with-local-date-crosswalk') {
    issues.push({ code: 'schedule-crosswalk-not-ready', status: schedule.status,
      errors: schedule.crosswalkErrors ?? [], reason: schedule.reason ?? null });
  }
  if (teamRates.status !== 'verified-exact-regular-team-rates') issues.push({
    code: 'team-rate-coverage-incomplete', missingTeamCodes: teamRates.missingTeamCodes,
  });
  const ratingEvidenceRows = typedPlayers.rows.map(row => {
    const candidate = candidateScenarioBySourceKey.get(`${row.normalizedPlayerNameKey}|${row.teamCode}|${row.source.recordId}`);
    return Object.freeze({
      canonicalName: row.displayName,
      normalizedPlayerNameKey: row.normalizedPlayerNameKey,
      teamCode: row.teamCode,
      status: candidate.player.ratingEvidence.status,
      source: candidate.player.ratingEvidence.source,
      rawRecord: candidate.rawRatingRecord,
    });
  });
  const playerSeasonEvidence = typedPlayers.rows.map(row => Object.freeze({
    displayName: row.displayName,
    normalizedPlayerNameKey: row.normalizedPlayerNameKey,
    seasonStartYear: row.seasonStartYear,
    phase: row.phase,
    teamCode: row.teamCode,
    games: row.games,
    minutes: row.minutes,
    positions: row.positions,
    age: row.age,
    box: row.box,
    metrics: row.metrics,
    metricNullReasons: row.metricNullReasons,
    temporalUse: row.temporalUse,
    identityEvidence: row.nameIdentity,
    per36Evidence: buildPlayerRateEvidence(row),
    source: row.source,
    rawRecord: row.rawRecord,
    scenarioPlayerCandidate: candidateScenarioBySourceKey.get(`${row.normalizedPlayerNameKey}|${row.teamCode}|${row.source.recordId}`).player,
  }));
  const teamSeasonsPart = partRecords(verifiedFranchiseData, 'team-seasons');
  const rosterMembershipPart = partRecords(verifiedFranchiseData, 'roster-memberships');
  const selectedStateReady = choiceResolution.unresolvedRosterChoices.length === 0
    && choiceResolution.invalidChoices.length === 0
    && choiceResolution.unknownChoiceKeys.length === 0
    && identityCollisions.length === 0;
  const leagueState = selectedStateReady ? buildState({ seasonStartYear, selectedPlayers, teamRates, sourceReceipts }) : null;
  const status = schedule.status !== 'verified-exact-regular-schedule-with-local-date-crosswalk' ? 'blocked-schedule-crosswalk'
    : identityCollisions.length ? 'blocked-simulation-identity-contract'
      : !selectedStateReady ? 'needs-explicit-roster-choice'
        : 'ready-for-user-scenario-setup';

  return Object.freeze({
    format: V4_FRANCHISE_INTAKE_FORMAT,
    version: V4_FRANCHISE_INTAKE_VERSION,
    status,
    scenario: Object.freeze({
      mode,
      seasonStartYear,
      phase: 'regular',
      forecast: false,
      description: 'Retrospective/user-created scenario initialized from complete exact-season aggregates; not a pregame forecast.',
      gameInputReadiness: 'rotation-and-explicit-user-minutes-required',
      playerRateBoundary: 'full-season player totals and rates are descriptive scenario attributes; do not label as pregame rates',
      ratingBoundary: 'same-season V4 canonical ratings are descriptive scenario attributes and may affect simulated outcomes; not validated predictions',
    }),
    leagueState,
    selectedPlayerCount: selectedPlayers.length,
    candidatePlayerCount: playerSeasonEvidence.length,
    playerSeasonEvidence: Object.freeze(playerSeasonEvidence),
    ratingEvidence: Object.freeze(ratingEvidenceRows),
    teamRates,
    schedule,
    unresolvedRosterChoices: Object.freeze(choiceResolution.unresolvedRosterChoices),
    appliedRosterChoices: Object.freeze(choiceResolution.selectedRows.filter(item => item.choiceSource === 'explicit-user-selection')
      .map(item => ({ normalizedPlayerNameKey: item.row.normalizedPlayerNameKey, displayName: item.row.displayName,
        teamCode: item.row.teamCode, choiceSource: item.choiceSource, source: item.row.source }))),
    invalidRosterChoices: Object.freeze(choiceResolution.invalidChoices),
    unknownRosterChoiceKeys: Object.freeze(choiceResolution.unknownChoiceKeys),
    prototypeIdentityCollisions: Object.freeze(identityCollisions),
    issues: Object.freeze(issues),
    contracts: Object.freeze({ status: 'unknown', sourceCapabilityLoaded: false,
      reason: 'No dated legal-contract, option, cap-hit, or effective roster ledger was loaded. Candidate salary and cap records must not be promoted to confirmed contracts.' }),
    sourceRows: Object.freeze({
      teamStyles: Object.freeze(teamRates.rows),
      teamGamesCrosswalkRows: Object.freeze(schedule.games.map(game => Object.freeze({
        gameId: game.gameId,
        gameLocalDate: game.gameLocalDate,
        scheduledAtUtc: game.scheduledAtUtc,
        homeTeamCode: game.homeTeamCode,
        awayTeamCode: game.awayTeamCode,
        sourceGameRef: game.sourceGameRef,
        sourceRecordIds: game.sourceRecordIds,
        scoreUseBoundary: game.scoreUseBoundary,
      }))),
      teamSeasons: Object.freeze(teamSeasonsPart.records.filter(row => normalizedSeason(row) === seasonStartYear && normalizedPhase(row) === 'regular')),
      rosterMemberships: Object.freeze(rosterMembershipPart.records.filter(row => normalizedSeason(row) === seasonStartYear && normalizedPhase(row) === 'regular')),
    }),
    sourceReceipts,
    sourceBoundaries: Object.freeze({
      playerIdentity: 'strict canonical name-season-team-phase keys; source playerRef is not treated as person continuity',
      rosterTeam: 'multi-team rows require exact user choice; last-game team is only an explicit scenario suggestion',
      playerRates: 'exact-season totals and per-36 metrics are retrospective descriptive scenario inputs',
      ratings: 'canonical same-season ratings are preserved with source record IDs and do not establish predictive validity',
      schedule: 'actual schedule declaration joined to two exact V4 team-games rows for local date; observed scores stripped',
      contractsAndPayroll: 'unknown',
    }),
  });
}

/** Apply exact user team selections to an already loaded preview without refetching V4 parts. */
export function applyV4FranchiseRosterChoicesV1(intake, { rosterChoicesByName = {}, teamSuggestionsByName = null } = {}) {
  if (intake?.format !== V4_FRANCHISE_INTAKE_FORMAT || intake.scenario?.mode !== V4_FRANCHISE_SCENARIO_MODE
    || !Array.isArray(intake.playerSeasonEvidence)) {
    fail('franchise-intake-required', 'A V4 retrospective Franchise intake with exact player evidence is required.');
  }
  const previousSuggestions = new Map((intake.unresolvedRosterChoices ?? [])
    .filter(choice => choice?.suggestion)
    .map(choice => [choice.normalizedPlayerNameKey, choice.suggestion]));
  const choiceResolution = chooseRosterRows(intake.playerSeasonEvidence, {
    rosterChoicesByName,
    teamSuggestionsByName: teamSuggestionsByName ?? previousSuggestions,
  });
  const identityCollisions = prototypeIdentityCollisions(choiceResolution.selectedRows);
  const selectedPlayers = choiceResolution.selectedRows.map(({ row, choiceSource }) => {
    if (!row.scenarioPlayerCandidate) fail('scenario-player-candidate-missing', `No prepared player candidate for ${row.normalizedPlayerNameKey}/${row.teamCode}.`);
    return { player: Object.freeze({ ...row.scenarioPlayerCandidate, rosterChoiceSource: choiceSource }) };
  });
  const selectedStateReady = choiceResolution.unresolvedRosterChoices.length === 0
    && choiceResolution.invalidChoices.length === 0
    && choiceResolution.unknownChoiceKeys.length === 0
    && identityCollisions.length === 0;
  const leagueState = selectedStateReady ? buildState({
    seasonStartYear: intake.scenario.seasonStartYear,
    selectedPlayers,
    teamRates: intake.teamRates,
    sourceReceipts: intake.sourceReceipts,
  }) : null;
  const issues = [];
  if (choiceResolution.unresolvedRosterChoices.length) issues.push({
    code: 'explicit-roster-choice-required',
    count: choiceResolution.unresolvedRosterChoices.length,
    message: 'Multi-team regular-season aggregates do not establish a unique franchise roster; select an exact team for each listed player.',
  });
  if (choiceResolution.invalidChoices.length) issues.push({ code: 'invalid-roster-choice', rows: choiceResolution.invalidChoices });
  if (choiceResolution.unknownChoiceKeys.length) issues.push({ code: 'unknown-roster-choice-name-keys', keys: choiceResolution.unknownChoiceKeys });
  if (identityCollisions.length) issues.push({ code: 'prototype-name-identity-collision', rows: identityCollisions });
  if (intake.schedule?.status !== 'verified-exact-regular-schedule-with-local-date-crosswalk') {
    issues.push({ code: 'schedule-crosswalk-not-ready', status: intake.schedule?.status,
      errors: intake.schedule?.crosswalkErrors ?? [], reason: intake.schedule?.reason ?? null });
  }
  if (intake.teamRates?.status !== 'verified-exact-regular-team-rates') {
    issues.push({ code: 'team-rate-coverage-incomplete', missingTeamCodes: intake.teamRates?.missingTeamCodes ?? [] });
  }
  const status = intake.schedule?.status !== 'verified-exact-regular-schedule-with-local-date-crosswalk' ? 'blocked-schedule-crosswalk'
    : identityCollisions.length ? 'blocked-simulation-identity-contract'
      : !selectedStateReady ? 'needs-explicit-roster-choice'
        : 'ready-for-user-scenario-setup';
  return Object.freeze({
    ...intake,
    status,
    leagueState,
    selectedPlayerCount: selectedPlayers.length,
    unresolvedRosterChoices: Object.freeze(choiceResolution.unresolvedRosterChoices),
    appliedRosterChoices: Object.freeze(choiceResolution.selectedRows.filter(item => item.choiceSource === 'explicit-user-selection')
      .map(item => ({ normalizedPlayerNameKey: item.row.normalizedPlayerNameKey, displayName: item.row.displayName,
        teamCode: item.row.teamCode, choiceSource: item.choiceSource, source: item.row.source }))),
    invalidRosterChoices: Object.freeze(choiceResolution.invalidChoices),
    unknownRosterChoiceKeys: Object.freeze(choiceResolution.unknownChoiceKeys),
    prototypeIdentityCollisions: Object.freeze(identityCollisions),
    issues: Object.freeze(issues),
  });
}

/**
 * Load exact V4 player-game evidence on demand. The V4 `boxScore` capability
 * includes a package-wide player-games artifact (about 35.8 MB for the current
 * package), so the UI should call this only when it needs last-team suggestions.
 */
export async function loadV4PlayerGamesForFranchiseSuggestionsV1({ seasonStartYear, fetchImpl, signal,
  requestTimeoutMs, baseUrl, releasePin = DEFAULT_V4_RELEASE_PIN } = {}) {
  requireRetrospectiveRegularRequest({ seasonStartYear });
  const selectedReleasePin = resolveReviewedV4ReleasePin(releasePin);
  const verifiedData = await loadCanonicalV4StudioExactSeasonData({
    seasonStartYear,
    phases: REGULAR_PHASES,
    capabilityId: 'boxScore',
    releasePin: selectedReleasePin,
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(signal ? { signal } : {}),
    ...(requestTimeoutMs ? { requestTimeoutMs } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
  const part = partRecords(verifiedData, 'player-games');
  return Object.freeze({
    verifiedData,
    part: Object.freeze({
      artifactId: 'player-games',
      status: part.status,
      rows: part.rows,
      sha256: part.sha256,
      records: part.records,
      coverage: part.part?.coverage ?? null,
      provenance: part.part?.provenance ?? null,
    }),
  });
}

/** Build latest-team policy suggestions from regular-season player-game rows. */
export function buildLastObservedTeamScenarioSuggestionsV1({ playerSeasonRows = [], playerGameRows = [],
  seasonStartYear, playerGamesSource = null } = {}) {
  if (!Number.isSafeInteger(seasonStartYear)) fail('season-required', 'Last-observed suggestions require an exact seasonStartYear.');
  const playerGroups = groupPlayerSeasonRowsByName(playerSeasonRows);
  const ambiguousKeys = new Set([...playerGroups.entries()]
    .filter(([, rows]) => new Set(rows.map(row => row.teamCode)).size > 1)
    .map(([key]) => key));
  const observations = new Map();
  for (const row of playerGameRows) {
    if (normalizedSeason(row) !== seasonStartYear || normalizedPhase(row) !== 'regular') continue;
    const gameLocalDate = gameLocalDateForRow(row);
    const teamCode = normalizedTeam(row);
    const name = safeText(row?.values?.displayName);
    const nameKey = normalizeCanonicalV4PlayerNameKey(name);
    if (!nameKey || !teamCode || !/^\d{4}-\d{2}-\d{2}$/.test(gameLocalDate || '')) continue;
    const proof = Object.freeze({
      artifactId: 'player-games',
      recordId: row.recordId ?? null,
      partSha256: playerGamesSource?.sha256 ?? null,
      gameRef: row.entities?.gameRef ?? row.values?.gameRef ?? null,
      gameLocalDate,
      scheduledAtUtc: row.time?.scheduledAtUtc ?? null,
      seasonStartYear,
      phase: 'regular',
      teamCode,
      sourceLabel: row.evidence?.sourceLabel ?? null,
      temporalUse: row.temporalUse ?? null,
    });
    const history = observations.get(nameKey) ?? [];
    history.push(proof);
    observations.set(nameKey, history);
  }
  const suggestions = {};
  for (const nameKey of ambiguousKeys) {
    const history = observations.get(nameKey) ?? [];
    if (!history.length) {
      suggestions[nameKey] = Object.freeze({
        status: 'unavailable-no-dated-regular-player-game-row',
        policy: V4_LAST_OBSERVED_TEAM_POLICY,
        explicitUserChoiceRequired: true,
        applied: false,
      });
      continue;
    }
    const latestDate = history.reduce((latest, row) => row.gameLocalDate > latest ? row.gameLocalDate : latest, '');
    const latestObservations = history.filter(row => row.gameLocalDate === latestDate)
      .sort((a, b) => String(a.teamCode).localeCompare(String(b.teamCode)) || String(a.recordId).localeCompare(String(b.recordId)));
    const latestTeams = [...new Set(latestObservations.map(row => row.teamCode))];
    const optionTeams = new Set((playerGroups.get(nameKey) ?? []).map(row => row.teamCode));
    if (latestTeams.length !== 1) {
      suggestions[nameKey] = Object.freeze({
        status: 'ambiguous-tied-latest-date-across-teams',
        policy: V4_LAST_OBSERVED_TEAM_POLICY,
        latestGameLocalDate: latestDate,
        tiedTeamCodes: Object.freeze(latestTeams),
        observations: Object.freeze(latestObservations),
        explicitUserChoiceRequired: true,
        applied: false,
      });
    } else if (!optionTeams.has(latestTeams[0])) {
      suggestions[nameKey] = Object.freeze({
        status: 'latest-observed-team-not-in-exact-season-aggregate-options',
        policy: V4_LAST_OBSERVED_TEAM_POLICY,
        teamCode: latestTeams[0],
        latestGameLocalDate: latestDate,
        observations: Object.freeze(latestObservations),
        availableOptionTeamCodes: Object.freeze([...optionTeams].sort()),
        explicitUserChoiceRequired: true,
        applied: false,
      });
    } else {
      suggestions[nameKey] = Object.freeze({
        status: 'suggested-not-applied',
        policy: V4_LAST_OBSERVED_TEAM_POLICY,
        teamCode: latestTeams[0],
        latestGameLocalDate: latestDate,
        observations: Object.freeze(latestObservations),
        explicitUserChoiceRequired: true,
        applied: false,
        factBoundary: 'a postgame observation supports this scenario suggestion only; it is not a confirmed roster or contract fact',
      });
    }
  }
  return Object.freeze(suggestions);
}

/** Attach suggestions without changing, selecting, or applying any roster choice. */
export function attachLastObservedTeamSuggestionsV1(intake, verifiedPlayerGames) {
  if (intake?.format !== V4_FRANCHISE_INTAKE_FORMAT || intake.scenario?.phase !== 'regular') {
    fail('franchise-intake-required', 'A regular-season V4 Franchise intake is required.');
  }
  const part = verifiedPlayerGames?.part;
  if (!part || part.artifactId !== 'player-games' || part.status !== 'verified'
    || !Array.isArray(part.records) || part.records.length !== part.rows) {
    fail('verified-player-games-required', 'Complete verified package player-games evidence is required.');
  }
  const suggestions = buildLastObservedTeamScenarioSuggestionsV1({
    playerSeasonRows: intake.playerSeasonEvidence,
    playerGameRows: part.records,
    seasonStartYear: intake.scenario.seasonStartYear,
    playerGamesSource: part,
  });
  const unresolvedRosterChoices = intake.unresolvedRosterChoices.map(choice => Object.freeze({
    ...choice,
    suggestion: suggestions[choice.normalizedPlayerNameKey] ?? null,
    suggestionPolicyBoundary: 'suggestion is not a roster/contract fact and is never applied automatically',
  }));
  const sourceReceipts = Object.freeze({
    ...intake.sourceReceipts,
    playerGames: Object.freeze({
      capabilityId: verifiedPlayerGames.verifiedData?.capabilityId ?? 'boxScore',
      source: verifiedSourceReceipt(verifiedPlayerGames.verifiedData),
      part: partReceipt(part),
      useBoundary: 'regular-season player-game observations support an unapplied last-observed-team scenario suggestion only',
    }),
  });
  return Object.freeze({
    ...intake,
    status: intake.status,
    unresolvedRosterChoices: Object.freeze(unresolvedRosterChoices),
    suggestionsGenerated: true,
    sourceReceipts,
    sourceBoundaries: Object.freeze({ ...intake.sourceBoundaries,
      lastObservedTeam: 'regular-season player-game observations only; latest date retained with record proof; ties remain ambiguous; never auto-applied' }),
  });
}

export async function loadLastObservedTeamScenarioSuggestionsV1(intake, options = {}) {
  const verifiedPlayerGames = await loadV4PlayerGamesForFranchiseSuggestionsV1({
    seasonStartYear: intake?.scenario?.seasonStartYear,
    ...options,
  });
  return attachLastObservedTeamSuggestionsV1(intake, verifiedPlayerGames);
}

async function fetchPinnedJson(url, sha256, { fetchImpl, cryptoImpl = globalThis.crypto, signal } = {}) {
  if (typeof fetchImpl !== 'function') fail('fetch-unavailable', 'A Fetch API implementation is required to load the pinned local evidence artifact.');
  if (!cryptoImpl?.subtle?.digest) fail('webcrypto-unavailable', 'Web Crypto SHA-256 is required to verify local evidence artifacts.');
  const response = await fetchImpl(url, signal ? { signal } : undefined);
  if (!response?.ok) fail('artifact-fetch-failed', `Pinned evidence artifact fetch failed (${response?.status ?? 'no response'}): ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', bytes));
  const actual = [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
  if (actual !== sha256) fail('artifact-sha256-mismatch', `Pinned artifact SHA-256 mismatch for ${url}.`);
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    fail('artifact-json-invalid', `Pinned evidence artifact is not valid JSON: ${error.message}`);
  }
  return Object.freeze({ parsed, sha256: actual, byteLength: bytes.byteLength, url: String(url) });
}

/** Load the pinned exact-season V4 source set and construct a names-first scenario preview. */
export async function loadV4FranchiseIntakeV1({ seasonStartYear, phase = 'regular', mode = V4_FRANCHISE_SCENARIO_MODE,
  rosterChoicesByName = {}, fetchImpl = globalThis.fetch?.bind(globalThis), cryptoImpl = globalThis.crypto,
  signal, requestTimeoutMs, baseUrl, scheduleUrl = new URL(V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.path, import.meta.url),
  ageIndexUrl = new URL(V4_FRANCHISE_SOURCE_PINS.seasonAgeIndex.path, import.meta.url),
  includeLastObservedTeamSuggestions = false, releasePin = DEFAULT_V4_RELEASE_PIN } = {}) {
  requireRetrospectiveRegularRequest({ seasonStartYear, phase, mode });
  if (typeof fetchImpl !== 'function') fail('fetch-unavailable', 'V4 Franchise intake requires a browser-compatible Fetch API.');
  const selectedReleasePin = resolveReviewedV4ReleasePin(releasePin);
  const selectedReleasePinReceipt = releasePinReceipt(selectedReleasePin);
  const loaderOptions = {
    seasonStartYear,
    phases: REGULAR_PHASES,
    releasePin: selectedReleasePin,
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(signal ? { signal } : {}),
    ...(requestTimeoutMs ? { requestTimeoutMs } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  };
  const [verifiedFranchiseData, verifiedSeasonLabData, verifiedRatingData, scheduleArtifact, ageArtifact] = await Promise.all([
    loadCanonicalV4StudioExactSeasonData({ ...loaderOptions, capabilityId: 'franchiseInputs', additionalArtifactIds: ['player-seasons'] }),
    loadCanonicalV4StudioExactSeasonData({ ...loaderOptions, capabilityId: 'seasonLabInputs' }),
    loadCanonicalV4StudioExactSeasonData({ ...loaderOptions, capabilityId: 'playerRatings' }),
    fetchPinnedJson(scheduleUrl, V4_FRANCHISE_SOURCE_PINS.scheduleArtifact.sha256, { fetchImpl, cryptoImpl, signal }),
    fetchPinnedJson(ageIndexUrl, V4_FRANCHISE_SOURCE_PINS.seasonAgeIndex.sha256, { fetchImpl, cryptoImpl, signal }),
  ]);
  const intake = buildV4FranchiseIntakeV1({
    seasonStartYear,
    phase,
    mode,
    verifiedFranchiseData,
    verifiedSeasonLabData,
    verifiedRatingData,
    scheduleArtifact: scheduleArtifact.parsed,
    scheduleArtifactSha256: scheduleArtifact.sha256,
    ageIndex: ageArtifact.parsed,
    ageIndexSha256: ageArtifact.sha256,
    rosterChoicesByName,
  });
  const withArtifactReceipts = Object.freeze({
    ...intake,
    sourceReceipts: Object.freeze({
      ...intake.sourceReceipts,
      v4ReleasePin: selectedReleasePinReceipt,
      scheduleArtifact: Object.freeze({ ...intake.sourceReceipts.scheduleArtifact,
        byteLength: scheduleArtifact.byteLength, url: scheduleArtifact.url }),
      seasonAgeIndex: Object.freeze({ ...intake.sourceReceipts.seasonAgeIndex,
        byteLength: ageArtifact.byteLength, url: ageArtifact.url }),
    }),
  });
  return includeLastObservedTeamSuggestions
    ? loadLastObservedTeamScenarioSuggestionsV1(withArtifactReceipts, {
      fetchImpl, signal, requestTimeoutMs, baseUrl, releasePin: selectedReleasePin,
    })
    : withArtifactReceipts;
}
