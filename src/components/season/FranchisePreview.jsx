import React from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import useFranchiseSim from './franchise/useFranchiseSim';
import FranchiseStatusStrip from './franchise/FranchiseStatusStrip';
import FranchiseSetup from './franchise/FranchiseSetup';
import FranchiseRotation from './franchise/FranchiseRotation';
import FranchiseSchedule from './franchise/FranchiseSchedule';
import FranchiseStandings from './franchise/FranchiseStandings';
import FranchiseLedger from './franchise/FranchiseLedger';
import FranchiseSaves from './franchise/FranchiseSaves';
import './franchise/franchise.css';

// The franchise tab, fully native React: the vendored simulation worker and V4
// intake modules load at their same-origin studio paths (V4 release data still
// relays through the connected studio source), and every preview control is
// rendered and driven directly by React instead of the embedded site frame.
export default function FranchisePreview() {
  const sim = useFranchiseSim();

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
      <FranchiseStatusStrip view={sim.view} />
      <FranchiseSetup sim={sim} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-start">
        <FranchiseRotation sim={sim} />
        <FranchiseSchedule sim={sim} />
      </div>
      <FranchiseStandings view={sim.view} />
      <FranchiseLedger view={sim.view} />
      <FranchiseSaves sim={sim} />
    </div>
  );
}