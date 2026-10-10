import { validateFranchiseBrowserSession } from '../lib/franchise-browser-session-v1.mjs';
import { simulateLeaguePostseason } from '../lib/season-simulation-v1.mjs';
import { sha256HexV1, stableStringifyV1 } from '../lib/sha256-isomorphic-v1.mjs';
import {
  FRANCHISE_SEASON_AWARDS_FINALIZE_FORMAT,
  finalizeFranchiseSeasonAwardsForClosedSessionV1,
} from './franchise-season-awards-preview-v1.mjs';

export const FRANCHISE_POSTSEASON_COMPLETION_FORMAT = 'djhc-franchise-postseason-completion-v1';
export const FRANCHISE_POSTSEASON_COMPLETION_VERSION = '1.0.0';

const clone = value => structuredClone(value);
const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const canonicalJson = value => stableStringifyV1(value);

function regularSeasonLedgerSnapshot(state, seasonStartYear) {
  return {
    completedGames: (state.completedGames ?? []).filter(row => row.seasonStartYear === seasonStartYear),
    teamGameLogs: (state.teamGameLogs ?? []).filter(row => row.seasonStartYear === seasonStartYear),
    playerGameLogs: (state.playerGameLogs ?? []).filter(row => row.seasonStartYear === seasonStartYear),
    teams: state.teams.map(team => ({ teamCode: team.teamCode,
      seasonStats: clone(team.seasonStatsByYear?.[String(seasonStartYear)] ?? null) })),
    players: state.players.map(player => ({ canonicalName: player.canonicalName,
      seasonStats: clone(player.seasonStatsByYear?.[String(seasonStartYear)] ?? null) })),
  };
}

function expectedGamesByTeamFromCompletion(session, completionReceipt) {
  const expected = {};
  for (const team of session.leagueState.teams) {
    const teamCode = String(team.teamCode ?? '').trim().toUpperCase();
    const count = completionReceipt?.teamGameCounts?.[teamCode]?.scheduled?.games;
    requireValue(teamCode && Number.isSafeInteger(count) && count > 0,
      `The verified season-completion receipt has no scheduled-game count for ${teamCode || 'a session team'}.`);
    expected[teamCode] = count;
  }
  requireValue(Object.keys(completionReceipt?.teamGameCounts ?? {}).length === session.leagueState.teams.length,
    'The verified season-completion receipt team set does not match this franchise session.');
  return expected;
}

function verifyMatchupInput(input, context, seasonStartYear) {
  requireValue(plain(input), `Postseason matchup ${context.gameId} has no caller-supplied game input.`);
  requireValue(input.seasonStartYear === seasonStartYear && input.gameId === context.gameId,
    `Postseason matchup input ${context.gameId} has a missing or wrong season/game identity.`);
  const home = String(input.homeTeamCode ?? input.home?.teamCode ?? '').trim().toUpperCase();
  const away = String(input.awayTeamCode ?? input.away?.teamCode ?? '').trim().toUpperCase();
  requireValue(home === context.homeTeam.teamCode && away === context.awayTeam.teamCode,
    `Postseason matchup input ${context.gameId} must preserve home/away teams ${context.homeTeam.teamCode}/${context.awayTeam.teamCode}.`);
  return clone(input);
}

/**
 * Complete one verified franchise postseason. The input session is immutable;
 * a successful run returns one new revision with a receipt, one action-history
 * row, championship history, and postseason statistics under separate fields.
 */
