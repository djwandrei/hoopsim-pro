import React, { useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import useSeasonSource from '@/hooks/useSeasonSource';
import ForgeBucketDraft from '@/components/forge/ForgeBucketDraft';
import ForgePickDraft from '@/components/forge/ForgePickDraft';
import ForgeTeamDraft from '@/components/forge/ForgeTeamDraft';
import { MODE_STEPS } from '@/components/forge/ForgeDraftGame';

const DRAFT_MODES = [
  { key:'wheel', label:'Wheel Draft', desc:'Spin the reels for team & player, tap a stat chip to assign it — keep or respin the offered player-season, then the finished build tours the league.' },
  { key:'pick', label:'Pick & Spin', desc:'Arm a skill chip, spin the reels, then keep the offered value or burn a respin — fill all nine slots to forge the composite.' },
  { key:'team', label:'Team Forge · 98-0', desc:'Spin for a player every round, choose where they slot into your eight-man rotation, then simulate the season and playoffs — chase the flawless 98-0.' },
  { key:'teamPick', label:'Team Forge · Pick', desc:'Spin for a random team, then choose any player from their roster for your rotation — fill all eight spots and simulate the chase for the flawless 98-0.' },
];

export default function ForgeLab() {
  usePageMeta({ title: 'Forge Lab — SwishIQ Studio', description: 'Forge composite players and teams from real season data with live 3D build feedback.' });
  const data = useSeasonSource();
  const [mode, setMode] = useState('wheel');
  const Draft = mode === 'pick' ? ForgePickDraft : mode === 'team' || mode === 'teamPick' ? ForgeTeamDraft : ForgeBucketDraft;
  const active = DRAFT_MODES.find(item => item.key === mode) || DRAFT_MODES[0];
  return <StudioShell active="/forge">
    <WorkbenchHeader title="COMPOSITE FORGE" description={active.desc} steps={MODE_STEPS[mode]} state={data.state} status={data.state === 'ready' ? 'Workbench source ready' : undefined} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <SourceStatus state={data.state} source={data.source} error={data.error} year={data.year} years={data.years} onYearChange={data.setYear} onRetry={data.retry} />
      {data.state === 'ready' && <div className="flex flex-wrap gap-2" role="tablist" aria-label="Draft mode">
        {DRAFT_MODES.map(item => <button key={item.key} type="button" role="tab" aria-selected={mode === item.key} onClick={() => setMode(item.key)} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${mode === item.key ? 'border-gold/60 bg-gradient-to-r from-gold/15 to-royal/10 text-gold shadow-[0_0_18px_rgba(233,185,73,0.12)]' : 'border-border/30 text-muted-foreground hover:border-gold/40 hover:text-gold'}`}>{item.label}</button>)}
      </div>}
      {data.state === 'ready' && (mode === 'teamPick'
        ? <ForgeTeamDraft key={mode + data.source.entry.packageVersion} pickMode source={data.source} league={data.league} />
        : <Draft key={mode + data.source.entry.packageVersion} source={data.source} league={data.league} />)}
    </main>
  </StudioShell>;
}