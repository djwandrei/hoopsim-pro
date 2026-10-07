import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Native sim failures are recoverable — a fresh seed or a retry usually
// resolves them — so the banner pairs the message with a retry hint.
export default function SimErrorBanner({ error }) {
  if (!error) return null;
  return (
    <section className="myna-panel flex items-center gap-3 px-4 py-3 text-[11px] font-semibold tracking-[0.06em] text-[var(--myna-accent)]" role="alert" aria-live="assertive">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0">{error} — try again; a fresh seed often resolves a stalled sim.</span>
    </section>
  );
}