import React from 'react';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
export default function StudioHero() {
  return <WorkbenchHeader title="SEASON LAB" description="Build an exact-season replay, inspect the standings and game tape, and save the results. Simulated outcomes stay separate from observed records." steps={['Setup', 'Season replays', 'Dashboard & history']} />;
}