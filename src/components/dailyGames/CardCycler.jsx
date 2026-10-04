import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// On phones the candidate cards stack far too tall, so the cycler shows one
// card at a time with prev/next controls; tablets and desktops keep the grid.
export default function CardCycler({ items, renderItem, className = '' }) {
  const [index, setIndex] = useState(0);
  const count = items.length;
  const safe = Math.min(index, count - 1);
  const cards = items.map((item, i) => renderItem(item, i));
  if (count === 0) return null;
  return (
    <div className={className}>
      <div className="dg-cycle sm:hidden">
        <div className="dg-cycle__bar">
          <button
            type="button"
            className="dg-cycle__nav"
            onClick={() => setIndex((safe - 1 + count) % count)}
            disabled={count < 2}
            aria-label="Previous candidate"
          ><ChevronLeft className="h-4 w-4" /></button>
          <div className="dg-cycle__dots" role="tablist" aria-label="Candidates">
            {cards.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`dg-cycle__dot ${i === safe ? 'is-on' : ''}`}
                onClick={() => setIndex(i)}
                aria-label={`Candidate ${i + 1}`}
                aria-current={i === safe}
              />
            ))}
          </div>
          <button
            type="button"
            className="dg-cycle__nav"
            onClick={() => setIndex((safe + 1) % count)}
            disabled={count < 2}
            aria-label="Next candidate"
          ><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div key={safe} className="dg-cycle__card">{cards[safe]}</div>
      </div>
      <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">{cards}</div>
    </div>
  );
}