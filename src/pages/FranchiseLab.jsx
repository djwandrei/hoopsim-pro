import React from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import FranchisePreview from '@/components/season/FranchisePreview';

// Franchise Lab: its own workbench — a pinned-source franchise control room,
// fully separate from the Season Lab replay hub. Heroless: only the team
// palette picker rides above the workspace.
export default function FranchiseLab() {
  usePageMeta({ title: 'Franchise Lab — SwishIQ Studio', description: 'Run an exact NBA season as a franchise: pick your team, set the rotation, and play out the schedule game by game.' });
  return (
    <StudioShell active="/sims">
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6">
        <FranchisePreview />
      </main>
    </StudioShell>
  );
}