import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="mt-1 font-mono text-gold">PTS {Number(payload[0]?.payload.pts).toFixed(1)}</p>
      <p className="font-mono" style={{ color: 'hsl(var(--court-royal))' }}>REB {Number(payload[0]?.payload.reb).toFixed(1)}</p>
      <p className="font-mono text-muted-foreground">AST {Number(payload[0]?.payload.ast).toFixed(1)}</p>
    </div>
  );
};

const lastName = name => (name || '').split(' ').slice(-1)[0] || '—';

// Top scorers from both rosters, comparing points / rebounds / assists per game.
export default function PlayerStatsChart({ teamA, teamB }) {
  const data = useMemo(() => {
    const combined = [
      ...(teamA.roster || []).map(player => ({ ...player, team: teamA.code })),
      ...(teamB.roster || []).map(player => ({ ...player, team: teamB.code })),
    ].sort((x, y) => y.pts - x.pts).slice(0, 10);
    return combined.map(player => ({ name: lastName(player.name), code: player.team, pts: player.pts, reb: player.reb, ast: player.ast }));
  }, [teamA, teamB]);
  return (
    <section className="myna-panel p-4" aria-label="Player stats">
      <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">PLAYER STATS</p>
      <h3 className="myna-display mt-1 text-2xl">TOP SCORERS ON THE BOARD</h3>
      <p className="mt-1 text-xs myna-muted">The 10 highest scorers across both rosters, per game.</p>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] myna-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-gold" />PTS</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'hsl(var(--court-royal))' }} />REB</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-raised" />AST</span>
      </div>
      <div className="mt-2 h-80" role="img" aria-label="Bar chart of top scorers across both teams">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
            <CartesianGrid stroke="hsl(var(--border) / .3)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} interval={0} angle={-45} textAnchor="end" height={58} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
            <Tooltip content={tip} cursor={{ fill: 'hsl(var(--court-accent) / .08)' }} />
            <Bar dataKey="pts" fill="hsl(var(--court-accent))" isAnimationActive={false} radius={[3, 3, 0, 0]} />
            <Bar dataKey="reb" fill="hsl(var(--court-royal))" isAnimationActive={false} radius={[3, 3, 0, 0]} />
            <Bar dataKey="ast" fill="hsl(var(--court-raised))" isAnimationActive={false} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}