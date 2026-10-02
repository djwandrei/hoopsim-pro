import React from 'react';
import { Check } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';
import PlayerPortrait from '@/components/players/PlayerPortrait';
export default function SpinSelection({ latest }) {
  const player = latest.displayPlayer;
  return <section className="court-panel border-gold/35 p-5"><div className="flex items-center gap-4"><PlayerPortrait player={player} className="h-28 w-24" /><div className="min-w-0"><p className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-positive"><Check className="h-3 w-3" />Pick {latest.spinNumber} confirmed</p><h2 className="mt-2 font-display text-3xl">{player.name}</h2><p className="mt-2 text-xs text-muted-foreground">{player.positions.join(' / ')} · {player.seasonStartYear}–{String(player.seasonStartYear+1).slice(-2)} · Source games {player.games}</p><div className="mt-3 flex flex-wrap gap-2">{player.teamCodes.map(code => <span key={code} className="flex items-center gap-1.5 rounded-lg border border-border/30 px-2 py-1 text-xs"><TeamMark code={code} className="h-7 w-7" />{code}</span>)}</div></div></div><p className="mt-4 border-t border-border/30 pt-3 text-xs text-muted-foreground">The original site's stable player-reference pool, package-derived seed and source position filters determine the draw. This is a seeded selection, not a skill rating.</p></section>;
}