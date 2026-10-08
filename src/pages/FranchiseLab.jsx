import React from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import FranchisePreview from '@/components/season/FranchisePreview';

// Franchise Lab: its own workbench — a pinned-source franchise control room,
// fully separate from the Season Lab replay hub.
export default function FranchiseLab() {
  usePageMeta({ title: 'Franchise Lab — SwishIQ Studio', description: 'Run an exact NBA season as a franchise: pick your team, set the rotation, and play out the schedule game by game.' });
  return (
    <StudioShell active="/franchise">
      <WorkbenchHeader
        title="FRANCHISE LAB"
        description="Your franchise control room: load a pinned exact-season scenario, run the rotation, and play out the schedule game by game."
        state="ready"
        status="Franchise engine ready"
      />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6">
        <FranchisePreview />
      </main>
    </StudioShell>
  );
}