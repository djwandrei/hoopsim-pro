import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BODY_COLORS, DEFAULT_APPEARANCE, WARDROBE_EDITIONS, WARDROBE_SKILLS } from '@/components/forge/forgeWardrobeRules';

export default function ForgeWardrobeControls({ picks, editions, onEdition, appearance = DEFAULT_APPEARANCE, onAppearance = () => {} }) {
  return <div aria-label="Player appearance and uniform controls" className="grid w-full gap-2 rounded-lg border border-border/40 bg-raised p-2 text-xs">
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
    <label className="flex items-center justify-between gap-2">Player color<select value={appearance.bodyColor || 'silhouette'} onChange={e => onAppearance('bodyColor', e.target.value)} className="studio-select w-28">{Object.keys(BODY_COLORS).map(color => <option key={color} value={color}>{color}</option>)}</select></label>
    <label className="flex items-center justify-between gap-2">Basketball<select value={appearance.ballColor || 'classic'} onChange={e => onAppearance('ballColor', e.target.value)} className="studio-select w-28"><option value="classic">Classic orange</option><option value="midnight">Midnight</option></select></label>
    <fieldset className="grid grid-cols-2 gap-2 border-t border-border/30 pt-2"><legend className="px-1 text-muted-foreground">Accessories</legend>{[['headband','Headband'],['rightSleeve','Shooting sleeve'],['wristband','Wristband'],['kneeSleeve','Knee sleeve']].map(([key,label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={appearance[key] !== false} onChange={e => onAppearance(key, e.target.checked)} />{label}</label>)}</fieldset>
  </div>;
}
