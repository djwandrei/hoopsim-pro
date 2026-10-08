export const FRANCHISE_SEASON_SCHEDULE_RECEIPT_FORMAT = 'djhc-franchise-season-schedule-receipt-v1';
export const FRANCHISE_SEASON_COMPLETION_FORMAT = 'djhc-franchise-season-completion-v1';
export const FRANCHISE_SEASON_COMPLETION_VERSION = '1.0.0';

const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function reject(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function requireValue(condition, code, message, details = undefined) {
  if (!condition) reject(code, message, details);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort(compareText);
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function normalizeTeamCode(value, label) {
  const code = String(value ?? '').trim().toUpperCase();
  requireValue(/^[A-Z0-9]{2,8}$/.test(code), 'invalid-team-code', `${label} must be a short alphanumeric team code.`);
  return code;
}

function normalizeTeams(teams) {
  requireValue(Array.isArray(teams) && teams.length >= 2, 'invalid-teams', 'At least two teams are required to verify a season schedule.');
  const codes = teams.map((team, index) => normalizeTeamCode(typeof team === 'string' ? team : team?.teamCode, `Team ${index + 1}`));
  requireValue(new Set(codes).size === codes.length, 'duplicate-team-code', 'Team codes must be unique after normalization.');
  return codes.sort(compareText);
}

function standardGamesPerTeam(seasonStartYear) {
  // Keep the established regular-season lengths used by season-simulation-v1.
  // The interrupted 2019-20 season requires an explicit per-team schedule count.
  if (seasonStartYear === 2019) return null;
  return seasonStartYear === 2020 ? 72 : 82;
}

function normalizeExpectedGamesByTeam(value, teamCodes) {
  if (value === null || value === undefined) return null;
  requireValue(plain(value), 'invalid-expected-games', 'Expected games by team must be a plain team-code map.');
  const output = {};
  const keys = Object.keys(value).map(key => normalizeTeamCode(key, 'Expected-game map key'));
  requireValue(new Set(keys).size === keys.length, 'duplicate-expected-team', 'Expected-game team codes must be unique after normalization.');
  requireValue(keys.length === teamCodes.length && teamCodes.every(code => keys.includes(code)),
    'expected-team-set-mismatch', 'Expected games by team must include every scheduled team exactly once.');
  for (const [key, count] of Object.entries(value)) {
    const code = normalizeTeamCode(key, 'Expected-game map key');
    requireValue(Number.isSafeInteger(count) && count >= 0, 'invalid-expected-games', `Expected game count for ${code} must be a nonnegative integer.`);
    output[code] = count;
  }
  return Object.fromEntries(teamCodes.map(code => [code, output[code]]));
}

function normalizeScenarioMetadata(value) {
  if (value === null || value === undefined) return null;
  requireValue(plain(value), 'invalid-scenario-metadata', 'Shortened-schedule metadata must be a plain object.');
  const sourceClass = String(value.sourceClass ?? '');
  requireValue(['generated-scenario', 'user-scenario'].includes(sourceClass), 'invalid-scenario-source',
    'Shortened schedules require sourceClass generated-scenario or user-scenario.');
  const label = String(value.label ?? '').trim();
  requireValue(label.length >= 3, 'scenario-label-required', 'Scenario metadata needs a descriptive label of at least three characters.');
  const sourceRef = value.sourceRef === undefined || value.sourceRef === null ? null : String(value.sourceRef).trim();
  return { sourceClass, label, sourceRef: sourceRef || null };
}

function dateValue(row, label, seasonStartYear) {
  const local = row.gameLocalDate;
  const generic = row.date;
  if (local !== undefined && generic !== undefined) {
    requireValue(local === generic, 'conflicting-game-date', `${label} contains conflicting gameLocalDate and date fields.`);
  }
  const date = local ?? generic ?? null;
  if (date === null) return null;
  requireValue(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date), 'invalid-game-date', `${label} must use an ISO local date.`);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  requireValue(Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date,
    'invalid-game-date', `${label} is not a real calendar date.`);
  const year = Number(date.slice(0, 4));
  requireValue(year === seasonStartYear || year === seasonStartYear + 1, 'game-date-season-mismatch',
    `${label} must fall within the selected season's two calendar years.`);
  return date;
}

function teamValue(row, codeKey, aliasKey, label) {
  const rawCode = row[codeKey];
  const rawAlias = row[aliasKey];
  const code = rawCode === undefined || rawCode === null ? null : normalizeTeamCode(rawCode, `${label} ${codeKey}`);
  const alias = rawAlias === undefined || rawAlias === null ? null : normalizeTeamCode(rawAlias, `${label} ${aliasKey}`);
  requireValue(!code || !alias || code === alias, 'conflicting-team-fields', `${label} contains conflicting ${codeKey} and ${aliasKey} values.`);
  return code ?? alias;
}

function normalizeSchedule(schedule, teamCodes, seasonStartYear) {
  requireValue(Array.isArray(schedule) && schedule.length > 0, 'empty-schedule', 'A nonempty regular-season schedule is required.');
  const knownTeams = new Set(teamCodes);
  const ids = new Set();
  const games = schedule.map((row, index) => {
    const label = `Scheduled game ${index + 1}`;
    requireValue(plain(row), 'invalid-schedule-game', `${label} must be an object.`);
    const gameId = String(row.gameId ?? '').trim();
    requireValue(gameId.length > 0 && !ids.has(gameId), 'duplicate-schedule-game-id',
      `${label} needs a unique nonempty gameId.`, { gameId: gameId || null });
    ids.add(gameId);
    if (row.seasonStartYear !== undefined && row.seasonStartYear !== null) {
      requireValue(row.seasonStartYear === seasonStartYear, 'schedule-season-mismatch', `${label} belongs to a different season.`, { gameId });
    }
    const homeTeamCode = teamValue(row, 'homeTeamCode', 'homeTeam', label);
    const awayTeamCode = teamValue(row, 'awayTeamCode', 'awayTeam', label);
    requireValue(homeTeamCode && awayTeamCode && homeTeamCode !== awayTeamCode && knownTeams.has(homeTeamCode) && knownTeams.has(awayTeamCode),
      'invalid-schedule-matchup', `${label} must contain two distinct teams from the supplied team set.`, { gameId });
    const gameLocalDate = dateValue(row, label, seasonStartYear);
    return { gameId, seasonStartYear, gameLocalDate, homeTeamCode, awayTeamCode,
      sourceRef: typeof row.sourceRef === 'string' && row.sourceRef.trim() ? row.sourceRef.trim() : null };
  });
  return games.sort((left, right) => compareText(left.gameId, right.gameId));
}

function countScheduledGames(games, teamCodes) {
  const counts = Object.fromEntries(teamCodes.map(code => [code, { games: 0, home: 0, away: 0 }]));
  for (const game of games) {
    counts[game.homeTeamCode].games += 1;
    counts[game.homeTeamCode].home += 1;
    counts[game.awayTeamCode].games += 1;
    counts[game.awayTeamCode].away += 1;
  }
  return counts;
}

async function sha256Hex(value, cryptoProvider) {
  requireValue(typeof globalThis.TextEncoder === 'function', 'web-crypto-unavailable', 'TextEncoder is required to hash the canonical schedule receipt.');
  requireValue(cryptoProvider?.subtle && typeof cryptoProvider.subtle.digest === 'function',
    'web-crypto-unavailable', 'Web Crypto SHA-256 is required to hash the canonical schedule receipt.');
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = new Uint8Array(await cryptoProvider.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive a canonical receipt for the complete schedule a season-end gate expects.
 * Standard NBA seasons use 82 games per team, except 2020-21 (72). The
 * interrupted 2019-20 season requires explicit per-team counts. Any shorter or
 * otherwise nonstandard counts need a labeled generated/user scenario.
 */
export async function deriveFranchiseSeasonScheduleReceiptV1({
  schedule,
  teams,
  seasonStartYear,
  expectedGamesByTeam = null,
  scenarioMetadata = null,
  cryptoProvider = globalThis.crypto,
} = {}) {
  requireValue(Number.isInteger(seasonStartYear) && seasonStartYear >= 1946 && seasonStartYear <= 9998,
    'invalid-season-year', 'seasonStartYear must be an integer season year.');
  const teamCodes = normalizeTeams(teams);
  const games = normalizeSchedule(schedule, teamCodes, seasonStartYear);
  const scheduledCounts = countScheduledGames(games, teamCodes);
  const scenario = normalizeScenarioMetadata(scenarioMetadata);
  const declaredExpected = normalizeExpectedGamesByTeam(expectedGamesByTeam, teamCodes);
  const standardCount = standardGamesPerTeam(seasonStartYear);
  let expectedCounts = declaredExpected;
  if (!expectedCounts && scenario) {
    expectedCounts = Object.fromEntries(teamCodes.map(code => [code, scheduledCounts[code].games]));
  }
  if (!expectedCounts && standardCount !== null) {
    expectedCounts = Object.fromEntries(teamCodes.map(code => [code, standardCount]));
  }
  requireValue(expectedCounts, 'expected-schedule-counts-required',
    'This season needs expectedGamesByTeam or an explicitly labeled generated/user scenario schedule.');
  const baseline = standardCount ?? 82;
  const nonstandardCounts = teamCodes.some(code => expectedCounts[code] !== baseline || scheduledCounts[code].games !== baseline);
  requireValue(!nonstandardCounts || scenario, 'shortened-schedule-metadata-required',
    'Shortened or nonstandard schedules require a labeled generated-scenario or user-scenario metadata record.');
  const countMismatches = teamCodes.filter(code => scheduledCounts[code].games !== expectedCounts[code]);
  requireValue(countMismatches.length === 0, 'schedule-counts-mismatch',
    `Schedule game counts do not match the expected season counts for: ${countMismatches.join(', ')}.`,
  { teams: countMismatches.map(teamCode => ({ teamCode, scheduled: scheduledCounts[teamCode].games, expected: expectedCounts[teamCode] })) });

  const unsignedReceipt = {
    format: FRANCHISE_SEASON_SCHEDULE_RECEIPT_FORMAT,
    version: FRANCHISE_SEASON_COMPLETION_VERSION,
    seasonStartYear,
    teamCodes,
    games,
    scheduledGameCount: games.length,
    teamGameCounts: scheduledCounts,
    expectedGamesByTeam: expectedCounts,
    scheduleKind: scenario ? 'labeled-scenario' : 'standard-season',
    scenarioMetadata: scenario,
  };
  const canonicalScheduleSha256 = await sha256Hex(unsignedReceipt, cryptoProvider);
  return { ...unsignedReceipt, canonicalScheduleSha256 };
}

function normalizeCompletedGame(row, index, seasonStartYear, teamCodes) {
  const label = `Completed game ${index + 1}`;
  requireValue(plain(row), 'invalid-completed-game', `${label} must be an object.`);
  requireValue(Number.isInteger(row.seasonStartYear), 'completed-season-required', `${label} needs an integer seasonStartYear.`);
  if (row.seasonStartYear !== seasonStartYear) return null;
  const gameId = String(row.gameId ?? '').trim();
  requireValue(gameId.length > 0, 'invalid-completed-game-id', `${label} needs a nonempty gameId.`);
  const homeTeamCode = teamValue(row, 'homeTeamCode', 'homeTeam', label);
  const awayTeamCode = teamValue(row, 'awayTeamCode', 'awayTeam', label);
  requireValue(homeTeamCode && awayTeamCode && homeTeamCode !== awayTeamCode && teamCodes.includes(homeTeamCode) && teamCodes.includes(awayTeamCode),
    'invalid-completed-matchup', `${label} must contain two distinct teams from the schedule receipt.`, { gameId });
  const gameLocalDate = dateValue(row, label, seasonStartYear);
  requireValue(Number.isSafeInteger(row.homeScore) && row.homeScore >= 0 && Number.isSafeInteger(row.awayScore) && row.awayScore >= 0,
    'invalid-completed-score', `${label} scores must be nonnegative integers.`, { gameId });
  requireValue(row.homeScore !== row.awayScore, 'tied-completed-game', `${label} cannot be tied.`, { gameId });
  return { gameId, seasonStartYear, gameLocalDate, homeTeamCode, awayTeamCode,
    homeScore: row.homeScore, awayScore: row.awayScore };
}

/**
 * Verify that every scheduled regular-season game has exactly one valid result.
 * Throws an Error with a stable `code` on incomplete, conflicting, or extra rows.
 */
export async function verifyFranchiseSeasonCompletionV1({
  receipt,
  completedGames,
  seasonStartYear = receipt?.seasonStartYear,
  cryptoProvider = globalThis.crypto,
} = {}) {
  requireValue(plain(receipt) && receipt.format === FRANCHISE_SEASON_SCHEDULE_RECEIPT_FORMAT,
    'invalid-schedule-receipt', 'A supported canonical franchise season schedule receipt is required.');
  requireValue(Number.isInteger(seasonStartYear) && seasonStartYear === receipt.seasonStartYear,
    'completion-season-mismatch', 'Completion season must match the schedule receipt.');
  requireValue(Array.isArray(completedGames), 'invalid-completed-ledger', 'Completed games must be supplied as an array.');
  const rebuiltReceipt = await deriveFranchiseSeasonScheduleReceiptV1({
    schedule: receipt.games,
    teams: receipt.teamCodes,
    seasonStartYear: receipt.seasonStartYear,
    expectedGamesByTeam: receipt.expectedGamesByTeam,
    scenarioMetadata: receipt.scenarioMetadata,
    cryptoProvider,
  });
  requireValue(canonicalJson(rebuiltReceipt) === canonicalJson(receipt), 'schedule-receipt-integrity-failed',
    'Schedule receipt fields or canonical SHA-256 do not match the derived schedule.');

  const targetGames = [];
  const completedIds = new Set();
  for (let index = 0; index < completedGames.length; index += 1) {
    const completed = normalizeCompletedGame(completedGames[index], index, seasonStartYear, receipt.teamCodes);
    if (!completed) continue;
    requireValue(!completedIds.has(completed.gameId), 'duplicate-completed-game-id',
      `Completed ledger contains duplicate gameId ${completed.gameId}.`, { gameId: completed.gameId });
    completedIds.add(completed.gameId);
    targetGames.push(completed);
  }
  const scheduledById = new Map(receipt.games.map(game => [game.gameId, game]));
  const extras = targetGames.filter(game => !scheduledById.has(game.gameId));
  requireValue(extras.length === 0, 'unexpected-completed-games',
    `Completed ledger contains games outside the schedule: ${extras.map(game => game.gameId).join(', ')}.`,
  { gameIds: extras.map(game => game.gameId) });
  const mismatches = targetGames.filter(game => {
    const scheduled = scheduledById.get(game.gameId);
    return game.homeTeamCode !== scheduled.homeTeamCode || game.awayTeamCode !== scheduled.awayTeamCode ||
      (scheduled.gameLocalDate !== null && game.gameLocalDate !== scheduled.gameLocalDate);
  });
  requireValue(mismatches.length === 0, 'completed-schedule-mismatch',
    `Completed ledger matchup or date differs from the schedule for: ${mismatches.map(game => game.gameId).join(', ')}.`,
  { gameIds: mismatches.map(game => game.gameId) });
  const missing = receipt.games.filter(game => !completedIds.has(game.gameId));
  requireValue(missing.length === 0, 'scheduled-games-incomplete',
    `Completed ledger is missing scheduled games: ${missing.map(game => game.gameId).join(', ')}.`,
  { gameIds: missing.map(game => game.gameId) });
  requireValue(targetGames.length === receipt.scheduledGameCount, 'completed-game-count-mismatch',
    'Completed game count does not equal the canonical scheduled game count.');

  const completedCounts = countScheduledGames(targetGames, receipt.teamCodes);
  const perTeamMismatches = receipt.teamCodes.filter(code => canonicalJson(completedCounts[code]) !== canonicalJson(receipt.teamGameCounts[code]) ||
    completedCounts[code].games !== receipt.expectedGamesByTeam[code]);
  requireValue(perTeamMismatches.length === 0, 'completed-team-count-mismatch',
    `Completed game counts do not match the schedule for: ${perTeamMismatches.join(', ')}.`,
  { teams: perTeamMismatches.map(teamCode => ({ teamCode, scheduled: receipt.teamGameCounts[teamCode], completed: completedCounts[teamCode] })) });

  return {
    format: FRANCHISE_SEASON_COMPLETION_FORMAT,
    version: FRANCHISE_SEASON_COMPLETION_VERSION,
    status: receipt.scheduleKind === 'labeled-scenario' ? 'scenario-schedule-complete' : 'standard-schedule-complete',
    scheduleComplete: true,
    scheduleKind: receipt.scheduleKind,
    seasonStartYear,
    scheduledGameCount: receipt.scheduledGameCount,
    completedGameCount: targetGames.length,
    canonicalScheduleSha256: receipt.canonicalScheduleSha256,
    scenarioMetadata: receipt.scenarioMetadata,
    teamGameCounts: Object.fromEntries(receipt.teamCodes.map(code => [code, {
      scheduled: { ...receipt.teamGameCounts[code] },
      completed: completedCounts[code],
    }])),
  };
}
