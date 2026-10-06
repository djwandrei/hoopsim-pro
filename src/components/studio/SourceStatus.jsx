import React from 'react';
import { RefreshCcw } from 'lucide-react';
import WorkbenchState from '@/components/studio/WorkbenchState';

// The workbench source panel: the status artwork while data loads or fails,
// plus the working controls the status copy points at — season picker, error
// line, and retry. Props pages don't supply are simply omitted.
export default function SourceStatus({ state, error, year, years, onYearChange, onRetry }) {
  const controls = state !== 'ready' && Boolean(error || onRetry || (years?.length && onYearChange));
  return <>
    <WorkbenchState state={state} />
    {controls && <section className="court-panel flex flex-wrap items-center gap-x-4 gap-y-3 p-4" aria-label="Season source controls">
      <p className="bcast-kicker">Season source</p>
      {error && <p role="alert" className="min-w-0 flex-1 text-xs leading-relaxed text-trim-ink">{error}</p>}
      {years?.length && onYearChange && <select
        className="studio-select w-auto min-w-36"
        value={year}
        aria-label="Season"
        onChange={event => onYearChange(Number(event.target.value))}
      >
        {years.map(value => <option key={value} value={value}>{value}–{String(value + 1).slice(2)}</option>)}
      </select>}
      {onRetry && <button type="button" onClick={onRetry} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20">
        <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry load
      </button>}
    </section>}
  </>;
}