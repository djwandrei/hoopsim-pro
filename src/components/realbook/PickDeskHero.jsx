import React from 'react';
import { Banknote, Circle, Loader2 } from 'lucide-react';

// Kept as a semantic export for callers that used the old hero contract. The
// emblem is rendered locally so the BookRoom never depends on a hosted editor
// image or an external platform asset.
export const PICK_DESK_LOGO = 'banknote';

const chip = 'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest';

// Pick Desk hero: mockup-style broadcast header shared by both books —
// breadcrumb, giant display title, gold rule, call-to-action line and the
// copper studio logo as the hero emblem. Balance/status/description are
// caller-provided so the play-money and real-money books stay in sync.
export default function PickDeskHero({ games, balance, status, state, title = 'PICK DESK.', crumb = 'PICK DESK', description = 'Real-money lines shopped across books, featured model edges and a server-settled ledger — 21+ and licensed-state gated, with every balance, price and outcome enforced server-side.' }) {
  const gameCount = games ? games.length : null;
  const liveCount = games ? games.filter(game => Date.parse(game.commenceTime) <= Date.now()).length : null;
  return <header className="relative overflow-hidden border-b border-border/40 bg-canvas">
    <div className="pointer-events-none absolute -right-16 -top-16 flex h-96 w-96 items-center justify-center opacity-[0.06]" aria-hidden="true">
      <Banknote className="h-72 w-72 text-gold" strokeWidth={1} />
    </div>
    <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">DJHC <span className="mx-2 text-gold">/</span> <span className="text-foreground">{crumb}</span></p>
        {status && <span className={state === 'error' ? `${chip} border border-trim/40 bg-trim/10 text-foreground` : `${chip} border border-gold/30 bg-gold/5 text-gold`}>{state === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : state === 'ready' ? <span className="h-2 w-2 rounded-full bg-positive" aria-hidden="true" /> : <Circle className="h-2 w-2 fill-current" aria-hidden="true" />}{status}</span>}
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 max-w-2xl">
          <h1 className="broadcast-gradient-text font-display text-6xl leading-none tracking-wide sm:text-7xl">{title}</h1>
          <span className="hero-rule mt-3" aria-hidden="true" />
          <p className="mt-4 font-display text-xl uppercase tracking-wide text-foreground">Make your next call.</p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">{description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`${chip} bg-raised text-foreground`}>{gameCount == null ? '—' : gameCount} games on the board</span>
            <span className={`${chip} bg-gold/15 text-gold`}>{liveCount ? `${liveCount} live now` : 'Live lines'}</span>
            <span className={`${chip} bg-raised text-foreground`}>Server-settled</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <span className="flex h-32 w-32 items-center justify-center rounded-3xl border border-gold/25 bg-gold/5 text-gold sm:h-40 sm:w-40" aria-label="Pick Desk">
            <Banknote className="h-20 w-20 sm:h-24 sm:w-24" strokeWidth={1.25} aria-hidden="true" />
          </span>
          {balance}
        </div>
      </div>
    </div>
  </header>;
}
