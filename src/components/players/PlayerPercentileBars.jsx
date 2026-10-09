import React from 'react';
import { statText } from '@/components/players/blueprintModel';
import { ordinalText } from '@/components/players/leagueAtlas';
const METRICS = [['pts','PPG'],['ast','APG'],['reb','RPG'],['mpg','MPG'],['stl','SPG'],['blk','BPG'],['ts','TS%'],['three','3P%'],['ft','FT%'],['tov','TOV']];
export default function PlayerPercentileBars({ player, atlas }) {
  const rows = METRICS.map(([key,label]) => ({ key,label,value:player.stats[key],pct:atlas?.percentile(key,player.stats[key]) }));
  if (!atlas || rows.every(row => row.pct === null)) return null;
  return <section className="mt-5 border-t border-border/30 pt-4"><div className="flex items-center justify-between"><h3 className="font-display text-xl">LEAGUE PERCENTILES</h3><span className="text-[10px] text-muted-foreground">vs {atlas.count} loaded rows</span></div><ul className="mt-3 grid gap-2.5 sm:grid-cols-2">{rows.map(row => <li key={row.key} className="min-w-0"><div className="flex items-baseline justify-between gap-2 text-[11px]"><span className="text-muted-foreground">{row.label}</span><span className="font-mono text-foreground">{statText(row.key,row.value)}{row.pct !== null && <span className="ml-1.5 text-gold">{ordinalText(row.pct)}</span>}</span></div><div className="mt-1 h-1.5 rounded bg-raised"><div className={row.pct !== null && row.pct >= 75 ? 'h-full rounded bg-gold' : 'h-full rounded bg-royal/70'} style={{ width:`${row.pct ?? 0}%` }} /></div></li>)}</ul><p className="mt-3 text-[10px] text-muted-foreground">Percentile is the share of loaded rows at or below this value. Gold bars mark the top quartile.</p></section>;
}
