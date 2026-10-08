import React, { useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import useFranchiseSim from './franchise/useFranchiseSim';
import FranchiseStatusStrip from './franchise/FranchiseStatusStrip';
import FranchiseStepRail from './franchise/FranchiseStepRail';
import FranchiseWelcome from './franchise/FranchiseWelcome';
import FranchiseLaunch from './franchise/FranchiseLaunch';
import FranchiseSession from './franchise/FranchiseSession';
import './franchise/franchise.css';

// Three-screen franchise path: welcome → startup (source, season package,
// team, and initialization options) → the in-season control room. The screen
// advances automatically once a session exists, and the step rail above every
// screen shows where you are in the path.
export default function FranchisePreview() {
  const sim = useFranchiseSim();
  const [started, setStarted] = useState(false);
  const screen = sim.view.hasSession ? 'season' : started ? 'setup' : 'welcome';

  if (sim.enginePhase !== 'ready') {
    return (
      <div className="season-view-enter">
        <div className="court-panel flex flex-wrap items-center gap-3 p-4 text-sm">
          {sim.enginePhase === 'loading' ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Connecting the franchise data source…
            </span>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 shrink-0 text-trim" aria-hidden="true" />
              <span className="min-w-0 flex-1">The franchise engine is unavailable: {sim.engineError}</span>
              <button
                type="button"
                onClick={sim.retry}
                className="inline-flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/20"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry connection
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="season-view-enter space-y-4">
      <FranchiseStepRail active={screen} />
      {screen === 'welcome' && <FranchiseWelcome sim={sim} onStart={() => setStarted(true)} />}
      {screen === 'setup' && (
        <>
          <FranchiseStatusStrip view={sim.view} />
          <FranchiseLaunch sim={sim} onBack={() => setStarted(false)} />
        </>
      )}
      {screen === 'season' && (
        <>
          <FranchiseStatusStrip view={sim.view} />
          <FranchiseSession sim={sim} view={sim.view} />
        </>
      )}
    </div>
  );
}