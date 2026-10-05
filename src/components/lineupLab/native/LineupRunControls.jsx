import React from 'react';
import { SourceButton, BoundButton } from '@/components/lineupLab/native/boundControls';

export default function LineupRunControls() {
  return <aside className="ll-native-card ll-native-run run-card" aria-label="Review and build">
    <span id="runStepNumber" className="sr-only">5</span><p className="court-kicker">Review & build</p><h2>Find the best eligible group.</h2>
    <p className="helper">Press build and every group that passes your rules gets checked, then ranked from best down.</p>
    <dl className="ll-native-facts">{[['Build', 'runModeSummary', 'Starting five'], ['Strategy', 'runPresetSummary', 'Balanced'], ['Must include', 'runLockedSummary', '0'], ['Excluded', 'runExcludedSummary', '0']].map(([label, id, value]) => <div key={id}><dt>{label}</dt><dd id={id}>{value}</dd></div>)}<div id="runMinuteModelRow" hidden><dt>Minute approach</dt><dd id="runMinuteModelSummary">Game-plan optimization</dd></div></dl>
    <div id="searchScope" className="ll-native-note"><small>Groups to evaluate</small><strong id="searchScopeValue">Load a team and season to see eligible groups.</strong></div>
    <p id="solverStatus" role="status" aria-live="polite" className="helper">Ready to build</p><p id="optimizationProgress" hidden />
    <SourceButton id="optimizeButton" type="submit" />
    <SourceButton id="cancelOptimizeButton" hidden />
    <BoundButton sourceId="optimizeButton" className="button button--full">Build the lineup</BoundButton>
    <BoundButton sourceId="cancelOptimizeButton" className="button button--quiet">Cancel search</BoundButton>
    <button id="resetScenarioButton" type="button" className="text-button">Reset scenario</button>
    <div className="mobile-solve-bar"><span id="mobileSolveLabel">Starting five</span><button id="mobileCancelOptimizeButton" type="button" className="button button--quiet" hidden>Cancel</button><button id="mobileOptimizeButton" type="submit" className="button">Build lineup</button></div>
  </aside>;
}