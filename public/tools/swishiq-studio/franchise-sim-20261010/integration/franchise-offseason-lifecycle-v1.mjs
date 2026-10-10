/**
 * Browser-safe lifecycle boundary for a Franchise save after regular-season
 * play. The underlying league modules own game simulation, awards, CBA rules,
 * and schedules. This module only binds their state changes to a saved
 * Franchise session with exact revisions and explicit scenario provenance.
 */
import {
  FRANCHISE_BROWSER_SESSION_FORMAT,
  FRANCHISE_BROWSER_SESSION_VERSION,
  validateFranchiseBrowserSession,
} from '../lib/franchise-browser-session-v1.mjs';
import { validateLeagueState } from '../lib/simulation-contracts-v1.mjs';
import { advanceLeagueSeason, advanceLeagueWindow } from '../lib/season-simulation-v1.mjs';
import { sha256HexV1, stableStringifyV1 } from '../lib/sha256-isomorphic-v1.mjs';
import { FRANCHISE_POSTSEASON_COMPLETION_FORMAT } from './franchise-postseason-completion-v1.mjs';

export const FRANCHISE_OFFSEASON_LIFECYCLE_FORMAT = 'djhc-franchise-offseason-lifecycle-v1';
export const FRANCHISE_OFFSEASON_LIFECYCLE_VERSION = '1.1.0';
export const FRANCHISE_OFFSEASON_LIFECYCLE_CAPABILITIES = Object.freeze({
  futureScenarioSourceReceipt: true,
  seasonRollover: true,
  windowAdvance: true,
  phaseRunner: true,
  approvalResolutionBridge: true,
  postseasonCompletionGate: true,
  phaseExecutors: false,
  approvalResolver: false,
});

export function getFranchiseOffseasonLifecycleCapabilitiesV1() {
  return { ...FRANCHISE_OFFSEASON_LIFECYCLE_CAPABILITIES };
}

const clone = value => structuredClone(value);
const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalJson(value) {
  return stableStringifyV1(value);
}

function assertSessionRevision(session, expectedRevision) {
  validateFranchiseBrowserSession(session);
  requireValue(Number.isSafeInteger(expectedRevision) && expectedRevision === session.revision,
    'This action was prepared against a stale or missing franchise revision.');
}

function assertNoPendingOffseasonApproval(session, actionLabel) {
  requireValue(!session.pendingOffseasonApproval,
    `${actionLabel} is blocked until the saved user approval is explicitly accepted, rejected, or countered.`);
}

function assertSourceReceipt(receipt, seasonStartYear, label = 'source receipt') {
  requireValue(plain(receipt)
    && typeof receipt.packageId === 'string' && receipt.packageId.trim()
    && typeof receipt.packageVersion === 'string' && receipt.packageVersion.trim()
    && /^[a-f0-9]{64}$/i.test(receipt.packageManifestSha256 ?? '')
    && receipt.seasonStartYear === seasonStartYear,
  `${label} must pin one exact target season, package ID, version, and SHA-256.`);
}

function assertModelReceipt(receipt) {
  requireValue(plain(receipt)
    && typeof receipt.modelId === 'string' && receipt.modelId.trim()
    && typeof receipt.executedModelId === 'string' && receipt.executedModelId.trim()
    && /^[a-f0-9]{64}$/i.test(receipt.contentSha256 ?? ''),
  'A complete model receipt is required for the next Franchise season.');
}

function normalizeBrowserSchedule(schedule, state) {
  requireValue(Array.isArray(schedule) && schedule.length > 0,
    'A nonempty next-season schedule is required before creating a playable Franchise session.');
  const teams = new Set((state.teams ?? []).map(team => String(team.teamCode).toUpperCase()));
  const seen = new Set();
  const booked = new Set();
  const normalized = schedule.map((row, index) => {
    const gameId = String(row?.gameId ?? '').trim();
    const gameLocalDate = row?.gameLocalDate ?? row?.date ?? null;
    const homeTeamCode = String(row?.homeTeamCode ?? row?.homeTeam ?? '').trim().toUpperCase();
    const awayTeamCode = String(row?.awayTeamCode ?? row?.awayTeam ?? '').trim().toUpperCase();
    requireValue(gameId && !seen.has(gameId), `Next-season schedule game ${index + 1} needs a unique game ID.`);
    requireValue(typeof gameLocalDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(gameLocalDate)
      && Number.isFinite(Date.parse(`${gameLocalDate}T00:00:00.000Z`)),
    `Next-season schedule game ${gameId} needs an ISO local date.`);
    requireValue(Number(gameLocalDate.slice(0, 4)) === state.seasonStartYear
      || Number(gameLocalDate.slice(0, 4)) === state.seasonStartYear + 1,
    `Next-season schedule game ${gameId} belongs to another season.`);
    requireValue(teams.has(homeTeamCode) && teams.has(awayTeamCode) && homeTeamCode !== awayTeamCode,
      `Next-season schedule game ${gameId} has an invalid matchup.`);
    for (const teamCode of [homeTeamCode, awayTeamCode]) {
      const key = `${gameLocalDate}:${teamCode}`;
      requireValue(!booked.has(key), `Next-season schedule double-books ${teamCode} on ${gameLocalDate}.`);
      booked.add(key);
    }
    seen.add(gameId);
    return { gameId, gameLocalDate, homeTeamCode, awayTeamCode, seasonStartYear: state.seasonStartYear,
      sourceRef: typeof row?.sourceRef === 'string' ? row.sourceRef : null };
  });
  return normalized.sort((left, right) => left.gameLocalDate.localeCompare(right.gameLocalDate)
    || left.gameId.localeCompare(right.gameId));
}

