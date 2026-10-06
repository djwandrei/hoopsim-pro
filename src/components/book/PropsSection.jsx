import React, { useState } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import { formatOdds } from '@/components/book/betsMath';

// Player prop milestones (ESPN keyless feed): "N+ points" per athlete,
// rendered as one-click chips shared by the play-money and real-money books.
export default function PropsSection({ game, format, onPick }) {
  const props = game?.props || [];
  const [open, setOpen] = useState(false);
  if (!props.length) return null;
  return <div className="mt-3 border-t border-border/30 pt-2">
    <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center gap-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-gold transition-colors hover:text-goldSoft" aria-expanded={open}>
      <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />Player props · {props.reduce((sum, entry) => sum + entry.options.length, 0)}
      <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {open && <div className="mt-2 flex flex-wrap gap-1.5">
      {props.flatMap(entry => entry.options.map(option => <button key={`${entry.player}-${option.line}`} type="button"
        onClick={() => onPick({
          eventKey: game.eventKey, matchup: `${game.away} @ ${game.home}`, commenceTime: game.commenceTime,
          market: 'prop', propPlayer: entry.player, propLine: option.line,
          label: `${entry.player} ${option.line}+ pts`, price: option.price, book: 'ESPN',
        })}
        className="book-price-btn !min-h-0 !flex-row !gap-2 !px-2.5 !py-1.5"
        aria-label={`Add ${entry.player} ${option.line}+ points at ${formatOdds(option.price, format)}`}>
        <span className="book-price-btn__label">{entry.player} {option.line}+ pts</span>
        <span className="book-price-btn__price">{formatOdds(option.price, format)}</span>
      </button>))}
    </div>}
  </div>;
}