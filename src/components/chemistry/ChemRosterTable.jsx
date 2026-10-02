import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { formatMetric, formatTotal, rosterMetricValue } from './chemistryFormat';

const COLUMNS = [
  { key: 'team', label: 'Team', access: row => row.teamCode },
  { key: 'player', label: 'Player', access: row => row.displayName },
  { key: 'positions', label: 'Pos', access: row => (Array.isArray(row.positions) && row.positions.length ? row.positions.join('/') : '') },
  { key: 'games', label: 'GP', numeric: true, format: value => (value == null ? '—' : Math.round(value).toLocaleString()) },
  { key: 'minutesPerGame', label: 'MPG', numeric: true, format: value => formatMetric(value, 'rate') },
  { key: 'pointsPerGame', label: 'PPG', numeric: true, format: value => formatMetric(value, 'rate') },
  { key: 'assistsPerGame', label: 'APG', numeric: true, format: value => formatMetric(value, 'rate') },
  { key: 'reboundsPerGame', label: 'RPG', numeric: true, format: value => formatMetric(value, 'rate') },
  { key: 'trueShootingPct', label: 'TS%', numeric: true, format: value => formatMetric(value, 'fraction') },
];
const PAGE_SIZE = 40;

export default function ChemRosterTable({ rows, onPick, pickedIds }) {
  const [sort, setSort] = useState({ key: 'pointsPerGame', direction: 'descending' });
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    const list = [...rows];
    const column = COLUMNS.find(item => item.key === sort.key) || COLUMNS[0];
    list.sort((left, right) => {
      const leftValue = column.access ? column.access(left) : rosterMetricValue(left, column.key);
      const rightValue = column.access ? column.access(right) : rosterMetricValue(right, column.key);
      if (leftValue == null && rightValue == null) return 0;
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;
      const comparison = typeof leftValue === 'string' ? String(leftValue).localeCompare(String(rightValue)) : leftValue - rightValue;
      return sort.direction === 'ascending' ? comparison : -comparison;
    });
    return list;
  }, [rows, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const toggleSort = key => {
    setPage(0);
    setSort(current => {
      const numeric = COLUMNS.find(item => item.key === key)?.numeric;
      if (current.key !== key) return { key, direction: numeric ? 'descending' : 'ascending' };
      return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
    });
  };
  return <div className="court-panel overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
      <h4 className="font-display text-lg tracking-wide text-foreground">Player-season table</h4>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{sorted.length.toLocaleString()} rows · page {safePage + 1} of {pageCount}</p>
    </div>
    <div className="mt-2 overflow-x-auto">
      <table className="w-full" aria-label="Regular-season player stats">
        <thead>
          <tr>
            <th aria-label="Select player" />
            {COLUMNS.map(column => {
              const active = sort.key === column.key;
              return <th key={column.key} aria-sort={active ? sort.direction : undefined}>
                <button type="button" onClick={() => toggleSort(column.key)} className={`inline-flex items-center gap-1 transition-colors hover:text-gold ${active ? 'text-gold' : ''}`}>
                  {column.label}{active && (sort.direction === 'ascending' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                </button>
              </th>;
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map(row => <tr key={row.playerSeasonRef || row.id}>
            <td>
              <span className="flex gap-1">
                {['a', 'b'].map(slot => {
                  const picked = pickedIds[slot] === (row.playerSeasonRef || row.id);
                  return <button key={slot} type="button" onClick={() => onPick(slot, row)} aria-pressed={picked} aria-label={`Set ${row.displayName} as player ${slot === 'a' ? 'one' : 'two'}`} className={`flex h-6 w-6 items-center justify-center rounded-md border font-mono text-[10px] uppercase transition-colors ${picked ? 'border-gold/60 bg-gold/15 text-gold' : 'border-border/50 text-muted-foreground hover:border-gold/40 hover:text-gold'}`}>{slot}</button>;
                })}
              </span>
            </td>
            {COLUMNS.map(column => {
              if (column.key === 'player') return <td key={column.key} className="font-medium text-foreground">{row.displayName}</td>;
              if (column.key === 'team') return <td key={column.key} className="font-display tracking-wide text-gold">{row.teamCode}</td>;
              const value = column.access ? column.access(row) : rosterMetricValue(row, column.key);
              return <td key={column.key} className="text-muted-foreground">{column.access ? (value || '—') : column.format(value)}</td>;
            })}
          </tr>)}
          {!visible.length && <tr><td colSpan={COLUMNS.length + 1} className="py-6 text-center text-sm text-muted-foreground">No player rows match the current filters.</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="flex items-center justify-between border-t border-border/40 px-4 py-3">
      <button type="button" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={safePage === 0} className="flex min-h-9 items-center gap-1 rounded-lg border border-border/50 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Previous</button>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">40 rows per page</span>
      <button type="button" onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} disabled={safePage >= pageCount - 1} className="flex min-h-9 items-center gap-1 rounded-lg border border-border/50 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-40">Next<ChevronRight className="h-3.5 w-3.5" /></button>
    </div>
  </div>;
}