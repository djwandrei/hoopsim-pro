import React from 'react';
import LineupSection from '@/components/lineupLab/native/LineupSection';
import LineupField from '@/components/lineupLab/native/LineupField';

export default function LineupDataControls() {
  return <LineupSection id="liveDataPanel" headingId="liveDataHeading" title="Team & season" number="01">
    <div className="ll-native-fields">
      <LineupField id="dataSourceInput" label="Stats available" value="all-games-package" options={[["all-games-package", "NBA stats (2017–26)"], ["imported", "Older stats (before 2017–18) — unavailable", true]]} />
      <LineupField id="nbaSeasonInput" label="Season" options={[]} />
      <LineupField id="nbaTeamInput" label="NBA team" options={[]} />
      <LineupField id="nbaSeasonPhaseInput" label="Phase" value="regular" options={[["regular", "Regular season"], ["playoffs", "Playoffs"]]} />
    </div>
    <small id="dataSourceSummary" hidden aria-hidden="true" />
    <div className="card-actions mt-4"><button id="loadLiveDataButton" type="button" className="button">Load team and season</button></div>
    <p id="liveDataStatus" role="status" aria-live="polite" className="helper">Ready. Load a team and season to see the roster and stats.</p>
  </LineupSection>;
}