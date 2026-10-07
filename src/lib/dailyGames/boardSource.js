/**
 * Buyer-safe SwishIQ daily-game boundary. Board loading and result reveals are
 * delegated to the reviewed site module /tools/swishiq-daily-game-client.js
 * (v=20261001g, V5 name-identity revision) through the studio's
 * integrity-checked transport, and the canonical V4 runtime adapter supplies
 * the reviewed release pin. The reviewed V4 source gate therefore decides which
 * boards load — exactly like the live site: V3 boards are blocked the moment a
 * reviewed V4 release pin is supplied, and each pinned V4 board is
 * byte-hash-validated against its immutable release pin. Evaluation relays
 * through the app backend on hosted previews or calls the site evaluator
 * directly same-origin on the standalone build.
 */
import { loadNativeModule } from '@/components/native/nativeModules';
import { originalFetch } from '@/components/native/nativeTransport';
import { STANDALONE, SITE_ORIGIN } from '@/lib/deployConfig';

export const SWISHIQ_DAILY_GAME_KINDS = Object.freeze(['fix-the-five', 'draft-night']);
export const SWISHIQ_DAILY_GAME_FAMILY = 'team-season';

const NATIVE_DAILY_CLIENT_URL = '/tools/swishiq-daily-game-client.js?v=20261001g&rev=swishiq-daily-game-v5-name-identity-cache-closure-v1';
const NATIVE_RUNTIME_ADAPTER_URL = 'engine/canonical-v4-studio-runtime-adapter.js';
const SWISHIQ_PUBLIC_REGISTRY_PATH = '/tools/swishiq-studio/data/registry.json';
const SWISHIQ_PUBLIC_BOARD_ROOT = '/tools/swishiq-studio/data/boards/';

// The site's own public function config (backend-config.js) — the evaluator is
// the site's published edge function and its publishable key is public.
const SITE_EVALUATOR_URL = 'https://gkqdymnmczabcggvigce.supabase.co/functions/v1/swishiq-game-evaluate';
const SITE_EVALUATOR_KEY = 'sb_publishable_BHrJWQtop2ovkpOMOd9w3A_-9MTaeGG';

let clientPromise = null;
let releasePinPromise = null;
// The pages reveal against the validated native board; view boards (adapted V4
// shapes) map back to the board object the reviewed client itself validated.
const viewNativeBoards = new WeakMap();

function fail(message) {
  throw new Error(message);
}

function reviewedDailyClient() {
  if (!clientPromise) clientPromise = loadNativeModule(NATIVE_DAILY_CLIENT_URL);
  return clientPromise;
}

async function reviewedReleasePin() {
  if (!releasePinPromise) {
    releasePinPromise = (async () => {
      const adapter = await loadNativeModule(NATIVE_RUNTIME_ADAPTER_URL);
      return adapter.CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN || null;
    })();
  }
  return releasePinPromise;
}

/** V4 rows carry name keys, not V3 playerRefs; the view aliases the key so the
 * shared daily-game UI (picks, saved runs, shared links) keeps working. */
const viewPlayerRow = row => ({ ...row, playerRef: row.normalizedPlayerNameKey ?? row.playerRef });

export function isSwishIQDailyBoardV4(board) {
  return Boolean(board && typeof board === 'object' && board.format === 'djhc-swishiq-static-daily-board-v4');
}

function adaptBoardForView(board) {
  if (!isSwishIQDailyBoardV4(board)) return board;
  const view = { ...board, family: SWISHIQ_DAILY_GAME_FAMILY };
  if (board.gameKind === 'fix-the-five') {
    view.challenges = (Array.isArray(board.challenges) ? board.challenges : []).map(record => ({
      ...record,
      lineup: (Array.isArray(record.lineup) ? record.lineup : []).map(viewPlayerRow),
      removePlayerRef: record.removeNormalizedPlayerNameKey || '',
      candidates: (Array.isArray(record.candidates) ? record.candidates : []).map(viewPlayerRow),
    }));
    return view;
  }
  const container = Array.isArray(board.deck) ? {} : (board.deck || {});
  const rounds = Array.isArray(board.deck) ? board.deck : Array.isArray(board.deck?.rounds) ? board.deck.rounds : [];
  view.deck = { ...container, rounds: rounds.map(round => ({
    ...round,
    candidates: (Array.isArray(round.candidates) ? round.candidates : []).map(viewPlayerRow),
  })) };
  return view;
}

export async function loadSwishIQDailyBoard({ gameKind, dailySeed, family = '', sourceMode = 'auto' } = {}) {
  if (!SWISHIQ_DAILY_GAME_KINDS.includes(gameKind)) fail('Choose a supported SwishIQ daily game.');
  const client = await reviewedDailyClient();
  const releasePin = await reviewedReleasePin().catch(() => null);
  const native = await client.loadSwishIQDailyBoard({
    gameKind,
    dailySeed,
    family,
    sourceMode,
    releasePin,
    registryUrl: SWISHIQ_PUBLIC_REGISTRY_PATH,
    boardRootUrl: SWISHIQ_PUBLIC_BOARD_ROOT,
    fetcher: originalFetch,
  });
  const view = adaptBoardForView(native);
  if (view !== native) viewNativeBoards.set(view, native);
  return view;
}

