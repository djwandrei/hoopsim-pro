const FORMAT = 'djhc-nba-regular-season-schedule-v1';
const FLEX_FORMAT = 'nba-cup-two-flex-game-slots-v1';
const DAY_MS = 86_400_000;

export const NBA_TEAM_GROUPS_2026_27 = Object.freeze([
  ...teamRows('East', 'Atlantic', ['BOS', 'BKN', 'NYK', 'PHI', 'TOR']),
  ...teamRows('East', 'Central', ['CHI', 'CLE', 'DET', 'IND', 'MIL']),
  ...teamRows('East', 'Southeast', ['ATL', 'CHA', 'MIA', 'ORL', 'WAS']),
  ...teamRows('West', 'Northwest', ['DEN', 'MIN', 'OKC', 'POR', 'UTA']),
  ...teamRows('West', 'Pacific', ['GSW', 'LAC', 'LAL', 'PHX', 'SAC']),
  ...teamRows('West', 'Southwest', ['DAL', 'HOU', 'MEM', 'NOP', 'SAS']),
]);

function teamRows(conference, division, teamCodes) {
  return teamCodes.map(teamCode => ({
    teamCode,
    conference,
    division,
    ...(teamCode === 'LAL' ? {
      arenaId: 'crypto-com-arena',
      arenaIdSourceStatus: 'verified-2026-27-team-schedule',
      arenaIdSourceUrl: 'https://www.nba.com/lakers/schedule?SeasonType=002',
    } : teamCode === 'LAC' ? {
      arenaId: 'intuit-dome',
      arenaIdSourceStatus: 'verified-team-arena-reference',
      arenaIdSourceUrl: 'https://www.nba.com/clippers/intuitdomepress',
    } : {
      arenaId: `arena-${teamCode}`,
      arenaIdSourceStatus: 'simulator-unique-venue-placeholder',
    }),
  }));
}

function clone(value) { return structuredClone(value); }
function mod(value, divisor) { return ((value % divisor) + divisor) % divisor; }
function isoDate(date) { return date.toISOString().slice(0, 10); }
function parseIsoDate(value, label = 'date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || isoDate(date) !== value) throw new Error(`${label} is not a valid calendar date.`);
  return date;
}
function addDays(value, count) {
  const date = value instanceof Date ? new Date(value) : parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + count);
  return isoDate(date);
}
function dayDifference(later, earlier) {
  return Math.round((parseIsoDate(later).getTime() - parseIsoDate(earlier).getTime()) / DAY_MS);
}
function weekdayOnOrAfter(year, monthIndex, dayOfWeek, firstDay = 1) {
  const date = new Date(Date.UTC(year, monthIndex, firstDay));
  return addDays(date, mod(dayOfWeek - date.getUTCDay(), 7));
}
function nthWeekday(year, monthIndex, dayOfWeek, ordinal) {
  return addDays(weekdayOnOrAfter(year, monthIndex, dayOfWeek, 1), (ordinal - 1) * 7);
}
function firstWeekdayInDecember(year, dayOfWeek) {
  return weekdayOnOrAfter(year, 11, dayOfWeek, 1);
}

function makeDefaultCalendar(seasonStartYear) {
  const openingDate = nthWeekday(seasonStartYear, 9, 2, 3); // third Tuesday in October
  const closingDate = nthWeekday(seasonStartYear + 1, 3, 0, 2); // second Sunday in April
  const allStarSunday = nthWeekday(seasonStartYear + 1, 1, 0, 3);
  const cupStart = firstWeekdayInDecember(seasonStartYear, 5); // first Friday in December
  return {
    sourceStatus: 'simulator-default-calendar-assumption',
    openingDate,
    closingDate,
    allStarBreak: { startDate: addDays(allStarSunday, -2), endDate: addDays(allStarSunday, 3) },
    cupFlexWindow: { startDate: cupStart, endDate: addDays(cupStart, 6) },
    cupFlexDates: [addDays(cupStart, 1), addDays(cupStart, 4)],
  };
}

function normalizeCalendar(seasonStartYear, supplied = {}) {
  const defaults = makeDefaultCalendar(seasonStartYear);
  const calendar = {
    ...defaults,
    ...clone(supplied),
    allStarBreak: supplied.allStarBreak ? clone(supplied.allStarBreak) : defaults.allStarBreak,
    cupFlexWindow: supplied.cupFlexWindow ? clone(supplied.cupFlexWindow) : defaults.cupFlexWindow,
    cupFlexDates: supplied.cupFlexDates ? [...supplied.cupFlexDates] : defaults.cupFlexDates,
    blackoutRanges: Array.isArray(supplied.blackoutRanges) ? clone(supplied.blackoutRanges) : [],
  };
  for (const field of ['openingDate', 'closingDate']) parseIsoDate(calendar[field], `calendar.${field}`);
  for (const field of ['startDate', 'endDate']) {
    parseIsoDate(calendar.allStarBreak?.[field], `calendar.allStarBreak.${field}`);
    parseIsoDate(calendar.cupFlexWindow?.[field], `calendar.cupFlexWindow.${field}`);
  }
  if (!Array.isArray(calendar.cupFlexDates) || calendar.cupFlexDates.length !== 2 || calendar.cupFlexDates[0] === calendar.cupFlexDates[1]) {
    throw new Error('calendar.cupFlexDates must contain two distinct dates.');
  }
  for (const date of calendar.cupFlexDates) {
    parseIsoDate(date, 'calendar.cupFlexDates[]');
    if (date < calendar.openingDate || date > calendar.closingDate) {
      throw new Error(`Cup flex date ${date} falls outside the regular-season calendar.`);
    }
  }
  for (const [index, range] of calendar.blackoutRanges.entries()) {
    parseIsoDate(range?.startDate, `calendar.blackoutRanges[${index}].startDate`);
    parseIsoDate(range?.endDate, `calendar.blackoutRanges[${index}].endDate`);
    if (range.startDate > range.endDate) throw new Error(`calendar.blackoutRanges[${index}] is reversed.`);
  }
  for (const date of calendar.cupFlexDates) {
    if (isBetween(date, calendar.allStarBreak)) throw new Error(`Cup flex date ${date} falls during the configured All-Star break.`);
    if (calendar.blackoutRanges.some(range => isBetween(date, range))) throw new Error(`Cup flex date ${date} falls in a configured blackout range.`);
  }
  if (calendar.openingDate >= calendar.closingDate) throw new Error('The regular season calendar must have a positive date range.');
  if (calendar.allStarBreak.startDate > calendar.allStarBreak.endDate) throw new Error('All-Star break dates are reversed.');
  if (calendar.cupFlexWindow.startDate > calendar.cupFlexWindow.endDate) throw new Error('NBA Cup flex window dates are reversed.');
  for (const date of calendar.cupFlexDates) {
    if (date < calendar.cupFlexWindow.startDate || date > calendar.cupFlexWindow.endDate) throw new Error(`Cup flex date ${date} is outside the configured flex window.`);
  }
  return calendar;
}

function normalizeTeams(teams) {
  if (!Array.isArray(teams) || teams.length !== 30) throw new Error('NBA 82-game v1 scheduling requires exactly 30 teams; provide an updated custom league format after expansion or realignment.');
  const normalized = teams.map(team => ({
    ...clone(team),
    teamCode: String(team.teamCode ?? '').trim().toUpperCase(),
    conference: String(team.conference ?? '').trim(),
    division: String(team.division ?? '').trim(),
    arenaId: String(team.arenaId ?? team.venueId ?? '').trim() || String(team.teamCode ?? '').trim().toUpperCase(),
  })).sort((a, b) => a.teamCode.localeCompare(b.teamCode));
  if (normalized.some(team => !team.teamCode || !team.conference || !team.division)) throw new Error('Each schedule team needs teamCode, conference, and division.');
  if (new Set(normalized.map(team => team.teamCode)).size !== normalized.length) throw new Error('NBA schedule teamCode values must be unique.');
  const byConference = new Map();
  const byDivision = new Map();
  for (const team of normalized) {
    const conference = byConference.get(team.conference) ?? [];
    conference.push(team);
    byConference.set(team.conference, conference);
    const key = `${team.conference}\u0000${team.division}`;
    const division = byDivision.get(key) ?? [];
    division.push(team);
    byDivision.set(key, division);
  }
  if (byConference.size !== 2 || [...byConference.values()].some(group => group.length !== 15)) throw new Error('NBA 82-game v1 requires two conferences with 15 teams each.');
  if (byDivision.size !== 6 || [...byDivision.values()].some(group => group.length !== 5)) throw new Error('NBA 82-game v1 requires six five-team divisions.');
  for (const [conference, group] of byConference) {
    if (new Set(group.map(team => team.division)).size !== 3) throw new Error(`Conference ${conference} must have three divisions.`);
  }
  return normalized;
}

