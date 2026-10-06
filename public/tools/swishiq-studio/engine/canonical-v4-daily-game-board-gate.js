import { resolveCanonicalV4SiteConsumerSourcePolicy } from './canonical-v4-site-consumer-policy.js?v=20261002e&rev=canonical-v4-site-consumer-policy-v2-dependency-cache-closure';
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } from './canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import {
  findSwishIqV4DailyGamePin,
  SwishIqDailyGameV4Error,
} from './swishiq-daily-game-v4-contract.js?v=20261001g&rev=daily-v4-name-identity-cache-closure-v1';

export const CANONICAL_V4_DAILY_GAME_BOARD_PIN_FORMAT = 'djhc-swishiq-v4-daily-game-board-pin-v1';
export const CANONICAL_V4_DAILY_GAME_BOARD_PIN_VERSION = 'swishiq-v4-daily-game-board-pin-v1';

/**
 * Return the one reviewed V4 daily release pin used by the browser client and
 * result-share producer. A missing common pin is tolerated only for an
 * explicitly pre-cutover request; V4 selection and missing per-date board
 * pins remain typed unavailable and never fall back to V3.
 */
export function resolveCanonicalV4DailyGameReleasePin({
  releasePin = undefined,
  gameKind,
  dailySeed,
  allowUnconfigured = false,
} = {}) {
  const selectedPin = releasePin === undefined || releasePin === null
    ? CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN
    : releasePin;
  if (selectedPin?.status === 'unconfigured' && allowUnconfigured === true) return null;
  try {
    findSwishIqV4DailyGamePin(selectedPin, { gameKind, dailySeed });
  } catch (error) {
    if (error instanceof SwishIqDailyGameV4Error) throw error;
    throw new SwishIqDailyGameV4Error(
      'v4-daily-release-pin-invalid',
      'The reviewed V4 daily release pin could not be validated.',
    );
  }
  return selectedPin;
}

/**
 * Resolve whether the daily route has a separate immutable V4 board pin. The
 * current daily JSON files are V3/provider-ref contracts; they are never
 * accepted as V4 boards or silently reused after V4 is selected.
 */
export function canonicalV4DailyGameBoardAvailability({
  gameKind,
  dailySeed,
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  search = globalThis.location?.search || '',
} = {}) {
  const policy = resolveCanonicalV4SiteConsumerSourcePolicy({
    releasePin,
    consumerId: gameKind === 'fix-the-five' ? 'fix-the-five-daily-game-client' : 'draft-night-daily-game-client',
  });
  const requested = new URLSearchParams(search).get('source');
  const v4Required = policy.v4Required || requested === 'v4';
  if (!v4Required) return Object.freeze({
    available: false,
    v4Required: false,
    sourceMode: policy.sourceMode,
    reason: policy.reason,
  });
  if (!['draft-night', 'fix-the-five'].includes(gameKind)
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(dailySeed || ''))) {
    return Object.freeze({ available: false, v4Required: true, code: 'v4-daily-board-request-invalid', reason: 'The V4 daily board request needs a supported game and exact date.' });
  }
  const boardPins = Array.isArray(releasePin?.dailyGamePins) ? releasePin.dailyGamePins : [];
  const boardPin = boardPins.find(pin => pin?.gameKind === gameKind && pin?.dailySeed === dailySeed);
  if (!boardPin) return Object.freeze({
    available: false,
    v4Required: true,
    code: 'v4-daily-board-pin-unavailable',
    reason: 'No reviewed V4 board hash pin exists for this game and date. The V3 daily board was not loaded.',
  });
  return Object.freeze({
    available: false,
    v4Required: true,
    code: 'v4-daily-evaluator-unavailable',
    reason: 'V4 source is selected, but this route does not yet have a name-key board and evaluator adapter. No V3 board was loaded.',
    boardPin,
  });
}
