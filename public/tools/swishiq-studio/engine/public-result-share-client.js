/*
 * Client integration for signed public-result shares.
 *
 * Callers must provide an already-verified result summary. This module
 * projects it again before sending, requires the configured Supabase client
 * and the receiver's explicit public-key allowlist, verifies the returned
 * Ed25519 envelope, and emits only fixed aggregate share telemetry after a
 * caller confirms that the native share or clipboard action succeeded.
 */

import { projectPublicResultShareV1 } from './public-result-share.js?v=20260930f';
import {
  projectPublicResultShareV4,
  projectPublicResultShareV4PayloadShape,
  PUBLIC_RESULT_SHARE_V4_FORMAT,
} from './public-result-share-v4.js?v=20261001e&rev=daily-v4-rank-share-summary-v2';
import { loadCanonicalV4PublicPackageProof } from './canonical-v4-public-network-loader.js?v=20261002e&rev=canonical-v4-public-network-loader-v4-dependency-cache-closure';
import {
  buildSwishIqV4DailyGameRequest,
  validateSwishIqV4DailyGameResponse,
} from './swishiq-daily-game-v4-contract.js?v=20261001g&rev=daily-v4-name-identity-cache-closure-v1';
import {
  PUBLIC_RESULT_SHARE_V2_LIMITS,
  verifyPublicResultShareEnvelopeV2,
} from './public-result-share-v2.js?v=20261001e&rev=daily-v4-rank-share-summary-v2';
import {
  PUBLIC_RESULT_SHARE_TRUSTED_PUBLIC_KEY_JWKS,
  importPublicResultShareTrustedKeys,
} from '../../shared-result/public-keys.js?v=20260927s&rev=phase9-empty-public-key-allowlist-v2-20260928a';
import {
  RESULT_PASSPORT_VERSION,
  decisionProofStatus,
  validateResultPassport,
} from '../../result-passport.js?v=20260930f';

export const PUBLIC_RESULT_SHARE_ROUTE = '/tools/shared-result/';
export const PUBLIC_RESULT_SHARE_SIGNER_FUNCTION = 'swishiq-result-share';
export const PUBLIC_RESULT_SHARE_EVENT = 'result_shared';
export const PUBLIC_RESULT_SHARE_METHODS = Object.freeze(['native', 'clipboard']);
export const PUBLIC_RESULT_SHARE_TOOLS = Object.freeze([
  'lineup-lab',
  'fix-the-five',
  'draft-night',
  'swishiq-studio',
  'nba-analytics-explorer',
  'exact-lineup-studies',
  'pair-fit-lab',
  'position-lens',
]);

const TOOL_IDS = new Set(PUBLIC_RESULT_SHARE_TOOLS);
const METHODS = new Set(PUBLIC_RESULT_SHARE_METHODS);
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ED25519_PUBLIC_X = /^[A-Za-z0-9_-]{43}$/;

function fail(message) {
  throw new TypeError(`Signed public result share: ${message}`);
}

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('summary contains a non-finite number.');
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isRecord(value)) fail('summary contains an unsupported value.');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function assertTrustedPublicKeys(trustedPublicKeys) {
  if (!isRecord(trustedPublicKeys)) fail('the trusted public-key allowlist is unavailable.');
  const entries = Object.entries(trustedPublicKeys);
  if (!entries.length || entries.length > PUBLIC_RESULT_SHARE_V2_LIMITS.maxKeyIds) {
    fail('the trusted public-key allowlist is unavailable.');
  }
  for (const [keyId, key] of entries) {
    if (!KEY_ID.test(keyId) || key?.type !== 'public' || key.algorithm?.name !== 'Ed25519'
      || !Array.isArray(key.usages) || key.usages.length !== 1 || key.usages[0] !== 'verify') {
      fail('the trusted public-key allowlist is invalid.');
    }
  }
}

