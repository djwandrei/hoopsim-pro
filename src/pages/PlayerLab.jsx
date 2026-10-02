import React, { useMemo, useState } from 'react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import WorkspaceEmpty from '@/components/studio/WorkspaceEmpty';
import LeagueAtlas from '@/components/players/LeagueAtlas';
import PlayerHub from '@/components/players/PlayerHub';
import { buildBlueprintRows } from '@/components/players/blueprintModel';
import { buildLeagueAtlas } from '@/components/players/leagueAtlas';
import useSeasonSource from '@/hooks/useSeasonSource';

export default function PlayerLab() {
  const { year,setYear,years,source,state,error,retry } = useSeasonSource();
  const [selectedIds,setSelectedIds] = useState([]);
  const [phase,setPhase] = useState('regular');
  const roster = useMemo(() => source ? buildBlueprintRows(source,'regular') : [],[source]);
  const atlas = useMemo(() => buildLeagueAtlas(roster),[roster]);
  const phaseRows = useMemo(() => source ? buildBlueprintRows(source,phase) : [],[source,phase]);
  const selected = selectedIds.map(id => phaseRows.find(row => row.id === id) || (roster.find(row => row.id === id) && { ...roster.find(row => row.id === id),phase,available:false,stats:{},totals:{},statsSource:'No observed record for this phase' })).filter(Boolean);
  const toggle = row => setSelectedIds(current => current.includes(row.id) ? current.filter(id => id !== row.id) : current.some(id => id.startsWith(`${row.playerRef}:`)) ? current.map(id => id.startsWith(`${row.playerRef}:`) ? row.id : id) : current.length < 4 ? [...current,row.id] : current);
  return <StudioShell active="/players"><WorkbenchHeader title="PLAYER BLUEPRINT" description="A season-long analytics hub: read the league at a glance in the atlas, then pin any player to open their full observed dossier." state={state} status={selected.length ? `${selected.length} player${selected.length > 1 ? 's' : ''} pinned` : 'Pin players from the index or atlas'} /><main className="mx-auto max-w-6xl space-y-5 px-4 py-6"><SourceStatus state={state} error={error} source={source} year={year} years={years} onYearChange={value => { setYear(value);setSelectedIds([]); }} onRetry={retry} phase={phase} />{state === 'ready' && <><LeagueAtlas rows={roster} atlas={atlas} selected={selected} onSelect={toggle} /><PlayerHub roster={roster} phaseRows={phaseRows} phase={phase} onPhaseChange={setPhase} selected={selected} onToggle={toggle} onClear={() => setSelectedIds([])} atlas={atlas} /></>}{state !== 'ready' && <WorkspaceEmpty title="LEAGUE SOURCE NEEDED">Load a verified season source above to unlock the league atlas and the player dossier explorer.</WorkspaceEmpty>}</main></StudioShell>;
}