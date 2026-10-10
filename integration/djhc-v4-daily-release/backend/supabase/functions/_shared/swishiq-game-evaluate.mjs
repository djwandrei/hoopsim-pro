import {
  sha256Bytes,
  stableJson,
  validateSwishIqPublicProjectionBinding,
  validateSwishIqPublicProjectionIndex,
  validateSwishIqPublicProjectionPart,
  validateSwishIqPublicRegistry,
} from '../../../scripts/lib/swishiq-static-projection.mjs';
import { validateSwishIqStaticDailyBoard } from '../../../scripts/lib/swishiq-static-daily-board.mjs';
import { POINT_RULE_VERSION, PREVIOUS_POINT_RULE_VERSION } from '../../../tools/result-passport.js';
import {
  buildSwishIqGameEvaluateResponse,
  validateSwishIqGameEvaluateRequest,
} from '../../../scripts/lib/swishiq-game-evaluate-contract.mjs';
import {
  loadCanonicalV4PublicPackageProof,
  loadCanonicalV4PublicParts,
} from '../../../tools/swishiq-studio/engine/canonical-v4-public-network-loader.js';
import {
  evaluateSwishIqV4DailyGameSelection,
} from '../../../tools/swishiq-studio/engine/swishiq-daily-game-v4-evaluator.js';
import { evaluateV4BoxScoreSelection } from '../../../tools/swishiq-studio/engine/swishiq-daily-game-v4-box-score.js';
import {
  SWISHIQ_DAILY_GAME_V4_BOX_SCORE_CONTRACT,
  SWISHIQ_DAILY_GAME_V4_REQUEST_FORMAT,
  completeSwishIqV4DailyGameResponse,
  dailyGamePinUrl,
  findSwishIqV4DailyGamePin,
  unavailableSwishIqV4DailyGameResponse,
  validateSwishIqV4DailyBoard,
  validateSwishIqV4DailyGameRequest,
  validateSwishIqV4DailyGameRequestEnvelope,
} from '../../../tools/swishiq-studio/engine/swishiq-daily-game-v4-contract.js';

export const SWISHIQ_GAME_EVALUATE_PUBLIC_DATA_ROOT =
  'https://www.djshouseofcards-comics.com/tools/swishiq-studio/data/';

const GAME_EVALUATE_REQUEST_MAX_BYTES = 24_576;
const REGISTRY_MAX_BYTES = 512 * 1024;
const BOARD_MAX_BYTES = 2 * 1024 * 1024;
const PROJECTION_INDEX_MAX_BYTES = 4 * 1024 * 1024;
const PLAYER_IMPACT_MAX_BYTES = 16 * 1024 * 1024;
const PLAYER_IMPACT_ARTIFACT_ID = 'player-impact';
const PLAYER_IMPACT_FIELD = 'combined';
const V4_DAILY_BOARD_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set([
  'https://www.djshouseofcards-comics.com',
  'https://djshouseofcards-comics.com',
]);

class EvaluationError extends Error {
  constructor(kind) {
    super(kind);
    this.name = 'EvaluationError';
    this.kind = kind;
  }
}

function fail(kind) {
  throw new EvaluationError(kind);
}

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function boardRoute(boardId) {
  if (typeof boardId !== 'string') fail('request');
  const match = /^swishiq-(fix-the-five|draft-night)-(\d{8})-[a-f0-9]{12}$/.exec(boardId);
  if (!match) fail('request');
  const seed = match[2];
  return {
    gameKind: match[1],
    dailySeed: seed.slice(0, 4) + '-' + seed.slice(4, 6) + '-' + seed.slice(6, 8),
    contentHashPrefix: boardId.slice(-12),
  };
}

function withCachePins(relativePath, revision, now, root = SWISHIQ_GAME_EVALUATE_PUBLIC_DATA_ROOT) {
  const url = new URL(relativePath, root);
  if (revision) url.searchParams.set('rev', revision);
  url.searchParams.set('cb', String(now));
  return url;
}

