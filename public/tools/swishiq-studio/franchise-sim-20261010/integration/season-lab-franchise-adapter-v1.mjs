import {
  V4_FRANCHISE_SCENARIO_MODE,
  loadV4FranchiseIntakeV1,
  applyV4FranchiseRosterChoicesV1,
} from './v4-franchise-intake-v1.mjs';
import { buildV4SnapshotWorkerPayloadV1 } from './v4-snapshot-worker-payload-v1.mjs';
import { createFranchiseWorkerClient } from './franchise-worker-client-v1.mjs';
import {
  FRANCHISE_BROWSER_SESSION_FORMAT,
  franchiseBrowserStorageKey,
  restoreFranchiseBrowserSession,
  saveFranchiseBrowserSession,
} from '../lib/franchise-browser-session-v1.mjs';
import {
  restoreFranchiseBrowserCheckpoint,
  restoreFranchiseBrowserCheckpointObject,
  serializeFranchiseBrowserCheckpoint,
} from '../lib/franchise-browser-checkpoint-codec-v1.mjs';
import {
  FRANCHISE_SEASON_COMPLETION_FORMAT,
  FRANCHISE_SEASON_COMPLETION_VERSION,
} from '../lib/franchise-season-completion-v1.mjs';
import {
  assertFranchiseGameInputBundleReceiptV1,
  createFranchiseGameInputBundleReceiptV1,
} from './franchise-game-input-bundle-v1.mjs';

export const SEASON_LAB_FRANCHISE_ADAPTER_FORMAT = 'djhc-season-lab-franchise-adapter-v1';
export const SEASON_LAB_FRANCHISE_ADAPTER_VERSION = '1.2.0';
export const SEASON_LAB_FRANCHISE_VIEW_FORMAT = 'djhc-season-lab-franchise-view-v1';
export const SEASON_LAB_FRANCHISE_ACTION_FORMAT = 'djhc-season-lab-franchise-action-v1';

const clone = value => structuredClone(value);
const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const teamCode = value => String(value ?? '').trim().toUpperCase();
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonicalJsonValue(value[key])]));
  return value;
}
const sameJsonValue = (left, right) => JSON.stringify(canonicalJsonValue(left)) === JSON.stringify(canonicalJsonValue(right));
function sameModelAssetPins(left, right) {
  return ['modelId', 'contentSha256', 'productionModelId', 'productionContentSha256', 'executedModelId', 'status']
    .every(key => left?.[key] === right?.[key])
    && JSON.stringify(left?.eventOptions ?? null) === JSON.stringify(right?.eventOptions ?? null);
}
const defaultBrowserStorage = (() => {
  try { return globalThis.window?.localStorage ?? null; }
  catch { return null; }
})();

function errorView(error, operation) {
  return { operation, message: String(error?.message ?? error ?? 'Unknown adapter failure.'),
    code: typeof error?.code === 'string' ? error.code : null };
}

function inspectSession(session) {
  requireValue(plain(session) && session.format === FRANCHISE_BROWSER_SESSION_FORMAT,
    'Worker did not return a candidate-native franchise session.');
  requireValue(plain(session.sourceReceipt) && plain(session.modelReceipt),
    'Worker session omitted the verified source or model receipt.');
}

/**
 * Isolated facade for the candidate Season Lab franchise flow. The adapter owns
 * one injected worker client, serializes commands, and only publishes returned
 * snapshots after their source/model pins and native session schema validate.
 * Postseason and offseason actions remain revision-bound worker commands.
 */
