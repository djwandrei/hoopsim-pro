import React from 'react';
import { Image } from '@/components/ui/image';
import { SKILLS, gradeFor } from '@/components/forge/bapSkills';

const SILHOUETTE = 'https://media.base44.com/images/public/6abc41d86dabd382371f49ea/97546ab83_generated_image.png';

// Chip anchors around the silhouette, as a percentage of the stage box.
const CHIP_LAYOUT = {
  handles: { side: 'left', top: 4 },
  jumpShot: { side: 'left', top: 26 },
  passing: { side: 'left', top: 48 },
  strength: { side: 'left', top: 70 },
  bounce: { side: 'left', top: 91 },
  finishing: { side: 'right', top: 14 },
  perimeterD: { side: 'right', top: 38 },
  speed: { side: 'right', top: 61 },
  hl: { side: 'right', top: 83 }
};

// Center stage of the Build-A-Bucket layout: silhouette with attribute chips.
export default function ForgeStage({ mode, picks, leagueMax, reveal, selectedKey, onSelect, onAssign, showGrades, spinning }) {
  const bestLiveKey = (() => {
    if (!reveal || mode !== 'wheel') return null;
    let best = null;let bestRatio = -1;
    for (const skill of SKILLS) {
      if (picks[skill.key] || !leagueMax[skill.key]) continue;
      const ratio = (reveal[skill.key] || 0) / leagueMax[skill.key];
      if (ratio > bestRatio) {bestRatio = ratio;best = skill.key;}
    }
    return best;
  })();
  return <section aria-label="Build stage" className="relative flex min-h-[24rem] flex-col self-stretch overflow-hidden rounded-2xl border border-border/25 lg:min-h-[32rem]" style={{ background: 'radial-gradient(130% 80% at 50% -10%, hsl(var(--court-royal) / 0.22), transparent 60%), radial-gradient(90% 55% at 50% 105%, hsl(var(--court-accent) / 0.14), transparent 65%), hsl(var(--court-canvas))' }}>
    <p className="relative z-10 pt-4 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground hidden">
      {mode === 'pick' ? 'Tap a chip to arm · spin · tap again to keep' : 'Spin the reels · tap a lit chip to take that stat'}
    </p>
    <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-6">
      <div className="relative h-72 w-full max-w-xs sm:h-96 sm:max-w-sm">
        <Image src={SILHOUETTE} alt="" fittingType="fit" className="absolute inset-0 h-full w-full opacity-90 [mask-image:radial-gradient(78%_78%_at_50%_45%,black_52%,transparent_98%)]" />
        {SKILLS.map((skill) => {
          const layout = CHIP_LAYOUT[skill.key] || { side: 'left', top: 50 };
          const pick = picks[skill.key];
          const live = Boolean(reveal) && !pick && (mode === 'wheel' || selectedKey === skill.key);
          const armed = mode === 'pick' && !pick && !reveal && !spinning && selectedKey === skill.key;
          const selectable = mode === 'pick' && !pick && !reveal && !spinning;
          const clickable = live || armed || selectable && !selectedKey;
          const ratio = pick && leagueMax[skill.key] ? pick.value / leagueMax[skill.key] : 0;
          const isBest = live && skill.key === bestLiveKey;
          const tone = pick ? 'forge-stage-chip--filled' : isBest ? 'forge-stage-chip--best' : live ? 'forge-stage-chip--live' : armed || selectedKey === skill.key && mode === 'pick' ? 'forge-stage-chip--armed' : 'forge-stage-chip--open';
          return <button key={skill.key} type="button" disabled={!clickable}
          onClick={() => live ? onAssign(skill.key) : onSelect(skill.key)}
          className={`forge-stage-chip ${tone}${clickable ? ' cursor-pointer' : ''}`}
          style={{ top: `${layout.top}%`, [layout.side === 'left' ? 'left' : 'right']: '0%' }}>
            <span>{skill.label}</span>
            {live && <span className="forge-stage-chip-val">{skill.fmt(reveal[skill.key] || 0)}</span>}
            {isBest && <span className="text-[8px] font-bold uppercase tracking-widest">★ best</span>}
            {showGrades && pick && <span className="forge-stage-chip-grade">{gradeFor(ratio)}</span>}
          </button>;
        })}
      </div>
    </div>
  </section>;
}