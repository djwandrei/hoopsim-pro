import React from 'react';
import LineupSection from '@/components/lineupLab/native/LineupSection';
import { SourceField, SourceButton, BoundSelect, BoundSegmented, BoundButton } from '@/components/lineupLab/native/boundControls';

export default function LineupDataControls() {
  return <LineupSection id="liveDataPanel" headingId="liveDataHeading" title="Team & season" number="01">
    <SourceField id="dataSourceInput" label="Stats available" value="all-games-package" options={[["all-games-package", "NBA stats (2017–26)"], ["imported", "Older stats (before 2017–18) — unavailable", true]]} />
    <SourceField id="nbaSeasonInput" label="Season" options={[]} />
    <SourceField id="nbaTeamInput" label="NBA team" options={[]} />
    <SourceField id="nbaSeasonPhaseInput" label="Phase" value="regular" options={[["regular", "Regular season"], ["playoffs", "Playoffs"]]} />
    <small id="dataSourceSummary" hidden aria-hidden="true" />
    <div className="ll-data-picker">
      <BoundSelect sourceId="nbaSeasonInput" label="Season" />
      <BoundSelect sourceId="nbaTeamInput" label="NBA team" />
    </div>
    <BoundSegmented sourceId="nbaSeasonPhaseInput" label="Phase" columns={2} />
    <SourceButton id="loadLiveDataButton" />
    <div className="card-actions mt-4"><BoundButton sourceId="loadLiveDataButton" className="button button--full">Load team and season</BoundButton></div>
    <p id="liveDataStatus" role="status" aria-live="polite" className="helper">Ready. Load a team and season to see the roster and stats.</p>
  </LineupSection>;
}