function hasConfiguredPublicKeyJwks(jwks = PUBLIC_RESULT_SHARE_TRUSTED_PUBLIC_KEY_JWKS) {
  if (!isRecord(jwks)) return false;
  const entries = Object.entries(jwks);
  return entries.length > 0 && entries.length <= PUBLIC_RESULT_SHARE_V2_LIMITS.maxKeyIds
    && entries.every(([keyId, jwk]) => KEY_ID.test(keyId) && jwk?.kty === 'OKP'
      && jwk.crv === 'Ed25519' && typeof jwk.x === 'string' && ED25519_PUBLIC_X.test(jwk.x)
      && !Object.hasOwn(jwk, 'd'));
}

function configuredSupabaseInvoker(windowRef) {
  const config = windowRef?.DJ_BACKEND_CONFIG;
  const remote = windowRef?.DJ?.remoteCatalog;
  if (config?.enabled !== true || config?.provider !== 'supabase'
    || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(config?.supabaseUrl || ''))
    || typeof config?.supabasePublishableKey !== 'string' || !config.supabasePublishableKey.trim()
    || typeof remote?.isConfigured !== 'function' || remote.isConfigured() !== true
    || typeof remote.invokeFunction !== 'function') {
    fail('the configured Supabase share service is unavailable.');
  }
  return body => remote.invokeFunction(PUBLIC_RESULT_SHARE_SIGNER_FUNCTION, body);
}

