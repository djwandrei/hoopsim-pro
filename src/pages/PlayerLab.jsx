import React, { useMemo, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import LeagueAtlas from '@/components/players/LeagueAtlas';
import PlayerHub from '@/components/players/PlayerHub';
import PlayerCompare from '@/components/players/PlayerCompare';
import PlayerViewTabs from '@/components/players/PlayerViewTabs';
import AtlasScopeBar from '@/components/players/AtlasScopeBar';
import { buildBlueprintRows } from '@/components/players/blueprintModel';
import { buildLeagueAtlas } from '@/components/players/leagueAtlas';
import { applyScope } from '@/components/players/atlasScopes';
import useCareerPool from '@/components/players/useCareerPool';
import useSeasonSource from '@/hooks/useSeasonSource';

export default function PlayerLab() {
  const { year,setYear,years,source,state,error,retry } = useSeasonSource();
  const [selectedIds,setSelectedIds] = useState([]);
  const [phase,setPhase] = useState('regular');
  const [scope,setScope] = useState({ mode:'top',team:'',metric:'pts',careerName:'',careerRef:null });
  const roster = useMemo(() => source ? buildBlueprintRows(source,'regular') : [],[source]);
  const atlas = useMemo(() => buildLeagueAtlas(roster),[roster]);
  const phaseRows = useMemo(() => source ? buildBlueprintRows(source,phase) : [],[source,phase]);
  const selected = selectedIds.map(id => phaseRows.find(row => row.id === id) || (roster.find(row => row.id === id) && { ...roster.find(row => row.id === id),phase,available:false,stats:{},totals:{},statsSource:'No observed record for this phase' })).filter(Boolean);
  const toggle = row => setSelectedIds(current => current.includes(row.id) ? current.filter(id => id !== row.id) : current.some(id => id.startsWith(`${row.playerRef}:`)) ? current.map(id => id.startsWith(`${row.playerRef}:`) ? row.id : id) : current.length < 4 ? [...current,row.id] : current);
  const careerPool = useCareerPool(scope.mode === 'career');
  const careerPlayer = useMemo(() => careerPool.players.find(player => player.playerRef === scope.careerRef) || null,[careerPool.players,scope.careerRef]);
  const atlasRows = useMemo(() => applyScope(scope,{ roster,selected,careerPlayer }),[scope,roster,selected,careerPlayer]);
  const onScope = patch => setScope(current => ({ ...current,...patch }));
  const onYearChange = value => { setYear(value);setSelectedIds([]); };
  const season = { year,years,onYearChange };
  return <StudioShell active="/players"><WorkbenchHeader title="PLAYER BLUEPRINT" description="Two sections: the league atlas of scoped interactive charts, and a dossier explorer that pins any player's full observed record." state={state} status={selected.length ? `${selected.length} player${selected.length > 1 ? 's' : ''} pinned` : 'Pin players from the atlas or index'} /><main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6"><SourceStatus state={state} error={error} source={source} year={year} years={years} onRetry={retry} phase={phase} />{state === 'ready' && <><PlayerViewTabs /><Routes><Route index element={<div className="space-y-5"><AtlasScopeBar scope={scope} onScope={onScope} roster={roster} selected={selected} careerPool={careerPool} season={season} /><LeagueAtlas rows={atlasRows} atlas={atlas} selected={selected} onSelect={toggle} /></div>} /><Route path="dossier" element={<PlayerHub roster={roster} phaseRows={phaseRows} phase={phase} onPhaseChange={setPhase} selected={selected} onToggle={toggle} onClear={() => setSelectedIds([])} atlas={atlas} season={season} />} /><Route path="compare" element={<PlayerCompare roster={roster} />} /></Routes></>}</main></StudioShell>;
}