async function readBoundedBytes(response, maximumBytes) {
  if (!response?.ok) fail('upstream');
  const lengthHeader = response.headers?.get?.('content-length');
  if (lengthHeader && /^\d+$/.test(lengthHeader) && Number(lengthHeader) > maximumBytes) {
    fail('upstream');
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) fail('upstream');
    return bytes;
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      try { await reader.cancel(); } catch { /* already closed */ }
      fail('upstream');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function requestBytes(request, maximumBytes) {
  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader && /^\d+$/.test(lengthHeader) && Number(lengthHeader) > maximumBytes) {
    fail('request');
  }
  const reader = request.body?.getReader?.();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      try { await reader.cancel(); } catch { /* already closed */ }
      fail('request');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseJsonBytes(bytes, errorKind = 'upstream') {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail(errorKind);
  }
}

async function fetchJson(fetchImpl, relativePath, revision, maximumBytes, now) {
  let response;
  try {
    response = await fetchImpl(withCachePins(relativePath, revision, now), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    fail('upstream');
  }
  return parseJsonBytes(await readBoundedBytes(response, maximumBytes));
}

async function fetchBytes(fetchImpl, relativePath, revision, maximumBytes, now) {
  let response;
  try {
    response = await fetchImpl(withCachePins(relativePath, revision, now), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    fail('upstream');
  }
  return await readBoundedBytes(response, maximumBytes);
}

function validatedIpAddress(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 64) return null;

  const ipv4Parts = candidate.split('.');
  if (ipv4Parts.length === 4 && ipv4Parts.every(part => /^\d{1,3}$/.test(part))) {
    const octets = ipv4Parts.map(Number);
    if (octets.every(octet => octet >= 0 && octet <= 255)) return octets.join('.');
    return null;
  }

  // Wrapping the candidate in brackets makes the URL parser validate it as
  // IPv6 (including compressed and IPv4-mapped forms), never as a hostname.
  if (!candidate.includes(':') || !/^[0-9a-f:.]+$/i.test(candidate)) return null;
  try {
    const hostname = new URL('http://[' + candidate + ']/').hostname;
    return hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1).toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function requestIp(request) {
  // Supabase's gateway-provided Cloudflare header is the trusted source here.
  // X-Forwarded-For is caller-controlled at this boundary; when the gateway
  // value is absent or invalid, share the conservative "unknown" bucket.
  return validatedIpAddress(request.headers.get('cf-connecting-ip')) || 'unknown';
}

async function checkRateLimit(request, rpc, cryptoImpl) {
  if (typeof rpc !== 'function' || !cryptoImpl?.subtle) fail('configuration');
  const digest = await cryptoImpl.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('swishiq-game-evaluate:' + requestIp(request)),
  );
  const fingerprint = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  let result;
  try {
    result = await rpc('take_public_submission_slot', {
      p_scope: 'swishiq-game-evaluate:ip',
      p_fingerprint: fingerprint,
      p_limit: 60,
      p_window_seconds: 3600,
    });
  } catch {
    fail('configuration');
  }
  if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'error')) fail('configuration');
  if (result.error === null) return;
  if (result.error?.code === 'P0001'
    && result.error?.message === 'Please wait before submitting another request.') fail('rate-limited');
  fail('configuration');
}

function addPlayerImpact(rowsByRef, playerRef) {
  const row = rowsByRef.get(playerRef);
  if (!row || row.displayEligible !== true || row.holdoutStatus !== 'validated'
    || typeof row[PLAYER_IMPACT_FIELD] !== 'number' || !Number.isFinite(row[PLAYER_IMPACT_FIELD])) {
    fail('package');
  }
  return row[PLAYER_IMPACT_FIELD];
}

function sumRefs(rowsByRef, refs) {
  return refs.reduce((sum, playerRef) => sum + addPlayerImpact(rowsByRef, playerRef), 0);
}

function compareRankedChoices(left, right) {
  if (left.score !== right.score) return right.score - left.score;
  if (left.tieKey < right.tieKey) return -1;
  if (left.tieKey > right.tieKey) return 1;
  return 0;
}

function cartesianChoices(rounds, roundIndex = 0, prefix = [], output = []) {
  if (roundIndex === rounds.length) {
    output.push([...prefix]);
    return output;
  }
  for (const candidate of rounds[roundIndex].candidates) {
    prefix.push(candidate.playerRef);
    cartesianChoices(rounds, roundIndex + 1, prefix, output);
    prefix.pop();
  }
  return output;
}

