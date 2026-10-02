import React, { useMemo, useState } from 'react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import WorkspaceEmpty from '@/components/studio/WorkspaceEmpty';
import BlueprintRoster from '@/components/players/BlueprintRoster';
import BlueprintPlayerCard from '@/components/players/BlueprintPlayerCard';
import BlueprintComparison from '@/components/players/BlueprintComparison';
import ScoutChallenge from '@/components/players/ScoutChallenge';
import { buildBlueprintRows, PHASES } from '@/components/players/blueprintModel';
import useSeasonSource from '@/hooks/useSeasonSource';

export default function PlayerLab() {
  const { year,setYear,years,source,state,error,retry } = useSeasonSource();
  const [selectedIds,setSelectedIds] = useState([]);
  const [phase,setPhase] = useState('regular');
  const [view,setView] = useState('profiles');
  const roster = useMemo(() => source ? buildBlueprintRows(source,'regular') : [],[source]);
  const phaseRows = useMemo(() => source ? buildBlueprintRows(source,phase) : [],[source,phase]);
  const selected = selectedIds.map(id => phaseRows.find(row => row.id === id) || (roster.find(row => row.id === id) && { ...roster.find(row => row.id === id),phase,available:false,stats:{},totals:{},statsSource:'No observed record for this phase' })).filter(Boolean);
  const activeView = selected.length < 2 || (view === 'scout' && phase !== 'regular') ? 'profiles' : view;
  const toggle = row => setSelectedIds(current => current.includes(row.id) ? current.filter(id => id !== row.id) : current.some(id => id.startsWith(`${row.playerRef}:`)) ? current.map(id => id.startsWith(`${row.playerRef}:`) ? row.id : id) : current.length < 4 ? [...current,row.id] : current);
  const signature = `${year}:${phase}:${selectedIds.join('|')}`;
  return <StudioShell active="/players"><WorkbenchHeader title="PLAYER BLUEPRINT" description="Explore the real site's exact-season player profiles, compare up to four players, then put your scouting instincts to the test." steps={['Scouting board','Profiles & comparison','Scout challenge']} current={selected.length ? activeView === 'scout' ? 2 : 1 : 0} state={state} status={selected.length ? `${selected.length} player${selected.length > 1 ? 's' : ''} selected` : 'Choose up to four players'} /><main className="mx-auto max-w-6xl space-y-5 px-4 py-6"><SourceStatus state={state} error={error} source={source} year={year} years={years} onYearChange={value => { setYear(value);setSelectedIds([]);setView('profiles'); }} onRetry={retry} phase={phase} />{state === 'ready' && <><BlueprintRoster rows={roster} selected={selected} onSelect={toggle} /><section className="court-panel flex flex-wrap items-end justify-between gap-4 p-4"><label className="text-xs text-muted-foreground">Profile season type<select value={phase} onChange={event => setPhase(event.target.value)} className="studio-select mt-2 sm:w-56">{PHASES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><nav aria-label="Player Blueprint views" className="flex flex-wrap gap-2">{[['profiles','Profiles'],['comparison','Comparison'],['scout','Scout challenge']].map(([key,label]) => <button type="button" key={key} disabled={key !== 'profiles' && (selected.length < 2 || (key === 'scout' && phase !== 'regular'))} onClick={() => setView(key)} aria-pressed={activeView === key} className={activeView === key ? 'min-h-11 rounded-lg border border-gold/35 bg-gold/10 px-4 text-xs font-semibold text-gold' : 'min-h-11 rounded-lg border border-border/30 px-4 text-xs text-muted-foreground hover:bg-raised disabled:opacity-35'}>{label}</button>)}</nav><button type="button" onClick={() => setSelectedIds([])} disabled={!selected.length} className="min-h-11 text-xs text-muted-foreground underline underline-offset-4 disabled:opacity-35">Clear selections</button></section>{!selected.length ? <WorkspaceEmpty title="BUILD YOUR SCOUTING BOARD">Choose players above. Review their real portraits, sixteen observed stat panels, biographies and trophy cases, or compare two to four in the scouting challenge.</WorkspaceEmpty> : activeView === 'comparison' ? <BlueprintComparison players={selected} /> : activeView === 'scout' ? <ScoutChallenge key={signature} players={selected} /> : <div className={selected.length === 1 ? 'grid gap-5' : 'grid gap-5 lg:grid-cols-2'}>{selected.map(player => <BlueprintPlayerCard key={`${player.id}:${phase}`} player={player} onRemove={toggle} />)}</div>}</>}</main></StudioShell>;
}