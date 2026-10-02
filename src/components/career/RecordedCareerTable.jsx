import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';

const BARS = { pts: 'bg-gold/80', reb: 'bg-royal/70', ast: 'bg-positive/70' };

export default function RecordedCareerTable({ seasons }) {
  const [sort, setSort] = useState({ key: 'year', direction: 1 });
  const headers = [['year', 'SEASON'], ['teams', 'TEAMS'], ['games', 'GP'], ['minutes', 'MIN'], ['pts', 'PTS/G'], ['reb', 'REB/G'], ['ast', 'AST/G']];
  const rows = [...seasons].sort((a, b) => {
    const left = a[sort.key], right = b[sort.key];
    if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
    if (!Number.isFinite(right)) return -1;
    return (left - right) * sort.direction;
  });
  const change = key => setSort(current => ({ key, direction: current.key === key ? -current.direction : key === 'year' ? 1 : -1 }));
  const text = value => Number.isFinite(value) ? value.toFixed(1) : '—';
  const careerRate = key => {
    const usable = seasons.filter(row => Number.isFinite(row[key]));
    const exposure = usable.reduce((sum, row) => sum + row.games, 0);
    return exposure ? usable.reduce((sum, row) => sum + row[key] * row.games, 0) / exposure : null;
  };
  const maxes = Object.fromEntries(['pts', 'reb', 'ast'].map(key => [key, Math.max(...seasons.map(row => Number.isFinite(row[key]) ? row[key] : 0), 0)]));
  const totals = { games: seasons.reduce((sum, row) => sum + row.games, 0), minutes: seasons.reduce((sum, row) => sum + (Number.isFinite(row.minutes) ? row.minutes : 0), 0) };
  const distinctTeams = new Set(seasons.flatMap(row => row.teams)).size;
  const bar = (row, key) => {
    if (!Number.isFinite(row[key]) || !maxes[key]) return null;
    return <span className="mt-1 block h-1 w-14 overflow-hidden rounded-full bg-border/30"><span className={`block h-full rounded-full ${BARS[key]}`} style={{ width: `${Math.round(row[key] / maxes[key] * 100)}%` }} /></span>;
  };
  return <section className="court-panel p-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="court-kicker">The evidence ledger</p><h2 className="mt-1 font-display text-2xl">SEASON-BY-SEASON HISTORY</h2></div>
      <span className="text-[11px] text-muted-foreground">Click a column to sort · bars scale to each column's best season</span>
    </header>
    <div className="mt-5 max-h-[32rem] overflow-auto" tabIndex={0} aria-label="Recorded career history">
      <table className="w-full text-xs">
        <thead><tr>{headers.map(([key, label]) => <th key={key} scope="col" aria-sort={sort.key === key ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined} className={key === 'year' || key === 'teams' ? 'text-left' : 'text-right'}>
          {key === 'teams' ? label : <button type="button" onClick={() => change(key)} className="inline-flex min-h-8 items-center gap-1.5 hover:text-gold" aria-label={`Sort by ${label}`}>
            {label}{sort.key === key ? (sort.direction === 1 ? <ArrowUp className="h-3 w-3 text-gold" /> : <ArrowDown className="h-3 w-3 text-gold" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
          </button>}
        </th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.year}>
          <td className="font-medium">{row.label}</td>
          <td><span className="flex flex-wrap items-center gap-2">{row.teams.map(team => <span key={team} className="flex items-center gap-1"><TeamMark code={team} className="h-9 w-9" />{team}</span>)}</span></td>
          <td className="text-right font-mono">{row.games}</td>
          <td className="text-right font-mono text-muted-foreground">{Number.isFinite(row.minutes) ? Math.round(row.minutes).toLocaleString() : '—'}</td>
          <td className="text-right">{Number.isFinite(row.pts) ? <span className="inline-flex flex-col items-end"><span className="font-mono text-gold">{text(row.pts)}</span>{bar(row, 'pts')}</span> : <span className="font-mono text-muted-foreground">—</span>}</td>
          <td className="text-right">{Number.isFinite(row.reb) ? <span className="inline-flex flex-col items-end"><span className="font-mono">{text(row.reb)}</span>{bar(row, 'reb')}</span> : <span className="font-mono text-muted-foreground">—</span>}</td>
          <td className="text-right">{Number.isFinite(row.ast) ? <span className="inline-flex flex-col items-end"><span className="font-mono">{text(row.ast)}</span>{bar(row, 'ast')}</span> : <span className="font-mono text-muted-foreground">—</span>}</td>
        </tr>)}</tbody>
        {Boolean(rows.length) && <tfoot><tr className="border-t border-gold/30 bg-canvas/40">
          <td className="font-display tracking-wide text-gold">CAREER</td>
          <td className="text-[10px] text-muted-foreground">{distinctTeams} teams</td>
          <td className="text-right font-mono text-gold">{totals.games.toLocaleString()}</td>
          <td className="text-right font-mono text-gold">{totals.minutes ? Math.round(totals.minutes).toLocaleString() : '—'}</td>
          <td className="text-right font-mono text-gold">{text(careerRate('pts'))}</td>
          <td className="text-right font-mono text-gold">{text(careerRate('reb'))}</td>
          <td className="text-right font-mono text-gold">{text(careerRate('ast'))}</td>
        </tr></tfoot>}
      </table>
      {!rows.length && <p className="p-6 text-center text-sm text-muted-foreground">No recorded seasons are available for this player.</p>}
    </div>
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Rates are game-weighted across supplied team stints. A missing metric remains unavailable; GP and minutes describe archive coverage, not a lifetime total.</p>
  </section>;
}