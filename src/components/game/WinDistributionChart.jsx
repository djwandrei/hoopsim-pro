import React, { useMemo } from 'react';
import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { actualStandings } from '@/lib/season/simEngine';

const tip = ({ active, payload, teamA, teamB }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{row.name}</p>
      <p data-team-side={row.code === teamA.code ? 'home' : row.code === teamB.code ? 'away' : undefined} className="mt-1 font-mono matchup-side-text">{row.wins} wins · {row.losses} losses</p>
    </div>
  );
};

// Observed team wins; selected teams carry their official matchup colors.
export default function WinDistributionChart({ source, league, teamA, teamB }) {
  const data = useMemo(() => {
    const wins = actualStandings(source);
    const played = new Map();
    for (const game of source.schedule || []) {
      if (!game.actual) continue;
      played.set(game.home, (played.get(game.home) || 0) + 1);
      played.set(game.away, (played.get(game.away) || 0) + 1);
    }
    return league.teams
      .map(team => ({ code: team.code, name: team.name, wins: wins.get(team.code) || 0, losses: Math.max(0, (played.get(team.code) || 0) - (wins.get(team.code) || 0)) }))
      .sort((x, y) => y.wins - x.wins);
  }, [source, league]);
  const fillFor = code => (code === teamA.code ? 'var(--matchup-home-chart)' : code === teamB.code ? 'var(--matchup-away-chart)' : 'var(--myna-raised)');
  return (
    <section className="myna-panel p-4" aria-label="Win distribution">
      <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">WIN DISTRIBUTION</p>
      <h3 className="myna-display mt-1 text-2xl">OBSERVED WINS BY TEAM</h3>
      <p className="mt-1 text-xs myna-muted">Every team's actual win total; {teamA.code} and {teamB.code} are highlighted.</p>
      <div className="mt-3 h-72" role="img" aria-label="Bar chart of observed wins for each team">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
            <CartesianGrid stroke="hsl(var(--border) / .3)" vertical={false} />
            <XAxis dataKey="code" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} interval={0} angle={-60} textAnchor="end" height={52} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
            <Tooltip content={props => tip({ ...props, teamA, teamB })} cursor={{ fill: 'hsl(var(--court-accent) / .08)' }} />
            <Bar dataKey="wins" isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={26}>
              {data.map(row => <Cell key={row.code} fill={fillFor(row.code)} stroke={row.code === teamA.code ? 'var(--matchup-home-color)' : row.code === teamB.code ? 'var(--matchup-away-color)' : 'var(--myna-border)'} />)}
              <LabelList dataKey="wins" position="top" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}