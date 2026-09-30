import React from 'react';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
export default function StudioHero({ sourceState, running, paused, hasResults }) {
  return <WorkbenchHeader title="SEASON LAB" description="Build an exact-season replay, inspect the standings and game tape, and save the results. Simulated outcomes stay separate from observed records." steps={['Setup', 'Season replays', 'Dashboard & history']} current={running ? 1 : hasResults ? 2 : 0} state={sourceState} status={running ? paused ? 'Paused at checkpoint' : 'Season run in progress' : hasResults ? 'Results ready to explore' : 'Build your replay'} />;
}