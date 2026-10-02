import React from 'react';
import { Loader2 } from 'lucide-react';
import { gradeFor } from '@/components/forge/bapSkills';
import { Image } from '@/components/ui/image';

const SILHOUETTE = 'https://media.base44.com/images/public/6abc41d86dabd382371f49ea/d00d11c89_generated_image.png';
const SLICE_TONES = ['hsl(var(--court-accent)/0.18)', 'hsl(var(--court-royal)/0.18)', 'hsl(var(--court-trim)/0.16)', 'hsl(var(--court-positive)/0.15)'];
const CHIP_TONES = ['text-gold border-gold/45', 'text-royal border-royal/50', 'text-trim border-trim/45', 'text-positive border-positive/50'];

export default function BuildWheel({ skills, picks, activeKey, leagueMax, rotation, spinning, onSpin, showGrades }) {
  const slice = 360 / skills.length;
  const gradient = `conic-gradient(from -90deg, ${skills.map((_, index) => `${SLICE_TONES[index % 4]} ${index * slice}deg ${(index + 1) * slice}deg`).join(', ')})`;
  return <div className={`relative mx-auto aspect-square w-full max-w-[23rem] ${spinning ? 'wheel-spinning' : ''}`} aria-label="Attribute wheel">
    <Image src={SILHOUETTE} alt="" fittingType="fill" className="pointer-events-none absolute inset-0 h-full w-full rounded-full opacity-20" />
    <div className="absolute inset-[6%] overflow-hidden rounded-full border border-border/25 bg-canvas/70 shadow-[0_0_44px_hsl(var(--court-canvas)/0.55)]">
      <div className="absolute inset-0 transition-transform ease-out" style={{ transform:`rotate(${rotation}deg)`, transitionDuration: spinning ? '950ms' : '0ms', background: gradient }}>
        {skills.map((skill, index) => {
          const angle = index * slice;
          const rad = angle * Math.PI / 180;
          const pick = picks[skill.key];
          const active = activeKey === skill.key;
          return <div key={skill.key} style={{ left:`${50 + 40 * Math.sin(rad)}%`, top:`${50 - 40 * Math.cos(rad)}%` }} className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border bg-canvas/85 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${pick ? 'border-border/30 text-muted-foreground wheel-chip-landed' : CHIP_TONES[index % 4]} ${active ? 'scale-110 wheel-chip-active' : ''}`}>
            <span>{skill.label}</span>
            {pick && showGrades && leagueMax?.[skill.key] ? <span className="rounded-full bg-gold/15 px-1.5 py-0.5 font-mono text-[9px] normal-case tracking-normal text-gold">{gradeFor(pick.value / leagueMax[skill.key])}</span> : null}
          </div>;
        })}
      </div>
    </div>
    <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2" style={{ width:0, height:0, borderLeft:'.45rem solid transparent', borderRight:'.45rem solid transparent', borderTop:'1rem solid hsl(var(--court-accent))' }} />
    <button type="button" onClick={onSpin} disabled={spinning} className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border-2 border-gold/60 bg-canvas shadow-[0_0_36px_hsl(var(--court-accent)/0.2)] transition-all hover:scale-[1.04] hover:border-gold active:scale-95 disabled:cursor-wait" aria-label={spinning ? 'Wheel spinning' : 'Spin the attribute wheel'}>
      {spinning ? <Loader2 className="h-6 w-6 animate-spin text-gold" /> : <><span className="font-display text-xl leading-none text-gold">SPIN</span><span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">the wheel</span></>}
    </button>
  </div>;
}