function normalizeCupGroupPlayFixtures(teams, cupGroupPlayDates, cupGroupPlayFixtures, calendar, maxGamesPerDate = 15) {
  if (cupGroupPlayDates === undefined && cupGroupPlayFixtures === undefined) return { dates: [], fixtures: [] };
  if (!Array.isArray(cupGroupPlayDates) || cupGroupPlayDates.length < 5) throw new Error('cupGroupPlayDates must include at least five event dates when group-play fixtures are supplied.');
  if (!Array.isArray(cupGroupPlayFixtures) || cupGroupPlayFixtures.length !== 60) throw new Error('cupGroupPlayFixtures must include exactly 60 games when group-play dates are supplied.');
  const dates = cupGroupPlayDates.map((date, index) => {
    parseIsoDate(date, `cupGroupPlayDates[${index}]`);
    return date;
  });
  if (new Set(dates).size !== dates.length || dates.some((date, index) => index > 0 && date <= dates[index - 1])) {
    throw new Error('cupGroupPlayDates must be unique event dates in chronological order.');
  }
  for (const date of dates) {
    if (date < calendar.openingDate || date > calendar.closingDate) throw new Error(`Cup group-play date ${date} falls outside the regular-season calendar.`);
    if (isBetween(date, calendar.allStarBreak)) throw new Error(`Cup group-play date ${date} falls during the configured All-Star break.`);
    if (isBetween(date, calendar.cupFlexWindow)) throw new Error(`Cup group-play date ${date} falls during the reserved Cup flex window.`);
    if (calendar.cupFlexDates.includes(date)) throw new Error(`Cup group-play date ${date} conflicts with a Cup flex matchup date.`);
    if (calendar.blackoutRanges.some(range => isBetween(date, range)
      && range?.sourceStatus !== 'scenario-cup-group-play-event-date-reservation')) {
      throw new Error(`Cup group-play date ${date} falls in a configured blackout range.`);
    }
  }
  calendar.cupGroupPlayDates = [...dates];
  const teamByCode = new Map(teams.map(team => [team.teamCode, team]));
  const gameIds = new Set();
  const appearancesByTeam = new Map(teams.map(team => [team.teamCode, { games: 0, home: 0, away: 0, dates: new Set(), groups: new Set() }]));
  const pairsByGroup = new Map();
  const groupConferences = new Map();
  const gamesByGroupRound = new Map();
  const gameCountByDate = new Map(dates.map(date => [date, 0]));
  const normalized = cupGroupPlayFixtures.map((input, index) => {
    const gameId = String(input?.gameId ?? '').trim();
    const cupGroupId = String(input?.cupGroupId ?? '').trim();
    const conference = String(input?.conference ?? '').trim();
    const homeTeamCode = String(input?.homeTeamCode ?? '').trim().toUpperCase();
    const awayTeamCode = String(input?.awayTeamCode ?? '').trim().toUpperCase();
    const date = input?.date;
    const roundIndex = input?.roundIndex;
    if (!gameId || gameIds.has(gameId)) throw new Error(`cupGroupPlayFixtures[${index}] has a missing or duplicate gameId.`);
    gameIds.add(gameId);
    if (!cupGroupId || !['East', 'West'].includes(conference)) throw new Error(`${gameId} has a missing group id or invalid conference.`);
    if (!gameCountByDate.has(date)) throw new Error(`${gameId} date is outside cupGroupPlayDates.`);
    if (!Number.isInteger(roundIndex) || roundIndex < 1 || roundIndex > 5) {
      throw new Error(`${gameId} must identify one of the five round-robin rounds.`);
    }
    const homeTeam = teamByCode.get(homeTeamCode);
    const awayTeam = teamByCode.get(awayTeamCode);
    if (!homeTeam || !awayTeam || homeTeamCode === awayTeamCode
      || homeTeam.conference !== conference || awayTeam.conference !== conference) {
      throw new Error(`${gameId} must be an intra-conference NBA group-play matchup.`);
    }
    const groupPriorConference = groupConferences.get(cupGroupId);
    if (groupPriorConference && groupPriorConference !== conference) throw new Error(`${cupGroupId} crosses conferences.`);
    groupConferences.set(cupGroupId, conference);
    const homeAppearance = appearancesByTeam.get(homeTeamCode);
    const awayAppearance = appearancesByTeam.get(awayTeamCode);
    for (const [teamCode, appearance] of [[homeTeamCode, homeAppearance], [awayTeamCode, awayAppearance]]) {
      if (appearance.dates.has(date)) throw new Error(`${teamCode} appears twice on group-play date ${date}.`);
      appearance.dates.add(date);
      appearance.games += 1;
      appearance.groups.add(cupGroupId);
    }
    homeAppearance.home += 1;
    awayAppearance.away += 1;
    gameCountByDate.set(date, gameCountByDate.get(date) + 1);
    const pairKey = edgeKey(homeTeamCode, awayTeamCode);
    const groupPairs = pairsByGroup.get(cupGroupId) ?? new Set();
    if (groupPairs.has(pairKey)) throw new Error(`${cupGroupId} repeats opponent pair ${pairKey}.`);
    groupPairs.add(pairKey);
    pairsByGroup.set(cupGroupId, groupPairs);
    const groupRoundKey = `${cupGroupId}|${roundIndex}`;
    gamesByGroupRound.set(groupRoundKey, (gamesByGroupRound.get(groupRoundKey) ?? 0) + 1);
    return {
      ...clone(input),
      gameId,
      cupGroupId,
      conference,
      homeTeamCode,
      awayTeamCode,
      teamCodes: [homeTeamCode, awayTeamCode],
      date,
      roundIndex,
    };
  });
  if (groupConferences.size !== 6 || [...pairsByGroup.values()].some(pairs => pairs.size !== 10)) {
    throw new Error('Cup group-play fixtures must contain six groups with ten unique pairs each.');
  }
  if (gamesByGroupRound.size !== 30 || [...gamesByGroupRound.values()].some(count => count !== 2)) {
    throw new Error('Cup group-play fixtures must contain two games in each of five rounds for all six groups.');
  }
  if ([...gameCountByDate.values()].some(count => count < 1 || count > maxGamesPerDate)) {
    throw new Error(`Each configured cupGroupPlayDate must contain 1 to ${maxGamesPerDate} group-play games.`);
  }
  for (const [teamCode, row] of appearancesByTeam) {
    if (row.games !== 4 || row.home !== 2 || row.away !== 2 || row.dates.size !== 4 || row.groups.size !== 1) {
      throw new Error(`${teamCode} must have four group games, one bye, and a 2-home/2-away split in one Cup group.`);
    }
  }
  return { dates, fixtures: normalized };
}

function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function edgeKey(a, b) { return [a, b].sort().join('|'); }
function compareScheduledGames(left, right) {
  return left.date.localeCompare(right.date) || left.gameId.localeCompare(right.gameId);
}
function homeArenaId(game, teamByCode) {
  return String(teamByCode.get(game.homeTeamCode)?.arenaId ?? game.arenaId ?? game.homeTeamCode);
}

function orientEulerEdges(nodes, edges) {
  const adjacency = new Map(nodes.map(node => [node, []]));
  for (const edge of edges) {
    adjacency.get(edge.a).push({ edgeId: edge.id, other: edge.b });
    adjacency.get(edge.b).push({ edgeId: edge.id, other: edge.a });
  }
  for (const rows of adjacency.values()) rows.sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  const used = new Set();
  const orientation = new Map();
  for (const start of nodes) {
    if ((adjacency.get(start) ?? []).every(row => used.has(row.edgeId))) continue;
    const stack = [start];
    const circuit = [];
    while (stack.length) {
      const vertex = stack.at(-1);
      const edge = (adjacency.get(vertex) ?? []).find(row => !used.has(row.edgeId));
      if (!edge) circuit.push(stack.pop());
      else {
        used.add(edge.edgeId);
        stack.push(edge.other);
      }
    }
    const tour = circuit.reverse();
    for (let index = 0; index + 1 < tour.length; index += 1) {
      orientation.set(edgeKey(tour[index], tour[index + 1]), { from: tour[index], to: tour[index + 1] });
    }
  }
  if (orientation.size !== edges.length) throw new Error('Could not orient the three-game opponent graph.');
  return orientation;
}

function matchupMatrix(teams, seasonStartYear) {
  const teamByCode = new Map(teams.map(team => [team.teamCode, team]));
  const conferenceGroups = new Map();
  const divisionGroups = new Map();
  for (const team of teams) {
    const conference = conferenceGroups.get(team.conference) ?? [];
    conference.push(team);
    conferenceGroups.set(team.conference, conference);
    const key = `${team.conference}\u0000${team.division}`;
    const division = divisionGroups.get(key) ?? [];
    division.push(team);
    divisionGroups.set(key, division);
  }
  for (const group of divisionGroups.values()) group.sort((a, b) => a.teamCode.localeCompare(b.teamCode));
  const threeGameEdges = [];
  const counts = new Map();
  const rotationOffset = mod(seasonStartYear - 2027, 5);
  const divisionShift = new Map();
  for (const [conference, conferenceTeams] of conferenceGroups) {
    const divisions = [...new Set(conferenceTeams.map(team => team.division))].sort();
    for (const team of conferenceTeams) {
      divisionShift.set(team.teamCode, mod(divisions.indexOf(team.division) * rotationOffset, 5));
    }
  }
  const divisionKey = (a, b) => `${a.conference}\u0000${a.division}` === `${b.conference}\u0000${b.division}`;
  for (let left = 0; left < teams.length; left += 1) {
    for (let right = left + 1; right < teams.length; right += 1) {
      const a = teams[left];
      const b = teams[right];
      let games;
      if (divisionKey(a, b)) games = 4;
      else if (a.conference !== b.conference) games = 2;
      else {
        const groupA = divisionGroups.get(`${a.conference}\u0000${a.division}`);
        const groupB = divisionGroups.get(`${b.conference}\u0000${b.division}`);
        const aIndex = groupA.findIndex(row => row.teamCode === a.teamCode);
        const bIndex = groupB.findIndex(row => row.teamCode === b.teamCode);
        // The 82-game pattern assigns six non-division conference opponents
        // four games and four opponents three games. Rotate the rank-offset
        // mask over a five-season simulator cycle so a future generated slate
        // does not keep assigning the same teams the fourth meeting forever.
        const diff = mod(aIndex + divisionShift.get(a.teamCode) - bIndex - divisionShift.get(b.teamCode), 5);
        games = [0, 1, 4].includes(diff) ? 4 : 3;
        if (games === 3) threeGameEdges.push({ id: edgeKey(a.teamCode, b.teamCode), a: a.teamCode, b: b.teamCode });
      }
      counts.set(edgeKey(a.teamCode, b.teamCode), games);
    }
  }
  for (const team of teams) {
    const count = teams.reduce((sum, opponent) => sum + (opponent.teamCode === team.teamCode ? 0 : counts.get(edgeKey(team.teamCode, opponent.teamCode))), 0);
    if (count !== 82) throw new Error(`Generated NBA opponent matrix has ${count} games for ${team.teamCode}, expected 82.`);
  }
  for (const [conference, group] of conferenceGroups) {
    const conferenceEdges = threeGameEdges.filter(edge => teamByCode.get(edge.a).conference === conference);
    const degree = new Map(group.map(team => [team.teamCode, 0]));
    for (const edge of conferenceEdges) { degree.set(edge.a, degree.get(edge.a) + 1); degree.set(edge.b, degree.get(edge.b) + 1); }
    if ([...degree.values()].some(value => value !== 4)) throw new Error(`Three-game opponent graph is not four-regular in ${conference}.`);
  }
  return { counts, threeGameEdges, conferenceGroups, divisionGroups, rotationOffset };
}

