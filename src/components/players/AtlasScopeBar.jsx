import React, { useMemo, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { SCOPES, ATLAS_TOP_METRICS } from '@/components/players/atlasScopes';
import SeasonSelect from '@/components/studio/SeasonSelect';

export default function AtlasScopeBar({ scope,onScope,roster,selected,careerPool,season }) {
  const teams = useMemo(() => [...new Set(roster.map(row => row.teamCode))].sort(),[roster]);
  const [careerTeam,setCareerTeam] = useState('');
  const [careerPos,setCareerPos] = useState('');
  const careerTeams = useMemo(() => [...new Set(careerPool.players.map(player => player.teamCode))].sort(),[careerPool.players]);
  const careerPositions = useMemo(() => [...new Set(careerPool.players.flatMap(player => player.positions || []))].sort(),[careerPool.players]);
  const careerMenuPlayers = useMemo(() => {
    const filtered = careerPool.players
      .filter(player => (!careerTeam || player.teamCode === careerTeam) && (!careerPos || (player.positions || []).includes(careerPos)))
      .sort((a,b) => a.name.localeCompare(b.name));
    const active = scope.careerRef ? careerPool.players.find(player => player.playerRef === scope.careerRef) : null;
    return active && !filtered.some(player => player.playerRef === active.playerRef) ? [active,...filtered] : filtered;
  },[careerPool.players,careerTeam,careerPos,scope.careerRef]);
  const chip = key => scope.mode === key ? 'min-h-10 rounded-lg border border-gold/40 bg-gold/15 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold' : 'min-h-10 rounded-lg border border-transparent px-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-raised hover:text-foreground';
  return <section className="court-panel p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="court-kicker">Chart scope</p>
      <h2 className="mt-1 font-display text-2xl">POPULATE THE ATLASES</h2></div>
      {season && <div className="w-36"><SeasonSelect years={season.years} year={season.year} onChange={season.onYearChange} /></div>}
    </div>
    <p className="mt-2 text-xs text-muted-foreground">The charts never assume the whole league — scope the rows yourself: one team, a top-50 cut, your pinned players, or one player across every recorded season.</p>
    <div className="mt-4 flex flex-wrap gap-1 rounded-xl border border-border/30 bg-canvas/50 p-1">{SCOPES.map(([key,label]) => <button key={key} type="button" aria-pressed={scope.mode === key} onClick={() => onScope({ mode:key })} className={chip(key)}>{label}</button>)}</div>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {scope.mode === 'team' && <label className="block"><span className="studio-control-label">Team</span><select value={scope.team} onChange={event => onScope({ team:event.target.value })} className="studio-select sm:w-44"><option value="">Choose team…</option>{teams.map(code => <option key={code} value={code}>{code}</option>)}</select></label>}
      {scope.mode === 'top' && <label className="block"><span className="studio-control-label">Rank by</span><select value={scope.metric} onChange={event => onScope({ metric:event.target.value })} className="studio-select sm:w-36">{ATLAS_TOP_METRICS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      {scope.mode === 'pinned' && (selected.length ? <div className="flex flex-wrap items-center gap-2"><span>Pinned:</span>{selected.map(player => <span key={player.id} className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-[11px] text-gold">{player.name}</span>)}</div> : <p>No players pinned yet — pin them in the scatter, the leader board, or the dossier explorer.</p>)}
      {scope.mode === 'career' && <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="studio-control-label">Team</span><select value={careerTeam} onChange={event => setCareerTeam(event.target.value)} className="studio-select sm:w-28"><option value="">All teams</option>{careerTeams.map(code => <option key={code} value={code}>{code}</option>)}</select></label>
        <label className="block"><span className="studio-control-label">Position</span><select value={careerPos} onChange={event => setCareerPos(event.target.value)} className="studio-select sm:w-32"><option value="">All positions</option>{careerPositions.map(pos => <option key={pos} value={pos}>{pos}</option>)}</select></label>
        <label className="block min-w-0 flex-1"><span className="studio-control-label">Player</span><select value={scope.careerRef || ''} onChange={event => { const found = careerPool.players.find(player => player.playerRef === event.target.value); onScope({ careerName:found?.name || '',careerRef:found?.playerRef || null }); }} disabled={careerPool.state !== 'ready'} className="studio-select sm:w-64"><option value="">Choose player…</option>{careerMenuPlayers.map(player => <option key={player.playerRef} value={player.playerRef}>{player.name}</option>)}</select></label>
        {careerPool.state === 'loading' && <span className="flex items-center gap-2 pb-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading career archive…</span>}
        {careerPool.state === 'error' && <button type="button" onClick={careerPool.retry} className="flex items-center gap-1.5 rounded-lg border border-border/30 px-2.5 py-1.5 pb-2 hover:text-foreground"><RotateCcw className="h-3 w-3" />Retry career archive</button>}
      </div>}
    </div>
  </section>;
}