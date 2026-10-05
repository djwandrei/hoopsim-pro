import React from 'react';
import LineupToolbar from '@/components/lineupLab/native/LineupToolbar';
import LineupStages from '@/components/lineupLab/native/LineupStages';
import LineupSecondaryViews from '@/components/lineupLab/native/LineupSecondaryViews';
import LineupTour from '@/components/lineupLab/native/LineupTour';
import '@/components/lineupLab/native/nativeLineup.css';

export default function LineupWorkspace({ loading = false }) {
  return <>
    <main id="mainContent" className="ll-native mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" tabIndex="-1" inert={loading ? '' : undefined} aria-busy={loading}>
      <LineupToolbar />
      <section id="workspace" tabIndex="-1">
        <section id="optimizerView" data-view="optimizer" role="tabpanel" aria-labelledby="optimizerTab" tabIndex="-1">
          <section id="workflowErrors" className="ll-native-errors" tabIndex="-1" role="alert" hidden />
          <LineupStages />
        </section>
        <LineupSecondaryViews />
      </section>
      <div id="toast" className="toast" role="status" aria-live="polite" />
    </main>
    {!loading && <LineupTour />}
  </>;
}