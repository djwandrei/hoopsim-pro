import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { TIER_META, TIER_ODDS, formatCardValue } from '@/lib/cards/packEngine';

// Pack history: the last twelve opened packs, kept in this browser only, with
// a per-tier filter and a running collection-value total.
export default function PackHistory({ history, onClear }) {
  const [tier, setTier] = useState('all');

  const totals = useMemo(() => {
    const cards = history.flatMap((entry) => entry.cards);
    const tierCounts = {};
    cards.forEach((card) => { const key = card.tier || 'base'; tierCounts[key] = (tierCounts[key] || 0) + 1; });
    const valueCents = cards.reduce((sum, card) => sum + (Number.isFinite(Number(card.valueCents)) ? Number(card.valueCents) : 0), 0);
    const bestRank = cards.reduce((best, card) => Math.max(best, TIER_ODDS.findIndex(([key]) => key === (card.tier || 'base'))), -1);
    return { packs: history.length, cards: cards.length, tierCounts, valueCents, best: bestRank >= 0 ? TIER_ODDS[bestRank][0] : null };
  }, [history]);

  const shown = useMemo(() => (tier === 'all' ? history
    : history
      .map((entry) => ({ ...entry, cards: entry.cards.filter((card) => (card.tier || 'base') === tier) }))
      .filter((entry) => entry.cards.length)), [history, tier]);

  const tiles = [
    ['Packs opened', totals.packs.toLocaleString()],
    ['Cards pulled', totals.cards.toLocaleString()],
    ['Collection value', formatCardValue(totals.valueCents) || '$0'],
    ['Best pull', totals.best ? TIER_META[totals.best].label : '—'],
  ];

  return <section className="court-panel space-y-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="court-kicker">Recap</p>
        <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">PACK HISTORY</h2>
      </div>
      {history.length > 0 && <button type="button" onClick={onClear} className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-2 text-[10.4px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-trim/50 hover:text-trim-ink"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Clear history</button>}
    </div>

    {history.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map(([label, value]) => <div key={label} className="rounded-xl border border-border/35 bg-raised/30 p-3">
        <p className="font-mono text-[10.4px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-lg text-foreground">{value}</p>
      </div>)}
    </div>}

    {history.length > 0 && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter pulls by tier">
      <button type="button" onClick={() => setTier('all')} aria-pressed={tier === 'all'} className={`rounded-full border px-2.5 py-1 font-mono text-[10.4px] font-semibold transition-colors ${tier === 'all' ? 'border-gold/50 bg-gold/10 text-gold' : 'border-border/40 bg-raised/30 text-muted-foreground hover:border-gold/40 hover:text-foreground'}`}>All ({totals.cards})</button>
      {TIER_ODDS.map(([key]) => {
        const meta = TIER_META[key];
        const count = totals.tierCounts[key] || 0;
        if (!count) return null;
        return <button key={key} type="button" onClick={() => setTier(tier === key ? 'all' : key)} aria-pressed={tier === key} className={`rounded-full border px-2.5 py-1 font-mono text-[10.4px] font-semibold transition-colors ${tier === key ? 'border-gold/50 bg-gold/10 text-gold' : 'border-border/40 bg-raised/30 text-muted-foreground hover:border-gold/40 hover:text-foreground'}`}>{meta.label} ({count})</button>;
      })}
    </div>}

    {shown.length
      ? <ul className="space-y-3">
        {shown.map((entry, entryIndex) => <li key={`${entry.openedAt}-${entryIndex}`} className="rounded-xl border border-border/35 bg-raised/25 p-3">
          <p className="mb-2 font-mono text-[10.4px] uppercase tracking-widest text-muted-foreground">{new Date(entry.openedAt).toLocaleString()} · {entry.cards.length} cards</p>
          <ul className="grid grid-cols-5 gap-2">
            {entry.cards.map((card, cardIndex) => {
              const meta = TIER_META[card.tier] || TIER_META.base;
              const value = formatCardValue(card.valueCents);
              return <li key={`${entry.openedAt}-${cardIndex}`} className="min-w-0">
                <div className="aspect-[3/4] overflow-hidden rounded-lg border border-border/35 bg-canvas/50">
                  {card.imageUrl
                    ? <Image src={card.imageUrl} alt={card.name} fittingType="fit" className="h-full w-full object-contain" />
                    : <div className="grid h-full place-items-center font-display text-lg text-muted-foreground">CARD</div>}
                </div>
                <p className="mt-1 truncate text-[10.4px] text-foreground">{card.player}</p>
                <p className="truncate font-mono text-[10.4px]"><span className={meta.chip.split(' ').find(cls => cls.startsWith('text-')) || 'text-muted-foreground'}>{meta.label}</span>{value && <span className="ml-1 text-gold">{value}</span>}</p>
              </li>;
            })}
          </ul>
        </li>)}
      </ul>
      : history.length
        ? <p className="rounded-xl border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">No {tier === 'all' ? '' : `${TIER_META[tier].label.toLowerCase()} `}pulls in the saved history.</p>
        : <p className="rounded-xl border border-dashed border-border/40 p-4 text-xs text-muted-foreground">Opened packs will appear here. History stays in this browser.</p>}
  </section>;
}