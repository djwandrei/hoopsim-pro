import { simulateGame } from './game-simulator-v2.mjs';
import { simulateCoherentGame } from './coherent-game-simulator-v1.mjs';
import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

const FORMAT = 'djhc-nba-postseason-simulation-v1';
const STANDINGS_FORMAT = 'djhc-nba-postseason-seeds-v1';
const NBA_STANDINGS_RULES_URL = 'https://www.nba.com/standings';
const NBA_PLAY_IN_RULES_URL = 'https://www.nba.com/hornets/news/what-you-need-to-know-about-the-2026-nba-play-in-tournament';
const NBA_BUBBLE_RULES_URL = 'https://www.nba.com/news/nba-nbpa-finalize-season-comeback-official-release';
const NBA_PLAYOFF_FORMAT_URL = 'https://www.nba.com/news/faq';
const NBA_MODERN_SEEDING_RULES_URL = 'https://pr.nba.com/nba-playoff-seeding-changes/';

function requireSupportedPostseasonEra(seasonStartYear) {
  if (!Number.isInteger(seasonStartYear)) throw new Error('Postseason rules require an integer seasonStartYear.');
  if (seasonStartYear < 2015) throw new Error('This engine implements the NBA postseason seeding format effective from 2015–16 onward; earlier division-based seeding and Finals formats require a historical rules adapter.');
}

function seededRandom(seed = 1) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  return number;
}

function teamKey(value) { return String(value ?? '').trim().toUpperCase(); }
function divisionKey(team) { return `${team.conference}\u0000${team.division}`; }
function winPct(wins, games) { return games ? wins / games : 0; }
function close(a, b) { return Math.abs(a - b) <= 1e-12; }

const PLAYER_BOX_STAT_FIELDS = Object.freeze([
  'points', 'fieldGoalsMade', 'fieldGoalsAttempted', 'twoPointersMade', 'twoPointersAttempted',
  'threePointersMade', 'threePointersAttempted', 'freeThrowsMade', 'freeThrowsAttempted',
  'rebounds', 'offensiveRebounds', 'defensiveRebounds', 'assists', 'turnovers', 'steals',
  'blocks', 'personalFouls', 'minutes',
]);

function validatePlayerBoxScore(box, teamBox, expectedPoints, label) {
  if (!Array.isArray(box)) return null;
  const totals = Object.fromEntries(PLAYER_BOX_STAT_FIELDS.map(field => [field, 0]));
  for (const [index, row] of box.entries()) {
    for (const field of PLAYER_BOX_STAT_FIELDS) {
      const value = Number(row?.[field] ?? 0);
      if (!Number.isFinite(value) || value < 0) throw new Error(`${label} player row ${index + 1} has an invalid ${field}.`);
      totals[field] += value;
    }
  }
  if (totals.points !== expectedPoints) throw new Error(`${label} player points (${totals.points}) do not equal the team score (${expectedPoints}).`);
  if (teamBox && typeof teamBox === 'object') {
    for (const field of PLAYER_BOX_STAT_FIELDS) {
      if (teamBox[field] === undefined) continue;
      if (Number(teamBox[field]) !== totals[field]) throw new Error(`${label} player ${field} (${totals[field]}) do not reconcile to the supplied team box (${teamBox[field]}).`);
    }
  }
  return totals;
}

function aggregatePostseasonPlayerStatistics(games, seasonStartYear) {
  const rows = new Map();
  const unresolvedBoxLines = [];
  let gamesWithPlayerBoxes = 0;
  let gamesWithoutPlayerBoxes = 0;

  for (const game of games) {
    const homeBox = game.homePlayerBoxScore;
    const awayBox = game.awayPlayerBoxScore;
    if (!Array.isArray(homeBox) || !Array.isArray(awayBox)) {
      gamesWithoutPlayerBoxes += 1;
      continue;
    }
    gamesWithPlayerBoxes += 1;
    for (const [teamCode, box] of [[game.homeTeamCode, homeBox], [game.awayTeamCode, awayBox]]) {
      const names = box.map(player => normalizeCanonicalPlayerName(player?.canonicalName ?? player?.name ?? player?.displayName));
      const nameCounts = new Map();
      for (const name of names) if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
      for (const [index, playerBox] of box.entries()) {
        const canonicalName = String(playerBox?.canonicalName ?? playerBox?.name ?? playerBox?.displayName ?? '').trim();
        const normalizedName = names[index];
        if (!normalizedName || nameCounts.get(normalizedName) !== 1) {
          unresolvedBoxLines.push({ gameId: game.gameId, teamCode, row: index, canonicalName: canonicalName || null,
            reason: !normalizedName ? 'missing-canonical-player-name' : 'duplicate-canonical-player-name-on-team' });
          continue;
        }
        const key = `${teamCode}\u0000${normalizedName}`;
        let totals = rows.get(key);
        if (!totals) {
          totals = {
            teamCode,
            canonicalName,
            normalizedName,
            gamesPlayed: 0,
            playInGames: 0,
            playoffGames: 0,
            ...Object.fromEntries(PLAYER_BOX_STAT_FIELDS.map(field => [field, 0])),
          };
          rows.set(key, totals);
        }
        totals.gamesPlayed += 1;
        if (game.stage === 'play-in') totals.playInGames += 1;
        if (game.stage === 'playoffs') totals.playoffGames += 1;
        for (const field of PLAYER_BOX_STAT_FIELDS) totals[field] += Number(playerBox[field] ?? 0);
      }
    }
  }

  const statistics = [...rows.values()].sort((a, b) => a.teamCode.localeCompare(b.teamCode) || a.normalizedName.localeCompare(b.normalizedName));
  const status = gamesWithPlayerBoxes === 0 ? 'not-generated'
    : gamesWithoutPlayerBoxes > 0 || unresolvedBoxLines.length > 0 ? 'partial' : 'complete-experimental';
  return {
    format: 'djhc-postseason-player-statistics-v1',
    status,
    seasonStartYear,
    selectedForProduction: false,
    boxScoreEvidence: 'generated-experimental-boxes-not-calibrated-to-observed-play-by-play',
    gamesWithPlayerBoxes,
    gamesWithoutPlayerBoxes,
    playerCount: statistics.length,
    unresolvedBoxLines,
    statistics,
    disclosure: 'Player totals aggregate the generated postseason player boxes by team and exact normalized canonical name. They are separate from regular-season stats and remain experimental until the box process is validated against observed player-level distributions.',
  };
}

