import React from 'react';
import { CalendarCheck2, ChevronRight, FastForward } from 'lucide-react';
import { FranchiseTeamMark } from './FranchiseTeamMark';
import FranchiseSeasonCloseout from './FranchiseSeasonCloseout';
import { goldButton, pillClass } from './franchiseUi';

// Game desk: progress rail, the next-game matchup card with both records and
// a YOU badge on the controlled team, advance controls, and the read-only
// season-completion verification.
export default function FranchiseSchedule({ sim }) {
  const { scheduleProgress, nextGame, scheduleComplete, busy, records, team } = sim.view;
  const total = scheduleProgress?.total ?? 0;
  const cursor = scheduleProgress?.cursor ?? 0;
  const pct = total ? Math.min(100, Math.round((cursor / total) * 100)) : 0;
  const recordOf = code => {
    const row = (records || []).find(item => item.code === code);
    return row ? `${row.wins}–${row.losses}` : null;
  };
  const renderSide = (code, role) => (
    <div className="frx-matchup__side">
      <FranchiseTeamMark code={code} />
      <strong>{code}</strong>
      <small>{role}</small>
      {recordOf(code) && <span className="frx-matchup__rec">{recordOf(code)}</span>}
      {team?.code === code && <span className="frx-matchup__you">You</span>}
    </div>
  );
  return (
    <section className="court-panel frx-panel space-y-4 p-4" aria-labelledby="frx-schedule-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="bcast-kicker" id="frx-schedule-title">Game desk · season schedule</p>
        <span className="frx-pill frx-pill--slate">{cursor} / {total} games complete</span>
      </div>
      <div className={`frx-progress ${scheduleComplete ? 'frx-progress--done' : ''}`} role="progressbar" aria-label="Season schedule progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={cursor}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {scheduleComplete ? (
        <div className="rounded-xl border border-positive/40 bg-positive/8 p-4 text-center">
          <CalendarCheck2 className="mx-auto h-6 w-6 text-positive" aria-hidden="true" />
          <p className="mt-2 font-display text-lg tracking-wide text-positive">Regular-season schedule complete</p>
          <p className="frx-note mt-1">Verify the completed-game ledger below, then close the regular season when the runtime marks that action ready.</p>
        </div>
      ) : nextGame ? (
        <div>
          <div className="frx-matchup">
            {renderSide(nextGame.away, 'Away')}
            <span className="frx-matchup__vs">AT</span>
            {renderSide(nextGame.home, 'Home')}
          </div>
          <div className="frx-matchup__meta">
            <span>{nextGame.date}</span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span className="truncate">{nextGame.gameId}</span>
            <span className={pillClass(nextGame.available ? 'green' : 'error')}>{nextGame.available ? 'Prepared input ready' : 'Prepared input missing'}</span>
          </div>
        </div>
      ) : (
        <p className="frx-note">The next scheduled matchup appears here after initialization.</p>
      )}
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className={goldButton} disabled={!sim.view.canAdvanceGame} onClick={sim.advanceGame} title="Simulate the next scheduled game">
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> Advance next game
        </button>
        <button type="button" className={goldButton} disabled={!sim.view.canAdvanceUserGame} onClick={sim.advanceUserGame} title="Simulate through your team's next game as one atomic checkpoint">
          <FastForward className="h-3.5 w-3.5" aria-hidden="true" /> To my next game
        </button>
      </div>
      <div className="bcast-divider" aria-hidden="true" />
      <FranchiseSeasonCloseout sim={sim} view={sim.view} onVerifyCompletion={sim.verifyCompletion} onCloseout={sim.closeout} onFinalizeAwards={sim.finalizeAwards} busy={busy} />
    </section>
  );
}
