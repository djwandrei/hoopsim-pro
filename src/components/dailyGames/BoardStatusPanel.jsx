import React from 'react';
import { AlertTriangle, CircleOff, Loader2, RefreshCcw } from 'lucide-react';

const COPY = {
  loading: { title: 'Loading the exact board', detail: 'Verifying the published registry, package pins, and board hash before anything is shown.' },
  'board-unavailable': { title: 'Board not published yet', detail: 'This exact SwishIQ board is not published yet. No older season, pooled package, or substitute score is used.' },
  'board-invalid': { title: 'Board failed verification', detail: 'The published board did not pass its registry, package-pin, or hash checks. Nothing is shown without verification.' },
  'evaluator-unavailable': { title: 'Result evaluator unavailable', detail: 'This exact SwishIQ board is published, but its private result evaluator is not available yet. No substitute score is used.' },
  'verification-error': { title: 'Verification error', detail: 'The result could not be verified against the shared evaluator contract. No substitute score is used.' },
};

export default function BoardStatusPanel({ state, error, onRetry }) {
  if (state === 'ready') return null;
  const copy = COPY[state] || COPY.loading;
  const isError = state !== 'loading';
  const Icon = state === 'loading' ? Loader2 : state === 'board-unavailable' ? CircleOff : AlertTriangle;
  return (
    <section className={`dg-status ${isError ? 'dg-status--error' : 'dg-status--loading'}`} role="status">
      <Icon className={`h-5 w-5 shrink-0 ${state === 'loading' ? 'animate-spin text-gold' : 'text-trim'}`} />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl tracking-wide">{copy.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{error ? `${copy.detail} (${error.message})` : copy.detail}</p>
      </div>
      {onRetry && isError && (
        <button type="button" onClick={onRetry} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold hover:bg-gold/20">
          <RefreshCcw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </section>
  );
}