function selectFinalsMvp(finalsGames, championTeamCode, seasonStartYear) {
  const rows = new Map();
  const unresolvedLines = [];
  let gamesWithChampionBoxes = 0;
  let gamesWithoutChampionBoxes = 0;
  for (const game of finalsGames) {
    const box = game.homeTeamCode === championTeamCode ? game.homePlayerBoxScore
      : game.awayTeamCode === championTeamCode ? game.awayPlayerBoxScore : null;
    if (!Array.isArray(box)) {
      gamesWithoutChampionBoxes += 1;
      continue;
    }
    gamesWithChampionBoxes += 1;
    const names = box.map(player => normalizeCanonicalPlayerName(player?.canonicalName ?? player?.name ?? player?.displayName));
    const nameCounts = new Map();
    for (const name of names) if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    for (const [index, player] of box.entries()) {
      const canonicalName = String(player?.canonicalName ?? player?.name ?? player?.displayName ?? '').trim();
      const normalizedName = names[index];
      if (!normalizedName || nameCounts.get(normalizedName) !== 1) {
        unresolvedLines.push({ gameId: game.gameId, canonicalName: canonicalName || null,
          reason: !normalizedName ? 'missing-canonical-player-name' : 'duplicate-canonical-player-name-on-team' });
        continue;
      }
      const row = rows.get(normalizedName) ?? {
        canonicalName,
        teamCode: championTeamCode,
        gamesPlayed: 0,
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
      };
      row.gamesPlayed += 1;
      for (const field of ['points', 'rebounds', 'assists', 'steals', 'blocks']) row[field] += Number(player[field] ?? 0);
      rows.set(normalizedName, row);
    }
  }
  const complete = finalsGames.length > 0 && gamesWithoutChampionBoxes === 0 && unresolvedLines.length === 0;
  const candidates = [...rows.values()].map(row => {
    const perGame = Object.fromEntries(['points', 'rebounds', 'assists', 'steals', 'blocks'].map(field => [field, row.gamesPlayed ? row[field] / row.gamesPlayed : null]));
    return {
      ...row,
      perGame,
      experimentalProductionScore: Number((perGame.points + 0.7 * perGame.rebounds + 1.2 * perGame.assists
        + 2 * perGame.steals + 2 * perGame.blocks).toFixed(4)),
    };
  }).sort((left, right) => right.experimentalProductionScore - left.experimentalProductionScore
    || right.perGame.points - left.perGame.points
    || left.canonicalName.localeCompare(right.canonicalName));
  return {
    format: 'djhc-nba-finals-mvp-simulation-v1',
    status: complete ? 'simulated-finals-mvp-experimental'
      : gamesWithChampionBoxes === 0 ? 'not-generated' : 'provisional-incomplete-finals-boxes',
    seasonStartYear,
    teamCode: championTeamCode,
    winner: complete && candidates.length ? candidates[0] : null,
    candidates: complete ? candidates : [],
    gamesInSeries: finalsGames.length,
    gamesWithChampionBoxes,
    gamesWithoutChampionBoxes,
    unresolvedLines,
    selectionMethod: 'champion-player-final-series-box-production-score; simulated experimental selection, not an official ballot',
    disclosure: 'Finals MVP is selected only when complete champion player boxes are available for every Finals game. The weighted production score is a transparent simulation heuristic and is not calibrated to NBA Finals MVP voting.',
  };
}

function normalizeTeams(teams) {
  if (!Array.isArray(teams) || teams.length !== 30) throw new Error('NBA postseason v1 requires exactly 30 teams.');
  const rows = teams.map(team => ({
    ...structuredClone(team),
    teamCode: teamKey(team.teamCode),
    conference: String(team.conference ?? '').trim(),
    division: String(team.division ?? '').trim(),
  })).sort((a, b) => a.teamCode.localeCompare(b.teamCode));
  if (rows.some(team => !team.teamCode || !team.conference || !team.division)) throw new Error('Every postseason team needs teamCode, conference, and division.');
  if (new Set(rows.map(team => team.teamCode)).size !== 30) throw new Error('Postseason teamCode values must be unique.');
  const conferences = new Map();
  const divisions = new Map();
  for (const team of rows) {
    const conferenceRows = conferences.get(team.conference) ?? [];
    conferenceRows.push(team);
    conferences.set(team.conference, conferenceRows);
    const divisionRows = divisions.get(divisionKey(team)) ?? [];
    divisionRows.push(team);
    divisions.set(divisionKey(team), divisionRows);
  }
  if (conferences.size !== 2 || [...conferences.values()].some(group => group.length !== 15)) throw new Error('NBA postseason v1 requires two conferences with 15 teams each.');
  if (divisions.size !== 6 || [...divisions.values()].some(group => group.length !== 5)) throw new Error('NBA postseason v1 requires six five-team divisions.');
  return { teams: rows, conferences, divisions, teamByCode: new Map(rows.map(team => [team.teamCode, team])) };
}

function regularSeasonGamesForYear(games, seasonStartYear) {
  if (!Array.isArray(games)) throw new Error('Postseason seeding requires the regular-season game ledger.');
  return games.filter(game => {
    if (Number.isInteger(seasonStartYear) && Number.isInteger(game.seasonStartYear) && game.seasonStartYear !== seasonStartYear) return false;
    if (game.countsTowardRegularSeason === false || game.event === 'nba-cup-final') return false;
    const phase = String(game.phase ?? game.gameType ?? game.seasonPhase ?? '').trim().toLowerCase();
    if (phase && !['regular', 'regular-season', 'regular_season', 'nba-cup-flex-regular-season-game'].includes(phase)) return false;
    return true;
  });
}

function defaultExpectedGamesPerTeam(seasonStartYear) {
  if (seasonStartYear === 2019) return null;
  if (seasonStartYear === 2020) return 72;
  return 82;
}

function expectedTeamGameCounts(expectedGamesByTeam, teams) {
  if (expectedGamesByTeam instanceof Map) return new Map([...expectedGamesByTeam.entries()].map(([code, value]) => [teamKey(code), value]));
  if (!expectedGamesByTeam || typeof expectedGamesByTeam !== 'object' || Array.isArray(expectedGamesByTeam)) return null;
  return new Map(Object.entries(expectedGamesByTeam).map(([code, value]) => [teamKey(code), value]));
}