function assertBoardScoringEligibility(board) {
  if (board.gameKind === 'draft-night') {
    const teams = new Set(board.deck.rounds.map(round => round.teamCode));
    if (teams.size !== board.deck.rounds.length) fail('upstream');
  }
}

function scoreSelection({ request, board, rowsByRef }) {
  let ranked;
  let selectedKey;
  let inputRowCount;
  let benchmarkId;
  let selectedScore;
  if (request.selection.kind === 'fix-the-five') {
    const challenge = board.challenges.find(item => item.challengeId === request.selection.challengeId);
    if (!challenge) fail('request');
    const baselineRefs = challenge.lineup.map(player => player.playerRef);
    const outgoingRef = challenge.removePlayerRef;
    if (!baselineRefs.includes(outgoingRef)) fail('package');
    const baselineScore = sumRefs(rowsByRef, baselineRefs);
    const retainedRefs = baselineRefs.filter(playerRef => playerRef !== outgoingRef);
    ranked = challenge.candidates.map(candidate => {
      const score = sumRefs(rowsByRef, [...retainedRefs, candidate.playerRef]) - baselineScore;
      return { refs: [candidate.playerRef], score, tieKey: candidate.playerRef };
    }).sort(compareRankedChoices);
    selectedKey = request.selection.playerRef;
    inputRowCount = new Set([...baselineRefs, ...challenge.candidates.map(item => item.playerRef)]).size;
    benchmarkId = 'baseline-lineup';
    selectedScore = ranked.find(choice => choice.refs[0] === selectedKey)?.score;
  } else {
    const rounds = board.deck.rounds;
    const legalChoices = cartesianChoices(rounds);
    ranked = legalChoices.map(refs => ({
      refs,
      score: sumRefs(rowsByRef, refs) / refs.length,
      tieKey: refs.join('|'),
    })).sort(compareRankedChoices);
    selectedKey = request.selection.picks.map(pick => pick.playerRef).join('|');
    inputRowCount = new Set(rounds.flatMap(round => round.candidates.map(item => item.playerRef))).size;
    benchmarkId = 'same-board-legal-set';
    selectedScore = ranked.find(choice => choice.tieKey === selectedKey)?.score;
  }
  if (!ranked.length || !Number.isFinite(selectedScore)) fail('request');
  const selectedRank = ranked.findIndex(choice => choice.tieKey === selectedKey || choice.refs.join('|') === selectedKey) + 1;
  if (selectedRank < 1) fail('request');
  const topScore = ranked[0].score;
  const gapToBest = Math.max(0, topScore - selectedScore);
  const optionCount = ranked.length;
  return {
    nativeOutcome: {
      kind: 'net-rating-difference',
      unit: 'points-per-100-possessions',
      value: selectedScore,
      state: 'estimated',
      benchmarkId,
      coverage: { status: 'complete', observations: inputRowCount },
      uncertainty: { status: 'not-available' },
    },
    decision: {
      rank: selectedRank,
      optionCount,
      gapToBest,
      gapUnit: 'points-per-100-possessions',
      state: selectedRank === 1 ? 'best-proven' : 'best-found',
      quality: selectedRank === 1 ? 'best-legal-choice' : 'best-found',
      proof: { kind: 'exact-enumeration' },
      search: { exact: true, evaluatedChoices: optionCount },
    },
    inputRowCount,
  };
}

