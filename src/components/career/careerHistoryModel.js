export function careerPlayers(records) {
  const map = new Map();
  records.filter(row => row.observed === true && row.phase === 'regular' && row.games > 0).forEach(row => {
    const player = map.get(row.playerRef) || { playerRef:row.playerRef,name:row.displayName,teamCode:row.teamCode,positions:row.positions || [],headshotPath:row.headshotPath,games:0,minutes:0,points:0,rebounds:0,assists:0,steals:0,blocks:0,turnovers:0,metricGames:{},rows:[] };
    const games = Number(row.games);
    player.rows.push(row); player.games += games;
    const minutes = row.minutes;
    if (Number.isFinite(minutes)) player.minutes += minutes;
    for (const field of ['points','rebounds','assists','steals','blocks','turnovers']) {
      const value = row.careerMetrics?.[field];
      if (Number.isFinite(value)) { player[field] += value * games; player.metricGames[field] = (player.metricGames[field] || 0) + games; }
    }
    if (!player.latestYear || row.seasonStartYear >= player.latestYear) { player.latestYear=row.seasonStartYear;player.teamCode=row.teamCode; }
    map.set(row.playerRef,player);
  });
  return [...map.values()].map(player => {
    for (const field of ['points','rebounds','assists','steals','blocks','turnovers']) if (player.metricGames[field] !== player.games) player[field] = null;
    if (player.rows.some(row => !Number.isFinite(row.minutes))) player.minutes = null;
    return player;
  }).sort((a,b) => (b.minutes ?? -Infinity) - (a.minutes ?? -Infinity));
}
export function careerSeasons(player) {
  const map = new Map();
  player.rows.forEach(row => {
    const season = map.get(row.seasonStartYear) || { year:row.seasonStartYear,games:0,minutes:0,minutesComplete:true,ptsTotal:0,rebTotal:0,astTotal:0,teams:[],rows:[],metricGames:{} };
    const games = Number(row.games); season.games += games;
    const minutes = row.minutes;
    if (Number.isFinite(minutes)) season.minutes += minutes;
    else season.minutesComplete = false;
    for (const [total,key] of [['ptsTotal','points'],['rebTotal','rebounds'],['astTotal','assists']]) {
      const value = row.careerMetrics?.[key];
      if (Number.isFinite(value)) { season[total] += value * games; season.metricGames[key] = (season.metricGames[key] || 0) + games; }
      else season[`${total}Missing`]=true;
    }
    if (!season.teams.includes(row.teamCode)) season.teams.push(row.teamCode);
    season.rows.push(row);map.set(row.seasonStartYear,season);
  });
  return [...map.values()].sort((a,b) => a.year-b.year).map(row => ({ ...row, minutes: row.minutesComplete ? row.minutes : null, label:`${row.year}–${String(row.year+1).slice(-2)}`,pts:row.ptsTotalMissing || row.metricGames.points !== row.games ? null : row.ptsTotal/row.games,reb:row.rebTotalMissing || row.metricGames.rebounds !== row.games ? null : row.rebTotal/row.games,ast:row.astTotalMissing || row.metricGames.assists !== row.games ? null : row.astTotal/row.games }));
}
