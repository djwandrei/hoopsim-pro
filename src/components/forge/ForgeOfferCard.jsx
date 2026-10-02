import React from 'react';
import { motion } from 'framer-motion';
import { Check, RefreshCcw } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';
import { gradeFor } from '@/components/forge/bapSkills';

// BAP-style split offer card: the player on top, KEEP and RESPIN as equal halves.
export default function ForgeOfferCard({ offer, skill, leagueMax, onKeep, onRespin, respins, showGrades }) {
  const value = offer[skill.key] || 0;
  const grade = gradeFor(leagueMax[skill.key] ? value / leagueMax[skill.key] : 0);
  return <motion.div initial={{ opacity:0, y:14, scale:.96 }} animate={{ opacity:1, y:0, scale:1 }} transition={{ type:'spring', stiffness:260, damping:22 }} className="overflow-hidden rounded-2xl border border-gold/35 bg-canvas/40 shadow-[0_0_32px_hsl(var(--court-accent)/0.1)]">
    <div className="flex items-center gap-4 p-4">
      <PlayerPortrait player={offer} className="h-24 w-24 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Offered for {skill.label} · {skill.metric}</p>
        <p className="truncate font-display text-3xl leading-tight">{offer.name}</p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><TeamMark code={offer.teamCode} className="h-5 w-5" />{offer.teamCode} · {offer.positions.join('/') || '—'}</p>
        <p className="mt-1 flex items-baseline gap-2 font-display text-3xl leading-none text-gold">{skill.fmt(value)}<span className="font-mono text-[11px] font-normal tracking-normal text-muted-foreground">pool #{offer.ranks?.[skill.key] ?? '—'}{showGrades ? ` · grade ${grade}` : ''}</span></p>
      </div>
    </div>
    <div className="grid grid-cols-2 divide-x divide-border/30 border-t border-border/30">
      <button type="button" onClick={onKeep} className="flex min-h-12 items-center justify-center gap-2 bg-positive/10 text-sm font-semibold uppercase tracking-wider text-positive transition-colors hover:bg-positive/20"><Check className="h-4 w-4" />Keep{showGrades ? ` · ${grade}` : ''}</button>
      <button type="button" onClick={onRespin} disabled={!respins} className="flex min-h-12 items-center justify-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-trim/10 hover:text-trim disabled:cursor-not-allowed disabled:opacity-40"><RefreshCcw className="h-4 w-4" />Respin{respins ? ` · ${respins}` : ' · none'}</button>
    </div>
  </motion.div>;
}