function lifecycleReceiptFor(state, seasonStartYear) {
  return state?.franchiseLifecycleReceiptsBySeason?.[String(seasonStartYear)] ?? null;
}

function awardsReceiptFor(state, seasonStartYear) {
  return state?.awardHistoryBySeason?.[String(seasonStartYear)]?.finalizationReceipt ?? null;
}

function postseasonReceiptFor(state, seasonStartYear) {
  return state?.franchisePostseasonReceiptsBySeason?.[String(seasonStartYear)] ?? null;
}

function assertCompletedPostseason(state, seasonStartYear) {
  const receipt = postseasonReceiptFor(state, seasonStartYear);
  const champion = state?.postseasonHistoryBySeason?.[String(seasonStartYear)]?.champion?.teamCode;
  requireValue(receipt?.format === FRANCHISE_POSTSEASON_COMPLETION_FORMAT
    && receipt.status === 'franchise-postseason-completed'
    && receipt.seasonStartYear === seasonStartYear
    && receipt.leagueStateRevision === state.revision
    && typeof receipt.postseasonResultSha256 === 'string' && /^[a-f0-9]{64}$/i.test(receipt.postseasonResultSha256)
    && typeof receipt.receiptSha256 === 'string' && /^[a-f0-9]{64}$/i.test(receipt.receiptSha256)
    && receipt.champion?.teamCode === champion,
  'Franchise season rollover requires the verified simulated postseason completion receipt and championship history.');
}

function assertClosedSeason(state, { requireLifecycleReceipt = true, requireAwards = true, requirePostseason = true } = {}) {
  requireValue(state?.transactionWindow === 'season-end',
    'Franchise season rollover requires a season-end LeagueState.');
  const year = state.seasonStartYear;
  if (requireLifecycleReceipt) {
    const receipt = lifecycleReceiptFor(state, year);
    requireValue(receipt?.status === 'regular-season-closed' && receipt.seasonStartYear === year,
      'Franchise season rollover requires a verified regular-season closeout receipt.');
  }
  if (requireAwards) {
    const receipt = awardsReceiptFor(state, year);
    requireValue(receipt?.status === 'season-awards-finalized' && receipt.seasonStartYear === year,
      'Franchise season rollover requires finalized simulated awards for the completed season.');
  }
  if (requirePostseason) assertCompletedPostseason(state, year);
}

function createTransitionReceipt({ session, nextSession, sourceSeasonStartYear, targetSeasonStartYear, seasonTransition,
  sourceKind, sourceReceipt, modelReceipt, schedule }) {
  const unsigned = {
    format: FRANCHISE_OFFSEASON_LIFECYCLE_FORMAT,
    version: FRANCHISE_OFFSEASON_LIFECYCLE_VERSION,
    status: 'season-transitioned',
    sourceSeasonStartYear,
    targetSeasonStartYear,
    sourceSessionRevision: session.revision,
    targetSessionRevision: nextSession.revision,
    sourceLeagueStateRevision: session.leagueState.revision,
    targetLeagueStateRevision: nextSession.leagueState.revision,
    sourceReceipt: clone(session.sourceReceipt),
    targetSourceReceipt: clone(sourceReceipt),
    sourceModelReceipt: clone(session.modelReceipt),
    targetModelReceipt: clone(modelReceipt),
    sourceKind,
    seasonTransition: clone(seasonTransition),
    scheduleGameCount: schedule.length,
    scheduleSha256: sha256HexV1(canonicalJson(schedule)),
    scenarioOnly: nextSession.leagueState.stateQuality?.status !== 'reconciled',
    disclosure: 'Advances player age exactly once through the LeagueState transition. Future ratings, payrolls, rules, and schedules retain their individual observed or generated-scenario provenance.',
  };
  return { ...unsigned, receiptSha256: sha256HexV1(canonicalJson(unsigned)) };
}

