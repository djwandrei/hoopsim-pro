import React from 'react';
import { motion } from 'framer-motion';
import { SKILLS, gradeFor } from '@/components/forge/bapSkills';
import ForgeAthlete3D from '@/components/forge/ForgeAthlete3D';

const initials = pick => (pick?.player?.name || '?').split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join('');

// Circular attribute wheel: nine slots around a central silhouette, each
// segment lighting up as its pick lands, graded by the DJHC rating.
export default function ForgeBuildWheel({ picks, overall, selectedKey, spinning = false, editions }) {
  const slice = 360 / SKILLS.length;
  const segments = SKILLS.map((skill, index) => {
    const pick = picks[skill.key];
    const ratio = pick ? Math.max(0, Math.min(1, (pick.value - 25) / 74)) : 0;
    return { skill, pick, ratio, index };
  });
  const gradient = `conic-gradient(from -90deg, ${segments.map(({ pick, ratio, index }) => {
    const color = pick ? `hsl(var(--court-accent) / ${(0.16 + 0.74 * ratio).toFixed(2)})` : 'hsl(var(--court-raised) / 0.35)';
    return `${color} ${index * slice}deg ${(index + 1) * slice}deg`;
  }).join(', ')})`;
  return <div className={`relative mx-auto aspect-square w-full max-w-[21rem] ${spinning ? 'wheel-spinning' : ''}`} aria-label="Build attribute wheel">
    <div className="absolute inset-0 overflow-hidden rounded-full border border-border/25 shadow-[0_0_44px_hsl(var(--court-canvas)/0.55)]" style={{ background: gradient }}>
      {segments.map(({ skill, pick, index }) => {
        const rad = index * slice * Math.PI / 180;
        const selected = selectedKey === skill.key;
        return <div key={skill.key} style={{ left:`${50 + 37 * Math.sin(rad)}%`, top:`${50 - 37 * Math.cos(rad)}%` }} className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-center transition-colors ${pick ? 'border-gold/60 bg-card/95 text-gold wheel-chip-landed' : 'border-border/30 bg-card/85 text-muted-foreground'} ${selected ? 'border-gold wheel-chip-active' : ''}`}>
          <span className="font-display text-[11px] leading-none tracking-wide">{skill.label}</span>
          <span className="font-mono text-[9px] leading-none opacity-80">{pick ? `${gradeFor(pick.value)} ${pick.value} · ${initials(pick)}` : '—'}</span>
        </div>;
      })}
    </div>
    <div className="absolute inset-[26%] flex flex-col items-center justify-center rounded-full border-2 border-gold/50 bg-card shadow-[0_0_30px_hsl(var(--court-accent)/0.2)]">
      <div className="absolute inset-[10%]"><ForgeAthlete3D picks={picks} editions={editions} spinning={spinning} /></div>
      <motion.span key={overall ?? 'none'} initial={{ scale:1.3, opacity:.3 }} animate={{ scale:1, opacity:1 }} transition={{ type:'spring', stiffness:320, damping:18 }} className="relative font-display text-4xl leading-none text-gold">{overall ?? '—'}</motion.span>
      <span className="relative mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">OVR</span>
    </div>
  </div>;
}