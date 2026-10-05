import React from 'react';
import { SourceField, SourceButton, BoundSelect, BoundButton } from '@/components/lineupLab/native/boundControls';

export default function LineupOpponent() {
  return <details id="opponentSwishIQ" className="opponent-swishiq"><summary>Historical opponent game plan</summary>
    <p className="helper">Load an opponent from the same season and phase to see how your priorities stack up against how they actually defended. Historical context only — no live injury reports or game predictions.</p>
    <SourceField id="opponentTeamInput" label="Opponent" options={[]} />
    <SourceButton id="loadOpponentButton" />
    <div className="ll-native-fields">
      <BoundSelect sourceId="opponentTeamInput" label="Opponent" />
      <BoundButton sourceId="loadOpponentButton" className="button button--quiet">Build game plan</BoundButton>
    </div>
    <p id="opponentSwishIQStatus" role="status" aria-live="polite" className="helper">Pick a team and season first — then you'll be able to choose an opponent from that same season and phase.</p>
    <div id="opponentSwishIQSummary" hidden />
  </details>;
}