/**
 * Produce a distinct, source-pinned receipt when a future Franchise season is
 * generated from the previous package plus explicit projections/scenario
 * inputs. It intentionally does not mislabel a generated season as observed
 * package evidence.
 */
export function createFutureFranchiseScenarioSourceReceiptV1({
  sourceReceipt,
  targetSeasonStartYear,
  scenarioId = 'future-franchise-scenario',
  projectionReceipt = null,
  scheduleState = null,
} = {}) {
  requireValue(Number.isInteger(targetSeasonStartYear), 'A target future season is required.');
  assertSourceReceipt(sourceReceipt, sourceReceipt?.seasonStartYear, 'Prior source receipt');
  const normalizedScenarioId = String(scenarioId ?? '').trim();
  requireValue(normalizedScenarioId.length >= 3, 'Future scenario ID must contain at least three characters.');
  const payload = {
    format: 'djhc-franchise-future-source-scenario-v1',
    version: '1.0.0',
    targetSeasonStartYear,
    scenarioId: normalizedScenarioId,
    priorSourceReceipt: clone(sourceReceipt),
    projectionReceiptSha256: projectionReceipt ? sha256HexV1(canonicalJson(projectionReceipt)) : null,
    scheduleStateSha256: scheduleState ? sha256HexV1(canonicalJson(scheduleState)) : null,
  };
  return {
    packageId: `${sourceReceipt.packageId}:scenario:${normalizedScenarioId}`,
    packageVersion: `scenario-${targetSeasonStartYear}-v1`,
    packageManifestSha256: sha256HexV1(canonicalJson(payload)),
    seasonStartYear: targetSeasonStartYear,
    sourceClass: 'generated-scenario',
    sourceScenario: payload,
    disclosure: 'Generated future-season scenario receipt. It is not an observed SwishIQ package or an authenticated historical record.',
  };
}

/**
 * Move a verified closed Franchise state to the following preseason. Future
 * profile overlays may be injected by a caller through `rollover` only when
 * they return the normal `{ state, seasonTransition, projectionReceipt? }`
 * contract; the default uses the standard single-age-transition API.
 */
