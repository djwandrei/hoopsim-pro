export function careerPlayers(records) {
  const map = new Map();
  records.filter(row => row.observed === true && row.phase === 'regular' && row.games > 0).forEach(row => {
    const player = map.get(row.playerRef) || { playerRef:row.playerRef,name:row.displayName,teamCode:row.teamCode,positions:row.positions || [],headshotPath:row.headshotPath,games:0,minutes:0,points:0,rebounds:0,assists:0,steals:0,blocks:0,turnovers:0,rows:[] };
    player.rows.push(row);player.games += row.games;player.minutes += row.minutes;
    for (const field of ['points','rebounds','assists','steals','blocks','turnovers']) if (Number.isFinite(row.careerMetrics?.[field])) player[field] += row.careerMetrics[field]*row.games;
    if (!player.latestYear || row.seasonStartYear >= player.latestYear) { player.latestYear=row.seasonStartYear;player.teamCode=row.teamCode; }
    map.set(row.playerRef,player);
  });
  return [...map.values()].sort((a,b) => b.minutes-a.minutes);
}
export function careerSeasons(player) {
  const map = new Map();
  player.rows.forEach(row => {
    const season = map.get(row.seasonStartYear) || { year:row.seasonStartYear,games:0,minutes:0,ptsTotal:0,rebTotal:0,astTotal:0,teams:[],rows:[] };
    season.games += row.games;season.minutes += row.minutes;
    for (const [total,key] of [['ptsTotal','points'],['rebTotal','rebounds'],['astTotal','assists']]) if (Number.isFinite(row.careerMetrics?.[key])) season[total] += row.careerMetrics[key]*row.games;
    if (!season.teams.includes(row.teamCode)) season.teams.push(row.teamCode);
    season.rows.push(row);map.set(row.seasonStartYear,season);
  });
  return [...map.values()].sort((a,b) => a.year-b.year).map(row => ({ ...row,label:`${row.year}–${String(row.year+1).slice(-2)}`,pts:row.ptsTotal/row.games,reb:row.rebTotal/row.games,ast:row.astTotal/row.games }));
}