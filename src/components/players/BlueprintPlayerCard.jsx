import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { teamAsset } from '@/components/studio/teamAssets';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import BlueprintStatGrid from '@/components/players/BlueprintStatGrid';
import BlueprintStatsTable from '@/components/players/BlueprintStatsTable';
import TrophyCase from '@/components/players/TrophyCase';
import PlayerBio from '@/components/players/PlayerBio';
import PlayerPercentileBars from '@/components/players/PlayerPercentileBars';
import PlayerContextTiles from '@/components/players/PlayerContextTiles';
import PlayerCareerRecord from '@/components/players/PlayerCareerRecord';
import usePlayerContext from '@/components/players/usePlayerContext';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';
import { statText } from '@/components/players/blueprintModel';

const STRIP = [['pts','PPG'],['reb','RPG'],['ast','APG']];

export default function BlueprintPlayerCard({ player, onRemove, atlas }) {
  const [tab,setTab] = useState('profile');
  const { context,status } = usePlayerContext(player.name);
  const profiles = context?.nba?.profiles || [];
  const bio = profiles.find(row => Number.isFinite(row.ageBySeason?.[String(player.seasonStartYear)])) || profiles[0] || context?.nba?.roster;
  const teamName = paletteForTeam(player.teamCode).team;
  const logo = teamAsset(player.teamCode);
  const details = [
    bio?.height?.display || null,
    Number.isFinite(bio?.weightPounds) ? `${bio.weightPounds} lb` : null,
    bio?.jerseyNumber ? `#${bio.jerseyNumber}` : null,
  ].filter(Boolean).join(' · ');
  return <article className="court-panel overflow-hidden">
    <header className="relative overflow-hidden border-b border-border/30">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold via-gold/40 to-transparent" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-br from-canvas/70 via-surface/80 to-raised/90" aria-hidden="true" />
      {logo && <Image src={logo} alt="" aria-hidden="true" fittingType="fit" className="absolute -left-6 top-1/2 h-64 w-64 -translate-y-1/2 opacity-20 object-contain" />}
      <div className="relative flex items-center justify-end gap-2 p-4">
        <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>Player profile</span>
        {onRemove && <button type="button" onClick={() => onRemove(player)} aria-label={`Remove ${player.name}`} className="rounded-lg border border-border/30 p-2 text-muted-foreground transition-colors hover:border-trim/40 hover:text-foreground"><X className="h-4 w-4" /></button>}
      </div>
      <div className="relative flex items-end gap-5 pl-5 pr-5">
        <PlayerPortrait key={player.headshotPath || player.playerRef} player={player} frameless className="h-44 w-40 shrink-0 rounded-t-2xl sm:h-52 sm:w-44" />
        <div className="min-w-0 flex-1 pb-4">
          <h2 className="font-display text-4xl uppercase leading-[0.9] sm:text-5xl">{player.name}</h2>
          <span className="hero-rule mt-3" aria-hidden="true"></span>
          <p className="mt-2 text-xs text-muted-foreground">{player.teamCode} · {teamName} · {player.positions.join(' / ')}</p>
          {details && <p className="mt-1 text-[11px] text-muted-foreground">Player details · {details}</p>}
        </div>
      </div>
    </header>
    <div className="grid grid-cols-3 divide-x divide-border/30 border-b border-border/30 bg-gradient-to-b from-canvas/60 to-transparent">
      {STRIP.map(([key,label]) => <div key={key} className="px-3 py-3.5 text-center"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-gold">{label}</p><p className="mt-0.5 font-display text-3xl text-foreground">{statText(key,player.stats[key])}</p><p className="text-[10px] text-muted-foreground">per game</p></div>)}
    </div>
    <nav aria-label={`${player.name} detail tabs`} className="flex divide-x divide-border/25 border-b border-border/30 bg-canvas/40">
      {['profile','stats','bio'].map(key => <button type="button" key={key} onClick={() => setTab(key)} aria-pressed={tab === key} className={`flex-1 px-3 py-2.5 text-xs capitalize transition-colors ${tab === key ? 'font-semibold text-gold shadow-[inset_0_-2px_0_hsl(var(--court-accent))]' : 'text-muted-foreground hover:text-foreground'}`}>{key}</button>)}
    </nav>
    <div className="p-5">
      {tab === 'profile' && <section>
        <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-gold">Player profile</p>
        <h3 className="mt-1 font-display text-2xl uppercase tracking-wide text-foreground">Player context</h3>
        <PlayerContextTiles bio={bio} status={status} />
        <p className="mt-6 text-[10px] font-semibold uppercase tracking-[.2em] text-gold">Career record</p>
        <h3 className="mt-1 font-display text-2xl uppercase tracking-wide text-foreground">Career regular-season totals and averages</h3>
        <PlayerCareerRecord context={context} status={status} />
      </section>}
      {tab === 'stats' && <><BlueprintStatGrid player={player} /><BlueprintStatsTable player={player} /><PlayerPercentileBars player={player} atlas={atlas} /></>}
      {tab === 'bio' && <><PlayerBio player={player} context={context} status={status} /><TrophyCase context={context} status={status} /></>}
      <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">{player.statsSource}. Player portraits and biography context may be current; statistics remain bound to the selected team, season and phase.</p>
    </div>
  </article>;
}