async function evaluatorInvoke(_functionName, request) {
  if (STANDALONE) {
    let response;
    try {
      response = await fetch(SITE_EVALUATOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SITE_EVALUATOR_KEY}` },
        body: JSON.stringify(request),
        cache: 'no-store',
      });
    } catch {
      fail(swishIQDailyGameEvaluatorUnavailableMessage());
    }
    if (!response.ok) fail(swishIQDailyGameEvaluatorUnavailableMessage());
    return response.json();
  }
  const { base44 } = await import('@/api/base44Client');
  const response = await base44.functions.invoke('swishiqGameEvaluate', { request });
  const data = response?.data;
  if (data?.error && /not configured/i.test(String(data.error))) {
    fail(swishIQDailyGameEvaluatorUnavailableMessage() + ' ' + data.error);
  }
  if (data?.error) {
    const error = new Error(data.error);
    error.status = 502;
    throw error;
  }
  return data;
}

function adaptV4Outcome(response) {
  if (response?.status === 'unavailable') {
    fail(`V4 daily result is unavailable (${response.reason || 'unavailable'}). No substitute score was used.`);
  }
  if (response?.status !== 'complete' || !response.evaluation) {
    fail('V4 daily result is invalid. No substitute score was used.');
  }
  return {
    format: response.format,
    contractVersion: response.contractVersion,
    action: response.action,
    status: response.status,
    runId: response.runId,
    evaluation: response.evaluation,
    resultPassport: null,
  };
}

export async function revealSwishIQDailyGame({ board, challengeId = '', playerRef = '', picks = [] } = {}) {
  const client = await reviewedDailyClient();
  if (client.isSwishIQDailyBoardV4(board)) {
    const native = viewNativeBoards.get(board);
    if (!native) fail('Reload this board before requesting a result.');
    const releasePin = await reviewedReleasePin();
    const response = await client.revealSwishIQDailyGameV4({
      board: native,
      releasePin,
      scenarioId: challengeId,
      normalizedPlayerNameKey: playerRef,
      picks: (Array.isArray(picks) ? picks : []).map(pick => ({
        roundId: pick?.roundId || '',
        normalizedPlayerNameKey: pick?.playerRef || '',
      })),
      invoke: evaluatorInvoke,
    });
    return adaptV4Outcome(response);
  }
  return client.revealSwishIQDailyGame({ board, challengeId, playerRef, picks, invoke: evaluatorInvoke });
}

export function swishIQDailyGameUnavailableMessage() {
  return 'This exact SwishIQ board is not published yet. No older season, pooled package, or substitute score is used.';
}

export function swishIQDailyGameEvaluatorUnavailableMessage() {
  return 'This exact SwishIQ board is published, but its private result evaluator is not available yet. No substitute score is used.';
}

export function swishIQDailyGameErrorKind(error) {
  const message = String(error?.message || '').trim();
  const status = Number(error?.status || error?.context?.status || error?.response?.status);
  const code = String(error?.code || '');
  if (code === 'v4-daily-evaluator-unavailable') return 'evaluator-unavailable';
  if (/^v4-daily-/.test(code) || /^V4 daily content is unavailable/.test(message)) return 'board-unavailable';
  if (message === swishIQDailyGameUnavailableMessage()) return 'board-unavailable';
  if (status === 503 || message === 'Backend is not configured.'
    || /^daily game evaluation is unavailable\.?$/i.test(message)
    || message.startsWith(swishIQDailyGameEvaluatorUnavailableMessage())
    || /private result evaluator|swishiq-game-evaluate.*(?:not found|not deployed|unavailable)|failed to send a request to the edge function/i.test(message)) {
    return 'evaluator-unavailable';
  }
  if (/registry|projection|package|board|hash|integrity|legal choice|selection|date|season/i.test(message)) {
    return 'board-invalid';
  }
  return 'verification-error';
}

// The two game pages share one reveal-failure notice: an evaluator outage and
// an unavailable result both refuse to invent a substitute score.
export function revealNoticeFor(error) {
  return swishIQDailyGameErrorKind(error) === 'evaluator-unavailable'
    ? 'The exact-season evaluator is unavailable; no Game Points or substitute score was used.'
    : 'This board result is unavailable. No substitute score was used.';
}

export const gamePointsForOutcome = outcome => {
  const points = outcome?.resultPassport?.gamePoints;
  if (!points) return { total: 0, max: 0 };
  return { total: points.total, max: points.max, placement: points.placement, validChoice: points.validChoice };
};

// Date helpers the game pages and board controls share (unchanged semantics).
export function normalizeDailySeed(value) {
  const seed = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(seed) || Number.isNaN(Date.parse(`${seed}T12:00:00.000Z`))
    || new Date(`${seed}T12:00:00.000Z`).toISOString().slice(0, 10) !== seed) {
    fail('Daily date is invalid.');
  }
  return seed;
}

export function normalizeOptionalDailySeed(value) {
  if (value == null || value === '') return '';
  return normalizeDailySeed(value);
}

export function chicagoDailySeed(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function dailySeedFromPageSearch(search = '', date = new Date()) {
  const query = new URLSearchParams(typeof search === 'string' ? search : '');
  const supplied = query.get('seed');
  if (supplied === null || !supplied.trim()) return chicagoDailySeed(date);
  try {
    return normalizeDailySeed(supplied);
  } catch {
    return chicagoDailySeed(date);
  }
}

export function normalizeGameFamily(value) {
  if (value === undefined || value === null || value === '') return '';
  const family = String(value).trim().toLowerCase();
  if (!/^[a-z][a-z-]{2,39}$/.test(family) || family.length > 40) fail('Game family is invalid.');
  if (family !== SWISHIQ_DAILY_GAME_FAMILY) fail('Only exact team-season boards are supported.');
  return family;
}