function buildSeasonLedger(teams, games, { seasonStartYear, expectedGamesPerTeam = null, expectedGamesByTeam = null, allowUnequalGamesPlayed = false } = {}) {
  const stats = new Map(teams.map(team => [team.teamCode, {
    teamCode: team.teamCode,
    conference: team.conference,
    division: team.division,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    conferenceWins: 0,
    conferenceGames: 0,
    divisionWins: 0,
    divisionGames: 0,
  }]));
  const matchups = new Map(teams.map(team => [team.teamCode, new Map()]));
  const gameIds = new Set();
  const normalizedGames = regularSeasonGamesForYear(games, seasonStartYear);
  if (!normalizedGames.length) throw new Error('No completed regular-season games were supplied for standings.');
  for (const [index, game] of normalizedGames.entries()) {
    const homeTeamCode = teamKey(game.homeTeamCode ?? game.home?.teamCode);
    const awayTeamCode = teamKey(game.awayTeamCode ?? game.away?.teamCode);
    if (!stats.has(homeTeamCode) || !stats.has(awayTeamCode) || homeTeamCode === awayTeamCode) throw new Error(`Regular-season game ${game.gameId ?? index + 1} has invalid team identities.`);
    if (game.gameId !== null && game.gameId !== undefined) {
      const gameId = String(game.gameId);
      if (gameIds.has(gameId)) throw new Error(`Duplicate regular-season gameId ${gameId}.`);
      gameIds.add(gameId);
    }
    const homeScore = finite(game.homeScore ?? game.home?.score, `Game ${game.gameId ?? index + 1} homeScore`);
    const awayScore = finite(game.awayScore ?? game.away?.score, `Game ${game.gameId ?? index + 1} awayScore`);
    if (!Number.isInteger(homeScore) || homeScore < 0 || !Number.isInteger(awayScore) || awayScore < 0) throw new Error(`Regular-season game ${game.gameId ?? index + 1} scores must be non-negative integers.`);
    if (homeScore === awayScore) throw new Error(`Completed NBA regular-season game ${game.gameId ?? index + 1} cannot be tied.`);
    const home = stats.get(homeTeamCode);
    const away = stats.get(awayTeamCode);
    const homeWon = homeScore > awayScore;
    const update = (team, opponent, ownScore, opponentScore, won) => {
      team.gamesPlayed += 1;
      team.wins += Number(won);
      team.losses += Number(!won);
      team.pointsFor += ownScore;
      team.pointsAgainst += opponentScore;
      if (team.conference === opponent.conference) {
        team.conferenceGames += 1;
        team.conferenceWins += Number(won);
      }
      if (team.conference === opponent.conference && team.division === opponent.division) {
        team.divisionGames += 1;
        team.divisionWins += Number(won);
      }
      const opponentRecord = matchups.get(team.teamCode).get(opponent.teamCode) ?? { wins: 0, losses: 0, games: 0 };
      opponentRecord.wins += Number(won);
      opponentRecord.losses += Number(!won);
      opponentRecord.games += 1;
      matchups.get(team.teamCode).set(opponent.teamCode, opponentRecord);
    };
    update(home, away, homeScore, awayScore, homeWon);
    update(away, home, awayScore, homeScore, !homeWon);
  }
  const gameCounts = [...stats.values()].map(row => row.gamesPlayed);
  if (gameCounts.some(count => count === 0)) throw new Error('Standings require at least one completed regular-season game for every team.');
  const hasUnequalGamesPlayed = new Set(gameCounts).size !== 1;
  if (hasUnequalGamesPlayed && !allowUnequalGamesPlayed) throw new Error('Final NBA standings require every team to have played the same number of regular-season games unless allowUnequalGamesPlayed is enabled for a season-specific format.');
  if (allowUnequalGamesPlayed && !expectedGamesByTeam) throw new Error('The 2019–20 bubble policy requires an expectedGamesByTeam map from a complete season ledger.');
  if (expectedGamesByTeam) {
    const expectedByTeam = expectedTeamGameCounts(expectedGamesByTeam, teams);
    if (!expectedByTeam || expectedByTeam.size !== teams.length || teams.some(team => !expectedByTeam.has(team.teamCode))) {
      throw new Error('expectedGamesByTeam must provide one expected regular-season game count for every supplied team.');
    }
    const invalidExpected = [...expectedByTeam.entries()].filter(([code, count]) => !stats.has(code) || !Number.isInteger(count) || count < 1);
    if (invalidExpected.length) throw new Error('expectedGamesByTeam contains an unknown team or a non-positive/non-integer game count.');
    const mismatches = [...stats.values()].filter(team => team.gamesPlayed !== expectedByTeam.get(team.teamCode));
    if (mismatches.length) throw new Error(`Regular-season ledger does not match expectedGamesByTeam for: ${mismatches.map(team => `${team.teamCode}=${team.gamesPlayed}/${expectedByTeam.get(team.teamCode)}`).join(', ')}.`);
  }
  const gamesPerTeam = hasUnequalGamesPlayed ? null : gameCounts[0];
  const expectedCount = expectedGamesPerTeam ?? defaultExpectedGamesPerTeam(seasonStartYear);
  if (expectedCount !== null && expectedCount !== undefined) {
    if (!Number.isInteger(expectedCount) || expectedCount < 1) throw new Error('expectedGamesPerTeam must be a positive integer.');
    if (hasUnequalGamesPlayed || gamesPerTeam !== expectedCount) throw new Error(`Standings require ${expectedCount} completed games/team; the ledger is not balanced at that count.`);
  }
  for (const row of stats.values()) {
    row.winPct = winPct(row.wins, row.gamesPlayed);
    row.conferenceWinPct = winPct(row.conferenceWins, row.conferenceGames);
    row.divisionWinPct = winPct(row.divisionWins, row.divisionGames);
    row.pointDifferential = row.pointsFor - row.pointsAgainst;
  }
  return {
    stats,
    matchups,
    normalizedGames,
    gamesPerTeam,
    gameCountRange: { min: Math.min(...gameCounts), max: Math.max(...gameCounts) },
  };
}

function eligibleTopTen(teamRows) {
  const ranked = [...teamRows].sort((a, b) => b.winPct - a.winPct || a.teamCode.localeCompare(b.teamCode));
  const cutoff = ranked[9]?.winPct ?? Number.NEGATIVE_INFINITY;
  return new Set(ranked.filter(team => team.winPct >= cutoff - 1e-12).map(team => team.teamCode));
}

function recordAgainst(teamCode, opponentCodes, matchups) {
  let wins = 0;
  let games = 0;
  for (const opponentCode of opponentCodes) {
    if (opponentCode === teamCode) continue;
    const row = matchups.get(teamCode)?.get(opponentCode);
    if (!row) continue;
    wins += row.wins;
    games += row.games;
  }
  return games ? wins / games : null;
}

function directRecord(teamCode, tiedCodes, matchups) {
  return recordAgainst(teamCode, tiedCodes, matchups);
}

function criteriaForTieGroup(group, context, { divisionChampionship = false } = {}) {
  const allSameDivision = group.every(team => divisionKey(team) === divisionKey(group[0]));
  const oppositeEligible = team => context.eligibleByConference.get(team.conference === context.conferences[0] ? context.conferences[1] : context.conferences[0]);
  const ownEligible = team => context.eligibleByConference.get(team.conference);
  const headToHead = { id: 'head-to-head-winning-percentage', value: team => directRecord(team.teamCode, group.map(row => row.teamCode), context.matchups) };
  const divisionStatus = { id: 'division-winner-status', value: team => Number(context.divisionWinners.get(divisionKey(team)) === team.teamCode) };
  const common = [];
  if (!divisionChampionship && group.length > 2) common.push(divisionStatus);
  common.push(headToHead);
  if (!divisionChampionship && group.length === 2) common.push(divisionStatus);
  if (allSameDivision) common.push({ id: 'division-winning-percentage', value: team => team.divisionWinPct });
  common.push({ id: 'conference-winning-percentage', value: team => team.conferenceWinPct });
  common.push({ id: 'own-conference-postseason-eligible-winning-percentage', value: team => recordAgainst(team.teamCode, ownEligible(team), context.matchups) });
  if (group.length === 2) common.push({ id: 'opposite-conference-postseason-eligible-winning-percentage', value: team => recordAgainst(team.teamCode, oppositeEligible(team), context.matchups) });
  common.push({ id: 'overall-point-differential', value: team => team.pointDifferential });
  return common;
}

