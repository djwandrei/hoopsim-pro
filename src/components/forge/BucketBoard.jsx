import React from 'react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { X } from 'lucide-react';
import { gradeFor } from '@/components/forge/bapSkills';
export default function BucketBoard({ buckets, picks, activeKey, onActivate, onUndo, complete, leagueMax }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{buckets.map(bucket => {
    const pick = picks[bucket.key];
    const active = !complete && !pick && activeKey === bucket.key;
    return <div key={bucket.key} onClick={() => !pick && onActivate(bucket.key)} role={pick ? undefined : 'button'} aria-pressed={active} tabIndex={pick ? -1 : 0} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !pick) { event.preventDefault(); onActivate(bucket.key); } }} className={`rounded-xl border p-3 transition-all ${pick ? 'border-gold/35 bg-gold/5 hover:-translate-y-0.5' : active ? 'cursor-pointer border-gold/60 bg-gold/10 shadow-[0_0_0_3px_hsl(var(--court-accent)/0.12)]' : 'cursor-pointer border-dashed border-border/40 bg-canvas/30 hover:border-gold/40 hover:bg-canvas/60'}`}>
      {pick ? <div className="flex items-center gap-2">
        <PlayerPortrait player={pick.player} className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold/80">{bucket.label}{leagueMax?.[bucket.key] ? <span className="rounded-full border border-gold/30 bg-gold/10 px-1.5 py-0.5 font-mono text-[9px] normal-case tracking-normal text-gold">{gradeFor(pick.value / leagueMax[bucket.key])}</span> : null}</p>
          <p className="truncate text-xs font-semibold">{pick.player.name}</p>
          <p className="font-display text-2xl leading-tight text-gold">{bucket.fmt(pick.value)} <span className="font-mono text-[10px] text-muted-foreground">{bucket.metric}</span></p>
        </div>
        {!complete && <button type="button" aria-label={`Release ${pick.player.name} from ${bucket.label}`} onClick={event => { event.stopPropagation(); onUndo(bucket.key); }} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-trim"><X className="h-3.5 w-3.5" /></button>}
      </div> : <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{bucket.label}</p>
        <p className={`mt-2 font-mono text-xs ${active ? 'text-gold' : 'text-muted-foreground'}`}>{active ? '▸ Wheel landed — keep or respin the offer' : `Awaiting wheel · ${bucket.metric}`}</p>
      </div>}
    </div>;
  })}</div>;
}