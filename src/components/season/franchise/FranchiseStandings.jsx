import React from 'react';
import { Trophy } from 'lucide-react';
import { FranchiseTeamMark } from './FranchiseTeamMark';

// League ladder with a win-rate bar per team; the controlled team stays lit.
export default function FranchiseStandings({ view, onFocusTeam }) {
  const rows = view.records || [];
  const userCode = view.team?.code || null;
  const leader = rows[0];
  return (
    <section className="court-panel frx-panel space-y-2.5 p-4" aria-labelledby="frx-standings-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/35 bg-gold/10 text-gold"><Trophy className="h-4.5 w-4.5" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">League ladder</p><h3 className="frx-title">Team records</h3></div>
        </div>
        {leader && <span className="frx-pill frx-pill--amber">Leader · {leader.code} {leader.wins}–{leader.losses}</span>}
      </div>
      {rows.length ? (
        <div className="frx-standings">
          {rows.map((row, index) => {
            const games = row.games || 1;
            const pct = Math.round((row.wins / games) * 100);
            return (
              <button key={row.code} type="button"
                className={`frx-standing-row w-full text-left ${row.code === userCode ? 'frx-standing-row--focus' : ''}`}
                onClick={onFocusTeam ? () => onFocusTeam(row.code) : undefined}>
                <span className="frx-standing-row__rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <FranchiseTeamMark code={row.code} />
                  <span className="truncate font-display text-sm tracking-wide">{row.code}</span>
                </span>
                <span className="frx-standing-row__record">{row.wins}–{row.losses}</span>
                <span className="frx-standing-bar" title={`${pct}% wins`}><span style={{ width: `${pct}%` }} /></span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="frx-note">No team records.</p>
      )}
    </section>
  );
}