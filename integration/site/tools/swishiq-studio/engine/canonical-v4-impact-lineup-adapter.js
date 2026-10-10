/*
 * Lineup Lab adapter for the immutable, exact-season V4 Impact companion.
 *
 * The All Games package supplies the visible roster and box-score context, but
 * it has a different package identity from the canonical V4 season package
 * bound by the Impact release. This adapter deliberately resolves those two
 * sources separately, then performs a conservative name + season + team +
 * phase join. It never treats an absent coefficient as zero.
 */

import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
} from './canonical-v4-studio-runtime-adapter.js?v=20261010a&rev=native-v4-impact-lineup-adapter-v1';
import {
  listCanonicalV4PlayerBuilderExactChoices,
} from './canonical-v4-player-builder-adapter.js?v=20261010a&rev=native-v4-impact-lineup-adapter-v1';
import {
  CANONICAL_V4_PLAYER_NAME_KEY_VERSION,
  normalizeCanonicalV4PlayerNameKey,
  resolveCanonicalV4PlayerNameSeasonMatch,
} from './canonical-v4-player-name-identity.js?v=20261010a&rev=native-v4-impact-lineup-adapter-v1';
import {
  CANONICAL_V4_IMPACT_MODEL_RELEASE_PIN,
  getCanonicalV4ImpactModelRequest,
} from './canonical-v4-impact-model-release-pin.js?v=20261010a&rev=native-v4-impact-lineup-adapter-v1';
import {
  CANONICAL_V4_IMPACT_MODEL_RESOLVER_FORMAT,
  resolveCanonicalV4ImpactModel,
} from './canonical-v4-impact-model-resolver.js?v=20261010b&rev=native-v4-impact-fetch-binding-v2';

export const CANONICAL_V4_IMPACT_LINEUP_ADAPTER_FORMAT = 'djhc-canonical-v4-impact-lineup-adapter-v1';
export const CANONICAL_V4_IMPACT_LINEUP_ADAPTER_VERSION = 'swishiq-v4-impact-lineup-adapter-v1';
export const CANONICAL_V4_IMPACT_LINEUP_EVIDENCE_FORMAT = 'djhc-canonical-v4-lineup-impact-evidence-v1';
export const CANONICAL_V4_IMPACT_LINEUP_EVIDENCE_VERSION = 'swishiq-v4-lineup-impact-evidence-v1';

const PHASE = 'regular';
const DEFENSIVE_SIGN_CONVENTION = 'positive_is_better_and_reduces_predicted_opponent_scoring';
const VALIDATION_CLAIM_SCOPE = 'historical conditional scoring for specified observed paired lineups';
const RESOLVER_LINEUP_EVIDENCE_FORMAT = 'djhc-swishiq-v4-lineup-impact-evidence-v1';
const HASH_RE = /^[a-f0-9]{64}$/;

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  throw error;
}

function asObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function teamCode(value) {
  return text(value).toUpperCase();
}

