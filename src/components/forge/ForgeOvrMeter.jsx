import React from 'react';
import { motion } from 'framer-motion';
import { gradeFor } from '@/components/forge/bapSkills';

// Live OVR meter while the build is still in progress.
export default function ForgeOvrMeter({ overall, filled, total, showGrades }) {
  const grade = overall == null ? null : gradeFor(overall / 100);
  return <div className="flex items-center gap-4 rounded-xl border border-border/25 bg-raised/40 p-3">
    <div className="shrink-0 text-center">
      <motion.p key={overall == null ? 'none' : overall} initial={{ scale:1.3, opacity:.3 }} animate={{ scale:1, opacity:1 }} transition={{ type:'spring', stiffness:320, damping:18 }} className="font-display text-4xl leading-none text-gold">{overall == null ? '—' : overall}</motion.p>
      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{showGrades && grade ? `OVR · ${grade}` : 'OVR'}</p>
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground"><span>Current build</span><span>{filled} / {total} slots</span></div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas/70"><div className="h-full rounded-full bg-gradient-to-r from-gold/60 to-gold transition-all duration-300" style={{ width:`${Math.max(2, filled / total * 100)}%` }} /></div>
    </div>
  </div>;
}