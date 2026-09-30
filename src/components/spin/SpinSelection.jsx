import React from 'react';
import { Check } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';
import MetricTile from '@/components/studio/MetricTile';
import { perGameStats } from '@/lib/season/labs';
export default function SpinSelection({ latest }) {
  const player = latest.entry;
  const stats = perGameStats(player);
  return <section className="court-panel border-gold/40 p-5"><div className="flex items-center gap-4"><TeamMark code={player.teamCode} className="h-16 w-16" /><div className="min-w-0"><p className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-positive"><Check className="h-3 w-3" />Pick {latest.spinNumber} confirmed</p><h2 className="mt-1 font-display text-3xl">{player.name}</h2><p className="mt-1 text-xs text-muted-foreground">{player.teamCode} · {player.positions.join(' / ') || 'Position not supplied'} · {player.games} reported games</p></div></div><div className="mt-5 grid grid-cols-3 gap-3"><MetricTile label="Points / G" value={stats.pts.toFixed(1)} /><MetricTile label="Rebounds / G" value={stats.reb.toFixed(1)} tone="royal" /><MetricTile label="Assists / G" value={stats.ast.toFixed(1)} /></div><p className="mt-4 text-xs text-muted-foreground">Player stats are observed source records. The draw is a seeded selection, not a talent ranking.</p></section>;
}