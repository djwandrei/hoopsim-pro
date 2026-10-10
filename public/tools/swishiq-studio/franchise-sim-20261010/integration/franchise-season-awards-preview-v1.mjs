import { validateFranchiseBrowserSession } from '../lib/franchise-browser-session-v1.mjs';
import {
  deriveFranchiseSeasonScheduleReceiptV1,
  FRANCHISE_SEASON_COMPLETION_FORMAT,
  FRANCHISE_SEASON_COMPLETION_VERSION,
  verifyFranchiseSeasonCompletionV1,
} from '../lib/franchise-season-completion-v1.mjs';
import { validateFranchiseSeasonEndHandoffV1 } from './franchise-season-end-handoff-v1.mjs';
import { simulateSeasonAwards } from '../lib/season-awards-v1.mjs';

export const FRANCHISE_SEASON_AWARDS_PREVIEW_FORMAT = 'djhc-franchise-season-awards-preview-v1';
export const FRANCHISE_SEASON_AWARDS_PREVIEW_VERSION = '1.0.0';
export const FRANCHISE_SEASON_AWARDS_FINALIZE_FORMAT = 'djhc-franchise-season-awards-finalize-v1';
export const FRANCHISE_SEASON_AWARDS_FINALIZE_VERSION = '1.0.0';

const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const clone = value => structuredClone(value);

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort(compareText);
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateAwardsOptions(value) {
  assert(plain(value), 'Explicit end-season award options are required.');
  assert(Object.keys(value).every(key => ['seed', 'policy'].includes(key)), 'Unknown end-season award option.');
  assert(Number.isSafeInteger(value.seed) && value.seed >= 0 && value.seed <= 0xffffffff,
    'End-season award seed must be an explicit unsigned 32-bit integer.');
  assert(value.policy === undefined || value.policy === null || plain(value.policy),
    'End-season award policy must be a plain object when supplied.');
}

