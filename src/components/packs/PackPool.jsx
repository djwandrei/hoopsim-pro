import React from 'react';
import { Image } from '@/components/ui/image';
import { MAX_PACK_OPENING_POOL_SIZE } from '@/lib/cards/packModel';

// Step 2: the declared eligible pool for the simulated pack.
export default function PackPool({ pool, onRemove }) {
  return (
    <section className="court-panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="court-kicker">Step 2</p>
          <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">DECLARE THE ELIGIBLE POOL</h2>
        </div>
        <span className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1 font-mono text-[10px] text-gold">{pool.length} / {MAX_PACK_OPENING_POOL_SIZE} cards</span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">A card needs a verified player match before you can add it. One physical card is one draw entry, even if it shows more than one player.</p>
      {pool.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/40 p-4 text-xs text-muted-foreground">No cards in your pool yet. Find a player match, then add a card.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {pool.map(card => <li key={card.product.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-raised/30 p-2">
            {card.product.image
              ? <Image src={card.product.image} alt="" fittingType="fit" className="h-12 w-12 shrink-0 rounded object-contain" loading="lazy" />
              : <span className="grid h-12 w-12 shrink-0 place-items-center rounded bg-raised font-mono text-[10px] text-muted-foreground">CARD</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-foreground">{card.product.name}</span>
              <span className="block truncate font-mono text-[10px] text-gold">{card.mappings.map(mapping => mapping.player.name).filter((name, index, all) => all.indexOf(name) === index).join(' · ')}</span>
            </span>
            <button type="button" onClick={() => onRemove(card.product.id)} aria-label={`Remove ${card.product.name} from the pool`} className="shrink-0 rounded-lg border border-border/50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-trim/50 hover:text-trim-ink">Remove</button>
          </li>)}
        </ul>
      )}
    </section>
  );
}