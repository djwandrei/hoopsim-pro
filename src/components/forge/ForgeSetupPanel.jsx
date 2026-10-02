import React from 'react';
import { Play } from 'lucide-react';
import { SKILLS, GROUPS } from '@/components/forge/bapSkills';
import { Image } from '@/components/ui/image';

const SILHOUETTE = 'https://media.base44.com/images/public/6abc41d86dabd382371f49ea/b207e0f44_generated_image.png';

// Shared Build-A-Bucket-style setup screen used by both Forge draft modes:
// silhouette hero, Guard/Big toggle, the nine skill chips, and the start action.
export default function ForgeSetupPanel({ kicker, title, intro, group, onGroup, poolCount, onStart, respinNote }) {
  return <div className="court-panel court-panel-hover p-6">
    <div className="relative mx-auto max-w-xl text-center">
      <div className="absolute inset-x-10 top-4 bottom-12 rounded-full" style={{ background:'radial-gradient(circle, hsl(var(--court-accent) / 0.14), transparent 70%)' }} />
      <Image src={SILHOUETTE} alt="" fittingType="fit" className="relative mx-auto h-64 w-52 mix-blend-screen" />
      <p className="bcast-kicker relative mt-3">{kicker}</p>
      <h2 className="broadcast-gradient-text relative mt-1 font-display text-3xl">{title}</h2>
      <p className="relative mt-3 text-sm leading-relaxed text-muted-foreground">{intro}</p>
      <span className="bcast-lowerthird relative mt-3"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{poolCount} {group.toLowerCase()} seasons armed</span>
    </div>
    <div className="mt-4 flex justify-center gap-2">
      {GROUPS.map(item => <button key={item.key} type="button" onClick={() => onGroup(item.key)} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${group === item.key ? 'border-gold/60 bg-gradient-to-r from-gold/15 to-royal/10 text-gold shadow-[0_0_18px_rgba(233,185,73,0.12)]' : 'border-border/30 text-muted-foreground hover:border-gold/40'}`}>{item.key} <span className="font-mono opacity-70">{item.hint}</span></button>)}
    </div>
    <div className="mt-4 flex flex-wrap justify-center gap-2">{SKILLS.map((skill, index) => <span key={skill.key} className={`rounded-lg border px-3 py-1.5 text-[11px] ${index % 4 === 0 ? 'border-gold/30 text-gold' : index % 4 === 1 ? 'border-royal/40 text-royal' : index % 4 === 2 ? 'border-trim/30 text-trim' : 'border-positive/30 text-positive'}`}>{skill.label} <span className="font-mono opacity-80">{skill.metric}</span></span>)}</div>
    <p className="mt-3 text-center text-xs text-muted-foreground">{poolCount} {group.toLowerCase()} seasons in the pool{respinNote ? ` · ${respinNote}` : ''}</p>
    <div className="mt-5 text-center"><button type="button" onClick={onStart} disabled={!poolCount} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-8 text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:translate-y-px hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Start drafting</button></div>
  </div>;
}