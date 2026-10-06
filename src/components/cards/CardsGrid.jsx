import React from 'react';

// Shared catalog results section: heading + count, optional note, the tile
// grid, and the "show more" control the pages wire to their own paging.
export default function CardsGrid({ title, count, note, tiles, empty, onShowMore, showMoreLabel = 'Show more', showMoreDisabled = false }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl tracking-wide text-foreground">{title}</h2>
        {count != null && count !== '' && <span className="font-mono text-xs text-gold">{count}</span>}
      </div>
      {note && <p className="text-[11px] leading-relaxed text-muted-foreground">{note}</p>}
      {tiles.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{tiles}</div> : empty}
      {onShowMore && <button type="button" onClick={onShowMore} disabled={showMoreDisabled} className="mx-auto flex items-center gap-2 rounded-lg border border-border/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40">{showMoreLabel}</button>}
    </section>
  );
}