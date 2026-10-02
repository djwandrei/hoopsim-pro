import React from 'react';
import { BLUEPRINT_STATS, statText } from '@/components/players/blueprintModel';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import BlueprintMetricChart from '@/components/players/BlueprintMetricChart';
const LOWER_BETTER = new Set(['tov']);
export default function BlueprintComparison({ players }) {
  const leaderFor = key => {
    const values = players.map(player => ({ id:player.id,value:player.stats[key] })).filter(item => Number.isFinite(item.value));
    if (values.length < 2) return null;
    const best = LOWER_BETTER.has(key) ? Math.min(...values.map(item => item.value)) : Math.max(...values.map(item => item.value));
    const winners = values.filter(item => item.value === best).map(item => item.id);
    return winners.length === players.length ? null : winners;
  };
  return <section className="court-panel p-5"><p className="court-kicker">Side by side</p><h2 className="mt-1 font-display text-2xl">EXACT-SEASON COMPARISON</h2><div className="mt-5"><BlueprintMetricChart players={players} /></div><div className="overflow-x-auto" tabIndex={0} aria-label="Selected player comparison"><table className="w-full text-xs"><thead><tr><th className="text-left">STAT</th>{players.map(player => <th key={player.id} className="min-w-32 text-right"><div className="flex flex-col items-end gap-2"><PlayerPortrait player={player} className="h-14 w-14" /><span className="max-w-36 text-wrap normal-case tracking-normal">{player.name}</span><span className="text-[10px] text-muted-foreground">{player.teamCode}</span></div></th>)}</tr></thead><tbody>{BLUEPRINT_STATS.map(([key,label]) => { const leaders = leaderFor(key);return <tr key={key}><td className="text-muted-foreground">{label}</td>{players.map(player => { const leads = leaders?.includes(player.id);return <td key={player.id} className={leads ? 'text-right font-mono text-gold' : key === 'pts' ? 'text-right font-mono text-gold/70' : 'text-right font-mono'}>{statText(key,player.stats[key])}{leads && <span className="ml-1.5 inline-block rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wider text-gold">leads</span>}</td>; })}</tr>; })}</tbody></table></div><p className="mt-4 text-xs text-muted-foreground">Gold "leads" tags mark the best observed value in each row (fewest turnovers leads that row). Descriptive comparison, not a player ranking or prediction.</p></section>;
}