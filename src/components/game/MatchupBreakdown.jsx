import React from 'react';
import MatchupPicker from '@/components/game/MatchupPicker';
import MatchupRadar from '@/components/game/MatchupRadar';
import MatchupTable from '@/components/game/MatchupTable';
import MatchupEdges from '@/components/game/MatchupEdges';
import MatchupMeetings from '@/components/game/MatchupMeetings';
import WinDistributionChart from '@/components/game/WinDistributionChart';
import PlayerStatsChart from '@/components/game/PlayerStatsChart';

// Shared matchup intelligence shown on both Game Lab tabs.
export default function MatchupBreakdown({ league, source, year, a, b, onA, onB, teamA, teamB }) {
  return (
    <div className="space-y-4">
      <MatchupPicker league={league} a={a} b={b} onA={onA} onB={onB} />
      <div className="grid gap-4 xl:grid-cols-2">
        <MatchupRadar teamA={teamA} teamB={teamB} league={league} />
        <MatchupEdges teamA={teamA} teamB={teamB} />
      </div>
      <MatchupTable teamA={teamA} teamB={teamB} />
      <div className="grid gap-4 xl:grid-cols-2">
        <WinDistributionChart source={source} league={league} teamA={teamA} teamB={teamB} />
        <PlayerStatsChart teamA={teamA} teamB={teamB} />
      </div>
      <MatchupMeetings source={source} teamA={teamA} teamB={teamB} year={year} />
    </div>
  );
}