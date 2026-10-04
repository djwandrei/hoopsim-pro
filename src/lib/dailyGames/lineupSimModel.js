const statsFor = player => player?.publicStats || {
  points: player?.pts, rebounds: player?.reb, assists: player?.ast,
  steals: player?.stl, blocks: player?.blk,
};

export const hasLineupStats = player => ['points', 'rebounds', 'assists'].every(key =>
  Number.isFinite(statsFor(player)[key]) && statsFor(player)[key] >= 0);

// Board players carry publicStats; league rosters already carry per-game rates.
// Normalize both without mistaking season totals or absent stats for zero.
export function lineupTeam(league, players, code, name, overrides = {}) {
  if (players.length !== 5 || !players.every(hasLineupStats)) throw new Error('Five players with valid season stats are required.');
  const avg = key => league.teams.reduce((sum, team) => sum + team[key], 0) / league.teams.length;
  const roster = players.map(player => {
    const stats = statsFor(player);
    return {
      playerRef: player.playerRef, name: player.displayName || player.name,
      positions: Array.isArray(player.positions) ? player.positions : [], minutes: 48,
      pts: stats.points, reb: stats.rebounds, ast: stats.assists,
      stl: stats.steals ?? player.stl ?? 0, blk: stats.blocks ?? player.blk ?? 0,
    };
  });
  const pace = overrides.pace ?? avg('pace');
  const possessionValue = avg('off') / 112;
  const efficiencyBonus = roster.reduce((sum, player) => sum + 0.12 * player.reb + 0.18 * player.ast, 0) * possessionValue;
  const teamPpg = roster.reduce((sum, player) => sum + player.pts, 0) + efficiencyBonus;
  const off = Math.round(teamPpg * 100 / pace);
  const def = Math.round(overrides.def ?? avg('def'));
  return {
    code, name, conference: 'EAST', off, def, net: off - def, pace, ppg: teamPpg, papg: null,
    efg: overrides.efg ?? avg('efg'), ftr: overrides.ftr ?? avg('ftr'),
    orb: overrides.orb ?? avg('orb'), drb: overrides.drb ?? avg('drb'), tov: overrides.tov ?? avg('tov'),
    oppEfg: overrides.oppEfg ?? avg('oppEfg'), oppFtr: overrides.oppFtr ?? avg('oppFtr'),
    oppTov: overrides.oppTov ?? avg('oppTov'), roster,
  };
}