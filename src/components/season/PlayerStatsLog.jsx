import React, { useMemo, useState } from 'react';

const STATS = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK']];
const gold = { color: 'var(--myna-accent)', background: 'color-mix(in srgb, var(--myna-accent) 14%, transparent)', fontWeight: 700 };

// Historical player stats log: every simulated game line for the focused team,
// with per-player averages and gold-highlighted career-high cells.
export default function PlayerStatsLog({ team, simGames }) {
  const log = useMemo(() => {
    const players = new Map();
    const games = [];
    for (const g of simGames || []) {
      const homeGame = g.home === team.code;
      if (!homeGame && g.away !== team.code) continue;
      const lines = (homeGame ? g.boxHome?.lines : g.boxAway?.lines) || [];
      const opponent = homeGame ? g.away : g.home;
      const gameNo = games.length + 1;
      for (const line of lines) {
        const rec = players.get(line.name) || { name: line.name, gp: 0, min: 0, totals: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 }, highs: {} };
        rec.gp += 1;
        rec.min += line.min || 0;
        for (const [stat] of STATS) {
          rec.totals[stat] += line[stat] || 0;
          rec.highs[stat] = Math.max(rec.highs[stat] || 0, line[stat] || 0);
        }
        players.set(line.name, rec);
        games.push({ gameNo, opponent, homeGame, ...line });
      }
    }
    const averages = [...players.values()]
      .map(rec => ({
        name: rec.name,
        gp: rec.gp,
        avgMin: rec.gp ? rec.min / rec.gp : 0,
        avgs: Object.fromEntries(STATS.map(([stat]) => [stat, rec.gp ? rec.totals[stat] / rec.gp : 0])),
        highs: rec.highs,
      }))
      .sort((a, b) => b.avgs.pts - a.avgs.pts);
    return { averages, games };
  }, [simGames, team.code]);

  const [selected, setSelected] = useState(null);
  const focusPlayer = log.averages.find(p => p.name === selected) || log.averages[0] || null;
  const rows = focusPlayer ? log.games.filter(row => row.name === focusPlayer.name) : [];

  if (!log.games.length) {
    return (
      <div className="myna-panel p-6 text-center">
        <p className="myna-muted text-xs">
          No player lines yet — run a season replay from the hub to start building the stats log.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-4" aria-label="Player stats log">
      <div className="myna-panel p-4">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="myna-display text-lg">{team.code} Player Averages</h3>
          <p className="myna-muted text-[11px]">Across {log.games.length} simulated games</p>
        </header>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th className="text-left">Player</th>
                <th>GP</th>
                <th>MPG</th>
                {STATS.map(([stat, label]) => <th key={stat}>{label + (stat === 'pts' ? 'G' : 'PG')}</th>)}
              </tr>
            </thead>
            <tbody>
              {log.averages.map(player => (
                <tr key={player.name} className="cursor-pointer transition-colors" onClick={() => setSelected(player.name)}>
                  <td className="text-xs font-semibold">{player.name}</td>
                  <td className="myna-mono text-xs">{player.gp}</td>
                  <td className="myna-mono text-xs">{player.avgMin.toFixed(1)}</td>
                  {STATS.map(([stat]) => (
                    <td key={stat} className="myna-mono text-xs">{player.avgs[stat].toFixed(1)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {focusPlayer && (
        <div className="myna-panel p-4">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="myna-display text-lg">Game Log — {focusPlayer.name}</h3>
            <label className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] myna-muted">Player</span>
              <select
                value={focusPlayer.name}
                onChange={event => setSelected(event.target.value)}
                className="min-h-9 rounded-lg bg-[var(--myna-raised)] px-2 text-xs text-[var(--myna-text)]"
                aria-label="Select player"
              >
                {log.averages.map(player => <option key={player.name} value={player.name}>{player.name}</option>)}
              </select>
            </label>
          </header>
          <p className="myna-muted mb-2 text-[11px]">Gold cells mark this player's career high in each stat.</p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th className="text-left">Game</th>
                  <th className="text-left">Opp</th>
                  <th>MIN</th>
                  {STATS.map(([stat, label]) => <th key={stat}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={`${row.gameNo}-${row.name}`}>
                    <td className="myna-mono text-xs">#{row.gameNo}</td>
                    <td className="text-xs">{row.homeGame ? 'vs' : '@'} {row.opponent}</td>
                    <td className="myna-mono text-xs">{row.min}</td>
                    {STATS.map(([stat]) => {
                      const isHigh = (row[stat] || 0) === focusPlayer.highs[stat] && (row[stat] || 0) > 0;
                      return <td key={stat} className="myna-mono text-xs" style={isHigh ? gold : undefined}>{row[stat]}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}