import React from 'react';
import { RefreshCcw } from 'lucide-react';
import WorkbenchState from '@/components/studio/WorkbenchState';

// Career archive status: the shared workbench status artwork, plus the retry
// control and error line when the pooled archive fails to load.
export default function CareerArchiveStatus({ state, error, retry }) {
  return <>
    <WorkbenchState state={state} />
    {state === 'error' && <section className="court-panel flex flex-wrap items-center gap-x-4 gap-y-3 p-4" aria-label="Career archive controls">
      <p className="bcast-kicker">Career archive</p>
      {error && <p role="alert" className="min-w-0 flex-1 text-xs leading-relaxed text-trim-ink">{error}</p>}
      {retry && <button type="button" onClick={retry} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20">
        <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry load
      </button>}
    </section>}
  </>;
}