export const SCOPES = [['team','Team'],['top','Top 50'],['pinned','Pinned'],['career','Career span']];
export const ATLAS_TOP_METRICS = [['pts','PPG'],['ast','APG'],['reb','RPG'],['mpg','MPG'],['ts','TS%'],['stl','SPG'],['blk','BPG'],['tov','TOV']];

export function buildCareerRows(player) {
  const seasons = new Map();
  for (const row of player.rows) {
    const season = seasons.get(row.seasonStartYear) || { year:row.seasonStartYear,games:0,minutes:0,teams:new Set(),sums:{} };
    season.games += Number(row.games) || 0;
    if (Number.isFinite(row.minutes)) season.minutes += row.minutes;
    for (const field of ['points','rebounds','assists','steals','blocks','turnovers']) {
      const rate = row.careerMetrics?.[field];
      if (Number.isFinite(rate)) season.sums[field] = (season.sums[field] || 0) + rate * row.games;
    }
    season.teams.add(row.teamCode);
    seasons.set(row.seasonStartYear,season);
  }
  return [...seasons.values()].filter(season => season.games > 0).sort((a,b) => a.year - b.year).map(season => ({
    id:`${player.playerRef}:${season.year}`,
    playerRef:player.playerRef,
    name:player.name,
    teamCode:[...season.teams].sort().join('/'),
    positions:player.positions || [],
    headshotPath:player.headshotPath,
    seasonStartYear:season.year,
    observed:true,
    phase:'regular',
    seasonLabel:`${season.year}–${String(season.year + 1).slice(-2)}`,
    stats:{ gp:season.games,mpg:season.minutes / season.games,pts:(season.sums.points || 0) / season.games,ast:(season.sums.assists || 0) / season.games,reb:(season.sums.rebounds || 0) / season.games,stl:(season.sums.steals || 0) / season.games,blk:(season.sums.blocks || 0) / season.games,tov:(season.sums.turnovers || 0) / season.games },
    available:true,
    statsSource:'Observed pooled career archive',
  }));
}

export function applyScope(scope,{ roster,selected,careerPlayer }) {
  if (scope.mode === 'team') return scope.team ? roster.filter(row => row.teamCode === scope.team) : [];
  if (scope.mode === 'top') return roster.filter(row => Number.isFinite(row.stats[scope.metric])).sort((a,b) => b.stats[scope.metric] - a.stats[scope.metric]).slice(0,50);
  if (scope.mode === 'pinned') return selected;
  if (scope.mode === 'career') return careerPlayer ? buildCareerRows(careerPlayer) : [];
  return [];
}