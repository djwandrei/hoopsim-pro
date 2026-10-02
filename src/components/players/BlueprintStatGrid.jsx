import React from 'react';
import { BLUEPRINT_STATS, statText } from '@/components/players/blueprintModel';
export default function BlueprintStatGrid({ player }) {
  return <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{BLUEPRINT_STATS.map(([key,label,title]) => <div key={key} title={title} className={`rounded-xl border px-3 py-3 transition-colors hover:border-gold/40 ${['pts','ast','reb'].includes(key) ? 'border-gold/25 bg-gold/5' : 'border-border/25 bg-canvas/35'}`}><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className={['pts','ast','reb'].includes(key) ? 'mt-1 font-display text-3xl text-gold' : 'mt-1 font-display text-3xl text-foreground'}>{statText(key,player.stats[key])}</p></div>)}</div>;
}