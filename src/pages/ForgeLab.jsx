import React, { useMemo, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import useSeasonSource from '@/hooks/useSeasonSource';
import ForgeBucketDraft from '@/components/forge/ForgeBucketDraft';
import ForgePickDraft from '@/components/forge/ForgePickDraft';
import ForgeTeamDraft from '@/components/forge/ForgeTeamDraft';
import { MODE_STEPS } from '@/components/forge/ForgeDraftGame';
import { buildForgePool } from '@/components/forge/forgePool';
import { initialForgeDraftMode, decodeForgeBuild, updateForgeBuildUrl } from '@/components/forge/forgeReceipt';
import { readForgeLibrary } from '@/components/forge/forgeSession';
import { RATING_MODEL } from '@/components/forge/bapSkills';

const DRAFT_MODES = [
  { key:'wheel', label:'Wheel Draft', desc:'Spin the reels for team & player, tap a stat chip to assign it — keep or respin the offered player-season, then the finished build tours the league.' },
  { key:'pick', label:'Pick & Spin', desc:'Choose an attribute, spin the reels, then keep the offered value or burn a respin — fill all ten slots to forge the composite.' },
  { key:'team', label:'Team Forge · 98-0', desc:'Spin for a player every round, choose where they slot into your eight-man rotation, then simulate the season and playoffs — chase the flawless 98-0.' },
  { key:'teamPick', label:'Team Forge · Pick', desc:'Spin for a random team, then choose any player from their roster for your rotation — fill all eight spots and simulate the chase for the flawless 98-0.' },
];

export default function ForgeLab() {
  usePageMeta({ title: 'Forge Lab — SwishIQ Studio', description: 'Forge composite players and teams from real season data with live 3D build feedback.' });
  const [shared] = useState(() => decodeForgeBuild(window.location.search));
  const data = useSeasonSource(2025, 'forge', shared?.year);
  const [revision, setRevision] = useState(0), [library, setLibrary] = useState([]);
  const [mode, setMode] = useState(() => initialForgeDraftMode(window.location.search, DRAFT_MODES.map(item => item.key)));
  // Season pool built once per source and shared by every draft mode, so
  // switching modes never re-derives the ratings pipeline.
  const pool = useMemo(() => (data.state === 'ready' ? buildForgePool(data.source) : null), [data.source, data.state]);
  const Draft = mode === 'pick' ? ForgePickDraft : mode === 'team' || mode === 'teamPick' ? ForgeTeamDraft : ForgeBucketDraft;
  const active = DRAFT_MODES.find(item => item.key === mode) || DRAFT_MODES[0];
  const selectMode = next => { updateForgeBuildUrl(null); setMode(next); };
  const loadBuild = row => { const build = decodeForgeBuild(`?${row.query}`); if (!build) return; updateForgeBuildUrl(row.query); if (build.year) data.setYear(build.year); setMode(build.mode); setRevision(v => v + 1); };
  return <StudioShell active="/forge">
    <WorkbenchHeader title="COMPOSITE FORGE" description={active.desc} steps={MODE_STEPS[mode]} state={data.state} status={data.state === 'ready' ? 'Workbench source ready' : undefined} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <SourceStatus state={data.state} source={data.source} error={data.error} year={data.year} years={data.years} onYearChange={data.setYear} onRetry={data.retry} />
      {data.state === 'ready' && <div className="court-panel flex flex-wrap items-center gap-3 p-3 text-xs"><label>Season<select value={data.year} onChange={e => { updateForgeBuildUrl(null); data.setYear(Number(e.target.value)); }} className="studio-select ml-2 w-auto">{data.years.map(y => <option key={y} value={y}>{y}–{String(y + 1).slice(-2)}</option>)}</select></label><span className="min-w-0 break-all text-muted-foreground">{pool?.length} eligible players · {RATING_MODEL} · {data.source.entry.packageVersion}</span></div>}
      <details className="court-panel p-3" onToggle={event => { if (event.currentTarget.open) setLibrary(readForgeLibrary()); }}><summary className="cursor-pointer text-xs font-semibold text-gold">Saved builds on this device</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{library.map(row => <button key={row.query} type="button" onClick={() => loadBuild(row)} className="min-h-10 rounded-lg border border-border p-2 text-left text-xs">{row.label}<span className="ml-2 text-muted-foreground">{row.at?.slice(0, 10)}</span></button>)}{!library.length && <p className="text-xs text-muted-foreground">Completed builds can be saved here. Unfinished drafts resume automatically by season and mode.</p>}</div></details>
      {data.state === 'ready' && <div className="flex flex-wrap gap-2" role="tablist" aria-label="Draft mode">
        {DRAFT_MODES.map((item, index) => <button key={item.key} id={`forge-tab-${item.key}`} aria-controls="forge-mode-panel" tabIndex={mode === item.key ? 0 : -1} type="button" role="tab" aria-selected={mode === item.key} onClick={() => selectMode(item.key)} onKeyDown={event => { const next = event.key === 'ArrowRight' ? (index + 1) % 4 : event.key === 'ArrowLeft' ? (index + 3) % 4 : event.key === 'Home' ? 0 : event.key === 'End' ? 3 : null; if (next !== null) { event.preventDefault(); selectMode(DRAFT_MODES[next].key); document.getElementById(`forge-tab-${DRAFT_MODES[next].key}`)?.focus(); } }} className={`min-h-11 rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${mode === item.key ? 'border-gold/60 bg-gradient-to-r from-gold/15 to-royal/10 text-gold shadow-[0_0_18px_rgba(233,185,73,0.12)]' : 'border-border/30 text-muted-foreground hover:border-gold/40 hover:text-gold'}`}>{item.label}</button>)}
      </div>}
      {data.state === 'ready' && <div id="forge-mode-panel" role="tabpanel" aria-labelledby={`forge-tab-${mode}`}>{mode === 'teamPick'
        ? <ForgeTeamDraft key={mode + data.source.entry.packageVersion + revision} pickMode source={data.source} league={data.league} pool={pool} />
        : <Draft key={mode + data.source.entry.packageVersion + revision} source={data.source} league={data.league} pool={pool} />}</div>}
    </main>
  </StudioShell>;
}
