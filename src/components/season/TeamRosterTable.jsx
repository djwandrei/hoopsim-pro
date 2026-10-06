import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

const cell = 'px-2.5 py-3 text-right';

// Pinned roster from the season package: observed per-game rates, sortable by any stat.
export default function TeamRosterTable({ team, actualWins }) {
  const palette = paletteForTeam(team.code);
  const [sort, setSort] = useState({ key: 'mpg', dir: 'desc' });
  const valueOf = (player, key) => (key === 'mpg' ? player.minutes / Math.max(1, player.games) : player[key]);
  const roster = [...(team.roster || [])].sort((a, b) => {
    if (sort.key === 'name') return a.name.localeCompare(b.name) * (sort.dir === 'asc' ? 1 : -1);
    return (valueOf(b, sort.key) - valueOf(a, sort.key)) * (sort.dir === 'asc' ? 1 : -1);
  });
  const maxMpg = Math.max(1, ...roster.map(player => player.minutes / Math.max(1, player.games)));
  const changeSort = key => setSort(current => ({ key, dir: current.key === key ? (current.dir === 'desc' ? 'asc' : 'desc') : 'desc' }));
  const headCell = 'px-2.5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] myna-muted';
  const sortIcon = key => sort.key === key ? (sort.dir === 'desc' ? <ArrowDown className="h-3 w-3 text-[var(--myna-accent)]" /> : <ArrowUp className="h-3 w-3 text-[var(--myna-accent)]" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />;
  const headButton = (key, label) => (
    <button type="button" onClick={() => changeSort(key)} className="inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-[var(--myna-accent)]">{label}{sortIcon(key)}</button>
  );
  const sortTh = (key, label, title, className = headCell) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'} className={className} title={title}>{headButton(key, label)}</th>
  );
  return (
    <section className="myna-panel overflow-hidden" aria-label={`${team.name} roster`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Depth chart</p>
          <h3 className="myna-display mt-0.5 text-2xl">{team.name.toUpperCase()} ROSTER</h3>
        </div>
        <span className="myna-muted text-[10px]">Observed per-game rates from the season package{Number.isFinite(actualWins) ? ` · actual record ${actualWins}–${82 - actualWins}` : ''} · click a column to sort</span>
      </header>
      <div className="overflow-x-auto border-t border-[var(--myna-border)]">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {sortTh('name', 'Player', 'Player name', `${headCell} text-left`)}
              <th className={`${headCell} text-left`}>Pos</th>
              {sortTh('games', 'GP', 'Games played')}
              {sortTh('mpg', 'MPG', 'Minutes per game', `${headCell} text-right`)}
              {sortTh('pts', 'PTS', 'Points per game')}
              {sortTh('reb', 'REB', 'Rebounds per game')}
              {sortTh('ast', 'AST', 'Assists per game')}
              {sortTh('stl', 'STL', 'Steals per game')}
              {sortTh('blk', 'BLK', 'Blocks per game')}
            </tr>
          </thead>
          <tbody>
            {roster.map(player => {
              const mpg = player.minutes / Math.max(1, player.games);
              const isTopScorer = sort.key === 'pts' && sort.dir === 'desc' && roster[0] && player.playerRef === roster[0].playerRef;
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