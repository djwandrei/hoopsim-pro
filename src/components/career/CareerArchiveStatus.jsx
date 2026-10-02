import React from 'react';
import { Database, Loader2 } from 'lucide-react';
import WorkbenchState from '@/components/studio/WorkbenchState';
export default function CareerArchiveStatus({ source, state, error, retry }) {
  return <><section className="court-panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10">
        {state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin text-gold" /> : <Database className="h-4 w-4 text-gold" />}
      </span>
      <div role="status">
        <p className="text-xs font-medium">{state === 'ready' ? 'Pooled 2017–26 · Recorded regular-season history' : state === 'error' ? 'Career archive unavailable' : 'Loading the original career archive…'}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{state === 'ready' ? `${source.entry.packageId} · Public copy ${source.sourceReceipt.copiedAt}` : error}</p>
      </div>
    </div>
    {state === 'error' && <button type="button" onClick={retry} className="min-h-11 rounded-lg border border-input px-4 text-xs transition-colors hover:border-gold/50 hover:text-gold">Retry archive</button>}
    {state === 'ready' && <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" />Forecasts unavailable in the source release</span>}
  </section><WorkbenchState state={state} /></>;
}