import React from 'react';
import { SKILLS, gradeFor } from '@/components/forge/bapSkills';
import ForgeAthlete3D from '@/components/forge/ForgeAthlete3D';
import ForgeWardrobeControls from '@/components/forge/ForgeWardrobeControls';

// Chip anchors around the silhouette, as a percentage of the stage box.
const CHIP_LAYOUT = {
  scoring: { side: 'left', top: 4 },
  jumpShot: { side: 'left', top: 26 },
  playmaking: { side: 'left', top: 48 },
  rebounding: { side: 'left', top: 70 },
  offensiveRebound: { side: 'left', top: 91 },
  finishing: { side: 'right', top: 14 },
  decision: { side: 'right', top: 38 },
  steals: { side: 'right', top: 61 },
  rimProtection: { side: 'right', top: 83 }
};

// Center stage of the Build-A-Bucket layout: silhouette with attribute chips.
export default function ForgeStage({ mode, picks, reveal, selectedKey, onSelect, onAssign, showGrades, spinning, editions, onEdition }) {
  const bestLiveKey = (() => {
    if (!reveal || mode !== 'wheel') return null;
    let best = null;let bestRating = -Infinity;
    for (const skill of SKILLS) {
      const rating = reveal[skill.key];
      if (picks[skill.key] || !Number.isFinite(rating) || rating <= bestRating) continue;
      bestRating = rating;best = skill.key;
    }
    return best;
  })();
  return <section aria-label="Build stage" className="relative flex min-w-0 flex-1 flex-col self-stretch items-center justify-center">
    {/* Absolute artwork and chips need a full-width parent to avoid shrink-to-fit collapse. */}
    <div className="relative z-10 flex w-full min-w-0 flex-1 items-center justify-center px-4 py-6">
      <div className="relative h-72 w-full max-w-xs sm:h-96 sm:max-w-sm">
        <div aria-hidden="true" className="absolute -inset-8" style={{ background: 'radial-gradient(50% 46% at 50% 44%, hsl(var(--court-royal) / 0.35), transparent 72%), radial-gradient(70% 52% at 50% 100%, hsl(var(--court-accent) / 0.12), transparent 72%)' }} />
        <ForgeAthlete3D picks={picks} editions={editions} spinning={spinning} className="absolute inset-0 h-full w-full" />
        {SKILLS.map((skill) => {
          const layout = CHIP_LAYOUT[skill.key] || { side: 'left', top: 50 };
          const pick = picks[skill.key];
          const live = Boolean(reveal) && !pick && (mode === 'wheel' || selectedKey === skill.key) && Number.isFinite(reveal[skill.key]);
          const armed = mode === 'pick' && !pick && !reveal && !spinning && selectedKey === skill.key;
          const selectable = mode === 'pick' && !pick && !reveal && !spinning;
          const clickable = live || armed || selectable && !selectedKey;
          const isBest = live && skill.key === bestLiveKey;
          const tone = pick ? 'forge-stage-chip--filled' : isBest ? 'forge-stage-chip--best' : live ? 'forge-stage-chip--live' : armed || selectedKey === skill.key && mode === 'pick' ? 'forge-stage-chip--armed' : 'forge-stage-chip--open';
          return <button key={skill.key} type="button" disabled={!clickable}
          onClick={() => live ? onAssign(skill.key) : onSelect(skill.key)}
          className={`forge-stage-chip ${tone}${clickable ? ' cursor-pointer' : ''}`}
          style={{ top: `${layout.top}%`, [layout.side === 'left' ? 'left' : 'right']: '0%' }}>
            <span>{skill.label}</span>
            {live && <span className="forge-stage-chip-val">{skill.fmt(reveal[skill.key])}</span>}
            {isBest && <span className="text-[8px] font-bold uppercase tracking-widest">★ best</span>}
            {showGrades && pick && <span className="forge-stage-chip-grade">{gradeFor(pick.value)}</span>}
          </button>;
        })}
      </div>
    </div>
    <ForgeWardrobeControls picks={picks} editions={editions} onEdition={onEdition} />
  </section>;
}