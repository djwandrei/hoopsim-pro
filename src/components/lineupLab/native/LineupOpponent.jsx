import React from 'react';
import LineupField from '@/components/lineupLab/native/LineupField';

export default function LineupOpponent() {
  return <details id="opponentSwishIQ" className="opponent-swishiq"><summary>Historical opponent game plan</summary>
    <p className="helper">Use a same-season opponent profile to preview lineup priorities. Historical context—not a live injury report, matchup assignment, or game prediction.</p>
    <div className="ll-native-fields"><LineupField id="opponentTeamInput" label="Opponent" options={[]} /><button id="loadOpponentButton" type="button" className="button button--quiet">Build game plan</button></div>
    <p id="opponentSwishIQStatus" role="status" aria-live="polite" className="helper">Load an NBA team-season, then choose an opponent from the same season and phase.</p>
    <div id="opponentSwishIQSummary" hidden />
  </details>;
}