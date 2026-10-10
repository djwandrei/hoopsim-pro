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
import { closeFranchiseRegularSeasonV1, validateFranchiseSeasonEndHandoffV1 } from './franchise-season-end-handoff-v1.mjs';
import * as franchiseOffseasonLifecycle from './franchise-offseason-lifecycle-v1.mjs';
import { createFranchiseOffseasonTransactionApprovalResolverV1 } from './franchise-offseason-transaction-approval-resolver-v1.mjs';
import { createFranchiseOffseasonPhaseExecutorMapV1 } from './franchise-offseason-phase-executor-map-v1.mjs';
import { completeFranchisePostseasonV1 } from './franchise-postseason-completion-v1.mjs';
import { finalizeFranchiseSeasonAwardsForClosedSessionV1 } from './franchise-season-awards-preview-v1.mjs';
import { assertFranchiseGameInputBundleReceiptV1, createFranchiseGameInputBundleReceiptV1 } from './franchise-game-input-bundle-v1.mjs';
import { sha256HexV1, stableStringifyV1 } from '../lib/sha256-isomorphic-v1.mjs';

const clone = value => structuredClone(value);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const digestSessionSync = value => sha256HexV1(stableStringifyV1(value));
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
export function createFranchiseWorkerController({ lifecycleImplementation = null } = {}) {
  let session = null, gameModel = null, production = null, inputs = null, verifiedReceipt = null,
    eventOptions = null, ruleEngine = null, currentCbaProfile = null, seasonScheduleReceipt = null,
    gameInputBundleReceipt = null, loadedArtifactPins = null, preparedPostseason = null;
  function activeLifecycleImplementation() {
    if (lifecycleImplementation !== franchiseOffseasonLifecycle) return lifecycleImplementation;
    const declared = franchiseOffseasonLifecycle.getFranchiseOffseasonLifecycleCapabilitiesV1();
    const phaseExecutors = ruleEngine ? createFranchiseOffseasonPhaseExecutorMapV1({ ruleEngine }) : null;
    return {
      ...franchiseOffseasonLifecycle,
      ...(phaseExecutors ? { phaseExecutors } : {}),
      getFranchiseOffseasonLifecycleCapabilitiesV1() {
        return {
          ...declared,
          phaseExecutors: Boolean(phaseExecutors),
          freeAgencyMarket: Boolean(phaseExecutors?.['free-agency']),
          tradeWindow: Boolean(phaseExecutors?.['trade-window']),
          // Draft execution is wired, but it is not advertised as ready until
          // the caller supplies a revision-current prepared order and prospects.
          draft: false,
        };
      },
    };
  }
  function postseasonInputPreparationAvailable() {
    if (!session || !gameModel || !verifiedReceipt) return false;
    const state = session.leagueState;
    const yearKey = String(state?.seasonStartYear ?? '');
    const closeout = state?.franchiseLifecycleReceiptsBySeason?.[yearKey];
    const awards = state?.awardHistoryBySeason?.[yearKey]?.finalizationReceipt;
    const awardActions = session.actionHistory.filter(row => row.kind === 'finalize-season-awards'
      && row.seasonStartYear === state.seasonStartYear);
    return state.transactionWindow === 'season-end' && session.scheduleCursor === session.schedule.length
      && closeout?.status === 'regular-season-closed' && closeout.seasonStartYear === state.seasonStartYear
      && closeout.completionReceipt && awards?.status === 'season-awards-finalized'
      && awards.seasonStartYear === state.seasonStartYear && Number.isSafeInteger(awards.awardsSeed)
      && awardActions.length === 1
      && stableStringifyV1(session.modelReceipt) === stableStringifyV1(verifiedReceipt)
      && !state.postseasonHistoryBySeason?.[yearKey]
      && !session.pendingOffseasonApproval;
  }
  const cache = createSharedEventCalibrationCacheV1({ maxEntries: 512 });
  function hasCurrentApprovalResolver() {
    return typeof lifecycleImplementation?.approvalResolver === 'function'
      || lifecycleImplementation === franchiseOffseasonLifecycle && Boolean(ruleEngine);
  }
  function currentApprovalResolver() {
    if (typeof lifecycleImplementation?.approvalResolver === 'function') {
      return lifecycleImplementation.approvalResolver;
    }
    if (lifecycleImplementation === franchiseOffseasonLifecycle && ruleEngine) {
      // Bind the resolver to the rule engine that is active at this invocation.
      return createFranchiseOffseasonTransactionApprovalResolverV1({ ruleEngine });
    }
    return null;
  }
  function lifecycleSupport() {
    const implementation = activeLifecycleImplementation();
    const declared = typeof implementation?.getFranchiseOffseasonLifecycleCapabilitiesV1 === 'function'
      ? implementation.getFranchiseOffseasonLifecycleCapabilitiesV1()
      : typeof implementation?.getCapabilities === 'function'
        ? implementation.getCapabilities() : implementation?.capabilities;
    const declaredReports = declared && typeof declared === 'object' && !Array.isArray(declared) ? declared : {};
    const reports = lifecycleImplementation === franchiseOffseasonLifecycle
      ? { ...declaredReports, approvalResolver: Boolean(declaredReports.approvalResolutionBridge && hasCurrentApprovalResolver()) }
      : declaredReports;
    const exposes = name => typeof implementation?.[name] === 'function';
    const phaseExecutors = implementation?.phaseExecutors;
    return {
      futureScenarioSourceReceipt: reports.futureScenarioSourceReceipt === true
        && exposes('createFutureFranchiseScenarioSourceReceiptV1'),
      seasonRollover: reports.seasonRollover === true && exposes('advanceFranchiseToNextSeasonV1'),
      offseasonWindowAdvance: reports.windowAdvance === true
        && exposes('advanceFranchiseOffseasonWindowV1'),
      offseasonPhaseRunner: reports.phaseRunner === true && reports.phaseExecutors === true
        && exposes('runFranchiseOffseasonPhaseV1') && Boolean(phaseExecutors && typeof phaseExecutors === 'object'),
      offseasonApprovalResolution: reports.approvalResolutionBridge === true && reports.approvalResolver === true
        && exposes('resolveFranchiseOffseasonApprovalV1')
        && hasCurrentApprovalResolver(),
      multiSeason: reports.seasonRollover === true && exposes('advanceFranchiseToNextSeasonV1')
        && Boolean(inputs && gameInputBundleReceipt),
      draft: reports.draft === true && reports.phaseExecutors === true && typeof phaseExecutors?.draft === 'function',
      freeAgencyMarket: reports.freeAgencyMarket === true && reports.phaseExecutors === true
        && typeof phaseExecutors?.['free-agency'] === 'function',
      tradeWindow: reports.tradeWindow === true && reports.phaseExecutors === true
        && typeof phaseExecutors?.['trade-window'] === 'function',
      draftExecutorAvailable: reports.phaseExecutors === true && typeof phaseExecutors?.draft === 'function',
    };
  }
  function currentCapabilities() {
    const lifecycle = lifecycleSupport();
    return {
      nextGame: true, nextUserGame: true, runRemainingSchedule: true, rotation: true, saves: true,
      transactions: true, seasonCompletion: true, seasonEndTransition: true, seasonAwardsFinalization: true,
      ...lifecycle,
      multiSeason: lifecycle.seasonRollover === true && Boolean(inputs && gameInputBundleReceipt),
      preparedGameInputs: Boolean(inputs && gameInputBundleReceipt),
      gameInputBundleLoading: true,
      postseasonInputPreparation: postseasonInputPreparationAvailable(),
      postseason: Boolean(preparedPostseason && session
        && preparedPostseason.expectedRevision === session.revision),
      livePlayback: false,
      realizationCountPerAdvance: 1, browserWorker: true,
      disclosure: 'One realized player-driven game per advance. Unknown availability is a scenario assumption. Contract legality is conditional on resolved rules and state; provisional moves require Provisional Sandbox.',
    };
  }
  function rebindPreparedGameInputs(nextSession) {
    if (!inputs || !gameInputBundleReceipt) return;
    gameInputBundleReceipt = {
      ...gameInputBundleReceipt,
      sessionRevision: nextSession.revision,
      leagueStateRevision: nextSession.leagueState.revision,
      sourceReceipt: clone(nextSession.sourceReceipt),
      modelReceipt: clone(nextSession.modelReceipt),
    };
    nextSession.preparedGameInputBundleReceipt = clone(gameInputBundleReceipt);
  }
  function invalidatePreparedGameInputs(nextSession, reason = 'state-transition') {
    inputs = null;
    gameInputBundleReceipt = null;
    if (!nextSession) return;
    const priorReceipt = nextSession.preparedGameInputBundleReceipt ?? gameInputBundleReceipt ?? null;
    if (priorReceipt) {
      nextSession.actionHistory ??= [];
      nextSession.actionHistory.push({
        revision: nextSession.revision,
        kind: 'game-input-bundle-invalidated',
        reason,
        preparedGameInputBundleReceipt: clone(priorReceipt),
        seasonStartYear: priorReceipt.seasonStartYear,
        sessionRevision: priorReceipt.sessionRevision,
        leagueStateRevision: priorReceipt.leagueStateRevision,
        sourceReceipt: clone(priorReceipt.sourceReceipt),
        modelReceipt: clone(priorReceipt.modelReceipt),
        scheduleSha256: priorReceipt.scheduleSha256,
        gameInputsSha256: priorReceipt.gameInputsSha256,
      });
    }
    delete nextSession.preparedGameInputBundleReceipt;
  }
  function assertStoredGameInputBundle(receipt, expected) {
    const loaded = clone(expected);
    if (Number.isSafeInteger(receipt?.preparedAgainstSessionRevision)) {
      loaded.preparedAgainstSessionRevision = receipt.preparedAgainstSessionRevision;
    }
    assertFranchiseGameInputBundleReceiptV1(receipt, loaded);
  }
  return async function dispatch(type, payload = {}, { reportProgress = () => {}, isCancelled = () => false } = {}) {
    if (type === 'initialize') {
      assert(typeof payload.gameModelText === 'string' && typeof payload.productionCandidateText === 'string', 'Initialization requires original model artifact JSON text.');
      const nextModel = JSON.parse(payload.gameModelText), nextProduction = JSON.parse(payload.productionCandidateText);
      assert(nextModel?.modelId && nextModel.marginModel && nextModel.totalModel, 'Unsupported game-model artifact.');
      assert(nextProduction?.format === 'djhc-shared-player-production-candidate-v1' && nextProduction.version === '1.0.0-development' &&
        nextProduction.status === 'isolated-development-candidate; joint-game-selection-pending', 'Unsupported player-production artifact.');
      const hasGameInputs = Boolean(payload.gameInputs && typeof payload.gameInputs === 'object' && !Array.isArray(payload.gameInputs));
      assert(hasGameInputs || payload.session, 'Initialize a new scenario with prepared game inputs.');
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
        hasGameInputs ? createFranchiseExecutionInputPinsV1({ cbaProfile: payload.cbaProfile ?? null,
          schedule: setupSchedule.map(game => ({ ...game, seasonStartYear: game.seasonStartYear ?? setupState.seasonStartYear })),
          gameInputs: payload.gameInputs }) : Promise.resolve(clone(payload.session?.modelReceipt?.executionInputPins ?? null)),
      ]);
      const receipt = { modelId: nextModel.modelId, contentSha256, productionModelId: nextProduction.modelId,
        productionContentSha256, eventOptions: options, executedModelId: executedId(nextModel, nextProduction, options),
        executionInputPins, status: 'isolated-development-candidate-not-certified' };
      const expectedSourceReceipt = payload.expectedSourceReceipt ?? payload.sessionInput?.sourceReceipt ?? payload.session?.sourceReceipt;
      assert(expectedSourceReceipt, 'Initialization requires the current source receipt, including when loading a save.');
      const nextSession = payload.session ? clone(payload.session) : createFranchiseBrowserSession({ ...payload.sessionInput, modelReceipt: receipt });
      const expectedSessionModelReceipt = payload.session?.modelReceipt ?? receipt;
      assert(nextSession.modelReceipt.modelId === receipt.modelId
        && nextSession.modelReceipt.contentSha256 === receipt.contentSha256
        && nextSession.modelReceipt.productionModelId === receipt.productionModelId
        && nextSession.modelReceipt.productionContentSha256 === receipt.productionContentSha256
        && nextSession.modelReceipt.executedModelId === receipt.executedModelId,
      'Loaded model artifacts do not match the saved franchise model receipt.');
      validateFranchiseBrowserSession(nextSession, { expectedModelReceipt: expectedSessionModelReceipt,
        expectedSourceReceipt });
      if (hasGameInputs) {
        const restoredPins = await createFranchiseExecutionInputPinsV1({ cbaProfile: payload.cbaProfile ?? null,
          schedule: nextSession.schedule, gameInputs: payload.gameInputs });
        assert(stableStringifyV1(restoredPins) === stableStringifyV1(executionInputPins), 'Saved schedule differs from the prepared execution input pin.');
        if (payload.session) assert(stableStringifyV1(executionInputPins) === stableStringifyV1(expectedSessionModelReceipt.executionInputPins),
          'Saved session input pins do not match the prepared game input bundle.');
        const expectedBundleReceipt = await createFranchiseGameInputBundleReceiptV1({ session: nextSession,
          expectedRevision: nextSession.revision, gameInputs: payload.gameInputs, cbaProfile: payload.cbaProfile ?? null });
        let nextBundleReceipt;
        if (nextSession.preparedGameInputBundleReceipt) {
          assertStoredGameInputBundle(nextSession.preparedGameInputBundleReceipt, expectedBundleReceipt);
          nextBundleReceipt = clone(nextSession.preparedGameInputBundleReceipt);
        } else {
          assert(!payload.session,
            'A saved session without an active prepared-input receipt must load a new bundle with load-game-input-bundle.');
          nextSession.preparedGameInputBundleReceipt = clone(expectedBundleReceipt);
          nextBundleReceipt = clone(expectedBundleReceipt);
        }
        gameInputBundleReceipt = nextBundleReceipt;
      } else gameInputBundleReceipt = null;
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
      await validateFranchiseSeasonEndHandoffV1({ session: nextSession, scheduleReceipt: nextSeasonScheduleReceipt });
      const nextRuleEngine = payload.cbaProfile ? createCbaTradeRuleEngine({ profile: clone(payload.cbaProfile), allowScenarioProvenance: true }) : null;
      // Commit initialization only after the entire replacement is verified.
      session = nextSession; gameModel = nextModel; production = nextProduction; preparedPostseason = null;
      inputs = hasGameInputs ? clone(payload.gameInputs) : null; verifiedReceipt = receipt; eventOptions = options;
      loadedArtifactPins = { modelId: receipt.modelId, contentSha256: receipt.contentSha256,
        productionModelId: receipt.productionModelId, productionContentSha256: receipt.productionContentSha256,
        executedModelId: receipt.executedModelId, eventOptions: clone(receipt.eventOptions) };
      ruleEngine = nextRuleEngine; currentCbaProfile = clone(payload.cbaProfile ?? null);
      seasonScheduleReceipt = nextSeasonScheduleReceipt;
      return { status: 'initialized', session: clone(session), capabilities: currentCapabilities() };
    }
    assert(session, 'Initialize the franchise worker first.');
    if (Number.isInteger(payload.expectedRevision)) {
      assert(payload.expectedRevision === session.revision, 'Stale franchise session revision.');
    }
    if (type === 'snapshot') return { status: 'snapshot', session: clone(session) };
    if (type === 'load-game-input-bundle') {
      assert(payload.expectedRevision === session.revision,
        'Prepared game inputs were requested against a stale or missing franchise revision.');
      assert(session.leagueState.transactionWindow === 'games',
        'Prepared game inputs can only be loaded after the LeagueState reaches the games window.');
      assert(!session.pendingOffseasonApproval,
        'Resolve the saved offseason approval before loading game inputs.');
      assert(payload.gameInputs && typeof payload.gameInputs === 'object' && !Array.isArray(payload.gameInputs),
        'A prepared game-input map is required.');
      const cbaProfile = payload.cbaProfile === undefined ? currentCbaProfile : payload.cbaProfile;
      if (cbaProfile !== null) assert(cbaProfile?.seasonStartYear === session.leagueState.seasonStartYear,
        'The supplied CBA profile is not pinned to the active season.');
      const expectedInputReceipt = await createFranchiseGameInputBundleReceiptV1({
        session, expectedRevision: session.revision, gameInputs: payload.gameInputs, cbaProfile,
      });
      assertFranchiseGameInputBundleReceiptV1(payload.inputBundleReceipt, expectedInputReceipt);

      const nextGameModel = payload.gameModelText ? JSON.parse(payload.gameModelText) : gameModel;
      const nextProduction = payload.productionCandidateText ? JSON.parse(payload.productionCandidateText) : production;
      assert(nextGameModel?.modelId && nextGameModel.marginModel && nextGameModel.totalModel,
        'Prepared input bundle model assets are invalid.');
      assert(nextProduction?.format === 'djhc-shared-player-production-candidate-v1'
        && nextProduction.version === '1.0.0-development'
        && nextProduction.status === 'isolated-development-candidate; joint-game-selection-pending',
      'Prepared input bundle production candidate is invalid.');
      const nextOptions = { playerEventMapping: 'rate-linked-recovery-possession-v3',
        playerReboundOwnership: 'player-rebound-budget-v1',
        ...clone(payload.eventOptions ?? session.modelReceipt.eventOptions ?? eventOptions ?? {}) };
      assert(Object.keys(nextOptions).every(key => optionsAllowed.has(key)), 'Unsupported event option in the prepared input bundle.');
      assert(nextOptions.playerReboundOwnership === 'player-rebound-budget-v1'
        && (nextOptions.playerReboundSplit === undefined || nextOptions.playerReboundSplit === 'prior-count-rebound-split-v1')
        && nextOptions.playerEventMapping === 'rate-linked-recovery-possession-v3'
        && nextOptions.playerFoulMatchupSplit === undefined && nextOptions.playerFoulUnknownRatePer36 === undefined,
      'Prepared input bundle requests an unsupported event configuration.');
      const [contentSha256, productionContentSha256] = await Promise.all([
        payload.gameModelText ? digest(payload.gameModelText) : Promise.resolve(loadedArtifactPins?.contentSha256),
        payload.productionCandidateText ? digest(payload.productionCandidateText) : Promise.resolve(loadedArtifactPins?.productionContentSha256),
      ]);
      const candidateReceipt = {
        modelId: nextGameModel.modelId, contentSha256,
        productionModelId: nextProduction.modelId, productionContentSha256,
        eventOptions: nextOptions, executedModelId: executedId(nextGameModel, nextProduction, nextOptions),
        executionInputPins: expectedInputReceipt.executionInputPins,
        status: 'isolated-development-candidate-not-certified',
      };
      const pinnedModel = session.modelReceipt;
      assert(candidateReceipt.modelId === pinnedModel.modelId
        && candidateReceipt.contentSha256 === pinnedModel.contentSha256
        && candidateReceipt.productionModelId === pinnedModel.productionModelId
        && candidateReceipt.productionContentSha256 === pinnedModel.productionContentSha256
        && candidateReceipt.executedModelId === pinnedModel.executedModelId
        && stableStringifyV1(candidateReceipt.eventOptions) === stableStringifyV1(pinnedModel.eventOptions),
      'Prepared input assets must match the active source/model receipts; supply revalidated assets when the model pin changes.');

      const nextSession = clone(session);
      nextSession.revision += 1;
      nextSession.modelReceipt = clone(candidateReceipt);
      const loadedReceipt = {
        ...clone(expectedInputReceipt),
        preparedAgainstSessionRevision: session.revision,
        sessionRevision: nextSession.revision,
        leagueStateRevision: nextSession.leagueState.revision,
        modelReceipt: clone(nextSession.modelReceipt),
      };
      nextSession.preparedGameInputBundleReceipt = loadedReceipt;
      nextSession.actionHistory.push({ revision: nextSession.revision, kind: 'load-game-input-bundle',
        seasonStartYear: nextSession.leagueState.seasonStartYear,
        preparedAgainstSessionRevision: session.revision,
        leagueStateRevision: nextSession.leagueState.revision,
        scheduleSha256: loadedReceipt.scheduleSha256,
        gameInputsSha256: loadedReceipt.gameInputsSha256,
        modelId: candidateReceipt.modelId, sourcePackageId: nextSession.sourceReceipt.packageId,
      });
      validateFranchiseBrowserSession(nextSession);
      serializeFranchiseBrowserCheckpoint(nextSession);
      session = nextSession; inputs = clone(payload.gameInputs); gameInputBundleReceipt = clone(loadedReceipt);
      gameModel = nextGameModel; production = nextProduction; eventOptions = nextOptions; verifiedReceipt = candidateReceipt;
      loadedArtifactPins = { modelId: candidateReceipt.modelId, contentSha256: candidateReceipt.contentSha256,
        productionModelId: candidateReceipt.productionModelId, productionContentSha256: candidateReceipt.productionContentSha256,
        executedModelId: candidateReceipt.executedModelId, eventOptions: clone(candidateReceipt.eventOptions) };
      currentCbaProfile = clone(cbaProfile);
      ruleEngine = cbaProfile ? createCbaTradeRuleEngine({ profile: clone(cbaProfile), allowScenarioProvenance: true }) : null;
      return { status: 'game-inputs-loaded', session: clone(session), inputBundleReceipt: clone(gameInputBundleReceipt),
        capabilities: currentCapabilities() };
    }
    if (type === 'verify-season-completion') {
      assert(payload.expectedRevision === session.revision, 'Stale franchise session revision.');
      validateFranchiseBrowserSession(session);
      const completion = await verifyFranchiseSeasonCompletionV1({ receipt: seasonScheduleReceipt,
        completedGames: session.leagueState.completedGames ?? [] });
      return { status: 'season-games-complete', completion, session: clone(session) };
    }
    if (type === 'close-regular-season') {
      const result = await closeFranchiseRegularSeasonV1({
        session,
        expectedRevision: payload.expectedRevision,
        completionSessionRevision: payload.completionSessionRevision,
        completionReceipt: payload.completionReceipt,
        scheduleReceipt: seasonScheduleReceipt,
      });
      session = result.session;
      invalidatePreparedGameInputs(session, 'season-closeout');
      return { ...result, session: clone(session), capabilities: currentCapabilities() };
    }
    if (type === 'finalize-season-awards') {
      assert(payload.expectedRevision === session.revision, 'Stale franchise session revision.');
      assert(payload.userApproved === true,
        'Recording simulated season awards requires explicit user approval.');
      const seasonStartYear = session.leagueState.seasonStartYear;
      const closeout = session.leagueState.franchiseLifecycleReceiptsBySeason?.[String(seasonStartYear)];
      assert(closeout?.status === 'regular-season-closed'
        && closeout.seasonStartYear === seasonStartYear
        && closeout.completionReceipt,
      'Season-awards finalization requires a verified regular-season closeout receipt.');
      const result = await finalizeFranchiseSeasonAwardsForClosedSessionV1({
        session,
        expectedRevision: payload.expectedRevision,
        completionReceipt: closeout.completionReceipt,
        completionSessionRevision: payload.expectedRevision,
        awardsSeed: payload.awardsSeed,
        awardsPolicy: payload.awardsPolicy ?? null,
      });
      validateFranchiseBrowserSession(result.session);
      if (!result.idempotentReplay) preparedPostseason = null;
      session = clone(result.session);
      return { ...result, session: clone(session), capabilities: currentCapabilities() };
    }
    if (type === 'prepare-postseason') {
      assert(payload.expectedRevision === session.revision,
        'Postseason input preparation requires the exact current franchise revision.');
      assert(payload.userApproved === true,
        'Postseason input preparation requires an explicit user action.');
      assert(postseasonInputPreparationAvailable(),
        'Postseason completion requires a verified regular-season closeout, finalized awards, and pinned current model.');
      assert(!isCancelled(), 'Postseason input preparation was cancelled before simulation began.');
      const gameInputsByGameId = payload.gameInputsByGameId;
      assert(gameInputsByGameId && typeof gameInputsByGameId === 'object' && !Array.isArray(gameInputsByGameId),
        'Postseason preparation requires caller-supplied game inputs keyed by exact matchup game ID.');
      assert(Number.isSafeInteger(payload.postseasonSeed) && payload.postseasonSeed >= 0
        && payload.postseasonSeed <= 0xFFFFFFFF,
      'Postseason preparation requires an explicit unsigned 32-bit seed.');
      const seasonStartYear = session.leagueState.seasonStartYear;
      const yearKey = String(seasonStartYear);
      const closeoutReceipt = session.leagueState.franchiseLifecycleReceiptsBySeason[yearKey];
      const awardReceipt = session.leagueState.awardHistoryBySeason[yearKey].finalizationReceipt;
      const usedGameInputs = [];
      let gamesReported = 0;
      reportProgress({ phase: 'postseason-inputs-validating', completed: 0, total: null,
        sessionRevision: session.revision, seasonStartYear });
      let result;
      try {
        result = await completeFranchisePostseasonV1({
        session,
        expectedRevision: payload.expectedRevision,
        seasonStartYear,
        completionReceipt: closeoutReceipt.completionReceipt,
        awardsSeed: awardReceipt.awardsSeed,
        postseasonSeed: payload.postseasonSeed,
        gameModel,
        loadedModelReceipt: verifiedReceipt,
        gameInputForMatchup: context => {
          assert(!isCancelled(), 'Postseason input preparation was cancelled before completion.');
          const input = gameInputsByGameId[context.gameId];
          assert(input && typeof input === 'object' && !Array.isArray(input),
            `Postseason matchup ${context.gameId} requires caller-supplied game input.`);
          usedGameInputs.push(context.gameId);
          reportProgress({ phase: 'postseason-game', completed: ++gamesReported, total: null,
            sessionRevision: session.revision, gameId: context.gameId,
            homeTeamCode: context.homeTeam.teamCode, awayTeamCode: context.awayTeam.teamCode });
          return clone(input);
        },
        simulateGameFn: (model, input, options) => {
          const sample = simulateGameLiveSeasonSample(model, input, {
            ...eventOptions, ...options, playerProductionCandidate: production,
            playerEventCalibrationCache: cache,
          });
          return { ...sample, modelId: verifiedReceipt.executedModelId };
        },
        playInPolicy: payload.playInPolicy ?? 'auto',
        finalsHomeCourtTeamCode: payload.finalsHomeCourtTeamCode ?? null,
        restDaysForMatchup: payload.restDaysForMatchup ?? null,
        gameOptions: clone(payload.gameOptions ?? {}),
        maxTieRedraws: payload.maxTieRedraws ?? 20,
        });
      } catch (error) {
        if (/caller-supplied game input|exact generated matchup set/i.test(String(error?.message ?? error))) {
          preparedPostseason = null;
          const message = String(error.message);
          return { status: 'blocked-requires-input', message,
            missingInputs: [message], session: clone(session), capabilities: currentCapabilities() };
        }
        throw error;
      }
      const suppliedIds = Object.keys(gameInputsByGameId).sort();
      const usedIds = [...usedGameInputs].sort();
      assert(usedIds.length === new Set(usedIds).size,
        'Postseason simulation requested a duplicate matchup input ID.');
      assert(stableStringifyV1(suppliedIds) === stableStringifyV1(usedIds),
        `Postseason inputs must cover the exact generated matchup set; supplied ${suppliedIds.length}, used ${usedIds.length}.`);
      assert(result?.status === 'franchise-postseason-completed'
        && result.session?.revision === session.revision + 1,
      'The postseason adapter returned an invalid revision-bound completion.');
      validateFranchiseBrowserSession(result.session);
      serializeFranchiseBrowserCheckpoint(result.session);
      preparedPostseason = {
        expectedRevision: session.revision,
        baseSessionSha256: digestSessionSync(session),
        sourceReceipt: clone(session.sourceReceipt),
        modelReceipt: clone(session.modelReceipt),
        gameInputsSha256: digestSessionSync(gameInputsByGameId),
        gameInputGameIds: usedIds,
        result: clone(result),
      };
      reportProgress({ phase: 'postseason-inputs-prepared', completed: gamesReported, total: gamesReported,
        sessionRevision: session.revision, resultSessionRevision: result.session.revision,
        gameInputsSha256: preparedPostseason.gameInputsSha256 });
      return { status: 'postseason-ready-to-commit', session: clone(session),
        postseason: clone(result.postseason), receipt: clone(result.receipt),
        gameInputGameIds: usedIds, gameInputsSha256: preparedPostseason.gameInputsSha256,
        capabilities: currentCapabilities() };
    }
    if (type === 'commit-postseason') {
      assert(payload.expectedRevision === session.revision,
        'Postseason commit requires the exact current franchise revision.');
      assert(payload.userApproved === true,
        'Committing a postseason result requires explicit user approval.');
      assert(currentCapabilities().postseason === true,
        'No fully prepared postseason result is current for this franchise revision.');
      assert(preparedPostseason.baseSessionSha256 === digestSessionSync(session)
        && stableStringifyV1(preparedPostseason.sourceReceipt) === stableStringifyV1(session.sourceReceipt)
        && stableStringifyV1(preparedPostseason.modelReceipt) === stableStringifyV1(session.modelReceipt),
      'The prepared postseason result no longer matches the current source, model, or franchise session.');
      const prepared = clone(preparedPostseason.result);
      const nextSession = clone(prepared.session);
      const action = nextSession.actionHistory.at(-1);
      assert(action?.kind === 'complete-franchise-postseason'
        && action.revision === nextSession.revision,
      'The prepared postseason session is missing its completion action.');
      action.gameInputsSha256 = preparedPostseason.gameInputsSha256;
      action.gameInputGameIds = clone(preparedPostseason.gameInputGameIds);
      validateFranchiseBrowserSession(nextSession);
      serializeFranchiseBrowserCheckpoint(nextSession);
      session = nextSession;
      preparedPostseason = null;
      inputs = null;
      gameInputBundleReceipt = null;
      reportProgress({ phase: 'postseason-committed', completed: 1, total: 1,
        sessionRevision: session.revision, receiptSha256: prepared.receipt.receiptSha256 });
      return { ...prepared, session: clone(session), capabilities: currentCapabilities() };
    }
    if (type === 'create-future-source-receipt') {
      const implementation = activeLifecycleImplementation();
      assert(lifecycleSupport().futureScenarioSourceReceipt,
        'Future scenario provenance is unavailable until an injected lifecycle implementation reports support.');
      const sourceReceipt = implementation.createFutureFranchiseScenarioSourceReceiptV1({
        sourceReceipt: payload.sourceReceipt ?? session.sourceReceipt,
        targetSeasonStartYear: payload.targetSeasonStartYear,
        scenarioId: payload.scenarioId,
        projectionReceipt: payload.projectionReceipt ?? null,
        scheduleState: payload.scheduleState ?? null,
      });
      return { status: 'future-source-receipt-created', sourceReceipt, session: clone(session) };
    }
    if (type === 'advance-next-season') {
      const implementation = activeLifecycleImplementation();
      assert(lifecycleSupport().seasonRollover,
        'Next-season advancement is unavailable until an injected lifecycle implementation reports support.');
      assert(!session.pendingOffseasonApproval,
        'Resolve the saved offseason approval before advancing the Franchise season.');
      const result = implementation.advanceFranchiseToNextSeasonV1({
        session, expectedRevision: payload.expectedRevision,
        nextSourceReceipt: payload.nextSourceReceipt ?? null,
        nextModelReceipt: payload.nextModelReceipt ?? null,
        nextSeasonOptions: clone(payload.nextSeasonOptions ?? {}),
        ...(typeof implementation.rollover === 'function' ? { rollover: implementation.rollover } : {}),
      });
      assert(result?.status === 'next-season-preseason-ready' && result.session?.revision === session.revision + 1
        && result.session.leagueState?.seasonStartYear === session.leagueState.seasonStartYear + 1
        && result.session.leagueState?.transactionWindow === 'preseason' && result.session.scheduleCursor === 0
        && result.receipt?.targetSessionRevision === result.session.revision,
      'The lifecycle implementation returned an invalid next-season transition.');
      const unsignedTransition = clone(result.receipt);
      const transitionSha256 = unsignedTransition.receiptSha256;
      delete unsignedTransition.receiptSha256;
      assert(typeof transitionSha256 === 'string'
        && await digest(stableStringifyV1(unsignedTransition)) === transitionSha256,
      'The lifecycle implementation returned a transition receipt with an invalid digest.');
      assert(result.session.sourceReceipt?.sourceClass === 'generated-scenario'
        && result.receipt.targetSourceReceipt?.packageManifestSha256 === result.session.sourceReceipt.packageManifestSha256
        && await digest(stableStringifyV1(result.session.sourceReceipt.sourceScenario))
          === result.session.sourceReceipt.packageManifestSha256,
      'The lifecycle implementation returned an invalid generated-source provenance receipt.');
      validateFranchiseBrowserSession(result.session);
      session = clone(result.session);
      invalidatePreparedGameInputs(session, 'season-rollover');
      verifiedReceipt = clone(session.modelReceipt);
      ruleEngine = null; currentCbaProfile = null;
      seasonScheduleReceipt = await deriveFranchiseSeasonScheduleReceiptV1({
        schedule: session.schedule, teams: session.leagueState.teams,
        seasonStartYear: session.leagueState.seasonStartYear,
        scenarioMetadata: { sourceClass: 'user-scenario', label: 'Generated next-season franchise schedule',
          sourceRef: session.sourceReceipt.packageId },
      });
      await validateFranchiseSeasonEndHandoffV1({ session, scheduleReceipt: seasonScheduleReceipt });
      return clone({ ...result, session, capabilities: currentCapabilities() });
    }
    if (type === 'advance-offseason-window') {
      const implementation = activeLifecycleImplementation();
      assert(lifecycleSupport().offseasonWindowAdvance,
        'Offseason window advancement is unavailable until an injected lifecycle implementation reports support.');
      assert(!session.pendingOffseasonApproval,
        'Resolve the saved offseason approval before advancing to another offseason window.');
      const result = implementation.advanceFranchiseOffseasonWindowV1({
        session, expectedRevision: payload.expectedRevision, nextWindow: payload.nextWindow,
      });
      assert(result?.status === 'offseason-window-advanced' && result.session?.revision === session.revision + 1
        && result.session.leagueState?.seasonStartYear === session.leagueState.seasonStartYear,
      'The lifecycle implementation returned an invalid offseason-window transition.');
      validateFranchiseBrowserSession(result.session);
      session = clone(result.session);
      invalidatePreparedGameInputs(session, 'offseason-window-advance');
      return clone({ ...result, session, capabilities: currentCapabilities() });
    }
    if (type === 'run-offseason-phase') {
      const support = lifecycleSupport();
      const implementation = activeLifecycleImplementation();
      assert(support.offseasonPhaseRunner,
        'Offseason phase execution is unavailable until an injected lifecycle implementation reports support.');
      assert(payload.userApproved === true,
        'Offseason phase execution requires an explicit user action.');
      assert(!session.pendingOffseasonApproval,
        'Resolve the saved offseason approval before starting another offseason phase.');
      const window = String(payload.window ?? session.leagueState.transactionWindow ?? '');
      const phaseCapability = window === 'free-agency' ? support.freeAgencyMarket
        : window === 'trade-window' ? support.tradeWindow
          : window === 'draft' ? support.draftExecutorAvailable : false;
      assert(phaseCapability, `No ready explicit phase executor is advertised for ${window || 'this window'}.`);
      const executePhase = implementation.phaseExecutors[window];
      assert(typeof executePhase === 'function', `No injected phase executor is available for ${window || 'this window'}.`);
      reportProgress({ phase: 'offseason-phase-started', completed: 0, total: 1,
        sessionRevision: session.revision, window });
      const result = await implementation.runFranchiseOffseasonPhaseV1({
        session, expectedRevision: payload.expectedRevision, window,
        context: clone(payload.context ?? null),
        execute: (state, context) => executePhase(state, context, { reportProgress, isCancelled }),
      });
      assert(result?.session?.revision === session.revision + 1
        && result.session.leagueState?.seasonStartYear === session.leagueState.seasonStartYear
        && result.session.leagueState?.transactionWindow === session.leagueState.transactionWindow,
      'The lifecycle implementation returned an invalid offseason phase result.');
      validateFranchiseBrowserSession(result.session);
      session = clone(result.session);
      invalidatePreparedGameInputs(session, 'offseason-phase-commit');
      reportProgress({ phase: 'offseason-phase-checkpoint', completed: 1, total: 1,
        sessionRevision: session.revision, window, pendingApproval: Boolean(session.pendingOffseasonApproval) });
      return clone({ ...result, session, capabilities: currentCapabilities() });
    }
    if (type === 'resolve-offseason-approval') {
      const support = lifecycleSupport();
      const implementation = activeLifecycleImplementation();
      assert(support.offseasonApprovalResolution,
        'Offseason approval resolution is unavailable until an injected transaction adapter reports support.');
      assert(payload.userApproved === true,
        'Resolving an offseason approval requires an explicit user decision.');
      assert(session.pendingOffseasonApproval,
        'There is no saved offseason approval to resolve.');
      assert(session.pendingOffseasonApproval.stateRevision === session.leagueState.revision,
        'The saved offseason approval is not pinned to the current LeagueState revision.');
      assert(['approve', 'reject', 'counter'].includes(payload.decision),
        'Choose approve, reject, or counter for the saved offseason proposal.');
      const resolver = currentApprovalResolver();
      assert(typeof resolver === 'function',
        'The current transaction rule engine does not provide an offseason approval resolver.');
      const result = await implementation.resolveFranchiseOffseasonApprovalV1({
        session,
        expectedRevision: payload.expectedRevision,
        decision: payload.decision,
        context: clone(payload.context ?? null),
        resolve: resolver,
      });
      assert(typeof result?.status === 'string' && result.session?.revision === session.revision + 1
        && result.session.leagueState?.seasonStartYear === session.leagueState.seasonStartYear
        && result.session.leagueState?.transactionWindow === session.leagueState.transactionWindow,
      'The transaction adapter returned an invalid offseason approval result.');
      validateFranchiseBrowserSession(result.session);
      session = clone(result.session);
      invalidatePreparedGameInputs(session, 'offseason-approval-resolution');
      return clone({ ...result, session, capabilities: currentCapabilities() });
    }
    if (type === 'export') return { status: 'exported', saveText: serializeFranchiseBrowserCheckpoint(session) };
    if (type === 'restore' || type === 'restore-session') {
      const restore = type === 'restore-session' ? restoreFranchiseBrowserCheckpointObject : restoreFranchiseBrowserCheckpoint;
      const next = restore(type === 'restore-session' ? payload.session : payload.saveText,
        { expectedSourceReceipt: session.sourceReceipt, expectedModelReceipt: verifiedReceipt });
      let restoredInputsMatch = false;
      if (inputs && gameInputBundleReceipt && next.preparedGameInputBundleReceipt) {
        try {
          const expectedBundleReceipt = await createFranchiseGameInputBundleReceiptV1({ session: next,
            expectedRevision: next.revision, gameInputs: inputs, cbaProfile: currentCbaProfile });
          assertStoredGameInputBundle(next.preparedGameInputBundleReceipt, expectedBundleReceipt);
          const restoredPins = await createFranchiseExecutionInputPinsV1({ cbaProfile: currentCbaProfile,
            schedule: next.schedule, gameInputs: inputs });
          restoredInputsMatch = stableStringifyV1(restoredPins) === stableStringifyV1(next.modelReceipt.executionInputPins);
        } catch { restoredInputsMatch = false; }
      }
      if (!restoredInputsMatch) invalidatePreparedGameInputs(next, 'restore-input-pins-mismatch');
      const nextScheduleReceipt = await deriveFranchiseSeasonScheduleReceiptV1({
        schedule: next.schedule, teams: next.leagueState.teams,
        seasonStartYear: next.leagueState.seasonStartYear,
        scenarioMetadata: { sourceClass: 'user-scenario', label: 'Restored franchise schedule',
          sourceRef: next.sourceReceipt.packageId },
      });
      await validateFranchiseSeasonEndHandoffV1({ session: next, scheduleReceipt: nextScheduleReceipt });
      session = next; preparedPostseason = null;
      seasonScheduleReceipt = nextScheduleReceipt;
      verifiedReceipt = clone(session.modelReceipt);
      if (currentCbaProfile?.seasonStartYear !== session.leagueState.seasonStartYear) {
        currentCbaProfile = null;
        ruleEngine = null;
      }
      if (restoredInputsMatch) gameInputBundleReceipt = clone(next.preparedGameInputBundleReceipt);
      return { status: 'restored', session: clone(session), capabilities: currentCapabilities() };
    }
    if (type === 'next-game' || type === 'next-user-game' || type === 'run-remaining-schedule') {
      assert(payload.expectedRevision === session.revision, 'Stale franchise session revision.');
      if (session.scheduleCursor === session.schedule.length) {
        validateFranchiseBrowserSession(session);
        const completion = await verifyFranchiseSeasonCompletionV1({ receipt: seasonScheduleReceipt,
          completedGames: session.leagueState.completedGames ?? [] });
        return { status: 'season-games-complete', completion, session: clone(session), capabilities: currentCapabilities() };
      }
      if (!inputs || !gameInputBundleReceipt) return {
        status: 'next-season-game-inputs-required',
        message: 'Load a prepared game-input bundle pinned to this exact session revision, LeagueState, season, receipts, and schedule before advancing games.',
        session: clone(session), capabilities: currentCapabilities(),
      };
      try {
        const currentBundleReceipt = await createFranchiseGameInputBundleReceiptV1({ session,
          expectedRevision: session.revision, gameInputs: inputs, cbaProfile: currentCbaProfile });
        assertStoredGameInputBundle(gameInputBundleReceipt, currentBundleReceipt);
        assertStoredGameInputBundle(session.preparedGameInputBundleReceipt, currentBundleReceipt);
      } catch (error) {
        inputs = null;
        gameInputBundleReceipt = null;
        return {
          status: 'next-season-game-inputs-required',
          message: `The prepared input pins no longer match the active session. Load a current game-input bundle before advancing. ${error.message}`,
          session: clone(session), capabilities: currentCapabilities(),
        };
      }
      const simulate = (model, input, options) => simulateGameLiveSeasonSample(model, input, {
        ...eventOptions, ...options, playerProductionCandidate: production, playerEventCalibrationCache: cache,
      });
      Object.defineProperty(simulate, 'supportedScenarioControls', { value: simulateGameLiveSeasonSample.supportedScenarioControls });
      const advance = current => {
        const result = advanceFranchiseBrowserGame(current, { expectedRevision: current.revision,
          gameModel, loadedModelReceipt: verifiedReceipt, simulateGameFn: simulate,
          gameInputForState: scheduled => ({ ...clone(inputs[scheduled.gameId]), seasonStartYear: scheduled.seasonStartYear,
            gameLocalDate: scheduled.gameLocalDate, date: scheduled.gameLocalDate }),
        });
        if (result.session && result.status === 'game-completed') rebindPreparedGameInputs(result.session);
        return result;
      };
      if (type === 'next-game') {
        const result = advance(session);
        session = result.session;
        return clone({ ...result, capabilities: currentCapabilities() });
      }
      const remaining = session.schedule.slice(session.scheduleCursor);
      assert(remaining.length, 'The regular-season schedule is complete.');
      const userTeams = new Set(session.leagueState.userControlledTeamCodes);
      const target = type === 'run-remaining-schedule' ? -1
        : remaining.findIndex(game => userTeams.has(game.homeTeamCode) || userTeams.has(game.awayTeamCode));
      if (type !== 'run-remaining-schedule') assert(userTeams.size === 1, 'Next-user-game requires exactly one user-controlled team.');
      const count = type === 'run-remaining-schedule'
        ? remaining.length
        : target < 0 ? remaining.length : target + 1;
      assert(type === 'run-remaining-schedule' || count <= 200,
        'More than 200 league games precede the next user checkpoint; run the schedule with progress/cancel checkpoints.');
      let working = session, result;
      const advancedGames = [];
      for (let index = 0; index < count; index += 1) {
        if (isCancelled()) {
          session = working;
          return clone({ status: 'cancelled', session, gamesAdvanced: advancedGames.length,
            advancedGames, checkpointKind: 'completed-game-boundary',
            rngCheckpoint: { seed: session.seed, scheduleCursor: session.scheduleCursor,
              revision: session.revision, nextGameId: session.schedule[session.scheduleCursor]?.gameId ?? null } });
        }
        try { result = advance(working); }
        catch (error) {
          if (isCancelled()) {
            session = working;
            return clone({ status: 'cancelled', session, gamesAdvanced: advancedGames.length,
              advancedGames, checkpointKind: 'completed-game-boundary',
              rngCheckpoint: { seed: session.seed, scheduleCursor: session.scheduleCursor,
                revision: session.revision, nextGameId: session.schedule[session.scheduleCursor]?.gameId ?? null } });
          }
          throw error;
        }
        working = result.session;
        const completed = working.leagueState.completedGames.at(-1);
        advancedGames.push({ gameId: completed.gameId, gameLocalDate: completed.gameLocalDate,
          homeTeamCode: completed.homeTeamCode, awayTeamCode: completed.awayTeamCode,
          homeScore: completed.homeScore, awayScore: completed.awayScore });
        reportProgress({ phase: 'game-checkpoint', completed: index + 1, total: count,
          sessionRevision: working.revision, scheduleCursor: working.scheduleCursor,
          seed: working.seed, completedGameId: completed.gameId,
          nextGameId: working.schedule[working.scheduleCursor]?.gameId ?? null,
          rngCheckpoint: { seed: working.seed, scheduleCursor: working.scheduleCursor,
            revision: working.revision, nextGameId: working.schedule[working.scheduleCursor]?.gameId ?? null } });
        if (index + 1 < count) await new Promise(resolve => setTimeout(resolve, 0));
      }
      session = working;
      if (type === 'run-remaining-schedule') {
        const completion = await verifyFranchiseSeasonCompletionV1({ receipt: seasonScheduleReceipt,
          completedGames: session.leagueState.completedGames ?? [] });
        return clone({ status: 'season-games-complete', completion, session,
          gamesAdvanced: count, advancedGames, checkpointKind: 'remaining-league-schedule',
          capabilities: currentCapabilities(), atomicCheckpoint: true, rngCheckpoint: { seed: session.seed,
            scheduleCursor: session.scheduleCursor, revision: session.revision, nextGameId: null } });
      }
      return clone({ ...result, session, gamesAdvanced: count, advancedGames,
        capabilities: currentCapabilities(),
        checkpointKind: target < 0 ? 'remaining-league-schedule' : 'next-user-game',
        atomicCheckpoint: true,
        rngCheckpoint: { seed: session.seed, scheduleCursor: session.scheduleCursor,
          revision: session.revision, nextGameId: session.schedule[session.scheduleCursor]?.gameId ?? null } });
    }
    if (type === 'rotation') {
      const result = setFranchiseBrowserRotation(session, payload);
      session = result.session;
      invalidatePreparedGameInputs(session, 'rotation-change');
      return clone({ ...result, capabilities: currentCapabilities() });
    }
    if (type === 'evaluate-transaction') return { status: 'evaluated', evaluation: evaluateFranchiseBrowserTransaction(session, payload.proposal, { ruleEngine }) };
    if (type === 'execute-transaction') {
      const result = executeFranchiseBrowserTransaction(session, payload.proposal, {
        expectedRevision: payload.expectedRevision, userApproved: payload.userApproved === true, ruleEngine,
        allowProvisionalSandbox: payload.allowProvisionalSandbox === true,
      });
      session = result.session;
      invalidatePreparedGameInputs(session, 'transaction-commit');
      return clone({ ...result, capabilities: currentCapabilities() });
    }
    throw new Error(`Unknown franchise worker command: ${type}`);
  };
}