export function advanceFranchiseToNextSeasonV1({
  session,
  expectedRevision,
  nextSourceReceipt = null,
  nextModelReceipt = null,
  nextSeasonOptions = {},
  rollover = null,
  requireLifecycleReceipt = true,
  requireAwards = true,
  requirePostseason = true,
} = {}) {
  assertSessionRevision(session, expectedRevision);
  assertNoPendingOffseasonApproval(session, 'Franchise season rollover');
  const sourceState = session.leagueState;
  assertClosedSeason(sourceState, { requireLifecycleReceipt, requireAwards, requirePostseason });
  const sourceSeasonStartYear = sourceState.seasonStartYear;
  const targetSeasonStartYear = sourceSeasonStartYear + 1;
  requireValue(nextSeasonOptions && typeof nextSeasonOptions === 'object' && !Array.isArray(nextSeasonOptions),
    'Next-season options must be a plain object.');

  const transition = typeof rollover === 'function'
    ? rollover(clone(sourceState), targetSeasonStartYear, clone(nextSeasonOptions))
    : advanceLeagueSeason(sourceState, targetSeasonStartYear, clone(nextSeasonOptions));
  const seasonTransition = transition?.result ?? transition?.seasonTransition ?? null;
  requireValue(plain(transition) && plain(transition.state) && plain(seasonTransition),
    'Season rollover must return a normal LeagueState transition result.');
  const nextState = clone(transition.state);
  validateLeagueState(nextState);
  requireValue(nextState.seasonStartYear === targetSeasonStartYear && nextState.transactionWindow === 'preseason',
    'Season rollover must create the immediate next preseason.');
  requireValue(nextState.lastSeasonAged === sourceSeasonStartYear,
    'Season rollover must advance player age exactly once for the completed season.');

  const scheduleRows = nextState.seasonSchedule?.games ?? nextSeasonOptions.browserSchedule ?? null;
  const schedule = normalizeBrowserSchedule(scheduleRows, nextState);
  const projectedSourceReceipt = nextSourceReceipt ?? createFutureFranchiseScenarioSourceReceiptV1({
    sourceReceipt: session.sourceReceipt,
    targetSeasonStartYear,
    projectionReceipt: transition.projectionReceipt ?? null,
    scheduleState: nextState.seasonScheduleState ?? null,
  });
  assertSourceReceipt(projectedSourceReceipt, targetSeasonStartYear, 'Next-season source receipt');
  const modelReceipt = clone(nextModelReceipt ?? session.modelReceipt);
  assertModelReceipt(modelReceipt);

  const next = {
    format: FRANCHISE_BROWSER_SESSION_FORMAT,
    schemaVersion: FRANCHISE_BROWSER_SESSION_VERSION,
    revision: session.revision + 1,
    seed: session.seed,
    sourceReceipt: clone(projectedSourceReceipt),
    modelReceipt,
    leagueState: nextState,
    schedule,
    scheduleCursor: 0,
    actionHistory: [...clone(session.actionHistory), {
      revision: session.revision + 1,
      kind: 'advance-franchise-season',
      sourceSeasonStartYear,
      targetSeasonStartYear,
      sourceLeagueStateRevision: sourceState.revision,
      targetLeagueStateRevision: nextState.revision,
    }],
    disclosure: 'Player-driven franchise scenario from a development model. Generated contracts, projections, rules, and incomplete legal inputs remain explicit provisional scenario inputs.',
  };
  const receipt = createTransitionReceipt({ session, nextSession: next, sourceSeasonStartYear, targetSeasonStartYear,
    seasonTransition, sourceKind: typeof rollover === 'function' ? 'caller-supplied-future-profile-rollover' : 'standard-league-transition',
    sourceReceipt: projectedSourceReceipt, modelReceipt, schedule });
  next.leagueState.franchiseSeasonTransitionsBySeason = {
    ...(plain(next.leagueState.franchiseSeasonTransitionsBySeason)
      ? next.leagueState.franchiseSeasonTransitionsBySeason : {}),
    [String(targetSeasonStartYear)]: receipt,
  };
  validateFranchiseBrowserSession(next);
  return {
    format: FRANCHISE_OFFSEASON_LIFECYCLE_FORMAT,
    version: FRANCHISE_OFFSEASON_LIFECYCLE_VERSION,
    status: 'next-season-preseason-ready',
    session: next,
    receipt,
    seasonTransition: clone(seasonTransition),
    projectionReceipt: clone(transition.projectionReceipt ?? null),
  };
}

/** Advance exactly one offseason window without allowing the UI to skip CBA or
 * decision phases. A phase implementation should execute while its named
 * window is active, then call this only after it has committed or persisted
 * any pending approval. */
export function advanceFranchiseOffseasonWindowV1({ session, expectedRevision, nextWindow } = {}) {
  assertSessionRevision(session, expectedRevision);
  assertNoPendingOffseasonApproval(session, 'Offseason window advancement');
  requireValue(session.leagueState.transactionWindow !== 'games' && session.leagueState.transactionWindow !== 'season-end',
    'Offseason window advancement is only available after season rollover and before games.');
  const nextState = advanceLeagueWindow(session.leagueState, nextWindow);
  const next = clone(session);
  next.revision += 1;
  next.leagueState = nextState;
  next.actionHistory.push({ revision: next.revision, kind: 'advance-offseason-window',
    seasonStartYear: nextState.seasonStartYear, fromWindow: session.leagueState.transactionWindow, toWindow: nextWindow,
    sourceLeagueStateRevision: session.leagueState.revision, targetLeagueStateRevision: nextState.revision });
  validateFranchiseBrowserSession(next);
  return {
    format: FRANCHISE_OFFSEASON_LIFECYCLE_FORMAT,
    version: FRANCHISE_OFFSEASON_LIFECYCLE_VERSION,
    status: 'offseason-window-advanced',
    session: next,
    window: nextWindow,
  };
}

/**
 * Apply one injected, revision-bound phase result. The phase function must
 * return an independently validated LeagueState for the current season and
 * cannot advance the calendar itself. Pending user choices are persisted as
 * data so a save/reload cannot auto-approve a transaction or draft pick.
 */