function rankTiedGroup(group, context, random, trace, label, { divisionChampionship = false } = {}) {
  if (group.length < 2) return [...group];
  const criteria = criteriaForTieGroup(group, context, { divisionChampionship });
  for (const criterion of criteria) {
    const scored = group.map(team => ({ team, value: criterion.value(team) }));
    if (scored.some(row => row.value === null || !Number.isFinite(row.value))) continue;
    const uniqueValues = [...new Set(scored.map(row => Number(row.value.toFixed(12))))].sort((a, b) => b - a);
    if (uniqueValues.length < 2) continue;
    trace.push({
      scope: label,
      tiedTeamCodes: group.map(team => team.teamCode).sort(),
      criterion: criterion.id,
      values: Object.fromEntries(scored.map(row => [row.team.teamCode, row.value])),
    });
    const orderedGroups = uniqueValues.map(value => scored.filter(row => close(Number(row.value.toFixed(12)), value)).map(row => row.team));
    return orderedGroups.flatMap((remaining, index) => remaining.length > 1
      ? rankTiedGroup(remaining, context, random, trace, `${label}:remaining-tie-${index + 1}`, { divisionChampionship })
      : remaining);
  }
  const drawn = [...group].map(team => ({ team, draw: random() })).sort((a, b) => a.draw - b.draw);
  trace.push({
    scope: label,
    tiedTeamCodes: group.map(team => team.teamCode).sort(),
    criterion: 'seeded-random-drawing-after-official-tiebreakers',
    seedOrder: drawn.map(row => row.team.teamCode),
  });
  return drawn.map(row => row.team);
}

function orderRecordGroups(rows, context, random, trace, label, tieOptions = {}) {
  const groupsByWinPct = new Map();
  for (const team of rows) {
    const key = team.winPct.toFixed(12);
    const group = groupsByWinPct.get(key) ?? [];
    group.push(team);
    groupsByWinPct.set(key, group);
  }
  return [...groupsByWinPct.entries()]
    .sort(([a], [b]) => Number(b) - Number(a))
    .flatMap(([, group]) => group.length > 1
      ? rankTiedGroup(group, context, random, trace, label, tieOptions)
      : group);
}

/** Derive current-NBA conference seeds from a complete, balanced regular-season game ledger. */
export function computeNbaPostseasonSeeds({ teams, regularSeasonGames, seasonStartYear = null, expectedGamesPerTeam = null, expectedGamesByTeam = null, allowUnequalGamesPlayed = false, seed = 1 } = {}) {
  requireSupportedPostseasonEra(seasonStartYear);
  if (!Number.isFinite(Number(seed)) || !Number.isInteger(Number(seed))) throw new Error('Postseason seed must be an integer.');
  const normalized = normalizeTeams(teams);
  const ledger = buildSeasonLedger(normalized.teams, regularSeasonGames, { seasonStartYear, expectedGamesPerTeam, expectedGamesByTeam, allowUnequalGamesPlayed });
  const rows = normalized.teams.map(team => ({ ...team, ...ledger.stats.get(team.teamCode) }));
  const conferences = [...normalized.conferences.keys()].sort();
  const eligibleByConference = new Map(conferences.map(conference => [conference, eligibleTopTen(rows.filter(team => team.conference === conference))]));
  const random = seededRandom(seed);
  const tiebreakTrace = [];
  const context = {
    matchups: ledger.matchups,
    conferences,
    eligibleByConference,
    divisionWinners: new Map(),
  };

  for (const [key, divisionTeams] of normalized.divisions) {
    const highestPct = Math.max(...divisionTeams.map(team => ledger.stats.get(team.teamCode).winPct));
    const leaders = divisionTeams
      .filter(team => close(ledger.stats.get(team.teamCode).winPct, highestPct))
      .map(team => ({ ...team, ...ledger.stats.get(team.teamCode) }));
    const orderedLeaders = leaders.length > 1
      ? rankTiedGroup(leaders, context, random, tiebreakTrace, `division-winner:${key}`, { divisionChampionship: true })
      : leaders;
    context.divisionWinners.set(key, orderedLeaders[0].teamCode);
  }

  const conferenceStandings = Object.fromEntries(conferences.map(conference => {
    const conferenceTeams = rows.filter(team => team.conference === conference);
    const ranked = orderRecordGroups(conferenceTeams, context, random, tiebreakTrace, `conference-seeding:${conference}`);
    return [conference, ranked.map((team, index) => ({
      seed: index + 1,
      teamCode: team.teamCode,
      conference: team.conference,
      division: team.division,
      gamesPlayed: team.gamesPlayed,
      wins: team.wins,
      losses: team.losses,
      winPct: team.winPct,
      conferenceWins: team.conferenceWins,
      conferenceGames: team.conferenceGames,
      conferenceWinPct: team.conferenceWinPct,
      divisionWins: team.divisionWins,
      divisionGames: team.divisionGames,
      divisionWinPct: team.divisionWinPct,
      pointsFor: team.pointsFor,
      pointsAgainst: team.pointsAgainst,
      pointDifferential: team.pointDifferential,
      divisionWinner: context.divisionWinners.get(divisionKey(team)) === team.teamCode,
      qualification: index < 6 ? 'playoff-qualified' : index < 10 ? 'play-in-eligible' : 'eliminated',
    }))];
  }));
  return {
    format: STANDINGS_FORMAT,
    status: 'seeded-from-completed-regular-season-games',
    seasonStartYear,
    gamesPerTeam: ledger.gamesPerTeam,
    regularSeasonGameCount: ledger.normalizedGames.length,
    conferences: conferenceStandings,
    divisionWinners: Object.fromEntries(context.divisionWinners),
    tiebreakTrace,
    tiebreakSeed: Number(seed) >>> 0,
    gamesPerTeamRange: ledger.gameCountRange,
    rules: {
      sourceUrl: NBA_STANDINGS_RULES_URL,
      seedingFormatSourceUrl: NBA_MODERN_SEEDING_RULES_URL,
      criterionSummary: 'NBA two-team and multi-team playoff tiebreak order, with division winners established first; deterministic seeded random drawing is used only if all published criteria remain tied.',
      criteriaVersion: 'nba-playoff-seeding-effective-2015-16-v1',
    },
  };
}

