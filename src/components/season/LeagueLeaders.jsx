import React, { useMemo } from 'react';
import { buildPlayerAverages } from '@/lib/season/playerAverages';

const CATEGORIES = [['pts', 'POINTS'], ['reb', 'REBOUNDS'], ['ast', 'ASSISTS']];
const goldHeader = { color: 'hsl(var(--court-accent))', background: 'hsl(var(--court-surface))' };
const topThree = { background: 'color-mix(in srgb, hsl(var(--court-accent)) 12%, transparent)' };

// League leaders board: per-game averages across every simulated game, top 3 highlighted in gold.
export default function LeagueLeaders({ simGames }) {
  const boards = useMemo(() => {
    const ranked = buildPlayerAverages(simGames);
    return Object.fromEntries(CATEGORIES.map(([stat]) => [stat, [...ranked].sort((a, b) => b[stat] - a[stat]).slice(0, 5)]));
  }, [simGames]);

  if (!(simGames || []).length) {
    return (
      <div className="myna-panel p-6 text-center">
        <p className="myna-muted text-xs">Run a season replay from the controls above to crown league leaders.</p>
      </div>
    );
  }

  return (
    <section className="myna-panel p-4" aria-label="League leaders">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="myna-display text-lg">League Leaders</h3>
        <p className="myna-muted text-[11px]">Per-game averages · top 3 highlighted</p>
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
                  <th>{stat.toUpperCase()}</th>
                </tr>
              </thead>
              <tbody>
                {boards[stat].map((player, index) => (
                  <tr key={player.name} style={index < 3 ? topThree : undefined}>
                    <td className="myna-mono text-xs font-bold" style={index < 3 ? { color: 'hsl(var(--court-accent))' } : undefined}>{index + 1}</td>
                    <td className="text-xs">
                      <span className="font-semibold">{player.name}</span>
                      <span className="myna-muted ml-1 text-[10px]">{player.team}</span>
                    </td>
                    <td className="myna-mono text-xs">{player[stat].toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}