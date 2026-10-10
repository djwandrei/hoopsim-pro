import React, { useState } from 'react';
import { ChevronDown, Loader2, UserRound } from 'lucide-react';
import { formatOdds } from '@/components/book/betsMath';

const initials = name => (name || '?').split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join('');

// Player props, restructured for a clear hierarchy: one block per player —
// initial roundel, name and stat type on the left, that player's line options
// as a price grid on the right — so players separate cleanly and each stat
// type reads as its own row. Shared by the play-money and real-money books.
export default function PropsSection({ game, format, onPick, disabled = false, bookFilter = '', state = 'ready', onLoad }) {
  const props = (game?.props || []).map(entry => ({
    ...entry, options: (entry.options || []).filter(option => !bookFilter || option.bookKey === bookFilter),
  })).filter(entry => entry.options.length);
  const [open, setOpen] = useState(false);
  if (!props.length && !onLoad) return null;
  const toggle = () => {
    if (!open) onLoad?.();
    setOpen(value => !value);
  };
  const pick = (entry, option) => onPick({
    eventKey: game.eventKey, matchup: `${game.away} @ ${game.home}`, commenceTime: game.commenceTime,
    market: 'prop', propPlayer: entry.player, propLine: option.line, propStat: entry.stat || 'points', propAthleteId: entry.athleteId,
    label: `${entry.player} ${option.line}+ ${entry.statShort || 'pts'}`, price: option.price, book: option.book || entry.book || 'Book not named',
  });
  return <div className="mt-3 border-t border-border/30 pt-2">
    <button type="button" onClick={toggle} className="flex w-full items-center gap-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-gold transition-colors hover:text-goldSoft" aria-expanded={open}>
      <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />Player props{state === 'ready' && props.length ? ` · ${props.reduce((sum, entry) => sum + entry.options.length, 0)}` : ''}
      <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {open && state === 'loading' && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Loading ESPN player milestones…</p>}
    {open && state === 'error' && <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground" role="status"><span>ESPN player props could not be refreshed.</span><button type="button" onClick={onLoad} className="font-semibold text-gold underline underline-offset-2">Retry</button></div>}
    {open && state === 'ready' && !props.length && <p className="mt-3 text-xs text-muted-foreground" role="status">ESPN has no player milestone prices available for this game{bookFilter ? ' at the selected book' : ''}.</p>}
    {open && state === 'ready' && props.length > 0 && <div className="mt-2 max-h-[32rem] divide-y divide-border/25 overflow-y-auto rounded-xl border border-border/25 bg-raised/20">
      {props.map(entry => <div key={`${entry.athleteId || entry.player}-${entry.stat || 'points'}`} className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex w-full shrink-0 items-center gap-2.5 sm:w-44">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-display text-xs text-gold" aria-hidden="true">{initials(entry.player)}</span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-foreground">{entry.player}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{entry.statLabel || 'Points'} · milestones</span>
          </span>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-1.5 sm:grid-cols-4">
          {entry.options.map(option => <button key={`${entry.player}-${entry.stat || 'points'}-${option.line}-${option.bookKey || option.book}`} type="button" onClick={() => pick(entry, option)} disabled={disabled}
            title={disabled ? 'Wagering is disabled because the current game status is unavailable.' : option.book}
            className="book-price-btn !min-h-0 !gap-0.5 !px-2 !py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Add ${entry.player} ${option.line}+ ${entry.statLabel || 'points'} at ${formatOdds(option.price, format)}`}>
            <span className="book-price-btn__label">{option.line}+ {entry.statShort || 'pts'}</span>
            <span className="book-price-btn__price">{formatOdds(option.price, format)}</span>
          </button>)}
        </div>
      </div>)}
    </div>}
  </div>;
}
