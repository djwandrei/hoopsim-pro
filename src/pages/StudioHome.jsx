import React from 'react';
import StudioShell from '@/components/studio/StudioShell';
import StudioWelcome from '@/components/studio/StudioWelcome';
import WorkbenchCard from '@/components/studio/WorkbenchCard';
import BroadcastTicker from '@/components/studio/BroadcastTicker';
import { WORKBENCHES, DAILY_GAMES } from '@/components/studio/workbenches';
import FanToolsGrid from '@/components/studio/FanToolsGrid';
import HubSourcePanel from '@/components/studio/HubSourcePanel';
export default function StudioHome() {
  const board=[{value:'07',label:'Workbenches'},{value:'2017–26',label:'Published archive'},{value:'04',label:'Comparison slots'},{value:'SHA-256',label:'Verified source'},{value:'Original',label:'Gameplay modules'},{value:'Seeded',label:'Replay engine'}];
  return <StudioShell active="/"><StudioWelcome /><BroadcastTicker items={board} /><main className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
    <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 pb-4"><div><p className="bcast-kicker mb-2">Studio Index</p><h2 className="font-display text-xl tracking-wide">THE WORKBENCHES</h2></div><span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>Choose your next play · Original DJHC assets</span></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{WORKBENCHES.map((tool,index) => <WorkbenchCard key={tool.path} tool={tool} index={index} />)}</div>
    <div className="mt-12"><div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 pb-4"><div><p className="bcast-kicker mb-2">Daily desk</p><h2 className="font-display text-xl tracking-wide">DAILY GAMES & LINEUP LAB</h2></div><span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>Fresh calls · Verified ranks</span></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{DAILY_GAMES.map((tool,index) => <WorkbenchCard key={tool.path} tool={tool} index={index} />)}</div></div>
    <FanToolsGrid />
    <HubSourcePanel />
  </main></StudioShell>;
}