import React, { useMemo, useState } from 'react';
import { buildPlayerAverages } from '@/lib/season/playerAverages';

const CATEGORIES = [['pts', 'POINTS'], ['reb', 'REBOUNDS'], ['ast', 'ASSISTS']];
const MODES = [['avg', 'Per Game'], ['totals', 'Season Totals']];
const goldHeader = { color: 'hsl(var(--court-accent))', background: 'hsl(var(--court-surface))' };

// Contiguous gold ring around a highlighted row's cells (tables use separated borders).
function rowRing(cellIndex, cellCount) {
  const g = 'hsl(var(--court-accent) / .55)';
  let shadow = `inset 0 1px 0 ${g}, inset 0 -1px 0 ${g}`;
  if (cellIndex === 0) shadow = `inset 1px 0 0 ${g}, ${shadow}`;
  if (cellIndex === cellCount - 1) shadow += `, inset -1px 0 0 ${g}`;
  return { boxShadow: shadow };
}

// League leaders board: toggleable per-game averages vs season totals, top 3 gold-ringed.
export default function LeagueLeaders({ simGames }) {
  const [mode, setMode] = useState('avg');
  const boards = useMemo(() => {
    const ranked = buildPlayerAverages(simGames);
    return Object.fromEntries(CATEGORIES.map(([stat]) => [stat, [...ranked].sort((a, b) => (mode === 'avg' ? b[stat] - a[stat] : b.totals[stat] - a.totals[stat])).slice(0, 5)]));
  }, [simGames, mode]);

  if (!(simGames || []).length) {
    return (
      <div className="myna-panel p-6 text-center">
        <p className="myna-muted text-xs">Run a season replay from the controls above to crown league leaders.</p>
      </div>
    );
  }

  return (
    <section className="myna-panel p-4" aria-label="League leaders">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="myna-display text-lg">League Leaders</h3>
        <div className="flex rounded-lg border border-[var(--myna-border)] bg-[var(--myna-raised)] p-0.5" role="group" aria-label="Leaderboard mode">
          {MODES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={`rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${mode === id ? '' : 'text-[var(--myna-muted)] hover:text-[var(--myna-text)]'}`}
              style={mode === id ? { background: 'hsl(var(--court-accent))', color: 'hsl(var(--court-canvas))' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="grid gap-3 md:grid-cols-3">
        {CATEGORIES.map(([stat, label]) => (
          <div key={stat} className="overflow-hidden rounded-xl border border-[var(--myna-border)]">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={goldHeader}>{label}</div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left">#</th>
                  <th className="text-left">Player</th>
                  <th>{stat.toUpperCase() + (mode === 'avg' ? ' PG' : ' TOT')}</th>
                </tr>
              </thead>
              <tbody>
                {boards[stat].map((player, index) => {
                  const value = mode === 'avg' ? player[stat].toFixed(1) : String(Math.round(player.totals[stat]));
                  const cells = [
                    <td key="rank" className="myna-mono text-xs font-bold" style={{ color: index < 3 ? 'hsl(var(--court-accent))' : undefined }}>{index + 1}</td>,
                    <td key="player" className="text-xs">
                      <span className="font-semibold">{player.name}</span>
                      <span className="myna-muted ml-1 text-[10px]">{player.team}</span>
                    </td>,
                    <td key="value" className="myna-mono text-xs">{value}</td>,
                  ];
                  return (
                    <tr key={player.name} style={index < 3 ? { background: 'color-mix(in srgb, hsl(var(--court-accent)) 10%, transparent)' } : undefined}>
                      {cells.map((cell, cellIndex) => (index < 3 ? <React.Fragment key={cell.key}>{React.cloneElement(cell, { style: { ...cell.props.style, ...rowRing(cellIndex, 3) } })}</React.Fragment> : cell))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}