import { validateFranchiseBrowserSession } from '../lib/franchise-browser-session-v1.mjs';
import { advanceLeagueWindow } from '../lib/season-simulation-v1.mjs';
import { deriveFranchiseSeasonScheduleReceiptV1, verifyFranchiseSeasonCompletionV1 } from '../lib/franchise-season-completion-v1.mjs';

export const FRANCHISE_SEASON_END_HANDOFF_FORMAT = 'djhc-franchise-season-end-handoff-v1';
export const FRANCHISE_SEASON_END_HANDOFF_VERSION = '1.0.0';

const clone = value => structuredClone(value);
const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function sha256Hex(value, cryptoProvider) {
  requireValue(cryptoProvider?.subtle && typeof cryptoProvider.subtle.digest === 'function',
    'Web Crypto SHA-256 is required to validate the regular-season handoff receipt.');
  const bytes = await cryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function currentCompletion(session, scheduleReceipt, cryptoProvider) {
  const rebuiltScheduleReceipt = await deriveFranchiseSeasonScheduleReceiptV1({
    schedule: session.schedule,
    teams: session.leagueState.teams,
    seasonStartYear: session.leagueState.seasonStartYear,
    expectedGamesByTeam: scheduleReceipt?.expectedGamesByTeam,
    scenarioMetadata: scheduleReceipt?.scenarioMetadata,
    cryptoProvider,
  });
  requireValue(canonicalJson(rebuiltScheduleReceipt) === canonicalJson(scheduleReceipt),
    'The private schedule receipt does not match the exact current franchise schedule and teams.');
  return verifyFranchiseSeasonCompletionV1({
    receipt: rebuiltScheduleReceipt,
    completedGames: session.leagueState.completedGames ?? [],
    seasonStartYear: session.leagueState.seasonStartYear,
    cryptoProvider,
  });
}

/** Advance only the transaction window after a fresh, exact schedule receipt.
 * This does not run postseason, simulate a game, or advance the season year. */
export async function closeFranchiseRegularSeasonV1({
  session,
  expectedRevision,
  completionSessionRevision,
  completionReceipt,
  scheduleReceipt,
  cryptoProvider = globalThis.crypto,
} = {}) {
  validateFranchiseBrowserSession(session);
  requireValue(expectedRevision === session.revision, 'Stale franchise session revision.');
  requireValue(completionSessionRevision === session.revision, 'The season-completion receipt belongs to a stale franchise session revision.');
  requireValue(session.leagueState.transactionWindow === 'games', 'Regular-season closeout requires the games transaction window.');
  requireValue(Array.isArray(session.schedule) && session.schedule.length > 0
    && session.scheduleCursor === session.schedule.length,
  'The canonical regular-season schedule must be exhausted before closeout.');

  const freshCompletion = await currentCompletion(session, scheduleReceipt, cryptoProvider);
  requireValue(canonicalJson(completionReceipt) === canonicalJson(freshCompletion),
    'The supplied completion receipt is stale, incomplete, or does not match the current schedule and ledger.');

  // advanceLeagueWindow enforces the single games -> season-end step and
  // rejects unresolved restricted offer sheets. It does not call a simulator.
  const nextState = advanceLeagueWindow(session.leagueState, 'season-end');
  const next = clone(session);
  next.revision += 1;
  next.leagueState = nextState;

  const unsignedReceipt = {
    format: FRANCHISE_SEASON_END_HANDOFF_FORMAT,
    version: FRANCHISE_SEASON_END_HANDOFF_VERSION,
    previewFeatureFlag: 'seasonEndTransitionV1',
    classification: 'development-scenario; not-certified',
    status: 'regular-season-closed',
    seasonStartYear: session.leagueState.seasonStartYear,
    stateMode: session.leagueState.mode,
    stateQuality: clone(session.leagueState.stateQuality ?? null),
    provisionalState: session.leagueState.stateQuality?.status !== 'reconciled',
    sourceReceipt: clone(session.sourceReceipt),
    modelReceipt: clone(session.modelReceipt),
    completionReceipt: clone(freshCompletion),
    priorSessionRevision: session.revision,
    sessionRevision: next.revision,
    priorLeagueStateRevision: session.leagueState.revision,
    leagueStateRevision: next.leagueState.revision,
    canonicalScheduleSha256: freshCompletion.canonicalScheduleSha256,
    scheduledGameCount: freshCompletion.scheduledGameCount,
    completedGameCount: freshCompletion.completedGameCount,
    postseasonSimulated: false,
    seasonAdvanced: false,
    disclosure: 'Records only the verified games-to-season-end LeagueState transition. It does not run postseason or advance the season year.',
  };
  const receipt = { ...unsignedReceipt, receiptSha256: await sha256Hex(canonicalJson(unsignedReceipt), cryptoProvider) };
  const yearKey = String(session.leagueState.seasonStartYear);
  next.leagueState.franchiseLifecycleReceiptsBySeason = {
    ...(plain(next.leagueState.franchiseLifecycleReceiptsBySeason)
      ? next.leagueState.franchiseLifecycleReceiptsBySeason : {}),
    [yearKey]: receipt,
  };
  next.actionHistory.push({ revision: next.revision, kind: 'close-regular-season',
    seasonStartYear: session.leagueState.seasonStartYear, handoffReceiptSha256: receipt.receiptSha256,
    canonicalScheduleSha256: freshCompletion.canonicalScheduleSha256 });

  validateFranchiseBrowserSession(next);
  const verified = await validateFranchiseSeasonEndHandoffV1({ session: next, scheduleReceipt, cryptoProvider });
  requireValue(verified.status === 'pass', 'The new season-end handoff receipt did not validate.');
  return { status: 'regular-season-closed', session: next, handoffReceipt: clone(receipt), completion: clone(freshCompletion) };
}

/** Recompute the completion receipt and validate the versioned state handoff.
 * Called before saved/loaded sessions are accepted by the browser worker. */
export async function validateFranchiseSeasonEndHandoffV1({
  session,
  scheduleReceipt,
  cryptoProvider = globalThis.crypto,
} = {}) {
  validateFranchiseBrowserSession(session);
  const year = session.leagueState.seasonStartYear;
  const yearKey = String(year);
  const receiptsBySeason = session.leagueState.franchiseLifecycleReceiptsBySeason;
  requireValue(receiptsBySeason === undefined || plain(receiptsBySeason),
    'Saved franchise lifecycle receipts must be a plain record.');
  const savedReceipt = receiptsBySeason?.[yearKey] ?? null;
  const closeActions = session.actionHistory.filter(row => row.kind === 'close-regular-season' && row.seasonStartYear === year);

  if (session.leagueState.transactionWindow !== 'season-end') {
    requireValue(savedReceipt === null && closeActions.length === 0,
      'The saved franchise session rolled back a completed regular-season handoff.');
    return { status: 'not-closed', seasonStartYear: year };
  }

  requireValue(savedReceipt, 'A season-end session requires a regular-season handoff receipt.');
  requireValue(closeActions.length === 1, 'A season-end session requires exactly one closeout action for the current season.');
  requireValue(session.scheduleCursor === session.schedule.length && session.schedule.length > 0,
    'A season-end session must retain its exhausted regular-season schedule.');
  const completion = await currentCompletion(session, scheduleReceipt, cryptoProvider);
  requireValue(savedReceipt.format === FRANCHISE_SEASON_END_HANDOFF_FORMAT
    && savedReceipt.version === FRANCHISE_SEASON_END_HANDOFF_VERSION
    && savedReceipt.previewFeatureFlag === 'seasonEndTransitionV1'
    && savedReceipt.classification === 'development-scenario; not-certified'
    && savedReceipt.status === 'regular-season-closed'
    && savedReceipt.seasonStartYear === year
    && savedReceipt.stateMode === session.leagueState.mode
    && canonicalJson(savedReceipt.stateQuality) === canonicalJson(session.leagueState.stateQuality ?? null)
    && savedReceipt.provisionalState === (session.leagueState.stateQuality?.status !== 'reconciled')
    && canonicalJson(savedReceipt.sourceReceipt) === canonicalJson(session.sourceReceipt)
    && canonicalJson(savedReceipt.modelReceipt) === canonicalJson(session.modelReceipt)
    && canonicalJson(savedReceipt.completionReceipt) === canonicalJson(completion)
    && savedReceipt.canonicalScheduleSha256 === completion.canonicalScheduleSha256
    && savedReceipt.scheduledGameCount === completion.scheduledGameCount
    && savedReceipt.completedGameCount === completion.completedGameCount
    && savedReceipt.postseasonSimulated === false
    && savedReceipt.seasonAdvanced === false
    && savedReceipt.disclosure === 'Records only the verified games-to-season-end LeagueState transition. It does not run postseason or advance the season year.',
  'The season-end handoff receipt does not match the current pins and recomputed completion receipt.');
  requireValue(Number.isInteger(savedReceipt.priorSessionRevision) && savedReceipt.sessionRevision === savedReceipt.priorSessionRevision + 1
    && savedReceipt.sessionRevision <= session.revision
    && Number.isInteger(savedReceipt.priorLeagueStateRevision)
    && savedReceipt.leagueStateRevision === savedReceipt.priorLeagueStateRevision + 1
    && savedReceipt.leagueStateRevision <= session.leagueState.revision,
  'The season-end handoff receipt has inconsistent session or LeagueState revisions.');

  const { receiptSha256, ...unsignedReceipt } = savedReceipt;
  requireValue(/^[a-f0-9]{64}$/.test(receiptSha256 ?? '')
    && await sha256Hex(canonicalJson(unsignedReceipt), cryptoProvider) === receiptSha256,
  'The season-end handoff receipt SHA-256 is invalid.');
  const [closeAction] = closeActions;
  requireValue(closeAction.revision === savedReceipt.sessionRevision
    && closeAction.handoffReceiptSha256 === receiptSha256
    && closeAction.canonicalScheduleSha256 === completion.canonicalScheduleSha256,
  'The season-end action history does not bind the handoff receipt.');
  return { status: 'pass', seasonStartYear: year, sessionRevision: savedReceipt.sessionRevision,
    leagueStateRevision: savedReceipt.leagueStateRevision, completion };
}
