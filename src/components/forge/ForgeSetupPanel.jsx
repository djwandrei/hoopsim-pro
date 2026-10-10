import React from 'react';
import { Play } from 'lucide-react';
import { SKILLS, GROUPS } from '@/components/forge/bapSkills';

// Build-A-Bucket-style setup screen shared by both Forge draft modes — a
// two-column briefing: the mode story, pool state and numbered workflow on
// the left, and the Guard/Big toggle with the DJHC attribute slate on the
// right. Replaces the single centered column for a clear information split.
export default function ForgeSetupPanel({ kicker, title, intro, group, onGroup, poolCount, onStart, respinNote, steps = [] }) {
  return <section className="court-panel relative overflow-hidden p-5 sm:p-7">
    <span className="bcast-watermark" aria-hidden="true">FORGE</span>
    <div className="relative grid items-start gap-7 lg:grid-cols-[minmax(0,1fr),minmax(0,21rem)]">
      <div className="min-w-0">
        <p className="bcast-kicker">{kicker}</p>
        <h2 className="broadcast-gradient-text mt-1.5 font-display text-4xl leading-none sm:text-5xl">{title}</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{intro}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{poolCount} {group.toLowerCase()} seasons armed</span>
          {respinNote && <span className="rounded-lg border border-border/30 bg-raised/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{respinNote}</span>}
        </div>
        {steps.length > 0 && <ol className="mt-5 grid gap-2 sm:grid-cols-3">
          {steps.map((step, index) => <li key={step} className="flex items-center gap-2.5 rounded-xl border border-border/30 bg-raised/40 px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-mono text-[10px] font-bold text-gold">{index + 1}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{step}</span>
          </li>)}
        </ol>}
        <div className="mt-6"><button type="button" onClick={onStart} disabled={!poolCount} className="book-cta inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-8 text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:translate-y-px hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Start drafting</button></div>
      </div>
      <aside className="min-w-0 rounded-2xl border border-border/30 bg-raised/30 p-4" aria-label="Skill slate">
        <p className="bcast-kicker">Skill slate</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Observed season counts and rates, shrunk for small samples, ranked within the season and role adjusted when supported.</p>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {GROUPS.map(item => <button key={item.key} type="button" onClick={() => onGroup(item.key)} className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${group === item.key ? 'border-gold/60 bg-gradient-to-r from-gold/15 to-royal/10 text-gold shadow-[0_0_18px_rgba(233,185,73,0.12)]' : 'border-border/30 text-muted-foreground hover:border-gold/40'}`}>{item.key} <span className="font-mono opacity-70">{item.hint}</span></button>)}
        </div>
        <ul className="mt-3 space-y-1.5">
          {SKILLS.map(skill => <li key={skill.key} className="flex items-center justify-between gap-2 rounded-lg border border-border/25 bg-canvas/40 px-2.5 py-1.5">
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold"><span className="inline-block h-1.5 w-1.5 rounded-full bg-gold/70" aria-hidden="true" />{skill.label}</span>
            <span className="truncate text-right font-mono text-[9px] text-muted-foreground">{skill.basis}</span>
          </li>)}
        </ul>
      </aside>
    </div>
  </section>;
}
