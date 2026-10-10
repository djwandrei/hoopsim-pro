import React from 'react';
import FranchiseSchedule from './FranchiseSchedule';
import FranchiseScheduleBoard from './FranchiseScheduleBoard';
import FranchiseCharts from './FranchiseCharts';
import FranchiseRotation from './FranchiseRotation';
import FranchiseStandings from './FranchiseStandings';
import FranchiseLedger from './FranchiseLedger';
import FranchiseBoxScore from './FranchiseBoxScore';
import FranchiseSaves from './FranchiseSaves';
import FranchiseRosterContracts from './FranchiseRosterContracts';

// In-season control room (screen 3): the game desk and rotation HQ in the main
// column, the league ladder and ledger on the rail, and the season charts, the
// full high-def schedule board, box score, and checkpoint bar beneath.
export default function FranchiseSession({ sim, view }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start" aria-busy={sim.view.busy}>
      <div className="min-w-0 space-y-4">
        <FranchiseSchedule sim={sim} />
        <FranchiseRotation sim={sim} />
        <FranchiseRosterContracts sim={sim} view={view} />
      </div>
      <div className="min-w-0 space-y-4">
        <FranchiseStandings view={view} />
        <FranchiseLedger view={view} />
      </div>
      <div className="min-w-0 space-y-4 xl:col-span-2">
        <FranchiseCharts view={view} />
        <FranchiseScheduleBoard view={view} />
        <FranchiseBoxScore view={view} />
        <FranchiseSaves sim={sim} />
      </div>
    </div>
  );
}
