import { validateLeagueState, normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';
import { simulateLeagueGames } from './season-simulation-v1.mjs';
import { createFranchiseRotationState, updateFranchiseRotationState } from './franchise-controls-v1.mjs';
import { evaluateTransaction, approveTransactionProposal, applyTransaction } from './transaction-engine-v1.mjs';
import { sha256HexV1, stableStringifyV1 } from './sha256-isomorphic-v1.mjs';

export const FRANCHISE_BROWSER_SESSION_FORMAT = 'djhc-player-franchise-session-v1';
export const FRANCHISE_BROWSER_SESSION_VERSION = '1.0.0';
export const FRANCHISE_BROWSER_STORAGE_PREFIX = 'djhc:player-franchise:v1:';
export const FRANCHISE_BROWSER_LOCAL_SAVE_FORMAT = 'djhc-player-franchise-local-save-v1';
export const FRANCHISE_BROWSER_LOCAL_SAVE_VERSION = 1;
export const MAX_FRANCHISE_SAVE_CHARACTERS = 8_000_000;
const clone = value => structuredClone(value);
const code = value => String(value ?? '').trim().toUpperCase();
const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function requireValue(condition, message) { if (!condition) throw new Error(message); }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function sourcePin(receipt) {
  requireValue(plain(receipt) && typeof receipt.packageId === 'string' && receipt.packageId.trim() &&
    typeof receipt.packageVersion === 'string' && receipt.packageVersion.trim() &&
    /^[a-f0-9]{64}$/i.test(receipt.packageManifestSha256 ?? ''), 'A complete pinned package receipt is required.');
  requireValue(Number.isInteger(receipt.seasonStartYear), 'The source receipt requires one exact season.');
  return { packageId: receipt.packageId, packageVersion: receipt.packageVersion,
    packageManifestSha256: receipt.packageManifestSha256.toLowerCase(), seasonStartYear: receipt.seasonStartYear };
}
function modelPin(receipt) {
  requireValue(plain(receipt) && typeof receipt.modelId === 'string' && receipt.modelId.trim() &&
    /^[a-f0-9]{64}$/i.test(receipt.contentSha256 ?? ''), 'A pinned game-model receipt is required.');
  requireValue(typeof receipt.executedModelId === 'string' && receipt.executedModelId.trim(), 'The model receipt must pin the executed possession engine.');
  return clone(receipt);
}
function cleanSchedule(schedule, state) {
  requireValue(Array.isArray(schedule) && schedule.length > 0, 'A resolved schedule is required.');
  const teams = new Set(state.teams.map(team => team.teamCode));
  const seen = new Set(), dates = new Set();
  const games = schedule.map(row => {
    requireValue(plain(row) && typeof row.gameId === 'string' && row.gameId.trim() && !seen.has(row.gameId), 'Schedule game IDs must be unique nonempty strings.');
    seen.add(row.gameId);
    const homeTeamCode = code(row.homeTeamCode), awayTeamCode = code(row.awayTeamCode);
    requireValue(teams.has(homeTeamCode) && teams.has(awayTeamCode) && homeTeamCode !== awayTeamCode, `Invalid schedule matchup: ${row.gameId}`);
    requireValue(validDate(row.gameLocalDate) && [state.seasonStartYear, state.seasonStartYear + 1].includes(Number(row.gameLocalDate.slice(0, 4))), `Invalid schedule date: ${row.gameId}`);
    requireValue(row.seasonStartYear === undefined || row.seasonStartYear === state.seasonStartYear, 'Schedule season conflicts with LeagueState.');
    for (const team of [homeTeamCode, awayTeamCode]) {
      const key = `${row.gameLocalDate}:${team}`;
      requireValue(!dates.has(key), `Team ${team} is double-booked on ${row.gameLocalDate}.`);
      dates.add(key);
    }
    // Whitelist schedule inputs: historical results/boxes cannot enter a save.
    return { gameId: row.gameId, gameLocalDate: row.gameLocalDate, homeTeamCode, awayTeamCode,
      seasonStartYear: state.seasonStartYear, sourceRef: typeof row.sourceRef === 'string' ? row.sourceRef : null };
  });
  return games.sort((a, b) => a.gameLocalDate.localeCompare(b.gameLocalDate) || a.gameId.localeCompare(b.gameId));
}

function validateGameLedger(session, completed) {
  const state = session.leagueState, year = state.seasonStartYear;
  const teamLogs = (state.teamGameLogs ?? []).filter(row => row.seasonStartYear === year);
  const playerLogs = (state.playerGameLogs ?? []).filter(row => row.seasonStartYear === year);
  const gameIds = new Set(completed.map(game => game.gameId));
  requireValue(teamLogs.every(row => gameIds.has(row.gameId)) && playerLogs.every(row => gameIds.has(row.gameId)), 'Game logs contain uncommitted games.');
  requireValue(teamLogs.length === completed.length * 2, 'Completed games require two team log rows.');
  const indexedTeams = new Map(), indexedPlayers = new Map();
  const completedById = new Map(completed.map(game => [game.gameId, game]));
  const scheduleById = new Map(session.schedule.map(game => [game.gameId, game]));
  const knownNames = new Set(state.players.map(player => normalizeCanonicalPlayerName(player.canonicalName)));
  const logKey = row => `${row.gameId}:${row.side}:${row.teamCode}`;
  for (const [logs, index] of [[teamLogs, indexedTeams], [playerLogs, indexedPlayers]]) for (const row of logs) {
    const game = completedById.get(row.gameId);
    requireValue(['home', 'away'].includes(row.side) && row.teamCode === game?.[`${row.side}TeamCode`], 'Game-log side/team identity is inconsistent.');
    if (index === indexedPlayers) requireValue(knownNames.has(normalizeCanonicalPlayerName(row.canonicalName)), 'Player game log has an unknown identity.');
    const key = logKey(row), rows = index.get(key) ?? [];
    rows.push(row); index.set(key, rows);
  }
  const teamTotals = new Map(), playerTotals = new Map();
  const close = (a, b) => typeof a === 'number' && Number.isFinite(a) && typeof b === 'number' && Number.isFinite(b) && Math.abs(a - b) <= 1e-6;
  for (const game of completed) {
    requireValue(Number.isInteger(game.homeScore) && Number.isInteger(game.awayScore) && game.homeScore >= 0 && game.awayScore >= 0 &&
      game.homeScore !== game.awayScore && game.homeMargin === game.homeScore - game.awayScore &&
      game.totalPoints === game.homeScore + game.awayScore && game.homeWin === (game.homeScore > game.awayScore), 'Completed-game score ledger is inconsistent.');
    const rosterReceipt = game.rosterIdentityReceipt;
    requireValue(rosterReceipt?.format === 'djhc-franchise-game-roster-identity-v1' && rosterReceipt.gameId === game.gameId &&
      rosterReceipt.gameLocalDate === scheduleById.get(game.gameId)?.gameLocalDate &&
      game.gameLocalDate === rosterReceipt.gameLocalDate,
      'Completed game is missing its bound roster identity receipt.');
    for (const side of ['home', 'away']) {
      const teamCode = game[`${side}TeamCode`], score = game[`${side}Score`];
      const key = `${game.gameId}:${side}:${teamCode}`;
      const ownLogs = indexedTeams.get(key) ?? [];
      requireValue(ownLogs.length === 1 && ownLogs[0].stats?.points === score, 'Completed scores and team game logs disagree.');
      const players = indexedPlayers.get(key) ?? [];
      const keys = players.map(row => normalizeCanonicalPlayerName(row.canonicalName));
      requireValue(players.length > 0 && keys.every(Boolean) && new Set(keys).size === keys.length, 'Player game logs have missing or duplicate identities.');
      const roster = rosterReceipt.teams?.find(row => row.side === side && row.teamCode === teamCode);
      const rosterKeys = (roster?.canonicalNames ?? []).map(normalizeCanonicalPlayerName);
      requireValue(rosterKeys.length > 0 && rosterKeys.every(name => knownNames.has(name)) && new Set(rosterKeys).size === rosterKeys.length &&
        keys.every(name => rosterKeys.includes(name)), 'Player game logs conflict with the roster at that game checkpoint.');
      for (const [field, value] of Object.entries(ownLogs[0].stats)) requireValue(close(value,
        players.reduce((sum, row) => sum + (row.aggregateStats?.[field] ?? 0), 0)), 'Player and team game logs do not reconcile.');
      const won = side === 'home' ? game.homeWin : !game.homeWin;
      const totals = teamTotals.get(teamCode) ?? { gamesPlayed: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, minutes: 0, boxScoreStats: {} };
      totals.gamesPlayed += 1; totals.wins += Number(won); totals.losses += Number(!won);
      totals.pointsFor += score; totals.pointsAgainst += game[side === 'home' ? 'awayScore' : 'homeScore'];
      totals.minutes += ownLogs[0].stats.minutes;
      for (const [field, value] of Object.entries(ownLogs[0].stats)) totals.boxScoreStats[field] = (totals.boxScoreStats[field] ?? 0) + value;
      teamTotals.set(teamCode, totals);
      for (const row of players) {
        const key = normalizeCanonicalPlayerName(row.canonicalName);
        const totals = playerTotals.get(key) ?? { gamesPlayed: 0 };
        totals.gamesPlayed += Number((row.aggregateStats.minutes ?? 0) > 0);
        for (const [field, value] of Object.entries(row.aggregateStats)) totals[field] = (totals[field] ?? 0) + value;
        playerTotals.set(key, totals);
      }
    }
  }
  for (const team of state.teams) {
    const expected = teamTotals.get(team.teamCode), saved = team.seasonStatsByYear?.[String(year)];
    if (!expected) { requireValue(!saved || !saved.gamesPlayed, 'Unplayed team has completed-season statistics.'); continue; }
    requireValue(saved && Object.entries(expected).every(([field, value]) => field === 'boxScoreStats'
      ? Object.entries(value).every(([key, number]) => close(saved.boxScoreStats?.[key], number)) : close(saved[field], value)), 'Saved team season totals disagree with completed games.');
  }
  for (const player of state.players) {
    const expected = playerTotals.get(normalizeCanonicalPlayerName(player.canonicalName)), saved = player.seasonStatsByYear?.[String(year)];
    if (!expected) { requireValue(!saved || !saved.gamesPlayed, 'Unplayed player has completed-season statistics.'); continue; }
    requireValue(saved && Object.entries(expected).every(([field, value]) => close(saved[field], value)), 'Saved player season totals disagree with completed games.');
  }
}

export function validateFranchiseBrowserSession(session, { expectedSourceReceipt = null, expectedModelReceipt = null } = {}) {
  requireValue(plain(session) && session.format === FRANCHISE_BROWSER_SESSION_FORMAT && session.schemaVersion === FRANCHISE_BROWSER_SESSION_VERSION,
    'Unsupported franchise save format. Existing Studio saves require explicit migration; they cannot be reinterpreted.');
  validateLeagueState(session.leagueState);
  const pin = sourcePin(session.sourceReceipt);
  modelPin(session.modelReceipt);
  requireValue(pin.seasonStartYear === session.leagueState.seasonStartYear, 'Source and league seasons conflict.');
  requireValue(Number.isInteger(session.revision) && session.revision >= 0 && Number.isInteger(session.seed) && session.seed >= 0 && session.seed <= 0xffffffff, 'Invalid franchise revision or seed.');
  requireValue(Number.isInteger(session.scheduleCursor) && session.scheduleCursor >= 0 && session.scheduleCursor <= session.schedule.length, 'Invalid schedule cursor.');
  const canonical = cleanSchedule(session.schedule, session.leagueState);
  requireValue(canonicalJson(canonical) === canonicalJson(session.schedule), 'Saved schedule is not canonical.');
  requireValue(Array.isArray(session.actionHistory) && session.actionHistory.every(row => plain(row) && Number.isInteger(row.revision)), 'Invalid action history.');
  const completed = (session.leagueState.completedGames ?? []).filter(row => row.seasonStartYear === pin.seasonStartYear);
  requireValue(completed.length === session.scheduleCursor, 'Schedule cursor and completed game ledger disagree.');
  for (let index = 0; index < completed.length; index += 1) {
    const scheduled = session.schedule[index], game = completed[index];
    requireValue(game.gameId === scheduled.gameId, 'Completed games must match the schedule prefix.');
    requireValue((game.homeTeamCode ?? game.homeTeam) === scheduled.homeTeamCode &&
      (game.awayTeamCode ?? game.awayTeam) === scheduled.awayTeamCode, 'Completed-game teams conflict with schedule.');
  }
  validateGameLedger(session, completed);
  if (expectedSourceReceipt) requireValue(canonicalJson(pin) === canonicalJson(sourcePin(expectedSourceReceipt)), 'Franchise save belongs to a different package pin.');
  if (expectedModelReceipt) requireValue(canonicalJson(session.modelReceipt) === canonicalJson(modelPin(expectedModelReceipt)), 'Franchise save belongs to a different model pin.');
  return { status: 'pass', format: session.format, revision: session.revision,
    provisional: session.leagueState.stateQuality?.status !== 'reconciled', remainingGames: session.schedule.length - session.scheduleCursor };
}

export function createFranchiseBrowserSession({ leagueState, schedule, sourceReceipt, modelReceipt, seed = 1 } = {}) {
  validateLeagueState(leagueState);
  requireValue(!(leagueState.completedGames ?? []).some(row => row.seasonStartYear === leagueState.seasonStartYear), 'New sessions require an unplayed current season.');
  const session = { format: FRANCHISE_BROWSER_SESSION_FORMAT, schemaVersion: FRANCHISE_BROWSER_SESSION_VERSION,
    revision: 0, seed, sourceReceipt: clone(sourceReceipt), modelReceipt: modelPin(modelReceipt),
    leagueState: clone(leagueState), schedule: cleanSchedule(schedule, leagueState), scheduleCursor: 0, actionHistory: [],
    disclosure: 'Player-driven franchise scenario from a development model. Generated contracts and incomplete legal inputs remain provisional; simulated awards and player preferences are generated.' };
  validateFranchiseBrowserSession(session);
  return session;
}

function assertRevision(session, expectedRevision) {
  validateFranchiseBrowserSession(session);
  requireValue(expectedRevision === session.revision, 'This action was prepared against a stale or missing franchise revision.');
}
function commit(session, state, kind, detail = {}) {
  const next = clone(session);
  next.leagueState = clone(state);
  next.revision += 1;
  next.actionHistory.push({ revision: next.revision, kind, ...clone(detail) });
  validateFranchiseBrowserSession(next);
  return next;
}
function gameSeed(seed, gameId) {
  let hash = seed >>> 0;
  for (const char of gameId) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash;
}

/** Exactly one realized possession game per advance, with atomic state commit.
 * No target outcome is requested. Inputs must come from current roster state.
 * The live engine may return requires-review; the original save stays intact. */
export function advanceFranchiseBrowserGame(session, { expectedRevision, gameModel, loadedModelReceipt, gameInputForState,
  simulateGameFn, commissionerMode = false } = {}) {
  assertRevision(session, expectedRevision);
  requireValue(gameModel?.modelId === session.modelReceipt.modelId, 'Loaded game model does not match the session pin.');
  requireValue(canonicalJson(modelPin(loadedModelReceipt)) === canonicalJson(session.modelReceipt), 'The verified loaded model receipt does not match the session pin.');
  requireValue(typeof gameInputForState === 'function' && typeof simulateGameFn === 'function', 'An explicit roster input adapter and possession engine are required.');
  const scheduled = session.schedule[session.scheduleCursor];
  if (!scheduled) return { status: 'season-games-complete', session: clone(session), game: null };
  const result = simulateLeagueGames(session.leagueState, gameModel, [{ gameId: scheduled.gameId }], {
    seed: gameSeed(session.seed, scheduled.gameId), sampleCount: 1, statePathSampleIndex: 0, commissionerMode,
    gameInputForState: (_request, state) => {
      const input = gameInputForState(clone(scheduled), clone(state));
      requireValue(input?.seasonStartYear === state.seasonStartYear && input?.gameLocalDate === scheduled.gameLocalDate, 'Game inputs must match schedule season/date.');
      requireValue(code(input.home?.teamCode ?? input.homeTeamCode ?? input.homeTeam) === scheduled.homeTeamCode &&
        code(input.away?.teamCode ?? input.awayTeamCode ?? input.awayTeam) === scheduled.awayTeamCode, 'Game input teams conflict with schedule.');
      return input;
    },
    simulateGameFn: Object.assign((model, input, options) => {
      const output = simulateGameFn(model, input, options);
      requireValue(!/requires-review|blocked|failed|error|unknown/.test(String(output?.status ?? 'unknown')),
        'The game engine requires review; no game was committed.');
      requireValue(output?.sampleCount === 1 && output?.simulations?.length === 1, 'Franchise advance requires exactly one realized sample.');
      requireValue(output.modelId === session.modelReceipt.executedModelId, 'Executed game engine does not match the session model pin.');
      const sample = output.simulations[0];
      requireValue(Number.isInteger(sample.homeScore) && Number.isInteger(sample.awayScore) && sample.homeScore !== sample.awayScore, 'A completed NBA game requires integer scores and a resolved winner.');
      return output;
    }, { supportedScenarioControls: simulateGameFn.supportedScenarioControls ?? [] }),
  });
  const staged = clone(session);
  staged.scheduleCursor += 1;
  const gameResult = result.games[0];
  const completedGame = result.resultingState.completedGames.find(game => game.gameId === scheduled.gameId);
  const rosterTeams = gameResult.rosterPreparation?.receipt?.teams;
  requireValue(Array.isArray(rosterTeams) && rosterTeams.length === 2 && completedGame, 'Game engine returned no current-roster identity receipt.');
  completedGame.gameLocalDate = scheduled.gameLocalDate;
  completedGame.rosterIdentityReceipt = { format: 'djhc-franchise-game-roster-identity-v1',
    gameId: scheduled.gameId, gameLocalDate: scheduled.gameLocalDate,
    stateRevisionBeforeGame: session.leagueState.revision,
    teams: rosterTeams.map(team => ({ side: team.side, teamCode: team.teamCode, canonicalNames: clone(team.currentRosterNames) })) };
  const next = commit(staged, result.resultingState, 'game-completed', { gameId: scheduled.gameId });
  return { status: 'game-completed', session: next, game: result.games[0] };
}

export function setFranchiseBrowserRotation(session, { expectedRevision, teamCode, controls, commissionerMode = false } = {}) {
  assertRevision(session, expectedRevision);
  const team = session.leagueState.teams.find(row => row.teamCode === code(teamCode));
  const saved = team?.franchiseControlsBySeason?.[String(session.leagueState.seasonStartYear)];
  const action = saved ? updateFranchiseRotationState : createFranchiseRotationState;
  const result = action({ state: session.leagueState, teamCode, controls, commissionerMode,
    expectedStateRevision: session.leagueState.revision });
  if (result.status === 'rejected') return { ...result, session: clone(session) };
  return { status: result.status, receipt: result.receipt, session: commit(session, result.state, 'rotation', { teamCode: code(teamCode) }) };
}

export function evaluateFranchiseBrowserTransaction(session, proposal, { ruleEngine = null } = {}) {
  validateFranchiseBrowserSession(session);
  return evaluateTransaction(session.leagueState, proposal, { ruleEngine });
}
export function executeFranchiseBrowserTransaction(session, proposal, { expectedRevision, userApproved = false,
  ruleEngine = null, allowProvisionalSandbox = false } = {}) {
  assertRevision(session, expectedRevision);
  // The native engine enforces ownership and records the exact approved terms.
  const approved = userApproved ? approveTransactionProposal(session.leagueState, proposal) : proposal;
  const result = applyTransaction(session.leagueState, approved, { ruleEngine, allowProvisionalSandbox });
  requireValue(result.evaluation?.executionStatus === 'committed', 'Transaction engine returned no committed state.');
  return { ...result, status: 'committed', session: commit(session, result.state, 'transaction', { proposalId: approved.proposalId, status: result.evaluation?.status }) };
}

export function serializeFranchiseBrowserSession(session) {
  validateFranchiseBrowserSession(session);
  const sessionText = JSON.stringify(session);
  requireValue(typeof sessionText === 'string', 'Franchise save could not be serialized.');
  const savedSession = JSON.parse(sessionText);
  validateFranchiseBrowserSession(savedSession);
  const payload = { format: FRANCHISE_BROWSER_LOCAL_SAVE_FORMAT,
    version: FRANCHISE_BROWSER_LOCAL_SAVE_VERSION, session: savedSession };
  const checkpoint = { ...payload, integrityReceipt: { algorithm: 'SHA-256', canonicalization: 'djhc-stable-json-v1',
    payloadSha256: sha256HexV1(stableStringifyV1(payload)) } };
  const text = stableStringifyV1(checkpoint);
  requireValue(text.length <= MAX_FRANCHISE_SAVE_CHARACTERS, 'Franchise save exceeds the browser storage budget; export the save file.');
  return text;
}
export function restoreFranchiseBrowserSession(text, options = {}) {
  requireValue(typeof text === 'string' && text.length <= MAX_FRANCHISE_SAVE_CHARACTERS, 'Invalid or oversized franchise save.');
  const checkpoint = JSON.parse(text);
  requireValue(plain(checkpoint) && checkpoint.format === FRANCHISE_BROWSER_LOCAL_SAVE_FORMAT &&
    checkpoint.version === FRANCHISE_BROWSER_LOCAL_SAVE_VERSION,
  'Unsupported or legacy local franchise save. A versioned integrity receipt is required.');
  requireValue(Object.keys(checkpoint).sort().join(',') === 'format,integrityReceipt,session,version',
    'Invalid local franchise save envelope fields.');
  const receipt = checkpoint.integrityReceipt;
  requireValue(plain(receipt) && Object.keys(receipt).sort().join(',') === 'algorithm,canonicalization,payloadSha256' &&
    receipt.algorithm === 'SHA-256' && receipt.canonicalization === 'djhc-stable-json-v1' &&
    /^[a-f0-9]{64}$/.test(receipt.payloadSha256 ?? ''), 'Invalid local franchise save integrity receipt.');
  const payload = { format: checkpoint.format, version: checkpoint.version, session: checkpoint.session };
  requireValue(sha256HexV1(stableStringifyV1(payload)) === receipt.payloadSha256,
    'Local franchise save SHA-256 integrity receipt does not match its serialized payload.');
  const session = checkpoint.session;
  validateFranchiseBrowserSession(session, options);
  return session;
}
export function franchiseBrowserStorageKey(sourceReceipt, userTeamCode) {
  const pin = sourcePin(sourceReceipt);
  requireValue(code(userTeamCode), 'A user team is required for the save key.');
  return `${FRANCHISE_BROWSER_STORAGE_PREFIX}${pin.packageManifestSha256}:${pin.seasonStartYear}:${encodeURIComponent(code(userTeamCode))}`;
}
export function saveFranchiseBrowserSession(storage, key, session) {
  requireValue(key.startsWith(FRANCHISE_BROWSER_STORAGE_PREFIX) && typeof storage?.getItem === 'function' && typeof storage?.setItem === 'function', 'Use the dedicated franchise save namespace.');
  const text = serializeFranchiseBrowserSession(session);
  // A quota/readback failure cannot replace the last verified snapshot.
  const stagingKey = `${key}:pending`;
  const previous = storage.getItem(key);
  let mainWriteAttempted = false;
  try {
    storage.setItem(stagingKey, text);
    requireValue(storage.getItem(stagingKey) === text, 'Franchise staging save readback failed.');
    restoreFranchiseBrowserSession(storage.getItem(stagingKey), { expectedSourceReceipt: session.sourceReceipt, expectedModelReceipt: session.modelReceipt });
    mainWriteAttempted = true;
    storage.setItem(key, text);
    requireValue(storage.getItem(key) === text, 'Franchise save readback failed.');
  } catch (error) {
    if (mainWriteAttempted) {
      if (previous === null) storage.removeItem?.(key); else storage.setItem(key, previous);
    }
    throw error;
  } finally { storage.removeItem?.(stagingKey); }
  return { status: 'saved-and-readback-verified', characters: text.length, revision: session.revision };
}

export function franchiseBrowserPlayerKey(name) { return normalizeCanonicalPlayerName(name); }
