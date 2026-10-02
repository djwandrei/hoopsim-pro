import React from 'react';

const cell = 'px-2 py-1.5 text-right';

// Pinned roster from the season package: observed per-game rates, sorted by minutes.
export default function TeamRosterTable({ team, actualWins }) {
  const roster = [...(team.roster || [])].sort((a, b) => b.minutes / Math.max(1, b.games) - a.minutes / Math.max(1, a.games));
  return (
    <section className="myna-panel p-4" aria-label={`${team.name} roster`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="myna-display text-2xl">{team.name.toUpperCase()} ROSTER</h3>
        <span className="myna-muted text-[10px]">Observed per-game rates from the season package{Number.isFinite(actualWins) ? ` · actual record ${actualWins}–${82 - actualWins}` : ''}</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="myna-muted text-[10px] uppercase tracking-[0.12em]">
              <th className="px-2 py-1 text-left">PLAYER</th>
              <th className="px-2 py-1 text-left">POS</th>
              <th className="px-2 py-1 text-right">GP</th>
              <th className="px-2 py-1 text-right">MPG</th>
              <th className="px-2 py-1 text-right">PTS</th>
              <th className="px-2 py-1 text-right">REB</th>
              <th className="px-2 py-1 text-right">AST</th>
              <th className="px-2 py-1 text-right">STL</th>
              <th className="px-2 py-1 text-right">BLK</th>
            </tr>
          </thead>
          <tbody>
            {roster.map(player => (
              <tr key={player.playerRef} className="border-t border-[var(--myna-border)]">
                <td className="px-2 py-1.5 text-left font-medium">{player.name}</td>
                <td className="px-2 py-1.5 text-left myna-muted">{(player.positions || []).join('/') || '—'}</td>
                <td className={`${cell} myna-mono myna-muted`}>{player.games}</td>
                <td className={`${cell} myna-mono`}>{(player.minutes / Math.max(1, player.games)).toFixed(1)}</td>
                <td className={`${cell} myna-mono`}>{player.pts.toFixed(1)}</td>
                <td className={`${cell} myna-mono`}>{player.reb.toFixed(1)}</td>
                <td className={`${cell} myna-mono`}>{player.ast.toFixed(1)}</td>
                <td className={`${cell} myna-mono myna-muted`}>{player.stl.toFixed(1)}</td>
                <td className={`${cell} myna-mono myna-muted`}>{player.blk.toFixed(1)}</td>
              </tr>
            ))}
            {roster.length === 0 && <tr><td colSpan={9} className="px-2 py-3 text-xs myna-muted">No roster data in this season package.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}