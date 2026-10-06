import React from 'react';
import { ChevronRight, Play } from 'lucide-react';
import { SKILLS, GROUPS } from '@/components/forge/bapSkills';

// Shared Build-A-Bucket-style setup screen used by both Forge draft modes:
// how-to steps, Guard/Big toggle, the nine skill chips, and the start action.
export default function ForgeSetupPanel({ kicker, title, intro, group, onGroup, poolCount, onStart, respinNote, steps = [] }) {
  return <div className="court-panel court-panel-hover p-6">
    <div className="relative mx-auto max-w-xl text-center">
      <p className="bcast-kicker relative mt-3">{kicker}</p>
      <h2 className="broadcast-gradient-text relative mt-1 font-display text-3xl">{title}</h2>
      <p className="relative mt-3 text-sm leading-relaxed text-muted-foreground">{intro}</p>
      <span className="bcast-lowerthird relative mt-3"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{poolCount} {group.toLowerCase()} seasons armed</span>
    </div>
    <div className="mt-4 flex justify-center gap-2">
      {GROUPS.map(item => <button key={item.key} type="button" onClick={() => onGroup(item.key)} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${group === item.key ? 'border-gold/60 bg-gradient-to-r from-gold/15 to-royal/10 text-gold shadow-[0_0_18px_rgba(233,185,73,0.12)]' : 'border-border/30 text-muted-foreground hover:border-gold/40'}`}>{item.key} <span className="font-mono opacity-70">{item.hint}</span></button>)}
    </div>
    {steps.length > 0 && <ol className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {steps.map((step, index) => <li key={step} className="flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-mono text-[9px] text-gold">{index + 1}</span>
        {step}
        {index < steps.length - 1 && <ChevronRight className="h-3 w-3 text-gold/50" aria-hidden="true" />}
      </li>)}
    </ol>}
    <div className="mt-4 flex flex-wrap justify-center gap-2">{SKILLS.map(skill => <span key={skill.key} className="flex items-center gap-1.5 rounded-lg border border-border/25 bg-canvas/30 px-3 py-1.5 text-[11px]"><span className="inline-block h-1.5 w-1.5 rounded-full bg-gold/70" aria-hidden="true" />{skill.label} <span className="font-mono text-[10px] text-muted-foreground">{skill.basis}</span></span>)}</div>
    <p className="mt-3 text-center text-xs text-muted-foreground">{poolCount} {group.toLowerCase()} seasons in the pool{respinNote ? ` · ${respinNote}` : ''}</p>
    <div className="mt-5 text-center"><button type="button" onClick={onStart} disabled={!poolCount} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-8 text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:translate-y-px hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Start drafting</button></div>
  </div>;
}