function sameOriginBase(origin) {
  if (typeof origin !== 'string' || !origin) fail('a same-origin share URL cannot be created.');
  let parsed;
  try { parsed = new URL(origin); } catch { fail('a same-origin share URL cannot be created.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== origin
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    fail('a same-origin share URL cannot be created.');
  }
  return parsed.origin;
}

function boardReference(board) {
  return {
    format: board.format,
    contractVersion: board.contractVersion,
    publicationStatus: board.publicationStatus,
    boardId: board.boardId,
    generatedAt: board.generatedAt,
    dailySeed: board.dailySeed,
    gameKind: board.gameKind,
    family: board.family,
    packageRef: board.packageRef,
    gamePointsPolicy: board.gamePointsPolicy,
    boardContentSha256: board.boardContentSha256,
  };
}

function packagePinFromBoardRef(packageRef) {
  return {
    packageId: packageRef.packageId,
    packageVersion: packageRef.packageVersion,
    modelId: packageRef.modelId,
    metricsVersion: packageRef.metricsVersion,
    packageManifestSha256: packageRef.packageManifestSha256,
    sourceLockSha256: packageRef.sourceLockSha256,
    registryVersion: packageRef.registryVersion,
    registryRevisionSha256: packageRef.registryRevisionSha256,
    normalizer: packageRef.normalizer,
    projectionContentSha256: packageRef.projectionContentSha256,
    scope: {
      kind: packageRef.scope?.kind,
      seasonStartYear: packageRef.scope?.seasonStartYear,
      seasonEndYear: packageRef.scope?.seasonEndYear,
      phase: packageRef.phase,
    },
  };
}

function validateFixTheFiveRoundOutcome({ board, challenge, outcome, selectedPlayerRef }) {
  const challengeId = String(challenge?.challengeId || '');
  const reference = boardReference(board);
  const passport = outcome?.resultPassport;
  if (!isRecord(outcome) || outcome.format !== 'djhc-swishiq-game-evaluate-response-v1'
    || outcome.contractVersion !== 1 || outcome.action !== 'evaluate'
    || canonicalJson(outcome.boardRef) !== canonicalJson(reference)
    || !isRecord(outcome.selection) || outcome.selection.kind !== 'fix-the-five'
    || outcome.selection.challengeId !== challengeId
    || typeof outcome.selection.playerRef !== 'string'
    || outcome.selection.playerRef !== selectedPlayerRef
    || !challenge.candidates.some(candidate => candidate?.playerRef === selectedPlayerRef)
    || !isRecord(passport) || passport.version !== RESULT_PASSPORT_VERSION
    || passport.status !== 'complete' || passport.scenarioKind !== 'fix-the-five'
    || passport.compatibility !== null
    || canonicalJson(passport.evidence?.boardRef) !== canonicalJson(reference)
    || canonicalJson(passport.evidence?.resultContract) !== canonicalJson(outcome.resultContract)) {
    fail('a Fix the Five round is missing a complete Result Passport bound to the current board and legal choice.');
  }

  const replay = passport.replay;
  const packageRef = board.packageRef;
  if (!isRecord(replay) || replay.boardId !== board.boardId
    || replay.boardContentSha256 !== board.boardContentSha256
    || canonicalJson(replay.gamePointsPolicy) !== canonicalJson(board.gamePointsPolicy)
    || replay.packageId !== packageRef.packageId
    || replay.packageVersion !== packageRef.packageVersion
    || replay.exactPackageRequired !== true) {
    fail('a Fix the Five round is not bound to the current exact package and board hash.');
  }

  const points = passport.gamePoints;
  const previousPoints = points?.ruleVersion === 'swishiq-game-points-v1';
  const currentPoints = points?.ruleVersion === 'swishiq-game-points-v2';
  if (!isRecord(points) || ![board.gamePointsPolicy?.ruleVersion].includes(points.ruleVersion)
    || (!previousPoints && !currentPoints)
    || points.validChoice !== 1 || !Number.isInteger(points.ruleCompletion) || points.ruleCompletion < 0 || points.ruleCompletion > 1
    || !Number.isInteger(points.placement) || points.placement < 0 || points.placement > (previousPoints ? 3 : 9)
    || !Number.isInteger(points.total) || points.total < 0 || points.total > (previousPoints ? 5 : 10)
    || !Number.isInteger(points.max) || (previousPoints ? points.max < 4 || points.max > 5 : points.max !== 10)
    || (previousPoints && points.max === 4 && points.ruleCompletion !== 0)
    || points.total !== (previousPoints
      ? points.validChoice + points.ruleCompletion + points.placement
      : points.validChoice + points.placement)
    || points.total > points.max) {
    fail('a Fix the Five round has incomplete or inconsistent Game Points.');
  }
  try {
    validateResultPassport(passport, { requireEvidence: true });
  } catch {
    fail('a Fix the Five round Result Passport is invalid or incomplete.');
  }
  return { total: points.total, max: points.max };
}

/**
 * Build one privacy-safe aggregate from the five independently normalized
 * Fix the Five responses. This never uses the UI's completion counter or its
 * display total, both of which can tolerate missing outcome records. The
 * public projection accepts the run only when its shared client schema has
 * been upgraded alongside the signer and receiver.
 */
export function buildVerifiedFixTheFiveRunPublicResultSummary({ board, outcomes, selections } = {}) {
  if (!isRecord(board) || board.gameKind !== 'fix-the-five' || !isRecord(board.packageRef)
    || !Array.isArray(board.challenges) || board.challenges.length !== 5
    || !(outcomes instanceof Map) || outcomes.size !== 5 || !isRecord(selections)) {
    fail('all five verified Fix the Five rounds are required.');
  }

  const expectedBoardRef = boardReference(board);
  const challengeIds = board.challenges.map(challenge => String(challenge?.challengeId || ''));
  if (challengeIds.some(id => !id) || new Set(challengeIds).size !== 5
    || [...outcomes.keys()].some(id => !challengeIds.includes(id))
    || Object.keys(selections).length !== 5
    || Object.keys(selections).some(id => !challengeIds.includes(id))) {
    fail('the run must contain exactly one selection and outcome for each unique board challenge.');
  }

  let total = 0;
  let max = 0;
  for (const challenge of board.challenges) {
    const challengeId = String(challenge.challengeId);
    const selectedPlayerRef = selections[challengeId];
    const points = validateFixTheFiveRoundOutcome({
      board,
      challenge,
      outcome: outcomes.get(challengeId),
      selectedPlayerRef,
    });
    total += points.total;
    max += points.max;
  }
  const ruleVersion = board.gamePointsPolicy.ruleVersion;
  if ((ruleVersion === 'swishiq-game-points-v1' && (max < 20 || max > 25))
    || (ruleVersion === 'swishiq-game-points-v2' && max !== 50)
    || total > max) fail('the five-round Game Points total is invalid.');

  let summary;
  try {
    summary = projectPublicResultShareV1({
      tool: 'fix-the-five',
      scenarioKind: 'fix-the-five-run',
      packagePin: packagePinFromBoardRef(board.packageRef),
      result: {
        status: 'complete',
        runSummary: {
          format: 'swishiq-fix-the-five-run-v1',
          roundsCompleted: 5,
          roundsTotal: 5,
          gamePoints: { ruleVersion, total, max },
        },
      },
      board: { boardId: board.boardId, seed: board.dailySeed },
    });
  } catch (error) {
    if (/scenarioKind|runSummary/i.test(String(error?.message || ''))) {
      fail('the public result contract does not support verified five-round Fix the Five summaries yet.');
    }
    throw error;
  }
  if (summary.scenarioKind !== 'fix-the-five-run' || summary.result.runSummary?.roundsCompleted !== 5) {
    fail('the public result contract does not support a complete Fix the Five run.');
  }
  return summary;
}

/**
 * Build the one-board Draft Night summary from the loader/evaluator values
 * after their existing validators have accepted them. Fix the Five's five
 * separate board outcomes intentionally do not fit this single-result shape.
 */
export function buildVerifiedDraftNightPublicResultSummary({ board, outcome } = {}) {
  if (!isRecord(board) || board.gameKind !== 'draft-night' || !isRecord(board.packageRef)
    || !isRecord(outcome) || outcome.format !== 'djhc-swishiq-game-evaluate-response-v1'
    || outcome.contractVersion !== 1 || outcome.action !== 'evaluate'
    || !isRecord(outcome.resultPassport)) {
    fail('a verified Draft Night board and result are required.');
  }
  const expectedBoardRef = boardReference(board);
  const passport = outcome.resultPassport;
  if (canonicalJson(outcome.boardRef) !== canonicalJson(expectedBoardRef)
    || canonicalJson(passport.evidence?.boardRef) !== canonicalJson(expectedBoardRef)
    || passport.status !== 'complete' || passport.scenarioKind !== 'draft-night'
    || passport.compatibility !== null) {
    fail('the Result Passport does not match this verified Draft Night board.');
  }

  const packageRef = board.packageRef;
  const decision = passport.decision;
  const proof = decisionProofStatus(decision);
  const result = { status: 'complete', gamePoints: passport.gamePoints };
  if (proof.countComplete) {
    result.decision = {
      rank: decision.rank,
      optionCount: decision.optionCount,
      countComplete: true,
    };
  }

  return projectPublicResultShareV1({
    tool: 'draft-night',
    scenarioKind: 'draft-night',
    packagePin: packagePinFromBoardRef(packageRef),
    result,
    board: { boardId: board.boardId, seed: board.dailySeed },
  });
}

function v4DailyCapabilityProof(proof, releasePin, capabilityId) {
  const mapped = proof.index?.capabilityMap?.capabilities?.[capabilityId];
  if (!isRecord(mapped)) fail(`the V4 ${capabilityId} capability is unavailable.`);
  return {
    format: 'djhc-swishiq-v4-studio-runtime-adapter-v2',
    version: 'swishiq-v4-studio-runtime-adapter-v2',
    status: 'verified-data-access',
    capabilityId,
    capability: {
      capabilityId,
      capabilityClass: mapped.capabilityClass || 'native-model-capability',
      nativeCapabilityId: mapped.nativeCapabilityId,
      evidenceState: mapped.evidenceState,
      descriptiveDataAccess: mapped.executionReadiness?.descriptiveDataAccess,
      modelExecution: mapped.executionReadiness?.modelExecution,
      predictiveValidationStatus: mapped.predictiveValidationStatus,
      artifactIds: Array.isArray(mapped.artifactIds) ? [...mapped.artifactIds] : [],
      seasonCoverage: mapped.seasonCoverage,
    },
    scope: proof.scope,
    package: proof.package,
    source: {
      releaseId: proof.releaseId,
      registrySha256: proof.registrySha256,
      registryRevisionSha256: proof.registryRevisionSha256,
      reviewReceiptSha256: releasePin.reviewReceiptSha256,
      authorizationReferenceSha256: releasePin.authorizationReferenceSha256,
      indexSha256: proof.indexSha256,
      capabilityMapSha256: proof.package.capabilityMapSha256,
    },
    useBoundary: {
      descriptiveDataAccess: 'verified',
      modelExecution: 'not-performed-by-share-client',
      predictiveEligibility: 'ineligible-by-default',
      approvalClaimsMade: false,
    },
  };
}

async function verifiedDailyShareCapabilities(board, releasePin, fetcher = globalThis.fetch?.bind(globalThis)) {
  if (!isRecord(board) || board.format !== 'djhc-swishiq-static-daily-board-v4'
    || !isRecord(releasePin) || releasePin.status !== 'reviewed') {
    fail('a verified V4 daily board and reviewed runtime release pin are required.');
  }
  const year = board.scope?.seasonStartYears?.[0];
  const phase = board.phase;
  const proof = await loadCanonicalV4PublicPackageProof({
    registryUrl: releasePin.registryUrl,
    expectedRegistrySha256: releasePin.registrySha256,
    expectedIdentity: releasePin.expectedIdentity,
    scope: { kind: 'exact-season', seasonStartYears: [year], phases: [phase] },
    packageId: board.packageRef?.packageId,
    requiredCapabilities: ['boxScore', 'exactSeasonImpact'],
    acceptPooled: false,
    fetchImpl: fetcher,
  });
  const packagePin = releasePin.packagePins?.find(row => row?.packageId === board.packageRef.packageId);
  if (!packagePin || proof.releaseId !== board.packageRef.releaseId
    || proof.registrySha256 !== board.packageRef.registrySha256
    || proof.registryRevisionSha256 !== board.packageRef.registryRevisionSha256
    || proof.indexSha256 !== board.packageRef.indexSha256
    || proof.package.capabilityMapSha256 !== board.packageRef.capabilityMapSha256
    || proof.package.packageId !== board.packageRef.packageId
    || proof.package.packageVersion !== board.packageRef.packageVersion
    || canonicalJson(proof.package.scope) !== canonicalJson(board.packageRef.scope)
    || proof.package.sourceLockDigestKind !== board.packageRef.sourceLockDigestKind
    || proof.package.sourceLockSha256 !== board.packageRef.sourceLockSha256
    || proof.package.sourceLockEmbeddedSha256 !== board.packageRef.sourceLockEmbeddedSha256
    || proof.package.sourceLockFileSha256 !== board.packageRef.sourceLockFileSha256
    || proof.package.sourceLockFileByteLength !== board.packageRef.sourceLockFileByteLength
    || proof.package.sourceLockSchemaSha256 !== board.packageRef.sourceLockSchemaSha256
    || proof.indexSha256 !== packagePin.indexSha256
    || proof.package.capabilityMapSha256 !== packagePin.capabilityMapSha256
    || proof.package.sourceLockSha256 !== packagePin.sourceLockSha256
    || proof.package.sourceLockEmbeddedSha256 !== packagePin.sourceLockEmbeddedSha256
    || proof.package.sourceLockFileSha256 !== packagePin.sourceLockFileSha256
    || proof.package.sourceLockFileByteLength !== packagePin.sourceLockFileByteLength
    || proof.package.sourceLockSchemaSha256 !== packagePin.sourceLockSchemaSha256) {
    fail('V4 daily share package evidence does not match the verified board and release pins.');
  }
  return ['boxScore', 'exactSeasonImpact'].map(capabilityId => v4DailyCapabilityProof(proof, releasePin, capabilityId));
}

async function validatedDailyV4Outcome({ board, outcome, scenarioId = '', normalizedPlayerNameKey = '', picks = [], releasePin }) {
  const request = await buildSwishIqV4DailyGameRequest({ board, releasePin, scenarioId, normalizedPlayerNameKey, picks });
  const normalized = validateSwishIqV4DailyGameResponse(outcome, request, { releasePin, board });
  if (normalized.status !== 'complete') fail(`the V4 daily result is unavailable (${normalized.reason}).`);
  return normalized;
}

/** Create a Draft Night V4 share only after source proof and the selected result both pass their exact pins. */
export async function buildVerifiedDraftNightV4PublicResultSummary({
  board,
  outcome,
  releasePin = globalThis.window?.DJ?.swishIQDailyGameReleasePin,
  fetcher = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (!isRecord(board) || board.gameKind !== 'draft-night' || !isRecord(outcome)
    || !Array.isArray(outcome.selection)) fail('a verified Draft Night V4 selection and result are required.');
  const normalized = await validatedDailyV4Outcome({ board, outcome, picks: outcome.selection, releasePin });
  const capabilities = await verifiedDailyShareCapabilities(board, releasePin, fetcher);
  const year = board.scope.seasonStartYears[0];
  return projectPublicResultShareV4({
    tool: 'draft-night',
    scenarioKind: 'draft-night',
    requiredCapabilityIds: ['boxScore', 'exactSeasonImpact'],
    verifiedCapabilities: capabilities,
    packagePin: { scope: { kind: 'exact-season', seasonStartYear: year, seasonEndYear: year + 1, phase: board.phase } },
    result: { status: 'complete', decision: normalized.evaluation.decision },
    board: { boardId: board.boardId, seed: board.dailySeed },
  });
}

/** Aggregate five verified name-key challenge ranks into a privacy-safe V4 run share. */
export async function buildVerifiedFixTheFiveV4RunPublicResultSummary({
  board,
  outcomes,
  selections,
  releasePin = globalThis.window?.DJ?.swishIQDailyGameReleasePin,
  fetcher = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (!isRecord(board) || board.gameKind !== 'fix-the-five' || !Array.isArray(board.challenges)
    || board.challenges.length !== 5 || !(outcomes instanceof Map) || outcomes.size !== 5 || !isRecord(selections)) {
    fail('all five verified Fix the Five V4 rounds are required.');
  }
  const ranks = [];
  for (const challenge of board.challenges) {
    const id = challenge.challengeId;
    const selectedKey = selections[id];
    if (typeof selectedKey !== 'string') fail('one V4 name-key selection is required for every challenge.');
    const outcome = await validatedDailyV4Outcome({
      board, outcome: outcomes.get(id), scenarioId: id, normalizedPlayerNameKey: selectedKey, releasePin,
    });
    if (outcome.selection.normalizedPlayerNameKey !== selectedKey
      || outcome.evaluation.decision.optionCount !== 3) fail('a V4 Fix the Five result does not match its exact three-choice challenge.');
    ranks.push(outcome.evaluation.decision.rank);
  }
  if (Object.keys(selections).length !== 5
    || Object.keys(selections).some(id => !board.challenges.some(challenge => challenge.challengeId === id))) {
    fail('the V4 run contains an unknown challenge selection.');
  }
  const capabilities = await verifiedDailyShareCapabilities(board, releasePin, fetcher);
  const year = board.scope.seasonStartYears[0];
  return projectPublicResultShareV4({
    tool: 'fix-the-five',
    scenarioKind: 'fix-the-five-run',
    requiredCapabilityIds: ['boxScore', 'exactSeasonImpact'],
    verifiedCapabilities: capabilities,
    packagePin: { scope: { kind: 'exact-season', seasonStartYear: year, seasonEndYear: year + 1, phase: board.phase } },
    result: {
      status: 'complete',
      dailyRunSummary: {
        format: 'swishiq-fix-the-five-v4-run-input-v1',
        roundsCompleted: 5,
        roundsTotal: 5,
        roundRanks: ranks,
      },
    },
    board: { boardId: board.boardId, seed: board.dailySeed },
  });
}

/**
 * Return whether this page has both a configured Supabase invoker and at
 * least one configured trusted public key. This is a presentation hint only;
 * createSignedPublicResultShareLink repeats all checks before making a call.
 */
export function isSignedPublicResultShareAvailable({
  windowRef = globalThis.window,
  shareMethod = undefined,
  trustedPublicKeyJwks = PUBLIC_RESULT_SHARE_TRUSTED_PUBLIC_KEY_JWKS,
} = {}) {
  const method = shareMethod || (typeof windowRef?.navigator?.share === 'function'
    ? 'native'
    : typeof windowRef?.navigator?.clipboard?.writeText === 'function' ? 'clipboard' : '');
  if (!METHODS.has(method) || !hasConfiguredPublicKeyJwks(trustedPublicKeyJwks)
    || !windowRef?.crypto?.subtle) return false;
  try {
    configuredSupabaseInvoker(windowRef);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sign a purpose-built summary and create a same-origin share URL.
 *
 * `invokeSigner`, `trustedPublicKeys`, `origin`, `cryptoImpl`, `now`, and
 * `trackEvent` are explicit seams for focused tests. Production callers omit
 * them and use the configured Supabase client and receiver key allowlist.
 * `recordShared()` must be called only after the native/clipboard action
 * succeeds; it can emit only the fixed result_shared tool/method dimensions.
 */
export async function createSignedPublicResultShareLink(summary, {
  toolId,
  shareMethod,
  invokeSigner,
  trustedPublicKeys: suppliedTrustedPublicKeys,
  origin,
  cryptoImpl = globalThis.crypto,
  now = Date.now(),
  windowRef = globalThis.window,
  trackEvent,
} = {}) {
  if (!METHODS.has(shareMethod)) fail('choose a supported share method.');
  if (typeof toolId !== 'string' || !TOOL_IDS.has(toolId)) fail('the tool is not registered for public sharing.');
  if (!cryptoImpl?.subtle || typeof cryptoImpl.subtle.importKey !== 'function') {
    fail('this browser cannot verify signed shares.');
  }

  const projected = summary?.format === PUBLIC_RESULT_SHARE_V4_FORMAT
    ? projectPublicResultShareV4PayloadShape(summary)
    : projectPublicResultShareV1(summary);
  if (projected.tool !== toolId || projected.result.status !== 'complete') {
    fail('only a complete result for the expected tool can be shared.');
  }
  // The signer performs strict current package validation and intentionally
  // accepts only pins that can be matched against its published registry.
  if (Object.hasOwn(projected.packagePin, 'sourceManifestSetSha256')) {
    fail('the package pin is not compatible with the current public signer.');
  }

  let trustedPublicKeys = suppliedTrustedPublicKeys;
  if (trustedPublicKeys === undefined) {
    try {
      trustedPublicKeys = await importPublicResultShareTrustedKeys({ cryptoImpl });
    } catch {
      fail('the trusted public-key allowlist is unavailable.');
    }
  }
  assertTrustedPublicKeys(trustedPublicKeys);

  const baseOrigin = sameOriginBase(origin ?? windowRef?.location?.origin);
  const sign = typeof invokeSigner === 'function' ? invokeSigner : configuredSupabaseInvoker(windowRef);
  const envelope = await sign({ summary: projected, share_method: shareMethod });
  const verification = await verifyPublicResultShareEnvelopeV2(envelope, {
    trustedPublicKeys,
    now,
    cryptoImpl,
  });
  if (!verification.ok) fail(`the signer response did not verify (${verification.reason}).`);
  if (canonicalJson(verification.payload) !== canonicalJson(projected)) {
    fail('the signer response does not match this result.');
  }

  const url = new URL(PUBLIC_RESULT_SHARE_ROUTE, baseOrigin);
  url.searchParams.set('envelope', JSON.stringify(envelope));
  url.hash = '';
  const maximumSearchLength = PUBLIC_RESULT_SHARE_V2_LIMITS.maxEnvelopeBytes * 3 + 1_024;
  if (url.search.length > maximumSearchLength) fail('the signed share URL exceeds the receiver limit.');

  let recorded = false;
  const recordShared = () => {
    if (recorded) return false;
    recorded = true;
    const tracker = typeof trackEvent === 'function' ? trackEvent : windowRef?.DJ?.trackEvent;
    if (typeof tracker !== 'function') return false;
    try {
      return tracker.call(windowRef?.DJ, PUBLIC_RESULT_SHARE_EVENT, {
        tool_id: projected.tool,
        share_method: shareMethod,
      }) !== false;
    } catch {
      return false;
    }
  };

  return Object.freeze({ url: url.toString(), expiresAt: verification.expiresAt, recordShared });
}
