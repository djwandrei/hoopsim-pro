import React, { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import useSeasonSource from '@/hooks/useSeasonSource';
import NativeSurface from '@/components/native/NativeSurface';
const TOOLS={
  chemistry:{path:'/chemistry',title:'CHEMISTRY LAB',description:'Compare a pair’s full-season profiles, play the comparison challenge, and explore verified shared-floor and exact-five combinations.',steps:['Pair profiles','Compare & challenge','Observed combinations']},
  composite:{path:'/forge',title:'COMPOSITE FORGE',description:'Build a player from real player-season skill donors, review the recipe and its source evidence, and save or replay your build.',steps:['Player examples','Choose skill donors','Build & review']},
  game:{path:'/game',title:'GAME LAB',description:'Pick the matchup, read the intel dashboards, then play the original single-game, series and challenge modes with seeded replays.',steps:['Pick matchup','Make your call','Results & replay']},
  season:{path:'/season',title:'SEASON LAB',description:'Replay the observed schedule, review the fixed 16-team postseason, and explore the original season-history and franchise controls where supported.',steps:['Season setup','Replay & decisions','Standings & history']}
};
const chip = active => `flex min-h-10 items-center gap-2 rounded-lg border px-4 text-xs ${active ? 'border-gold/30 bg-gold/10 font-semibold text-gold' : 'border-transparent font-medium text-muted-foreground hover:bg-raised hover:text-foreground'}`;
export default function NativeWorkbench({ kind, sidecar, collapsibleSidecar=false }) {
  const data=useSeasonSource(),[nativeState,setNativeState]=useState('loading'),[showSidecar,setShowSidecar]=useState(true);
  const tool=TOOLS[kind],state=data.state==='ready'?nativeState:data.state,hasSidecar=typeof sidecar==='function';
  return <StudioShell active={tool.path}>
    <WorkbenchHeader title={tool.title} description={tool.description} state={state} status={state==='ready'?'Workbench source ready':undefined} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6">
      <SourceStatus state={data.state} source={data.source} error={data.error} year={data.year} years={data.years} onYearChange={data.setYear} onRetry={data.retry} />
      {data.state==='ready'&&<React.Fragment>
        {collapsibleSidecar&&hasSidecar&&<div className="flex w-fit gap-1 rounded-xl border border-border/30 bg-card p-1">
          <button type="button" aria-pressed={showSidecar} onClick={()=>setShowSidecar(true)} className={chip(showSidecar)}><PanelLeftClose className="h-3.5 w-3.5" />Intel + board</button>
          <button type="button" aria-pressed={!showSidecar} onClick={()=>setShowSidecar(false)} className={chip(!showSidecar)}><PanelLeftOpen className="h-3.5 w-3.5" />Focus on board</button>
        </div>}
        <div className={`grid items-start gap-5 ${hasSidecar&&showSidecar?'lg:grid-cols-[19.5rem_minmax(0,1fr)]':''}`}>
          {hasSidecar&&showSidecar&&<aside className="order-2 min-w-0 self-start space-y-5 lg:order-1 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">{sidecar({source:data.source,league:data.league,year:data.year,setYear:data.setYear})}</aside>}
          <div className="order-1 min-w-0 lg:order-2"><NativeSurface key={`${kind}:${data.source.entry.packageVersion}`} kind={kind} entry={data.source.entry} onYearChange={data.setYear} onStateChange={setNativeState} /></div>
        </div>
      </React.Fragment>}
    </main>
  </StudioShell>;
}