// Shared player aggregation: per-game averages across every simulated league game.
export function buildPlayerAverages(simGames) {
  const players = new Map();
  for (const g of simGames || []) {
    for (const side of ['boxHome', 'boxAway']) {
      const code = side === 'boxHome' ? g.home : g.away;
      for (const line of g[side]?.lines || []) {
        const rec = players.get(line.name) || { name: line.name, team: code, gp: 0, totals: { pts: 0, reb: 0, ast: 0 } };
        rec.gp += 1;
        rec.totals.pts += line.pts || 0;
        rec.totals.reb += line.reb || 0;
        rec.totals.ast += line.ast || 0;
        players.set(line.name, rec);
      }
    }
  }
  return [...players.values()].map(rec => ({
    name: rec.name,
    team: rec.team,
    gp: rec.gp,
    pts: rec.gp ? rec.totals.pts / rec.gp : 0,
    reb: rec.gp ? rec.totals.reb / rec.gp : 0,
    ast: rec.gp ? rec.totals.ast / rec.gp : 0,
    totals: { pts: rec.totals.pts, reb: rec.totals.reb, ast: rec.totals.ast },
  }));
}