export function evaluateSwishIqGameSelection({
  request,
  board,
  registry,
  projectionIndex,
  playerImpactBytes,
} = {}) {
  const normalizedRegistry = validateSwishIqPublicRegistry(registry);
  const normalizedIndex = validateSwishIqPublicProjectionIndex(projectionIndex);
  const entry = normalizedRegistry.packages.find(item =>
    item.packageId === board?.packageRef?.packageId
      && item.packageVersion === board?.packageRef?.packageVersion);
  if (!entry || entry.modelId !== 'swishiq-v3'
    || entry.metricsVersion !== 'swishiq-v3-metrics-v1.2'
    || normalizedIndex.modelId !== 'swishiq-v3'
    || normalizedIndex.metricsVersion !== 'swishiq-v3-metrics-v1.2') fail('package');
  const binding = validateSwishIqPublicProjectionBinding(entry, normalizedIndex);
  const normalizedBoard = validateSwishIqStaticDailyBoard(board, {
    registry: normalizedRegistry,
    projectionIndex: binding.projection,
  });
  assertBoardScoringEligibility(normalizedBoard);
  const normalizedRequest = validateSwishIqGameEvaluateRequest(request, {
    board: normalizedBoard,
    registry: normalizedRegistry,
    projectionIndex: binding.projection,
  });
  const descriptor = binding.projection.artifacts.find(item => item.artifactId === PLAYER_IMPACT_ARTIFACT_ID);
  if (!descriptor || descriptor.kind !== PLAYER_IMPACT_ARTIFACT_ID
    || descriptor.path !== 'parts/player-impact.json'
    || !(playerImpactBytes instanceof Uint8Array)
    || playerImpactBytes.byteLength !== descriptor.bytes
    || sha256Bytes(playerImpactBytes) !== descriptor.sha256) fail('package');
  const playerImpactPart = parseJsonBytes(playerImpactBytes);
  const normalizedPart = validateSwishIqPublicProjectionPart(playerImpactPart, {
    projectionIndex: binding.projection,
    descriptor,
  });
  if (normalizedPart.artifactId !== PLAYER_IMPACT_ARTIFACT_ID) fail('package');
  const rowsByRef = new Map();
  for (const row of normalizedPart.records) {
    if (rowsByRef.has(row.playerRef)) fail('package');
    if (!isRecord(row.fitScope) || stableJson(row.fitScope) !== stableJson(binding.projection.scope)) {
      fail('package');
    }
    rowsByRef.set(row.playerRef, row);
  }

  const scored = scoreSelection({
    request: normalizedRequest,
    board: normalizedBoard,
    rowsByRef,
  });
  const rowLabel = scored.inputRowCount === 1 ? 'public player-impact row' : 'public player-impact rows';
  const denominatorBasis = normalizedBoard.gameKind === 'fix-the-five'
    ? 'cover the baseline and legal alternatives'
    : 'cover every legal draft candidate';
  const evidence = {
    evidenceLabel: 'Estimated additive player impact',
    sourceNote: 'Uses published V3 combined player-impact values; this additive score is not a validated five-player outcome, forecast, or causal result.',
    denominator: String(scored.inputRowCount) + ' ' + rowLabel + ' ' + denominatorBasis + '; these are not game or possession observations.',
    coverage: 'complete · ' + String(scored.inputRowCount) + ' player-impact rows',
    reliability: 'Exact rank compares only the legal choices on this hash-bound board under the additive player-impact score.',
    uncertainty: 'Not available; no calibrated interval is available for additive player-impact totals.',
    sourceNotes: [
      'Exact ties are ordered by ascending opaque public player references.',
      'Only the selected outcome and rank proof are returned; the legal-choice score table is not exposed.',
    ],
  };
  return buildSwishIqGameEvaluateResponse({
    request: normalizedRequest,
    board: normalizedBoard,
    registry: normalizedRegistry,
    projectionIndex: binding.projection,
    nativeOutcome: scored.nativeOutcome,
    decision: scored.decision,
    constraints: { completed: 0, total: 0 },
    evidence,
  });
}

function corsOrigins(siteUrl = '') {
  const origins = new Set(ALLOWED_ORIGINS);
  try {
    const origin = new URL(siteUrl).origin;
    if (origin.startsWith('https://')) origins.add(origin);
  } catch { /* optional site setting */ }
  return origins;
}

function responseHeaders(request, origins) {
  const requestOrigin = request.headers.get('origin') || '';
  const allowOrigin = origins.has(requestOrigin) ? requestOrigin : [...origins][0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function jsonResponse(body, status, request, origins) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request, origins),
  });
}

function errorResponse(error, request, origins) {
  const kind = error instanceof EvaluationError ? error.kind : '';
  if (kind === 'request') return jsonResponse({ error: 'Invalid board request or legal selection.' }, 400, request, origins);
  if (kind === 'rate-limited') return jsonResponse({ error: 'Please wait before requesting another evaluation.' }, 429, request, origins);
  if (kind === 'package') return jsonResponse({ error: 'The current exact V3 package evidence is unavailable.' }, 409, request, origins);
  if (kind === 'upstream') return jsonResponse({ error: 'The current public board or package could not be verified.' }, 409, request, origins);
  return jsonResponse({ error: 'Daily game evaluation is unavailable.' }, 503, request, origins);
}

