import React from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { SKILLS, gradeFor, gradeTone } from '@/components/forge/bapSkills';
import { getForgeCompositeOvrContext } from './forgeOverall';

const TONE = {
  positive: 'border-positive/60 bg-positive/15 text-positive',
  royal: 'border-royal/60 bg-royal/15 text-royal-ink',
  gold: 'border-gold/60 bg-gold/15 text-gold',
  trim: 'border-trim/60 bg-trim/15 text-trim-ink',
};

// Build summary embedded above the athlete: live OVR and horizontal selections.
export default function ForgeOvrPanel({ picks, group = 'All', overall, showGrades }) {
  const context = getForgeCompositeOvrContext(picks, group);
  const filledSkills = SKILLS.filter(skill => picks[skill.key]);
  const remaining = SKILLS.length - filledSkills.length;
  const progress = filledSkills.length / SKILLS.length;
  const ringRadius = 42;
  const ring = 2 * Math.PI * ringRadius;
  const tally = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  filledSkills.forEach(skill => { tally[gradeFor(picks[skill.key].value)] += 1; });
  const best = filledSkills.reduce((top, skill) => (!top || picks[skill.key].value > picks[top.key].value ? skill : top), null);
  return <section className="forge-composite-summary" aria-label="Overall and selections">
    <div className="forge-composite-summary__overview">
      <div className="forge-composite-summary__score" aria-label={`Overall rating: ${overall ?? 'not yet rated'}`}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={ringRadius} fill="hsl(var(--court-canvas))" stroke="hsl(var(--court-raised))" strokeWidth="7" />
          <circle cx="50" cy="50" r={ringRadius} fill="none" stroke="hsl(var(--court-accent))" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${ring * progress} ${ring}`} style={{ transition: 'stroke-dasharray .4s ease' }} />
        </svg>
        <motion.strong key={overall ?? 'none'} initial={{ scale: 1.25, opacity: .4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 18 }}>{overall ?? '–'}</motion.strong>
        <span>OVR</span>
      </div>
      <div className="forge-composite-summary__context">
        <p title={group === 'All' ? 'Weights follow your Body donor, or the assigned donor roles until Body is chosen.' : `Weights stay fixed for the ${group} draft group.`}>{context.label}</p>
        <strong>{filledSkills.length}/{SKILLS.length} selected</strong>
        <span>{Math.round(progress * 100)}% forged · {remaining} open</span>
      </div>
      <div className="forge-composite-summary__heat" aria-hidden="true">
        {SKILLS.map((skill, index) => <span key={skill.key} data-filled={index < filledSkills.length} />)}
      </div>
      {showGrades && <div className="forge-composite-summary__grades">
      {Object.entries(tally).filter(([, count]) => count > 0).map(([grade, count]) => (
        <span key={grade} className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold ${TONE[{ A: 'positive', B: 'royal', C: 'gold', D: 'trim', F: 'trim' }[grade]]}`}>{count}× {grade}</span>
      ))}
      {filledSkills.length === 0 && <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/75">No grades yet</span>}
      </div>}
    {best && (
      <div className="forge-composite-summary__best">
        <Flame className="h-3 w-3 shrink-0 text-gold" />
        <p>Best: <span>{best.label}</span> <span className="font-mono">{best.fmt(picks[best.key].value)}</span></p>
      </div>
    )}
    </div>
    <div className="forge-composite-summary__selection-rail" role="region" aria-label="Composite selections" tabIndex={0}>
      <ul className="forge-composite-summary__selections">
      {SKILLS.map(skill => {
        const pick = picks[skill.key];
        return <li key={skill.key} className={`forge-composite-summary__selection${pick ? ' forge-composite-summary__selection--filled' : ''}`} data-skill={skill.key} title={pick ? `${skill.label}: ${pick.player.name} · DJHC ${skill.fmt(pick.value)}` : `${skill.label}: open slot`}>
          <div className="forge-composite-summary__skill">
            <span>{skill.label}</span>
            <strong>{pick ? skill.fmt(pick.value) : '—'}</strong>
          </div>
          <div className="forge-composite-summary__donor">
            {pick && <PlayerPortrait player={pick.player} className="h-5 w-5 shrink-0" frameless />}
            <span>{pick ? pick.player.name : 'Open slot'}</span>
            {pick && showGrades && <small className={`rounded border px-1 font-mono font-bold ${TONE[gradeTone(pick.value)]}`}>{gradeFor(pick.value)}</small>}
          </div>
        </li>;
      })}
      </ul>
    </div>
  </section>;
}
