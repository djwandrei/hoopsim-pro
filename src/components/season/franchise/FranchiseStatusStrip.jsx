import React from 'react';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';

// Top strip: worker status, quality pill, revision and state metric tiles,
// plus the shared alert banner for operation messages.
export default function FranchiseStatusStrip({ view }) {
  const { workerStatus, qualityPill, revision, stateMetrics, stateQuality, message } = view;
  return (
    <div className="space-y-3">
      <div className="court-panel flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <span className="frx-pill frx-pill--slate">
          <span className={`frx-status-dot ${workerStatus?.state === 'ready' ? 'frx-status-dot--ready' : workerStatus?.state === 'error' ? 'frx-status-dot--error' : workerStatus?.state === 'idle' && view.busy ? 'frx-status-dot--busy' : ''}`} aria-hidden="true" />
          {workerStatus?.text || 'Idle'}
        </span>
        <span className={`frx-pill frx-pill--${qualityPill?.kind === 'green' ? 'green' : 'amber'}`}>{qualityPill?.label}</span>
        <span className="frx-pill frx-pill--slate">{revision}</span>
        {view.busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" aria-hidden="true" />}
      </div>
      {message && (
        <div
          role="alert"
          aria-live="assertive"
          className={`flex items-start gap-3 rounded-xl border p-3 text-xs leading-relaxed ${message.kind === 'error' ? 'border-trim/40 bg-trim/10 text-trim-ink' : message.kind === 'loading' ? 'border-gold/40 bg-gold/10 text-gold' : 'border-gold/30 bg-gold/5 text-foreground/90'}`}
        >
          {message.kind === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="min-w-0">{message.text}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {stateMetrics.map(metric => (
          <div key={metric.label} className="metric-tile">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p>
            <p className="mt-1 font-display text-xl tracking-wide text-foreground" style={{ color: metric.value === '—' ? undefined : 'hsl(var(--court-accent))' }}>{metric.value}</p>
          </div>
        ))}
      </div>
      {stateQuality && <p className="frx-note">State quality: {stateQuality}</p>}
    </div>
  );
}