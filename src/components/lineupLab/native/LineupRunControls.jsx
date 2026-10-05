import React from 'react';
import { SourceButton, BoundButton } from '@/components/lineupLab/native/boundControls';
import LineupRunBriefing from '@/components/lineupLab/native/LineupRunBriefing';

export default function LineupRunControls() {
  return <aside className="ll-native-run run-card" aria-label="Review and build">
    <span id="runStepNumber" className="sr-only">5</span>
    <header className="ll-run-head">
      <p className="court-kicker">Review & build</p>
      <h2>Pre-flight briefing</h2>
      <p className="helper">Every rule below is exactly what the solver will follow when you press build. If something looks off, jump back to its stage, adjust it, and come back.</p>
    </header>
    <dl className="ll-run-facts">
      <div hidden><dt>Build</dt><dd id="runModeSummary">Starting five</dd></div>
      <div className="ll-run-fact"><dt>Strategy</dt><dd id="runPresetSummary">Balanced</dd></div>
      <div className="ll-run-fact"><dt>Must include</dt><dd id="runLockedSummary">0</dd></div>
      <div className="ll-run-fact"><dt>Excluded</dt><dd id="runExcludedSummary">0</dd></div>
      <div id="runMinuteModelRow" hidden><dt>Minute approach</dt><dd id="runMinuteModelSummary">Game-plan optimization</dd></div>
    </dl>
    <LineupRunBriefing />
    <div id="searchScope" className="ll-native-note ll-run-scope"><small>Groups to evaluate</small><strong id="searchScopeValue">Load a team and season to see eligible groups.</strong></div>
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