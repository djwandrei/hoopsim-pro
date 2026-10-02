import React, { useMemo, useState } from 'react';
import { BarChart, Bar, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { teamThemeVars } from '@/components/game/matchupTheme';

const tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const color = row?.teamInk || 'var(--myna-accent)';
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="mt-1 font-mono" style={{ color }}>{row?.statLabel} {Number(row?.value).toFixed(1)}</p>
    </div>
  );
};

const lastName = name => (name || '').split(' ').slice(-1)[0] || '—';

const STATS = [
  { key: 'pts', label: 'PTS', title: 'TOP SCORERS ON THE BOARD' },
  { key: 'reb', label: 'REB', title: 'TOP REBOUNDERS ON THE BOARD' },
  { key: 'ast', label: 'AST', title: 'TOP PLAYMAKERS ON THE BOARD' },
];

// Top 10 players from both rosters for the selected stat — sorted horizontal
// bars in each player's team color, easiest to read name-to-bar.
export default function PlayerStatsChart({ teamA, teamB }) {
  const { mode = 'dark' } = useCourtTheme() || {};
  const [stat, setStat] = useState('pts');
  const statConfig = STATS.find(s => s.key === stat);
  const { data, pA, pB } = useMemo(() => {
    const combined = [
      ...(teamA.roster || []).map(player => ({ ...player, team: teamA.code })),
      ...(teamB.roster || []).map(player => ({ ...player, team: teamB.code })),
    ].sort((x, y) => y[stat] - x[stat]).slice(0, 10);
    return {
      data: combined.map(player => ({
        name: lastName(player.name),
        teamColor: paletteForTeam(player.team).primary,
        teamInk: teamThemeVars(player.team, mode)['--team-ink'],
        value: player[stat],
        statLabel: statConfig.label,
      })),
      pA: paletteForTeam(teamA.code),
      pB: paletteForTeam(teamB.code),
    };
  }, [teamA, teamB, mode, stat, statConfig]);
  const height = Math.max(10, data.length) * 30 + 24;
  return (
    <section className="myna-panel p-4" aria-label="Player stats">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">PLAYER STATS</p>
          <h3 className="myna-display mt-1 text-2xl">{statConfig.title}</h3>
          <p className="mt-1 text-xs myna-muted">The 10 best {statConfig.label.toLowerCase()} per game across both rosters — each bar carries the player's team color.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] p-1">
          {STATS.map(option => (
            <button key={option.key} type="button" aria-pressed={stat === option.key} onClick={() => setStat(option.key)}
              className={`min-h-8 rounded-lg px-3 font-mono text-[11px] font-bold transition-colors ${stat === option.key ? 'bg-[var(--myna-accent)] text-[var(--myna-on-accent)]' : 'text-[var(--myna-muted)] hover:bg-[var(--myna-raised)]'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] myna-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: pA.primary }} />{teamA.code} players</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: pB.primary }} />{teamB.code} players</span>
      </div>
      <div className="mt-2" style={{ height }} role="img" aria-label={`Horizontal bar chart of top ${statConfig.label.toLowerCase()} across both teams, colored by team`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="hsl(var(--border) / .3)" />
            <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={80} interval={0} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <Tooltip content={tip} cursor={{ fill: 'hsl(var(--court-accent) / .08)' }} />
            <Bar dataKey="value" isAnimationActive={false} barSize={16} radius={[0, 4, 4, 0]}>
              {data.map((row, index) => <Cell key={index} fill={row.teamColor} stroke={row.teamInk} />)}
              <LabelList dataKey="value" position="right" formatter={value => Number(value).toFixed(1)} style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}