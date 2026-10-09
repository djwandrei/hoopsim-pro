import React from 'react';
import { RadioTower, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';

// The local replacement keeps the play-money shell while the separate odds
// backend is planned. It never invents sportsbook prices or calls an external app service.
export default function OddsSetupState({ onRetry }) {
  return <section className="court-panel p-6" aria-label="Odds feed setup">
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-gold/10"><RadioTower className="h-5 w-5 text-gold" aria-hidden="true" /></span>
      <div className="min-w-0">
        <h3 className="font-display text-lg tracking-wide text-foreground">Odds backend planned</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The local Studio build does not show live sportsbook prices. The play-money wallet remains available for local UI testing, and the odds service will be connected separately.</p>
      </div>
    </div>
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">No live lines, paid credits, or wager settlement requests are sent from this build. For a local result, use the deterministic Game Lab simulator.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Link to="/sims/game" className="inline-flex items-center rounded-lg bg-gold px-4 py-2 text-xs font-semibold uppercase tracking-widest text-canvas transition-colors hover:bg-goldSoft">Open local Game Lab</Link>
      {onRetry && <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20">
        <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry connection
      </button>}
    </div>
  </section>;
}