function buildBaseGames(teams, seasonStartYear) {
  const { counts, threeGameEdges, conferenceGroups } = matchupMatrix(teams, seasonStartYear);
  const teamByCode = new Map(teams.map(team => [team.teamCode, team]));
  const orientation = new Map();
  for (const [conference, group] of conferenceGroups) {
    const nodes = group.map(team => team.teamCode);
    const edges = threeGameEdges.filter(edge => nodes.includes(edge.a));
    for (const [key, value] of orientEulerEdges(nodes, edges)) orientation.set(key, value);
  }
  const games = [];
  for (const [pairKey, count] of counts) {
    const [a, b] = pairKey.split('|');
    if (count === 4 || count === 2) {
      const homeCounts = count === 4 ? [[a, 2], [b, 2]] : [[a, 1], [b, 1]];
      for (const [home, homeGames] of homeCounts) {
        const away = home === a ? b : a;
        for (let index = 0; index < homeGames; index += 1) games.push({
          gameId: `${seasonStartYear}-${String(games.length + 1).padStart(4, '0')}`,
          seasonStartYear, homeTeamCode: home, awayTeamCode: away, gameType: 'regular-season',
          arenaId: teamByCode.get(home).arenaId,
          matchupSeriesGames: count,
        });
      }
    } else {
      const directed = orientation.get(pairKey);
      if (!directed) throw new Error(`Missing three-game series orientation for ${pairKey}.`);
      for (let index = 0; index < 2; index += 1) games.push({
        gameId: `${seasonStartYear}-${String(games.length + 1).padStart(4, '0')}`,
        seasonStartYear, homeTeamCode: directed.from, awayTeamCode: directed.to,
        arenaId: teamByCode.get(directed.from).arenaId,
        gameType: 'regular-season', matchupSeriesGames: count,
      });
      games.push({
        gameId: `${seasonStartYear}-${String(games.length + 1).padStart(4, '0')}`,
        seasonStartYear, homeTeamCode: directed.to, awayTeamCode: directed.from,
        arenaId: teamByCode.get(directed.to).arenaId,
        gameType: 'regular-season', matchupSeriesGames: count,
      });
    }
  }
  const participation = new Map(teams.map(team => [team.teamCode, { home: 0, away: 0, games: 0 }]));
  for (const game of games) {
    participation.get(game.homeTeamCode).home += 1;
    participation.get(game.homeTeamCode).games += 1;
    participation.get(game.awayTeamCode).away += 1;
    participation.get(game.awayTeamCode).games += 1;
  }
  for (const [teamCode, row] of participation) {
    if (row.games !== 82 || row.home !== 41 || row.away !== 41) throw new Error(`Base matchup matrix failed 82/41-41 balance for ${teamCode}.`);
  }
  return games;
}

function makeCupFlexSlots(teams, calendar, seasonStartYear) {
  const firstDateHome = new Set([...groupHomeRoles(teams, 0)].filter(([, role]) => role === 'home').map(([teamCode]) => teamCode));
  const [firstDate, secondDate] = calendar.cupFlexDates;
  return teams.flatMap(team => {
    const firstDateRole = firstDateHome.has(team.teamCode) ? 'home' : 'away';
    const secondDateRole = firstDateRole === 'home' ? 'away' : 'home';
    return [
      { slotId: `${seasonStartYear}-CUP-A-${team.teamCode}`, seasonStartYear, date: firstDate, teamCode: team.teamCode, role: firstDateRole, opponentStatus: 'pending-group-play-results', event: 'nba-cup-flex' },
      { slotId: `${seasonStartYear}-CUP-B-${team.teamCode}`, seasonStartYear, date: secondDate, teamCode: team.teamCode, role: secondDateRole, opponentStatus: 'pending-group-play-results', event: 'nba-cup-flex' },
    ];
  });
}

