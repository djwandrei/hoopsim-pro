import React from 'react';
import { Dices, Loader2, Lock, RotateCcw } from 'lucide-react';
import { MAX_PACK_OPENING_SIZE, PACK_OPENING_ALGORITHM, PACK_OPENING_RULESET } from '@/lib/cards/packModel';
import { Image } from '@/components/ui/image';

const PACK_SIZES = [1, 3, 5, 10];

// Step 3: draw configuration, the latest draw, and the replay receipt.
// The seed is always system-generated; it is shown read-only so the receipt
// stays replayable without letting anyone pre-edit a draw.
export default function PackDrawStage({ poolCount, packSize, onPackSize, seed, onNewSeed, onOpen, busy, openStatus, receipt, drawnCards }) {
  return (
    <section className="court-panel space-y-4 p-4">
      <div>
        <p className="court-kicker">Step 3</p>
        <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">SET THE DRAW</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="studio-control-label">Cards in this simulated pack</span>
          <select value={packSize} onChange={event => onPackSize(Number(event.target.value))} className="studio-select">
            {PACK_SIZES.map(size => <option key={size} value={size} disabled={size > poolCount}>{size} card{size === 1 ? '' : 's'}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="studio-control-label">Replay seed (system generated)</span>
          <span className="flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-raised/40 px-3 py-2 font-mono text-xs text-foreground"><Lock className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden="true" /><span className="truncate">{seed}</span></span>
            <button type="button" onClick={onNewSeed} className="shrink-0 rounded-lg border border-border/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />New seed</button>
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onOpen} disabled={busy || poolCount < 1 || poolCount < packSize} className="book-cta inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-gold to-goldSoft px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-canvas shadow-lg shadow-gold/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Dices className="h-4 w-4" aria-hidden="true" />}Open simulated pack
        </button>
        <p className="text-[11px] text-muted-foreground">{openStatus}</p>
      </div>
      <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">Ruleset {PACK_OPENING_RULESET} · Algorithm {PACK_OPENING_ALGORITHM}. The seed, pool product IDs and drawn IDs form the replay receipt below; a seed is not a secure random guarantee.</p>
      <div className="space-y-2">
        <h3 className="font-display text-xl tracking-wide text-foreground">LATEST DRAW</h3>
        {drawnCards.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {drawnCards.map(card => <li key={card.product.id} className="slot-pop">
              <div className="court-panel overflow-hidden">
                <div className="aspect-[4/3] bg-raised/40">{card.product.image ? <Image src={card.product.image} alt={card.product.name} fittingType="fit" className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center font-display text-2xl text-muted-foreground">CARD</div>}</div>
                <p className="p-2 text-[11px] font-semibold leading-snug text-foreground">{card.product.name}</p>
              </div>
            </li>)}
          </ul>
        ) : <p className="rounded-xl border border-dashed border-border/40 p-4 text-xs text-muted-foreground">Your card results will appear here after a draw.</p>}
      </div>
      <div className="space-y-2">
        <h3 className="font-display text-xl tracking-wide text-foreground">REPLAY RECEIPT</h3>
        {receipt ? <pre className="overflow-x-auto rounded-xl border border-border/40 bg-canvas/60 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">{JSON.stringify(receipt, null, 2)}</pre>
          : <p className="rounded-xl border border-dashed border-border/40 p-4 text-xs text-muted-foreground">No simulation receipt yet.</p>}
      </div>
    </section>
  );
}