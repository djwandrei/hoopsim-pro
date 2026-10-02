import React, { useMemo, useState } from 'react';
import PlayerTrendChart from '@/components/season/PlayerTrendChart';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

const STATS = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK']];

// Historical player stats log: every simulated game line for the focused team,
// with per-player averages and accent-chipped career-high cells.
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
          No player lines yet — run a season replay from the console to start building the stats log.
        </p>
      </div>
    );
  }

  const teamPalette = paletteForTeam(team.code);
  const headCell = 'px-2.5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] myna-muted';

  return (
    <section className="space-y-4" aria-label="Player stats log">
      <div className="myna-panel overflow-hidden">
        <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-3 pt-4">
          <div>
            <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Player log</p>
            <h3 className="myna-display mt-0.5 text-2xl">{team.code} PLAYER AVERAGES</h3>
          </div>
          <p className="myna-muted text-[11px]">Across {log.games.length} simulated games · select a row to open the game log</p>
        </header>
        <div className="overflow-x-auto border-t border-[var(--myna-border)]">
          <table className="w-full">
            <thead>
              <tr>
                <th className={`${headCell} text-left`}>Player</th>
                <th className={headCell}>GP</th>
                <th className={headCell}>MPG</th>
                {STATS.map(([stat, label]) => <th key={stat} className={headCell}>{label + (stat === 'pts' ? 'G' : 'PG')}</th>)}
              </tr>
            </thead>
            <tbody>
              {log.averages.map(player => {
                const isFocus = focusPlayer?.name === player.name;
                return (
                  <tr
                    key={player.name}
                    className="cursor-pointer border-t border-[var(--myna-border)] transition-colors hover:bg-[var(--myna-raised)]"
                    onClick={() => setSelected(player.name)}
                    style={isFocus ? { background: `color-mix(in srgb, ${teamPalette.primary} 14%, transparent)`, boxShadow: `inset 3px 0 0 ${teamPalette.primary}` } : undefined}
                  >
                    <td className="px-2.5 py-3 text-xs font-semibold">{player.name}</td>
                    <td className="myna-mono px-2 py-3 text-xs">{player.gp}</td>
                    <td className="myna-mono px-2 py-3 text-xs">{player.avgMin.toFixed(1)}</td>
                    {STATS.map(([stat], statIndex) => (
                      <td key={stat} className="myna-mono px-2 py-3 text-xs" style={statIndex === 0 ? { color: 'var(--myna-accent)', fontWeight: 700 } : undefined}>{player.avgs[stat].toFixed(1)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {focusPlayer && (
        <div className="myna-panel overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4">
            <div>
              <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Game-by-game</p>
              <h3 className="myna-display mt-0.5 text-2xl">GAME LOG — {focusPlayer.name.toUpperCase()}</h3>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-3 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] myna-muted">Player</span>
              <select
                value={focusPlayer.name}
                onChange={event => setSelected(event.target.value)}
                className="min-h-9 rounded-lg bg-[var(--myna-raised)] px-2 text-xs font-semibold text-[var(--myna-text)]"
                aria-label="Select player"
              >
                {log.averages.map(player => <option key={player.name} value={player.name}>{player.name}</option>)}
              </select>
            </label>
          </header>
          <div className="grid gap-4 border-t border-[var(--myna-border)] p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <p className="myna-muted mb-2 text-[11px]">Accent chips mark this player's career high in each stat.</p>
              <div className="max-h-[28rem] overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={`${headCell} text-left`}>Game</th>
                      <th className={`${headCell} text-left`}>Opp</th>
                      <th className={headCell}>MIN</th>
                      {STATS.map(([stat, label]) => <th key={stat} className={headCell}>{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={`${row.gameNo}-${row.name}`} className="border-t border-[var(--myna-border)] transition-colors hover:bg-[var(--myna-raised)]">
                        <td className="myna-mono px-2.5 py-3 text-xs">{row.gameNo}</td>
                        <td className="px-2 py-3 text-xs">
                          <span className="myna-mono myna-muted mr-1">{row.homeGame ? 'vs' : '@'}</span>
                          <span className="font-semibold">{row.opponent}</span>
                        </td>
                        <td className="myna-mono px-2 py-3 text-xs">{row.min}</td>
                        {STATS.map(([stat]) => {
                          const isHigh = (row[stat] || 0) === focusPlayer.highs[stat] && (row[stat] || 0) > 0;
                          return isHigh ? (
                            <td key={stat} className="px-2 py-3 text-center">
                              <span className="myna-mono inline-flex min-w-7 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-bold" style={{ background: 'color-mix(in srgb, var(--myna-accent) 20%, transparent)', color: 'var(--myna-accent)' }}>{row[stat]}</span>
                            </td>
                          ) : (
                            <td key={stat} className="myna-mono px-2 py-3 text-xs">{row[stat]}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <PlayerTrendChart rows={rows} />
          </div>
        </div>
      )}
    </section>
  );
}