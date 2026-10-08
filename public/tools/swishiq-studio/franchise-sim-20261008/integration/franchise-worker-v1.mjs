import { createFranchiseBrowserSession, validateFranchiseBrowserSession, advanceFranchiseBrowserGame,
  setFranchiseBrowserRotation, executeFranchiseBrowserTransaction, evaluateFranchiseBrowserTransaction,
} from '../lib/franchise-browser-session-v1.mjs';
import { serializeFranchiseBrowserCheckpoint, restoreFranchiseBrowserCheckpoint,
  restoreFranchiseBrowserCheckpointObject } from '../lib/franchise-browser-checkpoint-codec-v1.mjs';
import { simulateGameLiveSeasonSample } from '../lib/live-game-simulator-v1.mjs';
import { createCbaTradeRuleEngine } from '../lib/cba-trade-rule-engine-v1.mjs';
import { createSharedEventCalibrationCacheV1 } from '../lib/shared-event-calibration-cache-v1.mjs';
import { createFranchiseExecutionInputPinsV1 } from './franchise-execution-input-pins-v1.mjs';
import { deriveFranchiseSeasonScheduleReceiptV1, verifyFranchiseSeasonCompletionV1 } from '../lib/franchise-season-completion-v1.mjs';

const clone = value => structuredClone(value);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const optionsAllowed = new Set(['playerEventMapping', 'playerReboundOwnership', 'playerReboundSplit',
  'playerFoulUnknownRatePer36', 'playerFoulMatchupSplit']);
