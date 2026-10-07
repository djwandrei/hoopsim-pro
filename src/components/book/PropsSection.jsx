import React, { useState } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import { formatOdds } from '@/components/book/betsMath';

const initials = name => (name || '?').split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join('');

// Player props, restructured for a clear hierarchy: one block per player —
// initial roundel, name and stat type on the left, that player's line options
// as a price grid on the right — so players separate cleanly and each stat
// type reads as its own row. Shared by the play-money and real-money books.
export default function PropsSection({ game, format, onPick }) {
  const props = game?.props || [];
  const [open, setOpen] = useState(false);
  if (!props.length) return null;
  const pick = (entry, option) => onPick({
    eventKey: game.eventKey, matchup: `${game.away} @ ${game.home}`, commenceTime: game.commenceTime,
    market: 'prop', propPlayer: entry.player, propLine: option.line,
    label: `${entry.player} ${option.line}+ pts`, price: option.price, book: 'ESPN',
  });
  return <div className="mt-3 border-t border-border/30 pt-2">
    <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center gap-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-gold transition-colors hover:text-goldSoft" aria-expanded={open}>
      <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />Player props · {props.reduce((sum, entry) => sum + entry.options.length, 0)}
      <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {open && <div className="mt-2 divide-y divide-border/25 overflow-hidden rounded-xl border border-border/25 bg-raised/20">
      {props.map(entry => <div key={entry.player} className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex w-full shrink-0 items-center gap-2.5 sm:w-44">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-display text-xs text-gold" aria-hidden="true">{initials(entry.player)}</span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-foreground">{entry.player}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Points · line</span>
          </span>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-1.5 sm:grid-cols-4">
          {entry.options.map(option => <button key={`${entry.player}-${option.line}`} type="button" onClick={() => pick(entry, option)}
            className="book-price-btn !min-h-0 !gap-0.5 !px-2 !py-1.5"
            aria-label={`Add ${entry.player} ${option.line}+ points at ${formatOdds(option.price, format)}`}>
            <span className="book-price-btn__label">{option.line}+ pts</span>
            <span className="book-price-btn__price">{formatOdds(option.price, format)}</span>
          </button>)}
        </div>
      </div>)}
    </div>}
  </div>;
}