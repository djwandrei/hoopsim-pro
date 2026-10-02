import React from 'react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';

const one = value => (Number(value) || 0).toFixed(1);
const int = value => String(Math.round(Number(value) || 0));
const pct = value => `${((Number(value) || 0) * 100).toFixed(1)}%`;

// Real box-score stats from the season source, shown as a stat strip.
const BIG_STATS = [
  { key:'pts', label:'PTS', fmt:one },
  { key:'reb', label:'REB', fmt:one },
  { key:'ast', label:'AST', fmt:one },
  { key:'stl', label:'STL', fmt:one },
  { key:'blk', label:'BLK', fmt:one },
];
const CONTEXT_STATS = [
  { key:'mpg', label:'MIN / GAME', fmt:one },
  { key:'games', label:'GP', fmt:int },
  { key:'fg', label:'FG%', fmt:pct },
  { key:'tpp', label:'3P%', fmt:pct },
];

// Wide showcase beside the reels: the revealed player's real per-game stat line.
export default function ForgePlayerShowcase({ player, note }) {
  return <section aria-label="Player showcase" className="court-panel relative overflow-hidden p-4">
    <span className="bcast-watermark" aria-hidden="true">FRG</span>
    {player ? <header className="relative flex flex-wrap items-center gap-3">
      <PlayerPortrait player={player} className="h-16 w-16 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="bcast-kicker">Player showcase</p>
        <h2 className="truncate font-display text-2xl tracking-wide">{player.name}</h2>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><TeamMark code={player.teamCode} className="h-4 w-4" />{player.teamCode}{player.positions?.[0] ? ` · ${player.positions.join(' / ')}` : ''} · {player.games} GP</p>
      </div>
      {note && <p className="shrink-0 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-gold">{note}</p>}
    </header> : <div className="relative flex min-h-44 flex-col items-center justify-center text-center">
      <p className="bcast-kicker">Player showcase</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">Spin the reels — the revealed player's real stat line lands here.</p>
    </div>}
    {player && <React.Fragment>
      <div className="relative mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {BIG_STATS.map(stat => <div key={stat.key} className="metric-tile text-center">
          <p className="font-display text-2xl leading-none text-gold">{stat.fmt(player[stat.key])}</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{stat.label}</p>
        </div>)}
      </div>
      <div className="relative mt-2 flex flex-wrap justify-center gap-2">
        {CONTEXT_STATS.map(stat => <span key={stat.key} className="bcast-lowerthird">{stat.label}<span className="text-foreground">{stat.fmt(player[stat.key])}</span></span>)}
      </div>
    </React.Fragment>}
  </section>;
}