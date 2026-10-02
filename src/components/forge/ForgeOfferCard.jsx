import React from 'react';
import { Check, RefreshCcw } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';
import { gradeFor } from '@/components/forge/bapSkills';

export default function ForgeOfferCard({ offer, skill, leagueMax, onKeep, onRespin, respins }) {
  const value = offer[skill.key] || 0;
  const grade = gradeFor(leagueMax[skill.key] ? value / leagueMax[skill.key] : 0);
  return <div className="flex items-center gap-4 rounded-xl border border-gold/35 bg-canvas/40 p-4 shadow-[0_0_28px_hsl(var(--court-accent)/0.08)]">
    <PlayerPortrait player={offer} className="h-20 w-20 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Offered for {skill.label} · {skill.metric}</p>
      <p className="truncate font-display text-2xl leading-tight">{offer.name}</p>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><TeamMark code={offer.teamCode} className="h-5 w-5" />{offer.teamCode} · {offer.positions.join('/') || '—'}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-2 font-display text-3xl leading-none text-gold">{skill.fmt(value)}<span className="font-mono text-[11px] font-normal tracking-normal text-muted-foreground">pool #{offer.ranks?.[skill.key] ?? '—'} · grade {grade}</span></p>
    </div>
    <div className="flex shrink-0 flex-col gap-2">
      <button type="button" onClick={onKeep} className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground transition-all hover:bg-goldSoft"><Check className="h-4 w-4" />Keep</button>
      <button type="button" onClick={onRespin} disabled={!respins} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-input px-5 text-xs text-foreground transition-colors hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-input disabled:hover:text-foreground"><RefreshCcw className="h-3.5 w-3.5" />Respin · {respins} left</button>
    </div>
  </div>;
}