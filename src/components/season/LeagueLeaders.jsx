import React, { useMemo, useState } from 'react';
import { buildPlayerAverages } from '@/lib/season/playerAverages';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';

const CATEGORIES = [['pts', 'POINTS'], ['reb', 'REBOUNDS'], ['ast', 'ASSISTS']];
const MODES = [['avg', 'Per Game'], ['totals', 'Season Totals']];
const MEDALS = [
  { border: 'hsl(var(--court-accent))', bg: 'color-mix(in srgb, hsl(var(--court-accent)) 16%, transparent)' },
  { border: 'hsl(var(--court-focus))', bg: 'color-mix(in srgb, hsl(var(--court-focus)) 10%, transparent)' },
  { border: 'hsl(var(--court-trim))', bg: 'color-mix(in srgb, hsl(var(--court-trim)) 10%, transparent)' },
];

// League leaders board: toggleable per-game averages vs season totals, top 3 medal-ringed.
export default function LeagueLeaders({ simGames }) {
  const [mode, setMode] = useState('avg');
  const dark = ((useCourtTheme() || {}).mode) === 'dark';
  const boards = useMemo(() => {
    const ranked = buildPlayerAverages(simGames);
    return Object.fromEntries(CATEGORIES.map(([stat]) => [stat, [...ranked].sort((a, b) => (mode === 'avg' ? b[stat] - a[stat] : b.totals[stat] - a.totals[stat])).slice(0, 5)]));
  }, [simGames, mode]);

  if (!(simGames || []).length) {
    return (
      <div className="myna-panel p-6 text-center">
        <p className="myna-muted text-xs">Run a season replay from the replay console to crown league leaders.</p>
      </div>
    );
  }
  const maxValueOf = stat => boards[stat]?.[0] ? (mode === 'avg' ? boards[stat][0][stat] : boards[stat][0].totals[stat]) : 0;

  const header = { color: 'var(--myna-accent)', background: 'var(--myna-canvas)' };
  return (
    <section className="myna-panel overflow-hidden" aria-label="League leaders">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Statistical crowns</p>
          <h3 className="myna-display mt-0.5 text-2xl">LEAGUE LEADERS</h3>
        </div>
        <div className="flex rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)] p-0.5" role="group" aria-label="Leaderboard mode">
          {MODES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={`rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${mode === id ? '' : 'text-[var(--myna-muted)] hover:text-[var(--myna-text)]'}`}
              style={mode === id ? { background: 'var(--myna-accent)', color: 'var(--myna-on-accent)' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="grid gap-px border-t border-[var(--myna-border)] bg-[var(--myna-border)] md:grid-cols-3">
        {CATEGORIES.map(([stat, label]) => (
          <div key={stat} className="bg-[var(--myna-surface)]">
            <div className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em]" style={header}>{label}</div>
            <table className="w-full">
              <thead>
                <tr className="myna-muted text-[9px] uppercase tracking-[0.14em]">
                  <th className="px-3 py-1.5 text-left">Rank</th>
                  <th className="py-1.5 text-left">Player</th>
                  <th className="px-3 py-1.5 text-right">{stat.toUpperCase() + (mode === 'avg' ? ' PG' : ' TOT')}</th>
                </tr>
              </thead>
              <tbody>
                {boards[stat].map((player, index) => {
                  const value = mode === 'avg' ? player[stat].toFixed(1) : String(Math.round(player.totals[stat]));
                  const medal = index < 3 && !dark ? MEDALS[index] : null;
                  return (
                    <tr key={player.name} className="border-t border-[var(--myna-border)] transition-colors hover:bg-[var(--myna-raised)]" style={medal ? { background: medal.bg } : undefined}>
                      <td className="px-3 py-2">
                        <span
                          className="myna-mono inline-flex h-5.5 w-5.5 min-w-5 items-center justify-center rounded-full border text-[10px] font-bold"
                          style={medal ? { borderColor: medal.border, color: medal.border } : { borderColor: 'var(--myna-border)', color: 'var(--myna-muted)' }}
                        >
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs">
                        <span className="font-semibold">{player.name}</span>
                        <span className="myna-mono ml-1.5 rounded border border-[var(--myna-border)] px-1 text-[9px] myna-muted">{player.team}</span>
                      </td>
                      <td className="myna-mono py-2.5 pr-3 text-right text-sm font-bold" style={index === 0 ? { color: 'var(--myna-accent)' } : undefined}>
                        <span className="relative inline-flex min-w-16 items-center justify-end">
                          {maxValueOf(stat) > 0 && <span aria-hidden className="absolute inset-y-0.5 right-0 rounded" style={{ width: `${Math.max(10, Math.round((mode === 'avg' ? player[stat] : player.totals[stat]) / maxValueOf(stat) * 100))}%`, background: 'color-mix(in srgb, var(--myna-accent) 12%, transparent)' }} />}
                          <span className="relative">{value}</span>
                        </span>
                      </td>
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