async function sha256Hex(value, cryptoProvider) {
  assert(cryptoProvider?.subtle && typeof cryptoProvider.subtle.digest === 'function',
    'Web Crypto SHA-256 is required to finalize season awards.');
  const bytes = await cryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function labelEndSeasonAllStar(awards) {
  if (plain(awards?.allStar)) {
    awards.allStar.selectionTiming = 'end-of-season-modeled-selection';
    awards.allStar.timingDisclosure = 'This modeled selection uses final-season statistics; it is not a midseason All-Star ballot.';
  }
  if (plain(awards?.historyRecord)) {
    awards.historyRecord.allStarSelectionTiming = 'end-of-season-modeled-selection';
  }
  return awards;
}

function expectedGamesByTeamFromCompletion(session, completionReceipt) {
  const expectedGamesByTeam = {};
  for (const team of session.leagueState?.teams ?? []) {
    const code = String(team?.teamCode ?? '').trim().toUpperCase();
    const scheduledGames = completionReceipt.teamGameCounts?.[code]?.scheduled?.games;
    assert(code && !Object.hasOwn(expectedGamesByTeam, code)
      && Number.isSafeInteger(scheduledGames) && scheduledGames >= 0,
    `Season completion receipt has no valid scheduled-game count for ${code || 'a session team'}.`);
    expectedGamesByTeam[code] = scheduledGames;
  }
  assert(Object.keys(expectedGamesByTeam).length === (session.leagueState?.teams ?? []).length
    && Object.keys(completionReceipt.teamGameCounts ?? {}).length === Object.keys(expectedGamesByTeam).length,
  'Season completion receipt team counts do not match the current franchise teams.');
  return expectedGamesByTeam;
}

async function deriveScheduleReceiptFromCompletion(session, completionReceipt, cryptoProvider) {
  assert(plain(completionReceipt)
    && completionReceipt.format === FRANCHISE_SEASON_COMPLETION_FORMAT
    && completionReceipt.version === FRANCHISE_SEASON_COMPLETION_VERSION
    && completionReceipt.scheduleComplete === true
    && completionReceipt.seasonStartYear === session.leagueState?.seasonStartYear
    && Number.isSafeInteger(completionReceipt.scheduledGameCount)
    && completionReceipt.scheduledGameCount > 0
    && completionReceipt.completedGameCount === completionReceipt.scheduledGameCount
    && /^[a-f0-9]{64}$/.test(completionReceipt.canonicalScheduleSha256 ?? ''),
  'A complete, supported season-completion receipt for this session is required.');
  return deriveFranchiseSeasonScheduleReceiptV1({
    schedule: session.schedule,
    teams: session.leagueState.teams,
    seasonStartYear: session.leagueState.seasonStartYear,
    expectedGamesByTeam: expectedGamesByTeamFromCompletion(session, completionReceipt),
    scenarioMetadata: completionReceipt.scenarioMetadata,
    cryptoProvider,
  });
}

/**
 * Generate a read-only end-of-season simulated awards result after confirming
 * the supplied current session, schedule, completion receipt, and revisions.
 * This action does not create a midseason All-Star snapshot or modify LeagueState.
 */
export async function previewFranchiseSeasonAwardsV1({
  session,
  expectedRevision,
  completionSessionRevision,
  scheduleReceipt,
  completionReceipt,
  awardsOptions,
  cryptoProvider = globalThis.crypto,
} = {}) {
  assert(plain(session), 'A current franchise browser session is required.');
  validateFranchiseBrowserSession(session);
  assert(Number.isSafeInteger(expectedRevision) && expectedRevision === session.revision,
    'Stale franchise session revision for end-season awards.');
  assert(Number.isSafeInteger(completionSessionRevision) && completionSessionRevision === expectedRevision,
    'Season completion receipt belongs to a stale franchise session revision.');
  validateAwardsOptions(awardsOptions);
  assert(plain(scheduleReceipt), 'A canonical schedule receipt is required.');
  assert(plain(completionReceipt), 'A verified season-completion receipt is required.');

  const seasonStartYear = session.leagueState.seasonStartYear;
  const rebuiltScheduleReceipt = await deriveFranchiseSeasonScheduleReceiptV1({
    schedule: session.schedule,
    teams: session.leagueState.teams,
    seasonStartYear,
    expectedGamesByTeam: scheduleReceipt.expectedGamesByTeam,
    scenarioMetadata: scheduleReceipt.scenarioMetadata,
    cryptoProvider,
  });
  assert(canonicalJson(rebuiltScheduleReceipt) === canonicalJson(scheduleReceipt),
    'Schedule receipt does not bind the exact current session schedule and teams.');

  const verifiedCompletion = await verifyFranchiseSeasonCompletionV1({
    receipt: scheduleReceipt,
    completedGames: session.leagueState.completedGames ?? [],
    seasonStartYear,
    cryptoProvider,
  });
  assert(canonicalJson(verifiedCompletion) === canonicalJson(completionReceipt),
    'Season completion receipt is incomplete, foreign, stale, or does not match the current completed-game ledger.');

  const sessionBeforeAwards = canonicalJson(session);
  const awards = labelEndSeasonAllStar(simulateSeasonAwards(clone(session.leagueState), {
    seed: awardsOptions.seed,
    policy: awardsOptions.policy === undefined ? null : clone(awardsOptions.policy),
    seasonComplete: true,
  }));
  assert(canonicalJson(session) === sessionBeforeAwards, 'End-season awards changed the current franchise session.');

  return {
    format: FRANCHISE_SEASON_AWARDS_PREVIEW_FORMAT,
    version: FRANCHISE_SEASON_AWARDS_PREVIEW_VERSION,
    status: 'development-scenario-awards-preview',
    readOnly: true,
    session: clone(session),
    receipt: {
      format: FRANCHISE_SEASON_AWARDS_PREVIEW_FORMAT,
      version: FRANCHISE_SEASON_AWARDS_PREVIEW_VERSION,
      previewFeatureFlag: 'seasonAwardsPreviewV1',
      classification: 'development-scenario; not-certified',
      seasonStartYear,
      sessionRevision: session.revision,
      stateQuality: clone(session.leagueState.stateQuality ?? null),
      provisionalState: session.leagueState.stateQuality?.status !== 'reconciled',
      sourcePackageId: session.sourceReceipt.packageId,
      sourcePackageVersion: session.sourceReceipt.packageVersion,
      modelId: session.modelReceipt.modelId,
      executedModelId: session.modelReceipt.executedModelId,
      scheduleKind: scheduleReceipt.scheduleKind,
      canonicalScheduleSha256: scheduleReceipt.canonicalScheduleSha256,
      scheduledGameCount: completionReceipt.scheduledGameCount,
      completedGameCount: completionReceipt.completedGameCount,
      completionStatus: completionReceipt.status,
      awardsSeed: awardsOptions.seed,
      awardsPolicyId: awards.policyId,
      awardsModelId: awards.modelId,
      seasonTiming: 'end-of-season-final-ledger',
      midseasonAllStarBallot: {
        status: 'not-produced',
        reason: 'A midseason All-Star ballot requires a separate cutoff-specific snapshot; final season statistics are not used for it.',
      },
      modelCertification: { calibrated: false, independentPredictiveCertification: false },
      disclosure: awards.disclosure,
    },
    awards: clone(awards),
  };
}

/**
 * Bind the read-only awards preview to the exact completion receipt returned
 * by the browser worker. The schedule receipt is reconstructed from the
 * completed counts and scenario metadata, then independently rechecked by
 * previewFranchiseSeasonAwardsV1 before awards are generated.
 */
export async function previewFranchiseSeasonAwardsForCompletedSessionV1({
  session,
  completionReceipt,
  completionSessionRevision,
  awardsSeed,
  awardsPolicy = null,
  cryptoProvider = globalThis.crypto,
} = {}) {
  assert(plain(session), 'A current franchise browser session is required.');
  assert(plain(completionReceipt), 'A verified season-completion receipt is required.');
  assert(completionReceipt.format === FRANCHISE_SEASON_COMPLETION_FORMAT
    && completionReceipt.version === FRANCHISE_SEASON_COMPLETION_VERSION
    && completionReceipt.scheduleComplete === true
    && completionReceipt.seasonStartYear === session.leagueState?.seasonStartYear
    && Number.isSafeInteger(completionReceipt.scheduledGameCount)
    && completionReceipt.scheduledGameCount > 0
    && completionReceipt.completedGameCount === completionReceipt.scheduledGameCount
    && /^[a-f0-9]{64}$/.test(completionReceipt.canonicalScheduleSha256 ?? ''),
  'A complete, supported season-completion receipt for this session is required.');
  assert(Number.isSafeInteger(completionSessionRevision) && completionSessionRevision === session.revision,
    'Season completion receipt belongs to a stale franchise session revision.');

  const expectedGamesByTeam = {};
  for (const team of session.leagueState?.teams ?? []) {
    const code = String(team?.teamCode ?? '').trim().toUpperCase();
    const scheduledGames = completionReceipt.teamGameCounts?.[code]?.scheduled?.games;
    assert(code && Number.isSafeInteger(scheduledGames) && scheduledGames >= 0,
      `Season completion receipt has no valid scheduled-game count for ${code || 'a session team'}.`);
    expectedGamesByTeam[code] = scheduledGames;
  }
  assert(Object.keys(completionReceipt.teamGameCounts ?? {}).length === Object.keys(expectedGamesByTeam).length,
    'Season completion receipt team counts do not match the current franchise teams.');

  const scheduleReceipt = await deriveFranchiseSeasonScheduleReceiptV1({
    schedule: session.schedule,
    teams: session.leagueState.teams,
    seasonStartYear: session.leagueState.seasonStartYear,
    expectedGamesByTeam,
    scenarioMetadata: completionReceipt.scenarioMetadata,
    cryptoProvider,
  });
  return previewFranchiseSeasonAwardsV1({
    session,
    expectedRevision: session.revision,
    completionSessionRevision,
    scheduleReceipt,
    completionReceipt,
    awardsOptions: { seed: awardsSeed, policy: awardsPolicy },
    cryptoProvider,
  });
}

/**
 * Record one compact simulated-awards history row after the regular-season
 * completion and games-to-season-end handoff both verify against this session.
 * A matching replay returns the existing row without advancing either revision.
 */
export async function finalizeFranchiseSeasonAwardsV1({
  session,
  expectedRevision,
  completionSessionRevision,
  scheduleReceipt,
  completionReceipt,
  handoffReceipt,
  awardsOptions,
  cryptoProvider = globalThis.crypto,
} = {}) {
  assert(plain(session), 'A current franchise browser session is required.');
  validateFranchiseBrowserSession(session);
  assert(Number.isSafeInteger(expectedRevision) && expectedRevision === session.revision,
    'Stale franchise session revision for season-awards finalization.');
  assert(Number.isSafeInteger(completionSessionRevision) && completionSessionRevision === expectedRevision,
    'Season completion receipt belongs to a stale franchise session revision.');
  validateAwardsOptions(awardsOptions);
  assert(session.leagueState.transactionWindow === 'season-end',
    'Season-awards finalization requires the season-end transaction window.');
  assert(plain(scheduleReceipt) && plain(completionReceipt) && plain(handoffReceipt),
    'Canonical schedule, completion, and season-end handoff receipts are required.');

  const seasonStartYear = session.leagueState.seasonStartYear;
  const yearKey = String(seasonStartYear);
  const savedHandoff = session.leagueState.franchiseLifecycleReceiptsBySeason?.[yearKey] ?? null;
  assert(canonicalJson(savedHandoff) === canonicalJson(handoffReceipt),
    'Season-end handoff receipt does not match the receipt stored in the current session.');
  const rebuiltScheduleReceipt = await deriveFranchiseSeasonScheduleReceiptV1({
    schedule: session.schedule,
    teams: session.leagueState.teams,
    seasonStartYear,
    expectedGamesByTeam: scheduleReceipt.expectedGamesByTeam,
    scenarioMetadata: scheduleReceipt.scenarioMetadata,
    cryptoProvider,
  });
  assert(canonicalJson(rebuiltScheduleReceipt) === canonicalJson(scheduleReceipt),
    'Schedule receipt does not bind the exact current session schedule and teams.');
  const verifiedHandoff = await validateFranchiseSeasonEndHandoffV1({
    session,
    scheduleReceipt: rebuiltScheduleReceipt,
    cryptoProvider,
  });
  assert(verifiedHandoff.status === 'pass' && verifiedHandoff.seasonStartYear === seasonStartYear,
    'A verified regular-season closeout handoff is required before recording awards.');
  const freshCompletion = verifiedHandoff.completion;
  assert(canonicalJson(freshCompletion) === canonicalJson(completionReceipt),
    'Season completion receipt is stale, incomplete, foreign, or does not match the closed session ledger.');
  assert(freshCompletion.scheduleComplete === true
    && freshCompletion.completedGameCount === freshCompletion.scheduledGameCount,
  'Season-awards finalization requires a fully completed regular-season ledger.');

  const awards = labelEndSeasonAllStar(simulateSeasonAwards(clone(session.leagueState), {
    seed: awardsOptions.seed,
    policy: awardsOptions.policy === undefined ? null : clone(awardsOptions.policy),
    // Completion is derived from the independently recomputed receipt above.
    seasonComplete: freshCompletion.scheduleComplete === true,
  }));
  const historyRecord = clone(awards.historyRecord);
  assert(plain(historyRecord) && historyRecord.seasonStartYear === seasonStartYear,
    'Season-awards model did not return a compact record for the current season.');
  const historyRecordSha256 = await sha256Hex(canonicalJson(historyRecord), cryptoProvider);
  const completionReceiptSha256 = await sha256Hex(canonicalJson(freshCompletion), cryptoProvider);
  const inputKey = {
    format: FRANCHISE_SEASON_AWARDS_FINALIZE_FORMAT,
    version: FRANCHISE_SEASON_AWARDS_FINALIZE_VERSION,
    seasonStartYear,
    sourceReceipt: clone(session.sourceReceipt),
    modelReceipt: clone(session.modelReceipt),
    completionReceiptSha256,
    canonicalScheduleSha256: freshCompletion.canonicalScheduleSha256,
    handoffReceiptSha256: savedHandoff.receiptSha256,
    awardsSeed: awards.seed,
    awardsPolicyId: awards.policyId,
    awardsModelId: awards.modelId,
    historyRecordSha256,
  };
  const inputKeySha256 = await sha256Hex(canonicalJson(inputKey), cryptoProvider);
  const historyBySeason = session.leagueState.awardHistoryBySeason;
  assert(historyBySeason === undefined || plain(historyBySeason),
    'Saved award history must be a plain record.');
  const existingRecord = historyBySeason?.[yearKey] ?? null;
  const finalizeActions = session.actionHistory.filter(row => row.kind === 'finalize-season-awards'
    && row.seasonStartYear === seasonStartYear);

  if (existingRecord) {
    assert(plain(existingRecord) && plain(existingRecord.finalizationReceipt),
      'This season already has an awards-history row without a supported finalization receipt.');
    const { finalizationReceipt, ...storedHistoryRecord } = existingRecord;
    assert(canonicalJson(storedHistoryRecord) === canonicalJson(historyRecord),
      'Awards were already finalized with a different compact history record.');
    assert(finalizationReceipt.format === FRANCHISE_SEASON_AWARDS_FINALIZE_FORMAT
      && finalizationReceipt.version === FRANCHISE_SEASON_AWARDS_FINALIZE_VERSION
      && finalizationReceipt.previewFeatureFlag === 'seasonAwardsFinalizeV1'
      && finalizationReceipt.classification === 'development-scenario; not-certified'
      && finalizationReceipt.status === 'season-awards-finalized'
      && finalizationReceipt.seasonStartYear === seasonStartYear
      && finalizationReceipt.inputKeySha256 === inputKeySha256
      && finalizationReceipt.historyRecordSha256 === historyRecordSha256
      && finalizationReceipt.completionReceiptSha256 === completionReceiptSha256
      && finalizationReceipt.canonicalScheduleSha256 === freshCompletion.canonicalScheduleSha256
      && finalizationReceipt.handoffReceiptSha256 === savedHandoff.receiptSha256
      && finalizationReceipt.awardsSeed === awards.seed
      && finalizationReceipt.awardsPolicyId === awards.policyId
      && finalizationReceipt.awardsModelId === awards.modelId
      && finalizationReceipt.allStarSelectionTiming === 'end-of-season-modeled-selection'
      && Number.isInteger(finalizationReceipt.priorSessionRevision)
      && finalizationReceipt.sessionRevision === finalizationReceipt.priorSessionRevision + 1
      && finalizationReceipt.sessionRevision <= session.revision,
    'Awards were already finalized with conflicting receipts or inputs.');
    const { receiptSha256, ...unsignedReceipt } = finalizationReceipt;
    assert(/^[a-f0-9]{64}$/.test(receiptSha256 ?? '')
      && await sha256Hex(canonicalJson(unsignedReceipt), cryptoProvider) === receiptSha256,
    'The saved season-awards finalization receipt SHA-256 is invalid.');
    assert(finalizeActions.length === 1
      && finalizeActions[0].revision === finalizationReceipt.sessionRevision
      && finalizeActions[0].finalizationReceiptSha256 === receiptSha256
      && finalizeActions[0].canonicalScheduleSha256 === freshCompletion.canonicalScheduleSha256
      && finalizeActions[0].handoffReceiptSha256 === savedHandoff.receiptSha256,
    'Season-awards action history does not bind the saved finalization receipt.');
    return {
      format: FRANCHISE_SEASON_AWARDS_FINALIZE_FORMAT,
      version: FRANCHISE_SEASON_AWARDS_FINALIZE_VERSION,
      status: 'season-awards-already-finalized',
      idempotentReplay: true,
      session: clone(session),
      receipt: clone(finalizationReceipt),
      historyRecord: clone(existingRecord),
      awards: clone(awards),
    };
  }

  assert(finalizeActions.length === 0,
    'Season-awards action history exists without its saved history record.');
  assert(savedHandoff.sessionRevision === session.revision
    && savedHandoff.leagueStateRevision === session.leagueState.revision,
  'The regular-season handoff receipt is stale for the current session revision.');
  assert(Number.isSafeInteger(session.revision) && session.revision < Number.MAX_SAFE_INTEGER
    && Number.isSafeInteger(session.leagueState.revision) && session.leagueState.revision < Number.MAX_SAFE_INTEGER,
  'Season-awards finalization cannot advance an invalid session revision.');

  const next = clone(session);
  next.revision += 1;
  next.leagueState.revision += 1;
  const unsignedReceipt = {
    format: FRANCHISE_SEASON_AWARDS_FINALIZE_FORMAT,
    version: FRANCHISE_SEASON_AWARDS_FINALIZE_VERSION,
    previewFeatureFlag: 'seasonAwardsFinalizeV1',
    classification: 'development-scenario; not-certified',
    status: 'season-awards-finalized',
    seasonStartYear,
    priorSessionRevision: session.revision,
    sessionRevision: next.revision,
    priorLeagueStateRevision: session.leagueState.revision,
    leagueStateRevision: next.leagueState.revision,
    sourceReceipt: clone(session.sourceReceipt),
    modelReceipt: clone(session.modelReceipt),
    completionReceiptSha256,
    canonicalScheduleSha256: freshCompletion.canonicalScheduleSha256,
    scheduledGameCount: freshCompletion.scheduledGameCount,
    completedGameCount: freshCompletion.completedGameCount,
    handoffReceiptSha256: savedHandoff.receiptSha256,
    inputKeySha256,
    historyRecordSha256,
    awardsSeed: awards.seed,
    awardsPolicyId: awards.policyId,
    awardsModelId: awards.modelId,
    stateQuality: clone(session.leagueState.stateQuality ?? null),
    provisionalState: session.leagueState.stateQuality?.status !== 'reconciled',
    allStarSelectionTiming: 'end-of-season-modeled-selection',
    disclosure: 'Records one reproducible simulated awards history row after verified regular-season completion and closeout. Results remain development-scenario output, not official awards or a certified forecast.',
  };
  const receipt = { ...unsignedReceipt, receiptSha256: await sha256Hex(canonicalJson(unsignedReceipt), cryptoProvider) };
  next.leagueState.awardHistoryBySeason = {
    ...(plain(next.leagueState.awardHistoryBySeason) ? next.leagueState.awardHistoryBySeason : {}),
    [yearKey]: { ...historyRecord, finalizationReceipt: receipt },
  };
  next.actionHistory.push({
    revision: next.revision,
    kind: 'finalize-season-awards',
    seasonStartYear,
    finalizationReceiptSha256: receipt.receiptSha256,
    canonicalScheduleSha256: freshCompletion.canonicalScheduleSha256,
    handoffReceiptSha256: savedHandoff.receiptSha256,
  });
  validateFranchiseBrowserSession(next);
  const verifiedAfterWrite = await validateFranchiseSeasonEndHandoffV1({
    session: next,
    scheduleReceipt: rebuiltScheduleReceipt,
    cryptoProvider,
  });
  assert(verifiedAfterWrite.status === 'pass'
    && canonicalJson(verifiedAfterWrite.completion) === canonicalJson(freshCompletion),
  'The closed-season receipts did not remain valid after awards were recorded.');

  return {
    format: FRANCHISE_SEASON_AWARDS_FINALIZE_FORMAT,
    version: FRANCHISE_SEASON_AWARDS_FINALIZE_VERSION,
    status: 'season-awards-finalized',
    idempotentReplay: false,
    session: next,
    receipt,
    historyRecord: clone(next.leagueState.awardHistoryBySeason[yearKey]),
    awards: clone(awards),
  };
}

/** Build the exact schedule and saved closeout inputs for browser preview use. */
export async function finalizeFranchiseSeasonAwardsForClosedSessionV1({
  session,
  expectedRevision,
  completionReceipt,
  completionSessionRevision,
  awardsSeed,
  awardsPolicy = null,
  cryptoProvider = globalThis.crypto,
} = {}) {
  assert(plain(session), 'A current franchise browser session is required.');
  validateFranchiseBrowserSession(session);
  assert(Number.isSafeInteger(expectedRevision) && expectedRevision === session.revision,
    'Stale franchise session revision for season-awards finalization.');
  assert(Number.isSafeInteger(completionSessionRevision) && completionSessionRevision === expectedRevision,
    'Season completion receipt belongs to a stale franchise session revision.');
  assert(plain(completionReceipt), 'A verified season-completion receipt is required.');
  const scheduleReceipt = await deriveScheduleReceiptFromCompletion(session, completionReceipt, cryptoProvider);
  const handoffReceipt = session.leagueState.franchiseLifecycleReceiptsBySeason?.[String(session.leagueState.seasonStartYear)];
  assert(plain(handoffReceipt), 'A verified regular-season closeout handoff receipt is required.');
  return finalizeFranchiseSeasonAwardsV1({
    session,
    expectedRevision,
    completionSessionRevision,
    scheduleReceipt,
    completionReceipt,
    handoffReceipt,
    awardsOptions: { seed: awardsSeed, policy: awardsPolicy },
    cryptoProvider,
  });
}