function safeInteger(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function isSha256(value) {
  return typeof value === 'string' && HASH_RE.test(value);
}

function freezeRecord(value) {
  return Object.freeze(value);
}

function expectedDatasetScope(dataset, seasonStartYear, requestedTeam, phase) {
  const sourceScope = dataset?.source?.scope;
  if (!asObject(sourceScope)
    || sourceScope.kind !== 'exact-season'
    || sourceScope.seasonStartYear !== seasonStartYear
    || sourceScope.seasonEndYear !== seasonStartYear + 1
    || sourceScope.teamCode !== requestedTeam
    || !Array.isArray(sourceScope.phases)
    || sourceScope.phases.length !== 1
    || sourceScope.phases[0] !== phase) {
    fail('lineup-dataset-scope-mismatch', 'The Lineup Lab roster does not carry the requested exact V4 season, team, and regular-phase scope.');
  }
  return sourceScope;
}

function validateRoster(dataset, requestedTeam) {
  const players = dataset?.players;
  if (!Array.isArray(players) || players.length === 0) {
    fail('lineup-roster-invalid', 'The selected Lineup Lab dataset has no roster players to bind to Impact evidence.');
  }
  const playerIds = new Set();
  return players.map((player) => {
    const id = text(player?.id);
    const name = text(player?.name ?? player?.displayName);
    const normalizedName = normalizeCanonicalV4PlayerNameKey(name);
    const playerTeam = teamCode(player?.team ?? player?.teamCode);
    if (!id || !name || !normalizedName || playerTeam !== requestedTeam) {
      fail('lineup-roster-invalid', 'Every V4 Lineup Lab roster player must have a unique ID, canonical display name, and selected team scope.');
    }
    if (playerIds.has(id)) fail('lineup-roster-duplicate-id', 'The V4 Lineup Lab roster has duplicate player IDs.');
    playerIds.add(id);
    return { player, id, name, normalizedName, teamCode: playerTeam };
  });
}

function exactPackageChoice(seasonStartYear, releasePin) {
  const choices = listCanonicalV4PlayerBuilderExactChoices(releasePin);
  const choice = choices.find((item) => item.seasonStartYear === seasonStartYear);
  if (!choice || !text(choice.packageId) || !text(choice.packageVersion)) {
    fail('impact-canonical-season-unavailable', 'The reviewed canonical V4 release has no enabled exact-season package for this Lineup Lab request.');
  }
  return choice;
}

function verifyResolvedImpact(resolved, { seasonStartYear, packageId, packageVersion, phase }) {
  if (!asObject(resolved)
    || resolved.format !== CANONICAL_V4_IMPACT_MODEL_RESOLVER_FORMAT
    || resolved.status !== 'resolved'
    || !asObject(resolved.scope)
    || resolved.scope.kind !== 'exact-season'
    || resolved.scope.seasonStartYear !== seasonStartYear
    || resolved.scope.seasonEndYear !== seasonStartYear + 1
    || resolved.scope.phase !== phase
    || resolved.scope.pooled !== false
    || !asObject(resolved.v4Context)
    || resolved.v4Context.packageId !== packageId
    || resolved.v4Context.packageVersion !== packageVersion
    || resolved.v4Context.phase !== phase
    || !Array.isArray(resolved.records)
    || !asObject(resolved.lineupEvidence)
    || resolved.lineupEvidence.format !== RESOLVER_LINEUP_EVIDENCE_FORMAT
    || resolved.lineupEvidence.useBoundary?.permittedUse !== 'mean-only'
    || resolved.lineupEvidence.useBoundary?.uncertaintyStatus !== 'not-estimated'
    || resolved.lineupEvidence.validation?.claimScope !== VALIDATION_CLAIM_SCOPE
    || resolved.lineupEvidence.validation?.optimizerCounterfactualsValidated !== false
    || resolved.lineupEvidence.validation?.prospectiveValidityEstablished !== false) {
    fail('impact-resolution-contract-invalid', 'The V4 Impact resolver did not return the required exact-season, mean-only historical conditional-lineup contract.');
  }
  const passport = resolved.v4Context.sourcePassport;
  if (!asObject(passport)
    || passport.immutableManifest !== true
    || passport.sourceRelease?.packageId !== packageId
    || passport.sourceRelease?.packageVersion !== packageVersion
    || passport.model?.modelId !== resolved.v4Context.impactModelId
    || passport.model?.modelVersion !== resolved.v4Context.impactModelVersion
    || !isSha256(passport.manifest?.sha256)
    || !isSha256(passport.seasonArtifact?.sha256)
    || passport.uncertainty?.status !== 'not-estimated'
    || passport.uncertainty?.permittedUse !== 'mean-only') {
    fail('impact-resolution-passport-invalid', 'The V4 Impact resolver source passport is incomplete or does not match the requested exact season.');
  }
  return passport;
}

function recordCandidates(records) {
  return records.map((record) => ({
    displayName: record?.player?.canonicalDisplayName || record?.player?.sourceDisplayName || '',
    seasonStartYear: record?.scope?.seasonStartYear,
    teamCode: record?.player?.teamCode ?? null,
    teamCodes: Array.isArray(record?.player?.teamCodes) ? record.player.teamCodes : [],
    phase: record?.scope?.phase,
    impactRecord: record,
  }));
}

function nativeEvidenceRow(record, match) {
  const offense = record?.values?.offense?.value;
  const defense = record?.values?.defense?.value;
  const combined = record?.values?.combined?.value;
  const pairedPossessions = record?.exposure?.pairedPossessions;
  if (!Number.isFinite(offense) || !Number.isFinite(defense) || !Number.isFinite(combined)
    || Math.abs((offense + defense) - combined) > 1e-10
    || !Number.isFinite(pairedPossessions) || pairedPossessions <= 0
    || record?.availability?.status !== 'available'
    || record?.availability?.displayEligible !== true
    || record?.uncertainty?.status !== 'not-estimated'
    || record?.uncertainty?.permittedUse !== 'mean-only') {
    fail('impact-record-contract-invalid', 'A resolver-verified V4 Impact record was incomplete or did not retain mean-only, additive semantics.');
  }
  return freezeRecord({
    format: 'djhc-canonical-v4-lineup-impact-player-v1',
    playerRef: record.player.playerRef,
    playerNameKey: record.player.playerNameKey,
    sourceDisplayName: record.player.canonicalDisplayName || record.player.sourceDisplayName,
    offense,
    defense,
    combined,
    alreadyRegularized: true,
    displayEligible: true,
    availability: 'available',
    estimateKind: record.estimateKind,
    pairedPossessions,
    rawPairedPossessions: pairedPossessions,
    sampleSizeTier: record.exposure.sampleSizeTier,
    uncertainty: freezeRecord({
      status: 'not-estimated',
      standardError: null,
      intervals: Object.freeze([]),
      calibrated: false,
      permittedUse: 'mean-only',
    }),
    coverage: freezeRecord({
      pairedPossessions,
      sampleSizeTier: record.exposure.sampleSizeTier,
      sourceDisplayEligible: true,
    }),
    nameMatch: freezeRecord({
      matchType: match.matchType,
      providerIdsUsed: false,
      personContinuityProven: false,
      sourceDisplayName: match.sourceDisplayName,
      canonicalNormalizedPlayerNameKey: match.canonicalNormalizedPlayerNameKey,
      sourceNormalizedPlayerNameKey: match.sourceNormalizedPlayerNameKey,
      ...(match.playerNameMatchKeyVersion ? {
        playerNameMatchKeyVersion: match.playerNameMatchKeyVersion,
        playerNameMatchKey: match.playerNameMatchKey,
      } : {}),
    }),
  });
}

function unsupportedRow(player, code, detail = null) {
  return freezeRecord({
    playerId: player.id,
    playerName: player.name,
    code,
    ...(detail ? { detail } : {}),
  });
}

function createBoundEvidence({ resolved, choice, roster, seasonStartYear, requestedTeam, phase, passport }) {
  const candidates = recordCandidates(resolved.records);
  const matchedByPlayerId = new Map();
  const unsupportedByPlayerId = new Map();
  const rosterIdsByImpactRef = new Map();

  for (const item of roster) {
    const match = resolveCanonicalV4PlayerNameSeasonMatch({
      canonicalDisplayName: item.name,
      seasonStartYear,
      teamCode: requestedTeam,
      phase,
      candidates,
    });
    if (match.status !== 'matched' || !match.candidate?.impactRecord) {
      const code = match.status === 'ambiguous'
        ? 'ambiguous-name-match'
        : match.status === 'invalid-request'
          ? 'invalid-name-match-request'
          : 'no-eligible-exact-impact-record';
      unsupportedByPlayerId.set(item.id, unsupportedRow(item, code, match.reason || null));
      continue;
    }
    const record = match.candidate.impactRecord;
    const playerRef = text(record?.player?.playerRef);
    if (!playerRef) fail('impact-record-contract-invalid', 'A resolved V4 Impact record is missing its canonical player reference.');
    const previous = rosterIdsByImpactRef.get(playerRef);
    if (previous) {
      matchedByPlayerId.delete(previous);
      unsupportedByPlayerId.set(previous, unsupportedRow(
        roster.find((candidate) => candidate.id === previous),
        'duplicate-active-roster-impact-match',
      ));
      unsupportedByPlayerId.set(item.id, unsupportedRow(item, 'duplicate-active-roster-impact-match'));
      continue;
    }
    rosterIdsByImpactRef.set(playerRef, item.id);
    matchedByPlayerId.set(item.id, nativeEvidenceRow(record, match));
  }

  const players = Object.fromEntries([...matchedByPlayerId.entries()].map(([id, row]) => [id, row]));
  const unsupported = roster
    .map((item) => unsupportedByPlayerId.get(item.id))
    .filter(Boolean)
    .sort((left, right) => left.playerId.localeCompare(right.playerId));
  const packageRef = freezeRecord({
    kind: 'canonical-v4-impact-native-companion',
    packageId: choice.packageId,
    packageVersion: choice.packageVersion,
    canonicalModelId: resolved.v4Context.modelId,
    canonicalReleaseId: resolved.v4Context.releaseId,
    impactReleaseId: resolved.v4Context.impactReleaseId,
    impactModelId: resolved.v4Context.impactModelId,
    impactModelVersion: resolved.v4Context.impactModelVersion,
    impactManifestSha256: passport.manifest.sha256,
    impactManifestBytes: passport.manifest.bytes,
    impactSeasonArtifactSha256: passport.seasonArtifact.sha256,
    impactSeasonArtifactBytes: passport.seasonArtifact.bytes,
    sourceLockSha256: passport.sourceRelease.sourceLockSha256,
    packageManifestSha256: passport.sourceRelease.packageManifestSha256,
    modelSha256: passport.model.modelSha256,
    modelVariantSha256: passport.model.modelVariantSha256,
    crosswalkSha256: passport.model.crosswalkSha256,
    normalizer: CANONICAL_V4_PLAYER_NAME_KEY_VERSION,
  });
  const scope = freezeRecord({
    kind: 'exact-season',
    seasonStartYear,
    seasonStartYears: Object.freeze([seasonStartYear]),
    seasonEndYear: seasonStartYear + 1,
    selectedSeasonEndYear: seasonStartYear + 1,
    team: requestedTeam,
    teamCode: requestedTeam,
    seasonPhase: phase,
    selectedSeasonPhase: phase,
    phase,
    pooled: false,
  });
  const evidence = freezeRecord({
    format: CANONICAL_V4_IMPACT_LINEUP_EVIDENCE_FORMAT,
    version: CANONICAL_V4_IMPACT_LINEUP_EVIDENCE_VERSION,
    status: matchedByPlayerId.size ? 'available' : 'unavailable',
    contractVersion: 4,
    publicProjection: false,
    sourceKind: 'canonical-v4-impact-native-companion',
    package: packageRef,
    scope,
    model: freezeRecord({
      modelId: resolved.v4Context.impactModelId,
      modelVersion: resolved.v4Context.impactModelVersion,
      modelSha256: passport.model.modelSha256,
      modelVariantSha256: passport.model.modelVariantSha256,
      defensiveSignConvention: DEFENSIVE_SIGN_CONVENTION,
      unit: 'points-per-100-possessions',
    }),
    validation: freezeRecord({
      status: 'chronological-conditional-lineup-evaluation-only',
      claimScope: VALIDATION_CLAIM_SCOPE,
      playerDisjointHoldout: false,
      individualPlayerImpactValidated: false,
      individualRanksValidated: false,
      optimizerCounterfactualsValidated: false,
      prospectiveValidityEstablished: false,
    }),
    useBoundary: freezeRecord({
      permittedUse: 'mean-only',
      uncertaintyStatus: 'not-estimated',
      confidenceScoresAvailable: false,
      playerImpactValidated: false,
      individualRanksValidated: false,
      optimizerCounterfactualsValidated: false,
      prospectiveValidityEstablished: false,
    }),
    sourcePassport: freezeRecord({ ...passport }),
    players: freezeRecord(players),
    unsupported: Object.freeze(unsupported),
    coverage: freezeRecord({
      rosterPlayerCount: roster.length,
      supportedPlayerCount: matchedByPlayerId.size,
      unsupportedPlayerCount: unsupported.length,
      resolverUsableRecordCount: resolved.counts?.usableRecords ?? resolved.records.length,
    }),
  });
  return freezeRecord({
    format: CANONICAL_V4_IMPACT_LINEUP_ADAPTER_FORMAT,
    version: CANONICAL_V4_IMPACT_LINEUP_ADAPTER_VERSION,
    status: evidence.status,
    scope,
    package: packageRef,
    evidence,
    sourcePassport: evidence.sourcePassport,
    coverage: evidence.coverage,
  });
}

/**
 * Resolve and bind one verified native V4 Impact artifact to an active Lineup
 * Lab roster. No pooled, adjacent-season, or unverified All Games package
 * identity may substitute for the exact canonical package request.
 */
export async function loadCanonicalV4ImpactForLineupDataset({
  dataset,
  seasonStartYear,
  teamCode: requestedTeamInput,
  phase = PHASE,
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  requestForImpact = getCanonicalV4ImpactModelRequest,
  resolveImpact = resolveCanonicalV4ImpactModel,
  baseUrl,
  fetchImpl,
  sha256Hex,
  signal,
} = {}) {
  if (!Number.isSafeInteger(seasonStartYear) || seasonStartYear < 2017 || seasonStartYear > 2025) {
    fail('lineup-impact-season-invalid', 'Native V4 Impact is available only for completed 2017–18 through 2025–26 regular seasons.');
  }
  const requestedTeam = teamCode(requestedTeamInput);
  if (!/^[A-Z]{2,4}$/.test(requestedTeam) || phase !== PHASE) {
    fail('lineup-impact-scope-invalid', 'Native V4 Impact requires an exact NBA team and regular-season scope.');
  }
  if (typeof requestForImpact !== 'function' || typeof resolveImpact !== 'function') {
    fail('lineup-impact-adapter-invalid', 'Native V4 Impact requires its pinned request builder and resolver.');
  }
  expectedDatasetScope(dataset, seasonStartYear, requestedTeam, phase);
  const roster = validateRoster(dataset, requestedTeam);
  const choice = exactPackageChoice(seasonStartYear, releasePin);
  const request = requestForImpact({
    seasonStartYear,
    packageId: choice.packageId,
    packageVersion: choice.packageVersion,
    ...(baseUrl ? { baseUrl } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(sha256Hex ? { sha256Hex } : {}),
    ...(signal ? { signal } : {}),
  });
  const resolved = await resolveImpact(request);
  const passport = verifyResolvedImpact(resolved, {
    seasonStartYear,
    packageId: choice.packageId,
    packageVersion: choice.packageVersion,
    phase,
  });
  return createBoundEvidence({
    resolved,
    choice,
    roster,
    seasonStartYear,
    requestedTeam,
    phase,
    passport,
  });
}

/** Lightweight selection-level availability used before the asynchronous load. */
export function canonicalV4ImpactLineupAvailability({
  selection,
  dataset,
  evidence,
  package: packageRef,
} = {}) {
  const seasonEndYear = safeInteger(selection?.season ?? selection?.seasonEndYear);
  const selectedTeam = teamCode(selection?.team ?? selection?.teamCode);
  const selectedPhase = text(selection?.seasonPhase ?? selection?.phase);
  if (!seasonEndYear || seasonEndYear < 2018 || seasonEndYear > 2026 || !selectedTeam || selectedPhase !== PHASE) {
    return freezeRecord({ available: false, code: 'selection-outside-native-impact-scope', reason: 'Native V4 Impact is available only for an exact completed regular-season team selection.' });
  }
  if (!evidence || evidence.format !== CANONICAL_V4_IMPACT_LINEUP_EVIDENCE_FORMAT
    || evidence.status !== 'available' || packageRef?.kind !== 'canonical-v4-impact-native-companion') {
    return freezeRecord({ available: false, code: 'native-impact-not-loaded', reason: 'Native V4 Impact has not been verified for this exact team-season.' });
  }
  const scope = evidence.scope;
  if (!scope || scope.seasonEndYear !== seasonEndYear || scope.team !== selectedTeam || scope.phase !== selectedPhase
    || packageRef.packageId !== evidence.package?.packageId || packageRef.packageVersion !== evidence.package?.packageVersion
    || evidence.useBoundary?.permittedUse !== 'mean-only' || evidence.useBoundary?.uncertaintyStatus !== 'not-estimated'
    || !Array.isArray(dataset?.players)) {
    return freezeRecord({ available: false, code: 'native-impact-scope-mismatch', reason: 'Native V4 Impact does not match the loaded exact team-season roster.' });
  }
  return freezeRecord({
    available: true,
    code: 'native-impact-mean-only-ready',
    reason: 'Native V4 Impact is verified for this exact completed regular-season roster. It supplies mean-only historical conditional-lineup estimates; no player uncertainty or counterfactual optimizer validation is claimed.',
  });
}
