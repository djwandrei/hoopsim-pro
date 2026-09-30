import React from 'react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import WorkbenchCard from '@/components/studio/WorkbenchCard';
import { WORKBENCHES } from '@/components/studio/workbenches';
export default function StudioHome() {
  return <StudioShell active="/"><WorkbenchHeader title="YOUR COURT. YOUR WORKSPACE." description="Explore the evidence. Build a scenario. Review what the results actually mean. Choose a workbench to get started." /><main className="mx-auto max-w-6xl px-4 py-7 sm:px-6"><div className="mb-5 flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-display text-xl tracking-wide">THE WORKBENCHES</h2><p className="text-xs text-muted-foreground">Observed data · Browser-based scenarios</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{WORKBENCHES.map((tool,index) => <WorkbenchCard key={tool.path} tool={tool} index={index} />)}</div></main></StudioShell>;
}