export function createSeasonLabFranchiseAdapterV1({
  loadIntake = loadV4FranchiseIntakeV1,
  applyRosterChoices = applyV4FranchiseRosterChoicesV1,
  buildSnapshot = buildV4SnapshotWorkerPayloadV1,
  createWorkerClient = () => createFranchiseWorkerClient(),
  storage = defaultBrowserStorage,
  checkpointStore = null,
} = {}) {
  requireValue(typeof loadIntake === 'function' && typeof applyRosterChoices === 'function'
    && typeof buildSnapshot === 'function' && typeof createWorkerClient === 'function',
  'The Season Lab adapter requires intake, snapshot, and worker-client functions.');
  requireValue(checkpointStore === null || (typeof checkpointStore.save === 'function' && typeof checkpointStore.load === 'function'),
    'Checkpoint storage must expose save(session, options) and load(options).');

  let client = null;
  let currentSession = null;
  let workerCapabilities = null;
  let latestResult = null;
  let verifiedSeasonCompletion = null;
  let lastError = null;
  let disposed = false;
  let activeOperation = null;
  let activeCommandId = null;
  let latestProgress = null;
  let pendingApproval = null;
  let commandSequence = 0;
  const progressListeners = new Set();
  let queue = Promise.resolve();

  function assertLive() { requireValue(!disposed, 'Season Lab franchise adapter is disposed.'); }
  function assertInitialized() {
    assertLive();
    requireValue(currentSession, 'Initialize the exact-season source before using franchise controls.');
    requireValue(client, 'The adapter worker is unavailable; create a new adapter from the pinned source to continue.');
  }

  function publicCapabilities() {
    const hasStorage = Boolean(checkpointStore)
      || Boolean(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function');
    return {
      ...(workerCapabilities ? clone(workerCapabilities) : {}),
      nextGame: workerCapabilities?.nextGame === true,
      nextUserGame: workerCapabilities?.nextUserGame === true,
      runRemainingSchedule: workerCapabilities?.runRemainingSchedule === true,
      rotation: workerCapabilities?.rotation === true,
      saves: workerCapabilities?.saves === true,
      save: workerCapabilities?.saves === true && hasStorage,
      restore: workerCapabilities?.saves === true && hasStorage,
      export: workerCapabilities?.saves === true,
      import: workerCapabilities?.saves === true,
      evaluateTransaction: workerCapabilities?.transactions === true,
      executeTransaction: workerCapabilities?.transactions === true,
      seasonCompletion: workerCapabilities?.seasonCompletion === true,
      seasonEndTransition: workerCapabilities?.seasonEndTransition === true,
      seasonAwardsFinalization: workerCapabilities?.seasonAwardsFinalization === true,
      seasonRollover: workerCapabilities?.seasonRollover === true,
      multiSeason: workerCapabilities?.multiSeason === true,
      preparedGameInputs: workerCapabilities?.preparedGameInputs === true,
      gameInputBundleLoading: workerCapabilities?.gameInputBundleLoading === true,
      futureScenarioSourceReceipt: workerCapabilities?.futureScenarioSourceReceipt === true,
      offseasonWindowAdvance: workerCapabilities?.offseasonWindowAdvance === true,
      offseasonPhaseRunner: workerCapabilities?.offseasonPhaseRunner === true,
      offseasonApprovalResolution: workerCapabilities?.offseasonApprovalResolution === true,
      freeAgencyMarket: workerCapabilities?.freeAgencyMarket === true,
      tradeWindow: workerCapabilities?.tradeWindow === true,
      draftExecutorAvailable: workerCapabilities?.draftExecutorAvailable === true,
      postseason: workerCapabilities?.postseason === true,
      postseasonInputPreparation: workerCapabilities?.postseasonInputPreparation === true,
      draft: workerCapabilities?.draft === true,
      livePlayback: workerCapabilities?.livePlayback === true,
    };
  }

  function makeView() {
    const session = currentSession;
    const state = session?.leagueState ?? null;
    const year = state?.seasonStartYear ?? null;
    const schedule = session?.schedule ?? [];
    const cursor = session?.scheduleCursor ?? 0;
    const nextGame = schedule[cursor] ?? null;
    const completed = (state?.completedGames ?? []).filter(game => game.seasonStartYear === year);
    const selectedTeamCode = teamCode(state?.userControlledTeamCodes?.[0]);
    const selectedTeam = state?.teams?.find(team => team.teamCode === selectedTeamCode) ?? null;
    const savedRotation = selectedTeam?.franchiseControlsBySeason?.[String(year)] ?? null;
    const sourceReceipt = session?.sourceReceipt ?? null;
    const modelReceipt = session?.modelReceipt ?? null;
    const completion = plain(verifiedSeasonCompletion) && verifiedSeasonCompletion.sessionRevision === session?.revision
      ? clone(verifiedSeasonCompletion.completion) : null;
    const closeoutReceipt = state?.franchiseLifecycleReceiptsBySeason?.[String(year)] ?? null;
    const status = disposed ? 'disposed' : activeOperation ? 'busy'
      : session ? (lastError ? 'ready-with-error' : 'ready') : (lastError ? 'error' : 'empty');

    return {
      format: SEASON_LAB_FRANCHISE_VIEW_FORMAT,
      version: SEASON_LAB_FRANCHISE_ADAPTER_VERSION,
      status,
      source: sourceReceipt ? {
        packageId: sourceReceipt.packageId,
        packageVersion: sourceReceipt.packageVersion,
        packageManifestSha256: sourceReceipt.packageManifestSha256,
        seasonStartYear: sourceReceipt.seasonStartYear,
        phase: state?.transactionWindow ?? sourceReceipt.phase ?? 'regular',
        mode: sourceReceipt.mode ?? null,
        receipt: clone(sourceReceipt),
      } : null,
      model: modelReceipt ? {
        modelId: modelReceipt.modelId,
        contentSha256: modelReceipt.contentSha256,
        productionModelId: modelReceipt.productionModelId,
        productionContentSha256: modelReceipt.productionContentSha256,
        executedModelId: modelReceipt.executedModelId,
        readiness: modelReceipt.status,
        receipt: clone(modelReceipt),
      } : null,
      phase: session ? {
        name: state?.transactionWindow ?? 'regular',
        seasonStartYear: year,
        status: state?.transactionWindow === 'season-end'
          || (state?.transactionWindow === 'games' && cursor >= schedule.length) ? 'complete' : 'in-progress',
        scheduleCursor: cursor,
        completedGames: completed.length,
        totalGames: schedule.length,
        remainingGames: Math.max(0, schedule.length - cursor),
        nextGame: nextGame ? clone(nextGame) : null,
        postseasonAvailable: workerCapabilities?.postseason === true && state?.transactionWindow === 'season-end',
        offseasonAvailable: workerCapabilities?.offseasonPhaseRunner === true,
      } : null,
      capabilities: publicCapabilities(),
      controls: session ? {
        selectedUserTeamCode: selectedTeamCode,
        userControlledTeamCodes: clone(state.userControlledTeamCodes ?? []),
        availableTeamCodes: (state.teams ?? []).map(team => team.teamCode),
        rotation: savedRotation ? clone(savedRotation) : null,
        transactionApprovalRequired: true,
        pendingOffseasonApproval: clone(session.pendingOffseasonApproval ?? null),
      } : null,
      result: {
        session: session ? clone(session) : null,
        lastAction: latestResult ? clone(latestResult) : null,
      },
      progress: latestProgress ? clone(latestProgress) : null,
      pendingApproval: pendingApproval ? clone(pendingApproval) : null,
      pendingOffseasonApproval: session?.pendingOffseasonApproval
        ? { ...clone(session.pendingOffseasonApproval), approvalRequired: true, expectedRevision: session.revision } : null,
      closeout: session ? {
        state: closeoutReceipt ? 'closed'
          : workerCapabilities?.seasonEndTransition !== true ? 'unavailable'
            : completion && state?.transactionWindow === 'games' && cursor === schedule.length ? 'ready' : 'blocked',
        seasonStartYear: year,
        statusText: closeoutReceipt
          ? `Regular season closed at session revision ${session.revision}.`
          : workerCapabilities?.seasonEndTransition !== true
            ? 'The loaded franchise runtime does not support regular-season closeout.'
            : completion && state?.transactionWindow === 'games' && cursor === schedule.length
              ? 'The completed schedule is verified and ready for regular-season closeout.'
              : 'Finish and verify the exact regular-season schedule before closeout is available.',
        hint: closeoutReceipt
          ? 'This receipt records the games-to-season-end transition only. Postseason and next-season actions remain separately gated.'
          : 'Closeout is revision-bound to the current completion receipt and does not simulate postseason or advance the season year.',
        receipt: closeoutReceipt ? clone(closeoutReceipt) : null,
        completionReceipt: completion,
      } : null,
      error: lastError ? clone(lastError) : null,
    };
  }

  function getView() { return makeView(); }

  function enqueue(operation, action) {
    const pending = queue.then(async () => {
      assertLive();
      activeOperation = operation;
      try {
        const result = await action();
        assertLive();
        lastError = null;
        // Action methods update state while this operation is still marked
        // busy. Rebuild their outward view once the operation has committed.
        if (result?.format === SEASON_LAB_FRANCHISE_VIEW_FORMAT) {
          activeOperation = null;
          return getView();
        }
        if (result?.view?.format === SEASON_LAB_FRANCHISE_VIEW_FORMAT) {
          activeOperation = null;
          return { ...result, view: getView() };
        }
        return result;
      } catch (error) {
        if (!disposed) lastError = errorView(error, operation);
        throw error;
      } finally {
        if (!disposed) activeOperation = null;
        if (activeCommandId) activeCommandId = null;
      }
    });
    // A failed operation must not poison the serial queue, and is never retried.
    queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async function ensureClient() {
    assertLive();
    if (client) return client;
    const created = await createWorkerClient();
    requireValue(plain(created) && typeof created.initialize === 'function'
      && typeof created.command === 'function' && typeof created.dispose === 'function',
    'Worker-client factory returned an incomplete client.');
    client = created;
    return created;
  }

  function closeWorkerClient() {
    const owned = client;
    client = null;
    workerCapabilities = null;
    try { owned?.dispose(); } catch { /* Preserve the primary adapter failure. */ }
  }

  function commitWorkerSession(session, expectedSourceReceipt, expectedModelReceipt) {
    assertLive();
    let verified;
    try {
      verified = restoreFranchiseBrowserCheckpointObject(session, {
        expectedSourceReceipt,
        expectedModelReceipt,
      });
    } catch (error) {
      // A successful but invalid worker response may already represent an
      // internal commit. Stop using that worker; retain the last view snapshot.
      closeWorkerClient();
      throw new Error(`Worker returned an invalid pinned session; it was closed and the prior view was preserved. ${error.message}`,
        { cause: error });
    }
    currentSession = verified;
    if (verifiedSeasonCompletion?.sessionRevision !== verified.revision) verifiedSeasonCompletion = null;
    if (pendingApproval && pendingApproval.expectedRevision !== verified.revision) pendingApproval = null;
    return verified;
  }

  function publishProgress(progress) {
    latestProgress = plain(progress) ? clone(progress) : { detail: clone(progress) };
    for (const listener of progressListeners) {
      try { listener(clone(latestProgress)); } catch { /* A display listener cannot interrupt a worker command. */ }
    }
  }

  function makeCommandId(operation) {
    commandSequence += 1;
    return `season-lab-${operation}-${commandSequence}`;
  }

  function recordAction(type, status, details = {}) {
    latestResult = { type, status, ...clone(details) };
  }

  function requireCommandResult(result, expectedStatus, label) {
    requireValue(result?.status === expectedStatus, `${label} did not complete (worker status: ${result?.status ?? 'unknown'}).`);
    return result;
  }

  async function initialize({ seasonStartYear, userTeamCode: requestedTeamCode,
    gameModelText, productionCandidateText, seed = 1, rosterChoicesByName = {},
    missingShootingRatingPolicy = 'reject', intakeOptions = {}, cbaProfile = null } = {}) {
    return enqueue('initialize', async () => {
      requireValue(!currentSession, 'This adapter instance already owns an initialized franchise session.');
      verifiedSeasonCompletion = null;
      requireValue(Number.isInteger(seasonStartYear), 'Choose one exact season start year.');
      const selectedTeam = teamCode(requestedTeamCode);
      requireValue(selectedTeam, 'Choose one user-controlled team.');
      requireValue(typeof gameModelText === 'string' && gameModelText.length > 0
        && typeof productionCandidateText === 'string' && productionCandidateText.length > 0,
      'Exact game-model and player-production candidate text is required.');
      requireValue(plain(intakeOptions), 'Intake options must be a plain record.');
      requireValue(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'Seed must be an unsigned 32-bit integer.');

      const loadedIntake = await loadIntake({ ...intakeOptions, seasonStartYear,
        phase: 'regular', mode: V4_FRANCHISE_SCENARIO_MODE, rosterChoicesByName });
      assertLive();
      // An intake may carry optional generated last-team suggestions. The
      // facade applies only explicit roster choices supplied by its caller.
      const intake = applyRosterChoices(loadedIntake, { rosterChoicesByName, teamSuggestionsByName: new Map() });
      requireValue(intake?.status === 'ready-for-user-scenario-setup' && intake.leagueState,
        `V4 intake is not ready for a franchise session (status: ${intake?.status ?? 'unknown'}).`);
      requireValue(intake.scenario?.seasonStartYear === seasonStartYear && intake.scenario?.phase === 'regular'
        && intake.scenario?.mode === V4_FRANCHISE_SCENARIO_MODE,
      'V4 intake does not match the requested exact regular season scenario.');
      const prepared = buildSnapshot({ intake, userTeamCode: selectedTeam, gameModelText,
        productionCandidateText, seed, missingShootingRatingPolicy });
      requireValue(plain(prepared) && plain(prepared.sessionInput?.sourceReceipt)
        && plain(prepared.sessionInput?.leagueState) && Array.isArray(prepared.sessionInput?.schedule),
      'V4 snapshot builder returned an incomplete pinned session payload.');
      requireValue(prepared.sessionInput.sourceReceipt.seasonStartYear === seasonStartYear,
        'Snapshot source receipt does not match the selected season.');
      const payload = { ...prepared, ...(cbaProfile === null ? {} : { cbaProfile: clone(cbaProfile) }) };
      const hadClient = Boolean(client);
      const worker = await ensureClient();
      let result;
      try {
        result = await worker.initialize(payload);
        requireCommandResult(result, 'initialized', 'Franchise initialization');
        requireValue(result.session?.leagueState?.seasonStartYear === seasonStartYear,
          'Worker initialized a different season.');
        requireValue((result.session?.leagueState?.userControlledTeamCodes ?? []).length === 1
          && teamCode(result.session.leagueState.userControlledTeamCodes[0]) === selectedTeam,
        'Worker initialized a different user-controlled team.');
        inspectSession(result.session);
        const verifiedSession = restoreFranchiseBrowserCheckpointObject(result.session, {
          expectedSourceReceipt: prepared.sessionInput.sourceReceipt,
          expectedModelReceipt: result.session.modelReceipt,
        });
        currentSession = verifiedSession;
        workerCapabilities = plain(result.capabilities) ? clone(result.capabilities) : {};
        recordAction('initialize', result.status, { sourcePackageId: verifiedSession.sourceReceipt.packageId,
          seasonStartYear, userTeamCode: selectedTeam,
          generatedShootingRatings: clone(verifiedSession.sourceReceipt.generatedShootingRatings ?? null) });
        return getView();
      } catch (error) {
        if (!hadClient && client === worker) {
          try { worker.dispose(); } finally { client = null; }
        }
        throw error;
      }
    });
  }

  async function commandWithSession(operation, type, payload, acceptedStatuses, details = {}, validateResult = null) {
    assertInitialized();
    activeCommandId = makeCommandId(type);
    publishProgress({ status: 'running', operation: type, commandId: activeCommandId,
      expectedRevision: currentSession.revision, completed: 0, total: null });
    const result = await client.command(type, { ...payload, expectedRevision: currentSession.revision }, {
      commandId: activeCommandId,
      expectedRevision: currentSession.revision,
      onProgress: publishProgress,
    });
    requireValue(acceptedStatuses.includes(result?.status), `${operation} did not complete (worker status: ${result?.status ?? 'unknown'}).`);
    requireValue(result.session, `${operation} did not return a verified session snapshot.`);
    if (typeof validateResult === 'function') validateResult(result);
    if (type === 'load-game-input-bundle') {
      requireValue(sameModelAssetPins(currentSession.modelReceipt, result.session.modelReceipt),
        'Prepared inputs cannot replace the active model or production candidate assets.');
      requireValue(JSON.stringify(result.inputBundleReceipt?.modelReceipt) === JSON.stringify(result.session.modelReceipt),
        'Prepared input receipt is not bound to the returned model receipt.');
    }
    const expectedModelReceipt = type === 'load-game-input-bundle'
      ? result.session.modelReceipt : currentSession.modelReceipt;
    const verified = commitWorkerSession(result.session, currentSession.sourceReceipt, expectedModelReceipt);
    if (plain(result.capabilities)) workerCapabilities = clone(result.capabilities);
    recordAction(type, result.status, { ...details, ...Object.fromEntries(Object.entries(result)
      .filter(([key]) => !['session', 'game'].includes(key))) });
    latestResult = { ...latestResult, ...(result.game ? { game: clone(result.game) } : {}) };
    return { result, session: verified, view: getView() };
  }

  async function setRotation({ teamCode: requestedTeamCode, controls } = {}) {
    return enqueue('set-rotation', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.rotation === true, 'The initialized worker does not support rotation controls.');
      requireValue(plain(controls), 'Rotation controls must be a plain record.');
      const team = teamCode(requestedTeamCode);
      requireValue(team, 'A team code is required for rotation controls.');
      requireValue(team === teamCode(currentSession.leagueState.userControlledTeamCodes?.[0]),
        'Rotation controls are limited to the user-controlled team.');
      const { view } = await commandWithSession('Rotation update', 'rotation', { teamCode: team, controls: clone(controls) },
        ['created', 'updated', 'ready', 'pass'], { teamCode: team });
      return view;
    });
  }

  async function advance(type) {
    return enqueue(type, async () => {
      assertInitialized();
      requireValue(workerCapabilities?.[type === 'next-game' ? 'nextGame'
        : type === 'run-remaining-schedule' ? 'runRemainingSchedule' : 'nextUserGame'] === true,
        `The initialized worker does not support ${type}.`);
      const { view } = await commandWithSession(type, type, {},
        ['game-completed', 'season-games-complete', 'cancelled', 'next-season-game-inputs-required']);
      return view;
    });
  }

  async function loadGameInputBundle({ gameInputs, inputBundleReceipt, cbaProfile = null,
    gameModelText, productionCandidateText, eventOptions } = {}) {
    return enqueue('load-game-input-bundle', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.gameInputBundleLoading === true,
        'The initialized worker does not support prepared game-input bundles.');
      requireValue(currentSession.leagueState.transactionWindow === 'games',
        'Prepared game inputs can only be loaded after the LeagueState reaches the games window.');
      requireValue(plain(gameInputs), 'Prepared game inputs must be a plain object keyed by scheduled game ID.');
      requireValue(cbaProfile === null || plain(cbaProfile), 'The prepared CBA profile must be a plain object or null.');
      const expectedRevision = currentSession.revision;
      const expectedReceipt = await createFranchiseGameInputBundleReceiptV1({
        session: currentSession,
        expectedRevision,
        gameInputs,
        cbaProfile,
      });
      assertFranchiseGameInputBundleReceiptV1(inputBundleReceipt, expectedReceipt);
      const payload = {
        gameInputs: clone(gameInputs),
        cbaProfile: clone(cbaProfile),
        inputBundleReceipt: clone(inputBundleReceipt),
        ...(typeof gameModelText === 'string' ? { gameModelText } : {}),
        ...(typeof productionCandidateText === 'string' ? { productionCandidateText } : {}),
        ...(eventOptions === undefined ? {} : { eventOptions: clone(eventOptions) }),
      };
      const { view } = await commandWithSession('Load prepared game inputs', 'load-game-input-bundle',
        payload, ['game-inputs-loaded'], { inputBundleReceipt: clone(inputBundleReceipt) }, result => {
          const loaded = result.inputBundleReceipt;
          requireValue(result.session.revision === expectedRevision + 1
            && loaded?.sessionRevision === expectedRevision + 1
            && loaded?.preparedAgainstSessionRevision === expectedRevision
            && loaded?.leagueStateRevision === currentSession.leagueState.revision
            && loaded?.seasonStartYear === currentSession.leagueState.seasonStartYear
            && loaded?.scheduleSha256 === inputBundleReceipt.scheduleSha256
            && loaded?.gameInputsSha256 === inputBundleReceipt.gameInputsSha256
            && JSON.stringify(loaded?.executionInputPins) === JSON.stringify(inputBundleReceipt.executionInputPins)
            && JSON.stringify(loaded?.sourceReceipt) === JSON.stringify(currentSession.sourceReceipt)
            && JSON.stringify(loaded?.modelReceipt) === JSON.stringify(result.session.modelReceipt)
            && JSON.stringify(result.session.preparedGameInputBundleReceipt) === JSON.stringify(loaded)
            && result.capabilities?.preparedGameInputs === true,
          'Worker returned a prepared-input receipt that does not match the active revision, season, source/model pins, and schedule.');
        });
      return view;
    });
  }

  async function advanceOffseasonWindow(nextWindow, { userApproved = false } = {}) {
    return enqueue('advance-offseason-window', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.offseasonWindowAdvance === true,
        'The initialized worker does not support offseason-window advancement.');
      requireValue(userApproved === true, 'Offseason-window advancement requires an explicit user action.');
      requireValue(!currentSession.pendingOffseasonApproval,
        'Resolve the saved offseason approval before advancing to another window.');
      requireValue(typeof nextWindow === 'string' && nextWindow.trim(), 'Choose the next offseason window explicitly.');
      const { view } = await commandWithSession('Offseason-window advancement', 'advance-offseason-window',
        { nextWindow }, ['offseason-window-advanced'], { nextWindow });
      return view;
    });
  }

  async function runOffseasonPhase({ window = currentSession?.leagueState?.transactionWindow,
    context = null, userApproved = false } = {}) {
    return enqueue('run-offseason-phase', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.offseasonPhaseRunner === true,
        'The initialized worker does not support an injected offseason phase executor.');
      requireValue(userApproved === true, 'Offseason phase execution requires an explicit user action.');
      requireValue(!currentSession.pendingOffseasonApproval,
        'Resolve the saved offseason approval before starting another phase.');
      requireValue(typeof window === 'string' && window === currentSession.leagueState.transactionWindow,
        'The requested offseason phase must match the active LeagueState window.');
      activeCommandId = makeCommandId('run-offseason-phase');
      const expectedRevision = currentSession.revision;
      publishProgress({ status: 'running', operation: 'run-offseason-phase', commandId: activeCommandId,
        expectedRevision, completed: 0, total: null, window });
      const result = await client.command('run-offseason-phase', { window, context: clone(context),
        userApproved: true, expectedRevision }, {
        commandId: activeCommandId, expectedRevision, onProgress: publishProgress,
      });
      requireValue(typeof result?.status === 'string' && plain(result.session),
        'Offseason phase execution did not return a status and session snapshot.');
      const verified = commitWorkerSession(result.session, currentSession.sourceReceipt, currentSession.modelReceipt);
      const savedApproval = verified.pendingOffseasonApproval;
      if (savedApproval) {
        requireValue(savedApproval.window === window && savedApproval.stateRevision === verified.leagueState.revision,
          'Offseason phase returned an unbound or stale user approval payload.');
      }
      recordAction('run-offseason-phase', result.status, { window,
        pendingApproval: clone(savedApproval ?? null), phaseResult: clone(result.result ?? null) });
      latestResult = { ...latestResult, offseasonPhase: clone(result.result ?? null) };
      return getView();
    });
  }

  async function preparePostseason({ gameInputsByGameId, postseasonSeed, playInPolicy = 'auto',
    finalsHomeCourtTeamCode = null, userApproved = false } = {}) {
    return enqueue('prepare-postseason', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.postseasonInputPreparation === true,
        'Postseason preparation requires verified closeout, finalized awards, and current model pins.');
      requireValue(userApproved === true, 'Postseason simulation requires an explicit user action.');
      requireValue(currentSession.leagueState.transactionWindow === 'season-end',
        'Postseason simulation is available only at the current season-end window.');
      requireValue(plain(gameInputsByGameId) && Object.keys(gameInputsByGameId).length > 0,
        'Supply exact caller-owned postseason matchup inputs keyed by game ID.');
      requireValue(Number.isSafeInteger(postseasonSeed) && postseasonSeed >= 0 && postseasonSeed <= 0xFFFFFFFF,
        'Supply an explicit unsigned 32-bit postseason seed.');
      const expectedRevision = currentSession.revision;
      activeCommandId = makeCommandId('prepare-postseason');
      publishProgress({ status: 'running', operation: 'prepare-postseason', commandId: activeCommandId,
        expectedRevision, completed: 0, total: null });
      const result = await client.command('prepare-postseason', {
        gameInputsByGameId: clone(gameInputsByGameId), postseasonSeed,
        playInPolicy, finalsHomeCourtTeamCode, userApproved: true, expectedRevision,
      }, { commandId: activeCommandId, expectedRevision, onProgress: publishProgress });
      requireValue(['postseason-ready-to-commit', 'blocked-requires-input'].includes(result?.status),
        `Postseason input preparation failed (worker status: ${result?.status ?? 'unknown'}).`);
      requireValue(plain(result.session) && result.session.revision === expectedRevision
        && JSON.stringify(result.session) === JSON.stringify(currentSession),
      'Postseason preparation must preserve the current session until the result is explicitly committed.');
      if (result.status === 'postseason-ready-to-commit') {
        requireValue(result.capabilities?.postseason === true
          && result.receipt?.status === 'franchise-postseason-completed'
          && result.receipt?.classification === 'development-scenario; not-certified'
          && result.receipt?.priorSessionRevision === expectedRevision
          && result.receipt?.sessionRevision === expectedRevision + 1
          && result.receipt?.seasonStartYear === currentSession.leagueState.seasonStartYear
          && JSON.stringify(result.receipt?.sourceReceipt) === JSON.stringify(currentSession.sourceReceipt)
          && JSON.stringify(result.receipt?.modelReceipt) === JSON.stringify(currentSession.modelReceipt)
          && /^[a-f0-9]{64}$/.test(result.gameInputsSha256 ?? '')
          && Array.isArray(result.gameInputGameIds) && result.gameInputGameIds.length > 0,
        'Postseason preparation returned an unbound receipt, incomplete input hash, or unavailable commit capability.');
      }
      if (plain(result.capabilities)) workerCapabilities = clone(result.capabilities);
      const action = { format: SEASON_LAB_FRANCHISE_ACTION_FORMAT,
        version: SEASON_LAB_FRANCHISE_ADAPTER_VERSION, action: 'prepare-postseason',
        status: result.status, readOnly: result.status === 'postseason-ready-to-commit',
        sessionRevision: expectedRevision, receipt: clone(result.receipt ?? null),
        postseason: clone(result.postseason ?? null), missingInputs: clone(result.missingInputs ?? []) };
      latestResult = { ...latestResult, postseasonPreparation: clone(action) };
      recordAction('prepare-postseason', result.status, { receipt: clone(result.receipt ?? null),
        missingInputs: clone(result.missingInputs ?? []) });
      return { ...action, view: getView() };
    });
  }

  async function commitPostseason({ userApproved = false } = {}) {
    return enqueue('commit-postseason', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.postseason === true,
        'There is no complete, revision-current postseason simulation ready to commit.');
      requireValue(userApproved === true, 'Committing postseason results requires explicit user approval.');
      const expectedRevision = currentSession.revision;
      const result = await client.command('commit-postseason', { expectedRevision, userApproved: true },
        { commandId: makeCommandId('commit-postseason'), expectedRevision });
      requireValue(result?.status === 'franchise-postseason-completed' && plain(result.session)
        && result.session.revision === expectedRevision + 1,
      `Postseason commit failed (worker status: ${result?.status ?? 'unknown'}).`);
      const verified = commitWorkerSession(result.session, currentSession.sourceReceipt, currentSession.modelReceipt);
      if (plain(result.capabilities)) workerCapabilities = clone(result.capabilities);
      recordAction('commit-postseason', result.status, { receipt: clone(result.receipt),
        postseason: clone(result.postseason) });
      latestResult = { ...latestResult, postseason: clone(result.postseason), postseasonReceipt: clone(result.receipt) };
      return { action: 'commit-postseason', status: result.status, receipt: clone(result.receipt),
        sessionRevision: verified.revision, view: getView() };
    });
  }

  async function resolveOffseasonApproval({ decision, context = null, userApproved = false } = {}) {
    return enqueue('resolve-offseason-approval', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.offseasonApprovalResolution === true,
        'The initialized worker does not support an injected offseason approval resolver.');
      requireValue(userApproved === true, 'Resolving an offseason approval requires an explicit user decision.');
      requireValue(currentSession.pendingOffseasonApproval
        && currentSession.pendingOffseasonApproval.stateRevision === currentSession.leagueState.revision,
      'There is no current revision-bound offseason approval to resolve.');
      requireValue(['approve', 'reject', 'counter'].includes(decision),
        'Choose approve, reject, or counter for the saved offseason proposal.');
      const expectedRevision = currentSession.revision;
      const result = await client.command('resolve-offseason-approval', {
        decision,
        context: clone(context),
        userApproved: true,
        expectedRevision,
      }, { commandId: makeCommandId('resolve-offseason-approval'), expectedRevision });
      requireValue(typeof result?.status === 'string' && plain(result.session),
        `Offseason approval resolution did not return a session (worker status: ${result?.status ?? 'unknown'}).`);
      requireValue(result.session.revision === expectedRevision + 1
        && result.session.leagueState?.seasonStartYear === currentSession.leagueState.seasonStartYear
        && result.session.leagueState?.transactionWindow === currentSession.leagueState.transactionWindow,
      'Offseason approval resolution returned a stale or out-of-window session.');
      const pending = result.session.pendingOffseasonApproval;
      requireValue(!pending || pending.stateRevision === result.session.leagueState.revision,
        'Offseason approval resolution returned a stale pending decision.');
      const verified = commitWorkerSession(result.session, currentSession.sourceReceipt, currentSession.modelReceipt);
      if (plain(result.capabilities)) workerCapabilities = clone(result.capabilities);
      recordAction('resolve-offseason-approval', result.status, { decision,
        pendingApproval: clone(verified.pendingOffseasonApproval ?? null),
        decisionResult: clone(result.result ?? null) });
      return getView();
    });
  }

  async function createFutureScenarioSourceReceipt({ targetSeasonStartYear, scenarioId,
    projectionReceipt = null, scheduleState = null } = {}) {
    return enqueue('create-future-source-receipt', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.futureScenarioSourceReceipt === true,
        'The initialized worker does not support future scenario source receipts.');
      requireValue(Number.isInteger(targetSeasonStartYear)
        && targetSeasonStartYear > currentSession.leagueState.seasonStartYear,
      'Choose a future season start year.');
      const expectedRevision = currentSession.revision;
      const result = await client.command('create-future-source-receipt', {
        targetSeasonStartYear, scenarioId, projectionReceipt: clone(projectionReceipt),
        scheduleState: clone(scheduleState), expectedRevision,
      }, { commandId: makeCommandId('create-future-source-receipt'), expectedRevision });
      requireCommandResult(result, 'future-source-receipt-created', 'Future source receipt creation');
      requireValue(result.session?.revision === expectedRevision
        && JSON.stringify(result.session) === JSON.stringify(currentSession),
      'Future source receipt creation changed the active session.');
      const receipt = result.sourceReceipt;
      requireValue(plain(receipt) && receipt.seasonStartYear === targetSeasonStartYear
        && receipt.sourceClass === 'generated-scenario'
        && /^[a-f0-9]{64}$/i.test(receipt.packageManifestSha256 ?? ''),
      'Future source receipt is incomplete or does not identify a generated scenario.');
      const action = { format: SEASON_LAB_FRANCHISE_ACTION_FORMAT,
        version: SEASON_LAB_FRANCHISE_ADAPTER_VERSION, action: 'create-future-source-receipt',
        status: result.status, readOnly: true, sessionRevision: expectedRevision,
        sourceReceipt: clone(receipt) };
      latestResult = clone(action);
      return { ...action, view: getView() };
    });
  }

  async function advanceToNextSeason({ nextSourceReceipt = null, nextModelReceipt = null,
    nextSeasonOptions = {}, userApproved = false } = {}) {
    return enqueue('advance-next-season', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.seasonRollover === true,
        'The initialized worker does not support next-season advancement.');
      requireValue(userApproved === true, 'Next-season advancement requires explicit user approval.');
      requireValue(!currentSession.pendingOffseasonApproval,
        'Resolve the saved offseason approval before advancing the Franchise season.');
      requireValue(currentSession.leagueState.transactionWindow === 'season-end',
        'Close the completed season before starting the next season.');
      const expectedRevision = currentSession.revision;
      const sourceSeasonStartYear = currentSession.leagueState.seasonStartYear;
      const userTeamCode = teamCode(currentSession.leagueState.userControlledTeamCodes?.[0]);
      const result = await client.command('advance-next-season', {
        expectedRevision, nextSourceReceipt: clone(nextSourceReceipt), nextModelReceipt: clone(nextModelReceipt),
        nextSeasonOptions: clone(nextSeasonOptions),
      }, { commandId: makeCommandId('advance-next-season'), expectedRevision });
      requireValue(result?.status === 'next-season-preseason-ready' && plain(result.session),
        `Next-season advancement did not complete (worker status: ${result?.status ?? 'unknown'}).`);
      requireValue(result.session.revision === expectedRevision + 1
        && result.session.leagueState?.seasonStartYear === sourceSeasonStartYear + 1
        && result.session.leagueState?.transactionWindow === 'preseason'
        && result.session.scheduleCursor === 0
        && teamCode(result.session.leagueState?.userControlledTeamCodes?.[0]) === userTeamCode
        && result.receipt?.sourceSessionRevision === expectedRevision
        && result.receipt?.targetSessionRevision === result.session.revision
        && result.receipt?.targetSeasonStartYear === sourceSeasonStartYear + 1,
      'Next-season advancement returned an unbound or invalid transition receipt.');
      const verified = commitWorkerSession(result.session, result.session.sourceReceipt, result.session.modelReceipt);
      if (plain(result.capabilities)) workerCapabilities = clone(result.capabilities);
      recordAction('advance-next-season', result.status, { receipt: clone(result.receipt),
        seasonTransition: clone(result.seasonTransition ?? null), projectionReceipt: clone(result.projectionReceipt ?? null) });
      latestResult = { ...latestResult, seasonTransition: clone(result.receipt) };
      return getView();
    });
  }

  async function verifySeasonCompletion() {
    return enqueue('verify-season-completion', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.seasonCompletion === true,
        'The initialized worker does not support season completion verification.');
      const sessionBefore = serializeFranchiseBrowserCheckpoint(currentSession);
      const result = await client.command('verify-season-completion', {
        expectedRevision: currentSession.revision,
      }, { commandId: makeCommandId('verify-season-completion'), expectedRevision: currentSession.revision });
      if (!result?.session) {
        closeWorkerClient();
        throw new Error('Season completion verification omitted its read-only session snapshot; the worker was closed and the prior view was preserved.');
      }
      let returnedSession;
      try {
        returnedSession = restoreFranchiseBrowserCheckpointObject(result.session, {
          expectedSourceReceipt: currentSession.sourceReceipt,
          expectedModelReceipt: currentSession.modelReceipt,
        });
        requireValue(serializeFranchiseBrowserCheckpoint(returnedSession) === sessionBefore,
          'Season completion verification changed franchise state.');
      } catch (error) {
        closeWorkerClient();
        throw new Error(`Season completion verification returned an invalid or changed session; the worker was closed and the prior view was preserved. ${error.message}`,
          { cause: error });
      }
      requireCommandResult(result, 'season-games-complete', 'Season completion verification');
      const completion = result.completion;
      const scheduleKind = completion?.scheduleKind;
      const expectedStatus = scheduleKind === 'standard-season'
        ? 'standard-schedule-complete'
        : scheduleKind === 'labeled-scenario' ? 'scenario-schedule-complete' : null;
      const scenarioMetadataValid = scheduleKind === 'standard-season'
        ? completion?.scenarioMetadata === null
        : plain(completion?.scenarioMetadata)
          && ['generated-scenario', 'user-scenario'].includes(completion.scenarioMetadata.sourceClass)
          && typeof completion.scenarioMetadata.label === 'string'
          && completion.scenarioMetadata.label.trim().length >= 3;
      requireValue(completion?.format === FRANCHISE_SEASON_COMPLETION_FORMAT
        && completion.version === FRANCHISE_SEASON_COMPLETION_VERSION
        && completion.scheduleComplete === true
        && completion.seasonStartYear === currentSession.leagueState.seasonStartYear
        && expectedStatus !== null
        && completion.status === expectedStatus
        && scenarioMetadataValid
        && Number.isSafeInteger(completion.scheduledGameCount) && completion.scheduledGameCount > 0
        && completion.completedGameCount === completion.scheduledGameCount
        && /^[a-f0-9]{64}$/.test(completion.canonicalScheduleSha256 ?? ''),
      'Season completion verification returned an incomplete or unsupported completion receipt.');
      const action = {
        format: SEASON_LAB_FRANCHISE_ACTION_FORMAT,
        version: SEASON_LAB_FRANCHISE_ADAPTER_VERSION,
        action: 'verify-season-completion',
        status: 'verified',
        workerStatus: result.status,
        readOnly: true,
        seasonStartYear: currentSession.leagueState.seasonStartYear,
        sessionRevision: currentSession.revision,
        completion: clone(completion),
      };
      latestResult = clone(action);
      verifiedSeasonCompletion = {
        sessionRevision: currentSession.revision,
        completion: clone(completion),
      };
      return { ...action, view: getView() };
    });
  }

  async function closeRegularSeason() {
    return enqueue('close-regular-season', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.seasonEndTransition === true,
        'The initialized worker does not support the versioned regular-season closeout transition.');
      requireValue(currentSession.leagueState.transactionWindow === 'games',
        'Regular-season closeout is only available from the games window.');
      requireValue(currentSession.scheduleCursor === currentSession.schedule.length && currentSession.schedule.length > 0,
        'Finish the canonical regular-season schedule before closeout.');
      requireValue(verifiedSeasonCompletion?.sessionRevision === currentSession.revision
        && plain(verifiedSeasonCompletion.completion),
      'Verify season completion against the exact current session before closeout.');
      const expectedRevision = currentSession.revision;
      const completionReceipt = clone(verifiedSeasonCompletion.completion);
      const result = await client.command('close-regular-season', {
        expectedRevision,
        completionSessionRevision: expectedRevision,
        completionReceipt,
      }, { commandId: makeCommandId('close-regular-season'), expectedRevision });
      requireCommandResult(result, 'regular-season-closed', 'Regular-season closeout');
      requireValue(plain(result.session) && result.session.revision === expectedRevision + 1
        && result.session.leagueState?.transactionWindow === 'season-end',
      'Regular-season closeout returned an invalid season-end session.');
      requireValue(plain(result.handoffReceipt)
        && result.handoffReceipt.status === 'regular-season-closed'
        && result.handoffReceipt.priorSessionRevision === expectedRevision
        && result.handoffReceipt.sessionRevision === result.session.revision,
      'Regular-season closeout omitted its revision-bound handoff receipt.');
      requireValue(JSON.stringify(result.completion) === JSON.stringify(completionReceipt),
        'Regular-season closeout returned a completion receipt that does not match the verified session.');
      const verified = commitWorkerSession(result.session, currentSession.sourceReceipt, currentSession.modelReceipt);
      const recordedReceipt = verified.leagueState?.franchiseLifecycleReceiptsBySeason?.[String(verified.leagueState.seasonStartYear)];
      requireValue(recordedReceipt?.receiptSha256 === result.handoffReceipt.receiptSha256,
        'The closed franchise session does not retain the returned handoff receipt.');
      if (plain(result.capabilities)) workerCapabilities = clone(result.capabilities);
      recordAction('close-regular-season', result.status, {
        handoffReceipt: clone(result.handoffReceipt), completion: clone(result.completion),
      });
      return getView();
    });
  }

  async function finalizeSeasonAwards({ awardsSeed, awardsPolicy = null, userApproved = false } = {}) {
    return enqueue('finalize-season-awards', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.seasonAwardsFinalization === true,
        'The initialized worker does not support simulated season-awards finalization.');
      requireValue(userApproved === true, 'Recording simulated season awards requires explicit user approval.');
      requireValue(Number.isSafeInteger(awardsSeed) && awardsSeed >= 0 && awardsSeed <= 0xFFFFFFFF,
        'Supply an explicit unsigned 32-bit awards seed.');
      requireValue(awardsPolicy === null || plain(awardsPolicy),
        'Awards policy must be a plain record when supplied.');
      const seasonStartYear = currentSession.leagueState.seasonStartYear;
      const yearKey = String(seasonStartYear);
      const closeout = currentSession.leagueState.franchiseLifecycleReceiptsBySeason?.[yearKey];
      requireValue(currentSession.leagueState.transactionWindow === 'season-end'
        && currentSession.schedule.length > 0 && currentSession.scheduleCursor === currentSession.schedule.length
        && closeout?.status === 'regular-season-closed' && closeout.seasonStartYear === seasonStartYear
        && plain(closeout.completionReceipt) && /^[a-f0-9]{64}$/.test(closeout.receiptSha256 ?? ''),
      'Season-awards finalization requires the current verified regular-season closeout receipt.');

      const expectedRevision = currentSession.revision;
      activeCommandId = makeCommandId('finalize-season-awards');
      publishProgress({ status: 'running', operation: 'finalize-season-awards', commandId: activeCommandId,
        expectedRevision, completed: 0, total: null });
      const result = await client.command('finalize-season-awards', {
        expectedRevision, awardsSeed, awardsPolicy: clone(awardsPolicy), userApproved: true,
      }, { commandId: activeCommandId, expectedRevision, onProgress: publishProgress });
      const successStatuses = ['season-awards-finalized', 'season-awards-already-finalized'];
      if (!successStatuses.includes(result?.status)) {
        closeWorkerClient();
        throw new Error(`Season-awards finalization did not complete (worker status: ${result?.status ?? 'unknown'}).`);
      }

      const replay = result.idempotentReplay === true;
      const expectedStatus = replay ? 'season-awards-already-finalized' : 'season-awards-finalized';
      const expectedSessionRevision = replay ? expectedRevision : expectedRevision + 1;
      const expectedLeagueRevision = replay ? currentSession.leagueState.revision : currentSession.leagueState.revision + 1;
      const receipt = result.receipt;
      const returnedSession = result.session;
      const savedRecord = returnedSession?.leagueState?.awardHistoryBySeason?.[yearKey] ?? null;
      const savedReceipt = savedRecord?.finalizationReceipt ?? null;
      try {
        requireValue(result.format === 'djhc-franchise-season-awards-finalize-v1'
          && result.version === '1.0.0' && result.status === expectedStatus,
        'Finalization returned an unsupported result envelope.');
        requireValue(plain(returnedSession), 'Finalization omitted its franchise session.');
        requireValue(returnedSession.revision === expectedSessionRevision
          && returnedSession.leagueState?.revision === expectedLeagueRevision,
        'Finalization returned a stale or unexpected session/LeagueState revision.');
        requireValue(returnedSession.leagueState?.seasonStartYear === seasonStartYear
          && returnedSession.leagueState?.transactionWindow === 'season-end'
          && returnedSession.scheduleCursor === currentSession.scheduleCursor,
        'Finalization returned a session outside the current season-end boundary.');
        requireValue(teamCode(returnedSession.leagueState?.userControlledTeamCodes?.[0])
          === teamCode(currentSession.leagueState?.userControlledTeamCodes?.[0]),
        'Finalization changed the user-controlled team.');
        requireValue(sameJsonValue(returnedSession.sourceReceipt, currentSession.sourceReceipt)
          && sameJsonValue(returnedSession.modelReceipt, currentSession.modelReceipt),
        'Finalization changed the pinned source or model receipts.');
        requireValue(plain(receipt)
          && receipt.format === 'djhc-franchise-season-awards-finalize-v1' && receipt.version === '1.0.0'
          && receipt.previewFeatureFlag === 'seasonAwardsFinalizeV1'
          && receipt.classification === 'development-scenario; not-certified'
          && receipt.status === 'season-awards-finalized' && receipt.seasonStartYear === seasonStartYear
          && Number.isSafeInteger(receipt.priorSessionRevision)
          && receipt.sessionRevision === receipt.priorSessionRevision + 1
          && (replay ? receipt.sessionRevision <= expectedRevision
            : receipt.priorSessionRevision === expectedRevision && receipt.sessionRevision === expectedSessionRevision)
          && Number.isSafeInteger(receipt.priorLeagueStateRevision)
          && receipt.leagueStateRevision === receipt.priorLeagueStateRevision + 1
          && (replay ? receipt.leagueStateRevision <= expectedLeagueRevision
            : receipt.priorLeagueStateRevision === currentSession.leagueState.revision
              && receipt.leagueStateRevision === expectedLeagueRevision)
          && sameJsonValue(receipt.sourceReceipt, currentSession.sourceReceipt)
          && sameJsonValue(receipt.modelReceipt, currentSession.modelReceipt)
          && receipt.canonicalScheduleSha256 === closeout.canonicalScheduleSha256
          && receipt.handoffReceiptSha256 === closeout.receiptSha256
          && receipt.awardsSeed === awardsSeed
          && receipt.allStarSelectionTiming === 'end-of-season-modeled-selection'
          && /^[a-f0-9]{64}$/.test(receipt.receiptSha256 ?? '')
          && /^[a-f0-9]{64}$/.test(receipt.completionReceiptSha256 ?? '')
          && /^[a-f0-9]{64}$/.test(receipt.historyRecordSha256 ?? '')
          && /^[a-f0-9]{64}$/.test(receipt.inputKeySha256 ?? ''),
        'Finalization returned an unbound, incomplete, or unsupported awards receipt.');
        requireValue(plain(savedRecord) && sameJsonValue(savedRecord, result.historyRecord)
          && sameJsonValue(savedReceipt, receipt)
          && Array.isArray(returnedSession.actionHistory)
          && returnedSession.actionHistory.filter(row => row.kind === 'finalize-season-awards'
            && row.seasonStartYear === seasonStartYear).length === 1
          && plain(result.awards),
        'Finalized awards history does not match the returned receipt.');
      } catch (error) {
        closeWorkerClient();
        throw new Error(`Season-awards finalization returned an invalid receipt; the worker was closed and the prior view was preserved. ${error.message}`,
          { cause: error });
      }

      const verified = commitWorkerSession(returnedSession, currentSession.sourceReceipt, currentSession.modelReceipt);
      if (plain(result.capabilities)) workerCapabilities = clone(result.capabilities);
      const action = {
        format: SEASON_LAB_FRANCHISE_ACTION_FORMAT,
        version: SEASON_LAB_FRANCHISE_ADAPTER_VERSION,
        action: 'finalize-season-awards',
        status: result.status,
        idempotentReplay: replay,
        readOnly: replay,
        seasonStartYear,
        sessionRevision: verified.revision,
        receipt: clone(receipt),
        historyRecord: clone(result.historyRecord),
        awards: clone(result.awards),
      };
      recordAction('finalize-season-awards', result.status, { receipt: clone(receipt), idempotentReplay: replay });
      latestResult = clone(action);
      return { ...action, view: getView() };
    });
  }

  async function evaluateTransaction(proposal) {
    return enqueue('evaluate-transaction', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.transactions === true, 'The initialized worker does not support transactions.');
      const expectedRevision = currentSession.revision;
      const result = await client.command('evaluate-transaction', {
        proposal: clone(proposal), expectedRevision,
      }, { commandId: makeCommandId('evaluate-transaction'), expectedRevision });
      requireCommandResult(result, 'evaluated', 'Transaction evaluation');
      const proposalId = String(proposal?.proposalId ?? '');
      const evaluation = clone(result.evaluation ?? null);
      const approvedTeamCodes = (evaluation?.userApprovalRequired === true
        || evaluation?.affectedTeamCodes?.some(code => currentSession.leagueState.userControlledTeamCodes?.includes(code)))
        ? clone(currentSession.leagueState.userControlledTeamCodes ?? []) : [];
      pendingApproval = {
        proposalId,
        expectedRevision,
        approvalRequired: true,
        status: 'awaiting-explicit-user-approval',
        evaluationStatus: evaluation?.status ?? 'unknown',
        userControlledTeamCodes: approvedTeamCodes,
      };
      recordAction('evaluate-transaction', 'approval-required', { proposal: clone(proposal),
        evaluation, pendingApproval: clone(pendingApproval) });
      return getView();
    });
  }

  async function executeTransaction(proposal, { userApproved = false, allowProvisionalSandbox = false } = {}) {
    return enqueue('execute-transaction', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.transactions === true, 'The initialized worker does not support transactions.');
      requireValue(userApproved === true, 'Transaction execution requires explicit user approval.');
      requireValue(typeof allowProvisionalSandbox === 'boolean', 'Provisional Sandbox choice must be explicit boolean state.');
      requireValue(pendingApproval?.proposalId === proposal?.proposalId
        && pendingApproval.expectedRevision === currentSession.revision,
      'This proposal has no current revision-bound approval review. Evaluate it again before approving.');
      const result = await client.command('execute-transaction', { proposal: clone(proposal),
        expectedRevision: currentSession.revision, userApproved: true, allowProvisionalSandbox },
      { commandId: makeCommandId('execute-transaction'), expectedRevision: currentSession.revision });
      requireCommandResult(result, 'committed', 'Approved transaction');
      requireValue(result.session, 'Committed transaction omitted its session snapshot.');
      commitWorkerSession(result.session, currentSession.sourceReceipt, currentSession.modelReceipt);
      pendingApproval = null;
      const details = Object.fromEntries(Object.entries(result).filter(([key]) => !['session', 'state'].includes(key)));
      recordAction('execute-transaction', result.status, details);
      return getView();
    });
  }

  async function getVerifiedSnapshot() {
    assertInitialized();
    const result = await client.command('snapshot', { expectedRevision: currentSession.revision },
      { commandId: makeCommandId('snapshot'), expectedRevision: currentSession.revision });
    requireCommandResult(result, 'snapshot', 'Worker snapshot');
    requireValue(result.session, 'Worker snapshot omitted its session.');
    return commitWorkerSession(result.session, currentSession.sourceReceipt, currentSession.modelReceipt);
  }

  async function save() {
    return enqueue('save', async () => {
      const session = await getVerifiedSnapshot();
      const selectedTeam = teamCode(session.leagueState.userControlledTeamCodes?.[0]);
      requireValue(selectedTeam, 'The active session has no user-controlled team for its save namespace.');
      let result;
      if (checkpointStore) {
        result = await checkpointStore.save(session, { userTeamCode: selectedTeam });
        requireValue(result?.status === 'checkpoint-saved', 'IndexedDB did not confirm the franchise checkpoint.');
      } else {
        requireValue(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function',
          'No supported browser checkpoint storage is available.');
        const key = franchiseBrowserStorageKey(session.sourceReceipt, selectedTeam);
        result = saveFranchiseBrowserSession(storage, key, session);
      }
      recordAction('save', result.status, clone(result));
      return getView();
    });
  }

  async function exportSave() {
    return enqueue('export', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.saves === true, 'The initialized worker does not support portable saves.');
      const result = await client.command('export', { expectedRevision: currentSession.revision },
        { commandId: makeCommandId('export'), expectedRevision: currentSession.revision });
      requireCommandResult(result, 'exported', 'Save export');
      requireValue(typeof result.saveText === 'string', 'Worker export omitted save text.');
      const restored = restoreFranchiseBrowserCheckpoint(result.saveText, {
        expectedSourceReceipt: currentSession.sourceReceipt,
        expectedModelReceipt: currentSession.modelReceipt,
      });
      requireValue(restored.revision === currentSession.revision, 'Exported save revision differs from the verified session.');
      recordAction('export', result.status, { revision: restored.revision, characters: result.saveText.length });
      return { saveText: result.saveText, view: getView() };
    });
  }

  async function importSave(saveText) {
    return enqueue('import', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.saves === true, 'The initialized worker does not support save imports.');
      // Parse and pin-check the native checkpoint before dispatch. There is no
      // wrapper, old Studio format, or implicit migration path here.
      restoreFranchiseBrowserCheckpoint(saveText, {
        expectedSourceReceipt: currentSession.sourceReceipt,
        expectedModelReceipt: currentSession.modelReceipt,
      });
      const result = await client.command('restore', { saveText, expectedRevision: currentSession.revision },
        { commandId: makeCommandId('restore'), expectedRevision: currentSession.revision });
      requireCommandResult(result, 'restored', 'Save import');
      requireValue(result.session, 'Worker restore omitted its session snapshot.');
      commitWorkerSession(result.session, currentSession.sourceReceipt, currentSession.modelReceipt);
      recordAction('import', result.status, { revision: currentSession.revision });
      return getView();
    });
  }

  async function restore() {
    return enqueue('restore', async () => {
      assertInitialized();
      requireValue(workerCapabilities?.saves === true, 'The initialized worker does not support local restore.');
      const selectedTeam = teamCode(currentSession.leagueState.userControlledTeamCodes?.[0]);
      let loaded;
      if (checkpointStore) {
        loaded = await checkpointStore.load({ sourceReceipt: currentSession.sourceReceipt,
          userTeamCode: selectedTeam, expectedModelReceipt: currentSession.modelReceipt });
        requireValue(plain(loaded?.session), 'IndexedDB did not return a verified checkpoint session.');
        restoreFranchiseBrowserCheckpointObject(loaded.session, {
          expectedSourceReceipt: currentSession.sourceReceipt,
          expectedModelReceipt: currentSession.modelReceipt,
        });
      } else {
        requireValue(storage && typeof storage.getItem === 'function', 'No supported browser checkpoint storage is available.');
        const key = franchiseBrowserStorageKey(currentSession.sourceReceipt, selectedTeam);
        const saveText = storage.getItem(key);
        requireValue(typeof saveText === 'string', 'No saved franchise checkpoint exists for the current source/team namespace.');
        const localSaveSession = restoreFranchiseBrowserSession(saveText, {
          expectedSourceReceipt: currentSession.sourceReceipt,
          expectedModelReceipt: currentSession.modelReceipt,
        });
        const result = await client.command('restore-session', { session: localSaveSession,
          expectedRevision: currentSession.revision },
        { commandId: makeCommandId('restore-session'), expectedRevision: currentSession.revision });
        requireCommandResult(result, 'restored', 'Local save restore');
        requireValue(result.session, 'Worker restore omitted its session snapshot.');
        commitWorkerSession(result.session, currentSession.sourceReceipt, currentSession.modelReceipt);
        recordAction('restore', result.status, { revision: currentSession.revision });
        return getView();
      }
      const result = await client.command('restore-session', { session: loaded.session,
        expectedRevision: currentSession.revision },
      { commandId: makeCommandId('restore-session'), expectedRevision: currentSession.revision });
      requireCommandResult(result, 'restored', 'IndexedDB checkpoint restore');
      requireValue(result.session, 'Worker restore omitted its session snapshot.');
      commitWorkerSession(result.session, currentSession.sourceReceipt, currentSession.modelReceipt);
      recordAction('restore', result.status, { revision: currentSession.revision,
        checkpointStatus: loaded.status ?? null });
      return getView();
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    activeOperation = null;
    try { client?.dispose(); } finally { client = null; }
  }

  function cancelActiveCommand() {
    assertLive();
    if (!activeCommandId || !client || typeof client.cancel !== 'function') return false;
    return client.cancel(activeCommandId);
  }

  function subscribeProgress(listener) {
    assertLive();
    requireValue(typeof listener === 'function', 'Progress listener must be a function.');
    progressListeners.add(listener);
    return () => progressListeners.delete(listener);
  }

  return Object.freeze({
    initialize,
    getView,
    setRotation,
    nextGame: () => advance('next-game'),
    nextUserGame: () => advance('next-user-game'),
    runRemainingSchedule: () => advance('run-remaining-schedule'),
    loadGameInputBundle,
    advanceOffseasonWindow,
    runOffseasonPhase,
    preparePostseason,
    commitPostseason,
    resolveOffseasonApproval,
    advanceToNextSeason,
    createFutureScenarioSourceReceipt,
    cancelActiveCommand,
    subscribeProgress,
    verifySeasonCompletion,
    closeRegularSeason,
    finalizeSeasonAwards,
    save,
    restore,
    exportSave,
    importSave,
    evaluateTransaction,
    executeTransaction,
    dispose,
  });
}
