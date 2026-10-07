import React from 'react';
import { motion } from 'framer-motion';
import { Flame, X } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { SKILLS, gradeFor, gradeTone } from '@/components/forge/bapSkills';

const TONE = {
  positive: 'border-positive/60 bg-positive/15 text-positive',
  royal: 'border-royal/60 bg-royal/15 text-royal-ink',
  gold: 'border-gold/60 bg-gold/15 text-gold',
  trim: 'border-trim/60 bg-trim/15 text-trim-ink',
};

// Right panel of the Build-A-Bucket layout, upgraded to a live forge
// dashboard: OVR ring driven by build progress, a nine-pip forge-heat meter,
// grade tally and best-skill highlight, above the filled slot list.
export default function ForgeOvrPanel({ picks, overall, showGrades, onUndo }) {
  const filledSkills = SKILLS.filter(skill => picks[skill.key]);
  const remaining = SKILLS.length - filledSkills.length;
  const progress = filledSkills.length / SKILLS.length;
  const ringRadius = 42;
  const ring = 2 * Math.PI * ringRadius;
  const tally = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  filledSkills.forEach(skill => { tally[gradeFor(picks[skill.key].value)] += 1; });
  const best = filledSkills.reduce((top, skill) => (!top || picks[skill.key].value > picks[top.key].value ? skill : top), null);
  return <aside className="court-panel p-3" aria-label="Forge build dashboard">
    <div className="flex items-center justify-between gap-2">
      <p className="bcast-kicker">Forge dashboard</p>
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{filledSkills.length}/{SKILLS.length} forged</span>
    </div>
    <div className="mt-3 flex flex-col items-center text-center">
      <div className="relative flex h-24 w-24 items-center justify-center rounded-full shadow-[0_0_30px_hsl(var(--court-accent)/0.28)]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={ringRadius} fill="hsl(var(--court-canvas))" stroke="hsl(var(--court-raised))" strokeWidth="7" />
          <circle cx="50" cy="50" r={ringRadius} fill="none" stroke="hsl(var(--court-accent))" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${ring * progress} ${ring}`} style={{ transition: 'stroke-dasharray .4s ease' }} />
        </svg>
        <motion.span key={overall ?? 'none'} initial={{ scale: 1.25, opacity: .4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 18 }} className="relative font-display text-3xl leading-none text-gold">{overall ?? '–'}</motion.span>
      </div>
      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">OVR</p>
      <p className="mt-1 font-mono text-[9px] text-muted-foreground">{Math.round(progress * 100)}% forged · {remaining} slots open</p>
    </div>
    <div className="mt-3 flex items-center gap-1" aria-label={`Forge heat: ${filledSkills.length} of ${SKILLS.length} skills locked`}>
      {SKILLS.map((skill, index) => <span key={skill.key} className={`h-1.5 flex-1 rounded-full transition-all ${index < filledSkills.length ? 'bg-gold' : 'bg-raised'}`} style={index < filledSkills.length ? { boxShadow: '0 0 8px hsl(var(--court-accent) / .5)' } : undefined} />)}
    </div>
    <div className="mt-3 flex flex-wrap justify-center gap-1.5">
      {Object.entries(tally).filter(([, count]) => count > 0).map(([grade, count]) => (
        <span key={grade} className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold ${TONE[{ A: 'positive', B: 'royal', C: 'gold', D: 'trim', F: 'trim' }[grade]]}`}>{count}× {grade}</span>
      ))}
      {filledSkills.length === 0 && <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/75">No grades yet</span>}
    </div>
    {best && (
      <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-gold/30 bg-gold/10 px-2 py-1.5">
        <Flame className="h-3 w-3 shrink-0 text-gold" />
        <p className="truncate text-[10px] text-muted-foreground">Best: <span className="font-semibold text-gold">{best.label}</span> <span className="font-mono">DJHC {best.fmt(picks[best.key].value)}</span></p>
      </div>
    )}
    <div className="mt-4 space-y-1.5">
      {SKILLS.map(skill => {
        const pick = picks[skill.key];
        if (!pick) return <p key={skill.key} className="px-2 py-1 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/75">{skill.label}</p>;
        return <div key={`${skill.key}:filled`} className="slot-pop flex items-center gap-2 rounded-lg border border-border/25 bg-raised/40 px-2 py-1.5">
          <PlayerPortrait player={pick.player} className="h-8 w-8" frameless />
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[11px] font-semibold leading-tight">{pick.player.name}</p>
            <p className="truncate font-mono text-[9px] text-muted-foreground">{skill.label} · DJHC {skill.fmt(pick.value)}</p>
          </div>
          {showGrades && <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold ${TONE[gradeTone(pick.value)]}`}>{gradeFor(pick.value)}</span>}
          <button type="button" aria-label={`Release ${pick.player.name} from ${skill.label}`} onClick={() => onUndo(skill.key)} className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-trim-ink"><X className="h-3 w-3" /></button>
        </div>;
      })}
    </div>
  </aside>;
}