function resolvePlayInPolicy(policy, seasonStartYear) {
  if (policy && policy !== 'auto') {
    if (!['nba-7-10-three-game-v1', 'nba-2019-bubble-conditional-v1', 'none'].includes(policy)) throw new Error(`Unsupported Play-In policy: ${policy}.`);
    if (policy === 'nba-2019-bubble-conditional-v1' && seasonStartYear !== 2019) throw new Error('The conditional bubble Play-In policy applies only to the 2019–20 season.');
    if (policy === 'nba-7-10-three-game-v1' && seasonStartYear < 2020) throw new Error('The 7–10 Play-In policy applies only from the 2020–21 season onward.');
    if (seasonStartYear === 2019 && policy !== 'nba-2019-bubble-conditional-v1') throw new Error('The 2019–20 postseason uses the conditional bubble policy even when the No. 8 seed qualifies without a Play-In game.');
    return policy;
  }
  if (seasonStartYear === 2019) throw new Error('The 2019–20 bubble used a special conditional Play-In; explicitly select nba-2019-bubble-conditional-v1.');
  return seasonStartYear >= 2020 ? 'nba-7-10-three-game-v1' : 'none';
}

function makeGameSeed(seedState) {
  seedState.value = (seedState.value + 0x6D2B79F5) >>> 0;
  let value = seedState.value;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return (value ^ (value >>> 14)) >>> 0;
}

function teamOrderForFinals(a, b, context, random, trace, finalsHomeCourtTeamCode = null) {
  if (finalsHomeCourtTeamCode) {
    const override = teamKey(finalsHomeCourtTeamCode);
    if (![a.teamCode, b.teamCode].includes(override)) throw new Error('finalsHomeCourtTeamCode must identify one of the two finalists.');
  }
  if (!close(a.winPct, b.winPct)) {
    const betterRecordTeam = a.winPct > b.winPct ? a : b;
    if (finalsHomeCourtTeamCode && teamKey(finalsHomeCourtTeamCode) !== betterRecordTeam.teamCode) {
      throw new Error('finalsHomeCourtTeamCode cannot override the finalist with the better regular-season record.');
    }
    return betterRecordTeam === a ? [a, b] : [b, a];
  }
  if (finalsHomeCourtTeamCode) {
    const override = teamKey(finalsHomeCourtTeamCode);
    trace.push({ scope: 'nba-finals-home-court', tiedTeamCodes: [a.teamCode, b.teamCode].sort(), criterion: 'caller-supplied-finals-home-court-resolution', selectedTeamCode: override });
    return override === a.teamCode ? [a, b] : [b, a];
  }
  return rankTiedGroup([a, b], context, random, trace, 'nba-finals-home-court');
}