async function handleV4DailyGameRequest({ body, releasePin, fetchImpl }) {
  await validateSwishIqV4DailyGameRequestEnvelope(body);
  if (!releasePin || releasePin.status !== 'reviewed') {
    return unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-release-pin-unavailable');
  }
  let selected;
  try {
    selected = findSwishIqV4DailyGamePin(releasePin, {
      gameKind: body.boardRef.gameKind,
      dailySeed: body.boardRef.dailySeed,
    });
  } catch (error) {
    if (error?.code === 'v4-daily-board-pin-unavailable') {
      return unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-board-pin-unavailable');
    }
    throw error;
  }
  if (selected.release.releaseId !== body.boardRef.releaseId
    || selected.pin.path !== body.boardRef.path
    || selected.pin.boardSha256 !== body.boardRef.boardSha256
    || selected.pin.boardContentSha256 !== body.boardRef.boardContentSha256
    || selected.pin.packageId !== body.boardRef.packageId
    || selected.pin.packageVersion !== body.boardRef.packageVersion
    || stableJson(selected.pin.scope) !== stableJson(body.boardRef.scope)
    || selected.pin.phase !== body.boardRef.phase) {
    return unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-board-unavailable');
  }
  const boardUrl = new URL(dailyGamePinUrl(releasePin, selected.pin));
  if (!ALLOWED_ORIGINS.has(boardUrl.origin)) {
    return unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-release-pin-unavailable');
  }
  let response;
  try {
    response = await fetchImpl(boardUrl.href, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
  } catch {
    return unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-board-unavailable');
  }
  if (!response?.ok) return unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-board-unavailable');
  const bytes = await readBoundedBytes(response, V4_DAILY_BOARD_MAX_BYTES);
  let board;
  try {
    board = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-board-unavailable');
  }
  const normalizedBoard = await validateSwishIqV4DailyBoard(board, {
    releasePin,
    gameKind: selected.pin.gameKind,
    dailySeed: selected.pin.dailySeed,
    boardBytes: bytes,
  });
  await validateSwishIqV4DailyGameRequest(body, { board: normalizedBoard, releasePin });
  const packageId = selected.pin.packageId;
  const seasonStartYear = selected.pin.scope.seasonStartYears[0];
  const boxScore = normalizedBoard.scoringContract === SWISHIQ_DAILY_GAME_V4_BOX_SCORE_CONTRACT;
  const artifactIds = boxScore ? ['player-games'] : ['player-impact', 'player-games'];
  let proof;
  try {
    proof = await loadCanonicalV4PublicPackageProof({
      registryUrl: releasePin.registryUrl,
      expectedRegistrySha256: releasePin.registrySha256,
      expectedIdentity: releasePin.expectedIdentity,
      scope: { kind: 'exact-season', seasonStartYears: [seasonStartYear], phases: [selected.pin.phase] },
      packageId,
      requiredCapabilities: boxScore ? ['boxScore'] : ['boxScore', 'exactSeasonImpact'],
      acceptPooled: false,
      fetchImpl,
      baseUrl: `${boardUrl.origin}/`,
    });
  } catch {
    return unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-evaluator-unavailable');
  }
  const packagePin = releasePin.packagePins?.find(row => row?.packageId === packageId);
  const expectedPackage = releasePin.expectedIdentity?.packages?.find(row => row?.packageId === packageId);
  if (!packagePin || !expectedPackage
    || proof.releaseId !== selected.release.releaseId
    || proof.registrySha256 !== releasePin.registrySha256
    || proof.registryRevisionSha256 !== releasePin.registryRevisionSha256
    || proof.indexSha256 !== packagePin.indexSha256
    || proof.package.capabilityMapSha256 !== packagePin.capabilityMapSha256
    || proof.package.sourceLockDigestKind !== packagePin.sourceLockDigestKind
    || proof.package.sourceLockSha256 !== packagePin.sourceLockSha256
    || proof.package.sourceLockEmbeddedSha256 !== packagePin.sourceLockEmbeddedSha256
    || proof.package.sourceLockFileSha256 !== packagePin.sourceLockFileSha256
    || proof.package.sourceLockFileByteLength !== packagePin.sourceLockFileByteLength
    || proof.package.sourceLockSchemaSha256 !== packagePin.sourceLockSchemaSha256
    || proof.package.packageVersion !== selected.pin.packageVersion
    || proof.package.packageId !== expectedPackage.packageId
    || expectedPackage.packageVersion !== selected.pin.packageVersion) {
    return unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-evaluator-unavailable');
  }
  let parts;
  try {
    parts = await loadCanonicalV4PublicParts(proof, {
      artifactIds,
      fetchImpl,
    });
    const evaluation = (boxScore ? evaluateV4BoxScoreSelection : evaluateSwishIqV4DailyGameSelection)({
      request: body,
      board: normalizedBoard,
      impactPart: parts['player-impact'],
      playerGamesPart: parts['player-games'],
    });
    return completeSwishIqV4DailyGameResponse(body, {
      evaluation,
      sourcePins: {
        packageRef: normalizedBoard.packageRef,
        parts: artifactIds.map(artifactId => ({
          artifactId,
          sha256: parts[artifactId].sha256,
          rows: parts[artifactId].rows,
          bytes: parts[artifactId].bytes,
        })),
      },
    });
  } catch {
    return unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-evaluator-unavailable');
  }
}

/** @typedef {import('./swishiq-edge-rpc-types.ts').TakePublicSubmissionSlotRpc} TakePublicSubmissionSlotRpc */

/**
 * @typedef {Object} SwishIqGameEvaluateHandlerOptions
 * @property {typeof fetch} [fetchImpl]
 * @property {TakePublicSubmissionSlotRpc | null} [rpc]
 * @property {Crypto} [cryptoImpl]
 * @property {() => number} [now]
 * @property {string} [siteUrl]
 * @property {unknown} [v4ReleasePin]
 */

/** @param {SwishIqGameEvaluateHandlerOptions} [options] */
export function createSwishIqGameEvaluateHandler({
  fetchImpl = globalThis.fetch,
  rpc = null,
  cryptoImpl = globalThis.crypto,
  now = () => Date.now(),
  siteUrl = '',
  v4ReleasePin = null,
} = {}) {
  const origins = corsOrigins(siteUrl);
  return async function handleSwishIqGameEvaluate(request) {
    if (request.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          ...responseHeaders(request, origins),
          'Access-Control-Allow-Origin': origins.has(request.headers.get('origin') || '')
            ? request.headers.get('origin') || [...origins][0]
            : [...origins][0],
        },
      });
    }
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, request, origins);
    const origin = request.headers.get('origin') || '';
    if (origin && !origins.has(origin)) return jsonResponse({ error: 'This request origin is not allowed.' }, 403, request, origins);

    let stage = 'configuration';
    try {
      if (typeof fetchImpl !== 'function' || typeof now !== 'function') fail('configuration');
      await checkRateLimit(request, rpc, cryptoImpl);
      stage = 'request';
      const bodyBytes = await requestBytes(request, GAME_EVALUATE_REQUEST_MAX_BYTES);
      const body = parseJsonBytes(bodyBytes, 'request');
      if (body?.format === SWISHIQ_DAILY_GAME_V4_REQUEST_FORMAT) {
        stage = 'request';
        try {
          await validateSwishIqV4DailyGameRequestEnvelope(body);
        } catch {
          return jsonResponse({ error: 'Invalid V4 daily-game request.' }, 400, request, origins);
        }
        stage = 'v4';
        try {
          const response = await handleV4DailyGameRequest({ body, releasePin: v4ReleasePin, fetchImpl });
          return jsonResponse(response, 200, request, origins);
        } catch (error) {
          const code = String(error?.code || '');
          if (code.startsWith('v4-daily-board')) {
            return jsonResponse(unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-board-unavailable'), 200, request, origins);
          }
          if (code.startsWith('v4-daily-release-pin') || code.startsWith('v4-daily-pin')) {
            return jsonResponse(unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-release-pin-unavailable'), 200, request, origins);
          }
          if (code.startsWith('v4-daily-request') || code.startsWith('v4-daily-selection')) {
            return jsonResponse({ error: 'Invalid V4 daily-game request.' }, 400, request, origins);
          }
          return jsonResponse(unavailableSwishIqV4DailyGameResponse(body, 'v4-daily-evaluator-unavailable'), 200, request, origins);
        }
      }
      if (!exactKeys(body, ['format', 'contractVersion', 'action', 'boardRef', 'resultContract', 'selection'])
        || body.action !== 'evaluate' || !isRecord(body.boardRef)) fail('request');
      const route = boardRoute(body.boardRef.boardId);
      const pointRuleVersion = body.boardRef.gamePointsPolicy?.ruleVersion;
      if (![POINT_RULE_VERSION, PREVIOUS_POINT_RULE_VERSION].includes(pointRuleVersion)) fail('request');
      const currentTime = now();
      if (!Number.isSafeInteger(currentTime) || currentTime < 0) fail('configuration');

      stage = 'static';
      const registry = validateSwishIqPublicRegistry(await fetchJson(
        fetchImpl,
        'registry.json',
        '',
        REGISTRY_MAX_BYTES,
        currentTime,
      ));
      const board = await fetchJson(
        fetchImpl,
        (pointRuleVersion === POINT_RULE_VERSION ? 'boards/v2/' : 'boards/')
          + route.gameKind + '/' + route.dailySeed + '.json',
        route.contentHashPrefix,
        BOARD_MAX_BYTES,
        currentTime,
      );
      if (board?.boardId !== body.boardRef.boardId || board?.gameKind !== route.gameKind) fail('upstream');
      const entry = registry.packages.find(item =>
        item.packageId === board?.packageRef?.packageId
          && item.packageVersion === board?.packageRef?.packageVersion);
      if (!entry || entry.projectionIndexPath !== 'packages/' + entry.packageId + '/' + entry.packageVersion + '/index.json') {
        fail('upstream');
      }
      const projectionIndex = validateSwishIqPublicProjectionIndex(await fetchJson(
        fetchImpl,
        entry.projectionIndexPath,
        entry.projectionContentSha256,
        PROJECTION_INDEX_MAX_BYTES,
        currentTime,
      ));
      const binding = validateSwishIqPublicProjectionBinding(entry, projectionIndex);
      const normalizedBoard = validateSwishIqStaticDailyBoard(board, {
        registry,
        projectionIndex: binding.projection,
      });
      assertBoardScoringEligibility(normalizedBoard);

      let normalizedRequest;
      try {
        normalizedRequest = validateSwishIqGameEvaluateRequest(body, {
          board: normalizedBoard,
          registry,
          projectionIndex: binding.projection,
        });
      } catch {
        fail('request');
      }
      const descriptor = binding.projection.artifacts.find(item => item.artifactId === PLAYER_IMPACT_ARTIFACT_ID);
      if (!descriptor || descriptor.kind !== PLAYER_IMPACT_ARTIFACT_ID
        || descriptor.path !== 'parts/player-impact.json'
        || descriptor.bytes > PLAYER_IMPACT_MAX_BYTES) fail('package');
      const playerImpactBytes = await fetchBytes(
        fetchImpl,
        'packages/' + entry.packageId + '/' + entry.packageVersion + '/' + descriptor.path,
        descriptor.sha256,
        PLAYER_IMPACT_MAX_BYTES,
        currentTime,
      );

      stage = 'evaluate';
      const response = evaluateSwishIqGameSelection({
        request: normalizedRequest,
        board: normalizedBoard,
        registry,
        projectionIndex: binding.projection,
        playerImpactBytes,
      });
      return jsonResponse(response, 200, request, origins);
    } catch (error) {
      if (error instanceof EvaluationError) return errorResponse(error, request, origins);
      if (stage === 'request') return errorResponse(new EvaluationError('request'), request, origins);
      if (stage === 'static') return errorResponse(new EvaluationError('upstream'), request, origins);
      if (stage === 'evaluate') return errorResponse(new EvaluationError('package'), request, origins);
      return errorResponse(error, request, origins);
    }
  };
}
