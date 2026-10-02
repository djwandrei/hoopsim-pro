import React, { useState } from 'react';
import TeamMark from '@/components/studio/TeamMark';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';

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

// Seed zones: 1–6 playoffs, 7–10 play-in, everything else lottery.
const zoneOf = index => (index < 6 ? 'playoff' : index < 10 ? 'playin' : 'lottery');
const ZONE_STYLE = {
  playoff: { badgeBorder: 'var(--myna-accent)', tint: 'color-mix(in srgb, var(--myna-accent) 7%, transparent)', label: 'Playoff', dot: 'var(--myna-accent)' },
  playin: { badgeBorder: 'var(--myna-hi)', tint: 'color-mix(in srgb, var(--myna-hi) 6%, transparent)', label: 'Play-in', dot: 'var(--myna-hi)' },
  lottery: { badgeBorder: 'var(--myna-border)', tint: 'transparent', label: 'Lottery', dot: 'var(--myna-border)' },
};
const ZONE_FILTERS = [['all', 'All'], ['playoff', 'Playoffs'], ['playin', 'Play-in'], ['lottery', 'Lottery']];

export default function LeagueStandings({ league, summary, actualRecords, focusCode, onFocusChange, limit }) {
  const [zone, setZone] = useState('all');
  const dark = ((useCourtTheme() || {}).mode) === 'dark';
  const hasSim = Boolean(summary);
  const cell = 'px-2.5 py-3 text-right';
  const chip = active => `min-h-8 rounded-lg border px-2.5 text-[9px] font-bold uppercase tracking-[0.16em] transition-colors ${active ? 'myna-accent' : 'border-[var(--myna-border)] text-[var(--myna-muted)] hover:bg-[var(--myna-raised)]'}`;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {['EAST', 'WEST'].map(conference => {
        const rows = buildRows(league, summary, actualRecords, conference).map((entry, index) => ({ ...entry, zone: zoneOf(index) }));
        const shown = limit ? rows.slice(0, limit) : rows.filter(row => zone === 'all' || row.zone === zone);
        return (
          <section key={conference} className="myna-panel overflow-hidden" aria-label={`${conference} standings`}>
            <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-3 pt-4">
              <div>
                <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Conference standings</p>
                <h3 className="myna-display mt-0.5 text-2xl">{conference === 'EAST' ? 'EASTERN' : 'WESTERN'} CONFERENCE</h3>
              </div>
              <span className="myna-muted text-[10px]">{hasSim ? `Median of ${summary?.repeats ?? ''} replays` : 'Observed record'}</span>
            </header>
            <div className="flex flex-wrap items-center gap-3 border-y border-[var(--myna-border)] bg-[var(--myna-canvas)] px-4 py-1.5">
              {['playoff', 'playin'].map(zoneKey => (
                <span key={zoneKey} className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] myna-muted">
                  <span className="inline-block h-2 w-2 rounded-full border" style={{ borderColor: ZONE_STYLE[zoneKey].dot }} />
                  {ZONE_STYLE[zoneKey].label}
                </span>
              ))}
              {!limit && (
                <div className="ml-auto flex gap-1">
                  {ZONE_FILTERS.map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={zone === id} onClick={() => setZone(id)} className={chip(zone === id)}>{label}</button>
                  ))}
                </div>
              )}
              {limit && <span className="ml-auto text-[9px] font-bold uppercase tracking-[0.16em] myna-muted">{hasSim ? '1–6 playoffs · 7–10 play-in' : 'Tap a team to focus'}</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="myna-muted text-[10px] uppercase tracking-[0.14em]">
                    <th className="px-2 py-2.5 text-center">Seed</th>
                    <th className="px-2 py-2.5 text-left">Team</th>
                    <th className="px-2 py-2.5 text-right">W</th>
                    <th className="px-2 py-2.5 text-right">L</th>
                    <th className="px-2 py-2.5 text-right">PCT</th>
                    <th className="px-2 py-2.5 text-right">NET</th>
                    {hasSim && <th className="px-2 py-2.5 text-right">PO%</th>}
                    {hasSim && <th className="px-2 py-2.5 text-right">TITLE%</th>}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((entry, index) => {
                    const zoneKey = entry.zone;
                    const style = ZONE_STYLE[zoneKey];
                    const teamColor = paletteForTeam(entry.team.code).primary;
                    const isFocus = entry.team.code === focusCode;
                    const netSigned = entry.net > 0 ? '+' : '';
                    return (
                      <tr
                        key={entry.team.code}
                        className="border-t border-[var(--myna-border)] transition-colors hover:bg-[var(--myna-raised)]"
                        style={{ background: isFocus ? `color-mix(in srgb, ${teamColor} 14%, ${style.tint})` : style.tint }}
                      >
                        <td className={`${cell} text-center`} style={isFocus ? { boxShadow: `inset 3px 0 0 ${teamColor}` } : undefined} title={style.label}>
                          <span
                            className="myna-mono inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold"
                            style={{ borderColor: style.badgeBorder, color: zoneKey === 'lottery' ? 'var(--myna-muted)' : style.badgeBorder }}
                          >
                            {rows.indexOf(entry) + 1}
                          </span>
                        </td>
                        <td className="px-2 py-3">
                          <button type="button" onClick={() => onFocusChange(entry.team.code)} title={entry.team.name} className="flex min-h-8 items-center gap-2 rounded-md px-1 transition-colors hover:bg-[var(--myna-raised)]">
                            <span className="inline-block h-6 w-1 rounded-full" style={{ background: teamColor }} />
                            <TeamMark code={entry.team.code} name={entry.team.name} className="h-7 w-7" bare />
                            <span className="myna-mono text-xs">{entry.team.code}</span>
                            {isFocus && <span className="rounded px-1.5 py-0.5 text-[8px] font-bold tracking-[0.14em]" style={{ background: teamColor, color: 'var(--team-on-primary)' }}>YOU</span>}
                          </button>
                        </td>
                        <td className={`${cell} myna-mono font-bold`}>
                          <span className="inline-flex items-center justify-end gap-1.5">
                            {!dark && <span className="inline-block h-1 w-10 overflow-hidden rounded-full bg-[var(--myna-raised)]"><span className="block h-full rounded-full" style={{ width: `${Math.round(entry.wins / 82 * 100)}%`, background: teamColor }} /></span>}
                            {entry.wins}
                          </span>
                        </td>
                        <td className={`${cell} myna-mono myna-muted`}>{entry.losses}</td>
                        <td className={`${cell} myna-mono font-semibold`}>{(entry.wins / Math.max(1, entry.wins + entry.losses)).toFixed(3).slice(1)}</td>
                        <td className={`${cell} myna-mono font-semibold`} style={{ color: entry.net >= 0 ? 'var(--myna-accent)' : 'var(--myna-trim)' }}>{netSigned}{entry.net.toFixed(1)}</td>
                        {hasSim && <td className={`${cell} myna-mono`}>{Math.round((entry.row?.playoff || 0) * 100)}%</td>}
                        {hasSim && <td className={`${cell} myna-mono`}>{Math.round((entry.row?.title || 0) * 100)}%</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {limit && rows.length > limit && (
              <p className="myna-muted border-t border-[var(--myna-border)] px-4 py-2.5 text-[10px]">Showing top {limit} — the full table lives on the Standings tab.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}