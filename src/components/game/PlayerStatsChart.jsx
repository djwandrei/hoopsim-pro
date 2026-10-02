import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { paletteForTeam, mix } from '@/components/djhc/basketballPalettes';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { teamThemeVars } from '@/components/game/matchupTheme';

const tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const color = row?.teamInk || 'var(--myna-accent)';
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="mt-1 font-mono" style={{ color }}>PTS {Number(row?.pts).toFixed(1)}</p>
      <p className="font-mono" style={{ color }}>REB {Number(row?.reb).toFixed(1)}</p>
      <p className="font-mono" style={{ color }}>AST {Number(row?.ast).toFixed(1)}</p>
    </div>
  );
};

const lastName = name => (name || '').split(' ').slice(-1)[0] || '—';

// Top scorers from both rosters — bars take the player's team color, with
// the official secondary for rebounds and a palette blend for assists.
export default function PlayerStatsChart({ teamA, teamB }) {
  const { mode = 'dark' } = useCourtTheme() || {};
  const { data, pA, pB } = useMemo(() => {
    const combined = [
      ...(teamA.roster || []).map(player => ({ ...player, team: teamA.code })),
      ...(teamB.roster || []).map(player => ({ ...player, team: teamB.code })),
    ].sort((x, y) => y.pts - x.pts).slice(0, 10);
    return {
      data: combined.map(player => ({ name: lastName(player.name), teamColor: paletteForTeam(player.team).primary, teamSecondary: paletteForTeam(player.team).highlight, teamInk: teamThemeVars(player.team, mode)['--team-ink'], pts: player.pts, reb: player.reb, ast: player.ast })),
      pA: paletteForTeam(teamA.code),
      pB: paletteForTeam(teamB.code),
    };
  }, [teamA, teamB, mode]);
  return (
    <section className="myna-panel p-4" aria-label="Player stats">
      <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">PLAYER STATS</p>
      <h3 className="myna-display mt-1 text-2xl">TOP SCORERS ON THE BOARD</h3>
      <p className="mt-1 text-xs myna-muted">The 10 highest scorers across both rosters, per game — each player's bars carry their team's color.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] myna-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: pA.primary }} />{teamA.code} players</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: pB.primary }} />{teamB.code} players</span>
        <span>· PTS = primary · REB = secondary · AST = blend</span>
      </div>
      <div className="mt-2 h-80" role="img" aria-label="Bar chart of top scorers across both teams, colored by team">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
            <CartesianGrid stroke="hsl(var(--border) / .3)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} interval={0} angle={-45} textAnchor="end" height={58} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
            <Tooltip content={tip} cursor={{ fill: 'hsl(var(--court-accent) / .08)' }} />
            <Bar dataKey="pts" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {data.map((row, index) => <Cell key={index} fill={row.teamColor} stroke={row.teamInk} />)}
            </Bar>
            <Bar dataKey="reb" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {data.map((row, index) => <Cell key={index} fill={row.teamSecondary} />)}
            </Bar>
            <Bar dataKey="ast" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {data.map((row, index) => <Cell key={index} fill={mix(row.teamColor, row.teamSecondary, .5)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}