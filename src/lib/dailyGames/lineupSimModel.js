const statsFor = player => player?.publicStats || {
  points: player?.pts, rebounds: player?.reb, assists: player?.ast,
  steals: player?.stl, blocks: player?.blk,
};

export const hasLineupStats = player => {
  const stats = statsFor(player);
  return ['points', 'rebounds', 'assists'].every(key => Number.isFinite(stats[key]) && stats[key] >= 0);
};

// Defense: a fixed five plays inside its own team's system, so a lineup whose
// majority comes from one team carries that team's observed defensive rating;
// mixed squads (the draft board) fall back to the league-average defense.
function squadDefense(league, players) {
  const counts = new Map();
  for (const player of players) {
    if (player.teamCode) counts.set(player.teamCode, (counts.get(player.teamCode) || 0) + 1);
  }
  let topCode = null;
  let topCount = 0;
  for (const [code, count] of counts) {
    if (count > topCount) { topCode = code; topCount = count; }
  }
  const def = topCount >= 3 ? league.byCode?.get(topCode)?.def : null;
  return Number.isFinite(def) ? def : null;
}

// League-average ratings shared by every lineup build: computed once per
// league object and memoized, instead of re-averaging 30 teams per call.
const leagueAvgCache = new WeakMap();
function leagueAverages(league) {
  let avg = leagueAvgCache.get(league);
  if (!avg) {
    avg = {};
    for (const key of ['pace', 'off', 'def', 'efg', 'ftr', 'orb', 'drb', 'tov', 'oppEfg', 'oppFtr', 'oppTov']) {
      avg[key] = league.teams.reduce((sum, team) => sum + (Number.isFinite(team[key]) ? team[key] : 0), 0) / league.teams.length;
    }
    leagueAvgCache.set(league, avg);
  }
  return avg;
}

// Board players carry publicStats; league rosters already carry per-game rates.
// Normalize both without mistaking season totals or absent stats for zero.
export function lineupTeam(league, players, code, name, overrides = {}) {
  if (players.length !== 5 || !players.every(hasLineupStats)) throw new Error('Five players with valid season stats are required.');
  const avg = leagueAverages(league);
  const roster = players.map(player => {
    const stats = statsFor(player);
    return {
      playerRef: player.playerRef, name: player.displayName || player.name,
      positions: Array.isArray(player.positions) ? player.positions : [], minutes: 48,
      pts: stats.points, reb: stats.rebounds, ast: stats.assists,
      stl: stats.steals ?? player.stl ?? 0, blk: stats.blocks ?? player.blk ?? 0,
    };
  });
  const pace = overrides.pace ?? avg.pace;
  const possessionValue = avg.off / 112;
  const efficiencyBonus = roster.reduce((sum, player) => sum + 0.12 * player.reb + 0.18 * player.ast, 0) * possessionValue;
  const teamPpg = roster.reduce((sum, player) => sum + player.pts, 0) + efficiencyBonus;
  const off = Math.round(teamPpg * 100 / pace);
  const def = Math.round(overrides.def ?? squadDefense(league, players) ?? avg.def);
  return {
    code, name, conference: 'EAST', off, def, net: off - def, pace, ppg: teamPpg, papg: null,
    efg: overrides.efg ?? avg.efg, ftr: overrides.ftr ?? avg.ftr,
    orb: overrides.orb ?? avg.orb, drb: overrides.drb ?? avg.drb, tov: overrides.tov ?? avg.tov,
    oppEfg: overrides.oppEfg ?? avg.oppEfg, oppFtr: overrides.oppFtr ?? avg.oppFtr,
    oppTov: overrides.oppTov ?? avg.oppTov, roster,
  };
}