/** Simulate the Play-In and NBA playoff bracket from explicit regular-season teams and game inputs. */
export function simulateNbaPostseason({
  seasonStartYear,
  gameModel,
  teams,
  regularSeasonGames,
  gameInputForMatchup,
  seed = 1,
  expectedGamesPerTeam = null,
  expectedGamesByTeam = null,
  playInPolicy = 'auto',
  finalsHomeCourtTeamCode = null,
  restDaysForMatchup = null,
  simulateGameFn = null,
  gameOptions = {},
  maxTieRedraws = 20,
} = {}) {
  requireSupportedPostseasonEra(seasonStartYear);
  if (!Number.isFinite(Number(seed)) || !Number.isInteger(Number(seed))) throw new Error('Postseason seed must be an integer.');
  if (!gameModel || typeof gameModel !== 'object') throw new Error('Postseason simulation requires a game model.');
  if (typeof gameInputForMatchup !== 'function') throw new Error('Postseason simulation requires gameInputForMatchup so rosters and game-state inputs remain caller-controlled.');
  if (restDaysForMatchup !== null && typeof restDaysForMatchup !== 'function') throw new Error('restDaysForMatchup must be a function when supplied.');
  if (simulateGameFn !== null && typeof simulateGameFn !== 'function') throw new Error('simulateGameFn must be a function when supplied.');
  if (!Number.isInteger(maxTieRedraws) || maxTieRedraws < 0 || maxTieRedraws > 100) throw new Error('maxTieRedraws must be an integer between 0 and 100.');
  const arenaPolicy = resolvePlayInPolicy(playInPolicy, seasonStartYear);
  const originalTeams = normalizeTeams(teams);
  const allowUnequalGamesPlayed = arenaPolicy === 'nba-2019-bubble-conditional-v1';
  const seeds = computeNbaPostseasonSeeds({ teams: originalTeams.teams, regularSeasonGames, seasonStartYear, expectedGamesPerTeam, expectedGamesByTeam, allowUnequalGamesPlayed, seed });
  const originalByCode = new Map(originalTeams.teams.map(team => [team.teamCode, team]));
  const standingByCode = new Map(Object.values(seeds.conferences).flat().map(row => [row.teamCode, row]));
  const teamByCode = new Map([...standingByCode.entries()].map(([teamCode, row]) => [
    teamCode,
    { ...originalByCode.get(teamCode), ...row },
  ]));
  const conferences = Object.keys(seeds.conferences).sort();
  const context = {
    matchups: buildSeasonLedger(originalTeams.teams, regularSeasonGamesForYear(regularSeasonGames, seasonStartYear), { seasonStartYear, expectedGamesPerTeam, expectedGamesByTeam, allowUnequalGamesPlayed }).matchups,
    conferences,
    eligibleByConference: new Map(conferences.map(conference => [conference, eligibleTopTen([...teamByCode.values()].filter(team => team.conference === conference))])),
    divisionWinners: new Map(Object.entries(seeds.divisionWinners)),
  };
  const tiebreakTrace = [...seeds.tiebreakTrace];
  const randomForFinals = seededRandom((Number(seed) ^ 0xF1A15) >>> 0);
  const seedState = { value: (Number(seed) >>> 0) || 1 };
  const games = [];
  const playoffRounds = [];
  const playInByConference = {};
  const postseasonGamesPlayedByTeam = Object.fromEntries(originalTeams.teams.map(team => [team.teamCode, 0]));
  const maxGamesCount = maxTieRedraws + 1;

  function runGame({ gameId, stage, conference, round, gameNumber, seriesId = null, homeTeam, awayTeam, homeCourtTeamCode = homeTeam.teamCode, neutralSite = false }) {
    const baseMatchupContext = {
      seasonStartYear,
      gameId,
      stage,
      conference,
      round,
      gameNumber,
      seriesId,
      homeTeam,
      awayTeam,
      homeCourtTeamCode,
      neutralSite: Boolean(neutralSite),
      postseasonGamesPlayedByTeam: { ...postseasonGamesPlayedByTeam },
      priorPostseasonGames: [...games],
    };
    const restDays = restDaysForMatchup === null ? null : restDaysForMatchup(baseMatchupContext);
    if (restDaysForMatchup !== null && (!restDays || typeof restDays !== 'object'
      || !Number.isInteger(restDays.homeRestDays) || restDays.homeRestDays < 0 || restDays.homeRestDays > 30
      || !Number.isInteger(restDays.awayRestDays) || restDays.awayRestDays < 0 || restDays.awayRestDays > 30)) {
      throw new Error(`restDaysForMatchup must return integer homeRestDays and awayRestDays from 0 through 30 for ${gameId}.`);
    }
    const matchupContext = {
      ...baseMatchupContext,
      homeRestDays: restDays?.homeRestDays ?? null,
      awayRestDays: restDays?.awayRestDays ?? null,
      restDaysByTeam: restDays ? {
        [homeTeam.teamCode]: restDays.homeRestDays,
        [awayTeam.teamCode]: restDays.awayRestDays,
      } : null,
    };
    const suppliedInput = gameInputForMatchup(matchupContext);
    if (!suppliedInput || typeof suppliedInput !== 'object') throw new Error(`gameInputForMatchup returned no input for ${gameId}.`);
    const homeCourt = neutralSite ? 0 : 1;
    const input = {
      ...suppliedInput,
      neutralSite: Boolean(neutralSite),
      homeCourt,
      features: {
        ...(suppliedInput.features ?? {}),
        homeCourt,
        ...(restDays ? { homeRestDays: restDays.homeRestDays, awayRestDays: restDays.awayRestDays } : {}),
      },
    };
    const inputHome = teamKey(input.homeTeamCode ?? input.home?.teamCode);
    const inputAway = teamKey(input.awayTeamCode ?? input.away?.teamCode);
    if (inputHome !== homeTeam.teamCode || inputAway !== awayTeam.teamCode) throw new Error(`Game input ${gameId} must preserve home/away teams ${homeTeam.teamCode}/${awayTeam.teamCode}.`);
    const hasCompleteRotations = Array.isArray(input.home?.players) && input.home.players.length >= 5
      && Array.isArray(input.away?.players) && input.away.players.length >= 5;
    const runSimulation = simulateGameFn ?? (hasCompleteRotations ? simulateCoherentGame : simulateGame);
    let selected = null;
    let selectedResult = null;
    let tieRedraws = 0;
    let gameSeed = null;
    for (let attempt = 0; attempt < maxGamesCount; attempt += 1) {
      gameSeed = makeGameSeed(seedState);
      const result = runSimulation(gameModel, input, { ...gameOptions, seed: gameSeed, sampleCount: 1, neutralSite: Boolean(neutralSite) });
      const sample = result?.simulations?.[0];
      if (!sample) throw new Error(`Game model returned no score sample for ${gameId}.`);
      const homeScore = finite(sample.homeScore, `${gameId} home score`);
      const awayScore = finite(sample.awayScore, `${gameId} away score`);
      if (!Number.isInteger(homeScore) || homeScore < 0 || !Number.isInteger(awayScore) || awayScore < 0) throw new Error(`${gameId} must return non-negative integer team scores.`);
      if (homeScore === awayScore) {
        tieRedraws += 1;
        continue;
      }
      selected = { ...sample, homeScore, awayScore };
      selectedResult = result;
      break;
    }
    if (!selected) throw new Error(`${gameId} produced only tied regulation score draws after ${maxGamesCount} attempts. Supply an overtime-capable simulateGameFn or increase maxTieRedraws.`);
    const hasHomeBox = Array.isArray(selected.homeBox);
    const hasAwayBox = Array.isArray(selected.awayBox);
    if (hasHomeBox !== hasAwayBox) throw new Error(`${gameId} must provide both home and away player box scores, or neither.`);
    const hasPlayerBoxLines = hasHomeBox && (selected.homeBox.length > 0 || selected.awayBox.length > 0);
    const keepPlayerBoxes = hasPlayerBoxLines && (simulateGameFn !== null || hasCompleteRotations);
    const homePlayerBox = keepPlayerBoxes ? selected.homeBox : null;
    const awayPlayerBox = keepPlayerBoxes ? selected.awayBox : null;
    const homeTeamBoxScore = keepPlayerBoxes ? validatePlayerBoxScore(homePlayerBox, selected.homeTeamStats, selected.homeScore, `${gameId} home`) : null;
    const awayTeamBoxScore = keepPlayerBoxes ? validatePlayerBoxScore(awayPlayerBox, selected.awayTeamStats, selected.awayScore, `${gameId} away`) : null;
    const winnerTeamCode = selected.homeScore > selected.awayScore ? homeTeam.teamCode : awayTeam.teamCode;
    const row = {
      gameId,
      stage,
      conference,
      round,
      gameNumber,
      seriesId,
      homeTeamCode: homeTeam.teamCode,
      awayTeamCode: awayTeam.teamCode,
      homeCourtTeamCode,
      neutralSite: Boolean(matchupContext.neutralSite),
      homeRestDays: matchupContext.homeRestDays,
      awayRestDays: matchupContext.awayRestDays,
      restDaysByTeam: structuredClone(matchupContext.restDaysByTeam),
      restDaysStatus: restDays ? 'caller-supplied-scenario-input' : 'not-modeled',
      homeScore: selected.homeScore,
      awayScore: selected.awayScore,
      homePlayerBoxScore: homePlayerBox ? structuredClone(homePlayerBox) : null,
      awayPlayerBoxScore: awayPlayerBox ? structuredClone(awayPlayerBox) : null,
      homeTeamBoxScore,
      awayTeamBoxScore,
      playerBoxScoreStatus: selected.coherentBoxStatus ?? (homeTeamBoxScore && awayTeamBoxScore ? 'provided-and-reconciled' : 'not-generated'),
      playerBoxScoreChecks: structuredClone(selected.coherentBoxChecks ?? null),
      winnerTeamCode,
      modelId: selectedResult.modelId ?? gameModel.modelId ?? null,
      modelVersion: selectedResult.modelVersion ?? gameModel.version ?? null,
      modelStatus: selectedResult.status ?? gameModel.status ?? 'unknown',
      prediction: structuredClone(selectedResult.prediction ?? null),
      seed: gameSeed,
      tieRedraws,
      regulationOvertimeStatus: tieRedraws ? 'tied-regulation-draw-redrawn-no-overtime-period-simulated' : 'decisive-score-draw',
    };
    games.push(row);
    postseasonGamesPlayedByTeam[homeTeam.teamCode] += 1;
    postseasonGamesPlayedByTeam[awayTeam.teamCode] += 1;
    return row;
  }

  function simulateSeries(teamA, teamB, { conference, round, seriesId, finals = false } = {}) {
    const [first, second] = finals ? teamOrderForFinals(teamA, teamB, context, randomForFinals, tiebreakTrace, finalsHomeCourtTeamCode) : [teamA, teamB].sort((a, b) => a.seed - b.seed);
    const neutralSite = seasonStartYear === 2019;
    const homeCourtTeamCode = neutralSite ? null : first.teamCode;
    const wins = new Map([[first.teamCode, 0], [second.teamCode, 0]]);
    const seriesGames = [];
    for (let gameNumber = 1; gameNumber <= 7 && Math.max(...wins.values()) < 4; gameNumber += 1) {
      const favoredHome = [1, 2, 5, 7].includes(gameNumber);
      const homeTeam = favoredHome ? first : second;
      const awayTeam = favoredHome ? second : first;
      const game = runGame({
        gameId: `${seasonStartYear}-${seriesId}-G${gameNumber}`,
        stage: 'playoffs', conference, round, gameNumber, seriesId,
        homeTeam, awayTeam, homeCourtTeamCode, neutralSite,
      });
      seriesGames.push(game);
      wins.set(game.winnerTeamCode, wins.get(game.winnerTeamCode) + 1);
    }
    const winnerTeamCode = [...wins.entries()].find(([, count]) => count === 4)?.[0];
    if (!winnerTeamCode) throw new Error(`${seriesId} did not produce a winner in seven games.`);
    return {
      seriesId,
      conference,
      round,
      higherSeedTeamCode: first.teamCode,
      otherTeamCode: second.teamCode,
      homeCourtTeamCode,
      winnerTeamCode,
      loserTeamCode: winnerTeamCode === first.teamCode ? second.teamCode : first.teamCode,
      wins: Object.fromEntries(wins),
      games: seriesGames,
      neutralSite,
    };
  }

  for (const conference of conferences) {
    const standings = seeds.conferences[conference];
    const bySeed = new Map(standings.map(row => [row.seed, teamByCode.get(row.teamCode)]));
    let playoffTeams;
    const playInGames = [];
    if (arenaPolicy === 'nba-7-10-three-game-v1') {
      const sevenEight = runGame({
        gameId: `${seasonStartYear}-${conference}-PI-7V8`, stage: 'play-in', conference,
        round: 'play-in-first', gameNumber: 1, homeTeam: bySeed.get(7), awayTeam: bySeed.get(8),
      });
      const nineTen = runGame({
        gameId: `${seasonStartYear}-${conference}-PI-9V10`, stage: 'play-in', conference,
        round: 'play-in-elimination', gameNumber: 1, homeTeam: bySeed.get(9), awayTeam: bySeed.get(10),
      });
      const sevenEightLoser = sevenEight.winnerTeamCode === bySeed.get(7).teamCode ? bySeed.get(8) : bySeed.get(7);
      const nineTenWinner = teamByCode.get(nineTen.winnerTeamCode);
      const finalPlayIn = runGame({
        gameId: `${seasonStartYear}-${conference}-PI-8SEED`, stage: 'play-in', conference,
        round: 'play-in-final', gameNumber: 1, homeTeam: sevenEightLoser, awayTeam: nineTenWinner,
      });
      const seedSeven = teamByCode.get(sevenEight.winnerTeamCode);
      const seedEight = teamByCode.get(finalPlayIn.winnerTeamCode);
      const eliminated = [
        teamByCode.get(nineTen.winnerTeamCode === bySeed.get(9).teamCode ? bySeed.get(10).teamCode : bySeed.get(9).teamCode),
        teamByCode.get(finalPlayIn.winnerTeamCode === sevenEightLoser.teamCode ? nineTenWinner.teamCode : sevenEightLoser.teamCode),
        ...[11, 12, 13, 14, 15].map(seedNumber => bySeed.get(seedNumber)),
      ].map(team => team.teamCode);
      playInGames.push(sevenEight, nineTen, finalPlayIn);
      playInByConference[conference] = {
        policy: arenaPolicy,
        seeds: { 7: seedSeven.teamCode, 8: seedEight.teamCode },
        eliminated,
        games: playInGames,
      };
      playoffTeams = [...[1, 2, 3, 4, 5, 6].map(seedNumber => bySeed.get(seedNumber)), seedSeven, seedEight];
    } else if (arenaPolicy === 'nba-2019-bubble-conditional-v1') {
      const seedEight = bySeed.get(8);
      const seedNine = bySeed.get(9);
      const gamesBehind = ((seedEight.wins - seedNine.wins) + (seedNine.losses - seedEight.losses)) / 2;
      let playoffEight = seedEight;
      let bubblePlayInActive = gamesBehind <= 4;
      if (bubblePlayInActive) {
        const firstBubbleGame = runGame({
          gameId: `${seasonStartYear}-${conference}-PI-BUBBLE-G1`, stage: 'play-in', conference,
          round: '2019-bubble-conditional', gameNumber: 1, homeTeam: seedEight, awayTeam: seedNine,
          homeCourtTeamCode: null, neutralSite: true,
        });
        playInGames.push(firstBubbleGame);
        if (firstBubbleGame.winnerTeamCode === seedNine.teamCode) {
          const secondBubbleGame = runGame({
            gameId: `${seasonStartYear}-${conference}-PI-BUBBLE-G2`, stage: 'play-in', conference,
            round: '2019-bubble-conditional', gameNumber: 2, homeTeam: seedEight, awayTeam: seedNine,
            homeCourtTeamCode: null, neutralSite: true,
          });
          playInGames.push(secondBubbleGame);
          playoffEight = { ...teamByCode.get(secondBubbleGame.winnerTeamCode), regularSeasonSeed: teamByCode.get(secondBubbleGame.winnerTeamCode).seed, seed: 8 };
        }
      }
      const eliminated = [
        ...(!bubblePlayInActive ? [seedNine] : [playoffEight === seedEight ? seedNine : seedEight]),
        ...standings.slice(9).map(row => teamByCode.get(row.teamCode)),
      ].map(team => team.teamCode);
      playInByConference[conference] = {
        policy: arenaPolicy,
        active: bubblePlayInActive,
        gamesBehind: Number(gamesBehind.toFixed(3)),
        rule: 'The No. 8 seed qualifies with one win; the No. 9 seed must win twice, and the No. 9 seed participates only when no more than four games behind.',
        sourceUrl: NBA_BUBBLE_RULES_URL,
        seeds: { 8: playoffEight.teamCode },
        eliminated,
        games: playInGames,
      };
      if (playoffEight.teamCode !== seedEight.teamCode) teamByCode.set(playoffEight.teamCode, playoffEight);
      playoffTeams = [...[1, 2, 3, 4, 5, 6, 7].map(seedNumber => bySeed.get(seedNumber)), playoffEight];
    } else {
      playoffTeams = standings.slice(0, 8).map(row => teamByCode.get(row.teamCode));
      playInByConference[conference] = {
        policy: arenaPolicy,
        seeds: { 7: bySeed.get(7).teamCode, 8: bySeed.get(8).teamCode },
        eliminated: standings.slice(8).map(row => row.teamCode),
        games: [],
      };
    }
    const byPlayoffSeed = new Map(playoffTeams.map(team => [team.seed, team]));
    const firstRoundPairs = [[1, 8], [4, 5], [3, 6], [2, 7]];
    const firstRoundSeries = firstRoundPairs.map(([highSeed, lowSeed]) => simulateSeries(
      byPlayoffSeed.get(highSeed), byPlayoffSeed.get(lowSeed),
      { conference, round: 'first-round', seriesId: `${conference}-R1-${highSeed}v${lowSeed}` },
    ));
    const semifinalSeries = [
      [firstRoundSeries[0], firstRoundSeries[1]],
      [firstRoundSeries[3], firstRoundSeries[2]],
    ].map(([left, right], index) => simulateSeries(
      teamByCode.get(left.winnerTeamCode), teamByCode.get(right.winnerTeamCode),
      { conference, round: 'conference-semifinals', seriesId: `${conference}-CSF-${index + 1}` },
    ));
    const conferenceFinal = simulateSeries(
      teamByCode.get(semifinalSeries[0].winnerTeamCode), teamByCode.get(semifinalSeries[1].winnerTeamCode),
      { conference, round: 'conference-finals', seriesId: `${conference}-CF` },
    );
    playoffRounds.push({
      conference,
      firstRound: firstRoundSeries,
      conferenceSemifinals: semifinalSeries,
      conferenceFinals: conferenceFinal,
      conferenceChampionTeamCode: conferenceFinal.winnerTeamCode,
    });
  }

  const conferenceChampions = playoffRounds.map(row => teamByCode.get(row.conferenceChampionTeamCode));
  if (finalsHomeCourtTeamCode && !conferenceChampions.some(team => team.teamCode === teamKey(finalsHomeCourtTeamCode))) {
    throw new Error('finalsHomeCourtTeamCode must identify one of the two conference champions.');
  }
  const finals = simulateSeries(conferenceChampions[0], conferenceChampions[1], {
    conference: 'NBA', round: 'nba-finals', seriesId: `${seasonStartYear}-NBA-FINALS`, finals: true,
  });
  const champion = teamByCode.get(finals.winnerTeamCode);
  const playoffGameCount = games.filter(game => game.stage === 'playoffs').length;
  const playInGameCount = games.filter(game => game.stage === 'play-in').length;
  const playerStatistics = aggregatePostseasonPlayerStatistics(games, seasonStartYear);
  const finalsMvp = selectFinalsMvp(finals.games, champion.teamCode, seasonStartYear);
  const status = seasonStartYear > 2026 ? 'simulated-future-rules-assumed' : arenaPolicy === 'nba-2019-bubble-conditional-v1' ? 'simulated-from-configured-2019-bubble-rules' : 'simulated-from-configured-current-era-rules';
  return {
    format: FORMAT,
    schemaVersion: '1.0.0',
    status,
    seasonStartYear,
    standings: seeds,
    playIn: {
      policy: arenaPolicy,
      sourceUrl: arenaPolicy === 'nba-7-10-three-game-v1' ? NBA_PLAY_IN_RULES_URL : arenaPolicy === 'nba-2019-bubble-conditional-v1' ? NBA_BUBBLE_RULES_URL : null,
      conferences: playInByConference,
      gameCount: playInGameCount,
    },
    playoffRounds,
    finals,
    finalsMvp,
    champion: {
      teamCode: champion.teamCode,
      conference: champion.conference,
      playoffSeed: champion.seed,
      regularSeasonSeed: champion.regularSeasonSeed ?? champion.seed,
      regularSeasonRecord: { wins: champion.wins, losses: champion.losses, winPct: champion.winPct },
    },
    games,
    playerStatistics,
    summary: {
      regularSeasonGamesPerTeam: seeds.gamesPerTeam,
      regularSeasonGamesPerTeamRange: seeds.gamesPerTeamRange,
      playInGames: playInGameCount,
      playoffGames: playoffGameCount,
      totalPostseasonGames: games.length,
      playerStatisticsStatus: playerStatistics.status,
      playerStatisticsGamesWithBoxes: playerStatistics.gamesWithPlayerBoxes,
      playerStatisticsGamesWithoutBoxes: playerStatistics.gamesWithoutPlayerBoxes,
      restScheduleStatus: restDaysForMatchup ? 'caller-supplied-for-every-game' : 'not-modeled',
      finalsMvpStatus: finalsMvp.status,
      finalsMvpCanonicalName: finalsMvp.winner?.canonicalName ?? null,
      simulatedGameModelId: gameModel.modelId ?? null,
      overtimeHandling: 'regulation score ties are redrawn with new seeds; no separate overtime game segment or overtime minutes are currently modeled',
      postseasonCalendar: seasonStartYear === 2019 ? '2019–20 bubble games are marked neutral-site; official dates and travel are not generated' : 'game order and home-court sequence are simulated; official dates and travel are not generated',
    },
    rules: {
      ruleset: 'nba-postseason-seeding-effective-2015-16-v1',
      playInPolicy: arenaPolicy,
      playInSourceUrl: arenaPolicy === 'nba-7-10-three-game-v1' ? NBA_PLAY_IN_RULES_URL : arenaPolicy === 'nba-2019-bubble-conditional-v1' ? NBA_BUBBLE_RULES_URL : null,
      playoffFormat: 'best-of-seven-2-2-1-1-1',
      playoffFormatSourceUrl: NBA_PLAYOFF_FORMAT_URL,
      finalsHomeCourt: finals.homeCourtTeamCode,
      standingsTiebreakRulesUrl: NBA_STANDINGS_RULES_URL,
      seedingFormatSourceUrl: NBA_MODERN_SEEDING_RULES_URL,
      neutralSitePolicy: seasonStartYear === 2019 ? '2019-20-orlando-bubble-neutral-site-for-play-in-and-playoffs' : 'home-court-applied-per-configured-series-format',
      restModel: restDaysForMatchup ? 'caller-supplied-integer-rest-days-per-matchup; scenario input and not official calendar evidence' : 'not-modeled',
      futurePolicy: seasonStartYear > 2026 ? 'current-era-rules-carried-forward-as-an-editable-assumption-until-official-season-rules-are-supplied' : 'configured-era-policy',
      finalHomeCourtDrawSeed: Number(seed) >>> 0,
    },
    disclosure: 'Postseason seeding is derived from the supplied regular-season game ledger. Play-In and playoff outcomes are sampled from the supplied development-candidate game model. When complete five-player-or-larger rotations are supplied without a custom game runner, the experimental coherent box wrapper generates player boxes and validates player points against team scores; otherwise, player boxes depend on the selected custom runner. Results are simulated, not observed or certified forecasts. Regulation ties are redrawn rather than extended with a dedicated overtime process.',
  };
}
