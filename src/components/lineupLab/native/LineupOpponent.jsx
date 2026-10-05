import React from 'react';
import { SourceField, SourceButton, BoundSelect, BoundButton } from '@/components/lineupLab/native/boundControls';

export default function LineupOpponent() {
  return <details id="opponentSwishIQ" className="opponent-swishiq"><summary>Historical opponent game plan</summary>
    <p className="helper">Optional. Load another team from the same season and phase to see how it actually defended, then check whether your priorities would feast on that scheme or struggle against it. Historical context only — no injuries or predictions for a specific game.</p>
    <SourceField id="opponentTeamInput" label="Opponent" options={[]} />
    <SourceButton id="loadOpponentButton" />
    <div className="ll-native-fields">
      <BoundSelect sourceId="opponentTeamInput" label="Opponent" />
      <BoundButton sourceId="loadOpponentButton" className="button button--quiet">Build game plan</BoundButton>
    </div>
    <p id="opponentSwishIQStatus" role="status" aria-live="polite" className="helper">Choose your own team and season first — the opponent list then fills with teams from that exact same season and phase, so the comparison stays fair.</p>
    <div id="opponentSwishIQSummary" hidden />
  </details>;
}