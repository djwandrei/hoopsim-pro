import React from 'react';
import { Trash2 } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { TIER_META, formatCardValue } from '@/lib/cards/packEngine';

// Pack history: the last twelve opened packs, kept in this browser only.
export default function PackHistory({ history, onClear }) {
  return <section className="court-panel space-y-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="court-kicker">Recap</p>
        <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">PACK HISTORY</h2>
      </div>
      {history.length > 0 && <button type="button" onClick={onClear} className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-2 text-[10.4px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-trim/50 hover:text-trim-ink"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Clear history</button>}
    </div>
    {history.length
      ? <ul className="space-y-3">
        {history.map((entry, entryIndex) => <li key={`${entry.openedAt}-${entryIndex}`} className="rounded-xl border border-border/35 bg-raised/25 p-3">
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
      : <p className="rounded-xl border border-dashed border-border/40 p-4 text-xs text-muted-foreground">Opened packs will appear here. History stays in this browser.</p>}
  </section>;
}