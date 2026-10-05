import React from 'react';
import { SourceField, SourceButton, BoundSelect, BoundButton } from '@/components/lineupLab/native/boundControls';

export default function LineupOpponent() {
  return <details id="opponentSwishIQ" className="opponent-swishiq"><summary>Historical opponent game plan</summary>
    <p className="helper">Use a same-season opponent profile to preview lineup priorities. Historical context—not a live injury report, matchup assignment, or game prediction.</p>
    <SourceField id="opponentTeamInput" label="Opponent" options={[]} />
    <SourceButton id="loadOpponentButton" />
    <div className="ll-native-fields">
      <BoundSelect sourceId="opponentTeamInput" label="Opponent" />
      <BoundButton sourceId="loadOpponentButton" className="button button--quiet">Build game plan</BoundButton>
    </div>
    <p id="opponentSwishIQStatus" role="status" aria-live="polite" className="helper">Load an NBA team-season, then choose an opponent from the same season and phase.</p>
    <div id="opponentSwishIQSummary" hidden />
  </details>;
}