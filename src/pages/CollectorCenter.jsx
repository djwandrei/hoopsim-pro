import React from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import WorkbenchCard from '@/components/studio/WorkbenchCard';
import { WORKBENCHES } from '@/components/studio/workbenches';

const TOOLS = WORKBENCHES.find(tool => tool.path === '/collector')?.children ?? [];

// The Collector Center desk: the two collector tools launch from this
// central home page, and each opens as its own distinct page.
export default function CollectorCenter() {
  usePageMeta({
    title: 'Collector Center | DJ\'s House of Cards',
    description: 'One desk for the collector suite — search the live card catalog by player, or replay a seeded simulated pack draw.',
  });
  return (
    <StudioShell active="/collector">
      <WorkbenchHeader
        title="COLLECTOR CENTER"
        description="One desk for the collector suite — pick a tool below and it opens on its own page."
      />
      <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((tool, index) => <WorkbenchCard key={tool.path} tool={tool} index={index} />)}
        </div>
      </main>
    </StudioShell>
  );
}