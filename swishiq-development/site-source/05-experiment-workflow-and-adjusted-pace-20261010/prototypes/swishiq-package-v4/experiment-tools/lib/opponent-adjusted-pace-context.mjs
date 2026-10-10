// Diagnostic extension of the pinned Candidate21 box-score contexts.
// The original source model stays byte-stable for existing forecast receipts.
export function addOpponentAdjustedPaceContexts({ boxscoreContexts, playerGameRows, scoreGames }) {
  const rawPossessions = new Map();
  for (const row of playerGameRows) {
    if (row?.time?.phase !== 'regular' || row?.evidence?.status !== 'available') continue;
    const box = row.values?.box;
    const fields = ['fieldGoalAttempts', 'freeThrowAttempts', 'offensiveRebounds', 'turnovers'];
    if (!fields.every(field => Number.isFinite(box?.[field]) && box[field] >= 0)) {
      throw Error('Invalid player-game possession fields for adjusted pace');
    }
    const key = JSON.stringify([row.entities.gameRef, row.entities.teamCode]);
    const value = box.fieldGoalAttempts + 0.44 * box.freeThrowAttempts - box.offensiveRebounds + box.turnovers;
    rawPossessions.set(key, (rawPossessions.get(key) ?? 0) + value);
  }
  const games = [...scoreGames].sort((a, b) => a.gameDateLocal.localeCompare(b.gameDateLocal)
    || a.gameRef.localeCompare(b.gameRef));
  if (new Set(games.map(game => game.gameRef)).size !== games.length
    || boxscoreContexts.audit.contextCount !== games.length
    || !boxscoreContexts.audit.sameLocalDateOutcomesExcluded) {
    throw Error('Adjusted pace requires unique paired games and prior-date box-score contexts');
  }
  const contexts = new Map(), history = new Map();
  let leaguePaceSum = 0, leagueGames = 0, observedThrough = null;
  const profile = team => {
    const tail = history.get(team) ?? [];
    const league = leagueGames ? leaguePaceSum / leagueGames : 100;
    const value = (tail.reduce((sum, row) => sum + row, 0) + 8 * league) / (tail.length + 8);
    if (!Number.isFinite(value)) throw Error('Nonfinite adjusted pace profile');
    return value;
  };
  for (let first = 0; first < games.length;) {
    let end = first + 1;
    while (end < games.length && games[end].gameDateLocal === games[first].gameDateLocal) end++;
    const feedback = [];
    for (const game of games.slice(first, end)) {
      const base = boxscoreContexts.contexts.get(game.gameRef);
      if (!base || base.gameDateLocal !== game.gameDateLocal || base.observedThrough !== observedThrough
        || observedThrough !== null && observedThrough >= game.gameDateLocal) {
        throw Error('Adjusted pace context identity or cutoff mismatch: ' + game.gameRef);
      }
      const home = profile(game.homeTeamRef), away = profile(game.awayTeamRef);
      contexts.set(game.gameRef, { ...base,
        home: { ...base.home, opponentAdjustedPace20: home },
        away: { ...base.away, opponentAdjustedPace20: away } });
      const hPoss = rawPossessions.get(JSON.stringify([game.gameRef, game.homeTeamRef]));
      const aPoss = rawPossessions.get(JSON.stringify([game.gameRef, game.awayTeamRef]));
      if (!Number.isFinite(hPoss) || !Number.isFinite(aPoss) || hPoss <= 0 || aPoss <= 0) {
        throw Error('Missing or invalid paired possessions: ' + game.gameRef);
      }
      const pace = (hPoss + aPoss) / 2;
      feedback.push({ game, pace, homeAdjusted: 2 * pace - away, awayAdjusted: 2 * pace - home });
    }
    // All observations use the same prior-date snapshot, including repeated teams.
    for (const { game, pace, homeAdjusted, awayAdjusted } of feedback) {
      for (const [team, adjusted] of [[game.homeTeamRef, homeAdjusted], [game.awayTeamRef, awayAdjusted]]) {
        const tail = history.get(team) ?? [];
        tail.push(adjusted);
        if (tail.length > 20) tail.shift();
        history.set(team, tail);
      }
      leaguePaceSum += pace;
      leagueGames++;
    }
    observedThrough = games[first].gameDateLocal;
    first = end;
  }
  return { contexts, audit: { ...boxscoreContexts.audit,
    opponentAdjustedPace: 'observation = 2 * paired pace - opponent prior adjusted pace; last 20 observations shrink by eight games toward prior raw league pace',
    opponentAdjustedPaceFormat: 'swishiq-opponent-adjusted-pace-context-v1' } };
}
