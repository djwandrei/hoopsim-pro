import React, { useState } from 'react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import useSeasonSource from '@/hooks/useSeasonSource';
import ForgeBucketDraft from '@/components/forge/ForgeBucketDraft';
import ForgePickDraft from '@/components/forge/ForgePickDraft';

const DRAFT_MODES = [
  { key:'wheel', label:'Wheel Draft', hint:'The wheel picks each skill' },
  { key:'pick', label:'Pick & Spin', hint:'You pick the skill, spin for team & player' },
];

export default function ForgeLab() {
  const data = useSeasonSource();
  const [mode, setMode] = useState('wheel');
  const Draft = mode === 'pick' ? ForgePickDraft : ForgeBucketDraft;
  const active = DRAFT_MODES.find(item => item.key === mode) || DRAFT_MODES[0];
  return <StudioShell active="/forge">
    <WorkbenchHeader title="COMPOSITE FORGE" description={active.hint + ' — keep or respin the offered player-season, then the finished build tours the league.'} steps={mode === 'pick' ? ['Pick the skill', 'Spin team & player', 'Forge & tour'] : ['Spin the wheel', 'Keep or respin', 'Forge & tour']} state={data.state} status={data.state === 'ready' ? 'Workbench source ready' : undefined} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6">
      <SourceStatus state={data.state} source={data.source} error={data.error} year={data.year} years={data.years} onYearChange={data.setYear} onRetry={data.retry} />
      {data.state === 'ready' && <div className="flex flex-wrap gap-2" role="tablist" aria-label="Draft mode">
        {DRAFT_MODES.map(item => <button key={item.key} type="button" role="tab" aria-selected={mode === item.key} onClick={() => setMode(item.key)} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${mode === item.key ? 'border-gold/60 bg-gold/10 text-gold' : 'border-border/30 text-muted-foreground hover:border-gold/40 hover:text-gold'}`}>{item.label}</button>)}
      </div>}
      {data.state === 'ready' && <Draft key={mode + data.source.entry.packageVersion} source={data.source} league={data.league} />}
    </main>
  </StudioShell>;
}