import React from 'react';
import LineupSection from '@/components/lineupLab/native/LineupSection';
import LineupField from '@/components/lineupLab/native/LineupField';

const columns = [['name', 'Player'], ['positions', 'Position'], ['minutes', 'MPG'], ['points', 'PTS'], ['rebounds', 'REB'], ['assists', 'AST'], ['steals', 'STL'], ['blocks', 'BLK'], ['turnovers', 'TOV'], [null, 'Lock'], [null, 'Exclude'], [null, 'Compare'], [null, 'Watch']];
export default function LineupRoster() {
  return <LineupSection id="nativeRoster" headingId="playersHeading" title="Build the player pool" number="03" className="ll-native-roster">
    <span id="playersStepNumber" className="sr-only">4</span>
    <div id="activeSelectionTray" hidden aria-label="Active player selections" />
    <section id="playerPoolDetails" className="player-pool-details" aria-label="Browse this roster">
      <div className="ll-native-roster__tools"><fieldset id="playerEligibilityFilters" className="detailed-only"><legend>Player-pool floor</legend><div className="ll-native-fields"><LineupField id="minGamesInput" label="Games with selected team — minimum" value="20" min="0" max="82" step="1" /><LineupField id="minMinutesInput" label="Minutes per appearance — minimum" value="6" min="0" max="48" step="0.5" /></div><p id="sampleFilterHelp" className="helper">These eligibility filters shape the player pool.</p></fieldset><label className="search-field field"><span>Search players</span><input id="playerSearchInput" type="search" placeholder="Search this roster" /></label></div>
      <p className="helper">Lock guarantees a player is selected. Exclude removes a player from the search.</p>
      <div className="table-wrap player-table-wrap" tabIndex="0" aria-label="Player pool controls"><table className="player-table"><thead><tr>{columns.map(([key, label]) => <th key={label} data-player-sort={key || undefined} scope="col">{key ? <button type="button" className="player-table-sort"><span>{label}</span></button> : label}</th>)}</tr></thead><tbody id="playerTableBody" /></table></div>
      <details id="usageScenarioControls" className="detailed-only" hidden><summary>Set usage scenarios (optional)</summary><p className="helper" id="usageScenarioHelp">Optional changes to a player's on-court possession share. Leave blank to keep observed usage.</p><div id="usageScenarioList" /></details>
      <p id="poolSummary" className="helper">Load a team and season to see the player pool.</p>
    </section>
  </LineupSection>;
}