import React from 'react';
import { Loader2 } from 'lucide-react';

// Suspense fallback for the lazy-loaded workbench routes: a quiet broadcast
// card that matches the studio's court palette while a tool's bundle streams in.
export default function RouteFallback() {
  return <div className="grid min-h-[60vh] place-items-center bg-canvas">
    <div className="flex items-center gap-3 rounded-2xl border border-border/35 bg-card px-6 py-5 shadow-[0_8px_24px_hsl(var(--background)/0.2)]">
      <Loader2 className="h-5 w-5 animate-spin text-gold" />
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Loading workbench</p>
    </div>
  </div>;
}