export async function completeFranchisePostseasonV1({
  session,
  expectedRevision,
  seasonStartYear,
  completionReceipt,
  awardsSeed,
  awardsPolicy = null,
  postseasonSeed,
  gameModel,
  loadedModelReceipt,
  gameInputForMatchup,
  simulateGameFn,
  playInPolicy = 'auto',
  finalsHomeCourtTeamCode = null,
  restDaysForMatchup = null,
  gameOptions = {},
  maxTieRedraws = 20,
} = {}) {
  requireValue(plain(session), 'A current revision-bound franchise browser session is required.');
  validateFranchiseBrowserSession(session);
  requireValue(Number.isSafeInteger(expectedRevision) && expectedRevision === session.revision,
    'Stale or missing franchise session revision for postseason completion.');
  requireValue(Number.isSafeInteger(session.revision) && session.revision < Number.MAX_SAFE_INTEGER
    && Number.isSafeInteger(session.leagueState.revision) && session.leagueState.revision < Number.MAX_SAFE_INTEGER,
  'Postseason completion cannot advance an invalid franchise or LeagueState revision.');
  const year = session.leagueState.seasonStartYear;
  requireValue(Number.isInteger(seasonStartYear) && seasonStartYear === year,
    'Postseason completion season does not match the current franchise session.');
  requireValue(session.leagueState.transactionWindow === 'season-end'
    && session.scheduleCursor === session.schedule.length && session.schedule.length > 0,
  'Postseason completion requires a verified regular-season closeout and exhausted schedule.');
  requireValue(Number.isSafeInteger(postseasonSeed) && postseasonSeed >= 0 && postseasonSeed <= 0xffffffff,
    'Postseason seed must be an explicit unsigned 32-bit integer.');
  requireValue(Number.isSafeInteger(awardsSeed) && awardsSeed >= 0 && awardsSeed <= 0xffffffff,
    'The finalized awards seed must be supplied to verify the current season award receipt.');
  requireValue(plain(completionReceipt), 'A verified regular-season completion receipt is required.');
  requireValue(typeof gameInputForMatchup === 'function',
    'Postseason completion requires caller-supplied inputs for every matchup.');
  requireValue(typeof simulateGameFn === 'function',
    'Postseason completion requires the pinned game runner.');
  requireValue(plain(gameOptions), 'Postseason game options must be a plain object.');
  requireValue(gameModel?.modelId === session.modelReceipt.modelId,
    'Loaded game model does not match the franchise session pin.');
  requireValue(plain(loadedModelReceipt)
    && canonicalJson(loadedModelReceipt) === canonicalJson(session.modelReceipt),
  'The verified loaded model receipt does not match the franchise session pin.');

  const yearKey = String(year);
  const awardHistory = session.leagueState.awardHistoryBySeason?.[yearKey];
  const awardReceipt = awardHistory?.finalizationReceipt;
  const awardActions = session.actionHistory.filter(row => row.kind === 'finalize-season-awards' && row.seasonStartYear === year);
  requireValue(plain(awardHistory) && awardReceipt?.format === FRANCHISE_SEASON_AWARDS_FINALIZE_FORMAT
    && awardReceipt.status === 'season-awards-finalized' && awardActions.length === 1,
  'Finalized simulated awards are required before postseason completion.');

  const duplicateActions = session.actionHistory.filter(row => row.kind === 'complete-franchise-postseason' && row.seasonStartYear === year);
  requireValue(!session.leagueState.postseasonHistoryBySeason?.[yearKey]
    && !session.leagueState.playerPostseasonStatsByYear?.[yearKey]
    && !session.leagueState.franchisePostseasonReceiptsBySeason?.[yearKey]
    && duplicateActions.length === 0,
  'This season already has a postseason result; duplicate postseason runs are refused.');

  // The awards finalizer's identical-replay path revalidates both the saved
  // closeout receipt and finalized award row without mutating the input.
  const awardVerification = await finalizeFranchiseSeasonAwardsForClosedSessionV1({
    session,
    expectedRevision,
    completionReceipt,
    completionSessionRevision: expectedRevision,
    awardsSeed,
    awardsPolicy,
  });
  requireValue(awardVerification.status === 'season-awards-already-finalized'
    && awardVerification.idempotentReplay === true
    && canonicalJson(awardVerification.session) === canonicalJson(session),
  'Regular-season closeout and finalized awards did not verify for the exact current session.');

  const expectedGamesByTeam = expectedGamesByTeamFromCompletion(session, completionReceipt);
  const gameInputs = [];
  const pinnedInput = context => {
    const input = verifyMatchupInput(gameInputForMatchup(clone(context)), context, year);
    gameInputs.push({ gameId: context.gameId, seasonStartYear: input.seasonStartYear,
      homeTeamCode: input.homeTeamCode ?? input.home?.teamCode,
      awayTeamCode: input.awayTeamCode ?? input.away?.teamCode });
    return input;
  };
  const pinnedGameRunner = Object.assign((model, input, options) => {
    const output = simulateGameFn(model, clone(input), clone(options));
    requireValue(plain(output) && output.modelId === session.modelReceipt.executedModelId,
      'Postseason game runner does not match the session executed-engine pin.');
    requireValue(!/requires-review|blocked|failed|error|unknown/.test(String(output.status ?? 'unknown')),
      'The pinned postseason game runner requires review; no postseason was committed.');
    requireValue(output.sampleCount === 1 && Array.isArray(output.simulations) && output.simulations.length === 1,
      'Postseason completion requires exactly one realized game sample per matchup.');
    return output;
  }, { supportedScenarioControls: simulateGameFn.supportedScenarioControls ?? [] });

  const seasonLedger = regularSeasonLedgerSnapshot(session.leagueState, year);
  const seasonLedgerSha256 = sha256HexV1(seasonLedger);
  const simulation = simulateLeaguePostseason(clone(session.leagueState), gameModel, {
    regularSeasonGames: clone(session.leagueState.completedGames ?? []),
    expectedGamesByTeam,
    ...(new Set(Object.values(expectedGamesByTeam)).size === 1
      ? { expectedGamesPerTeam: Object.values(expectedGamesByTeam)[0] } : {}),
    seed: postseasonSeed,
    playInPolicy,
    finalsHomeCourtTeamCode,
    restDaysForMatchup,
    gameInputForMatchup: pinnedInput,
    simulateGameFn: pinnedGameRunner,
    gameOptions: clone(gameOptions),
    maxTieRedraws,
  });

  const postseason = simulation.postseason;
  requireValue(plain(postseason) && postseason.seasonStartYear === year && postseason.champion?.teamCode
    && Array.isArray(postseason.games) && postseason.games.length > 0,
  'The postseason simulator did not return a complete result for the current season.');
  requireValue(simulation.resultingState.revision === session.leagueState.revision + 1,
    'Postseason completion must advance the LeagueState revision exactly once.');
  requireValue(gameInputs.length === postseason.games.length
    && postseason.games.every((game, index) => gameInputs[index]?.gameId === game.gameId),
  'Caller-supplied postseason matchup inputs were missing or incomplete.');
  requireValue(canonicalJson(regularSeasonLedgerSnapshot(simulation.resultingState, year)) === canonicalJson(seasonLedger),
    'Postseason simulation changed the regular-season games, logs, or season statistics.');

  const resultingState = clone(simulation.resultingState);
  // simulateLeaguePostseason also computes an awards preview; retain the
  // already-finalized, receipt-bound awards history as the authoritative row.
  resultingState.awardHistoryBySeason ??= {};
  resultingState.awardHistoryBySeason[yearKey] = clone(awardHistory);
  requireValue(resultingState.postseasonHistoryBySeason?.[yearKey]?.champion?.teamCode === postseason.champion.teamCode,
    'The postseason history row does not match the simulated champion.');
  resultingState.franchisePostseasonReceiptsBySeason ??= {};
  const regularSeasonLedgerSha256After = sha256HexV1(regularSeasonLedgerSnapshot(resultingState, year));
  requireValue(regularSeasonLedgerSha256After === seasonLedgerSha256,
    'Regular-season statistics changed while preparing the postseason receipt.');

  const unsignedReceipt = {
    format: FRANCHISE_POSTSEASON_COMPLETION_FORMAT,
    version: FRANCHISE_POSTSEASON_COMPLETION_VERSION,
    previewFeatureFlag: 'franchisePostseasonCompletionV1',
    classification: 'development-scenario; not-certified',
    status: 'franchise-postseason-completed',
    seasonStartYear: year,
    priorSessionRevision: session.revision,
    sessionRevision: session.revision + 1,
    priorLeagueStateRevision: session.leagueState.revision,
    leagueStateRevision: resultingState.revision,
    sourceReceipt: clone(session.sourceReceipt),
    modelReceipt: clone(session.modelReceipt),
    completionReceiptSha256: sha256HexV1(completionReceipt),
    closeoutReceiptSha256: session.leagueState.franchiseLifecycleReceiptsBySeason?.[yearKey]?.receiptSha256 ?? null,
    awardsFinalizationReceiptSha256: awardReceipt.receiptSha256,
    awardsHistoryRecordSha256: awardReceipt.historyRecordSha256,
    postseasonSeed,
    postseasonResultSha256: sha256HexV1(postseason),
    regularSeasonLedgerSha256: seasonLedgerSha256,
    regularSeasonLedgerPreserved: true,
    matchupInputCount: gameInputs.length,
    postseasonGameCount: postseason.games.length,
    playInGameCount: postseason.summary?.playInGames ?? 0,
    playoffGameCount: postseason.summary?.playoffGames ?? 0,
    postseasonStatus: postseason.status,
    champion: clone(postseason.champion),
    finalsMvp: clone(postseason.finalsMvp ?? { status: 'not-generated', winner: null }),
    playerStatisticsStatus: postseason.playerStatistics?.status ?? 'not-generated',
    disclosure: 'Postseason games and statistics are simulated separately from the verified regular-season ledger. Caller-supplied matchups use the session-pinned game model and executed engine; results remain development-scenario output, not observed games or a certified forecast.',
  };
  const receipt = { ...unsignedReceipt, receiptSha256: sha256HexV1(unsignedReceipt) };
  resultingState.franchisePostseasonReceiptsBySeason[yearKey] = clone(receipt);

  const next = clone(session);
  next.revision += 1;
  next.leagueState = resultingState;
  next.actionHistory.push({ revision: next.revision, kind: 'complete-franchise-postseason', seasonStartYear: year,
    postseasonCompletionReceiptSha256: receipt.receiptSha256, postseasonResultSha256: receipt.postseasonResultSha256 });
  validateFranchiseBrowserSession(next);

  return {
    format: FRANCHISE_POSTSEASON_COMPLETION_FORMAT,
    version: FRANCHISE_POSTSEASON_COMPLETION_VERSION,
    status: 'franchise-postseason-completed',
    session: next,
    receipt: clone(receipt),
    postseason: clone(postseason),
  };
}
