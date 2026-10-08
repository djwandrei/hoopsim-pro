import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { WARDROBE_EDITIONS, WARDROBE_SKILLS } from '@/components/forge/forgeWardrobeRules';

export default function ForgeWardrobeControls({ picks, editions, onEdition }) {
  if (!picks.scoring && !picks.rebounding) return null;
  return <div aria-label="Unlocked uniform variations" className="grid w-full gap-2 rounded-lg border border-border/40 bg-raised p-2 text-xs">
    {['jersey', 'shorts'].map(element => {
      const pick = picks[WARDROBE_SKILLS[element]];
      if (!pick) return null;
      const edition = editions[element] || 'icon', index = WARDROBE_EDITIONS.indexOf(edition);
      const cycle = step => onEdition(element, WARDROBE_EDITIONS[(index + step + WARDROBE_EDITIONS.length) % WARDROBE_EDITIONS.length]);
      return <div key={element} className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-foreground"><span className="capitalize">{element}</span> · {pick.player.teamCode}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => cycle(-1)} aria-label={`Previous ${element} edition`} className="grid h-9 w-9 place-items-center rounded border border-border/50 bg-card text-foreground hover:border-gold"><ChevronLeft className="h-4 w-4" /></button>
          <span aria-live="polite" className="w-20 text-center capitalize text-foreground">{edition}</span>
          <button type="button" onClick={() => cycle(1)} aria-label={`Next ${element} edition`} className="grid h-9 w-9 place-items-center rounded border border-border/50 bg-card text-foreground hover:border-gold"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>;
    })}
  </div>;
}