async function digest(text) {
  const value = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function executedId(gameModel, production, options) {
  return `${gameModel.modelId}+${production.modelId}${options.playerEventMapping !== 'legacy-neutral-v1' ? `+${options.playerEventMapping}` : ''}` +
    (options.playerReboundOwnership === 'player-rebound-budget-v1' ? '+player-rebound-budget-v1' : '') +
    (options.playerReboundSplit === 'prior-count-rebound-split-v1' ? '+prior-count-rebound-split-v1' : '');
}

/** Pure message controller also exercised under Node; worker globals are not
 * used by the controller. Only the owner worker installs a message listener. */
export function createFranchiseWorkerController() {
  let session = null, gameModel = null, production = null, inputs = null, verifiedReceipt = null,
    eventOptions = null, ruleEngine = null, currentCbaProfile = null, seasonScheduleReceipt = null;
  const cache = createSharedEventCalibrationCacheV1({ maxEntries: 512 });
  return async function dispatch(type, payload = {}) {
    if (type === 'initialize') {
      assert(typeof payload.gameModelText === 'string' && typeof payload.productionCandidateText === 'string', 'Initialization requires original model artifact JSON text.');
      const nextModel = JSON.parse(payload.gameModelText), nextProduction = JSON.parse(payload.productionCandidateText);
      assert(nextModel?.modelId && nextModel.marginModel && nextModel.totalModel, 'Unsupported game-model artifact.');
      assert(nextProduction?.format === 'djhc-shared-player-production-candidate-v1' && nextProduction.version === '1.0.0-development' &&
        nextProduction.status === 'isolated-development-candidate; joint-game-selection-pending', 'Unsupported player-production artifact.');
      assert(payload.gameInputs && typeof payload.gameInputs === 'object' && !Array.isArray(payload.gameInputs), 'Prepared, names-first game inputs are required.');
      const options = { playerEventMapping: 'rate-linked-recovery-possession-v3',
        playerReboundOwnership: 'player-rebound-budget-v1', ...clone(payload.eventOptions ?? {}) };
      assert(Object.keys(options).every(key => optionsAllowed.has(key)), 'Unsupported event option in the browser contract.');
      assert(options.playerReboundOwnership === 'player-rebound-budget-v1', 'Unsupported rebound ownership option.');
      assert(options.playerReboundSplit === undefined || options.playerReboundSplit === 'prior-count-rebound-split-v1', 'Unsupported rebound split option.');
      // The experimental V4 foul interaction has a separate review/candidate
      // path; it is not silently selected for the first site version.
      assert(options.playerEventMapping === 'rate-linked-recovery-possession-v3', 'First-site candidate requires the pinned V3 rate-linked event mapping.');
      assert(options.playerFoulMatchupSplit === undefined && options.playerFoulUnknownRatePer36 === undefined,
        'Foul-aware experimental options are outside this release candidate.');
      const setupState = payload.sessionInput?.leagueState ?? payload.session?.leagueState;
      const setupSchedule = payload.sessionInput?.schedule ?? payload.session?.schedule;
      assert(setupState && Array.isArray(setupSchedule), 'Initialization requires the current state and prepared schedule.');
      const [contentSha256, productionContentSha256, executionInputPins] = await Promise.all([
        digest(payload.gameModelText), digest(payload.productionCandidateText),
        createFranchiseExecutionInputPinsV1({ cbaProfile: payload.cbaProfile ?? null,
          schedule: setupSchedule.map(game => ({ ...game, seasonStartYear: game.seasonStartYear ?? setupState.seasonStartYear })),
          gameInputs: payload.gameInputs }),
      ]);
      const receipt = { modelId: nextModel.modelId, contentSha256, productionModelId: nextProduction.modelId,
        productionContentSha256, eventOptions: options, executedModelId: executedId(nextModel, nextProduction, options),
        executionInputPins, status: 'isolated-development-candidate-not-certified' };
      const expectedSourceReceipt = payload.expectedSourceReceipt ?? payload.sessionInput?.sourceReceipt;
      assert(expectedSourceReceipt, 'Initialization requires the current source receipt, including when loading a save.');
      const nextSession = payload.session ? clone(payload.session) : createFranchiseBrowserSession({ ...payload.sessionInput, modelReceipt: receipt });
      validateFranchiseBrowserSession(nextSession, { expectedModelReceipt: receipt,
        expectedSourceReceipt });
      const restoredPins = await createFranchiseExecutionInputPinsV1({ cbaProfile: payload.cbaProfile ?? null,
        schedule: nextSession.schedule, gameInputs: payload.gameInputs });
      assert(JSON.stringify(restoredPins) === JSON.stringify(executionInputPins), 'Saved schedule differs from the prepared execution input pin.');
      for (const game of nextSession.schedule) assert(payload.gameInputs[game.gameId], `Missing prepared input for ${game.gameId}.`);
      // A ready franchise must be saveable before its first game. Strict JSON
      // validation catches undefined provenance fields that structuredClone
      // would preserve but a later portable or IndexedDB checkpoint rejects.
      serializeFranchiseBrowserCheckpoint(nextSession);
      const nextSeasonScheduleReceipt = await deriveFranchiseSeasonScheduleReceiptV1({
        schedule: nextSession.schedule, teams: nextSession.leagueState.teams,
        seasonStartYear: nextSession.leagueState.seasonStartYear,
        scenarioMetadata: { sourceClass: 'user-scenario', label: 'Isolated franchise simulation schedule',
          sourceRef: expectedSourceReceipt.packageId },
      });
      const nextRuleEngine = payload.cbaProfile ? createCbaTradeRuleEngine({ profile: clone(payload.cbaProfile), allowScenarioProvenance: true }) : null;
      // Commit initialization only after the entire replacement is verified.
      session = nextSession; gameModel = nextModel; production = nextProduction;
      inputs = clone(payload.gameInputs); verifiedReceipt = receipt; eventOptions = options;
      ruleEngine = nextRuleEngine; currentCbaProfile = clone(payload.cbaProfile ?? null);
      seasonScheduleReceipt = nextSeasonScheduleReceipt;
      return { status: 'initialized', session: clone(session), capabilities: {
        nextGame: true, nextUserGame: true, rotation: true, saves: true, transactions: true, seasonCompletion: true,
        multiSeason: false, freeAgencyMarket: false, draft: false, livePlayback: false,
        realizationCountPerAdvance: 1, browserWorker: true,
        disclosure: 'One realized player-driven game per advance. Unknown availability is a scenario assumption. Contract legality is conditional on resolved rules and state; provisional moves require Provisional Sandbox.' } };
    }
    assert(session, 'Initialize the franchise worker first.');
    if (type === 'snapshot') return { status: 'snapshot', session: clone(session) };
    if (type === 'verify-season-completion') {
      assert(payload.expectedRevision === session.revision, 'Stale franchise session revision.');
      validateFranchiseBrowserSession(session);
      const completion = await verifyFranchiseSeasonCompletionV1({ receipt: seasonScheduleReceipt,
        completedGames: session.leagueState.completedGames ?? [] });
      return { status: 'season-games-complete', completion, session: clone(session) };
    }
    if (type === 'export') return { status: 'exported', saveText: serializeFranchiseBrowserCheckpoint(session) };
    if (type === 'restore' || type === 'restore-session') {
      const restore = type === 'restore-session' ? restoreFranchiseBrowserCheckpointObject : restoreFranchiseBrowserCheckpoint;
      const next = restore(type === 'restore-session' ? payload.session : payload.saveText,
        { expectedSourceReceipt: session.sourceReceipt, expectedModelReceipt: verifiedReceipt });
      const restoredPins = await createFranchiseExecutionInputPinsV1({ cbaProfile: currentCbaProfile,
        schedule: next.schedule, gameInputs: inputs });
      assert(JSON.stringify(restoredPins) === JSON.stringify(verifiedReceipt.executionInputPins),
        'Restored schedule differs from the prepared execution input pin.');
      session = next;
      return { status: 'restored', session: clone(session) };
    }
    if (type === 'next-game' || type === 'next-user-game') {
      assert(payload.expectedRevision === session.revision, 'Stale franchise session revision.');
      if (session.scheduleCursor === session.schedule.length) {
        validateFranchiseBrowserSession(session);
        const completion = await verifyFranchiseSeasonCompletionV1({ receipt: seasonScheduleReceipt,
          completedGames: session.leagueState.completedGames ?? [] });
        return { status: 'season-games-complete', completion, session: clone(session) };
      }
      const simulate = (model, input, options) => simulateGameLiveSeasonSample(model, input, {
        ...eventOptions, ...options, playerProductionCandidate: production, playerEventCalibrationCache: cache,
      });
      Object.defineProperty(simulate, 'supportedScenarioControls', { value: simulateGameLiveSeasonSample.supportedScenarioControls });
      const advance = current => advanceFranchiseBrowserGame(current, { expectedRevision: current.revision,
        gameModel, loadedModelReceipt: verifiedReceipt, simulateGameFn: simulate,
        gameInputForState: scheduled => ({ ...clone(inputs[scheduled.gameId]), seasonStartYear: scheduled.seasonStartYear,
          gameLocalDate: scheduled.gameLocalDate, date: scheduled.gameLocalDate }),
      });
      if (type === 'next-game') {
        const result = advance(session);
        session = result.session;
        return clone(result);
      }
      const userTeams = new Set(session.leagueState.userControlledTeamCodes);
      assert(userTeams.size === 1, 'Next-user-game requires exactly one user-controlled team.');
      const remaining = session.schedule.slice(session.scheduleCursor);
      assert(remaining.length, 'The regular-season schedule is complete.');
      const target = remaining.findIndex(game => userTeams.has(game.homeTeamCode) || userTeams.has(game.awayTeamCode));
      const count = target < 0 ? remaining.length : target + 1;
      // A long schedule gap can be advanced with the single-game command. The
      // bound avoids one uninterruptible browser request running a whole year.
      assert(count <= 200, 'More than 200 league games precede the next user checkpoint; advance individual games first.');
      let working = session, result;
      const advancedGames = [];
      for (let index = 0; index < count; index += 1) {
        result = advance(working);
        working = result.session;
        const completed = working.leagueState.completedGames.at(-1);
        advancedGames.push({ gameId: completed.gameId, gameLocalDate: completed.gameLocalDate,
          homeTeamCode: completed.homeTeamCode, awayTeamCode: completed.awayTeamCode,
          homeScore: completed.homeScore, awayScore: completed.awayScore });
      }
      // Commit the full checkpoint only after every intervening CPU game and
      // the target game passes; later failure cannot hide a partial advance.
      session = working;
      return clone({ ...result, session, gamesAdvanced: count, advancedGames,
        checkpointKind: target < 0 ? 'remaining-league-schedule' : 'next-user-game',
        atomicCheckpoint: true });
    }
    if (type === 'rotation') {
      const result = setFranchiseBrowserRotation(session, payload);
      session = result.session;
      return clone(result);
    }
    if (type === 'evaluate-transaction') return { status: 'evaluated', evaluation: evaluateFranchiseBrowserTransaction(session, payload.proposal, { ruleEngine }) };
    if (type === 'execute-transaction') {
      const result = executeFranchiseBrowserTransaction(session, payload.proposal, {
        expectedRevision: payload.expectedRevision, userApproved: payload.userApproved === true, ruleEngine,
        allowProvisionalSandbox: payload.allowProvisionalSandbox === true,
      });
      session = result.session;
      return clone(result);
    }
    throw new Error(`Unknown franchise worker command: ${type}`);
  };
}

if (typeof globalThis.WorkerGlobalScope !== 'undefined' && globalThis instanceof globalThis.WorkerGlobalScope) {
  const dispatch = createFranchiseWorkerController();
  let queue = Promise.resolve();
  globalThis.addEventListener('message', event => {
    const { id, type, payload } = event.data ?? {};
    queue = queue.then(async () => {
      try { globalThis.postMessage({ id, ok: true, result: await dispatch(type, payload) }); }
      catch (error) { globalThis.postMessage({ id, ok: false, error: { message: error.message,
        evaluation: error.evaluation ?? null, productionReview: error.productionReview ?? null,
        rosterPreparation: error.rosterPreparation ?? null } }); }
    });
  });
}
