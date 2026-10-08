// SwishIQ Studio — shared modeling helpers for the lab tools (client-side Monte Carlo).
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function observedPlayers(source) {
  const byRef = new Map();
  for (const row of source.playerSeasons || []) {
    if (!row.playerRef || !row.games || !row.minutes) continue;
    const prev = byRef.get(row.playerRef);
    if (prev) {
      prev.games += row.games; prev.minutes += row.minutes;
      prev.points += row.points; prev.rebounds += row.rebounds; prev.assists += row.assists;
      prev.turnovers += row.turnovers; prev.steals += row.steals; prev.blocks += row.blocks;
    } else {
      byRef.set(row.playerRef, {
        playerRef: row.playerRef, name: row.name, teamCode: row.teamCode, positions: row.positions || [], headshotPath:row.headshotPath || null,
        games: row.games, minutes: row.minutes, points: row.points, rebounds: row.rebounds,
        assists: row.assists, turnovers: row.turnovers, steals: row.steals, blocks: row.blocks,
      });
    }
  }
  return [...byRef.values()].filter(p => p.minutes > 0).sort((a, b) => b.minutes - a.minutes);
}

export function perGameStats(p) {
  const g = Math.max(1, p.games);
  return {
    mpg: p.minutes / g,
    pts: p.points / g, reb: p.rebounds / g, ast: p.assists / g,
    stl: p.steals / g, blk: p.blocks / g, tov: p.turnovers / g,
  };
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lo = Math.floor(idx); const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function lineupTeam(baseTeam, lineup, chemistry) {
  const delta = clamp((chemistry - 55) / 45, -1, 1);
  const chosenRefs = new Set(lineup.map(p => p.playerRef));
  const bench = baseTeam.roster.filter(p => !chosenRefs.has(p.playerRef)).slice(0, 3);
  return {
    ...baseTeam,
    name: `${baseTeam.name} selected five`,
    off: baseTeam.off + delta * 3,
    def: baseTeam.def - delta * 2.4,
    roster: [...lineup, ...bench].map(p => ({ ...p })),
  };
}