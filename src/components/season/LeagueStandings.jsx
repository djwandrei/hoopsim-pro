import React from 'react';
import TeamMark from '@/components/studio/TeamMark';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

function buildRows(league, summary, actualRecords, conference) {
  const rows = league.teams
    .filter(team => team.conference === conference)
    .map(team => {
      const row = summary ? summary.find(item => item.code === team.code) : null;
      const actual = actualRecords?.get?.(team.code) || null;
      const wins = row ? Math.round(row.wins) : actual?.w ?? 0;
      const losses = row ? 82 - wins : actual?.l ?? 0;
      const net = row ? row.ortg - row.drtg : team.net;
      return { team, row, actual, wins, losses, net };
    });
  rows.sort((a, b) => b.wins - a.wins || b.net - a.net);
  return rows;
}

export default function LeagueStandings({ league, summary, actualRecords, focusCode, onFocusChange, limit }) {
  const hasSim = Boolean(summary);
  const cell = 'px-2 py-2 text-right';
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {['EAST', 'WEST'].map(conference => {
        const rows = buildRows(league, summary, actualRecords, conference);
        const shown = limit ? rows.slice(0, limit) : rows;
        return (
          <section key={conference} className="myna-panel p-4" aria-label={`${conference} standings`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="myna-display text-2xl">{conference === 'EAST' ? 'EASTERN' : 'WESTERN'} CONFERENCE</h3>
              <span className="myna-muted text-[10px]">{hasSim ? `Median of ${summary?.repeats ?? ''} replays` : 'Observed record'} · 1–6 playoffs · 7–10 play-in</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="myna-muted text-[10px] uppercase tracking-[0.12em]">
                    <th className="px-2 py-1 text-right">#</th>
                    <th className="px-2 py-1 text-left">TEAM</th>
                    <th className="px-2 py-1 text-right">W</th>
                    <th className="px-2 py-1 text-right">L</th>
                    <th className="px-2 py-1 text-right">PCT</th>
                    <th className="px-2 py-1 text-right">NET</th>
                    {hasSim && <th className="px-2 py-1 text-right">PO%</th>}
                    {hasSim && <th className="px-2 py-1 text-right">TITLE%</th>}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((entry, index) => {
                    const teamColor = paletteForTeam(entry.team.code).primary;
                    const isFocus = entry.team.code === focusCode;
                    const netSigned = entry.net > 0 ? '+' : '';
                    return (
                      <tr key={entry.team.code} className={`border-t border-[var(--myna-border)] ${isFocus ? 'bg-[var(--myna-raised)]' : ''}`}>
                        <td className={`${cell} myna-mono myna-muted`}>{index + 1}</td>
                        <td className="px-2 py-2">
                          <button type="button" onClick={() => onFocusChange(entry.team.code)} title={entry.team.name} className="flex min-h-8 items-center gap-2 rounded-md px-1 transition-colors hover:bg-[var(--myna-raised)]">
                            <span className="inline-block h-6 w-1 rounded-full" style={{ background: teamColor }} />
                            <TeamMark code={entry.team.code} name={entry.team.name} className="h-7 w-7 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)]" />
                            <span className="myna-mono text-xs">{entry.team.code}</span>
                          </button>
                        </td>
                        <td className={`${cell} myna-mono`}>{entry.wins}</td>
                        <td className={`${cell} myna-mono myna-muted`}>{entry.losses}</td>
                        <td className={`${cell} myna-mono`}>{(entry.wins / Math.max(1, entry.wins + entry.losses)).toFixed(3).slice(1)}</td>
                        <td className={`${cell} myna-mono ${entry.net >= 0 ? 'text-[var(--myna-accent)]' : 'text-[var(--myna-trim)]'}`}>{netSigned}{entry.net.toFixed(1)}</td>
                        {hasSim && <td className={`${cell} myna-mono`}>{Math.round((entry.row?.playoff || 0) * 100)}%</td>}
                        {hasSim && <td className={`${cell} myna-mono`}>{Math.round((entry.row?.title || 0) * 100)}%</td>}
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