export async function runFranchiseOffseasonPhaseV1({
  session,
  expectedRevision,
  window,
  execute,
  context = null,
} = {}) {
  assertSessionRevision(session, expectedRevision);
  assertNoPendingOffseasonApproval(session, 'An automatic offseason phase');
  requireValue(typeof window === 'string' && window === session.leagueState.transactionWindow,
    'The offseason phase must match the current transaction window.');
  requireValue(typeof execute === 'function', 'An explicit offseason phase executor is required.');
  const result = await execute(clone(session.leagueState), clone(context));
  requireValue(plain(result) && typeof result.status === 'string',
    'Offseason phase executor must return a status result.');
  const returnedState = result.state ?? session.leagueState;
  validateLeagueState(returnedState);
  requireValue(returnedState.seasonStartYear === session.leagueState.seasonStartYear
    && returnedState.transactionWindow === session.leagueState.transactionWindow,
  'An offseason phase may not change season or transaction window directly.');
  requireValue(returnedState.revision >= session.leagueState.revision,
    'An offseason phase may not regress the LeagueState revision.');
  const next = clone(session);
  next.revision += 1;
  next.leagueState = clone(returnedState);
  if (/awaiting-user-approval|pending-user-approval/i.test(result.status)) {
    requireValue(plain(result.pendingProposal ?? result.pendingApproval),
      'A user-approval phase result must include the exact pending proposal or approval payload.');
    next.pendingOffseasonApproval = {
      window,
      stateRevision: next.leagueState.revision,
      status: result.status,
      proposal: clone(result.pendingProposal ?? result.pendingApproval),
      decisionReceipt: clone(result.pendingDecisionReceipt ?? result.decisionReceipt ?? null),
    };
  } else {
    delete next.pendingOffseasonApproval;
  }
  next.actionHistory.push({ revision: next.revision, kind: 'run-offseason-phase', window,
    phaseStatus: result.status, sourceLeagueStateRevision: session.leagueState.revision,
    targetLeagueStateRevision: next.leagueState.revision });
  validateFranchiseBrowserSession(next);
  return {
    format: FRANCHISE_OFFSEASON_LIFECYCLE_FORMAT,
    version: FRANCHISE_OFFSEASON_LIFECYCLE_VERSION,
    status: result.status,
    session: next,
    result: clone(result),
    pendingApproval: clone(next.pendingOffseasonApproval ?? null),
  };
}

/**
 * Resolve a previously persisted approval only through a caller-supplied,
 * engine-owned decision adapter. This keeps the browser lifecycle layer from
 * reimplementing trade, free-agency, or draft rules while ensuring approval is
 * still revision-bound and durable in a save.
 */
export async function resolveFranchiseOffseasonApprovalV1({
  session,
  expectedRevision,
  decision,
  resolve,
  context = null,
} = {}) {
  assertSessionRevision(session, expectedRevision);
  const pending = session.pendingOffseasonApproval;
  requireValue(plain(pending) && plain(pending.proposal) && typeof pending.window === 'string',
    'No saved offseason approval is available to resolve.');
  requireValue(typeof decision === 'string' && ['approve', 'reject', 'counter'].includes(decision),
    'Approval resolution requires approve, reject, or counter.');
  requireValue(typeof resolve === 'function', 'An engine-owned approval resolver is required.');
  const result = await resolve(clone(session.leagueState), clone(pending), decision, clone(context));
  requireValue(plain(result) && typeof result.status === 'string',
    'Approval resolver must return a status result.');
  const returnedState = result.state ?? session.leagueState;
  validateLeagueState(returnedState);
  requireValue(returnedState.seasonStartYear === session.leagueState.seasonStartYear
    && returnedState.transactionWindow === session.leagueState.transactionWindow,
  'Approval resolution may not change season or transaction window directly.');
  requireValue(returnedState.revision >= session.leagueState.revision,
    'Approval resolution may not regress the LeagueState revision.');
  const next = clone(session);
  next.revision += 1;
  next.leagueState = clone(returnedState);
  const nextPending = result.pendingProposal ?? result.pendingApproval ?? null;
  if (nextPending) {
    next.pendingOffseasonApproval = {
      window: session.leagueState.transactionWindow,
      stateRevision: next.leagueState.revision,
      status: result.status,
      proposal: clone(nextPending),
      decisionReceipt: clone(result.pendingDecisionReceipt ?? result.decisionReceipt ?? null),
    };
  } else {
    delete next.pendingOffseasonApproval;
  }
  next.actionHistory.push({ revision: next.revision, kind: 'resolve-offseason-approval',
    window: session.leagueState.transactionWindow, decision, resolutionStatus: result.status,
    sourceLeagueStateRevision: session.leagueState.revision, targetLeagueStateRevision: next.leagueState.revision });
  validateFranchiseBrowserSession(next);
  return {
    format: FRANCHISE_OFFSEASON_LIFECYCLE_FORMAT,
    version: FRANCHISE_OFFSEASON_LIFECYCLE_VERSION,
    status: result.status,
    session: next,
    result: clone(result),
    pendingApproval: clone(next.pendingOffseasonApproval ?? null),
  };
}
