import React from 'react';
import { Loader2 } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';

const SLICE_TONES = ['hsl(var(--court-accent)/0.18)', 'hsl(var(--court-royal)/0.18)', 'hsl(var(--court-trim)/0.16)', 'hsl(var(--court-positive)/0.15)'];

// Segmented wheel of teams: spin to land the donor team for the picked skill.
export default function ForgeTeamWheel({ teams, rotation, spinning, onSpin, disabled, landedCode }) {
  const slice = 360 / teams.length;
  const gradient = `conic-gradient(from -90deg, ${teams.map((_, index) => `${SLICE_TONES[index % 4]} ${index * slice}deg ${(index + 1) * slice}deg`).join(', ')})`;
  return <div className={`relative mx-auto aspect-square w-full max-w-[21rem] ${spinning ? 'wheel-spinning' : ''}`} aria-label="Team wheel">
    <div className="absolute inset-[6%] overflow-hidden rounded-full border border-border/25 bg-canvas/70 shadow-[0_0_44px_hsl(var(--court-canvas)/0.55)]">
      <div className="absolute inset-0 transition-transform ease-out" style={{ transform:`rotate(${rotation}deg)`, transitionDuration: spinning ? '950ms' : '0ms', background: gradient }}>
        {teams.map((team, index) => {
          const angle = index * slice;
          const rad = angle * Math.PI / 180;
          const landed = landedCode === team.code;
          return <div key={team.code} style={{ left:`${50 + 40 * Math.sin(rad)}%`, top:`${50 - 40 * Math.cos(rad)}%` }} className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border bg-canvas/85 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${landed ? 'border-gold text-gold shadow-[0_0_0_3px_hsl(var(--court-accent)/0.3)] wheel-chip-landed' : 'border-border/30 text-muted-foreground'}`}>
            <TeamMark code={team.code} className="h-4 w-4" />{team.code}
          </div>;
        })}
      </div>
    </div>
    <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2" style={{ width:0, height:0, borderLeft:'.45rem solid transparent', borderRight:'.45rem solid transparent', borderTop:'1rem solid hsl(var(--court-accent))' }} />
    <button type="button" onClick={onSpin} disabled={spinning || disabled} className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border-2 border-gold/60 bg-canvas shadow-[0_0_36px_hsl(var(--court-accent)/0.2)] transition-all hover:scale-[1.04] hover:border-gold active:scale-95 disabled:cursor-wait disabled:opacity-50" aria-label={spinning ? 'Wheel spinning' : 'Spin for a team'}>
      {spinning ? <Loader2 className="h-6 w-6 animate-spin text-gold" /> : <><span className="font-display text-lg leading-none text-gold">SPIN</span><span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">for a team</span></>}
    </button>
  </div>;
}