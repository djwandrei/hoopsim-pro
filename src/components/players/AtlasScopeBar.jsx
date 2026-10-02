import React, { useMemo } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { SCOPES, ATLAS_TOP_METRICS } from '@/components/players/atlasScopes';

export default function AtlasScopeBar({ scope,onScope,roster,selected,careerPool }) {
  const teams = useMemo(() => [...new Set(roster.map(row => row.teamCode))].sort(),[roster]);
  const chip = key => scope.mode === key ? 'min-h-10 rounded-lg border border-gold/30 bg-gold/10 px-4 text-xs font-semibold text-gold' : 'min-h-10 rounded-lg border border-transparent px-4 text-xs font-medium text-muted-foreground hover:bg-raised hover:text-foreground';
  return <section className="court-panel p-5">
    <p className="court-kicker">Chart scope</p>
    <h2 className="mt-1 font-display text-2xl">POPULATE THE ATLASES</h2>
    <p className="mt-2 text-xs text-muted-foreground">The charts never assume the whole league — scope the rows yourself: one team, a top-50 cut, your pinned players, or one player across every recorded season.</p>
    <div className="mt-4 flex flex-wrap gap-1 rounded-xl border border-border/30 bg-canvas/50 p-1">{SCOPES.map(([key,label]) => <button key={key} type="button" aria-pressed={scope.mode === key} onClick={() => onScope({ mode:key })} className={chip(key)}>{label}</button>)}</div>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {scope.mode === 'team' && <label className="block">Team<select value={scope.team} onChange={event => onScope({ team:event.target.value })} className="studio-select mt-1 sm:w-44"><option value="">Choose team…</option>{teams.map(code => <option key={code} value={code}>{code}</option>)}</select></label>}
      {scope.mode === 'top' && <label className="block">Rank by<select value={scope.metric} onChange={event => onScope({ metric:event.target.value })} className="studio-select mt-1 sm:w-36">{ATLAS_TOP_METRICS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      {scope.mode === 'pinned' && (selected.length ? <div className="flex flex-wrap items-center gap-2"><span>Pinned:</span>{selected.map(player => <span key={player.id} className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-[11px] text-gold">{player.name}</span>)}</div> : <p>No players pinned yet — pin them in the scatter, the leader board, or the dossier explorer.</p>)}
      {scope.mode === 'career' && <div className="flex flex-wrap items-center gap-3">
        <label className="block">Player<input list="atlas-career-names" value={scope.careerName} onChange={event => { const found = careerPool.players.find(player => player.name === event.target.value); onScope({ careerName:event.target.value,careerRef:found?.playerRef || null }); }} placeholder="e.g. LeBron James" className="studio-select mt-1 sm:w-60" />
          <datalist id="atlas-career-names">{careerPool.players.map(player => <option key={player.playerRef} value={player.name} />)}</datalist>
        </label>
        {careerPool.state === 'loading' && <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading career archive…</span>}
        {careerPool.state === 'error' && <button type="button" onClick={careerPool.retry} className="flex items-center gap-1.5 rounded-lg border border-border/30 px-2.5 py-1.5 hover:text-foreground"><RotateCcw className="h-3 w-3" />Retry career archive</button>}
        {careerPool.state === 'ready' && scope.careerName && !scope.careerRef && <span>No career match for “{scope.careerName}”.</span>}
      </div>}
    </div>
  </section>;
}