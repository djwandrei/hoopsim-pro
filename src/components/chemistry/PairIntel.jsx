import React, { useMemo, useState } from 'react';
import { observedPlayers, per36Stats, perGameStats } from '@/lib/season/labs';

const POS = [['G', 'Guards'], ['F', 'Wings'], ['C', 'Bigs']];

export default function PairIntel({ source }) {
  const players = useMemo(() => observedPlayers(source).slice(0, 80), [source]);
  const [a, setA] = useState(players[0]?.playerRef || '');
  const [b, setB] = useState(players[1]?.playerRef || '');
  if (!players.length) return null;
  const pick = ref => players.find(player => player.playerRef === ref) || players[0];
  const pa = pick(a); const pb = pick(b);
  const chips = player => POS.filter(([letter]) => (player.positions || []).some(pos => String(pos).toUpperCase().includes(letter))).map(([, label]) => label).join(' · ') || 'Position not supplied';
  const covers = letter => [pa, pb].some(player => (player.positions || []).some(pos => String(pos).toUpperCase().includes(letter)));
  const card = (player, label) => { const r36 = per36Stats(player); const game = perGameStats(player); return <div className="min-w-0 rounded-xl border border-border/25 bg-canvas/30 p-3">
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
    <p className="mt-1 truncate text-xs font-semibold">{player.name}</p>
    <p className="font-mono text-[10px] text-muted-foreground">{player.teamCode} · {chips(player)}</p>
    <dl className="mt-2 grid grid-cols-4 gap-1 font-mono text-[10px]">
      {[['MPG', game.mpg], ['PTS', r36.pts], ['REB', r36.reb], ['AST', r36.ast]].map(([key, value]) => <div key={key}><dt className="text-muted-foreground">{key}</dt><dd className="text-gold">{value.toFixed(1)}</dd></div>)}
    </dl>
  </div>; };
  const shared = pa.teamCode === pb.teamCode;
  return <section aria-label="Pair intelligence" className="space-y-4">
    <div className="court-panel p-4">
      <p className="court-kicker">Pair intelligence</p>
      <h2 className="mt-1 font-display text-2xl">PICK YOUR DUO</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">Set the pair here, mirror it in the original Chemistry Lab below.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block text-xs text-muted-foreground">Player A<select value={a} onChange={event => setA(event.target.value)} className="studio-select mt-1.5">{players.map(player => <option key={player.playerRef} value={player.playerRef}>{player.name}</option>)}</select></label>
        <label className="block text-xs text-muted-foreground">Player B<select value={b} onChange={event => setB(event.target.value)} className="studio-select mt-1.5">{players.map(player => <option key={player.playerRef} value={player.playerRef}>{player.name}</option>)}</select></label>
      </div>
    </div>
    <div className="court-panel p-4">
      <div className="grid grid-cols-2 gap-3">{card(pa, 'A')}{card(pb, 'B')}</div>
      <div className="mt-4 rounded-xl border border-border/25 bg-canvas/30 p-3 text-[11px]">
        <p className="court-kicker">Observed fit</p>
        <ul className="mt-2 space-y-1.5">
          <li className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Shared team</span><span className={shared ? 'font-semibold text-gold' : 'text-muted-foreground'}>{shared ? `${pa.teamCode} teammates` : 'Different teams'}</span></li>
          <li className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Position coverage</span><span className="font-semibold text-gold">{POS.filter(([letter]) => covers(letter)).map(([letter]) => letter).join(' · ') || 'None observed'}</span></li>
          <li className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Combined AST/36</span><span className="font-mono text-gold">{(per36Stats(pa).ast + per36Stats(pb).ast).toFixed(1)}</span></li>
          <li className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Combined REB/36</span><span className="font-mono text-gold">{(per36Stats(pa).reb + per36Stats(pb).reb).toFixed(1)}</span></li>
        </ul>
      </div>
    </div>
    <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Rates come straight from the observed player-season rows. The original Chemistry Lab below owns the full comparison and challenge.</p>
  </section>;
}