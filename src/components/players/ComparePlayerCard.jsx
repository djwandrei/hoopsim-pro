import React from 'react';
import { Image } from '@/components/ui/image';
import { teamAsset } from '@/components/studio/teamAssets';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';
import { statText } from '@/components/players/blueprintModel';

const STRIP = [['pts','PPG'],['reb','RPG'],['ast','APG']];

// Dossier-style profile header for one side of the comparison:
// gold top border, team logo watermark, portrait and a per-game stat strip.
export default function ComparePlayerCard({ player, slot }) {
  const teamName = paletteForTeam(player.teamCode).team;
  const logo = teamAsset(player.teamCode);
  return <article className="court-panel overflow-hidden">
    <header className="relative overflow-hidden border-b border-border/30">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold via-gold/40 to-transparent" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-br from-canvas/70 via-surface/80 to-raised/90" aria-hidden="true" />
      {logo && <Image src={logo} alt="" aria-hidden="true" fittingType="fit" className="absolute -left-6 top-1/2 h-64 w-64 -translate-y-1/2 opacity-20 object-contain" />}
      <div className="relative flex items-center justify-end p-4">
        <span className="rounded-full border border-gold/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[.2em] text-gold">Player {slot.toUpperCase()}</span>
      </div>
      <div className="relative flex items-end gap-4 pl-5 pr-5">
        <PlayerPortrait player={player} frameless className="h-36 w-32 shrink-0 rounded-t-2xl sm:h-40 sm:w-36" />
        <div className="min-w-0 flex-1 pb-4">
          <h3 className="font-display text-3xl uppercase leading-[0.9]">{player.name}</h3>
          <p className="mt-2 text-xs text-muted-foreground">{player.teamCode} · {teamName} · {player.positions.join(' / ')}</p>
        </div>
      </div>
    </header>
    <div className="grid grid-cols-3 divide-x divide-border/30 border-b border-border/30 bg-gradient-to-b from-canvas/60 to-transparent">
      {STRIP.map(([key,label]) => <div key={key} className="px-3 py-3 text-center"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-gold">{label}</p><p className="mt-0.5 font-display text-2xl text-foreground">{statText(key,player.stats[key])}</p><p className="text-[10px] text-muted-foreground">per game</p></div>)}
    </div>
  </article>;
}