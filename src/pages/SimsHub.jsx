import React from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import WorkbenchCard from '@/components/studio/WorkbenchCard';
import { WORKBENCHES } from '@/components/studio/workbenches';

const TOOLS = WORKBENCHES.find(tool => tool.path === '/sims')?.children ?? [];

// The Sims & What-ifs desk: the three simulation workbenches launch from this
// central home page, and each opens as its own distinct page.
export default function SimsHub() {
  usePageMeta({
    title: 'Sims & What-ifs | DJ\'s House of Cards',
    description: 'One desk for the simulation suite — replay the real season, play matchup challenges, or run a full franchise control room.',
  });
  return (
    <StudioShell active="/sims">
      <WorkbenchHeader
        title="SIMS & WHAT-IFS"
        description="One desk for the simulation suite — pick a sim below and it opens on its own page."
      />
      <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool, index) => <WorkbenchCard key={tool.path} tool={tool} index={index} />)}
        </div>
      </main>
    </StudioShell>
  );
}