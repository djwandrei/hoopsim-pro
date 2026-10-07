import React, { useEffect, useMemo, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
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
import usePageMeta from '@/hooks/usePageMeta';

export default function PlayerLab() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // One click from the atlas leaderboard straight into a comparison slot.
  const onCompare = row => navigate(`/players/compare?a=${encodeURIComponent(row.id)}`);
  usePageMeta({ title: 'Player Blueprint — SwishIQ Studio', description: 'League atlas and player dossiers: scope, pin and compare any observed NBA season record.' });
  const { year,setYear,years,source,state,error,retry } = useSeasonSource();
  // Pinned players ride in the URL (?p=id1,id2) so a dossier or compare view
  // survives reload and can be shared as a link.
  const [selectedIds,setSelectedIds] = useState(() => new URLSearchParams(window.location.search).get('p')?.split(',').filter(Boolean).slice(0,4) || []);
  const [phase,setPhase] = useState('regular');
  const [scope,setScope] = useState({ mode:'top',team:'',metric:'pts',careerName:'',careerRef:null });
  const roster = useMemo(() => source ? buildBlueprintRows(source,'regular') : [],[source]);
  const atlas = useMemo(() => buildLeagueAtlas(roster),[roster]);
  const phaseRows = useMemo(() => source ? buildBlueprintRows(source,phase) : [],[source,phase]);
  const selected = selectedIds.map(id => {
    const phaseRow = phaseRows.find(row => row.id === id);
    if (phaseRow) return phaseRow;
    const rosterRow = roster.find(row => row.id === id);
    return rosterRow ? { ...rosterRow,phase,available:false,stats:{},totals:{},statsSource:'No observed record for this phase' } : null;
  }).filter(Boolean);
  const toggle = row => setSelectedIds(current => current.includes(row.id) ? current.filter(id => id !== row.id) : current.some(id => id.startsWith(`${row.playerRef}:`)) ? current.map(id => id.startsWith(`${row.playerRef}:`) ? row.id : id) : current.length < 4 ? [...current,row.id] : current);
  const careerPool = useCareerPool(scope.mode === 'career');
  const careerPlayer = useMemo(() => careerPool.players.find(player => player.playerRef === scope.careerRef) || null,[careerPool.players,scope.careerRef]);
  const atlasRows = useMemo(() => applyScope(scope,{ roster,selected,careerPlayer }),[scope,roster,selected,careerPlayer]);
  const onScope = patch => setScope(current => ({ ...current,...patch }));
  const onYearChange = value => { setYear(value);setSelectedIds([]); };
  // Keep ?p= in step with the current pins (replaceState: no history spam).
  useEffect(() => {
    const next = new URL(window.location.href);
    if (selectedIds.length) next.searchParams.set('p', selectedIds.join(','));
    else next.searchParams.delete('p');
    window.history.replaceState(null, '', next);
  }, [selectedIds]);
  const season = { year,years,onYearChange };
  return <StudioShell active="/players"><WorkbenchHeader title="PLAYER BLUEPRINT" description="Two sections: the league atlas of scoped interactive charts, and a dossier explorer that pins any player's full observed record." steps={['League atlas', 'Scope & pin', 'Dossier & compare']} current={pathname === '/players/dossier' ? 2 : pathname === '/players/compare' ? 2 : selected.length ? 1 : 0} state={state} status={selected.length ? `${selected.length} player${selected.length > 1 ? 's' : ''} pinned` : 'Pin players from the atlas or index'} /><main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6"><SourceStatus state={state} error={error} source={source} year={year} years={years} onRetry={retry} phase={phase} />{state === 'ready' && <><PlayerViewTabs /><Routes><Route index element={<div className="space-y-5"><AtlasScopeBar scope={scope} onScope={onScope} roster={roster} selected={selected} careerPool={careerPool} season={season} /><LeagueAtlas rows={atlasRows} atlas={atlas} selected={selected} onSelect={toggle} onCompare={onCompare} /></div>} /><Route path="dossier" element={<PlayerHub roster={roster} phaseRows={phaseRows} phase={phase} onPhaseChange={setPhase} selected={selected} onToggle={toggle} onClear={() => setSelectedIds([])} atlas={atlas} season={season} />} /><Route path="compare" element={<PlayerCompare roster={roster} />} /></Routes></>}</main></StudioShell>;
}