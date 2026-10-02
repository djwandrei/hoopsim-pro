import React from 'react';
import { MousePointerClick } from 'lucide-react';
import PlayerHubSidebar from '@/components/players/PlayerHubSidebar';
import BlueprintPlayerCard from '@/components/players/BlueprintPlayerCard';
import CourtGraphic from '@/components/studio/CourtGraphic';

export default function PlayerHub({ roster, phaseRows, phase, onPhaseChange, selected, onToggle, onClear, atlas }) {
  return <section className="rounded-2xl border border-border/35 bg-card shadow-[0_8px_24px_hsl(var(--background)/0.2)]">
    <header className="relative overflow-hidden border-b border-border/30 p-4"><CourtGraphic className="absolute -right-10 -top-10 h-44 w-64 opacity-10" /><p className="relative text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Player dossier</p><h2 className="relative mt-1 font-display text-2xl tracking-wide">Open a player from the index</h2></header>
    <div className="grid gap-5 p-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <div className="min-w-0 lg:sticky lg:top-[calc(var(--djhc-header-h,0px)+1rem)] lg:self-start"><PlayerHubSidebar rows={roster} phase={phase} onPhaseChange={onPhaseChange} selected={selected} onToggle={onToggle} onClear={onClear} /></div>
      <div className="min-w-0 space-y-5">
        {selected.length ? selected.map(player => <BlueprintPlayerCard key={`${player.id}:${phase}`} player={player} atlas={atlas} onRemove={onToggle} />) : <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/30 p-10 text-center"><MousePointerClick className="h-8 w-8 text-gold" /><p className="font-display text-xl tracking-wide text-foreground">No player pinned yet</p><p className="max-w-sm text-xs leading-relaxed text-muted-foreground">Search the player index and pin up to four dossiers at once, or pin straight from the League Atlas scatter and leader board.</p></div>}
      </div>
    </div>
  </section>;
}