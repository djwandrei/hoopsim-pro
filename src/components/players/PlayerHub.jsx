import React from 'react';
import { MousePointerClick } from 'lucide-react';
import PlayerHubSidebar from '@/components/players/PlayerHubSidebar';
import BlueprintPlayerCard from '@/components/players/BlueprintPlayerCard';
import CourtGraphic from '@/components/studio/CourtGraphic';
import SeasonSelect from '@/components/studio/SeasonSelect';

export default function PlayerHub({ roster, phaseRows, phase, onPhaseChange, selected, onToggle, onClear, atlas, season }) {
  return <section className="rounded-2xl border border-border/35 bg-card shadow-[0_8px_24px_hsl(var(--background)/0.2)]">
    <header className="relative overflow-hidden border-b border-border/30 p-4"><CourtGraphic className="absolute -right-10 -top-10 h-44 w-64 opacity-10" /><div className="relative flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Player dossier</p><h2 className="mt-1 font-display text-2xl tracking-wide">Open a player from the index</h2></div>{season && <div className="w-36"><SeasonSelect years={season.years} year={season.year} onChange={season.onYearChange} /></div>}</div></header>
    <div className="space-y-5 p-4">
      <PlayerHubSidebar rows={roster} phase={phase} onPhaseChange={onPhaseChange} selected={selected} onToggle={onToggle} onClear={onClear} />
      <div className="min-w-0 space-y-5">
        {selected.length ? selected.map(player => <BlueprintPlayerCard key={`${player.id}:${phase}`} player={player} atlas={atlas} onRemove={onToggle} />) : <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/30 p-10 text-center"><MousePointerClick className="h-8 w-8 text-gold" /><p className="font-display text-xl tracking-wide text-foreground">No player pinned yet</p><p className="max-w-sm text-xs leading-relaxed text-muted-foreground">Search the player index and pin up to four dossiers at once, or pin straight from the League Atlas scatter and leader board.</p></div>}
      </div>
    </div>
  </section>;
}