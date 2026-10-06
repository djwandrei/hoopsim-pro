import React from 'react';
import { Image } from '@/components/ui/image';

// One catalog card tile: image, title, price/context line, optional verified
// player chips, and an optional footer/action row.
export default function CardTile({ card, chips = [], footer = null, action = null }) {
  return (
    <article className="court-panel court-panel-hover flex min-w-0 flex-col overflow-hidden">
      <div className="relative aspect-[4/3] w-full bg-raised/40">
        {card.image ? (
          <Image src={card.image} alt={card.name} fittingType="fit" className="h-full w-full object-contain" loading="lazy" />
        ) : <div className="grid h-full place-items-center font-display text-3xl text-muted-foreground">CARD</div>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <h3 className="text-sm font-semibold leading-snug text-foreground">{card.name}</h3>
        <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {card.displayPrice && <span className="font-mono font-semibold text-gold">{card.displayPrice}</span>}
          {card.team && <span>{card.team}</span>}
          {card.condition && <span>{card.condition}</span>}
          {Number.isFinite(card.year) && card.year ? <span>{card.year}</span> : null}
        </p>
        {chips.length > 0 && <ul className="flex flex-wrap gap-1">{chips.map((chip, index) => <li key={index} className="rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 font-mono text-[10px] leading-snug text-gold">{chip}</li>)}</ul>}
        {(action || footer) && <div className="mt-auto flex items-center justify-between gap-2 pt-1">{footer}{action}</div>}
      </div>
    </article>
  );
}