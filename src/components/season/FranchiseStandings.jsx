import React from 'react';
import TeamMark from '@/components/studio/TeamMark';

const headCell = 'px-2.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] myna-muted';

// Franchise regular-season standings, straight from the native league state.
export default function FranchiseStandings({ state, focusTeamId, onFocusTeam }) {
  const rows = state?.standings || [];
  const conferenceOf = row => String(row.conference || '').toUpperCase();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {['EAST', 'WEST'].map(conference => {
        const conferenceRows = rows
          .filter(row => conferenceOf(row) === conference)
          .sort((a, b) => (b.winRate - a.winRate) || (b.pointDifferential - a.pointDifferential));
        return (
          <section key={conference} className="myna-panel overflow-hidden" aria-label={`${conference} franchise standings`}>
            <header className="px-4 pb-2 pt-4">
              <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Franchise league</p>
              <h3 className="myna-display mt-0.5 text-2xl">{conference === 'EAST' ? 'EASTERN' : 'WESTERN'} CONFERENCE</h3>
              <p className="myna-muted mt-0.5 text-[10px]">Season {state.currentSeason}–{String(state.currentSeason + 1).slice(-2)}</p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="myna-muted text-[10px] uppercase tracking-[0.14em]">
                    <th className={`${headCell} text-center`}>Seed</th>
                    <th className={`${headCell} text-left`}>Team</th>
                    <th className={`${headCell} text-right`}>W</th>
                    <th className={`${headCell} text-right`}>L</th>
                    <th className={`${headCell} text-right`}>PCT</th>
                    <th className={`${headCell} text-right`}>DIFF</th>
                  </tr>
                </thead>
                <tbody>
                  {conferenceRows.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-xs myna-muted">No regular-season results yet — simulate the season.</td></tr>
                  )}
                  {conferenceRows.map((row, index) => {
                    const isFocus = row.teamId === focusTeamId;
                    return (
                      <tr
                        key={row.teamId}
                        className="border-t border-[var(--myna-border)] transition-colors hover:bg-[var(--myna-raised)]"
                        style={isFocus ? { background: 'color-mix(in srgb, var(--myna-accent) 10%, transparent)' } : undefined}
                      >
                        <td className="myna-mono px-2.5 py-2.5 text-center text-[10px]">{index + 1}</td>
                        <td className="px-2 py-2.5">
                          <button type="button" onClick={() => onFocusTeam?.(row.teamId)} className="flex min-h-8 items-center gap-2 rounded-md px-1 transition-colors hover:bg-[var(--myna-raised)]">
                            <TeamMark code={row.teamId} name={row.displayName} className="h-7 w-7" bare />
                            <span className="myna-mono text-xs">{row.teamId}</span>
                            {row.control === 'user' && <span className="myna-accent rounded px-1.5 py-0.5 text-[8px] font-bold tracking-[0.14em]" style={{ background: 'var(--myna-accent)', color: 'var(--myna-on-accent)' }}>YOU</span>}
                          </button>
                        </td>
                        <td className="myna-mono px-2.5 py-2.5 text-right font-bold">{row.wins}</td>
                        <td className="myna-mono px-2.5 py-2.5 text-right myna-muted">{row.losses}</td>
                        <td className="myna-mono px-2.5 py-2.5 text-right font-semibold">{(row.winRate || 0).toFixed(3).slice(1)}</td>
                        <td className="myna-mono px-2.5 py-2.5 text-right font-semibold" style={{ color: (row.pointDifferential || 0) >= 0 ? 'var(--myna-accent)' : 'var(--myna-trim)' }}>
                          {(row.pointDifferential || 0) > 0 ? '+' : ''}{row.pointDifferential || 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}