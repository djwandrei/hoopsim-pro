import React, { useMemo } from 'react';
import FocusCard from '@/components/season/FocusCard';
import StandingsBoard from '@/components/season/StandingsBoard';
import ChartsPanel from '@/components/season/ChartsPanel';

const selectCls = 'rounded-md border border-input bg-raised px-3 py-2 text-sm text-foreground';

export default function DashboardTab({ summary, league, focus, onFocus, actualMap, repeats }) {
  const row = summary.find(item => item.code === focus);
  const team = league.byCode.get(focus);
  const actualWins = actualMap?.get?.(focus);
  const leagueAvg = useMemo(() => ({
    off: league.offAvg,
    def: league.defAvg,
    pace: summary.reduce((sum, r) => sum + r.pace, 0) / (summary.length || 1),
  }), [league, summary]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="court-kicker text-xs">DASHBOARD</span>
          <span className="text-xs text-muted-foreground">{league.label} · {repeats} replays · {summary.length} teams</span>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Focus team</span>
          <select className={selectCls} value={focus} onChange={event => onFocus(event.target.value)}>
            {league.teams.map(teamItem => <option key={teamItem.code} value={teamItem.code}>{teamItem.name}</option>)}
          </select>
        </label>
      </div>
      <FocusCard team={team} row={row} leagueAvg={leagueAvg} actualWins={actualWins} />
      <StandingsBoard summary={summary} league={league} focusCode={focus} onFocusChange={onFocus} actualMap={actualMap} />
      <ChartsPanel summary={summary} focusCode={focus} actualWins={actualWins} />
    </div>
  );
}