import { createFranchiseExecutionInputPinsV1 } from './franchise-execution-input-pins-v1.mjs';
import { stableStringifyV1 } from '../lib/sha256-isomorphic-v1.mjs';

export const FRANCHISE_GAME_INPUT_BUNDLE_FORMAT = 'djhc-franchise-game-input-bundle-v1';
export const FRANCHISE_GAME_INPUT_BUNDLE_VERSION = '1.0.0';
export const FRANCHISE_GAME_INPUT_BUNDLE_FILE_FORMAT = 'djhc-franchise-game-input-bundle-file-v1';

const clone = value => structuredClone(value);
const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

/** Build a revision-bound receipt for exactly the active schedule and pins. */
export async function createFranchiseGameInputBundleReceiptV1({ session, expectedRevision,
  gameInputs, cbaProfile = null } = {}) {
  requireValue(plain(session) && Number.isSafeInteger(session.revision)
    && Number.isSafeInteger(expectedRevision) && expectedRevision === session.revision,
  'Prepared inputs require the current franchise session revision.');
  requireValue(plain(session.leagueState) && Number.isSafeInteger(session.leagueState.revision)
    && Number.isInteger(session.leagueState.seasonStartYear),
  'Prepared inputs require the current LeagueState revision and season.');
  requireValue(plain(session.sourceReceipt) && plain(session.modelReceipt),
    'Prepared inputs require the active source and model receipts.');
  requireValue(Array.isArray(session.schedule) && session.schedule.length > 0,
    'Prepared inputs require the active schedule.');
  requireValue(plain(gameInputs), 'Prepared game inputs must be a plain object.');

  const scheduledIds = new Set(session.schedule.map(game => game.gameId));
  const suppliedIds = Object.keys(gameInputs);
  requireValue(suppliedIds.length === scheduledIds.size
    && suppliedIds.every(gameId => scheduledIds.has(gameId)),
  'Prepared input coverage must match the active schedule exactly.');

  const executionInputPins = await createFranchiseExecutionInputPinsV1({
    cbaProfile: cbaProfile === null ? null : clone(cbaProfile),
    schedule: session.schedule,
    gameInputs,
  });
  return {
    format: FRANCHISE_GAME_INPUT_BUNDLE_FORMAT,
    version: FRANCHISE_GAME_INPUT_BUNDLE_VERSION,
    status: 'prepared',
    sessionRevision: session.revision,
    leagueStateRevision: session.leagueState.revision,
    seasonStartYear: session.leagueState.seasonStartYear,
    sourceReceipt: clone(session.sourceReceipt),
    modelReceipt: clone(session.modelReceipt),
    scheduleSha256: executionInputPins.schedule.sha256,
    scheduleGameCount: executionInputPins.schedule.gameCount,
    gameInputsSha256: executionInputPins.gameInputs.sha256,
    executionInputPins,
  };
}

export function assertFranchiseGameInputBundleReceiptV1(actual, expected) {
  requireValue(plain(actual) && stableStringifyV1(actual) === stableStringifyV1(expected),
    'Prepared input receipt is stale or does not match the active session, season, source/model pins, schedule, and input data.');
  return clone(actual);
}
