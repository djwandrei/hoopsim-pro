import React from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import WorkbenchCard from '@/components/studio/WorkbenchCard';
import { WORKBENCHES } from '@/components/studio/workbenches';

const TOOLS = WORKBENCHES.find(tool => tool.path === '/analytics')?.children ?? [];

// The Analytics & Analysis desk: the three analysis tools launch from this
// central home page, and each opens as its own distinct page.
export default function Analytics() {
  usePageMeta({
    title: 'Analytics & Analysis | DJ\'s House of Cards',
    description: 'One desk for the analysis suite — player blueprints, chemistry between players, and the full NBA lineup optimizer.',
  });
  return (
    <StudioShell active="/analytics">
      <WorkbenchHeader
        title="ANALYTICS & ANALYSIS"
        description="One desk for the analysis suite — pick a tool below and it opens on its own page."
      />
      <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((tool, index) => <WorkbenchCard key={tool.path} tool={tool} index={index} />)}
        </div>
      </main>
    </StudioShell>
  );
}