function dateListBetween(startDate, endDate) {
  const dates = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function backToBackCount(rows) {
  const dates = [...new Set(rows.map(row => row.date))].sort();
  return dates.reduce((sum, date, index) => sum + Number(index > 0 && dayDifference(date, dates[index - 1]) === 1), 0);
}

function maximumWindowCount(rows, days) {
  const dates = [...new Set(rows.map(row => typeof row === 'string' ? row : row.date))].sort();
  let max = 0;
  for (let right = 0, left = 0; right < dates.length; right += 1) {
    while (dayDifference(dates[right], dates[left]) >= days) left += 1;
    max = Math.max(max, right - left + 1);
  }
  return max;
}

function longestVenueStreak(rows) {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  let longest = 0;
  let current = 0;
  let prior = null;
  for (const row of ordered) {
    const role = row.role === 'home' ? 'home' : row.role === 'away' ? 'away' : null;
    if (!role) { current = 0; prior = null; continue; }
    current = role === prior ? current + 1 : 1;
    prior = role;
    longest = Math.max(longest, current);
  }
  return longest;
}

function teamScheduleSummary(teamCode, rows) {
  return {
    teamCode,
    games: rows.length,
    home: rows.filter(row => row.role === 'home').length,
    away: rows.filter(row => row.role === 'away').length,
    backToBacks: backToBackCount(rows),
    maxGamesIn5Days: maximumWindowCount(rows, 5),
    maxGamesIn12Days: maximumWindowCount(rows, 12),
    maxGamesIn30Days: maximumWindowCount(rows, 30),
    longestHomeOrRoadStreak: longestVenueStreak(rows),
  };
}

function findPerfectMatching(teamCodes, remainingCounts, rng, nodeLimit) {
  const unmatched = new Set(teamCodes);
  const pairs = [];
  let visitedNodes = 0;
  function search() {
    visitedNodes += 1;
    if (visitedNodes > nodeLimit) return false;
    if (!unmatched.size) return true;
    let selectedTeam = null;
    let selectedOptions = null;
    for (const teamCode of unmatched) {
      const options = [...unmatched].filter(other => other !== teamCode && (remainingCounts.get(edgeKey(teamCode, other)) ?? 0) > 0);
      if (!options.length) return false;
      if (!selectedOptions || options.length < selectedOptions.length) {
        selectedTeam = teamCode;
        selectedOptions = options;
        if (options.length === 1) break;
      }
    }
    const rank = new Map(selectedOptions.map(teamCode => [teamCode, rng()]));
    selectedOptions.sort((a, b) => (remainingCounts.get(edgeKey(selectedTeam, b)) - remainingCounts.get(edgeKey(selectedTeam, a))) || rank.get(a) - rank.get(b));
    unmatched.delete(selectedTeam);
    for (const opponent of selectedOptions) {
      unmatched.delete(opponent);
      pairs.push([selectedTeam, opponent]);
      if (search()) return true;
      pairs.pop();
      unmatched.add(opponent);
    }
    unmatched.add(selectedTeam);
    return false;
  }
  return search() ? { pairs, visitedNodes } : null;
}

function chooseGamesForRound(pairs, pairBuckets, teamByCode, rng) {
  const orderedPairs = pairs.map(pair => ({
    pair,
    options: shuffled(pairBuckets.get(edgeKey(...pair)) ?? [], rng),
  })).sort((a, b) => a.options.length - b.options.length);
  const selected = [];
  const usedHomeArenas = new Set();
  function choose(index) {
    if (index === orderedPairs.length) return true;
    for (const game of orderedPairs[index].options) {
      const arenaId = homeArenaId(game, teamByCode);
      if (usedHomeArenas.has(arenaId)) continue;
      usedHomeArenas.add(arenaId);
      selected.push(game);
      if (choose(index + 1)) return true;
      selected.pop();
      usedHomeArenas.delete(arenaId);
    }
    return false;
  }
  return choose(0) ? selected : null;
}

function roundHasUniqueHomeArenas(roundGames, teamByCode) {
  const seen = new Set();
  for (const game of roundGames) {
    const arenaId = homeArenaId(game, teamByCode);
    if (seen.has(arenaId)) return false;
    seen.add(arenaId);
  }
  return true;
}

function buildRoundMatchings(teams, games, seed, constraints) {
  const teamCodes = teams.map(team => team.teamCode);
  const gamesPerTeam = games.length * 2 / teams.length;
  if (!Number.isInteger(gamesPerTeam)) throw new Error('Fixed schedule game count must divide evenly across the league.');
  for (let attempt = 0; attempt < constraints.matchingFactorizationAttempts; attempt += 1) {
    const rng = seededRandom((Number(seed) + Math.imul(attempt + 1, 0x85EBCA6B)) >>> 0);
    const pairBuckets = new Map();
    const remainingCounts = new Map();
    for (const game of games) {
      const key = edgeKey(game.homeTeamCode, game.awayTeamCode);
      const bucket = pairBuckets.get(key) ?? [];
      bucket.push(game);
      pairBuckets.set(key, bucket);
      remainingCounts.set(key, (remainingCounts.get(key) ?? 0) + 1);
    }
    const rounds = [];
    let failed = false;
    for (let roundIndex = 0; roundIndex < gamesPerTeam; roundIndex += 1) {
      const matching = findPerfectMatching(teamCodes, remainingCounts, rng, constraints.matchingSearchNodeLimit);
      if (!matching) { failed = true; break; }
      const teamByCode = new Map(teams.map(team => [team.teamCode, team]));
      const selectedGames = chooseGamesForRound(matching.pairs, pairBuckets, teamByCode, rng)
        ?? matching.pairs.map(([a, b]) => {
          const bucket = pairBuckets.get(edgeKey(a, b));
          return bucket[Math.floor(rng() * bucket.length)];
        });
      const roundGames = [];
      for (const game of selectedGames) {
        const key = edgeKey(game.homeTeamCode, game.awayTeamCode);
        const bucket = pairBuckets.get(key);
        const index = bucket?.indexOf(game) ?? -1;
        if (index < 0) { failed = true; break; }
        bucket.splice(index, 1);
        remainingCounts.set(key, remainingCounts.get(key) - 1);
        roundGames.push(game);
      }
      if (failed) break;
      rounds.push(roundGames);
    }
    if (!failed && rounds.length === gamesPerTeam && [...remainingCounts.values()].every(count => count === 0)) return { rounds, attempt: attempt + 1 };
  }
  throw new Error(`Could not factor the NBA matchup matrix into ${gamesPerTeam} full-league rounds. Increase matchingFactorizationAttempts/searchNodeLimit or revise the matchup matrix.`);
}

function isBetween(date, range) { return date >= range.startDate && date <= range.endDate; }

function chooseSeasonRoundDates(calendar, splitRoundCount, reserveCupWindow) {
  const closingDate = calendar.closingDate;
  let penultimateDate = addDays(closingDate, -2);
  const blocked = date => isBetween(date, calendar.allStarBreak)
    || (reserveCupWindow && isBetween(date, calendar.cupFlexWindow))
    || (calendar.cupGroupPlayDates ?? []).includes(date)
    || (calendar.blackoutRanges ?? []).some(range => isBetween(date, range));
  if (blocked(closingDate)) throw new Error(`The configured closing date ${closingDate} overlaps a blocked calendar date.`);
  while (penultimateDate > calendar.openingDate && blocked(penultimateDate)) penultimateDate = addDays(penultimateDate, -1);
  if (penultimateDate <= calendar.openingDate || dayDifference(closingDate, penultimateDate) < 2) throw new Error('Could not reserve distinct penultimate and final full-league game dates.');
  const splitDates = dateListBetween(calendar.openingDate, addDays(penultimateDate, -2)).filter(date => !blocked(date));
  const dateSegments = [];
  for (const date of splitDates) {
    const segment = dateSegments.at(-1);
    if (!segment || dayDifference(date, segment.at(-1)) !== 1) dateSegments.push([date]);
    else segment.push(date);
  }
  const availablePairs = dateSegments.flatMap(segment => {
    const pairs = [];
    for (let index = 0; index + 1 < segment.length; index += 2) pairs.push([segment[index], segment[index + 1]]);
    return pairs;
  });
  if (availablePairs.length < splitRoundCount) throw new Error(`Calendar provides ${availablePairs.length} split-round date pairs but the matchup matrix requires ${splitRoundCount}. Widen the season or shorten configured blackout periods.`);
  const datePairs = [];
  for (let index = 0; index < splitRoundCount; index += 1) {
    const position = Math.floor((index + 0.5) * availablePairs.length / splitRoundCount);
    datePairs.push(availablePairs[position]);
  }
  datePairs.push([penultimateDate, penultimateDate], [closingDate, closingDate]);
  const scheduledSplitDates = new Set(datePairs.slice(0, splitRoundCount).flat());
  return { datePairs, penultimateDate, offCalendarDates: splitDates.filter(date => !scheduledSplitDates.has(date)) };
}

function selectEarlyRoundGames(roundGames, dateA, dateB, priorGameDate, b2bCounts, scheduledDatesByTeam, futureFixedDatesByTeam, constraints, progress, rng, teamByCode) {
  const costs = roundGames.map(game => [game.homeTeamCode, game.awayTeamCode].filter(teamCode => priorGameDate.get(teamCode) && dayDifference(dateA, priorGameDate.get(teamCode)) === 1));
  const candidateDateFeasibility = new Map();
  for (const team of teamByCode.values()) {
    const scheduledDates = scheduledDatesByTeam.get(team.teamCode) ?? new Set();
    const futureDates = futureFixedDatesByTeam.get(team.teamCode) ?? [];
    const feasibleByDate = new Map();
    for (const candidateDate of [dateA, dateB]) {
      const knownDates = [
        ...scheduledDates,
        ...futureDates.filter(date => date > candidateDate),
      ];
      if (knownDates.includes(candidateDate)) { feasibleByDate.set(candidateDate, false); continue; }
      const uniqueDates = [...new Set([...knownDates, candidateDate])].sort();
      let projectedBackToBacks = 0;
      for (let index = 1; index < uniqueDates.length; index += 1) {
        projectedBackToBacks += Number(dayDifference(uniqueDates[index], uniqueDates[index - 1]) === 1);
      }
      feasibleByDate.set(candidateDate, projectedBackToBacks <= constraints.maxBackToBacks
        && maximumWindowCount(uniqueDates, 5) <= constraints.maxGamesIn5Days
        && maximumWindowCount(uniqueDates, 12) <= constraints.maxGamesIn12Days
        && maximumWindowCount(uniqueDates, 30) <= constraints.maxGamesIn30Days);
    }
    candidateDateFeasibility.set(team.teamCode, feasibleByDate);
  }
  for (let earlyCount = Math.min(7, roundGames.length - 1); earlyCount >= 1; earlyCount -= 1) {
    let bestSelection = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const selected = [];
    function consider() {
      const early = new Set(selected);
      const arenasBySlate = { early: new Set(), late: new Set() };
      for (let index = 0; index < roundGames.length; index += 1) {
        const slate = early.has(index) ? 'early' : 'late';
        const arenaId = homeArenaId(roundGames[index], teamByCode);
        if (arenasBySlate[slate].has(arenaId)) return;
        arenasBySlate[slate].add(arenaId);
      }
      let added = 0;
      const addedByTeam = new Map();
      for (const index of selected) {
        for (const teamCode of costs[index]) {
          if ((b2bCounts.get(teamCode) ?? 0) >= constraints.maxBackToBacks) return;
          added += 1;
          addedByTeam.set(teamCode, (addedByTeam.get(teamCode) ?? 0) + 1);
        }
      }
      for (let index = 0; index < roundGames.length; index += 1) {
        const date = early.has(index) ? dateA : dateB;
        for (const teamCode of [roundGames[index].homeTeamCode, roundGames[index].awayTeamCode]) {
          if (!candidateDateFeasibility.get(teamCode)?.get(date)) return;
        }
      }
      const currentTotal = [...b2bCounts.values()].reduce((sum, value) => sum + value, 0);
      const expectedTotal = constraints.targetBackToBacks * 30 * progress;
      const expectedPerTeam = constraints.targetBackToBacks * progress;
      const balancePenalty = [...b2bCounts.entries()].reduce((sum, [teamCode, value]) => {
        const projected = value + (addedByTeam.get(teamCode) ?? 0);
        return sum + (projected - expectedPerTeam) ** 2;
      }, 0);
      const totalPenalty = Math.abs(currentTotal + added - expectedTotal);
      const score = balancePenalty + totalPenalty + rng() * 0.001;
      if (score < bestScore) { bestScore = score; bestSelection = new Set(selected); }
    }
    function choose(start) {
      if (selected.length === earlyCount) { consider(); return; }
      const need = earlyCount - selected.length;
      for (let index = start; index <= roundGames.length - need; index += 1) {
        selected.push(index);
        choose(index + 1);
        selected.pop();
      }
    }
    choose(0);
    if (bestSelection) return bestSelection;
  }
  const blockedTeams = [...teamByCode.keys()].filter(teamCode =>
    !candidateDateFeasibility.get(teamCode)?.get(dateA) && !candidateDateFeasibility.get(teamCode)?.get(dateB));
  const eligibleA = [...teamByCode.keys()].filter(teamCode => candidateDateFeasibility.get(teamCode)?.get(dateA)).length;
  const eligibleB = [...teamByCode.keys()].filter(teamCode => candidateDateFeasibility.get(teamCode)?.get(dateB)).length;
  const b2bBlocked = [...new Set(costs.flat().filter(teamCode => (b2bCounts.get(teamCode) ?? 0) >= constraints.maxBackToBacks))];
  const detail = ` Eligible teams by date: ${dateA}=${eligibleA}, ${dateB}=${eligibleB}; teams blocked at the back-to-back cap: ${b2bBlocked.join(', ') || 'none'}${blockedTeams.length ? `; blocked on both dates: ${blockedTeams.join(', ')}` : ''}.`;
  throw new Error(`Could not split the fifteen-game round across ${dateA} and ${dateB} within the configured rest and slate constraints.${detail}`);
}

function dateScheduleRounds({ teams, rounds, flexSlots, calendar, seed, constraints, cupFlex, lockedGames = [] }) {
  const teamByCode = new Map(teams.map(team => [team.teamCode, team]));
  const safeFullSlateRounds = rounds.filter(round => roundHasUniqueHomeArenas(round, teamByCode));
  if (safeFullSlateRounds.length < 2) throw new Error(`Only ${safeFullSlateRounds.length} matchup rounds can support simultaneous 15-game home slates without a shared-arena conflict; at least two are required for the final full-league dates.`);
  const finalRounds = new Set(safeFullSlateRounds.slice(0, 2));
  const scheduledRounds = [...rounds.filter(round => !finalRounds.has(round)), ...safeFullSlateRounds.slice(0, 2)];
  const splitRoundCount = scheduledRounds.length - 2;
  const { datePairs, penultimateDate, offCalendarDates } = chooseSeasonRoundDates(calendar, splitRoundCount, cupFlex);
  const priorGameDate = new Map(teams.map(team => [team.teamCode, null]));
  const scheduledDatesByTeam = new Map(teams.map(team => [team.teamCode, new Set()]));
  const futureFixedDatesByTeam = new Map(teams.map(team => [team.teamCode, []]));
  for (const game of lockedGames) {
    futureFixedDatesByTeam.get(game.homeTeamCode).push(game.date);
    futureFixedDatesByTeam.get(game.awayTeamCode).push(game.date);
  }
  for (const slot of flexSlots) futureFixedDatesByTeam.get(slot.teamCode).push(slot.date);
  const b2bCounts = new Map(teams.map(team => [team.teamCode, 0]));
  const rng = seededRandom((Number(seed) ^ 0xD1B54A35) >>> 0);
  let cupInserted = false;
  const lockedGamesByDate = new Map();
  for (const game of lockedGames) {
    const rows = lockedGamesByDate.get(game.date) ?? [];
    rows.push(game);
    lockedGamesByDate.set(game.date, rows);
  }
  const insertedLockedDates = new Set();
  const insertLockedEventsBefore = targetDate => {
    for (const eventDate of [...lockedGamesByDate.keys()].sort()) {
      if (eventDate >= targetDate || insertedLockedDates.has(eventDate)) continue;
      for (const game of lockedGamesByDate.get(eventDate)) {
        for (const teamCode of [game.homeTeamCode, game.awayTeamCode]) {
          const priorDate = priorGameDate.get(teamCode);
          if (priorDate && dayDifference(eventDate, priorDate) === 1) b2bCounts.set(teamCode, b2bCounts.get(teamCode) + 1);
          priorGameDate.set(teamCode, eventDate);
          scheduledDatesByTeam.get(teamCode).add(eventDate);
        }
      }
      insertedLockedDates.add(eventDate);
    }
  };
  for (let roundIndex = 0; roundIndex < scheduledRounds.length; roundIndex += 1) {
    const [dateA, dateB] = datePairs[roundIndex];
    if (cupFlex && !cupInserted && dateA > calendar.cupFlexWindow.endDate) {
      insertLockedEventsBefore(calendar.cupFlexDates[0]);
      for (const team of teams) {
        for (const date of calendar.cupFlexDates) scheduledDatesByTeam.get(team.teamCode).add(date);
        priorGameDate.set(team.teamCode, calendar.cupFlexDates[1]);
      }
      cupInserted = true;
    }
    insertLockedEventsBefore(dateA);
    const roundGames = scheduledRounds[roundIndex];
    let early = new Set(roundGames.map((_, index) => index));
    if (roundIndex < splitRoundCount) {
      const progress = (roundIndex + 1) / rounds.length;
      early = selectEarlyRoundGames(roundGames, dateA, dateB, priorGameDate, b2bCounts,
        scheduledDatesByTeam, futureFixedDatesByTeam, constraints, progress, rng, teamByCode);
    }
    roundGames.forEach((game, index) => {
      const date = roundIndex < splitRoundCount ? (early.has(index) ? dateA : dateB) : dateA;
      game.date = date;
      game.scheduleRound = roundIndex + 1;
      game.slateSlot = roundIndex < splitRoundCount ? (early.has(index) ? 'early' : 'late') : (roundIndex === rounds.length - 1 ? 'season-finale' : 'penultimate-full-slate');
      for (const teamCode of [game.homeTeamCode, game.awayTeamCode]) {
        const priorDate = priorGameDate.get(teamCode);
        if (priorDate && dayDifference(date, priorDate) === 1) b2bCounts.set(teamCode, b2bCounts.get(teamCode) + 1);
        priorGameDate.set(teamCode, date);
        scheduledDatesByTeam.get(teamCode).add(date);
      }
    });
  }
  const dateCounts = new Map();
  for (const round of scheduledRounds) for (const game of round) dateCounts.set(game.date, (dateCounts.get(game.date) ?? 0) + 1);
  for (const game of lockedGames) dateCounts.set(game.date, (dateCounts.get(game.date) ?? 0) + 1);
  for (const slot of flexSlots) dateCounts.set(slot.date, (dateCounts.get(slot.date) ?? 0) + 0.5);
  const teamDiagnostics = teams.map(team => {
    const rows = [];
    for (const round of scheduledRounds) for (const game of round) {
      if (game.homeTeamCode === team.teamCode) rows.push({ date: game.date, role: 'home', location: 'home' });
      if (game.awayTeamCode === team.teamCode) rows.push({ date: game.date, role: 'away', location: 'away' });
    }
    for (const game of lockedGames) {
      if (game.homeTeamCode === team.teamCode) rows.push({ date: game.date, role: 'home', location: 'home' });
      if (game.awayTeamCode === team.teamCode) rows.push({ date: game.date, role: 'away', location: 'away' });
    }
    rows.push(...flexSlots.filter(slot => slot.teamCode === team.teamCode).map(slot => ({ date: slot.date, role: slot.role, location: slot.role })));
    return teamScheduleSummary(team.teamCode, rows);
  });
  for (const row of teamDiagnostics) {
    if (row.backToBacks > constraints.maxBackToBacks || row.maxGamesIn5Days > constraints.maxGamesIn5Days || row.maxGamesIn12Days > constraints.maxGamesIn12Days || row.maxGamesIn30Days > constraints.maxGamesIn30Days) {
      throw new Error(`Round-based schedule exceeds rest limits for ${row.teamCode}: ${JSON.stringify(row)}.`);
    }
  }
  return {
    diagnostics: teamDiagnostics,
    dailyGameCounts: Object.fromEntries([...dateCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => [date, Math.round(count)])),
    penultimateDate,
    offCalendarDates,
    arenaSafeFullSlateRoundCount: safeFullSlateRounds.length,
    arenaConflictsAvoidedBySplittingRounds: rounds.length - safeFullSlateRounds.length,
    backToBackCountByTeam: Object.fromEntries([...b2bCounts.entries()]),
  };
}

function defaultConstraints(overrides = {}) {
  const constraints = {
    maxBackToBacks: 16,
    targetBackToBacks: 14.2,
    maxGamesIn5Days: 3,
    maxGamesIn12Days: 7,
    maxGamesIn30Days: 17,
    maxGamesPerDate: 15,
    matchingFactorizationAttempts: 12,
    matchingSearchNodeLimit: 50000,
    ...clone(overrides),
  };
  for (const key of ['maxBackToBacks', 'maxGamesIn5Days', 'maxGamesIn12Days', 'maxGamesIn30Days', 'maxGamesPerDate', 'matchingFactorizationAttempts', 'matchingSearchNodeLimit']) {
    if (!Number.isInteger(constraints[key]) || constraints[key] < 1) throw new Error(`Schedule constraint ${key} must be a positive integer.`);
  }
  if (!Number.isFinite(constraints.targetBackToBacks) || constraints.targetBackToBacks < 0) throw new Error('targetBackToBacks must be a non-negative number.');
  if (constraints.maxGamesPerDate > 15) throw new Error('NBA 30-team schedule maxGamesPerDate cannot exceed 15.');
  return constraints;
}

function groupHomeRoles(teams, date) {
  const sorted = teams.map(team => team.teamCode).sort();
  const teamByCode = new Map(teams.map(team => [team.teamCode, team]));
  const teamsByArena = new Map();
  for (const team of teams) {
    const arenaTeams = teamsByArena.get(team.arenaId) ?? [];
    arenaTeams.push(team);
    teamsByArena.set(team.arenaId, arenaTeams);
  }
  const duplicateArenaGroups = [...teamsByArena.values()].filter(group => group.length > 2);
  if (duplicateArenaGroups.length) throw new Error('Cup flex home-role assignment cannot place more than two teams from the same home arena across two full-league dates.');
  const home = new Set();
  for (const arenaTeams of teamsByArena.values()) {
    if (arenaTeams.length === 2) home.add(arenaTeams.map(team => team.teamCode).sort()[0]);
  }
  const singleVenueTeams = sorted.filter(teamCode => teamsByArena.get(teamByCode.get(teamCode).arenaId).length === 1);
  for (const teamCode of singleVenueTeams) {
    if (home.size >= 15) break;
    home.add(teamCode);
  }
  if (home.size !== 15) throw new Error('Cup flex home-role assignment needs 15 distinct home arenas on each date.');
  return new Map(sorted.map(teamCode => [teamCode, (date === 0 ? home.has(teamCode) : !home.has(teamCode)) ? 'home' : 'away']));
}

export function generateNbaRegularSeasonSchedule({
  seasonStartYear,
  teams = NBA_TEAM_GROUPS_2026_27,
  seed = 1,
  calendar: suppliedCalendar = {},
  constraints: suppliedConstraints = {},
  cupFlex = true,
  cupGroupPlayDates,
  cupGroupPlayFixtures,
} = {}) {
  if (!Number.isInteger(seasonStartYear) || seasonStartYear < 2027) throw new Error('Automatic future NBA schedule generation is supported for seasons after 2026–27 (seasonStartYear >= 2027).');
  const normalizedTeams = normalizeTeams(teams);
  const calendar = normalizeCalendar(seasonStartYear, suppliedCalendar);
  const constraints = defaultConstraints(suppliedConstraints);
  const cupGroupPlay = normalizeCupGroupPlayFixtures(normalizedTeams, cupGroupPlayDates, cupGroupPlayFixtures, calendar, constraints.maxGamesPerDate);
  if (cupGroupPlay.fixtures.length && !cupFlex) throw new Error('Cup group-play fixtures require Cup flex slots to remain enabled.');
  const fullGames = buildBaseGames(normalizedTeams, seasonStartYear);
  let flexSlots = [];
  let games = fullGames;
  let cupFlexManifest = null;
  if (cupFlex) {
    const sorted = normalizedTeams.map(team => team.teamCode).sort();
    const removed = new Set();
    for (let index = 0; index < sorted.length; index += 1) {
      const homeTeamCode = sorted[index];
      const awayTeamCode = sorted[(index + 1) % sorted.length];
      const row = fullGames.find(game => !removed.has(game.gameId) && game.homeTeamCode === homeTeamCode && game.awayTeamCode === awayTeamCode);
      if (!row) throw new Error(`Could not reserve Cup flex slots for ${homeTeamCode} at ${awayTeamCode}.`);
      removed.add(row.gameId);
    }
    games = fullGames.filter(game => !removed.has(game.gameId));
    flexSlots = makeCupFlexSlots(normalizedTeams, calendar, seasonStartYear);
    cupFlexManifest = {
      format: FLEX_FORMAT,
      status: 'pending-group-play-matchups',
      window: clone(calendar.cupFlexWindow),
      gameDates: [...calendar.cupFlexDates],
      unresolvedSlots: flexSlots.length,
      expectedGamesAfterResolution: 30,
      homeAwaySlotsBalanced: true,
      resolutionRequirement: 'Supply 15 games on each configured flex date, with every team appearing once per date and each team using its assigned home/road role. Matchups are not inferred before Cup group-play results are supplied.',
      groupPlayStatus: cupGroupPlay.fixtures.length ? 'scenario-group-play-fixtures-placed-from-supplied-group-draw-scenario' : 'not-configured',
    };
  }
  const placedGroupGames = [];
  if (cupGroupPlay.fixtures.length) {
    const availableByDirection = new Map();
    for (const game of games) {
      const key = `${game.homeTeamCode}>${game.awayTeamCode}`;
      const rows = availableByDirection.get(key) ?? [];
      rows.push(game);
      availableByDirection.set(key, rows);
    }
    for (const rows of availableByDirection.values()) rows.sort((left, right) => left.gameId.localeCompare(right.gameId));
    const replacements = new Set();
    for (const fixture of cupGroupPlay.fixtures) {
      const direction = `${fixture.homeTeamCode}>${fixture.awayTeamCode}`;
      const replaced = availableByDirection.get(direction)?.find(game => !replacements.has(game.gameId));
      if (!replaced) throw new Error(`No fixed regular-season game remains with the group-play direction ${direction}.`);
      replacements.add(replaced.gameId);
      const homeTeam = normalizedTeams.find(team => team.teamCode === fixture.homeTeamCode);
      placedGroupGames.push({
        ...clone(fixture),
        gameId: replaced.gameId,
        cupFixtureId: fixture.gameId,
        replacedBaseGameId: replaced.gameId,
        seasonStartYear,
        stage: 'group-play-fixture-scenario',
        gameType: 'regular-season',
        event: 'nba-cup-group-play',
        matchupSeriesGames: replaced.matchupSeriesGames,
        arenaId: homeTeam.arenaId,
        outcomeStatus: 'not-played-fixture-only',
      });
    }
    games = games.filter(game => !replacements.has(game.gameId));
    if (placedGroupGames.length !== 60 || games.length !== 1140) throw new Error('Cup group-play replacement must preserve exactly 1,200 fixed-game entries.');
  }
  const factorization = buildRoundMatchings(normalizedTeams, games, seed, constraints);
  const placement = dateScheduleRounds({
    teams: normalizedTeams,
    rounds: factorization.rounds,
    flexSlots,
    calendar,
    seed,
    constraints,
    cupFlex,
    lockedGames: placedGroupGames,
  });
  const scheduledGames = [...games, ...placedGroupGames].sort((left, right) => left.date.localeCompare(right.date) || left.gameId.localeCompare(right.gameId));
  const schedule = {
    format: FORMAT,
    schemaVersion: '1.1.0',
    seasonStartYear,
    status: cupFlex ? 'provisional-cup-matchups-pending' : 'simulated-schedule-complete',
    scheduleType: cupFlex ? 'nba82-regular-season-with-two-cup-flex-games-v1' : 'nba82-regular-season-v1',
    seed: Number(seed) >>> 0,
    policy: {
      matchupMatrix: cupFlex
        ? 'classic-nba-82-v1 is the baseline allocation: the 80 fixed games preserve that matrix with 30 reserved one-game opponent meetings removed; Cup-dependent flex games are outcome-driven and season-rule-dependent, so resolved pair totals may differ from the classic 82-game matrix, including a fifth meeting.'
        : 'classic-nba-82-v1: four division games; six non-division conference opponents four times; four conference opponents three times; two games against each opposite-conference team.',
      opponentCountRules: {
        ruleId: 'classic-nba-82-v1',
        gamesPerTeam: 82,
        division: { opponentsPerTeam: 4, gamesPerOpponent: 4, gamesPerTeam: 16 },
        sameConferenceNonDivision: { opponentsPerTeam: 10, fourGameOpponentsPerTeam: 6, threeGameOpponentsPerTeam: 4, gamesPerTeam: 36 },
        oppositeConference: { opponentsPerTeam: 15, gamesPerOpponent: 2, gamesPerTeam: 30 },
        fourthGameRotation: {
          periodSeasons: 5,
          offset: mod(seasonStartYear - 2027, 5),
          assignmentMethod: 'sort the three division names within each conference; add divisionIndex times seasonOffset to each within-division team rank modulo five; the symmetric [0,1,4] rank-offset mask selects four-game non-division pairings',
          status: 'deterministic-future-scenario-rotation; exact future NBA opponent assignments are not official schedule evidence',
        },
        flexEffect: cupFlex
          ? 'The 80-game baseline uses this count matrix minus 30 reserved one-game meetings. Cup flex outcomes may change final pair counts and may create a fifth meeting; the future flex pairing policy remains a scenario assumption.'
          : 'No-Cup mode completes the classic 82-game count matrix.',
      },
      homeAway: '41 home and 41 away after Cup flex matchups resolve; pending schedule has 40 fixed home, 40 fixed away, plus one home and one away unresolved slot per team.',
      datePlacement: 'Seeded, full-league matching rounds distributed across two nightly slates, with shared-arena home games split across slates, two arena-safe full-league slates, an all-team finale, All-Star/Cup calendar blocks, and configurable rest-density limits.',
      arenaConstraint: 'One home game per arena per date; team arena identities are caller-supplied where available and otherwise use explicit unique placeholders.',
      officialSchedule: false,
    },
    calendar,
    constraints,
    teams: normalizedTeams,
    games: scheduledGames,
    cupFlex: cupFlexManifest ? {
      ...cupFlexManifest,
      slots: flexSlots,
      homeRolesByDate: Object.fromEntries(calendar.cupFlexDates.map((date, index) => [date, Object.fromEntries(groupHomeRoles(normalizedTeams, index))])),
      ...(placedGroupGames.length ? { groupPlayGameCount: placedGroupGames.length } : {}),
    } : { format: FLEX_FORMAT, status: 'disabled', slots: [], unresolvedSlots: 0 },
    diagnostics: {
      fixedGameCount: games.length,
      unresolvedTeamGameSlots: flexSlots.length,
      finalDayGameCount: games.filter(game => game.date === calendar.closingDate).length,
      dailyGameCounts: placement.dailyGameCounts,
      teamSchedules: placement.diagnostics,
      matchingFactorizationAttempt: factorization.attempt,
      arenaSafeFullSlateRoundCount: placement.arenaSafeFullSlateRoundCount,
      arenaConflictsAvoidedBySplittingRounds: placement.arenaConflictsAvoidedBySplittingRounds,
      sharedArenaRule: 'no-two-home-games-at-the-same-arena-on-the-same-date',
      arenaSafeFullSlateRoundCount: placement.arenaSafeFullSlateRoundCount,
      arenaConflictsAvoidedBySplittingRounds: placement.arenaConflictsAvoidedBySplittingRounds,
      sharedArenaRule: 'no-two-home-games-at-the-same-arena-on-the-same-date',
      penultimateFullSlateDate: placement.penultimateDate,
      simulatorOffDates: placement.offCalendarDates,
      backToBackCountByTeam: placement.backToBackCountByTeam,
      travelOptimization: normalizedTeams.every(team => team.latitude !== null && team.latitude !== undefined && team.longitude !== null && team.longitude !== undefined && Number.isFinite(Number(team.latitude)) && Number.isFinite(Number(team.longitude)))
        ? 'coordinates-supplied-but-distance-minimization-not-enabled-in-v1'
        : 'not-performed-team-venue-coordinates-not-available',
      note: 'This is a reproducible generated schedule, not an official NBA schedule. Default future calendar dates, opponent rotation, Cup matchups, broadcast priorities, arena holds, and travel optimization must be updated or supplied when authoritative season details become available.',
      cupGroupPlayDates: [...cupGroupPlay.dates],
      cupGroupPlayGameCount: placedGroupGames.length,
    },
    sourcePolicy: {
      currentReferenceSeason: '2026-27',
      sourceUrl: 'https://pr.nba.com/2026-27-nba-regular-season-schedule',
      ruleUsed: 'NBA 2026-27 release has 82 regular-season games per team: 80 dated games (including the four Cup Group Play games) plus two Cup-result-dependent regular-season games per team assigned in a later flex window. The generator models 30 pending flex games as 60 team slots and requires supplied Cup-derived pairings to resolve them.',
      futureRuleStatus: 'scenario-based-until-official-future-calendar-and-Cup-rules-are-supplied',
    },
  };
  const validation = validateNbaRegularSeasonSchedule(schedule);
  if (!validation.valid) throw new Error(`Generated NBA schedule failed validation: ${validation.errors.join(' ')}`);
  return schedule;
}

export function resolveNbaCupFlexGames(schedule, pairings, { resolutionSource = 'caller-supplied-cup-flex-matchups' } = {}) {
  if (schedule?.format !== FORMAT) throw new Error('Cannot resolve Cup games on an unsupported schedule format.');
  if (schedule.cupFlex?.status !== 'pending-group-play-matchups') throw new Error('This schedule has no pending Cup flex games.');
  if (typeof resolutionSource !== 'string' || !resolutionSource.trim()) throw new Error('Cup flex resolution requires a non-empty resolutionSource.');
  if (!Array.isArray(pairings) || pairings.length !== 30) throw new Error('Cup flex resolution requires 30 pairings: 15 games on each date.');
  const [firstDate, secondDate] = schedule.calendar.cupFlexDates;
  const slotsByDate = new Map(schedule.cupFlex.slots.map(slot => [`${slot.date}|${slot.teamCode}`, slot]));
  const gamesByDate = new Map([[firstDate, []], [secondDate, []]]);
  const seen = new Set();
  const resolved = pairings.map((pairing, index) => {
    const date = String(pairing.date ?? '');
    const homeTeamCode = String(pairing.homeTeamCode ?? '').toUpperCase();
    const awayTeamCode = String(pairing.awayTeamCode ?? '').toUpperCase();
    if (!gamesByDate.has(date)) throw new Error(`Cup pairing ${index + 1} uses a date outside the two flex game dates.`);
    if (!homeTeamCode || !awayTeamCode || homeTeamCode === awayTeamCode) throw new Error(`Cup pairing ${index + 1} requires different home and away teams.`);
    if (seen.has(`${date}|${homeTeamCode}`) || seen.has(`${date}|${awayTeamCode}`)) throw new Error(`A team appears more than once on Cup flex date ${date}.`);
    const homeSlot = slotsByDate.get(`${date}|${homeTeamCode}`);
    const awaySlot = slotsByDate.get(`${date}|${awayTeamCode}`);
    if (!homeSlot || !awaySlot || homeSlot.role !== 'home' || awaySlot.role !== 'away') throw new Error(`Cup pairing ${index + 1} conflicts with the preassigned home/road flex slots.`);
    seen.add(`${date}|${homeTeamCode}`);
    seen.add(`${date}|${awayTeamCode}`);
    const game = {
      gameId: String(pairing.gameId ?? `${schedule.seasonStartYear}-CUP-${String(index + 1).padStart(2, '0')}`),
      seasonStartYear: schedule.seasonStartYear,
      date,
      homeTeamCode,
      awayTeamCode,
      arenaId: schedule.teams.find(team => team.teamCode === homeTeamCode)?.arenaId ?? homeTeamCode,
      gameType: 'nba-cup-flex-regular-season-game',
      event: 'nba-cup-flex',
      resolutionSource,
      groupPlayEvidence: clone(pairing.groupPlayEvidence ?? null),
    };
    gamesByDate.get(date).push(game);
    return game;
  });
  for (const date of [firstDate, secondDate]) {
    if (gamesByDate.get(date).length !== 15) throw new Error(`Cup flex date ${date} must resolve to exactly 15 games.`);
    for (const team of schedule.teams) if (!seen.has(`${date}|${team.teamCode}`)) throw new Error(`Cup flex date ${date} does not contain ${team.teamCode}.`);
  }
  const orderedResolved = [...resolved].sort(compareScheduledGames);
  const next = clone(schedule);
  next.games = [...next.games, ...orderedResolved].sort(compareScheduledGames);
  next.cupFlex = { ...next.cupFlex, status: 'resolved-from-supplied-group-play-pairings', slots: [], unresolvedSlots: 0, resolvedGames: orderedResolved, resolutionSource };
  next.cupFlex.opponentDistributionStatus = 'season-specific-Cup-flex-games-may-change-classic-fixed-template-opponent-meeting-counts; flex-pairings-validated-only-for-season-total-role-date-and-uniqueness-constraints';
  next.policy.matchupMatrix = 'The 80-game fixed baseline preserves the classic template with 30 reserved opponent meetings removed; the 30 Cup-dependent games are supplied from the season-specific Cup result policy and may change final opponent counts, including a fifth meeting. This resolved scenario does not authenticate a future NBA distribution rule.';
  next.status = 'simulated-schedule-complete';
  const validation = validateNbaRegularSeasonSchedule(next);
  if (!validation.valid) throw new Error(`Resolved NBA schedule failed validation: ${validation.errors.join(' ')}`);
  return next;
}

export function validateNbaRegularSeasonSchedule(schedule) {
  const errors = [];
  if (schedule?.format !== FORMAT) errors.push('Unsupported NBA regular-season schedule format.');
  if (!Number.isInteger(schedule?.seasonStartYear) || schedule.seasonStartYear < 2027) errors.push('Schedule must target a season after 2026–27.');
  let teams;
  try { teams = normalizeTeams(schedule?.teams); } catch (error) { errors.push(error.message); teams = []; }
  const teamCodes = new Set(teams.map(team => team.teamCode));
  const teamByCode = new Map(teams.map(team => [team.teamCode, team]));
  const pending = schedule?.cupFlex?.status === 'pending-group-play-matchups';
  const resolved = ['resolved-from-supplied-group-play-pairings', 'resolved-from-seeded-future-scenario-pairings']
    .includes(schedule?.cupFlex?.status);
  const flexDisabled = schedule?.cupFlex?.status === 'disabled';
  if (!pending && !resolved && !flexDisabled) errors.push('Cup flex status must be pending, resolved, or disabled.');
  for (const date of Array.isArray(schedule?.calendar?.cupFlexDates) ? schedule.calendar.cupFlexDates : []) {
    try {
      parseIsoDate(date, 'calendar.cupFlexDates[]');
      if (date < schedule.calendar.openingDate || date > schedule.calendar.closingDate) {
        errors.push(`Cup flex date ${date} falls outside the regular-season calendar.`);
      }
      if (isBetween(date, schedule.calendar.allStarBreak)) {
        errors.push(`Cup flex date ${date} falls during the configured All-Star break.`);
      }
      if ((schedule.calendar.blackoutRanges ?? []).some(range => isBetween(date, range))) {
        errors.push(`Cup flex date ${date} falls in a configured blackout range.`);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
  const gameById = new Set();
  const allTeamDates = new Map(teams.map(team => [team.teamCode, new Set()]));
  const counts = new Map(teams.map(team => [team.teamCode, { games: 0, home: 0, away: 0, finalDay: 0 }]));
  const dateLoad = new Map();
  const homeArenaByDate = new Map();
  const cupGroupPlayDates = schedule?.calendar?.cupGroupPlayDates ?? [];
  const blackoutRanges = schedule?.calendar?.blackoutRanges ?? [];
  const cupGroupPlayGames = [];
  for (const game of schedule?.games ?? []) {
    const home = String(game.homeTeamCode ?? '').toUpperCase();
    const away = String(game.awayTeamCode ?? '').toUpperCase();
    const date = game.date;
    if (!game.gameId || gameById.has(game.gameId)) errors.push(`Game has a missing or duplicate gameId: ${game.gameId ?? '(missing)'}.`);
    gameById.add(game.gameId);
    if (!teamCodes.has(home) || !teamCodes.has(away) || home === away) { errors.push(`Game ${game.gameId} has invalid or duplicate team participants.`); continue; }
    try { parseIsoDate(date, `game ${game.gameId} date`); } catch (error) { errors.push(error.message); continue; }
    if (date < schedule.calendar.openingDate || date > schedule.calendar.closingDate) errors.push(`Game ${game.gameId} falls outside the regular-season calendar.`);
    if (date >= schedule.calendar.allStarBreak.startDate && date <= schedule.calendar.allStarBreak.endDate) errors.push(`Game ${game.gameId} falls during the configured All-Star break.`);
    if (blackoutRanges.some(range => isBetween(date, range)
      && !(game.event === 'nba-cup-group-play'
        && cupGroupPlayDates.includes(date)
        && range?.sourceStatus === 'scenario-cup-group-play-event-date-reservation'))) {
      errors.push(`Game ${game.gameId} falls in a configured blackout range.`);
    }
    if (schedule.cupFlex?.status !== 'disabled' && isBetween(date, schedule.calendar.cupFlexWindow) && game.event !== 'nba-cup-flex') errors.push(`Game ${game.gameId} falls inside the reserved Cup flex window.`);
    if (game.event === 'nba-cup-flex' && !schedule.calendar.cupFlexDates.includes(date)) errors.push(`Cup game ${game.gameId} falls outside a configured Cup flex date.`);
    if (game.event === 'nba-cup-group-play') {
      if (!cupGroupPlayDates.includes(date)) errors.push(`Cup group-play game ${game.gameId} falls outside a configured group-play date.`);
      if (game.stage !== 'group-play-fixture-scenario' || game.gameType !== 'regular-season'
        || !game.cupGroupId || !Number.isInteger(game.roundIndex) || game.roundIndex < 1 || game.roundIndex > 5) {
        errors.push(`Cup group-play game ${game.gameId} has an invalid scenario event contract.`);
      }
      cupGroupPlayGames.push(game);
    } else if (cupGroupPlayDates.includes(date)) {
      errors.push(`Game ${game.gameId} occupies a reserved Cup group-play date without the group-play event.`);
    }
    const arenaId = homeArenaId(game, teamByCode);
    const arenasOnDate = homeArenaByDate.get(date) ?? new Map();
    const priorHomeTeam = arenasOnDate.get(arenaId);
    if (priorHomeTeam && priorHomeTeam !== home) errors.push(`Shared arena ${arenaId} has simultaneous home games for ${priorHomeTeam} and ${home} on ${date}.`);
    arenasOnDate.set(arenaId, home);
    homeArenaByDate.set(date, arenasOnDate);
    for (const [teamCode, role] of [[home, 'home'], [away, 'away']]) {
      const dates = allTeamDates.get(teamCode);
      if (dates.has(date)) errors.push(`${teamCode} has more than one scheduled game on ${date}.`);
      dates.add(date);
      const row = counts.get(teamCode);
      row.games += 1;
      row[role] += 1;
      if (date === schedule.calendar.closingDate) row.finalDay += 1;
    }
    dateLoad.set(date, (dateLoad.get(date) ?? 0) + 1);
    if (dateLoad.get(date) > (schedule.constraints?.maxGamesPerDate ?? 15)) errors.push(`Schedule exceeds the daily game limit on ${date}.`);
  }
  if (teams.length === 30 && Number.isInteger(schedule?.seasonStartYear) && schedule.seasonStartYear >= 2027) {
    const expectedOpponentCounts = matchupMatrix(teams, schedule.seasonStartYear).counts;
    const expectedDirectedCounts = new Map();
    for (const game of buildBaseGames(teams, schedule.seasonStartYear)) {
      const key = `${game.homeTeamCode}>${game.awayTeamCode}`;
      expectedDirectedCounts.set(key, (expectedDirectedCounts.get(key) ?? 0) + 1);
    }
    const observedOpponentCounts = new Map();
    const observedDirectedCounts = new Map();
    for (const game of schedule?.games ?? []) {
      if (game.event === 'nba-cup-flex') continue;
      const home = String(game.homeTeamCode ?? '').toUpperCase();
      const away = String(game.awayTeamCode ?? '').toUpperCase();
      if (!teamCodes.has(home) || !teamCodes.has(away) || home === away) continue;
      const key = edgeKey(home, away);
      observedOpponentCounts.set(key, (observedOpponentCounts.get(key) ?? 0) + 1);
      const directedKey = `${home}>${away}`;
      observedDirectedCounts.set(directedKey, (observedDirectedCounts.get(directedKey) ?? 0) + 1);
    }
    const flexMatrix = pending || resolved;
    const missingMeetingsByTeam = new Map(teams.map(team => [team.teamCode, 0]));
    let missingMeetings = 0;
    for (const [key, expected] of expectedOpponentCounts) {
      const actual = observedOpponentCounts.get(key) ?? 0;
      const missing = expected - actual;
      const [teamA, teamB] = key.split('|');
      const missingAB = (expectedDirectedCounts.get(`${teamA}>${teamB}`) ?? 0)
        - (observedDirectedCounts.get(`${teamA}>${teamB}`) ?? 0);
      const missingBA = (expectedDirectedCounts.get(`${teamB}>${teamA}`) ?? 0)
        - (observedDirectedCounts.get(`${teamB}>${teamA}`) ?? 0);
      const invalidDirectedBalance = flexMatrix
        ? missingAB < 0 || missingBA < 0 || missingAB + missingBA > 1
        : missingAB !== 0 || missingBA !== 0;
      if (flexMatrix ? (missing < 0 || missing > 1) : actual !== expected) {
        errors.push(`Fixed schedule opponent matrix does not match the ${schedule.seasonStartYear} classic NBA 82-game template for ${key}.`);
      }
      if (invalidDirectedBalance) errors.push(`Fixed schedule home-away opponent matrix does not match the ${schedule.seasonStartYear} classic NBA 82-game template for ${key}.`);
      if (missing === 1) {
        missingMeetings += 1;
        missingMeetingsByTeam.set(teamA, missingMeetingsByTeam.get(teamA) + 1);
        missingMeetingsByTeam.set(teamB, missingMeetingsByTeam.get(teamB) + 1);
      }
    }
    if (flexMatrix && (missingMeetings !== 30 || [...missingMeetingsByTeam.values()].some(value => value !== 2))) {
      errors.push('Pending/resolved Cup fixed games must preserve the classic opponent matrix with exactly two flex meetings removed per team.');
    }
  }
  if (cupGroupPlayDates.length) {
    if (cupGroupPlayDates.length < 5 || new Set(cupGroupPlayDates).size !== cupGroupPlayDates.length
      || cupGroupPlayDates.some((date, index) => index > 0 && date <= cupGroupPlayDates[index - 1])) {
      errors.push('Configured cupGroupPlayDates must contain at least five unique dates in chronological order.');
    }
    if (cupGroupPlayGames.length !== 60) errors.push('Configured Cup group-play schedule must contain exactly 60 group-play games.');
    const gamesByDate = new Map(cupGroupPlayDates.map(date => [date, []]));
    const gamesByGroup = new Map();
    const groupPairs = new Map();
    const gamesByGroupRound = new Map();
    const teamGroupGames = new Map(teams.map(team => [team.teamCode, { games: 0, home: 0, away: 0, dates: new Set(), groupIds: new Set() }]));
    for (const game of cupGroupPlayGames) {
      if (!gamesByDate.has(game.date)) continue;
      gamesByDate.get(game.date).push(game);
      const groupId = game.cupGroupId;
      const groupRows = gamesByGroup.get(groupId) ?? [];
      groupRows.push(game);
      gamesByGroup.set(groupId, groupRows);
      const groupRoundKey = `${groupId}|${game.roundIndex}`;
      gamesByGroupRound.set(groupRoundKey, (gamesByGroupRound.get(groupRoundKey) ?? 0) + 1);
      const key = edgeKey(game.homeTeamCode, game.awayTeamCode);
      const pairSet = groupPairs.get(groupId) ?? new Set();
      if (pairSet.has(key)) errors.push(`${groupId} repeats group-play matchup ${key}.`);
      pairSet.add(key);
      groupPairs.set(groupId, pairSet);
      for (const [teamCode, role, opponent] of [[game.homeTeamCode, 'home', game.awayTeamCode], [game.awayTeamCode, 'away', game.homeTeamCode]]) {
        const teamRow = teamGroupGames.get(teamCode);
        if (!teamRow) continue;
        if (teamRow.dates.has(game.date)) errors.push(`${teamCode} has more than one Cup group-play game on ${game.date}.`);
        teamRow.dates.add(game.date);
        teamRow.games += 1;
        teamRow[role] += 1;
        teamRow.groupIds.add(groupId);
        if (teams.find(team => team.teamCode === teamCode)?.conference !== teams.find(team => team.teamCode === opponent)?.conference) {
          errors.push(`${game.gameId} is not an intra-conference group-play game.`);
        }
      }
    }
    for (const [date, rows] of gamesByDate) {
      if (rows.length < 1 || rows.length > (schedule.constraints?.maxGamesPerDate ?? 15)) {
        errors.push(`Cup group-play date ${date} must contain 1 to ${schedule.constraints?.maxGamesPerDate ?? 15} games.`);
      }
    }
    if (gamesByGroup.size !== 6 || [...gamesByGroup.values()].some(rows => rows.length !== 10)) errors.push('Cup group-play must contain six groups with ten games each.');
    if (gamesByGroupRound.size !== 30 || [...gamesByGroupRound.values()].some(count => count !== 2)) {
      errors.push('Cup group-play must contain two games in each of five rounds for all six groups.');
    }
    for (const [teamCode, row] of teamGroupGames) {
      if (row.games !== 4 || row.home !== 2 || row.away !== 2 || row.dates.size !== 4 || row.groupIds.size !== 1) {
        errors.push(`${teamCode} must have four Cup group-play games, one bye, and a 2-home/2-away split.`);
      }
    }
  } else if (cupGroupPlayGames.length) {
    errors.push('Cup group-play games require at least five configured cupGroupPlayDates.');
  }
  const flexSlots = schedule?.cupFlex?.slots ?? [];
  if (pending) {
    if (flexSlots.length !== 60) errors.push('Pending Cup flex schedule must include 60 team slots.');
    const slotCounts = new Map(teams.map(team => [team.teamCode, { games: 0, home: 0, away: 0, dates: new Set() }]));
    const slotsByDate = new Map(schedule.calendar.cupFlexDates.map(date => [date, { home: 0, away: 0 }]));
    const flexHomeArenaByDate = new Map(schedule.calendar.cupFlexDates.map(date => [date, new Map()]));
    for (const slot of flexSlots) {
      if (!teamCodes.has(slot.teamCode) || !['home', 'away'].includes(slot.role)) { errors.push(`Invalid Cup flex slot ${slot.slotId}.`); continue; }
      if (!schedule.calendar.cupFlexDates.includes(slot.date)) errors.push(`Cup slot ${slot.slotId} is outside the two configured flex dates.`);
      const teamSlot = slotCounts.get(slot.teamCode);
      if (teamSlot.dates.has(slot.date)) errors.push(`${slot.teamCode} has duplicate Cup slots on ${slot.date}.`);
      teamSlot.dates.add(slot.date);
      teamSlot.games += 1;
      teamSlot[slot.role] += 1;
      if (slot.role === 'home') {
        const arenaId = teamByCode.get(slot.teamCode).arenaId;
        const priorHomeTeam = flexHomeArenaByDate.get(slot.date)?.get(arenaId);
        if (priorHomeTeam && priorHomeTeam !== slot.teamCode) errors.push(`Shared arena ${arenaId} has simultaneous Cup home slots for ${priorHomeTeam} and ${slot.teamCode} on ${slot.date}.`);
        flexHomeArenaByDate.get(slot.date)?.set(arenaId, slot.teamCode);
      }
      if (slotsByDate.has(slot.date)) slotsByDate.get(slot.date)[slot.role] += 1;
    }
    for (const [date, roles] of slotsByDate) if (roles.home !== 15 || roles.away !== 15) errors.push(`Cup flex date ${date} must have 15 home and 15 away team slots.`);
    for (const team of teams) {
      const base = counts.get(team.teamCode);
      const slots = slotCounts.get(team.teamCode);
      if (base.games !== 80 || base.home !== 40 || base.away !== 40) errors.push(`${team.teamCode} must have 80 fixed games, 40 home, 40 away while Cup matchups are pending.`);
      if (slots.games !== 2 || slots.home !== 1 || slots.away !== 1) errors.push(`${team.teamCode} must have two Cup slots: one home and one away.`);
      if (base.finalDay !== 1) errors.push(`${team.teamCode} must play exactly once on the final regular-season date.`);
      for (const date of slots.dates) if (allTeamDates.get(team.teamCode).has(date)) errors.push(`${team.teamCode} has a fixed game and Cup flex slot on ${date}.`);
    }
  } else {
    if (flexSlots.length) errors.push('A resolved or disabled Cup schedule cannot retain pending team slots.');
    const expected = 82;
    for (const team of teams) {
      const row = counts.get(team.teamCode);
      if (row.games !== expected || row.home !== 41 || row.away !== 41) errors.push(`${team.teamCode} must have 82 games, 41 home, and 41 away.`);
      if (row.finalDay !== 1) errors.push(`${team.teamCode} must play exactly once on the final regular-season date.`);
    }
  }
  if (pending || resolved) {
    if (resolved) {
      const flexDates = schedule.calendar.cupFlexDates;
      for (const date of flexDates) {
        const dateGames = (schedule.games ?? []).filter(game => game.event === 'nba-cup-flex' && game.date === date);
        if (dateGames.length !== 15) errors.push(`Resolved Cup date ${date} must have 15 games.`);
      }
    }
  }
  const scheduleRows = new Map(teams.map(team => [team.teamCode, []]));
  for (const game of schedule?.games ?? []) {
    if (scheduleRows.has(game.homeTeamCode)) scheduleRows.get(game.homeTeamCode).push({ date: game.date, role: 'home', location: 'home' });
    if (scheduleRows.has(game.awayTeamCode)) scheduleRows.get(game.awayTeamCode).push({ date: game.date, role: 'away', location: 'away' });
  }
  if (pending) for (const slot of flexSlots) if (scheduleRows.has(slot.teamCode)) scheduleRows.get(slot.teamCode).push({ date: slot.date, role: slot.role, location: slot.role });
  for (const [teamCode, rows] of scheduleRows) {
    const rest = teamScheduleSummary(teamCode, rows);
    const constraints = schedule.constraints ?? {};
    if (rest.backToBacks > (constraints.maxBackToBacks ?? Number.POSITIVE_INFINITY)) errors.push(`${teamCode} exceeds its back-to-back limit.`);
    if (rest.maxGamesIn5Days > (constraints.maxGamesIn5Days ?? Number.POSITIVE_INFINITY)) errors.push(`${teamCode} exceeds its 5-day game limit.`);
    if (rest.maxGamesIn12Days > (constraints.maxGamesIn12Days ?? Number.POSITIVE_INFINITY)) errors.push(`${teamCode} exceeds its 12-day game limit.`);
    if (rest.maxGamesIn30Days > (constraints.maxGamesIn30Days ?? Number.POSITIVE_INFINITY)) errors.push(`${teamCode} exceeds its 30-day game limit.`);
  }
  return {
    valid: errors.length === 0,
    errors,
    teamCount: teams.length,
    gameCount: schedule?.games?.length ?? 0,
    pendingCupTeamSlots: pending ? flexSlots.length : 0,
    complete: !pending && errors.length === 0,
  };
}
