import React from 'react';
import { MousePointerClick } from 'lucide-react';
import { SKILLS } from '@/components/forge/bapSkills';

// The player picks which attribute to draft next (opposite of the wheel draft).
export default function ForgeSkillSelect({ picks, selectedKey, onSelect, disabled }) {
  return <div>
    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"><MousePointerClick className="h-3.5 w-3.5 text-gold" />Pick a skill to draft</p>
    <div className="grid grid-cols-3 gap-2">
      {SKILLS.map(skill => {
        const pick = picks[skill.key];
        const selected = selectedKey === skill.key;
        return <button key={skill.key} type="button" disabled={Boolean(pick) || disabled} onClick={() => onSelect(skill.key)} className={`rounded-lg border px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider transition-colors ${pick ? 'border-border/25 bg-gold/5 text-muted-foreground' : selected ? 'border-gold bg-gold/15 text-gold shadow-[0_0_0_3px_hsl(var(--court-accent)/0.15)]' : 'border-border/30 text-foreground hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-50'}`}>
          <span className="block">{skill.label}</span>
          <span className="block font-mono text-[9px] normal-case tracking-normal opacity-75">{pick ? 'filled' : skill.metric}</span>
        </button>;
      })}
    </div>
  </div>;
}