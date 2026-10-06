import React, { useMemo, useState } from 'react';
import { Search, X, Plus, Check, ListPlus, Eraser, UserMinus, UserPlus } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';
import PlayerPortrait from '@/components/players/PlayerPortrait';

const POSITION_CHIPS = ['PG', 'SG', 'SF', 'PF', 'C'];

// Player pool manager: pick who's in and who's out with one tap. "Exclude"
// removes the selected players from the wheel; "Only these" pins the wheel to
// just the selected players.
export default function SpinPoolManager({ players, selected, mode, onModeChange, onChange }) {
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [limit, setLimit] = useState(60);
  const teamOptions = useMemo(() => [...new Set(players.flatMap(player => (player.teamCodes || [player.teamCode]).filter(Boolean)))].sort(), [players]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggle = ref => onChange(selectedSet.has(ref) ? selected.filter(item => item !== ref) : [...selected, ref]);
  const matches = useMemo(() => players.filter(player => {
    if (query && !`${player.name} ${player.teamCode}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (teamFilter !== 'all' && !(player.teamCodes || [player.teamCode]).includes(teamFilter)) return false;
    if (posFilter !== 'all' && !(player.positions || []).some(pos => String(pos).toUpperCase().includes(posFilter))) return false;
    return true;
  }), [players, query, posFilter, teamFilter]);
  const addShown = () => onChange([...new Set([...selected, ...matches.map(player => player.playerRef)])]);
  return <section className="court-panel spin-mgr" aria-label="Players in and out">
    <header className="spin-desk__head">
      <div>
        <p className="bcast-kicker">Player pool</p>
        <h2 className="spin-desk__title">PLAYERS IN / OUT</h2>
      </div>
      <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true" />{selected.length} selected</span>
    </header>
    <div className="spin-tabs mt-3" role="tablist" aria-label="Selection mode">
      <button type="button" role="tab" aria-selected={mode === 'exclude'} onClick={() => onModeChange('exclude')}><UserMinus className="h-3.5 w-3.5" aria-hidden="true" />Exclude selected</button>
      <button type="button" role="tab" aria-selected={mode === 'include'} onClick={() => onModeChange('include')}><UserPlus className="h-3.5 w-3.5" aria-hidden="true" />Only these players</button>
    </div>
    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{mode === 'exclude' ? 'Selected players can never be drawn.' : 'The wheel draws only from the selected players — select at least one.'} Toggling rebuilds the pool and clears previous picks.</p>
    {selected.length > 0 && <div className="spin-mgr__selected mt-3" aria-label="Selected players">{selected.map(ref => {
      const player = players.find(item => item.playerRef === ref);
      if (!player) return null;
      return <button key={ref} type="button" className="spin-tag" onClick={() => toggle(ref)} aria-label={`Deselect ${player.name}`}><TeamMark code={player.teamCode} className="h-5 w-5" />{player.name}<X className="h-3 w-3" aria-hidden="true" /></button>;
    })}</div>}
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
      <label className="flex items-center gap-2 rounded-lg border border-input bg-raised/40 px-3 py-2"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input aria-label="Search players" className="min-w-0 w-full bg-transparent text-sm outline-none" value={query} onChange={event => { setQuery(event.target.value); setLimit(60); }} placeholder="Name or team…" /></label>
      <select aria-label="Filter players by team" className="studio-select sm:w-24" value={teamFilter} onChange={event => setTeamFilter(event.target.value)}><option value="all">All teams</option>{teamOptions.map(code => <option key={code} value={code}>{code}</option>)}</select>
      <select aria-label="Filter players by position" className="studio-select sm:w-20" value={posFilter} onChange={event => setPosFilter(event.target.value)}><option value="all">All pos</option>{POSITION_CHIPS.map(code => <option key={code} value={code}>{code}</option>)}</select>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" onClick={addShown} className="spin-mgr__bulk"><ListPlus className="h-3.5 w-3.5" aria-hidden="true" />{mode === 'exclude' ? 'Exclude all shown' : 'Include all shown'}</button>
      {selected.length > 0 && <button type="button" onClick={() => onChange([])} className="spin-mgr__bulk spin-mgr__bulk--quiet"><Eraser className="h-3.5 w-3.5" aria-hidden="true" />Clear selection</button>}
    </div>
    <div className="mt-2 max-h-[26rem] space-y-1 overflow-y-auto pr-1">{matches.slice(0, limit).map(player => {
      const on = selectedSet.has(player.playerRef);
      return <button key={player.playerRef} type="button" onClick={() => toggle(player.playerRef)} aria-pressed={on} className={`spin-mgr__row${on ? ' spin-mgr__row--on' : ''}`}>
        {on ? <Check className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" /> : <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <PlayerPortrait player={{ ...player, name: player.name }} className="h-9 w-8 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs">{player.name}</span>
        <TeamMark code={player.teamCode} className="h-7 w-7 shrink-0" />
        <span className="shrink-0 font-mono text-[10.4px] text-muted-foreground">{(player.positions || []).slice(0, 2).join('/')}</span>
      </button>;
    })}{!matches.length && <p className="py-4 text-xs text-muted-foreground">No players match your filters.</p>}</div>
    {matches.length > limit && <button type="button" onClick={() => setLimit(value => value + 60)} className="mt-2 min-h-10 w-full rounded-lg border border-input text-xs text-gold">Show more players</button>}
  </section>;
}