import React from 'react';
import FranchiseSchedule from './FranchiseSchedule';
import FranchiseRotation from './FranchiseRotation';
import FranchiseStandings from './FranchiseStandings';
import FranchiseLedger from './FranchiseLedger';
import FranchiseBoxScore from './FranchiseBoxScore';
import FranchiseSaves from './FranchiseSaves';

// Session dashboard: the game desk and rotation HQ in the main column, the
// league ladder and ledger on the rail, and the full-width box score plus
// checkpoint bar beneath. All controls come straight from the sim hook.
export default function FranchiseSession({ sim, view }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start" aria-busy={sim.view.busy}>
      <div className="min-w-0 space-y-4">
        <FranchiseSchedule sim={sim} />
        <FranchiseRotation sim={sim} />
      </div>
      <div className="min-w-0 space-y-4">
        <FranchiseStandings view={view} />
        <FranchiseLedger view={view} />
      </div>
      <div className="min-w-0 space-y-4 xl:col-span-2">
        <FranchiseBoxScore view={view} />
        <FranchiseSaves sim={sim} />
      </div>
    </div>
  );
}