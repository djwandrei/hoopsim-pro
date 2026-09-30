import React from 'react';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import SeasonSelect from '@/components/studio/SeasonSelect';
export default function SourceStatus({ state, error, source, year, years, onYearChange, onRetry, disabled }) {
  const ready = state === 'ready';
  return (
    <section className="court-panel px-4 py-3" aria-label="Data source and season">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {state === 'loading' || state === 'idle' ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-gold" /> : <Database className="mt-0.5 h-4 w-4 shrink-0 text-gold" />}
          <div className="min-w-0" role="status" aria-live="polite"><p className="text-xs font-medium text-foreground">{ready ? `${year}–${year + 1} · Regular season · Observed source` : state === 'error' ? 'Season data unavailable' : 'Loading published season data'}</p><p className="mt-1 break-words text-xs text-muted-foreground">{ready ? source?.entry?.packageId : state === 'error' ? error : 'Controls remain available while the source loads.'}</p></div>
        </div>
        {onYearChange && <div className="w-36"><SeasonSelect years={years} year={year} onChange={onYearChange} disabled={disabled || state === 'loading'} /></div>}
        {state === 'error' && onRetry && <button type="button" onClick={onRetry} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-input px-3 text-xs text-foreground hover:bg-raised"><RefreshCw className="h-3.5 w-3.5" />Retry source</button>}
      </div>
      {ready && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer text-goldSoft">Package identity & evidence limits</summary><dl className="mt-2 space-y-2 break-all"><div><dt>Version</dt><dd className="font-mono text-foreground">{source?.entry?.packageVersion}</dd></div>{['packageManifestSha256','sourceLockSha256','projectionContentSha256'].map(key => source?.entry?.[key] && <div key={key}><dt>{key}</dt><dd className="font-mono text-foreground">{source.entry[key]}</dd></div>)}<div><dt>Registry revision</dt><dd className="font-mono text-foreground">{source?.registry?.registryRevisionSha256 || 'Not supplied'}</dd></div></dl><p className="mt-3">These are source-reported identities. Local simulation output is not observed evidence or a validated forecast.</p></details>}
    </section>
  );
}