import React from 'react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { X } from 'lucide-react';
export default function BucketBoard({ buckets, picks, activeKey, onActivate, onUndo, complete }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{buckets.map(bucket => {
    const pick = picks[bucket.key];
    const active = !complete && !pick && activeKey === bucket.key;
    return <div key={bucket.key} onClick={() => !pick && onActivate(bucket.key)} role={pick ? undefined : 'button'} aria-pressed={active} tabIndex={pick ? -1 : 0} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !pick) { event.preventDefault(); onActivate(bucket.key); } }} className={`rounded-xl border p-3 transition-colors ${pick ? 'border-gold/35 bg-gold/5' : active ? 'cursor-pointer border-gold/60 bg-gold/10' : 'cursor-pointer border-border/30 bg-canvas/30 hover:border-border/60'}`}>
      {pick ? <div className="flex items-center gap-2">
        <PlayerPortrait player={pick.player} className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{bucket.label}</p>
          <p className="truncate text-xs font-semibold">{pick.player.name}</p>
          <p className="font-display text-2xl leading-tight text-gold">{pick.value.toFixed(1)} <span className="font-mono text-[10px] text-muted-foreground">{bucket.metric}</span></p>
        </div>
        {!complete && <button type="button" aria-label={`Release ${pick.player.name} from ${bucket.label}`} onClick={event => { event.stopPropagation(); onUndo(bucket.key); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-raised hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
      </div> : <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{bucket.label}</p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{active ? '▸ Drafting… pick a card' : 'Tap to target this slot'}</p>
      </div>}
    </div>;
  })}</div>;
}