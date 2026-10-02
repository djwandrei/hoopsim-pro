import React, { useMemo } from 'react';
import FocusCard from '@/components/season/FocusCard';
import TeamRosterTable from '@/components/season/TeamRosterTable';

// MyNBA team page: projected profile (when a replay has run) plus the pinned roster.
export default function LeagueTeamView({ team, simRow, league, actualWins }) {
  const leagueAvg = useMemo(() => ({
    off: league.offAvg,
    def: league.defAvg,
    pace: league.teams.reduce((sum, item) => sum + item.pace, 0) / (league.teams.length || 1),
  }), [league]);
  if (!team) return null;
  return (
    <div className="space-y-4" aria-label={`${team.name} team page`}>
      {simRow
        ? <FocusCard team={team} row={simRow} leagueAvg={leagueAvg} actualWins={actualWins} />
        : <section className="myna-panel p-4 text-xs myna-muted">Run the season replay to project this team's record, ratings and odds — the roster below is always live.</section>}
      <TeamRosterTable team={team} actualWins={actualWins} />
    </div>
  );
}