/**
 * UI-facing boundary for the standalone Franchise Lab worker. Keep raw worker
 * command names and payload shapes here so React controls remain independent
 * from the transport and other Season Lab bridges.
 */
const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const transactionProposalInput = value => plain(value) && typeof value.proposalId === 'string' && value.proposalId.trim()
  && typeof value.kind === 'string' && Number.isInteger(value.seasonStartYear)
  && typeof value.transactionWindow === 'string' && Array.isArray(value.legs);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort(compareText);
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

async function sha256Hex(value, cryptoProvider) {
  if (!cryptoProvider?.subtle || typeof cryptoProvider.subtle.digest !== 'function') {
    throw new Error('Web Crypto SHA-256 is required to verify season-awards finalization.');
  }
  const bytes = await cryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Validate the worker's revision-bound award result before the React view is
 * allowed to replace the last visible franchise session. */
export async function validateStandaloneSeasonAwardsFinalization({
  result, currentSession, awardsSeed, cryptoProvider = globalThis.crypto,
} = {}) {
  const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
  requireValue(plain(currentSession) && plain(currentSession.leagueState),
    'The current franchise session is unavailable for award receipt validation.');
  const seasonStartYear = currentSession.leagueState.seasonStartYear;
  const yearKey = String(seasonStartYear);
  const closeout = currentSession.leagueState.franchiseLifecycleReceiptsBySeason?.[yearKey];
  requireValue(Number.isSafeInteger(awardsSeed) && awardsSeed >= 0 && awardsSeed <= 0xffffffff,
    'Season-awards finalization requires an explicit unsigned 32-bit seed.');
  requireValue(currentSession.leagueState.transactionWindow === 'season-end'
    && currentSession.schedule?.length > 0
    && currentSession.scheduleCursor === currentSession.schedule.length
    && closeout?.status === 'regular-season-closed'
    && closeout.seasonStartYear === seasonStartYear
    && /^[a-f0-9]{64}$/.test(closeout.receiptSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(closeout.canonicalScheduleSha256 ?? ''),
  'Season-awards finalization requires a completed session with its verified closeout receipt.');

  const replay = result?.idempotentReplay === true;
  const expectedStatus = replay ? 'season-awards-already-finalized' : 'season-awards-finalized';
  const returnedSession = result?.session;
  const expectedSessionRevision = replay ? currentSession.revision : currentSession.revision + 1;
  const expectedLeagueRevision = replay ? currentSession.leagueState.revision : currentSession.leagueState.revision + 1;
  const receipt = result?.receipt;
  const savedRecord = returnedSession?.leagueState?.awardHistoryBySeason?.[yearKey];
  const savedReceipt = savedRecord?.finalizationReceipt;
  requireValue(result?.format === 'djhc-franchise-season-awards-finalize-v1'
    && result.version === '1.0.0' && result.status === expectedStatus
    && plain(returnedSession) && returnedSession.revision === expectedSessionRevision
    && returnedSession.leagueState?.revision === expectedLeagueRevision
    && returnedSession.leagueState?.seasonStartYear === seasonStartYear
    && returnedSession.leagueState?.transactionWindow === 'season-end'
    && returnedSession.scheduleCursor === currentSession.scheduleCursor
    && same(returnedSession.schedule, currentSession.schedule)
    && same(returnedSession.sourceReceipt, currentSession.sourceReceipt)
    && same(returnedSession.modelReceipt, currentSession.modelReceipt)
    && same(returnedSession.leagueState?.franchiseLifecycleReceiptsBySeason?.[yearKey], closeout),
  'Season-awards finalization returned a stale or out-of-window franchise session.');

  requireValue(plain(receipt)
    && receipt.format === 'djhc-franchise-season-awards-finalize-v1' && receipt.version === '1.0.0'
    && receipt.previewFeatureFlag === 'seasonAwardsFinalizeV1'
    && receipt.classification === 'development-scenario; not-certified'
    && receipt.status === 'season-awards-finalized' && receipt.seasonStartYear === seasonStartYear
    && Number.isSafeInteger(receipt.priorSessionRevision)
    && receipt.sessionRevision === receipt.priorSessionRevision + 1
    && (replay ? receipt.sessionRevision <= currentSession.revision
      : receipt.priorSessionRevision === currentSession.revision
        && receipt.sessionRevision === expectedSessionRevision)
    && Number.isSafeInteger(receipt.priorLeagueStateRevision)
    && receipt.leagueStateRevision === receipt.priorLeagueStateRevision + 1
    && (replay ? receipt.leagueStateRevision <= currentSession.leagueState.revision
      : receipt.priorLeagueStateRevision === currentSession.leagueState.revision
        && receipt.leagueStateRevision === expectedLeagueRevision)
    && same(receipt.sourceReceipt, currentSession.sourceReceipt)
    && same(receipt.modelReceipt, currentSession.modelReceipt)
    && receipt.canonicalScheduleSha256 === closeout.canonicalScheduleSha256
    && receipt.handoffReceiptSha256 === closeout.receiptSha256
    && receipt.awardsSeed === awardsSeed
    && receipt.allStarSelectionTiming === 'end-of-season-modeled-selection'
    && /^[a-f0-9]{64}$/.test(receipt.receiptSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(receipt.completionReceiptSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(receipt.historyRecordSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(receipt.inputKeySha256 ?? ''),
  'Season-awards finalization returned an unbound, incomplete, or unsupported receipt.');

  const savedHistoryRecord = savedRecord ? Object.fromEntries(
    Object.entries(savedRecord).filter(([key]) => key !== 'finalizationReceipt'),
  ) : null;
  requireValue(plain(savedRecord) && same(savedRecord, result.historyRecord)
    && same(savedReceipt, receipt)
    && plain(result.awards) && result.awards.format === 'djhc-season-awards-simulation-v1'
    && result.awards.seasonStartYear === seasonStartYear && result.awards.seed === awardsSeed
    && plain(result.awards.historyRecord) && same(savedHistoryRecord, result.awards.historyRecord)
    && returnedSession.actionHistory?.filter(row => row.kind === 'finalize-season-awards'
      && row.seasonStartYear === seasonStartYear).length === 1,
  'Finalized awards history does not match the returned receipt.');

  const action = returnedSession.actionHistory.find(row => row.kind === 'finalize-season-awards'
    && row.seasonStartYear === seasonStartYear);
  requireValue(action.revision === receipt.sessionRevision
    && action.finalizationReceiptSha256 === receipt.receiptSha256
    && action.canonicalScheduleSha256 === closeout.canonicalScheduleSha256
    && action.handoffReceiptSha256 === closeout.receiptSha256,
  'Season-awards action history does not bind the finalization receipt.');

  const { receiptSha256, ...unsignedReceipt } = receipt;
  requireValue(await sha256Hex(canonicalJson(unsignedReceipt), cryptoProvider) === receiptSha256,
    'Season-awards finalization receipt SHA-256 is invalid.');
  requireValue(await sha256Hex(canonicalJson(result.awards.historyRecord), cryptoProvider) === receipt.historyRecordSha256,
    'Season-awards history record SHA-256 is invalid.');
  requireValue(await sha256Hex(canonicalJson(closeout.completionReceipt), cryptoProvider) === receipt.completionReceiptSha256,
    'Season-awards completion receipt SHA-256 does not match the current closeout.');
  const inputKey = {
    format: 'djhc-franchise-season-awards-finalize-v1',
    version: '1.0.0',
    seasonStartYear,
    sourceReceipt: currentSession.sourceReceipt,
    modelReceipt: currentSession.modelReceipt,
    completionReceiptSha256: receipt.completionReceiptSha256,
    canonicalScheduleSha256: closeout.canonicalScheduleSha256,
    handoffReceiptSha256: closeout.receiptSha256,
    awardsSeed,
    awardsPolicyId: result.awards.policyId,
    awardsModelId: result.awards.modelId,
    historyRecordSha256: receipt.historyRecordSha256,
  };
  requireValue(receipt.awardsPolicyId === result.awards.policyId
    && receipt.awardsModelId === result.awards.modelId
    && await sha256Hex(canonicalJson(inputKey), cryptoProvider) === receipt.inputKeySha256,
  'Season-awards input-key SHA-256 does not match the finalized inputs.');
  return returnedSession;
}

export function validateStandaloneTransactionEvaluation({ result, currentSession, proposal } = {}) {
  const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
  requireValue(plain(currentSession) && plain(currentSession.leagueState)
    && transactionProposalInput(proposal) && proposal.expectedStateRevision === currentSession.leagueState.revision,
  'The transaction proposal is not bound to the current LeagueState revision.');
  const evaluation = result?.evaluation;
  requireValue(result?.status === 'evaluated' && plain(evaluation)
    && evaluation.format === 'djhc-transaction-evaluation-v1'
    && evaluation.proposalId === proposal.proposalId
    && evaluation.seasonStartYear === currentSession.leagueState.seasonStartYear
    && evaluation.transactionWindow === proposal.transactionWindow
    && ['confirmed-legal', 'provisional', 'illegal'].includes(evaluation.status)
    && Array.isArray(evaluation.blockedReasons)
    && Array.isArray(evaluation.missingInputs)
    && Array.isArray(evaluation.violations),
  'The worker returned an incomplete or mismatched transaction evaluation.');
  return evaluation;
}

export async function validateStandaloneTransactionCommit({ result, currentSession, proposal, cryptoProvider = globalThis.crypto } = {}) {
  const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
  requireValue(plain(currentSession) && plain(currentSession.leagueState)
    && transactionProposalInput(proposal) && proposal.expectedStateRevision === currentSession.leagueState.revision,
  'The approved transaction is not bound to the current LeagueState revision.');
  const session = result?.session;
  const evaluation = result?.evaluation;
  const priorStateRevision = currentSession.leagueState.revision;
  const nextSessionRevision = currentSession.revision + 1;
  const nextStateRevision = priorStateRevision + 1;
  const ledgerEntry = session?.leagueState?.transactionLedger?.at(-1);
  const receipt = evaluation?.rosterTransitionReceipt;
  const savedReceipt = session?.leagueState?.rosterTransitionReceipts?.at(-1);
  requireValue(result?.status === 'committed' && plain(session) && plain(session.leagueState)
    && session.revision === nextSessionRevision
    && session.leagueState.revision === nextStateRevision
    && session.leagueState.seasonStartYear === currentSession.leagueState.seasonStartYear
    && session.leagueState.transactionWindow === currentSession.leagueState.transactionWindow
    && same(session.schedule, currentSession.schedule)
    && session.scheduleCursor === currentSession.scheduleCursor
    && same(session.sourceReceipt, currentSession.sourceReceipt)
    && same(session.modelReceipt, currentSession.modelReceipt),
  'Transaction commit returned a stale or out-of-scope franchise session.');
  requireValue(plain(evaluation) && evaluation.format === 'djhc-transaction-evaluation-v1'
    && evaluation.proposalId === proposal.proposalId
    && evaluation.status !== 'illegal'
    && evaluation.executionStatus === 'committed'
    && evaluation.resultingRevision === nextStateRevision
    && plain(ledgerEntry) && ledgerEntry.proposalId === proposal.proposalId
    && ledgerEntry.revisionBefore === priorStateRevision
    && ledgerEntry.revisionAfter === nextStateRevision
    && ledgerEntry.status === evaluation.status
    && plain(receipt) && same(receipt, savedReceipt)
    && receipt.format === 'djhc-roster-transition-receipt-v1'
    && receipt.proposalId === proposal.proposalId
    && receipt.transactionLedgerProposalId === ledgerEntry.proposalId
    && receipt.transactionKind === proposal.kind
    && receipt.sourceSeasonStartYear === currentSession.leagueState.seasonStartYear
    && receipt.targetSeasonStartYear === session.leagueState.seasonStartYear
    && receipt.proposalSeasonStartYear === proposal.seasonStartYear
    && receipt.revisionBefore === priorStateRevision
    && receipt.revisionAfter === nextStateRevision
    && receipt.legalReady === (evaluation.legalReady === true)
    && same(receipt.transactionLedgerEntry, ledgerEntry)
    && receipt.committedProposal?.proposalId === proposal.proposalId
    && receipt.committedProposal?.approvedByUser === true
    && receipt.committedProposal?.userApproval?.stateRevision === priorStateRevision
    && /^[a-f0-9]{64}$/.test(receipt.receiptSha256 ?? ''),
  'Transaction commit is missing a matching revision-bound roster-transition receipt.');
  const action = session.actionHistory?.find(row => row.kind === 'transaction'
    && row.revision === nextSessionRevision && row.proposalId === proposal.proposalId);
  requireValue(action?.kind === 'transaction' && action.revision === nextSessionRevision
    && action.proposalId === proposal.proposalId && action.status === evaluation.status,
  'Transaction action history does not match the committed proposal.');
  const { receiptSha256, ...unsignedReceipt } = receipt;
  requireValue(await sha256Hex(canonicalJson(unsignedReceipt), cryptoProvider) === receiptSha256,
    'Roster-transition receipt SHA-256 is invalid.');
  return session;
}

function assertLifecycleRevisionResult(result, currentSession, kind, nextLeagueState = null) {
  const session = result?.session;
  if (!plain(currentSession) || !plain(session)
    || session.revision !== currentSession.revision + 1
    || session.leagueState?.seasonStartYear !== currentSession.leagueState?.seasonStartYear
    || !same(session.sourceReceipt, currentSession.sourceReceipt)
    || !same(session.modelReceipt, currentSession.modelReceipt)) {
    throw new Error(`${kind} returned a stale or out-of-scope Franchise session.`);
  }
  if (nextLeagueState && (!plain(session.leagueState) || !nextLeagueState(session.leagueState))) {
    throw new Error(`${kind} returned an unexpected LeagueState transition.`);
  }
  return session;
}

/** Verify a staged postseason result without replacing the current session. */
export async function validateStandalonePostseasonPreparation({
  result, currentSession, postseasonSeed, cryptoProvider = globalThis.crypto,
} = {}) {
  const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
  const year = currentSession?.leagueState?.seasonStartYear;
  const yearKey = String(year);
  const closeout = currentSession?.leagueState?.franchiseLifecycleReceiptsBySeason?.[yearKey];
  const awards = currentSession?.leagueState?.awardHistoryBySeason?.[yearKey]?.finalizationReceipt;
  requireValue(plain(currentSession) && plain(currentSession.leagueState)
    && currentSession.leagueState.transactionWindow === 'season-end'
    && currentSession.scheduleCursor === currentSession.schedule?.length
    && closeout?.status === 'regular-season-closed'
    && awards?.status === 'season-awards-finalized',
  'Postseason preparation requires a closed season with finalized simulated awards.');
  requireValue(Number.isSafeInteger(postseasonSeed) && postseasonSeed >= 0 && postseasonSeed <= 0xffffffff,
    'Postseason preparation requires an explicit unsigned 32-bit seed.');
  const postseason = result?.postseason;
  const receipt = result?.receipt;
  requireValue(result?.status === 'postseason-ready-to-commit'
    && plain(result.session) && same(result.session, currentSession)
    && plain(postseason) && postseason.seasonStartYear === year && plain(postseason.champion)
    && typeof postseason.champion.teamCode === 'string' && Array.isArray(postseason.games) && postseason.games.length > 0,
  'Postseason preparation did not return a reviewable result for the unchanged current session.');
  requireValue(plain(receipt)
    && receipt.format === 'djhc-franchise-postseason-completion-v1'
    && receipt.version === '1.0.0' && receipt.status === 'franchise-postseason-completed'
    && receipt.classification === 'development-scenario; not-certified'
    && receipt.seasonStartYear === year
    && receipt.priorSessionRevision === currentSession.revision
    && receipt.sessionRevision === currentSession.revision + 1
    && receipt.priorLeagueStateRevision === currentSession.leagueState.revision
    && receipt.leagueStateRevision === currentSession.leagueState.revision + 1
    && receipt.postseasonSeed === postseasonSeed
    && same(receipt.sourceReceipt, currentSession.sourceReceipt)
    && same(receipt.modelReceipt, currentSession.modelReceipt)
    && receipt.closeoutReceiptSha256 === closeout.receiptSha256
    && receipt.awardsFinalizationReceiptSha256 === awards.receiptSha256
    && receipt.postseasonGameCount === postseason.games.length
    && receipt.champion?.teamCode === postseason.champion.teamCode
    && /^[a-f0-9]{64}$/.test(receipt.receiptSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(receipt.postseasonResultSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(result.gameInputsSha256 ?? '')
    && Array.isArray(result.gameInputGameIds)
    && result.gameInputGameIds.length === postseason.games.length,
  'Postseason preparation returned an incomplete or unbound receipt.');
  const { receiptSha256, ...unsignedReceipt } = receipt;
  requireValue(await sha256Hex(canonicalJson(unsignedReceipt), cryptoProvider) === receiptSha256
    && await sha256Hex(canonicalJson(postseason), cryptoProvider) === receipt.postseasonResultSha256,
  'Postseason preparation returned an invalid receipt digest.');
  requireValue(new Set(result.gameInputGameIds).size === result.gameInputGameIds.length
    && result.gameInputGameIds.every(id => typeof id === 'string' && id.length > 0),
  'Postseason preparation returned invalid matchup input IDs.');
  return { postseason, receipt, gameInputGameIds: [...result.gameInputGameIds], gameInputsSha256: result.gameInputsSha256 };
}

/** Verify the revision-bound commit against the separately reviewed preview. */
export async function validateStandalonePostseasonCommit({
  result, currentSession, prepared, cryptoProvider = globalThis.crypto,
} = {}) {
  const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
  requireValue(plain(prepared) && plain(prepared.receipt)
    && prepared.sessionRevision === currentSession?.revision,
  'The prepared postseason preview is stale for this Franchise revision.');
  requireValue(result?.status === 'franchise-postseason-completed'
    && plain(result.session) && result.session.revision === currentSession.revision + 1
    && result.session.leagueState?.revision === currentSession.leagueState.revision + 1
    && result.session.leagueState?.seasonStartYear === currentSession.leagueState.seasonStartYear
    && result.session.leagueState?.transactionWindow === 'season-end'
    && same(result.session.schedule, currentSession.schedule)
    && result.session.scheduleCursor === currentSession.scheduleCursor
    && same(result.session.sourceReceipt, currentSession.sourceReceipt)
    && same(result.session.modelReceipt, currentSession.modelReceipt),
  'Postseason commit returned a stale or out-of-scope Franchise session.');
  const yearKey = String(currentSession.leagueState.seasonStartYear);
  const receipt = result.receipt;
  const savedReceipt = result.session.leagueState.franchisePostseasonReceiptsBySeason?.[yearKey];
  const action = result.session.actionHistory?.find(row => row.kind === 'complete-franchise-postseason'
    && row.revision === result.session.revision
    && row.seasonStartYear === currentSession.leagueState.seasonStartYear);
  requireValue(plain(receipt) && same(receipt, prepared.receipt) && same(savedReceipt, receipt)
    && action?.kind === 'complete-franchise-postseason'
    && action.revision === result.session.revision
    && action.seasonStartYear === currentSession.leagueState.seasonStartYear
    && action.postseasonCompletionReceiptSha256 === receipt.receiptSha256
    && action.gameInputsSha256 === prepared.gameInputsSha256
    && same(action.gameInputGameIds, prepared.gameInputGameIds),
  'Postseason commit history does not match the reviewed receipt and matchup inputs.');
  const { receiptSha256, ...unsignedReceipt } = receipt;
  requireValue(await sha256Hex(canonicalJson(unsignedReceipt), cryptoProvider) === receiptSha256
    && await sha256Hex(canonicalJson(result.postseason), cryptoProvider) === receipt.postseasonResultSha256
    && same(result.postseason, prepared.postseason),
  'Postseason commit returned a changed result or invalid receipt digest.');
  return result.session;
}

/** Verify the generated-source receipt and single-season rollover. */
export async function validateStandaloneNextSeasonAdvance({
  result, currentSession, cryptoProvider = globalThis.crypto,
} = {}) {
  const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
  const priorYear = currentSession?.leagueState?.seasonStartYear;
  const nextYear = priorYear + 1;
  const session = result?.session;
  const receipt = result?.receipt;
  requireValue(result?.status === 'next-season-preseason-ready'
    && plain(session) && session.revision === currentSession.revision + 1
    && session.leagueState?.revision === currentSession.leagueState.revision + 1
    && session.leagueState?.seasonStartYear === nextYear
    && session.leagueState?.transactionWindow === 'preseason'
    && session.scheduleCursor === 0 && Array.isArray(session.schedule) && session.schedule.length > 0,
  'Next-season advancement returned an invalid preseason session.');
  requireValue(plain(receipt) && receipt.format === 'djhc-franchise-offseason-lifecycle-v1'
    && receipt.version === '1.1.0' && receipt.status === 'season-transitioned'
    && receipt.sourceSeasonStartYear === priorYear && receipt.targetSeasonStartYear === nextYear
    && receipt.sourceSessionRevision === currentSession.revision
    && receipt.targetSessionRevision === session.revision
    && receipt.sourceLeagueStateRevision === currentSession.leagueState.revision
    && receipt.targetLeagueStateRevision === session.leagueState.revision
    && same(receipt.sourceReceipt, currentSession.sourceReceipt)
    && same(receipt.sourceModelReceipt, currentSession.modelReceipt)
    && same(receipt.targetSourceReceipt, session.sourceReceipt)
    && same(receipt.targetModelReceipt, session.modelReceipt)
    && receipt.scheduleGameCount === session.schedule.length
    && receipt.scheduleSha256 === await sha256Hex(canonicalJson(session.schedule), cryptoProvider)
    && /^[a-f0-9]{64}$/.test(receipt.receiptSha256 ?? '')
    && same(session.leagueState.franchiseSeasonTransitionsBySeason?.[String(nextYear)], receipt),
  'Next-season transition receipt does not match the source, target, model, or schedule.');
  const { receiptSha256, ...unsignedReceipt } = receipt;
  requireValue(await sha256Hex(canonicalJson(unsignedReceipt), cryptoProvider) === receiptSha256,
    'Next-season transition receipt SHA-256 is invalid.');
  const action = session.actionHistory?.find(row => row.kind === 'advance-franchise-season'
    && row.revision === session.revision && row.targetSeasonStartYear === nextYear);
  requireValue(action?.kind === 'advance-franchise-season'
    && action.revision === session.revision
    && action.sourceSeasonStartYear === priorYear
    && action.targetSeasonStartYear === nextYear,
  'Next-season action history does not match the transition receipt.');
  return session;
}

export function validateStandaloneOffseasonWindowAdvance({ result, currentSession, nextWindow } = {}) {
  const session = assertLifecycleRevisionResult(result, currentSession, 'Offseason window advance', state =>
    state.transactionWindow === nextWindow && state.revision === currentSession.leagueState.revision + 1);
  const action = session.actionHistory?.find(row => row.kind === 'advance-offseason-window'
    && row.revision === session.revision && row.toWindow === nextWindow);
  if (result?.status !== 'offseason-window-advanced' || result.window !== nextWindow
    || action?.kind !== 'advance-offseason-window' || action.revision !== session.revision
    || action.fromWindow !== currentSession.leagueState.transactionWindow || action.toWindow !== nextWindow) {
    throw new Error('Offseason window history does not match the requested sequential transition.');
  }
  return session;
}

export function validateStandaloneOffseasonPhase({ result, currentSession, window } = {}) {
  const session = assertLifecycleRevisionResult(result, currentSession, 'Offseason phase', state =>
    state.transactionWindow === window && state.revision >= currentSession.leagueState.revision);
  const action = session.actionHistory?.find(row => row.kind === 'run-offseason-phase'
    && row.revision === session.revision && row.window === window);
  const pending = session.pendingOffseasonApproval ?? null;
  if (typeof result?.status !== 'string' || action?.kind !== 'run-offseason-phase'
    || action.revision !== session.revision || action.window !== window || action.phaseStatus !== result.status
    || !same(result.pendingApproval ?? null, pending)
    || pending && (pending.window !== window || pending.stateRevision !== session.leagueState.revision
      || !plain(pending.proposal))) {
    throw new Error('Offseason phase result or saved approval does not match its revision-bound history.');
  }
  return session;
}

export async function validateStandaloneOffseasonApproval({
  result, currentSession, decision, cryptoProvider = globalThis.crypto,
} = {}) {
  const session = assertLifecycleRevisionResult(result, currentSession, 'Offseason approval', state =>
    state.transactionWindow === currentSession.leagueState.transactionWindow
    && state.revision >= currentSession.leagueState.revision);
  const action = session.actionHistory?.find(row => row.kind === 'resolve-offseason-approval'
    && row.revision === session.revision && row.decision === decision);
  const pending = session.pendingOffseasonApproval ?? null;
  if (typeof result?.status !== 'string' || action?.kind !== 'resolve-offseason-approval'
    || action.revision !== session.revision || action.window !== currentSession.pendingOffseasonApproval?.window
    || action.decision !== decision || !same(result.pendingApproval ?? null, pending)) {
    throw new Error('Offseason approval result does not match the saved proposal and action history.');
  }
  if (result.status === 'committed') {
    const evaluation = result.result?.evaluation;
    const receipt = evaluation?.rosterTransitionReceipt;
    const savedReceipt = session.leagueState?.rosterTransitionReceipts?.at(-1);
    const ledger = session.leagueState?.transactionLedger?.at(-1);
    const savedProposal = currentSession.pendingOffseasonApproval?.proposal;
    const proposal = savedProposal?.proposal ?? savedProposal;
    const proposalId = proposal?.proposalId;
    if (decision !== 'approve' || pending || !plain(evaluation) || !plain(receipt)
      || !same(receipt, savedReceipt) || !plain(ledger)
      || typeof proposalId !== 'string' || evaluation.proposalId !== proposalId
      || receipt.proposalId !== proposalId || receipt.transactionLedgerProposalId !== proposalId
      || ledger.proposalId !== proposalId || !same(receipt.transactionLedgerEntry, ledger)
      || ledger.revisionBefore !== currentSession.leagueState.revision
      || ledger.revisionAfter !== session.leagueState.revision
      || evaluation.resultingRevision !== session.leagueState.revision
      || receipt.revisionBefore !== currentSession.leagueState.revision
      || receipt.revisionAfter !== session.leagueState.revision
      || receipt.sourceSeasonStartYear !== currentSession.leagueState.seasonStartYear
      || receipt.targetSeasonStartYear !== session.leagueState.seasonStartYear
      || receipt.committedProposal?.approvedByUser !== true
      || receipt.committedProposal?.proposalId !== proposalId
      || receipt.committedProposal?.userApproval?.stateRevision !== currentSession.leagueState.revision
      || !/^[a-f0-9]{64}$/.test(receipt.receiptSha256 ?? '')) {
      throw new Error('Approved offseason transaction is missing its revision-bound roster-transition receipt.');
    }
    const { receiptSha256, ...unsignedReceipt } = receipt;
    if (await sha256Hex(canonicalJson(unsignedReceipt), cryptoProvider) !== receiptSha256) {
      throw new Error('Approved offseason transaction receipt SHA-256 is invalid.');
    }
    const decisionReceipt = result.result?.decisionReceipt;
    if (plain(decisionReceipt) && decisionReceipt.receiptSha256) {
      const { receiptSha256: decisionSha256, ...unsignedDecision } = decisionReceipt;
      if (await sha256Hex(canonicalJson(unsignedDecision), cryptoProvider) !== decisionSha256) {
        throw new Error('Offseason approval decision receipt SHA-256 is invalid.');
      }
    }
  }
  return session;
}

export async function validateStandaloneRotationRefresh({ result, currentSession, teamCode, cryptoProvider = globalThis.crypto } = {}) {
  const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
  const session = result?.session;
  const action = session?.actionHistory?.find(row => row.kind === 'rotation'
    && row.revision === currentSession?.revision + 1 && row.teamCode === teamCode);
  requireValue(plain(currentSession) && plain(session) && ['created', 'updated', 'ready', 'pass'].includes(result?.status)
    && session.revision > currentSession.revision && action,
  'Rotation save did not return a revision-bound saved control action.');
  const capabilityReady = result.capabilities?.preparedGameInputs === true;
  const receipt = result.inputBundleReceipt;
  if (capabilityReady) {
    requireValue(plain(receipt) && receipt.format === 'djhc-franchise-game-input-bundle-v1'
      && receipt.version === '1.0.0' && receipt.status === 'prepared'
      && receipt.sessionRevision === session.revision
      && receipt.leagueStateRevision === session.leagueState?.revision
      && receipt.seasonStartYear === session.leagueState?.seasonStartYear
      && receipt.scheduleGameCount === session.schedule?.length
      && same(receipt.sourceReceipt, session.sourceReceipt)
      && same(receipt.modelReceipt, session.modelReceipt)
      && same(session.preparedGameInputBundleReceipt, receipt)
      && /^[a-f0-9]{64}$/.test(receipt.scheduleSha256 ?? '')
      && /^[a-f0-9]{64}$/.test(receipt.gameInputsSha256 ?? ''),
    'Rotation save returned an invalid refreshed game-input receipt.');
    requireValue(receipt.scheduleSha256 === receipt.executionInputPins?.schedule?.sha256
      && receipt.gameInputsSha256 === receipt.executionInputPins?.gameInputs?.sha256,
    'Rotation save refreshed input digest fields do not match the prepared input pins.');
    const preparedReceipt = session.preparedGameInputBundleReceipt;
    requireValue(await sha256Hex(canonicalJson(receipt.executionInputPins), cryptoProvider)
      === await sha256Hex(canonicalJson(preparedReceipt.executionInputPins), cryptoProvider),
    'Rotation save refreshed input pins do not match the saved session receipt.');
  } else {
    requireValue(receipt === null || receipt === undefined,
      'Worker returned a game-input receipt while advertising that prepared inputs are unavailable.');
  }
  return session;
}

export function createStandaloneFranchiseWorkerAdapter(client) {
  if (!client || typeof client.initialize !== 'function' || typeof client.command !== 'function') {
    throw new TypeError('The standalone Franchise Lab requires a worker client with initialize() and command().');
  }

  const command = (type, payload) => client.command(type, payload);
  const finalizeSeasonAwards = payload => {
    if (!plain(payload) || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0) {
      throw new TypeError('Season-awards finalization requires an expected franchise revision.');
    }
    if (!Number.isSafeInteger(payload.awardsSeed) || payload.awardsSeed < 0 || payload.awardsSeed > 0xffffffff) {
      throw new TypeError('Season-awards finalization requires an explicit unsigned 32-bit awards seed.');
    }
    if (payload.userApproved !== true) {
      throw new Error('Recording simulated season awards requires explicit user approval.');
    }
    if (payload.awardsPolicy !== null && payload.awardsPolicy !== undefined && !plain(payload.awardsPolicy)) {
      throw new TypeError('Season-awards policy must be a plain record when supplied.');
    }
    if (!Object.keys(payload).every(key => ['expectedRevision', 'awardsSeed', 'awardsPolicy', 'userApproved'].includes(key))) {
      throw new TypeError('Season-awards finalization received an unsupported option.');
    }
    return command('finalize-season-awards', payload);
  };
  const lifecycleCommand = (type, payload, keys) => {
    if (!plain(payload) || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0
      || !keys.every(key => Object.hasOwn(payload, key))
      || !Object.keys(payload).every(key => keys.includes(key))) {
      throw new TypeError(`${type} requires its exact revision-bound payload.`);
    }
    return command(type, payload);
  };

  return Object.freeze({
    initialize: sessionInput => client.initialize(sessionInput),
    saveRotation: payload => command('rotation', payload),
    advanceNextGame: expectedRevision => command('next-game', { expectedRevision }),
    advanceNextUserGame: expectedRevision => command('next-user-game', { expectedRevision }),
    verifySeasonCompletion: expectedRevision => command('verify-season-completion', { expectedRevision }),
    closeRegularSeason: payload => command('close-regular-season', payload),
    finalizeSeasonAwards,
    preparePostseason: payload => {
      if (!plain(payload) || !Number.isSafeInteger(payload.postseasonSeed)
        || payload.postseasonSeed < 0 || payload.postseasonSeed > 0xffffffff
        || payload.userApproved !== true || payload.playInPolicy !== 'auto'
        || !Object.keys(payload).every(key => ['expectedRevision', 'userApproved', 'postseasonSeed', 'playInPolicy'].includes(key))) {
        throw new TypeError('Postseason preparation requires an explicit seed, approval, and supported play-in policy.');
      }
      return lifecycleCommand('prepare-postseason', payload,
        ['expectedRevision', 'userApproved', 'postseasonSeed', 'playInPolicy']);
    },
    commitPostseason: payload => {
      if (payload?.userApproved !== true) throw new Error('Committing postseason requires explicit user approval.');
      return lifecycleCommand('commit-postseason', payload, ['expectedRevision', 'userApproved']);
    },
    advanceNextSeason: payload => {
      if (payload?.userApproved !== true) throw new Error('Advancing the Franchise season requires explicit user approval.');
      return lifecycleCommand('advance-next-season', payload, ['expectedRevision', 'userApproved']);
    },
    advanceOffseasonWindow: payload => {
      if (typeof payload?.nextWindow !== 'string' || !payload.nextWindow) throw new TypeError('An explicit next offseason window is required.');
      return lifecycleCommand('advance-offseason-window', payload, ['expectedRevision', 'nextWindow']);
    },
    runOffseasonPhase: payload => {
      if (payload?.userApproved !== true || typeof payload?.window !== 'string' || !payload.window) {
        throw new Error('Running an offseason phase requires explicit approval and the current window.');
      }
      return lifecycleCommand('run-offseason-phase', payload, ['expectedRevision', 'userApproved', 'window']);
    },
    resolveOffseasonApproval: payload => {
      if (payload?.userApproved !== true || !['approve', 'reject'].includes(payload?.decision)) {
        throw new Error('Offseason approval resolution requires an explicit approve or reject decision.');
      }
      return lifecycleCommand('resolve-offseason-approval', payload, ['expectedRevision', 'userApproved', 'decision']);
    },
    evaluateTransaction: proposal => {
      if (!transactionProposalInput(proposal)) {
        throw new TypeError('Transaction evaluation requires a proposal ID, kind, season, window, and legs.');
      }
      return command('evaluate-transaction', { proposal });
    },
    executeTransaction: payload => {
      if (!plain(payload) || !transactionProposalInput(payload.proposal)
        || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0
        || payload.userApproved !== true || typeof payload.allowProvisionalSandbox !== 'boolean'
        || !Object.keys(payload).every(key => ['proposal', 'expectedRevision', 'userApproved', 'allowProvisionalSandbox'].includes(key))) {
        throw new TypeError('Transaction execution requires a current revision, explicit approval, and a normalized proposal.');
      }
      return command('execute-transaction', payload);
    },
    exportSave: () => command('export', {}),
    importSave: saveText => command('restore', { saveText }),
    restoreSession: session => command('restore-session', { session }),
    dispose: () => client.dispose?.(),
  });
}
