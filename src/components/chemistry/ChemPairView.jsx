import React, { useMemo, useState } from 'react';
import ChemRosterTable from './ChemRosterTable';
import ChemPairProfile from './ChemPairProfile';
import ChemChallenge from './ChemChallenge';
import { Search } from 'lucide-react';

const selectClass = 'studio-select';

export default function ChemPairView({ dataset, chem }) {
  const { rows, teams, scope } = dataset;
  const [team, setTeam] = useState('');
  const [position, setPosition] = useState('');
  const [query, setQuery] = useState('');
  const [pickedIds, setPickedIds] = useState({ a: '', b: '' });
  const [result, setResult] = useState(null);
  const positions = useMemo(() => {
    const set = new Set();
    rows.forEach(row => (Array.isArray(row.positions) ? row.positions : []).forEach(value => value && set.add(value)));
    return [...set].sort();
  }, [rows]);
  const filtered = useMemo(() => rows.filter(row => (
    (!team || row.teamCode === team)
    && (!position || (Array.isArray(row.positions) && row.positions.includes(position)))
    && (!query || row.displayName.toLowerCase().includes(query.toLowerCase()))
  )), [rows, team, position, query]);
  const rowById = useMemo(() => new Map(rows.map(row => [chem.pairProfileRowId(row), row])), [rows, chem]);
  const pick = (slot, row) => {
    const id = chem.pairProfileRowId(row);
    setPickedIds(current => ({ ...current, [slot]: current[slot] === id ? '' : id }));
    setResult(null);
  };
  const compare = () => {
    const first = rowById.get(pickedIds.a);
    const second = rowById.get(pickedIds.b);
    if (!first || !second) return;
    setResult({ first, second });
    requestAnimationFrame(() => document.getElementById('chem-pair-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const playerOptions = filtered.slice(0, 150);
  const first = result && rowById.get(result.first.playerSeasonRef || '') || result?.first;
  const second = result && rowById.get(result.second.playerSeasonRef || '') || result?.second;
  return <div className="space-y-5">
    <section className="court-panel p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="block"><span className="studio-control-label">Team</span>
          <select className={selectClass} value={team} onChange={event => { setTeam(event.target.value); setResult(null); }}>
            <option value="">All teams</option>
            {[...teams.keys()].map(code => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <label className="block"><span className="studio-control-label">Position</span>
          <select className={selectClass} value={position} onChange={event => { setPosition(event.target.value); setResult(null); }}>
            <option value="">All positions</option>
            {positions.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="block"><span className="studio-control-label">Search name</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" className={`${selectClass} pl-9`} value={query} onChange={event => { setQuery(event.target.value); setResult(null); }} placeholder="Search players" />
          </span>
        </label>
        <label className="block"><span className="studio-control-label">Player one</span>
          <select className={selectClass} value={pickedIds.a} onChange={event => { setPickedIds(current => ({ ...current, a: event.target.value })); setResult(null); }}>
            <option value="">Choose a player</option>
            {playerOptions.map(row => <option key={row.playerSeasonRef} value={chem.pairProfileRowId(row)}>{row.displayName} ({row.teamCode})</option>)}
          </select>
        </label>
        <label className="block"><span className="studio-control-label">Player two</span>
          <select className={selectClass} value={pickedIds.b} onChange={event => { setPickedIds(current => ({ ...current, b: event.target.value })); setResult(null); }}>
            <option value="">Choose a player</option>
            {playerOptions.map(row => <option key={row.playerSeasonRef} value={chem.pairProfileRowId(row)}>{row.displayName} ({row.teamCode})</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <button type="button" onClick={compare} disabled={!(rowById.get(pickedIds.a) && rowById.get(pickedIds.b))} className="min-h-11 w-full rounded-lg bg-gold px-4 text-sm font-bold text-canvas transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">Compare players</button>
        </div>
      </div>
      {playerOptions.length < filtered.length && <p className="mt-3 text-xs text-muted-foreground">Showing 150 of {filtered.length.toLocaleString()} matching players — narrow the filters to see more.</p>}
    </section>
    <ChemRosterTable rows={filtered} onPick={pick} pickedIds={pickedIds} />
    {first && second && <div id="chem-pair-result" className="space-y-5">
      <ChemPairProfile first={first} second={second} dataset={dataset} chem={chem} />
      <ChemChallenge first={first} second={second} chem={chem} />
    </div>}
  </div>;
}