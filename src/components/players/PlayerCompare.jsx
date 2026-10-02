import React, { useState } from 'react';
import { BLUEPRINT_STATS, statText } from '@/components/players/blueprintModel';

const INVERT = new Set(['tov']);
const selectClass = 'min-h-11 w-full rounded-lg border border-input bg-raised/40 px-3 py-2 text-sm text-foreground';

// Side-by-side comparison of two picked players across every tracked stat;
// the leader in each row is highlighted, with turnovers rewarding the lower value.
export default function PlayerCompare({ roster }) {
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const a = roster.find(row => row.id === aId) || roster[0] || null;
  const b = roster.find(row => row.id === bId) || roster[1] || null;
  const leader = key => {
    const va = a?.stats?.[key], vb = b?.stats?.[key];
    if (!Number.isFinite(va) || !Number.isFinite(vb) || va === vb) return null;
    return (INVERT.has(key) ? va < vb : va > vb) ? 'a' : 'b';
  };
  return (
    <section className="space-y-4">
      <div className="court-panel p-5">
        <p className="court-kicker">Head to head</p>
        <h2 className="court-display mt-1 text-2xl">PLAYER COMPARISON</h2>
        <p className="mt-1 text-xs text-muted-foreground">Pick any two players; the leader in each stat is highlighted in gold. Turnovers reward the lower number.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="studio-control-label">Player A</span>
            <select className={selectClass} value={a?.id || ''} onChange={e => setAId(e.target.value)}>
              {roster.map(row => <option key={row.id} value={row.id}>{row.name} ({row.teamCode})</option>)}
            </select>
          </label>
          <label className="block">
            <span className="studio-control-label">Player B</span>
            <select className={selectClass} value={b?.id || ''} onChange={e => setBId(e.target.value)}>
              {roster.map(row => <option key={row.id} value={row.id}>{row.name} ({row.teamCode})</option>)}
            </select>
          </label>
        </div>
      </div>
      {a && b ?
        <div className="court-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Stat</th>
                <th className="text-right">{a.name} <span className="text-gold">({a.teamCode})</span></th>
                <th className="text-right">{b.name} <span className="text-gold">({b.teamCode})</span></th>
              </tr>
            </thead>
            <tbody>
              {BLUEPRINT_STATS.map(([key,label,group]) => {
                const leaderKey = leader(key);
                const cell = side => {
                  const player = side === 'a' ? a : b;
                  return <td className={`text-right ${leaderKey === side ? 'font-semibold text-gold' : ''}`}>{statText(key,player?.stats?.[key])}</td>;
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
        <div className="court-panel p-5 text-xs text-muted-foreground">Select two players to compare their observed season lines.</div>
      }
    </section>
  );
}