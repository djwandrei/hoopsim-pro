import React from 'react';
import { SourceButton, BoundButton } from '@/components/lineupLab/native/boundControls';
import LineupRunBriefing from '@/components/lineupLab/native/LineupRunBriefing';

export default function LineupRunControls() {
  return <aside className="ll-native-run run-card" aria-label="Review and build">
    <span id="runStepNumber" className="sr-only">5</span><p className="court-kicker">Review & build</p><h2>Pre-flight briefing</h2>
    <p className="helper">Everything below is exactly what the solver will follow when you press build. If a rule looks wrong, jump back to its stage, adjust it, and return here.</p>
    <dl className="ll-native-facts">{[['Build', 'runModeSummary', 'Starting five'], ['Strategy', 'runPresetSummary', 'Balanced'], ['Must include', 'runLockedSummary', '0'], ['Excluded', 'runExcludedSummary', '0']].map(([label, id, value]) => <div key={id}><dt>{label}</dt><dd id={id}>{value}</dd></div>)}<div id="runMinuteModelRow" hidden><dt>Minute approach</dt><dd id="runMinuteModelSummary">Game-plan optimization</dd></div></dl>
    <LineupRunBriefing />
    <div id="searchScope" className="ll-native-note"><small>Groups to evaluate</small><strong id="searchScopeValue">Load a team and season to see eligible groups.</strong></div>
    <p id="solverStatus" role="status" aria-live="polite" className="helper ll-run-status">Ready to build</p><p id="optimizationProgress" hidden />
    <div className="ll-run-actions">
      <SourceButton id="optimizeButton" type="submit" />
      <SourceButton id="cancelOptimizeButton" hidden />
      <BoundButton sourceId="optimizeButton" className="button button--full ll-run-launch">Build the lineup</BoundButton>
      <BoundButton sourceId="cancelOptimizeButton" className="button button--quiet">Cancel search</BoundButton>
    </div>
    <button id="resetScenarioButton" type="button" className="text-button">Reset scenario</button>
    <div className="mobile-solve-bar"><span id="mobileSolveLabel">Starting five</span><button id="mobileCancelOptimizeButton" type="button" className="button button--quiet" hidden>Cancel</button><button id="mobileOptimizeButton" type="submit" className="button">Build lineup</button></div>
  </aside>;
}