import React from 'react';
import { LoaderCircle, RefreshCcw } from 'lucide-react';

export default function LineupBootStatus({ loading, error }) {
  if (error) return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-3xl tracking-wide">NBA Lineup Lab</h1>
      <p role="alert" className="mt-3 text-sm text-muted-foreground">{error}</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold hover:bg-gold/20">
        <RefreshCcw className="h-3.5 w-3.5" /> Retry
      </button>
    </div>
  );
  return loading ? (
    <p role="status" className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
      <LoaderCircle className="h-4 w-4 animate-spin" /> Loading NBA Lineup Lab…
    </p>
  ) : null;
}