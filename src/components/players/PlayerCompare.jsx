import React, { useState } from 'react';
import { GitCompare } from 'lucide-react';
import CourtGraphic from '@/components/studio/CourtGraphic';
import PlayerCompareIndex from '@/components/players/PlayerCompareIndex';
import ComparePlayerCard from '@/components/players/ComparePlayerCard';
import { BLUEPRINT_STATS, statText } from '@/components/players/blueprintModel';

const INVERT = new Set(['tov']);

// Head-to-head comparison built in the dossier's visual language:
// a workbench header with court graphic, a player index with A/B slots,
// a pair of profile cards, then a full side-by-side stat table.
export default function PlayerCompare({ roster }) {
  const [picked,setPicked] = useState({ a:null,b:null });
  const players = { a: roster.find(row => row.id === picked.a) || null, b: roster.find(row => row.id === picked.b) || null };
  const assign = (slot,id) => setPicked(current => ({ ...current,[slot]: current[slot] === id ? null : id }));
  const onClear = () => setPicked({ a:null,b:null });
  const slotPanel = slot => players[slot] ? <ComparePlayerCard player={players[slot]} slot={slot} /> :
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/30 p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-gold/30 bg-gold/5"><GitCompare className="h-6 w-6 text-gold" /></span>
      <p className="font-display text-xl tracking-wide">No player {slot.toUpperCase()} yet</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">Assign a player from the index using the {slot.toUpperCase()} button next to their row.</p>
    </div>;
  const leader = key => {
    const va = players.a?.stats?.[key], vb = players.b?.stats?.[key];
    if (!Number.isFinite(va) || !Number.isFinite(vb) || va === vb) return null;
    return (INVERT.has(key) ? va < vb : va > vb) ? 'a' : 'b';
  };
  return <section className="rounded-2xl border border-border/35 bg-card shadow-[0_8px_24px_hsl(var(--background)/0.2)]">
    <header className="relative overflow-hidden border-b border-border/30 p-4">
      <CourtGraphic className="absolute -right-10 -top-10 h-44 w-64 opacity-10" />
      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Player comparison</p>
        <h2 className="mt-1 font-display text-2xl tracking-wide">Head-to-head stat comparison</h2>
      </div>
    </header>
    <div className="space-y-5 p-4">
      <PlayerCompareIndex rows={roster} picked={picked} onAssign={assign} onClear={onClear} />
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        {slotPanel('a')}
        {slotPanel('b')}
      </div>
      {players.a && players.b ?
        <div className="court-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Stat</th>
                <th className="text-right">{players.a.name} <span className="text-gold">({players.a.teamCode})</span></th>
                <th className="text-right">{players.b.name} <span className="text-gold">({players.b.teamCode})</span></th>
              </tr>
            </thead>
            <tbody>
              {BLUEPRINT_STATS.map(([key,label,group]) => {
                const leaderKey = leader(key);
                const cell = side => {
                  const player = players[side];
                  return <td className={`text-right ${leaderKey === side ? 'font-semibold text-gold' : ''}`}>{statText(key,player.stats[key])}</td>;
                };
                return (
                  <tr key={key}>
                    <td className="text-left"><span className="text-muted-foreground">{label}</span><span className="block text-[10px] uppercase tracking-widest text-muted-foreground/70">{group}</span></td>
                    {cell('a')}
                    {cell('b')}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div> :
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/30 p-8 text-center">
          <p className="font-display text-xl tracking-wide">Pick both players</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">The full side-by-side stat table appears once both slots are assigned. Turnovers reward the lower number.</p>
        </div>}
    </div>
  </section>;
}