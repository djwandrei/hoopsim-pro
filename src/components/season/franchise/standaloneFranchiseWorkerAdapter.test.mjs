import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  createStandaloneFranchiseWorkerAdapter,
  validateStandaloneNextSeasonAdvance,
  validateStandaloneOffseasonApproval,
  validateStandaloneOffseasonPhase,
  validateStandaloneOffseasonWindowAdvance,
  validateStandalonePostseasonCommit,
  validateStandalonePostseasonPreparation,
  validateStandaloneRotationRefresh,
  validateStandaloneSeasonAwardsFinalization,
  validateStandaloneTransactionCommit,
  validateStandaloneTransactionEvaluation,
} from './standaloneFranchiseWorkerAdapter.js';

const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort(compareText).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
async function sha256(value) {
  const bytes = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function validAwardsFinalization() {
  const seasonStartYear = 2024;
  const awardsSeed = 18;
  const sourceReceipt = { sourceId: 'standalone-fixture', seasonStartYear };
  const modelReceipt = { gameModelId: 'game-model-v1', productionId: 'production-v1' };
  const closeoutReceipt = {
    status: 'regular-season-closed', seasonStartYear, sessionRevision: 5, leagueStateRevision: 5,
    receiptSha256: 'a'.repeat(64), canonicalScheduleSha256: 'b'.repeat(64),
    completionReceipt: { scheduleComplete: true, seasonStartYear, scheduledGameCount: 1, completedGameCount: 1 },
  };
  const currentSession = {
    revision: 5,
    sourceReceipt,
    modelReceipt,
    schedule: [{ gameId: 'fixture-game-1' }],
    scheduleCursor: 1,
    actionHistory: [],
    leagueState: {
      revision: 5,
      seasonStartYear,
      transactionWindow: 'season-end',
      franchiseLifecycleReceiptsBySeason: { [String(seasonStartYear)]: closeoutReceipt },
      awardHistoryBySeason: {},
    },
  };
  const compactHistory = {
    seasonStartYear,
    status: 'simulated-season-awards',
    policyId: 'fixture-awards-policy-v1',
    seed: awardsSeed,
    mvp: { canonicalName: 'A. Player', teamCode: 'MIN', status: 'simulated-vote' },
    defensivePlayerOfTheYear: { canonicalName: 'B. Player', teamCode: 'MIN', status: 'simulated-vote' },
    allNba: [], allDefensive: [], allRookie: [], allStar: [],
    allStarSelectionTiming: 'end-of-season-modeled-selection',
  };
  const awards = {
    format: 'djhc-season-awards-simulation-v1',
    seasonStartYear,
    seed: awardsSeed,
    policyId: compactHistory.policyId,
    modelId: 'djhc-simulated-season-awards-v1',
    historyRecord: compactHistory,
  };
  const historyRecordSha256 = await sha256(canonicalJson(compactHistory));
  const completionReceiptSha256 = await sha256(canonicalJson(closeoutReceipt.completionReceipt));
  const inputKey = {
    format: 'djhc-franchise-season-awards-finalize-v1',
    version: '1.0.0',
    seasonStartYear,
    sourceReceipt,
    modelReceipt,
    completionReceiptSha256,
    canonicalScheduleSha256: closeoutReceipt.canonicalScheduleSha256,
    handoffReceiptSha256: closeoutReceipt.receiptSha256,
    awardsSeed,
    awardsPolicyId: awards.policyId,
    awardsModelId: awards.modelId,
    historyRecordSha256,
  };
  const unsignedReceipt = {
    format: 'djhc-franchise-season-awards-finalize-v1',
    version: '1.0.0',
    previewFeatureFlag: 'seasonAwardsFinalizeV1',
    classification: 'development-scenario; not-certified',
    status: 'season-awards-finalized',
    seasonStartYear,
    priorSessionRevision: 5,
    sessionRevision: 6,
    priorLeagueStateRevision: 5,
    leagueStateRevision: 6,
    sourceReceipt,
    modelReceipt,
    completionReceiptSha256,
    canonicalScheduleSha256: closeoutReceipt.canonicalScheduleSha256,
    scheduledGameCount: 1,
    completedGameCount: 1,
    handoffReceiptSha256: closeoutReceipt.receiptSha256,
    inputKeySha256: await sha256(canonicalJson(inputKey)),
    historyRecordSha256,
    awardsSeed,
    awardsPolicyId: awards.policyId,
    awardsModelId: awards.modelId,
    stateQuality: null,
    provisionalState: true,
    allStarSelectionTiming: 'end-of-season-modeled-selection',
    disclosure: 'Simulated awards output.',
  };
  const receipt = { ...unsignedReceipt, receiptSha256: await sha256(canonicalJson(unsignedReceipt)) };
  const savedRecord = { ...compactHistory, finalizationReceipt: receipt };
  const session = structuredClone(currentSession);
  session.revision = 6;
  session.leagueState.revision = 6;
  session.leagueState.awardHistoryBySeason[String(seasonStartYear)] = savedRecord;
  session.actionHistory.push({
    revision: 6,
    kind: 'finalize-season-awards',
    seasonStartYear,
    finalizationReceiptSha256: receipt.receiptSha256,
    canonicalScheduleSha256: closeoutReceipt.canonicalScheduleSha256,
    handoffReceiptSha256: closeoutReceipt.receiptSha256,
  });
  return {
    currentSession,
    result: {
      format: 'djhc-franchise-season-awards-finalize-v1',
      version: '1.0.0',
      status: 'season-awards-finalized',
      idempotentReplay: false,
      session,
      receipt,
      historyRecord: savedRecord,
      awards,
    },
    awardsSeed,
  };
}

test('standalone Franchise Lab controls retain their worker command and payload contract', async () => {
  const calls = [];
  let initialized;
  let disposed = false;
  const client = {
    initialize: async sessionInput => { initialized = sessionInput; return { status: 'initialized' }; },
    command: async (type, payload) => { calls.push([type, payload]); return { status: type }; },
    dispose: () => { disposed = true; },
  };
  const worker = createStandaloneFranchiseWorkerAdapter(client);
  const sessionInput = { session: true };
  const rotation = { expectedRevision: 3, teamCode: 'MIN', controls: [] };
  const closeout = { expectedRevision: 8, completionSessionRevision: 8, completionReceipt: { valid: true } };
  const awardsFinalization = { expectedRevision: 9, awardsSeed: 17, awardsPolicy: null, userApproved: true };

  await worker.initialize(sessionInput);
  await worker.saveRotation(rotation);
  await worker.advanceNextGame(4);
  await worker.advanceNextUserGame(5);
  await worker.verifySeasonCompletion(6);
  await worker.closeRegularSeason(closeout);
  await worker.finalizeSeasonAwards(awardsFinalization);
  await worker.exportSave();
  await worker.importSave('save-json');
  await worker.restoreSession({ revision: 2 });
  worker.dispose();

  assert.equal(initialized, sessionInput);
  assert.deepEqual(calls, [
    ['rotation', rotation],
    ['next-game', { expectedRevision: 4 }],
    ['next-user-game', { expectedRevision: 5 }],
    ['verify-season-completion', { expectedRevision: 6 }],
    ['close-regular-season', closeout],
    ['finalize-season-awards', awardsFinalization],
    ['export', {}],
    ['restore', { saveText: 'save-json' }],
    ['restore-session', { session: { revision: 2 } }],
  ]);
  assert.equal(disposed, true);
  assert.equal(Object.isFrozen(worker), true);
});

test('standalone award finalization rejects missing approval and malformed seeds', async () => {
  const worker = createStandaloneFranchiseWorkerAdapter({
    initialize: async () => ({ status: 'initialized' }),
    command: async () => ({ status: 'ok' }),
  });
  assert.throws(() => worker.finalizeSeasonAwards({ expectedRevision: 2, awardsSeed: 1 }), /explicit user approval/);
  assert.throws(() => worker.finalizeSeasonAwards({ expectedRevision: 2, awardsSeed: 1.5, userApproved: true }), /unsigned 32-bit/);
});

test('standalone award finalization verifies the worker receipt, pinned history, and SHA-256 bindings', async () => {
  const fixture = await validAwardsFinalization();
  const validated = await validateStandaloneSeasonAwardsFinalization({
    ...fixture,
    cryptoProvider: webcrypto,
  });
  assert.equal(validated.revision, 6);
  assert.equal(validated.leagueState.awardHistoryBySeason['2024'].finalizationReceipt.receiptSha256,
    fixture.result.receipt.receiptSha256);

  const altered = structuredClone(fixture.result);
  altered.receipt.handoffReceiptSha256 = 'f'.repeat(64);
  await assert.rejects(validateStandaloneSeasonAwardsFinalization({
    ...fixture,
    result: altered,
    cryptoProvider: webcrypto,
  }), /unbound, incomplete, or unsupported receipt/);
});

test('standalone transaction adapter binds evaluation and explicit execution commands', async () => {
  const calls = [];
  const worker = createStandaloneFranchiseWorkerAdapter({
    initialize: async () => ({ status: 'initialized' }),
    command: async (type, payload) => { calls.push([type, payload]); return { status: type }; },
  });
  const proposal = { proposalId: 'waive-r1-min-player', kind: 'roster-move', seasonStartYear: 2024,
    transactionWindow: 'free-agency', expectedStateRevision: 7, legs: [{ canonicalName: 'A. Player', action: 'waive' }] };
  await worker.evaluateTransaction(proposal);
  await worker.executeTransaction({ proposal, expectedRevision: 9, userApproved: true, allowProvisionalSandbox: false });
  assert.deepEqual(calls, [
    ['evaluate-transaction', { proposal }],
    ['execute-transaction', { proposal, expectedRevision: 9, userApproved: true, allowProvisionalSandbox: false }],
  ]);
  assert.throws(() => worker.executeTransaction({ proposal, expectedRevision: 9, userApproved: false, allowProvisionalSandbox: false }), /explicit approval/);
});

test('standalone lifecycle adapter binds approved commands to exact payloads', async () => {
  const calls = [];
  const worker = createStandaloneFranchiseWorkerAdapter({
    initialize: async () => ({ status: 'initialized' }),
    command: async (type, payload) => { calls.push([type, payload]); return { status: type }; },
  });
  const commands = [
    ['prepare-postseason', { expectedRevision: 4, userApproved: true, postseasonSeed: 9, playInPolicy: 'auto' },
      () => worker.preparePostseason({ expectedRevision: 4, userApproved: true, postseasonSeed: 9, playInPolicy: 'auto' })],
    ['commit-postseason', { expectedRevision: 5, userApproved: true },
      () => worker.commitPostseason({ expectedRevision: 5, userApproved: true })],
    ['advance-next-season', { expectedRevision: 6, userApproved: true },
      () => worker.advanceNextSeason({ expectedRevision: 6, userApproved: true })],
    ['advance-offseason-window', { expectedRevision: 7, nextWindow: 'draft' },
      () => worker.advanceOffseasonWindow({ expectedRevision: 7, nextWindow: 'draft' })],
    ['run-offseason-phase', { expectedRevision: 8, userApproved: true, window: 'free-agency' },
      () => worker.runOffseasonPhase({ expectedRevision: 8, userApproved: true, window: 'free-agency' })],
    ['resolve-offseason-approval', { expectedRevision: 9, userApproved: true, decision: 'reject' },
      () => worker.resolveOffseasonApproval({ expectedRevision: 9, userApproved: true, decision: 'reject' })],
  ];
  for (const [, , invoke] of commands) await invoke();
  assert.deepEqual(calls, commands.map(([type, payload]) => [type, payload]));
  assert.throws(() => worker.preparePostseason({ expectedRevision: 4, userApproved: true, postseasonSeed: -1, playInPolicy: 'auto' }), /explicit seed/);
  assert.throws(() => worker.commitPostseason({ expectedRevision: 5, userApproved: false }), /explicit user approval/);
  assert.throws(() => worker.advanceNextSeason({ expectedRevision: 6 }), /explicit user approval/);
  assert.throws(() => worker.resolveOffseasonApproval({ expectedRevision: 9, userApproved: true, decision: 'counter' }), /approve or reject/);
});

test('standalone lifecycle validators require sequential, revision-bound window and phase receipts', async () => {
  const currentSession = { revision: 3, sourceReceipt: { packageId: 'source' }, modelReceipt: { modelId: 'model' },
    schedule: [], leagueState: { revision: 4, seasonStartYear: 2024, transactionWindow: 'preseason' } };
  const nextSession = { ...currentSession, revision: 4,
    actionHistory: [
      { revision: 4, kind: 'advance-offseason-window', fromWindow: 'preseason', toWindow: 'option-decisions' },
      { revision: 4, kind: 'game-input-bundle-invalidated', reason: 'offseason-window-advance' },
    ],
    leagueState: { ...currentSession.leagueState, revision: 5, transactionWindow: 'option-decisions' } };
  assert.equal(validateStandaloneOffseasonWindowAdvance({ result: { status: 'offseason-window-advanced', window: 'option-decisions', session: nextSession },
    currentSession, nextWindow: 'option-decisions' }), nextSession);
  assert.throws(() => validateStandaloneOffseasonWindowAdvance({ result: { status: 'offseason-window-advanced', window: 'free-agency', session: nextSession },
    currentSession, nextWindow: 'free-agency' }), /unexpected LeagueState transition/);

  const pending = { window: 'free-agency', stateRevision: 5, status: 'awaiting-user-approval', proposal: { proposalId: 'proposal-1' } };
  const phaseSession = { ...nextSession, revision: 5, pendingOffseasonApproval: pending,
    actionHistory: [
      { revision: 5, kind: 'run-offseason-phase', window: 'free-agency', phaseStatus: 'awaiting-user-approval' },
      { revision: 5, kind: 'game-input-bundle-invalidated', reason: 'offseason-phase-commit' },
    ] };
  phaseSession.leagueState = { ...nextSession.leagueState, transactionWindow: 'free-agency' };
  const phaseBase = { ...nextSession, leagueState: { ...nextSession.leagueState, transactionWindow: 'free-agency' } };
  assert.equal(validateStandaloneOffseasonPhase({ result: { status: 'awaiting-user-approval', session: phaseSession, pendingApproval: pending },
    currentSession: phaseBase, window: 'free-agency' }), phaseSession);
  const rejectedSession = { ...phaseSession, revision: 6, actionHistory: [
    { revision: 6, kind: 'resolve-offseason-approval', window: 'free-agency', decision: 'reject' },
    { revision: 6, kind: 'game-input-bundle-invalidated', reason: 'offseason-approval-resolution' },
  ] };
  delete rejectedSession.pendingOffseasonApproval;
  assert.equal(await validateStandaloneOffseasonApproval({
    result: { status: 'rejected', session: rejectedSession, pendingApproval: null },
    currentSession: phaseSession, decision: 'reject', cryptoProvider: webcrypto,
  }), rejectedSession);
});

test('rotation save only reports prepared inputs when the refreshed receipt matches the returned session', async () => {
  const currentSession = { revision: 3, sourceReceipt: { packageId: 'source' }, modelReceipt: { modelId: 'model' }, schedule: [{ gameId: 'g1' }],
    leagueState: { revision: 4, seasonStartYear: 2024 }, actionHistory: [] };
  const executionInputPins = { schedule: { sha256: 'a'.repeat(64) }, gameInputs: { sha256: 'b'.repeat(64) } };
  const receipt = { format: 'djhc-franchise-game-input-bundle-v1', version: '1.0.0', status: 'prepared',
    sessionRevision: 4, leagueStateRevision: 4, seasonStartYear: 2024,
    sourceReceipt: currentSession.sourceReceipt, modelReceipt: currentSession.modelReceipt,
    scheduleSha256: 'a'.repeat(64), scheduleGameCount: 1,
    gameInputsSha256: 'b'.repeat(64), executionInputPins };
  const session = { ...currentSession, revision: 4, preparedGameInputBundleReceipt: receipt,
    actionHistory: [{ revision: 4, kind: 'rotation', teamCode: 'MIN' }], leagueState: currentSession.leagueState };
  assert.equal(await validateStandaloneRotationRefresh({
    result: { status: 'updated', session, capabilities: { preparedGameInputs: true }, inputBundleReceipt: receipt },
    currentSession, teamCode: 'MIN', cryptoProvider: webcrypto,
  }), session);
  await assert.rejects(validateStandaloneRotationRefresh({
    result: { status: 'updated', session, capabilities: { preparedGameInputs: true }, inputBundleReceipt: { ...receipt, sessionRevision: 3 } },
    currentSession, teamCode: 'MIN', cryptoProvider: webcrypto,
  }), /invalid refreshed game-input receipt/);
});

test('postseason preparation and commit are receipt-bound to the reviewed result', async () => {
  const seasonStartYear = 2024;
  const closeout = { status: 'regular-season-closed', seasonStartYear, receiptSha256: 'a'.repeat(64) };
  const awardReceipt = { status: 'season-awards-finalized', seasonStartYear, receiptSha256: 'b'.repeat(64) };
  const currentSession = { revision: 7, sourceReceipt: { packageId: 'source' }, modelReceipt: { modelId: 'model' },
    schedule: [{ gameId: 'regular-1' }], scheduleCursor: 1, actionHistory: [],
    leagueState: { revision: 8, seasonStartYear, transactionWindow: 'season-end',
      franchiseLifecycleReceiptsBySeason: { [String(seasonStartYear)]: closeout },
      awardHistoryBySeason: { [String(seasonStartYear)]: { finalizationReceipt: awardReceipt } } } };
  const postseason = { seasonStartYear, champion: { teamCode: 'MIN' }, games: [{ gameId: 'post-1' }] };
  const receipt = {
    format: 'djhc-franchise-postseason-completion-v1', version: '1.0.0', status: 'franchise-postseason-completed',
    classification: 'development-scenario; not-certified', seasonStartYear,
    priorSessionRevision: 7, sessionRevision: 8, priorLeagueStateRevision: 8, leagueStateRevision: 9,
    postseasonSeed: 21, sourceReceipt: currentSession.sourceReceipt, modelReceipt: currentSession.modelReceipt,
    closeoutReceiptSha256: closeout.receiptSha256, awardsFinalizationReceiptSha256: awardReceipt.receiptSha256,
    postseasonGameCount: 1, champion: { teamCode: 'MIN' },
    postseasonResultSha256: await sha256(canonicalJson(postseason)),
  };
  receipt.receiptSha256 = await sha256(canonicalJson(receipt));
  const preparationResult = { status: 'postseason-ready-to-commit', session: currentSession, postseason, receipt,
    gameInputGameIds: ['post-1'], gameInputsSha256: 'c'.repeat(64) };
  const prepared = await validateStandalonePostseasonPreparation({ result: preparationResult,
    currentSession, postseasonSeed: 21, cryptoProvider: webcrypto });
  const committedSession = { ...currentSession, revision: 8,
    actionHistory: [{ revision: 8, kind: 'complete-franchise-postseason', seasonStartYear,
      postseasonCompletionReceiptSha256: receipt.receiptSha256,
      gameInputsSha256: preparationResult.gameInputsSha256, gameInputGameIds: ['post-1'] }],
    leagueState: { ...currentSession.leagueState, revision: 9,
      franchisePostseasonReceiptsBySeason: { [String(seasonStartYear)]: receipt },
      postseasonHistoryBySeason: { [String(seasonStartYear)]: { champion: { teamCode: 'MIN' } } } } };
  const committed = await validateStandalonePostseasonCommit({
    result: { status: 'franchise-postseason-completed', session: committedSession, postseason, receipt },
    currentSession, prepared: { ...prepared, sessionRevision: currentSession.revision,
      gameInputsSha256: preparationResult.gameInputsSha256 }, cryptoProvider: webcrypto,
  });
  assert.equal(committed.revision, 8);
  const altered = structuredClone(preparationResult);
  altered.postseason.champion.teamCode = 'LAL';
  await assert.rejects(validateStandalonePostseasonPreparation({ result: altered, currentSession,
    postseasonSeed: 21, cryptoProvider: webcrypto }), /incomplete or unbound receipt|invalid receipt digest/);
});

test('next-season transition verifies source, target, schedule and receipt hashes', async () => {
  const schedule = [{ gameId: '2025-open', gameLocalDate: '2025-10-20', homeTeamCode: 'MIN', awayTeamCode: 'CHI' }];
  const sourceReceipt = { packageId: 'source', packageVersion: '1', seasonStartYear: 2024 };
  const targetSourceReceipt = { packageId: 'source:scenario:future', packageVersion: 'scenario-2025-v1', seasonStartYear: 2025 };
  const sourceModelReceipt = { modelId: 'model', executedModelId: 'model+prod', contentSha256: '1'.repeat(64) };
  const currentSession = { revision: 12, sourceReceipt, modelReceipt: sourceModelReceipt, schedule: [], scheduleCursor: 0,
    actionHistory: [], leagueState: { revision: 13, seasonStartYear: 2024, transactionWindow: 'season-end' } };
  const targetState = { seasonStartYear: 2025, transactionWindow: 'preseason', revision: 14,
    franchiseSeasonTransitionsBySeason: {} };
  const targetSession = { revision: 13, sourceReceipt: targetSourceReceipt, modelReceipt: sourceModelReceipt,
    leagueState: targetState, schedule, scheduleCursor: 0, actionHistory: [{ revision: 13,
      kind: 'advance-franchise-season', sourceSeasonStartYear: 2024, targetSeasonStartYear: 2025 }] };
  const receipt = {
    format: 'djhc-franchise-offseason-lifecycle-v1', version: '1.1.0', status: 'season-transitioned',
    sourceSeasonStartYear: 2024, targetSeasonStartYear: 2025,
    sourceSessionRevision: 12, targetSessionRevision: 13,
    sourceLeagueStateRevision: 13, targetLeagueStateRevision: 14,
    sourceReceipt, targetSourceReceipt, sourceModelReceipt, targetModelReceipt: sourceModelReceipt,
    scheduleGameCount: 1, scheduleSha256: await sha256(canonicalJson(schedule)),
  };
  receipt.receiptSha256 = await sha256(canonicalJson(receipt));
  targetState.franchiseSeasonTransitionsBySeason['2025'] = receipt;
  const validated = await validateStandaloneNextSeasonAdvance({
    result: { status: 'next-season-preseason-ready', session: targetSession, receipt },
    currentSession, cryptoProvider: webcrypto,
  });
  assert.equal(validated.leagueState.seasonStartYear, 2025);
});

test('standalone transaction evaluation and committed receipt are revision-bound', async () => {
  const sourceReceipt = { sourceId: 'fixture-source' };
  const modelReceipt = { modelId: 'fixture-model' };
  const proposal = { proposalId: 'waive-r1-min-player', kind: 'roster-move', seasonStartYear: 2024,
    transactionWindow: 'free-agency', expectedStateRevision: 3, legs: [{ canonicalName: 'A. Player', action: 'waive' }] };
  const currentSession = { revision: 2, sourceReceipt, modelReceipt, schedule: [{ gameId: 'game-1' }], scheduleCursor: 0,
    actionHistory: [], leagueState: { revision: 3, seasonStartYear: 2024, transactionWindow: 'free-agency' } };
  const evaluated = { status: 'evaluated', evaluation: { format: 'djhc-transaction-evaluation-v1', proposalId: proposal.proposalId,
    seasonStartYear: 2024, transactionWindow: 'free-agency', status: 'confirmed-legal', blockedReasons: ['User approval is required.'],
    missingInputs: [], violations: [] } };
  assert.equal(validateStandaloneTransactionEvaluation({ result: evaluated, currentSession, proposal }), evaluated.evaluation);

  const ledgerEntry = { proposalId: proposal.proposalId, kind: proposal.kind, seasonStartYear: 2024,
    transactionWindow: 'free-agency', status: 'confirmed-legal', revisionBefore: 3, revisionAfter: 4 };
  const committedProposal = { ...proposal, approvedByUser: true,
    userApproval: { format: 'djhc-transaction-user-approval-v1', stateRevision: 3 } };
  const evaluation = { ...evaluated.evaluation, executionStatus: 'committed', resultingRevision: 4, legalReady: true,
    rosterTransitionReceipt: null };
  const receipt = {
    format: 'djhc-roster-transition-receipt-v1', proposalId: proposal.proposalId,
    transactionLedgerProposalId: proposal.proposalId, transactionKind: proposal.kind, legalityOutcome: 'confirmed-legal',
    evidenceBasis: 'resolved-source-evidence', legalReady: true, sourceSeasonStartYear: 2024, targetSeasonStartYear: 2024,
    proposalSeasonStartYear: 2024, revisionBefore: 3, revisionAfter: 4, preRosterByTeam: {}, postRosterByTeam: {},
    addedByTeam: {}, removedByTeam: {}, movedPlayers: [], committedProposal, committedEvaluation: { ...evaluation }, transactionLedgerEntry: ledgerEntry,
  };
  receipt.receiptSha256 = await sha256(canonicalJson(receipt));
  evaluation.rosterTransitionReceipt = receipt;
  const returnedSession = { ...currentSession, revision: 3, actionHistory: [
    { revision: 3, kind: 'transaction', proposalId: proposal.proposalId, status: 'confirmed-legal' },
    { revision: 3, kind: 'game-input-bundle-invalidated', reason: 'transaction-commit' },
  ], leagueState: { ...currentSession.leagueState, revision: 4,
    transactionLedger: [ledgerEntry], rosterTransitionReceipts: [receipt] } };
  const result = { status: 'committed', evaluation, session: returnedSession };
  const validated = await validateStandaloneTransactionCommit({ result, currentSession, proposal, cryptoProvider: webcrypto });
  assert.equal(validated.revision, 3);
  const altered = structuredClone(result);
  altered.evaluation.rosterTransitionReceipt.receiptSha256 = 'f'.repeat(64);
  await assert.rejects(validateStandaloneTransactionCommit({ result: altered, currentSession, proposal, cryptoProvider: webcrypto }), /SHA-256/);
});

test('standalone worker adapter rejects clients that cannot initialize and dispatch', () => {
  assert.throws(() => createStandaloneFranchiseWorkerAdapter(null), /worker client with initialize\(\) and command\(\)/);
  assert.throws(() => createStandaloneFranchiseWorkerAdapter({ initialize() {} }), /worker client with initialize\(\) and command\(\)/);
});
