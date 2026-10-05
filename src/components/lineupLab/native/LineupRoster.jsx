import React from 'react';
import { Search, Filter, Lock, Ban, GitCompare } from 'lucide-react';
import LineupSection from '@/components/lineupLab/native/LineupSection';
import LineupField from '@/components/lineupLab/native/LineupField';
import LineupPoolTable from '@/components/lineupLab/native/LineupPoolTable';

const columns = [['name', 'Player'], ['positions', 'Position'], ['minutes', 'MPG'], ['points', 'PTS'], ['rebounds', 'REB'], ['assists', 'AST'], ['steals', 'STL'], ['blocks', 'BLK'], ['turnovers', 'TOV'], [null, 'Lock'], [null, 'Exclude'], [null, 'Compare'], [null, 'Watch']];
export default function LineupRoster() {
  return <LineupSection id="nativeRoster" headingId="playersHeading" title="Build the player pool" number="03" className="ll-native-roster">
    <span id="playersStepNumber" className="sr-only">4</span>
    <div id="activeSelectionTray" hidden aria-label="Active player selections" />
    <section id="playerPoolDetails" className="player-pool-details" aria-label="Browse this roster">
      <div className="ll-pool-toolbar">
        <label className="search-field field ll-pool-search">
          <span>Search players</span>
          <span className="ll-pool-search-box">
            <Search size={15} aria-hidden="true" />
            <input id="playerSearchInput" type="search" placeholder="Search this roster by name" />
          </span>
        </label>
        <fieldset id="playerEligibilityFilters" className="detailed-only ll-pool-filters">
          <legend><Filter size={12} aria-hidden="true" /> Pool floor</legend>
          <div className="ll-native-fields">
            <LineupField id="minGamesInput" label="Min games with team" value="20" min="0" max="82" step="1" />
            <LineupField id="minMinutesInput" label="Min minutes per game" value="6" min="0" max="48" step="0.5" />
          </div>
        </fieldset>
      </div>
      <p id="sampleFilterHelp" className="helper">These eligibility filters shape the player pool.</p>
      <div className="ll-pool-legend">
        <span className="is-lock"><Lock size={12} aria-hidden="true" /> Lock guarantees a player is selected</span>
        <span className="is-ban"><Ban size={12} aria-hidden="true" /> Exclude removes a player from the search</span>
      </div>
      <div className="table-wrap player-table-wrap ll-source-table" aria-hidden="true"><table className="player-table"><thead><tr>{columns.map(([key, label]) => <th key={label} data-player-sort={key || undefined} scope="col">{key ? <button type="button" className="player-table-sort"><span>{label}</span></button> : label}</th>)}</tr></thead><tbody id="playerTableBody" /></table></div>
      <LineupPoolTable />
      <div className="ll-native-note ll-compare-inline">
        <h3><GitCompare size={14} aria-hidden="true" /> Compare players</h3>
        <p className="helper">Tick "Compare" on two to four players above to chart them head-to-head.</p>
        <span id="compareCount" hidden>0</span>
        <div id="compareContent" className="compare-content" />
      </div>
      <details id="usageScenarioControls" className="detailed-only" hidden><summary>Set usage scenarios (optional)</summary><p className="helper" id="usageScenarioHelp">Optional changes to a player's on-court possession share. Leave blank to keep observed usage.</p><div id="usageScenarioList" /></details>
      <p id="poolSummary" className="helper">Load a team and season to see the player pool.</p>
    </section>
  </LineupSection>;
}