import React from 'react';
import LineupToolbar from '@/components/lineupLab/native/LineupToolbar';
import LineupDataset from '@/components/lineupLab/native/LineupDataset';
import LineupDataControls from '@/components/lineupLab/native/LineupDataControls';
import LineupGamePlan from '@/components/lineupLab/native/LineupGamePlan';
import LineupRules from '@/components/lineupLab/native/LineupRules';
import LineupRoster from '@/components/lineupLab/native/LineupRoster';
import LineupReporting from '@/components/lineupLab/native/LineupReporting';
import LineupRunControls from '@/components/lineupLab/native/LineupRunControls';
import LineupResults from '@/components/lineupLab/native/LineupResults';
import LineupSecondaryViews from '@/components/lineupLab/native/LineupSecondaryViews';
import '@/components/lineupLab/native/nativeLineup.css';

export default function LineupWorkspace({ loading = false }) {
  return <main id="mainContent" className="ll-native mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" tabIndex="-1" inert={loading ? '' : undefined} aria-busy={loading}>
    <LineupToolbar />
    <section id="workspace" tabIndex="-1">
      <LineupDataset />
      <section id="optimizerView" data-view="optimizer" role="tabpanel" aria-labelledby="optimizerTab" tabIndex="-1">
        <section id="workflowErrors" className="ll-native-errors" tabIndex="-1" role="alert" hidden />
        <form id="optimizerForm" noValidate className="ll-native-build">
          <fieldset id="nativeSettings" className="ll-native-settings"><legend className="sr-only">Lineup settings</legend><div className="ll-native-settings-grid"><LineupDataControls /><LineupGamePlan /><LineupRoster /><LineupRules /><LineupReporting /></div></fieldset>
          <LineupRunControls />
        </form>
        <LineupResults />
      </section>
      <LineupSecondaryViews />
    </section>
    <div id="toast" className="toast" role="status" aria-live="polite" />
  </main>;
}