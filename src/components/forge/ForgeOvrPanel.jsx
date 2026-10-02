import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { SKILLS, gradeFor, gradeTone } from '@/components/forge/bapSkills';

const TONE = {
  positive: 'border-positive/60 bg-positive/15 text-positive',
  royal: 'border-royal/60 bg-royal/15 text-royal',
  gold: 'border-gold/60 bg-gold/15 text-gold',
  trim: 'border-trim/60 bg-trim/15 text-trim',
};

// Right panel of the Build-A-Bucket layout: OVR ring, remaining count, and slots.
export default function ForgeOvrPanel({ picks, overall, leagueMax, showGrades, onUndo }) {
  const remaining = SKILLS.reduce((sum, skill) => sum + (picks[skill.key] ? 0 : 1), 0);
  return <aside className="court-panel p-3" aria-label="Overall rating panel">
    <div className="flex flex-col items-center text-center">
      <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-gold/70 bg-canvas shadow-[0_0_30px_hsl(var(--court-accent)/0.28)]">
        <motion.span key={overall ?? 'none'} initial={{ scale:1.25, opacity:.4 }} animate={{ scale:1, opacity:1 }} transition={{ type:'spring', stiffness:320, damping:18 }} className="font-display text-3xl leading-none text-gold">{overall ?? '–'}</motion.span>
      </div>
      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">OVR</p>
      <p className="mt-3 text-xs text-muted-foreground">{remaining} attributes remaining</p>
      <span className="mt-2 rounded-md border border-gold/40 bg-gold/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-gold">{remaining} slots remaining</span>
    </div>
    <div className="mt-4 space-y-1.5">
      {SKILLS.map(skill => {
        const pick = picks[skill.key];
        if (!pick) return <p key={skill.key} className="px-2 py-1 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/45">{skill.label}</p>;
        const ratio = leagueMax[skill.key] ? pick.value / leagueMax[skill.key] : 0;
        return <div key={`${skill.key}:filled`} className="slot-pop flex items-center gap-2 rounded-lg border border-border/25 bg-raised/40 px-2 py-1.5">
          <PlayerPortrait player={pick.player} className="h-8 w-8" frameless />
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[11px] font-semibold leading-tight">{pick.player.name}</p>
            <p className="truncate font-mono text-[9px] text-muted-foreground">{skill.label} · {skill.fmt(pick.value)}</p>
          </div>
          {showGrades && <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold ${TONE[gradeTone(ratio)]}`}>{gradeFor(ratio)}</span>}
          <button type="button" aria-label={`Release ${pick.player.name} from ${skill.label}`} onClick={() => onUndo(skill.key)} className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-trim"><X className="h-3 w-3" /></button>
        </div>;
      })}
    </div>
  </aside>;
}