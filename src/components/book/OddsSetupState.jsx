import React from 'react';
import { KeyRound, RefreshCcw } from 'lucide-react';

// Shown while the live odds feed has no API key: the room's bet tracking still
// works, but real money lines need ODDS_API_KEY in the dashboard Secrets page.
export default function OddsSetupState({ onRetry }) {
  return <section className="court-panel p-6" aria-label="Odds feed setup">
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-gold/10"><KeyRound className="h-5 w-5 text-gold" aria-hidden="true" /></span>
      <div className="min-w-0">
        <h3 className="font-display text-lg tracking-wide text-foreground">Connect the live odds feed</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Real money lines, spreads and totals stream from The Odds API. Add your key and the board fills in instantly.</p>
      </div>
    </div>
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-muted-foreground">
      <li>Create a free key at <a href="https://the-odds-api.com" target="_blank" rel="noreferrer" className="text-gold underline hover:text-goldSoft">the-odds-api.com</a> — the free tier covers 500 requests a month.</li>
      <li>Open the app dashboard → <strong className="text-foreground">Secrets</strong> page.</li>
      <li>Add a secret named <code className="font-mono text-gold">ODDS_API_KEY</code> with your key, then retry below.</li>
    </ol>
    {onRetry && <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20">
      <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry connection
    </button>}
  </section>;
}