if (typeof globalThis.WorkerGlobalScope !== 'undefined' && globalThis instanceof globalThis.WorkerGlobalScope) {
  const dispatch = createFranchiseWorkerController({ lifecycleImplementation: franchiseOffseasonLifecycle });
  let queue = Promise.resolve();
  const cancellations = new Set();
  globalThis.addEventListener('message', event => {
    const message = event.data ?? {};
    if (message.type === 'cancel') {
      if (typeof message.commandId === 'string') cancellations.add(message.commandId);
      return;
    }
    const wrapped = message.type === 'command';
    const legacy = !wrapped && Number.isInteger(message.id) && typeof message.type === 'string';
    if ((!wrapped && !legacy) || (wrapped && (typeof message.commandId !== 'string' || typeof message.command !== 'string'))) return;
    const commandId = wrapped ? message.commandId : `legacy-${message.id}`;
    const command = wrapped ? message.command : message.type;
    const payload = message.payload ?? {};
    const expectedRevision = wrapped ? message.expectedRevision ?? null : payload.expectedRevision ?? null;
    queue = queue.then(async () => {
      try {
        const result = await dispatch(command, { ...payload, ...(expectedRevision === null ? {} : { expectedRevision }) }, {
          isCancelled: () => cancellations.has(commandId),
          reportProgress: progress => globalThis.postMessage({ type: 'progress', commandId, progress }),
        });
        const responseType = result?.status === 'approval-required' ? 'approval-required'
          : result?.status === 'cancelled' ? 'cancelled' : 'result';
        if (wrapped) globalThis.postMessage({ type: responseType, commandId, result });
        else globalThis.postMessage({ id: message.id, ok: true, result });
      }
      catch (error) {
        const details = { message: error.message, evaluation: error.evaluation ?? null,
          productionReview: error.productionReview ?? null, rosterPreparation: error.rosterPreparation ?? null };
        if (wrapped) globalThis.postMessage({ type: 'error', commandId, error: details });
        else globalThis.postMessage({ id: message.id, ok: false, error: details });
      }
      finally { cancellations.delete(commandId); }
    });
  });
}
