import React from 'react';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

const cell = 'px-2.5 py-3 text-right';

// Pinned roster from the season package: observed per-game rates, sorted by minutes.
export default function TeamRosterTable({ team, actualWins }) {
  const palette = paletteForTeam(team.code);
  const roster = [...(team.roster || [])].sort((a, b) => b.minutes / Math.max(1, b.games) - a.minutes / Math.max(1, a.games));
  const maxMpg = Math.max(1, ...roster.map(player => player.minutes / Math.max(1, player.games)));
  const topScorer = [...roster].sort((a, b) => b.pts - a.pts)[0];
  const headCell = 'px-2.5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] myna-muted';
  return (
    <section className="myna-panel overflow-hidden" aria-label={`${team.name} roster`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Depth chart</p>
          <h3 className="myna-display mt-0.5 text-2xl">{team.name.toUpperCase()} ROSTER</h3>
        </div>
        <span className="myna-muted text-[10px]">Observed per-game rates from the season package{Number.isFinite(actualWins) ? ` · actual record ${actualWins}–${82 - actualWins}` : ''}</span>
      </header>
      <div className="overflow-x-auto border-t border-[var(--myna-border)]">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className={`${headCell} text-left`}>Player</th>
              <th className={`${headCell} text-left`}>Pos</th>
              <th className={headCell}>GP</th>
              <th className={`${headCell} text-right`}>MPG</th>
              <th className={headCell}>PTS</th>
              <th className={headCell}>REB</th>
              <th className={headCell}>AST</th>
              <th className={headCell}>STL</th>
              <th className={headCell}>BLK</th>
            </tr>
          </thead>
          <tbody>
            {roster.map(player => {
              const mpg = player.minutes / Math.max(1, player.games);
              const isTopScorer = topScorer && player.playerRef === topScorer.playerRef;
              return (
                <tr key={player.playerRef} className="border-t border-[var(--myna-border)] transition-colors hover:bg-[var(--myna-raised)]" style={{ boxShadow: `inset 2px 0 0 ${palette.primary}` }}>
                  <td className="px-2.5 py-3 text-left font-semibold">{player.name}</td>
                  <td className="px-2.5 py-3 text-left">
                    {(player.positions || []).length
                      ? <span className="myna-mono rounded border border-[var(--myna-border)] px-1.5 py-0.5 text-[9px] font-bold tracking-[0.08em] myna-muted">{player.positions.join('/')}</span>
                      : <span className="myna-muted">—</span>}
                  </td>
                  <td className={`${cell} myna-mono myna-muted`}>{player.games}</td>
                  <td className={`${cell} myna-mono`}>
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <span className="inline-block h-1 w-10 overflow-hidden rounded-full bg-[var(--myna-raised)]"><span className="block h-full rounded-full" style={{ width: `${Math.round((mpg / maxMpg) * 100)}%`, background: palette.primary }} /></span>
                      {mpg.toFixed(1)}
                    </span>
                  </td>
                  <td className={`${cell} myna-mono font-bold`} style={isTopScorer ? { color: 'var(--myna-accent)' } : undefined}>{player.pts.toFixed(1)}</td>
                  <td className={`${cell} myna-mono`}>{player.reb.toFixed(1)}</td>
                  <td className={`${cell} myna-mono`}>{player.ast.toFixed(1)}</td>
                  <td className={`${cell} myna-mono myna-muted`}>{player.stl.toFixed(1)}</td>
                  <td className={`${cell} myna-mono myna-muted`}>{player.blk.toFixed(1)}</td>
                </tr>
              );
            })}
            {roster.length === 0 && <tr><td colSpan={9} className="px-2 py-3 text-center text-xs myna-muted">No roster data in this season package.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}